import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// The sandboxed dev environment this project has been built in ships a
// pre-installed Chromium at a fixed path and deliberately blocks
// `playwright install` from re-fetching one (see the repo's own session
// notes) — pointing launchOptions at it directly when present avoids that
// download entirely. CI (see .github/workflows/deploy-pages.yml) has no
// such path, installs its own via `npx playwright install`, and this
// simply falls through to Playwright's normal browser resolution there.
const SANDBOX_CHROMIUM = "/opt/pw-browsers/chromium";
const executablePath = existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined;

const PORT = 5183;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // One worker: every spec drives the same kind of Phaser canvas app
  // through real pointer/keyboard input on one page at a time, and
  // several specs (basket pairing, checkpoints) share timing-sensitive
  // physics — parallel workers on one machine would contend for CPU while
  // software WebGL renders, which is the one change that could plausibly
  // make those specs *worse*.
  //
  // This used to add "for no speed win worth it at this suite's current
  // size", which stopped being true at 171 tests and ~30 minutes. The wall
  // clock is answered by sharding CI across three runners instead (see
  // deploy-pages.yml) — three machines doing a third each, every one of
  // them still single-worker, so nothing about timing changes.
  workers: 1,
  // "github" annotates the check run inline; "html" (written to
  // playwright-report/, not committed — see .gitignore) is what the CI
  // workflow uploads as an artifact on failure so a trace/screenshot is
  // actually reachable without re-running locally.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    // **Do not "optimise" this to "on-first-retry" without reading on.** It
    // looks like free speed — a trace is recorded for every test and all but
    // the failures are thrown away, and these specs fire hundreds of pointer
    // events painting pixels, so it is real work done ~170 times per run. It
    // measures as a large win: the three Skin Creator specs drop from ~84s to
    // ~65s, and a published-game + skin slice from 270s to 108s.
    //
    // It also turns 9 of those 9 passing tests into 5. Tracing serialises and
    // slows each action, and the Skin Creator specs have come to depend on
    // that: without it the mouse events outrun what the app has finished
    // doing, and the skins library reads back empty ("No pixel skins yet").
    // So this setting is currently propping up latent races in those tests.
    //
    // Left as-is deliberately. The speed is genuinely available, but claiming
    // it means fixing those races first — the tests should wait for the app
    // rather than be paced by a profiler — and that is its own piece of work,
    // not a line in a config.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
