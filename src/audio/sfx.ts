import Phaser from "phaser";

/**
 * The game's sound effects: seven short noises that ship with the app.
 *
 * Until 2026-09-05 nothing here made a sound. `this.sound.play` appeared nowhere
 * in src/ — jumping, taking a coin and reaching the goal were all silent, which
 * is the single thing that most makes a platformer feel unfinished.
 *
 * The files are synthesised, not licensed: see scripts/generate-sfx.py, which
 * writes public/assets/audio/sfx/ from about a hundred lines of arithmetic. That
 * makes them ours outright, keeps the whole set to 86KB, and means the shape of
 * any one of them is editable rather than being a blob nobody can change.
 *
 * **These belong to the app, not to a game bundle.** A bundle carries somebody's
 * levels, worlds and pictures (see gameBundle.ts); these belong to playing *any*
 * game, so every published link gets them with no author action and nothing
 * added to that game's download.
 *
 * Volume and mute need no wiring here. `applyAudioPrefs` sets both on the game's
 * shared SoundManager once at boot (see BootScene), and VolumeControl writes
 * back to the same prefs — so every sound below inherits whatever the player
 * chose, exactly as the menu theme and a level's own music already do.
 */

/** Every sound the game can make. Kept as a tuple so the name type is derived
 * from the list rather than repeated beside it. */
export const SFX_NAMES = ["jump", "coin", "heart", "key", "chest", "hurt", "goal"] as const;

export type SfxName = (typeof SFX_NAMES)[number];

/**
 * Namespaced, because Phaser's audio cache and its texture cache are separate
 * but its *keys* are strings either way, and "key" as a bare cache key is asking
 * for a collision with the key item's own texture.
 */
export function sfxKey(name: SfxName): string {
  return `sfx-${name}`;
}

/**
 * Queues every effect for loading. Called from BootScene's preload beside the
 * menu theme — one place, once, rather than each scene loading what it happens
 * to need and the first play of a sound being silent while it fetches.
 *
 * Relative paths (no leading slash) for the same reason everything else in
 * BootScene uses them: the app is served from a subpath on GitHub Pages.
 */
export function preloadSfx(scene: Phaser.Scene): void {
  for (const name of SFX_NAMES) {
    scene.load.audio(sfxKey(name), `assets/audio/sfx/${name}.wav`);
  }
}

/**
 * Plays one effect, or does nothing at all if it is not loaded.
 *
 * The silent fallback is deliberate. These are called from the middle of
 * gameplay — a collect overlap, a jump, a hit — and a missing or undecodable
 * audio file must never be the thing that throws inside a physics callback and
 * takes the level down with it. A game with no sound is disappointing; a game
 * that crashes when you touch a coin is broken.
 */
export function playSfx(scene: Phaser.Scene, name: SfxName): void {
  const key = sfxKey(name);
  if (!scene.cache.audio.exists(key)) return;
  scene.sound.play(key);
}
