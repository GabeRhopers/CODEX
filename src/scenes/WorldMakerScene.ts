import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { LevelNameInput } from "../editor/LevelNameInput";
import { getLevelStorage, getWorldStorage } from "../persistence/storage";
import { SAVE_STATE_DISPLAY } from "../persistence/saveState";
import { StorageAdapter } from "../persistence/StorageAdapter";
import { WorldStorageAdapter } from "../persistence/WorldStorageAdapter";
import { ConfirmButton } from "../ui/confirmButton";
import { createEmptyWorld, WorldData } from "../world/WorldSchema";
import {
  cellAt,
  cellCenter,
  MAP_COLS,
  MAP_ROWS,
  MAX_NODES,
  orderedCells,
  placeNode,
  resolveLayout,
  type MapRect,
} from "../world/worldLayout";
import {
  nextStaticBackgroundId,
  resolveWorldBackground,
  staticBackgroundDef,
  STATIC_BACKGROUNDS,
} from "../level/staticBackgrounds";
import { ellipsize } from "../ui/labels";
import { clampPage, pageSlice, rowsPerPage } from "../ui/pager";
import { makePagerControls } from "../ui/PagerControls";
import { circleHitArgs } from "../ui/touchTarget";

interface WorldMakerSceneData {
  world?: WorldData;
}

// The list is the picker; the map is the work. It used to take 380px against the
// map's 566 and stand half empty, so it gives 80 of them back (2026-08-29).
const LEFT_X = 24;
const COLUMN_WIDTH = 300;
const LIST_START_Y = 90;
const ROW_HEIGHT = 40;
/** What actually fits between the list's heading and the pager beneath it.
 * Derived rather than guessed: the list used to run to `MAX_NODES` rows at 34px
 * from y=90, so on a 468px canvas row 10 landed on top of the backdrop button
 * and row 12 was off-canvas entirely — which meant a player with ten saved
 * levels could not see, let alone add, the tenth. */
const PAGER_Y = 356;
const ROWS_PER_PAGE = rowsPerPage(LIST_START_Y, PAGER_Y, ROW_HEIGHT);
const BACKDROP_BUTTON_Y = GAME_HEIGHT - 72;

/** The map grid, in the space the "this world, in order" list used to occupy.
 * Its own rect — the map *screen* uses the full canvas — which is exactly why
 * worldLayout speaks in cells and converts with a caller-supplied rect.
 *
 * Widened with the column it took the space from. The cell goes from 70.8x53.6
 * to 85.8x56, which buys node labels a fifth more room — they used to collide
 * along a row — and, because the row finally clears MIN_TAP_PX, lets a node's
 * tap target reach the full guideline rather than the pixel-short cap
 * ui/touchTarget.ts had to record. */
const MAP_RECT: MapRect = { x: 340, y: 84, width: GAME_WIDTH - 340 - 24, height: 280 };
const NODE_RADIUS = 15;
const NODE_LABEL_SIZE = "10px";
const TOOLBAR_Y = 372;
/** Enough of a level's name to tell it from the others, cut to what a cell can
 * hold. Truncated rather than wrapped: a wrapped name on the bottom row runs
 * straight into the toolbar, and the collisions are the actual complaint. */
const NODE_LABEL_CHARS = Math.floor((MAP_RECT.width / MAP_COLS - 10) / 5.4);

const NODE_COLOR = 0x3a5a9c;
const NODE_SELECTED_COLOR = 0xffc93c;

/** A click has to survive a little hand tremor. Phaser's own
 * `dragDistanceThreshold` defaults to 0, so without this *any* movement between
 * press and release is a drag — and since a drop freezes the layout, merely
 * clicking a node would quietly pin the whole board and stop an unarranged
 * world from re-spreading as levels were added to it. */
const DRAG_SLOP_PX = 6;

// Same debounce as EditorScene's autosave — see that file's comment on why
// this length and why tab-close/navigate-away are handled separately.
const AUTOSAVE_DEBOUNCE_MS = 2000;

/** A node's tap target: bigger than the 30px circle, capped by the map cell so
 * two nodes can never share a tappable pixel. See circleHitArgs for why this is
 * not simply a centred rectangle. */
function nodeHitArgs(): [number, number, number, number] {
  return circleHitArgs(NODE_RADIUS, {
    width: MAP_RECT.width / MAP_COLS,
    height: MAP_RECT.height / MAP_ROWS,
  });
}

/**
 * Course maker: pick saved levels on the left, arrange them on a map on the
 * right.
 *
 * Clicking a node **selects** it; a toolbar under the map then reorders or
 * removes whatever is selected. That split is deliberate and was a bug fix.
 * Removal used to be a bare click on the node itself, sharing one pointer with
 * dragging and told apart by a `dragged` flag — which, with Phaser's zero drag
 * threshold, made it a coin flip: a pixel of wobble silently swallowed the
 * click, while a perfectly still one destroyed the node with no confirmation at
 * all. Nothing else in this app deletes on a single click (see
 * `ui/confirmButton.ts`), and the map node was simply missed.
 *
 * Play order is still `levelIds` order — the map's paths are drawn between
 * consecutive entries — but it is now editable, via the toolbar's Earlier/Later
 * rather than a second list, since the map replaced the ordered list this screen
 * used to have and the selection is right there to act on.
 */
export class WorldMakerScene extends Phaser.Scene {
  private get levelStorage(): StorageAdapter {
    return getLevelStorage();
  }

  private get worldStorage(): WorldStorageAdapter {
    return getWorldStorage();
  }
  private world!: WorldData;
  private backdropContainer!: Phaser.GameObjects.Container;
  private availableContainer!: Phaser.GameObjects.Container;
  private worldContainer!: Phaser.GameObjects.Container;
  private toolbarContainer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private saveStatusText!: Phaser.GameObjects.Text;
  private backdropButton!: Phaser.GameObjects.Text;
  /** Which level id the toolbar acts on, or null. Held by id rather than index
   * so reordering keeps the same node selected as its number changes. */
  private selectedId: string | null = null;
  private page = 0;
  private dirty = false;
  private autosaveTimer?: Phaser.Time.TimerEvent;
  private readonly handlePageHide = (): void => {
    if (this.dirty) void this.persistWorld();
  };

  constructor() {
    super("WorldMaker");
  }

  init(data: WorldMakerSceneData): void {
    this.world = data?.world ?? createEmptyWorld();
    this.selectedId = null;
    this.page = 0;
    this.dirty = false;
  }

  create(): void {
    this.add
      .text(24, 20, "← Back", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 12 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => void this.leaveToBrowser());

    this.add
      .text(GAME_WIDTH - 24, 20, "Save World", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 12 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", () => void this.save());

    // Persistent, unlike statusText below — see EditorUI's saveStatusText
    // for the same pattern and why it's a separate label.
    // y=66, not 50: "Save World" above is 41px tall at its current padding and
    // runs to y=61, so the old position put this behind it.
    this.saveStatusText = this.add
      .text(GAME_WIDTH - 24, 66, SAVE_STATE_DISPLAY.saved.text, {
        fontSize: "12px",
        color: SAVE_STATE_DISPLAY.saved.color,
      })
      .setOrigin(1, 0);

    // The name field. Until this existed nothing ever set `world.name`, so
    // every world a player made was called "Untitled World" and they were
    // indistinguishable in the browser. Reuses LevelNameInput rather than a
    // third DOM input: that class carries the capture-phase blur that makes
    // clicking Save commit an in-progress edit, and the keydown
    // stopPropagation that keeps a space in a name out of Phaser's shortcuts.
    this.add.text(150, 27, "World:", { fontSize: "12px", color: "#c8c8e0" }).setOrigin(0, 0);
    new LevelNameInput(
      this,
      { x: 200, y: 20, width: 240, height: 26 },
      this.world.name,
      (value) => {
        this.world.name = value;
        this.markDirty();
      },
      { fallback: "Untitled World", placeholder: "World name" },
    );

    this.add.text(LEFT_X, 62, "Available levels (click to add)", { fontSize: "12px", color: "#a6a6c8" });
    this.add.text(MAP_RECT.x, 62, "The map — drag a node to move it, click it to select", {
      fontSize: "12px",
      color: "#a6a6c8",
    });

    this.statusText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 20, "", { fontSize: "11px", color: "#a6a6c8" })
      .setOrigin(0.5);

    this.input.dragDistanceThreshold = DRAG_SLOP_PX; // see DRAG_SLOP_PX

    // Behind everything else on the map, so the grid, paths and nodes sit on it.
    this.backdropContainer = this.add.container(0, 0).setDepth(-3);
    this.availableContainer = this.add.container(0, 0);
    this.worldContainer = this.add.container(0, 0);
    this.toolbarContainer = this.add.container(0, 0);
    this.buildBackdropButton();
    this.drawBackdrop();

    void this.refresh();

    // Same tab-close/refresh safety net as EditorScene — see its comment
    // on why "pagehide" and why the underlying write must stay synchronous.
    window.addEventListener("pagehide", this.handlePageHide);
    this.events.once("shutdown", () => {
      window.removeEventListener("pagehide", this.handlePageHide);
      this.autosaveTimer?.remove(false);
      // The name field is a DOM element rather than a Phaser one, but it needs
      // no cleanup here: LevelNameInput registers its own SHUTDOWN handler.
      // (SkinEditorScene destroys one explicitly because it rebuilds *within* a
      // scene, which shutdown never fires for.)
    });
  }

  private async refresh(): Promise<void> {
    const levels = await this.levelStorage.list();
    const levelNames = new Map(levels.map((l) => [l.id, l.name || "Untitled Level"]));
    const available = levels.filter((l) => !this.world.levelIds.includes(l.id));

    // A page can empty out from under you — adding the last level on page 3
    // leaves page 3 blank rather than showing the end of the list.
    this.page = clampPage(this.page, available.length, ROWS_PER_PAGE);

    this.drawAvailable(available, available.length);
    this.drawMap(levelNames);
    this.drawToolbar(levelNames);

    const count = this.world.levelIds.length;
    this.statusText.setText(
      count === 0
        ? "Click a level on the left to drop it on the map."
        : `${count} level${count === 1 ? "" : "s"} — paths follow play order, which you can change below the map.`,
    );
  }

  private drawAvailable(available: { id: string; name: string }[], total: number): void {
    this.availableContainer.removeAll(true);

    if (available.length === 0) {
      this.availableContainer.add(
        this.add.text(LEFT_X, LIST_START_Y, "No more saved levels to add.", { fontSize: "12px", color: "#666688" }),
      );
      return;
    }

    pageSlice(available, this.page, ROWS_PER_PAGE).forEach((level, i) => {
      const row = this.makeRow(LEFT_X, LIST_START_Y + i * ROW_HEIGHT, level.name || "Untitled Level", () =>
        this.addLevel(level.id),
      );
      this.availableContainer.add(row);
    });

    // Paging rather than a longer list: nine rows is what fits, and the row
    // that used to be tenth landed on top of the backdrop button. Shared with
    // the three browser screens, which had the same bug — see ui/pager.ts.
    this.availableContainer.add(
      makePagerControls({
        scene: this,
        x: LEFT_X,
        y: PAGER_Y,
        page: this.page,
        total,
        perPage: ROWS_PER_PAGE,
        onChange: (page) => {
          this.page = page;
          void this.refresh();
        },
      }),
    );
  }

  /** Appends to play order. Kept off `drawAvailable` so the cap check lives in
   * one place whichever row was clicked. */
  private addLevel(id: string): void {
    // One level per cell, so the map has a hard ceiling — say so rather
    // than accepting a level that would have nowhere to stand.
    if (this.world.levelIds.length >= MAX_NODES) {
      this.statusText.setText(`A world holds at most ${MAX_NODES} levels.`);
      return;
    }
    this.world.levelIds.push(id);
    // Deliberately does *not* select the newcomer. Selection arms a Remove
    // button, and clicking a node toggles — so auto-selecting would mean the
    // node you just added is the one node a click deselects rather than
    // selects, which reads as the click having missed.
    this.markDirty();
    void this.refresh();
  }

  /**
   * The map: a faint cell grid, the path following play order, and one node per
   * level.
   *
   * Drag moves a node to another cell; a click selects it for the toolbar.
   */
  private drawMap(levelNames: Map<string, string>): void {
    this.worldContainer.removeAll(true);

    const grid = this.add.graphics();
    grid.lineStyle(1, 0x2b3350, 0.8);
    for (let col = 0; col <= MAP_COLS; col++) {
      const x = MAP_RECT.x + (col * MAP_RECT.width) / MAP_COLS;
      grid.lineBetween(x, MAP_RECT.y, x, MAP_RECT.y + MAP_RECT.height);
    }
    for (let row = 0; row <= MAP_ROWS; row++) {
      const y = MAP_RECT.y + (row * MAP_RECT.height) / MAP_ROWS;
      grid.lineBetween(MAP_RECT.x, y, MAP_RECT.x + MAP_RECT.width, y);
    }
    this.worldContainer.add(grid);

    // Resolved for drawing. A world nobody has arranged stores no layout at
    // all, so it keeps re-spreading as levels are added; the first deliberate
    // drag freezes the whole board through `placeNode`, and from then on
    // nothing moves that the player did not move. See placeNode's docstring for
    // the teleporting this replaced.
    const layout = resolveLayout(this.world.levelIds, this.world.layout);

    const points = orderedCells(this.world.levelIds, layout).map((cell) => cellCenter(cell, MAP_RECT));
    const paths = this.add.graphics();
    paths.lineStyle(5, 0x8f9ad0, 1);
    for (let i = 1; i < points.length; i++) {
      paths.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    }
    this.worldContainer.add(paths);

    this.world.levelIds.forEach((id, index) => {
      const point = points[index];
      if (!point) return;
      const selected = id === this.selectedId;
      const node = this.add
        .circle(point.x, point.y, NODE_RADIUS, selected ? NODE_SELECTED_COLOR : NODE_COLOR)
        .setStrokeStyle(selected ? 3 : 2, 0xffffff, 0.9)
        // The 3-arg form's last parameter is `dropZone`, not a config object, so
        // the cursor and draggability are set separately below.
        .setInteractive(new Phaser.Geom.Rectangle(...nodeHitArgs()), Phaser.Geom.Rectangle.Contains);
      node.input!.cursor = "pointer";
      this.input.setDraggable(node);
      const label = this.add
        .text(point.x, point.y, `${index + 1}`, { fontSize: "12px", color: selected ? "#1b1d2c" : "#ffffff" })
        .setOrigin(0.5);
      const name = this.add
        .text(point.x, point.y + NODE_RADIUS + 4, ellipsize(levelNames.get(id) ?? "(deleted level)", NODE_LABEL_CHARS), {
          fontSize: NODE_LABEL_SIZE,
          color: selected ? "#ffc93c" : "#d8dcf0",
          // Its own small ground. Dimming the backdrop is not enough on its own:
          // a name sitting straight on painted mountains is unreadable wherever
          // the art happens to be light.
          backgroundColor: "rgba(16,18,31,0.72)",
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, 0);

      node.on("drag", (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        node.setPosition(dragX, dragY);
        label.setPosition(dragX, dragY);
        name.setPosition(dragX, dragY + NODE_RADIUS + 4);
      });
      node.on("dragend", () => {
        // The node's own centre, not the pointer's: grabbing a node near its
        // edge otherwise dropped it in whichever cell the *cursor* was over,
        // which could be the next one along.
        const cell = cellAt(node.x, node.y, MAP_RECT);
        const moved = cell && placeNode(this.world.levelIds, this.world.layout, id, cell);
        if (moved) {
          this.world.layout = moved;
          this.markDirty();
        }
        // Dropped off the grid, or onto a cell someone else holds: the redraw
        // puts it back where it was rather than stacking two nodes.
        void this.refresh();
      });
      node.on("pointerup", () => this.select(id));

      this.worldContainer.add([node, label, name]);
    });

    if (this.world.levelIds.length === 0) {
      this.worldContainer.add(
        this.add
          .text(MAP_RECT.x + MAP_RECT.width / 2, MAP_RECT.y + MAP_RECT.height / 2, "Empty — add levels from the left.", {
            fontSize: "12px",
            color: "#666688",
          })
          .setOrigin(0.5),
      );
    }
  }

  /** Reorder and remove, acting on the selected node. Rebuilt each refresh so
   * the buttons reflect what is actually possible — Earlier is not offered on
   * the first level, and nothing is offered with no selection. */
  private drawToolbar(levelNames: Map<string, string>): void {
    this.toolbarContainer.removeAll(true);
    const index = this.selectedId ? this.world.levelIds.indexOf(this.selectedId) : -1;

    if (index < 0) {
      this.toolbarContainer.add(
        this.add.text(MAP_RECT.x, TOOLBAR_Y + 4, "Click a node to select it.", {
          fontSize: "11px",
          color: "#666688",
        }),
      );
      return;
    }

    const name = levelNames.get(this.selectedId!) ?? "(deleted level)";
    this.toolbarContainer.add(
      this.add.text(MAP_RECT.x, TOOLBAR_Y + 4, `#${index + 1} ${name}`, { fontSize: "11px", color: "#ffc93c" }),
    );

    let x = MAP_RECT.x + 210;
    if (index > 0) {
      this.toolbarContainer.add(this.makeSmallButton(x, TOOLBAR_Y, "◀ Earlier", () => this.move(index, index - 1)));
      x += 84;
    }
    if (index < this.world.levelIds.length - 1) {
      this.toolbarContainer.add(this.makeSmallButton(x, TOOLBAR_Y, "Later ▶", () => this.move(index, index + 1)));
      x += 76;
    }

    // Two taps, matching My Levels, My Worlds and every other destructive
    // action — this node used to go on a single, unreliable click.
    const remove = new ConfirmButton({
      scene: this,
      x: x + 8,
      y: TOOLBAR_Y + 11,
      label: "Remove",
      armedLabel: "Remove? Tap again",
      onConfirm: () => this.removeSelected(),
    });
    this.toolbarContainer.add(remove.text);
  }

  private select(id: string): void {
    this.selectedId = this.selectedId === id ? null : id;
    void this.refresh();
  }

  /** Swaps two entries of play order. The map redraws its paths and renumbers
   * from `levelIds`, so nothing else has to know order changed — which is what
   * WorldSchema means by `levelIds` being the single source of truth. */
  private move(from: number, to: number): void {
    if (to < 0 || to >= this.world.levelIds.length) return;
    const ids = this.world.levelIds;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    this.markDirty();
    void this.refresh();
  }

  private removeSelected(): void {
    const index = this.selectedId ? this.world.levelIds.indexOf(this.selectedId) : -1;
    if (index < 0) return;
    const [removed] = this.world.levelIds.splice(index, 1);
    if (removed && this.world.layout) delete this.world.layout[removed];
    this.selectedId = null;
    this.markDirty();
    void this.refresh();
  }

  /**
   * The chosen backdrop, drawn behind the map grid.
   *
   * Until this existed the picker changed a word on a button and nothing else:
   * the map stayed an empty grid whichever backdrop was selected, so the setting
   * was invisible until the world was played. Reported, fairly, as "there's no
   * background, nothing changes when I select the world options".
   *
   * Masked to MAP_RECT and dimmed hard, for the same reason WorldMapScene dims
   * its own: at full strength the painted art wins the screen and the route
   * reads as an overlay on someone else's picture. `StaticBackground` is not
   * reused because its mask is hardcoded to the *level grid* rect, which four
   * other call sites depend on.
   */
  private drawBackdrop(): void {
    this.backdropContainer.removeAll(true);

    const key = staticBackgroundDef(resolveWorldBackground(this.world)).textureKey;
    const maskShape = this.make.graphics({ x: 0, y: 0 }, false);
    maskShape.fillRect(MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height);

    const image = this.add
      .image(MAP_RECT.x + MAP_RECT.width / 2, MAP_RECT.y + MAP_RECT.height / 2, key)
      .setDepth(-2)
      .setMask(maskShape.createGeometryMask());
    // Cover-fit: scale by whichever axis needs it more, so the image never falls
    // short of the rect on either.
    image.setScale(Math.max(MAP_RECT.width / image.width, MAP_RECT.height / image.height));

    const dim = this.add
      .rectangle(MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 0x10121f, 0.82)
      .setOrigin(0, 0)
      .setDepth(-1);

    // The Graphics is never added to the display list (make, not add), so the
    // container cannot destroy it for us.
    this.backdropContainer.add([image, dim]);
    this.events.once("shutdown", () => maskShape.destroy());
  }

  /** Cycles the map backdrop through the four built-ins. A one-button cycle
   * rather than a dropdown: there are only four, and a whole AssetPickerMenu
   * for a four-way choice is more UI than the choice deserves. */
  private buildBackdropButton(): void {
    this.backdropButton = this.makeRow(LEFT_X, BACKDROP_BUTTON_Y, "", () => {
      this.world.background = nextStaticBackgroundId(resolveWorldBackground(this.world));
      this.markDirty();
      this.setBackdropLabel();
      this.drawBackdrop();
    });
    this.setBackdropLabel();
  }

  private setBackdropLabel(): void {
    const current = resolveWorldBackground(this.world);
    const label = STATIC_BACKGROUNDS.find((bg) => bg.id === current)?.label ?? current;
    this.backdropButton.setText(`Map backdrop: ${label} ▸`);
  }

  private makeRow(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, label, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: "#16213e",
        padding: { x: 10, y: 10 },
      })
      // Fixed *width* so every row reads as the same button; height 0, which
      // Phaser treats as "auto" (Text.js:1289). A fixed height here has to be
      // kept in sync with the font and padding by hand, and when it wasn't —
      // a padding bump on 2026-08-29 against a 22px box that needed 40 — every
      // row in this column silently lost the bottom half of its letters.
      .setFixedSize(COLUMN_WIDTH, 0)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#16213e" }));
    return text;
  }

  private makeSmallButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, y, label, {
        fontSize: "11px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 8, y: 5 },
      })
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#0f3460" }));
    return text;
  }

  /** The one place that actually writes to storage — shared by the manual
   * Save World button, autosave, and the leave/pagehide flushes. Silently
   * no-ops on an empty world (nothing meaningful to persist, and an empty
   * `levelIds` would just mint a pointless storage entry) — the manual
   * `save()` wrapper below is what surfaces that as a message, since only
   * an explicit click deserves to be told "add a level first." Flips the
   * save-state indicator to "saving" first (after the empty-world no-op
   * check, so an empty world's indicator isn't touched by a click that did
   * nothing) so every path — not just autosave's own tick — shows
   * immediate feedback rather than a stale "Unsaved changes" during a slow
   * Drive round trip. */
  private async persistWorld(): Promise<void> {
    if (this.world.levelIds.length === 0) return;
    this.saveStatusText.setText(SAVE_STATE_DISPLAY.saving.text).setColor(SAVE_STATE_DISPLAY.saving.color);
    if (!this.world.id) this.world.id = crypto.randomUUID();
    this.world.updatedAt = new Date().toISOString();
    try {
      await this.worldStorage.save(this.world);
      this.dirty = false;
      this.saveStatusText.setText(SAVE_STATE_DISPLAY.saved.text).setColor(SAVE_STATE_DISPLAY.saved.color);
    } catch (err) {
      this.saveStatusText.setText(SAVE_STATE_DISPLAY.error.text).setColor(SAVE_STATE_DISPLAY.error.color);
      this.statusText.setText("Save failed — your browser may be out of storage space");
      console.error("World save failed:", err);
    }
  }

  private async autosave(): Promise<void> {
    if (!this.dirty || this.world.levelIds.length === 0) return;
    await this.persistWorld();
  }

  /** Same debounce pattern as EditorScene.markDirty — see that file. */
  private markDirty(): void {
    this.dirty = true;
    this.saveStatusText.setText(SAVE_STATE_DISPLAY.unsaved.text).setColor(SAVE_STATE_DISPLAY.unsaved.color);
    this.autosaveTimer?.remove(false);
    this.autosaveTimer = this.time.delayedCall(AUTOSAVE_DEBOUNCE_MS, () => void this.autosave());
  }

  /** Same "only navigate once the flush genuinely succeeded" guard as
   * EditorScene.leaveToMenu — see its docstring for why checking `dirty`
   * again after the await (not just awaiting) is what stops a failed Drive
   * write from being silently discarded by leaving the scene. */
  private async leaveToBrowser(): Promise<void> {
    this.autosaveTimer?.remove(false);
    if (this.dirty) await this.persistWorld();
    if (this.dirty) return; // save failed — stay put rather than lose the edit
    this.scene.start("WorldBrowser");
  }

  /** The explicit "Save World" button — unlike autosave, a validation
   * failure and a successful save both deserve visible feedback here, and
   * success navigates back to the browser (the button means "I'm done"). */
  private async save(): Promise<void> {
    if (this.world.levelIds.length === 0) {
      this.statusText.setText("Add at least one level before saving.");
      return;
    }
    this.autosaveTimer?.remove(false);
    await this.persistWorld();
    if (!this.dirty) this.scene.start("WorldBrowser");
  }
}
