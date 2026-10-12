'use strict';
// Whether the rider is drawn on a vehicle (runtime/reactor_vehicles.js): the vehicle's Rider setting says on the
// seat or inside; left to itself, a kind that keeps its rider inside shows it all the same when its model places a
// seat (3D Models > Rig > Vehicle rider). A follower on a vehicle of its own is seen whatever hides the leader.
const test = require('node:test');
const assert = require('node:assert/strict');
const { boardWorld, bike, motorcycle } = require('./helpers/vehicles-board-world.cjs');

const MODEL = motorcycle().model.name;
/** A tank (31) with a motorcycle beside it (32), the leader about to get on the tank. `seat`: the tank's model places one. */
function world(tank = {}, seat = false) {
    const w = boardWorld({ width: 60, height: 30, party: [1, 2], types: [null, motorcycle(Object.assign({ kind: 'tank' }, tank)), motorcycle({ id: 2, model: { name: MODEL + '-bike', file: 'test-bike', size: 3.5 } })],
        vehicles: [bike(31, 10, 10, { yaw: 180 }), bike(32, 13, 12, { yaw: 180, type: 2 })],
        // The party has models: a leader with none is never drawn on a seat, whatever the vehicle says.
        before(ctx) {
            const R = ctx.Reactor3D, stock = R.characterModelSpec;
            R.characterModelSpec = function(character) { return character && (character === ctx.$gamePlayer || typeof character._memberIndex === 'number') ? { name: 'Actors/hero' } : stock.apply(this, arguments); };
        },
        prepare(data, ctx) { if (seat) ctx.Reactor3D._sidecarJson[MODEL].vehicle.seats = [{ seat: { at: [0, 1, 0] } }]; } });
    if (!w.hasAboard) w.stubAboard();
    w.stand(11, 10, 4);
    return w;
}

test('a tank keeps its rider inside: the leader is not drawn', () => {
    const w = world();
    assert.equal(w.V.type(1).rider, 'inside');
    assert.equal(w.board(31), true);
    assert.equal(w.$gamePlayer.isTransparent(), true);
    assert.equal(w.V.getOff({ instant: true }), true);
    w.run(4);
    assert.equal(w.$gamePlayer.isTransparent(), false, 'seen again on foot');
});

test('a seat placed on its model shows the rider there, whatever the kind', () => {
    const w = world({}, true);
    assert.equal(w.board(31), true);
    assert.equal(w.$gamePlayer.isTransparent(), false);
});

test('the Rider setting decides: On the seat shows a tank\'s rider, Inside hides the rider of a model with a seat', () => {
    const shown = world({ rider: 'seat' });
    assert.equal(shown.board(31), true);
    assert.equal(shown.$gamePlayer.isTransparent(), false);
    const hidden = world({ rider: 'inside' }, true);
    assert.equal(hidden.board(31), true);
    assert.equal(hidden.$gamePlayer.isTransparent(), true);
});

test('a follower on a vehicle of its own is seen while the leader is inside the tank', () => {
    const w = world();
    assert.equal(w.board(31), true);
    const riders = w.V.Convoy.riders();
    assert.equal(riders.length, 1, 'the follower took the motorcycle');
    const follower = riders[0].follower;
    assert.equal(w.$gamePlayer.isTransparent(), true);
    assert.equal(follower.isTransparent(), false);
    // A party hidden before the ride began stays hidden.
    w.$gamePlayer._rrWas.transparent = true;
    assert.equal(follower.isTransparent(), true);
});
