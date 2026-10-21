'use strict';
// What is true of a vehicle model (runtime/reactor_3d_vehicles.js): the `vehicle` block of a model's sidecar, what
// is guessed where a file says nothing, the points a rider touches and the parts that follow the driver on a built
// instance, and the attitude a vehicle is drawn at. The engine's own 3D runtime builds every instance here
// (helpers/fight-real-world.cjs); the Demo's real motorcycle is read where a test names it, and those tests skip
// in a tree that does not hold the file.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { realWorld } = require('./helpers/fight-real-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const fixtures = path.join(__dirname, 'fixtures', 'vehicles');
const fixture = name => JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'));
const NINJA = path.join(repo, 'template', 'Demo', '3d', 'Vehicles', 'kawashaki_ninja_h2', 'source', 'kawashaki_ninja_h2.glb');
const real = fs.existsSync(NINJA) ? {} : { skip: 'the Demo motorcycle model is not in this tree' };
const DEG = Math.PI / 180;
const plain = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected, tolerance, what) => assert.ok(Math.abs(actual - expected) <= tolerance, `${what}: ${actual} against ${expected} (within ${tolerance})`);
const closeAll = (actual, expected, tolerance, what) => expected.forEach((value, i) => close(actual[i], value, tolerance, `${what}[${i}]`));

// One world for the file: the 3D runtime in the game's own realm, a floor map, the small database.
const w = realWorld({});
const R = w.Reactor3D, V = R.Vehicles, THREE = w.THREE;
const inWorld = code => vm.runInContext(code, w);
const vec = (x, y, z) => new THREE.Vector3(x, y, z);
const arr = v => [v.x, v.y, v.z];
let ninjaTemplate = null;
const ninja = () => ninjaTemplate || (ninjaTemplate = w.glb(NINJA));
// The motorcycle's box as its loader measures it (model units): what the guess is made from.
const NINJA_BOX = { size: [2.573, 1.406, 1.037] };

/**
 * A toy motorcycle, two units long with its front toward -x like the Demo's: a body, bars, and two wheels whose
 * recorded pivot is the model's origin (as a file's wheel nodes may all be), so only their own boxes say where
 * their axles are.
 */
const toyTemplate = inWorld(`(function() {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const add = (name, geometry, x, y, z) => {
        geometry.translate(x, y, z);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.userData.parts = [{ name, pivot: [0, 0, 0] }, { name: "RootNode", pivot: [0, 0, 0] }];
        root.add(mesh);
    };
    add("Body", new THREE.BoxGeometry(1.2, 0.5, 0.3), 0, 0.65, 0);
    add("Bars", new THREE.BoxGeometry(0.05, 0.05, 0.6), -0.5, 1.0, 0);
    add("WheelF", new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24).rotateX(Math.PI / 2), -0.7, 0.3, 0);
    add("WheelR", new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24).rotateX(Math.PI / 2), 0.7, 0.3, 0);
    root.userData.glbSize = { x: 2, y: 1.025, z: 0.6 };
    return root;
})`)();
const TOY_BLOCK = () => ({ forward: '-x', stand: { lean: 10, side: 'left' }, wheels: ['WheelF', 'WheelR'],
    controls: [{ input: 'steer', shape: 'bars', part: 'Bars', at: [-0.5, 0.6, 0], axis: [0.41, 0.91, 0], degrees: 30, degreesAtSpeed: 7 }],
    seats: [{ posture: 'astride', seat: { at: [0.2, 0.9, 0] }, handL: { at: [-0.5, 1.0, 0.28], part: 'Bars' }, handR: { at: [-0.5, 1.0, -0.28], part: 'Bars' },
        footL: { at: [0.2, 0.4, 0.2] }, footR: { at: [0.2, 0.4, -0.2] } }] });

/** A toy of boxes and wheels: [name, 'box', long, tall, wide, x, y, z] or [name, 'wheel', radius, width, 0, x, y, z]. */
const makeToy = inWorld(`(function(parts, size) {
    const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
    for (const [name, shape, a, b, c, x, y, z] of parts) {
        const geometry = shape === "wheel" ? new THREE.CylinderGeometry(a, a, b, 24).rotateX(Math.PI / 2) : new THREE.BoxGeometry(a, b, c);
        geometry.translate(x, y, z);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.userData.parts = [{ name, pivot: [0, 0, 0] }, { name: "RootNode", pivot: [0, 0, 0] }];
        root.add(mesh);
    }
    root.userData.glbSize = { x: size[0], y: size[1], z: size[2] };
    return root;
})`);
const BODY = ['Body', 'box', 1.2, 0.5, 0.3, 0, 0.65, 0], WHEELS = [['WheelF', 'wheel', 0.3, 0.1, 0, -0.7, 0.3, 0], ['WheelR', 'wheel', 0.3, 0.1, 0, 0.7, 0.3, 0]];
// A motorcycle's hands are guessed 0.36 ahead of the middle, 0.76 up and 0.22 to each side on a model this size.
// This toy has its bars there at its -x end only: that end is its front, and the hands' reach is what says so.
const frontToy = makeToy([BODY, ['Bars', 'box', 0.05, 0.05, 0.6, -0.36, 0.76, 0], ...WHEELS], [2, 1.025, 0.6]);
// Bars at both ends, so the hands cannot tell; what stands ahead of the seat (a hump from -0.3 to 0) can.
const tieToy = makeToy([BODY, ['BarsA', 'box', 0.05, 0.05, 0.6, -0.36, 0.76, 0], ['BarsB', 'box', 0.05, 0.05, 0.6, 0.36, 0.76, 0],
    ['Hump', 'box', 0.3, 0.1, 0.2, -0.15, 0.95, 0], ...WHEELS], [2, 1.025, 0.6]);
// A wheel on the center line and one beside it.
const sideToy = makeToy([BODY, ['Wheel', 'wheel', 0.3, 0.1, 0, -0.8, 0.3, 0], ['Side', 'wheel', 0.3, 0.1, 0, 0.8, 0.3, 0.35]], [2.2, 1.2, 0.8]);

/** An instance built the way the map's model sync builds one, bound at `size` tiles. */
function build(template, sidecar, size = 3.7) {
    const object = R.cloneModelTemplate(template);
    R.applyModelTransform(object, R.readModelTransform(sidecar, null));
    object.userData.glbSize = template.userData.glbSize;
    R.carveModelParts(object, R.readModelParts(sidecar));
    R.applyPivotOverrides(object, R.readModelPivots(sidecar));
    const binding = R.prepareModelInstance(object, object.__reactorClips);
    R.bindModelLandmarks(object, R.readModelLandmarks(sidecar));
    const rules = sidecar ? R.readModelAnimationRules(sidecar) : [];
    const extent = template.userData.glbSize, scale = size / Math.max(extent.x, extent.y, extent.z);
    object.scale.setScalar(scale);
    object.updateMatrixWorld(true);
    return { object, binding, rules, scale, block: object.__reactorVehicle || null };
}
/** Where a part's pivot is, in model space (a pivot is kept in its mesh's own frame). */
function pivotOf(object, name) {
    let found = null;
    object.updateMatrixWorld(true);
    const inverse = new THREE.Matrix4().copy(object.matrixWorld).invert();
    object.traverse(mesh => {
        if (found || !mesh.isMesh || !mesh.userData.parts) return;
        const part = mesh.userData.parts.find(entry => entry.name === name);
        if (part) found = arr(mesh.localToWorld(vec(part.pivot[0], part.pivot[1], part.pivot[2])).applyMatrix4(inverse));
    });
    return found;
}
/** Whether the rule engine keeps a vehicle's rules yet (the `drive` type, a rule's own axis, `exact`). */
const seam = () => {
    const made = R.readModelAnimationRules({ animations: [{ type: 'drive', part: 'x', input: 'steer', axisVector: [0, 1, 0], degrees: 30, exact: true }] });
    return made[0].type === 'drive' && Array.isArray(made[0].axisVector) && made[0].exact === true;
};
const needsSeam = () => seam() ? {} : { skip: 'the rule engine does not keep drive rules yet (a rule\'s own axis, its radius and the drive type in reactor_3d_models.js)' };
/** A stand-in for the ridden vehicle's event, as the game's files write it. */
const ridden = (extra = {}) => Object.assign({ _rrVehicle: 1, _rrBoarded: true, _rrYaw: 0, _rrPitch: 0, _rrLean: 0, _rrSteer: 0, _rrSpeed: 0, _rrTravel: 0, _rrPose: 1,
    eventId() { return 7; } }, extra);
/** The model's own front, up and left turned by an object's drawn attitude. */
function drawn(object, f = [-1, 0, 0]) {
    const q = object.quaternion, front = vec(f[0], f[1], f[2]).applyQuaternion(q), up = vec(0, 1, 0).applyQuaternion(q);
    const left = vec(f[2], 0, -f[0]).applyQuaternion(q);
    return { front: arr(front), up: arr(up), left: arr(left) };
}
const saved = { graphics: w.Graphics.frameCount, player: null };
function reset() {
    V.drive(null, null);
    w.Graphics.frameCount = saved.graphics;
    for (const key of ['_rrRide', '_rrSeated', '_rrMount', '_rrDrive']) delete w.$gamePlayer[key];
}
/** The lean a posed vehicle heading north shows toward its left (west), in degrees: negative is to its left. */
const leanLeft = object => Math.asin(Math.max(-1, Math.min(1, vec(0, 1, 0).applyQuaternion(object.quaternion).x))) / DEG;
const quat = q => [q.x, q.y, q.z, q.w];

//-----------------------------------------------------------------------------
// The block

test('the frame of a front: left is up x front, so no model has to face +Z', () => {
    assert.deepEqual(plain(V.frame('-x')), { f: [-1, 0, 0], l: [0, 0, 1], u: [0, 1, 0] });
    assert.deepEqual(plain(V.frame('+x')), { f: [1, 0, 0], l: [0, 0, -1], u: [0, 1, 0] });
    assert.deepEqual(plain(V.frame('+z')), { f: [0, 0, 1], l: [1, 0, 0], u: [0, 1, 0] });
    assert.deepEqual(plain(V.frame('-z')), { f: [0, 0, -1], l: [-1, 0, 0], u: [0, 1, 0] });
    // A vector is laid on the ground and made a unit.
    const slanted = V.frame([3, 5, 4]);
    closeAll(slanted.f, [0.6, 0, 0.8], 1e-12, 'front');
    closeAll(slanted.l, [0.8, 0, -0.6], 1e-12, 'left');
    assert.equal(V.frame('up'), null);
    assert.equal(V.frame([0, 1, 0]), null, 'a front that points straight up is none');
    assert.deepEqual([V.forwardName([-0.9, 0, 0.1]), V.forwardName([0.2, 0, 0.7]), V.forwardName('-z'), V.forwardName(null)], ['-x', '+z', '-z', '']);
});

test("the Demo motorcycle's block, normalized: every list present, every point whole", () => {
    const json = { vehicle: fixture('ninja-vehicle.json') };
    const block = V.read(json, null);
    assert.equal(block.forward, '-x');
    assert.deepEqual([plain(block.f), plain(block.left)], [[-1, 0, 0], [0, 0, 1]]);
    assert.deepEqual(plain(block.stand), { lean: 10, side: 'left' });
    // A wheel written as a bare name is that part alone; its axle is its part's to give.
    assert.deepEqual(plain(block.wheels), [{ part: 'Front wheel', with: [], at: null, radius: null, side: '', written: false },
        { part: 'Mesh_0010.rip', with: ['Mesh_0007.rip'], at: null, radius: null, side: '', written: false }]);
    assert.equal(block.controls.length, 1);
    const control = block.controls[0];
    assert.deepEqual([control.input, control.shape, control.part, control.degrees, control.degreesAtSpeed], ['steer', 'bars', 'Steering', 30, 7]);
    assert.deepEqual(plain(control.at), [-0.644, 0.873, 0]);
    close(Math.hypot(...control.axis), 1, 1e-12, 'the line is a unit');
    closeAll(control.axis, [0.4108, 0.9117, 0], 0.0005, 'the line leans back 24 degrees');
    assert.equal(block.seats.length, 1);
    const seat = block.seats[0];
    assert.equal(seat.posture, 'astride');
    assert.deepEqual(plain(seat.seat), { at: [0.335, 1.019, 0], part: '', follows: '', along: null });
    assert.deepEqual([plain(seat.handL.at), seat.handL.part, seat.handL.follows], [[-0.465, 1.037, 0.377], 'Steering', 'steer']);
    assert.deepEqual([plain(seat.handR.at), seat.handR.part], [[-0.481, 1.05, -0.348], 'Steering']);
    close(Math.hypot(...seat.handL.along), 1, 1e-12, 'the knuckle line is a unit');
    closeAll(seat.handL.along, [0.453, -0.324, 0.831], 0.002, 'along');
    assert.deepEqual([plain(seat.footL.at), plain(seat.footR.at), seat.footL.follows], [[0.32, 0.496, 0.295], [0.32, 0.496, -0.295], '']);
    assert.deepEqual(plain(block.tracks), []);
    assert.deepEqual(plain(block.guessed), { forward: false, wheels: false, controls: false, seats: false });
    assert.deepEqual(plain(block.problems), []);
    // The same sidecar answers the same block, with a box or without, and the file is not written to.
    assert.equal(V.read(json, null), block);
    assert.equal(V.read(json, NINJA_BOX), block);
    assert.deepEqual(json.vehicle, fixture('ninja-vehicle.json'));
    // The block alone, outside a sidecar, reads the same.
    assert.deepEqual(plain(V.read(fixture('ninja-vehicle.json'), null)), plain(block));
    // A sidecar given another `vehicle` object is read again; one changed in place is, once it is forgotten.
    json.vehicle = Object.assign({}, json.vehicle, { forward: '+x' });
    const changed = V.read(json, null);
    assert.notEqual(changed, block);
    assert.equal(changed.forward, '+x');
    json.vehicle.forward = '-z';
    assert.equal(V.read(json, null).forward, '+x', 'a change in place is not seen by itself');
    V.forget(json);
    assert.equal(V.read(json, null).forward, '-z');
    assert.deepEqual(plain(V.pointNames(block)), ['ride.0.seat', 'ride.0.handL', 'ride.0.handR', 'ride.0.footL', 'ride.0.footR', 'control.0']);
});

test('a model no tool has opened: the seat, the hands, the feet and the steering line are guessed from its box, and said to be', () => {
    const json = { animations: [], surface: {} };
    const block = V.read(json, NINJA_BOX);
    assert.deepEqual(plain(block.guessed), { forward: true, wheels: true, controls: true, seats: true });
    // With nothing to look at, the front is the positive end of the longer side.
    assert.equal(block.forward, '+x');
    assert.equal(block.seats.length, 1);
    assert.equal(block.controls.length, 1);
    assert.deepEqual([block.controls[0].part, block.controls[0].shape, block.controls[0].degrees, block.controls[0].degreesAtSpeed], ['', 'bars', 30, 7]);
    assert.deepEqual(plain(block.wheels), [], 'the game finds no wheels by itself: none turns');
    assert.equal(block.stand, null, 'with no stand written it stands upright');
    // Without a box nothing can be guessed yet; the same sidecar is completed the first time one comes.
    const late = { surface: {} };
    const before = V.read(late, null);
    assert.deepEqual([before.seats.length, before.controls.length], [0, 0]);
    assert.equal(V.read(late, NINJA_BOX), before);
    assert.deepEqual([before.seats.length, before.controls.length], [1, 1]);
    // A kind whose rider is inside has no seat to guess.
    for (const kind of ['tank', 'airship', 'shuttle']) assert.deepEqual(plain(V.read(null, NINJA_BOX, kind).seats), [], kind);
    // A file that wrote its seats keeps them; only what it left out is filled.
    const partial = { vehicle: { forward: '-x', seats: [{ seat: { at: [0.3, 1, 0] }, handL: { at: [-0.5, 1, 0.4] }, handR: { at: [-0.5, 1, -0.4] } }] } };
    const filled = V.read(partial, NINJA_BOX);
    assert.deepEqual(plain(filled.guessed), { forward: false, wheels: true, controls: true, seats: false });
    assert.deepEqual(plain(filled.seats[0].seat.at), [0.3, 1, 0]);
    assert.equal(filled.seats[0].footL, null, 'a foot the file leaves out stays in the stance');
    closeAll(filled.controls[0].at, [-0.5, 1, 0], 1e-9, 'the steering line goes through the middle of the two hands');
    closeAll(filled.controls[0].axis, [Math.sin(24 * DEG), Math.cos(24 * DEG), 0], 0.001, 'leaning back 24 degrees');
});

test('what a block gets wrong is left out and reported, never thrown', () => {
    const block = V.read({ vehicle: { forward: 'sideways', wheels: ['A', 7, { part: '' }, { part: 'B', with: ['C', 3], at: [1, 0.3, 0], radius: 0.3, side: 'left' }],
        controls: [{ input: 'steer' }, { input: 'steer', part: 'Bars', axis: [0, -2, 0], degrees: 200, degreesAtSpeed: 400 }, { shape: 'wheel', at: [0, 1, 0], degrees: 120 }],
        seats: [{ handL: { at: [0, 1, 0] } }, { seat: { at: [0, 1] } }, { seat: [0.2, 1, 0], handL: { at: ['x', 1, 0] }, footL: { at: [0.2, 0.4, 0.2], follows: 'throttle' } }],
        tracks: [{ part: 'TrackL', side: 'left' }, { side: 'right' }], guessed: ['seats', 'forward', 'nonsense'] } }, NINJA_BOX);
    assert.deepEqual(plain(block.problems).map(p => p.key), ['badForward', 'badWheel', 'badWheel', 'noSeatPoint', 'badPoint', 'noSeatPoint', 'badPoint', 'controlNeedsAt']);
    assert.equal(block.forward, '+x');
    assert.deepEqual(plain(block.wheels).map(wheel => [wheel.part, wheel.with, wheel.at, wheel.radius, wheel.side, wheel.written]),
        [['A', [], null, null, '', false], ['B', ['C'], [1, 0.3, 0], 0.3, 'left', true]]);
    // A control with a part needs no point; its line is kept pointing up and its turn inside what hands can follow.
    assert.deepEqual(plain(block.controls).map(c => [c.part, c.shape, c.degrees, c.degreesAtSpeed]), [['Bars', 'bars', 180, 180], ['', 'wheel', 120, 90]]);
    assert.deepEqual(plain(block.controls[0].axis), [0, 1, 0]);
    // A seat needs its seat point; a point may be written as a bare triple.
    assert.equal(block.seats.length, 1);
    assert.deepEqual([plain(block.seats[0].seat.at), block.seats[0].handL, block.seats[0].footL.follows], [[0.2, 1, 0], null, 'throttle']);
    assert.deepEqual(plain(block.tracks), [{ part: 'TrackL', side: 'left' }]);
    // What a tool guessed and nobody confirmed is a guess still.
    assert.deepEqual(plain(block.guessed), { forward: true, wheels: false, controls: false, seats: true });
});

test('a point turned about a line', () => {
    const out = [0, 0, 0];
    closeAll(V.turnAbout([1, 0, 0], [0, 0, 0], [0, 1, 0], Math.PI / 2, out), [0, 0, -1], 1e-12, 'a quarter turn about up');
    closeAll(V.turnAbout([2, 5, 0], [1, 0, 0], [0, 1, 0], Math.PI, out), [0, 5, 0], 1e-12, 'about a line that is not through the origin');
    closeAll(V.turnAbout([0.3, 0.7, 0.2], [0.1, 0.1, 0.1], [0.6, 0.8, 0], 0, out), [0.3, 0.7, 0.2], 1e-12, 'no turn');
    closeAll(V.turnAbout([0, 0, 1], [0, 0, 0], [0, 1, 0], Math.PI / 2, out), [1, 0, 0], 1e-12, 'south swings to east about up');
    // Any point about any line, against three.js's own turn.
    const at = [0.2, -0.4, 0.9], axis = vec(0.3, 0.8, -0.5).normalize(), p = [1.1, 0.6, -0.7];
    const expected = vec(p[0] - at[0], p[1] - at[1], p[2] - at[2]).applyAxisAngle(axis, 0.83);
    closeAll(V.turnAbout(p, at, arr(axis), 0.83, out), [expected.x + at[0], expected.y + at[1], expected.z + at[2]], 1e-12, 'a raked line');
    assert.equal(V.turnAbout(p, at, arr(axis), 0.83, out), out, 'into the array it was given');
});

//-----------------------------------------------------------------------------
// What is guessed

test("the guess for the Demo motorcycle's box lands each point within 0.03 model units of where it was measured", () => {
    const want = fixture('ninja-vehicle.json').seats[0];
    const block = V.guess(NINJA_BOX, 'motorcycle', null, { forward: '-x' });
    const seat = block.seats[0];
    for (const name of ['seat', 'handL', 'handR', 'footL', 'footR']) closeAll(seat[name].at, want[name].at, 0.03, name);
    assert.equal(seat.posture, 'astride');
    assert.deepEqual([seat.handL.follows, seat.handR.follows, seat.seat.follows], ['steer', 'steer', '']);
    // The steering line: midway between the hands, leaning back 24 degrees, with no part of its own.
    const control = block.controls[0];
    assert.deepEqual([control.input, control.shape, control.part, control.degrees, control.degreesAtSpeed], ['steer', 'bars', '', 30, 7]);
    closeAll(control.at, [(seat.handL.at[0] + seat.handR.at[0]) / 2, seat.handL.at[1], 0], 0.001, 'the line');
    closeAll(control.axis, [0.41, 0.91, 0], 0.005, 'its direction');
    // A motorcycle rests on a stand; a front that was given is not a guess.
    assert.deepEqual(plain(block.stand), { lean: 10, side: 'left' });
    assert.deepEqual(plain(block.guessed), { forward: false, wheels: true, controls: true, seats: true });
    // The proportions, from the middle on the ground along the model's own front: the other way round they mirror.
    const other = V.guess(NINJA_BOX, 'motorcycle', null, { forward: '+x' }).seats[0];
    closeAll(other.handL.at, [-seat.handL.at[0], seat.handL.at[1], -seat.handL.at[2]], 1e-9, 'mirrored');
    // A model that is long in z is guessed along z.
    const longZ = V.guess({ size: [1, 1.4, 2.6] }, 'motorcycle', null, null);
    assert.equal(longZ.forward, '+z');
    close(longZ.seats[0].seat.at[2], -0.13 * 2.6, 0.001, 'the seat is 0.13 of the length behind the middle');
    // No seat for a kind whose rider is inside; a seated kind sits to the left on a wheel.
    assert.deepEqual(plain(V.guess({ size: [8, 3, 4] }, 'tank', null, null).seats), []);
    const car = V.guess({ size: [4, 1.4, 1.8] }, 'car', null, { forward: '+x' });
    assert.deepEqual([car.seats[0].posture, car.controls[0].shape, car.stand], ['seated', 'wheel', null]);
    close(car.seats[0].seat.at[2], -0.25 * 1.8, 0.001, 'a quarter of the width to the left');
    assert.ok(car.seats[0].handL.at[2] < car.seats[0].handR.at[2] && car.seats[0].handL.at[0] > car.seats[0].seat.at[0], 'hands at nine and three, ahead of the seat');
});

test('the front finder: a front mark decides; with nothing to look at, the positive end of the longer side', () => {
    assert.equal(V.findFront(NINJA_BOX, 'motorcycle', null), '+x');
    assert.equal(V.findFront({ size: [1, 1.4, 2.6] }, 'motorcycle', null), '+z');
    assert.equal(V.findFront(NINJA_BOX, 'motorcycle', null, [-0.685, 0.055, 0.009]), '-x');
    assert.equal(V.findFront(NINJA_BOX, 'motorcycle', null, { front: [0.1, 0, -0.9] }), '-z');
    assert.equal(V.findFront(NINJA_BOX, 'motorcycle', null, [null, { front: [0.02, 0, 0.9] }]), '+z');
    assert.equal(V.findFront(null, 'motorcycle', null), '+x', 'no box at all still answers');
});

test('the front finder answers -x for the Demo motorcycle with no block and no mark', real, () => {
    const template = ninja();
    assert.equal(V.findFront(V.boxOf(template), 'motorcycle', template), '-x');
    assert.equal(V.findFront(null, 'motorcycle', template), '-x', 'the box is the model\'s own when none is given');
    // A kind whose rider is inside has no hands to try: the positive end.
    assert.equal(V.findFront(null, 'tank', template), '+x');
    // The whole guess, set down on the model: the seat on the saddle, the hands on the grips, the wheels found.
    const block = V.guess(null, 'motorcycle', template, null);
    assert.equal(block.forward, '-x');
    assert.equal(block.guessed.forward, true);
    const want = fixture('ninja-vehicle.json').seats[0], seat = block.seats[0];
    close(seat.seat.at[1], want.seat.at[1], 0.01, 'the seat is set down on the saddle');
    close(seat.seat.at[1], V.surfaceUnder(template, seat.seat.at[0], seat.seat.at[2]), 0.001, 'on the top surface under it');
    for (const name of ['handL', 'handR']) closeAll(seat[name].at, want[name].at, 0.04, name + ' on its grip');
    for (const name of ['footL', 'footR']) closeAll(seat[name].at, want[name].at, 0.03, name + ' on its peg');
    // Set down means on the surface: the box's own guess hangs in the air beside the grip, the dropped hand does not.
    const loose = V.guess(null, 'motorcycle', null, { forward: '-x' });
    assert.equal(loose.seats.length, 0, 'with neither a box nor a model there is nothing to guess from');
    const boxed = V.guess(V.boxOf(template), 'motorcycle', null, { forward: '-x' }).seats[0];
    for (const name of ['handL', 'handR']) {
        assert.ok(V.surfaceNear(template, boxed[name].at) > 0.005, name + ': the box alone does not touch the model');
        assert.ok(V.surfaceNear(template, seat[name].at) < 0.002, name + ': the dropped hand is on its surface');
    }
    for (const name of ['footL', 'footR']) close(seat[name].at[1], V.surfaceUnder(template, seat[name].at[0], seat[name].at[2], seat[name].at[1] + 0.05), 0.001, name + ' on what is under it');
    assert.equal(V.surfaceUnder(template, 50, 50), null, 'off the model there is nothing under a point');
    assert.equal(V.surfaceNear(null, [0, 0, 0]), Infinity);
    // The steering line goes through the middle of the hands where they ended up.
    closeAll(block.controls[0].at, [(seat.handL.at[0] + seat.handR.at[0]) / 2, (seat.handL.at[1] + seat.handR.at[1]) / 2, (seat.handL.at[2] + seat.handR.at[2]) / 2], 0.001, 'the line');
    assert.deepEqual(plain(block.wheels).map(wheel => wheel.part), ['Mesh_0009.rip', 'Mesh_0010.rip']);
});

test("the wheel finder finds the Demo motorcycle's wheels as the file's own nodes, each axle from its part's box", real, () => {
    const wheels = plain(V.findWheels(ninja(), '-x'));
    assert.equal(wheels.length, 2);
    const [front, rear] = wheels;
    // Front first. The tire is the wheel; the rim and the disc on its axle turn with it.
    assert.equal(front.part, 'Mesh_0009.rip');
    assert.deepEqual(front.with, ['Mesh_0006.rip', 'Mesh_0014.rip']);
    closeAll(front.at, [-0.912, 0.383, 0], 0.01, 'front axle');
    close(front.radius, 0.376, 0.01, 'front radius');
    assert.equal(rear.part, 'Mesh_0010.rip');
    assert.ok(rear.with.includes('Mesh_0007.rip'), 'the rear rim turns with the rear tire');
    closeAll(rear.at, [0.861, 0.411, -0.003], 0.01, 'rear axle');
    close(rear.radius, 0.411, 0.01, 'rear radius');
    assert.deepEqual([front.side, rear.side], ['', ''], 'both are on the center line');
    // Asked the other way round, the rear comes first: front and back are the caller's.
    assert.equal(V.findWheels(ninja(), '+x')[0].part, 'Mesh_0010.rip');
});

test('on the carved motorcycle the wheel finder finds both: the carved Front wheel and the file\'s rear', real, () => {
    const carved = build(ninja(), { parts: fixture('ninja-parts.json').parts });
    const wheels = plain(V.findWheels(carved.object, '-x'));
    assert.deepEqual(wheels.map(wheel => wheel.part), ['Front wheel', 'Mesh_0010.rip']);
    assert.deepEqual(wheels[0].with, [], 'the tire, rim and disc are one part now');
    closeAll(wheels[0].at, [-0.912, 0.383, 0], 0.01, 'front axle');
    close(wheels[0].radius, 0.376, 0.01, 'front radius');
});

test('the wheel finder on a toy: round, thin and on the ground is a wheel; bars and a body are not', () => {
    const wheels = plain(V.findWheels(toyTemplate, '-x'));
    assert.deepEqual(wheels.map(wheel => [wheel.part, wheel.with, wheel.side]), [['WheelF', [], ''], ['WheelR', [], '']]);
    closeAll(wheels[0].at, [-0.7, 0.3, 0], 0.005, 'front axle');
    closeAll(wheels[1].at, [0.7, 0.3, 0], 0.005, 'rear axle');
    close(wheels[0].radius, 0.3, 0.005, 'radius');
    assert.deepEqual(plain(V.findWheels(null, '-x')), []);
    assert.deepEqual(plain(V.boxOf(toyTemplate)), { min: [-1, 0, -0.3], max: [1, 1.025, 0.3] });
    // A drum is round and on the ground, and as wide as it is tall: not a wheel. A ball hung in the air is not one.
    const drums = inWorld(`(function() {
        const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
        const add = (name, geometry, x, y, z) => { geometry.translate(x, y, z); const mesh = new THREE.Mesh(geometry, material); mesh.userData.parts = [{ name, pivot: [0, 0, 0] }]; root.add(mesh); };
        add("Wheel", new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24).rotateX(Math.PI / 2), -0.8, 0.3, 0);
        add("Drum", new THREE.CylinderGeometry(0.3, 0.3, 0.6, 24).rotateX(Math.PI / 2), 0, 0.3, 0);
        add("Lamp", new THREE.CylinderGeometry(0.2, 0.2, 0.05, 24).rotateX(Math.PI / 2), 0.8, 1.0, 0);
        add("Side", new THREE.CylinderGeometry(0.3, 0.3, 0.1, 24).rotateX(Math.PI / 2), 0.8, 0.3, 0.35);
        root.userData.glbSize = { x: 2.2, y: 1.2, z: 0.8 };
        return root;
    })`)();
    assert.deepEqual(plain(V.findWheels(drums, '-x')).map(wheel => [wheel.part, wheel.side]), [['Wheel', ''], ['Side', 'left']]);
});

test('the guess set down on a toy: the seat on what is under it, the hands on the bars', () => {
    const boxOnly = V.guess(V.boxOf(toyTemplate), 'motorcycle', null, { forward: '-x' }).seats[0];
    const dropped = V.guess(null, 'motorcycle', toyTemplate, { forward: '-x' });
    const seat = dropped.seats[0];
    close(boxOnly.seat.at[1], 0.725 * 1.025, 0.001, 'from the box alone: its proportion of the height');
    close(seat.seat.at[1], 0.9, 0.001, 'on the body\'s top');
    assert.deepEqual([seat.seat.at[0], seat.seat.at[2]], [boxOnly.seat.at[0], boxOnly.seat.at[2]], 'straight down');
    for (const name of ['handL', 'handR']) assert.ok(V.surfaceNear(toyTemplate, seat[name].at) < 0.002 && V.surfaceNear(toyTemplate, boxOnly[name].at) > 0.01, name);
    // The feet find nothing within a tenth of the height under them here (the body is higher, the ground lower): they stay.
    assert.deepEqual(plain(seat.footL.at), plain(boxOnly.footL.at));
    assert.deepEqual(plain(dropped.wheels).map(wheel => wheel.part), ['WheelF', 'WheelR']);
});

//-----------------------------------------------------------------------------
// A built instance: the readers' and the binder's wrappers

test('a sidecar with no vehicle block is read exactly as before: no point, no rule, no pivot added', () => {
    const sidecar = { landmarks: { eyes: { part: '', offset: [0, 1.5, 0.1] } }, pivots: { Body: [0, 0.5, 0] },
        animations: [{ name: 'spin', part: 'WheelF', type: 'spin', axis: 'z', trigger: 'moving', speed: 120 }] };
    assert.deepEqual(Object.keys(R.readModelLandmarks(sidecar)), ['eyes']);
    assert.equal(Object.getOwnPropertyNames(R.readModelLandmarks(sidecar)).includes('__rrVehicle'), false);
    assert.deepEqual(plain(R.readModelPivots(sidecar)), { Body: [0, 0.5, 0] });
    assert.deepEqual(Array.from(R.readModelAnimationRules(sidecar), rule => rule.name), ['spin']);
    assert.deepEqual(Object.keys(R.readModelLandmarks(null)), []);
    const plainInstance = build(toyTemplate, sidecar, 2);
    assert.equal(plainInstance.block, null);
    assert.equal(plainInstance.object.__reactorVehicleBound, undefined);
    assert.deepEqual(Object.keys(plainInstance.object.__reactorLandmarks), ['eyes']);
    assert.equal(V.pointWorld(plainInstance.object, 'ride.0.seat', vec(0, 0, 0)), null);
    assert.equal(V.blockOf(plainInstance.object), null);
});

test('the readers add a vehicle\'s points, pivots and rules to what the sidecar already says', () => {
    const sidecar = { landmarks: { eyes: { part: '', offset: [0, 1.5, 0.1] } }, pivots: { Body: [0, 0.5, 0] }, vehicle: TOY_BLOCK() };
    const points = R.readModelLandmarks(sidecar);
    assert.deepEqual(Object.keys(points), ['eyes', 'ride.0.seat', 'ride.0.handL', 'ride.0.handR', 'ride.0.footL', 'ride.0.footR', 'control.0']);
    // Each is marked as model space and names the part it rides; the block rides along, out of sight of a loop.
    assert.deepEqual(plain(points['ride.0.handL']), { part: 'Bars', offset: [-0.5, 1, 0.28], space: 'model' });
    assert.deepEqual(plain(points['control.0']), { part: '', offset: [-0.5, 0.6, 0], space: 'model' });
    assert.equal(points.__rrVehicle, V.read(sidecar, null));
    assert.equal(Object.keys(points).includes('__rrVehicle'), false);
    // The control's line is its part's pivot; the file's own pivots stay.
    assert.deepEqual(plain(R.readModelPivots(sidecar)), { Body: [0, 0.5, 0], Bars: [-0.5, 0.6, 0] });
    // The rules a block makes: a wheel rolls about the vehicle's left by its own radius, a control turns about its
    // line against it (a turn to the right is clockwise seen from above), each on its own part by its whole name.
    const instance = build(toyTemplate, sidecar, 2);
    assert.deepEqual(plain(V.rulesOf(instance.block)), [
        { name: 'vehicle-wheel-0', type: 'spin', trigger: 'always', part: 'WheelF', radius: 0.3, axisVector: [0, 0, 1], exact: true },
        { name: 'vehicle-wheel-1', type: 'spin', trigger: 'always', part: 'WheelR', radius: 0.3, axisVector: [0, 0, 1], exact: true },
        { name: 'vehicle-control-0', type: 'drive', trigger: 'always', part: 'Bars', input: 'steer', axisVector: plain(instance.block.controls[0].axis).map(n => 0 - n), degrees: 30, exact: true }
    ]);
    const rules = R.readModelAnimationRules(sidecar);
    if (seam()) {
        assert.deepEqual(Array.from(rules, rule => [rule.name, rule.type, rule.part, rule.exact]), [['vehicle-wheel-0', 'spin', 'WheelF', true],
            ['vehicle-wheel-1', 'spin', 'WheelR', true], ['vehicle-control-0', 'drive', 'Bars', true]]);
        assert.deepEqual([rules[0].radius, plain(rules[0].axisVector), rules[2].input, rules[2].degrees], [0.3, [0, 0, 1], 'steer', 30]);
    } else {
        // Until the rule engine keeps them, none is added: a rule it would misread turns nothing.
        assert.equal(rules.length, 0);
    }
});

test('every point of the toy resolves to a node, and reads back in world space where it was written', () => {
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 3);
    const object = instance.object, block = instance.block;
    assert.equal(V.blockOf(object), block);
    assert.deepEqual(plain(block.problems), []);
    object.position.set(12, 0.75, 31);
    object.rotation.y = 0.7;
    object.updateMatrixWorld(true);
    const all = Object.assign({}, { 'wheel.0': block.wheels[0].at, 'wheel.1': block.wheels[1].at, 'control.0': block.controls[0].at });
    for (const name of ['seat', 'handL', 'handR', 'footL', 'footR']) all['ride.0.' + name] = block.seats[0][name].at;
    for (const name of Object.keys(all)) {
        const mark = object.__reactorLandmarks[name];
        assert.ok(mark && mark.node, name + ' has its node');
        const expected = arr(object.localToWorld(vec(all[name][0], all[name][1], all[name][2])));
        closeAll(arr(V.pointWorld(object, name, vec(0, 0, 0))), expected, 1e-9, name);
        // The engine's own landmark reader finds it too.
        closeAll(arr(R.modelLandmarkWorld(object, name, vec(0, 0, 0))), expected, 1e-9, name);
    }
    // A hand rides the bars' own node; a foot rides the whole model.
    assert.equal(object.__reactorLandmarks['ride.0.handL'].node.name, 'Bars');
    assert.equal(object.__reactorLandmarks['ride.0.footL'].node.name, 'anim-root');
    assert.equal(V.pointWorld(object, 'ride.1.seat', vec(0, 0, 0)), null);
    assert.equal(V.pointWorld(null, 'ride.0.seat', vec(0, 0, 0)), null);
});

test('a wheel written as a bare name gets its axle and radius from its part\'s box, and turns about it', () => {
    // The toy's wheel nodes all record the model's origin as their pivot: the wrong place to turn a wheel about.
    const before = build(toyTemplate, {}, 2);
    closeAll(pivotOf(before.object, 'WheelF'), [0, 0, 0], 1e-9, 'as the file has it');
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2);
    const wheels = instance.block.wheels;
    closeAll(wheels[0].at, [-0.7, 0.3, 0], 0.002, 'front axle');
    closeAll(wheels[1].at, [0.7, 0.3, 0], 0.002, 'rear axle');
    close(wheels[0].radius, 0.3, 0.002, 'radius is half the box\'s height');
    assert.deepEqual([wheels[0].written, wheels[0].side], [false, '']);
    closeAll(pivotOf(instance.object, 'WheelF'), [-0.7, 0.3, 0], 0.002, 'the part now turns about its axle');
    closeAll(pivotOf(instance.object, 'WheelR'), [0.7, 0.3, 0], 0.002, 'and the rear about its own');
    closeAll(pivotOf(instance.object, 'Bars'), [-0.5, 0.6, 0], 1e-9, 'the bars about the steering line');
    closeAll(pivotOf(instance.object, 'Body'), [0, 0, 0], 1e-9, 'a part the block does not name keeps its pivot');
    // The model is measured once: the next instance of it is given the same axles by the readers alone.
    const sidecar = { vehicle: TOY_BLOCK() };
    build(toyTemplate, sidecar, 2);
    assert.deepEqual(Object.keys(plain(R.readModelPivots(sidecar))).sort(), ['Bars', 'WheelF', 'WheelR']);
    assert.ok(Object.keys(R.readModelLandmarks(sidecar)).includes('wheel.0'));
});

test('where a pivot is written twice: the block\'s own axle wins; a box\'s middle does not replace a pivot someone wrote', () => {
    // `pivots` names the wheel and the block gives no axle: the written pivot stands.
    const named = build(toyTemplate, { pivots: { WheelF: [-0.6, 0.25, 0] }, vehicle: TOY_BLOCK() }, 2);
    closeAll(pivotOf(named.object, 'WheelF'), [-0.6, 0.25, 0], 1e-9, 'pivots stands over a measured axle');
    closeAll(named.block.wheels[0].at, [-0.7, 0.3, 0], 0.002, 'the block still knows the box\'s middle');
    // The block writes the axle itself: that one is used, whatever `pivots` says.
    const block = TOY_BLOCK();
    block.wheels[0] = { part: 'WheelF', at: [-0.72, 0.31, 0], radius: 0.29 };
    const written = build(toyTemplate, { pivots: { WheelF: [-0.6, 0.25, 0] }, vehicle: block }, 2);
    closeAll(pivotOf(written.object, 'WheelF'), [-0.72, 0.31, 0], 1e-9, 'vehicle wins');
    assert.deepEqual([written.block.wheels[0].radius, written.block.wheels[0].written], [0.29, true]);
    // Every part on a wheel's axle turns about that axle.
    const shared = TOY_BLOCK();
    shared.wheels = [{ part: 'WheelF', with: ['Bars'], at: [-0.7, 0.3, 0], radius: 0.3 }];
    shared.controls = [];
    closeAll(pivotOf(build(toyTemplate, { vehicle: shared }, 2).object, 'Bars'), [-0.7, 0.3, 0], 1e-9, 'with');
});

test("the Demo motorcycle: every point resolves, and a hand reads back at its place within a thousandth of a tile", real, () => {
    const sidecar = { parts: fixture('ninja-parts.json').parts, vehicle: fixture('ninja-vehicle.json') };
    const instance = build(ninja(), sidecar, 3.7);
    const object = instance.object, block = instance.block;
    assert.deepEqual(plain(block.problems), []);
    assert.deepEqual(Object.keys(object.__reactorLandmarks).sort(), ['control.0', 'ride.0.footL', 'ride.0.footR', 'ride.0.handL', 'ride.0.handR', 'ride.0.seat', 'wheel.0', 'wheel.1']);
    object.position.set(28.5, 0.25, 3.5);
    object.updateMatrixWorld(true);
    const s = instance.scale;
    close(s, 3.7 / 2.5729, 0.0005, 'tiles a model unit at size 3.7');
    const seat = block.seats[0];
    for (const name of ['seat', 'handL', 'handR', 'footL', 'footR']) {
        const at = seat[name].at;
        closeAll(arr(V.pointWorld(object, 'ride.0.' + name, vec(0, 0, 0))), [28.5 + at[0] * s, 0.25 + at[1] * s, 3.5 + at[2] * s], 0.001, name);
    }
    // The hands ride the carved steering part; the seat and the feet the whole model.
    assert.equal(object.__reactorLandmarks['ride.0.handL'].node.userData.parts.some(part => part.name === 'Steering'), true);
    assert.equal(object.__reactorLandmarks['ride.0.seat'].node.name, 'anim-root');
    // Turned and stood somewhere else, the point goes with the model.
    object.rotation.y = Math.PI / 2;
    object.updateMatrixWorld(true);
    const at = seat.handL.at;
    closeAll(arr(V.pointWorld(object, 'ride.0.handL', vec(0, 0, 0))), [28.5 + at[2] * s, 0.25 + at[1] * s, 3.5 - at[0] * s], 0.001, 'handL turned');
});

test("the Demo motorcycle: a wheel written as a bare name gets the measured axle; the carved wheel keeps its own pivot", real, () => {
    // The file's own front tire, named bare.
    const block = fixture('ninja-vehicle.uncarved.json');
    block.wheels = ['Mesh_0009.rip', 'Mesh_0010.rip', 'Mesh_0017.rip'];
    const instance = build(ninja(), { vehicle: block }, 3.7);
    const [front, rear, sprocket] = instance.block.wheels;
    closeAll(front.at, [-0.912, 0.383, 0], 0.01, 'the front axle');
    close(front.radius, 0.376, 0.01, 'the front radius');
    closeAll(rear.at, [0.861, 0.411, -0.003], 0.01, 'the rear axle');
    close(rear.radius, 0.411, 0.01, 'the rear radius');
    // The sprocket's node records the file's shared origin, a long way from where it turns: its box says where.
    const bare = build(ninja(), {}, 3.7);
    assert.ok(Math.hypot(...pivotOf(bare.object, 'Mesh_0017.rip').map((value, i) => value - sprocket.at[i])) > 0.5, 'the file\'s pivot is not the axle');
    closeAll(pivotOf(instance.object, 'Mesh_0017.rip'), sprocket.at, 1e-6, 'a part named by wheels and absent from pivots turns about its box\'s middle');
    close(sprocket.at[0], 0.861, 0.02, 'which is on the rear axle');
    closeAll(pivotOf(instance.object, 'Mesh_0009.rip'), front.at, 1e-6, 'the front tire about its axle');
    // A carved part's own pivot (parts[].pivot) stands for a wheel named bare: the block gives it no other.
    const parts = fixture('ninja-parts.json').parts.map(part => part.name === 'Front wheel' ? Object.assign({}, part, { pivot: [-0.9, 0.4, 0] }) : part);
    const carved = build(ninja(), { parts, vehicle: fixture('ninja-vehicle.json') }, 3.7);
    closeAll(pivotOf(carved.object, 'Front wheel'), [-0.9, 0.4, 0], 1e-6, 'the carve\'s pivot');
    closeAll(carved.block.wheels[0].at, [-0.912, 0.383, 0], 0.01, 'the block knows the box\'s middle');
    closeAll(pivotOf(carved.object, 'Steering'), [-0.644, 0.873, 0], 1e-6, 'the steering part about its line');
    // An axle the block writes replaces the carve's pivot.
    const said = fixture('ninja-vehicle.json');
    said.wheels[0] = { part: 'Front wheel', at: [-0.912, 0.383, 0], radius: 0.376 };
    closeAll(pivotOf(build(ninja(), { parts, vehicle: said }, 3.7).object, 'Front wheel'), [-0.912, 0.383, 0], 1e-6, 'vehicle wins');
});

test('a block naming a part the model lacks drops that point and reports it', real, () => {
    // The carved motorcycle's block on the model as the file has it: no Steering, no Front wheel.
    const instance = build(ninja(), { vehicle: fixture('ninja-vehicle.json') }, 3.7);
    assert.deepEqual(plain(instance.block.problems), [
        { key: 'missingPart', args: { point: 'wheel.0', part: 'Front wheel' } },
        { key: 'missingPart', args: { point: 'ride.0.handL', part: 'Steering' } },
        { key: 'missingPart', args: { point: 'ride.0.handR', part: 'Steering' } }
    ]);
    assert.deepEqual(Object.keys(instance.object.__reactorLandmarks).sort(), ['control.0', 'ride.0.footL', 'ride.0.footR', 'ride.0.seat', 'wheel.1']);
    assert.equal(V.pointWorld(instance.object, 'ride.0.handL', vec(0, 0, 0)), null);
    assert.ok(V.pointWorld(instance.object, 'ride.0.seat', vec(0, 0, 0)));
    // A second instance of the same model reports each once.
    const again = build(ninja(), { vehicle: fixture('ninja-vehicle.json') }, 3.7);
    assert.equal(again.block.problems.length, 3);
});

test('a missing part on the toy: the point is dropped, the rest are bound, nothing throws', () => {
    const block = TOY_BLOCK();
    block.seats[0].handL.part = 'Grip that is not there';
    block.wheels.push('Spare');
    const instance = build(toyTemplate, { vehicle: block }, 2);
    assert.deepEqual(plain(instance.block.problems), [{ key: 'missingPart', args: { point: 'wheel.2', part: 'Spare' } },
        { key: 'missingPart', args: { point: 'ride.0.handL', part: 'Grip that is not there' } }]);
    assert.equal(V.pointWorld(instance.object, 'ride.0.handL', vec(0, 0, 0)), null);
    assert.ok(V.pointWorld(instance.object, 'ride.0.handR', vec(0, 0, 0)));
    // Bound by hand (a model whose sidecar has no block): the same.
    const bare = build(toyTemplate, {}, 2);
    const again = TOY_BLOCK();
    again.seats[0].handR.part = 'No such part';
    const bound = V.bind(bare.object, V.read({ vehicle: again }, V.boxOf(bare.object)), null);
    assert.equal(V.blockOf(bare.object), bound);
    assert.deepEqual(plain(bound.problems), [{ key: 'missingPart', args: { point: 'ride.0.handR', part: 'No such part' } }]);
    assert.equal(V.pointWorld(bare.object, 'ride.0.handR', vec(0, 0, 0)), null);
    closeAll(arr(V.pointWorld(bare.object, 'ride.0.handL', vec(0, 0, 0))), arr(bare.object.localToWorld(vec(-0.5, 1.0, 0.28))), 1e-9, 'the other hand is bound');
    assert.equal(V.bind(null, bound, null), null);
});

//-----------------------------------------------------------------------------
// Parts that follow the driver

test('the drawn share of lock: full at a standstill, 7 of 30 degrees at top speed, nothing for a vehicle nobody rides', () => {
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2);
    const holder = { object: instance.object, binding: instance.binding };
    const character = ridden({ _rrSteer: 1 });
    const inputs = V.inputs(holder, character, 1);
    assert.deepEqual(plain(inputs), { steer: 1, throttle: 0, brake: 0, aim: 0, aimPitch: 0, lift: 0, bank: 0 });
    character._rrSpeed = 20;
    close(V.inputs(holder, character, 1).steer, 7 / 30, 1e-12, 'at top speed');
    character._rrSpeed = -10;
    close(V.inputs(holder, character, 1).steer, 1 + (7 / 30 - 1) * 0.5, 1e-12, 'by the share of top speed, either way');
    character._rrSpeed = 55; character._rrSteer = -3;
    close(V.inputs(holder, character, 1).steer, -7 / 30, 1e-12, 'held to lock and to top speed');
    // The same object every frame.
    assert.equal(V.inputs(holder, character, 1), inputs);
    // Not boarded: nothing follows anything.
    assert.equal(V.inputs(holder, ridden({ _rrBoarded: false, _rrSteer: 1 }), 1), null);
    assert.equal(V.inputs(null, character, 1), null);
    assert.equal(V.inputs(holder, null, 1), null);
});

test('with no part of its own a control still moves the hands: at full lock the left grip has moved between 0.25 and 0.29 tile', real, () => {
    const instance = build(ninja(), { vehicle: fixture('ninja-vehicle.uncarved.json') }, 3.7);
    const object = instance.object, character = ridden();
    const holder = { object, binding: instance.binding, character };
    const at = name => V.pointWorld(object, name, vec(0, 0, 0)).clone();
    const restL = at('ride.0.handL'), restR = at('ride.0.handR'), restSeat = at('ride.0.seat'), restFoot = at('ride.0.footL');
    character._rrSteer = 1;
    V.drive(holder, null, 1);
    const left = at('ride.0.handL'), right = at('ride.0.handR');
    const moved = restL.distanceTo(left);
    assert.ok(moved >= 0.25 && moved <= 0.29, `the left grip moved ${moved} tiles`);
    // Steering right, the left hand goes forward (the front is -x) and the right hand comes back.
    assert.ok(left.x < restL.x && right.x > restR.x, 'the left arm pushes and the right pulls');
    close(restR.distanceTo(right), moved, 0.03, 'the right grip moves as far');
    closeAll(arr(at('ride.0.seat')), arr(restSeat), 1e-12, 'the seat does not move');
    closeAll(arr(at('ride.0.footL')), arr(restFoot), 1e-12, 'nor a foot');
    // Steering left is the mirror of it; at top speed the bars barely move.
    character._rrSteer = -1;
    V.drive(holder, null, 1);
    assert.ok(at('ride.0.handL').x > restL.x && at('ride.0.handR').x < restR.x);
    character._rrSteer = 1; character._rrSpeed = 20;
    V.drive(holder, null, 1);
    close(restL.distanceTo(at('ride.0.handL')), moved * 7 / 30, 0.01, 'a quarter of the travel at top speed');
    // The ride over, the hands are back at rest.
    V.drive(null, null);
    closeAll(arr(at('ride.0.handL')), arr(restL), 1e-12, 'at rest again');
    assert.equal(V.rideOf(holder), null);
});

test('with a carved part the same grip moves the same way, carried by the part the rule turns', Object.assign({}, real, needsSeam()), () => {
    const instance = build(ninja(), { parts: fixture('ninja-parts.json').parts, vehicle: fixture('ninja-vehicle.json') }, 3.7);
    const object = instance.object, character = ridden();
    const holder = { object, binding: instance.binding, character };
    const state = () => ({ frame: 1, moving: false, dashing: false, airborne: false, swimming: false, climbing: false, distance: 0, scale: instance.scale, moveScale: 1 });
    const at = name => { object.updateMatrixWorld(true); return V.pointWorld(object, name, vec(0, 0, 0)).clone(); };
    V.drive(holder, null, 1);
    R.applyModelAnimation(instance.binding, instance.rules, state());
    const restL = at('ride.0.handL'), restR = at('ride.0.handR');
    character._rrSteer = 1;
    V.drive(holder, null, 1);
    R.applyModelAnimation(instance.binding, instance.rules, state());
    const left = at('ride.0.handL'), moved = restL.distanceTo(left);
    assert.ok(moved >= 0.25 && moved <= 0.29, `the left grip moved ${moved} tiles`);
    assert.ok(left.x < restL.x && at('ride.0.handR').x > restR.x, 'the left arm pushes and the right pulls');
    // The front wheel is nested in the steering part: its axle has swung with the bars.
    assert.ok(Math.abs(at('wheel.0').z) > 0.02, 'the axle turned with the steering');
    V.drive(null, null);
});

test('the wheels roll with the road: 10 tiles turn the front wheel 10 / (0.376 x scale) radians, and 10 back undo it', Object.assign({}, real, needsSeam()), () => {
    const instance = build(ninja(), { parts: fixture('ninja-parts.json').parts, vehicle: fixture('ninja-vehicle.json') }, 3.7);
    const object = instance.object, character = ridden();
    const holder = { object, binding: instance.binding, character };
    const state = () => ({ frame: 1, moving: true, dashing: false, airborne: false, swimming: false, climbing: false, distance: 0.1, scale: instance.scale, moveScale: 1 });
    const wheel = instance.binding.meshes.find(entry => entry.parts[0].name === 'Front wheel');
    // How far the wheel has turned about the vehicle's left (+z), from a spoke's direction.
    const angle = () => { const spoke = vec(1, 0, 0).applyQuaternion(wheel.mesh.quaternion); return Math.atan2(spoke.y, spoke.x); };
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    V.drive(holder, null, 1);
    R.applyModelAnimation(instance.binding, instance.rules, state());
    const rest = angle();
    for (let i = 0; i < 100; i++) {
        character._rrTravel += 0.1;
        V.drive(holder, null, 1);
        R.applyModelAnimation(instance.binding, instance.rules, state());
    }
    const radius = instance.block.wheels[0].radius;
    close(wrap(angle() - rest - 10 / (radius * instance.scale)), 0, 0.01, 'after 10 tiles');
    close(radius, 0.376, 0.005, 'the radius is the tire\'s');
    for (let i = 0; i < 100; i++) {
        character._rrTravel -= 0.1;
        V.drive(holder, null, 1);
        R.applyModelAnimation(instance.binding, instance.rules, state());
    }
    close(wrap(angle() - rest), 0, 0.01, 'after 10 tiles in reverse it is back');
    V.drive(null, null);
});

test('the ride kept on the two holders: the rider plays the riding state, the vehicle its inputs and the road it rolled', () => {
    const vehicle = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), rider = build(toyTemplate, {}, 2), other = build(toyTemplate, {}, 2);
    const event = ridden({ _rrSteer: 0.5, _rrTravel: 3 });
    const vehicleHolder = { object: vehicle.object, binding: vehicle.binding, character: event };
    const riderHolder = { object: rider.object, binding: rider.binding, character: { _rrSeated: true } };
    const otherHolder = { object: other.object, binding: other.binding, character: {} };
    // One rule each, so the animation pass runs; it reads the state the wrapper filled.
    const rules = R.readModelAnimationRules({ animations: [{ name: 'bob', type: 'bob', trigger: 'always', amount: 0.01 }] });
    const fresh = () => ({ frame: 1, moving: false, dashing: false, airborne: false, swimming: false, climbing: false, distance: 0, scale: 1, moveScale: 1 });
    // No ride on: a model's state is not touched.
    let state = fresh();
    R.applyModelAnimation(vehicle.binding, rules, state);
    assert.deepEqual(Object.keys(state).sort(), Object.keys(fresh()).sort());
    assert.equal(V.rideOf(vehicleHolder), null);

    V.drive(vehicleHolder, riderHolder, 1);
    state = fresh();
    R.applyModelAnimation(vehicle.binding, rules, state);
    assert.equal(state.riding, false, 'the vehicle is not the one riding');
    assert.equal(state.inputs, vehicleHolder.rrInputs);
    assert.equal(state.inputs.steer, 0.5);
    assert.equal(state.travel, 0, 'no road rolled before the first frame of the ride');
    event._rrTravel = 3.25;
    V.drive(vehicleHolder, riderHolder, 1);
    state = fresh();
    R.applyModelAnimation(vehicle.binding, rules, state);
    assert.equal(state.travel, 0.25, 'the road rolled since the last frame, signed');
    event._rrTravel = 3.0;
    V.drive(vehicleHolder, riderHolder, 1);
    assert.equal(V.rideOf(vehicleHolder).travel, -0.25);
    // A ride that starts over (travel back at 0) or jumps does not spin the wheels a hundred turns in a frame.
    event._rrTravel = 300;
    V.drive(vehicleHolder, riderHolder, 1);
    assert.equal(V.rideOf(vehicleHolder).travel, 0);

    state = fresh();
    R.applyModelAnimation(rider.binding, rules, state);
    assert.equal(state.riding, true, 'the rider is riding');
    assert.equal('inputs' in state, false);
    assert.equal('travel' in state, false);
    // Anybody else on the map is untouched.
    state = fresh();
    R.applyModelAnimation(other.binding, rules, state);
    assert.deepEqual(Object.keys(state).sort(), Object.keys(fresh()).sort());

    // Both are animated every frame however small they are on screen; the rest keep their stride.
    const far = { position: vec(0, 0, 500), fov: 45, matrixWorld: new THREE.Matrix4() };
    for (const holder of [vehicleHolder, riderHolder, otherHolder]) holder.object.position.set(0, 0, 0);
    w.Graphics.frameCount = 1;
    const due = [0, 1, 2, 3].map(() => { w.Graphics.frameCount++; return [vehicleHolder, riderHolder, otherHolder].map(holder => R.animationDue(holder, holder.character, holder.object, far)); });
    assert.ok(due.every(frame => frame[0] === true && frame[1] === true));
    assert.ok(due.filter(frame => frame[2]).length < 4, 'a speck on the horizon is not sampled every frame');

    // The ride over: nothing is left on either holder.
    V.drive(null, null);
    assert.equal(V.rideOf(vehicleHolder), null);
    assert.equal(V.rideOf(riderHolder), null);
    state = fresh();
    R.applyModelAnimation(rider.binding, rules, state);
    assert.equal('riding' in state, false);
    reset();
});

//-----------------------------------------------------------------------------
// The attitude it is drawn at

test('the heading: the model\'s own front lies along (sin, -cos) of it, whichever way the file faces', () => {
    const q = new THREE.Quaternion();
    for (const degrees of [0, 37, 90, 180, 270, -45]) {
        const yaw = degrees * DEG;
        V.attitude(q, yaw, 0, 0, null);
        closeAll(arr(vec(0, 0, 1).applyQuaternion(q)), [Math.sin(yaw), 0, -Math.cos(yaw)], 1e-12, `front at ${degrees}`);
        closeAll(arr(vec(0, 1, 0).applyQuaternion(q)), [0, 1, 0], 1e-12, `up at ${degrees}`);
        // Its left is to the left of where it heads: west when heading north.
        closeAll(arr(vec(1, 0, 0).applyQuaternion(q)), [-Math.cos(yaw), 0, -Math.sin(yaw)], 1e-12, `left at ${degrees}`);
    }
    // Pitch lifts the nose; lean lowers the right side.
    V.attitude(q, 0, 10 * DEG, 0, null);
    close(vec(0, 0, 1).applyQuaternion(q).y, Math.sin(10 * DEG), 1e-12, 'nose up');
    V.attitude(q, 0, 0, 20 * DEG, null);
    close(vec(1, 0, 0).applyQuaternion(q).y, Math.sin(20 * DEG), 1e-12, 'leaning right, the left side rises');
    closeAll(arr(vec(0, 0, 1).applyQuaternion(q)), [0, 0, -1], 1e-12, 'the lean is about its own length');
    // Heading east and pitched: the lean is about the pitched length.
    V.attitude(q, 90 * DEG, 10 * DEG, 30 * DEG, null);
    closeAll(arr(vec(0, 0, 1).applyQuaternion(q)), [Math.cos(10 * DEG), Math.sin(10 * DEG), 0], 1e-12, 'pitched east');
});

test('a posed vehicle: its block\'s front at its heading, on its stand while nobody rides it, upright with a rider', () => {
    reset();
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2);
    const object = instance.object, holder = { object, binding: instance.binding };
    const spec = { name: 'Toy', size: 2 };
    const parked = { _rrVehicle: 1, _rrYaw: 90 * DEG, eventId() { return 7; } };
    object.position.set(5, 1, 8);
    V.pose(holder, parked, object, spec, 1);
    let now = drawn(object);
    close(now.front[0], 1, 1e-9, 'heading east');
    close(now.front[1], 0, 1e-9, 'level');
    // Ten degrees onto its stand, to its left: heading east, its left is north (-z).
    close(Math.acos(now.up[1]) / DEG, 10, 1e-6, 'the stand\'s lean');
    assert.ok(now.up[2] < 0, 'toward its left');
    assert.deepEqual(arr(object.position), [5, 1, 8], 'it stands where the placement put it');
    // Ridden: upright, with what the mover wrote.
    const riddenNow = ridden({ _rrYaw: 180 * DEG, _rrPitch: 5 * DEG, _rrLean: 25 * DEG });
    V.pose(holder, riddenNow, object, spec, 1);
    now = drawn(object);
    close(now.front[2], Math.cos(5 * DEG), 1e-9, 'heading south');
    close(now.front[1], Math.sin(5 * DEG), 1e-9, 'nose up 5 degrees');
    close(now.left[1], Math.sin(25 * DEG) * Math.cos(5 * DEG), 1e-9, 'leaning 25 degrees to its right, about its pitched length');
    // A side stand on the right leans the other way; no stand, no lean.
    const right = TOY_BLOCK(); right.stand = { lean: 12, side: 'right' };
    const other = build(toyTemplate, { vehicle: right }, 2);
    V.pose({ object: other.object }, parked, other.object, spec, 1);
    assert.ok(drawn(other.object).up[2] > 0 && Math.abs(Math.acos(drawn(other.object).up[1]) / DEG - 12) < 1e-6);
    const none = TOY_BLOCK(); delete none.stand;
    const upright = build(toyTemplate, { vehicle: none }, 2);
    V.pose({ object: upright.object }, parked, upright.object, spec, 1);
    closeAll(drawn(upright.object).up, [0, 1, 0], 1e-9, 'no stand');
    // A character with no heading of its own is left as the placement put it.
    const untouched = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2);
    const q = arr(untouched.object.quaternion);
    V.pose({ object: untouched.object }, { _rrVehicle: 1 }, untouched.object, spec, 1);
    V.pose({ object: untouched.object }, {}, untouched.object, spec, 1);
    assert.deepEqual(arr(untouched.object.quaternion), q);
    assert.ok(Number.isNaN(V.heading({})) && Number.isNaN(V.heading(null)));
    assert.equal(V.heading(parked), 90 * DEG);
});

test('the front a use marks wins over the block\'s, and a spec\'s own turn is kept under the attitude', () => {
    reset();
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), object = instance.object;
    const character = ridden({ _rrYaw: 0 });
    // The block says -x; this use marks +x as its front.
    V.pose({ object }, character, object, { name: 'Toy', size: 2, faces: { front: [1, 0, 0] } }, 0);
    closeAll(drawn(object, [1, 0, 0]).front, [0, 0, -1], 1e-9, 'the marked end heads north');
    V.pose({ object }, character, object, { name: 'Toy', size: 2 }, 0);
    closeAll(drawn(object, [-1, 0, 0]).front, [0, 0, -1], 1e-9, 'with no mark, the block\'s');
    // A spec's own pitch and roll (a file that lies on its back, or on its side) stay under the heading: heading
    // south, the vehicle is drawn exactly as the engine draws that model facing down with the block's front as
    // its mark.
    for (const turn of [{ pitch: 0.4 }, { roll: -0.3 }, { pitch: -0.25, roll: 0.5, yaw: 1.1 }]) {
        const spec = Object.assign({ name: 'Toy', size: 2 }, turn);
        V.pose({ object }, ridden({ _rrYaw: 180 * DEG }), object, spec, 0);
        const expected = build(toyTemplate, null, 2).object;
        R.applyEventModelPose(expected, Object.assign({}, spec, { faces: { front: [-1, 0, 0] } }), 2);
        closeAll(quat(object.quaternion), quat(expected.quaternion), 1e-9, JSON.stringify(turn));
        assert.ok(Math.abs(vec(0, 1, 0).applyQuaternion(object.quaternion).y - 1) > 0.02, 'which is not upright');
    }
    // The turn that brings the front round is worked out once for a spec and a front, not once a frame.
    let reads = 0;
    const counting = { name: 'Toy', size: 2, roll: 0, get pitch() { reads++; return 0.1; } };
    const holder = { object };
    for (let i = 0; i < 10; i++) V.pose(holder, character, object, counting, 0);
    assert.equal(reads, 1, 'the spec\'s own turn is read once');
    V.pose(holder, character, object, { name: 'Toy', size: 2 }, 0);
    V.pose(holder, character, object, counting, 0);
    assert.equal(reads, 2, 'and again when the spec is another');
    // A model with no block is given one the first time it is posed, so a rider has a seat, with no error.
    const bare = build(toyTemplate, {}, 2);
    V.pose({ object: bare.object }, character, bare.object, { name: 'Toy', size: 2, yaw: 0 }, 0);
    assert.ok(bare.object.__reactorVehicle, 'a model with no block is given a guess the first time it is posed');
    assert.ok(bare.object.__reactorVehicle.guessed.seats);
    assert.ok(V.pointWorld(bare.object, 'ride.0.seat', vec(0, 0, 0)), 'so a rider has a seat, with no error');
});

test('getting on and off: the vehicle comes off its stand over the last four ticks of the hop on, and goes back over through the hop off', () => {
    reset();
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), object = instance.object, holder = { object };
    const character = ridden({ _rrYaw: 0 }), spec = { name: 'Toy', size: 2 };
    const lean = () => { V.pose(holder, character, object, spec, 0); return Math.acos(Math.min(1, drawn(object).up[1])) / DEG; };
    w.$gamePlayer._rrMount = { t: 0, n: 14, on: true };
    const on = [];
    for (let t = 0; t <= 14; t++) { w.$gamePlayer._rrMount.t = t; on.push(lean()); }
    for (let t = 0; t <= 10; t++) close(on[t], 10, 1e-6, `on its stand at tick ${t}`);
    assert.ok(on[11] < 10 && on[12] < on[11] && on[13] < on[12], 'it comes upright from tick 10');
    close(on[14], 0, 1e-6, 'upright at tick 14');
    w.$gamePlayer._rrMount = null;
    close(lean(), 0, 1e-6, 'riding: upright');
    w.$gamePlayer._rrMount = { t: 0, n: 14, on: false };
    const off = [];
    for (let t = 0; t <= 14; t++) { w.$gamePlayer._rrMount.t = t; off.push(lean()); }
    close(off[0], 0, 1e-6, 'upright as the hop off starts');
    for (let t = 1; t <= 14; t++) assert.ok(off[t] > off[t - 1] - 1e-9, `it leans further at tick ${t}`);
    close(off[14], 10, 1e-6, 'on its stand at tick 14');
    assert.deepEqual([V.standShare({ _rrBoarded: false }), V.standShare(character)], [1, 1]);
    reset();
    // At a stop the stand-side foot comes down and the vehicle tips 5 degrees onto it.
    w.$gamePlayer._rrDrive = { foot: 0 };
    close(lean(), 0, 1e-6, 'feet up');
    w.$gamePlayer._rrDrive.foot = 0.5;
    close(lean(), 2.5, 1e-6, 'half way down');
    w.$gamePlayer._rrDrive.foot = 1;
    close(lean(), 5, 1e-6, 'foot down');
    assert.ok(drawn(object).up[0] < 0, 'tipped to its left, the stand\'s side (heading north, left is west)');
    reset();
});

test('the height follows the ground through a spring: no lag on a slope, a bounce over a curb, the same at any frame rate', () => {
    reset();
    const spec = { name: 'Toy', size: 2 };
    const fresh = () => { const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2); return { object: instance.object, holder: { object: instance.object }, character: ridden() }; };
    // Drawn every `stride` ticks: the placement writes the ground's height, the pose springs it.
    const ride = (ground, ticks, stride) => {
        const it = fresh(), heights = [];
        w.Graphics.frameCount = 1000;
        for (let tick = 0; tick <= ticks; tick += stride) {
            w.Graphics.frameCount = 1000 + tick;
            it.object.position.y = ground(tick);
            V.pose(it.holder, it.character, it.object, spec, ground(tick));
            heights.push(it.object.position.y);
        }
        return { heights, last: heights[heights.length - 1], it };
    };
    // A steady slope, 6 tiles a second upward: it stays on the ground it stands on.
    const slope = ride(tick => tick * 0.1, 120, 1);
    close(slope.last, 12, 0.01, 'no lag on a slope');
    // (The slope begins with a jolt, a third of a tile a tick out of nothing: that is taken up in a few ticks.)
    assert.ok(slope.heights.every((y, tick) => Math.abs(y - tick * 0.1) < 0.15), 'never far off on the way');
    assert.ok(slope.heights.slice(40).every((y, i) => Math.abs(y - (i + 40) * 0.1) < 0.01), 'and on it from two thirds of a second in');
    // A curb half a tile high at tick 30: it does not snap, it overshoots a little and settles.
    const curb = tick => tick < 30 ? 0 : 0.5;
    const over = ride(curb, 120, 1);
    assert.ok(over.heights[30] > 0 && over.heights[30] < 0.5, 'the curb is not a snap');
    assert.ok(over.heights[30] >= 0.5 - 0.2 - 1e-9, 'and never more than 0.2 tile under its wheels');
    const peak = Math.max(...over.heights);
    assert.ok(peak > 0.5 && peak < 0.62, `a bounce: ${peak}`);
    close(over.last, 0.5, 0.005, 'settled');
    assert.equal(over.it.holder.rrDraw.busy, false, 'and at rest again');
    // The same curb drawn every third tick: the same place at the same moment, give or take a hair.
    const slow = ride(curb, 120, 3);
    close(slow.last, over.last, 0.01, 'the end at 20 frames a second');
    close(slow.heights[20], over.heights[60], 0.03, 'half a second after the curb');
    // A landing: falling 9 tiles a second onto flat ground, it dips and comes back, never deeper than 0.2.
    const fall = tick => tick < 20 ? 3 - 0.15 * tick : 0;
    const landed = ride(fall, 80, 1);
    const dip = Math.min(...landed.heights.slice(20));
    assert.ok(dip < -0.05 && dip >= -0.2 - 1e-9, `a dip of ${dip}`);
    assert.ok(Math.abs(landed.heights[20 + 21]) < 0.06, 'back within a third of a second');
    close(landed.last, 0, 0.005, 'and settled');
    // Parked and still, nothing moves: the still-model rule may freeze it.
    const still = ride(() => 2, 30, 1);
    assert.ok(still.heights.every(y => y === 2));
    assert.equal(still.it.holder.rrDraw.busy, false);
    reset();
});

test('the spring is this file\'s alone: nothing the mover keeps moves the drawn height, whatever it holds', () => {
    reset();
    const spec = { name: 'Toy', size: 2 };
    // The same ride twice, once with fields on the mover's state that are no part of what is saved for a ride.
    const heights = extra => {
        const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), object = instance.object, holder = { object }, character = ridden();
        w.$gamePlayer._rrDrive = Object.assign({ foot: 0 }, extra);
        w.Graphics.frameCount = 500;
        const out = [];
        for (const ground of [0, 0.5, 0.5, 0.5, 3, 3]) {
            w.Graphics.frameCount++;
            object.position.y = ground;
            V.pose(holder, character, object, spec, ground);
            out.push(object.position.y);
        }
        return out;
    };
    const plainRide = heights({});
    assert.deepEqual(heights({ sink: -50 }), plainRide);
    assert.deepEqual(heights({ sink: Infinity, spring: 4, y: 9 }), plainRide);
    assert.ok(plainRide.every(Number.isFinite) && plainRide[5] <= 3 + 0.25 + 1e-9 && plainRide[5] >= 3 - 0.2 - 1e-9);
    // Every field of the ride this file reads is one of the table's: SPEC-v2 3.8.
    const source = fs.readFileSync(path.join(repo, 'runtime', 'reactor_3d_vehicles.js'), 'utf8');
    const read = new Set(Array.from(source.matchAll(/\b(?:drive|mount|ride)\.([a-zA-Z_]\w*)\b/g), m => m[1]));
    const table = ['v', 'steer', 'yaw', 'vz', 'pitch', 'roll', 'travel', 'leave', 'rest', 'foot', 'grid', 'dry', 't', 'n', 'on', 'drawn', 'fx', 'fy', 'fz', 'fyaw', 'tx', 'ty', 'map', 'id'];
    // (`ride.riding`, `ride.inputs`, `ride.travelWas`, `ride.binding` are this file's own state on a model's holder.)
    const own = ['riding', 'inputs', 'travelWas', 'binding'];
    assert.deepEqual(Array.from(read).filter(name => !table.includes(name) && !own.includes(name)), []);
    reset();
});

test('stopped dead, the nose dips and comes back; braking hard does not nod it', () => {
    reset();
    const spec = { name: 'Toy', size: 2 };
    const run = speeds => {
        const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), object = instance.object, holder = { object }, character = ridden();
        const pitches = [];
        w.Graphics.frameCount = 2000;
        for (const speed of speeds) {
            w.Graphics.frameCount++;
            character._rrSpeed = speed;
            object.position.y = 0;
            V.pose(holder, character, object, spec, 0);
            pitches.push(Math.asin(drawn(object).front[1]) / DEG);
        }
        return pitches;
    };
    const hit = run([12, 12, 12, 0, ...new Array(60).fill(0)]);
    const least = Math.min(...hit);
    assert.ok(least < -4 && least > -7, `a dip of ${least} degrees`);
    assert.ok(Math.abs(hit[hit.length - 1]) < 0.05, 'and back level');
    assert.ok(Math.min(...run([3, 3, 3, 0, ...new Array(20).fill(0)])) > -3.5, 'a slow bump dips less');
    // The brake takes half a tile a second off each tick: that is no wall.
    const braking = [];
    for (let v = 20; v > 0; v -= 0.5) braking.push(v);
    assert.ok(Math.min(...run([...braking, 0, 0, 0, 0])) > -0.01, 'braking to a stop does not nod');
    reset();
});

//-----------------------------------------------------------------------------
// Through the map's own model sync

/** A scene of placed models driven through the real sync, as the map's spriteset drives it. */
function sceneOf(entries) {
    const scene = inWorld('(function() { const scene = Object.create(Reactor3D.MapScene.prototype); scene._scene = new THREE.Scene(); scene._materials = []; return scene; })')();
    w.$dataMap.reactor3d.events = {};
    const characters = entries.map(entry => {
        const id = entry.id;
        w.$dataMap.events[id] = { id, pages: [{}] };
        w.$dataMap.reactor3d.events[id] = { 0: Object.assign({ name: entry.model, size: entry.size || 2 }, entry.spec || {}) };
        return Object.assign({ _x: entry.x, _y: entry.y, _realX: entry.x, _realY: entry.y, _pageIndex: 0, _direction: 2, _reactorLift: 0,
            event() { return w.$dataMap.events[id]; }, eventId() { return id; }, direction() { return this._direction; },
            isMoving() { return false; }, isTransparent() { return false; }, isDashing() { return false; } }, entry.fields || {});
    });
    return { scene, characters };
}
async function withModels(models, run) {
    const kept = { loadModel: R.loadModel, sidecar: R.loadModelSidecar, enabled: R.StillModels.enabled, events: w.$dataMap.reactor3d.events, list: w.$dataMap.events.slice(), rider: R.Rider };
    R.loadModel = name => Promise.resolve(models[name] ? models[name].template : null);
    R.loadModelSidecar = name => Promise.resolve(models[name] ? models[name].sidecar : null);
    try { await run(); } finally {
        R.loadModel = kept.loadModel; R.loadModelSidecar = kept.sidecar; R.StillModels.enabled = kept.enabled; R.Rider = kept.rider;
        w.$dataMap.reactor3d.events = kept.events; w.$dataMap.events = kept.list;
        reset();
    }
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('through the model sync: a parked vehicle stands at its heading on its stand and is frozen; what is drawn of it changing places it again', async () => {
    reset();
    const sidecar = { vehicle: TOY_BLOCK() };
    await withModels({ Toy: { template: toyTemplate, sidecar }, Crate: { template: toyTemplate, sidecar: null } }, async () => {
        const { scene, characters } = sceneOf([
            { id: 1, model: 'Toy', x: 6, y: 9, fields: { _rrVehicle: 1, _rrYaw: 90 * DEG, _rrPose: 1 } },
            { id: 2, model: 'Crate', x: 12, y: 9 }
        ]);
        const [bike, crate] = characters;
        const sync = () => { w.Graphics.frameCount++; scene.syncCharacterModels(characters); };
        sync();
        await settle();
        for (let i = 0; i < 40; i++) sync();
        const holder = scene._modelInstances.get('e1'), plainHolder = scene._modelInstances.get('e2');
        const object = holder.object;
        assert.equal(object.__reactorVehicle, V.read(sidecar, null), 'the block is bound when the instance is built');
        let now = drawn(object);
        closeAll(now.front, [1, 0, 0], 1e-9, 'heading east, whatever its event faces');
        close(Math.acos(now.up[1]) / DEG, 10, 1e-6, 'on its stand');
        closeAll(arr(object.position), [6.5, 0, 9.5], 1e-9, 'on the middle of its tile');
        assert.equal(holder.placed.rrPose, 1);
        assert.ok(holder.rootFrozen && !object.matrixAutoUpdate, 'still, it is frozen like any model');
        // The light a vehicle carries swings with its heading: scene yaw, anticlockwise from south.
        close(bike._reactorModelYaw, Math.PI - 90 * DEG, 1e-12, 'the published facing');
        // The model beside it is placed as it always was.
        const expected = build(toyTemplate, null, 2).object;
        R.applyEventModelPose(expected, { name: 'Crate', size: 2 }, 2);
        closeAll(arr(plainHolder.object.quaternion).concat(plainHolder.object.quaternion.w), arr(expected.quaternion).concat(expected.quaternion.w), 1e-12, 'a plain model');
        assert.equal(plainHolder.placed.rrPose, undefined);
        assert.equal(plainHolder.rrDraw, undefined);
        assert.equal(crate._reactorModelYaw, plainHolder.smoothYaw);
        // Turned by the game (a new heading, the counter bumped): placed again on the next frame.
        bike._rrYaw = 180 * DEG;
        sync();
        closeAll(drawn(object).front, [1, 0, 0], 1e-9, 'without the counter nothing is placed');
        bike._rrPose = 2;
        sync();
        closeAll(drawn(object).front, [0, 0, 1], 1e-9, 'heading south');
        assert.equal(holder.placed.rrPose, 2);
        // With the still-model rule switched off it keeps its heading and its stand: it is posed every frame, so a
        // new heading shows at once, with or without the counter.
        R.StillModels.enabled = false;
        sync();
        closeAll(drawn(object).front, [0, 0, 1], 1e-9, 'still heading south with the rule off');
        close(Math.acos(drawn(object).up[1]) / DEG, 10, 1e-6, 'and still on its stand');
        assert.ok(!holder.rootFrozen && object.matrixAutoUpdate, 'nothing is frozen with the rule off');
        bike._rrYaw = 37 * DEG;
        sync();
        closeAll(drawn(object).front, [Math.sin(37 * DEG), 0, -Math.cos(37 * DEG)], 1e-9, 'turned with the rule off');
        close(Math.acos(drawn(object).up[1]) / DEG, 10, 1e-6, 'on its stand at the new heading');
        closeAll(arr(object.position), [6.5, 0, 9.5], 1e-9, 'where it stood');
        assert.equal(V.rideOf(holder), null, 'nobody rides it');
        // The plain model beside it is the engine's alone, as it was.
        closeAll(quat(plainHolder.object.quaternion), quat(expected.quaternion), 1e-12, 'a plain model with the rule off');
        assert.equal(plainHolder.rrDraw, undefined);
        bike._rrYaw = 270 * DEG;
        sync();
        closeAll(drawn(object).front, [-1, 0, 0], 1e-9, 'heading west with the rule off');
        R.StillModels.enabled = true;
        bike._rrPose = 3;
        sync();
        closeAll(drawn(object).front, [-1, 0, 0], 1e-9, 'heading west');
        sync();
        assert.ok(holder.rootFrozen, 'and frozen again with the rule on');
    });
});

test('through the model sync: the ridden vehicle and its rider are found from the saved fields, posed and animated every frame', async () => {
    reset();
    const sidecar = { vehicle: TOY_BLOCK() };
    await withModels({ Toy: { template: toyTemplate, sidecar }, Rider: { template: toyTemplate, sidecar: null } }, async () => {
        // The rider's own file is another package's: here the seat is this file's stand-in for it.
        R.Rider = null;
        const { scene, characters } = sceneOf([{ id: 7, model: 'Toy', x: 6, y: 9, fields: { _rrVehicle: 1, _rrYaw: 0, _rrPose: 1 } }]);
        const bike = characters[0], player = w.$gamePlayer;
        const savedSidecar = R._databaseSidecar;
        R._databaseSidecar = { actors: { [w.$gameParty.leader().actorId()]: { name: 'Rider', size: 3 } } };
        try {
            const all = [bike, player];
            const sync = () => { w.Graphics.frameCount++; scene.syncCharacterModels(all); };
            sync();
            await settle();
            sync();
            const vehicleHolder = scene._modelInstances.get('e7'), riderHolder = scene._modelInstances.get('p');
            assert.ok(vehicleHolder.object && riderHolder && riderHolder.object, 'both models are built');
            assert.equal(V.rideOf(vehicleHolder), null, 'on foot: no ride');
            const onFoot = arr(riderHolder.object.position);
            // Aboard, as the game's files write it.
            Object.assign(bike, { _rrBoarded: true, _rrSteer: 0.5, _rrSpeed: 0, _rrTravel: 0, _rrLean: 20 * DEG, _rrPose: 2 });
            Object.assign(player, { _rrRide: { map: w.$gameMap.mapId(), id: 7 }, _rrSeated: true });
            sync();
            assert.ok(V.rideOf(vehicleHolder) && V.rideOf(riderHolder), 'the two holders carry the ride');
            assert.equal(V.rideOf(riderHolder).riding, true);
            assert.equal(V.rideOf(vehicleHolder).inputs.steer, 0.5);
            close(drawn(vehicleHolder.object).left[1], Math.sin(20 * DEG), 1e-9, 'leaning with the turn, off its stand');
            // The rider is over the seat point, with the vehicle's attitude.
            const seat = V.pointWorld(vehicleHolder.object, 'ride.0.seat', vec(0, 0, 0));
            const rider = riderHolder.object;
            assert.ok(Math.hypot(rider.position.x - seat.x, rider.position.z - seat.z) < 1.2 && Math.hypot(...arr(rider.position).map((v, i) => v - onFoot[i])) > 0.1, 'moved to the seat');
            close(vec(1, 0, 0).applyQuaternion(rider.quaternion).y, Math.sin(20 * DEG), 1e-9, 'leaning with the vehicle');
            // Both are sampled every frame, and the rider is never the still-model rule's.
            assert.equal(R.animationDue(vehicleHolder, bike, vehicleHolder.object, { position: vec(0, 0, 900), fov: 45, matrixWorld: new THREE.Matrix4() }), true);
            // A seated rider of another event is not this one's: the pair is found by the saved id.
            player._rrRide = { map: w.$gameMap.mapId(), id: 99 };
            sync();
            assert.equal(V.rideOf(vehicleHolder), null);
            assert.equal(V.rideOf(riderHolder), null);
            player._rrRide = { map: w.$gameMap.mapId(), id: 7 };
            sync();
            assert.ok(V.rideOf(vehicleHolder));
            // The event itself has to say it is boarded: a vehicle that was parked is nobody's ride.
            bike._rrBoarded = false;
            sync();
            assert.equal(V.rideOf(vehicleHolder), null);
            assert.equal(V.rideOf(riderHolder), null);
            bike._rrBoarded = true;
            sync();
            assert.ok(V.rideOf(vehicleHolder) && V.rideOf(riderHolder));
            // With the still-model rule off, both are posed after the sync.
            R.StillModels.enabled = false;
            bike._rrYaw = 90 * DEG;
            sync();
            closeAll(drawn(vehicleHolder.object).front, [1, 0, 0], 0.4, 'heading east');
            close(drawn(vehicleHolder.object).front[0], Math.cos(0), 0.07, 'its length along east');
            // The rider after the vehicle: on the seat where the vehicle now is, facing where it heads.
            vehicleHolder.object.updateMatrixWorld(true);
            const seatOff = V.pointWorld(vehicleHolder.object, 'ride.0.seat', vec(0, 0, 0));
            assert.ok(Math.hypot(rider.position.x - seatOff.x, rider.position.z - seatOff.z) < 1.2, 'on the seat with the rule off');
            assert.ok(Math.hypot(...arr(rider.position).map((v, i) => v - onFoot[i])) > 0.1, 'not where the placement left it');
            closeAll(arr(vec(0, 0, 1).applyQuaternion(rider.quaternion)), [1, 0, 0], 1e-9, 'the rider faces east with the vehicle');
            R.StillModels.enabled = true;
            // On foot again: the ride is gone from both holders the next frame.
            delete player._rrRide; delete player._rrSeated; bike._rrBoarded = false; bike._rrLean = 0; bike._rrPose = 3;
            sync();
            assert.equal(V.rideOf(vehicleHolder), null);
            assert.equal(V.rideOf(riderHolder), null);
            // A scene that drops its models drops a ride with them.
            Object.assign(player, { _rrRide: { map: w.$gameMap.mapId(), id: 7 }, _rrSeated: true });
            bike._rrBoarded = true;
            sync();
            assert.ok(V.rideOf(vehicleHolder));
            // (This bare scene has none of the map's own lists, so the scene's own clearing stops short; the ride
            // is dropped before it runs.)
            try { scene.clear(); } catch (error) { assert.equal(error.name, 'TypeError'); }
            assert.equal(V.rideOf(vehicleHolder), null);
        } finally {
            R._databaseSidecar = savedSidecar;
        }
    });
});

test('where the axles are, in tiles at the bound size: from the wheels of the model\'s block', async () => {
    reset();
    const sidecar = { vehicle: TOY_BLOCK() };
    await withModels({ Toy: { template: toyTemplate, sidecar } }, async () => {
        const { scene, characters } = sceneOf([{ id: 7, model: 'Toy', x: 6, y: 9, size: 4, fields: { _rrVehicle: 1, _rrYaw: 0 } }]);
        const type = V.typeOf({ kind: 'motorcycle', model: { name: 'Toy', size: 4 } });
        const keptHolder = R.modelHolderFor;
        R.modelHolderFor = character => (character && scene._modelInstances && scene._modelInstances.get(R.modelInstanceKey(character))) || null;
        try {
            // Before the model is built the caller's own numbers stand.
            assert.deepEqual(V.axles(characters[0], type, { front: 1.4, rear: 1.4 }), { front: 1.4, rear: 1.4 });
            scene.syncCharacterModels(characters);
            await settle();
            scene.syncCharacterModels(characters);
            const out = V.axles(characters[0], type, { front: 1.4, rear: 1.4, radius: 0.45 });
            // The toy's axles are 0.7 model units each way; at size 4 a unit is 2 tiles.
            close(out.front, 1.4, 0.005, 'front');
            close(out.rear, 1.4, 0.005, 'rear');
            const real2 = V.axles(characters[0], type, { front: 0, rear: 0 });
            assert.deepEqual([Math.round(real2.front * 100), Math.round(real2.rear * 100)], [140, 140]);
            assert.equal(out.radius, 0.45, 'nothing else of the caller\'s is touched');
            assert.deepEqual(V.axles(null, type, { front: 3, rear: 3 }), { front: 3, rear: 3 });
        } finally {
            R.modelHolderFor = keptHolder;
        }
    });
});

test('nothing is created per drawn frame: posing, the inputs and a point asked for make no vector, quaternion or matrix after the first frame', () => {
    reset();
    const instance = build(toyTemplate, { vehicle: (() => { const block = TOY_BLOCK(); block.controls[0].part = ''; delete block.seats[0].handL.part; delete block.seats[0].handR.part; return block; })() }, 2);
    const object = instance.object, character = ridden({ _rrSteer: 0.4, _rrSpeed: 8, _rrLean: 0.2, _rrPitch: 0.05 });
    const holder = { object, binding: instance.binding, character }, spec = { name: 'Toy', size: 2 }, out = vec(0, 0, 0);
    w.$gamePlayer._rrDrive = { foot: 0.5 };
    const frame = i => {
        w.Graphics.frameCount++;
        character._rrYaw = i * 0.01; character._rrTravel = i * 0.13; character._rrSteer = Math.sin(i / 7);
        object.position.y = i % 40 < 20 ? 0 : 0.4;
        V.drive(holder, null, 1);
        V.pose(holder, character, object, spec, 0);
        V.pointWorld(object, 'ride.0.handL', out);
        V.pointWorld(object, 'ride.0.seat', out);
        V.heading(character);
    };
    frame(0); frame(1);
    // Every three.js constructor this file reaches counts while the frames run.
    const names = ['Vector3', 'Quaternion', 'Matrix4', 'Euler', 'Box3'], kept = {};
    let made = 0;
    for (const name of names) {
        kept[name] = THREE[name];
        const Counted = function(...args) { made++; return Reflect.construct(kept[name], args, new.target || Counted); };
        Counted.prototype = kept[name].prototype;
        THREE[name] = Counted;
    }
    try {
        for (let i = 2; i < 302; i++) frame(i);
    } finally {
        for (const name of names) THREE[name] = kept[name];
    }
    assert.equal(made, 0);
    // And the stand-ins do count: a vector made through the namespace is seen.
    assert.ok(out.isVector3);
    reset();
});

test('a frame of the ridden pair costs a few microseconds', () => {
    reset();
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2);
    const object = instance.object, character = ridden({ _rrSteer: 0.4, _rrSpeed: 8 });
    const holder = { object, binding: instance.binding, character }, spec = { name: 'Toy', size: 2 }, out = vec(0, 0, 0);
    const frame = i => {
        w.Graphics.frameCount++;
        character._rrYaw = i * 0.01; character._rrTravel = i * 0.13;
        object.position.y = 0;
        V.drive(holder, null, 1);
        V.pose(holder, character, object, spec, 0);
        V.pointWorld(object, 'ride.0.handL', out);
    };
    for (let i = 0; i < 3000; i++) frame(i);
    const start = process.hrtime.bigint();
    for (let i = 0; i < 20000; i++) frame(i);
    const each = Number(process.hrtime.bigint() - start) / 20000 / 1000;
    console.log(`    the ride's state, the vehicle's pose and one point: ${each.toFixed(2)} microseconds a drawn frame`);
    // Everything drawn aboard has 100 microseconds on a weak CPU. This part of it measures 5 to 6 on a fast desktop.
    // The clock is a measure to read, not a rule (a machine running twenty suites at once measures several times
    // that): what a frame may not do, make an object, is counted in the test above.
    assert.ok(each < 400, `${each} microseconds`);
    reset();
});

//-----------------------------------------------------------------------------
// The edges: what a file leaves out or gets wrong, what a ride leaves behind, and what a map with no vehicle pays

test('a stand, a list or a name that is written and is not what the format asks for is left out and said', () => {
    const block = V.read({ vehicle: { forward: '-x', stand: { lean: '10' }, wheels: 'Front wheel', seats: { seat: { at: [0, 1, 0] } }, controls: 'bars', tracks: 7 } }, NINJA_BOX);
    assert.deepEqual(plain(block.problems).map(p => p.key), ['badStand', 'badWheels', 'badSeats', 'badControls', 'badTracks']);
    assert.equal(block.stand, null, 'it stands upright');
    assert.deepEqual(plain(block.wheels), []);
    // What was not read is guessed, as if the key were absent.
    assert.deepEqual(plain(block.guessed), { forward: false, wheels: true, controls: true, seats: true });
    assert.deepEqual([block.seats.length, block.controls.length], [1, 1]);
    // An entry of a list that is no object is said by its place.
    const lists = V.read({ vehicle: { forward: '-x', seats: [7], controls: ['bars', null] } }, NINJA_BOX);
    assert.deepEqual(plain(lists.problems), [{ key: 'noSeatPoint', args: { seat: 0 } }, { key: 'controlNeedsAt', args: { control: 0 } }, { key: 'controlNeedsAt', args: { control: 1 } }]);
    // Absent or null is no mistake.
    assert.deepEqual(plain(V.read({ vehicle: { forward: '-x', stand: null, wheels: null, tracks: null } }, NINJA_BOX).problems), []);
    // A stand's lean is held between upright and 45 degrees; its side is left unless it says right.
    const lean = written => V.read({ vehicle: { forward: '-x', stand: written } }, null).stand;
    assert.deepEqual([plain(lean({ lean: 80 })), plain(lean({ lean: -5, side: 'right' })), plain(lean({ lean: 12, side: 'up' }))],
        [{ lean: 45, side: 'left' }, { lean: 0, side: 'right' }, { lean: 12, side: 'left' }]);
    // A front or a guessed name that is a word every object answers to is no front and no name: nothing throws.
    for (const word of ['constructor', 'toString', '__proto__', 'valueOf']) {
        const odd = V.read({ vehicle: { forward: word, guessed: [word, 'seats'] } }, NINJA_BOX);
        assert.deepEqual([odd.forward, plain(odd.problems).map(p => p.key), plain(odd.guessed)], ['+x', ['badForward'], { forward: true, wheels: true, controls: true, seats: true }], word);
        assert.equal(V.frame(word), null, word);
        assert.equal(V.forwardName(word), '', word);
    }
});

test('a sidecar whose `vehicle` is not an object has no block, whatever else it holds', () => {
    // The other keys of a block beside a `vehicle` that is null or a number are not a block written bare.
    for (const written of [null, 5, 'bike', []]) {
        const block = V.read({ vehicle: written, forward: '-x', seats: [{ seat: { at: [0.3, 1, 0] } }] }, NINJA_BOX);
        assert.deepEqual([block.forward, block.guessed.forward, block.guessed.seats], ['+x', true, true], JSON.stringify(written));
        assert.deepEqual(Object.keys(R.readModelLandmarks({ vehicle: written, forward: '-x' })), [], JSON.stringify(written));
    }
    // A block written bare (no `vehicle` key at all) is read.
    assert.equal(V.read({ forward: '-x', seats: [{ seat: { at: [0.3, 1, 0] } }] }, NINJA_BOX).forward, '-x');
    // A sidecar that has animations or parts of its own and none of `vehicle` is a sidecar, not a block.
    assert.equal(V.read({ forward: '-x', animations: [] }, NINJA_BOX).guessed.forward, true);
});

test('the car\'s guess: to the left on a wheel a fifth of the height across, feet a fifth of the length ahead, the column raked 25 degrees', () => {
    // 4 long, 1.4 tall, 1.8 wide, its front toward +x: its left is -z.
    const car = V.guess({ size: [4, 1.4, 1.8] }, 'car', null, { forward: '+x' }), seat = car.seats[0];
    closeAll(seat.seat.at, [-0.05 * 4, 0.45 * 1.4, -0.25 * 1.8], 1e-9, 'the seat');
    // The wheel's hub is 0.12 of the length ahead of the seat and a fifth of the height above it.
    const hub = [seat.seat.at[0] + 0.12 * 4, seat.seat.at[1] + 0.2 * 1.4, seat.seat.at[2]];
    closeAll(seat.handL.at, [hub[0], hub[1], hub[2] - 0.1 * 1.4], 0.001, 'the left hand at nine');
    closeAll(seat.handR.at, [hub[0], hub[1], hub[2] + 0.1 * 1.4], 0.001, 'the right hand at three');
    close(Math.abs(seat.handL.at[2] - seat.handR.at[2]), 0.2 * 1.4, 0.001, 'a wheel a fifth of the height across');
    closeAll(seat.footL.at, [seat.seat.at[0] + 0.2 * 4, 0.15 * 1.4, seat.seat.at[2] - 0.06 * 1.8], 0.001, 'the left foot');
    closeAll(seat.footR.at, [seat.seat.at[0] + 0.2 * 4, 0.15 * 1.4, seat.seat.at[2] + 0.06 * 1.8], 0.001, 'the right foot');
    const control = car.controls[0];
    assert.deepEqual([control.shape, control.input, control.degrees, control.degreesAtSpeed], ['wheel', 'steer', 90, 90]);
    closeAll(control.at, hub, 0.001, 'the column goes through the hub');
    closeAll(control.axis, [-Math.sin(25 * DEG), Math.cos(25 * DEG), 0], 0.001, 'leaning back 25 degrees');
    // A wheel the file names with no line of its own is raked the same; bars 24.
    const read = V.read({ vehicle: { forward: '+x', controls: [{ shape: 'wheel', part: 'Wheel' }, { shape: 'bars', part: 'Bars' }, { shape: 'levers', at: [0, 1, 0] }] } }, null);
    closeAll(read.controls[0].axis, [-Math.sin(25 * DEG), Math.cos(25 * DEG), 0], 0.001, 'a wheel');
    closeAll(read.controls[1].axis, [-Math.sin(24 * DEG), Math.cos(24 * DEG), 0], 0.001, 'bars');
    assert.deepEqual([read.controls[0].degrees, read.controls[0].degreesAtSpeed, read.controls[1].degrees, read.controls[1].degreesAtSpeed], [90, 90, 30, 7]);
});

test('the front finder: where the hands cannot tell the two ends apart, the end with the seat lower than what stands ahead of it', () => {
    // Bars at both ends: the guessed hands lie as near a surface either way.
    assert.equal(V.findFront(null, 'motorcycle', tieToy), '-x', 'the hump is ahead of the seat toward -x');
    // The same toy turned end for end: the other end.
    const turned = makeToy([BODY, ['BarsA', 'box', 0.05, 0.05, 0.6, -0.36, 0.76, 0], ['BarsB', 'box', 0.05, 0.05, 0.6, 0.36, 0.76, 0],
        ['Hump', 'box', 0.3, 0.1, 0.2, 0.15, 0.95, 0], ...WHEELS], [2, 1.025, 0.6]);
    assert.equal(V.findFront(null, 'motorcycle', turned), '+x');
    // Bars at one end only: the hands say, and the hump has no say.
    assert.equal(V.findFront(null, 'motorcycle', frontToy), '-x');
});

test('a model no tool has opened is looked at once: the game finds its front, so it is not ridden tail first', () => {
    reset();
    const spec = { name: 'Front', size: 2 };
    const north = ridden({ _rrYaw: 0 });
    // No sidecar at all. Posed the first time, its front is looked for: the end where the hands have bars to hold.
    const first = build(frontToy, null, 2);
    assert.equal(first.block, null);
    const holder = { object: first.object, spec: 'front-toy' };
    V.pose(holder, north, first.object, spec, 0);
    const block = V.blockOf(first.object);
    assert.equal(block.forward, '-x');
    assert.deepEqual(plain(block.guessed), { forward: true, wheels: true, controls: true, seats: true });
    closeAll(drawn(first.object, [-1, 0, 0]).front, [0, 0, -1], 1e-9, 'heading north, its bars lead');
    // The seat is behind the middle along that front, the hands ahead of it: on the model, the bars' end.
    assert.ok(block.seats[0].seat.at[0] > 0 && block.seats[0].handL.at[0] < 0, 'the seat and the hands are laid out along the found front');
    assert.ok(block.seats[0].handL.at[2] > 0, 'the left hand is on its left (up x front)');
    assert.ok(V.surfaceNear(frontToy, block.seats[0].handL.at) < 0.03, 'the guessed hand is at the bars');
    // What was read of the model to find it is let go again: asked for now, its triangles are read anew.
    let walks = 0;
    const walk = first.object.traverse;
    first.object.traverse = function(visit) { walks++; return walk.call(this, visit); };
    V.shapeOf(first.object);
    assert.equal(walks, 1, 'the triangles were not kept');
    first.object.traverse = walk;
    // The next instance of the same model takes the answer: nothing is looked at again. (Shown with a model that
    // alone would answer the other end, under the same name.)
    assert.equal(V.findFront(null, 'motorcycle', toyTemplate), '+x');
    const second = build(toyTemplate, null, 2);
    V.pose({ object: second.object, spec: 'front-toy' }, north, second.object, spec, 0);
    assert.equal(V.blockOf(second.object).forward, '-x', 'once a model');
    const third = build(toyTemplate, null, 2);
    V.pose({ object: third.object, spec: 'another-toy' }, north, third.object, spec, 0);
    assert.equal(V.blockOf(third.object).forward, '+x', 'another model is looked at itself');
    // A tool that had the model's triangles in hand keeps them.
    const tooled = build(frontToy, null, 2);
    const shape = V.shapeOf(tooled.object);
    V.blockOf(tooled.object, 'motorcycle');
    assert.equal(V.shapeOf(tooled.object), shape);
    reset();
});

test('a block that writes no front has it found on the first instance built, once for the model\'s file', () => {
    // A block with a stand and nothing else: the readers know no front, the binder finds it.
    const sidecar = { vehicle: { stand: { lean: 10, side: 'left' }, controls: [{ input: 'steer', shape: 'bars', part: 'Bars' }], wheels: ['WheelF', 'WheelR'] } };
    const before = V.read(sidecar, null);
    assert.deepEqual([before.forward, before.guessed.forward], ['+x', true], 'with nothing to look at, the positive end');
    const instance = build(frontToy, sidecar, 2), block = instance.block;
    assert.equal(block, before, 'the same block, completed');
    assert.deepEqual([block.forward, plain(block.f), plain(block.left), block.guessed.forward], ['-x', [-1, 0, 0], [0, 0, 1], true]);
    // What was laid out along the first guess is laid out along the found front: the seat, and a line the file did not give.
    assert.ok(block.seats[0].seat.at[0] > 0 && block.seats[0].handL.at[0] < 0);
    closeAll(block.controls[0].axis, [Math.sin(24 * DEG), Math.cos(24 * DEG), 0], 0.001, 'the bars\' line leans back from the found front');
    // The rules made after it roll the wheels about the vehicle's left as found.
    assert.deepEqual(plain(V.rulesOf(block)).filter(rule => rule.type === 'spin').map(rule => rule.axisVector), [[0, 0, 1], [0, 0, 1]]);
    assert.deepEqual([block.wheels[0].part, block.wheels[0].side], ['WheelF', '']);
    // The file is looked at once: the next instance built with it takes the front the block has. (Shown with a
    // model that alone would answer the other end, built with the same file.)
    const again = build(toyTemplate, sidecar, 2);
    assert.equal(again.block, block);
    assert.equal(block.forward, '-x', 'the front found for the file stands');
    // A front the file writes is never looked for, right or wrong.
    assert.equal(build(frontToy, { vehicle: { forward: '+x' } }, 2).block.forward, '+x');
    // A front a tool guessed and wrote is the file's.
    const guessed = build(frontToy, { vehicle: { forward: '+z', guessed: ['forward'] } }, 2).block;
    assert.deepEqual([guessed.forward, guessed.guessed.forward], ['+z', true]);
});

test('read with the box boxOf measured has the model in hand: the front a use is given is the one its instances are drawn with', () => {
    // What the game's world file does for a type's look: the template's own box, a sidecar with no block (or none).
    const bars = makeToy([BODY, ['Bars', 'box', 0.05, 0.05, 0.6, -0.36, 0.76, 0], ...WHEELS], [2, 1.025, 0.6]);
    const plainBox = { min: [-1, 0, -0.3], max: [1, 1.025, 0.3] };
    assert.equal(V.read({}, plainBox).forward, '+x', 'a bare box has nothing to look at: the positive end');
    const fromTemplate = V.read({}, V.boxOf(bars));
    assert.deepEqual([fromTemplate.forward, plain(fromTemplate.f), fromTemplate.guessed.forward], ['-x', [-1, 0, 0], true], 'found on the template, and still said to be a guess');
    assert.ok(fromTemplate.seats[0].seat.at[0] > 0 && fromTemplate.seats[0].handL.at[0] < 0, 'the seat and the hands along the found front');
    assert.equal(V.read(null, V.boxOf(bars)).forward, '-x', 'with no sidecar at all');
    // A sidecar read first with no box (the readers), then with the model's: the same block, its front found then.
    const sidecar = { vehicle: { stand: { lean: 10, side: 'left' } } };
    const early = V.read(sidecar, null);
    assert.equal(early.forward, '+x');
    assert.equal(V.read(sidecar, V.boxOf(bars)), early);
    assert.equal(early.forward, '-x');
    // A front the file writes is never looked for.
    assert.equal(V.read({ vehicle: { forward: '+x' } }, V.boxOf(bars)).forward, '+x');
    // An instance of that file posed with the front its use was given: front first.
    const instance = build(bars, null, 2), object = instance.object;
    V.pose({ object, spec: 'bars-toy' }, ridden({ _rrYaw: 0 }), object, { name: 'Bars', size: 2, faces: { front: fromTemplate.f.slice() } }, 0);
    closeAll(drawn(object, [-1, 0, 0]).front, [0, 0, -1], 1e-9, 'heading north, its bars lead');
    assert.equal(V.blockOf(object).forward, '-x', 'and its own block agrees');
    // Looked for once a loaded file: every instance shares its template's measure, and the answer is kept by it.
    // (Shown with a model that alone would answer the other end, carrying the same measure.)
    assert.equal(V.findFront(null, 'motorcycle', toyTemplate), '+x');
    const twin = build(toyTemplate, null, 2);
    twin.object.userData.glbSize = bars.userData.glbSize;
    assert.equal(V.blockOf(twin.object, 'motorcycle').forward, '-x', 'the measure\'s answer');
    const other = build(toyTemplate, null, 2);
    assert.equal(V.blockOf(other.object, 'motorcycle').forward, '+x', 'another file is looked at itself');
    reset();
});

test('the Demo motorcycle with no block is given its true front the first time it is posed', real, () => {
    reset();
    const instance = build(ninja(), {}, 3.5), object = instance.object;
    assert.equal(instance.block, null);
    V.pose({ object, spec: 'Vehicles/kawashaki_ninja_h2' }, ridden({ _rrYaw: 0 }), object, { name: 'Vehicles/kawashaki_ninja_h2', size: 3.5 }, 0);
    const block = V.blockOf(object);
    assert.equal(block.forward, '-x');
    closeAll(drawn(object, [-1, 0, 0]).front, [0, 0, -1], 1e-9, 'heading north, its headlight leads');
    // The guessed left hand is within reach of the real left grip (0.03 of the model's length), on the model's left.
    const want = fixture('ninja-vehicle.json').seats[0];
    closeAll(block.seats[0].handL.at, want.handL.at, 0.03, 'the left hand');
    closeAll(block.seats[0].seat.at, want.seat.at, 0.03, 'the seat');
    reset();
});

test('a guess handed straight to the binder binds: its points, its wheels and its steering line', () => {
    const bare = build(toyTemplate, null, 2);
    const guess = V.guess(null, 'motorcycle', toyTemplate, { forward: '-x' });
    const bound = V.bind(bare.object, guess, null);
    assert.equal(bound, guess);
    assert.equal(V.blockOf(bare.object), guess);
    assert.deepEqual(Object.keys(bare.object.__reactorLandmarks).sort(), ['control.0', 'ride.0.footL', 'ride.0.footR', 'ride.0.handL', 'ride.0.handR', 'ride.0.seat', 'wheel.0', 'wheel.1']);
    closeAll(pivotOf(bare.object, 'WheelF'), [-0.7, 0.3, 0], 0.005, 'a found wheel turns about its axle');
});

test('a wheel beside the center line is on that side of it, by the vehicle\'s own left', () => {
    const sides = forward => Array.from(build(sideToy, { vehicle: { forward, wheels: ['Wheel', 'Side'], seats: [], controls: [] } }, 2).block.wheels, wheel => wheel.side);
    assert.deepEqual(sides('-x'), ['', 'left'], 'front toward -x: +z is its left');
    assert.deepEqual(sides('+x'), ['', 'right']);
    // A side the file writes stands.
    const written = build(sideToy, { vehicle: { forward: '-x', wheels: ['Wheel', { part: 'Side', side: 'right' }], seats: [], controls: [] } }, 2).block.wheels;
    assert.equal(written[1].side, 'right');
});

test('a control that names its part and no place turns about its part\'s pivot, and a hand that only follows it swings with it', Object.assign({}, needsSeam()), () => {
    reset();
    // The bars' part is given a pivot by the file; the control says nothing of where its line is.
    const block = TOY_BLOCK();
    delete block.controls[0].at;
    delete block.seats[0].handL.part;
    const sidecar = { pivots: { Bars: [-0.5, 0.6, 0] }, vehicle: block };
    const instance = build(toyTemplate, sidecar, 2), object = instance.object;
    assert.deepEqual(plain(instance.block.problems), []);
    closeAll(instance.block.controls[0].at, [-0.5, 0.6, 0], 1e-9, 'the line goes through the part\'s pivot');
    assert.equal(instance.block.controls[0].written, false, 'which the file did not write');
    assert.ok(object.__reactorLandmarks['control.0'], 'so the line has its point');
    const character = ridden(), holder = { object, binding: instance.binding, character };
    const state = () => ({ frame: 1, moving: false, dashing: false, airborne: false, swimming: false, climbing: false, distance: 0, scale: instance.scale, moveScale: 1 });
    const at = name => { object.updateMatrixWorld(true); return V.pointWorld(object, name, vec(0, 0, 0)).clone(); };
    V.drive(holder, null, 1);
    R.applyModelAnimation(instance.binding, instance.rules, state());
    const rest = { L: at('ride.0.handL'), R: at('ride.0.handR') };
    character._rrSteer = 1;
    V.drive(holder, null, 1);
    R.applyModelAnimation(instance.binding, instance.rules, state());
    const movedL = rest.L.distanceTo(at('ride.0.handL')), movedR = rest.R.distanceTo(at('ride.0.handR'));
    // The right hand rides the part; the left only follows the control. Both grips are 0.28 from the line: they move alike.
    assert.ok(movedR > 0.1, `the bars turned: ${movedR}`);
    close(movedL, movedR, 1e-6, 'the hand with no part moves as far as the one on the bars');
    assert.ok(at('ride.0.handL').x < rest.L.x && at('ride.0.handR').x > rest.R.x, 'steering right, the left hand goes forward and the right comes back');
    V.drive(null, null);
    // The same with no pivot written anywhere: the line goes through where the file's node turns (the toy's origin).
    const loose = TOY_BLOCK();
    delete loose.controls[0].at;
    closeAll(build(toyTemplate, { vehicle: loose }, 2).block.controls[0].at, [0, 0, 0], 1e-9, 'the part\'s own pivot');
    // A control whose part the model lacks has no line to give, and says so.
    const lost = TOY_BLOCK();
    lost.controls[0] = { input: 'steer', shape: 'bars', part: 'No bars here' };
    delete lost.seats[0].handL.part; delete lost.seats[0].handR.part;
    const none = build(toyTemplate, { vehicle: lost }, 2);
    assert.deepEqual(plain(none.block.problems), [{ key: 'missingPart', args: { point: 'control.0', part: 'No bars here' } }]);
    assert.ok(V.pointWorld(none.object, 'ride.0.handL', vec(0, 0, 0)), 'the hand keeps its place');
    reset();
});

test('asked for as another kind, an instance has what was filled in for a motorcycle filled in again', () => {
    // The readers do not know the kind: a block with a front and no seats gets a motorcycle's seat and bars.
    const sidecar = { vehicle: { forward: '+x' } };
    const instance = build(toyTemplate, sidecar, 2), object = instance.object, block = instance.block;
    assert.deepEqual([block.seats.length, block.controls.length, block.kind], [1, 1, 'motorcycle']);
    assert.ok(V.pointWorld(object, 'ride.0.seat', vec(0, 0, 0)));
    // Asked as itself, nothing changes.
    const seat = block.seats[0];
    assert.equal(V.blockOf(object, 'motorcycle'), block);
    assert.equal(block.seats[0], seat);
    // A tank's rider is inside: no seat, no bars, and no point left bound for them.
    assert.equal(V.blockOf(object, 'tank'), block);
    assert.deepEqual([block.seats.length, block.controls.length, block.kind], [0, 0, 'tank']);
    assert.equal(V.pointWorld(object, 'ride.0.seat', vec(0, 0, 0)), null);
    assert.equal(V.pointWorld(object, 'control.0', vec(0, 0, 0)), null);
    assert.deepEqual(plain(V.pointNames(block)), []);
    // A car sits to the left on a wheel.
    V.blockOf(object, 'car');
    assert.deepEqual([block.seats[0].posture, block.controls[0].shape], ['seated', 'wheel']);
    assert.ok(V.pointWorld(object, 'ride.0.seat', vec(0, 0, 0)));
    // What the file wrote is never filled in again; an unknown kind's name changes nothing.
    const written = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2);
    const kept = plain(written.block.seats);
    V.blockOf(written.object, 'tank');
    assert.deepEqual(plain(written.block.seats), kept);
    V.blockOf(object, 'toString');
    assert.equal(block.kind, 'car');
    // Two instances of one file, both built before either is asked (two tanks on a map): the block is theirs in
    // common, and the second asked drops its own motorcycle's seat too.
    const shared = { vehicle: { forward: '+x' } };
    const one = build(toyTemplate, shared, 2), two = build(toyTemplate, shared, 2);
    assert.equal(one.block, two.block);
    assert.ok(V.pointWorld(one.object, 'ride.0.seat', vec(0, 0, 0)) && V.pointWorld(two.object, 'ride.0.seat', vec(0, 0, 0)));
    V.blockOf(one.object, 'tank');
    V.blockOf(two.object, 'tank');
    assert.equal(V.pointWorld(one.object, 'ride.0.seat', vec(0, 0, 0)), null);
    assert.equal(V.pointWorld(two.object, 'ride.0.seat', vec(0, 0, 0)), null, 'the second instance');
    assert.equal(V.pointWorld(two.object, 'control.0', vec(0, 0, 0)), null);
    // And both get the next kind's seat, each bound on its own instance.
    V.blockOf(one.object, 'car');
    V.blockOf(two.object, 'car');
    two.object.position.set(5, 0, 0);
    two.object.updateMatrixWorld(true);
    const seatOne = V.pointWorld(one.object, 'ride.0.seat', vec(0, 0, 0)).clone(), seatTwo = V.pointWorld(two.object, 'ride.0.seat', vec(0, 0, 0)).clone();
    closeAll(arr(seatTwo), [seatOne.x + 5, seatOne.y, seatOne.z], 1e-9, 'the same seat on each');
    // A block put on an object by hand (no binder ran) is asked the same way.
    const byHand = new THREE.Group();
    byHand.userData.glbSize = { x: 6, y: 2, z: 3 };
    byHand.__reactorVehicle = V.read({ vehicle: { forward: '+x', wheels: [] } }, { size: [6, 2, 3] });
    assert.equal(byHand.__reactorVehicle.seats.length, 1, 'read with no kind, a motorcycle\'s seat');
    assert.equal(V.blockOf(byHand, 'tank').seats.length, 0, 'asked as a tank');
    assert.equal(V.blockOf(byHand, 'tank').seats.length, 0);
});

test('a hop off with the foot down goes from the foot onto the stand without coming upright between', () => {
    reset();
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), object = instance.object, holder = { object };
    const character = ridden({ _rrYaw: 0 }), spec = { name: 'Toy', size: 2 };
    const lean = () => { V.pose(holder, character, object, spec, 0); return leanLeft(object); };
    // Stopped, the stand-side foot down: tipped 5 degrees to its left.
    w.$gamePlayer._rrDrive = { foot: 1 };
    close(lean(), -5, 1e-6, 'on its foot');
    const off = [];
    for (let t = 0; t <= 14; t++) { w.$gamePlayer._rrMount = { t, n: 14, on: false }; off.push(lean()); }
    close(off[0], -5, 1e-6, 'the hop off starts from the foot');
    for (let t = 1; t <= 14; t++) assert.ok(off[t] <= off[t - 1] + 1e-9, `it leans further at tick ${t}: ${off[t]} after ${off[t - 1]}`);
    assert.ok(off.every(value => value <= -5 + 1e-9), 'never back toward upright');
    close(off[14], -10, 1e-6, 'on its stand at tick 14');
    // The leg leaving the ground on its way off changes nothing: the vehicle leans from where the foot held it.
    w.$gamePlayer._rrMount = null;
    close(lean(), -5, 1e-6);
    const lifted = [];
    for (let t = 0; t <= 14; t++) { w.$gamePlayer._rrMount = { t, n: 14, on: false }; w.$gamePlayer._rrDrive.foot = Math.max(0, 1 - t / 3); lifted.push(lean()); }
    closeAll(lifted, off, 1e-9, 'the same lean with the leg lifting');
    // Parked, the foot is nobody's: exactly its stand.
    character._rrBoarded = false; w.$gamePlayer._rrMount = null; w.$gamePlayer._rrDrive.foot = 1;
    close(lean(), -10, 1e-6, 'parked');
    // Getting on with the foot already coming down: off the stand onto the foot, never past upright.
    character._rrBoarded = true;
    const on = [];
    for (let t = 0; t <= 14; t++) { w.$gamePlayer._rrMount = { t, n: 14, on: true }; w.$gamePlayer._rrDrive.foot = Math.min(1, t / 10); on.push(lean()); }
    for (let t = 0; t <= 10; t++) close(on[t], -10, 1e-6, `on its stand at tick ${t}`);
    for (let t = 11; t <= 14; t++) assert.ok(on[t] > on[t - 1] && on[t] <= -5 + 1e-9, `coming up onto the foot at tick ${t}: ${on[t]}`);
    close(on[14], -5, 1e-6, 'on the foot at tick 14');
    // A vehicle with no stand: the foot alone, to the left, fading as the party gets off.
    const bare = TOY_BLOCK(); delete bare.stand;
    const upright = build(toyTemplate, { vehicle: bare }, 2);
    const holder2 = { object: upright.object };
    const lean2 = () => { V.pose(holder2, character, upright.object, spec, 0); return leanLeft(upright.object); };
    w.$gamePlayer._rrMount = null; w.$gamePlayer._rrDrive.foot = 1;
    close(lean2(), -5, 1e-6, 'on the foot');
    w.$gamePlayer._rrMount = { t: 14, n: 14, on: false };
    close(lean2(), 0, 1e-6, 'left standing upright');
    reset();
});

test('the tip onto the foot is the rider\'s own foot when the rider\'s file keeps one: a sole that cannot reach the ground tips nothing', () => {
    reset();
    const vehicle = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), rider = build(toyTemplate, null, 2);
    const character = ridden({ _rrYaw: 0 }), spec = { name: 'Toy', size: 2 };
    const vehicleHolder = { object: vehicle.object, binding: vehicle.binding, character };
    const riderHolder = { object: rider.object, binding: rider.binding, character: { _rrSeated: true }, rider: { footDown: 0 } };
    const lean = () => { V.pose(vehicleHolder, character, vehicle.object, spec, 0); return leanLeft(vehicle.object); };
    w.$gamePlayer._rrDrive = { foot: 1 };
    V.drive(vehicleHolder, riderHolder, 1);
    close(lean(), 0, 1e-6, 'the mover says down, the rider\'s leg does not reach: upright');
    riderHolder.rider.footDown = 0.5;
    close(lean(), -2.5, 1e-6, 'the rider\'s own foot, half way');
    riderHolder.rider.footDown = 7;
    close(lean(), -5, 1e-6, 'never more than the whole tip');
    // With no rider's file keeping a foot, the mover's is used.
    delete riderHolder.rider;
    w.$gamePlayer._rrDrive.foot = 1;
    close(lean(), -5, 1e-6, 'the mover\'s');
    w.$gamePlayer._rrDrive.foot = NaN;
    close(lean(), 0, 1e-6, 'a foot that is no number is up');
    reset();
});

test('a pitch, a lean or a speed that is not a number reads 0: the vehicle and its rider stay on the map', async () => {
    reset();
    const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), object = instance.object, holder = { object };
    const spec = { name: 'Toy', size: 2 };
    const level = quat((() => { V.pose({ object }, ridden({ _rrYaw: 0.3 }), object, spec, 0); return object.quaternion.clone(); })());
    for (const odd of [Infinity, -Infinity, NaN, 'steep', null, {}]) {
        const character = ridden({ _rrYaw: 0.3, _rrPitch: odd, _rrLean: odd, _rrSpeed: odd, _rrSteer: odd });
        w.Graphics.frameCount++;
        object.position.set(3, 1, 4);
        V.pose(holder, character, object, spec, 1);
        closeAll(quat(object.quaternion), level, 1e-12, String(odd));
        assert.deepEqual(arr(object.position), [3, 1, 4], String(odd));
        const inputs = V.inputs({ object }, character, 1);
        assert.equal(inputs.steer, 0, String(odd));
    }
    // A speed with no end still holds the bars to the share of lock they have at top speed.
    close(V.inputs({ object }, ridden({ _rrSteer: 1, _rrSpeed: 1e300 }), 1).steer, 7 / 30, 1e-12, 'top speed');
    // Through the sync, with the stand-in for the rider's file: the rider's place and turn stay numbers.
    await withModels({ Toy: { template: toyTemplate, sidecar: { vehicle: TOY_BLOCK() } }, Rider: { template: toyTemplate, sidecar: null } }, async () => {
        R.Rider = null;
        const { scene, characters } = sceneOf([{ id: 7, model: 'Toy', x: 6, y: 9, fields: { _rrVehicle: 1, _rrYaw: 0, _rrPose: 1 } }]);
        const bike = characters[0], player = w.$gamePlayer, savedSidecar = R._databaseSidecar;
        R._databaseSidecar = { actors: { [w.$gameParty.leader().actorId()]: { name: 'Rider', size: 3 } } };
        try {
            const sync = () => { w.Graphics.frameCount++; scene.syncCharacterModels([bike, player]); };
            sync(); await settle(); sync();
            Object.assign(bike, { _rrBoarded: true, _rrPitch: Infinity, _rrLean: -Infinity, _rrSpeed: NaN, _rrPose: 2 });
            Object.assign(player, { _rrRide: { map: w.$gameMap.mapId(), id: 7 }, _rrSeated: true });
            sync(); sync();
            const vehicleHolder = scene._modelInstances.get('e7'), riderHolder = scene._modelInstances.get('p');
            for (const it of [vehicleHolder.object, riderHolder.object]) {
                assert.ok(quat(it.quaternion).every(Number.isFinite) && arr(it.position).every(Number.isFinite));
            }
            closeAll(drawn(vehicleHolder.object).up, [0, 1, 0], 1e-9, 'upright');
        } finally { R._databaseSidecar = savedSidecar; }
    });
});

test('the share of lock at speed is the block\'s own, and top speed the type\'s', () => {
    reset();
    // Bars that turn 40 degrees standing and 10 at top speed.
    const block = TOY_BLOCK();
    Object.assign(block.controls[0], { degrees: 40, degreesAtSpeed: 10 });
    const instance = build(toyTemplate, { vehicle: block }, 2), holder = { object: instance.object };
    close(V.inputs(holder, ridden({ _rrSteer: 1, _rrSpeed: 20 }), 1).steer, 10 / 40, 1e-12, 'a quarter of lock at top speed');
    close(V.inputs(holder, ridden({ _rrSteer: 1, _rrSpeed: 10 }), 1).steer, 1 + (10 / 40 - 1) * 0.5, 1e-12, 'half way at half speed');
    // A model with no steering control of its own: bars, 7 of 30.
    const none = TOY_BLOCK(); none.controls = [];
    close(V.inputs({ object: build(toyTemplate, { vehicle: none }, 2).object }, ridden({ _rrSteer: 1, _rrSpeed: 20 }), 1).steer, 7 / 30, 1e-12, 'no control');
    // The type the game names for the event says what top speed is.
    const kept = w.ReactorVehicles;
    const slow = V.typeOf({ kind: 'motorcycle', handling: { speed: 10 } });
    w.ReactorVehicles = { type: id => id === 2 ? slow : null };
    try {
        close(V.inputs(holder, ridden({ _rrVehicle: 2, _rrSteer: 1, _rrSpeed: 10 }), 1).steer, 10 / 40, 1e-12, 'top speed is 10 for this type');
        close(V.inputs(holder, ridden({ _rrVehicle: 2, _rrSteer: 1, _rrSpeed: 5 }), 1).steer, 1 + (10 / 40 - 1) * 0.5, 1e-12, 'half of its top speed');
        // A type the list does not hold is a motorcycle's 20.
        close(V.inputs(holder, ridden({ _rrVehicle: 9, _rrSteer: 1, _rrSpeed: 10 }), 1).steer, 1 + (10 / 40 - 1) * 0.5, 1e-12, 'an unknown type');
    } finally {
        if (kept === undefined) delete w.ReactorVehicles; else w.ReactorVehicles = kept;
    }
    reset();
});

test('the spring\'s limits: never more than a quarter tile over its wheels, the same pose twice in a tick, six ticks caught up, a long gap starts over', () => {
    reset();
    const spec = { name: 'Toy', size: 2 };
    const fresh = () => { const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2); return { object: instance.object, holder: { object: instance.object }, character: ridden() }; };
    const poseAt = (it, frame, ground) => { w.Graphics.frameCount = frame; it.object.position.y = ground; V.pose(it.holder, it.character, it.object, spec, ground); return it.object.position.y; };
    // The ground falling away a tile a tick (a cliff under a jump): the body is never more than 0.25 above it.
    const falling = fresh();
    poseAt(falling, 3000, 10);
    for (let tick = 1; tick <= 8; tick++) {
        const y = poseAt(falling, 3000 + tick, 10 - tick);
        assert.ok(y - (10 - tick) <= 0.25 + 1e-9 && y - (10 - tick) > 0, `tick ${tick}: ${y - (10 - tick)} over`);
    }
    // And never more than 0.2 under it, the ground rising as fast.
    const rising = fresh();
    poseAt(rising, 3000, 0);
    for (let tick = 1; tick <= 8; tick++) assert.ok(tick - poseAt(rising, 3000 + tick, tick) <= 0.2 + 1e-9, `tick ${tick}`);
    // Drawn twice in one tick (two views, or a placement asked for again): the second is the first, and a ground
    // that moved between the two moves what is drawn by as much.
    const twice = fresh();
    poseAt(twice, 3100, 0); poseAt(twice, 3101, 0.5); poseAt(twice, 3102, 0.5);
    const once = poseAt(twice, 3103, 0.5);
    assert.ok(Math.abs(once - 0.5) > 0.005, 'the spring is in mid-bounce');
    assert.equal(poseAt(twice, 3103, 0.5), once, 'the same tick again');
    close(poseAt(twice, 3103, 1.5), once + 1, 1e-12, 'the ground a tile higher in the same tick');
    // A gap of twenty ticks is caught up as six: the spring is never run away with after a hitch.
    const gap = (ticks) => { const it = fresh(); poseAt(it, 3200, 0); poseAt(it, 3201, 0.5); return poseAt(it, 3201 + ticks, 0.5); };
    assert.equal(gap(20), gap(6), 'twenty ticks are six');
    assert.notEqual(gap(6), gap(5));
    assert.equal(gap(30), gap(6), 'thirty still');
    // After a longer gap (a menu, a cutscene) it is simply where the placement put it, at rest.
    const long = fresh();
    poseAt(long, 3300, 0); poseAt(long, 3301, 0.5);
    assert.equal(poseAt(long, 3301 + 31, 0.5), 0.5);
    assert.equal(long.holder.rrDraw.busy, false);
    // The clock running backward (a new game) starts over too.
    assert.equal(poseAt(long, 100, 2), 2);
    reset();
});

test('only a stop nods: a hard knock that leaves it rolling does not', () => {
    reset();
    const spec = { name: 'Toy', size: 2 };
    const run = speeds => {
        const instance = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), object = instance.object, holder = { object }, character = ridden();
        const pitches = [];
        w.Graphics.frameCount = 4000;
        for (const speed of speeds) { w.Graphics.frameCount++; character._rrSpeed = speed; object.position.y = 0; V.pose(holder, character, object, spec, 0); pitches.push(Math.asin(drawn(object).front[1]) / DEG); }
        return pitches;
    };
    // 12 to 6 tiles a second in a tick, then rolling on at 6: no nod.
    assert.ok(Math.min(...run([12, 12, 12, 6, ...new Array(30).fill(6)])) > -0.01, 'still rolling');
    // 12 to under half a tile a second: the nod. Backing into a wall nods the same.
    assert.ok(Math.min(...run([12, 12, 12, 0.4, ...new Array(30).fill(0)])) < -4, 'stopped');
    assert.ok(Math.min(...run([-3, -3, -3, 0, ...new Array(30).fill(0)])) < -1, 'stopped backing');
    reset();
});

test('through the model sync: a vehicle whose springs are still moving is placed again every frame until they rest', async () => {
    reset();
    await withModels({ Toy: { template: toyTemplate, sidecar: { vehicle: TOY_BLOCK() } } }, async () => {
        const { scene, characters } = sceneOf([{ id: 1, model: 'Toy', x: 6, y: 9, fields: { _rrVehicle: 1, _rrYaw: 0, _rrPose: 1 } }]);
        const bike = characters[0];
        const sync = () => { w.Graphics.frameCount++; scene.syncCharacterModels(characters); };
        sync(); await settle();
        for (let i = 0; i < 10; i++) sync();
        const holder = scene._modelInstances.get('e1'), object = holder.object;
        const ground = object.position.y;
        assert.ok(holder.rootFrozen, 'at rest it is frozen');
        // Drawn frame after frame (the game says what is drawn of it changed), then lifted half a tile in one
        // frame, as the mover carries it over a curb. From there the game says nothing more.
        for (let i = 0; i < 5; i++) { bike._rrPose++; sync(); }
        bike._reactorLift = 0.5;
        sync();
        assert.ok(object.position.y > ground && object.position.y < ground + 0.5, 'the curb is taken through the spring');
        const heights = [];
        for (let i = 0; i < 90; i++) { sync(); heights.push(object.position.y); }
        assert.ok(heights[0] !== heights[1] && heights[1] !== heights[2], 'placed again frame after frame with nothing bumped');
        close(heights[heights.length - 1], ground + 0.5, 0.005, 'until it rests on the curb');
        assert.ok(holder.rootFrozen && !holder.rrDraw.busy, 'and then it is frozen again');
    });
});

test('through the model sync: at a stop the vehicle follows the foot down to the ground, with nothing bumped, and is frozen once the foot rests', async () => {
    reset();
    await withModels({ Toy: { template: toyTemplate, sidecar: { vehicle: TOY_BLOCK() } }, Rider: { template: toyTemplate, sidecar: null } }, async () => {
        R.Rider = null;
        const { scene, characters } = sceneOf([{ id: 7, model: 'Toy', x: 6, y: 9, fields: { _rrVehicle: 1, _rrYaw: 0, _rrPose: 1 } },
            { id: 8, model: 'Toy', x: 12, y: 9, fields: { _rrVehicle: 1, _rrYaw: 0, _rrPose: 1 } }]);
        const [bike, other] = characters, player = w.$gamePlayer, savedSidecar = R._databaseSidecar;
        R._databaseSidecar = { actors: { [w.$gameParty.leader().actorId()]: { name: 'Rider', size: 3 } } };
        try {
            const sync = () => { w.Graphics.frameCount++; scene.syncCharacterModels([bike, other, player]); };
            sync(); await settle(); sync();
            const vehicleHolder = scene._modelInstances.get('e7'), riderHolder = scene._modelInstances.get('p'), object = vehicleHolder.object;
            const otherHolder = scene._modelInstances.get('e8');
            Object.assign(bike, { _rrBoarded: true, _rrSteer: 0, _rrSpeed: 0, _rrTravel: 0, _rrPose: 2 });
            // The leg is on its way down when the game last says anything changed. (The toy rider is no body the
            // rider's file can seat, so the foot here is the mover's; the rider's own foot is read the same way.)
            Object.assign(player, { _rrRide: { map: w.$gameMap.mapId(), id: 7 }, _rrSeated: true, _rrDrive: { foot: 0.4 } });
            sync(); sync();
            assert.ok(riderHolder && !riderHolder.rider, 'no foot kept by the rider\'s file');
            close(leanLeft(object), -2, 1e-6, 'tipped by how far the foot is down');
            // From here the counter stands still. The leg comes down over the next frames; the vehicle goes with it.
            for (const down of [0.6, 0.8, 0.9, 1]) { player._rrDrive.foot = down; sync(); sync(); close(leanLeft(object), -5 * down, 1e-6, `the foot ${down} down`); }
            assert.equal(vehicleHolder.placed.rrPose, 2, 'nothing was bumped');
            for (let i = 0; i < 6; i++) sync();
            close(leanLeft(object), -5, 1e-6, 'on its foot');
            assert.ok(vehicleHolder.rootFrozen, 'and frozen once the foot rests');
            // The foot is under the ridden vehicle only: the one parked beside it stayed on its stand, frozen.
            assert.ok(otherHolder.rootFrozen, 'the parked one is not woken by a foot that is not its rider\'s');
            close(leanLeft(otherHolder.object), -10, 1e-6, 'on its stand');
            // A foot that trembles by less than a hundredth of a degree of tip does not wake it.
            player._rrDrive.foot = 0.999;
            sync(); sync();
            assert.ok(vehicleHolder.rootFrozen, 'still frozen');
            close(leanLeft(object), -5, 1e-6);
        } finally { R._databaseSidecar = savedSidecar; }
    });
});

test('the ride kept on the holders: the pair is sampled every frame, a ride that has ended leaves nothing on a model\'s animation, another event\'s rider is not seated', () => {
    reset();
    const a = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), b = build(toyTemplate, { vehicle: TOY_BLOCK() }, 2), rider = build(toyTemplate, null, 2);
    const first = { object: a.object, binding: a.binding, character: ridden({ _rrSteer: 0.5 }) };
    const second = { object: b.object, binding: b.binding, character: ridden({ eventId() { return 8; } }) };
    const riderHolder = { object: rider.object, binding: rider.binding, character: { _rrSeated: true, _rrRide: { id: 7 } } };
    const rules = R.readModelAnimationRules({ animations: [{ name: 'bob', type: 'bob', trigger: 'always', amount: 0.01 }] });
    const fresh = () => ({ frame: 1, moving: false, dashing: false, airborne: false, swimming: false, climbing: false, distance: 0, scale: 1, moveScale: 1 });
    // The ridden pair is marked sampled, so what is laid over the motion each frame is laid over theirs.
    V.drive(first, riderHolder, 1);
    first.sampled = false; riderHolder.sampled = false;
    assert.equal(R.animationDue(first, first.character, first.object, null), true);
    assert.equal(R.animationDue(riderHolder, riderHolder.character, riderHolder.object, null), true);
    assert.deepEqual([first.sampled, riderHolder.sampled], [true, true]);
    // The ride moves to another vehicle: the first one's animation is given nothing any more, with a ride still on.
    V.drive(second, riderHolder, 1);
    assert.equal(V.rideOf(first), null);
    let state = fresh();
    R.applyModelAnimation(a.binding, rules, state);
    assert.deepEqual(Object.keys(state).sort(), Object.keys(fresh()).sort(), 'the vehicle that was left');
    state = fresh();
    R.applyModelAnimation(b.binding, rules, state);
    assert.equal(state.inputs, second.rrInputs, 'the one now ridden');
    // The rider's saved ride names event 7; the vehicle now ridden is event 8: the rider's file is not asked to
    // seat it there.
    const keptRider = R.Rider;
    let seats = 0;
    R.Rider = { seat() { seats++; } };
    try {
        V.pose(riderHolder, riderHolder.character, rider.object, { name: 'Toy', size: 2 }, 0);
        assert.equal(seats, 0, 'another event\'s rider');
        V.drive(first, riderHolder, 1);
        V.pose(riderHolder, riderHolder.character, rider.object, { name: 'Toy', size: 2 }, 0);
        assert.equal(seats, 1, 'its own');
        // A character in the hop and not seated (the picture of a hop still playing) is the rider's file's too.
        V.pose(riderHolder, { _rrMount: { t: 3, n: 14, on: false, drawn: true }, _rrRide: { id: 7 } }, rider.object, { name: 'Toy', size: 2 }, 0);
        assert.equal(seats, 2, 'in the hop');
        // Without that file the seat is this file's stand-in, and it moves only a seated character.
        R.Rider = null;
        const place = () => arr(rider.object.position);
        rider.object.position.set(1, 0, 1);
        V.pose(riderHolder, { _rrMount: { t: 3, n: 14, on: true }, _rrRide: { id: 7 } }, rider.object, { name: 'Toy', size: 2 }, 0);
        assert.deepEqual(place(), [1, 0, 1], 'in the hop it is left where the placement put it');
        V.pose(riderHolder, riderHolder.character, rider.object, { name: 'Toy', size: 2 }, 0);
        assert.notDeepEqual(place(), [1, 0, 1], 'seated, it is put on the seat');
        // The rider model's own art turn (a file that faces sideways) stays under the vehicle's heading.
        const straight = rider.object.quaternion.clone();
        V.pose(riderHolder, riderHolder.character, rider.object, { name: 'Toy', size: 2, yaw: Math.PI / 2 }, 0);
        const turned = straight.clone().multiply(new THREE.Quaternion().setFromAxisAngle(vec(0, 1, 0), Math.PI / 2));
        closeAll(quat(rider.object.quaternion), quat(turned), 1e-9, 'the spec\'s own yaw');
    } finally { R.Rider = keptRider; }
    reset();
});

test('through the model sync: a ride saved on another map is not this map\'s; a character in the hop counts as the ride; the rider\'s light swings with the vehicle', async () => {
    reset();
    await withModels({ Toy: { template: toyTemplate, sidecar: { vehicle: TOY_BLOCK() } }, Rider: { template: toyTemplate, sidecar: null } }, async () => {
        let seats = 0;
        R.Rider = { seat() { seats++; } };
        const { scene, characters } = sceneOf([{ id: 7, model: 'Toy', x: 6, y: 9, fields: { _rrVehicle: 1, _rrYaw: 90 * DEG, _rrPose: 1 } }]);
        const bike = characters[0], player = w.$gamePlayer, savedSidecar = R._databaseSidecar;
        R._databaseSidecar = { actors: { [w.$gameParty.leader().actorId()]: { name: 'Rider', size: 3 } } };
        try {
            const sync = () => { w.Graphics.frameCount++; scene.syncCharacterModels([bike, player]); };
            sync(); await settle(); sync();
            const vehicleHolder = scene._modelInstances.get('e7'), riderHolder = scene._modelInstances.get('p');
            bike._rrBoarded = true; bike._rrPose = 2;
            // The same event id, saved for another map: no ride here.
            Object.assign(player, { _rrRide: { map: w.$gameMap.mapId() + 1, id: 7 }, _rrSeated: true });
            sync();
            assert.equal(V.rideOf(vehicleHolder), null, 'another map\'s ride');
            assert.equal(V.rideOf(riderHolder), null);
            player._rrRide = { map: w.$gameMap.mapId(), id: 7 };
            sync();
            assert.ok(V.rideOf(vehicleHolder) && V.rideOf(riderHolder), 'this map\'s');
            // A ride with no map written (a hand-made state) is taken by its id.
            player._rrRide = { id: 7 };
            sync();
            assert.ok(V.rideOf(vehicleHolder));
            // The seated rider's published facing is the vehicle's heading, so a light it carries swings with the bike.
            close(player._reactorModelYaw, Math.PI - 90 * DEG, 1e-12, 'the rider faces where the vehicle heads');
            bike._rrYaw = 200 * DEG; bike._rrPose = 3;
            sync();
            close(player._reactorModelYaw, Math.PI - 200 * DEG, 1e-12, 'and turns with it');
            // In the hop and not seated: still the ride, and the rider's file is asked for the character's place.
            delete player._rrSeated;
            player._rrMount = { t: 5, n: 14, on: false, drawn: true };
            const before = seats;
            sync();
            assert.ok(V.rideOf(vehicleHolder) && V.rideOf(riderHolder), 'the hop is the ride');
            assert.equal(V.rideOf(riderHolder).riding, false, 'but nobody is seated');
            assert.ok(seats > before, 'the hop is the rider\'s file\'s to draw');
            // Neither seated nor in a hop: no ride.
            delete player._rrMount;
            sync();
            assert.equal(V.rideOf(vehicleHolder), null);
        } finally { R._databaseSidecar = savedSidecar; }
    });
});

test('through the model sync: a parked vehicle with nothing to play runs no animation pass; a ride, a move, a flash or a rule of its own does', async () => {
    reset();
    const own = { animations: [{ name: 'idle-bob', type: 'bob', trigger: 'always', amount: 0.01 }], vehicle: TOY_BLOCK() };
    await withModels({ Toy: { template: toyTemplate, sidecar: { vehicle: TOY_BLOCK() } }, Bobber: { template: toyTemplate, sidecar: own },
        Crate: { template: toyTemplate, sidecar: { animations: [{ name: 'bob', type: 'bob', trigger: 'always', amount: 0.01 }] } }, Rider: { template: toyTemplate, sidecar: null } }, async () => {
        R.Rider = null;
        const { scene, characters } = sceneOf([
            { id: 7, model: 'Toy', x: 6, y: 9, fields: { _rrVehicle: 1, _rrYaw: 0, _rrPose: 1 } },
            { id: 8, model: 'Bobber', x: 10, y: 9, fields: { _rrVehicle: 1, _rrYaw: 0, _rrPose: 1 } },
            { id: 9, model: 'Crate', x: 14, y: 9 }
        ]);
        const [bike, bobber, crate] = characters, player = w.$gamePlayer, savedSidecar = R._databaseSidecar;
        R._databaseSidecar = { actors: { [w.$gameParty.leader().actorId()]: { name: 'Rider', size: 3 } } };
        // Every animation pass, counted by the model it is for.
        const passes = new Map(), keptPass = R.applyModelAnimation;
        R.applyModelAnimation = function(binding) { passes.set(binding, (passes.get(binding) || 0) + 1); return keptPass.apply(this, arguments); };
        try {
            // A scene that was cleared has seen no vehicle: placing a parked one is what tells it. (This bare scene
            // has none of the map's own lists, so the scene's own clearing stops short; this file's part runs first.)
            try { scene.clear(); } catch (error) { assert.equal(error.name, 'TypeError'); }
            const all = [bike, bobber, crate, player];
            const sync = () => { w.Graphics.frameCount++; scene.syncCharacterModels(all); };
            sync(); await settle();
            for (let i = 0; i < 40; i++) sync();
            const holder = scene._modelInstances.get('e7'), bobHolder = scene._modelInstances.get('e8'), crateHolder = scene._modelInstances.get('e9');
            const count = it => passes.get(it.binding) || 0;
            assert.deepEqual(Array.from(holder.rules, rule => rule.name), ['vehicle-wheel-0', 'vehicle-wheel-1', 'vehicle-control-0']);
            assert.ok(count(holder) <= 1, `a parked vehicle with only its block's rules: ${count(holder)} passes in 40 frames`);
            assert.equal(holder.sampled, false, 'and it is not sampled');
            assert.equal(count(bobHolder), 40, 'a vehicle with a rule of its own plays it every frame');
            assert.equal(count(crateHolder), 40, 'a plain model is the engine\'s, as it was');
            // Ridden: every frame, the bars following the steering.
            const rest = V.pointWorld(holder.object, 'ride.0.handL', vec(0, 0, 0)).clone();
            let was = count(holder);
            Object.assign(bike, { _rrBoarded: true, _rrSteer: 1, _rrSpeed: 0, _rrTravel: 0, _rrPose: 2 });
            Object.assign(player, { _rrRide: { map: w.$gameMap.mapId(), id: 7 }, _rrSeated: true });
            for (let i = 0; i < 10; i++) sync();
            assert.equal(count(holder) - was, 10, 'ridden, it is animated every frame');
            holder.object.updateMatrixWorld(true);
            assert.ok(V.pointWorld(holder.object, 'ride.0.handL', vec(0, 0, 0)).distanceTo(rest) > 0.05, 'the bars are turned');
            // Left with the bars turned: one pass puts them straight, then none.
            was = count(holder);
            delete player._rrRide; delete player._rrSeated; bike._rrBoarded = false; bike._rrSteer = 0; bike._rrPose = 3;
            for (let i = 0; i < 20; i++) sync();
            assert.equal(count(holder) - was, 1, 'one pass after the ride');
            holder.object.updateMatrixWorld(true);
            closeAll(arr(V.pointWorld(holder.object, 'ride.0.handL', vec(0, 0, 0))), arr(rest), 1e-9, 'the bars are straight again');
            // Moved by the game with nobody on it (a route, a push): its wheels roll by the road, so it is animated
            // while it moves.
            was = count(holder);
            for (let i = 0; i < 5; i++) { bike._realX += 0.1; bike._rrPose++; sync(); }
            assert.equal(count(holder) - was, 5, 'while it moves');
            for (let i = 0; i < 10; i++) sync();
            assert.equal(count(holder) - was, 5, 'and not once it stands');
            // A flash asked of it plays out.
            was = count(holder);
            holder.flash = { color: [255, 255, 255, 255], duration: 3, t: 0 };
            for (let i = 0; i < 10; i++) sync();
            assert.ok(count(holder) - was >= 3 && holder.flash === null, 'a flash runs to its end');
            was = count(holder);
            for (let i = 0; i < 10; i++) sync();
            assert.equal(count(holder) - was, 0, 'then nothing again');
            // A motion asked of it keeps it sampled while it plays.
            holder.action = { name: 'open', frame: 0, until: 1e12, repeat: false };
            sync(); sync();
            assert.equal(count(holder) - was, 2, 'while a motion plays');
            holder.action = null;
        } finally {
            R.applyModelAnimation = keptPass;
            R._databaseSidecar = savedSidecar;
        }
    });
});

test('a map with no vehicle: the wrappers ask nothing and look nothing up', async () => {
    reset();
    await withModels({ Crate: { template: toyTemplate, sidecar: { animations: [{ name: 'bob', type: 'bob', trigger: 'always', amount: 0.01 }] } }, Hero: { template: toyTemplate, sidecar: null } }, async () => {
        const { scene, characters } = sceneOf([{ id: 2, model: 'Crate', x: 12, y: 9 }, { id: 3, model: 'Crate', x: 14, y: 9 }]);
        const player = w.$gamePlayer, savedSidecar = R._databaseSidecar;
        R._databaseSidecar = { actors: { [w.$gameParty.leader().actorId()]: { name: 'Hero', size: 3 } } };
        try {
            // A scene that was cleared has seen no vehicle. (This bare scene has none of the map's own lists, so
            // the scene's own clearing stops short; this file's part runs before it.)
            const cleared = Object.assign({}, V.counts);
            try { scene.clear(); } catch (error) { assert.equal(error.name, 'TypeError'); }
            assert.deepEqual(Object.assign({}, V.counts), cleared, 'clearing with no ride on drops nothing');
            const all = characters.concat([player]);
            const sync = () => { w.Graphics.frameCount++; scene.syncCharacterModels(all); };
            sync(); await settle();
            const before = Object.assign({}, V.counts);
            for (let i = 0; i < 50; i++) sync();
            assert.deepEqual(Object.assign({}, V.counts), before, 'fifty frames of models, the player among them: no ride asked for, no ride looked up, nothing posed');
            // A model's holder is not read for a ride, and its character not for a vehicle.
            const holder = scene._modelInstances.get('e2');
            let reads = 0;
            const watched = Object.create(holder, { rrRide: { get() { reads++; return undefined; } } });
            const character = Object.create(characters[0], { _rrVehicle: { get() { reads++; return undefined; } } });
            R.animationDue(watched, character, holder.object, null);
            assert.equal(reads, 0, 'whether a model is sampled is the engine\'s question alone');
            // The stock functions answer as they do without this file.
            assert.equal(scene._modelInstances.get('e2').rrDraw, undefined);
            assert.equal(scene._modelInstances.get('e2').placed.rrPose, undefined);
            assert.equal(player._reactorModelYaw, scene._modelInstances.get('p').smoothYaw);
        } finally { R._databaseSidecar = savedSidecar; }
    });
});

test('where the axles are: the event\'s own model spec decides the size; with none, the type\'s', async () => {
    reset();
    await withModels({ Toy: { template: toyTemplate, sidecar: { vehicle: TOY_BLOCK() } } }, async () => {
        const { scene, characters } = sceneOf([{ id: 7, model: 'Toy', x: 6, y: 9, size: 4, fields: { _rrVehicle: 1, _rrYaw: 0 } }]);
        const keptHolder = R.modelHolderFor, keptSpec = R.characterModelSpec;
        R.modelHolderFor = character => (character && scene._modelInstances && scene._modelInstances.get(R.modelInstanceKey(character))) || null;
        try {
            scene.syncCharacterModels(characters);
            await settle();
            scene.syncCharacterModels(characters);
            // The type says 8 tiles; this event is drawn at 4: its axles are where it is drawn.
            const big = V.typeOf({ kind: 'motorcycle', model: { name: 'Toy', size: 8 } });
            close(V.axles(characters[0], big, { front: 0, rear: 0 }).front, 1.4, 0.005, 'the event\'s own size');
            // A spec's own scale counts.
            R.characterModelSpec = () => ({ name: 'Toy', size: 4, scale: 1.5 });
            close(V.axles(characters[0], big, { front: 0, rear: 0 }).front, 2.1, 0.008, 'size times scale');
            // An event with no spec of its own is drawn at its type's.
            R.characterModelSpec = () => null;
            close(V.axles(characters[0], big, { front: 0, rear: 0 }).front, 2.8, 0.01, 'the type\'s size');
        } finally {
            R.modelHolderFor = keptHolder; R.characterModelSpec = keptSpec;
        }
    });
});
