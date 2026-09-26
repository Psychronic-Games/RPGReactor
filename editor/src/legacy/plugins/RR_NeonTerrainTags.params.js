'use strict';
// Plugin parameters for RR_NeonTerrainTags from the game's copy of Neon Black's CP Terrain Tags (CP::TERRAIN).

function extract({ constants = {} } = {}) {
    const k = (name, d) => { const v = Number(constants['CP::TERRAIN::' + name]); return String(Number.isFinite(v) ? v : d); };
    return { cover: k('COVER', 18), block: k('BLOCK', 19), bridge: k('BRIDGE', 20), upper: k('UPPER', 23) };
}

module.exports = { extract };
