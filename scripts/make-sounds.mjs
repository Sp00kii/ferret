// Makes Ferret's "Ferret noises" pack, the Boop library sound and the Happy
// dook soundboard clip. Everything is built from the same quick chirp as the
// "Dook (ferret chirp)" library sound (scripts/original-sound-scripts/
// make-sound-library.mjs); each event gets its own number, pitch and rhythm
// of chirps. No recordings are used.
//
//   node scripts/make-sounds.mjs            write all sounds
//   node scripts/make-sounds.mjs message    write only the named ones
//
// Needs ffmpeg (with libvorbis) on the PATH to write the .ogg files.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOUNDS = path.join(root, "web/packages/client/components/ferret/sounds");
const RATE = 48000;

// ---------------------------------------------------------------- helpers

/** Repeatable randomness, so every run makes the same files */
function random(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Clip {
  constructor(seconds, seed = 1) {
    this.data = new Float32Array(Math.ceil(seconds * RATE));
    this.noise = (() => {
      const rand = random(seed);
      return () => rand() * 2 - 1;
    })();
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/** Oscillator following freqAt(t), added into the clip at `start` */
function sweep(clip, start, seconds, freqAt, ampAt, wave) {
  const from = Math.round(start * RATE);
  const length = Math.round(seconds * RATE);
  let phase = 0;
  for (let i = 0; i < length && from + i < clip.data.length; i++) {
    const t = i / RATE;
    phase += (2 * Math.PI * freqAt(t)) / RATE;
    // tiny fades at both ends so nothing clicks
    const edge = Math.min(1, i / (0.003 * RATE), (length - i) / (0.006 * RATE));
    clip.data[from + i] += ampAt(t) * edge * wave(phase);
  }
}

// ------------------------------------------------------------- the chirp

/**
 * One chirp, the building block of the Dook sound: the pitch arcs up from
 * `base` by `arc` Hz and back, while `bend` tilts it up or down overall.
 */
function chirp(
  clip,
  at,
  { base = 1180, arc = 900, bend = 0, length = 0.055, loud = 1 } = {},
) {
  sweep(
    clip,
    at,
    length,
    (t) => base + arc * Math.sin(Math.PI * (t / length)) + bend * (t / length),
    (t) => 0.7 * loud * Math.sin(Math.PI * (t / length)) ** 1.5,
    (p) => Math.sin(p) + 0.3 * Math.sin(2 * p) + 0.08 * clip.noise(),
  );
  return clip;
}

/** A run of chirps; `bases` sets each chirp's pitch, `gap` the rhythm */
function run(clip, start, bases, gap = 0.085, options = {}) {
  bases.forEach((base, n) =>
    chirp(clip, start + n * gap, { ...options, base }),
  );
  return clip;
}

/** Chirps at the given times, for uneven rhythms */
function pattern(clip, notes) {
  for (const [at, options] of notes) chirp(clip, at, options);
  return clip;
}

// ------------------------------------------------------------- the sounds

const MAKERS = {
  // ---- Ferret noises pack (one per event)

  // the signature "dook-dook", second one higher
  "noises/message": () => run(new Clip(0.2, 11), 0, [1180, 1320]),

  // one low chirp that sinks
  "noises/mute": () =>
    chirp(new Clip(0.1, 12), 0, {
      base: 900,
      arc: 600,
      bend: -350,
      length: 0.07,
    }),

  // one chirp that springs up
  "noises/unmute": () =>
    chirp(new Clip(0.1, 13), 0, {
      base: 1150,
      arc: 700,
      bend: 600,
      length: 0.07,
    }),

  // two slow, low chirps going down
  "noises/deafen": () =>
    run(new Clip(0.28, 14), 0, [1000, 820], 0.13, {
      arc: 600,
      bend: -250,
      length: 0.075,
    }),

  // two slow chirps going up
  "noises/undeafen": () =>
    run(new Clip(0.28, 15), 0, [1050, 1300], 0.13, {
      arc: 750,
      bend: 250,
      length: 0.075,
    }),

  // three chirps climbing
  "noises/user_join_voice": () => run(new Clip(0.3, 16), 0, [1100, 1260, 1420]),

  // three chirps falling
  "noises/user_leave_voice": () =>
    run(new Clip(0.3, 17), 0, [1420, 1260, 1100]),

  // a chirp, a pause, then two quick ones: "dook... dook-dook"
  "noises/user_moved": () =>
    pattern(new Clip(0.36, 18), [
      [0, { base: 1200 }],
      [0.19, { base: 1300 }],
      [0.26, { base: 1300 }],
    ]),

  // excited war-dance chatter, fast and climbing
  "noises/stream_start": () =>
    run(new Clip(0.5, 19), 0, [1100, 1180, 1140, 1260, 1220, 1360], 0.065, {
      length: 0.05,
    }),

  // slow chirps winding down and fading
  "noises/stream_end": () => {
    const clip = new Clip(0.62, 20);
    [1300, 1180, 1060, 950].forEach((base, n) =>
      chirp(clip, n * 0.14, {
        base,
        arc: 700,
        loud: 1 - n * 0.18,
        length: 0.065,
      }),
    );
    return clip;
  },

  // one tiny high chirp going up
  "noises/stream_viewer_join": () =>
    chirp(new Clip(0.08, 21), 0, {
      base: 1500,
      arc: 700,
      bend: 400,
      length: 0.06,
    }),

  // one tiny high chirp going down
  "noises/stream_viewer_leave": () =>
    chirp(new Clip(0.08, 22), 0, {
      base: 1500,
      arc: 700,
      bend: -500,
      length: 0.06,
    }),

  // "Dook Party": two dook runs, then a gap (the ringtone loops)
  "noises/ringtone_incoming": () => {
    const clip = new Clip(2.4, 23);
    run(clip, 0, [1180, 1240, 1300, 1360]);
    return run(clip, 0.55, [1180, 1240, 1300, 1360]);
  },

  // calm "dook ... dook" while waiting (loops)
  "noises/ringtone_outgoing": () =>
    run(new Clip(2.0, 24), 0, [1180, 1180], 0.4, { loud: 0.8 }),

  // ---- library sounds you can pick for any slot

  // a cartoon nose boop: a soft, round tone that bounces up
  "library/boop": () => {
    const clip = new Clip(0.24, 32);
    const length = 0.22;
    sweep(
      clip,
      0,
      length,
      (t) =>
        t < 0.05
          ? lerp(330, 640, smooth(t / 0.05))
          : lerp(640, 600, Math.min(1, (t - 0.05) / 0.15)),
      (t) => Math.min(1, t / 0.008) * Math.exp(-Math.max(0, t - 0.048) / 0.05),
      (p) => Math.sin(p) + 0.18 * Math.sin(2 * p) + 0.05 * Math.sin(3 * p),
    );
    return clip;
  },

  // ---- soundboard

  // a long, bouncy, excited dook chatter everyone in the call can hear
  "board/happy-dook": () =>
    run(
      new Clip(0.9, 41),
      0,
      [1180, 1300, 1220, 1360, 1260, 1420, 1300, 1480, 1360, 1540],
      0.08,
      { length: 0.06 },
    ),
};

// ---------------------------------------------------------------- output

function wav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24);
  buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) =>
    buffer.writeInt16LE(
      Math.round(Math.max(-1, Math.min(1, s)) * 32767),
      44 + i * 2,
    ),
  );
  return buffer;
}

/**
 * Even loudness: about -13 dB while sounding (gaps don't count), and never
 * peaking above -3 dB, like the other Ferret sounds. Soundboard clips are a
 * bit louder, as they're meant to be heard over talking.
 */
function level(samples, target = 0.22) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  let sum = 0;
  let count = 0;
  for (const s of samples)
    if (Math.abs(s) > peak * 0.02) {
      sum += s * s;
      count++;
    }
  const rms = Math.sqrt(sum / Math.max(1, count));
  const gain = Math.min(0.7 / peak, target / rms);
  return samples.map((s) => s * gain);
}

const only = process.argv.slice(2);
const temp = mkdtempSync(path.join(os.tmpdir(), "ferret-sounds-"));
try {
  for (const [name, make] of Object.entries(MAKERS)) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    const made = level(make().data, name.startsWith("board/") ? 0.3 : 0.22);
    // very short files can end before the speakers wake up and play as
    // silence, so pad everything with quiet to at least a quarter second
    const samples = new Float32Array(Math.max(made.length, RATE / 4));
    samples.set(made);
    const input = path.join(temp, "in.wav");
    writeFileSync(input, wav(samples));
    const output = path.join(SOUNDS, `${name}.ogg`);
    const result = spawnSync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        input,
        "-c:a",
        "libvorbis",
        "-q:a",
        "5",
        "-map_metadata",
        "-1",
        output,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
    console.log(`wrote ${name}.ogg (${(samples.length / RATE).toFixed(2)}s)`);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
