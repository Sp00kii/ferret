import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { app, dialog, ipcMain } from "electron";

import { mainWindow } from "../native/window";

import {
  AUDIO_EXTENSIONS,
  type FerretSettings,
  MAX_AUDIO_BYTES,
  MAX_PEOPLE,
  MAX_SOUNDBOARD_CLIPS,
  PERSON_SOUND_KINDS,
  type PttBinding,
  SOUND_SLOTS,
  USER_ID,
  applyPatch,
  getSettings,
  save,
} from "./settings";
import { isFromApp } from "./trust";

/**
 * Settings backup: one .ferret-backup file (JSON) with every Ferret setting
 * plus the user's own sound files. No file paths or account data are
 * written (paths would contain the Windows user name).
 *
 * Importing treats the file as untrusted: every value goes through the same
 * checks as changes from the app, file names are chosen by Ferret, and only
 * audio files within the normal size limit are accepted.
 */

const KIND = "ferret-settings-backup";
const VERSION = 1;
const MAX_BACKUP_BYTES = 400 * 1024 * 1024;

type FileEntry = { name: string; data: string };

const extOf = (name: string) => path.extname(name).slice(1).toLowerCase();

function readFile(file: string | null | undefined): FileEntry | undefined {
  if (!file || !existsSync(file)) return;
  if (statSync(file).size > MAX_AUDIO_BYTES) return;
  return {
    name: path.basename(file),
    data: readFileSync(file).toString("base64"),
  };
}

function withoutPaths(settings: FerretSettings) {
  const copy = structuredClone(settings) as unknown as Record<string, unknown>;
  const ringtone = copy.ringtone as Record<string, unknown>;
  ringtone.customFile = null;
  for (const choice of Object.values(
    (copy.sounds ?? {}) as Record<string, Record<string, unknown>>,
  ))
    choice.customFile = null;
  for (const person of Object.values(
    (copy.people ?? {}) as Record<
      string,
      Record<string, Record<string, unknown> | null>
    >,
  )) {
    for (const kind of PERSON_SOUND_KINDS) {
      if (person[kind]) person[kind]!.customFile = null;
    }
  }
  copy.soundboard = [];
  delete copy.lastSeenVersion;
  return copy;
}

async function exportBackup() {
  const settings = getSettings();
  const files: Record<string, FileEntry> = {};
  const add = (key: string, file: string | null | undefined) => {
    const entry = readFile(file);
    if (entry) files[key] = entry;
  };

  add("ringtone", settings.ringtone.customFile);
  for (const [slot, choice] of Object.entries(settings.sounds))
    add(`sound:${slot}`, choice?.customFile);
  for (const [id, person] of Object.entries(settings.people))
    for (const kind of PERSON_SOUND_KINDS)
      add(`person:${id}:${kind}`, person[kind]?.customFile);
  const soundboard = settings.soundboard.map((clip, index) => {
    add(`soundboard:${index}`, clip.file);
    return { name: clip.name };
  });

  const backup = {
    kind: KIND,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    settings: withoutPaths(settings),
    soundboard,
    files,
  };

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Save Ferret settings backup",
    defaultPath: `Ferret settings ${new Date().toISOString().slice(0, 10)}.ferret-backup`,
    filters: [{ name: "Ferret backup", extensions: ["ferret-backup"] }],
  });
  if (result.canceled || !result.filePath) return { status: "cancelled" };
  writeFileSync(result.filePath, JSON.stringify(backup));
  return { status: "saved", files: Object.keys(files).length };
}

/** Decode and store one audio file under a name Ferret chooses */
function restoreFile(
  entry: unknown,
  folder: string,
  baseName: string,
): { file: string; name: string } | undefined {
  if (!entry || typeof entry !== "object") return;
  const { name, data } = entry as Partial<FileEntry>;
  if (typeof name !== "string" || typeof data !== "string") return;
  const ext = extOf(name);
  if (!AUDIO_EXTENSIONS.includes(ext)) return;
  const bytes = Buffer.from(data, "base64");
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) return;

  const dir = path.join(app.getPath("userData"), folder);
  mkdirSync(dir, { recursive: true });
  for (const other of AUDIO_EXTENSIONS)
    rmSync(path.join(dir, `${baseName}.${other}`), { force: true });
  const file = path.join(dir, `${baseName}.${ext}`);
  writeFileSync(file, bytes);
  return { file, name: path.basename(name).slice(0, 120) };
}

const isBinding = (value: unknown): value is PttBinding => {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  return (
    (b.kind === "key" || b.kind === "mouse") &&
    Number.isInteger(b.code) &&
    (b.code as number) >= 0 &&
    (b.code as number) < 100000 &&
    typeof b.label === "string" &&
    b.label.length <= 40
  );
};

async function importBackup() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Restore Ferret settings",
    properties: ["openFile"],
    filters: [{ name: "Ferret backup", extensions: ["ferret-backup", "json"] }],
  });
  const source = result.filePaths[0];
  if (result.canceled || !source) return { status: "cancelled" };
  if (statSync(source).size > MAX_BACKUP_BYTES)
    throw new Error("That file is too big to be a Ferret backup");

  let backup: Record<string, unknown>;
  try {
    backup = JSON.parse(readFileSync(source, "utf8"));
  } catch {
    throw new Error("That file isn't a Ferret backup");
  }
  if (backup?.kind !== KIND || typeof backup.version !== "number")
    throw new Error("That file isn't a Ferret backup");
  if (backup.version > VERSION)
    throw new Error("This backup is from a newer Ferret; update Ferret first");

  const input = (backup.settings ?? {}) as Record<string, unknown>;
  const files = (backup.files ?? {}) as Record<string, unknown>;
  let restoredFiles = 0;

  // 1. files first, so "custom" choices have something to point at
  let current = getSettings();
  const ringtoneFile = restoreFile(files.ringtone, "ringtones", "custom");
  if (ringtoneFile) {
    current = {
      ...current,
      ringtone: {
        ...current.ringtone,
        customFile: ringtoneFile.file,
        customFileName: ringtoneFile.name,
      },
    };
    restoredFiles++;
  }

  const sounds = { ...current.sounds };
  for (const slot of SOUND_SLOTS) {
    const restored = restoreFile(files[`sound:${slot}`], "sounds", slot);
    if (restored) {
      sounds[slot] = {
        choice: "custom",
        customFile: restored.file,
        customFileName: restored.name,
      };
      restoredFiles++;
    }
  }

  const people = { ...current.people };
  const inputPeople =
    input.people && typeof input.people === "object"
      ? (input.people as Record<string, Record<string, unknown>>)
      : {};
  for (const [id, person] of Object.entries(inputPeople)) {
    if (!USER_ID.test(id) || !person || typeof person !== "object") continue;
    if (!people[id] && Object.keys(people).length >= MAX_PEOPLE) continue;
    const entry = people[id] ?? { name: "", ringtone: null, message: null };
    const next = { ...entry };
    if (typeof person.name === "string")
      next.name = person.name.replace(/\s+/g, " ").trim().slice(0, 64);
    for (const kind of PERSON_SOUND_KINDS) {
      const restored = restoreFile(
        files[`person:${id}:${kind}`],
        "people",
        `${id}-${kind}`,
      );
      if (restored) {
        next[kind] = {
          choice: "custom",
          customFile: restored.file,
          customFileName: restored.name,
        };
        restoredFiles++;
      }
    }
    people[id] = next;
  }

  const soundboard = [...current.soundboard];
  const clips = Array.isArray(backup.soundboard) ? backup.soundboard : [];
  clips.forEach((clip, index) => {
    if (soundboard.length >= MAX_SOUNDBOARD_CLIPS) return;
    const id = randomBytes(6).toString("hex");
    const restored = restoreFile(
      files[`soundboard:${index}`],
      "soundboard",
      id,
    );
    if (!restored) return;
    const name =
      typeof clip?.name === "string"
        ? clip.name.replace(/\s+/g, " ").trim().slice(0, 32)
        : "";
    soundboard.push({ id, name: name || "My sound", file: restored.file });
    restoredFiles++;
  });

  const binding = (input.voice as Record<string, unknown> | undefined)
    ?.pttBinding;
  save({
    ...current,
    sounds,
    people,
    soundboard,
    voice: {
      ...current.voice,
      pttBinding: isBinding(binding) ? binding : current.voice.pttBinding,
    },
  });

  // 2. everything else through the normal checks
  const { pttBinding: _ignored, ...voice } = (input.voice ?? {}) as Record<
    string,
    unknown
  >;
  applyPatch({ ...input, voice });

  return { status: "restored", files: restoredFiles };
}

const fail = (error: unknown) => ({
  status: "error",
  message: error instanceof Error ? error.message : String(error),
});

export function initBackup() {
  ipcMain.handle("ferret:exportSettings", (event) =>
    isFromApp(event) ? exportBackup().catch(fail) : null,
  );
  ipcMain.handle("ferret:importSettings", (event) =>
    isFromApp(event) ? importBackup().catch(fail) : null,
  );
}
