/*:
 * @target MZ
 * @plugindesc Yanfly Engine Ace - Skill Restrictions (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflySkillRestrictions.js
 *
 * Skills can have cooldowns, warmups and a limited number of uses per
 * battle, and can be locked by switches or a condition. A skill held back
 * this way cannot be used, and its row in the skill lists shows why in place
 * of its cost: "Used" when its uses are spent, the turns left of its cooldown
 * (with the cooldown icon), or the turns left of its warmup ("2WU").
 *
 * Skill notetags: <cooldown: x>, <warmup: x>, <limited uses: x>,
 * <restrict if switch: x>, <restrict any switch: x, x>,
 * <restrict all switch: x, x>, <restrict eval> … </restrict eval>. Skills
 * and items: <change cooldown: +x>, <stype cooldown x: +y>,
 * <skill cooldown x: +y> change the target's cooldowns. Actors, classes,
 * weapons, armours, enemies and states: <cooldown lock>,
 * <cooldown rate: x%>, <warmup rate: x%>.
 *
 * Cooldowns, warmups and limited uses count only in battle and start over
 * at each battle's start and end. A cooldown is set when the skill's cost is
 * paid; every battler's cooldowns count down by one each time a turn starts
 * (the troop's turn count does not change first), unless the battler is
 * cooldown-locked. A use is counted for each target the skill is applied to.
 * A warmup holds the skill until the troop's turn count passes it.
 *
 * <restrict eval> was Ruby run with the battler as self, translated by the
 * import (the restrictEvals setting). The original never closed the block,
 * so every later line of the note is part of it; a block the import could
 * not translate restricts nothing.
 *
 * With the Reload add-on live in the game, <reload skill: x, x> on a skill
 * resets the user's uses of those skills when it hits. With the Mag Size
 * add-on, <mag size: +x> on equipment adds x uses to limited-use skills.
 *
 * Script calls on a battler: rrCooldown(skill), rrSetCooldown(skill, n),
 * rrUpdateCooldowns(n, stypeId, skillId), rrTimesUsed(skill),
 * rrResetCooldowns(), rrResetTimesUsed(). A battle system that starts turns
 * its own way calls BattleManager.rrSkillRestrictionsTurnStart() where a
 * turn starts.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param cooldownColour
 * @default 0
 * @param cooldownSize
 * @default 20
 * @param cooldownSuffix
 * @default %sCD
 * @param cooldownIcon
 * @default 0
 * @param warmupColour
 * @default 0
 * @param warmupSize
 * @default 20
 * @param warmupSuffix
 * @default %sWU
 * @param warmupIcon
 * @default 0
 * @param limitedColour
 * @default 0
 * @param limitedSize
 * @default 20
 * @param limitedText
 * @default Used
 * @param limitedIcon
 * @default 0
 *
 * @param doppelganger
 * @type boolean
 * @default false
 *
 * @param reloadAddon
 * @text Reload refills limited uses
 * @type boolean
 * @default false
 *
 * @param magSizeAddon
 * @text Equipment mag size bonus
 * @type boolean
 * @default false
 *
 * @param rgssFontSize
 * @text Game's default font size
 * @type number
 * @default 24
 *
 * @param restrictEvals
 * @text Restrict eval blocks
 * @type multiline_string
 * @default {}
 * @desc JSON: skill id → JavaScript (a is the battler), or {"ruby"} when it could not be translated.
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflySkillRestrictions');
    const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : d);
    const kind = (k, colour, size, text) => ({ colour: num(params[k + 'Colour'], colour), size: num(params[k + 'Size'], size), text: String(params[k + (k === 'limited' ? 'Text' : 'Suffix')] ?? text), icon: num(params[k + 'Icon'], 0) });
    const LOOK = { cooldown: kind('cooldown', 0, 20, '%sCD'), warmup: kind('warmup', 0, 20, '%sWU'), limited: kind('limited', 0, 20, 'Used') };
    const DOPPELGANGER = params.doppelganger === 'true';
    const RELOAD = params.reloadAddon === 'true';
    const MAG_SIZE = params.magSizeAddon === 'true';
    const RGSS_SIZE = num(params.rgssFontSize, 24) || 24;
    let EVALS = {};
    try { EVALS = JSON.parse(params.restrictEvals || '{}') || {}; } catch (_) { EVALS = {}; }

    //-------------------------------------------------------------------------
    // Notetags, read once per database object
    //-------------------------------------------------------------------------
    const RE = {
        cooldownRate: /<(?:COOL_DOWN_RATE|cooldown rate):[ ](\d+)([%％])>/i, cooldownLock: /<(?:COOL_DOWN_LOCK|cooldown lock)>/i, warmupRate: /<(?:WARM_UP_RATE|warmup rate):[ ](\d+)([%％])>/i,
        magSize: /<(?:MAG_SIZE|mag size):[ ]([+-]\d+)>/i,
        cooldown: /<(?:COOL_DOWN|cooldown):[ ](\d+)>/i, warmup: /<(?:WARM_UP|warmup):[ ](\d+)>/i, limited: /<(?:LIMITED_USES|limited uses):[ ](\d+)>/i,
        change: /<(?:CHANGE_COOL_DOWN|change cooldown):[ ]([+-]\d+)>/i, stype: /<(?:STYPE_COOL_DOWN|stype cooldown)[ ](\d+):[ ]([+-]\d+)>/i, skill: /<(?:SKILL_COOL_DOWN|skill cooldown)[ ](\d+):[ ]([+-]\d+)>/i,
        ifSwitch: /<(?:RESTRICT_IF_SWITCH|restrict if switch):[ ](\d+)>/i, anySwitch: /<(?:RESTRICT_ANY_SWITCH|restrict any switch):[ ]*(\d+(?:\s*,\s*\d+)*)>/i,
        allSwitch: /<(?:RESTRICT_ALL_SWITCH|restrict all switch):[ ]*(\d+(?:\s*,\s*\d+)*)>/i, evalOn: /<(?:RESTRICT_EVAL|restrict eval)>/i, evalOff: /<\/(?:RESTRICT_EVAL|restrict eval)>/i,
        reload: /<(?:RELOAD_SKILL|reload skill):[ ]*(\d+(?:\s*,\s*\d+)*)>/i
    };
    const cache = new WeakMap();
    const lines = (obj) => String((obj && obj.note) || '').split(/[\r\n]+/);
    const ids = (text) => (String(text).match(/\d+/g) || []).map(Number);
    const isSkill = (o) => !!o && typeof o === 'object' && typeof o.stypeId === 'number';
    const isItem = (o) => !!o && typeof o === 'object' && typeof o.itypeId === 'number';
    /** A database object's tags: rates and lock (battlers' records, equipment, states), cooldown rules (skills, items). */
    const tags = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (cache.has(obj)) return cache.get(obj);
        const t = { cooldownRate: 1, warmupRate: 1, cooldownLock: false, magSize: 0, cooldown: 0, warmup: 0, limited: 0, change: new Map(), skill: new Map(), any: [], all: [], reload: [] };
        let m;
        if (isSkill(obj) || isItem(obj)) {
            const skill = isSkill(obj);
            for (const line of lines(obj)) {
                if (skill && (m = RE.cooldown.exec(line))) t.cooldown = +m[1];
                else if (skill && (m = RE.warmup.exec(line))) t.warmup = +m[1];
                else if (skill && (m = RE.limited.exec(line))) t.limited = +m[1];
                else if ((m = RE.change.exec(line))) t.change.set(0, parseInt(m[1], 10));
                else if ((m = RE.stype.exec(line))) t.change.set(+m[1], parseInt(m[2], 10));
                else if ((m = RE.skill.exec(line))) t.skill.set(+m[1], parseInt(m[2], 10));
                else if (skill && (m = RE.ifSwitch.exec(line))) t.any.push(+m[1]);
                else if (skill && (m = RE.anySwitch.exec(line))) t.any.push(...ids(m[1]).filter(n => n > 0));
                else if (skill && (m = RE.allSwitch.exec(line))) t.all.push(...ids(m[1]).filter(n => n > 0));
                if (skill && RELOAD && (m = RE.reload.exec(line))) t.reload.push(...ids(m[1]));
            }
        } else {
            for (const line of lines(obj)) {
                if ((m = RE.cooldownRate.exec(line))) t.cooldownRate = m[1] * 0.01;
                else if (RE.cooldownLock.test(line)) t.cooldownLock = true;
                else if ((m = RE.warmupRate.exec(line))) t.warmupRate = m[1] * 0.01;
                if (MAG_SIZE && (m = RE.magSize.exec(line))) t.magSize += parseInt(m[1], 10);
            }
        }
        cache.set(obj, t);
        return t;
    };
    const skillOf = (skill) => (typeof skill === 'number' ? $dataSkills[skill] : skill);
    const idOf = (skill) => (skill && typeof skill === 'object' ? skill.id : skill);

    //-------------------------------------------------------------------------
    // Restrict eval blocks (translated Ruby, the battler as a)
    //-------------------------------------------------------------------------
    const compiled = new Map();
    const warned = new Set();
    const compile = (code) => {
        if (!compiled.has(code)) {
            let fn;
            try { fn = new Function('a', 'b', 'v', 'return (' + code + ');'); } catch (_) {
                try { fn = new Function('a', 'b', 'v', '__code', 'return eval(__code);'); } catch (e) { fn = null; }
            }
            compiled.set(code, fn);
        }
        return compiled.get(code);
    };

    //-------------------------------------------------------------------------
    // Battlers
    //-------------------------------------------------------------------------
    const GB = Game_BattlerBase.prototype;
    const _initMembers = GB.initMembers;
    GB.initMembers = function() {
        _initMembers.call(this);
        this.rrResetCooldowns();
        this.rrResetTimesUsed();
    };
    GB.rrResetCooldowns = function() { this._rrCooldown = {}; };
    GB.rrResetTimesUsed = function() { this._rrTimesUsed = {}; };
    /** The records whose rates and locks apply: actor, class and equipment, or the enemy; then the states. */
    GB.rrRestrictObjects = function() {
        const list = [];
        if (this.isActor()) list.push(this.actor(), this.currentClass(), ...this.equips().filter(Boolean));
        else {
            list.push(this.enemy && this.enemy());
            if (DOPPELGANGER && typeof this.currentClass === 'function' && this.currentClass()) list.push(this.currentClass());
        }
        return list.concat(this.states().filter(Boolean)).filter(Boolean);
    };
    GB.rrCooldownRate = function() { return this.rrRestrictObjects().reduce((n, o) => n * tags(o).cooldownRate, 1); };
    GB.rrWarmupRate = function() { return this.rrRestrictObjects().reduce((n, o) => n * tags(o).warmupRate, 1); };
    // An enemy's lock comes from its record and states only (not a class).
    GB.rrCooldownLocked = function() {
        const own = this.isActor() ? [this.actor(), this.currentClass(), ...this.equips().filter(Boolean)] : [this.enemy && this.enemy()];
        return own.concat(this.states()).filter(Boolean).some(o => tags(o).cooldownLock);
    };
    GB.rrCooldown = function(skill) {
        if (!this._rrCooldown) this.rrResetCooldowns();
        return this._rrCooldown[idOf(skill)] || 0;
    };
    GB.rrSetCooldown = function(skill, amount = 0) {
        if (!$gameParty.inBattle()) return;
        if (!this._rrCooldown) this.rrResetCooldowns();
        this._rrCooldown[idOf(skill)] = Math.trunc(Math.max(amount, 0));
    };
    GB.rrWarmup = function(skill) {
        const data = skillOf(skill);
        return data ? Math.trunc(Math.max(tags(data).warmup * this.rrWarmupRate(), 0)) : 0;
    };
    GB.rrTimesUsed = function(skill) {
        if (!this._rrTimesUsed) this.rrResetTimesUsed();
        return this._rrTimesUsed[idOf(skill)] || 0;
    };
    GB.rrUpdateTimesUsed = function(skill) {
        if (!this._rrTimesUsed) this.rrResetTimesUsed();
        const id = idOf(skill);
        this._rrTimesUsed[id] = (this._rrTimesUsed[id] || 0) + 1;
    };
    GB.rrMagBonus = function() {
        return MAG_SIZE && this.isActor() ? this.equips().filter(Boolean).reduce((n, e) => n + tags(e).magSize, 0) : 0;
    };
    GB.rrLimitRestricted = function(skill) {
        const t = tags(skill);
        if (!t || t.limited <= 0) return false;
        return this.rrTimesUsed(skill) >= t.limited + this.rrMagBonus();
    };
    GB.rrSwitchRestricted = function(skill) {
        const t = tags(skill);
        if (!t) return false;
        if (t.any.some(id => $gameSwitches.value(id))) return true;
        return t.all.length > 0 && t.all.every(id => $gameSwitches.value(id));
    };
    GB.rrRestrictEval = function(skill) {
        const code = skill ? EVALS[skill.id] : null;
        if (code === undefined || code === null) return false;
        if (typeof code !== 'string') {
            if (!warned.has(skill.id)) { warned.add(skill.id); console.warn(`RR_YanflySkillRestrictions: skill ${skill.id}'s <restrict eval> is Ruby the import could not translate; it restricts nothing.`); }
            return false;
        }
        if (code === '') return false;
        const fn = compile(code);
        if (!fn) return false;
        try { const v = fn.call(this, this, this, $gameVariables._data, code); return v !== false && v !== null && v !== undefined; } catch (error) {
            console.warn(`RR_YanflySkillRestrictions: skill ${skill.id}'s <restrict eval> failed:`, error);
            return false;
        }
    };
    GB.rrSkillRestricted = function(skill) {
        if (!skill) return false;
        if ($gameParty.inBattle()) {
            if (this.rrCooldown(skill) > 0) return true;
            if (this.rrWarmup(skill) > $gameTroop.turnCount()) return true;
            if (this.rrLimitRestricted(skill)) return true;
        }
        return this.rrSwitchRestricted(skill) || this.rrRestrictEval(skill);
    };
    const _meetsSkillConditions = GB.meetsSkillConditions;
    GB.meetsSkillConditions = function(skill) {
        if (this.rrSkillRestricted(skill)) return false;
        return _meetsSkillConditions.call(this, skill);
    };
    const _paySkillCost = GB.paySkillCost;
    GB.paySkillCost = function(skill) {
        _paySkillCost.call(this, skill);
        this.rrPaySkillCooldown(skill);
    };
    GB.rrPaySkillCooldown = function(skill) {
        if (!$gameParty.inBattle()) return;
        const data = skillOf(skill);
        if (data) this.rrSetCooldown(data.id, tags(data).cooldown * this.rrCooldownRate());
    };
    /** The skills whose cooldowns count: an actor's skills, an enemy's action skills. */
    GB.rrCooldownSkills = function() {
        if (this.isActor()) return this.skills();
        const out = [];
        for (const action of (this.enemy && this.enemy() ? this.enemy().actions : [])) if (!out.includes(action.skillId)) out.push(action.skillId);
        return out.map(id => $dataSkills[id]).filter(Boolean);
    };
    GB.rrUpdateCooldowns = function(amount = -1, stypeId = 0, skillId = 0) {
        if (this.rrCooldownLocked()) return;
        for (const skill of this.rrCooldownSkills()) {
            if (stypeId !== 0 && skill.stypeId !== stypeId) continue;
            if (skillId !== 0 && skill.id !== skillId) continue;
            this.rrSetCooldown(skill, this.rrCooldown(skill) + amount);
        }
    };

    const GBa = Game_Battler.prototype;
    const _onBattleStart = GBa.onBattleStart;
    GBa.onBattleStart = function() {
        _onBattleStart.apply(this, arguments);
        this.rrResetCooldowns();
        this.rrResetTimesUsed();
    };
    const _onBattleEnd = GBa.onBattleEnd;
    GBa.onBattleEnd = function() {
        _onBattleEnd.apply(this, arguments);
        this.rrResetCooldowns();
        this.rrResetTimesUsed();
    };
    /** A skill or item that hits changes the target's cooldowns by its tags. */
    GBa.rrApplyCooldownChanges = function(user, item) {
        if (!$gameParty.inBattle() || !item) return;
        const t = tags(item);
        if (!t) return;
        if (t.change.size) {
            for (const [stypeId, amount] of t.change) this.rrUpdateCooldowns(amount, stypeId);
            this.result().success = true;
        }
        if (t.skill.size) {
            for (const [skillId, amount] of t.skill) this.rrUpdateCooldowns(amount, 0, skillId);
            this.result().success = true;
        }
    };
    /** Reload add-on: a hit resets the user's uses of the skills the item names. */
    GBa.rrApplyReloadRefill = function(user, item) {
        if (!RELOAD || !$gameParty.inBattle() || !isSkill(item) || !user) return;
        const t = tags(item);
        if (!t.reload.length) return;
        if (!user._rrTimesUsed) user.rrResetTimesUsed();
        for (const id of t.reload) user._rrTimesUsed[id] = 0;
    };

    // Each target an action is applied to counts a use of the skill; on a hit its cooldown changes apply to the target.
    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        _apply.call(this, target);
        const item = this.item(), user = this.subject();
        if ($gameParty.inBattle() && user && DataManager.isSkill(item)) user.rrUpdateTimesUsed(item);
    };
    const _applyItemUserEffect = Game_Action.prototype.applyItemUserEffect;
    Game_Action.prototype.applyItemUserEffect = function(target) {
        _applyItemUserEffect.call(this, target);
        if (!target || typeof target.rrApplyCooldownChanges !== 'function') return;
        target.rrApplyCooldownChanges(this.subject(), this.item());
        target.rrApplyReloadRefill(this.subject(), this.item());
    };

    Game_Unit.prototype.rrUpdateRestrictions = function() {
        for (const member of this.members()) member.rrUpdateCooldowns();
    };
    /** Every battler's cooldowns count down one, before the turn itself starts. */
    BattleManager.rrSkillRestrictionsTurnStart = function() {
        $gameParty.rrUpdateRestrictions();
        $gameTroop.rrUpdateRestrictions();
    };
    const _startTurn = BattleManager.startTurn;
    BattleManager.startTurn = function() {
        this.rrSkillRestrictionsTurnStart();
        _startTurn.apply(this, arguments);
    };

    //-------------------------------------------------------------------------
    // Skill lists: a held-back skill shows why in place of its cost
    //-------------------------------------------------------------------------
    const W = Window_SkillList.prototype;
    const rgssSize = (size) => $gameSystem.mainFontSize() * size / RGSS_SIZE;
    const group = (win, n) => (typeof win.rrAceGroup === 'function' ? win.rrAceGroup(n) : String(n));
    const format = (suffix, value) => suffix.replace(/%%|%s/g, (m) => (m === '%%' ? '%' : value));

    const _drawItem = W.drawItem;
    W.drawItem = function(index) {
        const skill = this.itemAt(index);
        if (skill && this._actor && this._actor.rrSkillRestricted(skill)) this.rrDrawSkillRestriction(index);
        else _drawItem.call(this, index);
    };
    W.rrDrawSkillRestriction = function(index) {
        const skill = this.itemAt(index);
        const rect = this.itemRect(index);
        rect.width -= 4;
        this.rrAceDrawItemName(skill, rect.x, rect.y, this.isEnabled(skill));
        if (this._actor.rrLimitRestricted(skill)) this.rrDrawRestrictPart(rect, skill, LOOK.limited, LOOK.limited.text);
        else if (this._actor.rrCooldown(skill) > 0) this.rrDrawRestrictPart(rect, skill, LOOK.cooldown, format(LOOK.cooldown.text, group(this, this._actor.rrCooldown(skill))));
        else if (this.rrWarmupRestriction(skill)) this.rrDrawRestrictPart(rect, skill, LOOK.warmup, format(LOOK.warmup.text, group(this, this._actor.rrWarmup(skill) - $gameTroop.turnCount())));
        else if (typeof this.rrAceDrawSkillCost === 'function') this.rrAceDrawSkillCost(rect, skill);
        else this.drawSkillCost(skill, rect.x, rect.y, rect.width);
    };
    W.rrWarmupRestriction = function(skill) {
        return $gameParty.inBattle() && this._actor.rrWarmup(skill) > $gameTroop.turnCount();
    };
    W.rrDrawRestrictPart = function(rect, skill, look, text) {
        const enabled = this.isEnabled(skill);
        this.changeTextColor(ColorManager.textColor(look.colour));
        this.changePaintOpacity(enabled);
        if (look.icon > 0) {
            this.drawIcon(look.icon, rect.x + rect.width - 24, rect.y, enabled);
            rect.width -= 24;
        }
        this.contents.fontSize = rgssSize(look.size);
        this.drawText(text, rect.x, rect.y, rect.width, 'right');
        this.resetFontSettings();
        this.changePaintOpacity(true);
    };
})();
