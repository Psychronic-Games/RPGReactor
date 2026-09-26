'use strict';
// Yanfly's Weapon Attack Replace: the attack skill comes from the first weapon, the actor or the class.

module.exports = {
    key: 'yanflyWeaponAttack', detect: /module WEAPON_ATTACK_REPLACE\b/, plugin: 'RR_YanflyWeaponAttack',
    objects: { actor: { attack_skill_id: '$.attackSkillId()', weapon_attack_skill_id: '($.rrWeaponAttackSkillId?.() ?? $.attackSkillId())' } }
};
