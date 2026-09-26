const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_PmmStealth.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_PmmStealth.params.js'));

// The settings block and method heads of the game's copy, as it ships in Dreamwalker.
const SCRIPT = [
    'module Trace # <= don\'t touch this',
    'ALERT_SWITCH = 69        # any game switch',
    'ALERT_COUNTDOWN = 450  # frames (60 frames is 1 second; 1800 frames is 30 sec)',
    'TRACE_RANGE_DEFAULT = 9 # any odd value',
    'HIDE_OPACITY = 50      # 0~255 (for realism, keep it low)',
    'HIDE_SWITCH = 71         # any game switch',
    'CAUTION_SELF_SWITCH = "C"         # "A", "B", "C", or "D"',
    'DEFAULT_SPRINT_NOISE = 6          # any value (set this to 0 to disable)',
    'ALLOW_SELF_SWITCH_DISABLING = true  # true~false',
    'DISABLING_SELF_SWITCH = "D"         # "A", "B", "C", or "D"',
    'SHOW_ALERT = true               # Do you want the ! to display? true~false',
    'PLAY_ALERT = false               # Do you want an ME to play?    true~false',
    'ALERT_ME = ""     # Which ME do you want to play? any ME',
    'ALERT_VOLUME = 0              # At what volume?               0~100',
    'SHOW_QUIT = true                # Do you want the ? to display? true~false',
    'CHECK_INTERVAL = 16  # 16',
    'end',
    'class Game_Character',
    '  def tss_trace(range = $game_map.trace_range)',
    '  end',
    'end'
].join('\n');

test('the Trace Stealth System is detected and its calls translate', () => {
    const families = C.scriptFamilies([SCRIPT]);
    assert.ok(families.has('pmmStealth'));
    assert.equal(C.FAMILIES.find(f => f.key === 'pmmStealth').plugin, 'RR_PmmStealth');
    assert.ok(!C.scriptFamilies(['module Trace\nend']).has('pmmStealth'), 'another module Trace is not taken for it');
    const ctx = { constants: C.scriptConstants([SCRIPT]), families };
    const route = Object.assign({}, ctx, { self: 'character' });
    assert.equal(C.ruby('tss_investigate', 'statement', route), 'this.rrTssInvestigate?.();');
    assert.equal(C.ruby('tss_noise(9)', 'statement', route), 'this.rrTssNoise?.(9);');
    assert.equal(C.ruby('huh?', 'statement', ctx), 'this.rrTssHuh?.();');
    assert.equal(C.ruby('hey!', 'statement', ctx), 'this.rrTssHey?.();');
    assert.equal(C.ruby('$game_map.trace_range = 3', 'statement', ctx), '$gameMap.rrSetTraceRange?.(3);');
    assert.equal(C.ruby('$game_player.sprint_noise = 2', 'statement', ctx), '$gamePlayer.rrSetSprintNoise?.(2);');
});

test('settings are read from the game\'s copy, the script defaults filling the rest', () => {
    const read = extract({ scripts: [SCRIPT], constants: C.scriptConstants([SCRIPT]) });
    assert.deepEqual([read.alertSwitch, read.alertCountdown, read.traceRange, read.hideSwitch, read.cautionSelfSwitch, read.disablingSelfSwitch], ['69', '450', '9', '71', 'C', 'D']);
    assert.equal(read.playAlert, 'false');
    assert.equal(read.alertMe, '');
    assert.equal(read.cautionPitch, '100', 'not in the snippet: the script default');
    assert.equal(extract({ scripts: [SCRIPT], constants: {} }).alertCountdown, '450', 'read from the text without constants');
});

/** The plugin in a small world: a map with walls, guards and the player. */
function world({ walls = [], guards = [], warm = true } = {}) {
    const switches = {}, selfSwitches = {}, balloons = [];
    const wall = new Set(walls.map(([x, y]) => x + ',' + y));
    class Game_CharacterBase {
        constructor() { this._x = 0; this._y = 0; this._direction = 2; this._through = false; this._opacity = 255; this._transparent = false; this._moves = []; this._balloon = false; }
        get x() { return this._x; }
        get y() { return this._y; }
        update() {}
        pos(x, y) { return this._x === x && this._y === y; }
        direction() { return this._direction; }
        opacity() { return this._opacity; }
        isTransparent() { return this._transparent; }
        isMoving() { return !!this._moving; }
        isBalloonPlaying() { return this._balloon; }
        canPass(x, y, d) {
            const x2 = x + (d === 6 ? 1 : d === 4 ? -1 : 0), y2 = y + (d === 2 ? 1 : d === 8 ? -1 : 0);
            return !wall.has(x + ',' + y) && !wall.has(x2 + ',' + y2);
        }
        moveStraight(d) { this._moves.push(d); }
        moveRandom() { this._moves.push('random'); }
        moveForward() { this._moves.push('forward'); }
    }
    class Game_Character extends Game_CharacterBase {}
    class Game_Event extends Game_Character {
        constructor(id, name, x, y, d = 2) { super(); this._mapId = 9; this._eventId = id; this._name = name; this._x = x; this._y = y; this._direction = d; this._erased = false; }
        event() { return { name: this._name }; }
    }
    class Game_Player extends Game_Character { update() {} isDashing() { return !!this._dashing; } }
    class Game_Map { update() { for (const ev of this._events) ev.update(); } events() { return this._events; } requestRefresh() {} }
    class Game_Interpreter {}
    const ctx = {
        Game_CharacterBase, Game_Character, Game_Event, Game_Player, Game_Map, Game_Interpreter, Math: Object.assign(Object.create(Math), { randomInt: () => ctx.roll }),
        roll: 0,
        PluginManager: { parameters: () => extract({ scripts: [SCRIPT], constants: C.scriptConstants([SCRIPT]) }) },
        AudioManager: { playMe() {} },
        $gameSwitches: { value: (id) => !!switches[id], setValue: (id, v) => { switches[id] = v; } },
        $gameSelfSwitches: { value: (k) => !!selfSwitches[k.join()], setValue: (k, v) => { selfSwitches[k.join()] = v; } },
        $gameTemp: { _balloonQueue: [], requestBalloon(target, balloonId) { balloons.push([target._eventId, balloonId]); } },
        $gameMessage: { busy: false, isBusy() { return this.busy; } },
        $gameParty: { _steps: 0, steps() { return this._steps; } }
    };
    vm.createContext(ctx);
    vm.runInContext(source, ctx);
    ctx.$gamePlayer = new Game_Player();
    ctx.$gameMap = new Game_Map();
    ctx.$gameMap._events = guards.map(([id, name, x, y, d]) => new Game_Event(id, name, x, y, d));
    ctx.switches = switches; ctx.selfSwitches = selfSwitches; ctx.balloons = balloons;
    ctx.guard = (id) => ctx.$gameMap._events.find(e => e._eventId === id);
    ctx.frame = () => { ctx.$gameMap.update(); ctx.$gamePlayer.update(); };
    // One frame with the player hidden, so the sight range is set as it is by the time a game reaches a guard.
    if (warm) { ctx.$gamePlayer._transparent = true; ctx.frame(); ctx.$gamePlayer._transparent = false; }
    return ctx;
}

test('the square of sight lies ahead of the guard', () => {
    const w = world({ guards: [[1, 'tracer(3) [update]', 5, 5, 2]] });
    const g = w.guard(1), sees = (x, y) => { w.$gamePlayer._x = x; w.$gamePlayer._y = y; return g.rrTssInSightField(); };
    // Range 9: a 9×9 square whose near edge is the tile in front, centred on the guard's column.
    assert.ok(sees(5, 6) && sees(5, 14) && sees(1, 10) && sees(9, 6));
    assert.ok(!sees(5, 5) && !sees(5, 15) && !sees(10, 10) && !sees(5, 4));
    g._direction = 4;
    assert.ok(sees(4, 5) && sees(-4, 1) && !sees(6, 5));
});

test('seeing the player turns the alert on for everyone; the countdown pauses for messages and ends with ?', () => {
    const w = world({ guards: [[1, 'tracer', 5, 5, 2], [2, 'tracer', 20, 20, 8], [3, 'tracer', 30, 30, 2], [4, 'villager', 6, 6, 2]] });
    w.selfSwitches['9,3,D'] = true;   // knocked out: neither sees nor gets a balloon
    w.$gamePlayer._x = 15; w.$gamePlayer._y = 5;
    w.frame();
    assert.equal(w.switches[69], undefined, 'out of sight');
    w.$gamePlayer._x = 5; w.$gamePlayer._y = 8;
    w.frame();
    assert.equal(w.switches[69], true);
    assert.equal(w.$gameMap.rrAlertCountdown(), 449, 'set to 450 by the guard, counted down once the same frame');
    assert.deepEqual(w.balloons, [[1, 1], [2, 1]]);
    w.$gameMessage.busy = true;
    for (let i = 0; i < 100; i++) w.frame();
    assert.equal(w.$gameMap.rrAlertCountdown(), 449, 'paused while a message is up');
    w.$gameMessage.busy = false;
    w.balloons.length = 0;
    for (let i = 0; i < 449; i++) w.frame();
    assert.equal(w.switches[69], true);
    w.frame();
    assert.equal(w.switches[69], false);
    assert.deepEqual(w.balloons, [[1, 2], [2, 2]]);
});

test('guards look only when someone moved, and not at a hidden player', () => {
    const w = world({ guards: [[1, 'tracer', 5, 5, 2]] });
    w.$gamePlayer._x = 15; w.$gamePlayer._y = 5;
    w.frame(); w.frame();
    w.switches[71] = true;
    w.$gamePlayer._x = 5; w.$gamePlayer._y = 8;
    w.frame();
    assert.ok(!w.switches[69], 'hide switch');
    w.switches[71] = false;
    w.frame();
    assert.ok(!w.switches[69], 'nobody moved since, so the guard has not looked again');
    w.$gamePlayer._y = 9; w.$gamePlayer._opacity = 50;
    w.frame();
    assert.ok(!w.switches[69], 'opacity at the hide opacity');
    w.$gamePlayer._opacity = 51; w.$gamePlayer._y = 8;
    w.frame();
    assert.equal(w.switches[69], true);
});

test('the line of sight breaks at a blocked tile, tested in the guard\'s facing direction', () => {
    const w = world({ walls: [[5, 8]], guards: [[1, 'tracer', 5, 5, 2]] });
    const g = w.guard(1), at = (x, y) => { w.$gamePlayer._x = x; w.$gamePlayer._y = y; return g.rrTssTrace(); };
    assert.ok(at(5, 6), 'clear');
    assert.ok(!at(5, 9), 'a wall between');
    // The player's own tile counts as blocked when the tile beyond it (in the guard's direction) is a wall.
    assert.ok(!at(5, 7), 'the wall below the player hides them from a guard looking down');
    assert.ok(at(4, 7), 'one column over, the tile beyond is open');
});

test('before the first map update guards skip the square of sight and see along any clear line', () => {
    const w = world({ guards: [[1, 'tracer', 5, 5, 2]], warm: false });
    w.$gamePlayer._x = 5; w.$gamePlayer._y = 1;   // behind the guard
    w.frame();
    assert.equal(w.switches[69], true);
});

test('noise wakes guards in range; they walk to it and calm down within a tile', () => {
    const w = world({ guards: [[1, 'tracer', 5, 5, 2], [2, 'tracer', 20, 5, 2]] });
    const locker = new w.Game_Event(9, 'locker', 10, 8);
    locker.rrTssNoise(5);
    assert.ok(w.selfSwitches['9,1,C'] && !w.selfSwitches['9,2,C']);
    assert.deepEqual(w.balloons, [[1, 2]]);
    const g = w.guard(1);
    assert.deepEqual([g._rrTss.ax, g._rrTss.ay], [10, 8]);
    w.roll = 0; g.rrTssInvestigate();
    assert.deepEqual(g._moves, [6], 'the longer axis only');
    w.roll = 4; g.rrTssInvestigate(); w.roll = 5; g.rrTssInvestigate();
    assert.deepEqual(g._moves, [6, 'random', 'forward']);
    g._x = 9; g._y = 7;
    w.frame();
    assert.equal(w.selfSwitches['9,1,C'], false);
    // Ignored during an alert.
    w.switches[69] = true;
    locker.rrTssNoise(20);
    assert.ok(!w.selfSwitches['9,2,C']);
    // 20 tiles off the noise, a guard wanders.
    const far = w.guard(2); far._rrTss = { ax: 0, ay: 0 }; far._x = 15; far._y = 5; w.roll = 0; far.rrTssInvestigate();
    assert.deepEqual(far._moves, ['random']);
});

test('dashing makes noise every sixth step', () => {
    const w = world({ guards: [[1, 'tracer', 5, 5, 2]] });
    const p = w.$gamePlayer;
    p._x = 8; p._y = 5; p._moving = true; p._dashing = true;
    w.$gameParty._steps = 5; w.frame();
    assert.ok(!w.selfSwitches['9,1,C']);
    w.$gameParty._steps = 6; w.frame();
    assert.ok(w.selfSwitches['9,1,C']);
    assert.equal(p._rrOldSteps, 6);
});
