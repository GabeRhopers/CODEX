import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoAppWithoutProfile, waitForGame } from "./support/coords";
import { failSilentAuth } from "./support/mockDrive";
import { makeWorld, seedLevels, seedWorld } from "./support/worlds";

/**
 * The Profile gate, and what a profile actually scopes.
 *
 * Every other spec calls `gotoApp`, which seeds `rhopers:profile` through
 * `addInitScript` before the page loads — so all of them boot straight past
 * ProfileGateScene and none has ever walked the picker, the connect prompt,
 * Switch profile, or the legacy-key migration. These use
 * `gotoAppWithoutProfile` instead, which seeds nothing.
 *
 * The scoping half matters more than it looks. `GoogleDriveStorageAdapter.list`
 * filters on `appProperties.profile`, and the world adapter does the same — but
 * skins deliberately do *not*, which is the sort of asymmetry someone
 * "corrects" into a bug later. All three are pinned here.
 */

const CURRENT_KEY = "rhopers:profile";
const LEGACY_KEY = "spellbound:profile";

/** Whether the gate is currently showing its picker, by its own heading. */
async function pickerShowing(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("ProfileGate");
    if (!scene || !window.__debugGame!.scene.isActive("ProfileGate")) return false;
    return scene.children.list.some((c) => (c as { text?: string }).text === "Who's playing?");
  });
}

async function storedProfile(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), CURRENT_KEY);
}

/** Every Text on a scene — enough to assert what a browser screen is listing
 * without coupling to its layout. */
async function textsOn(page: Page, sceneKey: string): Promise<string[]> {
  return page.evaluate((key) => {
    const scene = window.__debugGame!.scene.getScene(key);
    type Listable = { list?: Listable[]; type?: string; text?: string };
    const found: string[] = [];
    const walk = (list: Listable[]) => {
      for (const child of list) {
        if (child.type === "Text" && child.text) found.push(child.text);
        if (child.list) walk(child.list);
      }
    };
    walk((scene.children.list as unknown as Listable[]) ?? []);
    return found;
  }, sceneKey);
}

/** Picks a profile on the gate and waits for the Menu. */
async function pickProfile(page: Page, profile: string): Promise<void> {
  await clickByText(page, "ProfileGate", profile);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
}

/** Switches profile through the Menu header link and picks a new name. The
 * link's label carries the current profile, so it has to be built. */
async function switchProfileTo(page: Page, from: string, to: string): Promise<void> {
  await clickByText(page, "Menu", `${from} · Switch profile`);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("ProfileGate"));
  await pickProfile(page, to);
}

test("a first visit asks who's playing rather than opening the Menu", async ({ page }) => {
  test.slow();
  await gotoAppWithoutProfile(page);

  expect(await pickerShowing(page)).toBe(true);
  expect(await page.evaluate(() => window.__debugGame!.scene.isActive("Menu"))).toBe(false);
  expect(await storedProfile(page)).toBeNull();
});

test("picking a profile opens the Menu and is remembered across a reload", async ({ page }) => {
  test.slow();
  await gotoAppWithoutProfile(page);
  await pickProfile(page, "Mike");

  expect(await storedProfile(page)).toBe("Mike");
  expect(await textsOn(page, "Menu")).toContain("Mike · Switch profile");

  // The gate is re-entered on every boot, so "remembered" has to mean it waves
  // you through — not merely that the value is still in storage.
  await page.reload();
  await waitForGame(page);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
  expect(await pickerShowing(page)).toBe(false);
});

test("a first-ever visitor picks a name, then connects Drive, in that order", async ({ page }) => {
  test.slow();
  // Without this the mock hands a token to every request, so the silent
  // reconnect always succeeds and the connect prompt is unreachable.
  await failSilentAuth(page);
  await gotoAppWithoutProfile(page);

  // Profile first: `proceed()` checks for a profile before it checks the
  // connection, so someone with neither is asked who they are first.
  expect(await pickerShowing(page)).toBe(true);
  await clickByText(page, "ProfileGate", "Mike");

  await expect.poll(() => textsOn(page, "ProfileGate")).toContain("Connect Google Drive");
  expect(await textsOn(page, "ProfileGate")).toContain("Hi, Mike.");
  expect(await page.evaluate(() => window.__debugGame!.scene.isActive("Menu"))).toBe(false);

  // The interactive button still works — only the silent path was failing.
  await clickByText(page, "ProfileGate", "Connect Google Drive");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
});

test("Switch profile really switches, and nothing migrates the old one back", async ({ page }) => {
  test.slow();
  await gotoAppWithoutProfile(page);
  // A device that picked a profile before the 2026-08-16 rename carries the
  // legacy key too. clearActiveProfile has to remove *both*, or the next
  // loadActiveProfile migrates the old profile straight back and Switch profile
  // silently does nothing.
  await page.evaluate((key) => localStorage.setItem(key, "Mike"), LEGACY_KEY);
  await pickProfile(page, "Mike");

  await clickByText(page, "Menu", "Mike · Switch profile");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("ProfileGate"));
  await expect.poll(() => pickerShowing(page)).toBe(true);
  expect(await storedProfile(page)).toBeNull();

  // And it stays switched: a reload must still land on the picker.
  await page.reload();
  await waitForGame(page);
  await expect.poll(() => pickerShowing(page)).toBe(true);
});

test("a device that only has the pre-rename key is let straight in", async ({ page }) => {
  test.slow();
  await gotoAppWithoutProfile(page);
  await page.evaluate((key) => localStorage.setItem(key, "Gabriel"), LEGACY_KEY);

  await page.reload();
  await waitForGame(page);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  expect(await textsOn(page, "Menu")).toContain("Gabriel · Switch profile");
  expect(await storedProfile(page)).toBe("Gabriel");
});

test("one profile's levels and worlds do not show up in another's", async ({ page }) => {
  test.slow();
  await gotoAppWithoutProfile(page);
  await pickProfile(page, "Mike");

  // Seeded through the real adapters, which stamp whoever is active at save
  // time — so these are genuinely Mike's.
  await seedLevels(page, ["Mike's Level"]);
  await seedWorld(page, makeWorld("mike-world", "Mike's World", []));

  const levelNames = async () => (await textsOn(page, "LevelBrowser")).join("|");
  const worldNames = async () => (await textsOn(page, "WorldBrowser")).join("|");

  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  await expect.poll(levelNames).toContain("Mike's Level");
  await clickByText(page, "LevelBrowser", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  await switchProfileTo(page, "Mike", "Gabriel");

  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  // Poll for the list to settle before asserting an *absence* — otherwise this
  // would pass simply by reading the screen before the Drive round trip lands.
  await page.waitForTimeout(500);
  expect(await levelNames()).not.toContain("Mike's Level");
  await clickByText(page, "LevelBrowser", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  await clickByText(page, "Menu", "Worlds");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("WorldBrowser"));
  await page.waitForTimeout(500);
  expect(await worldNames()).not.toContain("Mike's World");
  await clickByText(page, "WorldBrowser", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  // Back to Mike, and it is all still there — absence was scoping, not loss.
  await switchProfileTo(page, "Gabriel", "Mike");
  await clickByText(page, "Menu", "My Levels");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("LevelBrowser"));
  await expect.poll(levelNames).toContain("Mike's Level");
});

test("skins are shared across profiles, unlike levels", async ({ page }) => {
  test.slow();
  await gotoAppWithoutProfile(page);
  await pickProfile(page, "Mike");

  // Written through the real skin storage, which — deliberately — records no
  // profile at all (see skinStorage.ts's docstring). `savePixelSkin` rather
  // than `addCustomSkin` because the Skin Creator's browse list shows *pixel*
  // skins, and a plain upload would be stored fine but never listed — which
  // read as a scoping failure the first time round.
  await page.evaluate(async () => {
    const mod = (await import("/src/skins/skinStorage.ts")) as {
      savePixelSkin(
        brushId: string,
        existingId: string | undefined,
        imageData: string,
        pixelData: { paletteId: string },
        uploadedBy: string,
        frames?: Record<string, string>,
        name?: string,
      ): Promise<string>;
    };
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    await mod.savePixelSkin("enemy-ghost", undefined, png, { paletteId: "pico8" }, "Mike", undefined, "Shared Ghost");
  });

  await switchProfileTo(page, "Mike", "Gabriel");
  // The reload is load-bearing: loadCustomSkins caches for the page load, so
  // without it Gabriel would be reading Mike's cached library and this would
  // pass no matter how the storage behaved.
  await page.reload();
  await waitForGame(page);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));

  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await expect.poll(() => textsOn(page, "SkinEditor")).toContain("Shared Ghost");
});
