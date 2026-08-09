import { defineConfig } from "vite";

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
});
