const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');

function loadProjectController() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'ProjectController.js'), 'utf8');
    return vm.runInNewContext(`${source}\nProjectController;`, { console, process, require, nw: {} });
}

const ProjectController = loadProjectController();

function controller() {
    return Object.create(ProjectController.prototype);
}

// A 4x3 map whose every layer-0 cell is a distinct non-zero value, so a moved
// tile can be traced back to exactly where it came from.
function makeMap() {
    const width = 4;
    const height = 3;
    const data = new Array(width * height * 6).fill(0);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) data[y * width + x] = y * width + x + 1;
    }
    return {
        id: 7,
        width,
        height,
        data,
        events: [
            null,
            { id: 1, name: 'Sign', x: 0, y: 0, pages: [] },
            { id: 2, name: 'Chest', x: 3, y: 2, pages: [] }
        ]
    };
}

function readTile(data, width, height, x, y, layer = 0) {
    return data[layer * (width * height) + y * width + x];
}

test('anchors resolve to the offset that places existing content', () => {
    const controllerInstance = controller();
    const cases = {
        'top-left': [0, 0],
        'top': [1, 0],
        'top-right': [2, 0],
        'left': [0, 1],
        'center': [1, 1],
        'right': [2, 1],
        'bottom-left': [0, 2],
        'bottom': [1, 2],
        'bottom-right': [2, 2]
    };
    // 4x3 -> 6x5 leaves 2 columns and 2 rows of slack to distribute.
    for (const [anchor, [expectedX, expectedY]] of Object.entries(cases)) {
        const offset = controllerInstance.computeResizeOffset(4, 3, 6, 5, anchor);
        assert.deepEqual([offset.offsetX, offset.offsetY], [expectedX, expectedY], anchor);
    }

    assert.deepEqual(
        { ...controllerInstance.computeResizeOffset(4, 3, 6, 5, 'nonsense') },
        { offsetX: 0, offsetY: 0 },
        'an unknown anchor falls back to the classic top-left behavior');
});

test('growing from the bottom-right moves tiles and events together', () => {
    const controllerInstance = controller();
    const map = makeMap();
    const { offsetX, offsetY } = controllerInstance.computeResizeOffset(4, 3, 6, 5, 'bottom-right');

    const resized = controllerInstance.resizeMapData(map.data, 4, 3, 6, 5, offsetX, offsetY);
    assert.equal(resized.length, 6 * 5 * 6, 'all six planes are reallocated');
    // Old origin now sits at (2, 2); the freed upper-left is empty.
    assert.equal(readTile(resized, 6, 5, 2, 2), 1);
    assert.equal(readTile(resized, 6, 5, 5, 4), 12, 'the old bottom-right corner lands in the new corner');
    assert.equal(readTile(resized, 6, 5, 0, 0), 0);
    assert.equal(readTile(resized, 6, 5, 1, 2), 0);

    const events = controllerInstance.resizeMapEvents(map.events, 6, 5, offsetX, offsetY);
    assert.equal(events.lost.length, 0);
    assert.deepEqual([events.events[1].x, events.events[1].y], [2, 2], 'the sign rides along with its tile');
    assert.deepEqual([events.events[2].x, events.events[2].y], [5, 4]);
    assert.equal(events.events[1].name, 'Sign', 'unrelated event fields survive');
    assert.equal(events.events[0], null, 'the reserved index 0 hole is preserved');
});

test('top-left anchoring reproduces the previous behavior exactly', () => {
    const controllerInstance = controller();
    const map = makeMap();
    const withDefaults = controllerInstance.resizeMapData(map.data, 4, 3, 6, 5);
    const withExplicitAnchor = controllerInstance.resizeMapData(map.data, 4, 3, 6, 5, 0, 0);
    assert.deepEqual(withDefaults, withExplicitAnchor);
    assert.equal(readTile(withDefaults, 6, 5, 0, 0), 1, 'the origin stays put');
    assert.equal(readTile(withDefaults, 6, 5, 3, 2), 12);
});

test('shrinking reports the tiles and events it will discard', () => {
    const controllerInstance = controller();
    const map = makeMap();
    const analysis = controllerInstance.analyzeMapResize(map, 2, 2, 'top-left');

    assert.equal(analysis.resized, true);
    assert.equal(analysis.shifts, false, 'top-left shrink does not move surviving content');
    // 12 populated cells, only the 2x2 corner survives.
    assert.equal(analysis.tilesLost, 8);
    assert.equal(analysis.eventsLost.length, 1);
    assert.deepEqual(
        { id: analysis.eventsLost[0].id, x: analysis.eventsLost[0].x, y: analysis.eventsLost[0].y },
        { id: 2, x: 3, y: 2 });

    const events = controllerInstance.resizeMapEvents(map.events, 2, 2, 0, 0);
    assert.equal(events.events[2], null, 'an event outside the new bounds is removed, not stranded');
    assert.equal(events.events[1].name, 'Sign', 'events inside the new bounds are untouched');
});

test('growing loses nothing and short-circuits the tile scan', () => {
    const controllerInstance = controller();
    const map = makeMap();
    for (const anchor of Object.keys(ProjectController.MAP_RESIZE_ANCHORS)) {
        const analysis = controllerInstance.analyzeMapResize(map, 8, 8, anchor);
        assert.equal(analysis.tilesLost, 0, `${anchor} keeps every tile when growing`);
        assert.equal(analysis.eventsLost.length, 0, `${anchor} keeps every event when growing`);
    }

    // The fast path must not fire when content actually leaves the bounds.
    const shifted = controllerInstance.countTilesOutsideResize(map.data, 4, 3, 4, 3, -1, 0);
    assert.equal(shifted, 3, 'shifting left off the edge drops one column');
});

test('Set Event Location keeps pointing at the tile it named', () => {
    const controllerInstance = controller();
    const events = [
        null,
        {
            id: 1,
            pages: [{
                list: [
                    { code: 203, parameters: [1, 0, 5, 6, 2] },     // direct
                    { code: 203, parameters: [2, 1, 11, 12, 2] },   // variable IDs
                    { code: 203, parameters: [3, 2, 4, 0, 2] },     // exchange with event 4
                    { code: 201, parameters: [0, 99, 1, 1, 0, 0] }  // transfer to another map
                ]
            }]
        }
    ];

    assert.equal(controllerInstance.shiftEventLocationCommands(events, 2, 3), 1);
    const list = events[1].pages[0].list;
    assert.deepEqual(list[0].parameters, [1, 0, 7, 9, 2], 'direct coordinates move with the map');
    assert.deepEqual(list[1].parameters, [2, 1, 11, 12, 2], 'variable IDs are not coordinates');
    assert.deepEqual(list[2].parameters, [3, 2, 4, 0, 2], 'an exchange target is an event ID');
    assert.deepEqual(list[3].parameters, [0, 99, 1, 1, 0, 0], 'another map is not ours to move');

    assert.equal(controllerInstance.shiftEventLocationCommands(events, 0, 0), 0,
        'a zero offset does no work at all');
});

test('only direct transfers into this map are collected and adjusted', () => {
    const controllerInstance = controller();
    const list = [
        { code: 201, parameters: [0, 7, 4, 5, 0, 0] },   // direct, this map
        { code: 201, parameters: [1, 7, 4, 5, 0, 0] },   // variable designation
        { code: 201, parameters: [0, 8, 4, 5, 0, 0] },   // direct, different map
        { code: 202, parameters: [0, 0, 7, 2, 3] },      // vehicle, direct, this map
        { code: 202, parameters: [0, 1, 7, 2, 3] },      // vehicle, variable
        { code: 101, parameters: ['face', 0, 0, 2] }     // unrelated
    ];

    const found = controllerInstance.collectMapReferencesInList(list, 7);
    assert.equal(found.length, 2);
    // Array.from re-creates the list in this realm; the vm context has its own
    // Array prototype, which deepEqual treats as a mismatch.
    assert.deepEqual(Array.from(found, reference => reference.label),
        ['Transfer Player', 'Set Vehicle Location']);

    assert.equal(controllerInstance.applyMapReferenceOffsets(found, 2, 3), 2);
    assert.deepEqual(list[0].parameters, [0, 7, 6, 8, 0, 0]);
    assert.deepEqual(list[3].parameters, [0, 0, 7, 4, 6]);
    assert.deepEqual(list[1].parameters, [1, 7, 4, 5, 0, 0], 'variable designation is left alone');
    assert.deepEqual(list[2].parameters, [0, 8, 4, 5, 0, 0], 'other maps are left alone');
    assert.deepEqual(list[4].parameters, [0, 1, 7, 2, 3]);
    assert.deepEqual(list[5].parameters, ['face', 0, 0, 2]);
});

test('player and vehicle start positions on this map move with it', () => {
    const controllerInstance = controller();
    const system = {
        startMapId: 7, startX: 10, startY: 11,
        boat: { startMapId: 7, startX: 1, startY: 2 },
        ship: { startMapId: 9, startX: 3, startY: 4 },
        airship: { startMapId: 7, startX: 5, startY: 6 }
    };

    const found = controllerInstance.collectSystemStartReferences(system, 7);
    assert.deepEqual(Array.from(found, reference => reference.label),
        ['Player start', 'boat start', 'airship start']);

    controllerInstance.applyMapReferenceOffsets(found, -1, 4);
    assert.deepEqual([system.startX, system.startY], [9, 15]);
    assert.deepEqual([system.boat.startX, system.boat.startY], [0, 6]);
    assert.deepEqual([system.airship.startX, system.airship.startY], [4, 10]);
    assert.deepEqual([system.ship.startX, system.ship.startY], [3, 4], 'a start on another map is untouched');

    assert.equal(controllerInstance.collectSystemStartReferences(null, 7).length, 0);
});

test('a resize refits and writes the 3D sidecar before the map reloads from disk', () => {
    const elevationSource = fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'MapElevation.js'), 'utf8');
    const context = {}; context.window = context;
    vm.runInNewContext(elevationSource, context);
    const elevation = context.RRMapElevation;
    const pc = controller();
    const map = { id: 7, width: 4, height: 3, data: [], events: [], reactor3d: { version: 1, mode: '3d', width: 4, height: 3,
        elevation: [0, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0], terrain: new Array(20).fill(0), terrainWidth: 4, room: { height: 4, sky: 'Sky-01', skyScrollX: 0.5 } } };
    map.reactor3d.terrain[1 * 5 + 1] = 2;
    pc.currentEditingMap = map;
    pc.isCreatingNewMap = false;
    pc.mapElevation = () => elevation;
    pc.readMap3DCameraForm = () => null;
    let written = 0;
    pc.tilemapManager = { currentMap: map, saveMapSidecar: () => { written++; return true; } };
    // Map Properties grew the map to 6x5 and left the room alone.
    const changed = pc.saveMap3DSettings({ id: 7, width: 6, height: 5 }, map.reactor3d.room, true);
    assert.equal(changed, true, 'a size change is a sidecar change');
    assert.equal(written, 1, 'written before the reload can read the old file back');
    assert.equal(map.reactor3d.width, 6); assert.equal(map.reactor3d.height, 5);
    assert.equal(map.reactor3d.elevation.length, 30);
    assert.equal(map.reactor3d.elevation[1 * 6 + 1], 5, 'a height stays on its cell');
    assert.equal(map.reactor3d.terrain.length, 7 * 6);
    assert.equal(map.reactor3d.terrain[1 * 7 + 1], 2, 'a hill stays on its corner');
    assert.equal(map.reactor3d.terrainWidth, 6);
    assert.equal(map.reactor3d.room.skyScrollX, 0.5, 'the room is untouched');
    // Same size again: nothing to write.
    assert.equal(pc.saveMap3DSettings({ id: 7, width: 6, height: 5 }, map.reactor3d.room, true), false);
    assert.equal(written, 1);
    // A map with no sidecar gains none from a resize.
    const flat = { id: 8, width: 4, height: 3, data: [], events: [] };
    pc.currentEditingMap = flat; pc.tilemapManager.currentMap = flat;
    assert.equal(pc.saveMap3DSettings({ id: 8, width: 6, height: 5 }, { height: 4 }, false), false);
    assert.equal(flat.reactor3d, undefined);
    // A sidecar read at the wrong size is refitted as the map loads.
    const tilemap = fs.readFileSync(path.join(editorRoot, 'src', 'TilemapManager.js'), 'utf8');
    assert.match(tilemap, /\(Number\(sidecar\.width\) !== mapData\.width \|\| Number\(sidecar\.height\) !== mapData\.height\)\) \{\s*elevation\.ensure\(mapData\);/);
});
