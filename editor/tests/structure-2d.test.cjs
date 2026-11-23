'use strict';
// 2D structures (src/utils/Structure2D.js, docs/DESIGN-2D-STRUCTURES.md): the record's fields, each cell's
// passability (marks first, then the tiles' own flags), and placed structures as objects of the map from which what
// the game reads is made again, so a structure changed in the Database changes on every map it stands on.
const assert = require('node:assert/strict');
const test = require('node:test');

const S = require('../src/utils/Structure2D.js');

test('a 2D plan keeps its layers, marks and bake; nonsense is dropped', () => {
    const plan = S.normalize({ name: 'Inn', size: [3, 2], layers: [
        { kind: 'tiles', tilesetId: 2, tiles: [1, 2, 3] },
        { kind: 'picture', picture: 'Sign.png', at: [10, '20'], opacity: 999 },
        { kind: 'script', code: 'x' }, 'nope'
    ], passage: { '0,0': 'X', '2,1': '*', '9,9': 'O', '1,1': 'Z' }, baked: { below: 'structures/Inn-ab-below', over: '../evil', cells: { '0,0': 2, '1,0': 3 } } });
    assert.equal(plan.dimension, '2d');
    assert.equal(plan.layers.length, 2, 'only tile and picture layers');
    assert.equal(plan.layers[0].tiles.length, 3 * 2 * 6);
    assert.deepEqual(plan.layers[0].tiles.slice(0, 4), [1, 2, 3, 0]);
    assert.deepEqual(plan.layers[1], { kind: 'picture', name: 'Layer 2', picture: 'Sign', at: [10, 20], opacity: 255 });
    assert.deepEqual(plan.passage, { '0,0': 'X', '2,1': '*' }, 'marks on the plot, of the three kinds');
    assert.deepEqual(plan.baked, { below: 'structures/Inn-ab-below', over: '', cells: { '0,0': 2 } }, 'a picture name cannot leave its folder');
    const fields = S.trim(plan, {});
    assert.deepEqual(Object.keys(fields), ['dimension', 'layers', 'passage', 'baked']);
});

test('each cell\'s passability: its mark, else the top tile that decides by its own tileset\'s flags, else nothing', () => {
    const plan = S.newPlan('Hut', 4, 1, 1);
    const W = 4, H = 1, at = (z, x) => z * W * H + x;
    const tiles = plan.layers[0].tiles;
    tiles[at(0, 0)] = 10;               // ground, open
    tiles[at(0, 1)] = 10; tiles[at(1, 1)] = 20;   // a wall over ground: blocked
    tiles[at(0, 2)] = 10; tiles[at(3, 2)] = 30;   // a ☆ roof over ground: the ground decides
    // Cell 3: nothing at all.
    const flags = { 1: { 10: 0x00, 20: 0x0f, 30: 0x1f } };
    assert.deepEqual(S.cells(plan, id => flags[id]), { '0,0': 1, '1,0': 2, '2,0': 1 });
    plan.passage['1,0'] = '*'; plan.passage['0,0'] = 'X'; plan.passage['3,0'] = 'O';
    assert.deepEqual(S.cells(plan, id => flags[id]), { '0,0': 2, '1,0': 1, '2,0': 1, '3,0': 1 }, 'a mark decides');
    // A second tile layer of another tileset lies over the first.
    plan.passage = {};
    plan.layers.push({ kind: 'tiles', name: 'Upper', tilesetId: 2, tiles: S.emptyTiles(W, H) });
    plan.layers[1].tiles[at(0, 0)] = 5;
    flags[2] = { 5: 0x0f };
    assert.equal(S.cells(plan, id => flags[id])['0,0'], 2, 'the upper layer\'s tile decides');
});

test('resizing keeps the tiles from the top-left corner and drops marks outside', () => {
    const plan = S.newPlan('Wall', 3, 3, 1);
    plan.layers[0].tiles[1 * 3 + 2] = 7;   // x 2, y 1
    plan.passage['2,2'] = 'X'; plan.passage['0,0'] = 'O';
    S.resize(plan, 2, 4);
    assert.equal(plan.layers[0].tiles.length, 2 * 4 * 6);
    assert.equal(plan.layers[0].tiles.filter(Boolean).length, 0, 'x 2 is off a plot two wide');
    assert.deepEqual(plan.passage, { '0,0': 'O' });
    S.resize(plan, 3, 3);
    assert.deepEqual(plan.size, [3, 3]);
});

test('a placed structure is the map\'s object; what the game reads follows the structure as it is now', () => {
    const map = { width: 10, height: 8, rrImageLayers: [{ name: 'Fog', layer: 'over' }], reactor3d: { version: 1, mediaSurfaces: [{ id: 4, x: 0, y: 0 }] } };
    const plans = { 'Inn.json': S.normalize({ name: 'Inn', size: [2, 2], layers: [], surfaces: [{ x: 6, y: 6 }],
        baked: { below: 'structures/Inn-1-below', over: 'structures/Inn-1-over', cells: { '0,0': 2, '1,1': 1 } } }) };
    const planOf = file => plans[file] || null;
    const row = S.add(map, 'Inn.json', 3, 4);
    assert.equal(S.apply(map, planOf), true);
    assert.deepEqual(map.rrImageLayers.map(l => [l.name, l.layer, l.fit, l.at && l.at.join(','), l.structure2d]), [
        ['Fog', 'over', undefined, undefined, undefined],
        ['structures/Inn-1-below', 'ground', 'place', '3,4', row.id],
        ['structures/Inn-1-over', 'over', 'place', '3,4', row.id]]);
    assert.deepEqual(map.rrPassage, { '3,4': 2, '4,5': 1 });
    assert.deepEqual(map.reactor3d.mediaSurfaces.map(s => [s.id, s.x, s.y, s.structure2d]), [[4, 0, 0, undefined], [5, 6 + 3, 6 + 4, row.id]], 'a map surface\'s x and y are tiles: moved by the placement\'s tile');
    assert.equal(S.apply(map, planOf), false, 'applying again changes nothing');
    // The structure changes in the Database: its passability and its pictures. The map follows.
    plans['Inn.json'].baked = { below: 'structures/Inn-2-below', over: '', cells: { '1,0': 2 } };
    assert.equal(S.apply(map, planOf), true);
    assert.deepEqual(map.rrImageLayers.map(l => l.name), ['Fog', 'structures/Inn-2-below']);
    assert.deepEqual(map.rrPassage, { '4,4': 2 });
    assert.deepEqual(S.at(map, 4, 5, planOf), row, 'found by any tile of its footprint');
    assert.equal(S.at(map, 5, 5, planOf), null);
    // Removed: only the map's own layers and surfaces stay.
    S.remove(map, row.id);
    S.apply(map, planOf);
    assert.deepEqual(map.rrImageLayers, [{ name: 'Fog', layer: 'over' }]);
    assert.equal(map.rrPassage, undefined);
    assert.deepEqual(map.reactor3d.mediaSurfaces, [{ id: 4, x: 0, y: 0 }]);
    assert.equal(map.rrStructures2D, undefined);
});

test('a cell blocked on some sides: its mark (dN), or a tile blocked on some sides, is placed as 16 + those sides', () => {
    const S2 = S;
    assert.equal(S2.edgeMark(0), 'O');
    assert.equal(S2.edgeMark(15), 'X');
    assert.equal(S2.edgeMark(8 | 2), 'd10');
    assert.deepEqual(['X', 'O', '*', 'd10', 'd0', 'd15', 'zz', undefined].map(S2.markBits), [15, 0, 0, 10, null, null, null, null]);
    const plan = S2.normalize({ name: 'Gate', size: [3, 1], layers: [{ kind: 'tiles', tilesetId: 1, tiles: [] }],
        passage: { '0,0': 'd8', '1,0': 'd15', '2,0': 'd3' }, baked: { cells: { '0,0': 24, '1,0': 31, '2,0': 2 } } });
    assert.deepEqual(plan.passage, { '0,0': 'd8', '2,0': 'd3' }, 'd1 to d14 kept; d15 is X, not a dN');
    assert.deepEqual(plan.baked.cells, { '0,0': 24, '2,0': 2 }, 'placed values 1, 2 and 17 to 30');
    // A tile blocked only on its top keeps that, where it counted as open.
    const W = 3, tiles = plan.layers[0].tiles;
    tiles[1] = 40;
    plan.passage = { '0,0': 'd8' };
    assert.deepEqual(S2.cells(plan, () => ({ 40: 0x08 })), { '0,0': 24, '1,0': 24 });
    assert.equal(W, 3);
});
