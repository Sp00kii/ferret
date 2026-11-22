// Synthesize Ferret's general-purpose sound library (pickable for any sound).
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

const library = {
  // bubble "pop": fast downward pitch drop with a tiny noise transient
  pop: [0.18, (b) => {
    sweep(b, 0, 0.12, (t) => 950 * Math.exp(-22 * t) + 260, (t) => 0.9 * Math.exp(-28 * t));
    for (let i = 0; i < 0.006 * SR; i++) b[i] += 0.25 * noise() * (1 - i / (0.006 * SR));
  }],
  // single clear "ding"
  bell: [1.1, (b) => bell(b, 0, 1760, 1.1)],
  // short soft digital blip
  blip: [0.12, (b) => sweep(b, 0, 0.09, () => 1250, (t) => 0.8 * Math.exp(-30 * t),
    (p) => Math.tanh(2.2 * Math.sin(p)))],
  // squeaky toy: up then down, with a little wobble
  squeak: [0.32, (b) => sweep(b, 0, 0.28,
    (t) => (t < 0.11 ? 1500 + 9500 * t : 2545 - 3200 * (t - 0.11)) * (1 + 0.025 * Math.sin(2 * Math.PI * 38 * t)),
    (t) => 0.75 * Math.min(1, t / 0.02) * Math.exp(-3 * t),
    (p) => Math.sin(p) + 0.35 * Math.sin(2 * p) + 0.12 * Math.sin(3 * p))],
  // cartoon nose "boop"
  boop: [0.22, (b) => sweep(b, 0, 0.18, (t) => 620 - 1500 * t, (t) => 0.85 * Math.min(1, t / 0.012) * Math.exp(-11 * t),
    (p) => Math.sin(p) + 0.2 * Math.sin(2 * p))],
  // ferret "dook-dook-dook": a run of quick chirps
  dook: [0.42, (b) => {
    [0, 0.085, 0.17, 0.255].forEach((at, i) =>
      sweep(b, at, 0.055,
        (t) => (1180 + 60 * i) + 900 * Math.sin(Math.PI * (t / 0.055)),
        (t) => 0.7 * Math.sin(Math.PI * (t / 0.055)) ** 1.5,
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
