import { Menu, Tray, nativeImage } from "electron";

import trayIconAsset from "../../assets/desktop/icon.png?asset";
import macOsTrayIconAsset from "../../assets/desktop/iconTemplate.png?asset";
import { version } from "../../package.json";

import { createMainWindow, mainWindow, quitApp } from "./window";

// internal tray state
let tray: Tray = null;

// Create and resize tray icon for macOS
function createTrayIcon() {
  if (process.platform === "darwin") {
    const image = nativeImage.createFromDataURL(macOsTrayIconAsset);
    const resized = image.resize({ width: 20, height: 20 });
    resized.setTemplateImage(true);
    return resized;
  } else {
    return nativeImage.createFromDataURL(trayIconAsset);
  }
}

export function initTray() {
  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);
  updateTrayMenu();
  tray.setToolTip("Ferret"); // Ferret mod
  tray.setImage(trayIcon);
  tray.on("click", toggleWindow); // Ferret mod
}

// Ferret mod: never touch a destroyed window from the tray; reopen instead
const liveWindow = () =>
  mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;

function toggleWindow() {
  const window = liveWindow();
  if (!window) {
    createMainWindow();
  } else if (window.isVisible()) {
    window.hide();
  } else {
    window.show();
    window.focus();
  }
}

export function updateTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Ferret", type: "normal", enabled: false }, // Ferret mod
      {
        label: "Version",
        type: "submenu",
        submenu: Menu.buildFromTemplate([
          {
            label: version,
            type: "normal",
            enabled: false,
          },
        ]),
      },
      { type: "separator" },
      {
        label: liveWindow()?.isVisible() ? "Hide App" : "Show App", // Ferret mod
        type: "normal",
        click: toggleWindow,
      },
      {
        label: "Quit App",
        type: "normal",
        click: quitApp,
      },
    ]),
  );
}
