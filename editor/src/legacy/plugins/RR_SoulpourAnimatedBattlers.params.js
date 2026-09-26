'use strict';
// Plugin parameters for RR_SoulpourAnimatedBattlers from the game's copy of Soulpour's Animated Battlers
// (module Soulpour::AnimatedBattlers): the breath speed and the enemy id lists.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}
const ids = (v) => JSON.stringify(Array.isArray(v) ? v.map(Number).filter(n => Number.isFinite(n)) : []);

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /module\s+Soulpour\b/.test(s) && /module\s+AnimatedBattlers\b/.test(s)) || '';
    const speed = literal(source, 'BREATH_SPEED');
    return {
        breathSpeed: String(Number.isFinite(Number(speed)) ? Number(speed) : 3),
        breathEnemies: ids(literal(source, 'BREATH_EFFECT_ENEMY_ID')),
        floatEnemies: ids(literal(source, 'FLOAT_EFFECT_ENEMY_ID')),
        movesideEnemies: ids(literal(source, 'MOVESIDE_EFFECT_ENEMY_ID')),
        cancelStates: ids(literal(source, 'STATES_CANCEL_EFFECT'))
    };
}

module.exports = { extract };
