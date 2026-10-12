'use strict';
// A battle and a vehicle (runtime/reactor_vehicles.js). An Action or First Person battle that starts while the party
// is aboard finds an ordinary party on foot: the vehicle is parked where it is and the leader stands beside it
// before the battle places anyone. A Tactical battle keeps the party in the saddle (vehicles-mount.test.cjs), and
// a battle on the battle screen leaves it there, at a standstill.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { boardWorld, bike, event, page, motorcycle, DEG } = require('./helpers/vehicles-board-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');

const world = (extra = {}) => boardWorld(Object.assign({ action: true, width: 80, height: 30, party: [1, 2, 3], vehicles: [bike(31, 5, 10, { yaw: 180 })] }, extra));

/** Aboard at (5, 10), then ridden 60 tiles east: the ride's own place moved, as a script's `locate` moves it. */
function rideAway(w, x = 65, y = 10, degrees = 180) {
    w.stand(6, 10, 4);
    assert.equal(w.board(31), true);
    const p = w.$gamePlayer;
    p._realX = x; p._realY = y; p._x = Math.round(x); p._y = Math.round(y);
    p._rrDrive.yaw = degrees * DEG;
    w.run(2);
    assert.deepEqual([w.vehicle(31)._realX, w.vehicle(31)._realY], [x, y]);
    return p;
}

/** The followers' own `rrAboard` when the tree has it, else the stand-in that does what is asked of it. */
function withFollowers(w) {
    if (!w.hasAboard) w.stubAboard();
    return w;
}

test('an Action battle started aboard, 60 tiles from where the party boarded: on foot before anyone is placed', () => {
    const w = withFollowers(world());
    const p = rideAway(w), e = w.vehicle(31), fight = w.$gameFight, P = w.ReactorPhysics, R = w.Reactor3D;
    let off = 0;
    const events = [];
    e.getOff = function() { off++; return w.Game_Event.prototype.getOff.call(this); };
    w.ReactorEvents.on('vehicleGetOff', payload => events.push(payload.vehicle));
    // What the battle finds when it prepares the party.
    let found = null;
    const prepareParty = fight.prepareParty;
    fight.prepareParty = function() {
        found = { type: p._vehicleType, free: p._rrFree, riding: p._reactorRiding, seated: p._rrSeated, ride: p._rrRide, inVehicle: p.isInVehicle(),
            airborne: P.isAirborne(p), at: [p.x, p.y], boarded: e._rrBoarded, vehicleFree: e._rrFree, through: e._through };
        return prepareParty.call(this);
    };
    p._rrDrive.v = 14;
    const serial = fight.start({ mode: 'action', troopId: 1 });
    assert.ok(serial > 0);
    assert.deepEqual(found, { type: 'walk', free: 0, riding: false, seated: false, ride: null, inVehicle: false, airborne: false, at: [66, 10],
        boarded: false, vehicleFree: 1, through: false });
    // The game's state is on foot at once: beside the parked bike, on its left.
    assert.deepEqual([p._vehicleType, p._rrFree, p._rrSeated, p._rrRide, p._rrDrive, p._reactorRiding], ['walk', 0, false, null, null, false]);
    assert.equal(R.eventBodyCovers(e, p.x, p.y), false, 'no tile of the bike');
    assert.deepEqual([e._realX, e._realY, e._rrFree, e._rrBoarded, e._reactorRiding, e._through], [65, 10, 1, false, false, false], 'parked where it was, solid');
    assert.deepEqual([w.$gameMap._rrVehicles.at['1:31'].x, w.$gameMap._rrVehicles.at['1:31'].y], [65, 10], 'and its place is written');
    assert.equal(off, 1, 'the ride ended once');
    assert.deepEqual(events, ['1:31']);
    assert.deepEqual(w.sounds.slice(-2), ['bump', 'stop']);
    // He is a walker again for the physics.
    p._reactorAir = 0.5;
    assert.equal(P.isAirborne(p), true);
    p._reactorAir = 0;
    // Every ally is within two tiles of the leader, and nobody of the troop stands on the bike.
    const units = fight.units();
    const allies = units.filter(unit => unit.team === 'ally'), enemies = units.filter(unit => unit.team === 'enemy');
    assert.equal(allies.length, 3);
    assert.ok(enemies.length >= 1);
    for (const unit of allies) {
        const c = fight.character(unit);
        assert.ok(Math.max(Math.abs(c.x - p.x), Math.abs(c.y - p.y)) <= 2, 'ally at ' + c.x + ',' + c.y + ' with the leader at ' + p.x + ',' + p.y);
        assert.equal(R.eventBodyCovers(e, c.x, c.y), false);
    }
    for (const unit of enemies) {
        const c = fight.character(unit);
        assert.equal(R.eventBodyCovers(e, c.x, c.y), false, 'enemy at ' + c.x + ',' + c.y);
    }
    // The bike is an obstacle of the battle: its tiles are taken.
    for (const [x, y] of [[65, 9], [65, 10], [65, 11]]) assert.equal(fight.cellTaken(x, y), true, 'tile ' + x + ',' + y);
    assert.equal(fight.cellTaken(64, 14), false);
    // No follower is hidden.
    for (const follower of p.followers()._data) if (follower.actor()) assert.equal(follower.isVisible(), true);
    assert.equal(p.followers().isVisible(), true);
    // No boarding and no label while the battle is on the map.
    assert.equal(w.V.offered(true), null);
    assert.equal(w.V.getOn(31), false);
    assert.equal(p.getOnOffVehicle(), false);
});

test('the leader\'s hop is only drawn: 14 ticks of picture, the controls the battle\'s from the first frame', () => {
    const w = withFollowers(world());
    const p = rideAway(w, 65.4, 10.25, 180), fight = w.$gameFight;
    fight.start({ mode: 'action', troopId: 1 });
    const mount = JSON.parse(JSON.stringify(p._rrMount));
    assert.deepEqual([mount.t, mount.n, mount.on, mount.drawn], [0, 14, false, true]);
    assert.deepEqual([mount.fx, mount.fy], [65.4, 10.25], 'from the saddle');
    assert.deepEqual([mount.tx, mount.ty], [p.x, p.y], 'to his tile');
    assert.deepEqual([p._realX, p._realY], [p.x, p.y], 'the player is already there');
    assert.equal(p.isInVehicle(), false);
    assert.equal(p.canMove(), true, 'the hop holds nobody: the player fights at once');
    assert.equal(w.V.isBusy(), false, 'no command waits for a drawn hop');
    const at = [p._realX, p._realY];
    for (let tick = 1; tick <= 13; tick++) {
        w.run(1);
        assert.equal(p._rrMount.t, tick);
        assert.deepEqual([p._realX, p._realY], at, 'the picture moves nothing of the game');
    }
    w.run(1);
    assert.equal(p._rrMount, null);
    assert.equal(fight.isActive(), true);
});

test('a follower under a Stay order is where it was, and the others are with the leader', () => {
    const w = withFollowers(world());
    const p = w.$gamePlayer, followers = p.followers();
    w.stand(6, 10, 4);
    followers.order(1, 'stay');
    const held = followers._data[0], other = followers._data[1];
    assert.equal(held.rrIsHeld(), true);
    vm.runInContext('(function(f) { Game_CharacterBase.prototype.locate.call(f, 3, 14); })', w)(held);
    assert.equal(w.board(31), true);
    p._realX = 65; p._realY = 10; p._x = 65; p._y = 10;
    w.run(2);
    w.$gameFight.start({ mode: 'action', troopId: 1 });
    assert.deepEqual([held.x, held.y], [3, 14], 'left where it was told to stay');
    assert.ok(Math.max(Math.abs(other.x - p.x), Math.abs(other.y - p.y)) <= 2, 'the other follower is with the leader: ' + other.x + ',' + other.y);
    assert.equal(held.isVisible(), true);
});

test('the same with the events feed absent: the rule listens for nothing', () => {
    const source = fs.readFileSync(path.join(runtimeRoot, 'reactor_vehicles.js'), 'utf8');
    assert.equal(source.includes('mapBattleStart'), false, 'the party is put on foot inside the start, not by a listener');
    const w = withFollowers(world());
    const p = rideAway(w), e = w.vehicle(31);
    w.ReactorEvents = undefined;
    let found = null;
    const prepareParty = w.$gameFight.prepareParty;
    w.$gameFight.prepareParty = function() { found = [p._vehicleType, p._rrFree, p._reactorRiding]; return prepareParty.call(this); };
    assert.ok(w.$gameFight.start({ mode: 'action', troopId: 1 }) > 0);
    assert.deepEqual(found, ['walk', 0, false]);
    assert.equal(w.Reactor3D.eventBodyCovers(e, p.x, p.y), false);
    assert.deepEqual([e._rrFree, e._rrBoarded], [1, false]);
});

test('a start that answers 0 leaves the party on foot beside the bike', () => {
    const w = withFollowers(world());
    const p = rideAway(w), e = w.vehicle(31), fight = w.$gameFight;
    // Something inside the chain refuses the battle after the party has been put on foot.
    w.ReactorVehicles.Feel.sound = name => { w.sounds.push(name); if (name === 'bump') fight._active = true; return true; };
    assert.equal(fight.start({ mode: 'action', troopId: 1 }), 0);
    fight._active = false;
    assert.deepEqual([p._vehicleType, p._rrFree, p._rrRide], ['walk', 0, null]);
    assert.deepEqual([p.x, p.y], [66, 10]);
    assert.deepEqual([e._realX, e._realY, e._rrFree, e._rrBoarded], [65, 10, 1, false]);
    w.run(20);
    assert.equal(p.canMove(), true, 'and he walks');
    assert.equal(p._rrMount, null);
});

test('a battle already running is not touched: the wrapper stands down', () => {
    const w = withFollowers(world());
    const p = rideAway(w), fight = w.$gameFight;
    fight._active = true;
    assert.equal(fight.start({ mode: 'action', troopId: 1 }), 0);
    fight._active = false;
    assert.equal(p._vehicleType, 'reactor', 'nothing was started and nobody was put on foot');
    assert.equal(p.vehicle(), w.vehicle(31));
});

test('with something on all four sides the leader is on the vehicle\'s tile, and clear of its body a frame later', () => {
    const blockers = [[66, 10], [64, 10], [65, 7], [65, 13]].map((at, i) => event(50 + i, at[0], at[1]));
    const w = withFollowers(world({ events: blockers }));
    const p = rideAway(w), e = w.vehicle(31), fight = w.$gameFight;
    let found = null;
    const prepareParty = fight.prepareParty;
    fight.prepareParty = function() { found = [p._vehicleType, p._rrFree, e._rrFree, e._through]; return prepareParty.call(this); };
    assert.ok(fight.start({ mode: 'action', troopId: 1 }) > 0);
    assert.deepEqual(found, ['walk', 0, 1, false]);
    w.run(1);
    assert.equal(w.Reactor3D.eventBodyCovers(e, p.x, p.y), false, 'outside its body at ' + p.x + ',' + p.y);
    assert.ok(Math.max(Math.abs(p.x - 65), Math.abs(p.y - 10)) <= 3, 'and near it');
    assert.deepEqual([p._realX, p._realY], [p.x, p.y]);
});

test('with something on all four sides and the events feed absent, the leader is clear of the body all the same', () => {
    const blockers = [[66, 10], [64, 10], [65, 7], [65, 13]].map((at, i) => event(50 + i, at[0], at[1]));
    const w = withFollowers(world({ events: blockers }));
    const p = rideAway(w), e = w.vehicle(31);
    // Nothing listens for the battle's start: what frees the party is this file's own call.
    w.ReactorEvents = undefined;
    let found = null;
    const prepareParty = w.$gameFight.prepareParty;
    w.$gameFight.prepareParty = function() { found = [p._vehicleType, w.Reactor3D.eventBodyCovers(e, p.x, p.y)]; return prepareParty.call(this); };
    assert.ok(w.$gameFight.start({ mode: 'action', troopId: 1 }) > 0);
    assert.deepEqual(found, ['walk', false], 'on foot and clear of the bike before the battle prepares the party');
});

test('a hop is finished first: a battle that starts in the middle of boarding finds the party on foot too', () => {
    const w = withFollowers(world());
    const p = w.$gamePlayer, e = w.vehicle(31);
    let on = 0, off = 0;
    w.ReactorEvents.on('vehicleGetOn', () => on++);
    w.ReactorEvents.on('vehicleGetOff', () => off++);
    w.stand(6, 10, 4);
    w.run(1);
    w.press('ok');
    w.run(1);
    w.run(5);
    assert.equal(p._rrMount.t, 5);
    assert.ok(w.$gameFight.start({ mode: 'action', troopId: 1 }) > 0);
    assert.deepEqual([p._vehicleType, p._rrFree, e._rrFree, e._rrBoarded], ['walk', 0, 1, false]);
    assert.deepEqual([on, off], [1, 1], 'the hop was never cut half way: the ride began and ended');
    assert.equal(w.Reactor3D.eventBodyCovers(e, p.x, p.y), false);
});

test('an Action battle started aboard: the same rule, before its driver takes the player', () => {
    const w = withFollowers(world({ action: true }));
    const p = rideAway(w), e = w.vehicle(31);
    let serial = 0;
    assert.doesNotThrow(() => { serial = w.$gameFight.start({ mode: 'action', troopId: 1 }); });
    assert.ok(serial > 0);
    assert.deepEqual([p._vehicleType, p._rrFree, p._rrRide, p._reactorRiding], ['walk', 0, null, false]);
    assert.deepEqual([e._rrFree, e._rrBoarded, e._through], [1, false, false]);
    assert.doesNotThrow(() => w.run(10));
});

test('a battle on the battle screen: the party comes back in the saddle, at a standstill', () => {
    const w = world();
    const p = rideAway(w), e = w.vehicle(31);
    p._rrDrive.v = 17;
    p._rrDrive.leave = 'ok';
    w.BattleManager.setup(1, true, false);
    assert.equal(p._vehicleType, 'reactor');
    assert.equal(p.vehicle(), e);
    assert.equal(p._rrDrive.v, 0);
    assert.equal(p._rrDrive.leave, '');
    assert.equal(w.V.speed(), 0);
    assert.deepEqual([e._rrBoarded, e._rrFree], [true, 2]);
    // The scene comes back.
    w.V.resume();
    w.run(10);
    assert.equal(p._vehicleType, 'reactor');
    assert.deepEqual([p._realX, p._realY], [65, 10]);
    // On foot the wrapper does nothing.
    const foot = world();
    assert.doesNotThrow(() => foot.BattleManager.setup(1, true, false));
    assert.equal(foot.$gamePlayer._vehicleType, 'walk');
});

test('on a world tileset a land vehicle fights on the ground\'s battleback, and the boat keeps the ship\'s', () => {
    // The stock functions as the file ships them, on a class of their own.
    const sprites = fs.readFileSync(path.join(runtimeRoot, 'reactor_sprites.js'), 'utf8');
    const stock = [1, 2].map(n => sprites.match(new RegExp('Sprite_Battleback\\.prototype\\.overworldBattleback' + n + 'Name = function\\(\\) \\{[\\s\\S]*?\\n\\};'))[0]).join('\n');
    const w = world({ before(ctx) {
        vm.runInContext(`function Sprite_Battleback() {}
            Sprite_Battleback.prototype.normalBattleback1Name = () => "Grassland";
            Sprite_Battleback.prototype.normalBattleback2Name = () => "Grassland2";
            Sprite_Battleback.prototype.shipBattleback1Name = () => "Ship";
            Sprite_Battleback.prototype.shipBattleback2Name = () => "Ship2";
            window.Sprite_Battleback = Sprite_Battleback;
            ` + stock, ctx);
    } });
    const back = vm.runInContext('new Sprite_Battleback()', w), p = w.$gamePlayer;
    assert.deepEqual([back.overworldBattleback1Name(), back.overworldBattleback2Name()], ['Grassland', 'Grassland2'], 'on foot');
    w.stand(6, 10, 4);
    w.board(31);
    assert.equal(p.isInVehicle(), true);
    assert.deepEqual([back.overworldBattleback1Name(), back.overworldBattleback2Name()], ['Grassland', 'Grassland2'], 'aboard a motorcycle');
    w.V.getOff({ instant: true });
    // Aboard the stock boat the ship's battlebacks stay.
    p._vehicleType = 'boat';
    assert.deepEqual([back.overworldBattleback1Name(), back.overworldBattleback2Name()], ['Ship', 'Ship2']);
    p._vehicleType = 'walk';
});

test('a parked vehicle is in a battle\'s way as any solid event, and is not ridden until the battle is over', () => {
    const w = withFollowers(world({ vehicles: [bike(31, 12, 10, { yaw: 180 })] }));
    const p = w.$gamePlayer, e = w.vehicle(31), fight = w.$gameFight;
    w.stand(13, 10, 4);
    w.run(1);
    assert.equal(w.V.offered(true), e);
    assert.ok(fight.start({ mode: 'tactical', troopId: 1 }) > 0);
    assert.equal(e._rrFree, undefined, 'a vehicle nobody rode is not touched by the rule');
    for (const [x, y] of [[12, 9], [12, 10], [12, 11]]) assert.equal(fight.cellTaken(x, y), true);
    assert.equal(w.V.offered(true), null);
    w.press('ok');
    w.run(2);
    assert.equal(p._vehicleType, 'walk');
});
