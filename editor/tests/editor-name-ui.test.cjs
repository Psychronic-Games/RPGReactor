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

test('DatabaseTroopEditor resolves and formats enemy editor names in picker labels and preview', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    class EditorStub {}
    class PluginCommandEditorStub {}
    const context = {
        console: { log() {}, warn() {}, error() {} },
        document: {
            getElementById: () => null,
            createElement: tag => ({
                tagName: tag.toUpperCase(),
                style: {},
                dataset: {},
                classList: { add() {}, remove() {}, toggle() {} },
                setAttribute() {},
                appendChild(child) { (this.children = this.children || []).push(child); },
                append(...children) { (this.children = this.children || []).push(...children); },
                replaceChildren() { this.children = []; },
                replaceWith() {},
                addEventListener() {},
                removeEventListener() {},
                querySelector: () => null,
                querySelectorAll: () => []
            }),
            body: { appendChild() {} }
        },
        window: {
            I18n: { tText: s => s, t: s => s }
        },
        RREditorNames: editorNames,
        RRPickerIndex: {
            createBrowser: options => ({
                element: { style: {} },
                list: { addEventListener() {} },
                searchInput: { focus() {} },
                scrollTo() {}
            })
        },
        PluginCommandEditor: PluginCommandEditorStub,
        requestAnimationFrame: () => {}
    };
    for (const name of [
        'CommonEventEditor', 'ControlVariablesEditor', 'ShowPictureEditor',
        'MovePictureEditor', 'ErasePictureEditor', 'ForceActionEditor',
        'ConditionalBranchEditor', 'LoopEditor', 'AudioCommandEditor',
        'ChangeVehicleBGMEditor'
    ]) context[name] = EditorStub;

    const DatabaseTroopEditor = vm.runInNewContext(`${source}\nDatabaseTroopEditor;`, context);
    const enemies = [
        null,
        { id: 1, name: 'Goblin', params: [200, 0, 25, 20, 20, 20, 20, 20] },
        { id: 2, name: 'Dragon', params: [2000, 100, 80, 70, 70, 70, 50, 40] },
        { id: 3, name: 'Slime', params: [50, 0, 10, 10, 10, 10, 10, 10] }
    ];
    const namesStore = editorNames.create();
    editorNames.set(namesStore, 'enemies', 1, 'Cave Goblin');
    // Same editor name as game name: the label must not read "Slime (Slime)".
    editorNames.set(namesStore, 'enemies', 3, 'Slime');

    const dbManager = {
        data: { enemies, editorNames: namesStore },
        getEnemies: () => enemies,
        editorNamesModule: () => editorNames
    };

    let labelMode = 'editorFirst';
    const parentEditor = {
        getEditorName: (type, id) => editorNames.get(namesStore, type, id),
        getDatabaseListLabels: () => labelMode,
        databaseEntryLabels(entry, type) {
            const gameName = String(entry?.name || '');
            const editorName = this.getEditorName(type, entry?.id);
            if (labelMode === 'gameOnly' || !editorName) return { primary: gameName || 'Unnamed', secondary: '', editorName };
            if (labelMode === 'gameFirst') return { primary: gameName || 'Unnamed', secondary: editorName, editorName };
            return { primary: editorName, secondary: gameName, editorName };
        }
    };

    const troopEditor = new DatabaseTroopEditor(dbManager, { getCurrentProject: () => ({ path: '/test' }) }, {}, parentEditor);

    // 1. Check databaseEntryLabels delegation
    assert.deepEqual({ ...troopEditor.databaseEntryLabels(enemies[1], 'enemies') }, {
        primary: 'Cave Goblin', secondary: 'Goblin', editorName: 'Cave Goblin'
    });

    // 2. With no parent there is no names store to consult, so the game name is the
    // whole answer. DatabaseEditorUI owns the store, the mode and the orderings; the
    // troop editor must not carry a second implementation of any of them.
    const standaloneEditor = new DatabaseTroopEditor(dbManager, { getCurrentProject: () => ({ path: '/test' }) }, {}, null);
    assert.deepEqual({ ...standaloneEditor.databaseEntryLabels(enemies[1], 'enemies') }, {
        primary: 'Goblin', secondary: '', editorName: ''
    });
    assert.deepEqual({ ...standaloneEditor.databaseEntryLabels(enemies[2], 'enemies') }, {
        primary: 'Dragon', secondary: '', editorName: ''
    });

    // 3. Check showEnemyPicker captures labels
    let passedFiles = [];
    context.RRPickerIndex.createBrowser = options => {
        passedFiles = options.files;
        return {
            element: { style: {} },
            list: { addEventListener() {} },
            searchInput: { focus() {} },
            scrollTo() {}
        };
    };

    troopEditor.currentTroop = { id: 1, members: [] };
    troopEditor.showEnemyPicker();
    assert.equal(passedFiles[0], 'Cave Goblin (Goblin) [#0001]');
    assert.equal(passedFiles[1], 'Dragon [#0002]');
    assert.equal(passedFiles[2], 'Slime [#0003]');

    labelMode = 'gameFirst';
    troopEditor.showEnemyPicker();
    assert.equal(passedFiles[0], 'Goblin (Cave Goblin) [#0001]');
    assert.equal(passedFiles[1], 'Dragon [#0002]');
    assert.equal(passedFiles[2], 'Slime [#0003]');

    labelMode = 'gameOnly';
    troopEditor.showEnemyPicker();
    assert.equal(passedFiles[0], 'Goblin [#0001]');
    assert.equal(passedFiles[1], 'Dragon [#0002]');
    assert.equal(passedFiles[2], 'Slime [#0003]');
});

