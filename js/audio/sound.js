/* Slopitaire // PRISM audio — futuristic digital Web Audio synthesizer, dynamic combo layering & spectrum telemetry.
 * The SFX suite lives in js/audio/sfx.js and the music track data in js/audio/tracks.js. */
const Sound = (() => {
  'use strict';

  let ctx = null, master = null, comp = null, analyser = null, freqData = null;
  let sfxBus = null, sfxEcho = null, musicOut = null, musicFilter = null, musicBus = null, echo = null, noiseBuf = null;
  const noiseCache = new WeakMap();

  function getNoiseBuffer(ac, kind = 'white') {
    if (!ac) return null;
    let entry = noiseCache.get(ac);
    if (!entry) {
      entry = {};
      noiseCache.set(ac, entry);
    }
    if (entry[kind]) return entry[kind];
    const len = ac.sampleRate;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = clamp((b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11, -1, 1);
        b6 = w * 0.115926;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    entry[kind] = buf;
    return buf;
  }

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

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
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

  function nyquist() {
    return ctx ? Math.min(20000, ctx.sampleRate * 0.46) : 20000;
  }

  function safeHz(f) {
    const n = Number(f);
    if (!Number.isFinite(n)) return 440;
    return clamp(n, 20, nyquist());
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

      // Tempo-synced dotted-8th delay for synth leads, bells & arpeggios
      echo = ctx.createDelay(1.0);
      echo.delayTime.value = 0.27;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3800;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 260;
      const wet = ctx.createGain();
      wet.gain.value = 0.32;
      echo.connect(hp);
      hp.connect(lp);
      lp.connect(fb);
      fb.connect(echo);
      lp.connect(wet);
      wet.connect(musicFilter);

      // Cached 1-second white noise buffer per AudioContext
      noiseBuf = getNoiseBuffer(ctx, 'white');

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
    if (cfg.muted || cfg.track === 'off') stopMusic();
    else if (prevTrack !== cfg.track || prevMuted !== cfg.muted || prevLite !== cfg.lite || !timer) startMusic();
  }

  function setIntensity(tier) {
    const next = clamp(Math.round(Number(tier) || 0), 0, 4);
    if (next === intensity && ctx) return;
    intensity = next;
    if (ctx) applyGains();
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
    for (let i = 0; i < 8; i++) {
      const kt = kickQueue[i];
      if (kt > latestKick && kt <= nowT + 0.008) latestKick = kt;
    }

    let beat = 0;
    if (latestKick > 0 && nowT - latestKick < beatLen * 1.6) {
      const dt = Math.max(0, nowT - latestKick);
      beat = clamp(Math.pow(Math.max(0, 1 - dt / (beatLen * 0.85)), 2.2), 0, 1);
    } else if (timer && cfg.track !== 'off' && cfg.music > 0) {
      const ph = (((nowT - musicStartT) / beatLen) % 1 + 1) % 1;
      beat = clamp(Math.pow(1 - ph, 2.4) * 0.45 + bass * 0.35, 0, 1);
    } else {
      beat = clamp(bass * 0.8, 0, 1);
    }

    // Warm-up floor during the initial render quantum right after startMusic()
    if (timer && cfg.track !== 'off' && cfg.music > 0 && bass === 0 && mid === 0 && nowT - musicStartT < 0.08) {
      bass = 0.22 * cfg.music;
      mid = 0.16 * cfg.music;
      high = 0.1 * cfg.music;
    }

    const energy = clamp(bass * 0.44 + mid * 0.34 + high * 0.22, 0, 1);
    return { bass, mid, high, energy, beat, bpm };
  }

  // ---------- Synthesis Primitives ----------

  function tone(f, t, dur, o = {}) {
    if (!ctx) return;
    const t0 = Math.max(ctx.currentTime, Number(t) || ctx.currentTime);
    const d = Math.max(0.006, Number(dur) || 0.05);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(safeHz(f), t0);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
    if (o.glide) {
      const gt = Math.max(0.004, Number(o.glideT) || d);
      osc.frequency.exponentialRampToValueAtTime(safeHz(o.glide), t0 + gt);
    }
    const v = Math.max(0.0002, Number(o.vol == null ? 0.18 : o.vol) || 0.0002);
    const a = Math.max(0.001, Number(o.a == null ? 0.004 : o.a) || 0.004);
    const endT = t0 + Math.max(d, a + 0.005);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, endT);

    let node = osc;
    if (o.lp || o.hp) {
      const fl = ctx.createBiquadFilter();
      fl.type = o.hp ? 'highpass' : 'lowpass';
      const startF = safeHz(o.hp || o.lp);
      fl.frequency.setValueAtTime(startF, t0);
      if (o.lpEnd) fl.frequency.exponentialRampToValueAtTime(safeHz(o.lpEnd), endT);
      if (o.q) fl.Q.value = clamp(o.q, 0.2, 14);
      osc.connect(fl);
      node = fl;
    }
    node.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.send && echo) g.connect(echo);
    if (o.sfxSend && sfxEcho) g.connect(sfxEcho);
    osc.start(t0);
    osc.stop(endT + 0.025);
  }

  function supersaw(f, t, dur, o = {}) {
    if (!ctx) return;
    const t0 = Math.max(ctx.currentTime, Number(t) || ctx.currentTime);
    const d = Math.max(0.015, Number(dur) || 0.12);
    const hz = safeHz(f);
    const spread = o.spread || 16;
    const detunes = (o.voices === 2 || cfg.lite) ? [-spread * 0.7, spread * 0.7] : [-spread, 0, spread];
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    const cut = safeHz(o.lp || 6200);
    fl.frequency.setValueAtTime(cut, t0);
    if (o.lpEnd) fl.frequency.exponentialRampToValueAtTime(safeHz(o.lpEnd), t0 + d);
    fl.Q.value = clamp(o.q || 1.2, 0.3, 10);

    const g = ctx.createGain();
    const v = Math.max(0.0002, (Number(o.vol == null ? 0.08 : o.vol) || 0.05) / Math.sqrt(detunes.length));
    const a = Math.max(0.002, Number(o.a == null ? 0.006 : o.a) || 0.006);
    const endT = t0 + Math.max(d, a + 0.008);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    if (o.sustain && endT - t0 > a + 0.04) {
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v * o.sustain), t0 + a + (endT - t0 - a) * 0.55);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, endT);

    fl.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.send && echo) g.connect(echo);
    if (o.sfxSend && sfxEcho) g.connect(sfxEcho);

    const glideHz = o.glide ? safeHz(o.glide) : 0;
    const glideT = Math.max(0.005, Number(o.glideT) || d);
    for (let i = 0; i < detunes.length; i++) {
      const osc = ctx.createOscillator();
      osc.type = o.mixSquare && i === 1 ? 'square' : 'sawtooth';
      osc.frequency.setValueAtTime(hz, t0);
      osc.detune.setValueAtTime(detunes[i], t0);
      if (glideHz) osc.frequency.exponentialRampToValueAtTime(glideHz, t0 + glideT);
      osc.connect(fl);
      osc.start(t0);
      osc.stop(endT + 0.025);
    }
  }

  function chordStab(midis, t, dur, o = {}) {
    if (!ctx || !midis || !midis.length) return;
    const t0 = Math.max(ctx.currentTime, Number(t) || ctx.currentTime);
    const d = Math.max(0.02, Number(dur) || 0.18);
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    const cut = safeHz(o.lp || 4200);
    fl.frequency.setValueAtTime(cut, t0);
    if (o.lpEnd) fl.frequency.exponentialRampToValueAtTime(safeHz(o.lpEnd), t0 + d);
    fl.Q.value = clamp(o.q || 1.0, 0.3, 8);

    const g = ctx.createGain();
    const v = Math.max(0.0002, Number(o.vol == null ? 0.04 : o.vol) || 0.04);
    const a = Math.max(0.002, Number(o.a == null ? 0.008 : o.a) || 0.008);
    const endT = t0 + Math.max(d, a + 0.008);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, endT);

    fl.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.send && echo) g.connect(echo);
    if (o.sfxSend && sfxEcho) g.connect(sfxEcho);

    const wave = o.type || 'sawtooth';
    // lite: three voices are enough (the fourth note is usually the root an octave up)
    const nVoices = cfg.lite ? Math.min(3, midis.length) : midis.length;
    for (let i = 0; i < nVoices; i++) {
      const osc = ctx.createOscillator();
      osc.type = wave;
      osc.frequency.setValueAtTime(safeHz(mtof(midis[i])), t0);
      if (o.detune) osc.detune.setValueAtTime((i % 2 === 0 ? 1 : -1) * o.detune, t0);
      osc.connect(fl);
      osc.start(t0);
      osc.stop(endT + 0.025);
    }
  }

  function noise(t, dur, o = {}) {
    if (!ctx) return;
    const buf = getNoiseBuffer(ctx, o.kind === 'pink' ? 'pink' : 'white') || noiseBuf;
    if (!buf) return;
    const t0 = Math.max(ctx.currentTime, Number(t) || ctx.currentTime);
    const d = Math.max(0.006, Number(dur) || 0.04);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (o.rate) src.playbackRate.setValueAtTime(o.rate, t0);

    const f = ctx.createBiquadFilter();
    f.type = o.ft || 'bandpass';
    f.frequency.setValueAtTime(safeHz(o.f || 2200), t0);
    if (o.fEnd) f.frequency.exponentialRampToValueAtTime(safeHz(o.fEnd), t0 + d);
    f.Q.value = clamp(o.q || 1, 0.2, 14);

    const g = ctx.createGain();
    const v = Math.max(0.0002, Number(o.vol == null ? 0.1 : o.vol) || 0.0002);
    const a = Math.max(0.001, Number(o.a == null ? 0.002 : o.a) || 0.002);
    const endT = t0 + Math.max(d, a + 0.005);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, endT);

    src.connect(f);
    f.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.send && echo) g.connect(echo);
    if (o.sfxSend && sfxEcho) g.connect(sfxEcho);
    src.start(t0, Math.random() * 0.7);
    src.stop(endT + 0.02);
  }

  function bell(f, t, dur = 0.55, vol = 0.11, bus, send, sfxSend) {
    const hz = safeHz(f);
    tone(hz, t, dur, { vol, bus, send, sfxSend });
    if (hz * 2 < nyquist()) tone(hz * 2, t, dur * 0.58, { vol: vol * 0.36, bus, send, sfxSend });
    if (!cfg.lite && hz * 3.01 < nyquist()) tone(hz * 3.01, t, dur * 0.32, { vol: vol * 0.14, bus, send });
  }

  // ---------- Prism Futuristic Digital SFX Suite (js/audio/sfx.js) ----------

  const sfx = createSoundEffects({
    get ctx() { return ctx; },
    get sfxBus() { return sfxBus; },
    cfg, mtof, nowMs, safeHz, tone, supersaw, chordStab, noise, bell,
  });

  // ---------- 16th-Note Music Tracks Engine (tracks & phrases: js/audio/tracks.js) ----------

  const { TRACKS, buildPhrases } = MusicTracks;

  // ---------- Percussion & Bass Instruments ----------

  function kickDrive(t, bus, hard = false) {
    recordKick(t);
    tone(hard ? 195 : 170, t, hard ? 0.23 : 0.2, {
      vol: hard ? 0.36 : 0.33,
      glide: 45,
      glideT: hard ? 0.12 : 0.11,
      a: 0.002,
      bus
    });
    tone(1150, t, 0.022, { type: 'triangle', vol: 0.11, glide: 170, glideT: 0.018, a: 0.001, bus });
    if (!cfg.lite) noise(t, 0.016, { ft: 'highpass', f: 3500, vol: 0.05, a: 0.001, bus });
    if (hard) {
      tone(155, t, 0.15, {
        type: 'sawtooth', vol: 0.13, glide: 48, glideT: 0.11, lp: 380, lpEnd: 120, q: 2.0, bus
      });
    }
  }

  function kickSoft(t, bus) {
    recordKick(t);
    tone(130, t, 0.22, { vol: 0.31, glide: 45, glideT: 0.15, bus });
  }

  function snareDrive(t, vol, bus) {
    noise(t, 0.11, { ft: 'bandpass', f: 2300, q: 0.85, vol: cfg.lite ? vol * 1.15 : vol, a: 0.002, bus });
    if (!cfg.lite) noise(t + 0.01, 0.085, { ft: 'highpass', f: 4200, vol: vol * 0.55, a: 0.002, bus });
    tone(235, t, 0.075, { type: 'triangle', vol: vol * 0.85, glide: 125, glideT: 0.055, bus });
  }

  function snareSoft(t, v, bus) {
    noise(t, 0.12, { f: 1800, q: 0.7, vol: v, bus });
  }

  function hat(t, open, vol, bus) {
    noise(t, open ? 0.12 : 0.028, {
      ft: 'highpass',
      f: open ? 6800 : 8200,
      vol,
      a: 0.001,
      bus
    });
  }

  function pulseBass(midi, t, dur, bus, boost = 1) {
    const hz = mtof(midi);
    tone(hz, t, dur, {
      type: 'sawtooth',
      vol: 0.16 * boost,
      a: 0.003,
      lp: 2200 + intensity * 350,
      lpEnd: 240,
      q: 1.8,
      bus
    });
    tone(hz, t, dur * 0.9, { type: 'triangle', vol: 0.12 * boost, a: 0.003, bus });
  }

  function reeseBass(midi, t, dur, bus) {
    const hz = mtof(midi);
    supersaw(hz, t, dur, {
      voices: 2,
      spread: 15,
      vol: 0.16,
      a: 0.004,
      lp: 1900 + intensity * 400,
      lpEnd: 260,
      q: 2.3,
      bus
    });
    tone(hz, t, dur * 0.92, { type: 'sine', vol: 0.14, a: 0.003, bus });
  }

  // ---------- Step Scheduler (64-Step 16th-Note Bar Engine) ----------

  const ARP_UPDOWN = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2];
  const ARP_ZENITH = [0, 2, 1, 3, 0, 3, 2, 1, 0, 1, 2, 3, 3, 2, 1, 0];

  function schedChill(tr, st, t, e16, B) {
    const s16 = st % 16;
    const bar = Math.floor((st % 64) / 16);
    const ch = tr.chords[bar];
    const e8 = e16 * 2;

    if (s16 % 2 === 0) {
      const s = s16 >> 1;
      if (s === 0) {
        chordStab(ch, t, e8 * 8.1, {
          type: tr.musicbox ? 'sine' : 'triangle',
          vol: tr.musicbox ? 0.032 : 0.045,
          a: 0.25,
          lp: 1600 + intensity * 400,
          bus: B
        });
        tone(mtof(tr.bass[bar]), t, e8 * 3, { type: 'triangle', vol: 0.17, bus: B });
      }
      if (s === 4 && !tr.musicbox) {
        tone(mtof(tr.bass[bar] + (tr.drums === 'pop' ? 12 : 7)), t, e8 * 2, { type: 'triangle', vol: 0.12, bus: B });
      }
      if (tr.arp) {
        const m = ch[s % ch.length] + 12;
        if (tr.musicbox) bell(mtof(m), t, 0.6, 0.036, B, true);
        else tone(mtof(m), t, e8 * 0.8, { type: 'square', vol: 0.024, bus: B, lp: 2200 + intensity * 500 });
      }
      const phrase = phrases[(loopN % 4 === 3) ? 1 : 0];
      const step8 = ((st >> 1) % 32);
      const n = phrase[step8];
      if (n != null) {
        if (tr.lead === 'bell') bell(mtof(n), t, 0.8, 0.07, B, true);
        else tone(mtof(n), t, e8 * 1.5, { type: 'square', vol: 0.046, bus: B, lp: 2800 + intensity * 500, send: true });
      }
      if (tr.drums === 'lofi') {
        if (s === 0 || s === 5) kickSoft(t, B);
        if (s === 2 || s === 6) snareSoft(t, 0.055, B);
        hat(t, false, s % 2 ? 0.02 : 0.034, B);
      } else if (tr.drums === 'pop') {
        if (s === 0 || s === 4) kickSoft(t, B);
        if (s === 2 || s === 6) snareSoft(t, 0.075, B);
        if (s % 2 === 1) hat(t, intensity >= 3 && s === 3, 0.032, B);
      }
    } else if (intensity >= 2 && tr.arp && !tr.musicbox && s16 % 4 === 3) {
      const m = ch[(s16 >> 1) % ch.length] + 24;
      tone(mtof(m), t, e16 * 0.85, { type: 'triangle', vol: 0.022, bus: B, send: true });
    }
  }

  function schedElectronic(tr, st, t, e16, B) {
    const s64 = st % 64;
    const s16 = s64 % 16;
    const s4 = s16 % 4;
    const bar = (s64 / 16) | 0;
    const isTurnaround = bar === 3 && s16 >= 12;
    const ch = tr.chords[bar];
    const bRoot = tr.bass[bar];
    const style = tr.style;

    // 1. Drums & Percussion
    if (style === 'pulse') {
      if (s4 === 0 || (isTurnaround && s16 % 2 === 0)) kickDrive(t, B, false);
      if (s16 === 4 || s16 === 12) snareDrive(t, 0.11, B);
      else if (isTurnaround && s16 >= 13) snareDrive(t, 0.065 + (s16 - 12) * 0.015, B);
      if (s4 === 2) hat(t, true, 0.05 + intensity * 0.006, B);
      else hat(t, false, s4 % 2 === 0 ? 0.022 : 0.03, B);
    } else if (style === 'redline') {
      if (s4 === 0 || (bar === 1 && s16 === 14) || (isTurnaround && (s16 === 14 || s16 === 15))) {
        kickDrive(t, B, true);
      }
      if (s16 === 4 || s16 === 12) snareDrive(t, 0.125, B);
      else if ((bar % 2 === 1 && (s16 === 7 || s16 === 9)) || isTurnaround) {
        snareDrive(t, 0.068, B);
      }
      if (s4 === 2) hat(t, true, 0.055, B);
      else if (s16 % 2 === 1) hat(t, false, 0.032, B);
    } else if (style === 'horizon') {
      if (s4 === 0 || (bar === 3 && s16 === 14)) kickDrive(t, B, false);
      if (s16 === 4 || s16 === 12) snareDrive(t, 0.11, B);
      if (s4 === 2) hat(t, true, 0.048, B);
      else hat(t, false, 0.024, B);
    } else if (style === 'zenith') {
      if (s16 === 0 || s16 === 3 || s16 === 8 || s16 === 10 || (isTurnaround && s16 % 2 === 0)) {
        kickDrive(t, B, true);
      }
      if (s16 === 4 || s16 === 12) snareDrive(t, 0.12, B);
      else if (s16 === 7 || s16 === 9 || s16 === 15 || (isTurnaround && s16 >= 12)) {
        snareDrive(t, isTurnaround ? 0.085 : 0.058, B);
      }
      hat(t, s4 === 2, s4 === 2 ? 0.05 : 0.028, B);
    }

    // Offbeat metallic ride ping at higher combo tiers (BOOST / BLITZ / APEX)
    if (intensity >= 2 && s4 === 2) {
      tone(5400, t, 0.055, { type: 'sine', vol: 0.012 + intensity * 0.004, bus: B });
    }

    // 2. Driving Bassline
    if (style === 'pulse') {
      if (s4 === 2) pulseBass(bRoot + 12, t, e16 * 1.65, B, 1.08);
      else if (s4 === 1 || s4 === 3) pulseBass(s4 === 3 ? bRoot + 12 : bRoot, t, e16 * 0.85, B, 0.78);
    } else if (style === 'redline') {
      if (s4 === 2) reeseBass(bRoot, t, e16 * 1.8, B);
      else if (s4 === 3 && (s16 === 7 || s16 === 15 || intensity >= 2)) reeseBass(bRoot + 12, t, e16 * 0.9, B);
    } else if (style === 'horizon') {
      if (s4 === 0) pulseBass(bRoot, t, e16 * 1.4, B, 0.9);
      else if (s4 === 2) pulseBass(bRoot + 12, t, e16 * 1.6, B, 1.05);
      else if (s4 === 3) pulseBass(bRoot, t, e16 * 0.85, B, 0.72);
    } else if (style === 'zenith') {
      if (s16 === 0 || s16 === 6 || s16 === 10) reeseBass(bRoot, t, e16 * 2.4, B);
      else if (s16 === 3 || s16 === 14) reeseBass(bRoot + 12, t, e16 * 1.5, B);
    }

    // 3. Rhythmic Chords & Synth Stabs
    if (style === 'pulse') {
      if (s4 === 2) {
        chordStab(ch, t, e16 * 1.9, {
          type: 'sawtooth', detune: 14, vol: 0.042, a: 0.012, lp: 4600 + intensity * 700, lpEnd: 1900, bus: B
        });
      }
    } else if (style === 'redline') {
      if (s16 === 0 || s16 === 3 || s16 === 6 || s16 === 10 || s16 === 14) {
        chordStab(ch, t, e16 * 1.45, {
          type: 'sawtooth', detune: 18, vol: 0.048, a: 0.004, lp: 5400 + intensity * 600, lpEnd: 1600, bus: B, send: s16 === 14
        });
      }
    } else if (style === 'horizon') {
      if (s16 === 0 || s16 === 3 || s16 === 6 || s16 === 8 || s16 === 11 || s16 === 14) {
        chordStab(ch, t, e16 * 1.4, {
          type: 'sawtooth', detune: 12, vol: 0.044, a: 0.005, lp: 5000 + intensity * 650, lpEnd: 1800, bus: B, send: true
        });
      }
    } else if (style === 'zenith') {
      if (s16 === 0 || s16 === 8) {
        chordStab(ch, t, e16 * 7.5, {
          type: 'sawtooth', detune: 15, vol: 0.036, a: 0.03, lp: 4200 + intensity * 700, lpEnd: 1800, bus: B
        });
      }
    }

    // 4. 16th-Note Prism Arpeggios + Dynamic Combo Layering
    if (style === 'pulse' || style === 'zenith' || intensity >= 2) {
      const pat = style === 'zenith' ? ARP_ZENITH : ARP_UPDOWN;
      const arpNote = ch[pat[s16] % ch.length] + (s16 % 4 === 3 && intensity >= 2 ? 24 : 12);
      if (style === 'zenith') {
        bell(mtof(arpNote + 12), t, e16 * 2.2, 0.032 + intensity * 0.004, B, s16 % 2 === 0);
      } else {
        tone(mtof(arpNote + 12), t, e16 * 0.85, {
          type: 'sawtooth',
          vol: (style === 'pulse' ? 0.028 : 0.02) + intensity * 0.004,
          lp: 4500 + intensity * 900,
          lpEnd: 1400,
          bus: B,
          send: s16 % 3 === 0
        });
      }
    }

    // Tier 3-4 BLITZ / APEX: High crystalline 16th counter-arpeggio
    if (intensity >= 3 && s16 % 2 === 1) {
      const hiMidi = Math.min(98, ch[(s16 >> 1) % ch.length] + 36);
      tone(mtof(hiMidi), t, e16 * 0.75, {
        type: 'triangle',
        vol: intensity === 4 ? 0.028 : 0.018,
        bus: B,
        send: s16 % 4 === 3
      });
    }

    // 5. Lead Melody
    const useVar = (loopN % 2 === 1);
    const phrase = phrases[useVar ? 1 : 0];
    const leadMidi = phrase[s64];
    if (leadMidi != null) {
      let hold = 1;
      while (hold < 4 && (s16 + hold) < 16 && phrase[(s64 + hold) % 64] == null) hold++;
      const dur = e16 * (hold * 0.92);
      const hz = mtof(leadMidi);

      if (style === 'pulse') {
        supersaw(hz, t, dur, {
          spread: 17, vol: 0.072, a: 0.005, sustain: 0.72,
          lp: 6800 + intensity * 800, lpEnd: 2800, bus: B, send: true
        });
        if (intensity >= 4) {
          tone(safeHz(hz * 2), t, dur * 0.8, { type: 'sawtooth', vol: 0.022, lp: 8500, bus: B, send: true });
        }
      } else if (style === 'redline') {
        supersaw(hz, t, dur, {
          mixSquare: true, spread: 20, vol: 0.076, a: 0.003, sustain: 0.68,
          lp: 7400 + intensity * 800, lpEnd: 2400, q: 1.8, bus: B, send: true
        });
      } else if (style === 'horizon') {
        tone(safeHz(hz * 1.035), t, dur, {
          type: 'square', glide: hz, glideT: 0.014, vol: 0.048,
          lp: 6200 + intensity * 700, lpEnd: 2400, bus: B, send: true
        });
        tone(hz, t, dur, {
          type: 'sawtooth', detune: 11, vol: 0.045,
          lp: 6800 + intensity * 700, lpEnd: 2600, bus: B, send: true
        });
      } else if (style === 'zenith') {
        bell(hz, t, Math.max(dur, 0.24), 0.06, B, true);
        supersaw(hz, t, dur, {
          spread: 16, vol: 0.064, a: 0.004, sustain: 0.7,
          lp: 7200 + intensity * 800, lpEnd: 3000, bus: B, send: true
        });
      }
    }
  }

  function sched(st, t) {
    const tr = activeTrack();
    if (!tr || !musicBus) return;
    const e16 = 60 / tr.bpm / 4;
    if (tr.style === 'chill') schedChill(tr, st, t, e16, musicBus);
    else schedElectronic(tr, st, t, e16, musicBus);
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

  function startMusic() {
    stopMusic();
    const tr = activeTrack();
    if (!ctx || cfg.muted || !tr) return;
    clearKicks();
    musicBus = ctx.createGain();
    musicBus.connect(musicFilter || musicOut);
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

  function stopMusic() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
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
    TRACKS
  };
})();
