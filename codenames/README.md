# Codenames TR

A two-device PWA for playing Codenames in Turkish. Board = iPad on the table, Spymaster = iPhone held privately.

## Overview

- Single HTML file — no build step, no backend, no dependencies to install
- WebRTC peer-to-peer sync — two QR scans to pair, then fully offline during gameplay
- 4×4 and 5×5 board modes
- Word pool tracking via localStorage — no repeated words across games (~31 games with the 777-word Turkish list)
- Auto-detects death card, win conditions, and turn changes
- Pass turn, undo, and card swap features
- UI language: TR / EN. Game word language: TR only for now
- PWA — installable to iPad and iPhone home screen

## Files

|File           |Purpose                             |
|---------------|------------------------------------|
|`index.html`   |Entire application                  |
|`words.js`     |Turkish word pool (777 unique words)|
|`sw.js`        |Service worker for offline caching  |
|`manifest.json`|PWA manifest                        |

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

|Action                                  |Result                                                         |
|----------------------------------------|---------------------------------------------------------------|
|Tap a card (Board, connected)           |Requests color from Spymaster; card opens automatically        |
|Double-tap a card (Board)               |Opens card swap dialog — only works before any card is revealed|
|Long-press a card (Board, not connected)|Manual color picker                                            |
|Tap a card (Spymaster)                  |Sends reveal to Board (useful if board tap timed out)          |
|PAS / PASS button                       |Ends current team’s turn, passes to the other team             |
|Topbar ↩ button                         |Undo last reveal — dimmed when no steps remain                 |
|New Game (Board)                        |Rolls a fresh board, syncs to Spymaster                        |

## Card Swap

Before any card has been revealed, players can replace a word they dislike:

1. Double-tap a card (two taps within 400ms)
1. Confirm in the dialog
1. The word is replaced with a random unused word from the pool

If any card has already been revealed, double-tap shows a warning instead.

## Rules

**5×5 (Classic):** 9 red, 8 blue, 7 neutral, 1 death. Red starts.
**4×4 (Quick):** 6 red, 5 blue, 4 neutral, 1 death. Red starts.

- Opening your own team’s card → continue your turn
- Opening the other team’s card or a neutral → turn passes automatically
- Tap PAS / PASS to end your turn voluntarily
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

## Word Pool (words.js)

777 Turkish words, curated by these rules:

- Concrete nouns only — no abstract-only words (e.g. “joy”, “peace”)
- Single words only — no phrases or compound words
- No verbs, pure adjectives, pronouns, or conjunctions
- Dual-meaning words are allowed if one meaning is concrete (e.g. ATEŞ = fire/fever, GÖLGE = shadow)

## Technical Notes

**QR pairing:** WebRTC SDP is large. Compressed with `CompressionStream` (deflate-raw) + base64 (iOS 16.4+). Older devices fall back to raw JSON — a manual copy-paste textarea is always available.

**Connection keepalive:** Ping sent every 15 seconds over the data channel to prevent WebRTC idle disconnect. Disconnect dialog appears with one-tap Reconnect when connection drops.

**WakeLock:** `navigator.wakeLock` keeps both screens on while connected. Automatically reacquired when tab returns to foreground.

**STUN:** Uses Google’s STUN server (`stun.l.google.com:19302`) for NAT traversal. On the same LAN, connection resolves locally without STUN.

**i18n:** All UI strings use `data-i18n` attributes. `I18n.applyAll()` does a single `querySelectorAll('[data-i18n]')` pass — no element can be missed. Adding a new translatable string requires only adding `data-i18n="key"` to the HTML element and the key to both `tr` and `en` string maps.

**Message types (board ↔ spymaster):**

- `board_state` — board → spy: full state sync on connect or swap
- `request_state` — spy → board: request re-sync
- `request_reveal {idx}` — board → spy: what color is this card?
- `reveal {idx, color}` — spy → board: here’s the color
- `reveal_done {idx, color}` — board → spy: card was manually revealed
- `new_game {board, turn, size}` — board → spy: new board rolled
- `ping` / `pong` — keepalive heartbeat (every 15s)

**Font:** Edit `<link id="google-font-link">` in `index.html`. Example URLs are commented in the HTML (Be Vietnam Pro, Outfit, DM Sans, Nunito, Figtree).

-----

## Changelog

### v1.6.0

- **Pass turn** — PAS / PASS button next to turn indicator; passes turn to the other team
- **Card swap** — double-tap any unrevealed card before the game starts to replace it with a fresh word from the pool; warning shown if any card has already been revealed
- **Word pool v2** — expanded from 451 to 777 words; all abstract, compound, multi-word, verb, and pure-adjective entries removed

### v1.5.x (i18n overhaul)

- **data-i18n system** — all translatable strings now use `data-i18n` HTML attributes; `applyAll()` does a single querySelectorAll pass, eliminating missed-element bugs
- TR turn labels changed to “SIRA KIRMIZIDA / SIRA MAVİDE”
- Advanced section (Gelişmiş / Önbelleği Temizle / Debug Konsolu) fully translated
- Lang button double-trigger bug fixed — onclick attributes replaced with `addEventListener` bound once at `init()`
- Settings margins standardized to 25px between sections

### v1.4.x

- **Undo** — configurable steps (default 2), topbar ↩ button, undo in game-over modal
- **Tabler Icons** — replaced emoji/text icons with line icons (ti-arrow-back-up, ti-settings, ti-chevron-right/down)
- Settings → Advanced: Cache Reset and Debug Console buttons
- Font swap instructions added to HTML as comments

### v1.3.0

- UI language TR / EN fully implemented; all strings translated
- Language selector added inside Settings modal
- `data-i18n` groundwork begun

### v1.2.0

- Be Vietnam Pro font via Google Fonts
- Color dots removed from board cards
- Board grid last-row clip fix
- Spymaster square grid cells
- Starting team banner on Spymaster screen
- Disconnect modal with one-tap Reconnect
- Version number on home screen

### v1.1.x

- Ping/pong keepalive every 15s
- `navigator.wakeLock` on connect, reacquired on tab focus
- ICE gathering timeout increased to 8s

### v1.0.0

- WebRTC peer-to-peer pairing via QR (two-scan flow)
- Board (iPad) + Spymaster (iPhone) split
- 5×5 / 4×4 board size
- Turkish word pool with used-word tracking
- Auto game-over on death card and win
- Long-press manual color picker
- Service worker + PWA manifest
- `?reset` and `?debug` URL parameters
- SDP compression (CompressionStream + base64)
- Multi-CDN fallback for QR libraries