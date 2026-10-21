// Hands-on editor audit of 2026-10-03: each test pins a defect found by driving the editor with real input.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');

function loadEventManager(overrides = {}) {
    return vm.runInNewContext(`${read('src/EventManager.js')}\nEventManager;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} },
        ...overrides
    });
}

test('a pasted event keeps its name; one still wearing its default name takes the default for its new id', async () => {
    const EventManager = loadEventManager();
    const manager = Object.create(EventManager.prototype);
    manager.currentMap = {
        width: 10, height: 8,
        events: [null, { id: 1, name: 'Villager', x: 2, y: 2, pages: [{}] }, { id: 2, name: 'EV002', x: 3, y: 2, pages: [{}] }]
    };
    manager.undoStack = []; manager.redoStack = []; manager.maxUndoSteps = 50; manager.selectedEvent = null;
    manager.notifyUndoStateChange = () => {}; manager.renderEvents = () => {}; manager.selectEvent = () => {};

    manager.copyEvent(manager.currentMap.events[1]);
    await manager.pasteEvent(5, 5);
    const named = manager.currentMap.events.find(e => e && e.x === 5 && e.y === 5);
    assert.equal(named.name, 'Villager', 'a named event is pasted under its own name');
    assert.equal(manager.currentMap.events[1].name, 'Villager');

    manager.copyEvent(manager.currentMap.events[2]);
    await manager.pasteEvent(6, 6);
    const plain = manager.currentMap.events.find(e => e && e.x === 6 && e.y === 6);
    assert.equal(plain.name, `EV${String(plain.id).padStart(3, '0')}`, 'a default name follows the new id');
    assert.notEqual(plain.name, 'EV002');
});

test('an empty command row takes a new command by double-click and by Enter', () => {
    const source = read('src/event/EventCommandList.js');
    // The row's double-click: an empty row (code 0) opens the picker there instead of doing nothing.
    const dbl = source.slice(source.indexOf("div.addEventListener('dblclick'"));
    const handler = dbl.slice(0, dbl.indexOf('});') + 3);
    assert.match(handler, /if \(page\.list\[targetIndex\]\?\.code === 0\) \{\s*this\.selectSingle\(targetIndex\);\s*this\.updateSelectionStyles\(page\);\s*this\.newCommand\(page, pageIndex\);\s*return;\s*\}/);
    assert.match(handler, /this\.editCommand\(targetIndex, page, pageIndex\);/);
    // Enter: edit the selected command, or add one on an empty row; never while a field is being typed in.
    assert.match(source, /e\.key === 'Enter' && !isCtrl && !e\.shiftKey && !e\.altKey && this\.selectedIndices\.length === 1/);
    assert.match(source, /if \(this\.currentPage\.list\[selected\]\?\.code === 0\) this\.newCommand\(this\.currentPage, this\.currentPageIndex\);\s*else this\.editCommand\(selected, this\.currentPage, this\.currentPageIndex\);/);
    const keys = source.slice(source.indexOf("document.addEventListener('keydown'"), source.indexOf("e.key === 'Enter'"));
    assert.match(keys, /tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT' \|\| e\.target\.isContentEditable\) return;/);
});

test('picking a region to paint puts the eraser down; region 0 leaves it', () => {
    const RegionManager = vm.runInNewContext(`${read('src/RegionManager.js')}\nRegionManager;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} },
        window: {}, document: { getElementById: () => null, querySelectorAll: () => [] }
    });
    const regions = Object.create(RegionManager.prototype);
    const calls = [];
    regions.columns = 8;
    regions.mapEditor = { eraserMode: true, mapStamp: null, setEraserMode(on) { calls.push(on); this.eraserMode = on; } };
    for (const name of ['renderPalette', 'render', 'updateSelection', 'drawSelection', 'refreshPalette']) if (typeof regions[name] === 'function') regions[name] = () => {};
    try { regions.selectRegion(0); } catch (error) { /* drawing needs a canvas; the eraser rule runs first */ }
    assert.deepEqual(calls, [], 'region 0 is the eraser itself');
    try { regions.selectRegion(5); } catch (error) { /* as above */ }
    assert.deepEqual(calls, [false]);
    assert.equal(regions.selectedRegion, 5);
});

test('Battle Test writes a test copy of the unsaved interfaces, when the project has its own', () => {
    const source = read('src/database/BattleTestConfigModal.js');
    assert.match(source, /if \(Array\.isArray\(dm\.data\.userInterfaces\) && typeof dm\.hasUserInterfaces === 'function' && dm\.hasUserInterfaces\(\)\) testFiles\.push\(\['UserInterfaces\.json', dm\.data\.userInterfaces\]\);/);
    // A project on the stock screens gains no file, and a stale copy from an earlier test goes.
    assert.match(source, /else fs\.rmSync\(path\.join\(dataDir, 'Test_UserInterfaces\.json'\), \{ force: true \}\);/);
    // It is written with the others: after the list is built, before the loop that writes it.
    assert.ok(source.indexOf("testFiles.push(['UserInterfaces.json'") < source.indexOf('for (const [filename, data] of testFiles)'));
});

test('a project lock written before this boot is stale, whoever holds its pid now', () => {
    const os = require('node:os');
    const alerts = [];
    const ProjectController = vm.runInNewContext(`${read('src/ProjectController.js')}\nProjectController;`, {
        console: { log() {}, debug() {}, warn() {}, error() {} },
        RRJson: require('../src/utils/JsonFiles.js'), require, process, nw: {}, alert: message => alerts.push(message)
    });
    const controller = new ProjectController({}, { data: {} }, { updateStatus() {} });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-lock-boot-'));
    const lockPath = path.join(root, '.rpgreactor.lock');
    const lock = openedAt => fs.writeFileSync(lockPath, JSON.stringify({ app: 'RPG Reactor', pid: process.pid, token: 'c'.repeat(64), openedAt }), { mode: 0o600 });
    try {
        // This very process holds the pid, but the lock is from before the machine started.
        const beforeBoot = new Date(Date.now() - os.uptime() * 1000 - 3600000).toISOString();
        lock(beforeBoot);
        assert.equal(controller.projectLockOwnerLives(JSON.parse(fs.readFileSync(lockPath, 'utf8'))), false);
        assert.equal(controller.acquireProjectLock(root), true, 'the stale lock is recovered');
        assert.notEqual(JSON.parse(fs.readFileSync(lockPath, 'utf8')).token, 'c'.repeat(64));
        controller.releaseProjectLock();
        // Written since the boot by a pid that runs: a live owner, as before.
        lock(new Date().toISOString());
        const other = new ProjectController({}, { data: {} }, { updateStatus() {} });
        assert.equal(other.acquireProjectLock(root), false, 'a live owner still holds the project');
        assert.equal(JSON.parse(fs.readFileSync(lockPath, 'utf8')).token, 'c'.repeat(64));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Lighting drops its undo steps when the map changes, before the 3D libraries have loaded too', () => {
    const source = read('src/LightingManager.js');
    const tick = source.slice(source.indexOf('const tick = () => {'));
    const reset = tick.indexOf('if (this.map() !== this._historyMap) {');
    const gated = tick.indexOf("if (typeof Reactor3D !== 'undefined' && (this.map() !== this._boundMap");
    assert.ok(reset > 0 && gated > reset, 'the history reset stands before, and outside, the 3D-gated rebuild');
    assert.match(tick.slice(reset, gated), /this\._historyMap = this\.map\(\);\s*this\._undo = \[\];\s*this\._redo = \[\];/);
});
