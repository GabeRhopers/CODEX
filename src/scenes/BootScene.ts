import Phaser from "phaser";
import { generateTextures } from "../assets/generateTextures";
import { WIZARD_FRAME_KEYS } from "../gameplay/wizardAnimation";
import { groundIconKey, groundTilesetKey } from "../level/themes";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    // Relative paths (no leading slash) so assets resolve correctly whether
    // the app is served from a domain root (dev server) or a subpath (a
    // GitHub Pages project site) - see the `base` comment in vite.config.ts.
    for (const key of WIZARD_FRAME_KEYS) {
      this.load.image(key, `assets/wizard/${key.replace("wizard-", "")}.png`);
    }
    this.load.image("enemy-ghost-pillow", "assets/entities/ghost-pillow.png");
    this.load.image("goal-portal", "assets/entities/dream-portal.png");

    // Real Kenney "Pixel Platformer" (CC0) art for the grass/desert ground
    // themes, the brick/bounce blocks, and the bat/spike-crawler enemies —
    // see generateTextures.ts for why castle's tileset (no stone tile in
    // this pack) and the UI chrome stay procedural. Pre-composited to this
    // project's tile/entity sizes by a one-off prep script (source tiles
    // are 18px/24px native); see the "Real art" note in generateTextures.ts.
    this.load.image(groundTilesetKey("grass"), "assets/tiles/tileset-grass.png");
    this.load.image(groundIconKey("grass"), "assets/tiles/icon-grass.png");
    this.load.image(groundTilesetKey("desert"), "assets/tiles/tileset-desert.png");
    this.load.image(groundIconKey("desert"), "assets/tiles/icon-desert.png");
    this.load.image("tile-brick-icon", "assets/tiles/icon-brick.png");
    this.load.image("tile-bounce-icon", "assets/tiles/icon-bounce.png");
    this.load.image("enemy-bat", "assets/entities/bat.png");
    this.load.image("enemy-spike-crawler", "assets/entities/spike-crawler.png");
  }

  create(): void {
    generateTextures(this);
    this.scene.start("Menu");
  }
}
