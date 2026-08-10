import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";
import {
  applyStompBounce,
  createGhostEnemy,
  createGhostState,
  GhostState,
  isStompFromAbove,
  updateGhostPatrol,
} from "../gameplay/EnemyBehaviors";
import { createPlayerInput, PlayerInputKeys, updatePlayerMovement } from "../gameplay/PlayerController";
import { TouchControls } from "../gameplay/TouchControls";
import { applyWizardTexture, createWizardAnimState, updateWizardAnimation, WizardAnimState } from "../gameplay/wizardAnimation";
import { buildRenderGrid } from "../level/groundAutotile";
import { LevelData } from "../level/LevelSchema";
import { groundTilesetKey, THEMES } from "../level/themes";
import { LocalStorageAdapter } from "../persistence/LocalStorageAdapter";
import { StorageAdapter } from "../persistence/StorageAdapter";

/** Present only when this level was launched from a World (WorldBrowserScene
 * "Play") rather than a standalone Test Play — see onWin/nextLevel. */
interface WorldPlayContext {
  levelIds: string[];
  index: number;
}

interface PlaySceneData {
  level: LevelData;
  world?: WorldPlayContext;
}

export class PlayScene extends Phaser.Scene {
  private level!: LevelData;
  private world?: WorldPlayContext;
  private levelStorage: StorageAdapter = new LocalStorageAdapter();
  private player!: Phaser.Physics.Arcade.Sprite;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private input$!: PlayerInputKeys;
  private touch!: TouchControls;
  private wizardAnim: WizardAnimState = createWizardAnimState();
  private ghost?: Phaser.Physics.Arcade.Sprite;
  private ghostState?: GhostState;
  private outcome: "playing" | "won" | "lost" = "playing";
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private restartButton!: Phaser.GameObjects.Text;
  private nextButton!: Phaser.GameObjects.Text;

  constructor() {
    super("Play");
  }

  init(data: PlaySceneData): void {
    this.level = data.level;
    this.world = data.world;
    this.outcome = "playing";
    this.wizardAnim = createWizardAnimState();
    this.ghost = undefined;
    this.ghostState = undefined;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(THEMES[this.level.theme].background);

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
    this.physics.add.collider(this.player, this.groundLayer);

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

    const ghostEntity = this.level.entities.find((e) => e.type === "enemy-ghost");
    if (ghostEntity) {
      this.ghost = createGhostEnemy(this, ghostEntity.x, ghostEntity.y);
      this.ghostState = createGhostState(this.ghost);
      this.physics.add.overlap(this.player, this.ghost, () => this.onPlayerGhostOverlap());
    }

    this.input$ = createPlayerInput(this);
    this.touch = new TouchControls(this);

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
      .text(8, 8, this.world ? "← Back to Worlds (Esc)" : "← Back to Editor (Esc)", {
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

    updatePlayerMovement(this.player, this.input$, this.touch.get());
    updateWizardAnimation(this.player, this.wizardAnim, delta);

    if (this.ghost && this.ghostState) {
      updateGhostPatrol(this.ghost, this.ghostState, time);
    }

    if (this.player.y > this.level.height * TILE_SIZE + 200) {
      this.onLose();
    }
  }

  private onPlayerGhostOverlap(): void {
    if (this.outcome !== "playing" || !this.ghost) return;
    if (isStompFromAbove(this.player, this.ghost)) {
      this.ghost.destroy();
      this.ghost = undefined;
      this.ghostState = undefined;
      applyStompBounce(this.player);
    } else {
      this.onLose();
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
      this.hint.setText("Press R to play again, or Esc for the editor").setVisible(true);
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
    this.hint.setText("Press R to try again, or Esc for the editor").setVisible(true);
    this.restartButton.setVisible(true);
  }

  private restart(): void {
    this.scene.restart({ level: this.level, world: this.world });
  }

  private backToEditor(): void {
    this.scene.stop();
    if (this.world) this.scene.start("WorldBrowser");
    else this.scene.resume("Editor");
  }
}
