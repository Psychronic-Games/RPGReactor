/*:
 * @target MZ
 * @plugindesc Crafting System (VX), for imported games
 * @author Strak (rmrk.net); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallCrafting.js
 *
 * The crafting altar (a variable says weapons, 6, or armours, 7). Left: the
 * offering, up to three weapons and three armours; right: the backpack.
 * The action button moves the chosen item across (favourites stay in the
 * backpack). With three offered, the altar asks for its cost in materials
 * (a variable; more for rarer offerings): Craft spends them, consumes the
 * offering and makes one new item of a type the offering had, at the
 * party's level (the loot port's generator, $gameTemp.rrGenerateLoot).
 * Cancel puts back what is left on the altar while the backpack has room.
 * Arrows switch sides, the sort button changes the order, the dash button
 * marks a favourite; the bottom window describes the chosen item. The
 * windows are the loot table's (RR_ThrallLoot's), plainer ones without it.
 *
 * The weapons and armours are Thrall's generated ones, moved between record
 * slots as the original moved them (the VX records the battle and loot
 * ports keep, RRThrallVx, and the MZ database objects). Leaving clears the
 * loot slots (weapons 37-76, armours 47-86, items 31-70).
 *
 * Scene: Scene_RRThrallCrafting (the game's $scene = Scene_Crafting.new).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 */
(() => {
    'use strict';
    const WLH = 24;
    const idiv = (a, b) => (b === 0 ? 0 : Math.floor(a / b));
    const v = (id) => $gameVariables.value(id);
    const setV = (id, value) => $gameVariables.setValue(id, value);
    const VX = () => window.RRThrallVx || null;
    const inputIcon = (i) => ($gameSystem.rrReadInput ? $gameSystem.rrReadInput(i) : 854);
    const se = (name, volume, pitch) => AudioManager.playSe({ name, volume, pitch, pan: 0 });

    //-------------------------------------------------------------------------
    // The game's records: the VX records the battle and loot ports keep
    // (RRThrallVx), MZ's objects following them
    //-------------------------------------------------------------------------
    const kindName = (obj) => (DataManager.isWeapon(obj) ? 'weapon' : DataManager.isArmor(obj) ? 'armor' : 'item');
    const traitIds = (d, code) => (d.traits || []).filter(t => t.code === code).map(t => t.dataId);
    function rec(obj) {
        if (!obj) return null;
        const vx = VX();
        if (vx && vx.lootRecord) return vx.lootRecord(kindName(obj), obj.id);
        if (vx && vx.of && vx.of(obj)) return vx.of(obj);
        if (!obj._rrVxRecord) {
            const p = obj.params || [];
            const weapon = DataManager.isWeapon(obj);
            obj._rrVxRecord = { atk: p[2] || 0, def: p[3] || 0, spi: p[4] || 0, agi: p[6] || 0, hit: 95, eva: 0, kind: Math.max(0, (obj.etypeId || 2) - 2),
                animation_id: obj.animationId || 0, element_set: traitIds(obj, weapon ? 31 : 11), state_set: traitIds(obj, weapon ? 32 : 14) };
        }
        return obj._rrVxRecord;
    }
    const elements = (item) => (rec(item) && rec(item).element_set) || [];
    const kindOf = (armor) => rec(armor).kind;
    const minus = (a, b) => a.filter(x => !b.includes(x));
    const WEAPON_FIELDS = ['animation_id', 'hit', 'atk', 'def', 'spi', 'agi', 'element_set', 'state_set', 'critical_bonus', 'fast_attack', 'dual_attack', 'two_handed'];
    const ARMOR_FIELDS = ['kind', 'atk', 'def', 'spi', 'agi', 'eva', 'element_set', 'state_set', 'prevent_critical', 'half_mp_cost', 'double_exp_gain', 'auto_hp_recover'];
    /** $data_x[i].field = item.field for the fields the script copies; MZ's object follows (the loot port's sync). */
    function copyEquip(dst, src) {
        for (const f of ['name', 'iconIndex', 'description', 'note', 'price']) dst[f] = src[f];
        const from = rec(src), to = rec(dst);
        const weapon = DataManager.isWeapon(src);
        for (const f of weapon ? WEAPON_FIELDS : ARMOR_FIELDS) to[f] = Array.isArray(from[f]) ? from[f].slice() : from[f];
        const vx = VX();
        if (vx && vx.lootSync) { vx.lootSync(kindName(dst), dst.id); return; }
        if (dst.params) dst.params = [dst.params[0] || 0, dst.params[1] || 0, to.atk || 0, to.def || 0, to.spi || 0, to.spi || 0, to.agi || 0, dst.params[7] || 0];
        if (weapon) dst.animationId = to.animation_id; else dst.etypeId = (to.kind || 0) + 2;
    }
    /** The favourite mark on a backpack item (the loot port's toggle when it is on). */
    function toggleFavorite(item) {
        const vx = VX();
        if (vx && vx.lootToggleFavorite) { vx.lootToggleFavorite(item); return; }
        const mark = DataManager.isWeapon(item) ? $dataWeapons[527] : $dataArmors[491];
        rec(item).element_set = elements(item).includes(18) ? minus(elements(item), elements(mark)) : elements(item).concat(elements(mark));
    }
    const hasItem = (item, equip) => $gameParty.numItems(item) > 0 || (equip && [1, 2, 3, 4].some(id => $gameActors.actor(id).equips().includes(item)));

    //-------------------------------------------------------------------------
    // Windows: the loot table's (the loot port's Window_RRThrall* classes),
    // or plain stand-ins with the same calls
    //-------------------------------------------------------------------------
    const vxWindow = (name, base, init) => {
        const Cls = function() { this.initialize(...arguments); };
        Cls.prototype = Object.create(base.prototype);
        Cls.prototype.constructor = Cls;
        Cls.prototype.initialize = init;
        return Cls;
    };
    const listWindow = (x, y, w, h, countVariable, inventory) => {
        const Cls = vxWindow('', Window_Selectable, function() {
            Window_Selectable.prototype.initialize.call(this, new Rectangle(x, y, w, h));
            this._data = [];
            if (inventory) this.deselect(); else { this.select(0); this.activate(); }
        });
        Cls.prototype.maxCols = function() { return 1; };
        Cls.prototype.itemHeight = function() { return WLH; };
        Cls.prototype.maxItems = function() { return this._data.length; };
        Cls.prototype.setData = function(data) { this._data = data.slice(); setV(countVariable, data.length); this.refresh(); };
        Cls.prototype.drawItem = function(index) {
            const item = this._data[index];
            if (!item) return;
            const rect = this.itemRect(index);
            this.rrVxDrawItemName(item, rect.x, rect.y, true);
        };
        return Cls;
    };
    const PlainLoot = listWindow(0, 56, 304, 264, 4, false);
    const PlainInventory = listWindow(304, 56, 304, 264, 2, true);
    /** The labels in the altar's modes (variable 3: 6 weapons, 7 armours). */
    const PlainLabel = vxWindow('', Window_Base, function(x = 0) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, 0, 304, 56));
        this._second = x > 0;
    });
    PlainLabel.prototype.refresh = function() {
        this.contents.clear();
        this.changeTextColor(this.rrVxNormalColor());
        const mode = v(3);
        if (!this._second) {
            let text = 'Loot';
            if (mode === 6 || mode === 7) {
                if (v(4) >= 3) this.changeTextColor(this.rrVxPowerUpColor());
                text = (mode === 6 ? 'Offer Weapons: ' : 'Offer Armors: ') + v(4) + '/3';
            }
            this.rrVxDrawText(0, 0, 272, WLH, text, 1);
            return;
        }
        const cap = mode === 6 ? v(5) : v(6);
        this.rrVxDrawText(0, 0, 136, WLH, 'Materials: ' + v(89), 1);
        if (v(2) >= cap) this.changeTextColor(this.rrVxPowerDownColor());
        this.rrVxDrawText(136, 0, 136, WLH, (mode === 6 ? 'WPNS: ' : 'ARMS: ') + v(2) + '/' + cap, 1);
    };
    const PlainOptions = vxWindow('', Window_Base, function() {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 424, 608, 56));
        this.refresh();
    });
    PlainOptions.prototype.refresh = function() {
        this.contents.clear();
        this.changeTextColor(this.rrVxNormalColor());
        this.rrVxDrawIcon(inputIcon(6), 0, 0);
        this.rrVxDrawText(28, 0, 140, WLH, v(100) === 0 ? 'Sort: Rarity' : 'Sort: Type', 0);
        const text = 'Favorite';
        const x = idiv(this.contents.width - this.textWidth(text), 2);
        this.rrVxDrawIcon(inputIcon(0), x - 14, 0);
        this.rrVxDrawText(x + 14, 0, 140, WLH, text, 0);
    };
    /** "Crafting Cost: n Materials." over Craft / Cancel; unseen while hidden. */
    const PlainConfirm = vxWindow('', Window_Selectable, function() {
        Window_Selectable.prototype.initialize.call(this, new Rectangle(168, 156, 272, 104));
        this._data = [];
        this.deselect();
        this.deactivate();
        this.opacity = 0;
    });
    PlainConfirm.prototype.maxItems = function() { return this._data.length; };
    PlainConfirm.prototype.itemHeight = function() { return WLH; };
    PlainConfirm.prototype.itemRect = function(index) { return new Rectangle(0, (index + 1) * WLH - this.scrollBaseY(), this.innerWidth, WLH); };
    PlainConfirm.prototype.paint = function() {
        if (!this.contents) return;
        this.contents.clear();
        if (!this._data.length) return;
        this.changeTextColor(this.rrVxNormalColor());
        this.rrVxDrawText(0, 0, 240, WLH, 'Crafting Cost: ' + v(82) + ' Materials.', 1);
        for (let i = 0; i < this._data.length; i++) {
            const r = this.itemRect(i);
            this.rrVxDrawText(r.x + 4, r.y, r.width - 8, WLH, this._data[i], 1);
        }
    };
    PlainConfirm.prototype.refresh = function() {
        this._data = ['Craft', 'Cancel'];
        this.paint();
        this.opacity = 255;
        this.select(0);
        this.activate();
    };
    PlainConfirm.prototype.hide = function() {
        this._data = [];
        this.paint();
        this.deselect();
        this.deactivate();
        this.opacity = 0;
    };
    const PlainStats = vxWindow('', Window_Base, function(x, y, w, h) { Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h)); });
    PlainStats.prototype.refresh = function(index, items) {
        this.contents.clear();
        const item = items[index];
        if (!item) return;
        this.rrVxDrawItemName(item, 0, 0, true);
        this.rrVxDrawText(0, WLH, this.innerWidth, WLH, item.description, 0);
    };
    const shared = (name, plain) => (typeof window[name] === 'function' ? window[name] : plain);

    /** $scene = Scene_Map.new: back to the map under this scene, or a new one. */
    const toMap = () => {
        const stack = SceneManager._stack || [];
        if (stack.length && stack[stack.length - 1] === Scene_Map) SceneManager.pop();
        else SceneManager.goto(Scene_Map);
    };
    //-------------------------------------------------------------------------
    // Scene_Crafting
    //-------------------------------------------------------------------------
    function Scene_RRThrallCrafting() { this.initialize(...arguments); }
    Scene_RRThrallCrafting.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallCrafting.prototype.constructor = Scene_RRThrallCrafting;
    Scene_RRThrallCrafting.prototype.createButtons = function() {};
    Scene_RRThrallCrafting.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this._lootWindow = new (shared('Window_RRThrallLoot', PlainLoot))();
        this._inventoryWindow = new (shared('Window_RRThrallInventory', PlainInventory))();
        this._statsWindow = new (shared('Window_RRThrallStats', PlainStats))(0, 320, 608, 104);
        this._confirmWindow = new (shared('Window_RRThrallConfirm', PlainConfirm))();
        this._labelWindow = typeof window.Window_RRThrallLabel === 'function' ? new window.Window_RRThrallLabel() : new PlainLabel(0);
        this._label2Window = typeof window.Window_RRThrallLabel2 === 'function' ? new window.Window_RRThrallLabel2() : new PlainLabel(304);
        this._optionsWindow = new (shared('Window_RRThrallOptions', PlainOptions))();
        this._backpack = v(3) === 7 ? 0 : 1;
        this._lastIndex = 0;
        this._tempIndex = 0;
        this._tempActive = false;
        this.setSorts();
        this.refreshLoot();
        this.refreshInventory();
        this._lootWindow.setData(this._lootData);
        this._inventoryWindow.setData(this._inventoryData);
        this._labelWindow.refresh(this._backpack);
        this._label2Window.refresh(this._backpack);
        this._statsWindow.refresh(0, this._lootData);
        for (const w of [this._lootWindow, this._inventoryWindow, this._statsWindow, this._labelWindow, this._label2Window, this._optionsWindow, this._confirmWindow]) this.addWindow(w);
    };
    Scene_RRThrallCrafting.prototype.setSorts = function() {
        if (v(100) === 0) { this._sort1 = [9, 14]; this._sort2 = [1, 5]; this._sort3 = [9, 14]; this._sort4 = [0, 3]; }
        else { this._sort1 = [1, 5]; this._sort2 = [9, 14]; this._sort3 = [0, 3]; this._sort4 = [9, 14]; }
    };
    /** Armours by the sort: kind and element, in the order the sorts give. */
    Scene_RRThrallCrafting.prototype.armorsSorted = function(ids, keep) {
        const out = [];
        for (let ii = this._sort3[0]; ii <= this._sort3[1]; ii++) for (let iii = this._sort4[0]; iii <= this._sort4[1]; iii++) {
            for (const i of ids) {
                const a = $dataArmors[i];
                if (!a || !keep(a)) continue;
                if (this._sort3[0] === 0) { if (elements(a).includes(iii) && kindOf(a) === ii) out.push(a); }
                else if (elements(a).includes(ii) && kindOf(a) === iii) out.push(a);
            }
        }
        return out;
    };
    Scene_RRThrallCrafting.prototype.weaponsSorted = function(ids, keep) {
        const out = [];
        for (let ii = this._sort1[0]; ii <= this._sort1[1]; ii++) for (let iii = this._sort2[0]; iii <= this._sort2[1]; iii++) {
            for (const i of ids) {
                const w = $dataWeapons[i];
                if (w && keep(w) && elements(w).includes(ii) && elements(w).includes(iii)) out.push(w);
            }
        }
        return out;
    };
    const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
    Scene_RRThrallCrafting.prototype.refreshLoot = function() {
        const named = (o) => o.name !== '';
        this._lootData = this.weaponsSorted(range(37, 39), named).concat(this.armorsSorted(range(47, 49), named));
        setV(4, this._lootData.length);
    };
    Scene_RRThrallCrafting.prototype.refreshInventory = function() {
        const owned = (o) => hasItem(o, false);
        this._inventoryData = this._backpack === 0 ? this.armorsSorted(range(1, 16 + v(6)), owned) : this.weaponsSorted(range(1, 4 + v(5)), owned);
        setV(2, this._inventoryData.length);
    };
    /** An offered item into a free backpack slot, when the backpack has room. */
    Scene_RRThrallCrafting.prototype.toBackpack = function(item) {
        if (!item) return false;
        const armor = DataManager.isArmor(item);
        const table = armor ? $dataArmors : $dataWeapons;
        const last = armor ? 16 + v(6) : 4 + v(5);
        const cap = armor ? v(6) : v(5);
        let used = 0;
        for (let i = 1; i <= last; i++) if (table[i] && hasItem(table[i], false)) used++;
        if (used >= cap) return false;
        for (let i = 1; i <= last; i++) {
            const slot = table[i];
            if (!slot || hasItem(slot, true)) continue;
            copyEquip(slot, item);
            item.name = '';
            $gameParty.gainItem(slot, 1);
            return true;
        }
        return false;
    };
    Scene_RRThrallCrafting.prototype.reactivate = function() {
        if (this._tempActive) this._inventoryWindow.activate(); else this._lootWindow.activate();
    };
    Scene_RRThrallCrafting.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        const lw = this._lootWindow, iw = this._inventoryWindow, cw = this._confirmWindow;
        if (this._lastIndex !== lw.index() && lw.index() >= 0) {
            this._lastIndex = lw.index();
            this._statsWindow.refresh(lw.index(), this._lootData);
        } else if (this._lastIndex !== iw.index() && iw.index() >= 0) {
            this._lastIndex = iw.index();
            this._statsWindow.refresh(iw.index(), this._inventoryData);
        }
        const trig = (n) => Input.isTriggered(n);
        if (cw.active) {
            if (trig('cancel')) { SoundManager.playCancel(); cw.hide(); this.reactivate(); }
            else if (trig('ok')) {
                if (cw.index() === 0) this.craft();
                else { SoundManager.playCancel(); cw.hide(); this.reactivate(); }
            }
            return;
        }
        if (trig('cancel')) {
            for (const item of this._lootData.slice()) this.toBackpack(item);
            SoundManager.playCancel();
            this.returnScene();
        } else if (trig('ok') && lw.index() >= 0) this.lootToBackpack();
        else if (trig('ok') && iw.index() >= 0) this.backpackToLoot();
        else if (trig('right')) {
            if (lw.index() >= 0) {
                const temp = lw.index();
                lw.deselect(); lw.deactivate();
                iw.select(this._tempIndex); iw.activate();
                this._tempIndex = temp;
                this._statsWindow.refresh(iw.index(), this._inventoryData);
                SoundManager.playCursor();
            }
        } else if (trig('left')) {
            if (iw.index() >= 0) {
                const temp = iw.index();
                iw.deselect(); iw.deactivate();
                lw.select(this._tempIndex); lw.activate();
                this._tempIndex = temp;
                this._statsWindow.refresh(lw.index(), this._lootData);
                SoundManager.playCursor();
            }
        } else if (trig('shift')) {
            if (iw.index() >= 0 && this._backpack < 2) {
                const item = this._inventoryData[iw.index()];
                if (item) {
                    toggleFavorite(item);
                    iw.refresh();
                    this._statsWindow.refresh(iw.index(), this._inventoryData);
                    SoundManager.playOk();
                }
            }
        } else if (trig('rgssY')) {
            setV(100, v(100) === 0 ? 1 : 0);
            this.setSorts();
            this.refreshLoot();
            this.refreshInventory();
            lw.setData(this._lootData);
            iw.setData(this._inventoryData);
            this._labelWindow.refresh(this._backpack);
            this._optionsWindow.refresh();
            if (!(v(3) === 0 && iw.index() >= 0)) this._tempIndex = 0;
            if (iw.index() >= 0) { iw.select(0); this._statsWindow.refresh(0, this._inventoryData); }
            else if (lw.index() >= 0) { lw.select(0); this._statsWindow.refresh(0, this._lootData); }
            SoundManager.playCursor();
        }
    };
    Scene_RRThrallCrafting.prototype.lootToBackpack = function() {
        const lw = this._lootWindow;
        const item = this._lootData[lw.index()];
        if (!this.toBackpack(item)) { SoundManager.playBuzzer(); return; }
        const armor = DataManager.isArmor(item);
        if (armor && this._backpack !== 0) { this._tempIndex = 0; this._backpack = 0; }
        else if (!armor && this._backpack !== 1) { this._tempIndex = 0; this._backpack = 1; }
        this.refreshInventory();
        this.refreshLoot();
        this._inventoryWindow.setData(this._inventoryData);
        this._labelWindow.refresh(this._backpack);
        this._label2Window.refresh(this._backpack);
        if (lw.index() > this._lootData.length - 1) lw.select(lw.index() - 1);
        if (lw.index() < 0) lw.select(0);
        lw.setData(this._lootData);
        se('Loot', 100, Math.randomInt(9) * 5 + 80);
        this._statsWindow.refresh(lw.index(), this._lootData);
    };
    Scene_RRThrallCrafting.prototype.backpackToLoot = function() {
        const iw = this._inventoryWindow, lw = this._lootWindow;
        const item = this._inventoryData[iw.index()];
        let moved = false;
        if (item && !elements(item).includes(18)) {   // a favourite stays
            const [table, from, to] = this._backpack === 0 ? [$dataArmors, 47, 49] : [$dataWeapons, 37, 39];
            for (let i = from; i <= to && !moved; i++) {
                if (table[i] && table[i].name === '') {
                    copyEquip(table[i], item);
                    $gameParty.loseItem(item, 1);
                    moved = true;
                }
            }
        }
        if (!moved) { SoundManager.playBuzzer(); return; }
        this.refreshInventory();
        this.refreshLoot();
        lw.setData(this._lootData);
        if (iw.index() > this._inventoryData.length - 1) iw.select(iw.index() - 1);
        if (iw.index() < 0) iw.select(0);
        iw.setData(this._inventoryData);
        this._labelWindow.refresh(this._backpack);
        this._label2Window.refresh(this._backpack);
        se('Loot', 100, Math.randomInt(9) * 5 + 80);
        this._statsWindow.refresh(iw.index(), this._inventoryData);
        // Three offered: the altar names its price.
        if (this._lootData.length === 3) {
            let cost = 0;
            for (const it of this._lootData) {
                const e = elements(it);
                if (e.includes(14)) cost += 5;
                if (e.includes(13)) cost += 10;
                if (e.includes(12)) cost += 30;
                if (e.includes(11)) cost += 75;
                if (e.includes(10)) cost += 100;
                if (e.includes(9)) cost += 100;
            }
            setV(82, cost);
            this._tempActive = !lw.active;
            lw.deactivate();
            iw.deactivate();
            this._confirmWindow.refresh();
            SoundManager.playOk();
        }
    };
    Scene_RRThrallCrafting.prototype.craft = function() {
        if (v(82) > v(89)) { SoundManager.playBuzzer(); return; }
        setV(89, v(89) - v(82));
        SoundManager.playEquip();
        let dropRate = 0;
        const craftType = [];
        for (const item of this._lootData) {
            item.name = '';
            const e = elements(item);
            if (e.includes(14)) dropRate += 900000;
            if (e.includes(13)) dropRate += 90000;
            if (e.includes(12)) dropRate += 9000;
            if (e.includes(11)) dropRate += 900;
            if (e.includes(10)) dropRate += 90;
            if (e.includes(9)) dropRate += 90;
            if (DataManager.isArmor(item)) craftType.push(kindOf(item) + 1);
            else for (let t = 1; t <= 5; t++) if (e.includes(t)) craftType.push(t);
        }
        dropRate = idiv(dropRate, 30);
        setV(81, craftType.length ? craftType[Math.randomInt(craftType.length)] : 0);
        let level = 0;
        for (const m of $gameParty.members()) level += m.level;
        level = idiv(level, 3);
        $gameSwitches.setValue(49, true);   // force rarity
        const type = v(3) === 6 ? 2 : 3;
        const temp = v(3);
        setV(3, 0);
        if ($gameTemp.rrGenerateLoot) $gameTemp.rrGenerateLoot(1, [dropRate], [level], type);
        setV(81, 0);
        $gameSwitches.setValue(49, false);
        setV(3, temp);
        this.refreshLoot();
        this._lootWindow.setData(this._lootData);
        this._labelWindow.refresh(this._backpack);
        this._confirmWindow.hide();
        this._tempIndex = 0;
        this.reactivate();
    };
    /** return_scene: the loot slots emptied, back to the map. */
    Scene_RRThrallCrafting.prototype.returnScene = function() {
        for (let i = 37; i <= 76; i++) if ($dataWeapons[i]) $dataWeapons[i].name = '';
        for (let i = 47; i <= 86; i++) if ($dataArmors[i]) $dataArmors[i].name = '';
        for (let i = 31; i <= 70; i++) if ($dataItems[i]) $dataItems[i].name = '';
        toMap();
    };
    window.Scene_RRThrallCrafting = Scene_RRThrallCrafting;
})();
