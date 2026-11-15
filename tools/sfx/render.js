/* Sound effects renderer page (runs in a hidden Electron window, see main.js).
 * Lists every effect's variants, fingerprints them, renders them with the game's own SFX code (js/audio/sfx.js +
 * synth.js) into an OfflineAudioContext and checks encoded files by decoding them with Chromium's decoder, the one the
 * game will use. */
'use strict';

// Deterministic randomness: the same inputs always render the same noise (and the same files)
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

// The game's SFX chain on a context: everything goes into the SFX bus, and the bus's echo is part of the sound.
// (The bus volume, mute, master compressor and analyser come after and are applied live.)
function rig(ctx, out) {
  const E = { ctx, sfxBus: out, echo: null, sfxEcho: null, cfg: { lite: false } };
  E.sfxEcho = SfxSuite.createEcho(ctx, out);
  const synth = createSynth(E);
  return createSoundEffects({ ctx, sfxBus: out, ...synth });
}

function play(fx, name, part, args) {
  if (part) fx.parts[name](fx.now(), ...args);
  else fx.sfx[name](...args);
}

// ---------- fingerprints ----------
// A stand-in AudioContext that builds no audio but logs every node, connection, parameter change and start/stop.
// Two calls that log the same thing (with the same random numbers) sound the same, so the log tells whether VARIANTS'
// key() matches what an effect does with its arguments, and its hash tells whether a rendered file is out of date.
function mockContext(sampleRate) {
  const log = [];
  const buffers = [];
  let n = 0;
  const num = (v) => (typeof v === 'number' ? Number(v.toPrecision(10)) : v);
  const arg = (a) => (a && a._id != null ? `#${a._id}` : JSON.stringify(num(a)));
  const fmt = (args) => args.map(arg).join(',');
  const AUTOMATION = ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime',
    'cancelScheduledValues', 'setValueCurveAtTime'];
  const param = (owner, name) => {
    const p = { v: 0 };
    for (const m of AUTOMATION) p[m] = (...a) => { log.push(`${owner}.${name}.${m}(${fmt(a)})`); return p; };
    Object.defineProperty(p, 'value', {
      get: () => p.v,
      set: (v) => { p.v = v; log.push(`${owner}.${name}=${arg(v)}`); },
    });
    return p;
  };
  const node = (kind, params, args) => {
    const id = n++;
    log.push(`#${id}=${kind}(${fmt(args)})`);
    const o = {
      _id: id,
      connect: (d, ...rest) => { log.push(`#${id}>${fmt([d, ...rest])}`); return d; },
      disconnect: (...a) => log.push(`#${id}.disconnect(${fmt(a)})`),
      start: (...a) => log.push(`#${id}.start(${fmt(a)})`),
      stop: (...a) => log.push(`#${id}.stop(${fmt(a)})`),
    };
    for (const p of params) o[p] = param(`#${id}`, p);
    return new Proxy(o, {
      set(t, k, v) { t[k] = v; log.push(`#${id}.${String(k)}=${arg(v)}`); return true; },
    });
  };
  const ctx = {
    currentTime: 0,
    sampleRate,
    state: 'suspended',
    destination: node('destination', [], []),
    createOscillator: (...a) => node('oscillator', ['frequency', 'detune'], a),
    createGain: (...a) => node('gain', ['gain'], a),
    createBiquadFilter: (...a) => node('biquad', ['frequency', 'detune', 'Q', 'gain'], a),
    createBufferSource: (...a) => node('bufferSource', ['playbackRate', 'detune'], a),
    createDelay: (...a) => node('delay', ['delayTime'], a),
    createBuffer: (channels, length, rate) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const b = { _id: n++, numberOfChannels: channels, length, sampleRate: rate, duration: length / rate,
        getChannelData: (c) => data[c] };
      log.push(`#${b._id}=buffer(${fmt([channels, length, rate])})`);
      buffers.push([b._id, data]);
      return b;
    },
  };
  // buffer contents (the noise) are filled in after creation: hash them at the end
  const finish = () => {
    for (const [id, data] of buffers) {
      let h = 0x811c9dc5;
      for (const ch of data) {
        const u = new Uint32Array(ch.buffer, ch.byteOffset, ch.length);
        for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193); }
      }
      log.push(`#${id}.data=${(h >>> 0).toString(16)}`);
    }
    return log.join('\n');
  };
  return { ctx, finish };
}

function fingerprint(name, part, args, sampleRate, seed) {
  const { ctx, finish } = mockContext(sampleRate);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  const fx = rig(ctx, out);
  Math.random = mulberry32(seed);
  play(fx, name, part, args);
  return finish();
}

const keyOf = (spec, args) => (spec.key ? spec.key(...args) : []).join(' ');

const Renderer = {
  // Every effect (and seq part) with its variants: one per distinct sound, each with the keys that play it.
  // problems: keys that map different-sounding arguments to the same sound (key() out of step with the effect).
  list({ sampleRate, seed }) {
    const mock = mockContext(sampleRate).ctx;
    const fx = rig(mock, mock.createGain());
    const V = SfxSuite.VARIANTS;
    const names = [];
    for (const name of Object.keys(fx.sfx)) {
      if (SfxSuite.ALIASES[name]) continue;
      const spec = V[name] || {};
      if (spec.seq) {
        for (const [p] of spec.seq()) if (!names.includes(p)) names.push(p);
      } else names.push(name);
    }
    for (const name of Object.keys(V)) {
      if (V[name].part && !names.includes(name)) names.push(name);
      if (V[name].part && !fx.parts[name]) throw new Error(`VARIANTS.${name} is a part, but createSoundEffects has no such part`);
      if (!V[name].part && !fx.sfx[name]) throw new Error(`VARIANTS.${name} has no matching effect in createSoundEffects`);
    }

    const effects = [];
    const fpSeed = seedOf(`${seed}:fingerprint`);
    for (const name of names) {
      const spec = V[name] || {};
      const part = !!spec.part;
      const sample = typeof spec.sample === 'function' ? spec.sample() : spec.sample || [[]];
      const byKey = new Map(); // key -> { args, fp }
      const problems = [];
      for (const args of sample) {
        const key = keyOf(spec, args);
        const fp = fingerprint(name, part, args, sampleRate, fpSeed);
        const seen = byKey.get(key);
        if (!seen) byKey.set(key, { args, fp });
        else if (seen.fp !== fp && problems.length < 3) {
          problems.push(`${name}(${JSON.stringify(seen.args).slice(1, -1)}) and ${name}(${JSON.stringify(args).slice(1, -1)}) both have key "${key}" but sound different`);
        }
      }
      // keys that sound identical share one rendered variant
      const variants = [];
      const byFp = new Map();
      for (const [key, { args, fp }] of byKey) {
        let v = byFp.get(fp);
        if (!v) {
          v = { args, keys: [], fp };
          byFp.set(fp, v);
          variants.push(v);
        }
        v.keys.push(key);
      }
      effects.push({ name, part, takes: Math.max(1, spec.takes | 0), variants, problems, samples: sample.length });
    }
    return effects;
  },

  // Renders each variant (x takes) of one effect; returns the samples trimmed after the tail has died away
  async render({ name, part, variants, takes, sampleRate, seed, seconds, floorDb }) {
    const t0 = performance.now();
    const floor = Math.pow(10, floorDb / 20);
    const pad = Math.round(0.005 * sampleRate);
    const out = [];
    for (const v of variants) {
      for (let take = 0; take < takes; take++) {
        const len = Math.round(seconds * sampleRate);
        const ctx = new OfflineAudioContext(1, len, sampleRate);
        const bus = ctx.createGain();
        bus.connect(ctx.destination);
        Math.random = mulberry32(seedOf(`${seed}:${name}:${v.keys[0]}:${take}`));
        play(rig(ctx, bus), name, part, v.args);
        const d = (await ctx.startRendering()).getChannelData(0);
        let last = -1, peak = 0;
        for (let i = 0; i < d.length; i++) {
          const a = Math.abs(d[i]);
          if (a > floor) last = i;
          if (a > peak) peak = a;
        }
        if (last < 0) throw new Error(`${name} ${JSON.stringify(v.args)} is silent`);
        if (last > len - 0.25 * sampleRate) {
          throw new Error(`${name} ${JSON.stringify(v.args)} is still sounding at the end of the ${seconds} s render (raise "seconds")`);
        }
        out.push({ pcm: d.slice(0, Math.min(len, last + 1 + pad)), peak });
      }
    }
    return { clips: out, ms: performance.now() - t0 };
  },

  // Decodes an encoded file and compares it with the samples that went in: length, alignment (a decoder that ignores
  // Opus pre-skip shows up as a lag), signal-to-noise ratio and the level of every clip in it.
  async verify({ bytes, ref, sampleRate, clips }) {
    const ctx = new OfflineAudioContext(1, 1, sampleRate);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const d = (await ctx.decodeAudioData(ab)).getChannelData(0);
    const MAXLAG = 2048;
    // align on the loudest clip
    let big = clips[0];
    for (const c of clips) if (c.energy > big.energy) big = c;
    let best = -Infinity, lag = 0;
    for (let l = -MAXLAG; l <= MAXLAG; l++) {
      let s = 0;
      for (let i = big.start; i < big.start + big.len; i++) s += ref[i] * (d[i + l] || 0);
      if (s > best) { best = s; lag = l; }
    }
    let sig = 0, err = 0, worstDb = 0;
    for (const c of clips) {
      let cs = 0, ce = 0, cd = 0;
      for (let i = c.start; i < c.start + c.len; i++) {
        const x = ref[i], y = d[i + lag] || 0;
        cs += x * x;
        cd += y * y;
        ce += (x - y) * (x - y);
      }
      sig += cs;
      err += ce;
      const db = 10 * Math.log10((cd + 1e-12) / (cs + 1e-12));
      if (Math.abs(db) > Math.abs(worstDb)) worstDb = db;
    }
    return {
      decodedLength: d.length, expectedLength: ref.length, lag,
      snrDb: err > 0 ? 10 * Math.log10(sig / err) : Infinity,
      worstLevelDb: worstDb,
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
