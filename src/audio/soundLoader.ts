import Phaser from "phaser";
import { soundDataUrl, type SoundSpec } from "./soundSynth";

/**
 * Gets an invented thing's synthesised noise into Phaser's audio cache.
 *
 * The counterpart to `skins/skinLoader.ts` for sound, and shaped like it on
 * purpose — the two problems are the same one. A thing's sound is stored as two
 * numbers (`{ preset, seed }`, see `soundSynth.ts`), so the audio does not exist
 * until it is asked for, and it has to be decoded at run time before it can
 * play.
 *
 * `WebAudioSoundManager.decodeAudio(key, data)` does that work: it accepts a
 * base64 string, decodes it off the main thread and puts the buffer in
 * `cache.audio` before emitting `DECODED`. It takes the full
 * `data:audio/wav;base64,…` URL as-is — Phaser's own `Base64ToArrayBuffer`
 * strips everything up to the first comma — so nothing here has to unwrap what
 * `soundDataUrl` produces.
 */

/** How long to wait for a decode before giving up on one sound. Same value as
 * skinLoader's texture timeout, for the same reason. */
const DECODE_TIMEOUT_MS = 8000;

/** Keys already decoded from this exact data, so a repeated register is free. */
const loadedByKey = new Map<string, string>();

/**
 * The cache key for a thing's sound.
 *
 * Namespaced, because Phaser's audio cache and its texture cache are separate
 * stores addressed by plain strings — the same collision `sfxKey`'s `sfx-`
 * prefix avoids. A custom entity id is already `custom:<uuid>`, which is unique,
 * but the prefix says *what kind of thing* the key is when it shows up in a
 * cache dump or a test assertion.
 */
export function soundKeyFor(defId: string): string {
  return `thing-sfx-${defId}`;
}

/**
 * Decodes one thing's sound and **always settles**.
 *
 * The `null` return and the timeout are the point, and they are not
 * speculative: `registerTexture` shipped with a single resolve path on an event
 * that could never arrive, and one stuck texture silently stopped an entire
 * sequential batch — a bug that was misdiagnosed twice before being caught. The
 * decode path here has exactly the same shape, including a failure callback
 * Phaser only logs, so it gets the same guard rather than waiting to learn the
 * lesson twice.
 *
 * Returns the key on success, `null` if the sound could not be decoded or if
 * this browser has no Web Audio at all. Callers must treat `null` as "this one
 * is silent", never as an error worth stopping for: a game that loses a noise
 * is disappointing, a game that fails to start because of one is broken.
 */
export function registerSound(scene: Phaser.Scene, key: string, spec: SoundSpec): Promise<string | null> {
  const dataUrl = soundDataUrl(spec);
  if (loadedByKey.get(key) === dataUrl && scene.cache.audio.exists(key)) {
    return Promise.resolve(key);
  }

  const manager = scene.sound as Phaser.Sound.BaseSoundManager & {
    decodeAudio?: (key: string, data: string) => void;
  };
  // `decodeAudio` lives on the Web Audio manager only. Phaser falls back to an
  // HTML5 manager when Web Audio is unavailable, and there the method simply is
  // not there — so this is a capability check, not defensiveness about types.
  const decode = manager.decodeAudio;
  // Captured into a local, not just narrowed in place: `decodeAudio` is a
  // mutable property, so TypeScript drops the narrowing again inside the
  // callback below — correctly, since nothing stops it changing in between.
  if (typeof decode !== "function") return Promise.resolve(null);

  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    const settle = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const onDecoded = (decodedKey: string): void => {
      if (decodedKey !== key) return;
      clearTimeout(timer);
      manager.off(Phaser.Sound.Events.DECODED, onDecoded);
      loadedByKey.set(key, dataUrl);
      settle(key);
    };

    const timer = setTimeout(() => {
      // Detached here too, not only on the happy path. A listener left behind by
      // every timed-out decode would accumulate on a manager that lives as long
      // as the game does, and would then fire against a promise that has already
      // settled.
      manager.off(Phaser.Sound.Events.DECODED, onDecoded);
      console.error(
        `Sound "${key}" never finished decoding after ${Date.now() - startedAt}ms; it will be silent.`,
      );
      settle(null);
    }, DECODE_TIMEOUT_MS);
    // `on`, not `once`: DECODED fires for every decode this manager runs, and
    // several things can be decoding at the same time, so this has to ignore
    // the ones that are not its own rather than consume the first that arrives.
    manager.on(Phaser.Sound.Events.DECODED, onDecoded);
    decode.call(manager, key, dataUrl);
  });
}

/** Forgets what has been decoded. Tests only — the cache is per page load. */
export function resetSoundCache(): void {
  loadedByKey.clear();
}
