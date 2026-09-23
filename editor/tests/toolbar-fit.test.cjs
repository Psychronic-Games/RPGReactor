// The map toolbar must never clip its last group. The icon scaler keeps it on
// one row while it can, so it has to re-run whenever the bar's natural width
// moves (a language change, the web font arriving), and the bar wraps as the
// floor beneath it so a stale measurement still shows every button.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = (...parts) => fs.readFileSync(path.resolve(__dirname, '..', ...parts), 'utf8');

test('#toolbar wraps its groups instead of clipping them', () => {
    const styles = read('css', 'styles.css');
    const block = styles.match(/\n\s*#toolbar \{([^}]*)\}/);
    assert.ok(block, '#toolbar rule not found');
    assert.match(block[1], /flex-wrap: wrap;/);
    assert.match(block[1], /row-gap: \d+px;/);
});

test('the icon scaler re-runs on language and font changes and measures a single row', () => {
    const main = read('src', 'main.js');
    assert.match(main, /window\.addEventListener\('rr-language-changed', \(\) => this\.scaleToolbarIcons\(\)\);/);
    assert.match(main, /document\.fonts\?\.ready\?\.then\?\.\(\(\) => this\.scaleToolbarIcons\(\)\);/);
    const scaler = main.slice(main.indexOf('scaleToolbarIcons() {'), main.indexOf('// DATABASE UI'));
    // Wrapping is switched off for the measurement and switched back only
    // after the size has been chosen and verified: a wrapped bar reports no
    // overflow at all, and the verification reads the real layout.
    const off = scaler.indexOf("toolbar.style.flexWrap = 'nowrap';");
    const measured = scaler.indexOf('const overflow = overflowAt();');
    const verified = scaler.indexOf('while (newSize > minSize && overflowAt() > 0)');
    const on = scaler.indexOf("toolbar.style.flexWrap = '';");
    assert.ok(off > 0 && off < measured && measured < verified && verified < on, 'nowrap must bracket the measurement and the verification');
    // The measurement is fractional: bounding rects, not the integer scrollWidth.
    assert.doesNotMatch(scaler, /toolbar\.scrollWidth/);
    assert.match(scaler, /last\.getBoundingClientRect\(\)\.right - availableRight/);
});
