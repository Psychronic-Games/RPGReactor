/*:
 * @target MZ
 * @plugindesc Feature Shop (VX), for imported games
 * @author Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallFeatureShop.js
 *
 * Thrall's feature shop (Scene_Appraise), three counters in one scene: a
 * header (what to pick, and the party's gold), a two-column list with
 * prices, and the selected entry's details below.
 *   0  upgrades: the next backpack and storage size for items, weapons and
 *      armours (each buys 2 more slots in its variable: 26, 27, 5, 7, 6, 8)
 *   1  appraisal (50G): equipment whose name or prefix the Guide has not
 *      listed yet; appraising lists it (and a named legendary piece becomes
 *      craftable)
 *   2  the bestiary: enemy entries of the Guide, for sale
 *
 * Script call: SceneManager.push(Scene_RRThrallAppraise), then
 * SceneManager.prepareNextScene(counter) — what $scene = Scene_Appraise.new(n)
 * does. Uses RR_ThrallGuide's guides and RR_ThrallLoot's detail window.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param tables
 * @text Shop tables
 * @desc JSON: STRAK::APPRAISE's STORAGE, ENEMIES, the prefix and name lists, W_ID, A_ID, LW, LA.
 * @type note
 * @default "{}"
 */
(() => {
    'use strict';
    const PLUGIN = 'RR_ThrallFeatureShop';
    const P = PluginManager.parameters(PLUGIN);
    const json = (s, d) => {
        try { let v = s ? JSON.parse(s) : d; if (typeof v === 'string') v = JSON.parse(v); return v && typeof v === 'object' ? v : d; } catch (_) { return d; }
    };
    const T = json(P.tables, {});
    const t = (name) => T[name] || [];
    const WLH = 24;
    const vars = (id) => $gameVariables.value(id);
    const VX = () => window.RRThrallVx || {};
    const BUTTONS = ['shift', 'escape', 'ok', 'pageup', 'pagedown', 'rgssX', 'rgssY', 'rgssZ', 'up', 'left', 'down', 'right'];
    const trig = (i) => (Input.rrGamepadTriggered ? Input.rrGamepadTriggered(i) : Input.isTriggered(BUTTONS[i]));
    const CANCEL = 1, CONFIRM = 2;

    // The Guide's state, through RR_ThrallGuide when it is on.
    const guides = {
        revealed: (id) => !!($gameParty.rrGuideRevealed && $gameParty.rrGuideRevealed(id)),
        prefixRevealed: (id, g) => !!($gameParty.rrPrefixRevealed && $gameParty.rrPrefixRevealed(id, g)),
        reveal: (id) => { if ($gameParty.rrRevealGuide) $gameParty.rrRevealGuide(id); },
        revealPrefix: (id, g) => { if ($gameParty.rrRevealPrefix) $gameParty.rrRevealPrefix(id, g); }
    };
    const kindOf = (obj) => (VX().lootKind ? VX().lootKind(obj) : DataManager.isWeapon(obj) ? 'weapon' : DataManager.isArmor(obj) ? 'armor' : DataManager.isItem(obj) ? 'item' : null);
    const elementSet = (obj) => { const r = VX().lootRecord ? VX().lootRecord(kindOf(obj), obj.id) : null; return (r && r.element_set) || []; };

    // ---- windows ------------------------------------------------------------------------------------
    const vx = {
        color(w, n) { return w.rrVxTextColor ? w.rrVxTextColor(n) : ColorManager.textColor(n); },
        normal(w) { return w.rrVxNormalColor ? w.rrVxNormalColor() : ColorManager.normalColor(); },
        system(w) { return w.rrVxSystemColor ? w.rrVxSystemColor() : ColorManager.systemColor(); },
        text(w, x, y, width, height, text, align = 0) {
            if (w.rrVxDrawText) w.rrVxDrawText(x, y, width, height, text, align);
            else w.contents.drawText(String(text), x, y, width, height, ['left', 'center', 'right'][align] || 'left');
        },
        icon(w, index, x, y, enabled = true) { if (w.rrVxDrawIcon) w.rrVxDrawIcon(index, x, y, enabled); else w.drawIcon(index, x, y); },
        itemName(w, obj, x, y) { if (w.rrVxDrawItemName) w.rrVxDrawItemName(obj, x, y, true); else w.drawItemName(obj, x, y, 196); }
    };
    const vxWindow = (proto) => {
        proto.updatePadding = function() { this.padding = 16; };
        proto.lineHeight = function() { return WLH; };
    };

    /** An upgrade's or entry's details: icon and name in its colour, description, cost. */
    function Window_RRThrallDescription() { this.initialize(...arguments); }
    Window_RRThrallDescription.prototype = Object.create(Window_Base.prototype);
    Window_RRThrallDescription.prototype.constructor = Window_RRThrallDescription;
    vxWindow(Window_RRThrallDescription.prototype);
    Window_RRThrallDescription.prototype.initialize = function(x, y, w, h) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
    };
    Window_RRThrallDescription.prototype.refresh = function(index, items) {
        this.contents.clear();
        const item = items[index];
        if (!items.length || !item) return;
        vx.icon(this, item[0], 0, 0);
        this.changeTextColor(vx.color(this, item[1]));
        vx.text(this, 24, 0, 467, 24, item[2], 0);
        this.changeTextColor(vx.system(this));
        vx.text(this, 0, WLH, 100, 24, 'Description:', 0);
        this.changeTextColor(vx.normal(this));
        vx.text(this, 105, WLH, 417, 24, item[3], 0);
        this.changeTextColor(vx.system(this));
        vx.text(this, 0, WLH * 2, 100, 24, 'COST:', 0);
        this.changeTextColor(vx.normal(this));
        vx.text(this, 105, WLH * 2, 73, 24, item[4] + 'G', 0);
    };

    /** The two-column list: upgrades and entries with their price, or equipment to appraise at 50G. */
    function Window_RRThrallAppraise() { this.initialize(...arguments); }
    Window_RRThrallAppraise.prototype = Object.create(Window_Selectable.prototype);
    Window_RRThrallAppraise.prototype.constructor = Window_RRThrallAppraise;
    vxWindow(Window_RRThrallAppraise.prototype);
    Window_RRThrallAppraise.prototype.itemHeight = function() { return WLH; };
    Window_RRThrallAppraise.prototype.maxCols = function() { return 2; };
    Window_RRThrallAppraise.prototype.cursorPagedown = function() {};
    Window_RRThrallAppraise.prototype.cursorPageup = function() {};
    Window_RRThrallAppraise.prototype.initialize = function(x, y, width, height, data, appraise) {
        Window_Selectable.prototype.initialize.call(this, new Rectangle(x, y, width, height));
        this._data = [];
        this.select(0);
        this.setData(data, appraise);
    };
    Window_RRThrallAppraise.prototype.maxItems = function() { return this._data.length; };
    /** refresh(data, appraise): an empty list gets a blank entry (the scene's own list does too, as in the original). */
    Window_RRThrallAppraise.prototype.setData = function(data, appraise) {
        if (data.length <= 0) data.push(null);
        this._data = data;
        this._appraise = appraise;
        this.refresh();
    };
    Window_RRThrallAppraise.prototype.drawItem = function(index) {
        const rect = this.itemRect(index);
        const item = this._data[index];
        if (!item) return;
        if (this._appraise === 1) {
            vx.itemName(this, item, rect.x, rect.y);
            this.changeTextColor(vx.normal(this));
            vx.text(this, rect.x, rect.y, rect.width, 24, '50G', 2);
        } else {
            vx.icon(this, item[0], rect.x, rect.y);
            this.changeTextColor(vx.color(this, item[1]));
            vx.text(this, rect.x + 24, rect.y, rect.width, 24, item[2], 0);
            this.changeTextColor(vx.normal(this));
            vx.text(this, rect.x, rect.y, rect.width, 24, item[4] + 'G', 2);
        }
    };

    // ---- Scene_Appraise ---------------------------------------------------------------------------------
    function Scene_RRThrallAppraise() { this.initialize(...arguments); }
    Scene_RRThrallAppraise.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallAppraise.prototype.constructor = Scene_RRThrallAppraise;
    Scene_RRThrallAppraise.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._appraise = 0;
        this._data = [];
        this._lastIndex = null;
    };
    Scene_RRThrallAppraise.prototype.prepare = function(appraise) { this._appraise = Number(appraise) || 0; };
    Scene_RRThrallAppraise.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this.refreshData();
        const Stats = window.Window_RRThrallStats;
        this._statsWindow = this._appraise === 1 && typeof Stats === 'function' ? new Stats(0, 376, 608, 104) : new Window_RRThrallDescription(0, 376, 608, 104);
        this._headerWindow = new Window_Base(new Rectangle(0, 0, 608, 56));
        vxWindow(this._headerWindow);
        this._headerWindow.updatePadding();
        this._headerWindow.createContents();
        this.refreshHeader();
        this._itemWindow = new Window_RRThrallAppraise(0, 56, 608, 320, this._data, this._appraise);
        this._itemWindow.activate();
        for (const w of [this._statsWindow, this._headerWindow, this._itemWindow]) this.addWindow(w);
    };
    /** The entries on sale, in the original's order. */
    Scene_RRThrallAppraise.prototype.refreshData = function() {
        this._data = [];
        if (this._appraise === 0) {
            // The next size of each backpack and storage (sizes 10-28, two at a time): items, then weapons, then armours.
            for (const [variable, base] of [[26, 0], [27, 30], [5, 10], [7, 40], [6, 20], [8, 50]]) {
                const v = vars(variable);
                if (v >= 10 && v <= 28 && v % 2 === 0) this._data.push(t('STORAGE')[base + (v - 10) / 2]);
            }
        } else if (this._appraise === 1) {
            // Held and worn equipment, rarest first, that still has something to appraise.
            const weapons = $gameParty.weapons().slice();
            const armors = $gameParty.armors().slice();
            for (const actor of $gameParty.members()) {
                for (const e of actor.equips()) {
                    if (e && DataManager.isWeapon(e)) weapons.push(e);
                    if (e && DataManager.isArmor(e)) armors.push(e);
                }
            }
            for (const list of [weapons, armors]) {
                for (let i = 9; i <= 14; i++) for (const item of list) if (item && elementSet(item).includes(i)) this.appraiseItems(item, false);
            }
        } else {
            for (const i of [0, 1, 5, 6, 16, 17, 18, 19, 20, 21, 22]) this.offerEntry(i);
            if (vars(118) >= 5) for (const i of [23, 24]) this.offerEntry(i);   // Shrouded Peaks
            if (vars(118) >= 6 && [2, 3].includes(vars(1))) for (const i of [2, 7]) this.offerEntry(i);   // D'Amico
        }
    };
    Scene_RRThrallAppraise.prototype.offerEntry = function(i) {
        const item = t('ENEMIES')[i];
        if (item && !guides.revealed(item[5])) this._data.push(item);
    };
    Scene_RRThrallAppraise.prototype.refreshHeader = function() {
        const w = this._headerWindow;
        w.contents.clear();
        w.changeTextColor(vx.normal(w));
        const text1 = this._appraise === 0 ? 'Select an Upgrade' : this._appraise === 1 ? 'Select an item to Appraise' : 'Select an Enemy entry to purchase';
        vx.text(w, 0, 0, 288, 24, text1, 1);
        vx.text(w, 288, 0, 288, 24, `Gold: ${$gameParty.gold()}G`, 1);
    };
    Scene_RRThrallAppraise.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        const win = this._itemWindow;
        if (this._lastIndex !== win.index() && win.index() >= 0) {
            this._lastIndex = win.index();
            this._statsWindow.refresh(win.index(), this._data);
        }
        if (win.active) this.updateSelection();
    };
    Scene_RRThrallAppraise.prototype.afterPurchase = function() {
        this.refreshData();
        this.refreshHeader();
        const win = this._itemWindow;
        win.setData(this._data, this._appraise);
        win.select(this._lastIndex ?? 0);
        if (win.index() >= this._data.length) win.select(this._data.length - 1);
        win.ensureCursorVisible(false);
        this._statsWindow.refresh(win.index(), this._data);
    };
    Scene_RRThrallAppraise.prototype.updateSelection = function() {
        if (trig(CANCEL)) {
            SoundManager.playCancel();
            this.returnScene();
            return;
        }
        if (!trig(CONFIRM)) return;
        const item = this._data[this._itemWindow.index()];
        if (!item) { SoundManager.playBuzzer(); return; }
        const cost = this._appraise === 1 ? 50 : item[4];
        if ($gameParty.gold() < cost) { SoundManager.playBuzzer(); return; }
        SoundManager.playShop();
        if (this._appraise === 0) $gameVariables.setValue(item[5], vars(item[5]) + 2);
        $gameParty.gainGold(-cost);
        if (this._appraise === 1) this.appraiseItems(item, true);
        else if (this._appraise !== 0) guides.reveal(item[5]);
        this.afterPurchase();
    };
    /**
     * appraise_items: a named weapon or armour (its second word) unlocks its guide, and a legendary one becomes
     * craftable; an epic, rare or uncommon prefix (the first word) lists its line in the prefix guides 210-215.
     * Not revealing: whether the item has anything left to appraise (then it joins the list).
     */
    Scene_RRThrallAppraise.prototype.appraiseItems = function(item, revealing) {
        const name = String(item.name).split(/ /);
        const weapon = kindOf(item) === 'weapon';
        const named = weapon ? [t('W_NAMES'), t('W_ID'), t('LW'), 'rrWeaponList'] : [t('A_NAMES'), t('A_ID'), t('LA'), 'rrArmorList'];
        const lists = weapon ? [['EW_PREFIX', 210], ['RW_PREFIX', 211], ['UW_PREFIX', 212]] : [['EA_PREFIX', 213], ['RA_PREFIX', 214], ['UA_PREFIX', 215]];
        if (named[0].includes(name[1])) {
            for (let i = 0; i < named[0].length; i++) {
                if (named[0][i] !== name[1]) continue;
                if (revealing) {
                    if (!guides.revealed(named[1][i])) {
                        guides.reveal(named[1][i]);
                        if (elementSet(item).includes(10) && $gameSystem[named[3]]) $gameSystem[named[3]]().push(named[2][i]);
                    }
                } else if (!guides.revealed(named[1][i])) { this._data.push(item); return; }
            }
        }
        for (const [list, guide] of lists) {
            const prefixes = t(list);
            if (!prefixes.includes(name[0])) continue;
            for (let i = 0; i < prefixes.length; i++) {
                if (prefixes[i] !== name[0]) continue;
                if (revealing) {
                    if (!guides.prefixRevealed(guide, i + 2)) {
                        if (!guides.revealed(guide)) guides.reveal(guide);
                        guides.revealPrefix(guide, i + 2);
                    }
                } else if (!guides.prefixRevealed(guide, i + 2)) { this._data.push(item); return; }
            }
        }
    };
    /** $scene = Scene_Map.new. */
    Scene_RRThrallAppraise.prototype.returnScene = function() {
        const stack = SceneManager._stack || [];
        if (stack.length && stack[stack.length - 1] === Scene_Map) SceneManager.pop();
        else SceneManager.goto(Scene_Map);
    };

    Object.assign(window, { Scene_RRThrallAppraise, Window_RRThrallAppraise, Window_RRThrallDescription });
})();
