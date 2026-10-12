'use strict';
// Free movement is one saved flag (SPEC-v2 2.4): a character whose `_rrFree` is set stands where it is and nothing
// glides it; RPG Maker's own movers give a parked one back to the grid; a forced route on the riding player runs
// as tile steps from its first movement command. runtime/reactor_vehicles_drive.js, on the shipped objects.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { driveWorld, floor, event, page, DEG } = require('./helpers/vehicles-drive-world.cjs');

const route = (...codes) => ({ list: codes.map(code => (typeof code === 'number' ? { code, parameters: [] } : code)).concat([{ code: 0, parameters: [] }]), repeat: false, skippable: false, wait: true });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('a player whose _rrFree is set keeps a place between tiles and is not moving', () => {
    const w = driveWorld({ board: false });
    const p = w.$gamePlayer;
    p._realX = 10.37; p._realY = 4.81; p._x = 10; p._y = 5;
    // Without the flag the stock glide carries it to its tile: the rule this file changes.
    w.run(1);
    assert.ok(p.isMoving(), 'between tiles a character glides');
    p._realX = 10.37; p._realY = 4.81; p._x = 10; p._y = 5;
    p._rrFree = 1;
    assert.equal(p.isMoving(), false);
    w.run(600);
    assert.equal(p._realX, 10.37);
    assert.equal(p._realY, 4.81);
    assert.equal(p.isMoving(), false);
    assert.equal(p.isStopping(), true);
    // Whoever calls the glide itself (a wrapper of it, a plugin) moves nothing either.
    p.updateMove();
    assert.deepEqual([p._realX, p._realY], [10.37, 4.81]);
});

test('the flag is plain data: a save keeps it and the rule holds on the loaded object', () => {
    const w = driveWorld({ board: false });
    const p = w.$gamePlayer;
    p._realX = 10.37; p._realY = 4.81; p._x = 10; p._y = 5; p._rrFree = 1;
    const loaded = w.JsonEx.parse(w.JsonEx.stringify(p));
    assert.equal(loaded._rrFree, 1);
    assert.equal(loaded.isMoving(), false, 'the behavior is on the prototype, not on the saved object');
    assert.equal(Object.prototype.hasOwnProperty.call(loaded, 'isMoving'), false);
    loaded.update(false);
    assert.equal(loaded._realX, 10.37);
});

test('a character without the flag moves exactly as it did', () => {
    const w = driveWorld({ board: false, events: [event(3, 20, 10)] });
    const e = w.$gameMap.event(3);
    assert.equal(e._rrFree, undefined);
    e.forceMoveRoute(route(1, 1));
    w.run(80);
    assert.deepEqual([e._realX, e._realY], [20, 12]);
    assert.equal(e._rrYaw, undefined, 'a plain event is given no heading');
});

test('aboard: a forced route with no movement command leaves the vehicle where it is', () => {
    const w = driveWorld({ at: [10.37, 4.81], yaw: 0 });
    const p = w.$gamePlayer;
    p.forceMoveRoute(route(39));
    w.run(30);
    assert.equal(p.isMoveRouteForcing(), false);
    assert.equal(p.isTransparent(), true, 'the command ran');
    assert.equal(p._realX, 10.37);
    assert.equal(p._realY, 4.81);
    assert.equal(w.drive().grid, 0);
    assert.deepEqual([w.vehicle()._realX, w.vehicle()._realY], [10.37, 4.81]);
});

test('aboard: a forced route of two steps moves it two whole tiles and gives the mover back', () => {
    const w = driveWorld({ at: [10.37, 4.81], yaw: 0 });
    const p = w.$gamePlayer, e = w.vehicle();
    p.forceMoveRoute(route(1, 1));
    w.run(2);
    assert.equal(w.drive().grid, 1, 'the grid has it from the first movement command');
    assert.equal(p.isMoving(), true, 'the stock glide carries it to its tile first');
    let between = 0;
    w.run(400, () => { if (p._realX !== Math.round(p._realX)) between++; return !p.isMoveRouteForcing(); });
    assert.ok(between > 0 && between < 20, 'it glided to its tile, then stepped by tiles');
    w.run(2);
    assert.deepEqual([p._realX, p._realY], [10, 7], 'two whole tiles south of the tile it was on');
    assert.deepEqual([e._realX, e._realY, e._x, e._y], [10, 7, 10, 7], 'the vehicle is under it');
    assert.equal(w.drive().grid, 0);
    assert.equal(p._rrFree, 1);
    assert.equal(w.drive().v, 0, 'the mover takes over at a standstill');
    assert.ok(near(w.drive().yaw, Math.PI), 'heading the way the route left it facing');
    // And it rides on from there.
    w.keys.up = true;
    w.run(30);
    assert.ok(p._realY > 7.2, 'the throttle moves it again');
});

test('aboard: Move Down x3 ends three tiles south with the vehicle under the player (4.13)', () => {
    const w = driveWorld({ at: [12, 6], yaw: 90 });
    const p = w.$gamePlayer, e = w.vehicle();
    p.forceMoveRoute(route(1, 1, 1));
    w.run(400, () => !p.isMoveRouteForcing());
    w.run(2);
    assert.deepEqual([p._realX, p._realY], [12, 9]);
    assert.deepEqual([e._realX, e._realY], [12, 9]);
    assert.ok(near(e._rrYaw, Math.PI), 'the heading followed the facing');
    assert.equal(p._vehicleType, 'reactor');
});

test('aboard: a turn command of a forced route turns the heading and moves nothing', () => {
    const w = driveWorld({ at: [10.37, 4.81], yaw: 0 });
    const p = w.$gamePlayer;
    p.forceMoveRoute(route(18));       // Turn Right
    w.run(10);
    assert.ok(near(w.drive().yaw, Math.PI / 2));
    assert.ok(near(w.vehicle()._rrYaw, Math.PI / 2));
    assert.deepEqual([p._realX, p._realY], [10.37, 4.81]);
    assert.equal(w.drive().grid, 0);
});

test('a route forced on the ridden vehicle is the rider\'s', () => {
    const w = driveWorld({ at: [12, 6], yaw: 0 });
    const p = w.$gamePlayer, e = w.vehicle();
    e.forceMoveRoute(route(1));
    assert.equal(e.isMoveRouteForcing(), false, 'the event does not report it');
    assert.equal(p.isMoveRouteForcing(), true);
    w.run(200, () => !p.isMoveRouteForcing());
    w.run(2);
    assert.deepEqual([p._realX, p._realY, e._realX, e._realY], [12, 7, 12, 7]);
});

test('a parked vehicle given Move Down ends one whole tile south, on the grid again', () => {
    const w = driveWorld({ board: false, at: [12, 6] });
    const p = w.$gamePlayer, e = w.vehicle();
    p.locate(3, 3);
    // Parked by the mover between tiles, facing 37 degrees.
    e._rrVehicle = 1; e._rrFree = 1; e._rrYaw = 37 * DEG; e._realX = 12.25; e._realY = 6.4; e._x = 12; e._y = 6; e._rrSpeed = 0;
    w.run(120);
    assert.deepEqual([e._realX, e._realY], [12.25, 6.4], 'parked, it stands where it was left');
    assert.equal(e.isMoving(), false);
    e.forceMoveRoute(route(1));
    assert.equal(e._rrFree, 0, 'any RPG Maker mover gives it back to the grid');
    w.run(200, () => !e.isMoveRouteForcing());
    w.run(2);
    assert.deepEqual([e._realX, e._realY], [12, 7]);
    assert.equal(e._rrFree, 0);
    assert.ok(near(e._rrYaw, Math.PI), 'its heading is its facing again');
});

test('Set Event Location and a script\'s setPosition move a parked vehicle as they move any event', () => {
    const w = driveWorld({ board: false, at: [12, 6] });
    const e = w.vehicle();
    w.$gamePlayer.locate(3, 3);
    e._rrVehicle = 1; e._rrFree = 1; e._rrYaw = 37 * DEG; e._realX = 12.25; e._realY = 6.4; e._x = 12; e._y = 6;
    e.locate(20, 9);
    assert.deepEqual([e._realX, e._realY, e._x, e._y, e._rrFree], [20, 9, 20, 9, 0]);
    e._rrFree = 1; e._realX = 20.3; e._realY = 9.3;
    e.setPosition(22, 11);
    assert.deepEqual([e._realX, e._realY, e._rrFree], [22, 11, 0]);
    e._rrFree = 1; e._realX = 22.3; e._realY = 11.3;
    e.moveStraight(6);
    assert.equal(e._rrFree, 0);
    assert.ok(near(e._rrYaw, Math.PI / 2), 'facing east, heading east');
});

test('the riding player and the vehicle under him are not given back by a mover', () => {
    const w = driveWorld({ at: [12.3, 6.4], yaw: 0 });
    const p = w.$gamePlayer, e = w.vehicle();
    p.setPosition(12.3, 6.4);
    assert.equal(p._rrFree, 1);
    e.setPosition(12.3, 6.4);
    assert.equal(e._rrFree, 2, 'the carried event keeps its flag');
});

test('locate from a script moves the ride: the place is the player\'s', () => {
    const w = driveWorld({ at: [12.3, 6.4], yaw: 0 });
    const p = w.$gamePlayer, e = w.vehicle();
    w.keys.up = true;
    w.run(40);
    assert.ok(w.drive().v > 5);
    w.keys.up = false;
    p.locate(25, 20);
    w.run(1);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p._rrFree, 1);
    assert.deepEqual([p._realX, p._realY, e._realX, e._realY], [25, 20, 25, 20]);
    assert.equal(w.drive().v, 0, 'it arrives at a standstill');
    assert.equal(p._reactorRiding, true);
});

test('the carried event is never moving, whatever its place', () => {
    const w = driveWorld({ at: [12, 6], yaw: 90 });
    const e = w.vehicle();
    w.keys.up = true;
    const answers = new Set();
    w.run(120, () => { answers.add(e.isMoving()); return false; });
    assert.deepEqual([...answers], [false]);
    assert.ok(e._realX > 15, 'while it travels');
    assert.equal(w.$gamePlayer.isMoving(), false, 'nor is its rider: the menu opens at once and OK is read every frame');
});

test('the physics leaves every character the mover has alone', () => {
    const w = driveWorld({ at: [12, 6], yaw: 90 });
    const p = w.$gamePlayer, e = w.vehicle();
    w.run(2);
    for (const c of [p, e]) {
        c._reactorGround = 7.5; c._reactorAlt = 8.25; c._reactorAir = 0.75; c._reactorVz = 0.01;
        w.ReactorPhysics.update(c);
        assert.deepEqual([c._reactorGround, c._reactorAlt, c._reactorAir, c._reactorVz], [7.5, 8.25, 0.75, 0.01]);
    }
    // A vehicle never ridden is the stock physics'.
    const parked = driveWorld({ board: false, at: [12, 6] });
    const q = parked.vehicle();
    q._rrVehicle = 1;
    q._reactorAlt = 3; q._reactorGround = 0; q._reactorAir = 3;
    parked.run(1);
    assert.ok(q._reactorAlt < 3, 'gravity has it');
});

test('a Jump press aboard is refused quietly', () => {
    const w = driveWorld({ at: [12, 6], yaw: 90 });
    const P = w.ReactorPhysics;
    P.lastJumpRefusal = null;
    P.noteJumpRefused(w.$gamePlayer, 'in a vehicle');
    assert.equal(P.lastJumpRefusal, null);
    const foot = driveWorld({ board: false });
    foot.ReactorPhysics.noteJumpRefused(foot.$gamePlayer, 'no room overhead');
    assert.equal(foot.ReactorPhysics.lastJumpRefusal.reason, 'no room overhead', 'on foot it says why, as before');
});

test('riding, the stock walk is not asked and a destination is dropped', () => {
    const w = driveWorld({ at: [12, 6], yaw: 90 });
    const p = w.$gamePlayer;
    w.$gameTemp.setDestination(14, 6);
    let moved = 0;
    const executeMove = p.executeMove;
    p.executeMove = function() { moved++; return executeMove.apply(this, arguments); };
    w.run(5);
    assert.equal(moved, 0);
    assert.equal(w.$gameTemp.isDestinationValid(), false, 'a click sets no destination aboard');
});

test('an event with a movement type of its own takes no step while the mover has it', t => {
    const worldFile = path.resolve(__dirname, '..', '..', 'runtime', 'reactor_vehicles.js');
    if (!fs.existsSync(worldFile)) { t.skip('runtime/reactor_vehicles.js (veh-world) is not in the tree: its updateSelfMovement wrapper is what holds the event'); return; }
    let w;
    try { w = driveWorld({ board: false, at: [12, 6], withWorld: true }); } catch (error) { t.skip('runtime/reactor_vehicles.js does not load yet: ' + error.message); return; }
    const e = w.vehicle();
    w.$gamePlayer.locate(3, 3);
    e._rrVehicle = 1; e._rrFree = 1; e._rrYaw = 0; e._realX = 12.25; e._realY = 6.4; e._x = 12; e._y = 6;
    e._moveType = 1; e._moveFrequency = 5; e._moveSpeed = 4;
    w.run(600);
    assert.deepEqual([e._realX, e._realY, e._rrFree], [12.25, 6.4, 1]);
});

test('a parked vehicle given a jump or a diagonal step is the grid\'s again, level, and no longer marked as ridden', () => {
    const parked = () => {
        const w = driveWorld({ board: false, at: [12, 6] });
        const e = w.vehicle();
        w.$gamePlayer.locate(3, 3);
        // Parked by the mover across a curb: between tiles, nose up, with what the ride left on it.
        e._rrVehicle = 1; e._rrFree = 1; e._rrYaw = 37 * DEG; e._rrPitch = 0.2; e._reactorRiding = true; e._rrSpeed = 4; e._rrSteer = 0.5; e._rrLean = 0.3;
        e._realX = 12.25; e._realY = 6.4; e._x = 12; e._y = 6;
        Drive = w.Drive;
        return e;
    };
    let Drive = null;
    const jumped = parked();
    jumped.jump(1, 0);
    assert.equal(jumped._rrFree, 0, 'a jump gives it back');
    assert.deepEqual([jumped._x, jumped._y], [13, 6]);
    assert.ok(near(jumped._rrYaw, Math.PI / 2), 'jumped east, heading east');
    const stepped = parked();
    stepped.moveDiagonally(6, 2);
    assert.equal(stepped._rrFree, 0, 'a diagonal step gives it back');
    for (const e of [jumped, stepped]) {
        assert.equal(e._reactorRiding, false, 'the physics has it again');
        assert.equal(e._rrPitch, 0, 'level');
        assert.deepEqual([e._rrSpeed, e._rrSteer, e._rrLean], [0, 0, 0], 'nothing of the ride is drawn on it');
        assert.ok(near(e._rrYaw, Drive.yawOf(e._reactorDir8 || e._direction)), 'its heading is its facing: ' + e._rrYaw);
    }
});

test('a vehicle on the grid turned by a route command heads the way it faces', () => {
    const w = driveWorld({ board: false, at: [12, 6] });
    const e = w.vehicle();
    w.$gamePlayer.locate(3, 3);
    e._rrVehicle = 1; e._rrYaw = Math.PI;                 // on the grid (never parked by the mover), facing south
    e.forceMoveRoute(route(18));                          // Turn Right
    w.run(30, () => !e.isMoveRouteForcing());
    assert.equal(e.direction(), 6);
    assert.ok(near(e._rrYaw, Math.PI / 2), 'heading east: ' + e._rrYaw);
    assert.equal(e._rrFree, undefined, 'and it stays the grid\'s');
});

test('Drive.leave takes the ride off what is drawn of a vehicle', () => {
    const w = driveWorld({ at: [12, 6], yaw: 90 });
    const e = w.vehicle();
    w.keys.up = true; w.keys.right = true;
    w.run(40);
    assert.ok(e._rrSpeed > 3 && e._rrSteer > 0.5 && e._rrLean !== 0);
    const pose = e._rrPose;
    w.Drive.leave(e);
    assert.deepEqual([e._rrSpeed, e._rrSteer, e._rrLean], [0, 0, 0]);
    assert.notEqual(e._rrPose, pose, 'and it is drawn again');
});

test('aboard: a hop in progress is settled before a forced route\'s first step, and not for a route that only turns', () => {
    const w = driveWorld({ at: [12, 6], yaw: 0 });
    const p = w.$gamePlayer;
    let settled = 0;
    w.ReactorVehicles.settle = () => { settled++; p._rrMount = null; };
    p._rrMount = { drawn: true };
    p.forceMoveRoute(route(19));                          // Turn Up
    w.run(10, () => !p.isMoveRouteForcing());
    assert.equal(settled, 0);
    p.forceMoveRoute(route(1));
    w.run(3);
    assert.equal(settled, 1, 'the hop ends before the route moves it');
    assert.equal(w.drive().grid, 1);
});

test('performTransfer with nothing reserved changes nothing of the ride', () => {
    const w = driveWorld({ at: [12.3, 6.4], yaw: 0 });
    const p = w.$gamePlayer;
    assert.equal(p.isTransferring(), false);
    p.performTransfer();
    assert.deepEqual([p._vehicleType, p._rrFree, p._realX, p._realY], ['reactor', 1, 12.3, 6.4]);
    assert.ok(p._rrDrive, 'the state is kept');
});

test('a saved ride continues on a flat map using flat coordinates', () => {
    const w = driveWorld({at:[15,15],yaw:90,flat:true,board:false,withWorld:true,type:{sheet:{characterName:'Vehicle',characterIndex:0}}});
    const p=w.$gamePlayer,e=w.vehicle();
    w.mount(15.3,15,90);p._rrDrive={v:6,steer:0,yaw:90*DEG,alt:4,gf:4,gr:4};
    w.run(1);assert.equal(p._vehicleType,'reactor');assert.equal(p._rrFree,1);
    assert.ok(p._realX>15.3);assert.equal(p._rrDrive.alt,0);assert.equal(e._realX,p._realX);
});

test('switching to flat rendering keeps a valid ride instead of requesting a dismount', () => {
    const w=driveWorld({at:[15,15],yaw:90,flat:true,board:false,withWorld:true,type:{sheet:{characterName:'Vehicle',characterIndex:0}}});
    const p=w.$gamePlayer;w.mount(15.3,15,90);p._rrDrive={v:6,steer:0,yaw:90*DEG,alt:0,gf:0,gr:0};
    const asked=[];w.ReactorVehicles.getOff=options=>{asked.push(options);return false;};
    w.run(1);assert.deepEqual(asked,[]);assert.equal(p._vehicleType,'reactor');assert.ok(p._realX>15.3);
});

test('aboard: on a forced route\'s steps a wheel over a drop hangs, as it does on the ride', () => {
    // A plateau three tiles high east of x = 20. On its edge tile, facing the drop: its front axle is over it.
    const w = driveWorld(Object.assign(floor({ width: 60, height: 60, ground: x => (x >= 20 ? 3 : 0) }), { at: [20, 30], yaw: 270 }));
    const p = w.$gamePlayer, d = w.drive();
    assert.deepEqual([d.alt, d.gf, d.gr], [3, 3, 3]);
    // Direction Fix ON, Move Down twice, Direction Fix OFF: along the edge, still facing the drop.
    p.forceMoveRoute(route(35, 1, 1, 36));
    let steps = 0;
    w.run(200, () => { if (w.drive().grid) { steps++; assert.deepEqual([w.drive().alt, w.drive().gf, w.drive().gr], [3, 3, 3], 'tick ' + steps + ': level on the plateau'); } return !p.isMoveRouteForcing(); });
    assert.ok(steps > 20, 'it stepped for ' + steps + ' ticks');
    w.run(2);
    assert.deepEqual([p._realX, p._realY, p.direction()], [20, 32, 4]);
});

test('on foot, every wrapper of a per-frame path is one test of the flag', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_vehicles_drive.js'), 'utf8');
    for (const [name, guard] of [
        ['updateMove', 'if (this._rrFree && !onGrid(this)) return;'],
        ['isMoving', 'if (this._rrFree && !onGrid(this)) return false;'],
        ['update', 'if (!this._rrFree || this !== root.$gamePlayer) return _update.apply(this, arguments);'],
        ['moveByInput', 'if (this._rrFree && !onGrid(this)) {'],
        ['P.update', 'if (character && character._rrFree) return;']
    ]) {
        const at = source.indexOf(name === 'P.update' ? 'P.update = function(character) {' : 'proto.' + name + ' = function(');
        assert.ok(at > 0, name + ' is wrapped');
        const body = source.slice(at, at + 400);
        assert.ok(body.indexOf(guard) > 0 && body.indexOf(guard) < 140, name + ' opens with the flag test');
    }
    // And the tick itself.
    const tick = source.slice(source.indexOf('Drive.tick = function tick(sceneActive) {'));
    assert.ok(tick.indexOf('if (!player || !player._rrFree || player._vehicleType !== "reactor") return;') < 200);
});
