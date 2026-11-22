// Synthesize Ferret's soundboard clips.
//   node make-sound-library.mjs <out dir> <ffmpeg.exe>
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outDir, ffmpeg] = process.argv.slice(2);
const SR = 48000;

/** oscillator whose frequency follows freqAt(t); phase-accumulated so sweeps stay smooth */
function sweep(buf, start, dur, freqAt, ampAt, wave = (p) => Math.sin(p)) {
  const s0 = Math.round(start * SR);
  const n = Math.round(dur * SR);
  let phase = 0;
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / SR;
    phase += (2 * Math.PI * freqAt(t)) / SR;
    const edge = Math.min(1, i / (0.003 * SR), (n - i) / (0.006 * SR));
    buf[s0 + i] += ampAt(t) * edge * wave(phase);
  }
}

/** struck bell with inharmonic partials */
function bell(buf, start, freq, dur) {
  const partials = [[1, 1, 1], [2.76, 0.45, 1.8], [5.4, 0.25, 3], [8.93, 0.12, 4.5]];
  for (const [mult, amp, decayMult] of partials) {
    sweep(buf, start, dur, () => freq * mult, (t) => amp * Math.min(1, t / 0.002) * Math.exp(-4 * decayMult * t));
  }
}

let seed = 7;
const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;


/** filtered noise burst (one-pole lowpass/highpass mix) */
function noiseHit(buf, start, dur, amp, decay, bright = 0.5) {
  const s0 = Math.round(start * SR);
  let lp = 0;
  for (let i = 0; i < dur * SR && s0 + i < buf.length; i++) {
    const t = i / SR;
    const n = noise();
    lp += (n - lp) * (1 - bright);
    buf[s0 + i] += amp * Math.exp(-decay * t) * (bright * (n - lp) + (1 - bright) * lp) * Math.min(1, i / 40);
  }
}
const saw = (p) => { const x = (p / (2 * Math.PI)) % 1; return 2 * x - 1; };
const brass = (p) => Math.tanh(1.6 * (Math.sin(p) + 0.5 * Math.sin(2 * p) + 0.3 * Math.sin(3 * p) + 0.2 * Math.sin(4 * p)));
const drum = (b, at, f0, amp = 1) => sweep(b, at, 0.25, (t) => f0 * (1 + 1.5 * Math.exp(-40 * t)), (t) => amp * Math.exp(-14 * t));

const library = {
  // ba-dum-tss
  rimshot: [1.3, (b) => {
    drum(b, 0, 180, 0.9); noiseHit(b, 0, 0.12, 0.35, 30, 0.6);
    drum(b, 0.16, 120, 1.0);
    noiseHit(b, 0.42, 0.9, 0.7, 4.2, 0.92);
    sweep(b, 0.42, 0.9, () => 5400, (t) => 0.08 * Math.exp(-5 * t), (p) => Math.sin(p) * Math.sin(1.41 * p));
  }],
  // three-blast air horn
  airhorn: [1.55, (b) => {
    [[0, 0.22], [0.27, 0.22], [0.54, 0.95]].forEach(([at, d]) => {
      for (const [f, a] of [[466, 0.5], [470, 0.5], [622, 0.35], [626, 0.3]]) {
        sweep(b, at, d, (t) => f * (1 + 0.012 * Math.exp(-20 * t)), (t) => a * Math.min(1, t / 0.015), saw);
      }
    });
  }],
  // wah wah wah waaah
  "sad-trombone": [2.4, (b) => {
    const notes = [[0, 0.42, 293.7], [0.45, 0.42, 277.2], [0.9, 0.42, 261.6], [1.35, 1.0, 246.9]];
    notes.forEach(([at, d, f], i) =>
      sweep(b, at, d, (t) => f * (1 - 0.03 * Math.min(1, t / 0.08)) * (i === 3 ? 1 + 0.03 * Math.sin(2 * Math.PI * 6 * t) : 1),
        (t) => 0.6 * Math.min(1, t / 0.05) * (i === 3 ? Math.exp(-1.2 * t) : 1), brass));
  }],
  // ta-daa!
  tada: [1.7, (b) => {
    for (const f of [523.3, 659.3, 784]) sweep(b, 0, 0.14, () => f, (t) => 0.32 * Math.exp(-6 * t), brass);
    for (const f of [523.3, 659.3, 784, 1046.5]) sweep(b, 0.17, 1.45, () => f * (1 + 0.004 * Math.sin(2 * Math.PI * 5.5 * Math.max(0, 0.0)) ), (t) => 0.3 * Math.min(1, t / 0.02) * Math.exp(-1.3 * t), brass);
    noiseHit(b, 0.17, 1.2, 0.25, 3, 0.9);
  }],
  // cartoon spring
  boing: [0.9, (b) => sweep(b, 0, 0.85, (t) => 210 + 160 * Math.exp(-3 * t) * Math.sin(2 * Math.PI * 14 * t) + 90 * t,
    (t) => 0.8 * Math.min(1, t / 0.01) * Math.exp(-3.6 * t), (p) => Math.sin(p) + 0.25 * Math.sin(2 * p))],
  // awkward-silence crickets
  crickets: [2.2, (b) => {
    for (let k = 0; k < 4; k++) {
      const at = k * 0.55;
      for (let j = 0; j < 3; j++) {
        sweep(b, at + j * 0.045, 0.03, () => 4300, (t) => 0.5 * Math.sin(Math.PI * t / 0.03), (p) => Math.sin(p) * (0.6 + 0.4 * Math.sin(p / 9)));
      }
    }
  }],
  // drumroll into a crash
  drumroll: [2.3, (b) => {
    for (let t = 0; t < 1.4; t += 0.045) noiseHit(b, t, 0.06, 0.25 + 0.35 * (t / 1.4), 40, 0.45);
    drum(b, 1.45, 90, 1.0);
    noiseHit(b, 1.45, 0.85, 0.8, 3.5, 0.93);
  }],
  // happy ferret dook-dook
  "happy-dook": [0.7, (b) => {
    [0, 0.07, 0.14, 0.21, 0.32, 0.40].forEach((at, i) =>
      sweep(b, at, 0.05,
        (t) => (1300 + 90 * i) + 1000 * Math.sin(Math.PI * (t / 0.05)),
        (t) => 0.7 * Math.sin(Math.PI * (t / 0.05)) ** 1.5,
        (p) => Math.sin(p) + 0.3 * Math.sin(2 * p) + 0.08 * noise()));
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
for (const [name, [length, render]] of Object.entries(library)) {
  const buf = new Float32Array(Math.round(length * SR));
  render(buf);
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  for (let i = 0; i < buf.length; i++) buf[i] *= 0.7 / peak;
  const tmp = join(outDir, `${name}.wav`);
  writeFileSync(tmp, wav(buf));
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", tmp, "-c:a", "libvorbis", "-q:a", "5", join(outDir, `${name}.ogg`)]);
  rmSync(tmp);
  if (r.status !== 0) throw new Error(`${name}: ${r.stderr}`);
  console.log(`${name}.ogg ${length}s`);
}
