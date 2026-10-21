'use strict';
// Plugin parameters for RR_ThrallLoot from Thrall's scripts: Module_Loot's tables (the drop pools by rarity and
// type, the prefix lists) and, from Game_Temp#generate_prefix, which prefixes carry which bonus — the names its
// `case prefix #LABEL` and `if prefix == "Name" #LABEL` blocks list, keyed by their labels (spaces dropped).

const { readLiteral } = require('./RR_VAnimatedTitle.params.js');

const text = (s) => String(s && typeof s === 'object' ? s.text || '' : s || '');

/** Every `NAME = [ … ]` inside `module LOOT`. */
function lootTables(source) {
    const out = {};
    const at = source.search(/^module LOOT\b/m);
    if (at < 0) return out;
    const body = source.slice(at);
    for (const m of body.matchAll(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(?=\[)/gm)) {
        try { out[m[1]] = readLiteral(body, m.index + m[0].length)[0]; } catch (_) { /* a table that does not read stays out */ }
    }
    return out;
}

/** The body of `def name` (up to the `def` after it, or the end). */
function method(source, name) {
    const m = new RegExp('^\\s*def ' + name + '\\b[^\\n]*\\n', 'm').exec(source);
    if (!m) return '';
    const rest = source.slice(m.index + m[0].length);
    const next = /^\s*def \w/m.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
}

const OPENERS = /^(if|unless|case|for|while|until|begin)\b|\bdo(\s*\|[^|]*\|)?\s*$/;
const strip = (line) => line.replace(/#(?![^"]*"[^"]*$).*$/, '').trim();

/**
 * The prefix lists of one half of generate_prefix (the weapons' or the armours'): for each `case prefix #LABEL`,
 * its `when` lists in order; for each `if prefix == "Name" #LABEL`, that one name.
 */
function prefixRules(part) {
    const out = {};
    const lines = part.split('\n');
    const label = (s) => s.replace(/\s+/g, '');
    for (let i = 0; i < lines.length; i++) {
        let m = /^\s*if prefix == "([^"]+)"\s*#\s*(.+?)\s*$/.exec(lines[i]);
        if (m) { out[label(m[2])] = [m[1]]; continue; }
        m = /^\s*case prefix\s*#\s*(.+?)\s*$/.exec(lines[i]);
        if (!m) continue;
        const lists = [];
        let depth = 1;
        for (i++; i < lines.length && depth > 0; i++) {
            const line = strip(lines[i]);
            if (!line) continue;
            if (/^end\b/.test(line)) { depth--; continue; }
            if (depth === 1 && /^when\b/.test(line)) {
                let whole = line;
                while (/,\s*$/.test(whole) && i + 1 < lines.length) whole += ' ' + strip(lines[++i]);
                lists.push(Array.from(whole.matchAll(/"([^"]*)"/g), x => x[1]));
                continue;
            }
            if (OPENERS.test(line)) depth++;
        }
        i--;
        out[label(m[1])] = lists.length === 1 ? lists[0] : lists;
    }
    return out;
}

function extract({ scripts = [] } = {}) {
    const all = scripts.map(text);
    const out = {};
    const loot = all.find(s => /^module LOOT\b/m.test(s) && /UNIQUE_WEAPONS\s*=/.test(s));
    if (loot) out.lootTables = JSON.stringify(lootTables(loot));
    const temp = all.find(s => /def generate_prefix\b/.test(s));
    if (temp) {
        const body = method(temp, 'generate_prefix');
        const split = body.search(/^\s*else\s*#\s*Armor Prefixes/m);
        if (split >= 0) {
            out.weaponPrefixes = JSON.stringify(prefixRules(body.slice(0, split)));
            out.armorPrefixes = JSON.stringify(prefixRules(body.slice(split)));
        }
    }
    return out;
}

module.exports = { extract, lootTables, prefixRules, method };
