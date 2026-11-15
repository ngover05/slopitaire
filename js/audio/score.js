/* Slopitaire audio — the music score: drum, bass, chord, arpeggio and lead voices for every track style, played one
 * 16th-note step at a time. The live engine (js/audio/sound.js) uses it as a fallback when the pre-rendered files
 * can't play, and the offline renderer (tools/music) records it into audio/music/ once per combo tier.
 * S: synthesis primitives from createSynth() plus { cfg, intensity(), recordKick(t) }. */
function createMusicScore(S) {
  'use strict';
  const { mtof, safeHz, tone, supersaw, chordStab, noise, bell, cfg } = S;
  const recordKick = (t) => S.recordKick && S.recordKick(t);
  // set at the start of every step (see sched below)
  let intensity = 0, phrases = null, loopN = 0;

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

  // st: absolute 16th step, t: its start time, bus: destination, phr: [main, variation] phrases, loop: loop index
  function sched(tr, st, t, bus, phr, loop) {
    intensity = S.intensity();
    phrases = phr;
    loopN = loop;
    const e16 = 60 / tr.bpm / 4;
    if (tr.style === 'chill') schedChill(tr, st, t, e16, bus);
    else schedElectronic(tr, st, t, e16, bus);
  }

  return { sched };
}
