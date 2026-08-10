import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, GRAVITY_Y } from "./config/gameConfig";
import { BootScene } from "./scenes/BootScene";
import { EditorScene } from "./scenes/EditorScene";
import { LevelBrowserScene } from "./scenes/LevelBrowserScene";
import { MenuScene } from "./scenes/MenuScene";
import { PlayScene } from "./scenes/PlayScene";
import { WorldBrowserScene } from "./scenes/WorldBrowserScene";
import { WorldMakerScene } from "./scenes/WorldMakerScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  pixelArt: true,
  backgroundColor: "#1a1a2e",
  // FIT + CENTER_BOTH scales the fixed GAME_WIDTH/GAME_HEIGHT canvas down
  // (letterboxed, aspect preserved) to whatever viewport it's opened in —
  // a phone screen included — instead of rendering at native size and
  // getting clipped or forcing page scroll/zoom. Every scene's own layout
  // math still targets GAME_WIDTH/GAME_HEIGHT; only the on-screen pixel
  // size changes, and Phaser's input manager maps touch/pointer
  // coordinates back through the same scale automatically.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  // Default is 1 active pointer (no simultaneous touches). PlayScene's
  // on-screen controls need at least 2 at once (move + jump); 3 leaves
  // room for a stray extra touch instead of silently dropping input.
  input: {
    activePointers: 3,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: GRAVITY_Y },
      debug: false,
    },
  },
  scene: [BootScene, MenuScene, LevelBrowserScene, EditorScene, PlayScene, WorldBrowserScene, WorldMakerScene],
};

new Phaser.Game(config);
