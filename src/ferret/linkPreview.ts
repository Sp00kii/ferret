import { lookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

import { app, ipcMain } from "electron";

import { getSettings } from "./settings";
import { isFromApp } from "./trust";

/**
 * Link previews for links Stoat's server didn't preview (some sites block
 * its preview fetcher). Ferret reads the page's title, description and
 * picture itself, like opening the link would.
 *
 * Safety: only web pages on the public internet (never this PC or the home
 * network, checked again for every redirect and at connect time), no
 * cookies, small size and time limits, and only text comes back.
 */

export type LinkPreview = {
  url: string;
  siteName: string;
  title?: string;
  description?: string;
  /** https picture, or undefined */
  image?: string;
  /** Show the picture large (below) instead of small (beside) */
  largeImage: boolean;
  /** "#rrggbb" from the page's theme colour */
  colour?: string;
};

const TIMEOUT_MS = 6000;
const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 4;
const MAX_CACHE = 300;
const MAX_PARALLEL = 4;

// ------------------------------------------------------------ address check

function ipv4Private(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multicast and reserved
  );
}

/** Whether an address is on this PC, the local network or otherwise not public */
export function isPrivateAddress(ip: string) {
  if (isIP(ip) === 4) return ipv4Private(ip);
  const lower = ip.toLowerCase();
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") ||
    lower.startsWith("fd") || // unique local
    /^fe[89ab]/.test(lower) || // link-local
    lower.startsWith("ff") // multicast
  );
}

/** DNS lookup that refuses private addresses, used at connect time */
const safeLookup: typeof lookup = ((
  hostname: string,
  options: object,
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | { address: string; family: number }[],
    family?: number,
  ) => void,
) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "");
    const list = addresses as { address: string; family: number }[];
    if (!list.length || list.some((entry) => isPrivateAddress(entry.address)))
      return callback(
        Object.assign(new Error("Not a public address"), { code: "EPRIVATE" }),
        "",
      );
    if ((options as { all?: boolean }).all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}) as typeof lookup;

// ------------------------------------------------------------ fetching

function parseUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (isIP(host) && isPrivateAddress(host)) return null;
    if (host === "localhost" || host.endsWith(".localhost")) return null;
    return url;
  } catch {
    return null;
  }
}

/** GET a page's HTML (only the start), following a few redirects */
function fetchHtml(
  start: URL,
): Promise<{ url: URL; html: string } | undefined> {
  return new Promise((resolve) => {
    const deadline = setTimeout(() => finish(undefined), TIMEOUT_MS);
    let done = false;
    let current: http.ClientRequest | undefined;
    const finish = (result: { url: URL; html: string } | undefined) => {
      if (done) return;
      done = true;
      clearTimeout(deadline);
      current?.destroy();
      resolve(result);
    };

    const get = (url: URL, redirects: number) => {
      const client = url.protocol === "https:" ? https : http;
      current = client.get(
        url,
        {
          lookup: safeLookup,
          headers: {
            "user-agent": app.userAgentFallback,
            accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
            "accept-language": app.getLocale() || "en",
            "accept-encoding": "identity",
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;
          if (status >= 300 && status < 400 && location) {
            response.resume();
            const next = parseUrl(new URL(location, url).toString());
            if (!next || redirects >= MAX_REDIRECTS) return finish(undefined);
            return get(next, redirects + 1);
          }
          const type = String(response.headers["content-type"] ?? "");
          if (status !== 200 || !/text\/html|xhtml/i.test(type)) {
            response.resume();
            return finish(undefined);
          }
          const charset = type.match(/charset=([\w-]+)/i)?.[1] ?? "utf-8";
          const chunks: Buffer[] = [];
          let size = 0;
          const complete = () => {
            let decoder: TextDecoder;
            try {
              decoder = new TextDecoder(charset);
            } catch {
              decoder = new TextDecoder("utf-8");
            }
            finish({ url, html: decoder.decode(Buffer.concat(chunks)) });
          };
          response.on("data", (chunk: Buffer) => {
            chunks.push(chunk);
            size += chunk.length;
            // everything needed is in <head>
            if (size >= MAX_BYTES || /<\/head>/i.test(chunk.toString("latin1")))
              complete();
          });
          response.on("end", complete);
          response.on("error", () => finish(undefined));
        },
      );
      current.on("error", () => finish(undefined));
    };

    get(start, 0);
  });
}

// ------------------------------------------------------------ parsing

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const value =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(value) && value > 0 && value < 0x110000
        ? String.fromCodePoint(value)
        : "";
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const clean = (text: string | undefined, max: number) => {
  if (!text) return undefined;
  const value = decodeEntities(text).replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

function parse(page: { url: URL; html: string }): LinkPreview | undefined {
  const head = page.html.split(/<\/head>/i)[0];
  const meta = new Map<string, string>();
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = new Map<string, string>();
    for (const [, name, , value] of tag.matchAll(
      /([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g,
    ))
      attrs.set(name.toLowerCase(), value);
    const key = (attrs.get("property") ?? attrs.get("name"))?.toLowerCase();
    const content = attrs.get("content");
    if (key && content !== undefined && !meta.has(key)) meta.set(key, content);
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];

  const title = clean(
    meta.get("og:title") ?? meta.get("twitter:title") ?? titleTag,
    256,
  );
  const description = clean(
    meta.get("og:description") ??
      meta.get("twitter:description") ??
      meta.get("description"),
    350,
  );
  if (!title && !description) return undefined;

  let image: string | undefined;
  const rawImage =
    meta.get("og:image:secure_url") ??
    meta.get("og:image") ??
    meta.get("twitter:image") ??
    meta.get("twitter:image:src");
  if (rawImage) {
    try {
      const resolved = new URL(decodeEntities(rawImage.trim()), page.url);
      if (resolved.protocol === "http:") resolved.protocol = "https:";
      if (resolved.protocol === "https:" && resolved.href.length <= 2048)
        image = resolved.href;
    } catch {
      // no picture
    }
  }

  const width = Number(meta.get("og:image:width"));
  const colour = meta.get("theme-color")?.trim();

  return {
    url: page.url.href,
    siteName:
      clean(meta.get("og:site_name"), 64) ??
      page.url.hostname.replace(/^www\./, ""),
    title,
    description,
    image,
    largeImage:
      meta.get("twitter:card") === "summary_large_image" || width >= 400,
    colour: colour && /^#[\da-f]{6}$/i.test(colour) ? colour : undefined,
  };
}

// ------------------------------------------------------------ cache + queue

const cache = new Map<string, Promise<LinkPreview | null>>();
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(work: () => Promise<T>) {
  if (running >= MAX_PARALLEL)
    await new Promise<void>((resolve) => waiting.push(resolve));
  running++;
  try {
    return await work();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

export function linkPreview(raw: unknown): Promise<LinkPreview | null> {
  if (typeof raw !== "string" || raw.length > 2048)
    return Promise.resolve(null);
  const url = parseUrl(raw);
  if (!url) return Promise.resolve(null);
  url.hash = "";
  const key = url.href;

  let result = cache.get(key);
  if (!result) {
    result = slot(() => fetchHtml(url)).then(
      (page) => (page && parse(page)) ?? null,
      () => null,
    );
    cache.set(key, result);
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
  }
  return result;
}

export function initLinkPreviews() {
  ipcMain.handle("ferret:linkPreview", (event, url: unknown) =>
    isFromApp(event) && getSettings().linkPreviews ? linkPreview(url) : null,
  );
}
