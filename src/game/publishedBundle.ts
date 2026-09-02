import { BUNDLE_FORMAT, GameBundle } from "./gameBundle";

/**
 * Finding the bundle a published game was shipped with.
 *
 * A published site is this same app plus one `game.json` sitting beside its
 * index.html. If that file is there and reads as a bundle, this page is a game;
 * if it is not, this page is the editor. That single test is the whole
 * difference between the two, which is why publishing later needs to add a file
 * rather than build a different app.
 */

const BUNDLE_FILE = "game.json";

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

/** The published bundle, or null when this page is the editor. Never throws:
 * every way of not finding one means the same thing. */
export async function fetchPublishedBundle(): Promise<GameBundle | null> {
  try {
    // Relative to the document, so this works from a project subpath — which is
    // exactly where GitHub Pages puts it.
    const response = await fetch(new URL(BUNDLE_FILE, document.baseURI).toString(), { cache: "no-store" });
    if (!response.ok) return null;
    const parsed: unknown = await response.json();
    return isBundle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
