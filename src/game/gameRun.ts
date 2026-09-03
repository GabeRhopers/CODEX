import { hasContent } from "./CutScene";
import { GameData } from "./GameSchema";

/**
 * Where a game starts, and what it carries with it.
 *
 * Two screens begin a run — the published game's title and the Game Maker's own
 * **Play Game ▶** — and both used to build the hand-over payload themselves.
 * Once an opening cut scene could come first, that duplication became a place
 * for the two paths to disagree about whether a story plays, so the decision
 * moved here.
 *
 * Pure and Phaser-free: this returns *which scene to start and with what*, and
 * the callers do the starting. That keeps the branch — cut scene, or straight to
 * the map — testable without a game instance.
 */

/** What a scene needs to start another one: `scene.start(key, data)`. */
export interface SceneStart {
  key: string;
  data: object;
}

/**
 * Where this world sits in a game, carried through the run.
 *
 * `ending` and `closing` travel *with* the run rather than being re-read at the
 * finish, for the reason WorldMapScene's own note gives: the game document is
 * the caller's to own, and a second read is a second chance for the two to
 * disagree about how the game ends.
 */
export interface GameRunContext {
  worldIds: string[];
  index: number;
  title: string;
  ending: GameData["ending"];
  closing?: GameData["closing"];
}

export function gameRunContext(game: GameData, index = 0): GameRunContext {
  return {
    worldIds: game.worldIds,
    index,
    title: game.title,
    ending: game.ending,
    closing: game.closing,
  };
}

/** The map, at whichever world this run is up to. */
export function worldMapStart(game: GameData, index = 0): SceneStart {
  return { key: "WorldMap", data: { worldId: game.worldIds[index], game: gameRunContext(game, index) } };
}

/**
 * The first screen of a run: the opening cut scene when there is one to show,
 * otherwise the map itself.
 *
 * `hasContent` rather than `opening !== undefined`, so an author who pressed
 * **Add panel** and then typed nothing gets their game rather than a blank
 * screen to click past.
 */
export function firstSceneOfGame(game: GameData): SceneStart {
  const map = worldMapStart(game, 0);
  if (!hasContent(game.opening)) return map;
  return { key: "CutScene", data: { cutScene: game.opening, next: map } };
}

/**
 * What follows the last world: the closing cut scene when there is one, then the
 * ending either way.
 *
 * Takes the run context rather than the game, because the map that calls this
 * has the run in hand and deliberately not the document.
 */
export function endOfGameScene(run: GameRunContext): SceneStart {
  const ending: SceneStart = { key: "Ending", data: { ending: run.ending, title: run.title } };
  if (!hasContent(run.closing)) return ending;
  return { key: "CutScene", data: { cutScene: run.closing, next: ending } };
}
