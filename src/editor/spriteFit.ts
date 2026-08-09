import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";

/**
 * Scales an image down (never up) so it fits within one tile square,
 * preserving aspect ratio. Palette icons and editor-grid entity markers
 * share this so any texture — a plain 32px icon or larger illustrative
 * art like the ghost/portal — reads consistently at tile scale in the
 * editor, regardless of the art's native resolution. Gameplay objects in
 * PlayScene are unaffected and render at full native size.
 */
export function fitWithinTile(image: Phaser.GameObjects.Image, tileSize = TILE_SIZE): void {
  const scale = Math.min(1, tileSize / image.width, tileSize / image.height);
  image.setDisplaySize(image.width * scale, image.height * scale);
}
