import Phaser from "phaser";
import { GAME_WIDTH } from "../config/gameConfig";
import { GameRect } from "../editor/domOverlay";
import { AssetPickerItem, AssetPickerMenu } from "../editor/AssetPickerMenu";
import { Brush, isSkinnable, PALETTE, UP_BASKET_TINT_COLOR } from "../editor/Palette";
import { CustomEntityDef } from "../entities/customEntity";
import { customBrushes } from "../entities/entityRegistry";
import { loadCustomEntities } from "../entities/customEntityStorage";
import { makePagerControls } from "../ui/PagerControls";
import { clampPage, pageSlice } from "../ui/pager";
import { LevelNameInput } from "../editor/LevelNameInput";
import { CanvasView, PixelCanvasOverlay, PixelTool } from "../editor/PixelCanvasOverlay";
import { FIT_INDEX, formatZoom, VIEWPORT_SIZE } from "../editor/canvasZoom";
import { fitWithinTile } from "../editor/spriteFit";
import { loadActiveProfile } from "../profile/Profile";
import { SkinAsset } from "../skins/CustomSkins";
import { cellsFromImageFitted, cellsFromPngDataUrl, cellsToPngDataUrl, hasPaintedCells } from "../skins/pixelSkinCells";
import {
  builtInReferenceSources,
  NO_REFERENCE_ID,
  parseReferenceId,
  ReferenceSource,
  skinReferenceId,
} from "../skins/referenceSources";
import { baseFrameOf, CHARACTER_SKIN_ID, framePlanFor, gridSizeFor } from "../skins/spriteFrames";
import { DEFAULT_PIXEL_PALETTE_ID, findPalette, PIXEL_PALETTES, PixelPalette } from "../skins/pixelPalettes";
import { shadeRamp } from "../skins/colorShades";
import { addCustomColor, CUSTOM_PALETTE_ID, loadCustomColors, saveCustomColors } from "../skins/customPalette";
import { resolveSkinThumbnails } from "../skins/skinLoader";
import { defaultSkinName, displaySkinName, sanitizeSkinName } from "../skins/skinNames";
import { listPixelSkins, loadCustomSkins, removeCustomSkin, savePixelSkin, setActiveSkin } from "../skins/skinStorage";

const BUTTON_COLOR = 0x0f3460;
/** The Text buttons take CSS strings; the Rectangles take the number above. */
const BUTTON_HEX = "#0f3460";
const BUTTON_HOVER_HEX = "#3a5a9c";
/**
 * Selected, and selected-while-hovered.
 *
 * These exist because one colour served as *both* the hover colour and the
 * selected colour, which broke selection twice over: an armed tool looked
 * exactly like a tool you happened to be pointing at, and makeSmallButton's
 * pointerout reset every button to the unselected colour unconditionally — so
 * hovering the armed tool and moving away rendered it inactive until you
 * clicked something else.
 *
 * The amber is deliberately nowhere near the hover blue, and is the same family
 * as the ring around the selected colour swatch, so "selected" reads as one
 * language across the screen. The level editor already worked this way
 * (EditorUI's ERASER_ACTIVE_COLOR / ERASER_ACTIVE_HOVER_COLOR pair); this is
 * that pattern, not a new one.
 */
const SELECTED_COLOR = "#8a6d1f";
const SELECTED_HOVER_COLOR = "#b8912c";
/** SELECTED_COLOR as a number, for Rectangle fills. */
const SELECTED_FILL = 0x8a6d1f;
/** The ring drawn around whichever member of an exclusive group is active, so
 * selection is a shape and not only a colour — the same idea as EditorUI's
 * `selectedOutline` on the brush grid. */
const SELECTED_RING_COLOR = 0xffc93c;
const ARM_TIMEOUT_MS = 3000;
const ROW_START_Y = 90;
const ROW_HEIGHT = 44;
// Where the painting window sits. Fixed for the life of the scene: zoom moves
// the drawing inside this box, never the box itself, so no button can be pushed
// off the scene's 468px floor however far someone zooms in. 10 + 384 = 394,
// which leaves the footer row its line and the side columns 40px of run-on
// below the canvas — see buildCanvas's layout note.
const CANVAS_TOP_Y = 10;
/** Width of the reference picker, and therefore of the whole right rail — see
 * buildReferenceControls for why the picker cannot be narrower. */
const REFERENCE_WIDTH = 260;

// Everything this scene draws is a Phaser shape on one canvas, so a test that
// wants "the shade ramp" and not "the palette" has no DOM to query and has to
// pick the objects out of the display list somehow. It used to be by geometry —
// `width === 24 && x < 250`, the ramp being the only 24px swatches left of the
// centred palette row. That is a coincidence of a layout, not a fact about the
// objects, and it broke the moment the 2026-09-05 rework put both groups in the
// same column. Naming them says what they are and survives being moved.
const SHADE_STEP_NAME = "shade-step";
const PALETTE_SWATCH_NAME = "palette-swatch";

// --- canvas-mode layout ---------------------------------------------------
// One place for the geometry, so the three regions can be read against each
// other rather than reconstructed from scattered literals. Everything here is
// checked by eye and by assertLayoutSound; see buildCanvas.

/** The one action line, at the scene's floor: Back, name, status, Undo/Redo/Save. */
const FOOTER_Y = 434;
/** Top of every side column. Above the canvas by a hair, so the first heading
 * sits level with the drawing's top edge rather than below it. */
const RAIL_TOP_Y = 8;
/** Left region: two columns, both clear of the canvas's left edge at 333. */
const LEFT_COL_X = 16;
const LEFT_COL2_X = 120;
/** Rendered height of a makeSmallButton: 12px text plus its 6px padding, twice. */
const SMALL_BUTTON_H = 26;
/** Small-button pitch in a vertical stack — the button plus 6px of air. */
const STACK_STEP = SMALL_BUTTON_H + 6;
// The two gaps below are what decides whether a column fits. The right rail is
// the tight one — PALETTE (5 rows), DRAWING, REFERENCE and THIS SKIN have to
// finish above the footer at y=421, and at 22/16 the last button ended at 426,
// measurably on top of "↶ Undo". 18 still leaves 5px under a 13px heading.
/** Heading to its first row. */
const HEADING_GAP = 18;
/** Between one labelled group and the next heading. */
const GROUP_GAP = 12;

type Mode = "browse" | "pick-brush" | "canvas";

/** Which brush/skin the canvas mode is currently working on.
 * `existingId` set means Save overwrites that library entry in place
 * (editing never re-assigns a skin to a different brush — see
 * savePixelSkin's docstring); undefined means Save adds a brand new
 * entry. `initialCells` seeds the canvas — from the skin's saved
 * pixelData when re-editing, or re-captured from the live canvas on
 * every palette switch (see the palette button handler below) so
 * changing palettes mid-drawing can't silently discard unsaved strokes,
 * since switching palette forces a full rebuild of this scene's display
 * list the same way switching mode does. */
interface EditingTarget {
  brush: Brush;
  existingId?: string;
  paletteId: string;
  /** What this skin is called. Seeded from the saved skin when re-editing, or
   * from defaultSkinName for a new one, and updated as the name field is
   * committed. Lives on the target rather than in a field of its own so it
   * survives the frame/palette switches that rebuild the whole scene, exactly
   * like frameCells does. */
  name: string;
  /** Every frame's cells, keyed by frame name (see spriteFrames.ts). A
   * single-frame skin has exactly one entry under SINGLE_FRAME. Held here
   * rather than on the canvas because the canvas only ever holds the *one*
   * frame being painted, while Save has to write them all. */
  frameCells: Record<string, (string | null)[] | undefined>;
  /** Which frame the canvas is currently showing. */
  activeFrame: string;
}

/** The frame name a single-frame skin's cells live under — an internal
 * placeholder, never persisted, so the same target shape covers animated and
 * ordinary skins without a second code path through buildCanvas/onSave. */
const SINGLE_FRAME = "single";

/**
 * The player character as a skin target. Shaped as a Brush so it flows through
 * the pick grid, the canvas header and the browse list with no special-casing,
 * but deliberately *not* added to PALETTE: the character isn't something you
 * paint into a level, and putting it there would give the level editor a
 * brush that places nothing. Its textureKey is Grampa's own idle frame, so the
 * pick grid shows the thing you'd be replacing.
 */
const CHARACTER_BRUSH: Brush = {
  id: CHARACTER_SKIN_ID,
  category: "markers",
  kind: "entity",
  label: "Grampa",
  textureKey: "wizard-idle",
};

/** Every target the Skin Creator can paint: the character first, since it's
 * the one most people are looking for, then every skinnable brush — which as
 * of the block-skin pass includes the Blocks category, so the ground a level is
 * mostly made of can finally be painted here too — and finally the things the
 * player invented in the Thing Maker.
 *
 * Customs go **last** so no existing target shifts position when one exists.
 * They belong here at all because the skins library is keyed by brush id, an
 * arbitrary string, so a custom entity's sprite is simply "the active skin for
 * its own id" — see customEntity.ts on why art is not a field on a definition. */
function skinTargets(customDefs: readonly CustomEntityDef[] = []): Brush[] {
  return [CHARACTER_BRUSH, ...PALETTE.filter(isSkinnable), ...customBrushes(customDefs)];
}

/**
 * Standalone pixel-art skin creator, reachable from the Menu (see "Skin
 * Creator" under Art) rather than nested in the level Editor — drawing a
 * skin isn't tied to any one level, the same way uploading one already
 * wasn't (skins are a shared, non-profile-scoped library — see
 * skinStorage.ts). Three flat modes rather than sub-scenes: `browse`
 * (pick an existing pixel-drawn skin to re-edit, or start a new one),
 * `pick-brush` (which of the ~26 skinnable brushes a *new* skin is for),
 * and `canvas` (the actual 32x32 painter). Each mode's `build*` method
 * fully repopulates the scene's display list — `rebuild()` always clears
 * everything first — rather than showing/hiding three pre-built layers,
 * matching this codebase's existing "throwaway and reconstruct" pattern
 * for infrequent, full-screen mode switches (e.g. EditorScene's own
 * rebuildVisualsFromLevel).
 */
export class SkinEditorScene extends Phaser.Scene {
  private mode: Mode = "browse";
  private target?: EditingTarget;
  private pixelCanvas?: PixelCanvasOverlay;
  private statusText?: Phaser.GameObjects.Text;
  private clearButton?: Phaser.GameObjects.Text;
  private clearArmed = false;
  private clearArmTimer?: Phaser.Time.TimerEvent;
  /** Canvas mode's skin-name field. A DOM element, not a Phaser child, so
   * rebuild() has to tear it down explicitly the way it does pixelCanvas —
   * children.destroy() would leave it floating over the browse list. */
  private nameInput?: LevelNameInput;
  private defaultButton?: Phaser.GameObjects.Text;
  private defaultArmed = false;
  private defaultArmTimer?: Phaser.Time.TimerEvent;
  // Every field below is a *tool preference*, not per-skin data — deliberately
  // never reset in create()/rebuild(), same convention currentColor already
  // followed before this pass: picking Fill or zooming in once should still
  // feel that way the next time you open the Skin Creator this session,
  // not silently revert to defaults every time you switch brushes or skins.
  private currentColor: string | null = null;
  /** "Yours" — colours used that no preset palette offered. Mirrors
   * localStorage; see customPalette.ts for why it lives there. */
  private customColors: string[] = [];
  /** Repaints the shade ramp for whatever colour is now selected. Assigned when
   * canvas mode builds it, so anything that changes the colour can call it. */
  private refreshShadeRamp?: () => void;
  private currentTool: PixelTool = "paint";
  private mirrorEnabled = false;
  private gridVisible = false;
  // Zoom level and where the drawing sits inside the window. A tool preference
  // like the fields above, and persisted for a sharper reason than the others:
  // canvas mode is torn down and rebuilt on every frame and palette switch, so
  // without this, zooming into a character's face and stepping to the next
  // frame would dump you back at fit zoom every time — during tracing, which is
  // exactly when you are stepping through frames.
  private view: CanvasView = { zoomIndex: FIT_INDEX, panX: 0, panY: 0 };
  private zoomReadout?: Phaser.GameObjects.Text;
  // Which reference is showing, and the data URL behind it. Both are *tool*
  // state like the fields above — deliberately kept across frame and skin
  // switches, since you generally trace the same guide across several frames
  // of one animation.
  private referenceId: string = NO_REFERENCE_ID;
  private referenceDataUrl: string | null = null;
  private referencePicker?: AssetPickerMenu;
  private referenceSources: ReferenceSource[] = [];
  // Phaser's keyboard queue can re-emit one physical keydown more than
  // once within a single rendered frame under frame stalls — see
  // EditorScene's onceThisFrame for the same guard and why.
  private readonly lastActionFrame = new Map<string, number>();
  /** Things invented in the Thing Maker, so they can be painted here too.
   * Loaded asynchronously and empty until it lands — the same "opens usable,
   * pops in a moment later" tolerance every other library read here has. */
  private customDefs: CustomEntityDef[] = [];
  /** Which page of the pick-brush grid is showing. */
  private pickPage = 0;
  /** Set by the Thing Maker so "Save & draw sprite" lands on the canvas for the
   * thing just made, instead of in a 40-tile grid to hunt for it. */
  private openTargetBrushId?: string;
  /** Where "← Back" goes from the browse list. The Menu unless another screen
   * sent us here and wants us back. */
  private returnTo = "Menu";

  constructor() {
    super("SkinEditor");
  }

  init(data?: { targetBrushId?: string; returnTo?: string }): void {
    // Read here rather than in create() because Phaser calls init() with the
    // scene-start payload and create() with nothing.
    this.openTargetBrushId = data?.targetBrushId;
    this.returnTo = data?.returnTo ?? "Menu";
  }

  create(): void {
    this.mode = "browse";
    this.target = undefined;
    this.pickPage = 0;
    this.rebuild();

    // Custom targets arrive asynchronously. If we were asked to open one
    // directly, that can only happen once they land — hence the resolve doing
    // the opening rather than create().
    void loadCustomEntities()
      .catch(() => [] as CustomEntityDef[])
      .then((defs) => {
        if (!this.scene.isActive()) return;
        this.customDefs = defs;
        const requested = this.openTargetBrushId;
        this.openTargetBrushId = undefined;
        if (requested) {
          const brush = skinTargets(defs).find((b) => b.id === requested);
          // A definition deleted between screens leaves nothing to paint; the
          // browse list is the honest place to land rather than a blank canvas.
          if (brush) return void this.openCanvasFor(brush);
        }
        if (this.mode === "browse" || this.mode === "pick-brush") this.rebuild();
      });

    // Registered once here, not inside buildCanvas() — rebuild() reruns
    // buildCanvas() on every palette switch and browse<->canvas round
    // trip without ever re-running create(), so registering these inside
    // buildCanvas() instead would stack up a fresh duplicate listener on
    // every visit to canvas mode, firing undo/redo multiple times per
    // keypress after a few round trips. The `this.mode !== "canvas"`
    // guard is what actually scopes these to canvas mode instead.
    this.input.keyboard?.on("keydown-Z", (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (this.mode !== "canvas") return;
      event.preventDefault();
      if (event.shiftKey) this.onceThisFrame("redo", () => this.performRedo());
      else this.onceThisFrame("undo", () => this.performUndo());
    });
    this.input.keyboard?.on("keydown-Y", (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (this.mode !== "canvas") return;
      event.preventDefault();
      this.onceThisFrame("redo", () => this.performRedo());
    });
  }

  private onceThisFrame(action: string, fn: () => void): void {
    const frame = this.game.loop.frame;
    if (this.lastActionFrame.get(action) === frame) return;
    this.lastActionFrame.set(action, frame);
    fn();
  }

  private performUndo(): void {
    if (!this.pixelCanvas?.undo()) this.statusText?.setText("Nothing to undo").setColor("#ffeb3b");
  }

  private performRedo(): void {
    if (!this.pixelCanvas?.redo()) this.statusText?.setText("Nothing to redo").setColor("#ffeb3b");
  }

  private rebuild(): void {
    this.pixelCanvas?.destroy();
    this.pixelCanvas = undefined;
    // AssetPickerMenu owns Phaser objects the display-list clear below would
    // orphan rather than destroy (see the comment there) — its own destroy()
    // is what actually unhooks them.
    this.referencePicker?.destroy();
    this.referencePicker = undefined;
    this.nameInput?.destroy();
    this.nameInput = undefined;
    this.clearArmTimer?.remove(false);
    this.clearArmed = false;
    // Same for the other two-tap button: a rebuild throws away the Text it
    // armed, so a timer still holding a reference would fire against a
    // destroyed object and leave the flag stuck armed for the new one.
    this.defaultArmTimer?.remove(false);
    this.defaultArmed = false;
    this.defaultButton = undefined;
    // NOT `this.children.removeAll(true)` — that looks right but isn't:
    // `this.children` is the Scene's DisplayList, which extends the base
    // Structs.List directly rather than GameObjects.Container, so its
    // `removeAll` takes a `skipCallback` flag, not a destroy flag (unlike
    // Container.removeAll(destroyChild), the one every other "clear and
    // rebuild" spot in this codebase uses on an actual Container). Passing
    // `true` there only skips List's own removal callback — every old
    // GameObject stays alive with its input listener still registered,
    // just detached from rendering. A stale, invisible "← Back" button
    // from an *earlier* mode sitting at the exact same screen spot as the
    // new one is a real, reproduced bug this caused: both fire on one
    // click, and whichever old handler's `scene.start(...)` wins.
    // Destroying each child explicitly (which also deregisters its input
    // handler via GameObject.destroy()) is what every other scene here
    // actually relies on — copied into an array first since `.destroy()`
    // mutates `this.children.list` out from under a direct iteration.
    for (const child of [...this.children.list]) child.destroy();

    if (this.mode === "browse") this.buildBrowse();
    else if (this.mode === "pick-brush") this.buildPickBrush();
    else this.buildCanvas();
  }

  private goTo(mode: Mode): void {
    this.mode = mode;
    this.rebuild();
  }

  // --- shared header/button helpers, same shape as TemplateBrowserScene/WorldBrowserScene ---

  /** `y` is the button's top edge. Canvas mode overrides it to put Back on the
   * footer line with the other actions; browse and pick-brush keep the header. */
  private addBackButton(onClick: () => void, y = 20): void {
    this.add
      .text(24, y, "← Back", {
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: BUTTON_HEX,
        padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }

  /**
   * A small text button.
   *
   * `isActive` is what makes selection survive a hover. Without it, pointerout
   * reset the background unconditionally, so pointing at the armed tool and
   * moving away made it look unarmed — see SELECTED_COLOR. Pass it for anything
   * that carries state (the tool row, Grid, Mirror); omit it for plain actions
   * like Save.
   */
  private makeSmallButton(
    x: number,
    yMid: number,
    label: string,
    onClick: () => void,
    isActive?: () => boolean,
  ): Phaser.GameObjects.Text {
    const idle = (): string => (isActive?.() ? SELECTED_COLOR : BUTTON_HEX);
    const hover = (): string => (isActive?.() ? SELECTED_HOVER_COLOR : BUTTON_HOVER_HEX);
    const text = this.add
      .text(x, yMid, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: idle(),
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: hover() }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: idle() }));
    return text;
  }

  /**
   * Files a colour into "Yours".
   *
   * Called for every colour that isn't in the active palette — eyedropper
   * samples and the shade ramp's steps. Writes through to localStorage
   * immediately rather than on save, because canvas mode is torn down and
   * rebuilt constantly (every frame and palette switch) and there is no other
   * moment that reliably happens.
   */
  private rememberColor(color: string): void {
    const next = addCustomColor(this.customColors, color);
    if (next === this.customColors) return; // already the most recent
    this.customColors = next;
    saveCustomColors(next);
  }

  /** Repaints a stateful button to its resting look — call after the state it
   * reflects changes, since the button only re-reads `isActive` on hover. */
  private refreshButton(button: Phaser.GameObjects.Text, active: boolean): void {
    button.setStyle({ backgroundColor: active ? SELECTED_COLOR : BUTTON_HEX });
  }

  // --- mode: browse ------------------------------------------------------

  private buildBrowse(): void {
    this.addBackButton(() => this.scene.start(this.returnTo));
    this.add.text(GAME_WIDTH / 2, 24, "Skin Creator", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);
    this.add
      .text(GAME_WIDTH / 2, 50, "Pixel-art skins for Markers/Enemies/Items/Decor.", {
        fontSize: "12px",
        color: "#a6a6c8",
      })
      .setOrigin(0.5, 0);

    this.makeSmallButton(GAME_WIDTH - 24 - 100, 20 + 10, "+ New Skin", () => this.goTo("pick-brush")).setOrigin(
      0,
      0.5,
    );

    // Browse mode had no status line at all, so anything that went wrong here
    // — most importantly openForEditing failing to decode a skin's PNG — wrote
    // to a `statusText` that only exists in canvas mode, i.e. nowhere. Clicking
    // Edit then did visibly nothing, with the reason only in the console. One
    // line, created in both modes, is what makes that failure sayable.
    this.statusText = this.add.text(GAME_WIDTH / 2, 68, "", { fontSize: "12px", color: "#4ade80" }).setOrigin(0.5, 0);

    const loadingText = this.add
      .text(GAME_WIDTH / 2, ROW_START_Y + 20, "Loading…", { fontSize: "14px", color: "#a6a6c8" })
      .setOrigin(0.5);

    void listPixelSkins().then(async (entries) => {
      loadingText.destroy();
      if (this.mode !== "browse") return; // navigated away before this resolved

      if (entries.length === 0) {
        this.add
          .text(GAME_WIDTH / 2, ROW_START_Y + 20, "No pixel skins yet — tap + New Skin to paint one.", {
            fontSize: "14px",
            color: "#a6a6c8",
          })
          .setOrigin(0.5);
        return;
      }

      // skinTargets(), not PALETTE, so a character skin's row resolves to a
      // real target and its Edit button works — the character deliberately
      // isn't a Palette brush (see CHARACTER_BRUSH).
      const brushesById = new Map(skinTargets(this.customDefs).map((b) => [b.id, b]));
      // Thumbnails resolved once per distinct brush (each just replays
      // loadCustomSkins' own in-memory result, not a fresh Drive read)
      // rather than once per skin, mirroring resolveSkinThumbnails' own
      // one-brush-at-a-time shape.
      const thumbsByBrush = new Map<string, Awaited<ReturnType<typeof resolveSkinThumbnails>>>();
      for (const brushId of new Set(entries.map((e) => e.brushId))) {
        thumbsByBrush.set(brushId, await resolveSkinThumbnails(this, brushId));
      }
      if (this.mode !== "browse") return;

      entries.forEach((entry, i) => {
        const brush = brushesById.get(entry.brushId);
        const textureKey = thumbsByBrush.get(entry.brushId)?.find((t) => t.id === entry.asset.id)?.textureKey;
        this.addBrowseRow(ROW_START_Y + i * ROW_HEIGHT, brush, entry.brushId, entry.asset, textureKey);
      });
    });
  }

  private addBrowseRow(y: number, brush: Brush | undefined, brushId: string, asset: SkinAsset, textureKey: string | undefined): void {
    this.add.rectangle(40, y, GAME_WIDTH - 80, ROW_HEIGHT - 8, 0x16213e).setOrigin(0, 0);
    if (textureKey) {
      const icon = this.add.image(66, y + (ROW_HEIGHT - 8) / 2, textureKey).setOrigin(0.5);
      fitWithinTile(icon, 28);
    }
    // The skin's own name leads the row. It used to be the *brush* label, so
    // three Ghost skins were three rows all reading "Ghost" and telling them
    // apart meant opening each one. The brush moves to a secondary label,
    // right-aligned before the frame count, since it is still worth knowing
    // what a skin is for.
    this.add
      .text(90, y + (ROW_HEIGHT - 8) / 2, displaySkinName(asset, brush?.label ?? brushId), {
        fontSize: "15px",
        color: "#ffffff",
      })
      .setOrigin(0, 0.5);
    this.add
      .text(GAME_WIDTH - 470, y + (ROW_HEIGHT - 8) / 2, brush?.label ?? brushId, {
        fontSize: "11px",
        color: "#a6a6c8",
      })
      .setOrigin(0, 0.5);

    // Frame count for animated skins only, so an ordinary one-off skin's row
    // is unchanged rather than gaining a redundant "1 frame".
    const frameCount = Object.keys(asset.frames ?? {}).length;
    if (frameCount > 0) {
      this.add
        .text(GAME_WIDTH - 380, y + (ROW_HEIGHT - 8) / 2, `${frameCount} frame${frameCount === 1 ? "" : "s"}`, {
          fontSize: "11px",
          color: "#a6a6c8",
        })
        .setOrigin(0, 0.5);
    }

    const midY = y + (ROW_HEIGHT - 8) / 2;
    this.makeSmallButton(GAME_WIDTH - 290, midY, "Edit", () => {
      if (!brush) return;
      void this.openForEditing(brush, asset);
    });
    // Opens the same decoded frames as Edit but forgets which skin they came
    // from, so Save writes a new entry and this one is left exactly as it is.
    this.makeSmallButton(GAME_WIDTH - 240, midY, "Copy", () => {
      if (!brush) return;
      void this.openForEditing(brush, asset, { asCopy: true });
    });
    this.makeSmallButton(GAME_WIDTH - 178, midY, "Delete", () => {
      void removeCustomSkin(brushId, asset.id).then(() => this.rebuild());
    });
  }

  /** Loads a saved skin back into the canvas. Skins written before
   * 2026-08-21 carry their own `cells` array and open straight from it;
   * everything since is decoded from the skin's PNG instead, which holds
   * exactly the same grid (see PixelSkinData.cells). Async purely because
   * decoding an image is — hence the guard against the user having
   * navigated away in the meantime, matching how buildBrowse handles its
   * own awaits.
   *
   * `paletteId` now comes from the skin itself rather than always
   * defaulting: it was being written on every save and then never read, so
   * re-opening a Game Boy skin silently presented PICO-8's swatches. */
  private async openForEditing(brush: Brush, asset: SkinAsset, options?: { asCopy?: boolean }): Promise<void> {
    const gridSize = gridSizeFor(brush.id);
    const plan = framePlanFor(brush.id);
    const frameCells: Record<string, (string | null)[] | undefined> = {};

    try {
      if (!plan) {
        // Single-frame skin, unchanged: the legacy `cells` array when a skin
        // predates 2026-08-21, otherwise decoded straight from its own PNG.
        frameCells[SINGLE_FRAME] = asset.pixelData?.cells ?? (await cellsFromPngDataUrl(asset.imageData, gridSize));
      } else {
        // Only frames that were actually painted are decoded. Leaving the rest
        // undefined is what keeps "unpainted" distinguishable from "painted
        // blank" all the way through to Save.
        const painted = asset.frames ?? { [baseFrameOf(plan)]: asset.imageData };
        for (const name of plan.frames) {
          const dataUrl = painted[name];
          if (dataUrl) frameCells[name] = await cellsFromPngDataUrl(dataUrl, gridSize);
        }
      }
    } catch (err) {
      console.error("Couldn't rebuild that skin's pixels:", err);
      // Reaches the browse-mode status line added above — before that this
      // wrote to a Text that only canvas mode ever created, so a skin that
      // wouldn't decode made Edit look like a dead button.
      this.statusText?.setText(`Couldn't open that skin: ${String(err)}`).setColor("#ff6666");
      return;
    }

    if (this.mode !== "browse") return; // navigated away while decoding
    const existingName = displaySkinName(asset, brush.label);
    this.target = {
      brush,
      // Dropping the id is the entire difference between Edit and Copy: Save
      // adds a new library entry instead of overwriting, so the skin this was
      // based on survives untouched.
      existingId: options?.asCopy ? undefined : asset.id,
      // A copy needs its own name for the same reason it needs its own id —
      // two rows reading "Ghost 1" would be exactly the confusion names were
      // added to remove.
      name: options?.asCopy ? await this.nextCopyName(brush, existingName) : existingName,
      paletteId: asset.pixelData?.paletteId ?? DEFAULT_PIXEL_PALETTE_ID,
      frameCells,
      activeFrame: plan ? baseFrameOf(plan) : SINGLE_FRAME,
    };
    this.goTo("canvas");
    if (options?.asCopy) {
      this.statusText?.setText("Copy — saving adds a new skin, the original is untouched").setColor("#4ade80");
    }
  }

  /** Every name already used by this brush's skins, so a new one can avoid
   * them. Reads the library rather than the browse list, which only shows
   * pixel-drawn skins — an uploaded skin's name still counts as taken. */
  private async existingNamesFor(brush: Brush): Promise<string[]> {
    try {
      const skins = await loadCustomSkins();
      return (skins[brush.id]?.items ?? []).map((item) => displaySkinName(item, brush.label));
    } catch (err) {
      // A name clash is a cosmetic problem; failing to open the canvas over one
      // would not be. Fall back to the un-deduplicated default.
      console.error("Couldn't read existing skin names:", err);
      return [];
    }
  }

  private async nextDefaultName(brush: Brush): Promise<string> {
    return defaultSkinName(brush.label, await this.existingNamesFor(brush));
  }

  /** "Ghost 1" copied becomes "Ghost 1 copy", then "Ghost 1 copy 2" — keeps the
   * lineage readable rather than renumbering into the plain sequence, where it
   * would be indistinguishable from a skin drawn from scratch. */
  private async nextCopyName(brush: Brush, sourceName: string): Promise<string> {
    const taken = new Set((await this.existingNamesFor(brush)).map((name) => name.toLowerCase()));
    const first = `${sourceName} copy`;
    if (!taken.has(first.toLowerCase())) return first;
    for (let n = 2; ; n++) {
      const candidate = `${first} ${n}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  // --- mode: pick-brush ----------------------------------------------------

  private buildPickBrush(): void {
    this.addBackButton(() => this.goTo("browse"));
    this.add
      .text(GAME_WIDTH / 2, 24, "Choose something to paint a skin for", { fontSize: "18px", color: "#ffffff" })
      .setOrigin(0.5, 0);

    const skinnable = skinTargets(this.customDefs);
    // 8 columns of 125 rather than 6 of 150. Adding the ten block brushes took
    // the grid from 28 targets to 38, which at 6 columns is 7 rows — and row 6
    // starts at y=474 on a 468-tall canvas, i.e. the last six targets would
    // simply not be on screen. 8 x 125 is 1000 wide (inside GAME_WIDTH) and
    // brings it back to 5 rows, ending well clear of the bottom edge.
    const columns = 8;
    const cellW = 125;
    const cellH = 64;
    // Five rows is all that fits: a sixth row's labels end at y=470 on a
    // 468-tall canvas. That capped the grid at 40 targets while 38 already
    // existed, so the very first invented thing would have been drawn off the
    // bottom — hence paging, once there is more than a page to show. Unlike the
    // editor's 190px palette panel, this screen is full width, so the shared
    // pager row fits as-is.
    const rows = 5;
    const perPage = columns * rows;
    this.pickPage = clampPage(this.pickPage, skinnable.length, perPage);
    const shown = pageSlice(skinnable, this.pickPage, perPage);
    const gridWidth = columns * cellW;
    const x0 = (GAME_WIDTH - gridWidth) / 2;
    const y0 = ROW_START_Y;

    shown.forEach((brush, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      const cx = x0 + col * cellW + cellW / 2;
      const cy = y0 + row * cellH;

      const icon = this.add.image(cx, cy + 22, brush.textureKey).setInteractive({ useHandCursor: true });
      fitWithinTile(icon, 36);
      // Always the brush's own built-in art here (this grid is "which
      // brush is a *new* skin for," never a skin-resolved render), so
      // unlike EntityPlacer/EditorUI's own basket-up tint this needs no
      // custom-skin guard — see UP_BASKET_TINT_COLOR's docstring.
      if (brush.id === "basket-up") icon.setTint(UP_BASKET_TINT_COLOR);
      const label = this.add.text(cx, cy + 46, brush.label, { fontSize: "11px", color: "#c8c8e0" }).setOrigin(0.5, 0);

      const onClick = () => void this.openCanvasFor(brush);
      icon.on("pointerdown", onClick);
      label.setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
    });

    // Built through scene.add.*, so these are already on the display list;
    // nothing to reparent here, unlike the browsers that keep their rows in a
    // container. Returns nothing at all while everything fits on one page.
    makePagerControls({
      scene: this,
      x: x0,
      // Below the last row's labels, which end at y0 + rows*cellH - 18. At -6
      // the pager's top edge touched them; the canvas floor is 468 and this row
      // is ~32 tall, so 422 clears both.
      y: y0 + rows * cellH + 12,
      page: this.pickPage,
      total: skinnable.length,
      perPage,
      onChange: (page) => {
        this.pickPage = page;
        this.rebuild();
      },
    });
  }

  /**
   * Starts a *new* skin for `brush` and opens the canvas on it.
   *
   * Shared by the pick grid and by the Thing Maker's "Save & draw sprite"
   * handoff, so arriving from either lands in exactly the same state — there is
   * no second way to open a fresh canvas that could drift from this one.
   */
  private async openCanvasFor(brush: Brush): Promise<void> {
    const plan = framePlanFor(brush.id);
    // Async only to read the brush's existing names, so the default is
    // "Ghost 2" rather than a second "Ghost 1". The canvas opens either
    // way — existingNamesFor swallows a failed read.
    const name = await this.nextDefaultName(brush);
    if (!this.scene.isActive()) return;
    this.target = {
      brush,
      existingId: undefined,
      name,
      paletteId: DEFAULT_PIXEL_PALETTE_ID,
      frameCells: {},
      activeFrame: plan ? baseFrameOf(plan) : SINGLE_FRAME,
    };
    this.goTo("canvas");
  }

  // --- mode: canvas --------------------------------------------------------

  private buildCanvas(): void {
    const target = this.target;
    if (!target) {
      this.goTo("browse");
      return;
    }

    // --- the footer: one line, everything you *do* to the skin ---------------
    //
    // The whole layout of this mode follows from this row existing (2026-09-05).
    // Before it, four stacked full-width rows — name and Save, the status line,
    // the palette selector, the swatches-and-tools row — held the painting
    // window's top edge at y=132. That is 28% of a 468px scene spent on about
    // 96px of content, with the gaps between rows costing more than the rows.
    //
    // So actions went here, controls went to the side columns, and the drawing
    // got the middle: 320px square to 384px, 44% more area. The columns are free
    // to run *past* the bottom of the canvas down to this line, which is where
    // the height to stack them vertically comes from.
    //
    // Laid out from both ends inwards: Back and the brush name from the left,
    // Save/Redo/Undo from the right (each placed from its own rendered `.width`,
    // right-to-left, since makeSmallButton has no fixed-width rectangle the way
    // EditorUI's header buttons do), the name field centred, and the status text
    // in the gap that leaves.
    this.addBackButton(() => this.goTo("browse"), FOOTER_Y - 13);
    const footerMidY = FOOTER_Y;
    this.add
      .text(110, footerMidY, `Editing: ${target.brush.label}`, { fontSize: "13px", color: "#a6a6c8" })
      .setOrigin(0, 0.5);

    const saveButton = this.makeSmallButton(GAME_WIDTH - 24 - 60, footerMidY, "Save", () => this.onSave());
    const redoButton = this.makeSmallButton(0, footerMidY, "↷ Redo", () => this.performRedo());
    redoButton.setX(saveButton.x - 8 - redoButton.width);
    const undoButton = this.makeSmallButton(0, footerMidY, "↶ Undo", () => this.performUndo());
    undoButton.setX(redoButton.x - 8 - undoButton.width);

    // The name field. Reuses LevelNameInput rather than a second DOM input of
    // its own: that class carries the capture-phase blur that makes clicking
    // Save commit an in-progress edit (rather than saving the previous name),
    // and the keydown stopPropagation that stops a space in a name reaching
    // Phaser's shortcuts. Both were found the hard way; a copy would lose them.
    this.nameInput = new LevelNameInput(
      this,
      { x: GAME_WIDTH / 2 - 120, y: footerMidY - 13, width: 240, height: 26 },
      target.name,
      (value) => {
        if (this.target) this.target.name = value;
      },
      { fallback: target.name, placeholder: "Skin name" },
    );

    // In the band between the drawing and the footer, not on the footer itself.
    // The footer's own free space is the ~247px between the name field and
    // Undo, and the longest message this shows — "Copy — saving adds a new skin,
    // the original is untouched" — measures about 280px, so it would have run
    // under Undo. assertLayoutSound would not have caught it either: this text
    // is a label, not interactive. Here it has the whole width and sits right
    // under the thing it is talking about.
    this.statusText = this.add
      .text(GAME_WIDTH / 2, CANVAS_TOP_Y + VIEWPORT_SIZE + 13, "", { fontSize: "12px", color: "#4ade80" })
      .setOrigin(0.5, 0.5);

    // --- the three regions -------------------------------------------------
    //
    //   left column 1 (x=16)    VIEW, then TOOLS
    //   left column 2 (x=120)   FRAMES, COLOURS, SHADES
    //   the drawing (x=333)     384x384, dead centre
    //   right rail (x=766)      PALETTE, DRAWING, REFERENCE, THIS SKIN
    //
    // Each column is a running y rather than a list of literals, so inserting a
    // control is one line and cannot silently land on top of its neighbour. The
    // right rail keeps the x it always had — GAME_WIDTH - 24 - REFERENCE_WIDTH,
    // set by the reference picker, which is the widest thing in the scene that
    // is not the drawing (see buildReferenceControls).
    const railX = GAME_WIDTH - 24 - REFERENCE_WIDTH;
    let leftY = RAIL_TOP_Y;
    let left2Y = RAIL_TOP_Y;
    let railY = RAIL_TOP_Y;

    // Every cursor above is the **top edge** of the next thing to place, all the
    // way down a column. makeSmallButton takes a middle instead, so its callers
    // add half a button; nothing else has to think about it.
    /** Draws a group's heading and returns the top edge of its first row. */
    const heading = (x: number, y: number, text: string): number => {
      this.add.text(x, y, text.toUpperCase(), { fontSize: "10px", color: "#8a8ab0", fontStyle: "bold" });
      return y + HEADING_GAP;
    };
    /** Closes a stacked group. A stack loop leaves the cursor one whole step
     * past the last row's top, which is 6px below its bottom edge; back up to
     * that edge and add the space between groups. */
    const endGroup = (y: number): number => y - (STACK_STEP - SMALL_BUTTON_H) + GROUP_GAP;

    // --- PALETTE -------------------------------------------------------------
    // "Yours" is offered alongside the presets rather than as a separate
    // control: it *is* a palette, it just fills itself from the colours you
    // used that no preset had (see customPalette.ts). Built fresh here because
    // canvas mode is rebuilt on every frame and palette switch, so it always
    // reflects the latest picks.
    //
    // A stacked column on the rail rather than the centred row of five it used
    // to be. Full width of the rail, so "DawnBringer 16" fits at 11px with room
    // to spare — the old 110px row was sized to that name and had none.
    this.customColors = loadCustomColors();
    const yours: PixelPalette = { id: CUSTOM_PALETTE_ID, name: "Yours", colors: this.customColors };
    const paletteChoices = [...PIXEL_PALETTES, yours];
    const palette = target.paletteId === CUSTOM_PALETTE_ID ? yours : findPalette(target.paletteId);
    railY = heading(railX, railY, "Palette");
    for (const p of paletteChoices) {
      const activePalette = p.id === palette.id;
      const bg = this.add
        .rectangle(railX, railY, REFERENCE_WIDTH, 24, activePalette ? SELECTED_FILL : BUTTON_COLOR)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      // The open palette gets the same ring the armed tool and the chosen
      // colour get, rather than the hover blue it used to wear — which made the
      // open palette indistinguishable from one you were merely pointing at.
      if (activePalette) bg.setStrokeStyle(2, SELECTED_RING_COLOR);
      this.add
        .text(railX + 10, railY + 12, p.name, { fontSize: "11px", color: "#ffffff" })
        .setOrigin(0, 0.5);
      bg.on("pointerdown", () => {
        if (!this.target || !this.pixelCanvas || p.id === this.target.paletteId) return;
        // Capture the live in-progress drawing before switching, so
        // changing which palette is offered doesn't discard unsaved strokes
        // the way reloading the frame's *original* (pre-edit) cells would.
        this.target = { ...this.captureActiveFrame(), paletteId: p.id };
        this.goTo("canvas");
      });
      railY += 28;
    }
    railY += GROUP_GAP;

    // FRAMES heads the second left column when the skin has more than one pose;
    // buildFrameStrip returns where it finished so COLOURS follows it.
    left2Y = this.buildFrameStrip(target, LEFT_COL2_X, left2Y, heading);

    // --- TOOLS ---------------------------------------------------------------
    // Declared before the swatches below, since a swatch click resumes Paint
    // mode (see setTool inside the swatch handler), same "eyedropper is
    // momentary" reasoning the onColorPicked callback further down uses.
    //
    // A vertical stack in the first left column. It used to be a row
    // right-aligned across the top of the scene, closing on the centred swatch
    // row from the opposite direction — with a measured 4px between them at the
    // widest palette, which is why the labels carried no icons and why
    // skin-erase.spec.ts had a test guarding the gap. In separate columns there
    // is no gap to defend: a sixth tool lengthens this stack and touches
    // nothing. Order reads top-to-bottom as listed.
    const toolButtons: { tool: PixelTool; button: Phaser.GameObjects.Text }[] = [];
    // A ring around the armed tool, so which one is live is a shape and not
    // only a fill colour. Sized and placed by refreshToolHighlight once the
    // buttons exist and have rendered widths.
    const toolRing = this.add
      .rectangle(0, 0, 10, 10)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, SELECTED_RING_COLOR)
      .setFillStyle()
      .setVisible(false);
    const refreshToolHighlight = (): void => {
      for (const { tool, button } of toolButtons) {
        const active = tool === this.currentTool;
        this.refreshButton(button, active);
        if (!active) continue;
        toolRing.setPosition(button.x - 2, button.y).setSize(button.width + 4, button.height + 4).setVisible(true);
      }
    };
    const setTool = (tool: PixelTool): void => {
      this.currentTool = tool;
      this.pixelCanvas?.setTool(tool);
      refreshToolHighlight();
    };
    // Erase and Pan are both here because a touchscreen can reach neither
    // otherwise: erasing is right-click and panning is the wheel or the middle
    // button, and a finger has none of the three. Listed in the order they read
    // down the column, commonest first.
    const toolSpecs: { tool: PixelTool; label: string }[] = [
      { tool: "paint", label: "Paint" },
      { tool: "erase", label: "Erase" },
      { tool: "fill", label: "Fill" },
      { tool: "eyedropper", label: "Pick" },
      { tool: "pan", label: "Pan" },
    ];
    leftY = heading(LEFT_COL_X, leftY, "Tools");
    for (const { tool, label } of toolSpecs) {
      const button = this.makeSmallButton(
        LEFT_COL_X,
        leftY + SMALL_BUTTON_H / 2,
        label,
        () => setTool(tool),
        () => this.currentTool === tool,
      );
      toolButtons.push({ tool, button });
      leftY += STACK_STEP;
    }
    leftY = endGroup(leftY);
    refreshToolHighlight();

    // --- COLOURS: the palette's colours plus a transparent "eraser" ----------
    //
    // A six-wide grid in the second left column, not the single centred row it
    // used to be. The row was the reason for a lot of measured fiddling — the
    // swatch gap cut from 6 to 4 to buy 20px of clearance against the tool row
    // approaching from the right, and a guard test to keep a sixth tool from
    // landing on top of it. A grid in its own column ends all of that.
    //
    // Six columns because the widest case is bounded and known: every preset
    // palette tops out at 16 colours and MAX_CUSTOM_COLORS caps "Yours" at 16
    // too, so with the transparent swatch it is never more than 17 — three rows
    // of six, 164px wide, comfortably inside this column.
    const swatchSize = 24;
    const swatchGap = 4;
    const swatchStep = swatchSize + swatchGap;
    const SWATCH_COLS = 6;
    const swatchColors: (string | null)[] = [...palette.colors, null];
    left2Y = heading(LEFT_COL2_X, left2Y, "Colours");
    const swatchTop = left2Y;
    let sx = LEFT_COL2_X;
    let sy = swatchTop;
    // A colour the active palette doesn't contain used to be replaced by
    // palette.colors[0] right here — and since canvas mode is rebuilt on every
    // frame and palette switch, sampling a colour off a traced reference and
    // then stepping to the next frame silently lost it. Keep it instead, and
    // put it somewhere it survives (see rememberColor). Only a genuinely unset
    // colour falls back now.
    if (this.currentColor === null) {
      this.currentColor = palette.colors[0] ?? "#ffffff";
    } else if (!palette.colors.includes(this.currentColor)) {
      this.rememberColor(this.currentColor);
    }
    const swatchNodes: { color: string | null; bg: Phaser.GameObjects.Rectangle }[] = [];
    const refreshSwatchHighlight = (): void => {
      for (const node of swatchNodes) {
        const selected = node.color === this.currentColor;
        node.bg.setStrokeStyle(selected ? 3 : 1, selected ? 0xffeb3b : 0x000000, selected ? 1 : 0.4);
      }
    };
    for (const color of swatchColors) {
      const bg = this.add
        .rectangle(sx, sy, swatchSize, swatchSize, color ? Phaser.Display.Color.HexStringToColor(color).color : 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x000000, 0.4)
        .setInteractive({ useHandCursor: true })
        // Named so tests can find these without guessing from geometry — see
        // SHADE_STEP_NAME's note below.
        .setName(PALETTE_SWATCH_NAME);
      if (!color) {
        this.add.text(sx + swatchSize / 2, sy + swatchSize / 2, "✕", { fontSize: "13px", color: "#ffffff" }).setOrigin(0.5);
      }
      bg.on("pointerdown", () => {
        this.currentColor = color;
        this.pixelCanvas?.setCurrentColor(color);
        this.refreshShadeRamp?.();
        // Eyedropper auto-reverts — it's a momentary "sample and get back to
        // work" gesture, so picking a color instead of clicking the canvas
        // still counts as "done sampling." So does Erase, but only for a real
        // color: reaching for red while erasing means you want to draw in red.
        // Reaching for the transparent ✕ does not — it would swap the
        // highlighted tool out from under you for no change in behaviour,
        // since Paint with no color erases anyway.
        //
        // Fill is the opposite of both: a deliberate, sticky mode (fill one
        // region, pick a different color, fill another, repeat) — forcing it
        // back to Paint on every color change would silently break that
        // workflow before a fill click ever lands (a real bug caught in
        // testing: Fill -> pick a color -> click the canvas only ever painted
        // one cell, because this handler had already switched the tool back to
        // Paint out from under the click).
        if (this.currentTool === "eyedropper" || (this.currentTool === "erase" && color !== null)) setTool("paint");
        refreshSwatchHighlight();
      });
      swatchNodes.push({ color, bg });
      sx += swatchStep;
      if (sx >= LEFT_COL2_X + SWATCH_COLS * swatchStep) {
        sx = LEFT_COL2_X;
        sy += swatchStep;
      }
    }
    refreshSwatchHighlight();
    // One row past whichever row the last swatch landed on — `sx` back at the
    // column's left edge means the loop already wrapped and `sy` is that row.
    left2Y = (sx === LEFT_COL2_X ? sy : sy + swatchStep) - swatchGap + GROUP_GAP;

    // "Yours" starts empty, and an empty grid is indistinguishable from a broken
    // one — say what fills it instead. Below the swatches rather than beside
    // them: with no colours the grid *is* the single transparent swatch, and
    // this column is not wide enough to put a sentence next to it.
    //
    // Its own height is added to the column, which is the whole reason it is
    // placed here rather than with the swatches: an empty palette leaves the
    // grid one row tall, and a two-line hint hanging off the bottom of a
    // one-row grid ran straight through the SHADES heading below. Not caught by
    // assertLayoutSound — it only compares *interactive* text, and this is a
    // label — so it took reading a screenshot.
    if (palette.colors.length === 0) {
      const hint = this.add
        .text(LEFT_COL2_X, left2Y - GROUP_GAP + 4, "Colours you\npick land here", {
          fontSize: "11px",
          color: "#8a8ab0",
          lineSpacing: 2,
        })
        .setOrigin(0, 0);
      left2Y = hint.y + hint.height + GROUP_GAP;
    }

    // --- SHADES: one step darker and one step lighter than the selected colour,
    // directly under the swatches it derives from.
    //
    // Deliberately a ramp for the *selected* colour rather than a darker and
    // lighter row stacked around every swatch. Shading only ever needs the
    // neighbours of the colour in your hand, and three swatches say that as well
    // as thirty-two do while leaving this column short enough to hold FRAMES
    // above it.
    const rampSize = 24;
    const rampGap = 4;
    const rampX = LEFT_COL2_X;
    const rampY = heading(rampX, left2Y, "Shades");
    const rampNodes: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
    for (let i = 0; i < 3; i++) {
      const x = rampX + i * (rampSize + rampGap);
      const bg = this.add
        .rectangle(x, rampY, rampSize, rampSize, 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x000000, 0.4)
        .setInteractive({ useHandCursor: true })
        .setName(SHADE_STEP_NAME);
      const label = this.add
        .text(x + rampSize / 2, rampY + rampSize / 2, "", { fontSize: "11px", color: "#ffffff" })
        .setOrigin(0.5);
      rampNodes.push({ bg, label });
    }
    this.refreshShadeRamp = (): void => {
      const ramp = this.currentColor ? shadeRamp(this.currentColor) : { darker: null, base: null, lighter: null };
      // Middle is always the colour itself, so the ramp reads as "darker · this
      // · lighter" rather than two mystery swatches.
      const steps: (string | null)[] = [ramp.darker, ramp.base, ramp.lighter];
      const marks = ["−", "", "+"];
      rampNodes.forEach(({ bg, label }, i) => {
        const color = steps[i];
        // A step that would do nothing (black cannot darken) is hidden rather
        // than shown as a duplicate that ignores clicks.
        bg.setVisible(color !== null);
        label.setVisible(color !== null && i !== 1);
        if (color === null) return;
        bg.setFillStyle(Phaser.Display.Color.HexStringToColor(color).color);
        bg.setStrokeStyle(i === 1 ? 3 : 1, i === 1 ? 0xffeb3b : 0x000000, i === 1 ? 1 : 0.4);
        label.setText(marks[i]);
      });
    };
    rampNodes.forEach(({ bg }, i) => {
      bg.on("pointerdown", () => {
        const ramp = this.currentColor ? shadeRamp(this.currentColor) : null;
        const picked = ramp ? [ramp.darker, ramp.base, ramp.lighter][i] : null;
        if (picked === null) return;
        this.currentColor = picked;
        this.pixelCanvas?.setCurrentColor(picked);
        // A shade step is off-palette by construction — this is the other half
        // of what "Yours" is for.
        if (!palette.colors.includes(picked)) this.rememberColor(picked);
        refreshSwatchHighlight();
        this.refreshShadeRamp?.();
      });
    });
    this.refreshShadeRamp();

    // --- the painting window itself. Fixed size and position: at fit zoom the
    // drawing fills it exactly, and zooming in grows the drawing inside it
    // rather than the window (see canvasZoom.ts for why the old grow-the-canvas
    // model could never exceed a 1.6x range in a 468px-tall scene). ---
    const canvasRect: GameRect = {
      x: (GAME_WIDTH - VIEWPORT_SIZE) / 2,
      y: CANVAS_TOP_Y,
      width: VIEWPORT_SIZE,
      height: VIEWPORT_SIZE,
    };
    this.pixelCanvas = new PixelCanvasOverlay({
      scene: this,
      viewport: canvasRect,
      initialCells: target.frameCells[target.activeFrame],
      onPaint: () => {
        /* live strokes need no per-cell UI feedback beyond the canvas's own redraw */
      },
      onColorPicked: (picked) => {
        // Eyedropper is momentary — sampling a color resumes Paint with
        // it immediately rather than requiring a manual switch back, same
        // "pick a color, keep working" flow every other pixel-art tool
        // gives this gesture.
        this.currentColor = picked;
        // The eyedropper is where off-palette colours come from — a traced
        // reference is a photograph, not a 16-colour palette.
        if (picked !== null && !palette.colors.includes(picked)) this.rememberColor(picked);
        refreshSwatchHighlight();
        this.refreshShadeRamp?.();
        setTool("paint");
      },
      gridSize: gridSizeFor(target.brush.id),
      initialView: this.view,
      // Fires for the wheel and drag gestures too, not just the buttons, so the
      // readout can never disagree with what is on screen.
      onViewChange: (view) => {
        this.view = view;
        this.zoomReadout?.setText(formatZoom(view.zoomIndex));
      },
    });
    this.pixelCanvas.setCurrentColor(this.currentColor);
    this.pixelCanvas.setTool(this.currentTool);
    this.pixelCanvas.setMirrorX(this.mirrorEnabled);
    this.pixelCanvas.setGridVisible(this.gridVisible);
    // The canvas is thrown away and rebuilt on every frame and palette switch,
    // so the reference has to be re-applied rather than set once.
    this.pixelCanvas.setReferenceImage(this.referenceDataUrl);

    // --- VIEW, under TOOLS in the first left column -------------------------
    // Everything about *looking* at the drawing, kept together and below the
    // tools that draw on it. Built here rather than up with TOOLS because these
    // buttons all reach into `this.pixelCanvas`, which only exists from the line
    // above; `leftY` has carried the column's position down to meet them.
    leftY = heading(LEFT_COL_X, leftY, "View");
    this.makeSmallButton(LEFT_COL_X, leftY + SMALL_BUTTON_H / 2, "＋ Zoom", () => this.adjustZoom(1));
    leftY += STACK_STEP;
    this.makeSmallButton(LEFT_COL_X, leftY + SMALL_BUTTON_H / 2, "－ Zoom", () => this.adjustZoom(-1));
    leftY += STACK_STEP;
    this.makeSmallButton(LEFT_COL_X, leftY + SMALL_BUTTON_H / 2, "Fit", () => {
      this.pixelCanvas?.fitToViewport();
    });
    leftY += STACK_STEP;
    const gridButton = this.makeSmallButton(
      LEFT_COL_X,
      leftY + SMALL_BUTTON_H / 2,
      this.gridVisible ? "Grid: On" : "Grid: Off",
      () => {
        this.gridVisible = !this.gridVisible;
        this.pixelCanvas?.setGridVisible(this.gridVisible);
        gridButton.setText(this.gridVisible ? "Grid: On" : "Grid: Off");
        this.refreshButton(gridButton, this.gridVisible);
      },
      () => this.gridVisible,
    );
    leftY += STACK_STEP;
    // Where you are on the ladder, in plain multiples of "the whole sprite" —
    // without it, three clicks of Zoom + and three of Zoom − are indistinguishable
    // from having done nothing.
    this.zoomReadout = this.add
      .text(LEFT_COL_X, leftY + 2, formatZoom(this.view.zoomIndex), { fontSize: "13px", color: "#ffffff" })
      .setOrigin(0, 0);
    // The gestures the buttons above have no equivalent for, kept at the foot
    // of the group they belong to rather than floating mid-column.
    this.add.text(LEFT_COL_X, leftY + 22, "Scroll to pan", { fontSize: "10px", color: "#8a8ab0" });
    this.add.text(LEFT_COL_X, leftY + 36, "Ctrl+scroll zooms", { fontSize: "10px", color: "#8a8ab0" });

    // --- DRAWING, REFERENCE, THIS SKIN — continuing the right rail under
    // PALETTE. One left edge for the whole rail: the reference picker is the
    // widest thing in it (260px — its dropdown labels need the room, see
    // buildReferenceControls) and has to end at the right margin, so its left
    // edge is what everything else aligns to; three different x values read as
    // ragged rather than as a column.
    railY = heading(railX, railY, "Drawing");
    const mirrorButton = this.makeSmallButton(
      railX,
      railY + SMALL_BUTTON_H / 2,
      this.mirrorEnabled ? "Mirror: On" : "Mirror: Off",
      () => {
        this.mirrorEnabled = !this.mirrorEnabled;
        this.pixelCanvas?.setMirrorX(this.mirrorEnabled);
        mirrorButton.setText(this.mirrorEnabled ? "Mirror: On" : "Mirror: Off");
        this.refreshButton(mirrorButton, this.mirrorEnabled);
      },
      () => this.mirrorEnabled,
    );
    railY += STACK_STEP;
    // Clear (two-tap confirm, same shape as EditorUI's Clear/Delete Area)
    this.clearButton = this.makeSmallButton(railX, railY + SMALL_BUTTON_H / 2, "Clear", () => this.onClearClicked());
    railY = endGroup(railY + STACK_STEP);

    railY = heading(railX, railY, "Reference");
    this.buildReferenceControls(target, railY + 13);
    railY = endGroup(railY + STACK_STEP * 2);

    // "Set as default" lives here as well as in the level editor because the
    // player character is only reachable from this scene — it is deliberately
    // not a Palette brush (see CHARACTER_BRUSH), so it has no picker over
    // there, and without this a painted character could be saved and never
    // worn by anything. Two-tap confirmed, same as Clear, since it reaches
    // every level that hasn't chosen for itself.
    railY = heading(railX, railY, "This skin");
    this.defaultButton = this.makeSmallButton(railX, railY + SMALL_BUTTON_H / 2, "Set as default", () =>
      this.onSetDefaultClicked(),
    );
  }

  /** Makes the skin currently open the library default for its brush — see
   * skinStorage.setActiveSkin, the only thing that moves a default. Requires a
   * save first: an unsaved drawing has no library entry to point at. */
  private onSetDefaultClicked(): void {
    if (!this.target || !this.defaultButton) return;
    if (!this.target.existingId) {
      this.statusText?.setText("Save it first, then it can become the default").setColor("#ffeb3b");
      return;
    }
    if (!this.defaultArmed) {
      this.defaultArmed = true;
      this.defaultButton.setText("For every level?").setStyle({ backgroundColor: "#aa3333" });
      this.defaultArmTimer = this.time.delayedCall(ARM_TIMEOUT_MS, () => {
        this.defaultArmed = false;
        this.defaultButton?.setText("Set as default").setStyle({ backgroundColor: BUTTON_HEX });
      });
      return;
    }
    this.defaultArmTimer?.remove(false);
    this.defaultArmed = false;
    this.defaultButton.setText("Set as default").setStyle({ backgroundColor: BUTTON_HEX });
    const { brush, existingId } = this.target;
    void setActiveSkin(brush.id, existingId)
      .then(() => this.statusText?.setText(`${brush.label}: default set for every level`).setColor("#4ade80"))
      .catch((err: unknown) => {
        console.error("Setting the default skin failed:", err);
        this.statusText?.setText("Couldn't set that default").setColor("#ff6666");
      });
  }

  /** One step on the zoom ladder, about the middle of the window. Pure CSS
   * inside PixelCanvasOverlay — no scene rebuild, so it can't disturb the
   * undo/redo history or drop an in-progress stroke the way routing this
   * through goTo("canvas") (like the palette switcher does) would. `this.view`
   * is updated by the overlay's own onViewChange rather than here, so the
   * persisted copy reflects the *clamped* result and matches what the wheel and
   * drag gestures produce. */
  private adjustZoom(delta: number): void {
    this.pixelCanvas?.zoomBy(delta);
  }

  private onClearClicked(): void {
    if (!this.clearButton) return;
    if (this.clearArmed) {
      this.clearArmTimer?.remove(false);
      this.clearArmed = false;
      this.clearButton.setText("Clear").setStyle({ backgroundColor: BUTTON_HEX });
      this.pixelCanvas?.clearAll();
      return;
    }
    this.clearArmed = true;
    this.clearButton.setText("Clear?").setStyle({ backgroundColor: "#aa3333" });
    this.clearArmTimer = this.time.delayedCall(ARM_TIMEOUT_MS, () => {
      this.clearArmed = false;
      this.clearButton?.setText("Clear").setStyle({ backgroundColor: BUTTON_HEX });
    });
  }

  /**
   * The tracing controls: a picker of everything available to trace, and a
   * button that stamps the chosen one in as a starting point.
   *
   * Reuses AssetPickerMenu — the same trigger-plus-thumbnail-grid the level
   * editor already uses for skins, backgrounds and music — so this needs no
   * new UI vocabulary and behaves exactly like the pickers next door.
   */
  private buildReferenceControls(target: EditingTarget, y: number): void {
    // Wide enough that four tiles' labels ("Grampa walk1") don't run into each
    // other, and far enough left to clear the canvas's own right edge at every
    // zoom level. A narrow trigger was tried first: the dropdown inherits the
    // trigger's width, so its labels collided and its rows ran off the bottom.
    const width = REFERENCE_WIDTH;
    const x = GAME_WIDTH - 24 - width;

    this.referencePicker = new AssetPickerMenu({
      scene: this,
      trigger: { x, y: y - 13, width, height: 26 },
      columns: 4,
      itemSize: 30,
      triggerDepth: 10,
      dropdownDepth: 20,
      onSelect: (id) => void this.selectReference(id),
    });
    this.setReferenceLabel();

    // Resolved when the dropdown is built rather than up front: the saved-skin
    // half needs a Drive read, and canvas mode is rebuilt on every frame and
    // palette switch.
    void this.refreshReferenceItems();

    this.makeSmallButton(x, y + 32, "Trace in", () => void this.traceReferenceIn(target));
  }

  private setReferenceLabel(): void {
    const source = this.referenceSources.find((candidate) => candidate.id === this.referenceId);
    this.referencePicker?.setTriggerLabel(`Trace: ${source?.label ?? "None"} ▾`);
  }

  /** Built-in art first, then every saved pixel skin. Thumbnails for the
   * built-ins are their own already-loaded textures; saved skins reuse
   * resolveSkinThumbnails, exactly as the browse list does. */
  private async refreshReferenceItems(): Promise<void> {
    const sources: ReferenceSource[] = [...builtInReferenceSources(this.target?.brush.id)];
    try {
      const saved = await listPixelSkins();
      const thumbsByBrush = new Map<string, Awaited<ReturnType<typeof resolveSkinThumbnails>>>();
      for (const brushId of new Set(saved.map((entry) => entry.brushId))) {
        thumbsByBrush.set(brushId, await resolveSkinThumbnails(this, brushId));
      }
      for (const { brushId, asset } of saved) {
        const textureKey = thumbsByBrush.get(brushId)?.find((thumb) => thumb.id === asset.id)?.textureKey;
        if (!textureKey) continue;
        // The skin's own name, not "Ghost skin" for every one of them — a
        // trace list of three identical labels is no more use than a browse
        // list of three identical rows was.
        const brushLabel = skinTargets(this.customDefs).find((brush) => brush.id === brushId)?.label ?? brushId;
        sources.push({
          id: skinReferenceId(brushId, asset.id),
          label: displaySkinName(asset, brushLabel),
          textureKey,
          kind: "skin",
        });
      }
    } catch (err) {
      // The built-in half still works offline, which is the half that matters
      // most, so this degrades rather than failing the whole picker.
      console.error("Couldn't list saved skins for tracing:", err);
    }
    if (this.mode !== "canvas") return;

    this.referenceSources = sources;
    const items: AssetPickerItem[] = [
      { id: NO_REFERENCE_ID, label: "None", textureKey: "marker-spawn" },
      ...sources.map((source) => ({ id: source.id, label: source.label, textureKey: source.textureKey })),
    ];
    this.referencePicker?.setItems(items, this.referenceId);
    this.setReferenceLabel();
  }

  /** Resolves a picked source to a data URL and shows it under the canvas. */
  private async selectReference(id: string): Promise<void> {
    this.referenceId = id;
    this.referenceDataUrl = await this.resolveReferenceDataUrl(id);
    this.pixelCanvas?.setReferenceImage(this.referenceDataUrl);
    this.setReferenceLabel();
    this.referencePicker?.setItems(
      [
        { id: NO_REFERENCE_ID, label: "None", textureKey: "marker-spawn" },
        ...this.referenceSources.map((s) => ({ id: s.id, label: s.label, textureKey: s.textureKey })),
      ],
      this.referenceId,
    );
  }

  private async resolveReferenceDataUrl(id: string): Promise<string | null> {
    const parsed = parseReferenceId(id);
    if (!parsed) return null;
    if (parsed.kind === "builtin") {
      // Phaser can hand back a data URL for any loaded texture, which is what
      // makes the built-in art usable here at all — verified against the real
      // frames before this was built on.
      return this.textures.exists(parsed.parts[0]) ? this.textures.getBase64(parsed.parts[0]) : null;
    }
    const [brushId, assetId] = parsed.parts;
    const skins = await loadCustomSkins();
    const asset = skins[brushId]?.items.find((item) => item.id === assetId);
    return asset?.imageData ?? null;
  }

  private async traceReferenceIn(target: EditingTarget): Promise<void> {
    if (!this.referenceDataUrl || !this.pixelCanvas) {
      this.statusText?.setText("Pick something to trace first").setColor("#ffeb3b");
      return;
    }
    try {
      // Fitted, not stretched: the built-in art isn't square (29x48 for
      // Grampa's idle), so a plain scale-to-fill would distort what you traced
      // relative to what the reference layer showed you.
      const cells = await cellsFromImageFitted(this.referenceDataUrl, gridSizeFor(target.brush.id));
      if (this.mode !== "canvas") return;
      this.pixelCanvas.stampCells(cells);
      this.statusText?.setText("Traced in — Undo to take it back").setColor("#4ade80");
    } catch (err) {
      console.error("Couldn't trace that reference in:", err);
      this.statusText?.setText("Couldn't trace that in").setColor("#ff6666");
    }
  }

  /**
   * One button per frame for an animated target, heading the left column it
   * shares with the colours. A painted frame is filled and labelled plainly; an
   * unpainted one is dimmed and marked with a dot, so "which poses have I
   * actually done" is answerable at a glance rather than by clicking through
   * all five.
   *
   * Nothing at all for a single-frame skin — no strip, no heading, and the
   * colours below simply start higher, so an ordinary coin skin loses no room.
   *
   * Returns where the column has reached, so the caller can carry on beneath it
   * without knowing whether anything was drawn.
   */
  private buildFrameStrip(
    target: EditingTarget,
    x: number,
    top: number,
    heading: (x: number, y: number, text: string) => number,
  ): number {
    const plan = framePlanFor(target.brush.id);
    if (!plan) return top;

    const buttonWidth = 96;
    const rowHeight = 30;
    let y = heading(x, top, "Frames");

    for (const name of plan.frames) {
      const painted = hasPaintedCells(target.frameCells[name]);
      const active = name === target.activeFrame;
      const bg = this.add
        .rectangle(x, y, buttonWidth, 26, active ? SELECTED_FILL : painted ? BUTTON_COLOR : 0x16213e)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      // Same ring as the armed tool and the open palette — the frame you are
      // drawing on used to be marked with the hover blue alone.
      if (active) bg.setStrokeStyle(2, SELECTED_RING_COLOR);
      // An unpainted frame is dimmed and dotted, so "which poses have I
      // actually drawn" is answerable at a glance instead of by clicking
      // through all five.
      this.add
        .text(x + 10, y + 13, painted ? name : `${name} ·`, {
          fontSize: "12px",
          // Dimmed while unpainted, but never on the selected row: grey on the
          // amber selected fill is unreadable.
          color: active || painted ? "#ffffff" : "#8a8ab0",
        })
        .setOrigin(0, 0.5);
      bg.on("pointerdown", () => this.switchFrame(name));
      y += rowHeight;
    }
    // The loop leaves y one row past the last button's top, i.e. 4px below its
    // bottom edge; back up to that edge before adding the gap to the next group.
    return y - (rowHeight - 26) + GROUP_GAP;
  }

  /** Folds whatever is on the live canvas back into the target's own frame
   * map. Every path that tears the canvas down — switching frame, switching
   * palette, saving — has to go through this first, or that frame's unsaved
   * strokes die with the canvas. */
  private captureActiveFrame(): EditingTarget {
    const target = this.target!;
    if (!this.pixelCanvas) return target;
    return {
      ...target,
      frameCells: { ...target.frameCells, [target.activeFrame]: this.pixelCanvas.getCells() },
    };
  }

  private switchFrame(name: string): void {
    if (!this.target || name === this.target.activeFrame) return;
    this.target = { ...this.captureActiveFrame(), activeFrame: name };
    this.goTo("canvas");
  }

  private onSave(): void {
    if (!this.target || !this.pixelCanvas) return;
    const target = this.captureActiveFrame();
    this.target = target;
    const plan = framePlanFor(target.brush.id);
    const uploadedBy = loadActiveProfile() ?? "unknown";

    // Only PNGs are persisted — a PNG already *is* the cell grid, one canvas
    // pixel per cell (see PixelSkinData.cells for the measured reasoning
    // behind dropping the second copy). Frames other than the one on screen
    // have no live canvas to export from, so they're rendered from their
    // cells instead; the two paths produce byte-identical output by
    // construction (see cellsToPngDataUrl).
    let imageData: string;
    let frames: Record<string, string> | undefined;

    if (!plan) {
      imageData = this.pixelCanvas.exportPngDataUrl();
    } else {
      const gridSize = gridSizeFor(target.brush.id);
      const base = baseFrameOf(plan);
      frames = {};
      for (const name of plan.frames) {
        const cells = target.frameCells[name];
        // An all-blank frame is "not painted yet", not "painted invisible" —
        // writing it would give the skin a blank pose and make resolveFrame's
        // fallback unreachable for it.
        if (!hasPaintedCells(cells)) continue;
        frames[name] = cellsToPngDataUrl(cells!, gridSize);
      }
      if (!frames[base]) {
        this.statusText?.setText(`Paint the ${base} frame first — the others fall back to it`).setColor("#ffeb3b");
        return;
      }
      imageData = frames[base];
    }

    // Sanitized here rather than in storage: this is the layer that knows what
    // a blank should fall back to for *this* skin (its own current name, or the
    // brush's default), the same way LevelNameInput knows about "Untitled
    // Level". Storage just persists what it is handed.
    const name = sanitizeSkinName(target.name, defaultSkinName(target.brush.label, []));

    void savePixelSkin(target.brush.id, target.existingId, imageData, { paletteId: target.paletteId }, uploadedBy, frames, name)
      .then((id) => {
        this.target = { ...target, existingId: id, name };
        const painted = frames ? ` (${Object.keys(frames).length} frame${Object.keys(frames).length === 1 ? "" : "s"})` : "";
        // Says where it went, because as of 2026-08-23 saving deliberately
        // changes nothing anyone can see yet. Before that it silently became
        // the look of this brush in every level; now it joins the library and
        // waits to be picked. Without this line that reads as a broken Save.
        this.statusText
          ?.setText(`Saved${painted} — pick it in a level's Skin menu to use it`)
          .setColor("#4ade80");
      })
      .catch((err: unknown) => {
        console.error("Pixel skin save failed:", err);
        this.statusText?.setText("Couldn't save that skin").setColor("#ff6666");
      });
  }
}
