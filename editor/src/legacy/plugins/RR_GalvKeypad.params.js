'use strict';
// Plugin parameters for RR_GalvKeypad from the game's copy of Galv's Keypad Input (Keypad::KEYPAD_VAR,
// MAX_NUM, OK_SE) and the game's Font.default_size.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const C = require('../RgssConvert.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /class Scene_Keypad\b/.test(s)) || '';
    const k = (name, d) => (constants['Keypad::' + name] === undefined ? d : constants['Keypad::' + name]);
    let okSe = { name: '', volume: 100, pitch: 100 };
    const at = /^[ \t]*OK_SE\s*=\s*/m.exec(source);
    if (at) {
        try {
            const [name, volume, pitch] = readLiteral(source, at.index + at[0].length)[0];
            okSe = { name: String(name ?? ''), volume: Number(volume ?? 100), pitch: Number(pitch ?? 100) };
        } catch (_) { /* unreadable: no sound */ }
    }
    const size = C.fontDefaults(sources, constants).size;
    return {
        variable: String(Number(k('KEYPAD_VAR', 20)) || 0),
        maxDigits: String(Number(k('MAX_NUM', 4)) || 4),
        okSe: JSON.stringify(okSe),
        rgssFontSize: String(typeof size === 'number' ? size : 24)
    };
}

module.exports = { extract };
