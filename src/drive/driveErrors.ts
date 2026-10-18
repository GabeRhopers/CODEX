/**
 * Telling "Drive refused you" apart from "the disk is full".
 *
 * Both save paths used to print one sentence whatever went wrong — "Save
 * failed — your browser may be out of storage space" — and that sentence is
 * wrong for the single most likely cause. See `config/googleDrive.ts`: this app
 * asks for the full `drive` scope (so it can see the folder that already
 * existed before it did), that scope is "sensitive", and the consent screen is
 * deliberately left in Testing status to skip Google's verification review. A
 * Testing-status grant expires after roughly seven days. Nothing in this
 * codebase can change that cadence, so the least it can do is say what
 * happened and what to do about it, rather than sending somebody off to clear
 * browser storage that was never the problem.
 *
 * Phaser-free on purpose, like `spriteFrames.ts` and `characterState.ts`: the
 * decision about which sentence to show is then settled in a unit test instead
 * of by loading a page and reading a corner of it. A rule parked in a scene
 * cannot be tested at all.
 */

/**
 * A Drive failure that is about *permission*, not storage.
 *
 * Thrown from two places, which are the two ways the grant can be gone:
 * `googleAuth.requestToken` when a silent renewal is refused (the weekly case —
 * the token expired and Google will not issue another without the consent
 * screen), and `driveClient.driveFetch` on a 401 (a token that was revoked
 * server-side while the page held it).
 */
export class DriveAuthError extends Error {
  constructor(message = "Google Drive needs reconnecting") {
    super(message);
    this.name = "DriveAuthError";
  }
}

/**
 * Whether an unknown caught value is one of ours.
 *
 * Checks the `name` rather than using `instanceof`. The two are the same today,
 * but a bundler that ends up with two copies of this module — or an error that
 * crossed a structured-clone boundary — breaks `instanceof` while leaving the
 * name intact, and the failure mode would be the wrong sentence again, which is
 * the exact thing this file exists to stop.
 */
export function isDriveAuthError(error: unknown): boolean {
  return error instanceof DriveAuthError || (error as { name?: string } | null)?.name === "DriveAuthError";
}

/** What a child is told their work could not be saved. Kept here, whole, so the
 * editor and the World Maker cannot drift into saying different things about
 * the same failure. */
export const RECONNECT_MESSAGE = "Google Drive needs reconnecting — reload the page and connect again. Your work is kept here meanwhile.";
export const STORAGE_MESSAGE = "Save failed — your browser may be out of storage space";

/**
 * The sentence for a failed save.
 *
 * Anything that is not recognisably an auth failure gets the storage line,
 * which is the status quo: this narrows a wrong message to the one case it can
 * identify rather than inventing a third, vaguer one for everything else.
 *
 * The promise the reconnect line makes — "your work is kept here meanwhile" —
 * is only true because both scenes write a draft in the same catch block that
 * shows this (see `draftStore.ts`). If that ever stops being true, this
 * sentence is a lie and has to change with it.
 */
export function saveFailureMessage(error: unknown): string {
  return isDriveAuthError(error) ? RECONNECT_MESSAGE : STORAGE_MESSAGE;
}
