import Phaser from "phaser";
import { VolumeControl } from "../audio/VolumeControl";
import { GRID_ORIGIN_X, GRID_ORIGIN_Y, TILE_SIZE } from "../config/gameConfig";
import {
  applyDefaultSkinSize,
  applyEnemySize,
  applyStompBounce,
  createGhostState,
  createPatrolEnemy,
  GhostState,
  isStompFromAbove,
  updateGhostPatrol,
} from "../gameplay/EnemyBehaviors";
import { createPlayerInput, isJumpPressed, JUMP_VELOCITY, PlayerInputKeys, updatePlayerMovement } from "../gameplay/PlayerController";
import { resolveBackgroundTextureKey } from "../gameplay/backgroundLoader";
import { resolveLevelMusicKey } from "../gameplay/musicLoader";
import { StaticBackground } from "../gameplay/StaticBackground";
import {
  canDoubleJump,
  collectCoin,
  collectFeather,
  collectHeart,
  collectKey,
  collectShield,
  collectSpeed,
  createPlayerStats,
  isInvincible,
  openChest,
  PlayerStats,
  registerHit,
  resetDoubleJump,
  speedMultiplierAt,
  useDoubleJump,
} from "../gameplay/PlayerStats";
import { TouchControls } from "../gameplay/TouchControls";
import { applyWizardTexture, createWizardAnimState, updateWizardAnimation, WizardAnimState } from "../gameplay/wizardAnimation";
import { BOUNCE_FRAMES, buildRenderGrid, HAZARD_FRAMES, WATER_FRAMES } from "../level/groundAutotile";
import { CANVAS_BACKGROUND_COLOR, GROUND_SKINS, groundTilesetKey } from "../level/groundSkins";
import { DEFAULT_ENEMY_SIZE, EnemySize, EntityType, LevelData } from "../level/LevelSchema";
import { getLevelStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { resolveSkinTextureKeys } from "../skins/skinLoader";

const BOUNCE_VELOCITY_Y = -650;
// Swimming (see the water check in update()) sets vertical velocity
// directly every frame rather than fighting gravity, so these aren't
// forces — SWIM_UP_VELOCITY while jump/up is held, SWIM_SINK_VELOCITY
// otherwise, both far gentler than JUMP_VELOCITY/gravity so movement in
// water reads as buoyant control rather than a normal fall/jump.
const SWIM_UP_VELOCITY = -160;
const SWIM_SINK_VELOCITY = 80;
// Applied on top of speedMultiplierAt's own Speed Potion multiplier (see
// update()) — water slows horizontal movement the same way it would in
// any platformer, without needing a second buff-stacking system.
const SWIM_SPEED_MULTIPLIER = 0.6;

/** Every item brush's textureKey equals its EntityType (see Palette.ts), so
 * spawning just needs the type list — no separate texture lookup like
 * ENEMY_DEFS needs. Items are collected via a static overlap zone, same
 * pattern as the goal below. */
const ITEM_TYPES: EntityType[] = ["item-coin", "item-heart", "item-speed", "item-feather", "item-shield", "item-key"];

/** Purely cosmetic — spawned as plain static images with no collision or
 * overlap logic (unlike every other entity list here), so a level looks
 * the same in Play as it does in the editor with zero gameplay effect. */
const DECOR_TYPES: EntityType[] = [
  "decor-bush",
  "decor-tree",
  "decor-cactus",
  "decor-lamp",
  "decor-cloud",
  "decor-snowman",
  "decor-sprout",
  "decor-mushroom",
  "decor-rocks",
  "decor-bat",
];

/** One entry per placeable enemy type — see the enemyDefs loop in create().
 * All four share the exact same patrol/bob movement (EnemyBehaviors.ts);
 * only the texture and whether a from-above hit stomps it (vs. costing the
 * player no matter how it's touched) differ. */
const ENEMY_DEFS: { type: EntityType; textureKey: string; stompable: boolean }[] = [
  { type: "enemy-ghost", textureKey: "enemy-ghost-pillow", stompable: true },
  { type: "enemy-bat", textureKey: "enemy-bat", stompable: true },
  { type: "enemy-spike", textureKey: "enemy-spike-crawler", stompable: false },
  { type: "enemy-golem", textureKey: "enemy-golem", stompable: true },
];

interface ActiveEnemy {
  sprite: Phaser.Physics.Arcade.Sprite;
  state: GhostState;
  stompable: boolean;
}

/** Present only when this level was launched from a World (WorldBrowserScene
 * "Play") rather than a standalone Test Play — see onWin/nextLevel. */
interface WorldPlayContext {
  levelIds: string[];
  index: number;
}

interface PlaySceneData {
  level: LevelData;
  world?: WorldPlayContext;
  /** Scene key to return to on Esc/loss when there's no `world` context —
   * e.g. "Templates" when launched from TemplateBrowserScene's Play button
   * (a plain scene.start, same as Worlds, not a launch/pause of Editor).
   * Defaults to resuming the paused Editor scene, the original Test Play
   * behavior, when omitted. */
  returnScene?: string;
}

export class PlayScene extends Phaser.Scene {
  private level!: LevelData;
  private world?: WorldPlayContext;
  private returnScene?: string;
  private levelStorage: StorageAdapter = getLevelStorage();
  private player!: Phaser.Physics.Arcade.Sprite;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private input$!: PlayerInputKeys;
  private touch!: TouchControls;
  private wizardAnim: WizardAnimState = createWizardAnimState();
  private enemies: ActiveEnemy[] = [];
  private outcome: "playing" | "won" | "lost" = "playing";
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;
  private nextButton!: Phaser.GameObjects.Text;
  private stats: PlayerStats = createPlayerStats();
  private jumpWasDown = false;
  // Optional (not `!`) — a "custom" background's texture is registered
  // async (see backgroundLoader.ts), so update() must not assume this
  // exists on the very first frame or two.
  private background?: StaticBackground;
  // Optional — most levels have no uploaded music at all (see
  // musicLoader.ts), and even when one does, loading it is async.
  private music?: Phaser.Sound.BaseSound;
  private hud!: Phaser.GameObjects.Text;
  private trophy!: Phaser.GameObjects.Image;
  // Every goal/chest/enemy/item/decor sprite spawned below, grouped by
  // its Palette brush id (equal to its EntityType for every one of these
  // — only Spawn's id/type differ, "spawn"/"player-spawn", and Spawn has
  // no sprite here at all) — see the resolveSkinTextureKeys call at the
  // end of create(), which patches in any custom skin via setTexture once
  // resolved. Populated by trackSprite as each is created.
  private spritesByBrushId = new Map<string, (Phaser.GameObjects.Image | Phaser.Physics.Arcade.Sprite)[]>();

  private trackSprite(brushId: string, sprite: Phaser.GameObjects.Image | Phaser.Physics.Arcade.Sprite): void {
    const list = this.spritesByBrushId.get(brushId) ?? [];
    list.push(sprite);
    this.spritesByBrushId.set(brushId, list);
  }

  constructor() {
    super("Play");
  }

  init(data: PlaySceneData): void {
    this.level = data.level;
    this.world = data.world;
    this.returnScene = data.returnScene;
    this.outcome = "playing";
    this.wizardAnim = createWizardAnimState();
    this.enemies = [];
    this.stats = createPlayerStats();
    this.jumpWasDown = false;
    // Phaser reuses this same PlayScene instance across every Test Play/
    // World/Template run rather than constructing a fresh one each time —
    // create() reruns, but a plain class-field initializer like
    // `= new Map()` only ever runs once, at the very first construction.
    // Without clearing it here, a second Play session would append this
    // run's freshly-created sprites onto the *previous* run's list rather
    // than starting clean — and since scene.stop() (leaving via Esc/win/
    // lose) destroys every sprite from the run before it, that stale list
    // ends up mixing live sprites with already-destroyed ones. Found via
    // exactly that: a real crash ("Cannot read properties of undefined
    // (reading 'sys')" inside setTexture) on a *second* Test Play of a
    // level with a skinned enemy — the skin-resolve pass below iterated
    // the first run's now-destroyed sprite right alongside the new one.
    this.spritesByBrushId = new Map();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CANVAS_BACKGROUND_COLOR);
    // Bounded to the level's actual width, not the (often wider, to fit the
    // editor's side panels) canvas — see StaticBackground's docstring.
    // Async since a "custom" background's texture isn't preloaded by
    // BootScene like every built-in one is — see backgroundLoader.ts.
    void resolveBackgroundTextureKey(this, this.level).then((textureKey) => {
      this.background = new StaticBackground(this, this.level.width * TILE_SIZE, textureKey);
    });

    // A level with no uploaded music (the common case — there's no
    // built-in fallback track the way there is for backgrounds) resolves
    // to null and this is simply a no-op.
    void resolveLevelMusicKey(this, this.level).then((musicKey) => {
      if (!musicKey) return;
      this.music = this.sound.add(musicKey, { loop: true });
      this.music.play();
    });
    // Sound objects aren't scene-scoped in Phaser (scene.sound is the
    // game's shared SoundManager), so without this explicit stop+destroy
    // a level's music would keep playing after Esc/win/lose returns to
    // the editor or another level starts.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.music?.stop();
      this.music?.destroy();
    });

    // One Tileset per ground skin, each claiming its own 6-wide gid range
    // (grass 0-5, desert 6-11, castle 12-17, snow 18-23 — see
    // groundAutotile.ts) so a level can freely mix all four skins' ground/
    // brick/bounce/hazard blocks on one layer instead of being locked to
    // whichever one tileset a level-wide theme used to pick.
    const map = this.make.tilemap({
      data: buildRenderGrid(this.level.layers.ground),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tilesets = GROUND_SKINS.map((skin, i) => {
      const key = groundTilesetKey(skin);
      return map.addTilesetImage(key, key, TILE_SIZE, TILE_SIZE, 0, 0, i * 6)!;
    });
    this.groundLayer = map.createLayer(0, tilesets, GRID_ORIGIN_X, GRID_ORIGIN_Y)!;
    // Lava isn't solid — standing in it is an instant hazard (see the
    // per-frame check in update()), not a floor to stand on. Water isn't
    // solid either, but for the opposite reason: it's swimmable, not a
    // hazard at all (see the swim handling in update()) — excluded here
    // via its own WATER_FRAMES set now that it no longer shares
    // HAZARD_FRAMES with lava.
    this.groundLayer.setCollisionByExclusion([-1, ...WATER_FRAMES, ...HAZARD_FRAMES]);

    const spawn = this.level.entities.find((e) => e.type === "player-spawn");
    const spawnX = spawn ? GRID_ORIGIN_X + spawn.x * TILE_SIZE + TILE_SIZE / 2 : GRID_ORIGIN_X + TILE_SIZE;
    // Bottom-anchored (see below), so Y is where the feet should land — the
    // top of the ground tile one row below the spawn marker's tile.
    const spawnY = GRID_ORIGIN_Y + (spawn ? (spawn.y + 1) * TILE_SIZE : TILE_SIZE);

    // Left/right only (checkUp/checkDown false below) — the player and
    // enemies must not walk/patrol past where the level's ground and
    // background actually end (see StaticBackground's mask, sized to
    // exactly this same `level.width * TILE_SIZE`), but jumping above the
    // top or falling past the bottom are both already meaningful on their
    // own (a normal jump arc, and the fall-off-the-level loss check below)
    // and must stay unobstructed. y/height are irrelevant with both checks
    // off; kept generous only so that stays true regardless.
    const levelLeftX = GRID_ORIGIN_X;
    const levelRightX = GRID_ORIGIN_X + this.level.width * TILE_SIZE;
    this.physics.world.setBounds(levelLeftX, -100000, levelRightX - levelLeftX, 200000, true, true, false, false);

    this.player = this.physics.add.sprite(spawnX, spawnY, "wizard-idle");
    this.player.setOrigin(0.5, 1);
    applyWizardTexture(this.player, "wizard-idle");
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this.groundLayer, (_player, tile) => this.onGroundCollide(tile as Phaser.Tilemaps.Tile));

    const goal = this.level.entities.find((e) => e.type === "goal");
    if (goal) {
      const goalX = GRID_ORIGIN_X + goal.x * TILE_SIZE + TILE_SIZE / 2;
      const goalY = GRID_ORIGIN_Y + goal.y * TILE_SIZE + TILE_SIZE / 2;
      const goalSprite = this.add.image(goalX, goalY, "goal-portal").setDepth(5);
      this.trackSprite("goal", goalSprite);
      this.tweens.add({
        targets: goalSprite,
        scale: { from: 1, to: 1.08 },
        yoyo: true,
        repeat: -1,
        duration: 900,
        ease: "Sine.easeInOut",
      });
      const goalZone = this.add.zone(goalX, goalY, TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(goalZone, true);
      this.physics.add.overlap(this.player, goalZone, () => this.onWin());
    }

    // Enemies/Items/Decor have no per-level instance limit (see Palette.ts),
    // so every matching entity spawns, not just the first — unlike the
    // Markers below (player-spawn/goal/chest), which EntityPlacer still
    // keeps singleton and so are looked up with `.find`.
    for (const def of ENEMY_DEFS) {
      for (const entity of this.level.entities.filter((e) => e.type === def.type)) {
        const size = entity.size ?? DEFAULT_ENEMY_SIZE;
        const sprite = createPatrolEnemy(this, entity.x, entity.y, def.textureKey);
        applyEnemySize(sprite, def.type, size);
        // Stashed on the sprite itself (Phaser's own GameObject data store)
        // rather than a parallel map — the skin-resolve pass below needs
        // to know each individual sprite's own size again after a skin
        // swap, and spritesByBrushId only groups by brush id/type, losing
        // which instance had which size once two same-type enemies could
        // differ (this feature's whole point).
        sprite.setData("enemySize", size);
        this.trackSprite(def.type, sprite);
        // Clamped to the level's own left/right edges (not just its spawn
        // point) — see createGhostState's docstring — so an enemy placed
        // near an edge patrols back in, the same edge the player's own
        // setCollideWorldBounds above is held to.
        const state = createGhostState(sprite, levelLeftX, levelRightX);
        this.enemies.push({ sprite, state, stompable: def.stompable });
        this.physics.add.overlap(this.player, sprite, () => this.onPlayerEnemyOverlap(sprite, def.stompable));
      }
    }

    for (const type of ITEM_TYPES) {
      for (const entity of this.level.entities.filter((e) => e.type === type)) {
        const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_ORIGIN_Y + entity.y * TILE_SIZE + TILE_SIZE / 2;
        // textureKey === entityType for every item brush (see Palette.ts).
        const icon = this.add.image(x, y, type).setDepth(5);
        this.trackSprite(type, icon);
        this.tweens.add({ targets: icon, y: y - 6, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
        const zone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
        this.physics.add.existing(zone, true);
        this.physics.add.overlap(this.player, zone, () => this.collectItem(type, icon, zone));
      }
    }

    const chestEntity = this.level.entities.find((e) => e.type === "chest");
    if (chestEntity) {
      const x = GRID_ORIGIN_X + chestEntity.x * TILE_SIZE + TILE_SIZE / 2;
      const y = GRID_ORIGIN_Y + chestEntity.y * TILE_SIZE + TILE_SIZE / 2;
      const chestSprite = this.add.image(x, y, "chest").setDepth(5);
      this.trackSprite("chest", chestSprite);
      const chestZone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(chestZone, true);
      this.physics.add.overlap(this.player, chestZone, () => this.tryOpenChest(chestSprite, chestZone));
    }

    // Decoration entities (see DECOR_TYPES) — plain static images, no
    // physics body, no overlap: purely visual, same as they look in the
    // editor. Like Enemies/Items above, every placed instance spawns.
    for (const type of DECOR_TYPES) {
      for (const entity of this.level.entities.filter((e) => e.type === type)) {
        const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
        const y = GRID_ORIGIN_Y + entity.y * TILE_SIZE + TILE_SIZE / 2;
        this.trackSprite(type, this.add.image(x, y, type).setDepth(3));
      }
    }

    // Custom skins (see "Custom skins" under Art) apply to gameplay too,
    // not just the editor — same async "pop in a moment later" tolerance
    // as the background/music resolves above; every sprite tracked via
    // trackSprite above has its texture swapped in place once this
    // resolves. Also re-normalizes display size (and, for enemies, the
    // physics body) after the swap — a skin can be uploaded at any
    // resolution up to skinUpload.ts's 128px cap, and setTexture alone
    // doesn't touch a sprite's current scale, so without this a skinned
    // enemy/item/decor/goal would render at its *uploaded* image's own
    // native size instead of a tile-appropriate one (a real bug: found
    // while verifying skins actually apply correctly in Test Play, not
    // just in the editor's own palette/grid preview).
    void resolveSkinTextureKeys(this).then((skinTextureKeys) => {
      for (const [brushId, sprites] of this.spritesByBrushId) {
        const key = skinTextureKeys.get(brushId);
        if (!key) continue;
        for (const sprite of sprites) {
          sprite.setTexture(key);
          const enemySize = sprite.getData("enemySize") as EnemySize | undefined;
          if (enemySize) applyEnemySize(sprite as Phaser.Physics.Arcade.Sprite, brushId as EntityType, enemySize);
          else applyDefaultSkinSize(sprite);
        }
      }
    });

    this.input$ = createPlayerInput(this);
    this.touch = new TouchControls(this);

    this.hud = this.add
      .text(this.scale.width - 12, 8, "", {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#000000aa",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(1, 0)
      .setDepth(30)
      .setScrollFactor(0);
    this.updateHud();

    this.trophy = this.add
      .image(this.scale.width / 2, this.scale.height / 2 - 62, "trophy")
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.banner = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 20, "", {
        fontSize: "32px",
        color: "#ffffff",
        backgroundColor: "#000000cc",
        padding: { x: 16, y: 10 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    this.hint = this.add
      .text(this.scale.width / 2, this.scale.height / 2 + 30, "", {
        fontSize: "14px",
        color: "#eeeeee",
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setVisible(false);

    // Tappable equivalents of the R/N/Esc hints above — the hint text is
    // keyboard-only wording, but there's no keyboard on a phone, so the win
    // and lose screens need real buttons too, not just a label.
    this.restartButton = this.makeOverlayButton(this.scale.width / 2 - 74, this.scale.height / 2 + 66, "Restart", () =>
      this.restart(),
    );
    this.nextButton = this.makeOverlayButton(this.scale.width / 2 + 74, this.scale.height / 2 + 66, "Next Level", () =>
      void this.nextLevel(),
    );

    const backLabel = this.add
      .text(8, 8, `← Back to ${this.backDestinationLabel()} (Esc)`, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 8, y: 6 },
      })
      .setDepth(30)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    backLabel.on("pointerdown", () => this.backToEditor());

    this.input.keyboard?.on("keydown-ESC", () => this.backToEditor());
    this.input.keyboard?.on("keydown-R", () => this.restart());
    this.input.keyboard?.on("keydown-N", () => void this.nextLevel());

    new VolumeControl(this, this.scale.width / 2 - 90, 20, 180, 30);
  }

  /** "Editor"/"Worlds"/"Templates" for the top-left back button; see
   * backDestinationPhrase for the lowercase, mid-sentence form used in the
   * win/lose hint text. */
  private backDestinationLabel(): string {
    if (this.world) return "Worlds";
    if (this.returnScene === "Templates") return "Templates";
    return "Editor";
  }

  private backDestinationPhrase(): string {
    if (this.world) return "Worlds";
    if (this.returnScene === "Templates") return "Templates";
    return "the editor";
  }

  private makeOverlayButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, label, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    text.on("pointerdown", onClick);
    return text;
  }

  update(time: number, delta: number): void {
    if (this.outcome !== "playing") return;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const touch = this.touch.get();
    const jumpDown = isJumpPressed(this.input$, touch);
    const justPressedJump = jumpDown && !this.jumpWasDown;
    this.jumpWasDown = jumpDown;

    // Submersion is checked at roughly waist height (half a tile above the
    // bottom-anchored player.y — see the sprite's setOrigin(0.5, 1) above)
    // rather than at the feet, so a player merely standing on a submerged
    // floor (body.blocked.down true) doesn't get floaty swim controls —
    // only genuinely swimming through open water does.
    const waistTile = this.groundLayer.getTileAtWorldXY(this.player.x, this.player.y - TILE_SIZE / 2);
    const inWater = !!waistTile && WATER_FRAMES.has(waistTile.index);
    const swimming = inWater && !body.blocked.down;

    if (body.blocked.down) {
      resetDoubleJump(this.stats);
    } else if (swimming) {
      // Direct per-frame vertical control instead of the normal jump/
      // gravity branches below — held jump/up swims up, released gently
      // sinks, matching updatePlayerMovement's own per-frame
      // setVelocityX pattern rather than fighting gravity with a one-off
      // impulse.
      body.setVelocityY(jumpDown ? SWIM_UP_VELOCITY : SWIM_SINK_VELOCITY);
    } else if (justPressedJump && canDoubleJump(this.stats, body.blocked.down)) {
      body.setVelocityY(JUMP_VELOCITY);
      useDoubleJump(this.stats);
    }

    updatePlayerMovement(this.player, this.input$, touch, speedMultiplierAt(this.stats, time) * (swimming ? SWIM_SPEED_MULTIPLIER : 1));
    updateWizardAnimation(this.player, this.wizardAnim, delta);
    this.updateBuffVisuals(time);
    this.background?.update(this.player.x);

    for (const enemy of this.enemies) {
      updateGhostPatrol(enemy.sprite, enemy.state, time);
    }

    // Lava is a hazard, not solid ground (see the collision exclusion in
    // create()) — standing in it costs a hit exactly like a bad enemy
    // touch, debounced the same way via registerHit's grace period so it
    // doesn't drain multiple hearts per frame of continued contact. Water
    // used to be included here too; it's swimmable now (see above) and
    // never damages the player.
    const footTile = this.groundLayer.getTileAtWorldXY(this.player.x, this.player.y - 2);
    if (footTile && HAZARD_FRAMES.has(footTile.index)) {
      this.takeHit();
    }

    // Falling off the level is unconditional instant-loss, unlike a bad
    // enemy/hazard touch — Hearts and Shield don't apply here, since
    // "bounce back and keep playing" doesn't fit falling the way it fits
    // an on-screen hit.
    if (this.player.y > GRID_ORIGIN_Y + this.level.height * TILE_SIZE + 200) {
      this.onLose();
    }
  }

  /** Bounce blocks are just another ground-layer tile (see groundAutotile's
   * BOUNCE_FRAMES, which covers both the shared and castle looks) — solid
   * collision is already automatic via setCollisionByExclusion, this only
   * adds the extra launch-upward effect on top of it. `body.blocked.down`
   * restricts it to landing on the pad's top face, so bumping one from the
   * side doesn't launch the player. */
  private onGroundCollide(tile: Phaser.Tilemaps.Tile): void {
    if (!BOUNCE_FRAMES.has(tile.index)) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!body.blocked.down) return;
    body.setVelocityY(BOUNCE_VELOCITY_Y);
  }

  private onPlayerEnemyOverlap(enemySprite: Phaser.Physics.Arcade.Sprite, stompable: boolean): void {
    if (this.outcome !== "playing") return;
    if (stompable && isStompFromAbove(this.player, enemySprite)) {
      this.enemies = this.enemies.filter((e) => e.sprite !== enemySprite);
      enemySprite.destroy();
      applyStompBounce(this.player);
    } else {
      this.takeHit();
    }
  }

  /** Applies the matching PlayerStats effect for whichever item instance
   * was touched, removes that one sprite and its overlap zone, and
   * refreshes the HUD — a level can have several of the same item type
   * (see Palette.ts), each collected independently. Guarded by
   * `icon.active` since a physics overlap can fire more than once in the
   * same frame pair. */
  private collectItem(type: EntityType, icon: Phaser.GameObjects.Image, zone: Phaser.GameObjects.Zone): void {
    if (!icon.active) return;
    const now = this.time.now;
    switch (type) {
      case "item-coin":
        collectCoin(this.stats);
        break;
      case "item-heart":
        collectHeart(this.stats);
        break;
      case "item-speed":
        collectSpeed(this.stats, now);
        break;
      case "item-feather":
        collectFeather(this.stats);
        break;
      case "item-shield":
        collectShield(this.stats, now);
        break;
      case "item-key":
        collectKey(this.stats);
        break;
      default:
        return;
    }
    icon.destroy();
    zone.destroy();
    this.updateHud();
  }

  /** Chest is a separate one-off entity, not part of ITEM_TYPES/collectItem
   * — unlike a plain item it doesn't always consume itself on touch, only
   * when a Key is actually held (see openChest's docstring), so it needs
   * its own guard against the sprite being destroyed already. */
  private tryOpenChest(sprite: Phaser.GameObjects.Image, zone: Phaser.GameObjects.Zone): void {
    if (!sprite.active) return;
    if (openChest(this.stats) !== "opened") return;
    sprite.destroy();
    zone.destroy();
    this.updateHud();
  }

  private updateHud(): void {
    const hearts = "♥".repeat(this.stats.extraHits);
    const key = this.stats.hasKey ? "  [Key]" : "";
    this.hud.setText(`Score: ${this.stats.score}${hearts ? "  " + hearts : ""}${key}`);
  }

  /** Cyan while a Shield (or the post-hit grace period) makes any bad
   * contact free; yellow while a Speed Potion is active; otherwise no
   * tint. Shield takes priority since it's the stronger effect and the two
   * can't meaningfully be told apart by tint alone. */
  private updateBuffVisuals(now: number): void {
    if (isInvincible(this.stats, now)) {
      this.player.setTint(0x66e0ff);
    } else if (speedMultiplierAt(this.stats, now) > 1) {
      this.player.setTint(0xffe066);
    } else {
      this.player.clearTint();
    }
  }

  /** The single entry point for "player touched something bad" outside of
   * the unconditional fall-off-bottom check — see registerHit's docstring
   * for the invincible/absorbed/fatal decision. */
  private takeHit(): void {
    const result = registerHit(this.stats, this.time.now);
    if (result === "fatal") {
      this.onLose();
    } else if (result === "absorbed") {
      applyStompBounce(this.player);
      this.updateHud();
    }
  }

  private onWin(): void {
    if (this.outcome !== "playing") return;
    this.outcome = "won";
    this.player.setVelocity(0, 0);
    applyWizardTexture(this.player, "wizard-cast");
    this.physics.pause();
    this.trophy.setVisible(true);

    const hasNextLevel = this.world && this.world.index + 1 < this.world.levelIds.length;
    if (hasNextLevel) {
      this.banner.setText("Level Complete!").setVisible(true);
      this.hint.setText("Press N for the next level, R to replay, or Esc for Worlds").setVisible(true);
      this.nextButton.setVisible(true);
    } else if (this.world) {
      this.banner.setText("World Complete!").setVisible(true);
      this.hint.setText("Press R to replay this level, or Esc for Worlds").setVisible(true);
    } else {
      this.banner.setText("You Win!").setVisible(true);
      this.hint.setText(`Press R to play again, or Esc for ${this.backDestinationPhrase()}`).setVisible(true);
    }
    this.restartButton.setVisible(true);
  }

  /** Only reachable once `onWin` has confirmed a next level exists (see the
   * hint text) — a stray N press elsewhere in the world flow, or outside
   * one entirely, is a no-op via the outcome/world guards below. */
  private async nextLevel(): Promise<void> {
    if (this.outcome !== "won" || !this.world) return;
    const nextIndex = this.world.index + 1;
    if (nextIndex >= this.world.levelIds.length) return;

    const nextLevel = await this.levelStorage.load(this.world.levelIds[nextIndex]);
    if (!nextLevel) {
      // The next level was deleted from My Levels after this world was
      // built — end the world here rather than crashing.
      this.banner.setText("World Complete!").setVisible(true);
      this.hint.setText("(the next level was deleted) Press Esc for Worlds").setVisible(true);
      this.nextButton.setVisible(false);
      this.world = undefined;
      return;
    }
    this.scene.start("Play", { level: nextLevel, world: { levelIds: this.world.levelIds, index: nextIndex } });
  }

  private onLose(): void {
    if (this.outcome !== "playing") return;
    this.outcome = "lost";
    this.player.setVelocity(0, 0);
    this.physics.pause();
    this.banner.setText("You Lose").setVisible(true);
    this.hint.setText(`Press R to try again, or Esc for ${this.backDestinationPhrase()}`).setVisible(true);
    this.restartButton.setVisible(true);
  }

  private restart(): void {
    this.scene.restart({ level: this.level, world: this.world, returnScene: this.returnScene });
  }

  private backToEditor(): void {
    this.scene.stop();
    if (this.world) this.scene.start("WorldBrowser");
    else if (this.returnScene) this.scene.start(this.returnScene);
    else this.scene.resume("Editor");
  }
}
