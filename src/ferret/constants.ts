export const FERRET = {
  productName: "Ferret",
  /** Windows AppUserModelID used in development; installed builds use Squirrel's ID */
  devAppUserModelId: "com.sp00kii.ferret",
  /** Squirrel's shortcut AUMID is com.squirrel.<nupkg id>.<exe name>; the id is lowercased */
  squirrelAppUserModelId: "com.squirrel.ferret.ferret",
  /** ferret:// deep links (the official app keeps stoat://) */
  deepLinkScheme: "ferret",
  /** Scheme the bundled web client is served from */
  webScheme: "ferret-app",
  webHost: "app",
  repo: "Sp00kii/ferret",
  website: "https://sp00kii.github.io/ferret/",
  /**
   * Discord "Rich Presence" app for the Discord status. Paste the
   * Application ID from discord.com/developers/applications here (and
   * upload assets/desktop/icon.png there as an art asset named "ferret").
   * Empty = keep using Stoat's own Discord app.
   */
  discordAppId: "",
  unofficialNotice:
    "Unofficial mod of Stoat, not affiliated with or endorsed by Stoat / Revolt Platforms Ltd.",
} as const;

export const WEB_ORIGIN = `${FERRET.webScheme}://${FERRET.webHost}`;
export const WEB_URL = `${WEB_ORIGIN}/`;
