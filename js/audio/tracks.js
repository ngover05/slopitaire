/* Slopitaire audio — the 16th-note music tracks (tempo, chords, bass, motifs) and melody phrase generation. */
const MusicTracks = (() => {
  'use strict';
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

  return { TRACKS, buildPhrases };
})();
