/**
 * XpDatabase - RPG Maker XP (RGSS1) database records into RPG Maker MZ's.
 * Pure: RubyMarshal objects in, MZ JSON records out, with a `notes` tally.
 *
 * Stats. XP characters have max HP/SP, STR, DEX, AGI and INT, plus attack,
 * physical and magic defence and evasion from equipment. MZ has eight
 * parameters; they carry XP's as mhp ← max HP, mmp ← max SP, atk ← STR,
 * def ← PDEF, mat ← INT, mdf ← MDEF, agi ← AGI, luk ← DEX. XP's attack power
 * (a weapon's, or an enemy's own) has no MZ parameter, so it rides in a
 * <rrXpAtk: n> note that the XP battle plugin (RR_XpBattle) reads, together
 * with XP's damage, hit and evasion rules, so battles keep the arithmetic they
 * were balanced for. Evasion is MZ's EVA ex-parameter.
 *
 * Classes. XP keeps stat curves on the actor and equipment, skills and
 * element/state ranks on the class. Each actor gets an MZ class of its own
 * (id = actor id) with its curves and its XP class's traits and skills;
 * XP's classes follow, shifted past the actors, for Change Class.
 *
 * Skills keep their XP ids, so event commands and scripts that name a skill
 * by id stay right. MZ's Attack and Guard are appended after them: every class
 * and enemy carries an Attack Skill trait naming the appended Attack, and
 * System.json's rrGuardSkillId names the appended Guard.
 */
(function (root) {
    'use strict';

    const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const str = (v) => (typeof v === 'string' ? v : '');
    const list = (v) => (Array.isArray(v) ? v : []);
    const audio = (a) => (a ? { name: str(a.name), volume: num(a.volume, 100), pitch: num(a.pitch, 100), pan: 0 } : { name: '', volume: 100, pitch: 100, pan: 0 });
    const tag = (notes, key, n = 1) => { if (notes) notes[key] = (notes[key] || 0) + n; };
    const table1 = (t) => (t && t.data ? Array.from(t.data) : []);

    /** XP element ranks A–F as damage rates, state ranks A–F as chances. */
    const ELEMENT_RATE = [1, 2, 1.5, 1, 0.5, 0, -1];
    const STATE_RATE = [1, 1, 0.8, 0.6, 0.4, 0.2, 0];
    /** XP scope → MZ scope. */
    const SCOPE = { 0: 0, 1: 1, 2: 2, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11 };
    /** XP parameter numbers (1 max HP … 6 INT) → MZ param ids. */
    const PARAM = { 1: 0, 2: 1, 3: 2, 4: 7, 5: 6, 6: 4 };

    const byId = (records, convert) => { const out = [null]; for (const r of list(records)) if (r && r.id) out[r.id] = convert(r); for (let i = 1; i < out.length; i++) if (out[i] === undefined) out[i] = null; return out; };

    function rankTraits(elementRanks, stateRanks) {
        const traits = [];
        table1(elementRanks).forEach((rank, id) => { if (id > 0 && rank && rank !== 3) traits.push({ code: 11, dataId: id, value: ELEMENT_RATE[rank] ?? 1 }); });
        table1(stateRanks).forEach((rank, id) => { if (id > 0 && rank && rank !== 1) traits.push({ code: 13, dataId: id, value: STATE_RATE[rank] ?? 1 }); });
        return traits;
    }

    /**
     * The whole database. `icons` maps an XP icon file name to its index in the
     * IconSet the importer builds (0 when unknown).
     */
    function database(xp, notes, icons = () => 0) {
        const skillsSrc = list(xp.skills);
        const lastSkill = skillsSrc.reduce((m, s) => Math.max(m, s ? s.id : 0), 0);
        const attackSkillId = lastSkill + 1, guardSkillId = lastSkill + 2;
        const actorsSrc = list(xp.actors), classesSrc = list(xp.classes);
        const lastActor = actorsSrc.reduce((m, a) => Math.max(m, a ? a.id : 0), 0);
        const classOffset = lastActor;   // XP class n is MZ class lastActor + n

        const classTraits = (c) => {
            const traits = rankTraits(c && c.element_ranks, c && c.state_ranks);
            for (const w of list(c && c.weapon_set)) traits.push({ code: 51, dataId: w, value: 1 });
            for (const a of list(c && c.armor_set)) traits.push({ code: 52, dataId: a, value: 1 });
            traits.push({ code: 23, dataId: 0, value: 1 }, { code: 22, dataId: 0, value: 0.95 }, { code: 22, dataId: 1, value: 0 }, { code: 35, dataId: attackSkillId, value: 1 });
            return traits;
        };
        const learnings = (c) => list(c && c.learnings).map(l => ({ level: num(l.level, 1), note: '', skillId: num(l.skill_id) }));

        // Stat curves: XP's parameters Table is 6 × levels (0..final level).
        const curves = (a) => {
            const t = a.parameters, params = [];
            const at = (p, lv) => (t ? t.data[p + Math.min(lv, t.ysize - 1) * t.xsize] : 1);
            const order = [[0], [1], [2], [null], [5], [null], [4], [3]];   // mhp mmp atk(STR) def mat(INT) mdf agi luk(DEX)
            for (const [p] of order) { const row = []; for (let lv = 0; lv <= 99; lv++) row.push(p === null ? 0 : at(p, lv)); params.push(row); }
            return params;
        };

        const actors = byId(actorsSrc, a => ({
            id: a.id, battlerName: str(a.battler_name), characterIndex: 0, characterName: a.character_name ? `$${a.character_name}[f4]` : '', classId: a.id,
            equips: [num(a.weapon_id), num(a.armor1_id), num(a.armor2_id), num(a.armor3_id), num(a.armor4_id)], faceIndex: 0, faceName: '',
            traits: [a.weapon_fix && { code: 53, dataId: 1, value: 1 }, a.armor1_fix && { code: 53, dataId: 2, value: 1 }, a.armor2_fix && { code: 53, dataId: 3, value: 1 },
                a.armor3_fix && { code: 53, dataId: 4, value: 1 }, a.armor4_fix && { code: 53, dataId: 5, value: 1 }].filter(Boolean),
            initialLevel: num(a.initial_level, 1), maxLevel: num(a.final_level, 99), name: str(a.name), nickname: '', note: `<rrXpClass: ${num(a.class_id, 1)}>`, profile: ''
        }));
        const classes = [null];
        for (const a of actorsSrc) {
            if (!a) continue;
            const c = classesSrc[num(a.class_id, 1)];
            // XP's EXP curve: basis and inflation (RGSS1 Game_Actor#make_exp_list), as an explicit table.
            const expTable = [0, 0];
            const pow = 2.4 + num(a.exp_inflation, 30) / 100;
            for (let lv = 2; lv <= 100; lv++) {
                const n = num(a.exp_basis, 30) * Math.pow(lv + 3, pow) / Math.pow(5, pow);
                expTable[lv] = expTable[lv - 1] + Math.trunc(n);
            }
            classes[a.id] = { id: a.id, expParams: [30, 20, 30, 30], expTable, traits: classTraits(c), learnings: learnings(c), name: str(c && c.name) || str(a.name), note: '', params: curves(a) };
        }
        for (const c of classesSrc) {
            if (!c) continue;
            classes[classOffset + c.id] = { id: classOffset + c.id, expParams: [30, 20, 30, 30], traits: classTraits(c), learnings: learnings(c), name: str(c.name), note: `<rrXpClass: ${c.id}>`, params: new Array(8).fill(0).map(() => new Array(100).fill(1)) };
        }
        for (let i = 1; i < classes.length; i++) if (classes[i] === undefined) classes[i] = null;

        // XP skill damage: RR_XpBattle evaluates RGSS1's formula from these numbers.
        const xpFormula = (s, kind) => `a.rrXp${kind} ? a.rrXp${kind}(b, ${JSON.stringify([num(s.power), num(s.atk_f), num(s.str_f), num(s.dex_f), num(s.agi_f), num(s.int_f), num(s.pdef_f), num(s.mdef_f), num(s.eva_f), num(s.recover_hp_rate), num(s.recover_hp)])}) : 0`;
        const stateEffects = (r) => list(r.plus_state_set).map(id => ({ code: 21, dataId: id, value1: 1, value2: 0 })).concat(list(r.minus_state_set).map(id => ({ code: 22, dataId: id, value1: 1, value2: 0 })));
        const elementOf = (r) => { const set = list(r.element_set); if (set.length > 1) tag(notes, 'multipleElements'); return set.length ? set[0] : 0; };

        const skills = byId(skillsSrc, s => {
            const power = num(s.power);
            const effects = stateEffects(s);
            if (s.common_event_id) effects.push({ code: 44, dataId: s.common_event_id, value1: 0, value2: 0 });
            return {
                id: s.id, animationId: num(s.animation2_id), damage: { type: power === 0 ? 0 : power < 0 ? 3 : 1, elementId: elementOf(s), formula: power === 0 ? '0' : xpFormula(s, 'Skill'), variance: num(s.variance, 15), critical: false },
                description: str(s.description).replace(/\\n/g, '\n'), effects, hitType: num(s.atk_f) > 0 ? 1 : 2, iconIndex: icons(s.icon_name), message1: '', message2: '', messageType: 1,
                mpCost: num(s.sp_cost), name: str(s.name), note: '', occasion: num(s.occasion), repeats: 1, requiredWtypeId1: 0, requiredWtypeId2: 0, scope: SCOPE[num(s.scope)] ?? 0,
                speed: 0, stypeId: 1, successRate: num(s.hit, 100), tpCost: 0, tpGain: 0
            };
        });
        const attack = { id: attackSkillId, animationId: -1, damage: { type: 1, elementId: -1, formula: 'a.rrXpAttack ? a.rrXpAttack(b) : a.atk * 4 - b.def * 2', variance: 15, critical: true },
            description: '', effects: [{ code: 21, dataId: 0, value1: 1, value2: 0 }], hitType: 1, iconIndex: 0, message1: ' attacks!', message2: '', messageType: 1, mpCost: 0, name: 'Attack', note: '',
            occasion: 1, repeats: 1, requiredWtypeId1: 0, requiredWtypeId2: 0, scope: 1, speed: 0, stypeId: 0, successRate: 100, tpCost: 0, tpGain: 0 };
        const guard = Object.assign({}, attack, { id: guardSkillId, animationId: 0, damage: { type: 0, elementId: 0, formula: '0', variance: 20, critical: false }, effects: [{ code: 21, dataId: 2, value1: 1, value2: 0 }],
            hitType: 0, message1: ' guards.', name: 'Guard', scope: 11, speed: 2000 });
        skills[attackSkillId] = attack;
        skills[guardSkillId] = guard;

        const items = byId(xp.items, it => {
            const effects = [];
            if (it.recover_hp_rate || it.recover_hp) effects.push({ code: 11, dataId: 0, value1: num(it.recover_hp_rate) / 100, value2: num(it.recover_hp) });
            if (it.recover_sp_rate || it.recover_sp) effects.push({ code: 12, dataId: 0, value1: num(it.recover_sp_rate) / 100, value2: num(it.recover_sp) });
            if (it.parameter_type && it.parameter_points) effects.push({ code: 42, dataId: PARAM[it.parameter_type] ?? 0, value1: num(it.parameter_points), value2: 0 });
            effects.push(...stateEffects(it));
            if (it.common_event_id) effects.push({ code: 44, dataId: it.common_event_id, value1: 0, value2: 0 });
            return {
                id: it.id, animationId: num(it.animation2_id), consumable: it.consumable !== false, damage: { type: 0, elementId: 0, formula: '0', variance: 20, critical: false },
                description: str(it.description).replace(/\\n/g, '\n'), effects, hitType: 0, iconIndex: icons(it.icon_name), itypeId: 1, name: str(it.name), note: '', occasion: num(it.occasion),
                price: num(it.price), repeats: 1, scope: SCOPE[num(it.scope)] ?? 0, speed: 0, successRate: num(it.hit, 100), tpGain: 0
            };
        });
        const equipParams = (e) => [0, 0, num(e.str_plus), num(e.pdef), num(e.int_plus), num(e.mdef), num(e.agi_plus), num(e.dex_plus)];
        const weapons = byId(xp.weapons, w => ({
            id: w.id, animationId: num(w.animation2_id), description: str(w.description).replace(/\\n/g, '\n'), etypeId: 1,
            traits: list(w.element_set).map(id => ({ code: 31, dataId: id, value: 0 })).concat(list(w.plus_state_set).map(id => ({ code: 32, dataId: id, value: 1 }))),
            iconIndex: icons(w.icon_name), name: str(w.name), note: `<rrXpAtk: ${num(w.atk)}>`, params: equipParams(w), price: num(w.price), wtypeId: 1
        }));
        const armors = byId(xp.armors, a => {
            const traits = list(a.guard_element_set).map(id => ({ code: 11, dataId: id, value: 0.5 })).concat(list(a.guard_state_set).map(id => ({ code: 14, dataId: id, value: 1 })));
            if (a.eva) traits.push({ code: 22, dataId: 1, value: num(a.eva) / 100 });
            if (a.auto_state_id) tag(notes, 'armorAutoState');
            return { id: a.id, atypeId: 1, description: str(a.description).replace(/\\n/g, '\n'), etypeId: [2, 3, 4, 5][num(a.kind)] ?? 4, traits, iconIndex: icons(a.icon_name), name: str(a.name),
                note: a.auto_state_id ? `<rrXpAutoState: ${a.auto_state_id}>` : '', params: equipParams(a), price: num(a.price) };
        });
        const enemies = byId(xp.enemies, e => {
            const traits = rankTraits(e.element_ranks, e.state_ranks);
            traits.push({ code: 22, dataId: 0, value: 0.95 }, { code: 22, dataId: 1, value: num(e.eva) / 100 }, { code: 31, dataId: 1, value: 0 }, { code: 35, dataId: attackSkillId, value: 1 });
            const dropItems = [];
            if (e.item_id) dropItems.push({ kind: 1, dataId: e.item_id, denominator: Math.max(1, Math.round(100 / Math.max(1, num(e.treasure_prob, 100)))) });
            else if (e.weapon_id) dropItems.push({ kind: 2, dataId: e.weapon_id, denominator: Math.max(1, Math.round(100 / Math.max(1, num(e.treasure_prob, 100)))) });
            else if (e.armor_id) dropItems.push({ kind: 3, dataId: e.armor_id, denominator: Math.max(1, Math.round(100 / Math.max(1, num(e.treasure_prob, 100)))) });
            while (dropItems.length < 3) dropItems.push({ kind: 0, dataId: 1, denominator: 1 });
            return {
                id: e.id, actions: list(e.actions).map(a => {
                    const basic = [attackSkillId, guardSkillId, 0, 0][num(a.basic)];
                    const skillId = num(a.kind) === 1 ? num(a.skill_id) : basic || guardSkillId;
                    // XP conditions: turn (a + b·x), HP ≤ %, party level ≥, switch. MZ keeps one; the first that is set wins.
                    let conditionType = 0, conditionParam1 = 0, conditionParam2 = 0;
                    if (a.condition_turn_a || a.condition_turn_b) { conditionType = 1; conditionParam1 = num(a.condition_turn_a); conditionParam2 = num(a.condition_turn_b); }
                    else if (num(a.condition_hp, 100) < 100) { conditionType = 2; conditionParam1 = 0; conditionParam2 = num(a.condition_hp) / 100; }
                    else if (a.condition_level > 1) { conditionType = 5; conditionParam1 = num(a.condition_level); }
                    else if (a.condition_switch_id) { conditionType = 6; conditionParam1 = num(a.condition_switch_id); }
                    return { conditionParam1, conditionParam2, conditionType, rating: num(a.rating, 5), skillId };
                }),
                battlerHue: num(e.battler_hue), battlerName: str(e.battler_name), dropItems, exp: num(e.exp), traits, gold: num(e.gold), name: str(e.name),
                note: `<rrXpAtk: ${num(e.atk)}>`, params: [num(e.maxhp, 1), num(e.maxsp), num(e.str), num(e.pdef), num(e.int), num(e.mdef), num(e.agi), num(e.dex)]
            };
        });
        const states = byId(xp.states, st => {
            const traits = [];
            const rate = (field, id) => { const v = num(st[field], 100); if (v !== 100) traits.push({ code: 21, dataId: id, value: v / 100 }); };
            rate('maxhp_rate', 0); rate('maxsp_rate', 1); rate('str_rate', 2); rate('pdef_rate', 3); rate('int_rate', 4); rate('mdef_rate', 5); rate('agi_rate', 6); rate('dex_rate', 7);
            if (num(st.hit_rate, 100) !== 100) traits.push({ code: 22, dataId: 0, value: (num(st.hit_rate) - 100) / 100 });
            if (st.eva) traits.push({ code: 22, dataId: 1, value: num(st.eva) / 100 });
            if (st.slip_damage) traits.push({ code: 22, dataId: 7, value: -0.1 });
            if (st.cant_evade) traits.push({ code: 22, dataId: 1, value: -1 });
            for (const id of list(st.guard_element_set)) traits.push({ code: 11, dataId: id, value: 0.5 });
            if (st.atk_rate && st.atk_rate !== 100) tag(notes, 'stateAtkRate');
            return {
                id: st.id, autoRemovalTiming: num(st.hold_turn) > 0 ? 2 : 0, chanceByDamage: num(st.shock_release_prob), iconIndex: 0, maxTurns: num(st.hold_turn), message1: '', message2: '', message3: '', message4: '',
                minTurns: num(st.hold_turn), motion: 0, name: str(st.name), note: '', overlay: 0, priority: num(st.rating, 5) * 10, releaseByDamage: num(st.shock_release_prob) > 0,
                removeAtBattleEnd: !!st.battle_only, removeByDamage: num(st.shock_release_prob) > 0, removeByRestriction: false, removeByWalking: false,
                restriction: [0, 4, 3, 2, 4][num(st.restriction)] ?? 0, stepsToRemove: 100, traits, messageType: 1
            };
        });
        const animations = byId(xp.animations, a => ({
            id: a.id, name: str(a.name), animation1Name: str(a.animation_name), animation1Hue: num(a.animation_hue), animation2Name: '', animation2Hue: 0, position: num(a.position, 1),
            frames: list(a.frames).slice(0, Math.max(1, num(a.frame_max, list(a.frames).length))).map(f => {
                const t = f && f.cell_data, cells = [];
                if (t) for (let i = 0; i < t.xsize; i++) { const cell = []; for (let k = 0; k < 8; k++) cell.push(t.data[i + k * t.xsize]); if (cell[0] >= 0) cells.push(cell); }
                return cells;
            }),
            timings: list(a.timings).map(t => ({ flashColor: t.flash_color ? [t.flash_color.red, t.flash_color.green, t.flash_color.blue, t.flash_color.alpha].map(Math.round) : [255, 255, 255, 255],
                flashDuration: num(t.flash_duration, 5), flashScope: num(t.flash_scope), frame: num(t.frame), se: t.se ? audio(t.se) : null }))
        }));
        return { actors, classes, skills, items, weapons, armors, enemies, states, animations, attackSkillId, guardSkillId, classOffset };
    }

    /** XP's System words → MZ terms (the rest stays MZ's). */
    function terms(base, words) {
        const t = JSON.parse(JSON.stringify(base));
        const w = words || {};
        const set = (arr, i, v) => { if (typeof v === 'string' && v) arr[i] = v; };
        set(t.basic, 2, w.hp); set(t.basic, 3, w.hp); set(t.basic, 4, w.sp); set(t.basic, 5, w.sp);
        set(t.params, 0, w.hp); set(t.params, 1, w.sp); set(t.params, 2, w.str); set(t.params, 3, w.pdef); set(t.params, 4, w.int); set(t.params, 5, w.mdef); set(t.params, 6, w.agi); set(t.params, 7, w.dex);
        set(t.commands, 2, w.attack); set(t.commands, 3, w.guard); set(t.commands, 4, w.item); set(t.commands, 5, w.skill); set(t.commands, 6, w.equip); set(t.commands, 12, w.weapon);
        return t;
    }

    /**
     * System.json from XP's RPG::System on MZ's own `base`. XP's frame: a
     * 640×480 screen, 32 px tiles and lines, 16 px window padding, 24 px icons.
     * The title comes from Game.ini (XP keeps it there).
     */
    function system(base, s, title, notes) {
        const out = JSON.parse(JSON.stringify(base));
        const w = s.words || {};
        const snd = (k) => audio(s[k]);
        Object.assign(out, {
            gameTitle: title || '', partyMembers: list(s.party_members).map(x => num(x)).filter(Boolean),
            elements: list(s.elements).map(str), switches: list(s.switches).map(x => str(x)), variables: list(s.variables).map(x => str(x)),
            skillTypes: ['', w.skill || 'Skill'], weaponTypes: ['', w.weapon || 'Weapon'], armorTypes: ['', w.armor1 || 'Shield', w.armor2 || 'Helmet', w.armor3 || 'Body Armor', w.armor4 || 'Accessory'],
            equipTypes: ['', w.weapon || 'Weapon', w.armor1 || 'Shield', w.armor2 || 'Helmet', w.armor3 || 'Body Armor', w.armor4 || 'Accessory'],
            currencyUnit: str(w.gold) || out.currencyUnit,
            title1Name: str(s.title_name), title2Name: '', optDrawTitle: false, optFollowers: false, optDisplayTp: false, optSideView: false,
            titleBgm: audio(s.title_bgm), battleBgm: audio(s.battle_bgm), victoryMe: audio(s.battle_end_me), gameoverMe: audio(s.gameover_me), defeatMe: audio(s.gameover_me),
            startMapId: num(s.start_map_id, 1), startX: num(s.start_x), startY: num(s.start_y), editMapId: num(s.edit_map_id, num(s.start_map_id, 1)),
            battleback1Name: str(s.battleback_name), battleback2Name: '', battlerName: str(s.battler_name), battlerHue: num(s.battler_hue), testTroopId: num(s.test_troop_id, 1),
            testBattlers: list(s.test_battlers).map(b => ({ actorId: num(b.actor_id, 1), equips: [num(b.weapon_id), num(b.armor1_id), num(b.armor2_id), num(b.armor3_id), num(b.armor4_id)], level: num(b.level, 1) })),
            windowTone: [0, 0, 0, 0]
        });
        // XP has no vehicles; MZ's keep their places but play nothing the game lacks.
        for (const v of ['boat', 'ship', 'airship']) if (out[v]) out[v] = Object.assign({}, out[v], { bgm: { name: '', volume: 90, pitch: 100, pan: 0 }, characterName: '' });
        // MZ's sound list order: cursor, ok, cancel, buzzer, equip, save, load, battle start, escape,
        // enemy attack, enemy damage, enemy collapse, boss 1, boss 2, actor damage, actor collapse, … shop, use item, use skill.
        // Sounds XP has no setting for stay silent rather than name files the game does not have.
        const sounds = out.sounds.map(a => Object.assign({}, a, { name: '' }));
        const at = { 0: 'cursor_se', 1: 'decision_se', 2: 'cancel_se', 3: 'buzzer_se', 4: 'equip_se', 5: 'save_se', 6: 'load_se', 7: 'battle_start_se', 8: 'escape_se', 11: 'enemy_collapse_se', 15: 'actor_collapse_se', 21: 'shop_se' };
        for (const [i, k] of Object.entries(at)) if (s[k]) sounds[i] = snd(k);
        out.sounds = sounds;
        out.terms = terms(out.terms, w);
        out.tileSize = 32; out.iconSize = 24; out.faceSize = 96;
        // XP windows: 32 px lines, 16 px padding, a 22 px font, drawn without an outline.
        Object.assign(out.advanced, { screenWidth: 640, screenHeight: 480, uiAreaWidth: 640, uiAreaHeight: 480, fontSize: 22, lineHeight: 32, windowPadding: 16, windowMargin: 0, textOutlineWidth: 0, windowOpacity: 160 });
        if (s.battle_transition) out.rrBattleTransition = str(s.battle_transition);
        out.rrGuardSkillId = 0;   // set by the importer from database()'s guardSkillId
        out.locale = 'en_US';
        tag(notes, 'xpSystem', 0);
        return out;
    }

    const api = { database, terms, system, ELEMENT_RATE, STATE_RATE, SCOPE, PARAM };
    root.RRXpDatabase = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
