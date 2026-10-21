'use strict';
// A Database list page opens on the record last selected there: kept for the
// session, and for the project across sessions (the per-user selection file
// beside the folds); else on its first record. Opening a page writes nothing
// into the database. The shell (DatabaseEditorUI) runs here against a small
// document, with a temp folder for the per-user file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const S = require('../src/utils/DatabaseSections.js');
const { createDocument } = require('./helpers/card-dom.cjs');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'DatabaseEditorUI.js'), 'utf8');
const temps = [];
const tempDir = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-dbselection-')); temps.push(dir); return dir; };
test.after(() => { for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true }); });

const records = (count, name) => [null].concat(Array.from({ length: count }, (unused, index) => ({ id: index + 1, name: `${name} ${index + 1}` })));

/**
 * The Database open on a project, as one editor window has it.
 * options: state (the per-user folder), project, data
 */
function shell(options = {}) {
    const { document, window, Element } = createDocument();
    Element.prototype.insertBefore = function(child, before) {
        if (child.parentNode) child.parentNode.removeChild(child);
        const at = before ? this.childNodes.indexOf(before) : -1;
        child.parentNode = this;
        if (at < 0) this.childNodes.push(child); else this.childNodes.splice(at, 0, child);
        return child;
    };
    document.body.innerHTML = '<div id="database-viewer"><div id="database-navigation"></div><div id="database-viewer-title"></div>'
        + '<div id="database-list-panel"><div id="database-list"></div></div><div id="database-detail"></div></div>';
    const store = S.createSelectionStore({ fs, path, os, env: { [S.STATE_DIR_ENV]: options.state || tempDir() }, platform: process.platform, warn: () => {} });
    const timers = [];
    window.RRDatabaseSections = {
        recallSelection: (project, page) => { store.sync(); return store.get(project, page, 'id'); },
        rememberSelection: (project, page, id) => { writes.push([page, id]); return store.set(project, page, 'id', id); }
    };
    const writes = [];
    const Shell = vm.runInNewContext(`${source}\nDatabaseEditorUI;`, {
        document, window, console: { log() {}, debug() {}, warn() {}, error() {} },
        // Vehicles lists the three stock rows first, numbered below zero.
        DatabaseVehicleEditor: { listEntries: m => [{ id: -3, name: 'Boat', stockVehicle: 'boat' }, { id: -2, name: 'Ship', stockVehicle: 'ship' }, { id: -1, name: 'Airship', stockVehicle: 'airship' }].concat(m.getVehicles()) },
        rrEscapeHtml: value => String(value),
        setTimeout: handler => { timers.push(handler); return timers.length; },
        clearTimeout: id => { if (id) timers[id - 1] = null; }
    });
    const data = options.data || { items: records(12, 'Item'), weapons: records(5, 'Weapon'), vehicles: [null, { id: 1, name: 'Bike' }], system: {} };
    const shown = [];
    const manager = {
        data, mutationGeneration: 0, dataGeneration: 1,
        getItems: () => data.items.filter(Boolean), getWeapons: () => data.weapons.filter(Boolean),
        getVehicles: () => data.vehicles.filter(Boolean), getMaxEntries: type => data[type].length - 1
    };
    const ui = Object.create(Shell.prototype);
    const page = type => ({ [`show${type}Detail`]: (container, entry) => { shown.push(`${type} ${entry.id}`); container.innerHTML = `<div class="database-section">${entry.name}</div>`; } });
    Object.assign(ui, {
        databaseManager: manager, currentProject: { path: options.project || '/games/One' }, callbacks: {},
        _detailGeneration: 0, _listGeneration: 0,
        itemEditor: page('Item'), weaponEditor: page('Weapon'),
        vehicleEditor: { showStock: (container, key) => { shown.push('Vehicle ' + key); container.innerHTML = key; }, show: (container, entry) => { shown.push('Vehicle ' + entry.id); container.innerHTML = entry.name; } },
        // What the shell draws around the list and the detail is other tests' business.
        setupDatabaseNavigation() {}, setupDatabaseControls() {}, scanMapBattles() {}, refreshDatabaseSections() {},
        wireLiveDatabaseNameSync() {}, applyListIcon() {}, getDatabaseMaximum: () => 9999, updateStatus() {}
    });
    return {
        ui, manager, data, shown, writes, store, document,
        /** The rows of the list and which of them is selected. */
        rows: () => document.getElementById('database-list').querySelectorAll('.database-list-item').map(row => Number(row.dataset.entryId)),
        selected: () => document.getElementById('database-list').querySelectorAll('.database-list-item.selected').map(row => Number(row.dataset.entryId)),
        row: id => document.getElementById('database-list').querySelectorAll('.database-list-item').find(row => Number(row.dataset.entryId) === id),
        detail: () => document.getElementById('database-detail').textContent,
        /** The turn in which the selections go to the file. */
        tick() { for (const handler of timers.splice(0)) if (handler) handler(); },
        pending: () => timers.filter(Boolean).length
    };
}

test('a page opens on its first record, then on the record last selected there', () => {
    const db = shell();
    db.ui.openDatabase('items');
    assert.deepEqual([db.selected(), db.detail(), db.shown], [[1], 'Item 1', ['Item 1']]);
    db.row(7).click();
    assert.deepEqual([db.selected(), db.detail()], [[7], 'Item 7']);
    db.ui.openDatabase('weapons');
    assert.deepEqual([db.selected(), db.detail()], [[1], 'Weapon 1'], 'each page has its own');
    db.row(4).click();
    db.ui.openDatabase('items');
    assert.deepEqual([db.selected(), db.detail()], [[7], 'Item 7']);
    db.ui.openDatabase('weapons');
    assert.deepEqual([db.selected(), db.detail()], [[4], 'Weapon 4']);
    // Closing the Database and opening it again in the same session.
    db.ui.closeDatabaseViewer();
    db.ui.openDatabase('items');
    assert.deepEqual(db.selected(), [7]);
    // The arrow keys and anything else that shows a record count as selecting it.
    db.ui._activeDatabaseList.selectIds([9]);
    db.ui.openDatabase('weapons'); db.ui.openDatabase('items');
    assert.deepEqual(db.selected(), [9]);
});

test('opening pages writes nothing into the database, and Cancel has nothing to take back', () => {
    const db = shell();
    const before = JSON.stringify(db.data);
    db.ui.openDatabase('items');
    db.row(5).click();
    db.ui.openDatabase('weapons');
    db.ui.openDatabase('items');
    assert.equal(JSON.stringify(db.data), before);
    assert.equal(db.manager.mutationGeneration, 0);
    assert.equal(db.ui._dataSnapshot, before, 'the Cancel baseline is the database as it was loaded');
    // An edit, then Cancel: the edit goes, the page still opens on the record that was selected.
    db.data.items[5].name = 'Edited';
    db.ui.revertDatabaseSnapshot();
    db.ui.closeDatabaseViewer();
    assert.equal(JSON.stringify(db.data), before);
    db.ui.openDatabase('items');
    assert.deepEqual([db.selected(), db.detail()], [[5], 'Item 5']);
});

test('a record that is gone gives way to the first one: deleted, or past a smaller maximum', () => {
    const db = shell();
    db.ui.openDatabase('items');
    db.row(11).click();
    // Change Maximum to 6.
    db.data.items.length = 7;
    db.ui.openDatabase('items');
    assert.deepEqual([db.selected(), db.detail()], [[1], 'Item 1']);
    assert.equal(db.rows().length, 6);
    // A list with holes: the record is found by its id, and the first record is the first there is.
    db.ui.createBlankDatabaseEntry = () => null;
    db.row(4).click();
    db.data.items[1] = null;
    db.ui.openDatabase('items');
    assert.deepEqual(db.selected(), [4]);
    db.data.items[4] = null;
    db.ui.openDatabase('items');
    assert.deepEqual(db.selected(), [2]);
    // An empty list selects nothing and says so.
    db.data.items.length = 1;
    db.ui.openDatabase('items');
    assert.deepEqual(db.selected(), []);
    assert.match(db.detail(), /db\.selectEntry/);
});

test('the selection outlives the session: per project, written once after the last move', () => {
    const state = tempDir();
    const first = shell({ state });
    first.ui.openDatabase('items');
    for (const id of [3, 4, 5, 6]) first.ui._activeDatabaseList.selectIds([id]);
    assert.deepEqual(first.writes, [], 'walking the list writes no file');
    assert.equal(first.pending(), 1, 'one write is waiting');
    first.tick();
    assert.deepEqual(first.writes, [['items', 6]]);
    first.ui.openDatabase('weapons');
    first.row(2).click();
    // Closing the Database writes what is still waiting.
    first.ui.closeDatabaseViewer();
    assert.deepEqual(first.writes, [['items', 6], ['weapons', 2]]);
    first.tick();
    assert.deepEqual(first.writes.length, 2, 'and the write that was waiting is not made twice');

    const second = shell({ state });
    second.ui.openDatabase('items');
    assert.deepEqual([second.selected(), second.detail()], [[6], 'Item 6']);
    second.ui.openDatabase('weapons');
    assert.deepEqual(second.selected(), [2]);
    assert.deepEqual(second.writes, [], 'opening on the kept record writes nothing');

    const other = shell({ state, project: '/games/Two' });
    other.ui.openDatabase('items');
    assert.deepEqual(other.selected(), [1], 'another project has its own');
    // A project opened over this one: what was waiting is written for the project it belongs to.
    other.row(8).click();
    other.ui.setCurrentProject({ path: '/games/Three' });
    assert.deepEqual(other.writes, [['items', 8]]);
    assert.equal(other.store.get('/games/Two', 'items', 'id'), 8);
    assert.equal(other.store.get('/games/Three', 'items', 'id'), undefined);
    other.ui.openDatabase('items');
    assert.deepEqual(other.selected(), [1]);
});

test('a record far down a long list is in the list when its page opens', () => {
    const db = shell({ data: { items: records(700, 'Item'), weapons: records(3, 'Weapon'), vehicles: [null], system: {} } });
    db.ui.openDatabase('items');
    assert.equal(db.rows().length, 250, 'a long list is drawn a batch at a time');
    db.ui._activeDatabaseList.reveal(612);
    db.ui.openDatabase('weapons');
    db.ui.openDatabase('items');
    assert.deepEqual([db.selected(), db.detail()], [[612], 'Item 612']);
    assert.ok(db.rows().includes(612) && db.rows().length >= 612);
});

test('Vehicles opens on Boat, then on the row last selected, a stock row included', () => {
    const state = tempDir();
    const db = shell({ state });
    db.ui.openDatabase('vehicles');
    assert.deepEqual([db.rows(), db.selected(), db.detail()], [[-3, -2, -1, 1], [-3], 'boat']);
    db.row(-1).click();
    db.ui.openDatabase('items');
    db.ui.openDatabase('vehicles');
    assert.deepEqual([db.selected(), db.detail()], [[-1], 'airship']);
    db.row(1).click();
    db.ui.closeDatabaseViewer();
    const again = shell({ state });
    again.ui.openDatabase('vehicles');
    assert.deepEqual([again.selected(), again.detail()], [[1], 'Bike']);
    // The custom vehicle removed: back to Boat.
    again.data.vehicles.length = 1;
    again.ui.openDatabase('vehicles');
    assert.deepEqual(again.selected(), [-3]);
});

test('going to a record opens its page on it at once', () => {
    const db = shell();
    db.ui.openDatabase('items');
    db.row(3).click();
    db.shown.length = 0;
    assert.equal(db.ui.navigateToDatabaseEntry('items', 10), true);
    assert.deepEqual([db.selected(), db.shown], [[10], ['Item 10']], 'the record asked for, drawn once');
    assert.equal(db.ui.navigateToDatabaseEntry('items', 99), false, 'a record that is not there');
    assert.deepEqual(db.selected(), [10]);
});

test('the pages that are one page keep no selection', () => {
    const page = /case 'system1': \{[\s\S]*?default:/.exec(source)[0];
    assert.doesNotMatch(page, /openingDatabaseEntry|rememberDatabaseSelection|recalledDatabaseSelection/);
    for (const type of ['system1', 'system2', 'controls', 'types', 'terms']) assert.match(page, new RegExp(`case '${type}': \\{`));
    // The one place a page opens on a record, and the one place a record is kept.
    assert.equal(source.split('this.openingDatabaseEntry(').length, 2);
    assert.equal(source.split('this.rememberDatabaseSelection(').length, 2);
    assert.doesNotMatch(source, /if \(type === 'vehicles' && data\.length\) selectIds/);
});
