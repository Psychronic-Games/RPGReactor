/*:
 * @target MZ
 * @plugindesc Instance Items (VX Ace), for imported games
 * @author Hime; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_HimeInstanceItems.js
 *
 * Every weapon and armor the party gains (and every item, when that kind is
 * on) is a copy of its database entry of its own, with a new id after the
 * database's. Two of the same sword are two pieces; the item lists show each
 * one on its own row without a count, and add-ons (equipment levels,
 * durability) change one copy's name, parameters and price.
 *
 * Gaining a piece by event makes new copies. Losing one "by the database
 * entry" takes the first copy of it the party holds (and, with Include
 * Equipment, one worn by the first member wearing one). Change Equipment and
 * the conditional branch on a worn weapon or armor go by the database entry.
 * Starting equipment (the database's and <starting gear>) is copied when
 * an actor is set up.
 *
 * The copies are kept with the save and put back into the database tables
 * when it loads.
 *
 * Losing a copy the party does not hold (one worn, say) still lowers the
 * count of its entry, and losing by the entry leaves the lost copy's own
 * count at 1. The original did both; they are kept. Where the original's
 * search of the members' equipment stopped with an error when the party
 * leader wore none of the entry, the port goes on to the next member.
 *
 * For other plugins: window.RRInstanceItems (getInstance, templateOf,
 * isTemplate, refresh(obj), refreshAttr(obj, attr), makers[attr] and the
 * setup*Instance methods, which add-ons wrap as the original's aliases did).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param enableItems
 * @text Items are copies
 * @type boolean
 * @default false
 *
 * @param enableWeapons
 * @text Weapons are copies
 * @type boolean
 * @default true
 *
 * @param enableArmors
 * @text Armors are copies
 * @type boolean
 * @default true
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_HimeInstanceItems');
    const ENABLED = {
        item: String(params.enableItems) === 'true',
        weapon: String(params.enableWeapons ?? 'true') !== 'false',
        armor: String(params.enableArmors ?? 'true') !== 'false'
    };
    const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
    const TABLE = { item: () => $dataItems, weapon: () => $dataWeapons, armor: () => $dataArmors };
    // A database record's kind, by the field only that kind has (a copy is known before it enters a table).
    const kindOf = (obj) => (!obj || typeof obj !== 'object' ? null
        : 'itypeId' in obj ? 'item' : 'wtypeId' in obj ? 'weapon' : 'atypeId' in obj ? 'armor' : null);
    // The fields refresh() rebuilds from the database entry, each through its makers.
    const ATTRS = ['name', 'params', 'price', 'traits', 'note', 'iconIndex', 'description'];
    const templateCounts = {};

    const M = {
        kindOf,
        table(kind) { return TABLE[kind] ? TABLE[kind]() : null; },
        isEnabled(obj) { const k = kindOf(obj); return !!k && ENABLED[k]; },
        templateId(obj) { return obj.templateId === undefined ? obj.id : obj.templateId; },
        isTemplate(obj) { return M.templateId(obj) === obj.id; },
        templateOf(obj) { const t = M.table(kindOf(obj)); return t ? t[M.templateId(obj)] : null; },
        /** The copies kept with the save: { item, weapon, armor } of { id: record }. */
        store() {
            if (!$gameSystem._rrInstances) $gameSystem._rrInstances = { item: {}, weapon: {}, armor: {} };
            return $gameSystem._rrInstances;
        },
        /** A new copy of a database entry, entered in its table; a copy, or a kind that is not copied, comes back as it is. */
        getInstance(obj) {
            if (!obj || !M.isEnabled(obj) || !M.isTemplate(obj)) return obj;
            const kind = kindOf(obj), table = M.table(kind);
            const made = copy(obj);
            made.templateId = obj.id;
            made.id = table.length;
            M.setupInstance(made);
            M.store()[kind][made.id] = made;
            table[made.id] = made;
            return made;
        },
        // Setup, wrapped by add-ons (level 1, full durability …) as the original's were aliased.
        setupInstance(obj) {
            const kind = kindOf(obj);
            if (kind === 'weapon' || kind === 'armor') M.setupEquipInstance(obj);
            if (kind === 'item') M.setupItemInstance(obj);
        },
        setupEquipInstance(obj) {
            if (kindOf(obj) === 'weapon') M.setupWeaponInstance(obj);
            if (kindOf(obj) === 'armor') M.setupArmorInstance(obj);
        },
        setupWeaponInstance() {},
        setupArmorInstance() {},
        setupItemInstance() {},
        /** makers[attr]: functions (obj, value) → value, applied in the order the add-ons were installed. */
        makers: Object.fromEntries(ATTRS.map(a => [a, []])),
        refreshAttr(obj, attr) {
            const template = M.templateOf(obj);
            if (!template) return;
            let value = copy(template[attr]);
            for (const make of M.makers[attr] || []) value = make(obj, value);
            obj[attr] = value;
            if (attr === 'note') obj.meta = copy(template.meta);
        },
        refresh(obj) { for (const attr of ATTRS) M.refreshAttr(obj, attr); },
        templateCount(kind) {
            if (templateCounts[kind] !== undefined) return templateCounts[kind];
            const table = M.table(kind) || [];
            let n = table.length;
            while (n > 1 && table[n - 1] && table[n - 1].templateId !== undefined) n--;
            return n;
        },
        /** The database tables as loaded, with the save's copies put back at their ids. */
        reloadDatabase() {
            const store = $gameSystem && $gameSystem._rrInstances;
            for (const kind of Object.keys(TABLE)) {
                const table = M.table(kind);
                if (!table) continue;
                table.length = M.templateCount(kind);
                if (!store || !store[kind]) continue;
                for (const [id, obj] of Object.entries(store[kind])) if (obj) table[Number(id)] = obj;
            }
        }
    };
    window.RRInstanceItems = M;

    //-------------------------------------------------------------------------
    // Database and save
    //-------------------------------------------------------------------------
    const _onLoad = DataManager.onLoad;
    DataManager.onLoad = function(object) {
        _onLoad.call(this, object);
        for (const kind of Object.keys(TABLE)) {
            if (object && object === M.table(kind)) templateCounts[kind] = object.length;
        }
    };
    // A new game starts from the database as loaded.
    const _createGameObjects = DataManager.createGameObjects;
    DataManager.createGameObjects = function() {
        _createGameObjects.call(this);
        M.reloadDatabase();
    };
    const _extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _extractSaveContents.call(this, contents);
        M.reloadDatabase();
    };

    //-------------------------------------------------------------------------
    // Actors
    //-------------------------------------------------------------------------
    const A = Game_Actor.prototype;
    // Starting equipment, wherever the equip rules put it, is copied.
    const _initEquips = A.initEquips;
    A.initEquips = function(equips) {
        _initEquips.call(this, equips);
        let changed = false;
        for (const slot of this._equips) {
            const obj = slot && slot.object();
            if (obj && M.isEnabled(obj) && M.isTemplate(obj)) { slot.setObject(M.getInstance(obj)); changed = true; }
        }
        if (changed) this.refresh();
    };
    // A database entry to wear stands for the first copy of it the party holds.
    const held = (item) => (item && M.isEnabled(item) && $gameParty.hasItem(item) && M.isTemplate(item) ? $gameParty.rrFindInstanceItem(item) || null : item);
    const _changeEquip = A.changeEquip;
    A.changeEquip = function(slotId, item) { _changeEquip.call(this, slotId, held(item)); };
    const _tradeItemWithParty = A.tradeItemWithParty;
    A.tradeItemWithParty = function(newItem, oldItem) { return _tradeItemWithParty.call(this, held(newItem), oldItem); };
    // Conditional Branch › Actor › Weapon / Armor: worn copies count for their entry.
    const _hasWeapon = A.hasWeapon;
    A.hasWeapon = function(weapon) {
        return _hasWeapon.call(this, weapon) || (!!weapon && this.weapons().some(w => w && M.templateId(w) === weapon.id));
    };
    const _hasArmor = A.hasArmor;
    A.hasArmor = function(armor) {
        return _hasArmor.call(this, armor) || (!!armor && this.armors().some(a => a && M.templateId(a) === armor.id));
    };
    A.rrInstanceWeaponsInclude = function(id) { return this.weapons().some(w => w && M.templateId(w) === id); };
    A.rrInstanceArmorsInclude = function(id) { return this.armors().some(a => a && M.templateId(a) === id); };

    //-------------------------------------------------------------------------
    // Party: copies are listed in the order gained; a database entry's count is how many of its copies are held
    //-------------------------------------------------------------------------
    const P = Game_Party.prototype;
    const LIST = { item: '_rrItemList', weapon: '_rrWeaponList', armor: '_rrArmorList' };
    const _initAllItems = P.initAllItems;
    P.initAllItems = function() {
        _initAllItems.call(this);
        this._rrItemList = [];
        this._rrWeaponList = [];
        this._rrArmorList = [];
    };
    P.rrInstanceList = function(kind) {
        if (!this[LIST[kind]]) this[LIST[kind]] = [];
        return this[LIST[kind]];
    };
    const listed = (party, kind) => { const t = M.table(kind); return party.rrInstanceList(kind).map(id => t[id]).filter(Boolean); };
    const _items = P.items, _weapons = P.weapons, _armors = P.armors;
    P.items = function() { return ENABLED.item ? listed(this, 'item') : _items.call(this); };
    P.weapons = function() { return ENABLED.weapon ? listed(this, 'weapon') : _weapons.call(this); };
    P.armors = function() { return ENABLED.armor ? listed(this, 'armor') : _armors.call(this); };

    const _gainItem = P.gainItem;
    P.gainItem = function(item, amount, includeEquip) {
        if (!item || !M.isEnabled(item)) return _gainItem.call(this, item, amount, includeEquip);
        if (amount > 0) {
            for (let i = 0; i < amount; i++) this.rrAddInstanceItem(M.getInstance(item));
        } else {
            for (let i = 0; i < -amount; i++) {
                if (M.isTemplate(item)) this.rrLoseTemplateItem(item, includeEquip);
                else this.rrLoseInstanceItem(item);
            }
        }
    };
    P.rrAddInstanceItem = function(item) {
        const container = this.itemContainer(item), tid = M.templateId(item);
        container[tid] = (container[tid] || 0) + 1;
        container[item.id] = 1;
        this.rrInstanceList(kindOf(item)).push(item.id);
    };
    P.rrFindInstanceItem = function(template) {
        const tid = M.templateId(template), table = M.table(kindOf(template));
        const id = this.rrInstanceList(kindOf(template)).find(i => table[i] && M.templateId(table[i]) === tid);
        return id === undefined ? undefined : table[id];
    };
    P.rrLoseInstanceItem = function(item) {
        const container = this.itemContainer(item), tid = M.templateId(item);
        container[tid] = (container[tid] || 0) - 1;
        container[item.id] = 0;
        const list = this.rrInstanceList(kindOf(item));
        for (let i = list.length - 1; i >= 0; i--) if (list[i] === item.id) list.splice(i, 1);
    };
    P.rrLoseTemplateItem = function(item, includeEquip) {
        const lost = this.rrFindInstanceItem(item);
        if (lost) {
            const container = this.itemContainer(item), tid = M.templateId(item);
            container[tid] = (container[tid] || 0) - 1;
            const list = this.rrInstanceList(kindOf(item));
            for (let i = list.length - 1; i >= 0; i--) if (list[i] === lost.id) list.splice(i, 1);
        } else if (includeEquip) {
            this.rrDiscardMembersTemplateEquip(item, 1);
        }
        return lost;
    };
    P.rrDiscardMembersTemplateEquip = function(item, amount) {
        let n = amount;
        const tid = M.templateId(item);
        for (const actor of this.members()) {
            const worn = actor.equips().find(obj => obj && kindOf(obj) === kindOf(item) && M.templateId(obj) === tid);
            if (!worn) continue;
            while (n > 0 && actor.equips().includes(worn)) { actor.discardEquip(worn); n--; }
            if (n <= 0) break;
        }
    };

    //-------------------------------------------------------------------------
    // Item lists: a copy has no count beside it
    //-------------------------------------------------------------------------
    const W = Window_Base.prototype;
    if (W.rrAceDrawItemNumber) {
        const _rrAceDrawItemNumber = W.rrAceDrawItemNumber;
        W.rrAceDrawItemNumber = function(rect, item) {
            if (!item || M.isTemplate(item)) _rrAceDrawItemNumber.call(this, rect, item);
        };
    }
    const _drawItemNumber = Window_ItemList.prototype.drawItemNumber;
    Window_ItemList.prototype.drawItemNumber = function(item, x, y, width) {
        if (!item || M.isTemplate(item)) _drawItemNumber.call(this, item, x, y, width);
    };
})();
