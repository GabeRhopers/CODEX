import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, GRAVITY_Y } from "./config/gameConfig";
import { BootScene } from "./scenes/BootScene";
import { EditorScene } from "./scenes/EditorScene";
import { PlayScene } from "./scenes/PlayScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  pixelArt: true,
  backgroundColor: "#1a1a2e",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: GRAVITY_Y },
      debug: false,
    },
  },
  scene: [BootScene, EditorScene, PlayScene],
};

new Phaser.Game(config);
