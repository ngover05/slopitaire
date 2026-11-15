/* Slopitaire — the card elements and empty-pile slots on the board, and their per-variant faces. */
'use strict';

// 104 cards so Spider's two decks fit; 52-card variants use ids 0..51 and hide the rest.
const cards = Array.from({ length: 104 }, (_, id) => ({
  id, suit: ((id % 52) / 13) | 0, rank: (id % 13) + 1, red: (((id % 52) / 13) | 0) < 2,
  up: false, el: null, x: null, y: null, z: 0, zt: null, pile: null, idx: 0,
  _rx: null, _ry: null, _rz: null, _rup: false,
}));
const slots = { stock: null, waste: null, found: [], tab: [], cell: [] };

function mkSlot(kind, i, label) {
  const s = document.createElement('div');
  s.className = 'slot slot-' + kind; s.dataset.kind = kind; s.dataset.i = i;
  s.innerHTML = `<span class="slot-ic">${label}</span>`;
  board.appendChild(s);
  return s;
}

// the empty-pile outlines each variant needs; rebuilt whenever the variant changes
let slotVariant = '';
function buildSlots(variant) {
  if (slotVariant === variant) return;
  slotVariant = variant;
  board.querySelectorAll('.slot').forEach((el) => el.remove());
  slots.stock = null; slots.waste = null; slots.found = []; slots.tab = []; slots.cell = [];
  const first = board.firstChild;
  const add = (kind, i, label) => { const el = mkSlot(kind, i, label); board.insertBefore(el, first); return el; };
  if (variant === 'spider') {
    slots.stock = add('stock', 0, '↻');
    for (let i = 0; i < 8; i++) slots.found.push(add('found', i, 'K'));
    for (let i = 0; i < 10; i++) slots.tab.push(add('tab', i, ''));
  } else if (variant === 'freecell') {
    for (let i = 0; i < 4; i++) slots.cell.push(add('cell', i, '◇'));
    for (let i = 0; i < 4; i++) slots.found.push(add('found', i, 'A'));
    for (let i = 0; i < 8; i++) slots.tab.push(add('tab', i, ''));
  } else if (variant === 'pyramid') {
    slots.stock = add('stock', 0, '↻');
    slots.waste = add('waste', 0, '');
    slots.found.push(add('found', 0, '13'));
  } else if (variant === 'tripeaks') {
    slots.stock = add('stock', 0, '✕');
    slots.waste = add('waste', 0, '');
  } else {
    slots.stock = add('stock', 0, '↻');
    slots.waste = add('waste', 0, '');
    for (let i = 0; i < 4; i++) slots.found.push(add('found', i, 'A'));
    for (let i = 0; i < 7; i++) slots.tab.push(add('tab', i, 'K'));
  }
  board.dataset.variant = variant;
  slotsDirty = true;
}
function buildTable() {
  cards.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'card'; el.dataset.id = c.id;
    el.setAttribute('aria-label', Art.RANKS[c.rank - 1] + ' of ' + SUIT_NAMES[c.suit]);
    el.innerHTML = `<div class="card-inner"><div class="card-face front">${Art.cardFace(c)}</div><div class="card-face back"></div></div>`;
    board.appendChild(el);
    c.el = el;
    c.front = el.querySelector('.front');
  });
  buildSlots('klondike');
}

// Spider re-skins its 104 cards into 1, 2 or 4 suits; everything else uses the standard id → suit mapping.
let faceMode = 'std', useCount = 104;
function applyFaces(variant, suits) {
  const mode = variant === 'spider' ? 'spider' + suits : 'std';
  useCount = VARIANTS[variant].deck;
  for (const c of cards) c.el.classList.toggle('unused', c.id >= useCount);
  if (mode === faceMode) return;
  faceMode = mode;
  for (const c of cards) {
    const suit = variant === 'spider' ? VSolver.spiderSuit(c.id, suits) : ((c.id % 52) / 13) | 0;
    if (suit === c.suit) continue;
    c.suit = suit; c.red = suit < 2;
    c.front.innerHTML = Art.cardFace(c);
    c.el.setAttribute('aria-label', Art.RANKS[c.rank - 1] + ' of ' + SUIT_NAMES[c.suit]);
  }
}
