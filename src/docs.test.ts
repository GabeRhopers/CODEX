import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The README's own cross-references have to point at something.
 *
 * This file is a design log — a decade of `**Title (2026-08-29).**` entries —
 * and its prose navigates by name: `see "Goal art" under Art`, forty-odd
 * distinct times. Those are sentences, not links, so nothing has ever checked
 * them, and by 2026-09-09 roughly **one in six pointed at nothing**: eight
 * `see "X"` targets that did not exist, plus four `under Controls` references
 * to a section that was a bullet list.
 *
 * Nobody could have noticed. A broken markdown link is at least visibly broken;
 * a sentence saying "see X" when there is no X reads exactly like one that
 * works. So this is the guard, and it is cheap: parse the headings, parse the
 * references, assert every reference resolves.
 *
 * Same instinct as the `SFX_NAMES` load guard — the failures worth automating
 * are the ones with no symptom.
 */

const README = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");

/** Collapses the line wrapping that makes a reference span two lines. Without
 * this the first survey of the damage reported twenty misses instead of the
 * real eight, all of them wrapped titles rather than absent ones. */
const flatten = (text: string): string => text.replace(/\s+/g, " ").trim();

const undate = (text: string): string => text.replace(/\s*\(20\d\d-\d\d-\d\d[^)]*\)\s*$/, "").trim();

/** Every name a reference is allowed to point at.
 *
 * Not just headings. This document addresses itself at three levels and always
 * has: `### Entry` for a log entry, `*Sub-label.*` for a step inside one, and
 * `- **Bullet**:` for an item in the Controls list — and the prose refers to
 * all three by name. A checker that only accepted headings would report honest
 * references as broken, which is the fastest way to get a test deleted rather
 * than obeyed.
 */
function headings(): string[] {
  const patterns = [
    /^#{2,4}\s+(.+)$/gm, // ### Entry title
    /^\*\*(.+?)\*\*/gm, // **Bold lead.**
    /^\*([A-Z][^*]{3,}?)\*/gm, // *Italic sub-label.*
    /^\s*-\s+\*\*(.+?)\*\*/gm, // - **Bullet label**:
  ];
  return patterns.flatMap((p) => [...README.matchAll(p)].map((m) => undate(flatten(m[1])).replace(/[.:]$/, "")));
}

/** Every `see "X"` in the document, de-duplicated and unwrapped. */
function references(): string[] {
  const found = [...README.matchAll(/see "((?:[^"]|\n)+?)"/g)].map((m) => undate(flatten(m[1])));
  return [...new Set(found)];
}

/** Compared with every space removed as well as normalised.
 *
 * A reference that wraps mid-token — `header/` at the end of one line and
 * `footer/dropdown` at the start of the next — flattens to `header/ footer`,
 * which no heading contains. That one artefact accounted for a "broken"
 * reference that was perfectly fine. */
const squash = (text: string): string => text.toLowerCase().replace(/\s+/g, "");

/** Deliberately loose: an entry may be referred to by a shortened form of its
 * heading ("Custom skins" for "Custom skins & the Skin Creator"). Requiring an
 * exact match would fail honest references and push the next person to loosen
 * the test rather than fix the link. */
const resolves = (ref: string, all: string[]): boolean =>
  all.some((h) => squash(h).includes(squash(ref)) || squash(ref).includes(squash(h)));

describe("README cross-references", () => {
  it("has headings to point at", () => {
    // Guards the guard: with no headings parsed, every check below would pass
    // vacuously and this file would quietly stop meaning anything.
    expect(headings().length).toBeGreaterThan(50);
  });

  it("finds the references it is supposed to check", () => {
    expect(references().length).toBeGreaterThan(20);
  });

  it("resolves every `see \"X\"` to a real heading", () => {
    const all = headings();
    const broken = references().filter((ref) => !resolves(ref, all));
    expect(broken, "these README references point at nothing").toEqual([]);
  });

  it("only sends the reader to sections that exist", () => {
    // `under Art`, `under Controls`, and so on. Four references pointed at a
    // "Controls" section that was only ever a bullet list.
    const all = headings().map((h) => h.toLowerCase());
    // `\bunder\b`, not `under`: without the boundary this matches the tail of
    // "Thunder Hat" and goes looking for a section called "Hat is collected".
    const sections = [...README.matchAll(/\bunder\b ([A-Z][A-Za-z ]{2,20}?)(?=[,.)]|\s+in\b|\s*$)/gm)].map((m) =>
      flatten(m[1]).toLowerCase(),
    );
    const broken = [...new Set(sections)].filter((s) => !all.some((h) => h.includes(s) || s.includes(h)));
    expect(broken, "these README section references point at nothing").toEqual([]);
  });
});
