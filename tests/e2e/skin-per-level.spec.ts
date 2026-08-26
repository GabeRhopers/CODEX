import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, gotoApp, selectPaletteCategory, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * A skin choice belongs to the level, and a default only moves when someone
 * says so.
 *
 * Until 2026-08-23 neither was true: `activeId` in the shared skins.json was
 * the only place a choice could live, so picking a skin while editing one level
 * restyled every level — and saving or uploading a skin *set* that id, so
 * merely making a skin did the same thing with nothing asked. These three tests
 * are the three halves of that being fixed (the third is the one nobody would
 * think to write, and the one the old code failed).
 */

const GHOST_LEVEL = () =>
  makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 18, y: 5 },
      { type: "enemy-ghost", x: 10, y: 5 },
    ]),
  );

/** Whether the editor is currently rendering the Ghost brush with a custom
 * skin — read through the real resolve pass, not by inspecting storage. */
async function ghostIsSkinned(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor") as unknown as {
      skinTextureKeys?: Map<string, string>;
    };
    return !!scene.skinTextureKeys?.has("enemy-ghost");
  });
}

async function skinTriggerLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Editor");
    const label = scene.children.list.find((child) => {
      const text = (child as { text?: string }).text;
      return typeof text === "string" && text.startsWith("Skin: ");
    }) as { text?: string } | undefined;
    return label?.text ?? "";
  });
}

/** Paints a two-cell Ghost skin in the Skin Creator and returns to the Menu,
 * leaving it in the library and chosen by nobody. */
async function paintGhostSkin(page: Page): Promise<void> {
  await clickByText(page, "Menu", "Skin Creator");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("SkinEditor"));
  await clickByText(page, "SkinEditor", "+ New Skin");
  await clickIconWithLabel(page, "SkinEditor", "Ghost");
  await page.waitForSelector("canvas");

  const box = await page.evaluate(() => {
    const canvas = Array.from(document.querySelectorAll("canvas")).find((c) => c.width === 32)!;
    const r = canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  for (const [x, y] of [
    [8, 8],
    [9, 8],
  ]) {
    await page.mouse.click(box.left + ((x + 0.5) * box.width) / 32, box.top + ((y + 0.5) * box.height) / 32);
  }

  await clickByText(page, "SkinEditor", "Save");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { statusText?: { text: string } };
        return scene.statusText?.text ?? "";
      }),
    )
    .toContain("Saved");
  await clickByText(page, "SkinEditor", "← Back");
  await clickByText(page, "SkinEditor", "← Back");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
}

/** Opens the level's Skin picker for the Ghost brush and picks the first real
 * skin in it (the two entries before it are "Use default" and "Built-in art"). */
async function selectGhostBrush(page: Page): Promise<void> {
  // The palette opens on Blocks; Ghost is an Enemy. The skin picker always
  // targets whichever brush is selected, so this is how you aim it.
  await selectPaletteCategory(page, "Editor", "Enemies");
  await clickIconWithLabel(page, "Editor", "Ghost");
}

async function chooseFirstGhostSkin(page: Page): Promise<void> {
  await selectGhostBrush(page);
  await clickByText(page, "Editor", "Skin: Built-in ▾");
  // Skins are labelled by name now, not counted off as "Skin 1" — paintGhostSkin
  // accepts the offered default, which for a brush with no other skins is
  // "Ghost 1" (see skinNames.defaultSkinName).
  await clickIconWithLabel(page, "Editor", "Ghost 1");
  await expect.poll(() => ghostIsSkinned(page)).toBe(true);
}

test("painting a skin changes no level's appearance until it is picked", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await paintGhostSkin(page);

  // The bug this replaces: Save used to set the global active id, so by this
  // point every level in existence was already wearing it.
  await startEditorWithLevel(page, GHOST_LEVEL());
  await selectGhostBrush(page);
  await expect.poll(() => ghostIsSkinned(page)).toBe(false);
  expect(await skinTriggerLabel(page)).toBe("Skin: Built-in ▾");
});

test("a skin picked for one level does not follow you into another", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await paintGhostSkin(page);

  await startEditorWithLevel(page, GHOST_LEVEL());
  await chooseFirstGhostSkin(page);
  // The label distinguishes a choice this level made from one it inherited —
  // "Custom" rather than "Default" is what says the choice is the level's own.
  expect(await skinTriggerLabel(page)).toBe("Skin: Custom ▾");

  // A different level, same library, same brush.
  await startEditorWithLevel(page, GHOST_LEVEL());
  await selectGhostBrush(page);
  await expect.poll(() => ghostIsSkinned(page)).toBe(false);
  expect(await skinTriggerLabel(page)).toBe("Skin: Built-in ▾");
});

test("Set as default reaches levels that never chose, and spares one that chose built-in art", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await paintGhostSkin(page);

  // Level 1 picks the skin, then promotes it to the library default.
  await startEditorWithLevel(page, GHOST_LEVEL());
  await chooseFirstGhostSkin(page);
  await clickByText(page, "Editor", "Set as default");
  await clickByText(page, "Editor", "For every level?");

  // A level that never expressed a preference now inherits it — and says so,
  // since a default is exactly the thing that can change under you later.
  await startEditorWithLevel(page, GHOST_LEVEL());
  await selectGhostBrush(page);
  await expect.poll(() => ghostIsSkinned(page)).toBe(true);
  expect(await skinTriggerLabel(page)).toBe("Skin: Default ▾");

  // ...but a level that deliberately chose built-in art is not overruled. That
  // is the whole reason a level's choice is three-state rather than two: there
  // has to be a way to say "no skin here" that outlives someone else's default.
  await clickByText(page, "Editor", "Skin: Default ▾");
  await clickIconWithLabel(page, "Editor", "Built-in art");
  await expect.poll(() => ghostIsSkinned(page)).toBe(false);
  expect(await skinTriggerLabel(page)).toBe("Skin: Built-in ▾");
});
