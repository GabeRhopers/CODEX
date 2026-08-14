import Phaser from "phaser";

export interface GameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A real, always-present `<input type="file">`, positioned via CSS
 * (not Phaser) exactly on top of EditorUI's "Upload BG" button — invisible
 * (`opacity: 0`) but the actual click target, rather than something a
 * Phaser button handler opens by calling `.click()` on it.
 *
 * That distinction isn't cosmetic: browsers only open a real file-picker
 * dialog from a call that's a direct, synchronous consequence of a
 * trusted user gesture event. Phaser's own pointer events are captured by
 * a DOM listener but *dispatched* to game-object handlers later, during
 * the engine's own game-loop step — by the time a Phaser button's
 * `pointerdown` callback runs, the call is no longer a direct descendant
 * of the native click event, so `input.click()` from inside it silently
 * no-ops the dialog in Chromium/Firefox instead of opening it (confirmed
 * empirically: the `<input>` element gets created and `.click()`-ed with
 * no error, but no `filechooser`/dialog ever appears). Overlaying the real
 * input directly under the cursor sidesteps the problem entirely — the
 * browser sees an ordinary, unmediated click on a file input, exactly
 * like any other web page's upload button.
 *
 * `rect` is in game (virtual-resolution) coordinates, same space as every
 * other EditorUI layout constant; this class converts to real CSS pixels
 * using the canvas's actual on-screen size, which already accounts for
 * Phaser.Scale.FIT's scaling and CENTER_BOTH's letterboxing (both are
 * plain CSS on the canvas element, so `getBoundingClientRect()` reflects
 * them for free).
 */
export class BackgroundFileInput {
  private readonly input: HTMLInputElement;
  private readonly boundReposition = (): void => this.reposition();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly rect: GameRect,
    onFile: (file: File) => void,
    onHoverChange: (hovering: boolean) => void,
  ) {
    this.input = document.createElement("input");
    this.input.type = "file";
    this.input.accept = "image/*";
    this.input.style.position = "fixed";
    this.input.style.opacity = "0";
    this.input.style.cursor = "pointer";
    this.input.style.margin = "0";
    this.input.style.zIndex = "1000";

    this.input.addEventListener("change", () => {
      const file = this.input.files?.[0];
      this.input.value = ""; // so picking the same file again still fires 'change'
      if (file) onFile(file);
    });
    this.input.addEventListener("mouseenter", () => onHoverChange(true));
    this.input.addEventListener("mouseleave", () => onHoverChange(false));
    document.body.appendChild(this.input);

    this.reposition();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.boundReposition);
    // EditorScene only *pauses* (not stops) while Test Play is active — the
    // canvas is shared, so without this an invisible, still-clickable
    // input positioned over the Actions panel would sit right on top of
    // PlayScene's own on-screen controls in that same screen region and
    // silently swallow taps meant for them. `display: none` both hides it
    // and removes it from hit-testing.
    scene.events.on(Phaser.Scenes.Events.PAUSE, this.hide, this);
    scene.events.on(Phaser.Scenes.Events.RESUME, this.show, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private hide(): void {
    this.input.style.display = "none";
  }

  private show(): void {
    this.input.style.display = "block";
    this.reposition();
  }

  private reposition(): void {
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();
    const scale = canvasRect.width / this.scene.scale.width;
    this.input.style.left = `${canvasRect.left + this.rect.x * scale}px`;
    this.input.style.top = `${canvasRect.top + this.rect.y * scale}px`;
    this.input.style.width = `${this.rect.width * scale}px`;
    this.input.style.height = `${this.rect.height * scale}px`;
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.boundReposition);
    this.scene.events.off(Phaser.Scenes.Events.PAUSE, this.hide, this);
    this.scene.events.off(Phaser.Scenes.Events.RESUME, this.show, this);
    this.input.remove();
  }
}
