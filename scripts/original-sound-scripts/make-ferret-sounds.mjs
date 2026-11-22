// Synthesize Ferret's sound pack (original, license-free) as OGG files.
//   node make-ferret-sounds.mjs <out dir> <ffmpeg.exe>
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [outDir, ffmpeg] = process.argv.slice(2);
const SR = 48000;

/** bell/marimba-like note: fundamental + quickly fading upper partials */
function note(buf, start, freq, dur, opts = {}) {
  const { vol = 0.4, decay = 7, attack = 0.006, partials = [[2, 0.16, 2.2], [4, 0.08, 5]] } = opts;
  const s0 = Math.round(start * SR);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n && s0 + i < buf.length; i++) {
    const t = i / SR;
    const env = Math.min(1, t / attack) * Math.exp(-decay * t);
    // short fade at the very end so notes never click off
    const tail = Math.min(1, (n - i) / (0.01 * SR));
    let v = Math.sin(2 * Math.PI * freq * t);
    for (const [mult, amp, extraDecay] of partials) {
      v += amp * Math.sin(2 * Math.PI * freq * mult * t) * Math.exp(-decay * extraDecay * t);
    }
    buf[s0 + i] += vol * env * tail * v;
  }
}

/** steady two-frequency tone with soft edges (phone ringback) */
function dualTone(buf, start, f1, f2, dur, vol = 0.16) {
  const s0 = Math.round(start * SR);
  const n = Math.round(dur * SR);
  const fade = 0.03 * SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = Math.min(1, i / fade, (n - i) / fade);
    buf[s0 + i] += vol * env * (Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t)) / 2;
  }
}

const N = {
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880, B5: 987.77,
  C6: 1046.5, D6: 1174.66, E6: 1318.51, G6: 1567.98, C7: 2093,
  F4: 349.23, A4: 440, D4: 293.66, Fs5: 739.99,
};

const sounds = {
  // soft "ding-ding" up a fifth
  message_sound: [0.65, (b) => { note(b, 0, N.A5, 0.45, { vol: 0.34 }); note(b, 0.085, N.E6, 0.55, { vol: 0.3 }); }],
  mute: [0.3, (b) => { note(b, 0, N.F5, 0.14, { decay: 16 }); note(b, 0.075, N.C5, 0.2, { decay: 14 }); }],
  unmute: [0.3, (b) => { note(b, 0, N.C5, 0.14, { decay: 16 }); note(b, 0.075, N.F5, 0.2, { decay: 14 }); }],
  deafen: [0.4, (b) => { note(b, 0, N.D5, 0.12, { decay: 16 }); note(b, 0.07, N.A4, 0.12, { decay: 16 }); note(b, 0.14, N.D4, 0.24, { decay: 11 }); }],
  undeafen: [0.4, (b) => { note(b, 0, N.D4, 0.12, { decay: 16 }); note(b, 0.07, N.A4, 0.12, { decay: 16 }); note(b, 0.14, N.D5, 0.24, { decay: 11 }); }],
  user_join_voice: [0.6, (b) => { note(b, 0, N.E5, 0.3, { vol: 0.32, decay: 9 }); note(b, 0.1, N.B5, 0.45, { vol: 0.3, decay: 7 }); }],
  user_leave_voice: [0.6, (b) => { note(b, 0, N.B5, 0.3, { vol: 0.3, decay: 9 }); note(b, 0.1, N.E5, 0.45, { vol: 0.32, decay: 7 }); }],
  user_moved: [0.45, (b) => { note(b, 0, N.Fs5, 0.2, { decay: 12 }); note(b, 0.09, N.A5, 0.3, { decay: 10 }); }],
  stream_start: [0.6, (b) => { [N.C6, N.E6, N.G6, N.C7].forEach((f, i) => note(b, i * 0.06, f, 0.35, { vol: 0.22, decay: 10 })); }],
  stream_end: [0.6, (b) => { [N.C7, N.G6, N.E6, N.C6].forEach((f, i) => note(b, i * 0.06, f, 0.35, { vol: 0.22, decay: 10 })); }],
  stream_viewer_join: [0.35, (b) => { note(b, 0, N.D6, 0.2, { vol: 0.22, decay: 14 }); note(b, 0.05, N.G6, 0.25, { vol: 0.18, decay: 14 }); }],
  stream_viewer_leave: [0.35, (b) => { note(b, 0, N.G6, 0.2, { vol: 0.2, decay: 14 }); note(b, 0.05, N.D6, 0.25, { vol: 0.2, decay: 14 }); }],
  // "Ferret Chime" ringtone: two marimba phrases, then a pause so it loops nicely
  ringtone_incoming: [2.4, (b) => {
    for (const offset of [0, 0.9]) {
      [N.G5, N.B5, N.D6, N.B5].forEach((f, i) =>
        note(b, offset + i * 0.16, f, 0.5, { vol: 0.32, decay: 8, partials: [[4, 0.25, 4], [2, 0.1, 2]] }));
    }
  }],
  // gentle ringback while waiting for the other side to answer
  ringtone_outgoing: [2.6, (b) => { dualTone(b, 0, 440, 480, 1.0); }],
};

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SR, 24); header.writeUInt32LE(SR * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

mkdirSync(outDir, { recursive: true });
for (const [name, [length, render]] of Object.entries(sounds)) {
  const buf = new Float32Array(Math.round(length * SR));
  render(buf);
  // normalise every sound to the same peak (-3 dBFS), except the quiet ringback
  const peak = buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const target = name === "ringtone_outgoing" ? 0.35 : 0.7;
  for (let i = 0; i < buf.length; i++) buf[i] *= target / peak;

  const tmp = join(outDir, `${name}.wav`);
  writeFileSync(tmp, wav(buf));
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-i", tmp, "-c:a", "libvorbis", "-q:a", "5", join(outDir, `${name}.ogg`)]);
  rmSync(tmp);
  if (r.status !== 0) throw new Error(`${name}: ${r.stderr}`);
  console.log(`${name}.ogg  ${length}s`);
}
