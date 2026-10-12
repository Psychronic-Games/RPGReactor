'use strict';
// Plugin parameters for RR_ThrallWindows: the two-sword slot names (Vocab::weapon1 / weapon2), which MZ's terms have
// no place for, from the game's Data/System.rvdata.
const path = require('path');

function extract({ read } = {}) {
    const out = {};
    const bytes = read ? read('Data/System.rvdata') : null;
    if (!bytes) return out;
    try {
        const system = require(path.join(__dirname, '..', 'RubyMarshal.js')).load(bytes);
        const terms = system && system.terms;
        if (terms && typeof terms.weapon1 === 'string') out.weapon1 = terms.weapon1;
        if (terms && typeof terms.weapon2 === 'string') out.weapon2 = terms.weapon2;
    } catch (_) { /* the defaults stand */ }
    return out;
}

module.exports = { extract };
