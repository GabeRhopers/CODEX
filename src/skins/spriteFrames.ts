import { isCustomEntityId } from "../entities/customEntity";
// Type-only, so this stays a compile-time relationship and adds no runtime edge
// from the skins layer to the gameplay one: the character's frame groups are
// keyed by CharacterSituation, which is what stops the two lists drifting.
import type { CharacterSituation } from "../gameplay/characterState";

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

/** The built-in hero's face, for anywhere that needs to *show* him rather than
 * animate him — a cut scene's cast list, the Skin Creator's grid tile, the
 * editor's hero picker. Here beside his id because three files were each
 * spelling "wizard-idle" for the same reason. */
export const HERO_TEXTURE_KEY = "wizard-idle";

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
 * What to *write on the button* for a frame.
 *
 * Display only — `LOOP_FRAMES` are the storage keys (`SkinAsset.frames`,
 * `frameCells`), so they cannot be renamed without orphaning the art in every
 * skin already saved. The names are the position in the cycle, zero-indexed
 * like the array they came from, which is a programmer's way of counting: the
 * Skin Creator showed an enemy's four frames as `0 1 2 3`, and on a screen aimed
 * at a child that says nothing about what the buttons are for.
 *
 * A character's are `idle`/`walk1`/`jump` and a tile's are `top`/`fill` — both
 * already say what they are, so both pass through untouched. Only the loop has
 * this problem, and only the loop is changed.
 */
export function frameLabel(plan: FramePlan, name: string): string {
  if (plan.kind !== "loop") return name;
  const index = plan.frames.indexOf(name);
  return index < 0 ? name : `Frame ${index + 1}`;
}

/**
 * The frame plan for a skin target, or null when it's an ordinary
 * single-frame skin — which is most of them, and is the unchanged path every
 * skin saved before this feature took.
 *
 * **Invented things animate too, and get the same four frames a built-in enemy
 * does.** Until 2026-09-20 a `custom:` id fell past every branch here and came
 * back null, so a creature you invented, named and painted yourself stood
 * frozen while the four shipped enemies walked — the last place an invented
 * thing was visibly a lesser copy of a built-in one.
 *
 * **A prefix test for those, against explicit lists for the rest, deliberately.**
 * Those lists exist so a brush merely *named* like an enemy cannot silently
 * acquire a second frame — a future "enemy-statue" prop has to stay still. That
 * reasoning does not transfer: `custom:` is a namespace nobody stumbles into,
 * every id in it was minted by `makeCustomEntityId` for something a person
 * deliberately invented, and `isCustomEntityId` is already this codebase's one
 * answer to "is this an invented thing".
 *
 * **Every invented thing, not only the enemies family.** This function is given
 * an id and nothing else; filtering by category would mean threading the
 * definition list through skinLoader, PlayScene and the editor — three modules
 * that need only a string — to buy a restriction worth little, since an
 * invented item that shimmers is a feature. Nothing already saved starts
 * moving either: a one-frame skin reports a `loopLength` of 1, and
 * `advanceLoop` holds frame 0 for any count below two.
 */
export function framePlanFor(targetId: string): FramePlan | null {
  if (targetId === CHARACTER_SKIN_ID) {
    return { kind: "character", gridSize: CHARACTER_GRID_SIZE, frames: CHARACTER_FRAMES };
  }
  if (LOOP_BRUSH_IDS.has(targetId) || isCustomEntityId(targetId)) {
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

/* ------------------------------------------------------------------------- *
 * Frame groups — a sequence per state, rather than one still per pose.
 *
 * Everything below is additive and, as of this commit, unread: the five
 * existing consumers of `plan.frames` (skinLoader and SkinEditorScene) are
 * untouched, so no behaviour can have changed by its arrival. That is
 * deliberate — the alias map below *is* the compatibility guarantee for every
 * character skin already painted, and it is worth landing alone, where it can
 * be reviewed and unit-tested without a scene in the way. See
 * docs/sprite-sequences-plan.md for the phases that consume it.
 * ------------------------------------------------------------------------- */

/**
 * The ceiling on frames in one state. Four, matching LOOP_FRAMES, and chosen on
 * storage rather than on screen space.
 *
 * Measured 2026-10-06: the one painted frame stored in
 * public/games/grampa-and-the-lost-sheep.json (an enemy, so a 32x32 grid) is a
 * 1,994-byte data URL. A character's grid is 48x48, which is 2.25x the area, so
 * a filled character frame should land in the low single-digit KB and seven
 * states of four frames in the tens of KB — against a skins.json that is read
 * whole on every resolve. The Skin Creator column could hold about six rows —
 * its five-row strip reaches y=318 against a footer at y=421, per the comment
 * in SkinEditorScene's buildCanvas — so four is the storage answer here, not
 * the layout one.
 */
export const MAX_FRAMES_PER_STATE = 4;

/**
 * One state's frames, in the order they play.
 *
 * `state` is a plain string rather than CharacterSituation because a loop plan
 * has no situation to name (see UNNAMED_GROUP_STATE) — the character groups are
 * pinned to the union at their definition instead, which is where the drift
 * would happen.
 *
 * `frames` holds *storage keys*, not display names, and is not derived from
 * `state` by the reader: an enemy's four frames are still "0".."3" exactly as
 * they were saved, which is the whole reason this model can cover both.
 */
export interface FrameGroup {
  state: string;
  frames: readonly string[];
  loop: boolean;
}

/**
 * The state name of a group that answers for whatever the thing is doing. An
 * enemy cycles on a timer regardless of its situation, so its single group has
 * no state to name — empty rather than "loop" so nothing reads it as a
 * CharacterSituation that might one day exist.
 */
export const UNNAMED_GROUP_STATE = "";

/**
 * Which states cycle, and the order the editor will offer them in.
 *
 * Keyed by CharacterSituation so a situation cannot be added to the game
 * without a decision about whether it loops — the compile error is the point.
 * Order is the literal's own key order (insertion order, for non-numeric keys,
 * by spec), leading with the states a child paints first, the same instinct
 * behind CHARACTER_FRAMES' `idle, walk1, walk2, jump, cast`.
 *
 * Looping vs playing-once is the one genuinely new mechanic here, and the
 * reason it is stored rather than inferred: breathing, striding and swimming
 * repeat, but a jump is one arc (holding the last frame *is* the fall), and a
 * collapse that cycles back to standing reads as a twitch rather than as
 * dying.
 */
const CHARACTER_STATE_LOOPS: Record<CharacterSituation, boolean> = {
  idle: true,
  walk: true,
  jump: false,
  swim: true,
  cast: false,
  win: false,
  lose: false,
};

/** The state every other state falls back to, and the one `imageData` mirrors
 * — the group form of baseFrameOf's "idle". */
const CHARACTER_BASE_STATE: CharacterSituation = "idle";

/** `"walk.1"` — the state carries the meaning, the index is genuinely
 * positional inside it. This does not breach SkinAsset.frames' "addressed by
 * meaning, not by position" rule for the same reason LOOP_FRAMES does not:
 * frame 2 of a stride has no name of its own to be addressed by. */
function frameKeyFor(state: string, index: number): string {
  return `${state}.${index}`;
}

const CHARACTER_GROUPS: readonly FrameGroup[] = Object.entries(CHARACTER_STATE_LOOPS).map(([state, loop]) => ({
  state,
  frames: Array.from({ length: MAX_FRAMES_PER_STATE }, (_, index) => frameKeyFor(state, index)),
  loop,
}));

/** An enemy's existing cycle, unchanged, expressed as one group — which is what
 * lets a later phase give enemies named groups with no second mechanism. */
const LOOP_GROUPS: readonly FrameGroup[] = [
  { state: UNNAMED_GROUP_STATE, frames: LOOP_FRAMES, loop: true },
];

/**
 * The frame groups a plan can play, or none.
 *
 * **A tile plan has no groups, deliberately.** `top`/`fill` are autotile
 * *variants*, not playback: `fill` is not frame 1 of `top`, it is what a buried
 * cell renders as, and groundAutotile.ts is the single source of truth for
 * which one a cell gets. Returning a two-frame group here would be a tidy lie
 * that any caller iterating groups would then animate.
 */
export function frameGroupsFor(plan: FramePlan): readonly FrameGroup[] {
  if (plan.kind === "character") return CHARACTER_GROUPS;
  if (plan.kind === "loop") return LOOP_GROUPS;
  return [];
}

/**
 * Where a character's art lived before states had groups, by new key.
 *
 * This map is the compatibility guarantee: every character skin painted before
 * this commit stores `idle`/`walk1`/`walk2`/`jump`/`cast`, and reading it is
 * the only thing standing between those five frames and a child's work
 * vanishing from the editor. Consulted at read time and migrated away on the
 * next save of each skin, which is exactly the shape pixelData.cells already
 * uses for the same problem.
 *
 * Only these five, because only these five ever existed — a state with no entry
 * (swim, win, lose, and every index past the ones listed) simply has no legacy
 * art to find.
 */
const LEGACY_FRAME_KEYS: Readonly<Record<string, string>> = {
  "idle.0": "idle",
  "walk.0": "walk1",
  "walk.1": "walk2",
  "jump.0": "jump",
  "cast.0": "cast",
};

/** The single answer to "has this frame been painted", new key or old. Every
 * public function here goes through it, so there is one place the legacy map is
 * consulted rather than three that can disagree. */
function paintedFrame(painted: Readonly<Record<string, string>>, key: string): string | undefined {
  const own = painted[key];
  if (own) return own;
  const legacy = LEGACY_FRAME_KEYS[key];
  return legacy ? painted[legacy] : undefined;
}

/**
 * The key everything in a plan falls back to.
 *
 * For a character this is `"idle.0"` rather than baseFrameOf's `"idle"`, and
 * the difference matters in one direction: paintedFrame("idle.0") finds the
 * legacy `"idle"` through the alias map, while the reverse is not true, so a
 * skin painted the *new* way would have no fallback at all if this returned
 * the old key. baseFrameOf itself keeps answering "idle" until the phase that
 * migrates its five callers (see the plan doc).
 */
function baseGroupKey(plan: FramePlan): string {
  if (plan.kind === "character") return frameKeyFor(CHARACTER_BASE_STATE, 0);
  return baseFrameOf(plan);
}

/**
 * How many frames of a group are painted, counting from the start and stopping
 * at the first gap — same rule as loopLength, so a walk with frames 0, 1 and 3
 * painted strides through 0 and 1 rather than stuttering over the hole.
 *
 * It overlaps loopLength by construction: a loop plan is a single group, so
 * that function is this one's single-group case. Left unmerged here on purpose
 * — the value of this phase is that it cannot change behaviour, and loopLength
 * has four live callers. The phase that moves the editor onto groups is where
 * the two become one.
 */
export function groupLength(group: FrameGroup, painted: Readonly<Record<string, string>>): number {
  let count = 0;
  for (const key of group.frames) {
    if (!paintedFrame(painted, key)) break;
    count += 1;
  }
  return count;
}

/**
 * Which image actually renders for frame `index` of `group`.
 *
 * Falls back to the plan's base frame and never to the built-in art, for the
 * reason resolveFrame already records: a half-finished 16-colour character that
 * turned into hand-drawn Grampa mid-jump would read as a bug rather than as
 * unfinished work. Null means nothing at all has been painted, which callers
 * treat as "keep the built-in art".
 */
export function resolveGroupFrame(
  plan: FramePlan,
  group: FrameGroup,
  painted: Readonly<Record<string, string>>,
  index: number,
): string | null {
  const key = group.frames[index];
  const own = key === undefined ? undefined : paintedFrame(painted, key);
  return own ?? paintedFrame(painted, baseGroupKey(plan)) ?? null;
}
