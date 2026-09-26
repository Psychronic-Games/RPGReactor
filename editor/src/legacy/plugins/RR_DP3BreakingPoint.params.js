'use strict';
// Plugin parameters for RR_DP3BreakingPoint from the game's copy of DiamondandPlatinum3's Breaking Point
// (module DP3_PartyDyingBGM: DyingBGM, EntirePartyHP, HP_Percentage).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /module DP3_PartyDyingBGM\b/.test(s)) || '';
    const k = (name, d) => {
        const at = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
        if (!at) return d;
        try { return readLiteral(source, at.index + at[0].length)[0]; } catch (_) { return d; }
    };
    const [name = null, volume = 100, pitch = 100] = Array.isArray(k('DyingBGM', null)) ? k('DyingBGM', null) : [];
    const entire = k('EntirePartyHP', true);
    return {
        dyingBgm: JSON.stringify({ name: typeof name === 'string' ? name : null, volume: Number(volume ?? 100), pitch: Number(pitch ?? 100) }),
        entireParty: String(entire !== false && entire !== null),
        percentage: String(Number(k('HP_Percentage', 50)))
    };
}

module.exports = { extract };
