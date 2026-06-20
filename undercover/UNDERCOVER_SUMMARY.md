# Undercover — Project Summary

> A two-device Codenames-style word game built as a vanilla-JS PWA.  
> Board on a tablet · Spymaster map on a phone · no server, no accounts, no build step.

---

## How the Game Is Played

Undercover is a two-team word guessing game inspired by Codenames, played across two devices.

### Devices & Roles
| Device | Screen | Who sees it |
|---|---|---|
| **Board (tablet)** | Grid of face-down word cards | All players |
| **Spymaster (phone)** | Same grid with colors revealed | Spymasters only |

### Setup
1. One device opens the app and picks **Board** mode; the other picks **Spymaster** mode.
2. They pair over WebRTC using a two-scan QR flow (Board generates a QR → Spy scans → Spy shows answer QR → Board scans).
3. The Board rolls a new game. The Spymaster receives the full color map instantly.

### Objective
Each team has a set of secret words on the board (red or blue cards). Spymasters look at their phone map and give one-word clues. Players tap cards on the tablet to reveal them. First team to reveal all their words wins. If anyone reveals the single **black death card**, that team instantly loses.

### Gameplay Loop
- The starting team (randomly chosen, whoever has 9 cards in 5×5) takes a turn.
- Their Spymaster gives a clue. Players guess by tapping cards.
- Tapping the correct team color → stays on that team's turn.
- Tapping the wrong color → turn immediately switches to the other team.
- Tapping the black card → instant loss.
- The **Pass** button voluntarily ends the current turn.

### Board Sizes
| Mode | Grid | Starter | Other team | Civilian (yellow) | Death (black) |
|---|---|---|---|---|---|
| Classic | 5×5 | 9 | 8 | 7 | 1 |
| Quick | 4×4 | 6 | 5 | 4 | 1 |

The starting team is chosen randomly each game. They always get one extra card (so 9 vs 8 in 5×5).

---

## Features

### Languages
- **UI language**: Turkish or English. Switchable at runtime without reload.
- **Word language**: Turkish or English. The two languages are independent — you can play Turkish words with an English UI.
- **Common word pool**: A third, language-independent pool of proper nouns (world landmarks, historical figures, mythology, borrowed words) always mixed in.
- All UI strings go through `I18n.t('key')` (JS) or `data-i18n="key"` (static HTML). Never hardcoded.

### Sound
- Implemented with the **Web Audio API** (not `<audio>` tags) so it bypasses the iOS hardware mute/silent switch.
- Sound events: card flip, card swap, new game fanfare, death card, win, WebRTC connected, WebRTC disconnected, countdown tick.
- Can be toggled on/off in Settings → Interface.

### Grid Sizes
- **5×5 (classic)** — 25 cards, standard Codenames feel.
- **4×4 (quick)** — 16 cards, faster rounds.
- Changing size takes effect on the next new game.

### Turn Timer
- Optional countdown per turn (configurable in Settings → Gameplay with ±30s stepper, or off).
- Timer is visible on both Board and Spymaster screens.
- **Head-start**: optional extra time for the starting team's very first turn only. Applied once by `onTurnChange()` and never re-applied.
- Timer can be paused/resumed manually mid-turn.
- Idle detection: if the timer expires 5 consecutive times with no card reveal, an "Are you still there?" prompt appears.
- Timer state is correctly preserved when Settings modal opens (paused timer stays paused; running timer pauses while modal is open, resumes on close).

### Undo
- Configurable 0, 1, or 2 undo steps (Settings → Gameplay).
- Stores full board snapshots before each reveal. Undo restores board, scores, and turn.
- Available only while connected (Spymaster must approve reveals; undo is propagated).

### Card Swap
- Long-press a card on the Board to swap its word with a fresh word from the pool.
- Only available before any cards have been revealed (beginning of game only).
- Replaced word is added to the used-words list so it won't appear again.

### WebRTC Peer-to-Peer
- No relay server — direct peer connection using the browser's built-in WebRTC.
- **Two-scan QR pairing flow**: Board → generates WebRTC offer as QR → Spy scans → Spy generates WebRTC answer as QR → Board scans. Fully offline-capable after initial ICE handshake.
- Manual text fallback: if QR camera fails, the SDP text can be copy-pasted.
- Keep-alive ping/pong (interval configurable in Settings → Advanced).
- Connection status shown on both screens. Reconnect button on disconnect.

### Word Pool & Distribution
- Used words are tracked in `localStorage` per language. Words are never repeated until the full pool is exhausted, then the pool resets with a banner notification.
- **Algorithmic mode** (default): words are drawn from 43+ semantic groups, picking 0–2 words per group per game. This prevents multiple semantically-related words appearing together (e.g. two planets, two body parts).
- **Random mode**: plain shuffle and slice — no group constraint.
- Pool can be manually reset in Settings → Gameplay.

### Card Color Layout Constraint
- The shuffle algorithm is retried (up to 200 attempts) until no row or column contains 5 or more consecutive cards of the same color. Prevents visually clustered layouts.

### Background Textures
- Multiple wood/texture backgrounds loaded from CDN (`onury.io/undercover/img/bg/`).
- Selectable in Settings → Interface.
- Falls back gracefully when offline (shows "Offline — background unavailable").

### Display Fonts
- The word text on cards uses a selectable display font.
- Options include: Paytone One, Bungee, and a serif fallback.
- Font is applied programmatically via `el.style.fontFamily` (CSS variables aren't reliable in SVG-rendered cards inside modals).

### Pass (Turn Handoff)
- Explicit pass button in the Board status strip. Shows a confirmation dialog before switching.

### New Map (Spymaster)
- Spymaster can request a new color map (rerolls the board and starts a new game). Requires confirmation.

### Settings Modal
Three tabs:
- **Gameplay**: board size, turn timer, head-start, undo steps, word language, word distribution, word pool reset.
- **Interface**: UI language, display font, background, sound toggle.
- **Advanced**: ping interval, cache reset (clears SW + app data + reloads), Eruda debug console toggle.

### Offline / PWA
- Full service worker with network-first fetch strategy. All assets cached; game playable offline after first load.
- Installable as a home-screen PWA on iOS and Android.

---

## Codebase

### Stack
No-build, no bundler, no framework. Plain `<script>` and `<link>` tags. Runs directly in the browser.

### File Structure
```
undercover/
├── index.html          # App shell, all modal markup, asset loading, SW registration
├── sw.js               # Service worker — cache name undercover-vNNN
├── CLAUDE.md           # Project rules for AI assistant
├── js/
│   ├── constants.js    # LANGS, KEYS (localStorage), MSG (WebRTC), BG_BASE
│   ├── state.js        # State singleton — all runtime game state
│   ├── storage.js      # Store — load/save State to localStorage
│   ├── i18n.js         # I18n — strings (tr + en), t(), applyAll()
│   ├── utils.js        # shuffle(), colorLayoutOk(), squircleAll(), etc.
│   ├── game.js         # Game — rollNewBoard(), revealCard(), undo(), swapCard()
│   ├── peer.js         # Peer — WebRTC DataChannel, QR pairing state machine
│   ├── qr.js           # QR — qrcode.min.js wrapper + jsQR camera scan
│   ├── sound.js        # Sound — Web Audio API playback
│   ├── timer.js        # Timer — countdown, pause/resume, head-start, idle detection
│   ├── ui.js           # UI — all DOM rendering (grid, cards, status, modals)
│   ├── app.js          # App — game flow, modal orchestration, event handlers
│   ├── words.common.js # SEED_WORDS_COMMON — language-independent proper nouns
│   ├── words.tr.js     # SEED_WORDS_TR — Turkish word groups
│   └── words.en.js     # SEED_WORDS_EN — English word groups
├── css/
│   ├── base.css        # CSS variables, body/html reset, font stack
│   ├── elements.css    # Reusable components: iconbtn, toggle, timer, score box, banner
│   ├── screens.css     # Screen layouts: mode select, topbar, board area, status strip
│   ├── board.css       # Grid, card SVG styles, flip/enter/exit animations
│   └── modal.css       # Modal backdrop, modal box, all modal-specific styles
├── lib/
│   ├── tasktimer.min.js  # Countdown timer library
│   ├── qrcode.min.js     # QR code generator
│   └── jsQR.min.js       # QR code reader (camera)
├── audio/              # Web Audio source files (mp3)
│   └── *.mp3
└── img/
    └── icon.svg
```

### Key Globals
All modules are plain IIFE-style objects/functions on the window scope:

| Global | Purpose |
|---|---|
| `State` | Single source of truth for all runtime game state |
| `Store` | Persists `State` fields to `localStorage` |
| `I18n` | Translation strings + `t(key)` + `applyAll()` |
| `UI` | All DOM rendering — grid, cards, status, scores |
| `Timer` | Turn countdown, pause/resume, idle detection |
| `Sound` | Web Audio API — plays all sound effects |
| `App` | Game flow, modal open/close, event wiring |
| `Peer` | WebRTC DataChannel management |
| `QR` | QR generate + camera scan via jsQR |
| `Game` | Pure game logic — board roll, reveal, undo, swap |
| `Words` | Word pool access — `Words.pool()`, `Words.groups()` |

### Versioning
Two values must stay in sync on every commit:
- `index.html`: `var VERSION='vX.X.X'` (semver) and `?v=NNN` on every asset URL
- `sw.js`: `const CACHE = 'undercover-vNNN'`

Patch bumps (`v3.6.N`) are autonomous on every commit. Minor/major require explicit approval.

### i18n System
- Static HTML elements: `data-i18n="key"` — updated by `I18n.applyAll()`.
- Dynamic JS text: `I18n.t('key')`.
- New keys must be added to **both** `tr` and `en` in `i18n.js`.
- `applyAll()` also triggers `UI.updateStatus()`, `UI.updateSpyStatus()`, `UI.updateConnStatus()` to refresh any dynamically rendered strings.

### Service Worker
- Strategy: **network-first**. Always tries network; caches successful 200 GET responses; falls back to cache if offline.
- Cache name incremented with every commit (`undercover-vNNN`). Activate step deletes all old caches.

### WebRTC Message Types (constants.js `MSG`)
`board_state`, `request_state`, `request_reveal`, `reveal`, `reveal_done`, `new_game`, `request_new_game`, `undo_request`, `ping`, `pong`, `timer_tick`

### Timer Architecture (timer.js)
Key internal flags:
- `_active` — timer is enabled for this game
- `_paused` — currently paused (user-initiated)
- `_modalPaused` — paused because a modal is open
- `_preModalPaused` — snapshot of `_paused` when modal opened (to restore exact pre-modal state)
- `_headStartApplied` — head-start bonus has been used; never re-applied

`pauseForModal()` always sets `_modalPaused = true` before any early-return guard, so settings changes to duration don't accidentally start the timer.

---

## UI & Styling

### Design Language
- Dark, warm theme with a muted amber accent.
- No emoji. Uses **Tabler Icons** (`<i class="ti ti-*">`) for all iconography.
- No regular `border-radius`. All rounded controls use a **superellipse clip-path** (n=2.8).

### Superellipse / Squircle Borders
Every button, chip, and control uses a custom SVG clip-path for a squircle shape (superellipse with n=2.8 — between a circle and a rectangle, same formula as Apple's icon corners). 

Implementation: `squircleAll()` in `utils.js` injects a hidden `<svg>` as the **first child** of every `.iconbtn`, `.mode-btn`, etc. The stroke color reads from the element's `--sq-stroke` CSS variable.

**Critical rule**: never call `element.textContent = '...'` on a squircle button — it destroys the SVG child. Always update a `<span>` inside the button instead.

`squircleAll()` runs on: initial page load, every `window` resize, and every `.modal-bg` activation (observed via `MutationObserver` in `app.js`).

### Color Palette (CSS variables)
```css
--bg:          #1a1a1a   /* near-black base */
--bg-elev:     #232323   /* slightly elevated surface */
--bg-card:     #2d2d2d   /* card/input backgrounds */
--ink:         #ebe5d8   /* primary text — warm off-white */
--ink-dim:     #8a8478   /* secondary text */
--accent:      #d4a574   /* amber/gold — CTAs, highlights */
--line:        #3a3a3a   /* dividers and borders */
--red:         #c84545   /* red team */
--blue:        #3a7bc8   /* blue team */
--yellow:      #c4920a   /* civilian cards */
--black:       #1a1a1a   /* death card */
--red-soft:    #5a2a2a   /* red team backgrounds */
--blue-soft:   #2a3f5a   /* blue team backgrounds */
--yellow-soft: #5a4a2a   /* yellow backgrounds */
```

### Typography
- **UI font**: `'Be Vietnam Pro', 'Outfit', 'DM Sans', system-ui, sans-serif`
- **Display / title font**: `'Bungee'` — used for screen titles, turn indicators, mode buttons
- **Score / timer font**: `'B612 Mono'` — monospaced, tabular nums, used for score display and turn countdown
- **Card word font**: Selectable by user (default: `'Paytone One'`). Applied via `el.style.fontFamily` — not CSS variables — because SVG font rendering inside modals requires explicit inline style.

### Board Grid
- CSS `display: grid` with `gap: 16px`.
- 5×5: `grid-template-columns: repeat(5, 1fr)` / `grid-template-rows: repeat(5, minmax(0, 1fr))`
- 4×4: `repeat(4, 1fr)` both axes.
- Grid fills the entire board area below the topbar via `flex: 1; min-height: 0`.

### Card Rendering
Cards are rendered as inline **SVG elements** (not HTML divs). Each card SVG has:
- `.card-body` — the card background/color fill
- `.card-word-bg` — lighter inset rectangle behind the word
- `.card-word-text` — the word, centered, uppercase, with `dominant-baseline: central; text-anchor: middle`

Unrevealed card: warm tan (`#b8955a` body, `#f0ece2` word bg, `#1a1208` text).  
Revealed cards use color-specific fills (e.g. red: `var(--red)` body, `#7a1a1a` word bg).

The Spymaster grid uses the same SVG structure but shows all card colors upfront. Revealed cards are faded to 35% opacity.

### Card Animations
All card animations use CSS `@keyframes` with `animation-fill-mode: forwards` or `both`:

| Class | Animation | Trigger |
|---|---|---|
| `.flipping` | `card-flip-out` 200ms ease-in | Before reveal (hide) |
| `.flip-in` | `card-flip-in` 200ms ease-out | After reveal (show with color) |
| `.unflipping` | `card-unflip-out` 200ms ease-in | Before undo (hide) |
| `.unflip-in` | `card-unflip-in` 200ms ease-out | After undo (show unrevealed) |
| `.anim-exit` | `card-exit` 280ms ease-in | New game — cards exit upward |
| `.anim-enter` | `card-enter` 280ms ease-out | New game — cards enter from below |
| `.waiting` | `pulse` opacity loop | Pending reveal on Spymaster |

Cards stagger their `animationDelay` by 25ms per index on enter (cascading waterfall effect). After the stagger animation completes, an imperceptible opacity nudge (`0.9999 → ''`) is applied to the grid to force Safari to repaint SVG compositing layers (prevents missing card bug).

### Topbar Layout
**Board screen**: single-row CSS grid `1fr auto [auto] 1fr` (4th column `auto` only visible when timer is enabled):
- Left column: title + undo button
- Center-left: score box (team scores, B612 Mono, 30px)
- Center-right: timer box (when enabled)
- Right column: New Game + Settings buttons

**Spymaster screen**: two-row topbar (row 1: title/conn/buttons; row 2: turn indicator + pass button).

### Score Box
Located in the center of the board topbar. Style: rounded pill (10px border-radius, amber border, blurred backdrop).
```
  RED    7/9   |   5/8   BLUE
```
Format: `<score-val>/<score-tot>` — values are `font-weight: 700`, the `/` is white at 40% opacity, totals are respective team colors at 60% opacity. Rendered in B612 Mono at `font-size: 30px`.

### Status Strip (Board)
Thin bar below the topbar showing: score (left), turn indicator pill (center), Pass button (right). Border-bottom separates it from the grid.

Turn indicator: colored pill (`--red-soft`/`--blue-soft` background, 30px height, min-width 150px, Bungee font). Animates with `turn-pop` scale bounce on turn change.

### Responsiveness
- The app is fixed-position and fills the full viewport (`position: fixed; inset: 0`).
- `user-select: none` and `-webkit-tap-highlight-color: transparent` throughout.
- iOS safe-area insets handled via `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` in topbar padding and board padding.
- The Board is intended for **landscape orientation** on a tablet. A rotate-your-device prompt is shown in portrait mode.
- The Spymaster is designed for a phone held in either orientation.

### Modals
- Backdrop: `.modal-bg` — `position: fixed; inset: 0; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px)`.
- Modal box: `background: rgba(22,20,17,0.97); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px`.
- Title: Bungee font, `--accent` color, letter-spacing 3px.
- When a modal opens, `Timer.pauseForModal()` is called. On close, `Timer.resumeFromModal()` restores the pre-modal timer state.

### Backgrounds
Background textures are loaded as CSS `background-image` on `<html>` and `<body>`, covering the full viewport (`background-size: 100vw 100vh`). The dark base color (`#1a1a1a`) shows while the image loads or if offline.
