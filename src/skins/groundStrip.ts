import { GroundSkin, GROUND_SKINS } from "../level/groundSkins";

/**
 * Which painted skin supplies each frame of a ground tileset strip.
 *
 * Blocks don't render the way every other skinnable thing does. An entity is
 * one Sprite with one swappable texture; a block is a *frame index* into a
 * shared, gid-addressed tileset — four 6-frame strips registered side by side,
 * each claiming its own 6-wide gid range (grass 0-5, desert 6-11, castle 12-17,
 * snow 18-23; see groundAutotile.ts, which owns that layout and is the only
 * place a stored tile value becomes a frame number).
 *
 * That used to be the reason blocks couldn't be reskinned at all. It isn't,
 * because the gid maths never asks which *texture* a frame came from: reskinning
 * a block means handing `addTilesetImage` a different 192x32 image with the same
 * six frames in the same order. This table is that image's contents, expressed
 * as "slot i of skin X is painted by brush B's frame F" — the exact inverse of
 * groundAutotile.ts's lookup, and checked against it in the tests rather than
 * restated on trust.
 *
 * Pure data, no Phaser: composing the actual texture is groundTileset.ts's job.
 */

export interface StripSlot {
  /** The Palette brush id whose skin paints this frame. */
  brushId: string;
  /**
   * Which of that brush's frames — `top` or `fill` for the autotiling blocks
   * (see spriteFrames.ts's TILE_FRAMES). Omitted for Brick and Bounce, which
   * are one fixed look and stay single-frame skins.
   */
  frame?: string;
}

/** Frames per skin strip — the 6-wide gid stride the whole tilemap is built
 * around. */
export const STRIP_LENGTH = 6;

/**
 * `null` means "no block resolves to this frame, so nothing can repaint it".
 *
 * Desert's and Snow's slots 2-5 are those holes: Brick, Bounce and Water are
 * shared pixel-for-pixel across grass/desert/snow (see prepare-kenney-assets.py)
 * and groundAutotile.ts's FIXED_FRAMES/HAZARD_KIND_FRAMES resolve all three to
 * *grass's* copy, so desert's and snow's are unreachable and always were. It
 * also means skinning Brick changes brick everywhere except Castle, which has
 * its own brush (`brick-castle`) and its own slot. That is existing behaviour
 * surfacing, not a new limitation.
 */
export const GROUND_STRIP_FRAMES: Record<GroundSkin, readonly (StripSlot | null)[]> = {
  grass: [
    { brushId: "ground-grass", frame: "top" },
    { brushId: "ground-grass", frame: "fill" },
    { brushId: "brick" },
    { brushId: "bounce" },
    { brushId: "water", frame: "top" },
    { brushId: "water", frame: "fill" },
  ],
  desert: [{ brushId: "ground-desert", frame: "top" }, { brushId: "ground-desert", frame: "fill" }, null, null, null, null],
  castle: [
    { brushId: "ground-castle", frame: "top" },
    { brushId: "ground-castle", frame: "fill" },
    { brushId: "brick-castle" },
    { brushId: "bounce-castle" },
    { brushId: "lava", frame: "top" },
    { brushId: "lava", frame: "fill" },
  ],
  snow: [{ brushId: "ground-snow", frame: "top" }, { brushId: "ground-snow", frame: "fill" }, null, null, null, null],
};

/**
 * Every block brush a painted skin can actually reach — derived from the table
 * above rather than listed again, so a brush can never be offered a skin picker
 * that nothing would ever render.
 */
export const SKINNABLE_BLOCK_IDS: ReadonlySet<string> = new Set(
  GROUND_SKINS.flatMap((skin) => GROUND_STRIP_FRAMES[skin].map((slot) => slot?.brushId).filter((id): id is string => !!id)),
);

export function isSkinnableBlockId(brushId: string): boolean {
  return SKINNABLE_BLOCK_IDS.has(brushId);
}

/**
 * The texture key for one composed strip.
 *
 * `sources` is one entry per slot naming the *image* that painted it — a skin
 * id plus the frame that actually supplied the pixels — or null for a slot left
 * as the shipped art. Two different compositions can therefore never collide on
 * one key, which is what makes it safe to keep a composed texture forever
 * instead of overwriting it: reusing a key while a live TilemapLayer still
 * points at it is the confirmed WebGL crash skinLoader.ts's
 * activeSkinTextureKey docstring describes at length, and a tileset texture is
 * exactly such a live reference.
 */
export function groundStripTextureKey(skin: GroundSkin, sources: readonly (string | null)[]): string {
  return `ground-strip-${skin}-${sources.map((source) => source ?? "_").join("~")}`;
}
