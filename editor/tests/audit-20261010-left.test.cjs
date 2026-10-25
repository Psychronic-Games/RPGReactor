// Defects the 2026-10-10 audit found and left, each pinned before its fix.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const quiet = { log() {}, debug() {}, warn() {}, error() {}, info() {} };
const elevation = require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));

const flatMap = (id, events) => ({ id, width: 6, height: 6, note: '', data: new Array(6 * 6 * 6).fill(0), events });
const page = name => ({ conditions: {}, image: { characterName: name, direction: 2 }, list: [{ code: 0, indent: 0, parameters: [] }] });
const nothingOnScreen = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };

/** The runtime's sidecar writers for event models and heights, as the editor finds them once the 3D module is in. */
function runtimeEventWriters() {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'), 'utf8');
    const slice = (from, to) => {
        const start = source.indexOf(from), end = source.indexOf(to, start);
        assert.ok(start >= 0 && end > start, `runtime slice ${from}`);
        return source.slice(start, end);
    };
    const context = { Reactor3D: { MODE_3D: '3d' }, Math, Number, Object, String };
    vm.runInNewContext(slice('Reactor3D.setEventModelSpec = function', 'Reactor3D.hasEventModels = function')
        + slice('Reactor3D.eventZAt = function', '/**\n * An event\'s footprint'), context);
    return context.Reactor3D;
}

function eventEditorIn(context) {
    return vm.runInNewContext(`${read('src/event/EventEditor.js')}\nEventEditor;`, { console: quiet, document: nothingOnScreen, RRMapElevation: elevation, ...context });
}

function editorOn(EventEditor, map, event, models) {
    const editor = Object.create(EventEditor.prototype);
    editor.projectController = { getTilemapManager: () => ({ currentMap: map }) };
    editor.sourceEvent = event;
    editor.cancelBaseline = JSON.parse(JSON.stringify(event));
    editor.currentEvent = JSON.parse(JSON.stringify(event));
    editor.currentPageIndex = 0;
    editor.needsInitialCommit = false;
    editor.pendingModels = models; editor.pendingModelsBaseline = JSON.parse(JSON.stringify(models));
    editor.pendingZ = 0; editor.pendingZBaseline = 0;
    editor.pendingSize = [1, 1]; editor.pendingAuto = false; editor.pendingSizeBaseline = editor._sizeState();
    return editor;
}

//-----------------------------------------------------------------------------
// Event pages

test('Copy Page and Paste Page carry the page\'s 3D model', async () => {
    // The pasted page took a blank model slot: the copy stood as its 2D graphic and the model was gone.
    const crate = { name: 'Crate', file: '', ext: '.glb', size: 2, scale: 1, yaw: 90, pitch: 0, roll: 0, faces: {}, texture: 'crate-red.png' };
    const clipboard = [];
    const shared = { write: async (type, payload) => { clipboard.push({ type, payload: JSON.parse(JSON.stringify(payload)) }); return true; },
        read: async type => clipboard.filter(entry => entry.type === type).pop() || null };
    for (const [label, context] of [['the shared clipboard', { ReactorClipboard: shared }], ['the editor\'s own', {}]]) {
        const EventEditor = eventEditorIn(context);
        const event = { id: 3, name: 'Box', note: '', x: 1, y: 1, pages: [page('Box'), page('Lid')] };
        const map = flatMap(1, [null, null, null, event]);
        map.reactor3d = { version: 1, mode: '3d', events: { 3: { 0: { ...crate } } } };
        const editor = editorOn(EventEditor, map, event, [JSON.parse(JSON.stringify(crate)), null]);

        editor.copyCurrentPage();
        editor.currentPageIndex = 1;
        await editor.pasteEventPage();
        // Paste overwrites the page in view.
        assert.equal(editor.currentEvent.pages.length, 2, label);
        assert.equal(editor.currentPageIndex, 1);
        assert.equal(editor.currentEvent.pages[1].image.characterName, 'Box');
        assert.deepEqual(JSON.parse(JSON.stringify(editor.pendingModels[1])), crate, `${label}: the pasted page stands as the model`);
        assert.notEqual(editor.pendingModels[1], editor.pendingModels[0], 'a copy of its own');

        assert.equal(editor._commitChanges(), true);
        assert.equal(map.reactor3d.events['3']['1'].name, 'Crate', `${label}: OK writes it`);
        assert.equal(map.reactor3d.events['3']['1'].texture, 'crate-red.png');
    }

    // A page with no model pastes as one with none.
    const EventEditor = eventEditorIn({});
    const event = { id: 4, name: 'Sign', note: '', x: 2, y: 2, pages: [page('Sign'), page('Post')] };
    const editor = editorOn(EventEditor, flatMap(1, [null, null, null, null, event]), event, [null, { name: 'Post' }]);
    editor.copyCurrentPage();
    editor.currentPageIndex = 1;
    await editor.pasteEventPage();
    assert.equal(editor.pendingModels[1], null);
    assert.equal(editor.currentEvent.pages.length, 2);
});

test('an event edited on a 2D map leaves the map with no 3D sidecar, and Undo leaves it unchanged', () => {
    // Writing the event's models cleared a model the map never had, and made the sidecar to clear it in:
    // the map carried an empty one from then on, so it read as changed after Undo.
    for (const [label, context] of [['with the 3D module', { Reactor3D: runtimeEventWriters() }], ['before the 3D module is read', {}]]) {
        const EventEditor = eventEditorIn(context);
        const EventManager = vm.runInNewContext(`${read('src/EventManager.js')}\nEventManager;`, { console: quiet, RRMapElevation: elevation, ...context });
        const event = { id: 1, name: 'Guard', note: '', x: 2, y: 2, pages: [page('Guard'), page('Guard')] };
        const map = flatMap(1, [null, event]);
        const before = JSON.stringify(map);
        const manager = Object.create(EventManager.prototype);
        Object.assign(manager, { currentMap: map, undoStack: [], redoStack: [], maxUndoSteps: 50, selectedEvent: null,
            notifyUndoStateChange() {}, renderEvents() {} });

        const editor = editorOn(EventEditor, map, event, [null, null]);
        editor.onCommit = (source, committed) => { manager.saveState(); manager._replaceEventData(source, committed); return true; };
        editor.currentEvent.name = 'Captain';
        assert.equal(editor._commitChanges(), true);
        assert.equal(map.events[1].name, 'Captain');
        assert.equal('reactor3d' in map, false, `${label}: no sidecar is made`);

        manager.undo();
        assert.equal(map.events[1].name, 'Guard');
        assert.equal(JSON.stringify(map), before, `${label}: the map is as it was`);
    }

    // A map that has a sidecar still loses the last model taken off an event.
    const EventEditor = eventEditorIn({ Reactor3D: runtimeEventWriters() });
    const event = { id: 1, name: 'Guard', note: '', x: 2, y: 2, pages: [page('Guard')] };
    const map = flatMap(1, [null, event]);
    map.reactor3d = { version: 1, mode: '3d', events: { 1: { 0: { name: 'Knight', file: '', ext: '.glb', size: 2, scale: 1, yaw: 0, pitch: 0, roll: 0 } } } };
    const editor = editorOn(EventEditor, map, event, [{ name: 'Knight' }]);
    editor.pendingModels[0] = null;
    assert.equal(editor._commitChanges(), true);
    assert.equal(map.reactor3d.events, undefined);
});

//-----------------------------------------------------------------------------
// Projects

test('a malformed project lock left for a while does not stop the project opening', () => {
    // A lock that did not read as one (a crash mid-write, a damaged copy) refused the project for good:
    // the editor had no way to tell whose it was, and nothing removed it.
    const ProjectController = vm.runInNewContext(`${read('src/ProjectController.js')}\nProjectController;`, {
        console: quiet, RRJson: require('../src/utils/JsonFiles.js'), require, process, nw: {}
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-lock-malformed-'));
    const lockPath = path.join(root, '.rpgreactor.lock');
    const aged = () => { const then = new Date(Date.now() - 60000); fs.utimesSync(lockPath, then, then); };
    try {
        for (const text of ['{ malformed', '', 'null', JSON.stringify({ app: 'RPG Reactor', pid: 'x', token: 'short' })]) {
            fs.writeFileSync(lockPath, text, { mode: 0o600 });
            aged();
            const controller = new ProjectController({}, { data: {} }, { updateStatus() {} });
            assert.equal(controller.acquireProjectLock(root), true, `${JSON.stringify(text)} is stale`);
            const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
            assert.equal(lock.token, controller.projectLockToken, 'the project is this editor\'s now');
            controller.releaseProjectLock();
            assert.equal(fs.existsSync(lockPath), false);
        }

        // One written a moment ago may be another editor's, still being written: it stands.
        fs.writeFileSync(lockPath, '', { mode: 0o600 });
        const controller = new ProjectController({}, { data: {} }, { updateStatus() {} });
        assert.equal(controller.acquireProjectLock(root), false);
        assert.equal(fs.readFileSync(lockPath, 'utf8'), '');
        fs.rmSync(lockPath);

        // Something other than a file in its place is not removed.
        fs.mkdirSync(lockPath);
        assert.equal(controller.acquireProjectLock(root), false);
        assert.equal(fs.statSync(lockPath).isDirectory(), true);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

//-----------------------------------------------------------------------------
// Database > Tilesets

test('the Tilesets list row takes a new name as it is typed', () => {
    // The other lists follow the Name field; the tileset's name field only wrote the record, and its row
    // kept the old name until Save.
    const listeners = {};
    const nameInput = { addEventListener: (type, handler) => { listeners[type] = handler; } };
    const nameSpan = { textContent: 'Field' };
    const row = { dataset: { entryId: '2', entryName: 'Field' }, querySelector: selector => selector === '.database-list-name' ? nameSpan : null };
    const list = { querySelectorAll: selector => selector === '.database-list-item' ? [row] : [] };
    const document = { getElementById: id => ({ 'compact-tileset-name-input': nameInput, 'database-list': list })[id] || null, querySelector: () => null, querySelectorAll: () => [] };
    const context = { console: quiet, window: {}, document };
    const DatabaseEditorUI = vm.runInNewContext(`${read('src/DatabaseEditorUI.js')}\nDatabaseEditorUI;`, context);
    const DatabaseTilesetEditor = vm.runInNewContext(`${read('src/database/DatabaseTilesetEditor.js')}\nDatabaseTilesetEditor;`, context);

    const tileset = { id: 2, name: 'Field', flags: [] };
    const ui = Object.create(DatabaseEditorUI.prototype);
    Object.assign(ui, { callbacks: {}, databaseManager: { data: { tilesets: [null, null, tileset], editorNames: null } } });
    const editor = Object.create(DatabaseTilesetEditor.prototype);
    Object.assign(editor, { parentEditor: ui, currentTileset: tileset });
    editor.setupCompactEventListeners();

    listeners.input({ target: { value: 'Castle' } });
    assert.equal(tileset.name, 'Castle');
    assert.equal(nameSpan.textContent, 'Castle', 'the row shows it');
    assert.equal(row.dataset.entryName, 'Castle');

    // A tileset editor outside the Database has no list to follow.
    const standalone = Object.create(DatabaseTilesetEditor.prototype);
    Object.assign(standalone, { parentEditor: null, currentTileset: { id: 1, name: 'World' } });
    standalone.setupCompactEventListeners();
    listeners.input({ target: { value: 'Overworld' } });
    assert.equal(standalone.currentTileset.name, 'Overworld');
});
