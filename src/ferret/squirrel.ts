import { spawn } from "node:child_process";
import path from "node:path";

import { app } from "electron";

/**
 * Windows installer events (Squirrel), replacing electron-squirrel-startup.
 *
 * Same as before, except that an update only refreshes the Start menu
 * shortcut. The desktop shortcut is made once, on install, so deleting it
 * sticks instead of coming back with every update
 * (stoatchat/for-desktop#244).
 *
 * Returns true when this launch was only an installer event and the app
 * should quit.
 */
export function handleSquirrelEvent(): boolean {
  if (process.platform !== "win32") return false;

  const exe = path.basename(process.execPath);
  const run = (args: string[]) => {
    const updateExe = path.resolve(
      path.dirname(process.execPath),
      "..",
      "Update.exe",
    );
    spawn(updateExe, args, { detached: true }).on("close", () => app.quit());
  };

  switch (process.argv[1]) {
    case "--squirrel-install":
      run([
        `--createShortcut=${exe}`,
        "--shortcut-locations=Desktop,StartMenu",
      ]);
      return true;
    case "--squirrel-updated":
      run([`--createShortcut=${exe}`, "--shortcut-locations=StartMenu"]);
      return true;
    case "--squirrel-uninstall":
      run([
        `--removeShortcut=${exe}`,
        "--shortcut-locations=Desktop,StartMenu",
      ]);
      return true;
    case "--squirrel-obsolete":
      return true;
    default:
      return false;
  }
}
