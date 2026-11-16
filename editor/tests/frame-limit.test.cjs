'use strict';
// Frames held to the refresh of the monitor the game's window is on (Graphics.FrameLimit, runtime/reactor_core.js;
// the monitor asked of the system in runtime/reactor_main.js). Owner, 2026-11-14: an RTX 5070 drew 600 frames a
// second for a monitor that shows 180, the card full the whole time; F2 is to go on showing what the machine
// makes of the game.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, 'runtime', file), 'utf8');
const core = read('reactor_core.js');

function limit(globals = {}) {
    const from = core.indexOf('Graphics.FrameLimit = {'), to = core.indexOf('\n/**\n * No frame is begun while the graphics card still owes two.');
    assert.ok(from > 0 && to > from);
    const store = Object.assign({ RPG_REACTOR_SCREEN_HZ: 180 }, globals.globalThis);
    const L = new Function('Graphics', 'globalThis', 'ConfigManager', 'Reactor3D', 'setTimeout', 'MessageChannel', 'performance', 'window', 'document',
        core.slice(from, to) + '\nreturn Graphics.FrameLimit;')({}, store, globals.config || { frameLimit: true }, globals.reactor, undefined, undefined, { now: () => 0 }, undefined, undefined);
    return { L, store };
}

test('frames are begun on an even schedule at the monitor\'s refresh, and a late one does not push the rest', () => {
    const { L } = limit();
    assert.equal(L.rate(), 180);
    // Ticks every 0.4 ms (a machine with frames to spare): which of them begin a frame.
    const begun = [];
    for (let now = 1000; now < 2000; now += 0.4) { if (L.wait(now)) continue; L.begun(now); begun.push(now); }
    assert.ok(begun.length >= 179 && begun.length <= 181, 'a second holds the monitor\'s 180: ' + begun.length);
    const gaps = begun.slice(1).map((t, i) => t - begun[i]);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 0.81, 'evenly, to the ticks\' own spacing: ' + Math.min(...gaps).toFixed(2) + ' to ' + Math.max(...gaps).toFixed(2));
    assert.ok(L.skipped > 2000, 'the ticks between do nothing');
    // One frame 3 ms late: the next is due when it was due, so the two after come sooner and the schedule holds.
    const { L: late } = limit(); let at = 1000; const starts = [];
    for (let i = 0; i < 6; i++) { while (late.wait(at)) at += 0.1; if (i === 2) at += 3; late.begun(at); starts.push(at); at += 0.1; }
    assert.ok(Math.abs((starts[5] - starts[0]) - 5 * 1000 / 180) < 0.5, 'five frames later it is where the schedule says: ' + (starts[5] - starts[0]).toFixed(2));
    // A stop of a quarter second: the schedule starts again from there, with no burst of frames to make it up.
    const { L: stopped } = limit(); stopped.begun(1000); assert.equal(stopped.wait(1250), false); stopped.begun(1250);
    assert.equal(stopped.wait(1251), true); assert.equal(stopped.wait(1250 + 1000 / 180 + 0.01), false);
});

test('unlimited by choice, and where the system does not say what the monitor shows', () => {
    const off = limit({ config: { frameLimit: false } }).L;
    assert.equal(off.rate(), 0);
    for (let now = 0; now < 50; now += 0.3) assert.equal(off.wait(now), false);
    const unknown = limit({ globalThis: { RPG_REACTOR_SCREEN_HZ: 0 } }).L;
    assert.equal(unknown.rate(), 0, 'nothing is assumed: no number of the game\'s own');
    assert.equal(unknown.wait(5), false);
    assert.equal(limit({ globalThis: { RPG_REACTOR_SCREEN_HZ: 143.88 } }).L.rate(), 143.88, 'the monitor\'s own rate, as the system gives it');
    assert.equal(limit({ globalThis: { RPG_REACTOR_SCREEN_HZ: 5000 } }).L.rate(), 0);
    assert.doesNotMatch(core.slice(core.indexOf('Graphics.FrameLimit = {'), core.indexOf('Graphics.GpuPace = {')), /\b(60|120|144|240)\b/, 'no refresh rate is written into the limit');
});

test('F2 shows what the frame\'s work would allow while the limit is met, and the frames that came when they fall short', () => {
    // 180 frames a second, each 1.2 ms of drawing, with 60 updates of 1 ms: the main thread could draw (1000 - 60) / 1.2.
    const { L } = limit();
    let now = 0;
    for (let i = 0; i < 360; i++) { now += 1000 / 180; L.note(now, i % 3 === 0 ? 1 : 0, 1.2, true); }
    assert.ok(Math.abs(L.capable - 940 / 1.2) < 12, 'by the main thread: ' + L.capable.toFixed(0));
    assert.equal(Math.round(L.shown(180)), Math.round(L.capable), 'the limit met: what the work allows');
    assert.equal(L.shown(120), 120, 'fewer frames than the monitor shows: the frames that came');
    assert.equal(L.shown(165), L.capable, 'a wobble under the limit is not a machine short of it');
    // The graphics card is the slower of the two: its own time for a frame says.
    const card = limit({ reactor: { Quality: { GpuClock: { recent: 4 } } } }).L;
    now = 0; for (let i = 0; i < 360; i++) { now += 1000 / 180; card.note(now, 0, 1.2, true); }
    assert.ok(Math.abs(card.capable - 250) < 3, 'by the card: ' + card.capable.toFixed(0));
    assert.equal(card.spare(), true, '250 for a monitor of 180: the limit is what paces it');
    card.capable = 185; assert.equal(card.spare(), false);
    // Unlimited, F2 is the count of frames, as it always was.
    const off = limit({ config: { frameLimit: false } }).L; off.capable = 700;
    assert.equal(off.shown(612), 612);
    assert.match(core, /const count = this\._showFps \? \(Graphics\.FrameLimit \? Graphics\.FrameLimit\.shown\(this\.fps\) : this\.fps\) : this\.duration;/);
    // No words beside the number: the label is "FPS" (or "ms"), as it was.
    assert.match(core, /this\._labelDiv\.textContent = this\._showFps \? "FPS" : "ms";\n\s*this\._numberDiv\.textContent = count\.toFixed\(0\);/);
});

test('the limit comes before the card\'s pacing in a tick, spends nothing on a tick that is not begun, and paces a machine with work to spare alone', () => {
    assert.match(core, /Graphics\._onTick = function\(deltaTime\) \{\n\s*\/\/[^\n]*\n\s*if \(this\.FrameLimit\.wait\(performance\.now\(\)\)\) return;\n\s*\/\/[^\n]*\n\s*if \(this\.GpuPace\.behind\(performance\.now\(\)\)\) return;\n\s*this\.FrameLimit\.begun\(performance\.now\(\)\);/);
    const { L } = limit();
    L.begun(1000);
    const due = 1000 + 1000 / 180 + 0.01;
    assert.equal(L.wait(due), false); assert.equal(L.wait(due + 0.2), false, 'due and not begun: due still');
    assert.match(core, /if \(typeof Graphics !== "undefined" && Graphics\.FrameLimit && Graphics\.FrameLimit\.spare\(\)\) return false;/);
    // The limit has a clock of its own: the browser's ticks alone left 22 ms between frames.
    assert.match(core, /this\._channel\.port2\.postMessage\(0\);/);
    assert.match(core, /try \{ ticker\.update\(performance\.now\(\)\); \}/);
});

test('the monitor the window is on is found among the system\'s own list of monitors', () => {
    const main = read('reactor_main.js');
    const a = main.indexOf('const ReactorScreen = {'), b = main.indexOf('if (typeof globalThis !== "undefined") globalThis.ReactorScreen');
    const S = new Function(main.slice(a, b) + 'return ReactorScreen;')();
    // As this desktop's own answers read (three monitors of three rates, KDE under Wayland, 2026-11-14).
    const xrandr = ['Screen 0: minimum 16 x 16, current 6400 x 1576, maximum 32767 x 32767',
        'HDMI-A-1 connected 1920x1080+2560+174 (normal left inverted right x axis y axis) 598mm x 336mm', '   1920x1080    143.88*+', '   1440x1080    143.80  ',
        'DP-1 connected primary 2560x1440+0+0 (normal left inverted right x axis y axis) 597mm x 336mm', '   2560x1440     59.95 +  179.94*  143.97  ',
        'DP-2 connected 1920x1080+4480+496 (normal left inverted right x axis y axis) 521mm x 293mm', '   1920x1080     60.00 +   99.90*  ',
        'DP-3 disconnected (normal left inverted right x axis y axis)'].join('\n');
    const outputs = S.parseXrandr(xrandr);
    assert.deepEqual(outputs.map(o => [o.name, o.x, o.y, o.w, o.h, o.hz, o.primary]), [['HDMI-A-1', 2560, 174, 1920, 1080, 143.88, false], ['DP-1', 0, 0, 2560, 1440, 179.94, true], ['DP-2', 4480, 496, 1920, 1080, 99.9, false]]);
    assert.equal(S.refreshAt(outputs, 1280, 700), 179.94); assert.equal(S.refreshAt(outputs, 3500, 700), 143.88); assert.equal(S.refreshAt(outputs, 5400, 1000), 99.9);
    assert.equal(S.refreshAt(outputs, 99999, 5), 179.94, 'on none of them: the primary one');
    assert.equal(S.refreshAt(outputs.filter(o => !o.primary), 99999, 5), 0, 'no primary and two to choose from: not guessed');
    assert.equal(S.refreshAt([outputs[0]], NaN, NaN), 143.88, 'the only monitor');
    assert.equal(S.refreshAt([], 0, 0), 0);
    const kscreen = ['Output: 1 DP-2 9370', '\tenabled', '\tconnected', '\tpriority 3', '\tModes:  1:1920x1080@60.00!  2:1920x1080@100.00*  3:1920x1080@59.94', '\tGeometry: 4480,496 1920x1080',
        'Output: 2 DP-1 cf52', '\tenabled', '\tconnected', '\tpriority 1', '\tModes:  22:2560x1440@60.00!  23:2560x1440@180.00*  24:2560x1440@170.00', '\tGeometry: 0,0 2560x1440',
        'Output: 3 DP-3 aaaa', '\tdisabled', '\tdisconnected', '\tpriority 0', '\tModes:', '\tGeometry: 0,0 0x0'].join('\n');
    const k = S.parseKscreen(kscreen);
    assert.deepEqual(k.map(o => [o.name, o.hz, o.primary, o.x]), [['DP-2', 100, false, 4480], ['DP-1', 180, true, 0]]);
    assert.equal(S.refreshAt(k, 100, 100), 180);
    // Asked on Windows and on Linux, and again when the window has moved.
    assert.match(main, /globalThis\.RPG_REACTOR_ASK_SCREEN = \(\) => this\.askScreenRefresh\(\);/);
    assert.match(main, /run\("xrandr", \["--current"\]/); assert.match(main, /run\("kscreen-doctor", \["-o"\]/);
    assert.match(core, /if \(this\._place && now - this\._asked >= this\.ASK_MS\) \{ this\._asked = now; try \{ globalThis\.RPG_REACTOR_ASK_SCREEN\(\); \}/);
});

test('Options has a Frame Rate row where the monitor\'s refresh is known, and the choice is kept', () => {
    const windows = read('reactor_windows.js'), managers = read('reactor_managers.js'), scenes = read('reactor_scenes.js');
    assert.match(windows, /Window_Options\.FRAME_TEXT = \{ name: "Frame Rate", monitor: "Monitor", unlimited: "Unlimited" \};/);
    assert.match(windows, /if \(Window_Options\.offersFrameRate\(\)\) this\.addCommand\(Window_Options\.FRAME_TEXT\.name, "frameLimit"\);/);
    assert.match(windows, /return value === false \? Window_Options\.FRAME_TEXT\.unlimited : Window_Options\.FRAME_TEXT\.monitor;/);
    assert.match(scenes, /\+ \(Window_Options\.offersFrameRate && Window_Options\.offersFrameRate\(\) \? 1 : 0\)/);
    assert.match(managers, /ConfigManager\.frameLimit = true;/, 'the limit is on unless the player says');
    assert.match(managers, /config\.frameLimit = this\.frameLimit;/);
    assert.match(managers, /this\.frameLimit = this\.readFlag\(config, "frameLimit", true\);/);
});
