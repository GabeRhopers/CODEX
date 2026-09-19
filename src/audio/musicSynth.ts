import { toWavDataUrl } from "./soundSynth";

/**
 * Four short tunes, so a level is not silent.
 *
 * A level could always have music — you uploaded an MP3 and the editor's picker
 * listed it. But the picker offered *only* uploads, so a child who has never
 * gone looking for an audio file gets silence in everything they make, which is
 * the common case and was the day-one case. These are the fallback that
 * backgrounds have had all along.
 *
 * **Synthesised rather than shipped**, which is the argument
 * `scripts/generate-sfx.py` already makes for the eight sound effects: arithmetic
 * is ours outright, carries no licence line and no vendored blob, and stays
 * editable. It matters more here than there. A blip is a fifth of a second; a
 * loop is eight, and four of them as WAV files would be about 1.4MB — more than
 * sixteen times the entire existing sound set, in every clone of this repo,
 * forever. Synthesised they cost nothing.
 *
 * **A tune is a mood and a seed**, never audio — the same two numbers a thing's
 * sound already stores (see soundSynth.ts). The waveform is rebuilt on load, so
 * the same tune is the same tune on every device.
 *
 * Pure: no Phaser, no DOM beyond the one base64 call it borrows. The rules are
 * testable on their own, the same split soundSynth.ts and customEntity.ts use.
 */

/** Matches soundSynth.ts and generate-sfx.py, so a tune and an effect sit in the
 * same family rather than one being conspicuously crisper. */
const RATE = 22050;

/** Headroom. Bass and melody stack, and a clipped tune reads as a fault rather
 * than as loud music. */
const PEAK = 0.5;

/** How long the fade at each end of the loop is. Long enough to smooth a step
 * (a single sample's jump is a click), short enough that nobody hears the tune
 * duck. Exported only so the tests can assert on the same number. */
export const SEAM_FADE_SECONDS = 0.02;

/**
 * The moods a level can play.
 *
 * Named for **feel, not waveform** — the same reason the sound presets are
 * events ("pickup", "hit") rather than timbres. "What should this level feel
 * like?" is a question a child can answer; "what oscillator is it?" is not.
 */
export const TUNE_MOODS = ["jolly", "spooky", "busy", "calm"] as const;

export type TuneMood = (typeof TUNE_MOODS)[number];

export function isTuneMood(value: string): value is TuneMood {
  return (TUNE_MOODS as readonly string[]).includes(value);
}

/**
 * **The whole reason this module is small.**
 *
 * A major pentatonic scale has no semitone clashes in it, so *any* sequence of
 * these degrees sounds like music. That removes harmony from the problem
 * entirely: no chord rules, no voice leading, no avoid-notes. A seeded shuffle
 * of these is a tune, which is what lets four moods be a table of five numbers
 * each rather than four hand-written scores.
 *
 * Semitones above the root: root, major 2nd, major 3rd, 5th, major 6th.
 */
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];

/**
 * The minor pentatonic, for the mood that wants to sound uneasy.
 *
 * Same trick, different colour: root, minor 3rd, 4th, 5th, minor 7th. Still no
 * clashing pair, so "spooky" needs no more machinery than "jolly" does.
 */
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];

interface MoodSpec {
  /** Semitones from A2 (110Hz). Where the tune sits. */
  root: number;
  scale: readonly number[];
  /** Seconds per beat. */
  beat: number;
  /** Beats in the loop. Kept short: a loop you notice repeating is worse than a
   * loop you do not, and every extra beat is samples to render and hold. */
  beats: number;
  /** How far the melody may leap between beats, in scale degrees. Small is
   * singable; large is restless. */
  leap: number;
  /** Chance a beat is a rest. Silence is what stops a tune sounding like a
   * machine, and it is one number rather than a rhythm engine. */
  rest: number;
  /** Square-wave duty for the melody. 0.5 is round, 0.125 is thin and reedy. */
  duty: number;
}

/**
 * Four rows, and every difference between the moods lives here.
 *
 * `beat × beats` is deliberately close to eight seconds in all four, which is
 * long enough not to nag and short enough to render in a few milliseconds. The
 * *beat counts* differ wildly (16 to 48) because the tempos do: "busy" gets its
 * feel from short beats, not from a longer loop.
 */
const MOODS: Record<TuneMood, MoodSpec> = {
  jolly: { root: 3, scale: MAJOR_PENTATONIC, beat: 0.25, beats: 32, leap: 2, rest: 0.15, duty: 0.5 },
  spooky: { root: -2, scale: MINOR_PENTATONIC, beat: 0.42, beats: 20, leap: 3, rest: 0.3, duty: 0.125 },
  busy: { root: 5, scale: MAJOR_PENTATONIC, beat: 0.16, beats: 48, leap: 3, rest: 0.08, duty: 0.25 },
  calm: { root: 0, scale: MAJOR_PENTATONIC, beat: 0.55, beats: 16, leap: 1, rest: 0.35, duty: 0.5 },
};

/** A2, the note every `root` above is measured from. Low enough that the bass
 * has somewhere to go and the melody two octaves up still sits in the range a
 * small speaker can actually reproduce. */
const BASE_HZ = 110;

/** A small deterministic PRNG (mulberry32), the same one soundSynth.ts uses and
 * for the same reason: the seed *is* the tune. Copied rather than exported from
 * there because that module is deliberately closed around its own primitives —
 * six lines is a smaller cost than widening its surface. */
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

/** Semitones to Hz, equal temperament. */
function hz(semitones: number): number {
  return BASE_HZ * Math.pow(2, semitones / 12);
}

function square(phase: number, duty: number): number {
  const cycle = (phase / (2 * Math.PI)) % 1;
  return (cycle < 0 ? cycle + 1 : cycle) < duty ? 1 : -1;
}

/**
 * Adds one note into `out`, starting at sample `at`.
 *
 * The envelope is a short attack and a long decay — the attack is what stops a
 * note starting with a click, which is the single most audible difference
 * between "a note" and "a fault", and is the same shape generate-sfx.py uses.
 * Notes are *added* rather than written, so bass and melody overlap naturally
 * and a note may ring past the beat that started it.
 */
function addNote(out: Float32Array, at: number, freq: number, seconds: number, gain: number, duty: number): void {
  const n = Math.floor(RATE * seconds);
  const attack = Math.min(220, Math.floor(n * 0.15)); // ~10ms, or less on a short note
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const index = at + i;
    if (index >= out.length) break;
    phase += (2 * Math.PI * freq) / RATE;
    const rise = i < attack ? i / attack : 1;
    const fall = Math.pow(1 - i / n, 1.6);
    out[index] += square(phase, duty) * rise * fall * gain;
  }
}

/**
 * The loop, as samples.
 *
 * Two voices and nothing else: a bass note every four beats, and a melody note
 * on most beats. That is the smallest thing that sounds composed rather than
 * random, and adding a third voice was tried and made the moods harder to tell
 * apart rather than richer.
 *
 * **Nothing rings across the loop point.** Every note is clipped at the buffer's
 * end by `addNote`, the last beat is left as a rest, and `fadeEnds` takes both
 * ends to silence. A tail that wrapped would tick once per repeat, which is
 * exactly the kind of small wrongness that is hard to place and impossible to
 * ignore — and the first two of those three measures were not enough on their
 * own, so see `fadeEnds`.
 */
export function renderTune(mood: TuneMood, seed: number): Float32Array {
  const spec = MOODS[mood];
  const random = rng(seed);
  const total = Math.floor(RATE * spec.beat * spec.beats);
  const out = new Float32Array(total);

  // Bass: the root, an octave down, once per bar. It is what makes a random
  // melody sound anchored rather than adrift.
  const barBeats = 4;
  for (let bar = 0; bar * barBeats < spec.beats; bar++) {
    const at = Math.floor(RATE * spec.beat * bar * barBeats);
    addNote(out, at, hz(spec.root - 12), spec.beat * barBeats * 0.9, PEAK * 0.45, 0.5);
  }

  // Melody: a walk through the scale, one note per beat, leaping by at most
  // `leap` degrees so it stays singable. The last beat is always a rest — see
  // the note above about the loop seam.
  let degree = 0;
  for (let beat = 0; beat < spec.beats - 1; beat++) {
    if (random() < spec.rest) continue;
    const step = Math.round((random() * 2 - 1) * spec.leap);
    degree = Math.max(0, Math.min(spec.scale.length * 2 - 1, degree + step));
    // Two octaves of the scale, so the melody has somewhere to climb without
    // the table carrying a second row of degrees.
    const octave = Math.floor(degree / spec.scale.length);
    const note = spec.scale[degree % spec.scale.length] + octave * 12;
    const at = Math.floor(RATE * spec.beat * beat);
    addNote(out, at, hz(spec.root + note + 12), spec.beat * 0.9, PEAK * 0.55, spec.duty);
  }

  return normalise(fadeEnds(removeDc(out)));
}

/**
 * Centres the waveform on zero.
 *
 * A square wave whose duty is not 0.5 spends more time high than low, so it
 * carries a constant offset — measured at -0.053 for "spooky" before this. That
 * is a twentieth of the headroom spent on a component nobody can hear, and on
 * some speakers it is an audible thump when the sound starts.
 */
function removeDc(samples: Float32Array): Float32Array {
  let sum = 0;
  for (const sample of samples) sum += sample;
  const mean = sum / samples.length;
  for (let i = 0; i < samples.length; i++) samples[i] -= mean;
  return samples;
}

/**
 * Fades the first and last few milliseconds to silence.
 *
 * A loop's seam has two sides and **both** were wrong, in different ways.
 *
 * At the end: the melody leaves the final beat as a rest, but the *bass* rings
 * for most of a bar and the last bar can still be sounding when the buffer ends
 * — "calm" finished at 0.065 rather than 0.
 *
 * At the start: `removeDc` shifts *every* sample, including the silence before
 * the first note, so on the thin-duty moods the buffer began at +0.043 rather
 * than 0. Fading only the tail moved the step from one side of the seam to the
 * other and measured as fixed, because the measurement looked at the tail. The
 * thing to measure is `|first - last|`, which is what the speaker actually
 * jumps across once per repeat, and it is pinned in the tests for that reason.
 */
function fadeEnds(samples: Float32Array): Float32Array {
  const n = Math.min(Math.floor(samples.length / 2), Math.floor(RATE * SEAM_FADE_SECONDS));
  for (let i = 0; i < n; i++) {
    const gain = i / n;
    samples[i] *= gain;
    samples[samples.length - 1 - i] *= gain;
  }
  return samples;
}

/**
 * Scales the loudest sample to `PEAK`.
 *
 * Two voices overlapping means the peak depends on how the notes happened to
 * land, so without this one seed would be twice as loud as another — and the
 * quiet ones would be inaudible under the sound effects rather than merely
 * quieter. A silent buffer is returned untouched rather than divided by zero.
 */
function normalise(samples: Float32Array): Float32Array {
  let peak = 0;
  for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return samples;
  const scale = PEAK / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return samples;
}

/** The one call the rest of the app needs: a mood in, a playable data URL out. */
export function tuneDataUrl(mood: TuneMood, seed: number): string {
  return toWavDataUrl(renderTune(mood, seed));
}
