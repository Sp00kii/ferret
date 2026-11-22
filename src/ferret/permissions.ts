import { session } from "electron";

import { isAppUrl } from "./trust";

/**
 * Electron says yes to every permission request unless the app decides
 * otherwise, including from embedded players (YouTube, Twitch, Spotify,
 * SoundCloud, Bandcamp) and including "open this link in another program"
 * for any scheme Windows knows. Ferret's own page keeps everything it uses;
 * embeds may only go fullscreen and copy to the clipboard.
 */

/** What embedded players may still do */
const EMBED_ALLOWED = new Set(["fullscreen", "clipboard-sanitized-write"]);

/** Programs a link may open from Ferret's page (same as for new windows) */
const EXTERNAL_SCHEMES = new Set(["http:", "https:", "mailto:"]);

function externalAllowed(externalUrl: string | undefined) {
  try {
    return !!externalUrl && EXTERNAL_SCHEMES.has(new URL(externalUrl).protocol);
  } catch {
    return false;
  }
}

export function initPermissions() {
  const ses = session.defaultSession;

  ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const fromApp = isAppUrl(details.requestingUrl);
    if (permission === "openExternal") {
      return callback(
        fromApp &&
          externalAllowed((details as { externalURL?: string }).externalURL),
      );
    }
    callback(fromApp || EMBED_ALLOWED.has(permission));
  });

  // quick "is this allowed?" checks (device names, Notification.permission)
  ses.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      isAppUrl(requestingOrigin) || EMBED_ALLOWED.has(permission),
  );
}
