'use strict';
// Reads TheoAllen Footstep Sound's settings (Switch, SoundDelay, List, the region
// switch the update tests) from the game's script.

const DEFAULTS = { masterSwitch: 46, regionSwitch: 120, walkDelay: 18, dashDelay: 16 };

function footstepScript(scripts) {
    return scripts.map(s => String(s || '')).find(s => /module\s+FSound/.test(s) || /Theo_FootSound/.test(s)) || '';
}

function extract({ scripts = [], constants = {} } = {}) {
    const text = footstepScript(scripts);
    const out = Object.assign({}, DEFAULTS);

    const sw = constants['Theo::FSound::Switch'] ?? constants['FSound::Switch'];
    if (typeof sw === 'number') out.masterSwitch = sw;
    else { const m = /^\s*Switch\s*=\s*(\d+)/m.exec(text); if (m) out.masterSwitch = Number(m[1]); }

    const region = /\$game_switches\[\s*(\d+)\s*\]\s*\?\s*region_id/.exec(text);
    if (region) out.regionSwitch = Number(region[1]);

    const delay = /SoundDelay\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/.exec(text);
    if (delay) { out.walkDelay = Number(delay[1]); out.dashDelay = Number(delay[2]); }

    const sounds = {};
    const list = /\bList\s*=\s*\{([\s\S]*?)^\s*\}/m.exec(text);
    if (list) {
        const body = list[1].split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n');
        const se = /(\d+)\s*=>\s*RPG::SE\.new\(\s*(["'])(.*?)\2\s*(?:,\s*(\d+))?\s*(?:,\s*(\d+))?\s*\)/g;
        let m;
        while ((m = se.exec(body))) {
            sounds[m[1]] = { name: m[3], volume: m[4] !== undefined ? Number(m[4]) : 80, pitch: m[5] !== undefined ? Number(m[5]) : 100 };
        }
    }

    return {
        masterSwitch: String(out.masterSwitch),
        regionSwitch: String(out.regionSwitch),
        walkDelay: String(out.walkDelay),
        dashDelay: String(out.dashDelay),
        sounds: JSON.stringify(sounds)
    };
}

module.exports = { extract };
