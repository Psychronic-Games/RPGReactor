'use strict';
// Plugin parameters for RR_ThrallKeys from the game: the controls in its shipped config files
// (Data/ConfigKey.rvdata, ConfigCon.rvdata), else Game_System's defaults in its scripts; the variables and
// switches its title loads from Data/ConfigVar.rvdata and ConfigSwi.rvdata (the ids its create_game_objects
// lists); the switches Read Controls reads.

const path = require('path');
const M = require(path.join(__dirname, '..', 'RubyMarshal.js'));
const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const VX_INPUT = { DOWN: 2, LEFT: 4, RIGHT: 6, UP: 8, A: 11, B: 12, C: 13, X: 14, Y: 15, Z: 16, L: 17, R: 18 };
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

/** The Key Module's constants: Keys::NAME = 0x41 and the like. */
function keyCodes(text) {
    const out = {};
    const body = /module Keys\b([\s\S]*?)\n\s*begin\b/.exec(text);
    for (const m of (body ? body[1] : '').matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(0x[0-9A-Fa-f]+|\d+)/gm)) out[m[1]] = Number(m[2]);
    return out;
}

function load(read, rel) {
    try { const bytes = read && read(rel); return bytes ? M.load(bytes) : null; } catch (_) { return null; }
}

/** The ids `name = [..]` lists in the method that loads `file` (Scene_Title's create_game_objects). */
function loadedIds(scripts, file, name) {
    for (const text of scripts) {
        const at = text.indexOf(`File.open("${file}"`);
        if (at < 0) continue;
        const m = new RegExp(`\\b${name}\\s*=\\s*\\[`).exec(text.slice(at));
        if (m) { try { return readLiteral(text, at + m.index + m[0].length - 1)[0].map(Number); } catch (_) { /* below */ } }
    }
    return null;
}

function extract({ scripts = [], read } = {}) {
    const out = {};
    const all = scripts.join('\n');
    const codes = keyCodes(all);

    let keys = load(read, 'Data/ConfigKey.rvdata');
    let pad = load(read, 'Data/ConfigCon.rvdata');
    if (!Array.isArray(keys)) {
        const m = /@controls\s*=\s*(\[[\s\S]*?\]\s*\])/.exec(all);
        if (m) keys = Array.from(m[1].matchAll(/\[([^\[\]]*)\]/g), g => Array.from(g[1].matchAll(/Keys::([A-Z0-9_]+)/g), k => codes[k[1]]).filter(n => n !== undefined));
    }
    if (!Array.isArray(pad)) {
        const m = /@controls_g\s*=\s*\[([\s\S]*?)\]/.exec(all);
        if (m) pad = Array.from(m[1].matchAll(/Input::([A-Z]+)/g), k => VX_INPUT[k[1]]);
    }
    if (Array.isArray(keys) && keys.length === 12) out.controls = JSON.stringify(keys.map(k => (Array.isArray(k) ? k : [k]).map(num)));
    if (Array.isArray(pad) && pad.length === 12) out.controlsGamepad = JSON.stringify(pad.map(num));

    const pick = (file, name) => {
        const data = load(read, file);
        const values = data && (data.data || data['@data']);
        const ids = loadedIds(scripts, file, name);
        if (!Array.isArray(values) || !ids) return null;
        return Object.fromEntries(ids.map(id => [id, values[id] == null ? (name === 'vars' ? 0 : false) : num(values[id])]));
    };
    const variables = pick('Data/ConfigVar.rvdata', 'vars');
    const switches = pick('Data/ConfigSwi.rvdata', 'switches');
    if (variables) out.configVariables = JSON.stringify(variables);
    if (switches) out.configSwitches = JSON.stringify(switches);

    // Read Controls: the switch that says the gamepad is in use, and the one that picks PlayStation glyphs.
    const reader = scripts.find(s => /def self\.read_input_A\b/.test(s));
    if (reader) {
        const device = /if \$game_switches\[(\d+)\]\s*\n\s*button = \[\$game_system\.controls_g/.exec(reader);
        const glyph = /when Input::C\s*\n\s*if \$game_switches\[(\d+)\]/.exec(reader);
        if (device) out.deviceSwitch = device[1];
        if (glyph) out.glyphSwitch = glyph[1];
    }
    return out;
}

module.exports = { extract, keyCodes };
