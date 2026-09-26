/*:
 * @target MZ
 * @plugindesc CSCA Achievements (VX Ace), for imported games
 * @author Casper Gaming; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CscaAchievements.js
 *
 * A list of achievements, each earned by a script call or, when it tracks
 * progress (a variable, items held, quests completed …), on the map as soon
 * as the progress reaches its goal. Earning one pays its reward, plays the
 * sound and fades a notice in over the map for a few seconds (the last one
 * earned, when several come at once). The achievements screen lists them on
 * the left, with the chosen one's description, progress bar and reward on the
 * right and the number unlocked at the bottom.
 *
 * Earning an achievement again pays its reward and counts it again; the
 * original did not check.
 *
 * Script calls (the import writes them from the game's Ruby):
 *   this.rrCscaEarnAchievement("symbol")
 *   SceneManager.push(Scene_RRCscaAchievements)
 *   $gameSystem.rrCsca().achievementsEarned, .achievementTotalPoints
 *
 * Progress read from other CSCA scripts the port does not have (encyclopedia,
 * professions, crafting, gathering, currencies) counts as 0.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param achievements
 * @type multiline_string
 * @default []
 * @desc JSON: [{ symbol, name, nameBeforeUnlock, description: [lines], descriptionBeforeUnlock, progress: { id, upper, description, type }, reward: { amount, id, type }, graphic, points, completeIcon, incompleteIcon }].
 *
 * @param header
 * @default Achievements
 *
 * @param totalText
 * @default Total Achievements Unlocked:
 *
 * @param pointsText
 * @default Score:
 *
 * @param progressText
 * @default Progress:
 *
 * @param rewardText
 * @default Reward:
 *
 * @param unlockedText
 * @default Achievement Unlocked!
 *
 * @param usePoints
 * @type boolean
 * @default true
 *
 * @param numbered
 * @text Number the list
 * @type boolean
 * @default false
 * @desc Off: each row shows the achievement's icon.
 *
 * @param center
 * @text Centre the description
 * @type boolean
 * @default false
 *
 * @param stopTrack
 * @text Full bar once earned
 * @type boolean
 * @default true
 *
 * @param color1
 * @type number
 * @default 26
 *
 * @param color2
 * @type number
 * @default 27
 *
 * @param sound
 * @desc Sound effect played at volume 80 when an achievement is earned; empty for none.
 *
 * @param popAlign
 * @text Notice position
 * @type select
 * @option top
 * @option middle
 * @option bottom
 * @option none
 * @value
 * @default middle
 *
 * @param extraStats
 * @type multiline_string
 * @default {}
 * @desc JSON: variable IDs the CSCA Extra Stats progress types read ({ loot, dtake, ddeal, gspend, gearn, iuse, ibuy, isell }).
 *
 * @param rgssFontSize
 * @text Game's RGSS font size
 * @type number
 * @default 24
 * @desc The progress lines' size-20 text is drawn in proportion to it.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_CscaAchievements');
    const json = (text, fallback) => { try { return JSON.parse(text || '') ?? fallback; } catch (_) { return fallback; } };
    const LIST = [].concat(json(params.achievements, [])).filter(a => a && typeof a === 'object');
    const EXTRA = json(params.extraStats, {}) || {};
    const TEXT = {
        header: String(params.header ?? 'Achievements'), total: String(params.totalText ?? ''), points: String(params.pointsText ?? ''),
        progress: String(params.progressText ?? ''), reward: String(params.rewardText ?? ''), unlocked: String(params.unlockedText ?? '')
    };
    const USE_POINTS = String(params.usePoints) !== 'false';
    const NUMBERED = String(params.numbered) === 'true';
    const CENTER = String(params.center) === 'true';
    const STOP_TRACK = String(params.stopTrack) !== 'false';
    const COLOR1 = Number(params.color1) || 0, COLOR2 = Number(params.color2) || 0;
    const SOUND = String(params.sound || '');
    const POP_ALIGN = ['top', 'middle', 'bottom'].includes(params.popAlign) ? params.popAlign : '';
    const RGSS_SIZE = Number(params.rgssFontSize) || 24;

    //-------------------------------------------------------------------------
    // $csca's achievement records: which are earned, and the running totals
    //-------------------------------------------------------------------------
    const state = () => {
        const csca = $gameSystem.rrCsca ? $gameSystem.rrCsca() : ($gameSystem._rrCsca = $gameSystem._rrCsca || {});
        if (!csca.achievements) Object.assign(csca, { achievements: {}, achievementsEarned: 0, achievementTotalPoints: 0 });
        return csca;
    };
    const find = (symbol) => LIST.find(a => a.symbol === String(symbol)) || null;
    const earned = (a) => !!(a && state().achievements[a.symbol]);

    const table = (type) => ({ item: $dataItems, weapon: $dataWeapons, armor: $dataArmors })[type];
    const payReward = (r) => {
        if (r.type === 'gold') $gameParty.gainGold(Number(r.amount) || 0);
        else if (table(r.type)) $gameParty.gainItem(table(r.type)[Number(r.id)], Number(r.amount) || 0);
    };
    const earn = (a) => {
        const s = state();
        s.achievements[a.symbol] = true;
        if (a.reward) payReward(a.reward);
        if (SOUND) AudioManager.playSe({ name: SOUND, volume: 80, pitch: 100, pan: 0 });
        s.achievementsEarned = (s.achievementsEarned || 0) + 1;
        s.achievementTotalPoints = (s.achievementTotalPoints || 0) + (Number(a.points) || 0);
        $gameMap._rrAchEarned = true;
        $gameMap._rrAchDisplay = a.symbol;
    };

    const variable = (id) => $gameVariables.value(Number(id) || 0);
    // The progress value toward the goal.
    const numerator = (a) => {
        const p = a.progress, id = p.id;
        switch (p.type) {
            case 'var': return variable(id);
            case 'item': case 'weapon': case 'armor': return $gameParty.numItems(table(p.type)[Number(id)]);
            case 'gold': return $gameParty.gold();
            case 'step': return $gameParty.steps();
            case 'save': return $gameSystem.saveCount();
            case 'battle': return $gameSystem.battleCount();
            case 'playtime': return $gameSystem.playtime();
            case 'loot': case 'dtake': case 'ddeal': case 'gspend': case 'gearn': case 'iuse': case 'ibuy': case 'isell': return variable(EXTRA[p.type]);
            case 'acht': return state().achievementsEarned || 0;
            case 'achpt': return state().achievementTotalPoints || 0;
            case 'qamt': { const q = state().questInfo; return q ? q.completed || 0 : 0; }
            // A quest counts when the quest log lists it as completed (a failed one is listed false).
            case 'sqc': { const list = (state().questInfo || {}).list || {}; return [].concat(id).filter(k => list[k] === true).length; }
            default: return 0;
        }
    };
    const complete = (a) => {
        const upper = Number(a.progress.upper) || 0;
        return upper > 0 && numerator(a) / upper >= 1;
    };

    Game_Interpreter.prototype.rrCscaEarnAchievement = function(symbol) {
        const a = find(symbol);
        if (a) earn(a);
    };

    // Before the map's own update each frame, every unearned achievement with progress is checked.
    const _mapUpdate = Game_Map.prototype.update;
    Game_Map.prototype.update = function(sceneActive) {
        for (const a of LIST) if (a.progress && !earned(a) && complete(a)) earn(a);
        _mapUpdate.call(this, sceneActive);
    };

    //-------------------------------------------------------------------------
    // The notice over the map
    //-------------------------------------------------------------------------
    const rgssSize = (size) => $gameSystem.mainFontSize() * size / RGSS_SIZE;
    const display = () => find($gameMap && $gameMap._rrAchDisplay);
    const rewardText = (r) => {
        if (r.type === 'gold') return TextManager.currencyUnit;
        const t = table(r.type), item = t && t[Number(r.id)];
        return ' ' + (item ? item.name : '');
    };

    function Window_RRCscaAchievementPop() { this.initialize(...arguments); }
    Window_RRCscaAchievementPop.prototype = Object.create(Window_Base.prototype);
    Window_RRCscaAchievementPop.prototype.constructor = Window_RRCscaAchievementPop;
    Window_RRCscaAchievementPop.prototype.initialize = function() {
        const fit = (n) => n * 24 + $gameSystem.windowPadding() * 2;
        const gw = Graphics.boxWidth, gh = Graphics.boxHeight, w = 272, h = fit(3);
        const y = POP_ALIGN === 'bottom' ? gh - h : POP_ALIGN === 'top' ? 0 : Math.floor(gh / 2) - fit(1);
        Window_Base.prototype.initialize.call(this, new Rectangle(Math.floor(gw / 4), y, w, h));
        this.opacity = 0;
        this.contentsOpacity = 0;
        this._showCount = 0;
        this.refresh();
    };
    Window_RRCscaAchievementPop.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        const a = display();
        // A notice drawn from a picture keeps the window frame hidden.
        const frame = a && !a.graphic ? 16 : 0;
        if (this._showCount > 0) {
            this.opacity += frame;
            this.contentsOpacity += 16;
            this._showCount--;
        } else {
            this.opacity -= frame;
            this.contentsOpacity -= 16;
        }
    };
    Window_RRCscaAchievementPop.prototype.rrShow = function() {
        this.refresh();
        this._showCount = 150;
        this.contentsOpacity = 0;
        this.opacity = 0;
    };
    Window_RRCscaAchievementPop.prototype.refresh = function() {
        this.contents.clear();
        const a = display();
        if (!a) return;
        const w = this.innerWidth, lh = this.lineHeight();
        if (a.graphic) {
            const bitmap = ImageManager.loadPicture(a.graphic);
            bitmap.addLoadListener(() => { if (display() === a) this.contents.blt(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, w, this.innerHeight); });
            return;
        }
        this.contents.fontBold = true;
        this.drawText(TEXT.unlocked, 0, 0, w, 'center');
        this.contents.fontBold = false;
        this.drawText(a.name, 0, lh, w, 'center');
        if (a.reward) this.drawText(TEXT.reward + a.reward.amount + rewardText(a.reward), 0, lh * 2, w, 'center');
    };

    // Above the toasts, as the original's z of 1001 put it.
    const _mapStart = Scene_Map.prototype.start;
    Scene_Map.prototype.start = function() {
        _mapStart.call(this);
        if (!POP_ALIGN) return;
        this._rrAchievementWindow = new Window_RRCscaAchievementPop();
        this.addChild(this._rrAchievementWindow);
    };
    const _sceneMapUpdate = Scene_Map.prototype.update;
    Scene_Map.prototype.update = function() {
        _sceneMapUpdate.call(this);
        if ($gameMap._rrAchEarned) {
            if (this._rrAchievementWindow) this._rrAchievementWindow.rrShow();
            $gameMap._rrAchEarned = false;
        }
    };

    //-------------------------------------------------------------------------
    // The achievements screen
    //-------------------------------------------------------------------------
    function Window_RRCscaAchievementHeader() { this.initialize(...arguments); }
    Window_RRCscaAchievementHeader.prototype = Object.create(Window_Base.prototype);
    Window_RRCscaAchievementHeader.prototype.constructor = Window_RRCscaAchievementHeader;
    Window_RRCscaAchievementHeader.prototype.initialize = function(rect, text) {
        Window_Base.prototype.initialize.call(this, rect);
        this.drawText(text, 0, 0, this.innerWidth, 'center');
    };

    function Window_RRCscaAchievementList() { this.initialize(...arguments); }
    Window_RRCscaAchievementList.prototype = Object.create(Window_Selectable.prototype);
    Window_RRCscaAchievementList.prototype.constructor = Window_RRCscaAchievementList;
    Window_RRCscaAchievementList.prototype.maxItems = function() { return LIST.length; };
    Window_RRCscaAchievementList.prototype.item = function() { return LIST[this.index()] || null; };
    Window_RRCscaAchievementList.prototype.drawItem = function(index) {
        const a = LIST[index];
        if (!a) return;
        const rect = this.itemRect(index), done = earned(a);
        this.resetTextColor();
        if (NUMBERED) this.drawText(String(index + 1).padStart(2, ' ') + '.', rect.x, rect.y, rect.width);
        else this.drawIcon(done ? a.completeIcon : a.incompleteIcon, rect.x + 5, rect.y);
        const name = done || a.nameBeforeUnlock === null || a.nameBeforeUnlock === undefined ? a.name : a.nameBeforeUnlock;
        this.drawText(name, rect.x + 32, rect.y, this.innerWidth - 40);
    };
    Window_RRCscaAchievementList.prototype.updateHelp = function() {
        if (this._helpWindow) this._helpWindow.setItem(this.item());
    };

    function Window_RRCscaAchievementInfo() { this.initialize(...arguments); }
    Window_RRCscaAchievementInfo.prototype = Object.create(Window_Base.prototype);
    Window_RRCscaAchievementInfo.prototype.constructor = Window_RRCscaAchievementInfo;
    Window_RRCscaAchievementInfo.prototype.setItem = function(a) {
        this.contents.clear();
        this.resetFontSettings();
        if (!a) return;
        const w = this.innerWidth, lh = this.lineHeight();
        const done = earned(a);
        const lines = done || !a.descriptionBeforeUnlock ? a.description : a.descriptionBeforeUnlock;
        (lines || []).forEach((line, i) => this.drawText(String(line), 0, lh * i, w, CENTER ? 'center' : 'left'));
        if (a.progress) this.drawProgress(lh * 8, w, a, done);
        if (USE_POINTS) this.drawText(TEXT.points + a.points, 0, lh * 11 - 12, w);
        if (a.reward) this.drawReward(lh * 12 - 12, w, a.reward);
    };
    Window_RRCscaAchievementInfo.prototype.drawProgress = function(y, w, a, done) {
        const lh = this.lineHeight();
        const c1 = ColorManager.textColor(COLOR1), c2 = ColorManager.textColor(COLOR2);
        this.contents.fontSize = rgssSize(20);
        this.drawText(TEXT.progress, 0, y, w, 'center');
        const upper = Number(a.progress.upper) || 0;
        if (done && STOP_TRACK) {
            this.rrAceGauge(0, y + lh - 8, w, 1, c1, c2);
            this.drawText(upper + '/' + upper, 0, y + lh - 4, w, 'center');
        } else {
            const n = numerator(a);
            this.rrAceGauge(0, y + lh - 8, w, upper ? Math.max(n / upper, 0) : 0, c1, c2);
            this.drawText(n + '/' + upper, 0, y + lh - 4, w, 'center');
        }
        this.drawText(a.progress.description, 0, y + lh * 2 - 12, w, 'center');
        this.contents.fontSize = rgssSize(RGSS_SIZE);
    };
    Window_RRCscaAchievementInfo.prototype.drawReward = function(y, w, r) {
        this.drawText(TEXT.reward, 0, y, w);
        const x = this.textWidth(TEXT.reward);
        this.drawText(r.amount + rewardText(r), x, y, w);
    };

    function Window_RRCscaAchievementTotals() { this.initialize(...arguments); }
    Window_RRCscaAchievementTotals.prototype = Object.create(Window_Base.prototype);
    Window_RRCscaAchievementTotals.prototype.constructor = Window_RRCscaAchievementTotals;
    Window_RRCscaAchievementTotals.prototype.initialize = function(rect) {
        Window_Base.prototype.initialize.call(this, rect);
        this.refresh();
    };
    Window_RRCscaAchievementTotals.prototype.refresh = function() {
        this.contents.clear();
        let unlocked = 0, points = 0, total = 0;
        for (const a of LIST) {
            if (earned(a)) { unlocked++; points += Number(a.points) || 0; }
            total += Number(a.points) || 0;
        }
        const s1 = TEXT.total + unlocked + '/' + LIST.length, s2 = TEXT.points + points + '/' + total;
        this.drawText(USE_POINTS ? s1 + '     ' + s2 : s1, 0, 0, this.innerWidth, 'center');
    };

    function Scene_RRCscaAchievements() { this.initialize(...arguments); }
    Scene_RRCscaAchievements.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRCscaAchievements.prototype.constructor = Scene_RRCscaAchievements;
    window.Scene_RRCscaAchievements = Scene_RRCscaAchievements;

    Scene_RRCscaAchievements.prototype.createBackground = function() {
        Scene_MenuBase.prototype.createBackground.call(this);
        // The original greys the map behind it (tone gray 128).
        if (this._backgroundSprite) this._backgroundSprite.setColorTone([0, 0, 0, 128]);
    };
    Scene_RRCscaAchievements.prototype.helpAreaHeight = function() { return 0; };
    Scene_RRCscaAchievements.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        const gw = Graphics.boxWidth, gh = Graphics.boxHeight;
        const headH = 48, half = Math.floor(gw / 2), bodyH = gh - headH - 48;
        this._headWindow = new Window_RRCscaAchievementHeader(new Rectangle(0, 0, gw, headH), TEXT.header);
        this.addWindow(this._headWindow);
        this._infoWindow = new Window_RRCscaAchievementInfo(new Rectangle(half, headH, half, bodyH));
        this.addWindow(this._infoWindow);
        this._listWindow = new Window_RRCscaAchievementList(new Rectangle(0, headH, half, bodyH));
        this._listWindow.refresh();
        this._listWindow.select(0);
        this._listWindow.setHelpWindow(this._infoWindow);
        this._listWindow.setHandler('cancel', this.popScene.bind(this));
        this._listWindow.activate();
        this.addWindow(this._listWindow);
        this._totalsWindow = new Window_RRCscaAchievementTotals(new Rectangle(0, headH + bodyH, gw, gh - headH - bodyH));
        this.addWindow(this._totalsWindow);
    };
})();
