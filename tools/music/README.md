# Soundtrack renderer

Pre-renders every music track into `audio/music/<track>/<tier>.opus`, one file for each combo tier (0–4), and
writes `js/audio/music-files.js` so the game knows what's there.

The game no longer has to synthesize music on the fly, which matters most on phones. Nothing the score does with
the combo is lost. Each tier file contains everything the live synth plays at that tier: the ride pings, octave
arpeggios, counter-arpeggio, octave lead, extra Reese hits and open hats that come in at higher tiers, plus the
per-voice filter cutoffs and volumes that rise with intensity. All five files of a track have the same length and
start on the same downbeat. When the tier changes, `js/audio/sound.js` starts the new file at the playing file's
position and crossfades over 0.12 s, which is about the live scheduler's own lookahead. The master filter and gain
that follow the tier, plus ducking, volume and mute, are still applied live.

## Quick start

```bash
npm run music                         # render missing or out-of-date tracks (~1 min for all 7 on 6 windows)
npm run music -- status               # what is up to date
npm run music -- --force lofi bounce  # re-render some tracks
npm run music -- --help
```

Requirements: the repo's `npm install` (Electron) and an `ffmpeg` built with libopus (`FFMPEG=/path/to/ffmpeg`
to pick one). No display is needed: on Linux without `DISPLAY`/`WAYLAND_DISPLAY` it switches to Chromium's
headless platform by itself.

## How it works

- `main.js` (Electron main) opens a few hidden windows (`--jobs`, default half the cores, at most 8) and hands
  each one a (track, tier) job.
- `render.html` loads the game's own audio code (`js/core/util.js`, `js/audio/tracks.js`, `synth.js` and
  `score.js`), and `render.js` plays the score into an `OfflineAudioContext` at 48 kHz mono. The synth has no
  panning, so mono loses nothing. Chromium's Web Audio engine renders the same voices the game would synthesize live.
- **Seamless loops:** each loop is rendered twice and only the second pass is kept. Notes and echoes that ring
  past the loop point are then already in the opening bars, just as they are when the loop repeats.
- **Melodies:** live, the sequencer builds a new random variation phrase every two loops. The renderer runs the same
  code with a seeded RNG (`seed` in `music.json`) and renders enough loops to reach `minSeconds`. A loop is always a
  multiple of 4 passes of the 4-bar pattern, so each file holds several different variations. All five tiers of a
  track play identical notes.
- **Levels:** one gain per track normalizes the loudest tier to `peakDb`. The manifest stores the inverse
  (`gain`) and the game multiplies it back in, so tracks play at their original level.
- **Beat telemetry:** the kick times inside the loop are stored in the manifest (`kicks`), so the visualizer's beat
  pulse works without the live sequencer.
- **Check:** every encoded file is decoded again by Chromium's decoder and compared with what went in. The length
  must match to the sample, the alignment offset must be 0 (Opus pre-skip handled correctly) and the waveform SNR
  must be at least 12 dB (64 kbps Opus gives about 20–28 dB). Any failure is printed and the run exits with status 1.

A track is re-rendered when any input changes: `util.js`, `tracks.js`, `synth.js`, `score.js`, `render.js`, the
settings in `music.json`, or `TOOL_VERSION` in `main.js`. Bump `TOOL_VERSION` if you change the encoder arguments.
Renders are not bit-identical from one run to the next (float summation order inside Chromium varies), so re-render
only what changed rather than everything with `--force`.

## Settings (`music.json`)

| key | default | |
|---|---|---|
| `kbps` | 64 | Opus VBR bitrate (`--kbps`). 48 is still clean and cuts the ~19 MB total by a quarter. |
| `minSeconds` | 40 | shortest loop (`--min-seconds`). Longer means more melody variations before a repeat, but more download and memory. |
| `peakDb` | -1 | peak level of the loudest tier before encoding |
| `seed` | 1 | change it for a different set of melody variations |
| `tracks` | `{}` | per-track overrides, e.g. `{ "bounce": { "loops": 4 } }` (rounded up to a multiple of 4) |

## In the game

- `js/audio/sound.js` fetches the current track's files and decodes the playing tier first. Music starts as soon as
  that one is ready, and the rest decode in the background. Desktops keep all five tiers decoded (about 0.2 MB of
  PCM per second each). In Battery saver mode (`lite`) only the tiers next to the current one stay decoded, and
  others are decoded when needed, in about 0.1–0.2 s.
- If the browser can't play Opus (`canPlayType`), or a file fails to load or decode, that track falls back to the
  live step sequencer (`js/audio/score.js`), which is the code these files were rendered from.
- `Sound.musicState()` reports `files` / `synth` / `loading` / `off`, the playing tier and which tiers are decoded.
  The Electron smoke test (`npm run test:smoke`) prints it as `music`.
- Files are requested as `audio/music/<track>/<tier>.opus?v=<content hash>`, so the 30-day immutable cache in
  `nginx.conf` picks up re-rendered files. `.opus` is already served as `audio/ogg` by nginx and `server/index.js`.
