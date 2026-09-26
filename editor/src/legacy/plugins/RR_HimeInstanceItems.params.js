'use strict';
// Plugin parameters for RR_HimeInstanceItems from the game's copy of Instance Items (TH::Instance_Items).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** A constant's literal in one script's source (the first `Name = value` line), or the default. */
function setting(source, name, fallback) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return fallback;
    try { const v = readLiteral(source, m.index + m[0].length)[0]; return v === undefined ? fallback : v; } catch (_) { return fallback; }
}

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["TH_InstanceItems"\]\s*=\s*true/.test(s)) || '';
    // Ruby truth: only false and nil are false.
    const truth = (v) => String(v !== false && v !== null);
    return {
        enableItems: truth(setting(source, 'Enable_Items', false)),
        enableWeapons: truth(setting(source, 'Enable_Weapons', true)),
        enableArmors: truth(setting(source, 'Enable_Armors', true))
    };
}

module.exports = { extract, setting };
