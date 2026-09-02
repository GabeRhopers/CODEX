import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, HEADER_HEIGHT } from "../config/gameConfig";
import { LevelData } from "../level/LevelSchema";
import { resolveWorldBackground, staticBackgroundDef } from "../level/staticBackgrounds";
import { getLevelStorage, getWorldStorage } from "../persistence/storage";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";
import { cellCenter, MAP_COLS, MAP_ROWS, orderedCells, resolveLayout, type MapRect } from "../world/worldLayout";
import { circleHitArgs } from "../ui/touchTarget";
import { completedCount, currentIndex, isUnlocked, isWorldComplete } from "../world/worldProgress";
import { WorldData } from "../world/WorldSchema";
import { GameEnding } from "../game/GameSchema";

/** Where this world sits in a game, when it is being played as part of one.
 *
 * Carried through the run rather than re-read, because the game document is
 * this screen's caller's to own — and `ending` travels with it so finishing has
 * the author's words in hand without a second read that could disagree. */
export interface GameRunContext {
  worldIds: string[];
  index: number;
  title: string;
  ending: GameEnding;
}

interface WorldMapSceneData {
  worldId: string;
  /** Set by PlayScene on a win. Only drives the marker's walk — the
   * completion itself is banked in PlayScene.onWin, because pressing N for
   * the next level never comes back through here. */
  justCompletedIndex?: number;
  /** Absent for the ordinary "play a world from the browser" path, which must
   * keep behaving exactly as it always has. */
  game?: GameRunContext;
}

/** The map is the whole canvas below the header — unlike the editor, nothing
 * flanks it. */
const MAP_RECT: MapRect = { x: 40, y: HEADER_HEIGHT + 8, width: GAME_WIDTH - 80, height: GAME_HEIGHT - HEADER_HEIGHT - 48 };

const NODE_RADIUS = 18;
const PATH_WIDTH = 6;
const PATH_COLOR = 0x2b3350;
const PATH_DONE_COLOR = 0xffc93c;
const NODE_LOCKED = 0x3a3d55;
const NODE_OPEN = 0x3a5a9c;
const NODE_DONE = 0x2e7d32;
const MARKER_WALK_MS = 420;

/**
 * Playing a world, as a map rather than a list.
 *
 * Nodes sit on the grid `worldLayout` resolves, paths run between consecutive
 * entries of `levelIds` (which is why arranging nodes never has to mean
 * reordering them), and a marker stands on the level you are up to. Beating a
 * level returns here, banks the completion, and walks the marker to the next
 * node — that short walk is most of what separates a map from a menu.
 *
 * The backdrop is drawn here rather than with `StaticBackground`: that class
 * masks to the *level grid* rect specifically to stop a level's background
 * bleeding into the editor's header, which is a problem this screen doesn't
 * have and a mask four other call sites depend on.
 */
export class WorldMapScene extends Phaser.Scene {
  private worldStorage: WorldStorageAdapter = getWorldStorage();
  private levelStorage: StorageAdapter = getLevelStorage();
  private worldId!: string;
  private justCompletedIndex?: number;
  private gameRun?: GameRunContext;
  private levelNames = new Map<string, string>();
  private marker?: Phaser.GameObjects.Image;
  private statusText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;

  constructor() {
    super("WorldMap");
  }

  init(data: WorldMapSceneData): void {
    this.worldId = data.worldId;
    this.justCompletedIndex = data.justCompletedIndex;
    this.gameRun = data.game;
    this.levelNames = new Map();
    this.marker = undefined;
  }

  create(): void {
    // Leaving a world reached *through a game* goes back to the game, not to the
    // world list — the list is not where you came from and not where the run
    // continues from.
    const backLabel = this.gameRun ? "← Game" : "← Worlds";
    this.add
      .text(24, 18, backLabel, { fontSize: "13px", color: "#ffffff", backgroundColor: "#0f3460", padding: { x: 10, y: 12 } })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.leave());

    this.titleText = this.add.text(GAME_WIDTH / 2, 20, "", { fontSize: "18px", color: "#ffffff" }).setOrigin(0.5, 0);
    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 18, "", { fontSize: "12px", color: "#a6a6c8" })
      .setOrigin(0.5);

    this.input.keyboard?.on("keydown-ESC", () => this.leave());

    void this.build();
  }

  /** Where "back" goes. One method rather than two call sites, so the button and
   * Esc can never disagree about it. */
  private leave(): void {
    this.scene.start(this.gameRun ? "GameMaker" : "WorldBrowser");
  }

  private async build(): Promise<void> {
    const world = await this.worldStorage.load(this.worldId);
    if (!world) {
      this.statusText.setText("That world could not be loaded.");
      return;
    }
    this.titleText.setText(world.name || "Untitled World");

    const summaries = await this.levelStorage.list();
    this.levelNames = new Map(summaries.map((l) => [l.id, l.name || "Untitled Level"]));

    this.drawBackdrop(world);
    this.drawMap(world);
  }

  private drawBackdrop(world: WorldData): void {
    const key = staticBackgroundDef(resolveWorldBackground(world)).textureKey;
    const image = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, key).setDepth(-100);
    // Cover-fit, same idea as StaticBackground's: scale by whichever axis needs
    // it more so the image never falls short on either.
    image.setScale(Math.max(GAME_WIDTH / image.width, GAME_HEIGHT / image.height));
    // Dimmed hard, because this is a backdrop for nodes and paths rather than
    // the subject. At full strength the painted sun and trees win the screen
    // and the route reads as an overlay on someone else's picture.
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x10121f, 0.72).setOrigin(0, 0).setDepth(-99);
    // Solid bands behind the title and the status line — dimming alone still
    // leaves text sitting on whatever happens to be behind it.
    this.add.rectangle(0, 0, GAME_WIDTH, HEADER_HEIGHT, 0x141726, 0.92).setOrigin(0, 0).setDepth(-98);
    this.add
      .rectangle(0, GAME_HEIGHT - 34, GAME_WIDTH, 34, 0x141726, 0.92)
      .setOrigin(0, 0)
      .setDepth(-98);
  }

  private drawMap(world: WorldData): void {
    const layout = resolveLayout(world.levelIds, world.layout);
    const cells = orderedCells(world.levelIds, layout);
    const points = cells.map((cell) => cellCenter(cell, MAP_RECT));
    const completed = completedCount(world.id, world.levelIds.length);

    if (points.length === 0) {
      this.statusText.setText("This world has no levels yet — edit it to add some.");
      return;
    }

    // Paths first, so nodes sit on top of them. A run is drawn "done" up to the
    // point progress has reached, which is the map's at-a-glance answer to
    // "how far am I?".
    const paths = this.add.graphics().setDepth(0);
    for (let i = 1; i < points.length; i++) {
      paths.lineStyle(PATH_WIDTH, i <= completed ? PATH_DONE_COLOR : PATH_COLOR, 1);
      paths.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    }

    world.levelIds.forEach((levelId, index) => {
      const point = points[index];
      if (!point) return;
      const unlocked = isUnlocked(index, completed);
      const done = index < completed;

      const node = this.add
        .circle(point.x, point.y, NODE_RADIUS, done ? NODE_DONE : unlocked ? NODE_OPEN : NODE_LOCKED)
        .setStrokeStyle(3, done || unlocked ? 0xffffff : 0x22263c, 0.9)
        .setDepth(1);
      this.add
        .text(point.x, point.y, done ? "✓" : `${index + 1}`, {
          fontSize: "14px",
          color: unlocked || done ? "#ffffff" : "#6a6f90",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(2);
      // The level's own name under its node — a numbered dot alone doesn't say
      // which of your levels it is.
      this.add
        .text(point.x, point.y + NODE_RADIUS + 12, this.levelNames.get(levelId) ?? "(deleted level)", {
          fontSize: "10px",
          color: unlocked || done ? "#d8dcf0" : "#6a6f90",
        })
        .setOrigin(0.5, 0)
        .setDepth(2);

      if (!unlocked) return;
      // Bigger than the circle, capped by the map cell so two nodes can never
      // share a tappable pixel — see ui/touchTarget.ts. Locked nodes stay
      // non-interactive, so an enlarged target can never reach one.
      node.setInteractive(
        new Phaser.Geom.Rectangle(
          ...circleHitArgs(NODE_RADIUS, { width: MAP_RECT.width / MAP_COLS, height: MAP_RECT.height / MAP_ROWS }),
        ),
        Phaser.Geom.Rectangle.Contains,
      );
      node.input!.cursor = "pointer";
      node.on("pointerdown", () => void this.playLevel(world, index));
    });

    this.drawMarker(world, points, completed);
  }

  private drawMarker(world: WorldData, points: { x: number; y: number }[], completed: number): void {
    const index = currentIndex(completed, world.levelIds.length);
    const target = points[index];
    if (!target) return;

    // Walk in from the node just beaten rather than blinking into place — the
    // move is the feedback that the win registered and the path opened.
    const walkingFrom = this.justCompletedIndex !== undefined ? points[this.justCompletedIndex] : undefined;
    const start = walkingFrom && walkingFrom !== target ? walkingFrom : target;

    this.marker = this.add.image(start.x, start.y - NODE_RADIUS - 14, "wizard-idle").setDepth(3).setScale(0.7);
    if (start !== target) {
      this.tweens.add({
        targets: this.marker,
        x: target.x,
        y: target.y - NODE_RADIUS - 14,
        duration: MARKER_WALK_MS,
        ease: "Sine.easeInOut",
      });
    }

    const complete = isWorldComplete(completed, world.levelIds.length);
    this.statusText.setText(
      complete
        ? this.gameRun
          ? `World ${this.gameRun.index + 1} of ${this.gameRun.worldIds.length} complete!`
          : "World complete! Click any node to replay it."
        : `Level ${index + 1} of ${world.levelIds.length} — click the lit node to play.`,
    );
    if (complete) this.drawGameContinue();
  }

  private async playLevel(world: WorldData, index: number): Promise<void> {
    const levelId = world.levelIds[index];
    const level: LevelData | null = await this.levelStorage.load(levelId);
    if (!level) {
      // Same tolerance the list had: a level deleted elsewhere shouldn't make
      // the whole world unopenable, it should say so and leave the rest usable.
      this.statusText.setText("That level was deleted — edit this world to remove it.");
      return;
    }
    this.scene.start("Play", {
      level,
      // The game context rides along so it survives the round trip: PlayScene
      // restarts this scene on the way back, and without carrying it there the
      // run would silently stop being part of a game the moment you played a
      // level.
      world: { levelIds: world.levelIds, index, worldId: world.id, game: this.gameRun },
    });
  }

  /**
   * What finishing this world means when it is part of a game.
   *
   * The symmetry that keeps this small: PlayScene chains *levels inside a
   * world*, so a game chains *worlds inside a game* exactly one layer up —
   * here, where a world already knows it is complete.
   */
  private drawGameContinue(): void {
    const game = this.gameRun;
    if (!game) return;
    const isLast = game.index + 1 >= game.worldIds.length;
    const label = isLast ? "Finish →" : "Next world →";

    const button = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 52, label, {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#2e7d32",
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    button.on("pointerover", () => button.setStyle({ backgroundColor: "#3f9d44" }));
    button.on("pointerout", () => button.setStyle({ backgroundColor: "#2e7d32" }));
    button.on("pointerdown", () => {
      if (isLast) {
        this.scene.start("Ending", { ending: game.ending, title: game.title });
        return;
      }
      this.scene.start("WorldMap", {
        worldId: game.worldIds[game.index + 1],
        game: { ...game, index: game.index + 1 },
      });
    });
  }
}
