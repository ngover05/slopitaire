/* Slopitaire — companion voice output: prerecorded Kokoro clips with a Web Speech (TTS) fallback. */
const Voice = (() => {
  'use strict';
  const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
  let voices = [], cur = null, curPri = 0;
  const load = () => { voices = synth ? synth.getVoices() : []; };
  if (synth) {
    load();
    if (synth.addEventListener) synth.addEventListener('voiceschanged', load);
    else synth.onvoiceschanged = load;
  }
  // Ranking: neural "Natural/Online" voices sound best; local voices start instantly (network voices lag & stutter);
  // female-sounding names suit the cast.
  const FEM = /(nanami|haruka|ayumi|kyoko|o-ren|sayaka|mizuki|hikari|aoi|shiori|mayu|female|google 日本語|zira|aria|jenny|samantha|susan|hazel|libby|sonia|ava|allison|emma|michelle|google us english|google uk english female)/i;
  const langOf = (v) => (v.lang || '').toLowerCase().replace('_', '-');
  const score = (v) => (/natural|neural|online/i.test(v.name) ? 6 : 0) + (v.localService ? 3 : 0) + (FEM.test(v.name) ? 2 : 0);
  function list(lang) { return voices.filter((v) => langOf(v).startsWith(lang)).sort((a, b) => score(b) - score(a)); }
  const NATURAL = /natural|neural|online/i;
  // Auto pick: each companion gets her own voice from the best tier when several exist (slot), so the
  // personalities come from different voices instead of heavy pitch-shifting.
  function find(lang, name, slot = 0) {
    const l = list(lang);
    if (name) { const v = l.find((x) => x.name === name); if (v) return v; }
    if (!l.length) return null;
    const top = score(l[0]), tier = l.filter((v) => score(v) === top && FEM.test(v.name));
    return tier.length ? tier[slot % tier.length] : l[0];
  }
  // Make lines easier for TTS engines: strip arcade symbols/emojis, collapse repeated '!', drop written stutters ("べ、別に", "D-don't") and long ellipsis pauses.
  function speakable(text, ja) {
    let t = String(text || '')
      .replace(/\([^()A-Za-z0-9\u3040-\u30ff\u4e00-\u9fff]*\)/g, '')
      .replace(/[\p{Extended_Pictographic}\uFE0E\uFE0F\u200D~〜♡♥☆★✨✿♪♫⏪⏩⚡🔥💠◈✦🌌🌿✕✖✗▶▷◀◁◆◇✧❖🐾🌸🌙🧪☠👑💎💥💫🌟()（）【】*]/gu, '');
    if (ja) {
      t = t.replace(/(^|[^぀-ヿ一-鿿])([぀-ゟ])、(?=[぀-ヿ一-鿿])/g, '$1');
      t = t.replace(/^…+/, '').replace(/…+/g, '、').replace(/、+/g, '、').replace(/、([！？。])/g, '$1');
      t = t.replace(/[!?！？]{2,}/g, (m) => (/[?？]/.test(m) ? '？' : '！'));
      t = t.replace(/(^|\s)[!！]+(?=\s|$)/g, '$1');
    } else {
      t = t.replace(/\b([A-Za-z]{1,2})-(?=\1)/gi, '').replace(/^\.\.\.|^…/, '').replace(/…|\.\.\./g, ', ');
      t = t.replace(/[!?！？]{2,}/g, (m) => (/[?？]/.test(m) ? '?' : '!'));
      t = t.replace(/(^|\s)[!！]+(?=\s|$)/g, '$1');
    }
    return t.replace(/\s{2,}/g, ' ').trim();
  }

  // Prerecorded Kokoro clips (tools/voice). js/cast/voice-clips.js lists which exist; the file name is a hash of the
  // cleaned spoken text, so the generator and the game agree on it without storing the text twice.
  const CLIPS = (typeof window !== 'undefined' && window.VOICE_CLIPS) || {};
  const utf8Encoder = new TextEncoder();
  const clipIdCache = new Map();
  // Clips are mp3 unless the manifest says otherwise ("ext": "opus"). Browsers that can't decode a format just
  // skip its clips and use Web Speech instead.
  const MIME = { mp3: 'audio/mpeg', opus: 'audio/ogg; codecs=opus' };
  const playable = new Map();
  function canPlay(ext) {
    if (!playable.has(ext)) {
      let ok = ext === 'mp3';
      try { ok = !!new Audio().canPlayType(MIME[ext] || `audio/${ext}`); } catch (e) { /* no Audio: keep default */ }
      playable.set(ext, ok);
    }
    return playable.get(ext);
  }
  function clipId(text) { // FNV-1a 32-bit over UTF-8
    let h = 0x811c9dc5;
    for (const b of utf8Encoder.encode(text)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  function clipFor(line, o) {
    const lang = o.lang === 'ja' ? 'ja' : 'en', s = CLIPS[o.char] && CLIPS[o.char][lang];
    if (!s) return null;
    const ext = s.ext || 'mp3';
    if (!canPlay(ext)) return null;
    const ja = lang === 'ja';
    const raw = (ja ? line.ja : line.en) || '';
    const cacheKey = (ja ? '1:' : '0:') + raw;
    let id = clipIdCache.get(cacheKey);
    if (id === undefined) {
      id = clipId(speakable(raw, ja));
      clipIdCache.set(cacheKey, id);
    }
    const set = s.set || (s.set = new Set(s.ids));
    return set.has(id) ? `audio/voice/${o.char}/${lang}/${id}.${ext}?v=${s.v}` : null;
  }

  let startedAt = 0, gapT = null, curEnd = null;
  const busy = () => !!cur && Date.now() - startedAt < 8000 &&
    (cur instanceof Audio ? !cur.paused && !cur.ended : !!synth && (synth.speaking || synth.pending));
  // ends whatever is playing; the interrupted line still gets its onend so talking/ducking state is released
  function halt() {
    clearTimeout(gapT);
    const end = curEnd; curEnd = null;
    if (cur instanceof Audio) { cur.pause(); cur.removeAttribute('src'); }
    else if (synth) synth.cancel();
    cur = null; curPri = 0;
    if (end) end();
  }
  function playClip(url, o) {
    halt();
    const a = new Audio(url);
    a.volume = Math.max(0, Math.min(1, o.volume == null ? 1 : o.volume));
    let ended = false;
    const done = () => { if (ended) return; ended = true; if (cur === a) { cur = null; curPri = 0; curEnd = null; } if (o.onend) o.onend(); };
    a.onplaying = () => { startedAt = Date.now(); if (o.onstart) o.onstart(); a.onplaying = null; };
    a.onended = a.onerror = done;
    cur = a; curPri = o.pri || 0; curEnd = done; startedAt = Date.now();
    const p = a.play();
    if (p && p.catch) p.catch(done);
    return true;
  }

  /** Returns true when the line will be spoken, 'busy' if a more important line is playing, false if no voice. */
  function speak(line, prof, o) {
    if (busy() && (o.pri || 0) <= curPri) return 'busy';   // never chop a line for an equal/less important one
    const url = clipFor(line, o);
    if (url) return playClip(url, o);
    if (!synth) return false;
    if (cur instanceof Audio) halt();
    let voice = o.lang === 'ja' ? find('ja', o.name, o.slot) : null, text = line.ja, ja = true;
    if (!voice) { voice = find('en', o.name, o.slot); text = line.en; ja = false; }
    if (!voice && voices.length) return false;
    const u = new SpeechSynthesisUtterance(speakable(text, ja));
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = ja ? 'ja-JP' : 'en-US';
    // neural voices turn metallic when pitch-shifted, so they only get a quarter of the character's pitch offset
    const k = voice && NATURAL.test(voice.name) ? 0.25 : 1;
    u.pitch = 1 + (prof.pitch - 1) * k; u.rate = prof.rate; u.volume = o.volume;
    u.onstart = () => { startedAt = Date.now(); if (o.onstart) o.onstart(); };
    u.onend = u.onerror = () => { if (cur === u) { cur = null; curPri = 0; } if (o.onend) o.onend(); };
    clearTimeout(gapT);
    const interrupting = synth.speaking || synth.pending;
    cur = u; curPri = o.pri || 0; startedAt = Date.now();
    if (interrupting) {
      synth.cancel();
      gapT = setTimeout(() => { if (cur === u) synth.speak(u); }, 80); // Chrome clips a line spoken right after cancel()
    } else synth.speak(u);
    return true;
  }
  const stop = halt;
  const hasClips = (char) => !!CLIPS[char];
  return {
    speak, stop, busy, speakable, clipId, hasClips, supported: !!synth || Object.keys(CLIPS).length > 0,
    available: (lang) => !!find(lang),
    voicesFor: (lang) => list(lang).map((v) => v.name),
    onVoices: (fn) => { if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', fn); },
  };
})();
