'use strict';
// The 3D passes a change of render scale or size replaced are let go once the view has drawn again, not after a
// count of screen refreshes: refreshes can pass with the old ones still composited (runtime 20261110.3). A game
// held still while its scale changed lost a texture its composite's mesh still held, and PIXI stopped on it.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const V = R.Viewport.prototype;

/** A view with one pass, and the refreshes run by hand. */
function view() {
    const queue = [];
    const had = global.requestAnimationFrame;
    global.requestAnimationFrame = fn => { queue.push(fn); return queue.length; };
    const state = { disposed: 0, destroyed: 0 };
    const make = () => ({ dispose() { state.disposed++; } });
    const v = { _shared: true, _scale: 1, _generation: 0, _targets: { below: make() }, _passTextures: { below: { texture: { destroy() { state.destroyed++; } }, source: null } },
        _disposeTargets: V._disposeTargets, _reapOwed: V._reapOwed, setRenderScale: V.setRenderScale };
    const refresh = (n = 1) => { for (let i = 0; i < n; i++) for (const fn of queue.splice(0)) fn(); };
    return { v, state, refresh, done() { global.requestAnimationFrame = had; } };
}

test('a new scale keeps the old passes while only refreshes pass, and lets them go after the view has drawn twice', () => {
    const { v, state, refresh, done } = view();
    try {
        v.setRenderScale(0.5);
        assert.equal(v._generation, 1, 'the sprites are told to take the new passes');
        refresh(10);
        assert.deepEqual(state, { disposed: 0, destroyed: 0 }, 'nothing drew: the composite may still hold them');
        v._reapOwed();
        refresh(4);
        assert.deepEqual(state, { disposed: 0, destroyed: 0 }, 'one drawn frame is the one the sprites change in');
        v._reapOwed();
        refresh(2);
        assert.deepEqual(state, { disposed: 1, destroyed: 1 });
    } finally { done(); }
});

test('a view that is going lets them go in two refreshes, with any still waiting', () => {
    const { v, state, refresh, done } = view();
    try {
        v.setRenderScale(0.5);
        v._targets = { below: { dispose() { state.disposed++; } } };
        v._disposeTargets(true);
        refresh(1);
        assert.equal(state.disposed, 0);
        refresh(1);
        assert.equal(state.disposed, 2, 'the passes of both sizes');
        assert.equal(v._owedReaps.length, 0);
    } finally { done(); }
});
