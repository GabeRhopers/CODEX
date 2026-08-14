export type StaticBackgroundId = "meadow" | "sunny-valley";

interface StaticBackgroundDef {
  id: StaticBackgroundId;
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
];

export const DEFAULT_STATIC_BACKGROUND: StaticBackgroundId = "meadow";

/** Falls back to the default not just when `background` is unset but also
 * when it names an id no longer in the pool, so a level saved against a
 * since-removed scene still renders something instead of throwing. */
export function resolveStaticBackground(level: { background?: StaticBackgroundId }): StaticBackgroundId {
  if (level.background && STATIC_BACKGROUNDS.some((bg) => bg.id === level.background)) {
    return level.background;
  }
  return DEFAULT_STATIC_BACKGROUND;
}

export function staticBackgroundDef(id: StaticBackgroundId): StaticBackgroundDef {
  const def = STATIC_BACKGROUNDS.find((bg) => bg.id === id);
  if (!def) throw new Error(`Unknown static background: ${id}`);
  return def;
}

export function nextStaticBackgroundId(id: StaticBackgroundId): StaticBackgroundId {
  const index = STATIC_BACKGROUNDS.findIndex((bg) => bg.id === id);
  return STATIC_BACKGROUNDS[(index + 1) % STATIC_BACKGROUNDS.length].id;
}
