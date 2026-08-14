import Phaser from "phaser";
import { GRID_ORIGIN_X, TILE_SIZE } from "../config/gameConfig";
import {
  applyStompBounce,
  createGhostState,
  createPatrolEnemy,
  GhostState,
  isStompFromAbove,
  updateGhostPatrol,
} from "../gameplay/EnemyBehaviors";
import { createPlayerInput, isJumpPressed, JUMP_VELOCITY, PlayerInputKeys, updatePlayerMovement } from "../gameplay/PlayerController";
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
import { BOUNCE_FRAMES, buildRenderGrid, HAZARD_FRAMES } from "../level/groundAutotile";
import { CANVAS_BACKGROUND_COLOR, GROUND_SKINS, groundTilesetKey } from "../level/groundSkins";
import { EntityType, LevelData } from "../level/LevelSchema";
import { resolveStaticBackground, staticBackgroundDef } from "../level/staticBackgrounds";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { StorageAdapter } from "../persistence/StorageAdapter";

const BOUNCE_VELOCITY_Y = -650;

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
  private levelStorage: StorageAdapter = new LocalStorageAdapter();
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
  private background!: StaticBackground;
  private hud!: Phaser.GameObjects.Text;
  private trophy!: Phaser.GameObjects.Image;

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
  }

  create(): void {
    this.cameras.main.setBackgroundColor(CANVAS_BACKGROUND_COLOR);
    // Bounded to the level's actual width, not the (often wider, to fit the
    // editor toolbar) canvas — see StaticBackground's docstring.
    const backgroundTextureKey = staticBackgroundDef(resolveStaticBackground(this.level)).textureKey;
    this.background = new StaticBackground(this, this.level.width * TILE_SIZE, backgroundTextureKey);

    // One Tileset per ground skin, each claiming its own 5-wide gid range
    // (grass 0-4, desert 5-9, castle 10-14, snow 15-19 — see
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
      return map.addTilesetImage(key, key, TILE_SIZE, TILE_SIZE, 0, 0, i * 5)!;
    });
    this.groundLayer = map.createLayer(0, tilesets, GRID_ORIGIN_X, 0)!;
    // Water/Lava aren't solid — standing in either is a hazard (see the
    // per-frame check in update()), not a floor to stand on.
    this.groundLayer.setCollisionByExclusion([-1, ...HAZARD_FRAMES]);

    const spawn = this.level.entities.find((e) => e.type === "player-spawn");
    const spawnX = spawn ? GRID_ORIGIN_X + spawn.x * TILE_SIZE + TILE_SIZE / 2 : GRID_ORIGIN_X + TILE_SIZE;
    // Bottom-anchored (see below), so Y is where the feet should land — the
    // top of the ground tile one row below the spawn marker's tile.
    const spawnY = spawn ? (spawn.y + 1) * TILE_SIZE : TILE_SIZE;

    this.player = this.physics.add.sprite(spawnX, spawnY, "wizard-idle");
    this.player.setOrigin(0.5, 1);
    applyWizardTexture(this.player, "wizard-idle");
    this.player.setCollideWorldBounds(false);
    this.physics.add.collider(this.player, this.groundLayer, (_player, tile) => this.onGroundCollide(tile as Phaser.Tilemaps.Tile));

    const goal = this.level.entities.find((e) => e.type === "goal");
    if (goal) {
      const goalX = GRID_ORIGIN_X + goal.x * TILE_SIZE + TILE_SIZE / 2;
      const goalY = goal.y * TILE_SIZE + TILE_SIZE / 2;
      const goalSprite = this.add.image(goalX, goalY, "goal-portal").setDepth(5);
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

    for (const def of ENEMY_DEFS) {
      const entity = this.level.entities.find((e) => e.type === def.type);
      if (!entity) continue;
      const sprite = createPatrolEnemy(this, entity.x, entity.y, def.textureKey);
      const state = createGhostState(sprite);
      this.enemies.push({ sprite, state, stompable: def.stompable });
      this.physics.add.overlap(this.player, sprite, () => this.onPlayerEnemyOverlap(sprite, def.stompable));
    }

    for (const type of ITEM_TYPES) {
      const entity = this.level.entities.find((e) => e.type === type);
      if (!entity) continue;
      const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
      const y = entity.y * TILE_SIZE + TILE_SIZE / 2;
      // textureKey === entityType for every item brush (see Palette.ts).
      const icon = this.add.image(x, y, type).setDepth(5);
      this.tweens.add({ targets: icon, y: y - 6, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
      const zone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(zone, true);
      this.physics.add.overlap(this.player, zone, () => this.collectItem(type, icon, zone));
    }

    const chestEntity = this.level.entities.find((e) => e.type === "chest");
    if (chestEntity) {
      const x = GRID_ORIGIN_X + chestEntity.x * TILE_SIZE + TILE_SIZE / 2;
      const y = chestEntity.y * TILE_SIZE + TILE_SIZE / 2;
      const chestSprite = this.add.image(x, y, "chest").setDepth(5);
      const chestZone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(chestZone, true);
      this.physics.add.overlap(this.player, chestZone, () => this.tryOpenChest(chestSprite, chestZone));
    }

    // Decoration entities (see DECOR_TYPES) — plain static images, no
    // physics body, no overlap: purely visual, same as they look in the
    // editor.
    for (const type of DECOR_TYPES) {
      const entity = this.level.entities.find((e) => e.type === type);
      if (!entity) continue;
      const x = GRID_ORIGIN_X + entity.x * TILE_SIZE + TILE_SIZE / 2;
      const y = entity.y * TILE_SIZE + TILE_SIZE / 2;
      this.add.image(x, y, type).setDepth(3);
    }

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

    if (body.blocked.down) {
      resetDoubleJump(this.stats);
    } else if (justPressedJump && canDoubleJump(this.stats, body.blocked.down)) {
      body.setVelocityY(JUMP_VELOCITY);
      useDoubleJump(this.stats);
    }

    updatePlayerMovement(this.player, this.input$, touch, speedMultiplierAt(this.stats, time));
    updateWizardAnimation(this.player, this.wizardAnim, delta);
    this.updateBuffVisuals(time);
    this.background.update(this.player.x);

    for (const enemy of this.enemies) {
      updateGhostPatrol(enemy.sprite, enemy.state, time);
    }

    // Water/Lava are a hazard, not solid ground (see the collision
    // exclusion in create()) — standing in either costs a hit exactly like
    // a bad enemy touch, debounced the same way via registerHit's grace
    // period so it doesn't drain multiple hearts per frame of continued
    // contact.
    const footTile = this.groundLayer.getTileAtWorldXY(this.player.x, this.player.y - 2);
    if (footTile && HAZARD_FRAMES.has(footTile.index)) {
      this.takeHit();
    }

    // Falling off the level is unconditional instant-loss, unlike a bad
    // enemy/hazard touch — Hearts and Shield don't apply here, since
    // "bounce back and keep playing" doesn't fit falling the way it fits
    // an on-screen hit.
    if (this.player.y > this.level.height * TILE_SIZE + 200) {
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

  /** One-per-type item pickup (see Palette.ts's docstring on that scope
   * cut) — applies the matching PlayerStats effect, removes the sprite and
   * its overlap zone, and refreshes the HUD. Guarded by `icon.active` since
   * a physics overlap can fire more than once in the same frame pair. */
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
