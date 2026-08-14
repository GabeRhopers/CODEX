import Phaser from "phaser";

const STORAGE_KEY = "mario-maker:audio-prefs";

export interface AudioPrefs {
  volume: number; // 0-1
  muted: boolean;
}

const DEFAULT_PREFS: AudioPrefs = { volume: 0.6, muted: false };

/** Falls back to the default on missing/corrupted storage — same
 * "never let a bad persisted value break the app" spirit as
 * resolveStaticBackground's fallback for an unknown background id. */
export function loadAudioPrefs(): AudioPrefs {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    const volume = typeof parsed.volume === "number" && parsed.volume >= 0 && parsed.volume <= 1 ? parsed.volume : DEFAULT_PREFS.volume;
    const muted = typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_PREFS.muted;
    return { volume, muted };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveAudioPrefs(prefs: AudioPrefs): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

/** Applied once, right after boot (see BootScene) — `scene.sound` is the
 * *game's* SoundManager, shared by every scene, so setting its
 * volume/mute here covers every sound (menu theme, level music) any scene
 * ever plays, with no per-scene wiring needed. VolumeControl instances
 * read these same settings back out to initialize their own display. */
export function applyAudioPrefs(sound: Phaser.Sound.BaseSoundManager, prefs: AudioPrefs = loadAudioPrefs()): void {
  sound.volume = prefs.volume;
  sound.mute = prefs.muted;
}
