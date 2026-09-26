'use strict';
// Plugin parameters for RR_YanflyElementalPopups from the game's copy of Yanfly's Elemental Popups
// (YEA::ELEMENT_POPUPS::COLOURS, whose rows name the DEFAULT font constant).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');
const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

function extract({ scripts = [] } = {}) {
    const source = scripts.map(text).find(s => /\$imported\["YEA-ElementalPopups"\]\s*=\s*true/.test(s)) || '';
    let font = ['Arial'];
    const d = /^[ \t]*DEFAULT\s*=\s*/m.exec(source);
    if (d) try { const v = readLiteral(source, d.index + d[0].length)[0]; font = [].concat(v).map(String); } catch (_) { /* Arial */ }
    const rules = {};
    const block = /^[ \t]*COLOURS\s*=\s*\{([\s\S]*?)^[ \t]*\}/m.exec(source);
    for (const line of (block ? block[1] : '').split('\n')) {
        const m = /^\s*(\d+)\s*=>\s*\[(.*)\]/.exec(line.replace(/#.*$/, ''));
        if (!m) continue;
        const cells = m[2].split(',').map(s => s.trim());
        const value = (s) => (s === 'true' ? true : s === 'false' ? false : s === 'DEFAULT' ? font : /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s.replace(/^["']|["']$/g, ''));
        const row = cells.slice(0, 8).map(value);
        const rest = cells.slice(8).join(',').trim();
        let face = font;
        if (rest && rest !== 'DEFAULT') try { face = [].concat(readLiteral(rest, 0)[0]).map(String); } catch (_) { face = font; }
        rules['ELEMENT_' + m[1]] = [...row, face];
    }
    return { rules: JSON.stringify(rules) };
}

module.exports = { extract };
