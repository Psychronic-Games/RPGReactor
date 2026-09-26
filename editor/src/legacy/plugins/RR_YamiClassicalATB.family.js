'use strict';
// Yami's Classical ATB: the plugin runs the gauges; events may change how long they wait and how turns count.
module.exports = {
    key: 'ysaCatb', detect: /\$imported\["YSA-CATB"\]\s*=\s*true/, plugin: 'RR_YamiClassicalATB',
    objects: {
        system: {
            set_catb_wait_type: '$.rrSetCatbWaitType?.(%*)', set_catb_turn_type: '$.rrSetCatbTurnType?.(%*)',
            catb_wait_type: '$.rrCatbWaitType?.()', catb_turn_type: '$.rrCatbTurnType?.()', catb_fill_time: '$.rrCatbFillTime?.()',
            catb_tick_count: '$.rrCatbTickCount?.()', catb_after_action: '$.rrCatbAfterAction?.()'
        }
    }
};
