/**
 * The quality levels: the picture a machine can hold its frame rate at.
 *
 * Level 0 is the picture as it has always been drawn. A machine short of its
 * world frames is stepped down along what its frame waits for (the main
 * thread's work, else the graphics card's), never along the other, and a
 * screen slower than 60 Hz is not short of anything. A player's fixed
 * setting holds a level, and outside a game the level is 0.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const Q = Reactor3D.Quality;
const source = name => fs.readFileSync(path.join(repoRoot, 'runtime', name), 'utf8');

/** A game's config for the length of `fn`, and the levels as a new session finds them. */
function inGame(config, fn) {
    // The tests below were written for a target of 60; the default's own test sets it.
    const saved = { ConfigManager: global.ConfigManager, document: global.document, enabled: Q.enabled, target: Q.TARGET_FPS };
    Q.TARGET_FPS = 60;
    const saves = [];
    global.ConfigManager = Object.assign({ graphicsQuality: 'auto', graphicsAuto: null, save() { saves.push(JSON.parse(JSON.stringify(this.graphicsAuto))); } }, config);
    Object.assign(Q, { enabled: true, _gpu: 0, _cpu: 0, _half: false, g: 0, c: 0, h: false, _taken: [], _loaded: false, _ceiling: false, _probe: null, _probeLeft: 0,
        _rest: 0, _calm: 0, _slowRun: 0, _mapId: 0, _last: 0, _lastDraw: 0, _refreshMs: Infinity, _tickLast: 0, _intervalCount: 0, _restUntil: 0, _gpuHold: false, _gpuReturn: null, _spent: { cpu: false, gpu: false }, _stepCheck: null, _recent: [], _jumpNext: { cpu: false, gpu: false } });
    Q.clearWindow();
    try { return fn(saves); } finally {
        global.ConfigManager = saved.ConfigManager; global.document = saved.document; Q.TARGET_FPS = saved.target;
        Object.assign(Q, { enabled: saved.enabled, _gpu: 0, _cpu: 0, _half: false, g: 0, c: 0, h: false, _taken: [], _loaded: false, _ceiling: false, _probe: null, _mapId: 0, _last: 0, _lastDraw: 0, _rest: 0,
            _refreshMs: Infinity, _tickLast: 0, _intervalCount: 0, _restUntil: 0 });
        Q.clearWindow();
    }
}

/** A title screen: `seconds` of frames at the screen's refresh with no world asked for. */
function title(seconds, clock, refresh = 1000 / 60) {
    for (const until = clock.now + seconds * 1000; clock.now < until; clock.now += refresh) { Q.tickBegin(clock.now); Q.tickEnd(clock.now + 1); }
}

/**
 * `seconds` of play on a 3D map, after two seconds of title screen.
 * `machine(Q)` says what a frame the world is drawn in costs at the levels in
 * force: { frame: ms until the next frame, busy: the main thread's ms in it }.
 * A frame the world is not drawn in costs a refresh. Returns the world frames
 * a second delivered over the last two seconds.
 */
function play(seconds, machine, clock = { now: 1000 }, refresh = 1000 / 60) {
    if (!Q._tickLast) title(2, clock, refresh);
    const until = clock.now + seconds * 1000, recent = [];
    while (clock.now < until) {
        const cost = machine(Q);
        Q.tickBegin(clock.now);
        const drew = Q.worldTick(clock.now);
        Q.tickEnd(clock.now + (drew ? cost.busy : Math.min(cost.busy, 2)));
        if (drew) recent.push(clock.now);
        clock.now += drew ? cost.frame : refresh;
    }
    return recent.filter(t => t >= until - 2000).length / 2;
}

/** How long a frame of `work` ms takes on a screen that waits for its refresh. */
const vsync = (work, refresh = 1000 / 60) => Math.max(1, Math.ceil(work / refresh - 1e-9)) * refresh;
const fast = () => ({ frame: 1000 / 60, busy: 5 });

test('a machine that holds its frame rate never leaves the full picture', () => {
    inGame({}, saves => {
        Q.mapOpened(5);
        play(60, fast);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false]);
        assert.equal(Q.scale(), 1);
        assert.equal(Q.detail(), 1);
        assert.equal(Q.shadows(), true);
        assert.equal(Q.depthFirst(), true);
        assert.equal(Q.foliageReach(), 1);
        assert.equal(Q.drawEvery(), 1);
        assert.deepEqual(saves, [], 'nothing was stepped, so nothing was written');
    });
});

test('a slow graphics card is stepped down along the picture\'s size, and the main thread\'s levels are left alone', () => {
    inGame({}, saves => {
        Q.mapOpened(5);
        // 22 ms of GPU at the full size, less at each level: two refreshes a frame until it fits one. Half the frames short:
        // two steps at once (LEAP), straight to the level that holds.
        const machine = q => ({ frame: vsync([22, 20, 15.5, 14, 13, 12][q.g]), busy: 5 });
        const rate = play(40, machine);
        assert.deepEqual([Q.g, Q.c, Q.h], [2, 0, false], 'down to the size it holds 60 at, and no further');
        assert.ok(rate >= 59 && rate <= 61, 'sixty a second again: ' + rate);
        assert.equal(Q.scale(), Q.GPU[2].scale);
        assert.deepEqual(saves[saves.length - 1], { version: 4, gpu: 2, cpu: 0, half: false, device: '' }, 'the machine\'s levels are kept for its next session');
    });
});

test('a slow main thread reduces its work without imposing a half-rate cap', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        // 30 ms of main thread a drawn frame, 26 and 24 at the CPU levels: never inside a refresh.
        const machine = q => { const busy = [30, 26, 24, 22, 21, 21][q.c]; return { frame: vsync(busy), busy }; };
        const rate = play(200, machine);
        // Every level still waits for two refreshes: 30 a second at each. A step that seems to buy nothing stays
        // (running, a window's frames swing by more than a step changes them); nothing is ever halved.
        assert.equal(Q.h, false);
        assert.equal(Q.scale(), 1, 'a smaller picture does nothing for a slow main thread');
        assert.equal(Q.drawEvery(), 1);
        assert.ok(rate >= 29 && rate <= 31, 'a draw that runs over a refresh is followed by the next at once: still 30 a second, not 20: ' + rate);
    });
});

test('a little short with a kind spent is left alone rather than halved', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        Q._loaded = true; Q._cpu = Q.CPU.length - 1; Q.refresh();
        assert.equal(Q.stepDown('cpu', 0.15), null, 'fifty a second is not worth thirty');
        assert.equal(Q.stepDown('cpu', 0.3), null, 'keep drawing every available refresh');
        assert.equal(Q.stepDown('cpu', 0.5), null, 'and there is nothing under the half rate');
    });
});

test('a screen slower than 60 Hz is not a slow machine', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        // A 50 Hz panel: 50 frames a second is all of them, however busy the main thread is.
        play(60, () => ({ frame: 20, busy: 14 }), { now: 1000 }, 20);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false]);
        assert.ok(Q.wantedPerSecond() > 49 && Q.wantedPerSecond() < 53);
    });
    inGame({}, () => {
        Q.mapOpened(5);
        // Auto evaluates a 60 Hz quality floor while rendering remains uncapped.
        const clock = { now: 1000 };
        title(2, clock, 1000 / 180);
        assert.equal(Q.wantedPerSecond(), 60);
    });
});

test('a stall, a window out of focus and the seconds after a step are not judged', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        const clock = { now: 1000 };
        // The game stopped for three seconds at a time (something loading): gaps, not frames.
        play(40, () => ({ frame: 3000, busy: 2900 }), clock);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false], 'frames three seconds apart are the game stopped');
        // One stall of a second in ten seconds of play that holds its rate: a hitch, not judged. (Stalls that keep
        // coming are: the test of frames that keep stopping, runtime 20261110.10.)
        play(1.5, () => ({ frame: 1000, busy: 900 }), clock);
        play(10, () => ({ frame: 1000 / 60, busy: 8 }), clock);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false], 'one stall is a hitch');
        global.document = { hidden: false, hasFocus: () => false };
        play(40, () => ({ frame: 1000 / 20, busy: 45 }), clock);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false], 'nor is a game the player has left');
        global.document = { hidden: false, hasFocus: () => true };
        play(3, () => ({ frame: 1000 / 20, busy: 45 }), clock);
        assert.deepEqual([Q._gpu, Q._cpu], [1, 0], 'back in focus and failing: one window is enough, and the first step is off the whole picture');
        play(8, () => ({ frame: 1000 / 20, busy: 45 }), clock);
        assert.equal(Q._cpu, 2, 'then the main thread\x27s ladder: under half its frames it steps twice');
        assert.ok(Q._rest > 0 || Q._cpu === 2);
    });
});

test('a fixed setting holds its level whatever the frames do, and the switch draws the full picture', () => {
    inGame({ graphicsQuality: 'medium' }, saves => {
        Q.mapOpened(5);
        play(30, () => ({ frame: 1000 / 20, busy: 45 }));
        assert.deepEqual([Q.g, Q.c, Q.h], [3, 1, false]);
        assert.deepEqual(saves, []);
        ConfigManager.graphicsQuality = 'low';
        Q.refresh();
        // Low is the level it always was (half size, the main thread's last level); Auto alone goes past it (runtime 20261110.10).
        assert.deepEqual([Q.g, Q.c, Q.h], [6, Q.CPU.length - 1, false], 'the half rate is the automatic levels\' alone');
        assert.deepEqual(Q.FIXED.low, [6, 5]);
        assert.equal(Q.GPU[6].scale, 0.5, 'Low is still half of the plain size, one number higher since the whole picture took the top');
        assert.ok(Q.GPU.length - 1 > 6 && Q.GPU[Q.GPU.length - 1].scale < Q.GPU[6].scale, 'deeper levels for a graphics card far out of its depth');
        assert.equal(Q.shadows(), false);
        ConfigManager.graphicsQuality = 'high';
        Q.refresh();
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false]);
        assert.equal(Q.full(), true, 'High is the whole picture');
        assert.equal(Q.viewScale(), 1, 'drawn at the game\'s own size, not a share of renderScale');
        ConfigManager.graphicsQuality = 'low';
        Q.enabled = false;
        Q.refresh();
        assert.deepEqual([Q.g, Q.c, Q.h], [1, 0, false], 'the kill switch: the plain picture, as it was always drawn');
        assert.equal(Q.full(), false);
        assert.equal(Q.viewScale(), Reactor3D.renderScale * Q.GPU[1].scale);
    });
    const saved = global.ConfigManager;
    delete global.ConfigManager;
    try { assert.equal(Q.setting(), 'high', 'no game to ask: the editor draws the full picture'); } finally { global.ConfigManager = saved; }
});

test('a machine retains detail levels but discards obsolete saved frame caps', () => {
    inGame({ graphicsAuto: { version: 4, gpu: 2, cpu: 1, half: true } }, () => {
        Q.refresh();
        assert.deepEqual([Q.g, Q.c, Q.h], [2, 1, false]);
        assert.deepEqual(Q._taken, ['gpu', 'gpu', 'cpu']);
    });
    inGame({ graphicsAuto: { version: 4, gpu: 99, cpu: -3, half: 'yes' } }, () => {
        Q.refresh();
        assert.deepEqual([Q.g, Q.c, Q.h], [Q.GPU.length - 1, 0, false], 'a file from elsewhere is read into range');
    });
});

test('the levels kept from the last session are taken once the options file has been read: the game draws frames before it is', () => {
    // As the game boots: the options are at their defaults while their file is still being read, and frames are drawn.
    inGame({ graphicsAuto: null, _isLoaded: false, isLoaded() { return this._isLoaded; } }, saves => {
        const clock = { now: 1000 };
        title(0.2, clock);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false], 'nothing is known of the machine yet');
        // The file arrives (ConfigManager.applyData).
        global.ConfigManager.graphicsAuto = { version: 4, gpu: 3, cpu: 2, half: true };
        global.ConfigManager._isLoaded = true;
        title(0.1, clock);
        assert.deepEqual([Q.g, Q.c, Q.h], [3, 2, false], 'the machine starts at the levels it settled at');
        assert.deepEqual(Q._taken, ['gpu', 'gpu', 'gpu', 'cpu', 'cpu']);
        assert.deepEqual(saves, [], 'and nothing was written over them');
    });
    // A game with no options file (its first launch) starts at the top once that is known.
    inGame({ graphicsAuto: null, _isLoaded: false, isLoaded() { return this._isLoaded; } }, () => {
        const clock = { now: 1000 };
        title(0.1, clock);
        global.ConfigManager._isLoaded = true;
        title(0.1, clock);
        assert.deepEqual([Q.g, Q.c, Q.h, Q._loaded], [0, 0, false, true]);
    });
});

test('a step back up is tried as another map opens after a calm stretch, and given up for the session when it does not hold', () => {
    inGame({ graphicsAuto: { version: 4, gpu: 2, cpu: 0, half: false } }, () => {
        const clock = { now: 1000 };
        Q.mapOpened(5);
        play(30, fast, clock);
        assert.equal(Q._gpu, 2, 'a calm machine keeps its level on the map it is on');
        // A lighter map: the level above holds there.
        Q.mapOpened(6);
        assert.equal(Q._gpu, 1, 'the picture changes anyway: the last step is tried back');
        assert.equal(Q._probe, 'gpu');
        play(30, fast, clock);
        assert.equal(Q._gpu, 1);
        assert.equal(Q._probe, null, 'it held');
        // The next map is too heavy for the level above.
        Q.mapOpened(7);
        assert.equal(Q._gpu, 0);
        play(20, q => ({ frame: q.g ? 1000 / 60 : 1000 / 30, busy: 5 }), clock);
        assert.equal(Q._gpu, 1, 'stepped down again');
        assert.equal(Q._ceiling, true);
        play(30, fast, clock);
        Q.mapOpened(8);
        assert.equal(Q._gpu, 1, 'and not tried again this session');
    });
});

test('an obsolete half-rate setting never suppresses an available world draw', () => {
    inGame({ graphicsAuto: { version: 4, gpu: 0, cpu: 0, half: true } }, () => {
        Q.refresh();
        const drawn = [], frame = 1000 / 60;
        for (let i = 0; i < 8; i++) { const now = 1000 + i * frame; Q.tickBegin(now); drawn.push(Q.worldTick(now)); Q.tickEnd(now + 3); }
        assert.ok(drawn.every(Boolean), 'all eight refreshes draw');
        ConfigManager.graphicsQuality = 'high';
        Q.refresh();
        assert.equal(Q.worldTick(2000), true);
        assert.equal(Q.worldTick(2016), true, 'and on every one otherwise');
    });
});

test('choosing Auto again starts from the full picture', () => {
    inGame({ graphicsAuto: { version: 4, gpu: 3, cpu: 2, half: true } }, saves => {
        Q.refresh();
        Q.reset();
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false]);
        assert.deepEqual(saves[saves.length - 1], { version: 4, gpu: 0, cpu: 0, half: false, device: '' });
        assert.equal(Q._ceiling, false);
    });
});

test('the levels reach what they are for', () => {
    const core = source('reactor_3d.js');
    assert.match(core, /this\.setRenderScale\(Reactor3D\.Quality\.viewScale\(\)\);/, 'the size the world is drawn at');
    assert.match(core, /viewScale\(\) \{ return this\.full\(\) \? 1 : \(Reactor3D\.renderScale \|\| 1\) \* this\.scale\(\); \}/, 'the whole of it at the top level, else a share of the project\'s own');
    assert.match(core, /const allowed = this\.pixelError \* Reactor3D\.Quality\.detail\(\);/);
    assert.match(core, /if \(Reactor3D\.tier\(\) !== "weak" \|\| !Reactor3D\.Quality\.depthFirst\(\)\) return false;/);
    assert.match(source('reactor_3d_lighting.js'), /if \(this\.SHADOWS === "off" \|\| \(this\.Quality && !this\.Quality\.shadows\(\)\)\) return false;/);
    assert.match(source('reactor_3d_foliage.js'), /lodNow\.near = lod\.near \* quality\.foliageReach\(\); lodNow\.far = lod\.far \* quality\.foliageReach\(\); lodNow\.scale = lod\.scale \* quality\.foliageShare\(\);/);
    const sprites = source('reactor_sprites.js');
    assert.ok(/Reactor3D\.Quality\.worldTick\(performance\.now\(\)\)/.test(sprites.slice(sprites.indexOf('Spriteset_Map.prototype.drawReactor3D ='))), 'counts actual world draws, including intermediate refreshes');
    const tick = source('reactor_core.js');
    assert.match(tick, /if \(quality\) quality\.tickBegin\(performance\.now\(\)\);/);
    assert.match(tick, /if \(quality\) quality\.tickEnd\(performance\.now\(\)\);/);
});

test('the setting is saved with the player\'s options and offered once a 3D map has been drawn', () => {
    const managers = source('reactor_managers.js');
    assert.match(managers, /config\.graphicsQuality = this\.graphicsQuality;\n\s*config\.graphicsAuto = this\.graphicsAuto;\n\s*config\.reactor3dSeen = this\.reactor3dSeen;/);
    assert.match(managers, /this\.graphicsQuality = \["auto", "high", "medium", "low"\]\.includes\(config\.graphicsQuality\) \? config\.graphicsQuality : "auto";/, 'anything else reads as Auto');
    const windows = source('reactor_windows.js');
    assert.match(windows, /if \(typeof Reactor3D === "undefined" \|\| !Reactor3D\.Quality \|\| !ConfigManager\.reactor3dSeen\) return;\n\s*this\.addCommand\(Window_Options\.GRAPHICS_TEXT\.name, "graphicsQuality"\);/);
    assert.match(windows, /if \(values\[next\] === "auto" && typeof Reactor3D !== "undefined" && Reactor3D\.Quality\) Reactor3D\.Quality\.reset\(\);/);
    assert.match(source('reactor_scenes.js'), /return 7 \+ \(typeof Reactor3D !== "undefined" && Reactor3D\.Quality && ConfigManager\.reactor3dSeen \? 1 : 0\);/, 'the window is a row taller with it');
});

test('a measuring tool holds the levels still', () => {
    const tool = fs.readFileSync(path.join(repoRoot, 'editor', 'tests', 'perf', 'nw-frame-breakdown.cjs'), 'utf8');
    assert.match(tool, /if \(typeof Reactor3D !== "undefined" && Reactor3D\.Quality\) Reactor3D\.Quality\.enabled = false;/);
});

/** `SceneManager.determineRepeatNumber` and its settings, on a bare object. */
function updatePacing() {
    const managers = source('reactor_managers.js');
    const from = managers.indexOf('SceneManager.trueSpeed = true;');
    const to = managers.indexOf('\n};\n', managers.indexOf('SceneManager.determineRepeatNumber = function', from)) + 4;
    assert.ok(from > 0 && to > from);
    const SceneManager = { _smoothDeltaTime: 1, _elapsedTime: 0 };
    new Function('SceneManager', managers.slice(from, to))(SceneManager);
    return SceneManager;
}

/** Updates a second over `seconds` at `fps` frames a second, each interval off by up to `jitter` of itself; and the frames given none and more than one. */
function updatesAt(pacing, fps, seconds = 20, jitter = 0) {
    pacing._smoothDeltaTime = 1; pacing._elapsedTime = 0;
    let updates = 0, none = 0, several = 0;
    for (let i = 0; i < fps * seconds; i++) {
        const n = pacing.determineRepeatNumber((60 / fps) * (1 + Math.sin(i * 1.7) * jitter));
        updates += n; if (!n) none++; if (n > 1) several++;
    }
    return { rate: updates / seconds, none, several };
}

test('the game keeps its speed at any frame rate down to 15 a second', () => {
    const pacing = updatePacing();
    for (const fps of [180, 144, 100, 75, 62, 58, 55, 50, 45, 40, 30, 24, 20, 15]) {
        const { rate } = updatesAt(pacing, fps);
        assert.ok(Math.abs(rate - 60) < 0.2, `${fps} frames a second: ${rate} updates`);
    }
    assert.ok(updatesAt(pacing, 10).rate < 45, 'under 15 the game slows down rather than chase itself');
    assert.equal(pacing.MAX_UPDATES, 4);
    // As it was: one update a frame from 60 down to 40, then too many.
    pacing.trueSpeed = false;
    assert.ok(Math.abs(updatesAt(pacing, 45).rate - 45) < 0.2, 'the old rounding ran the game at three quarters of its speed at 45');
    assert.ok(Math.abs(updatesAt(pacing, 24).rate - 48) < 0.5);
});

test('a 60 Hz screen gets one update a frame, every frame, and a long frame is made up at once', () => {
    const pacing = updatePacing();
    for (const fps of [60, 59.94, 60.5]) {
        const { none, several } = updatesAt(pacing, fps, 60, 0.06);
        assert.deepEqual([none, several], [0, 0], `${fps} Hz with its frames 6% off`);
    }
    pacing._smoothDeltaTime = 1; pacing._elapsedTime = 0;
    assert.deepEqual([1, 1, 1, 2, 1, 1, 1, 3, 1, 1, 1, 1].map(dt => pacing.determineRepeatNumber(dt)), [1, 1, 1, 2, 1, 1, 1, 3, 1, 1, 1, 1], 'two ticks late: two updates, and back to one');
    // A machine a little short of its frames still gets an update in each.
    assert.equal(updatesAt(pacing, 55, 20, 0.06).none, 0);
});

test('a 180 Hz display running at 90 FPS retains resolution and shadows across maps', () => {
    inGame({}, saves => {
        const clock = { now: 1000 };
        title(2, clock, 1000 / 180);
        Q.mapOpened(5);
        const rate = play(30, () => ({ frame: 1000 / 90, busy: 7 }), clock, 1000 / 180);
        Q.mapOpened(8);
        play(10, () => ({ frame: 1000 / 90, busy: 7 }), clock, 1000 / 180);
        assert.ok(rate > 89 && rate < 91, 'ninety world draws per second, without a render cap');
        assert.deepEqual([Q.g, Q.c], [0, 0]);
        assert.equal(Q.scale(), 1);
        assert.equal(Q.shadows(), true);
        assert.equal(saves.length, 0);
    });
});

test('Auto discards a profile learned under the old refresh-rate target once', () => {
    inGame({ graphicsAuto: { gpu: 3, cpu: 2, half: false } }, saves => {
        Q.refresh();
        assert.deepEqual([Q.g, Q.c], [0, 0]);
        assert.equal(Q.shadows(), true);
        assert.deepEqual(ConfigManager.graphicsAuto, { version: Q.PROFILE_VERSION, gpu: 0, cpu: 0, half: false, device: '' });
        Q.refresh();
        assert.equal(saves.length, 1, 'migration is written once');
    });
});

// A saved CPU fallback must retain character grounding while reducing shadow work.
test('saved Auto CPU level two keeps cheaper shadows and switching quality refreshes their budget', () => {
    inGame({ graphicsAuto: { version: 4, gpu: 0, cpu: 2, half: false } }, () => {
        Q.refresh();
        assert.equal(Q.c, 2);
        assert.equal(Q.shadows(), true);
        const S = Reactor3D.Shadows, profiles = Reactor3D.SHADOW_QUALITY;
        assert.equal(S.quality() === profiles.fullCpu, true);
        assert.ok(S.quality().dynamicTriangles < profiles.full.dynamicTriangles);
        assert.ok(S.quality().dynamicPerFrame <= profiles.full.dynamicPerFrame);
        assert.ok(S.quality().dynamicInterval > profiles.full.dynamicInterval);
        for (const key of ['slots', 'dynamicSlots', 'size', 'sunSize', 'taps']) assert.equal(profiles.fullCpu[key], profiles.full[key], 'atlas and shader stay compatible: ' + key);
        ConfigManager.graphicsQuality = 'high'; Q.refresh();
        assert.equal(Q.shadows(), true); assert.equal(S.quality() === profiles.full, true);
        ConfigManager.graphicsQuality = 'low'; Q.refresh();
        assert.equal(Q.shadows(), false, 'explicit Low still disables shadows');
        ConfigManager.graphicsQuality = 'auto'; Q.refresh();
        assert.equal(Q.shadows(), true); assert.equal(S.quality() === profiles.fullCpu, true);
    });
});

test('levels another machine settled on are not taken: a shared project folder carries one options file', () => {
    const had = global.Graphics;
    global.Graphics = { gpuDescription: 'NVIDIA GeForce RTX 3060 Laptop GPU' };
    try {
        inGame({ graphicsAuto: { version: 4, gpu: 2, cpu: 2, half: false, device: 'NVIDIA GeForce RTX 5070 / 32' } }, saves => {
            Q.refresh();
            assert.deepEqual([Q.g, Q.c], [0, 0], 'another device: measured afresh');
            assert.match(saves[saves.length - 1].device, /^NVIDIA GeForce RTX 3060 Laptop GPU \/ \d+$/, 'and kept as this one\'s');
        });
        const own = Q.device();
        inGame({ graphicsAuto: { version: 4, gpu: 2, cpu: 1, half: false, device: own } }, () => {
            Q.refresh();
            assert.deepEqual([Q.g, Q.c], [2, 1], 'its own levels are taken');
        });
        // Each machine finds its own levels again after the other has played: the record keeps both.
        let file = null;
        inGame({ graphicsAuto: { version: 4, gpu: 2, cpu: 2, half: false, device: 'NVIDIA GeForce RTX 5070 / 32' } }, saves => {
            Q.refresh();
            file = saves[saves.length - 1];
            assert.equal(file.device, own);
            assert.deepEqual(file.devices, { 'NVIDIA GeForce RTX 5070 / 32': { version: 4, gpu: 2, cpu: 2 } }, 'the other machine\'s levels stay in the file');
        });
        global.Graphics = { gpuDescription: 'NVIDIA GeForce RTX 5070' };
        const threads = Q.device().split(' / ')[1];
        file.devices = { ['NVIDIA GeForce RTX 5070 / ' + threads]: { version: 4, gpu: 2, cpu: 2 } };
        inGame({ graphicsAuto: file }, saves => {
            Q.refresh();
            assert.deepEqual([Q.g, Q.c], [2, 2], 'the first machine is back: its levels are there');
            assert.deepEqual(saves, [], 'and nothing is written until a level changes');
            Q.keep();
            const kept = saves[saves.length - 1];
            assert.equal(kept.device, Q.device());
            assert.deepEqual(kept.devices, { [own]: { version: 4, gpu: 0, cpu: 0 } }, 'the two change places');
        });
    } finally { global.Graphics = had; }
});

test('a main thread that each level speeds up is stepped down until it holds; a step that makes it slower is taken back', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        // No vsync: a frame is as long as its work. 30, 24, 20, 16 ms: the fourth level holds 60.
        play(60, q => { const busy = [30, 24, 20, 16, 15.5][q.c]; return { frame: busy, busy }; });
        assert.equal(Q.c, 3, 'down to the level that holds 60 and no further');
    });
    inGame({}, () => {
        Q.mapOpened(5);
        // The first level helps; the second makes it slower (30, 20, then 26).
        play(150, q => { const busy = [30, 20, 26, 26, 26, 26][q.c]; return { frame: busy, busy }; });
        assert.equal(Q.c, 1, 'the level that made it slower is given back');
        assert.equal(Q._spent.cpu, true, 'and the ladder is not stepped again on this map ' + JSON.stringify({ c: Q._cpu, g: Q._gpu, jump: Q._jumpNext, spent: Q._spent, check: Q._stepCheck, taken: Q._taken }));
        Q.mapOpened(6);
        assert.equal(Q._spent.cpu, false, 'another map is judged afresh');
    });
});

test('with the GPU\'s own time the longer of the two is what the frame waits for, and a near tie goes to the GPU', () => {
    assert.equal(Q.mainThreadBound(10, 14, 16, 60), false, 'the GPU takes longer');
    assert.equal(Q.mainThreadBound(14, 10, 16, 60), true, 'the main thread takes longer');
    assert.equal(Q.mainThreadBound(14, 13, 16, 60), false, 'within a tenth: the GPU, whose work also costs the processor its clock on a shared budget');
    assert.equal(Q.mainThreadBound(14, NaN, 16, 60), true, 'no timer: the main thread\'s share of the frame decides, as before');
    assert.equal(Q.mainThreadBound(5, NaN, 16, 60), false);
});

test('a slow GPU with a busy main thread beside it is stepped down along the GPU when the timer says so', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        // The main thread fills the frame (the old rule would blame it), but the GPU takes longer.
        const real = Q.GpuClock.take;
        Q.GpuClock.take = () => [24, 22, 17, 15, 13, 11][Q._gpu];
        try {
            play(40, q => { const gpu = [24, 22, 17, 15, 13, 11][q.g]; return { frame: Math.max(gpu, 12), busy: 12 }; });
        } finally { Q.GpuClock.take = real; }
        assert.equal(Q._cpu, 0, 'the main thread\'s levels are left alone');
        assert.ok(Q._gpu >= 2, 'the GPU\'s levels step: ' + Q._gpu);
    });
});

test('a higher target steps a machine down further, and the default 60 leaves the same machine alone', () => {
    const machine = q => ({ frame: [11, 10, 9, 8, 7, 6][q.g], busy: 4 });
    inGame({}, () => {
        const clock = { now: 1000 };
        title(2, clock, 1000 / 240);
        Q.mapOpened(5);
        play(30, machine, clock, 1000 / 240);
        assert.deepEqual([Q.g, Q.c], [0, 0], '90 a second is plenty for 60');
    });
    inGame({}, () => {
        Q.TARGET_FPS = 120;
        const clock = { now: 1000 };
        title(2, clock, 1000 / 240);
        Q.mapOpened(5);
        const rate = play(60, machine, clock, 1000 / 240);
        assert.ok(Q.g >= 2, 'down until it holds 120: level ' + Q.g);
        assert.ok(rate >= 110, 'about 120 a second: ' + rate);
    });
});

test('the default target keeps the game\'s 60: a window under it by SLOW is a step down', () => {
    assert.equal(Reactor3D.Quality.TARGET_FPS, 63);
    assert.ok(Reactor3D.Quality.TARGET_FPS * (1 - Reactor3D.Quality.SLOW) >= 59.8);
});

test('the deeper levers reach the systems they are for', () => {
    const lighting = source('reactor_3d_lighting.js');
    assert.match(lighting, /const Q = Reactor3D\.Quality, lite = !!\(Q && Q\.shadowMode && Q\.shadowMode\(\) === "lite"\);/, 'lite shadows');
    assert.match(lighting, /Q && Q\.volumeEvery \? Q\.volumeEvery\(\) : 1/, 'the moving lights\' bake');
    assert.match(lighting, /wanted = this\.enabled && !\(Q && Q\.halo && !Q\.halo\(\)\)/, 'the halo');
    assert.match(source('reactor_3d.js'), /\|\| Reactor3D\.Quality\.detail\(\) > 1;/, 'distance levels on any tier once the level allows more error');
    // Each ladder only ever gives things up as it goes down.
    const order = Q.SHADOW_MODES;
    for (const ladder of [Q.GPU, Q.CPU]) for (let i = 1; i < ladder.length; i++) {
        const a = ladder[i - 1], b = ladder[i];
        assert.ok(order.indexOf(b.shadows) >= order.indexOf(a.shadows), 'shadows never come back lower down');
        assert.ok((b.volumeEvery || 1) >= (a.volumeEvery || 1));
        if (a.scale !== undefined) { assert.ok(b.scale <= a.scale); assert.ok(b.detail >= a.detail); assert.ok(!(b.halo && !a.halo)); }
        if (a.reach !== undefined) { assert.ok(b.reach <= a.reach); assert.ok(b.share <= a.share); }
    }
});

test('on a fast screen a map\'s arrival is rested in seconds, not frames: its loading is not judged as play', () => {
    inGame({}, () => {
        // 180 Hz: the first REST_TICKS frames pass in 0.7 s, and the arrival's loading frames came after them.
        const clock = { now: 1000 }, fast = 1000 / 180;
        title(2, clock, fast);
        Q.tickBegin(clock.now); Q.mapOpened(5);
        play(0.7, () => ({ frame: fast, busy: 2 }), clock, fast);
        // Two and a half seconds of loading (North Haven's arrival settles in about that): 40 ms frames, the main thread busy.
        play(2.5, () => ({ frame: 40, busy: 35 }), clock, fast);
        assert.deepEqual([Q.g, Q.c], [0, 0], 'the arrival is not a slow machine');
        // Then the play itself, fast: nothing changes.
        play(10, () => ({ frame: fast, busy: 3 }), clock, fast);
        assert.deepEqual([Q.g, Q.c], [0, 0]);
        // The same stall well after the rest is judged.
        play(5, () => ({ frame: 40, busy: 35 }), clock, fast);
        assert.deepEqual([Q.g, Q.c], [1, 0], 'a real slow stretch is judged: off the whole picture first');
        play(8, () => ({ frame: 40, busy: 35 }), clock, fast);
        assert.equal(Q.c, 2, 'then the main thread is stepped down (twice: 25 of 60 frames)');
    });
});

test('a weak GPU with no levels of its own starts a few levels down; any other starts at the full picture', () => {
    const had = global.Graphics;
    try {
        global.Graphics = { gpuTier: 'weak', gpuDescription: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)' };
        inGame({ graphicsAuto: null }, saves => {
            Q.refresh();
            assert.deepEqual([Q.g, Q.c], Q.WEAK_START, 'integrated graphics: the first map is not spent at the full picture');
            assert.equal(saves.length, 1, 'and kept as this machine\'s');
        });
        global.Graphics = { gpuTier: 'full', gpuDescription: 'NVIDIA GeForce RTX 5070' };
        inGame({ graphicsAuto: null }, saves => {
            Q.refresh();
            assert.deepEqual([Q.g, Q.c], [0, 0]);
            assert.equal(saves.length, 0, 'nothing to write');
        });
    } finally { global.Graphics = had; }
});

test('frames that take two refreshes are a stutter the average hides: Auto takes a step for them', () => {
    // Nine frames of 15 ms and one of 33.3 (two refreshes at 60 Hz): about 60 a second on average, a tenth of the frames shown twice as long.
    const stutter = () => { let n = 0; return () => ({ frame: ++n % 10 === 0 ? 33.3 : 15, busy: 6 }); };
    inGame({}, () => {
        Q._missMs = Infinity;
        play(14, stutter());
        assert.ok(Q.lastWindow.missed > Q.MISS_SHARE, 'the window knows its long frames');
        assert.ok(Q._gpu + Q._cpu >= 1, 'a level is given up for even frames');
    });
    // One frame in thirty: the odd long frame of any game. Nothing moves.
    const rare = () => { let n = 0; return () => ({ frame: ++n % 30 === 0 ? 33.3 : 16.2, busy: 6 }); };
    inGame({}, () => {
        Q._missMs = Infinity;
        play(14, rare());
        assert.deepEqual([Q._gpu, Q._cpu], [0, 0]);
    });
    // A machine that holds its refresh has no such frames at all.
    inGame({}, () => {
        Q._missMs = Infinity;
        play(14, () => ({ frame: 1000 / 60, busy: 5 }));
        assert.equal(Q.lastWindow.missed, 0);
        assert.deepEqual([Q._gpu, Q._cpu], [0, 0]);
    });
});

test('frames that keep stopping are a verdict themselves: two levels at once, the two ladders in turn (runtime 20261110.10)', () => {
    // (Q is the file's own: Reactor3D.Quality.)
    const saved = { away: Q.away, loading: Q.loading, setting: Q.setting, keep: Q.keep, gpu: Q._gpu, cpu: Q._cpu, rest: Q._rest, until: Q._restUntil, enabled: Q.enabled };
    Q.away = () => false; Q.loading = () => false; Q.setting = () => 'auto'; Q.keep = () => {}; Q.enabled = true;
    try {
        Q._gpu = 0; Q._cpu = 0; Q._rest = 0; Q._restUntil = 0; Q._stalls = 0; Q._stallKind = 'cpu'; Q._taken = []; Q._last = 0; Q.clearWindow();
        let now = 100000;
        const frame = gap => { now += gap; Q._tickStart = now - 5; Q._worldTick = false; Q.worldTick(now); Q.tickEnd(now); };
        frame(16);
        // Two stops in ten seconds of play: not yet.
        for (let i = 0; i < 2; i++) { frame(400); for (let k = 0; k < 20; k++) frame(17); }
        assert.deepEqual([Q._gpu, Q._cpu], [0, 0]);
        assert.equal(Q._stalls, 2);
        // The third: two levels of the GPU's ladder, and a rest.
        frame(300);
        assert.deepEqual([Q._gpu, Q._cpu], [2, 0]);
        assert.ok(Q._rest > 0, 'the step rests');
        // Stops while it rests (the step's own) are not counted.
        Q._rest = 3; frame(400); frame(400); frame(400);
        assert.deepEqual([Q._gpu, Q._cpu], [2, 0]);
        Q._rest = 0; Q._restUntil = 0;
        // Still stopping: the main thread's ladder next.
        for (let i = 0; i < 3; i++) { frame(350); frame(17); }
        assert.deepEqual([Q._gpu, Q._cpu], [2, 2]);
        // A long gap is the game stopped, not a stall; nor is anything counted while the player is away.
        Q._rest = 0; Q._restUntil = 0; Q._stalls = 0;
        frame(5000); frame(17); frame(5000); frame(17); frame(5000); frame(17);
        assert.deepEqual([Q._gpu, Q._cpu], [2, 2]);
        Q.away = () => true;
        for (let i = 0; i < 4; i++) { frame(400); frame(17); }
        assert.deepEqual([Q._gpu, Q._cpu], [2, 2]);
        Q.away = () => false;
        // Stops spread thinner than three in ten seconds are a hitch now and then.
        // (Counted by the steps taken for stalls: the windows between them are judged as any are.)
        Q._stalls = 0;
        const before = Q.stallSteps;
        for (let i = 0; i < 4; i++) { frame(400); for (let k = 0; k < 400; k++) frame(15); }
        assert.equal(Q.stallSteps, before);
        Q._gpu = 2; Q._cpu = 2; Q._rest = 0; Q._restUntil = 0; Q._stalls = 0; Q._probe = null; Q._stepCheck = null;
        // Switched off, never.
        const stalls = Q.STALLS; Q.STALLS = 0;
        try { for (let i = 0; i < 5; i++) { frame(400); frame(17); } } finally { Q.STALLS = stalls; }
        assert.deepEqual([Q._gpu, Q._cpu], [2, 2]);
    } finally {
        Object.assign(Q, { away: saved.away, loading: saved.loading, setting: saved.setting, keep: saved.keep, _gpu: saved.gpu, _cpu: saved.cpu, _rest: saved.rest, _restUntil: saved.until, enabled: saved.enabled, _stalls: 0, _taken: [] });
        Q.clearWindow();
    }
});

test('a record from before the full-size level keeps the picture it stepped down to, one number higher', () => {
    inGame({ graphicsAuto: { version: 3, gpu: 2, cpu: 1, half: false } }, () => {
        Q.refresh();
        assert.deepEqual([Q.g, Q.c], [3, 1], 'the same size, detail and shadows as it settled on');
        assert.equal(Q.scale(), 0.83);
    });
    inGame({ graphicsAuto: { version: 3, gpu: 0, cpu: 0, half: false } }, () => {
        Q.refresh();
        assert.deepEqual([Q.g, Q.c], [0, 0], 'a machine that never stepped down starts at the whole picture');
        assert.equal(Q.full(), true);
    });
    inGame({}, () => {
        Q.refresh();
        assert.deepEqual([Q.g, Q.c], [0, 0]);
        assert.equal(Q.full(), true, 'a machine nothing is known of starts at the whole picture');
    });
    assert.equal(Q.GPU[0].full, true);
    assert.equal(Q.GPU.filter(level => level.full).length, 1);
    assert.deepEqual(Q.WEAK_START, [3, 2], 'integrated graphics start where they did: 0.83 of the plain size');
});


test('a machine short of its frames leaves the whole picture first, whatever its frame waits for', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        // A main thread that fills the frame at every level (the Iris Xe laptop, 2026-11-11): it walked the main
        // thread's ladder to the bottom and stayed at the whole picture, 1.8 times the pixels of the plain one.
        const machine = q => { const busy = [30, 26, 24, 22, 21, 21][q.c]; return { frame: vsync(busy), busy }; };
        play(8, machine);
        assert.equal(Q.full(), false, 'the first step is off the whole picture');
        assert.deepEqual([Q._gpu, Q._cpu], [1, 0], 'one GPU level, before any of the main thread\'s');
        assert.equal(Q._stepCheck, null, 'the step is not weighed: it is not taken back for buying nothing');
        play(200, machine);
        assert.ok(Q._gpu >= 1, 'and the whole picture is not gone back to while frames are short');
        assert.ok(Q._cpu > 0, 'the main thread\'s ladder is walked after it: ' + Q._cpu);
    });
    inGame({ graphicsAuto: { version: 3, gpu: 0, cpu: 5, half: false } }, () => {
        Q.refresh();
        assert.deepEqual([Q.g, Q.c], [1, 5], 'an older record that had stepped the main thread down keeps the plain picture, not the whole one');
    });
});

test('a GPU with time to spare is given levels back, but never the whole picture', () => {
    inGame({}, () => {
        Q.refresh(); Q._gpu = 2; Q._cpu = 5; Q._taken = ['gpu', 'gpu'];
        assert.equal(Q.spareGpu(60, 16, 5), true, 'a third of the main thread\'s time: a level comes back');
        assert.equal(Q._gpu, 1);
        Q._gpuReturn = null;
        assert.equal(Q.spareGpu(60, 16, 5), false, 'from the plain picture there is nothing to give back this way');
        assert.equal(Q._gpu, 1, 'the whole picture is the map-opening step\'s to try, and a short window\'s to leave');
        assert.equal(Q.full(), false);
    });
});

test('a machine that stalls drawing as fast as it can is held to the game\'s rate, and one that does not is left alone', () => {
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const from = core.indexOf('Graphics.FrameGovernor = {'), to = core.indexOf('\nGraphics._onTick = function');
    assert.ok(from > 0 && to > from);
    const make = () => {
        const ticker = { maxFPS: 0 }, store = new Map();
        const G = new Function('Graphics', 'localStorage', 'Reactor3D', 'document', 'SceneManager', core.slice(from, to) + '\nreturn Graphics.FrameGovernor;')(
            { _app: { ticker }, gpuDescription: 'a card' }, { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
            { Quality: { device: () => 'a card / 8', loading: () => false, enabled: false } }, { hidden: false, hasFocus: () => true }, { isSceneChanging: () => false });
        G.screenHz = 60;
        return { G, ticker, store };
    };
    /** `seconds` of frames `ms` apart, with a frame of `stall` ms every `every` frames. */
    const run = (G, clock, seconds, ms, stall = 0, every = 0) => { let n = 0; for (const until = clock.now + seconds * 1000; clock.now < until;) { clock.now += every && ++n % every === 0 ? stall : ms; G.tick(clock.now); } };
    // 137 frames a second with a 200 ms frame about every second (the Iris Xe laptop, 2026-11-11): held within two windows.
    let { G, ticker, store } = make(); let clock = { now: 1000 };
    run(G, clock, 16, 7.3, 200, 110);
    assert.equal(G.held, true);
    assert.ok(ticker.maxFPS >= G.HOLD && ticker.maxFPS <= G.MOST, 'the ticker is asked for a rate: ' + ticker.maxFPS);
    assert.equal(store.get(G.key()), '1', 'and the verdict kept for this graphics device');
    assert.ok(G.wanted < G.HOLD, 'Auto asks a held machine for what the hold delivers');
    // The next session starts held; release forgets it.
    const again = new Function('Graphics', 'localStorage', 'Reactor3D', 'document', 'SceneManager', core.slice(from, to) + '\nreturn Graphics.FrameGovernor;')(
        { _app: { ticker: { maxFPS: 0 } }, gpuDescription: 'a card' }, { getItem: k => store.get(k) || null, setItem() {}, removeItem: k => store.delete(k) },
        { Quality: { device: () => 'a card / 8', loading: () => false, enabled: false } }, { hidden: false, hasFocus: () => true }, { isSceneChanging: () => false });
    again.screenHz = 60; again.tick(5000);
    assert.equal(again.held, true);
    again.release();
    assert.equal(again.held, false); assert.equal(store.has(again.key()), false);
    // Fast and even (a desktop at 500 a second), slow with stalls (a machine short of 60: Auto's business), and a few
    // stalls at speed (something loading now and then): none is held.
    for (const [ms, stall, every, why] of [[2, 0, 0, 'fast and even'], [22, 120, 40, 'under the rate that is past the game\'s'], [7.3, 200, 900, 'a stall every six seconds']]) {
        ({ G, ticker } = make()); clock = { now: 1000 };
        run(G, clock, 30, ms, stall, every);
        assert.equal(G.held, false, why);
        assert.equal(ticker.maxFPS, 0);
    }
    // A screen of 180 Hz: a machine at 150 a second is not past it, and one that stalls at 500 is held to the screen, not to 60.
    ({ G, ticker } = make()); G.screenHz = 180; clock = { now: 1000 };
    run(G, clock, 20, 6.7, 200, 110);
    assert.equal(G.held, false, 'not drawing past its screen');
    ({ G, ticker } = make()); G.screenHz = 180; clock = { now: 1000 };
    run(G, clock, 20, 2, 200, 300);
    assert.equal(G.held, true);
    assert.ok(G.rate() === 183 && ticker.maxFPS >= 183, 'held at the screen\'s refresh: ' + ticker.maxFPS);
    // The refresh not known: the hold is the map's, nothing is kept, and another map is judged afresh.
    ({ G, ticker, store } = make()); G.screenHz = 0; G._waited = G.WAIT_FRAMES; clock = { now: 1000 };
    run(G, clock, 20, 7.3, 200, 110);
    assert.equal(G.held, true); assert.equal(store.size, 0, 'no verdict kept without the screen\'s refresh');
    // The switch.
    ({ G, ticker } = make()); G.enabled = false; clock = { now: 1000 };
    run(G, clock, 16, 7.3, 200, 110);
    assert.equal(G.held, false);
    // Auto's bar under a hold.
    inGame({}, () => {
        const saved = global.Graphics;
        try { global.Graphics = { FrameGovernor: { held: true, wanted: 57 } }; assert.equal(Q.wantedPerSecond(), 57); global.Graphics = { FrameGovernor: { held: false, wanted: 57 } }; assert.equal(Q.wantedPerSecond(), 60); }
        finally { global.Graphics = saved; }
    });
});

test('no frame is begun while the graphics card still owes two', () => {
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const from = core.indexOf('Graphics.GpuPace = {'), to = core.indexOf('\nGraphics._onTick = function');
    assert.ok(from > 0 && to > from);
    // A context whose markers are reached when the test says so.
    const reached = new Set(); let made = 0, deleted = 0, flushed = 0, lost = false;
    const gl = { SYNC_GPU_COMMANDS_COMPLETE: 1, SYNC_STATUS: 2, SIGNALED: 3, UNSIGNALED: 4, fenceSync: () => ({ id: ++made }), flush: () => { flushed++; },
        getSyncParameter: sync => (reached.has(sync.id) ? 3 : 4), deleteSync: () => { deleted++; }, isContextLost: () => lost };
    const P = new Function('Graphics', core.slice(from, to) + '\nreturn Graphics.GpuPace;')({ _app: { renderer: { gl } } });
    assert.equal(P.behind(0), false, 'nothing owed: the first frame runs');
    P.mark(); assert.equal(flushed, 1, 'the marker is sent with the frame');
    assert.equal(P.behind(10), false, 'one frame owed: the next is begun (the processor works a frame ahead)');
    P.mark();
    assert.equal(P.behind(20), true, 'two owed: this tick does nothing');
    assert.equal(P.behind(30), true);
    reached.add(1);
    assert.equal(P.behind(40), false, 'the card reached the first marker: a frame is begun');
    assert.equal(deleted, 1);
    // A card that keeps up never waits.
    reached.add(2); const waited = P.waited;
    for (let i = 0; i < 50; i++) { assert.equal(P.behind(100 + i * 12), false); P.mark(); reached.add(made); }
    assert.equal(P.waited, waited);
    // Markers never reached are given up, not waited on for good.
    P.mark(); P.mark();
    assert.equal(P.behind(1000), true);
    assert.equal(P.behind(1000 + P.GIVE_UP_MS + 1), false, 'given up');
    assert.equal(P.armed(1000 + P.GIVE_UP_MS + 1), true, 'frames 12 ms apart: a machine near what it can do is paced');
    assert.equal(P.behind(2000), false, 'and nothing is owed after');
    // A lost context, and the switch.
    P.mark(); P.mark(); lost = true; assert.equal(P.behind(3000), false); lost = false;
    P.mark(); P.mark(); P.enabled = false; assert.equal(P.behind(4000), false); const count = made; P.mark(); assert.equal(made, count, 'no marker when off');
    // The tick asks first, before any update, and marks after the composite.
    assert.match(core, /Graphics\._onTick = function\(deltaTime\) \{\n\s*\/\/[^\n]*\n\s*if \(this\.GpuPace\.behind\(performance\.now\(\)\)\) return;/);
    assert.match(core, /this\._noteComposite\(\);\n\s*this\.GpuPace\.mark\(\);/);
});

test('a fast machine is not paced: no marker, no wait, until it stops as a card behind does', () => {
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');
    const from = core.indexOf('Graphics.GpuPace = {'), to = core.indexOf('\nGraphics._onTick = function');
    let made = 0, flushed = 0;
    const gl = { SYNC_GPU_COMMANDS_COMPLETE: 1, SYNC_STATUS: 2, SIGNALED: 3, UNSIGNALED: 4, fenceSync: () => ({ id: ++made }), flush: () => { flushed++; },
        getSyncParameter: () => 4, deleteSync: () => {}, isContextLost: () => false };
    const P = new Function('Graphics', core.slice(from, to) + '\nreturn Graphics.GpuPace;')({ _app: { renderer: { gl } } });
    // A thousand frames a second (an RTX 5070 in the Demo's first room): after the first few, nothing is marked.
    let now = 0;
    for (let i = 0; i < 400; i++) { now += 1; assert.equal(P.behind(now), false); P.mark(); }
    const early = made;
    for (let i = 0; i < 2000; i++) { now += 1; assert.equal(P.behind(now), false); P.mark(); }
    assert.equal(made, early, 'no marker for a frame of a machine that fast');
    assert.equal(P.armed(now), false);
    assert.equal(P.waited, 0);
    // 137 a second with a stop of 200 ms every second (the Iris Xe unpaced): held after the second stop.
    for (let s = 0; s < 2; s++) { for (let i = 0; i < 110; i++) { now += 7.3; P.behind(now); P.mark(); } now += 200; P.behind(now); P.mark(); }
    assert.equal(P.armed(now), true, 'two stops inside four seconds: paced');
    assert.equal(P._armFor, P.ARM_MS);
    const marked = made;
    now += 7.3; P.behind(now); P.mark();
    assert.ok(made > marked, 'and its frames are marked again');
    // Held, a card that then finishes over 200 frames a second was not what stopped: let go within two seconds.
    const Q2 = new Function('Graphics', core.slice(from, to) + '\nreturn Graphics.GpuPace;')({ _app: { renderer: { gl: Object.assign({}, gl, { getSyncParameter: () => 3 }) } } });
    let t = 0;
    for (let i = 0; i < 300; i++) { t += 1; Q2.behind(t); Q2.mark(); }
    Q2._armedUntil = t + 30000;
    for (let i = 0; i < 2500; i++) { t += 1; Q2.behind(t); Q2.mark(); }
    assert.equal(Q2.armed(t), false, 'a fast machine held after a map\'s arrival is let go');
    // One that paced delivers 65 a second stays held, and stays paced after the hold by its pace alone.
    const Q3 = new Function('Graphics', core.slice(from, to) + '\nreturn Graphics.GpuPace;')({ _app: { renderer: { gl: Object.assign({}, gl, { getSyncParameter: () => 3 }) } } });
    t = 0; Q3._armedUntil = 30000;
    for (let i = 0; i < 400; i++) { t += 15.4; Q3.behind(t); Q3.mark(); }
    assert.equal(Q3.armed(t), true);
    for (let i = 0; i < 2000; i++) { t += 15.4; Q3.behind(t); Q3.mark(); }
    assert.ok(t > 30000);
    assert.equal(Q3.armed(t), true, 'frames 15 ms apart are paced, hold or no hold');
});

test('frames paced in pairs by the graphics card are not frames shown late', () => {
    // 10 ms and then 25, two inside two refreshes: 57 a second (the Iris Xe laptop under Graphics.GpuPace, 2026-11-11).
    const pairs = () => { let n = 0; return () => ({ frame: ++n % 2 ? 10 : 25, busy: 7 }); };
    inGame({}, () => {
        Q._missMs = Infinity;
        play(20, pairs());
        assert.equal(Q.lastWindow.missed, 0, 'the longer gap of a pair is not a missed refresh');
        assert.deepEqual([Q._gpu, Q._cpu], [0, 0], 'and no level is given up for it');
    });
});

test('the game in play is short of its frames when their running average is 15% over the frame asked for; a fade and a pause are not counted', () => {
    const P = Reactor3D.FramePressure, savedNow = P.now, savedNeighbors = Reactor3D.Neighbors;
    let clock = 1000;
    P.now = () => clock;
    const frames = (count, ms) => { for (let i = 0; i < count; i++) { clock += ms; P.frame(); } };
    try {
        inGame({}, () => {
            Reactor3D.Neighbors = { _dark: false };
            P._last = 0; P._average = 0;
            assert.equal(P.short(), false, 'nothing measured yet');
            frames(40, 1000 / 60);
            assert.equal(P.short(), false, '60 a second of 60 asked for');
            frames(40, 25);
            assert.equal(P.short(), true, '40 a second');
            frames(60, 1000 / 60);
            assert.equal(P.short(), false, 'and back');
            // A pause is not a frame.
            const before = P._average;
            clock += 3000; P.frame();
            assert.equal(P._average, before);
            // Long frames under the black of a fade are by design: forgotten, and nothing is known until play goes on.
            frames(40, 25);
            assert.equal(P.short(), true);
            Reactor3D.Neighbors._dark = true;
            frames(3, 80);
            assert.equal(P.short(), false);
            Reactor3D.Neighbors._dark = false;
            frames(1, 1000 / 60);
            assert.equal(P.short(), false, 'the first frame after has nothing to be measured from');
            // No frame for a while (a map loading): not short, so background work runs at full strength.
            frames(40, 25);
            clock += 600;
            assert.equal(P.short(), false);
            frames(2, 25);
            P.enabled = false;
            try { assert.equal(P.short(), false); } finally { P.enabled = true; }
        });
    } finally { P.now = savedNow; Reactor3D.Neighbors = savedNeighbors; P._last = 0; P._average = 0; }
    assert.match(source('reactor_sprites.js'), /Graphics\.worldFrameCount = \(Graphics\.worldFrameCount \|\| 0\) \+ 1;\s+if \(Reactor3D\.FramePressure\) Reactor3D\.FramePressure\.frame\(\);/);
});
