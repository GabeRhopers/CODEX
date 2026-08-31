import type { Page } from "@playwright/test";
import type { LevelData } from "../../../src/level/LevelSchema";
import type { WorldData } from "../../../src/world/WorldSchema";
import { makeArea, makeLevel } from "./levels";

/**
 * Seeding for the Worlds specs.
 *
 * Both helpers go through the app's **real** storage adapters against the
 * mocked Drive, rather than writing a fixture into storage directly — which is
 * the whole point of mockDrive.ts. They reach them via a scene instance:
 * Phaser constructs every registered scene at boot, and both adapters are class
 * fields assigned at construction, so they are live before the scene is ever
 * started.
 *
 * Building a world through the maker's own UI would be the more end-to-end
 * route, but it takes a click per level plus a save round trip per spec, and
 * every spec here needs a world *before* it can test anything. The maker's UI
 * gets its own coverage in the spec that actually exercises it.
 */

/** A minimal but genuinely playable level: ground, a spawn, and a goal two
 * tiles along so a spec can walk from one to the other in about a second. */
export function playableLevel(id: string, name: string): LevelData {
  const level = makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 2, y: 5 },
      { type: "goal", x: 5, y: 5 },
    ]),
  );
  return { ...level, id, name };
}

/**
 * Seeds levels in an order the browsers will actually show them in.
 *
 * Both list adapters sort by `updatedAt`, newest first, and `makeLevel` stamps
 * `new Date()` per call — so nine levels built in one loop usually share a
 * millisecond (stable sort keeps seed order) but sometimes straddle one, which
 * silently reverses the list. With six rows to a page that moves `names[0]` from
 * the top of page 1 to the bottom of page 2, and any spec looking for it by name
 * fails with "no Text ... found". That is one of the intermittent failures this
 * suite has been carrying: it reproduces exactly by giving the seeds distinct
 * increasing timestamps.
 *
 * Stamping them explicitly *descending* makes the order deterministic and equal
 * to the order the names were given in, which is what every caller already
 * assumes.
 */
export async function seedLevels(page: Page, names: string[]): Promise<string[]> {
  const base = Date.now();
  const levels = names.map((name, i) => ({
    ...playableLevel(`e2e-world-level-${i}`, name),
    updatedAt: new Date(base - i).toISOString(),
  }));
  await page.evaluate(async (levels: LevelData[]) => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      levelStorage: { save(level: LevelData): Promise<void> };
    };
    for (const level of levels) await scene.levelStorage.save(level);
  }, levels);
  return levels.map((l) => l.id);
}

/** Worlds are seeded one call at a time, so their stamps are usually distinct
 * and *increasing* — the reverse of the level case, and just as unstable when
 * two calls do land in the same millisecond. `makeWorld` takes an explicit
 * `updatedAt` for that reason; `seedWorlds` below is the ordered form. */
export async function seedWorld(page: Page, world: WorldData): Promise<void> {
  await page.evaluate(async (world: WorldData) => {
    const scene = window.__debugGame!.scene.getScene("WorldMaker") as unknown as {
      worldStorage: { save(world: WorldData): Promise<void> };
    };
    await scene.worldStorage.save(world);
  }, world);
}

export function makeWorld(id: string, name: string, levelIds: string[], extra: Partial<WorldData> = {}): WorldData {
  const now = new Date().toISOString();
  return { id, name, levelIds, createdAt: now, updatedAt: now, ...extra };
}

/** Seeds several worlds so the browser lists them in the order given, for the
 * same reason seedLevels stamps its own timestamps. */
export async function seedWorlds(page: Page, worlds: WorldData[]): Promise<void> {
  const base = Date.now();
  for (const [i, world] of worlds.entries()) {
    await seedWorld(page, { ...world, updatedAt: new Date(base - i).toISOString() });
  }
}

/** How far the map thinks the player has got, read straight out of the store
 * worldProgress writes to. */
export async function storedProgress(page: Page, worldId: string): Promise<number> {
  return page.evaluate((id) => {
    const raw = localStorage.getItem("rhopers:world-progress");
    if (!raw) return 0;
    try {
      return (JSON.parse(raw) as Record<string, number>)[id] ?? 0;
    } catch {
      return 0;
    }
  }, worldId);
}
