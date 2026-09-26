'use strict';
// Plugin parameters for RR_TheoCommandHelp from the game's copy of Theo's Command Help Popup (Theo::CmnHelp::List,
// Button, ShowTime) and the game's Font.default_size.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const C = require('../RgssConvert.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
// RGSS buttons as MZ's Input names them in an imported game.
const BUTTONS = { A: 'shift', B: 'cancel', C: 'ok', X: 'rgssX', Y: 'rgssY', Z: 'rgssZ', L: 'pageup', R: 'pagedown', SHIFT: 'shift', CTRL: 'control', ALT: 'alt' };

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\[:Theo_CommandHelp\]\s*=\s*true/.test(s)) || '';
    const list = {};
    const at = /^\s*List\s*=\s*/m.exec(source);
    if (at) {
        const value = readLiteral(source, at.index + at[0].length)[0];
        if (value instanceof Map) for (const [k, v] of value) list[String(k)] = String(v ?? '');
    }
    const button = (/^\s*Button\s*=\s*:(\w+)/m.exec(source) || [, 'A'])[1];
    const time = constants['Theo::CmnHelp::ShowTime'];
    const size = C.fontDefaults(sources, constants).size;
    return {
        list: JSON.stringify(list),
        button: BUTTONS[button.toUpperCase()] || 'shift',
        showTime: String(typeof time === 'number' ? time : 300),
        rgssFontSize: String(typeof size === 'number' ? size : 24)
    };
}

module.exports = { extract };
