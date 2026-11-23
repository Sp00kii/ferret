import { app, autoUpdater, dialog, ipcMain, net, shell } from "electron";

import { mainWindow } from "../native/window";

import { FERRET } from "./constants";
import { isFromApp } from "./trust";

export type UpdateCheckResult =
  | { status: "up-to-date"; version: string }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string }
  | { status: "error"; message: string };

/**
 * Squirrel-installed builds can update themselves; dev runs can't. Windows
 * on ARM opens the release page instead (its update files would clash with
 * the normal x64 ones).
 */
const canSelfUpdate = () =>
  app.isPackaged && process.platform === "win32" && process.arch !== "arm64";

let downloading = false;

function isNewer(candidate: string, current: string) {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(/[.-]/)
      .slice(0, 3)
      .map((n) => parseInt(n) || 0);
  const [a, b] = [parse(candidate), parse(current)];
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/**
 * Ask GitHub Releases first so the update is offered, not silently
 * downloaded; then Squirrel downloads it from update.electronjs.org.
 */
export async function checkForUpdates(
  manual: boolean,
): Promise<UpdateCheckResult> {
  let release: { tag_name?: string; html_url?: string };
  try {
    const response = await net.fetch(
      `https://api.github.com/repos/${FERRET.repo}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Ferret-Updater",
        },
      },
    );
    if (response.status === 404) {
      return { status: "up-to-date", version: app.getVersion() };
    }
    if (!response.ok) {
      return { status: "error", message: `GitHub returned ${response.status}` };
    }
    release = await response.json();
  } catch (error) {
    return { status: "error", message: String(error) };
  }

  const latest = String(release.tag_name ?? "").replace(/^v/, "");
  if (!latest || !isNewer(latest, app.getVersion())) {
    return { status: "up-to-date", version: app.getVersion() };
  }
  if (downloading) return { status: "downloading", version: latest };

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Ferret update available",
    message: `Ferret ${latest} is available (you have ${app.getVersion()}).`,
    detail: canSelfUpdate()
      ? "Download and install it now? Ferret will ask before restarting."
      : "This copy can't update itself, so the release page will open.",
    buttons: [canSelfUpdate() ? "Download" : "Open release page", "Later"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response !== 0) return { status: "available", version: latest };

  if (!canSelfUpdate()) {
    if (release.html_url) shell.openExternal(release.html_url);
    return { status: "available", version: latest };
  }

  downloading = true;
  autoUpdater.checkForUpdates();
  if (manual) console.info("[updater] downloading", latest);
  return { status: "downloading", version: latest };
}

export function initUpdater() {
  ipcMain.handle("ferret:checkForUpdates", (event) =>
    isFromApp(event) ? checkForUpdates(true) : null,
  );

  if (!canSelfUpdate()) return;

  autoUpdater.setFeedURL({
    url: `https://update.electronjs.org/${FERRET.repo}/${process.platform}-${process.arch}/${app.getVersion()}`,
  });

  autoUpdater.on("error", (error) => {
    downloading = false;
    console.error("[updater]", error);
  });

  autoUpdater.on("update-downloaded", async (_event, _notes, releaseName) => {
    downloading = false;
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Ferret update ready",
      message: `${releaseName || "The update"} has been downloaded.`,
      detail: "Restart Ferret now to finish installing it?",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) autoUpdater.quitAndInstall();
  });

  // Squirrel holds a lock on first run after install, so skip that launch
  if (!process.argv.includes("--squirrel-firstrun")) {
    setTimeout(() => void checkForUpdates(false), 15_000);
  }
}
