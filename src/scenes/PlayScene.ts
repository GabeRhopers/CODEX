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
import { applyWizardTexture, createWizardAnimState, updateWizardAnimation, WizardAnimState } from "../gameplay/wizardAnimation";
import { LevelData } from "../level/LevelSchema";

interface PlaySceneData {
  level: LevelData;
}

export class PlayScene extends Phaser.Scene {
  private level!: LevelData;
  private player!: Phaser.Physics.Arcade.Sprite;
  private groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private input$!: PlayerInputKeys;
  private wizardAnim: WizardAnimState = createWizardAnimState();
  private ghost?: Phaser.Physics.Arcade.Sprite;
  private ghostState?: GhostState;
  private outcome: "playing" | "won" | "lost" = "playing";
  private banner!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;

  constructor() {
    super("Play");
  }

  init(data: PlaySceneData): void {
    this.level = data.level;
    this.outcome = "playing";
    this.wizardAnim = createWizardAnimState();
    this.ghost = undefined;
    this.ghostState = undefined;
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#1a1a2e");

    const map = this.make.tilemap({
      data: this.level.layers.ground,
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tileset = map.addTilesetImage("tile-ground", "tile-ground", TILE_SIZE, TILE_SIZE, 0, 0)!;
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

    const backLabel = this.add
      .text(8, 8, "← Back to Editor (Esc)", {
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
  }

  update(time: number, delta: number): void {
    if (this.outcome !== "playing") return;

    updatePlayerMovement(this.player, this.input$);
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
    this.banner.setText("You Win!").setVisible(true);
    this.hint.setText("Press R to play again, or Esc for the editor").setVisible(true);
  }

  private onLose(): void {
    if (this.outcome !== "playing") return;
    this.outcome = "lost";
    this.player.setVelocity(0, 0);
    this.physics.pause();
    this.banner.setText("You Lose").setVisible(true);
    this.hint.setText("Press R to try again, or Esc for the editor").setVisible(true);
  }

  private restart(): void {
    this.scene.restart({ level: this.level });
  }

  private backToEditor(): void {
    this.scene.stop();
    this.scene.resume("Editor");
  }
}
