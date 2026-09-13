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

import { isBuiltinBackgroundId } from "../level/staticBackgrounds";

/**
 * Somebody standing in a panel.
 *
 * **Position is normalised, 0..1 across the picture area**, not pixels. The
 * picture area is `GAME_HEIGHT` minus the words band, and both of those are
 * derived numbers this file deliberately knows nothing about; storing pixels
 * would bake today's band height into every saved game, so a later change to the
 * layout would slide every character somebody had ever placed. 0..1 survives it.
 *
 * `y` is the character's **feet**, not their middle — playback draws with origin
 * (0.5, 1). Standing on the ground is the thing an author is nearly always
 * trying to do, and it is the one position that has to look exact.
 */
export interface PanelActor {
  /** A palette/entity id — the same id space levels, skins and the Thing Maker
   * use, so a reskinned built-in or an invented thing needs nothing special. */
  id: string;
  x: number;
  y: number;
  /** 1 is the size it is in a level. Absent means 1. */
  scale?: number;
  /** Facing left rather than right. Absent means right. */
  flip?: boolean;
}

export interface CutScenePanel {
  /** A picture: either one of the 4 shipped background ids or a
   * background-library id. Absent means words on a plain backdrop. */
  imageId?: string;
  /** Absent means a picture with nothing written over it. */
  words?: string;
  /** Who is standing in it. Absent and empty mean the same thing. */
  actors?: PanelActor[];
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
 *
 * **Characters count.** A panel holding nothing but a hero standing on the plain
 * backdrop is a panel somebody composed on purpose; leaving actors out of this
 * would have `playablePanels` drop it, so the work would be plainly there in the
 * maker and silently gone on the link — the exact failure `collectBundle`'s own
 * comment warns about for pictures.
 */
export function panelHasContent(panel: CutScenePanel): boolean {
  return !!panel.imageId || !!panel.words?.trim() || !!panel.actors?.length;
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

/** The actors of one panel, as a list that is always safe to index — `actors`
 * is optional on disk, and every caller below wants the empty case to behave
 * like an empty list rather than needing its own `?? []`. */
export function panelActors(panel: CutScenePanel | undefined): PanelActor[] {
  return panel?.actors ?? [];
}

/** Positions are clamped rather than rejected: a drag that leaves the stage
 * means "as far as it goes", and an actor stored outside 0..1 would draw itself
 * off the edge of a panel nobody could then select it in. */
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function addActor(cutScene: CutScene, index: number, actor: PanelActor): CutScene {
  const panel = cutScene.panels[index];
  if (!panel) return cutScene;
  const placed = { ...actor, x: clamp01(actor.x), y: clamp01(actor.y) };
  return updatePanel(cutScene, index, { actors: [...panelActors(panel), placed] });
}

/** Returns the same object when `actorIndex` names nothing, matching
 * `movePanel`'s convention so a caller can skip a redraw on identity. */
export function updateActor(cutScene: CutScene, index: number, actorIndex: number, changes: Partial<PanelActor>): CutScene {
  const actors = panelActors(cutScene.panels[index]);
  if (actorIndex < 0 || actorIndex >= actors.length) return cutScene;
  const next = [...actors];
  const merged = { ...next[actorIndex], ...changes };
  next[actorIndex] = { ...merged, x: clamp01(merged.x), y: clamp01(merged.y) };
  return updatePanel(cutScene, index, { actors: next });
}

export function removeActor(cutScene: CutScene, index: number, actorIndex: number): CutScene {
  const actors = panelActors(cutScene.panels[index]);
  if (actorIndex < 0 || actorIndex >= actors.length) return cutScene;
  return updatePanel(cutScene, index, { actors: actors.filter((_, i) => i !== actorIndex) });
}

/**
 * Every entity id these cut scenes put on screen, de-duplicated.
 *
 * Unlike the pictures, this feeds no collector: `skins` and `customEntities`
 * travel **whole** in a bundle rather than filtered (see `GameBundle`'s own
 * docstring for why that asymmetry is correctness), so an actor's art is already
 * carried. It exists for `bundleProblems`, which can then say that a panel names
 * an invented thing whose definition is gone — the same courtesy the missing
 * picture message already does.
 */
export function cutSceneActorIds(...cutScenes: (CutScene | undefined)[]): string[] {
  const out = new Set<string>();
  for (const cutScene of cutScenes) {
    for (const panel of cutScene?.panels ?? []) {
      for (const actor of panelActors(panel)) out.add(actor.id);
    }
  }
  return [...out];
}

/**
 * Every background-**library** id these cut scenes reach, de-duplicated.
 *
 * The collector unions this with the levels' own references. It has to: a cut
 * scene's pictures are library ids like any other, so collecting only what the
 * *levels* name would publish a game whose opening is blank — art that was there
 * in the editor and silently gone on the link.
 *
 * The 4 built-in ids are deliberately **not** returned. A panel's `imageId` can
 * name either, since the picker offers both, but a built-in ships inside the app
 * and has nothing in the library to collect: returning one would send the
 * collector hunting for an asset that was never there, and `bundleProblems`
 * would then report a missing picture for a picture that is perfectly fine.
 */
export function cutSceneBackgroundIds(...cutScenes: (CutScene | undefined)[]): string[] {
  const out = new Set<string>();
  for (const cutScene of cutScenes) {
    for (const panel of cutScene?.panels ?? []) {
      if (panel.imageId && !isBuiltinBackgroundId(panel.imageId)) out.add(panel.imageId);
    }
  }
  return [...out];
}
