# Sound effects renderer

Pre-renders every sound effect in `js/audio/sfx.js` into `audio/sfx/<effect>.opus`, and writes
`js/audio/sfx-files.js` so the game knows what's there. Each file holds every variant of one effect back to back
(every combo pitch of `place`, every partner's `touchHead`, ...), and the game plays the slice it needs.

The game then plays a buffer instead of building a graph of oscillators, filters and envelopes for every click, card
and chime. That matters most on phones, and when many effects fire together (deals, auto-finish, combo bursts). Nothing
is approximated: there is one render for every distinct sound an effect can make, rendered from the game's own synth
code, including the SFX echo.

## Quick start

```bash
npm run sfx                          # render missing or out-of-date effects (~5 s for all of them)
npm run sfx -- status                # what is up to date
npm run sfx -- --force place win     # re-render some effects
npm run sfx -- --help
```

Requirements: the repo's `npm install` (Electron) and an `ffmpeg` built with libopus (`FFMPEG=/path/to/ffmpeg`
to pick one). No display is needed: on Linux without `DISPLAY`/`WAYLAND_DISPLAY` it switches to Chromium's
headless platform by itself.

## Variants

An effect's arguments (combo, rank, partner, multiplier...) change its sound, so `SfxSuite.VARIANTS` in
`js/audio/sfx.js` describes, per effect:

| field | |
|---|---|
| `key(...args)` | the normalized arguments the sound depends on, e.g. `place(combo)` → `[clamp(round(combo), 0, 24)]`. It has to mirror the clamping the effect does. Effects without one have a single sound. |
| `sample` | argument lists to try. The renderer renders one variant per distinct key among them, so they must reach every key the game can produce. |
| `takes` | renders with different random seeds for effects built on noise or random pitch (`flip`, `draw`, `shuffle`, `nya`...). The game picks one at random each time. |
| `gap` | ms: calls closer together than this are dropped (hover ticks, popup chimes). Applied by `sound.js` for both files and live synthesis. |
| `seq(...args)` | the effect is a timed sequence of parts. `deal(n, gap)` is `n` card taps and `multiPlace(count, combo)` a thud plus one tap per card. Their arguments are open-ended, so the parts are rendered instead (`dealTap`, `multiThud`, `tapNoise`, `tapNote`) and `sound.js` schedules them. The live synth plays the same sequence. |
| `part` | a piece of a `seq` effect. It gets a file but isn't callable from the game. |

When you add an effect with arguments or change how an effect uses them, update its `key` and `sample`. If you
forget, the renderer tells you (see the key check below).

## How it works

- `main.js` (Electron main) opens hidden windows (`--jobs`, default half the cores, at most 8). `render.html` loads the
  game's own audio code (`js/core/util.js`, `js/audio/synth.js`, `sfx.js`) and `render.js` does the work.
- **Fingerprints:** first, every sample of every effect runs against a stand-in AudioContext that builds no audio but
  logs every node, connection, parameter change and start/stop (with seeded randomness, plus a hash of the noise
  buffers). Two calls with the same log sound the same.
  - **Key check:** if two samples share a key but log differently, `key()` is out of step with the effect. The run
    stops and names the arguments, e.g. `place(23) and place(24) both have key "23" but sound different`.
  - **Dedup:** keys that log identically (e.g. `revealCard` ranks above the pitch cap) share one rendered clip.
  - **Staleness:** an effect is re-rendered only when its fingerprints change (or the settings, `render.js` or
    `TOOL_VERSION` in `main.js` do). Editing one effect in `sfx.js` re-renders just that effect.
- **Render:** each variant (× takes) plays into its own `OfflineAudioContext` at 48 kHz mono, through the same SFX echo
  the game uses (`SfxSuite.createEcho`). The synth has no panning, so mono loses nothing. The tail is cut once it stays
  below `floorDb`. A render still sounding in its last 0.25 s is an error (raise `seconds`).
- **Pack:** an effect's clips go back to back with `gapSeconds` of silence between them (more than an Opus frame, so
  the codec can't smear one clip into the next), and the file is encoded as Opus with ffmpeg. Levels are left as
  rendered, so nothing needs to be undone at play time.
- **Check:** every file is decoded again by Chromium's decoder and compared with what went in. The length must match to
  the sample, the alignment offset must be 0 (Opus pre-skip handled correctly), the SNR must be at least 8 dB, and
  every clip's level must be within 1 dB. 96 kbps gives about 17–43 dB SNR and ±0.15 dB. Any failure is printed and
  the run exits with status 1.

Renders are not bit-identical from run to run (float summation order inside Chromium varies), so re-render only what
changed rather than everything with `--force`.

## Settings (`sfx.json`)

| key | default | |
|---|---|---|
| `kbps` | 96 | Opus VBR bitrate (`--kbps`). All effects come to ~2.7 MB at 96. |
| `sampleRate` | 48000 | render and file rate |
| `seconds` | 4 | render length per variant, before the tail is trimmed. `win` is the longest at ~2.5 s. |
| `floorDb` | -80 | tail-trim threshold (dBFS) |
| `gapSeconds` | 0.05 | silence between clips in a file |
| `seed` | 1 | change it for different noise in every effect |

## In the game

- `js/audio/sound.js` starts fetching and decoding the files when the AudioContext is created, two at a time in
  manifest order (the effects are listed in `sfx.js` order, so the common ones come first). Decoded, all effects take
  about 29 MB at 48 kHz (157 s including the gaps).
- `Sound.sfx.<effect>(...args)` computes the variant key, picks a take and plays that slice into the SFX bus. The bus
  volume, mute, master compressor and analyser still apply live.
- Until an effect's file has decoded, or if the browser can't play Opus (`canPlayType`), the file fails to load, or
  the key isn't in the manifest (an argument no sample covered), the effect is synthesized live from `sfx.js`, the code
  the files were rendered from.
- `Sound.sfxState()` reports `files` / `loading` / `partial` / `synth` / `off` and how many files decoded. The
  Electron smoke test (`npm run test:smoke`) prints it as `sfx`.
- Files are requested as `audio/sfx/<effect>.opus?v=<content hash>`, so the 30-day immutable cache in `nginx.conf`
  picks up re-rendered files. `.opus` is already served as `audio/ogg` by nginx and `server/index.js`.
