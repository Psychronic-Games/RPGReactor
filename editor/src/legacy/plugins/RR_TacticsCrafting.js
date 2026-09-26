/*:
 * @target MZ
 * @plugindesc Tactics Ogre PSP Crafting System (VX Ace), for imported games
 * @author Mr. Bubble; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_TacticsCrafting.js
 *
 * A crafting screen built from recipe books. The left column lists the
 * recipe books the party holds (their cover picture on the right); choosing
 * one lists what it can make, with the components each needs, the tools and
 * party members it asks for, and the fee, drawn from the item's notes:
 *   <recipebook> item: 1, 2 / weapon: 3 / armor: 4 / category: name
 *                cover: picture </recipebook>
 *   <ingredients> item: 5 x2 / tool: item 6 / actor: 1 / gold: 30
 *                 se: name, volume, pitch </ingredients>
 *   <craft result> amount: 5 / common_event: 3 </craft result>
 * Choose how many to make (right/left by one set, up/down by ten); the
 * components and fee are taken, the result is shown, and a common event in
 * the result tag runs on the map. Right also turns the component list to
 * its next page.
 *
 * Script calls:
 *   this.rrCallTOCrafting('category', ...)    (call_tocrafting_scene)
 *   SceneManager.push(Scene_RRTOCrafting)      (all recipe books)
 *
 * The original's other info pages (Info Pages Window) are not ported: the
 * game binds its next and previous page to one key, so the key turns the
 * page forward and back in the same frame and only plays the page sound
 * twice. That is kept.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param headerText
 * @text Components heading
 * @default Components
 *
 * @param pageSize
 * @text Components per page
 * @type number
 * @default 6
 *
 * @param lackColor
 * @text Missing component colour
 * @type number
 * @default 10
 *
 * @param fadeLacking
 * @text Fade missing counts
 * @type boolean
 * @default true
 *
 * @param moreFooter
 * @text Footer when components run over a page
 * @default More Parts →
 *
 * @param nextPageButton
 * @text Next components page button
 * @default right
 *
 * @param footerText
 * @text Footer
 * @default
 *
 * @param pageButtonIcons
 * @text Page button icons
 * @desc JSON: [previous, next] icon indexes drawn in the bottom corners.
 * @default [0,0]
 *
 * @param pageKeys
 * @text Info page keys
 * @desc JSON: [next, previous] buttons.
 * @default ["shift","shift"]
 *
 * @param pageSe
 * @text Info page sound
 * @default {"name":"Cursor","volume":80,"pitch":100}
 *
 * @param toolTexts
 * @text Tool texts
 * @desc JSON: [available, colour, unavailable, colour].
 * @default ["Available",3,"Unavailable",10]
 *
 * @param actorTexts
 * @text Party member texts
 * @desc JSON: [available, colour, unavailable, colour].
 * @default ["Available",3,"Unavailable",10]
 *
 * @param actorIcons
 * @text Party member icons
 * @desc JSON: actor id → icon index (others 0).
 * @default {}
 *
 * @param feeRate
 * @text Fee, % of price
 * @type number
 * @default 100
 *
 * @param goldWindow
 * @text Fee in its own window
 * @type boolean
 * @default true
 *
 * @param goldIcon
 * @type number
 * @default 0
 *
 * @param goldText
 * @default Gold
 *
 * @param resultHeader
 * @text Result heading
 * @default You Received
 *
 * @param coverFolder
 * @text Cover picture folder
 * @default img/pictures/
 *
 * @param stretchCovers
 * @type boolean
 * @default false
 *
 * @param craftSe
 * @text Crafting sound
 * @default {"name":"","volume":100,"pitch":100}
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_TacticsCrafting');
    const json = (text, fallback) => { try { const v = JSON.parse(text); return v === null || v === undefined ? fallback : v; } catch (_) { return fallback; } };
    const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
    const P = {
        header: params.headerText ?? 'Components',
        pageSize: Math.max(1, num(params.pageSize, 6)),
        lackColor: num(params.lackColor, 10),
        fadeLacking: String(params.fadeLacking) !== 'false',
        moreFooter: params.moreFooter ?? 'More Parts →',
        nextPageButton: params.nextPageButton || 'right',
        footer: params.footerText ?? '',
        buttonIcons: json(params.pageButtonIcons, [0, 0]),
        pageKeys: json(params.pageKeys, ['shift', 'shift']),
        pageSe: json(params.pageSe, { name: 'Cursor', volume: 80, pitch: 100 }),
        tool: json(params.toolTexts, ['Available', 3, 'Unavailable', 10]),
        actor: json(params.actorTexts, ['Available', 3, 'Unavailable', 10]),
        actorIcons: json(params.actorIcons, {}),
        feeRate: num(params.feeRate, 100),
        goldWindow: String(params.goldWindow) !== 'false',
        goldIcon: num(params.goldIcon, 0),
        goldText: params.goldText ?? 'Gold',
        resultHeader: params.resultHeader ?? 'You Received',
        coverFolder: params.coverFolder || 'img/pictures/',
        stretch: String(params.stretchCovers) === 'true',
        craftSe: json(params.craftSe, { name: '', volume: 100, pitch: 100 })
    };

    const playSe = (se) => { if (se && se.name) AudioManager.playSe({ name: String(se.name), volume: Number(se.volume), pitch: Number(se.pitch), pan: 0 }); };
    const rubyMod = (a, b) => ((a % b) + b) % b;
    const pad = (n, width) => String(n).padStart(width, ' ');
    const uniq = (list) => [...new Set(list)];
    const countOf = (list, obj) => list.filter(o => o === obj).length;

    //-------------------------------------------------------------------------
    // Notes, read once per database object as the original read them at load
    //-------------------------------------------------------------------------
    const RE = {
        bookStart: /<(?:RECIPE[_\s]?BOOK|ricetta)>/i, bookEnd: /<\/(?:RECIPE[_\s]?BOOK|ricetta)>/i,
        bookObj: /(\w+):\s*(\d+(?:\s*,\s*\d+)*)/i,
        cover: /(?:PICTURE|PIC|COVER|immagine|IMG):\s*(\w+)/i, category: /category?:\s*(\w+)/i,
        ingStart: /<(?:INGREDIENTS?|ingredienti)>/i, ingEnd: /<\/(?:INGREDIENTS?|ingredienti)>/i,
        ingObj: /(\w+):\s*[×x]?(\d+)\s*[×x]?(\d+)?/i,
        resultStart: /<(?:CRAFT[_\s]RESULT?|risultato)>/i, resultEnd: /<\/(?:CRAFT[_\s]RESULT?|risultato)>/i,
        tool: /(?:TOOLS?|strumento):\s*(\w+)\s*(\d+)/i,
        se: /SE:\s*(\w+)\s*,\s*(\d+)\s*,\s*(\d+)/i
    };
    const tableOf = (word) => {
        switch (String(word).toUpperCase()) {
            case 'I': case 'ITEM': case 'OGGETTO': return $dataItems;
            case 'W': case 'WEAPON': case 'WEP': case 'ARMA': return $dataWeapons;
            case 'A': case 'ARMOR': case 'ARMOUR': case 'ARM': case 'ARMATURA': return $dataArmors;
            default: return null;
        }
    };
    const cache = new Map();
    /** The crafting data of an item, weapon or armor. */
    function craft(obj) {
        if (!obj) return null;
        if (cache.has(obj)) return cache.get(obj);
        const c = { recipes: [], ingredients: [], tools: [], actors: [], fee: Math.trunc((obj.price || 0) * (P.feeRate * 0.01)),
            cover: '', se: null, category: 'none', amount: 1, cev: 0 };
        let book = false, ing = false, result = false, m;
        // Every line is tested against the tags in this order; the first that matches takes the line.
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            if (RE.bookStart.test(line)) book = true;
            else if (RE.bookEnd.test(line)) book = false;
            else if (RE.ingStart.test(line)) ing = true;
            else if (RE.ingEnd.test(line)) ing = false;
            else if (RE.resultStart.test(line)) result = true;
            else if (RE.resultEnd.test(line)) result = false;
            else if ((m = RE.cover.exec(line))) { if (book) c.cover = m[1]; }
            else if ((m = RE.category.exec(line))) { if (book) c.category = m[1]; }
            else if ((m = RE.tool.exec(line))) { if (ing) { const t = tableOf(m[1]); if (t) c.tools.push(t[Number(m[2])]); } }
            else if ((m = RE.se.exec(line))) { if (ing || result) c.se = { name: m[1], volume: Number(m[2]), pitch: Number(m[3]) }; }
            else {
                if (book && (m = RE.bookObj.exec(line))) {
                    const t = tableOf(m[1]);
                    if (t) for (const id of m[2].match(/\d+/g)) c.recipes.push(t[Number(id)]);
                }
                if (ing && (m = RE.ingObj.exec(line))) {
                    const amount = m[3] ? Number(m[3]) : 1, t = tableOf(m[1]), word = m[1].toUpperCase();
                    if (t) for (let i = 0; i < amount; i++) c.ingredients.push(t[Number(m[2])]);
                    else if (['FEE', 'GOLD', 'PREZZO', 'ORO'].includes(word)) c.fee = Number(m[2]);
                    else if (word === 'ACTOR' || word === 'EROE') c.actors.push(Number(m[2]));
                }
                if (result && (m = RE.ingObj.exec(line))) {
                    const word = m[1].toUpperCase();
                    if (['COMMON_EVENT', 'CEV', 'EVENTO_COMUNE', 'EVC'].includes(word)) c.cev = Number(m[2]);
                    else if (['AMOUNT', 'AMT', 'QUANTITÀ'].includes(word)) c.amount = Number(m[2]);
                }
            }
        }
        for (const key of ['recipes', 'ingredients', 'tools']) c[key] = c[key].filter(Boolean);
        cache.set(obj, c);
        return c;
    }
    const isBook = (obj) => !!obj && (DataManager.isItem(obj) || DataManager.isWeapon(obj) || DataManager.isArmor(obj)) && craft(obj).recipes.length > 0;

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
        icon(w, index, x, y, enabled = true) {
            w.changePaintOpacity(enabled);
            w.drawIcon(index, x, y);
            w.changePaintOpacity(true);
        },
        color(w, color, enabled = true) { w.changeTextColor(color); w.changePaintOpacity(enabled); },
        fitting(lines) { return W.fittingHeight.call(W, lines); },
        // Windows open and close by 48 a frame.
        openSpeed(proto, open = 48) {
            proto.updateOpen = function() {
                if (!this._opening) return;
                this.openness += open;
                if (this.isOpen()) this._opening = false;
            };
            proto.updateClose = function() {
                if (!this._closing) return;
                this.openness -= 48;
                if (this.isClosed()) this._closing = false;
            };
        }
    };
    const subclass = (base) => {
        const C = function() { this.initialize(...arguments); };
        C.prototype = Object.create(base.prototype);
        C.prototype.constructor = C;
        ace.openSpeed(C.prototype);
        // OK and cancel act on the press only; holding them does not repeat.
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
    // Recipe books
    //-------------------------------------------------------------------------
    const Window_RRCraftRecipeList = subclass(Window_Selectable);
    aceList(Window_RRCraftRecipeList);
    Object.assign(Window_RRCraftRecipeList.prototype, {
        initialize(rect) {
            this._data = [];
            this._categories = [];
            Window_Selectable.prototype.initialize.call(this, rect);
        },
        setCategories(categories) { this._categories = Array.isArray(categories) ? categories.map(String) : []; },
        includes(obj) { return isBook(obj) && (this._categories.length === 0 || this._categories.includes(craft(obj).category)); },
        maxItems() { return this._data.length; },
        item() { return this.index() >= 0 ? this._data[this.index()] || null : null; },
        isCurrentItemEnabled() { return !!this.item(); },
        refresh() {
            this._data = $gameParty.allItems().filter(obj => this.includes(obj));
            Window_Selectable.prototype.refresh.call(this);
        },
        drawItem(index) {
            const item = this._data[index];
            if (!item) return;
            const rect = this.itemRect(index);
            ace.itemName(this, item, rect.x, rect.y, true, rect.width - 4 - 24);
        },
        updateHelp() {
            const item = this.item();
            if (this._helpWindow) this._helpWindow.setItem(item);
            if (this._infoWindow) this._infoWindow.setItem(item);
            if (this._headerWindow) this._headerWindow.setItem(item);
            if (this._coverWindow) this._coverWindow.setItem(item);
        }
    });

    /** The chosen book's name above the list of what it makes. */
    const Window_RRCraftHeader = subclass(Window_Base);
    Object.assign(Window_RRCraftHeader.prototype, {
        initialize(rect) { Window_Base.prototype.initialize.call(this, rect); this._item = null; },
        setItem(item) { this._item = item; },   // drawn at the next refresh
        refresh() {
            this.contents.clear();
            if (this._item) ace.itemName(this, this._item, 0, 0, true, this.innerWidth - 28);
        }
    });

    /** A book's cover picture, centred (or stretched) in the right half. */
    const Window_RRCraftCover = subclass(Window_Base);
    Object.assign(Window_RRCraftCover.prototype, {
        setItem(item) { this._item = item; this.refresh(); },
        refresh() {
            this.contents.clear();
            const item = this._item;
            if (!item) return;
            const name = craft(item).cover;
            if (!name) return;
            const bitmap = ImageManager.loadBitmap(P.coverFolder, name);
            bitmap.addLoadListener(() => {
                if (this._item !== item || this.contents.width === 0) return;
                this.contents.clear();
                const cw = this.contents.width, ch = this.contents.height;
                if (P.stretch) this.contents.blt(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, cw, ch);
                else {
                    // Only the part that fits the contents from the picture's top left is drawn, where it lands.
                    const x = Math.trunc((cw - bitmap.width) / 2), y = Math.trunc((ch - bitmap.height) / 2);
                    this.contents.blt(bitmap, 0, 0, Math.min(cw, bitmap.width), Math.min(ch, bitmap.height), x, y);
                }
            });
        }
    });

    //-------------------------------------------------------------------------
    // What a book makes
    //-------------------------------------------------------------------------
    const canCraft = (book, item) => {
        if (!item) return false;
        if (!($gameParty.numItems(book) > 0)) return false;
        const c = craft(item);
        if (c.fee > $gameParty.gold()) return false;
        if ($gameParty.numItems(item) >= $gameParty.maxItems(item)) return false;
        if (!c.tools.every(tool => $gameParty.hasItem(tool))) return false;
        if (!c.actors.every(id => $gameParty.members().includes($gameActors.actor(id)))) return false;
        return uniq(c.ingredients).every(ing => $gameParty.numItems(ing) >= countOf(c.ingredients, ing));
    };

    const Window_RRCraftItemList = subclass(Window_Selectable);
    aceList(Window_RRCraftItemList);
    Object.assign(Window_RRCraftItemList.prototype, {
        initialize(rect) {
            this._data = [];
            this._book = null;
            Window_Selectable.prototype.initialize.call(this, rect);
        },
        setBook(book) { this._book = book; this.refresh(); },
        maxItems() { return this._data.length; },
        item() { return this.index() >= 0 ? this._data[this.index()] || null : null; },
        isEnabled(item) { return canCraft(this._book, item); },
        isCurrentItemEnabled() { return this.isEnabled(this._data[this.index()]); },
        refresh() {
            this._data = this._book ? craft(this._book).recipes.slice() : [];
            Window_Selectable.prototype.refresh.call(this);
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
            const item = this.item();
            if (this._helpWindow) this._helpWindow.setItem(item);
            if (this._infoWindow) this._infoWindow.setItem(item);
            if (this._goldWindow) this._goldWindow.setItem(item);
        }
    });
    // The list opens at half the speed of the other windows.
    ace.openSpeed(Window_RRCraftItemList.prototype, 24);

    //-------------------------------------------------------------------------
    // Components (the first info page; the only one the game can reach)
    //-------------------------------------------------------------------------
    const drawGoldName = (w, x, y, enabled) => {
        ace.icon(w, P.goldIcon, x, y, enabled);
        ace.color(w, ColorManager.normalColor(), enabled);
        w.drawText(P.goldText, x + 24, y, w.width, 'left');
        w.changePaintOpacity(true);
    };
    const lackColor = (w) => ace.color(w, ColorManager.textColor(P.lackColor), !P.fadeLacking);
    /** The fee against the party's gold, both padded to eight places. */
    const drawGoldInfo = (w, item, number, x, y) => {
        const fee = craft(item).fee, gold = $gameParty.gold(), unit = TextManager.currencyUnit;
        const enabled = gold >= fee, cx = w.textWidth(unit), width = w.innerWidth - 4 - x, lh = w.lineHeight();
        drawGoldName(w, x, y, enabled);
        ace.color(w, ColorManager.systemColor());
        w.drawText(unit, x, y + lh, width, 'right');
        ace.color(w, ColorManager.normalColor());
        if (!enabled) lackColor(w);
        w.drawText(pad(fee * number, 8) + '/' + pad(gold, 8), x, y + lh, width - cx - 2, 'right');
        w.changePaintOpacity(true);
    };

    const Window_RRCraftInfo = subclass(Window_Base);
    Object.assign(Window_RRCraftInfo.prototype, {
        initialize(rect) {
            Window_Base.prototype.initialize.call(this, rect);
            this._item = null;
            this.number = 1;
            this.pageChange = true;
            this._ingredients = [];
            this._vertPage = 0;
            this._hasPages = false;   // until an item is set, the page is the general one
            this.refresh();
        },
        setPageKeys() { this._vertPage = 0; this.refresh(); },
        setItem(item) {
            this._vertPage = 0;
            this._item = item;
            if (item) this._hasPages = true;
            this.refresh();
        },
        vertPageMax() { return Math.floor((this._ingredients.length + P.pageSize) / P.pageSize); },
        standardRect(x, y) { return new Rectangle(x, y, this.innerWidth - 4 - x, this.lineHeight()); },
        refresh() {
            this.contents.clear();
            if (this._item) this.makeIngredients();
            const lh = this.lineHeight(), rect = this.standardRect(4, 0);
            // Heading, footer, rule and the page button icons
            ace.color(this, ColorManager.systemColor());
            this.drawText(this._hasPages ? P.header : 'Information', rect.x, rect.y, rect.width);
            if (this._item) ace.icon(this, this._item.iconIndex, rect.width - 24, 0);
            const footY = lh * (Math.floor(this.innerHeight / lh) - 1);
            ace.color(this, ColorManager.normalColor());
            const foot = this._hasPages && this.vertPageMax() > 1 ? P.moreFooter : P.footer;
            this.drawText(foot, 4, footY, this.innerWidth - 8, 'center');
            this.contents.paintOpacity = 48;
            this.contents.fillRect(0, lh + lh / 2 - 1, this.innerWidth, 2, ColorManager.normalColor());
            this.contents.paintOpacity = 255;
            ace.icon(this, Number(P.buttonIcons[0]) || 0, 4, footY);
            ace.icon(this, Number(P.buttonIcons[1]) || 0, this.innerWidth - 24 - 4, footY);
            if (this._item) this.drawIngredients(4, lh * 2);
        },
        makeIngredients() {
            const c = craft(this._item);
            this._ingredients = [];
            if (!P.goldWindow && c.fee > 0) this._ingredients.push({ type: 'gold' });
            for (const id of uniq(c.actors)) this._ingredients.push({ type: 'actor', obj: $gameActors.actor(id) });
            for (const obj of uniq(c.tools)) this._ingredients.push({ type: 'tool', obj });
            for (const obj of uniq(c.ingredients)) this._ingredients.push({ type: 'ingredient', obj });
        },
        drawIngredients(x, y) {
            const lh = this.lineHeight();
            const shown = this._ingredients.slice(this._vertPage * P.pageSize, this._vertPage * P.pageSize + P.pageSize);
            shown.forEach((ing, i) => {
                const iy = y + lh * (i * 2);
                // A fee listed here is drawn at the first slot whatever its place.
                if (ing.type === 'gold') drawGoldInfo(this, this._item, this.number, x, y);
                else if (ing.type === 'actor') this.drawActor(ing.obj, x, iy);
                else if (ing.type === 'tool') this.drawTool(ing.obj, x, iy);
                else this.drawIngredient(ing.obj, x, iy);
            });
        },
        drawAvailability(texts, x, y, enabled) {
            ace.color(this, ColorManager.textColor(Number(enabled ? texts[1] : texts[3])));
            this.drawText(enabled ? texts[0] : texts[2], x, y + this.lineHeight(), this.innerWidth - 4 - x, 'right');
        },
        drawTool(item, x, y) {
            const enabled = $gameParty.hasItem(item);
            ace.itemName(this, item, x, y, enabled, this.innerWidth - 4 - x);
            this.drawAvailability(P.tool, x, y, enabled);
        },
        drawActor(actor, x, y) {
            if (!actor) return;
            const enabled = $gameParty.members().includes(actor);
            ace.icon(this, Number(P.actorIcons[actor.actorId()]) || 0, x, y, enabled);
            this.drawAvailability(P.actor, x, y, enabled);
            ace.color(this, ColorManager.normalColor(), enabled);
            this.drawText(actor.name(), x + 24, y, this.innerWidth - 4 - x);
            this.changePaintOpacity(true);
        },
        drawIngredient(item, x, y) {
            const need = countOf(craft(this._item).ingredients, item) * this.number, have = $gameParty.numItems(item);
            const enabled = have >= need;
            ace.itemName(this, item, x, y, enabled, this.innerWidth - 4 - x);
            ace.color(this, ColorManager.normalColor(), enabled);
            if (!enabled) lackColor(this);
            this.drawText('×' + pad(need, 2) + '/' + pad(have, 2), x, y + this.lineHeight(), this.innerWidth - 4 - x, 'right');
            this.changePaintOpacity(true);
        },
        update() {
            Window_Base.prototype.update.call(this);
            if (!this.visible) return;
            if (Input.isTriggered(P.nextPageButton) && this.vertPageMax() > 1 && this._hasPages) {
                this._vertPage = (this._vertPage + 1) % this.vertPageMax();
                this.refresh();
            }
            if (!this.pageChange) return;
            // Next and previous page on the same key turn the page forward and back: two sounds, same page.
            const [next, prev] = P.pageKeys;
            if (Input.isTriggered(next)) { playSe(P.pageSe); this.refresh(); }
            if (Input.isTriggered(prev)) { playSe(P.pageSe); this.refresh(); }
        }
    });

    /** The fee for the chosen count against the party's gold, under the list. */
    const Window_RRCraftGold = subclass(Window_Base);
    Object.assign(Window_RRCraftGold.prototype, {
        initialize(rect) {
            Window_Base.prototype.initialize.call(this, rect);
            this._item = null;
            this.number = 1;
            this.refresh();
        },
        setItem(item) { this._item = item; this.refresh(); },
        open() { this.refresh(); Window_Base.prototype.open.call(this); },
        refresh() {
            this.contents.clear();
            if (this._item) drawGoldInfo(this, this._item, this.number, 4, 0);
        }
    });

    /** How many to make, counted in whole sets of the result's amount. */
    const Window_RRCraftNumber = subclass(Window_Selectable);
    Object.assign(Window_RRCraftNumber.prototype, {
        initialize(rect) {
            Window_Selectable.prototype.initialize.call(this, rect);
            this._item = null;
            this.number = 1;
            this._actualMax = 1;
        },
        set(item, max) {
            this._item = item;
            const amt = craft(item).amount;
            this.number = amt;
            const hold = $gameParty.maxItems(item) - $gameParty.numItems(item);
            this._actualMax = Math.max(Math.min(max * amt, hold - rubyMod(hold, amt)), 0);
            this.refresh();
        },
        itemY() { return Math.floor(this.innerHeight / 2) - Math.floor(this.lineHeight() * 3 / 2); },
        cursorWidth() { return 2 * 10 + 12; },
        cursorX() { return this.innerWidth - this.cursorWidth() - 4; },
        refreshCursor() { this.setCursorRect(this.cursorX(), this.itemY(), this.cursorWidth(), this.lineHeight()); },
        refresh() {
            this.contents.clear();
            ace.itemName(this, this._item, 0, this.itemY());
            ace.color(this, ColorManager.normalColor());
            this.drawText('×', this.cursorX() - 28, this.itemY(), 22);
            this.drawText(this.number, this.cursorX(), this.itemY(), this.cursorWidth() - 4, 'right');
            const sets = Math.floor(this.number / craft(this._item).amount);
            this._infoWindow.number = sets;
            this._infoWindow.refresh();
            this._goldWindow.number = sets;
            this._goldWindow.refresh();
        },
        update() {
            Window_Selectable.prototype.update.call(this);
            if (!this.active || !this._item) return;
            const last = this.number;
            if (Input.isRepeated('right')) this.changeNumber(1);
            if (Input.isRepeated('left')) this.changeNumber(-1);
            if (Input.isRepeated('up')) this.changeNumber(10);
            if (Input.isRepeated('down')) this.changeNumber(-10);
            if (this.number !== last) { SoundManager.playCursor(); this.refresh(); }
        },
        changeNumber(amount) {
            const amt = craft(this._item).amount, temp = this.number + amount * amt;
            this.number = Math.max(Math.min(temp - rubyMod(temp, amt), this._actualMax), amt);
        }
    });

    const Window_RRCraftResult = subclass(Window_Selectable);
    Object.assign(Window_RRCraftResult.prototype, {
        initialize(rect) {
            this._item = null;
            this._number = 0;
            Window_Selectable.prototype.initialize.call(this, rect);
        },
        set(item, number) { this._item = item; this._number = number; },
        refresh() {
            this.contents.clear();
            if (!this._item) return;
            const lh = this.lineHeight(), width = this.innerWidth - 8;
            ace.color(this, ColorManager.systemColor());
            this.drawText(P.resultHeader, 4, 0, width, 'center');
            ace.itemName(this, this._item, 4, lh, true);
            this.drawText('×' + pad(this._number, 2), 4, lh, width, 'right');
        }
    });

    //-------------------------------------------------------------------------
    // The scene
    //-------------------------------------------------------------------------
    function Scene_RRTOCrafting() { this.initialize(...arguments); }
    Scene_RRTOCrafting.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRTOCrafting.prototype.constructor = Scene_RRTOCrafting;
    window.Scene_RRTOCrafting = Scene_RRTOCrafting;

    Scene_RRTOCrafting.prototype.prepare = function(categories) { this._categories = categories; };
    Scene_RRTOCrafting.prototype.helpWindowRect = function() { return new Rectangle(0, 0, Graphics.boxWidth, ace.fitting(2)); };

    // Laid out on the whole screen: lists in the left half, pages in the right, the help across the top.
    Scene_RRTOCrafting.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        const gw = Graphics.boxWidth, gh = Graphics.boxHeight, half = Math.floor(gw / 2);
        this.createHelpWindow();
        const top = this._helpWindow.height;
        const add = (w) => { this.addWindow(w); return w; };

        this._goldWindow = add(new Window_RRCraftGold(new Rectangle(0, 0, half, ace.fitting(2))));
        this._goldWindow.y = gh - this._goldWindow.height;
        this._goldWindow.hide(); this._goldWindow.close();

        this._coverWindow = add(new Window_RRCraftCover(new Rectangle(half, top, gw - half, gh - top)));
        this._coverWindow.refresh();

        this._infoWindow = add(new Window_RRCraftInfo(new Rectangle(half, top, gw - half, gh - top)));
        this._infoWindow.hide();

        this._headerWindow = add(new Window_RRCraftHeader(new Rectangle(0, top, half, ace.fitting(1))));
        this._headerWindow.hide(); this._headerWindow.close();

        const listY = top + this._headerWindow.height;
        const listH = gh - listY - (P.goldWindow ? this._goldWindow.height : 0);
        this._itemListWindow = add(new Window_RRCraftItemList(new Rectangle(0, listY, half, listH)));
        this._itemListWindow.setHelpWindow(this._helpWindow);
        this._itemListWindow._infoWindow = this._infoWindow;
        this._itemListWindow._goldWindow = this._goldWindow;
        this._itemListWindow.hide(); this._itemListWindow.close();
        this._itemListWindow.setHandler('ok', this.onItemOk.bind(this));
        this._itemListWindow.setHandler('cancel', this.onItemCancel.bind(this));

        this._recipeWindow = add(new Window_RRCraftRecipeList(new Rectangle(0, top, half, gh - top)));
        this._recipeWindow.setHelpWindow(this._helpWindow);
        this._recipeWindow._infoWindow = this._infoWindow;
        this._recipeWindow._headerWindow = this._headerWindow;
        this._recipeWindow._coverWindow = this._coverWindow;
        this._recipeWindow.setCategories(this._categories);
        this._recipeWindow.setHandler('ok', this.onRecipeOk.bind(this));
        this._recipeWindow.setHandler('cancel', this.onRecipeCancel.bind(this));
        this._recipeWindow.refresh();
        this._recipeWindow.show(); this._recipeWindow.activate(); this._recipeWindow.select(0);

        this._numberWindow = add(new Window_RRCraftNumber(new Rectangle(0, listY, half, listH)));
        this._numberWindow._infoWindow = this._infoWindow;
        this._numberWindow._goldWindow = this._goldWindow;
        this._numberWindow.hide(); this._numberWindow.close();
        this._numberWindow.setHandler('ok', this.onNumberOk.bind(this));
        this._numberWindow.setHandler('cancel', this.onNumberCancel.bind(this));

        const resultH = ace.fitting(2);
        this._resultWindow = add(new Window_RRCraftResult(new Rectangle(Math.floor(gw / 4), Math.floor(gh / 2) - Math.floor(resultH / 2), half, resultH)));
        this._resultWindow.hide(); this._resultWindow.close();
        this._resultWindow.setHandler('ok', this.onResultOk.bind(this));
        this._resultWindow.refresh();
    };

    Scene_RRTOCrafting.prototype.refreshAll = function() {
        this._infoWindow.refresh();
        this._helpWindow.refresh();
        this._itemListWindow.refresh();
        this._recipeWindow.refresh();
        this._resultWindow.refresh();
        this._headerWindow.refresh();
        this._goldWindow.refresh();
    };

    Scene_RRTOCrafting.prototype.onRecipeOk = function() {
        this._recipeWindow.close();
        this._itemListWindow.setBook(this._recipeWindow.item());
        if (P.goldWindow) { this._goldWindow.show(); this._goldWindow.open(); }
        this._coverWindow.hide();
        this._infoWindow.show();
        this._infoWindow.setPageKeys();
        this.refreshAll();
        this._headerWindow.show(); this._headerWindow.open();
        this._itemListWindow.show(); this._itemListWindow.open(); this._itemListWindow.activate(); this._itemListWindow.select(0);
    };
    Scene_RRTOCrafting.prototype.onRecipeCancel = function() {
        this.refreshAll();
        this.popScene();
    };

    Scene_RRTOCrafting.prototype.onItemOk = function() {
        this._item = this._itemListWindow.item();
        this._itemListWindow.close(); this._itemListWindow.hide();
        this._numberWindow.set(this._item, this.maxCraft());
        this._infoWindow.pageChange = false;
        this._infoWindow.setPageKeys();
        this._numberWindow.show(); this._numberWindow.open(); this._numberWindow.activate();
    };
    Scene_RRTOCrafting.prototype.onItemCancel = function() {
        this._itemListWindow.close();
        this._headerWindow.close();
        if (P.goldWindow) { this._goldWindow.close(); this._goldWindow.hide(); }
        this._infoWindow.hide();
        this._coverWindow.show();
        this.refreshAll();
        this._recipeWindow.show(); this._recipeWindow.open(); this._recipeWindow.activate();
    };

    Scene_RRTOCrafting.prototype.onNumberOk = function() {
        const number = this._numberWindow.number;
        this._numberWindow.close(); this._numberWindow.hide();
        this.doCrafting(this._item, number);
        this._resultWindow.set(this._item, number);
        this._itemListWindow.show(); this._itemListWindow.open();
        this._infoWindow.pageChange = true;
        this._goldWindow.number = this._infoWindow.number = 1;
        this.refreshAll();
        this._resultWindow.show(); this._resultWindow.open(); this._resultWindow.activate();
    };
    Scene_RRTOCrafting.prototype.onNumberCancel = function() {
        this._numberWindow.close(); this._numberWindow.hide();
        this._goldWindow.number = this._infoWindow.number = 1;
        this._infoWindow.pageChange = true;
        this._itemListWindow.show(); this._itemListWindow.open(); this._itemListWindow.activate();
    };

    Scene_RRTOCrafting.prototype.onResultOk = function() {
        this._resultWindow.close(); this._resultWindow.hide();
        this._itemListWindow.activate();
        const cev = craft(this._item).cev;
        if (cev > 0) {
            $gameTemp.reserveCommonEvent(cev);
            if ($gameTemp.isCommonEventReserved()) SceneManager.goto(Scene_Map);
        }
    };

    /** Sets the party can afford and hold, and has the components for. */
    Scene_RRTOCrafting.prototype.maxCraft = function() {
        const c = craft(this._item);
        let max = $gameParty.maxItems(this._item) - $gameParty.numItems(this._item);
        if (c.fee !== 0) max = Math.min(max, Math.floor($gameParty.gold() / c.fee));
        for (const ing of uniq(c.ingredients)) {
            if (max === 0) break;
            max = Math.min(max, Math.floor($gameParty.numItems(ing) / countOf(c.ingredients, ing)));
        }
        return Math.max(max, 0);
    };

    Scene_RRTOCrafting.prototype.doCrafting = function(item, number) {
        if (!item) return;
        const c = craft(item), sets = Math.floor(number / c.amount);
        playSe(c.se || P.craftSe);
        for (const ing of c.ingredients) $gameParty.loseItem(ing, sets);
        $gameParty.loseGold(c.fee * sets);
        $gameParty.gainItem(item, number);
    };

    Game_Interpreter.prototype.rrCallTOCrafting = function(...categories) {
        SceneManager.push(Scene_RRTOCrafting);
        SceneManager.prepareNextScene(categories);
    };

    // For the tests and other ports.
    Scene_RRTOCrafting.craftData = craft;
})();
