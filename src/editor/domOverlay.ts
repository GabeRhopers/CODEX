import Phaser from "phaser";

export interface GameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Positions a DOM element (assumed `position: fixed`) so it exactly
 * covers `rect` (in game/virtual-resolution coordinates, same space as
 * every other EditorUI layout constant) on top of the canvas, converting
 * to real CSS pixels via the canvas's actual on-screen size — which
 * already reflects Phaser.Scale.FIT's scaling and CENTER_BOTH's
 * letterboxing for free, since both are plain CSS on the canvas element
 * and `getBoundingClientRect()` picks them up automatically.
 *
 * Shared by every DOM element that needs to sit precisely on top of a
 * spot in the game canvas — FileInputOverlay (Upload BG/Music) and
 * LevelNameInput (the level-name text field) both call this from their
 * own resize/reposition handling rather than duplicating the math.
 */
export function positionOverlay(scene: Phaser.Scene, el: HTMLElement, rect: GameRect): void {
  const canvasRect = scene.game.canvas.getBoundingClientRect();
  const scale = canvasRect.width / scene.scale.width;
  el.style.left = `${canvasRect.left + rect.x * scale}px`;
  el.style.top = `${canvasRect.top + rect.y * scale}px`;
  el.style.width = `${rect.width * scale}px`;
  el.style.height = `${rect.height * scale}px`;
}
