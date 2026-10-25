'use strict';
// What a battle's picture asks the built world (runtime/reactor_3d_lighting.js,
// reactor_3d.js): whether a point is inside something built, how far a camera
// may stand back, what the cutaway opens, where a point behind the camera
// lands on screen, and where the first-person eye is.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

function loadThree() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    return global.THREE;
}
const THREE = loadThree();
const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
const mapWith = (pieces, size = 16) => ({ width: size, height: size, reactor3d: { version: 1, elevation: new Array(size * size).fill(0), pieces } });
const piece = (id, kind, x, y, z, extra = {}) => Object.assign({ id, kind, x, y, z, rot: 0, material: '' }, extra);

test('a shape is solid inside its own outline and height, not across its cell', () => {
    // A street lamp: a post a quarter of a tile wide and four tall, a head over it.
    const lamp = mapWith([
        piece(1, 'cylinder', 5, 5, 0.3, { size: [0.24, 3.95, 0.24], angle: 0 }),
        piece(2, 'box', 5, 5, 4.32, { size: [0.46, 0.62, 0.46], angle: 0 })
    ]);
    assert.equal(R.pieceSolidAt(lamp, 5.5, 2, 5.5), true, 'in the post');
    assert.equal(R.pieceSolidAt(lamp, 5.9, 2, 5.5), false, 'beside the post, in its cell: open air');
    assert.equal(R.pieceSolidAt(lamp, 5.5, 4.6, 5.5), true, 'in the head');
    assert.equal(R.pieceSolidAt(lamp, 5.5, 5.2, 5.5), false, 'over the head');
    assert.equal(R.pieceSolidAt(lamp, 5.5, 0.1, 5.5), false, 'under the post\'s foot');
    assert.equal(R.pieceSolidAt(lamp, 5.5, 2, 5.5, null, 0.8), false, 'a camera lets a post through');
    // A wide shape reaches over the cells of its footprint, from the ground of the cell it stands on.
    const pillar = mapWith([piece(1, 'cylinder', 5, 5, 0, { size: [3, 3.1, 3], angle: 0 })]);
    assert.equal(R.pieceSolidAt(pillar, 6.6, 1, 5.5), true, 'a tile from its middle, inside its round');
    assert.equal(R.pieceSolidAt(pillar, 6.9, 1, 6.9), false, 'the corner of its box is outside the round');
    assert.equal(R.pieceSolidAt(pillar, 6.6, 3.5, 5.5), false, 'over its top');
    assert.equal(R.pieceSolidAt(pillar, 6.6, 1, 5.5, null, 0.8), true, 'and wide enough that a camera comes in for it');
    // A cone narrows to its point; a wedge is solid under its slope; a turned box follows its angle.
    const shapes = mapWith([
        piece(1, 'cone', 3, 3, 0, { size: [2, 4, 2], angle: 0 }),
        piece(2, 'wedge', 8, 3, 0, { size: [2, 2, 2], angle: 0 }),
        piece(3, 'box', 3, 9, 0, { size: [4, 1, 0.4], angle: 45 })
    ]);
    assert.equal(R.pieceSolidAt(shapes, 4.2, 0.2, 3.5), true, 'the cone\'s foot is wide');
    assert.equal(R.pieceSolidAt(shapes, 4.2, 3, 3.5), false, 'near its point it is not');
    assert.equal(R.pieceSolidAt(shapes, 3.5, 3, 3.5), true, 'its middle is solid most of the way up');
    assert.equal(R.pieceSolidAt(shapes, 8.5, 1.6, 4.3), true, 'under the wedge\'s high end');
    assert.equal(R.pieceSolidAt(shapes, 8.5, 1.6, 2.7), false, 'over its low end');
    assert.equal(R.pieceSolidAt(shapes, 4.5, 0.5, 10.5), true, 'along the turned board');
    assert.equal(R.pieceSolidAt(shapes, 4.5, 0.5, 8.5), false, 'across from it');
});

test('a slab laid at a tilt is solid where it is drawn', () => {
    const slab = piece(1, 'box', 6, 6, 3, { size: [4, 0.2, 3], angle: 30, tilt: 35 });
    const map = mapWith([slab]);
    const stored = R.piecesOf(map)[0], at = R.shapePlacer(stored, 0);
    for (const [u, y, v] of [[0.5, 0.5, 0.5], [0.1, 0.5, 0.1], [0.9, 0.5, 0.9], [0.9, 0.5, 0.1]]) {
        const p = at(u, y, v);
        assert.equal(R.pieceSolidAt(map, p[0], p[1], p[2]), true, `inside at ${u},${y},${v}`);
        assert.equal(R.pieceSolidAt(map, p[0], p[1] + 0.3, p[2]), false, `clear a little over it at ${u},${v}`);
        assert.equal(R.pieceSolidAt(map, p[0], p[1] - 0.3, p[2]), false, `and a little under it at ${u},${v}`);
    }
    const past = at(1.15, 0.5, 0.5);
    assert.equal(R.pieceSolidAt(map, past[0], past[1], past[2]), false, 'past its end');
    assert.equal(R.pieceSolidAt(map, at(0.5, 0.5, 0.5)[0], at(0.5, 0.5, 0.5)[1], at(0.5, 0.5, 0.5)[2], null, 0.8), true, 'a roof slab is thin one way only: a camera comes in for it');
});

test('a doorway is open under its lintel; a door is solid while it stands shut', () => {
    const map = mapWith([piece(1, 'doorway', 3, 3, 0), piece(2, 'door', 6, 3, 0, { style: 'plank', width: 1 }), piece(3, 'door', 9, 3, 0, { style: 'gate', width: 1 })]);
    assert.equal(R.pieceSolidAt(map, 3.5, 2, 3.5), false, 'through the doorway');
    assert.equal(R.pieceSolidAt(map, 3.5, 4.7, 3.5), true, 'in its lintel');
    const doors = R._doorStates;
    try {
        R._doorStates = null;
        assert.equal(R.pieceSolidAt(map, 6.5, 2, 3.5), false, 'where nothing swings doors (the editor) a door is a way through, as it is to a shot');
        assert.equal(R.pieceSolidAt(map, 6.5, 4.5, 3.5), true, 'under the wall over it');
        R._doorStates = new Map([[2, { open: false, t: 0 }], [3, { open: false, t: 0 }]]);
        assert.equal(R.pieceSolidAt(map, 6.5, 2, 3.5), true, 'a shut leaf');
        assert.equal(R.pieceSolidAt(map, 6.5, 4.5, 3.5), true, 'the wall over the leaf');
        assert.equal(R.pieceSolidAt(map, 9.5, 1, 3.5), true, 'a shut gate');
        assert.equal(R.pieceSolidAt(map, 9.5, 3, 3.5), false, 'nothing over a gate');
        R._doorStates.get(2).open = true; R._doorStates.get(2).t = 1;
        assert.equal(R.pieceSolidAt(map, 6.5, 2, 3.5), false, 'swung open, it is a way through');
        assert.equal(R.pieceSolidAt(map, 6.5, 4.5, 3.5), true, 'under the same wall');
        // On its way shut (told to shut, its leaves not yet across): open to a look, and to a camera that asks
        // ahead it is shut already, so the camera has come in by the time the leaves meet.
        R._doorStates.get(2).open = false; R._doorStates.get(2).t = 0.8;
        assert.equal(R.pieceSolidAt(map, 6.5, 2, 3.5), false, 'still swinging: a look passes');
        assert.equal(R.pieceSolidAt(map, 6.5, 2, 3.5, null, 0, R.DOORS_CLOSING), true, 'asked ahead, it counts');
        const from = { x: 6.5, y: 2, z: 7.5 }, to = { x: 6.5, y: 2, z: 0.5 };
        assert.equal(R.cameraArm(map, from, to), 7, 'the way through a door still swinging is open');
        assert.equal(R.cameraArmHit, false);
        const ahead = R.cameraArm(map, from, to, 0, undefined, undefined, 'closing');
        assert.ok(R.cameraArmHit && ahead > 3 && ahead < 3.6, 'and shut to a camera asking ahead: ' + ahead.toFixed(2));
        R._doorStates.get(2).open = true;
        assert.equal(R.cameraArm(map, from, to, 0, undefined, undefined, 'closing'), 7, 'a door swinging open is no door on its way shut');
        assert.equal(R.cameraArm(map, { x: 3.5, y: 4.7, z: 7.5 }, { x: 3.5, y: 4.7, z: 0.5 }, 0, undefined, undefined, 'ground'), 7, 'only the ground counts when what is built has been opened');
    } finally { R._doorStates = doors; }
});

test('the map\'s own camera passes over a door and under a lintel; a wall still moves it', () => {
    const map = mapWith([piece(1, 'doorway', 3, 3, 0), piece(2, 'door', 6, 3, 0, { style: 'plank', width: 1 }), piece(3, 'wall', 9, 3, 0)]);
    const camera = new THREE.PerspectiveCamera();
    const shared = R.cutawayUniforms(), radius = shared.rrCutRadius.value;
    const doors = R._doorStates;
    const moved = (x, y, z) => {
        // Trailing a player who has walked south out through the cell: 25 degrees up behind, as the map's camera stands.
        const focus = { x, y: 1.2, z: z + (y - 1.2) / Math.tan(25 * Math.PI / 180) };
        camera.position.set(x, y, z); camera.updateMatrixWorld();
        const did = R.clearCameraPath(camera, focus, map);
        return did || camera.position.distanceTo(new THREE.Vector3(x, y, z)) > 1e-9;
    };
    try {
        shared.rrCutRadius.value = 0;
        R._doorStates = new Map([[2, { open: false, t: 0 }]]);
        // The camera stands about 4.4 over the ground: in the wall over a door's leaves, in a doorway's lintel.
        assert.equal(R.pieceSolidAt(map, 6.5, 4.4, 3.5), true, 'the wall over the leaves is there to a battle\'s camera');
        assert.equal(moved(6.5, 4.4, 3.5), false, 'over a door: left where it is (coming in for that one cell was a jump of more than a tile)');
        assert.equal(moved(3.5, 4.6, 3.5), false, 'in a doorway\'s lintel: left where it is');
        assert.equal(moved(6.5, 2, 3.5), false, 'nor do shut leaves move it: it trails its player through');
        assert.equal(moved(9.5, 4.4, 3.5), true, 'inside a wall it comes in, as ever');
    } finally { R._doorStates = doors; shared.rrCutRadius.value = radius; }
});

test('a camera stands back only as far as the world leaves it', () => {
    const map = mapWith([
        piece(1, 'wall', 8, 5, 0), piece(2, 'wall', 8, 4, 0), piece(3, 'wall', 8, 6, 0),
        piece(4, 'cylinder', 5, 9, 0, { size: [0.24, 4, 0.24], angle: 0 }),
        piece(5, 'box', 3, 12, 0, { size: [3, 3, 0.2], angle: 0 })
    ]);
    const focus = { x: 5.5, y: 1.9, z: 5.5 };
    const clear = R.cameraArm(map, focus, { x: 5.5, y: 3, z: 0.5 });
    assert.ok(Math.abs(clear - Math.hypot(1.1, 5)) < 1e-9, 'nothing in the way: the whole length');
    assert.equal(R.cameraArmHit, false);
    const walled = R.cameraArm(map, focus, { x: 13.5, y: 3, z: 5.5 }, 0.3);
    assert.equal(R.cameraArmHit, true);
    // The wall's face is at x 8: 2.5 tiles along the ground from the focus, less the margin.
    const along = walled * 8 / Math.hypot(8, 1.1);
    assert.ok(along > 2.5 - R.CAMERA_ARM_MARGIN - 0.06 && along < 2.5 - R.CAMERA_ARM_MARGIN + 0.01, 'stops a margin short of the wall\'s face: ' + along.toFixed(3));
    // The answer does not step as the way swings along the wall: found to a hair, not to the stride.
    const a = R.cameraArm(map, focus, { x: 13.5, y: 3, z: 5.5 }) * 8 / Math.hypot(8, 1.1);
    const b = R.cameraArm(map, focus, { x: 13.5, y: 3, z: 5.6 }) * 8 / Math.hypot(8, 1.1, 0.1);
    assert.ok(Math.abs(a - b) < 0.03, 'a little turn, a little change: ' + (a - b).toFixed(4));
    assert.equal(R.cameraArm(map, { x: 7.5, y: 1.9, z: 5.5 }, { x: 13.5, y: 3, z: 5.5 }, 0.3), 0.3, 'against the wall it comes in to the least, never through');
    // A lamp post is walked past; a board a fifth of a tile thick is not stepped over.
    const post = R.cameraArm(map, { x: 5.5, y: 1.9, z: 7.5 }, { x: 5.5, y: 1.9, z: 12.5 });
    assert.equal(post, 5, 'a post does not bring the camera in');
    const board = R.cameraArm(map, { x: 3.5, y: 1.5, z: 9.55 }, { x: 3.5, y: 1.5, z: 15.5 });
    assert.equal(R.cameraArmHit, true, 'a thin board is met');
    assert.ok(board < 3, 'and the camera stays this side of it: ' + board.toFixed(2));
    // Under the ground.
    const hill = mapWith([]);
    hill.reactor3d.elevation[5 * 16 + 9] = 4; hill.reactor3d.elevation[5 * 16 + 10] = 4;
    const banked = R.cameraArm(hill, focus, { x: 12.5, y: 2, z: 5.5 });
    assert.equal(R.cameraArmHit, true, 'ground counts as it does for the map\'s own camera');
    assert.ok(banked < 3.6, 'the camera stops before the bank: ' + banked.toFixed(2));
    assert.equal(R.cameraArm(mapWith([]), focus, { x: 12.5, y: 2, z: 5.5 }), 7 * Math.hypot(1, 0.1 / 7), 'an empty map: the whole way');
});

test('the cutaway opens a corridor only where something built hides a player inside a building, and fades scenery but no character', t => {
    const scene = Object.create(R.MapScene.prototype);
    const camera = new THREE.PerspectiveCamera();
    const shared = R.cutawayUniforms();
    // A knee-high rim (as the Demo's fountain: a ring 0.6 over the square) between the eye and the player.
    const rim = mapWith([piece(1, 'tube', 8, 8, 0, { size: [7.4, 0.6, 7.4], angle: 0, thick: 0.14 })]);
    camera.position.set(8.5, 4, 16); camera.updateMatrixWorld();
    scene.updateCutaway(camera, rim, { _realX: 8, _realY: 8 });
    assert.equal(shared.rrCutFocusCount.value, 0, 'the eye sees over a rim: no corridor through it');
    assert.equal(shared.rrCutRadius.value, R.CUTAWAY_RADIUS, 'the cut itself stays live');
    // Walking outside, a building between the camera and the player stays whole: no corridor.
    const street = mapWith([piece(1, 'wall', 7, 11, 0), piece(2, 'wall', 8, 11, 0), piece(3, 'wall', 9, 11, 0)]);
    scene.updateCutaway(camera, street, { _realX: 8, _realY: 8 });
    assert.equal(shared.rrCutFocusCount.value, 0, 'outside, a wall in the way is not seen through');
    // Inside a building (a ceiling over the player), a wall between them is cover.
    const walled = mapWith([piece(1, 'wall', 7, 11, 0), piece(2, 'wall', 8, 11, 0), piece(3, 'wall', 9, 11, 0), piece(4, 'floor', 8, 8, R.PIECE_STOREY)]);
    scene.updateCutaway(camera, walled, { _realX: 8, _realY: 8 });
    assert.equal(shared.rrCutFocusCount.value, 1, 'inside, a wall in the way opens');
    assert.deepEqual(Array.from(shared.rrCutFoci.value.slice(0, 3)), [8.5, 1.5, 8.5]);
    // A wall at the character's back hides nothing of it.
    const behind = mapWith([piece(1, 'wall', 8, 7, 0)]);
    scene.updateCutaway(camera, behind, { _realX: 8, _realY: 8 });
    assert.equal(shared.rrCutFocusCount.value, 0);
    // Company: with the player outside nothing opens, a follower behind a wall included.
    const hidden = { _realX: 8, _realY: 8 }, open = { _realX: 12, _realY: 13 };
    scene.updateCutaway(camera, walled, open, [hidden]);
    assert.equal(shared.rrCutFocusCount.value, 0, 'the player walking outside: no corridor for anyone');
    // In a battle here the corridors open outside too: the one behind the wall is kept in sight.
    const beforeFight = global.$gameFight;
    global.$gameFight = { isHere: () => true };
    try { scene.updateCutaway(camera, walled, open, [hidden]); } finally { global.$gameFight = beforeFight; }
    assert.equal(shared.rrCutFocusCount.value, 1);
    assert.deepEqual(Array.from(shared.rrCutFoci.value.slice(0, 3)), [8.5, 1.5, 8.5], 'the first corridor is the hidden one\'s');
    // Who the picture shows through a wall is in plain view (a number on it is shown); who stands in the open has
    // no corridor, the player's company included.
    assert.equal(R.cutawayShows(hidden, 8.5, 8.5), true, 'a corridor is held open to it');
    assert.equal(R.cutawayShows(open, 12.5, 13.5), false);
    scene.updateCutaway(camera, walled, hidden, [open]);
    assert.equal(shared.rrCutFocusCount.value, 1, 'the player\'s own corridor only: one of the company in the open gets none');
    for (let i = 0; i < 3; i++) scene.updateCutaway(camera, walled, open);
    assert.equal(R.cutawayShows(hidden, 8.5, 8.5), false, 'no longer followed: no longer shown');
    // A tactical battle's ground: nothing built may hide who stands on it.
    const box = shared.rrFightBox.value;
    box[0] = 5; box[1] = 5; box[2] = 12; box[3] = 12;
    assert.equal(R.cutawayShows(null, 8.5, 8.5), true, 'on the battle\'s ground');
    assert.equal(R.cutawayShows(null, 13.5, 8.5), false, 'off it');
    box[0] = box[1] = box[2] = box[3] = 0;
    assert.equal(R.cutawayShows(null, 8.5, 8.5), false);
    // A placed model thins near the line from the eye to the player. The characters' own models are marked as
    // bodies, which the fade passes by, battle or not; scenery still thins.
    const { source3D } = require('./helpers/runtime-3d-source.cjs');
    const has = (pattern, why) => assert.ok(pattern.test(source3D()), why);
    // (A character's body, 1; a ridden vehicle, its rider's body while ridden, 2.)
    has(/"if \(rrCutRadius > 0\.0 && rrCutBody < 0\.5 && vRRWorldPos\.y > rrCutFocus\.y - 1\.2\) \{"/, 'the sight-line fade asks the material whether it is a body: a follower behind the player is never cut part-way');
    has(/"if \(rrCutBody < 0\.5 && vRRWorldPos\.y > rrFightStump\) discard;"/, 'the cut that takes scenery out of a Tactical battle\'s way passes a body by too: a bystander is no scenery');
    has(/shader\.uniforms\.rrCutBody = material\.userData\.rrCutBody \|\| \(material\.userData\.rrCutBody = \{ value: 0 \}\);/, 'every model material carries the mark, off until set');
    has(/uniform float rrCutBody;\\nuniform float rrCutBattle;/, 'and the shader is told whether a battle runs');
    const model = () => new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    const player = { _realX: 8, _realY: 8, followers: () => ({ visibleFollowers: () => [follower] }) }, follower = { _realX: 7, _realY: 8 };
    const raider = { _realX: 9, _realY: 12, eventId: () => 3 }, tree = { _realX: 9, _realY: 13, eventId: () => 10004 }, late = { _realX: 5, _realY: 12, eventId: () => 4 };
    const holders = new Map([[player, { object: model() }], [follower, { object: model() }], [raider, { object: model() }], [tree, { object: model() }]]);
    const marked = character => { const holder = holders.get(character), mark = holder && holder.object.material.userData.rrCutBody; return mark ? mark.value : 0; };
    t.mock.method(R, 'modelHolderFor', character => holders.get(character) || null);
    const before = { fight: global.$gameFight, map: global.$gameMap, player: global.$gamePlayer };
    try {
        global.$gamePlayer = player; global.$gameMap = { events: () => [raider, tree, late] };
        global.$gameFight = undefined;
        for (let i = 0; i < R.CUTAWAY_BODY_FRAMES + 2; i++) scene.updateCutaway(camera, walled, player);
        assert.deepEqual(Array.from(shared.rrCutFocus.value), [8.5, 1.5, 8.5], 'the sight line ends at the player');
        assert.deepEqual([marked(player), marked(follower), marked(raider), marked(tree)], [1, 1, 1, 0], 'on the map the characters are bodies too; scenery is not');
        assert.equal(shared.rrCutBattle.value, 0);
        global.$gameFight = { isHere: () => false };
        for (let i = 0; i < R.CUTAWAY_BODY_FRAMES + 2; i++) scene.updateCutaway(camera, walled, player);
        assert.equal(shared.rrCutBattle.value, 0, 'a battle kept on another map is not here');
        global.$gameFight = { isHere: () => true };
        holders.set(late, { object: model() });
        scene.updateCutaway(camera, walled, player);
        assert.deepEqual([marked(late), shared.rrCutBattle.value], [1, 1], 'a battle looks again from its first frame, not half a second in');
        for (let i = 0; i < R.CUTAWAY_BODY_FRAMES + 2; i++) scene.updateCutaway(camera, walled, player);
        assert.deepEqual([marked(player), marked(follower), marked(raider)], [1, 1, 1], 'in a battle the player, the followers and every character are bodies: never dithered');
        assert.equal(marked(tree), 0, 'scenery is not: a bough in the way still thins');
        assert.equal(shared.rrCutBattle.value, 1, 'and the shader is told the battle runs');
        // The same line, carried on past the player: with the party marked the fade may reach up to their backs.
        const e = shared.rrCutEye.value, f = shared.rrCutFocus.value, whole = Math.hypot(8.5 - e[0], 1.5 - e[1], 8.5 - e[2]);
        assert.ok(Math.abs(Math.hypot(f[0] - e[0], f[1] - e[1], f[2] - e[2]) - (whole + R.CUTAWAY_PARTY_ROOM - R.CUTAWAY_BATTLE_ROOM)) < 1e-9, 'the fade stops ' + R.CUTAWAY_BATTLE_ROOM + ' short of the player in a battle');
        assert.ok(Math.abs((f[0] - e[0]) * (1.5 - e[1]) - (f[1] - e[1]) * (8.5 - e[0])) < 1e-9 && Math.abs((f[2] - e[2]) * (1.5 - e[1]) - (f[1] - e[1]) * (8.5 - e[2])) < 1e-9, 'along the same line');
        assert.match(source3D(), /rrAlong < rrSightLength - 3\.5\) \{"/, 'the shader\'s own room, which that number answers');
        // Through the eyes (the eye over the player's own chest) the line is left as it is: nothing thins round the eye.
        const head = new THREE.PerspectiveCamera(); head.position.set(8.6, 2.8, 8.4); head.updateMatrixWorld();
        scene.updateCutaway(head, walled, player);
        assert.deepEqual(Array.from(shared.rrCutFocus.value), [8.5, 1.5, 8.5]);
        assert.equal(shared.rrCutFocusCount.value, 1, 'walls still open for who they hide');
        // A model that arrives later (a unit spawned, a model still loading) is found on a later look.
        const later = { _realX: 6, _realY: 12, eventId: () => 6 };
        global.$gameMap = { events: () => [raider, tree, later] };
        holders.set(later, { object: model() });
        for (let i = 0; i < R.CUTAWAY_BODY_FRAMES + 2; i++) scene.updateCutaway(camera, walled, player);
        assert.equal(marked(later), 1);
        // One mark per material, as the shader reads it; a marked model is not walked again.
        assert.equal(R.cutawayMarkBody(raider), false);
        // A map with nothing built has bodies too (a bystander on a tactical battle's ground), and a view that
        // follows a unit (the tactical view) still marks the player.
        const bare = mapWith([]), unmarked = { _realX: 3, _realY: 3, eventId: () => 5 }, lead = { _realX: 4, _realY: 4, followers: player.followers };
        holders.set(unmarked, { object: model() }); holders.set(lead, { object: model() });
        global.$gameMap = { events: () => [unmarked] }; global.$gamePlayer = lead;
        for (let i = 0; i < R.CUTAWAY_BODY_FRAMES + 2; i++) scene.updateCutaway(camera, bare, raider);
        assert.deepEqual([marked(unmarked), marked(lead)], [1, 1]);
        assert.equal(shared.rrCutBattle.value, 1);
        // The battle over: the marks stay, and a character is still no cover on the map.
        global.$gameFight = { isHere: () => false };
        scene.updateCutaway(camera, walled, player);
        assert.equal(shared.rrCutBattle.value, 0);
        assert.equal(marked(raider), 1);
        global.$gameFight = undefined;
        scene.updateCutaway(camera, bare, player);
        assert.equal(shared.rrCutBattle.value, 0);
    } finally { global.$gameFight = before.fight; global.$gameMap = before.map; global.$gamePlayer = before.player; scene.updateCutaway(null, walled, null); }
});

test('a point behind the camera lands outside the picture, on the side it lies', () => {
    const before = global.Graphics;
    global.Graphics = { width: 1600, height: 900 };
    try {
        const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
        camera.position.set(10, 3, 10); camera.lookAt(10, 3, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
        const ahead = R.projectToScreen(camera, 10, 3, 4, {});
        assert.ok(ahead.visible && Math.abs(ahead.x - 800) < 1 && Math.abs(ahead.y - 450) < 1, 'ahead: the middle of the picture');
        for (const [x, y, z, side] of [[10, 3, 14, 'below'], [13, 3, 14, 'right'], [7, 3, 14, 'left'], [10.2, 0.2, 10.4, 'below'], [10, 6, 10.01, 'above']]) {
            const p = R.projectToScreen(camera, x, y, z, {});
            assert.equal(p.visible, false, `${x},${y},${z} is not seen`);
            const out = p.x < -1600 || p.x > 3200 || p.y < -900 || p.y > 1800;
            assert.ok(out, `${x},${y},${z} is put well outside the picture: ${Math.round(p.x)}, ${Math.round(p.y)}`);
            if (side === 'right') assert.ok(p.x > 3200); if (side === 'left') assert.ok(p.x < -1600);
            if (side === 'below') assert.ok(p.y > 1800); if (side === 'above') assert.ok(p.y < -900);
            assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
        }
        const far = R.projectToScreen(camera, 10, 3, -600, {});
        assert.equal(far.visible, false, 'past the far plane is not seen either');
        assert.ok(Math.abs(far.x - 800) < 1, 'but stays where it is');
        const scratch = {};
        assert.equal(R.projectToScreen(camera, 10, 3, 14, scratch), scratch, 'the caller\'s record is filled, nothing new is made');
    } finally { global.Graphics = before; }
});

test('the first-person eye is placed by the look, in front of the model\'s own face: never inside the head of a body that is drawn', t => {
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 3, z: 0.6 };
    const character = { _realX: 20, _realY: 30 };
    const holder = { object, cameraBaseX: 20, cameraBaseZ: 30, cameraBaseY: 0 };
    t.mock.method(R, 'modelHolderFor', () => holder);
    // The stock rule for everyone else; for the player in first person, what the eye says of itself.
    let hidden = false;
    const stock = R.characterHiddenByCamera;
    t.mock.method(R, 'characterHiddenByCamera', (who, model) => hidden || (who === character && R.Camera.playerEyes.inside === true));
    // The model's eyes: 2.76 up, 0.32 ahead of its upright axis (its front is its +z).
    const eyes = ahead => R.bindModelLandmarks(object, { eyes: { part: '', offset: [0, 2.76, ahead] } });
    eyes(0.32);
    object.position.set(20.5, 0, 30.5);
    const look = R.Camera.look, yawWas = look.yaw, E = R.Camera.EYE, mapWas = global.$dataMap;
    const DEG = Math.PI / 180, face = 0.32 + E.lead;
    try {
        global.$dataMap = mapWith([], 48);
        const at = yaw => { look.yaw = yaw; object.updateMatrixWorld(true); return R.Camera.playerEyes(character, 0).clone(); };
        const out = eye => Math.hypot(eye.x - 20.5, eye.z - 30.5);
        assert.ok(E.least < 0.32 && E.most > 0.6 && E.lead > E.outside && E.outside > E.inside, 'a face is farther out than the least the eye stands ahead; a run\'s lean is within the most; in the open the eye is clear of the face');
        assert.ok(E.clear > 0.1 && E.corner >= 0.1 * Math.hypot(1, Math.tan(35 * DEG), Math.tan(35 * DEG) * 16 / 9), 'the room kept is the near plane\'s (0.1) and its corners\' at a 70 degree view');
        // The body turned to the look: the eye is a little in front of the model's own eyes, on their line.
        for (const yaw of [0, 90, 180, 270]) {
            object.rotation.y = Math.PI - yaw * DEG;
            const eye = at(yaw), own = R.modelLandmarkWorld(object, 'eyes', new THREE.Vector3());
            assert.ok(Math.abs(eye.distanceTo(own) - E.lead) < 1e-9 && out(eye) > out(own), 'facing the look at yaw ' + yaw + ': just in front of the model\'s eyes');
            assert.equal(R.Camera.playerEyes.inside, false);
        }
        // The body snaps between four facings as the look crosses a diagonal: the eye must not move with it.
        object.rotation.y = Math.PI;
        const a = at(44);
        object.rotation.y = Math.PI / 2;
        const b = at(46);
        assert.ok(a.distanceTo(b) < 0.02, 'two degrees of look move the eye a hair, whichever way the body faces: ' + a.distanceTo(b).toFixed(4));
        // All the way round: a circle about the middle of the cell as wide as the face stands out, at the eyes' height.
        for (let yaw = 0; yaw < 360; yaw += 45) {
            object.rotation.y = Math.random() * 6;
            const eye = at(yaw);
            assert.ok(Math.abs(out(eye) - face) < 1e-9, 'yaw ' + yaw + ': as far out as the face and a little, ' + out(eye).toFixed(3));
            assert.ok(Math.abs(eye.x - (20.5 + Math.sin(yaw * DEG) * face)) < 1e-9 && Math.abs(eye.z - (30.5 - Math.cos(yaw * DEG) * face)) < 1e-9, 'ahead along the look at yaw ' + yaw);
            assert.ok(Math.abs(eye.y - 2.76) < 1e-9, 'the height is the model\'s');
        }
        // A pose that leans the head forward (a run carries it half a tile out): the eye is out with it at once,
        // never overtaken by the face, and comes back in over a few frames.
        eyes(0.56);
        assert.ok(Math.abs(out(at(0)) - (0.56 + E.lead)) < 1e-9, 'out with the head at once');
        assert.equal(R.Camera.playerEyes.inside, false);
        eyes(0.32);
        const first = out(at(0));
        assert.ok(first < 0.56 + E.lead && first > 0.5, 'back in a little a frame: ' + first.toFixed(3));
        for (let i = 0; i < 60; i++) at(0);
        assert.ok(Math.abs(out(at(0)) - face) < 1e-9);
        // A wall in the next cell north: the eye stops short of it by the room the near plane needs, however far
        // the head leans; looking away from the wall it is out with the face.
        global.$dataMap = mapWith([piece(1, 'wall', 20, 29, 0)], 48);
        assert.ok(Math.abs(out(at(0)) - (0.5 - E.clear)) < 0.02, 'standing at the wall: short of its face, ' + out(at(0)).toFixed(3));
        assert.ok(out(at(0)) > 0.32, 'yet still in front of the model\'s own eyes');
        assert.equal(R.Camera.playerEyes.inside, false, 'so the body stays in the picture');
        // Looking along the wall, the near plane's corner would be in it: the eye stands back a little more.
        // (At 20 degrees off the wall's own line the middle of the near plane has room and its left corner has not.)
        const along = at(20), cornerZ = along.z - Math.cos((20 - E.spread) * DEG) * E.corner;
        assert.ok(cornerZ >= 30 - 1e-9, 'the corner toward the wall is this side of its face: ' + cornerZ.toFixed(3));
        assert.ok(out(along) > 0.2 && out(along) < 0.32 + E.lead - 0.01, 'by standing back: ' + out(along).toFixed(3));
        for (let i = 0; i < 40; i++) at(0);
        eyes(0.56);
        const stopped = at(0);
        assert.ok(out(stopped) <= 0.5 - E.clear + 0.02 && stopped.z > 30.5 - 0.5 + E.clear - 0.02, 'run up to the wall: the eye is not through it, ' + out(stopped).toFixed(3));
        // Held back behind its own face, the eye would see the inside of the head: the body is out of the picture.
        assert.equal(R.Camera.playerEyes.inside, true, 'the face is past the eye');
        assert.equal(stock.call(R, character, true), false, 'the stock rule, off a first-person map: nothing is hidden');
        assert.ok(Math.abs(out(at(180)) - (0.56 + E.lead)) < 1e-9, 'away from the wall: out with the face');
        assert.equal(R.Camera.playerEyes.inside, false, 'and the body is back');
        // It does not flicker at the edge, and a body the eye itself hid does not make the eye stand close in.
        at(0);
        assert.equal(R.Camera.playerEyes.inside, true);
        eyes(0.5 - E.clear - E.outside + 0.005);
        for (let i = 0; i < 40; i++) at(0);
        assert.equal(R.Camera.playerEyes.inside, true, 'still out a little inside where it went');
        assert.ok(out(at(0)) > 0.3, 'the eye stays at the wall, not close in');
        eyes(0.32);
        for (let i = 0; i < 40; i++) at(0);
        assert.equal(R.Camera.playerEyes.inside, false);
        global.$dataMap = mapWith([], 48);
        // No pose carries the eye farther than the most (a lunge): the body steps out instead.
        eyes(1.2);
        assert.ok(Math.abs(out(at(0)) - E.most) < 1e-9);
        assert.equal(R.Camera.playerEyes.inside, true);
        eyes(0.32);
        for (let i = 0; i < 80; i++) at(0);
        assert.equal(R.Camera.playerEyes.inside, false);
        // A body the camera has taken out of the picture (a battle through the eyes) has no face to clear: the eye
        // stands close in, eased there, still on the look.
        hidden = true;
        const closing = out(at(90));
        assert.ok(closing < face && closing > face - 0.06, 'eased in, not at once: ' + closing.toFixed(3));
        for (let i = 0; i < 80; i++) at(90);
        const close = at(90);
        assert.ok(Math.abs(out(close) - E.least) < 1e-9 && Math.abs(close.x - (20.5 + E.least)) < 1e-9, 'close in, along the look');
        assert.equal(R.Camera.playerEyes.inside, false, 'hidden by the battle, not by the eye');
        // Drawn again (the battle over): out in front of the face at once.
        hidden = false;
        assert.ok(Math.abs(out(at(90)) - face) < 1e-9, 'never a frame inside the head');
        // A step in progress carries the eye with the character, before the model has been moved.
        character._realX = 20.5;
        const stepping = at(0);
        assert.ok(Math.abs(stepping.x - 21) < 1e-9 && Math.abs(stepping.z - (30.5 - face)) < 1e-9);
    } finally { look.yaw = yawWas; global.$dataMap = mapWas; R.Camera.playerEyes.inside = false; }
});

test('first person: the player\'s own model is out of the picture only while the eye is held back inside its head', t => {
    const before = { player: global.$gamePlayer, map: global.$gameMap };
    const player = {};
    try {
        global.$gamePlayer = player; global.$gameMap = { _reactorCamera3d: { mode: 'firstPerson' } };
        R.Camera.playerEyes.inside = false;
        assert.equal(R.characterHiddenByCamera(player, true), false, 'the body is drawn on a first-person map');
        assert.equal(R.characterHiddenByCamera(player), true, 'its flat sprite never is');
        R.Camera.playerEyes.inside = true;
        assert.equal(R.characterHiddenByCamera(player, true), true, 'held inside its head: the model steps out');
        assert.equal(R.characterHiddenByCamera({}, true), false, 'nobody else\'s does');
        global.$gameMap._reactorCamera3d.mode = 'thirdPerson';
        assert.equal(R.characterHiddenByCamera(player, true), false, 'from behind the player nothing is hidden for the eye\'s sake');
    } finally { global.$gamePlayer = before.player; global.$gameMap = before.map; R.Camera.playerEyes.inside = false; }
});
