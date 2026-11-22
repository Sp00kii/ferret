// Type-check Ferret before anything ships.
//   pnpm check          (needs `pnpm web:build` first)
//
// Web client: full `tsc --noEmit`; it imports the SDK, LiveKit components and
// translations that `pnpm web:build` builds.
// Desktop: checked with the web client's modern TypeScript. Upstream pins
// TypeScript 4.5, which can't parse the current @types/node and then skips
// checking our code entirely. Only errors in src/ count, minus two known
// ones in untouched upstream code.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const client = path.join(root, "web", "packages", "client");
let failed = false;

/** upstream errors we don't own: `file: code` */
const KNOWN_UPSTREAM = new Set([
  "src/native/badges.ts: TS18048", // macOS-only app.dock
  "src/native/tray.ts: TS2322", // `let tray: Tray = null`
]);

const tsc = path.join(
  client,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsc.cmd" : "tsc",
);
if (!existsSync(tsc)) {
  console.error("TypeScript not found - run `pnpm web:build` first.");
  process.exit(1);
}

function run(args, cwd) {
  const result = spawnSync(tsc, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return `${result.stdout}${result.stderr}`
    .split(/\r?\n/)
    .filter((line) => line.includes("error TS"));
}

console.log("=== Web client types ===");
const webErrors = run(["--noEmit", "-p", "tsconfig.json"], client);
if (webErrors.length) {
  console.log(webErrors.join("\n"));
  failed = true;
} else {
  console.log("no errors");
}

console.log("\n=== Desktop types (src/) ===");
const desktopErrors = run(
  ["--noEmit", "-p", "tsconfig.json", "--ignoreDeprecations", "6.0"],
  root,
)
  .map((line) => line.replace(/\\/g, "/"))
  .filter((line) => line.startsWith("src/"))
  .filter((line) => {
    const [, file, code] = /^(.+?)\(\d+,\d+\): error (TS\d+)/.exec(line) ?? [];
    return !KNOWN_UPSTREAM.has(`${file}: ${code}`);
  });
if (desktopErrors.length) {
  console.log(desktopErrors.join("\n"));
  failed = true;
} else {
  console.log("no errors");
}

if (failed) {
  console.error("\nType check failed - fix the errors above before releasing.");
  process.exit(1);
}
console.log("\nAll type checks passed.");
