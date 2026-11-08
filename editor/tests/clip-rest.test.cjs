'use strict';
// A model's clips name its bones in their own ways (the file's own clips, the shared motion library's), and three
// keeps a binding, with an original value to fall back to, for each name. A binding made while another clip held
// the bone took that pose as its original: a party out of the water started its run there, every fade of the run
// went back to the swim's tilt, and a body with no idle clip stood or floated in it (2026-11-07).
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime/libs/three.js'));
const THREE = global.THREE;
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));

function rig(keep) {
    const root = new THREE.Group();
    const hips = new THREE.Bone(); hips.name = 'Hips';
    root.add(hips);
    if (keep) R.keepClipRest(root);
    const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2).toArray();
    const still = new THREE.Quaternion().toArray();
    // The swim: the hips turned flat, by the bone's name. The run: the hips upright, by the bone's uuid.
    const swim = new THREE.AnimationClip('swim', 1, [new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [...turned, ...turned])]);
    const run = new THREE.AnimationClip('run', 1, [new THREE.QuaternionKeyframeTrack(hips.uuid + '.quaternion', [0, 1], [...still, ...still])]);
    return { root, hips, mixer: new THREE.AnimationMixer(root), swim, run };
}
const tilt = q => 2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180 / Math.PI;

function play(r) {
    const swim = r.mixer.clipAction(r.swim); swim.play();
    r.mixer.update(0.1);
    assert.ok(tilt(r.hips.quaternion) > 89, 'swimming flat');
    // Out of the water: the run starts while the swim still holds the bone, and the swim fades.
    const run = r.mixer.clipAction(r.run); run.reset().fadeIn(0.2).play();
    swim.fadeOut(0.2);
    for (let i = 0; i < 20; i++) r.mixer.update(0.05);
    // Stopping, with no idle clip: the run fades too.
    run.fadeOut(0.2);
    for (let i = 0; i < 20; i++) r.mixer.update(0.05);
    return tilt(r.hips.quaternion);
}

test('a bone every clip lets go of goes back to its rest, whatever pose held it when a later clip first bound it', () => {
    assert.ok(play(rig(true)) < 0.5, 'upright again');
});

test('(three alone keeps the pose the later binding was made in)', () => {
    // The bug as three has it, so the test above shows the fix and not a quirk of the setup.
    const PM = THREE.PropertyMixer.prototype, kept = PM.saveOriginalState;
    const plain = rig(false);
    plain.root.userData.__rrClipRest = undefined;
    assert.ok(play(plain) > 45, 'without a shared rest the swim tilt stays');
    assert.equal(PM.saveOriginalState, kept);
});
