'use strict';
// Game_Party equipment utilities: calls only, written straight into the events (no plugin).
// Each slot is emptied by the number of its equipment type counted from 0, as the script passed the
// type to change_equip; with the default slots that is every slot.
const clear = (actor) => `for (const t of ${actor}.equipSlots()) ${actor}.changeEquip(t - 1, null);`;
module.exports = {
    key: 'partyEquipUtilities', detect: /class Game_Party < Game_Unit[\s\S]*def unequip_all\b[\s\S]*def unequip_actor\b/,
    objects: {
        party: {
            unequip_all: `$.members().forEach((a) => { ${clear('a')} })`,
            unequip_actor: `((a) => { if (a) { ${clear('a')} } })($gameActors.actor(%0))`,
            optimize_all: '$.members().forEach((a) => a.optimizeEquipments())'
        }
    }
};
