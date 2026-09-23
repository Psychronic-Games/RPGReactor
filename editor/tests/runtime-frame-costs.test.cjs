/**
 * Per-frame costs the runtime must not pay twice.
 *
 * Measured on the Demo's start map (tests/perf/nw-game-profile.cjs): the
 * update loop cost 30 ms a frame, 5 ms of it in `Game_Map.events` walking a
 * ten-thousand-slot sparse array on every call, and three recomposed every
 * world matrix once per render pass. After: 2.1 ms.
 */
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

function eventsFunction() {
    const source = read('runtime/reactor_objects.js');
    const start = source.indexOf('const reactorEventLists = new WeakMap();');
    const end = source.indexOf('\n};', start) + 3;
    assert.ok(start > 0 && end > start, 'the memoised events() is in reactor_objects.js');
    const context = { Game_Map: function() {}, Graphics: { frameCount: 0 } };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end), context);
    return context;
}

test('the live event list is rebuilt once a frame, not on every call', () => {
    const { Game_Map, Graphics } = eventsFunction();
    const map = new Game_Map();
    map._events = [];
    const a = { id: 1 }, b = { id: 10007 };
    map._events[1] = a;
    map._events[10007] = b;   // a prop: PROP_EVENT_BASE + 7
    assert.equal(map._events.length, 10008);

    // vm-realm arrays: compare through Array.from, never deepEqual on the array itself.
    const first = map.events();
    assert.deepEqual(Array.from(first), [a, b], 'holes are skipped, order by id');
    assert.equal(map.events(), first, 'the same frame returns the same array');

    Graphics.frameCount++;
    const second = map.events();
    assert.notEqual(second, first, 'a new frame rebuilds');
    assert.deepEqual(Array.from(second), [a, b]);

    const c = { id: 3 };
    map._events[3] = c;
    assert.deepEqual(Array.from(map.events()), [a, b], 'assigning into a hole mid-frame is seen next frame');
    Graphics.frameCount++;
    assert.deepEqual(Array.from(map.events()), [a, c, b]);

    map._events.push({ id: 10008 });
    assert.equal(map.events().length, 4, 'a longer array rebuilds at once, same frame');

    map._events = [{ id: 0 }];
    assert.deepEqual(Array.from(map.events()), [{ id: 0 }], 'a replaced array is its own memo');
    map._events = null;
    assert.deepEqual(Array.from(map.events()), []);

    const bare = new Game_Map();
    bare._events = [];
    assert.ok(!Object.keys(bare).includes('_eventsCache'), 'nothing memo-like lands on the map object for JsonEx to save');
});

test('the memo is keyed off the map object, so saves never carry it', () => {
    const source = read('runtime/reactor_objects.js');
    assert.match(source, /const reactorEventLists = new WeakMap\(\);\nGame_Map\.prototype\.events = function\(\) \{/);
    assert.doesNotMatch(source, /this\._eventsCache/);
    assert.doesNotMatch(source, /return this\._events\.filter\(event => !!event\);/, 'the per-call filter is gone');
});

test('the 3D viewport updates world matrices once a frame across its passes', () => {
    const three = source3D();
    const at = three.indexOf('Reactor3D.Viewport.prototype.renderPass = function');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /if \(scene\.matrixWorldAutoUpdate !== false\) scene\.matrixWorldAutoUpdate = false;/);
    assert.match(body, /if \(this\._matrixFrame !== frame\) \{\n\s*this\._matrixFrame = frame;\n\s*scene\.updateMatrixWorld\(\);\n[^}]*\}/);
    assert.ok(body.indexOf('scene.updateMatrixWorld()') < body.indexOf('mapScene.setPass(which)'), 'before the pass is arranged');
});

test('a sparse event array is walked by its keys, not its holes', () => {
    const { Game_Map } = eventsFunction();
    const map = new Game_Map();
    map._events = [];
    map._events[2] = { id: 2 };
    map._events[100000] = { id: 100000 };
    assert.deepEqual(Array.from(map.events()).map(e => e.id), [2, 100000]);
    const source = read('runtime/reactor_objects.js');
    assert.match(source, /if \(events\.length > 512\) \{\n\s*\/\/ Sparse[^\n]*\n\s*const keys = Object\.keys\(events\);/);
});

test('the map mode is remembered per map against the inputs that decide it', () => {
    const three = source3D();
    const at = three.indexOf('Reactor3D.mapMode = function');
    const body = three.slice(at, three.indexOf('\n};', at));
    assert.match(body, /const memo = this\._mapModeMemo \|\| \(this\._mapModeMemo = new WeakMap\(\)\);/);
    assert.match(body, /if \(known && known\.note === note && known\.meta === meta && known\.sidecarMode === sidecarMode\) return known\.mode;/);
    // Behaviour, through the shipped module: the note flips it, the sidecar can veto it, and an edit is honoured.
    const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const map = { note: '', meta: {} };
    assert.equal(Reactor3D.mapMode(map), Reactor3D.MODE_2D);
    map.note = '<3d>';
    assert.equal(Reactor3D.mapMode(map), Reactor3D.MODE_3D, 'an edited note is seen at once');
    map.reactor3d = { mode: '2d' };
    assert.equal(Reactor3D.mapMode(map), Reactor3D.MODE_2D, 'the sidecar veto is seen at once');
    map.reactor3d.mode = Reactor3D.MODE_3D;
    assert.equal(Reactor3D.mapMode(map), Reactor3D.MODE_3D);
});

test('the tilemap sorts its children only when they are out of order, without copying the list', () => {
    const core = read('runtime/reactor_core.js');
    const at = core.indexOf('Tilemap.prototype._sortChildren = function');
    const body = core.slice(at, core.indexOf('\n};', at));
    assert.doesNotMatch(body, /children\.slice\(\)/);
    assert.doesNotMatch(body, /children\.sort\(this\._compareChildOrder\.bind\(this\)\)/, 'no fresh bound comparator per frame');
    assert.match(body, /this\._boundCompareChildOrder = this\._compareChildOrder\.bind\(this\)/, 'bound once');
    assert.match(body, /if \(sorted\) return;\n\s*children\.sort\(compare\);/);
});

test('billboard maths reuses scratch vectors', () => {
    const three = source3D();
    const up = three.slice(three.indexOf('Reactor3D.billboardUp = function'), three.indexOf('\n};', three.indexOf('Reactor3D.billboardUp = function')));
    assert.doesNotMatch(up, /new THREE\.Vector3\(0, 1, 0\)/, 'no fresh vectors per call');
    assert.match(up, /this\._billboardUpScratch/);
    const aim = three.slice(three.indexOf('Reactor3D.aimCharacterBillboard = function'), three.indexOf('\n};', three.indexOf('Reactor3D.aimCharacterBillboard = function')));
    assert.match(aim, /const scratch = this\._aimScratch \|\| \(this\._aimScratch = \{/);
    assert.doesNotMatch(aim, /new THREE\.Matrix4\(\)\.makeBasis/);
});

test('a settled in-scene effect is re-measured every five seconds, not twice a second', () => {
    const three = source3D();
    const at = three.indexOf('shouldMeasure(frames, track) {');
    const body = three.slice(at, three.indexOf('},', at));
    assert.match(body, /const every = settled\s+\? this\.learnInterval\(\) \* this\.settledInterval\(\)\s+: this\.learnInterval\(\);\s+return frames % every === 0;/);
    assert.match(three, /MEASURE_EVERY: 10,/);
    assert.match(three, /SETTLED_EVERY: 30,/);
    assert.match(three, /SETTLED_EVERY_WEAK: 300,/);
});
