/**
 * Hands that close on what they hold: finger joints derived from a rig's
 * hand markers, the fingers' share of the hand's skin, the file's own finger
 * bones when it has them, and the grip that turns them until they meet the
 * held thing. Behavioral, against the real three.js the runtime ships.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** A right hand hanging down the -y axis from the wrist at the origin, palm facing +x, knuckles along z (index at +z). */
const handPoints = () => ({
    thumb: { base: [0.02, -0.06, 0.05], tip: [0.02, -0.10, 0.07] },
    index: { base: [0, -0.10, 0.03], tip: [0, -0.16, 0.03] },
    middle: { base: [0, -0.10, 0.01], tip: [0, -0.17, 0.01] },
    ring: { base: [0, -0.10, -0.01], tip: [0, -0.16, -0.01] },
    pinky: { base: [0, -0.10, -0.03], tip: [0, -0.15, -0.03] }
});

/** Markers for both hands in a model's frame, the wrists at (+-0.4, 1, 0). */
function rigWithHands(fingers = true) {
    const markers = { wristL: [0.4, 1, 0], wristR: [-0.4, 1, 0], palmL: [0.4, 0.93, 0], palmR: [-0.4, 0.93, 0] };
    if (fingers) for (const [name, p] of Object.entries(handPoints())) {
        const key = name[0].toUpperCase() + name.slice(1);
        markers[name + 'BaseR'] = [-0.4 + p.base[0], 1 + p.base[1], p.base[2]]; markers[name + 'TipR'] = [-0.4 + p.tip[0], 1 + p.tip[1], p.tip[2]];
        markers[name + 'BaseL'] = [0.4 - p.base[0], 1 + p.base[1], p.base[2]]; markers[name + 'TipL'] = [0.4 - p.tip[0], 1 + p.tip[1], p.tip[2]];
        void key;
    }
    const bones = [
        { name: 'RightLowerArm', parent: -1, head: [-0.4, 1.3, 0], tail: [-0.4, 1, 0] }, { name: 'RightHand', parent: 0, head: [-0.4, 1, 0], tail: [-0.4, 0.84, 0] },
        { name: 'LeftLowerArm', parent: -1, head: [0.4, 1.3, 0], tail: [0.4, 1, 0] }, { name: 'LeftHand', parent: 2, head: [0.4, 1, 0], tail: [0.4, 0.84, 0] }
    ];
    return { template: 'humanoid', markers, bones, weights: {} };
}

/** A cylinder of points (a handle) round an axis through `at` along `dir`, in a Float32Array. */
function handle(at, dir, radius, half, step = 0.004) {
    const d = new THREE.Vector3(...dir).normalize(), u = new THREE.Vector3(0, 1, 0).cross(d).lengthSq() > 0.01 ? new THREE.Vector3(0, 1, 0).cross(d).normalize() : new THREE.Vector3(1, 0, 0).cross(d).normalize(), v = d.clone().cross(u);
    const out = [];
    for (let s = -half; s <= half; s += step) for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const p = new THREE.Vector3(...at).add(d.clone().multiplyScalar(s)).add(u.clone().multiplyScalar(Math.cos(a) * radius)).add(v.clone().multiplyScalar(Math.sin(a) * radius));
        out.push(p.x, p.y, p.z);
    }
    return Float32Array.from(out);
}

test('finger joints come from the markers a rig already has: two per finger, named by hand and finger', () => {
    const defs = Reactor3D.rigFingerDefs(rigWithHands());
    assert.equal(defs.length, 10, 'a thumb and four fingers on each hand');
    const index = defs.find(d => d.side === 'Right' && d.finger === 'index');
    assert.deepEqual(index.names, ['RightIndex1', 'RightIndex2']);
    assert.equal(index.hand, 'RightHand');
    assert.deepEqual(index.mid.map(v => Math.round(v * 1000) / 1000), [-0.4, 0.87, 0.03], 'the second joint is half way from the base to the tip');
    assert.deepEqual(Reactor3D.rigFingerDefs(rigWithHands(false)), [], 'a rig with no finger markers describes none');
    assert.deepEqual(Reactor3D.rigFingerDefs({ markers: { indexBaseR: [0, 0, 0] } }), [], 'a base alone is not a finger');
});

test('a hand\'s layout: the palm faces the way the fingers close, on either hand, and no finger opens past rest', () => {
    const right = Reactor3D.handGripLayout(handPoints(), 'Right', [0.02, -0.07, 0]);
    assert.ok(right.normal[0] > 0.9, 'this right hand\'s palm faces +x');
    const mirror = Object.fromEntries(Object.entries(handPoints()).map(([k, p]) => [k, { base: [-p.base[0], p.base[1], p.base[2]], tip: [-p.tip[0], p.tip[1], p.tip[2]] }]));
    const left = Reactor3D.handGripLayout(mirror, 'Left', null);
    assert.ok(left.normal[0] < -0.9, 'and its mirror, a left hand, faces -x');
    for (const layout of [right, left]) for (const f of layout.fingers) {
        // Turning a finger about its hinge by a positive angle carries its tip toward the palm's side.
        const dir = new THREE.Vector3(f.tip[0] - f.base[0], f.tip[1] - f.base[1], f.tip[2] - f.base[2]).normalize();
        const turned = dir.clone().applyAxisAngle(new THREE.Vector3(...f.hinge), 0.5);
        assert.ok(turned.dot(new THREE.Vector3(...layout.normal)) > dir.dot(new THREE.Vector3(...layout.normal)) + 0.1, `${layout.side} ${f.finger} closes toward the palm`);
        assert.equal(f.open, 0, 'closing starts from rest');
        assert.ok(f.max1 > 0.2 && f.max2 > 0.5);
    }
    assert.equal(right.fingers.length, 5);
    assert.ok(Math.abs(right.radius - 0.01) < 1e-9, 'a finger is half the spacing of the knuckles thick');
    assert.equal(Reactor3D.handGripLayout({}, 'Right', null), null);
});

test('the fingers take their share of the hand\'s skin: the palm stays the hand\'s, a fingertip its second joint\'s', () => {
    const layout = Reactor3D.handGripLayout(handPoints(), 'Right', null), index = layout.fingers.find(f => f.finger === 'index');
    // Vertices down the index finger, one on the back of the hand, one that the forearm carries.
    const points = [[0, -0.04, 0.03], [0, -0.10, 0.03], [0, -0.115, 0.03], [0, -0.145, 0.03], [0, -0.16, 0.03], [0, -0.13, 0.2], [0, 0.2, 0]];
    const position = { getX: i => points[i][0], getY: i => points[i][1], getZ: i => points[i][2] };
    const bone = [1, 1, 1, 1, 1, 1, 0], skin = Reactor3D.fingerSkinWeights(points.length, position, (i, c) => (c === 0 ? bone[i] : 0), (i, c) => (c === 0 ? 1 : 0),
        [{ index: 1, toHand: new THREE.Matrix4().elements, fingers: [{ base: index.base, tip: index.tip, length: index.length, radius: index.radius, one: 4, two: 5 }] }]);
    const share = (i, b) => { let w = 0; for (let c = 0; c < 4; c++) if (skin.index[i * 4 + c] === b) w += skin.weight[i * 4 + c]; return w; };
    assert.equal(share(0, 1), 1, 'the palm is the hand\'s');
    assert.ok(share(1, 1) > 0.2 && share(1, 4) > 0.2, 'the knuckle is shared, so it bends without a crease');
    assert.ok(share(2, 4) > 0.9, 'the first segment turns with the first joint');
    assert.ok(share(3, 5) > 0.9 && share(4, 5) > 0.99, 'the second segment and the tip with the second');
    assert.equal(share(5, 1), 1, 'a vertex off to the side of every finger stays the hand\'s');
    assert.equal(share(6, 0), 1, 'and what the forearm carries is not touched');
    for (let i = 0; i < points.length; i++) assert.ok(Math.abs([0, 1, 2, 3].reduce((sum, c) => sum + skin.weight[i * 4 + c], 0) - 1) < 1e-6, 'weights still sum to one');
    assert.equal(skin.changed, 4);
});

test('the grip: each finger closes until it meets the handle, and stops there', () => {
    const layout = Reactor3D.handGripLayout(handPoints(), 'Right', null), out = new Float32Array(10);
    // A handle across the palm, along the knuckles, a little way off the palm and down the fingers.
    const radius = 0.012, at = [0.035, -0.125, 0], cloud = handle(at, [0, 0, 1], radius, 0.08);
    Reactor3D.solveGrip(layout, cloud, cloud.length / 3, 0.002, out);
    const axis = new THREE.Vector3(0, 0, 1), origin = new THREE.Vector3(...at);
    layout.fingers.forEach((f, i) => {
        if (f.thumb) return;
        const t1 = out[i * 2], t2 = out[i * 2 + 1];
        assert.ok(t1 > 0.15 && t1 < f.max1 - 0.05, `${f.finger} closed part of the way (${t1.toFixed(2)})`);
        assert.ok(t2 >= 0 && t2 <= f.max2 + 1e-6);
        // Where the finger ended: its tested places are no nearer the axis than the handle and its own thickness allow.
        const hinge = new THREE.Vector3(...f.hinge), base = new THREE.Vector3(...f.base);
        const v1 = new THREE.Vector3(...f.mid).sub(base).applyAxisAngle(hinge, t1), v2 = new THREE.Vector3(...f.tip).sub(new THREE.Vector3(...f.mid)).applyAxisAngle(hinge, t1 + t2);
        const places = [base.clone().add(v1.clone().multiplyScalar(0.6)), base.clone().add(v1), base.clone().add(v1).add(v2.clone().multiplyScalar(0.5)), base.clone().add(v1).add(v2)];
        const toAxis = p => { const d = p.clone().sub(origin); return d.sub(axis.clone().multiplyScalar(d.dot(axis))).length(); };
        const nearest = Math.min(...places.map(toAxis));
        assert.ok(nearest >= radius + f.radius - 0.004, `${f.finger} does not pass into the handle (${nearest.toFixed(4)})`);
        assert.ok(nearest <= radius + f.radius + 0.012, `${f.finger} is on the handle, not short of it (${nearest.toFixed(4)})`);
    });
    for (let i = 0; i < 10; i++) assert.ok(out[i] >= 0, 'no finger bends back past rest');
    // The same handle further off is met later; one out of reach leaves a closed fist.
    const far = new Float32Array(10), cloudFar = handle([0.6, -0.125, 0], [0, 0, 1], radius, 0.08);
    Reactor3D.solveGrip(layout, cloudFar, cloudFar.length / 3, 0.002, far);
    layout.fingers.forEach((f, i) => { if (!f.thumb) assert.ok(Math.abs(far[i * 2] - f.max1) < 0.1, `${f.finger} closes fully on nothing`); });
    // Nothing to meet at all (a picture in the hand): a loose fist.
    const loose = new Float32Array(10);
    Reactor3D.solveGrip(layout, cloud, 0, 0, loose);
    layout.fingers.forEach((f, i) => { assert.ok(loose[i * 2] > 0 && loose[i * 2] < f.max1); });
});

test('a rigged static model gains finger joints after its own bones, skinned and unseen by the pose parts', () => {
    const rig = rigWithHands();
    const root = new THREE.Group(), geometry = new THREE.BufferGeometry();
    // A strip of vertices down the right index finger and up the forearm.
    const positions = [];
    for (let i = 0; i <= 10; i++) positions.push(-0.4, 1.3 - i * 0.046, 0.03);
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
    root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    // Everything from the wrist down is the hand's (bone 1), the rest the forearm's (bone 0).
    const count = 11, indices = new Uint8Array(count * 4), weights = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) { indices[i * 4] = positions[i * 3 + 1] <= 1 ? 1 : 0; weights[i * 4] = 255; }
    rig.weights = { 0: { count, indices, weights } };
    Reactor3D.applyModelRig(root, rig);
    let skinned = null; root.traverse(child => { if (child.isSkinnedMesh) skinned = child; });
    assert.ok(skinned);
    assert.equal(skinned.skeleton.bones.length, 4 + 20, 'four rig bones, then two joints for each of ten fingers');
    assert.deepEqual(skinned.skeleton.bones.slice(4).map(b => b.name).filter(n => /Index/.test(n)).sort(), ['LeftIndex1', 'LeftIndex2', 'RightIndex1', 'RightIndex2']);
    const joints = skinned.skeleton.bones.slice(4);
    assert.ok(joints.every(j => !j.isBone && !Reactor3D.isRigJoint(j) && !j.userData.parts), 'finger joints are not rig parts: nothing lists or poses them by hand');
    const tipBone = skinned.skeleton.bones.findIndex(b => b.name === 'RightIndex2');
    const skinIndex = skinned.geometry.getAttribute('skinIndex'), skinWeight = skinned.geometry.getAttribute('skinWeight');
    let tipShare = 0; for (let c = 0; c < 4; c++) if (skinIndex.getComponent(10, c) === tipBone) tipShare += skinWeight.getComponent(10, c);
    assert.ok(tipShare > 0.9, 'the fingertip turns with the finger\'s second joint');
    // A rig without finger markers is exactly as it was.
    const plain = rigWithHands(false); plain.weights = { 0: { count, indices, weights } };
    const root2 = new THREE.Group(); root2.add(new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial()));
    Reactor3D.applyModelRig(root2, plain);
    let skinned2 = null; root2.traverse(child => { if (child.isSkinnedMesh) skinned2 = child; });
    assert.equal(skinned2.skeleton.bones.length, 4);
    let fingers = 0; root2.traverse(node => { if (node.userData.__reactorFinger) fingers++; });
    assert.equal(fingers, 0);
});

/** A file skeleton: forearm and hand joints (plain nodes, as the GLB loader makes them), skinning a strip. */
function fileModel(withFingerBones) {
    const root = new THREE.Group(), fore = new THREE.Object3D(), hand = new THREE.Object3D();
    fore.name = 'RightForeArm'; hand.name = 'RightHand';
    fore.position.set(-0.4, 1.3, 0); hand.position.set(0, -0.3, 0); fore.add(hand); root.add(fore);
    const bones = [fore, hand];
    if (withFingerBones) {
        const points = handPoints();
        for (const [finger, p] of Object.entries(points)) {
            const label = 'mixamorig:RightHand' + finger[0].toUpperCase() + finger.slice(1);
            const one = new THREE.Object3D(), two = new THREE.Object3D(), three = new THREE.Object3D();
            one.name = label + '1'; two.name = label + '2'; three.name = label + '3';
            one.position.fromArray(p.base); one.rotation.set(0.2, 0.1, 0);
            hand.add(one); one.add(two); two.add(three);
            two.position.set(0, -0.02, 0); three.position.set(0, -0.02, 0);
            bones.push(one, two, three);
        }
    }
    const positions = [];
    for (let i = 0; i <= 10; i++) positions.push(-0.4, 1.3 - i * 0.046, 0.03);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
    const indices = new Uint16Array(11 * 4), weights = new Float32Array(11 * 4);
    for (let i = 0; i < 11; i++) { indices[i * 4] = positions[i * 3 + 1] <= 1 ? 1 : 0; weights[i * 4] = 1; }
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    root.add(mesh); root.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(bones), mesh.matrixWorld.clone());
    return { root, mesh, hand, geometry, bones };
}

test('a model with its own skeleton and no finger bones gains them without touching the file\'s geometry', () => {
    const { root, mesh, hand, geometry } = fileModel(false);
    const before = Array.from(geometry.getAttribute('skinIndex').array);
    Reactor3D.applyModelRig(root, rigWithHands());
    assert.equal(root.userData.rigged, true);
    assert.equal(mesh.skeleton.bones.length, 2 + 10, 'the right hand\'s ten finger joints follow the file\'s bones');
    assert.notEqual(mesh.geometry, geometry, 'the mesh wears a geometry of its own');
    assert.equal(mesh.geometry.getAttribute('position'), geometry.getAttribute('position'), 'that shares the file\'s vertices');
    assert.deepEqual(Array.from(geometry.getAttribute('skinIndex').array), before, 'and the file\'s own skin is as it was, for whatever else draws it');
    assert.equal(hand.children.filter(c => c.userData.__reactorFinger).length, 5);
    assert.ok(Reactor3D._handGrips.get(hand));
    // A second instance of the same geometry shares the worked-out skin.
    const twin = fileModel(false); twin.mesh.geometry = geometry; twin.mesh.bind(twin.mesh.skeleton, twin.mesh.bindMatrix);
    Reactor3D.applyModelRig(twin.root, rigWithHands());
    assert.equal(twin.mesh.geometry.getAttribute('skinIndex'), mesh.geometry.getAttribute('skinIndex'));
    assert.notEqual(twin.mesh.geometry, mesh.geometry, 'each instance has its own geometry to release');
    // Releasing an instance leaves the template's geometry whole.
    const template = new THREE.Group(); template.add(new THREE.Mesh(geometry));
    Reactor3D.releaseModelInstance(root, template);
    assert.ok(geometry.getAttribute('position'), 'the shared vertices survive an instance\'s release');
});

test('a file with finger bones of its own (Mixamo names) is gripped by those bones', () => {
    const { root, mesh, hand, bones } = fileModel(true);
    Reactor3D.applyModelRig(root, rigWithHands());
    assert.equal(mesh.skeleton.bones.length, bones.length, 'no joints are added');
    const grip = Reactor3D._handGrips.get(hand);
    assert.ok(grip && grip.file);
    const index = grip.layout.fingers.find(f => f.finger === 'index');
    assert.deepEqual(index.joints.map(j => j.node.name), ['mixamorig:RightHandIndex1', 'mixamorig:RightHandIndex2', 'mixamorig:RightHandIndex3']);
    const rest = index.joints[0].node.quaternion.clone();
    Reactor3D.HandGrip.hold(hand, null);
    Reactor3D.HandGrip.last = 0;
    Reactor3D.HandGrip.update();
    assert.ok(index.joints[0].node.quaternion.angleTo(rest) > 0.3, 'the file\'s first finger bone turned from where it rested');
    // The turn is about the hinge as the hand sees it, whatever the bone's own frame.
    const delta = index.joints[0].node.quaternion.clone().multiply(rest.clone().invert());
    const axis = new THREE.Vector3(delta.x, delta.y, delta.z).normalize();
    assert.ok(Math.abs(axis.dot(new THREE.Vector3(...index.hinge))) > 0.99);
});

test('a hand closes on what it holds, lets go a moment after, and its wrist turn never builds up', () => {
    const { root, hand } = fileModel(false);
    Reactor3D.applyModelRig(root, rigWithHands());
    const G = Reactor3D.HandGrip, grip = Reactor3D._handGrips.get(hand);
    let clock = 1000; const realNow = G.now; G.now = () => clock;
    try {
        // A handle as a held model: a thin box along z, at the fingers.
        const thing = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 0.3, 2, 2, 20));
        const world = hand.localToWorld(new THREE.Vector3(0.035, -0.125, 0));
        thing.position.copy(world); thing.updateMatrixWorld(true);
        const cloud = Reactor3D.heldCloud(thing);
        assert.ok(cloud.count > 200, 'the thing\'s surface is covered in points, large triangles included');
        assert.equal(Reactor3D.heldCloud(thing), cloud, 'worked out once');
        G.hold(hand, thing); G.last = 0; G.update();
        const index = grip.layout.fingers.find(f => f.finger === 'index');
        assert.ok(index.now[0] > 0.15, 'the index finger closed on it');
        assert.ok(index.joints[0].node.quaternion.w < 0.999);
        const solved = Array.from(grip.solved);
        // Held the same way: not solved again (the answer is the same object, untouched).
        grip.solved[0] = 123; G.hold(hand, thing); assert.equal(grip.solved[0], 123); grip.solved.set(solved);
        // Moved in the hand: solved again.
        thing.position.x += 0.01; thing.updateMatrixWorld(true); G.hold(hand, thing);
        assert.notEqual(Array.from(grip.solved).join(), solved.join());
        // A frame at a time it eases; left alone it opens and the hand is forgotten.
        clock += 16; G.hold(hand, thing); G.update();
        clock += 400; G.update();
        assert.ok(grip.layout.fingers.every(f => f.now[0] === 0 && f.now[1] === 0), 'open again once nothing is held');
        assert.equal(G.hands.has(grip), false);
        assert.ok(index.joints[0].node.quaternion.w > 0.99999);
        // The wrist's turn: put on, taken off before it is put on again.
        // (A handle lying along the fingers, which no hand can close on as it is.)
        const rest = hand.quaternion.clone();
        const along = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.3, 0.024, 2, 20, 2));
        along.position.copy(world); along.updateMatrixWorld(true);
        G.hold(hand, along);
        clock += 500; G.turn(hand, along);
        const once = hand.quaternion.clone();
        assert.ok(once.angleTo(rest) > 0.05 && once.angleTo(rest) <= G.TURN_MAX + 1e-6, 'the wrist turns toward the handle, within its limit');
        G.turn(hand, along); G.turn(hand, along);
        assert.ok(hand.quaternion.angleTo(once) < 1e-6, 'turning again does not add to it');
        const posed = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
        hand.quaternion.copy(posed);
        clock += 500; G.turn(hand, along);
        assert.ok(G.unturned(hand, hand.getWorldQuaternion(new THREE.Quaternion())).angleTo(hand.parent.getWorldQuaternion(new THREE.Quaternion()).multiply(posed)) < 1e-5, 'a pose written over it is the new footing, and can be read back without the turn');
        clock += 1000; G.update(); clock += 1000; G.update();
        assert.ok(hand.quaternion.angleTo(posed) < 1e-5, 'let go, the wrist is back where its pose left it');
    } finally { G.now = realNow; }
});

test('a finger is the surface that grows from its tip: a curled, thick finger is all its own, and fused fingers turn as one', () => {
    // Two fingers as square tubes down -y from y=-0.10 to -0.16, joined to a palm strip; then the same two fused by a web along their length.
    const build = fused => {
        const positions = [], index = [];
        const ring = (cx, y) => { const at = positions.length / 3; for (const [dx, dz] of [[-0.008, -0.008], [0.008, -0.008], [0.008, 0.008], [-0.008, 0.008]]) positions.push(dx, y, cx + dz); return at; };
        const tube = cx => { const rings = []; for (let k = 0; k <= 12; k++) rings.push(ring(cx, -0.10 - k * 0.005)); for (let k = 0; k < 12; k++) for (let s = 0; s < 4; s++) { const a = rings[k] + s, b = rings[k] + (s + 1) % 4, c = rings[k + 1] + s, d = rings[k + 1] + (s + 1) % 4; index.push(a, b, c, b, d, c); } return rings; };
        const one = tube(0.03), two = tube(0.01);
        // The palm: a strip joining the two bases.
        const p0 = positions.length / 3; positions.push(0, -0.05, 0.04, 0, -0.05, 0, 0, -0.09, 0.04, 0, -0.09, 0);
        index.push(p0, p0 + 1, p0 + 2, p0 + 1, p0 + 3, p0 + 2, p0 + 2, one[0], one[0] + 1, p0 + 3, two[0], two[0] + 1, p0 + 2, p0 + 3, one[0], p0 + 3, two[0], one[0]);
        if (fused) for (let k = 0; k < 12; k++) index.push(one[k], two[k] + 2, one[k + 1], two[k] + 2, two[k + 1] + 2, one[k + 1], one[k] + 1, two[k] + 3, one[k + 1] + 1, two[k] + 3, two[k + 1] + 3, one[k + 1] + 1);
        return { positions: Float32Array.from(positions), index };
    };
    const fingers = [{ base: [0, -0.10, 0.03], tip: [0, -0.16, 0.03], length: 0.06, radius: 0.004, thumb: false, one: 1, two: 2 }, { base: [0, -0.10, 0.01], tip: [0, -0.16, 0.01], length: 0.06, radius: 0.004, thumb: false, one: 3, two: 4 }];
    const run = fused => {
        const { positions, index } = build(fused), count = positions.length / 3;
        const position = { getX: i => positions[i * 3], getY: i => positions[i * 3 + 1], getZ: i => positions[i * 3 + 2] };
        const hand = { index: 0, toHand: new THREE.Matrix4().elements, fingers };
        const skin = Reactor3D.fingerSkinWeights(count, position, () => 0, (i, c) => (c === 0 ? 1 : 0), [hand], { count: index.length, getX: k => index[k] });
        const share = (i, b) => { let w = 0; for (let c = 0; c < 4; c++) if (skin.index[i * 4 + c] === b) w += skin.weight[i * 4 + c]; return w; };
        return { hand, share, count };
    };
    const apart = run(false);
    assert.equal(apart.hand.mitt, false);
    // The finger is 0.016 across, four times the 0.004 its markers suggest: every corner of its tip ring still turns with it.
    for (const i of [48, 49, 50, 51]) assert.ok(apart.share(i, 2) > 0.9, 'a corner of the first finger\'s tip is the first finger\'s second joint\'s');
    for (const i of [100, 101, 102, 103]) assert.ok(apart.share(i, 4) > 0.9 && apart.share(i, 2) === 0, 'and the second finger\'s tip is its own, none of its neighbour\'s');
    assert.ok(apart.share(104, 0) > 0.99, 'the palm stays the hand\'s');
    const fused = run(true);
    assert.equal(fused.hand.mitt, true, 'fingers joined along their length are one mitt');
    assert.ok(fused.share(48, 4) + fused.share(48, 3) > 0.9 || fused.share(48, 2) + fused.share(48, 1) > 0.9);
    const carrier = fused.share(48, 2) > 0.5 ? 2 : 4;
    assert.ok(fused.share(100, carrier) > 0.5, 'both fingers\' tips turn on the same joint');
});

test('what a fist closes on: a sword by its handle, a pistol by the grip that hangs under its barrel', () => {
    const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, 6, 6, 2); g.translate(x, y, z); return new THREE.Mesh(g); };
    const sword = new THREE.Group(); sword.add(box(0.02, 0.2, 0.02, 0, 0.1, 0), box(0.14, 0.02, 0.03, 0, 0.21, 0), box(0.05, 0.8, 0.01, 0, 0.62, 0));
    sword.updateMatrixWorld(true);
    const blade = Reactor3D.heldShape(sword);
    assert.equal(blade.handle, null, 'a guard reaches both ways: it is no grip');
    assert.ok(Math.abs(blade.gripRadius - 0.0141) < 0.004, 'the handle is as thick as its narrowest slice');
    const pistol = new THREE.Group(); pistol.add(box(0.5, 0.06, 0.04, 0, 0, 0), box(0.07, 0.2, 0.04, -0.2, -0.12, 0));
    pistol.updateMatrixWorld(true);
    const gun = Reactor3D.heldShape(pistol);
    assert.ok(gun.handle, 'the hanging grip is found');
    assert.ok(gun.handle.at[0] < -0.12 && gun.handle.at[1] < -0.05, 'at the rear, under the barrel');
    assert.ok(gun.down[1] < -0.9, 'and down is the way it hangs');
    assert.ok(gun.axis[0] > 0.9, 'the muzzle is the far end');
});

test('the fist hold places a thing in the hand\'s own frame; steps saved before it keep the older hold', () => {
    const B = require(path.join(repoRoot, 'editor', 'src', 'battle', 'BattleData.js'));
    assert.equal(B.step('weapon', { attachment: 'rightHand' }).hold, 'fist', 'a new Show step holds in the fist');
    assert.equal(B.step('weapon', { mode: 'move' }).hold, 'hand', 'a Move step says nothing of its own');
    assert.equal(B.step('weapon', { visible: false }).hold, 'hand');
    assert.equal({ ...B.commandDefaults('weapon'), attachment: 'rightHand' }.hold, 'hand', 'a saved step without the field is read as the older hold');
    assert.deepEqual([B.heldPlacement({ x: 1, y: 2, z: 3 }, 0, { x: 0.1, y: 0.2, z: 0.3 }, null)].map(p => [p.offsetX, p.offsetY, p.offsetZ])[0], [0.1, 0.2, 0.3]);
    assert.equal(require('node:fs').readFileSync(path.join(repoRoot, 'editor', 'src', 'battle', 'BattleData.js'), 'utf8'), require('node:fs').readFileSync(path.join(repoRoot, 'runtime', 'reactor_battle_data.js'), 'utf8'), 'the editor and the game read one BattleData');
    // In the hand's frame: the handle along the knuckles, the blade out by the thumb, wherever the hand is turned.
    const { root, hand } = fileModel(false);
    Reactor3D.applyModelRig(root, rigWithHands());
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.6, 0.02, 2, 12, 2));
    sword.updateMatrixWorld(true);
    const layout = Reactor3D._handGrips.get(hand).layout;
    for (const turn of [0, 1.1]) {
        hand.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), turn); root.updateMatrixWorld(true);
        const fist = Reactor3D.HandGrip.fistFrame(hand, sword, 0, null), q = hand.getWorldQuaternion(new THREE.Quaternion());
        const across = new THREE.Vector3(...layout.across).applyQuaternion(q), along = new THREE.Vector3(...layout.along).applyQuaternion(q);
        assert.ok(fist.forward.dot(across) < -0.999, 'the long axis runs along the knuckles, tip to the thumb\'s side');
        assert.ok(fist.up.dot(along) > 0.999, 'its broad way along the hand');
        const inHand = hand.worldToLocal(fist.position.clone()), k = new THREE.Vector3(...layout.knuckles);
        assert.ok(inHand.clone().sub(k).dot(new THREE.Vector3(...layout.normal)) > 0, 'on the palm\'s side of the hand');
        assert.ok(inHand.distanceTo(k) < layout.radius * 6, 'at the knuckles, however the hand is turned');
    }
    assert.equal(Reactor3D.HandGrip.fistFrame(null, sword, 0, null), null);
});

test('a gun\'s grip is the hanging part nearest the stock end that is not the stock; a finger that touches first stops there', () => {
    const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, 8, 6, 2); g.translate(x, y, z); return new THREE.Mesh(g); };
    const shapeOf = parts => { const group = new THREE.Group(); group.add(...parts); group.updateMatrixWorld(true); return Reactor3D.heldShape(group); };
    // A rifle along x, muzzle at +x: a stock hanging at the rear end, a grip behind the middle, a deeper magazine ahead of it.
    const rifle = shapeOf([box(1, 0.06, 0.05, 0, 0, 0), box(0.12, 0.14, 0.05, -0.44, -0.07, 0), box(0.06, 0.16, 0.05, -0.2, -0.1, 0), box(0.08, 0.26, 0.05, 0.02, -0.15, 0)]);
    assert.ok(rifle.handle, 'a grip is found');
    assert.ok(Math.abs(rifle.handle.at[0] - -0.2) < 0.06, `the grip, not the stock at the end nor the deeper magazine (${rifle.handle.at[0].toFixed(2)})`);
    // The same with no stock: still the grip, the hanging part nearest the rear.
    const carbine = shapeOf([box(1, 0.06, 0.05, 0, 0, 0), box(0.06, 0.16, 0.05, -0.2, -0.1, 0), box(0.08, 0.26, 0.05, 0.02, -0.15, 0)]);
    assert.ok(Math.abs(carbine.handle.at[0] - -0.2) < 0.06, `a barrel with a magazine and a grip: the grip (${carbine.handle.at[0].toFixed(2)})`);
    // A pistol: the grip is at the rear end itself, the only hanging part.
    const pistol = shapeOf([box(0.5, 0.06, 0.04, 0, 0, 0), box(0.07, 0.2, 0.04, -0.2, -0.12, 0)]);
    assert.ok(pistol.handle && pistol.handle.at[0] < -0.12, 'a barrel with a grip only: that grip');
    // A sword's guard reaches both ways.
    assert.equal(shapeOf([box(0.02, 0.2, 0.02, 0, 0.1, 0), box(0.14, 0.02, 0.03, 0, 0.21, 0), box(0.05, 0.8, 0.01, 0, 0.62, 0)]).handle, null, 'a sword with a guard has no grip of that kind');
    // A handle lying over one finger only: that finger stops on it, the others close on past it, none goes through.
    const layout = Reactor3D.handGripLayout(handPoints(), 'Right', null), out = new Float32Array(10);
    const pinky = layout.fingers.findIndex(f => f.finger === 'pinky'), index = layout.fingers.findIndex(f => f.finger === 'index');
    const stub = handle([0.02, -0.125, -0.03], [1, 0, 0], 0.006, 0.02, 0.002);
    Reactor3D.solveGrip(layout, stub, stub.length / 3, 0.001, out);
    assert.ok(out[pinky * 2] < out[index * 2] - 0.5, `the little finger stops where it touches (${out[pinky * 2].toFixed(2)} against ${out[index * 2].toFixed(2)})`);
    assert.ok(out[index * 2] > layout.fingers[index].max1 - 0.15, 'the index finger, with nothing in its way, closes');
});

/** Put a held thing where a fist frame says: its long axis and its up as the frame gives them, its hold point on the frame's point. */
function placeInFist(object, fist) {
    const shape = Reactor3D.heldShape(object), la = new THREE.Vector3(...shape.axis), lu = new THREE.Vector3(...shape.up);
    lu.addScaledVector(la, -lu.dot(la)).normalize();
    const world = new THREE.Matrix4().makeBasis(fist.forward, fist.up, new THREE.Vector3().crossVectors(fist.forward, fist.up));
    const local = new THREE.Matrix4().makeBasis(la, lu, new THREE.Vector3().crossVectors(la, lu));
    object.quaternion.setFromRotationMatrix(world.multiply(local.transpose()));
    object.position.set(0, 0, 0); object.updateMatrixWorld(true);
    object.position.copy(fist.position).sub(new THREE.Vector3(...fist.local).applyMatrix4(object.matrixWorld)); object.updateMatrixWorld(true);
}
const heldBox = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d, 8, 6, 2); g.translate(x, y, z); return new THREE.Mesh(g); };
const heldGroup = parts => { const group = new THREE.Group(); group.add(...parts); group.updateMatrixWorld(true); return group; };

test('a gun in the fist: barrel along the hand, palm on the grip\'s side, fingers round its front strap under the frame', () => {
    const { root, hand } = fileModel(false);
    Reactor3D.applyModelRig(root, rigWithHands());
    root.updateMatrixWorld(true);
    const grip = Reactor3D._handGrips.get(hand), L = grip.layout, G = Reactor3D.HandGrip;
    const q = hand.getWorldQuaternion(new THREE.Quaternion()), A = new THREE.Vector3(...L.along).applyQuaternion(q), C = new THREE.Vector3(...L.across).applyQuaternion(q), N = new THREE.Vector3(...L.normal).applyQuaternion(q);
    // A pistol along x, muzzle at +x: a barrel, a grip under its rear, a trigger guard ahead of the grip.
    const pistol = heldGroup([heldBox(0.5, 0.06, 0.04, 0, 0, 0), heldBox(0.07, 0.2, 0.04, -0.2, -0.12, 0), heldBox(0.08, 0.012, 0.01, -0.125, -0.07, 0)]);
    const fist = G.fistFrame(hand, pistol, 0, null);
    assert.ok(fist.byGrip && fist.forward.dot(A) > 0.999, 'the barrel points the way the hand does');
    assert.ok(fist.up.dot(C) < -0.999, 'and the grip hangs toward the little finger');
    // The point put behind the knuckles is the front strap, right under the trigger guard: not the frame, not the grip's middle.
    assert.ok(Math.abs(fist.local[0] - -0.165) < 0.012, `the front strap (${fist.local[0].toFixed(3)})`);
    assert.ok(Math.abs(fist.local[1] - -0.076) < 0.012, `under the trigger guard (${fist.local[1].toFixed(3)})`);
    const k = hand.localToWorld(new THREE.Vector3(...L.knuckles)), at = fist.position.clone().sub(k);
    assert.ok(Math.abs(at.dot(A) + L.radius) < 0.004, 'the front strap sits a finger\'s thickness behind the knuckles');
    assert.ok(Math.abs(at.dot(N) - (L.radius + 0.02)) < 0.006, 'and the grip\'s middle half its thickness off the palm: the side panel lies on the palm');
    assert.ok(fist.aim && !fist.aim.shoulder && fist.aim.down < 0, 'a pistol is held out, its barrel above the wrist');
    placeInFist(pistol, fist);
    G.hold(hand, pistol, true);
    const tipOf = name => {
        const i = L.fingers.findIndex(f => f.finger === name), f = L.fingers[i], S = Reactor3D._gripScratch;
        S.f = f; for (let n = 0; n < 3; n++) { S.v1[n] = f.mid[n] - f.base[n]; S.v2[n] = f.tip[n] - f.mid[n]; }
        Reactor3D._gripPlace(S, grip.solved[i * 2], grip.solved[i * 2 + 1]);
        return { one: grip.solved[i * 2], two: grip.solved[i * 2 + 1], tip: hand.localToWorld(new THREE.Vector3(S.s[9], S.s[10], S.s[11])).sub(k) };
    };
    const middle = tipOf('middle'), index = tipOf('index');
    assert.ok(middle.one > 0.5, `the middle finger closes (${middle.one.toFixed(2)})`);
    assert.ok(middle.tip.dot(N) > L.radius + 0.02 && middle.tip.dot(A) < L.radius * 2, 'round the front of the grip and on toward its far side, not along the frame');
    assert.ok(index.one === 0 && index.two === 0, 'the trigger finger stays straight along the frame');
    // A rifle with a straight stock and no grip of its own: the hand takes the wrist of the stock, just ahead of the butt.
    const rifle = heldGroup([heldBox(1, 0.05, 0.05, 0, 0, 0), heldBox(0.25, 0.14, 0.05, -0.375, -0.06, 0)]);
    const stock = Reactor3D.heldShape(rifle);
    assert.ok(stock.handle && stock.handle.stock, 'the stock\'s wrist stands in for a grip');
    assert.ok(stock.handle.at[0] > -0.25 && stock.handle.at[0] < -0.15, `just ahead of the butt (${stock.handle.at[0].toFixed(2)})`);
    const wrist = G.fistFrame(hand, rifle, 0, null);
    assert.ok(wrist.forward.dot(A) > 0.999 && wrist.aim.shoulder, 'barrel along the hand, the butt for the shoulder');
    assert.ok(Math.abs(wrist.local[1] - -0.025) < 0.01, 'the fingers go under the stock there');
    // A sword is not taken for either.
    assert.equal(Reactor3D.heldShape(heldGroup([heldBox(0.02, 0.2, 0.02, 0, 0.1, 0), heldBox(0.14, 0.02, 0.03, 0, 0.21, 0), heldBox(0.05, 0.8, 0.01, 0, 0.62, 0)])).handle, null);
});

test('a held thing\'s own markers win over its shape: a gun\'s grip, barrel line, trigger and stock; a blade\'s handle, tip and edge', () => {
    assert.equal(Reactor3D.readHeldRig({ rig: { template: 'humanoid', markers: { gripTop: [0, 0, 0] } } }), null, 'a character\'s rig is not one');
    assert.equal(Reactor3D.readHeldRig({ rig: { template: 'gun', markers: { gripTop: [0, 0, 0], gripBottom: [0, -1, 0], muzzle: [1, 0, 0] } } }), null, 'nor a gun with no rear to its barrel');
    // The grip is marked on the forward hanging part, which the shape alone reads as a magazine.
    const parts = () => [heldBox(1, 0.06, 0.05, 0, 0, 0), heldBox(0.12, 0.14, 0.05, -0.44, -0.07, 0), heldBox(0.06, 0.16, 0.05, -0.2, -0.1, 0), heldBox(0.08, 0.26, 0.05, 0.02, -0.15, 0)];
    const plain = Reactor3D.heldShape(heldGroup(parts()));
    assert.ok(Math.abs(plain.handle.at[0] - -0.2) < 0.06 && !plain.marks);
    const rifle = heldGroup(parts());
    rifle.userData.__heldRig = Reactor3D.readHeldRig({ rig: { template: 'gun', markers: {
        gripTop: [0.02, -0.03, 0], gripBottom: [0.02, -0.28, 0], trigger: [0.1, -0.05, 0.02], muzzle: [0.5, 0.01, 0], rear: [-0.1, 0.01, 0], foreGrip: [0.3, -0.03, 0], stock: [-0.5, -0.05, 0]
    } } });
    const gun = Reactor3D.heldShape(rifle);
    assert.ok(gun.axis[0] > 0.999 && gun.down[1] < -0.999, 'the barrel runs Rear to Muzzle, the grip hangs from Grip top to Grip bottom');
    assert.ok(Math.abs(gun.handle.at[0] - 0.02) < 1e-6 && Math.abs(gun.handle.under - 0.04) < 1e-6 && Math.abs(gun.handle.deep - 0.29) < 1e-6, 'the grip is where it is marked');
    assert.ok(Math.abs(gun.base[0] - -0.5) < 1e-6 && Math.abs(gun.length - 1) < 1e-6, 'a stock well behind the rear is the butt: the length runs from it to the muzzle');
    assert.deepEqual([gun.marks.trigger, gun.marks.foreGrip, gun.marks.stock], [[0.1, -0.05, 0.02], [0.3, -0.03, 0], [-0.5, -0.05, 0]]);
    const tip = [0, 1, 2].map(i => gun.base[i] + gun.axis[i] * gun.length);
    assert.ok(Math.abs(tip[0] - 0.5) < 1e-6 && Math.abs(tip[1] - 0.01) < 1e-6, 'a shot leaves from the muzzle');
    const pistol = heldGroup([heldBox(0.5, 0.06, 0.04, 0, 0, 0), heldBox(0.07, 0.2, 0.04, -0.2, -0.12, 0)]);
    pistol.userData.__heldRig = { template: 'gun', markers: { gripTop: [-0.2, -0.03, 0], gripBottom: [-0.2, -0.22, 0], muzzle: [0.25, 0, 0], rear: [-0.25, 0, 0], stock: [-0.24, 0, 0] } };
    assert.equal(Reactor3D.heldShape(pistol).marks.stock, null, 'a stock left at the rear is no stock: a pistol');
    // The fist takes the marked grip: its front strap just under the marked top.
    const { root, hand } = fileModel(false);
    Reactor3D.applyModelRig(root, rigWithHands());
    root.updateMatrixWorld(true);
    const fist = Reactor3D.HandGrip.fistFrame(hand, rifle, 0, null);
    assert.ok(Math.abs(fist.local[0] - 0.06) < 0.012 && Math.abs(fist.local[1] - -0.03) < 0.012, `the marked grip's front strap, at its top (${fist.local[0].toFixed(3)}, ${fist.local[1].toFixed(3)})`);
    assert.ok(fist.aim.shoulder && Math.abs(fist.aim.butt - 0.56) < 0.012, 'the butt is that far behind the fingers, and goes to the shoulder');
    // A blade: handle from Grip bottom to Grip top, out to Tip; Edge off the line turns the edge, on it says nothing.
    const sword = () => heldGroup([heldBox(0.02, 0.2, 0.02, 0, 0.1, 0), heldBox(0.14, 0.02, 0.03, 0, 0.21, 0), heldBox(0.05, 0.8, 0.01, 0, 0.62, 0)]);
    const marked = sword(), markers = { gripBottom: [0, 0.02, 0], gripTop: [0, 0.2, 0], tip: [0, 1.02, 0], edge: [-0.025, 0.6, 0] };
    marked.userData.__heldRig = Reactor3D.readHeldRig({ rig: { template: 'blade', markers } });
    const blade = Reactor3D.heldShape(marked);
    assert.ok(blade.axis[1] > 0.999 && Math.abs(blade.length - 1) < 1e-6 && Math.abs(blade.grip - 0.09) < 1e-6 && blade.handle === null);
    assert.ok(blade.up[0] < -0.999, 'the edge faces where Edge stands off the blade');
    assert.ok(Math.abs(blade.gripRadius - 0.0115) < 0.004, 'the handle is as thick as its surface between the markers');
    const onLine = sword();
    onLine.userData.__heldRig = { template: 'blade', markers: { ...markers, edge: [0, 0.6, 0] } };
    const kept = Reactor3D.heldShape(onLine), read = Reactor3D.heldShape(sword());
    assert.ok(Math.abs(kept.up[0] - read.up[0]) < 1e-6 && Math.abs(kept.up[2] - read.up[2]) < 1e-6, 'an Edge left on the blade\'s line is ignored');
    // The fist sits with its index finger at Grip top.
    const L = Reactor3D._handGrips.get(hand).layout, half = (0.06 / 2 + L.radius);
    const held = Reactor3D.HandGrip.fistFrame(hand, marked, 0, null);
    assert.ok(Math.abs(held.local[1] - (0.2 - half)) < 0.005, `the fist's middle is half a fist below Grip top (${held.local[1].toFixed(3)})`);
    // Starting markers come from the shape, one for every marker the editor offers; the editor's templates carry no bones.
    const Rigger = require(path.join(repoRoot, 'editor', 'src', 'database', 'ModelRigger.js'));
    for (const [template, thing] of [['blade', sword()], ['gun', heldGroup(parts())]]) {
        const start = Reactor3D.heldMarkerDefaults(thing, template), keys = Rigger.markersFor(template).map(marker => marker.key);
        assert.deepEqual(Object.keys(start).sort(), keys.slice().sort(), `${template}: a start for each marker`);
        assert.ok(Reactor3D.HELD_RIGS[template].every(key => keys.includes(key)));
        assert.ok(Reactor3D.readHeldRig({ rig: { template, markers: start } }), 'and they read back as a rig');
        assert.equal(Rigger.templates().find(entry => entry.id === template).bones, false);
        assert.deepEqual(Rigger.bonesFromMarkers(start, template), []);
        assert.ok(Rigger.previewLinks(start, template).length >= 2, 'the chain is drawn through the markers');
        assert.deepEqual(Object.keys(Rigger.defaultMarkers({ x: 0.2, y: 1, z: 0.1 }, template)).sort(), keys.slice().sort());
    }
    const start = Reactor3D.heldMarkerDefaults(heldGroup(parts()), 'gun');
    assert.ok(Math.abs(start.gripTop[0] - -0.2) < 0.06 && start.muzzle[0] > 0.49 && start.stock[0] < -0.45 && start.rear[0] > start.stock[0] + 0.1, 'a long gun starts with its grip, muzzle and butt found');
    assert.equal(Rigger.templates().find(entry => entry.id === 'humanoid').bones, true);
});

test('finger markers placed by hand: a tip off the skin or nearer a neighbour still finds its own finger, and an end bone\'s skin is the hand\'s', () => {
    // Two fingers as square tubes down -y from y=-0.10 to -0.16 (z 0.03 and 0.01), joined to a palm strip.
    const positions = [], index = [];
    const ring = (cx, y) => { const at = positions.length / 3; for (const [dx, dz] of [[-0.008, -0.008], [0.008, -0.008], [0.008, 0.008], [-0.008, 0.008]]) positions.push(dx, y, cx + dz); return at; };
    const tube = cx => { const rings = []; for (let k = 0; k <= 12; k++) rings.push(ring(cx, -0.10 - k * 0.005)); for (let k = 0; k < 12; k++) for (let s = 0; s < 4; s++) { const a = rings[k] + s, b = rings[k] + (s + 1) % 4, c = rings[k + 1] + s, d = rings[k + 1] + (s + 1) % 4; index.push(a, b, c, b, d, c); } return rings; };
    const one = tube(0.03), two = tube(0.01), p0 = positions.length / 3;
    positions.push(0, -0.05, 0.04, 0, -0.05, 0, 0, -0.09, 0.04, 0, -0.09, 0);
    index.push(p0, p0 + 1, p0 + 2, p0 + 1, p0 + 3, p0 + 2, p0 + 2, one[0], one[0] + 1, p0 + 3, two[0], two[0] + 1, p0 + 2, p0 + 3, one[0], p0 + 3, two[0], one[0]);
    const count = positions.length / 3, position = { getX: i => positions[i * 3], getY: i => positions[i * 3 + 1], getZ: i => positions[i * 3 + 2] };
    const run = (tipOne, tipTwo, bone = () => 0, ends) => {
        const finger = (base, tip, a, b) => ({ base, tip, length: Math.hypot(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]), radius: 0.004, thumb: false, one: a, two: b });
        const hand = { index: 0, ends, toHand: new THREE.Matrix4().elements, fingers: [finger([0, -0.10, 0.03], tipOne, 1, 2), finger([0, -0.10, 0.01], tipTwo, 3, 4)] };
        const skin = Reactor3D.fingerSkinWeights(count, position, bone, (i, c) => (c === 0 ? 1 : 0), [hand], { count: index.length, getX: k => index[k] });
        return (i, ...bones) => { let w = 0; for (let c = 0; c < 4; c++) if (bones.includes(skin.index[i * 4 + c])) w += skin.weight[i * 4 + c]; return w; };
    };
    const tips = share => [[48, 49, 50, 51].every(i => share(i, 1, 2) > 0.9 && share(i, 3, 4) === 0), [100, 101, 102, 103].every(i => share(i, 3, 4) > 0.9 && share(i, 1, 2) === 0)];
    assert.deepEqual(tips(run([0, -0.16, 0.03], [0, -0.16, 0.01])), [true, true], 'markers in the fingertips: each finger its own');
    // The first finger's tip marker floats five finger-thicknesses past its skin; the second's stands nearer the first finger's tip than its own.
    assert.deepEqual(tips(run([0, -0.18, 0.03], [0, -0.16, 0.01])), [true, true], 'a tip marker off the end of the finger still starts that finger');
    assert.deepEqual(tips(run([0, -0.16, 0.03], [0, -0.16, 0.021])), [true, true], 'a tip marker nearer the neighbour\'s fingertip starts from its own finger\'s skin');
    const palm = run([0, -0.18, 0.03], [0, -0.16, 0.021]);
    assert.ok(palm(104, 0) > 0.99, 'and the palm stays the hand\'s');
    // A tip marker a hand's width away from any skin along its line starts nothing: that finger stays with the hand.
    const lost = run([0.2, -0.16, 0.03], [0, -0.16, 0.01]);
    assert.ok([48, 49, 50, 51].every(i => lost(i, 0) > 0.99), 'a marker far off the hand takes no skin');
    // The file's end bone (bone 9) carries the first finger's last rings: counted as the hand's, they go to the finger.
    const ended = run([0, -0.16, 0.03], [0, -0.16, 0.01], i => (i >= 40 && i < 52 ? 9 : 0), [9]);
    assert.ok([48, 49, 50, 51].every(i => ended(i, 1, 2) > 0.9 && ended(i, 9) === 0), 'an end bone\'s fingertip turns with the finger');
    const left = run([0, -0.16, 0.03], [0, -0.16, 0.01], i => (i >= 40 && i < 52 ? 9 : 0), undefined);
    assert.ok([48, 49, 50, 51].every(i => left(i, 9) > 0.99), 'a bone that is not the hand\'s end keeps its skin');
});
