// Builds the Ferret web client (web/ submodule) and copies it to build/web,
// which the app serves in development and ships as resources/web.
//
//   node scripts/build-web.mjs                 install deps + build
//   node scripts/build-web.mjs --skip-install  build only (faster)
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const dist = path.join(web, "packages", "client", "dist");
const out = path.join(root, "build", "web");
const skipInstall = process.argv.includes("--skip-install");

if (!existsSync(path.join(web, "package.json"))) {
  console.error("web/ is empty. Run: git submodule update --init --recursive");
  process.exit(1);
}

function run(label, args, env = {}) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync("pnpm", args, {
    cwd: web,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    console.error(`\n${label} failed (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
}

if (!skipInstall)
  run("Install web dependencies", ["install", "--frozen-lockfile"]);
run("Build SDK (stoat.js)", ["--filter", "stoat.js", "build"]);
run("Build LiveKit components", [
  "--filter",
  "solid-livekit-components",
  "build",
]);
run("Compile translations", [
  "--filter",
  "client",
  "exec",
  "lingui",
  "compile",
  "--typescript",
]);
run("Link fallback assets", [
  "--filter",
  "client",
  "exec",
  "node",
  "scripts/copyAssets.mjs",
]);
run("Build web client", ["--filter", "client", "exec", "vite", "build"], {
  // plugin-legacy's polyfill detection needs more than Node's default heap
  NODE_OPTIONS:
    `${process.env.NODE_OPTIONS ?? ""} --max-old-space-size=4096`.trim(),
});

rmSync(out, { recursive: true, force: true });
cpSync(dist, out, { recursive: true, dereference: true });
console.log(`\nWeb client copied to ${path.relative(root, out)}`);
