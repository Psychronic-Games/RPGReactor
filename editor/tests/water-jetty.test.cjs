// A jetty in a lake: what stands up through the water (posts, a deck, a moored
// boat) is not the lake's bed, so the water round it keeps its depth instead of
// fading to a clear hole, and thin posts never dry the cells they stand in.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.resolve(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.resolve(repoRoot, 'runtime/libs/three.js'));
const R = require(path.resolve(repoRoot, 'runtime/reactor_3d.js'));
function loadElevation() { const context = { Reactor3D: R }; context.window = context; vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context); return context.RRMapElevation; }

// A 12×12 map whose middle is a hollow 6 deep, a lake over it at -1.5, and a jetty from the east bank:
// posts from the bed up to a deck standing just over the water, and a boat moored beside it.
function jettyMap() {
    const W = 12, H = 12, terrain = [];
    for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) terrain.push(x >= 2 && x <= 10 && y >= 2 && y <= 10 ? -6 : 0);
    const pieces = [];
    let id = 1;
    for (let x = 4; x <= 9; x++) pieces.push({ id: id++, kind: 'box', x, y: 6, z: 5.3, rot: 0, material: 'Wood', size: [1.02, 0.25, 2.4] });
    for (const x of [4, 7]) for (const y of [5, 7]) pieces.push({ id: id++, kind: 'cylinder', x, y, z: 0, rot: 0, material: 'Wood', size: [0.35, 5.5, 0.35] });
    pieces.push({ id: id++, kind: 'hull', x: 6, y: 8, z: 4.6, rot: 0, material: 'Wood', size: [1.7, 0.75, 3], angle: 90 });
    // A slab lying on the bed (sunken paving) and a wall standing up out of the water.
    pieces.push({ id: id++, kind: 'floor', x: 3, y: 3, z: 0, rot: 0, material: 'Stone' });
    pieces.push({ id: id++, kind: 'wall', x: 3, y: 9, z: 0, rot: 0, material: 'Stone' });
    return { id: 1, width: W, height: H, events: [null], reactor3d: { version: 1, terrain, terrainWidth: W, pieces, water: [{ x0: 2, y0: 2, x1: 9, y1: 9, level: -1.5, material: 'Water' }] } };
}

test('the water\'s bed is the ground and what lies under the surface, never what stands up through it', () => {
    const map = jettyMap();
    const deckCell = [6.5, 6.5], postCell = [4.5, 5.5], boatCell = [6.5, 8.5];
    assert.ok(R.groundHeightAt(map, ...deckCell, 0) > -1.5, 'standing, the deck is the ground (above the water)');
    assert.equal(R.waterBedAt(map, ...deckCell, -1.5), -6, 'under the deck the bed is the lake bottom');
    assert.equal(R.waterBedAt(map, ...postCell, -1.5), -6, 'a post rising through the surface is not the bed');
    assert.equal(R.waterBedAt(map, ...boatCell, -1.5), -6, 'nor is a moored boat');
    assert.ok(Math.abs(R.waterBedAt(map, 3.5, 3.5, -1.5) - (-6 + R.pieceTop({ kind: 'floor', z: 0 }, 0.5, 0.5))) < 1e-9, 'a slab lying under the water raises the bed');
    assert.equal(R.waterBedAt(map, 3.5, 9.5, -1.5), -6, 'a wall standing up out of the water does not');
});

test('a lake keeps its depth round a jetty and a boat: no corner fades out as though it were shore', () => {
    const map = jettyMap();
    const region = R.waterOf(map)[0];
    const geometry = R.waterGeometry(region, map);
    const pos = geometry.attributes.position.array, depth = geometry.attributes.rrDepth.array;
    const at = (x, z) => { for (let i = 0; i < depth.length; i++) if (pos[i * 3] === x && pos[i * 3 + 2] === z) return depth[i]; return null; };
    for (const [x, z] of [[5, 6], [6, 7], [8, 6], [4, 5], [7, 8], [6, 9]]) assert.ok(at(x, z) > 4, `the corner at ${x},${z} beside the jetty stands deep (${at(x, z)})`);
    geometry.dispose();
});

test('thin posts and stilts let the water stand round them; a post as wide as its cell still holds', () => {
    const E = loadElevation();
    const map = jettyMap();
    map.reactor3d.pieces = map.reactor3d.pieces.filter(piece => piece.kind !== 'wall');
    const walls = E.waterWalls(map);
    for (const [x, y] of [[4, 5], [4, 7], [7, 5], [7, 7]]) assert.equal(walls ? walls.get(y * 12 + x) || 0 : 0, 0, `the post at ${x},${y} holds no water`);
    assert.equal(E.refitWater(map), false, 'a refit round the jetty leaves the lake as it is');
    assert.ok(E.water(map)[0].mask === undefined || [[4, 5], [7, 7]].every(([x, y]) => E.waterCovers(E.water(map)[0], x, y)), 'the post cells stay wet');
    // A pier as wide as its cell, standing up out of the water, is a wall: its cell is dry.
    map.reactor3d.pieces = map.reactor3d.pieces.concat([{ id: 99, kind: 'box', x: 8, y: 3, z: 0, rot: 0, material: 'Stone', size: [1, 7, 1] }]);
    assert.equal(E.refitWater(map), true);
    assert.equal(E.waterCovers(E.water(map)[0], 8, 3), false, 'the full pier dries its own cell');
    assert.ok(E.waterCovers(E.water(map)[0], 8, 4) && E.waterCovers(E.water(map)[0], 7, 3), 'and only that');
});
