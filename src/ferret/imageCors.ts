import { session } from "electron";

import { WEB_ORIGIN } from "./constants";
import { isAppUrl } from "./trust";

/**
 * Small fixes to response headers of two Stoat sites (Electron allows only
 * one header handler, so both live here). Nothing is sent anywhere.
 *
 * 1. Stoat's image proxy (pictures from other websites) doesn't send a CORS
 *    header, unlike Stoat's own file server. Without it the page can't read
 *    the first frame of a GIF to show it still ("Pause GIFs until hovered").
 *
 * 2. Discover (stt.gg) may only be embedded by Stoat's own sites, so in
 *    Ferret "Find new servers" stayed white. Ferret's own page is added to
 *    the list of pages allowed to embed it, only when Ferret's window is the
 *    one embedding it.
 */
const PROXY = "https://proxy.stoatusercontent.com/*";
const DISCOVER = "https://stt.gg/*";

function allowFerretToEmbed(values: string[]) {
  return values.map((value) =>
    /frame-ancestors/i.test(value)
      ? value.replace(
          /frame-ancestors([^;]*)/i,
          (_, sources: string) => `frame-ancestors${sources} ${WEB_ORIGIN}`,
        )
      : value,
  );
}

export function initImageCors() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: [PROXY, DISCOVER] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };

      if (new URL(details.url).hostname === "stt.gg") {
        const embeddedInFerret =
          details.resourceType === "subFrame" &&
          isAppUrl(details.frame?.parent?.url ?? details.referrer);
        if (embeddedInFerret) {
          for (const key of Object.keys(headers))
            if (key.toLowerCase() === "content-security-policy")
              headers[key] = allowFerretToEmbed(headers[key]);
        }
        return callback({ responseHeaders: headers });
      }

      const has = Object.keys(headers).some(
        (key) => key.toLowerCase() === "access-control-allow-origin",
      );
      if (!has) headers["Access-Control-Allow-Origin"] = ["*"];
      callback({ responseHeaders: headers });
    },
  );
}
