import Phaser from "phaser";
import { GameRect, positionOverlay } from "./domOverlay";

const MAX_NAME_LENGTH = 60;

/**
 * A real, always-visible `<input type="text">` for editing the level's
 * name — positioned via CSS exactly over a spot in the canvas (see
 * domOverlay.ts), the same overlay technique FileInputOverlay uses for
 * file pickers, though for a different reason here: Phaser has no native
 * text-entry widget at all, so there's no "fake Phaser button underneath"
 * to keep in sync the way FileInputOverlay's hover mirroring does — this
 * DOM input *is* the whole control, just styled to blend into the rest
 * of the panel UI.
 *
 * Commits (calls `onChange`) on blur or Enter; Escape reverts the visible
 * text to the last committed value without committing. An empty/
 * whitespace-only value commits as "Untitled Level" rather than saving a
 * blank name, matching `createEmptyLevel`'s own default.
 *
 * `stopPropagation` on every keydown matters more here than it would for
 * an ordinary web page: Phaser's keyboard shortcuts (Space for Test Play,
 * Ctrl+Z/Y for undo/redo) are bound via `window.addEventListener`, not
 * scoped to whether a DOM input has focus — without this, typing a level
 * name containing a space would launch Test Play mid-keystroke.
 *
 * There's a second, less obvious reason this needs its own explicit blur
 * handling rather than relying on ordinary "click elsewhere to commit"
 * browser behavior: Phaser's MouseManager listens on the *canvas*
 * (`target.addEventListener('mousedown', ...)`, bubble phase), and every
 * other button in this UI — Save included — lives on that same canvas.
 * Clicking one of them never bubbles through this input (a separate DOM
 * element entirely), so nothing about that click would ever fire this
 * input's own `blur` handler on its own; confirmed empirically while
 * building this — clicking Save right after typing a new name, without
 * pressing Enter first, saved the *previous* name, silently dropping the
 * edit. The fix is a capture-phase `pointerdown` listener on `document`
 * (registered below): capture-phase listeners on an ancestor always run
 * before a target's own bubble-phase listener, so this reliably blurs
 * (and thus commits) the input *before* Phaser's canvas handler — and
 * therefore before whatever button was clicked — gets a chance to run.
 */
export class LevelNameInput {
  private readonly input: HTMLInputElement;
  private readonly boundReposition = (): void => this.reposition();
  private readonly onDocumentPointerDown = (e: Event): void => {
    if (e.target !== this.input && document.activeElement === this.input) this.input.blur();
  };
  private committedValue: string;

  /** What a blank commit becomes, and what the field advertises itself as.
   * Parameterised (2026-08-26) so the Skin Creator's name field can reuse this
   * class rather than copy it — the capture-phase blur and keydown
   * stopPropagation above are subtle enough that a second copy would mean
   * re-introducing both bugs the next time one of them was touched. */
  private readonly fallback: string;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rect: GameRect,
    initialValue: string,
    private readonly onChange: (value: string) => void,
    options?: { fallback?: string; placeholder?: string },
  ) {
    this.fallback = options?.fallback ?? "Untitled Level";
    this.committedValue = initialValue.trim() || this.fallback;

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.value = this.committedValue;
    this.input.maxLength = MAX_NAME_LENGTH;
    // Doubles as the e2e selector (getByPlaceholder), so the two fields must
    // stay distinguishable.
    this.input.placeholder = options?.placeholder ?? "Level name";
    this.input.style.position = "fixed";
    this.input.style.boxSizing = "border-box";
    this.input.style.background = "#0f3460";
    this.input.style.color = "#ffffff";
    this.input.style.border = "1px solid #3a5a9c";
    this.input.style.borderRadius = "4px";
    this.input.style.padding = "4px 8px";
    this.input.style.fontSize = "14px";
    this.input.style.textAlign = "center";
    this.input.style.zIndex = "1000";

    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        this.input.blur();
      } else if (e.key === "Escape") {
        this.input.value = this.committedValue;
        this.input.blur();
      }
    });
    this.input.addEventListener("keyup", (e) => e.stopPropagation());
    this.input.addEventListener("blur", () => this.commit());
    document.body.appendChild(this.input);
    document.addEventListener("pointerdown", this.onDocumentPointerDown, true);

    this.reposition();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.boundReposition);
    // EditorScene only *pauses* (not stops) while Test Play is active — see
    // FileInputOverlay's docstring for why that matters for a DOM element
    // pinned to a spot in the shared canvas. `blur()` (not just hiding)
    // also matters here specifically: it commits any in-progress edit
    // before Test Play starts, and stops the hidden input from silently
    // absorbing keystrokes meant for gameplay.
    scene.events.on(Phaser.Scenes.Events.PAUSE, this.hide, this);
    scene.events.on(Phaser.Scenes.Events.RESUME, this.show, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private commit(): void {
    const value = this.input.value.trim() || this.fallback;
    this.input.value = value;
    if (value === this.committedValue) return;
    this.committedValue = value;
    this.onChange(value);
  }

  private hide(): void {
    this.input.blur();
    this.input.style.display = "none";
  }

  private show(): void {
    this.input.style.display = "block";
    this.reposition();
  }

  private reposition(): void {
    positionOverlay(this.scene, this.input, this.rect);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.boundReposition);
    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.hide, this);
    this.scene.events.off(Phaser.Scenes.Events.RESUME, this.show, this);
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
    this.input.remove();
  }
}
