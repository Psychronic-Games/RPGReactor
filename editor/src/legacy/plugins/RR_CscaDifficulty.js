/*:
 * @target MZ
 * @plugindesc CSCA Difficulty System (VX Ace), for imported games
 * @author Casper Gaming; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CscaDifficulty.js
 *
 * A difficulty chosen on its own scene changes the experience and gold a
 * battle gives and enemy stats (HP and MP too when Modify HP and MP is on).
 * The original also lists an encounter rate, which it never applied; neither
 * does this.
 *
 * Script calls (the import writes them from the game's Ruby):
 *   SceneManager.push(Scene_RRCscaDifficulty)   open the selection
 *   $gameSystem.rrCsca().difficulty             0-based index chosen
 *   $gameSystem.rrCsca().setDifficulty(n)
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param header
 * @default Difficulty Selection
 *
 * @param encrateText
 * @default Encounter Rate:
 *
 * @param enemyStatsText
 * @default Enemy Stats:
 *
 * @param enemyExpText
 * @default EXP Bonus:
 *
 * @param enemyGoldText
 * @default Gold Bonus:
 *
 * @param modifyHpMp
 * @text Modify HP and MP
 * @type boolean
 * @default false
 *
 * @param difficulties
 * @type multiline_string
 * @default []
 * @desc JSON: [{"name","enemyexp","enemygold","encrate","enemystats","descr":[lines]}], percentages.
 *
 * @param showEncounterRate
 * @text Show the encounter rate
 * @type boolean
 * @default true
 * @desc Off when the game carried the "Hide Encounter Rate" add-on, which drops that line and moves the rest up.
 *
 * @param rgssFontSize
 * @text Game's RGSS font size
 * @type number
 * @default 24
 * @desc The info panel's size-20 text is drawn in proportion to it.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_CscaDifficulty');
    let DIFFICULTIES = [];
    try { DIFFICULTIES = JSON.parse(params.difficulties || '[]'); } catch (_) { DIFFICULTIES = []; }
    if (!Array.isArray(DIFFICULTIES) || !DIFFICULTIES.length) DIFFICULTIES = [{ name: 'Normal', enemyexp: 100, enemygold: 100, encrate: 100, enemystats: 100, descr: [] }];
    const TEXT = {
        header: String(params.header ?? 'Difficulty Selection'), encrate: String(params.encrateText ?? ''),
        stats: String(params.enemyStatsText ?? ''), exp: String(params.enemyExpText ?? ''), gold: String(params.enemyGoldText ?? '')
    };
    const MODIFY_HPMP = String(params.modifyHpMp) === 'true';
    const RGSS_SIZE = Number(params.rgssFontSize) || 24;
    const SHOW_ENCRATE = String(params.showEncounterRate) !== 'false';

    //-------------------------------------------------------------------------
    // $csca, the CSCA scripts' saved object
    //-------------------------------------------------------------------------
    const base = Game_System.prototype.rrCsca || function() {
        if (!this._rrCsca) this._rrCsca = {};
        return this._rrCsca;
    };
    Game_System.prototype.rrCsca = function() {
        const csca = base.call(this);
        if (csca.difficulty === undefined) Object.assign(csca, { difficulty: 0, d_enemyexp: 100, d_enemygold: 100, d_encrate: 100, d_enemystats: 100 });
        // A method, not saved: a loaded game's object gets it back here.
        if (!csca.setDifficulty) {
            Object.defineProperty(csca, 'setDifficulty', {
                enumerable: false, configurable: true,
                value(index) {
                    const modifier = DIFFICULTIES[index] || DIFFICULTIES[0];
                    Object.assign(this, { difficulty: index, d_enemyexp: modifier.enemyexp, d_enemygold: modifier.enemygold, d_encrate: modifier.encrate, d_enemystats: modifier.enemystats });
                }
            });
        }
        return csca;
    };
    const state = () => $gameSystem.rrCsca();

    //-------------------------------------------------------------------------
    // Effects
    //-------------------------------------------------------------------------
    const _expTotal = Game_Troop.prototype.expTotal;
    Game_Troop.prototype.expTotal = function() {
        return Math.trunc(_expTotal.call(this) * (state().d_enemyexp / 100));
    };
    const _goldTotal = Game_Troop.prototype.goldTotal;
    Game_Troop.prototype.goldTotal = function() {
        return Math.trunc(_goldTotal.call(this) * (state().d_enemygold / 100));
    };
    const _paramBase = Game_Enemy.prototype.paramBase;
    Game_Enemy.prototype.paramBase = function(paramId) {
        if ((paramId === 0 || paramId === 1) && !MODIFY_HPMP) return this.enemy().params[paramId];
        return Math.trunc(_paramBase.call(this, paramId) * (state().d_enemystats / 100));
    };

    //-------------------------------------------------------------------------
    // The selection scene
    //-------------------------------------------------------------------------
    function Window_RRCscaHeader() { this.initialize(...arguments); }
    Window_RRCscaHeader.prototype = Object.create(Window_Base.prototype);
    Window_RRCscaHeader.prototype.constructor = Window_RRCscaHeader;
    Window_RRCscaHeader.prototype.initialize = function(rect, text) {
        Window_Base.prototype.initialize.call(this, rect);
        this.drawText(text, 0, 0, this.innerWidth, 'center');
    };

    function Window_RRCscaDifficultyList() { this.initialize(...arguments); }
    Window_RRCscaDifficultyList.prototype = Object.create(Window_Selectable.prototype);
    Window_RRCscaDifficultyList.prototype.constructor = Window_RRCscaDifficultyList;
    Window_RRCscaDifficultyList.prototype.maxItems = function() { return DIFFICULTIES.length; };
    Window_RRCscaDifficultyList.prototype.drawItem = function(index) {
        const rect = this.itemRect(index);
        this.resetTextColor();
        this.drawText(String(DIFFICULTIES[index].name || ''), rect.x, rect.y, this.innerWidth, 'left');
    };
    Window_RRCscaDifficultyList.prototype.updateHelp = function() {
        if (this._helpWindow) this._helpWindow.setItem(this.index());
    };

    function Window_RRCscaDifficultyInfo() { this.initialize(...arguments); }
    Window_RRCscaDifficultyInfo.prototype = Object.create(Window_Base.prototype);
    Window_RRCscaDifficultyInfo.prototype.constructor = Window_RRCscaDifficultyInfo;
    Window_RRCscaDifficultyInfo.prototype.setItem = function(index) {
        this.contents.clear();
        this.resetFontSettings();
        const d = DIFFICULTIES[index];
        if (!d) return;
        const w = this.innerWidth, h = this.lineHeight();
        this.contents.fontBold = true;
        this.drawText(String(d.name || ''), 0, 0, w, 'center');
        this.contents.fontBold = false;
        this.contents.fontSize = $gameSystem.mainFontSize() * 20 / RGSS_SIZE;
        const rows = [[TEXT.stats, d.enemystats], [TEXT.exp, d.enemyexp], [TEXT.gold, d.enemygold]];
        if (SHOW_ENCRATE) rows.unshift([TEXT.encrate, d.encrate]);
        rows.forEach(([label, value], i) => {
            const y = h * (i + 1) - 4 * i;
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(label, 0, y, w);
            this.resetTextColor();
            const x = this.textWidth(label);
            const v = Number(value) - 100;
            this.drawText((v >= 0 ? '+' : '') + v + '%', x, y, w - x);
        });
        let y = SHOW_ENCRATE ? h * 6 - 20 : h * 5 - 16;
        for (const line of d.descr || []) {
            this.drawText(String(line), 0, y, w);
            y += h - 4;
        }
    };

    function Scene_RRCscaDifficulty() { this.initialize(...arguments); }
    Scene_RRCscaDifficulty.prototype = Object.create(Scene_MenuBase.prototype);
    Scene_RRCscaDifficulty.prototype.constructor = Scene_RRCscaDifficulty;
    window.Scene_RRCscaDifficulty = Scene_RRCscaDifficulty;

    Scene_RRCscaDifficulty.prototype.createBackground = function() {
        Scene_MenuBase.prototype.createBackground.call(this);
        // The original greys the map behind it (tone gray 128).
        if (this._backgroundSprite) this._backgroundSprite.setColorTone([0, 0, 0, 128]);
    };
    Scene_RRCscaDifficulty.prototype.helpAreaHeight = function() { return 0; };
    Scene_RRCscaDifficulty.prototype.create = function() {
        Scene_MenuBase.prototype.create.call(this);
        // The original's integer layout: a sixth of the width in, a quarter wide for the list.
        const gw = Graphics.boxWidth, gh = Graphics.boxHeight;
        const x = Math.floor(gw / 6), headW = Math.floor(gw / 1.5), listW = Math.floor(gw / 4);
        const headH = this.calcWindowHeight(1, false);
        this._headWindow = new Window_RRCscaHeader(new Rectangle(x, 50, headW, headH), TEXT.header);
        this.addWindow(this._headWindow);
        const y = 50 + headH;
        this._infoWindow = new Window_RRCscaDifficultyInfo(new Rectangle(x + listW, y, headW - listW, gh - 148));
        this.addWindow(this._infoWindow);
        this._listWindow = new Window_RRCscaDifficultyList(new Rectangle(x, y, listW, gh - 148));
        this._listWindow.setHandler('ok', this.onDifficultySelect.bind(this));
        this._listWindow.setHelpWindow(this._infoWindow);
        this._listWindow.refresh();
        this._listWindow.select(0);
        this._listWindow.activate();
        this.addWindow(this._listWindow);
    };
    Scene_RRCscaDifficulty.prototype.onDifficultySelect = function() {
        state().setDifficulty(this._listWindow.index());
        this.popScene();
    };
})();
