/**
 * A follower's gait clip keeps up with the ground (reactor_3d_models.js, Reactor3D.gaitPace): in the scattered
 * formation a follower that dropped back catches up a notch faster than the leader (Game_Followers.rrPace), twice
 * the ground a frame, and its walk played at the leader's rate slid over it. It now steps in proportion; the
 * leader and anyone else play their gait as authored.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const R = require(path.join(root, 'runtime', 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;

class Game_Follower { constructor(speed) { this.speed = speed; } realMoveSpeed() { return this.speed; } }
class Game_Player { constructor(speed) { this.speed = speed; } realMoveSpeed() { return this.speed; } }

test('a follower steps at its own speed against the leader\'s; anyone else at 1', () => {
    global.Game_Follower = Game_Follower;
    global.$gamePlayer = new Game_Player(4);
    try {
        assert.equal(R.gaitPace(new Game_Follower(4)), 1, 'keeping pace');
        assert.equal(R.gaitPace(new Game_Follower(5)), 2, 'catching up a notch faster: twice the ground a frame');
        assert.equal(R.gaitPace(new Game_Follower(3)), 0.5);
        assert.equal(R.gaitPace(new Game_Follower(7)), 2, 'held within half and double');
        assert.equal(R.gaitPace($gamePlayer), 1, 'the leader plays its gait as authored');
        assert.equal(R.gaitPace({}), 1, 'an event');
    } finally {
        delete global.Game_Follower;
        delete global.$gamePlayer;
    }
});

test('the gait clip plays at the pace; the idle clip and a clip of the model\'s own rate are not paced', () => {
    const object = new THREE.Group(), bone = new THREE.Bone();
    bone.name = 'Hips';
    object.add(bone);
    const track = new THREE.QuaternionKeyframeTrack('Hips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
    const clips = ['Walking', 'Idle'].map(name => new THREE.AnimationClip(name, 1, [track.clone()]));
    const binding = R.prepareModelInstance(object, clips);
    const rules = R.readModelAnimationRules({ animations: [
        { type: 'clip', trigger: 'walking', name: 'Walking', clip: 'Walking', rate: 1.5 },
        { type: 'clip', trigger: 'idle', name: 'Idle', clip: 'Idle' }
    ] }, clips);
    const state = (frame, extra) => Object.assign({ frame, moving: true, dashing: false, distance: 0.125, scale: 1, airborne: false, swimming: false, climbing: false }, extra);
    R.applyModelAnimation(binding, rules, state(1, { pace: 2 }));
    assert.equal(binding.clipAction.getClip().name, 'Walking');
    assert.equal(binding.clipAction.timeScale, 3, 'the walk\'s own rate, doubled');
    R.applyModelAnimation(binding, rules, state(2, { pace: 1 }));
    assert.equal(binding.clipAction.getClip().name, 'Walking', 'the same walk goes on: a change of pace never restarts it');
    assert.equal(binding.clipAction.timeScale, 1.5);
    R.applyModelAnimation(binding, rules, state(3));
    assert.equal(binding.clipAction.timeScale, 1.5, 'no pace given: as authored');
    for (let frame = 4; frame < 40; frame++) R.applyModelAnimation(binding, rules, state(frame, { moving: false, distance: 0, pace: 2 }));
    assert.equal(binding.clipAction.getClip().name, 'Idle');
    assert.equal(binding.clipAction.timeScale, 1, 'standing still is not paced');
});
