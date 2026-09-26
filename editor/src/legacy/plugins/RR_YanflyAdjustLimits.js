/*:
 * @target MZ
 * @plugindesc Ace Adjust Limits (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyAdjustLimits.js
 *
 * Raised limits: gold, items held (per item with <max limit: n>), levels
 * (actors whose maximum was 99 go to the new maximum; <max level: n>,
 * <initial level: n>, a class skill's <learn at level: n>), and HP, MP and
 * other stats, which keep growing past level 99 by the last level's step.
 * Items, weapons and armors take <price: n> and <stat: +n> (hp, mp, atk,
 * def, mat, mdf, agi, luk); enemies <stat: n>, also exp and gold.
 *
 * Gold is drawn with an icon (or "MAX!" when it does not fit), item counts
 * as "×n", and after a load every actor's level is brought within limits.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param goldMax
 * @type number
 * @default 99999999
 * @param goldIcon
 * @type number
 * @default 0
 * @param goldFont
 * @type number
 * @default 0
 * @desc RGSS font size; 0 keeps the window's.
 * @param tooMuchGold
 * @default MAX!
 * @param itemMax
 * @type number
 * @default 99
 * @param itemFont
 * @type number
 * @default 0
 * @param itemPrefix
 * @default ×%s
 * @param levelMax
 * @type number
 * @default 99
 * @param mhpMax
 * @type number
 * @default 9999
 * @param mmpMax
 * @type number
 * @default 9999
 * @param paramMax
 * @type number
 * @default 999
 * @param defaultFontSize
 * @text The game's default font size
 * @type number
 * @default 24
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyAdjustLimits');
    const n = (key, d) => (params[key] === undefined || params[key] === '' ? d : Number(params[key]));
    const GOLD_MAX = n('goldMax', 99999999), GOLD_ICON = n('goldIcon', 0), GOLD_FONT = n('goldFont', 0);
    const TOO_MUCH = String(params.tooMuchGold ?? 'MAX!');
    const ITEM_MAX = n('itemMax', 99), ITEM_FONT = n('itemFont', 0), ITEM_PREFIX = String(params.itemPrefix || '×%s');
    const LEVEL_MAX = n('levelMax', 99), MHP_MAX = n('mhpMax', 9999), MMP_MAX = n('mmpMax', 9999), PARAM_MAX = n('paramMax', 999);
    const BASE_SIZE = n('defaultFontSize', 24) || 24;
    // An RGSS size relative to the game's default, in this project's font.
    const fontSize = (size) => Math.round($gameSystem.mainFontSize() * size / BASE_SIZE);

    const STATS = { HP: 0, MAXHP: 0, MHP: 0, MP: 1, MAXMP: 1, MMP: 1, SP: 1, MAXSP: 1, MSP: 1, ATK: 2, DEF: 3, MAT: 4, INT: 4, SPI: 4, MDF: 5, RES: 5, AGI: 6, SPD: 6, LUK: 7, LUCK: 7 };
    const lines = (obj) => String(obj.note || '').split(/[\r\n]+/);
    const readNotes = () => {
        for (const actor of $dataActors) {
            if (!actor) continue;
            if (actor.maxLevel === 99) actor.maxLevel = LEVEL_MAX;
            for (const line of lines(actor)) {
                let m;
                if ((m = /<(?:MAX_LVL|max level):[ ](\d+)>/i.exec(line))) {
                    actor.maxLevel = Math.min(Math.max(Number(m[1]), 1), LEVEL_MAX);
                    actor.initialLevel = Math.min(actor.initialLevel, actor.maxLevel);
                } else if ((m = /<(?:INIT._LEVEL|initial level):[ ](\d+)>/i.exec(line))) {
                    actor.initialLevel = Math.min(Math.max(Number(m[1]), 1), actor.maxLevel);
                }
            }
        }
        for (const cls of $dataClasses) {
            if (!cls) continue;
            for (const learning of cls.learnings || []) {
                const m = /<(?:LEARN_AT_LEVEL|learn at level):[ ](\d+)>/i.exec(learning.note || '');
                if (m) learning.level = Math.min(Math.max(Number(m[1]), 1), LEVEL_MAX);
            }
        }
        for (const table of [$dataItems, $dataWeapons, $dataArmors]) for (const item of table) {
            if (!item) continue;
            item.rrMaxLimit = ITEM_MAX;
            for (const line of lines(item)) {
                let m;
                if ((m = /<(?:GOLD|price|COST):[ ](\d+)>/i.exec(line))) item.price = Math.min(Number(m[1]), GOLD_MAX);
                else if ((m = /<(?:MAX_LIMIT|max limit):[ ](\d+)>/i.exec(line))) item.rrMaxLimit = Math.max(Number(m[1]), 1);
                else if ((m = /<(.*):[ ]*([+-]\d+)>/i.exec(line)) && item.params && STATS[m[1].toUpperCase()] !== undefined) item.params[STATS[m[1].toUpperCase()]] = Number(m[2]);
            }
        }
        for (const enemy of $dataEnemies) {
            if (!enemy) continue;
            for (const line of lines(enemy)) {
                const m = /<(.*):[ ]*(\d+)>/i.exec(line);
                if (!m) continue;
                const key = m[1].toUpperCase();
                if (STATS[key] !== undefined) enemy.params[STATS[key]] = Number(m[2]);
                else if (key === 'EXP' || key === 'XP') enemy.exp = Number(m[2]);
                else if (key === 'GOLD' || key === 'GP') enemy.gold = Number(m[2]);
            }
        }
    };
    const _isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_isDatabaseLoaded.call(this)) return false;
        if (!this._rrAdjustLimits) { this._rrAdjustLimits = true; readNotes(); }
        return true;
    };

    Game_BattlerBase.prototype.paramMax = function(paramId) {
        if (paramId === 0) return MHP_MAX;
        if (paramId === 1) return MMP_MAX;
        return PARAM_MAX;
    };
    // Past level 99 a stat grows by the step from 98 to 99, plus one, each level.
    Game_Actor.prototype.paramBase = function(paramId) {
        const values = this.currentClass().params[paramId];
        if (this._level <= 99) return values[this._level];
        return values[99] + (values[99] - values[98] + 1) * Math.max(this._level - 99, 1);
    };
    Game_Actor.prototype.rrCheckLevels = function() {
        const last = this._level;
        this._level = Math.min(Math.max(this._level, 1), this.maxLevel());
        if (this._level !== last) this.changeExp(this.expForLevel(this._level), false);
    };
    Game_Party.prototype.maxGold = function() { return GOLD_MAX; };
    Game_Party.prototype.maxItems = function(item) { return item && item.rrMaxLimit ? item.rrMaxLimit : ITEM_MAX; };

    const _onLoadSuccess = Scene_Load.prototype.onLoadSuccess;
    Scene_Load.prototype.onLoadSuccess = function() {
        _onLoadSuccess.call(this);
        for (const actor of $gameActors._data) if (actor) actor.rrCheckLevels();
    };

    Object.assign(Window_Base.prototype, {
        rrAceDrawActorLevel(actor, x, y) {
            const w = this.textWidth(TextManager.levelA + String(LEVEL_MAX));
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.levelA, x, y, w);
            this.resetTextColor();
            this.drawText(this.rrAceGroup(actor.level), x + this.textWidth(TextManager.levelA), y, w, 'right');
        },
        rrAceDrawActorParam(actor, x, y, paramId) {
            this.changeTextColor(ColorManager.systemColor());
            this.drawText(TextManager.param(paramId), x, y, 120);
            this.resetTextColor();
            this.drawText(this.rrAceGroup(actor.param(paramId)), x, y, 156, 'right');
        },
        rrAceDrawCurrencyValue(value, unit, x, y, width) {
            if (GOLD_FONT) this.contents.fontSize = fontSize(GOLD_FONT);
            const icon = unit === TextManager.currencyUnit && GOLD_ICON > 0;
            const cx = icon ? ImageManager.iconWidth : this.textWidth(unit);
            this.resetTextColor();
            let text = this.rrAceGroup(value);
            if (this.textWidth(text) > width - cx) text = TOO_MUCH;
            this.drawText(text, x, y, width - cx - 2, 'right');
            this.changeTextColor(ColorManager.systemColor());
            if (icon) this.drawIcon(GOLD_ICON, x + width - ImageManager.iconWidth, y);
            else this.drawText(unit, x, y, width, 'right');
            this.resetFontSettings();
        }
    });
    const _drawCurrencyValue = Window_Base.prototype.drawCurrencyValue;
    Window_Base.prototype.drawCurrencyValue = function(value, unit, x, y, width) {
        if (typeof this.rrAceGroup !== 'function') return _drawCurrencyValue.apply(this, arguments);
        this.rrAceDrawCurrencyValue(value, unit, x, y, width);
    };

    Window_Base.prototype.rrAceDrawItemNumber = function(rect, item) {
        if (ITEM_FONT) this.contents.fontSize = fontSize(ITEM_FONT);
        this.drawText(ITEM_PREFIX.replace('%s', this.rrAceGroup($gameParty.numItems(item))), rect.x, rect.y, rect.width, 'right');
        this.resetFontSettings();
    };
})();
