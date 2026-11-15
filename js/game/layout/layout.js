/* Slopitaire — board measurement and placing cards & slots on screen. */
'use strict';

let M = {}, layoutDirty = true, slotsDirty = true, lastMeasW = -1, lastMeasH = -1, lastLeftHanded = null;
function measure(force) {
  if (!force && !layoutDirty && M.W > 0 && M.H > 0) return false;
  const W = board.clientWidth, H = board.clientHeight;
  layoutDirty = false;
  const br = board.getBoundingClientRect();
  const variant = G ? G.variant : settings.variant;
  if (W === lastMeasW && H === lastMeasH && M.cw && M.variant === variant) {
    M.boardLeft = br.left;
    M.boardTop = br.top;
    return false;
  }
  lastMeasW = W; lastMeasH = H;
  const { cols, hdiv } = VARIANTS[variant];
  const narrow = W < 600, gr = narrow ? 0.08 : 0.14;
  let cw = Math.min(W / (cols + (cols + 1) * gr), H / hdiv, 116);
  cw = Math.max(cw, 24);
  const ch = cw * 1.4, gap = cw * gr;
  const tall = H > W * 1.2;
  const topY = Math.max(gap, 6);
  const tabY = topY + ch + Math.max(gap * 1.8, 10);
  // FreeCell columns start 7 cards deep and every card is face up, so they fan tighter
  const upF = variant === 'freecell' ? (tall ? 0.27 : 0.23) : (tall ? 0.32 : 0.27);
  M = {
    W, H, cw, ch, gap, offX: (W - (cols * cw + (cols - 1) * gap)) / 2, topY, tabY, upF, cols, variant,
    downGap: ch * 0.11, upGap: ch * upF, cardH: ch,
    boardLeft: br.left, boardTop: br.top,
  };
  board.style.setProperty('--cw', cw + 'px');
  board.style.setProperty('--ch', ch + 'px');
  slotsDirty = true;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    c._rx = null; c._ry = null; c._rz = null; c._rup = null;
  }
  return true;
}
const colX = (i) => M.offX + i * (M.cw + M.gap);
function slotCol(kind, i) {
  const L = settings.leftHanded;
  if (kind === 'stock') return L ? 6 : 0;
  if (kind === 'waste') return L ? 5 : 1;
  if (kind === 'found') return L ? i : 3 + i;
  return i;
}
function slotEl(ref) {
  if (ref.t === 'found') return slots.found[ref.i];
  if (ref.t === 'tab') return slots.tab[ref.i];
  if (ref.t === 'cell') return slots.cell[ref.i];
  if (ref.t === 'pyr') return G.pyr[ref.i]?.[0]?.el || board;
  return slots[ref.t] || board;
}
function placeSlot(el, x, y) {
  if (el._rx === x && el._ry === y) return;
  el._rx = x; el._ry = y;
  el.style.transform = `translate3d(${x}px,${y}px,0)`;
}

function place(c, x, y, z, ref, idx, inst) {
  c.pile = ref; c.idx = idx;
  if (c._rup !== c.up) {
    c._rup = c.up;
    c.el.classList.toggle('up', c.up);
  }
  const moved = c.x !== null && (Math.abs(c.x - x) > 0.5 || Math.abs(c.y - y) > 0.5);
  c.x = x; c.y = y; c.z = z;
  if (c._rx !== x || c._ry !== y) {
    c._rx = x; c._ry = y;
    c.el.style.transform = `translate3d(${x}px,${y}px,0)`;
  }
  if (moved && !inst && moveMs() > 0) {
    const topZ = 4000 + z;
    if (c._rz !== topZ) {
      c._rz = topZ;
      c.el.style.zIndex = topZ;
    }
    clearTimeout(c.zt);
    c.zt = setTimeout(() => {
      c.zt = null;
      if (c._rz !== c.z) {
        c._rz = c.z;
        c.el.style.zIndex = c.z;
      }
    }, moveMs() + 90);
  } else if (!c.zt && c._rz !== z) {
    c._rz = z;
    c.el.style.zIndex = z;
  }
}

function layout(opts = {}) {
  if (!G) return;
  measure(!!opts.remeasure);
  const inst = !!opts.instant;
  if (inst) board.classList.add('no-anim');
  if (G.variant !== 'klondike') {
    LAYOUTS[G.variant](inst);
    if (inst) { void board.offsetHeight; board.classList.remove('no-anim'); }
    updateStockSlot();
    updatePeek();
    return;
  }
  const { cw, ch, topY, tabY, gap, H } = M;

  const sx = colX(slotCol('stock')), wx = colX(slotCol('waste'));
  if (slotsDirty || lastLeftHanded !== settings.leftHanded) {
    lastLeftHanded = settings.leftHanded;
    slotsDirty = false;
    placeSlot(slots.stock, sx, topY);
    placeSlot(slots.waste, wx, topY);
    for (let i = 0; i < 4; i++) placeSlot(slots.found[i], colX(slotCol('found', i)), topY);
    for (let i = 0; i < 7; i++) placeSlot(slots.tab[i], colX(i), tabY);
  }

  const thick = (j) => Math.floor(j / 8) * 0.8;
  G.stock.forEach((c, j) => place(c, sx - thick(j), topY - thick(j), 10 + j, { t: 'stock', i: 0 }, j, inst));

  const n = G.waste.length, fan = G.draw === 3 ? Math.min(G.wasteFan, n, 3) : 1;
  const dir = settings.leftHanded ? -1 : 1;
  G.waste.forEach((c, j) => {
    const k = j - (n - fan);
    place(c, wx + (k > 0 ? k * cw * 0.3 * dir : 0), topY, 60 + j, { t: 'waste', i: 0 }, j, inst);
  });

  G.found.forEach((p, i) => {
    const fx = colX(slotCol('found', i));
    p.forEach((c, j) => place(c, fx, topY, 120 + j, { t: 'found', i }, j, inst));
  });

  const downOff = ch * 0.11, upOff = ch * M.upF;
  G.tab.forEach((p, i) => {
    let total = 0;
    for (let j = 0; j < p.length - 1; j++) total += p[j].up ? upOff : downOff;
    const avail = H - tabY - gap - ch;
    const s = total > avail && total > 0 ? Math.max(0.2, avail / total) : 1;
    let y = tabY;
    p.forEach((c, j) => {
      place(c, colX(i), y, 200 + j, { t: 'tab', i }, j, inst);
      y += (c.up ? upOff : downOff) * s;
    });
  });

  if (inst) { void board.offsetHeight; board.classList.remove('no-anim'); }
  updateStockSlot();
  updatePeek();
}

function updateStockSlot() {
  if (!G || !slots.stock) return;
  const dead = !G.stock.length && !canRecycle();
  slots.stock.classList.toggle('dead', dead);
  slots.stock.firstChild.textContent = dead ? '✕' : '↻';
}

// re-measure and re-lay the table whenever the board changes size
function bindResize() {
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      layoutDirty = true;
      scheduleMascotMeasure();
      if (G && !drag) layout({ instant: true });
    }).observe(board);
    window.addEventListener('resize', scheduleMascotMeasure);
  } else {
    window.addEventListener('resize', () => {
      layoutDirty = true;
      scheduleMascotMeasure();
      if (G) layout({ instant: true });
    });
  }
}
