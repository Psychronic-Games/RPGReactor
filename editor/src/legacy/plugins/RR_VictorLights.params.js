'use strict';
// Plugin parameters for RR_VictorLights: whether the game carried the widely shared "Fix light" patch,
// which reads an actor light's index from 0 (the player) instead of from 1.

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const fixed = scripts.map(text).some(s => /class Game_LightBitmap[\s\S]*@light\.info\[:actor\] == 0 \? 0 : @light\.info\[:actor\] - 0/.test(s));
    return { actorIndexFromZero: String(fixed) };
}

module.exports = { extract };
