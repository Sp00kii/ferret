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

function apply() {
  const image = currentAppIcon();
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.setIcon(image);
  }
  setTrayImage(image);
}

/**
 * Window + tray icon follow the chosen icon. (The Start menu / pinned
 * shortcut keeps the installer's icon; Windows reads that from the exe.)
 */
export function initAppIcon() {
  app.on("browser-window-created", (_, window) => {
    if (getSettings().appIcon !== "classic") window.setIcon(currentAppIcon());
  });
  onSettingsSaved((next, previous) => {
    if (next.appIcon !== previous.appIcon) apply();
  });
}
