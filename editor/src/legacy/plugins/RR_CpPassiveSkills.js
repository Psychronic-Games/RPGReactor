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
 * their own. Enemies have none. No script calls.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script.
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

    // Actors whose skills are being listed: their passives are left out of the traits the list reads.
    const listing = new Set();
    let anyPassives = null;
    Game_BattlerBase.prototype.rrPassives = function() { return []; };
    Game_Actor.prototype.rrPassives = function() {
        if (anyPassives === null && typeof $dataSkills !== 'undefined' && $dataSkills) anyPassives = $dataSkills.some(s => passiveIds(s).length);
        if (!anyPassives) return [];
        const out = [];
        listing.add(this);
        try {
            for (const skill of this.skills()) for (const id of passiveIds(skill)) out.push($dataStates[id]);
        } finally {
            listing.delete(this);
        }
        return out.filter(Boolean);
    };

    const _traitObjects = Game_BattlerBase.prototype.traitObjects;
    Game_BattlerBase.prototype.traitObjects = function() {
        const objects = _traitObjects.call(this);
        return listing.has(this) ? objects : objects.concat(this.rrPassives());
    };
})();
