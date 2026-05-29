# Codenames

A two-device PWA for playing Codenames in Turkish. Board = iPad on the table, Spymaster = iPhone held privately.

## Overview

- Single HTML file — no build step, no backend, no dependencies to install
- WebRTC peer-to-peer sync — two QR scans to pair, then fully offline during gameplay
- 4×4 and 5×5 board modes
- Background texture themes (fabric, wood, marble)
- Configurable display font (14 options)
- Word pool tracking via localStorage — no repeated words across ~31 games
- Auto-detects death card, win conditions, and turn changes
- Pass turn, undo, card swap, and spymaster-side new map features
- Random starting team — starting team gets one extra card
- Color layout constraint: no 5+ consecutive same-color cells in any row or column
- UI language: EN / TR (default EN)
- PWA — installable to iPad and iPhone home screen

## Files

|File           |Purpose                             |
|---------------|------------------------------------|
|`index.html`   |Entire application                  |
|`words.js`     |Turkish word pool (775 unique words)|
|`sw.js`        |Service worker for offline caching  |
|`manifest.json`|PWA manifest                        |
|`bg/`          |Background texture images           |

## Hosting (HTTPS required)

iOS Safari requires HTTPS for camera access (QR scanning).

**GitHub Pages**

1. Push files to a repo
1. Settings → Pages → main branch → Save
1. Open `https://<username>.github.io/<repo>/`

**Local with tunnel (for testing)**

```bash
python3 -m http.server 8000
ngrok http 8000
```

## Installing as a PWA

On both devices:

1. Open the URL in Safari
1. Share icon → “Add to Home Screen”
1. Launch from the home screen icon — runs fullscreen like a native app

## Starting a Game

1. **iPad** — tap “Board (iPad)”
1. **iPhone** — tap “Spymaster (iPhone)”
1. **iPad** → Pair → Generate QR
1. **iPhone** → Pair → scan iPad’s QR → answer QR is generated
1. **iPad** → Scan Answer QR
1. Both show **Connected** — live sync is active

Pairing is required once per session. If either device closes the page, re-pair.

## Gameplay

|Action                            |Result                                                 |
|----------------------------------|-------------------------------------------------------|
|Tap a card (Board, connected)     |Requests color from Spymaster; card opens automatically|
|Tap a card (Board, not connected) |Manual color picker                                    |
|Long-press a card (Board)         |Card swap — only works before any card is revealed     |
|PASS button                       |Ends current team’s turn immediately                   |
|Topbar ← button                   |Return to home screen                                  |
|Topbar ↩ button                   |Undo last reveal                                       |
|New Game (Board)                  |Rolls a fresh board, syncs to Spymaster                |
|New Map (Spymaster, connected)    |Board rolls new game, full sync                        |
|New Map (Spymaster, not connected)|New color layout generated locally, no words shown     |

## Spymaster Screen

**Not connected:** Color-only map (no words, no labels). Useful for playing without a second device.

**Connected:** Full color map with words and turn indicator.

When connection drops, a red bar appears with a Reconnect button.

## Card Swap

Before any card has been revealed:

1. Long-press a card (~700ms)
1. Confirm in the dialog
1. Word is replaced with a random unused word; synced to Spymaster if connected

## Rules

**5×5 (Classic):** Starting team gets 9 cards, other team gets 8, 7 neutral, 1 death.
**4×4 (Quick):** Starting team gets 6 cards, other team gets 5, 4 neutral, 1 death.

Starting team is chosen randomly each game.

- Opening your own team’s card → continue your turn
- Opening the other team’s card or neutral → turn passes automatically
- PASS to end your turn voluntarily
- Opening the death card → your team loses immediately
- First team to reveal all their cards wins

## Settings

|Setting        |Description                                |
|---------------|-------------------------------------------|
|UI Language    |EN / TR (default EN)                       |
|Board Size     |5×5 or 4×4 — takes effect on next New Game |
|Display Font   |13 font options, live preview              |
|Background     |6 texture themes, live preview             |
|Undo Steps     |Max undo history depth (0 = off, default 2)|
|Reset Word Pool|Clears used-word history                   |

**Advanced:** Cache Reset, Debug Console

## URL Parameters

|Parameter|Effect                                |
|---------|--------------------------------------|
|`?reset` |Clears SW and all caches, then reloads|
|`?debug` |Loads Eruda DevTools on page load     |

## Word Pool

775 Turkish words:

- Concrete nouns only
- Single words only — no phrases or compounds
- No verbs, pure adjectives, pronouns, or conjunctions
- Dual-meaning words allowed if one meaning is concrete (e.g. ATEŞ = fire/fever)

## Technical Notes

**WebRTC pairing:** SDP compressed with `CompressionStream` (deflate-raw) + base64. Falls back to raw JSON with manual textarea on older devices.

**Color layout:** Validated after shuffle — no color appears 5+ times consecutively in any row or column. Re-shuffled if needed (1–3 attempts in practice).

**Keepalive:** Ping every 15s to prevent WebRTC idle disconnect.

**Background scaling:** `background-size: 100vw 100vh` (not `cover`) — avoids iOS Safari PWA body-height bug where `cover` scales against `scrollHeight` (~1000px) instead of the visible viewport.

**Offline background:** Background images load from a remote URL. If the fetch fails (no network), a dark gradient fallback is applied and a dismissing toast is shown.

**WakeLock:** `navigator.wakeLock` keeps both screens on. Reacquired on tab foreground.

**STUN:** Google’s `stun.l.google.com:19302`.

**Message types (board ↔ spymaster):**

- `board_state` — full state sync (board, turn, scores, targets, startingTeam)
- `request_state` — spy → board: request re-sync
- `new_game` — board → spy: new board rolled
- `request_new_game` — spy → board: spy requested new game
- `reveal_done {idx, color}` — board → spy: card manually revealed
- `ping` / `pong` — keepalive heartbeat

-----

## Changelog

### v2.3.x

- Back button (←) added to Board and Spymaster topbars — returns to home screen, resets peer connection
- Mode-select buttons widened to 420px
- Background scaling fixed for iOS Safari PWA: `background-size: 100vw 100vh` replaces `cover`
- Offline background: gradient fallback + auto-dismissing toast when image can't be loaded
- Default UI language changed to EN

### v2.2.x

- Word list corrections: `LACIVERT→LACİVERT`, `VANILYA→VANİLYA`, `TRİPOD`, `ETİKET`, `ZİNCİR`, `MERMİ`, `PROJEKTÖR`; `ZILLER→ZİL` (singular); duplicate entries removed; 775 words
- QR pairing UX: status text in accent color, QR Oluştur disabled during generation, Metni Uygula disabled until QR scanned or text pasted
- Spymaster disconnected: word labels hidden, color-only view
- Anasayfa: Debug Console and Reset Cache buttons below version

### v2.1.x

- Background texture setting: Yeşil Kumaş (default), Koyu Ahşap, Açık Ahşap, Kahverengi Mermer, Renkli Mermer, Dark
- Display font setting: 13 options (Paytone One default), live preview, persisted to localStorage
- Board card redesign: bej/gold base, white label band, inner/outer glow, box-shadow
- Revealed cards: full red/blue background, dark-toned label; yellow/black with matching tones
- Service worker: network-first strategy (always fetches latest, falls back to cache offline)
- Scoreboard sync fix: `redTarget`/`blueTarget` included in `board_state` messages
- Spymaster local mode: random starting team, correct card counts
- Modal text size reduced for better fit on small screens
- Anasayfa Reset Cache and Debug Console shortcuts

### v2.0.x

- Topbar redesign: flex layout (no grid), two-row structure (scores + buttons row 1, turn + pass row 2)
- Pass button: no confirm dialog, immediate turn switch, styled same height as turn indicator
- Disconnect icon button in topbar (plug icon); confirmDisconnect with confirm dialog
- Pair modal auto-closes on both devices when WebRTC channel opens
- Starting team badge removed from spymaster (turn indicator sufficient)
- `startingTeam` persisted in save state and synced via `board_state`
- `redTarget`/`blueTarget` sent in all `board_state` messages
- Landscape lock for small screens (portrait shows rotate message)
- WakeLock acquired at app init, not only on connect
- Cache reset clears game state from localStorage
- Font selector in Settings with 13 options and live preview

### v1.9.x

- Pass button moved to topbar row 2 (center), no confirm dialog
- Spymaster card tap completely disabled (no listener added)
- Starting team badge: uses `State.startingTeam` (fixed, not `State.turn`)
- Board card tap: touchend-based with long-press timer
- Scoreboard 2× larger

### v1.7.x – v1.8.x

- Color layout constraint (5+ consecutive same-color blocked)
- Spymaster without pairing: color-only map, New Map always available
- Disconnect bar with Reconnect
- Spy turn indicator hidden when disconnected

### v1.6.x

- Pass turn (PAS/PASS button)
- Card swap (long-press)
- Word pool expanded to 777 words

### v1.5.x

- `data-i18n` system, TR/EN UI fully translated

### v1.4.x

- Undo (configurable steps, topbar button)
- Tabler Icons
- Settings → Advanced (Cache Reset, Debug Console)

### v1.3.0

- UI language TR / EN

### v1.2.0

- Be Vietnam Pro font, color dots removed, spymaster square grid

### v1.1.x

- Ping/pong keepalive, WakeLock

### v1.0.0

- WebRTC pairing via QR (two-scan flow)
- Board (iPad) + Spymaster (iPhone)
- 5×5 / 4×4, Turkish word pool
- Service worker + PWA manifest