'use strict';
// Plugin parameters for RR_GamepadExtender: PadConfig.enable_vibration from the game's copy of the script.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /module WolfPad\b/.test(s)) || '';
    const m = /def self\.enable_vibration[^\n]*\n\s*(true|false)/.exec(source);
    return { vibration: String(!m || m[1] === 'true') };
}

module.exports = { extract };
