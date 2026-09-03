/**
 * A cut scene: a few pictures with words, shown before or after the game.
 *
 * The one content feature named in the original goal and not yet built — a game
 * opened on a title screen and ended on two lines over a trophy, with no way to
 * say why any of it was happening.
 *
 * **A panel is a picture and words, and needs at least one of the two.** The
 * picture is an id into the shared background library — the same pool *Upload
 * BG* fills, which already downscales to 1600px, re-encodes as JPEG
 * (`editor/customBackgroundUpload.ts`), is shared across profiles, and travels
 * in a bundle by reference. Reusing it means a cut scene adds no upload path, no
 * storage and no loader of its own; what it adds is one more reference walk for
 * the collector.
 *
 * Pure — no Phaser, no Drive, no DOM — and deliberately knowing nothing about
 * games, so hanging a cut scene off a *world* later is an addition rather than a
 * rewrite. The same split `GameSchema.ts` and `world/worldLayout.ts` use.
 */

export interface CutScenePanel {
  /** A background-library id. Absent means words on a plain backdrop. */
  imageId?: string;
  /** Absent means a picture with nothing written over it. */
  words?: string;
}

export interface CutScene {
  panels: CutScenePanel[];
}

export function emptyCutScene(): CutScene {
  return { panels: [] };
}

/**
 * Whether a panel would show anything.
 *
 * Whitespace does not count, for the same reason `EndingScene` treats a cleared
 * field as absent: someone who typed a space and moved on did not mean "show a
 * blank screen for a beat".
 */
export function panelHasContent(panel: CutScenePanel): boolean {
  return !!panel.imageId || !!panel.words?.trim();
}

/**
 * Whether this cut scene should play at all.
 *
 * False for a cut scene of nothing but empty panels, which is exactly what an
 * author who pressed **Add panel** three times and then typed nothing has. The
 * seams ask this rather than `panels.length`, so that author gets their game
 * rather than three blank screens they have to click through.
 */
export function hasContent(cutScene: CutScene | undefined): boolean {
  return !!cutScene?.panels.some(panelHasContent);
}

/** Only the panels worth showing, in order — what playback iterates, so an empty
 * panel in the middle of a good cut scene is skipped rather than shown. */
export function playablePanels(cutScene: CutScene | undefined): CutScenePanel[] {
  return (cutScene?.panels ?? []).filter(panelHasContent);
}

export function addPanel(cutScene: CutScene, panel: CutScenePanel = {}): CutScene {
  return { panels: [...cutScene.panels, panel] };
}

export function removePanel(cutScene: CutScene, index: number): CutScene {
  if (index < 0 || index >= cutScene.panels.length) return cutScene;
  return { panels: cutScene.panels.filter((_, i) => i !== index) };
}

export function updatePanel(cutScene: CutScene, index: number, changes: Partial<CutScenePanel>): CutScene {
  if (index < 0 || index >= cutScene.panels.length) return cutScene;
  const panels = [...cutScene.panels];
  panels[index] = { ...panels[index], ...changes };
  return { panels };
}

/**
 * Moves one panel earlier or later.
 *
 * Clamped rather than wrapping, and returns the same object when nothing moved —
 * `GameSchema.moveWorld`'s shape exactly, for the same two reasons: pressing
 * "up" on the first panel should do nothing rather than silently send the
 * opening shot to the end, and an unchanged object lets the caller skip a
 * redraw.
 */
export function movePanel(cutScene: CutScene, index: number, direction: -1 | 1): CutScene {
  const target = index + direction;
  if (index < 0 || index >= cutScene.panels.length) return cutScene;
  if (target < 0 || target >= cutScene.panels.length) return cutScene;
  const panels = [...cutScene.panels];
  [panels[index], panels[target]] = [panels[target], panels[index]];
  return { panels };
}

/**
 * Every background-library id these cut scenes reach, de-duplicated.
 *
 * The collector unions this with the levels' own references. It has to: a cut
 * scene's pictures are library ids like any other, so collecting only what the
 * *levels* name would publish a game whose opening is blank — art that was there
 * in the editor and silently gone on the link.
 */
export function cutSceneBackgroundIds(...cutScenes: (CutScene | undefined)[]): string[] {
  const out = new Set<string>();
  for (const cutScene of cutScenes) {
    for (const panel of cutScene?.panels ?? []) {
      if (panel.imageId) out.add(panel.imageId);
    }
  }
  return [...out];
}
