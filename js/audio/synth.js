/* Slopitaire audio — Web Audio synthesis primitives (tone, supersaw, chord stab, noise, bell) and the music echo.
 * Shared by the live engine (js/audio/sound.js) and the offline soundtrack renderer (tools/music), so a
 * pre-rendered track is built from exactly the same voices the game would synthesize.
 * E: getters for the current context and buses ({ ctx, sfxBus, echo, sfxEcho, cfg: { lite } }). */
function createSynth(E) {
  'use strict';
  const noiseCache = new WeakMap();

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

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

  function nyquist() {
    return E.ctx ? Math.min(20000, E.ctx.sampleRate * 0.46) : 20000;
  }

  function safeHz(f) {
    const n = Number(f);
    if (!Number.isFinite(n)) return 440;
    return clamp(n, 20, nyquist());
  }

  function tone(f, t, dur, o = {}) {
    const ctx = E.ctx;
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
    g.connect(o.bus || E.sfxBus);
    if (o.send && E.echo) g.connect(E.echo);
    if (o.sfxSend && E.sfxEcho) g.connect(E.sfxEcho);
    osc.start(t0);
    osc.stop(endT + 0.025);
  }

  function supersaw(f, t, dur, o = {}) {
    const ctx = E.ctx;
    if (!ctx) return;
    const t0 = Math.max(ctx.currentTime, Number(t) || ctx.currentTime);
    const d = Math.max(0.015, Number(dur) || 0.12);
    const hz = safeHz(f);
    const spread = o.spread || 16;
    const detunes = (o.voices === 2 || E.cfg.lite) ? [-spread * 0.7, spread * 0.7] : [-spread, 0, spread];
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
    g.connect(o.bus || E.sfxBus);
    if (o.send && E.echo) g.connect(E.echo);
    if (o.sfxSend && E.sfxEcho) g.connect(E.sfxEcho);

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
    const ctx = E.ctx;
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
    g.connect(o.bus || E.sfxBus);
    if (o.send && E.echo) g.connect(E.echo);
    if (o.sfxSend && E.sfxEcho) g.connect(E.sfxEcho);

    const wave = o.type || 'sawtooth';
    // lite: three voices are enough (the fourth note is usually the root an octave up)
    const nVoices = E.cfg.lite ? Math.min(3, midis.length) : midis.length;
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
    const ctx = E.ctx;
    if (!ctx) return;
    const buf = getNoiseBuffer(ctx, o.kind === 'pink' ? 'pink' : 'white');
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
    g.connect(o.bus || E.sfxBus);
    if (o.send && E.echo) g.connect(E.echo);
    if (o.sfxSend && E.sfxEcho) g.connect(E.sfxEcho);
    src.start(t0, Math.random() * 0.7);
    src.stop(endT + 0.02);
  }

  function bell(f, t, dur = 0.55, vol = 0.11, bus, send, sfxSend) {
    const hz = safeHz(f);
    tone(hz, t, dur, { vol, bus, send, sfxSend });
    if (hz * 2 < nyquist()) tone(hz * 2, t, dur * 0.58, { vol: vol * 0.36, bus, send, sfxSend });
    if (!E.cfg.lite && hz * 3.01 < nyquist()) tone(hz * 3.01, t, dur * 0.32, { vol: vol * 0.14, bus, send });
  }

  // Tempo-synced dotted-8th delay for synth leads, bells & arpeggios: returns the send input, wet output -> dest
  function createEcho(ac, dest, delay = 0.27) {
    const echo = ac.createDelay(1.0);
    echo.delayTime.value = delay;
    const fb = ac.createGain();
    fb.gain.value = 0.32;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3800;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 260;
    const wet = ac.createGain();
    wet.gain.value = 0.32;
    echo.connect(hp);
    hp.connect(lp);
    lp.connect(fb);
    fb.connect(echo);
    lp.connect(wet);
    wet.connect(dest);
    return echo;
  }

  return { mtof, nyquist, safeHz, getNoiseBuffer, tone, supersaw, chordStab, noise, bell, createEcho };
}
