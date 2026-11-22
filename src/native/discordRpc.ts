import { Client } from "discord-rpc";

import { FERRET } from "../ferret/constants";

// Ferret mod

import { config } from "./config";

// internal state
let rpc: Client;

export async function initDiscordRpc() {
  if (!config.discordRpc) return;

  // clean up existing client if one exists
  rpc?.removeAllListeners();

  try {
    rpc = new Client({ transport: "ipc" });

    // Ferret mod: Ferret branding once Ferret has its own Discord app
    rpc.on("ready", () =>
      rpc.setActivity(
        FERRET.discordAppId
          ? {
              state: "on Stoat",
              details: "Chatting with friends",
              largeImageKey: "ferret",
              largeImageText: "Ferret, an unofficial Stoat app",
              buttons: [
                { label: "Get Ferret", url: FERRET.website },
                { label: "Join Stoat", url: "https://stoat.chat/" },
              ],
            }
          : {
              state: "stoat.chat",
              details: "Chatting with others",
              largeImageKey: "qr",
              largeImageText: "Join Stoat!",
              buttons: [
                {
                  label: "Join Stoat",
                  url: "https://stoat.chat/",
                },
              ],
            },
      ),
    );

    rpc.on("disconnected", reconnect);

    rpc.login({ clientId: FERRET.discordAppId || "872068124005007420" }); // Ferret mod
  } catch (err) {
    reconnect();
  }
}

const reconnect = () => setTimeout(() => initDiscordRpc(), 1e4);

export async function destroyDiscordRpc() {
  rpc?.destroy();
}
