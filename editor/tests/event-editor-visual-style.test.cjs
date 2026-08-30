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
