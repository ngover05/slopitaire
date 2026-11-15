#!/usr/bin/env node
/* Prints every spoken voice line in js/cast.js as JSON, for tools/voice/voicegen.py.
 *
 * It runs the game's own cast.js in a sandbox and uses its Voice.speakable() and Voice.clipId(), so the
 * text that gets rendered and the clip file names are exactly what the game computes at runtime.
 *
 * Output: { "<char>": { "en": [{ "id", "text", "events": [...] }], "ja": [...] }, ... }
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');
const castPath = path.join(root, 'js', 'cast.js');
const src = fs.readFileSync(castPath, 'utf8');

const sandbox = {
  window: {},
  TextEncoder,
  setTimeout: () => 0,
  clearTimeout: () => {},
  console,
};
vm.createContext(sandbox);
// `const` declarations at script top level don't become context properties, so hand them back explicitly.
vm.runInContext(`${src}\n;globalThis.__out = { Voice, Cast };`, sandbox, { filename: castPath });
const { Voice, Cast } = sandbox.__out;

const out = {};
for (const key of Cast.keys) {
  const c = Cast.CAST[key];
  if (!c.voice || !c.lines) continue; // non-speaking companions (e.g. the cat) have no clips
  const langs = { en: new Map(), ja: new Map() };
  for (const [ev, pool] of Object.entries(c.lines)) {
    for (const item of pool) {
      if (!Array.isArray(item)) continue;
      for (const [lang, raw] of [['ja', item[1]], ['en', item[2]]]) {
        const text = Voice.speakable(raw || '', lang === 'ja');
        if (!text) continue;
        const id = Voice.clipId(text);
        const m = langs[lang];
        if (!m.has(id)) m.set(id, { id, text, events: [] });
        const e = m.get(id);
        if (!e.events.includes(ev)) e.events.push(ev);
      }
    }
  }
  out[key] = { name: c.name, en: [...langs.en.values()], ja: [...langs.ja.values()] };
}
process.stdout.write(JSON.stringify(out));
