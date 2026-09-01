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
import { ConfirmButton } from "../ui/confirmButton";
import { makePagerControls } from "../ui/PagerControls";
import { clampPage, pageSlice, rowsPerPage } from "../ui/pager";

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

const BUTTON_HEX = "#0f3460";
const BUTTON_HOVER_HEX = "#3a5a9c";
const SELECTED_HEX = "#8a6d1f";
const SELECTED_HOVER_HEX = "#b8912c";
const MUTED = "#a6a6c8";

const ROW_START_Y = 92;
const ROW_HEIGHT = 52;
/** Leaves room under the last row for the pager, which sits at LIST_BOTTOM_Y. */
const LIST_BOTTOM_Y = GAME_HEIGHT - 74;
const PAGER_Y = GAME_HEIGHT - 62;

/** The three families, in the order the form offers them. */
const CATEGORIES: { id: CustomEntityCategory; label: string }[] = [
  { id: "items", label: "Item" },
  { id: "enemies", label: "Enemy" },
  { id: "decor", label: "Decoration" },
];

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
      .text(24, 20, "← Back", { fontSize: "14px", color: "#ffffff", backgroundColor: BUTTON_HEX, padding: { x: 10, y: 6 } })
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
    const idle = (): string => (isActive?.() ? SELECTED_HEX : BUTTON_HEX);
    const hover = (): string => (isActive?.() ? SELECTED_HOVER_HEX : BUTTON_HOVER_HEX);
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
      .text(GAME_WIDTH / 2, 50, "Invent your own items, enemies and decorations.", { fontSize: "12px", color: MUTED })
      .setOrigin(0.5, 0);

    this.makeButton(GAME_WIDTH - 150, 30, "+ New Thing", () => this.startNew());

    if (this.defs.length === 0) {
      this.add
        .text(
          GAME_WIDTH / 2,
          GAME_HEIGHT / 2 - 20,
          "Nothing invented yet.\n\nA thing you make here borrows what it does from something\nthat already exists — a coin, a ghost, a bush — and wears\nwhatever sprite you draw for it.",
          { fontSize: "13px", color: MUTED, align: "center", lineSpacing: 4 },
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
        .text(84, mid + 8, `Acts like a ${builtinLabel(def.basedOn)}`, { fontSize: "11px", color: MUTED })
        .setOrigin(0, 0);

      this.makeButton(GAME_WIDTH - 380, mid, "Edit", () => this.startEdit(def));
      this.makeButton(GAME_WIDTH - 320, mid, "Draw sprite", () => this.drawSpriteFor(def));
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
    this.goTo("edit");
  }

  private startEdit(def: CustomEntityDef): void {
    this.draft = { ...def };
    this.draftIsNew = false;
    this.saveError = undefined;
    this.goTo("edit");
  }

  private buildEdit(): void {
    const draft = this.draft;
    if (!draft) return this.goTo("browse");

    this.addBackButton(() => this.goTo("browse"));
    this.add
      .text(GAME_WIDTH / 2, 24, this.draftIsNew ? "New Thing" : "Edit Thing", { fontSize: "20px", color: "#ffffff" })
      .setOrigin(0.5, 0);

    // --- name
    this.add.text(60, 78, "Name", { fontSize: "12px", color: MUTED }).setOrigin(0, 0.5);
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
    this.add.text(60, 124, "Is a", { fontSize: "12px", color: MUTED }).setOrigin(0, 0.5);
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
    this.add.text(60, ACTS_TOP - 12, "Acts like", { fontSize: "12px", color: MUTED }).setOrigin(0, 0.5);
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
      this.add.text(60, y, "Speed", { fontSize: "12px", color: MUTED }).setOrigin(0, 0.5);
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

    // --- preview
    this.add.text(GAME_WIDTH - 220, 78, "Looks like", { fontSize: "12px", color: MUTED }).setOrigin(0, 0.5);
    const previewArt = this.artFor(draft);
    this.add.rectangle(GAME_WIDTH - 230, 96, 150, 110, 0x0f1830).setOrigin(0, 0);
    if (previewArt) fitWithinTile(this.add.image(GAME_WIDTH - 155, 142, previewArt), 56);
    this.add
      .text(GAME_WIDTH - 155, 182, "until you draw it", { fontSize: "10px", color: MUTED })
      .setOrigin(0.5, 0);

    // --- save
    if (this.saveError) {
      this.add.text(60, y, this.saveError, { fontSize: "12px", color: "#ff9d9d" }).setOrigin(0, 0.5);
    }
    y += 34;
    this.makeButton(60, y, "Save", () => void this.save(false));
    this.makeButton(130, y, "Save & draw sprite →", () => void this.save(true));
  }

  // --- actions -------------------------------------------------------------

  /**
   * Writes the draft, then either returns to the list or goes straight on to
   * drawing it.
   *
   * The reason is `validationError`'s, verbatim — this scene never composes its
   * own message, so what it refuses and what storage would refuse cannot drift.
   */
  private async save(thenDraw: boolean): Promise<void> {
    const draft = this.draft;
    if (!draft) return;
    const reason = validationError(draft);
    if (reason) {
      this.saveError = reason;
      this.rebuild();
      return;
    }
    await saveCustomEntity(draft);
    await this.reloadDefs();
    if (thenDraw) this.drawSpriteFor(draft);
    else this.goTo("browse");
  }

  /** Hands off to the Skin Creator with this thing already selected, so drawing
   * it is one tap from making it rather than a hunt through a 40-tile grid. */
  private drawSpriteFor(def: CustomEntityDef): void {
    this.scene.start("SkinEditor", { targetBrushId: def.id, returnTo: "ThingMaker" });
  }

  private async deleteThing(def: CustomEntityDef): Promise<void> {
    await removeCustomEntity(def.id);
    await this.reloadDefs();
  }
}
