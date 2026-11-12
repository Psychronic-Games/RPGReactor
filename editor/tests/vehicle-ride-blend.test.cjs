/**
 * A ridden vehicle is drawn between updates where it is by then.
 *
 * `Graphics.FramePacing.capturePoses` leaves out a model whose `blendPose` is false (one animated every few
 * updates, or out of view). A vehicle's own pass sets that flag while it stands parked; the ride's pass sampled it
 * every update but left the flag as it was, so at a Quality level that strides what is not the party, a ridden
 * motorcycle moved only on updates while the camera moved every frame (the Iris Xe laptop, 2026-11-11: it stood
 * still in 1,052 of 2,700 drawn frames of a ride, and in none after).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = name => fs.readFileSync(path.join(repoRoot, 'runtime', name), 'utf8');

test('the ride\'s pass turns the blending between updates on, whatever the parked vehicle left', () => {
    const vehicles = read('reactor_3d_vehicles.js');
    const at = vehicles.indexOf('wrap(R, "animationDue", base => function(holder, character) {');
    assert.ok(at > 0, 'the vehicles\' own say on what is sampled');
    const body = vehicles.slice(at, at + 2200);
    const ride = /if \(holder\.rrRide\) \{([^}]*)\}/.exec(body);
    assert.ok(ride, 'the ridden vehicle\'s branch');
    assert.match(ride[1], /holder\.sampled = true;/);
    assert.match(ride[1], /holder\.blendPose = true;/, 'drawn between updates');
    assert.match(ride[1], /holder\.poseHeld = false;/, 'and its pose is not a held one');
    assert.match(ride[1], /return true;/);
    // What reads the flag: a model whose blendPose is false is left out of the frames between updates.
    assert.match(read('reactor_core.js'), /if \(holder\.blendPose === false \|\| holder\.matricesHeld\) continue;/);
});
