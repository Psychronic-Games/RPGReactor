'use strict';
// Plugin parameters for RR_ThrallSideview from the game's copy of Enu's Sideview Battle System 3.3
// (module N01, "SBS Configurations"): the single actions and the action sequences, the settings, and the
// tables its per-actor, per-enemy, per-state, per-skill and per-item methods return (case @id when …
// return "…"). The methods with logic of their own (an actor's shield parry, an enemy's random weapon,
// the collapse that depends on switches, a weapon's sequence by its elements) are the port's code.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

/** The body of `def name` inside `class cls` (to the def's own `end`). */
function methodBody(source, cls, name) {
    const classAt = new RegExp('^\\s*class ' + cls + '\\b', 'm').exec(source);
    if (!classAt) return null;
    const from = classAt.index;
    const def = new RegExp('^([ \\t]*)def ' + name.replace(/[?]/g, '\\?') + '\\b[^\\n]*\\n', 'm');
    const rest = source.slice(from);
    const m = def.exec(rest);
    if (!m) return null;
    const indent = m[1];
    const start = m.index + m[0].length;
    const endRe = new RegExp('^' + indent + 'end\\b', 'm');
    const tail = rest.slice(start);
    const e = endRe.exec(tail);
    return e ? tail.slice(0, e.index) : null;
}

/** case @x … when a, b … return v … end; return default → { table: {key: value}, default }. */
function caseTable(body) {
    if (!body) return null;
    const out = { table: {}, default: undefined };
    const lines = body.split('\n');
    let pending = null;
    const value = (s) => { try { return plain(readLiteral(s.trim(), 0)[0]); } catch (_) { return undefined; } };
    let depth = 0, inCase = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/#[^"\n]*$/, '');
        if (/^\s*case\s/.test(line)) { inCase = true; depth = 1; continue; }
        if (inCase && /^\s*when\s+/.test(line)) {
            let keys = line.replace(/^\s*when\s+/, '');
            while (/,\s*$/.test(keys) && i + 1 < lines.length) keys += lines[++i].replace(/#.*$/, '');
            pending = keys.split(',').map(k => k.trim()).filter(Boolean).map(k => (/^-?\d+$/.test(k) ? Number(k) : value(k)));
            continue;
        }
        const ret = /^\s*return\s+(.+?)\s*$/.exec(line);
        if (ret && inCase && pending) {
            const v = value(ret[1]);
            if (v !== undefined) for (const k of pending) if (k !== undefined && !(String(k) in out.table)) out.table[String(k)] = v;
            pending = null;
            continue;
        }
        if (inCase && /^\s*end\b/.test(line)) { inCase = false; pending = null; continue; }
        if (ret && !inCase) { const v = value(ret[1]); if (v !== undefined) out.default = v; }
    }
    return out;
}

const ACTOR_METHODS = ['non_weapon', 'normal', 'pinch', 'defence', 'damage_hit', 'command_b', 'command_a', 'run_success', 'run_ng', 'win', 'first_action', 'recover_action', 'shadow', 'shadow_plus'];
const ENEMY_METHODS = ['base_action', 'normal', 'pinch', 'defence', 'damage_hit', 'evasion', 'run_success', 'first_action', 'recover_action', 'shadow', 'shadow_plus', 'position_plus', 'action_time', 'anime_on', 'action_mirror'];

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const config = sources.find(s => /^module N01\b/m.test(s) && /ANIME\s*=\s*\{/.test(s)) || '';
    const k = (name, d) => { const v = constants['N01::' + name]; return v === undefined || v === null ? d : v; };
    const out = {};
    for (const [key, name] of [['actorPosition', 'ACTOR_POSITION'], ['altPosition', 'ALT_POSITION'], ['floor', 'FLOOR'], ['twoSwordsStyle', 'TWO_SWORDS_STYLE'], ['backAttackSwitch', 'BACK_ATTACK_SWITCH']]) {
        const v = literal(config, name);
        if (v !== undefined) out[key] = JSON.stringify(plain(v));
    }
    for (const [key, name, d] of [['maxMember', 'MAX_MEMBER', 4], ['actionWait', 'ACTION_WAIT', 0], ['collapseWait', 'COLLAPSE_WAIT', 0], ['winWait', 'WIN_WAIT', 40], ['noWeapon', 'NO_WEAPON', 1],
        ['resurrection', 'RESURRECTION', 38], ['numInterval', 'NUM_INTERBAL', -4], ['numDuration', 'NUM_DURATION', 56], ['animePattern', 'ANIME_PATTERN', 3], ['animeKind', 'ANIME_KIND', 4]]) out[key] = String(Number(k(name, d)) || 0);
    for (const [key, name, d] of [['damageGraphics', 'DAMAGE_GRAPHICS', 'Number+'], ['recoverGraphics', 'RECOVER_GRAPHICS', 'Number-'], ['popDamage0', 'POP_DAMAGE0', ''], ['popMiss', 'POP_MISS', ''],
        ['popEva', 'POP_EVA', ''], ['popCri', 'POP_CRI', ''], ['popMpDam', 'POP_MP_DAM', 'MP DAMAGE'], ['popMpRec', 'POP_MP_REC', '']]) out[key] = String(k(name, d) ?? d);
    for (const [key, name, d] of [['nonDamageWindow', 'NON_DAMAGE_WINDOW', false], ['shadow', 'SHADOW', true], ['walkAnime', 'WALK_ANIME', true], ['backAttack', 'BACK_ATTACK', true]]) {
        const v = k(name, d);
        out[key] = String(v !== false && v !== null);
    }
    const anime = literal(config, 'ANIME');
    if (anime instanceof Map) out.anime = JSON.stringify(plain(anime));
    const action = literal(config, 'ACTION');
    if (action instanceof Map) out.action = JSON.stringify(plain(action));
    const tables = { actor: {}, enemy: {}, state: {}, weapon: {}, skill: {}, item: {} };
    for (const m of ACTOR_METHODS) { const t = caseTable(methodBody(config, 'Game_Actor', m)); if (t) tables.actor[m] = t; }
    for (const m of ENEMY_METHODS) { const t = caseTable(methodBody(config, 'Game_Enemy', m)); if (t) tables.enemy[m] = t; }
    for (const m of ['base_action', 'extension', 'slip_extension']) { const t = caseTable(methodBody(config, 'State', m)); if (t) tables.state[m] = t; }
    for (const m of ['graphic', 'flying_graphic']) { const t = caseTable(methodBody(config, 'Weapon', m)); if (t) tables.weapon[m] = t; }
    for (const m of ['base_action', 'extension', 'flying_graphic']) { const t = caseTable(methodBody(config, 'Skill', m)); if (t) tables.skill[m] = t; }
    for (const m of ['base_action', 'extension']) { const t = caseTable(methodBody(config, 'Item', m)); if (t) tables.item[m] = t; }
    out.tables = JSON.stringify(tables);
    return out;
}

module.exports = { extract, caseTable, methodBody };
