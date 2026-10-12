/*:
 * @target MZ
 * @plugindesc Guide and Catalogue Base (VX), for imported games
 * @author Strak, on modern algebra's Quest Journal and Catalogue Base; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallGuide.js
 *
 * Thrall's in-game guide: the category label and icons (combat, world,
 * status ailments, enemies, loot) and the guides of the chosen category on
 * the left, the guide on the right. Left and right switch the category;
 * confirm lets the up and down keys scroll a guide taller than the window.
 * A guide is a picture (img/pictures/GuideN, the column for the font in
 * use; Guide5 and Guide13 have one per window colour) or a list of prefixes
 * of which only those found so far are shown, with the count.
 *
 * The party keeps the guides, saved with the game. A guide is revealed the
 * first time anything asks for it ($game_party.guides[id], as the script's
 * Game_Guides#[] does); a new game reveals those of the first ids whose
 * first auto_reveal entry is true.
 *
 * Script calls:
 *   $gameParty.rrGuides()[id]         the guide (made and revealed on first use):
 *                                     name, parags, icon_index, custom_categories,
 *                                     auto_reveal (one flag per prefix), concealed
 *   $gameParty.rrRevealGuide(id)      reveal_guide(id)
 *   $gameParty.rrGuideRevealed(id)    guide_revealed?(id)
 *   $gameParty.rrPrefixRevealed(id, i)  a prefix line found
 *   SceneManager.push(Scene_RRThrallGuide)   Scene_Guide
 *
 * Catalogue Base only served the catalogue scenes Thrall does not use; it
 * has nothing to port.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param guides
 * @text Guides
 * @desc JSON: { id: [name, parags, icon, categories, autoReveal] } from GuideData.guide_data.
 * @type note
 * @default "{}"
 *
 * @param categories
 * @text Categories
 * @default combat,world,status,enemies,loot
 *
 * @param categoryLabels
 * @text Category labels
 * @desc The label window's text for each category, in order.
 * @default Combat,World,Status Ailments,Enemies,Loot
 *
 * @param categoryIcons
 * @text Category icons
 * @type note
 * @default "{\"combat\":298,\"world\":9,\"status\":1,\"enemies\":5,\"loot\":13}"
 *
 * @param listWidth
 * @text List width
 * @type number
 * @default 184
 *
 * @param helpGeneral
 * @text Help (list)
 * @default Use the horizontal directional keys to switch categories
 *
 * @param helpSelected
 * @text Help (guide)
 * @default Use the vertical directional keys to scroll up and down
 *
 * @param helpAlignment
 * @text Help alignment
 * @desc 0 left, 1 centre, 2 right.
 * @type number
 * @default 1
 *
 * @param startGuides
 * @text Guides a new game checks
 * @default 1-144,216-217
 */
(() => {
    'use strict';
    const PLUGIN = 'RR_ThrallGuide';
    const P = PluginManager.parameters(PLUGIN);
    const json = (s, d) => {
        try { let v = s ? JSON.parse(s) : d; if (typeof v === 'string') v = JSON.parse(v); return v && typeof v === 'object' ? v : d; } catch (_) { return d; }
    };
    const GUIDES = json(P.guides, {});
    const CATEGORIES = String(P.categories || 'combat,world,status,enemies,loot').split(',').map(s => s.trim()).filter(Boolean);
    const LABELS = String(P.categoryLabels || 'Combat,World,Status Ailments,Enemies,Loot').split(',').map(s => s.trim());
    const ICONS = json(P.categoryIcons, { combat: 298, world: 9, status: 1, enemies: 5, loot: 13 });
    const LIST_WIDTH = Number(P.listWidth) || 184;
    const HELP_GENERAL = P.helpGeneral ?? 'Use the horizontal directional keys to switch categories';
    const HELP_SELECTED = P.helpSelected ?? 'Use the vertical directional keys to scroll up and down';
    const HELP_ALIGN = Number(P.helpAlignment ?? 1);
    const START = String(P.startGuides || '1-144,216-217').split(',').map(r => r.split('-').map(Number)).filter(r => r.length === 2 && r.every(Number.isFinite));
    const WLH = 24;

    /** GuideData.guide_data(id): name, parags, icon, categories, auto_reveal (false for an id it has no entry for). */
    const guideData = (id) => {
        const d = GUIDES[String(id)];
        if (!d) return ['', [], 0, [], false];
        return [d[0], d[1].slice(), d[2], d[3].slice(), Array.isArray(d[4]) ? d[4].slice() : d[4]];
    };

    // ---- Game_Guide, Game_Guides ---------------------------------------------------------------------
    function Game_RRThrallGuide() { this.initialize(...arguments); }
    Game_RRThrallGuide.prototype.initialize = function(id) { this.id = id; this.reset(); };
    Game_RRThrallGuide.prototype.reset = function() {
        [this.name, this.parags, this.icon_index, this.custom_categories, this.auto_reveal] = guideData(this.id);
        this.concealed = false;
    };

    function Game_RRThrallGuides() { this.initialize(...arguments); }
    Game_RRThrallGuides.prototype.initialize = function() { this._data = {}; this._idSort = []; };
    /** guides[id]: made on first use, and then revealed (a new guide is never concealed). */
    Game_RRThrallGuides.prototype.get = function(id) {
        if (!Number.isInteger(id)) return new Game_RRThrallGuide(0);
        if (!this._data[id]) {
            this._data[id] = new Game_RRThrallGuide(id);
            if (!this._data[id].concealed) this.revealGuide(id);
        }
        return this._data[id];
    };
    /** The revealed guides by id; concealed ones dropped the way the script's each/delete drops them. */
    Game_RRThrallGuides.prototype.list = function() {
        const list = this._idSort.map(id => this._data[id]).filter(Boolean);
        for (let k = 0; k < list.length; k++) {
            const g = list[k];
            if (g.concealed) for (let j = list.length - 1; j >= 0; j--) if (list[j] === g) list.splice(j, 1);
        }
        return list;
    };
    Game_RRThrallGuides.prototype.categoryList = function(category) {
        return this.list().filter(g => (g.custom_categories || []).includes(category));
    };
    Game_RRThrallGuides.prototype.clear = function() { this._data = {}; };
    Game_RRThrallGuides.prototype.isRevealed = function(id) { return !!this._data[id] && !this._data[id].concealed; };
    Game_RRThrallGuides.prototype.isPrefixRevealed = function(id, prefix) { return !!this._data[id] && !!(this._data[id].auto_reveal || [])[prefix]; };
    /** Adds an existing guide to the sorted list (once). */
    Game_RRThrallGuides.prototype.revealGuide = function(id) {
        if (!this._data[id] || this._idSort.includes(id)) return;
        const at = this._idSort.findIndex(x => x > id);
        if (at < 0) this._idSort.push(id); else this._idSort.splice(at, 0, id);
    };
    window.Game_RRThrallGuide = Game_RRThrallGuide;
    window.Game_RRThrallGuides = Game_RRThrallGuides;

    /** A new game's guides: of the first ids, those whose first auto_reveal is true. */
    const startingGuides = () => {
        const guides = new Game_RRThrallGuides();
        for (const [from, to] of START) {
            for (let i = from; i <= to; i++) {
                const reveal = guideData(i)[4];
                if (reveal && reveal[0]) guides.get(i).concealed = false;
            }
        }
        return guides;
    };
    const _partyInit = Game_Party.prototype.initialize;
    Game_Party.prototype.initialize = function() {
        _partyInit.call(this);
        this._rrGuides = startingGuides();
    };
    /** $game_party.guides, as events index it: guides[id] makes and reveals the guide. */
    Game_Party.prototype.rrGuideBook = function() {
        if (!(this._rrGuides instanceof Game_RRThrallGuides)) this._rrGuides = startingGuides();   // Game_Party#refresh
        return this._rrGuides;
    };
    Game_Party.prototype.rrGuides = function() {
        const book = this.rrGuideBook();
        return new Proxy(book, {
            get(target, key, receiver) {
                if (typeof key === 'string' && /^-?\d+$/.test(key)) return target.get(Number(key));
                return Reflect.get(target, key, receiver);
            }
        });
    };
    Game_Party.prototype.rrRevealGuide = function(id) { this.rrGuideBook().get(id).concealed = false; };
    Game_Party.prototype.rrGuideRevealed = function(id) { return this.rrGuideBook().isRevealed(id); };
    Game_Party.prototype.rrPrefixRevealed = function(id, prefix) { return this.rrGuideBook().isPrefixRevealed(id, prefix); };
    Game_Party.prototype.rrRevealPrefix = function(id, prefix) { this.rrGuideBook().get(id).auto_reveal[prefix] = true; };

    // ---- windows ------------------------------------------------------------------------------------
    const vx = {
        normal(w) { return w.rrVxNormalColor ? w.rrVxNormalColor() : ColorManager.normalColor(); },
        text(w, x, y, width, height, text, align = 0) {
            if (w.rrVxDrawText) w.rrVxDrawText(x, y, width, height, text, align);
            else w.contents.drawText(String(text), x, y, width, height, ['left', 'center', 'right'][align] || 'left');
        },
        icon(w, index, x, y, enabled = true) { if (w.rrVxDrawIcon) w.rrVxDrawIcon(index, x, y, enabled); else w.drawIcon(index, x, y); },
        fontSize(w, n) { return w.rrVxFontSize ? w.rrVxFontSize(n) : n * $gameSystem.mainFontSize() / 20; }
    };
    const vxWindow = (proto) => {
        proto.updatePadding = function() { this.padding = 16; };
        proto.lineHeight = function() { return WLH; };
    };
    function makeWindow(name, base = Window_Base) {
        const Win = function() { this.initialize(...arguments); };
        Win.prototype = Object.create(base.prototype);
        Win.prototype.constructor = Win;
        vxWindow(Win.prototype);
        window[name] = Win;
        return Win;
    }

    /** The category's name over the icons. */
    const Window_RRThrallGuideLabel = makeWindow('Window_RRThrallGuideLabel');
    Window_RRThrallGuideLabel.prototype.initialize = function(width, height, categoryIndex) {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, 0, width, height));
        this.refresh(categoryIndex);
    };
    Window_RRThrallGuideLabel.prototype.refresh = function(categoryIndex = 0) {
        this.contents.clear();
        this.changeTextColor(vx.normal(this));
        vx.text(this, 0, 0, this.contents.width, this.contents.height, LABELS[categoryIndex] ?? LABELS[LABELS.length - 1], 1);
    };

    /** The categories' icons, the chosen one lit. */
    const Window_RRThrallGuideCategory = makeWindow('Window_RRThrallGuideCategory');
    Window_RRThrallGuideCategory.prototype.initialize = function(categoryIndex, width = LIST_WIDTH) {
        Window_Base.prototype.initialize.call(this, new Rectangle(0, WLH + 32, width, 64));
        this._spacing = Math.floor((this.contents.width - 24 * CATEGORIES.length) / Math.max(CATEGORIES.length - 1, 1));
        this.refresh(categoryIndex);
    };
    Window_RRThrallGuideCategory.prototype.refresh = function(categoryIndex = 0) {
        this.contents.clear();
        const y = this.contents.height === 32 ? 4 : 0;
        CATEGORIES.forEach((c, i) => vx.icon(this, ICONS[c] || 0, i * (24 + this._spacing), y, i === categoryIndex));
    };

    /** The guides of a category: icon and name. */
    const Window_RRThrallGuideList = makeWindow('Window_RRThrallGuideList', Window_Selectable);
    Window_RRThrallGuideList.prototype.itemHeight = function() { return WLH; };
    Window_RRThrallGuideList.prototype.cursorPagedown = function() {};
    Window_RRThrallGuideList.prototype.cursorPageup = function() {};
    Window_RRThrallGuideList.prototype.initialize = function(free, width, category, guideIndex) {
        Window_Selectable.prototype.initialize.call(this, new Rectangle(0, 0, width, Math.floor(free / WLH) * WLH + 32));
        this._commands = [];
        this.changeList(category);
        this.select(guideIndex);
    };
    Window_RRThrallGuideList.prototype.maxItems = function() { return this._commands.length; };
    Window_RRThrallGuideList.prototype.changeList = function(category) {
        this._commands = Array.isArray(category) ? category : $gameParty.rrGuideBook().categoryList(category);
        this.select(0);
        this.scrollTo(0, 0);
        this.refresh();
    };
    Window_RRThrallGuideList.prototype.guide = function() { return this._commands[this.index()] || null; };
    Window_RRThrallGuideList.prototype.drawItem = function(index) {
        const rect = this.itemRect(index);
        const guide = this._commands[index];
        if (!guide) return;
        this.changeTextColor(vx.normal(this));
        vx.icon(this, guide.icon_index, rect.x, rect.y, true);
        vx.text(this, rect.x + 24, rect.y, rect.width - 24, rect.height, guide.name);
    };

    /** The guide: its picture, or its header and the prefixes found so far with the count. */
    const Window_RRThrallGuideInfo = makeWindow('Window_RRThrallGuideInfo');
    Window_RRThrallGuideInfo.prototype.initialize = function(height = Graphics.height - (32 + WLH), x = LIST_WIDTH) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, 0, Graphics.width - x, height));
    };
    Window_RRThrallGuideInfo.prototype.setContentsHeight = function(h) {
        if (this.contents) this.contents.destroy();
        this.contents = new Bitmap(this.innerWidth, Math.max(h, 1));
        this.resetFontSettings();
        this.origin.y = 0;
    };
    Window_RRThrallGuideInfo.prototype.refresh = function(guide) {
        this._guide = guide;
        if (!guide) { this.setContentsHeight(this.innerHeight); return; }
        const parags = guide.parags || [], reveal = guide.auto_reveal || [];
        if (parags[0] === 'text') {
            let h = 96, total = 0;
            for (let g = 2; g < parags.length; g++) { total++; if (reveal[g]) h += 24; }
            this.setContentsHeight(h);
            this.changeTextColor(vx.normal(this));
            let y = 0, found = 0;
            for (let i = 1; i < parags.length; i++) {
                if (i === 1) {
                    this.contents.fontSize = vx.fontSize(this, 24);
                    vx.text(this, 0, y, this.contents.width, 24, parags[i]);
                    this.contents.fontSize = vx.fontSize(this, 20);
                    y += 48;
                } else if (reveal[i]) {
                    vx.text(this, 0, y, this.contents.width, 24, parags[i]);
                    found++;
                    y += 24;
                }
            }
            y += 24;
            vx.text(this, 0, y, this.contents.width, 24, `Total: ${found}/${total}`, 2);
            return;
        }
        let name = String(parags[0] ?? '');
        const skin = $gameVariables.value(80);
        if ((name === 'Guide13' || name === 'Guide5') && [1, 2, 3].includes(skin)) name += '-' + skin;
        this.setContentsHeight(this.innerHeight);
        if (!name) return;
        const picture = ImageManager.loadPicture(name);
        const draw = () => {
            if (this._guide !== guide) return;
            const h = picture.height;
            this.setContentsHeight(h);
            // The picture holds a column per font (variable 87): Eagle Lake's, then Roboto's.
            this.contents.blt(picture, 392 * $gameVariables.value(87), 0, picture.width, h, 0, 0);
        };
        if (picture.isReady()) draw(); else picture.addLoadListener(draw);
    };
    Window_RRThrallGuideInfo.prototype.canScroll = function() { return this.contents.height > this.height - 32; };
    /** Holding up or down scrolls 6 pixels a frame. */
    Window_RRThrallGuideInfo.prototype.scrollBy = function(dy) {
        this.origin.y = dy > 0 ? Math.min(this.origin.y + dy, this.contents.height - this.height + 32) : Math.max(this.origin.y + dy, 0);
    };

    /** Window_Help as Thrall drew it: one line, 4 px in, aligned as asked. */
    const Window_RRThrallGuideHelp = makeWindow('Window_RRThrallGuideHelp');
    Window_RRThrallGuideHelp.prototype.initialize = function(x = 0, y = 0, width = 608, height = WLH + 32) {
        Window_Base.prototype.initialize.call(this, new Rectangle(x, y, width, height));
        this._text = null;
        this._align = null;
    };
    Window_RRThrallGuideHelp.prototype.setText = function(text, align = 0) {
        if (text === this._text && align === this._align) return;
        this.contents.clear();
        this.changeTextColor(vx.normal(this));
        vx.text(this, 4, 0, this.width - 40, WLH, text, align);
        this._text = text;
        this._align = align;
    };

    // ---- Scene_Guide -------------------------------------------------------------------------------------
    const BUTTONS = ['shift', 'escape', 'ok', 'pageup', 'pagedown', 'rgssX', 'rgssY', 'rgssZ', 'up', 'left', 'down', 'right'];
    const trig = (i) => (Input.rrGamepadTriggered ? Input.rrGamepadTriggered(i) : Input.isTriggered(BUTTONS[i]));
    const press = (i) => (Input.rrGamepadPressed ? Input.rrGamepadPressed(i) : Input.isPressed(BUTTONS[i]));
    const CANCEL = 1, CONFIRM = 2, UP = 8, LEFT = 9, DOWN = 10, RIGHT = 11;

    function Scene_RRThrallGuide() { this.initialize(...arguments); }
    Scene_RRThrallGuide.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRThrallGuide.prototype.constructor = Scene_RRThrallGuide;
    Scene_RRThrallGuide.prototype.initialize = function() {
        Scene_MenuBase.prototype.initialize.call(this);
        this._categoryIndex = 0;
        this._guideIndex = 0;
        this._infoActive = false;
    };
    /** Scene_Guide.new(category, guide). */
    Scene_RRThrallGuide.prototype.prepare = function(category, guide) {
        if (category != null) this._categoryIndex = category < CATEGORIES.length ? category : 0;
        if (guide != null) this._guideIndex = guide;
    };
    Scene_RRThrallGuide.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        let free = Graphics.height - 96 - 2 * WLH;
        let y = 0;
        if (CATEGORIES.length > 1) {
            this._categoryWindow = new Window_RRThrallGuideCategory(this._categoryIndex);
            free -= this._categoryWindow.height;
            this._labelWindow = new Window_RRThrallGuideLabel(LIST_WIDTH, 32 + WLH + (free % WLH), this._categoryIndex);
            y = this._labelWindow.height;
            this._categoryWindow.y = y;
            y += this._categoryWindow.height;
        }
        this._listWindow = new Window_RRThrallGuideList(free, LIST_WIDTH, CATEGORIES[this._categoryIndex], this._guideIndex);
        this._listWindow.y = y;
        this._listWindow.activate();
        this._infoWindow = new Window_RRThrallGuideInfo();
        this._infoWindow.refresh(this._listWindow.guide());
        this._helpWindow = new Window_RRThrallGuideHelp();
        this._helpWindow.y = Graphics.height - this._helpWindow.height;
        this._helpWindow.setText(HELP_GENERAL, HELP_ALIGN);
        for (const w of [this._labelWindow, this._categoryWindow, this._listWindow, this._infoWindow, this._helpWindow]) if (w) this.addWindow(w);
    };
    Scene_RRThrallGuide.prototype.update = function() {
        Scene_MenuBase.prototype.update.call(this);
        if (this._listWindow.active) this.updateList();
        else if (this._infoActive) this.updateInfo();
    };
    Scene_RRThrallGuide.prototype.updateList = function() {
        if (this._categoryWindow && (trig(LEFT) || trig(RIGHT))) {
            const step = trig(LEFT) ? -1 : 1;
            this._categoryIndex = ((this._categoryIndex + step) % CATEGORIES.length + CATEGORIES.length) % CATEGORIES.length;
            SoundManager.playCursor();
            this._categoryWindow.refresh(this._categoryIndex);
            this._labelWindow.refresh(this._categoryIndex);
            this._listWindow.changeList(CATEGORIES[this._categoryIndex]);
            this._infoWindow.refresh(this._listWindow.guide());
        }
        if (trig(CANCEL)) {
            SoundManager.playCancel();
            this.returnScene();
        } else if (trig(CONFIRM)) {
            if (this._infoWindow.canScroll()) {
                SoundManager.playOk();
                this._infoActive = true;
                this._listWindow.deactivate();
                this._helpWindow.setText(HELP_SELECTED, HELP_ALIGN);
            } else SoundManager.playBuzzer();
        } else if (press(DOWN) || press(UP)) {
            if (this._infoWindow._guide !== this._listWindow.guide()) this._infoWindow.refresh(this._listWindow.guide());
        }
    };
    Scene_RRThrallGuide.prototype.updateInfo = function() {
        if (press(DOWN)) this._infoWindow.scrollBy(6);
        else if (press(UP)) this._infoWindow.scrollBy(-6);
        if (trig(CANCEL) || trig(CONFIRM)) {
            SoundManager.playCancel();
            this._infoActive = false;
            this._infoWindow.origin.y = 0;
            this._listWindow.activate();
            this._helpWindow.setText(HELP_GENERAL, HELP_ALIGN);
        }
    };
    /** $scene = Scene_Map.new. */
    Scene_RRThrallGuide.prototype.returnScene = function() {
        const stack = SceneManager._stack || [];
        if (stack.length && stack[stack.length - 1] === Scene_Map) SceneManager.pop();
        else SceneManager.goto(Scene_Map);
    };
    window.Scene_RRThrallGuide = Scene_RRThrallGuide;
})();
