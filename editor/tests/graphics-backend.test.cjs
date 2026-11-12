'use strict';
// The graphics backend a machine runs best on, found by playing (runtime/reactor_main.js, ReactorBackend, runtime
// 20261110.4): a backend that holds near the full picture is kept and nothing else tried; a struggling machine
// tries the others and keeps the best; one that does not start or draws nothing is never tried again.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_main.js'), 'utf8');
const block = source.slice(source.indexOf('const ReactorBackend = {'), source.indexOf('// (the end of ReactorBackend)'));
const make = () => new Function(block + '\nreturn ReactorBackend;')();

const D3D11 = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)';
const ON12 = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11on12 vs_5_0 ps_5_0, D3D11)';
const GL = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5.0)';

/** `windows` of play at `fps` of 63 wanted, `levels` given up, `missed` share of late frames. */
const record = (B, windows, fps, levels, missed = 0) => {
    const r = { windows: 0, weight: 0, rate: 0, levels: 0, missed: 0 };
    for (let i = 0; i < windows; i++) {
        r.weight = r.weight * B.DECAY + 1; r.rate = r.rate * B.DECAY + Math.min(1, fps / 63);
        r.levels = r.levels * B.DECAY + levels; r.missed = r.missed * B.DECAY + missed; r.windows++;
    }
    return r;
};

test('one card is one card through any backend, and each backend is known by its renderer string', () => {
    const B = make();
    assert.equal(B.gpuKey(D3D11), B.gpuKey(GL));
    assert.equal(B.gpuKey(D3D11), B.gpuKey(ON12));
    assert.equal(B.gpuKey(D3D11), 'intel|intel(r) iris(r) xe graphics');
    assert.notEqual(B.gpuKey(D3D11), B.gpuKey('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)'));
    assert.equal(B.current(D3D11), 'd3d11');
    assert.equal(B.current(ON12), 'd3d11on12');
    assert.equal(B.current(GL), 'gl');
    assert.equal(B.current('Apple M2'), null, 'another system: nothing to choose');
});

test('a machine that holds its rate near the full picture keeps its backend, and no other is ever tried', () => {
    const B = make();
    const fresh = { backends: {}, failed: [] };
    assert.equal(B.plan(fresh), 'd3d11', 'nothing known: the plain launch');
    const few = { backends: { d3d11: record(B, 10, 40, 6) }, failed: [] };
    assert.equal(B.plan(few), 'd3d11', 'not judged on ten windows');
    assert.equal(few.choice, null);
    const strong = { backends: { d3d11: record(B, B.MIN_WINDOWS, 144, 0) }, failed: [] };
    assert.equal(B.plan(strong), 'd3d11');
    assert.equal(strong.choice, 'd3d11', 'settled: a strong machine is left alone');
});

test('a struggling machine tries the others in turn and keeps the best', () => {
    const B = make();
    // The laptop: Direct3D 11 reaches 59 only with every level given up.
    const entry = { backends: { d3d11: record(B, B.MIN_WINDOWS, 59, 10) }, failed: [] };
    assert.equal(B.plan(entry), 'gl', 'OpenGL before Direct3D 11 on 12 (runtime 20261110.8)');
    entry.backends.gl = record(B, 5, 63, 6);
    assert.equal(B.plan(entry), 'gl', 'one under way is finished first');
    // Sampled, and not compared on the same maps: the next is tried before anything is settled.
    entry.backends.gl = record(B, 20, 63, 6);
    assert.equal(B.plan(entry), 'd3d11on12');
    entry.backends.d3d11on12 = record(B, 20, 60, 8);
    assert.equal(B.plan(entry), 'gl', 'all tried: those not plainly behind are played out, the furthest ahead first');
    assert.equal(entry.choice, null);
    entry.backends.gl = record(B, B.MIN_WINDOWS, 63, 6);
    assert.equal(B.plan(entry), 'd3d11on12');
    entry.backends.d3d11on12 = record(B, B.MIN_WINDOWS, 60, 8);
    assert.equal(B.plan(entry), 'gl');
    assert.equal(entry.choice, 'gl');
    assert.ok(B.score(entry.backends.gl) > B.score(entry.backends.d3d11) + B.MARGIN);
});

test('another backend must beat the default clearly; a plainly worse one is given up early', () => {
    const B = make();
    const close = { backends: { d3d11: record(B, B.MIN_WINDOWS, 55, 4), d3d11on12: record(B, B.MIN_WINDOWS, 55, 4), gl: record(B, B.MIN_WINDOWS, 56, 4) }, failed: [] };
    assert.equal(B.plan(close), 'd3d11');
    assert.equal(close.choice, 'd3d11');
    const bad = { backends: { d3d11: record(B, B.MIN_WINDOWS, 55, 4), d3d11on12: record(B, B.EARLY_WINDOWS, 20, 10) }, failed: [] };
    assert.equal(B.plan(bad), 'gl', 'fifteen windows at a third of the rate are enough');
});

test('a backend that fails is never planned again, and a failed choice is chosen afresh', () => {
    const B = make();
    const entry = { backends: { d3d11: record(B, B.MIN_WINDOWS, 50, 8) }, failed: [], choice: 'gl' };
    B.markFailed(entry, 'gl');
    assert.equal(entry.choice, null);
    assert.equal(B.plan(entry), 'd3d11on12');
    B.markFailed(entry, 'd3d11on12');
    assert.equal(B.plan(entry), 'd3d11');
    assert.equal(entry.choice, 'd3d11', 'nothing else left to try');
    B.markFailed(entry, 'd3d11');
    assert.deepEqual(entry.failed, ['gl', 'd3d11on12'], 'the plain launch is never failed');
});

test('a try whose picture was never seen is counted, and the second such try fails the backend', () => {
    const B = make();
    const entry = { backends: {}, failed: [], pending: null };
    B.expect(entry, 'gl');
    assert.deepEqual(entry.pending, { backend: 'gl', tries: 1 });
    // The relaunched window itself: not judged yet.
    assert.equal(B.settlePending(entry, 'gl', true), false);
    // A fresh start finds the first try unconfirmed: one more is allowed.
    assert.equal(B.settlePending(entry, 'd3d11', false), false);
    B.expect(entry, 'gl');
    assert.equal(entry.pending.tries, 2);
    assert.equal(B.settlePending(entry, 'd3d11', false), true);
    assert.deepEqual(entry.failed, ['gl']);
    assert.equal(entry.pending, null);
    B.expect(entry, 'd3d11');
    assert.equal(entry.pending, null, 'the plain launch is not a try');
});

test('windows of play add up per backend, and the score follows the recent ones', () => {
    const B = make();
    B._live = true; B._current = 'gl'; B._confirmed = true; B._entry = { backends: {}, failed: [] }; B.save = () => {};
    for (let i = 0; i < 40; i++) B.note({ perSecond: 63, wanted: 63, missed: 0, g: 1, c: 5 });
    const r = B._entry.backends.gl;
    assert.equal(r.windows, 40);
    assert.ok(Math.abs(B.score(r) - (1 - 6 * B.LEVEL_COST)) < 1e-9);
    for (let i = 0; i < 300; i++) B.note({ perSecond: 63, wanted: 63, missed: 0, g: 0, c: 0 });
    assert.ok(B.score(r) > 0.99, 'what it does now, not what it did five minutes ago');
    B._live = false;
    B.note({ perSecond: 1, wanted: 63, missed: 1, g: 5, c: 5 });
    assert.equal(r.windows, 340, 'nothing is noted where this is off');
});

test('the game asks at its start, Auto reports its windows, and nothing runs where a project chose its own', () => {
    assert.match(source, /run\(\) \{\s*this\.showLoadingSpinner\(\);[^}]*if \(ReactorBackend\.boot\(\)\) return;/);
    assert.match(source, /if \(manifest\.reactorAngle === "default"\) return null;/);
    // Not under automation, unless a test names itself (it then records and never relaunches).
    assert.match(source, /navigator\.webdriver && host !== "test"\) return null;/);
    assert.match(source, /host: host === "editor" \|\| host === "test" \? "editor" : "game"/);
    assert.match(source, /if \(own \|\| \(this\.argOf\(args, "use-angle"\) !== null && marked === null\)\) return null;/);
    const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(core, /if \(typeof ReactorBackend !== "undefined" && ReactorBackend\._live\) ReactorBackend\.note\(this\.lastWindow\);/);
});

test('a playtest starts on the plan the game left for this card, else on the guess, and tells the game the editor started it', () => {
    const PlaytestManager = require('../src/PlaytestManager.js');
    const B = make();
    const rtx = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU (0x00002560) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    const host = '--rr-angle-host=editor';
    assert.equal(PlaytestManager.gpuKey(D3D11), B.gpuKey(D3D11), 'the editor and the game name a card alike');
    assert.equal(PlaytestManager.gpuKey(GL), B.gpuKey(D3D11));
    // The plan, whatever the card's name says.
    assert.deepEqual(PlaytestManager.backendArgs('win32', D3D11, {}, 'gl'), ['--use-angle=gl', '--rr-angle=gl', host]);
    assert.deepEqual(PlaytestManager.backendArgs('win32', rtx, {}, 'gl'), ['--use-angle=gl', '--rr-angle=gl', host]);
    assert.deepEqual(PlaytestManager.backendArgs('win32', D3D11, {}, 'd3d11'), ['--rr-angle=d3d11', host], 'the plain launch, recorded');
    // No plan yet: the weak-GPU guess, or the plain launch; either way the game records it.
    assert.deepEqual(PlaytestManager.backendArgs('win32', D3D11, {}, null), ['--use-angle=d3d11on12', '--rr-angle=d3d11on12', host]);
    assert.deepEqual(PlaytestManager.backendArgs('win32', rtx, {}, null), ['--rr-angle=d3d11', host]);
    assert.deepEqual(PlaytestManager.backendArgs('win32', D3D11, {}, 'vulkan'), ['--use-angle=d3d11on12', '--rr-angle=d3d11on12', host], 'a name it does not know is no plan');
    // Left alone: another system, a project's own choice, an editor someone set up on another backend.
    assert.deepEqual(PlaytestManager.backendArgs('linux', GL, {}, 'gl'), []);
    assert.deepEqual(PlaytestManager.backendArgs('win32', D3D11, { reactorAngle: 'default' }, 'gl'), []);
    assert.deepEqual(PlaytestManager.backendArgs('win32', D3D11, { 'chromium-args': '--use-angle=gl' }, 'gl'), []);
    assert.deepEqual(PlaytestManager.backendArgs('win32', ON12, {}, 'gl'), []);
});

test('the editor reads the plan from the machine\'s own file, and not one for a failed backend or another version', () => {
    const PlaytestManager = require('../src/PlaytestManager.js');
    const os = require('node:os');
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-backend-'));
    try {
        const file = path.join(base, 'RPGReactor', 'graphics-backend.json');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const env = { LOCALAPPDATA: base };
        assert.equal(PlaytestManager.backendPlan(D3D11, fs, path, env), null, 'no file');
        const key = PlaytestManager.gpuKey(D3D11);
        fs.writeFileSync(file, JSON.stringify({ version: 1, gpus: { [key]: { plan: 'gl', failed: [] } } }));
        assert.equal(PlaytestManager.backendPlan(D3D11, fs, path, env), 'gl');
        assert.equal(PlaytestManager.backendPlan('ANGLE (NVIDIA, Some Other Card Direct3D11 vs_5_0 ps_5_0, D3D11)', fs, path, env), null, 'another card');
        fs.writeFileSync(file, JSON.stringify({ version: 1, gpus: { [key]: { plan: 'gl', failed: ['gl'] } } }));
        assert.equal(PlaytestManager.backendPlan(D3D11, fs, path, env), null);
        fs.writeFileSync(file, JSON.stringify({ version: 2, gpus: { [key]: { plan: 'gl' } } }));
        assert.equal(PlaytestManager.backendPlan(D3D11, fs, path, env), null);
        fs.writeFileSync(file, 'not json');
        assert.equal(PlaytestManager.backendPlan(D3D11, fs, path, env), null);
    } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

// --- Runtime 20261110.8: like for like, and settled in two launches where one backend is plainly ahead.
/** A backend's record with its play on each map: { mapId: [windows, fps, levels] }. */
const played = (B, maps) => {
    const whole = { windows: 0, weight: 0, rate: 0, levels: 0, missed: 0, maps: {} };
    for (const id of Object.keys(maps)) {
        const [windows, fps, levels] = maps[id], one = record(B, windows, fps, levels);
        whole.maps[id] = one;
        whole.windows += one.windows; whole.weight += one.weight; whole.rate += one.rate; whole.levels += one.levels; whole.missed += one.missed;
    }
    return whole;
};

test('a backend plainly ahead on the same map on both is chosen after a few windows of each, and the third is never tried', () => {
    const B = make();
    // The laptop in North Haven: Direct3D 11 holds 41 of 63 with two levels given up; OpenGL holds 63.
    const entry = { backends: { d3d11: played(B, { 5: [20, 41, 4] }) }, failed: [] };
    assert.equal(B.plan(entry), 'gl');
    entry.backends.gl = played(B, { 5: [B.EARLY_WINDOWS, 63, 4] });
    assert.ok(B.likeForLike(entry, 'gl'));
    assert.ok(B.ahead(entry, 'gl') >= B.CLEAR_GAP);
    assert.equal(B.plan(entry), 'gl');
    assert.equal(entry.choice, 'gl', 'settled at the second launch');
});

test('play on different maps settles nothing early: a lighter map against a heavy town says nothing of the backends', () => {
    const B = make();
    const entry = { backends: { d3d11: played(B, { 5: [20, 41, 4] }), gl: played(B, { 1: [20, 50, 2] }) }, failed: [] };
    assert.equal(B.likeForLike(entry, 'gl'), false);
    assert.equal(B.plan(entry), 'd3d11on12', 'the next is tried instead');
    assert.equal(entry.choice, null);
    // A few windows of the town on OpenGL too are not yet enough of it.
    entry.backends.gl = played(B, { 1: [20, 50, 2], 5: [B.PAIR_WINDOWS - 1, 63, 4] });
    assert.equal(B.likeForLike(entry, 'gl'), false);
    // Enough of it, and the gap there is what counts: the room's easy windows do not flatter it.
    entry.backends.gl = played(B, { 1: [20, 50, 2], 5: [B.EARLY_WINDOWS, 44, 4] });
    assert.ok(B.likeForLike(entry, 'gl'));
    assert.ok(B.ahead(entry, 'gl') < B.CLEAR_GAP, 'three frames ahead in the town is not plainly ahead');
    assert.equal(B.plan(entry), 'd3d11on12');
});

test('a choice played out and found behind the first after all is thought over again', () => {
    const B = make();
    const entry = { backends: { d3d11: played(B, { 5: [B.MIN_WINDOWS, 55, 4] }), gl: played(B, { 5: [B.MIN_WINDOWS, 45, 4] }), d3d11on12: played(B, { 5: [B.MIN_WINDOWS, 50, 4] }) }, failed: [], choice: 'gl' };
    assert.equal(B.plan(entry), 'd3d11');
    assert.equal(entry.choice, 'd3d11');
    // One still ahead, or not yet played out, stands.
    const stands = { backends: { d3d11: played(B, { 5: [20, 41, 4] }), gl: played(B, { 5: [20, 63, 4] }) }, failed: [], choice: 'gl' };
    assert.equal(B.plan(stands), 'gl');
});

test('each window is also kept by the map it was played on, a handful of maps for each backend', () => {
    const B = make();
    B._live = true; B._current = 'gl'; B._confirmed = true; B._entry = { backends: {}, failed: [] }; B.save = () => {};
    for (let i = 0; i < 12; i++) B.note({ perSecond: 63, wanted: 63, missed: 0, g: 1, c: 1, map: 5 });
    for (let i = 0; i < 3; i++) B.note({ perSecond: 30, wanted: 63, missed: 0, g: 4, c: 4, map: 7 });
    const r = B._entry.backends.gl;
    assert.equal(r.windows, 15);
    assert.equal(r.maps[5].windows, 12);
    assert.equal(r.maps[7].windows, 3);
    assert.ok(B.score(r.maps[5]) > B.score(r) && B.score(r) > B.score(r.maps[7]));
    for (let id = 10; id < 10 + B.MAX_MAPS; id++) B.note({ perSecond: 63, wanted: 63, missed: 0, g: 0, c: 0, map: id });
    assert.equal(Object.keys(r.maps).length, B.MAX_MAPS, 'the least played is let go');
    assert.ok(r.maps[5], 'not the most played');
    B.note({ perSecond: 63, wanted: 63, missed: 0, g: 0, c: 0 });
    assert.equal(r.windows, 15 + B.MAX_MAPS + 1, 'a window with no map counts for the backend as before');
});

test('the editor leaves its launcher the backend the game found for the card, and its playtests keep the plan', () => {
    const PlaytestManager = require('../src/PlaytestManager.js');
    const d3d = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    const gl = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5.0)';
    const E = (...a) => PlaytestManager.editorBackend(...a);
    assert.equal(E('win32', d3d, ['.'], 'gl', {}, false, null), 'gl');
    assert.equal(E('win32', d3d, [], 'd3d11on12', {}, false, null), 'd3d11on12');
    assert.equal(E('win32', gl, ['.', '--use-angle=gl', '--rr-editor-angle=gl'], 'gl', {}, false, null), 'gl', 'started on it by the launcher: the note stands');
    assert.equal(E('win32', gl, ['.', '--use-angle=gl', '--rr-editor-angle=gl'], 'd3d11', {}, false, null), '', 'the game changed its mind: the note goes');
    assert.equal(E('win32', d3d, ['.'], 'd3d11', {}, false, null), '', 'the browser\x27s own backend is the plan: no note');
    assert.equal(E('win32', d3d, ['.'], null, {}, false, null), '', 'no plan yet: the editor guesses nothing');
    assert.equal(E('win32', d3d, ['.'], 'vulkan', {}, false, null), '');
    assert.equal(E('win32', d3d, ['.'], 'gl', {}, false, 'default'), '', 'the person\x27s own choice');
    assert.equal(E('linux', d3d, ['.'], 'gl', {}, false, null), null);
    assert.equal(E('win32', d3d, ['.'], 'gl', {}, true, null), null, 'never under automation');
    assert.equal(E('win32', '', ['.'], 'gl', {}, false, null), null, 'no WebGL to name the card by');
    assert.equal(E('win32', d3d, ['.', '--use-angle=d3d11on12'], 'gl', {}, false, null), null, 'a backend named by hand on the command line: the note is left alone');
    assert.equal(E('win32', d3d, ['.'], 'gl', { 'chromium-args': '--use-angle=gl' }, false, null), null);
    assert.equal(PlaytestManager.editorHop(['.', '--use-angle=gl', '--rr-editor-angle=gl']), 'gl');
    assert.equal(PlaytestManager.editorHop(['.']), null);
    // An editor on OpenGL by hand gives its playtests nothing; one the launcher put there gives them the plan.
    const host = '--rr-angle-host=editor';
    assert.deepEqual(PlaytestManager.backendArgs('win32', gl, {}, 'gl'), []);
    assert.deepEqual(PlaytestManager.backendArgs('win32', gl, {}, 'gl', true), ['--use-angle=gl', '--rr-angle=gl', host]);
    assert.deepEqual(PlaytestManager.backendArgs('win32', gl, { 'chromium-args': '--use-angle=gl' }, 'gl', true), [], 'a project\x27s own backend still stands');
    const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
    assert.ok(main.includes('if (this.relaunchOnMachineBackend()) return;'), 'asked at startup, before the editor is built');
    // The launcher reads the note and takes only the two names; the note's file name is the editor's.
    const bat = fs.readFileSync(path.join(__dirname, '..', 'RPGReactor.bat'), 'utf8');
    assert.ok(bat.includes('%LOCALAPPDATA%\\RPGReactor\\' + PlaytestManager.EDITOR_ANGLE_FILE));
    assert.ok(bat.includes('if /i "%RR_ANGLE%"=="gl" set "RR_ANGLE_ARGS=--use-angle=gl --rr-editor-angle=gl"'));
    assert.ok(bat.includes('if /i "%RR_ANGLE%"=="d3d11on12" set "RR_ANGLE_ARGS=--use-angle=d3d11on12 --rr-editor-angle=d3d11on12"'));
    assert.ok(bat.includes('start "" "%NW_BINARY%" . %RR_ANGLE_ARGS%'));
});

test('a session of play is logged only when the user\'s folder asks for it', () => {
    const start = source.indexOf('const ReactorPlayLog = {'), end = source.indexOf('\nclass Main {');
    assert.ok(start > 0 && end > start);
    const L = new Function(source.slice(start, end) + '\nreturn ReactorPlayLog;')();
    // No NW.js, no folder: nothing is started, timed or written.
    assert.equal(L.folder(), '');
    assert.equal(L.start(), false);
    // A line is the readings that are there, each as key=value; a game not up yet gives the frames alone.
    L._frames = 120; L._worst = 41.6; L._late = 3;
    const line = L.line(2000);
    assert.match(line, /^\d\d:\d\d:\d\d fps=60 worst=42 late=3/);
    const written = [];
    L._fs = { appendFileSync: (file, text) => written.push([file, text]) }; L._file = 'play-log.txt';
    L.write('a line');
    assert.deepEqual(written, [['play-log.txt', 'a line\n']]);
    assert.ok(source.includes('ReactorPlayLog.start();'), 'asked once, as the game boots');
    assert.ok(source.includes('"play-log.on"'), 'the switch is a file beside the graphics record');
});
