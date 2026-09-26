'use strict';
// Plugin parameters for RR_BattleHelpWindow from the game's copy of BATTLE_HELP_WINDOW: the texts assigned
// as Battle_desc[stype id] = "…" and Battle_desc[:symbol] = "…" (commented lines skipped), and the hide switch.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /module BATTLE_HELP_WINDOW\b/.test(s)) || '';
    const descriptions = {};
    const re = /^[ \t]*Battle_desc\[\s*:?(\w+)\s*\]\s*=\s*/gm;
    let m;
    while ((m = re.exec(source))) {
        try {
            const value = readLiteral(source, m.index + m[0].length)[0];
            if (typeof value === 'string') descriptions[m[1]] = value;
        } catch (_) { /* a value that is not a literal is left out */ }
    }
    const out = { descriptions: JSON.stringify(descriptions) };
    const hide = constants['BATTLE_HELP_WINDOW::HIDE_WINDOW_SWITCH'];
    if (typeof hide === 'number') out.hideSwitch = String(hide);
    return out;
}

module.exports = { extract };
