const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const Database3DEditor = require(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'));

test('carved part definitions validate and default like the other sidecar shapes', () => {
    const parts = Reactor3D.readModelParts({
        parts: [
            { name: 'jaw', pivot: [5, 0.5, 'x'], meshes: { 0: [[1, 2], [-3, 2], [4, 0]] } },
            { name: 'no-triangles', meshes: { 0: [] } },
            { name: 'bad-mesh-key', meshes: { '-1': [[0, 1]], 'x': [[0, 1]] } },
            { meshes: { 0: [[0, 1]] } },
            null
        ]
    });
    assert.equal(parts.length, 1, 'only a named part with real triangle runs survives');
    assert.equal(parts[0].name, 'jaw');
    assert.deepEqual(parts[0].pivot, [5, 0.5, 0], 'a malformed pivot component zeroes');
    assert.deepEqual(parts[0].meshes, { 0: [[1, 2]] }, 'negative and empty runs drop');
    assert.equal(Reactor3D.readModelParts(null).length, 0);
    assert.equal(Reactor3D.readModelParts({}).length, 0);
});

test('triangle runs compress and expand losslessly', () => {
    const ids = [7, 3, 4, 5, 9, 3, 4];
    const ranges = Reactor3D.compressTriRanges(ids);
    assert.deepEqual(ranges, [[3, 3], [7, 1], [9, 1]], 'duplicates collapse, runs merge');
    assert.deepEqual(Reactor3D.expandTriRanges(ranges), [3, 4, 5, 7, 9]);
    assert.deepEqual(Reactor3D.compressTriRanges([]), []);
    assert.deepEqual(Reactor3D.expandTriRanges([]), []);
});

test('the carve partition groups overlaps as nested parts and keeps the rest', () => {
    const defs = [
        { part: { name: 'turret' }, ranges: [[0, 2], [5, 10]] },
        { part: { name: 'cannon' }, ranges: [[1, 2]] }
    ];
    const { remainder, groups } = Reactor3D.partitionCarveIndex(6, defs, null);
    // Triangle 1 belongs to BOTH — a cannon selected inside a turret — so
    // it forms its own group carrying both definitions; nothing is stolen.
    assert.equal(groups.length, 3);
    const key = group => group.defs.map(d => d.part.name).join('+');
    const byKey = Object.fromEntries(groups.map(g => [key(g), g.ids]));
    assert.deepEqual(byKey['turret'], [0, 1, 2, 15, 16, 17], 'turret-only triangles (5..14 clamps at 6)');
    assert.deepEqual(byKey['turret+cannon'], [3, 4, 5], 'the overlap keeps both names');
    assert.deepEqual(byKey['cannon'], [6, 7, 8]);
    assert.deepEqual(remainder, [9, 10, 11, 12, 13, 14], 'triangles 3 and 4 stay');
    // Indexed geometry routes through the source index.
    const index = [10, 11, 12, 20, 21, 22];
    const routed = Reactor3D.partitionCarveIndex(2, [{ part: { name: 'a' }, ranges: [[1, 1]] }], n => index[n]);
    assert.deepEqual(routed.groups[0].ids, [20, 21, 22]);
    assert.deepEqual(routed.remainder, [10, 11, 12]);
});

test('a part carved inside another becomes its child in every way that matters', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    // Two triangles in one mesh: tri 0 is turret-only, tri 1 is the
    // cannon selected INSIDE the turret selection — the real tank case
    // that first-definition-wins silently reduced to nothing.
    const object = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        4, 0, 0, 6, 0, 0, 5, 1, 0
    ]), 3));
    object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
    Reactor3D.carveModelParts(object, Reactor3D.readModelParts({
        parts: [
            { name: 'turret', pivot: [0, 0, 0], meshes: { 0: [[0, 2]] } },
            { name: 'cannon', pivot: [5, 0, 0], meshes: { 0: [[1, 1]] } }
        ]
    }));
    const cannon = object.children.find(child => child.name === 'cannon');
    assert.ok(cannon, 'the nested selection carves instead of losing every triangle');
    assert.deepEqual(cannon.userData.parts.map(part => part.name), ['cannon', 'turret'],
        'the piece answers to its own name first, then its parent');
    const turretOnly = object.children.find(child => child.name === 'turret');
    assert.ok(turretOnly, 'the turret keeps its remaining triangles');

    const binding = Reactor3D.prepareModelInstance(object);
    // Turning the turret carries the cannon, about the TURRET pivot.
    const turn = Reactor3D.readModelAnimationRules({
        animations: [{ name: 'turn', part: 'turret', type: 'pose', trigger: 'always', period: 1, rotate: [0, 0, 90] }]
    });
    Reactor3D.applyModelAnimation(binding, turn, { frame: 1, moving: false, distance: 0, scale: 1, action: null });
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    assert.ok(cannon.quaternion.angleTo(quarter) < 1e-6, 'the cannon rides the turret turn');
    assert.ok(turretOnly.quaternion.angleTo(quarter) < 1e-6, 'the turret turns too');
    const origin = new THREE.Vector3(0, 0, 0).applyQuaternion(cannon.quaternion).add(cannon.position);
    assert.ok(origin.length() < 1e-6, 'the shared turn hinges at the turret pivot');
    // Raising the cannon moves ONLY the cannon, about the CANNON pivot.
    const raise = Reactor3D.readModelAnimationRules({
        animations: [{ name: 'raise', part: 'cannon', type: 'pose', trigger: 'always', period: 1, rotate: [0, 0, 45] }]
    });
    binding.angles = {};
    Reactor3D.applyModelAnimation(binding, raise, { frame: 2, moving: false, distance: 0, scale: 1, action: null });
    assert.ok(turretOnly.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, 'the turret stays put');
    assert.ok(cannon.quaternion.angleTo(new THREE.Quaternion()) > 0.5, 'the cannon rises alone');
    const hinge = new THREE.Vector3(5, 0, 0).applyQuaternion(cannon.quaternion).add(cannon.position);
    assert.ok(hinge.distanceTo(new THREE.Vector3(5, 0, 0)) < 1e-6, 'about its own hinge');
});

test('pose rules parse with rotation and move vectors', () => {
    const rules = Reactor3D.readModelAnimationRules({
        animations: [
            { name: 'close-mouth', part: 'jaw', type: 'pose', trigger: 'action', rotate: [0, 0, -25], move: [0, 0.1, 0], period: 30 },
            { name: 'vecless', type: 'pose' }
        ]
    });
    assert.equal(rules[0].type, 'pose');
    assert.deepEqual(rules[0].rotate, [0, 0, -25]);
    assert.deepEqual(rules[0].move, [0, 0.1, 0]);
    assert.deepEqual(rules[0].resize, [1, 1, 1], 'no resize means unit scale');
    assert.deepEqual(rules[1].rotate, [0, 0, 0], 'missing vectors zero out');
    assert.deepEqual(
        Reactor3D.readModelAnimationRules({ animations: [{ type: 'pose', resize: [2, 1, 0.5] }] })[0].resize,
        [2, 1, 0.5]);
    assert.equal(Reactor3D.modelRuleDuration(rules[0]), 60, 'a pose goes there and back');
    assert.equal(Reactor3D.poseEase(0), 0);
    assert.equal(Reactor3D.poseEase(1), 1);
    assert.equal(Reactor3D.poseEase(0.5), 0.5);
    assert.ok(Reactor3D.poseEase(0.25) < 0.25, 'eases in');
    assert.ok(Reactor3D.poseEase(0.75) > 0.75, 'settles out');
});

test('a carved region becomes a mesh of its own and a pose hinges it', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;

    // Two triangles in one anonymous mesh: a "body" near the origin and a
    // "jaw" out at x≈5 — the monster-plant situation in miniature.
    const object = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        4, 0, 0, 6, 0, 0, 5, 1, 0
    ]), 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    object.add(mesh);

    const parts = Reactor3D.readModelParts({
        parts: [{ name: 'jaw', pivot: [5, 0, 0], meshes: { 0: [[1, 1]] } }]
    });
    Reactor3D.carveModelParts(object, parts);

    const jaw = object.children.find(child => child.name === 'jaw');
    assert.ok(jaw, 'the carved region is a sibling mesh');
    assert.deepEqual(Array.from(jaw.geometry.getIndex().array), [3, 4, 5]);
    assert.deepEqual(Array.from(mesh.geometry.getIndex().array), [0, 1, 2], 'the body keeps the rest');
    assert.deepEqual(jaw.userData.parts[0], { name: 'jaw', pivot: [5, 0, 0] });

    // The pose rule closes the mouth about the hinge and holds it there.
    const binding = Reactor3D.prepareModelInstance(object);
    assert.equal(binding.meshes.length, 1, 'only the carved part is rule-driven');
    const rules = Reactor3D.readModelAnimationRules({
        animations: [{ name: 'close', part: 'jaw', type: 'pose', trigger: 'always', period: 1, rotate: [0, 0, 90] }]
    });
    Reactor3D.applyModelAnimation(binding, rules, { frame: 1, moving: false, distance: 0, scale: 1, action: null });
    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    assert.ok(jaw.quaternion.angleTo(quarter) < 1e-6, 'the jaw turned to the authored pose');
    const hinge = new THREE.Vector3(5, 0, 0).applyQuaternion(jaw.quaternion).add(jaw.position);
    assert.ok(hinge.distanceTo(new THREE.Vector3(5, 0, 0)) < 1e-6, 'the hinge stays put');

    // A triggered pose eases in while held and back out when released.
    const eased = Reactor3D.readModelAnimationRules({
        animations: [{ name: 'lean', part: 'jaw', type: 'pose', trigger: 'idle', period: 10, rotate: [0, 0, 90] }]
    });
    binding.angles = {};
    for (let frame = 1; frame <= 10; frame++) {
        Reactor3D.applyModelAnimation(binding, eased, { frame, moving: false, distance: 0, scale: 1, action: null });
    }
    assert.ok(jaw.quaternion.angleTo(quarter) < 1e-6, 'fully posed after one period idle');
    Reactor3D.applyModelAnimation(binding, eased, { frame: 11, moving: true, distance: 1 / 16, scale: 1, action: null });
    const angle = jaw.quaternion.angleTo(new THREE.Quaternion());
    assert.ok(angle > 0.01 && angle < Math.PI / 2 - 0.01, 'movement releases the pose gradually');

    // An action pose goes there and back over period*2, then rests.
    const bite = Reactor3D.readModelAnimationRules({
        animations: [{ name: 'bite', part: 'jaw', type: 'pose', trigger: 'action', period: 10, rotate: [0, 0, 90] }]
    });
    binding.angles = {};
    Reactor3D.applyModelAnimation(binding, bite, { frame: 110, moving: false, distance: 0, scale: 1, action: { name: 'bite', frame: 100 } });
    assert.ok(jaw.quaternion.angleTo(quarter) < 1e-6, 'closed at the top of the arc');
    Reactor3D.applyModelAnimation(binding, bite, { frame: 125, moving: false, distance: 0, scale: 1, action: { name: 'bite', frame: 100 } });
    assert.ok(jaw.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, 'open again past the duration');

    // A resize pose scales the part about its pivot, and rest restores it.
    const swell = Reactor3D.readModelAnimationRules({
        animations: [{ name: 'swell', part: 'jaw', type: 'pose', trigger: 'always', period: 1, resize: [2, 2, 2] }]
    });
    binding.angles = {};
    Reactor3D.applyModelAnimation(binding, swell, { frame: 1, moving: false, distance: 0, scale: 1, action: null });
    assert.ok(Math.abs(jaw.scale.x - 2) < 1e-6, 'the jaw doubled');
    const corner = new THREE.Vector3(6, 0, 0).sub(new THREE.Vector3(5, 0, 0))
        .multiply(jaw.scale).add(new THREE.Vector3(5, 0, 0));
    assert.ok(Math.abs(corner.x - 7) < 1e-6, 'growth radiates from the hinge');
    const pivotWorld = new THREE.Vector3(5, 0, 0).multiply(jaw.scale)
        .applyQuaternion(jaw.quaternion).add(jaw.position);
    assert.ok(pivotWorld.distanceTo(new THREE.Vector3(5, 0, 0)) < 1e-6, 'the pivot itself stays put');
    binding.angles = {};
    Reactor3D.applyModelAnimation(binding, Reactor3D.readModelAnimationRules({
        animations: [{ name: 'noop', part: 'other', type: 'swing' }]
    }), { frame: 3, moving: false, distance: 0, scale: 1, action: null });
    assert.ok(Math.abs(jaw.scale.x - 1) < 1e-6, 'rest restores the base scale');
});

test('a held pose latches until another held pose claims the part', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    const object = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        4, 0, 0, 6, 0, 0, 5, 1, 0
    ]), 3));
    const cannon = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    cannon.userData.parts = [{ name: 'cannon', pivot: [5, 0, 0] }];
    object.add(cannon);
    const binding = Reactor3D.prepareModelInstance(object);
    const rules = Reactor3D.readModelAnimationRules({ animations: [
        { name: 'aim-up', part: 'cannon', type: 'pose', trigger: 'action', period: 10, hold: true, rotate: [0, 0, 90] },
        { name: 'aim-level', part: 'cannon', type: 'pose', trigger: 'action', period: 10, hold: true, rotate: [0, 0, 0] }
    ] });
    assert.equal(rules[0].hold, true);
    assert.equal(Reactor3D.modelRuleDuration(rules[0]), 10, 'a held action only needs the way in');

    const quarter = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    // The action fires and expires; the latch keeps the cannon raised.
    for (let frame = 100; frame < 110; frame++) {
        Reactor3D.applyModelAnimation(binding, rules, { frame, moving: false, distance: 0, scale: 1, action: { name: 'aim-up', frame: 100 } });
    }
    for (let frame = 110; frame < 160; frame++) {
        Reactor3D.applyModelAnimation(binding, rules, { frame, moving: false, distance: 0, scale: 1, action: null });
    }
    assert.ok(cannon.quaternion.angleTo(quarter) < 1e-6, 'the cannon stays aimed long after the action ended');

    // A second held pose on the same part eases the first one home.
    for (let frame = 200; frame < 212; frame++) {
        Reactor3D.applyModelAnimation(binding, rules, { frame, moving: false, distance: 0, scale: 1, action: frame < 210 ? { name: 'aim-level', frame: 200 } : null });
    }
    assert.ok(cannon.quaternion.angleTo(new THREE.Quaternion()) < 1e-6, 'aim-level lowered the cannon');
});

test('the marquee takes every triangle it touches, not only centred ones', () => {
    const touches = Database3DEditor.triangleTouchesRect;
    // A vertex inside the box is enough.
    assert.equal(touches(5, 5, 40, 5, 40, 40, 0, 0, 10, 10), true);
    // A big triangle whose centre lies outside but which covers the box —
    // the case the hand kept losing: the box sat on a jaw plate and took
    // nothing because only centres were tested.
    assert.equal(touches(-100, -50, 100, -50, 0, 150, 40, 20, 60, 40), true);
    // An edge crossing the box with all vertices outside.
    assert.equal(touches(-20, 5, 20, 5, 0, -30, -5, 0, 5, 10), true);
    // Genuinely apart stays apart.
    assert.equal(touches(100, 100, 120, 100, 110, 120, 0, 0, 10, 10), false);
    // Sharing only a numeric neighbourhood but not overlapping.
    assert.equal(touches(11, 11, 30, 11, 20, 30, 0, 0, 10, 10), false);
});

test('occlusion asks the interpolated depth of whatever covers a point', () => {
    const depthAt = Database3DEditor.triangleDepthAt;
    // A flat triangle at z=-2 covering the origin.
    assert.equal(depthAt(-10, -10, -2, 10, -10, -2, 0, 10, -2, 0, 0), -2);
    // Outside the triangle there is no depth.
    assert.equal(depthAt(-10, -10, -2, 10, -10, -2, 0, 10, -2, 50, 50), null);
    // A sloped triangle interpolates between its corners.
    const z = depthAt(0, 0, -1, 10, 0, -3, 0, 10, -3, 5, 0);
    assert.ok(Math.abs(z - (-2)) < 1e-9, 'halfway along the edge is halfway in depth');
    // Degenerate triangles occlude nothing.
    assert.equal(depthAt(0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0), null);
});

test('the card duration slider is logarithmic from a tenth of a second to ten', () => {
    const editor = new Database3DEditor({}, {});
    assert.equal(editor._rawToDuration(0), 6);
    assert.equal(editor._rawToDuration(100), 600);
    for (const frames of [6, 30, 60, 180, 600]) {
        const roundTrip = editor._rawToDuration(editor._durationToRaw(frames));
        assert.ok(Math.abs(roundTrip - frames) / frames < 0.06, `${frames} frames survives the slider`);
    }
    assert.equal(editor._durationLabel(30), '0.50 s');
    assert.equal(editor._durationLabel(600), '10.0 s');
});

test('a carved part keeps the source mesh ancestry so old rules still match', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    const object = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        4, 0, 0, 6, 0, 0, 5, 1, 0
    ]), 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    mesh.userData.parts = [{ name: 'Plant', pivot: [0, 0, 0] }];
    object.add(mesh);
    Reactor3D.carveModelParts(object, Reactor3D.readModelParts({
        parts: [{ name: 'jaw', pivot: [5, 0, 0], meshes: { 0: [[1, 1]] } }]
    }));
    const jaw = object.children.find(child => child.name === 'jaw');
    assert.deepEqual(jaw.userData.parts.map(part => part.name), ['jaw', 'Plant'],
        'a rule aimed at the old named part still drives the carved piece');
});

test('pivot overrides re-hinge any part from a model-space point', () => {
    // Validation mirrors the other sidecar shapes.
    assert.deepEqual(Reactor3D.readModelPivots({ pivots: { turret: [1, 2, 3], bad: [1, 'x', 3], '': [0, 0, 0] } }),
        { turret: [1, 2, 3] });
    assert.deepEqual(Reactor3D.readModelPivots(null), {});
    assert.deepEqual(Reactor3D.readModelPivots({ pivots: [] }), {});

    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    const object = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        4, 0, 0, 6, 0, 0, 5, 1, 0
    ]), 3));
    const turret = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
    turret.name = 'turret';
    // The exporter recorded the centre of mass; the ring is elsewhere.
    turret.userData.parts = [{ name: 'turret', pivot: [5, 0.5, 0] }];
    // The mesh sits offset under the root, so model space must convert.
    turret.position.set(1, 0, 0);
    object.add(turret);
    Reactor3D.applyPivotOverrides(object, Reactor3D.readModelPivots({
        pivots: { turret: [6, 0, 0], somethingElse: [9, 9, 9] }
    }));
    assert.deepEqual(turret.userData.parts[0].pivot, [5, 0, 0],
        'the model-space ring converts into the mesh\'s local space');

    // The pose now hinges about the ring, not the recorded centre.
    const binding = Reactor3D.prepareModelInstance(object);
    const rules = Reactor3D.readModelAnimationRules({
        animations: [{ name: 'aim', part: 'turret', type: 'pose', trigger: 'always', period: 1, rotate: [0, 0, 90] }]
    });
    Reactor3D.applyModelAnimation(binding, rules, { frame: 1, moving: false, distance: 0, scale: 1, action: null });
    const ring = new THREE.Vector3(5, 0, 0).applyQuaternion(turret.quaternion).add(turret.position);
    assert.ok(ring.distanceTo(new THREE.Vector3(6, 0, 0)) < 1e-6, 'the ring stays put under the turn');
});

test('the sidecar write preserves foreign keys and drops an empty parts list', () => {
    const previous = JSON.stringify({
        animations: [{ name: 'old' }],
        parts: [{ name: 'stale', meshes: {} }],
        somebodyElses: { keep: true }
    });
    const merged = JSON.parse(Database3DEditor.mergeSidecar(
        previous,
        [{ name: 'sway', type: 'swing' }],
        [{ name: 'jaw', pivot: [1, 2, 3], meshes: { 0: [[0, 4]] } }]
    ));
    assert.deepEqual(merged.animations, [{ name: 'sway', type: 'swing' }]);
    assert.equal(merged.parts[0].name, 'jaw');
    assert.deepEqual(merged.somebodyElses, { keep: true }, 'unknown keys survive');
    const emptied = JSON.parse(Database3DEditor.mergeSidecar(previous, [], []));
    assert.equal('parts' in emptied, false, 'no parts means no key');
    assert.throws(() => Database3DEditor.mergeSidecar('not json', [], []), /JSON/,
        'malformed existing data is never replaced from an empty object');
    const withPivots = JSON.parse(Database3DEditor.mergeSidecar('{}', [], [], { turret: [1, 2, 3] }));
    assert.deepEqual(withPivots.pivots, { turret: [1, 2, 3] });
    const noPivots = JSON.parse(Database3DEditor.mergeSidecar(
        JSON.stringify({ pivots: { stale: [0, 0, 0] } }), [], [], {}));
    assert.equal('pivots' in noPivots, false, 'an empty override map clears the key');
});

test('model sidecar and rig writes are atomic and preserve malformed model.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-model-sidecar-save-'));
    const modelDir = path.join(root, '3d', 'Hero');
    fs.mkdirSync(modelDir, { recursive: true });
    const modelPath = path.join(modelDir, 'model.json');
    const editor = Object.create(Database3DEditor.prototype);
    editor._project = () => ({ path: root });
    editor.selectedName = 'Hero';
    editor.rawAnimations = [];
    editor.customParts = [];
    editor.customPivots = {};
    editor.rebuildPlayback = () => {};
    editor._detail = { querySelector: () => null };
    editor._t = text => text;

    const previousAtomic = global.RRWriteFileAtomicSync;
    const writeAtomic = require(path.join(repoRoot, 'editor', 'src', 'utils', 'FsAtomic.js'));
    let atomicWrites = 0;
    global.RRWriteFileAtomicSync = (...args) => {
        atomicWrites++;
        return writeAtomic(...args);
    };
    try {
        editor.saveRules();
        assert.equal(atomicWrites, 1, 'model.json uses the shared atomic writer');

        editor.customRig = { template: 'humanoid', weightsFile: 'model.rig.bin' };
        editor._rigBinary = Uint8Array.from([1, 2, 3]).buffer;
        editor.saveRig();
        assert.equal(atomicWrites, 3, 'model.json and model.rig.bin are each atomic');

        fs.writeFileSync(modelPath, '{ malformed');
        assert.throws(() => editor.saveRules(), /JSON/);
        assert.throws(() => editor.saveRig(), /JSON/);
        assert.equal(fs.readFileSync(modelPath, 'utf8'), '{ malformed');
        assert.equal(atomicWrites, 3, 'refused writes never reach the atomic writer');
    } finally {
        if (previousAtomic === undefined) delete global.RRWriteFileAtomicSync;
        else global.RRWriteFileAtomicSync = previousAtomic;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('the pivot is a movable fulcrum on the card and in the viewport', () => {
    const editor = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    // One write path re-hinges live for any part, named or carved.
    assert.match(editor, /_setPivot\(name, pivot\)/);
    assert.match(editor, /r3d-card-pivot\b/);
    assert.match(editor, /r3d-card-pivot-place/);
    // The axes gizmo is grabbable: near it the Pivot tool slides the point
    // in the camera plane; elsewhere a click places it on the surface.
    assert.match(editor, /mode = 'pivotdrag';/);
    assert.match(editor, /_pivotPlanePoint\(/);
    // The card's target dropdown retargets the animation being edited —
    // values intact — and shows a deleted target marked for re-aiming.
    assert.match(editor, /retargetWork\(event\.target\.value\)/);
    assert.match(editor, /this\.partNames\.indexOf\(this\.selectedPartName\) < 0/);
    // A click on the canvas lets an open dropdown dismiss itself.
    assert.match(editor, /active\.tagName === 'SELECT'/);
    // The game applies the same overrides the editor authors.
    const runtime = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(runtime, /Reactor3D\.applyPivotOverrides\(object, Reactor3D\.readModelPivots\(sidecar\)\)/);
});

test('the game sync carves the clone before binding and reads rules from one sidecar', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /Reactor3D\.loadModelSidecar\(spec\.name\)/);
    const carve = source.indexOf('Reactor3D.carveModelParts(object, Reactor3D.readModelParts(sidecar))');
    const bind = source.indexOf('current.binding = Reactor3D.prepareModelInstance(object');
    assert.ok(carve > 0 && bind > carve, 'carve happens before the binding is prepared');
    assert.match(source, /current\.rules = sidecar \? Reactor3D\.readModelAnimationRules\(sidecar\) : \[\]/);
    // A missing model.json is a normal state: on disk it is stat-ed first
    // so no unsuppressible network error reaches the console.
    assert.match(source, /Reactor3D\.loadModelSidecar = function[\s\S]*?fs\.existsSync\(path\.join\(base, url\)\)/);
});

test('the 3D section carries the tool strip, part picking, and the edit card', () => {
    const source = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    // The tool strip stands over the preview: orbit, box select, pivot.
    for (const tool of ['orbit', 'select', 'pivot']) {
        assert.match(source, new RegExp(`id: '${tool}'`), `the ${tool} tool exists`);
    }
    // Parts are picked directly in the viewport: a stationary orbit click
    // selects the part under the pointer, hover highlights it.
    assert.match(source, /_pickPart\(event\)/);
    assert.match(source, /_partUnderPointer\(/);
    assert.match(source, /_updateHover\(\)/);
    // The card never leaves: it docks whenever the model has parts, its
    // header carries a target dropdown (Whole model included), and its ×
    // folds it to a small button instead of losing the controls.
    assert.match(source, /const hasParts = \(this\._binding && this\._binding\.meshes\.length > 0\)/);
    assert.match(source, /r3d-card-part/);
    assert.match(source, /r3d-card-expand/);
    // Every motion type is edited on the card — pose sliders, and swing /
    // spin / bob / clip bodies with axis chips — driven on 'input' so the
    // model moves as the hand does.
    assert.match(source, /\.r3d-card-slider/);
    assert.match(source, /addEventListener\('input', \(\) => applyPose/);
    assert.match(source, /r3d-card-motion/);
    assert.match(source, /r3d-card-axis/);
    for (const cls of ['r3d-card-degrees', 'r3d-card-spinspeed', 'r3d-card-pertile', 'r3d-card-amount', 'r3d-card-clip']) {
        assert.match(source, new RegExp(cls), `the ${cls} control exists`);
    }
    for (const tab of ['rotate', 'offset', 'scale']) {
        assert.match(source, new RegExp(`id: '${tab}'`), `the ${tab} tab exists`);
    }
    // Duration is a slider with a seconds readout; the trigger reads as
    // "Play when"; Preview plays the work exactly as its trigger would.
    assert.match(source, /r3d-card-speed/);
    assert.match(source, /_durationLabel\(work\.period\)/);
    assert.match(source, /previewPose\(\)/);
    assert.match(source, /previewValues\.name = '__preview'/);
    // Selection is drawn against the uncarved mesh so triangle indices
    // count over the source geometry, and rules freeze while selecting.
    assert.match(source, /if \(!this\._selectMode && Reactor3D\.carveModelParts/);
    assert.match(source, /!this\._selectMode && typeof Reactor3D/);
    // The marquee takes every triangle it touches, rejecting behind-camera
    // folds — and by default only what the eye can see: a screen-space
    // depth grid culls covered triangles unless the Through toggle is on.
    assert.match(source, /Database3DEditor\.triangleTouchesRect\(/);
    assert.match(source, /if \(view\.z >= 0\)/, 'behind-camera folds are rejected');
    assert.match(source, /if \(!this\._selectThrough\)/);
    assert.match(source, /Database3DEditor\.triangleDepthAt\(/);
    assert.match(source, /z > pz \+ 0\.008/, 'coplanar neighbours sit inside the epsilon');
    // Marquee mistakes undo: every drag and Clear is one step back, from
    // the select bar's arrow or Ctrl+Z while selecting.
    assert.match(source, /_pushSelectionUndo\(\);/);
    assert.match(source, /selectionUndo\(\)/);
    // The work rides as a synthetic always-on rule. Suppressed rules are
    // swapped for inert stand-ins IN PLACE — blends and latches key by
    // index, and a filtered array once re-keyed every rule and scrambled
    // latched poses — and the sim bar's Play for the rule on the card
    // previews the card's current values instead of a dead slot.
    assert.match(source, /rules = rules\.concat\(\[extra\]\)/);
    assert.match(source, /const off = rule => \(\{ \.\.\.rule, trigger: 'action', hold: false, name: ' ' \}\)/);
    assert.match(source, /if \(index === this\._editingRule\) return off\(rule\);/);
    assert.match(source, /if \(index === this\._editingRule\) \{\s*\n\s*this\.previewPose\(\);/);
    // Preview always plays from rest: it zeroes its own blend slot and
    // releases held copies of the pose first — while the card held the
    // pose at full strength, a held pose had nowhere to go and Preview
    // looked dead. Opening an animation also takes manual control of its
    // latch so nothing pops back up on deselect, and the card's Clear
    // button only zeroes the sliders.
    assert.match(source, /const slot = this\.playRules\.length;/);
    assert.match(source, /this\._releaseLatches\(this\.selectedPartName\);/);
    assert.match(source, /this\._releaseLatches\(rule\.part\);/);
    assert.match(source, /title="\$\{this\._t\('Zero the sliders \(undoable\)'\)\}"/);
    // The pivot gizmo reads through the mesh and drags from any tool; a
    // fresh part never inherits the previous selection session; the
    // highlight boxes track the meshes every frame instead of hanging
    // where a pose once stood.
    assert.match(source, /_pointerNearPivot\(/);
    assert.match(source, /this\._pivotMarker\.material\.depthTest = false;/);
    assert.match(source, /addPart\(\) \{\s*\n\s*if \(this\._selectMode\) this\.cancelSelectMode\(\);/);
    assert.match(source, /_updateBoxes\(\)/);
    // The fulcrum is anchored: the marker re-rides its owning mesh every
    // frame through freshly updated matrices — placed once, it froze at
    // whatever pose the part held and teleported on reselect.
    assert.match(source, /this\._pivotAnchor = \{ mesh: entry\.m\.mesh, pivot: entry\.part\.pivot \}/);
    assert.match(source, /updateWorldMatrix\(true, false\);\s*\n\s*this\._pivotMarker\.position\.copy\(this\._pivotAnchor\.mesh\.localToWorld\(/);
    assert.match(source, /carriers\.find\(pair => pair\.m\.parts\[0\] === pair\.part\)/);
    // Previewing a return-to-rest pose ends at rest: the card's held
    // working pose stands down until the next edit, instead of easing
    // back in and reading as the cannon firing a second time.
    assert.match(source, /this\._workSuppressed \? null : this\._workRule/);
    assert.match(source, /this\._workSuppressed = this\._work\.motion === 'pose' && !this\._work\.hold;/);
    assert.match(source, /_syncWorkRule\(\) \{\s*\n\s*\/\/ Any edit puts the working pose back on stage\.\s*\n\s*this\._workSuppressed = false;/);
    // A part with a saved animation opens it for editing; the + button is
    // the way to give the same part a SECOND animation.
    assert.match(source, /r3d-card-new/);
    assert.match(source, /this\._editingRule = -1;\s*\n\s*this\.selectedRule = -1;\s*\n\s*this\._work\.name = '';/);
    // The Animations list highlight mirrors the card, and anything that
    // puts work on the card un-collapses it; Add starts motionless.
    assert.match(source, /this\.selectedRule = index;\s*\n\s*this\._cardCollapsed = false;/);
    assert.match(source, /this\.selectedRule = this\._editingRule;\s*\n\s*this\.renderRuleList\(\);/);
    assert.match(source, /addRule\(\) \{[\s\S]{0,400}this\._cardCollapsed = false;/);
    assert.doesNotMatch(source, /_work\.motion = 'swing';/, 'Add no longer starts a surprise swing');
    // Releasing a hold also cancels its in-flight action — a long action
    // window otherwise re-latched the pose on the very next frame.
    assert.match(source, /if \(this\._sim\.action && this\._sim\.action\.name === rule\.name\) \{\s*\n\s*this\._sim\.action = null;/);
    assert.match(source, /this\._binding\.latch = \{\};\s*\n\s*\/\/ The in-flight action would re-latch next frame\.\s*\n\s*this\._sim\.action = null;/);
    // Saving updates the rule being edited or creates a new one, and any
    // animation clicked in the list opens straight into the card.
    assert.match(source, /Object\.assign\(this\.rawAnimations\[this\._editingRule\], values\)/);
    assert.match(source, /this\.editRule\(index\)/);
    // Applying a carve flows straight into posing the new part.
    assert.match(source, /this\.selectPartByName\(part\.name\)/);
    // Renaming a part carries its rules along.
    assert.match(source, /if \(raw\.part === oldName\) raw\.part = name;/);
    // Working edits persist per target and reselecting resumes them; a
    // part with exactly one animation opens it for editing.
    assert.match(source, /const saved = this\._poses\[name\]/);
    assert.match(source, /if \(owned\.length === 1\)/);
    // Undo is per target: gestures stash on first input and commit on
    // release, Ctrl+Z / Ctrl+Y drive the trail, Escape releases the card.
    assert.match(source, /_stashUndo\(\)/);
    assert.match(source, /addEventListener\('change', \(\) => this\._commitUndo\(\)\)/);
    assert.match(source, /undoPose\(\)/);
    assert.match(source, /redoPose\(\)/);
    assert.match(source, /event\.key === 'Escape'/);
    // The duration slider is logarithmic and labeled in seconds; the
    // At-the-end control writes the pose's hold flag.
    assert.match(source, /_rawToDuration\(/);
    assert.match(source, /r3d-card-hold/);
    assert.match(source, /values\.trigger === 'action' \? work\.hold : false/);
});

test('the runtime latch lives in the sync path the game runs', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /binding\.latch\[i\] = true;/);
    assert.match(source, /rules\[k\]\.hold\s*\n?\s*&& rules\[k\]\.part === rule\.part/);
    assert.match(source, /hold: keys\.length \? false : !!raw\.hold/);
});

test('selection overlays never join the carve-target numbering', () => {
    // The highlight overlays are children of the real meshes; counting
    // them as carve targets shifted mesh indexes and let a full-canvas
    // marquee report more triangles than the model has.
    const runtime = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(runtime, /!child\.userData\.__reactorOverlay/);
    const editor = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    assert.match(editor, /piece\.userData\.__reactorOverlay = true;/);
});

test('a nested part animates relative to its posed parent, whatever the rule order', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    // Turn the turret, then fire: the recoil must slide along the TURNED
    // barrel. Composition used to follow authoring order, so a fire rule
    // that came first in the array — or a rule being edited on the card,
    // whose working copy rides at the END of the chain — recoiled along
    // the model's original axis, visibly sliding sideways.
    const build = () => {
        const object = new THREE.Group();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
            0, 0, 0, 1, 0, 0, 0, 1, 0,
            4, 0, 0, 6, 0, 0, 5, 1, 0
        ]), 3));
        object.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
        Reactor3D.carveModelParts(object, Reactor3D.readModelParts({ parts: [
            { name: 'turret', pivot: [0, 0, 0], meshes: { 0: [[0, 2]] } },
            { name: 'cannon', pivot: [5, 0, 0], meshes: { 0: [[1, 1]] } }
        ] }));
        const binding = Reactor3D.prepareModelInstance(object);
        const cannon = binding.meshes.find(e => e.parts[0].name === 'cannon').mesh;
        return { object, binding, cannon };
    };
    const recoilDir = animations => {
        const { object, binding, cannon } = build();
        const rules = Reactor3D.readModelAnimationRules({ animations });
        const state = frame => ({ frame, moving: false, distance: 0, scale: 1, action: null });
        Reactor3D.applyModelAnimation(binding, rules.filter(r => r.name !== 'fire'), state(1));
        object.updateMatrixWorld(true);
        const before = cannon.localToWorld(new THREE.Vector3(5, 0, 0));
        Reactor3D.applyModelAnimation(binding, rules, state(2));
        object.updateMatrixWorld(true);
        return cannon.localToWorld(new THREE.Vector3(5, 0, 0)).sub(before).normalize();
    };
    const turn = { name: 'turn', part: 'turret', type: 'pose', trigger: 'always', period: 1, rotate: [0, 90, 0] };
    const fire = { name: 'fire', part: 'cannon', type: 'pose', trigger: 'always', period: 1, move: [-0.2, 0, 0] };
    const rotated = new (global.THREE.Vector3)(0, 0, 1);
    for (const order of [[turn, fire], [fire, turn]]) {
        const dir = recoilDir(order);
        assert.ok(dir.distanceTo(rotated) < 1e-6,
            'recoil follows the turned barrel for order ' + order.map(r => r.name).join(','));
    }
});

test('timed effects parse, clamp, and fire once as the action clock passes', () => {
    const rules = Reactor3D.readModelAnimationRules({ animations: [{
        name: 'fire', part: 'cannon', type: 'pose', trigger: 'action', period: 30,
        move: [-0.2, 0, 0],
        effects: [
            { at: 0.5, se: { name: 'Explosion1', volume: 120, pitch: 'x' } },
            { at: 2, animation: 55.7 },
            { at: 0, flash: { target: 'model', color: [300, -5, 128], duration: 15 } },
            { at: 0.1, flash: {} },
            { se: {} },
            'junk'
        ]
    }] });
    const effects = rules[0].effects;
    assert.equal(effects.length, 4, 'only real effects survive');
    assert.deepEqual(effects[0].se, { name: 'Explosion1', volume: 120, pitch: 100, pan: 0 });
    assert.equal(effects[1].at, 1, 'timing clamps to the end');
    assert.equal(effects[1].animation, 55, 'animation ids are whole');
    assert.deepEqual(effects[2].flash, { target: 'model', color: [255, 0, 128, 180], duration: 15 });
    assert.deepEqual(effects[3].flash, { target: 'screen', color: [255, 255, 255, 180], duration: 20 });

    // The firing window: each effect fires exactly once per play.
    const duration = Reactor3D.modelRuleDuration(rules[0]);
    assert.equal(duration, 60);
    const fired = [];
    let previous = -1;
    for (let t = 0; t < duration; t++) {
        for (const effect of Reactor3D.modelEffectsToFire(rules[0], duration, previous, t)) {
            fired.push(Math.round(effect.at * 100) / 100 + '@' + t);
        }
        previous = t;
    }
    assert.deepEqual(fired, ['0@0', '0.1@6', '0.5@30', '1@59'],
        'each effect fires once, in order, and the end-of-animation effect lands inside the play');
    assert.deepEqual(Reactor3D.modelEffectsToFire(rules[0], duration, -1, 200).length, 4,
        'a huge frame step still fires everything');
    assert.deepEqual(Reactor3D.modelEffectsToFire({ effects: [] }, 60, -1, 60), []);
});

test('the game sync fires effects and instances flash their own materials', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    // Effects ride the action clock in the sync loop, once per play.
    assert.match(source, /holder\.fxKey !== fxKey/);
    assert.match(source, /Reactor3D\.modelEffectsToFire\(rule, duration, holder\.fxT, fxNow\)/);
    assert.match(source, /Reactor3D\.fireModelEffect\(effect, character, holder\)/);
    // Database animations go through the stock request pipeline.
    assert.match(source, /\$gameTemp\.requestAnimation\(\[character\], effect\.animation\)/);
    assert.match(source, /\$gameScreen\.startFlash\(effect\.flash\.color\.slice\(\), effect\.flash\.duration\)/);
    // Ending a model flash hands the materials back to the ambient tint,
    // and materials are cloned per instance so one tank flashes alone.
    assert.match(source, /if \(Reactor3D\.updateModelFlash\(holder\)\) this\._ambientLevel = undefined;/);
    assert.match(source, /child\.material\.map\(instanceMaterial\)/);
    // The card edits effects with the shared pickers and previews sounds
    // and flashes at the authored moment.
    const editor = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    assert.match(editor, /_effectsHtml\(\)/);
    assert.match(editor, /RRAudioPickerModal\.open\(/);
    assert.match(editor, /AnimationPickerModal\.open\(/);
    // The picker preview needs the live project; the global manager
    // answered a different shape and every preview stayed black.
    assert.match(editor, /projectManager: this\.projectController,/);
    const picker = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'database', 'AnimationPickerModal.js'), 'utf8');
    assert.match(picker, /anim-picker-list audio-scroll/, 'the list scrolls with the accent pill');
    assert.match(picker, /background: var\(--color-bg-panel\); border-top/, 'the footer wears the header panel colour');
    assert.match(editor, /_updatePreviewFx\(frame, rules\)/);
    assert.match(editor, /RRAssetFiles\.urlFor\(/);
});

test('a model flash survives the JSON-degraded base colour a material clone leaves', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    // Templates store userData.baseColor as a Color for the ambient tint;
    // Material.clone copies userData through JSON, degrading it to a hex
    // NUMBER — reading .r off it poisoned every later flash frame and the
    // restore wrote literal undefined into the colour.
    const template = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x8090a0 });
    mat.userData.baseColor = mat.color.clone();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    template.add(new THREE.Mesh(g, mat));
    const instance = Reactor3D.cloneModelTemplate(template);
    const cloned = instance.children[0].material;
    assert.notEqual(cloned, mat, 'materials are per instance');
    assert.ok(cloned.userData.baseColor.isColor, 'the degraded hex number rebuilds as a Colour');
    const holder = { object: instance, flash: { color: [255, 0, 0, 255], duration: 4, t: 0 } };
    Reactor3D.updateModelFlash(holder);
    assert.ok(Number.isFinite(cloned.color.r) && cloned.color.r > 0.9, 'the flash reddens');
    while (holder.flash) Reactor3D.updateModelFlash(holder);
    assert.ok(Math.abs(cloned.color.getHex() - 0x8090a0) < 2, 'the base colour comes back intact');
    // Even a baseColor degraded through some other path self-heals.
    cloned.userData.baseColor = 12345678;
    holder.flash = { color: [0, 255, 0, 255], duration: 3, t: 0 };
    Reactor3D.updateModelFlash(holder);
    assert.ok(Number.isFinite(cloned.color.g), 'no undefined channels ever reach the colour');
});

test('cloning a template neither serialises its textures nor leaves skinned meshes frustum culled', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const THREE = global.THREE;
    // Object3D.copy duplicates userData through JSON; a THREE.Texture's
    // toJSON serialises its image to a data URL, so a template carrying
    // its textures in userData cost hundreds of milliseconds per clone.
    const texture = new THREE.Texture();
    let serialised = 0;
    texture.toJSON = () => { serialised++; return {}; };
    const template = new THREE.Group();
    template.userData.glbTextures = [texture];
    template.userData.glbSize = { x: 1, y: 2, z: 1 };
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(12), 4));
    const bone = new THREE.Bone();
    const skinned = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial());
    skinned.add(bone);
    skinned.bind(new THREE.Skeleton([bone]));
    template.add(skinned);
    template.add(new THREE.Mesh(g.clone(), new THREE.MeshBasicMaterial()));
    template.userData.animated = true;

    const instance = Reactor3D.cloneModelTemplate(template);
    assert.equal(serialised, 0, 'textures are never run through JSON');
    assert.equal(instance.userData.glbTextures[0], texture, 'the instance shares the template textures by reference');
    assert.equal(template.userData.glbTextures[0], texture, 'the template keeps them too');
    assert.deepEqual(instance.userData.glbSize, { x: 1, y: 2, z: 1 }, 'plain userData still copies');
    const skinnedClone = instance.children.find(c => c.isSkinnedMesh);
    assert.equal(skinnedClone.frustumCulled, false, 'one character is never worth culling');
    assert.ok(skinnedClone.boundingSphere, 'the bounding sphere is preset, so three never skins every vertex for it');
    assert.equal(skinnedClone.boundingSphere.radius, g.boundingSphere.radius, 'it is the shared rest geometry sphere');
    // three's renderer computes the skinned sphere only while it is null.
    assert.notEqual(skinnedClone.boundingSphere, null);
    assert.equal(instance.children.find(c => c.isMesh && !c.isSkinnedMesh).frustumCulled, true, 'ordinary meshes keep culling');
});
