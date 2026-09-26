'use strict';
// Plugin parameters for RR_YanflyCore from the game's copy of Yanfly's Ace Core Engine (YEA::CORE).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["YEA-CoreEngine"\]\s*=\s*true/.test(s) && /COLOURS\s*=/.test(s)) || '';
    // COLOURS is a hash of symbols to numbers: `:system => 8,`.
    const block = /COLOURS\s*=\s*\{([\s\S]*?)\}/.exec(source);
    const colours = {};
    if (block) for (const m of block[1].matchAll(/^\s*:(\w+)\s*=>\s*(\d+)/gm)) colours[m[1]] = Number(m[2]);
    const k = (name, d) => (constants['YEA::CORE::' + name] === undefined ? d : constants['YEA::CORE::' + name]);
    return {
        colours: JSON.stringify(colours),
        transparency: String(Number(k('TRANSPARENCY', 160))),
        groupDigits: String(k('GROUP_DIGITS', false) === true),
        gaugeHeight: String(Number(k('GAUGE_HEIGHT', 6))),
        animationRate: String(Number(k('ANIMATION_RATE', 4)) || 4),
        gaugeOutline: String(k('GAUGE_OUTLINE', true) !== false && k('GAUGE_OUTLINE', true) !== null),
        hpCrisis: String(Number(k('HP_CRISIS', 0.25))),
        mpCrisis: String(Number(k('MP_CRISIS', 0.25)))
    };
}

module.exports = { extract };
