'use strict';
// modern algebra's Recharge Skills as Thrall carries it (with its skill rules): the "Status Reset" common
// event clears every member's charges with member.clear_skill_recharge.
module.exports = {
    key: 'thrallRecharge', detect: /def update_single_skill_recharge\(skill, turns\)/, plugin: 'RR_ThrallRecharge',
    members: {
        'actor.clear_skill_recharge': ['$.rrClearSkillRecharge?.(%*)', 'any'],
        'actor.get_sc_turns': ['($.rrGetScTurns?.(%0) ?? 0)', 'number']
    }
};
