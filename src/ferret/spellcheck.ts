import { app, ipcMain, session } from "electron";

import { getSettings, onSettingsSaved } from "./settings";
import { isFromApp } from "./trust";

/**
 * Spellchecker language (stoatchat/for-desktop#69). The spellchecker can't
 * tell which language you type in, so Ferret sets the one you pick
 * (Settings -> Ferret -> Appearance), or follows the app's language.
 * Turning it on / off stays in Settings -> Desktop.
 */

function apply(language: string | null) {
  const ses = session.defaultSession;
  const available = ses.availableSpellCheckerLanguages;
  if (!available.length) return; // macOS uses its own
  const locale = app.getLocale();
  const wanted = [
    language,
    // automatic: the app's language, or just its first part (en-US -> en)
    locale,
    locale.split("-")[0],
    "en-US",
  ].find((code): code is string => !!code && available.includes(code));
  if (wanted) ses.setSpellCheckerLanguages([wanted]);
}

export function initSpellcheck() {
  apply(getSettings().spellcheckLanguage);
  onSettingsSaved((next, previous) => {
    if (next.spellcheckLanguage !== previous.spellcheckLanguage)
      apply(next.spellcheckLanguage);
  });
  ipcMain.handle("ferret:spellcheckLanguages", (event) =>
    isFromApp(event)
      ? session.defaultSession.availableSpellCheckerLanguages
      : null,
  );
}
