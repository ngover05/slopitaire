/* Slopitaire — small DOM & helper utilities shared by every script. */
'use strict';

const $ = (s) => document.querySelector(s);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// escape text for use inside HTML markup
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => (
  ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'
));
