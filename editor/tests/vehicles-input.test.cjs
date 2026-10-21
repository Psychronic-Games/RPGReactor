'use strict';
// The controls aboard a vehicle (SPEC-v2 4.4): the keys and the pad as throttle, brake and steering in third
// person, a held direction driven toward in the fixed views, and what switches them off.
// runtime/reactor_vehicles_drive.js on the shipped objects.
const test = require('node:test');
const assert = require('node:assert/strict');
const { driveWorld, floor, event, page, DEG } = require('./helpers/vehicles-drive-world.cjs');

const near = (a, b, eps) => Math.abs(a - b) <= eps;
const arc = (from, to) => { let d = (to - from) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; };
const open = (options = {}) => driveWorld(Object.assign(floor({ width: 160, height: 120 }), { at: [80, 60], yaw: 0 }, options));
const read = w => Object.assign({}, w.Drive.input());
const plain = { gas: 0, brake: 0, steer: 0, jump: false, analog: false };

test('third person: every key and pad button gives the input it names', () => {
    const w = open();
    const held = w.Reactor3D.Camera.held;
    assert.equal(w.Drive.scheme(), 'third');
    assert.deepEqual(read(w), plain);
    const cases = [
        [{ up: true }, { gas: 1 }], [{ down: true }, { brake: 1 }], [{ left: true }, { steer: -1 }], [{ right: true }, { steer: 1 }],
        [{ left: true, right: true }, {}], [{ up: true, down: true }, { brake: 1 }], [{ up: true, right: true }, { gas: 1, steer: 1 }]
    ];
    for (const [keys, want] of cases) {
        Object.assign(w.keys, { up: false, down: false, left: false, right: false }, keys);
        assert.deepEqual(read(w), Object.assign({}, plain, want), JSON.stringify(keys));
    }
    Object.assign(w.keys, { up: false, down: false, left: false, right: false });
    // W A S D and the arrows by key code, as walking in this view reads them.
    for (const [name, want] of [['forward', { gas: 1 }], ['back', { brake: 1 }], ['left', { steer: -1 }], ['right', { steer: 1 }]]) {
        held.add(name);
        assert.deepEqual(read(w), Object.assign({}, plain, want), name);
        held.delete(name);
    }
    // The pad: the right trigger is the throttle, the left the brake; the stick and the D-pad are the directions above.
    const pad = [];
    w.Input._gamepadStates = [undefined, pad];
    pad[7] = true;
    assert.deepEqual(read(w), Object.assign({}, plain, { gas: 1 }), 'RT');
    pad[6] = true;
    assert.deepEqual(read(w), Object.assign({}, plain, { brake: 1 }), 'RT and LT: the brake wins');
    pad[7] = false;
    assert.deepEqual(read(w), Object.assign({}, plain, { brake: 1 }), 'LT');
    pad[6] = false;
    w.pressed.jump = true;
    assert.equal(read(w).jump, true);
    w.pressed = {};
    assert.equal(read(w).jump, false);
    assert.equal(w.Drive.input(), w.Drive.input(), 'one scratch, not a new object a call');
    const mine = {};
    assert.equal(w.Drive.input(mine), mine);
});

test('the right trigger alone drives straight; with the stick hard left it steers at full lock', () => {
    const w = open();
    const pad = [];
    w.Input._gamepadStates = [pad];
    pad[7] = true;
    w.run(90);
    assert.ok(w.drive().v > 12);
    assert.equal(w.drive().yaw, 0, 'straight');
    assert.equal(w.where().x, 80.5);
    w.keys.left = true;                            // the stick past its threshold is the left direction
    w.run(11);
    assert.equal(w.drive().steer, -1, 'full lock 0.18 s after');
    w.run(30);
    assert.ok(arc(0, w.where().yaw) < -20, 'and it turns left: ' + w.where().yaw);
});

test('S held at rest backs it up after six ticks, at its reverse speed', () => {
    const w = open();
    w.keys.down = true;
    w.run(5);
    assert.equal(w.drive().v, 0);
    w.run(120);
    assert.ok(near(w.drive().v, -3, 1e-9), 'reverse: ' + w.drive().v);
    assert.ok(w.where().y > 60.5, 'it backs away from north');
    w.keys.down = false; w.keys.left = true;
    const yaw = w.where().yaw;
    w.run(20);
    assert.ok(arc(yaw, w.where().yaw) > 0, 'backing up steers the other way');
});

test('with W held and a message opened it stops within its brake time, and never backs up by itself', () => {
    const w = open();
    const p = w.$gamePlayer;
    w.keys.up = true;
    w.drive().v = 20;
    w.run(2);
    w.$gameMessage.add('Halt.');
    assert.equal(p.canMove(), false);
    let ticks = 0;
    for (; ticks < 100 && w.drive().v > 0; ticks++) { w.Graphics.frameCount++; w.$gameMap.update(true); p.update(true); }
    assert.ok(ticks <= Math.ceil(0.67 * 60) + 1, 'stopped in ' + ticks + ' ticks');
    assert.equal(w.Drive.last.controls, 0);
    // S held through the message: the brake of a vehicle with its controls off never becomes reverse.
    w.keys.up = false; w.keys.down = true;
    for (let t = 0; t < 60; t++) { w.Graphics.frameCount++; w.$gameMap.update(true); p.update(true); }
    assert.equal(w.drive().v, 0);
    w.$gameMessage.clear();
    w.keys.down = false; w.keys.up = true;
    w.run(20);
    assert.ok(w.drive().v > 3, 'control comes back when it ends');
});

test('an event running takes the controls: the vehicle brakes, the keys are not read', () => {
    const w = open();
    w.keys.up = true;
    w.drive().v = 15;
    w.$gameTemp.reserveCommonEvent(0);
    w.$gameMap._interpreter.setup([{ code: 230, indent: 0, parameters: [120] }, { code: 0, indent: 0, parameters: [] }], 0);
    assert.equal(w.$gameMap.isEventRunning(), true);
    w.run(60);
    assert.equal(w.drive().v, 0);
    assert.equal(w.Drive.last.controls, 0);
});

test('the fixed views: a held direction is a heading, steered toward, turned to first when it is behind', () => {
    const w = open({ camera: 'isometric' });
    assert.equal(w.Drive.scheme(), 'point');
    assert.ok(near(w.Drive.viewYaw(), 45 * DEG, 1e-9), 'the isometric view looks north-east');
    const d = w.drive();
    assert.deepEqual(read(w), plain, 'no direction: it coasts');
    w.keys.right = true;                           // screen-right is south-east on the map
    const at = (yaw, v) => { d.yaw = yaw * DEG; d.v = v; return read(w); };
    assert.deepEqual(at(135, 0), Object.assign({}, plain, { gas: 1 }), 'pointing there: throttle');
    assert.ok(near(at(120, 5).steer, 0.5, 1e-9) && at(120, 5).gas === 1 && at(120, 5).brake === 0, '15 degrees off: half lock');
    assert.deepEqual(at(90, 5), Object.assign({}, plain, { gas: 1, steer: 1 }), '45 off: full lock and throttle');
    assert.deepEqual(at(180, 5), Object.assign({}, plain, { gas: 1, steer: -1 }));
    assert.deepEqual(at(0, 0), Object.assign({}, plain, { steer: 1 }), 'behind it at rest: turned where it stands, toward the shorter way');
    assert.deepEqual(at(280, 0), Object.assign({}, plain, { steer: -1 }));
    assert.deepEqual(at(0, 12), Object.assign({}, plain, { brake: 1, steer: 1 }), 'behind it at speed: the brake, steering toward it');
    assert.deepEqual(at(34, 0.5), Object.assign({}, plain, { steer: 1 }), '101 off, crawling: still turning in place');
    assert.deepEqual(at(36, 0.5), Object.assign({}, plain, { gas: 1, steer: 1 }), '99 off: the throttle comes on with the steering');
    w.keys.right = false; w.keys.up = true; w.keys.left = true;
    assert.deepEqual(at(0, 3), Object.assign({}, plain, { gas: 1 }), 'up and left together: north on the map in this view');
    // The fixed and top-down views: up on the screen is north, as walking there.
    for (const mode of ['fixed', 'topDown']) {
        const flat = open({ camera: mode });
        assert.equal(flat.Drive.scheme(), 'point', mode);
        assert.equal(flat.Drive.viewYaw(), 0, mode);
        flat.keys.down = true;
        flat.drive().yaw = 180 * DEG;
        assert.deepEqual(read(flat), Object.assign({}, plain, { gas: 1 }), mode + ': down is south');
    }
});

test('isometric: holding Right turns it to screen-right from any heading and drives it there', () => {
    for (const start of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const w = open({ camera: 'isometric', yaw: start });
        w.keys.right = true;
        let backward = 0;
        for (let t = 0; t < 240; t++) { w.run(1); if (w.drive().v < 0) backward++; }
        const q = w.where();
        assert.ok(Math.abs(arc(135, q.yaw)) < 3, 'from ' + start + ': heading ' + q.yaw);
        assert.ok(q.v > 15, 'from ' + start + ': speed ' + q.v);
        assert.equal(backward, 0, 'it never backs up in this scheme');
        assert.ok(q.x > 80.5 + 15 && q.y > 60.5 + 15, 'from ' + start + ': it went south-east, to (' + q.x.toFixed(1) + ', ' + q.y.toFixed(1) + ')');
    }
});

test('the fixed view: at rest facing north with Down held it is round, away and heading south inside 1.6 s', () => {
    const w = open({ camera: 'fixed' });
    w.keys.down = true;
    let turned = 0, five = 0, south = 0, sideways = 0;
    for (let t = 1; t <= 240; t++) {
        w.run(1);
        const q = w.where(), off = Math.abs(arc(180, q.yaw));
        if (!turned && off < 100) turned = t / 60;
        if (!five && q.v >= 5) five = t / 60;
        if (!south && off < 10 && q.v > 5) south = t / 60;
        sideways = Math.max(sideways, Math.abs(q.x - 80.5));
    }
    assert.ok(turned > 0 && turned <= 0.8, 'within 100 degrees of south after ' + turned + ' s');
    assert.ok(five > 0 && five <= 1.2, 'over 5 tiles a second after ' + five + ' s');
    assert.ok(south > 0 && south <= 1.6 + 1 / 60, 'heading south after ' + south + ' s');
    assert.ok(sideways < 3, sideways + ' tiles sideways');
    assert.ok(w.where().y > 60.5 + 30, 'and gone south');
});

test('no heading error leaves it still with a direction held', () => {
    for (let start = 0; start < 360; start += 15) {
        const w = open({ camera: 'isometric', yaw: start });
        w.keys.up = true;                          // north-east on the map
        const yaw0 = w.where().yaw;
        w.run(2);
        const q = w.where(), d = w.drive();
        assert.ok(d.v > 0 || d.steer !== 0, 'from ' + start + ': within two ticks it is turning toward it or driving toward it');
        w.run(118);
        assert.ok(w.drive().v > 5, 'from ' + start + ': two seconds on it is under way: ' + w.drive().v);
        assert.ok(Math.abs(arc(45, w.where().yaw)) < Math.abs(arc(45, yaw0)) || Math.abs(arc(45, yaw0)) < 1, 'from ' + start + ': nearer its heading');
    }
});

test('a press kept for getting off brakes it; a new press of the throttle, or Jump, takes it back', () => {
    const w = open();
    const d = w.drive();
    w.keys.up = true;
    w.run(120);
    const v = d.v;
    assert.ok(v > 12);
    d.leave = 'ok';                                // the saved request marker; Cancel and scripts ask to get off
    w.run(10);
    assert.equal(d.leave, 'ok', 'a throttle held since before the press does not take it back');
    assert.ok(d.v < v - 4, 'it brakes by itself: ' + d.v);
    w.keys.up = false;
    w.run(2);
    w.keys.up = true;
    w.run(1);
    assert.equal(d.leave, '', 'a new press of the throttle lets the kept press go');
    const slow = d.v;
    w.run(20);
    assert.ok(d.v > slow, 'and it rides on');
    d.leave = 'ok';
    w.keys.up = false;
    w.press('jump');
    w.run(1);
    assert.equal(d.leave, '', 'so does Jump');
    // Left alone it comes to rest, and stays seated for the world's file to start the hop.
    d.leave = 'ok';
    w.run(120);
    assert.equal(d.v, 0);
    assert.equal(d.leave, 'ok');
    assert.equal(w.$gamePlayer._vehicleType, 'reactor');
});

test('nothing moves during a hop on or off, and keys held through it act when it ends', () => {
    const w = open();
    const p = w.$gamePlayer;
    // Tick 5 of the hop on: the world's file is easing the player from where it stood toward the vehicle's middle.
    p._rrMount = { t: 5, n: 14, on: true, drawn: false, fx: 79, fy: 60, fz: 0, fyaw: 0, tx: 80, ty: 60 };
    p._realX = 79.4; p._x = 80;
    const e = w.vehicle(), was = [p._direction, p._reactorGround, p._reactorAlt, e._rrPose];
    w.keys.up = true;
    w.run(9);
    assert.deepEqual([p._realX, p._realY, w.drive().v], [79.4, 60, 0], 'the tick moves nothing of the player');
    assert.deepEqual([e._realX, e._realY], [80, 60], 'and the vehicle is not carried yet: it stands where it is');
    assert.deepEqual([p._direction, p._reactorGround, p._reactorAlt, e._rrPose], was, 'nor is anything drawn written');
    assert.equal(w.Drive.isDriving(), false);
    p._rrMount = null; p._realX = 80;              // tick 14: seated
    w.run(1);
    assert.ok(w.drive().v > 0, 'the throttle held at tick 5 moves it now');
    assert.equal(w.Drive.isDriving(), true);
    // Only the picture of a hop still playing (the battle's drawn arc) holds nothing back.
    p._rrMount = { t: 3, n: 14, on: false, drawn: true };
    const y = p._realY;
    w.run(5);
    assert.ok(p._realY < y);
});

test('the view turned first person: it brakes and the party is asked off', () => {
    const w = open();
    let asked = 0;
    w.ReactorVehicles.getOff = () => { asked++; w.drive().leave = 'ok'; return true; };
    w.keys.up = true;
    w.run(90);
    assert.equal(asked, 0);
    const v = w.drive().v;
    w.$gameMap._reactorCamera3d = w.Reactor3D.Camera.normalizeState({ mode: 'firstPerson' });
    w.run(1);
    assert.equal(asked, 1);
    w.run(40);
    assert.equal(asked, 1, 'asked once while the press is kept');
    assert.ok(w.drive().v < v - 10, 'braking: ' + w.drive().v);
    // Without the world's file the tick keeps the press itself.
    const alone = open();
    delete alone.ReactorVehicles.getOff;
    alone.keys.up = true;
    alone.run(60);
    alone.$gameMap._reactorCamera3d = alone.Reactor3D.Camera.normalizeState({ mode: 'firstPerson' });
    alone.run(1);
    assert.equal(alone.drive().leave, 'ok');
});

test('a click aboard sets no destination and starts nothing', () => {
    const npc = event(3, 80, 58, { pages: [page({ trigger: 0, priorityType: 1, list: [{ code: 355, indent: 0, parameters: ['$gameTemp._talked = true'] }, { code: 0, indent: 0, parameters: [] }] })] });
    const w = open({ events: [npc] });
    w.TouchInput.isTriggered = () => true;
    w.$gameTemp.setDestination(80, 59);            // the tile ahead, between the bike and him
    w.run(3);
    assert.equal(w.$gameTemp.isDestinationValid(), false);
    assert.equal(w.$gameTemp._talked, undefined);
    assert.deepEqual([w.$gamePlayer._realX, w.$gamePlayer._realY], [80, 60], 'and it walks nowhere');
});

test('Jump and Dash do nothing else aboard: the walker\'s jump is not taken and it never dashes', () => {
    const w = open();
    const p = w.$gamePlayer, P = w.ReactorPhysics;
    let jumps = 0;
    const jump = P.jump;
    P.jump = function() { jumps++; return jump.apply(this, arguments); };
    w.keys.up = true; w.keys.shift = true;
    w.run(30);
    w.press('jump');
    w.run(1);
    assert.equal(jumps, 0, 'the physics\' own jump is for walkers');
    assert.equal(w.drive().air, 1, 'the vehicle\'s is taken instead');
    assert.ok(!p._reactorJumped);
    assert.equal(p.isDashing(), false);
    assert.equal(P.lastJumpRefusal, undefined, 'and nothing is noted as refused');
});

test('first person keeps the throttle-and-steer keys', () => {
    const w = open({ camera: 'firstPerson' });
    assert.equal(w.Drive.scheme(), 'third');
    w.keys.up = true; w.keys.right = true;
    assert.deepEqual(read(w), Object.assign({}, plain, { gas: 1, steer: 1 }));
});

test('point-to-go on a kind that neither walks nor turns where it stands: a direction held behind it is driven round to', () => {
    const car = { kind: 'car', walks: false, turnsInPlace: false, handling: { turnCircle: 5, turnInPlace: 0 } };
    const w = open({ camera: 'topDown', type: car });
    assert.equal(w.type().walks, false);
    assert.equal(!!w.type().turnsInPlace, false);
    const start = w.where();
    w.keys.down = true;                             // facing north; Down on the screen is south
    const first = read(w);
    assert.deepEqual([first.gas, Math.abs(first.steer), first.brake], [1, 1, 0], 'at rest: the throttle on full lock, not the bars alone');
    w.run(2);
    assert.ok(w.drive().v > 0, 'within two ticks it is driving');
    let ticks = 2, reversed = 0;
    while (Math.abs(arc(w.where().yaw, 180)) > 15 && ticks < 900) { w.run(1); ticks++; if (w.drive().v < 0) reversed++; }
    assert.ok(ticks < 300, 'it came round to south in ' + ticks + ' ticks');
    assert.equal(reversed, 0, 'never backing up');
    w.run(90);
    assert.ok(w.where().y > start.y + 3, 'and drives south: ' + w.where().y);
    // The motorcycle in the same case is walked round first: the bars alone.
    const bike = open({ camera: 'topDown' });
    bike.keys.down = true;
    const walked = read(bike);
    assert.deepEqual([walked.gas, Math.abs(walked.steer)], [0, 1]);
});
