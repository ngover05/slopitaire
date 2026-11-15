/* Soundtrack renderer page (runs in a hidden Electron window, see main.js).
 * Plays the game's own score (js/audio/score.js + synth.js + tracks.js) into an OfflineAudioContext, one combo tier
 * at a time, and checks encoded files by decoding them with Chromium's decoder, the one the game will use. */
'use strict';

// Deterministic randomness: the same inputs always render the same notes (and the same files)
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedOf(str) { // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const STEPS_PER_LOOP = 64;
const CHUNK = 0.5; // s between scheduling passes; each pass queues the next 2 * CHUNK

// The phrases each loop plays, chosen exactly as the live sequencer does (js/audio/sound.js tick()): a new pair on
// every even loop. Depends only on the track and seed, so all five tiers of a track play the same melody.
function phraseSchedule(tr, name, loops, seed) {
  Math.random = mulberry32(seedOf(`${seed}:${name}:phrases`));
  const out = [];
  let phrases = MusicTracks.buildPhrases(tr);
  for (let n = 0; n < loops; n++) {
    if (n > 0 && n % 2 === 0) phrases = MusicTracks.buildPhrases(tr);
    out.push(phrases);
  }
  return out;
}

const Renderer = {
  tracks() {
    const out = {};
    for (const [name, tr] of Object.entries(MusicTracks.TRACKS)) out[name] = { bpm: tr.bpm, style: tr.style };
    return out;
  },

  // Renders the loop twice and keeps the second pass: notes and echoes ringing past the loop point are then already
  // in its first bars, exactly as they would be when the loop repeats, so the file loops without a seam.
  async render({ name, tier, loops, sampleRate, seed }) {
    const tr = MusicTracks.TRACKS[name];
    if (!tr) throw new Error(`unknown track ${name}`);
    const t0 = performance.now();
    const sets = phraseSchedule(tr, name, loops, seed);
    Math.random = mulberry32(seedOf(`${seed}:${name}:${tier}`)); // noise buffers and hit offsets

    const e16 = 60 / tr.bpm / 4;
    const steps = loops * STEPS_PER_LOOP;
    const loopSec = steps * e16;
    const start = Math.round(loopSec * sampleRate);
    const len = Math.round(loopSec * sampleRate);
    const ctx = new OfflineAudioContext(1, start + len, sampleRate);

    const out = ctx.createGain();
    out.connect(ctx.destination);
    const E = { ctx, sfxBus: out, echo: null, sfxEcho: null, cfg: { lite: false } };
    const synth = createSynth(E);
    E.echo = synth.createEcho(ctx, ctx.destination, clamp((60 / tr.bpm) * 0.75, 0.14, 0.62));
    const kicks = [];
    const score = createMusicScore({
      ...synth, cfg: E.cfg, intensity: () => tier, recordKick: (t) => kicks.push(t),
    });

    // Queue notes a little ahead of the render position, like the live scheduler does. Queuing all of them up front
    // works too, but Chromium then processes every waiting voice on every render quantum and it gets very slow.
    let st = 0;
    const queueUntil = (until) => {
      for (; st < steps * 2; st++) {
        const sw = (tr.swing && st % 4 === 2) ? tr.swing * (e16 * 2) : 0;
        const t = st * e16 + sw;
        if (t >= until) break;
        if (t < ctx.currentTime) throw new Error(`step ${st} queued late (${t} < ${ctx.currentTime})`);
        const n = Math.floor(st / STEPS_PER_LOOP) % loops;
        score.sched(tr, st, t, out, sets[n], n);
      }
    };
    queueUntil(CHUNK * 2);
    const quantum = 128 / sampleRate;
    for (let k = 1; k * CHUNK < (start + len) / sampleRate - CHUNK; k++) {
      const at = Math.round((k * CHUNK) / quantum) * quantum;
      ctx.suspend(at).then(() => { queueUntil(at + CHUNK * 2); ctx.resume(); });
    }

    const buf = await ctx.startRendering();
    if (st < steps * 2) throw new Error(`only ${st} of ${steps * 2} steps were queued`);
    const pcm = buf.getChannelData(0).slice(start, start + len);
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
    // kick times relative to the second pass's downbeat (which is within half a sample of the file's first sample)
    const loopKicks = kicks.map((t) => t - loopSec).filter((t) => t > -1e-6 && t < loopSec - 1e-6)
      .map((t) => Math.max(0, t)).sort((a, b) => a - b);
    return { pcm, peak, kicks: loopKicks, loop: len / sampleRate, ms: performance.now() - t0 };
  },

  // Decodes an encoded file and compares it with the samples that went in: length, alignment (a decoder that
  // ignores Opus pre-skip shows up as a lag) and signal-to-noise ratio.
  async verify({ bytes, ref, sampleRate }) {
    const ctx = new OfflineAudioContext(1, 1, sampleRate);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const buf = await ctx.decodeAudioData(ab);
    const d = buf.getChannelData(0);
    const W = Math.min(sampleRate >> 1, ref.length >> 2), mid = (ref.length >> 1) - (W >> 1), MAXLAG = 2048;
    let best = -Infinity, lag = 0;
    for (let l = -MAXLAG; l <= MAXLAG; l++) {
      let s = 0;
      for (let i = 0; i < W; i++) s += ref[mid + i] * (d[mid + i + l] || 0);
      if (s > best) { best = s; lag = l; }
    }
    let sig = 0, err = 0;
    for (let i = 0; i < ref.length; i++) {
      const j = i + lag;
      if (j < 0 || j >= d.length) continue;
      sig += ref[i] * ref[i];
      const e = ref[i] - d[j];
      err += e * e;
    }
    return {
      decodedLength: d.length, expectedLength: ref.length, lag,
      snrDb: err > 0 ? 10 * Math.log10(sig / err) : Infinity,
    };
  },
};

window.bridge.onJob(async (id, kind, payload) => {
  try {
    window.bridge.done(id, await Renderer[kind](payload));
  } catch (err) {
    window.bridge.fail(id, String((err && err.stack) || err));
  }
});
window.bridge.ready();
