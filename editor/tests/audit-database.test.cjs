const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const editorNames = require(path.join(editorRoot, 'src', 'utils', 'EditorNames.js'));

function loadDatabaseEditorUI(extra = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseEditorUI;`, Object.assign({
        console: { log() {}, debug() {}, warn() {}, error() {} },
        RREditorNames: editorNames,
        alert() {},
        confirm: () => true
    }, extra));
}

function createUI(data, extra) {
    const DatabaseEditorUI = loadDatabaseEditorUI(extra);
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.callbacks = {};
    ui.currentProject = { name: 'Game', path: '/game' };
    ui._listGeneration = 1;
    ui.databaseManager = {
        dataGeneration: 1,
        mutationGeneration: 0,
        data: Object.assign({ editorNames: editorNames.create() }, data),
        editorNamesModule: () => editorNames
    };
    ui._t = key => key;
    ui.updateStatus = () => {};
    ui.showDatabaseDetail = () => {};
    return ui;
}

test('clearing a User Interfaces record takes it off every System scene it replaced', () => {
    const system = { reactorMenuInterfaceId: 3, reactorTitleInterfaceId: 3, reactorShopInterfaceId: 2, reactorBattleInterfaceId: 3, title: 'Game' };
    const ui = createUI({
        system,
        userInterfaces: [null, { id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C', roles: ['menu', 'title'] }]
    });
    ui.clearDatabaseEntry('userInterfaces', 3);
    assert.equal(system.reactorMenuInterfaceId, 0);
    assert.equal(system.reactorTitleInterfaceId, 0);
    assert.equal(system.reactorBattleInterfaceId, 0);
    assert.equal(system.reactorShopInterfaceId, 2, 'other records keep their scenes');
    assert.equal(system.title, 'Game');
});

test('a cut Action Sequence leaves no orphan row whose edits would go nowhere', async () => {
    const B = require(path.join(editorRoot, '..', 'runtime', 'reactor_battle_data.js'));
    const sequences = [null, B.template('Melee Strike', 1), B.template('Guard', 2)];
    const ui = createUI({ actionSequences: sequences, battlePresentation: B.empty() }, { ReactorBattleData: B });
    ui.listClipboard = null;
    const data = sequences.filter(Boolean);
    let listed = null;
    await ui.cutListEntries([sequences[2]], data, 'actionSequences', () => { listed = data.slice(); }, { value: '' }, {});
    assert.equal(sequences[2], null);
    assert.deepEqual(listed.map(entry => entry.id), [1], 'the cut sequence is gone from the list');
    assert.ok(listed.every(entry => sequences[entry.id] === entry), 'every row is the record in the database');
});

test('the Change Maximum dialog says so when the database refuses the new maximum', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(source, /if \(!this\.databaseManager\.changeMaximum\(type, newMax, template\)\) \{/);
});

test('a screen or hide-target flash keeps its scope when an animation turns into a sprite animation', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseAnimationEditor.js'), 'utf8');
    const Editor = vm.runInNewContext(`${source}\nDatabaseAnimationEditor;`, {
        console: { debug() {}, warn() {}, log() {} }, require, window: {},
        document: { createElement: () => ({ style: {}, appendChild() {} }), getElementById: () => null },
        rrEscapeHtml: value => String(value)
    });
    const animation = { id: 1, name: 'Flashes', effectName: '', soundTimings: [], flashTimings: [
        { frame: 0, duration: 5, color: [255, 255, 255, 255] },
        { frame: 2, duration: 5, color: [255, 0, 0, 255], scope: 2 },
        { frame: 4, duration: 5, color: [0, 0, 0, 0], scope: 3 }
    ] };
    Editor.convertAnimationFormat(animation, 'sprite');
    assert.deepEqual(JSON.parse(JSON.stringify(animation.timings.map(t => [t.frame, t.flashScope]))), [[0, 1], [2, 2], [4, 3]]);
    Editor.convertAnimationFormat(animation, 'effekseer');
    assert.deepEqual(Array.from(animation.flashTimings, t => t.scope), [undefined, 2, 3], 'and back again');
});

test('a new or cleared tileset keeps tile 0 a star, so empty upper layers never decide passage', () => {
    const ui = createUI({ tilesets: [null, { id: 1, name: 'Old', flags: [16] }] });
    const template = ui.getDefaultTemplates().tilesets;
    assert.equal(template.flags.length, 8192);
    assert.equal(template.flags[0], 0x10);
    assert.equal(template.flags.slice(1).some(Boolean), false);
    assert.equal(ui.clearDatabaseEntry('tilesets', 1).flags[0], 0x10);
});

test('a structure copy pasted above its source gets a file of its own, a cut and paste keeps it', async () => {
    const plan = name => ({ name, size: [8, 8] });
    const structures = [null, { id: 1, name: 'Shed', file: 'Shed.json', plan: plan('Shed') }, { id: 2, name: 'Manor', file: 'Manor.json', plan: plan('Manor') }];
    const ui = createUI({ structures });
    const data = structures.filter(Boolean);
    ui.listClipboard = null;
    ui.writeDatabaseEntryClipboard('structures', [structures[2]]);
    await ui.pasteListEntries(structures[1], data, 'structures', () => {}, { value: '' }, {});
    assert.equal(structures[1].name, 'Manor');
    assert.equal(structures[1].file, '', 'the copy is named on save');
    assert.equal(structures[2].file, 'Manor.json', 'the source keeps its file');

    ui.writeDatabaseEntryClipboard('structures', [structures[2]]);
    ui.clearDatabaseEntry('structures', 2);
    await ui.pasteListEntries(structures[1], data, 'structures', () => {}, { value: '' }, {});
    assert.equal(structures[1].file, 'Manor.json', 'moved, the plan keeps its file');
});

test('a battle test keeps the test party in System.json without saving the rest of the unsaved System page', async () => {
    const os = require('node:os');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audit-btest-'));
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Saved', testBattlers: [], testTroopId: 1 }));
    try {
        const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'BattleTestConfigModal.js'), 'utf8');
        const context = {
            console: { log() {}, warn() {}, error() {} }, alert() {},
            document: { getElementById: () => null, createElement: () => ({ style: {}, appendChild() {}, addEventListener() {} }) },
            localStorage: { getItem: () => null, setItem() {} },
            require: name => (name === 'fs' ? fs : name === 'path' ? path : require(name))
        };
        context.window = context;
        const Modal = vm.runInNewContext(`${source}\nBattleTestConfigModal;`, context);
        const actors = [null, { id: 1, name: 'Hero', initialLevel: 1, equips: [0, 0, 0, 0, 0], battlerName: '' }];
        const system = { gameTitle: 'Unsaved edit', testBattlers: [{ actorId: 1, level: 3, equips: [] }], testTroopId: 0 };
        const data = { actors, classes: [], skills: [], items: [], weapons: [], armors: [], enemies: [], troops: [], states: [], animations: [], tilesets: [], commonEvents: [], system, mapInfos: [] };
        const dm = { data, getSystem: () => system, getActors: () => actors.filter(Boolean), getActor: id => actors[id] || null };
        const modal = new Modal(dm, { path: root }, 7, '', '', { battleTest() {} });
        modal.close = () => {};
        modal.missingBattlerGraphics = () => [];
        await modal.launch();
        const saved = JSON.parse(fs.readFileSync(path.join(root, 'data', 'System.json'), 'utf8'));
        assert.equal(saved.testTroopId, 7);
        assert.equal(saved.testBattlers[0].actorId, 1);
        assert.equal(saved.gameTitle, 'Saved', 'the unsaved title stays unsaved');
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'data', 'Test_System.json'), 'utf8')).gameTitle, 'Unsaved edit', 'the test itself plays the current data');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the starting party takes each actor once', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseSystem1Editor.js'), 'utf8');
    assert.match(source, /if \(actorId && !\(system\.partyMembers \|\| \[\]\)\.includes\(actorId\)\) \{\s*if \(!system\.partyMembers\) system\.partyMembers = \[\];\s*system\.partyMembers\.push\(actorId\);/);
});

test('a duplicated or pasted quest does not take its source key, a moved one keeps it', async () => {
    const quests = [null, { id: 1, name: 'Rats', key: 'rats' }, { id: 2, name: 'Wolves', key: 'wolves' }];
    const ui = createUI({ quests });
    ui.databaseManager.addEntry = function(type, entry) { entry.id = this.data[type].length; this.data[type].push(entry); return entry; };
    const data = quests.filter(Boolean);
    ui.duplicateListEntry(quests[1], data, 'quests', () => {}, { value: '' });
    assert.equal(quests[3].key, '');
    assert.equal(quests[1].key, 'rats');
    ui.writeDatabaseEntryClipboard('quests', [quests[2]]);
    await ui.pasteListEntries(quests[3], data, 'quests', () => {}, { value: '' }, {});
    assert.equal(quests[3].key, '');
    ui.writeDatabaseEntryClipboard('quests', [quests[2]]);
    quests[2] = null;
    await ui.pasteListEntries(quests[3], quests.filter(Boolean), 'quests', () => {}, { value: '' }, {});
    assert.equal(quests[3].key, 'wolves');
});

test('a tileset\'s 3D tile classes go with it when it is duplicated, pasted or cleared', async () => {
    const flags = () => Object.assign(new Array(8192).fill(0), { 0: 16 });
    const tilesets = [null, { id: 1, name: 'Town', flags: flags() }, { id: 2, name: 'Cave', flags: flags() }];
    const tileset3d = { version: 1, tilesets: { 1: { 1536: 'upright' } } };
    const ui = createUI({ tilesets, tileset3d });
    ui.databaseManager.addEntry = function(type, entry) { entry.id = this.data[type].length; this.data[type].push(entry); return entry; };
    const data = tilesets.filter(Boolean);
    ui.duplicateListEntry(tilesets[1], data, 'tilesets', () => {}, { value: '' });
    assert.deepEqual({ ...tileset3d.tilesets[3] }, { 1536: 'upright' });
    tileset3d.tilesets[3][1536] = 'flat';
    assert.equal(tileset3d.tilesets[1][1536], 'upright', 'a copy, not the same object');

    ui.writeDatabaseEntryClipboard('tilesets', [tilesets[1]]);
    await ui.pasteListEntries(tilesets[2], data, 'tilesets', () => {}, { value: '' }, {});
    assert.deepEqual({ ...tileset3d.tilesets[2] }, { 1536: 'upright' });

    ui.clearDatabaseEntry('tilesets', 2);
    assert.equal(tileset3d.tilesets[2], undefined);
});

test('the tileset editor keeps tile 0 a star whatever passage is painted on it', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTilesetEditor.js'), 'utf8');
    const Editor = vm.runInNewContext(`${source}\nDatabaseTilesetEditor;`, { console, window: {}, document: {} });
    assert.equal(Editor.keepEmptyTileStar(0, 0x00), 0x10, 'O');
    assert.equal(Editor.keepEmptyTileStar(0, 0x0F), 0x10, 'X');
    assert.equal(Editor.keepEmptyTileStar(0, 0x40 | 0x0F | (3 << 12)), 0x10 | 0x40 | (3 << 12), 'bush and terrain stay');
    assert.equal(Editor.keepEmptyTileStar(1, 0x0F), 0x0F, 'every other tile is free');
    assert.match(source, /currentFlag = DatabaseTilesetEditor\.keepEmptyTileStar\(tileIndex, currentFlag\);/);
    assert.match(source, /newFlag = DatabaseTilesetEditor\.keepEmptyTileStar\(tileIndex, newFlag\);/);
});
