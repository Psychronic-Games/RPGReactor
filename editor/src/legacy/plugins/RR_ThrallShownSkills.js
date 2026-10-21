/*:
 * @target MZ
 * @plugindesc Shown Skills Fix (VX), for imported games
 * @author Yanfly (Yanfly Engine RD); ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_ThrallShownSkills.js
 *
 * The skill lists leave out skills that cannot be used where they are shown
 * (outside their occasion in battle) and skills with <hide skill> in their
 * note. As Thrall edited it, a hidden overdrive skill (<overdrive …> in its
 * note) shows once the actor's overdrive gauge is full, and Resuscitate
 * (skill 198) while a party member is down. Overdrive skills come first,
 * then weapon skills (id 220 and up), then the rest.
 *
 * The overdrive gauge is the battle port's (actor.rrOverdrive()).
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param weaponSkillFrom
 * @text First weapon skill
 * @type number
 * @default 220
 *
 * @param reviveSkill
 * @text Revive skill
 * @type number
 * @default 198
 *
 * @param overdriveMax
 * @text Full overdrive gauge
 * @type number
 * @default 1000
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_ThrallShownSkills');
    const WEAPON_FROM = Number(params.weaponSkillFrom || 220);
    const REVIVE = Number(params.reviveSkill || 198);
    const OD_MAX = Number(params.overdriveMax || 1000);
    const lines = (skill) => String(skill.note || '').split(/[\r\n]+/);
    const hideSkill = (skill) => lines(skill).some(l => /<(?:HIDE_SKILL|hide skill)>/i.test(l));
    const overdriveSkill = (skill) => lines(skill).some(l => /<overdrive (.*)>/i.test(l));
    const weaponSkill = (skill) => skill.id >= WEAPON_FROM;
    const battleOk = (skill) => skill.occasion === 0 || skill.occasion === 1;
    window.RRThrallShownSkills = { hideSkill, overdriveSkill, weaponSkill };

    const W = Window_SkillList.prototype;
    W.rrVxInclude = function(skill) {
        if (!skill) return false;
        if (hideSkill(skill)) {
            if (overdriveSkill(skill)) return (this._actor.rrOverdrive ? this._actor.rrOverdrive() : 0) >= OD_MAX;
            if (skill.id === REVIVE) return $gameParty.members().some(m => m.isDead());
            return false;
        }
        if ($gameParty.inBattle() && !battleOk(skill)) return false;
        return true;
    };
    // VX has no skill types: every list holds all of the actor's skills, by the rules above.
    W.includes = function(skill) { return this.rrVxInclude(skill); };
    W.makeItemList = function() {
        this._data = [];
        if (!this._actor) return;
        const skills = this._actor.skills();
        const pass = (od, weapon) => skills.filter(s => this.rrVxInclude(s) && overdriveSkill(s) === od && weaponSkill(s) === weapon);
        this._data = pass(true, false).concat(pass(false, true), pass(false, false));
    };
})();
