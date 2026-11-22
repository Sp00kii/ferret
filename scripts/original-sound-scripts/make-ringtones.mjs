// Original, copyright-free Ferret ringtones (loop-friendly).
//   node make-ringtones.mjs <out dir> <ffmpeg.exe>
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outDir, ffmpeg] = process.argv.slice(2);
const SR = 48000;
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

/** oscillator with per-sample frequency/amplitude; phase-accumulated */
function voice(buf, start, dur, freqAt, ampAt, wave) {
  const s0 = Math.round(start * SR);
  const n = Math.round(dur * SR);
  let phase = 0;
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * freqAt(t)) / SR;
    const edge = Math.min(1, i / (0.003 * SR), (n - i) / (0.008 * SR));
    buf[s0 + i] += ampAt(t) * edge * wave(phase);
  }
}

const sine = (p) => Math.sin(p);
// band-limited-ish square / saw from a few harmonics (no harsh aliasing)
const square = (p) => Math.sin(p) + Math.sin(3 * p) / 3 + Math.sin(5 * p) / 5 + Math.sin(7 * p) / 7;
const saw = (p) => Math.sin(p) + Math.sin(2 * p) / 2 + Math.sin(3 * p) / 3 + Math.sin(4 * p) / 4 + Math.sin(5 * p) / 5;
const marimba = (p) => Math.sin(p) + 0.35 * Math.sin(4 * p);

const tones = {
  // ferret chirps: "dook-dook-dook ... dook-dook-dook"
  "dook-ring": [3.2, (b) => {
    for (const phrase of [0, 1.35]) {
      [0, 0.12, 0.24, 0.36].forEach((at, i) =>
        voice(b, phrase + at, 0.075,
          (t) => 1250 + 80 * (i % 2) + 1000 * Math.sin(Math.PI * (t / 0.075)),
          (t) => 0.8 * Math.sin(Math.PI * (t / 0.075)) ** 1.4,
          (p) => Math.sin(p) + 0.3 * Math.sin(2 * p)));
    }
  }],
  // 8-bit arpeggio up and down, twice
  arcade: [3.0, (b) => {
    const notes = [72, 76, 79, 84, 79, 76];
    for (let bar = 0; bar < 2; bar++) {
      notes.forEach((n, i) =>
        voice(b, bar * 1.2 + i * 0.1, 0.095, () => midi(n + bar * 2),
          (t) => 0.32 * Math.exp(-6 * t), square));
    }
  }],
  // bouncy pentatonic marimba line
  "marimba-bounce": [3.2, (b) => {
    const line = [[0, 79], [0.15, 76], [0.3, 81], [0.45, 79], [0.75, 84], [0.9, 81], [1.05, 79]];
    for (const phrase of [0, 1.5]) {
      for (const [at, n] of line) {
        voice(b, phrase + at, 0.5, () => midi(n), (t) => 0.5 * Math.min(1, t / 0.004) * Math.exp(-7 * t), marimba);
      }
    }
  }],
  // classic bell telephone: hammer striking two bells ~20x a second
  "retro-phone": [3.2, (b) => {
    for (const ring of [0, 1.55]) {
      voice(b, ring, 1.1,
        (t) => (Math.floor(t * 40) % 2 ? 1046 : 1318),
        (t) => 0.35 * (0.55 + 0.45 * Math.abs(Math.sin(Math.PI * 20 * t))),
        (p) => Math.sin(p) + 0.4 * Math.sin(2.7 * p));
    }
  }],
  // detuned saw arpeggio over Am - F - C - G
  synthwave: [3.6, (b) => {
    const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    chords.forEach((chord, c) => {
      for (let step = 0; step < 6; step++) {
        const n = chord[step % 3] + 12 * (step >= 3 ? 1 : 0);
        const at = c * 0.9 + step * 0.15;
        for (const detune of [-0.006, 0.006]) {
          voice(b, at, 0.16, () => midi(n) * (1 + detune), (t) => 0.13 * Math.exp(-9 * t), saw);
        }
      }
      // soft bass note under each chord
      voice(b, c * 0.9, 0.85, () => midi(chord[0] - 12), (t) => 0.22 * Math.exp(-2.5 * t), sine);
    });
  }],
};

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

mkdirSync(outDir, { recursive: true });
for (const [name, [length, render]] of Object.entries(tones)) {
  const buf = new Float32Array(Math.round(length * SR));
  render(buf);
  // level by loudness (RMS of the sounding parts), capped so peaks never clip
  let sum = 0, count = 0, peak = 0;
  for (const v of buf) { peak = Math.max(peak, Math.abs(v)); if (Math.abs(v) > 1e-4) { sum += v * v; count++; } }
  const rms = Math.sqrt(sum / (count || 1)) || 1;
  const gain = Math.min(0.17 / rms, 0.89 / (peak || 1));
  for (let i = 0; i < buf.length; i++) buf[i] *= gain;
  const tmp = join(outDir, `${name}.wav`);
  writeFileSync(tmp, wav(buf));
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", tmp, "-c:a", "libvorbis", "-q:a", "5", join(outDir, `${name}.ogg`)]);
  rmSync(tmp);
  if (r.status !== 0) throw new Error(`${name}: ${r.stderr}`);
  console.log(`${name}.ogg ${length}s`);
}
