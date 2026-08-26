import { expect, test, type Page } from "@playwright/test";
import { clickByText, gotoApp, startEditorWithLevel } from "./support/coords";
import { makeArea, makeLevel } from "./support/levels";

/**
 * Test Play's handheld shell: D-pad left of the screen, four face buttons right
 * of it.
 *
 * The controls used to float over the playfield as translucent circles. They
 * don't need to: PlayScene's camera never scrolls and every level is exactly
 * GRID_COLS wide, so the level always occupies the same rectangle and the bands
 * either side of it were already empty. The second test is the one that keeps
 * that true — if a control ever creeps back over the screen, the framing has
 * stopped being free and has started costing playfield.
 */

/** Matches HandheldShell.SCREEN_RECT and TouchControls' own sizes. Duplicated
 * rather than imported because those modules pull in Phaser, which has no
 * business loading in the test process — and a stale copy fails loudly here
 * rather than silently passing. */
const SCREEN = { x: 190, y: 56, width: 640, height: 384 };
/** Sized rather than positioned, so the overlap test below stays a real check
 * instead of selecting only the controls it expects to pass. The Play HUD's
 * volume knob is also an interactive Arc, which is what this excludes. */
const DPAD_ARM = 34;
const FACE_RADIUS = 26;

const LEVEL = () =>
  makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 2, y: 5 },
      { type: "goal", x: 18, y: 5 },
      { type: "item-thunder-hat", x: 6, y: 5 },
    ]),
  );

interface ControlBox {
  kind: "dpad" | "face";
  x: number;
  y: number;
  halfWidth: number;
  halfHeight: number;
}

/** Every interactive control in the Play scene, in scene coordinates. Read off
 * the live display list rather than hardcoded, so the test follows the layout
 * instead of pinning it. */
async function controls(page: Page): Promise<ControlBox[]> {
  return page.evaluate(
    ({ arm, radius }) => {
      const scene = window.__debugGame!.scene.getScene("Play");
      const out: ControlBox[] = [];
      for (const child of scene.children.list) {
        const o = child as unknown as {
          type?: string;
          input?: { enabled?: boolean };
          x?: number;
          y?: number;
          width?: number;
          height?: number;
          radius?: number;
        };
        if (!o.input?.enabled) continue;
        if (o.type === "Rectangle" && o.width === arm) {
          out.push({ kind: "dpad", x: o.x!, y: o.y!, halfWidth: o.width! / 2, halfHeight: o.height! / 2 });
        } else if (o.type === "Arc" && o.radius === radius) {
          out.push({ kind: "face", x: o.x!, y: o.y!, halfWidth: o.radius, halfHeight: o.radius });
        }
      }
      return out;
    },
    { arm: DPAD_ARM, radius: FACE_RADIUS },
  ) as Promise<ControlBox[]>;
}

/** Scene point -> page point, the same conversion coords.ts does internally. */
async function toPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ x, y }) => {
      const game = window.__debugGame!;
      const rect = game.canvas.getBoundingClientRect();
      const scale = game.scale.displayScale;
      return { x: rect.left + x / scale.x, y: rect.top + y / scale.y };
    },
    { x, y },
  );
}

async function holdControl(page: Page, point: { x: number; y: number }, ms: number): Promise<void> {
  const p = await toPage(page, point.x, point.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

const playerX = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { player?: { x: number } };
    return scene.player?.x ?? 0;
  });

const touchState = (page: Page): Promise<{ left: boolean; right: boolean; jump: boolean; attack: boolean }> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
      touch: { get(): { left: boolean; right: boolean; jump: boolean; attack: boolean } };
    };
    return scene.touch.get();
  });

async function startPlay(page: Page): Promise<void> {
  await gotoApp(page);
  await startEditorWithLevel(page, LEVEL());
  await clickByText(page, "Editor", "Test Play (Space)");
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Play"));
}

test("the D-pad and face buttons actually drive the player", async ({ page }) => {
  test.slow();
  await startPlay(page);

  const all = await controls(page);
  const dpad = all.filter((c) => c.kind === "dpad");
  const face = all.filter((c) => c.kind === "face");
  // Three live D-pad arms (Down is drawn but inert — this game has no duck)
  // and four face buttons.
  expect(dpad).toHaveLength(3);
  expect(face).toHaveLength(4);

  const right = dpad.reduce((a, b) => (a.x > b.x ? a : b));
  const startX = await playerX(page);
  await holdControl(page, right, 700);
  expect(await playerX(page)).toBeGreaterThan(startX + 20);

  // The two jump buttons are the pair nearest the thumb — rightmost and
  // lowest. Pressing one has to set `jump`, whichever it is.
  const jumpButton = face.reduce((a, b) => (a.x > b.x ? a : b));
  const p = await toPage(page, jumpButton.x, jumpButton.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  expect((await touchState(page)).jump).toBe(true);
  await page.mouse.up();
  expect((await touchState(page)).jump).toBe(false);
});

test("no control overlaps the screen, which is what makes the framing free", async ({ page }) => {
  test.slow();
  await startPlay(page);

  const screenRight = SCREEN.x + SCREEN.width;
  const screenBottom = SCREEN.y + SCREEN.height;
  for (const c of await controls(page)) {
    const left = c.x - c.halfWidth;
    const right = c.x + c.halfWidth;
    const top = c.y - c.halfHeight;
    const bottom = c.y + c.halfHeight;
    // Entirely to one side of the screen rect, or entirely above/below it.
    const clear = right <= SCREEN.x || left >= screenRight || bottom <= SCREEN.y || top >= screenBottom;
    expect(clear, `control at (${c.x}, ${c.y}) overlaps the screen`).toBe(true);
  }
});

test("the shock buttons stay inert until the Thunder Hat is collected", async ({ page }) => {
  test.slow();
  await startPlay(page);

  const face = (await controls(page)).filter((c) => c.kind === "face");
  // The far pair: leftmost and topmost.
  const shock = face.reduce((a, b) => (a.x < b.x ? a : b));

  const p = await toPage(page, shock.x, shock.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  // Pressed, but there is nothing to fire yet — a button that reported a press
  // it can't act on would be worse than one that says nothing.
  expect((await touchState(page)).attack).toBe(false);
  await page.mouse.up();

  // Walk right onto the Thunder Hat.
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("Play") as unknown as {
            stats?: { hasThunderHat: boolean };
          };
          return scene.stats?.hasThunderHat ?? false;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
  await page.keyboard.up("ArrowRight");

  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  expect((await touchState(page)).attack).toBe(true);
  await page.mouse.up();
});
