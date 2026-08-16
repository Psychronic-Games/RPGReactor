const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const pickerSource = fs.readFileSync(
    path.join(editorRoot, 'src', 'utils', 'PickerIndex.js'), 'utf8');

test('arrow keys walk the file list instead of scrolling it', () => {
    // The native behaviour scrolled the pane out from under the selection;
    // the browser now steps the selection one file per press and lets the
    // list scroll only when the selection reaches its edge.
    assert.match(pickerSource, /const moveSelection = step => \{/);
    assert.match(pickerSource, /'ArrowDown' \|\| event\.key === 'ArrowUp'/);
    assert.match(pickerSource, /event\.preventDefault\(\);\s*\n\s*moveSelection\(/,
        'the native scroll is suppressed in favour of stepping');
    assert.match(pickerSource, /scrollIntoView\(\{ block: 'nearest' \}\)/,
        'scrolling happens only to keep the selection visible');
    // The sticky section header would otherwise hide an upward step.
    assert.match(pickerSource, /list\.scrollTop -= covered/);
    // Selection changes announce through the same onSelect a click uses.
    assert.match(pickerSource, /if \(changed && options\.onSelect\) options\.onSelect\(/);
    assert.match(pickerSource, /focusSelected\(\) \{/, 'callers can arm the keyboard');
});

test('the character picker arms the keyboard when it opens', () => {
    const source = fs.readFileSync(
        path.join(editorRoot, 'src', 'event', 'CharacterGraphicPicker.js'), 'utf8');
    assert.match(source, /browser\.focusSelected\(\);/);
});
