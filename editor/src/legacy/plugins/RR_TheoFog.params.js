'use strict';
// Plugin parameters for RR_TheoFog from the game's copy of TheoAllen's Fog Screen: THEO::Fog::List
// ("key" => [name, opacity, speed x, speed y, zoom x, zoom y]), BattleFog and the custom_fogs lines.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [], constants = {} } = {}) {
    const source = scripts.map(text).find(s => /Theo_FogScreen/.test(s) && /List\s*=\s*\{/.test(s)) || '';
    const fogs = {};
    const at = /^\s*List\s*=\s*/m.exec(source);
    if (at) {
        try {
            const list = readLiteral(source, at.index + at[0].length)[0];
            for (const [key, row] of list instanceof Map ? list : []) {
                if (!Array.isArray(row)) continue;
                fogs[String(key)] = { name: String(row[0] ?? ''), opacity: Number(row[1] ?? 255), speedX: Number(row[2] ?? 0), speedY: Number(row[3] ?? 0), zoomX: Number(row[4] ?? 1), zoomY: Number(row[5] ?? 1) };
            }
        } catch (_) { /* a list it cannot read leaves no fogs */ }
    }
    // custom_fogs: fog = fog_data["key"] then fog.scroll_scale_x = n / blend_type / switch lines.
    const custom = /def self\.custom_fogs([\s\S]*?)\n\s*end/.exec(source);
    if (custom) {
        let key = null;
        for (const line of custom[1].split('\n')) {
            const pick = /fog_data\["([^"]+)"\]/.exec(line);
            if (pick) { key = pick[1]; continue; }
            const set = /fog\.(scroll_scale_x|scroll_scale_y|blend_type|switch|opacity)\s*=\s*(-?[\d.]+)/.exec(line);
            if (key && set && fogs[key]) fogs[key][{ scroll_scale_x: 'scrollX', scroll_scale_y: 'scrollY', blend_type: 'blend', switch: 'switch', opacity: 'opacity' }[set[1]]] = Number(set[2]);
        }
    }
    const battle = constants['THEO::Fog::BattleFog'];
    return { fogs: JSON.stringify(fogs), battleFog: String(battle !== false) };
}

module.exports = { extract };
