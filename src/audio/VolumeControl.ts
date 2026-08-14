import Phaser from "phaser";
import { loadAudioPrefs, saveAudioPrefs } from "./audioPrefs";

const TRACK_HEIGHT = 6;
const THUMB_RADIUS = 8;
const MUTE_BUTTON_OFFSET = 34; // approximate width budgeted for the mute icon button
const BUTTON_COLOR = "#0f3460";
const BUTTON_HOVER_COLOR = "#3a5a9c";

/**
 * A small mute-toggle + draggable volume slider, reused as-is by both
 * MenuScene (the home-page theme song) and PlayScene (a level's uploaded
 * music) — see audioPrefs.ts. Reads/writes `scene.sound` directly (the
 * *game's* shared SoundManager, not a scene-scoped one), so whichever
 * scene's control the player actually touches affects every currently
 * playing sound the same way, and both scenes' controls stay in sync with
 * each other and with what's persisted to localStorage.
 */
export class VolumeControl {
  private readonly muteButton: Phaser.GameObjects.Text;
  private readonly track: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly thumb: Phaser.GameObjects.Arc;
  private readonly sliderX: number;
  private readonly sliderWidth: number;
  private readonly trackY: number;
  private dragging = false;
  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.dragging) this.setVolumeFromPointerX(pointer.x);
  };
  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    depth = 0,
  ) {
    const prefs = loadAudioPrefs();

    this.muteButton = scene.add
      .text(x, y, prefs.muted ? "\u{1F507}" : "\u{1F50A}", {
        fontSize: "15px",
        backgroundColor: BUTTON_COLOR,
        padding: { x: 6, y: 5 },
      })
      .setOrigin(0, 0.5)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    this.muteButton.on("pointerdown", () => this.toggleMute());
    this.muteButton.on("pointerover", () => this.muteButton.setStyle({ backgroundColor: BUTTON_HOVER_COLOR }));
    this.muteButton.on("pointerout", () => this.muteButton.setStyle({ backgroundColor: BUTTON_COLOR }));

    this.sliderX = x + MUTE_BUTTON_OFFSET;
    this.sliderWidth = Math.max(20, width - MUTE_BUTTON_OFFSET);
    this.trackY = y;

    this.track = scene.add
      .rectangle(this.sliderX, this.trackY, this.sliderWidth, TRACK_HEIGHT, 0x0f3460)
      .setOrigin(0, 0.5)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });
    this.fill = scene.add.rectangle(this.sliderX, this.trackY, 1, TRACK_HEIGHT, 0x4caf50).setOrigin(0, 0.5).setDepth(depth);
    this.thumb = scene.add.circle(this.sliderX, this.trackY, THUMB_RADIUS, 0xffffff).setDepth(depth + 1).setInteractive({ useHandCursor: true });

    const startDrag = (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.setVolumeFromPointerX(pointer.x);
    };
    this.track.on("pointerdown", startDrag);
    this.thumb.on("pointerdown", startDrag);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp);

    this.applyVisualState();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private setVolumeFromPointerX(pointerX: number): void {
    const ratio = Phaser.Math.Clamp((pointerX - this.sliderX) / this.sliderWidth, 0, 1);
    this.scene.sound.volume = ratio;
    // Dragging the slider up while muted un-mutes, matching most OS/app
    // volume sliders — otherwise a muted player could drag to 100% and
    // hear nothing, with no visual cue why.
    if (ratio > 0 && this.scene.sound.mute) this.scene.sound.mute = false;
    this.persist();
    this.applyVisualState();
  }

  private toggleMute(): void {
    this.scene.sound.mute = !this.scene.sound.mute;
    this.persist();
    this.applyVisualState();
  }

  private persist(): void {
    saveAudioPrefs({ volume: this.scene.sound.volume, muted: this.scene.sound.mute });
  }

  private applyVisualState(): void {
    const muted = this.scene.sound.mute;
    const volume = this.scene.sound.volume;
    this.muteButton.setText(muted ? "\u{1F507}" : "\u{1F50A}");
    const fillWidth = Math.max(1, this.sliderWidth * volume);
    this.fill.width = fillWidth;
    this.fill.setFillStyle(muted ? 0x666688 : 0x4caf50);
    this.thumb.setPosition(this.sliderX + fillWidth, this.trackY);
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onPointerUp);
    this.muteButton.destroy();
    this.track.destroy();
    this.fill.destroy();
    this.thumb.destroy();
  }
}
