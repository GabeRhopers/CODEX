import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { GameRect } from "../editor/domOverlay";
import { LevelNameInput } from "../editor/LevelNameInput";
import {
  addWorld,
  createEmptyGame,
  GameData,
  moveWorld,
  removeWorld,
  validationError,
} from "../game/GameSchema";
import { loadGame, saveGame } from "../game/gameStorage";
import { getWorldStorage } from "../persistence/storage";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";
import { WorldSummary } from "../world/WorldSchema";
import { ConfirmButton } from "../ui/confirmButton";
import { makePagerControls } from "../ui/PagerControls";
import { clampPage, pageSlice, rowsPerPage } from "../ui/pager";
import { ellipsize } from "../ui/labels";

/**
 * Where a pile of worlds becomes a game.
 *
 * A game is a title, worlds in a chosen order, and an ending — the top of the
 * hierarchy this tool builds, and the thing a publish step will eventually
 * ship. Until it existed, someone opening this project landed on an editor
 * menu rather than on anything you could hand to a person.
 *
 * **One screen, no modes.** There are three things to set and none of them is
 * big enough to hide behind a tab. The layout mirrors WorldMakerScene's — a
 * paged list of what you have on the left, the arrangement in the middle — one
 * level up: that screen orders levels into a world, this one orders worlds into
 * a game.
 *
 * Like the Thing Maker, it owns no rules: what makes a game valid, and what
 * reordering means, live in `game/GameSchema.ts`, pure and tested without
 * Phaser. This screen picks values and shows reasons.
 */

const BUTTON_HEX = "#0f3460";
const BUTTON_HOVER_HEX = "#3a5a9c";
const MUTED = "#a6a6c8";
const PANEL_FILL = 0x0f1830;

const LIST_TOP = 132;
const ROW_HEIGHT = 40;
// Four things stack below the panels and all four can be present at once: the
// pager, the status line, and the two action buttons. Spaced so the worst case
// — a paged list *and* a refusal to save — has clear air between each, rather
// than the one-pixel clearance that reads as broken but passes an overlap test.
const LIST_BOTTOM = GAME_HEIGHT - 116;
const PAGER_Y = GAME_HEIGHT - 108;
const STATUS_Y = GAME_HEIGHT - 56;
const ACTIONS_Y = GAME_HEIGHT - 24;

const AVAILABLE_X = 24;
const AVAILABLE_WIDTH = 300;
const ORDER_X = 348;
const ORDER_WIDTH = 340;
const ENDING_X = 712;
const ENDING_WIDTH = GAME_WIDTH - ENDING_X - 24;

/** Names are drawn into fixed-width panels, so they are trimmed to fit rather
 * than allowed to run under the buttons beside them — same reason and same
 * helper the World Maker uses. */
const AVAILABLE_NAME_CHARS = 30;
const ORDER_NAME_CHARS = 22;

export class GameMakerScene extends Phaser.Scene {
  private worldStorage: WorldStorageAdapter = getWorldStorage();
  private gameDoc: GameData = createEmptyGame("");
  private worlds: WorldSummary[] = [];
  private worldNames = new Map<string, string>();
  private page = 0;
  private status = "";
  private loaded = false;
  private inputs: LevelNameInput[] = [];
  private removeButtons: ConfirmButton[] = [];

  constructor() {
    super("GameMaker");
  }

  create(): void {
    this.gameDoc = createEmptyGame(crypto.randomUUID());
    this.worlds = [];
    this.worldNames = new Map();
    this.page = 0;
    this.status = "";
    this.loaded = false;
    this.rebuild();
    void this.readAll();
  }

  /** Reads this profile's game and the worlds it can draw from. Both are needed
   * before the screen means anything, so they are awaited together and drawn
   * once — a half-populated maker is more confusing than a blank one. */
  private async readAll(): Promise<void> {
    const [game, worlds] = await Promise.all([
      loadGame().catch(() => null),
      this.worldStorage.list().catch(() => [] as WorldSummary[]),
    ]);
    if (!this.scene.isActive()) return;
    // A profile with no game yet keeps the blank created above, id included, so
    // the first save writes a real document rather than needing a "new" step.
    if (game) this.gameDoc = game;
    this.worlds = worlds;
    this.worldNames = new Map(worlds.map((w) => [w.id, w.name || "Untitled World"]));
    this.loaded = true;
    this.rebuild();
  }

  private rebuild(): void {
    // DOM inputs are not Phaser children, so they need tearing down explicitly
    // or they float over whatever is drawn next — the same care SkinEditorScene
    // and ThingMakerScene take with theirs.
    for (const input of this.inputs) input.destroy();
    this.inputs = [];
    this.removeButtons = [];
    for (const child of [...this.children.list]) child.destroy();

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1a1a2e).setOrigin(0, 0);
    this.drawHeader();
    if (!this.loaded) {
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "Loading your game…", { fontSize: "14px", color: MUTED })
        .setOrigin(0.5);
      return;
    }
    this.drawTitleField();
    this.drawAvailable();
    this.drawOrder();
    this.drawEnding();
    this.drawActions();
  }

  // --- shared bits ---------------------------------------------------------

  private makeButton(x: number, yMid: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, yMid, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: BUTTON_HEX,
        // Tall enough to aim at on a phone held sideways — see ui/touchTarget.ts.
        padding: { x: 10, y: 10 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: BUTTON_HOVER_HEX }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: BUTTON_HEX }));
    return text;
  }

  private panel(x: number, y: number, width: number, height: number): void {
    this.add.rectangle(x, y, width, height, PANEL_FILL).setOrigin(0, 0);
  }

  private columnHeading(x: number, text: string): void {
    this.add.text(x, LIST_TOP - 22, text, { fontSize: "12px", color: MUTED }).setOrigin(0, 0.5);
  }

  // --- header + title ------------------------------------------------------

  private drawHeader(): void {
    this.add
      .text(24, 20, "← Back", { fontSize: "14px", color: "#ffffff", backgroundColor: BUTTON_HEX, padding: { x: 10, y: 6 } })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => this.scene.start("Menu"));
    this.add.text(GAME_WIDTH / 2, 20, "Game Maker", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);
    this.add
      .text(GAME_WIDTH / 2, 46, "Your worlds, in the order they are played, and how it ends.", {
        fontSize: "12px",
        color: MUTED,
      })
      .setOrigin(0.5, 0);
  }

  private drawTitleField(): void {
    this.add.text(24, 88, "Title", { fontSize: "12px", color: MUTED }).setOrigin(0, 0.5);
    const rect: GameRect = { x: 70, y: 74, width: 300, height: 28 };
    this.inputs.push(
      new LevelNameInput(
        this,
        rect,
        this.gameDoc.title,
        (value) => {
          this.gameDoc = { ...this.gameDoc, title: value };
          this.status = "";
        },
        // No fallback: an untitled game must fail validation and say so, rather
        // than quietly becoming "Untitled" — the title is the thing on the box.
        { fallback: "", placeholder: "Grampa's Quest" },
      ),
    );
  }

  // --- the two lists -------------------------------------------------------

  private drawAvailable(): void {
    this.columnHeading(AVAILABLE_X, "Worlds you've made");
    this.panel(AVAILABLE_X, LIST_TOP, AVAILABLE_WIDTH, LIST_BOTTOM - LIST_TOP);

    const spare = this.worlds.filter((w) => !this.gameDoc.worldIds.includes(w.id));
    if (spare.length === 0) {
      this.add
        .text(AVAILABLE_X + 14, LIST_TOP + 18, this.worlds.length === 0 ? "No worlds yet.\nMake one in Worlds first." : "Every world is in your game.", {
          fontSize: "12px",
          color: MUTED,
          lineSpacing: 4,
        })
        .setOrigin(0, 0);
      return;
    }

    const perPage = rowsPerPage(LIST_TOP + 8, PAGER_Y, ROW_HEIGHT);
    this.page = clampPage(this.page, spare.length, perPage);
    pageSlice(spare, this.page, perPage).forEach((world, i) => {
      const y = LIST_TOP + 8 + i * ROW_HEIGHT;
      const mid = y + ROW_HEIGHT / 2 - 4;
      this.add
        .text(AVAILABLE_X + 14, mid, ellipsize(world.name || "Untitled World", AVAILABLE_NAME_CHARS), {
          fontSize: "13px",
          color: "#ffffff",
        })
        .setOrigin(0, 0.5);
      this.makeButton(AVAILABLE_X + AVAILABLE_WIDTH - 60, mid, "Add", () => {
        this.gameDoc = addWorld(this.gameDoc, world.id);
        this.status = "";
        this.rebuild();
      });
    });

    makePagerControls({
      scene: this,
      x: AVAILABLE_X,
      y: PAGER_Y,
      page: this.page,
      total: spare.length,
      perPage,
      onChange: (page) => {
        this.page = page;
        this.rebuild();
      },
    });
  }

  private drawOrder(): void {
    this.columnHeading(ORDER_X, "In your game, in order");
    this.panel(ORDER_X, LIST_TOP, ORDER_WIDTH, LIST_BOTTOM - LIST_TOP);

    if (this.gameDoc.worldIds.length === 0) {
      this.add
        .text(ORDER_X + 14, LIST_TOP + 18, "Nothing yet — add a world from the left.", {
          fontSize: "12px",
          color: MUTED,
        })
        .setOrigin(0, 0);
      return;
    }

    this.gameDoc.worldIds.forEach((worldId, index) => {
      const y = LIST_TOP + 8 + index * ROW_HEIGHT;
      const mid = y + ROW_HEIGHT / 2 - 4;
      // Numbered, because the order *is* the feature — a bare list of names
      // does not say which one opens the game.
      this.add
        .text(ORDER_X + 12, mid, `${index + 1}.`, { fontSize: "12px", color: MUTED })
        .setOrigin(0, 0.5);
      this.add
        .text(ORDER_X + 34, mid, ellipsize(this.worldNames.get(worldId) ?? "(deleted world)", ORDER_NAME_CHARS), {
          fontSize: "13px",
          color: this.worldNames.has(worldId) ? "#ffffff" : "#ff9d9d",
        })
        .setOrigin(0, 0.5);

      // Measured back from the panel's right edge, leaving the widest of these
      // (Remove, ~62px) inside it — at -58 it ran 4px past.
      this.makeButton(ORDER_X + ORDER_WIDTH - 130, mid, "↑", () => this.reorder(index, -1));
      this.makeButton(ORDER_X + ORDER_WIDTH - 100, mid, "↓", () => this.reorder(index, 1));
      const remove = new ConfirmButton({
        scene: this,
        x: ORDER_X + ORDER_WIDTH - 70,
        y: mid,
        label: "Remove",
        armedLabel: "Sure?",
        onConfirm: () => {
          this.gameDoc = removeWorld(this.gameDoc, worldId);
          this.status = "";
          this.rebuild();
        },
      });
      remove.text.on("pointerdown", () => {
        for (const other of this.removeButtons) if (other !== remove) other.disarm();
      });
      this.removeButtons.push(remove);
    });
  }

  private reorder(index: number, direction: -1 | 1): void {
    const next = moveWorld(this.gameDoc, index, direction);
    // moveWorld returns the same object when nothing moved (already at an end),
    // so this skips a redraw rather than flickering the whole screen.
    if (next === this.gameDoc) return;
    this.gameDoc = next;
    this.status = "";
    this.rebuild();
  }

  // --- ending --------------------------------------------------------------

  private drawEnding(): void {
    this.columnHeading(ENDING_X, "How it ends");
    this.panel(ENDING_X, LIST_TOP, ENDING_WIDTH, LIST_BOTTOM - LIST_TOP);

    this.add.text(ENDING_X + 14, LIST_TOP + 24, "Headline", { fontSize: "11px", color: MUTED }).setOrigin(0, 0.5);
    this.inputs.push(
      new LevelNameInput(
        this,
        { x: ENDING_X + 14, y: LIST_TOP + 38, width: ENDING_WIDTH - 28, height: 26 },
        this.gameDoc.ending.headline,
        (value) => {
          this.gameDoc = { ...this.gameDoc, ending: { ...this.gameDoc.ending, headline: value } };
        },
        { fallback: "", placeholder: "The End" },
      ),
    );

    this.add.text(ENDING_X + 14, LIST_TOP + 90, "Message", { fontSize: "11px", color: MUTED }).setOrigin(0, 0.5);
    this.inputs.push(
      new LevelNameInput(
        this,
        { x: ENDING_X + 14, y: LIST_TOP + 104, width: ENDING_WIDTH - 28, height: 26 },
        this.gameDoc.ending.message,
        (value) => {
          this.gameDoc = { ...this.gameDoc, ending: { ...this.gameDoc.ending, message: value } };
        },
        { fallback: "", placeholder: "Thanks for playing!" },
      ),
    );

    this.add
      .text(ENDING_X + 14, LIST_TOP + 150, "Shown once the last world is\nfinished. Leave them blank and\nthe defaults are used.", {
        fontSize: "11px",
        color: MUTED,
        lineSpacing: 4,
      })
      .setOrigin(0, 0);
  }

  // --- save / play ---------------------------------------------------------

  private drawActions(): void {
    if (this.status) {
      this.add
        .text(24, STATUS_Y, this.status, { fontSize: "12px", color: this.status.startsWith("Saved") ? "#8fd694" : "#ff9d9d" })
        .setOrigin(0, 0.5);
    }
    this.makeButton(24, ACTIONS_Y, "Save", () => void this.save());
    this.makeButton(90, ACTIONS_Y, "Play Game ▶", () => void this.play());
  }

  /** The reason is `validationError`'s, verbatim — this screen never composes
   * its own, so what it refuses and what storage would accept cannot drift. */
  private async save(): Promise<boolean> {
    const reason = validationError(this.gameDoc);
    if (reason) {
      this.status = reason;
      this.rebuild();
      return false;
    }
    this.gameDoc = { ...this.gameDoc, updatedAt: new Date().toISOString() };
    try {
      await saveGame(this.gameDoc);
    } catch {
      this.status = "Could not save — check your connection.";
      this.rebuild();
      return false;
    }
    this.status = "Saved.";
    this.rebuild();
    return true;
  }

  /**
   * Saves, then starts the first world with the game riding along.
   *
   * Saving first on purpose: playing is how you check the thing you just
   * arranged, and it would be a poor trade to test an order that was never
   * written down.
   */
  private async play(): Promise<void> {
    if (!(await this.save())) return;
    this.scene.start("WorldMap", {
      worldId: this.gameDoc.worldIds[0],
      game: {
        worldIds: this.gameDoc.worldIds,
        index: 0,
        title: this.gameDoc.title,
        ending: this.gameDoc.ending,
      },
    });
  }
}
