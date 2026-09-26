'use strict';
// Plugin parameters for RR_YanflyStateAnimations from the game's copy of Yanfly's State Animations
// (YEA::STATE_ANIMATION) and, when the game carried Yanfly's Core Engine, its animation rate (the frames each
// animation cell is shown; 4 without it).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["YEA-StateAnimations"\]\s*=\s*true/.test(s)) || '';
    // A fractional zoom is not among the constants the importer reads: it is read from the script.
    const zoom = /^[ \t]*ACTOR_ZOOM\s*=\s*(-?\d+(?:\.\d+)?)/m.exec(source);
    const k = (name, d) => (constants['YEA::STATE_ANIMATION::' + name] === undefined ? d : constants['YEA::STATE_ANIMATION::' + name]);
    const truthy = (v) => v !== false && v !== null;
    const rate = Number(constants['YEA::CORE::ANIMATION_RATE']);
    return {
        playSound: String(truthy(k('PLAY_SOUND', true))),
        playFlash: String(truthy(k('PLAY_FLASH', false))),
        playActor: String(truthy(k('PLAY_ACTOR', true))),
        actorZoom: String(zoom ? Number(zoom[1]) : Number(k('ACTOR_ZOOM', 0.5))),
        rate: String(Number.isInteger(rate) && rate > 0 ? rate : 4)
    };
}

module.exports = { extract };
