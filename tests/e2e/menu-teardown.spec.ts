import { expect, test, type Page } from "@playwright/test";
import { gotoApp } from "./support/coords";

/**
 * Leaving the Menu while it is still reading from Drive.
 *
 * **The Menu is the one screen whose whole job is to be left**, and both of its
 * status lines are a Drive round trip. Nothing stopped somebody tapping a card
 * mid-read, and when that happened the resolve went on to `setText` a Text
 * whose canvas the shutdown had already destroyed. Phaser threw deep inside
 * `Frame.updateUVs`:
 *
 *     TypeError: Cannot read properties of null (reading 'drawImage')
 *
 * Uncaught, on an ordinary boot, and completely invisible — the game carries on
 * because the scene it broke is already dead. It was found by reading a console
 * during an unrelated investigation, which is the only way it could have been
 * found: no assertion anywhere was watching, and nothing on screen was wrong.
 *
 * That is what this file is really guarding — not one `setText`, but the rule
 * that an uncaught exception is never acceptable, even a harmless-looking one,
 * because the next one will not be harmless and will hide in the same console.
 */

/** Every uncaught error the page threw, which is the whole assertion. */
function watchForThrows(page: Page): string[] {
  const thrown: string[] = [];
  page.on("pageerror", (e) => thrown.push(e.message));
  return thrown;
}

/** What the two status lines say before their reads land. */
const subtitles = (page: Page): Promise<string[]> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Menu");
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

test("leaving the Menu mid-read throws nothing", async ({ page }) => {
  test.slow();
  const thrown = watchForThrows(page);
  await gotoApp(page);

  // **The precondition, asserted rather than assumed.** If the reads had
  // already landed, leaving could not catch them in flight and this would pass
  // for the wrong reason — which is exactly how the bug survived until now.
  // "Checking…" is what both lines say until their list() resolves.
  const before = (await subtitles(page)).join(" | ");
  expect(before, "the Drive reads must still be in flight, or this proves nothing").toContain("Checking");

  // Leave the way tapping a card does: through the Menu scene's *own* plugin,
  // which shuts this scene down. Driving it off `game.scene` instead starts the
  // next scene while leaving the Menu alive — which is a different thing
  // entirely, and the first draft of this test did exactly that and passed with
  // the guards removed.
  await page.evaluate(() => {
    const menu = window.__debugGame!.scene.getScene("Menu");
    menu.scene.start("LevelBrowser");
  });

  // An absence: there is no event for "the resolve landed and did not throw",
  // so this waits out the read it is racing. Generous because the throw came
  // from a Drive round trip, not from a frame.
  await page.waitForTimeout(2500);

  expect(thrown, "a scene torn down mid-read must not throw").toEqual([]);
});
