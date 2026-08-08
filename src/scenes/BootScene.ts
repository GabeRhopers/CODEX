import Phaser from "phaser";
import { generateTextures } from "../assets/generateTextures";
import { WIZARD_FRAME_KEYS } from "../gameplay/wizardAnimation";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    for (const key of WIZARD_FRAME_KEYS) {
      this.load.image(key, `/assets/wizard/${key.replace("wizard-", "")}.png`);
    }
  }

  create(): void {
    generateTextures(this);
    this.scene.start("Editor");
  }
}
