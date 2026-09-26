'use strict';
// Plugin parameters for RR_WindowOpacity from the game's copy of Window Color Opacity (MK_WIN_OPA): the
// variable is used only when Yanfly's System Options is in the game, as the original checks.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const yea = scripts.map(text).some(s => /\$imported\["YEA-SystemOptions"\]\s*=\s*true/.test(s));
    const variable = Number(constants['MK_WIN_OPA::OPACITY_OPTION_VAR_ID'] ?? constants.OPACITY_OPTION_VAR_ID) || 0;
    const opacity = Number(constants['MK_WIN_OPA::OPACITY'] ?? 200);
    return { variable: String(yea ? variable : 0), opacity: String(Number.isFinite(opacity) ? opacity : 200) };
}

module.exports = { extract };
