'use strict';
// Plugin parameters for RR_PinnacleGtbs from the game's own copy of GubiD's Tactical Battle System: the GTBS
// setup sections (General, Interface, Music, Map Open&Exit, Vocab, Animation, Actor&Class, Equip&State, Item,
// Skill, Enemy, Extra Enemies, AI, Victory&Fail), the action lists, the AI tactics, Gallade's terrain table,
// the game's Troop module and VE Damage Popup's settings. Read as the scripts define them: constants, locals,
// `NAME[key] = value`, `NAME << value` and the closing `X = v if Y == n` lines.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const textOf = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** Maps (Ruby hashes) to plain objects, arrays kept. */
const plain = (v) => v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)]))
    : Array.isArray(v) ? v.map(plain) : v;

/** The value written at `at`: Color.new(...), a local or constant, or a Ruby literal. Returns [value, end] or null. */
function valueAt(text, at, scope) {
    while (at < text.length && /[ \t]/.test(text[at])) at++;
    const rest = text.slice(at, at + 200);
    let m = /^(?:Color|Tone)\.new\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*(?:,\s*(-?[\d.]+)\s*)?\)/.exec(rest);
    if (m) return [[+m[1], +m[2], +m[3], m[4] === undefined ? 255 : +m[4]], at + m[0].length];
    m = /^Gtbs_Color\.new\(\s*['"](\w+)['"]\s*,\s*(\w+)\s*\)/.exec(rest);
    if (m) return [{ name: m[1], color: scope.has(m[2]) ? scope.get(m[2]) : null }, at + m[0].length];
    m = /^([A-Za-z_]\w*)(?:::([A-Z]\w*))?\b(?!\s*[.(\[])/.exec(rest);
    if (m && !/^(true|false|nil)$/.test(m[1])) {
        const name = m[2] || m[1];
        if (scope.has(name)) return [scope.get(name), at + m[0].length];
        return null;
    }
    try { return readLiteral(text, at); } catch (_) { return null; }
}

/** A trailing `if NAME == literal` after a value: true when it holds (or there is none). */
function guardHolds(line, scope) {
    const m = /\bif\s+([A-Za-z_]\w*)\s*==\s*(-?\d+|true|false|"[^"]*"|'[^']*')/.exec(line);
    if (!m) return true;
    let want;
    try { want = readLiteral(m[2], 0)[0]; } catch (_) { return true; }
    return scope.get(m[1]) === want;
}

/** Every constant the sections set, in order, with locals for `NAME = local`. */
function evaluate(texts) {
    const scope = new Map();
    for (const text of texts) {
        const re = /^[ \t]*([A-Za-z_]\w*)[ \t]*(\[[^\]\n]*\])?[ \t]*(<<|=(?![=~>]))/gm;
        let m;
        while ((m = re.exec(text))) {
            const [, name, index, op] = m;
            // A method body's locals (range = ...) are not settings; only top-level-ish names are read.
            const lineEnd = text.indexOf('\n', m.index);
            const line = text.slice(m.index, lineEnd < 0 ? text.length : lineEnd);
            if (/^\s*#/.test(line)) continue;
            const got = valueAt(text, re.lastIndex, scope);
            if (!got) continue;
            const [value, end] = got;
            const tail = text.slice(end, text.indexOf('\n', end) < 0 ? text.length : text.indexOf('\n', end));
            if (!guardHolds(tail, scope)) continue;
            if (op === '<<') {
                const list = scope.get(name);
                if (Array.isArray(list)) list.push(value);
                continue;
            }
            if (index) {
                const target = scope.get(name);
                const key = valueAt(index.slice(1, -1), 0, scope);
                if (target instanceof Map && key) target.set(key[0], value);
                else if (Array.isArray(target) && key && typeof key[0] === 'number') target[key[0]] = value;
                continue;
            }
            scope.set(name, value);
        }
    }
    return scope;
}

/** `def self.name` whose body is one literal (Terrain_Effects, Troop, GTBS.placing_music). */
function methodLiteral(text, name) {
    const m = new RegExp('def\\s+self\\.' + name + '\\b[^\\n]*\\n').exec(text);
    if (!m) return undefined;
    try { return plain(readLiteral(text, m.index + m[0].length)[0]); } catch (_) { return undefined; }
}

/** GTBS_Tactics: Tactic.new('name') objects and their attribute lines. */
function tactics(text) {
    const base = { position: 50, hp_damage: 100, hp_heal: 100, mp_damage: 0, counter: 100, state: 100, mp_save: 0, death_like: 1.0,
        team: false, team_rate: 1.0, predictable: 5, force_approach: true };
    const init = /def initialize\(name = 'default'\)([\s\S]*?)All_AI_Tactics\[name\]/.exec(text);
    if (init) for (const m of init[1].matchAll(/@(\w+)\s*=\s*(-?[\d.]+|true|false)/g)) base[m[1]] = m[2] === 'true' ? true : m[2] === 'false' ? false : Number(m[2]);
    const out = {}, vars = {};
    for (const m of text.matchAll(/^[ \t]*(\w+)\s*=\s*Tactic\.new(?:\(\s*['"](\w+)['"]\s*\))?/gm)) {
        const name = m[2] || 'default';
        vars[m[1]] = name;
        out[name] = Object.assign({}, base);
    }
    for (const m of text.matchAll(/^[ \t]*(\w+)\.(\w+)\s*=\s*(-?[\d.]+|true|false)/gm)) {
        const name = vars[m[1]];
        if (name && out[name]) out[name][m[2]] = m[3] === 'true' ? true : m[3] === 'false' ? false : Number(m[3]);
    }
    return out;
}

/** Vocab_GTBS, including `Yes, No = "[217", "[26"`. */
function vocab(text) {
    const scope = evaluate([text]);
    const out = plain(Object.fromEntries(scope));
    const pair = /^[ \t]*(\w+)\s*,\s*(\w+)\s*=\s*("[^"]*"|'[^']*')\s*,\s*("[^"]*"|'[^']*')/m.exec(text);
    if (pair) { out[pair[1]] = readLiteral(pair[3], 0)[0]; out[pair[2]] = readLiteral(pair[4], 0)[0]; }
    return out;
}

function defaultFontSize(texts) {
    let size = 24;
    for (const t of texts) for (const m of t.matchAll(/^\s*Font\.default_size\s*=\s*(\d+)/gm)) size = Number(m[1]);
    return size;
}

function extract({ scripts = [] } = {}) {
    const texts = scripts.map(textOf);
    const find = (re) => texts.find(t => re.test(t)) || '';
    const setup = texts.filter(t => /^\s*module GTBS\b/m.test(t) && !/class Scene_Battle_TBS/.test(t));
    const scope = evaluate(setup);
    const gtbs = {};
    for (const [k, v] of scope) if (/^[A-Z]/.test(k)) gtbs[k] = plain(v);
    // The colour constants end up as Gtbs_Color name/colour pairs (RED = Gtbs_Color.new('RED', RED)).
    const colors = {};
    for (const [k, v] of Object.entries(gtbs)) if (v && typeof v === 'object' && !Array.isArray(v) && v.name && Array.isArray(v.color)) colors[k] = v.color;
    const music = find(/def self\.placing_music/);
    const animation = find(/DEFAULT_POSE_NUMBERS\s*=/);
    const poseNumbers = (name) => { try { return plain(readLiteral(animation, animation.indexOf(name + ' = ') + name.length + 3)[0]); } catch (_) { return {}; } };
    const ve = {};
    const veText = find(/module Victor_Engine[\s\S]*VE_DAMAGE_TEXTS\s*=/);
    for (const [k, v] of evaluate([veText.replace(/Font\.default_name/g, 'nil')])) if (/^VE_/.test(k)) ve[k] = plain(v);
    const terrain = find(/module Terrain_Effects/);
    const troop = find(/^\s*module Troop\b/m);
    const config = {
        gtbs,
        colors,
        placingMusic: methodLiteral(music, 'placing_music') || '',
        poseNumbers: poseNumbers('DEFAULT_POSE_NUMBERS'),
        vocab: vocab(find(/module Vocab_GTBS/)),
        tactics: tactics(find(/module GTBS_Tactics/)),
        terrain: { names: methodLiteral(terrain, 'terrain_name') || {}, def: methodLiteral(terrain, 'terrain_effects_def') || {}, eva: methodLiteral(terrain, 'terrain_effects_eva') || {} },
        troop: { data: methodLiteral(troop, 'troop_data') || {}, nameflag: methodLiteral(troop, 'troop_nameflag') || [], factions: methodLiteral(troop, 'faction_names') || {} },
        ve,
        // Font.default_size (the game's Font Name section): what the scripts' explicit sizes are relative to.
        fontDefaultSize: defaultFontSize(texts)
    };
    return { config: JSON.stringify(config) };
}

module.exports = { extract, evaluate, plain, defaultFontSize };
