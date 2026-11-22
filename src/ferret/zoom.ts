import { app } from "electron";

import { mainWindow } from "../native/window";

import { getSettings, onSettingsSaved, saveZoom } from "./settings";

/** Zoom steps for Ctrl +/- and Ctrl + mouse wheel, in percent */
const STEP = 10;

function apply() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.setZoomFactor(getSettings().zoom / 100);
}

/** Ctrl + / Ctrl - / Ctrl 0 and Ctrl + wheel: change and remember the zoom */
export function stepZoom(direction: 1 | -1 | 0) {
  const current = getSettings().zoom;
  saveZoom(direction === 0 ? 100 : current + direction * STEP);
}

/**
 * The zoom level is a Ferret setting (slider in Settings -> Ferret), so it
 * survives restarts and the keyboard / slider stay in sync.
 */
export function initZoom() {
  app.on("browser-window-created", (_, window) => {
    // the main window is created right after this event; check on load
    window.webContents.on("did-finish-load", () => {
      if (window === mainWindow) apply();
    });
    window.webContents.on("zoom-changed", (event, direction) => {
      if (window !== mainWindow) return;
      event.preventDefault();
      stepZoom(direction === "in" ? 1 : -1);
    });
  });
  onSettingsSaved((next, previous) => {
    if (next.zoom !== previous.zoom) apply();
  });
}
