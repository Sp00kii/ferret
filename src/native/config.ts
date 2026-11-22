import { type JSONSchema } from "json-schema-typed";

import { ipcMain } from "electron";
import Store from "electron-store";

// Ferret mod: dev runs use their own data folder; must run before the store
import "../ferret/devData";

import { destroyDiscordRpc, initDiscordRpc } from "./discordRpc";
import { mainWindow } from "./window";

import { isFromApp } from "../ferret/trust"; // Ferret mod

const schema = {
  firstLaunch: {
    type: "boolean",
  } as JSONSchema.Boolean,
  customFrame: {
    type: "boolean",
  } as JSONSchema.Boolean,
  minimiseToTray: {
    type: "boolean",
  } as JSONSchema.Boolean,
  startMinimisedToTray: {
    type: "boolean",
  } as JSONSchema.Boolean,
  spellchecker: {
    type: "boolean",
  } as JSONSchema.Boolean,
  hardwareAcceleration: {
    type: "boolean",
  } as JSONSchema.Boolean,
  discordRpc: {
    type: "boolean",
  } as JSONSchema.Boolean,
  windowState: {
    type: "object",
    properties: {
      x: {
        type: "number",
      } as JSONSchema.Number,
      y: {
        type: "number",
      } as JSONSchema.Number,
      width: {
        type: "number",
      } as JSONSchema.Number,
      height: {
        type: "number",
      } as JSONSchema.Number,
      isMaximised: {
        type: "boolean",
      } as JSONSchema.Boolean,
    },
  } as JSONSchema.Object,
};

const store = new Store({
  schema,
  defaults: {
    firstLaunch: true,
    customFrame: true,
    minimiseToTray: true,
    startMinimisedToTray: false,
    spellchecker: true,
    hardwareAcceleration: true,
    discordRpc: false, // Ferret mod: off by default, toggle kept in settings
    windowState: {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      isMaximised: false,
    },
  } as DesktopConfig,
});

/**
 * Shim for `electron-store` because typings are broken
 */
class Config {
  sync() {
    mainWindow.webContents.send("config", {
      firstLaunch: this.firstLaunch,
      customFrame: this.customFrame,
      minimiseToTray: this.minimiseToTray,
      startMinimisedToTray: this.startMinimisedToTray,
      spellchecker: this.spellchecker,
      hardwareAcceleration: this.hardwareAcceleration,
      discordRpc: this.discordRpc,
      windowState: this.windowState,
    });
  }

  get firstLaunch() {
    return (store as never as { get(k: string): boolean }).get("firstLaunch");
  }

  set firstLaunch(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "firstLaunch",
      value,
    );

    this.sync();
  }

  get customFrame() {
    return (store as never as { get(k: string): boolean }).get("customFrame");
  }

  set customFrame(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "customFrame",
      value,
    );

    this.sync();
  }

  get minimiseToTray() {
    return (store as never as { get(k: string): boolean }).get(
      "minimiseToTray",
    );
  }

  set minimiseToTray(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "minimiseToTray",
      value,
    );

    this.sync();
  }

  get startMinimisedToTray() {
    return (store as never as { get(k: string): boolean }).get(
      "startMinimisedToTray",
    );
  }

  set startMinimisedToTray(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "startMinimisedToTray",
      value,
    );

    this.sync();
  }

  get spellchecker() {
    return (store as never as { get(k: string): boolean }).get("spellchecker");
  }

  set spellchecker(value: boolean) {
    mainWindow.webContents.session.setSpellCheckerEnabled(value);

    (store as never as { set(k: string, value: boolean): void }).set(
      "spellchecker",
      value,
    );

    this.sync();
  }

  get hardwareAcceleration() {
    return (store as never as { get(k: string): boolean }).get(
      "hardwareAcceleration",
    );
  }

  set hardwareAcceleration(value: boolean) {
    (store as never as { set(k: string, value: boolean): void }).set(
      "hardwareAcceleration",
      value,
    );

    this.sync();
  }

  get discordRpc() {
    return (store as never as { get(k: string): boolean }).get("discordRpc");
  }

  set discordRpc(value: boolean) {
    if (value) {
      initDiscordRpc();
    } else {
      destroyDiscordRpc();
    }

    (store as never as { set(k: string, value: boolean): void }).set(
      "discordRpc",
      value,
    );

    this.sync();
  }

  get windowState() {
    return (
      store as never as { get(k: string): DesktopConfig["windowState"] }
    ).get("windowState");
  }

  set windowState(value: DesktopConfig["windowState"]) {
    (
      store as never as {
        set(k: string, value: DesktopConfig["windowState"]): void;
      }
    ).set("windowState", value);

    this.sync();
  }
}

export const config = new Config();

// Ferret mod: only the app page may change these, and only the on/off
// settings the settings page shows (any other key used to be written onto
// the config object as-is, e.g. replacing its methods)
const PAGE_SETTINGS = [
  "minimiseToTray",
  "startMinimisedToTray",
  "customFrame",
  "discordRpc",
  "spellchecker",
  "hardwareAcceleration",
] as const;

ipcMain.on("config", (event, newConfig: Partial<DesktopConfig>) => {
  if (!isFromApp(event) || !newConfig || typeof newConfig !== "object") return;
  console.info("Received new configuration", newConfig);
  for (const key of PAGE_SETTINGS) {
    const value = newConfig[key];
    if (typeof value === "boolean") config[key] = value;
  }
});
