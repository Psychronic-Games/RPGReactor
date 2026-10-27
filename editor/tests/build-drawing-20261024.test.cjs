'use strict';
// The Build bar made plain (2026-10-24): drawing modes on the panel (a brush, a straight line, a rectangle filled or
// outlined), the level of what is in hand and of what is placed, floors and blocks at quarter levels, and walls,
// panes and pillars at a height of their own, drawn, stood against and hidden by that height.
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
function builderOn(map) {
    const context = { console, JSON, Math, Object, Array, Number, String, Set, Map,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
        CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } } };
    context.window = context;
    context.reactor = { buildHotbar: { visible: true, flash() {}, hide() {} } };
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/StructurePlan.js'), context);
    vm.runInNewContext(read('editor/src/PieceBuilderManager.js') + '\nwindow.PieceBuilderManager = PieceBuilderManager;', context);
    const manager = new context.PieceBuilderManager({ getTilemapManager: () => ({ currentMap: map }) });
    manager.announce = () => {};
    return { manager, E: context.RRMapElevation, P: context.PieceBuilderManager };
}
const freshMap = () => ({ id: 1, width: 20, height: 20, reactor3d: { version: 1 } });
const cells = (E, map, kind) => Array.from(E.pieces(map).filter(p => p.kind === kind), p => p.x + ',' + p.y).sort();
const stroke = (manager, from, to) => { manager.beginStroke(from); manager.paintAt(to); manager.endStroke(); };

test('a line is a straight run from where the drag began, every cell sharing a side with the last', () => {
    const { manager, E, P } = builderOn(freshMap());
    assert.equal(JSON.stringify(P.lineCells({ x: 0, y: 0 }, { x: 3, y: 2 }).map(c => [c.x, c.y])), '[[0,0],[1,0],[1,1],[2,1],[2,2],[3,2]]');
    for (const [a, b] of [[{ x: 1, y: 1 }, { x: 8, y: 5 }], [{ x: 9, y: 9 }, { x: 2, y: 12 }]]) {
        const line = P.lineCells(a, b);
        assert.deepEqual([line[0].x, line[0].y, line.at(-1).x, line.at(-1).y], [a.x, a.y, b.x, b.y]);
        for (let i = 1; i < line.length; i++) assert.equal(Math.abs(line[i].x - line[i - 1].x) + Math.abs(line[i].y - line[i - 1].y), 1, 'no corner-to-corner gap');
    }
    const map = freshMap(); const built = builderOn(map);
    built.manager.setKind('wall'); built.manager.setDrawShape('line');
    // The drag wanders: only where it ends counts, and the run is laid again from its start each move.
    built.manager.beginStroke({ x: 2, y: 2, z: 0 }); built.manager.paintAt({ x: 9, y: 9, z: 0 }); built.manager.paintAt({ x: 6, y: 2, z: 0 }); built.manager.endStroke();
    assert.deepEqual(cells(built.E, map, 'wall'), ['2,2', '3,2', '4,2', '5,2', '6,2']);
    assert.equal(built.manager.undoStack.length, 1, 'one undo step');
});

test('a rectangle outlines a room of walls and fills a floor, unless the panel says otherwise', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    manager.setDrawShape('rect');
    manager.setKind('wall'); stroke(manager, { x: 2, y: 2, z: 0 }, { x: 5, y: 4, z: 0 });
    assert.equal(cells(E, map, 'wall').length, 10, 'the edge of a 4 by 3 room');
    manager.setKind('floor'); stroke(manager, { x: 10, y: 10, z: 0 }, { x: 12, y: 11, z: 0 });
    assert.equal(cells(E, map, 'floor').length, 6, 'a floor fills');
    manager.setRectFill('fill'); manager.setKind('wall'); stroke(manager, { x: 14, y: 14, z: 0 }, { x: 15, y: 15, z: 0 });
    assert.equal(cells(E, map, 'wall').length, 14, 'Filled: walls fill too');
    manager.setRectFill('edge'); manager.setKind('floor'); stroke(manager, { x: 1, y: 14, z: 0 }, { x: 3, y: 16, z: 0 });
    assert.equal(cells(E, map, 'floor').length, 6 + 8, 'Outline: a floor lines its edge');
});

test('a floor stands at a quarter level and is raised and lowered by a step; a wall keeps whole levels', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    manager.setKind('floor'); manager.setLevel(0.5);
    assert.equal(manager.level, 0.5);
    manager.setDrawShape('brush'); manager.beginStroke({ x: 3, y: 3, z: manager.level }); manager.endStroke();
    const floor = E.pieces(map).find(p => p.kind === 'floor');
    assert.equal(floor.z, 0.5, 'kept at its quarter level');
    manager.selected = floor.id;
    assert.equal(manager.raiseSelection(0.25), true);
    assert.equal(E.pieces(map).find(p => p.kind === 'floor').z, 0.75);
    manager.raiseSelection(-5);
    assert.equal(E.pieces(map).find(p => p.kind === 'floor').z, 0, 'never below the ground');
    // A wall in hand comes down to a whole level.
    manager.setLevel(1.5); manager.setKind('wall');
    assert.equal(manager.level, 1);
    assert.equal(E.normalizePiece({ kind: 'wall', x: 1, y: 1, z: 2.5 }).z, 2);
    assert.equal(R.normalizePiece({ kind: 'block', x: 1, y: 1, z: 2.5 }).z, 2.5, 'the game reads a block at its quarter level');
});

test('a wall, a pane and a pillar take a height of their own: laid, drawn, stood against and hidden by it', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    manager.setKind('wall'); manager.setHeight('wall', 2);
    manager.setDrawShape('brush'); manager.beginStroke({ x: 4, y: 4, z: 0 }); manager.endStroke();
    const wall = E.pieces(map).find(p => p.kind === 'wall');
    assert.equal(wall.height, 2);
    assert.equal(R.normalizePiece(wall).height, 2, 'the game keeps it');
    assert.equal(R.normalizePiece({ kind: 'wall', x: 0, y: 0, z: 0, height: 5 }).height, undefined, 'a storey is no height of its own');
    assert.equal(R.normalizePiece({ kind: 'floor', x: 0, y: 0, z: 0, height: 3 }).height, undefined, 'only walls, panes and pillars');
    assert.equal(R.pieceHeight('wall', wall), 2);
    assert.equal(R.pieceHeight('wall'), R.PIECE_STOREY);
    assert.deepEqual(R.pieceShapes('wall', wall)[0].box, [0, 0, 0, 1, 2, 1], 'drawn two tiles tall');
    assert.equal(R.pieceTop(wall, 0.5, 0.5), 2, 'its top is where it stops');
    // A tall wall beside a low one shows its face above the low one: they do not hide each other.
    const tall = R.normalizePiece({ id: 9, kind: 'wall', x: 5, y: 4, z: 0, material: '' });
    const data = { width: 20, height: 20, reactor3d: { version: 1, pieces: [wall, tall] } };
    const faces = R.hiddenFacesOf(R.normalizePiece(tall), data);
    assert.equal(faces.west, false);
    const twin = { width: 20, height: 20, reactor3d: { version: 1, pieces: [wall, Object.assign({}, wall, { id: 10, x: 5 })] } };
    assert.equal(R.hiddenFacesOf(R.normalizePiece(Object.assign({}, wall, { id: 10, x: 5 })), twin).west, true, 'two walls of one height hide the face between them');
    // Placed: the height is changed on the piece.
    manager.selected = wall.id;
    manager.updateSelected({ height: 3.5 });
    assert.equal(E.pieces(map).find(p => p.kind === 'wall').height, 3.5);
});

test('a wall line off the grid is one straight wall from end to end; Stepped keeps the staircase of cells', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    manager.setKind('wall'); manager.setDrawShape('line'); manager.setHeight('wall', 4); manager.material = 'Stone';
    manager.setDiagonal('straight');
    stroke(manager, { x: 2, y: 2, z: 0 }, { x: 8, y: 6, z: 0 });
    const boxes = E.pieces(map).filter(p => p.kind === 'box');
    assert.equal(boxes.length, 1, 'one wall, not a staircase');
    assert.equal(E.pieces(map).filter(p => p.kind === 'wall').length, 0);
    const wall = boxes[0];
    assert.equal(wall.angle, Math.round(Math.atan2(4, 6) * 180 / Math.PI));
    assert.equal(wall.size[1], 4, 'as tall as the wall in hand');
    assert.equal(wall.size[2], 1, 'a tile thick');
    assert.ok(Math.abs(wall.size[0] - (Math.hypot(6, 4) + 1)) < 0.01, 'end to end, both end cells in it');
    assert.equal(wall.material, 'Stone');
    // It blocks the cells along its line, as the game walks against it.
    const feet = R.pieceFootprint(R.normalizePiece(wall)).map(c => c.join(','));
    for (const cell of ['2,2', '5,4', '8,6']) assert.ok(feet.includes(cell), 'blocks ' + cell);
    // Along a row it is still wall cells (they join with the rest of a room).
    const row = freshMap(); const b = builderOn(row);
    b.manager.setKind('wall'); b.manager.setDrawShape('line'); b.manager.setDiagonal('straight');
    stroke(b.manager, { x: 1, y: 1, z: 0 }, { x: 5, y: 1, z: 0 });
    assert.equal(b.E.pieces(row).filter(p => p.kind === 'wall').length, 5);
    // Stepped: the cells.
    const steps = freshMap(); const c = builderOn(steps);
    c.manager.setKind('wall'); c.manager.setDrawShape('line'); c.manager.setDiagonal('stepped');
    stroke(c.manager, { x: 2, y: 2, z: 0 }, { x: 8, y: 6, z: 0 });
    assert.equal(c.E.pieces(steps).filter(p => p.kind === 'box').length, 0);
    assert.equal(c.E.pieces(steps).filter(p => p.kind === 'wall').length, 11);
});

test('the Height slider is handled with the panel\'s other sliders, so a drag sets the height instead of moving the piece', () => {
    const source = read('editor/src/BuildHotbar.js');
    // The sliders' shared handler took a Height drag on a placed wall for a move and the panel then showed 5 again.
    assert.match(source, /if \(kind === 'rr-build-height'\) \{ applyHeight\(v, false\); return; \}/);
    assert.ok(source.indexOf("if (kind === 'rr-build-height')") < source.indexOf("else if (!placed) return;"), 'before the placed-only branches');
    assert.match(source, /querySelectorAll\('input\[type=number\]\.rr-build-height'\)/, 'the number box when typed');
});

test('a whole building made taller lifts its upper floors, its next storey and its roof with its walls', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    // Two storeys of a 2 by 2 house: walls, a doorway and a window at 0, a floor and walls at 5, a roof at 10, an eave at 10.5.
    const lay = list => { for (const p of list) E.setPiece(map, Object.assign({ rot: 0, material: '', group: 1 }, p)); };
    lay([{ kind: 'floor', x: 3, y: 3, z: 0 }, { kind: 'wall', x: 3, y: 3, z: 0 }, { kind: 'doorway', x: 4, y: 3, z: 0 }, { kind: 'window', x: 3, y: 4, z: 0 },
        { kind: 'floor', x: 3, y: 3, z: 5 }, { kind: 'wall', x: 3, y: 3, z: 5 }, { kind: 'wall', x: 4, y: 3, z: 5 },
        { kind: 'roof', x: 3, y: 3, z: 10 }, { kind: 'box', x: 4, y: 4, z: 10.5, size: [2, 0.25, 1] }, { kind: 'stair', x: 4, y: 4, z: 0 }]);
    manager.selectedIds = E.pieces(map).map(p => p.id); manager.selected = manager.selectedIds[0];
    assert.equal(manager.setSelectionHeight(8), true);
    const at = (kind, x, y) => E.pieces(map).filter(p => p.kind === kind && p.x === x && p.y === y).map(p => [p.z, p.height || 5]).sort((a, b) => a[0] - b[0]);
    assert.deepEqual(JSON.parse(JSON.stringify(at('wall', 3, 3))), [[0, 8], [8, 8]], 'the ground storey grows to 8 and the upper one stands on it, 8 tall');
    assert.deepEqual(JSON.parse(JSON.stringify(at('floor', 3, 3))), [[0, 5], [8, 5]], 'the upper floor rises to the top of the walls below');
    assert.deepEqual(JSON.parse(JSON.stringify(at('doorway', 4, 3))), [[0, 8]], 'a doorway grows with its wall');
    assert.equal(at('roof', 3, 3)[0][0], 16, 'the roof sits on the taller second storey');
    assert.equal(E.pieces(map).find(p => p.kind === 'box').z, 16.5, 'and the eave with it');
    assert.equal(at('stair', 4, 4)[0][0], 0, 'a stair keeps its place');
    // The doorway's opening stays a door's size; the wall above it reaches the top.
    const doorway = R.normalizePiece(E.pieces(map).find(p => p.kind === 'doorway'));
    assert.deepEqual(R.pieceShapes('doorway', doorway)[0].box, [0, R.PIECE_STOREY - 0.6, 0, 1, 8, 1]);
    // Back down: everything comes back to where it stood.
    manager.setSelectionHeight(5);
    assert.deepEqual(JSON.parse(JSON.stringify(at('wall', 3, 3))), [[0, 5], [5, 5]]);
    assert.equal(at('roof', 3, 3)[0][0], 10);
});

test('a building\'s parts are read the same after it is made taller: the gable on a taller wall is still its wall', () => {
    const map = freshMap(); const { manager, E, P } = builderOn(map);
    const lay = list => { for (const p of list) E.setPiece(map, Object.assign({ rot: 0, material: '', group: 1 }, p)); };
    lay([{ kind: 'wall', x: 3, y: 3, z: 0 }, { kind: 'block', x: 3, y: 3, z: 5 }, { kind: 'wall', x: 4, y: 3, z: 0 }]);
    const roleOf = (list, kind) => { const piece = list.find(p => p.kind === kind); const entry = P.buildingParts(list).find(e => e.ids.includes(piece.id)); return entry ? entry.key : null; };
    const before = roleOf(E.pieces(map), 'block');
    assert.equal(before, 'wall', 'a block on a wall is part of that wall');
    manager.selectedIds = E.pieces(map).map(p => p.id); manager.selected = manager.selectedIds[0];
    manager.setSelectionHeight(8);
    assert.equal(E.pieces(map).find(p => p.kind === 'block').z, 8);
    assert.equal(roleOf(E.pieces(map), 'block'), before, 'the block on the wall keeps the wall\'s part');
});

test('a building whose walls were made taller through its roof is put right by setting its height again', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    const lay = list => { for (const p of list) E.setPiece(map, Object.assign({ rot: 0, material: '', group: 1 }, p)); };
    // As an older Height left it: walls of both storeys 8 tall, the upper floor, the upper storey and the roof where they stood.
    lay([{ kind: 'wall', x: 3, y: 3, z: 0, height: 8 }, { kind: 'floor', x: 3, y: 3, z: 5 }, { kind: 'wall', x: 3, y: 3, z: 5, height: 8 }, { kind: 'roof', x: 3, y: 3, z: 10 }]);
    manager.selectedIds = E.pieces(map).map(p => p.id); manager.selected = manager.selectedIds[0];
    manager.setSelectionHeight(8);
    const zOf = (kind, z0) => E.pieces(map).filter(p => p.kind === kind).map(p => p.z).sort((a, b) => a - b);
    assert.deepEqual(Array.from(zOf('wall')), [0, 8]);
    assert.deepEqual(Array.from(zOf('floor')), [8]);
    assert.deepEqual(Array.from(zOf('roof')), [16]);
});

test('an eave tilted down over the wall\'s edge rises with the roof; a post or a chimney from the ground stays', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    const lay = list => { for (const p of list) E.setPiece(map, Object.assign({ rot: 0, material: '', group: 1 }, p)); };
    lay([{ kind: 'wall', x: 3, y: 3, z: 0 }, { kind: 'roof', x: 3, y: 3, z: 5 },
        { kind: 'box', x: 4, y: 3, z: 4, size: [6, 0.25, 2.83], tilt: 45 },
        { kind: 'box', x: 5, y: 5, z: 0, size: [0.32, 5, 0.32] },
        { kind: 'box', x: 6, y: 5, z: 0, size: [1, 9, 1] }]);
    manager.selectedIds = E.pieces(map).map(p => p.id); manager.selected = manager.selectedIds[0];
    manager.setSelectionHeight(8);
    const boxes = E.pieces(map).filter(p => p.kind === 'box').sort((a, b) => a.x - b.x || a.y - b.y);
    assert.equal(E.pieces(map).find(p => p.kind === 'roof').z, 8);
    assert.equal(boxes[0].z, 7, 'the eave hanging over the edge rises with the roof');
    assert.equal(boxes[1].z, 0, 'a post along the wall stays on the ground');
    assert.equal(boxes[2].z, 0, 'a chimney from the ground stays on the ground');
});

test('a window, doorway, pane or door pointed at a wall goes into it, in place of the piece of wall pointed at', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    const lay = list => { for (const p of list) E.setPiece(map, Object.assign({ rot: 0, material: 'Stone', group: 3 }, p)); };
    // A row of walls along y = 5, x 2..8; the one at x 8 eight tiles tall.
    lay([2, 3, 4, 5, 6, 7].map(x => ({ kind: 'wall', x, y: 5, z: 0 })).concat([{ kind: 'wall', x: 8, y: 5, z: 0, height: 8 }]));
    // The south face of (x, 5) struck from the cell beyond it (x, 6), `height` up.
    const face = (x, height) => ({ x, y: 6, z: Math.floor(height), side: 'south', faceCell: { x, y: 5 }, height, top: false, point: { x: x + 0.5, z: 6 } });
    const at = (x, y) => Array.from(E.pieces(map).filter(p => p.x === x && p.y === y), p => [p.kind, p.z, p.height || 5, p.rot, p.material, p.group || 0]).sort((a, b) => a[1] - b[1]);
    const click = (kind, target) => { manager.setKind(kind); manager.beginStroke(target); manager.endStroke(); };
    click('window', face(3, 2.5));
    assert.deepEqual(JSON.parse(JSON.stringify(at(3, 5))), [['window', 0, 5, 0, 'Stone', 3]], 'the wall became a window, its material and building kept, looking out of the struck face');
    assert.deepEqual(at(3, 6), [], 'nothing laid outside the wall');
    // High up a stretched wall: the wall stays under it, the window where it was aimed.
    click('window', face(8, 6));
    assert.deepEqual(JSON.parse(JSON.stringify(at(8, 5))), [['wall', 0, 3, 0, 'Stone', 3], ['window', 3, 5, 0, 'Stone', 3]]);
    click('doorway', face(4, 1));
    assert.deepEqual(JSON.parse(JSON.stringify(at(4, 5))), [['doorway', 0, 5, 0, 'Stone', 3]]);
    // A door in plain wall: its doorway as wide as the door, along the wall, and the door hung in it.
    manager.door = Object.assign({}, manager.door, { width: 2 });
    click('door', face(6, 1));
    const doorways = E.pieces(map).filter(p => p.kind === 'doorway' && p.y === 5).map(p => p.x).sort();
    assert.deepEqual(Array.from(doorways), [4, 6, 7], 'the clicked wall and the next one along it opened');
    const door = E.pieces(map).find(p => p.kind === 'door');
    assert.ok(door, 'the door is hung');
    assert.equal(door.width, 2);
    manager.material = 'Glass';
    click('glass', face(2, 2));
    assert.deepEqual(JSON.parse(JSON.stringify(at(2, 5))), [['glass', 0, 5, 0, 'Glass', 3]], 'a pane fills the whole piece');
    // Pointed at nothing but ground, a window is laid as any piece.
    click('window', { x: 12, y: 12, z: 0, top: true, height: 0, point: { x: 12.5, z: 12.5 } });
    assert.equal(at(12, 12)[0][0], 'window');
});

test('a window dragged along a wall goes into every piece of it the pointer passes', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    for (let x = 2; x <= 6; x++) E.setPiece(map, { kind: 'wall', x, y: 5, z: 0, rot: 0, material: 'Stone' });
    manager.setKind('window'); manager.setDrawShape('rect');
    const face = x => ({ x, y: 6, z: 2, side: 'south', faceCell: { x, y: 5 }, height: 2.5, top: false, point: { x: x + 0.5, z: 6 } });
    manager.beginStroke(face(2)); for (const x of [3, 4]) manager.paintAt(face(x)); manager.endStroke();
    assert.deepEqual(Array.from(E.pieces(map).filter(p => p.kind === 'window'), p => p.x).sort(), [2, 3, 4]);
    assert.equal(E.pieces(map).filter(p => p.y === 6).length, 0, 'not a rectangle of windows outside');
    assert.equal(manager.undoStack.length, 1, 'one undo step');
});

test('a window laid from inside a building still looks out of it', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    for (let x = 2; x <= 6; x++) E.setPiece(map, { kind: 'wall', x, y: 5, z: 0, rot: 0, material: 'Stone' });
    // The building's floor is north of the wall (y 4); outside, south (y 6), is open ground.
    for (let x = 2; x <= 6; x++) E.setPiece(map, { kind: 'floor', x, y: 4, z: 0, rot: 0, material: 'Wood' });
    manager.setKind('window');
    // Struck on its north face, from inside.
    manager.beginStroke({ x: 4, y: 4, z: 2, side: 'north', faceCell: { x: 4, y: 5 }, height: 2.5, top: false, point: { x: 4.5, z: 5 } }); manager.endStroke();
    assert.equal(E.pieces(map).find(p => p.kind === 'window').rot, 0, 'it looks south, out of the building');
});

test('a wall pointed at a window, doorway or pane fills it in; pointed at plain wall it is laid beside it', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    E.setPiece(map, { kind: 'window', x: 4, y: 5, z: 0, rot: 0, material: 'Stone', height: 8 });
    E.setPiece(map, { kind: 'wall', x: 5, y: 5, z: 0, rot: 0, material: 'Stone' });
    manager.setKind('wall'); manager.setDrawShape('brush');
    manager.beginStroke({ x: 4, y: 6, z: 2, side: 'south', faceCell: { x: 4, y: 5 }, height: 2.5, top: false, point: { x: 4.5, z: 6 } }); manager.endStroke();
    const filled = E.pieces(map).find(p => p.x === 4 && p.y === 5);
    assert.deepEqual([filled.kind, filled.height, filled.material], ['wall', 8, 'Stone']);
    manager.beginStroke({ x: 5, y: 6, z: 0, side: 'south', faceCell: { x: 5, y: 5 }, height: 0.5, top: false, point: { x: 5.5, z: 6 } }); manager.endStroke();
    assert.ok(E.pieces(map).some(p => p.kind === 'wall' && p.x === 5 && p.y === 6), 'beside a plain wall, as before');
});

test('fences join what is beside them: an L closes its corner, a diagonal run joins corner to corner, a lone fence stands as laid', () => {
    const piece = (x, y, extra) => Object.assign({ id: x * 100 + y, kind: 'fence', x, y, z: 0, rot: 0, material: '' }, extra);
    const map = { width: 20, height: 20, reactor3d: { version: 1, pieces: [piece(2, 2), piece(3, 2), piece(3, 3), piece(6, 6), piece(7, 7), piece(8, 8), piece(12, 12),
        { id: 900, kind: 'wall', x: 1, y: 2, z: 0, rot: 0, material: '' }] } };
    const index = R.pieceIndex(map);
    const joins = (x, y) => JSON.stringify(R.fenceJoins(index.list.find(p => p.x === x && p.y === y), index).map(j => j.join(',')).sort());
    assert.equal(joins(2, 2), JSON.stringify(['-1,0', '1,0']), 'east to the next fence, west into the wall');
    assert.equal(joins(3, 2), JSON.stringify(['-1,0', '0,1']), 'the corner: west and south, no diagonal past it');
    assert.equal(joins(7, 7), JSON.stringify(['-1,-1', '1,1']), 'a diagonal run joins corner to corner');
    assert.equal(joins(12, 12), '[]', 'a lone fence stands as laid');
    // A diagonal rail drawn as a beam: every face of it looks outward.
    const out = { positions: [], uvs: [], colors: [] };
    R.emitPiece(Object.assign({}, index.list.find(p => p.x === 7 && p.y === 7), { fenceJoin: [[1, 1]], rot: 0 }), 0, out, null);
    const P = out.positions; let inward = 0;
    // The rail beam's axis runs from the cell's middle (7.5, 7.5) to its corner (8, 8).
    for (let i = 0; i < P.length; i += 9) {
        const a = [P[i], P[i + 1], P[i + 2]], b = [P[i + 3], P[i + 4], P[i + 5]], c = [P[i + 6], P[i + 7], P[i + 8]];
        const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const m = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
        // The nearest point of whichever solid it belongs to: the post's middle or the rail's line.
        const t = Math.max(0, Math.min(1, ((m[0] - 7.5) + (m[2] - 7.5)) / 1));
        const railY = m[1] < 0.9 ? 0.56 : 1.21;
        const post = Math.abs(m[0] - 7.5) <= 0.081 && Math.abs(m[2] - 7.5) <= 0.081;
        const centre = post ? [7.5, 0.75, 7.5] : [7.5 + 0.5 * t, railY, 7.5 + 0.5 * t];
        if (n[0] * (m[0] - centre[0]) + n[1] * (m[1] - centre[1]) + n[2] * (m[2] - centre[2]) < -1e-9) inward++;
    }
    assert.equal(inward, 0, 'no face of the post or the rails looks inward');
});

test('a fence dragged or drawn as a line turns itself to run the way it was laid', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    manager.setKind('fence'); manager.setDrawShape('line'); manager.rot = 0;
    stroke(manager, { x: 5, y: 2, z: 0 }, { x: 5, y: 7, z: 0 });
    assert.ok(E.pieces(map).filter(p => p.kind === 'fence').every(p => p.rot % 2 === 1), 'a north-south run faces north-south');
    stroke(manager, { x: 10, y: 10, z: 0 }, { x: 13, y: 13, z: 0 });
    assert.equal(E.pieces(map).filter(p => p.kind === 'fence' && p.x >= 10).length, 4, 'a diagonal line lays one fence a step, corner to corner');
});

test('a window or a doorway goes into a straight diagonal wall: the wall cut either side, the opening turned as it is', () => {
    const map = freshMap(); const { manager, E, P } = builderOn(map);
    manager.setKind('wall'); manager.setDrawShape('line'); manager.setDiagonal('straight'); manager.material = 'Stone';
    stroke(manager, { x: 2, y: 2, z: 0 }, { x: 10, y: 8, z: 0 });
    const wall = E.pieces(map).find(p => p.kind === 'box');
    const f = P.straightFrame(wall);
    // Pointed at the wall's middle, 2.5 up, from beside it.
    const aim = (along, height) => { const x = f.cx + f.c * along - f.s * 0.5, z = f.cz + f.s * along + f.c * 0.5; return { x: Math.floor(x), y: Math.floor(z), z: 2, side: 'south', faceCell: { x: Math.floor(x), y: Math.floor(z) }, height, top: false, point: { x, z } }; };
    manager.setKind('window');
    const found = manager.wallUnder(aim(0, 2.5));
    assert.ok(found && found.straight, 'the window finds the straight wall under the pointer');
    manager.beginStroke(aim(0, 2.5)); manager.endStroke();
    const boxes = E.pieces(map).filter(p => p.kind === 'box');
    assert.equal(boxes.length, 5, 'two lengths of wall, a sill, a pane and a header');
    assert.ok(boxes.every(p => p.angle === wall.angle), 'every part turned as the wall');
    const full = boxes.filter(p => p.size[1] === 5);
    assert.equal(full.length, 2);
    assert.ok(Math.abs(full[0].size[0] + full[1].size[0] + 1 - wall.size[0]) < 0.02, 'the wall cut by a tile, the rest of it kept');
    const pane = boxes.find(p => p.material === 'Glass');
    assert.ok(pane && pane.z === 1.5 && pane.size[2] <= 0.1, 'a pane in the hole, above the sill');
    assert.ok(boxes.some(p => p.z >= 3.5 && p.material === 'Stone' && p.size[0] === 1), 'a header over it');
    // A doorway along it: the wall cut again, a header only over the opening.
    manager.setKind('doorway');
    manager.beginStroke(aim(-3, 1)); manager.endStroke();
    const after = E.pieces(map).filter(p => p.kind === 'box');
    assert.equal(after.length, 7, 'one length of wall cut in two and a header: 5 - 1 + 3');
    assert.ok(after.some(p => p.z === 4.5 && p.size[0] === 2), 'the doorway\'s header, a door\'s height up, two tiles wide so the grid has a way through');
    assert.equal(manager.undoStack.length, 3, 'each one undo step');
});

test('a floor in hand lays a square of tiles at a click, and a line of floor that wide', () => {
    const map = freshMap(); const { manager, E } = builderOn(map);
    manager.setKind('floor'); manager.floorBrush = 3; manager.setDrawShape('brush');
    manager.beginStroke({ x: 5, y: 5, z: 0 }); manager.endStroke();
    assert.deepEqual(cells(E, map, 'floor'), ['4,4', '4,5', '4,6', '5,4', '5,5', '5,6', '6,4', '6,5', '6,6']);
    manager.setDrawShape('line'); manager.floorBrush = 2;
    stroke(manager, { x: 10, y: 2, z: 0 }, { x: 14, y: 2, z: 0 });
    assert.equal(E.pieces(map).filter(p => p.kind === 'floor' && p.x >= 10).length, 10, 'two tiles wide, five long');
});
