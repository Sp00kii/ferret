import path from "node:path";

import { app, ipcMain } from "electron";

import { createMainWindow, mainWindow } from "./window";

/**
 * Link scheme (ferret://)
 */
// Ferret mod: own scheme, so stoat:// links keep opening the official app
export const PROTOCOL = "ferret";

/**
 * In-app path for a `stoat://` link.
 * They are 1:1, so `stoat://a/b?c` opens `/a/b?c`
 *
 * Any website can open these links, so they only ever navigate and never take an action on the user's behalf.
 */
export function deepLinkPath(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== `${PROTOCOL}:` || link.length > 2048) return null;

  // the first segment will parse as the host due to how URLs work
  const path = `/${url.host}${url.pathname === "/" ? "" : url.pathname}${url.search}`;

  // no other sites
  return path.startsWith("//") || path.includes("\\") ? null : path;
}

/**
 * Find a `stoat://` link among command line arguments, as Windows and Linux
 * pass it when opening the app
 */
export function findDeepLink(argv: string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`));
}

/**
 * Latest link the page hasn't confirmed following yet
 *
 * This is kept separate from the page because the page may be thrown away
 * at multiple points in the app lifecycle, particularly on macOS. The id lets
 * a confirmation clear only the link it was for, never a newer one.
 */
let pending: { id: number; target: string } | undefined;
let nextId = 0;

/**
 * Bring the window forward, recreating it if it was closed, and follow a
 * `stoat://` link in it
 */
export function openDeepLink(link: string) {
  // A recreated window may start hidden (start minimised), so show it too
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();

  const target = deepLinkPath(link);
  if (!target) return;

  // Only the latest link matters; the page takes it when it's ready to
  // navigate, and this tells a page that already is
  pending = { id: ++nextId, target };
  mainWindow.webContents.send("navigate");
}

/**
 * Ferret mod: open a page of the app itself in the main window. A
 * middle-click on an in-app link (a reply, a search result) asks for a new
 * window, which Ferret doesn't allow, so it used to do nothing
 * (stoatchat/for-desktop#223). Only the path is used, never another site.
 */
export function openAppLink(link: string) {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return;
  }
  const target = `${url.pathname}${url.search}${url.hash}`;
  if (
    !target.startsWith("/") ||
    target.startsWith("//") ||
    target.includes("\\")
  )
    return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  pending = { id: ++nextId, target };
  mainWindow.webContents.send("navigate");
}

/**
 * Let the page fetch the waiting link, and confirm once it has followed it
 *
 * A page reloaded before confirming fetches the same link again; following
 * it twice only opens the same page.
 */
export function initDeepLinks() {
  ipcMain.handle("takeNavigation", () => pending ?? null);
  ipcMain.on("navigationDone", (_, id: number) => {
    if (pending?.id === id) pending = undefined;
  });
}

/**
 * Make this app the handler for `stoat://` links
 */
export function registerProtocol() {
  if (process.defaultApp && process.argv.length >= 2) {
    // `electron .` in development
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}
