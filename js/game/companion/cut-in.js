/* Slopitaire — the anime cut-in banner with the companion's portrait. */
'use strict';

let cutT = null;
function cutIn(text) {
  if (!settings.cutins || !settings.mascot || settings.anim === 'off') return;
  Sound.sfx.cutin?.();
  const el = DOM.cutin, c = Companion.c;
  const mood = /APEX|BLITZ|BOOST/i.test(text) ? 'hype'
    : /SUIT|RUN|PEAK|ROW/i.test(text) ? 'cheer'
    : /VICTORY|WIN/i.test(text) ? 'cheer'
    : (c.key === 'rin' || c.key === 'kira' || c.key === 'ayame') ? 'smug'
    : (c.key === 'sakura' || c.key === 'kaede') ? 'cheer'
    : c.key === 'mio' ? 'happy' : 'wink';
  el.dataset.partner = c.key;
  el.querySelector('.cutin-girl').innerHTML = c.html('corner', mood);
  el.dataset.mood = mood;
  el.querySelector('.cutin-text').textContent = text;
  el.classList.remove('hidden', 'play'); void el.offsetWidth; el.classList.add('play');
  clearTimeout(cutT); cutT = setTimeout(() => el.classList.add('hidden'), 1900);
}
