'use strict';
// Plugin parameters for RR_HimeItemRarity from the game's copy of Hime's Item Rarity (TH::Item_Rarity::Colour_Map).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /\$imported\[:TH_ItemRarity\]\s*=\s*true/.test(s)) || '';
    const m = /Colour_Map\s*=\s*/.exec(source);
    let map = null;
    if (m) try { map = readLiteral(source, m.index + m[0].length)[0]; } catch (_) { map = null; }
    return { colours: JSON.stringify(map instanceof Map ? Object.fromEntries([...map].map(([k, v]) => [String(k), v])) : { 1: [255, 255, 255] }) };
}

module.exports = { extract };
