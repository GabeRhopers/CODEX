/**
 * Which frames a skinnable thing has, and which frame stands in when one
 * hasn't been painted. Pure data and rules — no Phaser, no DOM — so the
 * editor, the texture loader and the runtime all read the same answer from
 * one place instead of each re-deriving it, and so it can be unit-tested the
 * way characterState.ts and PlayerStats.ts already are.
 *
 * Most skinnable brushes are still single-frame and always will be: a coin, a
 * chest, a tree. Only two kinds of thing animate, and they animate for
 * different reasons — the player character switches frame because of what it
 * is *doing* (see characterState.ts), an enemy switches frame on a timer — so
 * they get two different plan kinds rather than one fuzzy "frames" list.
 */

/**
 * Storage key for the player character's skin. Deliberately *not* a Palette
 * brush id: the character isn't something you paint into a level, so it has no
 * brush, and the `spawn` brush that might look like the obvious home is the
 * placement arrow (textureKey `marker-spawn`) — skinning that reskins the
 * marker, not Grampa.
 *
 * Living in the same skins file under its own key is safe in both directions:
 * the editor's per-brush picker looks brushes up by id and simply never
 * matches this one, and this module never looks at Palette at all.
 */
export const CHARACTER_SKIN_ID = "player";

/**
 * The character's five poses, matching the `wizard-*` textures one-for-one
 * (see wizardAnimation.ts's WIZARD_FRAME_KEYS). Order is the order the editor
 * shows them in, chosen so the two walk frames sit adjacent — they're the pair
 * you flip between while drawing a stride.
 */
export const CHARACTER_FRAMES = ["idle", "walk1", "walk2", "jump", "cast"] as const;
export type CharacterFrameName = (typeof CHARACTER_FRAMES)[number];

/** Enemy loop frames, named by their position in the cycle. Four is a ceiling,
 * not a requirement — paint two and two is what loops. */
export const LOOP_FRAMES = ["0", "1", "2", "3"] as const;

/**
 * A block's two autotile frames: the surface, and the one used when another
 * cell of the same kind sits directly above it — see groundAutotile.ts, which
 * derives which of the two a cell renders as and is the single source of truth
 * for that. Ground and hazards both work this way; brick and bounce are one
 * fixed look and stay single-frame.
 *
 * `top` first because it is the base frame, so painting only that is a
 * complete skin whose buried tiles simply match its surface.
 */
export const TILE_FRAMES = ["top", "fill"] as const;

/** The block brushes whose look autotiles between two frames. An explicit list
 * rather than a name test, for the same reason LOOP_BRUSH_IDS is one: a brush
 * that merely happens to be named like ground should not silently acquire a
 * second frame. */
const TILE_BRUSH_IDS = new Set(["ground-grass", "ground-desert", "ground-castle", "ground-snow", "water", "lava"]);

/**
 * 48 for the character against 32 for everything else, because Grampa renders
 * 48px tall (FRAME_HEIGHT in wizardAnimation.ts). Painting a character on the
 * 32-grid would mean scaling it up 1.5x to stand beside the built-in art, so
 * it would read visibly chunkier than every other sprite on screen.
 *
 * It also keeps the physics honest: applyWizardTexture offsets the body by
 * `FRAME_HEIGHT - BODY_HEIGHT`, so a 48-tall painted frame drops into exactly
 * the same body geometry Grampa uses, and the 2026-08-19 gravity retune (whose
 * clearances were verified against a fixed 22x40 body, Desert Canyon's pillar
 * down to about a tile of margin) stays valid whatever anyone paints.
 */
export const CHARACTER_GRID_SIZE = 48;
export const ENTITY_GRID_SIZE = 32;

export type FramePlan =
  | { kind: "character"; gridSize: number; frames: readonly string[] }
  | { kind: "loop"; gridSize: number; frames: readonly string[] }
  | { kind: "tile"; gridSize: number; frames: readonly string[] };

/** The brushes whose skins animate on a timer. Kept as an explicit list rather
 * than an `id.startsWith("enemy-")` test so adding a brush that merely happens
 * to be named that way can't silently start animating. */
const LOOP_BRUSH_IDS = new Set(["enemy-ghost", "enemy-spike", "enemy-bat", "enemy-golem"]);

/**
 * The frame plan for a skin target, or null when it's an ordinary
 * single-frame skin — which is most of them, and is the unchanged path every
 * skin saved before this feature took.
 */
export function framePlanFor(targetId: string): FramePlan | null {
  if (targetId === CHARACTER_SKIN_ID) {
    return { kind: "character", gridSize: CHARACTER_GRID_SIZE, frames: CHARACTER_FRAMES };
  }
  if (LOOP_BRUSH_IDS.has(targetId)) {
    return { kind: "loop", gridSize: ENTITY_GRID_SIZE, frames: LOOP_FRAMES };
  }
  if (TILE_BRUSH_IDS.has(targetId)) {
    return { kind: "tile", gridSize: ENTITY_GRID_SIZE, frames: TILE_FRAMES };
  }
  return null;
}

/** The grid a target is painted on — the plan's size, or the ordinary 32 for
 * single-frame skins. */
export function gridSizeFor(targetId: string): number {
  return framePlanFor(targetId)?.gridSize ?? ENTITY_GRID_SIZE;
}

/** The frame every other frame falls back to: the character's resting pose,
 * or the first frame of a loop. Both are the frame a skin is guaranteed to
 * have, because it's the one the editor starts you on and the one `imageData`
 * mirrors. */
export function baseFrameOf(plan: FramePlan): string {
  if (plan.kind === "character") return "idle";
  if (plan.kind === "tile") return "top";
  return "0";
}

/**
 * Which frame actually renders for `name`, given what's been painted.
 *
 * The fallback is always to this skin's *own* base frame, never to the
 * built-in art: a half-finished 16-colour character that turned into
 * hand-drawn Grampa mid-jump would read as a bug, not as a work in progress.
 * So a skin with only an idle frame is a perfectly usable skin — it just
 * doesn't animate yet.
 *
 * Returns null only when nothing at all has been painted, which callers treat
 * as "this skin isn't usable, keep the built-in art".
 */
export function resolveFrame(
  plan: FramePlan,
  painted: Readonly<Record<string, string>>,
  name: string,
): string | null {
  return painted[name] ?? painted[baseFrameOf(plan)] ?? null;
}

/** How many frames of a loop are actually painted, counting from the start and
 * stopping at the first gap — a loop with frames 0, 1 and 3 painted cycles
 * through 0 and 1, rather than stuttering on a hole in the middle. */
export function loopLength(plan: FramePlan, painted: Readonly<Record<string, string>>): number {
  let count = 0;
  for (const name of plan.frames) {
    if (!painted[name]) break;
    count += 1;
  }
  return count;
}
