/* Slopitaire — dragging cards, drop targets and drop guides. */
'use strict';

let drag = null, guideEls = [];
function onDown(e, targetEl) {
  if (!G || busy || G.won || G.lost) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  Sound.ensure(); noteActivity();
  const hit = targetEl || e.target;
  const cardEl = hit.closest('.card');
  if (cardEl) {
    const c = cards[+cardEl.dataset.id];
    if (!c.pile) return;
    if (c.pile.t === 'stock') { drawStock(); return; }
    const mov = movableFrom(c);
    if (!mov) return;
    e.preventDefault();
    drag = {
      c, mov, src: c.pile, idx: c.idx,
      sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, lastX: e.clientX, tilt: 0,
      pendingX: e.clientX, pendingY: e.clientY, hasPending: false, raf: 0,
      started: false, id: e.pointerId,
    };
  } else if (hit.closest('.slot-stock')) drawStock();
}
function flushDrag() {
  if (!drag) return;
  drag.raf = 0;
  if (!drag.hasPending) return;
  drag.hasPending = false;
  const cx = drag.pendingX, cy = drag.pendingY;
  drag.dx = cx - drag.sx; drag.dy = cy - drag.sy;
  if (!drag.started) {
    if (Math.hypot(drag.dx, drag.dy) < 6) return;
    drag.started = true; clearHints();
    for (let k = 0; k < drag.mov.length; k++) {
      const c = drag.mov[k];
      c.el.classList.add('dragging');
      clearTimeout(c.zt); c.zt = null;
      c._rx = null; c._ry = null; c._rz = 9000 + k;
      c.el.style.zIndex = 9000 + k;
    }
    document.body.classList.add('is-dragging');
    if (settings.dropGuides) showGuides(drag.mov, drag.src);
    if (drag.mov.length >= 2 && Sound.sfx.multiPick) Sound.sfx.multiPick(drag.mov.length);
    else Sound.sfx.pick();
    Companion.react('pick');
  }
  drag.tilt = drag.tilt * 0.7 + Math.max(-8, Math.min(8, (cx - drag.lastX) * 0.8)) * 0.3;
  drag.lastX = cx;
  const rot = settings.anim === 'off' ? 0 : drag.tilt;
  const rotStr = rot === 0 ? '' : ` rotate(${rot.toFixed(2)}deg)`;
  for (let k = 0; k < drag.mov.length; k++) {
    const c = drag.mov[k];
    c.el.style.transform = `translate3d(${c.x + drag.dx}px,${c.y + drag.dy}px,0)${rotStr}`;
  }
}
function onMove(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag.pendingX = e.clientX;
  drag.pendingY = e.clientY;
  drag.hasPending = true;
  if (!drag.raf) drag.raf = requestAnimationFrame(flushDrag);
}
function onUp(e) {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.raf) { cancelAnimationFrame(drag.raf); drag.raf = 0; }
  if (drag.hasPending) flushDrag();
  const d = drag; drag = null;
  document.body.classList.remove('is-dragging');
  clearGuides();
  if (!d.started) { tapCard(d.c); return; }
  d.mov.forEach((c) => {
    c.el.classList.remove('dragging');
    c.x += d.dx; c.y += d.dy;
    c._rx = null; c._ry = null; c._rz = null;
  });
  const dst = e.type === 'pointercancel' ? null : findDrop(d.mov, d.src);
  if (dst) doMove(d.src, d.idx, dst);
  else {
    layout();
    if (Math.hypot(d.dx, d.dy) > M.cw * 0.6) {
      Sound.sfx.invalid();
      PopupFX?.float(d.c.el, '✕ INVALID DROP', { kind: 'warn' });
      PopupFX?.stamp('OOPS!', 'oops', 'amber', false);
      if (G.chain > 0) breakChain('miss');
      Companion.react('invalid');
    }
  }
}
function overlap(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

// every pile a dragged card might land on, for this variant
function dropRefs() {
  const refs = [];
  const add = (t, n) => { for (let i = 0; i < n; i++) refs.push({ t, i }); };
  switch (G.variant) {
    case 'spider': add('tab', 10); break;
    case 'freecell': add('cell', 4); add('found', 4); add('tab', 8); break;
    case 'pyramid': add('found', 1); add('pyr', 28); refs.push({ t: 'waste', i: 0 }); break;
    case 'tripeaks': refs.push({ t: 'waste', i: 0 }); break;
    default: add('found', 4); add('tab', 7);
  }
  return refs;
}
function findDrop(mov, src) {
  const c0 = mov[0], r = { x: c0.x, y: c0.y, w: M.cw, h: M.ch };
  let best = null, bestA = 0;
  for (const ref of dropRefs()) {
    if (src.t === ref.t && src.i === ref.i) continue;
    if (!canDrop(mov, ref)) continue;
    const p = pileOf(ref), top = p[p.length - 1];
    let x, y, h = M.ch;
    if (top && top !== c0) { x = top.x; y = top.y; if (ref.t === 'tab') h = M.ch * 1.3; }
    else { const el = slotEl(ref); x = el._rx; y = el._ry; }
    if (x == null) continue;
    const a = overlap(r, { x, y, w: M.cw, h });
    if (a > bestA) { bestA = a; best = ref; }
  }
  return bestA > M.cw * M.ch * 0.06 ? best : null;
}
function showGuides(mov, src) {
  clearGuides();
  dropRefs().forEach((ref) => {
    if ((ref.t === src.t && ref.i === src.i) || !canDrop(mov, ref)) return;
    const p = pileOf(ref);
    const el = p.length ? p[p.length - 1].el : slotEl(ref);
    el.classList.add('drop-ok');
    guideEls.push(el);
  });
}
function clearGuides() {
  for (let i = 0; i < guideEls.length; i++) guideEls[i].classList.remove('drop-ok');
  guideEls.length = 0;
}

// pointer handlers on the board (pointermove / up are on window so a drag can leave the board)
function bindDragInput() {
  board.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  board.addEventListener('contextmenu', (e) => e.preventDefault());
}
