'use strict';
// Text and surface tokens that are drawn together, held readable in all 14 themes. Each pair
// was unreadable somewhere when the whole editor was audited theme by theme (2026-10-16).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const css = fs.readFileSync(path.join(__dirname, '../css/theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const LIGHTS = ['light', 'bubblegum-light', 'ocean-light', 'cascadia-light', 'underworld-light', 'creamsicle-light', 'royalty-light'];
const THEMES = ['dark', 'bubblegum-dark', 'ocean-dark', 'cascadia-dark', 'underworld-dark', 'creamsicle-dark', 'royalty-dark', ...LIGHTS];

/** A selector list split at its own commas, not those inside :is(...). */
function topLevel(selectors) {
    const parts = [];
    let depth = 0, current = '';
    for (const ch of selectors) {
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (ch === ',' && depth === 0) { parts.push(current); current = ''; } else current += ch;
    }
    return parts.concat(current);
}

/** The tokens a theme resolves to, following the cascade order of theme.css and var() references. */
function tokens(theme) {
    const values = {};
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
        const applies = topLevel(selectors).some(raw => {
            const s = raw.trim();
            if (s === ':root' || s === `:root[data-theme="${theme}"]`) return true;
            const any = s.match(/^:root:is\((.*)\)$/);
            return !!any && any[1].split(',').some(part => part.trim() === `[data-theme="${theme}"]`);
        });
        if (!applies) continue;
        for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) values[name] = value.trim();
    }
    const resolve = value => {
        for (let i = 0; i < 6; i++) {
            const ref = String(value).match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
            if (!ref) break;
            value = values[ref[1]] ?? ref[2];
        }
        return value;
    };
    return Object.fromEntries(Object.keys(values).map(name => [name, resolve(values[name])]));
}

function luminance(hex) {
    const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
    assert.match(full, /^#[0-9a-f]{6}$/i, `a hex color, not ${hex}`);
    return [1, 3, 5].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
        .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function holds(theme, colors, fg, bg, min) {
    const ratio = contrast(colors[fg], colors[bg]);
    assert.ok(ratio >= min, `${theme}: ${fg} ${colors[fg]} on ${bg} ${colors[bg]} is ${ratio.toFixed(2)}:1, under ${min}:1`);
}

for (const theme of THEMES) {
    const light = LIGHTS.includes(theme);
    test(`${theme}: a selected command row's ink reads on the selection fill`, () => {
        holds(theme, tokens(theme), '--color-text-strong', '--color-bg-selected', 4.5);
    });
    test(`${theme}: placeholders read on input and read-only fill`, () => {
        const colors = tokens(theme);
        const fg = colors['--color-text-placeholder'] ? '--color-text-placeholder' : '--color-text-muted';
        holds(theme, colors, fg, '--color-bg-input', 3.5);
        holds(theme, colors, fg, '--color-bg-input-alt', 3);
    });
    test(`${theme}: parameter and channel colors read on the page`, () => {
        const colors = tokens(theme);
        for (let i = 0; i < 8; i++) holds(theme, colors, `--color-param-${i}`, '--color-bg-input', light ? 4.5 : 3.5);
        for (const channel of ['r', 'g', 'b']) holds(theme, colors, `--color-channel-${channel}`, '--color-bg-surface', light ? 4.5 : 2.4);
    });
    test(`${theme}: small row buttons keep their glyph colors readable`, () => {
        const colors = tokens(theme);
        holds(theme, colors, '--color-syntax-type', '--color-bg-button-subtle', 3);
        holds(theme, colors, '--color-danger-bright', '--color-bg-button-subtle', 3);
        holds(theme, colors, '--color-text-strong', '--color-bg-button-subtle', 4.5);
    });
    test(`${theme}: a bright accent fill carries its own text color`, () => {
        holds(theme, tokens(theme), '--color-accent-bright-on', '--color-accent-bright', 4.5);
    });
    test(`${theme}: inactive field text stays readable on the field`, () => {
        holds(theme, tokens(theme), '--color-text-disabled', '--color-bg-base', light ? 3 : 4.5);
    });
    if (!light && theme !== 'dark') test(`${theme}: dim text reads at least as well as in the default dark theme`, () => {
        const colors = tokens(theme), gold = tokens('dark');
        const ratio = (t, fg, bg) => contrast(t[fg], t[bg]);
        for (const bg of ['--color-bg-list-item', '--color-bg-surface', '--color-bg-panel']) {
            const own = ratio(colors, '--color-text-dim', bg), base = ratio(gold, '--color-text-dim', bg);
            assert.ok(own >= base - 0.05, `${theme}: --color-text-dim on ${bg} is ${own.toFixed(2)}:1, the dark theme's ${base.toFixed(2)}:1`);
        }
    });
    if (light) test(`${theme}: danger text reads on white and on the tinted panel`, () => {
        const colors = tokens(theme);
        holds(theme, colors, '--color-danger-light', '--color-bg-input', 4.5);
        holds(theme, colors, '--color-danger-light', '--color-bg-panel', 3);
    });
}

test('dark keeps its own parameter colors, placeholder and button fill', () => {
    const dark = tokens('dark');
    assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => dark[`--color-param-${i}`]),
        ['#ff3366', '#33ccff', '#ff9933', '#ffd700', '#9966ff', '#33ff99', '#ff66cc', '#66ffff']);
    assert.equal(dark['--color-text-placeholder'], undefined, 'dark placeholders are its muted text');
    assert.equal(dark['--color-bg-button-subtle'], dark['--color-border-subtle']);
});
