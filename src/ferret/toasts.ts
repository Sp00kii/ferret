import { join } from "node:path";

import { BrowserWindow, ipcMain, screen } from "electron";

import { mainWindow } from "../native/window";

import { WEB_ORIGIN } from "./constants";
import { miniCallBounds } from "./miniCall";
import { isFromApp } from "./trust";

/** One notification as sent by the page */
type Toast = {
  id: string;
  title: string;
  subtitle?: string;
  body: string;
  icon?: string;
  channelId: string;
  messageId?: string;
  canReply: boolean;
  look?: Record<string, string>;
};

const WIDTH = 368;
const MARGIN = 12;

let window: BrowserWindow | undefined;
let ready = false;
let pending: Toast[] = [];
let height = 0;

const clip = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

/** Pop-up colours from the page: known keys, #rrggbb values only */
function sanitizeLook(input: unknown) {
  if (!input || typeof input !== "object") return undefined;
  const look: Record<string, string> = {};
  for (const key of [
    "bg",
    "panel",
    "line",
    "text",
    "dim",
    "accent",
    "onAccent",
  ]) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value))
      look[key] = value;
  }
  return look;
}

function sanitize(input: unknown): Toast | undefined {
  if (!input || typeof input !== "object") return;
  const t = input as Record<string, unknown>;
  const toast: Toast = {
    id: clip(t.id, 64),
    title: clip(t.title, 200),
    subtitle: clip(t.subtitle, 200) || undefined,
    body: clip(t.body, 600),
    icon:
      typeof t.icon === "string" && /^https:\/\//.test(t.icon)
        ? t.icon.slice(0, 2000)
        : undefined,
    channelId: clip(t.channelId, 64),
    messageId: clip(t.messageId, 64) || undefined,
    canReply: t.canReply === true,
    look: sanitizeLook(t.look),
  };
  return toast.id && toast.channelId ? toast : undefined;
}

function place() {
  if (!window || height <= 0) return;
  const display = mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const area = display.workArea;
  // sit above the compact call window when it's in the default corner
  const mini = miniCallBounds();
  let bottom = area.y + area.height - MARGIN;
  if (
    mini &&
    mini.x + mini.width > area.x + area.width - WIDTH - MARGIN &&
    mini.y + mini.height > bottom - 200
  ) {
    bottom = Math.min(bottom, mini.y - 4);
  }
  window.setBounds({
    x: area.x + area.width - WIDTH - MARGIN,
    y: Math.max(area.y, bottom - height),
    width: WIDTH,
    height,
  });
}

function create() {
  const created = new BrowserWindow({
    width: WIDTH,
    height: 120,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Ferret notifications",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  created.setAlwaysOnTop(true, "pop-up-menu");
  created.on("closed", () => {
    if (window === created) {
      window = undefined;
      ready = false;
    }
  });
  created.webContents.on("did-finish-load", () => {
    ready = true;
    for (const toast of pending)
      created.webContents.send("ferret:toast:add", toast);
    pending = [];
  });
  void created.loadURL(`${WEB_ORIGIN}/__ferret/toast`);
  return created;
}

function show(toast: Toast) {
  window ??= create();
  if (ready) window.webContents.send("ferret:toast:add", toast);
  else pending.push(toast);
}

function focusMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

const fromToasts = (event: Electron.IpcMainEvent) =>
  !!window && event.sender === window.webContents && isFromApp(event);
const fromMain = (event: Electron.IpcMainEvent) =>
  isFromApp(event) && event.sender === mainWindow?.webContents;

export function initToasts() {
  // main page -> show a notification
  ipcMain.on("ferret:toast:show", (event, input: unknown) => {
    if (!fromMain(event)) return;
    const toast = sanitize(input);
    if (toast) show(toast);
  });

  // main page -> result of a reply, shown on the toast
  ipcMain.on("ferret:toast:replyResult", (event, result: unknown) => {
    if (!fromMain(event) || !window || !result || typeof result !== "object")
      return;
    const r = result as Record<string, unknown>;
    window.webContents.send("ferret:toast:replyResult", {
      id: clip(r.id, 64),
      ok: r.ok === true,
      error: clip(r.error, 200) || undefined,
    });
  });

  // toast window -> its size (0 = nothing left to show)
  ipcMain.on("ferret:toast:resize", (event, next: number) => {
    if (!fromToasts(event) || !window) return;
    height = Math.round(Math.min(900, Math.max(0, Number(next) || 0)));
    if (height === 0) {
      window.hide();
      return;
    }
    place();
    if (!window.isVisible()) window.showInactive();
  });

  // toast window -> open the conversation or send a reply
  ipcMain.on("ferret:toast:action", (event, input: unknown) => {
    if (!fromToasts(event) || !input || typeof input !== "object") return;
    const a = input as Record<string, unknown>;
    const channelId = clip(a.channelId, 64);
    if (!channelId) return;
    if (a.type === "open") {
      focusMain();
      mainWindow?.webContents.send("ferret:toast:action", {
        type: "open",
        channelId,
        messageId: clip(a.messageId, 64) || undefined,
      });
    } else if (a.type === "reply") {
      const text = clip(a.text, 2000).trim();
      if (!text) return;
      mainWindow?.webContents.send("ferret:toast:action", {
        type: "reply",
        id: clip(a.id, 64),
        channelId,
        messageId: clip(a.messageId, 64) || undefined,
        text,
      });
    }
  });
}
