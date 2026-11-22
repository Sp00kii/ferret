import os from "node:os";

import { app, ipcMain, screen } from "electron";

import { isDevBuild } from "./devData";
import { getSettings } from "./settings";
import { isFromApp } from "./trust";

/**
 * Facts about the app for the diagnostics panel. Deliberately no file paths
 * (they contain the Windows user name) and nothing account-related.
 */
function collect() {
  const settings = getSettings();
  return {
    "Ferret version": app.getVersion(),
    Build: app.isPackaged ? "installed" : isDevBuild ? "dev" : "unpacked",
    Electron: process.versions.electron,
    Chromium: process.versions.chrome,
    OS: `${os.type()} ${os.release()} (${process.arch})`,
    "Memory (app)": `${Math.round(process.memoryUsage().rss / 1048576)} MB`,
    "App uptime": `${Math.round(process.uptime() / 60)} min`,
    "System uptime": `${Math.round(os.uptime() / 3600)} h`,
    Displays: screen
      .getAllDisplays()
      .map((d) => `${d.size.width}x${d.size.height}@${d.scaleFactor}`)
      .join(", "),
    "Ferret style": settings.ferretStyle ? "on" : "off",
    "Push to talk": settings.voice.pushToTalk
      ? settings.voice.pttBinding
        ? `on (${settings.voice.pttBinding.label})`
        : "on (no key set)"
      : "off",
    "Noise gate": settings.voice.noiseGate
      ? `on (${settings.voice.noiseGateDb} dB)`
      : "off",
    "Compact call window": settings.voice.compactCallWindow ? "on" : "off",
    "Watched voice channels": settings.watchedVoiceChannels.length,
  };
}

export function initDiagnostics() {
  ipcMain.handle("ferret:diagnostics", (event) =>
    isFromApp(event) ? collect() : null,
  );
}
