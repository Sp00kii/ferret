import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { app, dialog, ipcMain } from "electron";
import Store from "electron-store";

import { mainWindow } from "../native/window";

import { isFromApp } from "./trust";

export type FerretSettings = {
  ringtone: {
    enabled: boolean;
    /** Built-in sound id (see the web client's ringtones.ts), or "custom" */
    preset: string;
    /** 0-100 */
    volume: number;
    /** Absolute path of the copied custom sound, set only by the main process */
    customFile: string | null;
    customFileName: string | null;
    ringWhenHidden: boolean;
  };
  /** Server voice channel ids that should ring when a call starts */
  watchedVoiceChannels: string[];
  showConnectionQuality: boolean;
  /** Ferret's own pop-ups (with a reply box) instead of Windows notifications */
  notificationPopups: boolean;
  /** Ferret's look (navy/copper); off = stock Stoat theming */
  ferretStyle: boolean;
  /** Per-sound choices; slots that aren't listed use Ferret's own sound */
  sounds: Partial<Record<SoundSlot, SoundChoice>>;
  voice: VoiceSettings;
  /** The user's own soundboard clips, in the order they were added */
  soundboard: SoundboardClip[];
  /** Per-person ringtone / message sound, keyed by user id */
  people: Record<string, PersonSounds>;
};

export const PERSON_SOUND_KINDS = ["ringtone", "message"] as const;
export type PersonSoundKind = (typeof PERSON_SOUND_KINDS)[number];

export type PersonSounds = {
  /** Display name when added, for the settings list */
  name: string;
  /** null = use the normal ringtone / message sound */
  ringtone: SoundChoice | null;
  message: SoundChoice | null;
};

const MAX_PEOPLE = 200;
const USER_ID = /^[0-9A-Z]{26}$/;

const isPersonKind = (value: unknown): value is PersonSoundKind =>
  value === "ringtone" || value === "message";

export type SoundboardClip = {
  /** Random id; also the file name in <userData>/soundboard */
  id: string;
  name: string;
  /** Absolute path of our copy, set only by the main process */
  file: string;
};

const MAX_SOUNDBOARD_CLIPS = 24;

/** A key or mouse button as reported by the global input hook */
export type PttBinding = { kind: "key" | "mouse"; code: number; label: string };

export type VoiceSettings = {
  pushToTalk: boolean;
  /** Set only by the capture flow in hotkeys.ts */
  pttBinding: PttBinding | null;
  /** Keep the mic open this long after releasing the key */
  pttReleaseMs: number;
  /** Silence the mic below noiseGateDb (keyboard clicks, background hum) */
  noiseGate: boolean;
  noiseGateDb: number;
  /** Electron accelerators, e.g. "Ctrl+Shift+M" */
  muteHotkey: string | null;
  deafenHotkey: string | null;
  /** 0-100 */
  soundboardVolume: number;
  /** Small always-on-top window with who's talking while you're elsewhere */
  compactCallWindow: boolean;
};

const DEFAULT_VOICE: VoiceSettings = {
  pushToTalk: false,
  pttBinding: null,
  pttReleaseMs: 200,
  noiseGate: false,
  noiseGateDb: -50,
  muteHotkey: null,
  deafenHotkey: null,
  soundboardVolume: 60,
  compactCallWindow: true,
};

/** Modifiers + one key, e.g. Ctrl+Shift+M or F13 (validated again on register) */
const ACCELERATOR = /^(?:(?:Ctrl|Alt|Shift|Super)\+){0,3}[A-Za-z0-9]{1,9}$/;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

/** Customisable sounds, named like the web client's sound controller */
export const SOUND_SLOTS = [
  "message",
  "mute",
  "unmute",
  "deafen",
  "undeafen",
  "userJoinVoice",
  "userLeaveVoice",
  "userMoved",
  "streamStart",
  "streamEnd",
  "streamViewerJoin",
  "streamViewerLeave",
  "ringtoneOutgoing",
] as const;

export type SoundSlot = (typeof SOUND_SLOTS)[number];

export type SoundChoice = {
  /** "ferret", a library sound id (see the web client's soundLibrary.ts), or "custom" */
  choice: string;
  customFile: string | null;
  customFileName: string | null;
};

const isSoundSlot = (value: unknown): value is SoundSlot =>
  typeof value === "string" &&
  (SOUND_SLOTS as readonly string[]).includes(value);

const DEFAULT_PRESET = "dook-ring";

/** Ringtones removed from Ferret (copyright); people on them move to the default */
const REMOVED_PRESETS = new Set([
  "franklin",
  "discord-halloween",
  "omori",
  "starburst-candy",
  "my-phone",
  "ringtone-231",
]);

const DEFAULTS: FerretSettings = {
  ringtone: {
    enabled: true,
    preset: DEFAULT_PRESET,
    volume: 70,
    customFile: null,
    customFileName: null,
    ringWhenHidden: true,
  },
  watchedVoiceChannels: [],
  showConnectionQuality: true,
  ferretStyle: true,
  notificationPopups: true,
  sounds: {},
  voice: DEFAULT_VOICE,
  soundboard: [],
  people: {},
};

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const AUDIO_EXTENSIONS = ["mp3", "ogg", "wav", "m4a", "aac", "flac", "webm"];

// electron-store's typings don't resolve under this TS setup, same as native/config.ts
const store = new Store({
  name: "ferret-settings",
  defaults: DEFAULTS,
}) as unknown as { store: FerretSettings };

export function getSettings(): FerretSettings {
  const saved = store.store;
  const ringtone = { ...DEFAULTS.ringtone, ...saved.ringtone };
  // settings from before presets existed: keep someone's own sound selected
  if (!saved.ringtone?.preset && ringtone.customFile)
    ringtone.preset = "custom";
  if (REMOVED_PRESETS.has(ringtone.preset)) ringtone.preset = DEFAULT_PRESET;
  const voice = { ...DEFAULT_VOICE, ...saved.voice };
  const soundboard = Array.isArray(saved.soundboard) ? saved.soundboard : [];
  const people =
    saved.people && typeof saved.people === "object" ? saved.people : {};
  return { ...DEFAULTS, ...saved, ringtone, voice, soundboard, people };
}

type SettingsListener = (
  next: FerretSettings,
  previous: FerretSettings,
) => void;
const listeners = new Set<SettingsListener>();

/** Main-process code that reacts to settings (hotkeys, compact window) */
export function onSettingsSaved(listener: SettingsListener) {
  listeners.add(listener);
}

function save(next: FerretSettings) {
  const previous = getSettings();
  store.store = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ferret:settings", next);
  }
  for (const listener of listeners) listener(next, previous);
  return next;
}

/** Store a push-to-talk binding captured by hotkeys.ts */
export function savePttBinding(binding: PttBinding | null) {
  const current = getSettings();
  return save({ ...current, voice: { ...current.voice, pttBinding: binding } });
}

/**
 * Apply a settings change coming from the page; the custom sound path can
 * only be changed through the file picker below.
 */
function applyPatch(patch: unknown): FerretSettings {
  const current = getSettings();
  if (!patch || typeof patch !== "object") return current;
  const input = patch as Partial<FerretSettings>;
  const next = { ...current, ringtone: { ...current.ringtone } };

  if (input.ringtone && typeof input.ringtone === "object") {
    const r = input.ringtone;
    if (typeof r.enabled === "boolean") next.ringtone.enabled = r.enabled;
    if (typeof r.ringWhenHidden === "boolean")
      next.ringtone.ringWhenHidden = r.ringWhenHidden;
    if (typeof r.volume === "number" && Number.isFinite(r.volume))
      next.ringtone.volume = Math.min(100, Math.max(0, Math.round(r.volume)));
    if (
      typeof r.preset === "string" &&
      /^[a-z0-9-]{1,40}$/.test(r.preset) &&
      (r.preset !== "custom" || next.ringtone.customFile)
    )
      next.ringtone.preset = r.preset;
  }

  if (Array.isArray(input.watchedVoiceChannels)) {
    next.watchedVoiceChannels = [
      ...new Set(
        input.watchedVoiceChannels.filter(
          (id): id is string =>
            typeof id === "string" && /^[0-9A-Z]{1,64}$/i.test(id),
        ),
      ),
    ].slice(0, 500);
  }

  if (typeof input.showConnectionQuality === "boolean")
    next.showConnectionQuality = input.showConnectionQuality;

  if (typeof input.ferretStyle === "boolean")
    next.ferretStyle = input.ferretStyle;

  if (typeof input.notificationPopups === "boolean")
    next.notificationPopups = input.notificationPopups;

  if (input.voice && typeof input.voice === "object") {
    const v = input.voice as Partial<VoiceSettings>;
    const voice = { ...current.voice };
    for (const key of [
      "pushToTalk",
      "noiseGate",
      "compactCallWindow",
    ] as const) {
      if (typeof v[key] === "boolean") voice[key] = v[key];
    }
    if (typeof v.pttReleaseMs === "number" && Number.isFinite(v.pttReleaseMs))
      voice.pttReleaseMs = clamp(v.pttReleaseMs, 0, 1500);
    if (typeof v.noiseGateDb === "number" && Number.isFinite(v.noiseGateDb))
      voice.noiseGateDb = clamp(v.noiseGateDb, -90, -10);
    if (
      typeof v.soundboardVolume === "number" &&
      Number.isFinite(v.soundboardVolume)
    )
      voice.soundboardVolume = clamp(v.soundboardVolume, 0, 100);
    for (const key of ["muteHotkey", "deafenHotkey"] as const) {
      const value = v[key];
      if (
        value === null ||
        (typeof value === "string" && ACCELERATOR.test(value))
      )
        voice[key] = value;
    }
    // the binding itself only comes from the capture flow; the page may clear it
    if (v.pttBinding === null) voice.pttBinding = null;
    next.voice = voice;
  }

  if (input.sounds && typeof input.sounds === "object") {
    next.sounds = { ...current.sounds };
    for (const [slot, value] of Object.entries(input.sounds)) {
      if (!isSoundSlot(slot) || !value || typeof value !== "object") continue;
      const choice = (value as Partial<SoundChoice>).choice;
      if (typeof choice !== "string" || !/^[a-z0-9-]{1,40}$/.test(choice))
        continue;
      const existing = next.sounds[slot];
      if (choice === "custom" && !existing?.customFile) continue;
      next.sounds[slot] = {
        choice,
        customFile: existing?.customFile ?? null,
        customFileName: existing?.customFileName ?? null,
      };
    }
  }

  if (input.people && typeof input.people === "object") {
    next.people = { ...current.people };
    for (const [userId, value] of Object.entries(input.people)) {
      if (!USER_ID.test(userId)) continue;
      const existing = next.people[userId];
      // null removes the person (and their custom files)
      if (value === null) {
        if (existing) removePersonFiles(existing);
        delete next.people[userId];
        continue;
      }
      if (!value || typeof value !== "object") continue;
      if (!existing && Object.keys(next.people).length >= MAX_PEOPLE) continue;

      const person: PersonSounds = existing
        ? { ...existing }
        : { name: "", ringtone: null, message: null };
      const v = value as Partial<Record<string, unknown>>;
      if (typeof v.name === "string")
        person.name = v.name.replace(/\s+/g, " ").trim().slice(0, 64);

      for (const kind of PERSON_SOUND_KINDS) {
        const choice = v[kind];
        if (choice === null) {
          // back to the normal sound, keep the custom file only while chosen
          if (person[kind]?.customFile)
            rmSync(person[kind]!.customFile!, { force: true });
          person[kind] = null;
        } else if (choice && typeof choice === "object") {
          const id = (choice as { choice?: unknown }).choice;
          if (typeof id !== "string" || !/^[a-z0-9-]{1,40}$/.test(id)) continue;
          if (id === "custom" && !person[kind]?.customFile) continue;
          person[kind] = {
            choice: id,
            customFile: person[kind]?.customFile ?? null,
            customFileName: person[kind]?.customFileName ?? null,
          };
        }
      }
      next.people[userId] = person;
    }
  }

  return save(next);
}

function removePersonFiles(person: PersonSounds) {
  for (const kind of PERSON_SOUND_KINDS) {
    const file = person[kind]?.customFile;
    if (file) rmSync(file, { force: true });
  }
}

export function personSoundPath(userId: string, kind: string): string | null {
  if (!isPersonKind(kind)) return null;
  const file = getSettings().people[userId]?.[kind]?.customFile;
  return file && existsSync(file) ? file : null;
}

export function customRingtonePath(): string | null {
  const file = getSettings().ringtone.customFile;
  return file && existsSync(file) ? file : null;
}

export function customSoundPath(slot: string): string | null {
  if (!isSoundSlot(slot)) return null;
  const file = getSettings().sounds[slot]?.customFile;
  return file && existsSync(file) ? file : null;
}

export function soundboardClipPath(id: string): string | null {
  const clip = getSettings().soundboard.find((entry) => entry.id === id);
  return clip && existsSync(clip.file) ? clip.file : null;
}

/**
 * Let the user pick an audio file and keep our own copy (so it survives the
 * original being moved) at <userData>/<folder>/<baseName>.<ext>.
 */
async function pickAudioFile(title: string, folder: string, baseName: string) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ["openFile"],
    filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
  });
  const source = result.filePaths[0];
  if (result.canceled || !source) return undefined;

  const ext = path.extname(source).slice(1).toLowerCase();
  if (!AUDIO_EXTENSIONS.includes(ext)) throw new Error("Unsupported file type");
  if (statSync(source).size > MAX_AUDIO_BYTES)
    throw new Error("Sound files must be smaller than 10 MB");

  const dir = path.join(app.getPath("userData"), folder);
  mkdirSync(dir, { recursive: true });
  for (const other of AUDIO_EXTENSIONS) {
    rmSync(path.join(dir, `${baseName}.${other}`), { force: true });
  }
  const target = path.join(dir, `${baseName}.${ext}`);
  copyFileSync(source, target);
  return { file: target, name: path.basename(source) };
}

async function pickRingtone(): Promise<FerretSettings> {
  const picked = await pickAudioFile(
    "Choose a ringtone",
    "ringtones",
    "custom",
  );
  if (!picked) return getSettings();
  const target = picked.file;

  const current = getSettings();
  return save({
    ...current,
    ringtone: {
      ...current.ringtone,
      preset: "custom",
      customFile: target,
      customFileName: picked.name,
    },
  });
}

async function pickSound(slot: unknown): Promise<FerretSettings> {
  if (!isSoundSlot(slot)) return getSettings();
  const picked = await pickAudioFile("Choose a sound", "sounds", slot);
  if (!picked) return getSettings();

  const current = getSettings();
  return save({
    ...current,
    sounds: {
      ...current.sounds,
      [slot]: {
        choice: "custom",
        customFile: picked.file,
        customFileName: picked.name,
      },
    },
  });
}

function clearSound(slot: unknown): FerretSettings {
  const current = getSettings();
  if (!isSoundSlot(slot)) return current;
  const existing = current.sounds[slot];
  if (existing?.customFile) rmSync(existing.customFile, { force: true });
  const sounds = { ...current.sounds };
  delete sounds[slot];
  return save({ ...current, sounds });
}

/** Back to Ferret's sound for every slot, removing any custom files */
function resetSounds(): FerretSettings {
  const current = getSettings();
  for (const value of Object.values(current.sounds)) {
    if (value?.customFile) rmSync(value.customFile, { force: true });
  }
  return save({ ...current, sounds: {} });
}

async function addSoundboardClip(): Promise<FerretSettings> {
  if (getSettings().soundboard.length >= MAX_SOUNDBOARD_CLIPS) {
    throw new Error(`You can add up to ${MAX_SOUNDBOARD_CLIPS} sounds`);
  }
  const id = randomBytes(6).toString("hex");
  const picked = await pickAudioFile(
    "Add a soundboard sound",
    "soundboard",
    id,
  );
  if (!picked) return getSettings();

  const current = getSettings();
  const name =
    path.parse(picked.name).name.replace(/[_-]+/g, " ").trim().slice(0, 32) ||
    "My sound";
  return save({
    ...current,
    soundboard: [...current.soundboard, { id, name, file: picked.file }],
  });
}

function removeSoundboardClip(id: unknown): FerretSettings {
  const current = getSettings();
  const clip = current.soundboard.find((entry) => entry.id === id);
  if (!clip) return current;
  rmSync(clip.file, { force: true });
  return save({
    ...current,
    soundboard: current.soundboard.filter((entry) => entry !== clip),
  });
}

function renameSoundboardClip(id: unknown, name: unknown): FerretSettings {
  const current = getSettings();
  if (typeof name !== "string") return current;
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 32);
  if (!clean) return current;
  return save({
    ...current,
    soundboard: current.soundboard.map((entry) =>
      entry.id === id ? { ...entry, name: clean } : entry,
    ),
  });
}

async function pickPersonSound(
  userId: unknown,
  kind: unknown,
): Promise<FerretSettings> {
  if (typeof userId !== "string" || !USER_ID.test(userId)) return getSettings();
  if (!isPersonKind(kind)) return getSettings();
  const before = getSettings();
  if (!before.people[userId] && Object.keys(before.people).length >= MAX_PEOPLE)
    throw new Error(`You can set sounds for up to ${MAX_PEOPLE} people`);

  const picked = await pickAudioFile(
    kind === "ringtone"
      ? "Choose their ringtone"
      : "Choose their message sound",
    "people",
    `${userId}-${kind}`,
  );
  if (!picked) return getSettings();

  const current = getSettings();
  const person = current.people[userId] ?? {
    name: "",
    ringtone: null,
    message: null,
  };
  return save({
    ...current,
    people: {
      ...current.people,
      [userId]: {
        ...person,
        [kind]: {
          choice: "custom",
          customFile: picked.file,
          customFileName: picked.name,
        },
      },
    },
  });
}

function clearRingtone(): FerretSettings {
  const current = getSettings();
  if (current.ringtone.customFile) {
    rmSync(current.ringtone.customFile, { force: true });
  }
  return save({
    ...current,
    ringtone: {
      ...current.ringtone,
      preset:
        current.ringtone.preset === "custom"
          ? DEFAULT_PRESET
          : current.ringtone.preset,
      customFile: null,
      customFileName: null,
    },
  });
}

export function initSettingsIpc() {
  ipcMain.handle("ferret:getSettings", (event) =>
    isFromApp(event) ? getSettings() : null,
  );
  ipcMain.handle("ferret:setSettings", (event, patch: unknown) =>
    isFromApp(event) ? applyPatch(patch) : null,
  );
  ipcMain.handle("ferret:pickRingtone", (event) =>
    isFromApp(event) ? pickRingtone() : null,
  );
  ipcMain.handle("ferret:clearRingtone", (event) =>
    isFromApp(event) ? clearRingtone() : null,
  );
  ipcMain.handle("ferret:pickSound", (event, slot: unknown) =>
    isFromApp(event) ? pickSound(slot) : null,
  );
  ipcMain.handle("ferret:clearSound", (event, slot: unknown) =>
    isFromApp(event) ? clearSound(slot) : null,
  );
  ipcMain.handle("ferret:resetSounds", (event) =>
    isFromApp(event) ? resetSounds() : null,
  );
  ipcMain.handle(
    "ferret:pickPersonSound",
    (event, userId: unknown, kind: unknown) =>
      isFromApp(event) ? pickPersonSound(userId, kind) : null,
  );
  ipcMain.handle("ferret:addSoundboardClip", (event) =>
    isFromApp(event) ? addSoundboardClip() : null,
  );
  ipcMain.handle("ferret:removeSoundboardClip", (event, id: unknown) =>
    isFromApp(event) ? removeSoundboardClip(id) : null,
  );
  ipcMain.handle(
    "ferret:renameSoundboardClip",
    (event, id: unknown, name: unknown) =>
      isFromApp(event) ? renameSoundboardClip(id, name) : null,
  );
}
