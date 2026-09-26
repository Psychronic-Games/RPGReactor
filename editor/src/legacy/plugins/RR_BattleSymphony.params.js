'use strict';
// Plugin parameters for RR_BattleSymphony from the game's copy of Yami's Battle Symphony (module SYMPHONY): the
// view, visual and fix switches, the actors' positions, the default action lists and the AutoSymphony table (with
// Visual Effect's entries merged in), and which of the add-ons the port carries the game had.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x)])) : Array.isArray(v) ? v.map(plain) : v);
const truth = (v) => v !== false && v !== null && v !== undefined;

function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

const LISTS = ['MAGIC_SETUP', 'MAGIC_WHOLE', 'MAGIC_TARGET', 'MAGIC_FOLLOW', 'MAGIC_FINISH',
    'PHYSICAL_SETUP', 'PHYSICAL_WHOLE', 'PHYSICAL_TARGET', 'PHYSICAL_FOLLOW', 'PHYSICAL_FINISH',
    'ITEM_SETUP', 'ITEM_WHOLE', 'ITEM_TARGET', 'ITEM_FOLLOW', 'ITEM_FINISH',
    'CRITICAL_ACTIONS', 'MISS_ACTIONS', 'EVADE_ACTIONS', 'FAIL_ACTIONS', 'DAMAGED_ACTION',
    'COUNTER_ACTION', 'REFLECT_ACTION', 'SUBSTITUTE_ACTION', 'SUBSTITUTE_END_ACTION'];

function extract({ scripts = [], constants = {} } = {}) {
    const sources = scripts.map(text);
    const source = sources.find(s => /\$imported\["YES-BattleSymphony"\]\s*=\s*true/.test(s)) || '';
    const visual = sources.find(s => /\$imported\["BattleSymphony-VisualEffect"\]\s*=\s*true/.test(s)) || '';
    const k = (name, d) => { const v = constants['SYMPHONY::' + name]; return v === undefined || v === null ? d : v; };
    const out = {
        emptyView: String(truth(k('View::EMPTY_VIEW', false))),
        partyDirection: String(Number(k('View::PARTY_DIRECTION', 4)) || 4),
        weaponIconNonCharset: String(truth(k('Visual::WEAPON_ICON_NON_CHARSET', false))),
        disableAutoMovePose: String(truth(k('Visual::DISABLE_AUTO_MOVE_POSE', true))),
        battlerShadow: String(truth(k('Visual::BATTLER_SHADOW', false))),
        enemyAttackAnimation: String(Number(k('Visual::ENEMY_ATTACK_ANIMATION', 0)) || 0),
        autoImmortalOff: String(truth(k('Fixes::AUTO_IMMORTAL_OFF', true))),
        alwaysCounter: String(truth(k('Fixes::ALWAYS_COUNTER', false)))
    };
    const positions = literal(source, 'ACTORS_POSITION');
    if (positions instanceof Map) out.actorsPosition = JSON.stringify(plain(positions));
    const lists = {};
    for (const name of LISTS) {
        const list = literal(source, name);
        if (Array.isArray(list)) lists[name] = plain(list);
    }
    out.defaultActions = JSON.stringify(lists);
    // AUTO_SYMPHONY.merge!(VE_AUTO_SYMPHONY): a repeated key keeps its place and takes the add-on's list.
    const auto = new Map();
    for (const table of [literal(source, 'AUTO_SYMPHONY'), visual ? literal(visual, 'VE_AUTO_SYMPHONY') : undefined]) {
        if (table instanceof Map) for (const [key, list] of table) auto.set(String(key), plain(list));
    }
    out.autoSymphony = JSON.stringify(Object.fromEntries(auto));
    const has = (re) => String(sources.some(s => re.test(s)));
    out.enemyCharset = has(/\$imported\["BattleSymphony-EnemyCharset"\]\s*=\s*true/);
    out.visualEffect = String(!!visual);
    out.holdersBattler = has(/\$imported\["BattleSymphony-HB"\]\s*=\s*true/);
    out.fancyDeath = has(/\$imported\["YN-FancyDeath"\]\s*=\s*true/);
    out.orientation = has(/def\s+action_set_battler_facing\b/);
    out.durabilityScale = has(/def\s+action_damage_change_by_durability\b/);
    return out;
}

module.exports = { extract, LISTS };
