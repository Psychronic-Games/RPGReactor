'use strict';
// Yanfly's Skill Cost Manager. Its notetag blocks (<custom cost requirement>, <custom cost perform>) are Ruby run
// with the battler as self; the settings reader translates them with these tables (RR_YanflySkillCost.params.js).
// The record fields let a block read a weapon's or skill's type (w.wtype_id) as the scripts do.

module.exports = {
    key: 'yanflySkillCost', detect: /\$imported\["YEA-SkillCostManager"\]\s*=\s*true/, plugin: 'RR_YanflySkillCost',
    objects: {
        record: { wtype_id: '$.wtypeId', atype_id: '$.atypeId', etype_id: '$.etypeId', stype_id: '$.stypeId', mp_cost: '$.mpCost', tp_cost: '$.tpCost' },
        actor: {
            max_tp: '$.maxTp()', states: '$.states()', skills: '$.skills()', 'usable?': '$.canUse(%0)', mcr: '$.mcr', tcr: '$.tcr',
            skill_mp_cost: '$.skillMpCost(%0)', skill_tp_cost: '$.skillTpCost(%0)', skill_hp_cost: '($.rrSkillHpCost?.(%0) ?? 0)', skill_gold_cost: '($.rrSkillGoldCost?.(%0) ?? 0)'
        }
    }
};
