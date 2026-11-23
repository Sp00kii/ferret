// Builds Ferret's Windows audio capture helper (native/audio-capture) into
// build/native/ferret-audio-capture.exe, which is shipped next to the app.
// Needs Visual Studio (or its Build Tools) with the C++ workload; GitHub's
// Windows runners have it. On other systems this does nothing.
//
//   node scripts/build-audio-helper.mjs              x64
//   node scripts/build-audio-helper.mjs --arch arm64 Windows on ARM (skipped,
//     not failed, when Visual Studio's ARM64 tools aren't installed)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("Audio helper is Windows-only; skipped.");
  process.exit(0);
}

const arm64 = process.argv.includes("arm64");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "native", "audio-capture", "main.cpp");
const outDir = path.join(root, "build", "native");
const out = path.join(outDir, "ferret-audio-capture.exe");

const vswhere = path.join(
  process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
  "Microsoft Visual Studio",
  "Installer",
  "vswhere.exe",
);
if (!existsSync(vswhere)) {
  console.error("Visual Studio not found (no vswhere.exe).");
  process.exit(1);
}

const found = spawnSync(
  vswhere,
  [
    "-latest",
    "-products",
    "*",
    "-requires",
    arm64
      ? "Microsoft.VisualStudio.Component.VC.Tools.ARM64"
      : "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
    "-property",
    "installationPath",
  ],
  { encoding: "utf8" },
);
const installation = found.stdout.trim().split(/\r?\n/)[0];
const vcvars = path.join(
  installation,
  "VC",
  "Auxiliary",
  "Build",
  arm64 ? "vcvarsamd64_arm64.bat" : "vcvars64.bat",
);
if (!installation || !existsSync(vcvars)) {
  if (arm64) {
    // the ARM app still works, just without "only this app" share sound
    console.log("Visual Studio's ARM64 tools not found; audio helper skipped.");
    process.exit(0);
  }
  console.error("Visual Studio's C++ tools (vcvars64.bat) not found.");
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
// compiler leftovers go to a temp folder, so only the .exe is shipped
const objDir = mkdtempSync(path.join(os.tmpdir(), "ferret-audio-"));

// cl needs the Visual Studio environment, so run it through vcvars64.bat
const command = [
  `"${vcvars}" >nul`,
  "&&",
  "cl /nologo /O2 /EHsc /std:c++17 /W4 /DUNICODE /D_UNICODE",
  `"${source}"`,
  `/Fo"${objDir}\\\\"`,
  `/Fe"${out}"`,
  "/link ole32.lib mmdevapi.lib user32.lib /SUBSYSTEM:CONSOLE",
].join(" ");

const result = spawnSync("cmd.exe", ["/d", "/s", "/c", `"${command}"`], {
  stdio: "inherit",
  windowsVerbatimArguments: true,
});
rmSync(objDir, { recursive: true, force: true });
if (result.status !== 0 || !existsSync(out)) {
  console.error("Building the audio helper failed.");
  process.exit(result.status || 1);
}
console.log(`Built ${path.relative(root, out)}`);
