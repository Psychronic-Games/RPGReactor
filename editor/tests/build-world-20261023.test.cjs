'use strict';
// The world builder's fixes approved on 2026-10-23: a Roof box fills, the hint names Build's own keys and a
// right-drag turns the view, a stair whose foot faces a wall and models pushed off a stamped plot are said,
// Lower leaves banks that are walked into, Escape in an empty Select leaves Build, the view cuts at a storey,
// and the room and the sky are set on the map.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
global.Reactor3D = R;

/** The builder on one map, in a realm of its own; `flashes` are what it said over the bar. */
function builderOn(map, extra = {}) {
    const flashes = [];
    const context = Object.assign({ console, JSON, Math, Object, Array, Number, String, Set, Map,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
        CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } }, extra);
    context.window = context;
    context.reactor = { buildHotbar: { visible: true, flash: text => flashes.push(text), hide() { this.visible = false; this.hidden = true; } } };
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js') + '\nwindow.PieceBuilderManager = PieceBuilderManager;', context);
    const manager = new context.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }) });
    manager.announce = () => {};
    return { manager, flashes, E: context.RRMapElevation, context };
}

test('a Roof dragged as a box fills it, as a floor does; a wall still lines its edge', () => {
    const map = { id: 1, width: 10, height: 10, reactor3d: { version: 1 } };
    const { manager, E } = builderOn(map);
    manager.setKind('roof');
    manager.beginStroke({ x: 1, y: 1, z: 5 }, undefined, { rectangle: true });
    manager.paintAt({ x: 4, y: 3, z: 5 }, { rectangle: true });
    manager.endStroke();
    assert.equal(E.pieces(map).filter(p => p.kind === 'roof').length, 12, 'four by three, every cell');
    assert.ok(E.pieceAt(map, 2, 2, 5), 'the inside is roofed');
    manager.setKind('wall');
    manager.beginStroke({ x: 1, y: 5, z: 0 }, undefined, { rectangle: true });
    manager.paintAt({ x: 4, y: 7, z: 0 }, { rectangle: true });
    manager.endStroke();
    assert.equal(E.pieces(map).filter(p => p.kind === 'wall').length, 10, 'walls ring the box');
});

test('the Build hint names the keys Build binds, and a right-drag turns the view while building', () => {
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    const hint = BuildHotbar.KEYS_HINT;
    assert.doesNotMatch(hint, /\[ \]/, 'the brackets size a shape only; its own panel says so');
    for (const words of ['right-click removes', 'right-drag turns the view', 'R turns the piece', 'Q/E level', 'Ctrl-drag a box']) assert.ok(hint.includes(words), words);
    const keys = read('editor/src/PieceBuilderManager.js');
    assert.match(keys, /else if \(key === 'e'\) \{ event\.preventDefault\(\); this\.setLevel\(this\.level \+ 1\); \}/);
    assert.match(keys, /else if \(key === 'q'\) \{ event\.preventDefault\(\); this\.setLevel\(this\.level - 1\); \}/);
    const view = read('editor/src/MapEditor3D.js');
    // Q and E taken for the level do not also fly the camera up and down.
    assert.match(view, /if \(event\.defaultPrevented && this\.canEditPieces\(\)\) return;/);
    // The right button turns (orbits) instead of moving the view; Shift or the middle button still moves it.
    assert.match(view, /const turn = event\.button === 2 && !event\.shiftKey && !event\.ctrlKey && !event\.altKey && this\.canEditPieces\(\);/);
    assert.match(view, /pan: \(event\.button !== 0 \|\| event\.shiftKey\) && !turn,/);
    // A right-click still takes a piece off (or opens Select's menu), once the button is let go without a drag.
    assert.match(view, /if \(drag && drag\.turn\) \{ drag\.rightClick = \{ x: event\.clientX, y: event\.clientY \}; return; \}/);
    assert.match(view, /if \(drag\.rightClick && still\) this\.pieceRightClick\(drag\.rightClick\.x, drag\.rightClick\.y\);/);
});

test('a stair laid or turned with its foot against a wall is said; one with room in front is not', () => {
    const map = { id: 1, width: 10, height: 10, reactor3d: { version: 1 } };
    const { manager, flashes, E } = builderOn(map);
    // A stair rot 0 climbs south: its foot is the cell north of it.
    E.setPiece(map, { kind: 'wall', x: 4, y: 3, z: 0, rot: 0, material: '' });
    manager.setKind('stair');
    manager.rot = 0;
    manager.beginStroke({ x: 4, y: 4, z: 0 }); manager.endStroke();
    assert.equal(flashes.length, 1);
    assert.match(flashes[0], /foot faces a wall/);
    // Turned to climb north, the foot is south of it and open: nothing to say.
    manager.setMode('select');
    manager.selected = E.pieceAt(map, 4, 4, 0).id;
    manager.turnSelected(2);
    assert.equal(flashes.length, 1);
    assert.equal(manager.stairFootBlocked(E.pieceAt(map, 4, 4, 0)), false);
    // Turned back, it is said again.
    manager.turnSelected(2);
    assert.equal(flashes.length, 2);
    // At the map's edge the foot is off the map.
    assert.equal(manager.stairFootBlocked({ kind: 'stair', x: 0, y: 0, z: 0, rot: 0 }), true);
});

test('stamping a structure where models stand says how many were moved off the plot', () => {
    const map = { width: 40, height: 40, reactor3d: { version: 1 } };
    const { manager, flashes, E } = builderOn(map);
    const plan = JSON.parse(read('template/Demo/3d/Structures/Cottage.json'));
    Object.assign(manager, { structures: () => [{ file: 'Cottage.json', name: 'Cottage', plan }], structure: 'Cottage.json' });
    E.addProp(map, { name: 'Tree', file: 'Tree', ext: '.glb', x: 5.5, y: 5.5, size: 1, scale: 1 });
    E.addProp(map, { name: 'Rock', file: 'Rock', ext: '.glb', x: 6.5, y: 6.5, size: 1, scale: 1 });
    E.addProp(map, { name: 'Far', file: 'Far', ext: '.glb', x: 38.5, y: 38.5, size: 1, scale: 1 });
    assert.equal(manager.stampAt(2, 3), true);
    assert.deepEqual(flashes, ['Models moved off the plot: 2.']);
    // Nothing in the way: nothing said.
    const clear = { width: 40, height: 40, reactor3d: { version: 1 } };
    const second = builderOn(clear);
    Object.assign(second.manager, { structures: () => [{ file: 'Cottage.json', name: 'Cottage', plan }], structure: 'Cottage.json' });
    assert.equal(second.manager.stampAt(2, 3), true);
    assert.deepEqual(second.flashes, []);
});

test('four Lower passes leave a pit whose banks are walked into and out of', () => {
    const context = {}; context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    const E = context.RRMapElevation;
    const W = 24, H = 24;
    const map = { id: 1, width: W, height: H, reactor3d: { version: 1, elevation: new Array(W * H).fill(0) } };
    // The brush as the panel starts it, four strokes across the same place.
    for (let pass = 0; pass < 4; pass++) for (let i = 0; i < 12; i++) E.paintTerrain(map, 12, 9 + i * 0.5, { mode: 'lower', radius: 3, strength: 0.5 });
    const grid = E.terrain(map), stride = W + 1;
    assert.ok(Math.min(...grid) < -1.2, 'the pit is dug');
    assert.ok(E.LOWER_BANK_SLOPE <= R.TERRAIN_SLOPE_LIMIT, 'no steeper than a walk takes');
    for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) assert.ok(Math.abs(grid[y * stride + x] - grid[y * stride + x + 1]) <= E.LOWER_BANK_SLOPE + 1e-9);
    // Walked in from every side by the game's own rule, and out again.
    const deepest = grid.indexOf(Math.min(...grid)), cx = deepest % stride, cy = Math.floor(deepest / stride);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let x = cx + dx * 8, y = cy + dy * 8;
        while (x !== cx || y !== cy) {
            const nx = x - dx, ny = y - dy;
            assert.equal(R.terrainBlocks(map, x, y, nx, ny), false, `in at ${x},${y}`);
            assert.equal(R.terrainBlocks(map, nx, ny, x, y), false, `out at ${nx},${ny}`);
            x = nx; y = ny;
        }
    }
    // Raise is untouched: a hill stays as steep as it is drawn.
    E.paintTerrain(map, 4, 4, { mode: 'raise', radius: 1, strength: 4 });
    assert.equal(E.terrainAt(map, 4, 4), 4);
});

test('Escape in Select with nothing selected leaves Build; with a selection it lets go first', () => {
    const map = { id: 1, width: 10, height: 10, reactor3d: { version: 1 } };
    const { manager, E, context } = builderOn(map);
    manager.active = true;
    manager.setMode('select');
    E.setPiece(map, { kind: 'block', x: 1, y: 1, z: 0, rot: 0, material: '' });
    manager.selected = E.pieceAt(map, 1, 1, 0).id;
    const escape = () => manager.handleKey({ key: 'Escape', target: null, preventDefault() {} });
    escape();
    assert.equal(manager.selected, 0, 'the selection goes first');
    assert.equal(context.reactor.buildHotbar.visible, true);
    escape();
    assert.equal(context.reactor.buildHotbar.hidden, true, 'then Build is left');
    // Another mode still goes back to placing.
    context.reactor.buildHotbar = { visible: true, flash() {}, hide() { this.hidden = true; } };
    manager.setMode('erase');
    escape();
    assert.equal(manager.mode, 'place');
    assert.equal(context.reactor.buildHotbar.hidden, undefined);
});

test('the view cut at a storey: storeys counted from the pieces, a plane under the storey top, picks pass through what is cut', () => {
    const MapEditor3D = require(path.join(repoRoot, 'editor/src/MapEditor3D.js'));
    const map = { id: 1, width: 10, height: 10, reactor3d: { version: 1, pieces: [
        { id: 1, kind: 'wall', x: 1, y: 1, z: 0, rot: 0 }, { id: 2, kind: 'wall', x: 1, y: 1, z: 5, rot: 0 }, { id: 3, kind: 'roof', x: 1, y: 1, z: 10, rot: 0 }] } };
    assert.equal(MapEditor3D.storeyCount(map), 3, 'two storeys of wall and a roof over them');
    assert.equal(MapEditor3D.storeyCount({ reactor3d: {} }), 1);
    const view = Object.create(MapEditor3D.prototype);
    view.storeyCut = 0;
    view.currentMap = () => map;
    assert.equal(view.storeyCutTop(), 1e9, 'all storeys: no cut');
    view.storeyCut = 1; view._storeyCutBase = 0;
    assert.equal(view.storeyCutTop(), R.PIECE_STOREY - R.CUTAWAY_DROP, 'under the first storey\'s top, as the game cuts');
    assert.equal(view.cutAway({ point: { y: 6 }, object: { userData: { pieces: true } } }), true, 'a roof over the cut is passed through');
    assert.equal(view.cutAway({ point: { y: 2 }, object: { userData: { pieces: true } } }), false);
    assert.equal(view.cutAway({ point: { y: 6 }, object: { userData: {} } }), false, 'the ground is never cut');
    const source = read('editor/src/MapEditor3D.js');
    // Only this view's frame wears the cut: the shared values are put back after it.
    assert.match(source, /const cut = this\.applyStoreyCut\(\);\s*try \{\s*this\.renderFrame\(scene\);\s*\} finally \{\s*scene\.matrixWorldAutoUpdate = matrixAuto;\s*if \(cut\) \{ cut\.uniforms\.rrCutTop\.value = cut\.top; cut\.uniforms\.rrCutBox\.value = cut\.box; \}/);
    assert.match(read('editor/index.html'), /<select id="map-storey-cut" aria-label="Storeys">/);
    // Build's level moves the cut with it.
    assert.match(read('editor/src/PieceBuilderManager.js'), /if \(view\?\.storeyCut > 0 && view\.setStoreyCut\) view\.setStoreyCut\(Math\.floor\(this\.level \/ S\) \+ 1, 'keep'\);/);
});

test('the room and the sky are set on the map: live, one undo step each, and Map Properties has no field for them', () => {
    const events = [];
    const context = { console, JSON, Math, Object, Array, Number, String, Set, Map, Date, Uint8Array, Float32Array, Reactor3D: R, setTimeout, clearTimeout,
        document: { readyState: 'complete', getElementById: () => null, addEventListener() {}, removeEventListener() {}, dispatchEvent(event) { events.push(event); } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
    context.window = context;
    for (const file of ['utils/MapElevation.js', 'utils/MapFoliage.js', 'utils/MapGround.js', 'utils/MapEdges.js', 'TerrainManager.js']) vm.runInNewContext(read('editor/src/' + file), context);
    const map = { id: 3, width: 8, height: 8, note: '<3d>', data: [], reactor3d: { version: 1, mode: '3d', room: { height: 4, floor: '!Grass-01', sky: 'Sky-01', skyScrollX: 0.1 } } };
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    // A drift slider dragged: live on the view, one step when let go.
    terrain.setRoomLook({ skyScrollX: 0.5 }, 'live');
    terrain.setRoomLook({ skyScrollX: 1 }, 'live');
    assert.equal(map.reactor3d.room.skyScrollX, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(events.map(e => e.detail))), [{ mapId: 3, room: true, drift: true }, { mapId: 3, room: true, drift: true }], 'the drift alone: the dome changes as it stands');
    assert.equal(terrain.setRoomLook({}, 'commit'), true);
    assert.equal(terrain.undoStack.length, 1);
    // A picture picked: the view builds again.
    events.length = 0;
    assert.equal(terrain.setRoomLook({ walls: 'Wall-01' }), true);
    assert.equal(events[0].detail.drift, false);
    assert.equal(map.reactor3d.room.walls, 'Wall-01');
    terrain.undo();
    assert.equal(map.reactor3d.room.walls, '');
    terrain.undo();
    assert.equal(map.reactor3d.room.skyScrollX, 0.1);
    terrain.redo();
    assert.equal(map.reactor3d.room.skyScrollX, 1);
    // Not on a 2D map.
    const flat = { id: 4, width: 8, height: 8, data: [] };
    const other = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: flat }) });
    assert.equal(other.setRoomLook({ sky: 'Sky-01' }), false);
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    assert.deepEqual(BuildHotbar.TERRAIN.slice(-3), ['biome', 'sky', 'surround']);
    assert.equal(BuildHotbar.TERRAIN_MODE.sky, 'sky');
    const html = read('editor/index.html');
    assert.doesNotMatch(html, /id="map-3d-(height-input|floor-select|walls-select|ceiling-select|sky-select|sky-sx-input|sky-sy-input)"/);
});

test('the layout trims: Lighting and Media Surfaces leave the toolbar, an idle Models Select shows its hint, folds where asked', () => {
    const html = read('editor/index.html');
    assert.doesNotMatch(html, /class="tool-button" data-action="(lighting-tool|media-surfaces)"/);
    assert.match(html, /class="html-menu-option" data-action="lighting-tool"/);
    assert.match(html, /class="html-menu-option" data-action="media-surfaces"/);
    const props = read('editor/src/ModelPropsManager.js');
    assert.match(props, /const idle = this\.tool === 'select' && !shown;/);
    assert.match(read('editor/css/styles.css'), /\.mp-panel\.is-select-idle > :not\(\.mp-select-hint\) \{ display: none; \}/);
    const media = read('editor/src/event/commands/MediaSurfaceEditor.js');
    assert.match(media, /this\._section\(parent, 'Binding & Position', 'binding'\)/);
    assert.match(media, /this\._section\(parent, '3D World Transform', 'transform'\)/);
    const picker = read('editor/src/event/ModelGraphicPicker.js');
    assert.match(picker, /<details class="model-face-advanced"[\s\S]{0,900}model-face-btn" data-face="front"/, 'the front marks are under Advanced');
});

test('a neighbor\'s events by the shared side stand before the crossing, and the map entered keeps only those that match', () => {
    const N = R.Neighbors;
    const events = [null,
        { id: 1, name: 'Tank', x: 165, y: 95 },     // 34 tiles from North Haven's east side
        { id: 2, name: 'Rider', x: 21, y: 16 },     // far from it
        { id: 3, name: 'Sign', x: 190, y: 40 }];    // near, but no model
    const map = { width: 200, height: 200, events };
    const made = [];
    const savedEvent = global.Game_Event, savedSpec = R.characterModelSpec, savedVehicles = global.ReactorVehicles;
    global.Game_Event = class { constructor(mapId, id) { this._mapId = mapId; this._eventId = id; made.push(id); } eventId() { return this._eventId; } };
    global.ReactorVehicles = { addVisitingVehicles: mapId => { events[4] = { id: 4, name: 'Motorcycle', x: 199, y: 60 }; return mapId; } };
    R.characterModelSpec = character => (character._eventId === 3 ? null : { name: 'M' + character._eventId, ext: '.glb', file: 'm' });
    try {
        // North Haven stands west of the map played: its east side is the one shared.
        const body = { side: 'west', mapId: 5, record: { map }, scene: { _neighborGlobals: null } };
        const ahead = N.aheadEvents(body);
        assert.deepEqual(ahead.map(c => c.eventId()), [1, 4], 'the tank and the parked vehicle; not the far rider, not the sign with no model');
        assert.ok(!made.includes(2), 'nothing is made for an event out of reach');
        N.aheadEvents(body);
        assert.equal(events.filter(Boolean).length, 4, 'the vehicles are added once');
        // Entered: a model is kept where the map's own event wears it, and goes where it does not.
        const removed = [];
        const holder = spec => ({ ahead: true, spec, object: { parent: { remove: () => removed.push(spec) } } });
        const held = new Map([['e1', holder(R.modelCacheKey('M1', '.glb', 'm'))], ['e4', holder(R.modelCacheKey('Old', '.glb', 'm'))], ['p', { spec: 'party' }]]);
        const savedMap = global.$gameMap;
        global.$gameMap = { event: id => (id === 1 || id === 4 ? { _eventId: id } : null) };
        try { N.keepAhead({ _modelInstances: held }); } finally { global.$gameMap = savedMap; }
        assert.deepEqual([...held.keys()], ['e1', 'p']);
        assert.equal(held.get('e1').ahead, false, 'kept, and the map\'s own from here');
        assert.equal(removed.length, 1);
    } finally {
        global.Game_Event = savedEvent; R.characterModelSpec = savedSpec; global.ReactorVehicles = savedVehicles;
    }
    const surround = read('runtime/reactor_3d_surround.js');
    assert.match(surround, /N\.carryParty\(old\.scene, scene, cross\.ride, riding && riding\.id \? "e" \+ riding\.id : null, convoy\);\s*N\.keepAhead\(scene\);/);
    assert.match(surround, /if \(depth === 1 && !body\.ahead && body\.record && body\.record\.state === "ready" && N\.upkeep\(frame\)\) \{/, 'beside the map played only, once');
    assert.match(read('runtime/reactor_vehicles.js'), /V\.addVisitingVehicles = mapId => visitingVehicles\(\{ _mapId: mapId \}\);/);
});

test('a 2D map shows its neighbor past the edge: the view goes half a screen past a side with one, the ground drawn there', () => {
    const objects = read('runtime/reactor_objects_map.js');
    // The view's limits on each side take the reach; a side with no neighbor keeps the edge.
    assert.match(objects, /x\.clamp\(0 - this\.reactorEdgeReach\("west"\), endX \+ this\.reactorEdgeReach\("east"\)\)/);
    assert.match(objects, /y\.clamp\(0 - this\.reactorEdgeReach\("north"\), endY \+ this\.reactorEdgeReach\("south"\)\)/);
    for (const side of ['west', 'east', 'north', 'south']) assert.ok(objects.split(`this.reactorEdgeReach("${side}")`).length >= 3, side + ' in its scroll too');
    // Worked out once a map, off the Game_Map (which is saved), and nothing on a 3D map.
    assert.match(objects, /known = Game_Map\._rrEdgeSides \|\| \(Game_Map\._rrEdgeSides = \{ map: undefined \}\);/);
    assert.match(objects, /!\(R\.shouldRender3D && R\.shouldRender3D\(data\)\)/);
    const sprites = read('runtime/reactor_sprites.js');
    assert.match(sprites, /Spriteset_Map\.prototype\.updateTilemap = function\(\) \{\s*this\._tilemap\.origin\.x = \$gameMap\.displayX\(\) \* \$gameMap\.tileWidth\(\);\s*this\._tilemap\.origin\.y = \$gameMap\.displayY\(\) \* \$gameMap\.tileHeight\(\);\s*this\.updateNeighborTilemaps\(\);/);
    assert.match(sprites, /entry\.tilemap\.origin\.x = \(dx - entry\.offset\.x\) \* tw;/);
    assert.match(sprites, /this\._baseSprite\.addChildAt\(tilemap, index < 0 \? this\._baseSprite\.children\.length : index\);/, 'under the map\'s own ground');
});
