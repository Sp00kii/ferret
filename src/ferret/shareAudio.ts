import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { type WebContents, app, ipcMain } from "electron";

import { isFromApp } from "./trust";

/**
 * Screen share sound choices beyond Electron's "all or nothing" (which
 * includes the call itself, so viewers hear themselves echo back):
 *
 *   none          no sound
 *   all           all of the PC's sound (Electron's loopback, as before)
 *   app           only the shared window's app (and what it started)
 *   exceptFerret  everything except Ferret, so no echo
 *
 * The last two use native/audio-capture (Windows 11): its sound is sent to
 * the page, which adds it to the share as the share's sound track.
 */
export type ShareAudioMode = "none" | "all" | "app" | "exceptFerret";

const MODES: ShareAudioMode[] = ["none", "all", "app", "exceptFerret"];

function helperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "native", "ferret-audio-capture.exe")
    : path.join(
        app.getAppPath(),
        "build",
        "native",
        "ferret-audio-capture.exe",
      );
}

/** Windows' per-app capture needs Windows 11 (build 20348 or newer) */
export function appAudioSupported() {
  if (process.platform !== "win32") return false;
  const build = Number(os.release().split(".")[2]);
  return build >= 20348 && existsSync(helperPath());
}

/** The mode picked in the share picker, used by the next screen share */
let pendingMode: ShareAudioMode | undefined;

export function takeShareAudioMode(): ShareAudioMode | undefined {
  const mode = pendingMode;
  pendingMode = undefined;
  return mode;
}

let helper: ChildProcess | undefined;

export function stopShareAudio() {
  if (!helper) return;
  const current = helper;
  helper = undefined;
  current.stdin?.end();
  // it stops by itself once stdin closes; make sure
  setTimeout(() => {
    if (current.exitCode === null) current.kill();
  }, 2000);
}

/**
 * Start capturing for a screen share. `sourceId` is the desktopCapturer id
 * ("window:<hwnd>:0" or "screen:..."). Returns false if it can't.
 */
export function startShareAudio(
  mode: ShareAudioMode,
  sourceId: string,
  page: WebContents,
) {
  stopShareAudio();
  if (!appAudioSupported() || page.isDestroyed()) return false;

  let args: string[];
  if (mode === "exceptFerret") {
    args = ["--exclude", String(process.pid)];
  } else if (mode === "app") {
    const hwnd = sourceId.match(/^window:(\d+):/)?.[1];
    if (!hwnd) return false;
    args = ["--window", hwnd];
  } else {
    return false;
  }

  const child = spawn(helperPath(), args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  helper = child;

  // send whole sample frames (4 bytes) only
  let leftover: Buffer = Buffer.alloc(0);
  child.stdout!.on("data", (chunk: Buffer) => {
    if (helper !== child || page.isDestroyed()) return;
    const data = leftover.length ? Buffer.concat([leftover, chunk]) : chunk;
    const usable = data.length - (data.length % 4);
    leftover = data.subarray(usable);
    if (usable > 0)
      page.send(
        "ferret:shareAudio:data",
        new Uint8Array(data.subarray(0, usable)),
      );
  });
  child.stderr!.on("data", (chunk: Buffer) =>
    console.warn("[ferret] audio helper:", chunk.toString().trim()),
  );
  child.on("error", (error) =>
    console.warn("[ferret] audio helper failed to start", error),
  );
  child.on("exit", () => {
    if (helper === child) helper = undefined;
    if (!page.isDestroyed()) page.send("ferret:shareAudio:end");
  });

  page.send("ferret:shareAudio:start");
  page.once("destroyed", () => {
    if (helper === child) stopShareAudio();
  });
  return true;
}

export function initShareAudio() {
  ipcMain.handle("ferret:shareAudioModes", (event) => {
    if (!isFromApp(event)) return null;
    return appAudioSupported() ? MODES : (["none", "all"] as const);
  });
  ipcMain.handle("ferret:setShareAudioMode", (event, mode: unknown) => {
    if (!isFromApp(event)) return false;
    pendingMode = MODES.includes(mode as ShareAudioMode)
      ? (mode as ShareAudioMode)
      : undefined;
    return true;
  });
  ipcMain.on("ferret:stopShareAudio", (event) => {
    if (isFromApp(event)) stopShareAudio();
  });
  app.on("will-quit", stopShareAudio);
}
