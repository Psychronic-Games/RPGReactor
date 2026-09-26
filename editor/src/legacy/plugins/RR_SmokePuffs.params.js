'use strict';
// Plugin parameters for RR_SmokePuffs from the game's copy of DirtTrail (DirtTrail::CONFIG). The constants
// table carries no floats, so the numbers are read from the script text.

const NAMES = {
    PUFF_COUNT: 'puffCount', CHIP_W: 'chipWidth', CHIP_H: 'chipHeight', CHIP_BRIGHTNESS: 'chipBrightness', START_OPACITY: 'startOpacity',
    FADE_SPEED: 'fadeSpeed', SPAWN_INTERVAL: 'spawnInterval', KICK_Y: 'kickY', KICK_X_RANGE: 'kickXRange', GRAVITY: 'gravity',
    TRAIL_OFFSET: 'trailOffset', FEET_OFFSET: 'feetOffset'
};
const DEFAULTS = { puffCount: 8, chipWidth: 3, chipHeight: 2, chipBrightness: 200, startOpacity: 220, fadeSpeed: 14, spawnInterval: 4,
    kickY: -1.8, kickXRange: 1.4, gravity: 0.18, trailOffset: 4, feetOffset: 2 };

function extract({ scripts = [], constants = {} } = {}) {
    const text = scripts.map(s => String(s && typeof s === 'object' ? s.text || '' : s || '')).find(s => /module DirtTrail\b/.test(s)) || '';
    const config = (/module CONFIG\b([\s\S]*?)^\s*end\b/m.exec(text.slice(text.search(/module DirtTrail\b/))) || [, ''])[1];
    const out = Object.assign({}, DEFAULTS);
    for (const [ruby, key] of Object.entries(NAMES)) {
        const m = new RegExp('^\\s*' + ruby + '\\s*=\\s*([-+]?\\d+(?:\\.\\d+)?)', 'm').exec(config);
        const known = constants['DirtTrail::CONFIG::' + ruby];
        if (m) out[key] = Number(m[1]);
        else if (typeof known === 'number') out[key] = known;
    }
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, String(v)]));
}

module.exports = { extract };
