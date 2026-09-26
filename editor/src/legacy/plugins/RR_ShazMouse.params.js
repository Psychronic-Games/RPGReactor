'use strict';
// Plugin parameters for RR_ShazMouse from the game's copy of Shaz's Super Simple Mouse Script (ICON, DEFAULT_ICON)
// and its Mouse Switch add-on (SHAZ::MouseSwitch::ENABLED_SWITCH).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /SUPER SIMPLE MOUSE SCRIPT/.test(s) && /^\s*ICON\s*=/m.test(s)) || '';
    const icons = {};
    const m = /^\s*ICON\s*=\s*/m.exec(source);
    if (m) {
        try { const map = readLiteral(source, m.index + m[0].length)[0]; for (const [k, v] of map instanceof Map ? map : []) icons[String(k).toLowerCase()] = Number(v) || 0; } catch (_) { /* no icons read */ }
    }
    return {
        icons: JSON.stringify(icons),
        defaultIcon: String(constants.DEFAULT_ICON || 'cursor'),
        switchId: String(Number(constants['SHAZ::MouseSwitch::ENABLED_SWITCH']) || 0)
    };
}

module.exports = { extract };
