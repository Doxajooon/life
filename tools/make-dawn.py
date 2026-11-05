"""Life — the reminder sound (75.15, original, generated from scratch).

One short crisp glass chime, like a phone's own notification tone: three clean bell notes going up
(E6 → G#6 → B6) and a soft high answer (E7). Each note has a very short attack (2 ms) so it is clear and
precise, a bell-like body (fundamental + octave + the inharmonic 2.76x partial that fades fast) and dies away
to silence by itself. No noise, no stream, no bird: only the tone, so it is never muddy.  About 1.9 s.
The level comes from a gentle peak normalisation (no saturating limiter), so the waveform stays clean.
The file names stay the same (res/raw/jamal_dawn.wav, sounds/jamal-dawn.wav), so the Android notification
channels keep working without being recreated.  Run:  python3 tools/make-dawn.py
"""
import numpy as np
from scipy.io import wavfile

SR = 44100
DUR = 1.9
t = np.arange(int(SR * DUR)) / SR
out = np.zeros_like(t)


def bell(freq, start, amp, decay=3.6):
    n0 = int(start * SR)
    tt = t[n0:] - start
    attack = 1 - np.exp(-tt / 0.002)
    body = np.exp(-tt * decay)
    tone = (np.sin(2 * np.pi * freq * tt)
            + 0.30 * np.sin(2 * np.pi * 2 * freq * tt) * np.exp(-tt * 5)
            + 0.14 * np.sin(2 * np.pi * 2.76 * freq * tt) * np.exp(-tt * 11)
            + 0.06 * np.sin(2 * np.pi * 5.4 * freq * tt) * np.exp(-tt * 24))
    out[n0:] += amp * attack * body * tone


for freq, start, amp, decay in [(1318.51, 0.00, 1.00, 3.8), (1661.22, 0.16, 0.95, 3.6), (1975.53, 0.32, 0.95, 3.4), (2637.02, 0.62, 0.55, 3.0)]:
    bell(freq, start, amp, decay)

# a short soft echo makes the bells sound round, not dry
echo = np.zeros_like(out)
for k, (d, g) in enumerate([(0.11, 0.22), (0.23, 0.10)]):
    n = int(d * SR)
    echo[n:] += g * out[:-n]
out = out + echo

# fade the very end to exact silence (no click) and normalise the peak to 0.90
fade = int(0.12 * SR)
out[-fade:] *= np.linspace(1, 0, fade) ** 2
out = out / np.max(np.abs(out)) * 0.90
pcm = (out * 32767).astype(np.int16)
for path in ("sounds/jamal-dawn.wav", "android/app/src/main/res/raw/jamal_dawn.wav"):
    wavfile.write(path, SR, pcm)
rms = 20 * np.log10(np.sqrt(np.mean(out ** 2)))
print(f"{DUR:.2f} s, peak 0.90, rms {rms:.1f} dBFS")
