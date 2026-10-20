"""Jamal Dawn — the notification sound of Jamal Life (original, generated from scratch).

Soft and natural, like a quiet morning outside: a single water drop, two warm kalimba notes
(a calm major-pentatonic step, D6 → A5), a light breath of wind under them and a tiny distant
bird call at the end. No sharp attack, nothing shrill.
74.1 — louder, because reminders were sometimes missed: the phrase plays twice (about 3.5 s), a gentle compressor
and a soft limiter lift the average loudness by about 10 dB (−18.7 → −8.6 dBFS) and the peak goes to 0.95. Run:  python3 tools/make-dawn.py
Writes android/app/src/main/res/raw/jamal_dawn.wav and sounds/jamal-dawn.wav.
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
PHRASE = 2.2   # one «drop + two kalimba notes + bird»
AGAIN = 1.3    # the phrase starts again here, so the whole sound is about 3.5 s
DUR = AGAIN + PHRASE
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


for start, amp in ((0.0, 1.0), (AGAIN, 1.0)):   # the melody twice, the second time just as loud
    drop(start + 0.00, 0.30 * amp)
    kalimba(1174.66, start + 0.06, 0.55 * amp)      # D6
    kalimba(880.00, start + 0.30, 0.50 * amp, 2.2)  # A5 — a step down, calm
    kalimba(587.33, start + 0.30, 0.20 * amp, 2.0)  # D5 under it, warmth
bird(AGAIN + 1.15, 0.035)

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
out = out / np.max(np.abs(out))


def compress(x, threshold_db=-32.0, ratio=4.0, attack=0.0015, release=0.15):
    """A gentle feed-forward compressor (RMS detector, soft knee): the quiet tails of the notes come up,
    the attacks stay round. Returns the signal before make-up gain."""
    p = x * x
    env = np.empty_like(p)
    a_att, a_rel, e = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR)), 0.0
    for i, v in enumerate(p):
        k = a_att if v > e else a_rel
        e = k * e + (1 - k) * v
        env[i] = e
    level = 10 * np.log10(env + 1e-12)
    over = np.maximum(0.0, level - threshold_db)
    knee = 6.0
    soft = np.where(over < knee, over * over / (2 * knee), over - knee / 2)
    gain_db = -soft * (1 - 1 / ratio)
    return x * 10 ** (gain_db / 20)


out = compress(out)
out = out / np.max(np.abs(out))
# 74.1: a soft saturating limiter (tanh): loud parts are rounded smoothly, quiet ones come up — about +3 dB more
# average loudness than plain peak normalisation, no hard clipping (the owner: reminders were still too quiet)
LIMIT_DRIVE = 1.5
out = np.tanh(LIMIT_DRIVE * out) / np.tanh(LIMIT_DRIVE)
out = out * 0.95  # -0.45 dB peak: clearly audible, no clipping
pcm = (out * 32767).astype(np.int16)

for path in ("android/app/src/main/res/raw/jamal_dawn.wav", "sounds/jamal-dawn.wav"):
    wavfile.write(path, SR, pcm)
    rms = np.sqrt(np.mean(out ** 2))
    print("wrote", path, f"{len(pcm) / SR:.2f}s, peak {np.max(np.abs(out)):.2f}, RMS {20 * np.log10(rms):.1f} dBFS")
