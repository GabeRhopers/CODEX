import { createFile, ensureAppFolder, findFileByName, getFileContent, listFiles, updateFileContent } from "../drive/driveClient";
import { getAccessToken } from "../drive/googleAuth";
import { loadActiveProfile } from "../profile/Profile";
import { GameData } from "./GameSchema";
import { activeBundle } from "./contentSource";

/**
 * The one game each profile is building.
 *
 * Same file-per-record, `appProperties`-tagged, profile-scoped pattern as
 * `GoogleDriveWorldStorageAdapter` — a `game-<id>.json` beside the `world-` and
 * `level-` files in the app folder, so all three coexist and the mocked Drive
 * the e2e suite runs against needs no changes at all.
 *
 * **Profile-scoped, unlike skins and invented things.** Those are shared because
 * a skin is part of the shop everyone builds from; a game is the thing *one
 * person is making*, so Mike's and Gabriel's must not be the same document.
 *
 * One game per profile today. Nothing here assumes that beyond `loadGame`
 * taking the first match, so allowing several later is a browser screen and a
 * list — not a change to how any of this is stored.
 */

function fileName(id: string): string {
  return `game-${id}.json`;
}

function requireProfile(): string {
  const profile = loadActiveProfile();
  if (!profile) throw new Error("No active profile — this shouldn't be reachable past ProfileGateScene");
  return profile;
}

/**
 * This profile's game, or `null` when they have not started one.
 *
 * Null rather than a blank game, so the maker decides what a fresh one looks
 * like (`createEmptyGame`) and this module stays about storage only.
 */
export async function loadGame(): Promise<GameData | null> {
  // A published game carries its own document; there is no Drive to ask.
  const bundle = activeBundle();
  if (bundle) return bundle.game;

  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const profile = requireProfile();
  const files = await listFiles(token, folderId);
  const mine = files.filter((f) => f.appProperties?.kind === "game" && f.appProperties?.profile === profile);
  if (mine.length === 0) return null;
  const content = await getFileContent(token, mine[0].id);
  try {
    return JSON.parse(content) as GameData;
  } catch {
    // A corrupted document reads as "no game yet" rather than taking the screen
    // down — the same stance customEntityStorage takes on an unparseable file.
    console.error("game document could not be parsed; treating as absent");
    return null;
  }
}

export async function saveGame(game: GameData): Promise<void> {
  const token = await getAccessToken();
  const folderId = await ensureAppFolder(token);
  const profile = requireProfile();
  const content = JSON.stringify(game);
  const appProperties = {
    kind: "game",
    profile,
    gameId: game.id,
    title: game.title,
    worldCount: String(game.worldIds.length),
    updatedAt: game.updatedAt,
  };
  const existing = await findFileByName(token, folderId, fileName(game.id));
  if (existing) await updateFileContent(token, existing.id, content, appProperties);
  else await createFile(token, folderId, fileName(game.id), content, appProperties);
}
