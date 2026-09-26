// The Structure workshop: a structure is built on its plot with the map's
// own Build bar, saved as the pieces, lights and screens that stand there,
// and stamped from that file anywhere, turned or not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(repoRoot, p), 'utf8');

function load() {
    const context = {
        console, window: {}, document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
        require, setTimeout, clearTimeout, module: { exports: {} }, rrEscapeHtml: text => String(text)
    };
    context.window = context;
    vm.createContext(context);
    vm.runInContext(read('editor/src/utils/MapElevation.js'), context);
    context.RRMapElevation = context.RRMapElevation || context.module.exports;
    context.module = { exports: {} };
    vm.runInContext(read('editor/src/utils/StructurePlan.js'), context);
    context.RRStructurePlan = context.RRStructurePlan || context.module.exports;
    vm.runInContext(read('editor/src/database/DatabaseStructureEditor.js') + '\n;globalThis.DatabaseStructureEditor = DatabaseStructureEditor;', context);
    vm.runInContext(read('editor/src/StructureWorkshop.js') + '\n;globalThis.StructureWorkshop = StructureWorkshop;', context);
    return context;
}

const built = () => ({
    name: 'Shed', size: [6, 4], storey: 5, height: 1,
    pieces: [
        { kind: 'floor', x: 0, y: 0, material: 'Wood' },
        { kind: 'wall', x: 5, y: 0, z: 1, rot: 1, material: 'Stone' },
        { kind: 'cylinder', x: 2, y: 3, z: 0.5, size: [2, 3, 2], angle: 30, offset: [0.25, 0] }
    ],
    lights: [{ id: 'light1', type: 'point', x: 1.5, y: 0.5, height: 96, radius: 4, color: '#ffcc88' }],
    surfaces: [{ id: 1, target: 'map', movie: 'News', x: 4.5, y: 3.52, z: 1, width: 96, height: 54, rotationY: 0 }]
});

test('a built structure is its pieces: they stamp where they stood, moved to the stamp and grouped', () => {
    const { RRStructurePlan: SP, DatabaseStructureEditor: E } = load();
    const plan = E.normalizePlan(built());
    const pieces = SP.build(plan, 10, 20, 1, 7);
    assert.equal(pieces.length, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(pieces.map(p => [p.kind, p.x, p.y, p.z, p.rot, p.group]))), [['floor', 10, 20, 0, 0, 7], ['wall', 15, 20, 1, 1, 7], ['cylinder', 12, 23, 0.5, 0, 7]]);
    assert.deepEqual([...pieces[2].size], [2, 3, 2], 'a shape keeps its size');
    assert.equal(pieces[2].angle, 30);
    const trimmed = E.trimPlan(plan);
    assert.deepEqual(Object.keys(trimmed), ['name', 'size', 'storey', 'height', 'pieces', 'lights', 'surfaces'], 'the file holds the plot and what stands on it');
    assert.equal('rot' in trimmed.pieces[0], false, 'a piece keeps only what says something');
    assert.equal(JSON.stringify(E.trimPlan(E.normalizePlan(JSON.parse(JSON.stringify(trimmed))))), JSON.stringify(trimmed), 'and reads back the same');
});

test('a turned stamp turns the pieces with the plot, and the lights and screens with them', () => {
    const { RRStructurePlan: SP, DatabaseStructureEditor: E } = load();
    const turned = SP.transform(E.normalizePlan(built()), 1);
    assert.deepEqual([...turned.size], [4, 6], 'the plot turns');
    const [floor, wall, shape] = turned.pieces;
    assert.deepEqual([floor.x, floor.y, floor.rot], [3, 0, 1], 'a cell turns a quarter clockwise, and faces round with it');
    assert.deepEqual([wall.x, wall.y, wall.rot], [3, 5, 2]);
    assert.deepEqual([shape.x, shape.y, shape.angle], [0, 2, 120], 'a shape turns by its angle');
    assert.deepEqual([...shape.offset], [-0, 0.25]);
    assert.deepEqual([turned.lights[0].x, turned.lights[0].y], [3.5, 1.5], 'a light stands where the turned plot puts it');
    assert.deepEqual([turned.surfaces[0].x, turned.surfaces[0].y, turned.surfaces[0].rotationY], [0.48, 4.5, 270], 'a screen turns and faces round');
});

test('a stamp puts the lights and screens on the map, moved and marked as the building\'s', () => {
    const { RRStructurePlan: SP, DatabaseStructureEditor: E } = load();
    const plan = E.normalizePlan(built());
    const map = { width: 30, height: 30, reactor3d: { version: 1, lights: [{ id: 'light1', x: 0, y: 0 }] } };
    SP.placeEffects(map, 4, SP.effectsOf(plan, 10, 10));
    const light = map.reactor3d.lights.find(l => l.tag === 'structure:4');
    assert.ok(light && light.id !== 'light1', 'a fresh id beside the map\'s own light');
    assert.deepEqual([light.x, light.y, light.color], [11.5, 10.5, '#ffcc88']);
    const screen = map.reactor3d.mediaSurfaces[0];
    assert.deepEqual([screen.x, screen.y, screen.structure, screen.movie], [14.5, 13.52, 4, 'News']);
    SP.removeGroupEffects(map, 4);
    assert.equal(map.reactor3d.lights.length, 1, 'taken off with the building');
});

test('the workshop plot is a 3D map of the plot holding the structure; a described one is built out into pieces', () => {
    const context = load();
    const { StructureWorkshop, DatabaseStructureEditor: E } = context;
    const shed = { id: 1, name: 'Shed', file: 'Shed.json', plan: E.normalizePlan(built()) };
    const cottage = { id: 2, name: 'Cottage', file: 'Cottage.json', plan: E.normalizePlan(JSON.parse(read('template/Demo/3d/Structures/Cottage.json'))) };
    const db = { data: { structures: [null, shed, cottage] }, getTilesets: () => [null, { id: 1 }] };
    const workshop = new StructureWorkshop({ databaseManager: db, getTilemapManager: () => ({ currentMap: { id: 5, tilesetId: 3 } }) });
    const plot = workshop.plotMap(shed);
    assert.deepEqual([plot.width, plot.height, plot.data.length, plot.tilesetId], [6, 4, 6 * 4 * 6, 3], 'the plot\'s size, on the open map\'s tileset');
    assert.equal(context.RRMapElevation.hasNote(plot), true, 'a 3D map');
    assert.equal(plot.rrWorkshop.maxLevel, 4, 'one floor of five levels');
    assert.equal(context.RRMapElevation.pieces(plot).length, 3);
    assert.equal(plot.reactor3d.lights.length, 1);
    assert.equal(plot.reactor3d.mediaSurfaces.length, 1);
    const described = workshop.plotMap(cottage);
    assert.ok(context.RRMapElevation.pieces(described).length > 50, 'the described cottage is its walls, floors and roof');
});
