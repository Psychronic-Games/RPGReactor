// Audit 2026-10-02: the 3D world builder's workshop and tools, by behavior.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(repoRoot, p), 'utf8');

function loadWorkshop() {
    const context = {
        console, document: { body: { classList: { add() {}, remove() {} } }, getElementById: () => null, querySelector: () => null },
        setTimeout, clearTimeout, module: { exports: {} }, rrEscapeHtml: text => String(text),
        confirm: () => true
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(read('editor/src/StructureWorkshop.js') + '\n;globalThis.StructureWorkshop = StructureWorkshop;', context);
    return context;
}

test('closing a workshop opened with no map loaded does not leave the plot behind without a session', async () => {
    const { StructureWorkshop } = loadWorkshop();
    const loads = [];
    const tilemap = {
        currentMap: { id: 0, rrWorkshop: { structureId: 1 } },
        isMapDirty: () => false, captureSavedMapState() {}, onWorkshopSave: null,
        clearMap() { this.currentMap = null; }
    };
    const controller = {
        getTilemapManager: () => tilemap,
        getCurrentProject: () => ({ maps: [null, null, { id: 2 }, { id: 3 }] }),
        loadMap: async (id) => { loads.push(id); tilemap.currentMap = { id }; return true; }
    };
    const workshop = new StructureWorkshop(controller);
    workshop.session = { structureId: 1, returnTo: null, was3D: true, barWasUp: true };
    await workshop.close();
    assert.deepEqual(loads, [2], 'the project\'s first map takes the plot\'s place');
    assert.equal(tilemap.currentMap.rrWorkshop, undefined);

    // And when no map can be opened, the plot is cleared rather than kept with nothing to save it.
    tilemap.currentMap = { id: 0, rrWorkshop: { structureId: 1 } };
    controller.getCurrentProject = () => ({ maps: [] });
    workshop.session = { structureId: 1, returnTo: null, was3D: true, barWasUp: true };
    await workshop.close();
    assert.equal(tilemap.currentMap, null);
});

test('turning the 3D view off puts the terrain brushes down and gives 2D editing back', () => {
    const quiet = Object.create(console); quiet.error = () => {}; quiet.warn = () => {};
    const claimed = [];
    const window = { reactor: { terrainManager: { active: true }, claimMapTool(owner) { claimed.push(owner); this.terrainManager.active = false; } } };
    const MapEditor3D = vm.runInNewContext(`${read('editor/src/MapEditor3D.js')}\nMapEditor3D;`, {
        console: quiet, window, document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [] },
        Reactor3D: require(path.join(repoRoot, 'runtime', 'reactor_3d.js')), require, setTimeout: () => 0, clearTimeout
    });
    const view = new MapEditor3D({});
    view.showPixi = () => {};
    view.teardown();
    assert.deepEqual(claimed, ['paint']);
    view.teardown();
    assert.deepEqual(claimed, ['paint'], 'nothing to put down the second time');
});

function loadBuilder() {
    const context = { console, JSON, Math, Object, Array, Number, String, Set, Map, document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} }, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js') + '\nwindow.PieceBuilderManager = PieceBuilderManager;', context);
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    return context;
}

test('a building stamped into a pond stands at the water, and its undo gives the whole pond back', () => {
    const context = loadBuilder();
    const E = context.RRMapElevation;
    const W = 30, H = 30, stride = W + 1;
    const map = { id: 1, width: W, height: H, events: [null], reactor3d: { version: 1 } };
    const grid = E.ensureTerrain(map);
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) grid[y * stride + x] = Math.hypot(x - 15, y - 15) < 4 ? -3 : 0;
    assert.ok(E.fillWaterAt(map, 15, 15, 'Water'));
    const pond = JSON.stringify(E.water(map));
    const level = E.water(map)[0].level;
    const owner = { getTilemapManager: () => ({ currentMap: map }) };
    const builder = new context.PieceBuilderManager(owner), terrain = new context.TerrainManager(owner);
    context.reactor = { terrainManager: terrain, pieceBuilderManager: builder };
    const plan = { name: 'Hut', size: [12, 12], storey: 5, height: 1, pieces: [{ kind: 'floor', x: 0, y: 0 }] };
    builder.structures = () => [{ file: 'Hut.json', name: 'Hut', plan }];
    builder.structure = 'Hut.json';
    assert.equal(builder.stampAt(9, 9), true);
    assert.ok(E.terrainAt(map, 15, 15) >= level - 1e-6, 'the pad stands at the water, not on the pond floor');
    assert.equal(E.water(map).length, 0, 'the footprint covers the whole pond, which the pad dries up');
    builder.undo();
    assert.equal(JSON.stringify(E.water(map)), pond, 'the undo brings the pond back');
    assert.equal(E.terrainAt(map, 15, 15), -3);
    builder.redo();
    assert.equal(E.water(map).length, 0, 'and the redo takes it again');
});

test('removing a stamped building takes its people, and the undo brings them back', () => {
    const context = loadBuilder();
    const E = context.RRMapElevation;
    const map = { id: 1, width: 40, height: 40, events: [null, { id: 1, name: 'Mine', note: '', x: 1, y: 1, pages: [] }], reactor3d: { version: 1 } };
    const owner = { getTilemapManager: () => ({ currentMap: map }) };
    const builder = new context.PieceBuilderManager(owner);
    const plan = { name: 'Shop', size: [4, 4], storey: 5, height: 1, pieces: [{ kind: 'floor', x: 0, y: 0 }], spots: { desk: [1, 1] }, events: [{ spot: 'desk', name: 'Clerk' }] };
    builder.structures = () => [{ file: 'Shop.json', name: 'Shop', plan }];
    builder.structure = 'Shop.json';
    builder.loadEventTemplate = () => null;
    assert.equal(builder.stampAt(10, 10), true);
    const clerk = () => map.events.find(e => e && /<structure:\d+><spot:desk>/.test(e.note));
    assert.ok(clerk(), 'the building has its clerk');
    const group = E.structures(map)[0].group;
    builder.selectedGroup = group;
    assert.equal(builder.removeSelectedGroup(), true);
    assert.equal(clerk(), undefined, 'the clerk goes with the building');
    builder.undo();
    assert.ok(clerk(), 'and comes back with it');
    assert.equal(map.events[1].name, 'Mine', 'the map\'s own event is untouched');
    builder.redo();
    assert.equal(clerk(), undefined);
    assert.equal(map.events[1].name, 'Mine');
});

test('a pond the builder refitted keeps a look set since when the builder step is undone', () => {
    const { PieceBuilderManager } = loadBuilder();
    const before = [{ x0: 0, y0: 0, x1: 3, y1: 3, level: -1, material: 'Water' }, { x0: 10, y0: 10, x1: 11, y1: 11, level: -1, material: 'Water' }];
    const after = [{ x0: 0, y0: 0, x1: 3, y1: 3, level: -1, material: 'Water', mask: '1100110000000000' }];
    const current = [{ x0: 0, y0: 0, x1: 3, y1: 3, level: -1, material: 'Water', mask: '1100110000000000', tint: '#ff0000' }, { x0: 20, y0: 20, x1: 21, y1: 21, level: -2, material: 'Water' }];
    const merged = PieceBuilderManager.mergeWater(current, before, after);
    assert.deepEqual(JSON.parse(JSON.stringify(merged)), [
        { x0: 0, y0: 0, x1: 3, y1: 3, level: -1, material: 'Water', tint: '#ff0000' },
        { x0: 10, y0: 10, x1: 11, y1: 11, level: -1, material: 'Water' },
        { x0: 20, y0: 20, x1: 21, y1: 21, level: -2, material: 'Water' }
    ]);
});

test('ponds a builder step dried up come back in the places they held in the list', () => {
    const { PieceBuilderManager } = loadBuilder();
    const pond = (x, extra) => Object.assign({ x0: x, y0: 0, x1: x + 1, y1: 1, level: -1, material: 'Water' }, extra);
    const names = list => list.map(sheet => sheet.x0);
    // The step dried the first and the third of four: undone, the list reads as it did.
    assert.deepEqual(names(PieceBuilderManager.mergeWater([pond(10), pond(30)], [pond(0), pond(10), pond(20), pond(30)], [pond(10), pond(30)])), [0, 10, 20, 30]);
    // One poured since stays where it is, after the ones that were there.
    assert.deepEqual(names(PieceBuilderManager.mergeWater([pond(30), pond(50)], [pond(0), pond(30)], [pond(30)])), [0, 30, 50]);
    // One drained since stays gone, and the rest keep their order.
    assert.deepEqual(names(PieceBuilderManager.mergeWater([], [pond(0), pond(10), pond(20)], [pond(10)])), [0, 20]);
});

test('a plan larger than the map says so; scaling a building past the map edge leaves its record as it was', () => {
    const context = loadBuilder();
    const E = context.RRMapElevation;
    const flashes = [];
    context.reactor = { buildHotbar: { flash: text => flashes.push(text) } };
    const map = { id: 1, width: 10, height: 10, events: [null], reactor3d: { version: 1 } };
    const builder = new context.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }) });
    builder.announce = () => {};
    const big = { name: 'Keep', size: [12, 4], storey: 5, height: 1, pieces: [{ kind: 'floor', x: 0, y: 0 }] };
    const hut = { name: 'Hut', size: [4, 4], storey: 5, height: 1, pieces: [{ kind: 'floor', x: 0, y: 0 }] };
    builder.structures = () => [{ file: 'Keep.json', name: 'Keep', plan: big }, { file: 'Hut.json', name: 'Hut', plan: hut }];
    builder.structure = 'Keep.json';
    assert.equal(builder.stampAt(0, 0), false);
    assert.deepEqual(flashes, ['This plan is larger than the map.']);
    builder.structure = 'Hut.json';
    assert.equal(builder.stampAt(0, 0), true);
    const group = E.structures(map)[0].group;
    builder.selectedGroup = group;
    assert.equal(builder.scaleSelected(1), true, 'twice the size still fits');
    assert.equal(builder.scaleSelected(1), false, 'three times does not');
    assert.equal(E.structureOf(map, group).scale, 2, 'the building keeps the scale that stands');
    assert.equal(flashes.length, 2);
});

test('the 3D object overlay is drawn again on the next map, whose container replaced the one it was on', () => {
    class Container {
        constructor() { this.children = []; this.parent = null; this.destroyed = false; this.visible = true; }
        addChild(child) { this.children.push(child); child.parent = this; return child; }
        removeChildren() { const gone = this.children; this.children = []; return gone; }
        destroy() { for (const child of this.children) child.destroy?.(); this.destroyed = true; this.children = []; }
    }
    class Graphics { rect() { return this; } fill() { return this; } stroke() { return this; } }
    class Text { constructor() { this.x = 0; this.y = 0; } }
    const context = { console, PIXI: { Container, Graphics, Text }, module: { exports: {} } };
    context.window = { RRMapObjects3D: { at: (map, x, y, layer) => (layer === 0 && x === 1 && y === 1 ? 4 : 0), groundAt: () => false } };
    vm.createContext(context);
    vm.runInContext(read('editor/src/Object3DManager.js') + '\n;globalThis.Object3DManager = Object3DManager;', context);
    const tilemap = { TILE_WIDTH: 48, TILE_HEIGHT: 48, container: new Container(), currentMap: { width: 3, height: 3, data: new Array(54).fill(0) } };
    const manager = new context.Object3DManager(tilemap);
    manager.setVisible(true);
    assert.equal(manager.objectLayer.parent, tilemap.container);
    // A map load: the old container goes with its children, a new one takes its place.
    tilemap.container.destroy();
    tilemap.container = new Container();
    manager.refresh();
    assert.equal(manager.objectLayer.parent, tilemap.container, 'the overlay is on the live container');
    assert.equal(manager.objectLayer.children.length, 2, 'the cells and the object\'s number');
});

test('saving a flat map keeps a sidecar that holds only sized events or the map\'s own physics', () => {
    const E = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapElevation.js'));
    for (const extra of [{ eventSize: { 3: [2, 2] } }, { physics: { gravity: 0.5 } }]) {
        const files = new Map([['/p/data/Map001.r3d.json', 'old']]);
        const fs = { existsSync: f => files.has(f), unlinkSync: f => files.delete(f), writeFileSync: (f, data) => files.set(f, data) };
        const map = { id: 1, width: 4, height: 4, note: '<3d>', reactor3d: Object.assign({ version: 1, mode: '3d' }, extra) };
        assert.equal(E.save(fs, path.posix, '/p', map), true);
        assert.ok(files.has('/p/data/Map001.r3d.json'), Object.keys(extra)[0] + ' keeps the file');
        assert.ok(files.get('/p/data/Map001.r3d.json').includes(Object.keys(extra)[0]));
    }
});

test('a light edited in the editor keeps the runtime fields the panel has no control for', () => {
    const L = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapLights.js'));
    const map = { reactor3d: { version: 1, lights: [{ id: 'torch', type: 'spot', x: 0, y: 0, attach: { player: true }, followFacing: false, body: true }] } };
    L.update(map, 'torch', { intensity: 2 });
    const light = L.get(map, 'torch');
    assert.equal(light.followFacing, false, 'keeps its bearing while carried');
    assert.equal(light.body, true, 'still drawn as a body');
    assert.equal('followFacing' in L.add(map, { type: 'point' }), false, 'nothing written for a light that says nothing');
});

function workshopWithDatabase(records, files) {
    const context = loadWorkshop();
    const written = new Map();
    context.require = name => name === 'fs'
        ? { mkdirSync() {}, writeFileSync: (f, data) => written.set(f, data), renameSync: (from, to) => { if (to === '/p/3d/Structures') throw new Error('EISDIR'); written.set(to, written.get(from)); written.delete(from); } }
        : require(name);
    context.alert = () => {};
    const db = {
        data: { structures: records }, savedState: {}, _structureFiles: new Set(files),
        serialize: value => JSON.stringify(value),
        structuresPath: () => '/p/3d/Structures',
        captureSavedState(key) { this.savedState[key] = this.serialize(this.data[key]); }
    };
    db.captureSavedState('structures');
    const workshop = new context.StructureWorkshop({ databaseManager: db, getCurrentProject: () => ({ path: '/p' }) });
    return { workshop, db, written };
}

test('saving a plot marks only its own structure saved, not other unsaved Database edits', () => {
    const shed = { id: 1, name: 'Shed', file: 'Shed.json', plan: { name: 'Shed', size: [4, 4], pieces: [] } };
    const barn = { id: 2, name: 'Barn', file: 'Barn.json', plan: { name: 'Barn', size: [6, 6], pieces: [] } };
    const { workshop, db, written } = workshopWithDatabase([null, shed, barn], ['Shed.json', 'Barn.json']);
    barn.name = 'Big Barn';                       // changed on the Structures page, not saved
    shed.plan.pieces = [{ kind: 'floor', x: 0, y: 0 }];  // built on the plot
    assert.equal(workshop.writeFile(shed), true);
    assert.ok(written.has('/p/3d/Structures/Shed.json'));
    const saved = JSON.parse(db.savedState.structures);
    assert.equal(saved[1].plan.pieces.length, 1, 'the plot\'s structure is saved');
    assert.equal(saved[2].name, 'Barn', 'the other structure\'s edit is still unsaved');
});

test('a structure with no file yet gets one named after it instead of writing over the folder', () => {
    const fresh = { id: 1, name: 'Watch Tower', file: '', plan: { name: 'Watch Tower', size: [3, 3], pieces: [] } };
    const { workshop, written } = workshopWithDatabase([null, fresh], []);
    assert.equal(workshop.writeFile(fresh), true);
    assert.equal(fresh.file, 'Watch-Tower.json');
    assert.ok(written.has('/p/3d/Structures/Watch-Tower.json'));
});

test('a map resized about another anchor takes its 3D sidecar along, and crops what falls off', () => {
    const E = require(path.join(repoRoot, 'editor', 'src', 'utils', 'MapElevation.js'));
    const map = { id: 1, width: 4, height: 3, reactor3d: { version: 1, mode: '3d', width: 4, height: 3 } };
    const sc = map.reactor3d;
    sc.elevation = new Array(12).fill(0); sc.elevation[1 * 4 + 3] = 5;         // cell (3, 1)
    sc.terrain = new Array(20).fill(0); sc.terrain[1 * 5 + 2] = 1.5; sc.terrainWidth = 4;   // corner (2, 1)
    sc.objects = { 0: new Array(12).fill(0) }; sc.objects[0][2 * 4 + 0] = 7;   // cell (0, 2)
    sc.pieces = [{ id: 1, kind: 'wall', x: 3, y: 1, z: 0, group: 2 }, { id: 2, kind: 'floor', x: 0, y: 0, z: 0 }];
    sc.structures = [{ group: 2, plan: 'Hut.json', x: 3, y: 1, rot: 0, scale: 1, spots: { desk: [3, 1] } }];
    sc.props = [{ id: 1, name: 'Tree', x: 1.5, y: 2 }];
    sc.lights = [{ id: 'a', x: 3.5, y: 1.5 }, { id: 'torch', x: 0.2, y: 0, attach: { player: true } }];
    sc.mediaSurfaces = [{ id: 1, target: 'map', x: 2, y: 1 }];
    sc.water = [{ x0: 2, y0: 0, x1: 3, y1: 1, level: -1, material: 'Water' }];
    // Wider by 2 and one row shorter, anchored bottom-right: old (x, y) goes to (x + 2, y - 1).
    map.width = 6; map.height = 2;
    assert.equal(E.resizeSidecar(map, 4, 3, 2, -1), true);
    assert.equal(sc.elevation.length, 12);
    assert.equal(sc.elevation[0 * 6 + 5], 5, 'a height moves with its cell');
    assert.equal(sc.terrain[0 * 7 + 4], 1.5, 'a terrain corner moves with its corner');
    assert.equal(sc.terrainWidth, 6);
    assert.equal(sc.objects[0][1 * 6 + 2], 7);
    assert.deepEqual(sc.pieces.map(p => [p.x, p.y]), [[5, 0]], 'the floor on the cropped row goes');
    assert.deepEqual([sc.structures[0].x, sc.structures[0].y, ...sc.structures[0].spots.desk], [5, 0, 5, 0]);
    assert.deepEqual([sc.props[0].x, sc.props[0].y], [3.5, 1]);
    assert.deepEqual(sc.lights.map(l => [l.id, l.x, l.y]), [['a', 5.5, 0.5], ['torch', 0.2, 0]], 'a carried light keeps its offset');
    assert.deepEqual([sc.mediaSurfaces[0].x, sc.mediaSurfaces[0].y], [4, 0]);
    assert.deepEqual([sc.water[0].x0, sc.water[0].y0, sc.water[0].x1, sc.water[0].y1], [4, 0, 5, 0], 'a pond is cropped to the map');
    // Map Properties still sees the sidecar as the old size, so it writes it.
    assert.equal(sc.width, 4);
    E.ensure(map);
    assert.equal(sc.elevation[5], 5, 'and ensure keeps the shifted grid');
    assert.match(read('editor/src/ProjectController.js'), /mapData\.events = resized\.events;\s*\/\/[^\n]*\n\s*this\.mapElevation\(\)\?\.resizeSidecar\?\.\(mapData, oldWidth, oldHeight, offsetX, offsetY\);/);
});
