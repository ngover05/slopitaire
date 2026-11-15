# Voice line generator

Renders every companion line in `js/cast/` with [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)
into `audio/voice/<companion>/<en|ja>/<id>.mp3` (or `.opus`) and rewrites `js/cast/voice-clips.js` so the game knows which clips exist.

The clip id is the FNV-1a hash of the line's *spoken* text, after the game's own `Voice.speakable()` cleanup.
`extract-lines.js` runs the real cast scripts (`js/cast/`, in `index.html` order) in a sandbox to get that text, so the generator and the game always
agree on file names. Edit a line in `js/cast/characters/<name>.js`, re-run the generator, and only that line is rendered.

## Quick start

```bash
python3 tools/voice/generate.py setup     # once per machine: builds tools/voice/.venv
python3 tools/voice/generate.py doctor    # shows the hardware it found and how it will use it
python3 tools/voice/generate.py status    # what is missing / stale / orphaned
python3 tools/voice/generate.py           # renders what is needed, updates js/cast/voice-clips.js
```

Requirements: Python 3.10–3.12 and Node.js. ffmpeg is **not** needed: MP3 is encoded in-process with LAME, and
Opus with the libopus that ships inside the `soundfile` wheel. `setup` also downloads the Kokoro model (~330 MB),
the UniDic dictionary for Japanese (~500 MB) and spaCy's small English model, so workers never race to fetch them.

## Output format: MP3 or Opus

Set it in `voices.json` (`"output": {"format": "opus"}`) or for one run with `--format opus`.

| | MP3 (default) | Opus |
|---|---|---|
| Default bitrate | 40 kbps CBR | 24 kbps VBR (`--kbps` / `opus_kbps` to change) |
| Size (5,402 clips) | ~120 MB (~23 KB/clip) | 63 MB (~12 KB/clip) |
| Plays in | everything | Chromium / Electron, Firefox, Safari 18.4+ |

The manifest records the extension for each companion/language (`"ext": "opus"`), and `js/cast/voice.js` checks
`canPlayType()` first, so a browser that can't play Opus falls back to Web Speech instead of failing silently.
Switching formats renders a full new set beside the old files. Once that finishes, `generate --prune` deletes
the old-format copies, but only for lines that already have a clip in the new format. To switch back without
re-rendering, run `manifest --format mp3`. nginx (`nginx.conf`) and the Node server (`server/index.js`) both serve
`.opus` as `audio/ogg`.

## Hardware

`setup` picks the PyTorch build that suits the machine:

| Found | PyTorch build |
|---|---|
| NVIDIA GPU (`nvidia-smi`) | newest CUDA wheel your driver supports |
| AMD GPU with ROCm on Linux (`/opt/rocm*`) | the ROCm wheel that matches the installed ROCm version |
| Apple Silicon | default build (Metal / MPS) |
| anything else | the small CPU-only build |

Override it with `setup --accel cpu|cuda|rocm|mps [--accel-version 12.8]`. Re-running `setup` is safe.

Every worker is a separate process with its own copy of the model (about 2 GB of RAM, plus about 1 GB of VRAM
on a GPU). Several workers per GPU let one line's text processing (CPU-bound) overlap another line's synthesis
(GPU-bound). The plan is worked out from what's free when you run it:

- **GPU:** workers per card are limited by free VRAM, CPU cores and RAM (at most 6 per card). Multiple GPUs are all
  used, and a work-stealing dispatcher gives the faster card more lines. Integrated GPUs (APUs) are skipped
  because the CPU path is faster for this model; pick one explicitly with `--device cuda:N` if you want it.
- **CPU only:** a few workers with several threads each, limited by physical cores and available RAM.
  A 2-core / 4 GB laptop gets one worker, and that still works.
- **`bench`** measures actual throughput at 1, 2, 3, 4, … workers, stops once adding workers stops helping, and
  saves the best count to `tools/voice/.hwprofile.json`. That file is gitignored and tied to this machine's
  hardware, so it is ignored anywhere else. `generate` uses it automatically.

Manual overrides: `--device cpu|cuda|cuda:1|mps`, `--workers N` (per device), `--threads N` (per worker).
On ROCm, MIOpen is bypassed by default: its LSTM path JIT-compiles a dropout kernel that needs rocRAND headers
the PyTorch wheels don't include (`MIOpenDropoutHIP.cpp` build failure), and PyTorch's own HIP kernels are fast
for this model. `VOICEGEN_MIOPEN=1` turns it back on, and any cuDNN or MIOpen error falls back to native kernels
automatically. If a GPU runs out of memory, the worker frees its cache and retries the line once. A crashed worker only fails
its own lines, and progress is saved every 25 clips, so Ctrl-C or a crash loses nothing: run it again to continue.

## Voices (`voices.json`)

```jsonc
{
  "model": "hexgrad/Kokoro-82M",
  "output": { "format": "mp3", "mp3_kbps": 40, "opus_kbps": 24 },   // 24 kHz mono
  "post": { "trim_db": null, "peak_db": null, "gain_db": 0 },   // optional silence trim / normalization
  "characters": {
    "sakura": {
      "en": { "voice": "af_heart", "speed": 1.0 },
      "ja": { "voice": "jf_alpha:0.7,jf_nezumi:0.3", "speed": 1.05 }   // weighted blends are allowed
    }
  }
}
```

The available voices are listed on the [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)
(`af_*` / `bf_*` for American / British English, `jf_*` for Japanese). Try one before committing to it:

```bash
python3 tools/voice/generate.py preview sakura en "Mic check, one two!" --play
python3 tools/voice/generate.py preview sakura ja "よーし！がんばろう！" --voice jf_nezumi --speed 1.1 --play
```

Changing a companion's entry makes all of that companion's clips in that language **stale**, and the next run
re-renders exactly those clips. Each clip's settings fingerprint is stored in `voices.lock.json` (commit it).

## Commands

| Command | What it does |
|---|---|
| `generate` (default) | Renders missing and stale clips. `--char sakura --lang ja` narrows it; `--format mp3\|opus` and `--kbps N` override the output for this run; `--force` re-renders everything selected; `--prune` deletes clips whose line was removed from `js/cast/` plus old-format copies; `--dry-run` lists the work; `--limit N` renders at most N clips. |
| `status [-v]` | Per companion/language counts. `-v` lists each line. Needs only Python and Node. |
| `doctor` | Python/torch/GPU/RAM report and the worker plan. |
| `bench` | Tunes the worker count for this machine (see above). |
| `preview` | Renders a single piece of text to `tools/voice/.preview/` (`--out x.opus` / `.mp3` / `.wav`). |
| `match` | For existing clips whose settings were lost: renders sample lines with every Kokoro voice, estimates speed from duration, and ranks voices by spectral distance to the clips (~0.5 means an exact match). If no stock voice comes within `--exact`, it also tries two-voice blends of the `--blends K` closest. |
| `adopt` | Records the existing clips as made with the current `voices.json`, so they count as ok rather than *adopted*. Use it after `match`. |
| `manifest [--format F]` | Rebuilds `js/cast/voice-clips.js` from what's on disk. |
| `fetch` | Downloads the model and every voice pack (`setup` runs it). |

Clip states: **ok** (rendered with the current settings), **missing** (no file yet), **stale** (settings changed
since it was rendered), **adopted** (it predates the lock file, so its settings are unknown; it's kept unless you
pass `--force`), **orphan** (a file whose line is gone; it's left out of the manifest and deleted by `--prune`).

The manifest's `v` value for each companion/language is a cache-buster. It changes only when that set of clips
or its voice changes, so players don't download unchanged clips again.
