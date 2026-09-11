import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { ConfirmButton } from "./confirmButton";
import { clampPage, pageSlice, rowsPerPage } from "./pager";
import { makePagerControls } from "./PagerControls";
import { drawScreenHeader } from "./screenHeader";
import { makeTextButton } from "./textButton";

/**
 * A screen listing things you have saved: paged rows, per-row buttons, and a
 * two-tap Delete.
 *
 * `LevelBrowserScene` and `WorldBrowserScene` were this same screen written
 * twice — about 200 of their ~320 lines identical, comments included, down to
 * `WorldBrowserScene` pointing at its twin rather than repeating the reasoning
 * ("Same reasoning as LevelBrowserScene's — see that file", "See
 * LevelBrowserScene's own field"). `textButton.ts` already absorbed one layer of
 * that duplication and names these two scenes while doing it; this is the layer
 * above.
 *
 * Everything that genuinely differed is an option here, and nothing that
 * differed needed a special case — which is the test of whether an abstraction
 * like this is earning its keep. The one place the two screens really diverge is
 * that a world has a **Play** button and a level does not, and that is expressed
 * as a list of row actions rather than an `extraButton` flag, so neither screen
 * is the default and the other the exception. Adding a third action to either
 * one is a list entry, not arithmetic on hardcoded x positions.
 *
 * **Not a base class.** Composition, like `drawScreenHeader` and
 * `makePagerControls` — a scene calls this from `create()` and keeps nothing.
 * The state a list needs (which page, the rows, the armed Delete buttons) lives
 * in this closure, which is created fresh on every `create()` and dies with the
 * scene's display list, exactly as the per-scene fields it replaces did.
 */

/** The least a thing has to be to appear in one of these lists. */
export interface SavedItem {
  id: string;
  name: string;
}

/** One button on a row, left of Delete. */
export interface RowAction<T extends SavedItem> {
  label: string;
  onClick: (item: T) => void;
}

export interface SavedListOptions<T extends SavedItem> {
  scene: Phaser.Scene;
  /** Header title, e.g. "My Levels". */
  title: string;
  /** The top-right header action, e.g. "New Level". */
  action: { label: string; onClick: () => void };
  /** Shown instead of rows when nothing is saved yet. */
  emptyMessage: string;
  /** What to call a thing somebody never named, e.g. "Untitled Level". */
  fallbackName: string;
  /** The row's second line — "Updated 3 Sep, 14:05" or "2 levels". */
  secondary: (item: T) => string;
  /** Row buttons in reading order; Delete is added after them and is not one. */
  actions: RowAction<T>[];
  list: () => Promise<T[]>;
  remove: (id: string) => Promise<void>;
  /** Names the thing in the delete-failure message: "Couldn't delete that
   * level — check your connection and try again." */
  noun: string;
}

const ROW_START_Y = 90;
/** Raised from 44 (2026-08-29) to fit a button tall enough to be worth aiming at
 * with a thumb — see ui/touchTarget.ts. 52 rather than more: the row body
 * (ROW_HEIGHT - 8) only has to clear the button's own 38px, and every extra
 * pixel here costs a row off the page. */
const ROW_HEIGHT = 52;
/** Where the pager sits, and therefore how much room the rows get. */
const PAGER_Y = GAME_HEIGHT - 44;
const ROWS_PER_PAGE = rowsPerPage(ROW_START_Y, PAGER_Y, ROW_HEIGHT);

const ROW_BODY_HEIGHT = ROW_HEIGHT - 8;
const DELETE_X = GAME_WIDTH - 140;
/** Where the *last* row action sits; earlier ones step left from it. Both of
 * these are the positions the two hand-written screens already used, kept to the
 * pixel so this change moves nothing on screen. */
const LAST_ACTION_X = GAME_WIDTH - 240;
const ACTION_STEP = 80;

/**
 * What the scene keeps hold of.
 *
 * The rows live in their own container rather than loose in the scene, and that
 * separation is load-bearing rather than tidiness: "what is in the list" and
 * "what is on the screen" are different questions, and the header, the status
 * line and the pager are all on the screen. `drive-failure.spec.ts` says so in
 * its own words — *"the rows live inside listContainer, so a top-level scan
 * finds nothing and silently reports 'not armed'"* — which is exactly the kind
 * of quietly-passing test that distinction prevents.
 */
export interface SavedList {
  listContainer: Phaser.GameObjects.Container;
  statusText: Phaser.GameObjects.Text;
}

export function drawSavedList<T extends SavedItem>(options: SavedListOptions<T>): SavedList {
  const { scene, title, action, emptyMessage, fallbackName, secondary, actions, list, remove, noun } = options;

  drawScreenHeader({ scene, title, onBack: () => scene.scene.start("Menu"), action });

  const statusText = scene.add
    .text(GAME_WIDTH / 2, ROW_START_Y - 22, "", { fontSize: "11px", color: "#a6a6c8" })
    .setOrigin(0.5);
  const listContainer = scene.add.container(0, 0);

  let page = 0;
  /** Every row's Delete, so arming one can stand the others down — two rows
   * both reading "Delete? Tap again" is a way to delete the wrong thing. */
  let deleteButtons: ConfirmButton[] = [];

  async function deleteItem(id: string): Promise<void> {
    try {
      await remove(id);
    } catch (err) {
      // Was unguarded on both screens: a failed Drive delete threw, the refresh
      // never ran, and the row simply stayed put saying nothing —
      // indistinguishable from a click that missed. The thing genuinely still
      // exists, so leaving the row is right; saying so is what was missing.
      statusText.setText(`Couldn't delete that ${noun} — check your connection and try again.`).setColor("#ff6666");
      console.error(`${noun} delete failed:`, err);
      return;
    }
    statusText.setText("").setColor("#a6a6c8");
    void refresh();
  }

  function addRow(item: T, y: number): void {
    const mid = y + ROW_BODY_HEIGHT / 2;
    const rowBg = scene.add.rectangle(40, y, GAME_WIDTH - 80, ROW_BODY_HEIGHT, 0x16213e).setOrigin(0, 0);
    const name = scene.add
      .text(56, mid, item.name || fallbackName, { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5);
    const meta = scene.add
      .text(56, mid + 16, secondary(item), { fontSize: "11px", color: "#a6a6c8" })
      .setOrigin(0, 0.5);

    // Laid out right to left from Delete, so the rightmost action always lands
    // where a single-action screen's one button has always been.
    const buttons = actions.map((rowAction, i) =>
      makeTextButton({
        scene,
        x: LAST_ACTION_X - (actions.length - 1 - i) * ACTION_STEP,
        y: mid,
        label: rowAction.label,
        onClick: () => rowAction.onClick(item),
      }),
    );

    // Two taps, like every other destructive action in this app. This was once a
    // single click that permanently removed a saved level, sitting immediately
    // beside Edit, with no undo.
    const deleteBtn = new ConfirmButton({
      scene,
      x: DELETE_X,
      y: mid,
      label: "Delete",
      armedLabel: "Delete? Tap again",
      onConfirm: () => void deleteItem(item.id),
    });
    deleteBtn.text.on("pointerdown", () => {
      for (const other of deleteButtons) if (other !== deleteBtn) other.disarm();
    });
    deleteButtons.push(deleteBtn);

    listContainer.add([rowBg, name, meta, ...buttons, deleteBtn.text]);
  }

  async function refresh(): Promise<void> {
    listContainer.removeAll(true);
    // The Texts these wrap are destroyed by removeAll above.
    deleteButtons = [];
    const items = await list();

    if (items.length === 0) {
      listContainer.add(
        scene.add.text(GAME_WIDTH / 2, ROW_START_Y + 20, emptyMessage, { fontSize: "14px", color: "#a6a6c8" }).setOrigin(0.5),
      );
      return;
    }

    // Rows used to be laid out for the whole list with nothing checking the
    // canvas was tall enough: exactly eight fitted, so a ninth saved thing was
    // drawn past the bottom edge where it could not be clicked at all.
    page = clampPage(page, items.length, ROWS_PER_PAGE);
    pageSlice(items, page, ROWS_PER_PAGE).forEach((item, i) => addRow(item, ROW_START_Y + i * ROW_HEIGHT));
    listContainer.add(
      makePagerControls({
        scene,
        x: 40,
        y: PAGER_Y,
        page,
        total: items.length,
        perPage: ROWS_PER_PAGE,
        onChange: (next) => {
          page = next;
          void refresh();
        },
      }),
    );
  }

  void refresh();
  return { listContainer, statusText };
}
