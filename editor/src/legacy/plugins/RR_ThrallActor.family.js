'use strict';
// Thrall's edits to VX's Game_Actor (018): the monster base's stats and EXP curve the "Adjust Monster Level"
// common event reads, overkill (Fury), change_level (capped at 70), the experience strings.
module.exports = {
    key: 'thrallActor', detect: /#GET MONSTER LEVELED STATS\s*\n\s*def mon_atk\b/, plugin: 'RR_ThrallActor',
    members: {
        'actor.overkill': ['($.rrVxOverkill?.() ?? 0)', 'number'],
        'actor.mon_atk': ['($.rrMonAtk?.() ?? 0)', 'number'],
        'actor.mon_def': ['($.rrMonDef?.() ?? 0)', 'number'],
        'actor.mon_spi': ['($.rrMonSpi?.() ?? 0)', 'number'],
        'actor.mon_agi': ['($.rrMonAgi?.() ?? 0)', 'number'],
        'actor.base_maxhp': ['($.rrVxBaseMaxhp?.() ?? $.paramBase(0))', 'number'],
        'actor.exp_list': ['($.rrExpList?.() ?? [])', 'array:number'],
        'actor.change_level': ['$.changeLevel(%0, !!(%1))', 'any'],
        'actor.exp_s': ['($.rrVxExpS?.() ?? $.currentExp())', 'any'],
        'actor.next_exp_s': ['($.rrVxNextExpS?.() ?? $.nextLevelExp())', 'any'],
        'actor.next_rest_exp_s': ['($.rrVxNextRestExpS?.() ?? $.nextRequiredExp())', 'any'],
        'actor.actor_id': ['$.actorId()', 'number']
    },
    setters: { 'actor.overkill': '$.rrVxSetOverkill?.(%v)' }
};
