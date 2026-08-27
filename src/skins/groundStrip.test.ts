import { describe, expect, it } from "vitest";
import { PALETTE } from "../editor/Palette";
import { GROUND_SKINS } from "../level/groundSkins";
import { groundFrameAt } from "../level/groundAutotile";
import {
  GROUND_STRIP_FRAMES,
  STRIP_LENGTH,
  SKINNABLE_BLOCK_IDS,
  groundStripTextureKey,
  isSkinnableBlockId,
  StripSlot,
} from "./groundStrip";
import { framePlanFor } from "./spriteFrames";

/**
 * The table in groundStrip.ts is a claim about where each block's art lives in
 * the combined tileset, and the cost of getting it wrong is silent and severe:
 * a skin painted onto the wrong slot repaints a *different* block, and if that
 * slot happens to be Water or Lava it repaints something with behaviour
 * attached. So rather than restating the numbers, these tests derive them from
 * groundAutotile.ts — the module that actually decides which frame a stored tile
 * renders as — and check the table agrees.
 */

const BLOCK_BRUSHES = PALETTE.filter((brush) => brush.category === "blocks");

/** The four strips laid end to end, which is exactly the gid space the tilemap
 * addresses: GROUND_SKINS order, 6 frames each. */
const FLAT_SLOTS: readonly (StripSlot | null)[] = GROUND_SKINS.flatMap((skin) => GROUND_STRIP_FRAMES[skin]);

/** What groundAutotile really renders for a stored tile value: exposed (nothing
 * above it) and buried (another cell of the same kind directly above). */
function framesOf(tileIndex: number): { top: number; fill: number } {
  return {
    top: groundFrameAt([[tileIndex]], 0, 0),
    fill: groundFrameAt([[tileIndex], [tileIndex]], 0, 1),
  };
}

describe("GROUND_STRIP_FRAMES", () => {
  it("gives every ground skin a full 6-frame strip", () => {
    for (const skin of GROUND_SKINS) {
      expect(GROUND_STRIP_FRAMES[skin]).toHaveLength(STRIP_LENGTH);
    }
    // The whole gid space, so a global frame index is a direct lookup.
    expect(FLAT_SLOTS).toHaveLength(GROUND_SKINS.length * STRIP_LENGTH);
  });

  it("puts each block brush at exactly the frames groundAutotile renders it as", () => {
    // Guards against this loop silently testing nothing if the Blocks category
    // is ever renamed or emptied.
    expect(BLOCK_BRUSHES).toHaveLength(10);

    for (const brush of BLOCK_BRUSHES) {
      expect(brush.tileIndex, `${brush.id} has no tileIndex`).toBeDefined();
      const { top, fill } = framesOf(brush.tileIndex!);
      const plan = framePlanFor(brush.id);

      if (plan) {
        // Autotiling blocks: two distinct frames, painted by two named frames
        // of the same skin.
        expect(top, `${brush.id} top/fill share a frame`).not.toBe(fill);
        expect(FLAT_SLOTS[top]).toEqual({ brushId: brush.id, frame: "top" });
        expect(FLAT_SLOTS[fill]).toEqual({ brushId: brush.id, frame: "fill" });
      } else {
        // Brick and Bounce: one fixed look whatever is above them, so one slot
        // and a single-frame skin.
        expect(top, `${brush.id} is single-frame but renders two frames`).toBe(fill);
        expect(FLAT_SLOTS[top]).toEqual({ brushId: brush.id });
      }
    }
  });

  it("claims no frame that no block renders as", () => {
    const claimed = new Set(BLOCK_BRUSHES.flatMap((brush) => Object.values(framesOf(brush.tileIndex!))));
    for (const [index, slot] of FLAT_SLOTS.entries()) {
      if (slot) expect(claimed.has(index), `frame ${index} is claimed by ${slot.brushId} but unreachable`).toBe(true);
    }
    // The converse — desert's and snow's frames 2-5 are holes because Brick,
    // Bounce and Water all resolve to grass's copies (see the table's
    // docstring), so exactly the four ground frames are filled there.
    for (const skin of ["desert", "snow"] as const) {
      expect(GROUND_STRIP_FRAMES[skin].filter(Boolean)).toHaveLength(2);
    }
  });
});

describe("isSkinnableBlockId", () => {
  it("covers every Blocks brush and nothing else", () => {
    for (const brush of BLOCK_BRUSHES) {
      expect(isSkinnableBlockId(brush.id), `${brush.id} should be skinnable`).toBe(true);
    }
    expect(SKINNABLE_BLOCK_IDS.size).toBe(BLOCK_BRUSHES.length);
  });

  it("does not claim entity brushes, which are skinned the ordinary way", () => {
    for (const brush of PALETTE.filter((b) => b.entityType !== undefined)) {
      expect(isSkinnableBlockId(brush.id), `${brush.id} is an entity`).toBe(false);
    }
  });
});

describe("groundStripTextureKey", () => {
  it("is stable for the same sources", () => {
    const sources = ["abc~top", "abc~top", null, null, null, null];
    expect(groundStripTextureKey("grass", sources)).toBe(groundStripTextureKey("grass", [...sources]));
  });

  it("separates strips that differ only in which frame supplied a slot", () => {
    // The case that matters: a skin with only `top` painted fills slot 1 from
    // `top`, and painting `fill` later changes the pixels without changing the
    // skin id. Keying on the *supplying frame* keeps those apart, so the second
    // composition can't be served the first one's cached texture.
    const fallback = groundStripTextureKey("grass", ["abc~top", "abc~top", null, null, null, null]);
    const painted = groundStripTextureKey("grass", ["abc~top", "abc~fill", null, null, null, null]);
    expect(painted).not.toBe(fallback);
  });

  it("separates skins, and unskinned slots from skinned ones", () => {
    const none = [null, null, null, null, null, null];
    expect(groundStripTextureKey("grass", none)).not.toBe(groundStripTextureKey("castle", none));
    expect(groundStripTextureKey("grass", none)).not.toBe(
      groundStripTextureKey("grass", ["abc~top", null, null, null, null, null]),
    );
  });
});
