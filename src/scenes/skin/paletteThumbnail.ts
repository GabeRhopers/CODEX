import Phaser from "phaser";
import type { PixelPalette } from "../../skins/pixelPalettes";

/**
 * The little grid of squares that stands for a palette in the chooser.
 *
 * Generated rather than drawn, because one of the palettes is "Yours" — it is
 * filled from the colours the child has actually used (see customPalette.ts),
 * so there is no image anybody could have made in advance. The key encodes the
 * colours themselves, so "Yours" gets a fresh texture the moment its contents
 * change and every other palette is generated once for the life of the page.
 *
 * One wire: a scene to make the texture in.
 */
export function paletteThumbnail(scene: Phaser.Scene, palette: PixelPalette): string {
  const key = `palette-thumb-${palette.id}-${palette.colors.join("")}`;
  if (scene.textures.exists(key)) return key;

  // An empty "Yours" has nothing to draw: one flat cell, so the row reads as
  // a palette with no colours yet rather than as a failed image.
  const cols = Math.max(1, Math.ceil(Math.sqrt(palette.colors.length)));
  const cell = 8;
  const size = cols * cell;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0x222634, 1).fillRect(0, 0, size, size);
  palette.colors.forEach((color, i) => {
    g.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 1);
    g.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
  });
  g.generateTexture(key, size, size);
  // Never on the display list (`make`, not `add`), so nothing else will free
  // it — the same reason drawBackdrop's mask graphics is destroyed by hand.
  g.destroy();
  return key;
}
