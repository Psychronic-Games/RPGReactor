'use strict';
// Where the pieces of a battle on the map live, and the seams between them (runtime/reactor_fight.js,
// reactor_fight_flow.js, reactor_fight_menu.js, reactor_controls.js):
// - the files boot in one order, every list names them, and none needs a later one to load;
// - the map's own start and the Test battle are the flow file's; the battle menu is its own file; the words, the
//   goal as text and the notice are the battle core's, in every mode; the names of keys are the game's controls';
// - a battle's start and its end are their steps in order, each one a function another can stand in for;
// - one answer to "is this event a unit now"; the results of a won battle hold its end until they are read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { fightWorld, event, page } = require('./helpers/fight-world.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const runtimeRoot = path.join(repoRoot, 'runtime');
const source = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');
const load = (w, name) => vm.runInContext(source(name), w, { filename: name });
const plain = value => JSON.parse(JSON.stringify(value));
const unit = (id, x, y, text, extra = {}) => event(id, x, y, Object.assign({ note: `<unit: ${text}>` }, extra));
const row = (id, x, y, rrUnit, extra = {}) => event(id, x, y, Object.assign({ rrUnit }, extra));
const scripts = () => Array.from(source('reactor_main.js').match(/const\s+scriptUrls\s*=\s*\[[\s\S]*?\];/)[0].matchAll(/"js\/([^"]+)"/g), m => m[1]);

/** Stand-in windows and a map scene, for the files that hang their own on them as they load. */
const STAND_INS = `
    Rectangle = function(x, y, width, height) { this.x = x; this.y = y; this.width = width; this.height = height; };
    Window_Command = function() { this.initialize(...arguments); };
    Object.assign(Window_Command.prototype, {
        initialize(rect) { this._list = []; this._handlers = {}; this._index = -1; this.active = false; this.openness = 255; this.visible = true; this.padding = 12; this.innerWidth = 300; this.innerHeight = 300; this.move(rect.x, rect.y, rect.width, rect.height); this.refresh(); },
        clearCommandList() { this._list = []; }, makeCommandList() {},
        addCommand(name, symbol, enabled = true, ext = null) { this._list.push({ name, symbol, enabled, ext }); },
        maxItems() { return this._list.length; }, itemHeight() { return 44; }, lineHeight() { return 36; },
        refresh() { this.clearCommandList(); this.makeCommandList(); },
        select(index) { this._index = index; }, index() { return this._index; }, row() { return this._index; },
        currentData() { return this._list[this._index] || null; },
        currentSymbol() { const data = this.currentData(); return data ? data.symbol : null; },
        currentExt() { const data = this.currentData(); return data ? data.ext : null; },
        findSymbol(symbol) { return this._list.findIndex(entry => entry.symbol === symbol); },
        isCommandEnabled(index) { return this._list[index].enabled; },
        setHandler(symbol, method) { this._handlers[symbol] = method; },
        activate() { this.active = true; }, deactivate() { this.active = false; },
        open() { this.openness = 255; }, close() { this.openness = 0; }, show() { this.visible = true; }, hide() { this.visible = false; },
        move(x, y, width, height) { this.x = x; this.y = y; this.width = width; this.height = height; },
        createContents() {}, itemRect() { return { x: 0, y: 0, width: 0, height: 0 }; }, overallHeight() { return this.maxItems() * this.itemHeight(); }, drawAllItems() {},
        setActor() {}, item() { return null; }
    });
    Window_SkillList = function() { this.initialize(...arguments); };
    Window_SkillList.prototype = Object.create(Window_Command.prototype);
    Window_ItemList = function() { this.initialize(...arguments); };
    Window_ItemList.prototype = Object.create(Window_Command.prototype);
    Scene_Base = function() {};
    Scene_Base.prototype.start = function() {};
    Scene_Map = function() { this.windows = []; this.menuCalls = 0; this.menuCalling = false; };
    Scene_Map.prototype = Object.create(Scene_Base.prototype);
    Object.assign(Scene_Map.prototype, {
        update() {}, terminate() {}, start() {}, isActive() { return true; }, isFastForward() { return false; }, callMenu() { this.menuCalls++; },
        isMenuCalled() { return Input.isTriggered("menu"); }, addWindow(window) { this.windows.push(window); }, calcWindowHeight(rows) { return rows * 44 + 24; }
    });
    Scene_Boot = function() {};
    Scene_Boot.prototype = Object.create(Scene_Base.prototype);
    Scene_Boot.prototype.start = function() { this.stockStart = true; };
    Scene_Boot.prototype.resizeScreen = function() {};
    Scene_Boot.prototype.updateDocumentTitle = function() {};
    Scene_GameEnd = function Scene_GameEnd() {};
    Scene_Options = function Scene_Options() {};
`;
const staged = (options = {}) => fightWorld(Object.assign({ prepare: ctx => vm.runInContext(STAND_INS, ctx) }, options));

//-----------------------------------------------------------------------------
// The files.

test('the battle\'s files boot in one order and every list names them', () => {
    const list = scripts();
    const at = name => list.indexOf(name);
    for (const name of ['reactor_controls.js', 'reactor_fight_look.js', 'reactor_fight.js', 'reactor_fight_flow.js', 'reactor_fight_tactical.js', 'reactor_fight_stage.js',
        'reactor_fight_camera.js', 'reactor_fight_action.js', 'reactor_fight_menu.js', 'reactor_fight_classic.js']) {
        assert.ok(at(name) >= 0, `${name} is booted`);
        assert.ok(fs.existsSync(path.join(runtimeRoot, name)), `${name} exists`);
    }
    assert.ok(at('reactor_controls.js') < at('reactor_fight.js'), 'the names of keys before the battle that shows them');
    assert.ok(at('reactor_fight_look.js') < at('reactor_fight.js'));
    assert.equal(at('reactor_fight_flow.js'), at('reactor_fight.js') + 1, 'how a battle begins, directly after the battle core');
    assert.ok(at('reactor_fight_flow.js') < at('reactor_fight_tactical.js'));
    assert.ok(at('reactor_fight_tactical.js') < at('reactor_fight_action.js'));
    assert.ok(at('reactor_fight_action.js') < at('reactor_fight_menu.js'), 'the battle menu after both drivers');
    assert.ok(at('reactor_fight.js') < at('reactor_fight_classic.js') && at('reactor_fight_classic.js') < at('reactor_plugins.js'));
    assert.ok(at('reactor_fight_menu.js') < at('reactor_plugins.js'));
    for (const file of ['build.js', 'build-worker.js', 'dist-editor-worker.js']) {
        const text = fs.readFileSync(path.join(repoRoot, 'editor', 'build-scripts', file), 'utf8');
        for (const name of ['reactor_fight_look.js', 'reactor_fight_flow.js', 'reactor_fight_menu.js', 'reactor_fight_classic.js']) assert.ok(text.includes(`'${name}'`), `${file} preflights ${name}`);
    }
});

test('each shared piece of a battle is defined in one file, the one that owns it', () => {
    const files = fs.readdirSync(runtimeRoot).filter(name => /^reactor_.*\.js$/.test(name));
    const where = pattern => files.filter(name => pattern.test(source(name)));
    const owners = [
        [/^\s*F\.term = function/m, 'reactor_fight.js'], [/^\s*F\.TERMS = \{/m, 'reactor_fight.js'],
        [/Game_Fight\.prototype\.goalText = function/, 'reactor_fight.js'], [/^\s*Game_Fight\.prototype\.announce = function/m, 'reactor_fight.js'],
        [/^\s*Game_Fight\.prototype\.notice = function/m, 'reactor_fight.js'], [/F\.NOTICE_FRAMES = /, 'reactor_fight.js'],
        [/F\.eventUnit = function/, 'reactor_fight.js'], [/F\.showResults = function/, 'reactor_fight.js'],
        [/F\.triggerRange = function/, 'reactor_fight_flow.js'], [/F\.updateTrigger = function/, 'reactor_fight_flow.js'], [/F\.bootRequest = function/, 'reactor_fight_flow.js'],
        [/function Window_FightMenu\(/, 'reactor_fight_menu.js'], [/F\.menuBlocked = function/, 'reactor_fight_menu.js'], [/W\.openMenu = function/, 'reactor_fight_menu.js'],
        [/Scene_Map\.prototype\.callMenu = function/, 'reactor_fight_menu.js'],
        [/ReactorControls\.KEY_NAMES = /, 'reactor_controls.js'], [/ReactorControls\.labelFor = function/, 'reactor_controls.js']
    ];
    for (const [pattern, owner] of owners) {
        const found = where(pattern).filter(name => name !== 'reactor_scenes.js');
        assert.deepEqual(found, [owner], String(pattern));
    }
    // The Tactical driver keeps none of them, and no table of key names of its own.
    const tactical = source('reactor_fight_tactical.js');
    for (const gone of [/Scene_Boot\.prototype\.start = /, /Game_Map\.prototype\.update = /, /Scene_Map\.prototype\.isMenuCalled = /, /KEY_NAMES|BUTTON_NAMES/, /Input\._onKeyDown = /, /TouchInput\._onMouseDown = /, /_tac\.notice|tac\(\)\.notice/]) {
        assert.doesNotMatch(tactical, gone);
    }
    // What the menu's file takes of the driver is exported for it.
    for (const name of ['F.frameNow = frameNow;', 'F.sound = sound;', 'const EMPTY = F.EMPTY = [];']) assert.ok(tactical.includes(name), name);
});

test('no battle file needs a later one to load, and each part works with only what boots before it', () => {
    // The core and how a battle begins, with neither driver: the words, the goal, the notice, a map's own start.
    let w = fightWorld({ events: [unit(1, 4, 2, 'enemy 1')], mapNote: '<battle trigger: 5>' });
    let F = w.ReactorFight;
    assert.equal(F.Windows, undefined, 'no driver in this world');
    assert.equal(F.term('wait'), 'Wait');
    for (const key of ['wait', 'goalDefeatAll', 'goalChanged', 'menuResume', 'endTurnAsk', 'tipPick', 'whyNoReach', 'ctlOk', 'keyArrows']) assert.equal(typeof F.TERMS[key], 'string', `the whole table: ${key}`);
    assert.equal(F.NOTICE_FRAMES, 150);
    assert.equal(F.triggerRange(w.$dataMap), 5);
    assert.equal(typeof F.bootRequest, 'function');
    // Sight is the Tactical grid's: with no grid loaded nothing is seen, so the map's start begins nothing and throws nothing.
    w.Graphics.frameCount = 12;
    assert.doesNotThrow(() => w.run(3));
    assert.equal(w.$gameFight.isActive(), false);
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    assert.equal(w.$gameFight.goalText(), 'Defeat all enemies');
    assert.equal(w.$gameFight.objectiveText(), 'Enemies left: 1');
    assert.equal(w.$gameFight.term('goalTurn'), 'Turn %1');
    // The battle menu's file without the driver it stands on does nothing.
    assert.doesNotThrow(() => load(w, 'reactor_fight_menu.js'));
    assert.equal(F.menuBlocked, undefined);
    // The Tactical driver without the battle menu's file: a unit's turn runs, its windows open, nothing asks for the menu.
    w = staged({ events: [unit(1, 6, 2, 'enemy 1')] });
    load(w, 'reactor_fight_tactical.js');
    F = w.ReactorFight;
    assert.equal(F.Windows.openMenu, undefined);
    assert.equal(w.Window_FightMenu, undefined);
    w.scene = new w.Scene_Map();
    w.SceneManager._scene = w.scene;
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.run(600, () => w.$gameFight.awaitsPlayer());
    assert.ok(w.$gameFight.commandSelectUnit(w.$gameFight._units[0].id));
    w.run(1);
    assert.ok(w.$gameFight.commandMoveTo(3, 2));
    w.run(200, () => w.$gameFight.tacticalState() === 'command');
    assert.doesNotThrow(() => w.scene.update());
    assert.ok(w.scene._fightCommandWindow && w.scene._fightCommandWindow.active, 'the unit\'s own menu is up');
});

//-----------------------------------------------------------------------------
// How a battle begins (reactor_fight_flow.js).

// The map's own start, who it takes and the hold after a battle: fight-flow.test.cjs.

test('the Test battle is the flow file\'s: `fight` on the launch line starts a battle on the first idle frames of the map, and `fightat` skips the title', () => {
    const w = staged();
    const F = w.ReactorFight;
    assert.equal(F.Grid, undefined, 'neither driver is loaded: the boot is the flow file\'s own');
    w.location = { search: '?test&fight&fightmode=action' };
    assert.deepEqual(plain(F.bootRequest()), { at: null, mode: 'action' });
    const scene = w.scene = new w.Scene_Map();
    w.SceneManager._scene = scene;
    scene.start();
    assert.equal(F._bootFight, 1);
    scene.update();
    assert.equal(w.$gameFight.isActive(), false, 'one idle frame first');
    scene.update();
    assert.equal(w.$gameFight.isActive(), true);
    assert.equal(w.$gameFight.mode(), 'action', 'the mode the launch line names');
    assert.equal(w.$gameFight._options.canEscape && w.$gameFight._options.canLose, true);
    assert.equal(w.$gameFight.units({ team: 'enemy' }).length, 2, 'the test troop, spawned round the party');
    // With a place named the boot scene goes straight to the map.
    const v = staged();
    v.location = { search: '?test&fight&fightat=1,7,9' };
    v.DataManager.setupNewGame = () => { v.newGames = (v.newGames || 0) + 1; };
    v.SoundManager.preloadImportantSounds = () => {};
    const boot = new v.Scene_Boot();
    boot.start();
    assert.equal(boot.stockStart, undefined, 'the title is skipped');
    assert.equal(v.newGames, 1);
    assert.deepEqual([v.$gamePlayer._newMapId, v.$gamePlayer._newX, v.$gamePlayer._newY], [1, 7, 9]);
    assert.deepEqual(Array.from(v.pushed), ['goto:Scene_Map']);
    // Without the flag the boot scene is the stock one.
    const plainWorld = staged();
    const stock = new plainWorld.Scene_Boot();
    stock.start();
    assert.equal(stock.stockStart, true);
});

test('the Test battle stands down for a battle of the map\'s own, and waits while the map is busy', () => {
    const booted = () => {
        const w = staged();
        w.location = { search: '?test&fight' };
        w.scene = new w.Scene_Map();
        w.SceneManager._scene = w.scene;
        w.scene.start();
        assert.equal(w.ReactorFight._bootFight, 1);
        return w;
    };
    const quit = w => { w.$gameFight._ending = { result: w.ReactorFight.ESCAPE, shown: true, quiet: true }; w.$gameFight.finish(); };
    // The map's own battle is on when the scene first looks (an autorun Start Battle on Map): the test's start is given up at once…
    let w = booted();
    assert.ok(w.$gameFight.start({ mode: 'tactical' }) > 0);
    w.scene.update();
    assert.equal(w.ReactorFight._bootFight, 0, 'given up on the first frame');
    // …and stays given up when that battle is over.
    quit(w);
    for (let i = 0; i < 5; i++) w.scene.update();
    assert.deepEqual([w.$gameFight.isActive(), w.$gameFight.serial()], [false, 1], 'the only battle was the map\'s');
    // A battle of the map's own that came and went before the scene's first frame: the same.
    w = booted();
    assert.ok(w.$gameFight.start({ mode: 'action' }) > 0);
    quit(w);
    for (let i = 0; i < 5; i++) w.scene.update();
    assert.deepEqual([w.$gameFight.isActive(), w.$gameFight.serial(), w.ReactorFight._bootFight], [false, 1, 0]);
    // While an event runs, a message is open, the party is on its way to another map or the scene is not the
    // active one, it waits, and its idle frame is counted again afterwards.
    w = booted();
    const busy = [
        ['an event runs', () => { w.$gameMap.isEventRunning = () => true; }, () => { delete w.$gameMap.isEventRunning; }],
        ['a message is open', () => w.$gameMessage.add('A line.'), () => w.$gameMessage.clear()],
        ['a transfer is pending', () => w.$gamePlayer.reserveTransfer(1, 3, 3, 2, 0), () => w.$gamePlayer.clearTransferInfo()],
        ['the scene is not the active one', () => { w.scene.isActive = () => false; }, () => { delete w.scene.isActive; }]
    ];
    for (const [label, on, off] of busy) {
        // An idle frame is behind it: one more would start the battle.
        w.scene.update();
        assert.equal(w.ReactorFight._bootFight, 2, label);
        on();
        for (let i = 0; i < 4; i++) w.scene.update();
        assert.equal(w.$gameFight.isActive(), false, label);
        assert.equal(w.ReactorFight._bootFight, 1, label + ': the idle frame is counted again');
        off();
    }
    w.scene.update();
    assert.equal(w.$gameFight.isActive(), false, 'one idle frame first');
    w.scene.update();
    assert.equal(w.$gameFight.isActive(), true);
    assert.equal(w.$gameFight.mode(), 'tactical', 'a Classic game gets Tactical');
    assert.equal(w.$gameFight.serial(), 1);
});

//-----------------------------------------------------------------------------
// The battle menu (reactor_fight_menu.js).

test('the battle menu is its own file, bound to the Tactical driver it stands on: Cancel opens it, never the game\'s menu', () => {
    const w = staged({ tactical: true, events: [unit(1, 15, 8, 'enemy 1')] });
    const F = w.ReactorFight, W = F.Windows;
    assert.equal(typeof w.Window_FightMenu, 'function');
    for (const name of ['controlRows', 'menu', 'isMenuOpen', 'fitMenu', 'openMenu', 'menuPage', 'menuBack', 'closeMenu', 'menuDo', 'changeOption', 'askEndTurn', 'canOpenMenu', 'updateMenu']) {
        assert.equal(typeof W[name], 'function', `Windows.${name}`);
    }
    assert.equal(typeof F.menuBlocked, 'function');
    assert.ok(typeof F.frameNow === 'function' && typeof F.sound === 'function' && Array.isArray(F.EMPTY) && F.EMPTY.length === 0);
    const menu = source('reactor_fight_menu.js');
    assert.match(menu, /const In = F\.Input, Hints = F\.Hints, Controls = F\.Controls, View = F\.View;/);
    assert.match(menu, /const frameNow = F\.frameNow, sound = F\.sound, EMPTY = F\.EMPTY;/);
    const scene = w.scene = new w.Scene_Map();
    w.SceneManager._scene = scene;
    let held = '';
    w.Input.isTriggered = name => name === held;
    const frame = key => { held = key || ''; w.Graphics.frameCount++; w.run(1); if (scene.isMenuCalled() && !F.menuBlocked()) scene.callMenu(); scene.update(); held = ''; };
    assert.ok(w.$gameFight.start({ mode: 'tactical', canEscape: true }) > 0);
    for (let i = 0; i < 600 && !w.$gameFight.awaitsPlayer(); i++) frame();
    assert.equal(W.isMenuOpen(), false);
    frame('cancel');
    assert.equal(W.isMenuOpen(), true, 'Cancel with nothing to step back from');
    assert.equal(scene.menuCalls, 0, 'the game\'s own menu was not called');
    assert.ok(scene._fightMenuWindow instanceof w.Window_FightMenu);
    assert.ok(Array.from(scene._fightMenuWindow._list, entry => entry.symbol).includes('controls'));
    // The battle waits behind it.
    const turn = w.$gameFight.turn(), state = w.$gameFight.tacticalState();
    for (let i = 0; i < 30; i++) frame();
    assert.deepEqual([w.$gameFight.turn(), w.$gameFight.tacticalState()], [turn, state]);
    // The menu key itself (a camera that held the mouse hands Escape on as the menu) opens the same menu.
    W.closeMenu(scene, true);
    frame(); frame();
    frame('menu');
    assert.equal(W.isMenuOpen(), true);
    assert.equal(scene.menuCalls, 0);
    // A menu call the scene is handed (a camera that gave the mouse back on Escape) is answered once: the battle
    // menu opens, and the call is not left standing for the game's own menu to answer later.
    W.closeMenu(scene, true);
    frame(); frame();
    assert.equal(W.isMenuOpen(), false);
    scene.menuCalling = true;
    w.Graphics.frameCount++;
    scene.callMenu();
    assert.equal(scene.menuCalling, false, 'the call is taken');
    assert.equal(W.isMenuOpen(), true);
    assert.equal(scene.menuCalls, 0);
});

//-----------------------------------------------------------------------------
// The words, the goal and the notice (reactor_fight.js).

test('a battle announces a line in every mode, counted with its own frames, cleared with it and kept with a save', () => {
    for (const options of [{ action: true, mode: 'action' }, { action: true, mode: 'firstPerson' }, { tactical: true, mode: 'tactical' }, { mode: 'tactical' }]) {
        const w = fightWorld(Object.assign({ events: [unit(1, 15, 8, 'enemy 1')] }, options));
        const F = w.ReactorFight, fight = w.$gameFight, label = options.mode + (options.tactical ? '' : options.action ? '' : ' (no driver)');
        w.$dataEnemies[1].note = '<move: 0>';
        w.$dataEnemies[1].params[0] = 9000;
        assert.ok(fight.start({ mode: options.mode }) > 0);
        assert.equal(fight.notice(), '', label);
        fight.announce('Hold the gate');
        assert.equal(fight.notice(), 'Hold the gate', label);
        assert.deepEqual(plain(fight._notice), { text: 'Hold the gate', frames: F.NOTICE_FRAMES });
        // It is part of the battle: a save made now carries it.
        const loaded = w.JsonEx.parse(w.JsonEx.stringify(fight));
        assert.equal(loaded.notice(), 'Hold the gate');
        w.run(F.NOTICE_FRAMES - 1);
        assert.equal(fight.isActive(), true, label);
        assert.equal(fight.notice(), 'Hold the gate', `${label}: still up after ${F.NOTICE_FRAMES - 1} frames`);
        w.run(1);
        assert.equal(fight.notice(), '', `${label}: gone after ${F.NOTICE_FRAMES}`);
        // A battle that ends takes its notice with it.
        fight.announce('Again');
        fight.end(F.ESCAPE, true);
        w.run(200, () => !fight.isActive());
        assert.equal(fight.isActive(), false, label);
        assert.equal(fight._notice, null);
        assert.equal(fight.notice(), '');
    }
    // A HUD that draws on the Tactical driver's revision is told when a notice comes and when it goes.
    const w = fightWorld({ tactical: true, events: [unit(1, 15, 8, 'enemy 1')] });
    w.$dataEnemies[1].note = '<move: 0>';
    const fight = w.$gameFight;
    fight.start({ mode: 'tactical' });
    w.run(600, () => fight.awaitsPlayer());
    w.run(400);                                                    // the hint line has said what it has to say
    let revision = fight.tacticalRevision();
    fight.announce('Now');
    assert.ok(fight.tacticalRevision() > revision);
    w.run(w.ReactorFight.NOTICE_FRAMES - 1);
    revision = fight.tacticalRevision();
    w.run(1);
    assert.ok(fight.tacticalRevision() > revision, 'the frame it goes');
    // A battle on a map the party left waits there: its notice waits with it.
    fight.announce('Later');
    const frames = fight._notice.frames;
    w.$gameMap._mapId = 2;
    w.run(10);
    assert.equal(fight._notice.frames, frames);
});

//-----------------------------------------------------------------------------
// A battle's start and its end are their steps.

/** Every call of the named steps of a battle, in order; `outer` keeps those no other named step made. */
function steps(w, names) {
    const calls = [];
    Object.defineProperty(calls, 'outer', { value: [] });
    let depth = 0;
    for (const name of names) {
        const original = w.Game_Fight.prototype[name];
        assert.equal(typeof original, 'function', name);
        w.Game_Fight.prototype[name] = function() {
            calls.push(name);
            if (!depth) calls.outer.push(name);
            depth++;
            try { return original.apply(this, arguments); } finally { depth--; }
        };
    }
    return calls;
}

test('a battle starts by its steps in order: the party, the units, the troop\'s battlers, the party made ready, then what goes on round it', () => {
    const w = fightWorld({ events: [unit(1, 8, 2, 'enemy 1'), unit(2, 9, 2, 'ally 3'), event(3, 5, 5)] });
    const fight = w.$gameFight, calls = steps(w, ['takeParty', 'takeUnits', 'syncTroop', 'prepareParty', 'startAround']);
    const audio = [];
    w.AudioManager.playBgm = () => audio.push('battle');
    let fed = null;
    w.ReactorEvents.on('mapBattleStart', payload => { fed = calls.slice(); });
    // What the party finds when it is made ready: the troop already holds the battle's enemies.
    const ready = [];
    const prepareParty = w.Game_Fight.prototype.prepareParty;
    w.Game_Fight.prototype.prepareParty = function() { ready.push(w.$gameTroop._enemies.length); return prepareParty.apply(this, arguments); };
    assert.ok(fight.start({ mode: 'tactical' }) > 0);
    assert.deepEqual(calls.filter((name, i) => name !== 'syncTroop' || calls[i - 1] === 'takeUnits'), ['takeParty', 'takeUnits', 'syncTroop', 'prepareParty', 'startAround']);
    assert.deepEqual(calls.outer, ['takeParty', 'takeUnits', 'syncTroop', 'prepareParty', 'startAround'], 'the calls the start itself makes, in this order');
    assert.deepEqual(ready, [1], 'the troop\'s battlers are there before the party is made ready');
    assert.deepEqual(fed, calls, 'the feed is told last');
    assert.deepEqual(audio, ['battle']);
    assert.equal(fight._phase, 'start');
    assert.deepEqual(plain(fight._units.map(u => [u.team, u.party ? 'party' : u.eventId])), [['ally', 'party'], ['ally', 'party'], ['enemy', 1], ['ally', 2]]);
    // Each step is the one place its work is done: another body there is the whole of that step.
    const v = fightWorld({ events: [unit(1, 8, 2, 'enemy 1')] });
    v.Game_Fight.prototype.takeUnits = function(options) { this.taken = options; };
    v.Game_Fight.prototype.startAround = function() {};
    let played = 0;
    v.AudioManager.playBgm = () => played++;
    const options = { mode: 'action', troopId: 1 };
    assert.ok(v.$gameFight.start(options) > 0);
    assert.equal(v.$gameFight.taken, options, 'the options a battle was started with reach the step');
    assert.deepEqual(plain(v.$gameFight._units.map(u => u.party)), [true, true], 'nobody but the party');
    assert.equal(played, 0);
    // A troop's members always come, beside the map's own enemies (`troopIfEmpty`: only where the map brought none).
    const t = fightWorld();
    assert.ok(t.$gameFight.start({ mode: 'tactical', troopId: 1 }) > 0);
    assert.equal(t.$gameFight.units({ team: 'enemy' }).length, 2);
    const u = fightWorld({ events: [unit(1, 8, 2, 'enemy 2')] });
    assert.ok(u.$gameFight.start({ mode: 'tactical', troopId: 1 }) > 0);
    assert.deepEqual(plain(u.$gameFight.units({ team: 'enemy' }).map(e => e.enemy.enemyId())), [2, 1, 1]);
    const k = fightWorld({ events: [unit(1, 8, 2, 'enemy 2')] });
    assert.ok(k.$gameFight.start({ mode: 'tactical', troopId: 1, troopIfEmpty: true }) > 0);
    assert.deepEqual(plain(k.$gameFight.units({ team: 'enemy' }).map(e => e.eventId)), [1]);
});

test('a battle ends by its steps in order: its units, the party as the map has it, then what goes on round it; fallen spawned units are swept once it is cleared', () => {
    const w = fightWorld({ events: [unit(1, 8, 2, 'enemy 1')] });
    const F = w.ReactorFight, fight = w.$gameFight;
    assert.ok(fight.start({ mode: 'tactical' }) > 0);
    const spawned = fight.spawn({ record: 'enemy', id: 2, x: 10, y: 6 });
    assert.ok(spawned && spawned.eventId > 0);
    // It falls and fades: gone from the map, still one of the battle's units.
    fight.battler(spawned).setHp(0);
    fight.defeat(spawned);
    for (let i = 0; i < 200 && fight._fading.length; i++) fight.updateFading();
    assert.equal(w.$gameMap.event(spawned.eventId)._erased, true);
    assert.equal(F.sweepSpawned(), 0, 'not swept while the battle stands');
    const calls = steps(w, ['finishUnits', 'restoreParty', 'finishAround', 'clear']);
    const seen = {};
    const finishUnits = w.Game_Fight.prototype.finishUnits, finishAround = w.Game_Fight.prototype.finishAround;
    w.Game_Fight.prototype.finishUnits = function(result) { seen.unitsResult = result; seen.activeAtUnits = this._active; return finishUnits.apply(this, arguments); };
    w.Game_Fight.prototype.finishAround = function(result) {
        seen.aroundResult = result;
        seen.spawnedBefore = Object.keys(w.$gameMap._rrSpawned);
        const out = finishAround.apply(this, arguments);
        seen.spawnedAfter = Object.keys(w.$gameMap._rrSpawned);
        seen.activeAfter = this._active;
        return out;
    };
    let ended = null;
    w.ReactorEvents.on('mapBattleEnd', payload => { ended = { result: payload.result, active: fight._active, troop: w.$gameTroop._enemies.length }; });
    const serial = fight.serial();
    fight._ending = { result: F.WIN, shown: true, quiet: true };
    fight.finish();
    assert.deepEqual(calls, ['finishUnits', 'restoreParty', 'finishAround', 'clear']);
    assert.deepEqual([seen.unitsResult, seen.aroundResult, seen.activeAtUnits, seen.activeAfter], [F.WIN, F.WIN, true, false]);
    assert.deepEqual(seen.spawnedBefore, [String(spawned.eventId)]);
    assert.deepEqual(seen.spawnedAfter, [], 'swept at the end of the step that clears the battle');
    assert.deepEqual(ended, { result: F.WIN, active: true, troop: 0 }, 'the feed is told while the battle still stands, the troop already empty');
    assert.equal(fight.resultOf(serial), F.WIN);
    // Another body at a step is the whole of that step: a battle whose units are left as they are.
    const v = fightWorld({ events: [unit(1, 8, 2, 'enemy 1')] });
    v.$gameFight.start({ mode: 'tactical' });
    v.$gamePlayer.setOpacity(110);
    v.Game_Fight.prototype.finishUnits = function() {};
    v.$gameFight._ending = { result: v.ReactorFight.ESCAPE, shown: true, quiet: true };
    v.$gameFight.finish();
    assert.equal(v.$gamePlayer.opacity(), 110);
    assert.equal(v.$gameFight.isActive(), false);
});

test('what goes on round a battle ends with it: the map\'s music is back, and the next battle counts its own waits', () => {
    const w = fightWorld({ events: [unit(1, 8, 2, 'enemy 1')] });
    const F = w.ReactorFight, fight = w.$gameFight;
    const replayed = [], warned = [];
    w.AudioManager.replayBgm = bgm => replayed.push(bgm);
    w.console = { warn: text => warned.push(String(text)), log() {}, error() {} };
    const quit = () => { fight._ending = { result: F.ESCAPE, shown: true, quiet: true }; fight.finish(); };
    assert.ok(fight.start({ mode: 'tactical' }) > 0);
    const saved = fight._savedBgm;
    assert.equal(saved.name, 'map', 'the map\'s own music, kept at the start');
    // A wait that shows nothing is counted; one frame short of being named, the battle ends.
    for (let i = 0; i < F.STALL_WARN - 1; i++) fight.noteWait();
    assert.equal(warned.length, 0);
    quit();
    assert.equal(replayed.length, 1);
    assert.equal(replayed[0], saved, 'the music kept at the start is the one played again');
    // The next battle starts its count afresh: its first waiting frame names nothing, its own last one does.
    assert.ok(fight.start({ mode: 'tactical' }) > 0);
    fight.noteWait();
    assert.equal(warned.length, 0, 'one frame into the next battle');
    for (let i = 0; i < F.STALL_WARN - 2; i++) fight.noteWait();
    assert.equal(warned.length, 0);
    fight.noteWait();
    assert.equal(warned.length, 1, 'named once, after its own frames');
    assert.match(warned[0], /has waited \d+ frames/);
    quit();
    // A battle that kept the map's music has none to bring back.
    assert.ok(fight.start({ mode: 'tactical', bgm: 'map' }) > 0);
    quit();
    assert.equal(replayed.length, 2, 'only the two battles that played their own');
});

//-----------------------------------------------------------------------------
// One answer to "is this event a unit now".

test('eventUnit answers what a battle\'s start takes: a row, a note tag, a comment on the page shown, the side a command gave; not an erased event or one with no page met', () => {
    const comment = text => [{ code: 108, indent: 0, parameters: [text] }, { code: 0, indent: 0, parameters: [] }];
    const off = Object.assign({}, page().conditions, { switch1Valid: true, switch1Id: 4 });
    const w = fightWorld({ events: [
        row(1, 5, 2, { team: 'enemy', record: 'enemy', id: 1, move: 3 }),
        unit(2, 6, 2, 'ally 3'),
        event(3, 7, 2, { pages: [page({ list: comment('<unit: enemy 2>') })] }),
        event(4, 8, 2, { pages: [page({ list: comment('PTBS_Enemy: 1') })] }),
        row(5, 9, 2, { team: 'enemy', record: 'enemy', id: 2 }, { pages: [page({ conditions: off })] }),
        // A unit on its second page only: a comment unit on and off its page.
        event(6, 10, 2, { pages: [page(), page({ conditions: off, list: comment('<unit: enemy 1>') })] }),
        row(7, 11, 2, { team: 'neutral' }),
        event(8, 12, 2),
        row(9, 13, 2, { team: 'enemy', record: 'enemy', id: 1 })
    ] });
    const F = w.ReactorFight, fight = w.$gameFight, at = id => w.$gameMap.event(id);
    const says = id => { const spec = F.eventUnit(at(id)); return spec ? [spec.team, spec.record, spec.id] : null; };
    assert.deepEqual(says(1), ['enemy', 'enemy', 1]);
    assert.equal(F.eventUnit(at(1)).move, 3);
    assert.equal(F.eventUnit(at(1)).ownMove, true, 'whether the row says its own Move comes with it');
    assert.deepEqual(says(2), ['ally', 'actor', 3]);
    assert.deepEqual(says(3), ['enemy', 'enemy', 2]);
    assert.deepEqual(says(4), ['enemy', 'enemy', 1]);
    assert.equal(says(5), null, 'none of its pages is met: not on the map');
    assert.equal(says(6), null, 'the page shown names no unit');
    assert.deepEqual(says(7), ['neutral', '', 0]);
    assert.equal(says(8), null);
    assert.equal(F.eventUnit(null), null);
    at(9).erase();
    assert.equal(says(9), null, 'erased');
    // The side Change Unit Side gave outlasts battles; a bystander with no record cannot be made to fight.
    fight.setEventSide(1, 'ally');
    fight.setEventSide(7, 'enemy');
    fight.setEventSide(2, 'neutral');
    assert.deepEqual([says(1), says(7), says(2)], [['ally', 'enemy', 1], ['neutral', '', 0], ['neutral', 'actor', 3]]);
    // Each answer is the caller's own to change.
    F.eventUnit(at(3)).team = 'ally';
    assert.deepEqual(says(3), ['enemy', 'enemy', 2]);
    // The switch comes on: the row with one page is on the map, and the other event shows the page that fights.
    w.$gameSwitches.setValue(4, true);
    w.$gameMap.refresh();
    assert.deepEqual([says(5), says(6)], [['enemy', 'enemy', 2], ['enemy', 'enemy', 1]]);
    // A battle takes exactly these, on these sides.
    const expected = plain(w.$gameMap.events().filter(e => F.eventUnit(e)).map(e => [e.eventId(), F.eventUnit(e).team]));
    assert.ok(fight.start({ mode: 'tactical' }) > 0);
    assert.deepEqual(plain(fight._units.filter(u => u.eventId).map(u => [u.eventId, u.team])), expected);
    assert.deepEqual(expected, [[1, 'ally'], [2, 'neutral'], [3, 'enemy'], [4, 'enemy'], [5, 'enemy'], [6, 'enemy'], [7, 'neutral']]);
    // Placed enemies on a Classic map ask the same answer.
    assert.match(source('reactor_fight_classic.js'), /typeof F\.eventUnit === "function" \? F\.eventUnit\(event\)/);
});

//-----------------------------------------------------------------------------
// The results of a won battle.

test('showResults is the one call for a won battle\'s rewards, and the battle is not over until it says they are read', () => {
    const won = (w, options = {}) => {
        const fight = w.$gameFight;
        assert.ok(fight.start(Object.assign({ mode: 'tactical' }, options)) > 0);
        for (const foe of fight.units({ team: 'enemy' })) { fight.battler(foe).setHp(0); fight.defeat(foe); }
        fight.checkOutcome();
        return fight;
    };
    // The fallen fade first; then the result is shown.
    const shown = (w, fight) => w.run(400, () => !fight.isActive() || (fight._ending && fight._ending.shown));
    // As it stands: the rewards are given once, the message window shows them, and the battle ends when it shuts.
    let w = fightWorld({ events: [unit(1, 8, 2, 'enemy 1')] });
    let calls = [];
    const stock = w.ReactorFight.showResults;
    w.ReactorFight.showResults = function(fight, rewards, done) { calls.push([fight === w.$gameFight, plain(rewards), typeof done]); return stock.apply(this, arguments); };
    let fight = won(w);
    w.run(600, () => !fight.isActive());
    assert.equal(fight.isActive(), false);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], true);
    assert.deepEqual([calls[0][1].exp, calls[0][1].gold, calls[0][1].items.length, calls[0][2]], [10, 7, 1, 'function']);
    assert.equal(w.$gameParty.gold(), 7);
    assert.ok(w.messages.some(line => /was victorious/.test(line)) && w.messages.some(line => /7\\G found/.test(line)));
    // Another body shows them its own way: the battle waits for its word, however long, with no message open.
    w = fightWorld({ events: [unit(1, 8, 2, 'enemy 1')] });
    let read = null, asked = 0;
    w.ReactorFight.showResults = function(battle, rewards, done) { asked++; read = done; w.$gameParty.gainGold(rewards.gold); };
    fight = won(w);
    w.run(300);
    assert.equal(asked, 1, 'asked once, not every frame');
    assert.equal(fight.isActive(), true, 'still the battle: the results are up');
    assert.equal(fight._ending.shown, true);
    assert.equal(w.$gameMessage.isBusy(), false);
    assert.equal(w.messages.length, 0, 'no line reached the message window');
    read();
    read();
    w.run(1);
    assert.equal(fight.isActive(), false, 'read: over on the next frame');
    assert.equal(w.$gameParty.gold(), 7);
    assert.equal(fight.resultOf(1), w.ReactorFight.WIN);
    // A word that comes after its battle is over (the party left the map meanwhile) ends nothing else.
    w = fightWorld({ events: [unit(1, 8, 2, 'enemy 1'), unit(2, 9, 2, 'enemy 1')] });
    let late = null;
    w.ReactorFight.showResults = function(battle, rewards, done) { late = late || done; };
    fight = won(w);
    shown(w, fight);
    assert.equal(typeof late, 'function');
    fight.finish();
    assert.equal(fight.isActive(), false);
    w.$gameMap.setup(1);
    fight = won(w);
    shown(w, fight);
    late();
    w.run(5);
    assert.equal(fight.isActive(), true, 'the second battle\'s results are its own');
    // Results are not part of a save: a battle loaded while they are up ends by the message window alone.
    w = fightWorld({ events: [unit(1, 8, 2, 'enemy 1')] });
    w.ReactorFight.showResults = function() {};
    fight = won(w);
    shown(w, fight);
    w.run(5);
    assert.equal(fight.isActive(), true);
    w.$gameFight = w.JsonEx.parse(w.JsonEx.stringify(fight));
    w.run(5);
    assert.equal(w.$gameFight.isActive(), false);
    // Only a battle that is won and says so has results: not a loss, an escape, or a quiet end.
    for (const [result, quiet] of [['LOSE', false], ['ESCAPE', false], ['WIN', true]]) {
        w = fightWorld({ events: [unit(1, 8, 2, 'enemy 1')] });
        asked = 0;
        w.ReactorFight.showResults = function() { asked++; };
        w.$gameFight.start({ mode: 'tactical', canLose: true });
        w.$gameFight.end(w.ReactorFight[result], quiet);
        w.run(300, () => !w.$gameFight.isActive());
        assert.equal(w.$gameFight.isActive(), false, result);
        assert.equal(asked, 0, result + (quiet ? ' (quiet)' : ''));
    }
});

//-----------------------------------------------------------------------------
// The names of keys and buttons (reactor_controls.js).

function controlsWorld() {
    const ctx = { console, calls: [],
        Input: { keyMapper: { 13: 'ok', 16: 'shift', 27: 'escape', 32: 'ok', 33: 'pageup', 81: 'pageup', 88: 'escape', 90: 'ok', 112: 'help', 222: 'quote' },
            gamepadMapper: { 0: 'ok', 1: 'cancel', 3: 'menu', 4: 'pageup', 12: 'up' }, _gamepadStates: [], _currentState: {} },
        TouchInput: {} };
    ctx.Input._onKeyDown = function(event) { ctx.calls.push('key ' + event.keyCode); return 'key'; };
    ctx.Input._updateGamepadState = function(gamepad) { this._gamepadStates[gamepad.index] = gamepad.buttons; ctx.calls.push('pad'); };
    ctx.TouchInput._onMouseDown = function(event) { ctx.calls.push('mouse'); return 'mouse'; };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(source('reactor_controls.js'), ctx, { filename: 'reactor_controls.js' });
    return ctx;
}

test('the game\'s controls name keys and buttons as a player knows them, the best known key of an action first', () => {
    const w = controlsWorld(), C = w.ReactorControls;
    assert.deepEqual([C.keyName(49), C.keyName(81), C.keyName(113), C.keyName(100), C.keyName(13), C.keyName(27), C.keyName(33), C.keyName(222)], ['1', 'Q', 'F2', 'Num 4', 'Enter', 'Esc', 'PgUp', '']);
    assert.deepEqual([C.buttonName(0), C.buttonName(4), C.buttonName(12), C.buttonName(40)], ['A', 'LB', 'D-pad Up', '']);
    assert.ok(C.keyRank(13) < C.keyRank(90) && C.keyRank(90) < C.keyRank(33), 'Enter before a letter before Page Up');
    assert.equal(C.labelFor('ok'), 'Enter', 'Enter before Space and Z');
    assert.equal(C.labelFor('cancel'), 'Esc', 'a key that says "escape" cancels');
    assert.equal(C.labelFor('menu'), 'Esc');
    assert.equal(C.labelFor('pageup'), 'Q', 'a letter before Page Up');
    assert.equal(C.labelFor('jump'), '', 'an action with no key has no name');
    assert.equal(C.labelFor('quote'), '', 'a key with no name names nothing');
    assert.equal(C.labelFor('ok', 'pad'), 'A');
    assert.equal(C.labelFor('cancel', 'pad'), 'B');
    assert.equal(C.labelFor('menu', 'pad'), 'Y');
    // A project's own name for a key is the name shown.
    C.KEY_NAMES[222] = 'Quote';
    assert.equal(C.labelFor('quote'), 'Quote');
    // With no key maps (a world with no Input) nothing has a name.
    delete w.Input.keyMapper;
    assert.equal(C.labelFor('ok'), '');
});

test('the device used last is the game\'s to know: a key or the mouse, or a gamepad, and whoever shows names is told when it changes', () => {
    const w = controlsWorld(), C = w.ReactorControls;
    const told = [];
    C.onDevice(device => told.push(device));
    C.onDevice('not a function');
    assert.equal(C.device(), 'keys');
    // Each way in notes its device, and the engine's own handler still runs.
    w.Input._updateGamepadState({ index: 0, buttons: [false, false, false] });
    assert.equal(C.device(), 'keys', 'a pad with nothing held is not in use');
    w.Input._updateGamepadState({ index: 0, buttons: [false, true, false] });
    assert.equal(C.device(), 'pad');
    assert.equal(C.labelFor('ok'), 'A', 'without a device named: the one used last');
    assert.equal(w.Input._onKeyDown({ keyCode: 13 }), 'key');
    assert.equal(C.device(), 'keys');
    assert.equal(C.labelFor('ok'), 'Enter');
    w.Input._updateGamepadState({ index: 0, buttons: [true] });
    assert.equal(w.TouchInput._onMouseDown({ button: 0 }), 'mouse');
    assert.equal(C.device(), 'keys');
    assert.deepEqual(told, ['pad', 'keys', 'pad', 'keys'], 'told once per change');
    assert.deepEqual(w.calls, ['pad', 'pad', 'key 13', 'pad', 'mouse']);
    C.noteDevice('keys');
    assert.equal(told.length, 4, 'the same device again is no news');
});

test('the Tactical driver names its controls through the game\'s: one table, one device, and its HUD is told when the device changes', () => {
    const w = fightWorld({ tactical: true, events: [unit(1, 15, 8, 'enemy 1')] });
    const F = w.ReactorFight, C = F.Controls, R = w.ReactorControls;
    assert.equal(C.KEY_NAMES, undefined, 'no table of its own');
    assert.equal(C.BUTTON_NAMES, undefined);
    w.Input.keyMapper = { 9: 'tab', 13: 'ok', 16: 'shift', 27: 'escape', 33: 'pageup', 34: 'pagedown', 90: 'ok' };
    w.Input.gamepadMapper = { 0: 'ok', 1: 'cancel', 2: 'shift' };
    assert.equal(C.label('ok'), R.labelFor('ok'));
    assert.equal(C.name('skip'), 'Shift');
    assert.equal(C.keyName(113), 'F2');
    R.KEY_NAMES[16] = 'SHIFT';
    assert.equal(C.name('skip'), 'SHIFT', 'the game\'s table is the one read');
    R.KEY_NAMES[16] = 'Shift';
    const fight = w.$gameFight;
    fight.start({ mode: 'tactical' });
    w.run(600, () => fight.awaitsPlayer());
    const revision = fight.tacticalRevision();
    R.noteDevice('pad');
    assert.equal(C.device, 'pad');
    assert.ok(fight.tacticalRevision() > revision, 'the HUD draws its names again');
    assert.equal(C.name('skip'), 'X');
    assert.equal(C.name('ok', 'keys'), 'Enter', 'a device named wins over the one used last');
    C.used('keys');
    assert.deepEqual([R.device(), C.device], ['keys', 'keys']);
});
