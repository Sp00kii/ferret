import { app } from "electron";

import { FERRET } from "./constants";
import { initIncomingCallIpc } from "./incomingCall";
import { initResync } from "./resync";
import { initSettingsIpc } from "./settings";
import { initUpdater } from "./updater";
import { serveWebApp } from "./webApp";

export { FERRET, WEB_URL } from "./constants";
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
  serveWebApp();
  initSettingsIpc();
  initIncomingCallIpc();
  initResync();
  initUpdater();
}
