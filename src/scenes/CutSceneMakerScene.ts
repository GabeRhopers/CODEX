import Phaser from "phaser";
import { BackgroundThumbnail, resolveBackgroundThumbnails } from "../backgrounds/backgroundLibraryLoader";
import { addBackgroundAsset, removeBackgroundAsset } from "../backgrounds/backgroundLibraryStorage";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { AssetPickerItem, AssetPickerMenu } from "../editor/AssetPickerMenu";
import { readAndDownscaleImage } from "../editor/customBackgroundUpload";
import { ParagraphInput } from "../editor/ParagraphInput";
import {
  addActor,
  addPanel,
  CutScene,
  CutScenePanel,
  emptyCutScene,
  movePanel,
  PanelActor,
  panelActors,
  panelHasContent,
  removeActor,
  removePanel,
  updateActor,
  updatePanel,
} from "../game/CutScene";
import { actorTextureKey, CastMember, cutSceneCast } from "../game/cutSceneCast";
import { actorScaleFor, bandHeightOf, DEFAULT_ACTOR_SCALE, placementFor, stageHeightOf, stepActorScale } from "../game/cutSceneLayout";
import type { CustomEntityDef } from "../entities/customEntity";
import { loadCustomEntities } from "../entities/customEntityStorage";
import { resolveSkinTextureKeys } from "../skins/skinLoader";
import { makePagerControls } from "../ui/PagerControls";
import { cellHitArgs, MIN_TAP_PX } from "../ui/touchTarget";
import { createEmptyGame, GameData } from "../game/GameSchema";
import { saveGame } from "../game/gameStorage";
import { backgroundDisplayLabel, isBuiltinBackgroundId, STATIC_BACKGROUNDS, staticBackgroundDef } from "../level/staticBackgrounds";
import { loadActiveProfile } from "../profile/Profile";
import { ConfirmButton } from "../ui/confirmButton";
import { MUTED_COLOR } from "../ui/theme";
import { makeTextButton } from "../ui/textButton";
import { drawScreenHeader } from "../ui/screenHeader";

/**
 * Writing a cut scene: the panels, and what each one shows.
 *
 * **One panel at a time**, chosen from a strip of chips along the top — the
 * Thing Maker's shape, and for the same reason. A row-per-panel list would need
 * its own picture picker and its own paragraph field on every row, and the
 * dropdown from one would open over the next; editing one panel at a time needs
 * exactly one of each, and buys a preview big enough to actually judge.
 *
 * Owns no rules. What a panel is, what makes one worth showing, and what moving
 * one means all live in `game/CutScene.ts`, pure and tested without Phaser —
 * the same split the Game Maker has with `GameSchema.ts`.
 *
 * **Pictures come from the shared background library**, the same pool *Upload
 * BG* fills, through the same `AssetPickerMenu` and the same
 * upload/downscale/store path. A cut scene adds no asset store of its own; what
 * it adds is that the collector must now walk these references too, or a
 * published game's opening would be blank.
 */

const PANEL_FILL = 0x0f1830;
const STATUS_COLORS = { good: "#8fd694", warn: "#ffc93c", bad: "#ff9d9d" } as const;

/** Not a real library id — those are `crypto.randomUUID()` — so a genuine
 * upload can never collide with it. The same sentinel trick EditorUI's own
 * pickers use for their built-in options. */
const NO_PICTURE_ID = "no-picture";

const CHIP_Y = 80;
const CHIP_SIZE = 30;
const CHIP_GAP = 7;
const CHIP_X = 24;

/**
 * The stage: the preview box, and the thing you drag characters around in.
 *
 * Keeps the canvas's own 1050x468 aspect, because the whole claim of this box is
 * that what is shown here is what plays. It was 500x224 until characters arrived
 * and needed two rows of controls beneath it; 440x196 is the same shape, smaller.
 */
const PREVIEW = { x: 24, y: 124, width: 440, height: 196 };
const RIGHT_X = 548;
const RIGHT_WIDTH = GAME_WIDTH - RIGHT_X - 24;
const PICKER = { x: RIGHT_X, y: 124, width: 240, height: 32 };
// Measured against what each control actually occupies, not eyeballed: the
// first spacing tried put the "Words" label underneath the picture picker.
const WORDS_LABEL_Y = 176;
const WORDS_RECT = { x: RIGHT_X, y: 188, width: RIGHT_WIDTH, height: 110 };
const PANEL_TOOLS_Y = 322;

/** Under the stage: what to do with whoever is selected, or how to add somebody
 * when nobody is. One row serving both states rather than a row that appears. */
const ACTOR_TOOLS_Y = 338;

/** The cast, full width — 19 built-in entities plus the hero plus whatever this
 * child has invented does not fit under a 440px stage. Paged when it overflows;
 * `makePagerControls` draws nothing at all while everything fits. */
const CAST_Y = 366;
const CAST_SIZE = 30;
const CAST_STEP = 36;
const CAST_X = 24;
/**
 * What `makePagerControls` actually occupies: it places "Next ›" at `x + 176`
 * and that button is about 64 wide. Reserving less does not make it smaller, it
 * pushes Next off the edge of the canvas — which is exactly what the first
 * version of this did at 180, and what the screen survey caught.
 */
const CAST_PAGER_WIDTH = 240;
const CAST_PAGER_GAP = 12;
/** 20, which is exactly the hero plus the 19 built-in entities — so a child who
 * has invented nothing sees no pager at all. */
const CAST_PER_PAGE = Math.floor((GAME_WIDTH - CAST_X * 2 - CAST_PAGER_WIDTH - CAST_PAGER_GAP) / CAST_STEP);

const ACTIONS_Y = GAME_HEIGHT - 24;
/** Right-aligned on the actions row rather than a line of its own — the cast
 * strip took the row this used to have, and the Editor's footer already puts its
 * save state at the far end of the same row as everything else. */
const STATUS_Y = ACTIONS_Y;

/** Which of the game's two cut scenes this screen is editing. */
export type CutSceneSlot = "opening" | "closing";

interface CutSceneMakerSceneData {
  game?: GameData;
  slot?: CutSceneSlot;
}

export class CutSceneMakerScene extends Phaser.Scene {
  private gameDoc: GameData = createEmptyGame("");
  private slot: CutSceneSlot = "opening";
  private cutScene: CutScene = emptyCutScene();
  private selected = 0;
  private status = "";
  private statusTone: "good" | "warn" | "bad" = "good";
  private thumbnails: BackgroundThumbnail[] = [];
  private wordsInput?: ParagraphInput;
  private picker?: AssetPickerMenu;
  /** Which actor of the selected panel the tools row acts on, or null for none.
   * Reset whenever the panel changes — index 2 of the panel you just left means
   * nothing in the one you just opened. */
  private selectedActor: number | null = null;
  private castPage = 0;
  /** Resolved once on entry, not per redraw: this screen rebuilds on every
   * keystroke in the words field, and both of these are storage reads. */
  private cast: CastMember[] = [];
  private skinKeys = new Map<string, string>();
  private entityDefs: CustomEntityDef[] = [];

  constructor() {
    super("CutSceneMaker");
  }

  init(data?: CutSceneMakerSceneData): void {
    // The Game Maker saves before it starts this scene, so what arrives is what
    // is stored — the same hand-over the Publish screen gets.
    if (data?.game) this.gameDoc = data.game;
    this.slot = data?.slot ?? "opening";
    this.cutScene = this.gameDoc[this.slot] ?? emptyCutScene();
    this.selected = 0;
    this.selectedActor = null;
    this.castPage = 0;
    this.status = "";
    this.statusTone = "good";
  }

  create(): void {
    this.rebuild();
    void this.loadCast();
  }

  /**
   * The cast and the art it draws with, read once and then redrawn.
   *
   * Deliberately after the first `rebuild()` rather than before it: both reads
   * can go to storage, and a screen that renders nothing until Drive answers is
   * how the picture picker used to behave before it started labelling itself up
   * front. The strip simply arrives a moment later.
   */
  private async loadCast(): Promise<void> {
    const [skinKeys, defs] = await Promise.all([resolveSkinTextureKeys(this), loadCustomEntities()]);
    if (!this.scene.isActive()) return;
    this.skinKeys = skinKeys;
    this.entityDefs = defs;
    this.cast = cutSceneCast(defs);
    this.rebuild();
  }

  private get panelCount(): number {
    return this.cutScene.panels.length;
  }

  private rebuild(): void {
    // DOM overlays are not Phaser children, so they are torn down explicitly or
    // they float over whatever is drawn next — the same care the Game Maker and
    // Skin Creator take with theirs.
    this.wordsInput?.destroy();
    this.wordsInput = undefined;
    this.picker = undefined;
    for (const child of [...this.children.list]) child.destroy();

    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x1a1a2e).setOrigin(0, 0);
    this.drawHeader();
    this.drawChips();
    if (this.panelCount === 0) {
      this.drawEmpty();
    } else {
      this.selected = Math.min(this.selected, this.panelCount - 1);
      const panel = this.cutScene.panels[this.selected];
      // An actor index outliving the cast it pointed into leaves the tools row
      // acting on somebody who is no longer there.
      if (this.selectedActor !== null && this.selectedActor >= panelActors(panel).length) this.selectedActor = null;
      this.drawPreview();
      this.drawPictureRow();
      this.drawWordsField();
      this.drawPanelTools();
      this.drawActorTools(panel);
      this.drawCastStrip();
    }
    this.drawActions();
  }

  // --- chrome --------------------------------------------------------------

  private makeButton(x: number, yMid: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    return makeTextButton({ scene: this, x, y: yMid, label, onClick, paddingY: 10 });
  }

  private drawHeader(): void {
    const which = this.slot === "opening" ? "Opening" : "Closing";
    drawScreenHeader({
      scene: this,
      title: `${which} cut scene`,
      subtitle:
        this.slot === "opening"
          ? "Shown when someone presses Play, before the first world."
          : "Shown after the last world, just before the ending.",
      onBack: () => void this.saveAndLeave(),
    });
  }

  /** The strip of panels, and the button that adds one. Chips rather than a
   * paged list: a cut scene is a handful of panels, and seeing all of them at
   * once is most of what tells you whether the order reads right. */
  private drawChips(): void {
    let x = CHIP_X;
    for (let i = 0; i < this.panelCount; i += 1) {
      const isSelected = i === this.selected;
      const filled = panelHasContent(this.cutScene.panels[i]);
      const chip = this.add
        .rectangle(x, CHIP_Y, CHIP_SIZE, CHIP_SIZE, isSelected ? 0x3a5a9c : PANEL_FILL)
        .setOrigin(0, 0.5)
        .setInteractive({ useHandCursor: true });
      // A hollow outline marks a panel with nothing in it yet — the thing that
      // would silently not play, said before you press Preview.
      chip.setStrokeStyle(1, filled ? 0x8fd694 : 0x66668a);
      chip.on("pointerdown", () => {
        this.selected = i;
        // Index 2 of the panel you just left means nothing in the one you just
        // opened, and the tools row would be acting on a stranger.
        this.selectedActor = null;
        this.rebuild();
      });
      this.add
        .text(x + CHIP_SIZE / 2, CHIP_Y, String(i + 1), { fontSize: "12px", color: isSelected ? "#ffffff" : MUTED_COLOR })
        .setOrigin(0.5);
      x += CHIP_SIZE + CHIP_GAP;
    }
    this.makeButton(x + 4, CHIP_Y, "+ Add panel", () => {
      this.cutScene = addPanel(this.cutScene);
      this.selected = this.panelCount - 1;
      this.selectedActor = null;
      this.rebuild();
    });
  }

  private drawEmpty(): void {
    this.add.rectangle(PREVIEW.x, PREVIEW.y, GAME_WIDTH - 48, PREVIEW.height, PANEL_FILL).setOrigin(0, 0);
    this.add
      .text(
        GAME_WIDTH / 2,
        PREVIEW.y + PREVIEW.height / 2,
        "No panels yet.\nAdd one, give it a picture or some words, and it plays before the game.",
        { fontSize: "13px", color: MUTED_COLOR, align: "center", lineSpacing: 6 },
      )
      .setOrigin(0.5);
  }

  // --- the selected panel --------------------------------------------------

  /** What the panel will look like, at a readable size. Cover-fit inside the
   * box, exactly as `CutSceneScene` fits it to the canvas, so what is shown here
   * is what plays rather than an approximation of it. */
  private drawPreview(): void {
    const panel = this.cutScene.panels[this.selected];
    this.add.rectangle(PREVIEW.x, PREVIEW.y, PREVIEW.width, PREVIEW.height, 0x12122a).setOrigin(0, 0);

    const textureKey = panel.imageId ? this.pictureTextureKey(panel.imageId) : null;
    if (textureKey) {
      const image = this.add.image(PREVIEW.x + PREVIEW.width / 2, PREVIEW.y + PREVIEW.height / 2, textureKey);
      const scale = Math.max(PREVIEW.width / image.width, PREVIEW.height / image.height);
      image.setScale(scale);
      const shape = this.make.graphics({ x: 0, y: 0 }, false);
      shape.fillRect(PREVIEW.x, PREVIEW.y, PREVIEW.width, PREVIEW.height);
      image.setMask(shape.createGeometryMask());
    } else if (panel.imageId) {
      // A picture is chosen but its thumbnail is not resolved yet (the library
      // read happens when the picker first opens) or has been deleted since.
      this.add
        .text(PREVIEW.x + PREVIEW.width / 2, PREVIEW.y + 40, "Picture chosen", { fontSize: "12px", color: MUTED_COLOR })
        .setOrigin(0.5);
    }

    this.drawStageActors(panel);

    if (panel.words?.trim()) {
      // Derived rather than the 74 this used to hardcode: the band has to be the
      // same share of the panel here as it is at full size, or a character placed
      // standing on the ground is behind the caption on the link.
      const bandHeight = bandHeightOf(PREVIEW.height);
      this.add
        .rectangle(PREVIEW.x, PREVIEW.y + PREVIEW.height - bandHeight, PREVIEW.width, bandHeight, 0x0b0b1c, 0.82)
        .setOrigin(0, 0);
      this.add
        .text(PREVIEW.x + PREVIEW.width / 2, PREVIEW.y + PREVIEW.height - bandHeight + 8, panel.words.trim(), {
          fontSize: "11px",
          color: "#eeeeee",
          align: "center",
          lineSpacing: 3,
          wordWrap: { width: PREVIEW.width - 40 },
        })
        .setOrigin(0.5, 0);
    }

    if (!panelHasContent(panel)) {
      this.add
        .text(PREVIEW.x + PREVIEW.width / 2, PREVIEW.y + PREVIEW.height / 2, "This panel is empty,\nso it will not play.", {
          fontSize: "12px",
          color: MUTED_COLOR,
          align: "center",
          lineSpacing: 5,
        })
        .setOrigin(0.5);
    }
  }

  /**
   * Everybody standing in the panel, drawn on the stage and draggable.
   *
   * **The model is written on `dragend`, not on `drag`.** Every edit here goes
   * through `rebuild()`, which destroys every child — including the sprite
   * currently under the finger. Committing per-frame would therefore delete the
   * drag target mid-drag and strand the pointer. So the sprite moves itself
   * while dragging and the cut scene learns about it once, at the end.
   */
  private drawStageActors(panel: CutScenePanel): void {
    const stageHeight = stageHeightOf(PREVIEW.height);

    panelActors(panel).forEach((actor, index) => {
      const key = this.castTextureKey(actor.id);
      if (!key || !this.textures.exists(key)) return;

      const image = this.add
        .image(PREVIEW.x + actor.x * PREVIEW.width, PREVIEW.y + actor.y * stageHeight, key)
        .setOrigin(0.5, 1)
        .setScale(actorScaleFor(PREVIEW.width, actor.scale))
        .setFlipX(!!actor.flip)
        .setDepth(10 + index);

      // A tap target of its own: a coin scaled into a 440px stage is a few
      // pixels across, which is nothing to aim at or to drag. The "cell" here is
      // the tap minimum itself rather than a grid pitch — actors are placed
      // freely, so there is no neighbouring cell to steal from, and the only
      // rule is that the target never shrinks below what a finger can hit.
      const cell = { width: MIN_TAP_PX, height: MIN_TAP_PX };
      image.setInteractive(
        new Phaser.Geom.Rectangle(
          ...cellHitArgs({ width: image.displayWidth, height: image.displayHeight }, cell),
        ),
        Phaser.Geom.Rectangle.Contains,
      );
      // Not a third argument: the hit-area overload of setInteractive takes
      // `dropZone` there, so draggability is set on the input plugin instead.
      this.input.setDraggable(image);
      image.input!.cursor = "pointer";

      if (index === this.selectedActor) {
        this.add
          .rectangle(image.x, image.y - image.displayHeight / 2, image.displayWidth + 6, image.displayHeight + 6)
          .setStrokeStyle(1, 0x8fd694)
          .setDepth(9);
      }

      image.on("pointerdown", () => {
        if (this.selectedActor === index) return;
        this.selectedActor = index;
        this.rebuild();
      });
      image.on("drag", (_p: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        image.setPosition(dragX, dragY);
      });
      image.on("dragend", () => {
        this.selectedActor = index;
        this.cutScene = updateActor(this.cutScene, this.selected, index, {
          x: (image.x - PREVIEW.x) / PREVIEW.width,
          y: (image.y - PREVIEW.y) / stageHeight,
        });
        this.rebuild();
      });
    });
  }

  /**
   * One row, two states: what to do with the selected character, or how to get
   * one when none is selected.
   *
   * The same row either way rather than controls that appear and disappear —
   * a row that grows under the finger already reaching for the strip below it is
   * the bug this shape avoids.
   */
  private drawActorTools(panel: CutScenePanel): void {
    const actors = panelActors(panel);
    const actor = this.selectedActor === null ? undefined : actors[this.selectedActor];
    if (!actor || this.selectedActor === null) {
      this.add
        .text(PREVIEW.x, ACTOR_TOOLS_Y, "Tap somebody below to put them in the picture, then drag them about.", {
          fontSize: "11px",
          color: MUTED_COLOR,
        })
        .setOrigin(0, 0.5);
      return;
    }

    const index = this.selectedActor;
    const change = (changes: Partial<PanelActor>): void => {
      this.cutScene = updateActor(this.cutScene, this.selected, index, changes);
      this.rebuild();
    };

    let x = PREVIEW.x;
    const tool = (label: string, onClick: () => void): void => {
      const button = this.makeButton(x, ACTOR_TOOLS_Y, label, onClick);
      x += button.width + 6;
    };

    tool("−", () => change({ scale: stepActorScale(actor.scale ?? DEFAULT_ACTOR_SCALE, -1) }));
    tool("+", () => change({ scale: stepActorScale(actor.scale ?? DEFAULT_ACTOR_SCALE, 1) }));
    tool(actor.flip ? "Face ▶" : "Face ◀", () => change({ flip: !actor.flip }));
    tool("Take out", () => {
      this.cutScene = removeActor(this.cutScene, this.selected, index);
      this.selectedActor = null;
      this.rebuild();
    });
  }

  /**
   * The cast: everyone who can be put in the picture.
   *
   * Tapping one **adds it to the middle of the stage and selects it**, rather
   * than arming a brush the next stage tap places. The editor's palette works
   * the armed way, but the stage here has a second job the grid does not — you
   * also tap it to pick up somebody already standing there — and one tap meaning
   * two things depending on invisible state is how a child ends up with four
   * ghosts they did not want.
   */
  private drawCastStrip(): void {
    const cast = this.cast;
    const start = this.castPage * CAST_PER_PAGE;

    cast.slice(start, start + CAST_PER_PAGE).forEach((member, column) => {
      const cx = CAST_X + column * CAST_STEP + CAST_SIZE / 2;
      const cy = CAST_Y + CAST_SIZE / 2;
      this.add.rectangle(cx, cy, CAST_SIZE, CAST_SIZE, PANEL_FILL).setStrokeStyle(1, 0x2b3350);

      const icon = this.add.image(cx, cy, member.textureKey);
      const fit = Math.min((CAST_SIZE - 6) / icon.width, (CAST_SIZE - 6) / icon.height, 1);
      icon.setScale(fit);

      icon.setInteractive(
        new Phaser.Geom.Rectangle(
          ...cellHitArgs(
            { width: icon.displayWidth, height: icon.displayHeight },
            { width: CAST_STEP, height: CAST_STEP },
          ),
        ),
        Phaser.Geom.Rectangle.Contains,
      );
      icon.input!.cursor = "pointer";
      icon.on("pointerdown", () => this.addToPanel(member.id));
    });

    for (const control of makePagerControls({
      scene: this,
      x: GAME_WIDTH - CAST_X - CAST_PAGER_WIDTH,
      // Its buttons draw from this as their *top* (origin 0,0) and stand about
      // 32 tall, so this lines their middle up with the icon row rather than
      // hanging them below it.
      y: CAST_Y - 1,
      page: this.castPage,
      total: cast.length,
      perPage: CAST_PER_PAGE,
      onChange: (page) => {
        this.castPage = page;
        this.rebuild();
      },
    })) {
      void control;
    }
  }

  /** Placed across the middle of the stage, standing on its floor — somewhere
   * visible, so the next thing to do is drag them where they belong rather than
   * hunt for where they went. `placementFor` fans them out rather than stacking
   * them, since a second character landing exactly on the first reads as nothing
   * having happened. */
  private addToPanel(id: string): void {
    const actors = panelActors(this.cutScene.panels[this.selected]);
    this.cutScene = addActor(this.cutScene, this.selected, {
      id,
      ...placementFor(actors.length),
      scale: DEFAULT_ACTOR_SCALE,
    });
    this.selectedActor = panelActors(this.cutScene.panels[this.selected]).length - 1;
    this.rebuild();
  }

  /** The art one cast id draws with, using the same rule playback uses — the
   * skin map is resolved once per scene entry and cached, since every keystroke
   * in the words field rebuilds this screen. */
  private castTextureKey(id: string): string | null {
    return actorTextureKey(this.skinKeys, this.entityDefs, id);
  }

  /** The texture behind a panel's `imageId`, or null while an uploaded one is
   * still unresolved (the library read happens when the picker first opens) or
   * has been deleted since. A built-in never returns null — it is preloaded by
   * BootScene, so it is drawable before any read has happened at all. */
  private pictureTextureKey(imageId: string): string | null {
    if (isBuiltinBackgroundId(imageId)) return staticBackgroundDef(imageId).textureKey;
    return this.thumbnails.find((t) => t.id === imageId)?.textureKey ?? null;
  }

  /** The trigger carries its own label ("Picture: Barn ▾"), so there is no
   * separate caption above it — one less thing to collide with the field below,
   * and the same shape EditorUI's own BG and Music triggers have. */
  private drawPictureRow(): void {
    this.picker = new AssetPickerMenu({
      scene: this,
      trigger: PICKER,
      columns: 3,
      itemSize: 30,
      uploadAccept: "image/*",
      triggerDepth: 10,
      dropdownDepth: 60,
      onToggleOpen: (open) => {
        if (open) this.refreshThumbnails();
      },
      onSelect: (id) => this.choosePicture(id),
      onUploadFile: (file) => void this.uploadPicture(file),
      onDelete: (id) => void this.deletePicture(id),
    });
    // Labelled before the library read returns, so the control never renders as
    // an unexplained empty box while a Drive round trip is in flight.
    this.picker.setTriggerLabel(this.pictureLabel());
    this.refreshThumbnails();
  }

  /** What the picture trigger says. Built-ins are named from the shipped pool,
   * which needs no read at all; an uploaded one falls back to "Chosen" while its
   * name is unknown — the library read has not landed, or the picture was
   * deleted from the library after this panel named it. */
  private pictureLabel(): string {
    const imageId = this.cutScene.panels[this.selected]?.imageId;
    if (!imageId) return "Picture: None ▾";
    if (isBuiltinBackgroundId(imageId)) return `Picture: ${backgroundDisplayLabel(imageId)} ▾`;
    const known = this.thumbnails.find((t) => t.id === imageId);
    return `Picture: ${known?.name ?? "Chosen"} ▾`;
  }

  /**
   * Reads the shared library and hands the picker its items — the same
   * open-time read `EditorScene.onBackgroundPickerOpen` does, rather than a read
   * on every redraw of a screen most of whose redraws are a keystroke.
   *
   * **The 4 shipped backgrounds are listed first, and their absence was a real
   * bug.** Until 2026-09-13 this offered `No picture` plus the uploaded library
   * and nothing else, while the Editor's identical-looking picker merged the
   * built-ins in. So a child who had never uploaded an image opened this and
   * found exactly one option, called "No picture" — which is every child on day
   * one, and is why both shipped demo games have words-only openings. The
   * feature was unreachable rather than missing.
   *
   * Built-ins are not `deletable`: they ship inside the app, so the delete badge
   * would be offering something it cannot do.
   */
  private refreshThumbnails(): void {
    void resolveBackgroundThumbnails(this).then((thumbnails) => {
      if (!this.scene.isActive()) return;
      this.thumbnails = thumbnails;
      const chosen = this.cutScene.panels[this.selected]?.imageId ?? NO_PICTURE_ID;
      const items: AssetPickerItem[] = [
        { id: NO_PICTURE_ID, label: "No picture", textureKey: "tile-brick-icon" },
        ...STATIC_BACKGROUNDS.map((bg) => ({ id: bg.id, label: bg.label, textureKey: bg.textureKey })),
        ...thumbnails.map((t) => ({ id: t.id, label: t.name, textureKey: t.textureKey, deletable: true })),
      ];
      this.picker?.setItems(items, chosen);
      this.picker?.setTriggerLabel(this.pictureLabel());
    });
  }

  private choosePicture(id: string): void {
    this.cutScene = updatePanel(this.cutScene, this.selected, {
      imageId: id === NO_PICTURE_ID ? undefined : id,
    });
    this.rebuild();
  }

  private async uploadPicture(file: File): Promise<void> {
    try {
      const imageData = await readAndDownscaleImage(file);
      const id = await addBackgroundAsset(file.name, imageData, loadActiveProfile() ?? "unknown");
      this.cutScene = updatePanel(this.cutScene, this.selected, { imageId: id });
      this.setStatus("Picture added.", "good");
    } catch {
      this.setStatus("That picture could not be read.", "bad");
    }
    this.rebuild();
  }

  private async deletePicture(id: string): Promise<void> {
    try {
      await removeBackgroundAsset(id);
      this.setStatus("Picture removed from the library.", "good");
    } catch {
      this.setStatus("Could not remove that picture.", "bad");
    }
    this.rebuild();
  }

  private drawWordsField(): void {
    this.add.text(RIGHT_X, WORDS_LABEL_Y, "Words", { fontSize: "12px", color: MUTED_COLOR }).setOrigin(0, 0.5);
    this.wordsInput = new ParagraphInput(
      this,
      WORDS_RECT,
      this.cutScene.panels[this.selected].words ?? "",
      (value) => {
        this.cutScene = updatePanel(this.cutScene, this.selected, { words: value || undefined });
        this.rebuild();
      },
      { placeholder: "What happens here?" },
    );
  }

  private drawPanelTools(): void {
    let x = RIGHT_X;
    const move = (direction: -1 | 1, label: string): void => {
      this.makeButton(x, PANEL_TOOLS_Y, label, () => {
        const moved = movePanel(this.cutScene, this.selected, direction);
        // The same object back means nothing moved — the end of the list — so
        // there is nothing to redraw either.
        if (moved === this.cutScene) return;
        this.cutScene = moved;
        this.selected += direction;
        this.selectedActor = null;
        this.rebuild();
      });
      x += 44;
    };
    move(-1, "←");
    move(1, "→");

    new ConfirmButton({
      scene: this,
      x: x + 12,
      y: PANEL_TOOLS_Y,
      label: "Remove panel",
      armedLabel: "Really remove?",
      onConfirm: () => {
        this.cutScene = removePanel(this.cutScene, this.selected);
        this.selected = Math.max(0, this.selected - 1);
        this.selectedActor = null;
        this.rebuild();
      },
    });
  }

  // --- saving and leaving --------------------------------------------------

  private setStatus(text: string, tone: "good" | "warn" | "bad"): void {
    this.status = text;
    this.statusTone = tone;
  }

  private drawActions(): void {
    if (this.status) {
      this.add
        .text(GAME_WIDTH - 24, STATUS_Y, this.status, {
          fontSize: "12px",
          color: STATUS_COLORS[this.statusTone],
          align: "right",
          wordWrap: { width: GAME_WIDTH / 2 },
        })
        .setOrigin(1, 0.5);
    }
    this.makeButton(24, ACTIONS_Y, "Save", () => void this.save());
    this.makeButton(90, ACTIONS_Y, "Preview ▶", () => void this.preview());
  }

  /**
   * Writes the cut scene back onto the game.
   *
   * Safe to do unconditionally because the Game Maker validates and saves before
   * it ever starts this screen — so the document being edited here is already
   * one that passes, and there is no way to reach this with an untitled game.
   */
  private async save(): Promise<boolean> {
    this.gameDoc = { ...this.gameDoc, [this.slot]: this.cutScene, updatedAt: new Date().toISOString() };
    try {
      await saveGame(this.gameDoc);
    } catch {
      this.setStatus("Could not save — check your connection.", "bad");
      this.rebuild();
      return false;
    }
    this.setStatus("Saved.", "good");
    this.rebuild();
    return true;
  }

  /** Back saves rather than discarding: there is no separate "are you sure",
   * and losing a paragraph someone just typed to a stray click on ← Back would
   * be the worst thing this screen could do. */
  private async saveAndLeave(): Promise<void> {
    await this.save();
    this.scene.start("GameMaker");
  }

  private async preview(): Promise<void> {
    if (!(await this.save())) return;
    this.scene.start("CutScene", {
      cutScene: this.cutScene,
      // Straight back here afterwards, with the same game and slot — a preview
      // that dumped you on the Game Maker would cost a click to resume editing.
      next: { key: "CutSceneMaker", data: { game: this.gameDoc, slot: this.slot } },
    });
  }
}
