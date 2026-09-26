/*:
 * @target MZ
 * @plugindesc Yanfly Engine Ace - Weapon Attack Replace (VX Ace), for imported games
 * @author Yanfly; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_YanflyWeaponAttack.js
 *
 * An actor's Attack command uses the attack skill of the first weapon the
 * actor holds (<attack skill: x> in the weapon's note; a weapon without the
 * tag attacks with the default skill). Without a weapon, the actor's
 * <attack skill: x> is used, then the class's (the default skill when the
 * class has no tag). Enemies always attack with the default skill. The attack
 * skill's costs and conditions decide whether Attack can be chosen.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 *
 * @param defaultAttackSkillId
 * @text Default attack skill
 * @type skill
 * @default 1
 */
(() => {
    'use strict';
    const params = PluginManager.parameters('RR_YanflyWeaponAttack');
    const DEFAULT = Number(params.defaultAttackSkillId) || 1;
    const TAG = /<(?:ATTACK_SKILL|attack skill):[ ](\d+)>/i;
    const cache = new WeakMap();
    /** The record's <attack skill: x> (the last one in the note), or null. */
    const tagged = (obj) => {
        if (!obj || typeof obj !== 'object') return null;
        if (!cache.has(obj)) {
            let id = null;
            for (const line of String(obj.note || '').split(/[\r\n]+/)) {
                const m = TAG.exec(line);
                if (m) id = Number(m[1]);
            }
            cache.set(obj, id);
        }
        return cache.get(obj);
    };

    Game_BattlerBase.prototype.attackSkillId = function() {
        return this.isActor() ? this.rrWeaponAttackSkillId() : DEFAULT;
    };
    Game_Actor.prototype.rrWeaponAttackSkillId = function() {
        const weapon = this.weapons().find(Boolean);
        if (weapon) return tagged(weapon) ?? DEFAULT;
        const own = tagged(this.actor());
        if (own !== null) return own;
        return tagged(this.currentClass()) ?? DEFAULT;
    };
})();
