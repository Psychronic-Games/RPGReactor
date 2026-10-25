const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

class FakeNode {
    constructor(parent = null) { this.parent = parent; }
    contains(other) { for (let n = other; n; n = n.parent) if (n === this) return true; return false; }
}

function loadUI(document) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const DatabaseEditorUI = vm.runInNewContext(`${source}\nDatabaseEditorUI;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} }, Node: FakeNode, document
    });
    return Object.create(DatabaseEditorUI.prototype);
}

test('keys after a click on a no-focus part of the detail never reach the record list', () => {
    const body = new FakeNode(), document = { body };
    const detail = new FakeNode(body), canvas = new FakeNode(detail), list = new FakeNode(body), listRow = new FakeNode(list);
    const ui = loadUI(document);

    // Clicked a preview canvas (takes no focus), then pressed Delete: the key lands on the page body.
    ui._lastDatabasePointerTarget = canvas;
    assert.equal(ui._keyFollowsDetailClick({ target: body }, detail), true);
    assert.equal(ui._keyFollowsDetailClick({ target: document }, detail), true);

    // Clicked a record in the list: Delete there still clears the record.
    ui._lastDatabasePointerTarget = listRow;
    assert.equal(ui._keyFollowsDetailClick({ target: body }, detail), false);

    // A key aimed at a focused control is judged by its own target, not by the last click.
    ui._lastDatabasePointerTarget = canvas;
    assert.equal(ui._keyFollowsDetailClick({ target: list }, detail), false);

    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(source, /if \(this\._keyFollowsDetailClick\(event, detailEl\)\) return;[\s\S]*event\.key === 'Delete' \|\| event\.key === 'Backspace'/);
    assert.match(source, /addEventListener\('pointerdown', this\._databasePointerTracker, true\)/);
});

test('a new Effekseer animation with no effect file opens without a console error', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseAnimationEditor.js'), 'utf8');
    assert.doesNotMatch(source, /console\.error\('No effect name specified'\)/);
    assert.match(source, /if \(!animation\.effectName\) return;/);
});
