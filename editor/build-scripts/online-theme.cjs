'use strict';
// The server's admin page in the editor's own colours: the theme the author works in (File › Options), read from
// the editor's css/theme.css as a deploy writes the server. The page is the engine's, so it looks like the engine.
const fs = require('fs');
const path = require('path');

/** What the admin page paints with, by the editor token each comes from. */
const TOKENS = {
    accent: '--color-accent', accentBright: '--color-accent-bright', accentOn: '--color-accent-on',
    deep: '--color-bg-deep', base: '--color-bg-base', panel: '--color-bg-panel', surface: '--color-bg-surface',
    input: '--color-bg-input', button: '--color-bg-button', hover: '--color-bg-hover',
    border: '--color-border', borderSubtle: '--color-border-subtle',
    text: '--color-text', textStrong: '--color-text-strong', textMuted: '--color-text-muted',
    danger: '--color-danger-bright', warning: '--color-warning-text', success: '--color-success-border',
};
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[0-9.]+%?\s*(,\s*[0-9.]+%?\s*){2,3}\))$/i;

/** The declarations of every `selector {` block of the sheet, later ones over earlier. */
function declarations(css, selector) {
    const found = {};
    let at = 0;
    for (;;) {
        const start = css.indexOf(selector + ' {', at);
        if (start < 0) break;
        // Only a block of its own: `:root[data-theme="light"] .tool-button` is a rule for a part, not the palette.
        const before = css.lastIndexOf('\n', start), line = css.slice(before + 1, start);
        const end = css.indexOf('}', start);
        if (end < 0) break;
        if (line.trim() === '') for (const m of css.slice(start, end).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) found[m[1]] = m[2].replace(/\/\*.*$/, '').trim();
        at = end + 1;
    }
    return found;
}

/**
 * The colours of the editor theme named (its `data-theme` value; "" or an unknown name is the default, Gold on
 * black), as { accent: "#d4af37", ... }. Only plain colours leave here: a value that is not one is left out and
 * the page keeps its own for it. Null when the sheet cannot be read.
 */
function themeColors(appRoot, name = '') {
    let css;
    try { css = fs.readFileSync(path.join(appRoot, 'css', 'theme.css'), 'utf8'); } catch (error) { return null; }
    const safe = /^[a-z0-9-]{1,40}$/.test(String(name)) ? String(name) : '';
    const own = safe ? declarations(css, `:root[data-theme="${safe}"]`) : {};
    const values = Object.assign({}, declarations(css, ':root'), own);
    const resolve = (value, depth = 0) => {
        const m = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*(.+))?\)$/i.exec(String(value || '').trim());
        if (!m) return String(value || '').trim();
        if (depth > 8) return '';
        return resolve(values[m[1]] !== undefined ? values[m[1]] : m[2], depth + 1);
    };
    const out = { name: safe && Object.keys(own).length ? safe : '' };
    for (const [key, token] of Object.entries(TOKENS)) {
        const value = resolve(values[token]);
        if (COLOR.test(value)) out[key] = value.toLowerCase();
    }
    return out;
}

module.exports = { TOKENS, themeColors, declarations };
