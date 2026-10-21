'use strict';
// Plugin parameters for RR_VictorDamagePopup from the game's copy of VE - Damage Popup: its VE_ settings
// (texts, colours and sizes, movements and pop behaviours, the critical/resist/state switches).

const { evaluate, plain, defaultFontSize } = require('./RR_PinnacleGtbs.params.js');

function extract({ scripts = [] } = {}) {
    const text = scripts.map(s => String(s && typeof s === 'object' ? s.text || '' : s || ''))
        .find(s => /\$imported\[:ve_damage_pop\]\s*=/.test(s) && /VE_DAMAGE_TEXTS\s*=/.test(s)) || '';
    const settings = {};
    // Font.default_name in the text table means "the game's font": nil here, the window font there.
    for (const [k, v] of evaluate([text.replace(/Font\.default_name/g, 'nil')])) if (/^VE_/.test(k)) settings[k] = plain(v);
    const texts = scripts.map(s => String(s && typeof s === 'object' ? s.text || '' : s || ''));
    return { settings: JSON.stringify(settings), defaultFontSize: String(defaultFontSize(texts)) };
}

module.exports = { extract };
