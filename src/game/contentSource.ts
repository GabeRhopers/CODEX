import { GameBundle } from "./gameBundle";

/**
 * Where the app's content comes from: Drive, or a bundle.
 *
 * The editor reads everything out of the author's Google Drive through the
 * author's own OAuth token. A published game has neither — so a play-only boot
 * hands this module a bundle up front, and every storage read consults it first
 * and answers from memory instead.
 *
 * Deliberately one small module rather than a parameter threaded through forty
 * call sites: the choice is made once, at boot, and never changes during a run.
 * Each reader's early return is two lines, which keeps the Drive path exactly as
 * it was rather than rewriting it into an abstraction it never needed.
 */

let bundle: GameBundle | null = null;

/** Switches the app to reading from `next` for the rest of the page's life.
 * Called once, from the boot, before any scene starts. */
export function playFromBundle(next: GameBundle): void {
  bundle = next;
}

export function activeBundle(): GameBundle | null {
  return bundle;
}

/**
 * Whether this page is a published game rather than the editor.
 *
 * Distinct from "a bundle happens to be loaded" only in intent — they are the
 * same condition today, and naming it separately is what lets scenes ask the
 * question they actually mean ("should there be a way back to the editor?")
 * rather than inferring it from a data structure.
 */
export function isPlayOnly(): boolean {
  return bundle !== null;
}

/** Only for tests, which run many boots in one page. */
export function clearBundle(): void {
  bundle = null;
}
