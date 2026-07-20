const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadClass(relativePath, className, globals = {}) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', relativePath), 'utf8');
    return vm.runInNewContext(`${source}\n${className};`, {
        console: { log() {}, warn() {}, error() {} },
        process,
        require,
        ...globals
    });
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

test('EventEditor isolates edits, Apply refreshes the cancel baseline, and OK commits once', () => {
    const modal = { style: {} };
    const document = {
        createElement: () => ({ style: {}, appendChild() {} }),
        getElementById: id => id === 'event-editor-modal' ? modal : null
    };
    const EventEditor = loadClass('event/EventEditor.js', 'EventEditor', {
        document,
        window: { addEventListener() {} },
        EventCommandList: class {}
    });
    const editor = new EventEditor(null, null, null);
    editor.createHeader = () => ({ style: {} });
    editor.createLeftColumn = () => ({ style: {} });
    editor.createRightColumn = () => ({ style: {} });
    editor.renderCurrentPage = () => {};
    const container = { style: {}, appendChild() {}, innerHTML: '', className: '' };
    const source = { id: 1, name: 'Before', pages: [{ list: [{ code: 0, parameters: [] }] }] };
    let commits = 0;

    editor.showEventEditor(container, source, {
        onCommit(target, committed) {
            commits++;
            editor._replaceObject(target, committed);
            return true;
        }
    });
    editor.currentEvent.name = 'Applied';
    editor.currentEvent.pages[0].list[0].parameters.push('working only');
    assert.equal(source.name, 'Before');
    assert.deepEqual(source.pages[0].list[0].parameters, []);

    assert.equal(editor.applyChanges(), true);
    assert.equal(commits, 1);
    assert.equal(source.name, 'Applied');
    editor.currentEvent.name = 'Cancelled after apply';
    editor.cancelChanges();
    assert.equal(source.name, 'Applied', 'Cancel preserves the most recently applied baseline');
    assert.equal(editor.currentEvent.name, 'Applied');

    editor.showEventEditor(container, source, {
        onCommit(target, committed) {
            commits++;
            editor._replaceObject(target, committed);
            return true;
        }
    });
    editor.currentEvent.name = 'OK';
    editor.saveAndClose();
    assert.equal(source.name, 'OK');
    assert.equal(commits, 2);
    assert.equal(modal.style.display, 'none');
});

test('EventManager commits editor changes with one undo snapshot and keeps cancelled new events detached', () => {
    const modal = { style: {} };
    const content = { innerHTML: '' };
    const document = { getElementById: id => ({
        'event-editor-modal': modal,
        'event-editor-content': content
    })[id] || null };
    const EventManager = loadClass('EventManager.js', 'EventManager', { document });
    const manager = Object.create(EventManager.prototype);
    manager.currentMap = { width: 10, height: 10, events: [null] };
    manager.databaseManager = {};
    manager.projectController = {};
    manager.undoStack = [];
    manager.redoStack = [];
    manager.maxUndoSteps = 50;
    manager.notifyUndoStateChange = () => {};
    manager.renderEvents = () => {};
    manager.eventEditor = {
        showEventEditor(_content, event, options) {
            this.event = event;
            this.options = options;
        }
    };

    const existing = { id: 1, name: 'Before', pages: [] };
    manager.currentMap.events[1] = existing;
    manager.editEvent(existing);
    assert.equal(manager.eventEditor.options.onCommit(existing, { id: 1, name: 'After', pages: [] }), true);
    assert.equal(existing.name, 'After');
    assert.equal(manager.undoStack.length, 1);
    assert.equal(manager.eventEditor.options.onCommit(existing, { id: 1, name: 'After', pages: [] }), true);
    assert.equal(manager.undoStack.length, 1, 'a no-op Apply does not duplicate the snapshot');
    manager.undo();
    assert.equal(manager.currentMap.events[1].name, 'Before');

    manager.currentMap.events = [null];
    manager.undoStack = [];
    const cancelled = manager.createNewEvent(2, 3);
    assert.equal(manager.currentMap.events.filter(Boolean).length, 0);
    manager.eventEditor.options.onCancel(cancelled);
    assert.equal(manager.currentMap.events.filter(Boolean).length, 0);
    assert.equal(manager.undoStack.length, 0);

    const committed = manager.createNewEvent(4, 5);
    assert.equal(manager.eventEditor.options.onCommit(committed, { ...committed, name: 'Created' }), true);
    assert.equal(manager.currentMap.events[committed.id], committed);
    assert.equal(committed.name, 'Created');
    assert.equal(manager.undoStack.length, 1);
});

test('EventManager routes the X button and backdrop through cancellation', () => {
    const listeners = {};
    const closeButton = { addEventListener: (name, handler) => { listeners.close = handler; } };
    const modal = {
        style: {},
        addEventListener: (name, handler) => { listeners.backdrop = handler; }
    };
    const document = { getElementById: id => id === 'event-editor-modal' ? modal : closeButton };
    const EventManager = loadClass('EventManager.js', 'EventManager', { document });
    const manager = Object.create(EventManager.prototype);
    let cancellations = 0;
    manager.eventEditor = { cancelChanges: () => cancellations++ };
    manager.setupEventEditorModal();
    listeners.close();
    listeners.backdrop({ target: modal });
    assert.equal(cancellations, 2);
});

test('ProjectManager rejects unsafe names and non-empty creation targets without modifying them', async () => {
    const ProjectManager = loadClass('ProjectManager.js', 'ProjectManager', { nw: {} });
    const manager = new ProjectManager();
    for (const name of ['', '.', '..', '../escape', 'nested/name', 'nested\\name', 'CON', 'trailing.']) {
        assert.equal(manager.isSafeProjectName(name), false, `${JSON.stringify(name)} is unsafe`);
    }
    assert.equal(manager.isSafeProjectName('Safe Project'), true);

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-project-target-'));
    const target = path.join(tempRoot, 'Existing');
    fs.mkdirSync(target);
    const sentinel = path.join(target, 'keep.txt');
    fs.writeFileSync(sentinel, 'keep');
    try {
        assert.equal(await manager.createNewProject(target, 'Existing'), false);
        assert.equal(fs.readFileSync(sentinel, 'utf8'), 'keep');
        assert.match(manager.lastCreateError, /not empty/);
        assert.equal(await manager.createNewProject(path.join(tempRoot, 'Safe Project'), '../escape'), false);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('project locks are exclusive, recover stale owners, fail closed when malformed, and release by token', () => {
    const alerts = [];
    const ProjectController = loadClass('ProjectController.js', 'ProjectController', {
        nw: {},
        alert: message => alerts.push(message)
    });
    const uiManager = { updateStatus() {} };
    const first = new ProjectController({}, { data: {} }, uiManager);
    const second = new ProjectController({}, { data: {} }, uiManager);
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-project-lock-'));
    const lockPath = path.join(tempRoot, '.rpgreactor.lock');
    try {
        assert.equal(first.acquireProjectLock(tempRoot), true);
        const firstLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        assert.match(firstLock.token, /^[a-f0-9]{64}$/);
        assert.equal(fs.statSync(lockPath).mode & 0o777, 0o600);
        assert.equal(second.acquireProjectLock(tempRoot), false, 'exclusive creation rejects a live owner');

        const replacement = { ...firstLock, token: 'a'.repeat(64) };
        fs.writeFileSync(lockPath, JSON.stringify(replacement), { mode: 0o600 });
        first.releaseProjectLock();
        assert.equal(fs.existsSync(lockPath), true, 'release cannot remove a lock with another token');

        fs.writeFileSync(lockPath, JSON.stringify({
            app: 'RPG Reactor',
            pid: 2147483647,
            token: 'b'.repeat(64),
            openedAt: new Date().toISOString()
        }), { mode: 0o600 });
        assert.equal(second.acquireProjectLock(tempRoot), true, 'a dead owner is recovered');
        assert.notEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')).token, 'b'.repeat(64));
        second.releaseProjectLock();

        fs.writeFileSync(lockPath, '{ malformed', { mode: 0o600 });
        assert.equal(first.acquireProjectLock(tempRoot), false);
        assert.equal(fs.readFileSync(lockPath, 'utf8'), '{ malformed');
        assert.ok(alerts.length >= 2);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('FsAtomic uses random exclusive no-follow temp files, fsyncs, and cleans failed writes', () => {
    const writeAtomic = require(path.join(editorRoot, 'src', 'utils', 'FsAtomic.js'));
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-atomic-'));
    const destination = path.join(tempRoot, 'data.json');
    const opened = [];
    let fsyncs = 0;
    const wrappedFs = Object.create(fs);
    wrappedFs.openSync = (filePath, flags, mode) => {
        opened.push({ filePath, flags });
        return fs.openSync(filePath, flags, mode);
    };
    wrappedFs.fsyncSync = fd => { fsyncs++; fs.fsyncSync(fd); };
    try {
        writeAtomic(wrappedFs, destination, 'one', 'utf8');
        writeAtomic(wrappedFs, destination, 'two', 'utf8');
        assert.equal(fs.readFileSync(destination, 'utf8'), 'two');
        const tempOpens = opened.filter(entry => entry.filePath.includes('.tmp-rr-'));
        assert.equal(tempOpens.length, 2);
        assert.notEqual(tempOpens[0].filePath, tempOpens[1].filePath);
        for (const entry of tempOpens) {
            assert.ok((entry.flags & fs.constants.O_EXCL) !== 0);
            if (fs.constants.O_NOFOLLOW) assert.ok((entry.flags & fs.constants.O_NOFOLLOW) !== 0);
        }
        assert.ok(fsyncs >= 4, 'each write syncs its file and parent directory');
        assert.deepEqual(fs.readdirSync(tempRoot), ['data.json']);

        const failingFs = Object.create(fs);
        failingFs.renameSync = () => { throw new Error('rename failed'); };
        assert.throws(() => writeAtomic(failingFs, destination, 'bad', 'utf8'), /rename failed/);
        assert.deepEqual(fs.readdirSync(tempRoot), ['data.json']);
        assert.equal(fs.readFileSync(destination, 'utf8'), 'two');
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('TilemapManager ignores a stale map load that completes after a newer map', async () => {
    const loads = new Map();
    const PIXI = {
        TextureStyle: { defaultOptions: {} },
        Assets: { load: url => loads.get(url).promise }
    };
    const TilemapManager = loadClass('TilemapManager.js', 'TilemapManager', { nw: {}, PIXI });
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-map-race-'));
    fs.mkdirSync(path.join(tempRoot, 'data'));
    const map = tilesetId => ({ width: 1, height: 1, tilesetId, data: new Array(6).fill(0), events: [null] });
    fs.writeFileSync(path.join(tempRoot, 'data', 'Map001.json'), JSON.stringify(map(1)));
    fs.writeFileSync(path.join(tempRoot, 'data', 'Map002.json'), JSON.stringify(map(2)));
    const databaseManager = {
        getTileset: id => ({ id, tilesetNames: [`Tileset${id}`] }),
        getTilesets: () => []
    };
    const manager = new TilemapManager({}, tempRoot, databaseManager);
    const url1 = manager.assetUrl(path.join(tempRoot, 'img', 'tilesets', 'Tileset1.png'));
    const url2 = manager.assetUrl(path.join(tempRoot, 'img', 'tilesets', 'Tileset2.png'));
    loads.set(url1, deferred());
    loads.set(url2, deferred());
    const rendered = [];
    manager.createTilemapContainer = () => { manager.container = { x: 0, y: 0 }; };
    manager.renderMap = () => rendered.push(manager.currentMap.id);
    manager.applyMinScaleClamp = () => {};
    manager.applyViewportCrop = () => {};
    manager.updateCanvasWrapperSize = () => {};
    manager.updateScrollbars = () => {};
    try {
        const first = manager.loadMap(1);
        const second = manager.loadMap(2);
        loads.get(url2).resolve({ source: { style: {} } });
        assert.equal(await second, true);
        loads.get(url1).resolve({ source: { style: {} } });
        assert.equal(await first, false);
        assert.equal(manager.currentMap.id, 2);
        assert.deepEqual(rendered, [2]);
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});

test('ProjectController stale map completion cannot update status, highlight, callback, or last-map state', async () => {
    const pending = new Map([[1, deferred()], [2, deferred()]]);
    const storage = new Map();
    const statuses = [];
    const ProjectController = loadClass('ProjectController.js', 'ProjectController', {
        nw: undefined,
        localStorage: {
            getItem: key => storage.get(key) || null,
            setItem: (key, value) => storage.set(key, value)
        }
    });
    const controller = new ProjectController({}, { data: {} }, { updateStatus: status => statuses.push(status) });
    controller.currentProject = { path: '/race', maps: [] };
    controller.tilemapManager = {
        currentMap: null,
        cancelPendingMapLoad() {},
        loadMap: id => pending.get(id).promise
    };
    const highlights = [];
    let callbacks = 0;
    controller.highlightCurrentMap = id => highlights.push(id);
    controller.onMapLoaded = () => callbacks++;

    const first = controller.loadMap(1, { skipDirtyCheck: true });
    const second = controller.loadMap(2, { skipDirtyCheck: true });
    pending.get(2).resolve(true);
    assert.equal(await second, true);
    pending.get(1).resolve(true);
    assert.equal(await first, false);
    assert.deepEqual(highlights, [2]);
    assert.equal(callbacks, 1);
    assert.equal(storage.get(controller.getLastMapStorageKey()), '2');
    assert.equal(statuses.includes('Map 1 loaded'), false);
});
