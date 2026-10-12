/**
 * The questions of the project, map, Database and event tools, asked through
 * the editor's themed dialog (RRDialog): each kind of flow is run with a
 * stand-in dialog that answers yes, then no (and, where the function checks
 * that what it asked about is still there, late), and what each answer did is
 * checked.
 *
 * Methods are run on their class. Handlers that live in a closure of a page
 * (the Database list's Delete and Change Maximum, the Types page's Clear
 * Selected) are taken from the source by name and run with the closure's
 * names supplied.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { codeOnly, dialogCalls } = require('./helpers/native-dialog-scan.cjs');

const srcRoot = path.resolve(__dirname, '..', 'src');
const read = relative => fs.readFileSync(path.join(srcRoot, relative), 'utf8');
const quiet = { log() {}, debug() {}, info() {}, warn() {}, error() {} };
const plain = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setImmediate(resolve));

/** An RRDialog that records what it is asked and answers each question and prompt from a list, in order. */
function dialog(answers = []) {
    const asked = [];
    const next = type => {
        if (!answers.length) throw new Error(`a ${type} nobody expected: ${JSON.stringify(asked.at(-1))}`);
        return answers.shift();
    };
    return {
        asked,
        confirm: async (message, options = {}) => { asked.push({ type: 'confirm', message, options: { ...options } }); return next('question'); },
        alert: async (message, options = {}) => { asked.push({ type: 'alert', message, options: { ...options } }); },
        prompt: async (message, options = {}) => { asked.push({ type: 'prompt', message, options: { ...options } }); return next('prompt'); }
    };
}

function load(relative, className, globals = {}) {
    return vm.runInNewContext(`${read(relative)}\n${className};`, {
        console: quiet, require, process, RRJson: require('../src/utils/JsonFiles.js'), ...globals
    });
}

// ---------------------------------------------------------------------------
// Unsaved changes: Save / Discard Changes / Cancel
// ---------------------------------------------------------------------------

/** A project controller with a changed map, and counters for what was saved. */
function dirtyController(RRDialog, uiManager, globals = {}) {
    const ProjectController = load('ProjectController.js', 'ProjectController', { RRDialog, ...globals });
    const done = { mapSaves: 0, projectSaves: 0, statuses: [] };
    const controller = new ProjectController({}, { data: {}, isDirty: () => false }, { updateStatus: status => done.statuses.push(status), ...uiManager });
    controller.currentProject = { path: '/project', name: 'Fixture', maps: [null, { id: 1, name: 'One' }, { id: 2, name: 'Two' }] };
    controller.projectLoaded = true;
    controller.tilemapManager = {
        currentMap: { id: 1 }, dirty: true,
        isMapDirty() { return this.dirty; },
        saveMap() { done.mapSaves++; this.dirty = false; return true; },
        destroy() { done.destroyed = true; }
    };
    controller.saveAll = async () => { done.projectSaves++; controller.tilemapManager.dirty = false; return true; };
    return { controller, done, ProjectController };
}

test('unsaved changes: Save saves and goes on, Discard Changes goes on unsaved, Cancel stops', async () => {
    for (const [decision, goesOn, saved] of [['save', true, 1], ['discard', true, 0], ['cancel', false, 0]]) {
        const asked = [];
        const ui = { promptUnsavedChanges: async subject => { asked.push(subject); return decision; } };
        let { controller, done } = dirtyController(dialog(), ui);
        assert.equal(await controller.confirmUnsavedChanges('map'), goesOn, `a map, ${decision}`);
        assert.deepEqual(asked, ['this map']);
        assert.equal(done.mapSaves, saved, `a map, ${decision}: saved ${saved} time(s)`);
        assert.equal(done.projectSaves, 0);

        ({ controller, done } = dirtyController(dialog(), ui));
        assert.equal(await controller.confirmUnsavedChanges(), goesOn, `the project, ${decision}`);
        assert.equal(done.projectSaves, saved);
        assert.equal(done.mapSaves, 0, 'the project is saved through saveAll');
    }
    // Nothing changed: nothing is asked.
    const asked = [];
    const { controller } = dirtyController(dialog(), { promptUnsavedChanges: async subject => { asked.push(subject); return 'cancel'; } });
    controller.tilemapManager.dirty = false;
    assert.equal(await controller.confirmUnsavedChanges('map'), true);
    assert.deepEqual(asked, []);
});

test('a map that cannot be saved stops the action and says so', async () => {
    const told = [];
    const { controller } = dirtyController(dialog(), {
        promptUnsavedChanges: async () => 'save', showAlert: async (title, message) => { told.push([title, message]); }
    });
    controller.tilemapManager.saveMap = () => false;
    assert.equal(await controller.confirmUnsavedChanges('map'), false);
    assert.deepEqual(told, [['Save', 'The map could not be saved. The current view will remain open.']]);

    // With no UIManager notice the same is said through RRDialog.
    const RRDialog = dialog();
    const bare = dirtyController(RRDialog, { promptUnsavedChanges: async () => 'save' }).controller;
    bare.tilemapManager.saveMap = () => false;
    assert.equal(await bare.confirmUnsavedChanges('map'), false);
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'The map could not be saved. The current view will remain open.', options: { title: 'Save', kind: 'error' } }]);
});

test('without the three-button prompt the same is asked through RRDialog, and discarding is asked by name', async () => {
    // Save.
    let RRDialog = dialog([true]);
    let { controller, done } = dirtyController(RRDialog, {});
    assert.equal(await controller.confirmUnsavedChanges('map'), true);
    assert.equal(done.mapSaves, 1);
    assert.equal(RRDialog.asked.length, 1);
    assert.equal(RRDialog.asked[0].message, 'There are unsaved changes in this map. Save them now?');
    assert.deepEqual(RRDialog.asked[0].options, { title: 'Unsaved Changes', ok: 'Save', cancel: 'Discard Changes' });

    // Not saving, then Discard Changes.
    RRDialog = dialog([false, true]);
    ({ controller, done } = dirtyController(RRDialog, {}));
    assert.equal(await controller.confirmUnsavedChanges('map'), true);
    assert.equal(done.mapSaves, 0);
    assert.equal(RRDialog.asked[1].message, 'Discard the unsaved changes in this map?');
    assert.deepEqual(RRDialog.asked[1].options, { title: 'Unsaved Changes', ok: 'Discard Changes', danger: true });

    // Not saving, then Cancel: the action stops and nothing is saved or lost.
    RRDialog = dialog([false, false]);
    ({ controller, done } = dirtyController(RRDialog, {}));
    assert.equal(await controller.confirmUnsavedChanges(), false);
    assert.equal(done.mapSaves + done.projectSaves, 0);
    assert.equal(controller.tilemapManager.dirty, true);

    // Nothing that can ask: the changes are kept and the action does not go on.
    const ProjectController = load('ProjectController.js', 'ProjectController');
    const silent = new ProjectController({}, { data: {}, isDirty: () => true }, {});
    silent.currentProject = { path: '/project', maps: [] };
    assert.equal(await silent.confirmUnsavedChanges(), false);
});

test('opening another map with unsaved changes loads it only on Save or Discard Changes', async () => {
    for (const [decision, loads, saved] of [['save', 1, 1], ['discard', 1, 0], ['cancel', 0, 0]]) {
        const { controller, done } = dirtyController(dialog(), { promptUnsavedChanges: async () => decision });
        const loaded = [];
        // The load itself is the tilemap's: here it only reports what it was asked for.
        controller.tilemapManager.loadMap = async mapId => { loaded.push(mapId); return false; };
        controller._mapLoadRequest = 0;
        await controller.loadMap(2);
        assert.equal(loaded.length, loads, `${decision}: map 2 asked for ${loads} time(s)`);
        assert.equal(done.mapSaves, saved, `${decision}: map 1 saved ${saved} time(s)`);
        if (!loads) assert.equal(controller.tilemapManager.dirty, true, 'Cancel keeps the changes on screen');
    }
});

test('closing the project and quitting ask first: Cancel leaves the project open and unsaved', async () => {
    // Close Project.
    for (const [decision, closes, saved] of [['save', true, 1], ['discard', true, 0], ['cancel', false, 0]]) {
        const { controller, done } = dirtyController(dialog(), { promptUnsavedChanges: async () => decision, showWelcomeScreen() {} }, { nw: undefined });
        const project = controller.currentProject;
        await controller.closeProject();
        assert.equal(controller.currentProject, closes ? null : project, `Close Project, ${decision}`);
        assert.equal(controller.projectLoaded, !closes);
        assert.equal(done.projectSaves, saved);
        assert.equal(!!done.destroyed, closes);
    }
    // Exit, and the window's own close button: both go through requestApplicationClose.
    for (const [decision, closes, saved] of [['save', true, 1], ['discard', true, 0], ['cancel', false, 0]]) {
        let forcedCloses = 0;
        const { controller, done } = dirtyController(dialog(), { promptUnsavedChanges: async () => decision },
            { nw: { Window: { get: () => ({ close: force => { if (force) forcedCloses++; } }) } } });
        assert.equal(await controller.requestApplicationClose(), closes, `Exit, ${decision}`);
        assert.equal(forcedCloses, closes ? 1 : 0);
        assert.equal(controller.allowApplicationClose, closes);
        assert.equal(done.projectSaves, saved);
        if (!closes) {
            await turn();
            assert.equal(controller.applicationCloseRequest, null, 'a cancelled Exit can be asked for again');
        }
    }
});

test('opening another project with unsaved changes: Cancel opens no folder chooser', async () => {
    for (const [decision, choosers] of [['cancel', 0], ['discard', 1]]) {
        const made = [];
        const document = { createElement: tag => { const element = { tag, clicks: 0, setAttribute() {}, addEventListener() {}, click() { this.clicks++; } }; made.push(element); return element; } };
        const { controller, done } = dirtyController(dialog(), { promptUnsavedChanges: async () => decision }, { nw: {}, document });
        await controller.openProject();
        assert.equal(made.length, choosers, `${decision}: ${choosers} chooser(s)`);
        if (choosers) assert.equal(made[0].clicks, 1);
        assert.equal(done.projectSaves + done.mapSaves, 0);
        assert.equal(controller.currentProject.name, 'Fixture', 'the open project stays until another is chosen');
    }
});

// ---------------------------------------------------------------------------
// Maps: Delete Map, Resize Map, the notices
// ---------------------------------------------------------------------------

function mapController(t, RRDialog) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-dialog-flows-'));
    fs.mkdirSync(path.join(dir, 'data'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const ProjectController = load('ProjectController.js', 'ProjectController', {
        RRDialog, nw: {}, localStorage: { getItem: () => null, setItem() {} }
    });
    const statuses = [];
    const saved = [];
    const controller = new ProjectController(
        { saveMapInfos: (project, maps) => { saved.push(plain(maps)); return true; } },
        { data: {}, saveJSON: async () => true },
        { updateStatus: status => statuses.push(status) }
    );
    controller.currentProject = { path: dir, name: 'Fixture', maps: [null, { id: 1, name: 'Town', parentId: 0, order: 1 }, { id: 2, name: 'Cave', parentId: 0, order: 2 }, { id: 3, name: 'Cellar', parentId: 1, order: 1 }] };
    for (const id of [1, 2, 3]) fs.writeFileSync(path.join(dir, `data/Map00${id}.json`), '{}');
    fs.writeFileSync(path.join(dir, 'data/Map001.r3d.json'), '{}');
    controller.tilemapManager = { currentMap: { id: 2 }, isMapDirty: () => false };
    controller.renderMapsList = controller.renderQuickAccessList = controller.bumpVersionId = () => {};
    const file = name => fs.existsSync(path.join(dir, 'data', name));
    return { controller, dir, statuses, saved, file };
}

test('Delete Map is a danger question that names the map; the map goes only on its button', async t => {
    // Cancel.
    let RRDialog = dialog([false]);
    let h = mapController(t, RRDialog);
    await h.controller.deleteMap(1);
    assert.equal(RRDialog.asked.length, 1);
    assert.match(RRDialog.asked[0].message, /^Delete "Town" and 1 child map\?\n\nThis removes their Map###\.json files and MapInfos entries\.$/);
    assert.deepEqual(RRDialog.asked[0].options, { title: 'mapCtx.deleteMap', ok: 'mapCtx.deleteMap', danger: true });
    assert.deepEqual([h.file('Map001.json'), h.file('Map001.r3d.json'), h.file('Map003.json')], [true, true, true], 'Cancel deletes nothing');
    assert.equal(h.controller.currentProject.maps[1].name, 'Town');
    assert.deepEqual(h.saved, [], 'and saves nothing');

    // Delete Map.
    RRDialog = dialog([true]);
    h = mapController(t, RRDialog);
    await h.controller.deleteMap(1);
    assert.deepEqual([h.file('Map001.json'), h.file('Map001.r3d.json'), h.file('Map003.json'), h.file('Map002.json')], [false, false, false, true]);
    assert.equal(h.controller.currentProject.maps[1], null);
    assert.equal(h.controller.currentProject.maps[3], null, 'its child map goes with it');
    assert.equal(h.saved.length, 1, 'the map list is saved once');
    assert.ok(h.statuses.some(status => status.startsWith('Deleted map')));

    // A single map with no children is named with its file.
    RRDialog = dialog([false]);
    h = mapController(t, RRDialog);
    await h.controller.deleteMap(2);
    assert.equal(RRDialog.asked[0].message, 'Delete "Cave"?\n\nThis removes its Map002.json file and MapInfos entry.');
});

test('a Delete Map answer that comes after another project was opened deletes nothing', async t => {
    let release;
    const RRDialog = { asked: [], confirm: () => new Promise(resolve => { release = resolve; }), alert: async () => {} };
    const h = mapController(t, RRDialog);
    const first = h.controller.currentProject;
    const next = { ...first, maps: plain(first.maps) };
    const pending = h.controller.deleteMap(1);
    h.controller.currentProject = next;
    release(true);
    await pending;
    assert.ok(next.maps[1]);
    assert.ok(first.maps[1]);
    assert.equal(h.file('Map001.json'), true);
    assert.deepEqual(h.saved, []);

    // The same project, but the map left the list while the question was up: there is nothing left to delete.
    const again = mapController(t, RRDialog);
    const asked = again.controller.deleteMap(2);
    again.controller.currentProject.maps[2] = { id: 2, name: 'Another map that took the number', parentId: 0, order: 2 };
    release(true);
    await asked;
    assert.equal(again.file('Map002.json'), true);
    assert.equal(again.controller.currentProject.maps[2].name, 'Another map that took the number');
    assert.deepEqual(again.saved, []);
});

test('the last map cannot be deleted: a notice, never a question', async t => {
    const RRDialog = dialog();
    const h = mapController(t, RRDialog);
    h.controller.currentProject.maps = [null, { id: 1, name: 'Town', parentId: 0, order: 1 }];
    await h.controller.deleteMap(1);
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'Cannot delete the last map in the project.', options: { title: 'mapCtx.deleteMap', kind: 'warning' } }]);
    assert.equal(h.file('Map001.json'), true);
});

/** A 3x3 map with a tile and an event in its last column and row, and a controller to resize it with. */
function resizeFixture(RRDialog, anchor = 'top-left') {
    const ProjectController = load('ProjectController.js', 'ProjectController', { RRDialog });
    const controller = Object.create(ProjectController.prototype);
    Object.assign(controller, {
        databaseManager: { data: {} }, currentProject: { path: '/project', maps: [] },
        getSelectedMapResizeAnchor: () => anchor, mapElevation: () => null,
        historyCleared: 0
    });
    controller.mapEditor = { clearUndoHistory() { controller.historyCleared++; } };
    const data = new Array(3 * 3 * 6).fill(0);
    data[2 * 3 + 2] = 2048;        // layer 0, x 2, y 2
    const source = { id: 1, width: 3, height: 3, data, events: [null, { id: 1, name: 'Chest', x: 2, y: 2, pages: [{ list: [] }] }] };
    return { controller, source, mapData: { ...source, data: data.slice(), events: source.events.slice() } };
}

test('Resize Map: a size that loses tiles or events is a danger question; the map is cut only on its button', async () => {
    let RRDialog = dialog([false]);
    let { controller, source, mapData } = resizeFixture(RRDialog);
    assert.equal(await controller.applyMapResize(mapData, source, 2, 2), false);
    assert.equal(RRDialog.asked.length, 1);
    assert.match(RRDialog.asked[0].message, /mapResize\.cropWarning[\s\S]*mapResize\.tilesRemoved[\s\S]*mapResize\.eventsDeleted[\s\S]*#1 Chest \(2, 2\)[\s\S]*mapResize\.cannotUndo$/);
    assert.deepEqual(RRDialog.asked[0].options, { title: 'Resize Map', ok: 'Resize Map', danger: true });
    assert.equal(mapData.data.length, 3 * 3 * 6, 'Cancel leaves the tiles');
    assert.equal(mapData.events.length, 2, 'and the events');
    assert.equal(controller.historyCleared, 0, 'and the undo history');

    RRDialog = dialog([true]);
    ({ controller, source, mapData } = resizeFixture(RRDialog));
    assert.equal(await controller.applyMapResize(mapData, source, 2, 2), true);
    assert.equal(mapData.data.length, 2 * 2 * 6);
    assert.equal(mapData.events.filter(Boolean).length, 0, 'the event outside the new size is gone');
    assert.equal(controller.historyCleared, 1);

    // Growing loses nothing and asks nothing.
    RRDialog = dialog();
    ({ controller, source, mapData } = resizeFixture(RRDialog));
    assert.equal(await controller.applyMapResize(mapData, source, 4, 4), true);
    assert.deepEqual(RRDialog.asked, []);
    assert.equal(mapData.data.length, 4 * 4 * 6);
});

test('Resize Map: commands elsewhere are updated only on Update Commands, and the map is resized either way', async () => {
    const run = async (answers, report) => {
        const RRDialog = dialog(answers);
        const { controller, source, mapData } = resizeFixture(RRDialog, 'bottom-right');
        const moved = [];
        let persisted = 0;
        const shift = controller.applyMapReferenceOffsets;
        controller.scanProjectForMapReferences = () => report;
        controller.applyMapReferenceOffsets = function (references, x, y) { moved.push(references); return shift.call(this, references, x, y); };
        controller.persistScannedMapReferences = () => { persisted++; return true; };
        const resized = await controller.applyMapResize(mapData, source, 4, 4);
        return { RRDialog, resized, mapData, updated: moved.includes(report.references), persisted };
    };
    // A Transfer Player on another map that arrives at (2, 2) of this one.
    const found = () => ({ references: [{ parameters: [0, 1, 2, 2, 0, 0], xIndex: 2, yIndex: 3 }], sources: [{ kind: 'map', name: 'Cave', count: 1 }], unreadable: [] });

    let report = found();
    let result = await run([true], report);
    assert.equal(result.RRDialog.asked.length, 1);
    assert.match(result.RRDialog.asked[0].message, /mapResize\.contentMovesBy[\s\S]*mapResize\.inboundFound[\s\S]*- Cave: 1[\s\S]*mapResize\.inboundUpdate$/);
    assert.deepEqual(result.RRDialog.asked[0].options, { title: 'Resize Map', ok: 'Update Commands', cancel: 'Leave Unchanged' },
        'both buttons say what becomes of the commands: neither cancels the resize');
    assert.deepEqual([result.resized, result.updated, result.persisted], [true, true, 1]);
    assert.deepEqual(report.references[0].parameters.slice(2, 4), [3, 3], 'the command follows the content, which moved by one tile each way');

    report = found();
    result = await run([false], report);
    assert.deepEqual([result.resized, result.updated, result.persisted], [true, false, 0]);
    assert.deepEqual(report.references[0].parameters.slice(2, 4), [2, 2], 'left as it was');
    assert.equal(result.mapData.data.length, 4 * 4 * 6, 'the map is resized without the update');

    // Nothing to update, but maps that could not be checked: a notice names them, nothing is asked.
    result = await run([], { references: [], sources: [], unreadable: ['Map009.json'] });
    assert.equal(result.RRDialog.asked.length, 1);
    assert.equal(result.RRDialog.asked[0].type, 'alert');
    assert.match(result.RRDialog.asked[0].message, /mapResize\.unreadableMaps[\s\S]*- Map009\.json$/);
    assert.deepEqual(result.RRDialog.asked[0].options, { title: 'Resize Map', kind: 'warning' });
    assert.deepEqual([result.resized, result.updated], [true, false]);
});

test('Map Properties: a size out of range is told, and the field takes the focus once the notice has been read', async () => {
    let read;
    const told = [];
    const RRDialog = { alert: (message, options) => { told.push([message, { ...options }]); return new Promise(resolve => { read = resolve; }); } };
    const width = { value: '0', focused: false, focus() { this.focused = true; } };
    const height = { value: '10', focused: false, focus() { this.focused = true; } };
    const ProjectController = load('ProjectController.js', 'ProjectController', {
        RRDialog,
        document: { getElementById(id) { if (id === 'map-width-input') return width; if (id === 'map-height-input') return height; throw new Error(`the save went on to ${id}`); } }
    });
    const controller = Object.create(ProjectController.prototype);
    const saving = controller.saveMapProperties();
    await turn();
    assert.deepEqual(told, [['Map dimensions must be whole numbers from 1 to 512 by 1 to 512.', { title: 'mapProps.title', kind: 'warning' }]]);
    assert.equal(width.focused, false, 'the notice keeps the focus while it is up');
    read();
    assert.equal(await saving, false, 'nothing is saved');
    assert.deepEqual([width.focused, height.focused], [true, false], 'the field that was wrong takes the focus');
});

test('map notices are themed and titled by what was asked for', async t => {
    // New Map at the map limit.
    let RRDialog = dialog();
    let h = mapController(t, RRDialog);
    h.controller.getNextAvailableMapId = () => 0;
    h.controller.createNewMap(null);
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'Map Max: 2000', options: { title: 'mapCtx.newMap', kind: 'warning' } }]);

    // Paste Map with no map copied.
    RRDialog = dialog();
    h = mapController(t, RRDialog);
    await h.controller.pasteMap();
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'No map in clipboard to paste.', options: { title: 'mapCtx.pasteMap' } }]);
    assert.equal(h.controller.currentProject.maps.filter(Boolean).length, 3, 'nothing is pasted');
    assert.equal(h.controller._pastingMap, null, 'and another paste can follow');

    // A project that another editor holds open.
    RRDialog = dialog();
    h = mapController(t, RRDialog);
    assert.equal(h.controller._rejectProjectLock('/elsewhere/Game', null, true), false);
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'This project is already open in another RPG Reactor instance.\n\n/elsewhere/Game', options: { title: 'menu.openProject', kind: 'warning' } }]);
});

// ---------------------------------------------------------------------------
// Database: Delete, Change Maximum, Clear Selected, Discard Changes
// ---------------------------------------------------------------------------

const databaseSource = read('DatabaseEditorUI.js');

/** The function written at `marker` in a source (the first `async` after it, to its closing brace), as text. */
function functionAfter(source, marker) {
    const code = codeOnly(source);
    const at = source.indexOf(marker);
    assert.ok(at >= 0, `the source still has: ${marker}`);
    const start = code.indexOf('async', at);
    const open = code.indexOf('{', code.indexOf('=>', start));
    let depth = 0, close = open;
    for (; close < code.length; close++) {
        if (code[close] === '{') depth++;
        else if (code[close] === '}' && --depth === 0) break;
    }
    return source.slice(start, close + 1);
}

/** A handler from a page's closure, run with that closure's names (`scope`) and the page object as `this`. */
function closureFunction(text, self, scope) {
    return new Function('scope', `with (scope) { return (${text}); }`).call(self, scope);
}

function databasePage(RRDialog) {
    const DatabaseEditorUI = load('DatabaseEditorUI.js', 'DatabaseEditorUI', { RRDialog, window: {} });
    const ui = Object.create(DatabaseEditorUI.prototype);
    const records = [null, { id: 1, name: 'Fleagus' }, { id: 2, name: 'Carol' }, { id: 3, name: 'Jolt' }, { id: 4, name: '' }];
    const done = { cleared: [], snapshots: 0, refreshed: 0, statuses: [], maximums: [] };
    Object.assign(ui, {
        databaseManager: {
            data: { actors: records },
            getMaxEntries: () => records.length - 1,
            changeMaximum(type, max) { done.maximums.push(max); records.length = max + 1; return true; }
        },
        clearDatabaseEntry: (type, id) => { done.cleared.push(id); },
        cleanupDatabaseDetail() {}, _selectEntryMarkup: () => '', updateStatus: status => done.statuses.push(status),
        getDefaultTemplates: () => ({ actors: { name: '' } }), getDatabaseMaximum: () => 9999,
        _detailGeneration: 1, currentProject: { path: '/project' }
    });
    const selectedIds = new Set([2, 3]);
    const listSession = { mutationGeneration: 0 };
    ui._activeDatabaseList = listSession;
    const scope = {
        RRDialog, type: 'actors', title: 'Actors', tt: text => text,
        selectedIds, listSession, focusedId: 2, selectionAnchorId: 2,
        getSelectedEntries: () => records.filter(record => record && selectedIds.has(record.id)),
        snapshotForUndo: () => { done.snapshots++; },
        refreshData: () => { done.refreshed++; }, refreshList() {},
        detailEl: { innerHTML: 'detail' }
    };
    return { ui, scope, done, records, selectedIds, listSession };
}

test('Database list: Delete asks by name in a danger question, and clears the records only on Delete', async () => {
    const handler = functionAfter(databaseSource, 'deleteBtn.onclick = ');

    // Cancel.
    let RRDialog = dialog([false]);
    let page = databasePage(RRDialog);
    await closureFunction(handler, page.ui, page.scope)();
    assert.equal(RRDialog.asked.length, 1);
    assert.equal(RRDialog.asked[0].message, 'db.deleteConfirm');
    assert.deepEqual(RRDialog.asked[0].options, { title: 'common.delete', ok: 'common.delete', danger: true });
    assert.deepEqual(page.done.cleared, [], 'Cancel clears nothing');
    assert.equal(page.done.snapshots, 0, 'and leaves the undo history alone');
    assert.equal(page.scope.detailEl.innerHTML, 'detail');

    // Delete.
    RRDialog = dialog([true]);
    page = databasePage(RRDialog);
    await closureFunction(handler, page.ui, page.scope)();
    assert.deepEqual(page.done.cleared, [2, 3]);
    assert.equal(page.done.snapshots, 1, 'one undo step holds the records');
    assert.equal(page.listSession.mutationGeneration, 1);
    assert.equal(page.selectedIds.size, 0);
    assert.deepEqual(page.done.statuses, ['db.entryCleared']);

    // Nothing selected: a notice, no question.
    RRDialog = dialog();
    page = databasePage(RRDialog);
    page.selectedIds.clear();
    await closureFunction(handler, page.ui, page.scope)();
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'db.selectEntryToDelete', options: { title: 'common.delete', kind: 'warning' } }]);
    assert.deepEqual(page.done.cleared, []);
});

test('Database list: a Delete answer for a list that was left, changed or reselected clears nothing', async () => {
    const handler = functionAfter(databaseSource, 'deleteBtn.onclick = ');
    for (const [what, change] of [
        ['another section was opened', page => { page.ui._activeDatabaseList = { mutationGeneration: 0 }; }],
        ['the list changed', page => { page.listSession.mutationGeneration++; }],
        ['the selection moved', page => { page.selectedIds.delete(3); page.selectedIds.add(1); }]
    ]) {
        let release;
        const RRDialog = { confirm: () => new Promise(resolve => { release = resolve; }), alert: async () => {} };
        const page = databasePage(RRDialog);
        const pending = closureFunction(handler, page.ui, page.scope)();
        change(page);
        release(true);
        await pending;
        assert.deepEqual(page.done.cleared, [], what);
        assert.equal(page.done.snapshots, 0, what);
    }
});

test('Change Maximum asks in a prompt that takes only a whole number up to the section\'s cap', async () => {
    const ask = async (answers, change = () => {}) => {
        const RRDialog = dialog(answers);
        const { ui } = databasePage(RRDialog);
        const given = [];
        const pending = ui.showChangeMaximumModal('Actors', 'actors', 4, max => { given.push(max); });
        change(ui);
        await pending;
        return { RRDialog, given };
    };

    // Accepted.
    let { RRDialog, given } = await ask(['12']);
    assert.equal(RRDialog.asked[0].type, 'prompt');
    assert.equal(RRDialog.asked[0].message, 'Actors (Max: 9999)');
    assert.equal(RRDialog.asked[0].options.title, 'db.changeMaximum', 'the words of the button that asks');
    assert.equal(RRDialog.asked[0].options.ok, 'db.changeMaximum');
    assert.equal(RRDialog.asked[0].options.value, '4', 'the field starts on the current maximum');
    assert.deepEqual(given, [12]);
    assert.equal(typeof given[0], 'number');

    // Refused: the prompt says why and stays open (validate returns the words to show).
    const validate = RRDialog.asked[0].options.validate;
    for (const bad of ['', '   ', 'abc', '0', '-3', '2.5', '1e3', '10000', '12 actors']) {
        assert.equal(validate(bad), 'Enter a whole number from 1 to 9999.', `"${bad}" is refused`);
    }
    for (const good of ['1', ' 12 ', '9999']) assert.equal(validate(good), '', `"${good}" is taken`);

    // Cancelled: nothing changes.
    ({ given } = await ask([null]));
    assert.deepEqual(given, []);

    // The page was left while the prompt was up.
    ({ given } = await ask(['12'], ui => { ui._detailGeneration++; }));
    assert.deepEqual(given, []);
});

test('a section already past its cap may keep its size but not grow', async () => {
    const RRDialog = dialog(['20']);
    const { ui } = databasePage(RRDialog);
    ui.getDatabaseMaximum = () => 10;
    const given = [];
    await ui.showChangeMaximumModal('Actors', 'actors', 20, max => { given.push(max); });
    assert.equal(RRDialog.asked[0].message, 'Actors (Max: 20)');
    assert.equal(RRDialog.asked[0].options.validate('21'), 'Enter a whole number from 1 to 20.');
    assert.deepEqual(given, [20]);
});

test('Database list: a smaller maximum is a second, danger question that says which entries go', async () => {
    const apply = functionAfter(databaseSource, 'this.showChangeMaximumModal(title, type, this.databaseManager.getMaxEntries(type), ');

    // Reduce Maximum.
    let RRDialog = dialog([true]);
    let page = databasePage(RRDialog);
    await closureFunction(apply, page.ui, page.scope)(2);
    assert.equal(RRDialog.asked.length, 1);
    assert.equal(RRDialog.asked[0].message, 'Entries 3 to 4 will be removed. Anything that still uses them may stop working.');
    assert.deepEqual(RRDialog.asked[0].options, { title: 'db.changeMaximum', ok: 'Reduce Maximum', danger: true });
    assert.deepEqual(page.done.maximums, [2]);
    assert.equal(page.done.snapshots, 1, 'one undo step holds the removed records');

    // Cancel.
    RRDialog = dialog([false]);
    page = databasePage(RRDialog);
    await closureFunction(apply, page.ui, page.scope)(3);
    assert.equal(RRDialog.asked[0].message, 'Entry 4 will be removed. Anything that still uses it may stop working.');
    assert.deepEqual(page.done.maximums, [], 'Cancel changes nothing');
    assert.equal(page.done.snapshots, 0);

    // A larger maximum removes nothing and asks nothing more.
    RRDialog = dialog();
    page = databasePage(RRDialog);
    await closureFunction(apply, page.ui, page.scope)(10);
    assert.deepEqual(RRDialog.asked, []);
    assert.deepEqual(page.done.maximums, [10]);

    // The same maximum is no change.
    page = databasePage(dialog());
    await closureFunction(apply, page.ui, page.scope)(4);
    assert.deepEqual(page.done.maximums, []);

    // The answer comes after the list changed.
    let release;
    page = databasePage({ confirm: () => new Promise(resolve => { release = resolve; }), alert: async () => {} });
    const pending = closureFunction(apply, page.ui, page.scope)(2);
    page.listSession.mutationGeneration++;
    release(true);
    await pending;
    assert.deepEqual(page.done.maximums, []);

    // The database refuses (records past the new maximum are in use): a notice, nothing else changes.
    RRDialog = dialog([true]);
    page = databasePage(RRDialog);
    page.ui.databaseManager.changeMaximum = () => false;
    await closureFunction(apply, page.ui, page.scope)(2);
    assert.deepEqual(RRDialog.asked.at(-1), { type: 'alert', message: 'The maximum was not changed: records past it are still in use.', options: { title: 'db.changeMaximum', kind: 'warning' } });
    assert.equal(page.done.refreshed, 0);
});

/** The Types page's closure around one list of four names, the second and third selected. */
function typesPage(RRDialog) {
    const DatabaseEditorUI = load('DatabaseEditorUI.js', 'DatabaseEditorUI', { RRDialog, window: {} });
    const ui = Object.create(DatabaseEditorUI.prototype);
    const system = { elements: ['', 'Physical', 'Fire', 'Ice', 'Thunder'] };
    const done = { rendered: 0, statuses: [] };
    ui.updateStatus = status => done.statuses.push(status);
    ui.getDatabaseMaximum = () => 512;
    const workspace = { name: 'workspace' };
    const panel = { name: 'elements panel' };
    const selections = new Map([['elements', new Set([2, 3])]]);
    const scope = {
        RRDialog, tt: text => text, system, activeCategory: 'elements', mutationGeneration: 0,
        selections, anchors: new Map([['elements', 2]]),
        sortedSelection: category => [...(selections.get(category) || [])].sort((a, b) => a - b),
        detailEl: { current: workspace, querySelector() { return this.current; }, contains(element) { return !!element && element === this.current; } },
        categoryByKey: new Map([['elements', { key: 'elements', title: 'Elements' }]]),
        renderPanel: () => { done.rendered++; },
        // The change-maximum handler of one panel.
        category: { key: 'elements', title: 'Elements' }, data: system.elements, currentMax: 4, panel, panelFor: () => scope.currentPanel,
        currentPanel: panel
    };
    return { ui, scope, system, done, selections, workspace };
}

test('Types: Clear Selected is a danger question, and the names are cleared only on Clear', async () => {
    const clearSelected = functionAfter(databaseSource, 'const clearSelected = ');

    let RRDialog = dialog([false]);
    let page = typesPage(RRDialog);
    await closureFunction(clearSelected, page.ui, page.scope)();
    assert.equal(RRDialog.asked[0].message, 'Clear 2 selected type names? Numeric IDs will remain in place.');
    assert.deepEqual(RRDialog.asked[0].options, { title: 'Clear Selected', ok: 'Clear', danger: true });
    assert.deepEqual(page.system.elements, ['', 'Physical', 'Fire', 'Ice', 'Thunder'], 'Cancel clears nothing');
    assert.equal(page.scope.mutationGeneration, 0);

    RRDialog = dialog([true]);
    page = typesPage(RRDialog);
    await closureFunction(clearSelected, page.ui, page.scope)();
    assert.deepEqual(page.system.elements, ['', 'Physical', '', '', 'Thunder'], 'the names go, the IDs stay');
    assert.equal(page.scope.mutationGeneration, 1);
    assert.equal(page.done.rendered, 1);

    // Nothing selected: nothing is asked.
    RRDialog = dialog();
    page = typesPage(RRDialog);
    page.selections.get('elements').clear();
    await closureFunction(clearSelected, page.ui, page.scope)();
    assert.deepEqual(RRDialog.asked, []);

    // The answer comes after the page was left, the lists changed, or the selection moved.
    for (const [what, change] of [
        ['the page was left', page => { page.scope.detailEl.current = { name: 'another page' }; }],
        ['a name was edited', page => { page.scope.mutationGeneration++; }],
        ['the selection moved', page => { page.selections.set('elements', new Set([1, 2])); }]
    ]) {
        let release;
        const late = typesPage({ confirm: () => new Promise(resolve => { release = resolve; }), alert: async () => {} });
        const pending = closureFunction(clearSelected, late.ui, late.scope)();
        change(late);
        release(true);
        await pending;
        assert.deepEqual(late.system.elements.slice(2, 4), ['Fire', 'Ice'], what);
    }
});

test('Types: a smaller maximum is a danger question, and the type IDs go only on Reduce Maximum', async () => {
    const apply = functionAfter(databaseSource, 'this.showChangeMaximumModal(category.title, category.key, currentMax, ');

    let RRDialog = dialog([false]);
    let page = typesPage(RRDialog);
    await closureFunction(apply, page.ui, page.scope)(2);
    assert.equal(RRDialog.asked[0].message, 'Entries 3 to 4 will be removed. Anything that still uses them may stop working.');
    assert.deepEqual(RRDialog.asked[0].options, { title: 'db.changeMaximum', ok: 'Reduce Maximum', danger: true });
    assert.equal(page.system.elements.length, 5, 'Cancel removes nothing');

    RRDialog = dialog([true]);
    page = typesPage(RRDialog);
    await closureFunction(apply, page.ui, page.scope)(2);
    assert.deepEqual(page.system.elements, ['', 'Physical', 'Fire']);
    assert.deepEqual([...page.selections.get('elements')], [2], 'the selection keeps what is left of it');

    // Growing asks nothing.
    RRDialog = dialog();
    page = typesPage(RRDialog);
    await closureFunction(apply, page.ui, page.scope)(6);
    assert.deepEqual(RRDialog.asked, []);
    assert.equal(page.system.elements.length, 7);

    // The answer comes after the page was rebuilt.
    let release;
    page = typesPage({ confirm: () => new Promise(resolve => { release = resolve; }), alert: async () => {} });
    const pending = closureFunction(apply, page.ui, page.scope)(2);
    page.scope.currentPanel = { name: 'a new panel' };
    release(true);
    await pending;
    assert.equal(page.system.elements.length, 5);
});

test('the Database closes over unsaved changes only on Discard, asked as a danger question that starts on Cancel', async () => {
    const make = (callbacks, RRDialog, windowObject = {}) => {
        const DatabaseEditorUI = load('DatabaseEditorUI.js', 'DatabaseEditorUI', { RRDialog, window: windowObject });
        const ui = Object.create(DatabaseEditorUI.prototype);
        Object.assign(ui, { callbacks, databaseManager: { data: { actors: [null, { id: 1, name: 'Edited' }] } }, _dataSnapshot: '{"actors":[null,{"id":1,"name":"Saved"}]}', _databaseSession: 1 });
        return ui;
    };
    // Through UIManager's question (which starts on Cancel): the fifth argument marks the action as destructive.
    for (const answer of [true, false]) {
        const asked = [];
        const ui = make({ showConfirm: async (...args) => { asked.push(args); return answer; } }, dialog());
        let closed = 0;
        await ui.requestCloseDatabase(() => { closed++; });
        assert.deepEqual(plain(asked), [['Discard Changes', 'Close the database and discard the unsaved changes?', 'Discard', 'Cancel', { danger: true }]]);
        assert.equal(closed, answer ? 1 : 0);
        assert.equal(ui._databaseCloseDialog, false, 'the question can be asked again');
    }
    // With no UIManager the same is asked through RRDialog.
    for (const answer of [true, false]) {
        const RRDialog = dialog([answer]);
        const ui = make({}, RRDialog);
        let closed = 0;
        await ui.requestCloseDatabase(() => { closed++; });
        assert.deepEqual(RRDialog.asked, [{ type: 'confirm', message: 'Close the database and discard the unsaved changes?', options: { title: 'Discard Changes', ok: 'Discard', danger: true } }]);
        assert.equal(closed, answer ? 1 : 0);
    }
    // Nothing changed: it closes at once.
    const ui = make({ showConfirm: async () => { throw new Error('nothing to ask'); } }, dialog());
    ui._dataSnapshot = JSON.stringify(ui.databaseManager.data);
    let closed = 0;
    await ui.requestCloseDatabase(() => { closed++; });
    assert.equal(closed, 1);
    // The database was opened again while the question was up: that one is not closed.
    let release;
    const late = make({ showConfirm: () => new Promise(resolve => { release = resolve; }) }, dialog());
    const pending = late.requestCloseDatabase(() => { closed++; });
    late._databaseSession = 2;
    release(true);
    await pending;
    assert.equal(closed, 1);
});

test('Database notices are themed: a section that cannot open, a paste with nothing to paste', async () => {
    let RRDialog = dialog();
    const DatabaseEditorUI = load('DatabaseEditorUI.js', 'DatabaseEditorUI', { RRDialog, window: {} });
    const ui = Object.create(DatabaseEditorUI.prototype);
    ui.currentProject = null;
    ui.openDatabase('actors');
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'alert.loadProjectFirst', options: { title: 'menu.database', kind: 'warning' } }]);

    // An action sequence something still uses is not cleared, and says who uses it.
    RRDialog = dialog();
    const Sequences = load('DatabaseEditorUI.js', 'DatabaseEditorUI', {
        RRDialog, window: {}, ReactorBattleData: { references: () => [{ kind: 'skill', id: 7 }, { kind: 'item', id: 2 }] }
    });
    const page = Object.create(Sequences.prototype);
    const sequences = [null, { id: 1, name: 'Slash' }];
    Object.assign(page, { databaseManager: { data: { actionSequences: sequences, battlePresentation: {} } }, createBlankDatabaseEntry: () => ({ id: 1 }) });
    assert.equal(page.clearDatabaseEntry('actionSequences', 1), null);
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'This sequence is assigned to skill #7, item #2. Change those assignments before deleting it.', options: { title: 'common.delete', kind: 'warning' } }]);
    assert.equal(sequences[1].name, 'Slash');
});

// ---------------------------------------------------------------------------
// The event tools, System 1, Playtest
// ---------------------------------------------------------------------------

function eventManager(RRDialog, globals = {}) {
    const EventManager = load('EventManager.js', 'EventManager', { RRDialog, nw: {}, localStorage: { getItem: () => null, setItem() {} }, ...globals });
    const manager = Object.create(EventManager.prototype);
    manager.currentMap = { id: 5, width: 10, height: 10, events: [null, { id: 1, name: 'Rhea Voss', x: 1, y: 1, pages: [{}] }] };
    Object.assign(manager, { undoStack: [], redoStack: [], maxUndoSteps: 50, notifyUndoStateChange() {}, renderEvents() {}, selected: [], selectEvent(event) { this.selected.push(event.name); }, centerOnEvent() {} });
    return manager;
}

test('Find Event tells when nothing matches, and selects what does without a word', () => {
    const RRDialog = dialog();
    const manager = eventManager(RRDialog);
    manager.performSearch('zzzz');
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'No events found matching "zzzz"', options: { title: 'Find Event' } }]);
    assert.deepEqual(manager.selected, []);
    manager.performSearch('rhea');
    assert.equal(RRDialog.asked.length, 1);
    assert.deepEqual(manager.selected, ['Rhea Voss']);
});

test('Paste Event with nothing copied, or onto a taken tile, tells and pastes nothing', async () => {
    const RRDialog = dialog();
    const manager = eventManager(RRDialog);
    await manager.pasteEvent(4, 4);
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'No event in clipboard to paste.', options: { title: 'eventCtx.pasteEvent', kind: 'warning' } }]);
    assert.equal(manager.currentMap.events.filter(Boolean).length, 1);

    manager.copyEvent(manager.currentMap.events[1]);
    await manager.pasteEvent(1, 1);
    assert.deepEqual(RRDialog.asked.at(-1), { type: 'alert', message: 'There is already an event at this position.', options: { title: 'eventCtx.pasteEvent', kind: 'warning' } });
    assert.equal(manager.currentMap.events.filter(Boolean).length, 1);
    assert.equal(manager.undoStack.length, 0, 'a refused paste leaves no undo step');
});

test('Set Starting Position saves the place and says where it is', async () => {
    const RRDialog = dialog();
    const manager = eventManager(RRDialog);
    const system = { startMapId: 1, startX: 0, startY: 0 };
    const saved = [];
    Object.assign(manager, {
        projectController: { getCurrentProject: () => ({ path: '/project' }) },
        databaseManager: { getSystem: () => system, saveJSON: async (project, file, data) => { saved.push([file, plain(data)]); return true; } },
        rendered: 0, renderStartingPositions() { this.rendered++; }
    });
    await manager.setStartingPosition(8, 6, 'player');
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'Player starting position set to (8, 6) on Map 5', options: { title: 'eventCtx.setStart' } }]);
    assert.deepEqual(saved, [['System.json', { startMapId: 5, startX: 8, startY: 6 }]]);
    assert.equal(manager.rendered, 1, 'the marker moves without waiting for the notice');

    // A save that fails is an error notice.
    manager.databaseManager.saveJSON = async () => { throw new Error('disk full'); };
    await manager.setStartingPosition(2, 2, 'boat');
    assert.deepEqual(RRDialog.asked.at(-1), { type: 'alert', message: 'Error saving starting position. Check console for details.', options: { title: 'eventCtx.setStart', kind: 'error' } });
});

test('System 1: a picker that has no project or no folder to read says so and opens nothing', t => {
    const RRDialog = dialog();
    const Editor = load('database/DatabaseSystem1Editor.js', 'DatabaseSystem1Editor', { RRDialog, window: {}, document: {}, requestAnimationFrame() {} });
    const editor = Object.create(Editor.prototype);
    let pickers = 0;
    editor.showAudioPickerModal = () => { pickers++; };
    editor.projectManager = { getCurrentProject: () => null };
    editor.showMusicPicker({}, 'title');
    editor.showSoundPicker({}, 0);
    editor.showTitleImagePicker({}, 1);
    assert.deepEqual(RRDialog.asked.map(entry => [entry.message, entry.options]), new Array(3).fill(['No project loaded', { title: 'System 1', kind: 'warning' }]));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-dialog-system1-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    editor.projectManager = { getCurrentProject: () => ({ path: dir }) };
    editor.showMusicPicker({}, 'victory');
    editor.showSoundPicker({}, 0);
    assert.deepEqual(RRDialog.asked.slice(3).map(entry => [entry.message, entry.options]),
        [['ME folder not found', { title: 'System 1', kind: 'warning' }], ['SE folder not found', { title: 'System 1', kind: 'warning' }]]);
    assert.equal(pickers, 0);
});

test('a playtest that cannot start says why in a themed error', t => {
    const PlaytestManager = require(path.join(srcRoot, 'PlaytestManager.js'));
    const RRDialog = dialog();
    globalThis.RRDialog = RRDialog;
    t.after(() => { delete globalThis.RRDialog; });
    const manager = new PlaytestManager();
    manager.projectManager = { ensureProjectPackageMetadata: () => ({ ok: false, error: 'package.json is not writable' }) };
    assert.equal(manager.launchPlaytestWindow('/project', 'test'), false);
    assert.deepEqual(RRDialog.asked, [{ type: 'alert', message: 'Cannot start playtest.\n\npackage.json is not writable', options: { title: 'Playtest', kind: 'error' } }]);
    assert.equal(manager.lastLaunchError, 'package.json is not writable');
});

// ---------------------------------------------------------------------------
// Every dialog of these files, read from the source
// ---------------------------------------------------------------------------

const SECOND_STAGE = ['ProjectController.js', 'DatabaseEditorUI.js', 'EventManager.js', 'database/DatabaseSystem1Editor.js', 'PlaytestManager.js', 'UIManager.js'];

test('every question names itself and its action; every notice and prompt has a title', () => {
    const problems = [];
    const counts = { confirm: 0, alert: 0, prompt: 0 };
    for (const file of SECOND_STAGE) {
        const source = read(file);
        for (const call of dialogCalls(source, 'confirm')) {
            counts.confirm++;
            if (!/\btitle:/.test(call.text)) problems.push(`${file}:${call.line}: a question with no title`);
            if (!/\bok:/.test(call.text)) problems.push(`${file}:${call.line}: a question whose button is a bare OK`);
        }
        for (const name of ['alert', 'prompt']) {
            for (const call of dialogCalls(source, name)) {
                counts[name]++;
                if (!/\btitle:/.test(call.text)) problems.push(`${file}:${call.line}: ${name} with no title`);
            }
        }
    }
    assert.deepEqual(problems, []);
    assert.ok(counts.confirm >= 10 && counts.alert >= 75 && counts.prompt >= 1, `the dialogs were found (${JSON.stringify(counts)})`);
});

test('a question that deletes, clears, discards or cuts is a danger question', () => {
    const danger = (file, phrase) => {
        const call = dialogCalls(read(file), 'confirm').find(entry => entry.text.includes(phrase));
        assert.ok(call, `${file}: the question with "${phrase}"`);
        assert.match(call.text, /danger: true/, `${file}: "${phrase}" is a danger question`);
    };
    danger('ProjectController.js', 'message + roomMessage');
    danger('ProjectController.js', 'describeMapResizeLoss');
    danger('ProjectController.js', 'Discard the unsaved changes in');
    danger('DatabaseEditorUI.js', 'db.deleteConfirm');
    danger('DatabaseEditorUI.js', 'Clear {count} selected type names');
    danger('DatabaseEditorUI.js', 'Close the database and discard the unsaved changes?');
    danger('UIManager.js', 'Any unsaved changes will be lost.');
    const reduce = dialogCalls(read('DatabaseEditorUI.js'), 'confirm').filter(entry => entry.text.includes('describeRemovedEntries'));
    assert.equal(reduce.length, 2, 'the record lists and the type lists both ask before a smaller maximum');
    for (const call of reduce) assert.match(call.text, /danger: true/);
    // The two that go through UIManager's question, which starts on Cancel.
    assert.match(read('DatabaseEditorUI.js'), /this\._tt\('Discard'\), this\._tt\('Cancel'\), \{ danger: true \}\)/);
    assert.match(read('database/ModelVariantsPanel.js'), /this\._t\('Replace'\), this\._t\('Cancel'\), \{ danger: true \}\)/);
});

test('the new titles, buttons and sentences are translated in every language, with their placeholders', () => {
    const sandbox = {
        window: { dispatchEvent() {} },
        document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } },
        localStorage: { getItem() { return null; }, setItem() {} }, CustomEvent: class {}
    };
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    const tables = vm.runInNewContext(['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js'].map(read).join('\n')
        + '\n({ text: RR_TEXT_TRANSLATIONS, keyed: RR_I18N_STRINGS });', sandbox);
    const locales = ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr'];
    const phrases = [
        'Resize Map', 'Update Commands', 'Leave Unchanged', 'Reduce Maximum',
        'Enter a whole number from 1 to {max}.',
        'Entry {from} will be removed. Anything that still uses it may stop working.',
        'Entries {from} to {to} will be removed. Anything that still uses them may stop working.'
    ];
    const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join(' ');
    const problems = [];
    for (const locale of locales) {
        for (const phrase of phrases) {
            const translated = tables.text[locale]?.[phrase];
            if (!translated || translated === phrase) problems.push(`${locale}: "${phrase}" is not translated`);
            else if (placeholders(translated) !== placeholders(phrase)) problems.push(`${locale}: "${phrase}" lost a placeholder: ${translated}`);
        }
        // The titles taken from menu items and buttons are the editor's keyed strings.
        for (const key of ['menu.openProject', 'menu.newProject', 'menu.database', 'mapProps.title', 'mapCtx.newMap', 'mapCtx.copyMap', 'mapCtx.pasteMap', 'mapCtx.deleteMap', 'mapCtx.saveImage',
            'eventCtx.pasteEvent', 'eventCtx.setStart', 'quickEvent.title', 'db.changeMaximum', 'common.delete', 'common.cut', 'common.paste']) {
            if (!tables.keyed[locale]?.[key]) problems.push(`${locale}: no ${key}`);
        }
        // Words these dialogs reuse.
        for (const phrase of ['Unsaved Changes', 'Discard Changes', 'Discard', 'Save', 'Clear', 'Clear Selected', 'Reload', 'Reload Application?', 'Find Event', 'System 1', 'Playtest', 'Import Project']) {
            if (!tables.text[locale]?.[phrase]) problems.push(`${locale}: "${phrase}" is not translated`);
        }
    }
    assert.deepEqual(problems, []);
    // "Close anyway?" asks about closing the window: it once read "Near?" where the word for close was taken as nearby.
    const close = 'A build is in progress. Close anyway?';
    assert.equal(tables.text.pl[close], 'Trwa build. Zamknąć mimo to?');
    for (const [locale, wrong] of [['pl', /Blisko/], ['ru', /близко/], ['de', /Nah dran/], ['ar', /قريب/], ['tr', /yakın/]]) {
        assert.doesNotMatch(tables.text[locale][close], wrong, `${locale}: ${tables.text[locale][close]}`);
    }
    // The Types page words its Change Maximum button as a phrase; the dialog it opens is titled by the keyed string
    // of the record lists' button. Both are the same words (a reviewed translation may word it its own way).
    const reviewed = vm.runInNewContext(`${read('I18nReviewedTranslations.js')}\nglobalThis.RR_REVIEWED_TRANSLATIONS;`, { globalThis: {} });
    for (const locale of locales) {
        if (reviewed?.text?.[locale]?.['Change Maximum']) continue;
        assert.equal(tables.text[locale]['Change Maximum'], tables.keyed[locale]['db.changeMaximum'], `${locale}: Change Maximum`);
    }
    // The Reload question asks about loading the application again, not about recharging something.
    for (const [locale, wrong] of [['ja', /^リロードアプリケーション/], ['ru', /перезарядки/], ['ko', /재장전/], ['pl', /Aplikacja do wczytania/], ['tr', /Uygulaması\?/], ['zh-Hant', /裝填/]]) {
        assert.doesNotMatch(tables.text[locale]['Reload Application?'], wrong, `${locale}: ${tables.text[locale]['Reload Application?']}`);
    }
    for (const locale of ['zh-Hant', 'pt', 'ko']) assert.match(tables.text[locale]['Reload RPG Reactor and simulate a browser restart?'], /RPG Reactor/, `${locale}: the editor keeps its name`);
});
