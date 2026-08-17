import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, GRAVITY_Y } from "./config/gameConfig";
import { BootScene } from "./scenes/BootScene";
import { EditorScene } from "./scenes/EditorScene";
import { LevelBrowserScene } from "./scenes/LevelBrowserScene";
import { MenuScene } from "./scenes/MenuScene";
import { PlayScene } from "./scenes/PlayScene";
import { ProfileGateScene } from "./scenes/ProfileGateScene";
import { SkinEditorScene } from "./scenes/SkinEditorScene";
import { TemplateBrowserScene } from "./scenes/TemplateBrowserScene";
import { WorldBrowserScene } from "./scenes/WorldBrowserScene";
import { WorldMakerScene } from "./scenes/WorldMakerScene";
import { installTextDefaults } from "./ui/textDefaults";

// Must run before any scene's create() can call scene.add.text(...) — see
// textDefaults.ts's docstring for what this fixes and why.
installTextDefaults();

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
  scene: [
    BootScene,
    ProfileGateScene,
    MenuScene,
    LevelBrowserScene,
    EditorScene,
    PlayScene,
    WorldBrowserScene,
    WorldMakerScene,
    TemplateBrowserScene,
    SkinEditorScene,
  ],
};

const game = new Phaser.Game(config);

// Phaser's own ScaleManager only ever listens for `window`'s 'resize' and
// 'orientationchange' events (see node_modules/phaser/src/scale/
// ScaleManager.js) — it has no ResizeObserver or visualViewport listener
// of its own. On Android Chrome specifically, the dynamic address/tab bar
// showing or hiding (e.g. on scroll) changes the actual visible viewport
// — the same change index.html's `#app` already tracks via `100dvh` — but
// does so via a `visualViewport` resize, which doesn't reliably also fire
// a `window` 'resize'. Without this, the canvas stays sized for whatever
// the toolbar state was at the last event Phaser DID see, so it can end up
// alternately too large (spilling past the now-shorter visible area,
// forcing a scroll/crop) or too small, independently of anything the page
// itself did — exactly the "sometimes too big, sometimes too small" report
// this fixes. `scale.refresh()` is Phaser's own public API for forcing a
// fresh measurement of its parent and re-fitting the canvas to it;
// `visualViewport` itself is undefined in a handful of older browsers,
// hence the guard (Phaser's own window-resize listening still covers
// those as before).
window.visualViewport?.addEventListener("resize", () => game.scale.refresh());
