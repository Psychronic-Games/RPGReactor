'use strict';
// A small game world for on-map battle tests: the shipped managers, objects
// and reactor_fight.js in a fresh context, with a tiny database and a walkable
// map. `run(frames)` steps it as Scene_Map does; messages close themselves
// and are kept in `messages`.
//
// The battle's files are loaded in the order the game boots them
// (runtime/reactor_main.js):
//   reactor_controls.js        the names of keys and buttons only (`controls: true`: the whole file)
//   reactor_fight_look.js      `look: true`
//   reactor_fight.js           always
//   reactor_fight_flow.js      always
//   reactor_fight_tactical.js  `tactical: true`
//   reactor_fight_action.js    `action: true`
//   reactor_fight_menu.js      with the Tactical driver, which it stands on
//   reactor_fight_classic.js   `classic: true`
//   reactor_vehicles.js, reactor_vehicles_drive.js, reactor_vehicles_feel.js, reactor_vehicles_hints.js, reactor_vehicles_mount.js   `vehicles: true`
// `prepare(ctx)` runs just before them, for what a file must find when it loads (a map scene, windows).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runtimeSource, runtimeRoot } = require('./runtime-source.cjs');

/** reactor_core.js's extensions to the built-ins (clamp, format, remove…), up to Utils. */
function extensionsSource() {
    const core = fs.readFileSync(path.join(runtimeRoot, 'reactor_core.js'), 'utf8');
    return core.slice(0, core.indexOf('function Utils()'));
}

/** The runtime events feed, verbatim from reactor_core.js. */
function eventsSource() {
    const core = fs.readFileSync(path.join(runtimeRoot, 'reactor_core.js'), 'utf8');
    const start = core.indexOf('function ReactorEvents()');
    const alias = 'window.$reactorEvents = ReactorEvents;';
    return core.slice(start, core.indexOf(alias, start) + alias.length);
}

function jsonExSource() {
    const io = fs.readFileSync(path.join(runtimeRoot, 'reactor_core_io.js'), 'utf8');
    const start = io.indexOf('function JsonEx()');
    const end = io.indexOf('\n//-----', start);
    return io.slice(start, end);
}

/** One of the battle's files (runtime/reactor_fight*.js, reactor_controls.js), as the game boots it. */
const battleSource = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');

// What the controls file names: keys and buttons as a player knows them, and the device used last.
const CONTROL_NAMES = ['KEY_NAMES', 'BUTTON_NAMES', 'keyName', 'buttonName', 'keyRank', 'labelFor', 'device', 'noteDevice', 'onDevice'];

// The vehicle game files, in the order the game boots them: the last of the engine's own files (runtime/reactor_main.js).
const VEHICLE_FILES = ['reactor_vehicles.js', 'reactor_vehicles_drive.js', 'reactor_vehicles_feel.js', 'reactor_vehicles_hints.js', 'reactor_vehicles_mount.js'];

/**
 * The names of keys and buttons, which a battle's hint line and menu show. This world's Input has no key maps to
 * switch, so the rest of the controls file (the project's keys, Jump, a battle's own bindings) is left out unless
 * `whole`: a test of those loads the file itself, or asks for `controls: true` and gives Input its maps.
 */
function loadControls(ctx, whole) {
    vm.runInContext(battleSource('reactor_controls.js'), ctx, { filename: 'reactor_controls.js' });
    if (whole) return;
    vm.runInContext(`ReactorControls = (names => { const own = {}; for (const name of names) own[name] = ReactorControls[name]; return own; })(${JSON.stringify(CONTROL_NAMES)});`, ctx);
}

const filled = value => Array.from({ length: 100 }, () => value);
const page = (overrides = {}) => Object.assign({
    conditions: { actorId: 1, actorValid: false, itemId: 1, itemValid: false, selfSwitchCh: 'A', selfSwitchValid: false,
        switch1Id: 1, switch1Valid: false, switch2Id: 1, switch2Valid: false, variableId: 1, variableValid: false, variableValue: 0 },
    directionFix: false, image: { tileId: 0, characterName: '', characterIndex: 0, direction: 2, pattern: 1 },
    list: [{ code: 0, indent: 0, parameters: [] }], moveFrequency: 3,
    moveRoute: { list: [{ code: 0, parameters: [] }], repeat: true, skippable: false, wait: false },
    moveSpeed: 4, moveType: 0, priorityType: 1, stepAnime: false, through: false, trigger: 0, walkAnime: true
}, overrides);
const event = (id, x, y, overrides = {}) => Object.assign({ id, name: 'EV' + id, note: '', x, y, pages: [page()] }, overrides);

function database() {
    const hit = [{ code: 22, dataId: 0, value: 1 }];
    const skill = (id, name, extra = {}) => Object.assign({
        id, name, animationId: 0, damage: { critical: false, elementId: -1, formula: 'a.atk * 4 - b.def * 2', type: 1, variance: 0 },
        description: '', effects: [], hitType: 1, iconIndex: 0, message1: '', message2: '', mpCost: 0, note: '', occasion: 1,
        repeats: 1, requiredWtypeId1: 0, requiredWtypeId2: 0, scope: 1, speed: 0, stypeId: 0, successRate: 100, tpCost: 0, tpGain: 0, messageType: 1
    }, extra);
    return {
        $dataActors: [null,
            { id: 1, name: 'Ren', nickname: '', profile: '', classId: 1, initialLevel: 5, maxLevel: 99, characterName: 'Actor1', characterIndex: 0, faceName: '', faceIndex: 0, battlerName: '', equips: [], traits: [], note: '' },
            { id: 2, name: 'Mira', nickname: '', profile: '', classId: 1, initialLevel: 5, maxLevel: 99, characterName: 'Actor1', characterIndex: 1, faceName: '', faceIndex: 0, battlerName: '', equips: [], traits: [], note: '' },
            { id: 3, name: 'Ally', nickname: '', profile: '', classId: 1, initialLevel: 5, maxLevel: 99, characterName: 'Actor1', characterIndex: 2, faceName: '', faceIndex: 0, battlerName: '', equips: [], traits: [], note: '' }],
        $dataClasses: [null, { id: 1, name: 'Fighter', expParams: [30, 20, 30, 30], learnings: [], note: '', traits: hit.concat([{ code: 23, dataId: 0, value: 1 }]),
            params: [filled(400), filled(50), filled(60), filled(10), filled(10), filled(10), filled(20), filled(10)] }],
        $dataSkills: [null, skill(1, 'Attack', { animationId: -1 }), skill(2, 'Guard', { scope: 11, damage: { type: 0, formula: '0', variance: 0, critical: false, elementId: -1 } })],
        $dataItems: [null, { id: 1, name: 'Potion', occasion: 0, scope: 7, effects: [], damage: { type: 0 }, consumable: true, itypeId: 1, price: 10, note: '', iconIndex: 0, animationId: 0, hitType: 0, repeats: 1, speed: 0, successRate: 100, tpGain: 0 },
            { id: 2, name: 'Bomb', occasion: 1, scope: 1, effects: [], damage: { type: 1, formula: '50', variance: 0, critical: false, elementId: -1 }, consumable: true, itypeId: 1, price: 10, note: '', iconIndex: 0, animationId: 0, hitType: 0, repeats: 1, speed: 0, successRate: 100, tpGain: 0 }],
        $dataWeapons: [null], $dataArmors: [null],
        $dataEnemies: [null,
            { id: 1, name: 'Slime', battlerName: 'Slime', battlerHue: 0, params: [60, 0, 30, 5, 5, 5, 10, 5], exp: 10, gold: 7,
                dropItems: [{ kind: 1, dataId: 1, denominator: 1 }, { kind: 0, dataId: 0, denominator: 1 }, { kind: 0, dataId: 0, denominator: 1 }],
                actions: [{ skillId: 1, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }], traits: hit, note: '' },
            { id: 2, name: 'Bat', battlerName: 'Bat', battlerHue: 0, params: [40, 0, 25, 5, 5, 5, 30, 5], exp: 5, gold: 3,
                dropItems: [], actions: [{ skillId: 1, rating: 5, conditionType: 0, conditionParam1: 0, conditionParam2: 0 }], traits: hit, note: '' }],
        $dataTroops: [null,
            { id: 1, name: 'Slimes', members: [{ enemyId: 1, x: 0, y: 0, hidden: false }, { enemyId: 1, x: 0, y: 0, hidden: false }], pages: [] },
            { id: 2, name: 'Tactical troop', members: [{ enemyId: 2, x: 0, y: 0, hidden: false }], pages: [], reactorBattle: { mode: 'tactical' } }],
        $dataStates: [null, { id: 1, name: 'Knockout', restriction: 4, priority: 100, traits: [], removeAtBattleEnd: false, autoRemovalTiming: 0,
            minTurns: 1, maxTurns: 1, removeByDamage: false, chanceByDamage: 100, removeByRestriction: false, removeByWalking: false, stepsToRemove: 100, motion: 3, overlay: 0, note: '', iconIndex: 0, message1: '', message2: '', message3: '', message4: '' }],
        $dataAnimations: [null], $dataCommonEvents: [null],
        $dataTilesets: [null, { id: 1, mode: 1, name: '', note: '', tilesetNames: ['', '', '', '', '', '', '', '', ''], flags: (() => { const f = new Array(8192).fill(0); f[0] = 16; return f; })() }],
        $dataSystem: {
            gameTitle: 'Test', versionId: 1, locale: 'en_US', partyMembers: [1, 2], currencyUnit: 'G', windowTone: [0, 0, 0, 0], attackMotions: [],
            elements: ['', 'Physical'], equipTypes: ['', 'Weapon'], skillTypes: [''], weaponTypes: [''], armorTypes: [''], switches: ['', 'Won', 'Escaped', 'Lost', 'Spare', 'Entered', 'Spare', 'Spare', 'Spare', 'Spare'], variables: ['', 'Result', 'Spare', 'Spare', 'Spare', 'Spare'],
            magicSkills: [], optFollowers: true, optDisplayTp: true, optExtraExp: false, optFloorDeath: false, optSlipDeath: false, optSideView: false, optTransparent: false,
            battleBgm: { name: '', pan: 0, pitch: 100, volume: 90 }, victoryMe: { name: '', pan: 0, pitch: 100, volume: 90 }, defeatMe: { name: '', pan: 0, pitch: 100, volume: 90 },
            gameoverMe: { name: '', pan: 0, pitch: 100, volume: 90 }, titleBgm: { name: '' }, sounds: Array.from({ length: 24 }, () => ({ name: '', pan: 0, pitch: 100, volume: 90 })),
            boat: { characterName: '', characterIndex: 0, bgm: { name: '' }, startMapId: 0, startX: 0, startY: 0 },
            ship: { characterName: '', characterIndex: 0, bgm: { name: '' }, startMapId: 0, startX: 0, startY: 0 },
            airship: { characterName: '', characterIndex: 0, bgm: { name: '' }, startMapId: 0, startX: 0, startY: 0 },
            startMapId: 1, startX: 2, startY: 2, testBattlers: [], testTroopId: 1, battleSystem: 0, menuCommands: [true, true, true, true, true, true],
            terms: {
                basic: ['Level', 'Lv', 'HP', 'HP', 'MP', 'MP', 'TP', 'TP', 'EXP', 'EXP'],
                commands: [], params: [],
                messages: { victory: '%1 was victorious!', defeat: '%1 was defeated.', escapeStart: '%1 has started to escape!', obtainExp: '%1 %2 received!',
                    obtainGold: '%1\\G found!', obtainItem: '%1 found!', levelUp: '%1 is now %2 %3!', obtainSkill: '%1 learned!' }
            },
            advanced: { screenWidth: 816, screenHeight: 624, uiAreaWidth: 816, uiAreaHeight: 624, gameId: 1 }
        }
    };
}

/**
 * The world. `map` events are added to a 20×15 floor map; `system` patches
 * $dataSystem. Returns the context with `run`, `messages` and `pushed` (the
 * scenes SceneManager was asked for).
 */
function fightWorld({ events = [], system = {}, mapNote = '', mapSidecar = null, tactical = false, action = false, controls = false, look = false, classic = false, vehicles = false, prepare = null } = {}) {
    // The context's own built-ins, so the engine's prototype extensions stay inside it.
    const ctx = { console, setTimeout, clearTimeout, Bitmap: function() {}, Input: function() {} };
    vm.createContext(ctx);
    vm.runInContext('window = globalThis;', ctx);
    vm.runInContext(extensionsSource(), ctx, { filename: 'reactor_core.js' });
    vm.runInContext(eventsSource(), ctx, { filename: 'reactor_core.js' });
    for (const file of ['reactor_managers.js', 'reactor_objects.js']) vm.runInContext(runtimeSource(file), ctx, { filename: file });
    vm.runInContext(jsonExSource(), ctx, { filename: 'jsonex' });
    const pushed = [];
    vm.runInContext(`
        Utils = { extractFileName: name => name, RPGMAKER_NAME: "MZ", isNwjs: () => false, isOptionValid: () => false };
        SceneManager = { _scene: null, push(scene) { this.pushed.push(scene.name || "scene"); }, goto(scene) { this.pushed.push("goto:" + (scene.name || "scene")); }, pushed: [], isSceneChanging: () => false };
        Input = { isPressed: () => false, isTriggered: () => false, isRepeated: () => false, dir4: 0, dir8: 0, update() {} };
        TouchInput = { isTriggered: () => false, isPressed: () => false, isCancelled: () => false, x: 0, y: 0 };
        Graphics = { width: 816, height: 624, frameCount: 0, boxWidth: 816, boxHeight: 624 };
        Scene_Battle = function Scene_Battle() {};
        Scene_Gameover = function Scene_Gameover() {};
        for (const name of ["playBgm", "playBgs", "playMe", "playSe", "stopBgm", "stopBgs", "stopMe", "replayBgm", "replayBgs", "playStaticSe"]) AudioManager[name] = () => {};
        AudioManager.saveBgm = () => ({ name: "map", volume: 90, pitch: 100, pan: 0, pos: 0 });
        AudioManager.saveBgs = () => ({ name: "", volume: 90, pitch: 100, pan: 0, pos: 0 });
    `, ctx);
    // The battle's files in the order the game boots them (runtime/reactor_main.js).
    const load = name => vm.runInContext(battleSource(name), ctx, { filename: name });
    if (prepare) prepare(ctx);
    loadControls(ctx, controls);
    // What a unit stands as (the look rule), for the tests that ask for it.
    if (look) load('reactor_fight_look.js');
    load('reactor_fight.js');
    // How a battle begins by itself: a map's own start, the Test battle.
    load('reactor_fight_flow.js');
    // The tactical driver (the player's controls, ranges, AI) for the tests that ask for it.
    if (tactical) load('reactor_fight_tactical.js');
    // The action driver (real-time battles) likewise.
    if (action) load('reactor_fight_action.js');
    // The battle menu stands on the tactical driver.
    if (tactical) load('reactor_fight_menu.js');
    // Placed enemies on a Classic map (the battle screen), for the tests that ask for it.
    if (classic) load('reactor_fight_classic.js');
    // The vehicle game files, after every battle file as the game boots them, for the tests that ask for them.
    if (vehicles) for (const name of VEHICLE_FILES) load(name);
    Object.assign(ctx, database());
    Object.assign(ctx.$dataSystem, system);
    const width = 20, height = 15, size = width * height;
    const data = new Array(size * 6).fill(0);
    for (let i = 0; i < size; i++) data[i] = 1536;
    ctx.$dataMap = { width, height, tilesetId: 1, data, note: mapNote, events: [null], encounterList: [], encounterStep: 30, scrollType: 0,
        parallaxName: '', parallaxLoopX: false, parallaxLoopY: false, parallaxSx: 0, parallaxSy: 0, parallaxShow: false,
        battleback1Name: '', battleback2Name: '', specifyBattleback: false, disableDashing: false, bgm: { name: '' }, bgs: { name: '' }, autoplayBgm: false, autoplayBgs: false };
    if (mapSidecar) ctx.$dataMap.reactor3d = mapSidecar;
    for (const e of events) ctx.$dataMap.events[e.id] = e;
    vm.runInContext(`
        DataManager.createGameObjects();
        $gameParty.setupStartingMembers();
        $gameMap.setup(1);
        $gamePlayer.locate(2, 2);
        $gamePlayer.refresh();
        $gamePlayer.followers().synchronize(2, 2, 2);
    `, ctx);
    ctx.pushed = ctx.SceneManager.pushed;
    ctx.messages = [];
    ctx.run = (frames, until) => {
        for (let i = 0; i < frames; i++) {
            if (ctx.$gameMessage.hasText()) { ctx.messages.push(...ctx.$gameMessage._texts); ctx.$gameMessage.clear(); }
            ctx.$gameMap.update(true);
            ctx.$gamePlayer.update(true);
            if (until && until()) return i;
        }
        return frames;
    };
    return ctx;
}

module.exports = { fightWorld, event, page, VEHICLE_FILES };
