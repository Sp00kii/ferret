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
  unofficialNotice:
    "Unofficial mod of Stoat, not affiliated with or endorsed by Stoat / Revolt Platforms Ltd.",
} as const;

export const WEB_ORIGIN = `${FERRET.webScheme}://${FERRET.webHost}`;
export const WEB_URL = `${WEB_ORIGIN}/`;
