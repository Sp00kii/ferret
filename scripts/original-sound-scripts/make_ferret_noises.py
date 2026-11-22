"""Ferret-noise sound pack: dooks (raspy clucks), hisses and squeaks.

python make_ferret_noises.py <out dir> <ffmpeg.exe>

A real "dook" is a short, soft, raspy cluck (~40-70 ms) with a low buzzy
voice (~250-450 Hz) shaped by mouth resonances; ferrets string them into
quick runs when excited. Built here as a pulse train through two formant
resonators plus breath noise. All original synthesis, no recordings.
"""
import os
import subprocess
import sys

import numpy as np

SR = 48000
out_dir, ffmpeg = sys.argv[1:3]
os.makedirs(out_dir, exist_ok=True)
rng = np.random.default_rng(42)


def resonator(signal, freq, bandwidth):
    """Two-pole band-pass (formant)"""
    r = np.exp(-np.pi * bandwidth / SR)
    theta = 2 * np.pi * freq / SR
    a1, a2 = -2 * r * np.cos(theta), r * r
    out = np.zeros_like(signal)
    y1 = y2 = 0.0
    gain = 1 - r
    for i, x in enumerate(signal):
        y = gain * x - a1 * y1 - a2 * y2
        out[i] = y
        y2, y1 = y1, y
    return out


def dook(f0=330.0, dur=0.055, bright=1.0, glide=0.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = f0 * (1 + glide * t / dur)
    phase = np.cumsum(freq) / SR
    # glottal-ish pulses: narrow peaks once per period
    pulses = np.clip(np.cos(2 * np.pi * phase), 0, 1) ** 8
    breath = rng.normal(0, 0.35, n)
    source = pulses + breath * 0.5
    voiced = resonator(source, 900 * bright, 260) * 1.0 + resonator(
        source, 2100 * bright, 420
    ) * 0.6
    env = np.minimum(1, t / 0.006) * np.exp(-t / (dur * 0.45))
    return voiced * env


def run(starts, **kw):
    """A run of dooks at the given start times (seconds)"""
    pieces = []
    for at, extra in starts:
        pieces.append((at, dook(**{**kw, **extra})))
    length = max(at + len(p) / SR for at, p in pieces) + 0.05
    buf = np.zeros(int(length * SR))
    for at, p in pieces:
        s = int(at * SR)
        buf[s : s + len(p)] += p
    return buf


def hiss(dur=0.35, strength=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.normal(0, 1, n)
    hi = noise - resonator(noise, 600, 900)  # roughly high-pass
    shaped = resonator(hi, 5200, 3500) + resonator(hi, 3000, 2000) * 0.5
    env = np.minimum(1, t / 0.015) * np.exp(-t / (dur * 0.5))
    return shaped * env * strength


def squeak(f_start=2400.0, f_end=3200.0, dur=0.16):
    n = int(dur * SR)
    t = np.arange(n) / SR
    freq = f_start + (f_end - f_start) * (t / dur) ** 0.7
    freq *= 1 + 0.03 * np.sin(2 * np.pi * 32 * t)
    phase = 2 * np.pi * np.cumsum(freq) / SR
    tone = np.sin(phase) + 0.3 * np.sin(2 * phase) + 0.05 * rng.normal(0, 1, n)
    env = np.minimum(1, t / 0.012) * np.minimum(1, (dur - t) / 0.03)
    return tone * env * 0.5


def place(length, *parts):
    buf = np.zeros(int(length * SR))
    for at, p in parts:
        s = int(at * SR)
        e = min(len(buf), s + len(p))
        buf[s:e] += p[: e - s]
    return buf


def spaced(count, gap, f0s=None, glides=None):
    return [
        (i * gap, {"f0": (f0s[i] if f0s else 330), "glide": (glides[i] if glides else 0)})
        for i in range(count)
    ]


SOUNDS = {
    # quick "dook-dook" for a new message
    "message": lambda: run(spaced(2, 0.085, [360, 380])),
    "mute": lambda: run([(0, {"f0": 300, "glide": -0.25, "dur": 0.08})]),
    "unmute": lambda: run([(0, {"f0": 300, "glide": 0.3, "dur": 0.08})]),
    "deafen": lambda: hiss(0.28, 0.8),
    "undeafen": lambda: run(spaced(2, 0.07, [380, 430])),
    "userJoinVoice": lambda: run(spaced(3, 0.08, [300, 350, 410])),
    "userLeaveVoice": lambda: run(spaced(3, 0.09, [410, 350, 290])),
    "userMoved": lambda: place(0.45, (0, run(spaced(2, 0.08))), (0.2, squeak(2200, 2900, 0.14))),
    "streamStart": lambda: run(spaced(6, 0.065, [320, 340, 360, 380, 400, 430])),
    "streamEnd": lambda: run(spaced(2, 0.16, [360, 280])),
    "streamViewerJoin": lambda: squeak(2300, 3100, 0.13),
    "streamViewerLeave": lambda: squeak(3000, 2200, 0.13),
    # calling someone: a soft pattern with a pause, loops
    "ringtoneOutgoing": lambda: place(
        2.0, (0, run(spaced(3, 0.09, [340, 360, 340]))), (0.5, run(spaced(2, 0.09)))
    ),
    # incoming call: an excited dook party with a squeak, loops
    "ringtoneIncoming": lambda: place(
        2.4,
        (0, run(spaced(7, 0.065, [330, 350, 370, 390, 370, 350, 400]))),
        (0.55, squeak(2400, 3300, 0.18)),
        (1.0, run(spaced(5, 0.065, [340, 360, 380, 400, 430]))),
    ),
}

FILES = {
    "message": "message.ogg",
    "mute": "mute.ogg",
    "unmute": "unmute.ogg",
    "deafen": "deafen.ogg",
    "undeafen": "undeafen.ogg",
    "userJoinVoice": "user_join_voice.ogg",
    "userLeaveVoice": "user_leave_voice.ogg",
    "userMoved": "user_moved.ogg",
    "streamStart": "stream_start.ogg",
    "streamEnd": "stream_end.ogg",
    "streamViewerJoin": "stream_viewer_join.ogg",
    "streamViewerLeave": "stream_viewer_leave.ogg",
    "ringtoneOutgoing": "ringtone_outgoing.ogg",
    "ringtoneIncoming": "ringtone_incoming.ogg",
}

for slot, make in SOUNDS.items():
    audio = make()
    audio = audio / (np.max(np.abs(audio)) or 1) * 0.7
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    target = os.path.join(out_dir, FILES[slot])
    r = subprocess.run(
        [ffmpeg, "-y", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "1",
         "-i", "-", "-c:a", "libvorbis", "-q:a", "5", target],
        input=pcm,
    )
    if r.returncode:
        raise SystemExit(f"ffmpeg failed for {slot}")
    print(f"{FILES[slot]} {len(audio) / SR:.2f}s")
