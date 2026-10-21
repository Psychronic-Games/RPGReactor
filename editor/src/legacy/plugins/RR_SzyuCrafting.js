/*:
 * @target MZ
 * @plugindesc Crafting System by Szyu (VX Ace), for imported games
 * @author Szyu; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_SzyuCrafting.js
 *
 * Craft items, weapons and armors from the recipes in the recipe books the
 * party carries. The screen lists the recipes by category, with what each
 * needs on the right (what the party has over what it needs, red when short;
 * Shift and Ctrl show ten and a hundred times as much). Right shows a
 * recipe's stats or effects, Left its components again. Crafting takes the
 * components and plays the category's sound; with Shift held it crafts up
 * to ten.
 *
 * Notes:
 *   <ingredients> … </ingredients>  one per line: "i: 3x 5" (3 of item 5),
 *                                   "w: 2x 7", "a: 1x 2", "c: 50" (gold)
 *   <recipe book>                   an item that holds recipes
 *   <category: n>                   the book's category
 *   <recipes> … </recipes>          "i: 5", "w: 7", "a: 2 - 20"
 *
 * Script calls: $dataItems[book].rrAddRecipe("i: 127 - 131") and
 * rrRemoveRecipe(…) change a book's recipes (kept in the save);
 * DataManager.rrLoadCraftingNotetags() reads every book's recipes from its
 * note again, which drops the ones added since (as the game's events do).
 * SceneManager.push(Scene_RRSzyuCrafting) opens the screen with every book,
 * SceneManager.prepareNextScene(n) only category n's.
 * The menu's Crafting command is there while switch 7 is on.
 * A recipe book cannot be used from the item screen in this game (its books
 * are "never" usable), so the book's own recipe list there is left out.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param ingredientsTerm
 * @text Components word
 * @default Ingredients
 *
 * @param categories
 * @text List categories
 * @desc JSON: [[text, symbol], …] of the category bar.
 * @default [["","item"],["","weapon"],["","armor"]]
 *
 * @param soundsByCategory
 * @text Sounds by book category
 * @desc JSON: SE names.
 * @default []
 *
 * @param soundsByType
 * @text Sounds by kind
 * @desc JSON: SE names for items, weapons, armors.
 * @default ["Equip3","Sword2","Equip1"]
 *
 * @param menuCommand
 * @text Menu command
 * @default Crafting
 *
 * @param menuSwitch
 * @text Menu command switch
 * @type switch
 * @default 0
 *
 * @param inMenu
 * @text In the menu
 * @type boolean
 * @default true
 *
 * @param status
 * @text Status words
 * @desc JSON: { empty, hp_recover, mp_recover, tp_recover, tp_gain, applies, removes }.
 * @default {}
 *
 * @param detailsHint
 * @text Details hint
 * @default
 *
 * @param troopColumns
 * @text Troop class table
 * @desc JSON: troop item id → [class id, …] (the game's Troop table).
 * @default {}
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_SzyuCrafting');
    const json = (s, d) => { try { return s ? JSON.parse(s) : d; } catch (_) { return d; } };
    const TERM = String(P.ingredientsTerm || 'Ingredients');
    const CATEGORIES = json(P.categories, [['', 'item'], ['', 'weapon'], ['', 'armor']]);
    const SOUNDS_CAT = json(P.soundsByCategory, []);
    const SOUNDS_TYPE = json(P.soundsByType, ['Equip3', 'Sword2', 'Equip1']);
    const MENU_COMMAND = String(P.menuCommand || 'Crafting');
    const MENU_SWITCH = Number(P.menuSwitch) || 0;
    const IN_MENU = P.inMenu !== 'false';
    const STATUS = Object.assign({ empty: '-', hp_recover: 'HP', mp_recover: 'MP', tp_recover: 'TP', tp_gain: 'TP gain', applies: 'applies', removes: 'removes' }, json(P.status, {}));
    const HINT = String(P.detailsHint || '');
    const TROOPS = json(P.troopColumns, {});
    const key = (t) => (window.RRKeyedText ? RRKeyedText.resolve(t) : t);
    const rgba = (r, g, b, a = 255) => `rgba(${r},${g},${b},${a / 255})`;

    //=========================================================================
    // Notes: ingredients, recipe books and their recipes
    //=========================================================================
    const KIND_ORDER = (item) => (DataManager.isArmor(item) ? 0 : DataManager.isItem(item) ? 1 : 2);   // "RPG::Armor" < "RPG::Item" < "RPG::Weapon"
    const sortRecipes = (list) => list.slice().sort((a, b) => KIND_ORDER(a) - KIND_ORDER(b) || a.id - b.id);
    const table = (kind) => ({ i: $dataItems, w: $dataWeapons, a: $dataArmors }[kind]);
    const range = (text) => {
        const m = /(\w+):\s*(\d+)\s*-?\s*(\d+)?/i.exec(text);
        if (!m) return null;
        const from = Number(m[2]), to = m[3] === undefined ? from : Number(m[3]);
        return { kind: m[1], from, to };
    };
    /** RPG::BaseItem#load_crafting_notetags_sz. */
    const readNotes = (obj) => {
        obj._rrIngredients = [];
        obj._rrRecipeBook = false;
        obj._rrRecipes = [];
        obj._rrCrCategory = -1;
        let ingredients = false, recipes = false;
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            const lower = line.toLowerCase();
            if (/<(?:ingredients?)>/i.test(lower)) ingredients = true;
            else if (/<\/(?:ingredients?)>/i.test(lower)) ingredients = false;
            else if (/<(?:recipes?)>/i.test(lower)) recipes = true;
            else if (/<\/(?:recipes?)>/i.test(lower)) recipes = false;
            else if (/<(?:recipe book)>/i.test(lower)) obj._rrRecipeBook = true;
            else if (/<category:\s*?(\d+)>/i.test(lower)) { if (obj._rrRecipeBook) obj._rrCrCategory = Number(/<category:\s*?(\d+)>/i.exec(lower)[1]); }
            else {
                if (ingredients) {
                    const m = /(\w+):\s*?(\d+)[x]?\s*(\d+)?/i.exec(line);
                    if (m) {
                        if (m[1] === 'c') obj._rrIngredients.push([null, Number(m[2])]);
                        else if (table(m[1])) obj._rrIngredients.push([table(m[1])[Number(m[3])], Number(m[2])]);
                    }
                }
                if (recipes) {
                    const r = range(line);
                    if (r && table(r.kind)) {
                        for (let i = r.from; i <= r.to; i++) obj._rrRecipes.push(table(r.kind)[i]);
                        obj._rrRecipes = sortRecipes(obj._rrRecipes.filter(Boolean));
                    }
                }
            }
        }
    };
    DataManager.rrLoadCraftingNotetags = function() {
        for (const group of [$dataItems, $dataWeapons, $dataArmors]) for (const obj of group || []) if (obj) readNotes(obj);
    };
    const _isDatabaseLoaded = DataManager.isDatabaseLoaded;
    let notesRead = false;
    DataManager.isDatabaseLoaded = function() {
        if (!_isDatabaseLoaded.call(this)) return false;
        if (!notesRead) { notesRead = true; this.rrLoadCraftingNotetags(); }
        return true;
    };
    const ingredients = (item) => (item && item._rrIngredients) || [];
    const isBook = (item) => !!(item && item._rrRecipeBook);
    const recipes = (item) => (item && item._rrRecipes) || [];
    /** Whether the party has every component. */
    const matches = (item) => ingredients(item).every(([obj, n]) => (obj ? $gameParty.numItems(obj) : $gameParty.gold()) >= n);

    const change = (book, text, add) => {
        if (!isBook(book)) return;
        const r = range(text);
        if (!r || !table(r.kind)) return;
        for (let i = r.from; i <= r.to; i++) {
            const obj = table(r.kind)[i];
            const has = book._rrRecipes.includes(obj);
            // The game stops at the first recipe already there (or, removing, already gone).
            if (add ? has : !has) return;
            if (add) book._rrRecipes.push(obj);
            else book._rrRecipes.splice(book._rrRecipes.indexOf(obj), 1);
        }
        book._rrRecipes = sortRecipes(book._rrRecipes);
    };
    window.RRSzyuCrafting = {
        addRecipe: (book, text) => change(book, text, true),
        removeRecipe: (book, text) => change(book, text, false),
        ingredients, recipes, matches, isBook
    };

    // The books' recipes are part of the save.
    const ref = (obj) => [DataManager.isItem(obj) ? 'i' : DataManager.isWeapon(obj) ? 'w' : 'a', obj.id];
    const _makeSaveContents = DataManager.makeSaveContents;
    DataManager.makeSaveContents = function() {
        const contents = _makeSaveContents.call(this);
        const books = {};
        for (const item of $dataItems) if (isBook(item)) books[item.id] = item._rrRecipes.map(ref);
        contents.rrRecipeBooks = books;
        return contents;
    };
    const _extractSaveContents = DataManager.extractSaveContents;
    DataManager.extractSaveContents = function(contents) {
        _extractSaveContents.call(this, contents);
        const books = contents.rrRecipeBooks;
        if (books) for (const [id, list] of Object.entries(books)) if ($dataItems[id]) $dataItems[id]._rrRecipes = list.map(([k, n]) => table(k)[n]).filter(Boolean);
    };

    //=========================================================================
    // Window_RRSzyuCraftingCategory
    //=========================================================================
    class Window_RRSzyuCraftingCategory extends Window_HorzCommand {
        maxCols() { return 4; }
        makeCommandList() {
            const terms = { item: TextManager.item, weapon: TextManager.weapon, armor: TextManager.armor, keyItem: TextManager.keyItem };
            for (const [text, symbol] of CATEGORIES) this.addCommand(text === '' ? terms[symbol] || symbol : text, symbol);
        }
        update() {
            super.update();
            if (this._itemWindow) this._itemWindow.setCategory(this.currentSymbol());
        }
        setItemWindow(w) { this._itemWindow = w; this.update(); }
    }

    //=========================================================================
    // Window_RRSzyuCraftingList: the recipes of the books carried
    //=========================================================================
    const isTroop = (item) => DataManager.isItem(item) && item.itypeId === 2 && item.consumable && item.damage && (item.damage.type === 5 || item.damage.type === 6);
    class Window_RRSzyuCraftingList extends Window_Selectable {
        initialize(rect) {
            this._category = 'none';
            this._data = [];
            this._crCategory = -1;
            super.initialize(rect);
        }
        setCategory(category) {
            if (this._category === category) return;
            this._category = category;
            this.refresh();
            this.scrollTo(0, 0);
        }
        maxCols() { return 1; }
        maxItems() { return this._data ? this._data.length : 1; }
        item() { return this._data && this.index() >= 0 ? this._data[this.index()] : null; }
        isCurrentItemEnabled() { return !!this._data[this.index()] && matches(this._data[this.index()]); }
        includes(item) {
            if (!item) return false;
            switch (this._category) {
                case 'item': return DataManager.isItem(item) && item.itypeId !== 2;
                case 'weapon': return DataManager.isWeapon(item) || DataManager.isArmor(item);
                case 'armor': return DataManager.isItem(item) && item.itypeId === 2 && item.consumable && !isTroop(item);
                case 'troops': return isTroop(item);
                default: return false;
            }
        }
        makeItemList() {
            let books = $gameParty.allItems().filter(isBook);
            if (this._crCategory !== -1) books = books.filter(b => b._rrCrCategory === this._crCategory);
            this._data = [];
            for (const book of books) this._data.push(...recipes(book).filter(r => this.includes(r)));
        }
        selectLast() {
            const i = this._data.indexOf($gameParty.lastItem());
            this.forceSelect(i >= 0 ? i : 0);
        }
        drawItem(index) {
            const item = this._data[index];
            if (!item) return;
            const rect = this.itemRect(index);
            rect.width -= 4;
            this.rrAceDrawItemName(item, rect.x, rect.y, matches(item), this.width - 70);
            this.contents.drawText(':' + String($gameParty.numItems(item)).padStart(2, ' '), rect.x, rect.y, rect.width, this.lineHeight(), 'right');
        }
        updateHelp() {
            this._helpWindow.setItem(this.item());
            if (this._ingredientsWindow) this._ingredientsWindow.setItem(this.item());
        }
        refresh() {
            this.makeItemList();
            super.refresh();
        }
        setIngredientsWindow(w) { this._ingredientsWindow = w; }
        // The list crafts without the decision sound (the crafting's own sound plays).
        processOk() {
            if (this.isCurrentItemEnabled()) {
                this.updateInputData();
                this.deactivate();
                this.callOkHandler();
            } else {
                this.playBuzzerSound();
            }
        }
        processHandling() {
            super.processHandling();
            if (!this.isOpenAndActive()) return;
            if (this.isHandled('left') && Input.isTriggered('left')) this.callHandler('left');
            else if (this.isHandled('right') && Input.isTriggered('right')) this.callHandler('right');
        }
        deselect() {
            super.deselect();
            if (this._ingredientsWindow) this._ingredientsWindow.contents.clear();
        }
    }

    //=========================================================================
    // Window_RRSzyuIngredients: what a recipe needs, or its stats
    //=========================================================================
    class Window_RRSzyuIngredients extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this._multiplier = 1;
            this._item = null;
            this._showType = 0;
        }
        setItem(item) { this._item = item; this.refresh(); }
        setShowType(t) { this._showType = t; this.refresh(); }
        update() {
            super.update();
            const m = Input.isPressed('control') ? 100 : Input.isPressed('shift') ? 10 : 1;
            if (m !== this._multiplier) { this._multiplier = m; this.refresh(); }
        }
        refresh() {
            this.contents.clear();
            if (!this._item) return;
            this.resetFontSettings();
            if (this._showType === 1 && !(DataManager.isItem(this._item) && !isTroop(this._item))) this.drawStats();
            else if (this._showType === 1) this.drawIngredients();
            else this.drawIngredients();
        }
        text(x, y, w, t, align = 'left') { this.contents.drawText(key(String(t)), x, y, w, this.lineHeight(), align); }
        drawIngredients() {
            const lh = this.lineHeight(), cw = this.innerWidth;
            this.changeTextColor(ColorManager.systemColor());
            this.text(0, 0, this.width, `${key(TERM)}(x${this._multiplier})`);
            ingredients(this._item).forEach(([obj, n], k) => {
                const y = lh * (k + 1);
                this.resetTextColor();
                let have;
                if (!obj) {
                    this.drawIcon(141, 0, y);
                    this.text(24, y, this.width, TextManager.currencyUnit);
                    have = $gameParty.gold();
                } else {
                    this.drawIcon(obj.iconIndex, 0, y);
                    this.text(24, y, this.width, obj.name);
                    have = $gameParty.numItems(obj);
                }
                const need = n * this._multiplier;
                if (have < need) this.changeTextColor(ColorManager.crisisColor());
                if (have === 0) this.changeTextColor(ColorManager.hpGaugeColor1());
                if (have >= need) this.changeTextColor(ColorManager.tpGaugeColor2());
                this.text(-24, y, this.width - 4, `${have}/${need}`, 'right');
            });
            this.resetTextColor();
            if (HINT && (!DataManager.isItem(this._item) || isTroop(this._item))) this.text(0, this.contentsHeight() - 24, 160, HINT);
            this.text(cw - 100, this.contentsHeight() - 48, 120, 'Shift = X10');
            this.text(cw - 100, this.contentsHeight() - 24, 120, 'Ctrl = X100');
        }
        box(x, y, w) { this.contents.fillRect(x + 1, y + 1, w - 2, this.lineHeight() - 2, rgba(0, 0, 0, 80)); }
        drawStats() {
            this.drawItemStats();
            this.drawItemEffects();
        }
        troopClass() {
            const row = TROOPS[this._item.id] || (window.RRPinnacleKingdom ? RRPinnacleKingdom.troopData()[this._item.id] : null);
            return row ? $dataClasses[row[0]] : null;
        }
        drawItemStats() {
            const item = this._item, lh = this.lineHeight();
            if (!(DataManager.isWeapon(item) || DataManager.isArmor(item) || isTroop(item))) return;
            const dw = Math.floor(this.innerWidth / 2);
            let dx = 0, dy = 0;
            for (let i = 0; i < 8; i++) {
                this.box(dx, dy, dw);
                this.changeTextColor(ColorManager.systemColor());
                this.text(dx + 4, dy, dw - 8, TextManager.param(i));
                let value;
                if (DataManager.isItem(item)) {
                    const cls = this.troopClass();
                    value = cls ? cls.params[i][1] : 0;
                    this.resetTextColor();
                    this.text(dx + 4, dy, dw - 8, String(value), 'right');
                } else {
                    value = item.params[i];
                    this.changeTextColor(ColorManager.paramchangeTextColor(value));
                    this.changePaintOpacity(value !== 0);
                    this.text(dx + 4, dy, dw - 8, (value > 0 ? '+' : '') + value, 'right');
                    this.changePaintOpacity(true);
                }
                dx = dx >= dw ? 0 : dw;
                if (dx === 0) dy += lh;
            }
            const data = [];
            for (const t of item.traits || []) {
                if (t.code === 22 && t.dataId <= 2) data.push([['[34', '[35', '[36'][t.dataId], Math.trunc(t.value * 100)]);
            }
            let row = 4;
            for (const [label, v] of data) {
                if (v === 0) continue;
                this.box(0, lh * row, this.innerWidth);
                this.changeTextColor(ColorManager.systemColor());
                this.text(4, lh * row, this.innerWidth - 8, label);
                this.changeTextColor(ColorManager.paramchangeTextColor(v));
                this.text(4, lh * row, this.innerWidth - 8, v > 0 ? '+' + v : String(v), 'right');
                row++;
            }
            if (isTroop(item)) {
                const cls = this.troopClass();
                let y = lh * row;
                for (const t of (cls && cls.traits) || []) if (t.code === 43) { this.rrAceDrawItemName($dataSkills[t.dataId], 0, y); y += 24; }
            }
        }
        drawItemEffects() {
            const item = this._item;
            if (!(DataManager.isItem(item) && !isTroop(item))) return;
            const lh = this.lineHeight(), dw = Math.floor(this.innerWidth / 2);
            this.drawRecover(0, 0, dw, 11, STATUS.hp_recover);
            this.drawRecover(0, lh, dw, 12, STATUS.mp_recover);
            this.drawTp(dw, 0, dw, STATUS.tp_recover, item.effects.filter(e => e.code === 13).reduce((s, e) => s + Math.trunc(e.value1), 0));
            this.drawTp(dw, lh, dw, STATUS.tp_gain, item.tpGain);
            this.drawIcons(0, lh * 2, this.innerWidth, STATUS.applies, [21, 31, 32]);
            this.drawIcons(0, lh * 3, this.innerWidth, STATUS.removes, [22, 33, 34]);
        }
        label(dx, dy, dw, text) {
            this.box(dx, dy, dw);
            this.changeTextColor(ColorManager.systemColor());
            this.text(dx + 4, dy, dw - 8, text);
        }
        empty(dx, dy, dw) {
            this.resetTextColor();
            this.changePaintOpacity(false);
            this.text(dx + 4, dy, dw - 8, STATUS.empty, 'right');
            this.changePaintOpacity(true);
        }
        drawRecover(dx, dy, dw, code, name) {
            this.label(dx, dy, dw, name);
            let per = 0, set = 0;
            for (const e of this._item.effects) if (e.code === code) { per += Math.trunc(e.value1 * 100); set += Math.trunc(e.value2); }
            const signed = (v) => (v > 0 ? '+' + v : String(v));
            if (per !== 0 && set !== 0) {
                this.changeTextColor(ColorManager.paramchangeTextColor(set));
                const t1 = signed(set);
                this.text(dx + 4, dy, dw - 8, t1, 'right');
                const w = dw - this.textWidth(t1);
                this.changeTextColor(ColorManager.paramchangeTextColor(per));
                this.text(dx + 4, dy, w - 8, signed(per) + '%', 'right');
            } else if (per !== 0) {
                this.changeTextColor(ColorManager.paramchangeTextColor(per));
                this.text(dx + 4, dy, dw - 8, signed(per) + '%', 'right');
            } else if (set !== 0) {
                this.changeTextColor(ColorManager.paramchangeTextColor(set));
                this.text(dx + 4, dy, dw - 8, signed(set), 'right');
            } else this.empty(dx, dy, dw);
        }
        drawTp(dx, dy, dw, name, set) {
            this.label(dx, dy, dw, name);
            if (set) {
                this.changeTextColor(ColorManager.paramchangeTextColor(set));
                this.text(dx + 4, dy, dw - 8, set > 0 ? '+' + set : String(set), 'right');
            } else this.empty(dx, dy, dw);
        }
        drawIcons(dx, dy, dw, name, codes) {
            this.label(dx, dy, dw, name);
            const icons = [];
            const hero = $gameActors.actor(1);
            for (const e of this._item.effects) {
                if (e.code === codes[0]) {
                    if (!(e.value1 > 0) || !$dataStates[Math.floor(e.value1)]) continue;
                    const s = $dataStates[e.dataId];
                    icons.push(s ? s.iconIndex : 0);
                } else if (e.code === codes[1]) icons.push(hero.buffIconIndex(1, e.dataId));
                else if (e.code === codes[2]) icons.push(hero.buffIconIndex(-1, e.dataId));
                for (let i = icons.indexOf(0); i >= 0; i = icons.indexOf(0)) icons.splice(i, 1);
                if (icons.length >= 10) break;
            }
            let x = dx + dw - 4 - icons.length * 24;
            for (const icon of icons) { this.drawIcon(icon, x, dy); x += 24; }
            if (!icons.length) this.empty(0, dy, this.innerWidth);
        }
    }

    //=========================================================================
    // Scene_RRSzyuCrafting
    //=========================================================================
    class Scene_RRSzyuCrafting extends Scene_ItemBase {
        prepare(category) { this._crCategory = category === undefined || category === null ? -1 : Number(category); }
        create() {
            super.create();
            if (this._crCategory === undefined) this._crCategory = -1;
            this._helpWindow = new Window_Help(new Rectangle(0, 0, Graphics.boxWidth, this.calcWindowHeight(3, false)));
            this.addWindow(this._helpWindow);
            const cy = this._helpWindow.height;
            this._categoryWindow = new Window_RRSzyuCraftingCategory(new Rectangle(0, cy, Graphics.boxWidth, this.calcWindowHeight(1, true)));
            this._categoryWindow.setHelpWindow(this._helpWindow);
            this._categoryWindow.setHandler('ok', this.onCategoryOk.bind(this));
            this._categoryWindow.setHandler('cancel', this.popScene.bind(this));
            this.addWindow(this._categoryWindow);
            const wy = this._categoryWindow.y + this._categoryWindow.height;
            this._ingredientsWindow = new Window_RRSzyuIngredients(new Rectangle(240, wy, Graphics.boxWidth - 240, Graphics.boxHeight - wy));
            this.addWindow(this._ingredientsWindow);
            this._itemWindow = new Window_RRSzyuCraftingList(new Rectangle(0, wy, 240, Graphics.boxHeight - wy));
            this._itemWindow._crCategory = this._crCategory;
            this._itemWindow.setHelpWindow(this._helpWindow);
            this._itemWindow.setHandler('ok', this.onItemOk.bind(this));
            this._itemWindow.setHandler('cancel', this.onItemCancel.bind(this));
            this._itemWindow.setHandler('right', () => this._ingredientsWindow.setShowType(1));
            this._itemWindow.setHandler('left', () => this._ingredientsWindow.setShowType(0));
            this._itemWindow.setIngredientsWindow(this._ingredientsWindow);
            this.addWindow(this._itemWindow);
            this._categoryWindow.setItemWindow(this._itemWindow);
            this._categoryWindow.activate();
        }
        helpAreaHeight() { return 0; }
        needsCancelButton() { return false; }
        onCategoryOk() {
            this._itemWindow.activate();
            this._itemWindow.selectLast();
        }
        onItemCancel() {
            this._itemWindow.deselect();
            this._categoryWindow.activate();
        }
        onItemOk() {
            const item = this._itemWindow.item();
            if (matches(item)) this.craft(item);
            if (Input.isPressed('shift')) for (let i = 0; i < 9; i++) if (matches(item)) this.craft(item);
            this._itemWindow.refresh();
            this._itemWindow.activate();
        }
        craft(item) {
            for (const [obj, n] of ingredients(item)) {
                if (obj) $gameParty.loseItem(obj, n);
                else $gameParty.loseGold(n);
            }
            $gameParty.gainItem(item, 1);
            const name = this._crCategory !== -1 ? SOUNDS_CAT[this._crCategory]
                : DataManager.isItem(item) ? SOUNDS_TYPE[0] : DataManager.isWeapon(item) ? SOUNDS_TYPE[1] : SOUNDS_TYPE[2];
            if (name) AudioManager.playSe({ name, volume: 100, pitch: 50, pan: 0 });
            this._itemWindow.refresh();
            this._ingredientsWindow.refresh();
        }
    }
    window.Scene_RRSzyuCrafting = Scene_RRSzyuCrafting;
    window.Window_RRSzyuCraftingList = Window_RRSzyuCraftingList;
    window.Window_RRSzyuIngredients = Window_RRSzyuIngredients;

    //-------------------------------------------------------------------------
    // The menu's Crafting command, after the main ones
    //-------------------------------------------------------------------------
    if (IN_MENU) {
        const _addMainCommands = Window_MenuCommand.prototype.addMainCommands;
        Window_MenuCommand.prototype.addMainCommands = function() {
            _addMainCommands.call(this);
            this.addCommand(MENU_COMMAND, 'crafting', MENU_SWITCH ? $gameSwitches.value(MENU_SWITCH) : true);
        };
        const _createCommandWindow = Scene_Menu.prototype.createCommandWindow;
        Scene_Menu.prototype.createCommandWindow = function() {
            _createCommandWindow.call(this);
            this._commandWindow.setHandler('crafting', () => SceneManager.push(Scene_RRSzyuCrafting));
        };
    }
})();
