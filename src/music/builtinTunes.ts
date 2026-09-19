import { isTuneMood, tuneDataUrl, type TuneMood } from "../audio/musicSynth";

/**
 * The four tunes a level can play without anybody uploading anything.
 *
 * This file is to `musicSynth.ts` exactly what `staticBackgrounds.ts` is to the
 * background images: the *catalogue*, kept away from the thing that renders it.
 * The synthesiser knows moods and seeds; this knows what they are called on
 * screen, which id is stored in a level, and how to tell a built-in apart from
 * an uploaded track. Splitting them is what keeps `musicSynth.ts` free of
 * anything user-facing, the same split `soundSynth.ts` and `SOUND_LABELS` have.
 *
 * **The id carries the mood**, so `tune:jolly` needs no lookup table to play —
 * only to label. That matters because a published bundle is read by a build
 * that might be newer than the one that made it, and an id that describes
 * itself cannot be orphaned by a catalogue edit.
 */

/** The prefix that makes a built-in id impossible to confuse with a library
 * uuid. Same job as `custom:` on an invented thing's id. */
const TUNE_PREFIX = "tune:";

export interface BuiltinTuneDef {
  /** What a level stores in `customMusicId`. */
  id: string;
  /** What the picker shows. */
  label: string;
  mood: TuneMood;
  /**
   * Fixed, not rolled.
   *
   * Four named tunes behave like the four named backgrounds: you pick one and
   * it is the same one every time, for everybody. A Roll button would mean
   * per-level tune *state* in the level schema and a control the picker grid
   * has nowhere to put — worth having later, not part of "very simple".
   *
   * These four are not arbitrary: each was rendered and kept because it was the
   * best of a handful of seeds for its mood.
   */
  seed: number;
}

export const BUILTIN_TUNES: BuiltinTuneDef[] = [
  { id: "tune:jolly", label: "Jolly", mood: "jolly", seed: 7 },
  { id: "tune:spooky", label: "Spooky", mood: "spooky", seed: 3 },
  { id: "tune:busy", label: "Busy", mood: "busy", seed: 11 },
  { id: "tune:calm", label: "Calm", mood: "calm", seed: 5 },
];

/**
 * Whether an id names a built-in tune rather than an uploaded track.
 *
 * The question three places have to ask, and the reason this is one function
 * rather than three comparisons: the picker's label, playback's audio lookup,
 * and **the bundle collector**. That last one is the trap. `referencedMusicIds`
 * feeding a built-in id to `collectGameBundle` would send it hunting the
 * library for a track that was never there, and `bundleProblems` would then
 * report a missing track for a track that is perfectly fine — which is the
 * identical bug `cutSceneBackgroundIds` had to be taught to avoid.
 *
 * Parsed rather than matched against `BUILTIN_TUNES` so a level saved against a
 * mood this build no longer offers is still recognised as *a built-in* and
 * falls back to silence, instead of being mistaken for an uploaded track and
 * reported missing.
 */
export function isBuiltinTuneId(id: string): boolean {
  return id.startsWith(TUNE_PREFIX);
}

/** The mood a built-in id names, or null if this build cannot render it. */
export function tuneMoodFor(id: string): TuneMood | null {
  if (!isBuiltinTuneId(id)) return null;
  const mood = id.slice(TUNE_PREFIX.length);
  return isTuneMood(mood) ? mood : null;
}

/** The picker's label for a built-in id. Falls back to the id so an unknown
 * mood shows *something* rather than an empty button. */
export function builtinTuneLabel(id: string): string {
  return BUILTIN_TUNES.find((tune) => tune.id === id)?.label ?? id;
}

/**
 * A playable data URL for a built-in id, or null if this build cannot render
 * it (see `tuneMoodFor`).
 *
 * Rendering takes a few milliseconds and the result is several hundred
 * kilobytes, so it is memoised: Test Play, real Play and the world map all ask
 * for the same tune, and re-synthesising it each time would be waste nobody
 * asked for. The cache is safe precisely because a tune is a mood and a seed —
 * the same id is byte-identical audio, forever.
 */
const rendered = new Map<string, string>();

export function builtinTuneDataUrl(id: string): string | null {
  const cached = rendered.get(id);
  if (cached) return cached;
  const mood = tuneMoodFor(id);
  if (!mood) return null;
  const def = BUILTIN_TUNES.find((tune) => tune.id === id);
  const url = tuneDataUrl(mood, def?.seed ?? 0);
  rendered.set(id, url);
  return url;
}
