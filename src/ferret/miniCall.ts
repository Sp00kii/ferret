import { join } from "node:path";

import { BrowserWindow, ipcMain, screen } from "electron";

import { mainWindow } from "../native/window";

import { WEB_ORIGIN } from "./constants";
import { getSettings, onSettingsSaved } from "./settings";
import { isFromApp } from "./trust";

/** What the page reports about the current call */
type CallState = {
  inCall: boolean;
  callId: string;
  [key: string]: unknown;
};

const WIDTH = 272;
const MARGIN = 16;

let mini: BrowserWindow | undefined;
let state: CallState = { inCall: false, callId: "" };
let dismissedCallId: string | undefined;
let userPosition: [number, number] | undefined;
const watchedWindows = new WeakSet<BrowserWindow>();

const mainHasFocus = () =>
  !!mainWindow &&
  !mainWindow.isDestroyed() &&
  mainWindow.isVisible() &&
  !mainWindow.isMinimized() &&
  mainWindow.isFocused();

const shouldShow = () =>
  state.inCall &&
  getSettings().voice.compactCallWindow &&
  dismissedCallId !== state.callId &&
  !mainHasFocus();

function createMini() {
  const window = new BrowserWindow({
    width: WIDTH,
    height: 150,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Ferret call",
    webPreferences: {
      // same preload as the main window: it only exposes window.ferret
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  // above borderless-fullscreen games too
  window.setAlwaysOnTop(true, "screen-saver");
  window.on("moved", () => {
    userPosition = window.getPosition() as [number, number];
  });
  window.on("closed", () => {
    if (mini === window) mini = undefined;
  });
  window.webContents.on("did-finish-load", () =>
    window.webContents.send("ferret:mini:render", state),
  );
  void window.loadURL(`${WEB_ORIGIN}/__ferret/mini`);
  return window;
}

function place(window: BrowserWindow) {
  if (userPosition) return window.setPosition(...userPosition);
  const display = mainWindow
    ? screen.getDisplayMatching(mainWindow.getBounds())
    : screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const [, h] = window.getSize();
  window.setPosition(x + width - WIDTH - MARGIN, y + height - h - MARGIN);
}

function refresh() {
  watchMainWindow();
  if (shouldShow()) {
    if (!mini) {
      mini = createMini();
      place(mini);
    }
    mini.webContents.send("ferret:mini:render", state);
    if (!mini.isVisible()) mini.showInactive();
  } else if (mini) {
    if (!state.inCall) {
      mini.destroy();
      mini = undefined;
    } else {
      mini.hide();
    }
  }
}

/** Re-check visibility whenever the main window gains or loses focus */
function watchMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed() || watchedWindows.has(mainWindow))
    return;
  watchedWindows.add(mainWindow);
  for (const event of [
    "focus",
    "blur",
    "minimize",
    "restore",
    "show",
    "hide",
  ] as const) {
    mainWindow.on(event as "focus", () => setTimeout(refresh, 50));
  }
}

/** Where the compact call window is, if it's showing (toasts avoid it) */
export function miniCallBounds() {
  return mini && !mini.isDestroyed() && mini.isVisible()
    ? mini.getBounds()
    : undefined;
}

function focusMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

const fromMini = (event: Electron.IpcMainEvent) =>
  !!mini && event.sender === mini.webContents && isFromApp(event);

export function initMiniCall() {
  // page -> main: the current call (or none)
  ipcMain.on("ferret:mini:state", (event, next: CallState) => {
    if (!isFromApp(event) || event.sender !== mainWindow?.webContents) return;
    if (!next || typeof next !== "object") return;
    if (next.callId !== state.callId) dismissedCallId = undefined;
    state = {
      ...next,
      inCall: !!next.inCall,
      callId: String(next.callId ?? ""),
    };
    refresh();
  });

  // mini window -> main: buttons
  ipcMain.on("ferret:mini:command", (event, command: string) => {
    if (!fromMini(event)) return;
    switch (command) {
      case "focus":
        focusMain();
        break;
      case "close":
        dismissedCallId = state.callId;
        refresh();
        break;
      case "toggleMute":
      case "toggleDeafen":
      case "disconnect":
        mainWindow?.webContents.send("ferret:mini:command", command);
        break;
    }
  });

  ipcMain.on("ferret:mini:resize", (event, height: number) => {
    if (!fromMini(event) || !mini) return;
    const h = Math.round(Math.min(480, Math.max(90, Number(height) || 150)));
    const [, current] = mini.getSize();
    if (h === current) return;
    mini.setSize(WIDTH, h);
    if (!userPosition) place(mini);
  });

  onSettingsSaved((next, previous) => {
    if (next.voice.compactCallWindow !== previous.voice.compactCallWindow)
      refresh();
  });
}
