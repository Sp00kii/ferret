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
  /** Ferret's look (navy/copper); off = stock Stoat theming */
  ferretStyle: boolean;
  /** Per-sound choices; slots that aren't listed use Ferret's own sound */
  sounds: Partial<Record<SoundSlot, SoundChoice>>;
};

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
const REMOVED_PRESETS = new Set(["franklin", "discord-halloween", "omori"]);

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
  sounds: {},
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
  return { ...DEFAULTS, ...saved, ringtone };
}

function save(next: FerretSettings) {
  store.store = next;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("ferret:settings", next);
  }
  return next;
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

  return save(next);
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
}
