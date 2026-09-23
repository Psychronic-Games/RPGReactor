'use strict';
// Plugin parameters for RR_WebsiteTitleCommand from the game's copy of modern algebra's Website Launch
// from Title (MAWLT_TITLE_WEBSITE_COMMANDS), and where a later script puts the title's Options command.

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const { optionsIndex } = require('./RR_ExtraStartOptions.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const sources = scripts.map(text);
    const at = sources.findIndex(s => /MAWLT_TITLE_WEBSITE_COMMANDS\s*=/.test(s));
    const source = at >= 0 ? sources[at] : '';
    let rows = [];
    const m = /^[ \t]*MAWLT_TITLE_WEBSITE_COMMANDS\s*=\s*/m.exec(source);
    if (m) { try { rows = readLiteral(source, m.index + m[0].length)[0]; } catch (_) { rows = []; } }
    const commands = (Array.isArray(rows) ? rows : []).filter(Array.isArray).map(r => ({
        name: String(r[0] ?? ''), index: Number(r[1]) || 0, url: String(r[2] ?? '')
    }));
    return { commands: JSON.stringify(commands), optionsIndex: String(at >= 0 ? optionsIndex(sources, at) : -1) };
}

module.exports = { extract };
