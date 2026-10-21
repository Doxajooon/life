"""Life «Утро» — the notification sound of Life (74.4, original, generated from scratch).

Short and clean like a phone chime, natural like a morning outside:
four soft glass-bell notes going up a major pentatonic step (C6 → E6 → G6 → C7, the last one quiet and high),
a quiet stream under them and one small bird call at the end. About 3.1 s: the phrase and its softer answer.
No saturating limiter (74.1 used one for loudness and the loud notes sounded «warm» / rough):
the level comes from a slow, smooth compressor that keeps the waveform clean.
The file names stay the same (res/raw/jamal_dawn.wav, sounds/jamal-dawn.wav), so the Android notification
channels keep working without being recreated.  Run:  python3 tools/make-dawn.py
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
DUR = 3.1
t = np.arange(int(SR * DUR)) / SR
out = np.zeros_like(t)
rng = np.random.default_rng(74)  # fixed seed: the same sound on every build


def at(start):
    n0 = int(start * SR)
    return n0, t[n0:] - start


def bell(freq, start, amp, decay=3.2):
    """A soft glass bell: the fundamental, a quiet octave and a bell-like 2.76× partial that fades fast; 3 ms attack."""
    n0, tt = at(start)
    attack = 1 - np.exp(-tt / 0.003)
    body = np.exp(-tt * decay)
    tone = (np.sin(2 * np.pi * freq * tt)
            + 0.22 * np.sin(2 * np.pi * 2 * freq * tt) * np.exp(-tt * 3)
            + 0.12 * np.sin(2 * np.pi * 2.76 * freq * tt) * np.exp(-tt * 9))
    out[n0:] += amp * attack * body * tone


def bird(start, amp):
    """One small bird call: two quick upward chirps, the second a little higher."""
    for k, (s, f0, f1, d) in enumerate([(0.0, 3100, 4300, 0.07), (0.11, 3400, 4800, 0.08)]):
        n0, tt = at(start + s)
        n = int(d * SR)
        tt = tt[:n]
        f = f0 + (f1 - f0) * np.clip(tt / d, 0, 1) ** 0.7
        phase = 2 * np.pi * np.cumsum(f) / SR
        env = np.sin(np.pi * np.clip(tt / d, 0, 1)) ** 2
        out[n0:n0 + n] += amp * (0.8 + 0.2 * k) * env * np.sin(phase)


# the melody: C6 E6 G6 C7 — calm, going up («a good start»); it answers once more, a little softer, so a reminder is not missed
for again, gain in [(0.0, 1.0), (1.2, 0.9)]:
    for freq, start, amp in [(1046.5, 0.00, 0.55), (1318.5, 0.16, 0.50), (1568.0, 0.32, 0.50), (2093.0, 0.52, 0.26)]:
        bell(freq, again + start, amp * gain, decay=1.1)

# a quiet stream: noise shaped into soft «water» (band 600–3500 Hz) with a slow ripple, swelling in and out
water = sosfilt(butter(2, [600, 3500], "bandpass", fs=SR, output="sos"), rng.standard_normal(t.size))
ripple = 0.65 + 0.35 * np.sin(2 * np.pi * 3.1 * t + 1.3 * np.sin(2 * np.pi * 0.7 * t))
swell = np.clip(t / 0.35, 0, 1) * np.clip((DUR - t) / 0.9, 0, 1)
out += 0.09 * water * ripple * swell / np.max(np.abs(water))

bird(2.45, 0.1)

out = sosfilt(butter(1, 140, "highpass", fs=SR, output="sos"), out)
fade = int(0.18 * SR)
out[-fade:] *= np.linspace(1, 0, fade) ** 2
out = out / np.max(np.abs(out))


def level(x, threshold_db=-42.0, ratio=10.0, release=0.12, look=0.004):
    """A smooth look-ahead compressor: the gain starts to fall 4 ms before a loud note and comes back slowly,
    so the waveform keeps its shape — no clipping, no saturation, the bells only get louder on average."""
    peak = np.abs(x)
    L = int(look * SR)
    ahead = np.concatenate([peak[L:], np.zeros(L)])
    win = np.maximum.reduce([np.roll(ahead, k) for k in range(L + 1)])  # the loudest sample in the next 4 ms
    r = np.exp(-1 / (release * SR))
    follow = np.zeros_like(win)
    v = 0.0
    for i, e in enumerate(win):
        v = e if e > v else r * v + (1 - r) * e
        follow[i] = v
    db = 20 * np.log10(np.maximum(follow, 1e-6))
    over = np.maximum(db - threshold_db, 0)
    return x * 10 ** (-over * (1 - 1 / ratio) / 20)


out = level(out)
out = out / np.max(np.abs(out)) * 0.93  # −0.6 dB peak

pcm = (out * 32767).astype(np.int16)
for path in ["android/app/src/main/res/raw/jamal_dawn.wav", "sounds/jamal-dawn.wav"]:
    wavfile.write(path, SR, pcm)
rms = 20 * np.log10(np.sqrt(np.mean(out ** 2)))
print(f"Life «Утро»: {DUR:.1f} s, peak {20*np.log10(np.max(np.abs(out))):.1f} dB, rms {rms:.1f} dB")
