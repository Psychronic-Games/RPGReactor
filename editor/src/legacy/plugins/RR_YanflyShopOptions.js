/*:
 * @target MZ
 * @plugindesc Ace Shop Options (VX Ace), for imported games
 * @author Yanfly; MUR (item features add-on), Shiggy (actor icons); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyShopOptions.js
 *
 * The shop screen of Yanfly's Ace Shop Options and the add-ons the game
 * carried with it:
 *   - the commands in a list on the left (Buy, Sell and the game's own, each
 *     shown and enabled by a switch), the gold under them;
 *   - a data window beside them: the item's picture (<image: name> in the
 *     note) or its icon enlarged, a weapon's or armour's eight stats, an
 *     item's HP, MP and TP recovery and the states it adds and removes;
 *   - the list and the party's equip comparison under the help;
 *   - Buy and Sell each choose a category first, in a list where the
 *     commands were (the buy categories are an add-on);
 *   - MUR's add-on writes the first six features of the item under its stats
 *     (element rates, extra parameters, skills …), and draws every item name
 *     two pixels further right, in its rarity colour when the game had Hime's
 *     Item Rarity;
 *   - Shiggy's add-on puts an icon before each actor in the comparison.
 * Q and W add or take away the most in the number window; Shift turns the
 * comparison page when the party is too large for it.
 *
 * A command that opens a screen this project does not have (another port
 * not installed) is shown disabled.
 *
 * The screen VX Ace itself laid out (help, command row, 304-wide list) is
 * here too, under the options, as the scripts rewrote it.
 *
 * After buying, the cursor goes back to the top of the list; the buy
 * categories add-on did this, and it is kept.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param commands
 * @type multiline_string
 * @desc JSON: the shop commands in order; "buy", "sell", "cancel" or
 * { symbol, text, enable, show, action: "equip"|"scene", scene, unequip }.
 * @default ["buy","sell","equip"]
 *
 * @param vocab
 * @type multiline_string
 * @desc JSON: data window words (empty, hp_recover, mp_recover, tp_recover, tp_gain, applies, removes).
 * @default {"empty":"-","hp_recover":"HP Heal","mp_recover":"MP Heal","tp_recover":"TP Heal","tp_gain":"TP Gain","applies":"Applies","removes":"Removes"}
 *
 * @param statusFontSize
 * @text Data window font size
 * @type number
 * @default 20
 *
 * @param maxIcons
 * @type number
 * @default 10
 *
 * @param shopFontSize
 * @text Price font size
 * @desc Adjust Limits' shop font; 0 keeps the window's.
 * @type number
 * @default 0
 *
 * @param rgssFontSize
 * @text Game's default font size
 * @type number
 * @default 24
 *
 * @param helpLocation
 * @desc top, middle or bottom (Ace Menu Engine's help window place); empty when it was not in the game.
 * @default
 *
 * @param itemFeatures
 * @text MUR's item features add-on
 * @type boolean
 * @default false
 *
 * @param featureText
 * @type multiline_string
 * @desc JSON: MUR's vocabulary (exparam, sparam, spslot, spflag, collapse, party, info) and colours.
 * @default {}
 *
 * @param buyCategories
 * @text Buy categories add-on
 * @type boolean
 * @default false
 *
 * @param actorIcons
 * @type multiline_string
 * @desc JSON { actorId: iconIndex } from the actor icons add-on; empty when it was not in the game.
 * @default
 *
 * @param rarityColours
 * @type multiline_string
 * @desc JSON { rarity: [r,g,b] } from Hime's Item Rarity, which MUR's item names use; empty without it.
 * @default
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyShopOptions');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; } };
    const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const P = {
        commands: json(params.commands, ['buy', 'sell', 'equip']),
        vocab: json(params.vocab, {}),
        statusFontSize: num(params.statusFontSize, 20),
        maxIcons: num(params.maxIcons, 10),
        shopFontSize: num(params.shopFontSize, 0),
        rgssFontSize: num(params.rgssFontSize, 24) || 24,
        helpLocation: String(params.helpLocation || ''),
        mur: String(params.itemFeatures) === 'true',
        murText: json(params.featureText, {}),
        buyCategories: String(params.buyCategories) === 'true',
        actorIcons: params.actorIcons ? json(params.actorIcons, null) : null,
        rarity: params.rarityColours ? json(params.rarityColours, null) : null
    };

    const W = Window_Base.prototype;
    const fit = (lines) => W.fittingHeight.call(W, lines);
    // RGSS font sizes are cell heights, measured against the game's default size.
    const fontSize = (size) => Math.round($gameSystem.mainFontSize() * size / P.rgssFontSize * 10) / 10;
    const group = (w, value) => (w.rrAceGroup ? w.rrAceGroup(value) : String(value));
    const switchOn = (id) => Number(id) <= 0 || $gameSwitches.value(Number(id));
    const isShop = () => !!SceneManager._scene && SceneManager._scene.constructor === Scene_Shop;
    const rgb = (a) => `rgb(${Number(a[0]) || 0},${Number(a[1]) || 0},${Number(a[2]) || 0})`;
    const BOX = 'rgba(0,0,0,' + (80 / 255) + ')';   // translucent_alpha / 2
    const OUTLINE = 'rgba(0,0,0,0.5)';              // Font.default_out_color
    // Ruby's format: %s and %d take the next value, %% is a percent sign.
    const format = (template, ...args) => { let i = 0; return String(template ?? '').replace(/%(?:[-+ 0#]*\d*)([sd%])/g, (m, k) => (k === '%' ? '%' : String(args[i++] ?? ''))); };
    const vocab = (key) => (P.vocab[key] === undefined ? '' : String(P.vocab[key]));

    // The screen a command opened, when this project has it (a port's scene, or MZ's own).
    const sceneFor = (entry) => (entry && entry.scene && typeof window[entry.scene] === 'function' ? window[entry.scene] : null);
    // $game_party.unequip_all: each actor's slots emptied by their equipment type ids as slot numbers.
    const unequipAll = () => {
        for (const actor of $gameParty.members()) {
            for (const etype of actor.equipSlots()) {
                const slot = etype - 1;   // MZ equipment types count from 1
                if (slot >= 0 && slot < actor.equipSlots().length) actor.changeEquip(slot, null);
            }
        }
    };

    //=========================================================================
    // VX Ace's own shop screen (Scene_Shop and its windows as Ace laid them out)
    //=========================================================================
    const S = Scene_Shop.prototype;
    // A shop left for a screen of its own (Equip, a port's scene) is made again on return, with its goods.
    const _prepare = S.prepare;
    S.prepare = function(goods, purchaseOnly) {
        _prepare.call(this, goods, purchaseOnly);
        $gameTemp._rrShopGoods = { goods, purchaseOnly };
    };
    const _create = S.create;
    S.create = function() {
        if (this._goods === undefined && $gameTemp._rrShopGoods) {
            this._goods = $gameTemp._rrShopGoods.goods;
            this._purchaseOnly = $gameTemp._rrShopGoods.purchaseOnly;
        }
        _create.call(this);
    };

    S.helpWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, fit(2)); };
    S.goldWindowRect = function() { return new Rectangle(Graphics.boxWidth - 160, this._helpWindow.height, 160, fit(1)); };
    S.commandWindowRect = function() { return new Rectangle(0, this._helpWindow.height, this._goldWindow.x, fit(1)); };
    S.createCommandWindow = function() {
        this._commandWindow = new Window_ShopCommand(this.commandWindowRect());
        this._commandWindow.setPurchaseOnly(this._purchaseOnly);
        this._commandWindow.setHandler('buy', this.commandBuy.bind(this));
        this._commandWindow.setHandler('sell', this.commandSell.bind(this));
        this._commandWindow.setHandler('cancel', this.popScene.bind(this));
        this.addWindow(this._commandWindow);
    };
    S.dummyWindowRect = function() {
        const wy = this._commandWindow.y + this._commandWindow.height;
        return new Rectangle(0, wy, Graphics.boxWidth, Graphics.boxHeight - wy);
    };
    S.numberWindowRect = function() { return new Rectangle(0, this._dummyWindow.y, 304, this._dummyWindow.height); };
    S.statusWindowRect = function() {
        const wx = this._numberWindow.width;
        return new Rectangle(wx, this._dummyWindow.y, Graphics.boxWidth - wx, this._dummyWindow.height);
    };
    S.buyWindowRect = function() { return new Rectangle(0, this._dummyWindow.y, 304, this._dummyWindow.height); };
    S.categoryWindowRect = function() { return new Rectangle(0, this._dummyWindow.y, Graphics.boxWidth, fit(1)); };
    S.sellWindowRect = function() {
        const wy = this._categoryWindow.y + this._categoryWindow.height;
        return new Rectangle(0, wy, Graphics.boxWidth, Graphics.boxHeight - wy);
    };

    // The price is drawn in the name's fade; the name keeps the game's own drawing.
    Window_ShopBuy.prototype.drawItem = function(index) {
        const item = this.itemAt(index);
        if (!item) return;
        const rect = this.itemRect(index), enabled = !!this.isEnabled(item);
        this.rrAceDrawItemName(item, rect.x, rect.y, enabled);
        rect.width -= 4;
        this.changePaintOpacity(enabled);
        this.drawText(this.price(item), rect.x, rect.y, rect.width, 'right');
        this.changePaintOpacity(true);
    };

    const N = Window_ShopNumber.prototype;
    N.createButtons = function() { this._buttons = []; };
    N.rrFigures = function() { return 2; };
    N.cursorWidth = function() { return this.rrFigures() * 10 + 12; };
    N.cursorX = function() { return this.innerWidth - this.cursorWidth() - 4; };
    N.itemNameY = function() { return Math.floor(this.innerHeight / 2) - Math.floor(this.lineHeight() * 3 / 2); };
    N.totalPriceY = function() { return Math.floor(this.innerHeight / 2) + Math.floor(this.lineHeight() / 2); };
    N.itemRect = function() { return new Rectangle(this.cursorX(), this.itemNameY(), this.cursorWidth(), this.lineHeight()); };
    N.refresh = function() {
        this.contents.clear();
        this.rrAceDrawItemName(this._item, 0, this.itemNameY());
        this.drawNumber();
        this.drawTotalPrice();
    };
    N.drawNumber = function() {
        this.resetTextColor();
        this.drawText('×', this.cursorX() - 28, this.itemNameY(), 22);
        this.drawText(this._number, this.cursorX(), this.itemNameY(), this.cursorWidth() - 4, 'right');
    };
    N.drawTotalPrice = function() {
        this.rrAceDrawCurrencyValue(this._price * this._number, this._currencyUnit, 4, this.totalPriceY(), this.innerWidth - 8);
    };

    const T = Window_ShopStatus.prototype;
    T.refresh = function() {
        this.contents.clear();
        this.drawPossession(4, 0);
        if (this.isEquipItem()) this.drawEquipInfo(4, this.lineHeight() * 2);
    };
    T.drawPossession = function(x, y) {
        const width = this.innerWidth - 4 - x;
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.possession, x, y, width);
        this.resetTextColor();
        this.drawText($gameParty.numItems(this._item), x, y, width, 'right');
    };
    T.drawEquipInfo = function(x, y) {
        this.statusMembers().forEach((actor, i) => this.drawActorEquipInfo(x, y + this.lineHeight() * (i * 2.4), actor));
    };
    T.drawActorEquipInfo = function(x, y, actor) {
        const enabled = actor.canEquip(this._item);
        this.resetTextColor();
        this.changePaintOpacity(enabled);
        this.drawText(actor.name(), x, y, 112);
        this.changePaintOpacity(true);
        const item1 = this.currentEquippedItem(actor, this._item.etypeId);
        if (enabled) this.drawActorParamChange(x, y, actor, item1);
        this.rrAceDrawItemName(item1, x, y + this.lineHeight(), enabled);
    };
    T.drawActorParamChange = function(x, y, actor, item1) {
        const id = this.paramId();
        const change = this._item.params[id] - (item1 ? item1.params[id] : 0);
        this.changeTextColor(ColorManager.paramchangeTextColor(change));
        this.drawText((change >= 0 ? '+' : '') + change, x, y, this.innerWidth - 4 - x, 'right');
        this.resetTextColor();
    };
    // The slot with the lowest value of the stat compared, an empty slot counting 0 (the first such, as min_by).
    T.currentEquippedItem = function(actor, etypeId) {
        const id = this.paramId(), slots = actor.equipSlots(), equips = actor.equips();
        let best, bestValue = Infinity;
        slots.forEach((etype, i) => {
            if (etype !== etypeId) return;
            const item = equips[i] || null, value = item ? item.params[id] : 0;
            if (value < bestValue) { best = item; bestValue = value; }
        });
        return best || null;
    };

    //=========================================================================
    // Yanfly's Ace Shop Options
    //=========================================================================
    const LIST_WIDTH = () => Graphics.boxWidth - Math.floor(Graphics.boxWidth * 2 / 5);
    const COMMAND_ROWS = P.mur ? 5 : 4;
    const customCommands = () => P.commands.filter(c => c && typeof c === 'object');

    //--- The command list: the game's commands, one under another ---
    const C = Window_ShopCommand.prototype;
    const _makeCommandList = C.makeCommandList;
    C.makeCommandList = function() {
        if (!isShop()) return _makeCommandList.call(this);
        for (const c of P.commands) {
            if (c === 'buy') this.addCommand(TextManager.buy, 'buy');
            else if (c === 'sell') this.addCommand(TextManager.sell, 'sell', !this._purchaseOnly);
            else if (c === 'cancel') this.addCommand(TextManager.cancel, 'cancel');
            else if (c && typeof c === 'object') {
                if (!switchOn(c.show)) continue;
                const reachable = c.action === 'equip' || !!sceneFor(c);
                this.addCommand(String(c.text), c.symbol, switchOn(c.enable) && reachable, c);
            }
        }
    };
    C.maxCols = function() { return 1; };
    // The list remembers its place when a command opens another screen.
    C.processOk = function() {
        $gameTemp._rrShopIndex = this.index();
        $gameTemp._rrShopOy = this.scrollY();
        Window_HorzCommand.prototype.processOk.call(this);
    };

    //--- The category list (Items, Weapons, Armour, Key Items), where the commands were ---
    function Window_RRShopCategory() { this.initialize(...arguments); }
    Window_RRShopCategory.prototype = Object.create(Window_Command.prototype);
    Window_RRShopCategory.prototype.constructor = Window_RRShopCategory;
    Object.assign(Window_RRShopCategory.prototype, {
        makeCommandList() {
            this.addCommand(TextManager.item, 'item');
            this.addCommand(TextManager.weapon, 'weapon');
            this.addCommand(TextManager.armor, 'armor');
            this.addCommand(TextManager.keyItem, 'keyItem');
        },
        update() {
            Window_Command.prototype.update.call(this);
            if (this._itemWindow) this._itemWindow.setCategory(this.currentSymbol());
        },
        setItemWindow(w) { this._itemWindow = w; this.update(); },
        needsSelection() { return true; }
    });
    window.Window_RRShopCategory = Window_RRShopCategory;

    //--- The buy and sell lists: 3/5 of the screen, one column ---
    Window_ShopBuy.prototype.drawItem = function(index) {
        const item = this.itemAt(index);
        if (!item) return;
        const rect = this.itemRect(index), enabled = !!this.isEnabled(item);
        this.rrAceDrawItemName(item, rect.x, rect.y, enabled, rect.width - 24);
        rect.width -= 4;
        if (P.shopFontSize > 0) this.contents.fontSize = fontSize(P.shopFontSize);
        this.changePaintOpacity(enabled);
        this.drawText(group(this, this.price(item)), rect.x, rect.y, rect.width, 'right');
        this.changePaintOpacity(true);
        this.resetFontSettings();
    };
    Window_ShopSell.prototype.maxCols = function() { return 1; };
    Window_ShopSell.prototype.setStatusWindow = function(w) { this._statusWindow = w; this.callUpdateHelp(); };
    Window_ShopSell.prototype.updateHelp = function() {
        Window_ItemList.prototype.updateHelp.call(this);
        if (this._statusWindow) this._statusWindow.setItem(this.item());
    };

    //--- The comparison: the party one to a line under "Possession" ---
    T.pageSize = function() { return Math.floor((this.innerHeight - this.lineHeight()) / this.lineHeight()); };
    T.updatePage = function() {
        if (!this.visible || !this._item || DataManager.isItem(this._item)) return;
        if (!Input.isTriggered('shift') || this.maxPages() <= 1) return;
        SoundManager.playCursor();
        this._pageIndex = (this._pageIndex + 1) % this.maxPages();
        this.refresh();
    };
    T.drawEquipInfo = function(x, y) {
        y -= this.lineHeight();
        this.statusMembers().forEach((actor, i) => this.drawActorEquipInfo(x, y + this.lineHeight() * i, actor));
    };
    T.drawActorEquipInfo = function(x, y, actor) {
        const enabled = actor.canEquip(this._item);
        this.resetTextColor();
        this.changePaintOpacity(enabled);
        this.drawText(actor.name(), x, y, this.innerWidth);
        this.changePaintOpacity(true);
        if (enabled) this.drawActorParamChange(x, y, actor, this.currentEquippedItem(actor, this._item.etypeId));
    };

    //--- The number window: the item, how many, and gold before and after ---
    N.rrFigures = function() { return this._max === undefined || this._max === null ? 2 : group(this, this._max).length; };
    N.itemNameY = function() { return Math.floor(this.innerHeight / 2) - Math.floor(this.lineHeight() * 5 / 2); };
    N.totalPriceY = function() { return this.itemNameY() + this.lineHeight() * 2; };
    N.refresh = function() {
        this.contents.clear();
        this.resetFontSettings();
        this.rrAceDrawItemName(this._item, 0, this.itemNameY(), true, this.innerWidth - 24);
        this.drawNumber();
        this.drawTotalPrice();
    };
    N.rrIsBuy = function() { return !!SceneManager._scene?._commandWindow && SceneManager._scene._commandWindow.currentSymbol() === 'buy'; };
    N.drawTotalPrice = function() {
        const dw = this.innerWidth - 8, unit = this._currencyUnit;
        let dy = this.totalPriceY();
        this.rrAceDrawCurrencyValue($gameParty.gold(), unit, 4, dy, dw);
        dy += this.lineHeight();
        this.rrDrawHorzLine(dy);
        let value = this._price * this._number;
        if (this.rrIsBuy()) value *= -1;
        this.rrAceDrawCurrencyValue(value, unit, 4, dy, dw);
        dy += this.lineHeight();
        this.rrAceDrawCurrencyValue(Math.min(Math.max($gameParty.gold() + value, 0), $gameParty.maxGold()), unit, 4, dy, dw);
    };
    N.rrDrawHorzLine = function(dy) {
        const y = dy + this.lineHeight() - 4;
        this.contents.fillRect(4, y, this.innerWidth - 8, 3, OUTLINE);
        this.contents.fillRect(5, y + 1, this.innerWidth - 10, 1, ColorManager.normalColor());
    };
    const _processNumberChange = N.processNumberChange;
    N.processNumberChange = function() {
        _processNumberChange.call(this);
        if (!this.isOpenAndActive()) return;
        if (Input.isRepeated('pageup')) this.changeNumber(-this._max);
        if (Input.isRepeated('pagedown')) this.changeNumber(this._max);
    };

    //--- The data window: picture, stats or effects of the item under the cursor ---
    function Window_RRShopData() { this.initialize(...arguments); }
    Window_RRShopData.prototype = Object.create(Window_Base.prototype);
    Window_RRShopData.prototype.constructor = Window_RRShopData;
    window.Window_RRShopData = Window_RRShopData;
    const D = Window_RRShopData.prototype;
    D.initialize = function(rect, itemWindow) {
        Window_Base.prototype.initialize.call(this, rect);
        this._itemWindow = itemWindow;
        this._item = null;
        this.refresh();
    };
    D.setItemWindow = function(w) { this._itemWindow = w; this.updateItem(w.item()); };
    D.update = function() {
        Window_Base.prototype.update.call(this);
        if (this._itemWindow) this.updateItem(this._itemWindow.item());
    };
    D.updateItem = function(item) {
        if (this._item === item) return;
        this._item = item;
        this.refresh();
    };
    D.refresh = function() {
        this.contents.clear();
        this.resetFontSettings();
        if (!this._item) return this.drawEmpty();
        this.contents.fontSize = fontSize(P.statusFontSize);
        this.drawItemImage();
        this.drawItemStats();
        this.drawItemEffects();
    };
    D.drawBackgroundBox = function(dx, dy, dw) { this.contents.fillRect(dx + 1, dy + 1, dw - 2, this.lineHeight() - 2, BOX); };
    D.forStatBoxes = function(fn) {
        const dw = Math.floor((this.innerWidth - 96) / 2);
        let dx = 96, dy = 0;
        for (let i = 0; i < 8; i++) {
            fn(i, dx, dy, dw);
            dx = dx >= 96 + dw ? 96 : 96 + dw;
            if (dx === 96) dy += this.lineHeight();
        }
    };
    D.drawEmpty = function() {
        this.contents.fillRect(1, 1, 94, 94, BOX);
        this.forStatBoxes((i, dx, dy, dw) => this.drawBackgroundBox(dx, dy, dw));
    };
    D.imageOf = function(item) {
        if (item._rrShopImage === undefined) {
            item._rrShopImage = null;
            for (const line of String(item.note || '').split(/[\r\n]+/)) {
                const m = /<(?:IMAGE|image):[ ](.*)>/i.exec(line);
                if (m) item._rrShopImage = m[1];
            }
        }
        return item._rrShopImage;
    };
    D.drawItemImage = function() {
        this.contents.fillRect(1, 1, 94, 94, BOX);
        const item = this._item, image = this.imageOf(item);
        const bitmap = image === null ? ImageManager.loadSystem('IconSet') : ImageManager.loadPicture(image);
        if (!bitmap.isReady()) {
            bitmap.addLoadListener(() => { if (this._item === item) this.refresh(); });
            return;
        }
        if (image !== null) return this.contents.blt(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0);
        const pw = ImageManager.iconWidth, ph = ImageManager.iconHeight, n = item.iconIndex;
        this.contents.blt(bitmap, (n % 16) * pw, Math.floor(n / 16) * ph, pw, ph, 0, 0, 96, 96);
    };
    D.drawItemStats = function() {
        if (!DataManager.isWeapon(this._item) && !DataManager.isArmor(this._item)) return;
        this.forStatBoxes((i, dx, dy, dw) => this.drawEquipParam(i, dx, dy, dw));
    };
    D.drawEquipParam = function(id, dx, dy, dw) {
        this.drawBackgroundBox(dx, dy, dw);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.param(id), dx + 4, dy, dw - 8);
        const value = this._item.params[id];
        this.changeTextColor(ColorManager.paramchangeTextColor(value));
        this.changePaintOpacity(value !== 0);
        this.drawText((value > 0 ? '+' : '') + group(this, value), dx + 4, dy, dw - 8, 'right');
        this.changePaintOpacity(true);
    };
    D.drawItemEffects = function() {
        if (!DataManager.isItem(this._item)) return;
        const lh = this.lineHeight(), dw = Math.floor((this.innerWidth - 96) / 2);
        this.drawRecover(11, 'hp_recover', 96, 0, dw);
        this.drawRecover(12, 'mp_recover', 96, lh, dw);
        this.drawTpRecover(96 + dw, 0, dw);
        this.drawTpGain(96 + dw, lh, dw);
        this.drawStateIcons('applies', [21, 31, 32], 96, lh * 2, this.innerWidth - 96);
        this.drawStateIcons('removes', [22, 33, 34], 96, lh * 3, this.innerWidth - 96);
    };
    D.drawLabel = function(key, dx, dy, dw) {
        this.drawBackgroundBox(dx, dy, dw);
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(vocab(key), dx + 4, dy, dw - 8);
    };
    D.drawValue = function(text, colourValue, dx, dy, dw) {
        if (colourValue === null) { this.resetTextColor(); this.changePaintOpacity(false); text = vocab('empty'); }
        else this.changeTextColor(ColorManager.paramchangeTextColor(colourValue));
        this.drawText(text, dx + 4, dy, dw - 8, 'right');
        this.changePaintOpacity(true);
    };
    const signed = (w, v, suffix = '') => (v > 0 ? '+' : '') + group(w, v) + suffix;
    // HP or MP recovery: a rate and an amount; both are drawn when both are set, the rate to the amount's left.
    D.drawRecover = function(code, key, dx, dy, dw) {
        this.drawLabel(key, dx, dy, dw);
        let per = 0, set = 0;
        for (const e of this._item.effects) {
            if (e.code !== code) continue;
            per += Math.trunc(e.value1 * 100);
            set += Math.trunc(e.value2);
        }
        if (per !== 0 && set !== 0) {
            const text = signed(this, set);
            this.drawValue(text, set, dx, dy, dw);
            this.drawValue(signed(this, per, '%'), per, dx, dy, dw - this.textWidth(text));
            return;
        }
        if (per !== 0) return this.drawValue(signed(this, per, '%'), per, dx, dy, dw);
        if (set !== 0) return this.drawValue(signed(this, set), set, dx, dy, dw);
        this.drawValue('', null, dx, dy, dw);
    };
    D.drawTpRecover = function(dx, dy, dw) {
        this.drawLabel('tp_recover', dx, dy, dw);
        const set = this._item.effects.filter(e => e.code === 13).reduce((s, e) => s + Math.trunc(e.value1), 0);
        this.drawValue(signed(this, set), set !== 0 ? set : null, dx, dy, dw);
    };
    D.drawTpGain = function(dx, dy, dw) {
        this.drawLabel('tp_gain', dx, dy, dw);
        const set = this._item.tpGain || 0;
        this.drawValue(signed(this, set), set !== 0 ? set : null, dx, dy, dw);
    };
    // States a state effect names by its chance (value1 as an index) must exist; buffs are actor 1's icons.
    D.drawStateIcons = function(key, [stateCode, buffCode, debuffCode], dx, dy, dw) {
        this.drawLabel(key, dx, dy, dw);
        let icons = [];
        const buffer = $gameActors.actor(1);
        for (const e of this._item.effects) {
            if (e.code === stateCode) {
                if (!(e.value1 > 0) || !$dataStates[Math.floor(e.value1)]) continue;
                icons.push($dataStates[e.dataId] ? $dataStates[e.dataId].iconIndex : 0);
            } else if (e.code === buffCode) icons.push(buffer ? buffer.buffIconIndex(1, e.dataId) : 0);
            else if (e.code === debuffCode) icons.push(buffer ? buffer.buffIconIndex(-1, e.dataId) : 0);
            icons = icons.filter(n => n !== 0);
            if (icons.length >= P.maxIcons) break;
        }
        let x = dx + dw - 4 - icons.length * 24;
        for (const n of icons) { this.drawIcon(n, x, dy); x += 24; }
        if (!icons.length) {
            this.resetTextColor();
            this.changePaintOpacity(false);
            this.drawText(vocab('empty'), 4, dy, this.innerWidth - 8, 'right');
            this.changePaintOpacity(true);
        }
    };

    //--- The scene ---
    S.goldWindowRect = function() {
        const r = new Rectangle(Graphics.boxWidth - 160, this._helpWindow.height, 160, fit(1));
        if (P.mur) { r.width = 160; r.x = 0; } else { r.width = Math.floor(Graphics.boxWidth * 2 / 5); r.x = Graphics.boxWidth - r.width; }
        return r;
    };
    S.commandWindowRect = function() { return new Rectangle(0, this._helpWindow.height, 160, fit(COMMAND_ROWS)); };
    const _createCommandWindow = S.createCommandWindow;
    S.createCommandWindow = function() {
        _createCommandWindow.call(this);
        const w = this._commandWindow;
        if ($gameTemp._rrShopIndex !== undefined && $gameTemp._rrShopIndex !== null) {
            w.select($gameTemp._rrShopIndex);
            w.scrollTo(0, $gameTemp._rrShopOy || 0);
        }
        $gameTemp._rrShopIndex = null;
        $gameTemp._rrShopOy = null;
        for (const c of customCommands()) w.setHandler(c.symbol, (c.action === 'equip' ? this.commandEquip : this.rrCommandCustom).bind(this));
    };
    const _createDummyWindow = S.createDummyWindow;
    S.createDummyWindow = function() {
        _createDummyWindow.call(this);
        if (P.mur) this._dummyWindow.height -= this._goldWindow.height;
        else this._goldWindow.y = this._dummyWindow.y;
        this._dummyWindow.opacity = 0;
    };
    S.numberWindowRect = function() {
        const cmd = this._commandWindow;
        return new Rectangle(0, this._dummyWindow.y, LIST_WIDTH(), Graphics.boxHeight - cmd.y - cmd.height);
    };
    S.statusWindowRect = function() {
        const cmd = this._commandWindow, wx = this._numberWindow.width;
        return new Rectangle(wx, this._dummyWindow.y + fit(1), Graphics.boxWidth - wx, Graphics.boxHeight - cmd.y - (cmd.height + fit(1)));
    };
    S.buyWindowRect = function() { return new Rectangle(0, this._dummyWindow.y, LIST_WIDTH(), this._dummyWindow.height); };
    S.createCategoryWindow = function() {
        this._categoryWindow = new Window_RRShopCategory(new Rectangle(0, 0, 160, fit(COMMAND_ROWS)));
        this._categoryWindow.setHelpWindow(this._helpWindow);
        this._categoryWindow.y = this._commandWindow.y;
        this._categoryWindow.deactivate();
        this._categoryWindow.x = Graphics.boxWidth;
        this._categoryWindow.setHandler('ok', this.onCategoryOk.bind(this));
        this._categoryWindow.setHandler('cancel', this.onCategoryCancel.bind(this));
        this.addWindow(this._categoryWindow);
    };
    S.sellWindowRect = function() {
        const cmd = this._commandWindow, wy = this._categoryWindow.y + this._categoryWindow.height;
        return new Rectangle(0, wy, LIST_WIDTH(), P.mur ? Graphics.boxHeight - cmd.y - (cmd.height + fit(1)) : Graphics.boxHeight - wy);
    };

    const _createAll = S.create;
    S.create = function() {
        _createAll.call(this);
        this.rrCreateActorWindow();
        this.rrCreateDataWindow();
        this.rrCleanUpSettings();
        this.rrRelocateWindows();
    };
    S.rrCreateActorWindow = function() {
        // Above the shop's windows and outside their clip, as a window with no viewport.
        this._actorWindow = new Window_MenuActor(new Rectangle(0, 0, Graphics.boxWidth - 160, Graphics.boxHeight));
        this._actorWindow.setHandler('ok', this.rrOnActorOk.bind(this));
        this._actorWindow.setHandler('cancel', this.rrOnActorCancel.bind(this));
        this.addChild(this._actorWindow);
    };
    S.rrCreateDataWindow = function() {
        const cmd = this._commandWindow;
        this._dataWindow = new Window_RRShopData(new Rectangle(cmd.width, cmd.y, Graphics.boxWidth - cmd.width, fit(P.mur ? 7 : 4)), this._buyWindow);
        this.addWindow(this._dataWindow);
    };
    S.rrCleanUpSettings = function() {
        this._dummyWindow.createContents();
        this._buyWindow.show();
        this._buyWindow.deselect();
        this._buyWindow.setMoney(this.money());
        this._lastBuyIndex = 0;
        this._statusWindow.show();
        this._sellWindow.show();
        this._sellWindow.x = Graphics.boxWidth;
        this._sellWindow.setStatusWindow(this._statusWindow);
    };
    S.rrRelocateWindows = function() {
        const help = this._helpWindow, cmd = this._commandWindow, gold = this._goldWindow;
        if (P.mur) {
            gold.y = cmd.y + cmd.height;
            this._buyWindow.y = gold.y + gold.height;
            this._sellWindow.y = gold.y + gold.height;
            if (!P.helpLocation) return;
            if (P.helpLocation === 'top') {
                cmd.y = help.height; gold.y = cmd.y + cmd.height; this._statusWindow.y = gold.y + gold.height; help.y = 0;
                this._sellWindow.y = gold.y + gold.height;
            } else if (P.helpLocation === 'middle') {
                cmd.y = 0; gold.y = cmd.height; help.y = gold.y + gold.height; this._statusWindow.y = help.y + help.height;
                this._sellWindow.y = this._statusWindow.y;
            } else {
                cmd.y = 0; gold.y = cmd.height; this._statusWindow.y = gold.y + gold.height;
                help.y = this._statusWindow.y + this._statusWindow.height; this._sellWindow.y = gold.y + gold.height;
            }
            this._categoryWindow.y = cmd.y;
            this._dataWindow.y = cmd.y;
            this._buyWindow.y = this._statusWindow.y;
            this._numberWindow.y = this._statusWindow.y;
            return;
        }
        if (!P.helpLocation) return;
        if (P.helpLocation === 'top') { help.y = 0; cmd.y = help.height; this._buyWindow.y = cmd.y + cmd.height; }
        else if (P.helpLocation === 'middle') { cmd.y = 0; help.y = cmd.height; this._buyWindow.y = help.y + help.height; }
        else { cmd.y = 0; this._buyWindow.y = cmd.height; help.y = this._buyWindow.y + this._buyWindow.height; }
        this._categoryWindow.y = cmd.y;
        this._dataWindow.y = cmd.y;
        gold.y = this._buyWindow.y;
        this._sellWindow.y = this._buyWindow.y;
        this._numberWindow.y = this._buyWindow.y;
        this._statusWindow.y = gold.y + gold.height;
    };

    // A sub-window (the party, for Equip) covers the right; the shop's windows show only in the strip left of it.
    S.rrClipWindows = function(width) {
        const layer = this._windowLayer;
        if (width === null) { layer.mask = null; if (this._rrClip) this._rrClip.visible = false; return; }
        if (!this._rrClip) { this._rrClip = new PIXI.Graphics(); this.addChild(this._rrClip); }
        const g = this._rrClip;
        g.clear();
        if (g.rect) g.rect(0, 0, width, Graphics.height).fill(0xffffff);
        else { g.beginFill(0xffffff); g.drawRect(0, 0, width, Graphics.height); g.endFill(); }
        g.visible = true;
        layer.mask = g;
    };
    S.rrShowSubWindow = function(w) {
        w.x = Graphics.boxWidth - w.width;
        this.rrClipWindows(w.x);
        w.show(); w.activate();
    };
    S.rrHideSubWindow = function(w) {
        this.rrClipWindows(null);
        w.hide(); w.deactivate();
        this._commandWindow.activate();
    };
    S.commandEquip = function() {
        this._actorWindow.refresh();   // the faces, loaded since the shop opened
        this.rrShowSubWindow(this._actorWindow);
        if ($gameParty.size() > 0) this._actorWindow.selectLast();
    };
    S.rrOnActorOk = function() {
        if (this._commandWindow.currentSymbol() !== 'equip') return;
        SoundManager.playOk();
        $gameParty.setMenuActor($gameParty.members()[this._actorWindow.index()]);
        SceneManager.push(Scene_Equip);
    };
    S.rrOnActorCancel = function() { this.rrHideSubWindow(this._actorWindow); };
    S.rrCommandCustom = function() {
        const entry = this._commandWindow.currentExt(), scene = sceneFor(entry);
        if (!scene) return this._commandWindow.activate();
        if (entry.unequip) unequipAll();
        SceneManager.push(scene);
    };
    S.popScene = function() {
        $gameTemp._rrShopIndex = null;
        $gameTemp._rrShopOy = null;
        $gameTemp._rrShopGoods = null;
        Scene_MenuBase.prototype.popScene.call(this);
    };

    const _activateSellWindow = S.activateSellWindow;
    S.activateSellWindow = function() {
        _activateSellWindow.call(this);
        this._statusWindow.show();
    };
    const _commandBuy = S.commandBuy;
    S.commandBuy = function() {
        _commandBuy.call(this);
        this._buyWindow.select(this._lastBuyIndex);
        this._dataWindow.setItemWindow(this._buyWindow);
    };
    S.commandSell = function() {
        this._dummyWindow.hide();
        this._categoryWindow.activate();
        this._categoryWindow.x = 0;
        this._commandWindow.x = Graphics.boxWidth;
        this._sellWindow.x = 0;
        this._buyWindow.x = Graphics.boxWidth;
        this._sellWindow.deselect();
        this._sellWindow.refresh();
        this._dataWindow.setItemWindow(this._sellWindow);
    };
    const _onBuyCancel = S.onBuyCancel;
    S.onBuyCancel = function() {
        this._lastBuyIndex = this._buyWindow.index();
        this._buyWindow.deselect();
        _onBuyCancel.call(this);
        this._buyWindow.show();
        this._statusWindow.show();
    };
    const _onSellOk = S.onSellOk;
    S.onSellOk = function() {
        _onSellOk.call(this);
        this._categoryWindow.show();
    };
    S.onCategoryCancel = function() {
        this._commandWindow.activate();
        this._dummyWindow.show();
        this._categoryWindow.x = Graphics.boxWidth;
        this._commandWindow.x = 0;
        this._sellWindow.x = Graphics.boxWidth;
        this._buyWindow.setMoney(this.money());
        this._buyWindow.x = 0;
    };

    //=========================================================================
    // MUR's item features add-on
    //=========================================================================
    if (P.mur) {
        const M = P.murText;
        const table = (key) => M[key] || {};
        const colour = (name) => rgb((M.colours || {})[name] || (name === 'red' ? [245, 32, 32] : [128, 255, 128]));
        const info = (key) => String(table('info')[key] ?? '');
        const pct = (v) => String(Math.trunc(v * 100));
        const name = (list, id) => (list && list[id] !== undefined && list[id] !== null ? String(list[id]) : '');

        /** The text and colour MUR wrote for one feature (trait). */
        const featureText = (t) => {
            const sys = $dataSystem, terms = sys.terms || {};
            let red = t.value < 0, text = '';
            const state = $dataStates[t.dataId];
            switch (t.code) {
                case 11: text = format(info('element_rate'), name(sys.elements, t.dataId), pct(t.value)); break;
                case 12: red = true; text = format(info('debuff_rate'), name(terms.params, t.dataId), pct(t.value)); break;
                case 13: if (state && state.restriction > 1) red = true; text = format(info('state_rate'), state ? state.name : '', pct(t.value)); break;
                case 14: text = format(info('state_resist'), state ? state.name : ''); break;
                case 21: if (t.value < 1) red = true; text = format(info('parameter'), name(terms.params, t.dataId), pct(t.value)); break;
                case 22: text = format(info('ex_parameter'), name(table('exparam'), t.dataId), pct(t.value)); break;
                case 23: text = format(info('sp_parameter'), name(table('sparam'), t.dataId), pct(t.value)); break;
                case 31: text = format(info('atk_element'), name(sys.elements, t.dataId)); break;
                case 32: text = format(info('atk_state'), state ? state.name : '', pct(t.value)); break;
                case 33: text = format(info('atk_speed'), String(Math.trunc(t.value))); break;
                case 34: text = format(info('atk_times'), String(Math.trunc(t.value))); break;
                case 41: text = format(info('add_skill_type'), name(sys.skillTypes, t.dataId)); break;
                case 42: red = true; text = format(info('disable_skill_type'), name(sys.skillTypes, t.dataId)); break;
                case 43: text = format(info('add_skill'), $dataSkills[t.dataId] ? $dataSkills[t.dataId].name : ''); break;
                case 44: red = true; text = format(info('disable_skill'), $dataSkills[t.dataId] ? $dataSkills[t.dataId].name : ''); break;
                case 51: text = format(info('equip_weapon'), name(sys.weaponTypes, t.dataId)); break;
                case 52: text = format(info('equip_armor'), name(sys.armorTypes, t.dataId)); break;
                case 53: red = true; text = format(info('lock_equip'), name(sys.equipTypes, t.dataId)); break;
                case 54: red = true; text = format(info('seal_equip'), name(sys.equipTypes, t.dataId)); break;
                case 55: text = format(info('slot_type'), name(table('spslot'), t.dataId)); break;
                case 61: text = format(info('action_times'), pct(t.value)); break;
                case 62: text = format(info('special_flag'), name(table('spflag'), t.dataId)); break;
                case 63: text = format(info('collapse_effect'), name(table('collapse'), t.dataId)); break;
                case 64: text = format(info('party_ability'), name(table('party'), t.dataId)); break;
            }
            return { text, red };
        };
        D.drawFeatureParam = function(index, dx, dy, dw) {
            this.drawBackgroundBox(dx, dy, dw);
            const t = (this._item.traits || [])[index];
            const f = t ? featureText(t) : { text: '', red: false };
            this.changeTextColor(colour(f.red ? 'red' : 'green'));
            this.drawText(f.text, dx + 4, dy, dw - 8);
        };
        D.drawFeatures = function(boxesOnly) {
            const lh = this.lineHeight(), dw = Math.floor(this.innerWidth / 2);
            for (let i = 0; i < 6; i++) {
                const dx = (i % 2) * dw, dy = 96 + Math.floor(i / 2) * lh;
                if (boxesOnly) this.drawBackgroundBox(dx, dy, dw);
                else this.drawFeatureParam(i, dx, dy, dw);
            }
        };
        const _drawEmpty = D.drawEmpty;
        D.drawEmpty = function() { _drawEmpty.call(this); this.drawFeatures(true); };
        const _drawItemStats = D.drawItemStats;
        D.drawItemStats = function() {
            if (!DataManager.isWeapon(this._item) && !DataManager.isArmor(this._item)) return;
            _drawItemStats.call(this);
            this.drawFeatures(false);
        };
        const _drawItemEffects = D.drawItemEffects;
        D.drawItemEffects = function() {
            if (!DataManager.isItem(this._item)) return;
            _drawItemEffects.call(this);
            this.drawFeatures(false);
        };

        // Every item name, in every window: icon, name two pixels further on, in its rarity colour
        // (Hime's Item Rarity, when the game had it; the colour carries on to what is drawn after).
        const rarityOf = (item) => (typeof window.rrItemRarity === 'function' ? window.rrItemRarity(item) : null);
        W.rrAceDrawItemName = function(item, x, y, enabled = true, width = 202) {
            if (!item) return;
            this.drawIcon(item.iconIndex, x, y, enabled);
            const r = P.rarity ? rarityOf(item) : null;
            if (r !== null) this.changeTextColor(P.rarity[r] ? rgb(P.rarity[r]) : ColorManager.normalColor());
            this.changePaintOpacity(enabled);
            this.drawText(item.name, x + 26, y, width);
            this.resetTextColor();
            this.changePaintOpacity(true);
        };
    }

    //=========================================================================
    // Buy categories add-on: Buy chooses a category first, like Sell
    //=========================================================================
    if (P.buyCategories) {
        const B = Window_ShopBuy.prototype;
        B.setCategory = function(category) {
            if (this._category === category) return;
            this._category = category;
            this.refresh();
            this.scrollTo(0, 0);
        };
        // Key items are the items with the key flag; goods with an unknown category are never listed.
        B.makeItemList = function() {
            this._data = [];
            this._price = [];
            const kinds = { item: 0, weapon: 1, armor: 2, keyItem: 0 };
            for (const goods of this._shopGoods || []) {
                if (goods[0] !== kinds[this._category]) continue;
                const item = this.goodsToItem(goods);
                if (!item) continue;
                const key = DataManager.isItem(item) && item.itypeId === 2;
                if (this._category === 'item' && key) continue;
                if (this._category === 'keyItem' && !key) continue;
                this._data.push(item);
                this._price.push(goods[2] === 0 ? item.price : goods[3]);
            }
        };

        const _createAllWithCategories = S.create;
        S.create = function() {
            _createAllWithCategories.call(this);
            this.rrCreateBuyCategoryWindow();
        };
        S.rrCreateBuyCategoryWindow = function() {
            const w = new Window_RRShopCategory(new Rectangle(0, this._categoryWindow.y, 160, fit(COMMAND_ROWS)));
            w.setHelpWindow(this._helpWindow);
            w.hide(); w.deactivate();
            w.setHandler('ok', this.rrOnBuyCategoryOk.bind(this));
            w.setHandler('cancel', this.rrOnBuyCategoryCancel.bind(this));
            this._buyCategoryWindow = w;
            this.addWindow(w);
        };
        S.commandBuy = function() {
            const cat = this._buyCategoryWindow;
            this._dummyWindow.hide();
            cat.x = 0;
            cat.select(0);
            this._commandWindow.x = Graphics.boxWidth;
            this._buyWindow.x = 0;
            this._sellWindow.x = Graphics.boxWidth;
            this._buyWindow.deselect();
            this._buyWindow.refresh();
            this._dataWindow.setItemWindow(this._buyWindow);
            this._buyWindow.show();
            this._statusWindow.show();
            cat.show(); cat.activate();
            cat.setItemWindow(this._buyWindow);
        };
        S.activateBuyWindow = function() {
            this._buyWindow.show();
            this._buyWindow.select(0);
            this._buyWindow.setMoney(this.money());
            this._buyWindow.show();
            this._buyWindow.activate();
            this._statusWindow.show();
        };
        S.onBuyCancel = function() {
            this._dummyWindow.show();
            this._statusWindow.setItem(null);
            this._buyWindow.deselect();
            this._helpWindow.clear();
            this._buyCategoryWindow.activate();
        };
        S.rrOnBuyCategoryOk = function() {
            this.activateBuyWindow();
            this._buyWindow.select(0);
        };
        S.rrOnBuyCategoryCancel = function() {
            this._dummyWindow.show();
            this._buyCategoryWindow.deselect();
            this._buyCategoryWindow.hide();
            this._buyWindow.deactivate();
            this.onCategoryCancel();
            this._statusWindow.setItem(null);
            this._helpWindow.clear();
        };
    }

    //=========================================================================
    // Actor icons add-on: an icon before each actor in the comparison
    //=========================================================================
    if (P.actorIcons) {
        W.rrDrawActorIcon = function(actor, x, y, enabled = true) {
            const index = P.actorIcons[actor.actorId()];
            // An actor the table leaves out has no icon (the original stopped with an error there).
            if (index !== undefined) this.drawIcon(Number(index), x, y, enabled);
        };
        T.drawActorEquipInfo = function(x, y, actor) {
            const enabled = actor.canEquip(this._item);
            this.resetTextColor();
            this.rrDrawActorIcon(actor, x, y, enabled);
            this.changePaintOpacity(enabled);
            this.drawText(actor.name(), x + 32, y, this.innerWidth);
            this.changePaintOpacity(true);
            if (enabled) this.drawActorParamChange(x, y, actor, this.currentEquippedItem(actor, this._item.etypeId));
        };
    }
})();
