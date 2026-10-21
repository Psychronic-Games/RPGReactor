'use strict';
// The game's own objects with the whole 3D world under them, for on-map battle tests that need real models and
// real maps: the shipped managers and objects, three.js, the 3D runtime (so a model's body is measured by the
// engine's own mask), the physics, reactor_fight.js and reactor_fight_tactical.js in one context. The map is a
// plain floor unless a project's data folder is named (`data`, with `mapId`), and the database is the small one of
// fight-world.cjs unless `data` brings its own.
//   const w = realWorld({ events: [...] });            a 3D floor map with those events
//   const w = realWorld({ data: '<folder>', mapId: 5 }); a real map and database
// `prepare(mapData, world)` changes the map before the game reads it.
// `w.model(name, template)` registers a loaded model; `w.glb(file)` builds one from a .glb with the engine's builder.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runtimeSource, runtimeRoot } = require('./runtime-source.cjs');
const { runtime3DFiles } = require('./runtime-3d-source.cjs');
const { fightWorld, event, page } = require('./fight-world.cjs');

const read = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');

function realWorld({ events = [], data = null, mapId = 1, width = 40, height = 30, flat = false, system = {}, sidecar = null, start = [2, 2], party = null, physics = true, seams = true, prepare = null, tactical = null, fightFile = null } = {}) {
    const ctx = { console, setTimeout, clearTimeout, Bitmap: function() {}, Input: function() {}, performance, TextDecoder };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis; self = globalThis;', ctx);
    const core = read('reactor_core.js');
    vm.runInContext(core.slice(0, core.indexOf('function Utils()')), ctx, { filename: 'reactor_core.js' });
    const feedStart = core.indexOf('function ReactorEvents()'), alias = 'window.$reactorEvents = ReactorEvents;';
    vm.runInContext(core.slice(feedStart, core.indexOf(alias, feedStart) + alias.length), ctx, { filename: 'reactor_core.js' });
    vm.runInContext(read('libs/three.js'), ctx, { filename: 'three.js' });
    for (const file of ['reactor_managers.js', 'reactor_objects.js']) vm.runInContext(runtimeSource(file), ctx, { filename: file });
    const io = read('reactor_core_io.js'), jsonEx = io.indexOf('function JsonEx()');
    vm.runInContext(io.slice(jsonEx, io.indexOf('\n//-----', jsonEx)), ctx, { filename: 'jsonex' });
    vm.runInContext(`
        Utils = { extractFileName: name => name, RPGMAKER_NAME: "MZ", isNwjs: () => false, isOptionValid: () => false };
        SceneManager = { _scene: null, push(scene) { this.pushed.push(scene.name || "scene"); }, goto(scene) { this.pushed.push("goto:" + (scene.name || "scene")); }, pushed: [], isSceneChanging: () => false };
        Input = { isPressed: () => false, isTriggered: () => false, isRepeated: () => false, dir4: 0, dir8: 0, update() {}, keyMapper: {}, gamepadMapper: {} };
        TouchInput = { isTriggered: () => false, isPressed: () => false, isCancelled: () => false, x: 0, y: 0 };
        Graphics = { width: 816, height: 624, frameCount: 0, boxWidth: 816, boxHeight: 624 };
        Scene_Battle = function Scene_Battle() {};
        Scene_Gameover = function Scene_Gameover() {};
        for (const name of ["playBgm", "playBgs", "playMe", "playSe", "stopBgm", "stopBgs", "stopMe", "replayBgm", "replayBgs", "playStaticSe"]) AudioManager[name] = () => {};
        AudioManager.saveBgm = () => ({ name: "map", volume: 90, pitch: 100, pan: 0, pos: 0 });
        AudioManager.saveBgs = () => ({ name: "", volume: 90, pitch: 100, pan: 0, pos: 0 });
        SoundManager.playJump = () => {};
    `, ctx);
    // The 3D runtime inside the game's own realm, core then extensions in the order it names them.
    for (const file of runtime3DFiles()) vm.runInContext(read(file), ctx, { filename: file });
    const R = ctx.Reactor3D;
    if (R.installPropHooks) R.installPropHooks();
    if (R.installEventFootprints) R.installEventFootprints();
    R._databaseSidecar = null;
    R._databaseSidecarState = 'done';
    // Nothing is fetched: a model is there when a test registers it.
    R._loadGlbTexture = () => null;
    if (physics) {
        vm.runInContext(read('reactor_controls.js'), ctx, { filename: 'reactor_controls.js' });
        vm.runInContext(read('reactor_physics.js'), ctx, { filename: 'reactor_physics.js' });
    }
    // `fightFile` / `tactical`: another copy of those two files (a measurement against an earlier runtime).
    vm.runInContext(fightFile ? fs.readFileSync(fightFile, 'utf8') : read('reactor_fight.js'), ctx, { filename: 'reactor_fight.js' });
    // How a battle begins by itself (reactor_fight_flow.js), where the files are this runtime's own.
    if (!fightFile && !tactical) vm.runInContext(read('reactor_fight_flow.js'), ctx, { filename: 'reactor_fight_flow.js' });
    vm.runInContext(tactical ? fs.readFileSync(tactical, 'utf8') : read('reactor_fight_tactical.js'), ctx, { filename: 'reactor_fight_tactical.js' });
    // The physics gives the Tactical grid its climbs as the map scene's first frame does in the game (`seams: false` leaves the grid's own rule).
    if (physics && seams && ctx.ReactorPhysics && ctx.ReactorPhysics.installFightSeams) ctx.ReactorPhysics.installFightSeams();
    if (data) {
        const json = name => JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
        for (const [name, file] of [['$dataActors', 'Actors.json'], ['$dataClasses', 'Classes.json'], ['$dataSkills', 'Skills.json'], ['$dataItems', 'Items.json'], ['$dataWeapons', 'Weapons.json'],
            ['$dataArmors', 'Armors.json'], ['$dataEnemies', 'Enemies.json'], ['$dataTroops', 'Troops.json'], ['$dataStates', 'States.json'], ['$dataAnimations', 'Animations.json'],
            ['$dataTilesets', 'Tilesets.json'], ['$dataCommonEvents', 'CommonEvents.json'], ['$dataMapInfos', 'MapInfos.json']]) ctx[name] = json(file);
        ctx.$dataSystem = Object.assign(json('System.json'), system);
        const id = String(mapId).padStart(3, '0');
        ctx.$dataMap = json('Map' + id + '.json');
        if (fs.existsSync(path.join(data, 'Map' + id + '.r3d.json'))) ctx.$dataMap.reactor3d = json('Map' + id + '.r3d.json');
        if (fs.existsSync(path.join(data, 'Database.r3d.json'))) R._databaseSidecar = json('Database.r3d.json');
        for (const e of events) ctx.$dataMap.events[e.id] = e;
        vm.runInContext('for (const list of [$dataActors, $dataClasses, $dataSkills, $dataItems, $dataWeapons, $dataArmors, $dataEnemies, $dataStates]) DataManager.extractArrayMetadata(list); DataManager.extractMetadata($dataMap); for (const e of $dataMap.events) if (e) DataManager.extractMetadata(e);', ctx);
    } else {
        // The small database of fight-world.cjs, read out of a world made for that.
        const small = fightWorld();
        for (const key of Object.keys(small)) if (key.startsWith('$data') && key !== '$dataMap') ctx[key] = JSON.parse(JSON.stringify(small[key]));
        Object.assign(ctx.$dataSystem, system);
        const size = width * height, tiles = new Array(size * 6).fill(0);
        for (let i = 0; i < size; i++) tiles[i] = 1536;
        ctx.$dataMap = { width, height, tilesetId: 1, data: tiles, note: flat ? '' : '<3d>', events: [null], encounterList: [], encounterStep: 30, scrollType: 0,
            parallaxName: '', parallaxLoopX: false, parallaxLoopY: false, parallaxSx: 0, parallaxSy: 0, parallaxShow: false,
            battleback1Name: '', battleback2Name: '', specifyBattleback: false, disableDashing: false, bgm: { name: '' }, bgs: { name: '' }, autoplayBgm: false, autoplayBgs: false };
        if (!flat) ctx.$dataMap.reactor3d = Object.assign({ version: 1, mode: R.MODE_3D, width, height }, sidecar || {});
        else if (sidecar) ctx.$dataMap.reactor3d = sidecar;
        for (const e of events) ctx.$dataMap.events[e.id] = e;
    }
    if (party) ctx.$dataSystem.partyMembers = party;
    // What a test changes of the map before the game reads it (a region cut out, pieces left out).
    if (prepare) prepare(ctx.$dataMap, ctx);
    vm.runInContext(`
        DataManager.createGameObjects();
        $gameParty.setupStartingMembers();
        $gameMap.setup(${mapId});
        $gamePlayer.locate(${start[0]}, ${start[1]});
        $gamePlayer.refresh();
        $gamePlayer.followers().synchronize(${start[0]}, ${start[1]}, 2);
    `, ctx);
    ctx.messages = [];
    ctx.run = (frames, until) => {
        for (let i = 0; i < frames; i++) {
            if (ctx.$gameMessage.hasText()) { ctx.messages.push(...ctx.$gameMessage._texts); ctx.$gameMessage.clear(); }
            ctx.Graphics.frameCount++;
            ctx.$gameMap.update(true);
            ctx.$gamePlayer.update(true);
            if (until && until()) return i;
        }
        return frames;
    };
    /** A model as loaded: its template under the name every spec of it asks for. */
    ctx.model = (name, template, ext = '.glb', file = '') => { R._glbCache[R.modelCacheKey(name, ext, file)] = { promise: Promise.resolve(template), template, failed: false }; return template; };
    /** A .glb built by the engine's own builder (no textures: nothing here draws). */
    ctx.glb = file => {
        const bytes = fs.readFileSync(file);
        const made = vm.runInContext(`(function(bytes) {
            const buffer = new Uint8Array(bytes).buffer, view = new DataView(buffer);
            let offset = 12, json = null, bin = null;
            while (offset + 8 <= view.byteLength) {
                const length = view.getUint32(offset, true), type = view.getUint32(offset + 4, true), at = offset + 8;
                if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(buffer, at, length)));
                else if (type === 0x004E4942) bin = new Uint8Array(buffer, at, length);
                offset = at + length;
            }
            return Reactor3D.buildGlbTemplate(json, bin, "", null);
        })`, ctx)(bytes);
        return made;
    };
    /**
     * A box of `x` by `y` by `z` model units standing on the ground, as a model's template (a model faces along its
     * z); `shift` moves it that way off its own middle (a hull whose own cell is near its tail).
     */
    ctx.boxModel = (x, y, z, shift = 0) => vm.runInContext(`(function(x, y, z, shift) {
        const template = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z));
        mesh.position.y = y / 2;
        mesh.position.z = shift;
        template.add(mesh);
        template.userData.glbSize = { x, y, z };
        return template;
    })`, ctx)(x, y, z, shift);
    return ctx;
}

module.exports = { realWorld, event, page };
