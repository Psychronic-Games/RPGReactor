'use strict';
// 3D model bindings (Database.r3d.json) are part of the Database's edits: held in
// memory while the project is loaded, written on OK/Apply, dropped by Cancel,
// restored by list Undo, and pruned when a section's maximum shrinks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const bindings = require(path.join(editorRoot, 'src', 'database', 'Database3DBindings.js'));
const RRJson = require(path.join(editorRoot, 'src', 'utils', 'JsonFiles.js'));

const quietConsole = Object.create(console);
quietConsole.error = () => {};
quietConsole.warn = () => {};

function loadDatabaseManager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseManager;`, {
        RRJson, console: quietConsole, process, require, nw: {}, RRDatabase3DBindings: bindings
    });
}

function loadDatabaseEditorUI() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseEditorUI;`, {
        console: quietConsole, RRDatabase3DBindings: bindings, alert() {}, confirm: () => true
    });
}

const spec = name => ({ name, size: 2, scale: 1 });

async function openProject(initial) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-binding-tx-'));
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'Actors.json'), JSON.stringify([null, { id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }]));
    fs.writeFileSync(path.join(root, 'data', 'Enemies.json'), JSON.stringify([null, { id: 1, name: 'Slime' }]));
    if (initial) fs.writeFileSync(bindings.filePath(root), JSON.stringify(initial));
    const DatabaseManager = loadDatabaseManager();
    const manager = new DatabaseManager();
    manager.fs = fs; manager.path = path;
    assert.equal(await manager.loadAllData(root), true);
    return { root, manager, file: () => (fs.existsSync(bindings.filePath(root)) ? fs.readFileSync(bindings.filePath(root), 'utf8') : null) };
}

test('a binding made in the Database waits for OK; Cancel takes it back and the file never changes', async () => {
    const { root, manager, file } = await openProject({ version: 1, actors: { 1: { character: spec('Knight') } } });
    const before = file();
    const DatabaseEditorUI = loadDatabaseEditorUI();
    const ui = { databaseManager: manager, currentProject: null, _dataSnapshot: JSON.stringify(manager.data) };

    bindings.set(root, 'actors', 2, spec('Mage'), 'character');
    bindings.set(root, 'actors', 1, null, 'character');
    assert.equal(bindings.get(root, 'actors', 2, 'character').name, 'Mage', 'the Database sees its own edit');
    assert.equal(bindings.get(root, 'actors', 1, 'character'), null);
    assert.equal(file(), before, 'nothing is written before OK');
    assert.ok(manager.getDirtyKeys().includes('modelBindings'), 'counts as unsaved work');

    DatabaseEditorUI.prototype.revertDatabaseSnapshot.call(ui);
    assert.equal(bindings.get(root, 'actors', 2, 'character'), null, 'Cancel drops the new binding');
    assert.equal(bindings.get(root, 'actors', 1, 'character').name, 'Knight', 'and restores the removed one');
    assert.equal(file(), before);
});

test('OK writes the bindings with the database, in the same file format', async () => {
    const { root, manager, file } = await openProject(null);
    bindings.set(root, 'enemies', 1, spec('Slime'));
    bindings.set(root, 'actors', 3, spec('Rogue'), 'battler');
    assert.equal(file(), null);
    assert.equal(await manager.saveAllData(root), true);
    const saved = JSON.parse(file());
    assert.equal(saved.version, 1);
    assert.equal(saved.enemies[1].name, 'Slime');
    assert.equal(saved.actors[3].battler.name, 'Rogue');
    assert.deepEqual([...manager.getDirtyKeys()], [], 'clean after the save');

    bindings.set(root, 'enemies', 1, null);
    bindings.set(root, 'actors', 3, null, 'battler');
    assert.equal(await manager.saveAllData(root), true);
    assert.equal(file(), null, 'nothing bound: the file goes, as before');
});

test('shrinking a section drops the removed records\' bindings, so a regrown record starts without a model', async () => {
    const { root, manager, file } = await openProject({ version: 1, actors: { 1: { character: spec('Knight') }, 3: { character: spec('Rogue') } }, enemies: { 1: spec('Slime') } });
    assert.equal(manager.changeMaximum('actors', 2, { name: '' }), true);
    assert.equal(manager.changeMaximum('actors', 3, { name: '' }), true);
    assert.equal(bindings.get(root, 'actors', 3, 'character'), null);
    assert.equal(bindings.get(root, 'actors', 1, 'character').name, 'Knight');
    assert.equal(await manager.saveAllData(root), true);
    const saved = JSON.parse(file());
    assert.equal(saved.actors[3], undefined);
    assert.equal(saved.enemies[1].name, 'Slime', 'other sections untouched');
});

test('clearing a record clears its binding in memory; list Undo snapshots carry the bindings', async () => {
    const { root, manager, file } = await openProject({ version: 1, enemies: { 1: spec('Slime') } });
    const before = file();
    const DatabaseEditorUI = loadDatabaseEditorUI();
    const ui = Object.create(DatabaseEditorUI.prototype);
    Object.assign(ui, { databaseManager: manager, currentProject: { path: root }, modelBindings: bindings });
    ui.getDefaultTemplates = () => ({ enemies: { name: '' } });
    ui.setEditorName = () => {};
    ui._markDatabaseMutation = () => {};

    const undoSnapshot = JSON.parse(JSON.stringify(manager.data.modelBindings));
    ui.clearDatabaseEntry('enemies', 1);
    assert.equal(bindings.get(root, 'enemies', 1), null, 'a cleared enemy keeps no model');
    ui.writeModelBinding('enemies', 1, spec('Bat'));
    assert.equal(bindings.get(root, 'enemies', 1).name, 'Bat', 'a paste binds in memory');
    assert.equal(file(), before, 'neither touched the file');
    manager.data.modelBindings = undoSnapshot;
    assert.equal(bindings.get(root, 'enemies', 1).name, 'Slime', 'restoring the snapshot restores the binding');

    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(source, /modelBindings: DatabaseEditorUI\.MODEL_BINDING_TYPES\.includes\(type\) \? JSON\.parse\(JSON\.stringify\(this\.databaseManager\.data\.modelBindings \?\? null\)\) : undefined/);
    assert.match(source, /if \(snapshot\.modelBindings !== undefined\) this\.databaseManager\.data\.modelBindings = snapshot\.modelBindings;/);
});

test('another project, or an unreadable file, still reads the disk and is never overwritten', async () => {
    const { root, manager } = await openProject(null);
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-binding-other-'));
    fs.mkdirSync(path.join(other, 'data'));
    bindings.set(other, 'actors', 1, spec('Knight'), 'character');
    assert.ok(fs.existsSync(bindings.filePath(other)), 'a project not loaded writes straight to its file');

    fs.writeFileSync(bindings.filePath(root), '{ not json');
    await manager.loadAllData(root);
    assert.throws(() => bindings.get(root, 'actors', 1), 'readers see the damaged file');
    assert.throws(() => bindings.set(root, 'actors', 1, spec('Knight'), 'character'), 'a binding cannot be made over it');
    assert.equal(await manager.saveAllData(root), true);
    assert.equal(fs.readFileSync(bindings.filePath(root), 'utf8'), '{ not json');
});

test('a battle test plays the Database\'s unsaved bindings from Test_Database.r3d.json', () => {
    const modal = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'BattleTestConfigModal.js'), 'utf8');
    assert.match(modal, /Test_Database\.r3d\.json/);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-binding-btest-'));
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'Database.r3d.json'), JSON.stringify({ enemies: { 1: spec('Saved') } }));
    fs.writeFileSync(path.join(root, 'data', 'Test_Database.r3d.json'), JSON.stringify({ enemies: { 1: spec('Unsaved') } }));
    const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const saved = { Utils: globalThis.Utils, DataManager: globalThis.DataManager };
    const mainModule = Object.getOwnPropertyDescriptor(process, 'mainModule');
    Object.defineProperty(process, 'mainModule', { value: { filename: path.join(root, 'index.html') }, configurable: true, writable: true });
    globalThis.Utils = { isNwjs: () => true };
    const read = testing => {
        globalThis.DataManager = { isBattleTest: () => testing };
        Reactor3D._databaseSidecarState = null;
        Reactor3D._databaseSidecar = null;
        Reactor3D.loadDatabaseSidecar();
        return Reactor3D._databaseSidecar.enemies[1].name;
    };
    try {
        assert.equal(read(true), 'Unsaved');
        assert.equal(read(false), 'Saved', 'a normal run reads the project file');
        fs.rmSync(path.join(root, 'data', 'Test_Database.r3d.json'));
        assert.equal(read(true), 'Saved', 'a test without the copy falls back to the file');
    } finally {
        if (mainModule) Object.defineProperty(process, 'mainModule', mainModule); else delete process.mainModule;
        globalThis.Utils = saved.Utils;
        globalThis.DataManager = saved.DataManager;
        Reactor3D._databaseSidecarState = null;
        Reactor3D._databaseSidecar = null;
    }
});
