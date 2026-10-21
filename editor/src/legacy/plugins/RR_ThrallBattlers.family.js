'use strict';
// Thrall's battler rules (its edits to VX's Game_Battler, Game_BattleAction, Game_Enemy and Game_Troop). Events read and
// set a battler's Pain (hits it shrugs off) and show animations on battlers through it.
module.exports = {
    key: 'thrallBattlers', detect: /def named_weapon_damage\(attacker, damage\)/, plugin: 'RR_ThrallBattlers',
    members: {
        'actor.pain': ['($.rrPain?.() ?? 0)', 'number']
    },
    setters: {
        'actor.pain': '$.rrSetPain?.(%v)',
        'actor.animation_id': '$.rrSetAnimationId?.(%v)'
    }
};
