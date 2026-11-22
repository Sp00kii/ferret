import { app } from "electron";

// loads the taskbar badge IPC handler (never imported upstream)
import "../native/badges";

import { initAppIcon } from "./appIcon";
import { initBackup } from "./backup";
import { FERRET } from "./constants";
// must be evaluated before settings/config stores open the data folder
import { isDevBuild } from "./devData";
import { initDiagnostics } from "./diagnostics";
import { initHotkeys } from "./hotkeys";
import { initImageCors } from "./imageCors";
import { initIncomingCallIpc } from "./incomingCall";
import { initMiniCall } from "./miniCall";
import { initPermissions } from "./permissions";
import { initResync } from "./resync";
import { initSettingsIpc } from "./settings";
import { initToasts } from "./toasts";
import { initUpdater } from "./updater";
import { serveWebApp } from "./webApp";
import { initZoom } from "./zoom";

export { FERRET, WEB_URL } from "./constants";
export { isDevBuild };
export { isAppUrl } from "./trust";
export { registerWebScheme } from "./webApp";

/**
 * Windows only shows toasts for an AppUserModelID that matches a Start menu
 * shortcut; Squirrel creates that shortcut with its own ID on install.
 */
export function ferretAppUserModelId() {
  return app.isPackaged
    ? FERRET.squirrelAppUserModelId
    : FERRET.devAppUserModelId;
}

/**
 * Everything Ferret adds to the main process. Call once the app is ready,
 * before the main window loads its page.
 */
export function initFerret() {
  initPermissions();
  serveWebApp();
  initSettingsIpc();
  initIncomingCallIpc();
  initResync();
  initUpdater();
  initHotkeys();
  initMiniCall();
  initDiagnostics();
  initToasts();
  initAppIcon();
  initZoom();
  initImageCors();
  initBackup();
}
