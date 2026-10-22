/**
 * Where "back" goes from a level being played, and what to call it.
 *
 * A level can be reached from four places now — Test Play in the editor, a
 * world's map, Templates, and (since My Levels grew a Play button) the saved
 * list — and each wants the top-left button and the win/lose hint to name the
 * place the player actually came from. Getting it wrong is not cosmetic: the
 * button said "◀ EDITOR" while navigating somewhere else entirely, which is a
 * worse lie than saying nothing.
 *
 * Phaser-free, and in `play/` beside `tuning.ts` for the same reason that file
 * exists: this is pure string logic, and a rule parked inside a 2,000-line
 * scene cannot be tested at all. `PlayScene` already navigates generically
 * (`scene.start(this.returnScene)`), so the only thing that ever needed a
 * decision was the wording.
 */

/** The parts of `PlaySceneData` this decision depends on. Deliberately not the
 * real `WorldPlayContext` — only `worldId` matters here, and taking the whole
 * thing would drag the world schema into a module about words. */
export interface BackDestinationContext {
  /** Present when the level is part of a world run. */
  world?: { worldId?: string };
  /** The scene key Play was told to return to, when it was not the editor. */
  returnScene?: string;
}

export interface BackDestination {
  /** For the top-left button, which renders it uppercased. */
  label: string;
  /** For mid-sentence use — "press Esc for <phrase>" — so it reads as English
   * rather than as a button name dropped into a sentence. */
  phrase: string;
}

/** Scene keys that know their own name. Anything not here falls through to the
 * editor, which is what Test Play — the only entry that passes no
 * `returnScene` at all — needs. */
const BY_RETURN_SCENE: Record<string, BackDestination> = {
  Templates: { label: "Templates", phrase: "Templates" },
  // "My Levels" rather than "LevelBrowser": the player never sees a scene key,
  // and the screen's own heading says My Levels.
  LevelBrowser: { label: "My Levels", phrase: "My Levels" },
};

/**
 * A world run wins over `returnScene`, because being inside a world is the
 * stronger fact: the map is where the run continues, whatever screen started
 * it. A world with no `worldId` is a one-off run of a world that was never
 * saved, which has no map to go back to.
 */
export function backDestination(context: BackDestinationContext): BackDestination {
  if (context.world) {
    return context.world.worldId ? { label: "Map", phrase: "the map" } : { label: "Worlds", phrase: "Worlds" };
  }
  const named = context.returnScene ? BY_RETURN_SCENE[context.returnScene] : undefined;
  return named ?? { label: "Editor", phrase: "the editor" };
}
