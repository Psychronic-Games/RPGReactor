/*:
 * @target MZ
 * @plugindesc Victory Aftermath (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyVictoryAftermath.js
 *
 * A won battle ends in a sequence of screens instead of the reward messages.
 * The victory music plays (the victory ME, and the game's victory BGM, which
 * when it has no name stops the battle music until the map's comes back).
 *   1. A title ("Jay is victorious", or "Jay's party is victorious" with
 *      more members) over one column per battle member: name, face, an EXP
 *      gauge that fills in ticks with a sound (LEVEL UP! when it reaches the
 *      next level), the EXP gained and, with Equipment Learning, the Equip
 *      EXP. A random living member says a win quote.
 *   2. For each member who levels up: the face and EXP, the level and the
 *      eight base parameters before and after, and the new skills; the
 *      level-up sound; the member says a level quote. Equipment Learning adds
 *      the same page, titled with its own text, for a member whose skills
 *      changed over the reward.
 *   3. The spoils: the gold, then the dropped items, weapons and armors
 *      (each by id, with its count). The member of the win quote says a
 *      drops quote.
 * Quotes are messages with the speaker's face, headed by the name, one picked
 * at random from the actor's note, else the class's, else the defaults:
 *   <win quotes> ... [New Quote] ... </win quotes>  (also level, drops)
 * Note lines inside a block run together without a space.
 *
 * EXP gained in battle shows no level-up message. The skip switch gives the
 * rewards with no screens and no victory music; the music switch keeps the
 * battle music. The common event, when set, runs after every battle but a
 * defeat.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param victoryBgm
 * @default {"name":"","volume":100,"pitch":100}
 * @param victoryTick
 * @default {"name":"","volume":100,"pitch":100}
 * @param levelSound
 * @default {"name":"","volume":100,"pitch":100}
 * @param skillsText
 * @default New Skills
 *
 * @param skipAftermathSwitch
 * @type switch
 * @default 0
 * @param skipMusicSwitch
 * @type switch
 * @default 0
 * @param commonEvent
 * @type common_event
 * @default 0
 *
 * @param topTeam
 * @default %s's party
 * @param topVictory
 * @default %s is victorious
 * @param topLevelUp
 * @default %s has leveled up
 * @param topSpoils
 * @default Loot
 *
 * @param victoryExp
 * @default +%s EXP
 * @param expPercent
 * @default %1.2f%%
 * @param levelUpText
 * @default LEVEL UP!
 * @param maxLevelText
 * @default MAX LEVEL
 * @param fontSizeExp
 * @type number
 * @default 18
 * @param expTicks
 * @type number
 * @default 15
 * @param expGauge1
 * @type number
 * @default 26
 * @param expGauge2
 * @type number
 * @default 27
 * @param levelGauge1
 * @type number
 * @default 13
 * @param levelGauge2
 * @type number
 * @default 5
 *
 * @param headerText
 * @default \>\C[6]%s\C[0]\<
 * @param footerText
 * @default
 * @param quotes
 * @type multiline_string
 * @default {"win":["Victory..."],"level":["Level Up!"],"drops":["The enemy dropped something..."]}
 * @desc JSON: the default quotes by type (win, level, drops; el_learn with Equipment Learning).
 *
 * @param rgssFontSize
 * @text The game's default font size
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyVictoryAftermath');
    const num = (key, d) => (params[key] === undefined || params[key] === '' ? d : Number(params[key]));
    const str = (key, d) => (params[key] === undefined ? d : String(params[key]));
    const json = (key, d) => { try { return params[key] ? JSON.parse(params[key]) : d; } catch (_) { return d; } };
    const se = (key) => Object.assign({ name: '', volume: 100, pitch: 100, pan: 0 }, json(key, {}));
    const VICTORY_BGM = se('victoryBgm'), VICTORY_TICK = se('victoryTick'), LEVEL_SOUND = se('levelSound');
    const SKILLS_TEXT = str('skillsText', 'New Skills');
    const SKIP_SWITCH = num('skipAftermathSwitch', 0), SKIP_MUSIC = num('skipMusicSwitch', 0), COMMON_EVENT = num('commonEvent', 0);
    const TOP_TEAM = str('topTeam', "%s's party"), TOP_VICTORY = str('topVictory', '%s is victorious');
    const TOP_LEVEL_UP = str('topLevelUp', '%s has leveled up'), TOP_SPOILS = str('topSpoils', 'Loot');
    const VICTORY_EXP = str('victoryExp', '+%s EXP'), EXP_PERCENT = str('expPercent', '%1.2f%%');
    const LEVELUP_TEXT = str('levelUpText', 'LEVEL UP!'), MAX_LVL_TEXT = str('maxLevelText', 'MAX LEVEL');
    const FONT_EXP = num('fontSizeExp', 18), EXP_TICKS = num('expTicks', 15);
    const EXP_GAUGE1 = num('expGauge1', 26), EXP_GAUGE2 = num('expGauge2', 27);
    const LEVEL_GAUGE1 = num('levelGauge1', 13), LEVEL_GAUGE2 = num('levelGauge2', 5);
    const HEADER = str('headerText', '\\>\\C[6]%s\\C[0]\\<\n'), FOOTER = str('footerText', '');
    const QUOTES = json('quotes', { win: ['Victory...'], level: ['Level Up!'], drops: ['The enemy dropped something...'] });
    const RGSS_FONT = num('rgssFontSize', 24) || 24;
    const FACE = 96;

    /** Ruby's sprintf for %s, %d and %f (with width, precision and flags) and %%. */
    const sprintf = (fmt, ...args) => {
        let i = 0;
        return String(fmt).replace(/%([-+ 0#]*)(\d*)(?:\.(\d+))?([sdif%])/g, (m, flags, width, prec, conv) => {
            if (conv === '%') return '%';
            const v = args[i++];
            let out = conv === 's' ? String(v) : conv === 'f' ? Number(v).toFixed(prec === undefined ? 6 : Number(prec)) : String(Math.trunc(Number(v)));
            const w = Number(width) || 0;
            if (out.length < w) out = flags.includes('-') ? out.padEnd(w) : out.padStart(w, flags.includes('0') && conv !== 's' ? '0' : ' ');
            return out;
        });
    };
    // An RGSS size relative to the game's default, in this project's font.
    const fontSize = (size) => Math.round($gameSystem.mainFontSize() * size / RGSS_FONT);
    const group = (win, n) => (typeof win.rrAceGroup === 'function' ? win.rrAceGroup(n) : String(n));
    const playSe = (s) => { if (s.name) AudioManager.playSe(s); };
    const scene = () => (SceneManager._scene instanceof Scene_Battle ? SceneManager._scene : null);
    const hasPlugin = (name) => typeof $plugins !== 'undefined' && $plugins.some(p => p.name === name && p.status);

    //-------------------------------------------------------------------------
    // Quotes: <win quotes>, <level quotes>, <drops quotes> in actor and class notes
    //-------------------------------------------------------------------------
    const RE = {
        newQuote: /\[(?:NEW_QUOTE|new quote)\]/i,
        winOn: /<(?:WIN_QUOTES|win quote|win quotes)>/i, winOff: /<\/(?:WIN_QUOTES|win quote|win quotes)>/i,
        levelOn: /<(?:LEVEL_QUOTES|level quote|level quotes)>/i, levelOff: /<\/(?:LEVEL_QUOTES|level quote|level quotes)>/i,
        dropsOn: /<(?:DROPS_QUOTES|drops quote|drops quotes)>/i, dropsOff: /<\/(?:DROPS_QUOTES|drops quote|drops quotes)>/i
    };
    const quoteCache = new WeakMap();
    /** { win, level, drops } of a note; [""] where it has none. */
    const noteQuotes = (obj) => {
        let out = quoteCache.get(obj);
        if (out) return out;
        out = { win: [''], level: [''], drops: [''] };
        let type = null;
        for (const line of String(obj.note || '').split(/[\r\n]+/)) {
            if (RE.winOn.test(line)) type = 'win';
            else if (RE.winOff.test(line)) type = null;
            else if (RE.levelOn.test(line)) type = 'level';
            else if (RE.levelOff.test(line)) type = null;
            else if (RE.dropsOn.test(line)) type = 'drops';
            else if (RE.dropsOff.test(line)) type = null;
            else if (RE.newQuote.test(line)) { if (type) out[type].push(''); }
            else if (type) out[type][out[type].length - 1] += line;
        }
        quoteCache.set(obj, out);
        return out;
    };
    const none = (list) => list.length === 1 && list[0] === '';
    /** The quotes an actor picks from: the actor's, else the class's, else the defaults. */
    Game_Actor.prototype.rrVictoryQuotes = function(type) {
        if (type === 'el_learn') return QUOTES.el_learn || [''];
        if (!['win', 'level', 'drops'].includes(type)) return ['NOTEXT'];
        const own = noteQuotes(this.actor())[type];
        if (!none(own)) return own;
        const cls = this.currentClass() ? noteQuotes(this.currentClass())[type] : [''];
        return none(cls) ? (QUOTES[type] || ['']) : cls;
    };

    // EXP gained in battle never shows the level-up message; fractions of the rate are dropped.
    Game_Actor.prototype.gainExp = function(exp) {
        this.changeExp(this.currentExp() + Math.trunc(exp * this.finalExpRate()), !(SceneManager._scene instanceof Scene_Battle));
    };

    /** What the level page reads of an actor at one moment. */
    const snapshot = (actor) => ({
        actor, name: actor.name(), faceName: actor.faceName(), faceIndex: actor.faceIndex(), level: actor.level, exp: actor.currentExp(),
        params: [0, 1, 2, 3, 4, 5, 6, 7].map(i => actor.paramBase(i)),
        skills: actor.skills().slice().sort((a, b) => a.id - b.id)
    });

    /** A face cell drawn from its left edge, at most width wide; redraws the window once the image is in. */
    const drawFace = (win, faceName, faceIndex, x, y, width) => {
        const bitmap = ImageManager.loadFace(faceName);
        if (!bitmap.isReady()) {
            bitmap.addLoadListener(() => win.rrVaRedraw());
            return;
        }
        const rw = Math.min(width, FACE);
        win.contents.blt(bitmap, (faceIndex % 4) * FACE, Math.floor(faceIndex / 4) * FACE, rw, FACE, x, y);
    };

    //-------------------------------------------------------------------------
    // Title
    //-------------------------------------------------------------------------
    function Window_RRVictoryTitle() { this.initialize(...arguments); }
    Window_RRVictoryTitle.prototype = Object.create(Window_Base.prototype);
    Window_RRVictoryTitle.prototype.constructor = Window_RRVictoryTitle;
    Window_RRVictoryTitle.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.openness = 0;
    };
    Window_RRVictoryTitle.prototype.refresh = function(message = '') {
        this.contents.clear();
        this.drawText(message, 0, 0, this.innerWidth, 'center');
    };
    window.Window_RRVictoryTitle = Window_RRVictoryTitle;

    //-------------------------------------------------------------------------
    // EXP: a column per battle member (name, face, EXP gained), and over it a
    // frameless copy that draws the gauges and fills them
    //-------------------------------------------------------------------------
    function Window_RRVictoryExpBack() { this.initialize(...arguments); }
    Window_RRVictoryExpBack.prototype = Object.create(Window_Selectable.prototype);
    Window_RRVictoryExpBack.prototype.constructor = Window_RRVictoryExpBack;
    Window_RRVictoryExpBack.prototype.initialize = function(rect) {
        this._rrExpTotal = 0;
        Window_Selectable.prototype.initialize.call(this, rect);
        this.openness = 0;
    };
    Window_RRVictoryExpBack.prototype.maxItems = function() { return $gameParty.battleMembers().length; };
    Window_RRVictoryExpBack.prototype.maxCols = function() { return Math.max(this.maxItems(), 1); };
    Window_RRVictoryExpBack.prototype.rrAceSpacing = function() { return 8; };
    Window_RRVictoryExpBack.prototype.itemRect = function(index) {
        const cols = this.maxCols(), spacing = this.rrAceSpacing();
        const width = Math.floor((this.innerWidth + spacing) / cols - spacing);
        return new Rectangle((index % cols) * (width + spacing), Math.floor(index / cols) * this.itemHeight(), width, this.innerHeight);
    };
    Window_RRVictoryExpBack.prototype.drawItemBackground = function() {};
    Window_RRVictoryExpBack.prototype.open = function() {
        this._rrExpTotal = BattleManager._rewards ? BattleManager._rewards.exp : $gameTroop.expTotal();
        Window_Selectable.prototype.open.call(this);
    };
    Window_RRVictoryExpBack.prototype.rrVaRedraw = function() { this.refresh(); };
    Window_RRVictoryExpBack.prototype.rrActorExpGain = function(actor) { return Math.floor(this._rrExpTotal * actor.finalExpRate()); };
    Window_RRVictoryExpBack.prototype.drawItem = function(index) {
        const actor = $gameParty.battleMembers()[index];
        if (!actor) return;
        const rect = this.itemRect(index);
        this.resetFontSettings();
        this.drawText(actor.name(), rect.x, rect.y + this.lineHeight(), rect.width, 'center');
        this.rrDrawExpGain(actor, rect);
        drawFace(this, actor.faceName(), actor.faceIndex(), rect.x + Math.floor((rect.width - Math.min(rect.width, FACE)) / 2), rect.y + this.lineHeight() * 2, rect.width);
    };
    /** "+n EXP" under the face, right-aligned to its right edge; with Equipment Learning its line below. */
    Window_RRVictoryExpBack.prototype.rrDrawExpGain = function(actor, rect) {
        const dw = rect.width - Math.floor((rect.width - Math.min(rect.width, FACE)) / 2);
        const lh = this.lineHeight();
        this.contents.fontSize = fontSize(FONT_EXP);
        this.changeTextColor(ColorManager.powerUpColor());
        this.drawText(sprintf(VICTORY_EXP, group(this, this.rrActorExpGain(actor))), rect.x, rect.y + lh * 3 + FACE, dw, 'right');
        if (typeof actor.rrEquipExpText === 'function') {
            this.contents.fontSize = fontSize(FONT_EXP);
            this.changeTextColor(ColorManager.powerUpColor());
            this.drawText(actor.rrEquipExpText(), rect.x, rect.y + lh * 4 + FACE, dw, 'right');
        }
    };
    window.Window_RRVictoryExpBack = Window_RRVictoryExpBack;

    function Window_RRVictoryExpFront() { this.initialize(...arguments); }
    Window_RRVictoryExpFront.prototype = Object.create(Window_RRVictoryExpBack.prototype);
    Window_RRVictoryExpFront.prototype.constructor = Window_RRVictoryExpFront;
    Window_RRVictoryExpFront.prototype.initialize = function(rect) {
        Window_RRVictoryExpBack.prototype.initialize.call(this, rect);
        this.backOpacity = 0;
        this._rrTicks = 0;
        this._rrCounter = 30;
        this.contents.fontSize = fontSize(FONT_EXP);
    };
    Window_RRVictoryExpFront.prototype.update = function() {
        Window_RRVictoryExpBack.prototype.update.call(this);
        this.rrUpdateTick();
    };
    // After 30 frames open, a tick every 4 frames until the ticks run out or every member's gauge is full.
    Window_RRVictoryExpFront.prototype.rrUpdateTick = function() {
        if (!this.isOpen() || !this.visible || this.rrCompleteTicks()) return;
        this._rrCounter--;
        if (this._rrCounter > 0 || this._rrTicks >= EXP_TICKS) return;
        playSe(VICTORY_TICK);
        this._rrCounter = 4;
        this._rrTicks++;
        this.refresh();
    };
    Window_RRVictoryExpFront.prototype.rrExpRate = function(actor) {
        const bonus = Math.floor(this.rrActorExpGain(actor) * this._rrTicks / EXP_TICKS);
        const now = actor.currentExp() - actor.currentLevelExp() + bonus;
        return now / (actor.nextLevelExp() - actor.currentLevelExp());
    };
    Window_RRVictoryExpFront.prototype.rrCompleteTicks = function() {
        return $gameParty.battleMembers().every(actor => this.rrExpRate(actor) >= 1);
    };
    Window_RRVictoryExpFront.prototype.drawItem = function(index) {
        const actor = $gameParty.battleMembers()[index];
        if (!actor) return;
        this.rrDrawExpGauge(actor, this.itemRect(index), actor.isMaxLevel() ? 1 : this.rrExpRate(actor));
    };
    Window_RRVictoryExpFront.prototype.rrDrawExpGauge = function(actor, rect, rate) {
        rate = Math.max(Math.min(rate, 1), 0);
        const dw = Math.min(rect.width, FACE);
        const dx = Math.floor((rect.width - dw) / 2) + rect.x, dy = rect.y + this.lineHeight() * 2 + FACE;
        const full = rate >= 1;
        const c1 = ColorManager.textColor(full ? LEVEL_GAUGE1 : EXP_GAUGE1), c2 = ColorManager.textColor(full ? LEVEL_GAUGE2 : EXP_GAUGE2);
        this.rrAceGauge(dx, dy, dw, rate, c1, c2);
        const percent = Math.min(rate * 100, 100);
        let text = sprintf(EXP_PERCENT, percent);
        if (percent === 100) text = actor.isMaxLevel() ? MAX_LVL_TEXT : LEVELUP_TEXT;
        this.drawText(text, dx, dy, dw, 'center');
    };
    window.Window_RRVictoryExpFront = Window_RRVictoryExpFront;

    //-------------------------------------------------------------------------
    // Level up: face and EXP, level and base parameters before → after, the new skills' title
    //-------------------------------------------------------------------------
    function Window_RRVictoryLevelUp() { this.initialize(...arguments); }
    Window_RRVictoryLevelUp.prototype = Object.create(Window_Base.prototype);
    Window_RRVictoryLevelUp.prototype.constructor = Window_RRVictoryLevelUp;
    Window_RRVictoryLevelUp.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this._rrAfter = this._rrBefore = null;
        this.hide();
    };
    /** after and before are snapshots of the actor; plays the level-up sound. */
    Window_RRVictoryLevelUp.prototype.refresh = function(after, before) {
        this._rrAfter = after;
        this._rrBefore = before;
        playSe(LEVEL_SOUND);
        this.rrVaRedraw();
    };
    Window_RRVictoryLevelUp.prototype.rrVaRedraw = function() {
        const a = this._rrAfter, b = this._rrBefore;
        this.contents.clear();
        this.resetFontSettings();
        if (!a || !b) return;
        const lh = this.lineHeight(), cw = this.innerWidth;
        const dx = Math.floor(cw / 16);
        // The actor
        this.drawText(a.name, dx, lh, FACE, 'center');
        drawFace(this, a.faceName, a.faceIndex, dx, lh * 2, FACE);
        this.changeTextColor(ColorManager.powerUpColor());
        this.contents.fontSize = fontSize(FONT_EXP);
        this.drawText(sprintf(VICTORY_EXP, group(this, a.exp - b.exp)), 0, lh * 2 + FACE, dx + FACE, 'right');
        this.resetFontSettings();
        // Names
        const nx = dx + 108;
        this.changeTextColor(ColorManager.systemColor());
        this.drawText(TextManager.level, nx, 0, cw - nx);
        for (let i = 0; i < 8; i++) this.drawText(TextManager.param(i), nx, lh * (i + 1), cw - nx);
        // Before, right-aligned to the arrows
        const half = Math.floor(cw / 2);
        this.changeTextColor(ColorManager.normalColor());
        this.drawText(group(this, b.level), 0, 0, half - 12, 'right');
        for (let i = 0; i < 8; i++) this.drawText(group(this, b.params[i]), 0, lh * (i + 1), half - 12, 'right');
        this.changeTextColor(ColorManager.systemColor());
        for (let i = 0; i <= 8; i++) this.drawText('→', half - 12, lh * i, 24, 'center');
        // After, coloured by the change
        this.changeTextColor(ColorManager.paramchangeTextColor(a.level - b.level));
        this.drawText(group(this, a.level), half + 12, 0, cw - half - 12);
        for (let i = 0; i < 8; i++) {
            this.changeTextColor(ColorManager.paramchangeTextColor(a.params[i] - b.params[i]));
            this.drawText(group(this, a.params[i]), half + 12, lh * (i + 1), cw - half - 12);
        }
        if (b.skills.length !== a.skills.length) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(SKILLS_TEXT, cw - 196, 0, 196);
        }
    };
    window.Window_RRVictoryLevelUp = Window_RRVictoryLevelUp;

    // The skills learned, frameless, under the title; more than eight can be scrolled.
    function Window_RRVictorySkills() { this.initialize(...arguments); }
    Window_RRVictorySkills.prototype = Object.create(Window_Selectable.prototype);
    Window_RRVictorySkills.prototype.constructor = Window_RRVictorySkills;
    Window_RRVictorySkills.prototype.initialize = function(rect) {
        this._data = [];
        Window_Selectable.prototype.initialize.call(this, rect);
        this.opacity = 0;
        this.hide();
    };
    Window_RRVictorySkills.prototype.maxItems = function() { return this._data ? this._data.length : 0; };
    Window_RRVictorySkills.prototype.drawItemBackground = function() {};
    // A list only when the number of skills changed.
    Window_RRVictorySkills.prototype.rrShow = function(after, before) {
        this._data = after.skills.length === before.skills.length ? [] : after.skills.filter(s => !before.skills.includes(s));
        if (this._data.length > 8) {
            this.select(0);
            this.activate();
        } else {
            this.deselect();
            this.deactivate();
        }
        this.refresh();
    };
    Window_RRVictorySkills.prototype.drawItem = function(index) {
        const skill = this._data[index];
        if (!skill) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.rrAceDrawItemName(skill, rect.x, rect.y, true);
    };
    window.Window_RRVictorySkills = Window_RRVictorySkills;

    //-------------------------------------------------------------------------
    // Spoils: the gold first, then the drops grouped (items, weapons, armors, each by id), two columns
    //-------------------------------------------------------------------------
    function Window_RRVictorySpoils() { this.initialize(...arguments); }
    Window_RRVictorySpoils.prototype = Object.create(Window_Selectable.prototype);
    Window_RRVictorySpoils.prototype.constructor = Window_RRVictorySpoils;
    Window_RRVictorySpoils.prototype.initialize = function(rect) {
        this._data = [];
        this._rrGoods = new Map();
        this._rrGold = 0;
        Window_Selectable.prototype.initialize.call(this, rect);
        this.hide();
    };
    Window_RRVictorySpoils.prototype.maxCols = function() { return 2; };
    Window_RRVictorySpoils.prototype.maxItems = function() { return this._data.length; };
    Window_RRVictorySpoils.prototype.drawItemBackground = function() {};
    Window_RRVictorySpoils.prototype.rrMake = function(gold, drops) {
        this._rrGold = gold;
        this._rrGoods = new Map();
        for (const item of drops) if (item) this._rrGoods.set(item, (this._rrGoods.get(item) || 0) + 1);
        const kinds = [DataManager.isItem, DataManager.isWeapon, DataManager.isArmor].map(is => [...this._rrGoods.keys()].filter(i => is.call(DataManager, i)).sort((a, b) => a.id - b.id));
        this._data = [null, ...kinds.flat()];
        this.refresh();
        this.select(0);
        this.activate();
    };
    Window_RRVictorySpoils.prototype.drawItem = function(index) {
        const item = this._data[index];
        const rect = this.itemRect(index);
        this.resetFontSettings();
        if (!item) {
            this.rrAceDrawCurrencyValue(this._rrGold, TextManager.currencyUnit, rect.x, rect.y, rect.width);
            return;
        }
        rect.width -= 4;
        this.rrAceDrawItemName(item, rect.x, rect.y, true, rect.width - 24);
        this.rrDrawItemNumber(rect, item);
    };
    // With Adjust Limits the game's own count drawing (its font and prefix) shows the number dropped; else ":n".
    Window_RRVictorySpoils.prototype.rrDrawItemNumber = function(rect, item) {
        const count = this._rrGoods.get(item) || 0;
        if (!hasPlugin('RR_YanflyAdjustLimits')) {
            this.drawText(':' + group(this, count), rect.x, rect.y, rect.width, 'right');
            return;
        }
        const party = $gameParty;
        party.numItems = () => count;
        try { this.rrAceDrawItemNumber(rect, item); } finally { delete party.numItems; }
    };
    window.Window_RRVictorySpoils = Window_RRVictorySpoils;

    //-------------------------------------------------------------------------
    // Battle screen: the windows over the battle, above the message window
    //-------------------------------------------------------------------------
    const SB = Scene_Battle.prototype;
    const _createAllWindows = SB.createAllWindows;
    SB.createAllWindows = function() {
        _createAllWindows.call(this);
        this.rrCreateVictoryAftermathWindows();
    };
    SB.rrCreateVictoryAftermathWindows = function() {
        const w = Graphics.boxWidth, h = Graphics.boxHeight, fit = (n) => this.calcWindowHeight(n, false);
        const body = () => new Rectangle(0, fit(1), w, h - fit(4) - fit(1));
        this._rrVictoryTitle = new Window_RRVictoryTitle(new Rectangle(0, 0, w, fit(1)));
        this._rrVictoryExpBack = new Window_RRVictoryExpBack(body());
        this._rrVictoryExpFront = new Window_RRVictoryExpFront(body());
        this._rrVictoryLevel = new Window_RRVictoryLevelUp(body());
        this._rrVictorySkills = new Window_RRVictorySkills(new Rectangle(w - 220, fit(1) + 24, 220, h - fit(4) - fit(1) - 24));
        this._rrVictorySpoils = new Window_RRVictorySpoils(body());
        for (const win of this.rrVictoryWindows()) this.addWindow(win);
        for (const actor of $gameParty.allMembers()) ImageManager.loadFace(actor.faceName());
    };
    SB.rrVictoryWindows = function() {
        return [this._rrVictoryTitle, this._rrVictoryExpBack, this._rrVictoryExpFront, this._rrVictoryLevel, this._rrVictorySkills, this._rrVictorySpoils];
    };
    SB.rrShowVictoryDisplayExp = function() {
        this._rrVictoryTitle.open();
        const members = $gameParty.battleMembers();
        let name = members[0] ? members[0].name() : '';
        if (members.length > 1) name = sprintf(TOP_TEAM, name);
        this._rrVictoryTitle.refresh(sprintf(TOP_VICTORY, name));
        this._rrVictoryExpBack.open();
        this._rrVictoryExpBack.refresh();
        this._rrVictoryExpFront.open();
        this._rrVictoryExpFront.refresh();
    };
    SB.rrShowVictoryLevelUp = function(after, before, title = sprintf(TOP_LEVEL_UP, after.name)) {
        this._rrVictoryExpBack.hide();
        this._rrVictoryExpFront.hide();
        this._rrVictoryTitle.refresh(title);
        this._rrVictoryLevel.show();
        this._rrVictoryLevel.refresh(after, before);
        this._rrVictorySkills.show();
        this._rrVictorySkills.rrShow(after, before);
    };
    SB.rrShowVictorySpoils = function(gold, drops) {
        for (const win of [this._rrVictoryExpBack, this._rrVictoryExpFront, this._rrVictoryLevel, this._rrVictorySkills]) win.hide();
        this._rrVictoryTitle.refresh(TOP_SPOILS);
        this._rrVictorySpoils.show();
        this._rrVictorySpoils.rrMake(gold, drops);
    };
    SB.rrCloseVictoryWindows = function() {
        for (const win of this.rrVictoryWindows()) win.close();
    };

    //-------------------------------------------------------------------------
    // The victory: a queue of steps run while the battle's end phase waits.
    // Each step may show a message; the next runs once it is closed. Pages a
    // step adds (level ups, Equipment Learning) run right after it, in order.
    //-------------------------------------------------------------------------
    const BM = BattleManager;
    const skipAftermath = () => SKIP_SWITCH > 0 && $gameSwitches.value(SKIP_SWITCH);
    const skipMusic = () => SKIP_MUSIC > 0 && $gameSwitches.value(SKIP_MUSIC);

    BM.rrVictoryAftermathActive = function() { return !!this._rrVa; };
    /** Queues a page after the running step. */
    BM.rrVaPage = function(fn) {
        if (!this._rrVa) return;
        if (this._rrVa.pending) this._rrVa.pending.push(fn);
        else this._rrVa.steps.unshift(fn);
    };
    // The victory ME, and the victory BGM, which with no name stops the battle music.
    BM.rrVaPlayMusic = function() {
        if (skipMusic()) return;
        this.playVictoryMe();
        if (VICTORY_BGM.name) AudioManager.playBgm(Object.assign({ pos: 0 }, VICTORY_BGM));
        else AudioManager.stopBgm();
    };
    BM.rrSetVictoryText = function(actor, type) {
        if (!actor) return;
        const list = actor.rrVictoryQuotes(type);
        $gameMessage.setFaceImage(actor.faceName(), actor.faceIndex());
        $gameMessage.add(sprintf(HEADER, actor.name()) + list[Math.randomInt(list.length)] + FOOTER);
    };

    BM.processVictory = function() {
        if (this._rrVa) return;
        $gameParty.removeBattleStates();
        $gameParty.performVictory();
        this.cancelActorInput();
        this._inputting = false;
        this.makeRewards();
        const va = this._rrVa = { steps: [], pending: null, wait: 0, actor: null };
        if (skipAftermath()) {
            // Everyone gains straight away. Equipment Learning's points come with the screens' EXP step, so none here.
            va.steps.push(function() {
                for (const actor of $gameParty.allMembers()) actor.gainExp(this._rewards.exp);
                $gameParty.gainGold(this._rewards.gold);
                for (const item of this._rewards.items) $gameParty.gainItem(item, 1);
            });
        } else {
            this.rrVaPlayMusic();
            va.steps.push(
                function() {
                    const s = scene();
                    if (s) s.rrShowVictoryDisplayExp();
                    va.actor = $gameParty.randomTarget();
                    this.rrSetVictoryText(va.actor, 'win');
                },
                function() { this.gainExp(); },
                function() {
                    this.gainGold();
                    this.gainDropItems();
                }
            );
        }
        va.steps.push(
            function() {
                const s = scene();
                if (s) s.rrCloseVictoryWindows();
                va.wait = 16;
            },
            function() {
                this._rrVa = null;
                this.replayBgmAndBgs();
                this.endBattle(0);
            }
        );
        this._phase = 'battleEnd';
    };

    const _updateBattleEnd = BM.updateBattleEnd;
    BM.updateBattleEnd = function() {
        if (!this._rrVa) return _updateBattleEnd.call(this);
        this.rrUpdateVictoryAftermath();
    };
    BM.rrUpdateVictoryAftermath = function() {
        const va = this._rrVa;
        if (va.wait > 0) {
            va.wait--;
            return;
        }
        while (this._rrVa === va && va.steps.length) {
            const step = va.steps.shift();
            va.pending = [];
            step.call(this);
            va.steps.unshift(...va.pending);
            va.pending = null;
            if ($gameMessage.isBusy() || va.wait > 0) return;
        }
    };

    // Each member gains in turn; a level gained queues its page (with the actor as it was before and after).
    const _gainExp = BM.gainExp;
    BM.gainExp = function() {
        if (!this._rrVa) return _gainExp.call(this);
        const exp = this._rewards.exp;
        this._rrVaBefore = new Map();
        for (const actor of $gameParty.allMembers()) {
            const before = snapshot(actor);
            this._rrVaBefore.set(actor, before);
            actor.gainExp(exp);
            if (actor.level === before.level) continue;
            const after = snapshot(actor);
            this.rrVaPage(function() {
                const s = scene();
                if (s) s.rrShowVictoryLevelUp(after, before);
                this.rrSetVictoryText(actor, 'level');
            });
        }
    };
    // Equipment Learning: a member whose skills changed over the reward gets the level page under its title.
    BM.rrShowVictoryElLearn = function(actor, beforeSkillIds, learned) {
        if (!this._rrVa) return;
        const kept = this._rrVaBefore && this._rrVaBefore.get(actor);
        const before = kept || Object.assign(snapshot(actor), { skills: (beforeSkillIds || []).map(id => $dataSkills[id]).filter(Boolean) });
        const after = snapshot(actor);
        const format = window.RRYamiEquipLearning ? window.RRYamiEquipLearning.learnFormat : '%s has unlocked new Equip Skills!';
        this.rrVaPage(function() {
            const s = scene();
            if (s) s.rrShowVictoryLevelUp(after, before, sprintf(format, actor.name()));
            this.rrSetVictoryText(actor, 'el_learn');
        });
    };
    const _gainDropItems = BM.gainDropItems;
    BM.gainDropItems = function() {
        if (!this._rrVa) return _gainDropItems.call(this);
        const drops = [];
        for (const item of this._rewards.items) {
            $gameParty.gainItem(item, 1);
            drops.push(item);
        }
        const gold = this._rewards.gold, va = this._rrVa;
        this.rrVaPage(function() {
            const s = scene();
            if (s) s.rrShowVictorySpoils(gold, drops);
            this.rrSetVictoryText(va.actor, 'drops');
        });
    };

    const _setup = BM.setup;
    BM.setup = function() {
        this._rrVa = null;
        this._rrVaBefore = null;
        _setup.apply(this, arguments);
    };
    // The common event is reserved after every battle but a defeat.
    const _endBattle = BM.endBattle;
    BM.endBattle = function(result) {
        _endBattle.call(this, result);
        if (result !== 2 && COMMON_EVENT > 0) $gameTemp.reserveCommonEvent(COMMON_EVENT);
    };
})();
