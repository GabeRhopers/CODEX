/** The 4 shipped, preloaded backgrounds. "custom" (see StaticBackgroundId
 * below) is deliberately not one of these — it has no shipped asset and no
 * fixed textureKey; its image lives per-level (LevelData.customBackgroundData)
 * and gets registered as a texture at runtime — see gameplay/backgroundLoader.ts. */
export type BuiltinStaticBackgroundId = "meadow" | "sunny-valley" | "frozen-volcano" | "pirate-cove";

/** "custom" = the level has its own uploaded background image rather than
 * picking one of the built-ins — see EditorUI's "Upload BG" button and
 * LevelData.customBackgroundData. */
export type StaticBackgroundId = BuiltinStaticBackgroundId | "custom";

interface StaticBackgroundDef {
  id: BuiltinStaticBackgroundId;
  label: string;
  textureKey: string;
}

/**
 * The pool for `StaticBackground.ts` — plain, non-parallax, cover-fit
 * images (see "Static background (current)" under Art for why there's no
 * pan/zoom). Each is a single full-content PNG; unlike the dormant
 * parallax pool's assets, none of these are pre-cropped to any particular
 * canvas, since a cover-fit needs no pan slack.
 */
export const STATIC_BACKGROUNDS: StaticBackgroundDef[] = [
  { id: "meadow", label: "Meadow", textureKey: "bg-static-meadow" },
  { id: "sunny-valley", label: "Sunny Valley", textureKey: "bg-static-sunny-valley" },
  { id: "frozen-volcano", label: "Frozen Volcano", textureKey: "bg-static-frozen-volcano" },
  { id: "pirate-cove", label: "Pirate Cove", textureKey: "bg-static-pirate-cove" },
];

export const DEFAULT_STATIC_BACKGROUND: BuiltinStaticBackgroundId = "meadow";

/** Falls back to the default not just when `background` is unset but also
 * when it names a built-in id no longer in the pool, so a level saved
 * against a since-removed scene still renders something instead of
 * throwing. "custom" always passes through as-is — whether the level
 * actually still has usable image data for it is a separate question,
 * answered by backgroundLoader.ts (which, unlike this function, needs the
 * rest of the level and a Phaser scene to answer it). */
export function resolveStaticBackground(level: { background?: StaticBackgroundId }): StaticBackgroundId {
  if (level.background === "custom") return "custom";
  if (level.background && STATIC_BACKGROUNDS.some((bg) => bg.id === level.background)) {
    return level.background;
  }
  return DEFAULT_STATIC_BACKGROUND;
}

export function staticBackgroundDef(id: BuiltinStaticBackgroundId): StaticBackgroundDef {
  const def = STATIC_BACKGROUNDS.find((bg) => bg.id === id);
  if (!def) throw new Error(`Unknown static background: ${id}`);
  return def;
}

/** The label EditorUI's background button shows, for any id including
 * "custom" (which has no entry in STATIC_BACKGROUNDS to look a label up
 * from). */
export function backgroundDisplayLabel(id: StaticBackgroundId): string {
  return id === "custom" ? "Custom" : staticBackgroundDef(id).label;
}

/** Cycles through the built-in pool only — "custom" is a one-way action
 * via Upload, not part of the cycle (see EditorUI's Upload BG button), so
 * cycling away from it always lands back on the first built-in rather than
 * needing a "what comes after custom" answer: `findIndex` returns -1 for
 * "custom" (it's not in STATIC_BACKGROUNDS), and (-1 + 1) % length is 0. */
export function nextStaticBackgroundId(id: StaticBackgroundId): BuiltinStaticBackgroundId {
  const index = STATIC_BACKGROUNDS.findIndex((bg) => bg.id === id);
  return STATIC_BACKGROUNDS[(index + 1) % STATIC_BACKGROUNDS.length].id;
}
