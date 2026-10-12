//=============================================================================
// reactor_vehicles_feel.js - the view and the sound of a ride
//=============================================================================
//
// Aboard a vehicle (`$gamePlayer._vehicleType === "reactor"`) on a 3D map:
//
// The view. In third person the camera stands back and widens with speed,
// aims a little ahead along the travel, follows the height through a
// low-pass and swings round behind the heading by itself when the hand has
// left the look alone. In the fixed views it stands back with speed. It is
// laid over the camera the map has placed (a wrapper of
// `Reactor3D.Camera.update`, after the Tactical director's and the Action
// driver's) and never writes the map's saved camera state. What keeps the
// map's own camera out of a wall or a roof is asked of the view's place
// too, and followed by degrees: a wall the swing crosses in a tick or two
// moves nothing, one the view stays in brings the camera in; the ground is
// cleared at once.
//
// The sound. One looped buffer of this file's own for the engine, its
// playback rate and volume following the speed, and the type's punctuation
// sounds as ordinary sound effects.
//
// Every eased value moves once per logic tick, in
// `ReactorVehicles.Feel.advance` (the mover's call; a tick no mover advanced
// is advanced by the camera wrapper). The wrapper only applies what the tick
// left: asked twice on a tick it gives the same camera, and the camera of a
// catch-up tick, which nothing is drawn from, is left as the map placed it.
// The picture is the same at any frame rate.
//
// On foot with nothing left to ease, the camera wrapper is one compare of
// `_vehicleType` and one flag of this file. Nothing is made per tick or per
// camera call.
//=============================================================================

(function(root) {
    "use strict";

    const V = typeof ReactorVehicles !== "undefined" && ReactorVehicles
        ? ReactorVehicles : (root.ReactorVehicles = root.ReactorVehicles || {});
    const Feel = V.Feel = {};

    const DEG = Math.PI / 180;
    const TICKS = 60;
    const DT = 1 / TICKS;

    /**
     * Every number of the view and the sound. Seconds, tiles, degrees. A type's own `camera` and `sounds` win over
     * `speedDistance`, `speedFov`, `lookAhead` and `engineRate`.
     */
    const T = Feel.TUNING = {
        topSpeed: 20,
        // The view.
        speedDistance: 35,      // percent of the map camera's own distance added at top speed
        speedFov: 11,           // degrees added at top speed
        lookAhead: 3,           // tiles the aim leads at top speed
        distanceTime: 0.4,
        fovTime: 0.3,
        aimTime: 0.3,
        heightTime: 0.15,
        heightJump: 6,          // a height change of more than this in one tick is a move, not a bump
        // The hand on the look.
        handDegrees: 1.5,       // more than this inside `handTicks` is the hand
        handTicks: 10,
        handHold: 45,           // ticks the view is the hand's after it
        // Swinging round behind the heading.
        swingSpeed: 2,          // tiles a second above which it swings
        swingLead: 0.30,        // seconds of turn the view is led into a corner
        swingTime: 0.2,
        turnJump: 6,            // a heading change of more than this in one tick is a move, not a turn
        boardTicks: 44,         // the least the boarding ease lasts: the hop's 14 and 30 more
        boardMost: 120,         // and the most
        boardNear: 0.5,         // it is over within this many degrees of behind
        // What the map keeps its camera clear with, followed by the view.
        clearWait: 3,           // ticks running a lift or a way in must be asked for before the view follows it
        clearTime: 0.1,         // then it is followed over this long
        clearBack: 0.3,         // and let go over this long
        tailMost: 240,          // ticks the run-out on foot lasts at most
        // The kick.
        kickTicks: 6,
        kickMost: 0.5,
        // The engine.
        engineRate: [0.6, 1.5],
        throttleRate: 0.10,     // on top of the rate while the throttle is held
        rateStep: 0.005,        // a rate that moved less than this share is not sent
        rateRamp: 0.05,         // seconds, the ramp's time constant
        volumeIdle: 0.5,
        volumeStep: 0.01,
        engineFade: 0.25,
        soundVolume: 90,
        gaps: { bump: 6, land: 6, scrape: 20, skid: 30 }
    };

    /** The eased values of the view. Read by the camera wrapper; written by `advance`. */
    const cam = Feel.camera = {
        // An overlay is in force; it is running out on foot; whose it is.
        live: false, tail: false, owner: null, ride: 0, map: 0,
        // The view's own yaw and its speed, the look's yaw as last written, the heading and its rate, the heading as a vector.
        yaw: 0, vyaw: 0, wrote: 0, heading: 0, turn: 0, hx: 0, hz: -1,
        // Ticks since the hand moved the look; the boarding ease in force and its age.
        still: 0, board: 0, boardT: 0,
        // Shares of the speed for distance and field of view, the aim's lead, the followed height and its offset, the least distance's share.
        dist: 0, fov: 0, ax: 0, az: 0, h: 0, dy: 0, floor: 0,
        // The ridden type's numbers, kept by the tick for the wrapper.
        kDist: T.speedDistance / 100, kFov: T.speedFov, min: 0,
        kick: 0, kickT: 0, kickAlong: false, kickNew: false,
        // What the map's clearing asks, as the view follows it: the lift, the share of the way out, the ticks each has
        // been asked for, the tick of the last asking; nothing is left to follow; the next asking is taken as it stands.
        lift: 0, pull: 1, liftT: 0, pullT: 0, clearAt: 0, settled: true, fresh: true,
        // Ticks the run-out on foot has lasted.
        tailT: 0
    };
    /** The engine loop. `sent` is the rate last sent to the source node, `rates` how many times one was sent. */
    const engine = Feel.engine = {
        on: false, held: false, name: "", buffer: null, node: null, gain: null,
        sent: 0, volume: -1, rates: 0, share: 0, gas: 0, buffers: {}, generation: 0,
        folder: "se", type: null, slowing: 0
    };
    const ENGINE_SLOTS = ["engine", "idle", "accelerate", "slowdown"];
    // `kind`: the type the last tick rode. `type`, `asked`: the ridden event's own, looked up once a ride.
    // `tick`: the logic tick the mover last advanced on; `self`: the one the camera wrapper last advanced on by itself.
    // `ticks`: how many ticks were advanced. `came`: the player a map scene began aboard, until it is on foot.
    const state = { tick: -1, self: -1, stamp: 0, ticks: 0, busy: false, kind: null, type: null, asked: false, v: 0, braking: false, came: null, last: {} };
    // The look's own changes over the last ticks, newest written over oldest.
    const hand = new Float64Array(64);
    let handAt = 0;
    // Handed to `Reactor3D.aimCamera` and the functions that keep a camera clear: the same three objects every call.
    const aim = { x: 0, y: 0, z: 0 };
    const near = { x: 0, y: 0, z: 0 };
    const settings = { pitch: 0, yaw: 0, distance: 0 };
    // The last place worked out, with what it was worked out from. `stamp` moves whenever an eased value may have.
    const kept = {
        stamp: -1, camera: null, third: false, x: 0, y: 0, z: 0, pitch: 0, yaw: 0, distance: 0, fov: 0, zoom: 0,
        px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1
    };

    function zero() {
        cam.live = false; cam.tail = false; cam.owner = null; cam.ride = 0; cam.map = 0;
        cam.yaw = 0; cam.vyaw = 0; cam.wrote = 0; cam.heading = 0; cam.turn = 0; cam.hx = 0; cam.hz = -1;
        cam.still = 0; cam.board = 0; cam.boardT = 0;
        cam.dist = 0; cam.fov = 0; cam.ax = 0; cam.az = 0; cam.h = 0; cam.dy = 0; cam.floor = 0;
        cam.kDist = T.speedDistance / 100; cam.kFov = T.speedFov; cam.min = 0;
        cam.kick = 0; cam.kickT = 0; cam.kickAlong = false; cam.kickNew = false;
        cam.tailT = 0;
        unclear();
        state.kind = null; state.type = null; state.asked = false; state.v = 0; state.braking = false; state.came = null;
        hand.fill(0); handAt = 0;
    }
    /** Nothing of the map's clearing is being followed: the next asking is taken as it stands. */
    function unclear() {
        cam.lift = 0; cam.pull = 1; cam.liftT = 0; cam.pullT = 0; cam.settled = true; cam.fresh = true;
    }

    //-------------------------------------------------------------------------
    // Small things

    const finite = Number.isFinite;
    /** The signed shortest way from one angle to another, in degrees. */
    function arc(from, to) {
        let d = (to - from) % 360;
        if (d > 180) d -= 360; else if (d < -180) d += 360;
        return d;
    }
    function norm(angle) {
        const a = angle % 360;
        return a < 0 ? a + 360 : a;
    }
    /** The share of the way a value eased over `time` seconds covers in one tick. */
    function step(time) {
        return time > 0 ? 1 - Math.exp(-DT / time) : 1;
    }
    /** The same over `ticks` ticks. */
    function stepOver(time, ticks) {
        return ticks <= 0 ? 0 : time > 0 ? 1 - Math.exp(-ticks * DT / time) : 1;
    }
    function frame() {
        return typeof Graphics !== "undefined" && Graphics ? Graphics.frameCount : -1;
    }
    function world() {
        return typeof Reactor3D !== "undefined" ? Reactor3D : null;
    }
    function lookOf() {
        const R = world();
        return R && R.Camera && R.Camera.look ? R.Camera.look : null;
    }
    /** The map camera's saved state, read only. */
    function mapCamera() {
        return typeof $gameMap !== "undefined" && $gameMap ? $gameMap._reactorCamera3d || null : null;
    }
    function mapNow() {
        return typeof $gameMap !== "undefined" && $gameMap && $gameMap.mapId ? $gameMap.mapId() : 0;
    }
    function battleHere() {
        const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
        return !!fight && typeof fight.isHere === "function" && fight.isHere();
    }
    /** The ridden vehicle's event, by the player's own record of it. */
    function riddenEvent(player, id) {
        const map = typeof $gameMap !== "undefined" ? $gameMap : null;
        return id > 0 && map && map._events ? map._events[id] || null : null;
    }
    function typeById(id) {
        if (!(id > 0)) return null;
        if (typeof V.type === "function") {
            try { const filled = V.type(id); if (filled) return filled; } catch (error) { /* the record is read below */ }
        }
        const list = typeof $dataReactorVehicles !== "undefined" ? $dataReactorVehicles : null;
        const record = list && list[id];
        if (!record) return null;
        const R = world();
        return R && R.Vehicles && typeof R.Vehicles.typeOf === "function" ? R.Vehicles.typeOf(record) : record;
    }
    /** The ridden vehicle's type, asked once a ride. */
    function rideType(player, id) {
        if (state.asked) return state.type;
        state.asked = true;
        const event = riddenEvent(player, id);
        state.type = event ? typeById(event._rrVehicle) : null;
        return state.type;
    }
    /** The heading in degrees, 0 north, clockwise: the mover's, else the ridden event's, else the facing. */
    function headingOf(player, drive, id) {
        if (drive && finite(drive.yaw)) return norm(drive.yaw / DEG);
        const event = riddenEvent(player, id);
        if (event && finite(event._rrYaw)) return norm(event._rrYaw / DEG);
        const d = player.direction ? player.direction() : 2;
        return d === 8 ? 0 : d === 6 ? 90 : d === 4 ? 270 : 180;
    }
    /** What the map camera takes for the player's height (its anchor without the mode's lift). */
    function heightOf(player) {
        if (!finite(player._reactorGround)) return NaN;
        return player._reactorGround + (player._reactorLift || 0) + (player._reactorAir || 0);
    }
    /** How many ticks of the look's changes are summed. */
    function handSpan() {
        const n = T.handTicks | 0;
        return n < 1 ? 1 : n > hand.length ? hand.length : n;
    }
    function handClear() {
        const n = handSpan();
        for (let i = 0; i < n; i++) hand[i] = 0;
    }

    //-------------------------------------------------------------------------
    // The view: what a tick does

    /**
     * A ride begins, or goes on with another player object, vehicle or map: the view starts from the look. `boarding`:
     * the party got on in play (a hop on, or a ride that began with no hop), and the view eases behind the vehicle.
     */
    function seed(player, ride, mapId, heading, boarding) {
        const look = lookOf(), keep = cam.live && cam.tail && cam.owner === player && cam.map === mapId;
        if (!keep) { cam.dist = 0; cam.fov = 0; cam.ax = 0; cam.az = 0; cam.dy = 0; cam.floor = 0; cam.kickT = 0; unclear(); }
        cam.yaw = look && finite(look.yaw) ? norm(look.yaw) : heading;
        cam.wrote = cam.yaw;
        cam.vyaw = 0;
        cam.heading = heading;
        cam.turn = 0;
        cam.still = boarding ? 0 : T.handHold;
        cam.board = boarding ? 1 : 0;
        cam.boardT = 0;
        if (!keep) { const h = heightOf(player); cam.h = finite(h) ? h : 0; }
        handClear();
        cam.live = true; cam.tail = false; cam.tailT = 0; cam.owner = player; cam.ride = ride; cam.map = mapId;
        state.kind = null; state.type = null; state.asked = false; state.v = 0; state.braking = false;
        engine.held = false;
    }

    /** Third person: the hand, and the swing round behind the heading. */
    function swing(look, heading, speed) {
        // What the look moved by since this file last wrote it is somebody else's: the mouse. (A look that is no
        // number moved by nothing, and is written over below.)
        const moved = finite(look.yaw) ? arc(cam.wrote, look.yaw) : 0;
        if (moved !== 0) cam.yaw = norm(cam.yaw + moved);
        const n = handSpan();
        if (handAt >= n) handAt = 0;
        hand[handAt] = moved;
        handAt = handAt + 1 < n ? handAt + 1 : 0;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += hand[i];
        if (sum > T.handDegrees || sum < -T.handDegrees) {
            cam.still = 0; cam.board = 0; cam.vyaw = 0;
            handClear();
        } else if (cam.still < 1e6) cam.still++;
        if (cam.board > 0 || (cam.still >= T.handHold && speed > T.swingSpeed)) {
            // A critically damped spring toward the heading, led into the turn.
            const w = 1 / T.swingTime;
            const off = arc(cam.yaw, heading + T.swingLead * cam.turn);
            cam.vyaw += (w * w * off - 2 * w * cam.vyaw) * DT;
            cam.yaw = norm(cam.yaw + cam.vyaw * DT);
            if (cam.board > 0) {
                cam.boardT++;
                const there = cam.boardT >= T.boardTicks && off < T.boardNear && off > -T.boardNear;
                if (there || cam.boardT >= T.boardMost) { cam.board = 0; cam.still = T.handHold; }
            }
        } else if (cam.vyaw !== 0) {
            // Standing, or the hand's: what swing was left runs out.
            cam.vyaw *= 0.8;
            if (cam.vyaw < 0.5 && cam.vyaw > -0.5) cam.vyaw = 0;
            cam.yaw = norm(cam.yaw + cam.vyaw * DT);
        }
        look.yaw = cam.yaw;
        cam.wrote = cam.yaw;
    }

    /** One tick of the view aboard. */
    function easeView(player, heading, v, top, view, leaving) {
        let turned = arc(cam.heading, heading);
        if (turned > T.turnJump || turned < -T.turnJump) turned = 0;
        cam.turn = turned * TICKS;
        cam.heading = heading;
        const rad = heading * DEG;
        cam.hx = Math.sin(rad);
        cam.hz = -Math.cos(rad);
        const speed = v < 0 ? -v : v;
        const saved = mapCamera();
        if (saved && saved.mode === "thirdPerson") {
            const look = lookOf();
            if (look) swing(look, heading, speed);
        } else cam.board = 0;
        const part = speed >= top ? 1 : speed / top;
        cam.kDist = (view && finite(view.speedDistance) ? view.speedDistance : T.speedDistance) / 100;
        cam.kFov = view && finite(view.speedFov) ? view.speedFov : T.speedFov;
        cam.min = view && view.minDistance > 0 ? view.minDistance : 0;
        // A square hit stops the vehicle in one tick. For the ticks of its kick the view stands as it stood, so the
        // kick is all that moves; then the distance and the lead come in.
        if (!(cam.kickAlong && cam.kickT > 0)) {
            cam.dist += (part - cam.dist) * step(T.distanceTime);
            cam.fov += (part - cam.fov) * step(T.fovTime);
            const reach = (view && finite(view.lookAhead) ? view.lookAhead : T.lookAhead) * (v >= top ? 1 : v <= -top ? -1 : v / top);
            const a = step(T.aimTime);
            cam.ax += (cam.hx * reach - cam.ax) * a;
            cam.az += (cam.hz * reach - cam.az) * a;
        }
        cam.floor += ((leaving ? 0 : 1) - cam.floor) * step(T.distanceTime);
        height(player);
        if (cam.kickNew) cam.kickNew = false; else if (cam.kickT > 0) cam.kickT--;
    }

    /** The height the view follows: the player's, low-passed, kept as an offset from the player's own. */
    function height(player) {
        const h = heightOf(player);
        if (!finite(h)) { cam.dy = 0; return; }
        const off = h - cam.h;
        if (off > T.heightJump || off < -T.heightJump) cam.h = h;
        else cam.h += off * step(T.heightTime);
        cam.dy = cam.h - h;
    }

    /**
     * On foot: what the ride left of distance, field of view and aim runs out and what was followed of the map's
     * clearing is let go (`tailMost` ticks at most); then nothing is left to do.
     */
    function ashore(player) {
        if (engine.on) engineOff(T.engineFade);
        engine.held = false;
        engine.slowing=0; engine.share=0;
        state.came = null;
        if (cam.live) {
            if (!player || cam.owner !== player || cam.map !== mapNow() || battleHere() || cam.tailT >= T.tailMost) cam.live = false;
            else {
                cam.tail = true; cam.tailT++; cam.board = 0;
                cam.dist -= cam.dist * step(T.distanceTime);
                cam.fov -= cam.fov * step(T.fovTime);
                const a = step(T.aimTime);
                cam.ax -= cam.ax * a;
                cam.az -= cam.az * a;
                cam.floor -= cam.floor * step(T.distanceTime);
                height(player);
                if (cam.kickNew) cam.kickNew = false; else if (cam.kickT > 0) cam.kickT--;
                // (The least distance's share counts only for a type that has one.)
                const small = cam.settled && cam.dist < 0.002 && cam.fov < 0.002 && (cam.min <= 0 || cam.floor < 0.002) && cam.kickT <= 0
                    && cam.ax < 0.01 && cam.ax > -0.01 && cam.az < 0.01 && cam.az > -0.01 && cam.dy < 0.005 && cam.dy > -0.005;
                if (small) cam.live = false;
            }
            if (!cam.live) { cam.tail = false; cam.dist = 0; cam.fov = 0; cam.ax = 0; cam.az = 0; cam.dy = 0; cam.floor = 0; cam.kickT = 0; unclear(); }
        }
        state.busy = cam.live || engine.on;
        state.v = 0;
        state.braking = false;
    }

    /**
     * One logic tick of the ride: every eased value of the view and the engine's rate and volume. `drive` is
     * `$gamePlayer._rrDrive` (or null in a hop), `type` the filled type record (or null: found from the ridden
     * event), `input` the `{ gas, brake }` the tick applied (or absent: the throttle is held on a tick the speed rose).
     */
    Feel.advance = function(drive, type, input) {
        state.tick = frame();
        advance(drive, type, input);
    };

    function advance(drive, type, input) {
        state.stamp++;
        state.ticks++;
        const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
        const stock=stockSoundType(player);
        if (stock) {
            cam.live=false;
            const moving=!!player.isMoving?.(),share=moving?1:0;
            engine.held=false;
            engineRun(stock,share,moving?1:0,!!player._vehicleGettingOn || !!player._vehicleGettingOff,share<engine.share?1:0);
            state.busy=engine.on;
            return;
        }
        if (!player || player._vehicleType !== "reactor") { ashore(player); return; }
        const mount = player._rrMount || null;
        const hopping = !!mount && mount.t < mount.n;
        const boarding = hopping && mount.on === true, leaving = hopping && mount.on === false;
        const ride = player._rrRide ? player._rrRide.id : 0, mapId = mapNow();
        const heading = headingOf(player, drive, ride);
        // A ride that began with no hop (a command's, a boarding from afar) is a boarding all the same, unless the map
        // scene began aboard (a save loaded aboard, a transfer made aboard).
        // Ridden over a border into the map shown past it (Reactor3D.Neighbors): the same ride, and the view it had.
        const neighbors = typeof Reactor3D !== "undefined" ? Reactor3D.Neighbors : null, crossed = neighbors ? neighbors.crossing || neighbors.last : null;
        if (crossed && cam.live && !cam.tail && cam.owner === player && cam.map === crossed.from && mapId === crossed.to) { cam.ride = ride; cam.map = mapId; neighbors.last = null; }
        if (!cam.live || cam.tail || cam.owner !== player || cam.ride !== ride || cam.map !== mapId) seed(player, ride, mapId, heading, boarding || state.came !== player);
        const kind = state.kind = type || rideType(player, ride);
        const handling = kind ? kind.handling : null;
        const top = handling && handling.speed > 0 ? handling.speed : T.topSpeed;
        const v = drive && finite(drive.v) ? drive.v : 0;
        const speed = v < 0 ? -v : v, share = speed >= top ? 1 : speed / top;
        let gas = 0, brake = 0;
        if (input) { gas = Number(input.gas) || 0; brake = Number(input.brake) || 0; }
        else if (v > 0 && v > state.v + 1e-6) gas = 1;
        state.v = v;
        state.busy = true;
        if (battleHere()) cam.live = false;
        else easeView(player, heading, v, top, kind ? kind.camera : null, leaving);
        // The brake pressed above half the top speed.
        const braking = brake > 0 && v > top * 0.5;
        if (braking && !state.braking) Feel.sound("skid", kind);
        state.braking = braking;
        // Walked along the bed under water, its engine is silent.
        if (drive && drive.flooded) { if (engine.on) engineOff(T.engineFade); }
        else engineRun(kind, share, gas < 0 ? 0 : gas > 1 ? 1 : gas, boarding, brake);
    }

    /**
     * A short push of the camera, gone in `kickTicks` ticks: straight down (a landing), or with `along` along the
     * heading (a square hit).
     */
    Feel.kick = function(tiles, along) {
        const size = Number(tiles);
        if (!(size > 0)) return;
        cam.kick = size > T.kickMost ? T.kickMost : size;
        cam.kickT = T.kickTicks;
        cam.kickAlong = !!along;
        cam.kickNew = true;
        state.stamp++;
    };

    /** Every eased value dropped and the engine silent: a new game, a test. */
    Feel.reset = function() {
        engineOff(0);
        engine.held = false;
        engine.type=null; engine.slowing=0; engine.share=0;
        zero();
        state.tick = -1;
        state.self = -1;
        state.stamp++;
        state.busy = false;
        state.last = {};
    };

    //-------------------------------------------------------------------------
    // The view: laid over the placed camera

    function setFov(camera, fov) {
        if (camera.fov === fov) return;
        camera.fov = fov;
        camera.updateProjectionMatrix();
    }

    function push(camera) {
        if (cam.kickT <= 0) return;
        const t = cam.kickT / T.kickTicks, by = cam.kick * t * t;
        if (cam.kickAlong) { camera.position.x += cam.hx * by; camera.position.z += cam.hz * by; }
        else camera.position.y -= by;
    }

    /**
     * The place the view wants, kept clear as the map's own camera is: over the roof the rider is on, out of a roof's
     * hollow, out of a solid, out of the ground, each asked once, in the map camera's order. What the first three ask
     * is followed, not jumped to. A lift or a way in asked for fewer than `clearWait` ticks running moves nothing (a
     * wall or a roof the swing crosses); a lasting one is eased to over `clearTime` and let go over `clearBack`. The
     * ground is asked of the place as it will be drawn and taken at once: the terrain has no underside to look at.
     * A view that starts takes the map's own clearing as it stands.
     */
    function clear(R, camera, player, mapData, current) {
        const pos = camera.position, turn = camera.quaternion;
        const wx = pos.x, wy = pos.y, wz = pos.z, qx = turn.x, qy = turn.y, qz = turn.z, qw = turn.w;
        near.x = current.x + 0.5; near.y = current.y + 1.2; near.z = current.z + 0.5;
        if (R.clearCameraRoof && player) R.clearCameraRoof(camera, near, mapData, finite(player._reactorAlt) ? player._reactorAlt : player._reactorGround);
        if (R.clearCameraAttic) R.clearCameraAttic(camera, near, mapData);
        const lift = pos.y - wy, ly = pos.y;
        if (R.clearCameraPath) R.clearCameraPath(camera, near, mapData);
        // The share of the way from the rider out to the lifted place that the solid leaves.
        let pull = 1;
        if (pos.x !== wx || pos.y !== ly || pos.z !== wz) {
            const whole = Math.hypot(wx - near.x, ly - near.y, wz - near.z);
            if (whole > 1e-6) pull = Math.hypot(pos.x - near.x, pos.y - near.y, pos.z - near.z) / whole;
        }
        const ticks = state.ticks - cam.clearAt;
        cam.clearAt = state.ticks;
        if (cam.fresh) { cam.fresh = false; cam.lift = lift; cam.pull = pull; cam.liftT = 0; cam.pullT = 0; }
        else {
            // (Followed for the ticks past the wait, however many ticks one drawn frame holds.)
            if (lift > cam.lift) {
                cam.liftT += ticks;
                const past = cam.liftT - T.clearWait + 1;
                if (past > 0) cam.lift += (lift - cam.lift) * stepOver(T.clearTime, past < ticks ? past : ticks);
            } else {
                cam.liftT = 0;
                if (lift < cam.lift) cam.lift += (lift - cam.lift) * stepOver(T.clearBack, ticks);
            }
            if (pull < cam.pull) {
                cam.pullT += ticks;
                const past = cam.pullT - T.clearWait + 1;
                if (past > 0) cam.pull += (pull - cam.pull) * stepOver(T.clearTime, past < ticks ? past : ticks);
            } else {
                cam.pullT = 0;
                if (pull > cam.pull) cam.pull += (pull - cam.pull) * stepOver(T.clearBack, ticks);
            }
            if (cam.lift - lift < 0.002 && lift - cam.lift < 0.002) cam.lift = lift;
            if (cam.pull - pull < 0.0005 && pull - cam.pull < 0.0005) cam.pull = pull;
        }
        cam.settled = cam.lift === lift && cam.pull === pull;
        // Arrived, the camera stays where the map's own functions put it. On the way it is put by the eased values:
        // lifted, still looking at what the wanted place looked at (as the lift itself does), then brought in.
        if (!cam.settled) {
            pos.set(wx, wy + cam.lift, wz);
            if (cam.lift !== 0) {
                const far = Math.hypot(wx - near.x, wy - near.y, wz - near.z);
                camera.lookAt(wx - 2 * (qx * qz + qw * qy) * far, wy - 2 * (qy * qz - qw * qx) * far, wz - (1 - 2 * (qx * qx + qy * qy)) * far);
            } else turn.set(qx, qy, qz, qw);
            if (cam.pull !== 1) pos.set(near.x + (pos.x - near.x) * cam.pull, near.y + (pos.y - near.y) * cam.pull, near.z + (pos.z - near.z) * cam.pull);
        }
        if (R.clearCameraGround) R.clearCameraGround(camera, near, mapData);
    }

    /**
     * The camera the map placed, moved by the tick's eased values. One `Reactor3D.aimCamera` (the call the map
     * camera's own `place` makes), the field of view, and the four functions that keep the map's own camera over a
     * roof, out of a roof's hollow, out of a solid and out of the ground, in its order. Nothing else is asked of the
     * world. Asked again with nothing changed (the spriteset asks twice on a drawn tick), the place it worked out is
     * put back and nothing is asked. Where it stands down, no clearing is followed either.
     */
    function lay(api, spriteset, player, aboard) {
        const R = world(), live = spriteset && spriteset._reactor3d;
        const camera = live && live.camera, current = live && live.cameraCurrent;
        if (!R || !camera || !current || !R.aimCamera) return unclear();
        // A battle on the map and a camera command's ease have the camera to themselves.
        if (battleHere() || (typeof api.isMoving === "function" && api.isMoving())) return unclear();
        const mode = current.mode, third = mode === "thirdPerson";
        if (!third && mode !== "fixed" && mode !== "topDown" && mode !== "isometric") return unclear();
        const saved = mapCamera();
        const focus = saved && saved.focus ? saved.focus : "auto";
        // Third person on anything but the player (a command's event, the display) is not this view.
        if (third && focus !== "auto" && focus !== "player") return unclear();
        let distance = current.distance * (1 + cam.kDist * cam.dist);
        const screen = typeof $gameScreen !== "undefined" && $gameScreen && typeof $gameScreen.zoomScale === "function"
            ? Number($gameScreen.zoomScale()) || 1 : 1;
        const zoom = screen > 0 ? screen : 1;
        let fov = current.fov, yaw = current.yaw;
        if (third) {
            fov += cam.kFov * cam.fov;
            // Looking up past the horizon the map camera sits over the shoulder: only the field of view is this file's.
            if (current.pitch < 0) { setFov(camera, fov); return unclear(); }
            if (cam.min > distance) distance += (cam.min - distance) * cam.floor;
            // Aboard the yaw is the view's own (and the map camera's turn on top of the look); running out on foot, the map's.
            if (aboard) yaw = cam.yaw + (saved && finite(saved.yaw) ? saved.yaw : 0);
        } else {
            // The fixed views are kept clear of nothing, by the map's camera or by this one.
            unclear();
            if (distance === current.distance && cam.kickT <= 0) return;
        }
        if (kept.stamp === state.stamp && kept.camera === camera && kept.third === third && kept.x === current.x && kept.y === current.y && kept.z === current.z
            && kept.pitch === current.pitch && kept.yaw === yaw && kept.distance === distance && kept.fov === fov && kept.zoom === zoom) {
            camera.position.set(kept.px, kept.py, kept.pz);
            camera.quaternion.set(kept.qx, kept.qy, kept.qz, kept.qw);
            setFov(camera, fov);
            camera.updateMatrixWorld();
            return;
        }
        settings.pitch = current.pitch; settings.yaw = yaw; settings.distance = distance / zoom;
        if (third) {
            aim.x = current.x + cam.ax; aim.y = current.y + cam.dy; aim.z = current.z + cam.az;
            R.aimCamera(camera, aim, settings);
            push(camera);
            setFov(camera, fov);
            const mapData = typeof $dataMap !== "undefined" ? $dataMap : null;
            if (mapData) clear(R, camera, player, mapData, current); else unclear();
        } else {
            aim.x = current.x; aim.y = current.y; aim.z = current.z;
            R.aimCamera(camera, aim, settings);
            push(camera);
        }
        camera.updateMatrixWorld();
        kept.stamp = state.stamp; kept.camera = camera; kept.third = third;
        kept.x = current.x; kept.y = current.y; kept.z = current.z; kept.pitch = current.pitch;
        kept.yaw = yaw; kept.distance = distance; kept.fov = fov; kept.zoom = zoom;
        kept.px = camera.position.x; kept.py = camera.position.y; kept.pz = camera.position.z;
        kept.qx = camera.quaternion.x; kept.qy = camera.quaternion.y; kept.qz = camera.quaternion.z; kept.qw = camera.quaternion.w;
    }

    function hookCamera() {
        const R = world();
        if (!R || !R.Camera || typeof R.Camera.update !== "function" || R.Camera.update.__reactorVehiclesFeel) return;
        const update = R.Camera.update;
        const wrapped = function(spriteset) {
            const placed = update.call(this, spriteset);
            const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
            const aboard = !!player && player._vehicleType === "reactor";
            if (!aboard && !state.busy) return placed;
            // The scene updates its sprites, then the game: a mover at work advanced on the tick before this one (or,
            // in the other order, on this one). A tick no mover advanced is advanced here, once.
            const now = frame();
            if (state.tick !== now && state.tick !== now - 1 && state.self !== now) {
                state.self = now;
                advance(aboard ? player._rrDrive : null, null, null);
            }
            if (!cam.live) return placed;
            // A catch-up tick's camera is never drawn from: the one laid over is the drawn tick's.
            if (typeof SceneManager !== "undefined" && SceneManager && typeof SceneManager.isFinalUpdateOfFrame === "function"
                && !SceneManager.isFinalUpdateOfFrame()) return placed;
            lay(this, spriteset, player, aboard);
            return placed;
        };
        wrapped.__reactorVehiclesFeel = true;
        R.Camera.update = wrapped;
    }

    //-------------------------------------------------------------------------
    // The sound

    /** The engine's playback rate: `range[0]` standing to `range[1]` at top speed, and a tenth more under throttle. */
    Feel.engineRate = function(share, gas, range) {
        const own = range && finite(Number(range[0])) && finite(Number(range[1])) ? range : T.engineRate;
        const low = Number(own[0]), high = Number(own[1]);
        const s = share > 1 ? 1 : share > 0 ? share : 0;
        const g = Number(gas) || 0;
        return (low + (high - low) * s) * (1 + T.throttleRate * (g > 1 ? 1 : g > 0 ? g : 0));
    };

    /** The engine's loudness by speed: half standing, whole at top speed. */
    Feel.engineVolume = function(share) {
        const s = share > 1 ? 1 : share > 0 ? share : 0;
        return T.volumeIdle + (1 - T.volumeIdle) * s;
    };

    function soundName(sound) {
        return !sound ? "" : typeof sound === "string" ? sound : sound.name || "";
    }

    /** The module's own buffer for an engine sound, made once a name; null where it cannot be had. */
    function engineBuffer(name, folder = "se") {
        if (!name || typeof AudioManager === "undefined" || !AudioManager || typeof AudioManager.createBuffer !== "function") return null;
        const key=folder === "se" ? name : folder+"/"+name;
        let buffer = engine.buffers[key];
        if (buffer === undefined) {
            buffer = null;
            try {
                const missing = folder === "se" && typeof AudioManager.isMissingLocalSe === "function" && AudioManager.isMissingLocalSe(name);
                if (!missing) buffer = AudioManager.createBuffer(folder+"/", name);
            } catch (error) { buffer = null; }
            engine.buffers[key] = buffer;
        }
        return buffer;
    }

    function audioNow() {
        return typeof WebAudio !== "undefined" && WebAudio && typeof WebAudio._currentTime === "function" ? WebAudio._currentTime() : 0;
    }

    /**
     * The rate to the loop's source node. Ramped, and only when it moved; a node this file has not ramped before
     * (the buffer rebuilds its nodes) is given the rate at once. A buffer with more than one node, or on the
     * decoder path, plays at its one pitch.
     */
    function sendRate(buffer, rate) {
        const nodes = buffer._sourceNodes;
        if (!nodes || nodes.length !== 1) return false;
        if (typeof buffer._shouldUseDecoder === "function" && buffer._shouldUseDecoder()) return false;
        const node = nodes[0], param = node ? node.playbackRate : null;
        if (!param) return false;
        if (node !== engine.node) {
            engine.node = node;
            if (typeof param.setValueAtTime === "function") param.setValueAtTime(rate, audioNow()); else param.value = rate;
        } else {
            const moved = rate - engine.sent;
            if (moved <= engine.sent * T.rateStep && moved >= -engine.sent * T.rateStep) return false;
            if (typeof param.setTargetAtTime === "function") param.setTargetAtTime(rate, audioNow(), T.rateRamp); else param.value = rate;
        }
        engine.sent = rate;
        engine.rates++;
        return true;
    }

    /** The loudness to the loop's gain node, the same way. */
    function sendVolume(buffer, volume) {
        const node = buffer._gainNode || null;
        const moved = volume - engine.volume;
        if (node === engine.gain && moved <= T.volumeStep && moved >= -T.volumeStep) return false;
        // A node the buffer builds later starts from this.
        buffer._volume = volume;
        const param = node ? node.gain : null;
        if (param) {
            if (node !== engine.gain || typeof param.setTargetAtTime !== "function") {
                if (typeof param.setValueAtTime === "function") param.setValueAtTime(volume, audioNow()); else param.value = volume;
            } else param.setTargetAtTime(volume, audioNow(), T.rateRamp);
        }
        engine.gain = node;
        engine.volume = volume;
        return true;
    }

    function engineOff(seconds) {
        const buffer = engine.buffer;
        engine.on = false; engine.node = null; engine.gain = null; engine.sent = 0; engine.volume = -1;
        engine.generation++;
        if (!buffer) return;
        const generation=buffer._rrVehicleGeneration;
        try {
            if (seconds > 0 && buffer._fadeGainNode && typeof buffer.fadeOut === "function" && typeof setTimeout === "function") {
                buffer.fadeOut(seconds);
                // A faded loop still runs: its nodes are let go when the fade is over, unless it was started again.
                setTimeout(() => { if (buffer._rrVehicleGeneration === generation) buffer.stop(); }, seconds * 1000 + 50);
            } else if (typeof buffer.stop === "function") buffer.stop();
        } catch (error) { /* silence either way */ }
    }

    /** One tick of the engine: started when it may play, then its rate and volume by the speed. */
    function engineRun(type, share, gas, boarding, brake = 0) {
        const sounds = type ? type.sounds : null;
        if (type!==engine.type) engine.slowing=0;
        else if (brake>0 || share<engine.share-0.001) engine.slowing=15;
        else if (engine.slowing>0) engine.slowing--;
        const idle=sounds && (sounds.idle || sounds.engine);
        const sound=sounds ? engine.slowing>0 ? sounds.slowdown || idle : share>0.01 || gas>0 ? sounds.accelerate || idle : idle : null;
        const name = soundName(sound);
        const folder=sound && sound.folder === "bgs" ? "bgs" : "se";
        engine.share = share;
        engine.gas = gas;
        if (sounds) for (const slot of ENGINE_SLOTS) { const clip=sounds[slot]; if (clip && soundName(clip)) engineBuffer(soundName(clip),clip.folder==="bgs"?"bgs":"se"); }
        if (!name) { if (engine.on) engineOff(T.engineFade); return; }
        if (engine.on && (engine.name !== name || engine.folder!==folder)) engineOff(engine.type===type?T.engineFade:0);
        engine.type=type;
        // Asked for as the hop on begins, so it has arrived by the time the rider is seated.
        const buffer = engineBuffer(name,folder);
        if (boarding || engine.held) { if (engine.on) engineOff(T.engineFade); return; }
        if (!buffer) return;
        // Stopped by somebody else (every sound stopped by a command): it is started again below.
        if (engine.on && typeof buffer.isPlaying === "function" && !buffer.isPlaying()) engineOff(0);
        if (!engine.on) {
            // Never before it is whole: a loop started on a partly decoded file is rebuilt under the ramp.
            if ((typeof buffer.isError === "function" && buffer.isError()) || !buffer.isReady() || !buffer._isLoaded) return;
            engine.generation++;
            buffer._rrVehicleGeneration=(buffer._rrVehicleGeneration || 0)+1;
            engine.on = true; engine.name = name; engine.folder=folder; engine.buffer = buffer;
            engine.node = null; engine.gain = null; engine.sent = 0; engine.volume = -1;
            buffer._volume = 0;
            buffer.play(true, 0);
        }
        const own = typeof sound === "object" ? sound : null;
        const pan = own && finite(own.pan) ? own.pan / 100 : 0;
        if (buffer.pan !== pan) buffer.pan = pan;
        const setting=folder==="bgs"?AudioManager.bgsVolume:AudioManager.seVolume;
        const config = finite(setting) ? setting : 100;
        const loud = own && finite(own.volume) ? own.volume : T.soundVolume;
        sendVolume(buffer, Feel.engineVolume(share) * loud * config / 10000);
        const pitch = own && own.pitch > 0 ? own.pitch / 100 : 1;
        sendRate(buffer, Feel.engineRate(share, gas, sounds.engineRate) * pitch);
    }

    /**
     * One of the type's punctuation sounds: "start", "stop", "bump", "scrape", "skid", "land". Answers whether a
     * sound was asked for. "stop" also fades the engine out, and it stays out until the party is on foot or
     * "start" is asked.
     */
    Feel.sound = function(name, type) {
        const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
        if (name === "start") engine.held = false;
        else if (name === "stop") {
            if (engine.on) engineOff(T.engineFade);
            engine.held = !!player && player._vehicleType === "reactor";
        }
        const kind = type || state.kind || (player && player._rrRide ? rideType(player, player._rrRide.id) : null);
        const sound = kind && kind.sounds ? kind.sounds[name] : null;
        const file = soundName(sound);
        if (!file || typeof AudioManager === "undefined" || !AudioManager || typeof AudioManager.playSe !== "function") return false;
        const gap = T.gaps[name] || 0, now = frame();
        if (gap > 0 && now >= 0) {
            const last = state.last[name];
            if (last !== undefined && now >= last && now - last < gap) return false;
            state.last[name] = now;
        }
        const own = typeof sound === "object" ? sound : null;
        const se = { name: file, volume: own && finite(own.volume) ? own.volume : T.soundVolume, pitch: own && own.pitch > 0 ? own.pitch : 100, pan: own && finite(own.pan) ? own.pan : 0 };
        if (own && own.variants) se.variants = own.variants;
        if (own && own.pitchRandom) se.pitchRandom = own.pitchRandom;
        AudioManager.playSe(se);
        return true;
    };

    /** The engine silent at once. Aboard it stays out until the party is on foot or "start" is asked. */
    Feel.stop = function() {
        const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
        engineOff(0);
        engine.held = !!player && player._vehicleType === "reactor";
    };

    /** The engine buffer of every vehicle type standing on this map, made now so the first ride starts with its sound. */
    Feel.prepare = function() {
        const list = typeof $dataReactorVehicles !== "undefined" ? $dataReactorVehicles : null;
        const mapData = typeof $dataMap !== "undefined" ? $dataMap : null;
        if (!list || list.length < 2 || !mapData || !mapData.events) return 0;
        let made = 0;
        for (const event of mapData.events) {
            const row = event && event.rrVehicle;
            if (!row) continue;
            const type = typeById(Number(row.type));
            for (const slot of ENGINE_SLOTS) {
                const clip=type && type.sounds && type.sounds[slot],name=soundName(clip),folder=clip && clip.folder==="bgs"?"bgs":"se",key=folder==="se"?name:folder+"/"+name;
                if (name && engine.buffers[key] === undefined && engineBuffer(name,folder)) made++;
            }
        }
        return made;
    };

    function stockSoundType(player) {
        if (!player || player._vehicleType!=="boat" && player._vehicleType!=="ship" && player._vehicleType!=="airship") return null;
        const record=typeof $dataSystem!=="undefined" && $dataSystem[player._vehicleType]?.reactorVehicle;
        const R=world();
        return record?.sounds && R?.Vehicles?.stockTypeOf ? R.Vehicles.stockTypeOf(record) : null;
    }

    function hookStockSounds() {
        if (typeof Game_Vehicle!=="undefined") {
            for (const [method, slot] of [["getOn", "start"], ["getOff", "stop"]]) {
                const original=Game_Vehicle.prototype[method];
                if (!original || original.__rrVehicleSound) continue;
                Game_Vehicle.prototype[method]=function() {
                    const record=typeof $dataSystem!=="undefined" && $dataSystem[this._type]?.reactorVehicle;
                    const R=world(), type=record?.sounds && R?.Vehicles?.stockTypeOf ? R.Vehicles.stockTypeOf(record) : null;
                    const result=original.apply(this,arguments);
                    if (type) Feel.sound(slot,type);
                    return result;
                };
                Game_Vehicle.prototype[method].__rrVehicleSound=true;
            }
        }
        if (typeof Game_Player==="undefined") return;
        const update=Game_Player.prototype.update;
        if (!update || update.__rrVehicleSound) return;
        let aboard=false;
        Game_Player.prototype.update=function() {
            const result=update.apply(this,arguments);
            const stock=this._vehicleType==="boat" || this._vehicleType==="ship" || this._vehicleType==="airship";
            if (stock || aboard) Feel.advance(null,null,null);
            aboard=stock;
            return result;
        };
        Game_Player.prototype.update.__rrVehicleSound=true;
    }

    function hookScenes() {
        if (typeof Scene_Map === "undefined" || !Scene_Map.prototype) return;
        const proto = Scene_Map.prototype;
        if (typeof proto.start === "function" && !proto.start.__reactorVehiclesFeel) {
            const start = proto.start;
            proto.start = function() {
                const result = start.apply(this, arguments);
                try {
                    // A map arrived at on foot: no engine. Aboard, the tick starts
                    // it, and a ride the scene begins with is no boarding: the view stays where it is.
                    const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
                    const aboard = !!player && (player._vehicleType === "reactor" || !!stockSoundType(player));
                    state.came = aboard ? player : null;
                    if (engine.on && !aboard) engineOff(0);
                    Feel.prepare();
                } catch (error) { /* the map plays without the engine */ }
                return result;
            };
            proto.start.__reactorVehiclesFeel = true;
        }
        if (typeof proto.terminate === "function" && !proto.terminate.__reactorVehiclesFeel) {
            const terminate = proto.terminate;
            proto.terminate = function() {
                // Another scene opens: the loop stops with the map. From one map scene to the next it plays on.
                const next = typeof SceneManager !== "undefined" && SceneManager ? SceneManager._nextScene : null;
                if (engine.on && !(next && next instanceof Scene_Map)) engineOff(0);
                return terminate.apply(this, arguments);
            };
            proto.terminate.__reactorVehiclesFeel = true;
        }
    }

    hookCamera();
    hookStockSounds();
    hookScenes();
})(typeof window !== "undefined" ? window : globalThis);
