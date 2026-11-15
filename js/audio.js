/* Slopitaire // PRISM audio — futuristic digital Web Audio synthesizer, dynamic combo layering & spectrum telemetry. */
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

  const cfg = { muted: false, sfx: 0.7, music: 0.5, track: 'pulse' };
  let timer = null, nextT = 0, step = 0, phrases = null, loopN = 0, ducked = false;
  let intensity = 0, musicStartT = 0, lastHoverMs = 0, lastCardHoverMs = 0;
  let lastPopupMs = 0, lastBadgeMs = 0, lastBannerMs = 0, lastStampMs = 0;

  // Preallocated ring buffer of scheduled kick timestamps for zero-alloc beat telemetry
  const kickQueue = new Float64Array(8);
  let kickWrite = 0, lastKickT = 0;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
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

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();

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
    if (ctx.state === 'suspended') ctx.resume();
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
    const prevTrack = cfg.track, prevMuted = cfg.muted;
    Object.assign(cfg, o);
    if (!ctx) return;
    applyGains();
    if (cfg.muted || cfg.track === 'off') stopMusic();
    else if (prevTrack !== cfg.track || prevMuted !== cfg.muted || !timer) startMusic();
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
    const detunes = o.voices === 2 ? [-spread * 0.7, spread * 0.7] : [-spread, 0, spread];
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
    for (let i = 0; i < midis.length; i++) {
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
    if (hz * 3.01 < nyquist()) tone(hz * 3.01, t, dur * 0.32, { vol: vol * 0.14, bus, send });
  }

  // ---------- Prism Futuristic Digital SFX Suite (40+ SFX) ----------

  const ok = () => !!(ctx && ctx.state === 'running' && !cfg.muted && cfg.sfx > 0);
  const now = () => ctx.currentTime + 0.004;
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
  const PARTNER_SEMI = {
    sakura: 0, yuki: 2, rin: -1, mio: 4, ayame: -3, kira: -5, kaede: -2, mochi: 5
  };
  const partnerSemi = (p) => PARTNER_SEMI[String(p || 'sakura').toLowerCase()] || 0;
  const AUTO_SCALE = [
    65, 67, 69, 72, 74, 77, 79, 81, 84, 86, 89, 91,
    93, 96, 98, 100, 101, 103, 105, 108
  ];

  const sfx = {
    flip() {
      if (!ok()) return;
      const t = now();
      noise(t, 0.055, { f: 3800, fEnd: 5600, q: 0.9, vol: 0.15 });
      tone(1450, t, 0.055, { type: 'triangle', vol: 0.065, glide: 2550 });
      tone(2900, t + 0.012, 0.04, { type: 'sine', vol: 0.03, glide: 4100 });
    },

    pick() {
      if (!ok()) return;
      const t = now();
      tone(700, t, 0.068, { type: 'triangle', vol: 0.11, glide: 1250 });
      tone(1400, t + 0.006, 0.048, { type: 'sine', vol: 0.045, glide: 2500 });
    },

    place(combo = 0) {
      if (!ok()) return;
      const t = now();
      const cb = clamp(Math.round(Number(combo) || 0), 0, 24);
      // Punchy tactile tap transient + pitch-shifted prism synth note
      tone(460, t, 0.085, { vol: 0.2, glide: 145, glideT: 0.055 });
      noise(t, 0.034, { ft: 'bandpass', f: 2400 + cb * 70, q: 1.1, vol: 0.12 });
      const hz = mtof(64 + cb);
      tone(hz, t, 0.12, { type: 'triangle', vol: 0.11, a: 0.002 });
      tone(hz * 2, t + 0.005, 0.09, {
        type: 'sawtooth',
        vol: 0.03 + cb * 0.0016,
        lp: 3200 + cb * 220,
        lpEnd: 1100,
        sfxSend: cb >= 5
      });
    },

    draw() {
      if (!ok()) return;
      const t = now();
      noise(t, 0.085, { f: 2500, fEnd: 4600, q: 0.75, vol: 0.12, a: 0.012 });
      tone(680, t, 0.065, { type: 'triangle', vol: 0.055, glide: 1480 });
      tone(2350, t + 0.022, 0.028, { type: 'sine', vol: 0.04 });
    },

    foundation(rank = 1, combo = 0) {
      if (!ok()) return;
      const t = now();
      const r = clamp((rank | 0) || 1, 1, 13);
      const cb = clamp(Math.round(Number(combo) || 0), 0, 24);
      const m = Math.min(94, 69 + PENTA[r - 1] + ((cb / 4) | 0));
      // Shimmering prism chord hit + ascending crystalline synth bell
      noise(t, 0.05, { ft: 'highpass', f: 7200, vol: 0.075 });
      chordStab([m - 12, m - 5, m, m + 4], t, 0.22, {
        type: 'sawtooth', detune: 11, vol: 0.05, lp: 5800, lpEnd: 1800, sfxSend: true
      });
      bell(mtof(m), t, 0.46, 0.12, sfxBus, false, true);
      bell(mtof(m + 7), t + 0.045, 0.36, 0.075, sfxBus, false, true);
      bell(mtof(m + 12), t + 0.09, 0.34, 0.065, sfxBus, false, true);
    },

    comboMilestone(tier = 1) {
      if (!ok()) return;
      const t = now();
      const tr = clamp(Math.round(Number(tier) || 1), 1, 4);
      const roots = [65, 68, 72, 77]; // Escalates across SURGE, BOOST, BLITZ, APEX!
      const root = roots[tr - 1];
      supersaw(260 + tr * 55, t, 0.16, {
        glide: 1350 + tr * 480, glideT: 0.15, vol: 0.09, lp: 7500, spread: 18, sfxSend: true
      });
      noise(t, 0.15, { ft: 'bandpass', f: 1400, fEnd: 6800, q: 1.6, vol: 0.09, a: 0.04 });
      const hitT = t + 0.11;
      tone(160, hitT, 0.22, { vol: 0.24, glide: 44, glideT: 0.14 });
      const chord = tr >= 3
        ? [root, root + 7, root + 12, root + 16, root + 19]
        : [root, root + 7, root + 12, root + 16];
      chordStab(chord, hitT, 0.34 + tr * 0.06, {
        type: 'sawtooth', detune: 14 + tr * 2, vol: 0.075, lp: 8500, lpEnd: 2200, sfxSend: true
      });
      for (let i = 0; i < tr + 1; i++) {
        bell(mtof(root + 12 + PENTA[i * 2]), hitT + i * 0.042, 0.36, 0.08, sfxBus, false, true);
      }
    },

    comboBreak(lost = 5) {
      if (!ok()) return;
      const t = now();
      const sev = clamp((Number(lost) || 5) / 20, 0.25, 1.2);
      // Filter power-down sweep when a high combo drops
      supersaw(340 + sev * 60, t, 0.38, {
        glide: 54, glideT: 0.35, vol: 0.13, lp: 3200, lpEnd: 130, q: 2.4, spread: 22
      });
      tone(220, t, 0.32, { type: 'sawtooth', vol: 0.1, glide: 48, lp: 900, lpEnd: 110 });
      noise(t, 0.14, { ft: 'bandpass', f: 1500, fEnd: 320, q: 1.5, vol: 0.11 });
    },

    cutin() {
      if (!ok()) return;
      const t = now();
      // Anime prism-slash whoosh + sub-bass impact + crystal chime
      noise(t, 0.17, { ft: 'bandpass', f: 5200, fEnd: 850, q: 1.3, vol: 0.17, a: 0.005 });
      supersaw(2400, t, 0.1, { glide: 380, glideT: 0.09, vol: 0.09, lp: 9000, spread: 14 });
      tone(145, t + 0.02, 0.28, { vol: 0.26, glide: 38, glideT: 0.2 });
      bell(mtof(84), t + 0.04, 0.42, 0.1, sfxBus, false, true);
      bell(mtof(91), t + 0.085, 0.45, 0.095, sfxBus, false, true);
      bell(mtof(96), t + 0.13, 0.52, 0.09, sfxBus, false, true);
    },

    hover() {
      if (!ok()) return;
      const ms = nowMs();
      if (ms - lastHoverMs < 45) return;
      lastHoverMs = ms;
      const t = now();
      tone(1900, t, 0.018, { type: 'triangle', vol: 0.032, glide: 2550, a: 0.002 });
    },

    cardHover() {
      if (!ok()) return;
      const ms = nowMs();
      if (ms - lastCardHoverMs < 55) return;
      lastCardHoverMs = ms;
      const t = now();
      // Silky 12ms (<15ms) micro-tick for hovering face-up cards
      tone(2250, t, 0.012, { type: 'sine', vol: 0.024, glide: 2850, a: 0.0015 });
    },

    multiPick(count = 2) {
      if (!ok()) return;
      const t = now();
      const n = clamp((count | 0) || 2, 2, 13);
      const voices = Math.min(4, n);
      const steps = [0, 4, 7, 11];
      noise(t, 0.025, { ft: 'highpass', f: 4200, vol: 0.05 });
      for (let i = 0; i < voices; i++) {
        const hz = mtof(67 + Math.min(8, n - 2) + steps[i]);
        tone(hz, t + i * 0.012, 0.075, {
          type: 'triangle', vol: 0.075 / Math.sqrt(voices), glide: hz * 1.12
        });
      }
    },

    multiPlace(count = 2, combo = 0) {
      if (!ok()) return;
      const t = now();
      const n = clamp((count | 0) || 2, 2, 13);
      const cb = clamp(Math.round(Number(combo) || 0), 0, 24);
      const taps = Math.min(n, 7);
      for (let i = 0; i < taps; i++) {
        const st = t + i * 0.018;
        const m = Math.min(96, 62 + cb + i * 2);
        noise(st, 0.022, { ft: 'bandpass', f: 2400 + i * 280, q: 1.2, vol: 0.08 });
        tone(mtof(m), st, 0.075, {
          type: 'triangle', vol: 0.085, a: 0.002, sfxSend: i === taps - 1 && cb >= 4
        });
      }
      tone(420, t, 0.08, { vol: 0.16, glide: 140, glideT: 0.055 });
    },

    revealCard(rank = 1) {
      if (!ok()) return;
      const t = now();
      const r = clamp((rank | 0) || 1, 1, 13);
      const m = Math.min(92, 71 + PENTA[r - 1]);
      // Crystalline data-decrypt shimmer scaled by revealed card rank
      noise(t, 0.045, { f: 4200, fEnd: 6800, q: 1.1, vol: 0.09 });
      tone(mtof(m - 5), t, 0.07, { type: 'triangle', vol: 0.06 });
      bell(mtof(m), t + 0.024, 0.24, 0.075, sfxBus, false, true);
      bell(mtof(m + 7), t + 0.048, 0.28, 0.06, sfxBus, false, true);
    },

    kingLock() {
      if (!ok()) return;
      const t = now();
      // Deep bass servo-lock + authoritative metallic fifth chime
      tone(190, t, 0.19, { vol: 0.24, glide: 48, glideT: 0.14 });
      tone(260, t + 0.028, 0.12, { type: 'sawtooth', vol: 0.1, glide: 130, lp: 1200, lpEnd: 280 });
      noise(t + 0.02, 0.04, { ft: 'bandpass', f: 1800, q: 1.8, vol: 0.1 });
      bell(mtof(67), t + 0.035, 0.38, 0.095, sfxBus, false, true);
      bell(mtof(74), t + 0.065, 0.42, 0.085, sfxBus, false, true);
    },

    aceIgnition() {
      if (!ok()) return;
      const t = now();
      // Bright upward prism-spark ignition for foundation Ace
      noise(t, 0.07, { ft: 'highpass', f: 6500, vol: 0.09 });
      supersaw(587.3, t, 0.16, { glide: 2349.3, glideT: 0.15, vol: 0.075, lp: 8500, spread: 14, sfxSend: true });
      [79, 84, 88, 96].forEach((m, i) => {
        bell(mtof(m), t + i * 0.028, 0.34, 0.085, sfxBus, false, true);
      });
    },

    comboTick(combo = 1) {
      if (!ok()) return;
      const t = now();
      const cb = clamp(Math.round(Number(combo) || 1), 1, 32);
      const hz = mtof(69 + cb * 0.75);
      tone(hz, t, 0.07, { type: 'sine', vol: 0.055, a: 0.002 });
      tone(safeHz(hz * 2), t + 0.008, 0.05, { type: 'triangle', vol: 0.025 });
    },

    comboSave() {
      if (!ok()) return;
      const t = now();
      // Relieved upward dual-chime when rescuing a nearly-expired combo
      noise(t, 0.08, { ft: 'bandpass', f: 2200, fEnd: 5400, q: 1.2, vol: 0.065, a: 0.015 });
      bell(mtof(76), t, 0.24, 0.09, sfxBus, false, true);
      bell(mtof(81), t + 0.055, 0.3, 0.1, sfxBus, false, true);
      tone(mtof(88), t + 0.095, 0.16, { type: 'sine', vol: 0.055, sfxSend: true });
    },

    drawTriple() {
      if (!ok()) return;
      const t = now();
      // Crisp rapid 3-tap card fan for Draw-3 mode
      for (let i = 0; i < 3; i++) {
        const st = t + i * 0.042;
        noise(st, 0.048, { f: 2600 + i * 650, fEnd: 4600 + i * 500, q: 0.9, vol: 0.11 });
        tone(820 + i * 240, st, 0.042, { type: 'triangle', vol: 0.05, glide: 1220 + i * 280 });
      }
    },

    stockEmpty() {
      if (!ok()) return;
      const t = now();
      tone(420, t, 0.065, { type: 'sine', vol: 0.09, glide: 250 });
      noise(t, 0.03, { ft: 'bandpass', f: 950, q: 2.2, vol: 0.07 });
    },

    modalOpen() {
      if (!ok()) return;
      const t = now();
      noise(t, 0.13, { ft: 'bandpass', f: 950, fEnd: 3800, q: 1.1, vol: 0.07, a: 0.025 });
      tone(587.3, t, 0.12, { type: 'triangle', vol: 0.065, glide: 880, a: 0.012, sfxSend: true });
      tone(1174.7, t + 0.035, 0.09, { type: 'sine', vol: 0.04, glide: 1760 });
    },

    modalClose() {
      if (!ok()) return;
      const t = now();
      noise(t, 0.11, { ft: 'bandpass', f: 3400, fEnd: 780, q: 1.1, vol: 0.065, a: 0.015 });
      tone(880, t, 0.11, { type: 'triangle', vol: 0.06, glide: 523.25, a: 0.008 });
    },

    toggleOn() {
      if (!ok()) return;
      const t = now();
      tone(987.8, t, 0.04, { type: 'triangle', vol: 0.07 });
      tone(1318.5, t + 0.032, 0.06, { type: 'sine', vol: 0.08, glide: 1480 });
    },

    toggleOff() {
      if (!ok()) return;
      const t = now();
      tone(1174.7, t, 0.04, { type: 'triangle', vol: 0.065 });
      tone(784, t + 0.032, 0.06, { type: 'sine', vol: 0.07, glide: 698.5 });
    },

    partnerSelect(key = 'sakura') {
      if (!ok()) return;
      const t = now();
      const k = String(key || 'sakura').toLowerCase();
      if (k === 'yuki') {
        // Icy crystalline fifth + glass octave shimmer
        [76, 83, 88].forEach((m, i) => {
          bell(mtof(m), t + i * 0.055, 0.42, 0.09, sfxBus, false, true);
        });
      } else if (k === 'rin') {
        // Syncopated energetic synth pluck
        const notes = [74, 77, 81, 86];
        const offs = [0, 0.045, 0.105, 0.15];
        for (let i = 0; i < 4; i++) {
          supersaw(mtof(notes[i]), t + offs[i], 0.11, {
            voices: 2, spread: 12, vol: 0.08, lp: 5800, lpEnd: 1600, sfxSend: i === 3
          });
        }
      } else if (k === 'mio') {
        // Shy Dandere: delicate pastel celesta / music-box Gmaj9 twinkle
        [79, 83, 86, 91, 95].forEach((m, i) => {
          const nt = t + i * 0.036;
          bell(mtof(m), nt, 0.4, 0.072, sfxBus, false, i >= 3);
        });
      } else if (k === 'ayame') {
        // Devoted Yandere: hypnotic velvet minor-major-7th harp (A-C-E-G#-C)
        [69, 72, 76, 80, 84].forEach((m, i) => {
          const nt = t + i * 0.048;
          tone(mtof(m), nt, 0.34, { type: 'triangle', vol: 0.075, lp: 2800, a: 0.004 });
          bell(mtof(m), nt, 0.44, 0.068, sfxBus, false, i >= 3);
        });
      } else if (k === 'kira') {
        // Cool Hacker with Aura: deep sub-bass pulse + cyber harmonic glitch lock
        tone(155, t, 0.22, { vol: 0.22, glide: 46, glideT: 0.16 });
        [72, 84, 79, 91].forEach((m, i) => {
          const nt = t + i * 0.028;
          tone(mtof(m), nt, 0.065, { type: 'square', vol: 0.048, lp: 5400, lpEnd: 1800 });
        });
        chordStab([67, 74, 81, 86], t + 0.09, 0.28, {
          type: 'sawtooth', detune: 12, vol: 0.06, lp: 6800, lpEnd: 2200, sfxSend: true
        });
      } else if (k === 'kaede') {
        // Warm Onee-san: soothing Rhodes Fmaj7 chord bloom + tender golden bells
        chordStab([65, 69, 72, 76], t, 0.42, {
          type: 'triangle', detune: 6, vol: 0.065, a: 0.018, lp: 2400, sfxSend: true
        });
        [77, 81, 84].forEach((m, i) => {
          bell(mtof(m), t + 0.025 + i * 0.058, 0.44, 0.078, sfxBus, false, true);
        });
      } else if (k === 'mochi') {
        // Playful mini nya-chime
        tone(640, t, 0.12, { type: 'sawtooth', vol: 0.075, glide: 980, glideT: 0.06, lp: 2200 });
        bell(mtof(86), t + 0.06, 0.3, 0.09, sfxBus, false, true);
        bell(mtof(91), t + 0.11, 0.34, 0.08, sfxBus, false, true);
      } else {
        // Sakura: bright warm major-9th bell cascade
        [72, 76, 79, 86].forEach((m, i) => {
          bell(mtof(m), t + i * 0.042, 0.36, 0.09, sfxBus, false, true);
        });
      }
    },

    petGirl(key = 'sakura') {
      if (!ok()) return;
      const t = now();
      const k = String(key || 'sakura').toLowerCase();
      if (k === 'mio') {
        // Shy flustered celesta flutter-blush
        tone(740, t, 0.04, { type: 'sine', vol: 0.068, glide: 1480, a: 0.002 });
        [88, 91, 95].forEach((m, i) => {
          bell(mtof(m), t + 0.024 + i * 0.032, 0.24, 0.068, sfxBus, false, i === 2);
        });
      } else if (k === 'ayame') {
        // Devoted double-heartbeat pulse + velvet minor-major chime
        tone(175, t, 0.075, { vol: 0.14, glide: 64, glideT: 0.06 });
        tone(185, t + 0.085, 0.085, { vol: 0.12, glide: 62, glideT: 0.065 });
        bell(mtof(80), t + 0.03, 0.28, 0.075, sfxBus, false, true);
        bell(mtof(84), t + 0.085, 0.34, 0.08, sfxBus, false, true);
      } else if (k === 'kira') {
        // Cool hacker aura visor blip + emerald fifth shimmer
        tone(920, t, 0.036, { type: 'square', vol: 0.048, glide: 1840, lp: 5200 });
        bell(mtof(79), t + 0.026, 0.24, 0.078, sfxBus, false, false);
        bell(mtof(86), t + 0.065, 0.3, 0.082, sfxBus, false, true);
      } else if (k === 'kaede') {
        // Warm comforting Rhodes headpat chord + gentle bell embrace
        chordStab([65, 69, 72, 76], t, 0.28, { type: 'triangle', vol: 0.048, a: 0.012, lp: 2200 });
        bell(mtof(81), t + 0.03, 0.28, 0.075, sfxBus, false, true);
        bell(mtof(88), t + 0.08, 0.34, 0.08, sfxBus, false, true);
      } else {
        const pair = k === 'yuki' ? [83, 90] : k === 'rin' ? [81, 86] : k === 'mochi' ? [86, 91] : [84, 88];
        tone(540, t, 0.048, { type: 'sine', vol: 0.085, glide: 1240, a: 0.002 });
        bell(mtof(pair[0]), t + 0.03, 0.24, 0.08, sfxBus, false, true);
        bell(mtof(pair[1]), t + 0.075, 0.3, 0.085, sfxBus, false, true);
      }
    },

    touchHead(partner = 'sakura') {
      if (!ok()) return;
      const t = now();
      const s = partnerSemi(partner);
      // Soft warm velvet dual-chime pat-pat (撫で撫で)
      for (let i = 0; i < 2; i++) {
        const pt = t + i * 0.115;
        noise(pt, 0.068, { ft: 'lowpass', f: 1100, fEnd: 580, q: 0.8, vol: 0.05, a: 0.014 });
        const m = (i === 0 ? 76 : 81) + s;
        tone(mtof(m), pt, 0.22, { type: 'triangle', vol: 0.068, a: 0.012, lp: 2400 });
        bell(mtof(m), pt + 0.008, 0.32, 0.072, sfxBus, false, i === 1);
      }
      if (String(partner || '').toLowerCase() === 'mochi') {
        tone(120, t + 0.03, 0.24, { type: 'sawtooth', vol: 0.045, glide: 135, lp: 320 });
      }
    },

    touchFace(partner = 'sakura') {
      if (!ok()) return;
      const t = now();
      const s = partnerSemi(partner);
      const mul = Math.pow(2, s / 24);
      // Cute elastic pitch-bent cheek-poke boop! blip
      tone(390 * mul, t, 0.052, { type: 'sine', vol: 0.1, glide: 980 * mul, a: 0.002 });
      tone(760 * mul, t + 0.044, 0.068, { type: 'triangle', vol: 0.085, glide: 1380 * mul, a: 0.002 });
      bell(mtof(Math.min(98, 91 + s)), t + 0.055, 0.2, 0.065, sfxBus, false, true);
    },

    touchHands(partner = 'sakura') {
      if (!ok()) return;
      const t = now();
      const s = partnerSemi(partner);
      // Crisp harmonic prism high-five / link chord
      noise(t, 0.032, { ft: 'bandpass', f: 2950, q: 1.1, vol: 0.095 });
      tone(350, t, 0.048, { vol: 0.12, glide: 165, glideT: 0.038 });
      chordStab([67 + s, 74 + s, 79 + s, 83 + s], t + 0.012, 0.26, {
        type: 'sawtooth', detune: 11, vol: 0.06, lp: 6400, lpEnd: 2200, sfxSend: true
      });
      bell(mtof(83 + s), t + 0.02, 0.28, 0.08, sfxBus, false, false);
      bell(mtof(Math.min(98, 91 + s)), t + 0.062, 0.34, 0.085, sfxBus, false, true);
    },

    touchTorso(partner = 'sakura') {
      if (!ok()) return;
      const t = now();
      const s = partnerSemi(partner);
      // Anime flustered doki-doki! double-pulse + sparkly blush flourish
      tone(168, t, 0.078, { vol: 0.18, glide: 56, glideT: 0.062 });
      tone(188, t + 0.105, 0.088, { vol: 0.19, glide: 60, glideT: 0.07 });
      noise(t + 0.04, 0.13, { ft: 'highpass', f: 5200, vol: 0.048, a: 0.02 });
      [79, 83, 86, 90, 95].forEach((m, i) => {
        const nt = t + 0.05 + i * 0.026;
        bell(mtof(Math.min(100, m + s)), nt, 0.24, 0.068, sfxBus, false, i >= 3);
      });
    },

    touchLegs(partner = 'sakura') {
      if (!ok()) return;
      const t = now();
      const s = partnerSemi(partner);
      const mul = Math.pow(2, s / 24);
      // Comedic anime startled upward snap-whistle (びくっ!)
      noise(t, 0.028, { ft: 'bandpass', f: 3600, q: 1.4, vol: 0.11 });
      tone(520 * mul, t, 0.115, { type: 'triangle', vol: 0.105, glide: 2480 * mul, glideT: 0.105, a: 0.002 });
      tone(1040 * mul, t + 0.01, 0.1, { type: 'sine', vol: 0.055, glide: 3600 * mul, glideT: 0.095 });
      bell(mtof(Math.min(100, 95 + Math.min(3, s))), t + 0.112, 0.18, 0.08, sfxBus, false, true);
    },

    halfway() {
      if (!ok()) return;
      const t = now();
      // Uplifting midpoint progress chime (26/52 foundation cards)
      tone(165, t, 0.18, { vol: 0.18, glide: 55, glideT: 0.13 });
      [69, 73, 76, 81].forEach((m, i) => {
        const nt = t + i * 0.05;
        bell(mtof(m), nt, 0.34, 0.085, sfxBus, false, true);
        tone(mtof(m), nt, 0.12, { type: 'triangle', vol: 0.05 });
      });
    },

    almostWon() {
      if (!ok()) return;
      const t = now();
      // Exciting climax shimmer (44/52 foundation cards)
      noise(t, 0.14, { ft: 'bandpass', f: 1800, fEnd: 6400, q: 1.3, vol: 0.08, a: 0.03 });
      [74, 78, 81, 86, 90, 93].forEach((m, i) => {
        const nt = t + i * 0.042;
        supersaw(mtof(m), nt, 0.14, { voices: 2, spread: 13, vol: 0.06, lp: 7200, sfxSend: i >= 4 });
        bell(mtof(m), nt, 0.32, 0.075, sfxBus, false, true);
      });
    },

    newRecord() {
      if (!ok()) return;
      const t = now();
      // Golden prism Lydian arpeggio burst on setting a new record
      chordStab([60, 67, 72, 76, 83], t, 0.45, {
        type: 'sawtooth', detune: 14, vol: 0.065, lp: 8200, lpEnd: 2600, sfxSend: true
      });
      [72, 76, 79, 83, 86, 90, 96].forEach((m, i) => {
        bell(mtof(m), t + i * 0.045, 0.42, 0.09, sfxBus, false, true);
      });
    },

    popupScore(mult = 1) {
      if (!ok()) return;
      const ms = nowMs();
      if (ms - lastPopupMs < 30) return;
      lastPopupMs = ms;
      const t = now() + 0.018;
      const mVal = clamp(Number(mult) || 1, 1, 4);
      const semi = clamp(Math.round((mVal - 1) * 6), 0, 14);
      const hz = mtof(88 + semi);
      // Lightweight crystalline upper-register score twinkle (non-fatiguing)
      tone(hz, t, 0.042, { type: 'sine', vol: 0.036, a: 0.002 });
      if (mVal >= 1.5) {
        tone(safeHz(hz * 1.25), t + 0.024, 0.055, { type: 'triangle', vol: 0.03, a: 0.002, sfxSend: mVal >= 2 });
      }
    },

    badgeUnlock() {
      if (!ok()) return;
      const ms = nowMs();
      if (ms - lastBadgeMs < 65) return;
      lastBadgeMs = ms;
      const t = now();
      // Glassy futuristic accolade / medal unlock triad
      [79, 83, 86, 91].forEach((m, i) => {
        const nt = t + i * 0.026;
        bell(mtof(m), nt, 0.22, 0.052, sfxBus, false, i === 3);
      });
    },

    bannerSlam() {
      if (!ok()) return;
      const ms = nowMs();
      if (ms - lastBannerMs < 80) return;
      lastBannerMs = ms;
      const t = now();
      // Kinetic sub-HUD callout banner wipe + crisp fifth lock
      tone(155, t, 0.11, { vol: 0.13, glide: 54, glideT: 0.085 });
      noise(t, 0.065, { ft: 'bandpass', f: 3400, fEnd: 1350, q: 1.2, vol: 0.062, a: 0.003 });
      tone(mtof(74), t + 0.01, 0.12, { type: 'triangle', vol: 0.048, sfxSend: true });
      tone(mtof(81), t + 0.028, 0.14, { type: 'sine', vol: 0.045, sfxSend: true });
    },

    reactStamp() {
      if (!ok()) return;
      const ms = nowMs();
      if (ms - lastStampMs < 70) return;
      lastStampMs = ms;
      const t = now();
      // Playful holographic companion reaction stamp pop
      tone(680, t, 0.032, { type: 'sine', vol: 0.052, glide: 1520, a: 0.002 });
      bell(mtof(86), t + 0.018, 0.16, 0.05, sfxBus, false, false);
      bell(mtof(93), t + 0.044, 0.2, 0.052, sfxBus, false, true);
    },

    modeSwitch() {
      if (!ok()) return;
      const t = now();
      tone(784, t, 0.075, { type: 'triangle', vol: 0.09, glide: 1175 });
      tone(1175, t + 0.052, 0.11, { type: 'sine', vol: 0.1, glide: 1568, sfxSend: true });
      tone(2350, t + 0.06, 0.08, { type: 'sine', vol: 0.035, glide: 3136 });
    },

    clearCol() {
      if (!ok()) return;
      const t = now();
      supersaw(440, t, 0.22, { glide: 1760, glideT: 0.2, vol: 0.085, lp: 6500, spread: 14, sfxSend: true });
      [72, 76, 79, 84].forEach((m, i) => {
        bell(mtof(m), t + i * 0.038, 0.3, 0.075, sfxBus, false, true);
      });
    },

    suitDone() {
      if (!ok()) return;
      const t = now();
      const notes = [72, 76, 79, 84, 79, 84, 88, 96];
      tone(150, t, 0.22, { vol: 0.22, glide: 45, glideT: 0.15 });
      notes.forEach((m, i) => {
        const nt = t + i * 0.055;
        supersaw(mtof(m), nt, 0.14, { vol: 0.075, lp: 7200, spread: 14, sfxSend: i >= 5 });
        bell(mtof(m), nt, 0.32, 0.07, sfxBus, false, i === 7);
      });
      chordStab([72, 79, 84, 88, 96], t + 7 * 0.055, 0.5, {
        type: 'sawtooth', detune: 14, vol: 0.07, lp: 8000, lpEnd: 2400, sfxSend: true
      });
    },

    autoStep(i = 0) {
      if (!ok()) return;
      const t = now();
      const idx = Math.max(0, (i | 0) || 0);
      const m = idx < AUTO_SCALE.length
        ? AUTO_SCALE[idx]
        : 96 + PENTA[idx % 7];
      const hz = mtof(Math.min(104, m));
      tone(420, t, 0.05, { vol: 0.11, glide: 170, glideT: 0.04 });
      bell(hz, t, 0.26, 0.095, sfxBus, false, true);
      tone(hz, t, 0.07, { type: 'triangle', vol: 0.055 });
    },

    warning() {
      if (!ok()) return;
      const t = now();
      for (let i = 0; i < 2; i++) {
        const pt = t + i * 0.105;
        tone(1046.5, pt, 0.07, { type: 'triangle', vol: 0.085, glide: 880 });
        tone(2093, pt, 0.05, { type: 'sine', vol: 0.032, glide: 1760 });
      }
    },

    invalid() {
      if (!ok()) return;
      const t = now();
      tone(392, t, 0.11, { type: 'sawtooth', vol: 0.09, glide: 320, lp: 1400 });
      tone(311, t + 0.1, 0.17, { type: 'sawtooth', vol: 0.095, glide: 210, lp: 1100 });
    },

    shuffle() {
      if (!ok()) return;
      const t = now();
      for (let i = 0; i < 18; i++) {
        noise(t + i * 0.028, 0.038, { f: 1900 + i * 140 + Math.random() * 900, q: 1.2, vol: 0.1 });
      }
      tone(600, t + 0.1, 0.35, { type: 'sine', vol: 0.035, glide: 1400 });
    },

    deal(n = 7, gap = 0.04) {
      if (!ok()) return;
      const t = now();
      const count = clamp((n | 0) || 0, 0, 60);
      const dt = clamp(Number(gap) || 0.04, 0.012, 0.25);
      for (let i = 0; i < count; i++) {
        const st = t + i * dt + 0.03;
        noise(st, 0.045, { f: 2500 + (i % 5) * 260 + Math.random() * 800, q: 1.0, vol: 0.085 });
        tone(1200 + (i % 7) * 90, st, 0.028, { type: 'triangle', vol: 0.022 });
      }
    },

    hint() {
      if (!ok()) return;
      const t = now();
      bell(1318.5, t, 0.38, 0.095, sfxBus, false, true);
      bell(1760, t + 0.075, 0.44, 0.095, sfxBus, false, true);
      bell(2093, t + 0.15, 0.48, 0.065, sfxBus, false, true);
    },

    click() {
      if (!ok()) return;
      const t = now();
      tone(920, t, 0.052, { type: 'triangle', vol: 0.08, glide: 1480 });
      tone(2200, t + 0.005, 0.028, { type: 'sine', vol: 0.03 });
    },

    undo() {
      if (!ok()) return;
      const t = now();
      tone(820, t, 0.13, { vol: 0.11, glide: 420, type: 'triangle' });
      noise(t, 0.1, { f: 2800, fEnd: 900, q: 1.0, vol: 0.06, a: 0.03 });
    },

    recycle() {
      if (!ok()) return;
      const t = now();
      noise(t, 0.22, { f: 1400, fEnd: 3800, q: 0.7, vol: 0.11, a: 0.06 });
      tone(380, t, 0.22, { vol: 0.08, glide: 980, type: 'triangle' });
      tone(1180, t + 0.19, 0.055, { type: 'sine', vol: 0.06, glide: 1560 });
    },

    nya() {
      if (!ok()) return;
      const t = now();
      const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth';
      f.type = 'bandpass';
      f.frequency.setValueAtTime(1500, t);
      f.Q.value = 1.4;
      const base = 540 + Math.random() * 120;
      o.frequency.setValueAtTime(base, t);
      o.frequency.linearRampToValueAtTime(base * 1.6, t + 0.09);
      o.frequency.linearRampToValueAtTime(base * 1.1, t + 0.4);
      lfo.frequency.setValueAtTime(7, t);
      lg.gain.setValueAtTime(22, t);
      lfo.connect(lg);
      lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.03);
      g.gain.setValueAtTime(0.28, t + 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(f);
      f.connect(g);
      g.connect(sfxBus);
      o.start(t);
      lfo.start(t);
      o.stop(t + 0.48);
      lfo.stop(t + 0.48);
    },

    lose() {
      if (!ok()) return;
      const t = now();
      [67, 64, 62, 59, 55].forEach((m, i) => {
        tone(mtof(m), t + i * 0.19, 0.4, { type: 'triangle', vol: 0.11, a: 0.015 });
      });
      bell(mtof(48), t + 0.96, 1.2, 0.07, sfxBus, false, true);
    },

    win() {
      if (!ok()) return;
      const t = now();
      // Grand Prism Victory fanfare!
      noise(t, 0.16, { ft: 'bandpass', f: 1600, fEnd: 7200, q: 1.4, vol: 0.11, a: 0.04 });
      tone(160, t + 0.12, 0.28, { vol: 0.25, glide: 42, glideT: 0.2 });

      [72, 76, 79, 83, 84, 86, 88, 91].forEach((m, i) => {
        const nt = t + 0.08 + i * 0.055;
        supersaw(mtof(m), nt, 0.16, { vol: 0.07, lp: 7600, spread: 15, sfxSend: true });
        bell(mtof(m), nt, 0.36, 0.085, sfxBus, false, true);
      });

      // IV -> V -> I triumphant synth cadence (Fmaj7 -> G6 -> Cmaj9)
      chordStab([65, 69, 72, 76, 84], t + 0.54, 0.26, {
        type: 'sawtooth', detune: 15, vol: 0.075, lp: 7800, lpEnd: 3000, sfxSend: true
      });
      chordStab([67, 71, 74, 79, 86], t + 0.80, 0.26, {
        type: 'sawtooth', detune: 15, vol: 0.08, lp: 8200, lpEnd: 3200, sfxSend: true
      });
      tone(150, t + 1.06, 0.34, { vol: 0.26, glide: 40, glideT: 0.24 });
      chordStab([60, 67, 72, 76, 79, 84, 91], t + 1.06, 1.35, {
        type: 'sawtooth', detune: 18, vol: 0.08, lp: 9200, lpEnd: 2400, a: 0.015, sfxSend: true
      });

      const starNotes = [84, 88, 91, 96, 98, 100, 96, 91, 96, 100, 103, 108];
      for (let i = 0; i < starNotes.length; i++) {
        bell(mtof(Math.min(104, starNotes[i])), t + 1.1 + i * 0.075, 0.42, 0.065, sfxBus, false, true);
      }
    }
  };

  // Backwards-compatible aliases
  sfx.chainMilestone = sfx.comboMilestone;
  sfx.chainBreak = sfx.comboBreak;

  // ---------- 16th-Note Music Tracks Engine ----------

  const TRACKS = {
    pulse: {
      bpm: 165,
      swing: 0,
      style: 'pulse',
      // Fm -> Db -> Ab -> Eb Prism Pulse euphoric speed-trance
      chords: [
        [53, 56, 60, 65],
        [49, 53, 56, 60],
        [56, 60, 63, 68],
        [51, 55, 58, 63]
      ],
      bass: [41, 37, 44, 39],
      scale: [68, 70, 72, 73, 75, 77, 79, 80, 82, 84, 85, 87, 89],
      motif: [
        77, null, 80, null, 84, null, 82, 80, 77, null, 79, null, 80, null, 84, null,
        73, null, 77, null, 80, null, 84, null, 82, null, 80, 79, 77, null, null, null,
        80, null, 84, null, 87, null, 85, 84, 80, null, 82, null, 84, null, 87, null,
        82, null, 85, null, 84, 82, 80, null, 79, null, 82, null, 84, null, 87, null
      ]
    },
    redline: {
      bpm: 178,
      swing: 0,
      style: 'redline',
      // Dm -> Bb -> Gm -> A7 Redline Rush high-velocity dark synth
      chords: [
        [50, 53, 57, 62],
        [46, 50, 53, 58],
        [55, 58, 62, 67],
        [49, 52, 57, 61]
      ],
      bass: [38, 34, 43, 33],
      scale: [69, 70, 72, 74, 76, 77, 79, 81, 82, 84, 86, 88],
      motif: [
        74, null, 74, 77, 81, null, 79, 77, 76, null, 77, null, 81, null, 74, null,
        70, null, 74, 77, 82, null, 81, 77, 74, null, 76, 77, 79, null, null, null,
        79, null, 82, null, 86, null, 84, 82, 81, null, 79, 77, 79, null, 82, null,
        81, null, 85, null, 86, 85, 81, null, 79, 77, 76, 77, 81, null, 85, null
      ]
    },
    horizon: {
      bpm: 152,
      swing: 0,
      style: 'horizon',
      // Am7 -> Fmaj7 -> C -> G Horizon Drive bright electro club groove
      chords: [
        [57, 60, 64, 67],
        [53, 57, 60, 64],
        [60, 64, 67, 71],
        [55, 59, 62, 67]
      ],
      bass: [33, 41, 36, 43],
      scale: [69, 71, 72, 74, 76, 79, 81, 83, 84, 86, 88],
      motif: [
        81, null, 76, 79, 81, null, 84, null, 83, 81, 79, null, 76, null, 79, null,
        77, null, 81, null, 84, null, 83, 81, 79, null, 76, null, 72, null, null, null,
        84, null, 79, 81, 84, null, 88, null, 86, 84, 83, null, 79, null, 84, null,
        83, null, 86, null, 84, 83, 79, null, 81, null, 83, 84, 86, null, 88, null
      ]
    },
    zenith: {
      bpm: 190,
      swing: 0,
      style: 'zenith',
      // Cm -> Abmaj7 -> Fm7 -> G7 Zenith Core harmonic-minor artcore
      chords: [
        [48, 51, 55, 60],
        [56, 60, 63, 67],
        [53, 56, 60, 63],
        [55, 59, 62, 65]
      ],
      bass: [36, 32, 41, 43],
      scale: [72, 74, 75, 77, 79, 80, 83, 84, 86, 87, 89, 91],
      motif: [
        84, 79, 75, 79, 84, null, 87, 86, 84, null, 83, 84, 86, null, 79, null,
        80, 75, 72, 75, 80, null, 84, 86, 87, null, 86, 84, 83, null, null, null,
        77, 80, 84, 87, 89, null, 87, 86, 84, null, 80, 84, 87, null, 89, null,
        91, null, 89, 87, 86, 84, 83, null, 84, 86, 87, 89, 91, null, 83, 86
      ]
    },
    bounce: {
      bpm: 118,
      swing: 0,
      style: 'chill',
      chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      bass: [48, 45, 41, 43],
      scale: [72, 74, 76, 79, 81, 84, 86],
      density: 0.56,
      lead: 'square',
      drums: 'pop',
      arp: true
    },
    lofi: {
      bpm: 76,
      swing: 0.16,
      style: 'chill',
      chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
      bass: [41, 40, 38, 36],
      scale: [72, 74, 76, 79, 81, 84, 86, 88],
      density: 0.42,
      lead: 'bell',
      drums: 'lofi'
    },
    lullaby: {
      bpm: 64,
      swing: 0,
      style: 'chill',
      chords: [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]],
      bass: [50, 47, 43, 45],
      scale: [74, 76, 78, 81, 83, 86, 88],
      density: 0.5,
      lead: 'bell',
      drums: null,
      arp: true,
      musicbox: true
    }
  };

  function genChillPhrase(tr) {
    const out = new Array(32).fill(null);
    let idx = (tr.scale.length / 2) | 0;
    for (let s = 0; s < 32; s++) {
      const beat = s % 8;
      const p = beat === 0 ? 0.85 : beat % 2 === 0 ? tr.density : tr.density * 0.55;
      if (Math.random() < p) {
        idx = clamp(idx + pick([-2, -1, -1, 0, 1, 1, 2]), 0, tr.scale.length - 1);
        out[s] = tr.scale[idx];
      }
    }
    out[31] = null;
    out[30] = out[30] && tr.scale[0];
    return out;
  }

  function genSynthVariation(tr) {
    const base = tr.motif;
    const sc = tr.scale;
    const out = new Array(64).fill(null);
    let idx = (sc.length * 0.6) | 0;
    for (let s = 0; s < 64; s++) {
      if (s < 32 && base[s] != null && Math.random() < 0.65) {
        out[s] = base[s];
        const found = sc.indexOf(base[s]);
        if (found >= 0) idx = found;
      } else if (s % 2 === 0 ? Math.random() < 0.62 : Math.random() < 0.28) {
        idx = clamp(idx + pick([-2, -1, 1, 1, 2]), 0, sc.length - 1);
        out[s] = sc[idx];
      }
    }
    out[60] = sc[Math.min(sc.length - 3, 8)];
    out[62] = sc[sc.length - 1];
    out[63] = null;
    return out;
  }

  function buildPhrases(tr) {
    if (tr.style === 'chill') return [genChillPhrase(tr), genChillPhrase(tr)];
    return [tr.motif.slice(), genSynthVariation(tr)];
  }

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
    noise(t, 0.016, { ft: 'highpass', f: 3500, vol: 0.05, a: 0.001, bus });
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
    noise(t, 0.11, { ft: 'bandpass', f: 2300, q: 0.85, vol, a: 0.002, bus });
    noise(t + 0.01, 0.085, { ft: 'highpass', f: 4200, vol: vol * 0.55, a: 0.002, bus });
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
    if (nextT < ctx.currentTime - 0.35) nextT = ctx.currentTime + 0.03;
    let guard = 0;
    while (nextT < ctx.currentTime + 0.14 && guard++ < 10) {
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
    timer = setInterval(tick, 25);
  }

  function stopMusic() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (musicBus && ctx) {
      const old = musicBus;
      old.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
      setTimeout(() => {
        try { old.disconnect(); } catch (e) { /* already disconnected */ }
      }, 450);
      musicBus = null;
    }
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function duck(on) { if (ducked === !!on) return; ducked = !!on; applyGains(); }

  return {
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
