/**
 * A tiny sound synthesiser, so a thing somebody invents can make a noise.
 *
 * The Thing Maker lets you name a creature, draw it, and borrow a built-in's
 * behaviour. Everything it produced was silent: a hand-drawn coin sounded
 * exactly like a built-in coin, which is the one part of "I made this" the tool
 * could not deliver.
 *
 * **Synthesised here rather than by adding jsfxr**, for the reasons
 * scripts/generate-sfx.py already sets out for the seven shipped effects: a
 * couple of hundred lines of arithmetic are ours outright, carry no licence line
 * and no vendored blob, and stay editable. The primitives below are that file's,
 * ported — the phase-integral sweep, the anti-click attack, the tail fade. What
 * is worth keeping from jsfxr is not its synthesis but its *shape*: a handful of
 * recognisable kinds plus a randomiser. A panel of twenty-four sliders is not
 * something anyone wants on a game canvas, least of all the audience for this.
 *
 * **A sound is stored as two numbers, never as audio.** A definition keeps its
 * preset and its seed and the waveform is rebuilt on load, so a custom entity
 * stays a few bytes rather than carrying a WAV around — the same reasoning that
 * dropped the redundant `cells` array from saved skins. It also means every roll
 * is reproducible: the same seed is the same sound on every device, forever.
 *
 * Pure, no Phaser, no DOM beyond the one base64 call at the very end — so the
 * rules are testable on their own, the same split worldLayout.ts and
 * customEntity.ts use.
 */

/** Matches scripts/generate-sfx.py, so an authored sound and a built-in one sit
 * in the same family rather than one being conspicuously crisper. */
const RATE = 22050;

/** Headroom below full scale. Several of these stack partials, and a clipped
 * square sounds like a fault rather than like a loud noise. */
const PEAK = 0.62;

/**
 * The kinds of noise a thing can make.
 *
 * Five, not fifty. Each is a recognisable *event* rather than a timbre — the
 * question "what does this thing do?" is one a child can answer, where "what
 * waveform is it?" is not. Items get the first two, enemies the middle two, and
 * `thud` suits either.
 */
export const SOUND_PRESETS = ["pickup", "power", "hit", "blip", "thud"] as const;

export type SoundPreset = (typeof SOUND_PRESETS)[number];

/** What a custom entity actually stores. Two numbers and a name. */
export interface SoundSpec {
  preset: SoundPreset;
  /** Selects one variation within the preset. Any integer; see `rollSeed`. */
  seed: number;
}

export function isSoundPreset(value: string): value is SoundPreset {
  return (SOUND_PRESETS as readonly string[]).includes(value);
}

/**
 * A small deterministic PRNG (mulberry32).
 *
 * Deliberately not `Math.random`: the seed *is* the sound. A roll has to produce
 * the same noise when the game is reopened, on someone else's machine, a year
 * later — otherwise storing the seed would be storing nothing.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for the "Roll" button. Random here is right — this is the one
 * moment the choice is being made rather than replayed. */
export function rollSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

// --- primitives, ported from scripts/generate-sfx.py -----------------------

/** Samples for a clip of this length. */
function frames(duration: number): number {
  return Math.max(1, Math.floor(RATE * duration));
}

/**
 * Advances a phase accumulator by one sample at `freq`.
 *
 * Phase is integrated rather than computed as `freq * t`, which matters only for
 * the swept sounds and matters a lot there: with a varying frequency, `freq * t`
 * bends the pitch *and* smears the phase, and the smear is audible as a warble
 * instead of a glide.
 */
function sweepPhase(from: number, to: number, i: number, n: number, phase: number): number {
  const freq = from + ((to - from) * i) / n;
  return phase + (2 * Math.PI * freq) / RATE;
}

function square(phase: number, duty = 0.5): number {
  const cycle = (phase / (2 * Math.PI)) % 1;
  return (cycle < 0 ? cycle + 1 : cycle) < duty ? 1 : -1;
}

/**
 * A percussive envelope: a very short attack, then exponential decay.
 *
 * The attack is not decoration. A waveform at full amplitude on sample zero
 * starts with a step, and a step is a click — heard on every single pickup,
 * which is exactly the sort of small wrongness that makes a game feel cheap.
 */
function decay(i: number, tau: number, attack = 0.004): number {
  const t = i / RATE;
  return Math.exp(-t / tau) * Math.min(1, t / attack);
}

/** Ramps the last few milliseconds to zero — the same anti-click argument as
 * `decay`'s attack, applied to the end, for clips that stop while still
 * audible. */
function fadeOut(out: Float32Array, seconds = 0.012): void {
  const n = Math.min(Math.floor(RATE * seconds), out.length);
  for (let i = 0; i < n; i++) out[out.length - n + i] *= 1 - i / n;
}

function normalise(out: Float32Array): void {
  let peak = 0;
  for (const sample of out) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return;
  const gain = PEAK / peak;
  for (let i = 0; i < out.length; i++) out[i] *= gain;
}

/** `base` scaled by a random factor within ±`spread` (as a fraction). Every
 * preset's variation goes through this, so a roll always lands somewhere that
 * still sounds like the kind of thing it is. */
function jitter(next: () => number, base: number, spread: number): number {
  return base * (1 + (next() * 2 - 1) * spread);
}

// --- the presets -----------------------------------------------------------

/**
 * Renders a spec to mono float samples in roughly [-1, 1].
 *
 * Frequencies stay near a pentatonic around 440Hz for the same reason
 * generate-sfx.py's do: you hear these in quick succession — a row of coins —
 * and arbitrary pitches turn that into a car alarm.
 */
export function renderSound(spec: SoundSpec): Float32Array {
  const next = rng(spec.seed);
  switch (spec.preset) {
    case "pickup":
      return pickup(next);
    case "power":
      return power(next);
    case "hit":
      return hit(next);
    case "blip":
      return blip(next);
    case "thud":
      return thud(next);
  }
}

/** Two notes, low then high — the classic collect blip. */
function pickup(next: () => number): Float32Array {
  const low = jitter(next, 988, 0.18);
  const high = low * (next() < 0.5 ? 4 / 3 : 3 / 2);
  const out = new Float32Array(frames(jitter(next, 0.15, 0.2)));
  const half = Math.floor(out.length / 2);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    phase += (2 * Math.PI * (i < half ? low : high)) / RATE;
    out[i] = square(phase) * decay(i, 0.09);
  }
  normalise(out);
  fadeOut(out);
  return out;
}

/** A rising triad — warmer than a pickup, because gaining something should read
 * as relief rather than as scoring. */
function power(next: () => number): Float32Array {
  const root = jitter(next, 523.25, 0.12);
  const steps = [root, root * 1.26, root * 1.5];
  const out = new Float32Array(frames(jitter(next, 0.28, 0.15)));
  const step = Math.floor(out.length / 3);
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const freq = steps[Math.min(2, Math.floor(i / step))];
    phase += (2 * Math.PI * freq) / RATE;
    out[i] = (Math.sin(phase) + 0.3 * Math.sin(phase * 2)) * decay(i, 0.16, 0.01);
  }
  normalise(out);
  fadeOut(out);
  return out;
}

/** A falling sweep with noise mixed in. The noise is what separates "I was hit"
 * from every pleasant sound here — none of the others have any. */
function hit(next: () => number): Float32Array {
  const from = jitter(next, 420, 0.2);
  const to = jitter(next, 90, 0.3);
  const grit = 0.25 + next() * 0.25;
  const out = new Float32Array(frames(jitter(next, 0.22, 0.2)));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    phase = sweepPhase(from, to, i, out.length, phase);
    const saw = Math.sin(phase) + 0.5 * Math.sin(phase * 2) + 0.25 * Math.sin(phase * 3);
    out[i] = (saw + grit * (next() * 2 - 1)) * decay(i, 0.1);
  }
  normalise(out);
  fadeOut(out);
  return out;
}

/** One short square note. The plainest of the five on purpose: something has to
 * suit a thing that just needs to announce itself without a story. */
function blip(next: () => number): Float32Array {
  const freq = jitter(next, 660, 0.35);
  const duty = 0.2 + next() * 0.3;
  const out = new Float32Array(frames(jitter(next, 0.09, 0.25)));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    phase += (2 * Math.PI * freq) / RATE;
    out[i] = square(phase, duty) * decay(i, 0.05);
  }
  normalise(out);
  fadeOut(out);
  return out;
}

/** A low body drop. Suits something heavy landing or something big being
 * defeated, which is why it is the one preset offered to both families. */
function thud(next: () => number): Float32Array {
  const from = jitter(next, 180, 0.25);
  const to = from * (0.35 + next() * 0.2);
  const out = new Float32Array(frames(jitter(next, 0.2, 0.2)));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    phase = sweepPhase(from, to, i, out.length, phase);
    out[i] = (Math.sin(phase) + 0.15 * (next() * 2 - 1)) * decay(i, 0.08, 0.002);
  }
  normalise(out);
  fadeOut(out);
  return out;
}

// --- packaging -------------------------------------------------------------

/**
 * Wraps float samples in a 16-bit PCM WAV.
 *
 * WAV rather than anything compressed for the same reason generate-sfx.py gives:
 * at a fifth of a second the compression saves a couple of KB and costs an
 * encoder. Phaser decodes WAV natively, and `addBase64`-style loading wants a
 * data URL anyway.
 */
export function toWavDataUrl(samples: Float32Array): string {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // PCM, uncompressed
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, RATE, true);
  view.setUint32(28, RATE * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);

  for (let i = 0; i < samples.length; i++) {
    // Clamped before scaling: normalise() keeps us well inside, but a sample
    // that slipped past 1.0 would wrap to full-scale *negative* here, which is
    // a loud crack rather than a slightly clipped note.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * bytesPerSample, Math.round(clamped * 32767), true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  // In chunks: String.fromCharCode(...bytes) on a 10k-sample clip spreads tens
  // of thousands of arguments and overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** The one call the rest of the app needs: a spec in, a playable data URL out. */
export function soundDataUrl(spec: SoundSpec): string {
  return toWavDataUrl(renderSound(spec));
}
