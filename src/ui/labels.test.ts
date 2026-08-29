import { describe, expect, it } from "vitest";
import { ellipsize } from "./labels";

/**
 * The rule that stops map node labels running into each other. The budget is the
 * whole point: a "truncation" that returns something longer than it was asked
 * for would leave the collisions exactly where they were.
 */
describe("ellipsize", () => {
  it("leaves a name that already fits completely alone", () => {
    expect(ellipsize("Green Hill", 15)).toBe("Green Hill");
    expect(ellipsize("Green Hill", 10)).toBe("Green Hill");
  });

  it("cuts a long name down and marks that it continues", () => {
    // A real level name from the reported screenshot.
    expect(ellipsize("Goly moly fluded temple", 15)).toBe("Goly moly flud…");
  });

  it("never returns more characters than it was given room for", () => {
    for (const name of ["", "a", "Green Hill", "Goly moly fluded temple", "x".repeat(200)]) {
      for (const budget of [0, 1, 2, 5, 15, 40]) {
        expect(ellipsize(name, budget).length, `${name}@${budget}`).toBeLessThanOrEqual(Math.max(0, budget));
      }
    }
  });

  it("drops the space before the ellipsis rather than leaving it hanging", () => {
    // "Green …" reads as a mistake; "Green…" reads as a name that continues.
    expect(ellipsize("Green Hill", 7)).toBe("Green…");
  });

  it("degenerates sensibly at tiny budgets rather than throwing", () => {
    expect(ellipsize("Green Hill", 1)).toBe("…");
    expect(ellipsize("Green Hill", 0)).toBe("");
    expect(ellipsize("Green Hill", -3)).toBe("");
  });
});
