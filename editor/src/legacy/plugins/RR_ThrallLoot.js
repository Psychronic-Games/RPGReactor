/*:
 * @target MZ
 * @plugindesc Module_Loot and Loot Table (VX), for imported games
 * @author Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallLoot.js
 *
 * Thrall's loot. Chests, shops, rewards and battles roll new equipment and
 * items into the database's loot slots (weapons 37-76, armours 47-86, items
 * 31-70; the shops' 107-146, 122-161, 101-140) and open the Loot Table:
 * the loot on the left, the backpack on the right, the selected entry's
 * details below and the keys along the bottom (W sort by rarity or type,
 * C favourite, Q compare with an actor's equipment; A and S switch the
 * backpack between armours, weapons and items). Confirm moves an entry
 * across, buying or selling in a shop; cancel offers to salvage what is
 * left for materials (variable 89). Variable 3 picks the table: 0 loot,
 * 1 storage, 2 locker, 3-5 the weapon, armour and item shops.
 *
 * A weapon's or armour's stats are rolled from its level, its rarity
 * (mythic, legendary, epic, rare, uncommon, common) and a prefix; the
 * pity lists on the system spread the weapon and armour types. The
 * database entries the loot is written into are saved with the game, as
 * the original saved its whole database.
 *
 * Script calls:
 *   $gameTemp.rrGenerateLoot(count, rates, levels, type)   generate_loot
 *   SceneManager.push(Scene_RRThrallLootTable)              Scene_LootTable
 * For the other ports (window classes and RRThrallVx.loot* helpers):
 *   Window_RRThrallLoot, Window_RRThrallInventory, Window_RRThrallStats,
 *   Window_RRThrallLabel, Window_RRThrallLabel2, Window_RRThrallOptions;
 *   RRThrallVx.lootRecord(kind, id), lootRarity(item), lootSortWeapons(list,
 *   mode), lootSortArmors, lootSortItems, lootToggleFavorite(item),
 *   lootCopy(kind, id, from), lootSync(kind, id), lootPartyHasItem(item, equip).
 *
 * As in the original, a loot slot's spirit factor, hit, speed and MP
 * cost are not copied with an item (they keep the slot's own).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param lootTables
 * @text Loot tables
 * @desc JSON: Module_Loot's constants (pools by rarity and type, prefix lists).
 * @type note
 * @default "{}"
 *
 * @param weaponPrefixes
 * @text Weapon prefix bonuses
 * @desc JSON: the prefixes generate_prefix lists under each bonus (DMG+15% …, Elements, Accessories).
 * @type note
 * @default "{}"
 *
 * @param armorPrefixes
 * @text Armour prefix bonuses
 * @desc JSON: the prefixes generate_prefix lists under each bonus (DEF+20% …, Elements, Accessories).
 * @type note
 * @default "{}"
 */
(() => {
    'use strict';
    const PLUGIN = 'RR_ThrallLoot';
    const P = PluginManager.parameters(PLUGIN);
    const json = (s, d) => {
        try {
            let v = s ? JSON.parse(s) : d;
            if (typeof v === 'string') v = JSON.parse(v);
            return v && typeof v === 'object' ? v : d;
        } catch (_) { return d; }
    };
    const LOOT = json(P.lootTables, {});
    const WP = json(P.weaponPrefixes, {});
    const AP = json(P.armorPrefixes, {});
    const L = (name) => LOOT[name] || [];
    const VX = (window.RRThrallVx = window.RRThrallVx || {});
    const WLH = 24;

    // ---- Ruby arithmetic and game state ------------------------------------------
    const idiv = (a, b) => (b === 0 ? 0 : Math.floor(a / b));
    /** Kernel#rand: rand(0) is a Float in [0, 1); a negative bound counts as its size. */
    const rand = (n) => { n = Math.abs(Math.trunc(n)); return n === 0 ? Math.random() : Math.floor(Math.random() * n); };
    const pick = (list) => list[rand(list.length)];
    const vars = (id) => $gameVariables.value(id);
    const setVar = (id, v) => $gameVariables.setValue(id, v);
    const sw = (id) => $gameSwitches.value(id);
    const minus = (a, b) => a.filter(x => !b.includes(x));
    const toI = (s) => { const m = /^\s*[-+]?\d+/.exec(String(s ?? '')); return m ? Number(m[0]) : 0; };
    /** Ruby's array[i], negative from the end. */
    const at = (list, i) => (i < 0 ? list[list.length + i] : list[i]);
    const nameWord = (obj, i) => String(obj ? obj.name : '').split(/ /)[i];

    // The game's Gamepad module controls (RR_ThrallKeys), by index: 0 dash, 1 cancel, 2 confirm, 3 page up,
    // 4 page down, 5 compare, 6 sort, 7 menu, 8 up, 9 left, 10 down, 11 right.
    const BUTTONS = ['shift', 'escape', 'ok', 'pageup', 'pagedown', 'rgssX', 'rgssY', 'rgssZ', 'up', 'left', 'down', 'right'];
    const PAD = { dash: 0, cancel: 1, confirm: 2, pgup: 3, pgdn: 4, compare: 5, sort: 6, menu: 7, up: 8, left: 9, down: 10, right: 11 };
    const trig = (i) => (Input.rrGamepadTriggered ? Input.rrGamepadTriggered(i) : Input.isTriggered(BUTTONS[i]));
    const press = (i) => (Input.rrGamepadPressed ? Input.rrGamepadPressed(i) : Input.isPressed(BUTTONS[i]));
    /** Config.read_input_*: 0 A, 1 B, 2 C, 3 L, 4 R, 5 X, 6 Y, 7 Z. */
    const readInput = (i) => ($gameSystem.rrReadInput ? $gameSystem.rrReadInput(i) : 854);
    const se = {
        cursor: () => SoundManager.playCursor(), decision: () => SoundManager.playOk(), cancel: () => SoundManager.playCancel(),
        buzzer: () => SoundManager.playBuzzer(), shop: () => SoundManager.playShop()
    };
    Object.assign(VX, { lootButtons: PAD, lootTrigger: trig, lootPress: press, lootReadInput: readInput });

    // ---- VX records ------------------------------------------------------------------
    // The battle port (RR_ThrallBattlers) keeps the game's VX records (RRThrallVx.weapon(id) …: atk, element_set …,
    // name and note read from the MZ record). Without it, records of the same shape are made from the MZ database.
    const WEAPON_FIELDS = ['atk', 'def', 'spi', 'agi', 'hit', 'animation_id', 'two_handed', 'fast_attack', 'dual_attack', 'critical_bonus', 'element_set', 'state_set'];
    const ARMOR_FIELDS = ['kind', 'atk', 'def', 'spi', 'agi', 'eva', 'prevent_critical', 'half_mp_cost', 'double_exp_gain', 'auto_hp_recover', 'element_set', 'state_set'];
    const ITEM_FIELDS = ['base_damage', 'atk_f', 'spi_f', 'variance', 'hit', 'scope', 'occasion', 'speed', 'mp_cost', 'animation_id', 'common_event_id', 'physical_attack',
        'damage_to_mp', 'absorb_damage', 'ignore_defense', 'element_set', 'plus_state_set', 'minus_state_set', 'hp_recovery_rate', 'hp_recovery', 'mp_recovery_rate',
        'mp_recovery', 'parameter_type', 'parameter_points', 'consumable'];
    /** What the Loot Table and generate_loot copy of an item (not spi_f, hit, speed, mp_cost or the damage flags). */
    const ITEM_COPY = ['scope', 'occasion', 'animation_id', 'base_damage', 'variance', 'atk_f', 'physical_attack', 'element_set', 'plus_state_set', 'minus_state_set',
        'consumable', 'hp_recovery_rate', 'hp_recovery', 'mp_recovery_rate', 'mp_recovery', 'parameter_type', 'parameter_points', 'common_event_id'];
    const FIELDS = { weapon: WEAPON_FIELDS, armor: ARMOR_FIELDS, item: ITEM_FIELDS };
    const KINDS = ['weapon', 'armor', 'item'];
    const table = (kind) => (kind === 'weapon' ? $dataWeapons : kind === 'armor' ? $dataArmors : $dataItems);

    // An armour's VX `kind` is its type (0 shield … 3 accessory), so the record's own kind is kept apart.
    class LootVxRecord {
        constructor(kind, id) { this._k = kind; this.id = id; if (kind !== 'armor') this.kind = kind; }
        mz() { return table(this._k)[this.id] || null; }
        get name() { const d = this.mz(); return d ? d.name : ''; }
        get note() { const d = this.mz(); return d ? String(d.note || '') : ''; }
        get icon_index() { const d = this.mz(); return d ? d.iconIndex : 0; }
        get description() { const d = this.mz(); return d ? d.description : ''; }
        isSkill() { return false; }
        isItem() { return this._k === 'item'; }
        isWeapon() { return this._k === 'weapon'; }
        isArmor() { return this._k === 'armor'; }
    }
    const traitIds = (d, code) => (d.traits || []).filter(t => t.code === code).map(t => t.dataId);
    const traitSum = (d, code, id) => (d.traits || []).filter(t => t.code === code && t.dataId === id).reduce((s, t) => s + t.value, 0);
    const hasTrait = (d, code, id) => (d.traits || []).some(t => t.code === code && (id === undefined || t.dataId === id));
    const MZ_SCOPE_TO_VX = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 5, 5: 6, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11 };
    function fallbackRecord(kind, id) {
        const d = table(kind) && table(kind)[id];
        if (!d) return null;
        const o = new LootVxRecord(kind, id);
        if (kind === 'weapon') {
            Object.assign(o, { atk: d.params[2], def: d.params[3], spi: d.params[4], agi: d.params[6], hit: Math.round(95 + traitSum(d, 22, 0) * 100), animation_id: d.animationId,
                two_handed: hasTrait(d, 54), fast_attack: hasTrait(d, 33), dual_attack: hasTrait(d, 34), critical_bonus: traitSum(d, 22, 2) > 0,
                element_set: traitIds(d, 31), state_set: traitIds(d, 32) });
        } else if (kind === 'armor') {
            Object.assign(o, { kind: Math.max(0, d.etypeId - 2), atk: d.params[2], def: d.params[3], spi: d.params[4], agi: d.params[6], eva: Math.round(traitSum(d, 22, 1) * 100),
                prevent_critical: hasTrait(d, 22, 3), half_mp_cost: hasTrait(d, 23, 4), double_exp_gain: hasTrait(d, 23, 9), auto_hp_recover: hasTrait(d, 22, 7),
                element_set: traitIds(d, 11), state_set: traitIds(d, 14) });
        } else {
            const eff = (code) => (d.effects || []).find(e => e.code === code);
            const hp = eff(11), mp = eff(12), g = eff(42), ce = eff(44);
            const t = d.damage ? d.damage.type : 0;
            Object.assign(o, { base_damage: 0, atk_f: 0, spi_f: 0, variance: d.damage ? d.damage.variance : 20, hit: d.successRate, scope: d.repeats === 2 && d.scope === 1 ? 3 : (MZ_SCOPE_TO_VX[d.scope] ?? 0),
                occasion: d.occasion, speed: d.speed, mp_cost: 0, animation_id: d.animationId, common_event_id: ce ? ce.dataId : 0, physical_attack: d.hitType === 1,
                damage_to_mp: [2, 4, 6].includes(t), absorb_damage: [5, 6].includes(t), ignore_defense: false,
                element_set: d.damage && d.damage.elementId > 0 ? [d.damage.elementId] : [], plus_state_set: (d.effects || []).filter(e => e.code === 21).map(e => e.dataId),
                minus_state_set: (d.effects || []).filter(e => e.code === 22).map(e => e.dataId), hp_recovery_rate: hp ? Math.round(hp.value1 * 100) : 0, hp_recovery: hp ? hp.value2 : 0,
                mp_recovery_rate: mp ? Math.round(mp.value1 * 100) : 0, mp_recovery: mp ? mp.value2 : 0, parameter_type: g ? ([0, 0, 1, 2, 3, 4, 6].indexOf(g.dataId) + 1 || 0) : 0,
                parameter_points: g ? g.value1 : 0, consumable: !!d.consumable });
        }
        return o;
    }
    let FALLBACK = { weapon: [], armor: [], item: [] };
    /** The VX record of a weapon, armour or item by kind and id. */
    function vxRecord(kind, id) {
        const own = VX.DB && typeof VX[kind] === 'function' && VX[kind] !== ownLookups[kind] ? VX[kind](id) : null;
        if (own) return own;
        const store = FALLBACK[kind];
        if (!store[id]) store[id] = fallbackRecord(kind, id);
        return store[id] || null;
    }
    const ownLookups = { weapon: (id) => vxRecord('weapon', id), armor: (id) => vxRecord('armor', id), item: (id) => vxRecord('item', id) };
    /**
     * 'weapon', 'armor' or 'item' for an MZ record, a VX record or a LootItem; null for anything else. A VX armour's
     * `kind` is its armour type, so a VX record with a number there is an armour.
     */
    function kindOf(obj) {
        if (!obj) return null;
        if (obj instanceof LootItem || obj instanceof LootVxRecord) return obj._k;
        if (DataManager.isWeapon(obj)) return 'weapon';
        if (DataManager.isArmor(obj)) return 'armor';
        if (DataManager.isItem(obj)) return 'item';
        if (typeof obj.mz === 'function') {
            if (typeof obj.kind === 'string' && KINDS.includes(obj.kind)) return obj.kind;
            if (typeof obj.kind === 'number' && 'eva' in obj) return 'armor';
        }
        return null;
    }
    const vxOf = (obj) => { const k = kindOf(obj); return k ? vxRecord(k, obj.id) : null; };
    const mzOf = (obj) => { const k = kindOf(obj); return k ? table(k)[obj.id] || null : null; };

    /** One database entry as the Ruby saw it: VX fields on the VX record, name, icon, description, note and price on MZ's. */
    class LootItem {
        constructor(kind, id) { this._k = kind; this.id = id; }
        get vx() { return vxRecord(this._k, this.id); }
        get mz() { return table(this._k)[this.id]; }
        isWeapon() { return this._k === 'weapon'; }
        isArmor() { return this._k === 'armor'; }
        isItem() { return this._k === 'item'; }
    }
    for (const f of new Set([...WEAPON_FIELDS, ...ARMOR_FIELDS, ...ITEM_FIELDS])) {
        Object.defineProperty(LootItem.prototype, f, { get() { return this.vx[f]; }, set(v) { this.vx[f] = v; }, configurable: true });
    }
    for (const [f, mz] of Object.entries({ name: 'name', icon_index: 'iconIndex', description: 'description', note: 'note', price: 'price' })) {
        Object.defineProperty(LootItem.prototype, f, { get() { return this.mz[mz]; }, set(v) { this.mz[mz] = v; }, configurable: true });
    }
    const item = (kind, id) => new LootItem(kind, id);
    /** The entry `obj` (MZ record, VX record or LootItem) as a LootItem; null for anything else. */
    const wrap = (obj) => { if (obj instanceof LootItem) return obj; const k = kindOf(obj); return k ? item(k, obj.id) : null; };

    // ---- the MZ record follows its VX fields (as the importer converted them) ------------------------------
    const SCOPE = { 0: 0, 1: 1, 2: 2, 3: 1, 4: 3, 5: 4, 6: 5, 7: 7, 8: 8, 9: 9, 10: 10, 11: 11 };
    function damageFormula(r) {
        const base = Number(r.base_damage) || 0, atkF = Number(r.atk_f) || 0, spiF = Number(r.spi_f) || 0;
        const plus = [atkF ? `a.atk * ${4 * atkF / 100}` : '', spiF ? `a.mat * ${2 * spiF / 100}` : ''].filter(Boolean);
        if (base > 0) {
            const less = r.ignore_defense ? [] : [atkF ? `b.def * ${2 * atkF / 100}` : '', spiF ? `b.mdf * ${spiF / 100}` : ''].filter(Boolean);
            return `Math.max(0, ${[String(base)].concat(plus).join(' + ')}${less.length ? ' - (' + less.join(' + ') + ')' : ''})`;
        }
        return [String(-base)].concat(plus).join(' + ');
    }
    function syncMz(kind, id) {
        const r = vxRecord(kind, id), d = table(kind)[id];
        if (!r || !d) return;
        const list = (v) => (Array.isArray(v) ? v : []);
        if (kind === 'weapon' || kind === 'armor') d.params = [0, 0, r.atk || 0, r.def || 0, r.spi || 0, r.spi || 0, r.agi || 0, 0];
        if (kind === 'weapon') {
            const traits = list(r.element_set).map(e => ({ code: 31, dataId: e, value: 0 })).concat(list(r.state_set).map(s => ({ code: 32, dataId: s, value: 0.5 })));
            traits.push({ code: 22, dataId: 0, value: ((Number(r.hit) || 0) - 95) / 100 });
            if (r.critical_bonus) traits.push({ code: 22, dataId: 2, value: 0.04 });
            if (r.fast_attack) traits.push({ code: 33, dataId: 0, value: 2000 });
            if (r.dual_attack) traits.push({ code: 34, dataId: 0, value: 1 });
            if (r.two_handed) traits.push({ code: 54, dataId: 2, value: 1 });
            d.traits = traits;
            d.animationId = Number(r.animation_id) || 0;
        } else if (kind === 'armor') {
            const traits = list(r.element_set).map(e => ({ code: 11, dataId: e, value: 0.5 })).concat(list(r.state_set).map(s => ({ code: 14, dataId: s, value: 1 })));
            if (r.eva) traits.push({ code: 22, dataId: 1, value: r.eva / 100 });
            if (r.prevent_critical) traits.push({ code: 22, dataId: 3, value: 1 });
            if (r.half_mp_cost) traits.push({ code: 23, dataId: 4, value: 0.5 });
            if (r.double_exp_gain) traits.push({ code: 23, dataId: 9, value: 2 });
            if (r.auto_hp_recover) traits.push({ code: 22, dataId: 7, value: 0.05 });
            d.traits = traits;
            d.etypeId = [2, 3, 4, 5][r.kind] ?? 5;
        } else {
            const effects = list(r.plus_state_set).map(s => ({ code: 21, dataId: s, value1: 1, value2: 0 })).concat(list(r.minus_state_set).map(s => ({ code: 22, dataId: s, value1: 1, value2: 0 })));
            if (r.common_event_id) effects.push({ code: 44, dataId: r.common_event_id, value1: 0, value2: 0 });
            if (r.hp_recovery_rate || r.hp_recovery) effects.unshift({ code: 11, dataId: 0, value1: (r.hp_recovery_rate || 0) / 100, value2: r.hp_recovery || 0 });
            if (r.mp_recovery_rate || r.mp_recovery) effects.unshift({ code: 12, dataId: 0, value1: (r.mp_recovery_rate || 0) / 100, value2: r.mp_recovery || 0 });
            if (r.parameter_type && r.parameter_points) effects.push({ code: 42, dataId: [0, 0, 1, 2, 3, 4, 6][r.parameter_type] ?? 0, value1: r.parameter_points, value2: 0 });
            d.effects = effects;
            const base = Number(r.base_damage) || 0;
            d.damage = base ? { type: base < 0 ? (r.damage_to_mp ? 4 : 3) : r.absorb_damage ? (r.damage_to_mp ? 6 : 5) : (r.damage_to_mp ? 2 : 1),
                elementId: list(r.element_set)[0] || 0, formula: damageFormula(r), variance: Number(r.variance ?? 20), critical: false }
                : { type: 0, elementId: 0, formula: '0', variance: 20, critical: false };
            d.animationId = Number(r.animation_id) || 0;
            d.hitType = r.physical_attack ? 1 : 2;
            d.occasion = Number(r.occasion) || 0;
            d.repeats = r.scope === 3 ? 2 : 1;
            d.scope = SCOPE[r.scope] ?? 0;
            d.consumable = r.consumable !== false;
        }
        if (typeof DataManager.extractMetadata === 'function') DataManager.extractMetadata(d);
    }

    /** Copies one entry onto a database slot, the fields the Loot Table moves (and Game_Temp's generator). */
    function copyItem(kind, id, from) {
        const dst = item(kind, id), src = from instanceof LootItem ? from : item(kindOf(from), from.id);
        for (const f of ['name', 'icon_index', 'description', 'note', 'price']) dst[f] = src[f];
        for (const f of kind === 'item' ? ITEM_COPY : FIELDS[kind]) { const v = src[f]; dst[f] = Array.isArray(v) ? v.slice() : v; }
        syncMz(kind, id);
        return dst;
    }

    // ---- the database the game saves ----------------------------------------------------------------
    // The original saved $data_weapons, $data_armors and $data_items with every game and reloaded them at the
    // title. Here each entry that differs from the database as shipped is saved, and put back on load.
    let PRISTINE = null;
    const vxValues = (kind, id) => {
        const r = vxRecord(kind, id);
        if (!r) return null;
        const o = {};
        for (const f of FIELDS[kind]) { const v = r[f]; o[f] = Array.isArray(v) ? v.slice() : v; }
        return o;
    };
    function capturePristine() {
        PRISTINE = {};
        for (const kind of KINDS) {
            PRISTINE[kind] = [];
            for (const d of table(kind) || []) if (d) PRISTINE[kind][d.id] = { mz: JSON.stringify(d), vx: JSON.stringify(vxValues(kind, d.id)) };
        }
    }
    const ensurePristine = () => { if (!PRISTINE && $dataWeapons && $dataArmors && $dataItems) capturePristine(); };
    function applyEntry(kind, id, mz, vx) {
        const d = table(kind)[id];
        if (!d) return;
        if (mz) {
            for (const k of Object.keys(d)) if (!(k in mz)) delete d[k];
            Object.assign(d, mz);
        }
        const r = vxRecord(kind, id);
        if (r && vx) for (const [f, v] of Object.entries(vx)) r[f] = Array.isArray(v) ? v.slice() : v;
    }
    /** Every entry back to the shipped database. */
    function resetDatabase() {
        if (!PRISTINE) return;
        for (const kind of KINDS) {
            for (const d of table(kind) || []) {
                if (!d) continue;
                const p = PRISTINE[kind][d.id];
                if (!p) continue;
                const vx = JSON.stringify(vxValues(kind, d.id));
                if (JSON.stringify(d) !== p.mz || vx !== p.vx) applyEntry(kind, d.id, JSON.parse(p.mz), JSON.parse(p.vx));
            }
        }
    }
    /** The entries that differ from the shipped database: { weapon: { id: { mz, vx } }, armor, item }. */
    function snapshot() {
        ensurePristine();
        const out = { weapon: {}, armor: {}, item: {} };
        for (const kind of KINDS) {
            for (const d of table(kind) || []) {
                if (!d) continue;
                const p = PRISTINE[kind][d.id] || { mz: '', vx: '' };
                const mz = JSON.stringify(d), vx = JSON.stringify(vxValues(kind, d.id));
                if (mz !== p.mz || vx !== p.vx) out[kind][d.id] = { mz: JSON.parse(mz), vx: JSON.parse(vx) };
            }
        }
        return out;
    }
    // Scene_File#do_load patched these back from the database when the game's version changed.
    const PATCHED = { weapon: [[147, 523], [527, 548]], armor: [[162, 487], [491, 496]], item: [[141, 198]] };
    function restore(snap, versionChanged = false) {
        ensurePristine();
        resetDatabase();
        if (!snap) return;
        for (const kind of KINDS) {
            for (const [id, e] of Object.entries(snap[kind] || {})) {
                const n = Number(id);
                if (versionChanged && PATCHED[kind].some(([a, b]) => n >= a && n <= b)) continue;
                applyEntry(kind, n, e.mz, e.vx);
            }
        }
    }

    const _bootStart = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        _bootStart.call(this);
        ensurePristine();
        // Without the battle port the other ports still find records under RRThrallVx.weapon / armor / item.
        for (const kind of KINDS) if (typeof VX[kind] !== 'function') VX[kind] = ownLookups[kind];
        if (typeof VX.of !== 'function') VX.of = vxOf;
    };
    // RGSS loaded its database again at the title, dropping the game's changes to it.
    const _titleStart = Scene_Title.prototype.start;
    Scene_Title.prototype.start = function() {
        ensurePristine();
        resetDatabase();
        FALLBACK = { weapon: [], armor: [], item: [] };
        _titleStart.call(this);
    };
    const _setupNewGame = DataManager.setupNewGame;
    DataManager.setupNewGame = function() {
        ensurePristine();
        resetDatabase();
        _setupNewGame.call(this);
    };
    // Scene_File's port (RR_ThrallMenu, which also keeps the locker) saves the database when it is on; this does without it.
    const fileKeepsDatabase = () => !!(window.RRThrallUi && typeof window.RRThrallUi.restoreDatabase === 'function');
    const _makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _makeSaveContents.call(this);
        if (!fileKeepsDatabase()) contents.rrThrallItems = snapshot();
        return contents;
    };
    const _extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _extractSaveContents.call(this, contents);
        if (fileKeepsDatabase() && !(contents && contents.rrThrallItems)) return;
        const changed = !!($gameSystem && $dataSystem && $gameSystem.versionId() !== $dataSystem.versionId);
        restore(contents && contents.rrThrallItems, changed);
    };

    // ---- Game_System: the loot pity lists (Thrall's Game_System; RR_ThrallJobBoard keeps the same fields) -------
    const WEAPON_TYPES = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5];
    const ARMOR_TYPES = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3];
    const pity = (field, initial) => function() {
        if (!Array.isArray(this[field])) this[field] = initial.slice();
        return this[field];
    };
    if (!Game_System.prototype.rrWeaponTypes) Game_System.prototype.rrWeaponTypes = pity('_rrWeaponTypes', WEAPON_TYPES);
    if (!Game_System.prototype.rrArmorTypes) Game_System.prototype.rrArmorTypes = pity('_rrArmorTypes', ARMOR_TYPES);

    // ---- shared helpers: rarity, favourites, the sort orders (Loot Table and Simple Sort Inventory) ----------
    /** A weapon's or armour's rarity element: 9 mythic, 10 legendary, 11 epic, 12 rare, 13 uncommon, 14 common (0: none). */
    function lootRarity(obj) {
        const r = vxOf(obj);
        if (!r || kindOf(obj) === 'item') return 0;
        for (let e = 9; e <= 14; e++) if ((r.element_set || []).includes(e)) return e;
        return 0;
    }
    const isFavorite = (obj) => { const r = vxOf(obj); return !!(r && kindOf(obj) !== 'item' && (r.element_set || []).includes(18)); };
    /** The favourite element (weapon 527's, armour 491's): taken off when there, added when not. */
    function toggleFavorite(obj) {
        const kind = kindOf(obj);
        if (kind !== 'weapon' && kind !== 'armor') return;
        ensurePristine();
        const r = vxRecord(kind, obj.id), mark = vxRecord(kind, kind === 'weapon' ? 527 : 491);
        const set = (mark && mark.element_set) || [18];
        r.element_set = r.element_set.includes(18) ? minus(r.element_set, set) : r.element_set.concat(set);
        syncMz(kind, obj.id);
    }
    // The orders the Loot Table's (and the inventory's) nested loops give, with $game_variables[100] the sort:
    // 0 by rarity, then type; 1 by type, then rarity. An entry that matches twice is listed twice, as there.
    function sortWeapons(list, mode) {
        const [a, b] = mode === 0 ? [[9, 14], [1, 5]] : [[1, 5], [9, 14]];
        const out = [];
        for (let i = a[0]; i <= a[1]; i++) for (let j = b[0]; j <= b[1]; j++) for (const x of list) { const e = vxOf(x).element_set; if (e.includes(i) && e.includes(j)) out.push(x); }
        return out;
    }
    function sortArmors(list, mode) {
        const [a, b] = mode === 0 ? [[9, 14], [0, 3]] : [[0, 3], [9, 14]];
        const out = [];
        for (let i = a[0]; i <= a[1]; i++) for (let j = b[0]; j <= b[1]; j++) for (const x of list) {
            const r = vxOf(x);
            if (a[0] === 0 ? r.element_set.includes(j) && r.kind === i : r.element_set.includes(i) && r.kind === j) out.push(x);
        }
        return out;
    }
    /** Items by their MP recovery rate (sort 0) or MP recovery (sort 1), each value from `from` to `to`. */
    function sortItems(list, mode, from = 0, to = 56) {
        const out = [];
        for (let i = from; i <= to; i++) for (const x of list) { const r = vxOf(x); if ((mode === 0 ? r.mp_recovery_rate : r.mp_recovery) === i) out.push(x); }
        return out;
    }
    /** Thrall's Game_Party#has_item?: held, or (include_equip) worn by any of actors 1-4, in the party or not. */
    function hasItem(obj, includeEquip = false) {
        const d = mzOf(obj);
        if (!d) return false;
        if ($gameParty.numItems(d) > 0) return true;
        if (includeEquip) for (let i = 1; i <= 4; i++) { const a = $gameActors.actor(i); if (a && a.equips().includes(d)) return true; }
        return false;
    }
    /** party_has_item?: held, or worn by a party member. */
    function partyHasItem(obj, includeEquip = false) {
        const d = mzOf(obj);
        if (!d) return false;
        if ($gameParty.numItems(d) > 0) return true;
        return !!includeEquip && $gameParty.members().some(a => a.equips().includes(d));
    }
    Object.assign(VX, {
        lootRecord: vxRecord, lootItem: wrap, lootKind: kindOf, lootMz: mzOf, lootSync: syncMz, lootCopy: copyItem,
        lootRarity, lootIsFavorite: isFavorite, lootToggleFavorite: toggleFavorite, lootSortWeapons: sortWeapons, lootSortArmors: sortArmors, lootSortItems: sortItems,
        lootHasItem: hasItem, lootPartyHasItem: partyHasItem, lootSnapshot: snapshot, lootRestore: restore, lootEnsurePristine: ensurePristine
    });

    // Game_Party: has_item? with equipment looks at actors 1-4; party_has_item? at the party.
    Game_Party.prototype.isAnyMemberEquipped = function(obj) {
        for (let i = 1; i <= 4; i++) { const a = $gameActors.actor(i); if (a && a.equips().includes(obj)) return true; }
        return false;
    };
    Game_Party.prototype.rrPartyHasItem = function(obj, includeEquip) { return partyHasItem(obj, includeEquip); };
    // Thrall took VX's poison and regeneration on the map out of Game_Party#on_player_walk; VX ran no other turn there.
    Game_Actor.prototype.turnEndOnMap = function() {};

    // ---- Game_Temp#generate_loot ----------------------------------------------------------------------
    const poolsFor = (types, prefixes, groups) => {
        const out = { C: [], U: [], R: [], E: [], L: [], M: [] };
        for (const c of types) { const g = groups[c]; if (!g) continue; for (const r of Object.keys(out)) out[r] = out[r].concat(L(`${r}_${g}`)); }
        return out;
    };
    const WEAPON_GROUPS = { 1: 'SWORDS', 2: 'AXES', 3: 'MACES', 4: 'SPEARS', 5: 'KNIVES' };
    const ARMOR_GROUPS = { 0: 'SHIELD', 1: 'HELM', 2: 'ARMOR', 3: 'ACCESS' };
    /** Array#delete_at(array.index(x)); a value not in the list leaves it as it is (Ruby would raise). */
    const takeOne = (list, value) => { const i = list.indexOf(value); if (i >= 0) list.splice(i, 1); };

    Game_Temp.prototype.rrGenerateLoot = function(iterations, dropRate, level, forceType = 0) {
        ensurePristine();
        const drops = [];
        const system = $gameSystem;
        if (!Array.isArray(system._rrWeaponTypes)) system._rrWeaponTypes = WEAPON_TYPES.slice();
        if (!Array.isArray(system._rrArmorTypes)) system._rrArmorTypes = ARMOR_TYPES.slice();
        dropRate = Array.isArray(dropRate) ? dropRate : [];
        level = Array.isArray(level) ? level : [];
        const W = (id) => item('weapon', id), A = (id) => item('armor', id), I = (id) => item('item', id);
        let indW, indA, indWMax, indAMax, indI, indIMax;
        if (vars(3) >= 3) { indW = 107; indA = 122; indWMax = 116; indAMax = 131; indI = 101; indIMax = 110; }   // shops
        else { indW = 37; indA = 47; indWMax = 76; indAMax = 86; indI = 31; indIMax = 70; }                    // drops and chests
        const clear = (kind, a, b) => { for (let i = a; i <= b; i++) if (table(kind)[i]) table(kind)[i].name = ''; };
        clear('weapon', 37, 76); clear('armor', 47, 86); clear('item', 31, 70);
        if (sw(1)) { clear('weapon', 107, 146); clear('armor', 122, 161); clear('item', 101, 140); }   // the shop's stock is changing

        let source = null;
        for (let i = 1; i <= iterations; i++) {
            if (level[i - 1] > 70) level[i - 1] = 70;
            const lvl = level[i - 1];
            const rate = dropRate[i - 1];
            let type;
            if (forceType !== 0 && forceType != null) type = forceType;
            else if (vars(3) === 3) type = 2;              // weapon shop
            else if (vars(3) === 4) type = 3;              // armour shop
            else if (vars(3) === 5 || rate < 0) type = 1;  // item shop
            else if (vars(83) !== 0) type = vars(83);      // forced loot type
            else type = rand(5) + 1;

            let wp = null, ap = null;
            if (type === 2 || type === 4) {
                const counts = [0, 0, 0, 0, 0];
                for (const c of system._rrWeaponTypes) counts[(c - 1 + 5) % 5] += 1;
                if (!counts.includes(3)) system._rrWeaponTypes = WEAPON_TYPES.slice();
                const types = vars(81) > 0 ? [vars(81)] : [...new Set(system._rrWeaponTypes)];
                wp = poolsFor(types, 'W', WEAPON_GROUPS);
            } else if (type === 3 || type === 5) {
                const counts = [0, 0, 0, 0];
                // counts[c-1]: armour type 0 counts at the end, as Ruby's counts[-1] does.
                for (const c of system._rrArmorTypes) counts[(c - 1 + 4) % 4] += 1;
                if (!counts.includes(3)) system._rrArmorTypes = ARMOR_TYPES.slice();
                const types = vars(81) > 0 ? [vars(81) - 1] : [...new Set(system._rrArmorTypes)];
                ap = poolsFor(types, 'A', ARMOR_GROUPS);
            }
            // Pain raises gold and shard values, up to the threshold.
            let pain = 0;
            for (let p = 141; p <= 150; p++) pain += vars(p);
            const potency = Math.min(pain, vars(151));

            if (type === 1) {
                const chance = vars(85) > 0 || sw(49) || rate < 0 ? rate : rand(rate);
                const room = indI <= indIMax;
                if (chance === -1 && vars(3) !== 5 && room) source = I(pick(L('PAIN_ITEMS')));
                else if (chance === -2 && vars(3) !== 5 && room) source = I(pick(L('LEG_PAIN_ITEMS')));
                else if (chance <= 90 && room) source = I(pick(L('L_ITEMS')));
                else if (chance <= 900 && room) source = I(pick(L('E_ITEMS')));
                else if (chance <= 9000 && room) source = vars(85) > 0 ? I(L('UNIQUE_ITEMS')[vars(85) - 1]) : I(pick(L('R_ITEMS')));
                else if (chance <= 90000 && room) source = I(pick(L('U_ITEMS')));
                else if (chance <= 900000 && room) source = vars(3) !== 5 && rand(4) === 0 ? I(166) : I(pick(L('C_ITEMS')));   // gold, or a common item
                if (chance <= 900000 && room) {
                    const drop = I(indI);
                    drop.name = source.name;
                    drop.icon_index = source.icon_index;
                    drop.description = source.description;
                    drop.note = source.note;
                    drop.price = source.price * lvl;
                    if (drop.name === 'Gold') {
                        drop.price = (lvl * (rand(10) + 1)) * 5;
                        drop.price += idiv(drop.price * potency, 20);
                        drop.name = String(idiv(drop.price, 5)) + ' ' + drop.name;
                    }
                    for (const f of ITEM_COPY) { const v = source[f]; drop[f] = Array.isArray(v) ? v.slice() : v; }
                    if (drop.parameter_type === 1) {   // tomato
                        drop.parameter_points *= lvl;
                        drop.description = drop.description + String(drop.parameter_points);
                    } else if (drop.parameter_type === 3) {   // point shards
                        const p = drop.parameter_points;
                        drop.parameter_points = Math.max(Math.trunc((p * (lvl * potency * 0.1)) / 8), 1);
                        drop.parameter_points += 4;
                        drop.description = drop.description + String(drop.parameter_points);
                    } else if (drop.parameter_type === 4) {   // percentage shards
                        drop.parameter_points = Math.max(idiv(drop.parameter_points * potency, 6), 1);
                        drop.description = drop.description + String(drop.parameter_points) + '%';
                    }
                    syncMz('item', indI);
                    drops.push(drop.vx);
                    indI++;
                }
            } else if (type === 2 || type === 4) {
                const chance = vars(84) > 0 ? vars(84) - 1 : vars(85) > 0 || sw(49) ? rate : rand(rate);
                const room = indW <= indWMax;
                let drop = null, rare = false;
                if (chance === 0 && room && lvl >= 30) {
                    source = W(pick(wp.M));
                    drop = rollTopWeapon(W(indW), source, lvl, 160);
                } else if (chance <= 90 && room) {
                    source = W(pick(wp.L));
                    drop = rollTopWeapon(W(indW), source, lvl, 80);
                } else if (chance <= 900 && room) {
                    source = W(pick(wp.E));
                    drop = rollWeapon(W(indW), source, lvl, () => 2, 40);
                    generatePrefix(drop, source, 3);
                } else if (chance <= 9000 && room) {
                    rare = true;
                    source = W(pick(wp.R));
                    if (vars(85) > 0) source = W(L('UNIQUE_WEAPONS')[vars(85) - 1]);   // unique weapon
                    drop = rollWeapon(W(indW), source, lvl, () => 2, 20);
                    drop.price = drop.price + idiv(drop.price * source.price, 100);
                    generatePrefix(drop, source, 2);
                } else if (chance <= 90000 && room) {
                    source = W(pick(wp.U));
                    drop = rollWeapon(W(indW), source, lvl, () => rand(2) + 1, 10);
                    generatePrefix(drop, source, 1);
                } else if (chance <= 900000 && room) {
                    source = W(pick(wp.C));
                    drop = rollWeapon(W(indW), source, lvl, () => rand(2) + 1, 5);
                    drop.name = source.name;
                }
                if (drop) {
                    if (vars(81) === 0 && !(rare && vars(85) !== 0)) takeOne(system._rrWeaponTypes, drop.element_set[0]);
                    syncMz('weapon', indW);
                    drops.push(drop.vx);
                    indW++;
                }
            } else if (type === 3 || type === 5) {
                const chance = vars(84) > 0 ? vars(84) - 1 : vars(85) > 0 || sw(49) ? rate : rand(rate);
                const room = indA <= indAMax;
                let drop = null, rare = false;
                if (chance === 0 && room && lvl >= 30) {
                    source = A(pick(ap.M));
                    drop = rollTopArmor(A(indA), source, lvl, 160, 7, () => rand(6) + 2);
                } else if (chance <= 90 && room) {
                    source = A(pick(ap.L));
                    drop = rollTopArmor(A(indA), source, lvl, 80, 5, () => rand(6));
                } else if (chance <= 900 && room) {
                    source = A(pick(ap.E));
                    drop = rollArmor(A(indA), source, lvl, 3, 38, 40);
                    generatePrefix(drop, source, 3);
                } else if (chance <= 9000 && room) {
                    rare = true;
                    source = A(pick(ap.R));
                    if (vars(85) > 0) source = A(L('UNIQUE_ARMORS')[vars(85) - 1]);   // unique armour
                    drop = rollArmor(A(indA), source, lvl, 3, 38, 20);
                    generatePrefix(drop, source, 2);
                } else if (chance <= 90000 && room) {
                    source = A(pick(ap.U));
                    drop = rollArmor(A(indA), source, lvl, 2, 36, 10);
                    generatePrefix(drop, source, 1);
                } else if (chance <= 900000 && room) {
                    source = A(pick(ap.C));
                    drop = rollArmor(A(indA), source, lvl, 2, 36, 5);
                    drop.name = source.name;
                }
                if (drop) {
                    if (vars(81) === 0 && !(rare && vars(85) !== 0)) takeOne(system._rrArmorTypes, drop.kind);
                    syncMz('armor', indA);
                    drops.push(drop.vx);
                    indA++;
                }
            }
        }
        return drops;
    };

    /** The fields every rolled weapon takes from its source. */
    function weaponBase(drop, source, lvl) {
        drop.spi = source.spi;
        drop.def = 0;
        drop.icon_index = source.icon_index;
        drop.description = String(lvl);
        drop.critical_bonus = source.critical_bonus;
        drop.two_handed = false;
        drop.dual_attack = false;
        drop.fast_attack = false;
        drop.element_set = source.element_set.slice();
        drop.state_set = source.state_set.slice();
        drop.note = source.note;
        drop.animation_id = source.animation_id;
    }
    /** Epic, rare, uncommon and common weapons: `scale()` is the level multiplier (2, or 1-2 rolled each time). */
    function rollWeapon(drop, source, lvl, scale, priceRate) {
        drop.atk = rand(6) + 10;
        drop.atk += lvl * scale();
        drop.atk *= 2;
        drop.atk += idiv(drop.atk * (rand(21) - 10), 100);
        drop.atk += idiv(drop.atk * source.atk, 100);
        if (drop.atk <= 0) drop.atk = 1;
        drop.agi = rand(6) + 10;
        drop.agi += lvl * scale();
        drop.agi += idiv(drop.agi * (rand(21) - 10), 100);
        drop.agi += idiv(drop.agi * source.agi, 100);
        if (drop.agi <= 0) drop.agi = 1;
        drop.hit = source.hit + (rand(11) - rand(11));
        weaponBase(drop, source, lvl);
        drop.price = (drop.atk + drop.agi) * priceRate;
        drop.price = idiv(drop.price * (drop.spi + drop.hit), 100);
        return drop;
    }
    /** Mythic and legendary weapons: every roll at its best (switch 69, or by luck) adds the PERFECT element. */
    function rollTopWeapon(drop, source, lvl, priceRate) {
        let r;
        if (sw(69)) r = [15, 3, 10, 15, 3, 10, 10];
        else r = [rand(6) + 10, rand(2) + 2, rand(21) - 10, rand(6) + 10, rand(2) + 2, rand(21) - 10, rand(11) - rand(11)];
        const perfect = r[0] === 15 && r[1] === 3 && r[2] === 10 && r[3] === 15 && r[4] === 3 && r[5] === 10 && r[6] === 10;
        drop.atk = r[0];
        drop.atk += lvl * r[1];
        drop.atk *= 2;
        drop.atk += idiv(drop.atk * r[2], 100);
        drop.atk += idiv(drop.atk * source.atk, 100);
        if (drop.atk <= 0) drop.atk = 1;
        drop.agi = r[3];
        drop.agi += lvl * r[4];
        drop.agi += idiv(drop.agi * r[5], 100);
        drop.agi += idiv(drop.agi * source.agi, 100);
        if (drop.agi <= 0) drop.agi = 1;
        drop.hit = source.hit + r[6];
        weaponBase(drop, source, lvl);
        if (perfect) drop.element_set = drop.element_set.concat(vxRecord('weapon', 528).element_set);
        drop.price = (drop.atk + drop.agi) * priceRate;
        drop.price = idiv(drop.price * (drop.spi + drop.hit), 100);
        generatePrefix(drop, source, 3);
        return drop;
    }
    function armorBase(drop, source, lvl) {
        drop.icon_index = source.icon_index;
        drop.description = String(lvl);
        drop.prevent_critical = false;
        drop.half_mp_cost = false;
        drop.double_exp_gain = false;
        drop.auto_hp_recover = false;
        drop.element_set = source.element_set.slice();
        drop.state_set = source.state_set.slice();
        drop.note = source.note;
    }
    /** Defence and resistance (spirit): base 3-5, `perLevel` plus 0-1 a level, ±10%, then the armour type's share. */
    function armorStats(drop, source, lvl, perLevel, hpBase) {
        drop.kind = source.kind;
        drop.def = rand(3) + 3;
        drop.def += lvl * (rand(2) + perLevel);
        drop.def += idiv(drop.def * (rand(21) - 10), 100);
        drop.def = idiv(drop.def * source.def, 100);
        if (drop.def <= 0) drop.def = 1;
        drop.spi = rand(3) + 3;
        drop.spi += lvl * (rand(2) + perLevel);
        drop.spi += idiv(drop.spi * (rand(21) - 10), 100);
        drop.spi = idiv(drop.spi * source.spi, 100);
        if (drop.spi <= 0) drop.spi = 1;
        drop.atk = lvl * (rand(5) + hpBase);   // an armour's atk is its HP
        drop.atk += idiv(drop.atk * (rand(21) - 10), 100);
        drop.atk = idiv(drop.atk * source.atk, 100);
        drop.agi = 0;
        drop.eva = 0;
    }
    function rollArmor(drop, source, lvl, perLevel, hpBase, priceRate) {
        armorStats(drop, source, lvl, perLevel, hpBase);
        for (let n = 0; n < source.eva; n++) drop.eva += rand(6);
        armorBase(drop, source, lvl);
        drop.price = (drop.def + drop.spi + idiv(drop.atk, 4)) * priceRate;
        drop.price += idiv(drop.price * drop.eva, 100);
        return drop;
    }
    /**
     * Mythic and legendary armours. The rolls that decide PERFECT are not the ones the stats use (the stats
     * roll again), as in the original; each evasion roll must be its best (7 mythic, 5 legendary) too.
     */
    function rollTopArmor(drop, source, lvl, priceRate, best, evaRoll) {
        let r;
        if (sw(69)) r = [5, 5, 10, 5, 5, 10, 44, 10];
        else r = [rand(3) + 3, rand(2) + 4, rand(21) - 10, rand(3) + 3, rand(2) + 4, rand(21) - 10, rand(5) + 40, rand(21) - 10];
        let perfect = r[0] === 5 && r[1] === 5 && r[2] === 10 && r[3] === 5 && r[4] === 5 && r[5] === 10 && r[6] === 44 && r[7] === 10;
        armorStats(drop, source, lvl, 4, 40);
        for (let n = 0; n < source.eva; n++) {
            const roll = sw(69) ? best : evaRoll();
            if (roll !== best) perfect = false;
            drop.eva += roll;
        }
        armorBase(drop, source, lvl);
        if (perfect) drop.element_set = drop.element_set.concat(vxRecord('armor', 492).element_set);
        drop.price = (drop.def + drop.spi + idiv(drop.atk, 4)) * priceRate;
        drop.price += idiv(drop.price * drop.eva, 100);
        generatePrefix(drop, source, 3);
        return drop;
    }

    // ---- Game_Temp#generate_prefix ------------------------------------------------------------------
    const rule = (table, key) => table[key] || [];
    const group = (table, key, i) => (Array.isArray(table[key]) && Array.isArray(table[key][i]) ? table[key][i] : []);
    const has = (list, name) => list.includes(name);
    // Trinket (variable 185) prefix pools.
    const W_TRINKET = { 1: 'FIRE', 2: 'ICE', 3: 'SHOCK', 4: 'WEAK', 5: 'HEAVY', 6: 'FAST', 7: 'CRIT', 8: 'MULTI' };
    const UW_TRINKET = { 1: 'Fiery', 2: 'Icy', 3: 'Static', 4: 'Weakening', 5: 'Heavy', 6: 'Light', 7: 'Serrated', 8: 'Double' };
    const A_TRINKET = { 1: 'FIRE', 2: 'ICE', 3: 'SHOCK', 4: 'WEAK', 9: 'REGEN', 10: 'COOL', 11: 'THORNS', 12: 'LUCKY', 13: 'EXP' };
    const UA_TRINKET = { 1: 'Fireproof', 2: 'Insulated', 3: 'Grounded', 4: 'Stable', 9: 'Healing', 10: 'Cooling', 11: 'Spiked', 12: 'Lucky', 13: 'Learned' };
    const ELEMENT_ANIMS = [[8, 18, 2, 14, 22], [9, 19, 3, 15, 23], [10, 20, 4, 16, 24], [95, 96, 97, 98, 99]];

    function generatePrefix(drop, source, rarity) {
        const trinket = rand(100) < 20;
        const t = vars(185);
        let prefix = null, pref;
        if (drop.isWeapon()) {
            const exempt = ['Cosmo', 'Aphrodite', 'Gehenna'];
            let atkMod = 0, priceMod = 0;
            if (rarity === 1) {
                prefix = trinket && UW_TRINKET[t] ? UW_TRINKET[t] : pick(L('UW_PREFIX'));
            } else if (rarity === 2) {
                switch (source.name) {
                    case 'Seraph': pref = minus(minus(minus(minus(L('RW_PREFIX'), L('RW_FIRE_PREFIX')), L('RW_ICE_PREFIX')), L('RW_SHOCK_PREFIX')), L('RW_WEAK_PREFIX')); break;
                    case 'Fiend': pref = L('RW_FIRE_PREFIX').concat(L('RW_ICE_PREFIX'), L('RW_SHOCK_PREFIX')); break;
                    default: pref = trinket && W_TRINKET[t] ? L(`RW_${W_TRINKET[t]}_PREFIX`) : L('RW_PREFIX');
                }
                prefix = pick(pref);
            } else if (rarity === 3) {
                switch (source.name) {
                    case 'Helios': case 'Hellfire': case 'Mars': pref = L('EW_FIRE_PREFIX'); break;
                    case 'Selene': case 'Neptune': case 'Leviathan': pref = L('EW_ICE_PREFIX'); break;
                    case 'Judgement': case 'Faith': case 'Jupiter': case 'Conductor': pref = L('EW_SHOCK_PREFIX'); break;
                    case 'Pluto': case 'Shinobi': pref = L('EW_WEAK_PREFIX'); break;
                    case 'Gehenna': pref = L('EW_FIRE_PREFIX').concat(L('EW_SHOCK_PREFIX')); break;
                    case 'Aphrodite': pref = L('EW_ICE_PREFIX').concat(L('EW_WEAK_PREFIX')); break;
                    case 'Roc': pref = L('EW_FAST_PREFIX'); break;
                    case 'Reaper': pref = L('EW_CRIT_PREFIX'); break;
                    case 'Muramasa': pref = L('EW_MULTI_PREFIX'); break;
                    case 'Reflection': case 'Gloria': pref = minus(minus(minus(minus(L('EW_PREFIX'), L('EW_FIRE_PREFIX')), L('EW_ICE_PREFIX')), L('EW_SHOCK_PREFIX')), L('EW_WEAK_PREFIX')); break;
                    case 'Cosmo': pref = minus(L('EW_FIRE_PREFIX'), L('EW_MULTI_PREFIX')); break;
                    default: pref = trinket && W_TRINKET[t] ? L(`EW_${W_TRINKET[t]}_PREFIX`) : L('EW_PREFIX');
                }
                prefix = pick(pref);
            }
            const bonus = (key, atk, price) => { if (has(rule(WP, key), prefix)) { atkMod += atk; priceMod += price; } };
            bonus('DMG+15%', 15, 15); bonus('DMG+30%', 30, 30); bonus('DMG+45%', 45, 45);
            const dex = (key, pct, price) => { if (has(rule(WP, key), prefix)) { drop.agi = drop.agi + idiv(drop.agi * pct, 100); priceMod += price; } };
            dex('DEX+15%', 15, 15); dex('DEX+30%', 30, 30); dex('DEX+45%', 45, 45);
            const acc = (key, n, price) => { if (has(rule(WP, key), prefix)) { drop.hit = drop.hit + n; priceMod += price; } };
            acc('ACC+10%', 10, 15); acc('ACC+20%', 20, 30); acc('ACC+30%', 30, 45);
            const crit = (key, n, price) => { if (has(rule(WP, key), prefix)) { drop.spi = drop.spi + n; priceMod += price; } };
            crit('CRIT+5%', 5, 15); crit('CRIT+10%', 10, 30); crit('CRIT+15%', 15, 45);
            // Elements: fire, ice and shock add weapon 501/502/503's elements and states; weak adds 504's states.
            const element = [0, 1, 2, 3].find(k => has(group(WP, 'Elements', k), prefix));
            if (element !== undefined) {
                const mark = vxRecord('weapon', 501 + element);
                if (element < 3) drop.element_set = drop.element_set.concat(mark.element_set);
                drop.state_set = drop.state_set.concat(mark.state_set);
                atkMod -= 15;
                priceMod += 15;
                if (!exempt.includes(source.name)) {
                    const type = [1, 2, 3, 4, 5].find(e => drop.element_set.includes(e));
                    if (type !== undefined) drop.animation_id = ELEMENT_ANIMS[element][type - 1];
                }
            }
            // Accessories: heavy (knockback), light (fast), double (multi: weapon 509's element), critical damage.
            if (has(group(WP, 'Accessories', 0), prefix)) { drop.note = source.note + 'HEAVY'; priceMod += 15; }
            else if (has(group(WP, 'Accessories', 1), prefix)) { drop.fast_attack = true; priceMod += 15; }
            else if (has(group(WP, 'Accessories', 2), prefix)) {
                drop.element_set = drop.element_set.concat(vxRecord('weapon', 509).element_set);
                atkMod -= source.name === 'Muramasa' ? 25 : 40;
                priceMod += 15;
            } else if (has(group(WP, 'Accessories', 3), prefix)) { drop.critical_bonus = true; priceMod += 15; }
            drop.atk += idiv(drop.atk * atkMod, 100);
            drop.price += idiv(drop.price * priceMod, 100);
            drop.name = prefix + ' ' + source.name;
        } else {
            let priceMod = 0;
            if (rarity === 1) {
                prefix = trinket && UA_TRINKET[t] ? UA_TRINKET[t] : pick(L('UA_PREFIX'));
            } else if (rarity === 2) {
                switch (source.name) {
                    case 'Turtle': pref = minus(L('RA_PREFIX'), L('RA_HP_PREFIX')); break;
                    case 'Curse': case 'Avatar': pref = L('RA_REGEN_PREFIX'); break;
                    case 'Phantom': pref = L('RA_HP_PREFIX'); break;
                    case 'Spite': pref = L('RA_THORNS_PREFIX'); break;
                    default: pref = trinket && A_TRINKET[t] ? L(`RA_${A_TRINKET[t]}_PREFIX`) : L('RA_PREFIX');
                }
                prefix = pick(pref);
            } else if (rarity === 3) {
                const named = { Prince: 'THORNS', Mantle: 'LUCKY', Ruby: 'FIRE', Sapphire: 'ICE', Amethyst: 'SHOCK', Goddess: 'REGEN', Emperor: 'HP', Icarus: 'COOL' }[source.name];
                if (named) pref = L(`EA_${named}_PREFIX`);
                else pref = trinket && A_TRINKET[t] ? L(`EA_${A_TRINKET[t]}_PREFIX`) : L('EA_PREFIX');
                prefix = pick(pref);
            }
            const stat = (key, field) => { if (has(rule(AP, key), prefix)) { drop[field] = drop[field] + idiv(drop[field] * 20, 100); priceMod += 20; } };
            stat('DEF+20%', 'def'); stat('RES+20%', 'spi'); stat('HP+20%', 'atk');
            if (has(rule(AP, 'EVA+5%'), prefix)) { drop.eva = drop.eva + 5; priceMod += 20; }
            // Elements: armour 118/119/120's elements and states (fire, ice, shock); weak takes 121's states.
            const element = [0, 1, 2, 3].find(k => has(group(AP, 'Elements', k), prefix));
            if (element !== undefined) {
                const mark = vxRecord('armor', 118 + element);
                if (element < 3) drop.element_set = drop.element_set.concat(mark.element_set);
                drop.state_set = drop.state_set.concat(mark.state_set);
                priceMod += 20;
            }
            if (has(group(AP, 'Accessories', 0), prefix)) { drop.auto_hp_recover = true; priceMod += 20; }
            else if (has(group(AP, 'Accessories', 1), prefix)) {
                drop.half_mp_cost = true;
                drop.note = source.note + (source.name === 'Icarus' ? ' \\recharge[-4]' : ' \\recharge[-1]');
                priceMod += 20;
            } else if (has(group(AP, 'Accessories', 2), prefix)) { drop.prevent_critical = true; priceMod += 20; }
            else if (has(group(AP, 'Accessories', 3), prefix)) { drop.double_exp_gain = true; priceMod += 20; }
            else if (has(group(AP, 'Accessories', 4), prefix)) { drop.note = source.note + 'THORNS'; priceMod += 20; }
            drop.price += idiv(drop.price * priceMod, 100);
            drop.name = prefix + ' ' + source.name;
        }
        return drop;
    }
    VX.lootGeneratePrefix = generatePrefix;

    // ---- actor comparisons (Thrall's Game_Actor, through the battle and actor ports when they are on) ----------
    /** Game_Actor#equips as LootItems: weapon, shield (or the second weapon), helmet, armour, accessory. */
    const equipsOf = (actor) => (actor._equips || []).map(e => (e && e.object() ? wrap(e.object()) : null));
    /** Game_Actor#weapons: the weapon, and the second one of a two-sword fighter. */
    const weaponsOf = (actor) => equipsOf(actor).filter((e, i) => i === 0 || (i === 1 && e && e.isWeapon()));
    const learned = (actor, id) => (typeof actor.rrVxSkillLearn === 'function' ? actor.rrVxSkillLearn(id) : actor.isLearnedSkill(id));
    const baseAtk = (a) => (typeof a.rrVxBaseAtk === 'function' ? a.rrVxBaseAtk() : a.param(2));
    const baseAgi = (a) => (typeof a.rrVxBaseAgi === 'function' ? a.rrVxBaseAgi() : a.param(6));
    const cri = (a) => (typeof a.rrVxCri === 'function' ? a.rrVxCri() : Math.round(a.cri * 100));
    /** Game_Actor#wpn_hit: the weapon's hit (80 bare-handed), Falcon +10, Practiced +10, Precision +5. */
    function wpnHit(a) {
        if (typeof a.rrVxWpnHit === 'function') return a.rrVxWpnHit();
        const w = weaponsOf(a)[0];
        let n = w ? w.hit : 80;
        for (const e of equipsOf(a).filter(Boolean)) {
            if (nameWord(e, 1) === 'Falcon') n += 10;
            if (e.isWeapon() && (e.element_set.includes(2) || e.element_set.includes(29)) && learned(a, 167)) n += 10;
        }
        if (learned(a, 133)) n += 5;
        return Math.max(n, 0);
    }
    /** Game_Actor#wpn_cri: the weapons' spirit, Watcher's bonus as HP falls. */
    function wpnCri(a) {
        if (typeof a.rrVxWpnCri === 'function') return a.rrVxWpnCri();
        let n = 0;
        for (const w of weaponsOf(a).filter(Boolean)) {
            n += w.spi;
            if (nameWord(w, 1) === 'Watcher') n += idiv(100 - idiv(a.hp * 100, a.mhp), 2);
        }
        return n;
    }
    /** The actor with `weapon` in hand instead (actor.clone + change_equip(0, item, true)). */
    function withWeapon(actor, weapon) {
        const temp = Object.assign(Object.create(Object.getPrototypeOf(actor)), actor);
        temp._equips = (actor._equips || []).map(e => { const g = new Game_Item(); if (e) g.setObject(e.object()); return g; });
        if (!temp._equips[0]) temp._equips[0] = new Game_Item();
        temp._equips[0].setObject(mzOf(weapon));
        return temp;
    }
    const WEAPON_MODS = (w) => {
        let m = 0;
        for (const s of [1, 2, 3, 4, 5]) if (w.state_set.includes(s)) m += 35;
        if (w.note.includes('HEAVY')) m += 15;
        if (w.element_set.includes(16)) m += 55;
        if (w.fast_attack) m += 15;
        if (w.critical_bonus) m += 15;
        if (w.element_set.includes(12)) m += 5;
        if (w.element_set.includes(11)) m += 10;
        if (w.element_set.includes(10)) m += 15;
        if (w.element_set.includes(9)) m += 15;
        return m;
    };
    const ARMOR_MODS = (a) => {
        let m = 0;
        for (const s of [2, 3, 4, 5]) if (a.state_set.includes(s)) m += 10;
        if (a.note.includes('THORNS')) m += 10;
        for (const f of ['auto_hp_recover', 'half_mp_cost', 'prevent_critical', 'double_exp_gain']) if (a[f]) m += 10;
        return m;
    };
    /** The arrow beside an entry: 861 worse than the actor's own by over a tenth, 862 (863 on skin 1-3) better. */
    function compareIcon(obj, actor) {
        const it = wrap(obj);
        if (!it || !actor) return 0;
        let flag1 = 0, flag2 = 0, mod1 = 100, mod2 = 100;
        if (it.isWeapon()) {
            const temp = withWeapon(actor, obj);
            const newAtk = baseAtk(temp), newAgi = baseAgi(temp), newHit = wpnHit(temp), newCri = cri(temp);
            const it2 = equipsOf(actor)[0];
            if (it2) { mod1 += WEAPON_MODS(it); mod2 += WEAPON_MODS(it2); }
            flag1 = idiv(idiv(newAtk * mod1, 100), 2) + newAgi;
            flag1 = idiv(flag1 * (newHit + newCri), 100);
            flag2 = idiv(idiv(baseAtk(actor) * mod2, 100), 2) + baseAgi(actor);
            flag2 = idiv(flag2 * (wpnHit(actor) + cri(actor)), 100);
        } else if (it.isArmor()) {
            const it2 = equipsOf(actor)[it.kind + 1];
            if (it2) { mod1 += ARMOR_MODS(it); mod2 += ARMOR_MODS(it2); }
            flag1 = idiv((it.def + it.spi) * mod1, 100) + idiv(it.atk, 10);
            flag1 = idiv(flag1 * (100 + it.eva), 100);
            if (it2) {
                flag2 = idiv((it2.def + it2.spi) * mod2, 100) + idiv(it2.atk, 10);
                flag2 = idiv(flag2 * (100 + it2.eva), 100);
            }
        }
        if (flag1 < flag2) return flag2 - flag1 > idiv(flag2, 10) ? 861 : 0;
        if (flag1 > flag2 && flag1 - flag2 > idiv(flag1, 10)) return vars(80) > 0 ? 863 : 862;
        return 0;
    }
    VX.lootCompareIcon = compareIcon;

    // ---- windows ------------------------------------------------------------------------------------
    // VX metrics: padding 16, lines 24 tall; text, colours and icons through RR_VxCompat's rrVx methods.
    const vx = {
        color(w, n) { return w.rrVxTextColor ? w.rrVxTextColor(n) : ColorManager.textColor(n); },
        normal(w) { return w.rrVxNormalColor ? w.rrVxNormalColor() : ColorManager.normalColor(); },
        system(w) { return w.rrVxSystemColor ? w.rrVxSystemColor() : ColorManager.systemColor(); },
        up(w) { return w.rrVxPowerUpColor ? w.rrVxPowerUpColor() : ColorManager.powerUpColor(); },
        down(w) { return w.rrVxPowerDownColor ? w.rrVxPowerDownColor() : ColorManager.powerDownColor(); },
        text(w, x, y, width, height, text, align = 0) {
            if (w.rrVxDrawText) w.rrVxDrawText(x, y, width, height, text, align);
            else w.contents.drawText(String(text), x, y, width, height, ['left', 'center', 'right'][align] || 'left');
        },
        icon(w, index, x, y, enabled = true) { if (w.rrVxDrawIcon) w.rrVxDrawIcon(index, x, y, enabled); else w.drawIcon(index, x, y); },
        itemName(w, obj, x, y, enabled = true) {
            const d = mzOf(obj);
            if (!d) return;
            if (w.rrVxDrawItemName) w.rrVxDrawItemName(d, x, y, enabled); else w.drawItemName(d, x, y, 196);
        }
    };
    VX.lootDraw = vx;
    const vxWindow = (proto) => {
        proto.updatePadding = function() { this.padding = 16; };
        proto.lineHeight = function() { return WLH; };
    };
    const vxList = (proto) => {
        vxWindow(proto);
        proto.itemHeight = function() { return WLH; };
        // Thrall's lists page with nothing: A and S are the scenes' own keys.
        proto.cursorPagedown = function() {};
        proto.cursorPageup = function() {};
    };
    /** VX `window.index = i`: select, and scroll the cursor into view. */
    const setIndex = (win, i) => { win.select(i); if (i >= 0 && win.maxItems() > 0) win.ensureCursorVisible(false); };
    VX.lootSetIndex = setIndex;

    /** Loot and backpack lists: rows of `_data` (MZ records), the arrow and level marks with an actor to compare. */
    function makeList(name, defaults, inventory) {
        function Win() { this.initialize(...arguments); }
        Win.prototype = Object.create(Window_Selectable.prototype);
        Win.prototype.constructor = Win;
        vxList(Win.prototype);
        Win.prototype.initialize = function(x = defaults[0], y = defaults[1], width = defaults[2], height = defaults[3]) {
            Window_Selectable.prototype.initialize.call(this, new Rectangle(x, y, width, height));
            this._data = [];
            this._actorIndex = null;
            if (inventory) { this.deselect(); this.deactivate(); } else { this.select(0); this.activate(); }
        };
        Win.prototype.maxItems = function() { return this._data.length; };
        Win.prototype.item = function() { return this._data[this.index()] || null; };
        /** refresh(list, actor_i): `actorIndex` a party index, or null. */
        Win.prototype.setData = function(list, actorIndex = null) {
            this._data = list.slice();
            this._actorIndex = actorIndex;
            setVar(inventory ? 2 : 4, this._data.length);
            this.refresh();
        };
        Win.prototype.drawItem = function(index) {
            const obj = this._data[index];
            if (!obj) return;
            const rect = this.itemRect(index);
            rect.width -= 4;
            const actor = this._actorIndex != null ? $gameParty.members()[this._actorIndex] : null;
            if (!sw(68) && actor) {
                const ic = compareIcon(obj, actor);
                if (ic !== 0) vx.icon(this, ic, rect.x, rect.y, true);
            }
            const levelMark = () => {
                const k = kindOf(obj);
                if ((k === 'weapon' || k === 'armor') && actor && toI(mzOf(obj).description) > actor.level) vx.icon(this, 743, rect.x, rect.y, true);
            };
            if (inventory) levelMark();
            vx.itemName(this, obj, rect.x, rect.y, true);
            if (!inventory) levelMark();
            this.changeTextColor(vx.normal(this));
            if (vars(3) >= 3 && vars(3) < 6) {   // shop prices: the loot side buys at price, the backpack sells at a fifth
                const price = mzOf(obj).price;
                vx.text(this, rect.x, rect.y, rect.width, rect.height, String(inventory ? idiv(price, 5) : price) + 'G', 2);
            }
        };
        window[name] = Win;
        return Win;
    }
    const Window_RRThrallLoot = makeList('Window_RRThrallLoot', [0, 56, 304, 264], false);
    const Window_RRThrallInventory = makeList('Window_RRThrallInventory', [304, 56, 304, 264], true);

    function plainWindow(name, defaults, refresh) {
        function Win() { this.initialize(...arguments); }
        Win.prototype = Object.create(Window_Base.prototype);
        Win.prototype.constructor = Win;
        vxWindow(Win.prototype);
        Win.prototype.initialize = function(x = defaults[0], y = defaults[1], width = defaults[2], height = defaults[3]) {
            Window_Base.prototype.initialize.call(this, new Rectangle(x, y, width, height));
            if (refresh) this.refresh(...(defaults[4] || []));
        };
        if (refresh) Win.prototype.refresh = refresh;
        window[name] = Win;
        return Win;
    }

    /** The Loot Table's left label: Loot, Storage, Locker, Shop or the crafting offer, with its count. */
    plainWindow('Window_RRThrallLabel', [0, 0, 304, 56, [1]], function(type) {
        this.contents.clear();
        this.changeTextColor(vx.normal(this));
        const v3 = vars(3), n = vars(4);
        let text;
        const full = (cap) => { if (n >= cap) this.changeTextColor(vx.down(this)); };
        if (v3 === 1 && type === 0) { full(vars(8)); text = `Storage: Armors ${n}/${vars(8)}`; }
        else if (v3 === 1 && type === 1) { full(vars(7)); text = `Storage: Weapons ${n}/${vars(7)}`; }
        else if (v3 === 1 && type === 2) { full(vars(27)); text = `Storage: Items ${n}/${vars(27)}`; }
        else if (v3 === 2 && type === 0) { full(3); text = `Locker: Armors ${n}/3`; }
        else if (v3 === 2 && type === 1) { full(3); text = `Locker: Weapons ${n}/3`; }
        else if (v3 === 3) text = 'Shop: Weapons';
        else if (v3 === 4) text = 'Shop: Armors';
        else if (v3 === 5) text = 'Shop: Items';
        else if (v3 === 6) { if (n >= 3) this.changeTextColor(vx.up(this)); text = `Offer Weapons: ${n}/3`; }
        else if (v3 === 7) { if (n >= 3) this.changeTextColor(vx.up(this)); text = `Offer Armors: ${n}/3`; }
        else text = 'Loot';
        vx.text(this, 0, 0, 272, 24, text, 1);
    });

    /** The right label: the backpack and its capacity, with the page keys; gold and room in a shop or at crafting. */
    plainWindow('Window_RRThrallLabel2', [304, 0, 304, 56, [false]], function(type) {
        this.contents.clear();
        this.changeTextColor(vx.normal(this));
        const v3 = vars(3), n = vars(2);
        const room = (cap, label) => {
            if (n >= cap) this.changeTextColor(vx.down(this));
            vx.text(this, 136, 0, 136, 24, `${label}: ${n}/${cap}`, 1);
        };
        if (v3 >= 3 && v3 <= 5) {
            vx.text(this, 0, 0, 136, 24, `Gold: ${$gameParty.gold()}G`, 1);
            room(vars(v3 === 3 ? 5 : v3 === 4 ? 6 : 26), v3 === 3 ? 'WPNS' : v3 === 4 ? 'ARMS' : 'ITEM');
        } else if (v3 === 6 || v3 === 7) {
            vx.text(this, 0, 0, 136, 24, `Materials: ${vars(89)}`, 1);
            room(vars(v3 === 6 ? 5 : 6), v3 === 6 ? 'WPNS' : 'ARMS');
        } else {
            vx.icon(this, readInput(3), 0, 0);
            vx.icon(this, readInput(4), 248, 0);
            let text;
            if (type === 0) { if (n >= vars(6)) this.changeTextColor(vx.down(this)); text = `Backpack: Armors ${n}/${vars(6)}`; }
            else if (type === 1) { if (n >= vars(5)) this.changeTextColor(vx.down(this)); text = `Backpack: Weapons ${n}/${vars(5)}`; }
            else { if (n >= vars(26)) this.changeTextColor(vx.down(this)); text = `Backpack: Items ${n}/${vars(26)}`; }
            vx.text(this, 24, 0, 224, 24, text, 1);
        }
    });

    /** The key bar: sort, favourite, and compare (not at crafting). */
    plainWindow('Window_RRThrallOptions', [0, 424, 608, 56, []], function() {
        this.contents.clear();
        this.changeTextColor(vx.normal(this));
        vx.icon(this, readInput(6), 0, 0);
        vx.text(this, 28, 0, 140, 24, vars(100) === 0 ? 'Sort: Rarity' : 'Sort: Type', 0);
        let text = 'Favorite';
        let x = idiv(this.contents.width - this.textWidth(text), 2);
        vx.icon(this, readInput(0), x - 14, 0);
        vx.text(this, x + 14, 0, 140, 24, text, 0);
        if (vars(3) < 6) {
            text = 'Compare';
            x = this.contents.width - this.textWidth(text);
            vx.icon(this, readInput(5), x - 28, 0);
            vx.text(this, x, 0, 140, 24, 'Compare', 0);
        }
    });

    // ---- Window_Stats: an entry's details --------------------------------------------------------------
    const ELEMENT_ICONS = { 1: 738, 2: 739, 3: 740, 4: 741, 5: 742 };
    function stateIcons(ids) {
        const out = [];
        for (const id of ids) {
            if ([49, 50, 51].includes(id)) continue;
            const s = $dataStates[id];
            if (!s || !s.iconIndex) continue;
            if (!out.includes(s.iconIndex)) out.push(s.iconIndex);
        }
        return out;
    }
    const Window_RRThrallStats = plainWindow('Window_RRThrallStats', [0, 320, 608, 104], null);
    /** The windowskin: Window, or Window1-3 by variable 80; WindowP… for a PERFECT (element 23) weapon or armour. */
    Window_RRThrallStats.prototype.updateSkin = function(obj) {
        const mode = vars(80);
        let name = mode > 0 ? 'Window' + mode : 'Window';
        const r = wrap(obj);
        if (r && !r.isItem() && r.element_set.includes(23)) name = mode > 0 ? 'WindowP' + mode : 'WindowP';
        if (this._rrSkin !== name) { this._rrSkin = name; this.windowskin = ImageManager.loadSystem(name); }
    };
    /** refresh(index, items, actor): `actor` a party index or null; Ruby's 0 counts as an actor. */
    Window_RRThrallStats.prototype.refresh = function(index, items, actorIndex = null) {
        this.contents.clear();
        items = items || [];
        const obj = at(items, index);
        this.updateSkin(obj);
        if (!items.length) return;
        vx.itemName(this, obj, 0, 0, true);
        const it = wrap(obj);
        if (!it) return;
        const actor = actorIndex != null ? $gameParty.members()[actorIndex] : null;
        const label = (x, y, w, text) => { this.changeTextColor(vx.system(this)); vx.text(this, x, y, w, 24, text, 0); };
        const versus = (mine, theirs, text) => {
            if (theirs === undefined) { this.changeTextColor(vx.normal(this)); return text; }
            if (mine > theirs) { this.changeTextColor(vx.up(this)); return text + (sw(37) ? ' (O)' : ''); }
            if (mine < theirs) { this.changeTextColor(vx.down(this)); return text + (sw(37) ? ' (X)' : ''); }
            this.changeTextColor(vx.normal(this));
            return text;
        };
        const sell = (x, w) => {
            label(x, WLH * 2, 45, 'SELL:');
            this.changeTextColor(vx.normal(this));
            vx.text(this, x + 49, WLH * 2, w, 24, String(idiv(mzOf(obj).price, 5)) + 'G', 0);
        };
        const lvl = () => {
            label(0, WLH * 2, 45, 'LVL:');
            let text = it.description;
            if (actor) {
                if (toI(text) > actor.level) { this.changeTextColor(vx.color(this, 14)); if (sw(37)) text += ' (X)'; }
                else this.changeTextColor(vx.normal(this));
            } else this.changeTextColor(vx.normal(this));
            vx.text(this, 49, WLH * 2, 89, 24, text, 0);
        };
        const icons = (list, dx) => { for (const icon of list) { vx.icon(this, icon, dx, WLH * 2); dx += 24; } };
        const flavor = () => {
            const m = /\\FLAVOR\[(.*?)\]/i.exec(it.note);
            this.changeTextColor(vx.color(this, 14));
            vx.text(this, 288, 0, 288, 24, m ? m[1] : '', 0);
        };
        if (it.isItem()) {
            label(0, WLH, 50, 'Effect:');
            this.changeTextColor(vx.normal(this));
            vx.text(this, 55, WLH, 467, 24, it.description, 0);
            this.changeTextColor(vx.system(this));
            vx.text(this, 0, WLH * 2, 50, 24, 'SELL:', 0);
            this.changeTextColor(vx.normal(this));
            vx.text(this, 55, WLH * 2, 73, 24, String(idiv(mzOf(obj).price, 5)) + 'G', 0);
            icons(stateIcons(it.minus_state_set), 128);
        } else if (it.isArmor()) {
            const worn = actor ? equipsOf(actor)[it.kind + 1] : null;
            const cmp = (field) => (worn ? worn[field] : undefined);
            label(0, WLH, 45, 'HP:'); vx.text(this, 49, WLH, 89, 24, versus(it.atk, cmp('atk'), String(it.atk)), 0);
            label(146, WLH, 45, 'DEF:'); vx.text(this, 195, WLH, 89, 24, versus(it.def, cmp('def'), String(it.def)), 0);
            label(292, WLH, 45, 'RES:'); vx.text(this, 341, WLH, 89, 24, versus(it.spi, cmp('spi'), String(it.spi)), 0);
            label(438, WLH, 45, 'EVA:'); vx.text(this, 487, WLH, 89, 24, versus(it.eva, cmp('eva'), it.eva + '%'), 0);
            this.changeTextColor(vx.normal(this));
            const extra = it.prevent_critical ? 'LESSCRIT' : it.half_mp_cost ? 'COOLDOWN' : it.auto_hp_recover ? 'REGEN' : it.double_exp_gain ? 'BONUS EXP' : it.note.includes('THORNS') ? 'THORNS' : '';
            if (extra) vx.text(this, 292, WLH * 2, 138, 24, extra, 0);
            lvl();
            sell(146, 89);
            icons(stateIcons(it.state_set), 438);
            flavor();
        } else if (it.isWeapon()) {
            const held = actor ? equipsOf(actor)[0] : null;
            const cmp = (field) => (held ? held[field] : undefined);
            label(0, WLH, 45, 'DMG:'); vx.text(this, 49, WLH, 89, 24, versus(it.atk, cmp('atk'), String(it.atk)), 0);
            label(146, WLH, 45, 'DEX:'); vx.text(this, 195, WLH, 89, 24, versus(it.agi, cmp('agi'), String(it.agi)), 0);
            label(292, WLH, 45, 'ACC:'); vx.text(this, 341, WLH, 89, 24, versus(it.hit, cmp('hit'), it.hit + '%'), 0);
            const n = it.spi;
            label(438, WLH, 45, 'CRIT:'); vx.text(this, 487, WLH, 89, 24, versus(n, held ? wpnCri(actor) : undefined, n + '%'), 0);
            this.changeTextColor(vx.normal(this));
            const extra = it.fast_attack ? 'FAST' : it.note.includes('HEAVY') ? 'KNOCKBACK' : it.element_set.includes(16) ? 'MULTI' : it.critical_bonus ? 'CRITDMG' : '';
            if (extra) vx.text(this, 292, WLH * 2, 138, 24, extra, 0);
            lvl();
            sell(146, 89);
            const shown = [];
            for (const e of it.element_set) if (ELEMENT_ICONS[e]) shown.push(ELEMENT_ICONS[e]);
            for (const icon of stateIcons(it.state_set)) if (!shown.includes(icon)) shown.push(icon);
            icons(shown, 438);
            flavor();
        }
    };

    // ---- Window_Confirm (Thrall's 072): the salvage and crafting prompt ---------------------------------
    // The menus port may bring the same window under the same name; this one stands in until then.
    if (typeof window.Window_RRThrallConfirm !== 'function') {
        const Window_RRThrallConfirm = function() { this.initialize(...arguments); };
        Window_RRThrallConfirm.prototype = Object.create(Window_Selectable.prototype);
        Window_RRThrallConfirm.prototype.constructor = Window_RRThrallConfirm;
        vxList(Window_RRThrallConfirm.prototype);
        Window_RRThrallConfirm.prototype.initialize = function() {
            Window_Selectable.prototype.initialize.call(this, new Rectangle(168, 156, 272, 104));
            this._data = [];
            this.deselect();
            this.deactivate();
            this.opacity = 0;
        };
        Window_RRThrallConfirm.prototype.maxItems = function() { return this._data.length; };
        // Rows start one line down, under the question.
        Window_RRThrallConfirm.prototype.itemRect = function(index) {
            const rect = Window_Selectable.prototype.itemRect.call(this, index);
            rect.y += WLH;
            return rect;
        };
        Window_RRThrallConfirm.prototype.refresh = function(inventory = false) {
            let text;
            if (vars(3) > 5) { text = `Crafting Cost: ${vars(82)} Materials.`; this._data = ['Craft', 'Cancel']; }
            else { text = inventory ? 'Salvage item?' : 'Salvage remaining loot?'; this._data = ['Yes', 'No']; }
            this.contents.clear();
            this.changeTextColor(vx.normal(this));
            vx.text(this, 0, 0, 240, 24, text, 1);
            for (let i = 0; i < this._data.length; i++) this.drawItem(i);
            this.opacity = 255;
            this.select(0);
            this.activate();
        };
        Window_RRThrallConfirm.prototype.drawItem = function(index) {
            const rect = this.itemRect(index);
            this.changeTextColor(vx.normal(this));
            vx.text(this, rect.x + 4, rect.y, rect.width - 8, WLH, this._data[index], 1);
        };
        Window_RRThrallConfirm.prototype.hide = function() {
            this.contents.clear();
            this.deselect();
            this.deactivate();
            this.opacity = 0;
        };
        window.Window_RRThrallConfirm = Window_RRThrallConfirm;
    }

    // ---- Scene_LootTable ---------------------------------------------------------------------------------
    /** The weapons, armours or items in a slot range that have a name, in the table's sort. */
    function slots(kind, from, to, mode) {
        const list = [];
        for (let i = from; i <= to; i++) { const d = table(kind)[i]; if (d && d.name !== '') list.push(d); }
        return kind === 'weapon' ? sortWeapons(list, mode) : kind === 'armor' ? sortArmors(list, mode) : sortItems(list, mode);
    }
    /** Leaving the table empties the loot slots, and the shops' past their first ten. */
    function clearLootSlots() {
        const clear = (kind, a, b) => { for (let i = a; i <= b; i++) if (table(kind)[i]) table(kind)[i].name = ''; };
        clear('weapon', 37, 76); clear('weapon', 117, 146);
        clear('armor', 47, 86); clear('armor', 132, 161);
        clear('item', 31, 70); clear('item', 111, 140);
    }
    /** $scene = Scene_Map.new: back to the map scene under this one, or a new one. */
    function returnToMap() {
        const stack = SceneManager._stack || [];
        if (stack.length && stack[stack.length - 1] === Scene_Map) SceneManager.pop();
        else SceneManager.goto(Scene_Map);
    }
    VX.lootReturnToMap = returnToMap;
    /** Scene_Equip's Window_EquipStats (the menus port's), for the comparison; none without it. */
    const equipStats = (x) => {
        const C = window.Window_ThrallEquipStats || window.Window_RRThrallEquipStats;
        return typeof C === 'function' ? new C(x, 56, 304, 264) : null;
    };
    /** Window_Confirm: the menus port's (Window_ThrallConfirm), or this plugin's stand-in. */
    const confirmWindow = () => new (window.Window_ThrallConfirm || window.Window_RRThrallConfirm)();
    const showConfirm = (w, inventory = false) => (w.rrRefresh ? w.rrRefresh(inventory) : w.refresh(inventory));
    const hideConfirm = (w) => (w.rrHide ? w.rrHide() : w.hide());
    Object.assign(VX, { lootConfirmWindow: confirmWindow, lootShowConfirm: showConfirm, lootHideConfirm: hideConfirm });

    function Scene_RRThrallLootTable() { this.initialize(...arguments); }
    Scene_RRThrallLootTable.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallLootTable.prototype.constructor = Scene_RRThrallLootTable;
    Scene_RRThrallLootTable.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this._lootWindow = new Window_RRThrallLoot();
        this._inventoryWindow = new Window_RRThrallInventory();
        this._statsWindow = new Window_RRThrallStats(0, 320, 608, 104);
        this._confirmWindow = confirmWindow();
        this._labelWindow = new window.Window_RRThrallLabel();
        this._label2Window = new window.Window_RRThrallLabel2();
        this._optionsWindow = new window.Window_RRThrallOptions();
        for (const w of [this._lootWindow, this._inventoryWindow, this._statsWindow, this._labelWindow, this._label2Window, this._optionsWindow, this._confirmWindow]) this.addWindow(w);
        this._backpack = vars(3) === 4 ? 0 : vars(3) === 5 ? 2 : 1;
        this._lastIndex = 0;
        this._tempIndex = 0;
        this._tempActive = false;
        this._statusWindow = null;
        this._actorIndex = 0;
        this.refreshLoot();
        this.refreshInventory();
        this._lootWindow.setData(this._loot);
        this._inventoryWindow.setData(this._inventory);
        this._labelWindow.refresh(this._backpack);
        this._label2Window.refresh(this._backpack);
        this._statsWindow.refresh(0, this._loot);
    };
    Scene_RRThrallLootTable.prototype.statusVisible = function() { return !!this._statusWindow; };
    Scene_RRThrallLootTable.prototype.refreshLoot = function() {
        const mode = vars(100), b = this._backpack, v3 = vars(3);
        let range;
        if (v3 === 1) range = b === 0 ? ['armor', 87, 86 + vars(8)] : b === 1 ? ['weapon', 77, 76 + vars(7)] : ['item', 71, 70 + vars(27)];   // storage
        else if (v3 === 2) range = b === 0 ? ['armor', 488, 490] : b === 1 ? ['weapon', 524, 526] : null;                                     // locker
        else if (v3 === 3) range = ['weapon', 107, 146];
        else if (v3 === 4) range = ['armor', 122, 161];
        else if (v3 === 5) range = ['item', 101, 140];
        if (range !== undefined) this._loot = range ? slots(range[0], range[1], range[2], mode) : [];
        else this._loot = slots('weapon', 37, 76, mode).concat(slots('armor', 47, 86, mode), slots('item', 31, 70, mode));   // loot
        setVar(4, this._loot.length);
    };
    Scene_RRThrallLootTable.prototype.refreshInventory = function() {
        const mode = vars(100);
        const held = (kind, to) => { const list = []; for (let i = 1; i <= to; i++) { const d = table(kind)[i]; if (d && hasItem(d, false)) list.push(d); } return list; };
        if (this._backpack === 0) this._inventory = sortArmors(held('armor', 16 + vars(6)), mode);
        else if (this._backpack === 1) this._inventory = sortWeapons(held('weapon', 4 + vars(5)), mode);
        else this._inventory = sortItems(held('item', vars(26)), mode);
        setVar(2, this._inventory.length);
    };
    Scene_RRThrallLootTable.prototype.actorEquipFor = function(obj) {
        const r = wrap(obj);
        const slot = r && r.isArmor() ? r.kind + 1 : 0;
        const actor = $gameParty.members()[this._actorIndex];
        return actor ? equipsOf(actor)[slot] || null : null;
    };
    Scene_RRThrallLootTable.prototype.updateStatus = function() {
        let obj;
        if (this._inventoryWindow.index() >= 0) obj = this._inventory[this._inventoryWindow.index()];
        else if (this._lootWindow.index() >= 0) obj = this._loot[this._lootWindow.index()];
        const worn = obj ? this.actorEquipFor(obj) : undefined;
        if (this._statusWindow) {
            const actor = $gameParty.members()[this._actorIndex];
            const mz = worn ? mzOf(worn) : null;
            if (this._statusWindow.rrSetItem) this._statusWindow.rrSetItem(mz, actor, 1);
            else if (this._statusWindow.setText) this._statusWindow.setText(mz, actor, 1);
        }
    };
    Scene_RRThrallLootTable.prototype.statsFor = function(win, data) {
        this._statsWindow.refresh(win.index(), data, this.statusVisible() ? this._actorIndex : null);
    };
    Scene_RRThrallLootTable.prototype.openStatus = function(x) {
        this._statusWindow = equipStats(x);
        if (this._statusWindow) this.addWindow(this._statusWindow);
        else this._statusWindow = { rrPlaceholder: true };
    };
    Scene_RRThrallLootTable.prototype.closeStatus = function() {
        const w = this._statusWindow;
        if (w && !w.rrPlaceholder && this._windowLayer) this._windowLayer.removeChild(w);
        if (w && typeof w.destroy === 'function') w.destroy();
        this._statusWindow = null;
    };
    Scene_RRThrallLootTable.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        const loot = this._lootWindow, inv = this._inventoryWindow, confirm = this._confirmWindow;
        if (this._lastIndex !== loot.index() && loot.index() >= 0) {
            this._lastIndex = loot.index();
            this.statsFor(loot, this._loot);
            if (this.statusVisible()) this.updateStatus();
        } else if (this._lastIndex !== inv.index() && inv.index() >= 0) {
            this._lastIndex = inv.index();
            this.statsFor(inv, this._inventory);
            if (this.statusVisible()) this.updateStatus();
        }
        if (confirm.active) this.updateConfirm();
        else this.updateTable();
    };
    Scene_RRThrallLootTable.prototype.backToList = function() {
        hideConfirm(this._confirmWindow);
        if (this._tempActive) this._inventoryWindow.activate(); else this._lootWindow.activate();
    };
    Scene_RRThrallLootTable.prototype.updateConfirm = function() {
        if (trig(PAD.cancel)) {
            se.cancel();
            this.backToList();
        } else if (trig(PAD.confirm)) {
            if (this._confirmWindow.index() === 0) {
                // Salvage what is left: materials by rarity (or gold with the Voucher), and the challenges' counts.
                for (const obj of this._loot) {
                    if (sw(57)) setVar(152, vars(152) + 1);   // Pain: Burdened
                    const r = wrap(obj);
                    if (r.isItem()) continue;
                    if (vars(185) === 22) $gameParty.gainGold(idiv(mzOf(obj).price, 5));   // Voucher
                    else {
                        const e = r.element_set;
                        setVar(89, vars(89) + (e.includes(14) ? 1 : e.includes(13) ? 2 : e.includes(12) ? 5 : e.includes(11) ? 10 : 25));
                    }
                    for (const [s, v] of [[2, 161], [3, 162], [4, 163], [5, 164]]) if (r.state_set.includes(s)) setVar(v, vars(v) + 1);
                }
                se.decision();
                this.returnScene();
            } else {
                se.cancel();
                this.backToList();
            }
        }
    };
    Scene_RRThrallLootTable.prototype.updateTable = function() {
        const loot = this._lootWindow, inv = this._inventoryWindow;
        if (trig(PAD.cancel)) {
            if (this._loot.length > 0 && vars(3) === 0) {
                this._tempActive = !loot.active;
                loot.deactivate();
                inv.deactivate();
                if (this.statusVisible()) {
                    if (loot.index() >= 0) { if (!sw(68)) loot.setData(this._loot); }
                    else if (!sw(68)) inv.setData(this._inventory);
                    this.closeStatus();
                }
                showConfirm(this._confirmWindow, false);
                se.decision();
            } else {
                se.cancel();
                this.returnScene();
            }
        } else if (trig(PAD.confirm) && loot.index() >= 0) this.takeLoot();
        else if (trig(PAD.confirm) && inv.index() >= 0) this.putBack();
        else if (trig(PAD.right)) {
            if (this.statusVisible()) this.cycleActor(1);
            else if (loot.index() >= 0) {
                const temp = loot.index();
                loot.deselect();
                loot.deactivate();
                setIndex(inv, this._tempIndex);
                this._tempIndex = temp;
                inv.activate();
                this._statsWindow.refresh(inv.index(), this._inventory, null);
                se.cursor();
            }
        } else if (trig(PAD.left)) {
            if (this.statusVisible()) this.cycleActor(-1);
            else if (inv.index() >= 0) {
                const temp = inv.index();
                inv.deselect();
                inv.deactivate();
                setIndex(loot, this._tempIndex);
                this._tempIndex = temp;
                loot.activate();
                this._statsWindow.refresh(loot.index(), this._loot, null);
                se.cursor();
            }
        } else if ((trig(PAD.pgup) || trig(PAD.pgdn)) && vars(3) <= 2) this.switchBackpack(trig(PAD.pgup));
        else if (trig(PAD.dash)) this.toggleFavorite();
        else if (trig(PAD.compare)) this.toggleCompare();
        else if (trig(PAD.sort) && !this.statusVisible()) this.toggleSort();
    };
    /** Next or previous party member to compare with. */
    Scene_RRThrallLootTable.prototype.cycleActor = function(step) {
        const size = $gameParty.members().length;
        this._actorIndex = ((this._actorIndex + (step < 0 ? size - 1 : 1)) % size + size) % size;
        this.closeStatus();
        if (this._lootWindow.index() >= 0) {
            this.openStatus(304);
            this.statsFor(this._lootWindow, this._loot);
            if (!sw(68)) this._lootWindow.setData(this._loot, this._actorIndex);
        } else {
            this.openStatus(0);
            this.statsFor(this._inventoryWindow, this._inventory);
            if (!sw(68)) this._inventoryWindow.setData(this._inventory, this._actorIndex);
        }
        this.updateStatus();
        se.cursor();
    };
    /** Moves the selected loot into the backpack (buying it in a shop). */
    Scene_RRThrallLootTable.prototype.takeLoot = function() {
        const loot = this._lootWindow;
        const obj = this._loot[loot.index()];
        const kind = kindOf(obj);
        let replaced = false, goldCheck = false, words = null;
        const buy = (o) => {
            if (vars(3) < 3) return true;
            const price = mzOf(o).price;
            if ($gameParty.gold() < price) return false;
            $gameParty.gainGold(-price);
            return true;
        };
        const moveInto = (k, last) => {
            for (let i = 1; i <= last; i++) {
                const slot = table(k)[i];
                if (slot && !hasItem(slot, true) && !replaced && obj) {
                    if (!buy(obj)) break;
                    copyItem(k, i, obj);
                    mzOf(obj).name = '';
                    $gameParty.gainItem(slot, 1);
                    replaced = true;
                }
            }
        };
        if (kind === 'armor') {
            let cap = 0;
            for (let i = 1; i <= 16 + vars(6); i++) if (table('armor')[i] && hasItem(table('armor')[i], false)) cap++;
            if (cap < vars(6)) moveInto('armor', 16 + vars(6));
        } else if (kind === 'weapon') {
            let cap = 0;
            for (let i = 1; i <= 4 + vars(5); i++) if (table('weapon')[i] && hasItem(table('weapon')[i], false)) cap++;
            if (cap < vars(5)) moveInto('weapon', 4 + vars(5));
        } else if (obj) {
            words = String(mzOf(obj).name).split(/ /);
            if (words[1] === 'Gold') {
                $gameParty.gainGold(idiv(mzOf(obj).price, 5));
                mzOf(obj).name = '';
                replaced = true;
            } else moveInto('item', vars(26));
        }
        if (!replaced) { se.buzzer(); return; }
        if (kind === 'armor' && this._backpack !== 0) { this._tempIndex = 0; this._backpack = 0; }
        else if (kind === 'weapon' && this._backpack !== 1) { this._tempIndex = 0; this._backpack = 1; }
        else if (kind === 'item') {
            if (words && words[1] === 'Gold') goldCheck = true;
            if (this._backpack !== 2) { this._tempIndex = 0; this._backpack = 2; }
        }
        this.refreshInventory();
        this.refreshLoot();
        this._inventoryWindow.setData(this._inventory);
        this._labelWindow.refresh(this._backpack);
        this._label2Window.refresh(this._backpack);
        if (loot.index() > this._loot.length - 1) setIndex(loot, loot.index() - 1);
        if (loot.index() < 0) setIndex(loot, 0);
        loot.setData(this._loot, this.statusVisible() ? this._actorIndex : null);
        if (vars(3) >= 3 || goldCheck) se.shop();
        else AudioManager.playSe({ name: 'Loot', volume: 100, pitch: rand(9) * 5 + 80, pan: 0 });
        this.statsFor(loot, this._loot);
        if (this.statusVisible()) this.updateStatus();
    };
    /** Moves the selected backpack entry into the table (selling it in a shop); favourites stay but in storage. */
    Scene_RRThrallLootTable.prototype.putBack = function() {
        const inv = this._inventoryWindow;
        const obj = this._inventory[inv.index()];
        const v3 = vars(3);
        let replaced = false, range;
        if (this._backpack === 0) range = v3 === 1 ? ['armor', 87, 86 + vars(8)] : v3 === 2 ? ['armor', 488, 490] : v3 === 4 ? ['armor', 122, 161] : ['armor', 47, 86];
        else if (this._backpack === 1) range = v3 === 1 ? ['weapon', 77, 76 + vars(7)] : v3 === 2 ? ['weapon', 524, 526] : v3 === 3 ? ['weapon', 107, 146] : ['weapon', 37, 76];
        else range = v3 === 1 ? ['item', 71, 70 + vars(27)] : v3 === 5 ? ['item', 101, 140] : ['item', 31, 70];
        const [k, x, y] = range;
        const keep = this._backpack < 2 && obj && isFavorite(obj) && !(x === 77 || x === 87 || x === 524 || x === 488);
        if (obj && !keep) {
            for (let i = x; i <= y; i++) {
                const slot = table(k)[i];
                if (slot && slot.name === '' && !replaced) {
                    if (v3 >= 3) $gameParty.gainGold(idiv(mzOf(obj).price, 5));
                    copyItem(k, i, obj);
                    $gameParty.loseItem(mzOf(obj), 1);
                    replaced = true;
                }
            }
        }
        if (!replaced) { se.buzzer(); return; }
        this.refreshInventory();
        this.refreshLoot();
        this._lootWindow.setData(this._loot);
        if (inv.index() > this._inventory.length - 1) setIndex(inv, inv.index() - 1);
        if (inv.index() < 0) setIndex(inv, 0);
        inv.setData(this._inventory, this.statusVisible() ? this._actorIndex : null);
        this._labelWindow.refresh(this._backpack);
        this._label2Window.refresh(this._backpack);
        if (v3 >= 3) se.shop();
        else AudioManager.playSe({ name: 'Loot', volume: 100, pitch: rand(9) * 5 + 80, pan: 0 });
        this.statsFor(inv, this._inventory);
        if (this.statusVisible()) this.updateStatus();
    };
    /** A and S: armours ↔ weapons ↔ items (no items in the locker). */
    Scene_RRThrallLootTable.prototype.switchBackpack = function(up) {
        const locker = vars(3) === 2, b = this._backpack;
        if (up) this._backpack = b === 0 ? 1 : b === 1 ? (locker ? 0 : 2) : 0;
        else this._backpack = b === 0 ? (locker ? 1 : 2) : b === 1 ? 0 : 1;
        this.refreshLoot();
        this.refreshInventory();
        this._lootWindow.setData(this._loot);
        this._inventoryWindow.setData(this._inventory);
        this._labelWindow.refresh(this._backpack);
        this._label2Window.refresh(this._backpack);
        const inv = this._inventoryWindow, loot = this._lootWindow;
        if (!(vars(3) === 0 && inv.index() >= 0)) this._tempIndex = 0;
        if (inv.index() >= 0) {
            setIndex(inv, 0);
            this.statsFor(inv, this._inventory);
        } else if (loot.index() >= 0 && (vars(3) === 1 || vars(3) === 2)) {
            setIndex(loot, 0);
            this.statsFor(loot, this._loot);
        }
        if (this.statusVisible()) this.updateStatus();
        se.cursor();
    };
    Scene_RRThrallLootTable.prototype.toggleFavorite = function() {
        const inv = this._inventoryWindow;
        if (!(inv.index() >= 0 && this._backpack < 2)) return;
        const obj = this._inventory[inv.index()];
        if (!obj) return;
        toggleFavorite(obj);
        inv.setData(this._inventory);
        this.statsFor(inv, this._inventory);
        se.decision();
    };
    Scene_RRThrallLootTable.prototype.toggleCompare = function() {
        const loot = this._lootWindow, inv = this._inventoryWindow;
        if (this.statusVisible()) {
            this.closeStatus();
            if (loot.index() >= 0) {
                this._statsWindow.refresh(loot.index(), this._loot, null);
                if (!sw(68)) loot.setData(this._loot);
            } else {
                this._statsWindow.refresh(inv.index(), this._inventory, null);
                if (!sw(68)) inv.setData(this._inventory);
            }
        } else {
            if (loot.index() >= 0 && this._backpack < 3) {
                this.openStatus(304);
                this._statsWindow.refresh(loot.index(), this._loot, this._actorIndex);
                if (!sw(68)) loot.setData(this._loot, this._actorIndex);
            } else if (inv.index() >= 0 && this._backpack < 3) {
                this.openStatus(0);
                this._statsWindow.refresh(inv.index(), this._inventory, this._actorIndex);
                if (!sw(68)) inv.setData(this._inventory, this._actorIndex);
            }
            if (!this._statusWindow) this._statusWindow = { rrPlaceholder: true };
            this.updateStatus();
        }
        se.cursor();
    };
    Scene_RRThrallLootTable.prototype.toggleSort = function() {
        setVar(100, vars(100) === 0 ? 1 : 0);
        this.refreshLoot();
        this.refreshInventory();
        this._lootWindow.setData(this._loot);
        this._inventoryWindow.setData(this._inventory);
        this._labelWindow.refresh(this._backpack);
        this._optionsWindow.refresh();
        const inv = this._inventoryWindow, loot = this._lootWindow;
        if (!(vars(3) === 0 && inv.index() >= 0)) this._tempIndex = 0;
        if (inv.index() >= 0) {
            setIndex(inv, 0);
            this._statsWindow.refresh(inv.index(), this._inventory, null);
        } else if (loot.index() >= 0) {
            setIndex(loot, 0);
            this._statsWindow.refresh(loot.index(), this._loot, null);
        }
        se.cursor();
    };
    Scene_RRThrallLootTable.prototype.returnScene = function() {
        if ($gameTroop) $gameTroop.clear();
        clearLootSlots();
        returnToMap();
    };
    window.Scene_RRThrallLootTable = Scene_RRThrallLootTable;
})();
