import path from "node:path";

import { app } from "electron";

/**
 * Development runs (`pnpm start`) get their own data folder, login and
 * single-instance lock, so they never close, take over or change the
 * installed Ferret. Imported first in main.ts: electron-store reads the
 * data folder as soon as it's imported.
 */
export const isDevBuild = !app.isPackaged;

if (isDevBuild) {
  app.setPath("userData", path.join(app.getPath("appData"), "Ferret Dev"));
}
