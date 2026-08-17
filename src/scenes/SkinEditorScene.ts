import Phaser from "phaser";
import { GAME_WIDTH } from "../config/gameConfig";
import { GameRect } from "../editor/domOverlay";
import { Brush, PALETTE } from "../editor/Palette";
import { PixelCanvasOverlay, PixelTool } from "../editor/PixelCanvasOverlay";
import { fitWithinTile } from "../editor/spriteFit";
import { loadActiveProfile } from "../profile/Profile";
import { DEFAULT_PIXEL_PALETTE_ID, findPalette, PIXEL_PALETTES } from "../skins/pixelPalettes";
import { resolveSkinThumbnails } from "../skins/skinLoader";
import { listPixelSkins, removeCustomSkin, savePixelSkin } from "../skins/skinStorage";

const BUTTON_COLOR = 0x0f3460;
const BUTTON_HOVER_COLOR = 0x3a5a9c;
const ARM_TIMEOUT_MS = 3000;
const ROW_START_Y = 90;
const ROW_HEIGHT = 44;
// How much a single Zoom +/- click changes the canvas's on-screen size —
// see PixelCanvasOverlay.setDisplaySize for the [MIN_DISPLAY_SIZE,
// MAX_DISPLAY_SIZE] clamp this steps within.
const ZOOM_STEP = 40;

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
  initialCells?: (string | null)[];
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
  // Every field below is a *tool preference*, not per-skin data — deliberately
  // never reset in create()/rebuild(), same convention currentColor already
  // followed before this pass: picking Fill or zooming in once should still
  // feel that way the next time you open the Skin Creator this session,
  // not silently revert to defaults every time you switch brushes or skins.
  private currentColor: string | null = null;
  private currentTool: PixelTool = "paint";
  private mirrorEnabled = false;
  private gridVisible = false;
  private canvasSize = 280;
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
    this.clearArmTimer?.remove(false);
    this.clearArmed = false;
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
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }

  private makeSmallButton(x: number, yMid: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const text = this.add
      .text(x, yMid, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: "#0f3460",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: "#3a5a9c" }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: "#0f3460" }));
    return text;
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

      const brushesById = new Map(PALETTE.map((b) => [b.id, b]));
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
        this.addBrowseRow(ROW_START_Y + i * ROW_HEIGHT, brush, entry.brushId, entry.asset.id, entry.asset.pixelData?.cells, textureKey);
      });
    });
  }

  private addBrowseRow(
    y: number,
    brush: Brush | undefined,
    brushId: string,
    skinId: string,
    cells: (string | null)[] | undefined,
    textureKey: string | undefined,
  ): void {
    this.add.rectangle(40, y, GAME_WIDTH - 80, ROW_HEIGHT - 8, 0x16213e).setOrigin(0, 0);
    if (textureKey) {
      const icon = this.add.image(66, y + (ROW_HEIGHT - 8) / 2, textureKey).setOrigin(0.5);
      fitWithinTile(icon, 28);
    }
    this.add
      .text(90, y + (ROW_HEIGHT - 8) / 2, brush?.label ?? brushId, { fontSize: "15px", color: "#ffffff" })
      .setOrigin(0, 0.5);

    this.makeSmallButton(GAME_WIDTH - 280, y + (ROW_HEIGHT - 8) / 2, "Edit", () => {
      if (!brush) return;
      this.target = { brush, existingId: skinId, paletteId: DEFAULT_PIXEL_PALETTE_ID, initialCells: cells };
      this.goTo("canvas");
    });
    this.makeSmallButton(GAME_WIDTH - 200, y + (ROW_HEIGHT - 8) / 2, "Delete", () => {
      void removeCustomSkin(brushId, skinId).then(() => this.rebuild());
    });
  }

  // --- mode: pick-brush ----------------------------------------------------

  private buildPickBrush(): void {
    this.addBackButton(() => this.goTo("browse"));
    this.add
      .text(GAME_WIDTH / 2, 24, "Choose an entity to paint a skin for", { fontSize: "18px", color: "#ffffff" })
      .setOrigin(0.5, 0);

    const skinnable = PALETTE.filter((b) => b.entityType);
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
      const label = this.add.text(cx, cy + 46, brush.label, { fontSize: "11px", color: "#c8c8e0" }).setOrigin(0.5, 0);

      const onClick = () => {
        this.target = { brush, existingId: undefined, paletteId: DEFAULT_PIXEL_PALETTE_ID };
        this.goTo("canvas");
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
    this.add
      .text(GAME_WIDTH / 2, 20, `Editing: ${target.brush.label}`, { fontSize: "16px", color: "#ffffff" })
      .setOrigin(0.5, 0);

    // --- header right cluster: Undo, Redo, Save — Save stays at its
    // fixed spot; Redo/Undo are auto-width Text buttons (makeSmallButton
    // has no fixed-width rectangle the way EditorUI's header buttons do),
    // so each is positioned from its *own* rendered `.width` immediately
    // after creation, right-to-left, rather than a guessed pixel offset. ---
    const saveButton = this.makeSmallButton(GAME_WIDTH - 24 - 60, 20 + 10, "Save", () => this.onSave());
    const redoButton = this.makeSmallButton(0, 20 + 10, "Redo", () => this.performRedo());
    redoButton.setX(saveButton.x - 8 - redoButton.width);
    const undoButton = this.makeSmallButton(0, 20 + 10, "Undo", () => this.performUndo());
    undoButton.setX(redoButton.x - 8 - undoButton.width);

    this.statusText = this.add.text(GAME_WIDTH / 2, 44, "", { fontSize: "12px", color: "#4ade80" }).setOrigin(0.5, 0);

    // --- palette selector row ---
    const palette = findPalette(target.paletteId);
    const paletteButtonWidth = 110;
    const paletteRowWidth = PIXEL_PALETTES.length * (paletteButtonWidth + 8) - 8;
    let px = (GAME_WIDTH - paletteRowWidth) / 2;
    for (const p of PIXEL_PALETTES) {
      const bg = this.add
        .rectangle(px, 62, paletteButtonWidth, 24, p.id === palette.id ? BUTTON_HOVER_COLOR : BUTTON_COLOR)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      this.add.text(px + paletteButtonWidth / 2, 74, p.name, { fontSize: "11px", color: "#ffffff" }).setOrigin(0.5);
      bg.on("pointerdown", () => {
        if (!this.target || !this.pixelCanvas || p.id === this.target.paletteId) return;
        // Capture the live in-progress drawing before switching, so
        // changing which palette is offered doesn't discard unsaved
        // strokes the way reloading target.initialCells's *original*
        // (pre-edit) value would.
        const liveCells = this.pixelCanvas.getCells();
        this.target = { ...this.target, paletteId: p.id, initialCells: liveCells };
        this.goTo("canvas");
      });
      px += paletteButtonWidth + 8;
    }

    // --- tool-mode buttons (Paint / Fill / Pick), right-aligned on the
    // swatch row's own y — declared before the swatch row below since a
    // swatch click resumes Paint mode (see setTool inside the swatch
    // handler), same "eyedropper is momentary" reasoning the
    // onColorPicked callback further down uses. Pinned to the row's right
    // edge rather than laid out relative to the swatch row's own (palette-
    // dependent) width, so it never collides with it even for the widest
    // palette (Pico-8/Sweetie16/DawnBringer's 17-item row still leaves
    // ~250px of clearance here). ---
    const sy = 96;
    const toolButtons: { tool: PixelTool; button: Phaser.GameObjects.Text }[] = [];
    const refreshToolHighlight = (): void => {
      for (const { tool, button } of toolButtons) {
        button.setStyle({ backgroundColor: tool === this.currentTool ? "#3a5a9c" : "#0f3460" });
      }
    };
    const setTool = (tool: PixelTool): void => {
      this.currentTool = tool;
      this.pixelCanvas?.setTool(tool);
      refreshToolHighlight();
    };
    const pickButton = this.makeSmallButton(0, sy + 12, "Pick", () => setTool("eyedropper"));
    pickButton.setX(GAME_WIDTH - 24 - pickButton.width);
    const fillButton = this.makeSmallButton(0, sy + 12, "Fill", () => setTool("fill"));
    fillButton.setX(pickButton.x - 6 - fillButton.width);
    const paintButton = this.makeSmallButton(0, sy + 12, "Paint", () => setTool("paint"));
    paintButton.setX(fillButton.x - 6 - paintButton.width);
    toolButtons.push({ tool: "paint", button: paintButton }, { tool: "fill", button: fillButton }, { tool: "eyedropper", button: pickButton });
    refreshToolHighlight();

    // --- color swatch row (palette colors + a transparent "eraser") ---
    const swatchSize = 24;
    const swatchGap = 6;
    const swatchColors: (string | null)[] = [...palette.colors, null];
    const swatchRowWidth = swatchColors.length * (swatchSize + swatchGap) - swatchGap;
    let sx = (GAME_WIDTH - swatchRowWidth) / 2;
    if (this.currentColor === null || !palette.colors.includes(this.currentColor)) {
      this.currentColor = palette.colors[0];
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
        // Only Eyedropper auto-reverts here — it's a momentary "sample and
        // get back to work" gesture, so picking a color instead of
        // clicking the canvas still counts as "done sampling." Fill is
        // the opposite: it's a deliberate, sticky mode (fill one region,
        // pick a different color, fill another, repeat) — forcing it back
        // to Paint on every single color change would silently break that
        // workflow before a fill click ever lands (a real bug caught in
        // testing: Fill -> pick a color -> click the canvas only ever
        // painted one cell, because this handler had already switched the
        // tool back to Paint out from under the click).
        if (this.currentTool === "eyedropper") setTool("paint");
        refreshSwatchHighlight();
      });
      swatchNodes.push({ color, bg });
      sx += swatchSize + swatchGap;
    }
    refreshSwatchHighlight();

    // --- the 32x32 pixel canvas itself — size is a persisted tool
    // preference (see canvasSize's own field docstring), not always 280 ---
    const canvasDisplaySize = this.canvasSize;
    const canvasRect: GameRect = {
      x: (GAME_WIDTH - canvasDisplaySize) / 2,
      y: 132,
      width: canvasDisplaySize,
      height: canvasDisplaySize,
    };
    this.pixelCanvas = new PixelCanvasOverlay(
      this,
      canvasRect,
      target.initialCells,
      () => {
        /* live strokes need no per-cell UI feedback beyond the canvas's own redraw */
      },
      (picked) => {
        // Eyedropper is momentary — sampling a color resumes Paint with
        // it immediately rather than requiring a manual switch back, same
        // "pick a color, keep working" flow every other pixel-art tool
        // gives this gesture.
        this.currentColor = picked;
        refreshSwatchHighlight();
        setTool("paint");
      },
    );
    this.pixelCanvas.setCurrentColor(this.currentColor);
    this.pixelCanvas.setTool(this.currentTool);
    this.pixelCanvas.setMirrorX(this.mirrorEnabled);
    this.pixelCanvas.setGridVisible(this.gridVisible);

    // --- left column beside the canvas: viewing aids (Zoom, Grid) — a
    // fixed x=40 regardless of canvasDisplaySize, since even the largest
    // canvas (MAX_DISPLAY_SIZE, centered) still leaves this column clear
    // (its left edge never comes closer than ~365px from x=0). ---
    this.makeSmallButton(40, canvasRect.y + 40, "Zoom +", () => this.adjustZoom(ZOOM_STEP));
    this.makeSmallButton(40, canvasRect.y + 80, "Zoom −", () => this.adjustZoom(-ZOOM_STEP));
    const gridButton = this.makeSmallButton(40, canvasRect.y + 120, this.gridVisible ? "Grid: On" : "Grid: Off", () => {
      this.gridVisible = !this.gridVisible;
      this.pixelCanvas?.setGridVisible(this.gridVisible);
      gridButton.setText(this.gridVisible ? "Grid: On" : "Grid: Off").setStyle({ backgroundColor: this.gridVisible ? "#3a5a9c" : "#0f3460" });
    });

    // --- right column beside the canvas: actions that affect the
    // drawing (Mirror, Clear) — same "always clear of the canvas at any
    // zoom level" reasoning as the left column, mirrored. ---
    const mirrorButton = this.makeSmallButton(
      GAME_WIDTH - 24 - 130,
      canvasRect.y + 40,
      this.mirrorEnabled ? "Mirror: On" : "Mirror: Off",
      () => {
        this.mirrorEnabled = !this.mirrorEnabled;
        this.pixelCanvas?.setMirrorX(this.mirrorEnabled);
        mirrorButton.setText(this.mirrorEnabled ? "Mirror: On" : "Mirror: Off").setStyle({ backgroundColor: this.mirrorEnabled ? "#3a5a9c" : "#0f3460" });
      },
    );
    // Clear (two-tap confirm, same shape as EditorUI's Clear/Delete Area)
    this.clearButton = this.makeSmallButton(GAME_WIDTH - 24 - 130, canvasRect.y + 80, "Clear", () => this.onClearClicked());
  }

  /** Zoom just resizes PixelCanvasOverlay's on-screen CSS box (see its own
   * setDisplaySize docstring) — no scene rebuild, so it can't disturb the
   * undo/redo history or drop an in-progress stroke the way routing this
   * through goTo("canvas") (like the palette switcher does) would.
   * `getDisplaySize()` reads back the *clamped* result so `canvasSize`
   * only ever persists a value already known to fit the layout, however
   * many times Zoom + is clicked past the ceiling. */
  private adjustZoom(delta: number): void {
    if (!this.pixelCanvas) return;
    this.pixelCanvas.setDisplaySize(this.pixelCanvas.getDisplaySize() + delta);
    this.canvasSize = this.pixelCanvas.getDisplaySize();
  }

  private onClearClicked(): void {
    if (!this.clearButton) return;
    if (this.clearArmed) {
      this.clearArmTimer?.remove(false);
      this.clearArmed = false;
      this.clearButton.setText("Clear").setStyle({ backgroundColor: "#0f3460" });
      this.pixelCanvas?.clearAll();
      return;
    }
    this.clearArmed = true;
    this.clearButton.setText("Clear?").setStyle({ backgroundColor: "#aa3333" });
    this.clearArmTimer = this.time.delayedCall(ARM_TIMEOUT_MS, () => {
      this.clearArmed = false;
      this.clearButton?.setText("Clear").setStyle({ backgroundColor: "#0f3460" });
    });
  }

  private onSave(): void {
    const target = this.target;
    if (!target || !this.pixelCanvas) return;
    const cells = this.pixelCanvas.getCells();
    const imageData = this.pixelCanvas.exportPngDataUrl();
    const uploadedBy = loadActiveProfile() ?? "unknown";

    void savePixelSkin(target.brush.id, target.existingId, imageData, { paletteId: target.paletteId, cells }, uploadedBy)
      .then((id) => {
        this.target = { ...target, existingId: id };
        this.statusText?.setText(`Saved — ${target.brush.label} skin updated`).setColor("#4ade80");
      })
      .catch((err: unknown) => {
        console.error("Pixel skin save failed:", err);
        this.statusText?.setText("Couldn't save that skin").setColor("#ff6666");
      });
  }
}
