import { existsSync } from "node:fs";
import { join } from "node:path";

import { BrowserWindow, app, nativeImage } from "electron";

import albino from "../../assets/desktop/alt/albino.png?asset";
import black from "../../assets/desktop/alt/black.png?asset";
import blue from "../../assets/desktop/alt/blue.png?asset";
import chocolate from "../../assets/desktop/alt/chocolate.png?asset";
import cream from "../../assets/desktop/alt/cream.png?asset";
import green from "../../assets/desktop/alt/green.png?asset";
import pink from "../../assets/desktop/alt/pink.png?asset";
import purple from "../../assets/desktop/alt/purple.png?asset";
import silver from "../../assets/desktop/alt/silver.png?asset";
import classic from "../../assets/desktop/icon.png?asset";
import { setTrayImage } from "../native/tray";

import { FERRET } from "./constants";
import { getSettings, onSettingsSaved } from "./settings";

/** Alternative app icons (recoloured mascot); "classic" is the normal one */
const ICONS: Record<string, string> = {
  classic,
  cream,
  black,
  chocolate,
  blue,
  purple,
  pink,
  green,
  albino,
  silver,
};

export function currentAppIcon() {
  return nativeImage.createFromDataURL(
    ICONS[getSettings().appIcon] ?? ICONS.classic,
  );
}

/** The .ico for the taskbar button (shipped as resources/alt/*.ico) */
function icoFile(id: string) {
  const dir = app.isPackaged
    ? join(process.resourcesPath, "alt")
    : join(app.getAppPath(), "assets", "desktop", "alt");
  const file = join(dir, `${id}.ico`);
  return existsSync(file) ? file : undefined;
}

/**
 * Windows draws the taskbar button from the app's shortcut, not from the
 * window icon. Giving the window its own icon resource (same app id, so it
 * still groups with pinned Ferret) makes the button follow the choice.
 */
function applyTaskbarIcon(window: BrowserWindow) {
  if (process.platform !== "win32" || window.isDestroyed()) return;
  const id = getSettings().appIcon;
  const appIconPath = id === "classic" ? process.execPath : icoFile(id);
  if (!appIconPath) return;
  window.setAppDetails({
    appId: app.isPackaged
      ? FERRET.squirrelAppUserModelId
      : FERRET.devAppUserModelId,
    appIconPath,
    appIconIndex: 0,
  });
}

function apply() {
  const image = currentAppIcon();
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    window.setIcon(image);
    applyTaskbarIcon(window);
  }
  setTrayImage(image);
}

/**
 * Window, taskbar button and tray follow the chosen icon. (The Start menu
 * shortcut itself keeps the installer's icon.)
 */
export function initAppIcon() {
  app.on("browser-window-created", (_, window) => {
    if (getSettings().appIcon === "classic") return;
    window.setIcon(currentAppIcon());
    // after the constructor returns, so the window is fully set up
    setImmediate(() => applyTaskbarIcon(window));
  });
  onSettingsSaved((next, previous) => {
    if (next.appIcon !== previous.appIcon) apply();
  });
}
