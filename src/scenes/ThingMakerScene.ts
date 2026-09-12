import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { GameRect } from "../editor/domOverlay";
import { LevelNameInput } from "../editor/LevelNameInput";
import { fitWithinTile } from "../editor/spriteFit";
import { builtinTextureKey } from "../entities/builtins";
import {
  clonableTypes,
  CustomEntityCategory,
  CustomEntityDef,
  DEFAULT_SPEED_SCALE,
  makeCustomEntityId,
  newCustomEntityDef,
  validationError,
  withCategory,
} from "../entities/customEntity";
import { loadCustomEntities, removeCustomEntity, saveCustomEntity } from "../entities/customEntityStorage";
import { textureKeyFor } from "../entities/entityRegistry";
import { PALETTE } from "../editor/Palette";
import { PixelCanvasOverlay, type PixelTool } from "../editor/PixelCanvasOverlay";
import { DEFAULT_PIXEL_PALETTE_ID, findPalette, PALETTE_SWATCH_NAME } from "../skins/pixelPalettes";
import { cellsFromPngDataUrl, cellsToPngDataUrl, hasPaintedCells } from "../skins/pixelSkinCells";
import { loadCustomSkins, savePixelSkin } from "../skins/skinStorage";
import { ENTITY_GRID_SIZE } from "../skins/spriteFrames";
import { loadActiveProfile } from "../profile/Profile";
import { cellHitArgs } from "../ui/touchTarget";
import { playSoundKey } from "../audio/sfx";
import { registerSound, soundKeyFor } from "../audio/soundLoader";
import { rollSeed, SOUND_PRESETS, type SoundPreset, type SoundSpec } from "../audio/soundSynth";
import { ConfirmButton } from "../ui/confirmButton";
import { makePagerControls } from "../ui/PagerControls";
import { clampPage, pageSlice, rowsPerPage } from "../ui/pager";
import { BUTTON_COLOR, BUTTON_HOVER_COLOR, MUTED_COLOR, SELECTED_COLOR, SELECTED_HOVER_COLOR } from "../ui/theme";

/**
 * Where you invent a new item, enemy or decoration.
 *
 * Custom entities have worked end to end since 2026-08-31 — stored, placed,
 * played — but the only way to *make* one was a dev-only `window` hook that
 * doesn't exist in a production build. This is the front door: name a thing,
 * say what it acts like, then go and draw it.
 *
 * **It owns almost no rules.** What a thing may copy is `clonableTypes`, whether
 * a definition is usable is `validationError`, and what it then *does* is
 * `resolveBehaviour` — all in entities/customEntity.ts, all pure, all tested
 * without Phaser. This scene picks values and shows reasons; every time it was
 * tempting to write an `if` about behaviour here, that was the signal the rule
 * belonged in the pure module instead.
 *
 * Two flat modes with one `rebuild()`, the same shape SkinEditorScene uses,
 * rather than sub-scenes — and the same explicit child-destroying teardown, for
 * the reason documented there: a stale invisible button from a previous mode
 * sitting where the new one is means both handlers fire on one click.
 */

type Mode = "browse" | "edit";


const ROW_START_Y = 92;
const ROW_HEIGHT = 52;
/** Leaves room under the last row for the pager, which sits at LIST_BOTTOM_Y. */
const LIST_BOTTOM_Y = GAME_HEIGHT - 74;
const PAGER_Y = GAME_HEIGHT - 62;

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
/** Sound buttons are stepped rather than fixed at the old 76 so the row's last
 * button ("▶ Play", the eighth) finishes clear of the tool column at 630. */
const SOUND_STEP = 62;
const SWATCH_TOP = SPRITE_TOP + SPRITE_SIZE + 10;

/** The three families, in the order the form offers them. */
const CATEGORIES: { id: CustomEntityCategory; label: string }[] = [
  { id: "items", label: "Item" },
  { id: "enemies", label: "Enemy" },
  { id: "decor", label: "Decoration" },
];

/**
 * What each preset is called on screen.
 *
 * Named for the *event*, not the waveform — "what does this thing do?" is a
 * question a child can answer, "what waveform is it?" is not. Kept here rather
 * than in soundSynth.ts so the synthesiser stays free of anything user-facing.
 */
const SOUND_LABELS: Record<SoundPreset, string> = {
  pickup: "Pickup",
  power: "Power",
  hit: "Hit",
  blip: "Blip",
  thud: "Thud",
};

/**
 * Speed as a few named choices rather than a free number.
 *
 * The stored range is continuous (MIN_SPEED_SCALE..MAX_SPEED_SCALE) but nobody
 * making a game wants to reason about 1.37. These are the ends and the middle,
 * all inside the bounds validation already enforces, so a picked value can
 * never be one validation would refuse.
 */
const SPEED_CHOICES: { value: number; label: string }[] = [
  { value: 0.5, label: "Slow" },
  { value: DEFAULT_SPEED_SCALE, label: "Normal" },
  { value: 1.5, label: "Fast" },
  { value: 2, label: "Very fast" },
];

/** What a built-in is called, for the "Acts like" row — the palette's own label,
 * so a thing is described here exactly as it is in the editor. */
function builtinLabel(type: string): string {
  return PALETTE.find((brush) => brush.entityType === type)?.label ?? type;
}

export class ThingMakerScene extends Phaser.Scene {
  private mode: Mode = "browse";
  private defs: CustomEntityDef[] = [];
  /** The definition being edited, valid or not — the form holds a whole def and
   * hands it to `validationError`, rather than tracking each field's validity
   * itself. */
  private draft?: CustomEntityDef;
  /** Whether `draft` has been saved yet, which is only what the form's heading
   * reads from — an unsaved draft is never written anywhere, so leaving one
   * needs no cleanup. */
  private draftIsNew = false;
  private page = 0;
  private nameInput?: LevelNameInput;
  private deleteButtons: ConfirmButton[] = [];
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

  create(): void {
    this.mode = "browse";
    this.draft = undefined;
    this.page = 0;
    this.defs = [];
    this.rebuild();
    void this.reloadDefs();
  }

  /** Re-reads the library and redraws, if we are still on a screen that shows
   * it. Every mutation goes through here rather than patching `this.defs` by
   * hand, so what is on screen is always what actually got written. */
  private async reloadDefs(): Promise<void> {
    const defs = await loadCustomEntities().catch(() => [] as CustomEntityDef[]);
    if (!this.scene.isActive()) return;
    this.defs = defs;
    if (this.mode === "browse") this.rebuild();
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
    this.deleteButtons = [];
    for (const child of [...this.children.list]) child.destroy();

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1a1a2e).setOrigin(0, 0);
    if (this.mode === "browse") this.buildBrowse();
    else this.buildEdit();
  }

  private goTo(mode: Mode): void {
    this.mode = mode;
    this.rebuild();
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

  /** The art a definition currently wears — its own skin once one is drawn,
   * otherwise the built-in it copies. `textureKeyFor` is the same resolver
   * PlayScene spawns from, so this preview cannot drift from the real thing. */
  private artFor(def: CustomEntityDef): string | null {
    return textureKeyFor([def], def.id) ?? builtinTextureKey(def.basedOn);
  }

  // --- mode: browse --------------------------------------------------------

  private buildBrowse(): void {
    this.addBackButton(() => this.scene.start("Menu"));
    this.add.text(GAME_WIDTH / 2, 24, "Thing Maker", { fontSize: "20px", color: "#ffffff" }).setOrigin(0.5, 0);
    this.add
      .text(GAME_WIDTH / 2, 50, "Invent your own items, enemies and decorations.", { fontSize: "12px", color: MUTED_COLOR })
      .setOrigin(0.5, 0);

    this.makeButton(GAME_WIDTH - 150, 30, "+ New Thing", () => this.startNew());

    if (this.defs.length === 0) {
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2 - 20,
          "Nothing invented yet.\n\nA thing you make here borrows what it does from something\nthat already exists — a coin, a ghost, a bush — and wears\nwhatever sprite you draw for it.",
          { fontSize: "13px", color: MUTED_COLOR, align: "center", lineSpacing: 4 },
        )
        .setOrigin(0.5, 0.5);
      return;
    }

    const perPage = rowsPerPage(ROW_START_Y, LIST_BOTTOM_Y, ROW_HEIGHT);
    this.page = clampPage(this.page, this.defs.length, perPage);
    const shown = pageSlice(this.defs, this.page, perPage);

    shown.forEach((def, i) => {
      const y = ROW_START_Y + i * ROW_HEIGHT;
      const mid = y + (ROW_HEIGHT - 8) / 2;
      this.add.rectangle(24, y, GAME_WIDTH - 48, ROW_HEIGHT - 8, 0x0f1830).setOrigin(0, 0);

      const art = this.artFor(def);
      if (art) {
        const icon = this.add.image(52, mid, art);
        fitWithinTile(icon, 30);
      }

      this.add.text(84, mid - 10, def.name, { fontSize: "14px", color: "#ffffff" }).setOrigin(0, 0);
      this.add
        .text(84, mid + 8, `Acts like a ${builtinLabel(def.basedOn)}`, { fontSize: "11px", color: MUTED_COLOR })
        .setOrigin(0, 0);

      // One button, where there were two. "Draw sprite" used to sit here and
      // jump to the Skin Creator; Edit now opens the form *and* the drawing
      // together, so a second door to half of it is just a second thing to
      // read.
      this.makeButton(GAME_WIDTH - 320, mid, "Edit", () => this.startEdit(def));
      const del = new ConfirmButton({
        scene: this,
        x: GAME_WIDTH - 200,
        y: mid,
        label: "Delete",
        armedLabel: "Delete? Tap again",
        onConfirm: () => void this.deleteThing(def),
      });
      // One armed button at a time — two both reading "Delete? Tap again" is a
      // way to delete the wrong thing.
      del.text.on("pointerdown", () => {
        for (const other of this.deleteButtons) if (other !== del) other.disarm();
      });
      this.deleteButtons.push(del);
    });

    // Called for its side effect: makePagerControls builds through
    // `scene.add.*`, so the controls are already on the display list. Other
    // callers keep the returned objects only to reparent them into the
    // container they wipe on refresh; this scene wipes children directly.
    makePagerControls({
      scene: this,
      x: 24,
      y: PAGER_Y,
      page: this.page,
      total: this.defs.length,
      perPage,
      onChange: (page) => {
        this.page = page;
        this.rebuild();
      },
    });
  }

  // --- mode: edit ----------------------------------------------------------

  private startNew(): void {
    this.draft = newCustomEntityDef(makeCustomEntityId(crypto.randomUUID()), "items");
    this.draftIsNew = true;
    this.saveError = undefined;
    this.clearSprite();
    this.goTo("edit");
  }

  private startEdit(def: CustomEntityDef): void {
    this.draft = { ...def };
    this.draftIsNew = false;
    this.saveError = undefined;
    this.clearSprite();
    this.goTo("edit");
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
    if (this.mode !== "edit" || this.draft?.id !== id) return;
    this.spriteCells = cells;
    this.spriteSkinId = asset.id;
    this.spriteCanvas?.loadCells(cells);
  }

  private buildEdit(): void {
    const draft = this.draft;
    if (!draft) return this.goTo("browse");

    this.addBackButton(() => this.goTo("browse"));
    this.add
      .text(GAME_WIDTH / 2, 24, this.draftIsNew ? "New Thing" : "Edit Thing", { fontSize: "20px", color: "#ffffff" })
      .setOrigin(0.5, 0);

    // --- name
    this.add.text(60, 78, "Name", { fontSize: "12px", color: MUTED_COLOR }).setOrigin(0, 0.5);
    const nameRect: GameRect = { x: 110, y: 64, width: 260, height: 28 };
    this.nameInput = new LevelNameInput(
      this,
      nameRect,
      draft.name,
      (value) => {
        if (!this.draft) return;
        this.draft = { ...this.draft, name: value };
        this.saveError = undefined;
      },
      // No fallback: an unnamed thing must fail validation and say so, rather
      // than quietly becoming "Untitled" — you are naming something you invented.
      { fallback: "", placeholder: "Star Fruit" },
    );

    // --- category
    this.add.text(60, 124, "Is a", { fontSize: "12px", color: MUTED_COLOR }).setOrigin(0, 0.5);
    CATEGORIES.forEach((category, i) => {
      this.makeButton(
        110 + i * 96,
        124,
        category.label,
        () => {
          if (!this.draft) return;
          // withCategory, not a field assignment: switching family has to reset
          // basedOn or the draft becomes exactly the cross-family definition
          // validationError refuses.
          this.draft = withCategory(this.draft, category.id);
          this.saveError = undefined;
          this.rebuild();
        },
        () => this.draft?.category === category.id,
      );
    });

    // --- acts like
    //
    // Seven to a row, not ten: at ten the widest family (Decor) ran to x=882
    // and straight under the preview panel at x=830. Rows are counted rather
    // than assumed so everything below sits directly under the last one — with
    // a fixed offset, Items and Enemies (one row each) left an obviously
    // unintended empty band.
    const ACTS_TOP = 190;
    const ACTS_PER_ROW = 7;
    const ACTS_ROW_H = 62;
    this.add.text(60, ACTS_TOP - 12, "Acts like", { fontSize: "12px", color: MUTED_COLOR }).setOrigin(0, 0.5);
    const options = clonableTypes(draft.category);
    options.forEach((type, i) => {
      const x = 110 + (i % ACTS_PER_ROW) * 78;
      const y = ACTS_TOP + Math.floor(i / ACTS_PER_ROW) * ACTS_ROW_H;
      const selected = draft.basedOn === type;
      const cell = this.add
        .rectangle(x, y, 70, 54, selected ? 0x8a6d1f : 0x0f1830)
        .setOrigin(0, 0)
        .setInteractive({ useHandCursor: true });
      const art = builtinTextureKey(type);
      if (art) fitWithinTile(this.add.image(x + 35, y + 18, art), 28);
      this.add
        .text(x + 35, y + 34, builtinLabel(type), { fontSize: "10px", color: "#eeeeee", align: "center" })
        .setOrigin(0.5, 0);
      cell.on("pointerdown", () => {
        if (!this.draft) return;
        this.draft = { ...this.draft, basedOn: type };
        this.saveError = undefined;
        this.rebuild();
      });
    });
    let y = ACTS_TOP + Math.ceil(options.length / ACTS_PER_ROW) * ACTS_ROW_H + 22;

    // --- speed (enemies only)
    if (draft.category === "enemies") {
      this.add.text(60, y, "Speed", { fontSize: "12px", color: MUTED_COLOR }).setOrigin(0, 0.5);
      const current = draft.params?.speedScale ?? DEFAULT_SPEED_SCALE;
      const speedY = y;
      SPEED_CHOICES.forEach((choice, i) => {
        this.makeButton(
          110 + i * 92,
          speedY,
          choice.label,
          () => {
            if (!this.draft) return;
            this.draft = { ...this.draft, params: { ...this.draft.params, speedScale: choice.value } };
            this.rebuild();
          },
          () => current === choice.value,
        );
      });
      y += 56;
    }

    // --- sound
    //
    // Items and enemies only. Decor is skipped because nothing in the game ever
    // touches a decoration, so there is no moment at which its sound could
    // play — offering the control anyway would be a button that does nothing.
    // `soundSpecFor` refuses decor for the same reason, so the two cannot drift.
    if (draft.category !== "decor") {
      this.add.text(60, y, "Sound", { fontSize: "12px", color: MUTED_COLOR }).setOrigin(0, 0.5);
      const soundY = y;
      const current = draft.sound;

      const setSound = (sound: SoundSpec | undefined): void => {
        if (!this.draft) return;
        this.draft = { ...this.draft, sound };
        this.saveError = undefined;
        this.rebuild();
        if (sound) void this.previewSound(sound);
      };

      this.makeButton(110, soundY, "None", () => setSound(undefined), () => !current);
      SOUND_PRESETS.forEach((preset, i) => {
        this.makeButton(
          172 + i * SOUND_STEP,
          soundY,
          SOUND_LABELS[preset],
          // Picking a kind with no seed yet rolls one, so a single tap is always
          // enough to hear something — asking a child to press two buttons
          // before anything happens is how a feature goes unused.
          () => setSound({ preset, seed: current?.seed ?? rollSeed() }),
          () => current?.preset === preset,
        );
      });
      // Roll is how you get a *different* noise of the same kind: the seed is
      // the only variation mechanism, deliberately, instead of a panel of
      // sliders nobody wants on a game canvas.
      this.makeButton(172 + SOUND_PRESETS.length * SOUND_STEP, soundY, "🎲 Roll", () => {
        if (current) setSound({ preset: current.preset, seed: rollSeed() });
      });
      this.makeButton(172 + (SOUND_PRESETS.length + 1) * SOUND_STEP, soundY, "▶ Play", () => {
        if (current) void this.previewSound(current);
      });
      y += 56;
    }

    this.buildSpritePanel();

    // --- save
    if (this.saveError) {
      this.add.text(60, y, this.saveError, { fontSize: "12px", color: "#ff9d9d" }).setOrigin(0, 0.5);
    }
    y += 34;
    this.makeButton(60, y, "Save", () => void this.save());
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
    await this.reloadDefs();
    this.goTo("browse");
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
    await this.reloadDefs();
  }
}
