import { PALETTE } from "../editor/Palette";
import { CHARACTER_FRAMES } from "./spriteFrames";

/**
 * Everything the Skin Creator can show behind the canvas as a tracing guide,
 * or stamp in as a starting point. Pure list-building, so the picker, the
 * underlay and the trace-in action all read one description of what exists
 * rather than each assembling their own and drifting apart.
 *
 * The built-in art earns its place here more than anything else does. Grampa's
 * hand-drawn frames cannot be imported into a 16-colour canvas — ~950-1010
 * distinct colours each with about a third of their pixels at partial alpha —
 * which is a wall this codebase has now hit three separate times. Tracing goes
 * around it: you cannot convert his art, but you can draw over it and end up
 * with a pixel version that actually lines up with the original silhouette.
 */

export type ReferenceSourceKind = "builtin" | "skin";

export interface ReferenceSource {
  /** Stable picker id. Prefixed by kind so a built-in texture key and a saved
   * skin's id can never collide. */
  id: string;
  label: string;
  /** A live Phaser texture key for the picker's thumbnail. For a built-in
   * that's the art itself; for a saved skin it's the thumbnail registered by
   * resolveSkinThumbnails. */
  textureKey: string;
  kind: ReferenceSourceKind;
}

/** The picker's "turn it off" entry. Not a ReferenceSource — it has no art —
 * so it's a sentinel the caller special-cases once. */
export const NO_REFERENCE_ID = "none";

export function builtInReferenceId(textureKey: string): string {
  return `builtin:${textureKey}`;
}

export function skinReferenceId(brushId: string, assetId: string): string {
  return `skin:${brushId}:${assetId}`;
}

/** Splits an id back into its parts, or null if it isn't one of ours (a
 * hand-edited value, or NO_REFERENCE_ID). */
export function parseReferenceId(id: string): { kind: ReferenceSourceKind; parts: string[] } | null {
  if (id.startsWith("builtin:")) return { kind: "builtin", parts: [id.slice("builtin:".length)] };
  if (id.startsWith("skin:")) {
    const rest = id.slice("skin:".length);
    const split = rest.indexOf(":");
    // A brush id never contains a colon, so the first one separates the two
    // parts; splitting on every colon would break on any future asset id
    // that happens to contain one.
    if (split === -1) return null;
    return { kind: "skin", parts: [rest.slice(0, split), rest.slice(split + 1)] };
  }
  return null;
}

/** The brushes whose built-in art is worth offering to trace for *any*
 * target: the animated ones. A coin or a bush is a single small prop, and
 * tracing someone else's coin while drawing a chest helps nobody — whereas
 * drawing a new enemy over the silhouette of an existing one is a real
 * workflow, and so is drawing a character over Grampa. */
const TRACEABLE_BRUSH_IDS = ["enemy-ghost", "enemy-spike", "enemy-bat", "enemy-golem"];

/**
 * The built-in art worth tracing, character frames first.
 *
 * Grampa's five poses lead because tracing them is the main reason this
 * exists, and because they are the one set you cannot otherwise get at. The
 * four enemies follow, for drawing a replacement over the thing it replaces.
 *
 * `currentTargetId` adds that target's own art when it isn't already in the
 * list, so someone reskinning the Coin can still trace the coin — the rule is
 * "the animated cast, plus whatever you're working on" rather than every
 * sprite in the game. Listing all ~30 was tried and rejected from the
 * screenshot: the dropdown ran off the bottom of the canvas and the labels
 * collided into each other.
 */
export function builtInReferenceSources(currentTargetId?: string): ReferenceSource[] {
  const character: ReferenceSource[] = CHARACTER_FRAMES.map((frame) => ({
    id: builtInReferenceId(`wizard-${frame}`),
    label: `Grampa ${frame}`,
    textureKey: `wizard-${frame}`,
    kind: "builtin",
  }));

  const byId = new Map(PALETTE.filter((brush) => brush.entityType).map((brush) => [brush.id, brush]));
  const wanted = [...TRACEABLE_BRUSH_IDS];
  if (currentTargetId && !wanted.includes(currentTargetId)) wanted.push(currentTargetId);

  const brushes: ReferenceSource[] = wanted.flatMap((id) => {
    const brush = byId.get(id);
    if (!brush) return [];
    return [{ id: builtInReferenceId(brush.textureKey), label: brush.label, textureKey: brush.textureKey, kind: "builtin" as const }];
  });

  // Several brushes share one texture, and a duplicate tile would be pure
  // noise — keep the first, which is the character frames where they overlap.
  const seen = new Set<string>();
  return [...character, ...brushes].filter((source) => {
    if (seen.has(source.id)) return false;
    seen.add(source.id);
    return true;
  });
}
