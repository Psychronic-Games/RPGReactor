/**
 * Screens that clipped, covered or scrolled at common window sizes
 * (1366x768, 1024x600): the User Interfaces drawer, Types, Terms, the Build
 * bar's Door card and the Import Project dialog.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');

function containerBlock(query) {
    const start = css.indexOf(query);
    assert.ok(start >= 0, `${query} exists`);
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
    }
    throw new Error(`${query} is not closed`);
}

test('the User Interfaces drawer starts below the Layout tools and can be closed', () => {
    const Editor = require('../src/database/DatabaseUserInterfaceEditor.js');
    const set = {};
    const host = { getBoundingClientRect: () => ({ top: 246.4 }) };
    const workspace = {
        getBoundingClientRect: () => ({ top: 160 }),
        querySelector: selector => selector === '.rr-ui-canvas-host' ? host : null,
        style: { setProperty: (name, value) => { set[name] = value; } }
    };
    const editor = Object.create(Editor.prototype);
    editor.wrapper = { querySelector: selector => selector === '.rr-ui-workspace' ? workspace : null };
    editor.placeInspectorDrawer();
    assert.deepEqual(set, { '--rr-ui-drawer-top': '86px' });

    const drawer = containerBlock('@container database-detail (max-width: 1050px)');
    assert.match(drawer, /\.rr-ui-props-panel \{[^}]*top: var\(--rr-ui-drawer-top, 0px\)/);
    // More specific than the base rule that hides it, which comes later.
    assert.match(drawer, /\.rr-ui-inspector-header > \.rr-ui-inspector-close \{ display: block; \}/);
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseUserInterfaceEditor.js'), 'utf8');
    assert.match(source, /new ResizeObserver\(\(\) => \{ this\.placeInspectorDrawer\(\);/);
});

test('Types puts its five lists on two rows when one row cannot hold them', () => {
    // Five lists at 185px with their gaps need 973px.
    assert.match(css, /\.rr-types-grid \{[^}]*grid-template-columns: repeat\(5, minmax\(185px, 1fr\)\)/);
    const narrow = containerBlock('@container database-detail (max-width: 980px)');
    assert.match(narrow, /\.rr-types-grid \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);[^}]*grid-template-rows: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(narrow, /\.rr-types-panel \{ grid-column: span 2; \}/);
    assert.match(narrow, /\.rr-types-panel:nth-child\(n\+4\) \{ grid-column: span 3; \}/);
    assert.match(narrow, /\.rr-types-grid:has\(> \.rr-types-panel\.is-collapsed\) \{ display: grid; \}/);
    assert.ok(css.indexOf('@container database-detail (max-width: 980px)') > css.indexOf('html:not(.rr-web) .rr-types-grid:has(> .rr-types-panel.is-collapsed) {'),
        'the narrow rules follow the folded-list rules they override');
});

test('Terms gives its command fields fewer, wider columns in a narrower detail', () => {
    assert.match(css, /\.rr-terms-fields-four \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
    assert.match(containerBlock('@container database-detail (max-width: 1300px)'), /\.rr-terms-fields-four \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
    const narrow = containerBlock('@container database-detail (max-width: 900px) {\n            .rr-terms-top-grid');
    assert.match(narrow, /\.rr-terms-top-grid \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(narrow, /\.rr-terms-fields-four \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
});

test('a door\'s rows give their field the rest of the row', () => {
    const BuildHotbar = require('../src/BuildHotbar.js');
    const hadWindow = 'window' in globalThis;
    if (!hadWindow) globalThis.window = {};
    try {
        const bar = new BuildHotbar({ pieceBuilderManager: { door: { swing: 'away' }, material: 'plain' } });
        const markup = bar.doorSections(null, () => '');
        const rows = markup.match(/<label class="[^"]*"/g);
        assert.ok(rows.length >= 4);
        for (const row of rows) assert.equal(row, '<label class="rr-build-field rr-build-setting"');
        assert.match(markup, /data-key="swing"><option value="away" selected>Away from the opener</);
    } finally { if (!hadWindow) delete globalThis.window; }
    assert.match(css, /\.rr-build-field\.rr-build-setting \{ grid-template-columns: 64px minmax\(0, 1fr\); \}/);
    assert.match(css, /\.rr-build-panel\.is-narrow \.rr-build-field\.rr-build-setting \{ grid-template-columns: minmax\(0, 1fr\);/);
    // The rock's tint row keeps its own grid.
    assert.match(css, /\.rr-build-field\.rr-build-wide \{ grid-template-columns: 1fr 128px; \}/);
});

test('the Import Project log takes the height left under the settings', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'LegacyImportDialog.js'), 'utf8');
    assert.match(source, /fields\.style\.cssText = 'flex:none;display:grid;grid-template-columns:max-content 1fr auto;/);
    assert.match(source, /consoleEl\.style\.cssText = 'flex:1 1 auto;min-height:0;display:flex;flex-direction:column;/);
    assert.match(source, /logEl\.style\.cssText = 'flex:0 1 220px;min-height:100px;overflow-y:auto;/);
    assert.doesNotMatch(source, /logEl\.style\.cssText = 'height:/);
    assert.match(source, /body\.append\(fields, errorEl, consoleEl\);/);
    assert.doesNotMatch(source, /body\.append\(label\(/, 'every settings row is on the fields grid');
});
