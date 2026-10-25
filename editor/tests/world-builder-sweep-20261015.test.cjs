const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const viewSource = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
const hotbarSource = fs.readFileSync(path.join(editorRoot, 'src', 'BuildHotbar.js'), 'utf8');
const styles = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');

test('both ways the 3D view is made give its input surface the style that selects no text', () => {
    const assignments = viewSource.match(/this\.inputSurface\.style\.cssText\s*=\s*[^;\n]+/g) || [];
    assert.equal(assignments.length, 2, 'the own-canvas and shared-context paths each make one');
    for (const line of assignments) assert.match(line, /MapEditor3D\.INPUT_SURFACE_CSS/);
    const css = viewSource.match(/static INPUT_SURFACE_CSS = '([^']+)'/);
    assert.ok(css, 'the style is one constant');
    assert.match(css[1], /(^|;)\s*user-select:\s*none/);
    assert.match(css[1], /z-index:\s*6/, 'it stays over the canvas');
});

test('the hint over the 3D view selects no text either', () => {
    const rule = styles.match(/\.map-3d-hint\s*\{([^}]*)\}/);
    assert.ok(rule);
    assert.match(rule[1], /user-select:\s*none/);
});

test('a selection\'s parts list has styles for every class it renders', () => {
    for (const cls of ['rr-build-parts', 'rr-build-part-name', 'rr-build-part-count']) {
        assert.ok(hotbarSource.includes(`class="${cls}"`), `${cls} is rendered`);
        assert.match(styles, new RegExp(`\\.${cls}[\\s,{:\\[]`), `${cls} has a rule`);
    }
    // The count stands apart from the name ("Wall 48", not "Wall48").
    const count = styles.match(/\.rr-build-part-count\s*\{([^}]*)\}/);
    assert.match(count[1], /margin-left:\s*auto/);
    const name = styles.match(/\.rr-build-part-name\s*\{([^}]*)\}/);
    assert.match(name[1], /display:\s*flex/);
    assert.match(name[1], /gap:\s*\d+px/);
});
