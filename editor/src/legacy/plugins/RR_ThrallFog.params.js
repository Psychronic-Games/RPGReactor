'use strict';
// Plugin parameters for RR_ThrallFog from Thrall's copy of Falcao's Fog Effects: the switch its
// Spriteset_Map#update_fog asks to scroll the fog twice as fast (Thrall's edit; Falcao's DinamicScroll is unused).

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /def update_fog\b/.test(s) && /falcaofog/.test(s)) || '';
    const m = /def update_fog\b[\s\S]*?if \$game_switches\[(\d+)\]/.exec(source);
    return { scrollSwitch: m ? m[1] : '0' };
}

module.exports = { extract };
