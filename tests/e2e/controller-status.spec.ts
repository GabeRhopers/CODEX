import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, startEditorWithLevel } from "./support/coords";
import { installFakePad, plugIn, removeGamepadApi } from "./support/gamepad";
import { makeArea, makeLevel } from "./support/levels";

/**
 * Whether the console admits it can see your controller.
 *
 * **This file is a dead end made visible.** A controller paired to a tablet, a
 * level playing, nothing happening — and nowhere on screen to learn either of
 * the two things that would explain it: that browsers hide a gamepad from a
 * page until a button is pressed on one, or that some web views have no Gamepad
 * API at all. `padConnected` had exactly one caller in the codebase, on the
 * *published game's* title screen, so the place you actually discover a dead
 * controller was the one place that never mentioned controllers.
 *
 * The distinction these tests defend is between "none connected" and "this
 * browser cannot". Both are silence to the code — every read guards with
 * `?.()` — and to a person holding a controller they could not be more
 * different: one is solved by pressing a button and the other never will be.
 */

const LEVEL = () =>
  makeLevel(
    makeArea(20, 12, 10, [
      { type: "player-spawn", x: 6, y: 9 },
      { type: "goal", x: 19, y: 2 },
    ]),
  );

/** Every string the play screen is drawing. */
const labels = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play");
    type O = { type?: string; text?: string; list?: O[] };
    const out: string[] = [];
    const walk = (l: O[]): void => {
      for (const c of l) {
        if (c.type === "Text" && c.text) out.push(c.text);
        if (c.list) walk(c.list);
      }
    };
    walk((scene.children.list as unknown as O[]) ?? []);
    return out;
  });

/** The one line in the left band that talks about controllers. */
const statusLine = async (page: Page): Promise<string> =>
  (await labels(page)).find((t) => t.startsWith("CONTROLLER")) ?? "";

async function play(page: Page): Promise<void> {
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
  await page.waitForTimeout(300);
}

test("with no controller seen, it says which button to press", async ({ page }) => {
  test.slow();
  // **The case that prompted all of this.** A real browser hides a paired
  // controller until a button is pressed on it, so this is what somebody
  // holding one actually sees — and "no controller connected" would be true,
  // useless, and a dead end. The line has to say what to do.
  await installFakePad(page, 0);
  await play(page);

  await expect.poll(() => statusLine(page), { timeout: 10_000 }).toContain("PRESS A BUTTON");
});

test("a controller appearing mid-level flips the line and says its name", async ({ page }) => {
  test.slow();
  // The reveal-on-press moment itself: the player presses a button, the browser
  // stops hiding the pad, and the console has to notice without a reload. The
  // name is there so "which controller is this?" has an answer on screen.
  await installFakePad(page, 0);
  await play(page);
  await expect.poll(() => statusLine(page), { timeout: 10_000 }).toContain("PRESS A BUTTON");

  await plugIn(page, "Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 02ea)");

  await expect.poll(() => statusLine(page), { timeout: 10_000 }).toContain("READY");
  expect(await statusLine(page), "and it stops telling them to press anything").not.toContain("PRESS A BUTTON");
  // Trimmed at the bracket — the vendor ids are not something anybody is
  // holding. See padName.
  await expect.poll(() => labels(page), { timeout: 10_000 }).toContain("Controller ready · Xbox Wireless Controller");
});

test("a browser with no Gamepad API says so, instead of blaming the player", async ({ page }) => {
  test.slow();
  // Pressing a button is exactly what will not help here, so saying it would
  // send somebody off doing the one thing that cannot work — which is worse
  // than saying nothing. Real on every third-party iPad browser, all of which
  // are WKWebViews.
  await removeGamepadApi(page);
  await play(page);

  const line = await statusLine(page);
  expect(line).toContain("NOT IN THIS BROWSER");
  expect(line, "it must not ask for a press that cannot be seen").not.toContain("PRESS A BUTTON");
});

test("two controllers are counted, because co-op cares which", async ({ page }) => {
  test.slow();
  await installFakePad(page, 2);
  await play(page);

  await expect.poll(() => statusLine(page), { timeout: 10_000 }).toContain("2 READY");
});
