# What Ferret changes

Ferret is a mod of three Stoat projects. New code lives in separate, clearly
named folders; every edit to an upstream file is marked with a `// Ferret mod`
comment (`<!-- Ferret mod -->` in HTML, `{/* Ferret mod */}` in JSX).

## Desktop app: `Sp00kii/ferret` (fork of stoatchat/for-desktop)

**New files**

| File | Purpose |
| --- | --- |
| `src/ferret/constants.ts` | Names, IDs, schemes and the unofficial notice |
| `src/ferret/webApp.ts` | Serves the bundled web client from `ferret-app://app` (SPA routing, custom ringtone / sound / soundboard files) |
| `src/ferret/settings.ts` | Ferret settings store (`ferret-settings.json`): ringtone choice (Dook Ring by default; removed presets fall back to it), custom ringtone file, Ferret style switch + theme + accent colour, notification pop-ups switch, per-sound choices + custom sound files, voice settings (push-to-talk, noise gate, shortcuts, soundboard volume, compact call window), per-person ringtone / message sound (custom files in `people/`), your own soundboard clips (copied to `%AppData%\Ferret\soundboard`, up to 24) |
| `src/ferret/devData.ts` | `pnpm start` uses its own `%AppData%\Ferret Dev` folder so a dev run never closes or changes the installed Ferret |
| `src/ferret/incomingCall.ts` | Windows notification + taskbar flash for incoming calls; click opens the call |
| `src/ferret/resync.ts` | Tells the page to resync on wake from sleep / screen unlock |
| `src/ferret/updater.ts` | Checks GitHub Releases on startup, offers the update, installs via update.electronjs.org |
| `src/ferret/trust.ts` | Only the Ferret page may use Ferret's IPC; URL check for custom schemes |
| `src/ferret/hotkeys.ts` | Push-to-talk (global input hook via `uiohook-napi`, only running while push-to-talk is on; it only reacts to the one bound key/button) and global mute / deafen shortcuts |
| `src/ferret/diagnostics.ts` | App facts for the diagnostics panel (versions, OS, uptime; no paths or account info) |
| `src/ferret/toasts.ts`, `src/ferret/toastPage.ts` | Ferret notification pop-ups in the corner with Reply / Open (can be switched back to Windows notifications) |
| `src/ferret/miniCall.ts`, `src/ferret/miniPage.ts` | Compact always-on-top call window shown while in a call and Ferret isn't focused (can be turned off, or closed per call) |
| `src/ferret/index.ts` | Wires the above into the main process |
| `src/world/ferret.ts` | Preload bridge exposing `window.ferret` to the page |
| `scripts/build-web.mjs` | Builds the web client into `build/web` |
| `assets/desktop/*` | Ferret mascot icons (replaces the Stoat brand-asset submodule) |
| `.github/workflows/ferret-release.yml` | Builds + publishes the Windows installer for `v*` tags (after the type check passes) |
| `.github/workflows/ferret-checks.yml`, `scripts/check-types.mjs` | Type check on every push (`pnpm check`); a failing check blocks releases |
| `README.md`, `CHANGES.md`, `UPSTREAM.md` | Docs |

**Edited upstream files**

| File | Change |
| --- | --- |
| `src/main.ts` | Register/serve the bundled web client; Ferret updater instead of `update-electron-app`; own AppUserModelID; navigation guard compares protocol + host (`origin` is `"null"` for custom schemes); dev runs don't claim `ferret://` links; **quit fix:** re-quit on a fresh task (on Windows the second `app.quit()` was ignored, leaving the app running without a window, which also broke "Restart now" for updates) |
| `src/native/window.ts` | Load `ferret-app://app/` instead of `https://stoat.chat/app` (`--force-server` still works); `backgroundThrottling: false` so timers keep running in the tray; `quitApp` copes with an already-closed window; audio autoplay allowed (late joiners were silent, stoatchat/for-web#1743) |
| `src/native/config.ts` | Discord RPC defaults to off |
| `src/native/deepLink.ts` | `ferret://` links instead of `stoat://` |
| `src/native/autoLaunch.ts` | Ferret name |
| `src/native/tray.ts` | Ferret name; never touches a destroyed window (was "Object has been destroyed" on Quit) |
| `src/preload.ts` | Loads the Ferret bridge |
| `forge.config.ts` | Ferret name/executable/installer, icon URL, bundles `build/web`, fails early if it's missing, publisher repo; copies the `uiohook-napi` Windows prebuild into the package |
| `vite.main.config.ts` | `uiohook-napi` stays external (native module) |
| `pnpm-workspace.yaml` | `uiohook-napi` ships prebuilt binaries, no install script needed |
| `package.json` | Name, product name (→ separate `%AppData%\Ferret` data folder), version, repo, web build scripts; removed `update-electron-app`; added `uiohook-napi` |
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
| `ringtones.ts` + `public/ferret/ringtones/` | Built-in ringtone choices: Ferret originals (Dook Ring by default, Arcade, Marimba Bounce, Retro Phone, Synthwave, Ferret Chime) |
| `IncomingCalls.tsx` | Detects calls starting, loops the ringtone, shows the call card and the Windows notification |
| `FerretSettings.tsx` | The "Ferret" settings page |
| `voice/devices.ts` | Follows the preferred mic/output across unplug and replug |
| `voice/ConnectionQuality.tsx` | Ping / packet-loss badge in the call card |
| `voice/MicTest.tsx` | Mic test with live level meter |
| `voice/micChain.ts` | Extra mic stage: push-to-talk + noise gate (with level meter) and the soundboard mix-in |
| `voice/FerretVoice.tsx` | Connects push-to-talk, global shortcuts and the compact call window to the call |
| `voice/soundboard.ts`, `voice/SoundboardButton.tsx`, `sounds/board/*.ogg` | Soundboard in the call controls with Ferret-synthesised clips (rimshot, air horn, sad trombone, ta-da, …) plus your own uploaded sounds (first 15 s play), 2.5 s cooldown |
| `voice/VoiceExtrasSettings.tsx` | Settings for the above |
| `diagnostics/*` | Hidden diagnostics panel (tap the logo on the Ferret settings page 5 times): connection log, websocket event types, "Copy logs". Never records message content, names or ids |
| `notifications/toasts.tsx` | Sends new-message notifications to the pop-ups; sends replies typed there as a normal reply |
| `people.ts`, `PeopleSounds.tsx` | Per-person ringtone and message sound, set from the Ferret settings page or a user's right-click menu |
| `gifs/FavouriteStar.tsx`, `gifs/categories.ts` | Favourite star on every GIF in the picker; hides Gifbox categories named after random GIF ids ("OcIOBa") and adds real ones |
| `presence.ts` | Re-checks who is online when a server's member list is opened or the window regains focus (throttled to once per 30s per server) |
| `theme/looks.ts`, `theme/ferretTheme.ts`, `theme/ferret-style.css`, `theme/LookPicker.tsx` | The Ferret style: Midnight (navy), Cream (light) and High contrast themes, five accent colours (copper, blue, purple, pink, green) and tighter corners from the Ferret design system, applied only while the "Ferret style" switch is on. The call window and pop-ups follow the same colours |
| `Branding.tsx`, `assets/ferret-logo.png` | Ferret logo + name for the titlebar, home page and login screen |
| `soundLibrary.ts` + `sounds/library/*.ogg` | Pickable sounds for any event (Clicker, Pop, Bell, Blip, Squeak, Boop, Dook) and which file to play per event |
| `sounds.ts` + `sounds/*.ogg` | Ferret's own synthesised sound pack (message chime, mute/deafen, voice join/leave, stream, ringtones). The open-source fallback sounds are silent placeholders, plus a click for messages |

**Edited upstream files**

| File | Change |
| --- | --- |
| `components/client/Controller.ts` | **Presence fix:** reconnect when the network comes back (nothing ever left the `Offline` state before), resync on wake/visibility, cap the reconnect back-off at 30s (was unbounded); honest session name; resyncs are logged for diagnostics |
| `components/rtc/state.tsx` | Voice: show LiveKit's reconnecting state, auto-rejoin after unexpected drops, follow preferred devices |
| `components/rtc/VoiceProcessor.ts` | Routes the mic through Ferret's mic stage (desktop app only) |
| `components/ui/.../voice/callCard/VoiceCallCardActions.tsx` | Soundboard button |
| `components/ui/.../voice/callCard/VoiceCallCardStatus.tsx` | Shows the connection quality badge |
| `components/app/interface/settings/UserSettings.tsx` | "Ferret" settings page, Ferret version + unofficial notice, "Source Code" links to Ferret (AGPL) |
| `components/app/interface/settings/user/Native.tsx` | Ferret name |
| `components/client/Sounds.tsx` | Plays Ferret's sounds (or the user's per-sound / per-person choice) instead of the silent fallback sounds |
| `components/client/NotificationsWorker.tsx` | Passes the message author to the sound player (per-person message sounds); uses Ferret's pop-up when it's switched on |
| `components/app/menus/UserContextMenu.tsx` | "Ferret sounds…" entry (desktop app only) |
| `components/ui/themes/LoadTheme.tsx` | Applies the Ferret style (chosen theme + accent) on top of the stock theme; removes stale variables when switching back |
| `components/app/interface/desktop/Titlebar.tsx`, `src/interface/Home.tsx`, `components/auth/src/AuthPage.tsx` | Ferret logo instead of the placeholder wordmark |
| `components/ui/components/design/CategoryButton.tsx` | **Bug fix:** opening a long dropdown (e.g. microphone picker) scrolled the whole settings page and pushed the dropdown off screen; now only the list scrolls |
| `src/index.tsx` | Mounts the incoming call controller, the voice extras and the diagnostics recorder |
| `components/ui/.../picker/GifPicker.tsx` | Favourite star on GIFs; cleaned-up categories |
| `components/auth/src/AuthPage.tsx`, `AppUpsell.tsx` | Login panel colours can follow the Ferret style (navy + copper) |
| `src/interface/channels/text/MemberSidebar.tsx` | Refreshes member presence when shown |
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
| `src/classes/Server.ts` | `refreshPresence()`: re-check who is online and update cached users in place (Stoat sometimes sends no went-offline event; member sync never updated cached users) |

Nothing here changes what is sent to the Stoat API or websocket beyond what
the official client already sends (the extra Ping uses the existing heartbeat
message).
