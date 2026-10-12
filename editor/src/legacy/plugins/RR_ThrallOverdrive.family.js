'use strict';
// KGC Overdrive with Thrall's edits (gain_overdrive plays Saint2 at a full gauge): troop events drain and fill the gauges.
module.exports = {
    key: 'thrallOverdrive', detect: /def gain_overdrive\(unit, value\)/, plugin: 'RR_ThrallOverdrive', requires: ['RR_ThrallBattlers'],
    event: {
        gain_actor_od_gauge: 'this.rrGainActorOdGauge?.(%*)',
        gain_enemy_od_gauge: 'this.rrGainEnemyOdGauge?.(%*)',
        get_actor_od_gauge: ['(this.rrGetActorOdGauge?.(%*) ?? 0)', 'number'],
        get_enemy_od_gauge: ['(this.rrGetEnemyOdGauge?.(%*) ?? 0)', 'number'],
        set_actor_od_gauge_number: 'this.rrSetActorOdGaugeNumber?.(%*)',
        set_enemy_od_gauge_number: 'this.rrSetEnemyOdGaugeNumber?.(%*)',
        'actor_od_gauge_max?': ['!!this.rrActorOdGaugeMax?.(%*)', 'bool'],
        'enemy_od_gauge_max?': ['!!this.rrEnemyOdGaugeMax?.(%*)', 'bool'],
        set_actor_drive_type: 'this.rrSetActorDriveType?.(%*)',
        set_enemy_drive_type: 'this.rrSetEnemyDriveType?.(%*)'
    },
    members: {
        'actor.overdrive': ['($.rrOverdrive?.() ?? 0)', 'number'],
        'actor.max_overdrive': ['($.rrMaxOverdrive?.() ?? 1000)', 'number']
    },
    setters: { 'actor.overdrive': '$.rrSetOverdrive?.(%v)' }
};
