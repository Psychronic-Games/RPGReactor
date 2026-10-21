/*:
 * @target MZ
 * @plugindesc Thrall's battler rules (VX Game_Battler, Game_BattleAction, Game_Enemy, Game_Troop), for imported games
 * @author Thrall's author (on Enterbrain's RGSS2 classes); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallBattlers.js
 *
 * The battle arithmetic Thrall wrote into VX's own Game_Battler,
 * Game_BattleAction, Game_Enemy and Game_Troop, run on the game's VX
 * records rather than on MZ's formulas:
 *   - Stats are VX's: base value plus what events added, each state's rate
 *     added on top (Freeze stacks multiply its share), the passives the
 *     game hard-coded (Primed, Shielded, Ferocity, Savage, Fury, Hardened,
 *     Toughness, Healthy, Grow, Boulder).
 *   - A hit lands when (rand 100 + rand 100) / 2 is below hit minus
 *     evasion. Attack damage is ATK x 4 / (DEF / base ATK + 1); skills add
 *     ATK and SPI shares of their base damage the same way. Then the
 *     element rate (weapon types and rarities do not count as elements),
 *     criticals (x3, x4 with a critical-bonus weapon, enemies x2 less 15%
 *     per critical-guarding armour), the named weapons (Devil, Mars,
 *     Neptune, Reactor, Nihilism, Leviathan, Helios, Judgement, Pluto,
 *     Saitama, Gloria, Reaper, Angel, Conductor, Seraph...), overkill,
 *     variance, Weak (x1.5), thorns, Shield, Pain hits, Phalanx and Curse.
 *   - States stack (Burn up to 5, Freeze up to 3), last their VX hold
 *     turns and wear off with their release chance; incapacitation comes
 *     with 0 HP unless the battler is immortal, as in VX.
 *   - Enemies choose from their VX action lists (ratings, the game's own
 *     conditions 5/1-16 for weapons, allies' states and HP), their stats
 *     scaled by the stat booster when that port is on.
 *
 * Troop members marked immortal in the database start immortal.
 *
 * Other ports call into these rules: Game_Battler rrVxAttackEffect(user),
 * rrVxSkillEffect(user, skill), rrVxItemEffect(user, item) (skill and item
 * are RRThrallVx records: RRThrallVx.skill(id)); the battle port runs them.
 * A port of Thrall's Game_Actor may define rrVxBaseMaxhp/Maxmp/Atk/Def/Spi/
 * Agi, rrVxHit, rrVxEva, rrVxCri, rrVxOdds, rrVxElementSet,
 * rrVxPlusStateSet, rrVxElementRate, rrVxStateProbability,
 * rrVxStateResist, rrVxAtkAnimationId; this port brings Thrall's own
 * versions of each when none is there.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param vxData
 * @text VX database
 * @desc The game's VX records the rules read (JSON). Empty: rebuilt from the MZ database.
 * @type note
 * @default ""
 *
 * @param minions
 * @text Minion enemies
 * @desc Enemy ids the Holy skill and minion-slaying weapons deal extra damage to.
 * @default 21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,48,62,67,68,69,70,71,93,96,116,117,118,125,126,127,128,129,146,147,158
 */
(() => {
    'use strict';
    const PLUGIN = 'RR_ThrallBattlers';
    const params = PluginManager.parameters(PLUGIN);
    const VX = (window.RRThrallVx = window.RRThrallVx || {});

    // ---- Ruby arithmetic ---------------------------------------------------------
    const idiv = (a, b) => (b === 0 ? 0 : Math.floor(a / b));
    const imod = (a, b) => (b === 0 ? 0 : ((a % b) + b) % b);
    const trunc = (n) => (Number.isFinite(n) ? Math.trunc(n) : 0);
    const rand = (n) => (n > 0 ? Math.floor(Math.random() * n) : 0);
    const isInt = (n) => Number.isInteger(n);
    /** Ruby `a / b`: integers floor, floats divide. */
    const rdiv = (a, b) => (isInt(a) && isInt(b) ? idiv(a, b) : a / b);
    const vars = (id) => ($gameVariables ? $gameVariables.value(id) : 0);
    const sw = (id) => ($gameSwitches ? $gameSwitches.value(id) : false);
    Object.assign(VX, { idiv, imod, trunc, rand, rdiv, vars, sw });

    const MINIONS = String(params.minions || '').split(/[,\s]+/).map(Number).filter(Boolean);
    VX.MINIONS = MINIONS;

    // ---- the VX database ---------------------------------------------------------
    // Records keep Ruby's field names (snake_case) so the rules read as the scripts do. They are
    // built once per title, as RGSS loads its database, and the scripts' own changes to them (a
    // Fiend weapon's elements, a skill's scope, a skill's element set emptied of weapon types)
    // last until then.
    let RAW = null;
    try { RAW = params.vxData ? JSON.parse(params.vxData.startsWith('"') ? JSON.parse(params.vxData) : params.vxData) : null; } catch (_) { RAW = null; }

    class VxBase {
        // An armour's VX `kind` is its type (0 shield … 3 accessory), so the record's own type is kept apart.
        constructor(type, id) { this._rrType = type; this.id = id; if (type !== 'armor') this.kind = type; }
        get name() { const d = this.mz(); return d ? d.name : ''; }
        get note() { const d = this.mz(); return d ? String(d.note || '') : ''; }
        get icon_index() { const d = this.mz(); return d ? d.iconIndex : 0; }
        get description() { const d = this.mz(); return d ? d.description : ''; }
        mz() { return ({ skill: $dataSkills, item: $dataItems, weapon: $dataWeapons, armor: $dataArmors, state: $dataStates })[this._rrType]?.[this.id] || null; }
        isSkill() { return this._rrType === 'skill'; }
        isItem() { return this._rrType === 'item'; }
        isWeapon() { return this._rrType === 'weapon'; }
        isArmor() { return this._rrType === 'armor'; }
    }
    /** RPG::UsableItem's scope tests. */
    class VxUsable extends VxBase {
        forOpponent() { return [1, 2, 3, 4, 5, 6].includes(this.scope); }
        forFriend() { return [7, 8, 9, 10, 11].includes(this.scope); }
        forDeadFriend() { return [9, 10].includes(this.scope); }
        forUser() { return this.scope === 11; }
        forOne() { return [1, 3, 4, 7, 9, 11].includes(this.scope); }
        forTwo() { return this.scope === 5; }
        forThree() { return this.scope === 6; }
        forRandom() { return [4, 5, 6].includes(this.scope); }
        forAll() { return [2, 8, 10].includes(this.scope); }
        dual() { return this.scope === 3; }
        needSelection() { return [1, 3, 7, 9].includes(this.scope); }
        battleOk() { return [0, 1].includes(this.occasion); }
        menuOk() { return [0, 2].includes(this.occasion); }
    }
    VX.VxBase = VxBase; VX.VxUsable = VxUsable;

    const MZ_SCOPE_TO_VX = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 5, 5: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11 };
    /** base, ATK and SPI factors read back from the importer's VX damage formula. */
    function formulaFactors(damage) {
        const f = String(damage && damage.formula || '0');
        const type = damage ? damage.type : 0;
        const num = (re) => { const m = re.exec(f); return m ? Number(m[1]) : 0; };
        let base = num(/^Math\.max\(0,\s*(-?[\d.]+)/) || num(/^(-?[\d.]+)/);
        const atk = num(/a\.atk \* ([\d.]+)/), mat = num(/a\.mat \* ([\d.]+)/);
        if (type === 3 || type === 4) base = -Math.abs(base);
        return { base: Math.round(base), atkF: Math.round(atk * 25), spiF: Math.round(mat * 50), ignore: base > 0 && !/ - \(/.test(f) };
    }
    function usableFromMz(d) {
        const fx = formulaFactors(d.damage);
        const t = d.damage ? d.damage.type : 0;
        const flags = (d.hitType === 1 ? 1 : 0) | (t === 2 || t === 4 || t === 6 ? 2 : 0) | (t === 5 || t === 6 ? 4 : 0) | (fx.ignore ? 8 : 0);
        const ce = (d.effects || []).find(e => e.code === 44);
        const scope = d.repeats === 2 && d.scope === 1 ? 3 : (MZ_SCOPE_TO_VX[d.scope] ?? 0);
        return [fx.base, fx.atkF, fx.spiF, d.damage ? d.damage.variance : 20, d.successRate, scope, d.occasion, d.speed, d.mpCost || 0, d.animationId,
            ce ? ce.dataId : 0, flags, d.damage && d.damage.elementId > 0 ? [d.damage.elementId] : [],
            (d.effects || []).filter(e => e.code === 21).map(e => e.dataId), (d.effects || []).filter(e => e.code === 22).map(e => e.dataId)];
    }
    const RATE_TO_ELEMENT_RANK = (v) => (v >= 2 ? 1 : v >= 1.5 ? 2 : v >= 1 ? 3 : v >= 0.5 ? 4 : v >= 0 ? 5 : 6);
    const RATE_TO_STATE_RANK = (v) => (v >= 1 ? 1 : v >= 0.8 ? 2 : v >= 0.6 ? 3 : v >= 0.4 ? 4 : v >= 0.2 ? 5 : 6);
    function ranksFromTraits(traits, code, size, toRank, plain) {
        const r = new Array(size).fill(plain);
        r[0] = 0;
        for (const t of traits || []) if (t.code === code && t.dataId < size) r[t.dataId] = toRank(t.value);
        return r.join('');
    }
    /** The VX database rebuilt from the MZ one, for an import that could not read Data/*.rvdata. */
    function rawFromMz() {
        const out = { skills: {}, items: {}, weapons: {}, armors: {}, enemies: {}, states: {}, classes: {}, actors: {}, immortal: [] };
        const elements = ($dataSystem.elements || []).length, statesN = $dataStates.length;
        const attackId = ($dataSystem.rrGuardSkillId || 0) - 1, guardId = $dataSystem.rrGuardSkillId || 0, escapeId = guardId + 1;
        for (const d of $dataSkills) if (d && d.id < attackId) out.skills[d.id] = usableFromMz(d);
        for (const d of $dataItems) if (d) {
            const hp = (d.effects || []).find(e => e.code === 11), mp = (d.effects || []).find(e => e.code === 12), g = (d.effects || []).find(e => e.code === 42);
            out.items[d.id] = usableFromMz(d).concat([hp ? Math.round(hp.value1 * 100) : 0, hp ? hp.value2 : 0, mp ? Math.round(mp.value1 * 100) : 0, mp ? mp.value2 : 0,
                g ? [0, 1, 2, 3, 4, 5, 6][[0, 0, 1, 2, 3, 4, 6].indexOf(g.dataId) + 1] || 0 : 0, g ? g.value1 : 0, d.consumable ? 1 : 0]);
        }
        const traitSum = (traits, code, id) => (traits || []).filter(t => t.code === code && t.dataId === id).reduce((s, t) => s + t.value, 0);
        const hasTrait = (traits, code, id) => (traits || []).some(t => t.code === code && (id === undefined || t.dataId === id));
        for (const d of $dataWeapons) if (d) out.weapons[d.id] = [d.params[2], d.params[3], d.params[4], d.params[6], Math.round(95 + traitSum(d.traits, 22, 0) * 100), d.animationId,
            (hasTrait(d.traits, 54) ? 1 : 0) | (hasTrait(d.traits, 33) ? 2 : 0) | (hasTrait(d.traits, 34) ? 4 : 0) | (traitSum(d.traits, 22, 2) > 0 ? 8 : 0),
            (d.traits || []).filter(t => t.code === 31).map(t => t.dataId), (d.traits || []).filter(t => t.code === 32).map(t => t.dataId)];
        for (const d of $dataArmors) if (d) out.armors[d.id] = [Math.max(0, d.etypeId - 2), d.params[2], d.params[3], d.params[4], d.params[6], Math.round(traitSum(d.traits, 22, 1) * 100),
            (hasTrait(d.traits, 22, 3) ? 1 : 0) | (hasTrait(d.traits, 23, 4) ? 2 : 0) | (hasTrait(d.traits, 23, 9) ? 4 : 0) | (hasTrait(d.traits, 22, 7) ? 8 : 0),
            (d.traits || []).filter(t => t.code === 11).map(t => t.dataId), (d.traits || []).filter(t => t.code === 14).map(t => t.dataId)];
        for (const d of $dataEnemies) if (d) {
            const drop = (x) => (x && x.kind ? [x.kind, x.dataId, x.denominator] : [0, 0, 1]);
            const actions = (d.actions || []).map(a => {
                const kind = a.skillId === attackId ? 0 : a.skillId === guardId ? 0 : a.skillId === escapeId ? 0 : 1;
                const basic = a.skillId === guardId ? 1 : a.skillId === escapeId ? 2 : 0;
                const rate = a.conditionType === 2 || a.conditionType === 3;
                return [kind, basic, kind ? a.skillId : 0, a.conditionType, rate ? Math.round(a.conditionParam1 * 100) : a.conditionParam1, rate ? Math.round(a.conditionParam2 * 100) : a.conditionParam2, a.rating];
            });
            out.enemies[d.id] = [d.params[0], d.params[1], d.params[2], d.params[3], d.params[4], d.params[6], Math.round(traitSum(d.traits, 22, 0) * 100), Math.round(traitSum(d.traits, 22, 1) * 100),
                d.exp, d.gold, traitSum(d.traits, 22, 2) > 0 ? 1 : 0, drop(d.dropItems[0]), drop(d.dropItems[1]),
                ranksFromTraits(d.traits, 11, elements, RATE_TO_ELEMENT_RANK, 3), ranksFromTraits(d.traits, 13, statesN, RATE_TO_STATE_RANK, 3), actions];
        }
        for (const d of $dataStates) if (d) {
            const rate = (id) => Math.round((d.traits || []).filter(t => t.code === 21 && t.dataId === id).reduce((p, t) => p * t.value, 1) * 100);
            const sealed = hasTrait(d.traits, 42, 1), noEva = traitSum(d.traits, 22, 1) <= -1;
            const restriction = d.restriction === 4 ? (noEva ? 5 : 4) : d.restriction === 2 ? 3 : d.restriction === 1 ? 2 : sealed ? 1 : 0;
            const hold = d.autoRemovalTiming ? d.minTurns : 0;
            const prob = d.autoRemovalTiming ? Math.round(100 / Math.max(1, d.maxTurns - d.minTurns + 1)) : 0;
            out.states[d.id] = [restriction, Math.round(d.priority / 10), hold, prob, rate(2), rate(3), rate(4), rate(6),
                (traitSum(d.traits, 22, 7) < 0 ? 4 : 0) | (traitSum(d.traits, 22, 0) < 0 ? 8 : 0) | (d.removeAtBattleEnd ? 16 : 0) | (d.removeByDamage ? 32 : 0),
                (d.traits || []).filter(t => t.code === 11).map(t => t.dataId), (d.traits || []).filter(t => t.code === 14).map(t => t.dataId)];
        }
        for (const d of $dataActors) if (d) {
            const cls = /<rrVxClass:\s*(\d+)>/.exec(d.note || '');
            const t = d.traits || [];
            out.actors[d.id] = [cls ? Number(cls[1]) : 1, (hasTrait(t, 55) ? 1 : 0) | (hasTrait(t, 53) ? 2 : 0) | (hasTrait(t, 62, 0) ? 4 : 0) | (hasTrait(t, 62, 1) ? 8 : 0)
                | (hasTrait(t, 23, 3) ? 16 : 0) | (traitSum(t, 22, 2) > 0 ? 32 : 0)];
        }
        for (const d of $dataClasses) if (d) {
            const vx = /<rrVxClass:\s*(\d+)>/.exec(d.note || '');
            if (!vx) continue;
            out.classes[Number(vx[1])] = [0, ranksFromTraits(d.traits, 11, elements, RATE_TO_ELEMENT_RANK, 3), ranksFromTraits(d.traits, 13, statesN, RATE_TO_STATE_RANK, 1), 0, ''];
        }
        return out;
    }

    const DB = { skills: [], items: [], weapons: [], armors: [], states: [], enemies: [], classes: [], actors: [] };
    const digits = (s) => String(s || '').split('').map(Number);
    function buildDatabase() {
        const raw = RAW || rawFromMz();
        VX.rawFromMz = !RAW;
        const usableFields = (o, r) => {
            [o.base_damage, o.atk_f, o.spi_f, o.variance, o.hit, o.scope, o.occasion, o.speed, o.mp_cost, o.animation_id, o.common_event_id] = r;
            const f = r[11];
            o.physical_attack = !!(f & 1); o.damage_to_mp = !!(f & 2); o.absorb_damage = !!(f & 4); o.ignore_defense = !!(f & 8);
            o.element_set = r[12].slice(); o.plus_state_set = r[13].slice(); o.minus_state_set = r[14].slice();
        };
        for (const key of Object.keys(DB)) DB[key] = [];
        for (const [id, r] of Object.entries(raw.skills || {})) { const o = new VxUsable('skill', Number(id)); usableFields(o, r); DB.skills[o.id] = o; }
        for (const [id, r] of Object.entries(raw.items || {})) {
            const o = new VxUsable('item', Number(id)); usableFields(o, r);
            [o.hp_recovery_rate, o.hp_recovery, o.mp_recovery_rate, o.mp_recovery, o.parameter_type, o.parameter_points] = r.slice(15, 21);
            o.consumable = !!r[21];
            DB.items[o.id] = o;
        }
        for (const [id, r] of Object.entries(raw.weapons || {})) {
            const o = new VxBase('weapon', Number(id));
            [o.atk, o.def, o.spi, o.agi, o.hit, o.animation_id] = r;
            o.two_handed = !!(r[6] & 1); o.fast_attack = !!(r[6] & 2); o.dual_attack = !!(r[6] & 4); o.critical_bonus = !!(r[6] & 8);
            o.element_set = r[7].slice(); o.state_set = r[8].slice();
            DB.weapons[o.id] = o;
        }
        for (const [id, r] of Object.entries(raw.armors || {})) {
            const o = new VxBase('armor', Number(id));
            [o.kind, o.atk, o.def, o.spi, o.agi, o.eva] = r;
            o.prevent_critical = !!(r[6] & 1); o.half_mp_cost = !!(r[6] & 2); o.double_exp_gain = !!(r[6] & 4); o.auto_hp_recover = !!(r[6] & 8);
            o.element_set = r[7].slice(); o.state_set = r[8].slice();
            DB.armors[o.id] = o;
        }
        for (const [id, r] of Object.entries(raw.states || {})) {
            const o = new VxBase('state', Number(id));
            [o.restriction, o.priority, o.hold_turn, o.auto_release_prob, o.atk_rate, o.def_rate, o.spi_rate, o.agi_rate] = r;
            const f = r[8];
            o.nonresistance = !!(f & 1); o.offset_by_opposite = !!(f & 2); o.slip_damage = !!(f & 4); o.reduce_hit_ratio = !!(f & 8); o.battle_only = !!(f & 16); o.release_by_damage = !!(f & 32);
            o.element_set = r[9].slice(); o.state_set = r[10].slice();
            DB.states[o.id] = o;
        }
        for (const [id, r] of Object.entries(raw.enemies || {})) {
            const o = { id: Number(id) };
            [o.maxhp, o.maxmp, o.atk, o.def, o.spi, o.agi, o.hit, o.eva, o.exp, o.gold] = r;
            o.has_critical = !!(r[10] & 1); o.levitate = !!(r[10] & 2);
            const drop = (d) => ({ kind: d[0], item_id: d[0] === 1 ? d[1] : 0, weapon_id: d[0] === 2 ? d[1] : 0, armor_id: d[0] === 3 ? d[1] : 0, denominator: d[2] });
            o.drop_item1 = drop(r[11]); o.drop_item2 = drop(r[12]);
            o.element_ranks = digits(r[13]); o.state_ranks = digits(r[14]);
            o.actions = (r[15] || []).map(a => ({ kind: a[0], basic: a[1], skill_id: a[2], condition_type: a[3], condition_param1: a[4], condition_param2: a[5], rating: a[6] }));
            DB.enemies[o.id] = o;
        }
        for (const [id, r] of Object.entries(raw.classes || {})) DB.classes[Number(id)] = { id: Number(id), position: r[0], element_ranks: digits(r[1]), state_ranks: digits(r[2]), skill_name_valid: !!r[3], skill_name: r[4] };
        for (const [id, r] of Object.entries(raw.actors || {})) {
            const f = r[1];
            DB.actors[Number(id)] = { id: Number(id), class_id: r[0], two_swords_style: !!(f & 1), fix_equipment: !!(f & 2), auto_battle: !!(f & 4), super_guard: !!(f & 8), pharmacology: !!(f & 16), critical_bonus: !!(f & 32) };
        }
        VX.IMMORTAL = new Set(raw.immortal || []);
        if (typeof VX.onDatabaseBuilt === 'function') VX.onDatabaseBuilt(DB);
        for (const hook of VX.databaseHooks || []) hook(DB);
    }
    VX.DB = DB;
    VX.databaseHooks = VX.databaseHooks || [];
    VX.buildDatabase = buildDatabase;
    VX.skill = (id) => DB.skills[id] || null;
    VX.item = (id) => DB.items[id] || null;
    VX.weapon = (id) => DB.weapons[id] || null;
    VX.armor = (id) => DB.armors[id] || null;
    VX.state = (id) => DB.states[id] || null;
    VX.enemy = (id) => DB.enemies[id] || null;
    VX.vxClass = (id) => DB.classes[id] || null;
    VX.actorData = (id) => DB.actors[id] || null;
    /** The VX record of an MZ data object (or of a VX record: itself). */
    VX.of = (obj) => {
        if (!obj) return null;
        if (obj instanceof VxBase) return obj;
        if (DataManager.isSkill(obj)) return VX.skill(obj.id);
        if (DataManager.isItem(obj)) return VX.item(obj.id);
        if (DataManager.isWeapon(obj)) return VX.weapon(obj.id);
        if (DataManager.isArmor(obj)) return VX.armor(obj.id);
        return null;
    };
    VX.animation = (id) => {
        const a = $dataAnimations[id];
        if (!a) return null;
        return { id, frame_max: Array.isArray(a.frames) ? a.frames.length : 0, position: a.position, animation1_name: a.animation1Name || '', data: a };
    };

    const _loadDatabase = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _loadDatabase.call(this, object);
        if (object === $dataStates && $dataSkills && $dataItems && $dataWeapons && $dataArmors && $dataEnemies && $dataActors && $dataClasses && $dataSystem) buildDatabase();
    };
    const _isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        const ok = _isDatabaseLoaded.call(this);
        if (ok && !DB.skills.length && !DB.states.length) buildDatabase();
        return ok;
    };
    // RGSS reads its database again at the title, which drops what the scripts changed in it.
    const _titleStart = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function() {
        _titleStart.call(this);
        if ($dataSkills) buildDatabase();
    };

    // ---- battler fields ----------------------------------------------------------
    const _baseInitMembers = Game_BattlerBase.prototype.initMembers;
    Game_BattlerBase.prototype.initMembers = function() {
        _baseInitMembers.call(this);
        this._rrPain = 0;
        this._rrStatusMod = [0, 0, 0];
        this._rrImmortal = false;
        this._rrGuarded = false;
        this._rrTempWeapon = null;
        this.rrVxClearSpriteEffects();
        this.rrVxClearActionResults();
    };
    Game_BattlerBase.prototype.rrVxClearSpriteEffects = function() {
        this._rrAnimationId = 0;
        this._rrAnimationMirror = false;
        this._rrWhiteFlash = false;
        this._rrBlink = false;
        this._rrCollapse = false;
    };
    Game_BattlerBase.prototype.rrVxClearActionResults = function() {
        this._rrVx = { skipped: false, missed: false, evaded: false, critical: false, absorbed: false, hpDamage: 0, mpDamage: 0,
            addedStates: [], removedStates: [], remainedStates: [] };
    };
    Game_BattlerBase.prototype.rrVxResult = function() {
        if (!this._rrVx) this.rrVxClearActionResults();
        return this._rrVx;
    };
    Game_BattlerBase.prototype.rrVxAction = function() {
        if (!this._rrVxActionObj) this._rrVxActionObj = new Game_RrVxAction(this);
        return this._rrVxActionObj;
    };
    // The sprite-communication and result fields read like the Ruby attributes.
    for (const [name, field] of [['hp_damage', 'hpDamage'], ['mp_damage', 'mpDamage'], ['missed', 'missed'], ['evaded', 'evaded'], ['skipped', 'skipped'], ['critical', 'critical'], ['absorbed', 'absorbed']]) {
        Object.defineProperty(Game_BattlerBase.prototype, 'rrVx_' + name, {
            get() { return this.rrVxResult()[field]; },
            set(v) { this.rrVxResult()[field] = v; },
            configurable: true
        });
    }
    Game_BattlerBase.prototype.rrPain = function() { return this._rrPain || 0; };
    Game_BattlerBase.prototype.rrSetPain = function(v) { this._rrPain = Number(v) || 0; };
    Game_BattlerBase.prototype.rrStatusMod = function() { if (!this._rrStatusMod) this._rrStatusMod = [0, 0, 0]; return this._rrStatusMod; };
    /** VX `animation_id = n`: the battler shows the animation (the battle's sprites pick it up). */
    Game_BattlerBase.prototype.rrSetAnimationId = function(id, mirror) {
        this._rrAnimationId = Number(id) || 0;
        this._rrAnimationMirror = !!mirror;
        if (!(SceneManager._scene instanceof Scene_Battle) && id > 0 && $gameTemp) $gameTemp.requestAnimation([this], id, !!mirror);
    };

    // ---- identity helpers ----------------------------------------------------------
    Game_BattlerBase.prototype.rrVxIsActor = function() { return this.isActor(); };
    Game_BattlerBase.prototype.rrVxIndex = function() {
        if (this.isActor()) { const i = $gameParty.members().indexOf(this); return i < 0 ? null : i; }
        const i = $gameTroop.members().indexOf(this);
        return i < 0 ? null : i;
    };
    Game_BattlerBase.prototype.rrVxSkillLearn = function(/* skillId */) { return false; };
    Game_Actor.prototype.rrVxSkillLearn = function(skillId) {
        const id = typeof skillId === 'object' && skillId ? skillId.id : skillId;
        return this._skills.includes(id);
    };
    Game_BattlerBase.prototype.rrVxWeapons = function() { return []; };
    Game_BattlerBase.prototype.rrVxArmors = function() { return []; };
    Game_BattlerBase.prototype.rrVxEquips = function() { return this.rrVxWeapons().concat(this.rrVxArmors()); };
    const firstWord = (obj) => (obj ? String(obj.name).split(/ /)[1] : undefined);
    VX.nameWord = firstWord;
    VX.namedWeapons = (battler) => battler.rrVxWeapons().filter(Boolean);

    // ---- VX Game_Actor (Thrall's 018) battle getters, when the actor port has none ------------------
    const actorDefault = (name, fn) => { if (!Object.prototype.hasOwnProperty.call(Game_Actor.prototype, name)) Game_Actor.prototype[name] = fn; };
    actorDefault('rrVxActorData', function() { return VX.actorData(this._actorId) || { two_swords_style: false, auto_battle: false, super_guard: false, pharmacology: false, critical_bonus: false, fix_equipment: false, class_id: 1 }; });
    actorDefault('rrVxClassId', function() {
        if (this._rrVxClassId) return this._rrVxClassId;
        const m = /<rrVxClass:\s*(\d+)>/.exec(this.actor().note || '');
        return m ? Number(m[1]) : this.rrVxActorData().class_id;
    });
    actorDefault('rrVxTwoSwordsStyle', function() { return this.rrVxActorData().two_swords_style; });
    // equips(): [weapon, armor1 (shield or second weapon), head, body, accessory] as VX records.
    actorDefault('rrVxWeapons', function() {
        const eq = this._equips || [];
        const w = [eq[0] ? VX.weapon(eq[0].itemId()) : null];
        if (this.rrVxTwoSwordsStyle()) w.push(eq[1] && eq[1].isWeapon() ? VX.weapon(eq[1].itemId()) : null);
        return w;
    });
    actorDefault('rrVxArmors', function() {
        const eq = this._equips || [];
        const out = [];
        const armorAt = (i) => (eq[i] && eq[i].isArmor() ? VX.armor(eq[i].itemId()) : null);
        if (!this.rrVxTwoSwordsStyle()) out.push(armorAt(1));
        out.push(armorAt(2), armorAt(3), armorAt(4));
        return out;
    });
    actorDefault('rrVxWeaponId', function() { const w = this.rrVxWeapons()[0]; return w ? w.id : 0; });
    actorDefault('rrVxAutoBattle', function() { return this.rrVxActorData().auto_battle || this.isStateAffected(26); });
    actorDefault('rrVxPharmacology', function() { return this.rrVxActorData().pharmacology; });
    actorDefault('rrVxSuperGuard', function() { return this.rrVxActorData().super_guard; });
    actorDefault('rrVxOverkill', function() { return this._rrOverkill || 0; });
    actorDefault('rrVxSetOverkill', function(v) { this._rrOverkill = Number(v) || 0; });
    actorDefault('rrVxElementRate', function(elementId) {
        const cls = VX.vxClass(this.rrVxClassId());
        const rank = cls ? cls.element_ranks[elementId] : 3;
        let result = [0, 200, 150, 100, 50, 0, -100][rank] ?? 100;
        if (this.rrVxSkillLearn(90)) { if ([6, 7, 8].includes(elementId)) result -= 20; if (result < 0) result = 0; }
        let t = false;
        for (const armor of this.rrVxArmors().filter(Boolean)) {
            const w = firstWord(armor);
            if (['Amethyst', 'Ruby', 'Sapphire'].includes(w)) { if (armor.element_set.includes(elementId)) t = true; }
            else if (armor.element_set.includes(elementId)) result -= 20;
        }
        for (const state of this.rrVxStates()) {
            if (state.note.includes('<inverted>')) { if (state.element_set.includes(elementId)) result += 50; }
            else if (state.element_set.includes(elementId)) result -= 20;
        }
        if (result < 0) result = 0;
        if (t && result > 0) result *= -1;
        return result;
    });
    actorDefault('rrVxStateProbability', function(stateId) {
        const st = VX.state(stateId);
        if (st && st.nonresistance) return 100;
        for (const state of this.rrVxStates()) if (state.note.includes('<inverted>') && state.state_set.includes(stateId)) return 100;
        const cls = VX.vxClass(this.rrVxClassId());
        const rank = cls ? cls.state_ranks[stateId] : 3;
        let result = [0, 100, 80, 60, 40, 20, 0][rank] ?? 0;
        for (const armor of this.rrVxArmors().filter(Boolean)) if (armor.state_set.includes(stateId)) result -= 15;
        return Math.max(0, result);
    });
    actorDefault('rrVxStateResist', function() { return this.rrVxArmors().filter(Boolean).some(a => firstWord(a) === 'Celestial'); });
    actorDefault('rrVxElementSet', function() {
        const weapons = this.rrVxWeapons().filter(Boolean);
        if (!weapons.length) return [1];
        const result = [];
        for (const w of weapons) for (const e of w.element_set) if (!result.includes(e)) result.push(e);
        if (this.isStateAffected(46) && !result.includes(6)) result.push(6);
        if (this.isStateAffected(47) && !result.includes(7)) result.push(7);
        if (this.isStateAffected(48) && !result.includes(8)) result.push(8);
        return result;
    });
    actorDefault('rrVxPlusStateSet', function() {
        const result = [];
        const union = (a) => { for (const x of a) if (!result.includes(x)) result.push(x); };
        for (const w of this.rrVxWeapons().filter(Boolean)) {
            union(w.state_set);
            if (firstWord(w) === 'Reflection') for (const s of this.rrVxStates()) if ([2, 3, 4, 5].includes(s.id)) result.push(s.id);
            if ((w.element_set.includes(5) || w.element_set.includes(29)) && this.rrVxSkillLearn(141)) result.push(5);
        }
        if (this.isStateAffected(46) && !result.includes(2)) result.push(2);
        if (this.isStateAffected(47) && !result.includes(3)) result.push(3);
        if (this.isStateAffected(48) && !result.includes(4)) result.push(4);
        return result;
    });
    const classParam = (actor, p, level) => {
        const cls = $dataClasses[actor._classId];
        const id = [0, 1, 2, 3, 4, 6][p];
        return cls && cls.params && cls.params[id] ? cls.params[id][Math.min(level, cls.params[id].length - 1)] || 0 : 0;
    };
    actorDefault('rrVxBaseMaxhp', function() {
        let n = classParam(this, 0, this._level);
        let n1 = 0, n2 = 0;
        const equips = this.rrVxEquips().filter(Boolean);
        for (const item of equips) if (item.isArmor()) n += item.atk;
        for (const item of equips) if (firstWord(item) === 'Turtle') n1 = idiv(n, 10);
        if (vars(185) === 17 || vars(185) === 23) n2 = idiv(n * 3, 10);
        return n - n1 - n2;
    });
    actorDefault('rrVxBaseMaxmp', function() { return classParam(this, 1, this._level); });
    actorDefault('rrVxBaseAtk', function() {
        let n = 0, n1 = 0;
        const es = this.rrVxElementSet();
        for (const item of this.rrVxEquips().filter(Boolean)) {
            if (item.isWeapon()) n += item.atk;
            const w = firstWord(item);
            if (w === 'Aremen') n = this._level * 5 + 20;
            else if (w === 'Vel') n = this._level * 4 + 15;
            else if (w === 'Wolf') n1 += idiv(n, 10);
            else if (w === 'Gravity') n1 += this.rrVxBaseDef();
            if (item.isWeapon()) {
                if (this.rrVxSkillLearn(65) && (es.includes(6) || es.includes(7) || es.includes(8))) n1 = idiv(n * 15, 100);
                if ((item.element_set.includes(5) || item.element_set.includes(29)) && this.rrVxSkillLearn(129)) n1 = idiv(n, 5);
                if ((item.element_set.includes(1) || item.element_set.includes(29)) && this.rrVxSkillLearn(97)) n1 = idiv(n * 15, 100);
                if ((item.element_set.includes(2) || item.element_set.includes(29)) && this.rrVxSkillLearn(161)) n1 = idiv(n, 10);
            }
        }
        return n + n1;
    });
    actorDefault('rrVxBaseDef', function() {
        let n = 0;
        const equips = this.rrVxEquips().filter(Boolean);
        for (const item of equips) {
            if (firstWord(item) === 'Paladin') n += idiv((200 - idiv(this._hp * 100, idiv(this.mhp, 2) || 1)) * item.def, 100);
            else if (item.isArmor()) n += item.def;
        }
        for (const item of equips) if (firstWord(item) === 'Gravity') n = idiv(n, 2);
        return n;
    });
    actorDefault('rrVxBaseSpi', function() {
        let n = 0, n1 = 0;
        for (const item of this.rrVxEquips().filter(Boolean)) {
            if (firstWord(item) === 'Serpent') n = idiv((200 - idiv(this._hp * 100, idiv(this.mhp, 2) || 1)) * item.spi, 100);
            else if (item.isArmor()) n += item.spi;
        }
        if (this.rrVxSkillLearn(69)) n1 += idiv(n, 5);
        return n + n1;
    });
    actorDefault('rrVxBaseAgi', function() {
        let n = 0, n1 = 0;
        const es = this.rrVxElementSet();
        for (const item of this.rrVxEquips().filter(Boolean)) {
            const w = firstWord(item);
            if (w === 'Aremen' || w === 'Vel') n = idiv(this._level * 3, 2) + 15;
            else if (item.isWeapon()) n += item.agi;
            if (item.isWeapon() && this.rrVxSkillLearn(71) && es.includes(6)) n1 = idiv(n * 15, 100);
            if (item.isWeapon() && (item.element_set.includes(3) || item.element_set.includes(29)) && this.rrVxSkillLearn(98)) n1 = idiv(n * 15, 100);
        }
        n += n1;
        if (this.rrVxGuarding()) n = idiv(n, 2);
        return n;
    });
    actorDefault('rrVxHit', function() {
        const weapons = this.rrVxWeapons();
        let n;
        if (this.rrVxTwoSwordsStyle()) {
            n = Math.min(weapons[0] ? weapons[0].hit : 95, weapons[1] ? weapons[1].hit : 95);
        } else {
            n = weapons[0] ? weapons[0].hit : 80;
            for (const item of this.rrVxEquips().filter(Boolean)) {
                if (firstWord(item) === 'Falcon') n += 10;
                if (item.isWeapon() && (item.element_set.includes(2) || item.element_set.includes(29)) && this.rrVxSkillLearn(167)) n += 10;
            }
            const lead = $gameActors.actor(1);
            if (lead && lead.rrVxSkillLearn(105) && this.isStateAffected(20)) n += 10;
            if (this.rrVxSkillLearn(133)) n += 5;
            if (this.isStateAffected(24)) n += 20;
            if (this.rrVxSkillLearn(173)) n -= this.rrVxOverkill();
            if (n < 0) n = 0;
        }
        return n;
    });
    actorDefault('rrVxEva', function() {
        let n = 5;
        for (const a of this.rrVxArmors().filter(Boolean)) n += a.eva;
        if (this.isStateAffected(11)) n += 15;
        if (this.isStateAffected(35)) n += 15;
        if (this.isStateAffected(41)) n += 10;
        const lead = $gameActors.actor(1);
        if (lead && lead.rrVxSkillLearn(106) && this.isStateAffected(20)) n += 10;
        return n;
    });
    actorDefault('rrVxCri', function() {
        let n = 5;
        if (this.rrVxActorData().critical_bonus) n += 5;
        if (this.rrVxSkillLearn(130)) n += 5;
        if (this.rrVxSkillLearn(148) && this.isStateAffected(7)) n += 10;
        const es = this.rrVxElementSet();
        for (const w of this.rrVxWeapons().filter(Boolean)) {
            if (this.rrVxSkillLearn(72) && es.includes(8)) n += 10;
            if ((w.element_set.includes(1) || w.element_set.includes(29)) && this.rrVxSkillLearn(103)) n += 10;
            n += w.spi;
            if (firstWord(w) === 'Watcher') n += idiv(100 - idiv(this._hp * 100, this.mhp || 1), 2);
        }
        if (vars(185) === 17) n += 10;
        if (this.isStateAffected(30)) n = 100;
        return n;
    });
    actorDefault('rrVxOdds', function() {
        let n = 5;
        for (const a of this.rrVxArmors().filter(Boolean)) {
            const w = firstWord(a);
            if (w === 'Camouflage') n = 1; else if (w === 'Vanguard') n += 25;
        }
        if (this.rrVxSkillLearn(165)) n += 5;
        if (this.rrVxSkillLearn(178) && (this.isStateAffected(26) || this.isStateAffected(43))) n += 20;
        if (this.isStateAffected(7) || this.isStateAffected(13)) n = 0;
        if (this.rrVxGuarding()) n = 0;
        return n;
    });
    actorDefault('rrVxFastAttack', function() {
        const es = this.rrVxElementSet();
        for (const w of this.rrVxWeapons().filter(Boolean)) {
            if (w.fast_attack) return true;
            if (this.rrVxSkillLearn(81) && (es.includes(6) || es.includes(7) || es.includes(8))) return true;
        }
        return false;
    });
    actorDefault('rrVxDualAttack', function() { return this.rrVxWeapons().filter(Boolean).some(w => w.dual_attack); });
    actorDefault('rrVxPreventCritical', function() { return this.rrVxArmors().filter(Boolean).some(a => a.prevent_critical); });
    actorDefault('rrVxHalfMpCost', function() { return this.rrVxArmors().filter(Boolean).some(a => a.half_mp_cost); });
    actorDefault('rrVxAutoHpRecover', function() { return this.rrVxArmors().filter(Boolean).some(a => a.auto_hp_recover); });
    actorDefault('rrVxDoubleExpGain', function() { return this.rrVxArmors().filter(Boolean).some(a => a.double_exp_gain); });
    actorDefault('rrVxAtkAnimationId', function() {
        const weapons = this.rrVxWeapons();
        if (this.rrVxTwoSwordsStyle()) {
            if (weapons[0]) return weapons[0].animation_id;
            return weapons[1] ? 0 : 1;
        }
        if (!weapons[0]) return 1;
        const e = weapons[0].element_set;
        const anim = weapons[0].animation_id;
        if (this.isStateAffected(46)) return VX.changeAnimation(anim, 2);
        if (this.isStateAffected(47)) return VX.changeAnimation(anim, 3);
        if (this.isStateAffected(48)) return VX.changeAnimation(anim, 4);
        if (this.rrVxSkillLearn(141)) { if (e.includes(5) || e.includes(29)) return VX.changeAnimation(anim, 5); }
        return anim;
    });
    actorDefault('rrVxAtkAnimationId2', function() {
        if (!this.rrVxTwoSwordsStyle()) return 0;
        const w = this.rrVxWeapons()[1];
        return w ? w.animation_id : 0;
    });
    actorDefault('rrVxChangeEquipById', function(slot, itemId) {
        const item = slot === 0 || (slot === 1 && this.rrVxTwoSwordsStyle()) ? $dataWeapons[itemId] : $dataArmors[itemId];
        this.changeEquip(slot, itemId ? item : null);
    });
    // Game_Actor#change_animation: the weapon animation with a Chaos or Poison Blade element added.
    // [status][animation] → animation, from Thrall's table.
    const CHANGE_ANIMATION = {
        2: { 7: 8, 9: 122, 10: 123, 95: 124, 90: 125, 112: 197, 113: 198, 114: 199, 115: 200, 116: 201, 148: 202, 17: 18, 19: 126, 20: 127, 96: 128, 91: 129, 117: 207, 118: 208, 119: 209,
            120: 210, 121: 211, 149: 212, 1: 2, 3: 130, 4: 131, 97: 132, 92: 133, 158: 217, 76: 218, 159: 218, 160: 219, 161: 220, 162: 221, 150: 222, 223: 247, 225: 249, 13: 14, 15: 134,
            16: 135, 98: 136, 93: 137, 163: 227, 164: 228, 165: 229, 166: 230, 167: 231, 151: 232, 21: 22, 23: 138, 24: 139, 99: 140, 94: 141, 100: 237, 101: 238, 102: 239, 103: 240, 104: 241, 146: 242 },
        3: { 7: 9, 8: 122, 10: 112, 95: 113, 90: 114, 123: 197, 124: 198, 125: 199, 115: 203, 116: 204, 148: 205, 17: 19, 18: 126, 20: 117, 96: 118, 91: 119, 127: 207, 128: 208, 129: 209,
            120: 213, 121: 214, 149: 215, 1: 3, 2: 130, 4: 158, 97: 159, 92: 160, 85: 217, 131: 217, 132: 218, 133: 219, 161: 223, 162: 224, 150: 225, 220: 247, 221: 248, 13: 15, 14: 134,
            16: 163, 98: 164, 93: 165, 135: 227, 136: 228, 137: 229, 166: 233, 167: 234, 151: 235, 21: 23, 22: 138, 24: 100, 99: 101, 94: 102, 139: 237, 140: 238, 141: 239, 103: 243, 104: 244, 146: 245 },
        4: { 7: 10, 8: 123, 9: 112, 95: 115, 90: 116, 122: 197, 124: 200, 125: 201, 113: 203, 114: 204, 148: 206, 17: 20, 18: 127, 19: 117, 96: 120, 91: 121, 126: 207, 128: 210, 129: 211,
            118: 213, 119: 214, 149: 216, 1: 4, 2: 131, 3: 158, 97: 161, 92: 162, 130: 217, 132: 220, 133: 221, 76: 223, 159: 223, 160: 224, 150: 226, 218: 247, 225: 250, 13: 16, 14: 135,
            15: 163, 98: 166, 93: 167, 134: 227, 136: 230, 137: 231, 164: 233, 165: 234, 151: 236, 21: 24, 22: 139, 23: 100, 99: 103, 94: 104, 138: 141, 140: 240, 141: 241, 101: 243, 102: 244, 146: 246 },
        5: { 7: 95, 8: 124, 9: 113, 10: 115, 17: 96, 18: 128, 19: 118, 20: 120, 1: 97, 2: 132, 3: 159, 4: 161, 85: 220, 131: 220, 13: 98, 14: 136, 15: 164, 16: 166, 21: 99, 22: 140,
            23: 101, 24: 103, 94: 146, 138: 238, 139: 240, 141: 242, 100: 243, 102: 245, 104: 246 }
    };
    VX.changeAnimation = (prev, status) => (CHANGE_ANIMATION[status] && CHANGE_ANIMATION[status][prev] !== undefined ? CHANGE_ANIMATION[status][prev] : prev);

    // ---- VX Game_Enemy getters (Thrall's 019) ---------------------------------------------
    Game_Enemy.prototype.rrVxEnemy = function() { return VX.enemy(this._enemyId) || { maxhp: 1, maxmp: 0, atk: 0, def: 0, spi: 0, agi: 0, hit: 95, eva: 0, exp: 0, gold: 0, element_ranks: [], state_ranks: [], actions: [], drop_item1: { kind: 0 }, drop_item2: { kind: 0 } }; };
    /** The VX stats before the booster: maxhp, maxmp, atk, def, spi, agi (index 0..5). */
    Game_Enemy.prototype.rrVxEnemyStat = function(i) { const e = this.rrVxEnemy(); return [e.maxhp, e.maxmp, e.atk, e.def, e.spi, e.agi][i]; };
    Game_Enemy.prototype.rrVxBaseMaxhp = function() { return this.rrVxEnemyStat(0); };
    Game_Enemy.prototype.rrVxBaseMaxmp = function() { return this.rrVxEnemyStat(1); };
    Game_Enemy.prototype.rrVxBaseAtk = function() { return this.rrVxEnemyStat(2); };
    Game_Enemy.prototype.rrVxBaseDef = function() {
        let d = this.rrVxEnemyStat(3);
        if (String(this.originalName()).split(/ /).includes('Gargoyle')) d = idiv(d * this._hp, this.mhp || 1);
        return d;
    };
    Game_Enemy.prototype.rrVxBaseSpi = function() { return this.rrVxEnemyStat(4); };
    Game_Enemy.prototype.rrVxBaseAgi = function() { return this.rrVxEnemyStat(5); };
    Game_Enemy.prototype.rrVxHit = function() { return this.rrVxEnemy().hit; };
    Game_Enemy.prototype.rrVxEva = function() { return this.rrVxEnemy().eva; };
    Game_Enemy.prototype.rrVxCri = function() {
        let x = 5;
        if (this.rrVxEnemy().has_critical) x += 10;
        if (vars(91) === 4) x += 5;
        if (vars(92) === 4) x += 5;
        return x;
    };
    Game_Enemy.prototype.rrVxOdds = function() { return 1; };
    Game_Enemy.prototype.rrVxElementRate = function(elementId) {
        const rank = this.rrVxEnemy().element_ranks[elementId];
        let result = [0, 200, 150, 100, 50, 0, -100][rank] ?? 100;
        for (const state of this.rrVxStates()) {
            if (state.note.includes('<inverted>')) { if (state.element_set.includes(elementId)) result += 50; }
            else if (state.element_set.includes(elementId)) result -= 20;
        }
        return result;
    };
    Game_Enemy.prototype.rrVxStateProbability = function(stateId) {
        const st = VX.state(stateId);
        if (st && st.nonresistance) return 100;
        for (const state of this.rrVxStates()) if (state.note.includes('<inverted>') && state.state_set.includes(stateId)) return 100;
        const rank = this.rrVxEnemy().state_ranks[stateId];
        return [0, 100, 80, 60, 40, 20, 0][rank] ?? 0;
    };
    Game_Enemy.prototype.rrVxStateResist = function() { return false; };
    Game_Enemy.prototype.rrVxElementSet = function() { return []; };
    Game_Enemy.prototype.rrVxPlusStateSet = function() { return []; };
    Game_Enemy.prototype.rrVxPreventCritical = function() { return false; };
    Game_Enemy.prototype.rrVxHalfMpCost = function() { return false; };
    Game_Enemy.prototype.rrVxFastAttack = function() { return false; };
    Game_Enemy.prototype.rrVxDualAttack = function() { return false; };
    Game_Enemy.prototype.rrVxAutoHpRecover = function() { return false; };
    Game_Enemy.prototype.rrVxPharmacology = function() { return false; };
    Game_Enemy.prototype.rrVxCharacterName = function() { return this._rrCharacterName != null ? this._rrCharacterName : this.battlerName(); };
    Game_Enemy.prototype.rrVxSetCharacterName = function(name) { this._rrCharacterName = name; };
    Game_Enemy.prototype.rrVxExp = function() { return this.rrVxEnemy().exp; };
    Game_Enemy.prototype.rrVxGold = function() { return this.rrVxEnemy().gold; };
    Game_Enemy.prototype.rrVxWeaponNo = function() { return this._rrWeapon || 0; };
    Game_Enemy.prototype.rrVxSetWeaponNo = function(v) { this._rrWeapon = Number(v) || 0; };
    Game_Enemy.prototype.rrVxElementNo = function() { return this._rrElement || 0; };
    Game_Enemy.prototype.rrVxSetElementNo = function(v) { this._rrElement = v; };

    const _enemySetup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function(enemyId, x, y) {
        _enemySetup.call(this, enemyId, x, y);
        // VX: @hp = maxhp, @mp = maxmp at creation (the booster read then), the game's own fields.
        this._hp = this.mhp;
        this._mp = this.mmp;
        this._rrWeapon = 0;
        this._rrElement = 0;
        this._rrPain = vars(144);
        this._rrStatusMod = [0, 0, 0];
        this._rrCharacterName = null;
    };
    // VX's transform keeps HP and states; it changes the graphic and chooses the next action.
    Game_Enemy.prototype.transform = function(enemyId) {
        const name = this.originalName();
        this._enemyId = enemyId;
        if (this.originalName() !== name) { this._letter = ''; this._plural = false; }
        this.rrVxMakeAction();
    };

    // ---- Game_Battler (Thrall's 016) -------------------------------------------------------
    Game_BattlerBase.prototype.rrVxStates = function() { return this._states.map(id => VX.state(id)).filter(Boolean); };
    Game_BattlerBase.prototype.rrVxAddedStates = function() { return this.rrVxResult().addedStates.map(id => VX.state(id)).filter(Boolean); };
    Game_BattlerBase.prototype.rrVxRemovedStates = function() { return this.rrVxResult().removedStates.map(id => VX.state(id)).filter(Boolean); };
    Game_BattlerBase.prototype.rrVxRemainedStates = function() { return this.rrVxResult().remainedStates.map(id => VX.state(id)).filter(Boolean); };
    Game_BattlerBase.prototype.rrVxStatesActive = function() { const r = this.rrVxResult(); return r.addedStates.length > 0 || r.removedStates.length > 0 || r.remainedStates.length > 0; };
    Game_BattlerBase.prototype.rrVxMaxhpLimit = function() { return 999999; };
    Game_Actor.prototype.rrVxMaxhpLimit = function() { return 99999; };
    Game_BattlerBase.prototype.rrVxBaseMaxhp = function() { return this.paramBase(0) + this.paramPlus(0); };
    Game_BattlerBase.prototype.rrVxBaseMaxmp = function() { return this.paramBase(1) + this.paramPlus(1); };
    Game_BattlerBase.prototype.rrVxBaseAtk = function() { return this.paramBase(2) + this.paramPlus(2); };
    Game_BattlerBase.prototype.rrVxBaseDef = function() { return this.paramBase(3) + this.paramPlus(3); };
    Game_BattlerBase.prototype.rrVxBaseSpi = function() { return this.paramBase(4) + this.paramPlus(4); };
    Game_BattlerBase.prototype.rrVxBaseAgi = function() { return this.paramBase(6) + this.paramPlus(6); };
    /** VX's @maxhp_plus … @agi_plus live in MZ's _paramPlus (maxhp, maxmp, atk, def, spirit, agility). */
    const PLUS = [0, 1, 2, 3, 4, 6];
    Game_BattlerBase.prototype.rrVxPlus = function(i) { return this._paramPlus[PLUS[i]] || 0; };
    Game_BattlerBase.prototype.rrVxSetPlus = function(i, v) { this._paramPlus[PLUS[i]] = v; if (i === 4) this._paramPlus[5] = v; };

    Game_BattlerBase.prototype.rrVxMaxhp = function() {
        const base = Math.min(Math.max(this.rrVxBaseMaxhp() + this.rrVxPlus(0), 1), this.rrVxMaxhpLimit());
        let hp = base;
        if (this.isStateAffected(38)) hp = this.rrVxBaseMaxhp() * 3;
        if (this.isActor() && this.rrVxSkillLearn(101)) hp += idiv(base, 10);
        return hp;
    };
    Game_BattlerBase.prototype.rrVxMaxmp = function() { return Math.min(Math.max(this.rrVxBaseMaxmp() + this.rrVxPlus(1), 0), 9999); };
    const burstSpent = (b) => [62, 63, 64].filter(id => b.rrVxSkillLearn(id) && !b.rrVxSkillCanUse(VX.skill(id))).length;
    Game_BattlerBase.prototype.rrVxAtk = function() {
        let n = Math.min(Math.max(this.rrVxBaseAtk() + this.rrVxPlus(2), 1), 9999);
        let n1 = 0, n2 = 0;
        for (const state of this.rrVxStates()) {
            n2 += (n * state.atk_rate) / 100.0 - n;
            if (state.id === 3) n2 *= this.rrStatusMod()[1];
        }
        if (this.isActor()) {
            if (this.rrVxSkillLearn(88) && $gameParty.inBattle()) n1 += idiv(n, 10) * burstSpent(this);
            if (this.rrVxSkillLearn(163) && (this.isStateAffected(26) || this.isStateAffected(43))) n1 += idiv(n, 5);
            if (this.rrVxSkillLearn(132) && this.isStateAffected(7)) n1 += idiv(n, 2);
            if (this.rrVxSkillLearn(173)) n1 += idiv(n * this.rrVxOverkill(), 50);
        }
        n = n + n1 + n2;
        return Math.min(Math.max(trunc(n), 1), 9999);
    };
    Game_BattlerBase.prototype.rrVxDef = function() {
        let n = Math.min(Math.max(this.rrVxBaseDef() + this.rrVxPlus(3), 1), 9999);
        let n1 = 0, n2 = 0;
        for (const state of this.rrVxStates()) n2 += (n * state.def_rate) / 100.0 - n;
        if (this.isActor()) {
            if (this.rrVxSkillLearn(107) && this._hp === this.mhp) n1 += idiv(n * 2, 5);
            if (this.rrVxSkillLearn(169) && (this.isStateAffected(26) || this.isStateAffected(43))) n1 += idiv(n, 5);
        }
        n = n + n1 + n2;
        if (this.isStateAffected(15)) n = 9999;
        return Math.min(Math.max(trunc(n), 1), 9999);
    };
    Game_BattlerBase.prototype.rrVxSpi = function() {
        let n = Math.min(Math.max(this.rrVxBaseSpi() + this.rrVxPlus(4), 1), 9999);
        let n1 = 0, n2 = 0;
        for (const state of this.rrVxStates()) n2 += (n * state.spi_rate) / 100.0 - n;
        if (this.isActor() && this.rrVxSkillLearn(83) && $gameParty.inBattle()) n1 += idiv(n, 10) * burstSpent(this);
        n = n + n1 + n2;
        return Math.min(Math.max(trunc(n), 1), 9999);
    };
    Game_BattlerBase.prototype.rrVxAgi = function() {
        let n = Math.min(Math.max(this.rrVxBaseAgi() + this.rrVxPlus(5), 1), 9999);
        let n1 = 0;
        for (const state of this.rrVxStates()) {
            n1 += (n * state.agi_rate) / 100.0 - n;
            if (state.id === 3) n1 *= this.rrStatusMod()[1];
        }
        n += n1;
        return Math.min(Math.max(trunc(n), 1), 9999);
    };
    // MZ's parameters are VX's: max HP, max MP, attack, defence, spirit (both magic stats), agility.
    const _param = Game_BattlerBase.prototype.param;
    Game_BattlerBase.prototype.param = function(paramId) {
        if (this._rrParamGuard) return _param.call(this, paramId);
        this._rrParamGuard = true;
        try {
            switch (paramId) {
                case 0: return this.rrVxMaxhp();
                case 1: return this.rrVxMaxmp();
                case 2: return this.rrVxAtk();
                case 3: return this.rrVxDef();
                case 4: case 5: return this.rrVxSpi();
                case 6: return this.rrVxAgi();
                default: return _param.call(this, paramId);
            }
        } finally { this._rrParamGuard = false; }
    };
    // VX's setters change what was added on top: maxhp= adds the difference to @maxhp_plus.
    const PLUS_LIMIT = [99999, 9999, 9999, 9999, 9999, 9999];
    const GETTER = ['rrVxMaxhp', 'rrVxMaxmp', 'rrVxAtk', 'rrVxDef', 'rrVxSpi', 'rrVxAgi'];
    Game_BattlerBase.prototype.rrVxSetParam = function(i, value) {
        const plus = this.rrVxPlus(i) + value - this[GETTER[i]]();
        this.rrVxSetPlus(i, Math.min(Math.max(plus, -PLUS_LIMIT[i]), PLUS_LIMIT[i]));
        if (i === 0) this._hp = Math.min(this._hp, this.mhp);
        if (i === 1) this._mp = Math.min(this._mp, this.mmp);
    };
    Game_BattlerBase.prototype.addParam = function(paramId, value) {
        const i = PLUS.indexOf(paramId === 5 ? 4 : paramId);
        if (i < 0) { this._paramPlus[paramId] += value; return; }
        this.rrVxSetPlus(i, this.rrVxPlus(i) + value);
        this.refresh();
    };

    // hp= : 0 HP adds incapacitation unless immortal; HP above 0 lifts it.
    Game_BattlerBase.prototype.setHp = function(hp) {
        const r = this.rrVxResult();
        this._hp = Math.max(Math.min(Math.round(hp), this.mhp), 0);
        if (this._hp === 0 && !this.isStateAffected(1) && !this._rrImmortal) {
            this.addState(1);
            r.addedStates.push(1);
        } else if (this._hp > 0 && this.isStateAffected(1)) {
            this.removeState(1);
            r.removedStates.push(1);
        }
    };
    Game_BattlerBase.prototype.setMp = function(mp) {
        this._mp = Math.max(Math.min(Math.round(mp), this.mmp), 0);
    };
    // VX has no automatic incapacitation on refresh; HP and MP stay where the scripts left them.
    Game_Battler.prototype.refresh = function() {
        this._mp = Math.max(Math.min(this._mp, this.mmp), 0);
        this._tp = Math.max(Math.min(this._tp, this.maxTp()), 0);
    };
    // recover_all sets HP from the max HP the states give (Grow) before it lifts them, as VX does.
    Game_BattlerBase.prototype.recoverAll = function() {
        this._hp = this.mhp;
        this._mp = this.mmp;
        this._rrStatusMod = [0, 0, 0];
        if (!this.isActor()) this._rrPain = vars(144);
        for (const id of this._states.slice()) this.removeState(id);
    };
    Game_BattlerBase.prototype.isDead = function() { return !this._hidden && this._hp === 0 && !this._rrImmortal; };
    Game_BattlerBase.prototype.isAlive = function() { return !this._hidden && !this.isDead(); };
    Game_BattlerBase.prototype.rrVxInputable = function() { return !this._hidden && this.restriction() <= 1; };
    Game_BattlerBase.prototype.rrVxMovable = function() { return !this._hidden && this.restriction() < 4; };
    Game_BattlerBase.prototype.rrVxParriable = function() { return !this._hidden && this.restriction() < 5; };
    Game_BattlerBase.prototype.rrVxSilent = function() { return !this._hidden && this.restriction() === 1; };
    Game_BattlerBase.prototype.rrVxBerserker = function() { return !this._hidden && this.restriction() === 2; };
    Game_BattlerBase.prototype.rrVxConfusion = function() {
        if (this.isActor() && this.rrVxSkillLearn(189)) return false;
        return !this._hidden && this.restriction() === 3;
    };
    Game_BattlerBase.prototype.canMove = function() { return this.rrVxMovable(); };
    Game_BattlerBase.prototype.restriction = function() {
        let max = 0;
        for (const s of this.rrVxStates()) if (s.restriction >= max) max = s.restriction;
        return max;
    };
    Game_BattlerBase.prototype.isConfused = function() { return this.rrVxConfusion() || this.rrVxBerserker(); };
    Game_BattlerBase.prototype.rrVxGuarding = function() {
        if (!this.isActor()) return !!this._rrGuarded;
        let dead = 0;
        for (const m of $gameParty.members()) {
            if (m === this) continue;
            if (m.isDead() || m.isStateAffected(7) || m.isStateAffected(13)) dead++;
        }
        if (dead >= $gameParty.members().length - 1) return false;
        return !!this._rrGuarded;
    };
    Game_BattlerBase.prototype.isGuard = function() { return this.rrVxGuarding(); };

    Game_BattlerBase.prototype.rrVxStateIgnore = function(stateId) {
        const target = VX.state(stateId);
        for (const state of this.rrVxStates()) {
            if (state.note.includes('<inverted>')) continue;
            if (state.state_set.includes(stateId) && !(target && target.state_set.includes(state.id))) return true;
        }
        return false;
    };
    Game_BattlerBase.prototype.rrVxStateOffset = function(stateId) {
        const target = VX.state(stateId);
        if (!target || !target.offset_by_opposite) return false;
        // Thrall reads `i.note` of a state id here (an Integer has no note): the original raises when this
        // runs; no state the game ships is offset by its opposite, so the check never reaches it.
        for (const id of this._states) { const s = VX.state(id); if (s && !s.note.includes('<inverted>') && target.state_set.includes(id)) return true; }
        return false;
    };
    Game_BattlerBase.prototype.rrVxSortStates = function() {
        this._states.sort((a, b) => {
            const sa = VX.state(a), sb = VX.state(b);
            const pa = sa ? sa.priority : 0, pb = sb ? sb.priority : 0;
            return pa !== pb ? pb - pa : a - b;
        });
    };
    const emit = (name, data) => { if (typeof ReactorEvents !== 'undefined' && ReactorEvents.emit) ReactorEvents.emit(name, data); };
    /** VX add_state with Thrall's stacks (Burn 5, Freeze 3; Impervious 1) and Sanctity. */
    Game_Battler.prototype.addState = function(stateId) {
        const state = VX.state(stateId);
        if (!state || !$dataStates[stateId]) return;
        if (stateId === 45) return;
        if (this.rrVxStateIgnore(stateId)) return;
        if (!this.isStateAffected(stateId)) {
            if (!this.rrVxStateOffset(stateId)) this._states.push(stateId);
            if (stateId === 1) this._hp = 0;
            if (!this.rrVxInputable()) this.rrVxAction().clear();
            for (const i of state.state_set) {
                this.removeState(i);
                const rm = this.rrVxResult().removedStates;
                const at = rm.indexOf(i);
                if (at >= 0) rm.splice(at, 1);
            }
            this.rrVxSortStates();
            emit('stateAdded', { battler: this, stateId, renewed: false });
        }
        let check = true;
        const mod = this.rrStatusMod();
        if (stateId === 2 || stateId === 3) {
            let maxStack = stateId === 2 ? 5 : 3;
            if (this.isActor() && this.rrVxSkillLearn(94)) maxStack = 1;
            const k = stateId === 2 ? 0 : 1;
            const before = Math.min(mod[k], maxStack);
            mod[k] = Math.min(mod[k] + 1, maxStack);
            if (before === mod[k]) check = false;
        }
        let turn = state.hold_turn;
        if (this.isActor()) for (const armor of this.rrVxArmors().filter(Boolean)) if (firstWord(armor) === 'Sanctity' && state.hold_turn !== 0) turn += 5;
        if (check) this._stateTurns[stateId] = Math.max(turn, 0);
    };
    Game_Battler.prototype.removeState = function(stateId) {
        if (!this.isStateAffected(stateId)) return;
        if (stateId === 1 && this._hp === 0) this._hp = 1;
        const mod = this.rrStatusMod();
        if (stateId === 2) mod[0] = 0; else if (stateId === 3) mod[1] = 0; else if (stateId === 5) mod[2] = 0;
        this._states.splice(this._states.indexOf(stateId), 1);
        delete this._stateTurns[stateId];
        emit('stateRemoved', { battler: this, stateId });
    };
    Game_Battler.prototype.rrVxRemoveStatesBattle = function() {
        for (const state of this.rrVxStates()) if (state.battle_only) this.removeState(state.id);
    };
    Game_Battler.prototype.rrVxRemoveStatesAuto = function() {
        this.rrVxClearActionResults();
        for (const key of Object.keys(this._stateTurns)) {
            const i = Number(key);
            if (this._stateTurns[i] > 0) this._stateTurns[i] -= 1;
            else if (rand(100) < (VX.state(i) ? VX.state(i).auto_release_prob : 0)) {
                this.removeState(i);
                this.rrVxResult().removedStates.push(i);
            }
        }
    };
    Game_BattlerBase.prototype.rrVxSlipDamage = function() { return this.rrVxStates().some(s => s.slip_damage); };
    Game_BattlerBase.prototype.rrVxReduceHitRatio = function() { return this.rrVxStates().some(s => s.reduce_hit_ratio); };
    Game_BattlerBase.prototype.rrVxMostImportantStateText = function() {
        for (const s of this.rrVxStates()) { const m = $dataStates[s.id]; if (m && m.message3) return m.message3; }
        return '';
    };

    // Skill costs (SBS: CONSUMEHP, %COSTMAX, %COSTNOW, NOHALFMPCOST).
    const ext = (obj) => (obj && typeof obj.extension === 'function' ? obj.extension() : ['NONE']);
    VX.ext = ext;
    Game_BattlerBase.prototype.rrVxCalcMpCost = function(skill) {
        if (!skill) return 0;
        const e = ext(skill);
        const cost = this.rrVxHalfMpCost() && !e.includes('NOHALFMPCOST') ? idiv(skill.mp_cost, 2) : skill.mp_cost;
        if (e.includes('%COSTMAX')) return e.includes('CONSUMEHP') ? idiv(this.mhp * cost, 100) : idiv(this.mmp * cost, 100);
        if (e.includes('%COSTNOW')) {
            if (e.includes('CONSUMEHP')) return idiv(this._hp * cost, 100);
            return this._mp !== 0 ? idiv(this._mp * cost, 100) : 0;
        }
        return cost;
    };
    Game_BattlerBase.prototype.rrVxHalfMpCost = function() { return false; };
    /**
     * VX skill_can_use? as SBS leaves it (with the overdrive check the overdrive port adds). SBS redefines
     * Game_Actor's to call only Game_Battler's, so a skill the actor has not learned passes too.
     */
    Game_BattlerBase.prototype.rrVxSkillCanUse = function(skill) {
        if (!skill || !skill.isSkill || !skill.isSkill()) return false;
        if (!this.rrVxMovable()) return false;
        if (this.rrVxSilent() && skill.spi_f > 0) return false;
        if (ext(skill).includes('CONSUMEHP')) { if (this.rrVxCalcMpCost(skill) > this._hp) return false; }
        else if (this.rrVxCalcMpCost(skill) > this._mp) return false;
        if (!this.rrVxSkillCanUseExtra(skill)) return false;
        return $gameParty.inBattle() ? skill.battleOk() : skill.menuOk();
    };
    Game_BattlerBase.prototype.rrVxSkillCanUseExtra = function(/* skill */) { return true; };
    Game_BattlerBase.prototype.rrVxConsumSkillCost = function(skill) {
        if (!this.rrVxSkillCanUse(skill)) return false;
        const cost = this.rrVxCalcMpCost(skill);
        if (ext(skill).includes('CONSUMEHP')) this.setHp(this.hp - cost); else this.setMp(this.mp - cost);
        return true;
    };

    // ---- hit, evasion, criticals -------------------------------------------------------------
    Game_BattlerBase.prototype.rrVxCalcHit = function(user, obj) {
        let hit;
        if (!obj) hit = user.rrVxHit();
        else if (obj.isSkill()) { hit = obj.hit; if (obj.physical_attack) hit = idiv(user.rrVxHit() * obj.hit, 100); }
        else hit = 100;
        return Math.max(hit, 0);
    };
    Game_BattlerBase.prototype.rrVxCalcEva = function(user, obj) {
        let eva = this.rrVxEva();
        if (obj && !obj.physical_attack) eva = 0;
        if (!this.rrVxParriable()) eva = 0;
        if (this.isStateAffected(37)) eva = 100;
        return eva;
    };
    Game_BattlerBase.prototype.rrVxIsCritical = function(attacker, skill) {
        const r = this.rrVxResult();
        if (this.isActor()) {
            let crit = attacker.rrVxCri();
            r.critical = true;
            for (const armor of this.rrVxArmors().filter(Boolean)) if (firstWord(armor) === 'Mantle') r.critical = false;
            if (skill && [43, 44, 45].includes(skill.id) && skill.isSkill()) crit += 15;
            if (r.critical) r.critical = rand(100) < crit;
        } else {
            let crit = attacker.rrVxCri();
            if (attacker.rrVxSkillLearn(150) && idiv(this.mhp, 5) > this._hp) crit += 20;
            if (attacker.rrVxSkillLearn(156) && this.isStateAffected(5)) crit += 20;
            if (attacker.rrVxSkillLearn(87) && (this.isStateAffected(2) || this.isStateAffected(3) || this.isStateAffected(4))) crit += 10;
            if (skill && skill.isSkill()) {
                if ([43, 44, 45].includes(skill.id)) crit += 15;
                if (skill.id === 224) { crit += 5; if (attacker.rrVxSkillLearn(135)) crit += 10; }
            }
            r.critical = rand(100) < crit;
            if (r.critical && ![49, 50].includes(this._enemyId)) $gameVariables.setValue(177, vars(177) + 1);
        }
    };
    Game_BattlerBase.prototype.rrVxCriticalDamage = function(attacker, damage) {
        if (attacker.isActor()) {
            let critDmg = 0;
            if (attacker.rrVxOverkill() > 0 && attacker.rrVxSkillLearn(142)) {
                if (attacker.rrVxSkillLearn(151)) attacker.rrVxSetOverkill(attacker.rrVxOverkill() * 2);
            }
            for (const weapon of attacker.rrVxWeapons().filter(Boolean)) {
                critDmg += weapon.critical_bonus ? damage * 4 : damage * 3;
                if (firstWord(weapon) === 'Gargoyle') critDmg += damage * this.rrVxDeadEnemyCount();
                if (this.isStateAffected(6)) critDmg += damage;
                if (attacker.isStateAffected(14)) critDmg += damage;
                if (attacker.rrVxSkillLearn(146) && attacker.isStateAffected(7)) critDmg += rdiv(damage, 2);
                return critDmg;
            }
            // Ruby falls off the end of the loop here and returns the (empty) weapons array: a critical
            // with no weapon deals the array. Thrall's actors always hold a weapon; 0 stands in.
            return 0;
        }
        let mod = 1;
        if (this.isActor()) for (const armor of this.rrVxArmors().filter(Boolean)) if (armor.prevent_critical) mod -= 0.15;
        if (mod < 0.1) mod = 0.1;
        const d = damage * 2 * mod;
        const less = damage * 2 - trunc(d);
        $gameVariables.setValue(172, vars(172) + less);
        return trunc(d);
    };
    Game_BattlerBase.prototype.rrVxDeadEnemyCount = function() { return $gameTroop.members().filter(m => m.isDead()).length; };

    // ---- named weapons and passives ------------------------------------------------------------
    Game_BattlerBase.prototype.rrVxNamedWeaponDamage = function(attacker, damage) {
        const r = this.rrVxResult();
        const mod = this.rrStatusMod();
        for (const weapon of attacker.rrVxWeapons().filter(Boolean)) {
            switch (firstWord(weapon)) {
                case 'Devil': {
                    const temp = rdiv(damage * 5, 2);
                    if (attacker._hp !== 0) damage = rdiv(damage * idiv(attacker.mhp, 2), attacker._hp);
                    if (damage > temp) damage = temp;
                    break;
                }
                case 'Mars': if (this.isStateAffected(2)) { damage += rdiv(damage, 3) * mod[0]; this.removeState(2); } break;
                case 'Neptune': if (this.isStateAffected(3)) { damage += rdiv(damage, 2) * mod[1]; this.removeState(3); } break;
                case 'Reactor': damage = attacker.rrOverdrive() !== attacker.rrMaxOverdrive() ? rdiv(damage, 2) : rdiv(damage * 3, 2); break;
                case 'Nihilism': {
                    const temp = damage * 2;
                    let nihil = attacker.rrOverdrive();
                    if (nihil === 0) nihil = 1;
                    damage = rdiv(damage * idiv(attacker.rrMaxOverdrive(), 2), nihil);
                    if (damage > temp) damage = temp;
                    break;
                }
                case 'Leviathan': damage = this.isStateAffected(3) ? rdiv(damage * 3, 2) : rdiv(damage, 2); break;
                case 'Helios': {
                    let mult = 0;
                    for (const m of $gameTroop.members()) mult += m.rrStatusMod()[0];
                    damage = rdiv(damage * mult, 4) + rdiv(damage, 2);
                    break;
                }
                case 'Judgement': {
                    let t = 1;
                    for (const m of $gameParty.members()) if (m.isDead()) t *= 2;
                    damage = damage * t;
                    break;
                }
                case 'Pluto': if (this.isStateAffected(5)) { r.critical = rand(100) < attacker.rrVxCri() + 50; if (this.rrVxPreventCritical()) r.critical = false; } break;
                case 'Saitama': if (this._hp === this.mhp) { r.critical = true; if (this.rrVxPreventCritical()) r.critical = false; } break;
                case 'Gloria': {
                    const count = [2, 3, 4, 5].filter(s => this.isStateAffected(s)).length;
                    if (count >= 2) damage += rdiv(damage * 3, 10);
                    break;
                }
            }
        }
        return damage;
    };
    Game_BattlerBase.prototype.rrVxNamedWeaponPostEffect = function(attacker, damage) {
        if (attacker.isStateAffected(23) && damage > 0) attacker.setHp(attacker.hp + rdiv(damage, 10));
        for (const weapon of attacker.rrVxWeapons().filter(Boolean)) {
            switch (firstWord(weapon)) {
                case 'Reaper': if (damage > 0) attacker.setHp(attacker.hp - rdiv(damage, 20)); break;
                case 'Angel': if (damage > 0) attacker.setHp(attacker.hp + rdiv(damage, 20)); break;
                case 'Conductor': if (damage > 0) { attacker.rrSetOverdrive(attacker.rrOverdrive() + idiv(this.rrOverdrive(), 2)); this.rrSetOverdrive(idiv(this.rrOverdrive(), 2)); } break;
                case 'Seraph': damage = -1 * idiv(this.mhp, 10); this.rrVxResult().critical = false; break;
            }
        }
        return damage;
    };
    Game_BattlerBase.prototype.rrVxCalcOverkill = function(attacker, damage) {
        if (attacker.rrVxOverkill() > 0 && attacker.rrVxSkillLearn(142) && damage > 0) {
            damage += attacker.rrVxOverkill();
            attacker.rrVxSetOverkill(0);
        }
        if (this._hp - damage <= 0 && attacker.rrVxSkillLearn(142) && attacker.isStateAffected(7)) attacker.rrVxSetOverkill(-1 * (this._hp - damage));
        if (attacker.isStateAffected(7)) {
            if (attacker.rrVxSkillLearn(138) && damage > 0) attacker.setHp(attacker.hp + rdiv(damage, 10));
            if (attacker.rrVxSkillLearn(157) && this._hp - damage <= 0 && attacker.rrClearSkillRecharge) attacker.rrClearSkillRecharge(127);
            attacker.removeState(7);
            if (attacker.rrVxSkillLearn(147)) attacker.addState(13);
        }
        return damage;
    };
    Game_BattlerBase.prototype.rrVxCalcSkillAdjustments = function(attacker, damage) {
        let skillDamage = 0;
        if (attacker.rrVxSkillLearn(144) && this._hp === this.mhp) skillDamage += rdiv(damage, 5);
        if (attacker.rrVxSkillLearn(80) && this.isStateAffected(3)) skillDamage += rdiv(damage, 5);
        return damage + skillDamage;
    };
    Game_BattlerBase.prototype.rrVxApplyThornsDamage = function(attacker, damage) {
        let thorns = 0;
        const lead = $gameActors.actor(1);
        if (lead && lead.rrVxSkillLearn(115) && this.isStateAffected(20)) thorns += rdiv(damage, 10);
        if (this.rrVxSkillLearn(170) && (this.isStateAffected(26) || this.isStateAffected(43))) thorns += rdiv(damage, 10);
        if (this.rrVxSkillLearn(171) && this.rrVxSkillLearn(160) && !this.rrVxSkillCanUse(VX.skill(160))) thorns += rdiv(damage, 10);
        if (this.isStateAffected(40)) thorns += rdiv(damage, 10);
        for (const w of this.rrVxWeapons().filter(Boolean)) if (w.element_set.includes(26)) thorns += this.rrVxBaseAtk();
        for (const a of this.rrVxArmors().filter(Boolean)) {
            if (a.note.includes('THORNS')) { thorns += rdiv(damage, 10); if (firstWord(a) === 'Prince') thorns = rdiv(thorns * 3, 2); }
        }
        attacker.setHp(attacker.hp - thorns);
        $gameVariables.setValue(171, vars(171) + thorns);
    };
    /** elements_max_rate: weapon types (1-5) and rarities (9-17) are deleted from the very array passed. */
    Game_BattlerBase.prototype.rrVxElementsMaxRate = function(elementSet) {
        for (let i = 1; i <= 5; i++) { const at = elementSet.indexOf(i); if (at >= 0) elementSet.splice(at, 1); }
        for (let i = 9; i <= 17; i++) { const at = elementSet.indexOf(i); if (at >= 0) elementSet.splice(at, 1); }
        if (!elementSet.length) return 100;
        return Math.max(...elementSet.map(e => this.rrVxElementRate(e)));
    };
    Game_BattlerBase.prototype.rrVxCalcElementalWeaponRate = function(attacker, damage, obj) {
        let ele = attacker.rrVxElementSet();
        if (obj) ele = ele.concat(obj.element_set);
        if (attacker.rrVxSkillLearn(86)) {
            if (this.rrVxElementsMaxRate(ele) >= 100) {
                if (this.rrVxElementsMaxRate(ele) > 100 && attacker.rrVxSkillLearn(92)) damage *= this.rrVxElementsMaxRate(ele) + 50;
                else damage *= this.rrVxElementsMaxRate(ele);
                damage = rdiv(damage, 100);
            }
        } else {
            damage *= this.rrVxElementsMaxRate(ele);
            damage = rdiv(damage, 100);
        }
        return damage;
    };
    Game_BattlerBase.prototype.rrVxApplyVariance = function(damage, variance) {
        if (damage !== 0) {
            const amp = Math.max(rdiv(Math.abs(damage) * variance, 100), 0);
            const a = trunc(amp);
            damage += rand(a + 1) + rand(a + 1) - amp;
        }
        return damage;
    };
    const seizeChain = (target, attacker, damage, unit) => {
        for (const m of unit) if (m !== target && m.isStateAffected(4)) m.setHp(m.hp - damage);
    };

    /** make_attack_damage_value (with SBS's two-weapon share) → @hp_damage. */
    Game_BattlerBase.prototype.rrVxMakeAttackDamageValue = function(attacker) {
        const r = this.rrVxResult();
        let damage;
        if (attacker.isActor()) {
            for (const weapon of attacker.rrVxWeapons().filter(Boolean)) {
                const baseAtk = attacker.rrVxBaseAtk();
                const def = this.def;
                const pen = attacker.rrVxSkillLearn(104);
                const es = attacker.rrVxElementSet();
                if (firstWord(weapon) === 'Ephraim') {
                    damage = attacker.atk * 4 / ((pen && es.includes(29) ? def / 4 : def / 2) / baseAtk + 1);
                } else if (pen && (es.includes(3) || es.includes(29))) {
                    damage = attacker.atk * 4 / ((def / 2) / baseAtk + 1);
                } else {
                    damage = attacker.atk * 4 / (def / baseAtk + 1);
                }
                if (es.includes(31) && MINIONS.includes(this._enemyId)) damage += damage / 2;
            }
        } else {
            damage = attacker.atk * 4 / (this.def / attacker.rrVxBaseAtk() + 1);
        }
        // An unarmed actor never sets the damage: Ruby's nil.to_i is 0.
        damage = trunc(damage || 0);
        if (damage < 0) damage = 0;
        if (attacker.isActor()) damage = this.rrVxCalcElementalWeaponRate(attacker, damage, null);
        else { damage *= this.rrVxElementsMaxRate(attacker.rrVxElementSet()); damage = rdiv(damage, 100); }
        if (damage > 0) {
            this.rrVxIsCritical(attacker, null);
            if (attacker.isActor()) {
                damage = this.rrVxNamedWeaponDamage(attacker, damage);
                if (r.critical) damage = this.rrVxCriticalDamage(attacker, damage);
                if (attacker.rrVxSkillLearn(139) && r.critical) attacker.addState(11);
                if (attacker.rrVxSkillLearn(136) && r.critical) attacker.rrSetOverdrive(attacker.rrOverdrive() + idiv(attacker.rrMaxOverdrive(), 20));
                damage = this.rrVxCalcSkillAdjustments(attacker, damage);
                damage = this.rrVxApplyVariance(damage, 20);
                if (attacker.rrVxElementSet().includes(8) && !this.isActor()) {
                    let chain = rdiv(damage, 5);
                    for (const w of attacker.rrVxWeapons().filter(Boolean)) if (firstWord(w) === 'Jupiter') chain *= 2;
                    seizeChain(this, attacker, chain, $gameTroop.members());
                }
            } else {
                if (r.critical) damage = this.rrVxCriticalDamage(attacker, damage);
                damage = this.rrVxApplyVariance(damage, 20);
                this.rrVxApplyThornsDamage(attacker, damage);
            }
        }
        if (this.isStateAffected(5)) damage = rdiv(damage * 3, 2);
        if (attacker.isActor()) {
            damage = this.rrVxNamedWeaponPostEffect(attacker, damage);
            if (!r.evaded && !r.missed) damage = this.rrVxCalcOverkill(attacker, damage);
            attacker.removeState(23); attacker.removeState(24); attacker.removeState(28);
            if (!attacker.rrVxAutoBattle() && attacker.rrVxSkillLearn(183)) attacker.addState(29);
            attacker._rrTempWeapon = attacker.rrVxWeaponId();
        } else if (this.rrVxSkillLearn(187) && this.rrVxSkillLearn(160) && !this.rrVxSkillCanUse(VX.skill(160))) {
            if (rand(100) < 5) damage = 0;
        }
        if (this.isStateAffected(44)) damage = 0;
        if (this._rrPain > 0 && damage > 0) { damage = 0; this._rrPain -= 1; }
        if (damage > vars(167) && r.critical && attacker.isActor()) $gameVariables.setValue(167, damage);
        r.hpDamage = damage;
        this.rrVxAfterAttackDamageValue(attacker);
    };
    /** SBS: two weapons deal TWO_SWORDS_STYLE[0]% of an attack (the sideview port sets the share). */
    Game_BattlerBase.prototype.rrVxAfterAttackDamageValue = function(attacker) {
        if (!attacker.isActor()) return;
        const w = attacker.rrVxWeapons();
        if (!w[0] || !w[1]) return;
        const r = this.rrVxResult();
        r.hpDamage = rdiv(r.hpDamage * (VX.TWO_SWORDS_STYLE ? VX.TWO_SWORDS_STYLE[0] : 50), 100);
    };
    VX.critSkill = (obj) => /<crit skill>/i.test(obj.note || '');
    Game_BattlerBase.prototype.rrVxCalcDefense = function(user, obj, damage) {
        const ephraim = () => user.rrVxWeapons().filter(Boolean).map(w => firstWord(w) === 'Ephraim');
        const pen = user.isActor() && user.rrVxSkillLearn(104);
        const penElem = user.rrVxElementSet().includes(3) || user.rrVxElementSet().includes(29);
        if (obj.atk_f > 0) {
            const share = (user.rrVxBaseAtk() * (obj.atk_f * obj.base_damage)) / 100;
            if (obj.physical_attack && user.isActor()) {
                if (pen) { if (penElem) damage /= (this.def / 2) / share + 1; }
                else for (const isEph of ephraim()) damage /= (isEph ? this.def / 2 : this.def) / share + 1;
            } else damage /= this.def / share + 1;
        }
        if (obj.spi_f > 1) {
            const share = (user.rrVxBaseSpi() * obj.spi_f) / 100;
            if (obj.physical_attack && user.isActor()) {
                if (pen) { if (penElem) damage /= (this.mat / 2) / share + 1; }
                else for (const isEph of ephraim()) damage /= (isEph ? this.mat / 2 : this.mat) / share + 1;
            } else damage /= this.mat / share + 1;
        }
        return damage;
    };
    /** make_obj_damage_value (+ SBS two weapons, + overdrive's consume-all, added by those ports). */
    Game_BattlerBase.prototype.rrVxMakeObjDamageValue = function(user, obj) {
        const r = this.rrVxResult();
        let damage = obj.base_damage;
        if (damage > 0) {
            damage += user.atk * 4 * (obj.atk_f * obj.base_damage) / 100;
            damage += user.mat * 4 * obj.spi_f / 100;
            if (!obj.ignore_defense) damage = this.rrVxCalcDefense(user, obj, damage);
            if (damage < 0) damage = 0;
        } else if (damage < 0) {
            damage = this.rrVxCalcDefense(user, obj, damage);
        }
        damage = trunc(damage);
        if (user.isActor() && obj.physical_attack) {
            damage = this.rrVxCalcElementalWeaponRate(user, damage, obj);
            if (VX.critSkill(obj)) this.rrVxIsCritical(user, obj); else r.critical = false;
            damage = this.rrVxNamedWeaponDamage(user, damage);
            if (r.critical) damage = this.rrVxCriticalDamage(user, damage);
            if (user.rrVxSkillLearn(139) && r.critical) user.addState(11);
            if (user.rrVxSkillLearn(136) && r.critical) user.rrSetOverdrive(user.rrOverdrive() + idiv(user.rrMaxOverdrive(), 20));
            damage = this.rrVxCalcSkillAdjustments(user, damage);
            damage = this.rrVxApplyVariance(damage, obj.variance);
            if (user.rrVxElementSet().includes(8) && !this.isActor()) {
                let chain = rdiv(damage, 5);
                for (const w of user.rrVxWeapons().filter(Boolean)) if (firstWord(w) === 'Jupiter') chain *= 2;
                seizeChain(this, user, chain, $gameTroop.members());
            }
            damage = this.rrVxNamedWeaponPostEffect(user, damage);
            if (!r.evaded && !r.missed) damage = this.rrVxCalcOverkill(user, damage);
        } else {
            damage *= this.rrVxElementsMaxRate(obj.element_set);
            damage = rdiv(damage, 100);
            if (VX.critSkill(obj)) { this.rrVxIsCritical(user, obj); if (r.critical) damage = this.rrVxCriticalDamage(user, damage); }
            else r.critical = false;
            damage = this.rrVxApplyVariance(damage, obj.variance);
            if (obj.element_set.includes(8)) seizeChain(this, user, rdiv(damage, 5), this.isActor() ? $gameParty.members() : $gameTroop.members());
        }
        if (this.isStateAffected(5)) damage = rdiv(damage * 3, 2);
        if (this.isActor() && !user.isActor()) {
            if (obj.physical_attack) this.rrVxApplyThornsDamage(user, damage);
            for (const armor of this.rrVxArmors().filter(Boolean)) {
                const w = firstWord(armor);
                if (w === 'Mirror') armor.element_set = [9].concat(obj.element_set);
                if (w === 'Spite' && !obj.physical_attack) this.rrVxApplyThornsDamage(user, rdiv(damage, 2));
            }
            if (this.rrVxSkillLearn(187) && this.rrVxSkillLearn(160) && !this.rrVxSkillCanUse(VX.skill(160)) && rand(100) < 5) damage = 0;
        } else if (user.isActor()) {
            if (obj.isItem() && damage > 0) {
                let temp = damage;
                for (const w of user.rrVxWeapons().filter(Boolean)) {
                    if (firstWord(w) === 'Demolisher') temp += damage;
                    if (w.element_set.includes(34)) temp += damage;
                }
                damage = temp;
            }
            if (obj.isSkill() && [62, 63, 64].includes(obj.id) && user.rrVxSkillLearn(68)) damage += rdiv(damage, 5);
            if (obj.isSkill() && obj.id === 96) {
                let temp = damage;
                if (user.rrVxSkillLearn(102) && MINIONS.includes(this._enemyId)) temp += rdiv(damage, 5) * 2;
                if (user.rrVxSkillLearn(122) && user.isStateAffected(20)) temp += rdiv(damage, 5);
                damage = temp;
            }
            if (obj.isSkill() && obj.id === 95 && user.rrVxSkillLearn(110)) damage = -1 * idiv(this.mhp * 3, 10);
            if (obj.isSkill() && obj.id === 128) {
                if (user.rrVxSkillLearn(158)) damage = rdiv(damage, 4) * 3;
                if (user.rrVxSkillLearn(140) && this.isStateAffected(5)) damage += rdiv(damage, 5) * 2;
                if (user.rrVxSkillLearn(149)) { this.rrVxIsCritical(user, obj); if (r.critical) damage = this.rrVxCriticalDamage(user, damage); }
            }
            if (obj.isSkill() && obj.id === 160) {
                if (user.rrVxSkillLearn(175)) {
                    for (const m of $gameParty.members().filter(x => x.isAlive())) {
                        if (m === user && !user.rrVxSkillLearn(186)) continue;
                        m.addState(9);
                    }
                }
                if (user.rrVxSkillLearn(166)) damage += rdiv(damage, 5);
                let s = Math.max($gameTroop.members().filter(x => x.isAlive()).length, 1);
                if (user.rrVxSkillLearn(190) && s > 1) {
                    s = (s - 1.0) / 2.0 + 1.0;
                    damage = trunc(damage / s);
                } else damage = rdiv(damage, s);
            }
            if (user.isStateAffected(7)) {
                let lift = true;
                if (obj.isItem() && user.rrVxSkillLearn(153)) lift = false;
                if (obj.isSkill() && obj.id === 128 && user.rrVxSkillLearn(143)) lift = false;
                if (lift) { user.removeState(7); if (user.rrVxSkillLearn(147)) user.addState(13); }
            }
        }
        if (this.isStateAffected(44)) damage = 0;
        if (this._rrPain > 0 && damage > 0) { damage = 0; this._rrPain -= 1; }
        if (obj.isSkill()) {
            if (obj.id === 211 || obj.id === 16) user.setHp(1);
            if (obj.id === 233 || obj.id === 237) user.setHp(0);
            if (obj.id === 212) $gameVariables.setValue(99, vars(99) + 1);
        }
        if (damage > vars(167) && r.critical && user.isActor()) $gameVariables.setValue(167, damage);
        if (obj.damage_to_mp) r.mpDamage = damage; else r.hpDamage = damage;
        if (user.isActor() && obj.physical_attack && r.hpDamage > 0 && user.rrVxSkillLearn(173)) {
            if (user.rrVxSkillLearn(182) && user.rrVxOverkill() === 0) user.rrVxSetOverkill(user.rrVxOverkill() + 10);
            else user.rrVxSetOverkill(user.rrVxOverkill() + 1);
        }
        user.removeState(23); user.removeState(24);
        if (user.isActor()) user._rrTempWeapon = user.rrVxWeaponId();
        if (obj.isSkill() && [220, 221, 223, 224, 225].includes(obj.id)) {
            if (obj.id === 220 && this.originalName && this.originalName() !== 'Trainer' && !r.missed && !r.evaded) $gameVariables.setValue(168, vars(168) + 1);
            user.removeState(29);
            if (user.rrVxSkillLearn(177)) user.addState(28);
            if (user.rrVxSkillLearn(109) && this._hp <= r.hpDamage) {
                r.hpDamage = this._hp - 1;
                if (!this.isStateAffected(33)) {
                    user.removeState(40); if (user.rrVxSkillLearn(119)) user.addState(40);
                    user.removeState(41); if (user.rrVxSkillLearn(113)) user.addState(41);
                    user.removeState(42); if (user.rrVxSkillLearn(124)) user.addState(42);
                    this.addState(33);
                }
            }
        }
        this.rrVxAfterObjDamageValue(user, obj);
    };
    /** SBS's two-weapon share and the overdrive port's consume-all extra hook in here. */
    Game_BattlerBase.prototype.rrVxAfterObjDamageValue = function(user, obj) {
        if (!user.isActor()) return;
        const w = user.rrVxWeapons();
        if (!w[0] || !w[1]) return;
        const r = this.rrVxResult();
        const share = VX.TWO_SWORDS_STYLE ? VX.TWO_SWORDS_STYLE[1] : 100;
        if (obj.damage_to_mp) r.mpDamage = rdiv(r.mpDamage * share, 100); else r.hpDamage = rdiv(r.hpDamage * share, 100);
    };
    Game_BattlerBase.prototype.rrVxMakeObjAbsorbEffect = function(user, obj) {
        const r = this.rrVxResult();
        const positive = () => r.hpDamage > 0 || r.mpDamage > 0;
        if (user.isActor()) {
            if (user.rrVxSkillLearn(78)) {
                if (obj.isSkill() && [62, 63, 64].includes(obj.id)) { if (positive()) r.absorbed = true; }
                else if (obj.absorb_damage && positive()) r.absorbed = true;
            } else if (user.rrVxSkillLearn(108)) {
                if (obj.isSkill() && obj.id === 96) { if (positive()) r.absorbed = true; }
                else if (obj.absorb_damage && positive()) r.absorbed = true;
            } else if (obj.absorb_damage && positive()) r.absorbed = true;
        } else if (obj.absorb_damage) {
            r.hpDamage = Math.min(this._hp, r.hpDamage);
            r.mpDamage = Math.min(this._mp, r.mpDamage);
            if (positive()) r.absorbed = true;
        }
    };
    Game_BattlerBase.prototype.rrVxCalcHpRecovery = function(user, item) {
        let result = rdiv(this.mhp * item.hp_recovery_rate, 100);
        if (user.rrVxPharmacology()) result *= 2;
        result -= rdiv(result * (vars(150) * 20), 100);
        return result;
    };
    /** execute_damage (+ SBS absorb sharing; the overdrive port adds its gains). */
    Game_BattlerBase.prototype.rrVxExecuteDamage = function(user) {
        const r = this.rrVxResult();
        if (this.isStateAffected(32) && this._hp <= r.hpDamage) r.hpDamage = this._hp - 1;
        r.hpDamage = Math.min(r.hpDamage, 9999999);
        if (r.absorbed) {
            if (user.isActor()) user.setHp(user.hp + Math.min(this._hp, rdiv(r.hpDamage, 10)));
            else user.setHp(user.hp + Math.min(this._hp, r.hpDamage));
            user.setMp(user.mp + Math.min(this._mp, r.mpDamage));
        }
        if (!this.isActor() && user.isActor() && this._hp > 0 && this._hp <= r.hpDamage) this.rrVxKillSkills(user);
        if (this.isActor() && r.hpDamage > 0 && this.isStateAffected(9)) {
            let check = false, s = 0;
            for (const m of $gameParty.members()) { if (m.rrVxSkillLearn(180)) check = true; if (m.isStateAffected(9)) s++; }
            s = Math.max(s, 1);
            if (check) {
                r.hpDamage = rdiv(r.hpDamage, s);
                for (const m of $gameParty.members()) if (m !== this && m.isStateAffected(9)) m.setHp(m.hp - r.hpDamage);
            }
        }
        this.setHp(this.hp - r.hpDamage);
        this.setMp(this.mp - r.mpDamage);
        if (user.isActor() && !this.isActor() && user.rrVxPlusStateSet().includes(45) && this.rrVxStateProbability(45) >= 100) {
            this.rrVxSetParam(0, Math.max(this.mhp - r.hpDamage, 1));
        }
        if (r.absorbed) { const ur = user.rrVxResult(); ur.hpDamage = -r.hpDamage; ur.mpDamage = -r.mpDamage; }
    };
    Game_BattlerBase.prototype.rrVxKillSkills = function(user) {
        if (user.rrVxSkillLearn(137)) { user.removeState(8); user.addState(8); }
        if (user.rrVxSkillLearn(148)) { user.removeState(10); user.addState(10); }
        if (user.rrVxSkillLearn(131) && user.rrUpdateSingleSkillRecharge) user.rrUpdateSingleSkillRecharge(127, 1);
        if (user.rrVxSkillLearn(151)) { user.removeState(14); user.addState(14); }
        if (user.rrVxSkillLearn(76)) { user.removeState(39); user.addState(39); }
        if (user.rrVxSkillLearn(176)) {
            if (user.rrVxSkillLearn(182) && user.rrVxOverkill() === 0) user.rrVxSetOverkill(user.rrVxOverkill() + 10);
            user.rrVxSetOverkill(user.rrVxOverkill() + 5);
        }
        if (user.rrVxSkillLearn(84)) user.rrSetOverdrive(user.rrOverdrive() + idiv(user.rrMaxOverdrive(), 5));
        if (user.rrVxSkillLearn(168)) user.setHp(user.hp + idiv(user.mhp, 10));
        for (const a of user.rrVxArmors().filter(Boolean)) if (firstWord(a) === 'Curse') user.setHp(user.hp + idiv(user.mhp * 3, 20));
    };
    /**
     * apply_state_changes(obj, attacker): obj is a skill or item (with its user), or for a normal attack
     * the attacker itself with no user.
     */
    Game_BattlerBase.prototype.rrVxApplyStateChanges = function(obj, attacker) {
        const r = this.rrVxResult();
        const objIsBattler = obj instanceof Game_BattlerBase;
        let plus = (objIsBattler ? obj.rrVxPlusStateSet() : obj.plus_state_set).slice();
        const minus = objIsBattler ? [] : obj.minus_state_set;
        if (attacker) {
            if (!objIsBattler && obj.physical_attack) plus = plus.concat(attacker.rrVxPlusStateSet());
            if (attacker.isActor() && !objIsBattler && obj.isSkill()) {
                if (obj.id === 96) {
                    if (attacker.rrVxSkillLearn(111) && !plus.includes(25)) plus.push(25);
                    if (attacker.rrVxSkillLearn(117) && !plus.includes(2)) plus.push(2);
                }
                if (obj.id === 160 && attacker.rrVxSkillLearn(181) && !plus.includes(3)) plus.push(3);
            }
        }
        const mod = this.rrStatusMod();
        for (let i of plus) {
            if (this.isActor() && i === 26 && this.rrVxSkillLearn(189)) i = 43;
            if (this.rrVxStateResist(i)) continue;
            if (this.isDead()) continue;
            if (i === 1 && this._rrImmortal) continue;
            if (this.isStateAffected(i) && i !== 2 && i !== 3) { r.remainedStates.push(i); continue; }
            if (!attacker) {
                if (objIsBattler && obj.isActor()) {
                    let prob = 0, turn = 0, stack = 0;
                    for (const weapon of obj.rrVxWeapons().filter(Boolean)) {
                        prob = this.rrVxStateProbability(i);
                        turn = 0; stack = 0;
                        if (i === 5) mod[2] = 0;
                        switch (firstWord(weapon)) {
                            case 'Selene': if (i === 3) stack = 2; break;
                            case 'Hellfire': if (i === 2) stack = 1; break;
                            case 'Faith': if (i === 4) { turn += 10; if (prob !== 0) prob += 20; } break;
                            case 'Shinobi': if (i === 5) mod[2] = 1; break;
                        }
                    }
                    if (obj.rrVxSkillLearn(66) && [2, 3, 4].includes(i) && prob !== 0) prob += 20;
                    if (rand(100) < prob) {
                        if (i === 2) mod[0] += stack; else if (i === 3) mod[1] += stack;
                        this.addState(i);
                        this._stateTurns[i] = (this._stateTurns[i] || 0) + turn;
                    }
                }
            } else if (this.isActor()) {
                let prob = this.rrVxStateProbability(i);
                let turn = 0;
                for (const armor of this.rrVxArmors().filter(Boolean)) if (firstWord(armor) === 'Laurel' && [2, 3, 4, 5].includes(i)) { turn -= 5; prob += 20; }
                if (this.rrVxSkillLearn(75) && [2, 3, 4].includes(i)) turn -= 5;
                if (this.rrVxSkillLearn(70) && [2, 3, 4].includes(i)) prob = Math.max(prob - 10, 0);
                if (this.rrVxSkillLearn(164) && (i === 26 || i === 43)) turn += 10;
                if (this.rrVxSkillLearn(179) && (i === 26 || i === 43) && this._hp <= idiv(this.mhp, 3)) turn += 10;
                if (rand(100) < prob) {
                    this.addState(i);
                    if (this.isStateAffected(i)) this._stateTurns[i] = (this._stateTurns[i] || 0) + turn;
                } else {
                    if (this.rrVxSkillLearn(85) && [2, 3, 4].includes(i)) this.addState(35);
                    if (this.rrVxSkillLearn(91) && [2, 3, 4].includes(i)) this.addState(36);
                }
                if (attacker.isActor() && attacker.rrVxSkillLearn(121) && !objIsBattler && obj.isSkill() && obj.id === 95) {
                    for (const s of [2, 3, 4, 5]) this.removeState(s);
                }
            } else {
                let prob = this.rrVxStateProbability(i);
                if (attacker.isActor()) {
                    if (attacker.rrVxSkillLearn(73) && prob !== 0) prob += 20;
                    if (attacker.rrVxSkillLearn(155) && attacker.isStateAffected(7)) prob += 100;
                }
                if (rand(100) < prob) {
                    this.addState(i);
                    if (attacker.isActor()) {
                        if (attacker.rrVxSkillLearn(74)) attacker.rrSetOverdrive(attacker.rrOverdrive() + idiv(attacker.rrMaxOverdrive(), 20));
                        if (attacker.rrVxSkillLearn(154) && i === 5) {
                            const ms = $gameTroop.members();
                            const m = ms[rand(ms.length)];
                            if (m && !m.isDead() && !m.isStateAffected(5)) m.addState(5);
                        }
                    }
                }
            }
            r.addedStates.push(i);
        }
        for (const i of minus) {
            if (!this.isStateAffected(i)) continue;
            this.removeState(i);
            r.removedStates.push(i);
        }
        for (const i of r.addedStates.filter(x => r.removedStates.includes(x))) {
            r.addedStates = r.addedStates.filter(x => x !== i);
            r.removedStates = r.removedStates.filter(x => x !== i);
        }
        if (this.isActor()) for (const armor of this.rrVxArmors().filter(Boolean)) if (firstWord(armor) === 'Mirror') armor.state_set = [].concat(objIsBattler ? obj.rrVxPlusStateSet() : obj.plus_state_set);
    };
    Game_BattlerBase.prototype.rrVxAttackEffective = function() { return !this.isDead(); };
    /** attack_effect (the ATB port adds its count damage, the overdrive port its gains). */
    Game_BattlerBase.prototype.rrVxAttackEffect = function(attacker) {
        this.rrVxClearActionResults();
        const r = this.rrVxResult();
        if (!this.rrVxAttackEffective(attacker)) { r.skipped = true; return; }
        let aim = this.rrVxCalcHit(attacker, null);
        if (attacker.isStateAffected(25)) aim = 0;
        if (attacker.isStateAffected(24)) aim = 100;
        if (attacker.isStateAffected(28)) aim = 100;
        let dodge = this.rrVxCalcEva(attacker, null);
        if (attacker.isStateAffected(24)) dodge = 0;
        if (attacker.isStateAffected(28)) dodge = 0;
        aim -= dodge;
        if (idiv(rand(100) + rand(100), 2) >= aim) {
            if (attacker.isActor()) {
                if (attacker.rrVxSkillLearn(162)) attacker.addState(27);
                if (attacker.rrVxSkillLearn(173) && !attacker.rrVxSkillLearn(188)) attacker.rrVxSetOverkill(0);
            }
            if (this.isActor() && this.rrVxSkillLearn(116)) this.addState(21);
            r.missed = true;
            return;
        }
        this.rrVxMakeAttackDamageValue(attacker);
        this.rrVxExecuteDamage(attacker);
        if (attacker.isActor() && attacker.rrVxSkillLearn(173)) {
            if (attacker.rrVxSkillLearn(182) && attacker.rrVxOverkill() === 0) attacker.rrVxSetOverkill(attacker.rrVxOverkill() + 10);
            else attacker.rrVxSetOverkill(attacker.rrVxOverkill() + 1);
        }
        if (r.hpDamage === 0) return;
        if (attacker.isActor() && r.critical && attacker.rrVxSkillLearn(145)) {
            const es = attacker.rrVxElementSet();
            if (es.includes(5) || es.includes(29)) this.addState(5);
        }
        this.rrVxApplyStateChanges(attacker, null);
    };
    Game_BattlerBase.prototype.rrVxPerfectAttackEffect = function(attacker) {
        this.rrVxClearActionResults();
        this.rrVxMakeAttackDamageValue(attacker);
        this.rrVxExecuteDamage(attacker);
        this.rrVxApplyStateChanges(attacker, null);
    };
    Game_BattlerBase.prototype.rrVxSkillEffective = function(user, skill) {
        if (skill.forDeadFriend() !== this.isDead()) return false;
        if (!$gameParty.inBattle() && skill.forFriend()) return this.rrVxSkillTest(user, skill);
        return true;
    };
    /** A test on a copy of the battler (VX clones it); the copy's changes are dropped. */
    Game_BattlerBase.prototype.rrVxTester = function() {
        const t = Object.create(Object.getPrototypeOf(this));
        Object.assign(t, this);
        t._states = this._states.slice();
        t._stateTurns = Object.assign({}, this._stateTurns);
        t._paramPlus = this._paramPlus.slice();
        t._rrStatusMod = this.rrStatusMod().slice();
        t._rrVx = null;
        t.rrVxClearActionResults();
        return t;
    };
    Game_BattlerBase.prototype.rrVxSkillTest = function(user, skill) {
        const tester = this.rrVxTester();
        tester.rrVxMakeObjDamageValue(user, skill);
        tester.rrVxApplyStateChanges(skill, user);
        const r = tester.rrVxResult();
        if (r.hpDamage < 0 && tester._hp < tester.mhp) return true;
        if (r.mpDamage < 0 && tester._mp < tester.mmp) return true;
        return r.addedStates.length > 0 || r.removedStates.length > 0;
    };
    /** skill_effect (with SBS's extensions; the ATB and overdrive ports wrap it). */
    Game_BattlerBase.prototype.rrVxSkillEffect = function(user, skill) {
        const nowhp = this._hp, nowmp = this._mp;
        const userMp = ext(skill).includes('CONSUMEHP') ? user._mp : user._mp + user.rrVxCalcMpCost(skill);
        this.rrVxSkillEffectBase(user, skill);
        this.rrVxSkillEffectExtensions(user, skill, nowhp, nowmp, userMp);
    };
    Game_BattlerBase.prototype.rrVxSkillEffectBase = function(user, skill) {
        this.rrVxClearActionResults();
        const r = this.rrVxResult();
        if (!this.rrVxSkillEffective(user, skill)) { r.skipped = true; return; }
        let aim = this.rrVxCalcHit(user, skill);
        if (user.isStateAffected(24)) aim = 100;
        let dodge = this.rrVxCalcEva(user, skill);
        if (user.isStateAffected(24)) dodge = 0;
        if (user.isStateAffected(29) && [220, 221, 222, 223, 224, 225].includes(skill.id)) { aim = 100; dodge = 0; }
        aim -= dodge;
        if (idiv(rand(100) + rand(100), 2) >= aim) {
            if (user.isActor()) {
                if (user.rrVxSkillLearn(162)) user.addState(27);
                if (user.rrVxSkillLearn(173) && !user.rrVxSkillLearn(188)) user.rrVxSetOverkill(0);
            }
            r.missed = true;
            return;
        }
        this.rrVxMakeObjDamageValue(user, skill);
        this.rrVxMakeObjAbsorbEffect(user, skill);
        this.rrVxExecuteDamage(user);
        if (skill.physical_attack && r.hpDamage === 0) return;
        this.rrVxApplyStateChanges(skill, user);
        if (user.isActor()) {
            if (skill.id === 62) { if (user.rrVxSkillLearn(77)) user.addState(46); if (user.rrVxSkillLearn(79)) user.addState(17); }
            if (skill.id === 63) { if (user.rrVxSkillLearn(77)) user.addState(47); if (user.rrVxSkillLearn(79)) user.addState(18); }
            if (skill.id === 64) { if (user.rrVxSkillLearn(77)) user.addState(48); if (user.rrVxSkillLearn(79)) user.addState(19); }
            if (user.rrVxSkillLearn(174) && skill.id === 159 && user._hp <= idiv(user.mhp, 3)) user.setHp(user.mhp);
        }
    };
    /** SBS's damage extensions; Thrall's Compounding, Level and Buff (the sideview port supplies skill.extension()). */
    Game_BattlerBase.prototype.rrVxSkillEffectExtensions = function(user, obj, nowhp, nowmp, userMp) {
        const r = this.rrVxResult();
        const x = { extension: false, cost: false, nowhp: false, nowmp: false, compound: false, level: false, buff: false, ratioMax: null, ratioNow: null, ratioOver: null };
        for (const e of ext(obj)) {
            if (e === 'COSTPOWER') { x.extension = true; x.cost = true; }
            else if (e === 'HPNOWPOWER') { x.extension = true; x.nowhp = true; }
            else if (e === 'MPNOWPOWER') { x.extension = true; x.nowmp = true; }
            else if (e === 'COMPOUNDING') { x.extension = true; x.compound = true; }
            else if (e === 'LEVEL') { x.extension = true; x.level = true; }
            else if (e === 'BUFF') { x.extension = true; x.buff = true; }
            else if (e[7] === 'M') { x.extension = true; x.ratioMax = parseInt(e.replace('%DAMAGEMAX/', ''), 10) || 0; }
            else if (e[7] === 'N') { x.extension = true; x.ratioNow = parseInt(e.replace('%DAMAGENOW/', ''), 10) || 0; }
            else if (e[7] === 'W') { x.extension = true; x.ratioOver = parseInt(e.replace('%OVERPOWER/', ''), 10) || 0; }
        }
        // Buff (a Ruby ivar) is never cleared: once a skill has it, every later skill on this battler
        // grows its max HP by the user's. Kept as the game has it.
        if (x.buff) this._rrBuffHp = true;
        if (x.extension) { this._hp = nowhp; this._mp = nowmp; }
        if (x.compound) {
            if (this._rrMulti == null || this._rrMulti > 240) this._rrMulti = obj.atk_f;
            if (this._rrTurns == null) this._rrTurns = $gameTroop.turnCount();
            else if (this._rrTurns !== $gameTroop.turnCount()) { this._rrMulti = obj.atk_f; this._rrTurns = $gameTroop.turnCount(); }
            if (r.evaded || r.missed) this._rrMulti = obj.atk_f; else this._rrMulti = this._rrMulti * 2;
        }
        if (r.evaded || r.missed) return;
        if (this._rrBuffHp) this.rrVxSetParam(0, this.mhp + user.mhp);
        let damage = obj.damage_to_mp ? r.mpDamage : r.hpDamage;
        if (x.ratioMax != null) {
            damage = obj.damage_to_mp ? idiv(this.mmp * x.ratioMax, 100) : idiv(this.mhp * x.ratioMax, 100);
            damage *= this.rrVxElementsMaxRate(obj.element_set);
            damage = idiv(damage, 100);
        }
        if (x.ratioNow != null) damage = obj.damage_to_mp ? idiv(this._mp * x.ratioNow, 100) : idiv(this._hp * x.ratioNow, 100);
        if (x.ratioOver != null) damage = rdiv(damage * x.ratioOver, 100);
        if (x.cost) {
            const cost = user.rrVxCalcMpCost(obj);
            if (ext(obj).includes('CONSUMEHP')) damage = rdiv(damage * cost, user.mhp);
            else damage = userMp !== 0 ? rdiv(damage * cost, user.mmp) : 0;
        }
        if (x.level) {
            if (user.rrVxSkillLearn(68)) {
                damage = user.mhp + idiv(user.mhp, 5);
                damage = damage + idiv(damage * (rand(20) - rand(20)), 100);
            } else damage = user.mhp + idiv(user.mhp * (rand(20) - rand(20)), 100);
            damage *= this.rrVxElementsMaxRate(obj.element_set);
            damage = idiv(damage, 150);
        }
        if (x.compound) damage = rdiv(damage * this._rrMulti, 10);
        if (obj.damage_to_mp) r.mpDamage = damage; else r.hpDamage = damage;
        if (r.absorbed) {
            if (user.isActor()) user.setHp(user.hp + Math.min(rdiv(r.hpDamage, 10), this._hp));
            else user.setHp(user.hp + Math.min(r.hpDamage, this._hp));
            user.setMp(user.mp + r.mpDamage);
        }
        if (x.extension) {
            if (!this.isActor() && user.isActor() && this._hp > 0 && this._hp <= r.hpDamage) this.rrVxKillSkills(user);
            this.setHp(this.hp - r.hpDamage);
            this.setMp(this.mp - r.mpDamage);
        }
    };
    Game_BattlerBase.prototype.rrVxPerfectSkillEffect = function(user, skill) {
        this.rrVxClearActionResults();
        this.rrVxMakeObjDamageValue(user, skill);
        this.rrVxMakeObjAbsorbEffect(user, skill);
        this.rrVxExecuteDamage(user);
        this.rrVxApplyStateChanges(skill, user);
    };
    Game_BattlerBase.prototype.rrVxItemEffective = function(user, item) {
        if (item.forDeadFriend() !== this.isDead()) return false;
        if (!$gameParty.inBattle() && item.forFriend()) return this.rrVxItemTest(user, item);
        return true;
    };
    Game_BattlerBase.prototype.rrVxItemTest = function(user, item) {
        const tester = this.rrVxTester();
        tester.rrVxMakeObjDamageValue(user, item);
        tester.rrVxApplyStateChanges(item, user);
        const r = tester.rrVxResult();
        if ((r.hpDamage < 0 || tester.rrVxCalcHpRecovery(user, item) > 0) && tester._hp < tester.mhp) return true;
        if (r.addedStates.length || r.removedStates.length) return true;
        return item.parameter_type > 0;
    };
    Game_BattlerBase.prototype.rrVxItemEffect = function(user, item) {
        this.rrVxClearActionResults();
        const r = this.rrVxResult();
        if (!this.rrVxItemEffective(user, item)) { r.skipped = true; return; }
        const hpRecovery = this.rrVxCalcHpRecovery(user, item);
        this.rrVxMakeObjDamageValue(user, item);
        r.hpDamage -= hpRecovery;
        this.rrSetOverdrive(this.rrOverdrive() + item.hp_recovery);
        this.rrVxMakeObjAbsorbEffect(user, item);
        this.rrVxExecuteDamage(user);
        this.rrVxItemGrowthEffect(user, item);
        if (item.physical_attack && r.hpDamage === 0) return;
        this.rrVxApplyStateChanges(item, user);
    };
    /** SBS's perfect_item_effect reads mp_recovery, which no battler has: the original raises here. */
    Game_BattlerBase.prototype.rrVxPerfectItemEffect = function(user, item) {
        this.rrVxClearActionResults();
        const r = this.rrVxResult();
        const hpRecovery = this.rrVxCalcHpRecovery(user, item);
        this.rrVxMakeObjDamageValue(user, item);
        r.hpDamage -= hpRecovery;
        this.rrVxMakeObjAbsorbEffect(user, item);
        this.rrVxExecuteDamage(user);
        this.rrVxItemGrowthEffect(user, item);
        if (item.physical_attack && r.hpDamage === 0) return;
        this.rrVxApplyStateChanges(item, user);
    };
    Game_BattlerBase.prototype.rrVxItemGrowthEffect = function(user, item) {
        if (item.parameter_type > 0 && item.parameter_points !== 0) {
            const i = item.parameter_type - 1;
            if (i >= 0 && i < 6) this.rrVxSetPlus(i, this.rrVxPlus(i) + item.parameter_points);
        }
    };
    Game_BattlerBase.prototype.rrVxSlipDamageEffect = function() {
        const r = this.rrVxResult();
        if (this.rrVxSlipDamage() && this._hp > 0) {
            r.hpDamage = this.rrVxApplyVariance(idiv(this.mhp, 10), 10);
            if (r.hpDamage >= this._hp) r.hpDamage = this._hp - 1;
            this.setHp(this.hp - r.hpDamage);
        }
    };
    // Overdrive values the rules touch; the overdrive port keeps the real gauge.
    if (typeof Game_BattlerBase.prototype.rrOverdrive !== 'function') {
        Game_BattlerBase.prototype.rrOverdrive = function() { return this._rrOverdrive || 0; };
        Game_BattlerBase.prototype.rrMaxOverdrive = function() { return 1000; };
        Game_BattlerBase.prototype.rrSetOverdrive = function(v) { this._rrOverdrive = Math.max(0, Math.min(Number(v) || 0, this.rrMaxOverdrive())); };
    }
    if (typeof Game_BattlerBase.prototype.rrOverdriveMax !== 'function') Game_BattlerBase.prototype.rrOverdriveMax = function() { return this.rrMaxOverdrive(); };

    // ---- Game_BattleAction (017, with SBS's targets) ----------------------------------------------
    class Game_RrVxAction {
        constructor(battler) { this._battler = battler; this.clear(); }
        get battler() { return this._battler; }
        clear() {
            this.speed = 0; this.kind = 0; this.basic = -1; this.skill_id = 0; this.item_id = 0; this.weapon = false;
            this.target_index = -1; this.forcing = false; this.value = 0;
        }
        friendsUnit() { return this._battler.isActor() ? $gameParty : $gameTroop; }
        opponentsUnit() { return this._battler.isActor() ? $gameTroop : $gameParty; }
        setAttack() { this.kind = 0; this.basic = 0; }
        setGuard() { this.kind = 0; this.basic = 1; }
        setNothing() { this.kind = 0; this.basic = -1; }
        setSkill(id) { this.kind = 1; this.skill_id = id; }
        setItem(id, weapon = false) { this.kind = 2; this.item_id = id; this.weapon = weapon; }
        isAttack() { return this.kind === 0 && this.basic === 0; }
        isGuard() { return this.kind === 0 && this.basic === 1; }
        isNothing() { return this.kind === 0 && this.basic < 0; }
        isSkill() { return this.kind === 1; }
        skill() { return this.isSkill() ? VX.skill(this.skill_id) : null; }
        isItem() { return this.kind === 2; }
        item() { return this.weapon ? VX.weapon(this.item_id) : this.isItem() ? VX.item(this.item_id) : null; }
        forFriend() { return (this.isSkill() && !!this.skill() && this.skill().forFriend()) || (this.isItem() && !!this.item() && !!this.item().forFriend && this.item().forFriend()); }
        forDeadFriend() { return (this.isSkill() && !!this.skill() && this.skill().forDeadFriend()) || (this.isItem() && !!this.item() && !!this.item().forDeadFriend && this.item().forDeadFriend()); }
        decideRandomTarget() {
            let target;
            if (this.forFriend()) target = VX.randomTarget(this.friendsUnit());
            else if (this.forDeadFriend()) target = VX.randomDeadTarget(this.friendsUnit());
            else target = VX.randomTarget(this.opponentsUnit());
            if (!target) this.clear(); else this.target_index = target.rrVxIndex();
        }
        decideLastTarget() {
            let target = null;
            if (this.target_index !== -1) target = (this.forFriend() ? this.friendsUnit() : this.opponentsUnit()).members()[this.target_index] || null;
            if (!target || !target.isAlive()) this.clear();
        }
        prepare() { if (this._battler.rrVxBerserker() || this._battler.rrVxConfusion()) this.setAttack(); }
        valid() {
            if (this.isNothing()) return false;
            if (this.forcing) return true;
            if (!this._battler.rrVxMovable()) return false;
            if (this.isSkill()) {
                if (this._battler._rrDerivation) { this._battler._rrDerivation = 0; return true; }
                return this._battler.rrVxSkillCanUse(this.skill());
            }
            if (this.isItem()) return VX.itemCanUse(this.friendsUnit(), this.item());
            return true;
        }
        makeSpeed() {
            const b = this._battler;
            this.speed = b.agi + rand(5 + idiv(b.agi, 4));
            if (this.isSkill() && this.skill()) this.speed += this.skill().speed;
            if (this.isItem() && this.item()) this.speed += this.item().speed || 0;
            if (this.isAttack() && b.rrVxFastAttack()) this.speed += 1000;
        }
        makeTargets() {
            if (this.isAttack()) return this.makeAttackTargets();
            if (this.isSkill()) { let t = this.makeObjTargets(this.skill()); if (ext(this.skill()).join() !== 'NONE') t = this.makeObjTargets2(this.skill(), t); return t; }
            if (this.isItem()) { let t = this.makeObjTargets(this.item()); if (ext(this.item()).join() !== 'NONE') t = this.makeObjTargets2(this.item(), t); return t; }
            return [];
        }
        makeAttackTargets() {
            const b = this._battler;
            const targets = [];
            let forall = false, reverse = false;
            if (b.isActor()) for (const w of b.rrVxWeapons().filter(Boolean)) { const n = firstWord(w); if (n === 'Cosmo') forall = true; else if (n === 'Seraph') reverse = true; }
            const push = (t) => { if (t && !(t.isStateAffected(7) || t.isStateAffected(13) || t.rrVxGuarding())) targets.push(t); };
            if (b.rrVxConfusion()) push(VX.randomTarget(this.friendsUnit()));
            else if (b.rrVxBerserker()) push(VX.randomTarget(this.opponentsUnit()));
            else if (forall) for (const t of this.opponentsUnit().members().filter(m => m.isAlive())) push(t);
            else if (reverse) push(VX.smoothTarget(this.friendsUnit(), this.target_index));
            else push(VX.smoothTarget(this.opponentsUnit(), this.target_index));
            return targets.filter(Boolean);
        }
        makeObjTargets(obj) {
            let targets = [];
            if (!obj) return targets;
            const hidden = (t) => t.isStateAffected(7) || t.isStateAffected(13) || t.rrVxGuarding();
            const push = (t) => { if (t && !hidden(t)) targets.push(t); };
            const opp = this.opponentsUnit(), fr = this.friendsUnit();
            if (obj.forOpponent()) {
                if (obj.forRandom()) {
                    const n = obj.forOne() ? 1 : obj.forTwo() ? 2 : 3;
                    for (let i = 0; i < n; i++) push(VX.randomTarget(opp));
                } else if (obj.dual()) {
                    push(VX.smoothTarget(opp, this.target_index));
                    targets = targets.concat(targets);
                } else if (obj.forOne()) push(VX.smoothTarget(opp, this.target_index));
                else {
                    // Ruby deletes from the array it walks, so a hidden member right after another is kept.
                    targets = opp.members().filter(m => m.isAlive());
                    for (let i = 0; i < targets.length; i++) if (hidden(targets[i])) { targets.splice(i, 1); }
                }
            } else if (obj.forUser()) targets.push(this._battler);
            else if (obj.forDeadFriend()) {
                if (obj.forOne()) targets.push(VX.smoothDeadTarget(fr, this.target_index));
                else targets = targets.concat(fr.members().filter(m => m.isDead()));
            } else if (obj.forFriend()) {
                if (obj.forOne()) targets.push(VX.smoothTarget(fr, this.target_index));
                else targets = targets.concat(fr.members().filter(m => m.isAlive()));
            }
            return targets.filter(Boolean);
        }
        makeObjTargets2(obj, targets) {
            const e = ext(obj);
            const b = this._battler;
            const self = b.isActor() ? $gameParty.members()[b.rrVxIndex()] : $gameTroop.members()[b.rrVxIndex()];
            if (e.includes('TARGETALL')) targets = this.opponentsUnit().members().filter(m => m.isAlive()).concat(this.friendsUnit().members().filter(m => m.isAlive()));
            if (e.includes('TARGETSELF')) targets = [self].concat(this.makeObjTargets(this.skill()));
            if (e.includes('OTHERS')) targets = targets.filter(t => t !== self);
            if (e.includes('SELF')) targets = [self];
            return targets.filter(Boolean);
        }
    }
    window.Game_RrVxAction = Game_RrVxAction;

    VX.randomTarget = (unit) => {
        const roulette = [];
        for (const m of unit.members().filter(x => x.isAlive())) for (let i = 0; i < m.rrVxOdds(); i++) roulette.push(m);
        return roulette.length ? roulette[rand(roulette.length)] : null;
    };
    VX.randomDeadTarget = (unit) => { const d = unit.members().filter(x => x.isDead()); return d.length ? d[rand(d.length)] : null; };
    VX.smoothTarget = (unit, index) => { const m = unit.members()[index]; if (m && m.isAlive()) return m; return unit.members().filter(x => x.isAlive())[0] || null; };
    VX.smoothDeadTarget = (unit, index) => { const m = unit.members()[index]; if (m && m.isDead()) return m; return unit.members().filter(x => x.isDead())[0] || null; };
    VX.averageAgi = (unit) => {
        let result = 0, n = 0;
        for (const m of unit.members()) { result += m.agi; n++; }
        if (n > 0) result = idiv(result, n);
        return result === 0 ? 1 : result;
    };
    /** Game_Party#item_can_use? (VX): in the party's bag, and usable now. Weapons are swapped to, not used. */
    VX.itemCanUse = (unit, item) => {
        if (!item || !item.isItem || !item.isItem()) return false;
        if (unit === $gameParty) {
            if ($gameParty.numItems($dataItems[item.id]) === 0) return false;
            return $gameParty.inBattle() ? item.battleOk() : item.menuOk();
        }
        return true;
    };

    // ---- enemy actions (019) ------------------------------------------------------------------
    Game_Enemy.prototype.rrVxConditionsMet = function(action) {
        const p1 = action.condition_param1, p2 = action.condition_param2;
        const act = this.rrVxAction();
        switch (action.condition_type) {
            case 1: {
                const n = this.rrVxTurnCountForActions();
                if (p2 === 0 && n !== p1) return false;
                if (p2 > 0 && (n < 1 || n < p1 || imod(n, p2) !== imod(p1, p2))) return false;
                return true;
            }
            case 2: { const rate = this._hp * 100.0 / this.mhp; return !(rate < p1 || rate > p2); }
            case 3: { const rate = this.mmp ? this._mp * 100.0 / this.mmp : NaN; return !(rate < p1 || rate > p2); }
            case 4: return this.isStateAffected(p1);
            case 5: return this.rrVxHardCodedCondition(action, act);
            case 6: return !!$gameSwitches.value(p1);
        }
        return true;
    };
    /** The turn an enemy action condition counts: the troop's, or (ATB) the enemy's own action count. */
    Game_Enemy.prototype.rrVxTurnCountForActions = function() { return $gameTroop.turnCount(); };
    Game_Enemy.prototype.rrVxHardCodedCondition = function(action, act) {
        const p1 = action.condition_param1;
        const existing = () => $gameTroop.members().filter(m => m.isAlive());
        switch (p1) {
            case 1: case 2: case 3: case 4: return this._rrElement != null && this._rrElement === p1;
            case 5: return this._rrElement != null && !(this._rrElement < p1);
            case 6: {
                for (const m of existing()) if ([2, 3, 4, 5].some(s => m.isStateAffected(s))) { act.target_index = m.index(); return true; }
                return false;
            }
            case 7: {
                for (const m of existing()) { if (m === this) continue; if (m._hp <= idiv(m.mhp, 2) && !m.isDead()) { act.target_index = m.index(); return true; } }
                return false;
            }
            case 8: {
                // existing members are never dead: this never holds (kept as the game has it).
                for (const m of existing()) if (m.isDead()) { act.target_index = m.index(); return true; }
                return false;
            }
            case 9: return vars(145) > 0;
            case 10: return vars(145) <= 0 && this._hp <= idiv(this.mhp, 2);
            case 11: {
                for (const m of existing()) if (m._hp <= idiv(m.mhp * 3, 10) && !m.isDead()) { act.target_index = m.index(); return true; }
                return false;
            }
            case 12: {
                for (const m of existing()) { if (m === this) continue; if (m._hp < m.mhp && !m.isDead()) { act.target_index = m.index(); return true; } }
                return false;
            }
            case 13: {
                const temp = existing().filter(m => m !== this && !m.isDead()).map(m => m.index());
                if (temp.length < 1) return false;
                act.target_index = temp[rand(temp.length)];
                return true;
            }
            case 14: {
                if (this._hp > idiv(this.mhp, 2)) return false;
                const temp = existing().filter(m => m !== this && !m.isDead()).map(m => m.index());
                if (temp.length < 1) return false;
                act.target_index = temp[rand(temp.length)];
                return true;
            }
            case 15: {
                if (action.kind !== 1) return false;
                const skill = VX.skill(action.skill_id);
                for (const s of skill ? skill.plus_state_set : []) if (this.isStateAffected(s)) return false;
                return true;
            }
            case 16: {
                if (action.kind !== 1) return false;
                const skill = VX.skill(action.skill_id);
                const mem = [];
                for (const m of $gameParty.members().filter(x => x.isAlive())) for (const s of skill ? skill.plus_state_set : []) {
                    if (m.isStateAffected(7) || m.isStateAffected(13) || m.rrVxGuarding()) continue;
                    if (!m.isStateAffected(s)) mem.push(m.index());
                }
                if (mem.length < 1) return false;
                act.target_index = mem[rand(mem.length)];
                return true;
            }
        }
        return false;
    };
    /** VX make_action: rating roulette over the actions whose conditions hold (wait actions included). */
    Game_Enemy.prototype.rrVxMakeAction = function() {
        const act = this.rrVxAction();
        act.clear();
        if (!this.rrVxMovable()) return;
        const available = [];
        let ratingMax = 0;
        for (const action of this.rrVxEnemy().actions) {
            if (!this.rrVxConditionsMet(action)) continue;
            if (action.kind === 1 && !this.rrVxSkillCanUse(VX.skill(action.skill_id))) continue;
            available.push(action);
            ratingMax = Math.max(ratingMax, action.rating);
        }
        const zero = ratingMax - 3;
        let total = 0;
        for (const a of available) if (a.rating > zero) total += a.rating - zero;
        if (total === 0) return;
        let value = rand(total);
        for (const a of available) {
            if (a.rating <= zero) continue;
            if (value < a.rating - zero) {
                act.kind = a.kind; act.basic = a.basic; act.skill_id = a.skill_id;
                if (!(act.target_index >= 0)) act.decideRandomTarget();
                return;
            }
            value -= a.rating - zero;
        }
    };
    /** Game_Actor#make_action (auto battle): Thrall commented out the evaluation, so nothing is chosen. */
    Game_Actor.prototype.rrVxMakeAction = function() {
        const act = this.rrVxAction();
        act.clear();
        if (!this.rrVxMovable()) return;
        const action = new Game_RrVxAction(this);
        action.setAttack();
        // max_value starts at 0 and the attack's value is 0: the cleared action stays.
    };
    Game_BattlerBase.prototype.rrVxMakeAction = function() {};
    Game_Battler.prototype.rrVxEscape = function() { this.hide(); this.rrVxAction().clear(); };

    // ---- Game_Troop (023) -------------------------------------------------------------------
    const _troopSetup = Game_Troop.prototype.setup;
    Game_Troop.prototype.setup = function(troopId) {
        _troopSetup.call(this, troopId);
        this._rrTurnEnding = false;
        this._rrForcingBattler = null;
        this._rrPreemptive = false;
        this._rrSurprise = false;
        // VX's immortal checkbox on troop members (MZ has none).
        this.members().forEach((m, i) => { if (VX.IMMORTAL && VX.IMMORTAL.has(`${troopId}:${i}`)) m._rrImmortal = true; });
    };
    Game_Troop.prototype.rrVxMakeActions = function() {
        if (this._rrPreemptive) for (const m of this.members()) m.rrVxAction().clear();
        else for (const m of this.members()) m.rrVxMakeAction();
    };
    Game_Troop.prototype.rrVxConditionsMet = function(page) {
        const c = page.conditions;
        if (!c.turnEnding && !c.turnValid && !c.enemyValid && !c.actorValid && !c.switchValid) return false;
        if (c.turnEnding && !this._rrTurnEnding) return false;
        if (c.turnValid) {
            const n = this._turnCount, a = c.turnA, b = c.turnB;
            if (b === 0 && n !== a) return false;
            if (b > 0 && (n < 1 || n < a || imod(n, b) !== imod(a, b))) return false;
        }
        if (c.enemyValid) {
            const e = this.members()[c.enemyIndex];
            if (!e || e._hp * 100.0 / e.mhp > c.enemyHp) return false;
        }
        if (c.actorValid) {
            const a = $gameActors.actor(c.actorId);
            if (!a || a._hp * 100.0 / a.mhp > c.actorHp) return false;
        }
        if (c.switchValid && !$gameSwitches.value(c.switchId)) return false;
        return true;
    };
    const _meetsConditions = Game_Troop.prototype.meetsConditions;
    Game_Troop.prototype.meetsConditions = function(page) {
        if (VX.battleActive && VX.battleActive()) return this.rrVxConditionsMet(page);
        return _meetsConditions.call(this, page);
    };
    /** exp_total(actor): over-levelled actors earn less, Double EXP armour adds 15% each, the fallen a quarter. */
    Game_Troop.prototype.rrVxExpTotal = function(actor) {
        let exp = 0;
        for (const e of this.members()) if (e.isDead()) exp += e.rrVxExp();
        if (actor.level > vars(23)) exp = idiv(exp, 2 * (actor.level - vars(23)));
        let n = exp;
        for (const a of actor.rrVxArmors().filter(Boolean)) if (a.double_exp_gain) n += idiv(exp, 20) * 3;
        if (actor.isDead()) n = idiv(n, 4);
        return n;
    };
    /** make_drop_items: [iterations, drop chances, levels], for the loot table. */
    Game_Troop.prototype.rrVxMakeDropItems = function() {
        let iterations = 0;
        const dropChance = [], levels = [];
        const threshold = vars(151);
        let pain = 0;
        for (let p = 141; p <= 150; p++) pain += vars(p);
        const rewards = Math.min(pain, threshold);
        for (const enemy of this.members().filter(m => m.isDead())) {
            for (const di of [enemy.rrVxEnemy().drop_item1, enemy.rrVxEnemy().drop_item2]) {
                if (![0, 2, 3].includes(di.kind)) continue;
                let x = enemy.rrVxGold() + pain * 10;
                for (const member of $gameParty.members()) for (const w of member.rrVxWeapons().filter(Boolean)) {
                    if (firstWord(w) === 'Royal' && !member.isDead()) x = 500;
                    if (w.element_set.includes(33) && !member.isDead()) x = 500;
                }
                const shardDrop = rewards >= 5 && di.kind === 3 && !dropChance.includes(-1);
                if (shardDrop) {
                    x = (vars(22) - 1) * 3;
                    if (rand(101) > x) { dropChance.push(null); continue; }
                } else if (!$gameSwitches.value(39) && di.kind !== 2 && vars(99) <= 0) {
                    if (rand(1001) > x) { dropChance.push(null); continue; }
                }
                iterations += 1;
                $gameVariables.setValue(99, vars(99) - 1);
                const n = rand(10);
                let lvl = n === 0 ? vars(23) + 1 : n === 1 ? vars(23) - 1 : vars(23);
                if (lvl <= 0) lvl = 1;
                if (lvl > 99) lvl = 99;
                levels.push(lvl);
                if (shardDrop) {
                    dropChance.push(pain >= 15 && threshold >= 15 ? -2 : -1);
                    if (pain >= threshold && threshold < 30) $gameVariables.setValue(151, vars(151) + 1);
                    continue;
                }
                const chance = enemy.rrVxElementRate(15);
                const c = (pain * 2) / 100.0;
                const base = chance === 200 ? 450.0 : chance === 150 ? 900.0 : chance === 100 ? 9000.0 : chance === 50 ? 90000.0 : 450000.0;
                dropChance.push(trunc(base - base * c));
            }
        }
        return [iterations, dropChance, levels];
    };
})();
