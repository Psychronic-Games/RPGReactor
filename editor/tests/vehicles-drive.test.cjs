'use strict';
// The ride: one logic tick of free movement aboard a vehicle (runtime/reactor_vehicles_drive.js), on the shipped
// objects, the 3D runtime and the physics. SPEC-v2 2.5 (the tick), 4.6 (the ground under it), 4.7 (what stops
// it), 4.8 (tile events, encounters, transfers) and 11.1 (its cost). Exact shapes of ground (a curb, a ledge, a
// lake, a wall off the axes) are small maps made here; the long rides, the bushes and the bridge are the Demo's
// North Haven (Map005), and are skipped where that map is not on disk.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { driveWorld, floor, event, page, demoData, hasDemo, DEG } = require('./helpers/vehicles-drive-world.cjs');
const { cpuMicros, withinBudget } = require('./helpers/timing.cjs');

const STEP = 0.75, RADIUS = 0.45, AXLE = 3.5 * 0.35;
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const within = (value, wanted, share) => Math.abs(value - wanted) <= Math.abs(wanted) * share;
const wallRow = (x, y0, y1) => Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ kind: 'wall', x, y: y0 + i }));
const on = (w, name) => { const got = []; w.ReactorEvents.on(name, payload => got.push(payload)); return got; };

/** Rides `ticks` with the keys as they are; answers what happened on the way. */
function ride(w, ticks, each) {
    const log = { stops: 0, slides: 0, refused: {}, maxRise: 0, air: 0, firstStop: null, vMin: Infinity };
    let alt = w.drive().alt;
    for (let t = 0; t < ticks; t++) {
        w.run(1);
        const d = w.drive(), last = w.Drive.last;
        if (last.stopped) { log.stops++; if (!log.firstStop) log.firstStop = Object.assign({ t }, w.where()); }
        if (last.slid) log.slides++;
        if (last.refused) { const name = w.Drive.REFUSALS[last.refused]; log.refused[name] = (log.refused[name] || 0) + 1; }
        if (d.air) log.air++;
        log.maxRise = Math.max(log.maxRise, d.alt - alt);
        log.vMin = Math.min(log.vMin, d.v);
        alt = d.alt;
        if (each && each(t, d, last) === false) break;
    }
    return log;
}

//-----------------------------------------------------------------------------
// 4.5 as the tick plays it, and 2.5

test('the throttle on the flat: walking pace, a dash, 10.8 after a second, braked from speed', () => {
    const w = driveWorld(Object.assign(floor({ width: 160, height: 20 }), { at: [5, 10], yaw: 90 }));
    w.keys.up = true;
    w.run(2);
    assert.ok(w.drive().v > 0.4, 'within two ticks of the key something moves');
    assert.ok(w.vehicle()._rrPitch > 1 * DEG, 'and the nose lifts');
    w.run(58);
    assert.ok(near(w.drive().v, 10.8, 0.2), 'after 1 s: ' + w.drive().v);
    w.run(120);
    assert.ok(near(w.drive().v, 18.0, 0.2), 'after 3 s: ' + w.drive().v);
    assert.equal(w.where().y, 10.5, 'straight');
    w.keys.up = false; w.keys.down = true;
    const x0 = w.where().x;
    let ticks = 0;
    while (w.drive().v > 0 && ticks < 200) { w.run(1); ticks++; }
    assert.ok(ticks <= 41 && ticks >= 30, 'braked in ' + ticks + ' ticks');
    assert.ok(w.where().x - x0 < 6.7);
    w.keys.down = false;
});

test('the same end place from 180 frames of one tick and 60 frames of three ticks', () => {
    const play = perFrame => {
        const w = driveWorld(Object.assign(floor({ width: 160, height: 60 }), { at: [10, 30], yaw: 90 }));
        for (let t = 0; t < 180; t++) {
            w.keys.up = t < 150; w.keys.right = t >= 40 && t < 70; w.keys.left = t >= 100 && t < 110;
            if (t % perFrame === 0) w.Graphics.frameCount++;
            w.$gameMap.update(true);
            w.$gamePlayer.update(true);
        }
        const d = w.drive(), p = w.$gamePlayer, e = w.vehicle();
        return [p._realX, p._realY, d.yaw, d.v, d.steer, d.travel, d.pitch, d.roll, e._realX, e._realY, e._rrYaw];
    };
    assert.deepEqual(play(3), play(1));
});

test('a tick with the scene not active reads no key, and the vehicle brakes', () => {
    const w = driveWorld(Object.assign(floor({ width: 160, height: 20 }), { at: [5, 10], yaw: 90 }));
    w.keys.up = true;
    w.run(120);
    const v = w.drive().v;
    let asked = 0;
    const isPressed = w.Input.isPressed, isTriggered = w.Input.isTriggered, held = w.Reactor3D.Camera.held, has = held.has;
    w.Input.isPressed = name => { asked++; return isPressed(name); };
    w.Input.isTriggered = name => { asked++; return isTriggered(name); };
    held.has = function() { asked++; return has.apply(this, arguments); };
    for (let t = 0; t < 10; t++) w.Drive.tick(false);
    assert.equal(asked, 0);
    assert.equal(w.Drive.last.controls, 0);
    assert.ok(w.drive().v < v - 10 * (20 / 0.67 / 60) + 0.01, 'it brakes at its brake: ' + v + ' -> ' + w.drive().v);
    w.Drive.tick(true);
    assert.ok(asked > 0, 'an active tick reads them');
    held.has = has;
});

test('what the tick writes: the tile under the middle, the facing, the heights, and the same on the carried event', () => {
    const w = driveWorld(Object.assign(floor({ width: 160, height: 60 }), { at: [10, 30], yaw: 90 }));
    const p = w.$gamePlayer, e = w.vehicle();
    w.keys.up = true; w.keys.right = true;
    let pose = e._rrPose | 0;
    ride(w, 90, (t, d) => {
        assert.equal(p._x, Math.round(p._realX));
        assert.equal(p._y, Math.round(p._realY));
        assert.deepEqual([e._realX, e._realY, e._x, e._y], [p._realX, p._realY, p._x, p._y]);
        assert.deepEqual([e._reactorGround, e._reactorAlt, e._reactorAir], [p._reactorGround, p._reactorAlt, p._reactorAir]);
        assert.equal(p._reactorRiding, true);
        assert.equal(e._through, true);
        assert.equal(e._rrYaw, d.yaw);
        assert.equal(e._rrSpeed, d.v);
        assert.equal(e._rrSteer, d.steer);
        assert.equal(e._rrLean, d.roll);
        assert.equal(e._rrPitch, d.pitch);
        assert.equal(e._rrTravel, d.travel);
        assert.equal(p._direction, w.Drive.dir4Of(d.yaw));
        assert.equal(p._reactorDir8, w.Drive.dir8Of(d.yaw));
        assert.equal(e._reactorDir8, p._reactorDir8);
        assert.ok(e._rrPose > pose, 'the pose counter moves while anything drawn changes');
        assert.equal(p._rrPose, e._rrPose);
        pose = e._rrPose;
    });
    assert.ok(w.drive().yaw > 100 * DEG, 'it turned right');
    assert.ok(e._rrLean > 5 * DEG, 'leaning into the turn, to its right');
    // A page change gives an event its page's Through back: it is carried again on the next tick.
    e._through = false;
    w.run(1);
    assert.equal(e._through, true);
    // Standing with nothing held, nothing drawn changes and the counter stands.
    w.keys.up = false; w.keys.right = false;
    w.run(400);
    assert.equal(w.drive().v, 0);
    const still = e._rrPose;
    w.run(60);
    assert.equal(e._rrPose, still);
    assert.equal(w.drive().foot, 1, 'at a stop the foot is down');
});

test('the display follows the ride: the scroll is read before the tick moves the player', () => {
    const w = driveWorld(Object.assign(floor({ width: 160, height: 60 }), { at: [20, 30], yaw: 90, camera: 'fixed' }));
    const p = w.$gamePlayer, map = w.$gameMap;
    p.center(p._realX, p._realY);
    const x0 = map.displayX(), seen = p.scrolledX();
    w.Reactor3D.Camera.held.add('right');          // the fixed view: right on the screen is east
    w.run(180);
    w.Reactor3D.Camera.held.delete('right');
    assert.ok(p._realX > 40, 'it rode east: ' + p._realX);
    assert.ok(Math.abs(map.displayX() - x0 - (p._realX - 20)) < 1e-6, 'the display went with it: ' + (map.displayX() - x0) + ' for ' + (p._realX - 20));
    assert.ok(Math.abs(p.scrolledX() - seen) < 1e-6, 'so it stays where it was on the screen');
});

test('a jump of RPG Maker\'s own aboard is the grid\'s until it is down, then the mover has it again', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [20.3, 20.4], yaw: 90 }));
    const p = w.$gamePlayer, e = w.vehicle();
    p.jump(3, 0);
    w.run(1);
    assert.equal(w.drive().grid, 1);
    w.run(60);
    assert.equal(w.drive().grid, 0);
    assert.deepEqual([p._realX, p._realY, e._realX, e._realY], [23, 20, 23, 20]);
    assert.equal(p._vehicleType, 'reactor');
    w.keys.up = true;
    w.run(20);
    assert.ok(p._realX > 23.2, 'and it rides on');
});

//-----------------------------------------------------------------------------
// 4.6 The ground under it

test('a curb of half a tile is ridden: the height changes by 0.5 with no stop', () => {
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x >= 30 ? 0.5 : 0) }), { at: [10, 10], yaw: 90 }));
    w.keys.up = true;
    const log = ride(w, 150);
    assert.equal(log.stops, 0);
    assert.equal(log.air, 0, 'rolled, not flown');
    assert.equal(w.drive().alt, 0.5);
    assert.ok(w.where().x > 35);
    assert.ok(log.maxRise <= 0.25 + 1e-9, 'each axle up in its own tick: ' + log.maxRise);
    // And back down it.
    const back = driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x >= 30 ? 0.5 : 0) }), { at: [40, 10], yaw: 270 }));
    back.keys.up = true;
    const down = ride(back, 150);
    assert.equal(down.stops, 0);
    assert.equal(back.drive().alt, 0);
});

test('off a three-tile ledge at top speed: in the air 0.6 s, down 12 tiles out, nobody hurt', () => {
    const w = driveWorld(Object.assign(floor({ width: 160, height: 20, ground: x => (x < 80 ? 3 : 0), physics: { fallDamage: true, fallFrom: 1, fallPercent: 50 } }), { at: [60, 10], yaw: 90 }));
    const landed = on(w, 'vehicleLand');
    const hp = w.$gameParty.members().map(actor => actor.hp);
    w.drive().v = 20;
    w.keys.up = true;
    let off = null, down = null, airTicks = 0;
    const log = ride(w, 200, (t, d) => {
        if (d.air) { airTicks++; if (!off) off = w.where(); assert.equal(w.$gamePlayer._reactorRiding, true); assert.equal(w.ReactorPhysics.isAirborne(w.$gamePlayer), false, 'a rider keeps the riding pose in the air'); }
        else if (off && !down) { down = w.where(); return false; }
    });
    assert.ok(off && down);
    assert.ok(within(airTicks / 60, 0.6, 0.05), 'airborne ' + airTicks + ' ticks');
    assert.ok(within(down.x - off.x, 12, 0.05), 'landed ' + (down.x - off.x) + ' tiles out');
    assert.equal(w.drive().alt, 0);
    assert.ok(w.drive().v > 19, 'it keeps its speed');
    assert.equal(landed.length, 1);
    assert.ok(near(landed[0].fall, 3, 0.05));
    assert.equal(landed[0].vehicle, w.$gameMap.mapId() + ':' + w.vehicleId);
    assert.equal(landed[0].type, 1);
    assert.deepEqual(w.$gameParty.members().map(actor => actor.hp), hp, 'no fall damage aboard');
    assert.ok(log.maxRise <= STEP);
});

test('the jump: 0.75 tile and 0.6 s on Earth, 1.5 s on the Moon, none where the map does not jump', () => {
    const jump = (physics, type) => {
        const w = driveWorld(Object.assign(floor({ width: 200, height: 20, physics }), { at: [10, 10], yaw: 90, type }));
        w.keys.up = true;
        w.run(180);
        const x0 = w.where().x;
        w.press('jump');
        let air = 0, peak = 0;
        for (let t = 0; t < 400; t++) { w.run(1); const d = w.drive(); if (d.air) { air++; peak = Math.max(peak, d.alt); } else if (air) break; }
        return { air, peak, length: w.where().x - x0 };
    };
    const earth = jump(null);
    assert.ok(near(earth.peak, 0.75, 0.01), 'peak ' + earth.peak);
    assert.ok(within(earth.air / 60, 0.6, 0.05), earth.air + ' ticks');
    assert.ok(earth.length > 10.5 && earth.length < 12.5, 'it keeps going: ' + earth.length);
    const moon = jump({ gravity: 0.166 });
    assert.ok(within(moon.air / 60, 1.5, 0.05), moon.air + ' ticks');
    assert.ok(near(moon.peak, 0.75, 0.01));
    assert.equal(jump({ jump: false }).air, 0, 'Jumping off on the map: no jump');
    assert.equal(jump(null, { handling: { jump: 0 } }).air, 0, 'a type that does not jump');
    const still = driveWorld(Object.assign(floor({ width: 200, height: 20 }), { at: [10, 10], yaw: 90, type: { handling: { jump: 0 } } }));
    const landed = on(still, 'vehicleLand');
    still.keys.up = true;
    still.run(30);
    still.press('jump');
    still.run(5);
    assert.equal(landed.length, 0, 'it never leaves the ground, so it never lands');
});

test('a jump under an overhang lands where it left: a ledge overhead is no ground for a wheel', () => {
    // A slab two tiles up over the tiles ahead of the middle: on the ground it is walked under.
    const slab = [21, 22, 23].map(x => ({ kind: 'block', x, y: 10, z: 2 }));
    const w = driveWorld(Object.assign(floor({ width: 60, height: 20, pieces: slab }), { at: [20, 10], yaw: 90 }));
    const R = w.Reactor3D, map = w.$dataMap;
    assert.equal(R.groundHeightAt(map, 21.725, 10.5, 0), 0, 'from the ground the slab is overhead');
    assert.ok(R.groundHeightAt(map, 21.725, 10.5, 0.7) > 2, 'from a jump\'s height the height function answers its top');
    w.run(5);
    w.press('jump');
    const log = ride(w, 80);
    assert.ok(log.air > 20, 'it jumped: ' + log.air + ' ticks');
    assert.ok(log.maxRise < 0.1, 'and was not put on the slab: ' + log.maxRise);
    assert.equal(w.drive().alt, 0);
    assert.equal(w.drive().gf, 0);
});

test('a jump into rising ground: the wheels meet it as it comes up, and the height never pops', () => {
    // Flat, then a slope a walker walks (half a tile a tile): at speed it rises faster than a jump does.
    const w = driveWorld(Object.assign(floor({ width: 200, height: 20, terrain: x => (x <= 60 ? 0 : (x - 60) * 0.5) }), { at: [30, 10], yaw: 90 }));
    w.drive().v = 20;
    w.keys.up = true;
    w.run(82);                                     // its front axle is at the foot of the slope
    assert.ok(w.where().x + AXLE > 57 && w.where().x + AXLE < 60, 'at the foot: ' + w.where().x);
    w.press('jump');
    let under = 0;
    const log = ride(w, 120, (t, d) => { if (d.alt < (d.gf + d.gr) / 2 - 1e-9) under++; });
    assert.ok(log.air > 0 && log.air < 12, 'the ground met it within a few ticks: ' + log.air);
    assert.equal(under, 0, 'it is never under the ground');
    assert.ok(log.maxRise <= 0.35, 'no pop: the most it rose in a tick is ' + log.maxRise);
    assert.equal(log.stops, 0);
    assert.ok(w.drive().alt > 10, 'and it rode on up the slope');
});

test('a crest taken at speed gives small air, never a launch', () => {
    // Up a slope a walker walks (half a tile a tile) and off its end, at speed.
    const w = driveWorld(Object.assign(floor({ width: 200, height: 20, terrain: x => (x < 40 ? 0 : x <= 60 ? (x - 40) * 0.5 : 0) }), { at: [20, 10], yaw: 90 }));
    w.drive().v = 20;
    w.keys.up = true;
    let top = 0, rising = 0, air = 0;
    const log = ride(w, 200, (t, d) => { top = Math.max(top, d.alt); if (d.air) { air++; rising = Math.max(rising, d.vz); } });
    assert.ok(air > 10, 'it left the ground at the end of the slope: ' + air + ' ticks');
    assert.ok(rising > 0.05 && rising <= 0.0826, 'carried up at no more than the jump\'s own speed: ' + rising);
    assert.ok(top < 10 + 0.76, 'so no higher over the lip than a jump: ' + top);
    assert.equal(log.stops, 0);
    assert.ok(log.maxRise <= STEP, 'rise in a tick ' + log.maxRise);
});

test('full lock beside a wall at 12 tiles a second lifts neither axle', () => {
    const w = driveWorld(Object.assign(floor({ width: 120, height: 40, pieces: wallRow(20, 21, 21).concat(Array.from({ length: 90 }, (_, i) => ({ kind: 'wall', x: 10 + i, y: 21 }))) }), { at: [15, 19], yaw: 90 }));
    const R = w.Reactor3D, map = w.$dataMap;
    w.drive().v = 12;
    w.keys.up = true; w.keys.right = true;         // toward the wall along row 21
    const log = ride(w, 240, (t, d) => {
        assert.equal(d.gf, 0, 'front axle at tick ' + t);
        assert.equal(d.gr, 0, 'rear axle at tick ' + t);
        const q = w.where(), hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw);
        assert.equal(R.groundHeightAt(map, q.x + hx * AXLE, q.y + hz * AXLE, 0), 0, 'the front circle\'s middle is never over the wall');
        assert.equal(R.groundHeightAt(map, q.x - hx * AXLE, q.y - hz * AXLE, 0), 0, 'nor the rear one\'s');
    });
    assert.equal(w.drive().alt, 0);
    assert.ok(log.slides > 0 || log.stops > 0, 'it met the wall');
});

test('off a ledge over a lake: it flies its whole arc, splashes, and is back on the ledge with its rider', () => {
    const lake = { x0: 82, y0: 0, x1: 159, y1: 19, level: 0 };
    const w = driveWorld(Object.assign(floor({ width: 160, height: 20, ground: x => (x < 80 ? 3 : x < 82 ? 0 : -2), water: [lake] }), { at: [40, 10], yaw: 90 }));
    const splashes = on(w, 'vehicleSplash');
    const p = w.$gamePlayer;
    w.keys.up = true;
    w.run(130);                                   // the last dry place is noted on the way
    w.drive().v = 20;
    let wet = -1, off = null, refusedInAir = 0, faded = 255;
    for (let t = 0; t < 400; t++) {
        w.run(1); w.$gameScreen.update();
        const d = w.drive(), last = w.Drive.last;
        if (last.air && last.refused) refusedInAir++;
        if (d.air && !off) off = w.where();
        if (splashes.length && wet < 0) { wet = t; w.keys.up = false; }
        if (wet >= 0) faded = Math.min(faded, w.$gameScreen.brightness());
        if (wet >= 0 && t === wet + 60) break;
    }
    assert.ok(off && wet > 0);
    assert.equal(refusedInAir, 0, 'nothing holds a jump back over water');
    assert.equal(splashes.length, 1);
    assert.ok(near(splashes[0].depth, 2, 0.01), 'depth ' + splashes[0].depth);
    assert.ok(p._reactorSplash, 'the map\'s own splash');
    assert.equal(faded, 0, 'the screen went dark');
    assert.equal(w.$gameScreen.brightness(), 255, 'and came back');
    assert.equal(p._vehicleType, 'reactor', 'the rider is aboard');
    const q = w.where();
    assert.ok(q.x < 80 && q.x > 60, 'on the ledge: ' + q.x);
    assert.equal(w.drive().alt, 3);
    assert.equal(w.drive().v, 0);
    assert.equal(w.drive().air, 0);
    assert.ok(near(w.drive().yaw, 90 * DEG, 1e-9), 'facing as it faced there');
    assert.deepEqual([w.vehicle()._realX, w.vehicle()._realY], [p._realX, p._realY]);
    // It rides on.
    w.keys.up = true;
    w.run(30);
    assert.equal(w.drive().back, 0);
    assert.ok(w.drive().v > 3);
});

test('an event that has already darkened the screen keeps it dark: the vehicle is only put back', () => {
    const w = driveWorld(Object.assign(floor({ width: 160, height: 20, ground: x => (x < 80 ? 3 : -2), water: [{ x0: 80, y0: 0, x1: 159, y1: 19, level: 0 }] }), { at: [60, 10], yaw: 90 }));
    w.$gameScreen.startFadeOut(1); w.$gameScreen.update();
    assert.equal(w.$gameScreen.brightness(), 0);
    w.drive().v = 20; w.keys.up = true;
    let back = false;
    for (let t = 0; t < 300 && !back; t++) { w.run(1); w.$gameScreen.update(); if (w.drive().back > 0) back = true; }
    assert.ok(back);
    for (let t = 0; t < 60; t++) { w.run(1); w.$gameScreen.update(); }
    assert.equal(w.$gameScreen.brightness(), 0, 'the event\'s darkness is its own');
    assert.ok(w.where().x < 80);
});

test('a vehicle parked across a curb keeps its height and pitch', () => {
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x >= 30 ? 0.5 : 0) }), { at: [27, 10], yaw: 90 }));
    const p = w.$gamePlayer, e = w.vehicle();
    w.keys.up = true;
    ride(w, 300, (t, d) => { if (d.gf === 0.5 && d.gr === 0) { w.keys.up = false; w.keys.down = true; } if (w.keys.down && d.v === 0) return false; });
    w.keys.down = false;
    w.run(30);
    assert.deepEqual([w.drive().gf, w.drive().gr], [0.5, 0], 'stopped with its front wheel on the curb');
    assert.equal(e._reactorAlt, 0.25);
    assert.ok(near(e._rrPitch, Math.atan2(0.5, 2 * AXLE), 1e-3), 'nose up the curb: ' + e._rrPitch);
    // Parked as getting off leaves it: the mover's flag stays on the event, the party is on foot.
    e._rrFree = 1; e._rrBoarded = false; e._through = false;
    p._vehicleType = 'walk'; p._rrFree = 0; p._rrRide = null; p._rrDrive = null; p._rrSeated = false; p._reactorRiding = false;
    p.locate(5, 5);
    const kept = [e._realX, e._realY, e._reactorGround, e._reactorAlt, e._reactorAir, e._rrPitch, e._rrYaw];
    w.run(600);
    assert.deepEqual([e._realX, e._realY, e._reactorGround, e._reactorAlt, e._reactorAir, e._rrPitch, e._rrYaw], kept);
});

//-----------------------------------------------------------------------------
// 4.7 What stops it

test('a wall met square: a dead stop, a fifth of a tile short, the bump told once', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 140, pieces: wallRow(50, 5, 134) }), { at: [30, 30], yaw: 90 }));
    const bumps = on(w, 'vehicleBump');
    w.keys.up = true;
    const log = ride(w, 200, (t, d, last) => !last.stopped);
    assert.ok(log.firstStop, 'it stopped');
    assert.equal(w.drive().v, 0);
    const rim = w.where().x + AXLE + RADIUS;
    assert.ok(near(50 - rim, 0.2, 0.08), 'its front stands ' + (50 - rim) + ' tile from the wall');
    assert.equal(bumps.length, 1);
    assert.ok(bumps[0].speed > 10);
    assert.equal(bumps[0].eventId, w.vehicleId);
    // Held against the wall it does not thud again: under the bump's speed a stop is silent, and it turns itself along the wall.
    const after = ride(w, 240);
    assert.equal(bumps.length, 1);
    assert.ok(after.slides > 10, 'W held: it turns along the wall');
    assert.ok(w.drive().v > 5, 'and rides off: ' + w.drive().v);
    assert.equal(w.drive().alt, 0);
});

test('a wall met at a glance is slid along: no stop, a little speed lost, the heading eased along it', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 140, pieces: wallRow(50, 2, 137) }), { at: [42, 10], yaw: 150 }));
    const bumps = on(w, 'vehicleBump');
    w.keys.up = true;
    const log = ride(w, 260);
    assert.equal(log.stops, 0);
    assert.equal(bumps.length, 0);
    assert.ok(log.slides > 5, 'slides ' + log.slides);
    assert.ok(log.refused.rise > 0);
    assert.ok(w.drive().v > 10, 'still moving: ' + w.drive().v);
    assert.ok(near(w.drive().yaw, 180 * DEG, 4 * DEG), 'along the wall: ' + w.drive().yaw / DEG);
    assert.ok(w.where().x < 50, 'never in it');
});

test('a wall 45 degrees off the map\'s axes, met at 50 degrees, is slid along with no stop', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 80, pieces: [{ kind: 'box', x: 40, y: 40, z: 0, size: [50, 4, 0.5], angle: 45 }] }), { at: [20, 40], yaw: 85 }));
    w.keys.up = true;
    const log = ride(w, 300);
    assert.equal(log.stops, 0, 'stops ' + log.stops);
    assert.ok(log.slides >= 10, 'slides ' + log.slides);
    assert.ok(near(w.drive().yaw, 135 * DEG, 3 * DEG), 'riding along it: ' + w.drive().yaw / DEG);
    assert.ok(w.drive().v > 15);
});

test('a rail the ground rule does not see stops it: the drawn shape, at its own height', () => {
    // A bar 0.18 tall and 0.16 wide lying on the border of two tiles, as the Demo's bridge rails are built.
    const world = z => driveWorld(Object.assign(floor({ width: 80, height: 40, pieces: [{ kind: 'box', x: 40, y: 20, z, size: [0.16, 0.18, 15], angle: 0, offset: [-0.5, 0] }] }), { at: [30, 24], yaw: 90 }));
    for (const z of [0.75, 1, 1.25, 2, 2.25]) {
        const w = world(z), R = w.Reactor3D, map = w.$dataMap;
        assert.equal(R.groundHeightAt(map, 39.9, 24.5, 0), 0, 'the ground rule sees nothing of it');
        assert.equal(R.groundHeightAt(map, 40.1, 24.5, 0), 0);
        w.keys.up = true;
        const log = ride(w, 200, (t, d, last) => !last.stopped);
        assert.ok(log.firstStop, 'a rail ' + z + ' over the ground stops it');
        assert.deepEqual(Object.keys(log.refused), ['solid']);
        assert.ok(w.where().x + AXLE + RADIUS <= 40, 'short of it: ' + (w.where().x + AXLE + RADIUS));
    }
    // Underfoot and overhead it is no obstacle.
    for (const z of [0.25, 3]) {
        const w = world(z);
        w.keys.up = true;
        const log = ride(w, 150);
        assert.deepEqual(log.refused, {}, 'a bar ' + z + ' over the ground is passed');
        assert.ok(w.where().x > 45);
    }
    const w = world(1), map = w.$dataMap;
    assert.equal(w.Drive.solidAhead(map, 38.5, 24.5, 1, 0, 3, 0.6, 2.4), true);
    assert.equal(w.Drive.solidAhead(map, 38.5, 24.5, 1, 0, 1, 0.6, 2.4), false, 'not within reach yet');
    assert.equal(w.Drive.solidAhead(map, 38.5, 24.5, -1, 0, 3, 0.6, 2.4), false, 'not behind');
    assert.equal(w.Drive.solidAhead(map, 38.5, 24.5, 1, 0, 3, 1.3, 2.4), false, 'not above it');
    assert.equal(w.Drive.solidAhead(map, 38.5, 24.5, 0.6, 0.8, 3, 0.6, 2.4), true, 'met at an angle too');
});

test('a shut door stops it and an open doorway does not', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [30, 20], yaw: 90 }));
    const R = w.Reactor3D, map = w.$dataMap;
    const index = R.lineIndex(map);
    // A leaf across cell (40, 20), as the world lists a door's.
    const leaf = R.lineSolid((u, y, v) => [40 + u, y, 20 + v], 0.44, 0, 0, 0.56, 3.6, 1, 0);
    leaf.door = { id: 1 };
    index.cells.set(20 * 65536 + 40, [leaf]);
    let shut = true;
    R.doorShut = () => shut;
    assert.equal(w.Drive.solidAhead(map, 38.5, 20.5, 1, 0, 3, 0.6, 2.4), true);
    shut = false;
    assert.equal(w.Drive.solidAhead(map, 38.5, 20.5, 1, 0, 3, 0.6, 2.4), false);
});

test('water: a tile deep is ridden into (nothing refuses it), a wade is driven through at 70% of its speed', () => {
    const lake = depth => driveWorld(Object.assign(floor({ width: 160, height: 20, ground: x => (x >= 40 ? -depth : 0), water: [{ x0: 40, y0: 0, x1: 159, y1: 19, level: 0 }] }), { at: [20, 10], yaw: 90 }));
    const deep = lake(1);
    deep.keys.up = true;
    const log = ride(deep, 200);
    assert.equal(log.refused.water, undefined, 'the shore refuses nothing: ' + JSON.stringify(log.refused));
    assert.ok(log.air > 0, 'it rode off the bank into the lake');
    // (What happens in water deeper than its wade is the world's: ReactorVehicles.sink, audit-20261010-vehicles.test.cjs.)
    const wade = lake(0.3);
    wade.keys.up = true;
    const through = ride(wade, 600);
    assert.equal(through.stops, 0);
    assert.ok(wade.where().x > 100, 'through it');
    assert.ok(near(wade.drive().v, 14, 0.05), '70% of 20: ' + wade.drive().v);
    assert.equal(wade.drive().alt, -0.3, 'on its bed');
});

test('a ledge of a tile is a wall; half a tile is rolled up', () => {
    const ledge = rise => driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x >= 40 ? rise : 0) }), { at: [20, 10], yaw: 90 }));
    const high = ledge(1);
    high.keys.up = true;
    const log = ride(high, 300, (t, d, last) => !last.stopped);
    assert.ok(log.firstStop && log.refused.rise > 0);
    assert.equal(high.drive().alt, 0, 'never lifted onto it');
    assert.ok(high.where().x + AXLE + RADIUS <= 40 + 1e-9);
    const low = ledge(0.5);
    low.keys.up = true;
    const up = ride(low, 300);
    assert.equal(up.stops, 0);
    assert.equal(low.drive().alt, 0.5);
});

test('ground too steep to walk is a wall at its foot, and a slope a walker walks is ridden', () => {
    // Rolling ground: nothing of it is a step, so only its steepness can stop a wheel.
    const hill = grade => driveWorld(Object.assign(floor({ width: 120, height: 20, terrain: x => (x <= 40 ? 0 : Math.min(12, (x - 40) * grade)) }), { at: [20, 10], yaw: 90 }));
    const steep = hill(1);
    steep.keys.up = true;
    const stopped = ride(steep, 300);
    assert.ok(stopped.refused.steep > 0, JSON.stringify(stopped.refused));
    assert.ok(steep.drive().alt < 0.5, 'stopped at the foot, not two tiles up: ' + steep.drive().alt);
    assert.ok(steep.where().x + AXLE < 41, 'its leading axle is not on the slope: ' + steep.where().x);
    const gentle = hill(0.5);
    gentle.keys.up = true;
    const log = ride(gentle, 300);
    assert.equal(log.stops, 0);
    assert.ok(!log.refused.steep);
    assert.equal(gentle.drive().alt, 12);
});

test('neither circle\'s middle comes over ground it did not roll onto', () => {
    // The corner of a wall cut by the leading circle: its three rim points are already past it.
    const corner = driveWorld(Object.assign(floor({ width: 60, height: 40, ground: (x, y) => (x === 40 && y === 20 ? 2 : 0) }), { at: [30, 30], yaw: 45 }));
    const h = Math.SQRT1_2, type = corner.type();
    const flat = { yaw: 45 * DEG, alt: 0, gf: 0, gr: 0, air: 0 };
    // Its leading middle at (39.91, 20.19), going north-east: a fifth of a tile on it is over the wall's corner.
    assert.equal(corner.Drive.probe(flat, 39.91 - h * AXLE, 20.19 + h * AXLE, 0.2, type), 'rise');
    assert.equal(corner.Drive.probe(flat, 39.91 - h * AXLE, 20.19 + h * AXLE + 1.5, 0.2, type), '', 'a tile and a half south of it the same step is free');
    // The trailing circle: a ledge the rear axle never rolled up. (The vehicle was put down across it.)
    const ledge = rise => driveWorld(Object.assign(floor({ width: 60, height: 40, ground: x => (x >= 30 ? rise : 0) }), { at: [10, 10], yaw: 90 }));
    const across = rise => ({ yaw: 90 * DEG, alt: rise / 2, gf: rise, gr: 0, air: 0 });
    assert.equal(ledge(1).Drive.probe(across(1), 29.9 + AXLE, 20.5, 0.2, type), 'tail', 'its rear is not dragged up a ledge of a tile');
    assert.equal(ledge(0.5).Drive.probe(across(0.5), 29.9 + AXLE, 20.5, 0.2, type), '', 'half a tile it rolls up');
    // Walked round where it stands beside a bank of the ground two tiles high: the turn stops where a circle's
    // middle would come over it.
    const w = driveWorld(Object.assign(floor({ width: 60, height: 40, ground: (x, y) => (y >= 21 ? 2 : 0) }), { at: [30, 19.9], yaw: 90 }));
    const R = w.Reactor3D, map = w.$dataMap;
    w.keys.right = true;                           // the bars to the right, no throttle: walked round toward the bank
    let turned = 0, refusedTurns = 0;
    ride(w, 180, (t, d, last) => {
        const q = w.where(), hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw);
        assert.equal(R.groundHeightAt(map, q.x + hx * AXLE, q.y + hz * AXLE, 0), 0, 'the front circle\'s middle is never over the bank (tick ' + t + ')');
        assert.equal(R.groundHeightAt(map, q.x - hx * AXLE, q.y - hz * AXLE, 0), 0);
        if (last.turned) turned++; else if (d.turn !== 0) refusedTurns++;
    });
    assert.ok(turned > 5 && refusedTurns > 60, 'it turned until the bank, then no further: ' + turned + ' ticks turned, ' + refusedTurns + ' refused');
    assert.ok(w.where().yaw > 100 && w.where().yaw < 125, 'heading ' + w.where().yaw);
    assert.equal(w.drive().alt, 0);
    assert.deepEqual([w.where().x, w.where().y], [30.5, 20.4], 'and it never left its place');
});

test('only the carried event copies the player: one parked by the mover stands where it was put', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [20, 20], yaw: 90 }));
    const e = w.vehicle();
    e._rrFree = 1;                                 // parked, while the rider's state has not caught up
    w.keys.up = true;
    w.run(30);
    assert.ok(w.$gamePlayer._realX > 20.2);
    assert.deepEqual([e._realX, e._realY, e._x, e._y], [20, 20, 20, 20]);
});

test('the map\'s border is a wall', () => {
    const w = driveWorld(Object.assign(floor({ width: 60, height: 20 }), { at: [45, 10], yaw: 90 }));
    w.keys.up = true;
    const log = ride(w, 240, (t, d, last) => !last.stopped);
    assert.ok(log.firstStop && log.refused.border > 0);
    assert.ok(w.where().x + AXLE + RADIUS <= 60 + 1e-9);
});

test('tiles RPG Maker\'s flags close stop it, and the walk-through key of a playtest passes them', () => {
    const closed = (mapData, ctx) => {
        ctx.$dataTilesets[1].flags[1538] = 0x0f;
        for (let y = 0; y < mapData.height; y++) mapData.data[y * mapData.width + 40] = 1538;
    };
    const w = driveWorld(Object.assign(floor({ width: 80, height: 20 }), { at: [30, 10], yaw: 90, prepare: closed }));
    w.keys.up = true;
    const log = ride(w, 200, (t, d, last) => !last.stopped);
    assert.ok(log.firstStop && log.refused.tiles > 0, JSON.stringify(log.refused));
    assert.ok(w.where().x + AXLE < 40, 'its leading axle never came onto the closed tile');
    // Ctrl in a playtest: every test but the border and the ground's height is off, as for a walker.
    const through = driveWorld(Object.assign(floor({ width: 80, height: 20, pieces: wallRow(50, 2, 17) }), { at: [30, 10], yaw: 90, prepare: closed }));
    through.$gameTemp._isPlaytest = true;
    through.keys.control = true; through.keys.up = true;
    assert.equal(through.$gamePlayer.isDebugThrough(), true);
    const free = ride(through, 240);
    assert.ok(through.where().x > 55, 'through the closed tiles and the wall: ' + through.where().x);
    assert.equal(through.drive().alt, 0, 'and never lifted onto the wall');
    assert.equal(free.maxRise, 0, 'at any tick: a read no wheel rolled onto is not ground');
    assert.equal(free.air, 0);
    assert.ok(free.refused.border > 0, 'the border still stands');
    assert.ok(through.where().x <= 80 - RADIUS + 1e-9, 'and no further than its circle allows');
});

test('a villager in the way: slid round at a clip, a thud head on, and never pushed', () => {
    const lane = y => driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [10, y], yaw: 90, events: [event(3, 30, 20)] }));
    const clip = lane(20.75);
    clip.keys.up = true;
    const round = ride(clip, 220);
    assert.equal(round.stops, 0, 'clipping his tile, it slides round');
    assert.ok(round.refused.event > 0);
    assert.ok(clip.where().x > 34);
    const head = lane(20);
    const bumps = on(head, 'vehicleBump');
    head.keys.up = true;
    const hit = ride(head, 300);
    assert.equal(bumps.length, 1, 'head on: one thud');
    assert.ok(head.where().x > 34, 'then round him with the throttle held: ' + head.where().x);
    for (const w of [clip, head]) { const npc = w.$gameMap.event(3); assert.deepEqual([npc._realX, npc._realY], [30, 20]); }
    assert.ok(hit.refused.event > 0);
});

test('an event with a touch trigger starts once per contact and stops the vehicle', () => {
    const touched = event(3, 30, 20, { pages: [page({ trigger: 2, priorityType: 1, list: [{ code: 355, indent: 0, parameters: ['$gameTemp._touched = ($gameTemp._touched || 0) + 1'] }, { code: 230, indent: 0, parameters: [30] }, { code: 0, indent: 0, parameters: [] }] })] });
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [10, 20], yaw: 90, events: [touched] }));
    w.keys.up = true;
    ride(w, 130);
    assert.equal(w.$gameTemp._touched, 1);
    assert.equal(w.drive().v, 0, 'stopped by the event it started');
    ride(w, 20);
    assert.equal(w.$gameTemp._touched, 1, 'held against him while his event runs: not again');
    // His event ends and the throttle is still held against him: the same contact, so he does not start again.
    let against = 0;
    ride(w, 60, (t, d, last) => { if (w.Drive.REFUSALS[last.refused] === 'event') against++; });
    assert.ok(against > 0, 'still pressing against him');
    assert.equal(w.$gameTemp._touched, 1, 'once per contact');
});

test('refused both ways with a key held, it is put back on the last dry place under a dip to black', () => {
    // A slot between two walls: neither way gives.
    const w = driveWorld(Object.assign(floor({ width: 60, height: 30, pieces: wallRow(22, 8, 12).concat(wallRow(18, 8, 12)) }), { at: [20, 10], yaw: 90 }));
    const d = w.drive();
    d.dry[0] = 40; d.dry[1] = 20; d.dry[2] = 180 * DEG; d.dry[3] = 0;
    let dark = 255;
    const step = n => { for (let t = 0; t < n; t++) { w.run(1); w.$gameScreen.update(); dark = Math.min(dark, w.$gameScreen.brightness()); } };
    w.keys.up = true;
    step(20);
    assert.equal(d.back, 0, 'held against one wall it just stands');
    assert.deepEqual([w.where().x, w.where().y], [20.5, 10.5]);
    w.keys.up = false; w.keys.down = true;
    for (let t = 0; t < 40 && !d.back; t++) step(1);
    assert.ok(d.back > 0, 'both ways refused: the last resort');
    w.keys.down = false;
    step(20);
    assert.deepEqual([w.where().x, w.where().y], [40.5, 20.5]);
    assert.ok(near(d.yaw, 180 * DEG, 1e-9));
    assert.equal(d.v, 0);
    assert.ok(dark < 255, 'under a dip to black');
    assert.equal(w.$gameScreen.brightness(), 255);
    assert.equal(w.$gamePlayer._vehicleType, 'reactor');
});

//-----------------------------------------------------------------------------
// 4.8 Tile events, encounters, transfers

test('a line of ten Player Touch events crossed at top speed: each fires once, in order, and it stands on each one\'s tile', () => {
    const line = [];
    for (let i = 0; i < 10; i++) {
        line.push(event(10 + i, 30 + i * 2, 10, { pages: [page({ trigger: 1, priorityType: 0, list: [
            { code: 355, indent: 0, parameters: ['($gameTemp._fired = $gameTemp._fired || []).push([' + (10 + i) + ', $gamePlayer.x, $gamePlayer.y, $gamePlayer._rrDrive.v])'] },
            { code: 0, indent: 0, parameters: [] }] })] }));
    }
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20 }), { at: [10, 10], yaw: 90, events: line }));
    w.drive().v = 20;
    w.keys.up = true;
    let stoodOnFirst = null;
    ride(w, 600, (t, d) => { if (w.$gameTemp._fired && w.$gameTemp._fired.length === 1 && stoodOnFirst === null) stoodOnFirst = [w.$gamePlayer.x, d.v]; });
    const fired = Array.from(w.$gameTemp._fired || [], entry => Array.from(entry));
    assert.deepEqual(fired.map(entry => entry[0]), [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    fired.forEach((entry, i) => {
        assert.deepEqual([entry[1], entry[2]], [30 + i * 2, 10], 'event ' + entry[0] + ' ran with the vehicle on its tile');
        assert.equal(entry[3], 0, 'and stopped');
    });
    assert.ok(w.where().x > 55, 'it rode on after the last');
});

test('a tick that enters two tiles does not enter the second when the first starts an event', () => {
    const strip = event(10, 30, 10, { pages: [page({ trigger: 1, priorityType: 0, list: [{ code: 230, indent: 0, parameters: [5] }, { code: 0, indent: 0, parameters: [] }] })] });
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20 }), { at: [10, 10], yaw: 90, events: [strip], type: { handling: { speed: 30, turnRate: 150 } } }));
    w.drive().v = 30;                              // half a tile a tick: two steps of a quarter
    w.keys.up = true;
    ride(w, 120, () => !w.$gameMap.isEventRunning());
    assert.equal(w.$gamePlayer.x, 30);
    assert.ok(w.where().x < 30.5, 'its middle is left where it crossed into the tile: ' + w.where().x);
    assert.equal(w.drive().v, 0);
});

test('a damage floor acts on each tile entered aboard, as on foot', () => {
    const acid = (mapData, ctx) => {
        ctx.$dataTilesets[1].flags[1537] = 0x100;
        for (const x of [30, 31, 32]) mapData.data[10 * mapData.width + x] = 1537;
    };
    const w = driveWorld(Object.assign(floor({ width: 80, height: 20 }), { at: [20, 10], yaw: 90, prepare: acid }));
    const hp = w.$gameParty.members().map(actor => actor.hp), steps = w.$gameParty.steps();
    w.keys.up = true;
    ride(w, 150);
    assert.ok(w.where().x > 36);
    assert.deepEqual(w.$gameParty.members().map(actor => actor.hp), hp.map(value => value - 30), 'ten a tile, three tiles');
    assert.equal(w.$gameParty.steps(), steps, 'steps are not counted aboard');
});

test('encounters by the type: none, half, normal, per tile entered', () => {
    const count = encounters => {
        const w = driveWorld(Object.assign(floor({ width: 80, height: 20 }), { at: [20, 10], yaw: 90, type: { encounters } }));
        w.$gamePlayer._encounterCount = 100;
        w.keys.up = true;
        let entered = 0;
        ride(w, 150, (t, d, last) => { entered += last.entered; });
        return [100 - w.$gamePlayer._encounterCount, entered];
    };
    const [none] = count('none'), [half, tiles] = count('half'), [normal] = count('normal');
    assert.ok(tiles > 10);
    assert.equal(none, 0);
    assert.equal(normal, tiles);
    assert.equal(half, tiles / 2);
});

test('a transfer to another map: the vehicle is parked off the strip, the party lands on foot, nothing throws', () => {
    // A Player Touch event that transfers, as a town's edge. The other map has no event of the vehicle's id.
    const strip = event(10, 30, 10, { pages: [page({ trigger: 1, priorityType: 0, list: [{ code: 201, indent: 0, parameters: [0, 2, 4, 4, 2, 0] }, { code: 0, indent: 0, parameters: [] }] })] });
    const w = driveWorld(Object.assign(floor({ width: 80, height: 20 }), { at: [20, 10], yaw: 90, events: [strip] }));
    const p = w.$gamePlayer, e = w.vehicle();
    p._rrWas = { speed: 5, transparent: false };       // dashing boots: the speed it had before boarding
    p._moveSpeed = 4;
    w.keys.up = true;
    ride(w, 200, () => !p.isTransferring());
    assert.equal(p.isTransferring(), true);
    assert.equal(w.drive().leave, 'transfer');
    assert.equal(w.drive().v, 0);
    assert.equal(e._rrFree, 1, 'parked');
    assert.equal(e._through, false, 'and solid again');
    // The picture does not change before the scene has gone: the vehicle stays under its rider, on the strip.
    const stopped = [p._realX, p._realY], heading = e._rrYaw;
    assert.deepEqual([p._x, p._y], [30, 10], 'the party stopped on the strip');
    assert.deepEqual([e._realX, e._realY, e._x, e._y], stopped.concat([30, 10]), 'the vehicle is drawn where it stopped');
    // The place written for the map to remember is off the strip already (the world's own file keeps that memory).
    if (w.loadedWorld) {
        const kept = Object.values(w.$gameMap._rrVehicles.at)[0];
        assert.ok(kept && Math.round(kept.x) !== 30, 'remembered off the strip: ' + JSON.stringify(kept));
    }
    // The fade: the scene keeps updating and nothing moves.
    w.run(30);
    assert.deepEqual([e._realX, e._realY, p._realX, p._realY, e._rrYaw], stopped.concat(stopped, [heading]));
    assert.equal(p._vehicleType, 'reactor', 'the rider stays seated through the fade');
    // The next scene: the new map's data is loaded, the events are still the last map's.
    const others = w.$gameMap.events().filter(one => one !== e);
    const other = JSON.parse(JSON.stringify(w.$dataMap));
    other.events = [null, event(1, 2, 2)];
    w.$dataMap = other;
    assert.doesNotThrow(() => p.performTransfer());
    // As this map is left the vehicle's event takes its place off the strip: never left on a tile an event holds.
    assert.ok(e._x !== 30 || e._y !== 10, 'never left on the strip: ' + e._x + ',' + e._y);
    assert.ok(e._realX < stopped[0] && e._realX > stopped[0] - 2.5 && e._realY === stopped[1], 'the last place before it: ' + e._realX);
    assert.equal(others.filter(one => one._x === e._x && one._y === e._y).length, 0, 'on a tile no event holds');
    assert.equal(e._rrFree, 1);
    assert.equal(p._vehicleType, 'walk');
    assert.equal(p._rrFree, 0);
    assert.equal(p._rrDrive, null);
    assert.equal(p._rrRide, null);
    assert.equal(p._rrSeated, false);
    assert.equal(p._reactorRiding, false);
    assert.equal(p._moveSpeed, 5, 'the speed it had before boarding');
    assert.deepEqual([p.x, p.y, w.$gameMap.mapId()], [4, 4, 2]);
    assert.equal(p.isMoving(), false);
    assert.doesNotThrow(() => w.run(30));
    w.keys.up = false;
});

test('a transfer asked for off any event\'s tile, in mid-air, and taken back for one on this map', () => {
    // By a script, in the open: the vehicle is parked exactly where it stopped, not at the tile's edge it came in by.
    const w = driveWorld(Object.assign(floor({ width: 80, height: 20 }), { at: [20, 10], yaw: 90 }));
    const p = w.$gamePlayer, e = w.vehicle();
    w.keys.up = true;
    w.run(50);
    const followers = p._followers, back = [];
    const aboard = followers.rrAboard;
    followers.rrAboard = function(on, instant) { back.push([!!on, !!instant]); return typeof aboard === 'function' ? aboard.apply(this, arguments) : undefined; };
    p.reserveTransfer(2, 4, 4, 2, 0);
    const stopped = [p._realX, p._realY];
    assert.ok(stopped[0] !== Math.round(stopped[0]), 'stopped between tiles: ' + stopped[0]);
    w.$dataMap = Object.assign(JSON.parse(JSON.stringify(w.$dataMap)), { events: [null, event(1, 2, 2)] });
    p.performTransfer();
    assert.deepEqual([e._realX, e._realY], stopped, 'parked where it stopped');
    assert.ok(back.some(call => !call[0] && call[1]), 'the followers are brought back at once: ' + JSON.stringify(back));
    // In mid-air: it stands in the air through the fade, its rider on it, and does not fall out from under him.
    const air = driveWorld(Object.assign(floor({ width: 200, height: 20 }), { at: [20, 10], yaw: 90 }));
    air.keys.up = true;
    air.run(120);
    air.press('jump');
    air.run(8);
    assert.equal(air.drive().air, 1);
    air.$gamePlayer.reserveTransfer(2, 4, 4, 2, 0);
    const held = [air.drive().alt, air.$gamePlayer._realX];
    air.run(30);
    assert.deepEqual([air.drive().alt, air.$gamePlayer._realX, air.drive().air], held.concat([1]), 'nothing moves until the scene has gone');
    // Asked for, then replaced by a transfer on this map before the scene went: it comes along, and the controls are back.
    const same = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [20, 10], yaw: 90 }));
    const sp = same.$gamePlayer;
    sp.reserveTransfer(2, 4, 4, 2, 0);
    assert.equal(same.drive().leave, 'transfer');
    sp.reserveTransfer(same.$gameMap.mapId(), 40, 20, 2, 0);
    sp.performTransfer();
    assert.equal(sp._vehicleType, 'reactor');
    assert.equal(same.drive().leave, '', 'the controls are given back');
    same.keys.up = true;
    same.run(40);
    assert.ok(same.drive().v > 3 && sp._realY > 20.3, 'and it rides on, south: ' + sp._realY);
});

test('a reload of the map keeps the place only for the tile it stands on: a transfer elsewhere with a reload goes there', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [40.25, 12.5], yaw: 37 }));
    const p = w.$gamePlayer;
    w.run(3);
    p.reserveTransfer(w.$gameMap.mapId(), 50, 20, 2, 0);
    p.requestMapReload();
    p.performTransfer();
    assert.deepEqual([p._realX, p._realY], [50, 20], 'where the transfer says');
    assert.ok(near(w.drive().yaw, 180 * DEG, 1e-9), 'facing as it says');
});

test('a transfer on the same map brings the vehicle along where it fits, and lands the party on foot where it does not', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40, pieces: wallRow(59, 28, 32).concat(wallRow(61, 28, 32)) }), { at: [20, 10], yaw: 90 }));
    const p = w.$gamePlayer, e = w.vehicle();
    w.keys.up = true;
    w.run(60);
    w.keys.up = false;
    p.reserveTransfer(w.$gameMap.mapId(), 40, 20, 2, 0);
    assert.notEqual(w.drive().leave, 'transfer', 'the same map: nothing is parked');
    p.performTransfer();
    w.run(2);
    assert.equal(p._vehicleType, 'reactor');
    assert.deepEqual([p._realX, p._realY, e._realX, e._realY], [40, 20, 40, 20]);
    assert.equal(w.drive().v, 0, 'at a standstill');
    assert.ok(near(w.drive().yaw, 180 * DEG, 1e-9), 'facing the transfer\'s direction');
    assert.equal(e._rrFree, 2);
    // Between two walls a tile apart, lengthwise across them: no room.
    p.reserveTransfer(w.$gameMap.mapId(), 60, 30, 6, 0);
    p.performTransfer();
    assert.equal(p._vehicleType, 'walk');
    assert.deepEqual([p.x, p.y], [60, 30]);
    assert.equal(e._rrFree, 1, 'the vehicle stays where it was, parked');
    assert.deepEqual([e._realX, e._realY], [40, 20]);
});

test('a save made aboard loads at that place and angle after the project\'s version changed', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [40.25, 12.5], yaw: 37 }));
    w.run(3);
    const saved = w.JsonEx.stringify({ map: w.$gameMap, player: w.$gamePlayer });
    assert.ok(!/"@":"Game_Event"[^{}]*"_rrDrive"/.test(saved));
    const loaded = w.JsonEx.parse(saved);
    w.$gameMap = loaded.map; w.$gamePlayer = loaded.player;
    const p = w.$gamePlayer;
    assert.deepEqual([p._realX, p._realY, p._rrFree, p._vehicleType], [40.25, 12.5, 1, 'reactor']);
    // Scene_Load.reloadMapIfUpdated: a transfer to the tile it stands on, with the map set up again.
    p.reserveTransfer(w.$gameMap.mapId(), p.x, p.y, p.direction(), 0);
    p.requestMapReload();
    p.performTransfer();
    assert.deepEqual([p._realX, p._realY], [40.25, 12.5]);
    assert.equal(p._vehicleType, 'reactor');
    assert.ok(near(p._rrDrive.yaw, 37 * DEG, 1e-12));
    assert.equal(p.isMoving(), false);
    // The world's file binds the new event object to the ride (ReactorVehicles.bind); here the test does.
    const e = w.vehicle();
    if (!e._rrBoarded) { e._rrVehicle = 1; e._rrBoarded = true; e._rrFree = 2; e._through = true; }
    w.keys.up = true;
    w.run(30);
    assert.ok(p._realX > 40.25 && p._realY < 12.5, 'and it rides on, north-east');
    assert.deepEqual([e._realX, e._realY], [p._realX, p._realY]);
});

test('a save in the middle of a jump resumes in the air', () => {
    const w = driveWorld(Object.assign(floor({ width: 200, height: 20 }), { at: [10, 10], yaw: 90 }));
    w.keys.up = true;
    w.run(120);
    w.press('jump');
    w.run(10);
    assert.equal(w.drive().air, 1);
    const before = Object.assign({}, w.drive(), { dry: null });
    const loaded = w.JsonEx.parse(w.JsonEx.stringify({ map: w.$gameMap, player: w.$gamePlayer }));
    w.$gameMap = loaded.map; w.$gamePlayer = loaded.player;
    assert.deepEqual(Object.assign({}, w.drive(), { dry: null }), before, 'plain numbers, kept whole');
    let air = 0;
    for (let t = 0; t < 120 && w.drive().air; t++) { w.run(1); air++; }
    assert.ok(air > 15 && air < 30, 'the rest of the 36-tick jump: ' + air);
    assert.equal(w.drive().alt, 0);
});

//-----------------------------------------------------------------------------
// Where it rests: a wheel over a drop hangs (4.6)

const plateau = high => floor({ width: 60, height: 60, ground: x => (x >= 20 ? high : 0) });
const lakeWest = () => floor({ width: 60, height: 60, ground: x => (x < 20 ? -1.5 : 0), water: [{ x0: 0, y0: 0, x1: 20, y1: 60, level: -0.1 }] });

test('walked round beside a ledge, a wheel swung over the drop hangs: nothing sinks, tips or falls', () => {
    // A plateau three tiles high east of x = 20; the vehicle along its edge, its middle 0.6 tile from it.
    for (const key of ['right', 'left']) {
        const w = driveWorld(Object.assign(plateau(3), { at: [20.1, 30], yaw: 0 }));
        const R = w.Reactor3D, map = w.$dataMap, landed = on(w, 'vehicleLand');
        w.keys[key] = true;
        let over = 0, turned = 0;
        const log = ride(w, 360, (t, d, last) => {
            const q = w.where(), hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw);
            if (R.groundHeightAt(map, q.x + hx * AXLE, q.y + hz * AXLE, 3) === 0 || R.groundHeightAt(map, q.x - hx * AXLE, q.y - hz * AXLE, 3) === 0) over++;
            if (last.turned) turned++;
            assert.deepEqual([d.alt, d.gf, d.gr], [3, 3, 3], key + ', tick ' + t + ': level on the ledge');
        });
        assert.ok(over > 100, 'a wheel was over the drop for ' + over + ' ticks');
        assert.equal(turned, 360, 'and the turn was never refused for it');
        assert.equal(log.air, 0);
        assert.equal(landed.length, 0);
        assert.ok(Math.abs(w.vehicle()._rrPitch) < 1e-6, 'pitch ' + w.vehicle()._rrPitch);
        assert.deepEqual([w.where().x, w.where().y], [20.6, 30.5]);
    }
});

test('walked round beside deep water with its tail over it: no splash, no dip to black', () => {
    for (const keys of [{ right: true }, { left: true }]) {
        const w = driveWorld(Object.assign(lakeWest(), { at: [keys.up ? 20.3 : 20.1, keys.up ? 50 : 30], yaw: 0 }));
        const splashes = on(w, 'vehicleSplash');
        Object.assign(w.keys, keys);
        let dark = 255;
        const log = ride(w, keys.up ? 240 : 360, (t, d) => {
            w.$gameScreen.update();
            dark = Math.min(dark, w.$gameScreen.brightness());
            assert.equal(d.alt, 0, JSON.stringify(keys) + ', tick ' + t + ': on the bank');
            assert.equal(d.back, 0);
        });
        assert.equal(splashes.length, 0, JSON.stringify(keys));
        assert.equal(log.air, 0);
        assert.equal(dark, 255);
    }
});

test('laid across an edge: a step down, both wheels stand; two steps, the low wheel hangs; between, it settles part of the way', () => {
    // Its middle and its front wheel on the plateau, its rear wheel past the edge.
    const laid = high => { const d = driveWorld(Object.assign(plateau(high), { at: [20.1, 30], yaw: 90 })).drive(); return [d.alt, d.gf, d.gr].map(v => Math.round(v * 1e4) / 1e4); };
    assert.deepEqual(laid(0.75), [0.375, 0.75, 0], 'a step: on both wheels');
    assert.deepEqual(laid(1), [0.6667, 1, 0.3333], 'a tile: the rear wheel a third of a tile off the ground');
    assert.deepEqual(laid(1.5), [1.5, 1.5, 1.5], 'two steps: level, on the ground under its middle');
    assert.deepEqual(laid(3), [3, 3, 3]);
    // A hump under its middle with both wheels low: level over it, not seesawed.
    const hump = driveWorld(Object.assign(floor({ width: 60, height: 60, ground: x => (x === 20 ? 0.75 : 0) }), { at: [20, 30], yaw: 90 })).drive();
    assert.deepEqual([hump.alt, hump.gf, hump.gr], [0.75, 0.75, 0.75]);
});

test('ridden off a ledge at a crawl: level while its front wheel hangs, in the air once its middle is over the drop, never under the ground', () => {
    const w = driveWorld(Object.assign(plateau(3), { at: [21.5, 30], yaw: 270 }));
    const R = w.Reactor3D, map = w.$dataMap, landed = on(w, 'vehicleLand');
    let firstAir = null, under = 0, hung = 0;
    for (let t = 0; t < 900 && w.where().x > 14; t++) {
        w.keys.up = w.drive().v < 1;                // a tile a second
        w.run(1);
        const d = w.drive(), q = w.where();
        if (d.air && !firstAir) firstAir = q;
        if (!firstAir) { assert.deepEqual([d.alt, d.gf, d.gr], [3, 3, 3], 'tick ' + t + ' at ' + q.x); if (q.x - AXLE < 20) hung++; }
        if (!d.air && R.groundHeightAt(map, q.x, q.y, d.alt) - d.alt > 0.5) under++;
    }
    assert.ok(hung > 30, 'its front wheel was past the edge for ' + hung + ' ticks before it left the ledge');
    assert.ok(firstAir && firstAir.x < 20 && firstAir.x > 19.9, 'in the air where its middle crossed the edge: ' + (firstAir && firstAir.x));
    assert.equal(under, 0, 'never drawn under the ground its middle is over');
    assert.equal(w.drive().alt, 0, 'down on the low ground');
    assert.equal(w.drive().air, 0);
    assert.ok(w.where().x <= 14, 'and riding on');
    assert.ok(landed.length >= 1 && landed.length <= 2, landed.length + ' landings');
});

test('coming down with a wheel over a drop, it lands on the ground under its middle', () => {
    // Over the plateau's edge: its middle and front wheel over the plateau, its rear wheel over the low ground.
    const w = driveWorld(Object.assign(plateau(3), { at: [20.1, 30], yaw: 90 }));
    const d = w.drive(), landed = on(w, 'vehicleLand');
    d.air = 1; d.alt = d.peak = 3.6; d.vz = 0;
    ride(w, 60);
    assert.equal(d.air, 0);
    assert.deepEqual([d.alt, d.gf, d.gr], [3, 3, 3], 'on the plateau, not half way down its face');
    assert.equal(landed.length, 1);
    assert.ok(near(landed[0].fall, 0.6, 0.01), 'a fall of ' + landed[0].fall);
});

test('a curb is rolled down at a crawl and swung over with no flight', () => {
    // Half a tile: each wheel takes the vehicle down a quarter, well inside half its step.
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x >= 30 ? 0.5 : 0) }), { at: [33, 10], yaw: 270 }));
    let air = 0;
    for (let t = 0; t < 900 && w.where().x > 25; t++) { w.keys.up = w.drive().v < 1; w.run(1); if (w.drive().air) air++; }
    assert.ok(w.where().x <= 25 && w.drive().alt === 0, 'it came down the curb');
    assert.equal(air, 0, 'rolled, not flown');
    // A wheel swung over the edge of a ledge a tile high settles a third of a tile: no flight either.
    const turned = driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x >= 30 ? 1 : 0) }), { at: [30.1, 10], yaw: 0 }));
    const landed = on(turned, 'vehicleLand');
    turned.keys.right = true;
    let low = 1;
    assert.equal(ride(turned, 360, (t, d) => { low = Math.min(low, d.alt); }).air, 0);
    assert.ok(near(low, 2 / 3, 1e-6), 'it settled to ' + low);
    assert.equal(landed.length, 0);
    // A drop of a tile is still a flight.
    const tile = driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x >= 30 ? 2 : 0) }), { at: [33, 10], yaw: 270 }));
    let flown = 0;
    for (let t = 0; t < 900 && tile.where().x > 25; t++) { tile.keys.up = tile.drive().v < 1; tile.run(1); if (tile.drive().air) flown++; }
    assert.ok(flown > 10, 'off two tiles it flies: ' + flown);
});

//-----------------------------------------------------------------------------
// A turn is tested as a step is, and every circle meets what the leading one meets (4.7)

// A bar 0.18 tall and 0.16 wide on the border of tiles 39 | 40, a tile over the ground, from y 12.5 to 27.5.
const railAt40 = () => floor({ width: 80, height: 40, pieces: [{ kind: 'box', x: 40, y: 20, z: 1, size: [0.16, 0.18, 15], angle: 0, offset: [-0.5, 0] }] });

test('walked round beside a rail the turn stops at it, and ridden along it and steered into it no axle crosses it', () => {
    const w = driveWorld(Object.assign(railAt40(), { at: [38.8, 24], yaw: 0 }));
    w.keys.right = true;
    let refusedTurns = 0;
    ride(w, 120, (t, d, last) => {
        const q = w.where(), s = Math.sin(d.yaw);
        assert.ok(q.x + s * AXLE + RADIUS <= 39.95, 'tick ' + t + ': its front circle short of the rail: ' + (q.x + s * AXLE + RADIUS));
        assert.ok(q.x - s * AXLE - RADIUS >= 38, 'its rear swung nowhere it could not');
        if (d.turn !== 0 && !last.turned) refusedTurns++;
    });
    assert.ok(refusedTurns > 90, 'refused on ' + refusedTurns + ' ticks');
    assert.ok(w.where().yaw > 4 && w.where().yaw < 12, 'heading ' + w.where().yaw);
    assert.deepEqual([w.where().x, w.where().y], [39.3, 24.5], 'it never left its place');
    // The other way round its tail swings toward the rail: stopped as well.
    const tail = driveWorld(Object.assign(railAt40(), { at: [38.8, 24], yaw: 180 }));
    tail.keys.right = true;
    ride(tail, 120, (t, d) => { const q = tail.where(), s = Math.sin(d.yaw); assert.ok(q.x + s * AXLE + RADIUS <= 39.95 && q.x - s * AXLE + RADIUS <= 39.95, 'tick ' + t); });
    assert.ok(tail.where().yaw > 180 && tail.where().yaw < 195, 'heading ' + tail.where().yaw);
    // At speed along the rail, then steered into it: slid along, never through.
    const fast = driveWorld(Object.assign(railAt40(), { at: [38.8, 32], yaw: 0 }));
    fast.keys.up = true;
    fast.run(40);
    fast.keys.right = true;
    const log = ride(fast, 90, (t, d) => {
        const q = fast.where(), s = Math.sin(d.yaw);
        if (q.y > 12.5 && q.y < 27.5) assert.ok(q.x < 39.92 && q.x + s * AXLE < 39.92 && q.x - s * AXLE < 39.92, 'tick ' + t + ': no part of it past the rail');
    });
    assert.ok(log.refused.solid > 0);
    assert.equal(log.stops, 0, 'and it keeps moving');
});

test('walked round beside a person no circle comes onto his tile, and steered round him at speed neither its middle nor its tail goes through him', () => {
    const onTile = (x, y, tx, ty, r) => { const dx = x < tx ? tx - x : x > tx + 1 ? x - tx - 1 : 0, dy = y < ty ? ty - y : y > ty + 1 ? y - ty - 1 : 0; return dx * dx + dy * dy < r * r; };
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [38.9, 24], yaw: 0, events: [event(3, 40, 24)] }));
    w.keys.right = true;
    let refusedTurns = 0;
    ride(w, 90, (t, d, last) => {
        const q = w.where(), s = Math.sin(d.yaw), c = -Math.cos(d.yaw);
        assert.equal(onTile(q.x + s * AXLE, q.y + c * AXLE, 40, 24, RADIUS - 0.02), false, 'tick ' + t + ': its front circle is off his tile');
        if (d.turn !== 0 && !last.turned) refusedTurns++;
    });
    assert.ok(refusedTurns > 30, 'the turn was refused on ' + refusedTurns + ' ticks');
    assert.deepEqual([w.$gameMap.event(3)._realX, w.$gameMap.event(3)._realY], [40, 24], 'he is not pushed');
    // W held along a lane beside him, D from a tick on: the lanes and ticks on which its middle went through him.
    let runs = 0;
    // One world for the sixteen rides: the vehicle is stood up again at the start of each lane.
    const round = driveWorld(Object.assign(floor({ width: 80, height: 60 }), { at: [22, 20], yaw: 90, events: [event(3, 30, 22)] }));
    for (const lane of [20.8, 21.1, 21.3, 21.4]) {
        for (const begin of [40, 48, 56, 64]) {
            for (const key of Object.keys(round.keys)) round.keys[key] = false;
            round.mount(22, lane - 0.5, 90);
            round.Drive.board(round.vehicle());
            round.keys.up = true;
            runs++;
            for (let t = 0; t < 160; t++) {
                if (t === begin) round.keys.right = true;
                round.run(1);
                const q = round.where(), yaw = q.yaw * DEG, s = Math.sin(yaw), c = -Math.cos(yaw);
                for (const along of [AXLE, 0, -AXLE]) {
                    const x = q.x + s * along, y = q.y + c * along;
                    assert.ok(!(x > 30 && x < 31 && y > 22 && y < 23), 'lane ' + lane + ', steering from tick ' + begin + ', tick ' + t + ': a circle\'s middle is inside his tile (' + along + ')');
                }
            }
        }
    }
    assert.equal(runs, 16);
});

test('its middle does not come over ground it did not roll onto: a pillar cut close in a turn', () => {
    // One cell two tiles high. Its leading circle clears the corner; its middle, cutting inside, would pass over it.
    const state = { yaw: 90 * DEG, alt: 0, gf: 0, gr: 0, gm: 0, air: 0 };
    const w = driveWorld(Object.assign(floor({ width: 60, height: 40, ground: (x, y) => (x === 30 && y === 20 ? 2 : 0) }), { at: [10, 10], yaw: 90 }));
    // Its middle at (29.9, 20.5) going east: both axles are over open ground a tile and more away.
    assert.equal(w.Drive.probe(state, 29.9, 20.5, 0.2, w.type()), 'tail');
    assert.equal(w.Drive.probe(state, 29.9, 22.5, 0.2, w.type()), '', 'two tiles south the same step is free');
    assert.equal(w.Drive.probe.mid, 0);
    // A hump under its belly up to a step over its wheels' ground is ridden over.
    const hump = (high, next, beyond) => driveWorld(Object.assign(floor({ width: 60, height: 40, ground: x => (x === 30 ? high : x === 31 ? next : x >= 32 ? beyond : 0) }), { at: [10, 10], yaw: 90 }));
    assert.equal(hump(0.7, 0, 0).Drive.probe(state, 29.9, 20.5, 0.2, w.type()), '');
    // Lying on a hump of 0.7, the next one 1.4 high: a step up from where it lies, but more than a step over both
    // its wheels' ground. No wheel rolled up it: it is not lifted onto it.
    const lying = Object.assign({}, state, { alt: 0.7, gf: 0.7, gr: 0.7, gm: 0.7 });
    const ridge = hump(0.7, 1.4, 0);
    assert.equal(ridge.Drive.probe(lying, 30.9, 20.5, 0.2, w.type()), 'tail');
    assert.ok(near(ridge.Drive.probe.mid, 1.4, 1e-9));
    // The same rise with its front wheel over ground a tile up: within a step of a wheel, it goes on.
    assert.equal(hump(0.7, 1.4, 1).Drive.probe(lying, 30.9, 20.5, 0.2, w.type()), '');
    // In the air, coming down: what it comes over is judged from the height it has when this tick's fall is done.
    const crate = driveWorld(Object.assign(floor({ width: 60, height: 40, ground: x => (x === 30 ? 1.2 : 0) }), { at: [10, 10], yaw: 90 }));
    const falling = Object.assign({}, state, { air: 1, alt: 0.478, vz: -0.056 });
    assert.equal(crate.Drive.probe(falling, 29.9, 20.5, 0.2, w.type()), 'tail', 'the crate\'s top is 0.72 over it now and 0.78 when it has fallen: no ground for it');
    assert.equal(crate.Drive.probe(Object.assign({}, falling, { vz: 0.05 }), 29.9, 20.5, 0.2, w.type()), '', 'going up, it clears it');
});

test('the circle behind the leading one meets a person as its nose does', () => {
    // A lane just south of his tile, heading east: its nose is past him, its middle is beside him already, and its
    // rear circle comes onto his tile in this step.
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [10, 10], yaw: 90, events: [event(3, 30, 20)] }));
    const state = { yaw: 90 * DEG, alt: 0, gf: 0, gr: 0, gm: 0, air: 0 };
    assert.equal(w.Drive.probe(state, 29.75 + AXLE, 21.4, 0.2, w.type()), 'event');
    assert.equal(w.Drive.probe(state, 29.75 + AXLE, 21.6, 0.2, w.type()), '', 'a fifth of a tile further from him the same step is free');
    assert.equal(w.Drive.probe(state, 28.75 + AXLE, 21.4, 0.2, w.type()), '', 'and a tile earlier its rear is not at him yet');
});

test('put down beside a bank, an axle over the bank stands on the ground under its middle; the carried event is marked as ridden', () => {
    // A bank two tiles high east of x = 22: its front axle is over it.
    const w = driveWorld(Object.assign(floor({ width: 60, height: 60, ground: x => (x >= 22 ? 2 : 0) }), { at: [20.5, 30], yaw: 90 }));
    const d = w.drive();
    assert.ok(w.Reactor3D.groundHeightAt(w.$dataMap, w.where().x + AXLE, 30.5, 0) === 2, 'its front axle is over the bank');
    assert.deepEqual([d.alt, d.gf, d.gr], [0, 0, 0], 'on the low ground, not lifted half way up the bank');
    w.run(2);
    assert.equal(w.vehicle()._reactorRiding, true, 'the physics leaves the carried event to the ride');
    assert.equal(w.$gamePlayer._reactorRiding, true);
});

test('a slope slows it going up and speeds it going down', () => {
    // Half a tile a tile, ridden for six seconds each way with the throttle held.
    const settle = (yaw, x) => {
        const w = driveWorld(Object.assign(floor({ width: 400, height: 20, terrain: tx => tx * 0.5 }), { at: [x, 10], yaw }));
        w.keys.up = true;
        ride(w, 360);
        return w.drive().v;
    };
    const up = settle(90, 20), down = settle(270, 380);
    assert.ok(up > 15 && up < 17.6, 'up it: ' + up);
    assert.ok(down > 20.5 && down < 23, 'down it: ' + down);
});

test('a circle that already stands in something built may leave it', () => {
    // A door's leaf across cell (40, 20), shut on the vehicle: `along` is which of its circles stands in the leaf.
    const shutOn = along => {
        const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [40 - along, 20], yaw: 90 }));
        const R = w.Reactor3D, leaf = R.lineSolid((u, y, v) => [40 + u, y, 20 + v], 0.44, 0, 0, 0.56, 3.6, 1, 0);
        leaf.door = { id: 1 };
        R.lineIndex(w.$dataMap).cells.set(20 * 65536 + 40, [leaf]);
        R.doorShut = () => true;
        assert.equal(w.Drive.solidAhead(w.$dataMap, 40.5, 20.5, 1, 0, 1, 0.6, 2.4), true, 'a line begun inside the leaf meets it');
        return w;
    };
    for (const [name, along] of [['its rear circle', -AXLE], ['its middle', 0]]) {
        const w = shutOn(along);
        w.keys.up = true;
        const log = ride(w, 60);
        assert.equal(log.stops, 0, name + ' in the leaf, the throttle: ' + JSON.stringify(log.refused));
        assert.ok(w.where().x > 42.5, 'it rode out of it: ' + w.where().x);
    }
    // Its leading circle short of the leaf: that is a wall, as ever. (One cell wide: it is slid round.)
    const ahead = shutOn(AXLE + 1);
    ahead.keys.up = true;
    const met = ride(ahead, 60, (t, d) => {
        const q = ahead.where(), fx = q.x + Math.sin(d.yaw) * AXLE, fy = q.y - Math.cos(d.yaw) * AXLE;
        assert.ok(!(fx > 40.44 && fx < 40.56 && fy > 20 && fy < 21), 'tick ' + t + ': its leading circle\'s middle is in the leaf');
    });
    assert.ok(met.refused.solid > 0, 'the leaf refused it: ' + JSON.stringify(met.refused));
    // Its rear circle in the leaf, walked round: its tail swings out of the leaf.
    const round = shutOn(-AXLE);
    round.keys.right = true;
    let turned = 0;
    ride(round, 30, (t, d, last) => { if (last.turned) turned++; });
    assert.equal(turned, 30, 'nothing holds the turn');
});

//-----------------------------------------------------------------------------
// The last resort, and the places it remembers (4.7)

test('the remembered place: three tiles on from the one before, on both wheels, where a walker can stand; the one before is kept', () => {
    const w = driveWorld(Object.assign(floor({ width: 200, height: 20 }), { at: [10, 10], yaw: 90 }));
    const d = w.drive();
    assert.deepEqual(Array.from(d.dry), [10, 10, 90 * DEG, 0, 10, 10, 90 * DEG, 0, 10, 10, 90 * DEG, 0], 'boarded: all three are the place it was boarded');
    w.keys.up = true;
    let notes = 0, was = d.dry[0];
    ride(w, 240, () => {
        if (d.dry[0] !== was) {
            notes++;
            assert.ok(d.dry[0] - was >= 3, 'three tiles or more on: ' + (d.dry[0] - was));
            assert.equal(d.dry[4], was, 'the one before is kept');
            assert.ok(near(d.dry[0], w.$gamePlayer._realX, 1e-9), 'where it is now');
            was = d.dry[0];
        }
    });
    assert.ok(notes >= 4 && notes <= 8, notes + ' places in four seconds');
    assert.deepEqual([d.dry[8], d.dry[9]], [10, 10], 'and where it was boarded');
    // Slowly: no nearer than three tiles to the last.
    const slow = driveWorld(Object.assign(floor({ width: 200, height: 20 }), { at: [10, 10], yaw: 90 }));
    let slowNotes = 0, last = 10;
    for (let t = 0; t < 600; t++) { slow.keys.up = slow.drive().v < 2; slow.run(1); if (slow.drive().dry[0] !== last) { slowNotes++; assert.ok(slow.drive().dry[0] - last >= 3); last = slow.drive().dry[0]; } }
    assert.ok(slowNotes >= 3 && slow.where().x - 0.5 - last < 3.3, slowNotes + ' places, the last ' + (slow.where().x - 0.5 - last) + ' back');
    // Not where its wheels are more than a step apart (a bank it could not ride back up).
    const bank = driveWorld(Object.assign(floor({ width: 200, height: 20, terrain: x => (x <= 30 ? 20 : x >= 60 ? 5 : 20 - (x - 30) / 2) }), { at: [10, 10], yaw: 90 }));
    assert.ok(bank.ReactorPhysics.standingAt(bank.$dataMap, 45, 10, 12.5, { within: 1 }) !== null, 'a walker stands on the bank');
    bank.keys.up = true;
    let steep = 0;
    ride(bank, 300, (t, d2) => {
        if (Math.abs(d2.gf - d2.gr) > STEP) { steep++; assert.ok(Math.abs(d2.dry[0] + 0.5 - bank.where().x) > 0.01, 'noted on the bank at ' + bank.where().x); }
        return !(d2.dry[0] > 30);
    });
    assert.ok(steep > 30, 'it rode the bank for ' + steep + ' ticks');
    assert.ok(bank.drive().dry[0] > 58, 'noted again on the flat beyond: ' + bank.drive().dry[0]);
    assert.ok(bank.drive().dry[4] <= 30 && bank.drive().dry[4] > 20, 'and the one before is the top of the bank: ' + bank.drive().dry[4]);
    // Not while a wheel hangs: creeping off a ledge, no place between where its front wheel leaves the ground and
    // where its middle does.
    const edge = driveWorld(Object.assign(floor({ width: 60, height: 60, ground: x => (x >= 20 ? 3 : 0) }), { at: [23.5, 30], yaw: 270 }));
    let hung = 0;
    for (let t = 0; t < 400 && !edge.drive().air; t++) {
        edge.keys.up = edge.drive().v < 2;
        edge.run(1);
        const x = edge.where().x;
        if (x - AXLE < 20 && !edge.drive().air) { hung++; assert.ok(Math.abs(edge.drive().dry[0] + 0.5 - x) > 0.01, 'noted with its front wheel over the drop, at ' + x); }
    }
    assert.ok(hung > 20 && edge.drive().air === 1, 'its front wheel hung for ' + hung + ' ticks before it left the ledge');
    assert.equal(edge.drive().dry[0], 23.5, 'the place it was boarded is still the newest');
    // Not in the air: every place remembered over a ride with jumps is on the ground.
    const hops = driveWorld(Object.assign(floor({ width: 400, height: 20 }), { at: [10, 10], yaw: 90 }));
    hops.keys.up = true;
    let inAir = 0, noted = 0, last0 = hops.drive().dry[0];
    for (let t = 0; t < 900; t++) {
        if (t % 45 === 44) hops.pressed.jump = true;
        hops.run(1);
        const d2 = hops.drive();
        if (d2.air) inAir++;
        if (d2.dry[0] !== last0) { noted++; last0 = d2.dry[0]; assert.equal(d2.dry[3], 0, 'a place noted at height ' + d2.dry[3]); assert.equal(d2.air, 0); }
    }
    assert.ok(inAir > 400 && noted > 10, inAir + ' ticks in the air, ' + noted + ' places');
    // Not on a tile no walker can stand on: a bridge of fence posts' tops is no place to be put back on.
    const none = driveWorld(Object.assign(floor({ width: 200, height: 20 }), { at: [10, 10], yaw: 90 }));
    const P = none.ReactorPhysics, standingAt = P.standingAt;
    let asked = 0;
    P.standingAt = function(map, x) { asked++; return x >= 20 && x < 60 ? null : standingAt.apply(this, arguments); };
    none.keys.up = true;
    ride(none, 150, () => { const x = none.drive().dry[0]; assert.ok(!(x + 0.5 >= 20 && x + 0.5 < 60), 'noted at ' + x); });
    assert.ok(none.where().x > 20 && none.where().x < 60 && asked > 2, 'it rode there, and the standing rule was asked');
    assert.ok(asked <= 16, 'a third as often while the answer is no: ' + asked + ' times in 150 ticks');
});

test('put back, it goes to a place it is not already at; stuck again soon after, to the one before, then to where it was boarded', () => {
    // A slot between two walls: neither way gives.
    const slot = () => {
        const w = driveWorld(Object.assign(floor({ width: 80, height: 30, pieces: wallRow(22, 8, 12).concat(wallRow(18, 8, 12)) }), { at: [20, 10], yaw: 90 }));
        w.stuck = () => {
            // Carried into the slot (a script's locate), then both ways tried.
            w.$gamePlayer._realX = 20; w.$gamePlayer._realY = 10; w.$gamePlayer._x = 20; w.$gamePlayer._y = 10;
            w.drive().yaw = 90 * DEG;
            w.keys.up = true; w.run(12); w.keys.up = false; w.keys.down = true;
            for (let t = 0; t < 40 && !w.drive().back; t++) w.run(1);
            assert.ok(w.drive().back > 0, 'the last resort');
            w.keys.down = false;
            w.run(10);
            return [w.where().x - 0.5, w.where().y - 0.5];
        };
        return w;
    };
    // The newest place is the slot itself: it is put on the one before.
    const near1 = slot(), a = near1.drive();
    a.dry.splice(0, 12, 20.4, 10, 90 * DEG, 0, 40, 20, 180 * DEG, 0, 60, 5, 0, 0);
    assert.deepEqual(near1.stuck(), [40, 20], 'a place within a tile and a half is one it could not leave');
    assert.ok(near(a.yaw, 180 * DEG, 1e-9));
    assert.deepEqual(Array.from(a.dry).slice(0, 8), [40, 20, 180 * DEG, 0, 40, 20, 180 * DEG, 0], 'and the place skipped is forgotten');
    // The newest place is elsewhere: there first; stuck again within a minute, the one before; then where it was boarded.
    const w = slot(), d = w.drive();
    d.dry.splice(0, 12, 30, 20, 0, 0, 40, 20, 180 * DEG, 0, 60, 5, 0, 0);
    assert.deepEqual(w.stuck(), [30, 20]);
    assert.equal(d.resc, 1);
    assert.deepEqual(w.stuck(), [40, 20], 'the second time');
    assert.equal(d.resc, 2);
    assert.deepEqual(w.stuck(), [60, 5], 'the third time: where it was boarded');
    assert.deepEqual(w.stuck(), [60, 5], 'and from then on');
    // A minute of riding later it counts as the first time again.
    d.dry.splice(0, 12, 30, 20, 0, 0, 40, 20, 180 * DEG, 0, 60, 5, 0, 0);
    d.calm = w.Drive.CALM_AFTER;
    assert.deepEqual(w.stuck(), [30, 20]);
    assert.equal(d.resc, 1);
    // The count of calm ticks runs while it rides, and stops at the minute.
    const calm = driveWorld(Object.assign(floor({ width: 80, height: 30 }), { at: [20, 10], yaw: 90 }));
    calm.run(5);
    assert.equal(calm.drive().calm, 5);
    calm.drive().calm = calm.Drive.CALM_AFTER - 1;
    calm.run(5);
    assert.equal(calm.drive().calm, calm.Drive.CALM_AFTER);
});

test('the last resort needs a key held both ways: rolled against a wall and then backed against another, it only stands', () => {
    const w = driveWorld(Object.assign(floor({ width: 60, height: 30, pieces: wallRow(22, 8, 12).concat(wallRow(18, 8, 12)) }), { at: [20, 10], yaw: 90 }));
    const d = w.drive();
    d.dry.splice(0, 12, 40, 20, 0, 0, 40, 20, 0, 0, 40, 20, 0, 0);
    d.v = 2;                                       // rolling, no key: it meets the wall ahead and stops
    let stops = 0;
    ride(w, 20, (t, d2, last) => { if (last.stopped) stops++; });
    assert.ok(stops > 0 && d.v === 0, 'stopped by the wall with no key held');
    w.keys.down = true;
    ride(w, 90);
    assert.equal(d.back, 0, 'refused one way with a key: no rescue');
    assert.deepEqual([w.where().x, w.where().y], [20.5, 10.5]);
});

test('a state with a countdown out of range (a damaged save) is put right: the ride goes on within a third of a second', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 30 }), { at: [20, 10], yaw: 90 }));
    w.$gamePlayer._rrDrive = { alt: 0, gf: 0, gr: 0, back: 1e9, fade: -5, dry: [30, 12] };
    w.keys.up = true;
    w.run(1);
    const d = w.drive();
    assert.ok(d.back <= 20 && d.fade === 0, 'back ' + d.back + ', fade ' + d.fade);
    assert.deepEqual(Array.from(d.dry), [30, 12, 0, 0, 30, 12, 0, 0, 30, 12, 0, 0], 'three places of four numbers');
    assert.equal(d.gm, 0, 'the ground under its middle is filled in');
    w.run(40);
    assert.equal(d.back, 0);
    assert.ok(d.v > 1, 'riding: ' + d.v);
});

//-----------------------------------------------------------------------------
// Rules of the tick, one each

test('a contact with a person lasts until every circle is clear of his tile: backed off and met again, his event starts again', () => {
    const touched = event(3, 30, 20, { pages: [page({ trigger: 2, priorityType: 1, list: [{ code: 355, indent: 0, parameters: ['$gameTemp._touched = ($gameTemp._touched || 0) + 1'] }, { code: 230, indent: 0, parameters: [10] }, { code: 0, indent: 0, parameters: [] }] })] });
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [10, 20], yaw: 90, events: [touched] }));
    w.keys.up = true;
    ride(w, 160, () => !w.$gameTemp._touched);
    assert.equal(w.$gameTemp._touched, 1);
    // Backed off a third of a tile, his event over, and against him again: the same contact.
    w.keys.up = false; w.keys.down = true;
    const x = w.where().x;
    ride(w, 200, () => w.where().x > x - 0.33);
    w.keys.down = false; w.keys.up = true;
    let against = 0;
    ride(w, 60, (t, d, last) => { if (w.Drive.REFUSALS[last.refused] === 'event') against++; return !against; });
    assert.ok(against > 0, 'against him again');
    assert.equal(w.$gameTemp._touched, 1, 'not clear of him in between: he does not start again');
    // Backed off until its front circle is a tile and more from him, and met again: a new contact.
    w.keys.up = false; w.keys.down = true;
    ride(w, 200, () => w.where().x + AXLE > 28);
    w.keys.down = false; w.keys.up = true;
    ride(w, 160, () => w.$gameTemp._touched < 2);
    assert.equal(w.$gameTemp._touched, 2, 'a new contact');
});

test('a person met along its side is one contact, and met by its middle alone he starts as for its nose', () => {
    const touched = () => event(3, 30, 22, { pages: [page({ trigger: 2, priorityType: 1, list: [{ code: 355, indent: 0, parameters: ['$gameTemp._touched = ($gameTemp._touched || 0) + 1'] }, { code: 230, indent: 0, parameters: [10] }, { code: 0, indent: 0, parameters: [] }] })] });
    // W along a lane beside him, D from a tick on. `pass` answers how often his event started, and the ticks his
    // body refused the vehicle while its leading circle was well clear of his tile (another circle met him).
    const pass = (lane, begin) => {
        const w = driveWorld(Object.assign(floor({ width: 80, height: 60 }), { at: [22, lane], yaw: 90, events: [touched()] }));
        w.keys.up = true;
        let byAnother = 0, firstBy = '';
        for (let t = 0; t < 130; t++) {
            if (t === begin) w.keys.right = true;
            const was = w.$gameTemp._touched || 0;
            w.run(1);
            const q = w.where(), yaw = q.yaw * DEG, fx = q.x + Math.sin(yaw) * AXLE, fy = q.y - Math.cos(yaw) * AXLE;
            const clear = Math.hypot(Math.max(30 - fx, 0, fx - 31), Math.max(22 - fy, 0, fy - 23)) > RADIUS + 0.35;
            if (w.Drive.REFUSALS[w.Drive.last.refused] === 'event' && clear) byAnother++;
            if (!was && w.$gameTemp._touched) firstBy = clear ? 'another' : 'nose';
        }
        return { started: w.$gameTemp._touched || 0, byAnother, firstBy };
    };
    // Its nose meets him, it slides round, and its middle presses on him as it passes: the same contact.
    const side = pass(20.6, 56);
    assert.equal(side.firstBy, 'nose');
    assert.ok(side.byAnother > 3, 'its middle met him too, on ' + side.byAnother + ' ticks');
    assert.equal(side.started, 1, 'once for the contact');
    // Its nose passes him clear and its middle swings into him: he starts.
    const middle = pass(20.4, 56);
    assert.equal(middle.firstBy, 'another');
    assert.equal(middle.started, 1);
});

test('a hit is told to the hints and the feel: the thud, the camera from six tiles a second, the scrape at most every 20 ticks', () => {
    const feel = w => { const got = { sound: [], kick: [], note: [], advance: 0 }; w.ReactorVehicles.Feel = { advance() { got.advance++; }, sound(name) { got.sound.push(name); }, kick(...args) { got.kick.push(args); } }; w.ReactorVehicles.Hints = { note(name) { got.note.push(name); } }; return got; };
    // Ridden square at the map's east border, where no way round is open: a dead stop at its top speed.
    const hit = top => {
        const w = driveWorld(Object.assign(floor({ width: 60, height: 20 }), { at: [45, 10], yaw: 90, type: { handling: { speed: top } } }));
        const got = feel(w), bumps = on(w, 'vehicleBump');
        w.keys.up = true;
        let ticks = 0;
        ride(w, 600, (t, d, last) => { ticks++; return !last.stopped; });
        got.speed = bumps.length ? bumps[0].speed : 0;
        got.ticks = ticks;
        return got;
    };
    const hard = hit(20);
    assert.ok(hard.speed > 6, 'met at ' + hard.speed);
    assert.equal(hard.sound.filter(name => name === 'bump').length, 1, 'one thud: ' + hard.sound);
    assert.deepEqual(hard.kick, [[0.06, true]], 'from six tiles a second the camera kicks');
    assert.deepEqual(hard.note, ['squareHit']);
    assert.equal(hard.advance, hard.ticks, 'the feel is advanced once every tick');
    const soft = hit(5);
    assert.ok(soft.speed >= 3 && soft.speed < 6, 'met at ' + soft.speed);
    assert.equal(soft.sound.filter(name => name === 'bump').length, 1, 'one thud: ' + soft.sound);
    assert.deepEqual(soft.kick, [], 'under six it does not');
    assert.deepEqual(soft.note, ['squareHit']);
    const touch = hit(2.5);
    assert.deepEqual([touch.sound.filter(name => name === 'bump'), touch.note, touch.kick, touch.speed], [[], [], [], 0], 'under three a stop is silent');
    // Sliding along a wall for a second and a half.
    const w = driveWorld(Object.assign(floor({ width: 160, height: 40, pieces: Array.from({ length: 120 }, (_, i) => ({ kind: 'wall', x: 20 + i, y: 22 })) }), { at: [22, 20.9], yaw: 100 }));
    const got = feel(w);
    w.drive().v = 12; w.keys.up = true; w.keys.right = true;
    let first = -1, lastSlide = -1;
    const log = ride(w, 90, (t, d, last) => { if (last.slid) { if (first < 0) first = t; lastSlide = t; } });
    assert.ok(log.slides >= 8, 'it slid for ' + log.slides + ' ticks');
    const scrapes = got.sound.filter(name => name === 'scrape').length;
    assert.ok(scrapes >= 1 && scrapes <= Math.ceil((lastSlide - first + 1) / 20), scrapes + ' scrapes in ' + log.slides + ' slide ticks over ' + (lastSlide - first + 1));
});

test('landings as the feel hears them: silent under 0.3 tile, the sound from there, the camera over a tile', () => {
    const drop = high => {
        const w = driveWorld(Object.assign(floor({ width: 160, height: 20, ground: x => (x < 60 ? high : 0) }), { at: [50, 10], yaw: 90 }));
        const got = { sound: [], kick: [] };
        w.ReactorVehicles.Feel = { advance() {}, sound(name) { got.sound.push(name); }, kick(...args) { got.kick.push(args); } };
        const landed = on(w, 'vehicleLand');
        w.drive().v = 14; w.keys.up = true;
        ride(w, 120);
        assert.ok(landed.length >= 1, 'off ' + high + ' it flew and landed');
        return got;
    };
    assert.deepEqual(drop(0.9), { sound: ['land'], kick: [] }, 'under a tile: the sound, no kick');
    assert.deepEqual(drop(3), { sound: ['land'], kick: [[0.08]] }, 'three tiles: the kick too');
    // A hop of a quarter tile: nothing.
    const w = driveWorld(Object.assign(floor({ width: 160, height: 20 }), { at: [50, 10], yaw: 90 }));
    const got = { sound: [], kick: [] };
    w.ReactorVehicles.Feel = { advance() {}, sound(name) { got.sound.push(name); }, kick(...args) { got.kick.push(args); } };
    const d = w.drive();
    d.air = 1; d.alt = d.peak = 0.25; d.vz = 0;
    ride(w, 40);
    assert.equal(d.air, 0);
    assert.deepEqual(got, { sound: [], kick: [] });
});

test('a jump: stopped under a ceiling, carried up by the climb it has, and its tiles: none entered in the air, the one it lands on entered', () => {
    // Under a slab: its rider's head stops at the underside.
    const slab = [18, 19, 20, 21, 22].map(x => ({ kind: 'block', x, y: 10, z: 3 }));
    const w = driveWorld(Object.assign(floor({ width: 60, height: 20, pieces: slab }), { at: [20, 10], yaw: 90 }));
    const roof = w.ReactorPhysics.ceilingAbove(w.$dataMap, 20, 10, 0);
    assert.ok(roof > 2.6 && roof < 3.35, 'the slab\'s underside is ' + roof + ': room to sit, not to jump');
    w.run(5);
    w.press('jump');
    let peak = 0;
    const under = ride(w, 60, (t, d) => { peak = Math.max(peak, d.alt); });
    assert.ok(under.air > 3, 'it left the ground');
    assert.ok(peak + 2.6 <= roof + 1e-9, 'its head (2.6 over its wheels) never passes the underside: up ' + peak);
    // Up a slope a walker walks, at speed: it leaves with the climb it has.
    const vzOf = terrain => {
        const hill = driveWorld(Object.assign(floor({ width: 200, height: 20, terrain }), { at: [30, 10], yaw: 90 }));
        hill.drive().v = 12; hill.keys.up = true;
        hill.run(30);
        hill.press('jump');
        hill.run(1);
        assert.equal(hill.drive().air, 1);
        return hill.drive().vz;
    };
    const flat = vzOf(null), climbing = vzOf(x => x * 0.4);
    assert.ok(climbing > flat + 0.05, 'on the flat ' + flat + ' a tick, climbing ' + climbing);
    // A line of Player Touch tiles jumped: only the one it comes down on starts.
    const line = [];
    for (let x = 36; x <= 52; x++) {
        line.push(event(x, x, 10, { pages: [page({ trigger: 1, priorityType: 0, list: [
            { code: 355, indent: 0, parameters: ['($gameTemp._fired = $gameTemp._fired || []).push(' + x + ')'] }, { code: 0, indent: 0, parameters: [] }] })] }));
    }
    const over = driveWorld(Object.assign(floor({ width: 120, height: 20 }), { at: [20, 10], yaw: 90, events: line }));
    const steps = [];
    over.$gameParty.onPlayerWalk = function() { steps.push(over.$gamePlayer.x); };
    over.drive().v = 20; over.keys.up = true;
    let landedOn = null, entered = 0, speed = null;
    ride(over, 120, (t, d, last) => {
        if (over.where().x > 34.6 && !d.air && landedOn === null && !over.$gameTemp._fired) over.pressed.jump = true;
        if (last.air && !d.air && landedOn === null) { landedOn = over.$gamePlayer.x; speed = d.v; }
        if (last.air && d.air) entered += last.entered;
        return !(over.$gameTemp._fired && over.$gameTemp._fired.length);
    });
    assert.ok(landedOn !== null && landedOn >= 44 && landedOn <= 52, 'it came down on tile ' + landedOn);
    assert.equal(entered, 0, 'no tile is entered in the air');
    assert.deepEqual(Array.from(over.$gameTemp._fired), [landedOn], 'the tile it lands on starts, and no tile it flew over');
    assert.equal(steps.filter(x => x >= 36 && x < landedOn).length, 0, 'the party walked on no tile it flew over');
    assert.equal(steps[steps.length - 1], landedOn, 'and on the one it landed on');
    assert.equal(speed, 0, 'stopped on it by the event it started');
});

test('tiles the flags close are not asked in the air: a jump clears a row of them', () => {
    const closed = (mapData, ctx) => {
        ctx.$dataTilesets[1].flags[1538] = 0x0f;
        for (let y = 0; y < mapData.height; y++) mapData.data[y * mapData.width + 40] = 1538;
    };
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20 }), { at: [20, 10], yaw: 90, prepare: closed }));
    w.drive().v = 20; w.keys.up = true;
    let jumped = false;
    const log = ride(w, 90, () => { if (!jumped && w.where().x > 36.5) { jumped = true; w.pressed.jump = true; } });
    assert.equal(log.stops, 0, JSON.stringify(log.refused));
    assert.ok(w.where().x > 50, 'over the row: ' + w.where().x);
});

test('a splash is on the way down: rising through the surface from the shallows makes none', () => {
    // Deep water under its middle; it is already in the air, going up, its wheels still under the surface.
    const lake = { x0: 0, y0: 0, x1: 119, y1: 19, level: 0 };
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x < 30 ? -0.3 : -2), water: [lake] }), { at: [20, 10], yaw: 90 }));
    const splashes = on(w, 'vehicleSplash');
    const d = w.drive(), p = w.$gamePlayer;
    p._realX = 40; p._x = 40; w.vehicle()._realX = 40;
    w.Drive.seat(p);
    d.air = 1; d.alt = d.peak = -0.3; d.vz = 0.0822; d.v = 0;
    w.run(1);
    assert.equal(splashes.length, 0, 'going up: no splash');
    assert.equal(d.back, 0);
    let ticks = 1;
    while (!splashes.length && ticks < 80) { w.run(1); ticks++; }
    assert.ok(ticks > 15 && d.vz <= 0, 'it came down ' + ticks + ' ticks later');
    assert.equal(splashes.length, 1);
    // While the screen fades it sinks to its axles.
    const level = 0, sunkFrom = d.alt;
    w.run(10);
    assert.ok(d.alt < level - 0.3 && d.alt < sunkFrom - 0.2 && d.alt > level - 0.55, 'ten ticks on it is ' + d.alt + ' (the surface ' + level + ')');
});

test('walked round, each wheel rolls by its arc and the vehicle follows the ground its axles swing onto', () => {
    // Ground rising a quarter tile a tile to the east; the vehicle facing up it.
    const w = driveWorld(Object.assign(floor({ width: 80, height: 60, terrain: x => x * 0.25 }), { at: [30, 30], yaw: 90 }));
    const d = w.drive();
    assert.ok(near(d.gf - d.gr, 0.25 * 2 * AXLE, 1e-6), 'nose up the slope');
    const travel = d.travel;
    w.keys.right = true;
    let ticks = 0;
    while (w.where().yaw < 180 && ticks < 200) { w.run(1); ticks++; }
    assert.ok(ticks > 30 && ticks < 60, 'a quarter turn in ' + ticks + ' ticks');
    assert.ok(Math.abs(d.gf - d.gr) < 0.02, 'across the slope its wheels are level: ' + (d.gf - d.gr));
    assert.ok(near(d.travel - travel, (w.where().yaw - 90) * DEG * AXLE, 1e-6), 'its wheels rolled ' + (d.travel - travel));
});

test('the stand-side foot: down under a crawl, and up again only above a tile and a half a second', () => {
    const w = driveWorld(Object.assign(floor({ width: 160, height: 20 }), { at: [20, 10], yaw: 90 }));
    const d = w.drive();
    w.run(15);
    assert.equal(d.foot, 1, 'at a stop the foot is down');
    d.v = 1.3;
    w.run(1);
    assert.equal(d.foot, 1, 'at 1.3 it stays down');
    d.v = 1.7; w.keys.up = true;
    w.run(12);
    assert.equal(d.foot, 0, 'above 1.5 it comes up');
});

test('a type record with no step of its own rolls the default step', () => {
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20, ground: x => (x >= 30 ? 0.5 : 0) }), { at: [10, 10], yaw: 90, type: { handling: { step: 0 } } }));
    assert.equal(w.type().handling.step, 0);
    w.keys.up = true;
    const log = ride(w, 150);
    assert.equal(log.stops, 0, JSON.stringify(log.refused));
    assert.equal(w.drive().alt, 0.5, 'up a curb of half a tile');
});

test('a travel longer than 0.4 tile in a tick is cut into steps: every tile on the way is entered', () => {
    // A fast kind: 90 tiles a second, a tile and a half a tick.
    const w = driveWorld(Object.assign(floor({ width: 200, height: 20 }), { at: [10, 10], yaw: 90, type: { handling: { speed: 90, grip: 400 } } }));
    const walked = [];
    w.$gameParty.onPlayerWalk = function() { walked.push(w.$gamePlayer.x); };
    w.drive().v = 90; w.keys.up = true;
    ride(w, 40);
    assert.ok(walked.length > 50, 'it rode ' + walked.length + ' tiles');
    for (let i = 1; i < walked.length; i++) assert.equal(walked[i], walked[i - 1] + 1, 'tile ' + walked[i] + ' follows ' + walked[i - 1]);
});

test('entering a tile: the party\'s walk comes before its touch trigger, and neither while an event runs', () => {
    const acid = (mapData, ctx) => { ctx.$dataTilesets[1].flags[1537] = 0x100; for (let x = 30; x < 60; x++) mapData.data[10 * mapData.width + x] = 1537; };
    const strip = event(10, 32, 10, { pages: [page({ trigger: 1, priorityType: 0, list: [{ code: 355, indent: 0, parameters: ['$gameTemp._order.push("trigger")'] }, { code: 0, indent: 0, parameters: [] }] })] });
    const w = driveWorld(Object.assign(floor({ width: 120, height: 20 }), { at: [20, 10], yaw: 90, prepare: acid, events: [strip] }));
    const order = w.$gameTemp._order = [];
    const walk = w.$gameParty.onPlayerWalk, here = w.$gamePlayer.checkEventTriggerHere;
    w.$gameParty.onPlayerWalk = function() { if (w.$gamePlayer.x === 32) order.push('walk'); return walk.apply(this, arguments); };
    w.$gamePlayer.checkEventTriggerHere = function() { if (this.x === 32) order.push('asked'); return here.apply(this, arguments); };
    w.keys.up = true;
    ride(w, 120, () => order.length < 3);
    w.run(2);
    assert.deepEqual(Array.from(order), ['walk', 'asked', 'trigger'], 'the damage floor acts before the tile\'s event is asked for, and it starts');
    // An event is running (a wait of two seconds): the vehicle rolls on, braking, over the acid and no tile of it acts.
    const rolling = driveWorld(Object.assign(floor({ width: 120, height: 20 }), { at: [27, 10], yaw: 90, prepare: acid }));
    const hp = rolling.$gameParty.members().map(actor => actor.hp);
    rolling.drive().v = 20;
    rolling.$gameMap._interpreter.setup([{ code: 230, indent: 0, parameters: [120] }, { code: 0, indent: 0, parameters: [] }], 0);
    assert.equal(rolling.$gameMap.isEventRunning(), true);
    let entered = 0;
    ride(rolling, 60, (t, d, last) => { entered += last.entered; });
    assert.ok(entered > 3 && rolling.where().x > 31, 'it rolled onto the acid: ' + rolling.where().x);
    assert.deepEqual(rolling.$gameParty.members().map(actor => actor.hp), hp, 'and nobody was hurt while the event ran');
});

test('sliding along a wall costs speed by the angle; a hit sits back only where it has room behind', () => {
    // The throttle held into a wall 45 degrees off the axes, met at 50 degrees: when it has turned along it, it
    // is slower than the same ride with no wall in its way.
    const run = wall => {
        const w = driveWorld(Object.assign(floor({ width: 80, height: 80, pieces: wall ? [{ kind: 'box', x: 40, y: 40, z: 0, size: [50, 4, 0.5], angle: 45 }] : null }), { at: [20, 40], yaw: 85 }));
        w.keys.up = true;
        const speeds = [];
        let slides = 0, lastSlide = -1;
        ride(w, 200, (t, d, last) => { speeds.push(d.v); if (last.slid) { slides++; lastSlide = t; } });
        return { speeds, slides, lastSlide };
    };
    const open = run(false), along = run(true);
    assert.ok(along.slides >= 10 && open.slides === 0, 'it slid for ' + along.slides + ' ticks');
    const cost = open.speeds[along.lastSlide] - along.speeds[along.lastSlide];
    assert.ok(cost > 1.5, 'the slide cost it ' + cost + ' tiles a second (' + along.slides + ' ticks of it)');
    // A wall ahead and one right behind its tail: hit from 5 tiles a second it stops where it is.
    const tight = driveWorld(Object.assign(floor({ width: 60, height: 30, pieces: wallRow(22, 8, 12).concat(wallRow(18, 8, 12)) }), { at: [20, 10], yaw: 90 }));
    const bumps = on(tight, 'vehicleBump');
    tight.drive().v = 5;
    ride(tight, 10);
    assert.equal(bumps.length, 1);
    assert.deepEqual([tight.where().x, tight.where().y], [20.5, 10.5], 'no room to sit back: it stands where it stopped');
    // Held against the wall from rest it never reaches three tiles a second: every stop is silent.
    const sounds = [];
    tight.ReactorVehicles.Feel = { advance() {}, sound(name) { sounds.push(name); }, kick() {} };
    tight.keys.up = true;
    const pressed = ride(tight, 30);
    assert.ok(pressed.stops > 20, 'stopped on ' + pressed.stops + ' ticks');
    assert.equal(bumps.length, 1, 'no thud told');
    assert.deepEqual(sounds, []);
});

test('a tile its leading circle found free is not asked of again for the circles behind it, for half a second', () => {
    const calls = speed => {
        const w = driveWorld(Object.assign(floor({ width: 200, height: 20 }), { at: [20, 10], yaw: 90, events: [event(3, 150, 5)] }));
        const R = w.Reactor3D, body = R.bodyBlocksTile, asked = new Map();
        w.run(2);
        R.bodyBlocksTile = function(mover, x, y) { asked.set(x, (asked.get(x) || 0) + 1); return body.apply(this, arguments); };
        const from = w.where().x;
        for (let t = 0; t < 600 && w.where().x < from + 12; t++) { w.keys.up = w.drive().v < speed; w.run(1); }
        // The tiles its whole length has passed over.
        const passed = Array.from(asked.keys()).filter(x => x > from + 2 && x < w.where().x - 2);
        return { tiles: passed.length, most: Math.max(...passed.map(x => asked.get(x))), least: Math.min(...passed.map(x => asked.get(x))) };
    };
    const fast = calls(20);
    assert.ok(fast.tiles >= 5, fast.tiles + ' tiles');
    assert.deepEqual([fast.least, fast.most], [1, 1], 'at speed each tile is asked of once, by its nose');
    // At a crawl its middle comes onto a tile more than half a second after its nose: asked again, for each circle.
    const slow = calls(1);
    assert.deepEqual([slow.least, slow.most], [3, 3], 'at a tile a second, once for each circle');
});

test('entering tiles asks the map for no list of its events', () => {
    const w = driveWorld(Object.assign(floor({ width: 160, height: 20 }), { at: [20, 10], yaw: 90, events: [event(3, 100, 5)] }));
    w.drive().v = 20; w.keys.up = true;
    w.run(5);
    // The body rule and a tile's own triggers are other files': they are stood down here, so the count is this file's own.
    w.Reactor3D.bodyBlocksTile = () => false;
    w.$gamePlayer.checkEventTriggerHere = () => {};
    w.$gameMap.setupStartingEvent = () => false;
    w.$gameMap.isEventRunning = () => false;
    let lists = 0;
    const events = w.$gameMap.events;
    w.$gameMap.events = function() { lists++; return events.apply(this, arguments); };
    let entered = 0;
    for (let t = 0; t < 60; t++) { w.Drive.tick(true); entered += w.Drive.last.entered; }
    w.$gameMap.events = events;
    assert.ok(entered > 15, 'it entered ' + entered + ' tiles');
    assert.equal(lists, 0, 'the tick walked the map\'s own list');
});

//-----------------------------------------------------------------------------
// The Demo's North Haven

// One world for every ride there: the map's rocks take seconds to work out the first time its ground is read.
let north = null;
function northHaven(x, y, yaw) {
    if (!north) { north = driveWorld({ data: demoData, mapId: 5, at: [28, 3], yaw: 180 }); north.run(30); }
    const w = north;
    for (const key of Object.keys(w.keys)) w.keys[key] = false;
    w.pressed = {};
    w.mount(x, y, yaw);
    w.Drive.board(w.vehicle());
    return w;
}

test('North Haven: a bush stops it', { skip: !hasDemo && 'the Demo\'s Map005 is not on disk' }, () => {
    const w = northHaven(28, 3, 180);
    const R = w.Reactor3D, map = w.$dataMap;
    const cells = R.bushBlocking(map);
    assert.ok(cells && cells.size > 0, 'the map has big bushes');
    // A bush with four flat, open tiles in a row beside it.
    const open = (x, y) => x > 2 && y > 2 && x < map.width - 3 && y < map.height - 3 && !R.bushBlocksCell(map, x, y) && !R.piecesAt(map, x, y)
        && Math.abs(R.groundHeightAt(map, x + 0.5, y + 0.5, 0) - R.groundHeightAt(map, x + 1.5, y + 0.5, 0)) < 0.05 && R.waterSurfaceAt(map, x + 0.5, y + 0.5) === null
        && !w.$gameMap.eventsXy(x, y).length;
    let found = null;
    for (const key of cells) {
        const bx = key % 65536, by = Math.floor(key / 65536);
        if (R.pieceOnGround(map, bx, by)) continue;
        let clear = true;
        for (let i = 1; i <= 6 && clear; i++) for (const dy of [-1, 0, 1]) if (!open(bx - i, by + dy)) clear = false;
        if (clear && Math.abs(R.groundHeightAt(map, bx - 5.5, by + 0.5, 0) - R.groundHeightAt(map, bx + 0.5, by + 0.5, 0)) < 0.3) { found = [bx, by]; break; }
    }
    assert.ok(found, 'a bush with an open approach from the west');
    w.mount(found[0] - 5, found[1], 90);
    w.Drive.board(w.vehicle());
    w.keys.up = true;
    const inBush = d => { const q = w.where(), hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw); return [AXLE, 0, -AXLE].some(along => R.bushBlocksCell(map, Math.floor(q.x + hx * along), Math.floor(q.y + hz * along))); };
    const log = ride(w, 120, (t, d, last) => { assert.equal(inBush(d), false, 'tick ' + t + ': a circle\'s middle is in a bush'); return !last.refused; });
    assert.equal(Object.keys(log.refused)[0], 'bush', 'at ' + found + ': ' + JSON.stringify(log.refused));
    assert.ok(w.where().x + AXLE < found[0], 'its leading circle\'s middle stopped short of the bush\'s tile: ' + (w.where().x + AXLE));
    ride(w, 40, (t, d) => assert.equal(inBush(d), false, 'held against it, tick ' + t));
    // Walked round beside a bush: a wheel swung at its tile is held there. The vehicle along the row north of
    // one, its front axle level with the bush's tile; D swings its front south.
    let beside = null;
    for (const key of cells) {
        const bx = key % 65536, by = Math.floor(key / 65536);
        let clear = !R.pieceOnGround(map, bx, by);
        for (let i = -4; i <= 2 && clear; i++) for (const dy of [-2, -1]) if (!open(bx + i, by + dy)) clear = false;
        if (clear) { beside = [bx, by]; break; }
    }
    assert.ok(beside, 'a bush with an open row north of it');
    w.keys.up = false;
    w.mount(beside[0] - AXLE, beside[1] - 1.1, 90);
    w.Drive.board(w.vehicle());
    w.keys.right = true;
    let held = 0;
    ride(w, 90, (t, d, last) => { assert.equal(inBush(d), false, 'walked round, tick ' + t + ': a circle\'s middle is in the bush at ' + beside); if (d.turn !== 0 && !last.turned) held++; });
    assert.ok(held > 30, 'the turn was held on ' + held + ' ticks');
    assert.ok(w.where().yaw < 135, 'short of where its front would be in the bush: heading ' + w.where().yaw);
});

test('North Haven: the bridge\'s rails stop it', { skip: !hasDemo && 'the Demo\'s Map005 is not on disk' }, t => {
    const w = northHaven(28, 3, 180);
    const R = w.Reactor3D, map = w.$dataMap;
    // The east rail: a bar 0.16 wide and 0.18 tall along x = 97, a tile over the deck, with the river under it.
    const rail = (map.reactor3d.pieces || []).find(piece => piece.kind === 'box' && piece.x === 97 && piece.y === 158 && Array.isArray(piece.size) && piece.size[0] < 0.3 && piece.size[1] < 0.3 && piece.size[2] > 10);
    const deck = R.groundHeightAt(map, 95.5, 158.5, 0.4), bed = R.groundHeightAt(map, 98.5, 156.5, 0.4);
    if (!rail || !(Math.abs(deck) < 1) || !(bed < deck - 3)) { t.skip('the bridge is not where it was (a rail at x 97, a deck at 95, the river east of it)'); return; }
    assert.equal(R.groundHeightAt(map, 96.9, 156.5, deck), R.groundHeightAt(map, 96.5, 156.5, deck), 'the ground rule sees no rail between its posts');
    for (const yaw of [60, 120]) {
        const p = w.mount(95, 158, yaw);
        p._reactorGround = deck; w.vehicle()._reactorGround = deck;
        w.Drive.board(w.vehicle());
        w.keys.up = true;
        const log = ride(w, 70, (tick, d) => {
            const q = w.where();
            assert.ok(q.x + Math.sin(d.yaw) * AXLE < 97, 'heading ' + yaw + ': its front never crosses the rail (tick ' + tick + ', ' + q.x.toFixed(2) + ')');
            assert.ok(d.alt > deck - 1 && !d.air, 'heading ' + yaw + ': it stays on the deck');
        });
        assert.ok(log.refused.solid > 0, 'heading ' + yaw + ': stopped by the drawn rail: ' + JSON.stringify(log.refused));
    }
});

test('North Haven: walked round on the bridge beside its rail, neither end swings through it and nothing falls', { skip: !hasDemo && 'the Demo\'s Map005 is not on disk' }, t => {
    const w = northHaven(28, 3, 180);
    const R = w.Reactor3D, map = w.$dataMap;
    const rail = (map.reactor3d.pieces || []).find(piece => piece.kind === 'box' && piece.x === 97 && piece.y === 158 && Array.isArray(piece.size) && piece.size[0] < 0.3 && piece.size[1] < 0.3 && piece.size[2] > 10);
    const deck = R.groundHeightAt(map, 95.5, 158.5, 0.4), bed = R.groundHeightAt(map, 98.5, 156.5, 0.4);
    if (!rail || !(Math.abs(deck) < 1) || !(bed < deck - 3)) { t.skip('the bridge is not where it was (a rail at x 97, a deck at 95, the river east of it)'); return; }
    const splashes = on(w, 'vehicleSplash');
    // Along the deck 0.8 tile from the east rail; the key that swings an end toward the rail, held alone.
    for (const [x, yaw, key] of [[96.2, 180, 'left'], [96.2, 0, 'right'], [96, 0, 'right']]) {
        for (const name of Object.keys(w.keys)) w.keys[name] = false;
        const p = w.mount(x - 0.5, 158, yaw);
        p._reactorGround = deck; w.vehicle()._reactorGround = deck;
        w.Drive.board(w.vehicle());
        w.keys[key] = true;
        let refusedTurns = 0;
        ride(w, 150, (tick, d, last) => {
            const q = w.where(), s = Math.sin(d.yaw);
            assert.ok(q.x + s * AXLE < 97 && q.x - s * AXLE < 97, 'heading ' + yaw + ', tick ' + tick + ': an axle is past the rail (' + (q.x + s * AXLE).toFixed(2) + ')');
            assert.ok(!d.air && d.alt > deck - 0.5, 'heading ' + yaw + ', tick ' + tick + ': it left the deck (' + d.alt.toFixed(2) + ')');
            if (d.turn !== 0 && !last.turned) refusedTurns++;
        });
        assert.ok(refusedTurns > 60, 'heading ' + yaw + ': the rail held the turn on ' + refusedTurns + ' ticks');
        assert.equal(w.drive().back, 0);
    }
    assert.equal(splashes.length, 0, 'and nothing went into the river');
});

test('North Haven: stood on a cliff face no walker stands on, both ways refused, it is put back on a place it rides on from', { skip: !hasDemo && 'the Demo\'s Map005 is not on disk' }, t => {
    const w = northHaven(28, 3, 180);
    const R = w.Reactor3D, P = w.ReactorPhysics, map = w.$dataMap;
    // (198.04, 128.94): the ground falls five tiles a tile to the west there. A ride once came to rest on it, half
    // in the rock, with this place as the newest it remembered, and was put back on it by every rescue.
    const X = 197.542, Y = 128.438, here = R.groundHeightAt(map, X + 0.5, Y + 0.5, -14);
    if (P.standingAt(map, 198, 128, here, { within: 3 }) !== null || !(R.groundHeightAt(map, X + 1.5, Y + 0.5, here) - here > 3)) { t.skip('that face is not as it was'); return; }
    const road = R.groundHeightAt(map, 130.5, 95.5, 0);
    const p = w.mount(X, Y, 51.924);
    p._reactorGround = w.vehicle()._reactorGround = here;
    w.Drive.board(w.vehicle());
    const d = w.drive();
    Object.assign(d, { alt: -17.113, gf: -13.848, gr: -20.378, gm: here, air: 0, v: 0 });
    d.dry.splice(0, 12, X, Y, 51.924 * DEG, -14.402, 130, 95, 90 * DEG, road, 130, 95, 90 * DEG, road);
    w.keys.up = true;
    const up = ride(w, 60);
    assert.ok(up.stops > 50 && d.back === 0, 'one way tried: it stands (' + JSON.stringify(up.refused) + ')');
    w.keys.up = false; w.keys.down = true;
    let rescued = false;
    ride(w, 60, () => { if (d.back > 0) { rescued = true; w.keys.down = false; } });
    assert.ok(rescued, 'both ways tried: the last resort');
    w.run(10);
    assert.deepEqual([w.where().x, w.where().y], [130.5, 95.5], 'on the place before, not on the face again');
    assert.ok(near(d.alt, road, 0.05), 'on the road: ' + d.alt);
    w.keys.up = true;
    ride(w, 90);
    assert.ok(Math.hypot(w.where().x - 130.5, w.where().y - 95.5) > 3 && d.v > 3, 'and it rides on: ' + JSON.stringify(w.where()));
});

test('North Haven: the prototype\'s run (d), which ended in 125 dead stops in a row, slides on', { skip: !hasDemo && 'the Demo\'s Map005 is not on disk' }, t => {
    const w = northHaven(64, 36, 150);
    w.keys.up = true;
    let row = 0, longest = 0;
    const log = ride(w, 480, (tick, d, last) => { row = last.stopped ? row + 1 : 0; longest = Math.max(longest, row); });
    const q = w.where();
    t.diagnostic('run (d) ends at (' + q.x.toFixed(1) + ', ' + q.y.toFixed(1) + ') heading ' + q.yaw.toFixed(0) + ' at ' + q.v.toFixed(1) + ' tiles a second after ' + log.slides + ' slide ticks and ' + log.stops + ' stops');
    assert.ok(longest < 30, 'the longest run of dead stops: ' + longest);
    assert.ok(Math.hypot(q.x - 64.5, q.y - 36.5) > 30, 'it went somewhere');
    assert.ok(log.maxRise <= STEP);
});

//-----------------------------------------------------------------------------
// The long ride, its cost, and what it creates

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

test('North Haven: 36 minutes of seeded random keys: no height pops up, no jump is held back by water, and the tick stays in budget', { skip: !hasDemo && 'the Demo\'s Map005 is not on disk' }, t => {
    const w = northHaven(28, 3, 180);
    const p = w.$gamePlayer, e = w.vehicle();
    const starts = [[28, 3, 180], [75, 46, 180], [64, 36, 180], [110, 93, 90]];
    const R = w.Reactor3D, map = w.$dataMap;
    const sum = { ticks: 0, tiles: 0, maxRise: 0, riseAt: '', waterInAir: 0, stops: 0, slides: 0, lands: 0, splashes: 0, bumps: 0, backs: 0, entered: 0, sunk: 0, sunkAt: '', drySplashes: 0 };
    let splashed = false;
    w.ReactorEvents.on('vehicleLand', () => sum.lands++);
    w.ReactorEvents.on('vehicleSplash', () => { sum.splashes++; splashed = true; });
    w.ReactorEvents.on('vehicleBump', () => sum.bumps++);
    // The tick alone is timed, in the main thread's CPU time: what the map's events and the followers cost is not the ride's.
    let spent = 0;
    const tick = w.Drive.tick;
    w.Drive.tick = function(active) { const a = cpuMicros(); tick.call(this, active); spent = cpuMicros() - a; };
    let plain = 0, plainN = 0, busy = 0, busyN = 0;
    for (const s of starts) for (const seed of [11, 22, 33]) {
        w.mount(s[0], s[1], s[2]);
        w.Drive.board(w.vehicle());
        const r = rng(seed + Math.round(s[0]));
        let until = 0, stuck = 0, escape = 0, alt = w.drive().alt, backWas = 0;
        for (let k = 0; k < 3 * 3600; k++) {
            if (escape > 0) { escape--; if (!escape) until = 0; }
            else if (k >= until) {
                until = k + 20 + Math.floor(r() * 70);
                const a = r(), b = r();
                w.keys.up = a < 0.85; w.keys.down = a >= 0.85 && a < 0.95; w.keys.left = b < 0.3; w.keys.right = b >= 0.7;
            }
            if (!escape && r() < 0.004) w.pressed.jump = true;
            // A frame as the map scene runs it, less the events' own updates (nothing on this map walks): the
            // interpreter, so an event a tile starts runs and ends, and the player.
            w.Graphics.frameCount++;
            if (w.$gameMessage.hasText()) w.$gameMessage.clear();
            w.$gameMap.updateInterpreter();
            p.update(true);
            w.pressed = {};
            const d = p._rrDrive, last = w.Drive.last;
            if (last.entered || last.slid || last.refused) { busy += spent; busyN++; } else { plain += spent; plainN++; }
            // On the ground it is never drawn more than half a tile under the ground its middle is over; a splash
            // is where its middle is over water deeper than its wade.
            if (!d.air && !(d.back > 0) || splashed) {
                const x = p._realX + 0.5, y = p._realY + 0.5, mid = R.groundHeightAt(map, x, y, d.alt);
                if (splashed) { const level = R.waterSurfaceAt(map, x, y); if (level === null || level - mid <= 0.45) sum.drySplashes++; splashed = false; }
                else if (mid - d.alt > 0.5) { sum.sunk++; if (!sum.sunkAt) sum.sunkAt = s.join(',') + ' seed ' + seed + ' tick ' + k + ' at ' + x.toFixed(2) + ', ' + y.toFixed(2) + ': ' + d.alt.toFixed(2) + ' under ' + mid.toFixed(2); }
            }
            sum.ticks++; sum.tiles += last.moved; sum.entered += last.entered;
            if (last.stopped) sum.stops++;
            if (last.slid) sum.slides++;
            if (d.back > 0) sum.backs++;
            if (last.air && w.Drive.REFUSALS[last.refused] === 'water') sum.waterInAir++;
            // Being put back on the last dry place is a placement, not a ride up something.
            const rise = d.alt - alt;
            if (!backWas && !(d.back > 0) && rise > sum.maxRise) { sum.maxRise = rise; sum.riseAt = s.join(',') + ' seed ' + seed + ' tick ' + k + ' at ' + (p._realX + 0.5).toFixed(2) + ', ' + (p._realY + 0.5).toFixed(2); }
            alt = d.alt; backWas = d.back;
            if (!Number.isFinite(p._realX + p._realY + d.alt + d.v + d.yaw + d.pitch + d.roll)) assert.fail('a number was lost at tick ' + k);
            if (p._x !== Math.round(p._realX) || p._y !== Math.round(p._realY)) assert.fail('the tile is not the one under its middle');
            if (e._realX !== p._realX || e._realY !== p._realY) assert.fail('the vehicle is not under its rider');
            // A rider with the throttle held against something lets go and walks it round, as a child does.
            if (w.keys.up && Math.abs(d.v) < 0.05 && !d.air) { if (++stuck > 45) { stuck = 0; escape = 45 + Math.floor(r() * 45); w.keys.up = false; w.keys.down = false; w.keys.left = r() < 0.5; w.keys.right = !w.keys.left; } } else stuck = 0;
        }
    }
    w.Drive.tick = tick;
    const plainUs = plain / plainN, busyUs = busy / busyN;
    t.diagnostic(sum.ticks + ' ticks, ' + sum.tiles.toFixed(0) + ' tiles, ' + (sum.tiles / (sum.ticks / 60)).toFixed(1) + ' tiles a second; ' + sum.bumps + ' hits, ' + sum.slides + ' slide ticks, '
        + sum.lands + ' landings, ' + sum.splashes + ' splashes; the most the height rose in a tick: ' + sum.maxRise.toFixed(3) + ' (' + sum.riseAt + ')');
    t.diagnostic('per tick: ' + plainUs.toFixed(1) + ' microseconds on a tick that enters no tile and touches nothing (' + plainN + ' ticks; budget 60), '
        + busyUs.toFixed(1) + ' on one that enters a tile or scrapes (' + busyN + ' ticks; budget 150)');
    assert.equal(sum.ticks, 36 * 3600);
    assert.ok(sum.tiles > 3000, 'it rode: ' + sum.tiles);
    assert.ok(sum.maxRise <= STEP + 1e-9, 'the height rose ' + sum.maxRise + ' in one tick: ' + sum.riseAt);
    assert.equal(sum.waterInAir, 0, 'no step is refused for water while airborne');
    assert.equal(sum.sunk, 0, 'on the ground under the ground its middle is over, on ' + sum.sunk + ' ticks, first ' + sum.sunkAt);
    assert.equal(sum.drySplashes, 0, 'a splash with its middle over dry ground');
    assert.ok(sum.lands > 50 && sum.slides > 1000 && sum.entered > 3000, 'the ride met the map: ' + JSON.stringify(sum));
    // Three times the budget of 11.1: a slow test machine passes, an order of magnitude does not.
    withinBudget(t, plainUs, 180, 'a plain tick took ' + plainUs.toFixed(1) + ' microseconds');
    withinBudget(t, busyUs, 450, 'a tick that enters a tile or scrapes took ' + busyUs.toFixed(1) + ' microseconds');
});

test('standing still with no key: no step and no probe of the world', () => {
    const w = driveWorld(Object.assign(floor({ width: 80, height: 40 }), { at: [20, 20], yaw: 90 }));
    w.run(30);
    const R = w.Reactor3D;
    let asked = 0;
    for (const name of ['groundHeightAt', 'worldRay', 'waterDepthAt', 'bodyBlocksTile', 'lineCell']) { const base = R[name]; R[name] = function() { asked++; return base.apply(this, arguments); }; }
    for (let t = 0; t < 60; t++) w.Drive.tick(true);
    assert.equal(asked, 0);
});

test('the tick creates nothing: no vector, no quaternion, and no object, array or closure in its own path', () => {
    const w = driveWorld(Object.assign(floor({ width: 200, height: 80, pieces: wallRow(120, 2, 77), ground: (x, y) => (x > 60 && x < 70 ? 0.5 : 0) }), { at: [10, 40], yaw: 80 }));
    w.keys.up = true;
    w.run(120);                                   // the world's own caches are warm, the state is complete
    const made = {};
    for (const name of ['Vector2', 'Vector3', 'Vector4', 'Quaternion', 'Euler', 'Matrix3', 'Matrix4', 'Box3', 'Sphere', 'Ray', 'Color']) {
        const Base = w.THREE[name];
        if (typeof Base !== 'function') continue;
        w.THREE[name] = new Proxy(Base, { construct(target, args, fresh) { made[name] = (made[name] || 0) + 1; return Reflect.construct(target, args, fresh); } });
    }
    const d = w.drive(), keys = Object.keys(d).sort().join(','), dry = d.dry, last = w.Drive.last, lastKeys = Object.keys(last).join(',');
    for (let t = 0; t < 600; t++) {
        w.keys.right = t % 90 < 30; w.keys.left = t % 90 >= 60; w.keys.down = t % 200 > 180;
        if (t % 150 === 0) w.pressed.jump = true;
        w.Drive.tick(true);
        w.pressed = {};
    }
    assert.deepEqual(made, {}, 'three.js objects made while riding');
    assert.equal(w.drive(), d, 'the state is one object, changed in place');
    assert.equal(Object.keys(d).sort().join(','), keys, 'and gains no field');
    assert.equal(d.dry, dry);
    assert.equal(w.Drive.last, last);
    assert.equal(Object.keys(last).join(','), lastKeys);
    // The source of the tick's path: from its banner to the end of the tick.
    const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_vehicles_drive.js'), 'utf8');
    const from = source.indexOf('// The tick\'s path. Nothing from here to the end of `Drive.tick` creates an object.');
    const to = source.indexOf('// The same tests, asked from outside the ride (the end of the tick\'s path)');
    assert.ok(from > 0 && to > from);
    const code = source.slice(from, to).split('\n').map(line => line.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    const makes = [
        [/\bnew\s+[A-Za-z_$]/, 'new'], [/=>/, 'an arrow function'], [/\bfunction\s*\(/, 'a function expression'], [/(^|[=(,:?]|return)\s*\{\s*[A-Za-z_$"']+\s*:/m, 'an object literal'],
        [/(^|[=(,:?]|return)\s*\{\s*\}/m, 'an empty object'], [/([=(,:?]|return)\s*\[/, 'an array literal'], [/`/, 'a template string'], [/\.\.\./, 'a spread'],
        [/\.(map|filter|slice|concat|split|join|keys|values|entries|assign|from|push)\(/, 'an array or object helper'], [/\barguments\b/, 'arguments'], [/"\s*\+|\+\s*"/, 'a string built']
    ];
    for (const [pattern, what] of makes) {
        const hit = code.match(pattern);
        assert.equal(hit, null, 'the tick\'s path has ' + what + (hit ? ' near: ' + code.slice(Math.max(0, hit.index - 60), hit.index + 60).replace(/\s+/g, ' ') : ''));
    }
    assert.ok(/Drive\.tick = function tick\(sceneActive\)/.test(code), 'the tick is in the audited part');
    for (const name of ['refuse', 'solidAhead', 'follow', 'enter', 'fly', 'write', 'foot', 'tilesPass', 'reaches', 'putBack', 'sendBack']) assert.ok(new RegExp('function ' + name + '\\(').test(code), name + ' is in the audited part');
});
