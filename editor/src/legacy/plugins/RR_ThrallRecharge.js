/*:
 * @target MZ
 * @plugindesc Recharge Skills (VX), for imported games
 * @author modern algebra (rmrk.net); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallRecharge.js
 *
 * A skill with \charge[x] in its note cannot be used again for x turns
 * after it is used (the skill list shows the turns left). Weapons and armours
 * with \recharge[x] add x turns to every charge their wearer starts; classes
 * and actors add their own (settings below: a whole number adds turns, a
 * decimal multiplies them). A skill or item with \refresh clears every
 * charge on its target.
 *
 * Thrall's own rules in the script: Rapid Fire takes 2 turns off, Wide Range
 * and Revealing add 4 per extra target, Viral takes 3 off Poison; Aura
 * (cleared by Renewal) charges only while no one has state 20 and twice as
 * fast with Rested at full HP; Stalking only out of state 7; Poison only out
 * of state 7 with Silent; Rage only out of state 26, twice as fast with
 * Frustration at half HP or less; Shine and Battle Cry always. Only an actor
 * who knows a Burst skill counts down all charges each turn (two at a time
 * with Overcharge while all three Bursts charge); every enemy does.
 *
 * As in the original, a state's or enemy's \recharge never counts (its
 * pattern looks for two backslashes), and the countdown runs at each
 * turn_end the battle calls (after every action in the ATB battle).
 *
 * For the battle port:
 *   battler.rrSetSkillRecharge(skill, count)   set_skill_recharge (on use;
 *                                              count: extra targets)
 *   BattleManager.rrThrallRechargeTurnEnd()     the turn_end countdown
 *   battler.rrUpdateSkillRecharge(turns)        update_skill_recharge
 *   battler.rrUpdateSingleSkillRecharge(id, n)  update_single_skill_recharge
 *   battler.rrGetScTurns(skill)                 get_sc_turns
 * Script call: battler.rrClearSkillRecharge(id)   clear_skill_recharge (id 0
 * or none: all).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param classMods
 * @text Class recharge modifiers
 * @desc JSON { classId: "n" }: a whole number adds turns, a decimal ("1.0") multiplies.
 * @default {"1":"0","2":"1.0"}
 *
 * @param actorMods
 * @text Actor recharge modifiers
 * @desc JSON { actorId: "n" }: a whole number adds turns, a decimal ("1.0") multiplies.
 * @default {"1":"0","2":"1.0"}
 *
 * @param readySe
 * @text Charged sound
 * @desc Played when an actor's skill finishes charging.
 * @default Recovery
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallRecharge');
    const json = (v, d) => { try { const x = JSON.parse(v); return x == null ? d : x; } catch (_) { return d; } };
    /** A Ruby number from its text: { value, float }. */
    const mod = (text) => {
        const s = String(text ?? '0').trim();
        return { value: Number(s) || 0, float: /[.eE]/.test(s) };
    };
    const modTable = (raw) => { const out = {}; for (const [k, v] of Object.entries(json(raw, {}))) out[k] = mod(v); return out; };
    const CLASS_MODS = modTable(params.classMods || '{"1":"0","2":"1.0"}');
    const ACTOR_MODS = modTable(params.actorMods || '{"1":"0","2":"1.0"}');
    const READY_SE = params.readySe === undefined ? 'Recovery' : String(params.readySe);
    const ZERO = { value: 0, float: false };
    /** Ruby Float#round: halves away from zero. */
    const rubyRound = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
    /** Ruby String#to_i: the leading integer, else 0. */
    const toI = (s) => { const m = /^\s*([+-]?\d+)/.exec(String(s)); return m ? Number(m[1]) : 0; };
    const VX = () => window.RRThrallVx || null;
    /** The MZ skill of an id, an MZ skill or the battle rules' VX record of one. */
    const dataSkill = (s) => (typeof s === 'number' ? $dataSkills[s] : (s && $dataSkills[s.id]) || s || null);
    const noteOf = (obj) => String((obj && obj.note) || '');

    // RPG::UsableItem#refresh_charges?, RPG::Skill#recharge_time, RPG::Weapon/Armor#recharge_mod
    const refreshCharges = (item) => /\\REFRESH/i.test(noteOf(item));
    const rechargeTime = (skill) => { const m = /\\CHARGE\[(\d+)\]/i.exec(noteOf(skill)); return m ? Number(m[1]) : 0; };
    const equipRechargeMod = (item) => {
        const note = noteOf(item);
        if (!note.includes('\\recharge')) return 0;
        const part = note.split('echarge[')[1];
        return part === undefined ? 0 : toI(part.split(']')[0]);
    };
    window.RRThrallRecharge = { refreshCharges, rechargeTime, equipRechargeMod };

    const learned = (battler, id) => (battler.rrVxSkillLearn ? battler.rrVxSkillLearn(id) : battler.isLearnedSkill(id));
    /** skill_can_use? as the battle rules have it (MZ's when they are off). */
    const canUse = (battler, id) => {
        const vx = VX();
        if (battler.rrVxSkillCanUse && vx && vx.skill) return battler.rrVxSkillCanUse(vx.skill(id));
        return battler.canUse($dataSkills[id]);
    };
    const playReady = (battler) => { if (battler.isActor() && READY_SE) AudioManager.playSe({ name: READY_SE, volume: 100, pitch: 100, pan: 0 }); };

    //-------------------------------------------------------------------------
    // Game_Battler: @sc_turns_count
    //-------------------------------------------------------------------------
    const B = Game_BattlerBase.prototype;
    B.rrScTurns = function() { return this._rrScTurns || (this._rrScTurns = {}); };
    B.rrGetScTurns = function(skill) {
        const id = typeof skill === 'number' ? skill : skill ? skill.id : 0;
        return this.rrScTurns()[id] || 0;
    };
    B.rrRechargeMod = function() {
        // States' and enemies' modifiers never match their pattern (see the help): nothing.
        return [0, 1.0];
    };
    B.rrSetSkillRecharge = function(skill, count = 0) {
        skill = dataSkill(skill);
        const time = rechargeTime(skill);
        if (time === 0) return;
        const turns = this.rrScTurns();
        let t = time;
        if (this.isActor()) {
            if (learned(this, 67)) t -= 2;   // Rapid Fire
            if (learned(this, 93)) t += count * 4;   // Wide Range
            if (learned(this, 126)) t += count * 4;   // Revealing
            if (learned(this, 134) && skill.id === 128) t -= 3;   // Viral
        }
        const [direct, percent] = this.rrRechargeMod();
        t += direct;
        t = rubyRound(t * percent);
        t += 1;
        if (t < 1) delete turns[skill.id]; else turns[skill.id] = t;
    };
    B.rrClearSkillRecharge = function(skillId = 0) {
        if (!skillId) this._rrScTurns = {};
        else delete this.rrScTurns()[skillId];
    };
    B.rrUpdateSkillRecharge = function(n = 1) {
        const turns = this.rrScTurns();
        for (const key of Object.keys(turns)) {
            turns[key] -= n;
            if (turns[key] <= 0) { delete turns[key]; playReady(this); }
        }
    };
    B.rrUpdateSingleSkillRecharge = function(skillId, n) {
        const turns = this.rrScTurns();
        for (const key of Object.keys(turns)) {
            if (Number(key) === Number(skillId)) turns[key] -= n;
            if (turns[key] <= 0) { delete turns[key]; playReady(this); }
        }
    };
    const isCharged = (battler, skill) => !!skill && battler.rrGetScTurns(skill) > 0;
    const hasCharges = (battler) => Object.keys(battler.rrScTurns()).length > 0;

    //-------------------------------------------------------------------------
    // Game_Actor: class, actor and equipment modifiers
    //-------------------------------------------------------------------------
    const _setup = Game_Actor.prototype.setup;
    Game_Actor.prototype.setup = function(actorId) {
        _setup.call(this, actorId);
        this._rrBaseRecharge = ACTOR_MODS[actorId] || ZERO;
    };
    Game_Actor.prototype.rrRechargeMod = function() {
        let [direct, percent] = B.rrRechargeMod.call(this);
        const apply = (m) => { if (m.float) percent *= m.value; else direct += m.value; };
        const classId = this.rrVxClassId ? this.rrVxClassId() : this._classId;
        apply(CLASS_MODS[classId] || ZERO);
        apply(this._rrBaseRecharge || ACTOR_MODS[this._actorId] || ZERO);
        for (const item of this.equips()) if (item) direct += equipRechargeMod(item);
        return [direct, percent];
    };

    //-------------------------------------------------------------------------
    // skill_can_use?, skill_test / skill_effect, item_test / item_effect
    //-------------------------------------------------------------------------
    const _meets = B.meetsSkillConditions;
    B.meetsSkillConditions = function(skill) {
        if (isCharged(this, skill)) return false;
        return _meets.call(this, skill);
    };
    // The battle rules' VX skill_can_use?, when that port is on (it loads before this one).
    if (typeof B.rrVxSkillCanUseExtra === 'function') {
        const _extra = B.rrVxSkillCanUseExtra;
        B.rrVxSkillCanUseExtra = function(skill) {
            if (isCharged(this, skill)) return false;
            return _extra.call(this, skill);
        };
    }
    const clearOnSkill = (target, user, skill) => {
        if (refreshCharges(dataSkill(skill))) target.rrClearSkillRecharge();
        // Aura (95) clears its target's charges once the user has Renewal (123).
        if (user && user.isActor() && skill && skill.id === 95 && learned(user, 123)) target.rrClearSkillRecharge();
    };
    const wrap = (name, before) => {
        const original = B[name];
        if (typeof original !== 'function') return;
        B[name] = function(user, obj) {
            const r = before.call(this, user, obj);
            if (r !== undefined) return r;
            return original.call(this, user, obj);
        };
    };
    wrap('rrVxSkillTest', function(user, skill) { if (refreshCharges(dataSkill(skill)) && hasCharges(this)) return true; });
    wrap('rrVxSkillEffect', function(user, skill) { clearOnSkill(this, user, skill); });
    wrap('rrVxItemTest', function(user, item) { if (refreshCharges($dataItems[item.id]) && hasCharges(this)) return true; });
    wrap('rrVxItemEffect', function(user, item) { if (refreshCharges($dataItems[item.id])) this.rrClearSkillRecharge(); });
    // MZ's own actions (menus that use them): the same, once per target.
    const _testApply = Game_Action.prototype.testApply;
    Game_Action.prototype.testApply = function(target) {
        if (refreshCharges(this.item()) && hasCharges(target)) return true;
        return _testApply.call(this, target);
    };
    const _apply = Game_Action.prototype.apply;
    Game_Action.prototype.apply = function(target) {
        if (this.isSkill()) clearOnSkill(target, this.subject(), this.item());
        else if (refreshCharges(this.item())) target.rrClearSkillRecharge();
        _apply.call(this, target);
    };

    //-------------------------------------------------------------------------
    // Scene_Battle#turn_end: the countdown
    //-------------------------------------------------------------------------
    function rechargeTurnEnd() {
        for (const battler of $gameTroop.members().concat($gameParty.members())) {
            if (!battler.isActor()) { battler.rrUpdateSkillRecharge(); continue; }
            // Aura: charges while no one is under it; twice with Rested at full HP.
            if (learned(battler, 95) && !canUse(battler, 95)) {
                const charge = !$gameParty.members().some(m => m.isStateAffected(20));
                if (learned(battler, 100) && battler.hp === battler.mhp) { if (charge) battler.rrUpdateSingleSkillRecharge(95, 2); }
                else if (charge) battler.rrUpdateSingleSkillRecharge(95, 1);
            }
            if (learned(battler, 96)) battler.rrUpdateSingleSkillRecharge(96, 1);   // Shine
            if (learned(battler, 127) && !canUse(battler, 127) && !battler.isStateAffected(7)) battler.rrUpdateSingleSkillRecharge(127, 1);   // Stalking
            if (learned(battler, 128)) {   // Poison (with Silent, not while stalking)
                if (learned(battler, 143)) { if (!battler.isStateAffected(7)) battler.rrUpdateSingleSkillRecharge(128, 1); }
                else battler.rrUpdateSingleSkillRecharge(128, 1);
            }
            if (learned(battler, 159) && !canUse(battler, 159) && !battler.isStateAffected(26)) {   // Rage (Frustration at half HP)
                if (learned(battler, 185) && battler.hp <= Math.floor(battler.mhp / 2)) battler.rrUpdateSingleSkillRecharge(159, 2);
                else battler.rrUpdateSingleSkillRecharge(159, 1);
            }
            if (learned(battler, 160)) battler.rrUpdateSingleSkillRecharge(160, 1);   // Battle Cry
            if (learned(battler, 62) || learned(battler, 63) || learned(battler, 64)) {   // Burst
                const allCharging = [62, 63, 64].every(id => learned(battler, id) && !canUse(battler, id));
                battler.rrUpdateSkillRecharge(learned(battler, 89) && allCharging ? 2 : 1);
            }
        }
    }
    BattleManager.rrThrallRechargeTurnEnd = rechargeTurnEnd;
    // The battle port's turn_end when it has one; MZ's turn end otherwise. Decided once every plugin has loaded.
    let hooked = false;
    function hookTurnEnd() {
        if (hooked) return;
        hooked = true;
        if (typeof Scene_Battle.prototype.rrVxTurnEnd === 'function') {
            const _turnEnd = Scene_Battle.prototype.rrVxTurnEnd;
            Scene_Battle.prototype.rrVxTurnEnd = function(...args) {
                rechargeTurnEnd();
                return _turnEnd.apply(this, args);
            };
            return;
        }
        const _endTurn = BattleManager.endTurn;
        BattleManager.endTurn = function() {
            rechargeTurnEnd();
            _endTurn.call(this);
        };
        // MZ's own battles start the charge when the skill is used.
        const _useItem = Game_Battler.prototype.useItem;
        Game_Battler.prototype.useItem = function(item) {
            _useItem.call(this, item);
            if (DataManager.isSkill(item) && $gameParty.inBattle()) this.rrSetSkillRecharge(item, 0);
        };
    }
    const _bootStart = Scene_Boot.prototype.start;
    Scene_Boot.prototype.start = function() {
        hookTurnEnd();
        _bootStart.call(this);
    };
})();
