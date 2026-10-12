'use strict';
// The world of fight-real-world.cjs with the ride loaded on top (runtime/reactor_vehicles_drive.js) and one vehicle
// stood up by hand, for the tests of free movement: no boarding code runs, the saved fields are set as the
// boarding would leave them at its last tick.
//   const w = driveWorld({ data: demoData, mapId: 5, at: [103, 93], yaw: 90 });   the real North Haven
//   const w = driveWorld({ at: [10, 10], sidecar: { terrain } });                  a 3D floor of its own
//   w.keys.up = true; w.run(60); w.drive()                                         ride it; the mover's state
// `Reactor3D.Vehicles.step` and `typeOf` are the runtime's own once reactor_3d_vehicles.js is in the tree; until
// then the arithmetic of the handling model stands in here. With VEH_WORLD=1 the world's own file
// (runtime/reactor_vehicles.js) is loaded under the ride as the game loads it.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { realWorld, event, page } = require('./fight-real-world.cjs');
const { runtimeRoot } = require('./runtime-source.cjs');

const DEG = Math.PI / 180;
const demoData = path.resolve(__dirname, '..', '..', '..', 'template', 'Demo', 'data');
const hasDemo = fs.existsSync(path.join(demoData, 'Map005.json')) && fs.existsSync(path.join(demoData, 'Map005.r3d.json'));
// VEH_DRIVE_FILE: another copy of the ride's file (a changed one, to see that a test notices).
const driveFile = process.env.VEH_DRIVE_FILE || path.join(runtimeRoot, 'reactor_vehicles_drive.js');
const worldFile = path.join(runtimeRoot, 'reactor_vehicles.js');

// A world is the whole runtime in a context of its own, and a test file makes over a hundred of them. Left to
// itself the collector lets them pile up to several hundred megabytes before it runs; asked every few worlds, a
// file's peak stays near what its largest world needs.
let collect = null, made = 0;
try {
    const v8 = require('node:v8');
    v8.setFlagsFromString('--expose-gc');
    collect = vm.runInNewContext('gc');
    v8.setFlagsFromString('--no-expose-gc');
} catch (error) { collect = null; }
const WORLDS_BETWEEN_COLLECTIONS = 6;

/** The id the vehicle's event takes: over every event of the Demo's maps. */
const VEHICLE_EVENT = 90;

const MOTORCYCLE = {
    id: 1, name: 'Motorcycle', kind: 'motorcycle', medium: 'ground', walks: true, leans: true, turnsInPlace: false, played: true, encounters: 'none', rider: 'seat',
    model: { name: 'Vehicles/kawashaki_ninja_h2', file: 'kawashaki_ninja_h2', ext: '.glb', size: 3.5 },
    handling: { speed: 20, toTopSpeed: 3, turnCircle: 3, jump: 0.75, brake: 0.67, coast: 2.5, reverse: 3, lean: 40, step: 0.75, wade: 0.45, turnInPlace: 0, grip: 32, turnRate: 150 },
    body: { height: 2.6, radius: 0.45 }
};

// The contract with RPG Maker that the world's file keeps (SPEC-v2 2.3), as much of it as the ride meets: aboard a
// new vehicle `isInVehicle()` is true and `vehicle()` is the ridden event, which answers what the stock player asks.
const CONTRACT = `(function() {
    const isInVehicle = Game_Player.prototype.isInVehicle;
    Game_Player.prototype.isInVehicle = function() { return this._vehicleType === "reactor" ? !!$gameMap.vehicle("reactor") : isInVehicle.call(this); };
    const vehicle = Game_Map.prototype.vehicle;
    Game_Map.prototype.vehicle = function(type) {
        if (type !== "reactor") return vehicle.call(this, type);
        const ride = $gamePlayer._rrRide, event = ride && ride.map === this.mapId() ? this._events[ride.id] : null;
        return event && event._rrBoarded ? event : null;
    };
    Object.assign(Game_Event.prototype, { canMove() { return !$gamePlayer._rrMount || !!$gamePlayer._rrMount.drawn; }, syncWithPlayer() {}, getOn() {}, getOff() {},
        isLowest() { return true; }, isHighest() { return true; }, maxAltitude() { return 1; }, isLandOk() { return false; } });
})();`;

/** The handling model of the specification (4.5), standing in until the runtime's own `step` is in the tree. */
function standInStep(s, input, type, env, dt) {
    const h = type.handling, num = k => (Number.isFinite(s[k]) ? s[k] : 0);
    let v = num('v'), steer = num('steer'), rest = num('rest');
    const radius = h.turnCircle / 2, launch = 2.303 * h.speed / h.toTopSpeed, brakeA = h.speed / h.brake, coastA = h.speed / h.coast;
    const turnRate = h.turnRate * DEG, grip = h.grip, air = !!(env && env.air);
    const want = Math.max(-1, Math.min(1, Number(input.steer) || 0));
    if (input.analog) steer = want;
    else { const T = Math.abs(want) < Math.abs(steer) || want * steer < 0 ? 0.10 : 0.18; steer += Math.max(-dt / T, Math.min(dt / T, want - steer)); }
    const cap = h.speed * (env && env.slope > 0 ? env.slope : 1) * (env && env.water ? 0.7 : 1);
    const shed = Math.max(0, Math.min(1, (Math.abs(steer) - 0.6) / 0.4));
    const top = cap - (cap - Math.min(cap, grip / turnRate)) * shed;
    const gas = Number(input.gas) || 0, brake = Number(input.brake) || 0;
    if (!air) {
        if (v > cap) v = Math.max(cap, v - 0.5 * brakeA * dt);
        if (v > top) v = Math.max(top, v - 20 * shed * dt);
        if (gas) { if (v < top) v += launch * gas * (1 - v / top) * dt; rest = 0; }
        else if (brake) {
            if (v > 0) { v = Math.max(0, v - brakeA * dt); rest = 0; }
            else if (++rest >= 6 && h.reverse > 0) v = Math.max(-h.reverse, v - 0.5 * launch * dt);
            else v = 0;
        } else { v = v > 0 ? Math.max(0, v - coastA * dt) : Math.min(0, v + coastA * dt); rest = 0; }
    }
    const av = Math.abs(v);
    let rate = av > 1e-9 && radius > 0 ? steer * Math.min(av / radius, turnRate, grip / av) : 0, signed = rate * Math.sign(v);
    if (type.walks && av < 1 && !gas && !brake && !air) signed = rate = steer * 120 * DEG;
    if (type.turnsInPlace && av < 1) signed = rate = steer * h.turnInPlace * DEG;
    if (air) { signed /= 4; rate /= 4; }
    s.v = v; s.steer = steer; s.rest = rest;
    s.turn = signed * dt; s.go = v * dt; s.rate = rate;
    // Drawn only: the lean into the turn, the nose under throttle and brake, the slope under the wheels.
    const lean = type.leans ? h.lean * DEG * Math.min(1, av * Math.abs(rate) / grip) * Math.sign(s.turn) : 0;
    s.roll = num('roll') + (lean - num('roll')) * Math.min(1, dt / 0.15);
    const squat = air ? 0 : gas && v >= 0 ? 2 * DEG * Math.max(0, 1 - v / (top > 0 ? top : 1)) : brake && v > 0.05 ? -4 * DEG : 0;
    s.squat = num('squat') + Math.max(-DEG, Math.min(DEG, squat - num('squat')));
    s.tilt = air ? Math.max(-25 * DEG, num('tilt') - 10 * DEG * dt) : num('tilt') + ((env && Number.isFinite(env.pitch) ? env.pitch : 0) - num('tilt')) * Math.min(1, dt / 0.08);
    s.pitch = s.tilt + s.squat;
    if (env && env.alone) { s.yaw = num('yaw') + s.turn; s.x = num('x') + Math.sin(s.yaw) * s.go; s.y = num('y') - Math.cos(s.yaw) * s.go; s.travel = num('travel') + s.go; }
    return s;
}

/**
 * A 3D floor of its own, as realWorld's options: `ground(x, y)` each cell's height (0 where it answers nothing),
 * `terrain(x, y)` the rise of the ground at each tile corner (rolling ground: smooth between corners), `water` sheets ({ x0, y0, x1, y1, level }), `pieces` ({ kind, x, y, z, rot } or a shape with `size` and `angle`),
 * `physics` the map's own (gravity, jump, fall damage).
 */
function floor({ width = 60, height = 40, ground = null, terrain = null, water = null, pieces = null, physics = null } = {}) {
    const sidecar = {};
    if (ground) {
        sidecar.elevation = new Array(width * height).fill(0);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) sidecar.elevation[y * width + x] = Number(ground(x, y)) || 0;
    }
    if (terrain) {
        sidecar.terrain = new Array((width + 1) * (height + 1)).fill(0);
        for (let y = 0; y <= height; y++) for (let x = 0; x <= width; x++) sidecar.terrain[y * (width + 1) + x] = Number(terrain(x, y)) || 0;
    }
    if (water) sidecar.water = water;
    if (pieces) sidecar.pieces = pieces.map((piece, i) => Object.assign({ id: i + 1, z: 0, rot: 0 }, piece));
    if (physics) sidecar.physics = physics;
    return { width, height, sidecar };
}

/**
 * `at` the tile the vehicle's middle is on (fractions allowed), `yaw` degrees (0 north, clockwise), `type` what the
 * type record adds to the motorcycle's (`{ handling: { jump: 0 }, encounters: "half" }`); everything else is
 * realWorld's. `board: false` leaves the party on foot on the vehicle's tile with nothing set. `camera` is the map
 * camera's mode (third person unless said; null keeps the map's own).
 */
function driveWorld({ at = [10, 10], yaw = 0, type = null, board = true, camera = 'thirdPerson', events = [], prepare = null, withWorld = process.env.VEH_WORLD === '1', ...rest } = {}) {
    if (collect && ++made % WORLDS_BETWEEN_COLLECTIONS === 0) collect();
    // The type record as a project's file holds it: the smallest that works, and what the test adds.
    const record = Object.assign({ id: 1, name: 'Motorcycle', kind: 'motorcycle', model: { name: 'Vehicles/kawashaki_ninja_h2', file: 'kawashaki_ninja_h2', size: 3.5 } }, type || {});
    // The same record filled from the motorcycle's numbers, for the stand-in `typeOf`.
    const filled = JSON.parse(JSON.stringify(MOTORCYCLE));
    for (const key of Object.keys(record)) filled[key] = record[key] && typeof record[key] === 'object' && !Array.isArray(record[key]) ? Object.assign(filled[key] || {}, record[key]) : record[key];
    const tile = [Math.round(at[0]), Math.round(at[1])];
    const vehicle = event(VEHICLE_EVENT, tile[0], tile[1], { name: 'Motorcycle', rrVehicle: { type: 1, yaw }, pages: [page({ priorityType: 1, trigger: 0 })] });
    const w = realWorld(Object.assign({ start: tile }, rest, {
        events: events.concat([vehicle]),
        prepare(mapData, ctx) {
            // The keys a test holds, read as the game reads them.
            ctx.keys = { up: false, down: false, left: false, right: false, ok: false, jump: false, control: false };
            ctx.pressed = {};
            ctx.Input.isPressed = name => !!ctx.keys[name];
            ctx.Input.isTriggered = name => !!ctx.pressed[name];
            ctx.Input._gamepadStates = [];
            ctx.$dataReactorVehicles = [null, record];
            const V = ctx.Reactor3D.Vehicles || (ctx.Reactor3D.Vehicles = {});
            ctx.standIn = typeof V.step !== 'function';
            if (typeof V.step !== 'function') V.step = standInStep;
            if (typeof V.typeOf !== 'function') V.typeOf = () => filled;
            if (withWorld && fs.existsSync(worldFile)) vm.runInContext(fs.readFileSync(worldFile, 'utf8'), ctx, { filename: 'reactor_vehicles.js' });
            else vm.runInContext(CONTRACT, ctx, { filename: 'vehicles-contract-stand-in' });
            vm.runInContext(fs.readFileSync(driveFile, 'utf8'), ctx, { filename: 'reactor_vehicles_drive.js' });
            if (prepare) prepare(mapData, ctx);
        }
    }));
    w.record = record;
    w.type = () => w.Reactor3D.Vehicles.typeOf(record);
    w.loadedWorld = !!(withWorld && fs.existsSync(worldFile));
    if (camera) w.$gameMap._reactorCamera3d = w.Reactor3D.Camera.normalizeState({ mode: camera });
    w.vehicleId = VEHICLE_EVENT;
    w.vehicle = () => w.$gameMap.event(VEHICLE_EVENT);
    w.Drive = w.ReactorVehicles.Drive;
    w.drive = () => w.$gamePlayer._rrDrive;
    /** The saved fields as the last tick of boarding leaves them, with the vehicle's middle at tile (x, y) and heading `degrees`. */
    w.mount = (x, y, degrees) => {
        const p = w.$gamePlayer, e = w.vehicle();
        for (const c of [p, e]) { c._realX = x; c._realY = y; c._x = Math.round(x); c._y = Math.round(y); c._reactorGround = undefined; c._reactorAlt = undefined; c._reactorAir = 0; c._reactorVz = 0; }
        e._rrVehicle = 1; e._rrBoarded = true; e._rrFree = 2; e._through = true; e._rrYaw = degrees * DEG; e._rrHome = [Math.round(x), Math.round(y), degrees];
        p._vehicleType = 'reactor'; p._rrRide = { map: w.$gameMap.mapId(), id: VEHICLE_EVENT }; p._rrFree = 1; p._rrSeated = true; p._rrMount = null;
        p._rrDrive = null; p._rrWas = { speed: p._moveSpeed, transparent: false };
        p._followers._data.forEach(f => { f._realX = x; f._realY = y; f._x = Math.round(x); f._y = Math.round(y); });
        return p;
    };
    /** Frames with the keys as they are held; `pressed` names are triggered on the first frame only. */
    const run = w.run;
    w.run = (frames, until) => {
        let n = 0;
        const done = run(frames, () => { n++; if (n === 1) w.pressed = {}; return until ? until() : false; });
        w.pressed = {};
        return done;
    };
    // Nobody is at the keyboard on these rides: an event that talks (a message, choices, a number, an item) is not
    // started by a touch, so a villager a project sets to Player Touch does not hold the ride. One that only acts
    // (a transfer, a door) still runs.
    const TALKS = [101, 102, 103, 104, 105];
    const start = w.Game_Event.prototype.start;
    w.Game_Event.prototype.start = function() {
        const list = this.list();
        if (list && list.some(command => TALKS.includes(command.code))) return;
        start.call(this);
    };
    /** One press: `w.press("jump")` is seen by the next frame only. */
    w.press = name => { w.pressed[name] = true; };
    /** The vehicle's middle in world tiles, its heading in degrees, its speed. */
    w.where = () => { const p = w.$gamePlayer, d = p._rrDrive || {}; return { x: p._realX + 0.5, y: p._realY + 0.5, yaw: (d.yaw || 0) / DEG, v: d.v || 0, alt: d.alt, air: d.air }; };
    if (board) { w.mount(at[0], at[1], yaw); w.Drive.board(w.vehicle()); }
    return w;
}

module.exports = { driveWorld, floor, standInStep, event, page, demoData, hasDemo, DEG, VEHICLE_EVENT, MOTORCYCLE };
