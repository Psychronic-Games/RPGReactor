/*:
 * @target MZ
 * @plugindesc Yanfly Engine Ace - Skill Cost Manager (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflySkillCost.js
 *
 * Skills can cost HP, gold and custom costs besides MP and TP, and the skill
 * lists (menu and battle) draw every cost a skill has at the right of its
 * row, each in its own colour, size and suffix (" 10EN", " 50TP"), the MP
 * cost rightmost; a custom cost draws its icon and text left of them.
 *
 * Skill notetags: <hp cost: x>, <hp cost: x%> (of max HP), <mp cost: x>,
 * <mp cost: x%>, <tp cost: x>, <tp cost: x%>, <gold cost: x>, <gold cost: x%>
 * (of the party's gold), <… cost min: x>, <… cost max: x> (the max tags are
 * read only in their lower-case spelling), <custom cost: text>,
 * <custom cost colour: n>, <custom cost size: n>, <custom cost icon: n>, and
 * the blocks <custom cost requirement> … </custom cost requirement> and
 * <custom cost perform> … </custom cost perform>. Actors, classes, weapons,
 * armours, enemies and states take <hp cost rate: x%>, <tp cost rate: x%>,
 * <gold cost rate: x%>.
 *
 * A skill can be used only while the battler has more HP than its HP cost,
 * the party has its gold cost (enemies pay no gold), and its requirement
 * block holds. The blocks were Ruby run with the battler as self; the import
 * translated each to JavaScript (the customCosts setting) and it runs with
 * the battler as a. A requirement block with nothing in it never holds, so
 * the skill cannot be used. A block the import could not translate is kept
 * as Ruby in the setting: its requirement counts as met and its payment does
 * nothing.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param hpColour
 * @default 21
 * @param hpSize
 * @default 20
 * @param hpSuffix
 * @default %sHP
 * @param hpIcon
 * @default 0
 * @param mpColour
 * @default 23
 * @param mpSize
 * @default 20
 * @param mpSuffix
 * @default %sMP
 * @param mpIcon
 * @default 0
 * @param tpColour
 * @default 2
 * @param tpSize
 * @default 20
 * @param tpSuffix
 * @default %sTP
 * @param tpIcon
 * @default 0
 * @param goldColour
 * @default 6
 * @param goldSize
 * @default 20
 * @param goldSuffix
 * @default %sGOLD
 * @param goldIcon
 * @default 0
 *
 * @param tpAfterMp
 * @text TP cost left of MP cost
 * @type boolean
 * @default false
 * @desc On with Yanfly's Battle Engine: the TP cost is drawn after the MP cost. Off: before it.
 *
 * @param doppelganger
 * @type boolean
 * @default false
 * @desc On with Yanfly's Doppelganger: an enemy with a class takes its class's cost rates.
 *
 * @param coreEngine
 * @text Yanfly Core Engine rows
 * @type boolean
 * @default false
 * @desc On with Yanfly's Core Engine: a skill's name runs to 24 short of the row's end. Off: 172 wide.
 *
 * @param rgssFontSize
 * @text Game's default font size
 * @type number
 * @default 24
 *
 * @param customCosts
 * @text Custom cost blocks
 * @type multiline_string
 * @default {}
 * @desc JSON: skill id → {"requirement","perform"} as JavaScript (a is the battler).
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflySkillCost');
    const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
    const kind = (k, colour, size, suffix) => ({ colour: num(params[k + 'Colour'], colour), size: num(params[k + 'Size'], size), suffix: String(params[k + 'Suffix'] ?? suffix), icon: num(params[k + 'Icon'], 0) });
    const COST = { hp: kind('hp', 21, 20, '%sHP'), mp: kind('mp', 23, 20, '%sMP'), tp: kind('tp', 2, 20, '%sTP'), gold: kind('gold', 6, 20, '%sGOLD') };
    const TP_AFTER_MP = params.tpAfterMp === 'true';
    const DOPPELGANGER = params.doppelganger === 'true';
    const CORE_ENGINE = params.coreEngine === 'true';
    const RGSS_SIZE = num(params.rgssFontSize, 24) || 24;
    let CUSTOM = {};
    try { CUSTOM = JSON.parse(params.customCosts || '{}') || {}; } catch (_) { CUSTOM = {}; }

    //-------------------------------------------------------------------------
    // Notetags, read once per database object
    //-------------------------------------------------------------------------
    const RATE = { hp: /<(?:HP_COST_RATE|hp cost rate):[ ](\d+)([%％])>/i, tp: /<(?:TP_COST_RATE|tp cost rate):[ ](\d+)([%％])>/i, gold: /<(?:GOLD_COST_RATE|gold cost rate):[ ](\d+)([%％])>/i };
    // Tried in this order on each line; the first that matches takes the line (a line inside a Ruby block matches none).
    const SKILL_TAGS = [
        [/<(?:MP_COST|mp cost):[ ](\d+)>/i, (s, m) => { s.mpCost = +m[1]; }],
        [/<(?:MP_COST|mp cost):[ ](\d+)([%％])>/i, (s, m) => { s.mpPercent = m[1] * 0.01; }],
        [/<(?:TP_COST|tp cost):[ ](\d+)>/i, (s, m) => { s.tpCost = +m[1]; }],
        [/<(?:TP_COST|tp cost):[ ](\d+)([%％])>/i, (s, m) => { s.tpPercent = m[1] * 0.01; }],
        [/<(?:HP_COST|hp cost):[ ](\d+)>/i, (s, m) => { s.hpCost = +m[1]; }],
        [/<(?:HP_COST|hp cost):[ ](\d+)([%％])>/i, (s, m) => { s.hpPercent = m[1] * 0.01; }],
        [/<(?:GOLD_COST|gold cost):[ ](\d+)>/i, (s, m) => { s.goldCost = +m[1]; }],
        [/<(?:GOLD_COST|gold cost):[ ](\d+)([%％])>/i, (s, m) => { s.goldPercent = m[1] * 0.01; }],
        [/<(?:HP_COST_MIN|hp cost min):[ ](\d+)>/i, (s, m) => { s.hpMin = +m[1]; }],
        [/<(?:HP_COST_MIN|hp cost max):[ ](\d+)>/i, (s, m) => { s.hpMax = +m[1]; }],
        [/<(?:MP_COST_MIN|mp cost min):[ ](\d+)>/i, (s, m) => { s.mpMin = +m[1]; }],
        [/<(?:MP_COST_MIN|mp cost max):[ ](\d+)>/i, (s, m) => { s.mpMax = +m[1]; }],
        [/<(?:TP_COST_MIN|tp cost min):[ ](\d+)>/i, (s, m) => { s.tpMin = +m[1]; }],
        [/<(?:TP_COST_MIN|tp cost max):[ ](\d+)>/i, (s, m) => { s.tpMax = +m[1]; }],
        [/<(?:GOLD_COST_MIN|gold cost min):[ ](\d+)>/i, (s, m) => { s.goldMin = +m[1]; }],
        [/<(?:GOLD_COST_MIN|gold cost max):[ ](\d+)>/i, (s, m) => { s.goldMax = +m[1]; }],
        [/<(?:CUSTOM_COST|custom cost):[ ](.*)>/i, (s, m) => { s.customText = m[1]; }],
        [/<(?:CUSTOM_COST_COLOUR|custom cost colour|custom cost color):[ ](\d+)>/i, (s, m) => { s.customColour = +m[1]; }],
        [/<(?:CUSTOM_COST_SIZE|custom cost size):[ ](\d+)>/i, (s, m) => { s.customSize = +m[1]; }],
        [/<(?:CUSTOM_COST_ICON|custom cost icon):[ ](\d+)>/i, (s, m) => { s.customIcon = +m[1]; }],
        [/<(?:CUSTOM_COST_REQUIREMENT|custom cost requirement)>/i, (s) => { s.useCustom = true; }],
        [/<\/(?:CUSTOM_COST_REQUIREMENT|custom cost requirement)>/i, (s) => { s.useCustom = true; }],
        [/<(?:CUSTOM_COST_PERFORM|custom cost perform)>/i, (s) => { s.useCustom = true; }],
        [/<\/(?:CUSTOM_COST_PERFORM|custom cost perform)>/i, (s) => { s.useCustom = true; }]
    ];
    const cache = new WeakMap();
    const lines = (obj) => String((obj && obj.note) || '').split(/[\r\n]+/);
    /** An actor's, class's, equipment's, enemy's or state's cost rates. */
    const rates = (obj) => {
        if (!obj || typeof obj !== 'object') return { hp: 1, tp: 1, gold: 1 };
        if (!cache.has(obj)) {
            const r = { hp: 1, tp: 1, gold: 1 };
            for (const line of lines(obj)) {
                let m;
                if ((m = RATE.tp.exec(line))) r.tp = m[1] * 0.01;
                else if ((m = RATE.hp.exec(line))) r.hp = m[1] * 0.01;
                else if ((m = RATE.gold.exec(line))) r.gold = m[1] * 0.01;
            }
            cache.set(obj, r);
        }
        return cache.get(obj);
    };
    /** A skill's costs. <mp cost: x> and <tp cost: x> replace the skill's own MP and TP cost. */
    const costs = (skill) => {
        if (!skill || typeof skill !== 'object') return null;
        if (!cache.has(skill)) {
            const s = { hpCost: 0, goldCost: 0, hpPercent: 0, mpPercent: 0, tpPercent: 0, goldPercent: 0, customText: '0', customColour: 0, customSize: 20, customIcon: 0, useCustom: false };
            for (const line of lines(skill)) {
                for (const [re, apply] of SKILL_TAGS) {
                    const m = re.exec(line);
                    if (m) { apply(s, m); break; }
                }
            }
            if (s.mpCost !== undefined) skill.mpCost = s.mpCost;
            if (s.tpCost !== undefined) skill.tpCost = s.tpCost;
            cache.set(skill, s);
        }
        return cache.get(skill);
    };
    // Ruby's Integer#to_i drops the fraction toward zero; [n, max].min and [n, min].max clamp.
    const clamp = (n, min, max) => {
        n = Math.trunc(n);
        if (max !== undefined) n = Math.min(n, max);
        if (min !== undefined) n = Math.max(n, min);
        return Math.trunc(n);
    };

    //-------------------------------------------------------------------------
    // Custom cost blocks (translated Ruby, the battler as a)
    //-------------------------------------------------------------------------
    const compiled = new Map();
    const warned = new Set();
    const compile = (code) => {
        if (!compiled.has(code)) {
            let fn;
            // An expression returns its value; statements return their last value, as Ruby's eval did.
            try { fn = new Function('a', 'b', 'v', 'return (' + code + ');'); } catch (_) {
                try { fn = new Function('a', 'b', 'v', '__code', 'return eval(__code);'); } catch (e) { fn = null; }
            }
            compiled.set(code, fn);
        }
        return compiled.get(code);
    };
    /** Runs a skill's block for a battler; `undefined` when the block has no translation. */
    const runBlock = (battler, skill, which) => {
        const entry = CUSTOM[skill.id];
        const code = entry ? entry[which] : null;
        if (code === '') return null; // an empty block is nil
        if (typeof code !== 'string') {
            const key = skill.id + which;
            if (!warned.has(key)) { warned.add(key); console.warn(`RR_YanflySkillCost: skill ${skill.id}'s custom cost ${which} is Ruby the import could not translate; it is skipped.`); }
            return undefined;
        }
        const fn = compile(code);
        if (!fn) return undefined;
        try { return fn.call(battler, battler, battler, $gameVariables._data, code); } catch (error) {
            console.warn(`RR_YanflySkillCost: skill ${skill.id}'s custom cost ${which} failed:`, error);
            return which === 'requirement' ? false : undefined;
        }
    };
    const rubyTrue = (v) => v !== false && v !== null && v !== undefined;

    //-------------------------------------------------------------------------
    // Costs and payment
    //-------------------------------------------------------------------------
    const GB = Game_BattlerBase.prototype;
    /** Rate from the battler's own record, class, equipment and states multiplied together. */
    GB.rrCostRate = function(key) {
        let n = 1;
        if (this.isActor()) {
            n *= rates(this.actor())[key];
            n *= rates(this.currentClass())[key];
            for (const equip of this.equips()) if (equip) n *= rates(equip)[key];
        } else {
            if (key !== 'gold') n *= rates(this.enemy && this.enemy())[key];
            if (DOPPELGANGER && key !== 'gold' && typeof this.currentClass === 'function' && this.currentClass()) n *= rates(this.currentClass())[key];
        }
        for (const state of this.states()) if (state) n *= rates(state)[key];
        return n;
    };
    GB.rrSkillHpCost = function(skill) {
        const s = costs(skill);
        if (!s) return 0;
        const hcr = this.rrCostRate('hp');
        return clamp(s.hpCost * hcr + s.hpPercent * this.mhp * hcr, s.hpMin, s.hpMax);
    };
    GB.rrSkillGoldCost = function(skill) {
        const s = costs(skill);
        if (!s) return 0;
        const gcr = this.rrCostRate('gold');
        return clamp(s.goldCost * gcr + s.goldPercent * $gameParty.gold() * gcr, s.goldMin, s.goldMax);
    };
    const _skillMpCost = GB.skillMpCost;
    GB.skillMpCost = function(skill) {
        const s = costs(skill);
        let n = _skillMpCost.call(this, skill);
        if (!s) return n;
        n += s.mpPercent * this.mmp * this.mcr;
        return clamp(n, s.mpMin, s.mpMax);
    };
    const _skillTpCost = GB.skillTpCost;
    GB.skillTpCost = function(skill) {
        const s = costs(skill);
        if (!s) return _skillTpCost.call(this, skill);
        const tcr = this.rrCostRate('tp');
        const n = _skillTpCost.call(this, skill) * tcr + s.tpPercent * this.maxTp() * tcr;
        return clamp(n, s.tpMin, s.tpMax);
    };
    GB.rrGoldCostMet = function(skill) {
        return !this.isActor() || $gameParty.gold() >= this.rrSkillGoldCost(skill);
    };
    GB.rrCustomCostMet = function(skill) {
        const s = costs(skill);
        if (!s || !s.useCustom) return true;
        const value = runBlock(this, skill, 'requirement');
        return value === undefined ? true : rubyTrue(value);
    };
    const _canPaySkillCost = GB.canPaySkillCost;
    GB.canPaySkillCost = function(skill) {
        if (this.hp <= this.rrSkillHpCost(skill)) return false;
        if (!this.rrGoldCostMet(skill)) return false;
        if (!this.rrCustomCostMet(skill)) return false;
        return _canPaySkillCost.call(this, skill);
    };
    const _paySkillCost = GB.paySkillCost;
    GB.paySkillCost = function(skill) {
        _paySkillCost.call(this, skill);
        this.setHp(this.hp - this.rrSkillHpCost(skill));
        if (this.isActor()) $gameParty.loseGold(this.rrSkillGoldCost(skill));
        this.rrPayCustomCost(skill);
    };
    GB.rrPayCustomCost = function(skill) {
        const s = costs(skill);
        if (s && s.useCustom) runBlock(this, skill, 'perform');
    };

    //-------------------------------------------------------------------------
    // Colours
    //-------------------------------------------------------------------------
    ColorManager.mpCostColor = function() { return this.textColor(COST.mp.colour); };
    ColorManager.tpCostColor = function() { return this.textColor(COST.tp.colour); };
    ColorManager.rrHpCostColor = function() { return this.textColor(COST.hp.colour); };
    ColorManager.rrGoldCostColor = function() { return this.textColor(COST.gold.colour); };

    //-------------------------------------------------------------------------
    // Skill lists: each cost right to left from the row's right edge
    //-------------------------------------------------------------------------
    const W = Window_SkillList.prototype;
    const rgssSize = (size) => $gameSystem.mainFontSize() * size / RGSS_SIZE;
    const group = (win, n) => (typeof win.rrAceGroup === 'function' ? win.rrAceGroup(n) : String(n));
    const format = (suffix, value) => suffix.replace(/%%|%s/g, (m) => (m === '%%' ? '%' : value));

    /** Ace's change_color(colour, enabled): the text faint when disabled. */
    W.rrAceChangeColor = function(color, enabled) {
        this.changeTextColor(color);
        this.changePaintOpacity(enabled !== false);
    };
    W.rrAceResetFont = function() {
        this.resetFontSettings();
        this.changePaintOpacity(true);
    };
    /** One cost: its icon at the rect's right, then its text right-aligned left of it; the rect shrinks past both. */
    W.rrDrawCostPart = function(rect, skill, color, icon, size, text) {
        const enabled = this.isEnabled(skill);
        this.rrAceChangeColor(color, enabled);
        if (icon > 0) {
            this.drawIcon(icon, rect.x + rect.width - 24, rect.y, enabled);
            rect.width -= 24;
        }
        this.contents.fontSize = rgssSize(size);
        this.drawText(text, rect.x, rect.y, rect.width, 'right');
        rect.width -= this.textWidth(text) + 4;
        this.rrAceResetFont();
    };
    W.rrDrawMpSkillCost = function(rect, skill) {
        const cost = this._actor.skillMpCost(skill);
        if (cost > 0) this.rrDrawCostPart(rect, skill, ColorManager.mpCostColor(), COST.mp.icon, COST.mp.size, format(COST.mp.suffix, group(this, cost)));
    };
    W.rrDrawTpSkillCost = function(rect, skill) {
        const cost = this._actor.skillTpCost(skill);
        if (cost > 0) this.rrDrawCostPart(rect, skill, ColorManager.tpCostColor(), COST.tp.icon, COST.tp.size, format(COST.tp.suffix, group(this, cost)));
    };
    W.rrDrawHpSkillCost = function(rect, skill) {
        const cost = this._actor.rrSkillHpCost(skill);
        if (cost > 0) this.rrDrawCostPart(rect, skill, ColorManager.rrHpCostColor(), COST.hp.icon, COST.hp.size, format(COST.hp.suffix, group(this, cost)));
    };
    W.rrDrawGoldSkillCost = function(rect, skill) {
        const cost = this._actor.rrSkillGoldCost(skill);
        if (cost > 0) this.rrDrawCostPart(rect, skill, ColorManager.rrGoldCostColor(), COST.gold.icon, COST.gold.size, format(COST.gold.suffix, group(this, cost)));
    };
    W.rrDrawCustomSkillCost = function(rect, skill) {
        const s = costs(skill);
        if (s && s.useCustom) this.rrDrawCostPart(rect, skill, ColorManager.textColor(s.customColour), s.customIcon, s.customSize, s.customText);
    };
    /** Ace's draw_skill_cost(rect, skill). */
    W.rrAceDrawSkillCost = function(rect, skill) {
        if (!this._actor || !skill) return;
        if (!TP_AFTER_MP) this.rrDrawTpSkillCost(rect, skill);
        this.rrDrawMpSkillCost(rect, skill);
        if (TP_AFTER_MP) this.rrDrawTpSkillCost(rect, skill);
        this.rrDrawHpSkillCost(rect, skill);
        this.rrDrawGoldSkillCost(rect, skill);
        this.rrDrawCustomSkillCost(rect, skill);
    };
    W.drawSkillCost = function(skill, x, y, width) {
        this.rrAceDrawSkillCost(new Rectangle(x, y, width, this.lineHeight()), skill);
    };
    // The row: icon and name (172 wide; with Yanfly's Core Engine to 24 short of the row's end), then the costs over it.
    W.drawItem = function(index) {
        const skill = this.itemAt(index);
        if (!skill) return;
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.rrAceDrawItemName(skill, rect.x, rect.y, this.isEnabled(skill), CORE_ENGINE ? rect.width - 24 : 172);
        this.rrAceDrawSkillCost(rect, skill);
    };
    window.RRYanflySkillCost = { costs, rates };
})();
