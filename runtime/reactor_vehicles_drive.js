//=============================================================================
// reactor_vehicles_drive.js - the ride: free movement aboard a vehicle
//=============================================================================
//
// Aboard a vehicle (`$gamePlayer._vehicleType === "reactor"`) on a 3D map the
// player is moved freely: a place, a heading and a speed, stepped once per
// logic tick by `ReactorVehicles.Drive.tick`. The vehicle's event copies the
// player.
//
// One saved flag, `_rrFree`, on a character says "its `_realX`, `_realY` are
// where it is; nothing glides it": 1 it stands where it is (the player while
// riding and during the two hops, a vehicle parked by the mover), 2 it is
// carried (the ridden vehicle's event). The flag is data; the behavior is on
// the prototypes below, so a loaded save rides on.
//
// The tick: the keys and the pad as throttle, brake and steering (in the
// fixed views a held direction is driven toward) -> the handling step
// (`Reactor3D.Vehicles.step`) -> the turn, taken only where both axles'
// circles may swing to where it puts them -> the travel, tried whole and
// then on feelers turned to each side, so a wall is slid along -> each tile
// entered, in order: the party's walk, touch triggers, the encounter count
// -> the ground under the two axles and the middle: height, pitch, air,
// landing, water -> what is drawn (heading, pitch, lean, steering, travel),
// written to the vehicle's event.
//
// The body is three circles on its center line: one at each axle, one at its
// middle. What stops it: the map's border; ground more than a step over the
// ground its leading circle is on (a wall, a rock, a ledge), at three points
// of that circle's rim and under each circle's middle; a slope too steep to
// walk, at its foot; a big bush; anything built that stands between its
// bumper and its rider's head, as it is drawn; tiles RPG Maker's flags
// close; an event's body. Water stops nothing: it is ridden into. The
// circles behind the leading one, and both axles' circles in a turn, meet
// what is built, bushes and bodies as it does.
//
// Where it rests: on both wheels while the ground under its middle is about
// on the line between them; with a wheel over a drop, on the ground under
// its middle, the wheel hanging. So it is never drawn under the ground its
// middle is over, and a wheel swung or ridden over an edge or over water
// takes nothing down with it. A drop is ridden off: it is in the air once
// its middle is over the drop, until it meets the ground, and nobody is
// hurt. In water deeper than its wade, ridden into or come down in, the ride
// is over: its rider is in the water on foot and it goes down to the bed and
// stays there (ReactorVehicles.sink). Boarded there (`flooded`) it is walked
// along the bed, and runs again out of the water. Refused both ways with a key held, it
// is put back on the last place it could stand on and leave; stuck again
// soon after, on the one before, then where it was boarded.
//
// A forced move route on the riding player runs as tile steps from its first
// movement command; any RPG Maker mover on a parked vehicle gives it back to
// the grid. A transfer to another map parks the vehicle and lands the party
// on foot; one on the same map brings it along where it fits.
//
// Nothing is created per tick. On foot every wrapper here is one test of
// `_rrFree` on its own character.
//=============================================================================

(function(root) {
    "use strict";

    const ReactorVehicles = typeof root.ReactorVehicles !== "undefined" && root.ReactorVehicles
        ? root.ReactorVehicles : (root.ReactorVehicles = {});
    const Drive = ReactorVehicles.Drive = {};

    const DEG = Math.PI / 180, TAU = Math.PI * 2, DT = 1 / 60;

    /** The longest travel tested as one step, in tiles: a faster tick is cut into equal steps. */
    Drive.STEP_MAX = 0.4;
    /** The turns a refused step is tried at, in degrees, the smaller first. The last pair only under `BUMP_FROM`, or while already sliding on it. */
    Drive.FEELERS = Object.freeze([15, -15, 30, -30, 45, -45, 60, -60, 75, -75]);
    /** A dead stop from this speed up (tiles a second) is a hit: the thud and the sit back. Under it a stop is silent. */
    Drive.BUMP_FROM = 3;
    /** A hit from this speed up kicks the camera. */
    Drive.KICK_FROM = 6;
    /** Ticks between two notes of the last dry place. */
    Drive.DRY_EVERY = 30;
    /** Ticks refused both ways, with a key held, before the vehicle is put back on the last dry place. */
    Drive.RESCUE_AFTER = 30;
    /** Ticks ridden since it was last put back for being stuck, from which the next time counts as the first again. */
    Drive.CALM_AFTER = 3600;
    /** What refused a place, by the code `refuse` answers. */
    Drive.REFUSALS = Object.freeze(["", "border", "rise", "water", "steep", "tail", "bush", "solid", "tiles", "event"]);

    const FEEL_COS = new Float64Array(10), FEEL_SIN = new Float64Array(10);
    for (let i = 0; i < 10; i++) { FEEL_COS[i] = Math.cos(Drive.FEELERS[i] * DEG); FEEL_SIN[i] = Math.sin(Drive.FEELERS[i] * DEG); }
    const RIM_COS = Math.cos(35 * DEG), RIM_SIN = Math.sin(35 * DEG);
    const DIR8 = Object.freeze([8, 9, 6, 3, 2, 1, 4, 7]), DIR4 = Object.freeze([8, 6, 2, 4]);
    const YAW8 = Object.freeze([0, 5, 4, 3, 6, 0, 2, 7, 0, 1]);     // a facing (1..9) as eighths of a turn from north
    const HERE = Object.freeze([1, 2]), WITHIN = Object.freeze({ within: 1 }), AT_ONCE = Object.freeze({ instant: true });
    /** How far the heading may ease toward a slide in one tick, in radians (120 degrees a second). */
    const SWING = 120 * DEG * DT;

    /** The motorcycle's numbers, for a ride with no type record to read. */
    const DEFAULT_TYPE = Object.freeze({
        id: 0, kind: "motorcycle", medium: "ground", walks: true, leans: true, turnsInPlace: false, encounters: "none",
        model: Object.freeze({ size: 3.5 }),
        handling: Object.freeze({ speed: 20, toTopSpeed: 3, turnCircle: 3, jump: 0.75, brake: 0.67, coast: 2.5, reverse: 3, lean: 40,
            step: 0.75, wade: 0.45, turnInPlace: 0, grip: 32, turnRate: 150 }),
        body: Object.freeze({ height: 2.6, radius: 0.45 })
    });

    //-------------------------------------------------------------------------
    // Scratch and one-ride counters. Numbers only; nothing here is saved.

    const IN = { gas: 0, brake: 0, steer: 0, jump: false, analog: false };
    const USED = { gas: 0, brake: 0, steer: 0, jump: false, analog: false };
    const ENV = { slope: 1, water: false, air: false, pitch: 0, alone: false, flooded: false };
    const SHAPE = { front: 1.225, rear: 1.225, radius: 0.45, height: 2.6 };
    /** What the last tick did, for a test or a harness: read it, do not keep it. */
    Drive.last = { entered: 0, slid: 0, stopped: 0, refused: 0, moved: 0, turned: 0, controls: 0, air: 0 };

    let seen = null, seenX = NaN, seenY = NaN;
    let wasGas = false;
    let stuckF = 0, stuckR = 0, scrapeWait = 0, dryWait = 0, lastRise = 0;
    let touchX = -1, touchY = -1, hitX = -1, hitY = -1;
    let passLead = 0, passTrail = 0, passMid = 0, swingF = 0, swingR = 0;
    // The ground under the middle where the vehicle is, when a step of this tick read it.
    let midNew = false, midRead = 0;
    // What `rest` answers: the vehicle's height, each axle's, and how far the ground under its middle holds it over its wheels.
    let restAlt = 0, restF = 0, restR = 0, restLift = 0;
    let clearX = NaN, clearY = NaN, clearYaw = 0, clearAlt = 0;
    // A vehicle parked for a transfer to another map, and the place off the strip it takes when this map is left.
    let parked = null, parkX = NaN, parkY = NaN, parkYaw = 0, parkAlt = 0;
    // Which remembered place the vehicle being put back is tried on first: 0 the newest, 4 the one before, 8 where it was boarded.
    let backFrom = 0;
    // The ride ended in the water on this tick.
    let sunk = false;
    // The last eight tiles a circle came onto and found no event's body on, and the tick it was (`tickNo`).
    const FREE_TILE = new Int32Array(8).fill(-1), FREE_AT = new Float64Array(8);
    let freeNext = 0, tickNo = 0;
    let S_step = 0.75, S_wade = 0.45, S_jump = 0, S_grav = 0.0045, S_wet = false, S_bush = false, S_debug = false;
    let wX = NaN, wY = NaN, wAlt = NaN, wYaw = NaN, wPitch = NaN, wRoll = NaN, wSteer = NaN, wTravel = NaN, wFoot = NaN;

    const finite = Number.isFinite;
    const world = () => typeof root.Reactor3D !== "undefined" ? root.Reactor3D : null;
    const physics = () => typeof root.ReactorPhysics !== "undefined" ? root.ReactorPhysics : null;

    /** An angle in 0 .. 2 pi. */
    function turnOf(angle) {
        angle %= TAU;
        return angle < 0 ? angle + TAU : angle;
    }

    /** The signed difference from one heading to another, -pi .. pi. */
    function arc(from, to) {
        let d = (to - from) % TAU;
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU;
        return d;
    }

    /** A facing (1..9) as a heading in radians: 8 is north (0), 6 east, 2 south, 4 west. */
    Drive.yawOf = function(direction) {
        return (YAW8[direction] || 0) * Math.PI / 4;
    };
    /** The nearest of the eight facings to a heading. */
    Drive.dir8Of = function(yaw) {
        return DIR8[Math.round(turnOf(yaw) / (Math.PI / 4)) & 7];
    };
    /** The nearest of the four directions to a heading. */
    Drive.dir4Of = function(yaw) {
        return DIR4[Math.round(turnOf(yaw) / (Math.PI / 2)) & 3];
    };

    //-------------------------------------------------------------------------
    // Who is ridden, and what kind of thing it is

    function riddenBy(player) {
        if (typeof ReactorVehicles.ridden === "function") return ReactorVehicles.ridden();
        const ride = player._rrRide, map = typeof root.$gameMap !== "undefined" ? root.$gameMap : null;
        if (!ride || !map || !map._events || ride.map !== map.mapId()) return null;
        const event = map._events[ride.id];
        return event && event._rrBoarded ? event : null;
    }

    function typeFor(event) {
        const id = event ? event._rrVehicle : 0;
        if (typeof ReactorVehicles.type === "function") { const type = ReactorVehicles.type(id); if (type) return type; }
        const R = world(), V = R && R.Vehicles;
        if (V && typeof V.typeOf === "function") {
            const list = typeof root.$dataReactorVehicles !== "undefined" ? root.$dataReactorVehicles : null;
            const type = V.typeOf((list && list[id]) || null);
            if (type) return type;
        }
        return DEFAULT_TYPE;
    }

    /**
     * Where a vehicle's two axles are, in tiles from its middle along its heading, and its circles' radius and
     * the room it needs overhead. Without the model's own answer: 35% of its length each way.
     */
    Drive.axles = function(event, type, out) {
        const size = type && type.model && type.model.size > 0 ? type.model.size : DEFAULT_TYPE.model.size;
        out.front = out.rear = size * 0.35;
        out.radius = type && type.body && type.body.radius > 0 ? type.body.radius : DEFAULT_TYPE.body.radius;
        out.height = type && type.body && type.body.height > 0 ? type.body.height : DEFAULT_TYPE.body.height;
        const R = world(), V = R && R.Vehicles;
        if (V && typeof V.axles === "function") V.axles(event, type, out);
        return out;
    };

    function emit(name, event, key, value) {
        const feed = typeof root.ReactorEvents !== "undefined" ? root.ReactorEvents : null;
        if (!feed || !feed._listeners || !feed._listeners[name] || !event) return;
        const mapId = typeof root.$gameMap !== "undefined" && root.$gameMap ? root.$gameMap.mapId() : 0;
        // The identity boarding reports: a database placement's and a visiting vehicle's are not this map's event id.
        const identity = typeof ReactorVehicles.idOf === "function" ? ReactorVehicles.idOf(event) : mapId + ":" + event._eventId;
        const payload = { vehicle: identity, type: event._rrVehicle, eventId: event._eventId };
        payload[key] = value;
        feed.emit(name, payload);
    }

    function feel() {
        return ReactorVehicles.Feel || null;
    }

    //-------------------------------------------------------------------------
    // The mover's state: `$gamePlayer._rrDrive`

    const NUMBERS = ["v", "steer", "yaw", "vz", "pitch", "roll", "travel", "rest", "foot", "grid", "turn", "go", "rate", "tilt", "squat",
        "air", "back", "fade", "slide", "resc", "calm"];

    /**
     * Every field the tick reads, a finite number: a state made by another file, or by an older save, is filled in.
     * `dry` is three remembered places of four numbers each (x, y, heading, height): the last one it could stand
     * on and leave, the one before that, and where it was boarded.
     */
    function complete(d) {
        for (let i = 0; i < NUMBERS.length; i++) if (!finite(d[NUMBERS[i]])) d[NUMBERS[i]] = 0;
        for (const name of ["alt", "gf", "gr", "peak"]) if (!finite(d[name])) d[name] = NaN;
        if (!finite(d.gm)) d.gm = d.alt;
        if (typeof d.leave !== "string") d.leave = d.leave ? "ok" : "";
        // The two countdowns never run longer than the longest dip to black.
        d.back = d.back > 20 ? 20 : d.back < 0 ? 0 : d.back;
        d.fade = d.fade > 20 ? 20 : d.fade < 0 ? 0 : d.fade;
        if (!Array.isArray(d.dry)) d.dry = [];
        const dry = d.dry;
        for (let i = 0; i < 12; i++) if (!finite(dry[i])) dry[i] = i >= 4 ? dry[i - 4] : i < 2 ? NaN : 0;
        return d;
    }

    function forget() {
        wasGas = false;
        stuckF = stuckR = scrapeWait = dryWait = lastRise = 0;
        touchX = touchY = -1;
        seenX = seenY = NaN;
        clearX = clearY = NaN;
        wX = NaN;
    }

    /**
     * Where the vehicle rests with its axles over ground `gF` and `gR` and its middle over `gM`: its height into
     * `restAlt`, each axle's into `restF` and `restR`. Both wheels stand on their ground while the ground under the
     * middle is no more than half a step over the line between them (a curb, a crest, a hillside). Over that the
     * lower wheel hangs: the vehicle lies on the ground under its middle, wholly from a full step over the line,
     * as level as the wheel that stands lets it.
     */
    function rest(gF, gM, gR) {
        const mean = (gF + gR) / 2, half = S_step / 2, sag = gM - mean;
        if (!(sag > half)) { restAlt = mean; restF = gF; restR = gR; restLift = 0; return; }
        const lift = sag >= S_step ? sag : sag * (sag - half) / half, alt = mean + lift, gap = gF > gR ? gF - gR : gR - gF;
        restAlt = alt; restLift = lift;
        if (gap <= 2 * lift) restF = restR = alt;
        else if (gF > gR) { restF = gF; restR = 2 * alt - gF; }
        else { restR = gR; restF = 2 * alt - gR; }
    }

    /** The ground under the middle and both axles at a place (`_realX`, `_realY`), read on the storey nearest `near`: at a standstill there. */
    function seatAt(d, x, y, near) {
        const R = world(), map = typeof root.$dataMap !== "undefined" ? root.$dataMap : null;
        d.air = 0; d.vz = 0; d.slide = 0;
        if (!R || !map || !R.isMap3D || !R.isMap3D(map) || !R.groundHeightAt) { d.alt = d.gf = d.gr = d.gm = d.peak = 0; return; }
        const cx = x + 0.5, cz = y + 0.5, hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw);
        const mid = R.groundHeightAt(map, cx, cz, near);
        let gf = R.groundHeightAt(map, cx + hx * SHAPE.front, cz + hz * SHAPE.front, mid);
        let gr = R.groundHeightAt(map, cx - hx * SHAPE.rear, cz - hz * SHAPE.rear, mid);
        // An axle over something the middle could not have rolled onto (a wall it was authored beside) stands on the middle's ground.
        if (gf - mid > S_step) gf = mid;
        if (gr - mid > S_step) gr = mid;
        rest(gf, mid, gr);
        d.gf = restF; d.gr = restR; d.gm = mid; d.alt = d.peak = restAlt;
    }

    function shapeFor(event, type) {
        Drive.axles(event, type, SHAPE);
        const handling = type.handling || DEFAULT_TYPE.handling;
        S_step = handling.step > 0 ? handling.step : DEFAULT_TYPE.handling.step;
        S_wade = handling.wade >= 0 ? handling.wade : DEFAULT_TYPE.handling.wade;
    }

    /** The mover's state for a ride that begins on `event`: its heading, a standstill, the ground under it, the dry place here. */
    Drive.board = function(event) {
        const player = typeof root.$gamePlayer !== "undefined" ? root.$gamePlayer : null;
        if (!player || !event) return;
        let d = player._rrDrive;
        if (!d || typeof d !== "object") d = player._rrDrive = {};
        complete(d);
        d.yaw = turnOf(finite(event._rrYaw) ? event._rrYaw : Drive.yawOf(event._reactorDir8 || event._direction));
        d.v = 0; d.steer = 0; d.rest = 0; d.turn = 0; d.go = 0; d.rate = 0; d.squat = 0; d.roll = 0; d.back = 0; d.fade = 0; d.grid = 0; d.foot = 0;
        shapeFor(event, typeFor(event));
        seatAt(d, event._realX, event._realY, finite(event._reactorGround) ? event._reactorGround : player._reactorGround);
        d.pitch = d.tilt = Math.atan2(d.gf - d.gr, SHAPE.front + SHAPE.rear);
        remember(d, event._realX, event._realY, 12);
        forget();
        clearX = event._realX; clearY = event._realY; clearYaw = d.yaw; clearAlt = d.alt;
        seen = d;
    };

    /** A place written to the first `count` numbers of the remembered places: the heading and the height are the state's. */
    function remember(d, x, y, count) {
        const dry = d.dry;
        for (let i = 0; i < count; i += 4) { dry[i] = x; dry[i + 1] = y; dry[i + 2] = d.yaw; dry[i + 3] = d.alt; }
    }

    /** After a transfer the places it is put back on are the one it arrived at: those it remembered are of where it was. */
    function arrived(player, d) {
        remember(d, player._realX, player._realY, 12);
        clearX = player._realX; clearY = player._realY; clearYaw = d.yaw; clearAlt = d.alt;
        dryWait = 0;
    }

    /** A vehicle that is parked or left: nothing of the ride stays on what is drawn of it. */
    Drive.leave = function(event) {
        if (!event) return;
        event._rrSpeed = 0; event._rrSteer = 0; event._rrLean = 0;
        event._rrPose = ((event._rrPose | 0) + 1) % 1000000000;
    };

    /** The ground under both axles read again where the player is now, at a standstill (after `locate`, a transfer, a route). */
    Drive.seat = function(player) {
        player = player || (typeof root.$gamePlayer !== "undefined" ? root.$gamePlayer : null);
        const d = player && player._rrDrive;
        if (!d) return;
        complete(d);
        d.v = 0; d.steer = 0; d.rest = 0;
        seatAt(d, player._realX, player._realY, player._reactorGround);
        seenX = player._realX; seenY = player._realY;
    };

    /** The state the tick works on, adopted when it is one the tick has not met (a new ride, a loaded save). */
    function stateOf(player, event) {
        const d = player._rrDrive;
        if (d && d === seen) return d;
        if (!d || typeof d !== "object" || !finite(d.alt) || !finite(d.gf) || !finite(d.gr)) { Drive.board(event); return player._rrDrive; }
        complete(d);
        d.yaw = turnOf(d.yaw);
        if (!finite(d.dry[0])) remember(d, player._realX, player._realY, 12);
        shapeFor(event, typeFor(event));
        forget();
        seen = d;
        return d;
    }

    /** `$gamePlayer._rrDrive` while driving, every field a number; else null. */
    Drive.state = function() {
        const player = typeof root.$gamePlayer !== "undefined" ? root.$gamePlayer : null;
        if (!Drive.isDriving()) return null;
        const event = riddenBy(player);
        return event ? stateOf(player, event) : null;
    };

    /** Aboard a new vehicle and seated, on a 3D map (a forced route's tile steps included). */
    Drive.isDriving = function() {
        const player = typeof root.$gamePlayer !== "undefined" ? root.$gamePlayer : null;
        if (!player || !player._rrFree || player._vehicleType !== "reactor") return false;
        const mount = player._rrMount;
        if (mount && !mount.drawn) return false;
        const R = world(), map = typeof root.$dataMap !== "undefined" ? root.$dataMap : null;
        return !!(R && map && R.Vehicles && riddenBy(player));
    };

    //-------------------------------------------------------------------------
    // Input

    function cameraMode() {
        const R = world(), camera = R && R.Camera;
        if (!R || !R.isMap3D || !R.isMap3D(root.$dataMap)) return "";
        if (!camera || typeof camera.currentState !== "function") return "";
        const state = camera.currentState();
        return state ? state.mode : "";
    }

    /** "third": throttle, brake and steering. "point": a held direction is driven toward (the fixed, top-down and isometric views). */
    Drive.scheme = function() {
        const mode = cameraMode();
        return mode === "thirdPerson" || mode === "firstPerson" ? "third" : "point";
    };

    /** The heading "up on the screen" is, in radians, where a held direction is driven toward. */
    Drive.viewYaw = function() {
        const R = world(), camera = R && R.Camera;
        if (!camera || typeof camera.currentState !== "function") return 0;
        const state = camera.currentState();
        if (!state || state.mode !== "isometric") return 0;
        const scene = typeof root.SceneManager !== "undefined" && root.SceneManager ? root.SceneManager._scene : null;
        const live = scene && scene._spriteset ? scene._spriteset._reactor3d : null;
        const current = live ? live.cameraCurrent : null;
        const degrees = current && finite(current.yaw) ? current.yaw : finite(state.yaw) ? state.yaw
            : camera.MODES && camera.MODES.isometric ? camera.MODES.isometric.yaw : 45;
        return degrees * DEG;
    };

    function padButton(index) {
        const input = root.Input, states = input && input._gamepadStates;
        if (!states) return false;
        for (let i = 0; i < states.length; i++) { const state = states[i]; if (state && state[index]) return true; }
        return false;
    }

    /**
     * The keys and the pad as the mover's input. Third person: up and the right trigger are the throttle, down and
     * the left trigger the brake (the brake wins), left and right steer. The fixed views: the held direction is a
     * heading through the camera's yaw; the vehicle steers toward it, and turns where it stands first when it
     * points the other way. A kind that cannot turn where it stands drives round on full lock instead.
     */
    Drive.input = function(out) {
        out = out || IN;
        out.gas = 0; out.brake = 0; out.steer = 0; out.jump = false; out.analog = false;
        const input = typeof root.Input !== "undefined" ? root.Input : null;
        if (!input || typeof input.isPressed !== "function") return out;
        const R = world(), held = R && R.Camera ? R.Camera.held : null;
        const up = (held && held.has("forward")) || input.isPressed("up") || padButton(7);
        const down = (held && held.has("back")) || input.isPressed("down") || padButton(6);
        const left = (held && held.has("left")) || input.isPressed("left");
        const right = (held && held.has("right")) || input.isPressed("right");
        out.jump = typeof input.isTriggered === "function" && input.isTriggered("jump");
        if (Drive.scheme() === "third") {
            out.brake = down ? 1 : 0;
            out.gas = up && !down ? 1 : 0;
            out.steer = (right ? 1 : 0) - (left ? 1 : 0);
            return out;
        }
        const forward = (up ? 1 : 0) - (down ? 1 : 0), strafe = (right ? 1 : 0) - (left ? 1 : 0);
        if (!forward && !strafe) return out;
        const player = typeof root.$gamePlayer !== "undefined" ? root.$gamePlayer : null, d = player ? player._rrDrive : null;
        const yaw = d && finite(d.yaw) ? d.yaw : 0, v = d && finite(d.v) ? d.v : 0;
        const err = arc(yaw, Drive.viewYaw() + Math.atan2(strafe, forward)) / DEG, away = Math.abs(err) >= 100;
        if (away && v < 3) {
            // Pointing the other way at a crawl: walked or spun round where it stands; a kind that does neither
            // is driven round on full lock.
            const type = player ? typeFor(riddenBy(player)) : DEFAULT_TYPE;
            if (type.walks || type.turnsInPlace) { if (v < 1) { out.steer = err < 0 ? -1 : 1; return out; } }
            else { out.steer = err < 0 ? -1 : 1; out.gas = 1; return out; }
        }
        out.steer = err > 30 ? 1 : err < -30 ? -1 : err / 30;
        if (away) out.brake = 1; else out.gas = 1;
        return out;
    };

    //-------------------------------------------------------------------------
    // The tick's path. Nothing from here to the end of `Drive.tick` creates an object.

    /** Whether tile (tx, tz) lies under the circle of radius r about (cx, cz). */
    function reaches(cx, cz, r, tx, tz) {
        const dx = cx < tx ? tx - cx : cx > tx + 1 ? cx - tx - 1 : 0, dz = cz < tz ? tz - cz : cz > tz + 1 ? cz - tz - 1 : 0;
        return dx * dx + dz * dz < r * r;
    }

    /** RPG Maker's tile flags between two neighboring tiles, both ways; a corner as a diagonal step. */
    function tilesPass(ax, ay, bx, by) {
        const map = root.$gameMap;
        if (!map || typeof map.isPassable !== "function") return true;
        const horz = bx > ax ? 6 : bx < ax ? 4 : 0, vert = by > ay ? 2 : by < ay ? 8 : 0;
        if (horz && vert) {
            return (map.isPassable(ax, ay, vert) && map.isPassable(ax, by, 10 - vert) && map.isPassable(ax, by, horz) && map.isPassable(bx, by, 10 - horz))
                || (map.isPassable(ax, ay, horz) && map.isPassable(bx, ay, 10 - horz) && map.isPassable(bx, ay, vert) && map.isPassable(bx, by, 10 - vert));
        }
        const d = horz || vert;
        return !d || (map.isPassable(ax, ay, d) && map.isPassable(bx, by, 10 - d));
    }

    /** The same question asked with three level lines, at bumper, rail and head height: for a world with no solids to list. */
    function raysAhead(R, map, ox, oz, gx, gz, far, lo, hi) {
        if (!R.worldRay) return false;
        for (let i = 0; i < 3; i++) {
            const y = i === 0 ? lo : i === 1 ? lo + 0.61 : hi;
            if (R.worldRay(map, ox, y, oz, gx, 0, gz, far) < far - 1e-6 && R.lineMet === "piece") return true;
        }
        return false;
    }

    /**
     * Whether anything built stands in a body's way: along the level line from (ox, oz) in the unit direction
     * (gx, gz) for `far` tiles, between the heights `lo` and `hi`. Each solid on the cells the line crosses is met
     * at its own height within that range, so a rail a hand's width thick stops a body as a wall does, and a
     * plank underfoot or a beam overhead does not. A shut door is solid; an open one is not. With `leaving`, a
     * solid the line begins inside is not met: a circle that already stands in something may always leave it.
     */
    function solidAhead(R, map, ox, oz, gx, gz, far, lo, hi, leaving) {
        if (!R.lineIndex || !R.lineCell || !R.lineEnters) return raysAhead(R, map, ox, oz, gx, gz, far, lo, hi);
        const from = leaving ? 1e-6 : 0;
        const index = R.lineIndex(map), cells = index.cells, width = map.width, height = map.height;
        let x = Math.floor(ox), z = Math.floor(oz), t0 = 0;
        const stepX = gx > 0 ? 1 : -1, stepZ = gz > 0 ? 1 : -1;
        const deltaX = gx !== 0 ? (gx > 0 ? 1 / gx : -1 / gx) : Infinity, deltaZ = gz !== 0 ? (gz > 0 ? 1 / gz : -1 / gz) : Infinity;
        let nextX = gx > 0 ? (x + 1 - ox) / gx : gx < 0 ? (x - ox) / gx : Infinity;
        let nextZ = gz > 0 ? (z + 1 - oz) / gz : gz < 0 ? (z - oz) / gz : Infinity;
        for (let guard = 0; guard < 8; guard++) {
            if (x < 0 || z < 0 || x >= width || z >= height) return false;
            const near = nextX < nextZ ? nextX : nextZ, t1 = near < far ? near : far;
            const kept = cells.get(z * 65536 + x), list = kept !== undefined ? kept : R.lineCell(index, map, x, z);
            if (list) {
                for (let i = 0; i < list.length; i++) {
                    const solid = list[i];
                    if (solid.door && !(R.doorShut && R.doorShut(solid.door))) continue;
                    // The solid's own height in the world: its frame's origin and the rise of each of its three edges.
                    const un = solid.ux * solid.ux + solid.uy * solid.uy + solid.uz * solid.uz;
                    const yn = solid.yx * solid.yx + solid.yy * solid.yy + solid.yz * solid.yz;
                    const vn = solid.vx * solid.vx + solid.vy * solid.vy + solid.vz * solid.vz;
                    const uy = solid.uy / un, yy = solid.yy / yn, vy = solid.vy / vn;
                    const bottom = solid.oy + (uy < 0 ? uy : 0) + (yy < 0 ? yy : 0) + (vy < 0 ? vy : 0);
                    const top = solid.oy + (uy > 0 ? uy : 0) + (yy > 0 ? yy : 0) + (vy > 0 ? vy : 0);
                    // A solid this file cannot read is asked the old way, with level lines.
                    if (!(bottom <= top)) return raysAhead(R, map, ox, oz, gx, gz, far, lo, hi);
                    const a = bottom > lo ? bottom : lo, b = top < hi ? top : hi;
                    if (a > b) continue;
                    if (R.lineEnters(solid, ox, (a + b) / 2, oz, gx, 0, gz, t0, t1) >= from) return true;
                    // Anything but an upright box changes with height: met at both ends of its part in the body's range too.
                    if ((solid.code || uy !== 0 || vy !== 0) && b - a > 0.004
                        && (R.lineEnters(solid, ox, a + 0.002, oz, gx, 0, gz, t0, t1) >= from || R.lineEnters(solid, ox, b - 0.002, oz, gx, 0, gz, t0, t1) >= from)) return true;
                }
            }
            if (t1 >= far) return false;
            t0 = t1;
            if (nextX < nextZ) { x += stepX; nextX += deltaX; } else { z += stepZ; nextZ += deltaZ; }
        }
        return false;
    }

    /**
     * Whether a circle now at (nx, nz), come from (px, pz), newly overlaps a tile an event's body holds: that tile
     * into `hitX`, `hitY`. A tile found free is remembered for half a second: the circles that follow the leading
     * one over the same tile do not ask again.
     */
    function bodyMet(R, player, nx, nz, px, pz) {
        const r = SHAPE.radius, x0 = Math.floor(nx - r), x1 = Math.floor(nx + r), z0 = Math.floor(nz - r), z1 = Math.floor(nz + r);
        for (let z = z0; z <= z1; z++) {
            for (let x = x0; x <= x1; x++) {
                if (!reaches(nx, nz, r, x, z) || reaches(px, pz, r, x, z)) continue;
                const tile = z * 65536 + x;
                let known = false;
                for (let i = 0; i < 8 && !known; i++) known = FREE_TILE[i] === tile && tickNo - FREE_AT[i] <= 30;
                if (known) continue;
                if (R.bodyBlocksTile(player, x, z)) { hitX = x; hitY = z; return true; }
                FREE_TILE[freeNext] = tile; FREE_AT[freeNext] = tickNo; freeNext = (freeNext + 1) & 7;
            }
        }
        return false;
    }

    /**
     * What a circle moved from (ax, az) to (bx, bz), standing at the height `base`, meets on the way: a code of
     * `REFUSALS`, or 0. Something built between its bumper and its rider's head, from where its middle is to its
     * rim where it would be (and it may always leave what it already stands in); a big bush on the tile its middle
     * comes onto; an event's body on a tile it newly overlaps.
     */
    function meets(R, map, player, ax, az, bx, bz, base) {
        const dx = bx - ax, dz = bz - az, reach = Math.sqrt(dx * dx + dz * dz);
        if (reach > 1e-9 && solidAhead(R, map, ax, az, dx / reach, dz / reach, reach + SHAPE.radius, base + 0.6, base + SHAPE.height - 0.2, true)) return 7;
        if (S_bush) {
            const x = Math.floor(bx), z = Math.floor(bz);
            if ((x !== Math.floor(ax) || z !== Math.floor(az)) && R.bushBlocksCell(map, x, z)) return 6;
        }
        if (R.bodyBlocksTile && bodyMet(R, player, bx, bz, ax, az)) return 9;
        return 0;
    }

    /**
     * Whether the vehicle, its middle at world (cx, cz), may turn from the heading `y1` to `y2`: each axle's
     * circle, swung to where it would be, stays on the map, comes over no ground more than a step above what it
     * stands on, and meets nothing built, no big bush and no event's body on the way. The two axle reads of a turn
     * that passes are left in `swingF` and `swingR`. A drop is no reason: a wheel swung over one hangs.
     */
    /**
     * Whether a circle of the vehicle is past the map's border. A side whose neighboring map stands built past
     * it (Reactor3D.Neighbors) is open: the vehicle rides over that border, a vehicle's length and no more, and
     * goes on in the map past it as its middle crosses.
     */
    function pastBorder(R, x, z, r, w, h) {
        // (Its own length, so that its middle reaches the border however long it is: a tank's nose is ten tiles ahead of it.)
        const N = R.Neighbors, out = Math.max(BORDER_OVER, SHAPE.front + SHAPE.rear + SHAPE.radius);
        // `pastSide` keeps the direction of the border that refused, for the ride to leave by that one only.
        if (x < r && !(N && x > -out && N.stands("west"))) { pastSide = 4; return true; }
        if (z < r && !(N && z > -out && N.stands("north"))) { pastSide = 8; return true; }
        if (x > w - r && !(N && x < w + out && N.stands("east"))) { pastSide = 6; return true; }
        if (z > h - r && !(N && z < h + out && N.stands("south"))) { pastSide = 2; return true; }
        return false;
    }
    let pastSide = 0;
    /** How far past an open border a circle of the vehicle may be, in tiles, at the least (a vehicle longer than this, its own length). */
    const BORDER_OVER = 4;

    function swing(R, map, player, d, cx, cz, y1, y2) {
        const h2x = Math.sin(y2), h2z = -Math.cos(y2), r = SHAPE.radius, w = map.width, h = map.height;
        const fx = cx + h2x * SHAPE.front, fz = cz + h2z * SHAPE.front, bx = cx - h2x * SHAPE.rear, bz = cz - h2z * SHAPE.rear;
        if (pastBorder(R, fx, fz, r, w, h) || pastBorder(R, bx, bz, r, w, h)) return false;
        const air = d.air > 0, from = air && d.vz < S_grav ? d.alt + d.vz - S_grav : d.alt;
        const baseF = air && from > d.gf ? from : d.gf, baseR = air && from > d.gr ? from : d.gr;
        swingF = R.groundHeightAt(map, fx, fz, air ? d.alt : d.gf);
        swingR = R.groundHeightAt(map, bx, bz, air ? d.alt : d.gr);
        if (S_debug) return true;
        if (swingF - baseF > S_step || swingR - baseR > S_step) return false;
        const h1x = Math.sin(y1), h1z = -Math.cos(y1);
        return !meets(R, map, player, cx + h1x * SHAPE.front, cz + h1z * SHAPE.front, fx, fz, baseF)
            && !meets(R, map, player, cx - h1x * SHAPE.rear, cz - h1z * SHAPE.rear, bx, bz, baseR);
    }

    /**
     * Why the vehicle may not have its middle at world (sx, sz), having come along the unit direction (gx, gz)
     * from (mx, mz), heading (hx, hz) and going `dir` (1 forward, -1 backing up): a code of `REFUSALS`, or 0.
     * The reads of a place that passes are left in `passLead`, `passTrail` and `passMid`.
     */
    function refuse(R, map, player, d, sx, sz, gx, gz, hx, hz, dir, mx, mz) {
        const air = d.air > 0, r = SHAPE.radius, step = S_step;
        const lead = dir > 0 ? SHAPE.front : SHAPE.rear, trail = dir > 0 ? SHAPE.rear : SHAPE.front;
        const lx = hx * dir, lz = hz * dir;
        const cx = sx + lx * lead, cz = sz + lz * lead, tx = sx - lx * trail, tz = sz - lz * trail;
        const w = map.width, h = map.height;
        if (pastBorder(R, cx, cz, r, w, h) || pastBorder(R, tx, tz, r, w, h)) return 1;
        const alt = d.alt, under = dir > 0 ? d.gf : d.gr, behind = dir > 0 ? d.gr : d.gf;
        // On the ground a circle is judged from the ground it stands on; in the air from the vehicle's height, or
        // from the ground it is over where that is higher (a nose-down flight off a bank keeps its tail over the
        // bank). Coming down, its height is the one it has when this tick's fall is done: what it comes over is
        // then within a step of it, ground it lands on, and never something it sinks into.
        const from = air && d.vz < S_grav ? alt + d.vz - S_grav : alt;
        const base = air && from > under ? from : under, was = air && from > behind ? from : behind;
        // Each circle's middle, and the vehicle's own: not over ground it did not roll onto. The vehicle's middle
        // is judged from its own height; and on the ground it does not come over a hump more than a step above
        // both its wheels' ground, which no wheel rolled up.
        const gc = R.groundHeightAt(map, cx, cz, air ? alt : base), gt = R.groundHeightAt(map, tx, tz, air ? alt : was);
        const gm = R.groundHeightAt(map, sx, sz, alt);
        passLead = gc; passTrail = gt; passMid = gm;
        if (S_debug) return 0;
        if (gc - base > step) return 2;
        if (gt - was > step) return 5;
        if (gm - from > step || (!air && gm - (gc > gt ? gc : gt) > step)) return 5;
        // The leading circle's rim: ahead, and 35 degrees to each side. The ground under each point, and what is
        // built, as drawn, between where the circle's middle is now and that point, from the bumper to the rider's
        // head: so a circle sliding along a rail a hand's width thick keeps its own radius off it.
        const ox = mx + lx * lead, oz = mz + lz * lead, low = base + 0.6, high = base + SHAPE.height - 0.2;
        let most = base, built = false;
        for (let i = 0; i < 3; i++) {
            const c = i === 0 ? 1 : RIM_COS, s = i === 0 ? 0 : i === 1 ? RIM_SIN : -RIM_SIN;
            const px = cx + (gx * c - gz * s) * r, pz = cz + (gz * c + gx * s) * r;
            if ((px < 0 || pz < 0 || px >= w || pz >= h) && pastBorder(R, px, pz, 0, w, h)) return 1;
            const g = R.groundHeightAt(map, px, pz, base);
            if (g - base > step) return 2;
            if (g > most) most = g;
            if (!built) {
                const dx = px - ox, dz = pz - oz, reach = Math.sqrt(dx * dx + dz * dz);
                built = reach > 1e-9 && solidAhead(R, map, ox, oz, dx / reach, dz / reach, reach + 0.02, low, high);
            }
        }
        // Ground too steep to walk is a wall at its foot: along each of the map's two axes it is going, the ground a
        // tile on is over a step up and the circle's edge that way already climbs. Asked along the axes, as a
        // walker's step is, so a bank no walker steps up is not climbed at a slant either; and only where the
        // ground rises at the rim at all.
        if (!air && most - base > 0.2 * step) {
            if (gx > 0.05 || gx < -0.05) {
                const sx = gx > 0 ? 1 : -1, ax = cx + sx;
                if (ax >= 0 && ax < w && R.groundHeightAt(map, cx + sx * r, cz, base) - base > 0.45 * step && R.groundHeightAt(map, ax, cz, base) - base > step) return 4;
            }
            if (gz > 0.05 || gz < -0.05) {
                const sz = gz > 0 ? 1 : -1, az = cz + sz;
                if (az >= 0 && az < h && R.groundHeightAt(map, cx, cz + sz * r, base) - base > 0.45 * step && R.groundHeightAt(map, cx, az, base) - base > step) return 4;
            }
        }
        // The leading circle's middle changing tile: a big bush, and the tiles' own flags.
        const fx0 = Math.floor(ox), fz0 = Math.floor(oz), fx1 = Math.floor(cx), fz1 = Math.floor(cz);
        if (fx1 !== fx0 || fz1 !== fz0) {
            if (S_bush && R.bushBlocksCell(map, fx1, fz1)) return 6;
            if (!air && !tilesPass(fx0, fz0, fx1, fz1)) return 8;
        }
        if (built) return 7;
        // An event's body on a tile the leading circle newly overlaps.
        if (R.bodyBlocksTile && bodyMet(R, player, cx, cz, ox, oz)) return 9;
        // The circle behind it and the one at the vehicle's middle, each along its own travel: what is built, a
        // big bush, an event's body. A vehicle steered round a post or a person does not take them through its side.
        const met = meets(R, map, player, mx - lx * trail, mz - lz * trail, tx, tz, was);
        return met || meets(R, map, player, mx, mz, sx, sz, alt);
    }

    /**
     * The reads of a place (front axle, middle, rear axle) taken as the vehicle's ground after it moved `dist`
     * tiles: where it rests there is followed, or it is in the air.
     */
    function follow(d, gF, gM, gR, dist) {
        // A read more than a step over what stood there is no ground it rolled onto: that axle, or the middle, keeps its own.
        if (gF - d.gf > S_step) gF = d.gf;
        if (gR - d.gr > S_step) gR = d.gr;
        if (gM - (d.gm > d.alt ? d.gm : d.alt) > S_step) gM = d.gm;
        d.gm = gM;
        rest(gF, gM, gR);
        // Downward it is followed while it falls no faster than a tile and a half a tile; half a step is rolled
        // down at any speed, so a curb crossed at a crawl or swung over is no flight.
        const give = 1.5 * dist + 0.02, least = S_step / 2;
        if (restAlt >= d.alt || d.alt - restAlt <= (give > least ? give : least)) { d.alt = restAlt; d.gf = restF; d.gr = restR; return; }
        // The ground falls away faster than a wheel follows it. A crest carries no more than the jump's upward speed.
        d.air = 1;
        d.vz = lastRise > S_jump ? S_jump : lastRise > 0 ? lastRise : 0;
        d.peak = d.alt;
    }

    /** Whether any event but `except` has its own tile at (x, y). */
    function tileTaken(x, y, except) {
        const map = root.$gameMap, events = map ? map._events : null;
        if (!events) return false;
        for (let i = 0; i < events.length; i++) { const event = events[i]; if (event && event !== except && event._x === x && event._y === y && !event._erased) return true; }
        return false;
    }

    /** The middle came onto another tile, on the ground: the party's walk, the tile's touch triggers, the encounter count. True when an event started. */
    function enter(player, d, type, event) {
        const map = root.$gameMap;
        if (!tileTaken(player._x, player._y, event)) { clearX = player._realX; clearY = player._realY; clearYaw = d.yaw; clearAlt = d.alt; }
        if (!map || map.isEventRunning()) return false;
        if (typeof root.$gameParty !== "undefined" && root.$gameParty) root.$gameParty.onPlayerWalk();
        player.checkEventTriggerHere(HERE);
        if (map.setupStartingEvent()) return true;
        const encounters = type.encounters;
        if (encounters && encounters !== "none") {
            const before = player._encounterCount;
            player.updateEncounterCount();
            if (encounters === "half") player._encounterCount = before - (before - player._encounterCount) / 2;
        }
        return false;
    }

    /** A dead stop from speed: the thud, the kick, the event. */
    function bump(event, speed) {
        const F = feel();
        if (F && typeof F.sound === "function") F.sound("bump");
        if (speed >= Drive.KICK_FROM && F && typeof F.kick === "function") F.kick(0.06, true);
        const hints = ReactorVehicles.Hints;
        if (hints && typeof hints.note === "function") hints.note("squareHit");
        emit("vehicleBump", event, "speed", speed);
    }

    /** The wheels met the ground after a flight of `fall` tiles down from its highest point. */
    function land(event, fall) {
        if (fall >= 0.3) {
            const F = feel();
            if (F && typeof F.sound === "function") F.sound("land");
            if (fall > 1 && F && typeof F.kick === "function") F.kick(0.08);
        }
        emit("vehicleLand", event, "fall", fall);
    }

    /**
     * The screen dips to black over `ticks` and the vehicle is put back on a remembered place when it has. `stuck`:
     * it could not move. Stuck again within a minute of the last time, the place it was put back on was no better:
     * the second time it goes to the place before, from the third to where it was boarded.
     */
    function sendBack(d, ticks, stuck) {
        const screen = typeof root.$gameScreen !== "undefined" ? root.$gameScreen : null;
        d.v = 0; d.vz = 0; d.steer = 0; d.rest = 0;
        d.back = ticks;
        backFrom = 0;
        if (stuck) {
            d.resc = d.calm < Drive.CALM_AFTER ? d.resc + 1 : 1;
            d.calm = 0;
            backFrom = d.resc > 2 ? 8 : d.resc > 1 ? 4 : 0;
        }
        // An event that has already darkened the screen keeps it: the vehicle is only put back.
        d.fade = screen && typeof screen.brightness === "function" && screen.brightness() >= 255 ? ticks : 0;
        if (d.fade > 0) screen.startFadeOut(ticks);
    }

    /**
     * The vehicle on a remembered place, at a standstill, facing as it faced there. A place within a tile and a
     * half of where it is now is one it could not leave: the place before it is taken, then the place it was
     * boarded, and the places skipped are forgotten.
     */
    function putBack(player, d) {
        const screen = typeof root.$gameScreen !== "undefined" ? root.$gameScreen : null, dry = d.dry;
        let from = backFrom;
        backFrom = 0;
        while (from < 8) {
            const dx = dry[from] - player._realX, dy = dry[from + 1] - player._realY;
            if (dx * dx + dy * dy >= 2.25) break;
            from += 4;
        }
        for (let i = 0; i < from; i++) dry[i] = dry[from + (i & 3)];
        d.yaw = turnOf(dry[2]);
        d.v = 0; d.steer = 0; d.turn = 0; d.go = 0; d.rate = 0; d.squat = 0; d.roll = 0;
        player._realX = dry[0]; player._realY = dry[1];
        player._x = Math.round(dry[0]); player._y = Math.round(dry[1]);
        seatAt(d, dry[0], dry[1], dry[3]);
        d.pitch = d.tilt = Math.atan2(d.gf - d.gr, SHAPE.front + SHAPE.rear);
        if (d.fade > 0 && screen) screen.startFadeIn(d.fade);
        d.fade = 0;
        stuckF = stuckR = dryWait = 0;
    }

    /**
     * The place the vehicle is on, remembered as the last it could stand on and leave: three tiles or more from
     * the one before, both wheels on the ground and no more than a step apart, on a tile a walker can stand on
     * (so out of water deeper than a wade, out of a bush, off a rail). The one before it is kept.
     */
    function noteDry(map, P, d, wx, wz) {
        const dry = d.dry, x = wx - 0.5, y = wz - 0.5, dx = x - dry[0], dy = y - dry[1], gap = d.gf - d.gr;
        if (dx * dx + dy * dy < 9 || restLift > 0 || gap > S_step || gap < -S_step) return;
        // Asked a third as often as a place is tried while the answer is no.
        if (P && P.standingAt && P.standingAt(map, Math.floor(wx), Math.floor(wz), d.alt, WITHIN) === null) { dryWait = Drive.DRY_EVERY - 10; return; }
        dryWait = 0;
        dry[4] = dry[0]; dry[5] = dry[1]; dry[6] = dry[2]; dry[7] = dry[3];
        dry[0] = x; dry[1] = y; dry[2] = d.yaw; dry[3] = d.alt;
    }

    /** What is drawn, on the player and on the carried event. */
    function write(player, event, d) {
        const yaw = d.yaw, d4 = DIR4[Math.round(yaw / (Math.PI / 2)) & 3], d8 = DIR8[Math.round(yaw / (Math.PI / 4)) & 7];
        if (player._direction !== d4) player._direction = d4;
        if (player._reactorDir8 !== d8) player._reactorDir8 = d8;
        const air = d.air > 0, ground = air ? (d.gf + d.gr) / 2 : d.alt;
        player._reactorGround = ground < d.alt ? ground : d.alt;
        player._reactorAlt = d.alt;
        player._reactorAir = d.alt - player._reactorGround;
        player._reactorVz = air ? d.vz : 0;
        player._reactorRiding = true;
        const x = player._realX, y = player._realY;
        const changed = x !== wX || y !== wY || d.alt !== wAlt || yaw !== wYaw || d.pitch !== wPitch || d.roll !== wRoll || d.steer !== wSteer
            || d.travel !== wTravel || d.foot !== wFoot;
        if (changed) { wX = x; wY = y; wAlt = d.alt; wYaw = yaw; wPitch = d.pitch; wRoll = d.roll; wSteer = d.steer; wTravel = d.travel; wFoot = d.foot; }
        seenX = x; seenY = y;
        // Only the carried event copies the player: one parked for a transfer stays where it was put.
        if (event._rrFree !== 2 && event._rrFree !== undefined) return;
        event._realX = x; event._realY = y; event._x = player._x; event._y = player._y;
        if (event._direction !== d4) event._direction = d4;
        if (event._reactorDir8 !== d8) event._reactorDir8 = d8;
        event._reactorGround = player._reactorGround; event._reactorAlt = d.alt; event._reactorAir = player._reactorAir;
        event._reactorVz = player._reactorVz; event._reactorRiding = true;
        // A page change gives an event its page's Through back: the carried one never stands in its rider's way.
        event._through = true;
        event._rrYaw = yaw; event._rrPitch = d.pitch; event._rrLean = d.roll; event._rrSteer = d.steer; event._rrTravel = d.travel; event._rrSpeed = d.v;
        if (changed || !finite(event._rrPose)) event._rrPose = ((event._rrPose | 0) + 1) % 1000000000;
        player._rrPose = event._rrPose;
        // The followers that ride vehicles of their own come along its trail.
        const convoy = ReactorVehicles.Convoy;
        if (convoy && typeof convoy.follow === "function") convoy.follow(player, event, d.v);
    }

    /** The stand-side foot: down under a walk's crawl on the ground, up again above it and in the air. */
    function foot(d, type) {
        const speed = d.v < 0 ? -d.v : d.v;
        const down = type.leans !== false && !d.air && speed < (d.foot > 0 ? 1.5 : 1) ? 1 : 0;
        if (d.foot !== down) d.foot = down > d.foot ? (d.foot + 0.1 > 1 ? 1 : d.foot + 0.1) : (d.foot - 0.1 < 0 ? 0 : d.foot - 0.1);
        // Standing with nothing held, what `step` eases has arrived: nothing drawn changes from here on.
        if (d.v === 0 && d.turn === 0 && !d.air) {
            if (d.roll > -0.0002 && d.roll < 0.0002) d.roll = 0;
            if (d.squat === 0) { const gap = ENV.pitch - d.tilt; if (gap > -0.0002 && gap < 0.0002) { d.tilt = ENV.pitch; d.pitch = d.tilt; } }
        }
    }

    /** The ride ends in the water (ReactorVehicles.sink): true when it did. Only a vehicle of the ground sinks. */
    function drown(type, bed) {
        if ((type && type.medium && type.medium !== "ground") || typeof ReactorVehicles.sink !== "function" || !ReactorVehicles.sink(bed)) return false;
        stuckF = stuckR = 0;
        return true;
    }

    /** A flight: gravity, then the wheels meeting the ground, or the water. */
    function fly(R, map, P, player, d, type, event, wx, wz) {
        d.vz -= P && P.gravityPerFrame ? P.gravityPerFrame() : 0.0045;
        // Rising under something built: the rider's head stops at its underside.
        if (d.vz > 0 && P && P.ceilingAbove) {
            const roof = P.ceilingAbove(map, Math.floor(wx), Math.floor(wz), d.alt);
            if (d.alt + d.vz + SHAPE.height > roof) d.vz = 0;
        }
        d.alt += d.vz;
        if (d.alt > d.peak) d.peak = d.alt;
        const hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw);
        let gF = R.groundHeightAt(map, wx + hx * SHAPE.front, wz + hz * SHAPE.front, d.alt);
        let gR = R.groundHeightAt(map, wx - hx * SHAPE.rear, wz - hz * SHAPE.rear, d.alt);
        let gM = midNew ? midRead : R.groundHeightAt(map, wx, wz, d.alt);
        // A read more than a step over both the vehicle and the ground that axle was over is no ground to land on
        // (a ledge it flies under, a wall beside it): the axle keeps what it had. The middle's likewise.
        if (gF - (d.alt > d.gf ? d.alt : d.gf) > S_step) gF = d.gf;
        if (gR - (d.alt > d.gr ? d.alt : d.gr) > S_step) gR = d.gr;
        if (gM - (d.alt > d.gm ? d.alt : d.gm) > S_step) gM = d.gm;
        // Where it would rest here: on both wheels, or on the ground under its middle with a wheel over a drop.
        rest(gF, gM, gR);
        d.gf = restF; d.gr = restR; d.gm = gM;
        // Where it comes down in water deeper than its wade it splashes and sinks, its rider left in the water.
        if (S_wet && d.vz <= 0) {
            const level = R.waterSurfaceAt(map, wx, wz), bed = restAlt > d.gm ? restAlt : d.gm;
            if (level !== null && d.alt <= level && level - bed > S_wade && !d.flooded) {
                if (P && P.onSplash) P.onSplash(player, -d.vz);
                emit("vehicleSplash", event, "depth", level - bed);
                // (`sunk`: the tick that asked writes nothing more of a ride that is over.)
                if (drown(type, bed)) { sunk = true; return false; }
                sendBack(d, 20, false);
                return false;
            }
        }
        // It meets the ground: coming down onto it, or the ground coming up under a flight off a crest.
        if (d.alt > restAlt) return false;
        const fall = d.peak - restAlt;
        d.alt = restAlt; d.air = 0; d.vz = 0; d.peak = restAlt;
        land(event, fall > 0 ? fall : 0);
        return true;
    }

    /** What the tests of a tick read of the map, the player and the type, noted once a tick. */
    function prime(R, map, P, player, type) {
        const handling = type.handling || DEFAULT_TYPE.handling;
        S_wet = !!(R.hasWater && R.waterSurfaceAt && R.hasWater(map));
        S_bush = !!(R.bushBlocksCell && map.reactor3d && map.reactor3d.foliage);
        S_debug = false;
        const g = P && P.gravityPerFrame ? P.gravityPerFrame() : 0.0045, hop = handling.jump > 0 ? handling.jump : 0;
        S_grav = g;
        S_jump = hop > 0 ? (P && P.jumpSpeed ? P.jumpSpeed(hop, g) : Math.sqrt(2 * g * hop)) : 0;
    }

    /** One logic tick of the ride. Reads no key unless `sceneActive` and the player can move. */
    // A sprite uses a one-tile footprint. Water and flight use their travel
    // medium in either renderer; the ground mover below retains the 3D axles.
    function solidEventAt(map, event, x, y) {
        const events=map._events;
        for (let i=0;i<events.length;i++) {
            const other=events[i];
            if (other && other!==event && !other._erased && !other.isThrough() && other.isNormalPriority() && other.pos(x,y)) return true;
        }
        // A parked boat or ship is in the way as it is for a walker.
        return (typeof map.boat === "function" && map.boat().posNt(x,y)) || (typeof map.ship === "function" && map.ship().posNt(x,y));
    }

    function mediumAllows(type, x, y) {
        return ReactorVehicles.surfacePassable(type,x,y);
    }

    function surfaceHeight(R, data, type, x, y, near, deep) {
        if (!deep) return 0;
        const ground = R.groundHeightAt ? R.groundHeightAt(data,x+0.5,y+0.5,near) : 0;
        const surface = type.medium === "water" && R.waterSurfaceAt ? R.waterSurfaceAt(data,x+0.5,y+0.5) : null;
        return type.medium === "air" ? ground + type.flight.height : surface !== null && surface !== false ? surface : ground;
    }

    function surfaceTick(player, event, d, type, R, data, V, sceneActive, deep) {
        const map = root.$gameMap, last=Drive.last, F=feel();
        if (d.leave === "transfer") { d.v=0; return; }
        if (d.grid) {
            if (player._moveRouteForcing || player._jumpCount > 0 || player._realX !== player._x || player._realY !== player._y) {
                d.yaw=Drive.yawOf(player._reactorDir8 || player._direction); d.v=0;
                d.alt=d.gf=d.gr=d.gm=surfaceHeight(R,data,type,player._realX,player._realY,d.alt,deep);
                write(player,event,d); return;
            }
            d.grid=0; Drive.seat(player);
        }
        USED.gas=USED.brake=USED.steer=0; USED.jump=false; USED.analog=false;
        const controls=!!sceneActive && player.canMove();
        if (controls) {
            Drive.input(IN);
            if (d.leave && IN.gas > 0 && !wasGas) d.leave="";
            wasGas=IN.gas>0;
            if (!d.leave) { USED.gas=IN.gas; USED.brake=IN.brake; USED.steer=IN.steer; USED.analog=IN.analog; }
            last.controls=1;
        }
        if (!controls || d.leave) { USED.brake=1; d.rest=0; }
        ENV.air=false; ENV.water=false; ENV.flooded=false; ENV.slope=1; ENV.pitch=0; ENV.alone=false;
        V.step(d,USED,type,ENV,DT);
        d.yaw=turnOf(d.yaw+d.turn); last.turned=d.turn;
        let x=player._realX, y=player._realY;
        const parts=Math.max(1,Math.ceil(Math.abs(d.go)/0.2));
        const sx=Math.sin(d.yaw)*d.go/parts, sy=-Math.cos(d.yaw)*d.go/parts;
        const debug=controls && player.isDebugThrough && player.isDebugThrough();
        // Where the map does not loop, its middle stays on the map's own tiles.
        const maxX=map.isLoopHorizontal() ? Infinity : map.width()-1, maxY=map.isLoopVertical() ? Infinity : map.height()-1;
        for (let i=0;i<parts && d.go!==0;i++) {
            let nx=map.roundX(x+sx), ny=map.roundY(y+sy), met=false, held=false;
            if (maxX!==Infinity && (nx<0 || nx>maxX)) { nx=nx<0?0:maxX; held=true; }
            if (maxY!==Infinity && (ny<0 || ny>maxY)) { ny=ny<0?0:maxY; held=true; }
            const ox=map.roundX(Math.round(x)), oy=map.roundY(Math.round(y)), tx=map.roundX(Math.round(nx)),ty=map.roundY(Math.round(ny));
            let ok=mediumAllows(type,tx,ty);
            // Held at the map's edge it slides along it while that is at least half its way; met squarer, it stops.
            if (ok && held) { const mx=nx-x, my=ny-y; ok=mx*mx+my*my >= (sx*sx+sy*sy)*0.25; }
            if (ok && type.medium === "ground") {
                if (tx!==ox) { const direction=sx>0?6:4; ok=map.isPassable(ox,oy,direction) && map.isPassable(tx,oy,10-direction); }
                if (ok && ty!==oy) { const direction=sy>0?2:8; ok=map.isPassable(tx,oy,direction) && map.isPassable(tx,ty,10-direction); }
            }
            if (ok && type.medium !== "air") { met=solidEventAt(map,event,tx,ty); ok=!met; }
            if (ok && deep && type.medium === "water") {
                const hx=Math.sin(d.yaw), hy=-Math.cos(d.yaw);
                shapeFor(event,type);
                for (let axle=0;axle<3;axle++) {
                    const reach=axle===0?-SHAPE.rear:axle===2?SHAPE.front:0;
                    for (let side=0;side<2;side++) {
                        const offset=side===0?-SHAPE.radius:SHAPE.radius;
                        const bx=map.roundX(Math.floor(nx+0.5+hx*reach+hy*offset)), by=map.roundY(Math.floor(ny+0.5+hy*reach-hx*offset));
                        if (!mediumAllows(type,bx,by) || solidEventAt(map,event,bx,by)) ok=false;
                    }
                }
            }
            const alt=surfaceHeight(R,data,type,nx,ny,d.alt,deep);
            if (ok && deep && type.medium === "air" && R.groundHeightAt && d.air && alt-type.flight.height >= d.alt-0.02 && d.v !== 0) ok=false;
            if (!ok && !debug) {
                // Driven into somebody: their touch trigger, once per contact.
                if (met && (tx!==touchX || ty!==touchY)) { touchX=tx; touchY=ty; player.checkEventTriggerTouch(tx,ty); }
                last.stopped=1; last.refused=8; if (Math.abs(d.v)>=Drive.BUMP_FROM) bump(event,Math.abs(d.v)); d.v=0; d.go=0; break;
            }
            x=nx; y=ny; d.travel+=d.go/parts; last.moved+=Math.abs(d.go/parts);
            player._realX=x; player._realY=y; player._x=tx; player._y=ty;
            if ((tx!==ox || ty!==oy) && type.medium !== "air") {
                last.entered++; write(player,event,d);
                if (enter(player,d,type,event)) { d.v=0; break; }
            }
        }
        // A contact lasts until its middle is more than a tile from the tile it met.
        if (touchX>=0 && (Math.abs(x-touchX)>1 || Math.abs(y-touchY)>1)) touchX=touchY=-1;
        const surface=surfaceHeight(R,data,type,x,y,d.alt,deep);
        const ground=deep && R.groundHeightAt ? R.groundHeightAt(data,x+0.5,y+0.5,d.alt) : 0;
        if (type.medium === "air" && deep) {
            if (d.leave && Math.abs(d.v) < ReactorVehicles.SLOW && map.isAirshipLandOk(player._x,player._y)) d.alt=Math.max(ground,d.alt-0.12);
            else if (!d.leave) d.alt=surface;
            d.gf=d.gr=d.gm=ground; d.air=d.alt>ground+0.02?1:0;
        } else { d.alt=d.gf=d.gr=d.gm=surface; d.air=0; }
        d.vz=0; d.pitch=0; d.tilt=0; d.roll=0; foot(d,type); write(player,event,d);
        if (F && typeof F.advance === "function") F.advance(d,type,USED);
    }

    Drive.tick = function tick(sceneActive) {
        const player = typeof root.$gamePlayer !== "undefined" ? root.$gamePlayer : null;
        if (!player || !player._rrFree || player._vehicleType !== "reactor") return;
        const mount = player._rrMount, F = feel();
        const R = world(), map = typeof root.$dataMap !== "undefined" ? root.$dataMap : null, V = R ? R.Vehicles : null;
        if ((mount && !mount.drawn) || !R || !map || !V || typeof V.step !== "function") {
            if (F && typeof F.advance === "function") F.advance(player._rrDrive || null,null,null);
            return;
        }
        const event = riddenBy(player);
        if (!event) return;
        const d = stateOf(player, event), type = typeFor(event), P = physics(), last = Drive.last;
        tickNo++;
        last.entered = 0; last.slid = 0; last.stopped = 0; last.refused = 0; last.moved = 0; last.turned = 0; last.controls = 0; last.air = d.air;
        const deep = R.isMap3D && R.isMap3D(map);
        if (!deep && ReactorVehicles.scenery && ReactorVehicles.scenery(event)) { standDown(player); return; }
        if (!deep || type.medium !== "ground") { surfaceTick(player,event,d,type,R,map,V,sceneActive,deep); return; }
        if (!R.groundHeightAt) return;
        // Parked for a transfer: it stands until the on-foot list has run.
        if (d.leave === "transfer") { d.v = 0; if (F && typeof F.advance === "function") F.advance(d, type, null); return; }
        // Somebody else put the player somewhere (a script's `locate`): the ride goes on from there, at a standstill.
        if (seenX === seenX && !d.grid && (player._realX !== seenX || player._realY !== seenY)) Drive.seat(player);
        prime(R, map, P, player, type);
        midNew = false;
        const altWas = d.alt;
        let wx = player._realX + 0.5, wz = player._realY + 0.5;

        // A jump of RPG Maker's own (a script's): the grid has the player until it is down.
        if (player._jumpCount > 0 && !d.grid) { d.grid = 1; d.v = 0; d.steer = 0; }
        if (d.grid) {
            if (!player._moveRouteForcing && !(player._jumpCount > 0) && player._realX === player._x && player._realY === player._y) {
                // The route is over: the mover takes over from where it stands.
                d.grid = 0;
                d.yaw = Drive.yawOf(player._reactorDir8 || player._direction);
                Drive.seat(player);
            } else {
                // Tile steps: the place is the stock glide's, the heading the facing's, the ground what the axles are over.
                const went = Math.abs(player._realX - seenX) + Math.abs(player._realY - seenY);
                d.yaw = Drive.yawOf(player._reactorDir8 || player._direction);
                d.v = 0; d.steer = 0; d.roll = 0; d.squat = 0; d.slide = 0;
                if (went === went && went > 0) {
                    const hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw);
                    let gF = R.groundHeightAt(map, wx + hx * SHAPE.front, wz + hz * SHAPE.front, d.alt);
                    let gR = R.groundHeightAt(map, wx - hx * SHAPE.rear, wz - hz * SHAPE.rear, d.alt);
                    const mid = R.groundHeightAt(map, wx, wz, d.alt);
                    if (gF - mid > S_step) gF = mid;
                    if (gR - mid > S_step) gR = mid;
                    rest(gF, mid, gR);
                    d.gf = restF; d.gr = restR; d.gm = mid; d.alt = restAlt; d.air = 0; d.vz = 0;
                    d.travel += went;
                }
                d.pitch = d.tilt = Math.atan2(d.gf - d.gr, SHAPE.front + SHAPE.rear);
                foot(d, type);
                write(player, event, d);
                if (F && typeof F.advance === "function") F.advance(d, type, null);
                return;
            }
        }

        // Being put back on the last dry place: the fade, then the place.
        if (d.back > 0) {
            if (d.air && S_wet) {
                // Come down in the water: it sinks to its axles while the screen fades.
                const level = R.waterSurfaceAt(map, wx, wz);
                if (level !== null) d.alt += (level - 0.5 - d.alt) * 0.2;
            }
            d.back--;
            if (d.back <= 0) { d.back = 0; putBack(player, d); }
            foot(d, type);
            write(player, event, d);
            if (F && typeof F.advance === "function") F.advance(d, type, null);
            return;
        }

        // The view turned first person: no ride there yet. It brakes and the party gets off.
        if (!d.leave && cameraMode() === "firstPerson") {
            if (typeof ReactorVehicles.getOff === "function") ReactorVehicles.getOff(); else d.leave = "ok";
        }

        // Input. With the controls off (an event, a message, a scene that is not active) the vehicle brakes.
        const controls = !!sceneActive && player.canMove();
        // The walk-through key of a playtest, read with the other keys.
        S_debug = controls && typeof player.isDebugThrough === "function" && player.isDebugThrough();
        USED.gas = 0; USED.brake = 0; USED.steer = 0; USED.jump = false; USED.analog = false;
        if (controls) {
            Drive.input(IN);
            // A press kept for getting off is let go by a new press of the throttle, or Jump.
            if (d.leave && d.leave !== "transfer" && ((IN.gas > 0 && !wasGas) || IN.jump)) d.leave = "";
            wasGas = IN.gas > 0;
            if (!d.leave) { USED.gas = IN.gas; USED.brake = IN.brake; USED.steer = IN.steer; USED.jump = IN.jump; USED.analog = IN.analog; }
            last.controls = 1;
        }
        if (!controls || d.leave) { USED.brake = d.v > 0 ? 1 : 0; d.rest = 0; }
        const key = USED.gas > 0 || USED.brake > 0;

        // The ground it is on: a slope slows or speeds it, water up to its wade slows it.
        ENV.air = d.air > 0;
        ENV.water = false;
        ENV.flooded = false;
        ENV.slope = 1;
        if (!d.air) {
            ENV.pitch = Math.atan2(d.gf - d.gr, SHAPE.front + SHAPE.rear);
            const grade = (d.gf - d.gr) / (SHAPE.front + SHAPE.rear) * (d.v < 0 ? -1 : 1);
            ENV.slope = grade > 0 ? (grade >= S_step ? 0.75 : 1 - 0.25 * grade / S_step) : (grade <= -S_step ? 1.15 : 1 - 0.15 * grade / S_step);
            if (S_wet) {
                const level = R.waterSurfaceAt(map, wx, wz), depth = level !== null ? level - d.alt : 0;
                ENV.water = depth > 0.05;
                // Boarded where it sank, it is walked out: it runs again once the water is no deeper than it wades.
                if (d.flooded) { if (depth > S_wade) ENV.flooded = true; else d.flooded = false; }
                // Ridden in past its wade: the ride is over, where it stands.
                else if (depth > S_wade && !d.back) {
                    const speed = d.v < 0 ? -d.v / 60 : d.v / 60;
                    if (drown(type, d.alt)) {
                        if (P && P.onSplash) P.onSplash(player, speed);
                        emit("vehicleSplash", event, "depth", depth);
                        return;
                    }
                }
            }
        }

        V.step(d, USED, type, ENV, DT);

        // Jump: the map's own Jump key, on the ground.
        if (USED.jump && !d.air && S_jump > 0 && !ENV.flooded && (!P || !P.jumpAllowed || P.jumpAllowed())) {
            // Up a slope it leaves with the climb it already has, so the ground does not catch it at once.
            d.air = 1; d.vz = S_jump + (lastRise > S_jump ? S_jump : lastRise > 0 ? lastRise : 0); d.peak = d.alt; ENV.air = true;
        }

        // The turn, taken only where both axles' circles may swing to where it puts them.
        if (d.turn !== 0 && swing(R, map, player, d, wx, wz, d.yaw, d.yaw + d.turn)) {
            d.yaw = turnOf(d.yaw + d.turn);
            last.turned = 1;
            // The axles swung onto other ground. Walked round where it stands, each wheel rolls by the arc it travels.
            const swung = (d.turn < 0 ? -d.turn : d.turn) * SHAPE.front;
            if (d.go === 0) d.travel += swung;
            if (!d.air) follow(d, swingF, d.gm, swingR, swung);
        }

        // The travel: whole, then on the feelers; cut into steps no longer than STEP_MAX.
        const total = d.go < 0 ? -d.go : d.go, dir = d.go < 0 ? -1 : 1;
        const steps = total > Drive.STEP_MAX ? Math.ceil(total / Drive.STEP_MAX) : 1, ds = total / steps;
        let went = 0;
        for (let i = 0; i < steps && ds > 1e-9; i++) {
            const hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw), fx = hx * dir, fz = hz * dir;
            let nx = wx + fx * ds, nz = wz + fz * ds, len = ds, took = -1;
            let code = refuse(R, map, player, d, nx, nz, fx, fz, hx, hz, dir, wx, wz);
            if (code) {
                last.refused = code;
                // Driven square at the border of a side with a neighboring map: the ride goes on into that map.
                if (code === 1 && typeof player.leaveByBorder === "function") {
                    const out = (fx < 0 ? -fx : fx) > (fz < 0 ? -fz : fz) ? (fx > 0 ? 6 : 4) : (fz > 0 ? 2 : 8);
                    const square = (out === 6 || out === 4 ? (fx < 0 ? -fx : fx) : (fz < 0 ? -fz : fz)) > 0.5;
                    if (square && pastSide === out && player.leaveByBorder(out, Math.ceil(SHAPE.front + SHAPE.rear + SHAPE.radius))) break;
                }
                // Walked into an event's body: its touch trigger, once per contact.
                if (code === 9 && (hitX !== touchX || hitY !== touchY)) {
                    touchX = hitX; touchY = hitY;
                    player.checkEventTriggerTouch(hitX, hitY);
                    if (root.$gameMap && root.$gameMap.isAnyEventStarting()) { d.v = 0; break; }
                }
                // The feelers: the one that passed on the last tick first, then the smaller turn first. The steepest
                // pair turns a vehicle along a wall it stands nose against; at speed they are not begun, so a wall
                // met square is a hit and not a swerve.
                const fast = (d.v < 0 ? -d.v : d.v) >= Drive.BUMP_FROM;
                for (let k = -1; k < 10; k++) {
                    const j = k < 0 ? d.slide - 1 : k;
                    if (j < 0 || j > 9 || (k >= 0 && (j === d.slide - 1 || (fast && j >= 8)))) continue;
                    const c = FEEL_COS[j], s = FEEL_SIN[j], gx = fx * c - fz * s, gz = fz * c + fx * s, l = ds * c;
                    const sx = wx + gx * l, sz = wz + gz * l;
                    if (refuse(R, map, player, d, sx, sz, gx, gz, hx, hz, dir, wx, wz)) continue;
                    took = j; nx = sx; nz = sz; len = l;
                    break;
                }
                if (took < 0) {
                    // Nothing passes: it stops.
                    const speed = d.v < 0 ? -d.v : d.v;
                    d.v = 0; d.slide = 0;
                    last.stopped = 1;
                    if (speed >= Drive.BUMP_FROM) {
                        // It sits back a fifth of a tile, where a step back is not refused.
                        const bx = wx - fx * 0.2, bz = wz - fz * 0.2;
                        if (!refuse(R, map, player, d, bx, bz, -fx, -fz, hx, hz, -dir, wx, wz)) {
                            wx = bx; wz = bz;
                            midRead = passMid; midNew = true;
                            if (!d.air) follow(d, dir > 0 ? passTrail : passLead, passMid, dir > 0 ? passLead : passTrail, 0.2);
                        }
                        bump(event, speed);
                    }
                    if (key) { if (dir > 0) stuckF++; else stuckR++; }
                    break;
                }
                // It slides: the heading eases toward the way it slid, and it loses speed by the angle.
                last.slid = 1;
                d.v *= 1 - (0.3 + 1.5 * (FEEL_SIN[took] < 0 ? -FEEL_SIN[took] : FEEL_SIN[took])) * DT / steps;
                if (scrapeWait <= 0) { scrapeWait = 20; if (F && typeof F.sound === "function") F.sound("scrape"); }
            }
            d.slide = took + 1;
            let gF = dir > 0 ? passLead : passTrail, gR = dir > 0 ? passTrail : passLead;
            if (took >= 0) {
                // The heading eases toward the way it slid, where both circles may swing there.
                const turn = Drive.FEELERS[took] * DEG, y2 = d.yaw + (turn > SWING ? SWING : turn < -SWING ? -SWING : turn) / steps;
                if (swing(R, map, player, d, nx, nz, d.yaw, y2)) { d.yaw = turnOf(y2); gF = swingF; gR = swingR; }
            }
            wx = nx; wz = nz; went += len; d.travel += dir * len;
            midRead = passMid; midNew = true;
            stuckF = stuckR = 0;
            if (!d.air) follow(d, gF, passMid, gR, len);
            // The tile under the middle, every step: the grid, event triggers and plugins read a real tile.
            const tx = Math.round(wx - 0.5), ty = Math.round(wz - 0.5);
            // Its middle is over an open border: the ride goes on in the map past it, from this very place.
            if ((tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) && typeof player.leaveByBorder === "function") {
                player._realX = wx - 0.5; player._realY = wz - 0.5;
                // (Reserving the transfer parks the vehicle: what the ride was doing is kept for the other side.)
                d.crossV = d.v; d.crossYaw = d.yaw; d.crossSteer = d.steer;
                if (player.leaveByBorder(tx < 0 ? 4 : tx >= map.width ? 6 : ty < 0 ? 8 : 2, 0)) break;
            }
            if (tx !== player._x || ty !== player._y) {
                player._realX = wx - 0.5; player._realY = wz - 0.5;
                player._x = tx; player._y = ty;
                if (!d.air) {
                    last.entered++;
                    if (enter(player, d, type, event)) { d.v = 0; break; }
                }
            }
        }
        if (scrapeWait > 0) scrapeWait--;
        last.moved = went;
        // A contact with an event's body lasts until the whole vehicle is well clear of that tile: its length, in fifths.
        if (touchX >= 0) {
            const hx = Math.sin(d.yaw), hz = -Math.cos(d.yaw), far = SHAPE.radius + 0.35, length = SHAPE.front + SHAPE.rear;
            let clear = true;
            for (let i = 0; i < 5 && clear; i++) {
                const along = SHAPE.front - length * i / 4;
                if (reaches(wx + hx * along, wz + hz * along, far, touchX, touchY)) clear = false;
            }
            if (clear) touchX = touchY = -1;
        }

        // In the air: gravity, the landing, the water.
        if (d.air) {
            const landed = fly(R, map, P, player, d, type, event, wx, wz);
            if (sunk) { sunk = false; return; }
            if (landed) {
                player._realX = wx - 0.5; player._realY = wz - 0.5;
                player._x = Math.round(player._realX); player._y = Math.round(player._realY);
                last.entered++;
                if (enter(player, d, type, event)) d.v = 0;
            }
            lastRise = 0;
        } else lastRise = d.alt - altWas;

        // The last dry place it rode, noted now and then.
        if (++dryWait >= Drive.DRY_EVERY && !d.air && !d.back && (d.v > 1 || d.v < -1)) noteDry(map, P, d, wx, wz);
        if (d.calm < Drive.CALM_AFTER) d.calm++;
        // Refused both ways with a key held: the last resort.
        if (stuckF > 0 && stuckR > 0 && stuckF + stuckR >= Drive.RESCUE_AFTER && !d.back) { stuckF = stuckR = 0; sendBack(d, 6, true); }

        player._realX = wx - 0.5; player._realY = wz - 0.5;
        player._x = Math.round(player._realX); player._y = Math.round(player._realY);
        foot(d, type);
        write(player, event, d);
        if (F && typeof F.advance === "function") F.advance(d, type, USED);
    };

    //-------------------------------------------------------------------------
    // The same tests, asked from outside the ride (the end of the tick's path)

    /**
     * What would refuse a vehicle a step, for a tool, a validator or a test: its middle at world (x, z), `state`
     * shaped as the mover's ({ yaw, alt, gf, gr, air }, and `gm` where known), going `length` tiles along its heading (backward when
     * negative). Answers a name of `REFUSALS`, "" when it may go. `type` is a filled type record (the motorcycle's
     * numbers without one). The world is asked exactly as the tick asks it.
     */
    Drive.probe = function(state, x, z, length, type) {
        const R = world(), map = typeof root.$dataMap !== "undefined" ? root.$dataMap : null;
        const player = typeof root.$gamePlayer !== "undefined" ? root.$gamePlayer : null;
        if (!R || !map || !R.groundHeightAt || !state) return "";
        const kind = type || DEFAULT_TYPE, front = SHAPE.front, rear = SHAPE.rear, radius = SHAPE.radius, height = SHAPE.height, step = S_step, wade = S_wade;
        shapeFor(null, kind);
        prime(R, map, physics(), null, kind);
        const dir = length < 0 ? -1 : 1, len = length < 0 ? -length : length, hx = Math.sin(state.yaw), hz = -Math.cos(state.yaw);
        const code = refuse(R, map, player, state, x + hx * dir * len, z + hz * dir * len, hx * dir, hz * dir, hx, hz, dir, x, z);
        Drive.probe.lead = passLead; Drive.probe.trail = passTrail; Drive.probe.mid = passMid;
        SHAPE.front = front; SHAPE.rear = rear; SHAPE.radius = radius; SHAPE.height = height; S_step = step; S_wade = wade;
        return Drive.REFUSALS[code];
    };

    /**
     * Where a vehicle rests over three reads of the ground (under its front axle, its middle and its rear axle),
     * by the step of the type last ridden or probed: its height into `out.alt`, each axle's into `out.front` and
     * `out.rear`. A wheel more than a step under the line of the other two hangs.
     */
    Drive.resting = function(front, middle, rear, out) {
        const alt = restAlt, f = restF, r = restR, lift = restLift;
        rest(front, middle, rear);
        out = out || {};
        out.alt = restAlt; out.front = restF; out.rear = restR;
        restAlt = alt; restF = f; restR = r; restLift = lift;
        return out;
    };

    /** Whether anything built stands between the heights `lo` and `hi` on the level line from (ox, oz) along the unit direction (gx, gz) for `far` tiles. */
    Drive.solidAhead = function(mapData, ox, oz, gx, gz, far, lo, hi) {
        const R = world();
        return !!(R && mapData && solidAhead(R, mapData, ox, oz, gx, gz, far, lo, hi));
    };

    /** The shape the tests use for the ridden vehicle: { front, rear, radius, height } in tiles. Read it, do not keep it. */
    Drive.shape = function() { return SHAPE; };

    //-------------------------------------------------------------------------
    // Free movement: one flag

    /** Whether a character with `_rrFree` set is on a forced route's tile steps (only the riding player is). */
    function onGrid(character) {
        const d = character._rrDrive;
        return !!d && d.grid > 0;
    }

    /** A facing as the heading a vehicle on the grid is drawn at. */
    function faceYaw(character) {
        character._rrYaw = Drive.yawOf(character._reactorDir8 || character._direction);
    }

    /** A parked character is given back to the grid: the stock glide carries it to its tile and it faces as it faces. */
    function release(character) {
        if (character === root.$gamePlayer || character._rrBoarded) return;
        character._rrFree = 0;
        character._reactorRiding = false;
        if (character._rrVehicle) { faceYaw(character); Drive.leave(character); character._rrPitch = 0; }
    }

    /** The riding player takes the grid for a forced route's steps. */
    function takeGrid(player) {
        let d = player._rrDrive;
        if (!d || typeof d !== "object") d = player._rrDrive = {};
        complete(d);
        d.grid = 1; d.v = 0; d.steer = 0; d.rest = 0; d.leave = d.leave === "transfer" ? d.leave : "";
    }

    if (typeof root.Game_CharacterBase !== "undefined") {
        const proto = root.Game_CharacterBase.prototype;
        const _updateMove = proto.updateMove;
        proto.updateMove = function() {
            if (this._rrFree && !onGrid(this)) return;
            return _updateMove.apply(this, arguments);
        };
        const _isMoving = proto.isMoving;
        proto.isMoving = function() {
            if (this._rrFree && !onGrid(this)) return false;
            return _isMoving.apply(this, arguments);
        };
        const _moveStraight = proto.moveStraight;
        proto.moveStraight = function() {
            if (this._rrFree) release(this);
            const result = _moveStraight.apply(this, arguments);
            if (this._rrVehicle && !this._rrBoarded && !this._rrFree) faceYaw(this);
            return result;
        };
        const _moveDiagonally = proto.moveDiagonally;
        proto.moveDiagonally = function() {
            if (this._rrFree) release(this);
            const result = _moveDiagonally.apply(this, arguments);
            if (this._rrVehicle && !this._rrBoarded && !this._rrFree) faceYaw(this);
            return result;
        };
        const _jump = proto.jump;
        proto.jump = function() {
            if (this._rrFree) release(this);
            const result = _jump.apply(this, arguments);
            if (this._rrVehicle && !this._rrBoarded && !this._rrFree) faceYaw(this);
            return result;
        };
        const _setPosition = proto.setPosition;
        proto.setPosition = function() {
            if (this._rrFree) release(this);
            return _setPosition.apply(this, arguments);
        };
    }

    if (typeof root.Game_Character !== "undefined") {
        const proto = root.Game_Character.prototype;
        const _forceMoveRoute = proto.forceMoveRoute;
        proto.forceMoveRoute = function(moveRoute) {
            // A route forced on the ridden vehicle's event is the rider's.
            const player = typeof root.$gamePlayer !== "undefined" ? root.$gamePlayer : null;
            if (this._rrBoarded && player && this !== player && player._rrFree) return player.forceMoveRoute(moveRoute);
            if (this._rrFree) release(this);
            return _forceMoveRoute.apply(this, arguments);
        };
        const _processMoveCommand = proto.processMoveCommand;
        proto.processMoveCommand = function(command) {
            if (this._rrFree && this === root.$gamePlayer && command) {
                const code = command.code, moves = code >= 1 && code <= 14;
                // A movement command: a hop in progress is finished first (it may end on foot), then the grid from
                // here on, once the stock glide has carried the player to its tile.
                if (moves && this._rrMount && typeof ReactorVehicles.settle === "function") ReactorVehicles.settle();
                if (this._rrFree) {
                    if (moves && !onGrid(this)) {
                        takeGrid(this);
                        if (this._realX !== this._x || this._realY !== this._y) { this._moveRouteIndex--; this.setMovementSuccess(true); return; }
                    }
                    _processMoveCommand.apply(this, arguments);
                    // A turn command turns the heading.
                    if (code >= 16 && code <= 26 && this._rrDrive && !onGrid(this)) this._rrDrive.yaw = Drive.yawOf(this._reactorDir8 || this._direction);
                    return;
                }
            }
            const result = _processMoveCommand.apply(this, arguments);
            if (this._rrVehicle && !this._rrBoarded && !this._rrFree) faceYaw(this);
            return result;
        };
    }

    //-------------------------------------------------------------------------
    // The player

    /** The on-foot list: the player's own plain fields, and nothing of an event or of the map's data. */
    function onFoot(player) {
        if (typeof ReactorVehicles.putOnFoot === "function") { ReactorVehicles.putOnFoot(); return; }
        const was = player._rrWas;
        player._vehicleType = "walk";
        player._rrFree = 0; player._rrSeated = false; player._rrDrive = null; player._rrMount = null; player._rrRide = null;
        player._reactorRiding = false; player._reactorAir = 0; player._reactorVz = 0;
        if (was && typeof was === "object") {
            if (finite(was.speed)) player._moveSpeed = was.speed;
            if (typeof was.transparent === "boolean") player._transparent = was.transparent;
        }
        player._rrWas = null;
        const followers = player._followers;
        if (followers && typeof followers.rrAboard === "function") followers.rrAboard(false, true);
    }

    /** Whether the vehicle's body has room with its middle on tile (x, y) at a heading: the tile of its middle and of each axle. */
    function fitsAt(event, player, x, y, yaw) {
        if (typeof ReactorVehicles.fits === "function") return ReactorVehicles.fits(event, x, y, yaw);
        const R = world(), P = physics(), map = typeof root.$dataMap !== "undefined" ? root.$dataMap : null;
        if (!R || !P || !map || !P.standingAt) return true;
        const hx = Math.sin(yaw), hz = -Math.cos(yaw);
        // Where a body stands on the middle's tile; each axle's tile has a place to stand within a tile of that height.
        const ground = P.standingAt(map, Math.floor(x + 0.5), Math.floor(y + 0.5));
        if (ground === null) return false;
        for (let i = -1; i <= 1; i++) {
            const reach = i < 0 ? -SHAPE.rear : i > 0 ? SHAPE.front : 0;
            const tx = Math.floor(x + 0.5 + hx * reach), ty = Math.floor(y + 0.5 + hz * reach);
            if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
            if (P.standingAt(map, tx, ty, ground, WITHIN) === null) return false;
            if (R.bodyBlocksTile && R.bodyBlocksTile(player, tx, ty, true)) return false;
        }
        return true;
    }

    /** A vehicle parked where it stands, by the world's own rule where that is loaded. */
    function parkHere(event) {
        if (typeof ReactorVehicles.park === "function") ReactorVehicles.park(event);
        else { event._rrFree = 1; event._through = false; }
        Drive.leave(event);
    }

    /** A place written to a vehicle's event: plain fields only. */
    function putEvent(event, x, y, yaw, alt) {
        event._realX = x; event._realY = y;
        event._x = Math.round(x); event._y = Math.round(y);
        event._rrYaw = yaw;
        event._reactorGround = event._reactorAlt = alt; event._reactorAir = 0; event._reactorVz = 0;
    }

    /**
     * The vehicle stands, parked; the controls are off until the party is on foot. Where its tile is one an event
     * holds (the strip that transfers), the place it is parked at is the last one its middle was on a tile no event
     * holds: that place is what is written for the map to remember, and what is drawn stays where it is, with its
     * rider seated, until this map is left.
     */
    function parkForTransfer(player) {
        if (typeof ReactorVehicles.settle === "function") ReactorVehicles.settle();
        const event = riddenBy(player);
        if (!event) return;
        const d = stateOf(player, event);
        d.v = 0; d.steer = 0; d.rest = 0;
        parked = null;
        if (clearX === clearX && tileTaken(event._x, event._y, event)) {
            const x = event._realX, y = event._realY, yaw = event._rrYaw, alt = event._reactorAlt, facing = event._direction, dir8 = event._reactorDir8;
            putEvent(event, clearX, clearY, clearYaw, clearAlt);
            parkHere(event);
            putEvent(event, x, y, yaw, alt);
            event._direction = facing; event._reactorDir8 = dir8;
            parked = event; parkX = clearX; parkY = clearY; parkYaw = clearYaw; parkAlt = clearAlt;
        } else parkHere(event);
        d.leave = "transfer";
    }

    /** This map is being left: a vehicle parked off the strip takes its place. Plain fields of an event object of the map that goes. */
    function leaveStrip() {
        if (parked) putEvent(parked, parkX, parkY, parkYaw, parkAlt);
        parked = null;
    }

    /**
     * No ride on this map: the party gets off at once, by the world's own way where that is loaded (beside the
     * vehicle, where there is room to stand); else, or with no room, the vehicle is parked where it stands and the
     * party is on foot on its tile.
     */
    function standDown(player) {
        if (typeof ReactorVehicles.getOff === "function") { ReactorVehicles.getOff(AT_ONCE); if (!player._rrFree) return; }
        const event = riddenBy(player);
        if (event) parkHere(event);
        if (player._rrFree) onFoot(player);
    }

    if (typeof root.Game_Player !== "undefined") {
        const proto = root.Game_Player.prototype;

        const _update = proto.update;
        proto.update = function(sceneActive) {
            if (!this._rrFree || this !== root.$gamePlayer) return _update.apply(this, arguments);
            // The scroll is read before the tick moves the player, and followed after the base has run.
            const sx = this.scrolledX(), sy = this.scrolledY();
            Drive.tick(sceneActive);
            _update.apply(this, arguments);
            this.updateScroll(sx, sy);
        };

        const _moveByInput = proto.moveByInput;
        proto.moveByInput = function() {
            if (this._rrFree && !onGrid(this)) {
                if (typeof root.$gameTemp !== "undefined" && root.$gameTemp) root.$gameTemp.clearDestination();
                return;
            }
            return _moveByInput.apply(this, arguments);
        };

        const _reserveTransfer = proto.reserveTransfer;
        proto.reserveTransfer = function(mapId) {
            // To another map: the work is done here, while this map's data is loaded.
            if (this._rrFree && this._vehicleType === "reactor" && typeof root.$gameMap !== "undefined" && root.$gameMap
                && mapId !== root.$gameMap.mapId()) parkForTransfer(this);
            if (typeof ReactorVehicles.prepareTransfer === "function") ReactorVehicles.prepareTransfer(mapId, arguments[1], arguments[2], arguments[3]);
            return _reserveTransfer.apply(this, arguments);
        };

        const _performTransfer = proto.performTransfer;
        proto.performTransfer = function() {
            if (!this._rrFree || this._vehicleType !== "reactor" || !this.isTransferring()) return _performTransfer.apply(this, arguments);
            if (this._newMapId !== root.$gameMap.mapId()) {
                // The world carries the same identity into a runtime event on the destination map.
                leaveStrip();
                if (this._rrVehicleTransfer && typeof ReactorVehicles.bind === "function") {
                    // Ridden over a border into the map shown past it (Reactor3D.Neighbors): the ride goes on as it
                    // was, at its speed and on its heading, from the very place it crossed at.
                    const N = root.Reactor3D && root.Reactor3D.Neighbors, whole = !!(N && N.crossing && N.crossing.to === this._newMapId);
                    const d = this._rrDrive, ride = whole && d && Number.isFinite(d.crossV) ? { v: d.crossV, yaw: d.crossYaw, steer: d.crossSteer } : null;
                    if (d) { delete d.crossV; delete d.crossYaw; delete d.crossSteer; }
                    const result = _performTransfer.apply(this, arguments);
                    this._rrVehicleTransfer = null;
                    const event = ReactorVehicles.bind();
                    if (!event) return result;
                    this._rrMount = null; this._rrDrive = d;
                    d.leave = ""; d.grid = 0; d.air = 0; d.vz = 0;
                    d.yaw = ride ? ride.yaw : Drive.yawOf(this.direction());
                    shapeFor(event, typeFor(event));
                    Drive.seat(this);
                    if (ride) { d.v = ride.v; d.steer = ride.steer; }
                    arrived(this, d);
                    ReactorVehicles.refresh();
                    if (!ride && (ReactorVehicles.scenery(event) || !fitsAt(event, this, this._x, this._y, d.yaw))) standDown(this);
                    else ReactorVehicles.bind();
                    return result;
                }
                onFoot(this);
                return _performTransfer.apply(this, arguments);
            }
            parked = null;
            const d = this._rrDrive, x = this._newX, y = this._newY, facing = this._newDirection;
            if (this._needsMapReload && d && x === this._x && y === this._y) {
                // The tile it stands on, loaded again: the place, the heights and the ride are kept.
                const realX = this._realX, realY = this._realY, ground = this._reactorGround, alt = this._reactorAlt, air = this._reactorAir,
                    vz = this._reactorVz, direction = this._direction, dir8 = this._reactorDir8;
                const result = _performTransfer.apply(this, arguments);
                this._rrDrive = d;
                this._realX = realX; this._realY = realY; this._x = Math.round(realX); this._y = Math.round(realY);
                this._reactorGround = ground; this._reactorAlt = alt; this._reactorAir = air; this._reactorVz = vz; this._reactorRiding = true;
                this._direction = direction; this._reactorDir8 = dir8;
                if (typeof ReactorVehicles.bind === "function") ReactorVehicles.bind();
                seenX = realX; seenY = realY;
                return result;
            }
            const event = riddenBy(this);
            const yaw = facing ? Drive.yawOf(facing) : d && finite(d.yaw) ? d.yaw : 0;
            if (!event || !d || !fitsAt(event, this, x, y, yaw)) {
                // No room for it there: it stays, parked, and the party arrives on foot.
                if (event) parkHere(event);
                onFoot(this);
                return _performTransfer.apply(this, arguments);
            }
            const result = _performTransfer.apply(this, arguments);
            this._rrDrive = d;
            d.yaw = turnOf(yaw); d.leave = ""; d.grid = 0;
            if (typeof ReactorVehicles.bind === "function") ReactorVehicles.bind();
            Drive.seat(this);
            arrived(this, d);
            return result;
        };
    }

    //-------------------------------------------------------------------------
    // The physics: a character the mover has is the mover's

    if (typeof root.ReactorPhysics !== "undefined" && root.ReactorPhysics) {
        const P = root.ReactorPhysics;
        if (typeof P.update === "function") {
            const _physicsUpdate = P.update;
            P.update = function(character) {
                if (character && character._rrFree) return;
                return _physicsUpdate.apply(this, arguments);
            };
        }
        if (typeof P.noteJumpRefused === "function") {
            const _noteJumpRefused = P.noteJumpRefused;
            P.noteJumpRefused = function(character) {
                if (character && character._rrFree && character._vehicleType === "reactor") return;
                return _noteJumpRefused.apply(this, arguments);
            };
        }
    }

    if (typeof module !== "undefined" && module.exports) module.exports = Drive;
})(typeof window !== "undefined" ? window : globalThis);
