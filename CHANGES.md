# What Ferret changes

Ferret is a mod of three Stoat projects. New code lives in separate, clearly
named folders; every edit to an upstream file is marked with a `// Ferret mod`
comment (`<!-- Ferret mod -->` in HTML, `{/* Ferret mod */}` in JSX).

## Desktop app: `Sp00kii/ferret` (fork of stoatchat/for-desktop)

**New files**

| File | Purpose |
| --- | --- |
| `src/ferret/constants.ts` | Names, IDs, schemes and the unofficial notice |
| `src/ferret/webApp.ts` | Serves the bundled web client from `ferret-app://app` (SPA routing, custom ringtone file) |
| `src/ferret/settings.ts` | Ferret settings store (`ferret-settings.json`): ringtone choice (Franklin by default), custom ringtone file, Ferret style switch |
| `src/ferret/devData.ts` | `pnpm start` uses its own `%AppData%\Ferret Dev` folder so a dev run never closes or changes the installed Ferret |
| `src/ferret/incomingCall.ts` | Windows notification + taskbar flash for incoming calls; click opens the call |
| `src/ferret/resync.ts` | Tells the page to resync on wake from sleep / screen unlock |
| `src/ferret/updater.ts` | Checks GitHub Releases on startup, offers the update, installs via update.electronjs.org |
| `src/ferret/trust.ts` | Only the Ferret page may use Ferret's IPC; URL check for custom schemes |
| `src/ferret/index.ts` | Wires the above into the main process |
| `src/world/ferret.ts` | Preload bridge exposing `window.ferret` to the page |
| `scripts/build-web.mjs` | Builds the web client into `build/web` |
| `assets/desktop/*` | Ferret mascot icons (replaces the Stoat brand-asset submodule) |
| `.github/workflows/ferret-release.yml` | Builds + publishes the Windows installer for `v*` tags |
| `README.md`, `CHANGES.md`, `UPSTREAM.md` | Docs |

**Edited upstream files**

| File | Change |
| --- | --- |
| `src/main.ts` | Register/serve the bundled web client; Ferret updater instead of `update-electron-app`; own AppUserModelID; navigation guard compares protocol + host (`origin` is `"null"` for custom schemes); dev runs don't claim `ferret://` links; **quit fix:** re-quit on a fresh task (on Windows the second `app.quit()` was ignored, leaving the app running without a window, which also broke "Restart now" for updates) |
| `src/native/window.ts` | Load `ferret-app://app/` instead of `https://stoat.chat/app` (`--force-server` still works); `backgroundThrottling: false` so timers keep running in the tray; `quitApp` copes with an already-closed window |
| `src/native/config.ts` | Discord RPC defaults to off |
| `src/native/deepLink.ts` | `ferret://` links instead of `stoat://` |
| `src/native/autoLaunch.ts` | Ferret name |
| `src/native/tray.ts` | Ferret name; never touches a destroyed window (was "Object has been destroyed" on Quit) |
| `src/preload.ts` | Loads the Ferret bridge |
| `forge.config.ts` | Ferret name/executable/installer, icon URL, bundles `build/web`, fails early if it's missing, publisher repo |
| `package.json` | Name, product name (→ separate `%AppData%\Ferret` data folder), version, repo, web build scripts; removed `update-electron-app` |
| `.gitmodules` | Removed the Stoat `assets` submodule; added `web` |
| `.gitignore` | Ignore `build/` |

Stoat's own GitHub workflows are left in place but disabled in the repo
settings, so pulling upstream changes doesn't conflict.

## Web client: `Sp00kii/ferret-web` (fork of stoatchat/for-web)

**New folder `packages/client/components/ferret/`**

| File | Purpose |
| --- | --- |
| `bridge.ts` | Types for `window.ferret` |
| `settings.ts` | Shared reactive copy of the Ferret settings |
| `ringtones.ts` + `public/ferret/ringtones/` | Built-in ringtone choices (Franklin is the default) |
| `IncomingCalls.tsx` | Detects calls starting, loops the ringtone, shows the call card and the Windows notification |
| `FerretSettings.tsx` | The "Ferret" settings page |
| `voice/devices.ts` | Follows the preferred mic/output across unplug and replug |
| `voice/ConnectionQuality.tsx` | Ping / packet-loss badge in the call card |
| `voice/MicTest.tsx` | Mic test with live level meter |
| `theme/ferretTheme.ts`, `theme/ferret-style.css` | The Ferret style: navy/copper palette and tighter corners from the Ferret design system, applied only while the "Ferret style" switch is on |
| `Branding.tsx`, `assets/ferret-logo.png` | Ferret logo + name for the titlebar, home page and login screen |
| `sounds.ts` + `sounds/*.ogg` | Ferret's own synthesised sound pack (message chime, mute/deafen, voice join/leave, stream, ringtones). The open-source fallback sounds are silent placeholders, plus a click for messages |

**Edited upstream files**

| File | Change |
| --- | --- |
| `components/client/Controller.ts` | **Presence fix:** reconnect when the network comes back (nothing ever left the `Offline` state before), resync on wake/visibility, cap the reconnect back-off at 30s (was unbounded); honest session name |
| `components/rtc/state.tsx` | Voice: show LiveKit's reconnecting state, auto-rejoin after unexpected drops, follow preferred devices |
| `components/ui/.../voice/callCard/VoiceCallCardStatus.tsx` | Shows the connection quality badge |
| `components/app/interface/settings/UserSettings.tsx` | "Ferret" settings page, Ferret version + unofficial notice, "Source Code" links to Ferret (AGPL) |
| `components/app/interface/settings/user/Native.tsx` | Ferret name |
| `components/client/Sounds.tsx` | Plays Ferret's sound pack instead of the silent fallback sounds |
| `components/ui/themes/LoadTheme.tsx` | Applies the Ferret style on top of the stock theme; removes stale variables when switching back |
| `components/app/interface/desktop/Titlebar.tsx`, `src/interface/Home.tsx`, `components/auth/src/AuthPage.tsx` | Ferret logo instead of the placeholder wordmark |
| `components/ui/components/design/CategoryButton.tsx` | **Bug fix:** opening a long dropdown (e.g. microphone picker) scrolled the whole settings page and pushed the dropdown off screen; now only the list scrolls |
| `src/index.tsx` | Mounts the incoming call controller |
| `tsconfig.json` | `@revolt/ferret` path alias |
| `index.html` | Window title "Ferret" |
| `.gitmodules` | `stoat.js` submodule points to `Sp00kii/ferret-sdk` |

## SDK: `Sp00kii/ferret-sdk` (fork of stoatchat/javascript-client-sdk)

Based on the exact SDK commit the official web client ships (`e88f6aa`).

| File | Change |
| --- | --- |
| `src/events/v1.ts` | **Presence fix:** on reconnect, refresh already-cached users from the `Ready` snapshot (previously kept stale online/status); clear voice participants before applying the snapshot (ended calls lingered); emit `voiceChannelJoin` / `voiceChannelLeave`; handle `VoiceChannelMove` |
| `src/events/EventClient.ts` | `checkAlive()`: probe a possibly half-open socket immediately instead of waiting for the next heartbeat |
| `src/Client.ts` | Event types for the voice events |

Nothing here changes what is sent to the Stoat API or websocket beyond what
the official client already sends (the extra Ping uses the existing heartbeat
message).
