# Slopitaire // PRISM ◈✿

High-tech **futuristic anime Klondike solitaire** featuring the **Prism Core** tactical interface, an ambient circuit-board backdrop, a **4-Layer Hyper Pop-Up FX System**, **8 fully voiced companions**, optional **Google OAuth2 cloud sync**, and a **Windows Electron desktop app**. Every card face is crisp generated SVG, all **151 heroine sprite & showcase PNGs** are studio-cleaned transparent TV-anime artwork, and every music track and **49+ digital sound effects** are synthesized live with the Web Audio API.

---

## ◈ Prism Core Futuristic Overhaul

- **Top `COMBO` Counter & Multiplier Tiers (`#comboHud`):** Build active move streaks across consecutive card placements and foundation locks before the energy gauge decays (timer pauses automatically while menus or modals are open). Shuffling the same card between tableau piles without turning anything face-up stops counting after 3 moves: the 4th kills the combo (`✕ CARD SHUFFLE`) until real progress is made:
  | Combo | Tier | Score Multiplier | Feedback |
  |---|---|---|---|
  | `0` / `1–4` | `IDLE` / `ACTIVE` | `×1.0` | Emerald standby / active telemetry HUD |
  | `5–9` | `SURGE` | `×1.2` | Electric mint-emerald glow + milestone riser SFX |
  | `10–19` | `BOOST` | `×1.5` | Dual emerald-amber glow + `BOOST ×10!` anime cut-in |
  | `20–29` | `BLITZ` | `×2.0` | High-intensity solar-emerald aura + `BLITZ ×20!` anime cut-in |
  | `30+` | `APEX!` | `×3.0` | Prismatic apex aura + `APEX COMBO` anime cut-in |
- **4-Layer Hyper Pop-Up FX System (`PopupFX`):** Non-blocking (`pointer-events: none`) arcade feedback across four synchronized visual layers, configurable in Settings (`Hyper` / `Standard` / `Minimal`):
  1. **Spatial World Floating Pop-Ups (`#popupLayer > .pop-float`):** Position-tracked, stagger-cascaded capsules over cards and slots for scoring plays (`+15 ×1.5`, `+30 ×2.0`), flips (`FLIP! +5`, `ROYAL FLIP!`, `ACE REVEALED!`), foundation locks (`◈ ACE ONLINE!`, `HALF SUIT!`, `ROYAL LOCK!`, `★ SUIT COMPLETE!`), `♛ KING ANCHOR!`, `STACK ×3!` / `MEGA STACK ×6!`, `⚡ COLUMN CLEAR!`, rapid APM (`⚡ QUICK!`, `⚡ SNAP!`, `⚡ BLITZ SPEED!`), `🔥 CLUTCH SAVE!`, and stock/hint/rewind events.
  2. **Left-Edge Tactical Event & Medal Ticker (`#eventFeed > .event-pill`):** Live telemetry & skill-medal feed announcing combo promotions, streak milestones, board completion (`25%`, `50%`, `75%`, `AUTO-FINISH READY`), per-deal medals (`LIGHTNING OPENER`, `FULL STACK TRANSFER`, `COLUMN UNLOCKED`, `FOUR KINGS ANCHORED`, `SCORE MILESTONE`, `NEW BEST SCORE!`), and live track/theme/partner switches.
  3. **Sub-HUD Kinetic Callout Banner (`#calloutBanner`):** Angled holographic visor banner below the topbar slamming in on major peaks (`COMBO` milestones, `ACE ONLINE`, `KING ANCHOR`, `COLUMN CLEAR`, `CLUTCH SAVE`, `MEGA STACK`, `HALFWAY`, `FINAL STRETCH`, `SUIT COMPLETE`).
  4. **Mini Companion Reaction Stamp (`.react-pop`):** Tilted holographic portrait stamp (`NICE!`, `CLEAN!`, `SO FAST!`, `GENIUS!`, `CLUTCH!`, `LOCKED IN!`, `LET'S GO!`, `UNREAL!`, etc.) voiced and styled for your active companion.
- **Ambient Circuit Backdrop (`#bgCanvas`):** A faint, flat circuit-board pattern in the theme colours with a few lights gliding slowly along its traces and two softly drifting glows. Game events (cards home, combo milestones) send out a soft glow and extra lights; nothing is beat-synced. Respects `prefers-reduced-motion` and the Settings toggle.
- **5 Distinct Futuristic Tech Themes:**
  - `◈ Prism Core` *(default)* — Deep Slate-Petrol (`#0a131a` → `#122330`) with Electric Mint-Emerald (`#2ce8a2`) & Solar Amber-Gold (`#ffb638`)
  - `🌌 Astral Violet` — Deep Indigo-Charcoal with Periwinkle-Violet (`#9d8cff`) & Warm Coral (`#ff8e6e`)
  - `🌸 Neo Blossom` — Frosted Rose Light Tech with Rose-Coral (`#ff5c8a`) & Mint-Teal (`#2ec4b6`)
  - `⚡ Cobalt Surge` — Arctic Ice Tech with Cobalt-Sapphire (`#2979ff`) & Citrine-Gold (`#ffab00`)
  - `🌿 Jade Circuit` — Botanical Alabaster with Jade-Emerald (`#1fb879`) & Tangerine (`#ff7f50`)
- **7 Synthesized Electronic & Chill Music Tracks:** 16th-note Web Audio step sequencer with detuned supersaw leads, pumping octave/Reese basslines, high-speed arpeggios, breakbeat fills, and dynamic combo-tier intensity layering (`Sound.setIntensity(0..4)`):
  - `◈ Prism Pulse` (**165 BPM** — default)
  - `🔥 Redline Rush` (**178 BPM**)
  - `⚡ Horizon Drive` (**152 BPM**)
  - `✦ Zenith Core` (**190 BPM**)
  - `🐾 Neko Bounce` (**118 BPM**)
  - `🌸 Pastel Lo-fi` (**76 BPM**)
  - `🌙 Starlight` (**64 BPM**)
- **49+ Synthesized Futuristic Digital SFX (`Sound.sfx`):** Pitch-climbing `place` & `comboTick` pings, staggered `multiPlace` stack drops, harmonic `multiPick`, `cardHover` & UI `hover` micro-ticks, crystalline `revealCard` data-decrypt shimmers, `kingLock` bass servo-locks, `aceIgnition` prism sparks, `foundation` chord chimes, tiered `comboMilestone` risers, clutch `comboSave` dual-chimes, `comboBreak` power-downs, `popupScore` twinkles, `badgeUnlock` medal chimes, `bannerSlam` visor thumps, `reactStamp` star pops, `draw` & `drawTriple` card fans, `stockEmpty`, `modalOpen` / `modalClose` holo-whooshes, `toggleOn` / `toggleOff` binary chirps, 8 character-signature `partnerSelect` & `petGirl` musical motifs, `halfway`, `almostWon`, `suitDone`, `clearCol`, `autoStep`, `cutin`, `warning`, `newRecord`, and `win` fanfare.
- **2,000+ Bilingual Voice Lines:** Over 2,000 distinct `[bubble, Japanese TTS, English TTS]` lines across all 8 companions and 41 gameplay & combo-momentum events (`SURGE` / `BOOST` / `BLITZ` / `APEX` milestones, combo breaks, clutch saves, rapid APM streaks, King locks, Ace ignitions, multi-card stacks, midpoint & climax rush, music/theme switches, and more) with a 5-line anti-repeat ring buffer and automatic BGM ducking.
- **151 Cleaned TV-Anime Companion Sprites (`Corner` & `Full-Body` Modes) + Partner Auras:** 20+ transparent RGBA sprites per heroine across **11 expressive moods** (`normal`, `happy`, `wink`, `oops`, `sad`, `thinking`, `special`, `hype`, `smug`, `shock`, `cheer`, plus character extras and showcase portraits, alongside Mochi SVG), switchable live between **Corner bust** and **Full-Body** framing via **Settings → Sprite style**, with bespoke `[data-partner]` holographic aura FX, `4×2` hover-winking partner portraits, zero-fringe alpha decontamination, and zero-obstruction click-through card safety.

---

## 🚀 Quick Start (Zero-Build Browser)

No bundler, Node install, or build step is required.

- **Direct file open:** Double-click `index.html` to open it in any modern browser.
- **Local static server (optional, recommended for Web Workers in strict browser modes):**
  ```bash
  npx serve .
  # or
  python -m http.server 8080
  ```
  *(The only external request is Google Fonts for `Orbitron`, `Chakra Petch`, `Mochiy Pop One`, and `Nunito`; offline play falls back cleanly to system fonts.)*

---

## 🐳 Docker Deployment

Slopitaire ships with a lightweight production container (`nginx:1.27-alpine`) preconfigured with `gzip` compression, `/healthz` healthchecks, tuned static cache headers, and security headers.

### Option 1: Docker Compose (Recommended)

Build and launch in the background on `http://localhost:8080`:

```bash
docker compose up -d --build
```

Run on a custom host port (e.g., `http://localhost:3000`):

```bash
# Linux / macOS / Git Bash
PORT=3000 docker compose up -d --build

# Windows PowerShell
$env:PORT=3000; docker compose up -d --build
```

Check health or stop the container:

```bash
curl http://localhost:8080/healthz   # -> ok
docker compose ps
docker compose down
```

### Option 2: Standalone `docker build` & `docker run`

```bash
# Build the image
docker build -t slopitaire:latest .

# Run on port 8080 (or change 8080:80 to 3000:80)
docker run -d \
  --name slopitaire \
  -p 8080:80 \
  --restart unless-stopped \
  slopitaire:latest
```

---

## 🔐 Google OAuth2 Accounts & Cloud Sync

Slopitaire optionally supports **Google-only OAuth2 + PKCE sign-in** (`openid email profile`) and non-destructive cloud progress sync (`settings`, per-difficulty `stats`, and active mid-game `save`) powered by a zero-npm-dependency **Node.js 24 + SQLite** backend (`server/`).

Guest play works completely without configuring credentials—if `.env` omits `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, the game cleanly stays in local guest mode with zero errors.

### 1. Configure `.env` & Google Cloud Console

1. Copy `.env.example` to `.env` and fill in your Google OAuth 2.0 Web Client credentials:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - Optional: `GOOGLE_REDIRECT_URI`, `PUBLIC_BASE_URL`, `SESSION_SECRET`, `ALLOWED_ORIGINS`
2. In **Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs**, add both **Authorized redirect URIs**:
   - `http://localhost:8080/api/auth/google/callback` *(Docker Compose + NGINX reverse proxy)*
   - `http://localhost:3000/api/auth/google/callback` *(Standalone Node server `npm run server` & Desktop app default)*

### 2. Run the Sync Server

- **Docker Compose (NGINX + API + persistent `/data/slopitaire.db` volume):**
  ```bash
  docker compose up -d --build
  ```
  NGINX serves the frontend on `http://localhost:8080` and proxies `/api/*` to the `api` service (`Dockerfile.api`).
- **Standalone Node.js 24 server (serves static files + `/api/*` on `http://localhost:3000`):**
  ```bash
  npm run server
  # runs: node server/index.js --static
  ```
- **Run the automated OAuth2 + SQLite sync test suite:**
  ```bash
  npm run test:auth
  # runs: node server/test-auth.js
  ```

---

## 🖥️ Desktop App (Electron)

Slopitaire can be run and packaged as a native **Windows desktop application** (`Slopitaire // PRISM`, `1360×860`, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) serving assets over a custom `app://slopitaire` protocol with ASAR-unpacked `audio/` for native MP3 Range streaming.

### Desktop Features
- **System-Browser Google OAuth2:** Signs in via your default browser using an ephemeral `127.0.0.1` loopback callback (`/auth/callback`), exchanges the single-use ticket for a bearer token, and stores credentials encrypted via Electron `safeStorage` in `userData/auth.json`.
- **Configurable Sync Server:** Adjust the sync server URL directly in **Settings → Account & Cloud Sync** (defaults to `http://localhost:3000`).
- **Resilient Offline Backup:** Mirrors `settings`, `stats`, `save`, and sync metadata atomically to `userData/progress-backup.json`.

### Commands

```bash
# Install Electron & electron-builder devDependencies
npm install

# Launch the Electron desktop app
npm start

# Run the headless smoke check (verifies 52 cards, Solver, Cast, Account, slopDesktop, app://slopitaire)
npx electron . --smoke-test

# Build unpacked desktop directory (dist/win-unpacked/)
npm run pack

# Package Windows x64 Portable .exe & NSIS Installer in dist/
# (On non-admin Windows PowerShell, disable winCodeSign auto-discovery:)
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'; npm run dist
```

---

## 🎴 Difficulties

Deal difficulty is measured with the solver: how much searching it needs before it finds the win (about 100 positions means its first, natural line of play just works; hundreds or thousands means the win depends on a non-obvious line), plus how deeply aces and 2s are buried in the opening tableau.

| | Deals | Undo | Hints | Redeals (Draw 1 / Draw 3) | Score × |
|---|---|---|---|---|---|
| 🌸 **Easy** | **Gentle** & verified winnable: the solver's most natural line wins, and aces/2s start near the top | Unlimited | Unlimited | ∞ / ∞ | `1×` |
| ⭐ **Medium** | Random | Unlimited (−10 pts each) | 3 per game | 3 passes / ∞ | `1.5×` |
| 🔥 **Hard** | **Tricky** & verified winnable within Hard's pass limits: the obvious line of play does not win | None | None | 1 pass / 3 passes | `2×` |
| ◈ **Auto** | Verified winnable — **AI solver autopilot** (~580 ms steady pace, live `▶`/`⏸` chip pause/resume & manual re-plan) | Unlimited | Unlimited | ∞ / ∞ | `1×` |

> **Autopilot Mode (`◈ Auto`):** Uses the built-in DFS solver's exact move planner to play through a guaranteed-winnable deal step by step at a steady, watchable rhythm—naturally driving `COMBO` streaks, 4-layer Hyper Pop-Ups, digital SFX, and companion voice reactions. Click the `◈ Auto ▶` / `◈ Auto ⏸` HUD chip at any time to pause or resume, or jump in manually and let the planner adapt on the next tick.

## 🧠 Unwinnable-Game Detection

After each move (once you've made your first), the current board state is sent to an exhaustive DFS solver running in a background **Web Worker**, so 60 FPS rendering never stutters. The solver explores legal moves—including partial-stack transfers and retreating cards off foundations—within a ~4 s / 250k-state budget. Only when every reachable line is proven unwinnable does the board lock, offering **Undo** (where difficulty allows), **Retry Deal**, or **New Game**. Settings → **End game when** picks the rule: `Unwinnable` (default, the solver proves no winning line is left), `No moves left` (keep playing until no move can send a card home or turn one face-up; shuffling cards around doesn't count), or `Never`.

## 💖 Companions (8-Partner Roster)

Pick your partner from the `4×2` roster on the title screen or in Settings—each with bespoke voice pitch/cadence, signature selection & pet chimes, reaction stamps, and aura styling:

| Partner | Title | Archetype & Look |
|---|---|---|
| **Sakura** | *Prism Stage Idol* | Genki cheer idol with pink twin-tails, ribbons & 20 Corner/Full-Body sprites |
| **Yuki** | *Prism Tactical AI* | Cool analytical kuudere with silver-lavender hair, star clips & 20 Corner/Full-Body sprites |
| **Rin** | *Rival Cyber Ace* | Fiery tsundere neko rival with dark ponytail, cat-ear hair & 20 Corner/Full-Body sprites |
| **Mio** | *Shy Soundscape* | Bashful dandere with pastel mint-seafoam bob, clover hairpin, headphones, cardigan & soft mint glow |
| **Ayame** | *Devoted Obsession* | Silky-sweet devoted yandere with jet-black hime-cut hair, burgundy ribbons & crimson-rose aura |
| **Kira** | *Aura Netrunner* | Cool phantom hacker with silver-emerald wolf-cut, forehead visor, techwear jacket & animated emerald-gold hacker aura |
| **Kaede** | *Warm Onee-san* | Comforting older sister with chestnut-honey wavy hair, golden butterfly clip, knit vest & warm amber-gold glow |
| **Mochi** | *Cyber Lucky Neko* | Synthesized `"nya~"` SVG lucky cat mascot with full 11-mood support |

Every line is **prerecorded with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M)** in both Japanese and English, so each partner has her own fixed voice that sounds the same in every browser (`audio/voice/<partner>/<lang>/*.mp3`, ~4,200 clips). Lines without a clip fall back to the browser's **Web Speech API**. To change a voice or re-render after editing lines, see `tools/voice/README.md`. Higher-priority callouts never get cut off by routine chatter, and big moments (`BOOST`, `BLITZ`, `APEX`, `SUIT COMPLETE!`, `VICTORY!!`) trigger animated anime cut-ins.

## ⚙️ Settings (Saved in `localStorage`)

- **Gameplay:** 4 difficulties (`Easy`, `Medium`, `Hard`, and `◈ Auto` solver autopilot), 1-card or 3-card draw, tap to auto-move, auto-play to foundations, auto-finish, highlight valid drops, game-end detection (`Unwinnable` / `No moves left` / `Never`), left-handed layout.
- **Look & Feel:** 5 futuristic/pastel themes (`◈ Prism Core`, `🌌 Astral Violet`, `🌸 Neo Blossom`, `⚡ Cobalt Surge`, `🌿 Jade Circuit`), **Pop-up FX** intensity (`Hyper` / `Standard` / `Minimal`), toggleable **3D circuit stage** (`bgFx`), 4 card backs, animation speed, ambient particles/petals, HUD visibility.
- **Companion:** 8-partner selection, **Sprite style** (`Corner bust` vs. `Full body`), show/hide, reaction frequency (`All` / `Some` / `Big moments`), voice toggle, language (`日本語` / `English`), voice volume, anime cut-ins.
- **Audio:** Master mute, 7 generative music tracks or off, independent music and SFX volume sliders.
- **Stats & Persistence:** Per-difficulty games played, wins, win rate, best time, high score, streaks, best combo streak, and automatic mid-game resume.

## 🎹 Controls

- **Mouse / Touch:** Drag cards/stacks, tap a card to send it to its best valid destination, or tap the stock pile to draw. Click your companion to cycle expressions, or switch framing via **Settings → Sprite style**.
- **Keyboard:** `N` new game · `H` hint · `Ctrl+Z` / `U` undo · `Space` / `D` draw · `M` mute · `Esc` close dialogs.

## 📁 Project Structure

- `index.html` — App shell, Prism topbar & `#comboHud`, account status bar, `#popupLayer` / `#eventFeed` / `#calloutBanner` overlays, `#bgCanvas` stage, modals
- `css/style.css` — `prism` & 4 tech-enhanced themes, account/sync UI styles, 4-layer Hyper Pop-Up FX styles, partner auras (`[data-partner]`), zero-flicker sprite system
- `js/game.js` — Klondike rules, combo/multiplier engine, `PopupFX` 4-layer pop-up controller, `StageBG` ambient circuit backdrop, timestamped `Store` & guest delta tracking, input, UI, persistence
- `js/account.js` — Google OAuth2 account UI, cloud sync client, Electron desktop bridge integration & offline backup hooks
- `js/audio.js` — 16th-note Web Audio synthesizer, 7 BGM tracks, real-time `AnalyserNode` telemetry, 49+ digital SFX
- `js/cast.js` — 8-companion / 151-sprite `Corner`/`Full-Body` manifest, 11 moods, 2,000+ bilingual voice lines, voice-clip player with Web Speech fallback
- `js/art.js` — Crisp SVG card faces, chibi royal court cards, card backs, Mochi SVG mascot
- `js/solver.js` — Exhaustive DFS Klondike solver & step-by-step `◈ Auto` autopilot move planner (runs in Web Worker and Node.js)
- `images/{sakura,yuki,rin,mio,ayame,kira,kaede}/` — 151 cleaned transparent TV-anime companion sprites (`corner_*` & `full_*`) + showcase portraits
- `server/` — Zero-dependency Node.js 24 backend (`index.js`, `db.js`, `auth.js`, `merge.js`, `test-auth.js`) for Google OAuth2 + PKCE and SQLite progress sync
- `electron/` — Electron desktop shell (`main.js`, `preload.js`, `icon.png`, `icon.ico`) with `app://slopitaire` protocol, `safeStorage` token vault, loopback OAuth2, and `--smoke-test`
- `package.json`, `Dockerfile`, `Dockerfile.api`, `docker-compose.yml`, `nginx.conf`, `.env.example`, `.dockerignore` — Electron packaging and multi-service Docker deployment

`index.html?debug` exposes `window.__slop` for automated inspection and testing.
