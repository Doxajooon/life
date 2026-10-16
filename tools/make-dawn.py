"""Jamal Dawn — the notification sound of Jamal Life (original, generated from scratch).

Soft and natural, like a quiet morning outside: a single water drop, two warm kalimba notes
(a calm major-pentatonic step, D6 → A5), a light breath of wind under them and a tiny distant
bird call at the end. No sharp attack, nothing shrill, about 2.2 s. Run:  python3 tools/make-dawn.py
Writes android/app/src/main/res/raw/jamal_dawn.wav and sounds/jamal-dawn.wav.
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
DUR = 2.2
t = np.arange(int(SR * DUR)) / SR
out = np.zeros_like(t)
rng = np.random.default_rng(71)  # fixed seed: the same sound on every build


def at(start):
    n0 = int(start * SR)
    return n0, t[n0:] - start


def drop(start, amp):
    """A water drop: a short sine whose pitch glides up quickly (that 'plip'), soft 4 ms attack."""
    n0, tt = at(start)
    f = 700 + 900 * (1 - np.exp(-tt / 0.03))
    phase = 2 * np.pi * np.cumsum(f) / SR
    env = (1 - np.exp(-tt / 0.004)) * np.exp(-tt * 22)
    out[n0:] += amp * env * np.sin(phase)


def kalimba(freq, start, amp, decay=2.6):
    """A warm kalimba / soft marimba note: fundamental + an inharmonic tine overtone, round 12 ms attack."""
    n0, tt = at(start)
    env = (1 - np.exp(-tt / 0.012)) * np.exp(-tt * decay)
    tone = np.sin(2 * np.pi * freq * tt) + 0.18 * np.exp(-tt * 6) * np.sin(2 * np.pi * freq * 5.4 * tt) \
        + 0.08 * np.exp(-tt * 3) * np.sin(2 * np.pi * freq * 2 * tt)
    out[n0:] += amp * env * tone


def bird(start, amp):
    """A tiny distant bird: two short whistles sliding down, very quiet."""
    for k, s in enumerate((start, start + 0.13)):
        n0, tt = at(s)
        tt = tt[: int(0.09 * SR)]
        f = 3600 - 1400 * (tt / 0.09) + 120 * np.sin(2 * np.pi * 38 * tt)
        phase = 2 * np.pi * np.cumsum(f) / SR
        env = np.sin(np.pi * np.clip(tt / 0.09, 0, 1)) ** 2
        out[n0:n0 + len(tt)] += amp * (0.8 if k else 1.0) * env * np.sin(phase)


drop(0.00, 0.30)
kalimba(1174.66, 0.06, 0.55)      # D6
kalimba(880.00, 0.30, 0.50, 2.2)  # A5 — a step down, calm
kalimba(587.33, 0.30, 0.20, 2.0)  # D5 under it, warmth
bird(1.15, 0.035)

# wind: filtered noise that swells and fades, far below the notes
wind = rng.standard_normal(len(t))
wind = sosfilt(butter(2, [250, 1400], "bandpass", fs=SR, output="sos"), wind)
swell = np.sin(np.pi * np.clip(t / DUR, 0, 1)) ** 2
out += 0.045 * wind * swell / np.max(np.abs(wind))

# soften the top, drop the rumble
out = sosfilt(butter(2, 7000, "lowpass", fs=SR, output="sos"), out)
out = sosfilt(butter(1, 120, "highpass", fs=SR, output="sos"), out)

# a small open-air echo (two quiet reflections)
for delay, gain in ((0.11, 0.18), (0.23, 0.08)):
    d = int(delay * SR)
    out[d:] += gain * out[:-d].copy()

fade = int(0.35 * SR)
out[-fade:] *= np.linspace(1, 0, fade) ** 2
out = out / np.max(np.abs(out)) * 0.68  # about -3.3 dB peak: soft on the ear
pcm = (out * 32767).astype(np.int16)

for path in ("android/app/src/main/res/raw/jamal_dawn.wav", "sounds/jamal-dawn.wav"):
    wavfile.write(path, SR, pcm)
    print("wrote", path, f"{len(pcm) / SR:.2f}s")
