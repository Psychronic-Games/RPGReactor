'use strict';
// Plugin parameters for RR_ExtraStartOptions from the game's copy of Shadowmaster's Extra Start Options
// (ExtraStartingPositions::StartMapOptions), and where a later script puts the title's Options command.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** The place a script after `from` inserts the title's :option command at (Theo's Global System Options), or -1. */
function optionsIndex(sources, from) {
    let index = -1;
    for (let i = from + 1; i < sources.length; i++) {
        if (!/class\s+Window_TitleCommand/.test(sources[i])) continue;
        const m = /:symbol\s*=>\s*:option\b[\s\S]*?@list\.insert\(\s*(\d+)/.exec(sources[i]);
        if (m) index = Number(m[1]);
    }
    return index;
}

function extract({ scripts = [] } = {}) {
    const sources = scripts.map(text);
    const at = sources.findIndex(s => /ExtraStartingPositions/.test(s) && /StartMapOptions\s*=/.test(s));
    const source = at >= 0 ? sources[at] : '';
    let rows = [];
    const m = /^[ \t]*StartMapOptions\s*=\s*/m.exec(source);
    if (m) { try { rows = readLiteral(source, m.index + m[0].length)[0]; } catch (_) { rows = []; } }
    const options = (Array.isArray(rows) ? rows : []).filter(Array.isArray).map(r => ({
        name: String(r[0] ?? ''), mapId: Number(r[1]) || 1, x: Number(r[2]) || 0, y: Number(r[3]) || 0,
        order: Number(r[4]) || 0, transparent: r[5] === true
    }));
    return { options: JSON.stringify(options), optionsIndex: String(at >= 0 ? optionsIndex(sources, at) : -1) };
}

module.exports = { extract, optionsIndex };
