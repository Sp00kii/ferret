import { powerMonitor } from "electron";

import { mainWindow } from "../native/window";

/**
 * Tell the page to verify its connection the moment the PC wakes up or is
 * unlocked; its timers were frozen during sleep, so it can't notice by itself.
 */
export function initResync() {
  const resync = (reason: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("ferret:resync", reason);
    }
  };

  powerMonitor.on("resume", () => resync("system resumed"));
  powerMonitor.on("unlock-screen", () => resync("screen unlocked"));
}
