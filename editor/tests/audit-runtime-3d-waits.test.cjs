'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('a background wait saves without its character and finds it again after a load', () => {
    // A parallel event whose own interpreter waits on that event: the save holds both.
    const event = { eventId: () => 4, _interpreter: {} };
    event._interpreter._reactorScopedWait = R.holdWaitCharacter({ mode: 'actions', deadline: 5000 }, event);
    event._interpreter._reactorAnimWait = R.holdWaitCharacter({ name: 'Fire', started: false, startedFrame: null, deadline: 5000 }, event);
    assert.equal(R.waitCharacter(event._interpreter._reactorScopedWait), event, 'in play: the live character');
    const saved = JSON.parse(JSON.stringify(event._interpreter), (key, value) => value);
    assert.equal(saved._reactorScopedWait.characterId, 4);
    assert.equal(saved._reactorScopedWait.character, undefined, 'not written into the save');

    const loaded = { eventId: () => 4 };
    global.$gameMap = { event: id => (id === 4 ? loaded : null) };
    global.Graphics = { frameCount: 100 };
    R._modelActions = { e4: [{ name: 'Fire', frame: 90 }] };
    R.modelHolderFor = () => null;
    try {
        assert.equal(R.waitCharacter(saved._reactorScopedWait), loaded, 'after a load: the event on the map');
        assert.equal(R.modelAnimationWaiting(saved._reactorAnimWait), true, 'the animation wait still watches it');
        assert.equal(R.scopedWaitHolding(saved._reactorScopedWait), true);
    } finally {
        delete global.$gameMap;
        delete global.Graphics;
        delete R.modelHolderFor;
        R._modelActions = {};
    }
});

test('a switch wait loaded from a save keeps holding', () => {
    const wait = JSON.parse(JSON.stringify(R.holdWaitCharacter({ mode: 'switch', switchId: 7, switchValue: true, deadline: Infinity }, null)));
    assert.equal(wait.deadline, null, 'Infinity is saved as null');
    global.Graphics = { frameCount: 10 };
    global.$gameSwitches = { value: () => false };
    try {
        assert.equal(R.scopedWaitHolding(wait), true, 'still waiting for the switch');
    } finally {
        delete global.Graphics;
        delete global.$gameSwitches;
    }
});
