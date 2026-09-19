import { describe, expect, it } from "vitest";
import { isTuneMood, renderTune, SEAM_FADE_SECONDS, TUNE_MOODS, tuneDataUrl } from "./musicSynth";

/**
 * What these guard is the same claim `soundSynth.test.ts` guards, one size up:
 * a tune is a mood and a seed, and the audio is rebuilt from them. If a seed
 * did not reproduce its tune, storing the seed would be storing nothing and
 * every level would quietly change its music on the next page load.
 *
 * The seam tests are here because both of this module's real defects were found
 * by measuring structure rather than by listening, and neither would have shown
 * up in a "does it render" check.
 */

const RATE = 22050;
const seeds = [0, 1, 7, 12345, 0xffffffff];

/** The largest absolute sample, which is what normalise() and the WAV writer's
 * clamp both care about. */
function peakOf(samples: Float32Array): number {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  return peak;
}

/**
 * A cheap content hash, for the tests that only ask "are these two the same?".
 *
 * A loop is about 190,000 samples, so `Array.from(x).join(",")` — the shape
 * `soundSynth.test.ts` can afford for its fifth-of-a-second blips — built
 * multi-megabyte strings here and took six seconds. Position is mixed in, so
 * this cannot be fooled by a reordering.
 */
function fingerprint(samples: Float32Array): number {
  let hash = 0;
  for (let i = 0; i < samples.length; i++) {
    hash = (Math.imul(hash, 31) + Math.round(samples[i] * 1e6) + i) | 0;
  }
  return hash;
}

describe("renderTune", () => {
  it("is deterministic: the same mood and seed are the same samples, every time", () => {
    for (const mood of TUNE_MOODS) {
      expect(fingerprint(renderTune(mood, 4242)), mood).toBe(fingerprint(renderTune(mood, 4242)));
    }
  });

  it("gives different seeds different tunes", () => {
    for (const mood of TUNE_MOODS) {
      const rendered = seeds.map((seed) => fingerprint(renderTune(mood, seed)));
      expect(new Set(rendered).size, `${mood} collapses different seeds to one tune`).toBe(seeds.length);
    }
  });

  it("gives every mood its own sound at the same seed", () => {
    // Four rows in one table is easy to edit into three distinguishable moods
    // and one duplicate, and nothing else would notice.
    const rendered = TUNE_MOODS.map((mood) => fingerprint(renderTune(mood, 1)));
    expect(new Set(rendered).size).toBe(TUNE_MOODS.length);
  });

  it("stays inside the headroom the WAV writer assumes", () => {
    for (const mood of TUNE_MOODS) {
      for (const seed of seeds) {
        const peak = peakOf(renderTune(mood, seed));
        // A clipped tune reads as a fault rather than as loud music, and would
        // make the clamp in toWavDataUrl do real work instead of being a guard.
        expect(peak, `${mood}/${seed} is too hot`).toBeLessThan(0.99);
        // Silence is the failure nobody attributes to the right place — it
        // reads as "music is broken", not "this tune is quiet".
        expect(peak, `${mood}/${seed} is silent`).toBeGreaterThan(0.1);
      }
    }
  });

  it("loops for long enough not to nag and short enough not to bloat", () => {
    for (const mood of TUNE_MOODS) {
      const seconds = renderTune(mood, 1).length / RATE;
      // A short loop is noticeably a loop; a long one is megabytes of
      // Float32Array held for a level nobody may even be playing.
      expect(seconds, mood).toBeGreaterThan(6);
      expect(seconds, mood).toBeLessThan(15);
    }
  });

  it("is the same length whatever the seed, because the length is the table's", () => {
    // Guards the one thing the melody walk must not touch: the buffer is
    // `beat × beats`, and a seed that could shorten it would make the loop
    // point move with the roll.
    for (const mood of TUNE_MOODS) {
      const lengths = new Set(seeds.map((seed) => renderTune(mood, seed).length));
      expect(lengths.size, mood).toBe(1);
    }
  });

  it("meets itself at the loop seam without a step", () => {
    for (const mood of TUNE_MOODS) {
      for (const seed of seeds) {
        const samples = renderTune(mood, seed);
        // **The measurement that matters**, and the one the first attempt got
        // wrong. Fading only the tail made the tail measure clean while
        // `removeDc` had lifted the *start* to +0.043 on the thin-duty moods —
        // the step had simply moved to the other side of the seam. What a
        // speaker actually jumps across, once per repeat, is last → first.
        const jump = Math.abs(samples[0] - samples[samples.length - 1]);
        expect(jump, `${mood}/${seed} ticks once per repeat`).toBeLessThan(0.002);
      }
    }
  });

  it("is centred on zero, so no headroom is spent on something nobody hears", () => {
    for (const mood of TUNE_MOODS) {
      const samples = renderTune(mood, 1);
      let sum = 0;
      for (const sample of samples) sum += sample;
      // Squares with a duty other than 0.5 spend more time high than low;
      // "spooky" measured -0.053 before removeDc, which is a twentieth of the
      // headroom and an audible thump on some speakers when the tune starts.
      expect(Math.abs(sum / samples.length), mood).toBeLessThan(0.005);
    }
  });

  it("fades in over the window it claims, rather than starting mid-note", () => {
    const samples = renderTune("jolly", 1);
    const fade = Math.floor(RATE * SEAM_FADE_SECONDS);
    // Inside the fade the signal is held down; past it the tune is at full
    // strength. Without the second half of this, a fade over the whole buffer
    // would pass the seam test by making everything quiet.
    expect(peakOf(samples.subarray(0, Math.floor(fade / 4)))).toBeLessThan(0.1);
    expect(peakOf(samples.subarray(fade))).toBeGreaterThan(0.4);
  });

  it("plays rather than resting through the whole loop", () => {
    // `rest` is a probability, so a mood edited to 1 would render silence-
    // shaped noise and still pass the peak check on its bass alone.
    for (const mood of TUNE_MOODS) {
      const samples = renderTune(mood, 1);
      let sounding = 0;
      for (const sample of samples) if (Math.abs(sample) > 0.01) sounding++;
      expect(sounding / samples.length, `${mood} is mostly silence`).toBeGreaterThan(0.5);
    }
  });
});

describe("tune plumbing", () => {
  it("round-trips every mood through the one call the app uses", () => {
    for (const mood of TUNE_MOODS) {
      expect(tuneDataUrl(mood, 5).startsWith("data:audio/wav;base64,"), mood).toBe(true);
    }
  });

  it("recognises exactly the moods it can render", () => {
    for (const mood of TUNE_MOODS) expect(isTuneMood(mood)).toBe(true);
    // The storage boundary: a level saved by a future version naming a mood
    // this build has never heard of must not be treated as renderable.
    expect(isTuneMood("triumphant")).toBe(false);
    expect(isTuneMood("")).toBe(false);
  });
});
