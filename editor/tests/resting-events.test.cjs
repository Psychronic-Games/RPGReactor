'use strict';
// Runtime 20261110.10: an event standing still on its ground is not worked out again in every update
// (ReactorPhysics.atRest), and a rest after a step of Auto's lasts five seconds at most however slow the frames.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const physics = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_physics.js'), 'utf8');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** `atRest` as the runtime has it, with the map it reads. */
function load(map) {
    const from = physics.indexOf('ReactorPhysics.atRest = function(character, rest, tick) {');
    const to = physics.indexOf('\n    };', from) + 7;
    assert.ok(from > 0 && to > from);
    const ReactorPhysics = { REST_UPDATES: 12 };
    new Function('ReactorPhysics', '$dataMap', physics.slice(from, to))(ReactorPhysics, map);
    return ReactorPhysics;
}
const standing = () => ({ _realX: 4, _realY: 7, x: 4, y: 7, _reactorGround: 1.5, _reactorAlt: 1.5, _reactorVz: 0, _reactorStepUp: undefined, isJumping: () => false });
const record = (map, at) => ({ valid: true, map, x: 4, y: 7, tx: 4, ty: 7, ground: 1.5, alt: 1.5, at });

test('an event standing where it stood, on the ground it stood on, is at rest for a fifth of a second', () => {
    const map = {}, P = load(map), event = standing();
    assert.equal(P.atRest(event, record(map, 100), 101), true);
    assert.equal(P.atRest(event, record(map, 100), 100 + P.REST_UPDATES - 1), true);
    assert.equal(P.atRest(event, record(map, 100), 100 + P.REST_UPDATES), false, 'looked at again: the ground may have changed under it');
    assert.equal(P.atRest(event, record(map, 100), 3), false, 'a new game counts its updates from nothing');
    assert.equal(P.atRest(event, Object.assign(record(map, 100), { valid: false }), 101), false);
    assert.equal(P.atRest(event, record({}, 100), 101), false, 'another map');
});

test('anything that moves it or sets its height wakes it at once', () => {
    const map = {}, P = load(map);
    const woken = change => { const event = standing(); change(event); return !P.atRest(event, record(map, 100), 101); };
    assert.ok(woken(e => { e._realX = 4.1; }), 'walking');
    assert.ok(woken(e => { e.x = 5; }), 'a step begun');
    assert.ok(woken(e => { e._realY = 7.5; }));
    assert.ok(woken(e => { e._reactorVz = 0.2; }), 'a jump');
    assert.ok(woken(e => { e.isJumping = () => true; }), 'an event\'s Jump');
    assert.ok(woken(e => { e._reactorGround = 3; }), 'sent to another floor');
    assert.ok(woken(e => { e._reactorAlt = 2; }), 'lifted');
    for (const flag of ['_reactorMantle', '_reactorGrapple', '_reactorLeap', '_reactorSwim', '_reactorOnLadder', '_reactorStepDown', '_reactorRisen', '_reactorRagdoll', '_reactorClimb', '_reactorJumped']) {
        assert.ok(woken(e => { e[flag] = true; }), flag);
    }
    assert.ok(woken(e => { e._reactorStepUp = 2; }), 'coming up a step');
});

test('only events rest, the record is kept beside the character, and it is made where a body stands dry on its ground', () => {
    assert.match(physics, /if \(this\.RESTS && typeof Game_Event !== "undefined" && character instanceof Game_Event\) \{/);
    assert.match(physics, /const REST = new WeakMap\(\);/, 'not on the character: a character is written into a save');
    assert.match(physics, /else if \(this\.atRest\(character, rest, tick\)\) return;/);
    assert.match(physics, /if \(rest && float === null && !flying\) \{\n\s+rest\.valid = true; rest\.map = \$dataMap;/);
    assert.match(physics, /ReactorPhysics\.RESTS = true;/);
});

test('a rest after a step lasts five seconds at most, however few frames it has seen', () => {
    const Q = Reactor3D.Quality;
    const saved = { away: Q.away, loading: Q.loading, setting: Q.setting, enabled: Q.enabled, rest: Q._rest, until: Q._restUntil, from: Q._restFrom, tickStart: Q._tickStart };
    Q.away = () => false; Q.loading = () => false; Q.setting = () => 'auto'; Q.enabled = true;
    try {
        let now = 50000;
        Q._tickStart = now; Q._last = 0; Q._stalls = 0;
        Q.rest();
        assert.equal(Q._rest, Q.REST_TICKS);
        // Ten frames a second: 120 frames would be twelve seconds.
        const frame = () => { now += 100; Q._tickStart = now - 5; Q._worldTick = false; Q.worldTick(now); Q.tickEnd(now); };
        for (let i = 0; i < 40; i++) frame();
        assert.ok(Q._rest > 0, 'four seconds in: still resting');
        for (let i = 0; i < 15; i++) frame();
        assert.equal(Q._rest, 0, 'past five: judged again');
        // A rest held by hand (no beginning recorded) is not cut short.
        Q._rest = 1e9; Q._restFrom = 0;
        for (let i = 0; i < 80; i++) frame();
        assert.ok(Q._rest > 1e8);
    } finally {
        Object.assign(Q, { away: saved.away, loading: saved.loading, setting: saved.setting, enabled: saved.enabled, _rest: saved.rest, _restUntil: saved.until, _restFrom: saved.from, _tickStart: saved.tickStart, _stalls: 0 });
        Q.clearWindow();
    }
});
