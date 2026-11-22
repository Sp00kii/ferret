import { session } from "electron";

/**
 * Stoat's image proxy (for pictures from other websites) doesn't send a
 * CORS header, unlike Stoat's own file server. Without it the page can't
 * read the first frame of a GIF to show it still ("Pause GIFs until
 * hovered"). Only this one host is touched, and only to allow reading the
 * pixels; nothing is sent anywhere.
 */
const PROXY = "https://proxy.stoatusercontent.com/*";

export function initImageCors() {
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: [PROXY] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      const has = Object.keys(headers).some(
        (key) => key.toLowerCase() === "access-control-allow-origin",
      );
      if (!has) headers["Access-Control-Allow-Origin"] = ["*"];
      callback({ responseHeaders: headers });
    },
  );
}
