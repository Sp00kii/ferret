import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { app, dialog, ipcMain } from "electron";
import Store from "electron-store";

import { mainWindow } from "../native/window";

import { isFromApp } from "./trust";

export type FerretSettings = {
  ringtone: {
    enabled: boolean;
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
};

const DEFAULTS: FerretSettings = {
  ringtone: {
    enabled: true,
    volume: 70,
    customFile: null,
    customFileName: null,
    ringWhenHidden: true,
  },
  watchedVoiceChannels: [],
  showConnectionQuality: true,
};

const MAX_RINGTONE_BYTES = 10 * 1024 * 1024;
const RINGTONE_EXTENSIONS = ["mp3", "ogg", "wav", "m4a", "aac", "flac", "webm"];

// electron-store's typings don't resolve under this TS setup, same as native/config.ts
const store = new Store({
  name: "ferret-settings",
  defaults: DEFAULTS,
}) as unknown as { store: FerretSettings };

export function getSettings(): FerretSettings {
  const saved = store.store;
  return {
    ...DEFAULTS,
    ...saved,
    ringtone: { ...DEFAULTS.ringtone, ...saved.ringtone },
  };
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

  return save(next);
}

export function customRingtonePath(): string | null {
  const file = getSettings().ringtone.customFile;
  return file && existsSync(file) ? file : null;
}

async function pickRingtone(): Promise<FerretSettings> {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose a ringtone",
    properties: ["openFile"],
    filters: [{ name: "Audio", extensions: RINGTONE_EXTENSIONS }],
  });
  const source = result.filePaths[0];
  if (result.canceled || !source) return getSettings();

  const ext = path.extname(source).slice(1).toLowerCase();
  if (!RINGTONE_EXTENSIONS.includes(ext))
    throw new Error("Unsupported file type");
  if (statSync(source).size > MAX_RINGTONE_BYTES)
    throw new Error("Ringtone must be smaller than 10 MB");

  // Keep our own copy so the ringtone survives the original being moved
  const dir = path.join(app.getPath("userData"), "ringtones");
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `custom.${ext}`);
  for (const other of RINGTONE_EXTENSIONS) {
    rmSync(path.join(dir, `custom.${other}`), { force: true });
  }
  copyFileSync(source, target);

  const current = getSettings();
  return save({
    ...current,
    ringtone: {
      ...current.ringtone,
      customFile: target,
      customFileName: path.basename(source),
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
    ringtone: { ...current.ringtone, customFile: null, customFileName: null },
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
}
