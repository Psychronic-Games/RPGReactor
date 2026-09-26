/*:
 * @target MZ
 * @plugindesc Follow-Up Skill (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyFollowUpSkill.js
 *
 * A skill that hits can make its user use a second skill straight after, at
 * the same target (a random one when the user has no action of its own).
 * Skill notes:
 *   <follow up n>              skill n follows every hit
 *   <follow up n: y%>          skill n follows a hit y% of the time
 *   <follow up state: n, n>    (or "all states") only while the user has all
 *   <follow up any states: n>  only while the user has one of them
 *   <follow up switch: n, n>   (or "all switch") only while all are ON
 *   <follow up eval>           code (run as JavaScript here, `this` is the
 *   ...                        user); true lets the skill follow
 *   </follow up eval>
 * A follow-up waiting to act blocks another one being queued.
 *
 * Kept as the original had them: <follow up any switch> is read but never
 * checked (the check looks at the "all" switches instead), and once
 * <follow up eval> opens, every later line of the note joins the code, as
 * the closing tag never closed it.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 */
(() => {
    'use strict';
    const RE = {
        chance: /<(?:FOLLOW_UP|follow up)[ ](\d+):[ ](\d+)([%％])>/i,
        plain: /<(?:FOLLOW_UP|follow up)[ ](\d+)>/i,
        states: /<(?:FOLLOW_UP_STATE|follow up state):[ ](\d+(?:\s*,\s*\d+)*)>/i,
        allStates: /<(?:FOLLOW_UP_ALL_STATES|follow up all states):[ ](\d+(?:\s*,\s*\d+)*)>/i,
        anyStates: /<(?:FOLLOW_UP_ANY_STATES|follow up any states):[ ](\d+(?:\s*,\s*\d+)*)>/i,
        switch: /<(?:FOLLOW_UP_SWITCH|follow up switch):[ ](\d+(?:\s*,\s*\d+)*)>/i,
        allSwitch: /<(?:FOLLOW_UP_ALL_SWITCH|follow up all switch):[ ](\d+(?:\s*,\s*\d+)*)>/i,
        anySwitch: /<(?:FOLLOW_UP_ANY_SWITCH|follow up any switch):[ ](\d+(?:\s*,\s*\d+)*)>/i,
        evalOn: /<(?:FOLLOW_UP_EVAL|follow up eval)>/i, evalOff: /<\/(?:FOLLOW_UP_EVAL|follow up eval)>/i
    };
    const ids = (s) => (s.match(/\d+/g) || []).map(Number).filter(n => n > 0);
    const cache = new WeakMap();
    /** A skill's follow-up settings, read from its note as the original read them. */
    const followUp = (skill) => {
        let out = cache.get(skill);
        if (out) return out;
        out = { skillId: 0, chance: 1, statesAll: [], statesAny: [], switchAll: [], switchAny: [], code: '' };
        let evalOn = false, m;
        for (const line of String(skill.note || '').split(/[\r\n]+/)) {
            // Ruby's case takes the first pattern that matches; <follow up n> is tried before <follow up n: y%>.
            if ((m = RE.plain.exec(line))) { out.skillId = Number(m[1]); out.chance = 1; }
            else if ((m = RE.chance.exec(line))) { out.skillId = Number(m[1]); out.chance = Number(m[2]) * 0.01; }
            else if ((m = RE.states.exec(line)) || (m = RE.allStates.exec(line))) out.statesAll.push(...ids(m[1]));
            else if ((m = RE.anyStates.exec(line))) out.statesAny.push(...ids(m[1]));
            else if ((m = RE.switch.exec(line)) || (m = RE.allSwitch.exec(line))) out.switchAll.push(...ids(m[1]));
            else if ((m = RE.anySwitch.exec(line))) out.switchAny.push(...ids(m[1]));
            else if (RE.evalOn.test(line)) evalOn = true;
            else if (RE.evalOff.test(line)) { /* the original cleared another flag here, so the code block stays open */ }
            else if (evalOn) out.code += line;
        }
        cache.set(skill, out);
        return out;
    };

    const B = Game_Battler.prototype;
    B.rrFollowUpAllStates = function(f) {
        return f.statesAll.every(id => !$dataStates[id] || this.isStateAffected(id));
    };
    B.rrFollowUpAnyStates = function(f) {
        if (!f.statesAny.length) return true;
        return f.statesAny.some(id => $dataStates[id] && this.isStateAffected(id));
    };
    B.rrFollowUpAllSwitch = function(f) { return f.switchAll.every(id => $gameSwitches.value(id)); };
    B.rrFollowUpAnySwitch = function(f) {
        if (!f.switchAll.length) return true;
        return f.switchAll.some(id => $gameSwitches.value(id));
    };
    B.rrFollowUpEval = function(f) {
        if (!f.code) return true;
        try { return !!new Function('return (' + f.code + ');').call(this); } catch (_) { return false; }
    };
    /** The action waiting right after the one being carried out, where a follow-up goes. */
    B.rrFollowUpSlot = function(executing) { return executing ? this._actions[0] : this._actions[1]; };
    B.rrMeetFollowUpRequirements = function(item, executing) {
        if (!item || !DataManager.isSkill(item)) return false;
        const next = this.rrFollowUpSlot(executing);
        if (next && next._rrFollowUp) return false;
        const f = followUp(item);
        if (!$dataSkills[f.skillId]) return false;
        if (!this.rrFollowUpAllStates(f) || !this.rrFollowUpAnyStates(f)) return false;
        if (!this.rrFollowUpAllSwitch(f) || !this.rrFollowUpAnySwitch(f)) return false;
        if (!this.rrFollowUpEval(f)) return false;
        return Math.random() < f.chance;
    };
    /**
     * Queues the follow-up after `action` (the action that hit). The action BattleManager is carrying out has
     * already left the user's list, so the follow-up goes first in it; for any other (a counter), after the
     * user's own next action, and nowhere when the user has none left.
     */
    B.rrProcessFollowUpSkill = function(item, action) {
        const executing = !!action && BattleManager._action === action;
        if (!this.rrMeetFollowUpRequirements(item, executing)) return;
        const current = executing ? action : this._actions[0];
        const followUpAction = new Game_Action(this);
        followUpAction.setSkill(followUp(item).skillId);
        if (!current) followUpAction.decideRandomTarget();
        else followUpAction.setTarget(current._targetIndex);
        followUpAction._rrFollowUp = true;
        if (executing) this._actions.unshift(followUpAction);
        else if (this._actions.length) this._actions.splice(1, 0, followUpAction);
    };

    const _applyItemUserEffect = Game_Action.prototype.applyItemUserEffect;
    Game_Action.prototype.applyItemUserEffect = function(target) {
        _applyItemUserEffect.call(this, target);
        this.subject().rrProcessFollowUpSkill(this.item(), this);
    };
    window.RRYanflyFollowUp = { followUp };
})();
