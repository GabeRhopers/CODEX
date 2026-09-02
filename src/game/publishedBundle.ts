import { BUNDLE_FORMAT, GameBundle, publishedGamePath } from "./gameBundle";

/**
 * Finding the bundle a published game was shipped with.
 *
 * There are two ways a page can be a game, and one way it can be the editor:
 *
 * - **`?game=<slug>`** — the shared site hosting many games. The slug names a
 *   file the deployment carries (`games/<slug>.json`, put there by uploading an
 *   exported bundle), so one deployed site publishes any number of games and
 *   each has its own link. This is what publishing actually uses.
 * - **`game.json` beside index.html** — a whole site that is one game, for a
 *   deployment that carries nothing else. This came first and still works.
 * - **Neither** — the editor.
 *
 * The query parameter rather than a per-game deployment because a deployment is
 * something only CI can make, while a file in a folder is something a person can
 * upload from a phone. Publishing had to be an action the author can take, not
 * one they have to ask a programmer for.
 */

const ROOT_BUNDLE_FILE = "game.json";
const SLUG_PARAM = "game";

/**
 * Slugs are matched, never merely trimmed.
 *
 * The slug is interpolated into a fetched path, so `?game=../../something` is a
 * request to fetch somewhere else entirely — `new URL` would happily resolve
 * those dots. Lowercase, digits and inner dashes only: no dots and no slashes
 * means no path to traverse, and it is exactly the alphabet `gameSlug` emits, so
 * nothing the editor can produce is refused here.
 */
const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

/** The game this URL is asking for, or null when it asks for none — including
 * when it asks for one by a name that could not be a slug. */
export function requestedGameSlug(search: string): string | null {
  const raw = new URLSearchParams(search).get(SLUG_PARAM);
  if (raw === null) return null;
  return SLUG_PATTERN.test(raw) ? raw : null;
}

/**
 * The link a published game is opened with — the other half of the convention
 * `requestedGameSlug` reads, kept in the same module so the two cannot drift.
 *
 * Built from wherever the editor actually is rather than from a hardcoded
 * address, so it is right on the dev server, right on a Pages project subpath,
 * and right if the site ever moves. The query string and hash are dropped: an
 * author who reached the editor through some URL of their own must not have it
 * baked into what they hand out.
 */
export function publishedGameLink(href: string, slug: string): string {
  const url = new URL(href);
  url.search = `?${SLUG_PARAM}=${slug}`;
  url.hash = "";
  return url.toString();
}

/**
 * Whether this really is a bundle.
 *
 * Checked rather than trusted, for the same reason `Profile.ts` and
 * `resolveLayout` sanitise what they read: a dev server answers unknown paths
 * with index.html, so a missing file arrives as *something* — and turning that
 * into a game with no levels would be a much stranger failure than simply
 * booting the editor.
 */
function isBundle(value: unknown): value is GameBundle {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<GameBundle>;
  return (
    typeof candidate.format === "number" &&
    candidate.format <= BUNDLE_FORMAT &&
    !!candidate.game &&
    Array.isArray(candidate.worlds) &&
    Array.isArray(candidate.levels)
  );
}

/**
 * What this page turned out to be.
 *
 * Three outcomes because there genuinely are three, and the third is the one
 * worth naming: a visitor who follows a link to a game that is not there must
 * be told so, not dropped into the editor's sign-in screen — which is what a
 * plain `bundle | null` would have made the natural thing to do.
 */
export type PageContent =
  | { kind: "editor" }
  | { kind: "game"; bundle: GameBundle }
  | { kind: "missing"; slug: string };

/** Never throws: every way of not finding a file means the same thing, and the
 * difference that matters — whether one was *asked for* — is known before the
 * fetch. */
async function fetchBundle(path: string): Promise<GameBundle | null> {
  try {
    // Relative to the document, so this works from a project subpath — which is
    // exactly where GitHub Pages puts it.
    const response = await fetch(new URL(path, document.baseURI).toString(), { cache: "no-store" });
    if (!response.ok) return null;
    const parsed: unknown = await response.json();
    return isBundle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function fetchPublishedBundle(search = location.search): Promise<PageContent> {
  const slug = requestedGameSlug(search);
  if (slug) {
    const bundle = await fetchBundle(publishedGamePath(slug));
    return bundle ? { kind: "game", bundle } : { kind: "missing", slug };
  }
  const bundle = await fetchBundle(ROOT_BUNDLE_FILE);
  return bundle ? { kind: "game", bundle } : { kind: "editor" };
}
