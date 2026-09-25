import { expect, test, type Page } from "@playwright/test";
import { clickByText, clickIconWithLabel, clickScenePoint, gotoApp, openThings, pixelCanvasBox, startEditorWithLevel, waitForSkinCanvas } from "./support/coords";
import { customDef, seedCustomEntities } from "./support/customEntities";
import { makeArea, makeLevel } from "./support/levels";

/**
 * A thing you invented, walking.
 *
 * Until 2026-09-20 `framePlanFor` returned null for a `custom:` id, so the Skin
 * Creator offered no frames to paint and the runtime never animated one: the
 * four shipped enemies walked and the creature you drew yourself stood still
 * forever.
 *
 * The two halves this pins are the two that can each be true while the other is
 * false. **Painted** — the editor offers four frames and saves them. **Played**
 * — the sprite's texture actually changes during a level, which is the thing a
 * player would notice and the thing "a loop was registered" does not prove.
 *
 * And the half that matters most for everything already saved: a thing with one
 * frame must look exactly as it did and must not start twitching.
 */

const GRID = 32;

async function paintCell(page: Page, cellX: number, cellY: number): Promise<void> {
  const box = await pixelCanvasBox(page, GRID);
  await page.mouse.click(box.left + (cellX + 0.5) * (box.width / GRID), box.top + (cellY + 0.5) * (box.height / GRID));
}

/** Opens an invented thing's Draw tab from the Things grid. */
async function openDrawTab(page: Page, label: string): Promise<void> {
  await openThings(page);
  await clickIconWithLabel(page, "SkinEditor", label);
  await waitForSkinCanvas(page);
}

async function statusText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
      statusText?: { text: string };
    };
    return scene.statusText?.text ?? "";
  });
}

/**
 * Clicks a frame row by its number.
 *
 * Not `clickByText`: that helper wants an *interactive* Text, and a frame row's
 * label is a plain Text drawn over an interactive Rectangle (see
 * `buildFrameStrip`). The label also carries a trailing "·" while the frame is
 * unpainted — which is every frame this test is trying to reach — so an exact
 * match would miss too. Clicking the label's own centre lands on the rectangle
 * behind it, which is what a person does.
 */
async function clickFrame(page: Page, number: number): Promise<void> {
  const point = await page.evaluate((n) => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    type O = { type?: string; text?: string; getBounds?: () => { x: number; y: number; width: number; height: number }; list?: O[] };
    const find = (l: O[]): { x: number; y: number } | null => {
      for (const c of l) {
        if (c.type === "Text" && c.text?.startsWith(`Frame ${n}`)) {
          const b = c.getBounds!();
          return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
        }
        if (c.list) {
          const found = find(c.list);
          if (found) return found;
        }
      }
      return null;
    };
    return find((scene.children.list as unknown as O[]) ?? []);
  }, number);
  if (!point) throw new Error(`no "Frame ${number}" row on screen`);
  await clickScenePoint(page, point.x, point.y);
  await waitForSkinCanvas(page);
}

/**
 * Leaves the Skin Creator before opening a level.
 *
 * `startEditorWithLevel` calls the scene *manager's* `start`, which is not
 * `this.scene.start` — the manager's version leaves the previous scene
 * running. Without this the Editor is built *underneath* a live Skin Creator,
 * its Test Play button sits behind a pixel canvas, and the click lands on
 * nothing. `screen-survey.spec.ts` documents the same trap in its own `open()`,
 * having been caught by it once already.
 */
async function leaveSkinEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const manager = window.__debugGame!.scene;
    for (const active of manager.getScenes(true)) {
      if (active.scene.key !== "Boot") manager.stop(active.scene.key);
    }
  });
}

/** Every frame name the editor is offering, by its button label. */
async function frameLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    type O = { type?: string; text?: string; list?: O[] };
    const out: string[] = [];
    const walk = (l: O[]) => {
      for (const c of l) {
        if (c.type === "Text" && c.text?.startsWith("Frame ")) out.push(c.text.replace(" ·", ""));
        if (c.list) walk(c.list);
      }
    };
    walk((scene.children.list as unknown as O[]) ?? []);
    return out;
  });
}

const BUG = customDef({ id: "custom:bug", name: "Grumble Bug", category: "enemies", basedOn: "enemy-ghost" });

const levelWithBug = () =>
  makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 1, y: 5 },
      { type: "goal", x: 18, y: 5 },
      { type: "custom:bug", x: 10, y: 5 },
    ]),
  );

test("an invented thing is offered the same four frames a shipped enemy gets", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [BUG]);
  await openDrawTab(page, "Grumble Bug");

  // Four, not two, and the same four an enemy-ghost gets — measured to fit
  // beneath the Draw / "What it does" tabs, which share this column.
  expect(await frameLabels(page)).toEqual(["Frame 1", "Frame 2", "Frame 3", "Frame 4"]);

  // The tabs are still there. They used to *occupy* this slot, on the reasoning
  // that a custom had no frame plan — so this is the assertion that the two
  // now stack rather than one having quietly replaced the other.
  const labels = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("SkinEditor");
    type O = { type?: string; text?: string; list?: O[] };
    const out: string[] = [];
    const walk = (l: O[]) => {
      for (const c of l) {
        if (c.type === "Text" && c.text) out.push(c.text);
        if (c.list) walk(c.list);
      }
    };
    walk((scene.children.list as unknown as O[]) ?? []);
    return out;
  });
  expect(labels).toContain("Draw");
  expect(labels).toContain("What it does");
});

test("two painted frames are saved as two frames", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [BUG]);
  await openDrawTab(page, "Grumble Bug");

  await paintCell(page, 8, 8);
  await clickFrame(page, 2);
  await paintCell(page, 20, 20);
  await clickByText(page, "SkinEditor", "Save");

  // The editor says how many it wrote, which is the cheapest honest signal
  // that the second frame was not silently dropped.
  await expect.poll(() => statusText(page), { timeout: 20_000 }).toContain("2 frames");

  const frames = await page.evaluate(async () => {
    const mod = (await import("/src/skins/skinStorage.ts")) as {
      loadCustomSkins(): Promise<Record<string, { items: { frames?: Record<string, string> }[] }>>;
    };
    const all = await mod.loadCustomSkins();
    return Object.keys(all["custom:bug"]?.items?.[0]?.frames ?? {});
  });
  expect(frames.sort()).toEqual(["0", "1"]);
});

test("re-opening a thing brings back every frame, not just the first", async ({ page }) => {
  test.slow();
  // Quiet data loss, one level down from the bug `openCanvasFor` already exists
  // to prevent. That branch re-opens a thing's existing skin rather than a
  // blank one, because a blank would be written over the artwork on the next
  // Save. It restored only the representative frame — right while a thing had
  // one pose, and a way to lose the other three now that it can have four:
  // re-open a walk cycle, see pose one, Save, and poses two to four are gone
  // with nothing said.
  await gotoApp(page);
  await seedCustomEntities(page, [BUG]);
  await openDrawTab(page, "Grumble Bug");

  await paintCell(page, 4, 4);
  await clickFrame(page, 2);
  await paintCell(page, 9, 9);
  await paintCell(page, 9, 10);
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => statusText(page), { timeout: 20_000 }).toContain("2 frames");

  // Out to the grid and back in through the tile — the real path. Back lands
  // on the pick grid inside the Skin Creator, not the Menu, so the tile is
  // clicked directly rather than routed through Things again.
  await clickByText(page, "SkinEditor", "← Back");
  await clickIconWithLabel(page, "SkinEditor", "Grumble Bug");
  await waitForSkinCanvas(page);

  const painted = async (): Promise<number> =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
        pixelCanvas?: { getCells(): (string | null)[] };
      };
      return (scene.pixelCanvas?.getCells() ?? []).filter((c) => c !== null).length;
    });

  // Frame 1 is where it opens, with its one cell.
  await expect.poll(painted, { timeout: 20_000 }).toBe(1);
  // And frame 2 still has its two — the assertion that would have failed.
  await clickFrame(page, 2);
  await expect.poll(painted, { timeout: 20_000 }).toBe(2);
});

test("the invented thing actually changes texture while the level runs", async ({ page }) => {
  test.slow();
  await gotoApp(page);
  await seedCustomEntities(page, [BUG]);
  await openDrawTab(page, "Grumble Bug");

  // Two visibly different frames, so the loop has something to alternate.
  await paintCell(page, 6, 6);
  await clickFrame(page, 2);
  await paintCell(page, 24, 24);
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => statusText(page), { timeout: 20_000 }).toContain("Saved");

  await leaveSkinEditor(page);
  await startEditorWithLevel(page, levelWithBug());
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  /**
   * Recorded per frame from inside the page, for the reason
   * `character-states.spec.ts` learned the hard way on this same date: a loop
   * step is LOOP_FRAME_INTERVAL_MS (180ms), and polling for a transient from
   * the test side samples over a round trip and can step straight past it.
   */
  await page.evaluate(() => {
    const seen = new Set<string>();
    (window as unknown as { __keys?: Set<string> }).__keys = seen;
    const tick = (): void => {
      const scene = window.__debugGame?.scene.getScene("Play") as unknown as
        | { spritesByBrushId?: Map<string, { texture: { key: string } }[]> }
        | undefined;
      for (const s of scene?.spritesByBrushId?.get("custom:bug") ?? []) seen.add(s.texture.key);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Two *distinct* texture keys is the whole claim: the sprite is being swapped
  // between painted frames, not merely registered with a loop that never runs.
  await expect
    .poll(
      () => page.evaluate(() => [...((window as unknown as { __keys?: Set<string> }).__keys ?? [])].length),
      { timeout: 20_000, intervals: [100] },
    )
    .toBeGreaterThan(1);
});

test("a thing with one frame still stands perfectly still", async ({ page }) => {
  test.slow();
  // **The assertion that covers every game already saved.** Every invented
  // thing in existence has exactly one frame, and a creature that started
  // strobing because its author only ever painted once would be a regression
  // for all of them. Guaranteed by advanceLoop holding frame 0 below a count
  // of two — pinned here so it stays guaranteed.
  await gotoApp(page);
  await seedCustomEntities(page, [BUG]);
  await openDrawTab(page, "Grumble Bug");
  await paintCell(page, 10, 10);
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => statusText(page), { timeout: 20_000 }).toContain("Saved");

  await leaveSkinEditor(page);
  await startEditorWithLevel(page, levelWithBug());
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  const keysOver = async (ms: number): Promise<string[]> => {
    const read = () =>
      page.evaluate(() => {
        const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
          spritesByBrushId?: Map<string, { texture: { key: string } }[]>;
        };
        return (scene.spritesByBrushId?.get("custom:bug") ?? []).map((s) => s.texture.key);
      });
    const seen = new Set<string>();
    const until = Date.now() + ms;
    while (Date.now() < until) {
      for (const k of await read()) seen.add(k);
      // The sampling interval of a collector, not a wait for anything to
      // happen — the loop's own deadline decides when it stops.
      await page.waitForTimeout(80);
    }
    return [...seen];
  };

  // Several loop intervals' worth. One key throughout, so nothing is cycling.
  expect(await keysOver(1500)).toHaveLength(1);
});

test("a Large invented enemy is still Large once its loop is running", async ({ page }) => {
  test.slow();
  // The subtle one. A frame swap keeps its display size only because every
  // frame of a skin shares a grid — setDisplaySize scales by the frame's own
  // dimensions, so a differently-sized frame would resize the sprite. The frame
  // textures are the same PNGs as the skin texture here, so it holds; a Large
  // bug snapping to 32px is what breaking it would look like.
  await gotoApp(page);
  await seedCustomEntities(page, [BUG]);
  await openDrawTab(page, "Grumble Bug");
  await paintCell(page, 6, 6);
  await clickFrame(page, 2);
  await paintCell(page, 24, 24);
  await clickByText(page, "SkinEditor", "Save");
  await expect.poll(() => statusText(page), { timeout: 20_000 }).toContain("Saved");

  await leaveSkinEditor(page);
  await startEditorWithLevel(page, {
    ...makeLevel(
      makeArea(20, 8, 6, [
        { type: "player-spawn", x: 1, y: 5 },
        { type: "goal", x: 18, y: 5 },
        { type: "custom:bug", x: 10, y: 5, size: "large" },
      ]),
    ),
  });
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));

  const displayWidth = () =>
    page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
        spritesByBrushId?: Map<string, { displayWidth: number }[]>;
      };
      return scene.spritesByBrushId?.get("custom:bug")?.[0]?.displayWidth ?? 0;
    });

  const before = await displayWidth();
  expect(before, "a Large enemy should be well above one tile").toBeGreaterThan(32);
  // Past several loop steps, so the frame swap has certainly happened.
  await page.waitForTimeout(1200);
  expect(await displayWidth()).toBeCloseTo(before, 0);
});
