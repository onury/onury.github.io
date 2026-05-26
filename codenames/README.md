# Codenames TR

A two-device PWA for playing Codenames in Turkish. Board = iPad on the table, Spymaster = iPhone held privately.

## Overview

- Single HTML file — no build step, no backend, no dependencies to install
- WebRTC peer-to-peer sync — two QR scans to pair, then fully offline during gameplay
- 4×4 and 5×5 board modes
- Word pool tracking via localStorage — no repeated words across games (~31 games with the 777-word Turkish list)
- Auto-detects death card, win conditions, and turn changes
- Pass turn, undo, card swap, and spymaster-side new map features
- Color layout constraint: no 5+ consecutive same-color cells in any row or column
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

|Action                            |Result                                                   |
|----------------------------------|---------------------------------------------------------|
|Tap a card (Board, connected)     |Requests color from Spymaster; card opens automatically  |
|Tap a card (Board, not connected) |Manual color picker                                      |
|Long-press a card (Board)         |Card swap dialog — only works before any card is revealed|
|Tap a card (Spymaster, connected) |Sends reveal to Board                                    |
|PAS / PASS button                 |Confirm dialog → ends current team’s turn                |
|Topbar ↩ button                   |Undo last reveal — dimmed when no steps remain           |
|New Game (Board)                  |Rolls a fresh board, syncs to Spymaster                  |
|New Map (Spymaster, connected)    |Confirm → board rolls new game, full sync                |
|New Map (Spymaster, not connected)|New color layout generated locally, no words shown       |

## Spymaster Screen

**Not connected:** Shows color-only map (no words) with starting team badge. Useful for playing without a second device — spymaster reads colors and tracks manually.

**Connected:** Shows color map with words. Turn indicator visible. Tapping a card sends reveal to Board.

When connection drops, a red bar appears below the topbar with a Reconnect button.

## Card Swap

Before any card has been revealed, players can replace a word:

1. Long-press a card (hold ~700ms)
1. Confirm in the dialog
1. Word is replaced with a random unused word from the pool; synced to Spymaster if connected

If any card has already been revealed, long-press shows a warning instead.

## Rules

**5×5 (Classic):** 9 red, 8 blue, 7 neutral, 1 death. Red starts.
**4×4 (Quick):** 6 red, 5 blue, 4 neutral, 1 death. Red starts.

- Opening your own team’s card → continue your turn
- Opening the other team’s card or a neutral → turn passes automatically
- Tap PAS / PASS to end your turn voluntarily (confirm required)
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

|Parameter|Effect                                                      |
|---------|------------------------------------------------------------|
|`?reset` |Same as Cache Reset — clears SW and all caches, then reloads|
|`?debug` |Loads Eruda DevTools on page load                           |

## Word Pool (words.js)

777 Turkish words, curated by these rules:

- Concrete nouns only — no abstract-only words
- Single words only — no phrases or compound words
- No verbs, pure adjectives, pronouns, or conjunctions
- Dual-meaning words allowed if one meaning is concrete (e.g. ATEŞ = fire/fever)

## Technical Notes

**Color layout constraint:** After shuffling, the layout is validated so no color appears 5+ times consecutively in any row or column. Re-shuffled if needed — in practice takes 1–3 attempts, never fails.

**QR pairing:** WebRTC SDP compressed with `CompressionStream` (deflate-raw) + base64 (iOS 16.4+). Older devices fall back to raw JSON with manual copy-paste textarea.

**Connection keepalive:** Ping sent every 15 seconds to prevent WebRTC idle disconnect. Disconnect bar appears with one-tap Reconnect when connection drops.

**WakeLock:** `navigator.wakeLock` keeps both screens on while connected. Reacquired when tab returns to foreground.

**STUN:** Uses Google’s STUN server (`stun.l.google.com:19302`) for NAT traversal.

**i18n:** All UI strings use `data-i18n` attributes. `I18n.applyAll()` does a single `querySelectorAll('[data-i18n]')` pass. Lang buttons use `addEventListener` bound once at `init()` — no onclick attributes.

**Message types (board ↔ spymaster):**

- `board_state` — board → spy: full state sync
- `request_state` — spy → board: request re-sync
- `request_reveal {idx}` — board → spy: what color is this card?
- `reveal {idx, color}` — spy → board: here’s the color
- `reveal_done {idx, color}` — board → spy: card manually revealed
- `new_game {board, turn, size}` — board → spy: new board rolled
- `request_new_game` — spy → board: spy requested new game
- `ping` / `pong` — keepalive heartbeat (every 15s)

**Font:** Edit `<link id="google-font-link">` in `index.html`. Example URLs commented in HTML (Be Vietnam Pro, Outfit, DM Sans, Nunito, Figtree).

-----

## Changelog

### v1.7.x

- **Color layout constraint** — no 5+ consecutive same-color cells in any row/column; validated after shuffle, re-shuffled if needed
- **Spymaster without pairing** — color-only map generated on open; New Map button always available; words hidden when disconnected
- **New Map (Spymaster)** — connected: confirm → board rolls new game + full sync; disconnected: local color re-roll only
- **Disconnect bar** — red bar below topbar replaces modal; only appears on actual disconnect, not on load
- **Spy turn indicator** — hidden when disconnected; only starting team badge shown
- `confirmNewGame` function restored after accidental removal

### v1.6.x

- **Pass turn** — PAS/PASS button with confirm dialog; passes turn to other team
- **Card swap** — long-press unrevealed card to replace word; blocked after first reveal
- **Long-press behavior** — always opens swap (not color picker); 700ms threshold with 10px movement tolerance
- **Word pool v2** — expanded from 451 to 777 words; all abstract, compound, multi-word, verb, and pure-adjective entries removed

### v1.5.x

- **data-i18n system** — all translatable strings use `data-i18n` attributes; `applyAll()` does single querySelectorAll pass
- TR turn labels: “SIRA KIRMIZIDA / SIRA MAVİDE”
- Advanced section fully translated (TR/EN)
- Lang button double-trigger bug fixed — onclick removed, addEventListener bound at init

### v1.4.x

- **Undo** — configurable steps (default 2), topbar ↩ button, undo in game-over modal
- **Tabler Icons** — line icons throughout
- Settings → Advanced: Cache Reset and Debug Console

### v1.3.0

- UI language TR / EN fully implemented
- Language selector in Settings modal

### v1.2.0

- Be Vietnam Pro font
- Color dots removed from board cards
- Spymaster square grid, starting team banner
- Disconnect modal, version on home screen

### v1.1.x

- Ping/pong keepalive every 15s
- `navigator.wakeLock` on connect

### v1.0.0

- WebRTC peer-to-peer pairing via QR (two-scan flow)
- Board (iPad) + Spymaster (iPhone) split
- 5×5 / 4×4 board size, Turkish word pool
- Auto game-over, long-press color picker
- Service worker + PWA manifest
- `?reset` and `?debug` URL parameters
- SDP compression, multi-CDN fallback for QR libraries