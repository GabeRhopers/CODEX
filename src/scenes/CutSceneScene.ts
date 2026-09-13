import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../config/gameConfig";
import { CutScene, CutScenePanel, panelActors, playablePanels } from "../game/CutScene";
import { actorTextureKey } from "../game/cutSceneCast";
import { BAND_HEIGHT, stageHeightOf } from "../game/cutSceneLayout";
import { loadCustomEntities } from "../entities/customEntityStorage";
import { loadLibraryImageTexture } from "../gameplay/backgroundLoader";
import { isBuiltinBackgroundId, staticBackgroundDef } from "../level/staticBackgrounds";
import { resolveSkinTextureKeys } from "../skins/skinLoader";
import { BUTTON_COLOR, BUTTON_HOVER_COLOR } from "../ui/theme";

/**
 * Playing a cut scene: a picture, some words, and a button you press.
 *
 * **Knows nothing about games.** It is handed the panels and an instruction for
 * what to start afterwards, so the same scene serves the opening (→ WorldMap)
 * and the closing (→ Ending) without either of those being named here. That is
 * what keeps a per-world cut scene, later, from needing anything in this file.
 *
 * Deliberately plain: no transitions, no timed auto-advance, no sound. Someone
 * reading at their own pace can, and a page that moves on by itself is a page
 * you cannot re-read. **Skip** is present from the start because a family game
 * gets replayed, and sitting through the same four panels every time is how a
 * cut scene turns into an obstacle.
 */

interface NextSceneInstruction {
  key: string;
  data?: object;
}

interface CutSceneSceneData {
  cutScene?: CutScene;
  next?: NextSceneInstruction;
}

/**
 * Explicit, because add-order stopped being enough once characters arrived.
 *
 * The picture is drawn late (it is async) and so has always had to say where it
 * belongs. Actors sit above it and below the caption — a character standing over
 * the words would make the words unreadable, and the whole reason the band
 * exists is that a caption must never land on somebody's face. Actor depth is
 * `ACTORS + index`, so an actor placed later stands in front of one placed
 * earlier; `WORDS` is far enough above that no plausible cast can reach it.
 */
const BACKDROP_DEPTH = -20;
const PICTURE_DEPTH = -10;
const ACTORS_DEPTH = 0;
const WORDS_DEPTH = 1000;
const CONTROLS_DEPTH = 2000;

export class CutSceneScene extends Phaser.Scene {
  private panels: CutScenePanel[] = [];
  private next: NextSceneInstruction = { key: "Menu" };
  private index = 0;
  /** Guards the one-way exit. Space repeats while the last panel's start is
   * still in flight, and two `scene.start` calls for the same destination leave
   * two scenes running — the class of bug WorldMapScene's own notes describe. */
  private leaving = false;

  constructor() {
    super("CutScene");
  }

  init(data?: CutSceneSceneData): void {
    // Only the panels worth showing: an author who added three panels and typed
    // nothing into two of them meant one panel, not three blank beats.
    this.panels = playablePanels(data?.cutScene);
    this.next = data?.next ?? { key: "Menu" };
    this.index = 0;
    this.leaving = false;
  }

  create(): void {
    // A cut scene with nothing in it is not an error and not a blank screen —
    // it is simply not a cut scene, so the run carries straight on. The seams
    // check `hasContent` before starting this at all; this is the second guard,
    // for a panel list that became empty some other way.
    if (this.panels.length === 0) {
      this.leave();
      return;
    }
    this.input.keyboard?.on("keydown-SPACE", () => this.advance());
    this.input.keyboard?.on("keydown-ENTER", () => this.advance());
    this.input.keyboard?.on("keydown-ESC", () => this.leave());
    this.render();
  }

  private render(): void {
    this.children.removeAll(true);
    const panel = this.panels[this.index];

    // What a panel with no picture shows, and what fills any edge a picture does
    // not cover. **Its depth is load-bearing**: it is opaque, so while it sat at
    // the default 0 with the picture at -10 it painted over every picture this
    // screen has ever been given. Nothing caught that — the e2e test checks the
    // published bundle rather than the pixels, no shipped game had a picture, and
    // until 2026-09-13 the maker's picker did not offer one that needed no
    // upload, so the combination was close to unreachable.
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x12122a).setOrigin(0, 0).setDepth(BACKDROP_DEPTH);
    if (panel.imageId) void this.drawPicture(panel.imageId);
    if (panelActors(panel).length > 0) void this.drawActors(panel);
    if (panel.words?.trim()) this.drawWords(panel.words.trim(), !!panel.imageId);

    this.drawControls();
  }

  /**
   * Everybody standing in this panel.
   *
   * Async for the same reason `drawPicture` is — resolving custom skins is a
   * storage read — and guarded the same way: a cast that arrives after the
   * reader has pressed Next must not paint itself over the panel that replaced
   * it.
   *
   * Drawn in array order, so an actor added later stands in front of one added
   * earlier. That is the only depth rule, and it is one an author can act on:
   * to put somebody behind, place them first.
   */
  private async drawActors(panel: CutScenePanel): Promise<void> {
    const shownAt = this.index;
    const [skins, defs] = await Promise.all([resolveSkinTextureKeys(this), loadCustomEntities()]);
    if (!this.scene.isActive() || this.index !== shownAt) return;

    panelActors(panel).forEach((actor, order) => {
      const key = actorTextureKey(skins, defs, actor.id);
      if (!key || !this.textures.exists(key)) return;
      this.add
        // Origin (0.5, 1): `y` is the character's feet. Standing on the ground
        // is what an author is nearly always aiming at, and the one position
        // that has to land exactly where they put it.
        .image(actor.x * GAME_WIDTH, actor.y * stageHeightOf(GAME_HEIGHT), key)
        .setOrigin(0.5, 1)
        .setScale(actor.scale ?? 1)
        .setFlipX(!!actor.flip)
        .setDepth(ACTORS_DEPTH + order);
    });
  }

  /**
   * Cover-fit, like `StaticBackground` — each library image is whatever size it
   * was uploaded at, so scaling by the larger ratio is what stops a letterbox
   * gap down one side.
   *
   * Async, and re-checked on arrival: a picture that resolves after the reader
   * has already pressed Next must not paint itself over the panel that replaced
   * it.
   */
  private async drawPicture(imageId: string): Promise<void> {
    // A built-in is already on the GPU — BootScene preloads all four — so it is
    // painted immediately, with **no staleness guard at all**. That is not an
    // oversight: nothing has happened yet that could have gone stale, and the
    // guard below is actively wrong here. `scene.isActive()` is false while
    // `create()` is still running, so checking it on this path silently dropped
    // every built-in picture — the first version of this shared one guard
    // between both branches and drew nothing at all.
    if (isBuiltinBackgroundId(imageId)) {
      this.paintPicture(staticBackgroundDef(imageId).textureKey);
      return;
    }

    const shownAt = this.index;
    const key = await loadLibraryImageTexture(this, imageId);
    // Now the guard earns its place: this resumes some time later, and by then
    // the scene may be gone or the reader may have pressed Next.
    if (!key || !this.scene.isActive() || this.index !== shownAt) return;
    this.paintPicture(key);
  }

  /** Cover-fit into the stage, so the picture fills the width and the caption
   * band sits below it rather than over somebody's face. */
  private paintPicture(key: string): void {
    const image = this.add.image(GAME_WIDTH / 2, (GAME_HEIGHT - BAND_HEIGHT) / 2, key).setDepth(PICTURE_DEPTH);
    image.setScale(Math.max(GAME_WIDTH / image.width, (GAME_HEIGHT - BAND_HEIGHT) / image.height));
    // No `sendToBack`: it used to stand in for a depth and could not actually
    // work, since the backdrop it needed to get behind is opaque and was added
    // first. The depth constants say it properly.
  }

  /**
   * The words, laid out one of two ways depending on whether there is a picture
   * to caption.
   *
   * **With a picture** they sit in the band across the bottom: a caption that
   * lands on somebody's face is the usual way this looks wrong, and a fixed band
   * is also a fixed place for the eye to return to.
   *
   * **Without one** the band is the wrong answer, and playing a real game
   * through this screen is what showed it — a picture-less panel put three lines
   * of story hunched at the bottom of an otherwise empty screen, with two thirds
   * of it flat `0x12122a` above them. There is no picture to avoid covering, so
   * the words take the middle, larger and wider. Panels of both kinds sit in the
   * same cut scene (the shipped demo has some of each), so this has to be per
   * panel rather than per scene.
   */
  private drawWords(words: string, hasPicture: boolean): void {
    if (hasPicture) {
      this.add
        .rectangle(0, GAME_HEIGHT - BAND_HEIGHT, GAME_WIDTH, BAND_HEIGHT, 0x0b0b1c, 0.82)
        .setOrigin(0, 0)
        .setDepth(WORDS_DEPTH);
      this.add
        .text(GAME_WIDTH / 2, GAME_HEIGHT - BAND_HEIGHT + 22, words, {
          fontSize: "16px",
          color: "#eeeeee",
          align: "center",
          lineSpacing: 6,
          wordWrap: { width: GAME_WIDTH - 220 },
        })
        .setOrigin(0.5, 0)
        .setDepth(WORDS_DEPTH);
      return;
    }

    // Centred on the space between the panel counter at the top and the
    // Skip/Next row at the bottom, rather than on the scene, so a long passage
    // grows into the room it has instead of creeping under the buttons.
    this.add
      .text(GAME_WIDTH / 2, (GAME_HEIGHT - 20) / 2, words, {
        fontSize: "20px",
        color: "#eeeeee",
        align: "center",
        lineSpacing: 10,
        wordWrap: { width: GAME_WIDTH - 260 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(WORDS_DEPTH);
  }

  private drawControls(): void {
    const isLast = this.index === this.panels.length - 1;
    this.add
      // Carries its own dark pill. It used to be bare muted grey, which read
      // fine against the flat backdrop that was all this screen ever actually
      // drew — the moment pictures started rendering it landed on bright sky and
      // vanished. Safe to give a `backgroundColor` because this string is never
      // empty: an empty padded Text still paints its padding box, which is the
      // stray rectangle the editor carried for weeks.
      .text(GAME_WIDTH / 2, 26, `${this.index + 1} / ${this.panels.length}`, {
        fontSize: "12px",
        color: "#e6e6f0",
        backgroundColor: "#0b0b1cbb",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(CONTROLS_DEPTH);
    this.button(GAME_WIDTH - 130, GAME_HEIGHT - 34, isLast ? "Begin ▶" : "Next ▸", () => this.advance());
    // Always offered, including on the last panel, where it means the same
    // thing as Next — one control that always ends the scene is easier to find
    // in a hurry than one that appears and disappears.
    this.button(30, GAME_HEIGHT - 34, "Skip", () => this.leave());
  }

  private button(x: number, y: number, label: string, onClick: () => void): void {
    const text = this.add
      .text(x, y, label, {
        fontSize: "13px",
        color: "#ffffff",
        backgroundColor: BUTTON_COLOR,
        padding: { x: 14, y: 10 },
      })
      .setOrigin(0, 0.5)
      .setDepth(CONTROLS_DEPTH)
      .setInteractive({ useHandCursor: true });
    text.on("pointerdown", onClick);
    text.on("pointerover", () => text.setStyle({ backgroundColor: BUTTON_HOVER_COLOR }));
    text.on("pointerout", () => text.setStyle({ backgroundColor: BUTTON_COLOR }));
  }

  private advance(): void {
    if (this.leaving) return;
    if (this.index + 1 >= this.panels.length) {
      this.leave();
      return;
    }
    this.index += 1;
    this.render();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(this.next.key, this.next.data);
  }
}
