'use strict';
// The world of fight-real-world.cjs (the game's objects, the 3D runtime, the physics, the on-map battles) with
// runtime/reactor_vehicles.js loaded as the game loads it, for the tests of a vehicle in the world: the registry,
// the contract with the engine's own vehicle code, getting on and off, and a battle that starts aboard.
//   const w = boardWorld({ vehicles: [bike(31, 10, 10, { yaw: 180 })] });   a 3D floor with one motorcycle on it
//   w.stand(12, 10, 4); w.press('ok'); w.run(1);                            the leader beside it presses OK
// The ride itself (runtime/reactor_vehicles_drive.js) is loaded on top when it is in the tree, as in the game;
// `drive: false` (or VEH_NO_DRIVE=1) leaves it out, and then small stand-ins hold a character whose `_rrFree` is set where it is.
// The motorcycle's model is a box 3.5 long and 0.8 wide whose front is its -x, as the Demo's is
// (`model: [long, tall, wide]` gives it other sides; its longest is drawn 3.5 tiles).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { realWorld, event, page } = require('./fight-real-world.cjs');
const { runtimeRoot } = require('./runtime-source.cjs');

const DEG = Math.PI / 180;
const BIKE_MODEL = 'Vehicles/test-bike';

// A test file makes dozens of worlds, each a context with the whole runtime in it, and V8 by itself lets several
// hundred megabytes of dead ones pile up before it collects. The collector is run every few worlds, so a file's
// peak is what a handful of worlds take. (The flag is switched off again at once: no world gets a `gc` global.)
let collect = null, made = 0;
try {
    const v8 = require('node:v8');
    v8.setFlagsFromString('--expose-gc');
    collect = vm.runInNewContext('gc');
    v8.setFlagsFromString('--no-expose-gc');
} catch (error) { collect = null; }
const WORLDS_BETWEEN_COLLECTIONS = 6;
// (VEH_WORLD_FILE: another copy of the file, for a check that a test fails when a rule is taken out of it.)
const worldFile = process.env.VEH_WORLD_FILE || path.join(runtimeRoot, 'reactor_vehicles.js');
const driveFile = path.join(runtimeRoot, 'reactor_vehicles_drive.js');
const actionFile = path.join(runtimeRoot, 'reactor_fight_action.js');
const mountFile = path.join(runtimeRoot, 'reactor_vehicles_mount.js');
const hasDrive = fs.existsSync(driveFile);

/** The smallest type record that works, with the test model. */
const motorcycle = (extra = {}) => Object.assign({ id: 1, name: 'Motorcycle', kind: 'motorcycle', model: { name: BIKE_MODEL, file: 'test-bike', size: 3.5 } }, extra);

/** A vehicle event as the tools write one: Same as Characters, Action Button, no picture, one empty page. */
const bike = (id, x, y, row = {}, overrides = {}) => event(id, x, y, Object.assign({ name: 'Motorcycle', rrVehicle: Object.assign({ type: 1 }, row),
    pages: [page({ priorityType: 1, trigger: 0 })] }, overrides));

/** Somebody to talk to: an Action Button event that turns switch `switchId` on. */
const talker = (id, x, y, switchId = 5, overrides = {}) => event(id, x, y, Object.assign({ name: 'NPC' + id,
    pages: [page({ priorityType: 1, trigger: 0, list: [{ code: 121, indent: 0, parameters: [switchId, switchId, 0] }, { code: 0, indent: 0, parameters: [] }] })] }, overrides));

/** What holds a character whose `_rrFree` is set where it is, when the ride's own file is left out. */
const STAND_INS = `(function() {
    const updateMove = Game_CharacterBase.prototype.updateMove;
    Game_CharacterBase.prototype.updateMove = function() { if (this._rrFree) return; updateMove.call(this); };
    const isMoving = Game_CharacterBase.prototype.isMoving;
    Game_CharacterBase.prototype.isMoving = function() { if (this._rrFree) return false; return isMoving.call(this); };
    if (typeof ReactorPhysics !== "undefined") {
        const update = ReactorPhysics.update;
        ReactorPhysics.update = function(character) { if (character && character._rrFree) return; return update.call(this, character); };
    }
})();`;

function boardWorld({ vehicles = [], events = [], types = null, drive = process.env.VEH_NO_DRIVE !== '1', action = false, mount = true, model = true, before = null, prepare = null, ...rest } = {}) {
    if (typeof collect === 'function' && ++made % WORLDS_BETWEEN_COLLECTIONS === 0) collect();
    const w = realWorld(Object.assign({ width: 40, height: 30 }, rest, {
        events: events.concat(vehicles),
        prepare(mapData, ctx) {
            // The keys a test holds or presses, read as the game reads them.
            ctx.keys = {};
            ctx.pressed = {};
            ctx.Input.isPressed = name => !!ctx.keys[name];
            ctx.Input.isTriggered = name => !!ctx.pressed[name];
            ctx.Input._gamepadStates = [];
            ctx.buzzes = 0;
            ctx.SoundManager.playBuzzer = () => { ctx.buzzes++; };
            ctx.$dataReactorVehicles = types || [null, motorcycle()];
            const R = ctx.Reactor3D;
            if (model) {
                const template = vm.runInContext(`(function(x, y, z) {
                    const template = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z));
                    mesh.position.y = y / 2;
                    template.add(mesh);
                    template.userData.glbSize = { x, y, z };
                    return template;
                })`, ctx)(...(Array.isArray(model) ? model : [3.5, 1.2, 0.8]));
                R._glbCache[R.modelCacheKey(BIKE_MODEL, '.glb', 'test-bike')] = { promise: Promise.resolve(template), template, failed: false };
                if (!R._sidecarJson) R._sidecarJson = {};
                R._sidecarJson[BIKE_MODEL] = { vehicle: { forward: '-x' } };
            }
            // What a test stands in the game's realm before the vehicle files load (a class the helper's world lacks).
            if (before) before(ctx);
            if (action) vm.runInContext(fs.readFileSync(actionFile, 'utf8'), ctx, { filename: 'reactor_fight_action.js' });
            vm.runInContext(fs.readFileSync(worldFile, 'utf8'), ctx, { filename: 'reactor_vehicles.js' });
            if (drive && hasDrive) vm.runInContext(fs.readFileSync(driveFile, 'utf8'), ctx, { filename: 'reactor_vehicles_drive.js' });
            else vm.runInContext(STAND_INS, ctx, { filename: 'stand-ins' });
            // Fighting from the saddle, as the game loads it after the ride (`mount: false` leaves it out).
            if (mount) vm.runInContext(fs.readFileSync(mountFile, 'utf8'), ctx, { filename: 'reactor_vehicles_mount.js' });
            // The sounds asked for, by name.
            ctx.sounds = [];
            ctx.ReactorVehicles.Feel = { sound(name) { ctx.sounds.push(name); return true; } };
            if (prepare) prepare(mapData, ctx);
        }
    }));
    w.V = w.ReactorVehicles;
    w.hasDrive = drive && hasDrive;
    w.vehicle = id => w.$gameMap.event(id);
    /** The leader on tile (x, y), facing `d`, with the followers on his tile. */
    w.stand = (x, y, d = 2) => {
        const p = w.$gamePlayer;
        vm.runInContext('(function(p, x, y, d) { Game_CharacterBase.prototype.locate.call(p, x, y); p._followers.synchronize(x, y, d); })', w)(p, x, y, d);
        p._direction = d; p._reactorDir8 = d;
        return p;
    };
    /** One press: seen by the next frame only. */
    w.press = name => { w.pressed[name] = true; };
    const run = w.run;
    w.run = (frames, until) => {
        let n = 0;
        const done = run(frames, () => { n++; w.pressed = {}; return until ? until() : false; });
        w.pressed = {};
        return done;
    };
    /** The game saved and loaded again, as DataManager does it. */
    w.saveAndLoad = () => vm.runInContext(`(function() {
        const contents = JsonEx.parse(JsonEx.stringify(DataManager.makeSaveContents()));
        DataManager.createGameObjects();
        DataManager.extractSaveContents(contents);
    })()`, w);
    /** Boards vehicle `id` from where the leader stands and runs the hop to its end. */
    w.board = id => { const ok = w.V.getOn(id); w.run(w.V.HOP + 1); return ok; };
    /**
     * A stand-in for the followers' `rrAboard(on, instant)` until reactor_objects_followers.js has its own: the calls
     * are kept in `w.aboardCalls`, and with `instant` every follower that is under no order is put on the leader's
     * tile by `Game_CharacterBase.prototype.locate`, which is what the vehicle code asks of that function.
     */
    w.stubAboard = () => {
        w.aboardCalls = [];
        vm.runInContext(`(function(record) {
            Game_Followers.prototype.rrAboard = function(on, instant) {
                record(!!on, !!instant);
                this._rrAboard = !!on;
                if (on || !instant) return;
                for (const follower of this._data) {
                    if (follower._rrOrder) continue;
                    Game_CharacterBase.prototype.locate.call(follower, $gamePlayer.x, $gamePlayer.y);
                    follower._reactorGround = $gamePlayer._reactorGround;
                }
            };
        })`, w)((on, instant) => { w.aboardCalls.push([on, instant]); });
    };
    w.hasAboard = typeof w.Game_Followers.prototype.rrAboard === 'function';
    return w;
}

module.exports = { boardWorld, bike, talker, motorcycle, event, page, DEG, BIKE_MODEL, hasDrive };
