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

  pickSound: (slot: string) => ipcRenderer.invoke("ferret:pickSound", slot),
  clearSound: (slot: string) => ipcRenderer.invoke("ferret:clearSound", slot),
  resetSounds: () => ipcRenderer.invoke("ferret:resetSounds"),

  pickPersonSound: (userId: string, kind: string) =>
    ipcRenderer.invoke("ferret:pickPersonSound", userId, kind),

  addSoundboardClip: () => ipcRenderer.invoke("ferret:addSoundboardClip"),
  removeSoundboardClip: (id: string) =>
    ipcRenderer.invoke("ferret:removeSoundboardClip", id),
  renameSoundboardClip: (id: string, name: string) =>
    ipcRenderer.invoke("ferret:renameSoundboardClip", id, name),

  showIncomingCall: (call: unknown) =>
    ipcRenderer.send("ferret:showIncomingCall", call),
  dismissIncomingCall: () => ipcRenderer.send("ferret:dismissIncomingCall"),
  onIncomingCallAction: (callback: Listener<unknown>) =>
    subscribe("ferret:incomingCallAction", callback),

  onResync: (callback: Listener<string>) =>
    subscribe("ferret:resync", callback),

  checkForUpdates: () => ipcRenderer.invoke("ferret:checkForUpdates"),

  // voice: push-to-talk and global mute / deafen hotkeys
  capturePttBinding: () => ipcRenderer.invoke("ferret:capturePttBinding"),
  hotkeyStatus: () => ipcRenderer.invoke("ferret:hotkeyStatus"),
  onPushToTalk: (callback: Listener<boolean>) =>
    subscribe("ferret:ptt", callback),
  onHotkey: (callback: Listener<string>) =>
    subscribe("ferret:hotkey", callback),

  // compact call window
  mini: {
    // main page: report the call, receive button presses
    update: (state: unknown) => ipcRenderer.send("ferret:mini:state", state),
    onCommand: (callback: Listener<string>) =>
      subscribe("ferret:mini:command", callback),
    // the compact window itself
    onRender: (callback: Listener<unknown>) =>
      subscribe("ferret:mini:render", callback),
    command: (command: string) =>
      ipcRenderer.send("ferret:mini:command", command),
    resize: (height: number) => ipcRenderer.send("ferret:mini:resize", height),
  },
});
