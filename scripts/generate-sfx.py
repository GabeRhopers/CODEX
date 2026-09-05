#!/usr/bin/env python3
"""Synthesises the game's sound effects into public/assets/audio/sfx/.

Until 2026-09-05 this project made no sound at all. `this.sound.play` appeared
nowhere in src/: a platformer where jumping, taking a coin and reaching the goal
are all completely silent, which reads as broken within about three seconds of
picking it up. These seven are the answer to that.

**Synthesised rather than downloaded, and that is the point.** A CC0 pack (Kenney
has a good one) would have meant a fetch, a vendored blob, and a licence line to
keep true. These are a few hundred lines of arithmetic, so they are ours
outright, they are tiny, and the shape of each one is editable here rather than
being a file nobody can change. Stdlib `wave` plus numpy — no encoder, no
dependency this repo did not already have.

**They ship with the app, never inside a published game bundle.** A bundle is
somebody's game — levels, worlds, pictures — and these belong to the player's
experience of *any* game, so every published link gets them for free with no
author action and no per-game download. See gameBundle.ts for what a bundle does
carry.

Format: mono, 22050Hz, 16-bit PCM. WAV rather than MP3 because at these lengths
the compression saves a few KB and costs an encoder dependency; the whole set is
about 80KB. Phaser decodes WAV natively (see BootScene's preload).

Idempotent in the sense that matters: it recomputes the same samples from the
same constants every run, so re-running it produces byte-identical files. There
is no "already done" check because there is nothing expensive to skip.
"""

import math
import os
import struct
import wave
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
SFX_DIR = REPO_ROOT / "public" / "assets" / "audio" / "sfx"

RATE = 22050
# Headroom below full scale. Several of these stack two or three partials, and
# clipping a square wave sounds like a fault rather than like a loud noise.
PEAK = 0.62


def _t(duration: float) -> np.ndarray:
    """The time axis, in seconds, for a clip of this length."""
    return np.linspace(0.0, duration, int(RATE * duration), endpoint=False)


def _sine(freq: np.ndarray | float, t: np.ndarray) -> np.ndarray:
    """A sine at a possibly-varying frequency.

    `freq` may be an array, which is what makes the swept sounds (jump, hurt)
    possible: the phase is the running integral of frequency, not `freq * t`.
    Using `freq * t` with a varying freq bends the pitch *and* smears the phase,
    which is audible as a warble rather than a glide.
    """
    if np.isscalar(freq):
        return np.sin(2 * np.pi * float(freq) * t)
    phase = 2 * np.pi * np.cumsum(np.asarray(freq)) / RATE
    return np.sin(phase)


def _square(freq: np.ndarray | float, t: np.ndarray, duty: float = 0.5) -> np.ndarray:
    """A square wave, built from the same phase integral as _sine.

    Hard-edged on purpose: the arcade blip these sounds are reaching for is a
    square, and a sine version of the jump reads as a bubble.
    """
    if np.isscalar(freq):
        phase = 2 * np.pi * float(freq) * t
    else:
        phase = 2 * np.pi * np.cumsum(np.asarray(freq)) / RATE
    return np.where((phase / (2 * np.pi)) % 1.0 < duty, 1.0, -1.0)


def _decay(t: np.ndarray, tau: float, attack: float = 0.004) -> np.ndarray:
    """A percussive envelope: a very short attack, then exponential decay.

    The attack is not decoration. A waveform that starts at full amplitude on
    sample zero begins with a step, and a step is a click — audible on every
    single pickup, which is exactly the sort of small wrongness that makes a
    game feel cheap.
    """
    env = np.exp(-t / tau)
    ramp = np.clip(t / attack, 0.0, 1.0)
    return env * ramp


def _fade_out(wave_data: np.ndarray, seconds: float = 0.012) -> np.ndarray:
    """Ramps the last few milliseconds to zero — the same anti-click argument as
    _decay's attack, applied to the other end, for the clips that stop while
    still audible."""
    n = min(int(RATE * seconds), len(wave_data))
    if n <= 0:
        return wave_data
    tail = np.linspace(1.0, 0.0, n)
    out = wave_data.copy()
    out[-n:] *= tail
    return out


def _normalise(wave_data: np.ndarray) -> np.ndarray:
    peak = float(np.max(np.abs(wave_data))) or 1.0
    return wave_data / peak * PEAK


# --- the seven sounds ------------------------------------------------------
#
# Each returns a float array in roughly [-1, 1]; _write does the scaling. The
# frequencies are deliberately musical (A-ish minor pentatonic, near 440Hz)
# rather than arbitrary, so that hearing several in quick succession — which is
# what collecting a row of coins is — does not sound like a car alarm.


def jump() -> np.ndarray:
    """A short rising square: the sound of going up."""
    t = _t(0.12)
    sweep = np.linspace(330.0, 720.0, len(t))
    return _normalise(_square(sweep, t, duty=0.45) * _decay(t, 0.05))


def coin() -> np.ndarray:
    """Two notes, low then high, the classic pickup blip. Short, because you
    hear it more often than anything else here."""
    t = _t(0.15)
    half = len(t) // 2
    freq = np.concatenate([np.full(half, 988.0), np.full(len(t) - half, 1319.0)])
    return _normalise(_square(freq, t, duty=0.5) * _decay(t, 0.09))


def heart() -> np.ndarray:
    """A soft rising triad — warmer than the coin, because getting health back
    should feel like relief rather than like scoring."""
    t = _t(0.28)
    third = len(t) // 3
    freq = np.concatenate(
        [np.full(third, 523.25), np.full(third, 659.25), np.full(len(t) - 2 * third, 783.99)]
    )
    body = _sine(freq, t) + 0.3 * _sine(freq * 2, t)
    return _normalise(body * _decay(t, 0.16, attack=0.01))


def key() -> np.ndarray:
    """A bright metallic ping: two close partials beating against each other,
    which is what makes small metal objects sound like small metal objects."""
    t = _t(0.22)
    body = _sine(1760.0, t) + 0.7 * _sine(2637.0, t) + 0.35 * _sine(3520.0, t)
    return _normalise(body * _decay(t, 0.07))


def chest() -> np.ndarray:
    """A creak down, then a resolving chord up — the lid, then the reward. The
    only sound here with two distinct halves, because opening a chest is two
    things happening."""
    t = _t(0.4)
    split = int(len(t) * 0.35)
    creak = _square(np.linspace(220.0, 130.0, split), t[:split], duty=0.3) * 0.5
    chord_t = t[split:] - t[split]
    chord = (
        _sine(392.0, chord_t) + _sine(523.25, chord_t) + _sine(659.25, chord_t)
    ) * _decay(chord_t, 0.18, attack=0.008)
    return _normalise(np.concatenate([creak * _decay(t[:split], 0.12), chord]))


def hurt() -> np.ndarray:
    """A falling saw with noise mixed in. Noise is what separates "I was hit"
    from every pleasant sound above it — none of the others have any."""
    t = _t(0.22)
    sweep = np.linspace(420.0, 90.0, len(t))
    # A saw as the first few harmonics rather than scipy's sawtooth, which is
    # one dependency more than this file is worth.
    saw = sum(_sine(sweep * k, t) / k for k in (1, 2, 3, 4))
    rng = np.random.default_rng(20260905)  # seeded, so the file is reproducible
    noise = rng.uniform(-1.0, 1.0, len(t))
    return _normalise((saw * 0.7 + noise * 0.5) * _decay(t, 0.09))


def goal() -> np.ndarray:
    """A four-note rising fanfare. The longest of the set, and allowed to be:
    you hear it once per level, at the moment the level is over."""
    notes = [523.25, 659.25, 783.99, 1046.50]
    per = 0.15
    parts = []
    for i, f in enumerate(notes):
        nt = _t(per)
        # The last note rings on rather than being clipped to the same length as
        # the three that lead into it.
        tau = 0.35 if i == len(notes) - 1 else 0.1
        voice = (_sine(f, nt) + 0.4 * _sine(f * 2, nt) + 0.2 * _square(f, nt)) * _decay(nt, tau)
        parts.append(voice)
    return _normalise(np.concatenate(parts))


SOUNDS = {
    "jump": jump,
    "coin": coin,
    "heart": heart,
    "key": key,
    "chest": chest,
    "hurt": hurt,
    "goal": goal,
}


def _write(path: Path, samples: np.ndarray) -> int:
    faded = _fade_out(samples)
    pcm = np.clip(faded, -1.0, 1.0)
    ints = (pcm * 32767).astype("<i2")
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(ints.tobytes())
    return os.path.getsize(path)


def main() -> None:
    SFX_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    for name, make in SOUNDS.items():
        size = _write(SFX_DIR / f"{name}.wav", make())
        total += size
        print(f"{name + '.wav':16s} {size / 1024:6.1f}KB")
    print(f"{'TOTAL':16s} {total / 1024:6.1f}KB")


if __name__ == "__main__":
    main()
