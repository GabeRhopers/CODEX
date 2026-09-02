import { BackgroundAsset } from "../backgrounds/BackgroundLibrary";
import { CustomEntityDef, CustomEntityId, isCustomEntityId } from "../entities/customEntity";
import { LevelArea, LevelData } from "../level/LevelSchema";
import { MusicAsset } from "../music/MusicLibrary";
import { CustomSkinsFile } from "../skins/CustomSkins";
import { WorldData } from "../world/WorldSchema";
import { GameData } from "./GameSchema";

/**
 * A whole game in one file, with nothing left behind in Drive.
 *
 * Everything this app makes normally lives in the author's Google Drive and is
 * read at runtime through the author's own OAuth token. A relative opening a
 * link has no token, so a published game cannot fetch any of it — which makes
 * shipping a *content* problem before it is a deployment one. This is the shape
 * that solves it: a game plus every world, level and asset it reaches.
 *
 * Pure — no Phaser, no Drive, no DOM — so the collection rules can be tested on
 * their own. The reads live next door in `collectBundle.ts`.
 */

/** Bumped only if the shape changes in a way an older reader would mishandle.
 * Present from the first version so a future reader never has to guess whether
 * an unversioned file predates versioning. */
export const BUNDLE_FORMAT = 1;

export interface GameBundle {
  format: number;
  exportedAt: string;
  game: GameData;
  worlds: WorldData[];
  levels: LevelData[];
  /**
   * The **whole** skins library, not merely the skins these levels name.
   *
   * A level's own `skins` map is not enough to know what it renders:
   * `resolveSkinTextureKeys` iterates the entire library and, per brush, takes
   * the level's choice *or the library default* (`skinSelection.resolveSkinId`)
   * — so a level with an empty map still shows custom art. Reproducing that rule
   * here would mean two copies of it that have to agree forever, and the risk is
   * lopsided: a missed skin is broken art, an extra one is under a kilobyte.
   */
  skins: CustomSkinsFile;
  /** The whole list, for the same reason — `entityRegistry` merges all of them,
   * and a definition is a few hundred bytes of JSON. */
  customEntities: CustomEntityDef[];
  /** Only the ones some area actually names. These are the heavy ones — a track
   * is capped at 4MB by musicUpload.ts — so carrying unused uploads is the
   * difference between a few MB on a link and tens of them. */
  backgrounds: BackgroundAsset[];
  music: MusicAsset[];
}

/** Main, Sub and Up. Every asset reference lives on an *area*, not on the level
 * as a whole, so anything walking references has to look at all three. */
export function areasOf(level: LevelData): LevelArea[] {
  return [level, level.subArea, level.upArea].filter((area): area is LevelArea => !!area);
}

function referencedIds(levels: readonly LevelData[], pick: (area: LevelArea) => string | undefined): string[] {
  const out = new Set<string>();
  for (const level of levels) {
    for (const area of areasOf(level)) {
      const id = pick(area);
      if (id) out.add(id);
    }
  }
  return [...out];
}

/**
 * Which uploaded backgrounds these levels use.
 *
 * The legacy embedded `customBackgroundData` is deliberately ignored: it is a
 * data URL living *on the level itself*, so it travels inside `levels` already
 * and there is nothing in the library to collect for it.
 */
export function referencedBackgroundIds(levels: readonly LevelData[]): string[] {
  return referencedIds(levels, (area) => area.customBackgroundId);
}

/** Which uploaded tracks these levels play. Legacy embedded `customMusicData`
 * is ignored for the same reason as backgrounds above. */
export function referencedMusicIds(levels: readonly LevelData[]): string[] {
  return referencedIds(levels, (area) => area.customMusicId);
}

/** Every invented type placed in these levels, whether or not a definition for
 * it still exists — which is exactly what makes a dangling one findable. */
export function referencedCustomEntityIds(levels: readonly LevelData[]): CustomEntityId[] {
  const out = new Set<CustomEntityId>();
  for (const level of levels) {
    for (const area of areasOf(level)) {
      for (const entity of area.entities) if (isCustomEntityId(entity.type)) out.add(entity.type);
    }
  }
  return [...out];
}

/**
 * Everything referenced by this bundle that the bundle has not got, as
 * sentences a person can act on.
 *
 * Reported rather than thrown, and — see GameMakerScene — reported without
 * blocking the download. The severities genuinely differ: a missing background
 * falls back and a missing track plays silence, but a missing *level* ends a
 * world early. Refusing to write the file would leave someone unable to inspect
 * the very thing they need to see in order to fix it.
 */
export function bundleProblems(bundle: GameBundle): string[] {
  const problems: string[] = [];
  const worldIds = new Set(bundle.worlds.map((w) => w.id));
  const levelIds = new Set(bundle.levels.map((l) => l.id));
  const backgroundIds = new Set(bundle.backgrounds.map((b) => b.id));
  const musicIds = new Set(bundle.music.map((m) => m.id));
  const entityIds = new Set(bundle.customEntities.map((d) => d.id));

  for (const id of bundle.game.worldIds) {
    if (!worldIds.has(id)) problems.push(`A world in this game is missing (${id}).`);
  }
  for (const world of bundle.worlds) {
    for (const id of world.levelIds) {
      if (!levelIds.has(id)) problems.push(`"${world.name}" uses a level that is missing (${id}).`);
    }
  }
  for (const id of referencedBackgroundIds(bundle.levels)) {
    if (!backgroundIds.has(id)) problems.push(`An uploaded background is missing (${id}); those areas fall back.`);
  }
  for (const id of referencedMusicIds(bundle.levels)) {
    if (!musicIds.has(id)) problems.push(`An uploaded track is missing (${id}); those areas play silently.`);
  }
  for (const id of referencedCustomEntityIds(bundle.levels)) {
    if (!entityIds.has(id)) problems.push(`An invented thing is missing (${id}); it will not be drawn.`);
  }
  return problems;
}

/** Bytes the file will take, measured on the real serialisation rather than
 * estimated — base64 asset payloads dominate it and are easy to under-guess. */
export function bundleSizeBytes(bundle: GameBundle): number {
  return new TextEncoder().encode(JSON.stringify(bundle)).length;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/** What the export says it made. The size is the point: a 4MB track is invisible
 * until someone tries to send the file, so it is shown before publishing rather
 * than discovered after. */
export function bundleSummary(bundle: GameBundle): string {
  const worlds = bundle.worlds.length;
  const levels = bundle.levels.length;
  const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(worlds, "world")}, ${plural(levels, "level")}, ${formatBytes(bundleSizeBytes(bundle))}`;
}

/**
 * The short name a game is published under.
 *
 * It is the file's name, and it is the `?game=` value in the finished link, and
 * those being *the same string* is the whole point: the file you download is the
 * file you upload, and nothing has to be renamed by hand between the two.
 *
 * Lowercase, digits and dashes only — which is also what `requestedGameSlug`
 * will accept back, so a title can never produce a slug the player refuses.
 */
export function gameSlug(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "game";
}

/**
 * What the downloaded file is called.
 *
 * Plainly `<slug>.json`, with no decorative middle: it used to be
 * `<slug>.rhopers-game.json`, which read nicely in a Downloads folder and was
 * wrong the moment publishing existed — the name has to *be* the slug, because
 * the link is derived from it (see `publishedGamePath`).
 */
export function bundleFileName(title: string): string {
  return `${gameSlug(title)}.json`;
}

/** Where a published game's file lives, relative to the site — the path this
 * bundle must be uploaded to, and the path the player fetches. */
export function publishedGamePath(slug: string): string {
  return `${PUBLISHED_GAMES_DIR}/${slug}.json`;
}

/** The one folder published games live in, named once so the instructions the
 * Game Maker prints and the path the player fetches cannot drift apart. */
export const PUBLISHED_GAMES_DIR = "games";
