'use strict';
// Yanfly's Skill Restrictions (with its Reload and Mag Size add-ons, which the port carries): the calls a Script
// command may make on a battler or a unit.

module.exports = {
    key: 'yanflySkillRestrictions', detect: /\$imported\["YEA-SkillRestrictions"\]\s*=\s*true/, plugin: 'RR_YanflySkillRestrictions',
    objects: {
        actor: {
            'cooldown?': '($.rrCooldown?.(%0) ?? 0)', set_cooldown: '$.rrSetCooldown?.(%*)', update_cooldowns: '$.rrUpdateCooldowns?.(%*)',
            reset_cooldowns: '$.rrResetCooldowns?.()', reset_times_used: '$.rrResetTimesUsed?.()', 'times_used?': '($.rrTimesUsed?.(%0) ?? 0)',
            update_times_used: '$.rrUpdateTimesUsed?.(%0)', 'warmup?': '($.rrWarmup?.(%0) ?? 0)', 'skill_restriction?': '($.rrSkillRestricted?.(%0) ?? false)',
            'limit_restricted?': '($.rrLimitRestricted?.(%0) ?? false)', 'cooldown_lock?': '($.rrCooldownLocked?.() ?? false)', cdr: '($.rrCooldownRate?.() ?? 1)', wur: '($.rrWarmupRate?.() ?? 1)'
        },
        party: { update_restrictions: '$.rrUpdateRestrictions?.()' }
    }
};
