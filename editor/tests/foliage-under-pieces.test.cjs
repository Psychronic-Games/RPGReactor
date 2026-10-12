'use strict';
// A building laid over foliage takes what grew there with it, in the same undo step: no bush
// through its roof, no grass through its floors. Moved, it clears where it lands; where it stood stays bare.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));

function setup() {
    const context = { console, JSON, Math, Object, Array, Number, String, Set, Map, Date, Uint8Array, Reactor3D: R };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/MapFoliage.js'), context);
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js') + '\nwindow.PieceBuilderManager = PieceBuilderManager;', context);
    const plan = JSON.parse(read('template/Demo/3d/Structures/Cottage.json'));
    const map = { width: 40, height: 40, reactor3d: { version: 1 } };
    const F = context.RRMapFoliage;
    F.fill(map, 'grass', () => true, 6);
    for (const [x, y] of [[8, 8], [9.5, 6.5], [30, 30]]) F.addBush(map, { x, y, size: 2, seed: 1 });
    const manager = new context.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }) });
    Object.assign(manager, { structures: () => [{ file: 'Cottage.json', name: 'Cottage', plan }], structure: 'Cottage.json', announce() {} });
    const grassAt = (x, y) => F.decode((map.reactor3d.foliage.layers || []).find(l => l.kind === 'grass')?.density || '', 1600)[y * 40 + x];
    return { context, map, F, manager, grassAt, E: context.RRMapElevation };
}

test('a stamp clears grass and bushes under its pieces; undo grows them back, redo clears them again', () => {
    const { map, F, manager, grassAt, E } = setup();
    assert.equal(manager.stampAt(2, 3), true);
    const covered = F.coveredCells(map);
    assert.ok(covered.size > 50, 'the cottage stands on many cells');
    const [first] = covered, cx = first % 65536, cy = Math.floor(first / 65536);
    assert.equal(grassAt(cx, cy), 0, 'no grass under the building');
    assert.equal(grassAt(35, 35), 6, 'grass elsewhere stays');
    assert.deepEqual(F.bushes(map).map(b => [b.x, b.y]), [[30, 30]], 'the bushes inside the footprint went; the one far off stays');
    assert.equal(manager.undoStack.length, 1, 'one undo step');
    manager.undo();
    assert.equal(E.pieces(map).length, 0);
    assert.equal(grassAt(cx, cy), 6, 'undone, the grass grows back');
    assert.equal(F.bushes(map).length, 3, 'and the bushes stand again');
    assert.deepEqual(F.bushes(map).map(b => [b.x, b.y]), [[8, 8], [9.5, 6.5], [30, 30]], 'in the order they were planted');
    manager.redo();
    assert.equal(grassAt(cx, cy), 0, 'redone, cleared again');
    assert.equal(F.bushes(map).length, 1);
});

test('a building moved clears where it lands and leaves bare ground where it stood', () => {
    const { map, F, manager, grassAt, E } = setup();
    manager.stampAt(2, 3);
    const group = E.pieces(map)[0].group;
    const before = new Set(F.coveredCells(map));
    manager.selectedGroup = group;
    manager.moveSelectedTo(20, 20);
    const after = F.coveredCells(map);
    const [landed] = [...after].filter(key => !before.has(key));
    assert.equal(grassAt(landed % 65536, Math.floor(landed / 65536)), 0, 'cleared where it now stands');
    const [left] = [...before].filter(key => !after.has(key));
    assert.equal(grassAt(left % 65536, Math.floor(left / 65536)), 0, 'nothing regrows where it stood');
    manager.undo();
    assert.equal(grassAt(landed % 65536, Math.floor(landed / 65536)), 6, 'undoing the move grows back what it cleared');
});

test('pieces laid by hand over grass clear it with the stroke; an erase stroke clears nothing', () => {
    const { map, manager, grassAt } = setup();
    manager.kind = 'floor'; manager.mode = 'place';
    manager.beginStroke({ x: 12, y: 12, z: 0 });
    manager.paintAt({ x: 13, y: 12, z: 0 });
    manager.endStroke();
    assert.equal(grassAt(12, 12), 0);
    assert.equal(grassAt(13, 12), 0);
    assert.equal(grassAt(14, 12), 6);
    manager.undo();
    assert.equal(grassAt(12, 12), 6, 'the stroke\'s undo grows it back');
});

test('the runtime neither draws nor blocks with a bush whose root a piece stands on', () => {
    const map = { width: 10, height: 10, reactor3d: { version: 1, pieces: [{ id: 1, kind: 'floor', x: 4, y: 4, z: 0, rot: 0, material: 'Wood' }],
        foliage: { bushes: [{ x: 4.5, y: 4.5, size: 2, seed: 1 }, { x: 7.5, y: 7.5, size: 2, seed: 2 }] } } };
    assert.equal(R.pieceOnGround(map, 4, 4), true);
    assert.equal(R.bushBlocksCell(map, 4, 4), false, 'the floor decides, not a bush under it');
    assert.equal(R.bushBlocksCell(map, 7, 7), true, 'a bush in the open still blocks');
    assert.match(read('runtime/reactor_3d_foliage.js'), /!R\.pieceOnGround\(mapData, Math\.floor\(b\.x\), Math\.floor\(b\.y\)\)/, 'and is not drawn');
});

test('build-structure.cjs clears foliage under what it stamps', () => {
    assert.match(read('editor/build-scripts/build-structure.cjs'), /clearUnderPieces\(map, piece => piece\.group === group\)/);
});
