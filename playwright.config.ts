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
  // physics — parallel workers would only add flakiness for no speed win
  // worth it at this suite's current size.
  workers: 1,
  // "github" annotates the check run inline; "html" (written to
  // playwright-report/, not committed — see .gitignore) is what the CI
  // workflow uploads as an artifact on failure so a trace/screenshot is
  // actually reachable without re-running locally.
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
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
