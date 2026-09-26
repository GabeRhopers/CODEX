import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp, openThings, pixelCanvasBox, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * Which character a level is played as.
 *
 * **The runtime never needed changing.** PlayScene has always resolved the
 * character through `resolveFrameTextureKeys(this, CHARACTER_SKIN_ID,
 * level.skins)`, with skinSelection.ts's level → default → built-in cascade
 * behind it. What was missing was any way to *say* so: the editor's skin picker
 * reskins whichever brush is selected, and the character is deliberately not a
 * palette brush (it would be a brush that places nothing), so the only lever
 * anyone had was "Set as default" in the Skin Creator — which moves the hero
 * for every level at once.
 *
 * So both states asserted here were unreachable before the Hero picker existed,
 * and they are deliberately the two that a single global default cannot
 * express: **this level wears a hero nothing else does**, and **this level
 * keeps Grampa although the default has moved**. `sprite-frames.spec.ts`
 * already covers the painting and the animating; what is left for this file is
 * the choosing.
 */

const CHARACTER_GRID = 48;

/** The texture the player sprite is currently drawn with. */
const playerTexture = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { player?: { texture: { key: string } } };
    return scene.player?.texture.key ?? "";
  });

const skinEditorStatus = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { statusText?: { text: string } };
    return scene.statusText?.text ?? "";
  });

/** Whatever the hero trigger currently reads — its three states are
 * Built-in / Default / Custom, so a test cannot hardcode one and still be
 * able to open the picker from both before and after a default is set. */
const heroTrigger = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor");
    type O = { type?: string; text?: string; list?: O[] };
    let found = "";
    const walk = (l: O[]): void => {
      for (const c of l) {
        if (c.type === "Text" && c.text?.startsWith("Hero:")) found = c.text;
        if (c.list) walk(c.list);
      }
    };
    walk((scene.children.list as unknown as O[]) ?? []);
    return found;
  });

async function openHeroPicker(page: Page): Promise<void> {
  await clickByText(page, "Editor", await heroTrigger(page));
}

/**
 * Paints a hero in the Skin Creator and saves it, leaving the app on the Menu.
 *
 * Three cells in one corner of the idle frame is enough: nothing here asks what
 * it looks like, only whose art the player ends up wearing, and a saved skin
 * resolves to a `skin-frame-player-*` texture however little of it is painted.
 * It is deliberately **not** made the default — in the first test below, the
 * level's own choice is then the only thing that could put it on screen.
 */
async function paintAndSaveAHero(page: Page): Promise<void> {
  await openThings(page);
  await clickIconWithLabel(page, "SkinEditor", "Grampa");
  await page.waitForSelector("canvas");
  await expect
    .poll(() =>
      page.evaluate(() => Array.from(document.querySelectorAll("canvas")).some((c) => c.width === 48 && c.height === 48)),
    )
    .toBe(true);

  const box = await pixelCanvasBox(page, CHARACTER_GRID);
  for (const [x, y] of [
    [4, 4],
    [5, 4],
    [4, 5],
  ]) {
    await page.mouse.click(
      box.left + ((x + 0.5) * box.width) / CHARACTER_GRID,
      box.top + ((y + 0.5) * box.height) / CHARACTER_GRID,
    );
  }

  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => skinEditorStatus(page)).toContain("Saved");
}

/** Two backs: canvas mode returns to the Things grid, the grid to the Menu. */
async function backToMenu(page: Page): Promise<void> {
  await clickByText(page, "SkinEditor", "← Back");
  await clickByText(page, "SkinEditor", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
}

const FLAT = () =>
  makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 18, y: 5 },
    ]),
  );

test("a level can wear a hero that no other level wears", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await paintAndSaveAHero(page);
  await backToMenu(page);

  await startEditorWithLevel(page, FLAT());
  // **The precondition, asserted rather than assumed.** No default was set, so
  // if this said anything but Built-in the painted skin would already be on
  // screen and the pick below would prove nothing.
  expect(await heroTrigger(page), "nothing is wearing the new hero yet").toBe("Hero: Built-in ▾");

  await openHeroPicker(page);
  // defaultSkinName's sequence — the first hero painted for the character.
  await clickByText(page, "Editor", "Grampa 1");
  await expect.poll(() => heroTrigger(page), { timeout: 10_000 }).toBe("Hero: Custom ▾");

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await expect.poll(() => playerTexture(page), { timeout: 15_000 }).toContain("skin-frame-player-");
});

test("a level can keep Grampa although the default has moved", async ({ page }) => {
  test.slow();
  // The other state, and the reason the level's value is three-state rather
  // than a nullable id: "built-in art" has to be sayable as a *decision*, so a
  // default set later cannot overrule it. See skinSelection.ts.
  await gotoApp(page);
  await paintAndSaveAHero(page);
  await clickByText(page, "SkinEditor", "Set as default");
  await clickByText(page, "SkinEditor", "For every level?");
  await expect.poll(() => skinEditorStatus(page)).toContain("default set");
  await backToMenu(page);

  await startEditorWithLevel(page, FLAT());
  expect(await heroTrigger(page), "the default is what a fresh level inherits").toBe("Hero: Default ▾");

  await openHeroPicker(page);
  await clickByText(page, "Editor", "Grampa");

  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  // Grampa's own art, despite a default pointing elsewhere.
  await expect.poll(() => playerTexture(page), { timeout: 15_000 }).toContain("wizard-");
  expect(await playerTexture(page)).not.toContain("skin-frame-player-");
});
