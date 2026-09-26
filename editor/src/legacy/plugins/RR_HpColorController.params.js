'use strict';
// Plugin parameters for RR_HpColorController from the game's copy of the HP Color Controller (FSE::HPCONTROL).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /module HPCONTROL\b/.test(s)) || '';
    const block = /COLOURS\s*=\s*\{([\s\S]*?)\}/.exec(source);
    const colours = {};
    if (block) for (const m of block[1].matchAll(/^\s*:(\w+)\s*=>\s*(\d+)/gm)) colours[m[1]] = Number(m[2]);
    const k = (name, d) => (constants['FSE::HPCONTROL::' + name] === undefined ? d : constants['FSE::HPCONTROL::' + name]);
    const compat = k('COMPAT_MODE', false);
    return { lowHp: String(Number(k('LOW_HP', 0.3))), critHp: String(Number(k('CRIT_HP', 0.15))), compat: String(compat !== false && compat !== null), colours: JSON.stringify(colours) };
}

module.exports = { extract };
