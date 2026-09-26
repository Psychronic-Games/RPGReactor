'use strict';
// Plugin parameters for RR_GalvItemSounds from the game's copy of Galv's Item/Equip Sound Effects
// (Menu_Use_SE::OPTIMIZE_EQUIP_SE, CLEAR_EQUIP_SE).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /module Menu_Use_SE\b/.test(s)) || '';
    const sound = (name) => {
        const at = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
        let se = { name: '', volume: 100, pitch: 100 };
        if (at) {
            try {
                const [n, volume, pitch] = readLiteral(source, at.index + at[0].length)[0];
                se = { name: String(n ?? ''), volume: Number(volume ?? 0), pitch: Number(pitch ?? 0) };
            } catch (_) { /* unreadable: the Equip sound */ }
        }
        return JSON.stringify(se);
    };
    return { optimizeSe: sound('OPTIMIZE_EQUIP_SE'), clearSe: sound('CLEAR_EQUIP_SE') };
}

module.exports = { extract };
