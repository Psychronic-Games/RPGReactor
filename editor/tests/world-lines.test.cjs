'use strict';
// Lines through the 3D world (Reactor3D.worldRay / worldSolidAt in runtime/reactor_3d_world.js): what a shot, a
// look or a blow meets is the world as it is drawn, not the walking rule's whole cells. A post is a post, the air
// under an awning is open, a doorway is open under its lintel, a window's hole is glass to a shot and nothing to
// a look, a door stops a line only while its leaf stands shut.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const R = require(path.join(__dirname, '..', '..', 'runtime', 'reactor_3d.js'));

let nextId = 1;
const piece = (kind, x, y, z, extra = {}) => Object.assign({ id: nextId++, kind, x, y, z, rot: 0, material: 'Stone' }, extra);
const shape = (kind, x, y, z, size, extra = {}) => piece(kind, x, y, z, Object.assign({ size, angle: 0 }, extra));
function mapOf(pieces, extra = {}) {
    return { width: 24, height: 24, note: '<3d>', reactor3d: Object.assign({ version: 1, elevation: new Array(24 * 24).fill(0), pieces }, extra) };
}
/** How far a line from a to b gets, as a share of its length (1: all the way). */
function reach(map, a, b, sight) {
    const far = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    return R.worldRay(map, a[0], a[1], a[2], (b[0] - a[0]) / far, (b[1] - a[1]) / far, (b[2] - a[2]) / far, far, sight) / far;
}
const clear = (map, a, b, sight) => reach(map, a, b, sight) >= 1 - 1e-9;
/** The rule lines were judged by before: the walking surface where the line passes, every half tile. */
function walkingRuleBlocks(map, a, b) {
    const far = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]), steps = Math.ceil(far / 0.5);
    for (let i = 1; i <= steps; i++) {
        const t = i / steps, y = a[1] + (b[1] - a[1]) * t;
        if (R.groundHeightAt(map, a[0] + (b[0] - a[0]) * t, a[2] + (b[2] - a[2]) * t, y) > y + 0.05) return true;
    }
    return false;
}

test('a thin post stops only the line that meets it: the cell beside it is open air', () => {
    const map = mapOf([shape('cylinder', 5, 5, 0, [0.24, 4, 0.24])]);
    // A third of a tile off the post's middle, through its cell.
    assert.equal(walkingRuleBlocks(map, [2.5, 2, 5.83], [8.5, 2, 5.83]), true, 'the walking rule reads the whole cell as the post');
    assert.equal(clear(map, [2.5, 2, 5.83], [8.5, 2, 5.83]), true, 'a line beside the post passes');
    assert.equal(clear(map, [2.5, 2, 5.5], [8.5, 2, 5.5]), false, 'a line into the post stops');
    const at = reach(map, [2.5, 2, 5.5], [8.5, 2, 5.5]) * 6;
    assert.ok(Math.abs(at - (5.5 - 0.12 - 2.5)) < 0.02, `at the post's own face (${at})`);
    assert.equal(R.lineMet, 'piece');
    assert.equal(clear(map, [2.5, 4.5, 5.5], [8.5, 4.5, 5.5]), true, 'and over its top');
    assert.equal(R.worldSolidAt(map, 5.5, 2, 5.5), true);
    assert.equal(R.worldSolidAt(map, 5.9, 2, 5.5), false, 'the same cell, beside the post');
});

test('open air under an awning, a tilted roof and a bowl stays open; the slab itself stops a line', () => {
    const awning = shape('box', 10, 5, 3, [3, 0.2, 3]);
    const roof = shape('box', 16, 5, 3.25, [6.4, 0.15, 4.6], { angle: 90, tilt: 12 });
    const dish = shape('dish', 10, 14, 2.2, [3, 0.8, 3]);
    const map = mapOf([awning, roof, dish]);
    assert.equal(walkingRuleBlocks(map, [7.5, 2, 5.5], [13.5, 2, 5.5]), true, 'the walking rule joins the awning to the ground under it');
    assert.equal(clear(map, [7.5, 2, 5.5], [13.5, 2, 5.5]), true, 'under the awning');
    assert.equal(clear(map, [10.5, 6, 5.5], [10.5, 1, 5.5]), false, 'down through it');
    assert.ok(Math.abs(reach(map, [10.5, 6, 5.5], [10.5, 1, 5.5]) * 5 - 2.8) < 0.01, 'at its top face');
    assert.equal(clear(map, [12.5, 2, 5.5], [19.5, 2, 5.5]), true, 'under the tilted roof');
    assert.equal(clear(map, [16.5, 8, 5.5], [16.5, 1, 5.5]), false, 'down through the tilted roof');
    assert.equal(clear(map, [7.5, 2, 14.2], [13.5, 2, 14.2]), true, 'under the bowl');
    assert.equal(clear(map, [10.5, 5, 14.5], [10.5, 1, 14.5]), false, 'down into the bowl');
});

test('a wall stops a line; a doorway is open under its lintel; a window is glass to a shot and open to a look', () => {
    const pieces = [];
    for (let x = 3; x <= 9; x++) pieces.push(piece(x === 5 ? 'doorway' : x === 7 ? 'window' : 'wall', x, 10, 0));
    pieces.push(piece('glass', 7, 10, 0, { material: 'Glass' }));
    const map = mapOf(pieces);
    assert.equal(clear(map, [4.5, 1.5, 8.5], [4.5, 1.5, 12.5]), false, 'through the wall');
    assert.equal(R.lineMet, 'piece');
    assert.ok(Math.abs(reach(map, [4.5, 1.5, 8.5], [4.5, 1.5, 12.5]) * 4 - 1.5) < 1e-6, 'at its face');
    assert.equal(clear(map, [5.5, 1.5, 8.5], [5.5, 1.5, 12.5]), true, 'through the doorway');
    assert.equal(clear(map, [5.5, 4.7, 8.5], [5.5, 4.7, 12.5]), false, 'into its lintel');
    assert.equal(clear(map, [7.5, 2.5, 8.5], [7.5, 2.5, 12.5]), false, 'a shot stops at the pane');
    assert.equal(clear(map, [7.5, 2.5, 8.5], [7.5, 2.5, 12.5], true), true, 'a look goes through it');
    assert.equal(clear(map, [7.5, 1.0, 8.5], [7.5, 1.0, 12.5], true), false, 'not through the sill');
    assert.equal(clear(map, [7.5, 4.0, 8.5], [7.5, 4.0, 12.5], true), false, 'nor the header');
    assert.equal(clear(map, [4.5, 6, 8.5], [4.5, 6, 12.5]), true, 'over the wall');
    assert.equal(R.worldSolidAt(map, 4.5, 2, 10.5), true);
    assert.equal(R.worldSolidAt(map, 5.5, 2, 10.5), false, 'in the doorway');
    assert.equal(R.worldSolidAt(map, 7.5, 2.5, 10.5), true, 'in the pane');
    assert.equal(R.worldSolidAt(map, 7.5, 2.5, 10.5, true), false, 'which a look passes');
});

test('a door stops a line while its leaf stands shut, whatever kind of door it is; open, or with no game running, it does not', () => {
    const pieces = [piece('wall', 3, 10, 0), piece('doorway', 4, 10, 0), piece('doorway', 5, 10, 0), piece('wall', 6, 10, 0),
        piece('door', 4, 10, 0, { id: 900, width: 2, material: 'Wood', opens: 'auto' })];
    const map = mapOf(pieces), a = [5.5, 1.6, 7.5], b = [5.5, 1.6, 13.5];
    R._doorStates = null;
    assert.equal(clear(map, a, b), true, 'no door is shut in the editor or in Node');
    try {
        R._doorStates = new Map([[900, { open: false, t: 0 }]]);
        assert.equal(R.doorShut(R.piecesOf(map).find(p => p.kind === 'door')), true);
        assert.equal(clear(map, a, b), false, 'shut: an automatic door hides what is behind it');
        assert.equal(clear(map, a, b, true), false, 'to a look as well');
        assert.ok(Math.abs(reach(map, a, b) * 6 - 2.94) < 0.01, 'at the leaf, across the middle of its cell');
        assert.equal(clear(map, [5.5, 4.2, 7.5], [5.5, 4.2, 13.5]), true, 'over the leaf, under the lintel');
        assert.equal(R.worldSolidAt(map, 5.5, 1.6, 10.5), true);
        assert.equal(R.worldSolidAt(map, 5.5, 1.6, 10.5, false, true), false, 'a walker is the walking rule\'s to stop');
        R._doorStates.get(900).t = 0.2;
        assert.equal(clear(map, a, b), false, 'barely begun to open');
        R._doorStates.get(900).t = 1; R._doorStates.get(900).open = true;
        assert.equal(clear(map, a, b), true, 'open');
    } finally { R._doorStates = null; }
});

test('the ground stops a line: level ground, a raised cell\'s face, rolling terrain; and the map\'s border', () => {
    const elevation = new Array(24 * 24).fill(0);
    elevation[5 * 24 + 10] = 2;
    const map = mapOf([], { elevation });
    assert.equal(clear(map, [2.5, 1.5, 3.5], [8.5, 1.5, 3.5]), true, 'level over level ground');
    const down = reach(map, [2.5, 2, 3.5], [6.5, -2, 3.5]) * Math.hypot(4, 4);
    assert.ok(Math.abs(down - Math.hypot(2.05, 2.05)) < 1e-6, 'down into the ground, where it comes to it');
    assert.equal(R.lineMet, 'ground');
    assert.equal(clear(map, [7.5, 1, 5.5], [13.5, 1, 5.5]), false, 'into a raised cell');
    assert.ok(Math.abs(reach(map, [7.5, 1, 5.5], [13.5, 1, 5.5]) * 6 - 2.5) < 1e-9, 'at its face');
    assert.equal(clear(map, [7.5, 2.5, 5.5], [13.5, 2.5, 5.5]), true, 'over it');
    assert.equal(clear(map, [2.5, 1, 3.5], [-3.5, 1, 3.5]), false, 'off the map');
    assert.equal(R.lineMet, 'edge');
    // A hill: corners rising to 3 in the middle of the map.
    const terrain = new Array(25 * 25).fill(0);
    for (let y = 10; y <= 14; y++) for (let x = 10; x <= 14; x++) terrain[y * 25 + x] = 3 - Math.max(Math.abs(x - 12), Math.abs(y - 12));
    const hilly = mapOf([], { terrain });
    assert.equal(clear(hilly, [6.5, 1, 12], [18.5, 1, 12]), false, 'into the hill');
    const at = reach(hilly, [6.5, 1, 12], [18.5, 1, 12]) * 12;
    assert.ok(at > 3.4 && at < 3.7, `where its slope rises to the line (${at})`);
    assert.equal(clear(hilly, [6.5, 3.2, 12], [18.5, 3.2, 12]), true, 'over its top');
    assert.equal(R.worldSolidAt(hilly, 12, 2, 12), true);
    assert.equal(R.worldSolidAt(hilly, 12, 3.2, 12), false);
});

test('hollow and round shapes are their own outline: a ring\'s wall, a tube\'s bore, a dome, a cone, an arch', () => {
    const map = mapOf([
        shape('ring', 6, 6, 0, [5, 0.7, 5], { thick: 0.1 }),
        shape('tube', 16, 6, 0, [3, 3, 3], { thick: 0.2 }),
        shape('dome', 6, 16, 0, [4, 2, 4]),
        shape('cone', 14, 16, 0, [2, 4, 2]),
        shape('arch', 19, 16, 0, [3, 3, 1])
    ]);
    // The ring is 5 across: its wall stands from 2 to 2.5 out, 0.7 tall.
    assert.equal(clear(map, [1.5, 0.35, 6.5], [6.5, 0.35, 6.5]), false, 'into the ring\'s wall');
    assert.ok(Math.abs(reach(map, [1.5, 0.35, 6.5], [6.5, 0.35, 6.5]) * 5 - 2.5) < 0.05, 'at its outer face');
    assert.equal(clear(map, [5.0, 0.35, 6.5], [8.0, 0.35, 6.5]), true, 'across its middle, inside the wall');
    assert.equal(clear(map, [1.5, 1.0, 6.5], [11.5, 1.0, 6.5]), true, 'over it');
    assert.equal(R.worldSolidAt(map, 4.25, 0.35, 6.5), true);
    assert.equal(R.worldSolidAt(map, 6.5, 0.35, 6.5), false);
    // The tube is 3 across with a wall 0.3 thick: a line down its bore passes, one across it does not.
    assert.equal(clear(map, [16.5, 5, 6.5], [16.5, 0.2, 6.5]), true, 'down the bore');
    assert.equal(clear(map, [13.5, 1.5, 6.5], [19.5, 1.5, 6.5]), false, 'across the tube');
    assert.equal(clear(map, [3.5, 0.5, 16.5], [9.5, 0.5, 16.5]), false, 'into the dome');
    assert.equal(clear(map, [3.5, 1.9, 15.0], [9.5, 1.9, 15.0]), true, 'past its shoulder, inside its box');
    assert.equal(clear(map, [12.5, 0.5, 16.5], [16.5, 0.5, 16.5]), false, 'into the cone\'s foot');
    assert.equal(clear(map, [12.5, 3.0, 16.9], [16.5, 3.0, 16.9]), true, 'beside its point, inside its box');
    assert.equal(clear(map, [19.5, 1.0, 14.5], [19.5, 1.0, 18.5]), true, 'through the arch');
    assert.equal(clear(map, [18.2, 1.0, 14.5], [18.2, 1.0, 18.5]), false, 'into its post');
    assert.equal(clear(map, [19.5, 2.8, 14.5], [19.5, 2.8, 18.5]), false, 'into the band over it');
});

test('cell pieces are their own boxes: a fence\'s rails, a pillar\'s shaft, a stair\'s steps, a roof\'s gable', () => {
    const map = mapOf([piece('fence', 4, 4, 0), piece('pillar', 8, 4, 0), piece('stair', 12, 4, 0), piece('roof', 16, 4, 0), piece('ramp', 20, 4, 0), piece('floor', 4, 10, 2)]);
    assert.equal(clear(map, [4.5, 0.56, 2.5], [4.5, 0.56, 6.5]), false, 'into a rail');
    assert.equal(clear(map, [4.5, 0.9, 2.5], [4.5, 0.9, 6.5]), true, 'between the rails');
    assert.equal(clear(map, [4.5, 2.0, 2.5], [4.5, 2.0, 6.5]), true, 'over the fence');
    assert.equal(clear(map, [8.5, 2, 2.5], [8.5, 2, 6.5]), false, 'into the pillar\'s shaft');
    assert.equal(clear(map, [8.9, 2, 2.5], [8.9, 2, 6.5]), true, 'beside it, in its cell');
    assert.equal(clear(map, [12.5, 0.2, 2.5], [12.5, 0.2, 6.5]), false, 'into the first step');
    assert.ok(Math.abs(reach(map, [12.5, 0.6, 2.5], [12.5, 0.6, 6.5]) * 4 - 2.0) < 1e-6, 'the third step is half way along the stair');
    assert.equal(clear(map, [12.5, 1.1, 2.5], [12.5, 1.1, 6.5]), true, 'over the stair');
    assert.ok(Math.abs(reach(map, [16.5, 0.5, 2.5], [16.5, 0.5, 6.5]) * 4 - 1.75) < 0.02, 'a gable\'s slope, a quarter of the way in');
    assert.equal(clear(map, [16.1, 1.05, 2.5], [16.1, 1.05, 6.5]), true, 'over the ridge');
    assert.ok(Math.abs(reach(map, [20.5, 0.5, 2.5], [20.5, 0.5, 6.5]) * 4 - 2.0) < 0.02, 'a ramp\'s slope, half way in');
    assert.equal(clear(map, [4.5, 1.5, 8.5], [4.5, 1.5, 12.5]), true, 'under a floor laid two levels up');
    assert.equal(clear(map, [4.5, 3, 10.5], [4.5, 1, 10.5]), false, 'down through it');
});

test('a cell is worked out once, when a line first comes to it, and again only when the map changes', () => {
    const map = mapOf([piece('wall', 5, 5, 0), shape('box', 12, 12, 0, [2, 2, 2])]);
    const index = R.lineIndex(map);
    assert.equal(index.cells.size, 0, 'nothing until a line asks');
    reach(map, [2.5, 1, 5.5], [8.5, 1, 5.5]);
    assert.equal(index.cells.size, 4, 'the cells the line crossed before it stopped (2, 3, 4 and the wall\'s)');
    const solids = index.cells.get(5 * 65536 + 5);
    reach(map, [2.5, 1, 5.5], [8.5, 1, 5.5]);
    assert.equal(R.lineIndex(map), index);
    assert.equal(index.cells.get(5 * 65536 + 5), solids, 'the same solids, not made again');
    assert.equal(index.cells.get(5 * 65536 + 3), null, 'an empty cell is remembered as empty');
    // The editor writes a new array on every change.
    map.reactor3d.pieces = map.reactor3d.pieces.filter(p => p.kind !== 'wall');
    assert.notEqual(R.lineIndex(map), index);
    assert.equal(clear(map, [2.5, 1, 5.5], [8.5, 1, 5.5]), true, 'the wall is gone');
    // A shape is found from every cell its box reaches, not only the cells whose middles it covers.
    assert.equal(clear(map, [10.5, 1, 11.7], [14.5, 1, 11.7]), false);
    assert.equal(clear(map, [10.5, 1, 11.3], [14.5, 1, 11.3]), true, 'a hair outside the box');
});

test('a rock is its mass over each cell, a block is a tile high, shutters drawn shut fill a window, and a cut cylinder is open where it is cut', () => {
    // A rock three by three and four tall on the ground about (5,5).
    const rocky = mapOf([{ id: nextId++, kind: 'rock', x: 5, y: 5, z: 0, rot: 0, material: 'Rock', size: [3, 4, 3] }]);
    const top = R.pieceSurfaceAt(rocky, 5.5, 5.5, 4);
    assert.ok(top > 2.4, 'the rock stands over its middle cell');
    assert.equal(clear(rocky, [1.5, 1, 5.5], [9.5, 1, 5.5]), false, 'into the rock');
    assert.equal(R.lineMet, 'piece');
    assert.equal(clear(rocky, [1.5, top + 0.4, 5.5], [9.5, top + 0.4, 5.5]), true, 'over its top');
    assert.equal(clear(rocky, [1.5, 1, 9.5], [9.5, 1, 9.5]), true, 'past it');
    assert.equal(R.worldSolidAt(rocky, 5.5, 1, 5.5), true);
    assert.equal(R.worldSolidAt(rocky, 5.5, top + 0.4, 5.5), false);
    // A rock held up off the ground is open under it.
    const arch = mapOf([{ id: nextId++, kind: 'rock', x: 5, y: 5, z: 5, rot: 0, material: 'Rock', size: [3, 2, 3], rough: 0 }]);
    assert.equal(clear(arch, [1.5, 1, 5.5], [9.5, 1, 5.5]), true, 'under a raised rock');
    assert.equal(clear(arch, [5.5, 9, 5.5], [5.5, 1, 5.5]), false, 'down into it');

    const map = mapOf([piece('block', 4, 14, 0), piece('window', 10, 14, 0, { frame: { shutters: true, closed: true } }), piece('window', 14, 14, 0),
        shape('cylinder', 18, 14, 0, [3, 3, 3], { sweep: 180 }), shape('cylinder', 18, 20, 0, [3, 3, 3])]);
    assert.equal(clear(map, [2.5, 0.5, 14.5], [6.5, 0.5, 14.5]), false, 'into the block');
    assert.ok(Math.abs(reach(map, [2.5, 0.5, 14.5], [6.5, 0.5, 14.5]) * 4 - 1.5) < 1e-9, 'at its face');
    assert.equal(clear(map, [2.5, 1.2, 14.5], [6.5, 1.2, 14.5]), true, 'over it: a block is one tile high, not a wall');
    // Through the hole of a window (from 1.5 up): open, unless its shutters are drawn shut; a look is stopped by them too.
    assert.equal(clear(map, [14.5, 2.5, 12.5], [14.5, 2.5, 16.5]), true, 'through an open window');
    assert.equal(clear(map, [10.5, 2.5, 12.5], [10.5, 2.5, 16.5]), false, 'not through shut shutters');
    assert.equal(clear(map, [10.5, 2.5, 12.5], [10.5, 2.5, 16.5], true), false, 'nor does a look');
    assert.ok(Math.abs(reach(map, [10.5, 2.5, 16.5], [10.5, 2.5, 12.5]) * 4 - 1.5) < 1e-9, 'from outside, at the shutters on the wall\'s outer face');
    assert.ok(Math.abs(reach(map, [10.5, 2.5, 12.5], [10.5, 2.5, 16.5]) * 4 - 2.44) < 1e-9, 'from inside, at their back');
    // Half a cylinder (which half is the shape's own rule, `withinSweep`): of four points round its middle, one in
    // each quarter, two are in what stands and two in what is cut away; a whole cylinder holds all four.
    const quarters = [[17.6, 13.6], [19.4, 13.6], [17.6, 15.4], [19.4, 15.4]];
    const cut = quarters.filter(([x, z]) => !R.worldSolidAt(map, x, 1.5, z)), kept = quarters.filter(([x, z]) => R.worldSolidAt(map, x, 1.5, z));
    assert.deepEqual([cut.length, kept.length], [2, 2]);
    assert.equal(quarters.filter(([x, z]) => R.worldSolidAt(map, x, 1.5, z + 6)).length, 4, 'the whole one');
    for (const [x, z] of cut) assert.equal(clear(map, [x - 0.2, 1.5, z], [x + 0.2, 1.5, z]), true, 'a line through the part cut away passes');
    for (const [x, z] of kept) assert.equal(clear(map, [x - 0.2, 4, z], [x - 0.2, 1, z]), false, 'down into the part that stands it stops');
    for (const [x, z] of cut) assert.equal(clear(map, [x, 4, z], [x, 1, z]), true, 'and down into the cut it does not');
});

test('what a line meets of a cell piece is the piece as it is drawn: every kind\'s own parts, turned each way', () => {
    // The drawn parts of a kind (`pieceShapes`: boxes, a column, a wedge, a gable in the piece's own cell) against
    // the solids a line is tested with, point by point through the cell.
    const S = R.PIECE_STOREY;
    const inside = (part, u, y, v) => {
        if (part.box) { const b = part.box; return u >= b[0] && u <= b[3] && y >= b[1] && y <= b[4] && v >= b[2] && v <= b[5]; }
        if (part.column) { const c = part.column; return Math.hypot(u - c[0], v - c[1]) <= c[2] && y >= c[3] && y <= c[4]; }
        if (part.wedge) return y >= 0 && y <= v;
        if (part.gable) return y >= 0 && y <= 1 - Math.abs(2 * v - 1);
        throw new Error('a part this test does not know: ' + Object.keys(part));
    };
    for (const kind of ['wall', 'block', 'floor', 'pillar', 'stair', 'ramp', 'roof', 'doorway', 'window', 'glass', 'fence']) {
        for (let rot = 0; rot < 4; rot++) {
            const laid = piece(kind, 6, 6, 0, { rot });
            const map = mapOf([laid]);
            const parts = R.pieceShapes(kind, R.piecesOf(map)[0]);
            assert.ok(parts.length > 0, kind);
            let solid = 0, differ = 0, first = '';
            // Points a little off every edge the parts have (their edges fall on sixteenths and hundredths).
            for (let iu = 0; iu < 16; iu++) for (let iv = 0; iv < 16; iv++) for (let iy = 0; iy < 26; iy++) {
                const u = (iu + 0.37) / 16, v = (iv + 0.37) / 16, y = 0.013 + iy * (S + 0.3) / 26;
                let dx = u - 0.5, dz = v - 0.5;
                for (let i = 0; i < rot; i++) { const next = -dz; dz = dx; dx = next; }
                const drawn = parts.some(part => inside(part, u, y, v));
                const met = R.worldSolidAt(map, 6.5 + dx, y, 6.5 + dz);
                if (drawn) solid++;
                if (drawn !== met) { differ++; first = first || `${kind} rot ${rot} at u ${u.toFixed(3)}, y ${y.toFixed(3)}, v ${v.toFixed(3)}: drawn ${drawn}, met ${met}`; }
            }
            assert.ok(solid > 0, kind + ' has something in its cell');
            assert.equal(differ, 0, first);
        }
    }
});
