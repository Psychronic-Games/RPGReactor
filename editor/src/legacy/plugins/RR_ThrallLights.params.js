'use strict';
// Plugin parameters for RR_ThrallLights from the game's copy of Thomas Edison VX: the switches that turn
// each family of lights off (top-level constants FIRE, LIGHT, GROUND, TORCH) and the picture it loads.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const out = {};
    for (const [param, name] of [['fireSwitch', 'FIRE'], ['lightSwitch', 'LIGHT'], ['groundSwitch', 'GROUND'], ['torchSwitch', 'TORCH']]) {
        if (typeof constants[name] === 'number') out[param] = String(constants[name]);
    }
    const source = scripts.map(text).find(s => /class Light_Effect\b/.test(s)) || '';
    const image = /@light\.bitmap = Cache\.picture\("([^"]+)"\)/.exec(source);
    if (image) out.image = image[1].replace(/\.png$/i, '');
    return out;
}

module.exports = { extract };
