'use strict';
// Plugin parameters for RR_YanflyWeaponAttack from the game's copy of Weapon Attack Replace
// (YEA::WEAPON_ATTACK_REPLACE::DEFAULT_ATTACK_SKILL_ID).

function extract({ constants = {} } = {}) {
    const id = constants['YEA::WEAPON_ATTACK_REPLACE::DEFAULT_ATTACK_SKILL_ID'];
    return { defaultAttackSkillId: String(typeof id === 'number' ? id : 1) };
}

module.exports = { extract };
