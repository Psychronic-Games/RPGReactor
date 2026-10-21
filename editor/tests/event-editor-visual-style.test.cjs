const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');

test('Event Editor uses themed note and command-banner treatments', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventEditor.js'), 'utf8');
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');
    assert.match(source, /class="event-note-input database-field-value"/);
    assert.match(source, /data-field="note" data-event-id=/);
    assert.match(source, /database-section-header event-commands-banner/);
    assert.match(source, /event\.commandsTotal/);
    assert.match(css, /\.event-commands-banner\s*\{[\s\S]*?var\(--color-bg-toolbar\)[\s\S]*?border-left: 3px solid var\(--color-accent\)[\s\S]*?var\(--color-border\)/);
    assert.match(css, /textarea\.database-field-value::\-webkit-resizer/);
});

test('the Event Editor top is a band of fields over the page strip, styled from classes', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventEditor.js'), 'utf8');
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');
    const top = source.slice(source.indexOf('createHeader(event) {'), source.indexOf('createRightColumn(event) {'));
    // Name, note, position, size and the battle unit: each a label over its controls, in that order (the tab order).
    // Name, Note, Position, Size, In battle, Vehicle.
    assert.equal((top.match(/class="event-header-label[ "]/g) || []).length, 6);
    assert.match(top, /event-name-field[\s\S]*event-note-field[\s\S]*event-position-x[\s\S]*event-size-w[\s\S]*createUnitRow\(event\)[\s\S]*createPageStrip\(event\)/);
    assert.match(top, /strip\.appendChild\(this\.createPageTabs\(event\)\);\s*strip\.appendChild\(this\.createPageButtons\(\)\);/, 'the page buttons follow the tabs on one strip');
    assert.doesNotMatch(top, /style="|\.style\.(?!display|flex|overflow|minHeight)/, 'the band and the strip carry no inline styles');
    // Every control of the band is one height, and the note rests at that height too.
    assert.match(css, /\.event-editor-header input, \.event-editor-header select, \.event-editor-header textarea \{[^}]*height: 28px;/);
    assert.match(css, /\.event-note-box \{[^}]*height: 28px;/);
    assert.match(css, /\.event-note-box textarea\.event-note-input \{[^}]*overflow: hidden;[^}]*resize: none;/, 'no resize corner, no scroll bar at rest');
    assert.match(css, /\.event-note-box textarea\.event-note-input:focus \{[^}]*height: \d+px;/, 'it opens while it is edited');
    // The text fields fill what the fixed groups leave; the groups wrap together, never one by one.
    assert.match(css, /\.event-editor-header \{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*align-items: flex-end;/);
    assert.match(css, /\.event-header-text \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1\.5fr\);/);
    assert.match(css, /\.event-header-set \{[^}]*display: flex;/);
    // Five page buttons of one width, at the right end of the tab strip; many tabs scroll in their own area.
    assert.match(css, /\.event-page-buttons \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
    assert.match(css, /\.event-page-tabs \{[^}]*max-height: \d+px;[^}]*overflow-y: auto;/);
    assert.match(css, /\.event-page-tab, \.event-page-button \{[^}]*height: 24px;/);
});

test('the event editor frees a page\'s 3D preview when another page is shown or the dialog closes', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventEditor.js'), 'utf8');
    assert.match(source, /this\.pageEditor\?\._disposeModelPreview\?\.\(\);\s*const pageEditor = this\.pageEditor = new EventPageEditor\(/);
    const hide = source.slice(source.indexOf('_hideEditor() {'), source.indexOf('_currentMap() {'));
    assert.match(hide, /this\.pageEditor\?\._disposeModelPreview\?\.\(\);/);
});
