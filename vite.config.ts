// `vitest/config`'s defineConfig (not plain `vite`'s) so the `test` block
// below type-checks — this file doubles as both Vite's and Vitest's
// config, same file, no separate vitest.config.ts.
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  // Relative base so the built app works from any subpath (e.g. a GitHub
  // Pages project site at https://<user>.github.io/<repo>/), not just from
  // a domain root like the dev server.
  base: "./",
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
  },
  test: {
    // Vitest's own default `include` glob (**/*.{test,spec}.ts) would
    // also match tests/e2e/*.spec.ts — those are @playwright/test specs
    // (run via `npm run test:e2e`, see playwright.config.ts), not Vitest
    // ones, and don't run under Vitest's node/jsdom environment at all.
    // Scoping `include` to src/ (rather than adding tests/e2e to
    // `exclude`) avoids having to also repeat Vitest's own default
    // excludes (dist/, node_modules/, etc.) here.
    include: ["src/**/*.{test,spec}.ts"],
  },
});
