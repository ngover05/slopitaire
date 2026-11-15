/* Slopitaire — static game definitions: difficulties, variants, stat keys and pile counts. */
'use strict';

const DIFF = {
  easy: {
    label: 'Easy', icon: '🌸', solvable: true, undo: true, undoCost: 0, hints: Infinity,
    passes: { 1: Infinity, 3: Infinity }, mult: 1, deals: 'gentle',
    desc: 'Gentle, always-winnable deals ♡ Unlimited undo, hints & redeals.',
  },
  medium: {
    label: 'Medium', icon: '⭐', solvable: false, undo: true, undoCost: 10, hints: 3,
    passes: { 1: 3, 3: Infinity }, mult: 1.5,
    desc: 'Random deals. Undo costs 10 pts, 3 hints. Draw-1 allows 3 passes.',
  },
  hard: {
    label: 'Hard', icon: '🔥', solvable: true, undo: false, undoCost: 0, hints: 0,
    passes: { 1: 1, 3: 3 }, mult: 2, deals: 'tricky',
    desc: 'Tricky winnable deals, no undo, no hints. 1 pass (draw-1) or 3 passes (draw-3).',
  },
  auto: {
    label: 'Auto', icon: '◈', solvable: true, undo: true, undoCost: 0, hints: Infinity,
    passes: { 1: Infinity, 3: Infinity }, mult: 1, autoPlay: true,
    desc: 'AI autopilot plays a winnable deal at a steady pace ◈',
  },
};

// Every variant shares the combo engine, pop-ups, companions, saves and the four difficulties. Difficulty keeps its
// meaning everywhere (undo / hints / score ×, and verified deals on Easy, Hard and Auto); each variant adds its own
// rule knobs on top (Spider's suit count, Pyramid's redeal passes).
const VARIANTS = {
  klondike: { label: 'Klondike', icon: '♠', deck: 52, cols: 7, hdiv: 5.5, tagline: 'Build down in alternating colours and send every suit home.' },
  spider: { label: 'Spider', icon: '🕷', deck: 104, cols: 10, hdiv: 5.5, tagline: 'Build King-to-Ace runs of one suit to lift them off the table.' },
  freecell: { label: 'FreeCell', icon: '❄', deck: 52, cols: 8, hdiv: 5.5, tagline: 'Every card face up, four free cells: pure strategy.' },
  pyramid: { label: 'Pyramid', icon: '🔺', deck: 52, cols: 7, hdiv: 6.0, tagline: 'Pair cards that add up to 13 (Kings go alone) to dismantle the pyramid.' },
  tripeaks: { label: 'TriPeaks', icon: '⛰', deck: 52, cols: 10, hdiv: 5.4, tagline: 'Play cards one higher or lower than the waste and chain long runs.' },
};
const VARIANT_KEYS = Object.keys(VARIANTS);
const DIFF_DESC = {
  spider: {
    easy: 'Gentle verified deals (1–2 suits) ♡ Unlimited undo & hints.',
    medium: 'Random deals. Undo costs 10 pts, 3 hints.',
    hard: 'Tricky verified deals (1–2 suits), no undo, no hints.',
    auto: 'AI autopilot weaves the web for you ◈',
  },
  freecell: {
    easy: 'Gentle, always-winnable deals ♡ Unlimited undo & hints.',
    medium: 'Random deals. Undo costs 10 pts, 3 hints.',
    hard: 'Tricky winnable deals, no undo, no hints.',
    auto: 'AI autopilot solves a winnable deal ◈',
  },
  pyramid: {
    easy: 'Winnable deals, unlimited redeals ♡ Unlimited undo & hints.',
    medium: 'Random deals, 3 passes. Undo costs 10 pts, 3 hints.',
    hard: 'Winnable in 2 passes, no undo, no hints.',
    auto: 'AI autopilot pairs off a winnable pyramid ◈',
  },
  tripeaks: {
    easy: 'Gentle winnable deals ♡ Unlimited undo & hints.',
    medium: 'Random deals. Undo costs 10 pts, 3 hints.',
    hard: 'Tricky winnable deals, no undo, no hints.',
    auto: 'AI autopilot climbs a winnable deal ◈',
  },
};
const diffDesc = (variant, diff) => DIFF_DESC[variant]?.[diff] || DIFF[diff].desc;

// Pyramid redeal passes per difficulty (Klondike's live in DIFF.passes; TriPeaks never redeals)
const PYRAMID_PASSES = { easy: Infinity, medium: 3, hard: 2, auto: Infinity };

// Solver effort (positions searched) that splits gentle / ordinary / tricky deals, calibrated per variant
const DEAL_NODES = {
  freecell: { gentle: 200, tricky: 1500 },
  tripeaks: { gentle: 70, tricky: 400 },
  pyramid: { gentle: 80, tricky: 300 },
  spider1: { gentle: 160, tricky: 800 },
  spider2: { gentle: 1500, tricky: 6000 },
};
// Klondike's equivalent: gentle = solved within GENTLE_NODES with aces/2s buried at most GENTLE_BURY deep,
// tricky = needs more than OBVIOUS_NODES (see js/game/analysis/deal-finder.js)
const GENTLE_NODES = 300, GENTLE_BURY = 5, OBVIOUS_NODES = 150;

// stats are kept per variant and difficulty; Klondike keeps the bare difficulty keys it always had
const statKey = (variant, diff) => (variant === 'klondike' ? diff : `${variant}_${diff}`);
const STAT_KEYS = VARIANT_KEYS.flatMap((v) => Object.keys(DIFF).map((d) => statKey(v, d)));
const STAT_KEY_SET = new Set(STAT_KEYS);

const SUIT_NAMES = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
const SUIT_SYMS = ['♥', '♦', '♣', '♠'];

const PILE_COUNTS = {
  klondike: { found: 4, tab: 7, cell: 0, pyr: 0 },
  spider: { found: 8, tab: 10, cell: 0, pyr: 0 },
  freecell: { found: 4, tab: 8, cell: 4, pyr: 0 },
  pyramid: { found: 1, tab: 0, cell: 0, pyr: 28 },
  tripeaks: { found: 0, tab: 0, cell: 0, pyr: 28 },
};
