import { describe, expect, it } from "vitest";
import { publishedGameLink, requestedGameSlug } from "./publishedBundle";

/**
 * What a link is allowed to ask for.
 *
 * `requestedGameSlug` is the only thing standing between a query string and a
 * fetch, and the slug is interpolated straight into that fetched path — so this
 * is a guard, not a tidy-up, and it is tested as one.
 */
describe("requestedGameSlug", () => {
  it("finds the game a link names", () => {
    expect(requestedGameSlug("?game=grampa-s-quest")).toBe("grampa-s-quest");
    expect(requestedGameSlug("?game=g1")).toBe("g1");
    expect(requestedGameSlug("?other=x&game=ice-cave")).toBe("ice-cave");
  });

  it("reads a URL that asks for nothing as the editor", () => {
    expect(requestedGameSlug("")).toBeNull();
    expect(requestedGameSlug("?")).toBeNull();
    expect(requestedGameSlug("?profile=mike")).toBeNull();
  });

  /**
   * The one that matters. `new URL("games/../../secret.json", base)` resolves
   * happily, so a slug carrying dots or slashes is a request to fetch somewhere
   * else entirely. Refusing the alphabet is what makes that impossible rather
   * than merely unlikely — there is no path left to traverse.
   */
  it("refuses anything that could point somewhere else", () => {
    expect(requestedGameSlug("?game=../../secret")).toBeNull();
    expect(requestedGameSlug("?game=..")).toBeNull();
    expect(requestedGameSlug("?game=a/b")).toBeNull();
    expect(requestedGameSlug("?game=a.json")).toBeNull();
    expect(requestedGameSlug("?game=%2e%2e%2fsecret")).toBeNull();
    expect(requestedGameSlug("?game=https://elsewhere.example/x")).toBeNull();
  });

  it("refuses names no slug could be", () => {
    expect(requestedGameSlug("?game=")).toBeNull();
    expect(requestedGameSlug("?game=Grampa")).toBeNull();
    expect(requestedGameSlug("?game=-leading")).toBeNull();
    expect(requestedGameSlug("?game=trailing-")).toBeNull();
    expect(requestedGameSlug("?game=with space")).toBeNull();
    expect(requestedGameSlug("?game=under_score")).toBeNull();
  });
});

/**
 * The link the Publish screen hands out.
 *
 * Built from wherever the editor actually is, so it is right on a Pages project
 * subpath as well as at a domain root — and stripped of whatever the author's
 * own URL happened to carry, since none of that belongs in something they send
 * to somebody else.
 */
describe("publishedGameLink", () => {
  it("keeps the site's own path and appends the game", () => {
    expect(publishedGameLink("https://someone.github.io/CODEX/", "ice-cave")).toBe(
      "https://someone.github.io/CODEX/?game=ice-cave",
    );
    expect(publishedGameLink("http://localhost:5173/", "ice-cave")).toBe("http://localhost:5173/?game=ice-cave");
  });

  it("drops whatever the author's own URL was carrying", () => {
    expect(publishedGameLink("https://x.example/CODEX/?game=other-game#top", "ice-cave")).toBe(
      "https://x.example/CODEX/?game=ice-cave",
    );
  });

  /** Round-trip: what the screen prints is what the player will parse. */
  it("produces a link the player reads back as that game", () => {
    const link = publishedGameLink("https://x.example/CODEX/", "grampa-s-quest");
    expect(requestedGameSlug(new URL(link).search)).toBe("grampa-s-quest");
  });
});
