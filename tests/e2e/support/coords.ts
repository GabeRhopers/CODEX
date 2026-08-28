import type { Page } from "@playwright/test";
import type Phaser from "phaser";
import type { LevelData } from "../../../src/level/LevelSchema";
import { installMockDrive } from "./mockDrive";

// Everything this app renders lives on one <canvas> — there's no DOM to
// query against, so every click needs a scene-space -> page-space
// coordinate. Rather than hardcoding EditorUI's own button-layout math
// (which would silently drift out of sync with src/editor/EditorUI.ts on
// the next layout change), these helpers ask the page's own live game
// instance for real positions at run time.

declare global {
  interface Window {
    __debugGame?: Phaser.Game;
  }
}

const GRID_ORIGIN_X = 190; // LEFT_PANEL_WIDTH — src/config/gameConfig.ts
const GRID_ORIGIN_Y = 56; // HEADER_HEIGHT — src/config/gameConfig.ts
const TILE_SIZE = 32; // src/config/gameConfig.ts

/** Waits for the dev-only __debugGame hook (see main.ts) to exist — the
 * very first thing every spec needs after navigating. */
export async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__debugGame);
}

/** Converts a scene-space (game logical pixel) point into a page-space
 * (CSS pixel) point, accounting for Phaser's FIT-mode letterboxing/scale —
 * see gameConfig's `scale` block in main.ts. Reads the *live* canvas
 * bounds and scale factor rather than assuming any fixed viewport size, so
 * this stays correct regardless of the Playwright viewport used. */
async function sceneToPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ({ x, y }) => {
      const game = window.__debugGame!;
      const rect = game.canvas.getBoundingClientRect();
      // Phaser's own ScaleManager defines displayScale as
      // baseSize/canvasBounds (game-space per canvas-space pixel) — see
      // node_modules/phaser/src/scale/ScaleManager.js's `resize()`
      // (`this.displayScale.set(baseSize.width/canvasBounds.width, ...)`)
      // and its own inverse `transformX`/`transformY` pointer mappers
      // (`gameX = (pageX - canvasBounds.left) * displayScale.x`) — so
      // going the other way (game -> page, what a click needs) divides
      // rather than multiplies.
      const scale = game.scale.displayScale;
      return { x: rect.left + x / scale.x, y: rect.top + y / scale.y };
    },
    { x, y },
  );
}

export async function clickScenePoint(page: Page, x: number, y: number): Promise<void> {
  const point = await sceneToPage(page, x, y);
  await page.mouse.click(point.x, point.y);
}

/** Mouse-down at one scene point, mouse-move to another, mouse-up — for
 * drag interactions (the Hand tool's grab/move). */
export async function dragScenePoints(page: Page, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  const start = await sceneToPage(page, from.x, from.y);
  const end = await sceneToPage(page, to.x, to.y);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
}

/** Absolute scene-space center of tile (tileX, tileY) — the literal
 * contract EditorScene's own pointerdown handler inverts
 * (`tileX = Math.floor((pointer.x - GRID_ORIGIN_X) / TILE_SIZE)`), not an
 * incidental UI detail, so hardcoding it here (unlike the header buttons
 * below) is safe. */
export function tileCenter(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: GRID_ORIGIN_X + tileX * TILE_SIZE + TILE_SIZE / 2,
    y: GRID_ORIGIN_Y + tileY * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** How long a target may take to appear before a click gives up. Generous
 * because CI runs the game on software WebGL, where every build step —
 * scene rebuilds, image decodes, texture uploads — takes several times
 * longer than it does locally. */
const TARGET_TIMEOUT_MS = 15_000;

/** Finds a Phaser Text GameObject anywhere in `sceneKey`'s display list
 * (recursing into Containers, since EditorUI's palette icon grid is one)
 * whose rendered `.text` exactly matches, and clicks its center. This is
 * how every header/palette button gets clicked — by its rendered label,
 * not a hardcoded x/y — so specs survive future EditorUI.ts layout
 * changes.
 *
 * Waits for the target rather than demanding it already exist. Several of
 * these screens paint themselves from an async chain — SkinEditorScene's
 * browse list is `listPixelSkins().then(async ...)` with a further
 * `await resolveSkinThumbnails(...)` per brush inside it, so its rows (and
 * their Edit/Delete buttons) appear some way after the click that asked
 * for them. Asserting existence at the instant of the call passed locally
 * and failed on CI, which is a race in the observation, not in the app.
 * Still throws with the same message once the wait expires, so a genuinely
 * wrong label or scene fails loudly instead of silently clicking (0,0). */
export async function clickByText(page: Page, sceneKey: string, text: string): Promise<void> {
  const point = await waitForScenePoint(
    page,
    ({ sceneKey, text }) => {
      const game = window.__debugGame!;
      const scene = game.scene.getScene(sceneKey);
      if (!scene) return null;
      type Bounds = { x: number; y: number; width: number; height: number };
      type Listable = { list?: Listable[]; type?: string; text?: string; getBounds?: () => Bounds };
      // The *centre of the rendered bounds*, not the object's own x/y —
      // those coincide only for origin (0.5, 0.5). Several buttons here use
      // origin (0, 0.5) or the default (0, 0), where x/y is an edge or a
      // corner and a click there lands on the boundary and can miss
      // entirely (SkinEditorScene's "+ New Skin" and "← Back" both did).
      const centreOf = (child: Listable): { x: number; y: number } | null => {
        const b = child.getBounds?.();
        return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
      };
      const search = (list: Listable[]): { x: number; y: number } | null => {
        for (const child of list) {
          if (child.type === "Text" && child.text === text) {
            const centre = centreOf(child);
            if (centre) return centre;
          }
          if (child.list) {
            const found = search(child.list);
            if (found) return found;
          }
        }
        return null;
      };
      return search((scene.children.list as unknown as Listable[]) ?? []);
    },
    { sceneKey, text },
    `clickByText: no Text "${text}" found in scene "${sceneKey}"`,
  );
  await clickScenePoint(page, point.x, point.y);
}

/** Polls `predicate` inside the page until it returns a point, then hands
 * it back — Playwright's own rAF-driven waiting rather than a sleep loop.
 * On expiry it throws `message`, the same text the callers used to throw
 * immediately, so failures still name the label and scene rather than
 * surfacing as an anonymous timeout. */
async function waitForScenePoint<A>(
  page: Page,
  predicate: (arg: A) => { x: number; y: number } | null,
  arg: A,
  message: string,
): Promise<{ x: number; y: number }> {
  try {
    const handle = await page.waitForFunction(predicate, arg, { timeout: TARGET_TIMEOUT_MS });
    return await handle.jsonValue();
  } catch {
    throw new Error(message);
  }
}

/** Finds an Image immediately paired with a Text label (EditorUI's
 * `iconGrid.add([icon, label])` pattern — every palette brush icon and
 * every skin-thumbnail icon follows it) whose label matches, and clicks
 * the icon itself (only the icon, not the label below it, is
 * `setInteractive` — see EditorUI.renderIconGrid). This is how palette
 * brushes (Grass, Spawn, Goal, Checkpoint, Basket (Down)/(Up), enemies,
 * items) get selected by their real, clickable target. */
export async function clickIconWithLabel(page: Page, sceneKey: string, label: string): Promise<void> {
  const point = await waitForScenePoint(
    page,
    ({ sceneKey, label }) => {
      const scene = window.__debugGame!.scene.getScene(sceneKey);
      if (!scene) return null;
      type Bounds = { x: number; y: number; width: number; height: number };
      type Listable = { list?: Listable[]; type?: string; text?: string; getBounds?: () => Bounds };
      const search = (list: Listable[]): { x: number; y: number } | null => {
        for (let i = 0; i < list.length; i++) {
          const child = list[i];
          if (child.type === "Text" && child.text === label && i > 0 && list[i - 1].type === "Image") {
            // Bounds centre rather than x/y, for the same origin reason
            // documented in clickByText above.
            const b = list[i - 1].getBounds?.();
            if (b) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
          }
          if (child.list) {
            const found = search(child.list);
            if (found) return found;
          }
        }
        return null;
      };
      return search((scene.children.list as unknown as Listable[]) ?? []);
    },
    { sceneKey, label },
    `clickIconWithLabel: no icon+label "${label}" found in scene "${sceneKey}"`,
  );
  await clickScenePoint(page, point.x, point.y);
}

/**
 * Clicks the small "x" delete badge on an asset picker's tile for `label`.
 *
 * The badge is a bare interactive Rectangle rather than the icon+label pair
 * `clickIconWithLabel` looks for (AssetPickerMenu draws it above and to the
 * right of the tile's icon), so it has no text to find it by. Rather than
 * hardcoding AssetPickerMenu's badge offsets here — where they would silently
 * rot the moment the picker's layout changed — this finds the tile by its label
 * and then takes the interactive Rectangle nearest that tile's top-right
 * corner, which is what the badge *is* regardless of the exact numbers.
 */
export async function clickDeleteBadgeFor(page: Page, sceneKey: string, label: string): Promise<void> {
  const point = await waitForScenePoint(
    page,
    ({ sceneKey, label }) => {
      const scene = window.__debugGame!.scene.getScene(sceneKey);
      if (!scene) return null;
      type Bounds = { x: number; y: number; width: number; height: number };
      type Listable = {
        list?: Listable[];
        type?: string;
        text?: string;
        input?: unknown;
        getBounds?: () => Bounds;
      };

      const flat: Listable[] = [];
      const walk = (list: Listable[]) => {
        for (const child of list) {
          flat.push(child);
          if (child.list) walk(child.list);
        }
      };
      walk((scene.children.list as unknown as Listable[]) ?? []);

      // The tile: the nearest Image *before* the Text label. Not simply the
      // preceding entry, the way clickIconWithLabel assumes — the picker draws
      // a highlight Rectangle between the icon and its label for whichever tile
      // is currently active, and the tile being deleted is very often that one.
      let tile: Bounds | null = null;
      for (let i = 1; i < flat.length && !tile; i++) {
        if (flat[i].type !== "Text" || flat[i].text !== label) continue;
        for (let j = i - 1; j >= 0 && i - j <= 3; j--) {
          if (flat[j].type === "Image") {
            tile = flat[j].getBounds?.() ?? null;
            break;
          }
        }
      }
      if (!tile) return null;

      const cornerX = tile.x + tile.width;
      const cornerY = tile.y;
      let best: { x: number; y: number; distance: number } | null = null;
      for (const child of flat) {
        if (child.type !== "Rectangle" || !child.input) continue;
        const b = child.getBounds?.();
        if (!b) continue;
        const x = b.x + b.width / 2;
        const y = b.y + b.height / 2;
        const distance = Math.hypot(x - cornerX, y - cornerY);
        if (!best || distance < best.distance) best = { x, y, distance };
      }
      // Guards against picking up some unrelated Rectangle elsewhere on screen
      // when the badge simply isn't there (a non-deletable tile).
      if (!best || best.distance > Math.max(tile.width, tile.height)) return null;
      return { x: best.x, y: best.y };
    },
    { sceneKey, label },
    `clickDeleteBadgeFor: no delete badge beside "${label}" found in scene "${sceneKey}"`,
  );
  await clickScenePoint(page, point.x, point.y);
}

/** Opens EditorUI's category dropdown (its chip always reads
 * "<current label> ▾" — see EditorUI.chipLabel) and clicks the row for
 * `label`, exactly the two real clicks a designer makes to change tabs. */
export async function selectPaletteCategory(
  page: Page,
  sceneKey: string,
  label: "Blocks" | "Markers" | "Enemies" | "Items" | "Decor",
): Promise<void> {
  const chipPoint = await page.evaluate((sceneKey) => {
    const scene = window.__debugGame!.scene.getScene(sceneKey);
    if (!scene) return null;
    type Listable = { list?: Listable[]; type?: string; text?: string; x?: number; y?: number };
    const search = (list: Listable[]): { x: number; y: number } | null => {
      for (const child of list) {
        if (child.type === "Text" && typeof child.text === "string" && child.text.endsWith(" ▾")) {
          return { x: child.x ?? 0, y: child.y ?? 0 };
        }
        if (child.list) {
          const found = search(child.list);
          if (found) return found;
        }
      }
      return null;
    };
    return search((scene.children.list as unknown as Listable[]) ?? []);
  }, sceneKey);
  if (!chipPoint) throw new Error(`selectPaletteCategory: category chip not found in scene "${sceneKey}"`);
  await clickScenePoint(page, chipPoint.x, chipPoint.y);
  await clickByText(page, sceneKey, label);
}

/** Reads whichever text is currently showing in EditorUI's status line —
 * used by the missing-basket-pair Test Play gate spec. Mirrors clickByText's
 * search but returns the first Text whose content starts with `prefix`
 * instead of an exact match, since status messages are full sentences. */
export async function readStatusText(page: Page, sceneKey: string, prefix: string): Promise<string | null> {
  return page.evaluate(
    ({ sceneKey, prefix }) => {
      const game = window.__debugGame!;
      const scene = game.scene.getScene(sceneKey);
      if (!scene) return null;
      type Listable = { list?: Listable[]; type?: string; text?: string };
      const search = (list: Listable[]): string | null => {
        for (const child of list) {
          if (child.type === "Text" && typeof child.text === "string" && child.text.startsWith(prefix)) return child.text;
          if (child.list) {
            const found = search(child.list);
            if (found) return found;
          }
        }
        return null;
      };
      return search((scene.children.list as unknown as Listable[]) ?? []);
    },
    { sceneKey, prefix },
  );
}

/** Standard spec entry point: installs the mocked Drive/auth backend,
 * seeds an active profile (skipping the profile-picker clicks, which are
 * orthogonal to what every spec below actually tests), navigates, and
 * waits for the real ProfileGateScene -> MenuScene boot chain to settle —
 * exercising that real boot path (with mocked Drive) on every spec run. */
export async function gotoApp(page: Page, profile: "Mike" | "Gabriel" | "Andressa" = "Mike"): Promise<void> {
  await installMockDrive(page);
  await page.addInitScript((profileName) => localStorage.setItem("rhopers:profile", profileName), profile);
  await page.goto("/");
  await waitForGame(page);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Menu"));
}

/**
 * Boots the app the way a genuinely new visitor arrives: mocked Drive, but
 * **no profile seeded**, so ProfileGateScene actually renders its picker
 * instead of waving you through to the Menu.
 *
 * Deliberately a separate function rather than an option on `gotoApp`. The
 * difference is not just the missing `setItem` — `addInitScript` re-runs on
 * *every* navigation, so a spec that clears the profile and reloads would have
 * `gotoApp` quietly put it back, and the tests that matter most here (Switch
 * profile, the legacy-key migration) would pass while proving nothing.
 *
 * Waits for ProfileGate rather than Menu for the same reason: with no profile
 * stored, Menu is exactly what must *not* happen.
 */
export async function gotoAppWithoutProfile(page: Page): Promise<void> {
  await installMockDrive(page);
  await page.goto("/");
  await waitForGame(page);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("ProfileGate"));
}

/** Jumps straight into EditorScene with a pre-built LevelData — for specs
 * that need specific content (basket pairs, a checkpoint in Sub) without
 * painting a large ground layer via real clicks first, which would be
 * slow, brittle, and orthogonal to what those specs are actually testing.
 * Must be called after gotoApp (Menu must be active first, matching how a
 * real "New Level"/"My Levels" click would reach EditorScene). */
export async function startEditorWithLevel(page: Page, level: LevelData): Promise<void> {
  await page.evaluate((level) => window.__debugGame!.scene.start("Editor", { level }), level);
  await page.waitForFunction(() => window.__debugGame!.scene.isActive("Editor"));
}

/** Reads a scene's own instance state via bracket-notation access to
 * private fields — the same "call scene methods/read scene fields
 * directly through the debug hook" pattern used throughout this session's
 * earlier manual verification passes. TS privacy is compile-time only, so
 * this is a legitimate (if blunt) way for a test to read state a real
 * player can't see directly but that determines what they *do* see. */
export async function readSceneField<T>(page: Page, sceneKey: string, field: string): Promise<T> {
  return page.evaluate(
    ({ sceneKey, field }) => {
      const scene = window.__debugGame!.scene.getScene(sceneKey) as unknown as Record<string, unknown>;
      return scene[field] as T;
    },
    { sceneKey, field },
  );
}

/**
 * Waits for the Skin Creator's painting canvas to exist, and on timeout says
 * *why* it doesn't.
 *
 * Opening a saved skin decodes its PNG back into cells before the canvas is
 * built (SkinEditorScene.openForEditing), and every way that can go wrong —
 * a decode that rejects, a mode switch mid-await — leaves the scene sitting
 * quietly in browse mode. A bare waitForFunction reports that as an anonymous
 * 20-second timeout, which is exactly enough information to be useless, and is
 * how a CI-only failure here first surfaced. This reports the scene's mode and
 * its status line instead, so the next occurrence names itself.
 */
export async function waitForSkinCanvas(page: Page, timeout = 20_000): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as { pixelCanvas?: unknown };
        return !!scene.pixelCanvas;
      },
      undefined,
      { timeout },
    );
  } catch {
    const state = await page.evaluate(() => {
      const scene = window.__debugGame!.scene.getScene("SkinEditor") as unknown as {
        mode?: string;
        statusText?: { text?: string };
        target?: { brush?: { id?: string }; existingId?: string };
      };
      return {
        mode: scene.mode ?? "(none)",
        status: scene.statusText?.text ?? "(empty)",
        targetBrush: scene.target?.brush?.id ?? "(none)",
        targetId: scene.target?.existingId ?? "(none)",
      };
    });
    throw new Error(
      `Skin Creator never entered canvas mode within ${timeout}ms. ` +
        `mode=${state.mode} status="${state.status}" target=${state.targetBrush}/${state.targetId}`,
    );
  }
}
