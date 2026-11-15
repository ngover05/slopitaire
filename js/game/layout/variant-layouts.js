/* Slopitaire — table layouts for each variant (columns, pyramid, peaks, cells). */
'use strict';

// a fanned tableau column, squeezed when it would run off the bottom of the board
function layoutColumn(p, i, x, y0, inst) {
  const { ch, gap, H } = M, downOff = ch * 0.11, upOff = ch * M.upF;
  let total = 0;
  for (let j = 0; j < p.length - 1; j++) total += p[j].up ? upOff : downOff;
  const avail = H - y0 - gap - ch;
  const s = total > avail && total > 0 ? Math.max(0.12, avail / total) : 1;
  let y = y0;
  p.forEach((c, j) => {
    place(c, x, y, 200 + j, { t: 'tab', i }, j, inst);
    y += (c.up ? upOff : downOff) * s;
  });
}
const unitX = (u) => M.offX + u * (M.cw + M.gap);
function placeSlots(fn) {
  if (!slotsDirty && lastLeftHanded === settings.leftHanded) return;
  lastLeftHanded = settings.leftHanded;
  slotsDirty = false;
  fn();
}
const LAYOUTS = {
  spider(inst) {
    const L = settings.leftHanded, { cw, topY, tabY } = M;
    const stockCol = L ? 0 : 9, foundCol = (k) => (L ? 2 + k : k);
    placeSlots(() => {
      placeSlot(slots.stock, colX(stockCol), topY);
      slots.found.forEach((el, k) => placeSlot(el, colX(foundCol(k)), topY));
      slots.tab.forEach((el, i) => placeSlot(el, colX(i), tabY));
    });
    // the stock shows one fanned card back per deal left, like a hand of rows waiting to be dealt
    const rows = Math.ceil(G.stock.length / 10), step = cw * 0.16 * (L ? 1 : -1);
    G.stock.forEach((c, j) => {
      const g = (j / 10) | 0;
      place(c, colX(stockCol) + (rows - 1 - g) * step, topY, 10 + j, { t: 'stock', i: 0 }, j, inst);
    });
    G.found.forEach((p, k) => p.forEach((c, j) => place(c, colX(foundCol(k)), topY, 120 + j, { t: 'found', i: k }, j, inst)));
    G.tab.forEach((p, i) => layoutColumn(p, i, colX(i), tabY, inst));
  },
  freecell(inst) {
    const L = settings.leftHanded, { topY, tabY } = M;
    const cellCol = (k) => (L ? 4 + k : k), foundCol = (k) => (L ? k : 4 + k);
    placeSlots(() => {
      slots.cell.forEach((el, k) => placeSlot(el, colX(cellCol(k)), topY));
      slots.found.forEach((el, k) => placeSlot(el, colX(foundCol(k)), topY));
      slots.tab.forEach((el, i) => placeSlot(el, colX(i), tabY));
    });
    G.cells.forEach((p, k) => p.forEach((c, j) => place(c, colX(cellCol(k)), topY, 140 + j, { t: 'cell', i: k }, j, inst)));
    G.found.forEach((p, k) => p.forEach((c, j) => place(c, colX(foundCol(k)), topY, 120 + j, { t: 'found', i: k }, j, inst)));
    G.tab.forEach((p, i) => layoutColumn(p, i, colX(i), tabY, inst));
  },
  pyramid(inst) {
    const L = settings.leftHanded, { ch, topY } = M;
    const sCol = L ? 6 : 0, wCol = L ? 5 : 1, dCol = L ? 0 : 6;
    placeSlots(() => {
      placeSlot(slots.stock, colX(sCol), topY);
      placeSlot(slots.waste, colX(wCol), topY);
      placeSlot(slots.found[0], colX(dCol), topY);
    });
    const thick = (j) => Math.floor(j / 8) * 0.8;
    G.stock.forEach((c, j) => place(c, colX(sCol) - thick(j), topY - thick(j), 10 + j, { t: 'stock', i: 0 }, j, inst));
    G.waste.forEach((c, j) => place(c, colX(wCol), topY, 60 + j, { t: 'waste', i: 0 }, j, inst));
    G.found[0].forEach((c, j) => place(c, colX(dCol) - thick(j) * 0.5, topY - thick(j) * 0.5, 120 + j, { t: 'found', i: 0 }, j, inst));
    G.pyr.forEach((p, i) => {
      const c = p[0];
      if (!c) return;
      const r = VS.PYR_ROW[i], j = i - (r * (r + 1)) / 2;
      place(c, unitX(3 + j - r / 2), topY + r * ch * 0.5, 300 + i, { t: 'pyr', i }, 0, inst);
      c.el.classList.toggle('covered', !pyrExposed(i));
    });
  },
  tripeaks(inst) {
    const { cw, ch, gap, topY } = M;
    const sU = 3.6, wU = 5.4, rowY = topY + ch * 1.5 + ch + Math.max(gap * 2, 14);
    placeSlots(() => {
      placeSlot(slots.stock, unitX(sU), rowY);
      placeSlot(slots.waste, unitX(wU), rowY);
    });
    // the stock fans to the left so you can see how many draws are left
    const n = G.stock.length, fan = Math.min(cw * 0.07, (cw * 2.2) / Math.max(1, n));
    G.stock.forEach((c, j) => place(c, unitX(sU) - (n - 1 - j) * fan, rowY, 10 + j, { t: 'stock', i: 0 }, j, inst));
    G.waste.forEach((c, j) => place(c, unitX(wU), rowY, 60 + j, { t: 'waste', i: 0 }, j, inst));
    G.pyr.forEach((p, i) => {
      const c = p[0];
      if (!c) return;
      const r = VS.TP_ROW[i];
      let u;
      if (r === 0) u = 3 * i + 1.5;
      else if (r === 1) { const j = i - 3; u = 3 * (j >> 1) + (j & 1) + 1; }
      else if (r === 2) u = i - 9 + 0.5;
      else u = i - 18;
      place(c, unitX(u), topY + r * ch * 0.5, 300 + i, { t: 'pyr', i }, 0, inst);
    });
  },
};
