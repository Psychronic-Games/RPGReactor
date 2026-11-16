const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// The Troops page's Battle Mode field writes where the game reads a troop's own mode:
// Troops.json › [id].reactorBattle.mode (F.troopMode in runtime/reactor_fight.js).

const editorRoot = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));

function loadTroopEditor() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    const context = { console: { log() {}, warn() {}, error() {} }, document: { getElementById: () => null } };
    context.window = context;
    return vm.runInNewContext(`${source}\nDatabaseTroopEditor;`, context);
}

test('the modes offered are the ones the game knows', () => {
    const Editor = loadTroopEditor();
    const fight = fs.readFileSync(path.join(editorRoot, '..', 'runtime', 'reactor_fight.js'), 'utf8');
    const list = name => JSON.parse(new RegExp(`F\\.${name} = (\\[[^\\]]*\\]);`).exec(fight)[1]);
    assert.deepEqual(plain(Editor.MODES), list('MODES'));
    assert.deepEqual(plain(Editor.MAP_MODES), list('ON_MAP'));
});

test('choosing a mode writes reactorBattle.mode and keeps what else is stored there', () => {
    const Editor = loadTroopEditor();
    const troop = { id: 3, name: 'Bats' };
    Editor.setTroopMode(troop, 'tactical');
    assert.deepEqual(plain(troop), { id: 3, name: 'Bats', reactorBattle: { mode: 'tactical' } });
    assert.equal(Editor.troopMode(troop), 'tactical');

    const handWritten = { id: 4, reactorBattle: { mode: 'classic', other: 1 } };
    Editor.setTroopMode(handWritten, 'action');
    assert.deepEqual(plain(handWritten.reactorBattle), { mode: 'action', other: 1 });
});

test("back at the project's mode, no field is left on the troop", () => {
    const Editor = loadTroopEditor();
    const troop = { id: 3, reactorBattle: { mode: 'firstPerson' } };
    Editor.setTroopMode(troop, '');
    assert.equal('reactorBattle' in troop, false);

    // A troop never given a mode gains nothing.
    const untouched = { id: 5, name: 'Slimes' };
    Editor.setTroopMode(untouched, '');
    assert.deepEqual(plain(untouched), { id: 5, name: 'Slimes' });

    // What else is stored beside the mode is kept.
    const other = { id: 6, reactorBattle: { mode: 'action', other: 1 } };
    Editor.setTroopMode(other, '');
    assert.deepEqual(plain(other.reactorBattle), { other: 1 });
});

test('a mode the game does not know reads as none, as in the game', () => {
    const Editor = loadTroopEditor();
    assert.equal(Editor.troopMode({ reactorBattle: { mode: 'Tactical' } }), '');
    assert.equal(Editor.troopMode({ reactorBattle: null }), '');
    assert.equal(Editor.troopMode({}), '');
    assert.equal(Editor.troopMode(null), '');
});
