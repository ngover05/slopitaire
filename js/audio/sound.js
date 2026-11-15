/* Slopitaire // PRISM audio — futuristic digital Web Audio synthesizer, dynamic combo layering & spectrum telemetry.
 * The SFX suite lives in js/audio/sfx.js, the synth voices in js/audio/synth.js, the music track data in
 * js/audio/tracks.js and the score in js/audio/score.js. Music normally plays from pre-rendered Opus loops
 * (tools/music -> audio/music, listed in js/audio/music-files.js), one per combo tier, crossfaded in sync; the
 * live step sequencer is the fallback where those can't load or decode. */
const Sound = (() => {
  'use strict';

  let ctx = null, master = null, comp = null, analyser = null, freqData = null;
  let sfxBus = null, sfxEcho = null, musicOut = null, musicFilter = null, musicBus = null, echo = null;
  // lite: phones & low-power devices — a larger output buffer, a deeper schedule and fewer voices per note
  const cfg = { muted: false, sfx: 0.7, music: 0.5, track: 'pulse', lite: false };
  let timer = null, nextT = 0, step = 0, phrases = null, loopN = 0, ducked = false;
  let intensity = 0, musicStartT = 0, pausedByPage = false;

  // How far ahead the step scheduler queues notes. The scheduler runs on the main thread, so any stall longer than
  // this (layout, a busy frame, a throttled timer on a phone) leaves a gap in the music.
  const lookahead = () => (cfg.lite ? 0.5 : 0.22);
  const tickMs = () => (cfg.lite ? 45 : 25);

  // Preallocated ring buffer of scheduled kick timestamps for zero-alloc beat telemetry
  const kickQueue = new Float64Array(8);
  let kickWrite = 0, lastKickT = 0;

  const nowMs = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());

  function recordKick(t) {
    lastKickT = t;
    kickQueue[kickWrite & 7] = t;
    kickWrite++;
  }

  function clearKicks() {
    kickQueue.fill(0);
    kickWrite = 0;
    lastKickT = 0;
  }

  function intensityCutoff() {
    // Opens master music filter from 7.8kHz at IDLE up to 19.5kHz at APEX tier 4
    return [7800, 10800, 13800, 16800, 19500][intensity] || 7800;
  }

  function intensityGain() {
    return [1.0, 1.04, 1.08, 1.13, 1.18][intensity] || 1.0;
  }

  function activeTrack() {
    if (cfg.track === 'off') return null;
    return TRACKS[cfg.track] || TRACKS.pulse;
  }

  // ---------- Autoplay unlock ----------
  // Browsers keep an AudioContext suspended until a user gesture. Only some events count as one (on Android a touch
  // pointerdown does not, its touchend / pointerup / click does), so listen for all of them and keep listening until
  // the context is actually running.
  const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
  let unlockArmed = false;
  function onUnlockGesture() {
    ensure();
    if (ctx && ctx.state === 'running') disarmUnlock();
  }
  function armUnlock() {
    if (unlockArmed) return;
    unlockArmed = true;
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, onUnlockGesture, { capture: true, passive: true });
  }
  function disarmUnlock() {
    if (!unlockArmed) return;
    unlockArmed = false;
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, onUnlockGesture, { capture: true });
  }
  function tryResume() {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
    try {
      const p = ctx.resume();
      if (p && p.then) p.then(() => { if (ctx.state === 'running') disarmUnlock(); }, () => {});
    } catch (e) { /* resume refused without a gesture: the unlock listeners retry */ }
  }

  // called once at startup: create the context and start the music right away where the browser allows it
  // (Electron, or a site the user has already granted sound), otherwise on the first interaction
  function boot() {
    if (!ensure()) return;
    if (ctx.state !== 'running') armUnlock();
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      // 'balanced' gives phones a larger output buffer, so a busy audio thread doesn't underrun and crackle
      try { ctx = new AC({ latencyHint: cfg.lite ? 'balanced' : 'interactive' }); } catch (e) { ctx = new AC(); }
      ctx.onstatechange = () => {
        if (ctx.state === 'running') disarmUnlock();
        // iOS 'interrupted' (a call, Siri) or a suspend we didn't ask for: resume on the next touch
        else if (ctx.state !== 'closed' && !pausedByPage && !document.hidden) armUnlock();
      };

      master = ctx.createGain();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 10;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;

      analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      analyser.minDecibels = -92;
      analyser.maxDecibels = -16;
      freqData = new Uint8Array(analyser.frequencyBinCount);

      master.connect(comp);
      comp.connect(analyser);
      analyser.connect(ctx.destination);

      sfxBus = ctx.createGain();
      sfxBus.connect(master);

      // Crisp short prism slap-shimmer bus for futuristic digital SFX
      sfxEcho = ctx.createDelay(0.5);
      sfxEcho.delayTime.value = 0.085;
      const sfxFb = ctx.createGain();
      sfxFb.gain.value = 0.22;
      const sfxHp = ctx.createBiquadFilter();
      sfxHp.type = 'highpass';
      sfxHp.frequency.value = 900;
      const sfxWet = ctx.createGain();
      sfxWet.gain.value = 0.24;
      sfxEcho.connect(sfxHp);
      sfxHp.connect(sfxFb);
      sfxFb.connect(sfxEcho);
      sfxHp.connect(sfxWet);
      sfxWet.connect(sfxBus);

      musicOut = ctx.createGain();
      musicOut.connect(master);

      musicFilter = ctx.createBiquadFilter();
      musicFilter.type = 'lowpass';
      musicFilter.frequency.value = safeHz(intensityCutoff());
      musicFilter.Q.value = 0.75;
      musicFilter.connect(musicOut);

      echo = createEcho(ctx, musicFilter);

      applyGains();
      if (cfg.track !== 'off' && !cfg.muted) startMusic();
    }
    if (!pausedByPage) tryResume();
    return true;
  }

  function applyGains() {
    if (!ctx) return;
    const t = ctx.currentTime;
    master.gain.setTargetAtTime(cfg.muted ? 0 : 1, t, 0.02);
    sfxBus.gain.setTargetAtTime(clamp(cfg.sfx, 0, 1.5) * 0.9, t, 0.02);
    const mVol = clamp(cfg.music, 0, 1.5) * 0.44 * intensityGain() * (ducked ? 0.4 : 1);
    musicOut.gain.setTargetAtTime(mVol, t, ducked ? 0.07 : 0.22);
    if (musicFilter) {
      musicFilter.frequency.setTargetAtTime(safeHz(intensityCutoff()), t, 0.08);
    }
  }

  function configure(o) {
    if (!o) return;
    const prevTrack = cfg.track, prevMuted = cfg.muted, prevLite = cfg.lite;
    Object.assign(cfg, o);
    cfg.lite = !!cfg.lite;
    if (!ctx) return;
    applyGains();
    if (cfg.muted || cfg.track === 'off') {
      stopMusic();
      if (cfg.track === 'off') deck = null; // music switched off: let the decoded loops go
    }
    else if (prevTrack !== cfg.track || prevMuted !== cfg.muted || !musicActive || (prevLite !== cfg.lite && !stream)) {
      // (the pre-rendered loops don't depend on lite; only the live sequencer has to restart for it)
      startMusic();
    } else if (stream) keepTiers(stream.deck);
  }

  function setIntensity(tier) {
    const next = clamp(Math.round(Number(tier) || 0), 0, 4);
    if (next === intensity && ctx) return;
    intensity = next;
    if (ctx) applyGains();
    syncTier();
  }

  function getTelemetry() {
    const tr = activeTrack() || TRACKS.pulse;
    const bpm = tr.bpm || 165;
    if (!ctx || ctx.state !== 'running' || cfg.muted || !analyser || !freqData) {
      return { bass: 0, mid: 0, high: 0, energy: 0, beat: 0, bpm };
    }

    analyser.getByteFrequencyData(freqData);
    // 64 bins (~344-375 Hz per bin):
    // Bins 0..3: sub + kick + bass, Bins 4..15: synths/snares/mids, Bins 16..43: hats/shimmer/air
    const bassRaw = (freqData[0] * 1.35 + freqData[1] * 1.2 + freqData[2] * 0.9 + freqData[3] * 0.55) / (4 * 255);
    let midSum = 0;
    for (let i = 4; i < 16; i++) midSum += freqData[i];
    const midRaw = midSum / (12 * 230);

    let highSum = 0;
    for (let i = 16; i < 44; i++) highSum += freqData[i];
    const highRaw = highSum / (28 * 205);

    let bass = clamp(bassRaw, 0, 1);
    let mid = clamp(midRaw, 0, 1);
    let high = clamp(highRaw, 0, 1);

    const nowT = ctx.currentTime;
    const beatLen = 60 / bpm;

    // Find most recent kick that has already fired (or is firing within 8ms)
    let latestKick = 0;
    if (stream) latestKick = streamKick(stream, nowT + 0.008);
    else {
      for (let i = 0; i < 8; i++) {
        const kt = kickQueue[i];
        if (kt > latestKick && kt <= nowT + 0.008) latestKick = kt;
      }
    }
    const playing = !!(timer || stream);

    let beat = 0;
    if (latestKick > 0 && nowT - latestKick < beatLen * 1.6) {
      const dt = Math.max(0, nowT - latestKick);
      beat = clamp(Math.pow(Math.max(0, 1 - dt / (beatLen * 0.85)), 2.2), 0, 1);
    } else if (playing && cfg.track !== 'off' && cfg.music > 0) {
      const ph = (((nowT - musicStartT) / beatLen) % 1 + 1) % 1;
      beat = clamp(Math.pow(1 - ph, 2.4) * 0.45 + bass * 0.35, 0, 1);
    } else {
      beat = clamp(bass * 0.8, 0, 1);
    }

    // Warm-up floor during the initial render quantum right after startMusic()
    if (playing && cfg.track !== 'off' && cfg.music > 0 && bass === 0 && mid === 0 && nowT - musicStartT < 0.08) {
      bass = 0.22 * cfg.music;
      mid = 0.16 * cfg.music;
      high = 0.1 * cfg.music;
    }

    const energy = clamp(bass * 0.44 + mid * 0.34 + high * 0.22, 0, 1);
    return { bass, mid, high, energy, beat, bpm };
  }

  // ---------- Synthesis Primitives (js/audio/synth.js) ----------

  const { mtof, safeHz, tone, supersaw, chordStab, noise, bell, createEcho } = createSynth({
    get ctx() { return ctx; },
    get sfxBus() { return sfxBus; },
    get echo() { return echo; },
    get sfxEcho() { return sfxEcho; },
    cfg,
  });

  // ---------- Prism Futuristic Digital SFX Suite (js/audio/sfx.js) ----------

  const sfx = createSoundEffects({
    get ctx() { return ctx; },
    get sfxBus() { return sfxBus; },
    cfg, mtof, nowMs, safeHz, tone, supersaw, chordStab, noise, bell,
  });

  // ---------- Music tracks (tempo, chords, phrases: js/audio/tracks.js) ----------

  const { TRACKS, buildPhrases } = MusicTracks;

  // ---------- Live step sequencer (fallback; the score itself is in js/audio/score.js) ----------

  const score = createMusicScore({
    mtof, safeHz, tone, supersaw, chordStab, noise, bell, cfg, recordKick,
    intensity: () => intensity,
  });

  function sched(st, t) {
    const tr = activeTrack();
    if (!tr || !musicBus) return;
    score.sched(tr, st, t, musicBus, phrases, loopN);
  }

  function tick() {
    const tr = activeTrack();
    if (!tr || !ctx || !musicBus) return;
    const e16 = 60 / tr.bpm / 4;
    // fell far behind (the tab was frozen): skip ahead instead of firing a burst of stale notes
    if (nextT < ctx.currentTime - 0.35) nextT = ctx.currentTime + 0.03;
    const horizon = ctx.currentTime + lookahead();
    let guard = 0;
    while (nextT < horizon && guard++ < 24) {
      if (step > 0 && step % 64 === 0) {
        loopN++;
        if (loopN % 2 === 0) phrases = buildPhrases(tr);
      }
      const sw = (tr.swing && step % 4 === 2) ? tr.swing * (e16 * 2) : 0;
      sched(step, nextT + sw);
      nextT += e16;
      step++;
    }
  }

  function startSynth(tr) {
    if (echo) {
      const dotted8 = clamp((60 / tr.bpm) * 0.75, 0.14, 0.62);
      echo.delayTime.setTargetAtTime(dotted8, ctx.currentTime, 0.04);
    }
    phrases = buildPhrases(tr);
    step = 0;
    loopN = 0;
    nextT = ctx.currentTime + 0.015;
    musicStartT = nextT;
    tick();
    timer = setInterval(tick, tickMs());
  }

  // ---------- Pre-rendered soundtrack (tools/music) ----------
  // Every track is rendered once per combo tier (0..4) into loops of identical length that start on the same downbeat.
  // One tier plays at a time; when the tier changes, the new loop starts at the same position and the two crossfade,
  // so every layer the score adds or removes with the combo is still there, at no synthesis cost.

  const MUSIC = (typeof window !== 'undefined' && window.MUSIC_FILES) || null;
  const TIER_FADE = 0.12; // s, about one scheduler lookahead: as quick as the live engine's own response
  const badSets = new Set(); // tracks whose files failed to load or decode: use the live sequencer from then on
  let opusOk = null;
  let deck = null;   // the current track's files: { name, set, enc: [Promise<ArrayBuffer>], buf: [AudioBuffer], dec: [Promise] }
  let stream = null; // what is playing: { deck, bus, t0, loop, cur, voices: [{ tier, src, g }] }
  let musicGen = 0;  // bumped by stopMusic() so a decode that finishes late doesn't start a stale track
  let musicActive = false;

  function canPlayOpus() {
    if (opusOk == null) {
      try { opusOk = !!new Audio().canPlayType('audio/ogg; codecs=opus'); } catch (e) { opusOk = false; }
    }
    return opusOk;
  }

  function fileSet(name) {
    const set = MUSIC && MUSIC.tracks && MUSIC.tracks[name];
    if (!set || badSets.has(name) || !Array.isArray(set.tiers) || set.tiers.length !== 5 || !(set.loop > 0)) return null;
    if (typeof fetch !== 'function' || !canPlayOpus()) return null;
    return set;
  }

  function deckFor(name, set) {
    if (!deck || deck.name !== name) deck = { name, set, enc: [], buf: [], dec: [] };
    return deck;
  }

  function fetchTier(d, k) {
    if (!d.enc[k]) {
      const f = d.set.tiers[k];
      d.enc[k] = fetch(`${MUSIC.dir}/${f.file}?v=${f.v}`).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      });
      d.enc[k].catch(() => { if (d.enc[k]) d.enc[k] = null; });
    }
    return d.enc[k];
  }

  // decodeAudioData detaches its input, so decode a copy and keep the (small) Opus bytes for a later re-decode
  function decodeTier(d, k) {
    if (d.buf[k]) return Promise.resolve(d.buf[k]);
    if (!d.dec[k]) {
      d.dec[k] = fetchTier(d, k)
        .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab.slice(0), res, rej)))
        .then((b) => { d.dec[k] = null; d.buf[k] = b; return b; },
          (err) => { d.dec[k] = null; throw err; });
    }
    return d.dec[k];
  }

  // Decoded PCM is ~0.2 MB per second, so phones keep only the tiers next to the current one; desktops keep all five
  function keepTiers(d) {
    for (let k = 0; k < 5; k++) {
      if (!cfg.lite || Math.abs(k - intensity) <= 1) decodeTier(d, k).catch(() => {});
      else d.buf[k] = null;
    }
  }

  function streamFailed(name) {
    badSets.add(name);
    if (deck && deck.name === name) deck = null;
    if (musicActive && cfg.track === name) startMusic();
  }

  function startStream(name, set) {
    const d = deckFor(name, set), bus = musicBus, gen = musicGen;
    const tier = intensity;
    decodeTier(d, tier).then((buf) => {
      if (gen !== musicGen || bus !== musicBus) return;
      const trackGain = ctx.createGain();
      trackGain.gain.value = Number(set.gain) || 1;
      trackGain.connect(bus);
      const t0 = ctx.currentTime + 0.03;
      stream = { deck: d, out: trackGain, t0, loop: set.loop, kicks: set.kicks || [], cur: null, voices: [] };
      musicStartT = t0;
      playTier(stream, tier, buf, t0, 0, 0);
      keepTiers(d);
      if (intensity !== tier) syncTier();
    }, () => {
      if (gen === musicGen) streamFailed(name);
    });
  }

  function playTier(s, tier, buf, when, offset, fade) {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = 0;
    src.loopEnd = Math.min(s.loop, buf.duration);
    const g = ctx.createGain();
    if (fade > 0) {
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(1, when + fade);
    }
    src.connect(g);
    g.connect(s.out);
    src.start(when, offset);
    const v = { tier, src, g };
    src.onended = () => {
      const i = s.voices.indexOf(v);
      if (i >= 0) s.voices.splice(i, 1);
      try { g.disconnect(); } catch (e) { /* already disconnected */ }
    };
    s.voices.push(v);
    s.cur = v;
  }

  // crossfade to the loop for the current intensity, starting it at the playing loop's position
  function syncTier() {
    const s = stream;
    if (!s || !ctx) return;
    const tier = intensity;
    if (s.cur && s.cur.tier === tier) return;
    const buf = s.deck.buf[tier];
    if (!buf) {
      decodeTier(s.deck, tier).then(() => { if (stream === s) syncTier(); }, () => {});
      return;
    }
    const when = ctx.currentTime + 0.02;
    const offset = (((when - s.t0) % s.loop) + s.loop) % s.loop;
    for (const v of s.voices) {
      const p = v.g.gain;
      p.cancelScheduledValues(when);
      p.setValueAtTime(p.value, when);
      p.linearRampToValueAtTime(0, when + TIER_FADE);
      try { v.src.stop(when + TIER_FADE + 0.02); } catch (e) { /* already stopped */ }
    }
    playTier(s, tier, buf, when, offset, TIER_FADE);
    keepTiers(s.deck);
  }

  // time of the most recent kick at or before t, from the rendered loop's kick list
  function streamKick(s, t) {
    const n = s.kicks.length;
    if (!n || t < s.t0) return 0;
    const pos = (t - s.t0) % s.loop, base = t - pos;
    let lo = 0, hi = n - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s.kicks[mid] <= pos) { found = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const k = found >= 0 ? base + s.kicks[found] : base - s.loop + s.kicks[n - 1];
    return k >= s.t0 ? k : 0;
  }

  // ---------- Transport ----------

  function startMusic() {
    stopMusic();
    const tr = activeTrack();
    if (!ctx || cfg.muted || !tr) return;
    clearKicks();
    musicActive = true;
    musicBus = ctx.createGain();
    musicBus.connect(musicFilter || musicOut);
    const set = fileSet(cfg.track);
    if (set) startStream(cfg.track, set);
    else startSynth(tr);
  }

  function stopMusic() {
    musicGen++;
    musicActive = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (stream && ctx) {
      for (const v of stream.voices) {
        try { v.src.stop(ctx.currentTime + 0.5); } catch (e) { /* already stopped */ }
      }
    }
    stream = null;
    if (musicBus && ctx) {
      const old = musicBus;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
      // notes are queued up to lookahead() ahead: keep the faded bus connected until they have all played out
      setTimeout(() => {
        try { old.disconnect(); } catch (e) { /* already disconnected */ }
      }, 450 + lookahead() * 1000 + 400);
      musicBus = null;
    }
  }

  function suspend() {
    pausedByPage = true;
    if (ctx && ctx.state === 'running') ctx.suspend();
  }
  function resume() {
    pausedByPage = false;
    if (!ctx) return;
    tryResume();
    if (ctx.state !== 'running') armUnlock();
  }
  function duck(on) { if (ducked === !!on) return; ducked = !!on; applyGains(); }

  // debugging: what the music is doing right now
  function musicState() {
    const d = stream ? stream.deck : deck;
    return {
      mode: stream ? 'files' : timer ? 'synth' : musicActive ? 'loading' : 'off',
      track: cfg.track,
      intensity,
      tier: stream && stream.cur ? stream.cur.tier : null,
      decoded: d ? [0, 1, 2, 3, 4].filter((k) => !!d.buf[k]) : [],
      position: stream && ctx ? (((ctx.currentTime - stream.t0) % stream.loop) + stream.loop) % stream.loop : null,
    };
  }

  return {
    boot,
    ensure,
    configure,
    duck,
    sfx,
    startMusic,
    stopMusic,
    suspend,
    resume,
    getTelemetry,
    setIntensity,
    musicState,
    TRACKS
  };
})();
