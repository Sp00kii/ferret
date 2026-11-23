import { Client } from "discord-rpc";

import { FERRET } from "../ferret/constants";

// Ferret mod

import { config } from "./config";

// internal state
let rpc: Client;

export async function initDiscordRpc() {
  if (!config.discordRpc) return;

  // clean up existing client if one exists
  // Ferret mod: also close its connection, so toggling doesn't stack them
  rpc?.removeAllListeners();
  rpc?.destroy().catch(() => {});

  try {
    rpc = new Client({ transport: "ipc" });

    // Ferret mod: Ferret branding once Ferret has its own Discord app; a
    // failed update is logged instead of being lost
    rpc.on("ready", () =>
      rpc
        .setActivity(
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
        )
        .then(() => console.info("[discord] status shown"))
        .catch((error: Error) =>
          console.warn("[discord] status not set:", error.message),
        ),
    );

    rpc.on("disconnected", reconnect);

    // Ferret mod: Discord not running (or restarting) rejects here; try
    // again later instead of giving up silently
    await rpc
      .login({ clientId: FERRET.discordAppId || "872068124005007420" })
      .catch((error: Error) => {
        console.warn("[discord] not connected:", error.message);
        reconnect();
      });
  } catch (err) {
    reconnect();
  }
}

const reconnect = () => setTimeout(() => initDiscordRpc(), 1e4);

export async function destroyDiscordRpc() {
  // Ferret mod: clear the status first, so turning it off removes it
  await rpc?.clearActivity().catch(() => {});
  rpc?.removeAllListeners();
  await rpc?.destroy().catch(() => {});
}
