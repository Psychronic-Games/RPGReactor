const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(
    path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');

function pickerBody() {
    const at = source.indexOf('showTilesetImagePicker(layerIndex, layerName) {');
    assert.ok(at >= 0, 'the picker exists');
    return source.slice(at, source.indexOf('\n    // Browse for external tileset file', at));
}

test('the picker uses the shared modal chrome', () => {
    // It was a hand-rolled overlay with its own inline header and a red Close
    // button, which matched nothing else in the editor.
    const body = pickerBody();
    for (const cls of ['rr-modal-overlay', 'rr-modal-header', 'rr-modal-title',
                       'rr-modal-close', 'rr-modal-body', 'rr-modal-footer']) {
        assert.ok(body.includes(cls), `uses ${cls}`);
    }
    assert.doesNotMatch(body, /background: rgba\(0,0,0,0\.8\)/,
        'no hand-rolled overlay backdrop remains');
    assert.doesNotMatch(body, /--color-danger-pressed/,
        'no bespoke red Close button remains');
});

test('the file list is the shared searchable browser', () => {
    const body = pickerBody();
    assert.match(body, /RRPickerIndex\.createBrowser\(/);
    assert.match(body, /searchPlaceholder:/);
    assert.match(body, /emptyText:/);
    // The old hand-built list rendered one div per file with its own hover.
    assert.doesNotMatch(body, /listItem\.addEventListener\('mouseenter'/);
});

test('its dependencies load before it', () => {
    // createBrowser and listUnique are globals supplied by index.html; loading
    // them after this file would leave the picker throwing on open.
    const picker = indexHtml.indexOf('src/utils/PickerIndex.js');
    const assets = indexHtml.indexOf('src/utils/AssetFiles.js');
    const editor = indexHtml.indexOf('src/database/DatabaseTilesetEditor.js');
    assert.ok(picker >= 0 && assets >= 0 && editor >= 0);
    assert.ok(picker < editor, 'PickerIndex.js loads first');
    assert.ok(assets < editor, 'AssetFiles.js loads first');
});

test('selection paths all route through one confirm', () => {
    const body = pickerBody();
    // Double-click a row, double-click the preview, or press the footer button.
    assert.match(body, /browser\.list\.addEventListener\('dblclick'/);
    assert.match(body, /image\.addEventListener\('dblclick', confirm\)/);
    assert.match(body, /selectButton\.addEventListener\('click', confirm\)/);
    const assigns = body.match(/this\.assignTilesetToLayer\(/g) || [];
    assert.equal(assigns.length, 1, 'assignment happens in exactly one place');
});

test('confirming with nothing chosen cannot assign', () => {
    // '' is a real selection meaning "clear this slot", so the guard cannot be
    // falsiness — it has to be an explicit null check or picking (None) would
    // silently do nothing.
    const body = pickerBody();
    assert.match(body, /let chosen = null;/);
    assert.match(body, /if \(chosen === null\) return;/);
    assert.doesNotMatch(body, /if \(!chosen\) return;/);
    assert.match(body, /selectButton\.disabled = true;/,
        'and the button starts disabled');
});

test('(None) is offered outside the searchable list', () => {
    // Inside the list it would be filtered away by a search, which is exactly
    // when someone is least likely to find it.
    const body = pickerBody();
    assert.match(body, /const noneRow = document\.createElement\('div'\);/);
    assert.match(body, /listPane\.appendChild\(noneRow\);/);
    assert.match(body, /noneRow\.textContent = t\('common\.none'\);/);
    // Selecting it means the empty name, which is what clears the slot.
    assert.match(body, /chosen = '';/);
    assert.match(body, /noneRow\.addEventListener\('dblclick'/);
    const mountNone = body.indexOf('listPane.appendChild(noneRow)');
    const mountBrowser = body.indexOf('listPane.appendChild(browser.element)');
    assert.ok(mountNone >= 0 && mountBrowser > mountNone, '(None) sits above the list');
});

test('the modal can be dismissed every usual way, and cleans up', () => {
    const body = pickerBody();
    assert.match(body, /closeButton\.addEventListener\('click', close\)/);
    assert.match(body, /cancelButton\.addEventListener\('click', close\)/);
    // The backdrop deliberately does NOT close: an accidental click beside
    // a dialog must never cost work, project-wide.
    assert.doesNotMatch(body, /if \(event\.target === overlay\) close\(\)/);
    assert.match(body, /event\.key === 'Escape'/, 'escape');
    // The keydown listener is on document, so it has to come back off.
    assert.match(body, /document\.removeEventListener\('keydown', onKeyDown\)/);
});

test('the layer opens on its current sheet', () => {
    const body = pickerBody();
    assert.match(body, /selectedName: this\.currentTileset\?\.tilesetNames\?\.\[layerIndex\]/);
    assert.match(body, /browser\.scrollTo\(current\)/,
        'and scrolls it into view rather than making the user hunt');
});

test('the browser gets a flex basis instead of its own height rule', () => {
    // createBrowser sizes itself with height:100%, which cannot share a column
    // with the pinned (None) row above it: the two rules fight and the inner
    // list stops scrolling, taking the section rail with it. The height is
    // cleared explicitly before a flex basis is handed over.
    const body = pickerBody();
    assert.match(body, /listPane\.style\.cssText = '[^']*flex-direction: column/);
    assert.match(body, /listPane\.style\.cssText = '[^']*min-height: 0/);
    assert.match(body, /browser\.element\.style\.height = 'auto';/);
    assert.match(body, /browser\.element\.style\.flex = '1 1 0';/);
    assert.match(body, /browser\.element\.style\.minHeight = '0';/);
});

test('every layer row offers the picker directly', () => {
    // The empty-tab button only appears when a whole tab is empty, so with F
    // assigned only G would show one. Every row carries its own — including
    // rows that already have a sheet, since that is how you swap one.
    const at = source.indexOf('createCompactLayerItem(label, index) {');
    assert.ok(at >= 0);
    const row = source.slice(at, source.indexOf('\n    loadLayerListThumbnails', at));
    assert.match(row, /<button class="rr-choose-tileset-image"/);
    assert.doesNotMatch(row, /\$\{fileName \? '' : `<button class="rr-choose-tileset-image"/,
        'not gated on the slot being empty');
    assert.match(row, /data-index="\$\{index\}"/);

    const handlers = source.indexOf('setupLayerListHandlers() {');
    const body = source.slice(handlers, source.indexOf('\n    selectImageFileForLayer', handlers));
    assert.match(body, /event\.stopPropagation\(\)/,
        'the button click must not also reach the row handler');
    assert.match(body, /this\.selectImageFileForLayer\(index\)/);
});

test('the two-pane body overrides the shared column layout', () => {
    // `.rr-modal-body` is a padded, gapped, scrolling column. This dialog is a
    // flush row of list + preview. Inheriting the column direction made the
    // list pane height-fit its content, so the browser's height:100% never
    // resolved and neither the list nor its section rail could scroll.
    const body = pickerBody();
    const match = body.match(/body\.style\.cssText = '([^']*)'/);
    assert.ok(match, 'the body sets its own layout');
    const css = match[1];
    assert.match(css, /flex-direction: row/, 'panes sit side by side');
    assert.match(css, /gap: 0/, 'no inherited gap between the panes');
    assert.match(css, /padding: 0/, 'panes reach the dialog edges');
    assert.match(css, /min-height: 0/, 'so the row may shrink and its children scroll');
});

test('the shared modal body really is a column, which is why that override exists', () => {
    // If the shared class ever stops being a column the override becomes
    // redundant rather than load-bearing; pin the assumption so the comment
    // above it cannot quietly go stale.
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'theme.css'), 'utf8');
    const at = css.indexOf('.rr-modal-body {');
    assert.ok(at >= 0);
    const rule = css.slice(at, css.indexOf('}', at));
    assert.match(rule, /flex-direction:\s*column/);
});

test('the (None) row follows the accent palette, not a fixed blue', () => {
    // --color-selection-deep is a hard-coded #094771 that does not track the
    // active theme, so pairing it with the gold accent text read as generic
    // blue-and-yellow rather than as part of the palette.
    const body = pickerBody();
    const selectNone = body.slice(body.indexOf('const selectNone'),
                                 body.indexOf('noneRow.addEventListener'));
    assert.doesNotMatch(selectNone, /--color-selection-deep/);
    assert.match(selectNone, /--color-accent-tint-15/);
    assert.match(selectNone, /--color-accent-border-strong/);
});

test('passability markers are drawn with an outline', () => {
    // They are painted onto the tileset art, so a light glyph over light pixels
    // or a red X over red brickwork disappeared.
    const at = source.indexOf('drawFlagGlyph(ctx, text, x, y, outlineWidth = 4) {');
    assert.ok(at >= 0, 'the outlined-glyph helper exists');
    const helper = source.slice(at, source.indexOf('\n    drawCompactPassageOverlay', at));
    assert.match(helper, /ctx\.strokeText\(text, x, y\)/);
    assert.match(helper, /ctx\.fillText\(text, x, y\)/);
    assert.match(helper, /lineJoin = 'round'/, 'so X and the star do not spike');
    // Restores what it touched, since the caller keeps drawing after it.
    for (const prop of ['strokeStyle', 'lineWidth', 'lineJoin']) {
        assert.match(helper, new RegExp(`ctx\\.${prop} = previous\\.${prop};`));
    }
});

test('every marker goes through the outlined helper', () => {
    const at = source.indexOf('drawCompactPassageOverlay(ctx, width, height');
    const body = source.slice(at, source.indexOf('\n    drawSelectionHighlight', at));
    assert.doesNotMatch(body, /ctx\.fillText\(/, 'no raw fillText remains');
    for (const glyph of ["'O'", "'X'", "'★'", "'⚠'", 'terrainTag.toString()']) {
        assert.ok(body.includes(`this.drawFlagGlyph(ctx, ${glyph}`), `${glyph} is outlined`);
    }
});

test('shape markers carry an explicit edge, not a soft shadow', () => {
    // A drop shadow was too weak against busy or same-hued tile art, so every
    // shape gets a hard dark edge the way the glyphs do.
    const at = source.indexOf('drawCompactPassageOverlay(ctx, width, height');
    const body = source.slice(at, source.indexOf('\n    drawSelectionHighlight', at));
    assert.doesNotMatch(body, /shadowColor|shadowBlur/, 'the shadow approach is gone');

    // All four blocked-direction dots and all four passable-direction arrows.
    // The bush is no longer among them: a plain dot was indistinguishable from
    // every other dot on a sheet, so it draws a shrub silhouette instead.
    assert.equal((body.match(/this\.drawFlagDot\(/g) || []).length, 4,
        'the four direction dots');
    assert.equal((body.match(/this\.drawFlagArrow\(/g) || []).length, 4);
    assert.equal((body.match(/this\.drawFlagRect\(/g) || []).length, 2,
        'the ladder stile and the counter bar');
    assert.equal((body.match(/this\.drawBushMark\(/g) || []).length, 1);

    // Only the parts nested inside an already-outlined shape stay raw.
    const raw = body.match(/ctx\.fillRect\(|ctx\.fill\(\)/g) || [];
    assert.equal(raw.length, 3, 'the three ladder rungs');
});

test('the shape helpers restore what they change', () => {
    // They run inside a per-tile loop that keeps drawing afterwards.
    const at = source.indexOf('drawFlagArrow(ctx, points, color) {');
    assert.ok(at >= 0);
    const arrow = source.slice(at, source.indexOf('\n    /** Filled rectangle', at));
    assert.match(arrow, /ctx\.lineCap = previousCap;/);
    assert.match(arrow, /ctx\.lineJoin = previousJoin;/);
    // Dark and wide underneath, colour on top.
    assert.match(arrow, /ctx\.lineWidth = 5;[\s\S]*ctx\.lineWidth = 2\.5;/);
});
