/**
 * A Game is a title, worlds in a chosen order, and an ending.
 *
 * It is the top of the hierarchy this tool builds: levels go in worlds, worlds
 * go in a game. That is also what makes it the thing a publish step will
 * eventually ship — until a game exists as a document, there is nothing to hand
 * to anyone but an editor.
 *
 * Like `WorldData`, this references its contents by id and owns none of them:
 * editing or deleting a world elsewhere shows up the next time the game is
 * played, and a world that has gone missing ends the run early rather than
 * breaking it (see WorldMapScene).
 *
 * **How far a player has got is deliberately not here, and is not stored
 * anywhere new either.** A game is finished when its last world is finished, and
 * per-world progress already exists in `world/worldProgress.ts` — so game
 * progress is *derived* (see `isGameComplete`) rather than being a second
 * record that could disagree with the first.
 *
 * Pure, no Phaser, so the rules are testable on their own — the same split
 * `entities/customEntity.ts` and `world/worldLayout.ts` use.
 */

/** The words shown after the last world is beaten.
 *
 * Two single lines rather than a paragraph: every text field in this app is a
 * `LevelNameInput`, which is a one-line DOM input, and a real multi-line field
 * means a new textarea overlay. A headline and a sign-off is a genuine ending;
 * anything longer belongs with the cut-scene work. */
export interface GameEnding {
  headline: string;
  message: string;
}

export interface GameData {
  id: string;
  title: string;
  /** Play order. The single source of truth for both what is in the game and
   * the sequence it runs in — the same role `levelIds` plays for a world. */
  worldIds: string[];
  ending: GameEnding;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_ENDING_HEADLINE = "The End";
export const DEFAULT_ENDING_MESSAGE = "Thanks for playing!";

/**
 * A blank game.
 *
 * Opens valid apart from the two things only the author can supply — a title and
 * at least one world — so the maker never starts in a state its own validator
 * cannot explain. The ending is pre-filled because an ending nobody edited
 * should still read as an ending rather than as a blank screen.
 */
export function createEmptyGame(id: string): GameData {
  const now = new Date().toISOString();
  return {
    id,
    title: "",
    worldIds: [],
    ending: { headline: DEFAULT_ENDING_HEADLINE, message: DEFAULT_ENDING_MESSAGE },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Why a game cannot be saved, or `null` when it can.
 *
 * A reason string rather than a thrown error, for the same purpose
 * `customEntity.validationError` serves: this is shown to whoever is building
 * the thing, and a document arriving from storage — hand-edited, or written by
 * an older build — has to be rejected rather than allowed to take the app down.
 */
export function validationError(game: GameData): string | null {
  if (!game.title.trim()) return "Give your game a title.";
  if (game.worldIds.length === 0) return "Add at least one world.";
  if (new Set(game.worldIds).size !== game.worldIds.length) {
    // Not merely untidy: the same world twice means beating it once satisfies
    // two positions, and the run would skip straight past the second.
    return "The same world is in the game twice.";
  }
  return null;
}

export function isValid(game: GameData): boolean {
  return validationError(game) === null;
}

/**
 * Moves one world earlier or later in the play order.
 *
 * Clamped rather than wrapping: pressing "up" on the first world does nothing,
 * which is what a list of ordered steps should do — wrapping would silently send
 * the opening world to the end.
 *
 * Returns the same object when nothing moved, so a caller can skip a redraw.
 */
export function moveWorld(game: GameData, index: number, direction: -1 | 1): GameData {
  const target = index + direction;
  if (index < 0 || index >= game.worldIds.length) return game;
  if (target < 0 || target >= game.worldIds.length) return game;
  const worldIds = [...game.worldIds];
  [worldIds[index], worldIds[target]] = [worldIds[target], worldIds[index]];
  return { ...game, worldIds };
}

/** Adds a world to the end of the run, refusing a duplicate rather than
 * creating one validation would then reject. */
export function addWorld(game: GameData, worldId: string): GameData {
  if (game.worldIds.includes(worldId)) return game;
  return { ...game, worldIds: [...game.worldIds, worldId] };
}

export function removeWorld(game: GameData, worldId: string): GameData {
  if (!game.worldIds.includes(worldId)) return game;
  return { ...game, worldIds: game.worldIds.filter((id) => id !== worldId) };
}

/**
 * Whether every world in the game has been finished.
 *
 * Takes the per-world answers rather than reading storage, so this stays pure
 * and so the caller uses the one source of truth it already has
 * (`worldProgress.isWorldComplete`). An empty game is *not* complete — there is
 * nothing to have finished, and reporting otherwise would show the ending to
 * someone who never played anything.
 */
export function isGameComplete(worldIds: readonly string[], isComplete: (worldId: string) => boolean): boolean {
  return worldIds.length > 0 && worldIds.every(isComplete);
}

/** The next world to play, or `null` when that was the last one — the moment
 * the ending is due. */
export function nextWorldId(game: GameData, index: number): string | null {
  return game.worldIds[index + 1] ?? null;
}
