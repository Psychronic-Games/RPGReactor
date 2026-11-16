// Database > Controls (Physics): "Store the tiles fallen in variable" writes
// System.json › reactorPhysics.fallVariable, which the game sets before a long fall's common event.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'DatabaseControlsEditor.js'), 'utf8');
const escape = text => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const context = { console, document: {}, rrEscapeHtml: escape };
context.window = context;
const Editor = vm.runInNewContext(`${source}\nDatabaseControlsEditor;`, context);
const plain = value => JSON.parse(JSON.stringify(value));

function page(system) {
    const editor = Object.create(Editor.prototype);
    editor.databaseManager = { data: { system, commonEvents: [null, { id: 1, name: 'Fell' }] }, getSystem: () => system, mutationGeneration: 0 };
    return editor;
}
const chosen = html => (/<select class="database-field-value rr-controls-fallvariable"[^>]*>(.*?)<\/select>/s.exec(html)[1].match(/<option value="(\d+)" selected>/) || [])[1];
const offered = html => Array.from(/<select class="database-field-value rr-controls-fallvariable"[^>]*>(.*?)<\/select>/s.exec(html)[1].matchAll(/<option value="(\d+)"/g), m => Number(m[1]));

test('the variable is stored where the game reads it, and none stores no field', () => {
    assert.deepEqual(plain(Editor.setFallVariable({ fallFrom: 6 }, '12')), { fallFrom: 6, fallVariable: 12 });
    assert.deepEqual(plain(Editor.setFallVariable({ fallFrom: 6, fallVariable: 12 }, '0')), { fallFrom: 6 });
    assert.deepEqual(plain(Editor.setFallVariable({ fallFrom: 6 }, '')), { fallFrom: 6 });
    assert.equal(Editor.fallVariableOf({ fallVariable: '7' }), 7);
    assert.equal(Editor.fallVariableOf({ fallVariable: -3 }), 0);
    assert.equal(Editor.fallVariableOf(undefined), 0);
    // The game's own test of the setting.
    const physics = fs.readFileSync(path.join(__dirname, '..', '..', 'runtime', 'reactor_physics.js'), 'utf8');
    assert.match(physics, /settings\.fallVariable > 0\) \$gameVariables\.setValue\(settings\.fallVariable, Math\.round\(tiles\)\)/);
});

test('the Physics card offers the project\'s variables and shows the one stored', () => {
    const system = { variables: ['', 'Gold found', 'Fall'], reactorPhysics: { fallVariable: 2 } };
    let html = page(system).physicsCards();
    assert.match(html, /Store the tiles fallen in variable/);
    assert.deepEqual(offered(html), [0, 1, 2]);
    assert.equal(chosen(html), '2');
    assert.match(html, /0002: Fall/);
    // A project that never set it: none is shown, and drawing the card writes nothing.
    const bare = { variables: ['', 'A'] };
    html = page(bare).physicsCards();
    assert.equal(chosen(html), '0');
    assert.deepEqual(plain(bare), { variables: ['', 'A'] });
    // A variable past the project's list (typed by hand) stays listed, so it is not changed by opening the page.
    html = page({ variables: ['', 'A'], reactorPhysics: { fallVariable: 5 } }).physicsCards();
    assert.equal(chosen(html), '5');
    assert.deepEqual(offered(html), [0, 1, 2, 3, 4, 5]);
});

test('choosing a variable keeps the other physics settings and the default list out of the way', () => {
    const system = { variables: ['', 'A', 'B'], reactorPhysics: { gravity: 0.5 } };
    const editor = page(system);
    editor.savePhysics(Editor.setFallVariable(editor.physics(), '2'));
    assert.equal(system.reactorPhysics.fallVariable, 2);
    assert.equal(system.reactorPhysics.gravity, 0.5);
    editor.savePhysics(Editor.setFallVariable(editor.physics(), '0'));
    assert.equal('fallVariable' in system.reactorPhysics, false);
});
