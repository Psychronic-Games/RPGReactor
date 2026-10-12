'use strict';
// The rider on a vehicle (runtime/reactor_3d_rider.js, Reactor3D.Rider): hips on the seat point, hands on the
// grips, feet on the rests, the arms following the bars. The Demo's real models are built here as the game builds
// them (a test that needs one skips when its file is absent) and the rider is seated with no game running: the
// fields the game writes (`_rrSeated`, `_rrMount`, `_rrSteer`, `_rrDrive.foot`) are set by hand.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
const R = require(path.join(repo, 'runtime', 'reactor_3d.js'));
require(path.join(repo, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
// (The core names the file among its extensions and loads it; a tree without that line still runs this test.)
if (!R.Rider) require(path.join(repo, 'runtime', 'reactor_3d_rider.js'));
const Rider = R.Rider;
R._loadGlbTexture = () => null;

// A model, a holder, a joint and the rider's state each lead to the whole built model (hundreds of thousands of
// vertices). An assertion that fails prints its two values, so none of them is ever handed to one as a value: the
// test compares them itself (`a === b`) and asserts the answer. A failing `assert.equal(state, null)` took
// gigabytes to print.
const DEG = Math.PI / 180;
const demo = path.join(repo, 'template', 'Demo', '3d');
const fixture = path.join(__dirname, 'fixtures', 'vehicles', 'ninja-vehicle.json');
// The Demo motorcycle's block (SPEC-v2 3.3); the fixture file when it is there.
const BLOCK = fs.existsSync(fixture) ? JSON.parse(fs.readFileSync(fixture, 'utf8')) : {
    forward: '-x', stand: { lean: 10, side: 'left' },
    wheels: ['Front wheel', { part: 'Mesh_0010.rip', with: ['Mesh_0007.rip'] }],
    controls: [{ input: 'steer', shape: 'bars', part: 'Steering', at: [-0.644, 0.873, 0], axis: [0.41, 0.91, 0], degrees: 30, degreesAtSpeed: 7 }],
    seats: [{ posture: 'astride', seat: { at: [0.335, 1.019, 0] },
        handL: { at: [-0.465, 1.037, 0.377], part: 'Steering', along: [0.453, -0.324, 0.831] },
        handR: { at: [-0.481, 1.050, -0.348], part: 'Steering', along: [0.441, -0.383, -0.812] },
        footL: { at: [0.320, 0.496, 0.295] }, footR: { at: [0.320, 0.496, -0.295] } }]
};
const HERO = ['Actors/Fleagus', 'Fleagus'], CAROL = ['Actors/Captain_Carol_Everson_Reduced', 'Captain_Carol_Everson_Reduced'], JOLT = ['Actors/Jolt Eagle', 'Jolt Eagle'];
const BIKE = ['Vehicles/kawashaki_ninja_h2', 'kawashaki_ninja_h2'];
const fileOf = ([folder, file]) => path.join(demo, folder, 'source', file + '.glb');
const have = (...models) => models.every(model => fs.existsSync(fileOf(model)));

function glbParts(bytes) {
    const buffer = new Uint8Array(bytes).buffer, view = new DataView(buffer);
    let offset = 12, json = null, bin = null;
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), at = offset + 8;
        if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder('utf-8').decode(new Uint8Array(buffer, at, length)));
        else if (type === 0x004E4942) bin = new Uint8Array(buffer, at, length);
        offset = at + length;
    }
    return { json, bin };
}
const templates = new Map();
/** A model instance as `syncCharacterModels` builds one: cloned, rigged or carved, prepared, at a bound size. */
function build(model, size) {
    const [folder] = model, dir = path.join(demo, folder);
    const sidecar = fs.existsSync(path.join(dir, 'model.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8')) : null;
    let template = templates.get(folder);
    if (!template) {
        const parts = glbParts(fs.readFileSync(fileOf(model)));
        template = R.buildGlbTemplate(parts.json, parts.bin, '', null);
        R.groundAnimatedTemplate(template, sidecar);
        templates.set(folder, template);
    }
    const object = R.cloneModelTemplate(template);
    R.applyModelTransform(object, R.readModelTransform(sidecar, {}));
    object.userData.glbSize = template.userData.glbSize;
    const rig = R.readModelRig(sidecar);
    if (rig) R.applyModelRig(object, rig);
    const binding = R.prepareModelInstance(object, object.__reactorClips);
    const extent = object.userData.glbSize;
    object.scale.setScalar(size / Math.max(extent.x, extent.y, extent.z));
    object.updateMatrixWorld(true);
    return { object, binding, character: null, sidecar };
}

/** The hero seated on the motorcycle at a size: both in one scene, the bike somewhere on a map at an attitude. */
function ride({ size = 3.5, rider = HERO, block = BLOCK, yaw = 0.6, pitch = 0, roll = 0, at = [10.5, 2, 7.5] } = {}) {
    const hero = build(rider, 3), bike = build(BIKE, size), scene = new THREE.Group();
    scene.add(hero.object, bike.object);
    bike.vehicleBlock = block;
    bike.object.position.set(at[0], at[1], at[2]);
    bike.object.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
    bike.character = { _rrSteer: 0, _rrSpeed: 0 };
    hero.character = { _rrSeated: true, _rrMount: null, _rrDrive: { foot: 0 } };
    scene.updateMatrixWorld(true);
    const frame = () => {
        const wrote = Rider.seat(hero, hero.character, hero.object, bike);
        const solved = Rider.update(hero, bike);
        scene.updateMatrixWorld(true);
        return { wrote, solved };
    };
    return { hero, bike, scene, block, frame, get state() { return hero.rider; } };
}

const place = joint => new THREE.Vector3().setFromMatrixPosition(joint.matrixWorld);
/** Two turns that are one turn: their four parts, as unit turns, differ by less than `within` in all. */
const near = (a, b, within = 1e-6) => {
    const la = a.length(), lb = b.length() * (a.dot(b) < 0 ? -1 : 1);
    return Math.abs(a.x / la - b.x / lb) + Math.abs(a.y / la - b.y / lb) + Math.abs(a.z / la - b.z / lb) + Math.abs(a.w / la - b.w / lb) < within;
};
/** The model's own animation pass for a seated rider, as the game's sync runs it before the rider's pass: one call a frame. */
function animator(holder) {
    const rules = R.readModelAnimationRules(holder.sidecar);
    let frame = 7000;
    return () => R.applyModelAnimation(holder.binding, rules, { frame: frame++, moving: false, dashing: false, airborne: false, swimming: false, climbing: false,
        distance: 0, scale: holder.object.scale.x, moveScale: 1, playbackRate: 1, action: null, riding: true });
}
/** Runs with a map loaded whose ground is `heightAt(x, z)`: what the game reads under a foot. `run` is handed a count of the reads. */
function withGround(heightAt, run) {
    const had = Object.prototype.hasOwnProperty.call(global, '$dataMap'), map = global.$dataMap, read = R.groundHeightAt;
    let reads = 0;
    global.$dataMap = { width: 200, height: 200 };
    R.groundHeightAt = (mapData, x, z, close) => { reads++; return heightAt(x, z, close); };
    try { return run(() => reads); } finally {
        R.groundHeightAt = read;
        if (had) global.$dataMap = map; else delete global.$dataMap;
    }
}
/** Runs with the game's clock: `run` is handed a function that moves it on by ticks. */
function withClock(run) {
    const had = Object.prototype.hasOwnProperty.call(global, 'Graphics'), kept = global.Graphics;
    global.Graphics = { frameCount: 1000 };
    try { return run((ticks = 1) => { global.Graphics.frameCount += ticks; }); } finally {
        if (had) global.Graphics = kept; else delete global.Graphics;
    }
}
/**
 * One drawn frame at a stop as the game draws it: the vehicle tips onto the stand side by what the rider last said
 * of its foot (`holder.rider.footDown`, 5 degrees when whole), then the rider is seated and held. `attitude` is the
 * vehicle's turn before the tip.
 */
function stopFrame(r, attitude) {
    const side = r.block.stand && r.block.stand.side === 'right' ? -1 : 1, share = r.state ? r.state.footDown : 0;
    // The Demo motorcycle's front is -x: onto its left is a turn about that line.
    r.bike.object.quaternion.copy(attitude).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1, 0, 0), -side * Rider.FOOT_TIP * DEG * share));
    r.scene.updateMatrixWorld(true);
    return r.frame();
}
/** A rider point of the bike in the world, by the block's own arithmetic. */
const pointOf = (r, name, steer = 0) => Rider.point(r.block, 0, name, steer, new THREE.Vector3()).applyMatrix4(r.bike.object.matrixWorld);
const palmOf = arm => arm.hand.localToWorld(arm.palmLocal.clone());
const soleOf = leg => leg.foot.localToWorld(leg.soleLocal.clone());
/** The bike's own left, up and front in the world. */
function axes(r) {
    const q = r.bike.object.getWorldQuaternion(new THREE.Quaternion());
    return { left: new THREE.Vector3(0, 0, 1).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), front: new THREE.Vector3(-1, 0, 0).applyQuaternion(q) };
}

/** Counts every THREE object made while `run` runs: `new`, and `clone()`. */
function made(run) {
    const names = ['Vector3', 'Quaternion', 'Matrix4', 'Matrix3', 'Euler', 'Object3D', 'Vector2', 'Box3'], kept = {}, clones = [];
    let count = 0;
    for (const name of names) {
        kept[name] = THREE[name];
        THREE[name] = new Proxy(kept[name], { construct(target, args, fresh) { count++; return Reflect.construct(target, args, fresh); } });
        const proto = kept[name].prototype, clone = proto.clone;
        if (clone) { clones.push([proto, clone]); proto.clone = function() { count++; return clone.apply(this, arguments); }; }
    }
    try { run(); } finally {
        for (const name of names) THREE[name] = kept[name];
        for (const [proto, clone] of clones) proto.clone = clone;
    }
    return count;
}

test('the file loads as an extension and names what it provides', () => {
    for (const name of ['board', 'seat', 'update', 'release', 'reachLimb', 'scratch', 'canSit', 'joints', 'fit', 'fitSize', 'point', 'footReaches', 'pass', 'install'])
        assert.equal(typeof Rider[name], 'function', name);
    // Nothing throws on what is not there: each answers null or false.
    assert.ok(Rider.board(null, null, null, null) === null);
    assert.equal(Rider.seat(null, null, null, null), false);
    assert.equal(Rider.update(null, null), false);
    assert.equal(Rider.update({}, null), false);
    assert.doesNotThrow(() => Rider.release(null));
    assert.doesNotThrow(() => Rider.release({}));
    assert.equal(Rider.canSit(null), false);
    assert.ok(Rider.joints(null) === null);
    assert.equal(Rider.footReaches(null), false);
    assert.ok(Rider.point(null, 0, 'seat', 0, new THREE.Vector3()) === null);
});

test('a two-bone reach in closed form: the end joint on the target, the middle joint toward the pole', () => {
    const root = new THREE.Group(), upper = new THREE.Object3D(), lower = new THREE.Object3D(), end = new THREE.Object3D();
    root.position.set(3, 1, -2); root.rotation.set(0.3, 1.1, -0.4); root.scale.setScalar(1.7);
    upper.position.set(0.2, 1, 0); lower.position.set(0, -1, 0); end.position.set(0, -0.8, 0.1);
    root.add(upper); upper.add(lower); lower.add(end);
    root.updateMatrixWorld(true);
    const s = Rider.scratch(), shoulder = place(upper), a = place(upper).distanceTo(place(lower)), b = place(lower).distanceTo(place(end));
    const target = shoulder.clone().add(new THREE.Vector3(0.9, -0.4, 1.2).normalize().multiplyScalar((a + b) * 0.8)), pole = new THREE.Vector3(0, -1, 0);
    assert.equal(Rider.reachLimb(upper, lower, end, target, pole, s), true);
    // What it says of the end's parent is true once the matrices are worked out again.
    const said = s.endParent.clone();
    root.updateMatrixWorld(true);
    assert.ok(place(end).distanceTo(target) < 1e-6, 'the end joint is on the target: ' + place(end).distanceTo(target));
    assert.ok(place(upper).distanceTo(shoulder) < 1e-9, 'the upper joint has not moved');
    assert.ok(Math.abs(place(upper).distanceTo(place(lower)) - a) < 1e-9 && Math.abs(place(lower).distanceTo(place(end)) - b) < 1e-9, 'the bones keep their lengths');
    assert.ok(said.angleTo(lower.getWorldQuaternion(new THREE.Quaternion())) < 1e-6, 'endParent is the lower joint\'s world turn');
    assert.ok(Math.abs(s.share - 0.8) < 1e-6);
    // The middle joint lies off the line on the pole's side.
    const line = target.clone().sub(shoulder).normalize(), off = place(lower).sub(shoulder);
    off.addScaledVector(line, -off.dot(line));
    const side = pole.clone().addScaledVector(line, -pole.dot(line)).normalize();
    assert.ok(off.normalize().dot(side) > 0.999, 'the elbow bends toward the pole');

    // Farther than the limb: reported, not thrown; the limb lies straight along the line to it.
    const far = shoulder.clone().add(new THREE.Vector3(1, 0.2, -0.5).normalize().multiplyScalar((a + b) * 1.6));
    assert.equal(Rider.reachLimb(upper, lower, end, far, pole, s), false);
    root.updateMatrixWorld(true);
    const along = far.clone().sub(shoulder).normalize();
    assert.ok(place(end).sub(shoulder).normalize().dot(along) > 0.99999, 'the limb points at what it cannot reach');
    assert.ok(Math.abs(place(end).distanceTo(shoulder) - (a + b)) < (a + b) * 0.001, 'and is straight');
    assert.ok(s.share > 1.59 && s.share < 1.61);
    // Nearer than it folds: reported too.
    assert.equal(Rider.reachLimb(upper, lower, end, shoulder.clone().add(new THREE.Vector3(0, 0.01, 0)), pole, s), false);
    // Nothing is created by a reach.
    root.updateMatrixWorld(true);
    assert.equal(made(() => { for (let i = 0; i < 20; i++) Rider.reachLimb(upper, lower, end, target, pole, s); }), 0);
    assert.equal(Rider.reachLimb(null, lower, end, target, pole, s), false);
});

test('a rider point moves with the control it follows: steering right swings the left grip ahead', () => {
    const at = (name, steer) => Rider.point(BLOCK, 0, name, steer, new THREE.Vector3());
    const rest = at('handL', 0);
    assert.deepEqual(rest.toArray().map(v => Math.round(v * 1000) / 1000), [-0.465, 1.037, 0.377]);
    // 30 degrees at 0.37 model units from the line: between 0.25 and 0.29 tile at size 3.7.
    const tiles = 3.7 / 2.573;
    for (const steer of [1, -1]) {
        const moved = at('handL', steer).distanceTo(rest) * tiles;
        assert.ok(moved > 0.25 && moved < 0.29, 'the left grip at full lock has moved ' + moved);
    }
    // The front is -x: to the right the left grip goes ahead and the right grip comes back.
    assert.ok(at('handL', 1).x < rest.x - 0.1 && at('handR', 1).x > at('handR', 0).x + 0.1);
    assert.ok(at('handL', -1).x > rest.x + 0.1 && at('handR', -1).x < at('handR', 0).x - 0.1);
    // A point stays as far from the line as it was.
    const control = BLOCK.controls[0], axis = new THREE.Vector3().fromArray(control.axis).normalize(), on = new THREE.Vector3().fromArray(control.at);
    const off = p => { const d = p.clone().sub(on); return d.addScaledVector(axis, -d.dot(axis)).length(); };
    assert.ok(Math.abs(off(at('handL', 1)) - off(rest)) < 1e-9);
    // Feet and the seat follow nothing.
    for (const name of ['seat', 'footL', 'footR']) assert.ok(at(name, 1).distanceTo(at(name, 0)) < 1e-12, name);
    // A hand that says it follows nothing stays; a block with no such point answers null.
    const still = JSON.parse(JSON.stringify(BLOCK));
    still.seats[0].handL.follows = 'none';
    assert.ok(Rider.point(still, 0, 'handL', 1, new THREE.Vector3()).distanceTo(rest) < 1e-12);
    assert.ok(Rider.point({ seats: [{}] }, 0, 'handL', 1, new THREE.Vector3()) === null);
    assert.ok(Rider.point(BLOCK, 1, 'seat', 0, new THREE.Vector3()) === null);
});

test('the joints are found by rig name on each party model; a model with no rig cannot sit', { skip: !have(HERO, CAROL, JOLT, BIKE) }, () => {
    for (const model of [HERO, CAROL, JOLT]) {
        const holder = build(model, 3), joints = Rider.joints(holder);
        assert.equal(Rider.canSit(holder), true, model[1]);
        for (const name of ['Hips', 'Head', 'LeftUpperArm', 'LeftLowerArm', 'LeftHand', 'RightUpperArm', 'RightLowerArm', 'RightHand',
            'LeftUpperLeg', 'LeftLowerLeg', 'LeftFoot', 'RightUpperLeg', 'RightLowerLeg', 'RightFoot']) assert.ok(joints[name] && joints[name].isObject3D, model[1] + ' ' + name);
        // By the name the rig gave it, not by the file's.
        assert.equal(joints.LeftUpperArm.userData.parts[0].name, 'LeftUpperArm');
        assert.equal(joints.Hips.userData.parts[0].name, 'Hips');
        // The same table from the instance alone (the checker hands over a built object).
        const bare = Rider.joints(holder.object);
        assert.ok(bare.LeftFoot === joints.LeftFoot, model[1] + ': the same joint from the bare instance');
    }
    const bike = build(BIKE, 3.5);
    assert.equal(Rider.canSit(bike), false);
    assert.ok(Rider.board(bike, null, bike.object, null) === null);
    assert.ok(bike.riderRefused === bike.object, 'a body that cannot sit is remembered, not tried every frame');
    assert.equal(Rider.seat(bike, null, bike.object, build(BIKE, 3.5)), false);
});

test('seated: the hips are over the seat point and the rider takes the vehicle\'s whole attitude', { skip: !have(HERO, BIKE) }, () => {
    for (const attitude of [{ yaw: 0.6 }, { yaw: -2.2, pitch: 0.25, roll: -0.6 }, { yaw: 3.0, roll: 0.7, at: [140.25, -7.5, 93.5] }]) {
        const r = ride(attitude);
        assert.equal(r.frame().wrote, true);
        const state = r.state, a = axes(r);
        // The Hips joint 6% of the rider's height over the seat point, along the vehicle's own up.
        const want = pointOf(r, 'seat').addScaledVector(a.up, Rider.HIPS_OVER * state.height);
        const off = place(state.joints.Hips).distanceTo(want);
        assert.ok(off < 0.02, 'hips ' + off + ' from their place over the seat');
        assert.ok(Math.abs(state.height - 3) < 0.01);
        // Heading, pitch and lean are the vehicle's: the rider's up is its up, the rider looks along its front.
        const q = r.hero.object.getWorldQuaternion(new THREE.Quaternion());
        assert.ok(new THREE.Vector3(0, 1, 0).applyQuaternion(q).dot(a.up) > 0.99999);
        assert.ok(new THREE.Vector3(0, 0, 1).applyQuaternion(q).dot(a.front) > 0.99999);
        assert.ok(new THREE.Vector3(1, 0, 0).applyQuaternion(q).dot(a.left) > 0.99999);
        // Placed in the world, never under the vehicle: its scale is still its own.
        assert.ok(r.hero.object.parent === r.scene, 'the rider is not a child of the vehicle');
        assert.ok(Math.abs(r.hero.object.scale.x - 3 / r.hero.object.userData.glbSize.y) < 1e-9);
    }
});

test('the hips stay over the seat when the motion moves them', { skip: !have(HERO, BIKE) }, () => {
    const r = ride();
    r.frame();
    const hips = r.state.joints.Hips;
    hips.position.y += 4; hips.position.z -= 3;
    r.frame();
    const want = pointOf(r, 'seat').addScaledVector(axes(r).up, Rider.HIPS_OVER * r.state.height);
    assert.ok(place(hips).distanceTo(want) < 0.02);
});

test('each palm is on its grip and each sole on its rest at steer -1, 0 and 1', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: -1.1, roll: 0.3 });
    for (const steer of [0, 1, -1, 0.4]) {
        r.bike.character._rrSteer = steer;
        assert.equal(r.frame().solved, true, 'a new bar angle is worked out');
        const state = r.state, a = axes(r);
        for (const arm of state.arms) {
            const grip = pointOf(r, arm.name, steer), off = palmOf(arm).distanceTo(grip);
            assert.ok(off < 0.03, arm.name + ' at steer ' + steer + ': the palm is ' + off + ' from its grip');
            assert.equal(arm.reached, true);
            // The knuckles lie along the grip's own line, as far as it has swung with the bars.
            const tube = Rider.point({ seats: [{ handL: { at: r.block.seats[0][arm.name].along, follows: 'steer' } }], controls: [Object.assign({}, r.block.controls[0], { at: [0, 0, 0] })] }, 0, 'handL', steer, new THREE.Vector3())
                .transformDirection(r.bike.object.matrixWorld);
            const knuckles = new THREE.Vector3().fromArray(arm.grip.layout.across).transformDirection(arm.hand.matrixWorld);
            assert.ok(Math.abs(knuckles.dot(tube)) > 0.99, arm.name + ': the knuckle line lies along the grip (' + knuckles.dot(tube) + ')');
            // The palm lies on the grip from above (bars centered; at full lock the bar's end points back at the rider
            // and the palm turns with it), and the elbow hangs below the line from shoulder to wrist.
            const facing = new THREE.Vector3().fromArray(arm.grip.layout.normal).transformDirection(arm.hand.matrixWorld);
            assert.ok(facing.dot(a.up) < (steer === 0 ? -0.6 : -0.25), arm.name + ' at steer ' + steer + ': the palm faces down (' + facing.dot(a.up) + ')');
            // The wrist is not broken: the hand continues the forearm within 35 degrees.
            const fingers = new THREE.Vector3().fromArray(arm.grip.layout.along).transformDirection(arm.hand.matrixWorld);
            const forearm = place(arm.hand).sub(place(arm.lower)).normalize();
            assert.ok(fingers.dot(forearm) > Math.cos(35 * DEG), arm.name + ' at steer ' + steer + ': the wrist bends ' + Math.acos(fingers.dot(forearm)) / DEG);
            const shoulder = place(arm.upper), elbow = place(arm.lower), wrist = place(arm.hand), mid = shoulder.clone().add(wrist).multiplyScalar(0.5);
            assert.ok(elbow.clone().sub(mid).dot(a.up) < -0.02, arm.name + ': the elbow is down');
            assert.ok(elbow.clone().sub(mid).dot(a.left) * arm.sign > 0, arm.name + ': and a little out');
        }
        for (const leg of state.legs) {
            const rest = pointOf(r, leg.name), off = soleOf(leg).distanceTo(rest);
            assert.ok(off < 0.02, leg.name + ' at steer ' + steer + ': the sole is ' + off + ' from its rest');
            // The knee is ahead of the line from hip to ankle, and a little out.
            const hip = place(leg.upper), knee = place(leg.lower), ankle = place(leg.foot), mid = hip.clone().add(ankle).multiplyScalar(0.5);
            assert.ok(knee.clone().sub(mid).dot(a.front) > 0.1, leg.name + ': the knee is ahead');
            assert.ok(knee.clone().sub(mid).dot(a.left) * leg.sign > 0, leg.name + ': and a little out');
        }
    }
});

test('the arms follow the bars: to the right the left arm pushes and the right pulls, and the chest turns with them', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 0 });
    const along = (joint) => place(joint).dot(axes(r).front);
    r.frame();
    const [left, right] = r.state.arms, at0 = { l: along(left.hand), r: along(right.hand), sl: along(left.upper), sr: along(right.upper) };
    r.bike.character._rrSteer = 1;
    r.frame();
    assert.ok(along(left.hand) > at0.l + 0.15, 'the left hand has gone ahead');
    assert.ok(along(right.hand) < at0.r - 0.15, 'the right hand has come back');
    // The chest turns toward the hand that goes forward: the left shoulder ahead, the right back.
    assert.ok(along(left.upper) > at0.sl + 0.02 && along(right.upper) < at0.sr - 0.02, 'the shoulders turn with the bars');
    r.bike.character._rrSteer = -1;
    r.frame();
    assert.ok(along(left.hand) < at0.l - 0.15 && along(right.hand) > at0.r + 0.15);
    assert.ok(along(left.upper) < at0.sl - 0.02 && along(right.upper) > at0.sr + 0.02);
});

test('the torso leans as little as brings the grips within reach, and never past 50 degrees', { skip: !have(HERO, BIKE) }, () => {
    const seat = size => { const r = ride({ size }); r.frame(); return r; };
    const small = seat(2.5), fitted = seat(3.2), big = seat(6);
    assert.ok(small.state.leanNow > 20 && small.state.leanNow < fitted.state.leanNow - 3, 'a nearer grip asks for less lean: ' + small.state.leanNow + ' against ' + fitted.state.leanNow);
    assert.ok(fitted.state.leanNow < 50);
    assert.ok(Math.abs(big.state.leanNow - 50) < 1e-6, 'out of reach it stops at 50 degrees: ' + big.state.leanNow);
    // The lean is drawn: the line from the hips to between the shoulders stands that far off the bike's own up.
    const drawn = r => {
        const a = axes(r), mid = place(r.state.arms[0].upper).add(place(r.state.arms[1].upper)).multiplyScalar(0.5).sub(place(r.state.joints.Hips));
        return Math.atan2(mid.dot(a.front), mid.dot(a.up)) / DEG;
    };
    assert.ok(drawn(big) - drawn(small) > 8, 'the torso is ' + drawn(small) + ' and ' + drawn(big) + ' degrees over');
    // The least lean: within reach, one of the two limits is met and neither is passed. A shoulder is no farther
    // from its grip than 92% of the arm with the bars centered, 97% at full lock (the chest turned with the bars).
    for (const r of [small, fitted]) {
        let nearest = 0;
        for (const arm of r.state.arms) {
            const centered = place(arm.upper).distanceTo(pointOf(r, arm.name)) / arm.length;
            assert.ok(centered <= 0.92 + 0.003, arm.name + ' is at ' + centered + ' of the arm');
            nearest = Math.max(nearest, centered / 0.92);
            for (const steer of [1, -1]) {
                r.bike.character._rrSteer = steer;
                r.frame();
                const locked = place(arm.upper).distanceTo(pointOf(r, arm.name, steer)) / arm.length;
                assert.ok(locked <= 0.97 + 0.003, arm.name + ' at full lock is at ' + locked + ' of the arm');
                nearest = Math.max(nearest, locked / 0.97);
            }
            r.bike.character._rrSteer = 0;
            r.frame();
        }
        assert.ok(nearest > 0.985, 'no more lean than the reach asks: the nearest limit is met to ' + nearest);
    }
    // Full lock is part of the reach: without that limit the same rider leans less.
    const keep = Rider.REACH_LOCK, model = build(HERO, 3), box = { size: [2.573, 1.406, 1.037] }, withLock = Rider.fit(model, box, BLOCK, 2.5).lean;
    Rider.REACH_LOCK = 9;
    const without = Rider.fit(model, box, BLOCK, 2.5).lean;
    Rider.REACH_LOCK = keep;
    assert.ok(withLock > without, 'leaned ' + withLock + ' with the lock counted, ' + without + ' without');
});

test('a motion that leans the body is met: the reach is looked for again, and the whole lean stays', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ size: 3 });
    r.frame();
    const a = axes(r), drawn = () => {
        const mid = place(r.state.arms[0].upper).add(place(r.state.arms[1].upper)).multiplyScalar(0.5).sub(place(r.state.joints.Hips));
        return Math.atan2(mid.dot(a.front), mid.dot(a.up)) / DEG;
    };
    const before = drawn(), more = r.state.more;
    assert.ok(more > 20);
    // The motion now leans the hips 12 degrees forward by itself (a riding stance of the rider's own).
    const hips = r.state.joints.Hips, parent = hips.parent.getWorldQuaternion(new THREE.Quaternion());
    for (const slot of r.state.slots) slot.node.quaternion.copy(slot.base);
    hips.quaternion.premultiply(parent.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(a.left, 12 * DEG)).multiply(parent));
    assert.equal(r.frame().solved, true);
    assert.ok(Math.abs(r.state.more - (more - 12)) < 1.5, 'the pose adds ' + r.state.more + ' where it added ' + more);
    assert.ok(Math.abs(drawn() - before) < 1.5, 'the torso is ' + drawn() + ' over, as before (' + before + ')');
    for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name)) < 0.03);
});

test('a grip out of reach is reported, not thrown: the hand lies on the line toward it', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ size: 6 });
    assert.doesNotThrow(() => r.frame());
    for (const arm of r.state.arms) {
        assert.equal(arm.reached, false, arm.name);
        assert.ok(arm.share > 1);
        const shoulder = place(arm.upper), wrist = place(arm.hand), grip = pointOf(r, arm.name);
        // Straight, and aimed at its grip.
        assert.ok(Math.abs(shoulder.distanceTo(wrist) - (arm.upperLength + arm.foreLength)) < 0.01);
        assert.ok(wrist.clone().sub(shoulder).normalize().dot(grip.clone().sub(shoulder).normalize()) > 0.97);
        assert.ok(palmOf(arm).distanceTo(grip) > 0.2);
    }
    // The checker's arithmetic says the same, with how far short and which way.
    const report = Rider.fit(build(HERO, 3), r.bike.object, BLOCK, 6);
    assert.equal(report.ok, false);
    assert.equal(report.leanLimited, true);
    for (const name of ['handL', 'handR']) {
        assert.ok(report.points[name].short > 0.3, name + ' is short by ' + report.points[name].short);
        assert.equal(report.points[name].ok, false);
        // Toward the seat: back along the model's +x (its front is -x) and up to the shoulder.
        assert.ok(report.points[name].toward[0] > 0.3 && Math.abs(Math.hypot(...report.points[name].toward) - 1) < 0.01);
    }
});

test('the second identical frame is not worked out again, and nothing is created after boarding', { skip: !have(HERO, BIKE) }, () => {
    const r = ride();
    assert.equal(r.frame().solved, true);
    const before = Rider.solves, pose = r.state.slots.map(slot => slot.node.quaternion.clone());
    for (let i = 0; i < 5; i++) assert.equal(r.frame().solved, false, 'the same frame again');
    assert.equal(Rider.solves, before);
    r.state.slots.forEach((slot, i) => assert.ok(slot.node.quaternion.equals(pose[i]), 'the stored turn is written again'));
    // The motion rewriting a joint with what it gave before changes nothing; a new pose under it does.
    for (const slot of r.state.slots) slot.node.quaternion.copy(slot.base);
    assert.equal(r.frame().solved, false);
    r.state.slots.forEach((slot, i) => assert.ok(slot.node.quaternion.equals(pose[i])));
    const arm = r.state.arms[0].slots[0];
    arm.node.quaternion.copy(arm.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3));
    assert.equal(r.frame().solved, true, 'the motion moved under the pose');
    assert.ok(palmOf(r.state.arms[0]).distanceTo(pointOf(r, 'handL')) < 0.03, 'and the palm is still on its grip');
    // The head is set outright: a head the camera's look nods under the pose is not a new frame, and stays where it was set.
    r.frame();
    const headSlot = r.state.slots.find(slot => slot.node === r.state.head), set = r.state.head.quaternion.clone(), neck = r.state.neck.quaternion.clone();
    r.state.head.quaternion.copy(headSlot.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.25));
    assert.equal(r.frame().solved, false, 'the look nodding the head works nothing out');
    assert.ok(r.state.head.quaternion.equals(set) && r.state.neck.quaternion.equals(neck));
    // A bar angle under a quarter of a degree is the same frame; more is not.
    r.frame();
    r.bike.character._rrSteer = 0.002;
    assert.equal(r.frame().solved, false);
    r.bike.character._rrSteer = 0.02;
    assert.equal(r.frame().solved, true);

    // Seats, sweeps of the bars, the foot coming down, a hop: no object is made by any of it.
    const count = made(() => {
        for (let i = 0; i <= 40; i++) {
            r.bike.character._rrSteer = Math.sin(i / 3);
            r.hero.character._rrDrive.foot = i > 20 ? (i - 20) / 20 : 0;
            r.bike.object.quaternion.setFromAxisAngle(r.bike.object.up, i / 20);
            Rider.seat(r.hero, r.hero.character, r.hero.object, r.bike);
            Rider.update(r.hero, r.bike);
            Rider.update(r.hero, r.bike);
        }
        r.hero.character._rrMount = { t: 0, n: 14, on: false, drawn: false, fx: 10, fy: 7, fz: 2, fyaw: 0, tx: 12, ty: 7 };
        for (let t = 0; t <= 14; t++) { r.hero.character._rrMount.t = t; Rider.seat(r.hero, r.hero.character, r.hero.object, r.bike); Rider.update(r.hero, r.bike); }
    });
    assert.equal(count, 0, 'objects created after boarding');
});

test('over a motion that holds still, steering blends five worked-out angles of the bars and works nothing out', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 2.2 });
    r.frame();
    for (let i = 0; i < Rider.STILL; i++) r.frame();
    const before = Rider.solves;
    let worst = { palm: 0, sole: 0, hips: 0 };
    const sweep = () => {
        for (let i = -20; i <= 20; i++) {
            const steer = i / 20;
            r.bike.character._rrSteer = steer;
            r.frame();
            for (const arm of r.state.arms) worst.palm = Math.max(worst.palm, palmOf(arm).distanceTo(pointOf(r, arm.name, steer)));
            for (const leg of r.state.legs) worst.sole = Math.max(worst.sole, soleOf(leg).distanceTo(pointOf(r, leg.name)));
            worst.hips = Math.max(worst.hips, place(r.state.joints.Hips).distanceTo(pointOf(r, 'seat').addScaledVector(axes(r).up, Rider.HIPS_OVER * r.state.height)));
        }
    };
    sweep();
    assert.equal(r.state.sampled, true);
    assert.equal(Rider.solves - before, Rider.SAMPLES.length, 'worked out once at each sample, and never again while steering');
    sweep(); sweep();
    assert.equal(Rider.solves - before, Rider.SAMPLES.length);
    assert.ok(worst.palm < 0.03, 'between samples a palm is at most ' + worst.palm + ' from its grip');
    assert.ok(worst.sole < 0.02 && worst.hips < 0.02, JSON.stringify(worst));
    // At a sample the blend is the worked-out pose itself.
    r.bike.character._rrSteer = 0.5;
    r.frame();
    const blended = r.state.slots.map(slot => slot.node.quaternion.clone());
    const direct = ride({ yaw: 2.2 });
    direct.bike.character._rrSteer = 0.5;
    direct.frame();
    direct.state.slots.forEach((slot, i) => assert.ok(slot.node.quaternion.angleTo(blended[i]) < 0.02, 'slot ' + i + ' is ' + slot.node.quaternion.angleTo(blended[i]) + ' from the worked-out turn'));
    // The head follows the vehicle's lean while blending: leaned 40 degrees to its right it is about half as far off level.
    r.bike.object.quaternion.setFromAxisAngle(new THREE.Vector3(Math.cos(2.2), 0, -Math.sin(2.2)).negate(), 40 * DEG).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.2));
    r.scene.updateMatrixWorld(true);
    r.bike.character._rrSteer = 0.3;
    const leaning = Rider.solves;
    r.frame();
    assert.equal(Rider.solves, leaning, 'a lean works nothing out either');
    const tilt = Math.abs(Math.asin(axes(r).left.y)) / DEG;
    assert.ok(tilt > 39 && tilt < 41, 'the bike is ' + tilt + ' over');
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(r.state.head.getWorldQuaternion(new THREE.Quaternion()).multiply(r.state.headRest.clone().invert()));
    const headTilt = Math.acos(Math.min(1, up.y)) / DEG;
    assert.ok(headTilt > 12 && headTilt < 28, 'the head is ' + headTilt + ' degrees off level');
    for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name, 0.3)) < 0.03);

    // A motion that moves under the pose is worked out every frame (a rider with a riding motion of its own).
    const moving = ride();
    moving.frame();
    const chest = moving.state.joints.Chest || moving.state.joints.Spine, start = Rider.solves;
    for (let i = 1; i <= 12; i++) {
        for (const slot of moving.state.slots) slot.node.quaternion.copy(slot.base);
        chest.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.001 * i));
        moving.bike.character._rrSteer = i / 12;
        moving.frame();
        for (const arm of moving.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(moving, arm.name, i / 12)) < 0.03);
    }
    assert.equal(Rider.solves - start, 12);
    assert.equal(moving.state.sampled, false);
    // The foot coming down is worked out as it comes, and so is a bar angle one frame later: a stop has samples
    // of its own, made once the foot and the vehicle have stayed as they are two frames.
    const stopped = ride();
    stopped.frame(); stopped.frame(); stopped.frame();
    stopped.hero.character._rrDrive.foot = 1;
    const at = Rider.solves;
    stopped.frame();
    stopped.bike.character._rrSteer = 0.7;
    stopped.frame();
    assert.equal(Rider.solves - at, 2);
});

test('the foot comes down at a stop where the sole reaches the ground, and stays on its rest where it does not', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ size: 3.5, yaw: 0.9, roll: 0 });
    r.frame();
    assert.equal(Rider.footReaches(r.hero), true);
    const [left, right] = r.state.legs;
    r.hero.character._rrDrive.foot = 1;
    assert.equal(r.frame().solved, true);
    assert.equal(r.state.footDown, 1);
    // The stand side is the left: the ball of that foot is on the ground 0.55 tile out from the seat.
    const a = axes(r), out = new THREE.Vector3(a.left.x, 0, a.left.z).normalize();
    const ground = pointOf(r, 'seat').addScaledVector(out, 0.55);
    ground.y = r.bike.object.position.y;
    const sole = soleOf(left);
    assert.ok(sole.distanceTo(ground) < 0.03, 'the left sole is ' + sole.distanceTo(ground) + ' from its place on the ground');
    assert.ok(Math.abs(sole.y - r.bike.object.position.y) < 0.02);
    assert.ok(soleOf(right).distanceTo(pointOf(r, 'footR')) < 0.02, 'the other foot keeps its rest');
    // Half way down it is between the two.
    r.hero.character._rrDrive.foot = 0.5;
    r.frame();
    const half = soleOf(left);
    assert.ok(half.distanceTo(ground) > 0.2 && half.distanceTo(pointOf(r, 'footL')) > 0.2);
    r.hero.character._rrDrive.foot = 0;
    r.frame();
    assert.ok(soleOf(left).distanceTo(pointOf(r, 'footL')) < 0.02, 'and back on its rest above 1.5 tiles a second');

    // The other side when the stand is on the right.
    const mirrored = JSON.parse(JSON.stringify(BLOCK));
    mirrored.stand.side = 'right';
    const m = ride({ size: 3.5, block: mirrored });
    m.hero.character._rrDrive.foot = 1;
    m.frame();
    const am = axes(m), groundR = pointOf(m, 'seat').addScaledVector(new THREE.Vector3(am.left.x, 0, am.left.z).normalize(), -0.55);
    groundR.y = m.bike.object.position.y;
    assert.ok(soleOf(m.state.legs[1]).distanceTo(groundR) < 0.03);
    assert.ok(soleOf(m.state.legs[0]).distanceTo(pointOf(m, 'footL')) < 0.02);

    // Too tall a seat: the sole cannot reach, the foot stays on its rest and the vehicle is told so.
    const tall = ride({ size: 5 });
    tall.hero.character._rrDrive.foot = 1;
    tall.frame();
    assert.equal(Rider.footReaches(tall.hero), false);
    assert.equal(tall.state.footDown, 0);
    assert.ok(soleOf(tall.state.legs[0]).distanceTo(pointOf(tall, 'footL')) < 0.02);
});

test('the head stays level against half the lean, looks into the turn and tips back up from the torso\'s lean', { skip: !have(HERO, BIKE) }, () => {
    // How the head stands against its rest: its own front and up in the world.
    const headOf = r => {
        const q = r.state.head.getWorldQuaternion(new THREE.Quaternion()).multiply(r.state.headRest.clone().invert());
        return { front: new THREE.Vector3(0, 0, 1).applyQuaternion(q), up: new THREE.Vector3(0, 1, 0).applyQuaternion(q) };
    };
    const upright = ride({ yaw: 0 });
    upright.frame();
    const level = headOf(upright), a0 = axes(upright);
    // Leaned 50 degrees forward, the head dips a fifth of it.
    const dip = Math.asin(-level.front.y) / DEG;
    assert.ok(Math.abs(dip - upright.state.leanNow * (1 - Rider.HEAD_BACK)) < 2, 'the head dips ' + dip + ' under a torso leaned ' + upright.state.leanNow);
    assert.ok(level.front.dot(a0.front) > 0.97 && Math.abs(level.up.dot(a0.left)) < 0.02);

    // The bike 40 degrees over to its right (its front is -x: a turn about -x by 40 degrees).
    const leaned = ride({ yaw: 0 });
    leaned.bike.object.quaternion.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), 40 * DEG);
    leaned.scene.updateMatrixWorld(true);
    leaned.frame();
    const a = axes(leaned), head = headOf(leaned);
    assert.ok(a.left.y > 0.6, 'the bike leans to its right');
    // Half the lean is left in the head: its up is about 20 degrees off the world's, not 40.
    const tilt = Math.acos(Math.min(1, head.up.y)) / DEG;
    assert.ok(tilt > 12 && tilt < 28, 'the head is ' + tilt + ' degrees off level under a 40 degree lean');
    // And it looks into the turn: to the right of the bike's front.
    const flat = new THREE.Vector3(head.front.x, 0, head.front.z).normalize(), right = new THREE.Vector3(-a.left.x, 0, -a.left.z).normalize();
    const look = Math.asin(flat.dot(right)) / DEG;
    assert.ok(look > 12 && look <= Rider.HEAD_LOOK + 6, 'the head looks ' + look + ' degrees into the turn');
});

test('getting on and off: the arc between the on-foot place and the seat, and the hold closing from tick 8', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 0.6 });
    r.frame();
    const seatPos = r.hero.object.position.clone(), seatQuat = r.hero.object.quaternion.clone();
    const hero = r.hero.character;
    r.hero.smoothYaw = -0.4;
    hero._rrMount = { t: 0, n: 14, on: true, drawn: false, fx: 12, fy: 9, fz: 2, fyaw: 0, tx: 10, ty: 7 };
    const at = t => { hero._rrMount.t = t; r.frame(); return r.hero.object.position.clone(); };
    // Tick 0: where he stood, upright at the yaw the placement eases.
    const start = at(0);
    assert.ok(start.distanceTo(new THREE.Vector3(12.5, 2, 9.5)) < 1e-9);
    assert.ok(r.hero.object.quaternion.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.4)) < 1e-6);
    for (const arm of r.state.arms) assert.ok(arm.hand.quaternion.equals(arm.slots[2].base), 'the hands are the motion\'s at tick 0');
    // Half way: half the way along, half a tile over the straight line.
    const mid = at(7), straight = start.clone().lerp(seatPos, 0.5);
    assert.ok(Math.abs(mid.y - straight.y - 0.5) < 1e-6, 'the arc is ' + (mid.y - straight.y) + ' high');
    assert.ok(Math.hypot(mid.x - straight.x, mid.z - straight.z) < 1e-6);
    // Tick 8: hands and feet have not begun to close; tick 11: part way; tick 14: seated, palms on the grips.
    at(8);
    for (const arm of r.state.arms) assert.ok(near(arm.hand.quaternion, arm.slots[2].base), 'the hold starts at tick 8');
    at(11);
    for (const arm of r.state.arms) assert.ok(!arm.hand.quaternion.equals(arm.slots[2].base));
    const end = at(14);
    assert.ok(end.distanceTo(seatPos) < 1e-6 && r.hero.object.quaternion.angleTo(seatQuat) < 1e-6);
    for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name)) < 0.03);
    for (const leg of r.state.legs) assert.ok(soleOf(leg).distanceTo(pointOf(r, leg.name)) < 0.02);
    // The hands close into a loose fist once the hold is whole, and open when it ends.
    assert.equal(r.state.closed, true);
    for (const arm of r.state.arms) assert.equal(arm.grip.pinned, true);

    // Getting off: from the seat to the middle of the tile, on the vehicle's ground, the limbs leaving first.
    hero._rrMount = { t: 0, n: 14, on: false, drawn: false, fx: 10, fy: 7, fz: 2, fyaw: 0, tx: 12, ty: 8 };
    assert.ok(at(0).distanceTo(seatPos) < 1e-6);
    at(6);
    for (const arm of r.state.arms) assert.ok(arm.hand.quaternion.equals(arm.slots[2].base), 'the hands have let go by tick 6');
    assert.equal(r.state.closed, false);
    for (const arm of r.state.arms) assert.equal(arm.grip.pinned, false);
    const landed = at(14);
    assert.ok(landed.distanceTo(new THREE.Vector3(12.5, r.bike.object.position.y, 8.5)) < 1e-6, 'he lands on the tile\'s middle');
    for (const slot of r.state.slots) assert.ok(slot.node.quaternion.equals(slot.base), 'every joint is the motion\'s again');

    // Only the picture still plays (a battle began aboard): no vehicle is named, the arc starts from the seat it left.
    hero._rrSeated = false;
    hero._rrMount = { t: 0, n: 14, on: false, drawn: true, fx: 10, fy: 7, fz: 2, fyaw: 0, tx: 9, ty: 6 };
    hero._rrMount.t = 0;
    assert.equal(Rider.seat(r.hero, hero, r.hero.object, null), true);
    assert.ok(r.hero.object.position.distanceTo(seatPos) < 1e-6);
    hero._rrMount.t = 14;
    Rider.seat(r.hero, hero, r.hero.object, null);
    assert.ok(r.hero.object.position.distanceTo(new THREE.Vector3(9.5, r.bike.object.position.y, 6.5)) < 1e-6);
    assert.equal(Rider.update(r.hero, null), false);
    // A hop that names the height it ends at lands there.
    hero._rrMount.tz = 5.25;
    Rider.seat(r.hero, hero, r.hero.object, null);
    assert.ok(r.hero.object.position.distanceTo(new THREE.Vector3(9.5, 5.25, 6.5)) < 1e-6);
});

test('leaving gives every joint back to the motion and forgets the boarding', { skip: !have(HERO, BIKE) }, () => {
    const r = ride();
    const before = Object.values(Rider.joints(r.hero)).map(joint => [joint, joint.quaternion.clone()]);
    r.frame();
    assert.ok(before.some(([joint, q]) => !joint.quaternion.equals(q)));
    Rider.release(r.hero);
    assert.ok(r.hero.rider === null, 'the boarding is forgotten');
    for (const [joint, q] of before) assert.ok(joint.quaternion.equals(q), 'a joint keeps a turn of the ride');
    // A joint the motion has rewritten since is the motion's, not put back.
    r.frame();
    const hand = r.state.arms[0].hand, own = new THREE.Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
    hand.quaternion.copy(own);
    Rider.release(r.hero);
    assert.ok(hand.quaternion.equals(own));
});

test('boarded again by itself when the rider, the vehicle or its size changes', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ size: 3.5 });
    r.frame();
    const first = r.state;
    r.frame();
    assert.ok(r.state === first, 'the same boarding while nothing changed');
    // Another size: the same state is tied again and the reach worked out for it.
    r.bike.object.scale.setScalar(3 / 2.573);
    r.scene.updateMatrixWorld(true);
    r.frame();
    assert.ok(r.state === first, 'tied again, not boarded again');
    assert.ok(Math.abs(r.state.vScale - 3 / 2.573) < 1e-9);
    assert.ok(palmOf(r.state.arms[0]).distanceTo(pointOf(r, 'handL')) < 0.03);
    // Another rider object under the same holder: a new boarding.
    const other = build(HERO, 3);
    r.scene.add(other.object);
    r.hero.object = other.object; r.hero.binding = other.binding;
    Rider.seat(r.hero, r.hero.character, other.object, r.bike);
    assert.ok(r.state !== first, 'a new boarding for another rider object');
    assert.ok(r.state.object === other.object);
});

test('the fit: reach as a share of the limb, at full lock, the surface, how far short, the lean, the foot', { skip: !have(HERO, BIKE) }, () => {
    const hero = build(HERO, 3), bike = build(BIKE, 3.5);
    const report = Rider.fit(hero, bike.object, BLOCK, 3.5);
    assert.equal(report.seated, true);
    assert.equal(report.size, 3.5);
    assert.ok(report.lean >= 30 && report.lean <= 50);
    assert.ok(Math.abs(report.hips.over - 0.18) < 0.001, 'the hips sit 6% of 3 tiles over the seat');
    for (const name of ['handL', 'handR']) {
        const p = report.points[name];
        assert.equal(p.part, 'Steering');
        assert.ok(p.reach > 0.7 && p.reach <= 0.92 + 1e-9, name + ' reaches at ' + p.reach);
        assert.ok(p.reachAtLock >= p.reach && p.reachAtLock <= 0.97 + 1e-9, name + ' at full lock ' + p.reachAtLock);
        assert.equal(p.short, 0);
        assert.equal(p.ok, true);
        // The Demo bike's grips are on its bars: a few hundredths of a tile from the surface.
        assert.ok(p.surface !== null && p.surface < 0.06, name + ' is ' + p.surface + ' from the surface');
    }
    for (const name of ['footL', 'footR']) {
        const p = report.points[name];
        assert.ok(p.knee > 30 && p.knee < 110, name + ': knee ' + p.knee);
        assert.equal(p.ok, true);
        assert.ok(p.surface !== null && p.surface < 0.06);
    }
    assert.ok(report.points.seat.surface < 0.03);
    assert.deepEqual(report.foot, { side: 'left', reachesGround: true, short: 0 });
    assert.equal(report.ok, true);
    // The same numbers from a holder and from the bare instance; a box in place of the vehicle reads no surface.
    const boxed = Rider.fit(hero.object, { size: [2.573, 1.406, 1.037] }, BLOCK, 3.5);
    assert.equal(boxed.points.handL.reach, report.points.handL.reach);
    assert.equal(boxed.points.handL.surface, null);
    // The game seats him with the same arithmetic: the lean it reports is the lean he is drawn at.
    const r = ride({ size: 3.5 });
    r.frame();
    assert.ok(Math.abs(r.state.leanNow - report.lean) <= 1, 'drawn at ' + r.state.leanNow + ', reported ' + report.lean);
    // A point off the model reads far from the surface (what the checker calls "holds nothing").
    const off = JSON.parse(JSON.stringify(BLOCK));
    off.seats[0].handL.at = [-0.465, 2.2, 0.377];
    assert.ok(Rider.fit(hero, bike.object, off, 3.5).points.handL.surface > 0.5);
    // Too big: the foot is short of the ground and the report says by how much.
    const big = Rider.fit(hero, bike.object, BLOCK, 5);
    assert.equal(big.foot.reachesGround, false);
    assert.ok(big.foot.short > 0.2);
    // A body with no skeleton is not seated at all.
    assert.equal(Rider.fit(bike, bike.object, BLOCK, 3.5).seated, false);
    assert.equal(Rider.fit(null, bike.object, BLOCK, 3.5).seated, false);
});

test('the fitted size: the largest, to a tenth, at which every rider reaches both grips and the foot reaches the ground', { skip: !have(HERO, CAROL, JOLT, BIKE) }, () => {
    const riders = [HERO, CAROL, JOLT].map(model => build(model, 3)), bike = build(BIKE, 3.5);
    const fitted = Rider.fitSize(riders, bike.object, BLOCK, 'motorcycle');
    // The Demo's party on the Demo's motorcycle: a little under three tiles (Carol Everson's reach sets it).
    assert.ok(fitted.size >= 2.7 && fitted.size <= 3.1, 'fitted at ' + fitted.size);
    assert.ok(Math.abs(fitted.size * 10 - Math.round(fitted.size * 10)) < 1e-9, 'to a tenth of a tile');
    assert.ok(fitted.limitedBy >= 0 && fitted.limitedBy < 3);
    assert.ok(fitted.reason === 'reach' || fitted.reason === 'foot');
    // At that size everyone reaches with the torso leaned no more than 45 degrees and a foot on the ground.
    assert.equal(fitted.reports.length, 3);
    for (const report of fitted.reports) {
        assert.ok(report.ok && report.lean <= 45 && report.foot.reachesGround, JSON.stringify([report.lean, report.ok, report.foot]));
        for (const name of ['handL', 'handR']) assert.ok(report.points[name].reach <= 0.92 + 1e-9 && report.points[name].reachAtLock <= 0.97 + 1e-9);
    }
    // A tenth larger and the one who set the limit no longer does.
    const over = Rider.fit(riders[fitted.limitedBy], bike.object, BLOCK, Math.round(fitted.size * 10 + 1) / 10);
    assert.ok(over.lean > 45 || !over.ok || !over.foot.reachesGround, 'a tenth more still fits: ' + JSON.stringify([over.lean, over.ok, over.foot]));
    // The hero alone is fitted no smaller than the whole party.
    const alone = Rider.fitSize([riders[0]], bike.object, BLOCK, 'motorcycle');
    assert.ok(alone.size >= fitted.size && alone.size <= 3.3, 'the hero alone is fitted at ' + alone.size);
    assert.equal(alone.limitedBy, 0);
    // A kind that does not lean asks for no foot on the ground: a block with its seat too high for any foot.
    const high = JSON.parse(JSON.stringify(BLOCK));
    for (const name of ['seat', 'handL', 'handR', 'footL', 'footR']) high.seats[0][name].at[1] += 0.6;
    const leaning = Rider.fitSize([riders[0]], bike.object, high, 'motorcycle'), level = Rider.fitSize([riders[0]], bike.object, high, { leans: false });
    assert.equal(leaning.reason, 'foot');
    assert.ok(level.size > leaning.size + 0.3, level.size + ' against ' + leaning.size);
    // Nobody to fit, or nothing to fit them on: size 0 and no limit named.
    assert.deepEqual([Rider.fitSize([], bike.object, BLOCK, 'motorcycle').size, Rider.fitSize(riders, null, BLOCK, 'motorcycle').size], [0, 0]);
});

test('in the game: one flag test on a map with no ride; the player seated and held; released on foot', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 1.2 });
    const instances = new Map([['p', r.hero], ['e7', r.bike]]);
    let asked = 0;
    const scene = { get _modelInstances() { asked++; return instances; } };
    const player = r.hero.character;
    player._rrSeated = false;
    const previous = global.$gamePlayer;
    try {
        global.$gamePlayer = player;
        assert.equal(Rider.pass(scene), false);
        assert.equal(asked, 0, 'on foot the scene is not looked at');
        assert.ok(r.hero.rider === undefined, 'nothing boards on foot');
        // Aboard event 7.
        player._rrSeated = true;
        player._rrRide = { map: 5, id: 7 };
        assert.equal(Rider.pass(scene), true);
        r.scene.updateMatrixWorld(true);
        assert.ok(r.hero.rider, 'boarded by the pass');
        assert.ok(place(r.state.joints.Hips).distanceTo(pointOf(r, 'seat').addScaledVector(axes(r).up, 0.18)) < 0.02);
        for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name)) < 0.03);
        // The vehicle's model is not built yet: nothing is written and nothing throws.
        player._rrRide = { map: 5, id: 8 };
        assert.doesNotThrow(() => Rider.pass(scene));
        player._rrRide = { map: 5, id: 7 };
        Rider.pass(scene);
        // On foot again: every joint is the motion's and the boarding is forgotten.
        const slots = r.state.slots;
        player._rrSeated = false; player._rrRide = null;
        assert.equal(Rider.pass(scene), false);
        assert.ok(r.hero.rider === null, 'released on foot');
        for (const slot of slots) assert.ok(slot.node.quaternion.equals(slot.base));

        // A body that cannot sit (no humanoid rig) stands in the seat, shown.
        const box = build(BIKE, 2);
        box.character = player;
        box.object.visible = true;
        instances.set('p', box);
        player._rrSeated = true; player._rrRide = { map: 5, id: 7 };
        assert.equal(Rider.pass(scene), false);
        assert.equal(box.object.visible, true);
        player._rrSeated = false;
        Rider.pass(scene);
    } finally {
        global.$gamePlayer = previous;
    }
});

test('the pass runs after the sync, as the outer wrapper', () => {
    assert.equal(R.MapScene.prototype.syncCharacterModels.__reactorRider, true, 'installed on the map scene at load');
    assert.equal(Rider.install(), false, 'and only once');
    // On a stand-in scene class: the base first, then the pass, the base's answer handed back.
    const kept = R.MapScene, keptPass = Rider.pass, order = [];
    try {
        R.MapScene = function() {};
        R.MapScene.prototype.syncCharacterModels = function(characters) { order.push('sync:' + characters.length); return 'answer'; };
        Rider.pass = scene => { order.push('pass:' + (scene instanceof R.MapScene)); return true; };
        assert.equal(Rider.install(), true);
        assert.equal(new R.MapScene().syncCharacterModels([1, 2]), 'answer');
        assert.deepEqual(order, ['sync:2', 'pass:true']);
    } finally {
        R.MapScene = kept; Rider.pass = keptPass;
    }
});

test('where the vehicle\'s own file answers a point, the hand goes there', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 0.3 });
    const kept = R.Vehicles, asked = [];
    let drawnSteer = 0.5;
    try {
        // The grips 0.1 tile higher than the block says, as a part that carries them might have moved them.
        R.Vehicles = Object.assign({}, kept || {}, {
            pointWorld(object, name, out) {
                asked.push(name);
                const short = name.split('.')[2], at = Rider.point(r.block, 0, short, 0, out);
                if (!at) return null;
                out.applyMatrix4(object.matrixWorld);
                if (short === 'handL' || short === 'handR') out.y += 0.1;
                return out;
            },
            inputs: () => ({ steer: drawnSteer }),
            blockOf: () => null
        });
        r.frame();
        assert.ok(asked.includes('ride.0.seat') && asked.includes('ride.0.handL') && asked.includes('ride.0.footR'));
        for (const arm of r.state.arms) {
            const want = pointOf(r, arm.name, 0);
            want.y += 0.1;
            assert.ok(palmOf(arm).distanceTo(want) < 0.03, arm.name + ' is on the point the vehicle answered');
        }
        // The drawn share of lock is the vehicle's too: a raw steer of 1 is not what the key follows.
        r.bike.character._rrSteer = 1;
        assert.equal(r.frame().solved, false, 'the drawn steer did not change');
        // The vehicle draws these grips elsewhere than the block's arithmetic puts them: steering is worked out
        // against what is drawn, never blended from samples made by arithmetic.
        for (let i = 0; i < Rider.STILL + 1; i++) r.frame();
        drawnSteer = 0.2;
        assert.equal(r.frame().solved, true);
        assert.equal(r.state.sampled, false);
        assert.equal(r.state.sampling, false);
        for (const arm of r.state.arms) {
            const want = pointOf(r, arm.name, 0);
            want.y += 0.1;
            assert.ok(palmOf(arm).distanceTo(want) < 0.03, arm.name + ' stays on the point the vehicle answered');
        }
    } finally {
        R.Vehicles = kept;
    }
});

//-----------------------------------------------------------------------------
// The motion under the pose, as the game hands it over.

test('with the model\'s own animation pass run before every frame, a rider at rest is not worked out again and steering blends the five samples', { skip: !have(HERO, BIKE) }, () => {
    const r = ride(), animate = animator(r.hero);
    assert.ok(R.readModelAnimationRules(r.hero.sidecar).length > 0, 'the hero has motions of his own');
    // The Ride stance comes in and settles.
    for (let i = 0; i < 60; i++) { animate(); r.frame(); }
    let before = Rider.solves;
    for (let i = 0; i < 300; i++) { animate(); assert.equal(r.frame().solved, false, 'frame ' + i + ' at rest'); }
    assert.equal(Rider.solves - before, 0, 'the stance holds still: nothing is worked out');
    for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name)) < 0.03);
    // Bars swept lock to lock five times over: worked out at the five samples and never again.
    before = Rider.solves;
    let worst = 0, blended = 0;
    for (let i = 1; i <= 300; i++) {
        const steer = Math.sin(i / 9);
        r.bike.character._rrSteer = steer;
        animate(); r.frame();
        if (r.state.sampled) blended++;
        for (const arm of r.state.arms) worst = Math.max(worst, palmOf(arm).distanceTo(pointOf(r, arm.name, steer)));
        for (const leg of r.state.legs) worst = Math.max(worst, soleOf(leg).distanceTo(pointOf(r, leg.name)) * 1.5);
    }
    assert.equal(Rider.solves - before, Rider.SAMPLES.length);
    assert.equal(blended, 300, 'every frame of the sweep is a blend');
    assert.ok(worst < 0.03, 'a palm is at most ' + worst + ' from its grip');
});

test('a joint the motion hands back within a millionth of what it gave is the same pose; further off it is a new one', { skip: !have(HERO, BIKE) }, () => {
    const r = ride();
    r.frame(); r.frame();
    const slots = r.state.slots, gave = slots.map(slot => slot.base.clone()), wrote = slots.map(slot => slot.node.quaternion.clone());
    assert.equal(Rider.SAME, 1e-6);
    // What the game's animation pass does to a pose that holds still: every joint again, its last digits different
    // each frame (5e-8 at most, measured in the running game).
    const before = Rider.solves;
    for (let i = 0; i < 40; i++) {
        slots.forEach((slot, k) => {
            if (slot.node === r.state.head) return;
            const off = 5e-8 * Math.sin(i * 1.7 + k);
            slot.node.quaternion.set(gave[k].x + off, gave[k].y - off, gave[k].z + off, gave[k].w - off);
        });
        assert.equal(r.frame().solved, false, 'frame ' + i);
    }
    assert.equal(Rider.solves, before);
    slots.forEach((slot, k) => {
        assert.ok(slot.base.equals(gave[k]), 'the base is left alone inside the tolerance');
        assert.ok(slot.node.quaternion.equals(wrote[k]), 'and the stored turn is written again');
    });
    assert.equal(r.state.still > 30, true, 'the motion counts as holding still');
    // A drift that never stops is followed once it has gone a millionth: it cannot build up unseen.
    const arm = r.state.arms[0].slots[0], k = slots.indexOf(arm);
    let solved = 0;
    for (let i = 1; i <= 30; i++) {
        arm.node.quaternion.set(gave[k].x + i * 1e-7, gave[k].y, gave[k].z, gave[k].w);
        if (r.frame().solved) solved++;
    }
    assert.ok(solved >= 2 && solved <= 4, 'worked out ' + solved + ' times over a drift of three millionths');
    assert.ok(Math.abs(arm.base.x - arm.node.quaternion.x) < 2 && Math.abs(arm.base.x - (gave[k].x + 30e-7)) <= 1.01e-6, 'the base follows the drift to within the tolerance');
    // A limb with no point of its own keeps its motion, and holding still there is holding still too: a block
    // with no foot rests is not worked out every frame.
    const bare = JSON.parse(JSON.stringify(BLOCK));
    delete bare.seats[0].footL; delete bare.seats[0].footR;
    const b = ride({ block: bare });
    b.frame();
    const at = Rider.solves;
    for (let i = 0; i < 10; i++) assert.equal(b.frame().solved, false);
    assert.equal(Rider.solves, at);
    for (const leg of b.state.legs) for (const slot of leg.slots) assert.ok(slot.node.quaternion.equals(slot.base), 'a leg with no rest is the motion\'s');
});

//-----------------------------------------------------------------------------
// The ends of the two hops.

test('getting on, the pose he stood in eases into the stance and the hold: no joint jumps when the stance comes in', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 0.6 });
    const hero = r.hero.character, joints = Rider.joints(r.hero);
    // He stands beside the bike in a pose of his own, arms at his sides.
    const sides = { LeftUpperArm: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.9), RightUpperArm: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.9) };
    for (const name of Object.keys(sides)) joints[name].quaternion.multiply(sides[name]);
    const stood = new Map(Object.values(joints).map(joint => [joint, joint.quaternion.clone()]));
    r.hero.smoothYaw = 0;
    hero._rrMount = { t: 0, n: 14, on: true, drawn: false, fx: 12, fy: 9, fz: 2, fyaw: 0, tx: 10, ty: 7 };
    // The riding stance replaces his motion at once, from the first frame of the hop: arms out ahead, thighs up.
    const stance = new Map(Object.values(joints).map(joint => [joint, stood.get(joint).clone()]));
    for (const name of ['LeftUpperArm', 'RightUpperArm', 'LeftUpperLeg', 'RightUpperLeg', 'LeftLowerLeg', 'RightLowerLeg'])
        stance.get(joints[name]).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), name.includes('Lower') ? 1.4 : -1.2));
    const at = t => {
        if (hero._rrMount) hero._rrMount.t = t;
        // The placement (which boards him the first time) comes before the model's own animation, the rider's pass after it.
        Rider.seat(r.hero, hero, r.hero.object, r.bike);
        for (const slot of r.state.slots) if (slot.node !== r.state.head) slot.node.quaternion.copy(stance.get(slot.node));
        Rider.update(r.hero, r.bike);
        r.scene.updateMatrixWorld(true);
    };
    const off = (joint, from) => joint.quaternion.angleTo(from.get(joint)) / DEG;
    at(0);
    for (const slot of r.state.slots) assert.ok(near(slot.node.quaternion, stood.get(slot.node)), 'at tick 0 every joint is as he stood');
    at(1);
    for (const name of ['LeftUpperArm', 'RightUpperArm', 'LeftUpperLeg', 'LeftLowerLeg']) {
        assert.ok(off(joints[name], stood) < 3, name + ' at tick 1 is ' + off(joints[name], stood) + ' degrees from where he stood');
        assert.ok(off(joints[name], stance) > 60, name + ' has not jumped to the stance');
    }
    // Half way through the hop the stance is half in; the hold has not begun.
    at(7);
    for (const name of ['LeftUpperArm', 'LeftUpperLeg']) {
        const a = off(joints[name], stood), b = off(joints[name], stance);
        assert.ok(a > 25 && b > 25 && Math.abs(a - b) < 6, name + ' at tick 7: ' + a + ' from standing, ' + b + ' from the stance');
    }
    at(8);
    for (const name of ['LeftUpperArm', 'LeftUpperLeg']) assert.ok(off(joints[name], stance) < off(joints[name], stood));
    // Seated: the stance and the hold are whole, and what he stood in is gone.
    at(14);
    for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name)) < 0.03);
    for (const leg of r.state.legs) assert.ok(soleOf(leg).distanceTo(pointOf(r, leg.name)) < 0.02);
    hero._rrMount = null;
    at(0);
    for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name)) < 0.03);
    // Getting off is from the motion's pose, not from the one he stood in before the ride.
    hero._rrMount = { t: 14, n: 14, on: false, drawn: false, tx: 12, ty: 8 };
    at(14);
    for (const slot of r.state.slots) if (slot.node !== r.state.head) assert.ok(slot.node.quaternion.equals(stance.get(slot.node)), 'the motion\'s own turn at the end of the hop off');
});

test('a hop off that is only drawn (a battle began aboard) eases out of the pose he sat in, with nothing worked out', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 0.6 });
    const hero = r.hero.character;
    r.frame(); r.frame();
    const slots = r.state.slots, sat = slots.map(slot => slot.node.quaternion.clone()), seatPos = r.hero.object.position.clone();
    // On foot now, by the game's fields: no vehicle is named, the idle motion writes every joint.
    const idle = slots.map(slot => slot.base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.05)));
    hero._rrSeated = false; hero._rrRide = null;
    hero._rrMount = { t: 0, n: 14, on: false, drawn: true, fx: 10, fy: 7, fz: 2, tx: 9, ty: 6, tz: 2 };
    const before = Rider.solves;
    const at = t => {
        hero._rrMount.t = t;
        assert.equal(Rider.seat(r.hero, hero, r.hero.object, null), true);
        slots.forEach((slot, i) => slot.node.quaternion.copy(idle[i]));
        assert.equal(Rider.update(r.hero, null), false);
    };
    const off = (i, from) => slots[i].node.quaternion.angleTo(from[i]) / DEG;
    const legs = slots.map((slot, i) => i).filter(i => slots[i].limb), body = slots.map((slot, i) => i).filter(i => !slots[i].limb && slots[i].node !== r.state.head);
    const turned = legs.filter(i => sat[i].angleTo(idle[i]) > 20 * DEG);
    assert.ok(turned.length >= 6, 'the seated limbs are far from the idle pose');
    // Tick 0 and 1: still the pose he sat in (he does not stand bolt upright on the saddle).
    at(0);
    assert.ok(r.hero.object.position.distanceTo(seatPos) < 1e-6);
    slots.forEach((slot, i) => assert.ok(near(slot.node.quaternion, sat[i]), 'slot ' + i + ' at tick 0 is as he sat'));
    assert.equal(r.state.fading, true);
    at(1);
    for (const i of turned) assert.ok(off(i, sat) < off(i, idle), 'limb slot ' + i + ' at tick 1 is nearer the seat\'s pose than the idle');
    // The limbs have let go by tick 6, as in the ordinary hop off; the body follows to tick 14.
    at(3);
    for (const i of turned) assert.ok(off(i, sat) > 5 && off(i, idle) > 5, 'limb slot ' + i + ' is on its way at tick 3');
    at(6);
    for (const i of legs) assert.ok(slots[i].node.quaternion.equals(idle[i]), 'a limb is the motion\'s at tick 6');
    const leaning = body.filter(i => sat[i].angleTo(idle[i]) > 10 * DEG);
    assert.ok(leaning.length >= 1);
    for (const i of leaning) assert.ok(off(i, idle) > 2, 'the torso is still coming up at tick 6');
    at(14);
    slots.forEach((slot, i) => assert.ok(slot.node.quaternion.equals(idle[i]), 'every joint is the motion\'s at tick 14'));
    assert.ok(r.hero.object.position.distanceTo(new THREE.Vector3(9.5, 2, 6.5)) < 1e-6);
    assert.equal(Rider.solves, before, 'nothing was worked out');
    assert.equal(r.state.closed, false, 'the hands are open');
    // Seated again on the vehicle, the pose is worked out anew.
    hero._rrSeated = true; hero._rrMount = null;
    assert.equal(r.frame().solved, true);
    assert.equal(r.state.fading, false);
    for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name)) < 0.03);
    // A rider that was never posed on a vehicle has nothing to ease out of.
    const fresh = ride();
    fresh.hero.character._rrSeated = false;
    fresh.hero.character._rrMount = { t: 2, n: 14, on: false, drawn: true, tx: 9, ty: 6, tz: 2 };
    Rider.board(fresh.hero, fresh.hero.character, fresh.hero.object, null);
    assert.equal(Rider.update(fresh.hero, null), false);
    for (const slot of fresh.state.slots) assert.equal(slot.set, false);
});

//-----------------------------------------------------------------------------
// The foot at a stop, on the ground the map has.

/**
 * The hero stopped on ground that is `heightOver(out, ahead)` over the vehicle's own: `out` tiles to the vehicle's
 * left of its middle line, `ahead` tiles ahead of its middle. The game asks the foot down; frames are drawn until it
 * has settled. `turn` is the vehicle's own turn about its left (nose down positive, radians).
 */
function stopOn(heightOver, { size = 3.5, yaw = 0.9, nose = 0, block = BLOCK, frames = 6, then = null } = {}) {
    const r = ride({ size, yaw, block });
    // (The Demo motorcycle's front is -x and its left +z: nose down is a turn about +z.)
    const attitude = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), nose));
    const origin = r.bike.object.position.clone(), a = axes(r);
    const left = new THREE.Vector3(a.left.x, 0, a.left.z).normalize(), front = new THREE.Vector3(a.front.x, 0, a.front.z).normalize();
    const ground = (x, z) => origin.y + heightOver((x - origin.x) * left.x + (z - origin.z) * left.z, (x - origin.x) * front.x + (z - origin.z) * front.z);
    return withGround(ground, reads => {
        stopFrame(r, attitude);
        r.hero.character._rrDrive.foot = 1;
        for (let i = 0; i < frames; i++) stopFrame(r, attitude);
        const side = block.stand && block.stand.side === 'right' ? 1 : 0, leg = r.state.legs[side], sole = soleOf(leg);
        const out = { r, attitude, origin, left, front, ground, reads, leg, sole, over: sole.y - ground(sole.x, sole.z), rest: sole.distanceTo(pointOf(r, leg.name)), frame: () => stopFrame(r, attitude) };
        return then ? then(out) : out;
    });
}

test('at a stop the foot goes to the ground under its own place, across a slope and along one', { skip: !have(HERO, BIKE) }, () => {
    // Level: on the vehicle's own ground, 0.55 tile out from the seat; the vehicle is told to tip.
    const level = stopOn(() => 0);
    assert.equal(level.r.state.footDown, 1);
    assert.ok(Math.abs(level.over) < 0.02 && Math.abs(level.sole.y - level.origin.y) < 0.02, 'level: the sole is ' + level.over + ' over the ground');
    const outOf = s => { const seat = pointOf(s.r, 'seat'); return (s.sole.x - seat.x) * s.left.x + (s.sole.z - seat.z) * s.left.z; };
    assert.ok(Math.abs(outOf(level) - 0.55) < 0.03, 'the sole is ' + outOf(level) + ' out from the seat');
    assert.ok(Math.abs(Math.asin(axes(level.r).left.y) / DEG + 5) < 0.01, 'the vehicle stands tipped 5 degrees onto the foot');
    // The ground rises to the stand side (0.19 tile at the foot): the sole is on it, not buried at the vehicle's own height.
    const up = stopOn(out => 0.35 * out);
    assert.equal(up.r.state.footDown, 1);
    assert.ok(up.sole.y - up.origin.y > 0.15, 'the foot stands ' + (up.sole.y - up.origin.y) + ' over the vehicle\'s ground');
    assert.ok(Math.abs(up.over) < 0.02, 'uphill to the stand side: the sole is ' + up.over + ' over the ground under it');
    assert.equal(up.leg.reached, true);
    // It falls a little: still reached, on the ball of the foot.
    const down = stopOn(out => -0.05 * out);
    assert.equal(down.r.state.footDown, 1);
    assert.ok(down.sole.y < down.origin.y - 0.015 && Math.abs(down.over) < 0.02, 'a little downhill: the sole is ' + down.over + ' over the ground under it');
    // The stand on the right: the right foot, on the ground to the right.
    const mirrored = JSON.parse(JSON.stringify(BLOCK));
    mirrored.stand.side = 'right';
    const right = stopOn(out => -0.3 * out, { block: mirrored });
    assert.equal(right.r.state.footDown, 1);
    assert.ok(right.sole.y - right.origin.y > 0.1 && Math.abs(right.over) < 0.02, 'the right foot is ' + right.over + ' over the ground to the right');
    assert.ok(Math.abs(outOf(right) + 0.55) < 0.03);
    // Along the heading the vehicle pitches with the ground under its wheels: the seat is behind its middle, so
    // nose down the ground beside the seat is higher than under the middle, nose up lower.
    for (const degrees of [8, -8, 14]) {
        const pitched = stopOn((out, ahead) => -Math.tan(degrees * DEG) * ahead, { nose: degrees * DEG, size: 3.2 });
        assert.equal(pitched.r.state.footDown, 1, 'pitched ' + degrees + ' the foot reaches');
        const apart = Math.abs(pitched.ground(pitched.sole.x, pitched.sole.z) - pitched.origin.y);
        assert.ok(apart > 0.025, 'pitched ' + degrees + ': the ground beside the seat is ' + apart + ' from the ground under the middle');
        assert.ok(Math.abs(pitched.over) < 0.01, 'pitched ' + degrees + ': the sole is ' + pitched.over + ' over the ground under it');
    }
    // Pitched further than the leg allows at this size, the foot keeps its rest.
    const steep = stopOn((out, ahead) => -Math.tan(14 * DEG) * ahead, { nose: 14 * DEG, size: 3.5 });
    assert.equal(steep.r.state.footDown, 0);
    assert.ok(steep.rest < 0.02);
});

test('where the leg does not reach the ground under the foot it stays on its rest and the vehicle is not tipped', { skip: !have(HERO, BIKE) }, () => {
    // The ground falls away to the stand side (0.19 tile at the foot), is a ledge's top there, or is a drop.
    for (const [name, heightOver] of [['downhill', out => -0.35 * out], ['a wall', out => out > 0.3 ? 1.5 : 0], ['a drop', out => out > 0.3 ? -4 : 0]]) {
        const s = stopOn(heightOver);
        assert.equal(Rider.footReaches(s.r.hero), true, 'at this size the leg does reach level ground');
        assert.equal(s.r.state.footDown, 0, name + ': the vehicle is told the foot is not down');
        assert.equal(s.r.state.footOn, false);
        assert.ok(s.rest < 0.02, name + ': the sole is ' + s.rest + ' from its rest');
        assert.ok(Math.abs(axes(s.r).left.y) < 1e-6, name + ': the vehicle stands upright');
        assert.ok(soleOf(s.r.state.legs[1]).distanceTo(pointOf(s.r, 'footR')) < 0.02);
        // Settled: nothing is worked out or read while nothing moves.
        const solves = Rider.solves, reads = s.reads();
        withGround(s.ground, () => { for (let i = 0; i < 5; i++) assert.equal(s.frame().solved, false); });
        assert.equal(Rider.solves, solves);
        assert.equal(s.reads(), reads);
    }
    // A step up that a foot can stand on (a quarter tile) is stood on; a third of a tile and more is not.
    const curb = stopOn(out => out > 0.3 ? 0.25 : 0);
    assert.equal(curb.r.state.footDown, 1);
    assert.ok(Math.abs(curb.sole.y - curb.origin.y - 0.25) < 0.02);
    assert.equal(stopOn(out => out > 0.3 ? 0.34 : 0).r.state.footDown, 0);
    assert.equal(Rider.FOOT_RISE, 0.3);
    // Ridden on to where it does reach, the foot comes down after all; walked back, it goes up.
    let rise = -0.3;
    const moved = stopOn(out => out > 0.3 ? rise : 0, { then: s => {
        assert.equal(s.r.state.footDown, 0);
        rise = 0;
        s.r.bike.object.position.addScaledVector(s.front, 0.4);
        for (let i = 0; i < 4; i++) s.frame();
        assert.equal(s.r.state.footDown, 1, 'on level ground again the foot comes down');
        assert.ok(Math.abs(soleOf(s.leg).y - s.origin.y) < 0.02);
        rise = -0.3;
        s.r.bike.object.position.addScaledVector(s.front, 0.4);
        for (let i = 0; i < 4; i++) s.frame();
        assert.equal(s.r.state.footDown, 0);
        assert.ok(soleOf(s.leg).distanceTo(pointOf(s.r, 'footL')) < 0.02);
        // Away at speed (the foot is not asked) and stopped again where the ground is level: judged afresh.
        s.r.hero.character._rrDrive.foot = 0;
        s.frame();
        rise = 0;
        s.r.bike.object.position.addScaledVector(s.front, 0.4);
        s.r.hero.character._rrDrive.foot = 1;
        s.frame();
        assert.equal(s.r.state.footDown, 1, 'the next stop is not held to the last one\'s answer: the foot starts down in its first frame');
        return s;
    } });
    assert.ok(moved.r.state);
    // At a size at which the leg never reaches level ground the foot is not asked down anywhere, a curb beside it
    // or not, and the ground is not read for it.
    const tall = stopOn(out => out > 0.3 ? 0.25 : 0, { size: 3.9 });
    assert.equal(Rider.footReaches(tall.r.hero), false);
    assert.equal(tall.r.state.footDown, 0);
    assert.ok(tall.rest < 0.02);
    assert.equal(tall.reads(), 0);
});

test('the ground under the foot is read once for a place, and again only when the foot\'s place has moved', { skip: !have(HERO, BIKE) }, () => {
    stopOn(out => 0.35 * out, { then: s => {
        const r = s.r;
        assert.equal(r.state.footDown, 1);
        // Settled at a stop: frames are drawn, nothing is read and nothing worked out.
        const reads = s.reads(), solves = Rider.solves;
        for (let i = 0; i < 20; i++) assert.equal(s.frame().solved, false);
        assert.equal(s.reads(), reads, 'no read while the vehicle stands');
        assert.equal(Rider.solves, solves);
        // Under a hundredth of a tile the place has not moved; further it is read again, once.
        r.bike.object.position.addScaledVector(s.left, 0.004);
        s.frame();
        assert.equal(s.reads(), reads);
        r.bike.object.position.addScaledVector(s.left, -0.064);
        assert.equal(s.frame().solved, true, 'the ground under the foot is lower there: the leg is worked out for it');
        assert.equal(s.reads(), reads + 1);
        const sole = soleOf(s.leg);
        assert.ok(Math.abs(sole.y - s.ground(sole.x, sole.z)) < 0.02, 'and the sole is on the ground of the new place');
        for (let i = 0; i < 5; i++) s.frame();
        assert.equal(s.reads(), reads + 1);
        // The vehicle's nose dips 6 degrees where it stands (its spring): the leg is worked out for that too, and
        // the sole stays on the ground.
        s.attitude.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 6 * DEG));
        assert.equal(s.frame().solved, true);
        const dipped = soleOf(s.leg);
        assert.ok(Math.abs(dipped.y - s.ground(dipped.x, dipped.z)) < 0.02, 'nose dipped: the sole is ' + (dipped.y - s.ground(dipped.x, dipped.z)) + ' over the ground');
        return s;
    } });
    // A rider held without ever being seated on this vehicle has no place for a foot: nothing is read.
    withGround(() => 2, reads => {
        const loose = ride();
        Rider.board(loose.hero, loose.hero.character, loose.hero.object, loose.bike);
        loose.hero.character._rrDrive.foot = 1;
        assert.doesNotThrow(() => Rider.update(loose.hero, loose.bike));
        assert.equal(reads(), 0);
        assert.equal(loose.state.footDown, 0);
    });
    // Walked on across a slope with the bars held (the bike pivoting at a stop): the ground is read as the foot's
    // place moves, the leg worked out only when that ground has gone 1/128 tile, and the sole stays on it.
    stopOn(out => 0.2 * out, { frames: 8, then: s => {
        const r = s.r, reads = s.reads(), solves = Rider.solves;
        let worst = 0;
        for (let i = 0; i < 120; i++) {
            r.bike.object.position.addScaledVector(s.left, -0.004);
            s.frame();
            const sole = soleOf(s.leg);
            worst = Math.max(worst, Math.abs(sole.y - s.ground(sole.x, sole.z)));
        }
        assert.equal(Rider.FOOT_STEP, 1 / 128);
        assert.ok(worst < 0.011, 'the sole was at most ' + worst + ' off the ground');
        // 0.48 tile across a slope of 0.2: the ground under the foot fell 0.096 tile, 12 steps of 1/128.
        const worked = Rider.solves - solves;
        assert.ok(worked >= 11 && worked <= 15, worked + ' solves over 120 frames of walking it across the slope');
        // (A read once the place has moved a hundredth of a tile along either of the map's axes.)
        assert.ok(s.reads() - reads >= 25 && s.reads() - reads <= 61, (s.reads() - reads) + ' reads of the ground over 0.48 tile');
        return s;
    } });
    // Riding, with the foot up, the ground is never read.
    const r = ride();
    withGround(() => 2, reads => {
        for (let i = 0; i < 30; i++) { r.bike.object.position.x += 0.3; r.scene.updateMatrixWorld(true); r.frame(); }
        assert.equal(reads(), 0);
    });
    // With no map loaded (the editor's canvas) the ground is level with the vehicle, wherever it stands.
    const bare = ride({ at: [10.5, 2, 7.5] });
    bare.frame();
    bare.hero.character._rrDrive.foot = 1;
    bare.frame();
    bare.bike.object.position.y = 5;
    bare.scene.updateMatrixWorld(true);
    bare.frame();
    assert.equal(bare.state.footDown, 1);
    assert.ok(Math.abs(soleOf(bare.state.legs[0]).y - 5) < 0.02);
});

test('the foot comes down and goes back up by a tenth a tick of the game\'s clock, the vehicle\'s tip with it', { skip: !have(HERO, BIKE) }, () => {
    withClock(tick => {
        let rise = 0;
        stopOn(out => out > 0.3 ? rise : 0, { frames: 0, then: s => {
            const r = s.r, shares = [];
            // The game's own share is whole at once here; what is drawn follows by a tenth a tick.
            for (let i = 0; i < 12; i++) { tick(); s.frame(); shares.push(Math.round(r.state.footDown * 1000) / 1000); }
            assert.deepEqual(shares, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1, 1]);
            assert.ok(Math.abs(soleOf(s.leg).y - s.origin.y) < 0.02);
            // Drawn twice in one tick: no further; three ticks between two frames: three tenths.
            r.hero.character._rrDrive.foot = 0;
            s.frame();
            assert.equal(r.state.footDown, 1);
            tick(3); s.frame();
            assert.ok(Math.abs(r.state.footDown - 0.7) < 1e-9);
            r.hero.character._rrDrive.foot = 1;
            tick(3); s.frame();
            assert.equal(r.state.footDown, 1);
            // The ground falls away under the foot (the bike is walked on to an edge): the foot and the tip ease
            // back, a tenth a tick, and the sole passes between the ground and its rest.
            rise = -0.4;
            r.bike.object.position.addScaledVector(s.front, 0.3);
            tick(); s.frame();
            assert.equal(r.state.footOn, false);
            assert.equal(r.state.footDown, 1, 'judged this frame, eased from the next');
            const back = [];
            let between = 0;
            for (let i = 0; i < 11; i++) {
                tick(); s.frame();
                back.push(Math.round(r.state.footDown * 1000) / 1000);
                const sole = soleOf(s.leg);
                if (sole.distanceTo(pointOf(r, 'footL')) > 0.05 && sole.y > s.origin.y + 0.05) between++;
            }
            assert.deepEqual(back, [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0, 0]);
            assert.ok(between >= 5, 'the foot was drawn on its way for ' + between + ' frames');
            assert.ok(soleOf(s.leg).distanceTo(pointOf(r, 'footL')) < 0.02);
            // After a gap of a second and more (a menu, a load) it is where it should be at once.
            rise = 0;
            r.bike.object.position.addScaledVector(s.front, 0.3);
            tick(); s.frame();
            tick(90); s.frame();
            assert.equal(r.state.footDown, 1);
            return s;
        } });
    });
});

test('the leg\'s reach is judged with the vehicle tipped onto the foot, as the fit judges it', { skip: !have(HERO, BIKE) }, () => {
    const hero = build(HERO, 3), box = { size: [2.573, 1.406, 1.037] };
    let fitted = 0, live = 0, drawnLive = 0;
    for (let tenth = 340; tenth <= 376; tenth += 2) {
        const size = tenth / 100;
        if (Rider.fit(hero, box, BLOCK, size).foot.reachesGround) fitted = size;
        // (The size's own answer is set aside: this is the judgement made at the stop.)
        const s = stopOn(() => 0, { size, frames: 0, then: at => { at.r.state.footReaches = true; at.frame(); const first = at.r.state.footDown; for (let i = 0; i < 4; i++) at.frame(); return { first, r: at.r, leg: at.leg, origin: at.origin }; } });
        if (s.first > 0) live = size;
        if (s.r.state.footDown > 0) {
            drawnLive = size;
            assert.equal(s.first, 1, size + ': judged out of reach upright and in reach once tipped');
            assert.ok(Math.abs(soleOf(s.leg).y - s.origin.y) < 0.02, size + ': the sole is on the ground');
        } else assert.equal(s.first, 0, size + ': nothing was drawn of a foot that does not reach');
    }
    assert.ok(fitted >= 3.5 && fitted <= 3.7, 'the fit puts the hero\'s foot on the ground up to ' + fitted);
    assert.ok(Math.abs(live - fitted) <= 0.021, 'the game brings the foot down up to ' + live + ', the fit says ' + fitted);
    assert.equal(drawnLive, live);
    // Without the tip the same leg reaches less far: the tip is part of the fit.
    const keep = Rider.FOOT_TIP;
    let upright = 0;
    try {
        Rider.FOOT_TIP = 0;
        for (let tenth = 340; tenth <= 376; tenth += 2) if (Rider.fit(hero, box, BLOCK, tenth / 100).foot.reachesGround) upright = tenth / 100;
    } finally { Rider.FOOT_TIP = keep; }
    assert.equal(Rider.FOOT_TIP, 5);
    assert.ok(upright > 3.3 && upright <= fitted - 0.04, 'upright the foot reaches up to ' + upright + ', tipped 5 degrees up to ' + fitted);
    // The share the game asks is held to 0..1, and a size at which the leg never reaches level ground asks nothing.
    const r = ride();
    r.frame();
    r.hero.character._rrDrive.foot = 3;
    r.frame(); r.frame(); r.frame();
    assert.equal(r.state.footDown, 1);
    const whole = r.state.slots.map(slot => slot.node.quaternion.clone());
    r.hero.character._rrDrive.foot = 1;
    r.frame();
    r.state.slots.forEach((slot, i) => assert.ok(near(slot.node.quaternion, whole[i]), 'three is whole'));
    r.hero.character._rrDrive.foot = -2;
    r.frame(); r.frame(); r.frame();
    assert.equal(r.state.footDown, 0);
    assert.ok(soleOf(r.state.legs[0]).distanceTo(pointOf(r, 'footL')) < 0.02);
});

//-----------------------------------------------------------------------------
// What a frame depends on, each part by itself.

test('the vehicle\'s lean, the hold and the body\'s weight are each a new frame by themselves', { skip: !have(HERO, BIKE) }, () => {
    // The lean alone (bars, hold and foot as they were): the head is set against it again.
    for (const settle of [0, Rider.STILL + 2]) {
        const r = ride({ yaw: 0 });
        r.frame();
        // (After `settle` more frames the samples may be in use: a first sweep makes them.)
        for (let i = 0; i < settle; i++) { r.bike.character._rrSteer = i % 2 ? 0 : 0.2; r.frame(); }
        r.bike.character._rrSteer = 0;
        r.frame();
        const head = r.state.head.quaternion.clone();
        r.bike.object.quaternion.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), 24 * DEG);
        r.scene.updateMatrixWorld(true);
        assert.equal(r.frame().solved, true, 'leaned 24 degrees, nothing else changed');
        assert.ok(r.state.head.quaternion.angleTo(head) > 8 * DEG, 'the head is set against the lean');
        // Under half a degree it is the same frame.
        const again = r.state.head.quaternion.clone();
        r.bike.object.quaternion.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), 24.1 * DEG);
        r.scene.updateMatrixWorld(true);
        assert.equal(r.frame().solved, false);
        assert.ok(r.state.head.quaternion.equals(again));
    }
    // The hold alone: two moments of a hop with the same body weight and another hold.
    const r = ride({ yaw: 0.6 });
    r.frame();
    const hero = r.hero.character;
    hero._rrMount = { t: 10, n: 14, on: true, fx: 12, fy: 9, fz: 2, tx: 10, ty: 7 };
    r.frame();
    const hand = r.state.arms[0].upper.quaternion.clone(), torso = r.state.joints.Hips.quaternion.clone();
    hero._rrMount = { t: 20, n: 28, on: true, fx: 12, fy: 9, fz: 2, tx: 10, ty: 7 };
    assert.equal(r.frame().solved, true, 'the same body weight (10 of 14, 20 of 28), more of the hold');
    assert.ok(r.state.arms[0].upper.quaternion.angleTo(hand) > 2 * DEG, 'the arm has closed further on its grip');
    assert.ok(near(r.state.joints.Hips.quaternion, torso, 1e-4), 'the torso is where it was');
    // The body's weight alone: before tick 8 the hold is nothing, the torso comes forward tick by tick.
    hero._rrMount = { t: 2, n: 14, on: true, fx: 12, fy: 9, fz: 2, tx: 10, ty: 7 };
    r.frame();
    const early = r.state.joints.Hips.quaternion.clone();
    hero._rrMount.t = 6;
    assert.equal(r.frame().solved, true);
    assert.ok(r.state.joints.Hips.quaternion.angleTo(early) > 4 * DEG, 'the hips have leaned further by tick 6');
});

test('the bars are followed to a quarter of a degree, and no further than full lock', { skip: !have(HERO, BIKE) }, () => {
    const r = ride();
    r.frame();
    assert.equal(Rider.BAR_STEP, 0.25);
    // 30 degrees of lock: 0.1 degree is the same frame, 0.2 degree a new one.
    r.bike.character._rrSteer = 0.1 / 30;
    assert.equal(r.frame().solved, false);
    r.bike.character._rrSteer = 0.2 / 30;
    assert.equal(r.frame().solved, true);
    // A steer past the lock is the lock: by the vehicle's own answer, and by the saved field where it gives none
    // (there with a foot down, so each angle is worked out by itself and not blended between the samples).
    const kept = R.Vehicles;
    for (const vehicles of [kept, Object.assign({}, kept || {}, { inputs: () => null, pointWorld: () => null })]) {
        try {
            R.Vehicles = vehicles;
            if (vehicles !== kept) { r.hero.character._rrDrive.foot = 1; r.frame(); assert.equal(r.state.footDown, 1); }
            r.bike.character._rrSteer = 5;
            r.frame();
            for (const arm of r.state.arms) {
                assert.equal(arm.reached, true);
                assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name, 1)) < 0.03, arm.name + ' is at full lock, not past it');
            }
            r.bike.character._rrSteer = -9;
            r.frame();
            for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name, -1)) < 0.03);
        } finally {
            R.Vehicles = kept;
        }
    }
});

test('the samples wait until the motion has held still two frames, and are made again when it has moved', { skip: !have(HERO, BIKE) }, () => {
    assert.equal(Rider.STILL, 2);
    const r = ride();
    r.frame();
    // The motion moves a joint under the pose: that frame is worked out.
    const chest = r.state.slots[1];
    chest.node.quaternion.copy(chest.base).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.05));
    let before = Rider.solves;
    assert.equal(r.frame().solved, true);
    assert.equal(r.state.still, 0);
    assert.equal(Rider.solves - before, 1);
    // The very next frame the bars move: the motion has held still one frame only, so that angle is worked out by itself.
    r.bike.character._rrSteer = 0.3;
    r.frame();
    assert.equal(r.state.sampled, false);
    assert.equal(Rider.solves - before, 2);
    // One frame later it has held still two: the five samples are made, once.
    r.bike.character._rrSteer = 0.6;
    r.frame();
    assert.equal(r.state.sampled, true);
    assert.equal(Rider.solves - before, 2 + Rider.SAMPLES.length);
    for (const arm of r.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(r, arm.name, 0.6)) < 0.03);

    // A block with no foot rests: the legs are the motion's. The motion moves a leg and holds it there.
    const bare = JSON.parse(JSON.stringify(BLOCK));
    delete bare.seats[0].footL; delete bare.seats[0].footR;
    const b = ride({ block: bare });
    b.frame();
    for (let i = 1; i <= 4; i++) { b.bike.character._rrSteer = i / 10; b.frame(); }
    assert.equal(b.state.sampled, true);
    const thigh = b.state.legs[0].slots[0], swung = thigh.base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4));
    before = Rider.solves;
    for (let i = 5; i <= 10; i++) {
        thigh.node.quaternion.copy(swung);
        b.bike.character._rrSteer = i / 10;
        b.frame();
        assert.ok(near(thigh.node.quaternion, swung), 'frame ' + i + ': the leg shows the pose the motion holds now');
        for (const arm of b.state.arms) assert.ok(palmOf(arm).distanceTo(pointOf(b, arm.name, i / 10)) < 0.03);
    }
    assert.equal(b.state.sampled, true, 'sampled again from the new pose');
    // The frame it moved, the frame after, then the five samples.
    assert.equal(Rider.solves - before, 2 + Rider.SAMPLES.length);
});

test('the lean never passes 50 degrees while the motion\'s own lean drifts under it', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ size: 6 });
    r.frame();
    assert.ok(Math.abs(r.state.leanNow - 50) < 1e-6);
    const a = axes(r), hips = r.state.joints.Hips, parent = hips.parent.getWorldQuaternion(new THREE.Quaternion());
    // The motion leans the hips a fifth of a degree further by itself: less than the reach is looked for again at.
    for (const slot of r.state.slots) slot.node.quaternion.copy(slot.base);
    hips.quaternion.premultiply(parent.clone().invert().multiply(new THREE.Quaternion().setFromAxisAngle(a.left, 0.2 * DEG)).multiply(parent));
    const searched = r.state.searchedLean;
    assert.equal(r.frame().solved, true);
    assert.equal(r.state.searchedLean, searched, 'the reach was not looked for again');
    assert.ok(r.state.baseLean > searched + 0.1);
    assert.ok(r.state.leanNow <= 50 + 1e-6, 'leaned ' + r.state.leanNow);
});

//-----------------------------------------------------------------------------
// Hands, head and limbs in detail.

test('the hands: closed and eased shut once the hold is whole, opened and their fingers put back on leaving', { skip: !have(HERO, BIKE) }, () => {
    const r = ride();
    const update = R.HandGrip.update;
    let calls = 0;
    R.HandGrip.update = function() { calls++; return update.apply(this, arguments); };
    try {
        r.frame();
        assert.equal(r.state.closed, true);
        const arms = r.state.arms.slice();
        for (const arm of arms) { assert.ok(arm.grip && arm.grip.layout.fingers.length >= 4, arm.name + ' has fingers'); assert.equal(arm.grip.pinned, true); }
        // The fingers ease shut over the next 30 drawn frames; after that the hands are left alone.
        for (let i = 0; i < 45; i++) r.frame();
        assert.equal(calls, 30);
        const bent = arm => arm.grip.layout.fingers.reduce((sum, finger) => sum + finger.joints.filter(joint => joint.node.quaternion.angleTo(joint.rest) > 5 * DEG).length, 0);
        for (const arm of arms) assert.ok(bent(arm) >= 4, arm.name + ' has ' + bent(arm) + ' finger joints bent');
        // The palm lies on the tube, 0.015 tile off its middle line.
        for (const arm of arms) {
            const off = palmOf(arm).distanceTo(pointOf(r, arm.name));
            assert.ok(off > 0.013 && off < 0.017, arm.name + ': the palm is ' + off + ' off the grip\'s line');
        }
        // Leaving: open at once, every finger joint at rest, nothing left pinned or waiting for an update.
        Rider.release(r.hero);
        for (const arm of arms) {
            assert.equal(arm.grip.pinned, false);
            for (const finger of arm.grip.layout.fingers) {
                assert.deepEqual([finger.now[0], finger.now[1]], [0, 0]);
                for (const joint of finger.joints) assert.ok(joint.node.quaternion.equals(joint.rest), arm.name + ': a finger joint is still bent');
            }
            assert.equal(R.HandGrip.hands.has(arm.grip), false);
        }
    } finally {
        R.HandGrip.update = update;
    }
});

test('a hand with no fingers marked reaches with its wrist short of the grip by the palm; a grip with no line of its own lies across the vehicle', { skip: !have(HERO, BIKE) }, () => {
    // The same model with its hands' finger layout out of sight: only a palm point is known.
    const r = ride({ size: 3 });
    const kept = R._handGrips, joints = Rider.joints(r.hero);
    try {
        R._handGrips = { get: () => null };
        for (const name of ['LeftHand', 'RightHand']) joints[name].userData.__reactorPalm = [0, 4, 0];
        r.frame();
    } finally {
        R._handGrips = kept;
        for (const name of ['LeftHand', 'RightHand']) delete joints[name].userData.__reactorPalm;
    }
    for (const arm of r.state.arms) {
        assert.equal(arm.oriented, false);
        assert.equal(arm.reached, true);
        assert.ok(arm.palm > 0.05, 'the palm is ' + arm.palm + ' tile from the wrist');
        const shoulder = place(arm.upper), grip = pointOf(r, arm.name), wrist = place(arm.hand);
        const want = grip.clone().addScaledVector(grip.clone().sub(shoulder).normalize(), -arm.palm);
        assert.ok(wrist.distanceTo(want) < 0.01, arm.name + ': the wrist is ' + wrist.distanceTo(want) + ' from its place short of the grip');
        assert.ok(Math.abs(wrist.distanceTo(grip) - arm.palm) < 0.01);
    }
    // No `along` on the grips: the knuckles lie along the vehicle's own left, inner end to outer end.
    const plain = JSON.parse(JSON.stringify(BLOCK));
    delete plain.seats[0].handL.along; delete plain.seats[0].handR.along;
    const p = ride({ block: plain });
    p.frame();
    for (const arm of p.state.arms) {
        const knuckles = new THREE.Vector3().fromArray(arm.grip.layout.across).transformDirection(arm.hand.matrixWorld);
        assert.ok(Math.abs(knuckles.dot(axes(p).left)) > 0.99, arm.name + ': the knuckle line lies across the vehicle (' + knuckles.dot(axes(p).left) + ')');
        assert.ok(palmOf(arm).distanceTo(pointOf(p, arm.name)) < 0.03);
    }
    // A control whose line is written pointing down turns the same way as one written pointing up.
    const down = JSON.parse(JSON.stringify(BLOCK));
    down.controls[0].axis = down.controls[0].axis.map(v => -v);
    for (const steer of [1, -0.5]) for (const name of ['handL', 'handR'])
        assert.ok(Rider.point(down, 0, name, steer, new THREE.Vector3()).distanceTo(Rider.point(BLOCK, 0, name, steer, new THREE.Vector3())) < 1e-9, name + ' at ' + steer);
});

test('elbows and knees: down and a little out, ahead and a little out and up', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 0.4 });
    r.frame();
    const a = axes(r);
    // The middle joint lies off the limb's line on the side its pole names.
    const bend = (upper, lower, end, pole) => {
        const from = place(upper), line = place(end).sub(from).normalize(), off = place(lower).sub(from);
        off.addScaledVector(line, -off.dot(line)).normalize();
        return off.dot(pole.clone().addScaledVector(line, -pole.dot(line)).normalize());
    };
    for (const arm of r.state.arms) {
        const pole = a.up.clone().negate().addScaledVector(a.left, arm.sign * 0.35);
        assert.ok(bend(arm.upper, arm.lower, arm.hand, pole) > 0.9999, arm.name + ': the elbow is down and 0.35 out');
    }
    for (const leg of r.state.legs) {
        const pole = a.front.clone().addScaledVector(a.left, leg.sign * 0.3).addScaledVector(a.up, 0.2);
        assert.ok(bend(leg.upper, leg.lower, leg.foot, pole) > 0.9999, leg.name + ': the knee is ahead, 0.3 out and 0.2 up (' + bend(leg.upper, leg.lower, leg.foot, pole) + ')');
    }
});

test('the head: half the lean, the bars\' swing looked into, the neck taking half the turn', { skip: !have(HERO, BIKE) }, () => {
    const headOf = r => {
        const q = r.state.head.getWorldQuaternion(new THREE.Quaternion()).multiply(r.state.headRest.clone().invert());
        return { front: new THREE.Vector3(0, 0, 1).applyQuaternion(q), left: new THREE.Vector3(1, 0, 0).applyQuaternion(q) };
    };
    // 40 degrees over to its right: the head's own left side stands 18 degrees up, not 40 (and not 13).
    const leaned = ride({ yaw: 0 });
    leaned.bike.object.quaternion.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), 40 * DEG);
    leaned.scene.updateMatrixWorld(true);
    leaned.frame();
    assert.ok(Math.abs(Math.asin(axes(leaned).left.y) / DEG - 40) < 0.01);
    const side = Math.asin(headOf(leaned).left.y) / DEG;
    assert.ok(side > 16.5 && side < 19.5, 'under a 40 degree lean the head is ' + side + ' degrees over');
    // Upright at a standstill with the bars at full lock: the head looks half of 25 degrees that way.
    const r = ride({ yaw: 0 });
    r.frame();
    const a = axes(r), right = new THREE.Vector3(-a.left.x, 0, -a.left.z).normalize();
    const look = () => { const front = headOf(r).front; return Math.asin(new THREE.Vector3(front.x, 0, front.z).normalize().dot(right)) / DEG; };
    assert.ok(Math.abs(look()) < 0.5);
    r.bike.character._rrSteer = 1;
    r.frame();
    assert.ok(look() > 11 && look() < 14, 'bars full right: the head looks ' + look() + ' degrees right');
    // The neck takes half the turn from where the head would be to where it is.
    const neck = r.state.neck, head = r.state.head, slot = r.state.slots.find(item => item.node === neck);
    assert.ok(head.parent === neck, 'the hero\'s head hangs on his neck joint');
    const would = neck.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(slot.base).multiply(r.state.headLocal);
    const whole = would.angleTo(head.getWorldQuaternion(new THREE.Quaternion())), part = neck.quaternion.angleTo(slot.base);
    assert.ok(whole > 20 * DEG && Math.abs(part / whole - 0.5) < 0.03, 'the neck turned ' + part / DEG + ' of ' + whole / DEG + ' degrees');
    r.bike.character._rrSteer = -1;
    r.frame();
    assert.ok(look() < -11 && look() > -14);
});

//-----------------------------------------------------------------------------
// Boarding again, and what is not boarded.

test('a body that cannot sit is asked once, shown through the hop and stood in the seat; another rider releases the first', { skip: !have(HERO, BIKE) }, () => {
    const bike = build(BIKE, 3.5), other = build(BIKE, 3.5), joints = Rider.joints;
    let asked = 0;
    Rider.joints = function() { asked++; return joints.apply(this, arguments); };
    try {
        for (let i = 0; i < 6; i++) assert.equal(Rider.seat(other, null, other.object, bike), false);
        assert.equal(asked, 1, 'the joints of a refused body are looked for once, not every frame');
        // Another model under the same holder is tried.
        const hero = build(HERO, 3);
        other.object = hero.object; other.binding = hero.binding;
        bike.vehicleBlock = BLOCK;
        new THREE.Group().add(hero.object, bike.object);
        assert.equal(Rider.seat(other, null, hero.object, bike), true);
        assert.ok(other.riderRefused === null);
    } finally {
        Rider.joints = joints;
    }

    const r = ride({ yaw: 1.2 }), second = build(HERO, 3), box = build(BIKE, 2);
    r.scene.add(second.object, box.object);
    const instances = new Map([['p', r.hero], ['e7', r.bike]]), scene = { _modelInstances: instances };
    const player = r.hero.character, previous = global.$gamePlayer;
    try {
        global.$gamePlayer = player;
        player._rrRide = { map: 5, id: 7 };
        assert.equal(Rider.pass(scene), true);
        const first = r.hero.rider, slots = first.slots;
        assert.ok(first && first.closed);
        // The leader's model is another one now (a party change aboard): the first is let go, joints and hands.
        second.character = player;
        instances.set('p', second);
        assert.equal(Rider.pass(scene), true);
        assert.ok(r.hero.rider === null, 'the first holder is released');
        for (const slot of slots) assert.ok(slot.node.quaternion.equals(slot.base), 'its joints are the motion\'s again');
        for (const arm of first.arms) assert.equal(arm.grip.pinned, false);
        assert.ok(second.rider && second.rider.object === second.object);
        // A vehicle whose model is still loading (a holder with no object) is no vehicle: nothing throws, nothing is written.
        instances.set('e9', { object: null, character: {} });
        player._rrRide = { map: 5, id: 9 };
        const where = second.object.position.clone();
        assert.doesNotThrow(() => Rider.pass(scene));
        assert.ok(second.object.position.equals(where));
        player._rrSeated = false; player._rrRide = null;
        Rider.pass(scene);

        // A body with no rig: shown while the hop plays, and stood in the seat once there.
        box.character = player;
        box.object.visible = true;
        instances.set('p', box);
        player._rrSeated = true; player._rrRide = { map: 5, id: 7 };
        player._rrMount = { t: 3, n: 14, on: true, fx: 12, fy: 9, fz: 2 };
        assert.equal(Rider.pass(scene), false);
        assert.equal(box.object.visible, true, 'still shown on its way to the vehicle');
        player._rrMount = null;
        box.object.visible = false;
        Rider.pass(scene);
        assert.equal(box.object.visible, true, 'shown on the seat');
        const seat = new THREE.Vector3();
        if (!R.Vehicles.pointWorld(r.bike.object, 'ride.0.seat', seat)) {
            assert.ok(Rider.point(r.bike.object.__reactorVehicle || r.bike.vehicleBlock, 0, 'seat', 0, seat));
            seat.applyMatrix4(r.bike.object.matrixWorld);
        }
        assert.ok(Math.abs(box.object.position.x - seat.x) < 1e-6 && Math.abs(box.object.position.z - seat.z) < 1e-6, 'over the seat point');
        assert.ok(box.object.position.y < seat.y, 'its middle at the seat, not its feet');
        player._rrSeated = false; player._rrRide = null;
        Rider.pass(scene);
    } finally {
        global.$gamePlayer = previous;
    }
});

test('a model whose art is turned sits facing the vehicle\'s front, and stands at the yaw the placement eased at the on-foot end of a hop', { skip: !have(HERO, BIKE) }, () => {
    const plain = ride({ yaw: 0.6 });
    plain.frame();
    // The same rider, its model said to be authored turned 0.7 radian (the placement turns it back by that).
    const r = ride({ yaw: 0.6 });
    r.hero.riderSpec = { yaw: 0.7 };
    r.frame();
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7);
    assert.ok(Math.abs(r.state.baseYaw - 0.7) < 1e-9);
    assert.ok(near(r.hero.object.quaternion, plain.hero.object.quaternion.clone().multiply(turn)), 'the seat\'s turn is the vehicle\'s attitude times the model\'s own');
    const want = pointOf(r, 'seat').addScaledVector(axes(r).up, Rider.HIPS_OVER * r.state.height);
    assert.ok(place(r.state.joints.Hips).distanceTo(want) < 0.02, 'and the hips are over the seat all the same');
    // Tick 0 of a hop on: exactly as the placement drew it (yaw eased to -0.4, the art's turn inside that).
    r.hero.smoothYaw = -0.4;
    r.hero.character._rrMount = { t: 0, n: 14, on: true, fx: 12, fy: 9, fz: 2 };
    r.frame();
    assert.ok(near(r.hero.object.quaternion, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.4)), 'the on-foot end is the placement\'s own turn');
    // Tick 14 of a hop off: the same, at the yaw it has then.
    r.hero.smoothYaw = 2.1;
    r.hero.character._rrMount = { t: 14, n: 14, on: false, tx: 12, ty: 8 };
    r.frame();
    assert.ok(near(r.hero.object.quaternion, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 2.1)));
});

test('tied again when the vehicle\'s block or its model changes; boarded again when the rider\'s own size changes', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ size: 3.5 });
    r.frame();
    const first = r.state;
    // The block edited under him (the Vehicles page moves a grip): the hands go to the new points.
    const edited = JSON.parse(JSON.stringify(BLOCK));
    edited.seats[0].handL.at[1] += 0.08; edited.seats[0].handR.at[1] += 0.08;
    r.bike.vehicleBlock = edited;
    r.frame();
    assert.ok(r.state === first, 'tied again, not boarded again');
    assert.ok(r.state.block === edited, 'the edited block is the one in use');
    for (const arm of r.state.arms) {
        const grip = Rider.point(edited, 0, arm.name, 0, new THREE.Vector3()).applyMatrix4(r.bike.object.matrixWorld);
        assert.ok(palmOf(arm).distanceTo(grip) < 0.03, arm.name + ' is on the moved grip');
    }
    // Another instance of the vehicle under the same holder, somewhere else: he sits on that one.
    const rebuilt = build(BIKE, 3.5);
    r.scene.add(rebuilt.object);
    rebuilt.object.position.set(40.5, 1, 22.5);
    r.bike.object = rebuilt.object;
    r.scene.updateMatrixWorld(true);
    assert.equal(r.frame().wrote, true);
    assert.ok(r.state.vehicleObject === rebuilt.object, 'tied to the new instance');
    const seat = Rider.point(edited, 0, 'seat', 0, new THREE.Vector3()).applyMatrix4(rebuilt.object.matrixWorld).addScaledVector(axes(r).up, Rider.HIPS_OVER * r.state.height);
    assert.ok(place(r.state.joints.Hips).distanceTo(seat) < 0.02, 'the hips are over the new instance\'s seat');

    // The rider's own size changes during the ride (a Transform 3D Model on the player): every length is measured again.
    const s = ride({ size: 4.2 });
    s.frame();
    const small = s.state, armLength = small.arms[0].length;
    assert.equal(small.arms[0].reached, false, 'at 3 tiles tall he does not reach these bars');
    s.hero.object.scale.multiplyScalar(1.5);
    s.scene.updateMatrixWorld(true);
    s.frame();
    assert.ok(s.state !== small, 'boarded again');
    assert.ok(Math.abs(s.state.height - 4.5) < 0.01 && Math.abs(s.state.arms[0].length - armLength * 1.5) < 0.01, 'measured at the new size');
    for (const arm of s.state.arms) { assert.equal(arm.reached, true); assert.ok(palmOf(arm).distanceTo(pointOf(s, arm.name)) < 0.03, arm.name + ' is ' + palmOf(arm).distanceTo(pointOf(s, arm.name)) + ' from its grip'); }
    assert.ok(place(s.state.joints.Hips).distanceTo(pointOf(s, 'seat').addScaledVector(axes(s).up, Rider.HIPS_OVER * 4.5)) < 0.02);
    // Stretched on one axis only (taller): boarded again too; the same size again is the same boarding.
    const tall = s.state;
    s.frame();
    assert.ok(s.state === tall, 'the same size again is the same boarding');
    s.hero.object.scale.y *= 1.1;
    s.scene.updateMatrixWorld(true);
    s.frame();
    assert.ok(s.state !== tall, 'boarded again for another height');
    assert.ok(Math.abs(s.state.height - 4.95) < 0.01);
});

test('a hop off with no height named lands on the ground read at its tile, read once', { skip: !have(HERO, BIKE) }, () => {
    const r = ride({ yaw: 0.6 });
    r.frame();
    const hero = r.hero.character;
    withGround((x, z) => (Math.floor(x) === 12 && Math.floor(z) === 8 ? 7.25 : 2), reads => {
        hero._rrMount = { t: 0, n: 14, on: false, tx: 12, ty: 8 };
        for (let t = 0; t <= 14; t++) { hero._rrMount.t = t; r.frame(); }
        assert.ok(r.hero.object.position.distanceTo(new THREE.Vector3(12.5, 7.25, 8.5)) < 1e-6, 'he lands at the height of that tile\'s ground');
        assert.equal(reads(), 1, 'the tile is read once for the whole hop');
    });
});

//-----------------------------------------------------------------------------
// The fit in detail.

test('the fit: the worse of the two locks per hand, the knee\'s own angle, a seat with no place, the largest size first', { skip: !have(HERO, BIKE) }, () => {
    const hero = build(HERO, 3), box = { size: [2.573, 1.406, 1.037] };
    // Reach at full lock is the worse lock for that hand. On the Demo motorcycle (raked bars under a leaned torso)
    // the grip that comes back also drops away from the shoulder: the left hand's worse lock is bars left, the right
    // hand's bars right, so one lock alone would report one hand too near.
    const report = Rider.fit(hero, box, BLOCK, 3);
    const r = ride({ size: 3 });
    r.frame();
    const worst = [];
    for (const arm of r.state.arms) {
        const locks = [1, -1].map(steer => { r.bike.character._rrSteer = steer; r.frame(); return place(arm.upper).distanceTo(pointOf(r, arm.name, steer)) / arm.length; });
        const worse = Math.max(...locks), better = Math.min(...locks);
        assert.ok(worse - better > 0.03, arm.name + ': the two locks are ' + locks.join(' and ') + ' of the arm');
        worst.push(locks.indexOf(worse));
        assert.ok(Math.abs(report.points[arm.name].reachAtLock - worse) < 0.012, arm.name + ': reported ' + report.points[arm.name].reachAtLock + ' at lock, drawn ' + worse);
    }
    assert.deepEqual(worst, [1, 0], 'each hand has its far lock on its own side');
    // The knee folds further on a smaller vehicle, and the report gives the angle between thigh and shin.
    const knees = [2.5, 3, 3.5].map(size => Rider.fit(hero, box, BLOCK, size).points.footL.knee);
    assert.ok(knees[0] + 8 < knees[1] && knees[1] + 8 < knees[2], 'knee ' + knees.join(', '));
    const leg = r.state.legs[0];
    r.bike.character._rrSteer = 0;
    r.frame();
    const hip = place(leg.upper), knee = place(leg.lower), ankle = place(leg.foot);
    const drawn = Math.acos(hip.clone().sub(knee).normalize().dot(ankle.clone().sub(knee).normalize())) / DEG;
    assert.ok(Math.abs(drawn - knees[1]) < 4, 'the knee is drawn at ' + drawn + ' degrees, reported ' + knees[1]);

    // A seat with no place (a hand-written file's mistake): a report and a fitted size, never a throw.
    for (const seat of [{}, { at: [0.3, 1] }, { at: 'here' }, null]) {
        const broken = JSON.parse(JSON.stringify(BLOCK));
        broken.seats[0].seat = seat;
        for (const vehicle of [box, build(BIKE, 3.5).object]) {
            let fitted = null;
            assert.doesNotThrow(() => { fitted = Rider.fitSize([hero], vehicle, broken, 'motorcycle'); });
            assert.deepEqual([fitted.size, fitted.limitedBy, fitted.reason, fitted.reports.length], [0, -1, '', 0]);
            assert.doesNotThrow(() => Rider.fit(hero, vehicle, broken, 3.5));
            assert.equal(Rider.fit(hero, vehicle, broken, 3.5).ok, false);
        }
        // In the game such a block seats nobody and throws nothing.
        const g = ride({ block: broken });
        assert.doesNotThrow(() => g.frame());
        assert.equal(g.frame().wrote, false);
    }
    assert.doesNotThrow(() => Rider.fitSize([hero], box, { seats: [] }, 'motorcycle'));
    assert.doesNotThrow(() => Rider.fitSize([hero], box, null, 'motorcycle'));

    // Nothing to reach for and no foot asked down: every size fits, and the answer is the largest there is.
    const free = JSON.parse(JSON.stringify(BLOCK));
    delete free.seats[0].handL; delete free.seats[0].handR;
    const any = Rider.fitSize([hero], box, free, { leans: false });
    assert.equal(any.size, Rider.FIT_MAX);
    assert.equal(Rider.FIT_MAX, 40);
    assert.deepEqual([any.limitedBy, any.reason], [-1, '']);
});

//-----------------------------------------------------------------------------
// Steering at a stop.

test('standing with the foot down, steering blends five worked-out angles too; the stop\'s samples are for that ground and that attitude', { skip: !have(HERO, BIKE) }, () => {
    stopOn(out => 0.2 * out, { frames: 8, then: s => {
        const r = s.r, hips = () => place(r.state.joints.Hips).distanceTo(pointOf(r, 'seat').addScaledVector(axes(r).up, Rider.HIPS_OVER * r.state.height));
        assert.equal(r.state.footDown, 1);
        // Bars swept lock to lock three times, the foot on the ground all the while: five solves, at the first move.
        let before = Rider.solves, worst = { palm: 0, sole: 0, hips: 0 };
        const sweep = () => {
            for (let i = -20; i <= 20; i++) {
                r.bike.character._rrSteer = i / 20;
                s.frame();
                for (const arm of r.state.arms) worst.palm = Math.max(worst.palm, palmOf(arm).distanceTo(pointOf(r, arm.name, i / 20)));
                const sole = soleOf(s.leg);
                worst.sole = Math.max(worst.sole, Math.abs(sole.y - s.ground(sole.x, sole.z)), soleOf(r.state.legs[1]).distanceTo(pointOf(r, 'footR')));
                worst.hips = Math.max(worst.hips, hips());
            }
        };
        sweep();
        assert.equal(Rider.solves - before, Rider.SAMPLES.length, 'worked out once at each sample');
        sweep(); sweep();
        assert.equal(Rider.solves - before, Rider.SAMPLES.length, 'and never again while steering at the stop');
        assert.ok(worst.palm < 0.03 && worst.sole < 0.02 && worst.hips < 0.02, JSON.stringify(worst));
        assert.ok(soleOf(s.leg).y - s.origin.y > 0.08, 'the foot is on the higher ground beside the vehicle');
        // Away (the foot up): the riding samples are another set, made once; the foot is on its rest.
        r.hero.character._rrDrive.foot = 0;
        before = Rider.solves;
        for (let i = 0; i < 4; i++) s.frame();
        for (let i = -10; i <= 10; i++) { r.bike.character._rrSteer = i / 10; s.frame(); assert.ok(soleOf(s.leg).distanceTo(pointOf(r, 'footL')) < 0.02, 'riding, the foot is on its rest'); }
        const riding = Rider.solves - before;
        assert.ok(riding >= Rider.SAMPLES.length && riding <= Rider.SAMPLES.length + 2, riding + ' solves to lift the foot and make the riding samples');
        // Stopped again on the same ground: the stop's own samples are still good. Only the foot coming down and
        // the vehicle tipping onto it are worked out; steering after that is not.
        r.hero.character._rrDrive.foot = 1;
        for (let i = 0; i < 6; i++) s.frame();
        before = Rider.solves;
        for (let i = -10; i <= 10; i++) {
            r.bike.character._rrSteer = i / 10; s.frame();
            const sole = soleOf(s.leg);
            assert.ok(Math.abs(sole.y - s.ground(sole.x, sole.z)) < 0.02, 'stopped again, the sole is on the ground');
        }
        assert.equal(Rider.solves - before, 0, 'no solve for a second stop on the same ground');
        // Away once more: the riding samples were kept through the stop.
        r.hero.character._rrDrive.foot = 0;
        for (let i = 0; i < 4; i++) s.frame();
        before = Rider.solves;
        for (let i = -10; i <= 10; i++) { r.bike.character._rrSteer = i / 10; s.frame(); assert.ok(soleOf(s.leg).distanceTo(pointOf(r, 'footL')) < 0.02); }
        assert.equal(Rider.solves - before, 0);

        // Walked on to other ground with the foot down: that is another stop. While the ground changes each
        // angle is worked out by itself; once it has stayed two frames the samples are made for it.
        r.hero.character._rrDrive.foot = 1;
        for (let i = 0; i < 6; i++) s.frame();
        r.bike.object.position.addScaledVector(s.left, -0.2);
        before = Rider.solves;
        r.bike.character._rrSteer = 0.3; s.frame();
        r.bike.character._rrSteer = 0.35; s.frame();
        assert.equal(Rider.solves - before, 2, 'the frame the ground changed and the frame after are worked out by themselves');
        r.bike.character._rrSteer = 0.4; s.frame();
        assert.equal(Rider.solves - before, 2 + Rider.SAMPLES.length);
        for (let i = -10; i <= 10; i++) {
            r.bike.character._rrSteer = i / 10; s.frame();
            const sole = soleOf(s.leg);
            assert.ok(Math.abs(sole.y - s.ground(sole.x, sole.z)) < 0.02, 'on the new ground the sole is ' + (sole.y - s.ground(sole.x, sole.z)) + ' over it at steer ' + i / 10);
        }
        assert.equal(Rider.solves - before, 2 + Rider.SAMPLES.length);
        // The vehicle's nose dips where it stands: the attitude is part of what a stop's samples are for.
        s.attitude.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 5 * DEG));
        before = Rider.solves;
        r.bike.character._rrSteer = 0.2; s.frame();
        r.bike.character._rrSteer = 0.25; s.frame();
        r.bike.character._rrSteer = 0.3; s.frame();
        assert.equal(Rider.solves - before, 2 + Rider.SAMPLES.length);
        const dipped = soleOf(s.leg);
        assert.ok(Math.abs(dipped.y - s.ground(dipped.x, dipped.z)) < 0.02);
        // And so is how far it stands over to the side (4 degrees further onto the foot here).
        s.attitude.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1, 0, 0), -4 * DEG));
        before = Rider.solves;
        for (let i = 0; i <= 10; i++) {
            r.bike.character._rrSteer = i / 10; s.frame();
            const sole = soleOf(s.leg);
            assert.ok(Math.abs(sole.y - s.ground(sole.x, sole.z)) < 0.02, 'leaned further over, the sole is ' + (sole.y - s.ground(sole.x, sole.z)) + ' over the ground at steer ' + i / 10);
        }
        assert.equal(Rider.solves - before, 2 + Rider.SAMPLES.length);
        return s;
    } });
    // On level ground the same: leaned 4 degrees further over where it stands, the stop's samples are made again.
    stopOn(() => 0, { frames: 8, then: s => {
        const r = s.r;
        for (let i = 0; i <= 6; i++) { r.bike.character._rrSteer = i / 10; s.frame(); }
        assert.equal(r.state.sampleFor[1] > 1, true, 'the stop has its samples');
        s.attitude.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-1, 0, 0), -4 * DEG));
        for (let i = 0; i <= 10; i++) {
            r.bike.character._rrSteer = i / 10; s.frame();
            assert.ok(Math.abs(soleOf(s.leg).y - s.origin.y) < 0.012, 'leaned further over on the level, the sole is ' + (soleOf(s.leg).y - s.origin.y) + ' over the ground at steer ' + i / 10);
        }
        // A foot held part of the way (the game eases it; here it is held there) is worked out at every angle.
        r.hero.character._rrDrive.foot = 0.5;
        for (let i = 0; i < 4; i++) s.frame();
        const before = Rider.solves;
        for (let i = 1; i <= 6; i++) {
            r.bike.character._rrSteer = -i / 10;
            assert.equal(s.frame().solved, true);
            const sole = soleOf(s.leg);
            assert.ok(sole.y - s.origin.y > 0.15 && sole.distanceTo(pointOf(r, 'footL')) > 0.15, 'half way down the sole is between its rest and the ground');
        }
        assert.equal(Rider.solves - before, 6);
        return s;
    } });
    // The game's own easing: while the foot is on its way no samples of a stop are made.
    withClock(tick => stopOn(() => 0, { frames: 0, then: s => {
        for (let i = 0; i < 6; i++) { tick(); s.r.bike.character._rrSteer = i / 10; assert.equal(s.frame().solved, true); assert.ok(s.r.state.footDown < 1); }
        assert.equal(s.r.state.sampleFor[1], 0, 'no samples of a stop while the foot is on its way');
        return s;
    } }));
    // The motion moving under a stopped rider drops the stop's samples as well: a leg with no rest of its own
    // shows the pose the motion holds now.
    const bare = JSON.parse(JSON.stringify(BLOCK));
    delete bare.seats[0].footR;
    stopOn(() => 0, { block: bare, frames: 8, then: s => {
        const r = s.r;
        for (let i = 0; i <= 6; i++) { r.bike.character._rrSteer = i / 10; s.frame(); }
        assert.equal(r.state.sampleFor[1] > 1, true);
        const thigh = r.state.legs[1].slots[0], swung = thigh.base.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4));
        for (let i = 0; i <= 8; i++) {
            thigh.node.quaternion.copy(swung);
            r.bike.character._rrSteer = -i / 10;
            s.frame();
            assert.ok(near(thigh.node.quaternion, swung), 'frame ' + i + ': the leg with no rest shows the motion\'s new pose');
        }
        assert.ok(Math.abs(soleOf(s.leg).y - s.origin.y) < 0.02);
        return s;
    } });
});
