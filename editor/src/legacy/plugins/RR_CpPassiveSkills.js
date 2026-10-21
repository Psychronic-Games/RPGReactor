/*:
 * @target MZ
 * @plugindesc CP Passive Skills (VX Ace), for imported games
 * @author Neon Black; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 *
 * @help RR_CpPassiveSkills.js
 *
 * A skill whose note has passive[n] gives the actor who knows it the traits
 * of state n for as long as the skill is known, without the state being on
 * the actor (no icon, no turns, never removed). One passive per note line;
 * several lines give several, and two skills naming the same state give its
 * traits twice. Skills that only a passive state adds give no passives of
 * their own. Enemies have passives only where the game gave them a skill
 * list (Victor Engine's Basic Module: the skills of their actions); without
 * one they have none. No script calls.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
 *
 * @param enemySkills
 * @text Enemy skills
 * @type select
 * @option none
 * @option actions
 * @desc "actions": an enemy knows the skills of its action patterns.
 * @default none
 */
(() => {
    'use strict';
    // The state IDs a skill's note names: the first passive[n] on each line.
    const cache = new Map();
    const passiveIds = (skill) => {
        if (!skill) return [];
        let ids = cache.get(skill);
        if (!ids) {
            ids = [];
            for (const line of String(skill.note || '').split(/[\r\n]+/)) {
                const m = /passive\[(\d+)\]/i.exec(line);
                if (m) ids.push(Number(m[1]));
            }
            cache.set(skill, ids);
        }
        return ids;
    };

    const params = typeof PluginManager !== 'undefined' ? PluginManager.parameters('RR_CpPassiveSkills') : {};
    const ENEMY_ACTIONS = String(params.enemySkills || '') === 'actions';

    // Battlers whose skills are being listed: their passives are left out of the traits the list reads.
    const listing = new Set();
    let anyPassives = null;
    const passivesOf = (battler, skills) => {
        if (anyPassives === null && typeof $dataSkills !== 'undefined' && $dataSkills) anyPassives = $dataSkills.some(s => passiveIds(s).length);
        if (!anyPassives) return [];
        const out = [];
        listing.add(battler);
        try {
            for (const skill of skills()) for (const id of passiveIds(skill)) out.push($dataStates[id]);
        } finally {
            listing.delete(battler);
        }
        return out.filter(Boolean);
    };
    Game_BattlerBase.prototype.rrPassives = function() { return []; };
    Game_Actor.prototype.rrPassives = function() { return passivesOf(this, () => this.skills()); };
    // An enemy's skills: another port's list when there is one, else the skills of its actions.
    if (ENEMY_ACTIONS && typeof Game_Enemy !== 'undefined') {
        Game_Enemy.prototype.rrPassives = function() {
            return passivesOf(this, () => (typeof this.skills === 'function' ? this.skills()
                : this.enemy().actions.map(action => $dataSkills[action.skillId])));
        };
    }

    const _traitObjects = Game_BattlerBase.prototype.traitObjects;
    Game_BattlerBase.prototype.traitObjects = function() {
        const objects = _traitObjects.call(this);
        return listing.has(this) ? objects : objects.concat(this.rrPassives());
    };
})();
