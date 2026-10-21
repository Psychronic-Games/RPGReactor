'use strict';
// A game world for the party's followers and for walks to a tile: the shipped
// managers and objects, the 3D runtime, the physics and the on-map battles in
// one context, as fight-real-world.cjs builds it, with three things that
// helper has no need of:
//   runtime   another folder to read the runtime from (an earlier copy of it)
//   without   parts of reactor_objects.js to leave out (the stock followers)
//   party     as many actors as the test wants walking (the database grows)
// The map is a plain floor, flat (2D) unless `flat: false`; `walls` are tiles
// nobody walks on, as [x, y] pairs or [x1, y1, x2, y2] rectangles. A project's
// data folder (`data`, `mapId`) gives a real map and database instead.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runtimeRoot } = require('./runtime-source.cjs');
const { fightWorld, event, page } = require('./fight-world.cjs');

/** The parts of reactor_objects.js in a runtime folder, in the order its reactor_main.js loads them. */
function objectParts(runtime) {
    const main = fs.readFileSync(path.join(runtime, 'reactor_main.js'), 'utf8');
    return Array.from(main.matchAll(/"js\/([^"/]+\.js)"/g), m => m[1]).filter(name => name === 'reactor_objects.js' || name.startsWith('reactor_objects_'));
}

/** The 3D runtime of a folder: the core, then the extensions it names, then any it does not. */
function files3D(runtime) {
    const core = fs.readFileSync(path.join(runtime, 'reactor_3d.js'), 'utf8');
    const block = core.match(/Reactor3D\.EXTENSIONS = \[([\s\S]*?)\];/);
    const listed = block ? Array.from(block[1].matchAll(/file: "([^"]+)"/g), m => m[1]) : [];
    const onDisk = fs.readdirSync(runtime).filter(name => /^reactor_3d_.*\.js$/.test(name));
    return ['reactor_3d.js', ...listed, ...onDisk.filter(name => !listed.includes(name)).sort()];
}

const actor = id => ({ id, name: 'Actor' + id, nickname: '', profile: '', classId: 1, initialLevel: 5, maxLevel: 99, characterName: 'Actor1', characterIndex: id % 8,
    faceName: '', faceIndex: 0, battlerName: '', equips: [], traits: [], note: '' });

function followerWorld({ runtime = runtimeRoot, without = [], width = 40, height = 30, flat = true, walls = [], party = [1, 2, 3, 4], system = {},
    start = [5, 5], events = [], data = null, mapId = 1, sidecar = null, prepare = null } = {}) {
    const read = name => fs.readFileSync(path.join(runtime, name), 'utf8');
    const ctx = { console, setTimeout, clearTimeout, Bitmap: function() {}, Input: function() {}, performance, TextDecoder };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis; self = globalThis;', ctx);
    const core = read('reactor_core.js');
    vm.runInContext(core.slice(0, core.indexOf('function Utils()')), ctx, { filename: 'reactor_core.js' });
    const feedStart = core.indexOf('function ReactorEvents()'), alias = 'window.$reactorEvents = ReactorEvents;';
    vm.runInContext(core.slice(feedStart, core.indexOf(alias, feedStart) + alias.length), ctx, { filename: 'reactor_core.js' });
    vm.runInContext(read('libs/three.js'), ctx, { filename: 'three.js' });
    vm.runInContext(read('reactor_managers.js'), ctx, { filename: 'reactor_managers.js' });
    for (const part of objectParts(runtime)) if (!without.includes(part)) vm.runInContext(read(part), ctx, { filename: part });
    const io = read('reactor_core_io.js'), jsonEx = io.indexOf('function JsonEx()');
    vm.runInContext(io.slice(jsonEx, io.indexOf('\n//-----', jsonEx)), ctx, { filename: 'jsonex' });
    vm.runInContext(`
        Utils = { extractFileName: name => name, RPGMAKER_NAME: "MZ", isNwjs: () => false, isOptionValid: () => false };
        SceneManager = { _scene: null, push(scene) { this.pushed.push(scene.name || "scene"); }, goto(scene) { this.pushed.push("goto:" + (scene.name || "scene")); }, pushed: [], isSceneChanging: () => false };
        Input = { isPressed: name => !!Input.held[name], isTriggered: () => false, isRepeated: () => false, dir4: 0, dir8: 0, update() {}, keyMapper: {}, gamepadMapper: {}, held: {} };
        TouchInput = { isTriggered: () => false, isPressed: () => false, isCancelled: () => false, x: 0, y: 0 };
        Graphics = { width: 816, height: 624, frameCount: 0, boxWidth: 816, boxHeight: 624 };
        Scene_Battle = function Scene_Battle() {};
        Scene_Gameover = function Scene_Gameover() {};
        for (const name of ["playBgm", "playBgs", "playMe", "playSe", "stopBgm", "stopBgs", "stopMe", "replayBgm", "replayBgs", "playStaticSe"]) AudioManager[name] = () => {};
        AudioManager.saveBgm = () => ({ name: "map", volume: 90, pitch: 100, pan: 0, pos: 0 });
        AudioManager.saveBgs = () => ({ name: "", volume: 90, pitch: 100, pan: 0, pos: 0 });
        SoundManager.playJump = () => {};
    `, ctx);
    for (const file of files3D(runtime)) vm.runInContext(read(file), ctx, { filename: file });
    const R = ctx.Reactor3D;
    if (R.installPropHooks) R.installPropHooks();
    if (R.installEventFootprints) R.installEventFootprints();
    R._databaseSidecar = null;
    R._databaseSidecarState = 'done';
    R._loadGlbTexture = () => null;
    for (const file of ['reactor_controls.js', 'reactor_physics.js', 'reactor_fight.js', 'reactor_fight_flow.js', 'reactor_fight_tactical.js']) {
        if (fs.existsSync(path.join(runtime, file))) vm.runInContext(read(file), ctx, { filename: file });
    }
    if (data) {
        const json = name => JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
        for (const [name, file] of [['$dataActors', 'Actors.json'], ['$dataClasses', 'Classes.json'], ['$dataSkills', 'Skills.json'], ['$dataItems', 'Items.json'], ['$dataWeapons', 'Weapons.json'],
            ['$dataArmors', 'Armors.json'], ['$dataEnemies', 'Enemies.json'], ['$dataTroops', 'Troops.json'], ['$dataStates', 'States.json'], ['$dataAnimations', 'Animations.json'],
            ['$dataTilesets', 'Tilesets.json'], ['$dataCommonEvents', 'CommonEvents.json'], ['$dataMapInfos', 'MapInfos.json']]) ctx[name] = json(file);
        ctx.$dataSystem = Object.assign(json('System.json'), system);
        const id = String(mapId).padStart(3, '0');
        ctx.$dataMap = json('Map' + id + '.json');
        if (fs.existsSync(path.join(data, 'Map' + id + '.r3d.json'))) ctx.$dataMap.reactor3d = json('Map' + id + '.r3d.json');
        for (const e of events) ctx.$dataMap.events[e.id] = e;
    } else {
        const small = fightWorld();
        for (const key of Object.keys(small)) if (key.startsWith('$data') && key !== '$dataMap') ctx[key] = JSON.parse(JSON.stringify(small[key]));
        Object.assign(ctx.$dataSystem, system);
        const size = width * height, tiles = new Array(size * 6).fill(0);
        for (let i = 0; i < size; i++) tiles[i] = 1536;
        // Tile 1 on the top layer is a wall: no way onto it or off it.
        ctx.$dataTilesets[1].flags[1] = 15;
        for (const wall of walls) {
            const [x1, y1, x2 = x1, y2 = y1] = wall;
            for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) tiles[(3 * height + y) * width + x] = 1;
        }
        ctx.$dataMap = { width, height, tilesetId: 1, data: tiles, note: flat ? '' : '<3d>', events: [null], encounterList: [], encounterStep: 30, scrollType: 0,
            parallaxName: '', parallaxLoopX: false, parallaxLoopY: false, parallaxSx: 0, parallaxSy: 0, parallaxShow: false,
            battleback1Name: '', battleback2Name: '', specifyBattleback: false, disableDashing: false, bgm: { name: '' }, bgs: { name: '' }, autoplayBgm: false, autoplayBgs: false };
        if (!flat) ctx.$dataMap.reactor3d = Object.assign({ version: 1, mode: R.MODE_3D, width, height }, sidecar || {});
        for (const e of events) ctx.$dataMap.events[e.id] = e;
    }
    // Everybody who walks is in the database, and the party is as large as it is asked to be.
    for (const id of party) if (!ctx.$dataActors[id]) ctx.$dataActors[id] = actor(id);
    for (let id = 1; id < ctx.$dataActors.length; id++) if (!ctx.$dataActors[id]) ctx.$dataActors[id] = actor(id);
    ctx.$dataSystem.partyMembers = party.slice();
    ctx.$dataSystem.optFollowers = true;
    if (!ctx.$dataSystem.reactorBattle || !ctx.$dataSystem.reactorBattle.partySize) {
        ctx.$dataSystem.reactorBattle = Object.assign({}, ctx.$dataSystem.reactorBattle, { partySize: Math.max(4, party.length) });
    }
    if (prepare) prepare(ctx.$dataMap, ctx);
    if (data) vm.runInContext('for (const list of [$dataActors, $dataClasses, $dataSkills, $dataItems, $dataWeapons, $dataArmors, $dataEnemies, $dataStates]) DataManager.extractArrayMetadata(list); DataManager.extractMetadata($dataMap); for (const e of $dataMap.events) if (e) DataManager.extractMetadata(e);', ctx);
    vm.runInContext(`
        DataManager.createGameObjects();
        $gameParty.setupStartingMembers();
        $gameMap.setup(${mapId});
        $gamePlayer.locate(${start[0]}, ${start[1]});
        $gamePlayer.refresh();
        $gamePlayer.followers().synchronize(${start[0]}, ${start[1]}, 2);
    `, ctx);
    ctx.messages = [];
    /** `frames` frames as Scene_Map runs them; `until()` true ends it early. Returns the frames run. */
    ctx.run = (frames, until) => {
        for (let i = 0; i < frames; i++) {
            if (ctx.$gameMessage.hasText()) { ctx.messages.push(...ctx.$gameMessage._texts); ctx.$gameMessage.clear(); }
            ctx.Graphics.frameCount++;
            ctx.$gameMap.update(true);
            ctx.$gamePlayer.update(true);
            if (until && until()) return i + 1;
        }
        return frames;
    };
    /** Holds a direction (2, 4, 6, 8; 0 lets go) as the arrow keys do, and Dash. */
    ctx.hold = (direction, dash = false) => { ctx.Input.dir4 = direction; ctx.Input.dir8 = direction; ctx.Input.held.shift = !!dash; };
    /** Walks the leader `steps` tiles toward `direction` by the keys, then lets go and lets everybody come to rest. */
    ctx.walk = (direction, steps, dash = false) => {
        const p = ctx.$gamePlayer;
        for (let n = 0; n < steps; n++) {
            const x = p.x, y = p.y;
            ctx.hold(direction, dash);
            ctx.run(200, () => p.x !== x || p.y !== y);
            ctx.run(200, () => !p.isMoving());
        }
        ctx.hold(0);
    };
    /** Runs until nobody of the party moves for `still` frames on end (or `limit` frames have passed). */
    ctx.rest = (limit = 600, still = 40) => {
        let calm = 0;
        const moving = () => ctx.$gamePlayer.isMoving() || ctx.$gamePlayer.followers()._data.some(f => f.isMoving() || f.isMoveRouteForcing());
        return ctx.run(limit, () => { calm = moving() ? 0 : calm + 1; return calm >= still; });
    };
    /** Where the followers that are seen stand, as "x,y" in line order. */
    ctx.places = () => Array.from(ctx.$gamePlayer.followers()._data).filter(f => f.isVisible()).map(f => f.x + ',' + f.y);
    /** The game saved and loaded again, as DataManager does it. */
    ctx.saveAndLoad = () => vm.runInContext(`(function() {
        const contents = JsonEx.parse(JsonEx.stringify(DataManager.makeSaveContents()));
        DataManager.createGameObjects();
        DataManager.extractSaveContents(contents);
    })()`, ctx);
    return ctx;
}

module.exports = { followerWorld, event, page, objectParts };
