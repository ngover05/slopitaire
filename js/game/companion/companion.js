/* Slopitaire — the on-screen companion: reactions, speech bubble, voice, sprite and corner peek. */
'use strict';

// companion events: [priority, default expression]. Priority decides who may interrupt whom.
const EVENTS = {
  pick: [1, 'thinking'], draw: [1, 'normal'], place: [1, 'happy'],
  recycle: [2, 'thinking'], noRedeal: [2, 'sad'], reveal: [2, 'wink'],
  clearCol: [2, 'smug'], foundation: [2, 'happy'],
  aceFound: [2, 'cheer'], kingPlace: [2, 'smug'], multiMove: [2, 'hype'], fastPlay: [2, 'smug'],
  chain5: [2, 'smug'], musicChange: [2, 'cheer'], themeChange: [2, 'wink'],
  invalid: [2, 'oops'], undo: [2, 'wink'], undoBlocked: [2, 'sad'], hint: [2, 'wink'], hintNone: [2, 'sad'],
  idle: [2, 'thinking'], settings: [2, 'wink'],
  combo: [3, 'hype'], chain10: [3, 'cheer'], chain20: [3, 'hype'], chainBreak: [3, 'shock'],
  clutch: [3, 'smug'], halfway: [3, 'cheer'], almostWon: [3, 'hype'],
  suitDone: [3, 'cheer'], noMoves: [3, 'sad'], autoFinish: [3, 'hype'], pet: [3, 'cheer'],
  touchHead: [3, 'happy'], touchFace: [3, 'wink'], touchHands: [3, 'cheer'],
  touchTorso: [3, 'oops'], touchLegs: [3, 'shock'],
  chain30: [4, 'hype'],
  start: [4, 'happy'], startEasy: [4, 'wink'], restart: [4, 'wink'], welcome: [4, 'happy'],
  win: [4, 'cheer'], hello: [4, 'wink'], lost: [4, 'sad'],
  // variant events
  startSpider: [4, 'happy'], startFreecell: [4, 'thinking'], startPyramid: [4, 'happy'], startTripeaks: [4, 'cheer'],
  pairMatch: [1, 'happy'], spiderDeal: [2, 'normal'], wrapPlay: [2, 'wink'],
  dealBlocked: [2, 'oops'], cellsFull: [2, 'shock'], cellsClear: [2, 'smug'], supermove: [2, 'hype'],
  kingSolo: [2, 'smug'], runBanked: [2, 'smug'],
  spiderRun: [3, 'cheer'], rowClear: [3, 'cheer'], peakClear: [3, 'cheer'],
};
const START_EV = { spider: 'startSpider', freecell: 'startFreecell', pyramid: 'startPyramid', tripeaks: 'startTripeaks' };

let mascotBox = { w: 0, h: 0, right: 0, bottom: 0, vw: 0, vh: 0, dirty: true, peek: null };
let mascotMeasureRaf = 0;
function measureMascotBox() {
  mascotBox.dirty = false;
  const el = Companion.el;
  if (!el || !settings.mascot) {
    mascotBox.w = 0; mascotBox.h = 0;
    return;
  }
  const box = Companion.body.offsetWidth ? Companion.body : el;
  const w = box.offsetWidth, h = box.offsetHeight;
  if (!w || !h) {
    mascotBox.w = 0; mascotBox.h = 0;
    return;
  }
  const cs = getComputedStyle(el);
  mascotBox.w = w;
  mascotBox.h = h;
  mascotBox.right = parseFloat(cs.right) || 0;
  mascotBox.bottom = parseFloat(cs.bottom) || 0;
  mascotBox.vw = innerWidth;
  mascotBox.vh = innerHeight;
}
function scheduleMascotMeasure() {
  mascotBox.dirty = true;
  if (mascotMeasureRaf) return;
  mascotMeasureRaf = requestAnimationFrame(() => {
    mascotMeasureRaf = 0;
    measureMascotBox();
    updatePeek();
  });
}

const Companion = {
  el: DOM.mascot, bubble: $('#bubble'), body: $('#mascotBody'),
  t: null, mt: null, tt: null, lineUntil: 0, linePri: 0, lastEv: '', lastEvT: 0,
  get c() { return Cast.get(settings.companion); },
  render() {
    const c = this.c, girl = c.kind === 'girl';
    const mode = settings.spriteMode === 'full' ? 'full' : 'corner';
    if (c.preload) c.preload(mode);
    this.el.dataset.partner = c.key;
    this.body.dataset.partner = c.key;
    this.el.removeAttribute('title');
    this.body.removeAttribute('title');
    this.body.innerHTML = c.html(mode);
    this.el.classList.toggle('is-girl', girl);
    this.el.classList.toggle('is-full', girl && mode === 'full');
    const btn = DOM.btnSpriteMode;
    if (btn) {
      btn.classList.toggle('hidden', !girl);
      btn.textContent = mode === 'full' ? '↕ Corner' : '↕ Full';
      btn.removeAttribute('title');
    }
    const img = this.body.querySelector('img');
    if (img && !img.complete) img.addEventListener('load', scheduleMascotMeasure, { once: true });
    const sm = DOM.startMascot;
    if (sm) {
      const startMood = c.moods.hello || 'happy';
      sm.dataset.partner = c.key;
      sm.removeAttribute('title');
      sm.innerHTML = girl ? c.html('full', startMood) : c.html('full');
      sm.parentElement.dataset.partner = c.key;
      sm.parentElement.removeAttribute('title');
      sm.parentElement.classList.toggle('is-girl', girl);
      sm.parentElement.dataset.mood = startMood;
    }
    const wm = DOM.winMascot;
    if (wm) {
      wm.dataset.partner = c.key;
      wm.removeAttribute('title');
      wm.parentElement.dataset.partner = c.key;
      wm.parentElement.removeAttribute('title');
      wm.parentElement.classList.toggle('is-girl', girl);
      wm.parentElement.dataset.mood = 'cheer';
      wm.innerHTML = DOM.winModal && !DOM.winModal.classList.contains('hidden') ? c.html('full') : '';
    }
    const lm = DOM.loseMascot;
    if (lm) {
      lm.dataset.partner = c.key;
      lm.removeAttribute('title');
      lm.parentElement.dataset.partner = c.key;
      lm.parentElement.removeAttribute('title');
      lm.parentElement.classList.toggle('is-girl', girl);
      lm.parentElement.dataset.mood = 'sad';
      lm.innerHTML = DOM.loseModal && !DOM.loseModal.classList.contains('hidden') ? c.html('full') : '';
    }
    const ci = DOM.cutin;
    if (ci) ci.dataset.partner = c.key;
    scheduleMascotMeasure();
    updatePeek();
  },
  mood(m, ms = 1300) {
    this.el.dataset.mood = m;
    clearTimeout(this.mt);
    this.mt = setTimeout(() => { this.el.dataset.mood = 'normal'; }, ms);
  },
  boing() {
    const b = this.body;
    b.classList.remove('boing', 'react-headpat', 'react-boop', 'react-highfive', 'react-fluster', 'react-startle');
    void b.offsetWidth;
    b.classList.add('boing');
  },
  talk(on, ms) {
    this.el.classList.toggle('talking', on);
    clearTimeout(this.tt);
    if (on) this.tt = setTimeout(() => this.el.classList.remove('talking'), ms || 6000);
    if (!on) updatePeek();
  },
  react(ev, opts) {
    const force = !!(opts && opts.force);
    if (!settings.mascot && !force) return null;
    const [pri0, mood0] = EVENTS[ev] || [2, 'normal'];
    const pri = force ? Math.max(pri0, 4) : pri0;
    const c = this.c, mood = c.moods[ev] || mood0;
    this.mood(mood, pri >= 3 ? 2600 : 1300);
    if (pri >= 2 && !force) this.boing();
    if (!force) {
      const ch = settings.chatter;
      if (ch === 'quiet' && pri < 3) return null;
      if (ch === 'some' && (pri < 2 || (pri === 2 && Math.random() > 0.45))) return null;
    }
    const now = Date.now();
    const milestone = /^(chain|musicChange|themeChange|suitDone|spiderRun|rowClear|peakClear|win|lost)/.test(ev);
    if (!force && !milestone && now < this.lineUntil && this.linePri > pri) return null; // don't talk over something more important
    if (!force && ev === this.lastEv && pri === 1 && now - this.lastEvT < 280) return null;
    this.lastEv = ev; this.lastEvT = now;
    const line = c.line(ev) || (force ? c.line('pet') : null);
    if (!line) return null;
    // speak first: if she's mid-sentence with something as important, skip this line entirely
    // (bubble included) so voice and text never get chopped or fall out of sync
    if (force) {
      this.speak(line, 4, true);
    } else if (milestone) {
      this.speak(line, Math.max(pri, 4));
    } else if (this.speak(line, pri) === 'busy') {
      return null;
    }
    const ms = pri >= 4 ? 5200 : Math.max(1500, Math.min(4500, 900 + line.show.length * 45));
    this.bubble.textContent = line.show;
    this.bubble.classList.add('show');
    clearTimeout(this.t);
    this.t = setTimeout(() => this.bubble.classList.remove('show'), ms);
    this.lineUntil = now + ms * (force ? 0.35 : pri <= 2 ? 0.45 : 0.65);
    this.linePri = force ? 3 : pri;
    return line;
  },
  speak(line, pri, force = false) {
    const flap = Math.min(1800, 300 + line.show.length * 35);
    if (settings.muted || !settings.voice) { this.talk(true, flap); return true; }
    if (this.c.kind === 'cat') { Sound.sfx.nya(); this.talk(true, 450); return true; }
    const speakOpts = {
      char: this.c.key, lang: settings.voiceLang, name: voiceNameFor(), slot: this.c.voice.slot || 0, volume: settings.voiceVol, pri,
      onstart: () => { this.talk(true); Sound.duck(true); },
      onend: () => { this.talk(false); Sound.duck(false); },
    };
    let r = Voice.speak(line, this.c.voice, speakOpts);
    if (force && r === 'busy') {
      Voice.stop();
      r = Voice.speak(line, this.c.voice, speakOpts);
    }
    if (r === 'busy') return r;
    if (!r) this.talk(true, flap);
    else this.talk(true, 7000); // until onend (with a safety timeout)
    return true;
  },
  silence() { Voice.stop(); this.talk(false); Sound.duck(false); },
};

// duck the companion down when tableau cards reach her corner
function updatePeek() {
  const el = Companion.el;
  if (!G || !settings.mascot || board.classList.contains('empty')) {
    if (mascotBox.peek !== false) { mascotBox.peek = false; el.classList.remove('peek'); }
    return;
  }
  if (!mascotBox.w || !mascotBox.h) {
    if (mascotBox.dirty) scheduleMascotMeasure();
    if (mascotBox.peek !== false) { mascotBox.peek = false; el.classList.remove('peek'); }
    return;
  }
  const w = mascotBox.w, h = mascotBox.h;
  const L = mascotBox.vw - mascotBox.right - w, T = mascotBox.vh - mascotBox.bottom - h;
  const minX = L + w * 0.12, maxX = L + w * 0.88, minBottomY = T + h * 0.30;
  const avail = M.H - M.tabY - M.gap - M.cardH;
  let hit = false;
  if (G.variant !== 'klondike') {
    for (let i = 0; i < useCount && !hit; i++) {
      const c = cards[i];
      if (!c.pile || c.x == null) continue;
      const x = M.boardLeft + c.x;
      if (x >= maxX || x + M.cw <= minX) continue;
      if (M.boardTop + c.y + M.cardH > minBottomY) hit = true;
    }
    if (mascotBox.peek !== hit) { mascotBox.peek = hit; el.classList.toggle('peek', hit); }
    return;
  }
  for (let i = 0; i < 7; i++) {
    const p = G.tab[i], len = p.length;
    if (!len) continue;
    const x = M.boardLeft + colX(i);
    if (x >= maxX || x + M.cw <= minX) continue;
    let dn = 0;
    while (dn < len - 1 && !p[dn].up) dn++;
    const total = dn * M.downGap + Math.max(0, len - dn - 1) * M.upGap;
    const s = total > avail && total > 0 ? Math.max(0.2, avail / total) : 1;
    const bottomY = M.boardTop + M.tabY + total * s + M.cardH;
    if (bottomY > minBottomY) { hit = true; break; }
  }
  if (mascotBox.peek !== hit) {
    mascotBox.peek = hit;
    el.classList.toggle('peek', hit);
  }
}
