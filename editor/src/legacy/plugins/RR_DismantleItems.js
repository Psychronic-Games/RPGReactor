/*:
 * @target MZ
 * @plugindesc Dismantle Items (VX Ace), for imported games
 * @author Mr. Bubble, Roninator2 (quantity add-on); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_DismantleItems.js
 *
 * A shop screen that breaks items down into parts for a fee. Choose
 * Dismantle, a category, then an item with a <dismantle> note:
 *   <dismantle> item: 18 / weapon: 4, 30% / armor: 5 / fee: 100 </dismantle>
 * The right half shows how often it was dismantled, the fee and its parts.
 * Each part comes with its chance; what was received is listed afterwards.
 * With the quantity add-on, a number box beside the item picks how many
 * to dismantle (up to the number held), and a fee the party cannot pay
 * shows "Not Enough Gold".
 *
 * Script calls:
 *   SceneManager.push(Scene_RRDismantleShop)   (call_dismantle_scene)
 *   this.rrRemoveDismantleMask('item', id)
 *   this.rrRemoveAllDismantleMasks()
 *   this.rrDismantleCount('item', id), this.rrAllDismantleCount()
 * The times dismantled and the revealed parts are kept with the save.
 *
 * The confirm box is live from the moment the shop opens, though hidden,
 * until the first item is chosen: up and down move its cursor with a sound,
 * and OK on an item that cannot be dismantled also plays the OK sound. The
 * original did this; it is kept.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commandText
 * @text Dismantle command
 * @default Dismantle
 *
 * @param cancelText
 * @text Cancel command
 * @default Cancel
 *
 * @param categories
 * @desc JSON: which of item, weapon, armor, keyItem the shop lists.
 * @default ["item","weapon","armor"]
 *
 * @param chance
 * @text Default chance %
 * @type number
 * @decimals 1
 * @default 100
 *
 * @param showChance
 * @type boolean
 * @default false
 *
 * @param fee
 * @text Default fee
 * @type number
 * @default 0
 *
 * @param showFee
 * @type boolean
 * @default true
 *
 * @param feeText
 * @default Fee
 *
 * @param showParts
 * @type boolean
 * @default true
 *
 * @param partsText
 * @default Dismantlable Items
 *
 * @param counterText
 * @default Times Dismantled
 *
 * @param resultsText
 * @default Dismantled Items
 *
 * @param useMask
 * @text Hide parts until received
 * @type boolean
 * @default false
 *
 * @param maskIcon
 * @type number
 * @default 0
 *
 * @param maskText
 * @default ?
 *
 * @param maskChance
 * @default ?%
 *
 * @param se
 * @text Dismantle sound
 * @default {"name":"","volume":100,"pitch":100}
 *
 * @param quantity
 * @text Choose how many (add-on)
 * @type boolean
 * @default false
 *
 * @param lowGoldText
 * @default Not Enough Gold
 *
 * @param rgssFontSize
 * @text Game's default font size
 * @desc The size the original's 16 px chance text is measured against.
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_DismantleItems');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; } };
    const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const P = {
        command: params.commandText ?? 'Dismantle',
        cancel: params.cancelText ?? 'Cancel',
        categories: json(params.categories, ['item', 'weapon', 'armor']),
        chance: num(params.chance, 100),
        showChance: String(params.showChance) === 'true',
        fee: num(params.fee, 0),
        showFee: String(params.showFee) !== 'false',
        feeText: params.feeText ?? 'Fee',
        showParts: String(params.showParts) !== 'false',
        partsText: params.partsText ?? 'Dismantlable Items',
        counterText: params.counterText ?? 'Times Dismantled',
        resultsText: params.resultsText ?? 'Dismantled Items',
        useMask: String(params.useMask) === 'true',
        maskIcon: num(params.maskIcon, 0),
        maskText: params.maskText ?? '?',
        maskChance: params.maskChance ?? '?%',
        se: json(params.se, { name: '', volume: 100, pitch: 100 }),
        quantity: String(params.quantity) === 'true',
        lowGold: params.lowGoldText ?? 'Not Enough Gold',
        rgssFontSize: num(params.rgssFontSize, 24) || 24
    };

    const pad = (n, width) => String(n).padStart(width, ' ');
    const kindOf = (obj) => (DataManager.isItem(obj) ? 'item' : DataManager.isWeapon(obj) ? 'weapon' : DataManager.isArmor(obj) ? 'armor' : null);
    const tableOf = (kind) => ({ item: $dataItems, weapon: $dataWeapons, armor: $dataArmors })[kind] || null;

    //-------------------------------------------------------------------------
    // Notes, and the counts and revealed parts kept with the save
    //-------------------------------------------------------------------------
    const cache = new Map();
    /** The parts an item breaks into ({ item, chance }) and its fee. */
    function recipe(obj) {
        if (!obj) return null;
        if (cache.has(obj)) return cache.get(obj);
        const r = { parts: [], fee: P.fee };
        let inside = false, m;
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            if (/<dismantle>/i.test(line)) inside = true;
            else if (/<\/dismantle>/i.test(line)) inside = false;
            else if ((m = /(\w+):\s*(\d+)\s*[,:]?\s*(\d+\.?\d*)?/i.exec(line))) {
                if (!inside) continue;
                const word = m[1].toUpperCase();
                const table = ['I', 'ITEM'].includes(word) ? $dataItems : ['W', 'WEAPON', 'WEP'].includes(word) ? $dataWeapons
                    : ['A', 'ARMOR', 'ARMOUR', 'ARM'].includes(word) ? $dataArmors : null;
                if (table) r.parts.push({ item: table[Number(m[2])] || null, chance: m[3] === undefined ? P.chance : parseFloat(m[3]) });
                else if (word === 'F' || word === 'FEE') r.fee = Number(m[2]);
            }
        }
        cache.set(obj, r);
        return r;
    }
    const isDismantlable = (obj) => !!obj && !!kindOf(obj) && recipe(obj).parts.length > 0;

    const store = () => {
        if (!$gameSystem._rrDismantle) $gameSystem._rrDismantle = { counts: { item: {}, weapon: {}, armor: {} }, shown: { item: {}, weapon: {}, armor: {} } };
        return $gameSystem._rrDismantle;
    };
    const countOf = (obj) => Number(store().counts[kindOf(obj)][obj.id] || 0);
    const addCount = (obj, n) => { store().counts[kindOf(obj)][obj.id] = countOf(obj) + n; };
    /** Whether each part is shown by name (a part is hidden until received when masks are on). */
    const shown = (obj) => {
        const table = store().shown[kindOf(obj)];
        if (!table[obj.id]) table[obj.id] = recipe(obj).parts.map(() => !P.useMask);
        return table[obj.id];
    };
    const reveal = (obj, flag = true) => { if (isDismantlable(obj)) shown(obj).fill(flag); };

    //-------------------------------------------------------------------------
    // VX Ace drawing (RR_AceCompat's, as the game's own scripts changed it, when present)
    //-------------------------------------------------------------------------
    const W = Window_Base.prototype;
    const ace = {
        itemName(w, item, x, y, enabled = true, width = 172) {
            if (w.rrAceDrawItemName) return w.rrAceDrawItemName(item, x, y, enabled, width);
            if (!item) return;
            w.changePaintOpacity(enabled);
            w.drawIcon(item.iconIndex, x, y);
            w.resetTextColor();
            w.drawText(item.name, x + 24, y, width);
            w.changePaintOpacity(true);
        },
        // The item lists' count, as the game's scripts draw it there (Window_ItemList's, which ports replace).
        itemNumber(w, rect, item) {
            if (w.rrAceDrawItemNumber) return w.rrAceDrawItemNumber(rect, item);
            if (!w.needsNumber) w.needsNumber = () => true;
            Window_ItemList.prototype.drawItemNumber.call(w, item, rect.x, rect.y, rect.width);
        },
        currency(w, value, unit, x, y, width) {
            if (w.rrAceDrawCurrencyValue) return w.rrAceDrawCurrencyValue(value, unit, x, y, width);
            const cx = w.textWidth(unit);
            w.resetTextColor();
            w.drawText(value, x, y, width - cx - 2, 'right');
            w.changeTextColor(ColorManager.systemColor());
            w.drawText(unit, x, y, width, 'right');
        },
        fitting(lines) { return W.fittingHeight.call(W, lines); },
        // Font sizes of RGSS are cell heights: 16 against the game's default size.
        fontSize(size) { return Math.round($gameSystem.mainFontSize() * size / P.rgssFontSize * 10) / 10; }
    };
    const subclass = (base) => {
        const C = function() { this.initialize(...arguments); };
        C.prototype = Object.create(base.prototype);
        C.prototype.constructor = C;
        // Windows open and close by 48 a frame; OK and cancel act on the press only.
        C.prototype.updateOpen = function() {
            if (!this._opening) return;
            this.openness += 48;
            if (this.isOpen()) this._opening = false;
        };
        C.prototype.updateClose = function() {
            if (!this._closing) return;
            this.openness -= 48;
            if (this.isClosed()) this._closing = false;
        };
        C.prototype.isOkTriggered = function() { return Input.isTriggered('ok'); };
        C.prototype.isCancelTriggered = function() { return Input.isTriggered('cancel'); };
        return C;
    };
    // A list row spans the whole contents, as VX Ace's did; activating a list updates its help.
    const aceList = (C) => {
        C.prototype.colSpacing = function() { return 0; };
        C.prototype.activate = function() {
            Window_Selectable.prototype.activate.call(this);
            this.callUpdateHelp();
        };
    };

    //-------------------------------------------------------------------------
    // Windows
    //-------------------------------------------------------------------------
    const Window_RRDismantleGold = subclass(Window_Gold);
    Window_RRDismantleGold.prototype.refresh = function() {
        this.contents.clear();
        ace.currency(this, this.value(), this.currencyUnit(), 4, 0, this.innerWidth - 8);
    };

    const Window_RRDismantleCommand = subclass(Window_HorzCommand);
    Window_RRDismantleCommand.prototype.maxCols = function() { return 2; };
    Window_RRDismantleCommand.prototype.makeCommandList = function() {
        this.addCommand(P.command, 'dismantle');
        this.addCommand(P.cancel, 'cancel');
    };

    const Window_RRDismantleCategory = subclass(Window_HorzCommand);
    Object.assign(Window_RRDismantleCategory.prototype, {
        maxCols() { return Math.max(1, P.categories.length); },
        makeCommandList() {
            if (P.categories.includes('item')) this.addCommand(TextManager.item, 'item');
            if (P.categories.includes('weapon')) this.addCommand(TextManager.weapon, 'weapon');
            if (P.categories.includes('armor')) this.addCommand(TextManager.armor, 'armor');
            if (P.categories.includes('keyItem')) this.addCommand(TextManager.keyItem, 'keyItem');
        },
        update() {
            Window_HorzCommand.prototype.update.call(this);
            if (this._itemWindow) this._itemWindow.setCategory(this.currentSymbol());
        },
        setItemWindow(w) { this._itemWindow = w; this.update(); }
    });

    const Window_RRDismantleList = subclass(Window_Selectable);
    aceList(Window_RRDismantleList);
    Object.assign(Window_RRDismantleList.prototype, {
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
        maxItems() { return this._data.length; },
        item() { return this.index() >= 0 ? this._data[this.index()] || null : null; },
        includes(item) {
            if (!item || !isDismantlable(item)) return false;
            switch (this._category) {
                case 'item': return DataManager.isItem(item) && item.itypeId !== 2;
                case 'weapon': return DataManager.isWeapon(item);
                case 'armor': return DataManager.isArmor(item);
                case 'keyItem': return DataManager.isItem(item) && item.itypeId === 2;
                default: return false;
            }
        },
        isEnabled(item) { return !!item && $gameParty.gold() >= recipe(item).fee && isDismantlable(item); },
        isCurrentItemEnabled() { return this.isEnabled(this._data[this.index()]); },
        refresh() {
            this._data = $gameParty.allItems().filter(item => this.includes(item));
            Window_Selectable.prototype.refresh.call(this);
        },
        selectLast() {
            const i = this._data.indexOf($gameParty.lastItem());
            this.select(i >= 0 ? i : 0);
        },
        drawItem(index) {
            const item = this._data[index];
            if (!item) return;
            const rect = this.itemRect(index);
            rect.width -= 4;
            const enabled = this.isEnabled(item);
            ace.itemName(this, item, rect.x, rect.y, enabled);
            this.changePaintOpacity(enabled);   // the count keeps the name's fade
            ace.itemNumber(this, rect, item);
            this.changePaintOpacity(true);
        },
        updateHelp() {
            if (this._helpWindow) this._helpWindow.setItem(this.item());
            if (this._statusWindow) this._statusWindow.setItem(this.item());
        }
    });

    /** Times dismantled, the fee and the parts of the item under the cursor. */
    const Window_RRDismantleInfo = subclass(Window_Base);
    Object.assign(Window_RRDismantleInfo.prototype, {
        initialize(rect) {
            Window_Base.prototype.initialize.call(this, rect);
            this._item = null;
            this.refresh();
        },
        setItem(item) { this._item = item; this.refresh(); },
        refresh() {
            this.contents.clear();
            const lh = this.lineHeight(), x = 4, width = this.innerWidth - 8, item = this._item;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(P.counterText, x, 0, width);
            this.resetTextColor();
            this.drawText(item ? countOf(item) : '-', x, 0, width, 'right');
            if (P.showFee) {
                this.changeTextColor(ColorManager.systemColor());
                this.drawText(P.feeText, x, lh, width);
                if (item) ace.currency(this, recipe(item).fee, TextManager.currencyUnit, x, lh, width);
                else { this.resetTextColor(); this.drawText('-', x, lh, width, 'right'); }
            }
            if (!P.showParts) return;
            const y = lh * 3;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(P.partsText, x, y, width);
            if (!item) return;
            const flags = shown(item);
            recipe(item).parts.forEach((part, i) => {
                const py = y + lh * (i + 1);
                if (flags[i]) {
                    ace.itemName(this, part.item, x, py, true, P.showChance ? 172 : this.innerWidth);
                    this.drawChance(part.chance.toFixed(1) + '%', py);
                } else {
                    this.drawIcon(P.maskIcon, x, py);
                    this.resetTextColor();
                    this.drawText(P.maskText, x + 24, py, this.width);
                    this.drawChance(P.maskChance, py);
                }
            });
        },
        drawChance(text, y) {
            if (!P.showChance) return;
            this.contents.fontSize = ace.fontSize(16);
            this.drawText(text, 4, y + 3, this.innerWidth - 8, 'right');
            this.resetFontSettings();
        }
    });

    /** Dismantle / Cancel, centred; handled by the list's OK and cancel. */
    const Window_RRDismantleConfirm = subclass(Window_Command);
    Object.assign(Window_RRDismantleConfirm.prototype, {
        colSpacing() { return 0; },
        itemTextAlign() { return 'left'; },
        makeCommandList() {
            this.addCommand(P.command, 'ok');
            this.addCommand(P.cancel, 'cancel');
        },
        drawItem(index) {
            const rect = this.itemRect(index);
            this.resetTextColor();
            this.changePaintOpacity(this.isCommandEnabled(index));
            this.drawText(this.commandName(index), rect.x + 4, rect.y, rect.width - 8, 'left');
            this.changePaintOpacity(true);
        },
        // Active while hidden: it moves and answers OK and cancel like a shown one, but is never touched.
        isOpenAndActive() { return this.isOpen() && this.active; },
        processTouch() { if (this.visible) Window_Command.prototype.processTouch.call(this); },
        isWheelScrollEnabled() { return this.visible && Window_Command.prototype.isWheelScrollEnabled.call(this); }
    });

    const Window_RRDismantleResultsHeader = subclass(Window_Base);
    Window_RRDismantleResultsHeader.prototype.refresh = function() {
        this.contents.clear();
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(P.resultsText, 4, 0, this.innerWidth - 8, 'center');
    };

    /** What was received, each part once with how many. */
    const Window_RRDismantleResults = subclass(Window_Selectable);
    aceList(Window_RRDismantleResults);
    Object.assign(Window_RRDismantleResults.prototype, {
        initialize(rect) {
            this._gained = [];
            this._data = [];
            Window_Selectable.prototype.initialize.call(this, rect);
        },
        fittingRows() { return Math.min(Math.max(new Set(this._gained).size, 1), 8); },
        setItems(items) { this._gained = items; this.refresh(); },
        clear() { this._gained = []; },
        maxItems() { return this._data.length; },
        item() { return this.index() >= 0 ? this._data[this.index()] || null : null; },
        isCurrentItemEnabled() { return true; },
        refresh() {
            this._data = [...new Set(this._gained)];
            this.createContents();   // the window grows with what was received
            Window_Selectable.prototype.refresh.call(this);
        },
        drawItem(index) {
            const item = this._data[index];
            if (!item) return;
            const rect = this.itemRect(index);
            rect.width -= 4;
            ace.itemName(this, item, rect.x, rect.y, true);
            this.drawText(':' + pad(this._gained.filter(g => g === item).length, 2), rect.x, rect.y, rect.width, 'right');
        },
        updateHelp() { if (this._helpWindow) this._helpWindow.setItem(this.item()); }
    });

    /** How many to dismantle, beside the chosen row (quantity add-on). */
    const Window_RRDismantleNumber = subclass(Window_Selectable);
    Object.assign(Window_RRDismantleNumber.prototype, {
        initialize(rect) {
            Window_Selectable.prototype.initialize.call(this, rect);
            this._max = 1;
            this.number = 1;
        },
        set(max) { this._max = max; this.number = 1; this.refresh(); },
        cursorWidth() { return 3 * 10 + 12; },
        refreshCursor() { this.setCursorRect(0, 0, this.cursorWidth(), this.lineHeight()); },
        refresh() {
            this.contents.clear();
            this.resetTextColor();
            this.drawText(this.number, 0, 0, this.cursorWidth() - 4, 'right');
        },
        update() {
            Window_Selectable.prototype.update.call(this);
            if (!this.active) return;
            const last = this.number;
            if (Input.isRepeated('right')) this.changeNumber(1);
            if (Input.isRepeated('left')) this.changeNumber(-1);
            if (Input.isRepeated('up')) this.changeNumber(10);
            if (Input.isRepeated('down')) this.changeNumber(-10);
            if (this.number !== last) { SoundManager.playCursor(); this.refresh(); }
        },
        changeNumber(amount) { this.number = Math.max(Math.min(this.number + amount, this._max), 1); }
    });

    const Window_RRDismantleLowGold = subclass(Window_Selectable);
    Window_RRDismantleLowGold.prototype.refresh = function() {
        this.contents.clear();
        this.changeTextColor(ColorManager.crisisColor());
        this.drawText(P.lowGold, 4, 0, this.innerWidth - 8, 'center');
    };

    //-------------------------------------------------------------------------
    // The scene
    //-------------------------------------------------------------------------
    function Scene_RRDismantleShop() { this.initialize(...arguments); }
    Scene_RRDismantleShop.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRDismantleShop.prototype.constructor = Scene_RRDismantleShop;
    window.Scene_RRDismantleShop = Scene_RRDismantleShop;

    Scene_RRDismantleShop.prototype.helpWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, ace.fitting(2)); };

    // Windows are added in the original's order: later ones draw on top and take input after earlier ones.
    Scene_RRDismantleShop.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        const gw = Graphics.boxWidth, gh = Graphics.boxHeight, half = Math.floor(gw / 2), quarter = Math.floor(gw / 4);
        const add = (w) => { this.addWindow(w); return w; };
        this.createHelpWindow();
        const top = this._helpWindow.height, row = ace.fitting(1);

        this._goldWindow = add(new Window_RRDismantleGold(new Rectangle(gw - 160, top, 160, row)));

        this._commandWindow = add(new Window_RRDismantleCommand(new Rectangle(0, top, this._goldWindow.x, row)));
        this._commandWindow.setHandler('dismantle', this.commandDismantle.bind(this));
        this._commandWindow.setHandler('cancel', this.popScene.bind(this));

        const bodyY = top + row;
        this._dummyWindow = add(new (subclass(Window_Base))(new Rectangle(0, bodyY, gw, gh - bodyY)));

        this._infoWindow = add(new Window_RRDismantleInfo(new Rectangle(half, bodyY, gw - half, gh - bodyY)));
        this._infoWindow.hide();

        this._categoryWindow = add(new Window_RRDismantleCategory(new Rectangle(0, bodyY, half, row)));
        this._categoryWindow.setHelpWindow(this._helpWindow);
        this._categoryWindow.hide(); this._categoryWindow.deactivate();
        this._categoryWindow.setHandler('ok', this.onCategoryOk.bind(this));
        this._categoryWindow.setHandler('cancel', this.onCategoryCancel.bind(this));

        const listY = bodyY + row;
        this._itemWindow = add(new Window_RRDismantleList(new Rectangle(0, listY, half, gh - listY)));
        this._itemWindow.setHelpWindow(this._helpWindow);
        this._itemWindow._statusWindow = this._infoWindow;
        this._itemWindow.hide();
        this._itemWindow.setHandler('ok', this.onItemOk.bind(this));
        this._itemWindow.setHandler('cancel', this.onItemCancel.bind(this));
        this._categoryWindow.setItemWindow(this._itemWindow);

        this._dummy2Window = add(new (subclass(Window_Base))(new Rectangle(half, bodyY, gw - half, gh - bodyY)));
        this._dummy2Window.hide();

        const confirmH = ace.fitting(2);
        this._confirmWindow = add(new Window_RRDismantleConfirm(new Rectangle(half - 80, Math.floor(gh / 2) - Math.floor(confirmH / 2), 160, confirmH)));
        this._confirmWindow.setHandler('ok', this.onConfirmOk.bind(this));
        this._confirmWindow.setHandler('cancel', this.onConfirmCancel.bind(this));
        this._confirmWindow.hide();

        this._resultsHeaderWindow = add(new Window_RRDismantleResultsHeader(new Rectangle(quarter, bodyY - 24, half, row)));
        this._resultsHeaderWindow.refresh();
        this._resultsHeaderWindow.hide();

        this._resultsWindow = add(new Window_RRDismantleResults(new Rectangle(quarter, this._resultsHeaderWindow.y + row, half, row)));
        this._resultsWindow.setHelpWindow(this._helpWindow);
        this._resultsWindow.hide(); this._resultsWindow.close();
        this._resultsWindow.setHandler('ok', this.onResultsOk.bind(this));
        this._resultsWindow.setHandler('cancel', this.onResultsOk.bind(this));

        if (!P.quantity) return;
        this._numberWindow = add(new Window_RRDismantleNumber(new Rectangle(half, 0, 3 * 10 + 36, 48)));
        this._numberWindow.setHandler('ok', this.onNumberOk.bind(this));
        this._numberWindow.setHandler('cancel', this.onNumberCancel.bind(this));
        this._numberWindow.hide(); this._numberWindow.deactivate();

        this._lowGoldWindow = add(new Window_RRDismantleLowGold(new Rectangle(quarter, bodyY, half, row)));
        this._lowGoldWindow.refresh();
        this._lowGoldWindow.setHandler('ok', this.onLowGoldCancel.bind(this));
        this._lowGoldWindow.setHandler('cancel', this.onLowGoldCancel.bind(this));
        this._lowGoldWindow.hide();
    };

    Scene_RRDismantleShop.prototype.refreshAll = function() {
        this._resultsWindow.refresh();
        this._goldWindow.refresh();
        this._infoWindow.refresh();
        this._resultsHeaderWindow.refresh();
        this._helpWindow.refresh();
        this._itemWindow.refresh();
    };

    Scene_RRDismantleShop.prototype.activateItemWindow = function() {
        this._categoryWindow.show();
        this._itemWindow.show(); this._itemWindow.activate();
        this._itemWindow.selectLast();
        this.refreshAll();
    };

    Scene_RRDismantleShop.prototype.commandDismantle = function() {
        this._dummyWindow.hide();
        this._categoryWindow.show(); this._categoryWindow.activate();
        this._itemWindow.show();
        this._itemWindow.deselect();
        this._dummy2Window.show();
        this.refreshAll();
    };
    Scene_RRDismantleShop.prototype.onCategoryOk = function() {
        this.activateItemWindow();
        this._infoWindow.show();
        this._dummy2Window.hide();
        this._itemWindow.select(0);
    };
    Scene_RRDismantleShop.prototype.onCategoryCancel = function() {
        this._commandWindow.activate();
        this._dummyWindow.show();
        this._categoryWindow.hide();
        this._itemWindow.hide();
        this._dummy2Window.hide();
    };

    Scene_RRDismantleShop.prototype.onItemOk = function() {
        this._item = this._itemWindow.item();
        $gameParty.setLastItem(this._item);
        this._infoWindow.setItem(this._item);
        if (!P.quantity) { this._confirmWindow.show(); this._confirmWindow.activate(); return; }
        this._confirmWindow.deactivate();
        // The box sits on the chosen row, just right of the list.
        const list = this._itemWindow;
        this._numberWindow.y = list.y + (list.index() - list.topRow()) * this._numberWindow.itemHeight();
        this._numberWindow.set($gameParty.numItems(this._item));
        this._numberWindow.show(); this._numberWindow.activate();
        this._numberWindow.select(0);
    };
    Scene_RRDismantleShop.prototype.onItemCancel = function() {
        this._infoWindow.hide();
        this._dummy2Window.show();
        this._itemWindow.deselect();
        this._categoryWindow.activate();
        this._helpWindow.clear();
    };

    Scene_RRDismantleShop.prototype.onNumberOk = function() {
        this._numberWindow.hide(); this._numberWindow.deactivate();
        this._confirmWindow.show(); this._confirmWindow.activate();
    };
    Scene_RRDismantleShop.prototype.onNumberCancel = function() {
        this._numberWindow.hide(); this._numberWindow.deactivate();
        this.onConfirmCancel();
    };
    Scene_RRDismantleShop.prototype.onLowGoldCancel = function() {
        this._lowGoldWindow.hide(); this._lowGoldWindow.deactivate();
        this.onConfirmCancel();
    };

    Scene_RRDismantleShop.prototype.onConfirmOk = function() {
        this._confirmWindow.hide();
        this.processDismantle();
    };
    Scene_RRDismantleShop.prototype.onConfirmCancel = function() {
        this.activateItemWindow();
        this._infoWindow.show();
        this._confirmWindow.hide();
    };

    Scene_RRDismantleShop.prototype.processDismantle = function() {
        const item = this._item;
        if (!item) return;
        const n = P.quantity ? this._numberWindow.number : 1, fee = recipe(item).fee;
        if (P.quantity && $gameParty.gold() < n * fee) {
            SoundManager.playBuzzer();
            this._lowGoldWindow.show(); this._lowGoldWindow.activate();
            return;
        }
        $gameParty.setLastItem(item);
        addCount(item, n);
        $gameParty.loseItem(item, n);
        $gameParty.loseGold(n * fee);
        const gained = this.rollParts(item, n);
        for (const part of gained) $gameParty.gainItem(part, 1);
        this._resultsWindow.setItems(gained);
        this._resultsWindow.height = ace.fitting(this._resultsWindow.fittingRows());
        this._resultsHeaderWindow.show();
        this._resultsWindow.open();
        this._resultsWindow.show(); this._resultsWindow.activate(); this._resultsWindow.select(0);
        if (P.se && P.se.name) AudioManager.playSe({ name: String(P.se.name), volume: Number(P.se.volume), pitch: Number(P.se.pitch), pan: 0 });
        this.refreshAll();
    };
    /** Each part, for each item dismantled, comes with its chance; a part received is revealed. */
    Scene_RRDismantleShop.prototype.rollParts = function(item, n) {
        const gained = [], flags = shown(item);
        for (let k = 0; k < n; k++) {
            recipe(item).parts.forEach((part, i) => {
                if (Math.random() < part.chance * 0.01) {
                    gained.push(part.item);
                    flags[i] = true;
                }
            });
        }
        return gained.filter(Boolean);
    };

    Scene_RRDismantleShop.prototype.onResultsOk = function() {
        this._resultsHeaderWindow.hide();
        this._resultsWindow.close();
        this._resultsWindow.clear();
        this._resultsWindow.hide();
        this.activateItemWindow();
    };

    //-------------------------------------------------------------------------
    // Script calls
    //-------------------------------------------------------------------------
    Game_Interpreter.prototype.rrCallDismantle = function() { SceneManager.push(Scene_RRDismantleShop); };
    Game_Interpreter.prototype.rrRemoveDismantleMask = function(kind, id) {
        const table = tableOf(String(kind));
        if (table && table[id]) reveal(table[id]);
    };
    Game_Interpreter.prototype.rrRemoveAllDismantleMasks = function() {
        for (const table of [$dataItems, $dataArmors, $dataWeapons]) for (const obj of table) if (obj) reveal(obj);
    };
    Game_Interpreter.prototype.rrDismantleCount = function(kind, id) {
        const table = tableOf(String(kind));
        return table && table[id] ? countOf(table[id]) : null;
    };
    Game_Interpreter.prototype.rrAllDismantleCount = function() {
        let total = 0;
        for (const table of [$dataItems, $dataArmors, $dataWeapons]) for (const obj of table) if (obj) total += countOf(obj);
        return total;
    };

    // For the tests and other ports.
    Scene_RRDismantleShop.recipe = recipe;
})();
