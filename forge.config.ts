import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerFlatpak } from "@electron-forge/maker-flatpak";
import { MakerFlatpakOptionsConfig } from "@electron-forge/maker-flatpak/dist/Config";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { PublisherGithub } from "@electron-forge/publisher-github";
import type { ForgeConfig } from "@electron-forge/shared-types";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import fs from "node:fs";
import path from "node:path";

// import { globSync } from "node:fs";

// Ferret mod: own name, executable and installer so it sits beside Stoat
const STRINGS = {
  author: "Sp00kii",
  name: "Ferret",
  execName: "ferret",
  description:
    "Unofficial mod of Stoat, not affiliated with or endorsed by Stoat / Revolt Platforms Ltd.",
};

const ASSET_DIR = "assets/desktop";

/**
 * Build targets for the desktop app
 */
const makers: ForgeConfig["makers"] = [
  new MakerSquirrel({
    name: STRINGS.name,
    authors: STRINGS.author,
    // Ferret mod: Add/Remove Programs icon
    iconUrl: `https://raw.githubusercontent.com/Sp00kii/ferret/main/assets/desktop/icon.ico`,
    // todo: loadingGif
    setupIcon: `${ASSET_DIR}/icon.ico`,
    description: STRINGS.description,
    exe: `${STRINGS.execName}.exe`,
    setupExe: `${STRINGS.execName}-setup.exe`,
    // Ferret mod
    copyright:
      "Copyright (C) 2025 Revolt Platforms LTD; modifications (C) 2026 Sp00kii",
  }),
  new MakerZIP({}),
  // Ferret mod: .deb for Debian / Ubuntu / Mint
  new MakerDeb({
    options: {
      name: STRINGS.execName,
      productName: STRINGS.name,
      genericName: "Chat",
      description: STRINGS.description,
      productDescription: STRINGS.description,
      maintainer: STRINGS.author,
      homepage: "https://github.com/Sp00kii/ferret",
      bin: STRINGS.execName,
      icon: `${ASSET_DIR}/hicolor/512x512.png`,
      categories: ["Network", "Chat"],
      mimeType: ["x-scheme-handler/ferret"],
      section: "net",
    },
  }),
  new MakerFlatpak({
    options: {
      id: "io.github.sp00kii.Ferret", // Ferret mod
      description: STRINGS.description,
      productName: STRINGS.name,
      productDescription: STRINGS.description,
      runtimeVersion: "25.08",
      icon: {
        "16x16": `${ASSET_DIR}/hicolor/16x16.png`,
        "32x32": `${ASSET_DIR}/hicolor/32x32.png`,
        "64x64": `${ASSET_DIR}/hicolor/64x64.png`,
        "128x128": `${ASSET_DIR}/hicolor/128x128.png`,
        "256x256": `${ASSET_DIR}/hicolor/256x256.png`,
        "512x512": `${ASSET_DIR}/hicolor/512x512.png`,
      } as unknown,
      categories: ["Network"],
      // open ferret:// links
      mimeType: ["x-scheme-handler/ferret"], // Ferret mod
      modules: [
        // use the latest zypak -- Electron sandboxing for Flatpak
        {
          name: "zypak",
          sources: [
            {
              type: "git",
              url: "https://github.com/refi64/zypak",
              tag: "v2025.09",
            },
          ],
        },
      ],
      finishArgs: [
        // default arguments found by running
        // DEBUG=electron-installer-flatpak* pnpm make
        "--socket=fallback-x11",
        "--socket=wayland",
        "--share=ipc",
        "--share=network",
        "--device=dri",
        "--device=all",
        "--socket=pulseaudio",
        "--filesystem=xdg-run/pipewire-0",
        "--filesystem=xdg-videos:ro",
        "--filesystem=xdg-pictures:ro",
        "--filesystem=xdg-download",
        "--filesystem=xdg-run/speech-dispatcher",
        "--talk-name=org.freedesktop.ScreenSaver",
        "--talk-name=org.freedesktop.Notifications",
        "--talk-name=org.kde.StatusNotifierWatcher",
        "--talk-name=com.canonical.AppMenu.Registrar",
        "--talk-name=com.canonical.indicator.application",
        "--talk-name=com.canonical.Unity",
        "--env=XCURSOR_PATH=/run/host/user-share/icons:/run/host/share/icons",
      ],
      files: [],
    } as MakerFlatpakOptionsConfig,
  }),
];

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: STRINGS.name,
    executableName: STRINGS.execName,
    // open ferret:// links (on mac)
    protocols: [{ name: STRINGS.name, schemes: ["ferret"] }], // Ferret mod
    icon:
      process.platform === "darwin"
        ? `${ASSET_DIR}/icon.icon`
        : `${ASSET_DIR}/icon`,
    // Ferret mod: ship the bundled web client as resources/web
    // Ferret mod: + alternative app icons as .ico for the taskbar button
    extraResource: [
      "build/web",
      "assets/desktop/alt",
      // Ferret mod: Windows audio helper for screen share sound
      ...(process.platform === "win32" && fs.existsSync("build/native")
        ? ["build/native"]
        : []),
    ],
  },
  rebuildConfig: {},
  makers,
  hooks: {
    // Ferret mod: fail early with a clear message instead of packaging an
    // app that only shows "web client isn't built"
    prePackage: async () => {
      if (!fs.existsSync("build/web/index.html")) {
        throw new Error(
          "build/web is missing. Run `pnpm web:build` before packaging.",
        );
      }
    },
    // Copy the node-pipewire dist to the app on linux
    packageAfterCopy: async (_config, buildPath, _version, platform) => {
      if (platform === "linux") {
        // Copy only the files we need to run the code, which is dist, LICENSE, and package.json
        fs.cpSync(
          "node_modules/node-pipewire/dist",
          path.join(buildPath, "node_modules/node-pipewire/dist"),
          { recursive: true },
        );
        fs.cpSync(
          "node_modules/node-pipewire/LICENSE",
          path.join(buildPath, "node_modules/node-pipewire/LICENSE"),
          { recursive: true },
        );
        fs.cpSync(
          "node_modules/node-pipewire/package.json",
          path.join(buildPath, "node_modules/node-pipewire/package.json"),
          { recursive: true },
        );
      }

      // Ferret mod: the push-to-talk input hook is a native module, so the
      // Vite bundle can't include it. Ship only this platform's prebuild.
      if (platform === "win32" || platform === "linux") {
        const copy = (from: string, to = from) =>
          fs.cpSync(
            path.join("node_modules", from),
            path.join(buildPath, "node_modules", to),
            { recursive: true },
          );
        for (const file of ["dist", "LICENSE", "package.json"]) {
          copy(`uiohook-napi/${file}`);
        }
        copy(`uiohook-napi/prebuilds/${platform}-x64`);
        for (const file of [
          "index.js",
          "node-gyp-build.js",
          "package.json",
          "LICENSE",
        ]) {
          copy(`node-gyp-build/${file}`);
        }
      }
    },
  },
  plugins: [
    {
      name: "@electron-forge/plugin-auto-unpack-natives",
      config: {},
    },
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: "src/main.ts",
          config: "vite.main.config.ts",
          target: "main",
        },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // Ferret mod: no file:// pages are used, so they get no extra rights
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
  publishers: [
    new PublisherGithub({
      repository: {
        owner: "Sp00kii", // Ferret mod
        name: "ferret",
      },
    }),
  ],
};

export default config;
