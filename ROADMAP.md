# Ferret roadmap

What's planned, parked and possible. Nothing here is promised.

## Later

| Idea | Notes |
| --- | --- |
| Supporter perks on Ko-fi | Small thank-yous for supporters; features friends rely on stay free. |
| Signed Windows installer | Removes the Windows "unrecognised app" warning (stoatchat/for-desktop#150). |
| Ferret community server | A place on Stoat for help, feedback and news. |

## Already done from Stoat's issue tracker

Reconnects after sleep / network drops (for-desktop#63), working desktop
notifications (for-desktop#85), voice users who joined later being silent
(for-web#1743), the second taskbar icon (for-desktop#159), update prompt
(for-desktop#180), the Electron default icon (for-desktop#210, #34), hotkeys
(for-desktop#50), taskbar badges (for-desktop#213), quick switcher
(for-desktop#61), zoom (for-web#273), GIF / emoji autoplay toggle
(for-web#664), favourite GIFs (stoatchat#555), noise gate (for-web#1011),
high contrast theme (for-web#588, #64), no new desktop shortcut on every update
(for-desktop#244), middle-clicked message links opening inside the app
(for-desktop#223), private nicknames for friends (stoatchat discussion #620),
previews for links Stoat can't preview, personas (masquerade) for role-play
(for-web#244), an accessibility section with readable fonts, link underlines and
reduced motion (for-web#220, #64), and Ferret in your Discord status.

## What Stoat users ask for, to decide on

Collected 2026-11-22 from Stoat's GitHub issues (sorted by upvotes, the
number after +), [AlternativeTo reviews](https://alternativeto.net/software/revolt-chat/about/),
the [Privacy Guides forum](https://discuss.privacyguides.net/t/revolt-is-now-stoat/32176)
and [Engadget](https://www.engadget.com/2193599/open-source-discord-alternatives-what-stoat-and-element-actually-fix/).

### Ferret could do these (app-side, works with official Stoat)

| Idea | Asked for in | Effort | Thoughts |
| --- | --- | --- | --- |
| Friend links: share a link that opens "Add friend" for you | stoatchat#522 (+4) | Small | A `ferret://` link that fills in the username and asks before sending a friend request. |
| Tab picks the emoji suggestion (not Enter) | for-web#628 | Small | Behaviour toggle in the composer. |
| Collapsible reply threads | for-web#1314 | Medium | Client-side only. |
| Pop out a screen share or camera into its own window | for-desktop#260 | Medium | Fits next to the compact call window. |
| Hearing your own voice when sharing your screen with audio | for-desktop#336 | Medium | Bug; would need testing with a real share. |
| Spellchecker on/off and language | for-desktop#69 | Small | Electron setting. |
| Custom Stoat servers (self-hosted instances) on the login screen | for-desktop#96 (+9), for-android#12 (+41) | Medium | Safe as long as the official server stays the default. |
| Copy a message including "Replying to …" | for-web#172 | Small | |
| Drag an image onto the avatar / banner upload | for-web#150 | Small | |
| Time converter: `<t:…>` style times shown in your own time zone | for-web#1120 | Small | |
| Round or square avatars choice | for-web#377 | Small | Theme option. |
| Theme editor (pick any colour) | for-web#976 | Medium | Builds on Ferret's theme system. |
| Choose where Ferret installs, clean uninstall | for-desktop#40, #51 | Hard | Limited by the Squirrel installer; would mean switching to another installer. |
| Flatpak / Flathub build for Linux | for-desktop#11 (+15), #77 | Medium | Forge already has a Flatpak maker; Flathub review is the slow part. |
| macOS build | for-desktop#17, #107 | Hard | Needs a Mac to test and Apple signing (€99 a year) to avoid "app is damaged". |

### Newer requests (checked 2026-11-22)

| Idea | Asked for in | Thoughts |
| --- | --- | --- |
| Choose what audio a screen share sends, and stop your own voice / the call echoing in it | for-desktop#247 (13 comments), #335, #261, for-web#1517 | The most discussed desktop problem right now. Fits Ferret well. |
| Stop Windows turning the app's volume down during calls | for-web#1358 | Not Windows' communications setting (ruled out in the report); the cause is still unknown and needs someone who can reproduce it. |
| Voice stuck on "connecting" on some networks (IPv6) | for-desktop#346 | Worth testing; may need a fallback. |
| App freezes until restarted on Windows | for-web#1662 | Needs reports from Ferret users; the diagnostics panel helps here. |
| Builds for Windows on ARM | for-desktop#230 | Possible with an extra build step. |

### Known Stoat bugs worth checking in Ferret

| Bug | Issue |
| --- | --- |
| Bot messages only show after a refresh | for-web#814 (+2) — may already be fixed by Ferret's resync / SDK fixes |
| Friend requests and profile changes need a restart | for-desktop#134 — likely fixed by the `Ready` refresh in ferret-sdk |
| Emoji / GIF picker opens under the call window | for-web#889 |
| Emoji autocomplete picks the wrong emoji | for-web#1526 |
| Dragging files to upload flickers | for-desktop#218 |
| Mic not picked up with some audio setups (motherboard mic + DAC) | for-web#1573 — Ferret's device follower may help; needs a tester |

### Needs Stoat's servers (Ferret can't add these on its own)

| Idea | Asked for in |
| --- | --- |
| Only friends can DM me | stoatchat#48 (+11) |
| Forum channels | stoatchat#429 (+10) |
| Spoiler embeds | stoatchat#124 (+10) |
| Polls | stoatchat#190 (+7) |
| Category / per-user permissions | stoatchat#541, #161, #540 |
| Search by user, mentions, attachments | stoatchat#131 (+4) |
| Temporary bans | stoatchat#158 |
| End-to-end encryption | stoatchat#1009; the most repeated wish in reviews |

### What reviewers say overall

- The biggest worry is that Stoat still feels **buggy and unfinished** (AlternativeTo, Privacy Guides). Ferret's reliability fixes (reconnects, presence, voice rejoin) speak directly to this and are worth putting first on the website.
- **No end-to-end encryption** comes up most among privacy-minded users. Ferret can't fix that.
- People like that Stoat is **free, familiar if you know Discord, and has no paywalled features**.
- The **mobile apps** get the most criticism, but that's outside what Ferret does.
