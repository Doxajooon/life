"""Life — the prayer-time sound «Тихий колокол» (74.9, original, generated from scratch).

Calm and warm, unlike the crisp reminder chime: three slow bowl-like notes going up (D5 → F#5 → A5) and a deep D4 under
them that stays a little longer. Each note is two slightly detuned sines (the soft shimmer of a singing bowl), starts gently
(20 ms), has a bell partial that fades fast and a long round tail. About 3.4 s, no noise, nothing sharp.
The file is used by the page / Windows host (sounds/jamal-prayer.wav) and by the Android prayer channels
(res/raw/jamal_prayer.wav). Run:  python3 tools/make-prayer.py
"""
import numpy as np
from scipy.io import wavfile

SR = 44100
DUR = 3.4
t = np.arange(int(SR * DUR)) / SR
out = np.zeros_like(t)


def bowl(freq, start, amp, decay):
    n0 = int(start * SR)
    tt = t[n0:] - start
    env = (1 - np.exp(-tt / 0.02)) * np.exp(-tt * decay)
    tone = (np.sin(2 * np.pi * freq * tt) + np.sin(2 * np.pi * (freq * 1.0035) * tt)
            + 0.22 * np.sin(2 * np.pi * 2 * freq * tt) * np.exp(-tt * 2.5)
            + 0.10 * np.sin(2 * np.pi * 2.76 * freq * tt) * np.exp(-tt * 6))
    out[n0:] += amp * env * tone


for freq, start, amp, decay in [(587.33, 0.00, 1.00, 1.5), (739.99, 0.55, 0.95, 1.5), (880.00, 1.10, 0.95, 1.3), (293.66, 0.00, 0.70, 0.9)]:
    bowl(freq, start, amp, decay)

echo = np.zeros_like(out)
for d, g in [(0.19, 0.20), (0.41, 0.10)]:
    n = int(d * SR)
    echo[n:] += g * out[:-n]
out = out + echo

fade = int(0.25 * SR)
out[-fade:] *= np.linspace(1, 0, fade) ** 2
out = out / np.max(np.abs(out)) * 0.88
pcm = (out * 32767).astype(np.int16)
for path in ("sounds/jamal-prayer.wav", "android/app/src/main/res/raw/jamal_prayer.wav"):
    wavfile.write(path, SR, pcm)
print(f"{DUR:.2f} s, peak 0.88, rms {20 * np.log10(np.sqrt(np.mean(out ** 2))):.1f} dBFS")
