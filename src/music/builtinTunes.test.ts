import { describe, expect, it } from "vitest";
import { TUNE_MOODS } from "../audio/musicSynth";
import { BUILTIN_TUNES, builtinTuneDataUrl, builtinTuneLabel, isBuiltinTuneId, tuneMoodFor } from "./builtinTunes";

/**
 * The catalogue, and one rule that three unrelated places depend on: an id
 * either names a built-in or names an upload, and nothing in between.
 *
 * `isBuiltinTuneId` is the seam where getting it wrong is silent rather than
 * loud — see `referencedMusicIds`, which would otherwise send the bundler
 * hunting the library for a track that was never in it.
 */

describe("the catalogue", () => {
  it("offers one tune per mood, so no mood is unreachable", () => {
    expect(BUILTIN_TUNES.map((tune) => tune.mood).sort()).toEqual([...TUNE_MOODS].sort());
  });

  it("gives every tune a distinct id and a distinct label", () => {
    expect(new Set(BUILTIN_TUNES.map((t) => t.id)).size).toBe(BUILTIN_TUNES.length);
    expect(new Set(BUILTIN_TUNES.map((t) => t.label)).size).toBe(BUILTIN_TUNES.length);
  });

  it("names its own mood in its id, so playback needs no table", () => {
    // The property the published-bundle case rests on: a bundle read by a
    // newer build resolves its tune by parsing the id, not by finding a row
    // that a catalogue edit could have moved.
    for (const tune of BUILTIN_TUNES) expect(tuneMoodFor(tune.id), tune.id).toBe(tune.mood);
  });
});

describe("isBuiltinTuneId", () => {
  it("says yes to every id in the catalogue", () => {
    for (const tune of BUILTIN_TUNES) expect(isBuiltinTuneId(tune.id), tune.id).toBe(true);
  });

  it("says no to an uploaded track's id", () => {
    // What the library actually stores — uuids and, on older entries, names.
    expect(isBuiltinTuneId("8f14e45f-ceea-467a-9c30-6b01c1ee3f4b")).toBe(false);
    expect(isBuiltinTuneId("my-song.mp3")).toBe(false);
    expect(isBuiltinTuneId("")).toBe(false);
  });

  it("still recognises a mood this build cannot render", () => {
    // A level saved against a tune since removed. It has to read as *a
    // built-in* and fall back to silence — mistaken for an upload, it would be
    // reported as a missing track on every publish, forever.
    expect(isBuiltinTuneId("tune:triumphant")).toBe(true);
    expect(tuneMoodFor("tune:triumphant")).toBeNull();
    expect(builtinTuneDataUrl("tune:triumphant")).toBeNull();
  });
});

describe("rendering", () => {
  it("renders every catalogue entry to playable audio", () => {
    for (const tune of BUILTIN_TUNES) {
      expect(builtinTuneDataUrl(tune.id)?.startsWith("data:audio/wav;base64,"), tune.id).toBe(true);
    }
  });

  it("returns the identical url on a second ask, rather than re-synthesising", () => {
    // Memoised — Test Play, Play and a republish all want the same tune, and
    // each render is a few hundred kilobytes. `toBe` rather than `toEqual`:
    // the point is that it is the same string, not an equal one.
    const first = builtinTuneDataUrl("tune:jolly");
    expect(builtinTuneDataUrl("tune:jolly")).toBe(first);
  });

  it("labels a known id and falls back to the id itself for an unknown one", () => {
    expect(builtinTuneLabel("tune:jolly")).toBe("Jolly");
    // An empty button would look broken; the raw id at least says something.
    expect(builtinTuneLabel("tune:triumphant")).toBe("tune:triumphant");
  });
});
