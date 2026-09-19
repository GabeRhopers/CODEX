import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { LevelNameInput } from "../editor/LevelNameInput";
import { drawThingFields } from "../editor/thingFields";
import { CustomEntityDef, makeCustomEntityId, newCustomEntityDef, validationError } from "../entities/customEntity";
import { loadCustomEntities, removeCustomEntity, saveCustomEntity } from "../entities/customEntityStorage";
import { PixelCanvasOverlay, type PixelTool } from "../editor/PixelCanvasOverlay";
import { DEFAULT_PIXEL_PALETTE_ID, findPalette, PALETTE_SWATCH_NAME } from "../skins/pixelPalettes";
import { cellsFromPngDataUrl, cellsToPngDataUrl, hasPaintedCells } from "../skins/pixelSkinCells";
import { loadCustomSkins, savePixelSkin } from "../skins/skinStorage";
import { ENTITY_GRID_SIZE } from "../skins/spriteFrames";
import { loadActiveProfile } from "../profile/Profile";
import { cellHitArgs } from "../ui/touchTarget";
import { playSoundKey } from "../audio/sfx";
import { registerSound, soundKeyFor } from "../audio/soundLoader";
import { type SoundSpec } from "../audio/soundSynth";
import { ConfirmButton } from "../ui/confirmButton";
import { BUTTON_COLOR, BUTTON_HOVER_COLOR, MUTED_COLOR, SELECTED_COLOR, SELECTED_HOVER_COLOR } from "../ui/theme";

/**
 * One invented item, enemy or decoration: its name, what it acts like, and the
 * drawing of it.
 *
 * **Not a front door.** It was one until 2026-09-15 — it had its own list and
 * its own Menu chip beside the Skin Creator's, which meant a child had to
 * choose between "skin" and "thing" before knowing which they needed. The
 * Things grid on `SkinEditorScene` is the one list of everything paintable now,
 * built-in and invented alike, and this screen is the form behind one of its
 * tiles. Nothing else starts it.
 *
 * **It owns almost no rules.** What a thing may copy is `clonableTypes`, whether
 * a definition is usable is `validationError`, and what it then *does* is
 * `resolveBehaviour` — all in entities/customEntity.ts, all pure, all tested
 * without Phaser. This scene picks values and shows reasons; every time it was
 * tempting to write an `if` about behaviour here, that was the signal the rule
 * belonged in the pure module instead.
 *
 * One screen, rebuilt in place — every field calls `rebuild()`, which is why the
 * drawing is carried in scene state rather than inside the panel that draws it.
 * The teardown destroys each child explicitly, for the reason documented in
 * SkinEditorScene: a stale invisible button sitting where the new one is means
 * both handlers fire on one click.
 *
 * It still owns almost no rules — see below — and the drawing is still saved as
 * this thing's *skin*, keyed by its own id, which is the reason the merge with
 * the Skin Creator is a UI change and not a data one.
 */

/** What the Things grid hands over. No id means "invent a new one". */
interface ThingMakerSceneData {
  id?: string;
}

// --- the drawing panel ------------------------------------------------------
// Sized from the right margin inwards, so the form to its left keeps the space
// it had. The form's widest row is "Acts like" (six cells of 78 from x=110,
// ending at 578) and the sound row (eight buttons of 62 from x=110, ending
// about 606), which is what fixes TOOL_X at 630.
/** Small-button column beside the drawing. */
const TOOL_X = 630;
/** Left edge of the drawing and of the swatch grid under it. */
const SPRITE_X = 706;
/** Just under the title, rather than level with the form's first row: the
 * drawing and its palette together are taller than the form, so every pixel
 * spent above the canvas comes off the bottom of the swatch grid. */
const SPRITE_TOP = 70;
/**
 * Sized by what has to fit *below* it, not by what looks generous.
 *
 * Eighteen swatches in rows of six is three rows of 28, and they start 10px
 * under the drawing: 70 + SPRITE_SIZE + 10 + 84 has to stay inside the scene's
 * 468px floor. At the 320 this started as, the last row — which holds the
 * transparent ✕ — sat at y=482 and was simply not on screen.
 *
 * 296 over a 32-cell grid is 9.25 screen pixels per cell, against the Skin
 * Creator's 12 at fit zoom. Smaller, and the right trade: that screen is for a
 * body of artwork and this one is for one sprite you can see whole while you
 * decide what it does.
 */
const SPRITE_SIZE = 296;
const SWATCH_SIZE = 24;
const SWATCH_STEP = 28;
const SWATCH_COLS = 6;
const SWATCH_TOP = SPRITE_TOP + SPRITE_SIZE + 10;

export class ThingMakerScene extends Phaser.Scene {
  /** Which thing the Things grid sent us to, if any. */
  private editingId?: string;
  /** The definition being edited, valid or not — the form holds a whole def and
   * hands it to `validationError`, rather than tracking each field's validity
   * itself. */
  private draft?: CustomEntityDef;
  /** Whether `draft` has been saved yet, which is only what the form's heading
   * reads from — an unsaved draft is never written anywhere, so leaving one
   * needs no cleanup. */
  private draftIsNew = false;
  private nameInput?: LevelNameInput;
  private saveError?: string;

  // --- the drawing, carried across rebuilds ---------------------------------
  // Every field on the form calls `rebuild`, which destroys the whole display
  // list and the canvas overlay with it, so the drawing lives here rather than
  // inside the panel that draws it. Without this, choosing a different "acts
  // like" halfway through would throw the artwork away.
  private spriteCanvas?: PixelCanvasOverlay;
  private spriteCells?: (string | null)[];
  /**
   * `null` means the transparent ✕ — an eraser you paint with — so it is not a
   * safe "nothing chosen yet" value: starting there selects the ✕ and the first
   * strokes of every new thing paint nothing at all. Starts on a real colour and
   * only becomes null when somebody picks the ✕ deliberately.
   */
  private spriteColor: string | null = findPalette(DEFAULT_PIXEL_PALETTE_ID).colors[0] ?? "#000000";
  private spriteTool: PixelTool = "paint";
  /** The library entry this drawing came from, so re-saving edits it in place
   * rather than leaving a second skin behind on every save. */
  private spriteSkinId?: string;

  constructor() {
    super("ThingMaker");
  }

  /**
   * Which thing to edit, handed over by the Things grid.
   *
   * An id edits that thing; nothing at all starts a new one. There is no
   * "which thing?" mode here any more — the grid on `SkinEditor` is the one
   * list of everything paintable, and this screen is only ever the form behind
   * one of its tiles. See that scene's docstring for why there is one list.
   */
  init(data?: ThingMakerSceneData): void {
    this.editingId = data?.id;
    this.draft = undefined;
  }

  create(): void {
    this.rebuild();
    void this.reloadDefs();
  }

  /**
   * Re-reads the library, then opens the thing this screen was sent to edit.
   *
   * The read has to land before the form can be drawn for an existing thing —
   * the draft *is* a definition out of the library — so the first `rebuild()`
   * draws the loading line and this draws the form.
   */
  private async reloadDefs(): Promise<void> {
    const defs = await loadCustomEntities().catch(() => [] as CustomEntityDef[]);
    if (!this.scene.isActive()) return;
    if (this.draft) return; // already editing; a later reload must not revert the form
    const existing = this.editingId ? defs.find((def) => def.id === this.editingId) : undefined;
    if (existing) this.startEdit(existing);
    else this.startNew();
  }

  /** Back to the one list. Every exit from this screen goes here, so there is
   * no way to end up on a second list of the same things. */
  private leave(): void {
    this.scene.start("SkinEditor");
  }

  private rebuild(): void {
    // Destroyed explicitly, not `removeAll` — see SkinEditorScene.rebuild for
    // the stale-listener bug that distinction causes.
    this.nameInput?.destroy();
    this.nameInput = undefined;
    // Its cells are already in `spriteCells` — `onPaint` writes them on every
    // stroke — so destroying it here loses the element, never the drawing.
    this.spriteCanvas?.destroy();
    this.spriteCanvas = undefined;
    for (const child of [...this.children.list]) child.destroy();

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1a1a2e).setOrigin(0, 0);
    if (this.draft) this.buildEdit();
    else this.buildLoading();
  }

  /** The moment before the library read lands. Says which thing is coming
   * rather than flashing an empty form. */
  private buildLoading(): void {
    this.addBackButton(() => this.leave());
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "Loading…", { fontSize: "14px", color: MUTED_COLOR })
      .setOrigin(0.5);
  }

  // --- shared bits ---------------------------------------------------------

  private addBackButton(onClick: () => void): void {
    this.add
      .text(24, 20, "← Back", { fontSize: "14px", color: "#ffffff", backgroundColor: BUTTON_COLOR, padding: { x: 10, y: 6 } })
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);
  }

  private makeButton(
    x: number,
    yMid: number,
    label: string,
    onClick: () => void,
    isActive?: () => boolean,
  ): Phaser.GameObjects.Text {
    const idle = (): string => (isActive?.() ? SELECTED_COLOR : BUTTON_COLOR);
    const hover = (): string => (isActive?.() ? SELECTED_HOVER_COLOR : BUTTON_HOVER_COLOR);
    const text = this.add
      .text(x, yMid, label, {
        fontSize: "12px",
        color: "#ffffff",
        backgroundColor: idle(),
        // Same y-padding as ConfirmButton: enough to meet a thumb at the scale
        // a phone held sideways renders this canvas. See ui/touchTarget.ts.
        padding: { x: 10, y: 10 },
      })
      .setOrigin(0, 0.5)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: hover() }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: idle() }));
    return text;
  }

  // --- mode: edit ----------------------------------------------------------

  private startNew(): void {
    this.draft = newCustomEntityDef(makeCustomEntityId(crypto.randomUUID()), "items");
    this.draftIsNew = true;
    this.saveError = undefined;
    this.clearSprite();
    this.rebuild();
  }

  private startEdit(def: CustomEntityDef): void {
    this.draft = { ...def };
    this.draftIsNew = false;
    this.saveError = undefined;
    this.clearSprite();
    this.rebuild();
    void this.loadSprite(def.id);
  }

  /** Forgets the previous thing's drawing. Without this, opening a second thing
   * would show the first one's sprite until its own finished decoding — and
   * would then *save* it onto the second thing. */
  private clearSprite(): void {
    this.spriteCells = undefined;
    this.spriteSkinId = undefined;
    this.spriteColor = findPalette(DEFAULT_PIXEL_PALETTE_ID).colors[0] ?? "#000000";
    this.spriteTool = "paint";
  }

  /**
   * Loads whatever has already been drawn for this thing, if anything.
   *
   * The PNG is the storage format — a skin keeps no second copy of its cell
   * grid (see PixelSkinData.cells) — so re-opening one means decoding it back,
   * exactly as SkinEditorScene.openForEditing does.
   *
   * Guarded against arriving late: decoding is asynchronous and a fast hand can
   * be on a different thing, or back at the list, before it lands. Writing the
   * cells then would put one thing's artwork on another.
   */
  private async loadSprite(id: string): Promise<void> {
    const entry = await loadCustomSkins()
      .then((skins) => skins[id])
      .catch(() => undefined);
    const asset = entry?.items[0];
    if (!asset) return;
    const cells = await cellsFromPngDataUrl(asset.imageData, ENTITY_GRID_SIZE).catch(() => null);
    if (!cells || !this.scene.isActive()) return;
    if (this.draft?.id !== id) return;
    this.spriteCells = cells;
    this.spriteSkinId = asset.id;
    this.spriteCanvas?.loadCells(cells);
  }

  private buildEdit(): void {
    const draft = this.draft;
    if (!draft) return;

    this.addBackButton(() => this.leave());
    this.add
      .text(GAME_WIDTH / 2, 24, this.draftIsNew ? "New Thing" : "Edit Thing", { fontSize: "20px", color: "#ffffff" })
      .setOrigin(0.5, 0);

    // The fields themselves live in editor/thingFields.ts, drawn into this
    // scene rather than owned by it — the Skin Creator's canvas wants the same
    // block behind a "What it does" tab, and two copies of a form is how they
    // drift.
    const fields = drawThingFields({
      scene: this,
      x: 60,
      y: 78,
      draft,
      onChange: (update, redraw) => {
        if (!this.draft) return;
        this.draft = update(this.draft);
        this.saveError = undefined;
        if (redraw) this.rebuild();
      },
      onPreviewSound: (sound) => void this.previewSound(sound),
    });
    this.nameInput = fields.nameInput;
    let y = fields.bottomY;

    this.buildSpritePanel();

    // --- save
    if (this.saveError) {
      this.add.text(60, y, this.saveError, { fontSize: "12px", color: "#ff9d9d" }).setOrigin(0, 0.5);
    }
    y += 34;
    const save = this.makeButton(60, y, "Save", () => void this.save());

    // Delete lives here now. It used to sit on this screen's own list of
    // things, which is gone — there is one list of everything paintable, on the
    // Things grid, and a built-in cannot be deleted, so a per-row Delete there
    // would be a button that exists for some rows and not others. On the form it
    // is unambiguous: it deletes the thing you are looking at. Absent for an
    // unsaved draft, which has nothing to delete — leaving one needs no cleanup.
    if (!this.draftIsNew) {
      new ConfirmButton({
        scene: this,
        x: save.x + save.width + 12,
        y,
        label: "Delete",
        armedLabel: "Delete? Tap again",
        onConfirm: () => void this.deleteThing(draft),
      });
    }
  }

  /**
   * The drawing, on the same screen as the thing it belongs to.
   *
   * Until 2026-09-12 this corner held a 150x110 box showing the built-in art
   * the thing copies, captioned "until you draw it", and a "Save & draw
   * sprite →" button that left for the Skin Creator and came back. Inventing a
   * thing and drawing it are one act, and they are one screen now: the caption
   * was a promise that the next screen would deliver, and the next screen was
   * mostly chrome that did not apply.
   *
   * **Why this is not the Skin Creator embedded.** An invented thing is always a
   * single 32x32 frame — `framePlanFor` returns null for a `custom:` id, since
   * it is not the character and not in the loop or tile brush sets — so the
   * frames rail, the tracing reference, the 40-tile brush grid and "Set as
   * default" (automatic for custom brushes since `adoptsFirstSkin`) all have
   * nothing to do here. What is left is a canvas, four tools and some colours,
   * which is small enough to build directly on `PixelCanvasOverlay` rather than
   * to share a 1,500-line scene for.
   *
   * The Skin Creator keeps its own screen for the job this cannot do: reskinning
   * the 38 built-ins, where every one of those controls earns its place.
   */
  private buildSpritePanel(): void {
    this.add.text(SPRITE_X, SPRITE_TOP - 14, "Looks like", { fontSize: "12px", color: MUTED_COLOR }).setOrigin(0, 0.5);

    this.spriteCanvas = new PixelCanvasOverlay({
      scene: this,
      viewport: { x: SPRITE_X, y: SPRITE_TOP, width: SPRITE_SIZE, height: SPRITE_SIZE },
      gridSize: ENTITY_GRID_SIZE,
      // Carried across rebuilds rather than re-read from storage: every field on
      // this form rebuilds the whole scene (see `rebuild`), so choosing a
      // different "acts like" halfway through drawing would otherwise throw the
      // drawing away. Same reason SkinEditorScene re-captures cells on a palette
      // switch.
      initialCells: this.spriteCells,
      onPaint: () => {
        this.spriteCells = this.spriteCanvas?.getCells();
      },
      onColorPicked: (color) => {
        this.spriteColor = color;
        this.rebuild();
      },
    });
    this.spriteCanvas.setCurrentColor(this.spriteColor);
    this.spriteCanvas.setTool(this.spriteTool);
    this.spriteCanvas.fitToViewport();

    // Tools, in a column to the left of the drawing.
    const tools: { tool: PixelTool; label: string }[] = [
      { tool: "paint", label: "Paint" },
      { tool: "erase", label: "Erase" },
      { tool: "fill", label: "Fill" },
      { tool: "eyedropper", label: "Pick" },
    ];
    tools.forEach(({ tool, label }, i) => {
      this.makeButton(
        TOOL_X,
        SPRITE_TOP + 13 + i * 34,
        label,
        () => {
          this.spriteTool = tool;
          this.spriteCanvas?.setTool(tool);
          this.rebuild();
        },
        () => this.spriteTool === tool,
      );
    });
    this.makeButton(TOOL_X, SPRITE_TOP + 13 + 4 * 34 + 10, "Undo", () => {
      if (this.spriteCanvas?.undo()) this.spriteCells = this.spriteCanvas.getCells();
    });

    // Colours, under the drawing. One fixed palette rather than the Skin
    // Creator's five: picking a palette is a decision about a body of artwork,
    // and this screen is one sprite.
    const palette = findPalette(DEFAULT_PIXEL_PALETTE_ID);
    const swatches: (string | null)[] = [...palette.colors, null];
    swatches.forEach((color, i) => {
      const sx = SPRITE_X + (i % SWATCH_COLS) * SWATCH_STEP;
      const sy = SWATCH_TOP + Math.floor(i / SWATCH_COLS) * SWATCH_STEP;
      const selected = color === this.spriteColor;
      const bg = this.add
        .rectangle(sx, sy, SWATCH_SIZE, SWATCH_SIZE, color ? Phaser.Display.Color.HexStringToColor(color).color : 0x333333)
        .setOrigin(0, 0)
        .setStrokeStyle(selected ? 3 : 1, selected ? 0xffeb3b : 0x000000, selected ? 1 : 0.4)
        // The whole cell, same as the Skin Creator's — see ui/touchTarget.ts.
        .setInteractive(
          new Phaser.Geom.Rectangle(
            ...cellHitArgs({ width: SWATCH_SIZE, height: SWATCH_SIZE }, { width: SWATCH_STEP, height: SWATCH_STEP }),
          ),
          Phaser.Geom.Rectangle.Contains,
        )
        .setName(PALETTE_SWATCH_NAME);
      bg.input!.cursor = "pointer";
      if (!color) {
        this.add
          .text(sx + SWATCH_SIZE / 2, sy + SWATCH_SIZE / 2, "✕", { fontSize: "13px", color: "#ffffff" })
          .setOrigin(0.5);
      }
      bg.on("pointerdown", () => {
        this.spriteColor = color;
        // Reaching for a colour means you want to paint with it, not keep
        // erasing — the same reading SkinEditorScene's swatches take.
        if (this.spriteTool === "erase" && color !== null) this.spriteTool = "paint";
        this.rebuild();
      });
    });
  }

  // --- actions -------------------------------------------------------------

  /**
   * Writes the draft, then either returns to the list or goes straight on to
   * drawing it.
   *
   * The reason is `validationError`'s, verbatim — this scene never composes its
   * own message, so what it refuses and what storage would refuse cannot drift.
   */
  private async save(): Promise<void> {
    const draft = this.draft;
    if (!draft) return;
    const reason = validationError(draft);
    if (reason) {
      this.saveError = reason;
      this.rebuild();
      return;
    }
    await saveCustomEntity(draft);
    await this.saveSprite(draft);
    this.leave();
  }

  /**
   * Writes the drawing, if there is one, as this thing's skin.
   *
   * Silent when nothing has been painted: a thing with no sprite is a perfectly
   * good thing — it wears the art of whatever it copies — and saving a blank
   * PNG over that would replace working art with an invisible square. This is
   * the same judgement `hasPaintedCells` exists for in the Skin Creator's own
   * frame handling.
   *
   * `spriteSkinId` is passed so re-saving edits the library entry in place.
   * Without it, every Save on an existing thing would leave another skin
   * behind, and the first one drawn would stay the default for ever — see
   * `adoptsFirstSkin`.
   *
   * A failure here does not fail the save: the definition is already written
   * and is the part that cannot be redrawn from memory. It says so rather than
   * pretending, and the thing keeps the art it had.
   */
  private async saveSprite(draft: CustomEntityDef): Promise<void> {
    const cells = this.spriteCells;
    if (!cells || !hasPaintedCells(cells)) return;
    const imageData = this.spriteCanvas?.exportPngDataUrl() ?? cellsToPngDataUrl(cells, ENTITY_GRID_SIZE);
    try {
      this.spriteSkinId = await savePixelSkin(
        draft.id,
        this.spriteSkinId,
        imageData,
        { paletteId: DEFAULT_PIXEL_PALETTE_ID },
        loadActiveProfile() ?? "unknown",
        undefined,
        draft.name,
      );
    } catch (err) {
      console.error("Thing sprite save failed:", err);
      this.saveError = "Saved the thing, but its drawing could not be saved.";
    }
  }

  /**
   * Decodes a sound and plays it once, so you can hear what you picked.
   *
   * Degrades to silence rather than to an error: `registerSound` returns null
   * when the decode fails or the browser has no Web Audio, and `playSoundKey`
   * no-ops on a key that is not in the cache. Neither is worth a message here —
   * the button not making a noise says everything the message would.
   */
  private async previewSound(sound: SoundSpec): Promise<void> {
    const key = await registerSound(this, soundKeyFor(`${this.draft?.id ?? "preview"}-preview`), sound);
    if (key) playSoundKey(this, key);
  }

  private async deleteThing(def: CustomEntityDef): Promise<void> {
    await removeCustomEntity(def.id);
    this.leave();
  }
}
