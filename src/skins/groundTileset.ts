import Phaser from "phaser";
import { TILE_SIZE } from "../config/gameConfig";
import { GroundSkin, GROUND_SKINS, groundTilesetKey } from "../level/groundSkins";
import { GROUND_STRIP_FRAMES, STRIP_LENGTH, groundStripTextureKey } from "./groundStrip";
import { loadImage } from "./pixelSkinCells";
import { resolveActiveSkinArt } from "./skinLoader";
import { LevelSkins } from "./skinSelection";

/**
 * Turns painted block skins into the four tileset textures the ground layer is
 * built from.
 *
 * The composition is deliberately **overpainting, not assembling**: start from
 * the shipped tileset image and replace only the frames whose brush is actually
 * wearing a skin. That gives per-frame fallback for free — an unskinned frame is
 * literally the built-in art, byte for byte — with no fallback logic to write
 * and nothing to get wrong when someone skins Brick but not Grass. It also means
 * a level with no block skins at all registers **no textures**: composeGround-
 * Tilesets hands back the built-in keys and the tilemap is exactly what it was
 * before this feature existed.
 *
 * What it never touches: gids, autotiling, collision, BOUNCE_FRAMES,
 * WATER_FRAMES, HAZARD_FRAMES. Those all key off the frame *index*, and the
 * index doesn't move — only the pixels behind it do. A skinned Water tile is
 * still swimmable and a skinned Lava tile still kills, which is the property
 * that matters most here: art must not be able to change behaviour.
 */

/** The four built-in tileset keys — what an unskinned level uses, and the
 * starting point every composition paints over. */
export function builtInGroundTilesets(): Record<GroundSkin, string> {
  return Object.fromEntries(GROUND_SKINS.map((skin) => [skin, groundTilesetKey(skin)])) as Record<GroundSkin, string>;
}

/** One slot's painted art, ready to draw. */
interface SlotArt {
  index: number;
  image: HTMLImageElement;
}

/**
 * The texture key for one skin's strip: a composed texture if any of its frames
 * is skinned, otherwise the built-in key unchanged.
 *
 * Every image is decoded *before* anything is drawn, so the canvas is created
 * and filled in one synchronous run. A half-drawn texture is never observable
 * under its final key, which matters because the key is how a second call
 * decides the work is already done.
 */
export async function composeGroundStrip(
  scene: Phaser.Scene,
  skin: GroundSkin,
  levelSkins?: LevelSkins,
): Promise<string> {
  const builtIn = groundTilesetKey(skin);
  const slots = GROUND_STRIP_FRAMES[skin];
  const sources: (string | null)[] = [];
  const pending: Promise<SlotArt>[] = [];

  for (const [index, slot] of slots.entries()) {
    if (!slot) {
      sources.push(null);
      continue;
    }
    const art = await resolveActiveSkinArt(slot.brushId, levelSkins);
    const resolved = art?.frame(slot.frame);
    if (!art || !resolved) {
      sources.push(null);
      continue;
    }
    sources.push(`${art.id}~${resolved.suppliedBy}`);
    pending.push(
      loadImage(resolved.dataUrl, `Couldn't decode the ${slot.brushId} skin`).then((image) => ({ index, image })),
    );
  }

  if (pending.length === 0) return builtIn;

  const key = groundStripTextureKey(skin, sources);
  // Composed textures are permanent, per exactly this set of source images (see
  // groundStripTextureKey) — so an already-composed strip is simply reused,
  // never re-registered under a live TilemapLayer.
  if (scene.textures.exists(key)) return key;

  let painted: SlotArt[];
  try {
    painted = await Promise.all(pending);
  } catch (err: unknown) {
    // A skin that won't decode is not a reason to lose the level's ground.
    console.error("Couldn't compose the ground tileset:", err);
    return builtIn;
  }

  // The one race worth guarding: two composes of the same strip can interleave
  // across the awaits above, and createCanvas returns null for a key that
  // already exists.
  if (scene.textures.exists(key)) return key;
  const canvas = scene.textures.createCanvas(key, TILE_SIZE * STRIP_LENGTH, TILE_SIZE);
  if (!canvas) return builtIn;
  const ctx = canvas.getContext();

  // Start from the shipped art, so every unskinned frame stays exactly itself.
  const source = scene.textures.get(builtIn).getSourceImage();
  ctx.drawImage(source as CanvasImageSource, 0, 0, TILE_SIZE * STRIP_LENGTH, TILE_SIZE);

  for (const { index, image } of painted) {
    // Cleared first: a skin with transparent pixels should show through to
    // nothing, not to the built-in tile it replaced.
    ctx.clearRect(index * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    ctx.drawImage(image, index * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
  }
  canvas.refresh();
  return key;
}

/**
 * Every strip at once — what EditorScene and PlayScene hand to
 * `addTilesetImage`.
 *
 * Called **once per scene build**, before any tilemap is created, and never
 * from inside the layer-building path itself: `createGroundLayer` runs on every
 * area switch and is synchronous, so awaiting in there would reintroduce the
 * "synchronous field updates land before the async work settles" race that has
 * bitten this codebase before.
 */
export function composeGroundTilesets(
  scene: Phaser.Scene,
  levelSkins?: LevelSkins,
): Promise<Record<GroundSkin, string>> {
  // Bounded, for the same reason pixelSkinCells.loadImage is: a promise that
  // neither resolves nor rejects makes every caller wait forever, and the
  // skins read underneath this is a real network round trip with no timeout of
  // its own. A rejection is handled below; a request that simply never answers
  // is not, and PlayScene waits on this before it builds the area — so an
  // unbounded wait here is a level that never starts. Falling back to the
  // shipped art is always a correct answer, just not the prettiest one.
  return Promise.race([
    composeAll(scene, levelSkins),
    new Promise<Record<GroundSkin, string>>((resolve) =>
      setTimeout(() => {
        console.error("Timed out composing the ground tilesets; using the built-in art");
        resolve(builtInGroundTilesets());
      }, COMPOSE_TIMEOUT_MS),
    ),
  ]);
}

/** Generous: this is a stuck-forever backstop, not a performance budget, and a
 * cold Drive read on a loaded machine is exactly where a slow-but-fine
 * composition happens. Matches pixelSkinCells' own DECODE_TIMEOUT_MS. */
const COMPOSE_TIMEOUT_MS = 10_000;

async function composeAll(scene: Phaser.Scene, levelSkins?: LevelSkins): Promise<Record<GroundSkin, string>> {
  const keys = builtInGroundTilesets();
  for (const skin of GROUND_SKINS) {
    try {
      keys[skin] = await composeGroundStrip(scene, skin, levelSkins);
    } catch (err: unknown) {
      // Never rejects, deliberately. PlayScene *waits* on this before it
      // builds the area, so a rejection here would mean no ground, no
      // player, no level — a level that never starts. The skins read behind
      // it is a Drive round trip and can genuinely fail (see
      // skinStorage.loadCustomSkins, which clears its in-flight promise
      // precisely so a failure can be retried), and before blocks were
      // skinnable a failed skins read only ever cost you the skins.
      // Falling back to the built-in strip keeps that true.
      console.error(`Couldn't compose the ${skin} ground tileset:`, err);
    }
  }
  return keys;
}

/** Whether two resolved key sets are the same — lets a re-resolve skip
 * rebuilding a tilemap that would come out identical. */
export function sameGroundTilesets(a: Record<GroundSkin, string>, b: Record<GroundSkin, string>): boolean {
  return GROUND_SKINS.every((skin) => a[skin] === b[skin]);
}
