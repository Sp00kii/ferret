import { contextBridge, ipcRenderer } from "electron";

import { version } from "../../package.json";
import { FERRET } from "../ferret/constants";

type Listener<T> = (value: T) => void;

function subscribe<T>(channel: string, callback: Listener<T>) {
  const handler = (_: unknown, value: T) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld("ferret", {
  version,
  unofficialNotice: FERRET.unofficialNotice,
  repository: `https://github.com/${FERRET.repo}`,

  getSettings: () => ipcRenderer.invoke("ferret:getSettings"),
  setSettings: (patch: unknown) =>
    ipcRenderer.invoke("ferret:setSettings", patch),
  onSettingsChanged: (callback: Listener<unknown>) =>
    subscribe("ferret:settings", callback),

  pickRingtone: () => ipcRenderer.invoke("ferret:pickRingtone"),
  clearRingtone: () => ipcRenderer.invoke("ferret:clearRingtone"),

  showIncomingCall: (call: unknown) =>
    ipcRenderer.send("ferret:showIncomingCall", call),
  dismissIncomingCall: () => ipcRenderer.send("ferret:dismissIncomingCall"),
  onIncomingCallAction: (callback: Listener<unknown>) =>
    subscribe("ferret:incomingCallAction", callback),

  onResync: (callback: Listener<string>) =>
    subscribe("ferret:resync", callback),

  checkForUpdates: () => ipcRenderer.invoke("ferret:checkForUpdates"),
});
