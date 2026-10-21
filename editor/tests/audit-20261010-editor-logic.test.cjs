// Editor logic audit of 2026-10-10: each test pins a defect found by reading the code paths end to end.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const quiet = { log() {}, debug() {}, warn() {}, error() {}, info() {} };

const elevation = require(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'));
const ground = require(path.join(editorRoot, 'src', 'utils', 'MapGround.js'));

const mapOf = (width, height, id) => ({ id, width, height, note: '<3d>', data: new Array(width * height * 6).fill(0), events: [null] });

function withProject(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-audit-'));
    fs.mkdirSync(path.join(root, 'data'));
    try { return run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

async function withProjectAsync(run) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-audit-'));
    fs.mkdirSync(path.join(root, 'data'));
    try { return await run(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

//-----------------------------------------------------------------------------
// The map's 3D sidecar

test('a flat map keeps its painted ground, the land past its border and its battle settings through a save', () => {
    // The sidecar is removed when a map has nothing left to say. Ground types, the land past the border
    // and a battle mode kept there were not counted: on a map with flat ground and nothing built, a save
    // deleted the file and the work was gone on the next open.
    withProject(root => {
        const file = path.join(root, 'data', 'Map003.r3d.json');

        const painted = mapOf(4, 4, 3);
        assert.equal(ground.addType(painted, { material: 'Sand' }), 0);
        assert.ok(ground.paint(painted, 0, 2, 2, { radius: 1.5, strength: 1 }), 'the brush touched cells');
        assert.equal(elevation.save(fs, path, root, painted), true);
        assert.equal(fs.existsSync(file), true, 'painted ground keeps the file');
        const reread = mapOf(4, 4, 3);
        reread.reactor3d = JSON.parse(fs.readFileSync(file, 'utf8'));
        assert.deepEqual(ground.types(reread), ground.types(painted));
        assert.equal(ground.hasPaint(reread), true);

        // The last type removed: nothing is left, and the file goes as before.
        ground.removeType(painted, 0);
        assert.equal(elevation.save(fs, path, root, painted), true);
        assert.equal(fs.existsSync(file), false, 'a map with nothing left gains no file');

        const bordered = mapOf(4, 4, 3);
        bordered.reactor3d = { version: 1, mode: '3d', surround: { style: 'hills', reach: 12 } };
        assert.equal(elevation.save(fs, path, root, bordered), true);
        assert.equal(fs.existsSync(file), true, 'the land past the border keeps the file');
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).surround, { style: 'hills', reach: 12 });
        fs.rmSync(file);

        // An older map's battle mode and start, which the game reads from here when the Note names none.
        const fought = mapOf(4, 4, 3);
        fought.reactor3d = { version: 1, mode: '3d', battle: { mode: 'tactical', trigger: 4 } };
        assert.equal(elevation.save(fs, path, root, fought), true);
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).battle, { mode: 'tactical', trigger: 4 });
    });
});

//-----------------------------------------------------------------------------
// Pieces

test('a piece laid over the same piece with another finish, surface, frame or size takes it', () => {
    // "The same piece again changes nothing" compared the kind, the turn and the material only, as
    // pieces had nothing else when it was written: a click with another finish in hand did nothing.
    const map = mapOf(8, 8, 1);
    const id = elevation.setPiece(map, { kind: 'wall', x: 2, y: 2, z: 0, rot: 0, material: 'Stone', group: 4 });
    assert.ok(id > 0);
    const list = map.reactor3d.pieces;
    assert.equal(elevation.setPiece(map, { kind: 'wall', x: 2, y: 2, z: 0, rot: 0, material: 'Stone' }), id);
    assert.equal(map.reactor3d.pieces, list, 'the same piece again writes nothing');
    assert.equal(elevation.pieceAt(map, 2, 2, 0).group, 4);

    assert.equal(elevation.setPiece(map, { kind: 'wall', x: 2, y: 2, z: 0, rot: 0, material: 'Stone', finish: 'mirror', group: 4 }), id, 'it keeps its id');
    assert.equal(elevation.pieceAt(map, 2, 2, 0).finish, 'mirror');
    assert.equal(elevation.setPiece(map, { kind: 'wall', x: 2, y: 2, z: 0, rot: 0, material: 'Stone', finish: 'mirror', surface: { reflect: 0.5 }, group: 4 }), id);
    assert.equal(elevation.pieceAt(map, 2, 2, 0).surface.reflect, 0.5);
    // The same finished piece again, laid from outside its building: nothing is written and it stays in the building.
    const finished = map.reactor3d.pieces;
    assert.equal(elevation.setPiece(map, { kind: 'wall', x: 2, y: 2, z: 0, rot: 0, material: 'Stone', finish: 'mirror', surface: { reflect: 0.5 } }), id);
    assert.equal(map.reactor3d.pieces, finished);
    assert.equal(elevation.pieceAt(map, 2, 2, 0).group, 4);

    const pane = elevation.setPiece(map, { kind: 'window', x: 4, y: 2, z: 0, rot: 0, material: 'Stone' });
    assert.equal(elevation.setPiece(map, { kind: 'window', x: 4, y: 2, z: 0, rot: 0, material: 'Stone', frame: { style: 'arched' } }), pane);
    assert.equal(elevation.pieceAt(map, 4, 2, 0).frame.style, 'arched');

    const box = elevation.setPiece(map, { kind: 'box', x: 6, y: 6, z: 0, material: 'Stone', size: [1, 1, 1] });
    assert.equal(elevation.setPiece(map, { kind: 'box', x: 6, y: 6, z: 0, material: 'Stone', size: [2, 1, 2] }), box);
    assert.deepEqual(elevation.pieceAt(map, 6, 6, 0).size, [2, 1, 2]);
});

//-----------------------------------------------------------------------------
// Events

function loadEventManager(overrides = {}) {
    return vm.runInNewContext(`${read('src/EventManager.js')}\nEventManager;`, { console: quiet, RRMapElevation: elevation, ...overrides });
}

function eventManagerOn(map, overrides) {
    const EventManager = loadEventManager(overrides);
    const manager = Object.create(EventManager.prototype);
    Object.assign(manager, { currentMap: map, undoStack: [], redoStack: [], maxUndoSteps: 50, selectedEvent: null,
        notifyUndoStateChange() {}, renderEvents() {}, selectEvent() {} });
    return manager;
}

test('a Quick Event on an id used before does not take the old event\'s model, height or size', () => {
    // A building's people go with the building, and what the 3D sidecar keeps under their ids stays for
    // the undo that brings them back. The next Quick Event took the first free id and stood as that model.
    const map = mapOf(8, 8, 2);
    map.reactor3d = { version: 1, mode: '3d', events: { 1: { 0: { name: 'Guard', size: 2 } }, 2: { 0: { name: 'Cart', size: 3 } } },
        eventZ: { 1: 2.5 }, eventSize: { 1: [2, 2] }, eventSizeAnchor: 'center', eventPreviews: { 1: 0 } };
    map.events = [null, null, { id: 2, name: 'Cart', note: '', x: 5, y: 5, pages: [{}] }];
    const manager = eventManagerOn(map);

    const chest = manager.makeQuickEvent(3, 3, 'Treasure', [manager.makeDefaultEventPage()]);
    assert.equal(chest.id, 1, 'the first free id is taken');
    assert.equal(manager.commitQuickEvent(chest), true);
    assert.equal(map.reactor3d.events['1'], undefined, 'the id starts with no model');
    assert.equal(map.reactor3d.eventZ, undefined);
    assert.equal(map.reactor3d.eventSize, undefined);
    assert.equal(map.reactor3d.eventPreviews, undefined);
    assert.equal(map.reactor3d.events['2']['0'].name, 'Cart', 'another event keeps its model');

    // One step back and the id holds what it held, for the undo of whatever removed its event.
    manager.undo();
    assert.equal(map.events[1], null);
    assert.equal(map.reactor3d.events['1']['0'].name, 'Guard');
    assert.equal(map.reactor3d.eventZ['1'], 2.5);
    assert.deepEqual(Array.from(map.reactor3d.eventSize['1']), [2, 2]);
});

//-----------------------------------------------------------------------------
// Terrain

function terrainContext() {
    const events = [];
    const context = { console: quiet, setTimeout, clearTimeout,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent(event) { events.push(event); }, getElementById: () => null },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
    context.window = context;
    for (const file of ['MapElevation.js', 'MapFoliage.js', 'MapGround.js']) vm.runInNewContext(read('src/utils/' + file), context);
    vm.runInNewContext(read('src/TerrainManager.js'), context);
    return context;
}

test('a ground type still changing color when another map opens is no undo step there', () => {
    // The Build bar keeps a ground color a moment after the last change (a timer). Another map opened
    // in that moment got the step, holding the first map's ground types: Undo there replaced its own.
    const context = terrainContext();
    const first = Object.assign(mapOf(6, 6, 1), { reactor3d: { version: 1, mode: '3d', ground: { types: [{ material: 'Sand', paint: '9x4' }] } } });
    const second = Object.assign(mapOf(6, 6, 2), { reactor3d: { version: 1, mode: '3d', ground: { types: [{ material: 'Snow', paint: '0x8 9x2' }] } } });
    let current = first;
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: current }) });
    assert.equal(terrain.editGroundType({ tint: '#aa0000' }, 'live'), true);
    assert.equal(first.reactor3d.ground.types[0].tint, '#aa0000');

    current = second;
    terrain.setMap();
    const before = JSON.stringify(second.reactor3d.ground);
    // The timer fires on the map now open.
    terrain.editGroundType({}, 'commit');
    assert.equal(terrain.undoStack.length, 0, 'the other map has no step of this one');
    terrain.undo();
    assert.equal(JSON.stringify(second.reactor3d.ground), before);
    assert.equal(first.reactor3d.ground.types[0].tint, '#aa0000', 'the first map keeps its color');
});

test('an event\'s model keeps its texture when the event is saved before the 3D module is read', () => {
    // The event editor writes models itself until the game's 3D module is in (a project opened on a 2D
    // map reads it late). That writer left the model's own texture out, so OK on such an event dropped it.
    const EventEditor = vm.runInNewContext(`${read('src/event/EventEditor.js')}\nEventEditor;`, { console: quiet });
    const map = mapOf(4, 4, 1);
    map.reactor3d = { version: 1, mode: '3d', events: { 3: { 0: { name: 'Crate', file: '', ext: '.glb', size: 2, scale: 1, yaw: 90, pitch: 0, roll: 0, texture: 'crate-red.png', variant: 'Worn' } } } };
    const editor = Object.create(EventEditor.prototype);
    editor.projectController = { getTilemapManager: () => ({ currentMap: map }) };
    editor.currentEvent = { id: 3, pages: [{}] };
    editor.needsInitialCommit = false;
    editor._loadPendingModels(editor.currentEvent);
    assert.equal(editor.pendingModels[0].texture, 'crate-red.png', 'the draft holds it');
    editor.pendingZ = null; editor.pendingSize = null;
    editor._writePendingModels();
    const written = map.reactor3d.events['3']['0'];
    assert.equal(written.texture, 'crate-red.png');
    assert.equal(written.variant, 'Worn');
    assert.equal(written.yaw, 90);
});

//-----------------------------------------------------------------------------
// Projects

test('a lock left from before this boot does not stop an import into its folder', () => {
    // Opening a project already tells a lock of a running editor from one whose process number was
    // handed out again after a restart. The import dialog went by the number alone, so a folder with
    // such a lock could not be imported into again.
    const dialog = require(path.join(editorRoot, 'src', 'LegacyImportDialog.js'));
    withProject(root => {
        const lock = openedAt => fs.writeFileSync(path.join(root, '.rpgreactor.lock'),
            JSON.stringify({ app: 'RPG Reactor', pid: process.pid, token: 'a'.repeat(64), openedAt }));
        lock(new Date().toISOString());
        assert.equal(dialog.projectOpenAt(fs, path, root), true, 'a lock of a running editor stands');
        lock(new Date(Date.now() - os.uptime() * 1000 - 3600000).toISOString());
        assert.equal(dialog.projectOpenAt(fs, path, root), false, 'written before this boot: nobody holds it');
        fs.rmSync(path.join(root, '.rpgreactor.lock'));
        assert.equal(dialog.projectOpenAt(fs, path, root), false);
    });
});

test('a vehicle that started on a deleted map has no starting position left', async () => {
    // Deleting a map moved the player's start and cleared the boat's, the ship's and the airship's.
    // A vehicle type's own starting position stayed on the deleted number: the checker called it an
    // error, and the next map made took that number and the vehicle with it.
    const ProjectController = vm.runInNewContext(`${read('src/ProjectController.js')}\nProjectController;`, { console: quiet, window: undefined });
    const controller = Object.create(ProjectController.prototype);
    const saved = [];
    const vehicles = [null, { id: 1, name: 'Motorcycle', startMapId: 7, startX: 4, startY: 5 }, { id: 2, name: 'Tank', startMapId: 3, startX: 1, startY: 1 }, { id: 3, name: 'Shuttle' }];
    controller.currentProject = { path: '/project' };
    controller.databaseManager = { data: { vehicles }, mutationGeneration: 0,
        async saveJSON(projectPath, filename, data) { saved.push([projectPath, filename, JSON.parse(JSON.stringify(data))]); return true; } };

    assert.equal(await controller.clearVehicleStartsOn([7, 8]), 1);
    assert.equal(vehicles[1].startMapId, 0, 'the start on the deleted map is cleared');
    assert.equal(vehicles[2].startMapId, 3, 'a start on another map stays');
    assert.equal(saved.length, 1, 'written with the deletion, as the maps are');
    assert.deepEqual(saved[0].slice(0, 2), ['/project', 'ReactorVehicles.json']);
    assert.equal(saved[0][2][1].startMapId, 0);
    assert.ok(controller.databaseManager.mutationGeneration > 0);

    assert.equal(await controller.clearVehicleStartsOn([9]), 0);
    assert.equal(saved.length, 1, 'nothing to clear writes nothing');
    // A project with no vehicle data (an imported one) is left alone.
    controller.databaseManager.data.vehicles = undefined;
    assert.equal(await controller.clearVehicleStartsOn([3]), 0);

    // The deletion calls it once the maps are off the list.
    const source = read('src/ProjectController.js');
    const deletion = source.slice(source.indexOf('// MapInfos is safely on disk'), source.indexOf('const lastMapId = localStorage.getItem(this.getLastMapStorageKey());'));
    assert.match(deletion, /await this\.clearVehicleStartsOn\(mapIdsToDelete\);/);
});

//-----------------------------------------------------------------------------
// The Build bar's materials

test('the Build bar lists the open project\'s materials, read again when the bar comes up', () => {
    // The builder read img/materials once and kept the list for the life of the editor: its refresh ran
    // only with the old Pieces panel on the page, which is never put there now. A second project opened
    // in the same session showed the first one's materials, and a picture added to the folder never showed.
    const folders = { '/first/img/materials': ['Stone', 'Wood'], '/second/img/materials': ['Hull'] };
    const context = { console: quiet, require,
        document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null },
        RRMapElevation: elevation,
        RRAssetFiles: { listMaterials: directory => (folders[directory.replace(/\\/g, '/')] || []).map(name => ({ name })), imageUrlFor: (directory, name) => `${directory}/${name}.png` } };
    context.window = context;
    vm.runInNewContext(`${read('src/PieceBuilderManager.js')}\nwindow.PieceBuilderManager = PieceBuilderManager;`, context);
    let project = { path: '/first' };
    const builder = new context.PieceBuilderManager({ getCurrentProject: () => project, getTilemapManager: () => ({ currentMap: null }) });
    const names = () => Array.from(builder.materials(), entry => entry.name);
    assert.deepEqual(names(), ['Stone', 'Wood']);
    assert.equal(builder.materials(), builder.materials(), 'kept between reads');

    // A picture added to the folder shows the next time the bar comes up (no panel of the builder's own is on the page).
    folders['/first/img/materials'].push('Moss');
    assert.equal(builder.panel, null);
    builder.activate();
    assert.deepEqual(names(), ['Stone', 'Wood', 'Moss']);

    // Another project: its own materials, with nothing asked of the builder first.
    project = { path: '/second' };
    assert.deepEqual(names(), ['Hull']);
    assert.match(String(builder.materials()[0].url).replace(/\\/g, '/'), /^\/second\/img\/materials\/Hull/);
});

test('a stamped building is built again from the open project\'s plan as it is on disk', () => {
    // The plans were kept the same way: a plan saved in Database > Structures, or another project's plan
    // of the same file name, was not what a move or a turn of a stamped building built it from.
    const first = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-audit-a-')), second = fs.mkdtempSync(path.join(os.tmpdir(), 'rpg-reactor-audit-b-'));
    const plan = (root, size) => {
        fs.mkdirSync(path.join(root, '3d', 'Structures'), { recursive: true });
        fs.writeFileSync(path.join(root, '3d', 'Structures', 'House.json'), JSON.stringify({ name: 'House', size, pieces: [{ kind: 'wall', x: 0, y: 0, z: 0 }] }));
    };
    try {
        plan(first, [4, 4]); plan(second, [9, 7]);
        const context = { console: quiet, require, document: { addEventListener() {}, removeEventListener() {}, getElementById: () => null }, RRMapElevation: elevation,
            RRAssetFiles: { listMaterials: () => [], imageUrlFor: () => '' } };
        context.window = context;
        vm.runInNewContext(`${read('src/PieceBuilderManager.js')}\nwindow.PieceBuilderManager = PieceBuilderManager;`, context);
        let project = { path: first };
        const builder = new context.PieceBuilderManager({ getCurrentProject: () => project, getTilemapManager: () => ({ currentMap: null }) });
        const size = () => Array.from(builder.resolvePlan('House.json').size);
        assert.deepEqual(size(), [4, 4]);

        plan(first, [6, 5]);
        builder.activate();
        assert.deepEqual(size(), [6, 5], 'the plan as saved since');

        project = { path: second };
        assert.deepEqual(size(), [9, 7], "the open project's plan");
    } finally {
        fs.rmSync(first, { recursive: true, force: true });
        fs.rmSync(second, { recursive: true, force: true });
    }
});

test('OK after a drag reorder stores the new order in the event, and the map saves it', () => {
    // Not a defect: the check the 2026-10-03 pass left open, pinned here.
    const EventCommandList = require(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'));
    const EventEditor = vm.runInNewContext(`${read('src/event/EventEditor.js')}\nEventEditor;`, { console: quiet, document: { getElementById: () => null } });
    const command = (code, indent = 0) => ({ code, indent, parameters: [] });
    const event = { id: 4, name: 'EV004', note: '', x: 1, y: 1, pages: [{ list: [command(121), command(122), command(230), command(0)] }] };
    const map = Object.assign(mapOf(4, 4, 1), { events: [null, null, null, null, event] });
    const editor = Object.create(EventEditor.prototype);
    editor.projectController = { getTilemapManager: () => ({ currentMap: map }) };
    editor.sourceEvent = event;
    editor.cancelBaseline = JSON.parse(JSON.stringify(event));
    editor.currentEvent = JSON.parse(JSON.stringify(event));
    editor.needsInitialCommit = false;
    editor.pendingModels = [null]; editor.pendingModelsBaseline = [null];
    editor.pendingZ = 0; editor.pendingZBaseline = 0;
    editor.pendingSize = [1, 1]; editor.pendingAuto = false; editor.pendingSizeBaseline = editor._sizeState();

    const list = editor.currentEvent.pages[0].list;
    EventCommandList.trackHistory(list);
    assert.ok(EventCommandList.moveCommands(list, [2], 0), 'the third command dragged to the top');
    assert.deepEqual(event.pages[0].list.map(entry => entry.code), [121, 122, 230, 0], 'the draft alone changed');
    assert.equal(editor._commitChanges(), true);
    // The committed list was made inside the editor's context: read out before comparing.
    assert.deepEqual(Array.from(event.pages[0].list, entry => entry.code), [230, 121, 122, 0]);
    assert.equal(map.events[4], event, 'the map holds the same event');
    assert.deepEqual(JSON.parse(JSON.stringify(map)).events[4].pages[0].list.map(entry => entry.code), [230, 121, 122, 0], 'which is what a save writes');
});

test('deleting the map the game starts on leaves the Database with nothing unsaved', async () => {
    // The start is moved to another map and System.json written at once. What counted as saved was
    // taken before the moved start reached the Database's own copy, so the Database read as changed
    // from then on and closing the project asked about changes that were already on disk.
    const globals = { RRJson: require('../src/utils/JsonFiles.js'), console: quiet, process, require, nw: {} };
    const DatabaseManager = vm.runInNewContext(`${read('src/DatabaseManager.js')}\nDatabaseManager;`, { ...globals });
    const ProjectController = vm.runInNewContext(`${read('src/ProjectController.js')}\nProjectController;`, { ...globals });
    await withProjectAsync(async root => {
        const write = (file, value) => fs.writeFileSync(path.join(root, 'data', file), JSON.stringify(value));
        write('System.json', { gameTitle: 'Test', startMapId: 2, startX: 5, startY: 6, versionId: 1,
            boat: { startMapId: 2, startX: 1, startY: 1 }, ship: { startMapId: 0, startX: 0, startY: 0 }, airship: { startMapId: 1, startX: 3, startY: 3 } });
        write('Map001.json', {}); write('Map002.json', {});
        const manager = new DatabaseManager();
        manager.fs = fs; manager.path = path;
        assert.equal(await manager.loadAllData(root), true);
        assert.equal(manager.isDirty(), false);

        const controller = Object.create(ProjectController.prototype);
        controller.currentProject = { path: root, maps: [null, { id: 1 }, { id: 2 }] };
        controller.databaseManager = manager;
        controller.uiManager = { updateStatus() {} };
        assert.equal(await controller.repairInvalidSystemMapReferences([2], 1), true);
        assert.equal(manager.data.system.startMapId, 1);
        assert.equal(manager.data.system.boat.startMapId, 0);
        assert.equal(manager.data.system.airship.startMapId, 1, 'a start on a map that stays is left');
        const onDisk = JSON.parse(fs.readFileSync(path.join(root, 'data', 'System.json'), 'utf8'));
        assert.equal(onDisk.startMapId, 1);
        assert.equal(onDisk.versionId, manager.data.system.versionId);
        assert.deepEqual(Array.from(manager.getDirtyKeys()), [], 'what is on disk is what the Database holds');
    });
});
