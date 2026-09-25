import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every fixed-duration wait in the e2e suite has to say why it is one.
 *
 * **Three of twelve consecutive commits were pure flake repair**, and every one
 * of them was the same mistake: a `waitForTimeout` long enough on an idle
 * machine and not long enough under parallel load. A character covers about
 * 30px in the first 250ms of a run and about 100px once warm, so a hold that
 * passes locally at `--workers=1` is a coin toss on a three-way CI shard.
 *
 * The rule is narrower than "never sleep", which is why it needed writing down
 * rather than remembering:
 *
 *  - Before a **positive** assertion — "it moved", "the line changed", "the
 *    second player arrived" — a fixed wait is a race. `expect.poll` asks the
 *    question until it is true, and as a bonus makes the *other* assertions in
 *    the test stronger: the "and this one did not move" half gets checked at
 *    the earliest instant the first half was known to be true.
 *  - Before a **negative** one — "no second player appeared", "nothing moved"
 *    — a fixed wait is the only correct tool, because there is nothing to poll
 *    for. You cannot ask "has the absence finished happening yet".
 *
 * So this does not ban the call. It bans the *unexplained* call, and leaves the
 * author to write the sentence that decides which of the two they have. Same
 * instinct as `docs.test.ts` next door: the failures worth automating are the
 * ones with no symptom.
 *
 * A wait whose argument is a named constant or a parameter — `FRAMES_MS`, or a
 * helper's own `ms` — is exempt. The name is the justification, and demanding a
 * comment beside `waitForTimeout(FRAMES_MS)` would be noise that teaches the
 * next person to write noise.
 */

const E2E_DIR = fileURLToPath(new URL("../tests/e2e", import.meta.url));

/** How far above the call a justifying comment may sit. Three, so a wait under
 * the tail of a longer paragraph still counts — the paragraph is the reason. */
const WINDOW = 3;

/** `waitForTimeout(250)`, but not `waitForTimeout(FRAMES_MS)`. */
const NUMERIC_WAIT = /waitForTimeout\(\s*\d[\d_]*\s*\)/;

interface Site {
  file: string;
  line: number;
  text: string;
  justified: boolean;
}

function sites(): Site[] {
  const found: Site[] = [];
  for (const entry of readdirSync(E2E_DIR, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts")) continue;
    const path = `${entry.parentPath}/${entry.name}`;
    const lines = readFileSync(path, "utf8").split("\n");
    lines.forEach((text, i) => {
      const match = NUMERIC_WAIT.exec(text);
      if (!match) return;
      // The three lines above, plus whatever trails the call on its own line —
      // a one-liner reason belongs beside a one-line wait.
      const context = [...lines.slice(Math.max(0, i - WINDOW), i), text.slice(match.index + match[0].length)];
      found.push({
        file: `${path.slice(E2E_DIR.length + 1)}`,
        line: i + 1,
        text: text.trim(),
        justified: context.some((l) => l.includes("//") || l.includes("*")),
      });
    });
  }
  return found;
}

describe("fixed waits in the e2e suite", () => {
  it("finds the waits it is supposed to be checking", () => {
    // Guards the guard. If the glob, the directory or the regex ever stops
    // matching, the check below would pass by finding nothing — which is the
    // one way a test like this dies without anybody noticing. Measured at 31
    // across 12 files when this was written; the floor is deliberately well
    // under that, so deleting waits never fails the suite.
    const all = sites();
    expect(all.length, "no numeric waitForTimeout found at all — the regex or the path is wrong").toBeGreaterThan(20);
    expect(new Set(all.map((s) => s.file)).size).toBeGreaterThan(4);
  });

  it("has a reason written beside every one of them", () => {
    const bare = sites().filter((s) => !s.justified);
    expect(
      bare.map((s) => `${s.file}:${s.line}  ${s.text}`),
      "A fixed wait before a positive assertion is a race — poll for the thing instead (expect.poll). " +
        "A fixed wait before a negative assertion is correct, because an absence cannot be polled for — " +
        "say so in a comment above it, and this passes.",
    ).toEqual([]);
  });
});
