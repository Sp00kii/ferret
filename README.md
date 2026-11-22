<div align="center">

<img src="assets/desktop/icon.png" width="96" alt="Ferret icon" />

# Ferret

**A modded Stoat desktop app for Windows.**
Same accounts, same servers, same people: it talks to the official Stoat servers exactly like the normal app.

> **Unofficial mod of Stoat, not affiliated with or endorsed by Stoat / Revolt Platforms Ltd.**

[**⬇ Download the latest release**](https://github.com/Sp00kii/ferret/releases/latest)

</div>

## What Ferret adds

- **Live presence that stays live.** Online / idle / offline status updates in real time, and everything resyncs right after your PC wakes from sleep, gets unlocked, or your network drops and comes back. (Fixes the cases where the official client got stuck "offline" until you pressed F5.)
- **Incoming call ringtone.** Pick from original Ferret ringtones (or your own file): a looping ringtone plus a Windows notification when someone starts a call in a DM or group, or in a server voice channel you chose to watch. Stops when you join, decline, or the call ends, and gives up after 30 seconds. Clicking the notification opens that call.
- **More reliable voice.**
  - Remembers your mic and speakers, and follows your headset when you unplug and replug it.
  - Automatically rejoins a call after a connection drop, with a visible "Reconnecting" state.
  - A small ping / packet-loss indicator while you're in a call.
  - Noise suppression and echo cancellation toggles, plus a mic test with a live level meter.
- **Discord Rich Presence is off by default** (the toggle is still in Settings → Desktop).
- **One "Ferret" page in Settings** for all of the above, plus an update checker.

Ferret installs **next to** the official Stoat app: separate install folder, data folder and app ID, so you can keep both. You'll log in once in Ferret, as it keeps its own session.

## Installing

1. Download `Ferret-<version>.Setup.exe` from the [latest release](https://github.com/Sp00kii/ferret/releases/latest) and run it.
2. **Windows SmartScreen will warn you** because the installer isn't code-signed (signing certificates cost money). Click **More info → Run anyway**.
3. Ferret installs to `%LocalAppData%\ferret` (settings live in `%AppData%\Ferret`) and starts automatically. It checks GitHub for new versions on startup and asks before updating.

## Building from source

You need [Git](https://git-scm.com/), [Node.js 24+](https://nodejs.org/) and pnpm 11 (`npm install -g pnpm@11`).

```bash
# clone with the web client + SDK submodules
git clone --recursive https://github.com/Sp00kii/ferret
cd ferret

# install the desktop app's dependencies
pnpm install

# build the modded web client into build/web (first time ~5 min)
pnpm web:build

# run Ferret in development mode
pnpm start

# build a Windows installer into out/make/squirrel.windows/x64
pnpm make
```

After changing web client code, `pnpm web:build:fast` rebuilds without reinstalling packages.

### How the repos fit together

| Repo | What it is |
| --- | --- |
| [`Sp00kii/ferret`](https://github.com/Sp00kii/ferret) | This repo: the Electron desktop app (fork of [stoatchat/for-desktop](https://github.com/stoatchat/for-desktop)) |
| [`Sp00kii/ferret-web`](https://github.com/Sp00kii/ferret-web) | The web client, as the `web/` submodule (fork of [stoatchat/for-web](https://github.com/stoatchat/for-web)) |
| [`Sp00kii/ferret-sdk`](https://github.com/Sp00kii/ferret-sdk) | The JS SDK, as `web/packages/stoat.js` (fork of [stoatchat/javascript-client-sdk](https://github.com/stoatchat/javascript-client-sdk)) |

The official desktop app loads `https://stoat.chat/app`. Ferret instead bundles its own build of the web client and serves it from `ferret-app://app`, while still talking to `api.stoat.chat`.

- [CHANGES.md](CHANGES.md) lists everything Ferret modifies.
- [UPSTREAM.md](UPSTREAM.md) explains how to pull in new Stoat updates.

### Publishing a new version

```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions builds the installer and attaches it to a new release; installed copies pick it up on their next start.

## License

Ferret is licensed under the [GNU AGPL-3.0](LICENSE), like the Stoat projects it is based on. Original work © Revolt Platforms Ltd and the Stoat contributors; Ferret's modifications © Sp00kii.

*Unofficial mod of Stoat, not affiliated with or endorsed by Stoat / Revolt Platforms Ltd.* Ferret uses no Stoat logos or brand assets; the icon is a placeholder.
