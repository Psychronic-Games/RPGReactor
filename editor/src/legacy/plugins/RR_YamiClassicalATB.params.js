'use strict';
// Plugin parameters for RR_YamiClassicalATB from the game's copy of Yami's Classical ATB (module YSA::CATB).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const truth = (v) => v !== false && v !== null && v !== undefined;

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["YSA-CATB"\]\s*=\s*true/.test(s)) || '';
    const k = (name, d) => { const v = constants['YSA::CATB::' + name]; return v === undefined || v === null ? d : v; };
    const n = (name, d) => String(Number(k(name, d)) || 0);
    const symbol = (name, d) => { const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*:(\\w+)', 'm').exec(source); return m ? m[1] : d; };
    return {
        fillTime: n('DEFAULT_FILL_TIME', 200),
        fillTimeVariable: n('FILL_TIME_VARIABLE', 0),
        waitType: symbol('DEFAULT_WAIT', 'full'),
        pausePartyCommand: String(truth(k('PAUSE_WHEN_ACTIVE_PARTY_COMMAND', true))),
        preemptiveActor: n('PREEMTIVE_ATB_ACTOR', 70),
        preemptiveEnemy: n('PREEMTIVE_ATB_ENEMY', 0),
        surpriseActor: n('SURPRISE_ATB_ACTOR', 0),
        surpriseEnemy: n('SURPRISE_ATB_ENEMY', 70),
        forceActionClear: String(truth(k('FORCE_ACTION_CLEAR_ATB', true))),
        turnType: symbol('DEFAULT_TURN', 'tick'),
        tickCount: n('TICK_COUNT', 200),
        tickCountVariable: n('TICK_COUNT_VARIABLE', 0),
        afterAction: n('AFTER_ACTION', 5),
        afterActionVariable: n('AFTER_ACTION_VARIABLE', 0),
        forceActionCount: String(truth(k('FORCE_ACTION_COUNT', false))),
        gaugeColor1: n('GAUGE_COLOR1', 32),
        gaugeColor2: n('GAUGE_COLOR2', 31),
        chargeColor1: n('CHARGE_COLOR1', 18),
        chargeColor2: n('CHARGE_COLOR2', 10),
        gaugeYPlus: n('ATB_GAUGE_Y_PLUS', 11),
        phrase: String(k('ATB_PHRASE', 'ATB')),
        showEnemyGauge: String(truth(k('SHOW_ENEMY_ATB_GAUGE', true))),
        enemyGaugeWidth: n('ENEMY_GAUGE_WIDTH', 128),
        enemyGaugeHeight: n('ENEMY_GAUGE_HEIGHT', 12),
        enemyGaugeColour1: n('ENEMY_ATB_GAUGE_COLOUR1', 13),
        enemyGaugeColour2: n('ENEMY_ATB_GAUGE_COLOUR2', 5),
        enemyBackColour: n('ENEMY_BACKGAUGE_COLOUR', 19)
    };
}

module.exports = { extract };
