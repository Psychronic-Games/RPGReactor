'use strict';
// Plugin parameters for RR_MaGlobalTextCodes from the game's copy of modern algebra's Global Text Codes
// (MAGTC_MANUAL_CODES, MAGTC_RCODES).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /\$imported\[:MAGlobalTextCodes\]\s*=\s*true/.test(s)) || '';
    const rcodes = {};
    const at = /^\s*MAGTC_RCODES\s*=\s*/m.exec(source);
    if (at) {
        try {
            const value = readLiteral(source, at.index + at[0].length)[0];
            if (value instanceof Map) for (const [k, v] of value) rcodes[Number(k)] = String(v ?? '');
        } catch (_) { /* unreadable: no phrases */ }
    }
    return { manual: String(constants.MAGTC_MANUAL_CODES === true), rcodes: JSON.stringify(rcodes) };
}

module.exports = { extract };
