'use strict';
// Plugin parameters for RR_ThrallDungeon from the game's copy of Strak's Procedural Dungeon Generator:
// STRAK::PDG.map_settings (per map id), the room rules, the floor tiles and switches create_dungeon uses,
// and the room pictures in Graphics/Rooms/<folder>/Ground/<letter>/ (listed with `list` when the importer
// gives one, else found by asking `read` for each name the rooms use: <variant A-E><letter><number>.png).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const KEYS = { room_folder: 'folder', room_w: 'roomW', room_h: 'roomH', start_x: 'startX', start_y: 'startY', overlap: 'overlap', overwrite: 'overwrite', var_type: 'varType', room_size: 'roomSize', l_map: 'lMap', s_map: 'sMap', o_map: 'oMap' };
const RULES = ['A2', 'A4', 'A6', 'A8', 'B2', 'B4', 'B6', 'B8', 'X1Y1', 'X2Y1', 'X3Y1', 'X4Y1', 'X1Y2', 'X2Y2', 'X3Y2', 'X4Y2', 'X1Y3', 'X2Y3', 'X3Y3', 'X4Y3', 'FAILSAFE'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const MAX_NUMBER = 20;

function literalAt(source, at) {
    try { return readLiteral(source, at)[0]; } catch (_) { return undefined; }
}

/** map_settings: `case id` / `when 2,3` blocks of `name = literal` lines. */
function mapSettings(source) {
    const out = {};
    const body = /def self\.map_settings\(id\)([\s\S]*?)\n\s*return \[/.exec(source);
    if (!body) return out;
    const blocks = body[1].split(/\n\s*when\s+/).slice(1);
    for (const block of blocks) {
        const ids = (/^([\d,\s]+)/.exec(block) || [, ''])[1].match(/\d+/g) || [];
        const settings = {};
        for (const m of block.matchAll(/^\s*([a-z_]+)\s*=\s*/gm)) {
            const key = KEYS[m[1]];
            if (!key) continue;
            const value = literalAt(block, m.index + m[0].length);
            if (value !== undefined) settings[key] = value;
        }
        for (const id of ids) out[id] = settings;
    }
    return out;
}

function extract({ scripts = [], read = () => null, list = null } = {}) {
    const source = scripts.map(text).find(s => /module PDG\b/.test(s) && /def create_dungeon\b/.test(s)) || '';
    const out = {};
    const maps = mapSettings(source);
    out.maps = JSON.stringify(maps);
    const rules = {};
    for (const name of RULES) {
        const m = new RegExp('^\\s*' + name + '\\s*=\\s*', 'm').exec(source);
        const value = m ? literalAt(source, m.index + m[0].length) : undefined;
        if (Array.isArray(value)) rules[name] = value.map(String);
    }
    out.rules = JSON.stringify(rules);
    // create_dungeon's floors: the debug set under `if $game_switches[n]`, the normal set after `else`.
    const floors = /def create_dungeon\b[\s\S]*?if \$game_switches\[(\d+)\]([\s\S]*?)\belse\b([\s\S]*?)\bend\b/.exec(source);
    if (floors) {
        const ids = (part) => ['g', 'r', 'y', 'b', 'p', 'dr', 'db'].map(k => Number((new RegExp('@' + k + '_floor\\s*=\\s*(\\d+)').exec(part) || [, NaN])[1]));
        const debug = ids(floors[2]), normal = ids(floors[3]);
        out.debugSwitch = floors[1];
        if (normal.every(Number.isFinite)) out.floors = JSON.stringify(normal);
        if (debug.every(Number.isFinite)) out.debugFloors = JSON.stringify(debug);
    }
    const forced = /overrule\[\$game_variables\[(\d+)\]-1\] if \$game_variables\[\1\] > 0/.exec(source);
    if (forced) out.overrideVariable = forced[1];
    const events = /for event_id in 1\.\.(\d+)/.exec(source);
    if (events) out.maxEvents = events[1];
    // The room pictures each dungeon folder has, by room letter.
    const rooms = {};
    const folders = [...new Set(Object.values(maps).map(s => s.folder).filter(f => typeof f === 'string'))];
    for (const folder of folders) {
        rooms[folder] = {};
        for (const letter of LETTERS) {
            const dir = `Graphics/Rooms/${folder}Ground/${letter}`;
            let files = null;
            const listed = typeof list === 'function' ? list(dir) : null;
            if (Array.isArray(listed)) files = listed.map(f => String(f).split(/[\\/]/).pop()).filter(f => /\.png$/i.test(f));
            else {
                files = [];
                for (const variant of 'ABCDE') for (let n = 1; n <= MAX_NUMBER; n++) {
                    const name = `${variant}${letter}${n}.png`;
                    let bytes = null;
                    try { bytes = read(`${dir}/${name}`); } catch (_) { bytes = null; }
                    if (bytes && bytes.length) files.push(name);
                }
            }
            if (files.length) rooms[folder][letter] = files.sort();
        }
    }
    out.rooms = JSON.stringify(rooms);
    return out;
}

module.exports = { extract, mapSettings };
