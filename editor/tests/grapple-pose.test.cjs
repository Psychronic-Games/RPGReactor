'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '../..');
global.self = global; global.window = global;
require(path.join(root, 'runtime/libs/three.js'));
const T = global.THREE;
const R = global.Reactor3D = require(path.join(root, 'runtime/reactor_3d.js'));
global.ReactorBattleData = require(path.join(root, 'editor/src/battle/BattleData.js'));
global.ReactorBattleRoomView = require(path.join(root, 'runtime/reactor_battle_room.js'));

function body() {
    const stage = new T.Group(), object = new T.Group(); stage.add(object);
    object.position.set(0.5, 0, 0.5); object.userData.glbSize = { x: 0.7, y: 1.8, z: 0.4 };
    const hands = {}, shoulders = {};
    for (const [side, sign] of [['Right', -1], ['Left', 1]]) {
        const upper = new T.Bone(), fore = new T.Bone(), hand = new T.Bone();
        upper.name = side + 'UpperArm'; fore.name = side + 'LowerArm'; hand.name = side + 'Hand';
        upper.position.set(sign * 0.25, 1.4, 0); fore.position.y = -0.4; hand.position.y = -0.4;
        object.add(upper); upper.add(fore); fore.add(hand); shoulders[side] = upper; hands[side] = hand;
    }
    stage.updateMatrixWorld(true);
    const holder = { object }, character = { _eventId: 77, _x: 0, _y: 0, _realX: 0, _realY: 0,
        _reactorGrapple: { hx: 0.5, hy: 2, lip: 8, t: 0, aim: 12, shot: 20, tight: 14 } };
    const at = node => node.getWorldPosition(new T.Vector3());
    const pose = t => { character._reactorGrapple.t = t; R.MantlePose.update(holder, character); stage.updateMatrixWorld(true); return { right: at(hands.Right), left: at(hands.Left) }; };
    return { stage, object, holder, character, hands, shoulders, at, pose };
}

test('the firing arm rises toward the hook, then both hands support the taut line above the shoulders', () => {
    const b = body(), rest = b.pose(0), half = b.pose(6), aimed = b.pose(12);
    assert.ok(half.right.y > rest.right.y && aimed.right.y > half.right.y, 'the arm raises during the aim beat');
    assert.ok(aimed.right.y > 1.8, 'the firing hand is above the head');
    assert.ok(aimed.left.y < 1, 'the free arm has not grabbed the line before firing');
    const flying = b.pose(25), tightening = b.pose(40), pulling = b.pose(50);
    assert.ok(flying.right.y > 1.8 && flying.left.y < 1);
    assert.ok(tightening.left.y > flying.left.y, 'the other hand joins as the rope tightens');
    assert.ok(pulling.right.y > 1.8 && pulling.left.y > 1.8, 'both arms stay raised during the pull');
    assert.ok(pulling.right.distanceTo(pulling.left) < 0.2, 'the hands converge on the line');
    const held = b.pose(50);
    for (let i = 0; i < 12; i++) {
        const again = b.pose(50);
        assert.ok(again.right.distanceTo(held.right) < 1e-6 && again.left.distanceTo(held.left) < 1e-6, 'rendering between physics ticks does not accumulate a pose');
    }
});

test('grapple targets follow the hook in a transformed map scene and hand off directly to the ledge climb', () => {
    const b = body(); b.stage.rotation.y = 0.7; b.stage.position.set(9, 0, -5); b.object.rotation.y = -0.4;
    b.pose(60);
    assert.ok(b.at(b.hands.Right).y > b.at(b.shoulders.Right).y + 0.4);
    b.object.position.y = 1.1;
    b.character._reactorGrapple = null;
    b.character._reactorMantle = { d: 2, x: 0, y: 1, to: 3, lip: 3, t: 0, over: false };
    R.MantlePose.update(b.holder, b.character);
    assert.equal(b.holder.mantlePose.w, 1, 'the firing arm does not drop while the climb begins');
    assert.equal(b.holder.mantlePose.lw, 1, 'the support arm stays on the ledge too');
    for (const hand of Object.values(b.hands)) assert.ok(Math.abs(b.at(hand).y - 3.03) < 0.03, 'the hands take the actual lip');
    b.character._reactorMantle = null;
    for (let i = 0; i <= R.MantlePose.OUT; i++) R.MantlePose.update(b.holder, b.character);
    assert.equal(b.holder.mantlePose, null);
    for (const shoulder of Object.values(b.shoulders)) {
        assert.ok(shoulder.quaternion.angleTo(new T.Quaternion()) < 1e-6);
        assert.ok(shoulder.children[0].quaternion.angleTo(new T.Quaternion()) < 1e-6);
    }
});

test('a grapple stows the carried weapon and an unrigged model keeps its existing motion', () => {
    const b = body(), H = R.MapHeld, weapon = new T.Group(), key = R.modelInstanceKey(b.character);
    const state = { character: b.character, record: { object: weapon }, slots: [], shown: true };
    H.states.set(key, state);
    try {
        H.update(b.holder, b.character, {}, false);
        assert.equal(state.stowed, true); assert.equal(weapon.visible, false);
        b.pose(50); assert.ok(b.at(b.hands.Right).y > 1.8, 'the carried pose cannot lower the grapple arm');
        H.update(b.holder, b.character, {}, false);
        assert.ok(b.at(b.hands.Right).y > 1.8);
        H.unstow(state); assert.equal(weapon.visible, true);
    } finally { H.states.delete(key); }
    const object = new T.Group(); new T.Group().add(object);
    assert.equal(R.MantlePose.update({ object }, b.character), false);
});
