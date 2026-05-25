# Codenames TR

A two-device PWA for playing Codenames in Turkish. Board = iPad on the table, Spymaster = iPhone held privately.

## Overview

- Single HTML file — no build step, no backend, no dependencies to install
- WebRTC peer-to-peer sync — two QR scans to pair, then fully offline during gameplay
- 4×4 and 5×5 board modes
- Word pool tracking via localStorage — no repeated words across games (~18 non-repeating games with the default 451-word Turkish list)
- Auto-detects death card, win conditions, and turn changes
- Undo support (configurable steps)
- UI language: TR / EN. Game word language: TR only for now
- PWA — installable to iPad and iPhone home screen

## Files

|File           |Purpose                              |
|---------------|-------------------------------------|
|`index.html`   |Entire application                   |
|`words.js`     |Turkish word pool (~451 unique words)|
|`sw.js`        |Service worker for offline caching   |
|`manifest.json`|PWA manifest                         |

## Hosting (HTTPS required)

iOS Safari requires HTTPS for camera access (QR scanning).

**GitHub Pages**

1. Push files to a repo
1. Settings → Pages → main branch → Save
1. Open `https://<username>.github.io/<repo>/`

**Cloudflare Pages / Netlify**

1. Go to pages.cloudflare.com or app.netlify.com
1. Drag and drop the project folder
1. Use the provided HTTPS URL

**Local with tunnel (for testing)**

```bash
python3 -m http.server 8000
npx localtunnel --port 8000   # or: ngrok http 8000
```

Plain `http://localhost:8000` works in desktop browsers but camera won’t work on iOS without HTTPS.

## Installing as a PWA

On both devices:

1. Open the URL in Safari
1. Share icon → “Add to Home Screen”
1. Launch from the home screen icon — runs fullscreen like a native app

## Starting a Game

1. **iPad** — tap “Board (iPad)”
1. **iPhone** — tap “Spymaster (iPhone)”
1. **iPad** → Pair → Generate QR → QR appears on screen
1. **iPhone** → Pair → scan iPad’s QR → answer QR is generated
1. **iPad** → Scan Answer QR → scan iPhone’s QR
1. Both show **Connected** — live sync is active

Pairing is required once per session. If either device closes the page, re-pair.

## Gameplay

|Action                                  |Result                                                 |
|----------------------------------------|-------------------------------------------------------|
|Tap a card (Board, connected)           |Requests color from Spymaster; card opens automatically|
|Long-press a card (Board, not connected)|Manual color picker                                    |
|Tap a card (Spymaster)                  |Sends reveal to Board (useful if board tap timed out)  |
|Topbar ↩ button                         |Undo last reveal — dimmed when no steps remain         |
|New Game (Board)                        |Rolls a fresh board, syncs to Spymaster                |

## Rules

**5×5 (Classic):** 9 red, 8 blue, 7 neutral, 1 death. Red starts.
**4×4 (Quick):** 6 red, 5 blue, 4 neutral, 1 death. Red starts.

- Opening your own team’s card → continue your turn
- Opening the other team’s card or a neutral → turn passes
- Opening the death card → your team loses immediately
- First team to reveal all their cards wins

## Settings

Open via the ⚙ button on the Board screen.

|Setting        |Description                                               |
|---------------|----------------------------------------------------------|
|UI Language    |TR / EN — saved to localStorage                           |
|Board Size     |5×5 or 4×4 — takes effect on next New Game                |
|Undo Steps     |Max undo history depth (0 = off, default 2)               |
|Reset Word Pool|Clears used-word history; all words become available again|

**Advanced section** (collapsed by default):

|Button       |What it does                                               |
|-------------|-----------------------------------------------------------|
|Cache Reset  |Unregisters service worker, clears all caches, reloads page|
|Debug Console|Loads Eruda on-device DevTools (requires internet for CDN) |

## URL Parameters

|Parameter|Effect                                                                  |
|---------|------------------------------------------------------------------------|
|`?reset` |Same as Cache Reset — clears SW and all caches, then reloads            |
|`?debug` |Loads Eruda DevTools on page load (useful when Settings isn’t reachable)|

## Technical Notes

**QR pairing:** WebRTC SDP is large. To fit in a QR code, we compress with `CompressionStream` (deflate-raw) + base64 (requires iOS 16.4+). Older devices fall back to raw JSON — QR may be too dense to scan, but a manual copy-paste textarea is always available as fallback.

**Connection keepalive:** Once paired, a ping is sent every 15 seconds over the data channel to prevent WebRTC from going idle. iOS releases the connection when either app goes to background; a disconnect dialog appears with a one-tap “Reconnect” button.

**WakeLock:** When connected, the app requests `navigator.wakeLock` to keep both screens on. iOS releases WakeLock when the tab goes to background; it is automatically reacquired when the tab becomes visible again.

**STUN:** Uses Google’s STUN server (`stun.l.google.com:19302`) for NAT traversal. On the same LAN, STUN isn’t needed and the connection resolves locally.

**Message types (board ↔ spymaster):**

- `board_state` — board → spy: full state sync on connect
- `request_state` — spy → board: request re-sync
- `request_reveal {idx}` — board → spy: what color is this card?
- `reveal {idx, color}` — spy → board: here’s the color
- `reveal_done {idx, color}` — board → spy: card was manually revealed
- `new_game {board, turn, size}` — board → spy: new board rolled
- `ping` / `pong` — keepalive heartbeat (every 15s)

**Font:** To change the typeface, edit the `<link id="google-font-link">` tag in `index.html` and update the `font-family` in the CSS. Example URLs are commented in the HTML:

```
Be Vietnam Pro  (default)
Outfit
DM Sans
Nunito
Figtree
```

-----

## Changelog

### v1.4.0

- **Undo** — configurable undo history (Settings → Undo Steps, default 2). Topbar ↩ button dims when no steps remain. Undo button also appears in game-over modal, allowing death-card mistakes to be undone.
- Font swap instructions added to HTML as comments

### v1.3.1

- Settings → Advanced section (collapsed by default): Cache Reset and Debug Console buttons
- Cache Reset replaces the `?reset` URL trick with a one-tap button

### v1.3.0

- UI language (TR / EN) fully implemented — all interface strings translated; selection persisted to localStorage
- UI language selector added inside Settings modal (accessible during gameplay)
- Language highlight bug fixed — active button now correctly reflects saved preference on load

### v1.2.0

- **Be Vietnam Pro** font via Google Fonts
- Color dots removed from board cards entirely
- Board grid layout fix — last row no longer clips
- Spymaster grid cells are square
- Starting team banner on Spymaster screen
- Disconnect modal — shows when WebRTC connection drops, with one-tap Reconnect
- ICE gathering timeout increased to 8s
- UI language selector on home screen (TR active, EN stub)
- Version number displayed on home screen

### v1.1.x (keepalive + WakeLock)

- Ping/pong keepalive every 15s to prevent WebRTC idle disconnect
- `navigator.wakeLock` acquired on connect, reacquired on tab visibility change
- `reset()` now correctly stops ping timer and releases WakeLock

### v1.0.0 (initial)

- WebRTC peer-to-peer pairing via QR code (two-scan flow)
- Board (iPad) + Spymaster (iPhone) mode split
- 5×5 / 4×4 board size selection
- Turkish word pool with used-word tracking (localStorage)
- Auto game-over on death card, red/blue win
- Long-press manual color picker (fallback when not connected)
- Service worker for offline caching
- PWA manifest for home screen installation
- `?reset` and `?debug` URL parameters
- SDP compression with CompressionStream + base64
- Multi-CDN fallback loader for QR libraries (qrcode@1.4.4, jsQR@1.4.0)