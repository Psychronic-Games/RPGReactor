'use strict';
// Reads the Symbol Encounter settings (SYMBOL_SETTING_LIST, FOLLOWER_CONTACT) from the game's script.

const DEFAULT_TYPES = { 0: [0, 2, 1, 2, 0, 0, 2, 4, 5, 5, 0, []] };

// Ruby comments out, string literals kept intact.
function stripComments(text) {
    return text.split(/\r?\n/).map(line => {
        let quote = null;
        for (let i = 0; i < line.length; i++) {
            const c = line[i];
            if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; }
            else if (c === '"' || c === "'") quote = c;
            else if (c === '#') return line.slice(0, i);
        }
        return line;
    }).join('\n');
}

// Index just past the bracket that closes the one at `open`.
function closing(text, open) {
    const pair = { '[': ']', '{': '}' }[text[open]];
    let depth = 0;
    for (let i = open; i < text.length; i++) {
        if (text[i] === text[open]) depth++;
        else if (text[i] === pair && --depth === 0) return i + 1;
    }
    return -1;
}

function parseRow(src) {
    const json = src.replace(/\bnil\b/g, 'null').replace(/,\s*([\]}])/g, '$1');
    const row = JSON.parse(json);
    return Array.isArray(row) ? row : null;
}

function parseTypes(text) {
    const code = stripComments(text);
    const head = /SYMBOL_SETTING_LIST\s*=\s*\{/.exec(code);
    if (!head) return null;
    const start = head.index + head[0].length - 1, end = closing(code, start);
    if (end < 0) return null;
    const body = code.slice(start + 1, end - 1);
    const types = {};
    const entry = /(-?\d+)\s*=>\s*\[/g;
    let m;
    while ((m = entry.exec(body))) {
        const open = m.index + m[0].length - 1, close = closing(body, open);
        if (close < 0) break;
        try {
            const row = parseRow(body.slice(open, close));
            if (row) types[m[1]] = row;
        } catch (_) { /* a row that isn't plain literals is skipped */ }
        entry.lastIndex = close;
    }
    return Object.keys(types).length ? types : null;
}

function extract({ scripts = [], constants = {} } = {}) {
    let types = null;
    for (const text of scripts) {
        types = parseTypes(String(text || ''));
        if (types) break;
    }
    let follower = constants['SymbolEncount::FOLLOWER_CONTACT'];
    if (typeof follower !== 'boolean') {
        for (const text of scripts) {
            const m = /^\s*FOLLOWER_CONTACT\s*=\s*(true|false)/m.exec(String(text || ''));
            if (m) { follower = m[1] === 'true'; break; }
        }
    }
    return {
        types: JSON.stringify(types || DEFAULT_TYPES),
        followerContact: String(follower === true)
    };
}

module.exports = { extract };
