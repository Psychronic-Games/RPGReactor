'use strict';
// A long vehicle and an open border (runtime/reactor_vehicles_drive.js). A side whose neighboring map stands built
// is ridden over by the vehicle's own length, so that its middle reaches the border and the ride goes on in the map
// past it; a tank's nose is tiles ahead of its middle. A side with no neighbor stops the body at the map's edge.
const test = require('node:test');
const assert = require('node:assert/strict');
const { boardWorld, bike, motorcycle } = require('./helpers/vehicles-board-world.cjs');

const MODEL = motorcycle().model.name;
function world(open) {
    const w = boardWorld({ width: 40, height: 30, model: [20, 2, 3],
        types: [null, motorcycle({ kind: 'tank', rider: 'seat', model: { name: MODEL, file: 'test-bike', size: 20 } })],
        vehicles: [bike(31, 20, 15, { yaw: 90 })] });
    if (!w.hasAboard) w.stubAboard();
    const N = w.Reactor3D.Neighbors || (w.Reactor3D.Neighbors = {});
    N.stands = side => open && side === 'east';
    N.ready = () => false;
    w.stand(20, 14, 2);
    assert.equal(w.board(31), true);
    return w;
}
const driveEast = w => { w.keys.up = true; w.run(900); w.keys.up = false; return w.$gamePlayer._realX; };

test('a vehicle seven tiles from nose to middle reaches an open border with its middle', { skip: !boardWorld({}).hasDrive }, () => {
    const w = world(true), shape = w.V.Drive.shape();
    assert.ok(shape.front > 6, 'a long body: ' + shape.front);
    const x = driveEast(w);
    assert.ok(x >= 39, `its middle comes to the last column: ${x}`);
});

test('with no map past the border its body stops at the map\'s edge', { skip: !boardWorld({}).hasDrive }, () => {
    const w = world(false), shape = w.V.Drive.shape();
    const x = driveEast(w);
    assert.ok(x <= 40 - shape.front, `its nose is held at the edge: ${x}`);
    assert.ok(x > 28, 'and it drove up to it');
});
