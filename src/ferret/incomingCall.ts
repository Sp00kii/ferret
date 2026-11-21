import { Notification, ipcMain, nativeImage } from "electron";

import iconAsset from "../../assets/desktop/icon.png?asset";
import { mainWindow } from "../native/window";

import { isFromApp } from "./trust";

type IncomingCall = { title: string; body: string; channelId: string };

let current: Notification | undefined;

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

function focusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function dismiss() {
  current?.close();
  current = undefined;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.flashFrame(false);
}

function show(call: IncomingCall) {
  dismiss();

  const channelId = clip(call.channelId, 64);
  const notification = new Notification({
    title: clip(call.title, 120) || "Incoming call",
    body: clip(call.body, 200),
    icon: nativeImage.createFromDataURL(iconAsset),
    // the page plays the ringtone itself, so the toast stays quiet
    silent: true,
    timeoutType: "never",
    urgency: "critical",
  });

  notification.on("click", () => {
    focusWindow();
    mainWindow.webContents.send("ferret:incomingCallAction", {
      action: "open",
      channelId,
    });
  });

  notification.show();
  current = notification;
  mainWindow.flashFrame(true);
}

export function initIncomingCallIpc() {
  ipcMain.on("ferret:showIncomingCall", (event, call: IncomingCall) => {
    if (isFromApp(event) && call && typeof call === "object") show(call);
  });
  ipcMain.on("ferret:dismissIncomingCall", (event) => {
    if (isFromApp(event)) dismiss();
  });
}
