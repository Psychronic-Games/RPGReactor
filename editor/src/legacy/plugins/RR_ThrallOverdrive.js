/*:
 * @target MZ
 * @plugindesc KGC Overdrive (VX), with Thrall's edits, for imported games
 * @author KGC (TOMY); translated by Touchfuzzy, Mr. Anonymous and Mr. Bubble; Thrall's edits; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallOverdrive.js
 *
 * KGC's Overdrive gauge as Thrall uses it. Battlers fill their gauge by
 * attacking, by taking damage (enemies twice as fast) and by acting;
 * Fatal fills it at every turn end with variable 185 at 24. A skill with
 * <overdrive n> in its note needs n points (1000 without n) and uses them;
 * <overdrive n+> uses the whole gauge and hits harder the fuller it was;
 * <od_gain_rate n%> scales the gain of attacking with it; <od_add n> on a
 * skill or item adds n to its target's gauge. A weapon with element 32 gives
 * two gauges. Gaining past a full gauge plays Saint2. Overdrive skills stay
 * out of the skill list until the gauge holds enough; an actor without one
 * neither shows nor fills a gauge. Multi weapons, Cosmo weapons, swords and
 * spears with skills, and the Daunting elite (variables 91/92 = 6) slow the
 * gain. Falling empties the gauge.
 *
 * Script calls (the importer translates the game's Ruby):
 *   gain_actor_od_gauge(actor_id, n)      this.rrGainActorOdGauge(id, n)  (-1: everyone)
 *   gain_enemy_od_gauge(index, n)         this.rrGainEnemyOdGauge(i, n)
 *   get_actor_od_gauge(actor_id, var)     this.rrGetActorOdGauge(id, var)
 *   get_enemy_od_gauge(index, var)        this.rrGetEnemyOdGauge(i, var)
 *   set_actor_od_gauge_number(id, n), set_enemy_od_gauge_number(i, n)
 *   actor_od_gauge_max?(id), enemy_od_gauge_max?(i)
 *   set_actor_drive_type(id, types), set_enemy_drive_type(i, types)
 *   battler.overdrive / overdrive = n     battler.rrOverdrive() / rrSetOverdrive(n)
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param gaugeMax
 * @default 1000
 * @param gainRate
 * @desc Attack, Damage, Victory, Escape, Alone, Action, Fatal, Guard
 * @default [75,500,200,100,160,25,50,150]
 * @param gaugeNumber
 * @default 1
 * @param actorDriveType
 * @default [0,1,5]
 * @param enemyDriveType
 * @default [0,1,5]
 * @param emptyOnDead
 * @default true
 * @param hideGaugeActor
 * @default []
 * @param hideNotInBattle
 * @default true
 * @param hideNoOdSkills
 * @default true
 * @param notGainHiding
 * @default false
 * @param hideSkillLackOfGauge
 * @default true
 * @param gaugeName
 * @default Overdrive
 * @param valueStyle
 * @default 2
 * @param valueFontSize
 * @default 14
 * @param offsetY
 * @default -2
 * @param normalColor1
 * @default [64,64,64]
 * @param normalColor2
 * @default [128,128,128]
 * @param maxColor1
 * @default [128,128,128]
 * @param maxColor2
 * @default [222,222,222]
 * @param messages
 * @type note
 * @default ""
 */
(() => {
    'use strict';
    const P = PluginManager.parameters('RR_ThrallOverdrive');
    const VX = (window.RRThrallVx = window.RRThrallVx || {});
    const json = (s, d) => { try { const v = JSON.parse(s); return v == null ? d : (typeof v === 'string' ? JSON.parse(v) : v); } catch (_) { return d; } };
    const num = (s, d) => (s === undefined || s === '' || isNaN(Number(s)) ? d : Number(s));
    const idiv = (a, b) => (b === 0 ? 0 : Math.floor(a / b));
    const vars = (id) => ($gameVariables ? $gameVariables.value(id) : 0);
    const C = {
        GAUGE_MAX: num(P.gaugeMax, 1000), GAIN_RATE: json(P.gainRate, [75, 500, 200, 100, 160, 25, 50, 150]), GAUGE_NUMBER: num(P.gaugeNumber, 1),
        ACTOR_TYPE: json(P.actorDriveType, [0, 1, 5]), ENEMY_TYPE: json(P.enemyDriveType, [0, 1, 5]), EMPTY_ON_DEAD: P.emptyOnDead !== 'false',
        HIDE_ACTOR: json(P.hideGaugeActor, []), HIDE_NOT_IN_BATTLE: P.hideNotInBattle !== 'false', HIDE_NO_OD_SKILLS: P.hideNoOdSkills !== 'false',
        NOT_GAIN_HIDING: P.notGainHiding === 'true', HIDE_SKILL_LACK: P.hideSkillLackOfGauge !== 'false', NAME: P.gaugeName || 'Overdrive',
        VALUE_STYLE: num(P.valueStyle, 2), VALUE_FONT: num(P.valueFontSize, 14), OFFSET_Y: num(P.offsetY, -2),
        N1: json(P.normalColor1, [64, 64, 64]), N2: json(P.normalColor2, [128, 128, 128]), M1: json(P.maxColor1, [128, 128, 128]), M2: json(P.maxColor2, [222, 222, 222]),
        MESSAGES: json(P.messages, {})
    };
    const T = { ATTACK: 0, DAMAGE: 1, VICTORY: 2, ESCAPE: 3, ALONE: 4, ACTION: 5, FATAL: 6, GUARD: 7 };
    VX.OD_GAIN_RATE = C.GAIN_RATE;

    // ---- the notes (RPG::UsableItem, RPG::Skill) ----------------------------------------------
    const OD_GAIN = /<(?:OD_INCREASE|od_add)\s*([+-]?\d+)>/i;
    const OVER_DRIVE = /<(?:OVER_DRIVE|overdrive)\s*(\d+)?(\+)?>/i;
    const OD_GAIN_RATE = /<(?:OD_GAIN_RATE|od_gain)\s*(\d+)[%％]?>/i;
    const noteOf = (obj) => String((obj && obj.note) || '');
    const odData = (obj) => {
        const out = { gain: 0, overdrive: false, cost: 0, consumeAll: false, gainRate: 100 };
        if (!obj) return out;
        const isSkill = obj.isSkill ? obj.isSkill() : DataManager.isSkill(obj);
        let cost = C.GAUGE_MAX;
        for (const line of noteOf(obj).split(/\r?\n/)) {
            let m = OD_GAIN.exec(line);
            if (m) { out.gain = Number(m[1]); continue; }
            if (!isSkill) continue;
            m = OVER_DRIVE.exec(line);
            if (m) { out.overdrive = true; if (m[1] !== undefined) cost = Number(m[1]); out.consumeAll = m[2] !== undefined; continue; }
            m = OD_GAIN_RATE.exec(line);
            if (m) out.gainRate = Number(m[1]);
        }
        out.cost = out.overdrive ? cost : 0;
        return out;
    };
    VX.odData = odData;

    // ---- KGC::Commands, on the interpreter --------------------------------------------------------
    const GI = Game_Interpreter.prototype;
    GI.rrGainActorOdGauge = function(actorId, value) {
        if (actorId === -1) { for (const a of $gameParty.members().filter(m => m.isAlive())) if (a.rrCanGainOverdrive()) a.rrSetOverdrive(a.rrOverdrive() + value); }
        else { const a = $gameActors.actor(actorId); if (a && a.isAlive()) a.rrSetOverdrive(a.rrOverdrive() + value); }
    };
    GI.rrGainEnemyOdGauge = function(index, value) {
        if (index === -1) for (const e of $gameTroop.members().filter(m => m.isAlive())) e.rrSetOverdrive(e.rrOverdrive() + value);
        else { const e = $gameTroop.members()[index]; if (e && e.isAlive()) e.rrSetOverdrive(e.rrOverdrive() + value); }
    };
    GI.rrGetActorOdGauge = function(actorId, variableId = 0) {
        const a = $gameActors.actor(actorId);
        const n = a ? a.rrOverdrive() : 0;
        if (variableId > 0) $gameVariables.setValue(variableId, n);
        return n;
    };
    GI.rrGetEnemyOdGauge = function(index, variableId = 0) {
        const e = $gameTroop.members()[index];
        const n = e ? e.rrOverdrive() : 0;
        if (variableId > 0) $gameVariables.setValue(variableId, n);
        return n;
    };
    GI.rrSetActorOdGaugeNumber = function(actorId, number) {
        if (actorId === -1) for (const a of $gameParty.members()) a.rrSetDriveGaugeNumber(number);
        else { const a = $gameActors.actor(actorId); if (a) a.rrSetDriveGaugeNumber(number); }
    };
    GI.rrSetEnemyOdGaugeNumber = function(index, number) {
        if (index === -1) for (const e of $gameTroop.members()) e.rrSetDriveGaugeNumber(number);
        else { const e = $gameTroop.members()[index]; if (e) e.rrSetDriveGaugeNumber(number); }
    };
    GI.rrActorOdGaugeMax = function(actorId) { const a = $gameActors.actor(actorId); return !!a && a.rrOverdrive() === a.rrMaxOverdrive(); };
    GI.rrEnemyOdGaugeMax = function(index) { const e = $gameTroop.members()[index]; return !!e && e.rrOverdrive() === e.rrMaxOverdrive(); };
    GI.rrSetActorDriveType = function(actorId, types = null) {
        if (actorId === -1) for (const a of $gameParty.members()) a._rrDriveType = types;
        else { const a = $gameActors.actor(actorId); if (a) a._rrDriveType = types; }
    };
    GI.rrSetEnemyDriveType = function(index, types = null) {
        if (index === -1) for (const e of $gameTroop.members()) e._rrDriveType = types;
        else { const e = $gameTroop.members()[index]; if (e) e._rrDriveType = types; }
    };

    // ---- Game_Battler -----------------------------------------------------------------------------
    const B = Game_BattlerBase.prototype;
    B.rrOverdrive = function() { if (this._rrOverdrive == null) this._rrOverdrive = 0; return this._rrOverdrive; };
    B.rrSetOverdrive = function(value) { this._rrOverdrive = Math.max(Math.min(Number(value) || 0, this.rrMaxOverdrive()), 0); };
    /** max_overdrive: Thrall resets the gauge count every time it asks; element 32 on the weapon makes two. */
    B.rrMaxOverdrive = function() {
        this._rrDriveGaugeNumber = C.GAUGE_NUMBER;
        if (this.isActor()) { const w = this.rrVxWeapons()[0]; if (w && w.element_set.includes(32)) this._rrDriveGaugeNumber = 2; }
        return C.GAUGE_MAX * this.rrDriveGaugeNumber();
    };
    B.rrOverdriveMax = function() { return this.rrMaxOverdrive(); };
    B.rrOverdriveIsMax = function() { return this.rrOverdrive() === this.rrMaxOverdrive(); };
    B.rrDriveGaugeNumber = function() { if (this._rrDriveGaugeNumber == null) this._rrDriveGaugeNumber = C.GAUGE_NUMBER; return this._rrDriveGaugeNumber; };
    B.rrSetDriveGaugeNumber = function(v) { this._rrDriveGaugeNumber = Math.max(v, 1); };
    B.rrDriveType = function() { return []; };
    B.rrOverdriveSkillLearned = function() { return true; };
    B.rrOdGaugeVisible = function() { return false; };
    B.rrCanGainOverdrive = function() { return true; };
    B.rrDriveAttack = function() { return this.rrDriveType().includes(T.ATTACK); };
    B.rrDriveDamage = function() { return this.rrDriveType().includes(T.DAMAGE); };
    B.rrDriveVictory = function() { return this.rrDriveType().includes(T.VICTORY); };
    B.rrDriveEscape = function() { return this.rrDriveType().includes(T.ESCAPE); };
    B.rrDriveAlone = function() { return this.rrDriveType().includes(T.ALONE); };
    B.rrDriveAction = function() { return this.rrDriveType().includes(T.ACTION); };
    B.rrDriveFatal = function() { if (vars(185) === 24 && this.isActor()) return true; return this.rrDriveType().includes(T.FATAL); };
    B.rrDriveGuard = function() { return this.rrDriveType().includes(T.GUARD); };
    B.rrOdDamage = function() { return this._rrOdDamage || 0; };
    const _clearResults = B.rrVxClearActionResults;
    B.rrVxClearActionResults = function() { _clearResults.call(this); this._rrOdDamage = 0; };
    const _addState = Game_Battler.prototype.addState;
    Game_Battler.prototype.addState = function(stateId) {
        _addState.call(this, stateId);
        if (this.isDead()) this.rrResetOverdriveOnDead();
    };
    B.rrResetOverdriveOnDead = function() { if (C.EMPTY_ON_DEAD) this.rrSetOverdrive(0); };
    B.rrCalcOdCost = function(skill) { if (!skill || !(skill.isSkill ? skill.isSkill() : DataManager.isSkill(skill))) return 0; return odData(skill).cost; };
    const _canUseExtra = B.rrVxSkillCanUseExtra;
    B.rrVxSkillCanUseExtra = function(skill) {
        if (_canUseExtra && !_canUseExtra.call(this, skill)) return false;
        return !(this.rrCalcOdCost(skill) > this.rrOverdrive());
    };
    // apply_od_consume_all_for_damage: a skill that uses the whole gauge hits harder the fuller it was.
    const _afterObj = B.rrVxAfterObjDamageValue;
    B.rrVxAfterObjDamageValue = function(user, obj) {
        if (_afterObj) _afterObj.call(this, user, obj);
        if (!obj || !obj.isSkill()) return;
        const od = odData(obj);
        if (!od.overdrive || !od.consumeAll) return;
        const rate = Math.max(idiv(user.rrOverdrive() * 1000, od.cost), 1000);
        const r = this.rrVxResult();
        r.hpDamage = idiv(r.hpDamage * rate, 1000);
        r.mpDamage = idiv(r.mpDamage * rate, 1000);
    };
    const _executeDamage = B.rrVxExecuteDamage;
    B.rrVxExecuteDamage = function(user) {
        _executeDamage.call(this, user);
        this.rrIncreaseOverdrive(user);
        this.rrIncreaseOverdriveByItem(user);
    };
    /** Gain Overdrive (Thrall): a hero reaching a full gauge hears Saint2. */
    B.rrGainOverdrive = function(unit, value) {
        if (unit.isActor() && unit.rrOverdrive() < 1000 && unit.rrOverdrive() + value >= 1000) AudioManager.playSe({ name: 'Saint2', volume: 80, pitch: 150, pan: 0 });
        unit.rrSetOverdrive(unit.rrOverdrive() + value);
    };
    B.rrIncreaseOverdrive = function(attacker) {
        if (!(attacker instanceof Game_BattlerBase)) return;
        if (this.isActor() === attacker.isActor()) return;
        const r = this.rrVxResult();
        if (r.hpDamage === 0 && r.mpDamage === 0) return;
        this.rrIncreaseAttackerOverdrive(attacker);
        this.rrIncreaseDefenderOverdrive(attacker);
        if (this.isDead()) this.rrResetOverdriveOnDead();
    };
    B.rrIncreaseAttackerOverdrive = function(attacker) {
        // KGC asks whether the one hit (not the attacker) may gain.
        if (!this.rrCanGainOverdrive()) return;
        if (!attacker.rrDriveAttack()) return;
        let gain = C.GAIN_RATE[T.ATTACK];
        const act = attacker.rrVxAction();
        if (act.kind === 1) {
            const rate = odData(act.skill()).gainRate;
            gain = idiv(gain * rate, 100);
            if (rate > 0) gain = Math.max(gain, 1); else if (rate < 0) gain = Math.min(gain, -1);
        }
        if (attacker.isActor()) {
            const w = attacker.rrVxWeapons().filter(Boolean)[0];
            if (w) {
                if (w.element_set.includes(16)) gain = idiv(gain, 2);
                if (w.element_set.includes(17)) gain = idiv(gain, 3);
                if (act.kind === 1) {
                    if (w.element_set.includes(1)) { if (VX.nameWord(w) !== 'Atlas') gain = idiv(gain, 2); }
                    else if (w.element_set.includes(4)) gain = idiv(gain, 3);
                }
            }
        }
        if (vars(91) === 6) gain -= idiv(gain, 2);
        if (vars(92) === 6) gain -= idiv(gain, 2);
        this.rrGainOverdrive(attacker, gain);
    };
    B.rrIncreaseDefenderOverdrive = function(/* attacker */) {
        if (!this.rrCanGainOverdrive()) return;
        if (!this.rrDriveDamage()) return;
        const rate = C.GAIN_RATE[T.DAMAGE];
        const r = this.rrVxResult();
        let gain = 0;
        if (r.hpDamage > 0) gain += this.isEnemy() ? idiv(r.hpDamage * rate * 2, this.mhp) : idiv(r.hpDamage * rate, this.mhp);
        if (r.mpDamage > 0 && this.mmp > 0) gain += idiv(r.mpDamage * rate, this.mmp);
        if (rate > 0) gain = Math.max(gain, 1); else if (rate < 0) gain = Math.min(gain, -1);
        if (vars(91) === 6) gain -= idiv(gain, 2);
        if (vars(92) === 6) gain -= idiv(gain, 2);
        this.rrGainOverdrive(this, gain);
    };
    B.rrIncreaseOverdriveByItem = function(user) {
        if (!(user instanceof Game_BattlerBase)) return;
        if (!this.rrCanGainOverdrive()) return;
        const act = user.rrVxAction();
        const obj = act.isSkill() ? act.skill() : act.isItem() ? act.item() : null;
        if (!obj) return;
        this._rrOdDamage = -odData(obj).gain;
        this.rrSetOverdrive(this.rrOverdrive() - this._rrOdDamage);
    };

    // ---- Game_Actor / Game_Enemy --------------------------------------------------------------------
    const _actorSetup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _actorSetup.call(this, actorId);
        this._rrOverdrive = 0;
        this._rrDriveType = null;
    };
    Game_Actor.prototype.rrDriveType = function() { return Array.isArray(this._rrDriveType) ? this._rrDriveType : C.ACTOR_TYPE; };
    Game_Actor.prototype.rrOverdriveSkillLearned = function() { return this.skills().some(s => odData(s).overdrive); };
    Game_Actor.prototype.rrCanGainOverdrive = function() {
        if (C.NOT_GAIN_HIDING && !this.rrOdGaugeVisibleL()) return false;
        if (C.HIDE_NO_OD_SKILLS && !this.rrOverdriveSkillLearned()) return false;
        return true;
    };
    Game_Actor.prototype.rrOdGaugeVisible = function() { return this.rrOdGaugeVisibleL() && this.rrCanGainOverdrive(); };
    Game_Actor.prototype.rrOdGaugeVisibleL = function() {
        if (C.HIDE_NOT_IN_BATTLE && !$gameParty.inBattle()) return false;
        return !C.HIDE_ACTOR.includes(this._actorId);
    };
    const _enemySetup = Game_Enemy.prototype.setup;
    Game_Enemy.prototype.setup = function(enemyId, x, y) {
        _enemySetup.call(this, enemyId, x, y);
        this._rrOverdrive = 0;
        this._rrDriveType = null;
    };
    Game_Enemy.prototype.rrDriveType = function() { return Array.isArray(this._rrDriveType) ? this._rrDriveType : C.ENEMY_TYPE; };

    // ---- the skill list hides overdrives the gauge cannot pay; the menu pays them ---------------------
    if (C.HIDE_SKILL_LACK) {
        const _includes = Window_SkillList.prototype.includes;
        Window_SkillList.prototype.includes = function(item) {
            if (!item) return false;
            if (!_includes.call(this, item)) return false;
            if (odData(item).overdrive && this._actor) return this._actor.rrCalcOdCost(item) <= this._actor.rrOverdrive();
            return true;
        };
    }
    const _paySkillCost = Game_BattlerBase.prototype.paySkillCost;
    Game_BattlerBase.prototype.paySkillCost = function(skill) {
        _paySkillCost.call(this, skill);
        if (VX.battleActive && VX.battleActive()) return;
        const od = odData(skill);
        if (od.consumeAll) this.rrSetOverdrive(0); else this.rrSetOverdrive(this.rrOverdrive() - this.rrCalcOdCost(skill));
    };

    // ---- the battle scene's hooks (RR_ThrallATB calls them) ------------------------------------------
    const S = Scene_Battle.prototype;
    S.rrGainOverdrive = function(unit, value) { B.rrGainOverdrive.call(unit, unit, value); };
    S.rrIncreaseOverdriveOnBattleEnd = function(result) {
        if (result === 0) { const g = C.GAIN_RATE[T.VICTORY]; for (const a of $gameParty.members().filter(m => m.isAlive())) if (a.rrDriveVictory()) a.rrSetOverdrive(a.rrOverdrive() + g); }
        else if (result === 1) { const g = C.GAIN_RATE[T.ESCAPE]; for (const a of $gameParty.members().filter(m => m.isAlive())) if (a.rrDriveEscape()) a.rrSetOverdrive(a.rrOverdrive() + g); }
    };
    S.rrIncreaseOverdriveOnAction = function() {
        const b = this._rrActive;
        if (!b) return;
        let gain = 0;
        const unit = b.isActor() ? $gameParty : $gameTroop;
        if (b.rrDriveAlone() && unit.members().filter(m => m.isAlive()).length === 1) gain += C.GAIN_RATE[T.ALONE];
        if (b.rrDriveAction()) gain += C.GAIN_RATE[T.ACTION];
        const act = b.rrVxAction();
        if (b.rrDriveGuard() && act.kind === 0 && act.basic === 1) gain += C.GAIN_RATE[T.GUARD];
        this.rrGainOverdrive(b, gain);
    };
    S.rrConsumeOdGauge = function() {
        const b = this._rrActive;
        if (!b) return;
        const act = b.rrVxAction();
        if (!act.isSkill()) return;
        const skill = act.skill();
        if (odData(skill).consumeAll) { b.rrSetOverdrive(0); $gameVariables.setValue(184, vars(184) + 1); }
        else {
            b.rrSetOverdrive(b.rrOverdrive() - b.rrCalcOdCost(skill));
            if (b.isActor() && b.rrCalcOdCost(skill) > 0) $gameVariables.setValue(184, vars(184) + 1);
        }
    };

    // ---- Window_Base: KGC's gauge, for a menu that draws one -------------------------------------------
    const css = (c) => `rgba(${c[0]},${c[1]},${c[2]},${(c[3] === undefined ? 255 : c[3]) / 255})`;
    Window_Base.prototype.rrVxDrawActorOdGauge = function(actor, x, y, width = 80) {
        if (!actor.rrOdGaugeVisible()) return;
        let n = actor.rrOverdrive() % C.GAUGE_MAX;
        if (actor.rrOverdriveIsMax()) n = C.GAUGE_MAX;
        const gw = idiv(width * n, C.GAUGE_MAX);
        const full = gw === width;
        const back = this.rrVxGaugeBackColor ? this.rrVxGaugeBackColor() : ColorManager.gaugeBackColor();
        this.contents.fillRect(x, y + 24 + C.OFFSET_Y, width, 6, back);
        this.contents.gradientFillRect(x, y + 24 + C.OFFSET_Y, gw, 6, css(full ? C.M1 : C.N1), css(full ? C.M2 : C.N2));
        this.rrVxDrawActorOdGaugeValue(actor, x, y, width);
    };
    Window_Base.prototype.rrVxDrawActorOdGaugeValue = function(actor, x, y, width = 80) {
        const od = actor.rrOverdrive();
        const value = od * 100.0 / C.GAUGE_MAX;
        let text;
        switch (C.VALUE_STYLE) {
            case 1: text = String(od); break;
            case 2: text = idiv(od * 100, C.GAUGE_MAX) + '%'; break;
            case 3: text = value.toFixed(1) + '%'; break;
            case 4: text = value.toFixed(2) + '%'; break;
            case 5: text = String(idiv(od, C.GAUGE_MAX)); break;
            default: return;
        }
        const last = this.contents.fontSize;
        const size = this.rrVxFontSize ? this.rrVxFontSize(C.VALUE_FONT) : C.VALUE_FONT;
        this.contents.fontSize = size;
        this.contents.drawText(text, x, y + 24 + C.OFFSET_Y - idiv(C.VALUE_FONT, 2), width, size, 'right');
        this.contents.fontSize = last;
    };
})();
