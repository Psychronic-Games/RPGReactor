'use strict';
// On a card whose name leaves the light split out (Reactor3D.fastShading), whether it is drawn is found by trying it:
// Reactor3D.HalfLight.Trial, reactor_3d_lighting.js. The Iris Xe laptop on OpenGL walked the first room at 39.9 and
// 38.9 frames a second with the split against 32.1 and 33.9 without, where on Direct3D 11 it had bought nothing.
const test = require('node:test');
const assert = require('node:assert');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const lighting = runtimeSource('reactor_3d_lighting.js'), core = runtimeSource('reactor_3d.js');
const XE = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, OpenGL 4.5.0)';

/** The shipped Trial over a HalfLight, a card and a storage of the test's own. */
function setup({ card = XE, fast = true, tier = 'weak', kept = {} } = {}) {
    const from = lighting.indexOf('Reactor3D.HalfLight.Trial = {'), to = lighting.indexOf('// (the end of HalfLight.Trial)', from);
    assert.ok(from >= 0 && to > from, 'HalfLight.Trial exists');
    const store = new Map(Object.entries(kept));
    const localStorage = { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) };
    const Reactor3D = { HalfLight: { enabled: true, SKIP_ON_FAST_SHADING: true, WEAK_ONLY: true }, tier: () => tier, fastShading: () => fast };
    const Graphics = { gpuDescription: card };
    // eslint-disable-next-line no-new-func
    new Function('Reactor3D', 'Graphics', 'localStorage', lighting.slice(from, to))(Reactor3D, Graphics, localStorage);
    return { T: Reactor3D.HalfLight.Trial, Reactor3D, Graphics, store };
}
/** The windows of one trial: frames a second with the split, and without. Returns how the split was drawn in each. */
function play(T, withSplit, without) {
    const drawn = [];
    assert.strictEqual(T.note(36, true), true, 'a short window starts it, and Auto holds its levels');
    for (let pair = 0; pair < T.PAIRS; pair++) {
        for (const list of [withSplit, without]) {
            drawn.push(T.use());
            assert.strictEqual(T.note(1, true), true, 'the window after a change is not counted');
            assert.strictEqual(T.note(list[pair], true), true);
        }
    }
    return drawn;
}

test('a short window starts a trial, the split is drawn turn about, and it is kept when it buys frames', () => {
    const { T, store } = setup();
    assert.strictEqual(T.use(), false, 'nothing found yet: as the name says');
    assert.strictEqual(T.note(60, false), false, 'a machine that holds its rate is never tried');
    assert.strictEqual(T.use(), false);
    assert.deepStrictEqual(play(T, [39.9, 38.9], [32.1, 33.9]), [true, false, true, false]);
    assert.strictEqual(T.use(), true);
    assert.deepStrictEqual(JSON.parse(store.get(T.KEY)), { [XE]: true }, 'kept for the card as its backend names it');
    assert.strictEqual(T.note(36, true), false, 'settled: Auto judges its windows again');
    assert.deepStrictEqual(T.last, { with: [39.9, 38.9], without: [32.1, 33.9], use: true });
});

test('a split that buys nothing is left out for good, and a window of building programs does not decide', () => {
    const none = setup();
    play(none.T, [24.0, 23.6], [24.7, 25.0]);
    assert.strictEqual(none.T.use(), false);
    assert.deepStrictEqual(JSON.parse(none.store.get(none.T.KEY)), { [XE]: false });
    assert.strictEqual(none.T.note(20, true), false, 'not tried again');
    // Within GAIN of each other: the split's main-thread work is not paid for a frame in forty.
    const close = setup();
    play(close.T, [40.5, 40.9], [40.0, 39.8]);
    assert.strictEqual(close.T.use(), false);
    // The best window of each kind is compared: one spent building the split's programs does not count against it.
    const slowFirst = setup();
    play(slowFirst.T, [12, 39.9], [33.9, 32.1]);
    assert.strictEqual(slowFirst.T.use(), true);
});

test('what was found is read at the next start, by card and backend', () => {
    const kept = { 'rr.lightSplit.1': JSON.stringify({ [XE]: true, 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)': false }) };
    const gl = setup({ kept });
    assert.strictEqual(gl.T.use(), true);
    assert.strictEqual(gl.T.note(30, true), false, 'no trial for a card already settled');
    const d3d = setup({ kept, card: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)' });
    assert.strictEqual(d3d.T.use(), false);
    // The same game on another backend in one session is another card to it.
    gl.Graphics.gpuDescription = 'ANGLE (Intel, Vulkan 1.4.323 (Intel(R) Iris(R) Xe Graphics (0x00009A49)), Intel Corporation)';
    assert.strictEqual(gl.T.use(), false);
    assert.strictEqual(gl.T.note(30, true), true, 'and is tried for itself');
    // Forgotten on request.
    const again = setup({ kept });
    again.T.reset();
    assert.strictEqual(again.T.use(), false);
    assert.strictEqual(again.T.note(30, true), true);
});

test('only a card the name leaves out is tried, and the switch stands', () => {
    for (const options of [{ fast: false }, { tier: 'full' }, { card: '' }]) {
        const { T } = setup(options);
        assert.strictEqual(T.note(30, true), false, JSON.stringify(options));
        assert.strictEqual(T.use(), false);
    }
    const off = setup();
    off.T.enabled = false;
    assert.strictEqual(off.T.note(30, true), false);
    assert.strictEqual(off.T.use(), false);
    const noSkip = setup();
    noSkip.Reactor3D.HalfLight.SKIP_ON_FAST_SHADING = false;
    assert.strictEqual(noSkip.T.note(30, true), false, 'nothing is left out: nothing to try');
    // A storage that cannot be written: found again next session, nothing breaks.
    const { T } = setup();
    const broken = setup();
    broken.store.set = () => { throw new Error('full'); };
    play(broken.T, [40, 40], [30, 30]);
    assert.strictEqual(broken.T.use(), true);
    assert.ok(T);
});

test('the pass asks the trial, and Auto gives no level up while one is under way', () => {
    assert.match(lighting, /if \(this\.SKIP_ON_FAST_SHADING && Reactor3D\.fastShading && Reactor3D\.fastShading\(\) && !\(this\.Trial && this\.Trial\.use\(\)\)\) return null;/);
    const at = core.indexOf('if (splitTrial && splitTrial.note(rated, short >= this.SLOW)) { this._slowRun = 0; return; }');
    assert.ok(at > 0, 'Auto hands each judged window to the trial');
    assert.ok(at < core.indexOf('if (this.spareGpu(rated, busyMs, gpuMs)) return;', at - 400) + 400 && core.indexOf('if (this.checkStep(rated)) return;') > at, 'before any step is weighed');
    // The depth laid first stays by the name (it bought nothing when tried).
    assert.match(core, /if \(this\.SKIP_ON_FAST_SHADING && Reactor3D\.fastShading && Reactor3D\.fastShading\(\)\) return false;/);
});
