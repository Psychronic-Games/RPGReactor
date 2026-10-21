/*:
 * @target MZ
 * @plugindesc Shard Interface (VX), for imported games
 * @author Strak (rmrk.net); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallShards.js
 *
 * The shard bench. Left: the shards in the backpack (weapon shards or armour
 * shards), sorted by rarity or type. Right: the weapons or armours the party
 * carries or wears (worn ones marked; "100G" beside one that holds a shard).
 * Choose a shard, then an item without one, to set it in: the shard's
 * points go into the item's stats (or its special power: Scholar, Elite,
 * Thorn, Gamble, Rogue, Proficiency, Talented, Holy, Overflow, Seeker,
 * Demolitions, Burning, Freezing, Static, Toxic, Sunstone), and its element
 * marks the item. On an item that holds one, the action button takes the
 * shard back out for 100G into a free item slot. Page up / page down swap
 * weapons and armours, the sort button changes the order, the dash button
 * marks an item as a favourite. The bottom window describes the chosen entry
 * (the loot table's stats window when the loot port has one).
 *
 * The weapons, armours and items are Thrall's generated ones: the scene
 * changes their records (the VX records the battle and loot ports keep,
 * RRThrallVx, and the MZ database objects), as the original changed
 * $data_weapons and the like.
 *
 * Kept as the original behaves: a Sunstone shard (element 39) can be set in
 * but is never taken out (extraction looks at elements 19-38).
 *
 * Scene: Scene_RRThrallShards (the game's $scene = Scene_Shards.new).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 */
(() => {
    'use strict';
    const WLH = 24;
    const idiv = (a, b) => (b === 0 ? 0 : Math.floor(a / b));
    const toI = (s) => { const m = /^\s*([+-]?\d+)/.exec(String(s)); return m ? Number(m[1]) : 0; };
    const v = (id) => $gameVariables.value(id);
    const VX = () => window.RRThrallVx || null;
    const inputIcon = (i) => ($gameSystem.rrReadInput ? $gameSystem.rrReadInput(i) : 854);

    //-------------------------------------------------------------------------
    // The game's records: the VX records the battle and loot ports keep
    // (RRThrallVx), MZ's objects following them
    //-------------------------------------------------------------------------
    const kindOf = (obj) => (DataManager.isWeapon(obj) ? 'weapon' : DataManager.isArmor(obj) ? 'armor' : DataManager.isItem(obj) ? 'item' : null);
    const traitIds = (d, code) => (d.traits || []).filter(t => t.code === code).map(t => t.dataId);
    /** The VX record of an MZ weapon, armour or item (built from MZ's when no port keeps them). */
    function rec(obj) {
        if (!obj) return null;
        const vx = VX();
        if (vx && vx.lootRecord) return vx.lootRecord(kindOf(obj), obj.id);
        if (vx && vx.of && vx.of(obj)) return vx.of(obj);
        if (!obj._rrVxRecord) {
            const p = obj.params || [];
            const weapon = DataManager.isWeapon(obj);
            obj._rrVxRecord = { atk: p[2] || 0, def: p[3] || 0, spi: p[4] || 0, agi: p[6] || 0, hit: 95, eva: 0, kind: Math.max(0, (obj.etypeId || 2) - 2),
                animation_id: obj.animationId || 0, element_set: traitIds(obj, weapon ? 31 : 11), state_set: traitIds(obj, weapon ? 32 : 14) };
        }
        return obj._rrVxRecord;
    }
    /** MZ's object after its VX record changed (the loot port's sync; the stats alone without it). */
    function sync(obj) {
        const vx = VX();
        if (vx && vx.lootSync) { vx.lootSync(kindOf(obj), obj.id); return; }
        const r = rec(obj);
        if (obj.params && r) obj.params = [obj.params[0] || 0, obj.params[1] || 0, r.atk || 0, r.def || 0, r.spi || 0, r.spi || 0, r.agi || 0, obj.params[7] || 0];
        if (DataManager.isWeapon(obj) && r) obj.animationId = r.animation_id;
    }
    /** item.field = value. */
    function set(item, field, value) {
        if (field === 'description' || field === 'name' || field === 'note') { item[field] = value; return; }
        const r = rec(item);
        if (r) r[field] = Array.isArray(value) ? value.slice() : value;
        sync(item);
    }
    const get = (item, field) => (field === 'description' ? String(item.description || '') : rec(item) ? rec(item)[field] : undefined);
    const elements = (item) => (rec(item) && rec(item).element_set) || [];
    const states = (item) => (rec(item) && rec(item).state_set) || [];
    const minus = (a, b) => a.filter(x => !b.includes(x));
    const firstWords = (item) => String(item ? item.name : '').split(/ /);
    /** Game_Party#has_item?: in the bag, or worn by actors 1-4. */
    const hasItem = (item, equip) => $gameParty.numItems(item) > 0 || (equip && [1, 2, 3, 4].some(id => $gameActors.actor(id).equips().includes(item)));
    /** Game_Party#party_has_item?: in the bag, or worn by a party member. */
    const partyHasItem = (item, equip) => $gameParty.numItems(item) > 0 || (equip && $gameParty.members().some(m => m.equips().includes(item)));
    const se = (name, volume, pitch) => AudioManager.playSe({ name, volume, pitch, pan: 0 });

    /** Scene_Shards#change_animation: the weapon animation with an element added (its own table). */
    const CHANGE_ANIMATION = {
        2: { 7: 8, 9: 122, 10: 123, 95: 124, 17: 18, 19: 126, 20: 127, 96: 128, 1: 2, 3: 130, 4: 131, 97: 132, 76: 218, 159: 218, 13: 14, 15: 134, 16: 135, 98: 136, 21: 22, 23: 138, 24: 139, 99: 140 },
        3: { 7: 9, 8: 122, 10: 112, 95: 113, 17: 19, 18: 126, 20: 117, 96: 118, 1: 3, 2: 130, 4: 158, 97: 159, 85: 217, 131: 217, 13: 15, 14: 134, 16: 163, 98: 164, 21: 23, 22: 138, 24: 100, 99: 101 },
        4: { 7: 10, 8: 123, 9: 112, 95: 115, 17: 20, 18: 127, 19: 117, 96: 120, 1: 4, 2: 131, 3: 158, 97: 161, 76: 223, 159: 223, 13: 16, 14: 135, 15: 163, 98: 166, 21: 24, 22: 139, 23: 100, 99: 103 },
        5: { 7: 95, 8: 124, 9: 113, 10: 115, 17: 96, 18: 128, 19: 118, 20: 120, 1: 97, 2: 132, 3: 159, 4: 161, 85: 220, 131: 220, 13: 98, 14: 136, 15: 164, 16: 166, 21: 99, 22: 140, 23: 101, 24: 103 },
        45: { 7: 90, 8: 125, 9: 114, 10: 116, 95: 148, 17: 91, 18: 129, 19: 119, 20: 121, 96: 149, 1: 92, 2: 133, 3: 160, 4: 162, 97: 150, 85: 221, 131: 221, 76: 225, 159: 225,
            13: 93, 14: 137, 15: 165, 16: 167, 98: 151, 21: 94, 22: 141, 23: 114, 24: 116, 99: 146 }
    };
    const changeAnimation = (prev, status) => (CHANGE_ANIMATION[status] && CHANGE_ANIMATION[status][prev] !== undefined ? CHANGE_ANIMATION[status][prev] : prev);

    /** $scene = Scene_Map.new: back to the map under this scene, or a new one. */
    const toMap = () => {
        const stack = SceneManager._stack || [];
        if (stack.length && stack[stack.length - 1] === Scene_Map) SceneManager.pop();
        else SceneManager.goto(Scene_Map);
    };
    //-------------------------------------------------------------------------
    // Windows
    //-------------------------------------------------------------------------
    const vxWindow = (name, base, init) => {
        const Cls = function() { this.initialize(...arguments); };
        Cls.prototype = Object.create(base.prototype);
        Cls.prototype.constructor = Cls;
        Cls.prototype.initialize = init;
        window[name] = Cls;
        return Cls;
    };
    /** A VX list window: rows of WLH, one column, its own data. */
    const listWindow = (name, x, y, w, h) => {
        const Cls = vxWindow(name, Window_Selectable, function() {
            Window_Selectable.prototype.initialize.call(this, new Rectangle(x, y, w, h));
            this._data = [];
        });
        Cls.prototype.maxCols = function() { return 1; };
        Cls.prototype.itemHeight = function() { return WLH; };
        Cls.prototype.maxItems = function() { return this._data.length; };
        Cls.prototype.refreshList = function(data) { this._data = data; this.refresh(); };
        return Cls;
    };
    const Window_Shards = listWindow('Window_RRThrallShards', 0, 56, 304, 264);
    Window_Shards.prototype.drawItem = function(index) {
        const item = this._data[index];
        if (!item) return;
        const rect = this.itemRect(index);
        this.rrVxDrawItemName(item, rect.x, rect.y, true);
    };
    const Window_ShardInventory = listWindow('Window_RRThrallShardInventory', 304, 56, 304, 264);
    Window_ShardInventory.prototype.drawItem = function(index) {
        const item = this._data[index];
        if (!item) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        const holdsShard = elements(item).some(e => e >= 19 && e <= 39 && e !== 23);
        for (const m of $gameParty.members()) for (const e of m.equips()) if (item === e) this.rrVxDrawIcon(v(80) > 0 ? 863 : 862, rect.x, rect.y, true);
        this.rrVxDrawItemName(item, rect.x, rect.y, true);
        this.changeTextColor(this.rrVxNormalColor());
        if (holdsShard) this.rrVxDrawText(rect.x, rect.y, rect.width, WLH, '100G', 2);
    };

    const Window_ShardLabel = vxWindow('Window_RRThrallShardLabel', Window_Base, function(x, type) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, 0, 304, 56));
        this.refresh(type);
    });
    Window_ShardLabel.prototype.refresh = function(type) {
        this.contents.clear();
        this.changeTextColor(this.rrVxNormalColor());
        $gameVariables.setValue(2, $gameParty.items().length);
        const gold = 'Gold: ' + $gameParty.gold() + 'G';
        if (type === 0 || type === 1) {
            this.rrVxDrawText(0, 0, 136, WLH, type === 0 ? 'Weapons' : 'Armors', 1);
            this.rrVxDrawText(136, 0, 136, WLH, gold, 1);
        } else {
            this.rrVxDrawText(0, 0, 136, WLH, 'Shards', 1);
            if (v(2) >= v(26)) this.changeTextColor(this.rrVxPowerDownColor());
            this.rrVxDrawText(136, 0, 136, WLH, 'Backpack: ' + v(2) + '/' + v(26), 1);
        }
    };

    const Window_ShardOptions = vxWindow('Window_RRThrallShardOptions', Window_Base, function() {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 424, 608, 56));
        this.refresh();
    });
    Window_ShardOptions.prototype.refresh = function() {
        this.contents.clear();
        this.changeTextColor(this.rrVxNormalColor());
        this.rrVxDrawIcon(inputIcon(6), 0, 0);
        this.rrVxDrawText(28, 0, 140, WLH, v(100) === 0 ? 'Sort: Rarity' : 'Sort: Type', 0);
        this.rrVxDrawIcon(inputIcon(3), 202, 0);
        this.rrVxDrawIcon(inputIcon(4), 350, 0);
        this.rrVxDrawText(0, 0, 576, WLH, 'Change Category', 1);
        const text = 'Favorite';
        const x = this.contents.width - this.textWidth(text);
        this.rrVxDrawIcon(inputIcon(0), x - 28, 0);
        this.rrVxDrawText(x, 0, 140, WLH, text, 0);
    };

    /**
     * The loot table's Window_Stats (the loot port's Window_RRThrallStats), or a plainer one: name, the stats
     * line, level and price.
     */
    function statsWindow(x, y, w, h) {
        const shared = window.Window_RRThrallStats;
        return typeof shared === 'function' ? new shared(x, y, w, h) : new Window_PlainStats(x, y, w, h);
    }
    const Window_PlainStats = vxWindow('Window_RRThrallPlainStats', Window_Base, function(x, y, w, h) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
    });
    Window_PlainStats.prototype.refresh = function(index, items) {
        this.contents.clear();
        const item = items[index];
        if (!items.length || !item) return;
        this.rrVxDrawItemName(item, 0, 0, true);
        const label = (x, y, text, value) => {
            this.changeTextColor(this.rrVxSystemColor());
            this.rrVxDrawText(x, y, 45, WLH, text, 0);
            this.changeTextColor(this.rrVxNormalColor());
            this.rrVxDrawText(x + 49, y, 89, WLH, value, 0);
        };
        if (DataManager.isItem(item)) {
            label(0, WLH, 'Effect:', '');
            this.rrVxDrawText(55, WLH, 467, WLH, item.description, 0);
            label(0, WLH * 2, 'SELL:', idiv(item.price, 5) + 'G');
            return;
        }
        const r = rec(item);
        if (DataManager.isWeapon(item)) {
            label(0, WLH, 'DMG:', r.atk); label(146, WLH, 'DEX:', r.agi); label(292, WLH, 'ACC:', r.hit + '%'); label(438, WLH, 'CRIT:', r.spi + '%');
        } else {
            label(0, WLH, 'HP:', r.atk); label(146, WLH, 'DEF:', r.def); label(292, WLH, 'RES:', r.spi); label(438, WLH, 'EVA:', r.eva + '%');
        }
        label(0, WLH * 2, 'LVL:', item.description);
        label(146, WLH * 2, 'SELL:', idiv(item.price, 5) + 'G');
    };

    //-------------------------------------------------------------------------
    // Scene_Shards
    //-------------------------------------------------------------------------
    const WEAPON_SHARDS = ['Orange', 'Green', 'Indigo', 'Black', 'Scholar', 'Elite', 'Thorn', 'Gamble', 'Rogue', 'Proficiency', 'Talented', 'Holy', 'Overflow', 'Seeker',
        'Demolitions', 'Burning', 'Freezing', 'Static', 'Toxic', 'Sunstone'];
    const ARMOR_SHARDS = ['Red', 'Yellow', 'Blue', 'Violet'];
    /** extract element → [shard item, element-carrier record], armours and weapons. */
    const ARMOR_EXTRACT = { 19: [173, 493], 20: [175, 494], 21: [177, 495], 22: [179, 496] };
    const WEAPON_EXTRACT = { 19: [174, 529], 20: [176, 530], 21: [178, 531], 22: [180, 532], 24: [184, 534], 25: [185, 535], 26: [186, 536], 27: [187, 537], 28: [188, 538],
        29: [189, 539], 30: [190, 540], 31: [191, 541], 32: [192, 542], 33: [193, 543], 34: [194, 544], 35: [195, 545], 36: [196, 546], 37: [197, 547], 38: [198, 548], 39: [199, 549] };
    const FIRE = [2, 8, 14, 18, 22, 85, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 168];
    const ICE = [3, 9, 15, 19, 23, 76, 100, 101, 102, 112, 113, 114, 117, 118, 119, 122, 126, 130, 134, 138, 142, 143, 144, 158, 159, 160, 163, 164, 165, 168];
    const SHOCK = [4, 10, 16, 20, 24, 85, 100, 103, 104, 112, 115, 116, 117, 120, 121, 123, 127, 131, 135, 139, 143, 145, 158, 161, 162, 163, 166, 167, 168];
    const WEAK = [76, 95, 96, 97, 98, 99, 101, 103, 113, 115, 118, 120, 124, 128, 132, 136, 140, 142, 143, 144, 145, 146, 159, 161, 164, 166];

    function Scene_RRThrallShards() { this.initialize(...arguments); }
    Scene_RRThrallShards.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallShards.prototype.constructor = Scene_RRThrallShards;
    Scene_RRThrallShards.prototype.createButtons = function() {};
    Scene_RRThrallShards.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this._shardWindow = new Window_Shards();
        this._shardWindow.select(0);
        this._shardWindow.activate();
        this._equipWindow = new Window_ShardInventory();
        this._equipWindow.deselect();
        this._equipWindow.deactivate();
        this._statsWindow = statsWindow(0, 320, 608, 104);
        this._labelSWindow = new Window_ShardLabel(0, 2);
        this._labelEWindow = new Window_ShardLabel(304, 0);
        this._optionsWindow = new Window_ShardOptions();
        this._inserting = false;
        this._selectedShard = null;
        this._backpack = 0;
        this._lastIndex = 0;
        this._tempIndex = 0;
        this.setSorts();
        this.refreshShards();
        this.refreshEquips();
        this._shardWindow.refreshList(this._shardData);
        this._equipWindow.refreshList(this._equipData);
        this._statsWindow.refresh(0, this._shardData);
        for (const w of [this._shardWindow, this._equipWindow, this._statsWindow, this._labelSWindow, this._labelEWindow, this._optionsWindow]) this.addWindow(w);
    };
    Scene_RRThrallShards.prototype.setSorts = function() {
        if (v(100) === 0) { this._sort1 = [9, 14]; this._sort2 = [1, 5]; this._sort3 = [9, 14]; this._sort4 = [0, 3]; }
        else { this._sort1 = [1, 5]; this._sort2 = [9, 14]; this._sort3 = [0, 3]; this._sort4 = [9, 14]; }
    };
    Scene_RRThrallShards.prototype.refreshShards = function() {
        this._shardData = [];
        const check = this._backpack === 0 ? WEAPON_SHARDS : ARMOR_SHARDS;
        for (let ii = 0; ii <= 56; ii++) {
            for (let i = 1; i <= v(26); i++) {
                const item = $dataItems[i];
                if (!item) continue;
                const name = firstWords(item);
                if (!check.includes(name[0]) || name[1] !== 'Shard') continue;
                if (!partyHasItem(item, false)) continue;
                const key = v(100) === 0 ? get(item, 'mp_recovery_rate') : get(item, 'mp_recovery');
                if (key === ii) this._shardData.push(item);
            }
        }
    };
    Scene_RRThrallShards.prototype.refreshEquips = function() {
        this._equipData = [];
        if (this._backpack === 0) {
            for (let ii = this._sort1[0]; ii <= this._sort1[1]; ii++) for (let iii = this._sort2[0]; iii <= this._sort2[1]; iii++) {
                for (let i = 1; i <= 4 + v(5); i++) {
                    const w = $dataWeapons[i];
                    if (w && partyHasItem(w, true) && elements(w).includes(ii) && elements(w).includes(iii)) this._equipData.push(w);
                }
            }
        } else {
            for (let ii = this._sort3[0]; ii <= this._sort3[1]; ii++) for (let iii = this._sort4[0]; iii <= this._sort4[1]; iii++) {
                for (let i = 1; i <= 16 + v(6); i++) {
                    const a = $dataArmors[i];
                    if (!a || !partyHasItem(a, true)) continue;
                    const kind = get(a, 'kind');
                    if (this._sort3[0] === 0) { if (elements(a).includes(iii) && kind === ii) this._equipData.push(a); }
                    else if (elements(a).includes(ii) && kind === iii) this._equipData.push(a);
                }
            }
        }
    };
    Scene_RRThrallShards.prototype.refreshLists = function() {
        this.refreshEquips();
        this.refreshShards();
        this._equipWindow.refreshList(this._equipData);
        this._shardWindow.refreshList(this._shardData);
    };
    Scene_RRThrallShards.prototype.swapTo = function(from, to, index) {
        const temp = from.index();
        from.deselect();
        from.deactivate();
        to.select(index);
        to.activate();
        return temp;
    };
    Scene_RRThrallShards.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        const sw = this._shardWindow, ew = this._equipWindow;
        if (this._lastIndex !== sw.index() && sw.index() >= 0 && !this._inserting) {
            this._lastIndex = sw.index();
            this._statsWindow.refresh(sw.index(), this._shardData);
        } else if (this._lastIndex !== ew.index() && ew.index() >= 0) {
            this._lastIndex = ew.index();
            this._statsWindow.refresh(ew.index(), this._equipData);
        }
        const trig = (n) => Input.isTriggered(n);
        if (trig('cancel')) {
            SoundManager.playCancel();
            if (this._inserting) {
                const temp = ew.index();
                ew.deselect();
                ew.deactivate();
                sw.select(this._tempIndex);
                this._tempIndex = temp;
                sw.activate();
                this._statsWindow.refresh(sw.index(), this._shardData);
                this._inserting = false;
            } else toMap();
        } else if (trig('ok') && sw.index() >= 0 && !this._inserting) {
            this._selectedShard = this._shardData[sw.index()] || null;
            if (this._selectedShard) {
                const temp = sw.index();
                sw.deactivate();
                ew.select(this._tempIndex);
                this._tempIndex = temp;
                ew.activate();
                this._statsWindow.refresh(ew.index(), this._equipData);
                SoundManager.playOk();
                this._inserting = true;
            } else SoundManager.playBuzzer();
        } else if (trig('ok') && ew.index() >= 0) {
            if (this._inserting) this.insertShard(); else this.extractShard();
        } else if (trig('right') && !this._inserting) {
            if (sw.index() >= 0) {
                this._tempIndex = this.swapTo(sw, ew, this._tempIndex);
                this._statsWindow.refresh(ew.index(), this._equipData);
                SoundManager.playCursor();
            }
        } else if (trig('left') && !this._inserting) {
            if (ew.index() >= 0) {
                this._tempIndex = this.swapTo(ew, sw, this._tempIndex);
                this._statsWindow.refresh(sw.index(), this._shardData);
                SoundManager.playCursor();
            }
        } else if ((trig('pageup') || trig('pagedown')) && !this._inserting) {
            this._backpack = this._backpack === 0 ? 1 : 0;
            this.refreshShards();
            this.refreshEquips();
            sw.refreshList(this._shardData);
            ew.refreshList(this._equipData);
            this._labelEWindow.refresh(this._backpack);
            if (!(v(3) === 0 && ew.index() >= 0)) this._tempIndex = 0;
            if (ew.index() >= 0) { ew.select(0); this._statsWindow.refresh(0, this._equipData); }
            else if (sw.index() >= 0) { sw.select(0); this._statsWindow.refresh(0, this._shardData); }
            SoundManager.playCursor();
        } else if (trig('shift')) {
            this.toggleFavorite();
        } else if (trig('rgssY') && !this._inserting) {
            $gameVariables.setValue(100, v(100) === 0 ? 1 : 0);
            this.setSorts();
            this.refreshShards();
            this.refreshEquips();
            sw.refreshList(this._shardData);
            ew.refreshList(this._equipData);
            this._optionsWindow.refresh();
            if (!(v(3) === 0 && ew.index() >= 0)) this._tempIndex = 0;
            if (ew.index() >= 0) { ew.select(0); this._statsWindow.refresh(0, this._equipData); }
            else if (sw.index() >= 0) { sw.select(0); this._statsWindow.refresh(0, this._shardData); }
            SoundManager.playCursor();
        }
    };
    Scene_RRThrallShards.prototype.toggleFavorite = function() {
        const ew = this._equipWindow;
        if (ew.index() < 0) return;
        const item = this._equipData[ew.index()];
        if (!item) return;
        const vx = VX();
        if (vx && vx.lootToggleFavorite) vx.lootToggleFavorite(item);
        else {
            const mark = DataManager.isWeapon(item) ? $dataWeapons[527] : $dataArmors[491];
            set(item, 'element_set', elements(item).includes(18) ? minus(elements(item), elements(mark)) : elements(item).concat(elements(mark)));
        }
        ew.refresh();
        this._statsWindow.refresh(ew.index(), this._equipData);
        SoundManager.playOk();
    };
    Scene_RRThrallShards.prototype.afterChange = function() {
        this.refreshLists();
        this._labelSWindow.refresh(2);
        this._labelEWindow.refresh(this._backpack);
    };
    Scene_RRThrallShards.prototype.insertShard = function() {
        const ew = this._equipWindow, sw = this._shardWindow;
        const item = this._equipData[ew.index()];
        const shard = this._selectedShard;
        const name = firstWords(shard);
        let p = get(shard, 'parameter_points') || 0;
        let insert = !!item;
        if (item) for (let i = 19; i <= 39; i++) if (i !== 23 && elements(item).includes(i)) insert = false;
        if (!insert) { SoundManager.playBuzzer(); return; }
        const add = (carrier) => set(item, 'element_set', elements(item).concat(elements(carrier)));
        const addStates = (carrier) => set(item, 'state_set', states(item).concat(states(carrier)));
        const r = rec(item);
        if (DataManager.isArmor(item)) {
            set(item, 'agi', p);
            const stat = { Red: ['atk', 493], Yellow: ['def', 494], Blue: ['spi', 495], Violet: ['eva', 496] }[name[0]];
            if (stat) { set(item, stat[0], r[stat[0]] + p); add($dataArmors[stat[1]]); }
        } else if (DataManager.isWeapon(item)) {
            set(item, 'def', p);
            const W = (id) => $dataWeapons[id];
            switch (name[0]) {
                case 'Orange': set(item, 'atk', r.atk + p); add(W(529)); break;
                case 'Green': set(item, 'agi', r.agi + p); add(W(530)); break;
                case 'Indigo': set(item, 'hit', r.hit + p); add(W(531)); break;
                case 'Black': set(item, 'spi', r.spi + p); add(W(532)); break;
                case 'Scholar': p = toI(get(item, 'description')); set(item, 'def', p); set(item, 'description', '1'); add(W(534)); break;
                case 'Elite': set(item, 'def', 10); add(W(535)); break;
                case 'Thorn': set(item, 'def', 10); add(W(536)); break;
                case 'Gamble': { set(item, 'def', r.spi); const q = idiv(r.hit + r.spi, 2); set(item, 'hit', q); set(item, 'spi', q); add(W(537)); break; }
                case 'Rogue': set(item, 'def', r.atk); set(item, 'atk', r.agi); set(item, 'agi', r.def); add(W(538)); break;
                case 'Proficiency': add(W(539)); break;
                case 'Talented':
                    add(W(540));
                    for (const actor of $gameParty.members()) if (actor.rrRelearnEquipSkills) actor.rrRelearnEquipSkills(0);
                    break;
                case 'Holy': set(item, 'def', 10); add(W(541)); break;
                case 'Overflow': set(item, 'def', 10); add(W(542)); break;
                case 'Seeker': set(item, 'def', 10); add(W(543)); break;
                case 'Demolitions': set(item, 'def', 10); add(W(544)); break;
                case 'Burning': case 'Freezing': case 'Static': {
                    const [carrier, element, base, status] = { Burning: [545, 6, 501, 2], Freezing: [546, 7, 502, 3], Static: [547, 8, 503, 4] }[name[0]];
                    set(item, 'def', r.animation_id);
                    add(W(carrier));
                    if (!elements(item).includes(element)) { add(W(base)); addStates(W(base)); }
                    set(item, 'animation_id', changeAnimation(r.def, status));
                    break;
                }
                case 'Toxic':
                    set(item, 'def', r.animation_id);
                    add(W(548));
                    if (!states(item).includes(5)) addStates(W(504));
                    set(item, 'animation_id', changeAnimation(r.def, 5));
                    break;
                case 'Sunstone':
                    set(item, 'def', r.animation_id);
                    add(W(549));
                    addStates(W(533));
                    set(item, 'animation_id', changeAnimation(r.def, 45));
                    break;
            }
        }
        $gameParty.loseItem(shard, 1);
        sw.deselect();
        this._tempIndex = 0;
        this.afterChange();
        se('Ice4', 70, 150);
        this._statsWindow.refresh(ew.index(), this._equipData);
        this._inserting = false;
    };
    const SHARD_FIELDS = ['scope', 'occasion', 'animation_id', 'base_damage', 'variance', 'atk_f', 'physical_attack', 'element_set', 'plus_state_set', 'minus_state_set',
        'consumable', 'hp_recovery_rate', 'hp_recovery', 'mp_recovery_rate', 'mp_recovery', 'parameter_type', 'parameter_points', 'common_event_id'];
    /** The shard item in a free item slot, from the shard `s` with `p` points; false when gold runs short. */
    function makeShard(s, p, percent) {
        for (let i = 1; i <= v(26); i++) {
            const slot = $dataItems[i];
            if (!slot || hasItem(slot, true)) continue;
            if ($gameParty.gold() < 100) return null;
            $gameParty.loseGold(100);
            // The fields the script copies, then the slot's price and points.
            for (const f of ['name', 'iconIndex', 'description', 'note']) slot[f] = s[f];
            const from = rec(s), to = rec(slot);
            for (const f of SHARD_FIELDS) to[f] = Array.isArray(from[f]) ? from[f].slice() : from[f];
            slot.price = p * 5;
            rec(slot).parameter_points = p;
            slot.description = String(s.description || '') + p + (percent ? '%' : '');
            sync(slot);
            $gameParty.gainItem(slot, 1);
            return slot;
        }
        return null;
    }
    Scene_RRThrallShards.prototype.extractShard = function() {
        const ew = this._equipWindow;
        const item = this._equipData[ew.index()];
        let extract = 0;
        if (item) for (let i = 19; i <= 38; i++) if (i !== 23 && elements(item).includes(i)) extract = i;
        let replace = false;
        const r = rec(item);
        if (item && DataManager.isArmor(item) && extract !== 0 && ARMOR_EXTRACT[extract]) {
            const [shardId, carrierId] = ARMOR_EXTRACT[extract];
            const p = Math.max(r.agi, 1);
            if (makeShard($dataItems[shardId], p, extract === 22)) {
                set(item, 'element_set', minus(elements(item), elements($dataArmors[carrierId])));
                set(item, 'agi', 0);
                const stat = { 19: 'atk', 20: 'def', 21: 'spi', 22: 'eva' }[extract];
                set(item, stat, r[stat] - p);
                replace = true;
            }
        } else if (item && DataManager.isWeapon(item) && extract !== 0 && WEAPON_EXTRACT[extract]) {
            const [shardId, carrierId] = WEAPON_EXTRACT[extract];
            const p = Math.max(r.def, 1);
            const slot = makeShard($dataItems[shardId], p, extract === 21 || extract === 22);
            if (slot) {
                if (![19, 20, 21, 22].includes(extract)) slot.description = String($dataItems[shardId].description || '');
                switch (extract) {
                    case 19: set(item, 'atk', r.atk - p); break;
                    case 20: set(item, 'agi', r.agi - p); break;
                    case 21: set(item, 'hit', r.hit - p); break;
                    case 22: set(item, 'spi', r.spi - p); break;
                    case 24: set(item, 'description', r.def); break;
                    case 27: set(item, 'hit', r.hit * 2 - r.def); set(item, 'spi', r.def); break;
                    case 28: set(item, 'agi', r.atk); set(item, 'atk', r.def); break;
                    case 30: for (const actor of $gameParty.members()) for (let s = 220; s <= 224; s++) actor.forgetSkill(s); break;
                    case 35: case 36: case 37: case 38: {
                        set(item, 'animation_id', r.def);
                        const [list, element, status] = { 35: [FIRE, 6, 2], 36: [ICE, 7, 3], 37: [SHOCK, 8, 4], 38: [WEAK, null, 5] }[extract];
                        if (!list.includes(r.def)) {
                            if (element !== null) r.element_set.splice(0, r.element_set.length, ...r.element_set.filter(e => e !== element));
                            r.state_set.splice(0, r.state_set.length, ...r.state_set.filter(s => s !== status));
                        }
                        break;
                    }
                    case 39: set(item, 'animation_id', r.def); r.state_set.splice(0, r.state_set.length, ...r.state_set.filter(s => s !== 45)); break;
                }
                set(item, 'element_set', minus(elements(item), elements($dataWeapons[carrierId])));
                if (extract === 30) for (const actor of $gameParty.members()) if (actor.rrRelearnEquipSkills) actor.rrRelearnEquipSkills(0);
                set(item, 'def', 0);
                replace = true;
            }
        }
        if (replace) {
            this.afterChange();
            se('Loot', 100, Math.randomInt(9) * 5 + 80);
            this._statsWindow.refresh(ew.index(), this._equipData);
        } else SoundManager.playBuzzer();
    };
    window.Scene_RRThrallShards = Scene_RRThrallShards;
})();
