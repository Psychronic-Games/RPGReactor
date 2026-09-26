'use strict';
// Prof. Meow Meow's Trace Stealth System: guards named "tracer" that see and hear the player.

module.exports = {
    key: 'pmmStealth', detect: /module Trace\b[\s\S]*def tss_trace\b/, plugin: 'RR_PmmStealth',
    route: { tss_noise: 'this.rrTssNoise?.(%*)', tss_investigate: 'this.rrTssInvestigate?.()' },
    event: { 'huh?': 'this.rrTssHuh?.()', 'hey!': 'this.rrTssHey?.()' },
    members: {
        'map.trace_range': ['($.rrTraceRange?.() ?? 0)', 'number'], 'map.alert_countdown': ['($.rrAlertCountdown?.() ?? 0)', 'number'],
        'character.sprint_noise': ['($.rrSprintNoise?.() ?? 0)', 'number']
    },
    setters: { 'map.trace_range': '$.rrSetTraceRange?.(%v)', 'map.alert_countdown': '$.rrSetAlertCountdown?.(%v)', 'character.sprint_noise': '$.rrSetSprintNoise?.(%v)' }
};
