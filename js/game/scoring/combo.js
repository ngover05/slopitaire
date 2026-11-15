/* Slopitaire — the shared combo engine: tiers, multipliers, chain timing and milestones. */
'use strict';

const SWAP_LIMIT = 3;   // tableau shuffles of one card (without revealing anything) before the combo is killed
let breakT = null;      // clears the combo HUD's break animation

function tierOf(combo) {
  if (combo >= 30) return { tier: 4, label: 'APEX!', mult: 3.0 };
  if (combo >= 20) return { tier: 3, label: 'BLITZ', mult: 2.0 };
  if (combo >= 10) return { tier: 2, label: 'BOOST', mult: 1.5 };
  if (combo >= 5) return { tier: 1, label: 'SURGE', mult: 1.2 };
  return { tier: 0, label: combo > 0 ? 'ACTIVE' : 'IDLE', mult: 1.0 };
}

function breakChain(reason = 'timeout') {
  if (!G || G.chain <= 0) return;
  const old = G.chain;
  G.chain = 0;
  G.chainUntil = 0;
  G.warnedChain = false;
  G.combo = 0;
  syncComboHud(false);
  const hud = DOM.comboHud;
  if (hud) {
    hud.classList.remove('pulse', 'danger', 'break');
    void hud.offsetWidth;
    hud.classList.add('break');
    clearTimeout(breakT);
    breakT = setTimeout(() => hud.classList.remove('break'), 520);
  }
  // TriPeaks: however a run ends (a draw, the clock, a mis-tap) it is cashed in, not lost
  if (G.variant === 'tripeaks') {
    if (reason !== 'undo') bankRun(old, reason);   // undo restores the score as it was; nothing to pay out
    return reason;
  }
  if (old >= 4) {
    PopupFX?.pill('✕', 'COMBO RESET', `LOST ×${old} STREAK`, 'danger');
  }
  if (old >= 5) {
    (Sound.sfx.comboBreak || Sound.sfx.chainBreak)?.(old);
    Companion.react('chainBreak');
    PopupFX?.banner('STREAK BROKEN', 'COMBO RESET', 'danger', true);
    PopupFX?.stamp('OOPS!', 'shock', 'amber', true);
  }
  StageBG?.pulse('#ff6b57', old >= 10 ? 0.85 : 0.45);
  return reason;
}

// chainCtx() snapshots the combo timing before a move; stepChain() then counts the move into the combo.
function chainCtx(now) {
  return {
    now, prevChain: G.chain, dtPrev: G.lastMoveAt > 0 ? now - G.lastMoveAt : 0,
    remRatio: 0, wasClutch: false, wasClutchPop: false, wasFast: false, stepped: false,
  };
}
function stepChain(x, gain = 1) {
  const now = x.now;
  x.remRatio = G.chain > 0 && G.chainDur > 0 ? (G.chainUntil - now) / G.chainDur : 0;
  x.wasClutch = G.chain >= 5 && x.remRatio > 0 && x.remRatio < 0.22;
  x.wasClutchPop = x.prevChain >= 3 && x.remRatio > 0 && x.remRatio < 0.28;
  x.wasFast = x.dtPrev > 0 && x.dtPrev < 1450 && G.chain >= 2;
  G.chain += gain;
  if (G.chain > G.maxChain) G.maxChain = G.chain;
  G.chainDur = Math.max(5500, 9500 - Math.min(G.chain, 30) * 100);
  G.chainUntil = now + G.chainDur;
  G.warnedChain = false;
  G.lastMoveAt = now;
  if (!G.dealFirstMoveAt) G.dealFirstMoveAt = now;
  G.openerMoves = (G.openerMoves || 0) + 1;
  syncComboHud(true);
  Sound.sfx.comboTick?.(G.chain);
  if (x.wasClutch || x.wasClutchPop) Sound.sfx.comboSave?.();
  x.stepped = true;
  return x;
}

// drawing / dealing keeps a live combo going a little longer instead of counting toward it
function extendChain(ms = 2400) {
  if (G.chain <= 0) return;
  const now = Date.now();
  G.chainUntil = Math.min(now + G.chainDur, G.chainUntil + ms);
  if (G.chainDur > 0 && (G.chainUntil - now) / G.chainDur >= 0.22) {
    G.warnedChain = false;
    DOM.comboHud?.classList.remove('danger');
  }
  syncComboHud(false);
}

// SURGE / BOOST / BLITZ / APEX promotions: sfx, stage pulse, ticker pill, companion line and cut-in
function comboMilestones(prevChain, willWin, fire = true) {
  const crossed = (m) => prevChain < m && G.chain >= m;
  const crossedHigh = G.chain >= 30 && (crossed(30) || (prevChain >= 30 && Math.floor((G.chain - 30) / 15) > Math.floor((prevChain - 30) / 15)));
  let milestoneFired = false;
  if (fire) {
    if (crossedHigh) {
      milestoneFired = true;
      (Sound.sfx.comboMilestone || Sound.sfx.chainMilestone)?.(4);
      StageBG?.pulse('#ffe169', 1.2);
      PopupFX?.pill('★', 'APEX! ×3.0', `${G.chain} HIT STREAK`, 'gold', { medal: true });
      if (!willWin) { Companion.react('chain30'); cutIn(`APEX COMBO ×${G.chain}!!`); }
    } else if (crossed(25)) {
      PopupFX?.pill('🔥', '25 HIT STREAK', 'APPROACHING APEX', 'gold', { medal: true });
    } else if (crossed(20)) {
      milestoneFired = true;
      (Sound.sfx.comboMilestone || Sound.sfx.chainMilestone)?.(3);
      StageBG?.pulse('#ffb638', 1.0);
      PopupFX?.pill('🔥', 'BLITZ ×2.0', '20 HIT STREAK', 'gold', { medal: true });
      if (!willWin) { Companion.react('chain20'); cutIn(`BLITZ ×${G.chain}!`); }
    } else if (crossed(15)) {
      PopupFX?.pill('⚡', '15 HIT STREAK', 'BOOST SUSTAINED', 'amber', { medal: true });
    } else if (crossed(10)) {
      milestoneFired = true;
      (Sound.sfx.comboMilestone || Sound.sfx.chainMilestone)?.(2);
      StageBG?.pulse('#2ce8a2', 0.9);
      PopupFX?.pill('⚡', 'BOOST ×1.5', '10 HIT STREAK', 'amber', { medal: true });
      if (!willWin) { Companion.react('chain10'); cutIn(`BOOST ×${G.chain}!`); }
    } else if (crossed(5)) {
      milestoneFired = true;
      (Sound.sfx.comboMilestone || Sound.sfx.chainMilestone)?.(1);
      StageBG?.pulse('#2ce8a2', 0.7);
      PopupFX?.pill('◈', 'SURGE ×1.2', '5 HIT STREAK', 'emerald', { medal: true });
      if (!willWin) Companion.react('chain5');
    }
  }
  return { crossed, crossedHigh, milestoneFired };
}
