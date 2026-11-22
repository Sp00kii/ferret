import AutoLaunch from "auto-launch";

import { ipcMain } from "electron";

import { isFromApp } from "../ferret/trust"; // Ferret mod

export const autoLaunch = new AutoLaunch({
  name: "Ferret", // Ferret mod: separate autostart entry from the official app
});

export function initAutoLaunch() {
  ipcMain.handle("getAutostart", async (event) => {
    if (!isFromApp(event)) return false; // Ferret mod
    const enabled = await autoLaunch.isEnabled();
    return enabled;
  });

  ipcMain.handle("setAutostart", async (event, state: boolean) => {
    if (!isFromApp(event)) return false; // Ferret mod
    if (state === true) {
      await autoLaunch.enable();
      console.log("Received new configuration autoStart: true");
    } else {
      await autoLaunch.disable();
      console.log("Received new configuration autoStart: false");
    }

    const enabled = await autoLaunch.isEnabled();
    return enabled;
  });
}
