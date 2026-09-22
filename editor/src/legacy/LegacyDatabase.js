/**
 * LegacyDatabase - the RPG Maker 2000/2003 database → Reactor's MZ-format
 * database files.
 *
 * 2003 has four battle stats (attack, defense, spirit, agility) where MZ
 * has six; spirit feeds both M.Attack and M.Defense, luck is a flat 50 so
 * it changes nothing. Skill and item damage is written as MZ formula
 * strings that reproduce the 2003 arithmetic (power + atk·phys/20 +
 * spi·mag/40 − def·phys/40 − spi·mag/80, variance in tenths). Every actor
 * gets its own class carrying its curves, skills and EXP table (the 2003
 * EXP curve is a table, not MZ's four parameters, and the runtime reads
 * `expTable` when a class has one); the 2003 classes follow after them,
 * offset by the actor count, for Change Class. Items keep their 2003 ids
 * across Items, Weapons and Armors. Battle animations become MV-style
 * sheet animations with cells scaled to MZ's 192 px. Ranks against states
 * and attributes become state and element rate traits.
 */
(function (root) {
    'use strict';

    const C = root.RRLegacyCommands || (typeof require === 'function' ? require('./LegacyCommands.js') : null);
    const F = root.RRLegacyFont || (typeof require === 'function' ? require('./LegacyFont.js') : null);
    const stripExt = (name) => String(name || '').replace(/\.[^.\\/]+$/, '');
    const audio = (m) => (m && m.name && m.name !== '(OFF)' ? { name: stripExt(m.name), pan: Math.max(-100, Math.min(100, ((m.balance ?? 50) - 50) * 2)), pitch: m.tempo ?? 100, volume: m.volume ?? 100 } : { name: '', pan: 0, pitch: 100, volume: 90 });
    const charsetName = (n) => (C ? C.charsetName(n) : n);
    const count = (arr) => (arr || []).filter(Boolean).length;
    const RANK_RATE = ['a_rate', 'b_rate', 'c_rate', 'd_rate', 'e_rate'];

    /** 2003 curves (6 stats × levels) → MZ params (8 × 100). Spirit fills M.Attack and M.Defense, luck is 50. */
    function params(curve) {
        const levels = Math.max(1, Math.floor((curve || []).length / 6));
        const stat = (k, level) => curve[k * levels + Math.min(level, levels) - 1] ?? 1;
        const out = [];
        for (const k of [0, 1, 2, 3, 4, 4, 5]) out.push([0, ...Array.from({ length: 99 }, (_, i) => (curve && curve.length ? stat(k, i + 1) : 1))]);
        out.push(new Array(100).fill(50));
        return out;
    }

    /** The 2003 EXP needed to reach each level, as EasyRPG computes it (curve 1 for 2000, 2 for 2003). */
    function expTable(record, engine2000, maxLevel) {
        const table = [0, 0];
        for (let level = 2; level <= maxLevel; level++) {
            let base = record.exp_base ?? 30, inflation = record.exp_inflation ?? 30, correction = record.exp_correction ?? 0, result = 0;
            if (engine2000) {
                inflation = 1.5 + inflation * 0.01;
                for (let i = level - 1; i >= 1; i--) { result += Math.trunc(correction + base); base *= inflation; inflation = (level * 0.002 + 0.8) * (inflation - 1) + 1; }
            } else {
                for (let i = 1; i <= level - 1; i++) { result += Math.trunc(base); result += i * Math.trunc(inflation); result += Math.trunc(correction); }
            }
            table.push(Math.min(result, 999999999));
        }
        return table;
    }

    /** State and attribute rank letters → MZ rate traits, from the state's or attribute's own A-E percentages. */
    function rankTraits(record, db) {
        const traits = [];
        (record.state_ranks || []).forEach((rank, i) => { const st = db.states && db.states[i + 1]; if (st && rank !== 2) traits.push({ code: 13, dataId: i + 1, value: (st[RANK_RATE[rank]] ?? 100) / 100 }); });
        (record.attribute_ranks || []).forEach((rank, i) => { const at = db.attributes && db.attributes[i + 1]; if (at && rank !== 2) traits.push({ code: 11, dataId: i + 1, value: (at[RANK_RATE[rank]] ?? 100) / 100 }); });
        return traits;
    }

    function actorFlags(record) {
        const traits = [];
        if (record.two_weapon) traits.push({ code: 55, dataId: 1, value: 0 });
        if (record.lock_equipment) traits.push({ code: 64, dataId: 0, value: 0 });
        if (record.auto_battle) traits.push({ code: 62, dataId: 0, value: 0 });
        if (record.super_guard) traits.push({ code: 62, dataId: 1, value: 0 });
        return traits;
    }

    /** Actors, with one class per actor (id = actor id) and the 2003 classes after them. */
    function actorsAndClasses(db, engine2000) {
        const actors = [null], classes = [null];
        const actorCount = (db.actors || []).length - 1;
        const classOffset = Math.max(0, actorCount);
        for (const a of (db.actors || [])) {
            if (!a) continue;
            const levels = Math.max(1, Math.floor((a.parameters || []).length / 6));
            const maxLevel = Math.min(99, Math.max(a.final_level || levels || 50, 1));
            const eq = a.initial_equipment || [];
            actors[a.id] = {
                id: a.id, name: a.name || '', nickname: a.title || '', classId: a.id, initialLevel: a.initial_level || 1, maxLevel,
                characterName: charsetName(a.character_name), characterIndex: a.character_index || 0, faceName: stripExt(a.face_name), faceIndex: a.face_index || 0,
                battlerName: '', equips: [eq[0] || 0, eq[1] || 0, eq[3] || 0, eq[2] || 0, eq[4] || 0], profile: '', note: '',
                traits: [...actorFlags(a), ...rankTraits(a, db)]
            };
            classes[a.id] = {
                id: a.id, name: a.name || `Actor ${a.id}`, note: '', expParams: [30, 20, 30, 30], expTable: expTable(a, engine2000, maxLevel), params: params(a.parameters),
                learnings: (a.skills || []).filter(Boolean).map(l => ({ level: l.level || 1, skillId: l.skill_id, note: '' })),
                traits: [{ code: 22, dataId: 0, value: 0.9 }, { code: 22, dataId: 1, value: 0 }, { code: 22, dataId: 2, value: (a.critical_hit ? (a.critical_hit_chance || 30) : 0) / 100 }, { code: 51, dataId: 1, value: 1 }, ...[1, 2, 3, 4, 5].map(e => ({ code: 52, dataId: e, value: 0 }))]
            };
        }
        for (const k of (db.classes || [])) {
            if (!k) continue;
            const levels = Math.max(1, Math.floor((k.parameters || []).length / 6));
            classes[classOffset + k.id] = {
                id: classOffset + k.id, name: k.name || `Class ${k.id}`, note: '', expParams: [30, 20, 30, 30], expTable: expTable(k, engine2000, Math.min(99, levels || 50)), params: params(k.parameters),
                learnings: (k.skills || []).filter(Boolean).map(l => ({ level: l.level || 1, skillId: l.skill_id, note: '' })),
                traits: [{ code: 22, dataId: 0, value: 0.9 }, { code: 51, dataId: 1, value: 1 }, ...[1, 2, 3, 4, 5].map(e => ({ code: 52, dataId: e, value: 0 })), ...actorFlags(k), ...rankTraits(k, db)]
            };
        }
        return { actors, classes, classOffset };
    }

    const SCOPE = { 0: 1, 1: 2, 2: 11, 3: 7, 4: 8 }; // 2003 enemy / all enemies / self / ally / all allies → MZ
    const occasion = (field, battle) => (field && battle ? 0 : battle ? 1 : field ? 2 : 3);

    /** The MZ damage formula that reproduces 2003 skill arithmetic. */
    function skillFormula(sk) {
        const pr = sk.physical_rate ?? 0, mr = sk.magical_rate ?? 0, power = sk.power ?? 0;
        const terms = [String(power)];
        if (pr) terms.push(`a.atk * ${pr} / 20`);
        if (mr) terms.push(`a.mat * ${mr} / 40`);
        const targetsEnemies = (sk.scope ?? 0) <= 1;
        if (targetsEnemies && !sk.ignore_defense) { if (pr) terms.push(`- b.def * ${pr} / 40`); if (mr) terms.push(`- b.mdf * ${mr} / 80`); }
        return `Math.max(0, Math.floor(${terms.join(' + ').replace(/\+ -\s*/g, '- ')}))`;
    }

    function skills(db, notes, extraCommonEvents) {
        const out = [null];
        for (const sk of (db.skills || [])) {
            if (!sk) continue;
            const type = sk.type ?? 0;
            const targetsEnemies = (sk.scope ?? 0) <= 1;
            const effects = [];
            const stateEffects = sk.state_effects || [];
            stateEffects.forEach((on, i) => { if (on) effects.push({ code: sk.reverse_state_effect ? 22 : 21, dataId: i + 1, value1: 1, value2: 0 }); });
            for (const [flag, param] of [['affect_attack', 2], ['affect_defense', 3], ['affect_spirit', 4], ['affect_agility', 6]]) if (sk[flag]) effects.push({ code: targetsEnemies ? 32 : 31, dataId: param, value1: 5, value2: 0 });
            if (sk.affect_spirit) effects.push({ code: targetsEnemies ? 32 : 31, dataId: 5, value1: 5, value2: 0 });
            if (sk.affect_attack || sk.affect_defense || sk.affect_spirit || sk.affect_agility) notes.skillStatEffect = (notes.skillStatEffect || 0) + 1;
            const attrs = (sk.attribute_effects || []).map((on, i) => (on ? i + 1 : 0)).filter(Boolean);
            if (attrs.length > 1) notes.multiElementSkill = (notes.multiElementSkill || 0) + 1;
            let damageType = 0;
            if (type === 0 && (sk.affect_hp || sk.affect_sp)) {
                if (sk.affect_hp) damageType = sk.absorb_damage ? 5 : targetsEnemies ? 1 : 3;
                else damageType = sk.absorb_damage ? 6 : targetsEnemies ? 2 : 4;
                if (sk.affect_hp && sk.affect_sp) notes.skillHpAndMp = (notes.skillHpAndMp || 0) + 1;
            }
            if (type === 3 && sk.switch_id) {
                const ce = { name: `Skill switch: ${sk.name || sk.id}`, list: [{ code: 121, indent: 0, parameters: [sk.switch_id, sk.switch_id, 0] }, { code: 0, indent: 0, parameters: [] }] };
                effects.push({ code: 44, dataId: extraCommonEvents.add(ce), value1: 0, value2: 0 });
            }
            if (type === 1 || type === 2) notes.teleportSkill = (notes.teleportSkill || 0) + 1;
            if (sk.sp_type === 1) notes.percentMpCost = (notes.percentMpCost || 0) + 1;
            out[sk.id] = {
                id: sk.id, name: sk.name || '', description: sk.description || '', iconIndex: 0, note: '',
                stypeId: 1, mpCost: sk.sp_type === 1 ? 0 : (sk.sp_cost || 0), tpCost: 0, tpGain: 0,
                scope: type === 3 ? 11 : (SCOPE[sk.scope ?? 0] ?? 1), occasion: occasion(sk.occasion_field !== false, sk.occasion_battle !== false),
                speed: 0, successRate: sk.hit ?? 100, repeats: 1, hitType: (sk.physical_rate || 0) > (sk.magical_rate || 0) ? 1 : 2,
                animationId: sk.animation_id || 0, messageType: 0,
                message1: sk.using_message1 ? ' ' + sk.using_message1 : '', message2: sk.using_message2 || '',
                requiredWtypeId1: 0, requiredWtypeId2: 0,
                damage: { type: damageType, elementId: attrs[0] || 0, formula: damageType ? skillFormula(sk) : '0', variance: Math.min(100, (sk.variance ?? 4) * 10), critical: false },
                effects
            };
        }
        return out;
    }

    /** Items by 2003 type: weapons and armors keep the 2003 item id in their own tables. */
    function items(db, notes, extraCommonEvents, skillsOut) {
        const items = [null], weapons = [null], armors = [null];
        const kinds = {};
        for (const it of (db.items || [])) {
            if (!it) continue;
            const type = it.type ?? 0;
            const base = { id: it.id, name: it.name || '', description: it.description || '', iconIndex: 0, note: '', price: it.price || 0 };
            if (type === 1) {
                kinds[it.id] = 'weapons';
                const traits = [{ code: 22, dataId: 0, value: ((it.hit ?? 90) - 90) / 100 }];
                if (it.critical_hit) traits.push({ code: 22, dataId: 2, value: it.critical_hit / 100 });
                if (it.two_handed) traits.push({ code: 54, dataId: 2, value: 0 });
                if (it.dual_attack) traits.push({ code: 34, dataId: 0, value: 1 });
                if (it.attack_all) { notes.attackAll = (notes.attackAll || 0) + 1; }
                if (it.preemptive) traits.push({ code: 64, dataId: 2, value: 0 });
                if (it.cursed) traits.push({ code: 64, dataId: 0, value: 0 });
                const attrs = (it.attribute_set || []).map((on, i) => (on ? i + 1 : 0)).filter(Boolean);
                for (const a of attrs) traits.push({ code: 31, dataId: a, value: 0 });
                (it.state_set || []).forEach((on, i) => { if (on) traits.push({ code: 32, dataId: i + 1, value: (it.state_chance ?? 0) / 100 }); });
                weapons[it.id] = { ...base, wtypeId: 1, etypeId: 1, animationId: it.animation_id || 0, params: [0, 0, it.atk_points1 || 0, it.def_points1 || 0, it.spi_points1 || 0, it.spi_points1 || 0, it.agi_points1 || 0, 0], traits };
            } else if (type >= 2 && type <= 5) {
                kinds[it.id] = 'armors';
                const traits = [];
                if (it.raise_evasion) traits.push({ code: 22, dataId: 1, value: 0.25 });
                if (it.half_sp_cost) traits.push({ code: 23, dataId: 4, value: 0.5 });
                if (it.cursed) traits.push({ code: 64, dataId: 0, value: 0 });
                if (it.prevent_critical) notes.preventCritical = (notes.preventCritical || 0) + 1;
                (it.state_set || []).forEach((on, i) => { if (on) traits.push({ code: 14, dataId: i + 1, value: 0 }); });
                (it.attribute_set || []).forEach((on, i) => { if (on) traits.push({ code: 11, dataId: i + 1, value: 0.5 }); });
                armors[it.id] = { ...base, atypeId: 1, etypeId: { 2: 2, 3: 4, 4: 3, 5: 5 }[type], params: [0, 0, it.atk_points1 || 0, it.def_points1 || 0, it.spi_points1 || 0, it.spi_points1 || 0, it.agi_points1 || 0, 0], traits };
            } else {
                kinds[it.id] = 'items';
                const effects = [];
                let scope = it.entire_party ? 8 : 7, damage = { type: 0, elementId: 0, formula: '0', variance: 20, critical: false }, animationId = it.animation_id || 0;
                if (type === 6) {
                    if (it.ko_only) scope = it.entire_party ? 10 : 9;
                    if (it.recover_hp_rate || it.recover_hp) effects.push({ code: 11, dataId: 0, value1: (it.recover_hp_rate || 0) / 100, value2: it.recover_hp || 0 });
                    if (it.recover_sp_rate || it.recover_sp) effects.push({ code: 12, dataId: 0, value1: (it.recover_sp_rate || 0) / 100, value2: it.recover_sp || 0 });
                    (it.state_set || []).forEach((on, i) => { if (on) effects.push({ code: 22, dataId: i + 1, value1: 1, value2: 0 }); });
                } else if (type === 7) {
                    if (it.skill_id) effects.push({ code: 43, dataId: it.skill_id, value1: 0, value2: 0 });
                } else if (type === 8) {
                    for (const [field, param] of [['max_hp_points', 0], ['max_sp_points', 1], ['atk_points2', 2], ['def_points2', 3], ['spi_points2', 4], ['spi_points2', 5], ['agi_points2', 6]]) if (it[field]) effects.push({ code: 42, dataId: param, value1: it[field], value2: 0 });
                } else if (type === 9) {
                    const sk = skillsOut[it.skill_id];
                    if (sk) { scope = sk.scope; damage = sk.damage; effects.push(...sk.effects); animationId = animationId || sk.animationId; }
                    else notes.specialItemNoSkill = (notes.specialItemNoSkill || 0) + 1;
                } else if (type === 10) {
                    if (it.switch_id) {
                        const ce = { name: `Item switch: ${it.name || it.id}`, list: [{ code: 121, indent: 0, parameters: [it.switch_id, it.switch_id, 0] }, { code: 0, indent: 0, parameters: [] }] };
                        effects.push({ code: 44, dataId: extraCommonEvents.add(ce), value1: 0, value2: 0 });
                    }
                    scope = 0;
                }
                const field = type === 10 ? it.occasion_field2 !== false : type === 0 ? false : it.occasion_field1 !== false;
                const battle = type === 10 ? it.occasion_battle === true : type === 6 || type === 9;
                items[it.id] = {
                    ...base, itypeId: type === 0 ? 2 : 1, consumable: (it.uses ?? 1) !== 0, scope, occasion: type === 0 ? 3 : occasion(field, battle), speed: 0, successRate: 100, repeats: 1, hitType: 0,
                    animationId, damage, effects
                };
            }
        }
        return { items, weapons, armors, kinds };
    }

    function enemies(db) {
        const out = [null];
        for (const e of (db.enemies || [])) {
            if (!e) continue;
            const actions = (e.actions || []).filter(Boolean).map(a => {
                let skillId = 1;
                if (a.kind === 1) skillId = a.skill_id || 1;
                else if (a.kind === 0) skillId = a.basic === 2 ? 2 : 1;
                const cond = { 0: [0, 0, 0], 1: [6, a.condition_param1, 0], 2: [1, a.condition_param1, a.condition_param2], 4: [2, a.condition_param1, a.condition_param2], 5: [3, a.condition_param1, a.condition_param2], 6: [5, a.condition_param1, a.condition_param2] }[a.condition_type ?? 0] || [0, 0, 0];
                return { skillId, rating: Math.max(1, Math.min(9, Math.round((a.rating ?? 50) * 9 / 100))), conditionType: cond[0], conditionParam1: cond[1], conditionParam2: cond[2] };
            });
            out[e.id] = {
                id: e.id, name: e.name || '', battlerName: stripExt(e.battler_name), battlerHue: e.battler_hue || 0, note: '',
                params: [e.max_hp || 1, e.max_sp || 0, e.attack || 1, e.defense || 1, e.spirit || 1, e.spirit || 1, e.agility || 1, 50],
                exp: e.exp || 0, gold: e.gold || 0,
                dropItems: e.drop_id ? [{ kind: 1, dataId: e.drop_id, denominator: Math.max(1, Math.round(100 / Math.max(1, e.drop_prob || 100))) }] : [],
                actions: actions.length ? actions : [{ skillId: 1, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }],
                traits: [...rankTraits(e, db), ...(e.critical_hit ? [{ code: 22, dataId: 2, value: (e.critical_hit_chance || 30) / 100 }] : []), ...(e.miss ? [{ code: 22, dataId: 0, value: -0.1 }] : [])]
            };
        }
        return out;
    }

    function troops(db, ctx) {
        const out = [null];
        for (const t of (db.troops || [])) {
            if (!t) continue;
            const pages = (t.pages || []).filter(Boolean).map(pg => {
                const c = pg.condition || {}, f = c.flags || 0;
                if (f & 0x3c4) ctx.notes.troopCondition = (ctx.notes.troopCondition || 0) + 1;
                return {
                    conditions: {
                        actorHp: c.actor_hp_max ?? 50, actorId: c.actor_id || 1, actorValid: !!(f & 0x40), enemyHp: c.enemy_hp_max ?? 50, enemyIndex: Math.max(0, (c.enemy_id || 1) - 1), enemyValid: !!(f & 0x20),
                        switchId: c.switch_a_id || 1, switchValid: !!(f & 0x01), turnA: c.turn_a || 0, turnB: c.turn_b || 0, turnEnding: false, turnValid: !!(f & 0x08)
                    },
                    list: C.convertList(pg.event_commands || [], ctx).list, span: 0
                };
            });
            out[t.id] = { id: t.id, name: t.name || '', members: (t.members || []).filter(Boolean).map(m => ({ enemyId: m.enemy_id, x: m.x || 0, y: m.y || 0, hidden: !!m.invisible })), pages: pages.length ? pages : [{ conditions: { actorHp: 50, actorId: 1, actorValid: false, enemyHp: 50, enemyIndex: 0, enemyValid: false, switchId: 1, switchValid: false, turnA: 0, turnB: 0, turnEnding: false, turnValid: false }, list: [{ code: 0, indent: 0, parameters: [] }], span: 0 }] };
        }
        return out;
    }

    function states(db, notes) {
        const out = [null];
        for (const st of (db.states || [])) {
            if (!st) continue;
            const traits = [];
            if (st.affect_attack) traits.push({ code: 21, dataId: 2, value: 0.5 });
            if (st.affect_defense) traits.push({ code: 21, dataId: 3, value: 0.5 });
            if (st.affect_spirit) { traits.push({ code: 21, dataId: 4, value: 0.5 }); traits.push({ code: 21, dataId: 5, value: 0.5 }); }
            if (st.affect_agility) traits.push({ code: 21, dataId: 6, value: 0.5 });
            if (st.reduce_hit_ratio !== undefined && st.reduce_hit_ratio !== 100) traits.push({ code: 22, dataId: 0, value: -(100 - st.reduce_hit_ratio) / 100 });
            if (st.avoid_attacks) traits.push({ code: 22, dataId: 1, value: 1 });
            if (st.reflect_magic) traits.push({ code: 22, dataId: 5, value: 1 });
            if (st.hp_change_type === 1 && st.hp_change_val) traits.push({ code: 22, dataId: 7, value: -st.hp_change_val / 100 });
            if (st.sp_change_type === 1 && st.sp_change_val) traits.push({ code: 22, dataId: 8, value: -st.sp_change_val / 100 });
            if (st.restrict_skill || st.restrict_magic) { traits.push({ code: 42, dataId: 1, value: 0 }); notes.stateSealsSkills = (notes.stateSealsSkills || 0) + 1; }
            const restriction = { 0: 0, 1: 4, 2: 1, 3: 2 }[st.restriction ?? 0] ?? 0;
            out[st.id] = {
                id: st.id, name: st.name || '', iconIndex: 0, note: '', priority: Math.max(0, Math.min(100, st.priority ?? 50)), restriction,
                motion: restriction === 4 ? 3 : 0, overlay: 0,
                removeAtBattleEnd: (st.type ?? 0) === 0, removeByRestriction: false, autoRemovalTiming: (st.auto_release_prob || 0) > 0 ? 2 : 0,
                minTurns: st.hold_turn || 1, maxTurns: st.hold_turn || 1, removeByDamage: (st.release_by_damage || 0) > 0, chanceByDamage: st.release_by_damage || 100,
                removeByWalking: false, stepsToRemove: 100, messageType: 0,
                message1: st.message_actor || '', message2: st.message_enemy || '', message3: st.message_already || '', message4: st.message_recovery || '',
                traits
            };
        }
        if (out[1]) { out[1].priority = 100; out[1].motion = 3; out[1].restriction = 4; out[1].removeAtBattleEnd = false; }
        return out;
    }

    /** 2003 battle animations → MV-style sheet animations at MZ's 192 px cells (the sheets are scaled to match). */
    function animations(db, notes) {
        const out = [null];
        for (const a of (db.animations || [])) {
            if (!a) continue;
            const cell = a.large ? 128 : 96, scale = 192 / cell;
            const frames = (a.frames || []).filter(Boolean).map(f => (f.cells || []).filter(Boolean).filter(c => c.valid !== false).map(c => [c.cell_id || 0, c.x || 0, c.y || 0, Math.round((c.zoom ?? 100) / scale), 0, 0, Math.round(255 * (100 - (c.transparency || 0)) / 100), 0]));
            const timings = (a.timings || []).filter(Boolean).map(t => ({
                frame: Math.max(0, (t.frame || 1) - 1), se: t.se && t.se.name ? audio(t.se) : null,
                flashScope: t.flash_scope || 0, flashColor: [(t.flash_red || 0) * 8, (t.flash_green || 0) * 8, (t.flash_blue || 0) * 8, (t.flash_power || 0) * 8], flashDuration: 5
            }));
            if ((a.timings || []).some(t => t && t.screen_shake)) notes.animationShake = (notes.animationShake || 0) + 1;
            if ((a.frames || []).some(f => f && (f.cells || []).some(c => c && (c.tone_red !== undefined && c.tone_red !== 100 || c.tone_gray)))) notes.animationTone = (notes.animationTone || 0) + 1;
            out[a.id] = { id: a.id, name: a.name || '', animation1Name: stripExt(a.animation_name), animation1Hue: 0, animation2Name: '', animation2Hue: 0, position: Math.max(0, Math.min(2, a.position ?? 1)), frames: frames.length ? frames : [[]], timings };
        }
        return out;
    }

    function commonEvents(db, ctx, extra) {
        const out = [null];
        let maxId = 0;
        for (const ce of (db.commonevents || [])) {
            if (!ce) continue;
            maxId = Math.max(maxId, ce.id);
            out[ce.id] = { id: ce.id, name: ce.name || '', trigger: Math.max(0, Math.min(2, ce.trigger ?? 0)), switchId: ce.switch_flag ? (ce.switch_id || 1) : 1, list: C.convertList(ce.event_commands || [], ctx).list };
        }
        for (const e of extra.list) { maxId++; out[maxId] = { id: maxId, name: e.name, trigger: 0, switchId: 1, list: e.list }; e.id = maxId; }
        return out;
    }

    /** Common events generated for skills and items that flip a switch; ids are handed out after the 2003 ones. */
    function extraEvents(db) {
        const list = [];
        const base = (db.commonevents || []).length - 1;
        return { list, add(ce) { list.push(ce); return base + list.length; } };
    }

    /** System.json terms, types, vehicles and battle settings from the 2003 terms and system. */
    function system(out, db, tree, notes) {
        const t = db.terms || {}, sys = db.system || {};
        const terms = out.terms || { basic: [], commands: [], params: [], messages: {} };
        // A term the author never touched is RPG Maker's Japanese default, mojibake in a Western game; MZ's own word stays.
        const set = (arr, i, v) => { if (v && !(F && F.isJapaneseDefault(v, db.encoding))) arr[i] = v; };
        set(terms.basic, 0, t.level); set(terms.basic, 1, t.lvl_short); set(terms.basic, 2, t.health_points); set(terms.basic, 3, t.hp_short); set(terms.basic, 4, t.spirit_points); set(terms.basic, 5, t.sp_short); set(terms.basic, 8, t.exp_short); set(terms.basic, 9, t.exp_short);
        for (const [i, k] of [[0, 'battle_fight'], [1, 'battle_escape'], [2, 'command_attack'], [3, 'command_defend'], [4, 'command_item'], [5, 'command_skill'], [6, 'menu_equipment'], [7, 'status'], [8, 'order'], [9, 'menu_save'], [10, 'menu_quit'], [12, 'weapon'], [13, 'armor'], [18, 'new_game'], [19, 'load_game'], [22, 'no'], [24, 'shop_buy1'], [25, 'shop_sell1']]) set(terms.commands, i, t[k]);
        for (const [i, k] of [[0, 'health_points'], [1, 'spirit_points'], [2, 'attack'], [3, 'defense'], [4, 'spirit'], [6, 'agility']]) set(terms.params, i, t[k]);
        const m = terms.messages;
        const msg = (key, v) => { if (v) m[key] = v; };
        msg('emerge', t.encounter ? t.encounter.replace(/%S|%s/, '%1') : ''); msg('preemptive', t.special_combat); msg('escapeStart', t.escape_success ? '%1 ' + t.escape_success : ''); msg('escapeFailure', t.escape_failure);
        msg('victory', t.victory); msg('defeat', t.defeat); msg('obtainExp', t.exp_received ? '%1 ' + t.exp_received : ''); msg('obtainGold', t.gold_recieved_a ? `${t.gold_recieved_a} %1${t.gold_recieved_b || ''}` : ''); msg('obtainItem', t.item_recieved ? '%1 ' + t.item_recieved : '');
        msg('actorDamage', t.actor_damaged ? '%1 %2 ' + t.actor_damaged : ''); msg('actorNoDamage', t.actor_undamaged ? '%1 ' + t.actor_undamaged : ''); msg('enemyDamage', t.enemy_damaged ? '%1 %2 ' + t.enemy_damaged : ''); msg('enemyNoDamage', t.enemy_undamaged ? '%1 ' + t.enemy_undamaged : '');
        msg('criticalToActor', t.enemy_critical); msg('criticalToEnemy', t.actor_critical); msg('evasion', t.dodge ? '%1 ' + t.dodge : ''); msg('actionFailure', t.skill_failure_a ? '%1 ' + t.skill_failure_a : ''); msg('actorRecovery', t.hp_recovery ? '%1 %3 %2 ' + t.hp_recovery : '');
        msg('buffAdd', t.parameter_increase ? '%1 %2 ' + t.parameter_increase : ''); msg('debuffAdd', t.parameter_decrease ? '%1 %2 ' + t.parameter_decrease : ''); msg('actorDrain', t.actor_hp_absorbed ? '%1 %3 %2 ' + t.actor_hp_absorbed : ''); msg('enemyDrain', t.enemy_hp_absorbed ? '%1 %3 %2 ' + t.enemy_hp_absorbed : '');
        msg('levelUp', t.level_up ? '%1 %2 %3 ' + t.level_up : ''); msg('obtainSkill', t.skill_learned ? '%1 ' + t.skill_learned : ''); msg('saveMessage', t.save_game_message); msg('loadMessage', t.load_game_message); msg('file', t.file);
        msg('possession', t.possessed_items); msg('useItem', t.use_item ? '%1 %2 ' + t.use_item : '');
        out.terms = terms;
        out.elements = ['', ...(db.attributes || []).slice(1).map(a => (a && a.name) || '')];
        out.skillTypes = ['', t.command_skill || 'Skill'];
        out.weaponTypes = ['', t.weapon || 'Weapon'];
        out.armorTypes = ['', t.armor || 'Armor'];
        out.equipTypes = ['', t.weapon || 'Weapon', t.shield || 'Shield', t.helmet || 'Head', t.armor || 'Body', t.accessory || 'Accessory'];
        out.currencyUnit = t.gold || out.currencyUnit;
        out.battleSystem = db.engine === 'RPG Maker 2000' ? 0 : 1;
        out.optSideView = false; out.optDisplayTp = false; out.optFloorDeath = false; out.optFollowers = false;
        const start = (tree && tree.start) || {};
        for (const [key, name, index, music, map, x, y] of [['boat', 'boat_name', 'boat_index', 'boat_music', 'boat_map_id', 'boat_x', 'boat_y'], ['ship', 'ship_name', 'ship_index', 'ship_music', 'ship_map_id', 'ship_x', 'ship_y'], ['airship', 'airship_name', 'airship_index', 'airship_music', 'airship_map_id', 'airship_x', 'airship_y']]) {
            out[key] = { characterName: charsetName(sys[name]), characterIndex: sys[index] || 0, bgm: audio(sys[music]), startMapId: start[map] || 0, startX: start[x] || 0, startY: start[y] || 0 };
        }
        out.testBattlers = []; out.testTroopId = 1;
        if (count(db.terrains) && (db.terrains || []).some(tr => tr && tr.background_name)) notes.terrainBattleback = (notes.terrainBattleback || 0) + 1;
        return out;
    }

    /** The whole database, plus the context the map events use. */
    /** Apply a baked-in language to the converted records: "<table>.<field>" contexts from the game's translation files. */
    function translateRecords(out, translator) {
        if (!translator) return;
        const field = (records, ctx, key, target) => { for (const r of records || []) { if (r && typeof r[target || key] === 'string') { const v = translator.field(ctx + '.' + key, r[target || key]); if (v !== undefined) r[target || key] = v; } } };
        field(out.actors, 'actors', 'name'); field(out.actors, 'actors', 'title', 'nickname'); field(out.classes, 'classes', 'name');
        field(out.skills, 'skills', 'name'); field(out.skills, 'skills', 'description');
        for (const table of ['items', 'weapons', 'armors']) { field(out[table], 'items', 'name'); field(out[table], 'items', 'description'); }
        field(out.enemies, 'enemies', 'name'); field(out.troops, 'troops', 'name'); field(out.states, 'states', 'name');
        for (const [k, target] of [['message_actor', 'message1'], ['message_enemy', 'message2'], ['message_already', 'message3'], ['message_recovery', 'message4']]) field(out.states, 'states', k, target);
    }

    function convert(db, tree, notes, translator) {
        const engine2000 = db.engine === 'RPG Maker 2000';
        const extra = extraEvents(db);
        const { actors, classes, classOffset } = actorsAndClasses(db, engine2000);
        const skillsOut = skills(db, notes, extra);
        const { items: itemsOut, weapons, armors, kinds } = items(db, notes, extra, skillsOut);
        const ctx = {
            itemKind: (id) => kinds[id] || 'items', itemType: (id) => (db.items && db.items[id] ? db.items[id].type : 0),
            actors: Object.fromEntries(actors.filter(Boolean).map(a => [a.id, a])), classOffset, terms: db.terms, system: db.system, notes,
            translate: translator ? translator.text : null, translateLines: translator ? translator.lines : null
        };
        const out = {
            actors, classes, skills: skillsOut, items: itemsOut, weapons, armors, enemies: enemies(db), troops: troops(db, ctx), states: states(db, notes),
            animations: animations(db, notes), commonEvents: commonEvents(db, ctx, extra), ctx
        };
        translateRecords(out, translator);
        return out;
    }

    const api = { convert, translateRecords, actorsAndClasses, skills, items, enemies, troops, states, animations, commonEvents, system, expTable, params, skillFormula, rankTraits };
    root.RRLegacyDatabase = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
