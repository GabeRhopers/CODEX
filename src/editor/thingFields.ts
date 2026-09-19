import Phaser from "phaser";
import { GameRect } from "./domOverlay";
import { LevelNameInput } from "./LevelNameInput";
import { fitWithinTile } from "./spriteFit";
import { builtinTextureKey } from "../entities/builtins";
import {
  clonableTypes,
  CustomEntityCategory,
  CustomEntityDef,
  DEFAULT_SPEED_SCALE,
  withCategory,
} from "../entities/customEntity";
import { PALETTE } from "./Palette";
import { rollSeed, SOUND_PRESETS, type SoundPreset, type SoundSpec } from "../audio/soundSynth";
import { makeTextButton } from "../ui/textButton";
import { MUTED_COLOR } from "../ui/theme";

/**
 * What an invented thing *is*: its name, its family, what it acts like, how fast
 * it moves and what noise it makes.
 *
 * Drawn into a caller's scene rather than owned by one, the same shape
 * `ui/savedList.ts` uses for My Levels and My Worlds. The reason is that two
 * screens want this block: `ThingMakerScene` has it today, and the Skin
 * Creator's canvas wants it behind a "What it does" tab so that inventing a
 * thing and drawing it stop being two rooms.
 *
 * **It owns no rules and no state.** What a thing may copy is `clonableTypes`,
 * switching family is `withCategory`, and what a thing then *does* is
 * `resolveBehaviour` — all pure, all in entities/customEntity.ts. This module
 * places controls and reports what was picked; the caller holds the draft.
 */

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

/**
 * Seven "acts like" cells to a row, not ten: at ten the widest family (Decor)
 * ran to x=882 and straight under the drawing panel at x=830. Rows are counted
 * rather than assumed so everything below sits directly under the last one —
 * with a fixed offset, Items and Enemies (one row each) left an obviously
 * unintended empty band.
 */
const ACTS_PER_ROW = 7;
const ACTS_ROW_H = 62;

/** Label column to control column. Every row lines its controls up on this. */
const CONTROL_DX = 50;
/** First row (Name) to the family row, and to the top of the "acts like" grid.
 * Measured off the layout these numbers came from, so the block is identical
 * wherever it is anchored. */
const CATEGORY_DY = 46;
const ACTS_DY = 112;
/** Matches ConfirmButton's, so a Save placed under this block lines up with a
 * Delete beside it. */
const BUTTON_PADDING_Y = 10;

/** What a built-in is called, for the "Acts like" row — the palette's own label,
 * so a thing is described here exactly as it is in the editor. */
function builtinLabel(type: string): string {
  return PALETTE.find((brush) => brush.entityType === type)?.label ?? type;
}

export interface ThingFieldsOptions {
  scene: Phaser.Scene;
  /** Left edge of the labels. Controls sit `CONTROL_DX` to the right. */
  x: number;
  /** Vertical centre of the first row, which is Name. */
  y: number;
  draft: CustomEntityDef;
  /**
   * A field was changed, as a function of whatever the draft is *now*.
   *
   * An updater rather than a finished value, and that distinction is load
   * bearing. The name field does not redraw (see below), so every other
   * control's handler outlives the draft this block was drawn with: taking
   * `next` by value meant typing a name and then picking a family quietly
   * reverted the name, and the save failed with "Give it a name." The original
   * scene read `this.draft` fresh inside each handler; this preserves that.
   *
   * `redraw` is false only for the name field, which is a DOM input: rebuilding
   * the scene under a focused `<input>` would take the keyboard away mid-word.
   */
  onChange(update: (current: CustomEntityDef) => CustomEntityDef, redraw: boolean): void;
  /** Play a sound once, so you can hear what you picked. Here rather than in
   * this module because decoding needs the scene's audio context. */
  onPreviewSound(sound: SoundSpec): void;
}

export interface ThingFields {
  /** A DOM overlay, not a Phaser child, so the caller has to destroy it
   * explicitly on rebuild — `children.destroy()` would leave it floating. */
  nameInput: LevelNameInput;
  /** Vertical centre of the row *below* the last field, for whatever the caller
   * puts under the block (Save, Delete, an error line). */
  bottomY: number;
}

export function drawThingFields(options: ThingFieldsOptions): ThingFields {
  const { scene, x, y, draft, onChange, onPreviewSound } = options;
  const controlX = x + CONTROL_DX;

  const label = (text: string, atY: number): void => {
    scene.add.text(x, atY, text, { fontSize: "12px", color: MUTED_COLOR }).setOrigin(0, 0.5);
  };
  const button = (bx: number, by: number, text: string, onClick: () => void, isActive?: () => boolean): void => {
    makeTextButton({ scene, x: bx, y: by, label: text, onClick, isActive, paddingY: BUTTON_PADDING_Y });
  };

  // --- name
  label("Name", y);
  const nameRect: GameRect = { x: controlX, y: y - 14, width: 260, height: 28 };
  const nameInput = new LevelNameInput(
    scene,
    nameRect,
    draft.name,
    (value) => onChange((current) => ({ ...current, name: value }), false),
    // No fallback: an unnamed thing must fail validation and say so, rather
    // than quietly becoming "Untitled" — you are naming something you invented.
    { fallback: "", placeholder: "Star Fruit" },
  );

  // --- category
  const categoryY = y + CATEGORY_DY;
  label("Is a", categoryY);
  CATEGORIES.forEach((category, i) => {
    button(
      controlX + i * 96,
      categoryY,
      category.label,
      // withCategory, not a field assignment: switching family has to reset
      // basedOn or the draft becomes exactly the cross-family definition
      // validationError refuses.
      () => onChange((current) => withCategory(current, category.id), true),
      () => draft.category === category.id,
    );
  });

  // --- acts like
  const actsTop = y + ACTS_DY;
  label("Acts like", actsTop - 12);
  const options_ = clonableTypes(draft.category);
  options_.forEach((type, i) => {
    const cx = controlX + (i % ACTS_PER_ROW) * 78;
    const cy = actsTop + Math.floor(i / ACTS_PER_ROW) * ACTS_ROW_H;
    const selected = draft.basedOn === type;
    const cell = scene.add
      .rectangle(cx, cy, 70, 54, selected ? 0x8a6d1f : 0x0f1830)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    const art = builtinTextureKey(type);
    if (art) fitWithinTile(scene.add.image(cx + 35, cy + 18, art), 28);
    scene.add
      .text(cx + 35, cy + 34, builtinLabel(type), { fontSize: "10px", color: "#eeeeee", align: "center" })
      .setOrigin(0.5, 0);
    cell.on("pointerdown", () => onChange((current) => ({ ...current, basedOn: type }), true));
  });
  let bottomY = actsTop + Math.ceil(options_.length / ACTS_PER_ROW) * ACTS_ROW_H + 22;

  // --- speed (enemies only)
  if (draft.category === "enemies") {
    label("Speed", bottomY);
    const current = draft.params?.speedScale ?? DEFAULT_SPEED_SCALE;
    const speedY = bottomY;
    SPEED_CHOICES.forEach((choice, i) => {
      button(
        controlX + i * 92,
        speedY,
        choice.label,
        () => onChange((current) => ({ ...current, params: { ...current.params, speedScale: choice.value } }), true),
        () => current === choice.value,
      );
    });
    bottomY += 56;
  }

  // --- sound
  //
  // Items and enemies only. Decor is skipped because nothing in the game ever
  // touches a decoration, so there is no moment at which its sound could play —
  // offering the control anyway would be a button that does nothing.
  // `soundSpecFor` refuses decor for the same reason, so the two cannot drift.
  if (draft.category !== "decor") {
    label("Sound", bottomY);
    const soundY = bottomY;
    const current = draft.sound;

    // Stepped rather than fixed at the old 76 so the row's last button
    // ("▶ Play", the eighth) finishes clear of the drawing column.
    const step = 62;
    const setSound = (sound: SoundSpec | undefined): void => {
      onChange((current) => ({ ...current, sound }), true);
      if (sound) onPreviewSound(sound);
    };

    button(controlX, soundY, "None", () => setSound(undefined), () => !current);
    SOUND_PRESETS.forEach((preset, i) => {
      button(
        controlX + 62 + i * step,
        soundY,
        SOUND_LABELS[preset],
        // Picking a kind with no seed yet rolls one, so a single tap is always
        // enough to hear something — asking a child to press two buttons before
        // anything happens is how a feature goes unused.
        () => setSound({ preset, seed: current?.seed ?? rollSeed() }),
        () => current?.preset === preset,
      );
    });
    // Roll is how you get a *different* noise of the same kind: the seed is the
    // only variation mechanism, deliberately, instead of a panel of sliders
    // nobody wants on a game canvas.
    button(controlX + 62 + SOUND_PRESETS.length * step, soundY, "🎲 Roll", () => {
      if (current) setSound({ preset: current.preset, seed: rollSeed() });
    });
    button(controlX + 62 + (SOUND_PRESETS.length + 1) * step, soundY, "▶ Play", () => {
      if (current) onPreviewSound(current);
    });
    bottomY += 56;
  }

  return { nameInput, bottomY };
}
