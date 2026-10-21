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
    const saved = { ConfigManager: global.ConfigManager, document: global.document, enabled: Q.enabled };
    const saves = [];
    global.ConfigManager = Object.assign({ graphicsQuality: 'auto', graphicsAuto: null, save() { saves.push(JSON.parse(JSON.stringify(this.graphicsAuto))); } }, config);
    Object.assign(Q, { enabled: true, _gpu: 0, _cpu: 0, _half: false, g: 0, c: 0, h: false, _taken: [], _loaded: false, _ceiling: false, _probe: null, _probeLeft: 0,
        _rest: 0, _calm: 0, _slowRun: 0, _mapId: 0, _last: 0, _lastDraw: 0, _refreshMs: Infinity, _tickLast: 0, _intervalCount: 0 });
    Q.clearWindow();
    try { return fn(saves); } finally {
        global.ConfigManager = saved.ConfigManager; global.document = saved.document;
        Object.assign(Q, { enabled: saved.enabled, _gpu: 0, _cpu: 0, _half: false, g: 0, c: 0, h: false, _taken: [], _loaded: false, _ceiling: false, _probe: null, _mapId: 0, _last: 0, _lastDraw: 0, _rest: 0,
            _refreshMs: Infinity, _tickLast: 0, _intervalCount: 0 });
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
        // 22 ms of GPU at the full size, less at each level: two refreshes a frame until it fits one.
        const machine = q => ({ frame: vsync([22, 18.5, 14, 13][q.g]), busy: 5 });
        const rate = play(40, machine);
        assert.deepEqual([Q.g, Q.c, Q.h], [2, 0, false], 'down to the size it holds 60 at, and no further');
        assert.ok(rate >= 59 && rate <= 61, 'sixty a second again: ' + rate);
        assert.ok(Q.scale() < 0.7);
        assert.deepEqual(saves[saves.length - 1], { gpu: 2, cpu: 0, half: false }, 'the machine\'s levels are kept for its next session');
    });
});

test('a slow main thread is stepped along its own levels, then to the half rate, and the picture keeps its size', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        // 30 ms of main thread a drawn frame, 26 and 24 at the CPU levels: never inside a refresh.
        const machine = q => { const busy = [30, 26, 24][q.c]; return { frame: vsync(busy), busy }; };
        const rate = play(60, machine);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 2, true]);
        assert.equal(Q.scale(), 1, 'a smaller picture does nothing for a slow main thread');
        assert.equal(Q.drawEvery(), 2);
        assert.ok(rate >= 29 && rate <= 31, 'a draw that runs over a refresh is followed by the next at once: still 30 a second, not 20: ' + rate);
    });
});

test('a little short with a kind spent is left alone rather than halved', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        Q._loaded = true; Q._cpu = Q.CPU.length - 1; Q.refresh();
        assert.equal(Q.stepDown('cpu', 0.15), null, 'fifty a second is not worth thirty');
        assert.equal(Q.stepDown('cpu', 0.3), 'half');
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
        // A 180 Hz panel is asked for 60: the game makes no more.
        const clock = { now: 1000 };
        title(2, clock, 1000 / 180);
        assert.equal(Q.wantedPerSecond(), 60);
    });
});

test('a stall, a window out of focus and the seconds after a step are not judged', () => {
    inGame({}, () => {
        Q.mapOpened(5);
        const clock = { now: 1000 };
        // A second of loading every other second: gaps, not frames.
        play(40, () => ({ frame: 1000, busy: 900 }), clock);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false], 'a frame a second apart is a stall');
        global.document = { hidden: false, hasFocus: () => false };
        play(40, () => ({ frame: 1000 / 20, busy: 45 }), clock);
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false], 'nor is a game the player has left');
        global.document = { hidden: false, hasFocus: () => true };
        play(3, () => ({ frame: 1000 / 20, busy: 45 }), clock);
        assert.equal(Q._cpu, 1, 'back in focus and failing: one window is enough');
        assert.ok(Q._rest > 0 || Q._cpu === 1);
    });
});

test('a fixed setting holds its level whatever the frames do, and the switch draws the full picture', () => {
    inGame({ graphicsQuality: 'medium' }, saves => {
        Q.mapOpened(5);
        play(30, () => ({ frame: 1000 / 20, busy: 45 }));
        assert.deepEqual([Q.g, Q.c, Q.h], [1, 1, false]);
        assert.deepEqual(saves, []);
        ConfigManager.graphicsQuality = 'low';
        Q.refresh();
        assert.deepEqual([Q.g, Q.c, Q.h], [Q.GPU.length - 1, Q.CPU.length - 1, false], 'the half rate is the automatic levels\' alone');
        assert.equal(Q.shadows(), false);
        ConfigManager.graphicsQuality = 'high';
        Q.refresh();
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false]);
        ConfigManager.graphicsQuality = 'low';
        Q.enabled = false;
        Q.refresh();
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false], 'the kill switch');
    });
    const saved = global.ConfigManager;
    delete global.ConfigManager;
    try { assert.equal(Q.setting(), 'high', 'no game to ask: the editor draws the full picture'); } finally { global.ConfigManager = saved; }
});

test('a machine starts its next session at the levels it settled at', () => {
    inGame({ graphicsAuto: { gpu: 2, cpu: 1, half: true } }, () => {
        Q.refresh();
        assert.deepEqual([Q.g, Q.c, Q.h], [2, 1, true]);
        assert.deepEqual(Q._taken, ['gpu', 'gpu', 'cpu', 'half']);
    });
    inGame({ graphicsAuto: { gpu: 99, cpu: -3, half: 'yes' } }, () => {
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
        global.ConfigManager.graphicsAuto = { gpu: 3, cpu: 2, half: true };
        global.ConfigManager._isLoaded = true;
        title(0.1, clock);
        assert.deepEqual([Q.g, Q.c, Q.h], [3, 2, true], 'the machine starts at the levels it settled at');
        assert.deepEqual(Q._taken, ['gpu', 'gpu', 'gpu', 'cpu', 'cpu', 'half']);
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
    inGame({ graphicsAuto: { gpu: 2, cpu: 0, half: false } }, () => {
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

test('at the half rate the world is drawn on every other frame it is asked for', () => {
    inGame({ graphicsAuto: { gpu: 0, cpu: 0, half: true } }, () => {
        Q.refresh();
        const drawn = [], frame = 1000 / 60;
        for (let i = 0; i < 8; i++) { const now = 1000 + i * frame; Q.tickBegin(now); drawn.push(Q.worldTick(now)); Q.tickEnd(now + 3); }
        assert.deepEqual(drawn, [true, false, true, false, true, false, true, false]);
        ConfigManager.graphicsQuality = 'high';
        Q.refresh();
        assert.equal(Q.worldTick(2000), true);
        assert.equal(Q.worldTick(2016), true, 'and on every one otherwise');
    });
});

test('choosing Auto again starts from the full picture', () => {
    inGame({ graphicsAuto: { gpu: 3, cpu: 2, half: true } }, saves => {
        Q.refresh();
        Q.reset();
        assert.deepEqual([Q.g, Q.c, Q.h], [0, 0, false]);
        assert.deepEqual(saves[saves.length - 1], { gpu: 0, cpu: 0, half: false });
        assert.equal(Q._ceiling, false);
    });
});

test('the levels reach what they are for', () => {
    const core = source('reactor_3d.js');
    assert.match(core, /this\.setRenderScale\(\(Reactor3D\.renderScale \|\| 1\) \* Reactor3D\.Quality\.scale\(\)\);/, 'the size the world is drawn at, as a share of the project\'s own');
    assert.match(core, /const allowed = this\.pixelError \* Reactor3D\.Quality\.detail\(\);/);
    assert.match(core, /if \(Reactor3D\.tier\(\) !== "weak" \|\| !Reactor3D\.Quality\.depthFirst\(\)\) return false;/);
    assert.match(source('reactor_3d_lighting.js'), /if \(this\.SHADOWS === "off" \|\| \(this\.Quality && !this\.Quality\.shadows\(\)\)\) return false;/);
    assert.match(source('reactor_3d_foliage.js'), /lodNow\.near = lod\.near \* quality\.foliageReach\(\); lodNow\.far = lod\.far \* quality\.foliageReach\(\); lodNow\.scale = lod\.scale \* quality\.foliageShare\(\);/);
    const sprites = source('reactor_sprites.js');
    assert.match(sprites, /quality\.mapOpened\(\$gameMap\.mapId\(\)\);\n\s*if \(!quality\.worldTick\(performance\.now\(\)\)\) return;/, 'counted after the catch-up ticks are passed by');
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
