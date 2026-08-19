import Phaser from "phaser";
import { GAME_WIDTH, GRID_ORIGIN_Y, GRID_ROWS, TILE_SIZE } from "../config/gameConfig";

export interface TouchControlState {
  left: boolean;
  right: boolean;
  jump: boolean;
  attack: boolean;
}

const BUTTON_RADIUS = 32;
const BUTTON_ALPHA = 0.35;
const MARGIN = 56;

// The level's own visible height, not GAME_HEIGHT — GAME_HEIGHT is taller
// than the grid to fit the editor's header/footer/side panels (see
// gameConfig.ts), and PlayScene renders no header/footer bands of its own
// into that reserved space, so anchoring to GAME_HEIGHT stranded these
// buttons deep in the dead space below the actual level content.
const PLAYABLE_HEIGHT = GRID_ROWS * TILE_SIZE;

/** On-screen left/right/jump buttons for PlayScene, OR'd into keyboard
 * input in PlayerController rather than replacing it — harmless (and
 * genuinely tappable, not just decorative) on a mouse too, so there's no
 * touch-vs-desktop device detection to get wrong. Semi-transparent and
 * pinned to the corners via setScrollFactor(0) so they read as an overlay,
 * not part of the level. Each button tracks its own pointer id so a finger
 * sliding off still releases it (pointerup/pointerout), and a second
 * simultaneous finger on another button works too — see main.ts's
 * `input.activePointers` for the multi-touch budget this needs. */
export class TouchControls {
  private state: TouchControlState = { left: false, right: false, jump: false, attack: false };

  constructor(scene: Phaser.Scene) {
    const y = GRID_ORIGIN_Y + PLAYABLE_HEIGHT - MARGIN;
    this.makeButton(scene, MARGIN, y, "◀", (down) => (this.state.left = down));
    this.makeButton(scene, MARGIN + BUTTON_RADIUS * 2 + 16, y, "▶", (down) => (this.state.right = down));
    this.makeButton(scene, GAME_WIDTH - MARGIN, y, "▲", (down) => (this.state.jump = down));
    // Stacked directly above Jump rather than beside it — there's no
    // free horizontal room on the right edge once Jump's own margin is
    // accounted for, and stacking keeps both reachable by the same thumb.
    this.makeButton(scene, GAME_WIDTH - MARGIN, y - (BUTTON_RADIUS * 2 + 16), "⚡", (down) => (this.state.attack = down));
  }

  get(): TouchControlState {
    return this.state;
  }

  private makeButton(scene: Phaser.Scene, x: number, y: number, label: string, setDown: (down: boolean) => void): void {
    const circle = scene.add
      .circle(x, y, BUTTON_RADIUS, 0xffffff, BUTTON_ALPHA)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setScrollFactor(0)
      .setDepth(40)
      .setInteractive({ useHandCursor: true });
    scene.add
      .text(x, y, label, { fontSize: "22px", color: "#ffffff" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(41)
      .setAlpha(0.8);

    circle.on("pointerdown", () => setDown(true));
    circle.on("pointerup", () => setDown(false));
    circle.on("pointerout", () => setDown(false));
  }
}
