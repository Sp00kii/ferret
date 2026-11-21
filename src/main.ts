import fs from "node:fs";
import path from "node:path";

import { BrowserWindow, app, shell } from "electron";
import started from "electron-squirrel-startup";

// Ferret mod: replaces update-electron-app (see src/ferret/updater.ts)
import {
  ferretAppUserModelId,
  initFerret,
  isAppUrl,
  isDevBuild,
  registerWebScheme,
} from "./ferret";
import { initAutoLaunch } from "./native/autoLaunch";
import { config } from "./native/config";
import {
  findDeepLink,
  initDeepLinks,
  openDeepLink,
  registerProtocol,
} from "./native/deepLink";
import { initDiscordRpc } from "./native/discordRpc";
import { initTray } from "./native/tray";
import { destroyVirtualMic, initVirtualMic } from "./native/virtualMic";
import { createMainWindow, mainWindow } from "./native/window";

// In Flatpak, we have to update the temp dir to a shared directory across host and sandbox;
// otherwise, the icon will not show up in the tray when using app indicators.
if (process.platform === "linux" && process.env.FLATPAK_ID) {
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  if (runtimeDir) {
    try {
      const sharedTmpDir = path.join(runtimeDir, "app", process.env.FLATPAK_ID);
      fs.mkdirSync(sharedTmpDir, { recursive: true });
      process.env.TMPDIR = sharedTmpDir;
    } catch (error) {
      console.error("Failed to set up host-visible TMPDIR:", error);
    }
  }
}

// Squirrel-specific logic
// create/remove shortcuts on Windows when installing / uninstalling
// we just need to close out of the app immediately
if (started) {
  app.quit();
}

// disable hw-accel if so requested
if (!config.hardwareAcceleration) {
  app.disableHardwareAcceleration();
}

// Ferret mod: the bundled web client is served from ferret-app://, which
// has to be registered before the app is ready
registerWebScheme();

// ensure only one copy of the application can run
const acquiredLock = app.requestSingleInstanceLock();

if (acquiredLock) {
  // facilitate ferret:// links
  // Ferret mod: dev runs must not take ferret:// links from the installed app
  if (!isDevBuild) registerProtocol();

  // necessary macOS glue
  let pendingDeepLink = findDeepLink(process.argv);
  app.on("open-url", (event, url) => {
    event.preventDefault();
    // openDeepLink recreates the window if macOS closed it
    if (app.isReady()) {
      openDeepLink(url);
    } else {
      pendingDeepLink = url;
    }
  });

  // create and configure the app when electron is ready
  app.on("ready", () => {
    // create window and application contexts
    initDeepLinks();
    initFerret(); // Ferret mod: serves the web client, so before the window
    createMainWindow();

    // save first launch state
    if (config.firstLaunch) {
      // Doesn't do anything right now. Used to enable auto start, but that behaviour was removed.
      // Left in case it gets used in the future.
      config.firstLaunch = false;
    }

    initTray();
    initDiscordRpc();
    initVirtualMic();
    initAutoLaunch();

    // follow the link the app was started with; after the tray exists, as
    // showing the window updates the tray menu
    if (pendingDeepLink) {
      openDeepLink(pendingDeepLink);
      pendingDeepLink = undefined;
    }

    // Windows specific fix for notifications
    if (process.platform === "win32") {
      app.setAppUserModelId(ferretAppUserModelId()); // Ferret mod
    }
  });

  // Focus the window if we try to launch again, following any stoat:// link
  // it was launched with (Windows and Linux)
  app.on("second-instance", (_event, argv) => {
    const link = findDeepLink(argv);
    if (link) {
      openDeepLink(link);
      return;
    }

    mainWindow.show();
    mainWindow.restore();
    mainWindow.focus();
  });

  // macOS specific behaviour to keep app active in dock:
  // (irrespective of the minimise-to-tray option)

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // ensure URLs launch in external context
  app.on("web-contents-created", (_, contents) => {
    // prevent navigation out of build URL origin
    contents.on("will-navigate", (event, navigationUrl) => {
      // Ferret mod: origin is "null" for ferret-app://, so compare protocol + host
      if (!isAppUrl(navigationUrl)) {
        event.preventDefault();
      }
    });

    // handle links externally
    contents.setWindowOpenHandler(({ url }) => {
      if (
        url.startsWith("http:") ||
        url.startsWith("https:") ||
        url.startsWith("mailto:")
      ) {
        setImmediate(() => {
          shell.openExternal(url);
        });
      }

      return { action: "deny" };
    });
  });

  let readyToQuit = false;
  app.on("will-quit", (e) => {
    if (readyToQuit) return;
    e.preventDefault();
    destroyVirtualMic().finally(() => {
      readyToQuit = true;
      // Ferret mod: re-quit on a fresh task. On Windows the teardown resolves
      // instantly, so app.quit() ran while Electron still considered the
      // first quit in progress and was ignored: windows closed, app stayed
      // alive (and Squirrel's "Restart now" waited forever). Force-exit as a
      // last resort if something still holds it open.
      setTimeout(() => app.quit(), 0);
      setTimeout(() => app.exit(0), 5000);
    });
  });
} else {
  app.quit();
}
