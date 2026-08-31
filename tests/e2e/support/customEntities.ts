import type { Page } from "@playwright/test";
import type { CustomEntityDef } from "../../../src/entities/customEntity";

/**
 * Seeding invented entity types for a spec.
 *
 * There is no authoring screen yet (step 0d), so definitions go in through the
 * dev-only `__debugCustomEntities` hook (see main.ts), which calls the real
 * Drive-backed storage module against the mocked Drive — the same "drive the
 * real code path, mock only the network" stance mockDrive.ts takes.
 */

declare global {
  interface Window {
    __debugCustomEntities?: {
      save(def: CustomEntityDef): Promise<void>;
      remove(id: string): Promise<void>;
      invalidate(): void;
    };
  }
}

const SEED_TIME = "2026-08-31T00:00:00.000Z";

/** A definition with the fields a spec cares about, defaulted to a plain custom
 * coin for the ones it does not. */
export function customDef(over: Partial<CustomEntityDef> & { id: string }): CustomEntityDef {
  return {
    name: "Star Fruit",
    category: "items",
    basedOn: "item-coin",
    createdAt: SEED_TIME,
    updatedAt: SEED_TIME,
    ...over,
  } as CustomEntityDef;
}

export async function seedCustomEntities(page: Page, defs: CustomEntityDef[]): Promise<void> {
  await page.waitForFunction(() => !!window.__debugCustomEntities);
  await page.evaluate(async (defs: CustomEntityDef[]) => {
    for (const def of defs) await window.__debugCustomEntities!.save(def);
  }, defs);
}

/** Removes a definition and drops the cache, so the next scene resolves the
 * library the way a fresh page load would. */
export async function deleteCustomEntity(page: Page, id: string): Promise<void> {
  await page.evaluate(async (id: string) => {
    await window.__debugCustomEntities!.remove(id);
    window.__debugCustomEntities!.invalidate();
  }, id);
}
