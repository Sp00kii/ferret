import { statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { app, net, protocol } from "electron";

import { FERRET } from "./constants";
import { MINI_PAGE } from "./miniPage";
import { customRingtonePath, customSoundPath } from "./settings";

/**
 * Must run before the app is ready. `standard` + `secure` give the bundled
 * web client a normal secure origin (localStorage, fetch, service workers).
 */
export function registerWebScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: FERRET.webScheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        codeCache: true,
        allowServiceWorkers: true,
      },
    },
  ]);
}

/**
 * Where the built web client lives: copied into resources/ when packaged,
 * build/web in the repo during development (`pnpm web:build`).
 */
export function webRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "web")
    : path.join(app.getAppPath(), "build", "web");
}

function isFile(file: string) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

const notBuiltPage = (root: string) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>Ferret</title>
<body style="font-family:sans-serif;background:#191919;color:#eee;padding:2rem">
<h1>The Ferret web client isn't built yet</h1>
<p>Run <code>pnpm web:build</code> in the Ferret folder, then restart.</p>
<p style="opacity:.6">Looked in: ${root.replace(/[<>&]/g, "")}</p></body>`,
    { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
  );

/**
 * Serve the bundled web client. Unknown paths without a file extension fall
 * back to index.html so client-side routes (/channel/..., /server/...) work.
 */
export function serveWebApp() {
  const root = path.resolve(webRoot());

  protocol.handle(FERRET.webScheme, (request) => {
    const url = new URL(request.url);
    if (url.host !== FERRET.webHost) {
      return new Response("Not found", { status: 404 });
    }

    if (url.pathname === "/__ferret/mini") {
      return new Response(MINI_PAGE, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/__ferret/ringtone") {
      const file = customRingtonePath();
      return file
        ? net.fetch(pathToFileURL(file).toString())
        : new Response("No custom ringtone", { status: 404 });
    }

    if (url.pathname.startsWith("/__ferret/sound/")) {
      const file = customSoundPath(
        url.pathname.slice("/__ferret/sound/".length),
      );
      return file
        ? net.fetch(pathToFileURL(file).toString())
        : new Response("No custom sound", { status: 404 });
    }

    const index = path.join(root, "index.html");
    if (!isFile(index)) return notBuiltPage(root);

    let relative: string;
    try {
      relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    } catch {
      return new Response("Bad request", { status: 400 });
    }

    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    if (isFile(target)) {
      return net.fetch(pathToFileURL(target).toString());
    }

    return path.extname(relative)
      ? new Response("Not found", { status: 404 })
      : net.fetch(pathToFileURL(index).toString());
  });
}
