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
/** HandheldShell.START_WIDTH — the Start pill is the only interactive
 * Rectangle this wide, which is how the pause tests find it. */
const START_WIDTH = 74;

const LEVEL = () =>
  makeLevel(
    makeArea(20, 8, 6, [
      { type: "player-spawn", x: 2, y: 5 },
      { type: "goal", x: 18, y: 5 },
      { type: "item-thunder-hat", x: 6, y: 5 },
    ]),
  );

interface ControlBox {
  kind: "dpad" | "face" | "start";
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
    ({ arm, radius, start }) => {
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
        } else if (o.type === "Rectangle" && o.width === start) {
          out.push({ kind: "start", x: o.x!, y: o.y!, halfWidth: o.width! / 2, halfHeight: o.height! / 2 });
        }
      }
      return out;
    },
    { arm: DPAD_ARM, radius: FACE_RADIUS, start: START_WIDTH },
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

/** The Start pill's scene coordinates. */
async function startButton(page: Page): Promise<{ x: number; y: number }> {
  return page.evaluate((width) => {
    const scene = window.__debugGame!.scene.getScene("Play");
    for (const child of scene.children.list) {
      const o = child as unknown as { type?: string; input?: { enabled?: boolean }; x?: number; y?: number; width?: number };
      if (o.input?.enabled && o.type === "Rectangle" && o.width === width) return { x: o.x!, y: o.y! };
    }
    throw new Error("no Start button on the display list");
  }, START_WIDTH) as Promise<{ x: number; y: number }>;
}

async function clickStart(page: Page): Promise<void> {
  const b = await startButton(page);
  const p = await toPage(page, b.x, b.y);
  await page.mouse.click(p.x, p.y);
}

/** Whether the physics world is frozen — the thing that actually stops the
 * level, as opposed to the flag that only stops update(). */
const physicsPaused = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play") as unknown as { physics: { world: { isPaused: boolean } } };
    return scene.physics.world.isPaused;
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

test("Start clears the button clusters, so a thumb can tell them apart", async ({ page }) => {
  test.slow();
  await startPlay(page);

  // Start used to sit below the face buttons with a 7px gap to the lower jump
  // button — close enough that one thumb press hit both. Nothing in the suite
  // noticed, because the only spatial check was against the *screen*.
  //
  // The check is between *clusters*, not between every pair of controls: the
  // D-pad's five squares deliberately touch (that is what makes it read as one
  // cross) and the face diamond's buttons sit a deliberate ~10px apart. Those
  // are single physical parts. What must not crowd is one part against another.
  const MIN_GAP = 16;
  const all = await controls(page);
  expect(all.length).toBeGreaterThanOrEqual(8); // 3 live D-pad arms + 4 face + Start

  const bounds = (kind: ControlBox["kind"]) => {
    const group = all.filter((c) => c.kind === kind);
    expect(group.length, `no ${kind} controls found`).toBeGreaterThan(0);
    return {
      kind,
      left: Math.min(...group.map((c) => c.x - c.halfWidth)),
      right: Math.max(...group.map((c) => c.x + c.halfWidth)),
      top: Math.min(...group.map((c) => c.y - c.halfHeight)),
      bottom: Math.max(...group.map((c) => c.y + c.halfHeight)),
    };
  };

  const clusters = [bounds("dpad"), bounds("face"), bounds("start")];
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i];
      const b = clusters[j];
      // Positive on either axis means they are genuinely apart.
      const gap = Math.max(
        Math.max(a.left - b.right, b.left - a.right),
        Math.max(a.top - b.bottom, b.top - a.bottom),
      );
      expect(gap, `the ${a.kind} and ${b.kind} clusters are only ${gap.toFixed(0)}px apart`).toBeGreaterThanOrEqual(
        MIN_GAP,
      );
    }
  }
});

test("Start freezes the level, and pressing it again resumes it", async ({ page }) => {
  test.slow();
  await startPlay(page);

  await clickStart(page);
  // The flag alone would be a weak assertion: Arcade integrates gravity on its
  // own timer, so a "pause" that only short-circuits update() still lets the
  // player fall. Assert the world is frozen, and that holding Right genuinely
  // moves nothing.
  expect(await physicsPaused(page)).toBe(true);
  const frozenX = await playerX(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(500);
  expect(await playerX(page)).toBe(frozenX);

  await clickStart(page);
  expect(await physicsPaused(page)).toBe(false);
  await page.waitForTimeout(500);
  await page.keyboard.up("ArrowRight");
  expect(await playerX(page)).toBeGreaterThan(frozenX + 20);
});

test("Start is refused once the run is over, so no pause lands on the win screen", async ({ page }) => {
  test.slow();
  await startPlay(page);

  // Walk into the goal.
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = window.__debugGame!.scene.getScene("Play") as unknown as { outcome?: string };
          return scene.outcome ?? "";
        }),
      { timeout: 20_000 },
    )
    .toBe("won");
  await page.keyboard.up("ArrowRight");

  // Winning pauses physics itself. Start must not un-pause it, or the world
  // would restart underneath the "You Win" banner.
  expect(await physicsPaused(page)).toBe(true);
  await clickStart(page);
  expect(await physicsPaused(page)).toBe(true);
  const overlayVisible = await page.evaluate(() => {
    const scene = window.__debugGame!.scene.getScene("Play");
    return scene.children.list.some(
      (c) => (c as unknown as { text?: string; visible?: boolean }).text === "PAUSED" && (c as unknown as { visible?: boolean }).visible === true,
    );
  });
  expect(overlayVisible).toBe(false);
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
