'use strict';
/**
 * Games that keep their text in CSV files and put keys in the data (Pinnacle - The Five Kingdoms):
 * Local/<Language>.csv holds the game's lines and Local/Maps-<Language>/<map id>.csv each map's. A
 * string starting "[12" is line 12 of the language's file, one starting "{3" line 3 of the current
 * map's; the key alone is replaced and anything after it stays (the game's DataManager.lookup_loc_text).
 *
 * The import writes the chosen language into the data, so the editor shows real text; text the game
 * only puts together while it runs (keys in variables, in script strings, in a common event that reads
 * whichever map it runs on) is resolved by RR_KeyedLocalization from data/RRLocalization.json.
 */
const path = require('path');

const GLOBAL_KEY = /^\[(\d+)/, MAP_KEY = /^\{(\d+)/;

/** The languages a game folder ships this way: Local/<name>.csv with a Local/Maps-<name> folder. */
function languages(files) {
    const local = files('Local');
    const csv = local.filter(f => /^[^/]+\.csv$/i.test(f)).map(f => f.replace(/\.csv$/i, ''));
    return csv.filter(name => local.some(f => f.toLowerCase() === ('maps-' + name).toLowerCase()) || files('Local/Maps-' + name).length);
}

/** Whether the game's scripts read text that way (their lookup function). */
function usedBy(scripts) {
    return scripts.some(t => /lookup_loc_text/.test(String(t || '')) && /["']Local\//.test(scripts.join('\n')));
}

/** The language order the scripts index by ($game_settings[:language] → ["Ita", "Eng"][i]), or null. */
function order(scripts) {
    for (const t of scripts) {
        const m = /\[\s*((?:"[A-Za-z_-]+"\s*,\s*)+"[A-Za-z_-]+")\s*\]\s*(?:\.each_with_index|\[\s*\$game_settings\[:language\]\s*\])/.exec(String(t || ''));
        if (m) return Array.from(m[1].matchAll(/"([^"]+)"/g), x => x[1]);
    }
    return null;
}

/** The game's file as lines, the way Ruby's readlines.map(&:chomp) gives them. */
const lines = (bytes) => (bytes ? Buffer.from(bytes).toString('utf8').replace(/^﻿/, '').split(/\r?\n/) : null);

/**
 * The text of one language: { language, lines, maps: { id: lines } } read through `read(rel)` and `files(dir)`.
 */
function load(language, read, files) {
    const global = lines(read(`Local/${language}.csv`)) || [];
    const maps = {};
    for (const f of files(`Local/Maps-${language}`)) {
        const m = /^(\d+)\.csv$/i.exec(f);
        if (m) maps[Number(m[1])] = lines(read(`Local/Maps-${language}/${f}`)) || [];
    }
    return { language, lines: global, maps };
}

/** One string with its key resolved: a global key always, a map key when the map's lines are given. */
function resolve(text, table, mapLines) {
    if (typeof text !== 'string') return text;
    let out = text.replace(GLOBAL_KEY, (m, n) => { const line = table.lines[Number(n) - 1]; return line === undefined ? m : line; });
    if (mapLines) out = out.replace(MAP_KEY, (m, n) => { const line = mapLines[Number(n) - 1]; return line === undefined ? m : line; });
    return out;
}

// Event commands whose strings the player reads: Show Text, Show Choices, Scroll Text, Change Name/Nickname/Profile.
const TEXT_COMMANDS = new Set([401, 405, 320, 324, 325]);

/** Every event command list in a converted data file. */
function eventLists(data) {
    const out = [];
    const walk = (o) => {
        if (Array.isArray(o)) { if (o.length && o[0] && typeof o[0].code === 'number' && Array.isArray(o[0].parameters)) out.push(o); else o.forEach(walk); }
        else if (o && typeof o === 'object') Object.values(o).forEach(walk);
    };
    walk(data);
    return out;
}

/** The commands' text, resolved; returns how many strings changed. */
function bakeCommands(list, table, mapLines) {
    let n = 0;
    const fix = (v) => { const r = resolve(v, table, mapLines); if (r !== v) n++; return r; };
    for (const c of list) {
        if (TEXT_COMMANDS.has(c.code)) c.parameters = c.parameters.map(p => (typeof p === 'string' ? fix(p) : p));
        else if (c.code === 102 && Array.isArray(c.parameters[0])) c.parameters[0] = c.parameters[0].map(fix);
        else if (c.code === 402 && typeof c.parameters[1] === 'string') c.parameters[1] = fix(c.parameters[1]);
    }
    return n;
}

const RECORD_FIELDS = ['name', 'nickname', 'description', 'profile', 'message1', 'message2', 'message3', 'message4'];

/**
 * Write the language into an imported project's data/*.json: event text (a map's map keys from its own
 * file), database names and descriptions, the system's terms and type names. Returns the count changed.
 */
function bakeProject(dest, table, fs) {
    let changed = 0;
    const dir = path.join(dest, 'data');
    for (const file of fs.readdirSync(dir)) {
        if (!/\.json$/i.test(file) || file === 'RRLocalization.json') continue;
        const full = path.join(dir, file);
        let data;
        try { data = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (_) { continue; }
        let n = 0;
        const mapId = (/^Map(\d+)\.json$/i.exec(file) || [])[1];
        const mapLines = mapId ? table.maps[Number(mapId)] : null;
        for (const list of eventLists(data)) n += bakeCommands(list, table, mapLines);
        if (mapId && data && typeof data.displayName === 'string') { const r = resolve(data.displayName, table, mapLines); if (r !== data.displayName) { data.displayName = r; n++; } }
        if (Array.isArray(data) && !mapId && file !== 'MapInfos.json') {
            for (const r of data) if (r && typeof r === 'object') for (const k of RECORD_FIELDS) if (typeof r[k] === 'string') { const v = resolve(r[k], table); if (v !== r[k]) { r[k] = v; n++; } }
        }
        if (file === 'System.json') {
            const fixAll = (arr) => (Array.isArray(arr) ? arr.map(v => { const r = resolve(v, table); if (r !== v) n++; return r; }) : arr);
            for (const k of ['elements', 'skillTypes', 'weaponTypes', 'armorTypes', 'equipTypes']) data[k] = fixAll(data[k]);
            for (const k of ['gameTitle', 'currencyUnit']) if (typeof data[k] === 'string') { const r = resolve(data[k], table); if (r !== data[k]) { data[k] = r; n++; } }
            if (data.terms) {
                for (const k of ['basic', 'commands', 'params']) data.terms[k] = fixAll(data.terms[k]);
                // A message read from the language file keeps Ruby's sprintf marks (%s, %d); MZ formats with %1, %2.
                for (const [k, v] of Object.entries(data.terms.messages || {})) {
                    const r = resolve(v, table);
                    if (r !== v) { let i = 0; data.terms.messages[k] = r.replace(/%[sd]/g, () => '%' + (++i)); n++; }
                }
            }
        }
        if (n) { fs.writeFileSync(full, JSON.stringify(data)); changed += n; }
    }
    fs.writeFileSync(path.join(dir, 'RRLocalization.json'), JSON.stringify(table));
    return changed;
}

/** The language a game starts in: its shipped settings file's :language index into the scripts' order. */
function shippedLanguage(read, M, langs, scripts) {
    const ordered = order(scripts) || langs;
    try {
        const settings = M.load(read('game_settings.rvdata2'));
        const find = (o) => { if (o instanceof Map) { for (const [k, v] of o) { if (String(k).replace(/^:/, '') === 'language') return v; const r = find(v); if (r !== undefined) return r; } } else if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) { if (k.replace(/^@?:?/, '') === 'language') return v; const r = find(v); if (r !== undefined) return r; } } return undefined; };
        const index = find(settings);
        // Only a language the game ships a file for: the scripts may list one it never had.
        const named = typeof index === 'number' && ordered[index] && langs.find(l => l.toLowerCase() === String(ordered[index]).toLowerCase());
        if (named) return named;
    } catch (_) { /* no settings file */ }
    return langs.includes('Eng') ? 'Eng' : langs[langs.length - 1];
}

module.exports = { languages, usedBy, order, load, resolve, bakeCommands, bakeProject, shippedLanguage, GLOBAL_KEY, MAP_KEY };
