import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";
import {
  applyStompBounce,
  createGhostState,
  createPatrolEnemy,
  GhostState,
  isStompFromAbove,
  updateGhostPatrol,
} from "../gameplay/EnemyBehaviors";
import { createPlayerInput, isJumpPressed, JUMP_VELOCITY, PlayerInputKeys, updatePlayerMovement } from "../gameplay/PlayerController";
import { ParallaxBackground } from "../gameplay/ParallaxBackground";
import {
  canDoubleJump,
  collectCoin,
  collectFeather,
  collectHeart,
  collectShield,
  collectSpeed,
  createPlayerStats,
  isInvincible,
  PlayerStats,
  registerHit,
  resetDoubleJump,
  speedMultiplierAt,
  useDoubleJump,
} from "../gameplay/PlayerStats";
import { TouchControls } from "../gameplay/TouchControls";
import { applyWizardTexture, createWizardAnimState, updateWizardAnimation, WizardAnimState } from "../gameplay/wizardAnimation";
import { buildRenderGrid, GROUND_FRAME_BOUNCE } from "../level/groundAutotile";
import { EntityType, LevelData } from "../level/LevelSchema";
import { groundTilesetKey, THEMES } from "../level/themes";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { StorageAdapter } from "../persistence/StorageAdapter";

const BOUNCE_VELOCITY_Y = -650;

/** Every item brush's textureKey equals its EntityType (see Palette.ts), so
 * spawning just needs the type list — no separate texture lookup like
 * ENEMY_DEFS needs. Items are collected via a static overlap zone, same
 * pattern as the goal portal below. */
const ITEM_TYPES: EntityType[] = ["item-coin", "item-heart", "item-speed", "item-feather", "item-shield"];

/** One entry per placeable enemy type — see the enemyDefs loop in create().
 * All three share the exact same patrol/bob movement (EnemyBehaviors.ts);
 * only the texture and whether a from-above hit stomps it (vs. costing the
 * player no matter how it's touched) differ. */
const ENEMY_DEFS: { type: EntityType; textureKey: string; stompable: boolean }[] = [
  { type: "enemy-ghost", textureKey: "enemy-ghost-pillow", stompable: true },
  { type: "enemy-bat", textureKey: "enemy-bat", stompable: true },
  { type: "enemy-spike", textureKey: "enemy-spike-crawler", stompable: false },
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
  private parallax!: ParallaxBackground;
  private hud!: Phaser.GameObjects.Text;

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
    this.cameras.main.setBackgroundColor(THEMES[this.level.theme].background);
    this.parallax = new ParallaxBackground(this, this.level.theme);

    const tilesetKey = groundTilesetKey(this.level.theme);
    const map = this.make.tilemap({
      data: buildRenderGrid(this.level.layers.ground),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tileset = map.addTilesetImage(tilesetKey, tilesetKey, TILE_SIZE, TILE_SIZE, 0, 0)!;
    this.groundLayer = map.createLayer(0, tileset, 0, 0)!;
    this.groundLayer.setCollisionByExclusion([-1]);

    const spawn = this.level.entities.find((e) => e.type === "player-spawn");
    const spawnX = spawn ? spawn.x * TILE_SIZE + TILE_SIZE / 2 : TILE_SIZE;
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
      const goalX = goal.x * TILE_SIZE + TILE_SIZE / 2;
      const goalY = goal.y * TILE_SIZE + TILE_SIZE / 2;
      const portal = this.add.image(goalX, goalY, "goal-portal").setDepth(5);
      this.tweens.add({
        targets: portal,
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
      const x = entity.x * TILE_SIZE + TILE_SIZE / 2;
      const y = entity.y * TILE_SIZE + TILE_SIZE / 2;
      // textureKey === entityType for every item brush (see Palette.ts).
      const icon = this.add.image(x, y, type).setDepth(5);
      this.tweens.add({ targets: icon, y: y - 6, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
      const zone = this.add.zone(x, y, TILE_SIZE, TILE_SIZE);
      this.physics.add.existing(zone, true);
      this.physics.add.overlap(this.player, zone, () => this.collectItem(type, icon, zone));
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
    this.parallax.update(this.player.x);

    for (const enemy of this.enemies) {
      updateGhostPatrol(enemy.sprite, enemy.state, time);
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
   * GROUND_FRAME_BOUNCE) — solid collision is already automatic via
   * setCollisionByExclusion, this only adds the extra launch-upward effect
   * on top of it. `body.blocked.down` restricts it to landing on the pad's
   * top face, so bumping one from the side doesn't launch the player. */
  private onGroundCollide(tile: Phaser.Tilemaps.Tile): void {
    if (tile.index !== GROUND_FRAME_BOUNCE) return;
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
      default:
        return;
    }
    icon.destroy();
    zone.destroy();
    this.updateHud();
  }

  private updateHud(): void {
    const hearts = "♥".repeat(this.stats.extraHits);
    this.hud.setText(`Score: ${this.stats.score}${hearts ? "  " + hearts : ""}`);
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
