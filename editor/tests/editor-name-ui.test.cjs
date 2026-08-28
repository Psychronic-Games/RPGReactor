const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const editorNames = require(path.join(editorRoot, 'src', 'utils', 'EditorNames.js'));

function loadDatabaseEditorUI() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseEditorUI;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} },
        RREditorNames: editorNames,
        alert() {},
        confirm: () => true
    });
}

function createUI() {
    const DatabaseEditorUI = loadDatabaseEditorUI();
    const ui = Object.create(DatabaseEditorUI.prototype);
    const actors = [
        null,
        { id: 1, name: 'Harold', nickname: 'Hero' },
        { id: 2, name: 'Therese', nickname: 'Mage' }
    ];
    ui.callbacks = {};
    ui.currentProject = { name: 'Game', path: '/game' };
    ui._listGeneration = 1;
    ui.databaseManager = {
        dataGeneration: 1,
        mutationGeneration: 0,
        data: { actors, editorNames: editorNames.create() },
        editorNamesModule: () => editorNames,
        addEntry(type, entry) {
            entry.id = this.data[type].length;
            this.data[type].push(entry);
            this.mutationGeneration++;
            return entry;
        }
    };
    ui._t = key => key === 'common.unnamed' ? 'Unnamed' : key;
    ui.updateStatus = () => {};
    ui.showDatabaseDetail = () => {};
    return ui;
}

test('database list label modes keep editor names outside RPG Maker records', () => {
    const ui = createUI();
    const actor = ui.databaseManager.data.actors[1];
    let mode = 'editorFirst';
    ui.callbacks.getDatabaseListLabels = () => mode;

    assert.equal(ui.setEditorName('actors', 1, '  Main Character  '), 'Main Character');
    assert.equal('editorName' in actor, false);
    assert.deepEqual({ ...ui.databaseEntryLabels(actor, 'actors') }, {
        primary: 'Main Character', secondary: 'Harold', editorName: 'Main Character'
    });

    mode = 'gameFirst';
    assert.deepEqual({ ...ui.databaseEntryLabels(actor, 'actors') }, {
        primary: 'Harold', secondary: 'Main Character', editorName: 'Main Character'
    });

    mode = 'gameOnly';
    assert.deepEqual({ ...ui.databaseEntryLabels(actor, 'actors') }, {
        primary: 'Harold', secondary: '', editorName: 'Main Character'
    });
});

test('database Cancel snapshots include editor names', () => {
    const ui = createUI();
    ui.setEditorName('actors', 1, 'Original Label');
    ui.takeDatabaseSnapshot();
    ui.setEditorName('actors', 1, 'Changed Label');
    ui.revertDatabaseSnapshot();
    assert.equal(ui.getEditorName('actors', 1), 'Original Label');
});

test('database clipboard, paste, duplicate, and clear carry editor names separately', async () => {
    const ui = createUI();
    const actors = ui.databaseManager.data.actors;
    ui.setEditorName('actors', 1, 'Main Character');
    ui.copyListEntries([actors[1]], 'actors');

    assert.deepEqual(Array.from(ui.listClipboard.editorNames), ['Main Character']);
    assert.equal('editorName' in ui.listClipboard.entries[0], false);

    ui._snapshotForUndo = () => {};
    const visible = actors.filter(Boolean);
    await ui.pasteListEntries(actors[2], visible, 'actors', () => {}, { value: '' }, {});
    assert.equal(actors[2].name, 'Harold');
    assert.equal(ui.getEditorName('actors', 2), 'Main Character');
    assert.equal('editorName' in actors[2], false);

    ui.duplicateListEntry(actors[1], visible, 'actors', () => {}, { value: '' });
    assert.equal(actors[3].name, 'Harold (common.copy)');
    assert.equal(ui.getEditorName('actors', 3), 'Main Character (common.copy)');

    ui.clearDatabaseEntry('actors', 1);
    assert.equal(ui.getEditorName('actors', 1), '');
    assert.equal(actors[1].name, '');
});

test('editor-name detail injection shares the game-name row without becoming game data', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(source, /input\.dataset\.rrEditorName = type/);
    assert.doesNotMatch(source, /rr-editor-name-input[^\n]*data-(?:actor|class|skill|item|weapon|armor|enemy|state)-id/);
    assert.match(source, /column\.className = 'db-col rr-editor-name-column'/);
    assert.match(source, /nameRow\.appendChild\(column\)/);
    assert.doesNotMatch(source, /rr-editor-name-row|nameRow\.insertAdjacentElement/);
    assert.match(source, /editorName\.includes\(query\)/);
    assert.match(source, /wireLiveDatabaseNameSync\(detailEl, entry, type\)/);
    assert.match(source, /this\.callbacks\.saveProject[\s\S]*this\.databaseManager\.saveAllData/);
    assert.match(source, /setDatabaseSaveInFlight\(true\)[\s\S]*setDatabaseSaveInFlight\(false\)/);
    assert.match(source, /if \(this\._databaseSaveInFlight\) return/);

    const main = fs.readFileSync(path.join(editorRoot, 'src', 'main.js'), 'utf8');
    assert.match(main, /saveProject: \(\) => this\.projectController\.saveProject\(\)/);
});
