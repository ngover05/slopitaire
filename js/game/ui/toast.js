/* Slopitaire — short toast messages. */
'use strict';

let toastT = null;
function toast(msg, ms = 2200) {
  const t = DOM.toast; t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
