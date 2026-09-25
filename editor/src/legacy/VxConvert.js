/**
 * VxConvert - RPG Maker VX (RGSS2) data into RPG Maker MZ's. Pure.
 *
 * VX Ace grew out of VX: maps, events, tile ids, the A1–E tileset sheets,
 * move routes, troops and animations have the same shape. So VX event
 * commands are reshaped into their Ace form (aceCommands) and converted by
 * RgssConvert with everything it knows (Ruby, script families, text codes).
 * Where VX differs:
 *
 * - Commands: actor commands (311–318) have no fixed/variable choice; Control
 *   Variables reads items, actors, enemies, characters and "other" as operands
 *   of its own (Ace has one game-data operand); the actor conditional has no
 *   class test; weather and buttons are numbers; Shop lists goods without
 *   prices; Force Action names a basic action or a skill.
 * - One tileset for the whole game (Graphics/System/TileA1…TileE) with its
 *   passages in System.rvdata: flag 0x01 blocks walking, 0x02 boats, 0x04
 *   ships, 0x08 airships, 0x10 is ☆, 0x40 bush, 0x80 counter.
 * - Encounter areas (Areas.rvdata): rectangles with their own troops, painted
 *   as MZ regions.
 * - The database: six stats (max HP/MP, ATK, DEF, SPI, AGI), weapons equipped
 *   by id per class, damage from base damage and ATK/SPI factors, ranks.
 */
(function (root) {
    'use strict';

    const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const str = (v) => (typeof v === 'string' ? v : '');
    const list = (v) => (Array.isArray(v) ? v : []);
    const tag = (notes, key, n = 1) => { if (notes) notes[key] = (notes[key] || 0) + n; };
    const audio = (a) => (a ? { name: str(a.name), volume: num(a.volume, 100), pitch: num(a.pitch, 100), pan: 0 } : { name: '', volume: 100, pitch: 100, pan: 0 });
    const table1 = (t) => (t && t.data ? Array.from(t.data) : []);

    /** RGSS2's Input constants → the key names RgssConvert maps (Ace keeps them as symbols). */
    const BUTTON = { 2: 'DOWN', 4: 'LEFT', 6: 'RIGHT', 8: 'UP', 11: 'A', 12: 'B', 13: 'C', 14: 'X', 15: 'Y', 16: 'Z', 17: 'L', 18: 'R', 21: 'SHIFT', 22: 'CTRL', 23: 'ALT' };
    const WEATHER = ['none', 'rain', 'storm', 'snow'];
    /** Control Variables' actor stats (level, exp, hp, mp, maxhp, maxmp, atk, def, spi, agi) → MZ's; spirit is M.Attack. */
    const ACTOR_DATA = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10];
    /** Enemy stats (hp, mp, maxhp, maxmp, atk, def, spi, agi) → MZ's. */
    const ENEMY_DATA = [0, 1, 2, 3, 4, 5, 6, 8];
    /** Change Parameters (maxhp, maxmp, atk, def, spi, agi) → MZ param ids. */
    const PARAM = [0, 1, 2, 3, 4, 6];

    /**
     * One VX command list reshaped into VX Ace's (still RGSS objects; RgssConvert.commands finishes it).
     * `ids` = { attack, guard, escape }: the MZ skill ids Force Action's basic actions become.
     */
    function aceCommands(cmds, ids = {}) {
        return list(cmds).map(c => {
            if (!c) return c;
            const p = list(c.parameters).slice();
            const code = num(c.code);
            let out = p;
            switch (code) {
                case 111:
                    if (p[0] === 4 && num(p[2]) >= 2) { out = p.slice(); out[2] = num(p[2]) + 1; }   // no class test in VX
                    else if (p[0] === 11) out = [11, BUTTON[num(p[1])] || 'C'];
                    break;
                case 122: {
                    const [start, end, op, type] = p;
                    if (type === 3) out = [start, end, op, 3, 0, num(p[4]), 0];
                    else if (type === 4) out = [start, end, op, 3, 3, num(p[4]), ACTOR_DATA[num(p[5])] ?? 0];
                    else if (type === 5) out = [start, end, op, 3, 4, num(p[4]), ENEMY_DATA[num(p[5])] ?? 0];
                    else if (type === 6) out = [start, end, op, 3, 5, num(p[4]), num(p[5])];
                    else if (type === 7) out = [start, end, op, 3, 7, num(p[4]), 0];
                    break;
                }
                case 236: out = [WEATHER[num(p[0])] || 'none', num(p[1]), num(p[2]), !!p[3]]; break;
                case 302: out = [num(p[0]), num(p[1]), 0, 0, !!p[2]]; break;
                case 605: out = [num(p[0]), num(p[1]), 0, 0]; break;
                case 311: case 312: case 313: case 314: case 315: case 316: case 318: out = [0].concat(p); break;
                case 317: out = [0, num(p[0]), PARAM[num(p[1])] ?? 0, num(p[2]), num(p[3]), num(p[4])]; break;
                case 339: {
                    // [battler type, index, kind, basic or skill, target]; basic 0 attack, 1 guard, 2 escape, 3 wait.
                    const skill = num(p[2]) === 1 ? num(p[3]) : [ids.attack || 1, ids.guard || 2, ids.escape || 0, 0][num(p[3])] || 0;
                    out = [num(p[0]), num(p[1]), skill, num(p[4], -1)];
                    break;
                }
                default: break;
            }
            return out === p ? c : Object.assign({}, c, { parameters: out });
        });
    }

    /** Apply aceCommands to every list in a map's events, in place. */
    function reshapeMap(map, ids) {
        const events = map && map.events instanceof Map ? Array.from(map.events.values()) : Object.values((map && map.events) || {});
        for (const e of events) for (const pg of list(e && e.pages)) pg.list = aceCommands(pg.list, ids);
        return map;
    }

    /** MZ flags (8192) from VX's System passages. */
    function tilesetFlags(passages) {
        const src = table1(passages);
        const flags = new Array(8192).fill(0);
        for (let id = 0; id < 8192; id++) {
            const v = src[id] || 0;
            let f = 0;
            if (v & 0x01) f |= 0x0f;
            if (v & 0x02) f |= 0x200;
            if (v & 0x04) f |= 0x400;
            if (v & 0x08) f |= 0x800;
            if (v & 0x10) f |= 0x10;
            if (v & 0x40) f |= 0x40;
            if (v & 0x80) f |= 0x80;
            flags[id] = f;
        }
        flags[0] = 0x10;
        return flags;
    }

    /**
     * Encounter areas as MZ regions: each area of the map gets a region id (in
     * area order), its rectangle painted on the region layer, and its troops
     * listed for that region. The map's own troops stay everywhere. VX map
     * encounters are troop ids.
     */
    function applyAreas(mzMap, vxMap, areas, notes) {
        const w = mzMap.width, h = mzMap.height;
        mzMap.encounterList = list(vxMap.encounter_list).map(e => (typeof e === 'number' ? { regionSet: [], troopId: e, weight: 10 } : { regionSet: [], troopId: num(e && e.troop_id, 1), weight: 10 }));
        let region = 0;
        for (const a of areas) {
            if (++region > 255) break;
            const r = a.rect || {};
            for (let y = Math.max(0, num(r.y)); y < Math.min(h, num(r.y) + num(r.height)); y++) {
                for (let x = Math.max(0, num(r.x)); x < Math.min(w, num(r.x) + num(r.width)); x++) mzMap.data[(5 * h + y) * w + x] = region;
            }
            for (const troop of list(a.encounter_list)) mzMap.encounterList.push({ regionSet: [region], troopId: num(troop), weight: 10 });
            tag(notes, 'encounterArea');
        }
        return mzMap;
    }

    // ---- database ------------------------------------------------------------------

    const ELEMENT_RATE = [1, 2, 1.5, 1, 0.5, 0, -1];
    const STATE_RATE = [1, 1, 0.8, 0.6, 0.4, 0.2, 0];
    const byId = (records, convert) => { const out = [null]; for (const r of list(records)) if (r && r.id) out[r.id] = convert(r); for (let i = 1; i < out.length; i++) if (out[i] === undefined) out[i] = null; return out; };
    const rankTraits = (elementRanks, stateRanks) => {
        const traits = [];
        table1(elementRanks).forEach((rank, id) => { if (id > 0 && rank && rank !== 3) traits.push({ code: 11, dataId: id, value: ELEMENT_RATE[rank] ?? 1 }); });
        table1(stateRanks).forEach((rank, id) => { if (id > 0 && rank && rank !== 1) traits.push({ code: 13, dataId: id, value: STATE_RATE[rank] ?? 1 }); });
        return traits;
    };
    const description = (d) => str(d).replace(/\|/g, '\n');
    /** VX scopes: 3 is one enemy twice (MZ repeats), 4–6 are 1–3 random enemies (MZ 3–5). */
    const SCOPE = { 0: 0, 1: 1, 2: 2, 3: 1, 4: 3, 5: 4, 6: 5, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11 };

    /**
     * VX's damage (Game_Battler#make_obj_damage_value) as an MZ formula:
     * base + ATK×4×atk_f% + SPI×2×spi_f%, less DEF×2×atk_f% + SPI×spi_f% of the
     * target unless it ignores defence, never below 0; a negative base heals by
     * the same factors. Spirit is M.Attack on the user and M.Defense on the target.
     */
    function damageFormula(r) {
        const base = num(r.base_damage), atkF = num(r.atk_f), spiF = num(r.spi_f);
        const plus = [atkF ? `a.atk * ${4 * atkF / 100}` : '', spiF ? `a.mat * ${2 * spiF / 100}` : ''].filter(Boolean);
        if (base > 0) {
            const minus = r.ignore_defense ? [] : [atkF ? `b.def * ${2 * atkF / 100}` : '', spiF ? `b.mdf * ${spiF / 100}` : ''].filter(Boolean);
            return `Math.max(0, ${[String(base)].concat(plus).join(' + ')}${minus.length ? ' - (' + minus.join(' + ') + ')' : ''})`;
        }
        return [String(-base)].concat(plus).join(' + ');
    }
    function damage(r) {
        const base = num(r.base_damage);
        if (!base) return { type: 0, elementId: 0, formula: '0', variance: 20, critical: false };
        const mp = !!r.damage_to_mp, drain = !!r.absorb_damage;
        const type = base < 0 ? (mp ? 4 : 3) : drain ? (mp ? 6 : 5) : (mp ? 2 : 1);
        return { type, elementId: list(r.element_set)[0] || 0, formula: damageFormula(r), variance: num(r.variance, 20), critical: false };
    }
    const stateEffects = (r) => list(r.plus_state_set).map(id => ({ code: 21, dataId: id, value1: 1, value2: 0 })).concat(list(r.minus_state_set).map(id => ({ code: 22, dataId: id, value1: 1, value2: 0 })));

    /**
     * VX classes equip weapons and armour by id; MZ by type. Each set of classes
     * that shares an item becomes a type of its own, named after the classes,
     * so exactly the same classes can equip exactly the same items.
     */
    function equipTypes(classes, items, key) {
        const groups = new Map();
        const typeOf = [];
        for (const it of list(items)) {
            if (!it) continue;
            const who = list(classes).filter(c => c && list(c[key]).includes(it.id)).map(c => c.id);
            const sig = who.join(',');
            if (!groups.has(sig)) groups.set(sig, { id: groups.size + 1, classes: who });
            typeOf[it.id] = groups.get(sig).id;
        }
        const names = [''];
        for (const g of groups.values()) names[g.id] = g.classes.length ? g.classes.map(id => str((classes[id] || {}).name) || `Class ${id}`).join(', ') : 'Unequippable';
        const forClass = (classId) => Array.from(groups.values()).filter(g => g.classes.includes(classId)).map(g => g.id);
        return { typeOf, names, forClass };
    }

    function database(vx, notes) {
        const skillsSrc = list(vx.skills);
        const lastSkill = skillsSrc.reduce((m, s) => Math.max(m, s ? s.id : 0), 0);
        const attackSkillId = lastSkill + 1, guardSkillId = lastSkill + 2, escapeSkillId = lastSkill + 3;
        const actorsSrc = list(vx.actors), classesSrc = list(vx.classes);
        const lastActor = actorsSrc.reduce((m, a) => Math.max(m, a ? a.id : 0), 0);
        const weaponTypes = equipTypes(classesSrc, vx.weapons, 'weapon_set');
        const armorTypes = equipTypes(classesSrc, vx.armors, 'armor_set');
        const POSITION_RATE = [4 / 3, 1, 2 / 3];   // front, middle, rear: VX targets 4:3:2

        const classTraits = (c) => {
            const traits = rankTraits(c && c.element_ranks, c && c.state_ranks);
            if (c) for (const t of weaponTypes.forClass(c.id)) traits.push({ code: 51, dataId: t, value: 1 });
            if (c) for (const t of armorTypes.forClass(c.id)) traits.push({ code: 52, dataId: t, value: 1 });
            // VX's base rates: hit 95% unarmed (a weapon sets its own), evasion 5%, critical 4%.
            traits.push({ code: 22, dataId: 0, value: 0.95 }, { code: 22, dataId: 1, value: 0.05 }, { code: 22, dataId: 2, value: 0.04 },
                { code: 23, dataId: 0, value: POSITION_RATE[num(c && c.position)] ?? 1 }, { code: 41, dataId: 1, value: 1 }, { code: 35, dataId: attackSkillId, value: 1 });
            if (c && c.skill_name_valid) tag(notes, 'classSkillName');
            return traits;
        };
        const learnings = (c) => list(c && c.learnings).map(l => ({ level: num(l.level, 1), note: '', skillId: num(l.skill_id) }));
        // VX's parameters Table is 6 × levels: maxhp, maxmp, atk, def, spi, agi. Spirit is both magic stats.
        const curves = (a) => {
            const t = a.parameters, params = [];
            const at = (p, lv) => (t ? t.data[p + Math.min(lv, t.ysize - 1) * t.xsize] : 1);
            for (const p of [0, 1, 2, 3, 4, 4, 5, null]) { const row = []; for (let lv = 0; lv <= 99; lv++) row.push(p === null ? 0 : at(p, lv)); params.push(row); }
            return params;
        };

        const actors = byId(actorsSrc, a => {
            const traits = [];
            if (a.two_swords_style) traits.push({ code: 55, dataId: 1, value: 1 });
            if (a.fix_equipment) for (let e = 1; e <= 5; e++) traits.push({ code: 53, dataId: e, value: 1 });
            if (a.auto_battle) traits.push({ code: 62, dataId: 0, value: 1 });
            if (a.super_guard) traits.push({ code: 62, dataId: 1, value: 1 });
            if (a.pharmacology) traits.push({ code: 23, dataId: 3, value: 2 });
            if (a.critical_bonus) traits.push({ code: 22, dataId: 2, value: 0.04 });
            return {
                id: a.id, battlerName: '', characterIndex: num(a.character_index), characterName: str(a.character_name), classId: a.id,
                equips: [num(a.weapon_id), num(a.armor1_id), num(a.armor2_id), num(a.armor3_id), num(a.armor4_id)], faceIndex: num(a.face_index), faceName: str(a.face_name),
                traits, initialLevel: num(a.initial_level, 1), maxLevel: 99, name: str(a.name), nickname: '', note: `<rrVxClass: ${num(a.class_id, 1)}>`, profile: ''
            };
        });
        // Each actor has a class of its own (its curves and EXP live on the actor in VX); VX's classes follow for Change Class.
        const classes = [null];
        for (const a of actorsSrc) {
            if (!a) continue;
            const c = classesSrc[num(a.class_id, 1)];
            // Game_Actor#make_exp_list (RGSS2): each level adds a basis that grows by (1 + n), n shrinking by 10%.
            const expTable = [0, 0];
            let m = num(a.exp_basis, 25), n = 0.75 + num(a.exp_inflation, 35) / 200;
            for (let lv = 2; lv <= 99; lv++) { expTable[lv] = expTable[lv - 1] + Math.trunc(m); m *= 1 + n; n *= 0.9; }
            expTable[100] = expTable[99];
            classes[a.id] = { id: a.id, expParams: [30, 20, 30, 30], expTable, traits: classTraits(c), learnings: learnings(c), name: str(c && c.name) || str(a.name), note: '', params: curves(a) };
        }
        for (const c of classesSrc) {
            if (!c) continue;
            classes[lastActor + c.id] = { id: lastActor + c.id, expParams: [30, 20, 30, 30], traits: classTraits(c), learnings: learnings(c), name: str(c.name), note: `<rrVxClass: ${c.id}>`, params: new Array(8).fill(0).map(() => new Array(100).fill(1)) };
        }
        for (let i = 1; i < classes.length; i++) if (classes[i] === undefined) classes[i] = null;

        const usable = (r) => {
            const effects = stateEffects(r);
            if (r.common_event_id) effects.push({ code: 44, dataId: r.common_event_id, value1: 0, value2: 0 });
            if (list(r.element_set).length > 1) tag(notes, 'multipleElements');
            return {
                animationId: num(r.animation_id), damage: damage(r), description: description(r.description), effects, hitType: r.physical_attack ? 1 : 2,
                iconIndex: num(r.icon_index), name: str(r.name), note: str(r.note), occasion: num(r.occasion), repeats: num(r.scope) === 3 ? 2 : 1,
                scope: SCOPE[num(r.scope)] ?? 0, speed: num(r.speed), successRate: num(r.hit, 100), tpGain: 0
            };
        };
        const skills = byId(skillsSrc, s => Object.assign(usable(s), {
            id: s.id, message1: str(s.message1), message2: str(s.message2), messageType: 1, mpCost: num(s.mp_cost), requiredWtypeId1: 0, requiredWtypeId2: 0, stypeId: 1, tpCost: 0
        }));
        const attack = { id: attackSkillId, animationId: -1, damage: { type: 1, elementId: -1, formula: 'a.atk * 4 - b.def * 2', variance: 20, critical: true }, description: '',
            effects: [{ code: 21, dataId: 0, value1: 1, value2: 0 }], hitType: 1, iconIndex: 0, message1: ' attacks!', message2: '', messageType: 1, mpCost: 0, name: 'Attack', note: '',
            occasion: 1, repeats: 1, requiredWtypeId1: 0, requiredWtypeId2: 0, scope: 1, speed: 0, stypeId: 0, successRate: 100, tpCost: 0, tpGain: 0 };
        skills[attackSkillId] = attack;
        skills[guardSkillId] = Object.assign({}, attack, { id: guardSkillId, animationId: 0, damage: { type: 0, elementId: 0, formula: '0', variance: 20, critical: false },
            effects: [{ code: 21, dataId: 2, value1: 1, value2: 0 }], hitType: 0, message1: ' guards.', name: 'Guard', scope: 11, speed: 2000 });
        skills[escapeSkillId] = Object.assign({}, attack, { id: escapeSkillId, animationId: 0, damage: { type: 0, elementId: 0, formula: '0', variance: 20, critical: false },
            effects: [{ code: 41, dataId: 0, value1: 0, value2: 0 }], hitType: 0, message1: ' fled.', name: 'Escape', scope: 11 });

        const items = byId(vx.items, it => {
            const u = usable(it);
            if (it.hp_recovery_rate || it.hp_recovery) u.effects.unshift({ code: 11, dataId: 0, value1: num(it.hp_recovery_rate) / 100, value2: num(it.hp_recovery) });
            if (it.mp_recovery_rate || it.mp_recovery) u.effects.unshift({ code: 12, dataId: 0, value1: num(it.mp_recovery_rate) / 100, value2: num(it.mp_recovery) });
            if (it.parameter_type && it.parameter_points) u.effects.push({ code: 42, dataId: [0, 0, 1, 2, 3, 4, 6][num(it.parameter_type)] ?? 0, value1: num(it.parameter_points), value2: 0 });
            return Object.assign(u, { id: it.id, consumable: it.consumable !== false, itypeId: 1, price: num(it.price) });
        });
        const weapons = byId(vx.weapons, w => {
            const traits = list(w.element_set).map(id => ({ code: 31, dataId: id, value: 0 })).concat(list(w.state_set).map(id => ({ code: 32, dataId: id, value: 0.5 })));
            traits.push({ code: 22, dataId: 0, value: (num(w.hit, 95) - 95) / 100 });
            if (w.critical_bonus) traits.push({ code: 22, dataId: 2, value: 0.04 });
            if (w.fast_attack) traits.push({ code: 33, dataId: 0, value: 2000 });
            if (w.dual_attack) traits.push({ code: 34, dataId: 0, value: 1 });
            if (w.two_handed) { traits.push({ code: 54, dataId: 2, value: 1 }); tag(notes, 'twoHanded'); }
            return { id: w.id, animationId: num(w.animation_id), description: description(w.description), etypeId: 1, traits, iconIndex: num(w.icon_index), name: str(w.name), note: str(w.note),
                params: [0, 0, num(w.atk), num(w.def), num(w.spi), num(w.spi), num(w.agi), 0], price: num(w.price), wtypeId: weaponTypes.typeOf[w.id] || 0 };
        });
        const armors = byId(vx.armors, a => {
            const traits = list(a.element_set).map(id => ({ code: 11, dataId: id, value: 0.5 })).concat(list(a.state_set).map(id => ({ code: 14, dataId: id, value: 1 })));
            if (a.eva) traits.push({ code: 22, dataId: 1, value: num(a.eva) / 100 });
            if (a.prevent_critical) traits.push({ code: 22, dataId: 3, value: 1 });
            if (a.half_mp_cost) traits.push({ code: 23, dataId: 4, value: 0.5 });
            if (a.double_exp_gain) traits.push({ code: 23, dataId: 9, value: 2 });
            if (a.auto_hp_recover) traits.push({ code: 22, dataId: 7, value: 0.05 });
            return { id: a.id, atypeId: armorTypes.typeOf[a.id] || 0, description: description(a.description), etypeId: [2, 3, 4, 5][num(a.kind)] ?? 5, traits, iconIndex: num(a.icon_index),
                name: str(a.name), note: str(a.note), params: [0, 0, num(a.atk), num(a.def), num(a.spi), num(a.spi), num(a.agi), 0], price: num(a.price) };
        });
        const enemies = byId(vx.enemies, e => {
            const traits = rankTraits(e.element_ranks, e.state_ranks);
            traits.push({ code: 22, dataId: 0, value: num(e.hit, 95) / 100 }, { code: 22, dataId: 1, value: num(e.eva) / 100 }, { code: 22, dataId: 2, value: e.has_critical ? 0.1 : 0 },
                { code: 31, dataId: 1, value: 0 }, { code: 35, dataId: attackSkillId, value: 1 });
            const drop = (d) => (d && d.kind ? { kind: num(d.kind), dataId: [0, num(d.item_id), num(d.weapon_id), num(d.armor_id)][num(d.kind)] || 1, denominator: Math.max(1, num(d.denominator, 1)) } : { kind: 0, dataId: 1, denominator: 1 });
            return {
                id: e.id, battlerHue: num(e.battler_hue), battlerName: str(e.battler_name), dropItems: [drop(e.drop_item1), drop(e.drop_item2), { kind: 0, dataId: 1, denominator: 1 }],
                exp: num(e.exp), traits, gold: num(e.gold), name: str(e.name), note: str(e.note), params: [num(e.maxhp, 1), num(e.maxmp), num(e.atk), num(e.def), num(e.spi), num(e.spi), num(e.agi), 0],
                // Condition types match MZ's; HP and MP ranges are percentages in VX.
                actions: list(e.actions).filter(a => !(num(a.kind) === 0 && num(a.basic) === 3)).map(a => {
                    const type = num(a.condition_type);
                    const rate = type === 2 || type === 3;
                    return { conditionParam1: rate ? num(a.condition_param1) / 100 : num(a.condition_param1), conditionParam2: rate ? num(a.condition_param2) / 100 : num(a.condition_param2),
                        conditionType: type, rating: num(a.rating, 5), skillId: num(a.kind) === 1 ? num(a.skill_id, 1) : [attackSkillId, guardSkillId, escapeSkillId][num(a.basic)] || attackSkillId };
                })
            };
        });
        const states = byId(vx.states, st => {
            const traits = [];
            const rate = (field, ids) => { const v = num(st[field], 100); if (v !== 100) for (const id of ids) traits.push({ code: 21, dataId: id, value: v / 100 }); };
            rate('atk_rate', [2]); rate('def_rate', [3]); rate('spi_rate', [4, 5]); rate('agi_rate', [6]);
            if (st.slip_damage) traits.push({ code: 22, dataId: 7, value: -0.1 });
            if (st.reduce_hit_ratio) traits.push({ code: 22, dataId: 0, value: -0.5 });
            for (const id of list(st.element_set)) traits.push({ code: 11, dataId: id, value: 0.5 });
            for (const id of list(st.state_set)) traits.push({ code: 14, dataId: id, value: 1 });
            // Restrictions: 1 silent (skills sealed), 2 berserk (attacks enemies), 3 confused (attacks anyone), 4 can't move, 5 can't move or parry.
            const r = num(st.restriction);
            if (r === 1) traits.push({ code: 42, dataId: 1, value: 1 });
            if (r === 5) traits.push({ code: 22, dataId: 1, value: -1 });
            const hold = num(st.hold_turn), prob = num(st.auto_release_prob);
            // After hold_turn turns VX releases with auto_release_prob% a turn: expected turns = hold + 100/prob.
            const maxTurns = hold && prob ? hold + Math.max(0, Math.round(100 / prob) - 1) : hold;
            return {
                id: st.id, autoRemovalTiming: hold && prob ? 2 : 0, chanceByDamage: 100, iconIndex: num(st.icon_index), maxTurns: Math.max(1, maxTurns), minTurns: Math.max(1, hold),
                message1: str(st.message1), message2: str(st.message2), message3: str(st.message3), message4: str(st.message4), messageType: 1, motion: 0, name: str(st.name), note: str(st.note), overlay: 0,
                priority: num(st.priority, 5) * 10, releaseByDamage: !!st.release_by_damage, removeAtBattleEnd: !!st.battle_only, removeByDamage: !!st.release_by_damage,
                removeByRestriction: false, removeByWalking: false, restriction: [0, 0, 1, 2, 4, 4][r] ?? 0, stepsToRemove: 100, traits
            };
        });
        return { actors, classes, skills, items, weapons, armors, enemies, states, attackSkillId, guardSkillId, escapeSkillId,
            weaponTypes: weaponTypes.names, armorTypes: armorTypes.names };
    }

    /** VX's sounds (20) in MZ's order (24). */
    const SOUND_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 21, 22, 23];

    /**
     * System.json from VX's RPG::System on MZ's `base`. VX's frame: 544×416,
     * 32 px tiles, 24 px icons, 96 px faces, 24 px lines, 16 px window padding,
     * a 20 px font (UmePlus Gothic).
     */
    function system(base, s, db, notes) {
        const out = JSON.parse(JSON.stringify(base));
        const t = s.terms || {};
        const vehicle = (v, d) => (v ? { bgm: audio(v.bgm), characterIndex: num(v.character_index), characterName: str(v.character_name), startMapId: num(v.start_map_id), startX: num(v.start_x), startY: num(v.start_y) } : d);
        Object.assign(out, {
            gameTitle: str(s.game_title), versionId: num(s.version_id, out.versionId), partyMembers: list(s.party_members).map(x => num(x)).filter(Boolean),
            currencyUnit: str(t.gold).trim() || out.currencyUnit,
            elements: list(s.elements).map(str), skillTypes: ['', str(t.skill) || 'Skill'], weaponTypes: db.weaponTypes, armorTypes: db.armorTypes,
            equipTypes: ['', str(t.weapon) || 'Weapon', str(t.armor1) || 'Shield', str(t.armor2) || 'Helmet', str(t.armor3) || 'Body', str(t.armor4) || 'Accessory'],
            switches: list(s.switches).map(x => str(x)), variables: list(s.variables).map(x => str(x)),
            boat: vehicle(s.boat, out.boat), ship: vehicle(s.ship, out.ship), airship: vehicle(s.airship, out.airship),
            title1Name: 'Title', title2Name: '', optDrawTitle: false, optFollowers: false, optDisplayTp: false, optSideView: false,
            titleBgm: audio(s.title_bgm), battleBgm: audio(s.battle_bgm), victoryMe: audio(s.battle_end_me), gameoverMe: audio(s.gameover_me), defeatMe: audio(s.gameover_me),
            testBattlers: list(s.test_battlers).map(b => ({ actorId: num(b.actor_id, 1), equips: [num(b.weapon_id), num(b.armor1_id), num(b.armor2_id), num(b.armor3_id), num(b.armor4_id)], level: num(b.level, 1) })),
            testTroopId: num(s.test_troop_id, 1), startMapId: num(s.start_map_id, 1), startX: num(s.start_x), startY: num(s.start_y), editMapId: num(s.edit_map_id, num(s.start_map_id, 1)),
            battlerName: str(s.battler_name), battlerHue: num(s.battler_hue), battleback1Name: '', battleback2Name: '', windowTone: [0, 0, 0, 0]
        });
        const sounds = out.sounds.map(a => Object.assign({}, a, { name: '' }));
        list(s.sounds).forEach((snd, i) => { if (SOUND_SLOTS[i] !== undefined) sounds[SOUND_SLOTS[i]] = audio(snd); });
        out.sounds = sounds;
        const set = (arr, i, v) => { if (typeof v === 'string' && v.trim()) arr[i] = v.trim(); };
        const terms = out.terms;
        set(terms.basic, 0, t.level); set(terms.basic, 1, t.level_a); set(terms.basic, 2, t.hp); set(terms.basic, 3, t.hp_a); set(terms.basic, 4, t.mp); set(terms.basic, 5, t.mp_a);
        set(terms.params, 0, t.hp); set(terms.params, 1, t.mp); set(terms.params, 2, t.atk); set(terms.params, 3, t.def); set(terms.params, 4, t.spi); set(terms.params, 5, t.spi); set(terms.params, 6, t.agi);
        for (const [i, k] of [[0, 'fight'], [1, 'escape'], [2, 'attack'], [3, 'guard'], [4, 'item'], [5, 'skill'], [6, 'equip'], [7, 'status'], [9, 'save'], [10, 'game_end'], [12, 'weapon'], [13, 'armor3'], [15, 'equip'], [18, 'new_game'], [19, 'continue'], [21, 'to_title'], [22, 'cancel']]) set(terms.commands, i, t[k]);
        out.tileSize = 32; out.iconSize = 24; out.faceSize = 96;
        Object.assign(out.advanced, { screenWidth: 544, screenHeight: 416, uiAreaWidth: 544, uiAreaHeight: 416, fontSize: 20, lineHeight: 24, windowPadding: 16, windowMargin: 0, textOutlineWidth: 0, windowOpacity: 200 });
        out.rrGuardSkillId = db.guardSkillId;
        out.rrTitleShutdown = (typeof t.shutdown === 'string' && t.shutdown.trim()) || 'Shutdown';   // VX's title ends with it
        out.rrBalloonSize = 32;
        out.locale = 'en_US';
        tag(notes, 'vxSystem', 0);
        return out;
    }

    /**
     * A per-map battleback table from the game's scripts: `BATTLEBACK_LIST =
     * { 3 => "Grassland", … }`, its folder (`BATTLEBACK_DIR = "Graphics/Pictures/"`,
     * as the project's img folder) and the battle-test one.
     */
    function battlebackTable(scriptText) {
        const out = { maps: {}, dir: null, test: null };
        const list = /BATTLEBACK_LIST\s*=\s*\{([^}]*)\}/.exec(scriptText || '');
        if (!list) return out;
        for (const m of list[1].matchAll(/(\d+)\s*=>\s*"([^"]+)"/g)) out.maps[Number(m[1])] = m[2];
        const dir = /BATTLEBACK_DIR\s*=\s*"Graphics\/([^"]+?)\/?"/.exec(scriptText);
        const FOLDERS = { pictures: 'img/pictures', parallaxes: 'img/parallaxes', system: 'img/system', battlebacks: 'img/battlebacks' };
        out.dir = dir ? (FOLDERS[dir[1].toLowerCase()] || 'img/' + dir[1]) : 'img/pictures';
        const test = /BATTLEBACK_TEST\s*=\s*"([^"]+)"/.exec(scriptText);
        if (test) out.test = test[1];
        return out;
    }

    const api = { battlebackTable, aceCommands, reshapeMap, tilesetFlags, applyAreas, database, system, damageFormula, equipTypes, BUTTON, ACTOR_DATA, ENEMY_DATA, SOUND_SLOTS };
    root.RRVxConvert = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
