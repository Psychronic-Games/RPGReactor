/*:
 * @target MZ
 * @plugindesc Trinket Interface (VX), for imported games
 * @author Strak; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallTrinkets.js
 *
 * The trinket cabinet. Trinkets: the ones the player has earned (each has a
 * switch), two to a row; the action button equips the chosen one (a
 * variable holds the equipped trinket, marked with an icon). Challenges: each
 * with its progress [count/goal] from a variable; the action button completes
 * one whose goal is met, which turns on its trinket's switch (completed ones
 * are drawn in another colour). Page up and page down switch between the
 * two lists; the bottom window describes the chosen entry.
 *
 * Opening it copies the party's gold, the pain threshold variable and the
 * lowest party level (at most 70) into the variables the challenges count.
 * Leaving it restores every member's HP and, unless Warding Mask (trinket
 * 23) is equipped, clears their pain.
 *
 * Scene: Scene_RRThrallTrinkets (the game's $scene = Scene_Trinket.new).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param trinkets
 * @text Trinkets
 * @desc JSON [[id, icon, switch, name, description], …]
 * @default []
 *
 * @param challenges
 * @text Challenges
 * @desc JSON [[id, variable, goal, switch, name, description, icon], …]
 * @default []
 *
 * @param trinketVariable
 * @text Equipped trinket variable
 * @type variable
 * @default 185
 *
 * @param equippedIcon
 * @text Equipped icon
 * @type number
 * @default 862
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallTrinkets');
    const json = (v, d) => { try { const x = JSON.parse(v); return x == null ? d : x; } catch (_) { return d; } };
    const TRINKETS = json(params.trinkets, []);
    const CHALLENGES = json(params.challenges, []);
    const TRINKET_VARIABLE = Number(params.trinketVariable || 185);
    const EQUIPPED_ICON = Number(params.equippedIcon || 862);
    const WARDING_MASK = 23;
    const WLH = 24;
    const inputIcon = (i) => ($gameSystem.rrReadInput ? $gameSystem.rrReadInput(i) : 854);
    const v = (id) => $gameVariables.value(id);
    /** $scene = Scene_Map.new: back to the map under this scene, or a new one. */
    const toMap = () => {
        const stack = SceneManager._stack || [];
        if (stack.length && stack[stack.length - 1] === Scene_Map) SceneManager.pop();
        else SceneManager.goto(Scene_Map);
    };
    const vxWindow = (name, base, init) => {
        const Cls = function() { this.initialize(...arguments); };
        Cls.prototype = Object.create(base.prototype);
        Cls.prototype.constructor = Cls;
        Cls.prototype.initialize = init;
        window[name] = Cls;
        return Cls;
    };

    /** Window_Cabinet_Description: the chosen entry's name and description. */
    const Window_Description = vxWindow('Window_RRThrallCabinetDescription', Window_Base, function(x, y, w, h) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, y, w, h));
    });
    Window_Description.prototype.refresh = function(index, items, menuType) {
        this.contents.clear();
        const item = items[index];
        if (!items.length || !item) return;
        this.changeTextColor(this.rrVxNormalColor());
        if (menuType === 0) {
            this.rrVxDrawIcon(item[1], 0, 0);
            this.rrVxDrawText(24, 0, 467, WLH, item[3], 0);
            this.rrVxDrawText(0, WLH, 576, WLH, item[4], 0);
        } else {
            this.rrVxDrawIcon(item[6], 0, 0);
            this.rrVxDrawText(24, 0, 572, WLH, `${item[4]} [${v(item[1])}/${item[2]}]`, 0);
            this.rrVxDrawText(0, WLH, 576, WLH, item[5], 0);
        }
    };

    /** Window_Trinket: the list, two to a row. */
    const Window_Trinket = vxWindow('Window_RRThrallTrinket', Window_Selectable, function(x, y, w, h, data) {
        Window_Selectable.prototype.initialize.call(this, new Rectangle(x, y, w, h));
        this._data = [];
        this._menuType = 0;
        this.select(0);
        this.refreshList(data, 0);
    });
    Window_Trinket.prototype.maxCols = function() { return 2; };
    Window_Trinket.prototype.itemHeight = function() { return WLH; };
    Window_Trinket.prototype.maxItems = function() { return this._data.length; };
    Window_Trinket.prototype.refreshList = function(data, menuType) {
        this._data = data;
        if (this._data.length <= 0) this._data.push(null);
        this._menuType = menuType;
        this.refresh();
    };
    Window_Trinket.prototype.drawItem = function(index) {
        const item = this._data[index];
        if (!item) return;
        const rect = this.itemRect(index);
        this.changeTextColor(this.rrVxNormalColor());
        if (this._menuType === 0) {
            this.rrVxDrawIcon(item[1], rect.x, rect.y);
            this.rrVxDrawText(rect.x + 24, rect.y, rect.width, WLH, item[3], 0);
            if (v(TRINKET_VARIABLE) === item[0]) this.rrVxDrawIcon(EQUIPPED_ICON, rect.x, rect.y);
        } else {
            this.rrVxDrawIcon(item[6], rect.x, rect.y);
            this.changeTextColor($gameSwitches.value(item[3]) ? this.rrVxTextColor(6) : this.rrVxNormalColor());
            this.rrVxDrawText(rect.x + 24, rect.y, rect.width, WLH, item[4], 0);
            this.rrVxDrawText(rect.x, rect.y, rect.width, WLH, `[${v(item[1])}/${item[2]}]`, 2);
        }
    };

    function Scene_RRThrallTrinkets() { this.initialize(...arguments); }
    Scene_RRThrallTrinkets.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallTrinkets.prototype.constructor = Scene_RRThrallTrinkets;
    Scene_RRThrallTrinkets.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._data = [];
        this._menuType = 0;
        this._lastIndex = null;
        this.refreshData();
    };
    Scene_RRThrallTrinkets.prototype.createButtons = function() {};
    Scene_RRThrallTrinkets.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        this._statsWindow = new Window_Description(0, 376, 608, 104);
        this._headerWindow = new Window_Base(new Rectangle(0, 0, 304, 56));
        this._categoryWindow = new Window_Base(new Rectangle(304, 0, 304, 56));
        $gameVariables.setValue(182, $gameParty.gold());
        $gameVariables.setValue(183, v(151));
        let l = 70;
        for (const m of $gameParty.members()) if (m.level < l) l = m.level;
        $gameVariables.setValue(173, l);
        this.refreshHeader();
        this.refreshCategory();
        this._itemWindow = new Window_Trinket(0, 56, 608, 320, this._data);
        this._itemWindow.activate();
        for (const w of [this._statsWindow, this._headerWindow, this._categoryWindow, this._itemWindow]) this.addWindow(w);
    };
    Scene_RRThrallTrinkets.prototype.refreshData = function() {
        this._data = this._menuType === 0 ? TRINKETS.filter(t => $gameSwitches.value(t[2])) : CHALLENGES.slice();
    };
    Scene_RRThrallTrinkets.prototype.refreshHeader = function() {
        const w = this._headerWindow;
        w.contents.clear();
        w.changeTextColor(w.rrVxNormalColor());
        w.rrVxDrawText(0, 0, 272, WLH, this._menuType === 0 ? 'Select a Trinket to equip' : 'Select a Challenge to complete', 1);
    };
    Scene_RRThrallTrinkets.prototype.refreshCategory = function() {
        const w = this._categoryWindow;
        w.contents.clear();
        w.rrVxDrawIcon(inputIcon(3), 0, 0);
        w.rrVxDrawIcon(inputIcon(4), 248, 0);
        const dim = w.rrVxTextColor(8), normal = w.rrVxNormalColor();
        w.changeTextColor(this._menuType === 0 ? normal : dim);
        w.rrVxDrawText(24, 0, 112, WLH, 'Trinkets', 1);
        w.changeTextColor(this._menuType === 0 ? dim : normal);
        w.rrVxDrawText(136, 0, 112, WLH, 'Challenges', 1);
    };
    Scene_RRThrallTrinkets.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        const win = this._itemWindow;
        if (this._lastIndex !== win.index() && win.index() >= 0) {
            this._lastIndex = win.index();
            this._statsWindow.refresh(win.index(), this._data, this._menuType);
        }
        if (win.active) this.updateItemSelection();
    };
    Scene_RRThrallTrinkets.prototype.updateItemSelection = function() {
        const win = this._itemWindow;
        if (Input.isTriggered('cancel')) {
            SoundManager.playCancel();
            this.returnScene();
        } else if (Input.isTriggered('ok')) {
            const item = this._data[win.index()];
            if (!item) { SoundManager.playBuzzer(); return; }
            if (this._menuType === 0) {
                SoundManager.playOk();
                $gameVariables.setValue(TRINKET_VARIABLE, item[0]);
                win.refreshList(this._data, this._menuType);
            } else if ($gameSwitches.value(item[3])) SoundManager.playBuzzer();
            else if (v(item[1]) >= item[2]) {
                $gameSwitches.setValue(item[3], true);
                SoundManager.playOk();
                win.refreshList(this._data, this._menuType);
            } else SoundManager.playBuzzer();
        } else if (Input.isTriggered('pageup') || Input.isTriggered('pagedown')) {
            this._menuType = this._menuType === 0 ? 1 : 0;
            SoundManager.playCursor();
            win.select(0);
            this.refreshData();
            this.refreshHeader();
            this.refreshCategory();
            this._statsWindow.refresh(win.index(), this._data, this._menuType);
            win.refreshList(this._data, this._menuType);
        }
    };
    /** return_scene: every member at full HP, pain cleared (kept with Warding Mask), back to the map. */
    Scene_RRThrallTrinkets.prototype.returnScene = function() {
        for (const m of $gameParty.members()) {
            m.setHp(m.mhp);
            if (v(TRINKET_VARIABLE) !== WARDING_MASK) { if (m.rrSetPain) m.rrSetPain(0); else m._rrPain = 0; }
        }
        toMap();
    };
    window.Scene_RRThrallTrinkets = Scene_RRThrallTrinkets;
})();
