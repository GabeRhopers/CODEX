/**
 * Google Drive is this project's persistence backend (see
 * "Google Drive storage & profiles" under Art in README.md for the full
 * story of why localStorage alone wasn't enough — background/music
 * uploads routinely blew past its ~5-10MB per-origin quota).
 *
 * GOOGLE_CLIENT_ID is a public identifier, not a secret — Google's own
 * docs are explicit about this for browser-only ("public") OAuth clients:
 * the security boundary is the Authorized JavaScript origins list
 * configured against this ID in Google Cloud Console (only
 * https://gaberhopers.github.io, so no other site can use it to request
 * access on a visitor's behalf), not secrecy of the ID string itself.
 * Safe to commit to this public repo.
 */
export const GOOGLE_CLIENT_ID = "91862983568-1ugtv2n1e6n03bf0lbsnpma4epcdj972.apps.googleusercontent.com";

/** The Drive folder the project owner shared as the storage location
 * (https://drive.google.com/drive/folders/1na4ngjW-kvCRJIb7G8O_Qqc-a9L-hsVE)
 * — a dedicated subfolder is created inside it on first connect (see
 * driveClient.ts's ensureAppFolder) so this app's many small level/world
 * JSON files stay organized and don't clutter anything else kept there. */
export const DRIVE_ROOT_FOLDER_ID = "1na4ngjW-kvCRJIb7G8O_Qqc-a9L-hsVE";

export const APP_FOLDER_NAME = "Rhopers Game Maker";

/** Every earlier name this app's Drive folder has shipped under, checked
 * (in order) by `driveClient.ts`'s `resolveAppFolder` if a folder named
 * `APP_FOLDER_NAME` isn't found — a found match gets renamed in place
 * (same folder id, so every level/world file already saved inside it
 * stays exactly where it is) rather than the app silently creating a
 * second, empty folder under the new name and stranding everything
 * already saved under an old one. Never remove an entry once shipped —
 * someone could still be on a build old enough to only ever have created
 * the very first name. */
export const LEGACY_APP_FOLDER_NAMES = ["Spellbound Level Editor"];

/** Full Drive access, not the narrower drive.file scope — deliberately:
 * drive.file only grants visibility into files/folders the app itself
 * created (or that were individually opened via a Picker dialog), which
 * would make DRIVE_ROOT_FOLDER_ID (a folder that already existed before
 * this app touched it) invisible to it. Full `drive` access is a
 * "sensitive" scope that normally needs Google's app-verification review
 * for production use, but the OAuth consent screen here is deliberately
 * left in "Testing" status with a specific test user, which is exactly
 * the sanctioned way to skip that review for small, personal-use apps
 * (Google allows up to 100 test users). The tradeoff: a Testing-status
 * app's granted session needs re-authorizing roughly every 7 days — see
 * ProfileGateScene. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
