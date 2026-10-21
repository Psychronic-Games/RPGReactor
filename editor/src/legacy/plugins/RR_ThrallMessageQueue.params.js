'use strict';
// Plugin parameters for RR_ThrallMessageQueue from the game's copy of Marc's Message Queue (module Marc::Queue).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
function literal(source, name) {
    const m = new RegExp('^[ \\t]*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return readLiteral(source, m.index + m[0].length)[0]; } catch (_) { return undefined; }
}

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /class Marc_Queue < Sprite_Base/.test(s)) || '';
    const out = {};
    const put = (key, v) => { if (v !== undefined && v !== null) out[key] = String(v); };
    put('switchId', literal(source, 'SWITCH'));
    put('enabled', literal(source, 'ENABLED'));
    put('alignment', literal(source, 'ALIGNMENT'));
    const bg = /^[ \t]*BACKGROUND\s*=\s*Color\.new\(([^)]*)\)/m.exec(source);
    if (bg) out.background = bg[1].split(',').map(x => Number(x.trim())).join(',');
    put('fadeStep', literal(source, 'FADE_STEP'));
    put('wait', literal(source, 'WAIT'));
    put('removeDuplicates', literal(source, 'REMOVE_DUPLICATES'));
    return out;
}

module.exports = { extract };
