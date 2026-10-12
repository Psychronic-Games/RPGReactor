'use strict';
// Plugin parameters for RR_ThrallBattlers: the game's VX database as its battle rules read it.
//
// Thrall's battle scripts compute damage, hits, states and enemy choices from the VX records themselves
// (a skill's base damage and ATK/SPI factors, every element it carries, an enemy's ranks and its action
// list with its "wait" entries, a state's restriction and release chance). The MZ database the importer
// writes keeps most of that only folded into formulas and traits, so the records are read again from
// Data/*.rvdata, compactly. Without the files the plugin rebuilds the same records from the MZ database.

const M = require('../RubyMarshal.js');

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const list = (v) => (Array.isArray(v) ? v : []);
const ids = (v) => list(v).map(x => num(x)).filter(x => x > 0);
const ranks = (table) => (table && table.data ? Array.from(table.data).map(r => Math.max(0, Math.min(9, num(r)))).join('') : '');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function load(read, name) {
    if (typeof read !== 'function') return null;
    for (const rel of [`Data/${name}.rvdata`, `Data/${name}.RVDATA`, `data/${name}.rvdata`]) {
        let bytes = null;
        try { bytes = read(rel); } catch (_) { bytes = null; }
        if (bytes && bytes.length) { try { return M.load(bytes); } catch (_) { return null; } }
    }
    return null;
}

function usable(r) {
    const flags = (r.physical_attack ? 1 : 0) | (r.damage_to_mp ? 2 : 0) | (r.absorb_damage ? 4 : 0) | (r.ignore_defense ? 8 : 0);
    return [num(r.base_damage), num(r.atk_f), num(r.spi_f), num(r.variance), num(r.hit, 100), num(r.scope), num(r.occasion), num(r.speed),
        num(r.mp_cost), num(r.animation_id), num(r.common_event_id), flags, ids(r.element_set), ids(r.plus_state_set), ids(r.minus_state_set)];
}

function byId(records, convert) {
    const out = {};
    for (const r of list(records)) if (r && r.id) out[r.id] = convert(r);
    return out;
}

/** The compact VX database (an object), or null when the game's data files cannot be read. */
function vxData(read) {
    const skills = load(read, 'Skills');
    if (!skills) return null;
    const items = load(read, 'Items'), weapons = load(read, 'Weapons'), armors = load(read, 'Armors');
    const enemies = load(read, 'Enemies'), states = load(read, 'States'), classes = load(read, 'Classes');
    const actors = load(read, 'Actors'), troops = load(read, 'Troops');
    const drop = (d) => (d && num(d.kind) ? [num(d.kind), [0, num(d.item_id), num(d.weapon_id), num(d.armor_id)][num(d.kind)] || 0, Math.max(1, num(d.denominator, 1))] : [0, 0, 1]);
    const out = {
        skills: byId(skills, usable),
        items: byId(items, r => usable(r).concat([num(r.hp_recovery_rate), num(r.hp_recovery), num(r.mp_recovery_rate), num(r.mp_recovery),
            num(r.parameter_type), num(r.parameter_points), r.consumable === false ? 0 : 1])),
        weapons: byId(weapons, w => [num(w.atk), num(w.def), num(w.spi), num(w.agi), num(w.hit, 95), num(w.animation_id),
            (w.two_handed ? 1 : 0) | (w.fast_attack ? 2 : 0) | (w.dual_attack ? 4 : 0) | (w.critical_bonus ? 8 : 0), ids(w.element_set), ids(w.state_set)]),
        armors: byId(armors, a => [num(a.kind), num(a.atk), num(a.def), num(a.spi), num(a.agi), num(a.eva),
            (a.prevent_critical ? 1 : 0) | (a.half_mp_cost ? 2 : 0) | (a.double_exp_gain ? 4 : 0) | (a.auto_hp_recover ? 8 : 0), ids(a.element_set), ids(a.state_set)]),
        enemies: byId(enemies, e => [num(e.maxhp, 1), num(e.maxmp), num(e.atk), num(e.def), num(e.spi), num(e.agi), num(e.hit, 95), num(e.eva),
            num(e.exp), num(e.gold), (e.has_critical ? 1 : 0) | (e.levitate ? 2 : 0), drop(e.drop_item1), drop(e.drop_item2), ranks(e.element_ranks), ranks(e.state_ranks),
            list(e.actions).map(a => [num(a.kind), num(a.basic), num(a.skill_id), num(a.condition_type), num(a.condition_param1), num(a.condition_param2), num(a.rating, 5)])]),
        states: byId(states, s => [num(s.restriction), num(s.priority, 5), num(s.hold_turn), num(s.auto_release_prob), num(s.atk_rate, 100), num(s.def_rate, 100),
            num(s.spi_rate, 100), num(s.agi_rate, 100),
            (s.nonresistance ? 1 : 0) | (s.offset_by_opposite ? 2 : 0) | (s.slip_damage ? 4 : 0) | (s.reduce_hit_ratio ? 8 : 0) | (s.battle_only ? 16 : 0) | (s.release_by_damage ? 32 : 0),
            ids(s.element_set), ids(s.state_set)]),
        classes: byId(classes, c => [num(c.position), ranks(c.element_ranks), ranks(c.state_ranks), c.skill_name_valid ? 1 : 0, String(c.skill_name || '')]),
        actors: byId(actors, a => [num(a.class_id, 1), (a.two_swords_style ? 1 : 0) | (a.fix_equipment ? 2 : 0) | (a.auto_battle ? 4 : 0) | (a.super_guard ? 8 : 0)
            | (a.pharmacology ? 16 : 0) | (a.critical_bonus ? 32 : 0)]),
        immortal: []
    };
    for (const t of list(troops)) if (t) list(t.members).forEach((m, i) => { if (m && m.immortal) out.immortal.push(`${t.id}:${i}`); });
    return out;
}

/** Members a troop starts immortal (VX's troop member checkbox), from the data or the scripts' troop list. */
function extract({ scripts = [], read } = {}) {
    const all = scripts.map(text).join('\n');
    const data = vxData(read);
    const out = { vxData: data ? JSON.stringify(data) : '' };
    // The minion list that named weapons and Holy deal extra damage to.
    const minions = /minions\s*=\s*\[([\d,\s]+)\]/.exec(all);
    if (minions) out.minions = minions[1].replace(/\s+/g, '');
    return out;
}

module.exports = { extract, vxData };
