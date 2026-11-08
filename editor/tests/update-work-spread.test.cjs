'use strict';
// A screen faster than the game's 60: an update's shadow rows and reflections go to the refreshes after it, one each,
// so the frame carrying the update costs what the others do. Measured 2026-11-07 on an RTX 5070 at 180 Hz and uncapped:
// update frames 5 ms against 1.3 ms between them; with vsync on, every update's frame missed its refresh.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));

function harness(ratio, active = true) {
    const log = [];
    global.Graphics = { frameCount: 0, refreshCount: 0, FramePacing: { _active: active, ratio: () => ratio } };
    global.$dataMap = {};
    const saved = { prepareReflections: R.prepareReflections, prepareWorldFrame: R.prepareWorldFrame, LightVolume: R.LightVolume, DrawBatches: R.DrawBatches, Reflections: R.Reflections, EffekseerScene: R.EffekseerScene };
    R.prepareReflections = () => log.push('reflections');
    R.prepareWorldFrame = () => log.push('shadows', 'reflections');
    R.LightVolume = { frame: () => log.push('volume') };
    R.DrawBatches = { flush: () => log.push('batches') };
    R.Reflections = { takeOwed: () => log.push('face') };
    R.EffekseerScene = null;
    const scene = { updateMatrixWorld: () => log.push('matrices') };
    const mapScene = { scene: () => scene, setPass() {}, renderShadows: () => log.push('shadows') };
    const view = Object.create(R.Viewport.prototype);
    Object.assign(view, { _renderer: {}, _camera: {}, upscaled: () => false, render: () => false, _spreadScene: mapScene });
    const frame = (update) => {
        if (update) Graphics.frameCount++;
        Graphics.refreshCount++;
        log.length = 0;
        view.renderPass(mapScene, 'world', 'below');
        view.renderPass(mapScene, 'overlay', 'above');
        return log.slice();
    };
    const restore = () => { Object.assign(R, saved); delete global.Graphics; delete global.$dataMap; };
    return { frame, restore, view, mapScene };
}

test('at three refreshes an update, its shadows and its reflections each take a refresh after it', () => {
    const h = harness(3);
    try {
        assert.deepEqual(h.frame(true), ['matrices', 'batches'], 'the update\'s own frame: its matrices and draw batches only');
        assert.deepEqual(h.frame(false), ['shadows', 'volume'], 'the next refresh: the shadow rows, then the light volume');
        assert.deepEqual(h.frame(false), ['reflections'], 'then the reflections');
        assert.deepEqual(h.frame(false), ['face'], 'then, as before, a reflection face the update left');
    } finally { h.restore(); }
});

test('work no spare refresh took is done first thing on the next update, in order', () => {
    const h = harness(2);
    try {
        h.frame(true);
        assert.deepEqual(h.frame(false), ['shadows', 'volume']);
        assert.deepEqual(h.frame(true), ['reflections', 'matrices', 'batches'], 'the reflections still owed, then the new update');
    } finally { h.restore(); }
});

test('a 60 Hz screen, or frames not paced, do it all in the update as before', () => {
    for (const [ratio, active] of [[1, true], [3, false]]) {
        const h = harness(ratio, active);
        try {
            assert.deepEqual(h.frame(true), ['matrices', 'shadows', 'reflections', 'volume']);
            assert.deepEqual(h.frame(false), ['face']);
        } finally { h.restore(); }
    }
});

test('a refresh that moved a model between updates draws the moving shadows again; one that moved none does not', () => {
    // A ridden motorcycle's shadow, drawn once an update, stood behind the bike and caught up (2026-11-07).
    const h = harness(3);
    try {
        Graphics.FramePacing.movedNow = () => true;
        h.frame(true);
        assert.deepEqual(h.frame(false), ['shadows', 'volume'], 'the owed shadows already follow: not twice');
        assert.deepEqual(h.frame(false), ['reflections', 'shadows'], 'with the reflections, the moving shadows again');
        assert.deepEqual(h.frame(false), ['face', 'shadows']);
        Graphics.FramePacing.movedNow = () => false;
        assert.deepEqual(h.frame(false), ['face'], 'nothing moved: the shadows stand');
        R.SHADOWS_FOLLOW_REFRESH = false;
        Graphics.FramePacing.movedNow = () => true;
        assert.deepEqual(h.frame(false), ['face'], 'switched off');
    } finally { R.SHADOWS_FOLLOW_REFRESH = true; h.restore(); }
});

test('FramePacing says a draw moved a model only while its blended places stand', () => {
    const vm = require('node:vm'), fs = require('node:fs');
    const source = fs.readFileSync(path.join(repoRoot, 'runtime/reactor_core.js'), 'utf8');
    const start = source.indexOf('    movedNow() {'), end = source.indexOf('\n    },', start);
    const P = { _poseApplied: false, _poseMoved: [false, true], _poseRoots: [{}, {}] };
    P.movedNow = vm.runInNewContext('(function ' + source.slice(start + 4, end + 6).trim() + ')');
    assert.equal(P.movedNow(), false, 'outside a draw');
    P._poseApplied = true;
    assert.equal(P.movedNow(), true);
    P._poseMoved = [false, false];
    assert.equal(P.movedNow(), false);
});

test('the first frame of a scene new to the view draws its shadows and reflections in that frame', () => {
    // A map crossed into without a break: put off a refresh, its first frame took the shadows laid for the map left.
    const h = harness(3);
    try {
        h.view._spreadScene = null;
        assert.deepEqual(h.frame(true), ['matrices', 'shadows', 'reflections', 'volume'], 'all of it, in the frame');
        assert.deepEqual(h.frame(false), ['face']);
        assert.deepEqual(h.frame(true), ['matrices', 'batches'], 'spread again from the next update');
    } finally { h.restore(); }
});
