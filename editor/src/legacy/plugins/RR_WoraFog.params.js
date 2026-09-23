// Settings for RR_WoraFog from the game's Multiple Fog script (reset_fog's defaults).
'use strict';
function extract({ scripts }) {
    const text = scripts.find(s => /class Worale_Multiple_Fog/.test(s)) || '';
    const reset = (/def reset_fog([\s\S]*?)\n\s*end/.exec(text) || [, ''])[1];
    const value = (name) => { const m = new RegExp('@' + name + '\\s*=\\s*("[^"]*"|-?\\d+)').exec(reset); return m ? m[1].replace(/^"|"$/g, '') : null; };
    const out = {};
    if (value('name') !== null) out.name = value('name');
    if (value('opacity') !== null) out.opacity = value('opacity');
    if (value('ox') !== null) out.ox = value('ox');
    return out;
}
module.exports = { extract };
