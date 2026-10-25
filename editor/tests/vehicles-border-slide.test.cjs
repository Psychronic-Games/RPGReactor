'use strict';
// A vehicle held at a closed border leaves only by that border (runtime/reactor_vehicles_drive.js). Sliding east
// along a closed north edge, its nose is refused by the north edge; that refusal is no reason to cross the east
// border, which is still tiles away.
const test = require('node:test');
const assert = require('node:assert/strict');
const { boardWorld, bike, motorcycle } = require('./helpers/vehicles-board-world.cjs');

test('sliding along a closed border does not leave by the next one early', { skip: !boardWorld({}).hasDrive }, () => {
    const w = boardWorld({ width: 40, height: 30, types: [null, motorcycle()], vehicles: [bike(31, 6, 2, { yaw: 170 })] });
    if (!w.hasAboard) w.stubAboard();
    const N = w.Reactor3D.Neighbors || (w.Reactor3D.Neighbors = {});
    N.stands = () => false;
    N.ready = () => false;
    w.stand(6, 3, 8);
    assert.equal(w.board(31), true);

    const asked = [];
    w.$gamePlayer.leaveByBorder = (d, reach) => { asked.push({ d, reach: reach || 0, x: w.$gamePlayer._realX }); return false; };
    // Up and right: it rides east with its nose against the north edge.
    w.keys.up = w.keys.right = true; w.run(300); w.keys.up = w.keys.right = false;

    assert.ok(w.$gamePlayer._realX > 20, `it slid east along the north edge: ${w.$gamePlayer._realX}`);
    const early = asked.filter(a => a.d === 6 && a.x < 40 - 1 - a.reach);
    assert.deepEqual(early, [], 'no exit east asked for while the east border is out of reach');
});
