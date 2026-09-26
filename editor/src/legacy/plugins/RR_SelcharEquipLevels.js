/*:
 * @target MZ
 * @plugindesc Equipment Levelling and Equip Upgrade (VX Ace), for imported games
 * @author Selchar (credit Tsukihime); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_SelcharEquipLevels.js
 *
 * Each weapon and armor copy (RR_HimeInstanceItems) has a level, starting at
 * 1 and shown after its name ("Wyvern [+1]"). A level up multiplies each of
 * its eight parameters (then adds a flat amount) and its price, once per
 * level above 1. Notes on a weapon or armor:
 *   <can level>                 the opposite of the default
 *   <max level: x>
 *   <static level atk: x>       <mult level atk: x>   (mhp mmp atk def mat
 *   <static level price: x>     <mult level price: x>  mdf agi luk)
 *
 * The upgrade screen lists the party's weapons and armors; choosing one pays
 * a share of its price and raises its level. The stats beside the list show
 * each parameter now and after the upgrade.
 *
 * Script calls:
 *   SceneManager.push(Scene_RREquipUpgrade)       (SceneManager.call(Scene_EquipUpgrade))
 *   RRSelcharLevels.levelUp(item), .levelDown(item), .level(item),
 *   .canLevel(item), .maxLevel(item), .upgradePrice(item)
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param maxLevel
 * @text Default max level
 * @type number
 * @default 100
 *
 * @param levelFormat
 * @text Level after the name
 * @desc %s is the level.
 * @default  [+%s]
 *
 * @param multBonus
 * @text Parameter multiplier per level
 * @type number
 * @decimals 2
 * @default 1.5
 *
 * @param multPrice
 * @text Price multiplier per level
 * @type number
 * @decimals 2
 * @default 2
 *
 * @param canLevel
 * @text Equipment levels by default
 * @type boolean
 * @default true
 *
 * @param paramNames
 * @text Parameter names in notes
 * @default ["mhp","mmp","atk","def","mat","mdf","agi","luk","mtp"]
 *
 * @param upgradeScene
 * @text Upgrade screen
 * @type boolean
 * @default true
 *
 * @param upgradeText
 * @default Upgrade
 *
 * @param cancelText
 * @default Cancel
 *
 * @param noItemText
 * @default Select an item you wish to upgrade
 *
 * @param priceText
 * @default Upgrade Price:
 *
 * @param maxText
 * @default Max Upgrade
 *
 * @param se
 * @text Upgrade sound
 * @default {"name":"Hammer","volume":100,"pitch":100}
 *
 * @param priceMod
 * @text Upgrade price rate
 * @type number
 * @decimals 2
 * @default 0.5
 *
 * @param windowParams
 * @text Parameters shown
 * @default [0,1,2,3,4,5,6,7]
 */
(() => {
    'use strict';
    const I = window.RRInstanceItems;
    if (!I) return;
    const params = PluginManager.parameters('RR_SelcharEquipLevels');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; } };
    const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const P = {
        maxLevel: num(params.maxLevel, 100),
        format: params.levelFormat ?? ' [+%s]',
        multBonus: num(params.multBonus, 1.5),
        multPrice: num(params.multPrice, 2),
        canLevel: String(params.canLevel) !== 'false',
        names: json(params.paramNames, ['mhp', 'mmp', 'atk', 'def', 'mat', 'mdf', 'agi', 'luk', 'mtp']),
        scene: String(params.upgradeScene) !== 'false',
        upgradeText: params.upgradeText ?? 'Upgrade',
        cancelText: params.cancelText ?? 'Cancel',
        noItemText: params.noItemText ?? 'Select an item you wish to upgrade',
        priceText: params.priceText ?? 'Upgrade Price: ',
        maxText: params.maxText ?? 'Max Upgrade',
        se: json(params.se, { name: 'Hammer', volume: 100, pitch: 100 }),
        priceMod: num(params.priceMod, 0.5),
        windowParams: json(params.windowParams, [0, 1, 2, 3, 4, 5, 6, 7])
    };

    // Ruby's String#to_i and #to_f: the leading number, else 0.
    const toI = (s) => { const m = /^\s*[-+]?\d+/.exec(String(s)); return m ? parseInt(m[0], 10) : 0; };
    const toF = (s) => { const m = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(String(s)); return m ? parseFloat(m[0]) : 0; };
    // Ruby's format with %s and %%.
    const format = (text, ...args) => String(text).replace(/%(%|s|d)/g, (all, c) => (c === '%' ? '%' : String(args.shift())));
    const note = (o) => String(o.note || '');
    const tag = (o, re) => re.exec(note(o));
    const isEquip = (o) => ['weapon', 'armor'].includes(I.kindOf(o));

    const L = {
        level(o) { if (o.level === undefined || o.level === null) o.level = 1; return o.level; },
        canLevel(o) { return /<can[-_ ]?level>/i.test(note(o)) ? !P.canLevel : P.canLevel; },
        /** The cap, read once and kept on the piece as the original kept it. */
        maxLevel(o) {
            if (o.maxLevel === undefined || o.maxLevel === null) { const m = tag(o, /<max[-_ ]?level:\s*(.*)\s*>/i); o.maxLevel = m ? toI(m[1]) : P.maxLevel; }
            return o.maxLevel;
        },
        staticBonus(o, i) { const m = tag(o, new RegExp('<static[-_ ]?level[-_ ]?' + P.names[i] + ':\\s*(.*)\\s*>', 'i')); return m ? toI(m[1]) : 0; },
        multBonus(o, i) { const m = tag(o, new RegExp('<mult[-_ ]?level[-_ ]?' + P.names[i] + ':\\s*(.*)\\s*>', 'i')); return m ? toF(m[1]) : P.multBonus; },
        staticPrice(o) { const m = tag(o, /<static[-_ ]?level[-_ ]?price:\s*(.*)\s*>/i); return m ? toI(m[1]) : 0; },
        multPrice(o) { const m = tag(o, /<mult[-_ ]?level[-_ ]?price:\s*(.*)\s*>/i); return m ? toF(m[1]) : P.multPrice; },
        // The cap stops a level up only once it has been read (a new copy reads it).
        levelUp(o) {
            if (!o || !L.canLevel(o)) return;
            if (o.level === o.maxLevel) return;
            o.level = L.level(o) + 1;
            I.refresh(o);
        },
        levelDown(o) {
            if (!o || o.level === 1) return;
            o.level = L.level(o) - 1;
            I.refresh(o);
        },
        upgradePrice(o) { return Math.trunc(o.price * P.priceMod); },
        /** A parameter after one more level. */
        nextParam(o, i, value) { return Math.trunc(value * L.multBonus(o, i)) + L.staticBonus(o, i); }
    };
    window.RRSelcharLevels = L;

    I.makers.name.push((o, name) => (isEquip(o) && L.canLevel(o) && L.level(o) > 0 ? name + format(P.format, L.level(o)) : name));
    I.makers.params.push((o, list) => {
        if (!isEquip(o) || !L.canLevel(o) || L.level(o) <= 1) return list;
        for (let n = 1; n < o.level; n++) for (let i = 0; i < 8; i++) list[i] = L.nextParam(o, i, list[i]);
        return list;
    });
    I.makers.price.push((o, price) => {
        if (!isEquip(o) || !L.canLevel(o) || L.level(o) <= 1) return price;
        for (let n = 1; n < o.level; n++) price = Math.trunc(price * L.multPrice(o)) + L.staticPrice(o);
        return price;
    });
    // A new copy is level 1 and reads its cap; its name is remade after the other add-ons have set it up.
    const _setupEquipInstance = I.setupEquipInstance;
    I.setupEquipInstance = function(obj) {
        obj.level = 1;
        L.maxLevel(obj);
        _setupEquipInstance.call(this, obj);
        if (L.canLevel(obj)) I.refreshAttr(obj, 'name');
    };

    if (!P.scene) return;

    //-------------------------------------------------------------------------
    // Upgrade screen
    //-------------------------------------------------------------------------
    const subclass = (base) => {
        const C = function() { this.initialize(...arguments); };
        C.prototype = Object.create(base.prototype);
        C.prototype.constructor = C;
        return C;
    };
    const fitting = (lines) => Window_Base.prototype.fittingHeight.call(Window_Base.prototype, lines);
    const drawName = (w, item, x, y, enabled, width) => {
        if (w.rrAceDrawItemName) return w.rrAceDrawItemName(item, x, y, enabled, width);
        w.changePaintOpacity(enabled);
        w.drawItemName(item, x, y, width + 24);
        w.changePaintOpacity(true);
    };

    const Window_RREquipUpgradeSelect = subclass(Window_Selectable);
    Object.assign(Window_RREquipUpgradeSelect.prototype, {
        initialize(rect) {
            this._category = 'none';
            this._data = [];
            Window_Selectable.prototype.initialize.call(this, rect);
        },
        setCategory(category) {
            if (this._category === category) return;
            this._category = category;
            this.refresh();
            this.scrollTo(0, 0);
        },
        maxCols() { return 1; },
        maxItems() { return this._data ? this._data.length : 1; },
        item() { return this._data && this.index() >= 0 ? this._data[this.index()] || null : null; },
        isCurrentItemEnabled() { return this.isEnabled(this._data[this.index()]); },
        includes(item) { return I.kindOf(item) !== 'item'; },
        isEnabled(item) {
            return !!item && isEquip(item) && L.canLevel(item) && L.level(item) < L.maxLevel(item) && $gameParty.gold() >= L.upgradePrice(item);
        },
        refresh() {
            this._data = $gameParty.allItems().filter(item => this.includes(item));
            Window_Selectable.prototype.refresh.call(this);
        },
        drawItem(index) {
            const item = this._data[index];
            if (!item) return;
            const rect = this.itemRect(index);
            rect.width -= 4;
            drawName(this, item, rect.x, rect.y, this.isEnabled(item), 320);
        },
        // Activating the list shows the help for the row under the cursor.
        activate() {
            Window_Selectable.prototype.activate.call(this);
            this.callUpdateHelp();
        },
        updateHelp() {
            const help = this._helpWindow, item = this.item();
            help.clear();
            this._statsWindow.refresh();
            if (!item) return help.setText(P.noItemText);
            if (!L.canLevel(item) || L.level(item) === L.maxLevel(item)) help.setText(P.maxText);
            else help.setText(P.priceText + L.upgradePrice(item) + TextManager.currencyUnit);
            this._statsWindow.setDisplayStats(item);
        }
    });

    const Window_RREquipUpgradeCommand = subclass(Window_HorzCommand);
    Object.assign(Window_RREquipUpgradeCommand.prototype, {
        maxCols() { return 2; },
        makeCommandList() {
            this.addCommand(P.upgradeText, 'upgrade');
            this.addCommand(P.cancelText, 'cancel');
        }
    });

    /** Each parameter's name, its value and, for a piece that can go up, its value after the upgrade. */
    const Window_RREquipUpgradeStats = subclass(Window_Base);
    Object.assign(Window_RREquipUpgradeStats.prototype, {
        initialize(rect) {
            Window_Base.prototype.initialize.call(this, rect);
            this.refresh();
        },
        updatePadding() { this.padding = 10; },
        refresh() {
            this.contents.clear();
            const lh = this.lineHeight();
            P.windowParams.forEach((p, i) => {
                this.changeTextColor(ColorManager.systemColor());
                this.drawText(TextManager.param(p), 4, i * lh, 80);
                this.drawText('→', 4 + 112, i * lh, 22, 'center');
            });
        },
        setDisplayStats(item) {
            this.refresh();
            const lh = this.lineHeight(), values = item.params || [];
            P.windowParams.forEach((p, i) => {
                this.resetTextColor();
                this.drawText(values[p], 64, i * lh, 32, 'right');
                if (isEquip(item) && L.canLevel(item) && L.level(item) < L.maxLevel(item)) {
                    const next = L.nextParam(item, p, values[p]);
                    this.changeTextColor(ColorManager.paramchangeTextColor(next - values[p]));
                    this.drawText(next, 144, i * lh, 32, 'right');
                }
            });
        }
    });

    function Scene_RREquipUpgrade() { this.initialize(...arguments); }
    Scene_RREquipUpgrade.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RREquipUpgrade.prototype.constructor = Scene_RREquipUpgrade;
    window.Scene_RREquipUpgrade = Scene_RREquipUpgrade;

    Object.assign(Scene_RREquipUpgrade.prototype, {
        helpWindowRect() { return new Rectangle(0, 0, Graphics.boxWidth, fitting(2)); },
        create() {
            Scene_MenuBase.prototype.create.call(this);
            const gw = Graphics.boxWidth, gh = Graphics.boxHeight;
            this.createHelpWindow();
            const top = this._helpWindow.height, row = fitting(1);
            this._goldWindow = new Window_Gold(new Rectangle(gw - 160, top, 160, row));
            this.addWindow(this._goldWindow);
            const lh = Window_Base.prototype.lineHeight();
            const listY = top + row, listW = Math.floor(gw * 0.6);
            this._statsWindow = new Window_RREquipUpgradeStats(new Rectangle(listW, listY, Math.floor(gw * 0.4), lh * (P.windowParams.length + 1)));
            this.addWindow(this._statsWindow);
            this._itemWindow = new Window_RREquipUpgradeSelect(new Rectangle(0, listY, listW, gh - listY));
            this._itemWindow._statsWindow = this._statsWindow;
            this._itemWindow.setHelpWindow(this._helpWindow);
            this._itemWindow.setHandler('ok', this.onItemOk.bind(this));
            this._itemWindow.setHandler('cancel', this.onItemCancel.bind(this));
            this._itemWindow.setCategory('item');
            this._itemWindow.deactivate();
            this.addWindow(this._itemWindow);
            this._commandWindow = new Window_RREquipUpgradeCommand(new Rectangle(0, top, this._goldWindow.x, row));
            this._commandWindow.setHandler('upgrade', this.commandUpgrade.bind(this));
            this._commandWindow.setHandler('cancel', this.popScene.bind(this));
            this.addWindow(this._commandWindow);
        },
        item() { return this._itemWindow.item(); },
        onItemOk() {
            const item = this.item();
            $gameParty.loseGold(L.upgradePrice(item));
            L.levelUp(item);
            this._goldWindow.refresh();
            this._statsWindow.refresh();
            AudioManager.stopSe();
            AudioManager.playSe({ name: P.se.name, volume: P.se.volume, pitch: P.se.pitch, pan: 0 });
            this._itemWindow.refresh();
            this._itemWindow.activate();
        },
        onItemCancel() {
            this._itemWindow.deselect();
            this._itemWindow.deactivate();
            this._commandWindow.activate();
            this._helpWindow.setText('');
            this._statsWindow.refresh();
        },
        commandUpgrade() {
            this._commandWindow.deactivate();
            this._itemWindow.activate();
            this._itemWindow.select(0);
        }
    });
})();
