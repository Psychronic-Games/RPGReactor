const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const ctx = { console, module: { exports: {} }, require, process, setTimeout, performance: { now: () => 0 } };
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'three.js'), 'utf8'), ctx);
const THREE = ctx.THREE || ctx.module.exports;
global.THREE = THREE;
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('a part-anchored effect follows the posed part, even on an overlap-named piece', () => {
    // A piece cut where two parts overlap is NAMED after one but owned by
    // both — the MonitorArm's whole-object part plus the arm part. The
    // anchor lookup must find it through userData.parts.
    const object = new THREE.Group();
    const piece = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    piece.name = 'Whole Object';
    piece.userData.parts = [
        { name: 'Whole Object', pivot: [0, 0, 0] },
        { name: 'Monitor+Arm', pivot: [0, 0.5, 0] }
    ];
    object.add(piece);
    const binding = R.prepareModelInstance(object, []);
    assert.ok(piece.userData.__restQuaternion, 'the rest turn is stamped');
    assert.equal(R.effectAnchorNode(object, 'Monitor+Arm'), piece, 'the owned name reaches the piece');

    const rules = R.readModelAnimationRules({ animations: [{
        name: 'tip', part: 'Monitor+Arm', type: 'pose', motion: 'pose',
        rotate: [-36, 0, 0], move: [0, 0, 0], resize: [1, 1, 1],
        axis: 'z', period: 30, trigger: 'always', cycles: 1
    }] });
    const effect = { anchor: { part: 'Monitor+Arm', offset: [0, 0.5, 0.5] } };
    const before = R.effectAnchorWorld(object, effect, new THREE.Vector3()).clone();
    for (let frame = 0; frame <= 30; frame++) {
        R.applyModelAnimation(binding, rules, { frame, moving: false, dashing: false, action: null, scale: 1 });
    }
    object.updateMatrixWorld(true);
    const after = R.effectAnchorWorld(object, effect, new THREE.Vector3());
    assert.ok(before.distanceTo(after) > 0.1, 'the anchor point moved with the pose');
    const delta = R.effectAnchorQuaternion(object, effect, new THREE.Quaternion());
    const angle = 2 * Math.acos(Math.min(1, Math.abs(delta.w))) * 180 / Math.PI;
    assert.ok(Math.abs(angle - 36) < 1, `the pose delta is the pose's own turn (got ${angle.toFixed(1)})`);
});

test('a whole-model pose carries an unanchored effect with it', () => {
    const object = new THREE.Group();
    const piece = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    piece.userData.parts = [{ name: 'Body', pivot: [0, 0, 0] }];
    object.add(piece);
    const binding = R.prepareModelInstance(object, []);
    const rules = R.readModelAnimationRules({ animations: [{
        name: 'lean', part: '', type: 'pose', motion: 'pose',
        rotate: [0, 0, 30], move: [0, 0, 0], resize: [1, 1, 1],
        axis: 'z', period: 30, trigger: 'always', cycles: 1
    }] });
    const effect = { anchor: { part: '', offset: [0, 1, 0] } };
    const before = R.effectAnchorWorld(object, effect, new THREE.Vector3()).clone();
    for (let frame = 0; frame <= 30; frame++) {
        R.applyModelAnimation(binding, rules, { frame, moving: false, dashing: false, action: null, scale: 1 });
    }
    object.updateMatrixWorld(true);
    const after = R.effectAnchorWorld(object, effect, new THREE.Vector3());
    assert.ok(before.distanceTo(after) > 0.2, 'the anchor rides the whole-model pose');
    const delta = R.effectAnchorQuaternion(object, effect, new THREE.Quaternion());
    const angle = 2 * Math.acos(Math.min(1, Math.abs(delta.w))) * 180 / Math.PI;
    assert.ok(Math.abs(angle - 30) < 1, `and turns with it (got ${angle.toFixed(1)})`);
    // Without a prepared instance (no anim-root) the offset still reads in
    // model space, exactly as before.
    const bare = new THREE.Group();
    bare.position.set(2, 0, 0);
    bare.updateMatrixWorld(true);
    const at = R.effectAnchorWorld(bare, effect, new THREE.Vector3());
    assert.equal(at.x, 2);
    assert.equal(at.y, 1);
});

test('the parts list opens with the whole model as its first entry', () => {
    const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    const at = editor.indexOf('renderPartList() {');
    const body = editor.slice(at, editor.indexOf('renderPartForm() {', at));
    assert.match(body, /whole\.textContent = this\._t\('Whole model'\);/, 'the row is there before any carving');
    assert.match(body, /this\.selectPartByName\(''\);/, 'and it selects the whole-model target');
});

test("a placement's chosen animation plays on demand and repeats, whatever its authored trigger", () => {
    const object = new THREE.Group();
    const piece = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    piece.userData.parts = [{ name: 'P', pivot: [0, 0, 0] }];
    object.add(piece);
    const binding = R.prepareModelInstance(object, []);
    const authored = R.readModelAnimationRules({ animations: [{
        name: 'Extend', part: 'P', type: 'pose', motion: 'pose',
        rotate: [0, 0, 45], move: [0, 0, 0], resize: [1, 1, 1], axis: 'z',
        period: 10, trigger: 'always'
    }] });
    const rules = R.rulesForPlacement(authored, 'Extend', true);
    assert.equal(rules[0].trigger, 'action', 'the chosen rule becomes on-demand for this placement');
    assert.equal(rules[0].repeat, true, 'and the placement Repeat rides it');
    assert.equal(authored[0].trigger, 'always', 'the authored rule is untouched');

    // The map editor's own restart loop cycles it forever.
    let action = { name: 'Extend', frame: 0, repeat: true };
    const seen = new Set();
    for (let frame = 0; frame <= 60; frame++) {
        const rule = rules.find(entry => entry.trigger === 'action' && entry.name === action.name);
        if (rule && frame - action.frame >= R.modelRuleDuration(rule, [])) {
            action = Object.assign({}, action, { frame });
        }
        R.applyModelAnimation(binding, rules, { frame, moving: false, dashing: false, distance: 0, scale: 1,
            action: { name: action.name, frame: action.frame } });
        seen.add(Math.round(piece.rotation.z * 180 / Math.PI));
    }
    assert.ok(seen.has(45) || seen.has(44), 'it reaches the pose');
    assert.ok(seen.has(0), 'and comes back to rest — a loop, not a freeze');
});

test("a prop event's facing is written directly, past direction-fix", () => {
    const three = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(three, /event\.setDirection\(prop\.direction\);\n\s*event\._direction = prop\.direction;/,
        'setDirection is a no-op under the synthetic page\u2019s direction-fix');
});

test('a turning body blocks only the arc it sweeps through, height respected', () => {
    // A long thin body (rect fallback: 18x2 tiles) turning east -> south
    // sweeps its bow through the south-east quadrant and its stern through
    // the north-west one. A bystander north-EAST of it is never touched.
    const character = { _x: 0, _y: 0, _realX: 0, _realY: 0, direction: () => 6, isMoving: () => false };
    const spec = { name: 'x', size: 18, scale: 1, yaw: 0, pitch: 0, roll: 0 };
    // Cache a fake extent so the footprint is long and thin.
    R._glbCache = R._glbCache || {};
    const key = R.modelCacheKey('x', '', '');
    R._glbCache[key] = { template: { userData: { glbSize: { x: 9, y: 1, z: 1 } } } };
    // The fake template has no meshes to build a mask from; a cached null
    // keeps the footprint on its rectangle fallback.
    R._collisionMasks = R._collisionMasks || {};
    R._collisionMasks[`${key}|18|1||0|0`] = null;
    const fromYaw = Math.PI / 2;   // facing east
    const toYaw = 0;               // facing south
    const foot = R.eventModelFootprint(character, spec, fromYaw);
    assert.ok(foot.rawX > 8, 'the body is long');
    // In the footprint's frame (localZ = dx·sin t + dy·cos t against the
    // thin half), the quarter turn sweeps the (+x,−y) and (−x,+y)
    // quadrants and never touches the other two.
    assert.equal(R.eventModelSweepHits(character, spec, 0, 0, 5, -5, fromYaw, toYaw), true,
        'one end sweeps its quadrant');
    assert.equal(R.eventModelSweepHits(character, spec, 0, 0, -5, 5, fromYaw, toYaw), true,
        'the other end sweeps the opposite one');
    assert.equal(R.eventModelSweepHits(character, spec, 0, 0, 5, 5, fromYaw, toYaw), false,
        'an unswept quadrant stays free');
    assert.equal(R.eventModelSweepHits(character, spec, 0, 0, -5, -5, fromYaw, toYaw), false,
        'both of them');
    assert.equal(R.eventModelSweepHits(character, spec, 0, 0, 5, 5), true,
        'with no arc given the old whole-disc caution stands');
    delete R._glbCache[key];

    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /if \(!this\.charactersOverlapVertically\(character, other\)\) continue;[\s\S]{0,120}blockedBy\(other\._x, other\._y\)/,
        'canFace skips what is vertically clear');
    assert.match(source, /if \(!this\.charactersOverlapVertically\(character, other\)\) continue;[\s\S]{0,120}eventModelWouldOverlap/,
        'and so does the step overlap loop');
});

test('an origin anchor heals onto the part that contains it', () => {
    const editor = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'database', 'Database3DEditor.js'), 'utf8');
    assert.match(editor, /_healAnchorBinding\(work\) \{/, 'the heal exists');
    assert.match(editor, /this\._healAnchorBinding\(this\._effectWork\);/, 'and runs on every effect selection');
    assert.match(editor, /if \(!anchor \|\| anchor\.part \|\| !Array\.isArray\(anchor\.offset\)\) return;/, 'a bound anchor is left alone');
    assert.match(editor, /Reactor3D\.effectAnchorNode\(this\._object, name\)/, 'the editor shares the carve-aware lookup');
});
