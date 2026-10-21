'use strict';
// Plugin parameters for RR_ThrallGuide from Thrall's Guide - CONFIGURATION (GuideData: the categories, their
// icons, the list width, the help texts, and every guide in guide_data's case) and Guide - IMPLEMENTATION
// (the guide ids Game_Party#initialize reveals when their first auto_reveal is true).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');
const plain = (v) => (v instanceof Map ? Object.fromEntries([...v].map(([k, x]) => [k, plain(x)])) : Array.isArray(v) ? v.map(plain) : v);

/** NAME = <literal> in the text, or undefined. */
function constant(source, name) {
    const m = new RegExp('^\\s*' + name + '\\s*=\\s*', 'm').exec(source);
    if (!m) return undefined;
    try { return plain(readLiteral(source, m.index + m[0].length)[0]); } catch (_) { return undefined; }
}

/** guide_data's `when id` branches: { id: [name, parags, icon, categories, autoReveal] }. */
function guides(source) {
    const start = source.search(/def self\.guide_data\b/);
    if (start < 0) return {};
    const body = source.slice(start);
    const end = body.search(/^\s*return name, parags/m);
    const cases = end >= 0 ? body.slice(0, end) : body;
    const whens = [...cases.matchAll(/^\s*when (\d+)\s*$/gm)];
    const out = {};
    whens.forEach((w, i) => {
        const entry = cases.slice(w.index + w[0].length, i + 1 < whens.length ? whens[i + 1].index : cases.length);
        const read = (re) => { const m = re.exec(entry); if (!m) return undefined; try { return plain(readLiteral(entry, m.index + m[0].length)[0]); } catch (_) { return undefined; } };
        const name = read(/^\s*name\s*=\s*/m);
        let parags = read(/^\s*parags\s*=\s*(?=\[)/m);
        if (!Array.isArray(parags)) parags = [];
        for (const m of entry.matchAll(/^\s*parags\[(\d+)\]\s*=\s*/gm)) {
            try { parags[Number(m[1])] = readLiteral(entry, m.index + m[0].length)[0]; } catch (_) { /* skipped */ }
        }
        const icon = read(/^\s*icon_index\s*=\s*/m);
        const categories = Array.from(entry.matchAll(/custom_categories\.push\s*\(?\s*:(\w+)/g), m => m[1]);
        const reveal = read(/^\s*auto_reveal\s*=\s*/m);
        out[w[1]] = [String(name ?? ''), parags, Number(icon) || 0, categories, reveal === undefined ? false : reveal];
    });
    return out;
}

function extract({ scripts = [] } = {}) {
    const all = scripts.map(text);
    const out = {};
    const config = all.find(s => /module GuideData\b/.test(s) && /def self\.guide_data\b/.test(s));
    if (config) {
        const categories = constant(config, 'CATEGORIES');
        if (Array.isArray(categories)) out.categories = categories.join(',');
        const icons = constant(config, 'ICONS');
        if (icons && typeof icons === 'object') out.categoryIcons = JSON.stringify(icons);
        const width = constant(config, 'LIST_WIDTH');
        if (typeof width === 'number') out.listWidth = String(width);
        const general = constant(config, 'VOCAB_HELP_GENERAL');
        if (typeof general === 'string') out.helpGeneral = general;
        const selected = constant(config, 'VOCAB_HELP_SELECTED');
        if (typeof selected === 'string') out.helpSelected = selected;
        const align = constant(config, 'HELP_ALIGNMENT');
        if (typeof align === 'number') out.helpAlignment = String(align);
        out.guides = JSON.stringify(guides(config));
    }
    const impl = all.find(s => /class Game_Guides\b/.test(s));
    if (impl) {
        const init = /alias \w+ initialize\s*\n\s*def initialize\b([\s\S]*?)^\s*def /m.exec(impl);
        const ranges = init ? Array.from(init[1].matchAll(/for i in (\d+)\.\.(\d+)/g), m => `${m[1]}-${m[2]}`) : [];
        if (ranges.length) out.startGuides = ranges.join(',');
    }
    return out;
}

module.exports = { extract, guides };
