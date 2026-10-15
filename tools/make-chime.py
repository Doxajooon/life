"""Jamal Glass — the notification tone of Jamal Life (original, generated from scratch).

A soft glassy pluck in the spirit of modern phone tones: two gentle chords
(A major → its brighter inversion) with bell partials, a quick but not sharp attack,
a warm low-pass and a short airy room tail. Run:  python3 tools/make-chime.py
Writes android/app/src/main/res/raw/jamal_glow.wav and sounds/jamal-glass.wav.
"""
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 44100
DUR = 1.9
t = np.arange(int(SR * DUR)) / SR
out = np.zeros_like(t)


def pluck(freq, start, amp, decay=3.2, detune=0.0):
    """One glassy note: fundamental + soft bell partials, smooth 9 ms attack, exponential decay."""
    n0 = int(start * SR)
    tt = t[n0:] - start
    env = (1 - np.exp(-tt / 0.009)) * np.exp(-tt * decay)
    tone = np.zeros_like(tt)
    for ratio, gain, extra_decay in ((1.0, 1.0, 0.0), (2.0, 0.28, 1.6), (3.01, 0.10, 3.5), (4.2, 0.035, 7.0)):
        f = freq * ratio
        tone += gain * np.exp(-tt * extra_decay) * (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * (f + detune) * tt))
    out[n0:] += amp * env * tone


# chord 1 (A5 + E6 + C#7 softly), chord 2 a little later and brighter (C#6 + A6) — rises, never shrill
for f, a in ((880.0, 0.55), (1318.51, 0.38), (2217.46, 0.10)):
    pluck(f, 0.00, a, decay=3.6, detune=0.9)
for f, a in ((1108.73, 0.50), (1760.0, 0.42), (2637.02, 0.08)):
    pluck(f, 0.16, a, decay=3.0, detune=1.1)
# a quiet sparkle on top that fades fast
pluck(3520.0, 0.17, 0.05, decay=9.0)

# warm the top end
out = sosfilt(butter(2, 6200, "lowpass", fs=SR, output="sos"), out)
# remove rumble
out = sosfilt(butter(1, 180, "highpass", fs=SR, output="sos"), out)


def room(x):
    """Tiny Schroeder reverb: 4 combs + 2 all-passes, mixed low for an airy tail."""
    def comb(sig, delay_ms, fb):
        d = int(SR * delay_ms / 1000)
        y = np.copy(sig)
        for i in range(d, len(y)):
            y[i] += fb * y[i - d]
        return y

    def allpass(sig, delay_ms, g):
        d = int(SR * delay_ms / 1000)
        y = np.zeros_like(sig)
        for i in range(len(sig)):
            xd = sig[i - d] if i >= d else 0.0
            yd = y[i - d] if i >= d else 0.0
            y[i] = -g * sig[i] + xd + g * yd
        return y

    w = sum(comb(x, ms, 0.62) for ms in (29.7, 37.1, 41.1, 43.7)) / 4
    w = allpass(allpass(w, 5.0, 0.7), 1.7, 0.7)
    return w


wet = room(out)
mix = out * 0.82 + wet * 0.30
# gentle fade at the very end
fade = int(0.25 * SR)
mix[-fade:] *= np.linspace(1, 0, fade) ** 2
mix = mix / np.max(np.abs(mix)) * 0.70  # about -3 dB peak: pleasant, not loud
pcm = (mix * 32767).astype(np.int16)

for path in ("android/app/src/main/res/raw/jamal_glow.wav", "sounds/jamal-glass.wav"):
    wavfile.write(path, SR, pcm)
    print("wrote", path, f"{len(pcm) / SR:.2f}s")
