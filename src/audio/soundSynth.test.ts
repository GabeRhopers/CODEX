import { describe, expect, it } from "vitest";
import {
  SOUND_PRESETS,
  isSoundPreset,
  renderSound,
  rollSeed,
  soundDataUrl,
  toWavDataUrl,
  type SoundSpec,
} from "./soundSynth";

/**
 * What these guard is the claim the storage format rests on: a sound is two
 * numbers, and the audio is rebuilt from them. If a seed did not reproduce its
 * sound, storing the seed would be storing nothing, and every custom entity
 * would quietly change its noise on the next page load.
 */

const RATE = 22050;
const seeds = [0, 1, 7, 12345, 0xffffffff];

describe("renderSound", () => {
  it("is deterministic: the same spec is the same samples, every time", () => {
    for (const preset of SOUND_PRESETS) {
      const spec: SoundSpec = { preset, seed: 4242 };
      expect(Array.from(renderSound(spec))).toEqual(Array.from(renderSound(spec)));
    }
  });

  it("gives different seeds different sounds", () => {
    for (const preset of SOUND_PRESETS) {
      // Compared by content, not by length: two rolls can easily land on the
      // same duration, and a length check would call that a collision.
      const rendered = seeds.map((seed) => Array.from(renderSound({ preset, seed })).join(","));
      expect(new Set(rendered).size, `${preset} collapses different seeds to one sound`).toBe(seeds.length);
    }
  });

  it("stays inside the headroom the WAV writer assumes", () => {
    for (const preset of SOUND_PRESETS) {
      for (const seed of seeds) {
        let peak = 0;
        for (const sample of renderSound({ preset, seed })) peak = Math.max(peak, Math.abs(sample));
        // normalise() targets 0.62; anything at or above 1 would clip, and the
        // clamp in toWavDataUrl would be doing real work rather than being a
        // belt-and-braces guard.
        expect(peak, `${preset}/${seed} is too hot`).toBeLessThan(0.99);
        // A silent sound is a bug that no listener would attribute to the right
        // place — it reads as "the button did nothing".
        expect(peak, `${preset}/${seed} is silent`).toBeGreaterThan(0.1);
      }
    }
  });

  it("keeps every clip short enough to fire during gameplay", () => {
    for (const preset of SOUND_PRESETS) {
      for (const seed of seeds) {
        const seconds = renderSound({ preset, seed }).length / RATE;
        // Long enough to hear, short enough that collecting three coins in a
        // second does not stack into a drone.
        expect(seconds, `${preset}/${seed}`).toBeGreaterThan(0.05);
        expect(seconds, `${preset}/${seed}`).toBeLessThan(0.5);
      }
    }
  });

  it("starts and ends near silence, so there is no click at either end", () => {
    for (const preset of SOUND_PRESETS) {
      const samples = renderSound({ preset, seed: 99 });
      // The attack ramp and the tail fade are the whole reason these are here;
      // a step at either end is audible on every single play.
      expect(Math.abs(samples[0]), `${preset} starts with a step`).toBeLessThan(0.05);
      expect(Math.abs(samples[samples.length - 1]), `${preset} ends with a step`).toBeLessThan(0.05);
    }
  });
});

describe("toWavDataUrl", () => {
  it("writes a header a decoder will accept", () => {
    const samples = renderSound({ preset: "pickup", seed: 1 });
    const url = toWavDataUrl(samples);
    expect(url.startsWith("data:audio/wav;base64,")).toBe(true);

    const bytes = Uint8Array.from(atob(url.slice("data:audio/wav;base64,".length)), (c) => c.charCodeAt(0));
    const text = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
    expect(text(0)).toBe("RIFF");
    expect(text(8)).toBe("WAVE");
    expect(text(12)).toBe("fmt ");
    expect(text(36)).toBe("data");

    const view = new DataView(bytes.buffer);
    expect(view.getUint16(22, true), "channel count").toBe(1);
    expect(view.getUint32(24, true), "sample rate").toBe(RATE);
    expect(view.getUint16(34, true), "bit depth").toBe(16);
    // The two length fields have to agree with the payload, which is the half a
    // malformed writer usually gets wrong and a player reports as "no sound".
    expect(view.getUint32(40, true), "data chunk size").toBe(samples.length * 2);
    expect(view.getUint32(4, true), "RIFF size").toBe(36 + samples.length * 2);
    expect(bytes.length).toBe(44 + samples.length * 2);
  });

  it("survives a clip long enough to blow a naive fromCharCode spread", () => {
    // 40k samples is past the argument limit that String.fromCharCode(...bytes)
    // hits, which is why the encoder chunks. This is that guard.
    const big = new Float32Array(40_000).fill(0.5);
    expect(() => toWavDataUrl(big)).not.toThrow();
  });

  it("clamps rather than wrapping, so an out-of-range sample cannot crack", () => {
    const url = toWavDataUrl(Float32Array.from([2, -2]));
    const bytes = Uint8Array.from(atob(url.slice("data:audio/wav;base64,".length)), (c) => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    // Wrapping would turn +2 into a large negative value — a loud crack, and
    // the opposite of what was asked for.
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32767);
  });
});

describe("spec plumbing", () => {
  it("round-trips every preset through the one call the app uses", () => {
    for (const preset of SOUND_PRESETS) {
      expect(soundDataUrl({ preset, seed: 5 }).startsWith("data:audio/wav;base64,")).toBe(true);
    }
  });

  it("recognises exactly the presets it can render", () => {
    for (const preset of SOUND_PRESETS) expect(isSoundPreset(preset)).toBe(true);
    // Guards the storage boundary: a definition saved by a future version with
    // a preset this build has never heard of must not be treated as renderable.
    expect(isSoundPreset("explosion")).toBe(false);
    expect(isSoundPreset("")).toBe(false);
  });

  it("rolls seeds inside the range the PRNG actually uses", () => {
    for (let i = 0; i < 200; i++) {
      const seed = rollSeed();
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      // Above 2^32 the >>> 0 in rng() would fold distinct seeds together, so
      // two different rolls could silently be the same sound.
      expect(seed).toBeLessThan(0x100000000);
    }
  });
});
