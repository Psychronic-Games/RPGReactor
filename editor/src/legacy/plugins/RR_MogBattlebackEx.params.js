'use strict';
/**
 * RR_MogBattlebackEx parameters from the game's own copy of MOG Battleback
 * EX: SCREEN_Z in its MOG_BATTLEBACK_EX module. Values are strings, as MZ
 * stores plugin parameters.
 */
const DEFAULTS = { screenZ: '0' };

function sources(scripts) {
    const list = Array.isArray(scripts) ? scripts : [scripts];
    return list.map(s => (typeof s === 'string' ? s : s && (s.text || s.source || s.code || s.body) || '')).filter(Boolean);
}

function integerIn(text, name) {
    const m = new RegExp('^[ \\t]*' + name + '[ \\t]*=[ \\t]*(-?\\d+)\\b', 'm').exec(text || '');
    return m ? Number(m[1]) : undefined;
}

function extract({ scripts = [], constants = {} } = {}) {
    const out = Object.assign({}, DEFAULTS);
    const script = sources(scripts).find(t => /module\s+MOG_BATTLEBACK_EX\b|MOG\s*-\s*Battleback EX|def bb_clear\b/i.test(t));
    let z;
    if (script) {
        // Only inside the settings module: SCREEN_Z is a common name.
        const module = /^[ \t]*module\s+MOG_BATTLEBACK_EX\b([\s\S]*?)^[ \t]*end\b/m.exec(script);
        if (module) z = integerIn(module[1], 'SCREEN_Z');
    }
    if (z === undefined && constants && typeof constants['MOG_BATTLEBACK_EX::SCREEN_Z'] === 'number') z = constants['MOG_BATTLEBACK_EX::SCREEN_Z'];
    if (Number.isFinite(z)) out.screenZ = String(z);
    return out;
}

module.exports = { extract, DEFAULTS };
