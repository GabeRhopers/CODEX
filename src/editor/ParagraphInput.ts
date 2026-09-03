import Phaser from "phaser";
import { GameRect, positionOverlay } from "./domOverlay";

const MAX_PARAGRAPH_LENGTH = 400;

/**
 * A real `<textarea>` for the several lines a cut-scene panel says, positioned
 * over a spot in the canvas by `domOverlay.ts` — the same technique
 * `LevelNameInput` and `FileInputOverlay` use, for the same reason: Phaser has
 * no text-entry widget at all, so this DOM element *is* the control.
 *
 * **A sibling of `LevelNameInput`, sharing its three non-obvious behaviours** —
 * each of which that class's docstring records as a real bug, not a precaution:
 *
 * - `stopPropagation` on every keydown/keyup. Phaser's shortcuts are bound on
 *   `window`, not scoped to DOM focus, so without this, typing a space into a
 *   cut-scene caption would launch Test Play mid-sentence.
 * - A **capture-phase `pointerdown` on `document`** to blur. Phaser listens on
 *   the *canvas*, and every button in this UI lives there; a click on Save never
 *   bubbles through this element, so nothing would fire its `blur` on its own
 *   and the edit would be silently dropped. Capture-phase on an ancestor runs
 *   before the canvas handler, so the commit lands first.
 * - Escape reverts to the last committed value rather than committing.
 *
 * **The one deliberate divergence: Enter inserts a newline.** That is the whole
 * point of a paragraph field, so unlike the one-line input there is no
 * commit-on-Enter — this commits on blur, which the capture-phase handler above
 * makes reliable. Ctrl/Cmd+Enter commits too, for anyone who expects a keyboard
 * way out.
 *
 * Blank is a legitimate value here, unlike a level name: a panel may be a
 * picture with nothing written over it, so there is no fallback string.
 */
export class ParagraphInput {
  private readonly area: HTMLTextAreaElement;
  private readonly boundReposition = (): void => this.reposition();
  private readonly onDocumentPointerDown = (e: Event): void => {
    if (e.target !== this.area && document.activeElement === this.area) this.area.blur();
  };
  private committedValue: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rect: GameRect,
    initialValue: string,
    private readonly onChange: (value: string) => void,
    options?: { placeholder?: string },
  ) {
    this.committedValue = initialValue;

    this.area = document.createElement("textarea");
    this.area.value = initialValue;
    this.area.maxLength = MAX_PARAGRAPH_LENGTH;
    // Doubles as the e2e selector (getByPlaceholder), so every field on a screen
    // must stay distinguishable.
    this.area.placeholder = options?.placeholder ?? "What happens here?";
    this.area.style.position = "fixed";
    this.area.style.boxSizing = "border-box";
    this.area.style.background = "#0f3460";
    this.area.style.color = "#ffffff";
    this.area.style.border = "1px solid #3a5a9c";
    this.area.style.borderRadius = "4px";
    this.area.style.padding = "6px 8px";
    this.area.style.fontSize = "13px";
    this.area.style.lineHeight = "1.4";
    this.area.style.fontFamily = "inherit";
    // The overlay is sized by the layout, so a drag handle would let someone
    // pull it over the controls beside it.
    this.area.style.resize = "none";
    this.area.style.zIndex = "1000";

    this.area.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        this.area.value = this.committedValue;
        this.area.blur();
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        this.area.blur();
      }
      // A bare Enter is left alone on purpose: it types a newline.
    });
    this.area.addEventListener("keyup", (e) => e.stopPropagation());
    this.area.addEventListener("blur", () => this.commit());
    document.body.appendChild(this.area);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);

    this.reposition();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.boundReposition);
    // Same pause/resume handling as LevelNameInput: a scene that is merely
    // paused still has its DOM overlays pinned to the shared canvas, and
    // `blur()` rather than hiding alone commits any in-progress edit before
    // whatever took over starts absorbing keystrokes.
    scene.events.on(Phaser.Scenes.Events.PAUSE, this.hide, this);
    scene.events.on(Phaser.Scenes.Events.RESUME, this.show, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private commit(): void {
    const value = this.area.value;
    if (value === this.committedValue) return;
    this.committedValue = value;
    this.onChange(value);
  }

  private hide(): void {
    this.area.blur();
    this.area.style.display = "none";
  }

  private show(): void {
    this.area.style.display = "block";
    this.reposition();
  }

  private reposition(): void {
    positionOverlay(this.scene, this.area, this.rect);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.boundReposition);
    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.hide, this);
    this.scene.events.off(Phaser.Scenes.Events.RESUME, this.show, this);
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.area.remove();
  }
}
