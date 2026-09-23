'use strict';
// RR_KhasLights settings from the game's own scripts: the Light_Core Effects
// hash ("N => [picture, opacity, variation, cut],"), Surface_Z, and the
// under-picture switch of the "Khas under Picture" add-on (LightZ_Switch).

const DEFAULT_EFFECTS = { 0: ['light', 255, 0, true], 1: ['torch', 200, 20, true], 2: ['torch_m', 180, 30, true], 3: ['light_s', 255, 0, true] };

/** Ruby source with comments blanked (outside strings), line breaks kept. */
function stripComments(text) {
    return String(text || '').split(/\r?\n/).map(line => {
        let quote = null;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (quote) {
                if (c === '\\') i++;
                else if (c === quote) quote = null;
            } else if (c === '"' || c === "'") quote = c;
            else if (c === '#') return line.slice(0, i);
        }
        return line;
    }).join('\n');
}

function effectsFrom(source) {
    const start = /\bEffects\s*=\s*\{/.exec(source);
    if (!start) return null;
    const end = source.indexOf('}', start.index + start[0].length);
    const body = source.slice(start.index + start[0].length, end < 0 ? undefined : end);
    const out = {};
    const entry = /(\d+)\s*=>\s*\[\s*(?:"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)')\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*(?:,\s*(true|false|nil))?\s*\]/g;
    let m;
    while ((m = entry.exec(body))) out[m[1]] = [m[2] !== undefined ? m[2] : m[3], Number(m[4]), Number(m[5]), m[6] !== 'false' && m[6] !== 'nil'];
    return Object.keys(out).length ? out : null;
}

function constantIn(sources, name) {
    const re = new RegExp('^\\s*' + name + '\\s*=\\s*(-?\\d+)', 'm');
    for (const source of sources) {
        const m = re.exec(source);
        if (m) return Number(m[1]);
    }
    return null;
}

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(stripComments);
    const core = sources.find(s => /module\s+Light_Core\b/.test(s)) || '';
    const effects = effectsFrom(core) || DEFAULT_EFFECTS;
    const pick = (keys, fallback) => {
        for (const k of keys) if (typeof constants[k] === 'number') return constants[k];
        return fallback;
    };
    const surfaceZ = pick(['Light_Core::Surface_Z'], constantIn([core], 'Surface_Z') ?? 310);
    const underSwitch = pick(['Spriteset_Map::LightZ_Switch', 'LightZ_Switch'], constantIn(sources, 'LightZ_Switch') ?? 0);
    return {
        effects: JSON.stringify(effects),
        surfaceZ: String(surfaceZ),
        underPictureSwitch: String(underSwitch),
        folder: 'img/Lights/'
    };
}

module.exports = { extract };
