import { loadBackgroundLibrary } from "../backgrounds/backgroundLibraryStorage";
import { loadCustomEntities } from "../entities/customEntityStorage";
import { LevelData } from "../level/LevelSchema";
import { loadMusicLibrary } from "../music/musicLibraryStorage";
import { getLevelStorage, getWorldStorage } from "../persistence/storage";
import { loadCustomSkins } from "../skins/skinStorage";
import { WorldData } from "../world/WorldSchema";
import { BUNDLE_FORMAT, GameBundle, referencedBackgroundIds, referencedMusicIds } from "./gameBundle";
import { GameData } from "./GameSchema";

/**
 * Reading a whole game out of Drive and into one bundle.
 *
 * Deliberately separate from `gameBundle.ts`: the rules there are pure and
 * tested on their own, and this is the thin layer of reads that feeds them. The
 * split is what keeps "which assets does a game need" from becoming something
 * only an end-to-end test can check.
 *
 * **Missing pieces are not errors here.** A world or level that has been deleted
 * since the game referenced it is simply absent from the result, and
 * `bundleProblems` then names it. Failing the whole export instead would leave
 * you with no file and no way to see what was wrong.
 */
export async function collectGameBundle(game: GameData): Promise<GameBundle> {
  const worldStorage = getWorldStorage();
  const levelStorage = getLevelStorage();

  // Worlds in the game's own order, so the bundle reads the way the game plays.
  const loadedWorlds = await Promise.all(game.worldIds.map((id) => worldStorage.load(id)));
  const worlds = loadedWorlds.filter((w): w is WorldData => !!w);

  // De-duplicated: two worlds may share a level, and a level's assets are heavy
  // enough that carrying it twice would show up in the file size.
  const levelIds = [...new Set(worlds.flatMap((w) => w.levelIds))];
  const loadedLevels = await Promise.all(levelIds.map((id) => levelStorage.load(id)));
  const levels = loadedLevels.filter((l): l is LevelData => !!l);

  const [skins, customEntities, backgroundLibrary, musicLibrary] = await Promise.all([
    loadCustomSkins(),
    loadCustomEntities(),
    loadBackgroundLibrary(),
    loadMusicLibrary(),
  ]);

  // The heavy libraries are filtered to what the levels actually name; the light
  // ones travel whole. See GameBundle's own docstring for why that asymmetry is
  // correctness rather than laziness.
  const wantedBackgrounds = new Set(referencedBackgroundIds(levels));
  const wantedMusic = new Set(referencedMusicIds(levels));

  return {
    format: BUNDLE_FORMAT,
    exportedAt: new Date().toISOString(),
    game,
    worlds,
    levels,
    skins,
    customEntities,
    backgrounds: backgroundLibrary.filter((b) => wantedBackgrounds.has(b.id)),
    music: musicLibrary.filter((m) => wantedMusic.has(m.id)),
  };
}
