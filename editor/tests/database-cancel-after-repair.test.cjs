const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// A list with empty gaps (an old project) is repaired when its page is first opened, after the
// copy for Cancel was taken. The copy takes the repair, so Cancel does not ask about changes
// nobody made; the author's own edits, made before or after, still read as changes.

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'DatabaseEditorUI.js'), 'utf8');
const DatabaseEditorUI = vm.runInNewContext(`${source}\nDatabaseEditorUI;`, {
    console: { log() {}, warn() {}, error() {}, debug() {} }, document: { addEventListener() {}, getElementById: () => null }, window: {}
});

function open(data) {
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.databaseManager = { data, mutationGeneration: 0, getSystem: () => data.system || {} };
    ui.takeDatabaseSnapshot();
    return ui;
}
const dirty = ui => JSON.stringify(ui.databaseManager.data) !== ui._dataSnapshot;
const item = (id, name) => ({ id, name });

test('opening a page that repairs gaps leaves nothing for Cancel to ask about', () => {
    const ui = open({ items: [null, item(1, 'Potion'), null, item(3, 'Ether')], weapons: [null, null, item(2, 'Sword')] });
    assert.equal(dirty(ui), false);
    assert.equal(ui.restoreNullDatabaseEntries('items'), 1);
    assert.equal(ui.databaseManager.data.items[2].id, 2, 'the gap is a blank record');
    assert.equal(dirty(ui), false, 'the repair is not a change of the author');
    // The other lists are not repaired until their own page opens.
    assert.equal(ui.databaseManager.data.weapons[1], null);
    assert.equal(JSON.parse(ui._dataSnapshot).weapons[1], null);
    assert.equal(ui.restoreNullDatabaseEntries('weapons'), 1);
    assert.equal(dirty(ui), false);
});

test('an edit made after the repair is still a change', () => {
    const ui = open({ items: [null, item(1, 'Potion'), null] });
    ui.restoreNullDatabaseEntries('items');
    ui.databaseManager.data.items[1].name = 'Tonic';
    assert.equal(dirty(ui), true);
    assert.equal(JSON.parse(ui._dataSnapshot).items[1].name, 'Potion', 'Cancel puts the old name back');
});

test('an edit made before the repair is still a change, in that list and in others', () => {
    const ui = open({ items: [null, item(1, 'Potion'), null], weapons: [null, item(1, 'Sword')] });
    ui.databaseManager.data.weapons[1].name = 'Axe';
    ui.databaseManager.data.items[1].name = 'Tonic';
    ui.restoreNullDatabaseEntries('items');
    assert.equal(dirty(ui), true);
    const kept = JSON.parse(ui._dataSnapshot);
    assert.equal(kept.weapons[1].name, 'Sword');
    assert.equal(kept.items[1].name, 'Potion', 'only the gap was taken into the copy');
    assert.equal(kept.items[2].id, 2);
    // Undoing the two edits by hand leaves nothing to discard.
    ui.databaseManager.data.weapons[1].name = 'Sword';
    ui.databaseManager.data.items[1].name = 'Potion';
    assert.equal(dirty(ui), false);
});

test('with no copy for Cancel (the Database is not open) the repair still runs', () => {
    const ui = open({ items: [null, null, item(2, 'Ether')] });
    ui._dataSnapshot = null;
    assert.equal(ui.restoreNullDatabaseEntries('items'), 1);
    assert.equal(ui._dataSnapshot, null);
});
