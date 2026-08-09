import Phaser from "phaser";
import { generateTextures } from "../assets/generateTextures";
import { WIZARD_FRAME_KEYS } from "../gameplay/wizardAnimation";

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
  }

  create(): void {
    generateTextures(this);
    this.scene.start("Editor");
  }
}
