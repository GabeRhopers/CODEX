import Phaser from "phaser";
import { GAME_WIDTH } from "../config/gameConfig";
import { GameRect } from "../editor/domOverlay";
import { AssetPickerItem, AssetPickerMenu } from "../editor/AssetPickerMenu";
import { Brush, PALETTE, UP_BASKET_TINT_COLOR } from "../editor/Palette";
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
// off the scene's 468px floor however far someone zooms in. 132 + 320 = 452.
const CANVAS_TOP_Y = 132;
/** Width of the reference picker, and therefore of the whole right rail — see
 * buildReferenceControls for why the picker cannot be narrower. */
const REFERENCE_WIDTH = 260;

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
 * the one most people are looking for, then every skinnable brush. */
function skinTargets(): Brush[] {
  return [CHARACTER_BRUSH, ...PALETTE.filter((b) => b.entityType)];
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

  constructor() {
    super("SkinEditor");
  }

  create(): void {
    this.mode = "browse";
    this.target = undefined;
    this.rebuild();

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

  private addBackButton(onClick: () => void): void {
    this.add
      .text(24, 20, "← Back", {
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
    this.addBackButton(() => this.scene.start("Menu"));
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
      const brushesById = new Map(skinTargets().map((b) => [b.id, b]));
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
      .text(GAME_WIDTH / 2, 24, "Choose an entity to paint a skin for", { fontSize: "18px", color: "#ffffff" })
      .setOrigin(0.5, 0);

    const skinnable = skinTargets();
    const columns = 6;
    const cellW = 150;
    const cellH = 64;
    const gridWidth = columns * cellW;
    const x0 = (GAME_WIDTH - gridWidth) / 2;
    const y0 = ROW_START_Y;

    skinnable.forEach((brush, i) => {
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

      const onClick = () => {
        const plan = framePlanFor(brush.id);
        // Async only to read the brush's existing names, so the default is
        // "Ghost 2" rather than a second "Ghost 1". The canvas opens either
        // way — existingNamesFor swallows a failed read.
        void this.nextDefaultName(brush).then((name) => {
          if (this.mode !== "pick-brush") return; // navigated away meanwhile
          this.target = {
            brush,
            existingId: undefined,
            name,
            paletteId: DEFAULT_PIXEL_PALETTE_ID,
            frameCells: {},
            activeFrame: plan ? baseFrameOf(plan) : SINGLE_FRAME,
          };
          this.goTo("canvas");
        });
      };
      icon.on("pointerdown", onClick);
      label.setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
    });
  }

  // --- mode: canvas --------------------------------------------------------

  private buildCanvas(): void {
    const target = this.target;
    if (!target) {
      this.goTo("browse");
      return;
    }

    this.addBackButton(() => this.goTo("browse"));
    // The brush is now context rather than the headline — the name field is
    // what identifies the skin, so "Editing: Ghost" moves out of the centre and
    // left, into the empty band between Back and the name field.
    this.add
      .text(150, 20, `Editing: ${target.brush.label}`, { fontSize: "14px", color: "#a6a6c8" })
      .setOrigin(0, 0);

    // The name field. Reuses LevelNameInput rather than a second DOM input of
    // its own: that class carries the capture-phase blur that makes clicking
    // Save commit an in-progress edit (rather than saving the previous name),
    // and the keydown stopPropagation that stops a space in a name reaching
    // Phaser's shortcuts. Both were found the hard way; a copy would lose them.
    this.nameInput = new LevelNameInput(
      this,
      { x: GAME_WIDTH / 2 - 120, y: 14, width: 240, height: 26 },
      target.name,
      (value) => {
        if (this.target) this.target.name = value;
      },
      { fallback: target.name, placeholder: "Skin name" },
    );

    // --- header right cluster: Undo, Redo, Save — Save stays at its
    // fixed spot; Redo/Undo are auto-width Text buttons (makeSmallButton
    // has no fixed-width rectangle the way EditorUI's header buttons do),
    // so each is positioned from its *own* rendered `.width` immediately
    // after creation, right-to-left, rather than a guessed pixel offset. ---
    const saveButton = this.makeSmallButton(GAME_WIDTH - 24 - 60, 20 + 10, "Save", () => this.onSave());
    const redoButton = this.makeSmallButton(0, 20 + 10, "↷ Redo", () => this.performRedo());
    redoButton.setX(saveButton.x - 8 - redoButton.width);
    const undoButton = this.makeSmallButton(0, 20 + 10, "↶ Undo", () => this.performUndo());
    undoButton.setX(redoButton.x - 8 - undoButton.width);

    this.statusText = this.add.text(GAME_WIDTH / 2, 44, "", { fontSize: "12px", color: "#4ade80" }).setOrigin(0.5, 0);

    // --- palette selector row ---
    // "Yours" is offered alongside the presets rather than as a separate
    // control: it *is* a palette, it just fills itself from the colours you
    // used that no preset had (see customPalette.ts). Built fresh here because
    // canvas mode is rebuilt on every frame and palette switch, so it always
    // reflects the latest picks.
    this.customColors = loadCustomColors();
    const yours: PixelPalette = { id: CUSTOM_PALETTE_ID, name: "Yours", colors: this.customColors };
    const paletteChoices = [...PIXEL_PALETTES, yours];
    const palette = target.paletteId === CUSTOM_PALETTE_ID ? yours : findPalette(target.paletteId);
    const paletteButtonWidth = 110;
    const paletteRowWidth = paletteChoices.length * (paletteButtonWidth + 8) - 8;
    let px = (GAME_WIDTH - paletteRowWidth) / 2;
    for (const p of paletteChoices) {
      const activePalette = p.id === palette.id;
      const bg = this.add
        .rectangle(px, 62, paletteButtonWidth, 24, activePalette ? SELECTED_FILL : BUTTON_COLOR)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      // The open palette gets the same ring the armed tool and the chosen
      // colour get, rather than the hover blue it used to wear — which made the
      // open palette indistinguishable from one you were merely pointing at.
      if (activePalette) bg.setStrokeStyle(2, SELECTED_RING_COLOR);
      this.add.text(px + paletteButtonWidth / 2, 74, p.name, { fontSize: "11px", color: "#ffffff" }).setOrigin(0.5);
      bg.on("pointerdown", () => {
        if (!this.target || !this.pixelCanvas || p.id === this.target.paletteId) return;
        // Capture the live in-progress drawing before switching, so
        // changing which palette is offered doesn't discard unsaved strokes
        // the way reloading the frame's *original* (pre-edit) cells would.
        this.target = { ...this.captureActiveFrame(), paletteId: p.id };
        this.goTo("canvas");
      });
      px += paletteButtonWidth + 8;
    }

    this.buildFrameStrip(target);

    // --- tool-mode buttons, right-aligned on the swatch row's own y —
    // declared before the swatch row below since a swatch click resumes Paint
    // mode (see setTool inside the swatch handler), same "eyedropper is
    // momentary" reasoning the onColorPicked callback further down uses.
    //
    // Laid out right-to-left from the row's right edge rather than relative to
    // the swatch row's own (palette-dependent) width, and built from a list so
    // adding a tool is one entry rather than another hand-chained setX. Order
    // below is right-to-left, so it reads Pan · Paint · Erase · Fill · Pick on
    // screen. Clearance against the widest 17-swatch palette is measured, not
    // assumed — see the e2e check in skin-erase.spec.ts, which is what stops a
    // sixth tool silently sliding under the swatches. ---
    const sy = 96;
    const TOOL_GAP = 6;
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
    // button, and a finger has none of the three.
    // No icon prefixes on this row, and the reason is measured rather than
    // aesthetic: the swatch row is centred and the tool row is right-aligned, so
    // they close on each other, and the widest palette already left only ~4px
    // between them. Prefixing all five labels widened the row by ~47px and put
    // the tool buttons 43px *over* the swatches. The row's clarity problem was
    // never the labels anyway — it was that the armed tool wasn't visible, which
    // SELECTED_COLOR and the ring now handle. Icons live where there is room:
    // Undo/Redo above and the zoom buttons on the View rail.
    const toolSpecs: { tool: PixelTool; label: string }[] = [
      { tool: "eyedropper", label: "Pick" },
      { tool: "fill", label: "Fill" },
      { tool: "erase", label: "Erase" },
      { tool: "paint", label: "Paint" },
      { tool: "pan", label: "Pan" },
    ];
    let toolRight = GAME_WIDTH - 24;
    for (const { tool, label } of toolSpecs) {
      const button = this.makeSmallButton(0, sy + 12, label, () => setTool(tool), () => this.currentTool === tool);
      button.setX(toolRight - button.width);
      toolRight = button.x - TOOL_GAP;
      toolButtons.push({ tool, button });
    }
    refreshToolHighlight();

    // --- color swatch row (palette colors + a transparent "eraser") ---
    // The gap was 6 until the Erase tool arrived. This row is centred and the
    // tool row is right-aligned, so the two close on each other from opposite
    // directions, and a fifth tool left a measured 4px between them. Taking 2px
    // off each of the widest palette's 16 gaps buys back 32px of centred row —
    // 20px of clearance — which is a cheaper fix than exiling Pan to the View
    // column and splitting five mutually-exclusive tools across two corners of
    // the screen. The swatches are still 24px targets; only the air between
    // them shrank. skin-erase.spec.ts measures the result.
    const swatchSize = 24;
    const swatchGap = 4;
    const swatchColors: (string | null)[] = [...palette.colors, null];
    const swatchRowWidth = swatchColors.length * (swatchSize + swatchGap) - swatchGap;
    let sx = (GAME_WIDTH - swatchRowWidth) / 2;
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
    // "Yours" starts empty, and an empty row is indistinguishable from a broken
    // one — say what fills it instead. Right-aligned to end just before the
    // row's own transparent swatch rather than centred on the row: with no
    // colours the row *is* that one swatch, sitting dead centre, so a centred
    // hint reads straight through it.
    if (palette.colors.length === 0) {
      this.add
        .text(sx - 10, sy + swatchSize / 2, "Colours you pick land here", { fontSize: "11px", color: "#8a8ab0" })
        .setOrigin(1, 0.5);
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
        .setInteractive({ useHandCursor: true });
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
      sx += swatchSize + swatchGap;
    }
    refreshSwatchHighlight();

    // --- shade ramp: one step darker and one step lighter than the selected
    // colour, immediately left of the palette row on the same line.
    //
    // Deliberately a ramp for the *selected* colour rather than a darker and
    // lighter row stacked around every swatch. Stacking costs 52px of height
    // (three 24px rows plus gaps against one), and there is nowhere to take it
    // from except the canvas: the palette row ends at y=86 and the painting
    // window starts at 132, so the whole budget is 46px. Shrinking the drawing
    // surface from 320px to 268px — permanently, on every skin — to show 32
    // extra swatches, when shading only ever needs the neighbours of the colour
    // in your hand, is the wrong trade. This costs no height at all: the row
    // left of the centred palette was empty.
    const rampSize = 24;
    const rampGap = 4;
    const rampX = 150;
    this.add.text(rampX, sy - 14, "SHADES", { fontSize: "10px", color: "#8a8ab0", fontStyle: "bold" });
    const rampNodes: { bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] = [];
    for (let i = 0; i < 3; i++) {
      const x = rampX + i * (rampSize + rampGap);
      const bg = this.add
        .rectangle(x, sy, rampSize, rampSize, 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(1, 0x000000, 0.4)
        .setInteractive({ useHandCursor: true });
      const label = this.add
        .text(x + rampSize / 2, sy + rampSize / 2, "", { fontSize: "11px", color: "#ffffff" })
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

    // --- the side rails.
    //
    // These used to be two unrelated stacks ~1200px apart: "View" on the left,
    // and an unlabelled pile on the right holding Mirror (a drawing mode),
    // Clear (destructive), the reference controls (tracing) and Set as default
    // (publishing). Four different jobs with nothing saying so, and you had to
    // sweep the whole screen to find any one of them.
    //
    // Now each rail carries a heading and holds one kind of thing: the left is
    // everything about *looking* at the drawing, the right everything about
    // *the drawing itself*. Both stay at their old x — 40 and GAME_WIDTH-154 —
    // which the 320px window (x 365..685) never reaches at any zoom, since
    // zooming grows the art inside a fixed window rather than the window.
    const railHeading = (x: number, y: number, text: string): void => {
      this.add.text(x, y, text.toUpperCase(), { fontSize: "10px", color: "#8a8ab0", fontStyle: "bold" });
    };

    railHeading(40, canvasRect.y + 6, "View");
    this.makeSmallButton(40, canvasRect.y + 40, "＋ Zoom", () => this.adjustZoom(1));
    this.makeSmallButton(40, canvasRect.y + 80, "－ Zoom", () => this.adjustZoom(-1));
    this.makeSmallButton(40, canvasRect.y + 120, "Fit", () => {
      this.pixelCanvas?.fitToViewport();
    });
    // Where you are on the ladder, in plain multiples of "the whole sprite" —
    // without it, three clicks of Zoom + and three of Zoom − are indistinguishable
    // from having done nothing.
    this.zoomReadout = this.add
      .text(40, canvasRect.y + 152, formatZoom(this.view.zoomIndex), { fontSize: "13px", color: "#ffffff" })
      .setOrigin(0, 0.5);
    const gridButton = this.makeSmallButton(
      40,
      canvasRect.y + 178,
      this.gridVisible ? "Grid: On" : "Grid: Off",
      () => {
        this.gridVisible = !this.gridVisible;
        this.pixelCanvas?.setGridVisible(this.gridVisible);
        gridButton.setText(this.gridVisible ? "Grid: On" : "Grid: Off");
        this.refreshButton(gridButton, this.gridVisible);
      },
      () => this.gridVisible,
    );
    // The gestures the buttons above have no equivalent for, kept at the foot
    // of the rail they belong to rather than floating mid-column.
    this.add.text(40, canvasRect.y + 208, "Scroll to pan", { fontSize: "10px", color: "#8a8ab0" });
    this.add.text(40, canvasRect.y + 222, "Ctrl+scroll zooms", { fontSize: "10px", color: "#8a8ab0" });

    // One left edge for the whole rail. The reference picker is the widest
    // thing in it (260px — its dropdown labels need the room, see
    // buildReferenceControls) and has to end at the right margin, so its left
    // edge is what everything else aligns to; three different x values read as
    // ragged rather than as a column. Still 81px clear of the canvas window's
    // right edge at 685, at any zoom.
    const railX = GAME_WIDTH - 24 - REFERENCE_WIDTH;

    railHeading(railX, canvasRect.y + 6, "Drawing");
    const mirrorButton = this.makeSmallButton(
      railX,
      canvasRect.y + 34,
      this.mirrorEnabled ? "Mirror: On" : "Mirror: Off",
      () => {
        this.mirrorEnabled = !this.mirrorEnabled;
        this.pixelCanvas?.setMirrorX(this.mirrorEnabled);
        mirrorButton.setText(this.mirrorEnabled ? "Mirror: On" : "Mirror: Off");
        this.refreshButton(mirrorButton, this.mirrorEnabled);
      },
      () => this.mirrorEnabled,
    );
    // Clear (two-tap confirm, same shape as EditorUI's Clear/Delete Area)
    this.clearButton = this.makeSmallButton(railX, canvasRect.y + 70, "Clear", () => this.onClearClicked());

    railHeading(railX, canvasRect.y + 104, "Reference");
    this.buildReferenceControls(target, canvasRect.y + 132);

    // "Set as default" lives here as well as in the level editor because the
    // player character is only reachable from this scene — it is deliberately
    // not a Palette brush (see CHARACTER_BRUSH), so it has no picker over
    // there, and without this a painted character could be saved and never
    // worn by anything. Two-tap confirmed, same as Clear, since it reaches
    // every level that hasn't chosen for itself.
    railHeading(railX, canvasRect.y + 196, "This skin");
    this.defaultButton = this.makeSmallButton(railX, canvasRect.y + 224, "Set as default", () =>
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
        const brushLabel = skinTargets().find((brush) => brush.id === brushId)?.label ?? brushId;
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
   * One button per frame for an animated target, drawn under the palette row.
   * A painted frame is filled and labelled plainly; an unpainted one is dimmed
   * and marked with a dot, so "which poses have I actually done" is answerable
   * at a glance rather than by clicking through all five.
   *
   * Nothing at all for a single-frame skin — no strip, no layout shift, so an
   * ordinary coin skin looks exactly as it did before this feature.
   */
  private buildFrameStrip(target: EditingTarget): void {
    const plan = framePlanFor(target.brush.id);
    if (!plan) return;

    // Stacked down the empty band left of the canvas rather than as a
    // horizontal row above it: the rows between the palette selector (y=62)
    // and the canvas (y=132) are already taken by the swatches, and a strip
    // squeezed in there rendered straight through them. The canvas is centred
    // from x=385 at its default size, so this column is clear at every zoom
    // level rather than only the smallest.
    const buttonWidth = 96;
    const rowHeight = 34;
    const x = 150;
    let y = 152;

    this.add.text(x, 130, "FRAMES", { fontSize: "10px", color: "#8a8ab0", fontStyle: "bold" });

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
