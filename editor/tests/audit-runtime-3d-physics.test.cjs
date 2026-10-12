'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');

// A lake: the bed at -2 under water standing at 0; a roof 6 high at x 5.
function sandbox() {
    const context = { console, Math, JSON, Number, Object, Array, Infinity, $dataSystem: {}, $dataMap: { reactor3d: {} } };
    context.window = context; context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('runtime/reactor_physics.js'), context);
    context.Reactor3D = {
        isMap3D: () => true, TERRAIN_SLOPE_LIMIT: 0.75, hasWater: () => true,
        groundHeightAt: (map, wx, wz, near) => (Math.floor(wx) === 5 ? (near === Infinity ? 6 : 0) : Math.floor(wx) < 3 ? -2 : 0),
        waterLevelAt: (map, x) => (x < 3 ? 0 : null)
    };
    vm.runInContext(`
        class Game_Vehicle { constructor(type) { this._type = type; this._altitude = 0; }
            isAirship() { return this._type === 'airship'; } maxAltitude() { return 48; } }
        globalThis.Game_Vehicle = Game_Vehicle;`, context);
    return context;
}

test('a boat floats on a 3D lake and an airship flies its altitude over what is under it', () => {
    const c = sandbox();
    const boat = new c.Game_Vehicle('ship');
    Object.assign(boat, { x: 1, y: 0, _realX: 1, _realY: 0 });
    c.ReactorPhysics.update(boat);
    assert.equal(boat._reactorGround + boat._reactorAir, 0, 'on the surface, not the bed 2 below it');
    assert.equal(c.ReactorPhysics.isAirborne(boat), false, 'riding is not a jump');

    const airship = new c.Game_Vehicle('airship');
    Object.assign(airship, { x: 1, y: 0, _realX: 1, _realY: 0, _altitude: 48 });
    c.ReactorPhysics.update(airship);
    assert.equal(airship._reactorGround + airship._reactorAir, c.ReactorPhysics.AIRSHIP_HEIGHT, 'full altitude over the water');
    Object.assign(airship, { x: 5, _realX: 5 });
    c.ReactorPhysics.update(airship);
    assert.equal(airship._reactorGround + airship._reactorAir, 6 + c.ReactorPhysics.AIRSHIP_HEIGHT, 'over the roof, not through it');
    airship._altitude = 0;
    Object.assign(airship, { x: 4, _realX: 4 });
    c.ReactorPhysics.update(airship);
    assert.equal(airship._reactorAir, 0, 'landed: on the ground');

    // The player aboard is carried with the vehicle, so the camera that follows them is too.
    const player = { x: 1, y: 0, _realX: 1, _realY: 0, isInVehicle: () => true, vehicle: () => boat };
    c.$gamePlayer = player;
    c.ReactorPhysics.update(player);
    assert.equal(player._reactorGround + player._reactorAir, 0);

    c.ReactorPhysics.settle(player);
    assert.equal(player._reactorRiding, false, 'getting off ends the ride');
});

test('a blank gravity or jump height in the data is the default, not zero', () => {
    const c = sandbox();
    c.$dataSystem = { reactorPhysics: { gravity: '', jumpHeight: null } };
    c.$dataMap = { reactor3d: { physics: { fallFrom: '' } } };
    const s = c.ReactorPhysics.readSettings();
    assert.equal(s.gravity, 1);
    assert.equal(s.jumpHeight, 1.25, 'jumping is not switched off by a blank');
    assert.equal(s.fallFrom, 6);
    c.$dataSystem = { reactorPhysics: { gravity: 0 } };
    assert.equal(c.ReactorPhysics.readSettings().gravity, 0.01, 'an explicit 0 still clamps');
});
