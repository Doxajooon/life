"""Life «Утро» — the notification sound of Life (74.6, original, generated from scratch).

ONE short phrase, like a phone chime (74.4 played the phrase and its softer answer — it was heard as two signals):
four soft glass-bell notes going up a major pentatonic step (C6 → E6 → G6 → C7, the last one quiet and high)
over a quiet stream, no bird. About 1.8 s, a smooth start and a long natural fade, no clicks.
No saturating limiter: the level comes from a slow, smooth look-ahead compressor that keeps the waveform clean;
the peak stays at −1.2 dB and the average is set to about −13 dBFS (heard, not harsh).
The file names stay the same (res/raw/jamal_dawn.wav, sounds/jamal-dawn.wav), so the Android notification
channels keep working without being recreated.  Run:  python3 tools/make-dawn.py
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
DUR = 1.8
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


# the melody: C6 E6 G6 C7 — calm, going up («a good start»), played once
for freq, start, amp in [(1046.5, 0.03, 0.55), (1318.5, 0.17, 0.50), (1568.0, 0.31, 0.50), (2093.0, 0.49, 0.28)]:
    bell(freq, start, amp, decay=2.4)

# a quiet stream: noise shaped into soft «water» (band 600–3500 Hz) with a slow ripple, swelling in and out
water = sosfilt(butter(2, [600, 3500], "bandpass", fs=SR, output="sos"), rng.standard_normal(t.size))
ripple = 0.65 + 0.35 * np.sin(2 * np.pi * 3.1 * t + 1.3 * np.sin(2 * np.pi * 0.7 * t))
swell = np.clip(t / 0.25, 0, 1) * np.clip((DUR - t) / 0.7, 0, 1)
out += 0.07 * water * ripple * swell / np.max(np.abs(water))

out = sosfilt(butter(1, 140, "highpass", fs=SR, output="sos"), out)
fade_in, fade = int(0.012 * SR), int(0.45 * SR)
out[:fade_in] *= np.linspace(0, 1, fade_in) ** 2   # no click at the start
out[-fade:] *= np.linspace(1, 0, fade) ** 2        # a long, natural fade
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


PEAK = 10 ** (-1.2 / 20)  # −1.2 dB peak (≤ −1 dB)
TARGET_RMS = -13.0         # dBFS: heard, not harsh
rms_db = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)))
# pick the compressor threshold that gives the target average level (the peak is set the same way every time)
lo, hi = -60.0, 0.0
for _ in range(18):
    mid = (lo + hi) / 2
    y = level(out, threshold_db=mid, ratio=4.0)
    y = y / np.max(np.abs(y)) * PEAK
    lo, hi = (lo, mid) if rms_db(y) < TARGET_RMS else (mid, hi)
out = level(out, threshold_db=(lo + hi) / 2, ratio=4.0)
out = out / np.max(np.abs(out)) * PEAK

pcm = (out * 32767).astype(np.int16)
for path in ["android/app/src/main/res/raw/jamal_dawn.wav", "sounds/jamal-dawn.wav"]:
    wavfile.write(path, SR, pcm)
rms = 20 * np.log10(np.sqrt(np.mean(out ** 2)))
print(f"Life «Утро» (one phrase): {DUR:.1f} s, peak {20*np.log10(np.max(np.abs(out))):.1f} dB, rms {rms:.1f} dB")
