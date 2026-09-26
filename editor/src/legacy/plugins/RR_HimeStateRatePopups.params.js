'use strict';
// Plugin parameters for RR_HimeStateRatePopups: the :immune and :resistant texts of the game's copy of Yanfly's
// Battle Engine (YEA::BATTLE::POPUP_SETTINGS), which the popups use.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const out = { immuneText: 'IMMUNE', resistText: 'RESIST' };
    for (const source of scripts.map(text)) {
        const at = /^[ \t]*POPUP_SETTINGS\s*=\s*/m.exec(source);
        if (!at) continue;
        try {
            const settings = readLiteral(source, at.index + at[0].length)[0];
            if (!(settings instanceof Map)) continue;
            // Symbol keys come back as ":name" or "name" depending on how they were written.
            const get = (name) => (settings.has(':' + name) ? settings.get(':' + name) : settings.get(name));
            if (typeof get('immune') === 'string') out.immuneText = get('immune');
            if (typeof get('resistant') === 'string') out.resistText = get('resistant');
        } catch (_) { /* unreadable: defaults */ }
    }
    return out;
}

module.exports = { extract };
