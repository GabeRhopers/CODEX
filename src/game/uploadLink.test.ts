import { describe, expect, it } from "vitest";
import { gamesUploadLink } from "./uploadLink";

/**
 * A link that goes to the wrong branch is worse than no link at all: the upload
 * succeeds, GitHub shows the file, and the game simply never appears. Nothing
 * downstream can detect that, which is why the branch is pinned here and said
 * out loud in the assertion.
 */

describe("gamesUploadLink", () => {
  it("points at the games folder on the branch that actually deploys", () => {
    // `main`, not the repository's default branch — see DEPLOY_BRANCH. If this
    // test ever needs changing, the deploy workflow changed with it.
    expect(gamesUploadLink("https://gaberhopers.github.io/CODEX/")).toBe(
      "https://github.com/gaberhopers/CODEX/upload/main/public/games",
    );
  });

  it("ignores whatever the author happened to be looking at", () => {
    // The editor is reached with a query and a hash often enough; neither has
    // anything to do with where the file goes.
    expect(gamesUploadLink("https://gaberhopers.github.io/CODEX/?game=x#y")).toBe(
      "https://github.com/gaberhopers/CODEX/upload/main/public/games",
    );
  });

  it("reads the repository out of a user site's host, where the path has none", () => {
    // owner.github.io is served from a repository named after the host itself,
    // so this is the one shape where the first path segment is not the repo.
    expect(gamesUploadLink("https://gaberhopers.github.io/")).toBe(
      "https://github.com/gaberhopers/gaberhopers.github.io/upload/main/public/games",
    );
  });

  it("says nothing on a dev server, where there is nothing to publish to", () => {
    // Null is an ordinary answer, not a failure: the caller draws no button.
    expect(gamesUploadLink("http://localhost:5173/")).toBeNull();
    expect(gamesUploadLink("http://127.0.0.1:4173/?game=x")).toBeNull();
    expect(gamesUploadLink("https://example.com/CODEX/")).toBeNull();
  });

  it("is not fooled by a host that merely contains the Pages domain", () => {
    expect(gamesUploadLink("https://github.io.example.com/CODEX/")).toBeNull();
    // A bare "github.io" has no owner in front of it.
    expect(gamesUploadLink("https://github.io/CODEX/")).toBeNull();
  });

  it("returns null rather than throwing on something that is not a URL", () => {
    // It is handed `window.location.href`, so this should not happen — but a
    // throw here would take down the Publish screen for a cosmetic button.
    expect(gamesUploadLink("not a url")).toBeNull();
    expect(gamesUploadLink("")).toBeNull();
  });
});
