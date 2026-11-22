import { app, globalShortcut, ipcMain } from "electron";

import { mainWindow } from "../native/window";

import {
  type FerretSettings,
  type PttBinding,
  getSettings,
  onSettingsSaved,
  savePttBinding,
} from "./settings";
import { isFromApp } from "./trust";

type HookModule = typeof import("uiohook-napi");

let hook: HookModule | undefined;
let hookRunning = false;
let listenersAttached = false;
let pttHeld = false;
let capture: ((binding: PttBinding | null) => void) | undefined;

const MOUSE_LABELS: Record<number, string> = {
  3: "Middle mouse button",
  4: "Mouse button 4 (back)",
  5: "Mouse button 5 (forward)",
};

function send(channel: string, value: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, value);
  }
}

function keyLabel(code: number) {
  const name = Object.entries(hook!.UiohookKey).find(
    ([, value]) => value === code,
  )?.[0];
  return name ? name.replace(/^Numpad/, "Numpad ") : `Key ${code}`;
}

/**
 * The input hook only sees the one bound key/button: nothing is recorded or
 * sent anywhere, it just flips push-to-talk on and off.
 */
function onInput(kind: PttBinding["kind"], code: number, down: boolean) {
  if (capture) {
    if (!down) return;
    if (kind === "key" && code === hook!.UiohookKey.Escape)
      return capture(null);
    // left / right click can't be push-to-talk
    if (kind === "mouse" && !MOUSE_LABELS[code]) return;
    return capture({
      kind,
      code,
      label: kind === "mouse" ? MOUSE_LABELS[code] : keyLabel(code),
    });
  }

  const { pushToTalk, pttBinding } = getSettings().voice;
  if (!pushToTalk || !pttBinding) return;
  if (pttBinding.kind !== kind || pttBinding.code !== code) return;
  if (down !== pttHeld) {
    pttHeld = down;
    send("ferret:ptt", down);
  }
}

async function setHookRunning(running: boolean) {
  if (running === hookRunning) return;
  try {
    hook ??= await import("uiohook-napi");
  } catch (error) {
    console.error("[ferret] push-to-talk input hook unavailable", error);
    return;
  }

  if (!listenersAttached) {
    listenersAttached = true;
    hook.uIOhook.on("keydown", (e) => onInput("key", e.keycode, true));
    hook.uIOhook.on("keyup", (e) => onInput("key", e.keycode, false));
    hook.uIOhook.on("mousedown", (e) =>
      onInput("mouse", Number(e.button), true),
    );
    hook.uIOhook.on("mouseup", (e) =>
      onInput("mouse", Number(e.button), false),
    );
  }

  if (running) {
    try {
      hook.uIOhook.start();
    } catch (error) {
      // e.g. Linux on Wayland without X11 access
      console.error("[ferret] push-to-talk input hook failed to start", error);
      return;
    }
  } else {
    hook.uIOhook.stop();
    if (pttHeld) {
      pttHeld = false;
      send("ferret:ptt", false);
    }
  }
  hookRunning = running;
}

const wantsHook = (settings: FerretSettings) =>
  settings.voice.pushToTalk && !!settings.voice.pttBinding;

/** Wait for the next key / side mouse button and store it as the PTT binding */
async function capturePttBinding(): Promise<FerretSettings> {
  await setHookRunning(true);
  const binding = await new Promise<PttBinding | null>((resolve) => {
    const timeout = setTimeout(() => finish(null), 10_000);
    const finish = (value: PttBinding | null) => {
      clearTimeout(timeout);
      capture = undefined;
      resolve(value);
    };
    capture = finish;
  });

  const next = binding ? savePttBinding(binding) : getSettings();
  await setHookRunning(wantsHook(next));
  return next;
}

let registered: string[] = [];
let hotkeyStatus = { mute: true, deafen: true };

/** A single key without a modifier would hijack typing everywhere */
const safeAccelerator = (accelerator: string) =>
  /\+/.test(accelerator) || /^F([1-9]|1[0-9]|2[0-4])$/.test(accelerator);

function applyHotkeys(settings: FerretSettings) {
  for (const accelerator of registered) globalShortcut.unregister(accelerator);
  registered = [];

  const bind = (accelerator: string | null, action: string) => {
    if (!accelerator) return true;
    if (!safeAccelerator(accelerator)) return false;
    try {
      const ok = globalShortcut.register(accelerator, () =>
        send("ferret:hotkey", action),
      );
      if (ok) registered.push(accelerator);
      return ok;
    } catch {
      return false;
    }
  };

  hotkeyStatus = {
    mute: bind(settings.voice.muteHotkey, "toggleMute"),
    deafen: bind(settings.voice.deafenHotkey, "toggleDeafen"),
  };
}

export function initHotkeys() {
  const initial = getSettings();
  applyHotkeys(initial);
  void setHookRunning(wantsHook(initial));

  onSettingsSaved((next, previous) => {
    if (
      next.voice.muteHotkey !== previous.voice.muteHotkey ||
      next.voice.deafenHotkey !== previous.voice.deafenHotkey
    ) {
      applyHotkeys(next);
    }
    void setHookRunning(wantsHook(next));
  });

  ipcMain.handle("ferret:capturePttBinding", (event) =>
    isFromApp(event) ? capturePttBinding() : null,
  );
  ipcMain.handle("ferret:hotkeyStatus", (event) =>
    isFromApp(event) ? hotkeyStatus : null,
  );

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
    if (hookRunning) hook?.uIOhook.stop();
  });
}
