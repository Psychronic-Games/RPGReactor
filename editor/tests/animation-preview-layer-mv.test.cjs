// An MV sprite-sheet animation in the preview layer plays to its end and
// reports it. It never did: a `const cell` inside `for (const cell of frame)`
// threw on the first draw, the frame loop never started, and every layer
// stayed active forever, so a sequence waiting on an animation never
// finished and never looped.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function makeElement(tag) {
    const el = { tagName: tag.toUpperCase(), style: {}, children: [], width: 0, height: 0,
        appendChild(child) { this.children.push(child); return child; },
        insertBefore(node, ref) { const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, node); return node; },
        getContext() { return el._ctx || (el._ctx = new Proxy({ drawCalls: 0 }, { get: (t, k) => k in t ? t[k] : (k === 'drawImage' ? () => { t.drawCalls++; } : () => {}) , set: (t, k, v) => { t[k] = v; return true; } })); },
        getBoundingClientRect() { return { left: 0, top: 0, width: 256, height: 256 }; } };
    return el;
}

function loadLayer() {
    let now = 0;
    const frames = [];
    const context = {
        console, document: { createElement: makeElement },
        performance: { now: () => now },
        requestAnimationFrame: cb => { frames.push(cb); return frames.length; },
        cancelAnimationFrame: () => {},
        Image: class { set src(v) { setImmediate(() => this.onload && this.onload()); } },
        RRAssetFiles: { imageUrlFor: () => 'x.png' },
        require: () => ({ join: (...p) => p.join('/') }),
        setTimeout, clearTimeout,
    };
    context.window = context; context.globalThis = context;
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', 'src', 'utils', 'AnimationPreviewLayer.js'), 'utf8'), context);
    // Runs queued frames, advancing the clock so the 15 fps cadence steps.
    const tick = ms => { now += ms; const due = frames.splice(0); for (const cb of due) cb(); };
    return { Layer: context.RRAnimationPreviewLayer, tick, frames };
}

const mvAnimation = { id: 1, name: 'Hit', position: 1, animation1Name: 'Attack1', animation2Name: '', animation1Hue: 0,
    frames: Array.from({ length: 4 }, () => [[0, 0, 0, 100, 0, 0, 255, 0]]), timings: [] };

test('an MV animation draws every frame and finishes', async () => {
    const { Layer, tick, frames } = loadLayer();
    const layer = new Layer(makeElement('div'));
    let finished = 0; layer.onFinished = () => finished++;
    assert.equal(layer.play(mvAnimation, '/project', {}), true);
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    assert.equal(layer.mv.ready, true, 'sheets loaded');
    assert.equal(frames.length, 1, 'the frame loop was scheduled after the first draw');
    for (let i = 0; i < 8 && layer.active; i++) tick(70);
    assert.equal(finished, 1, 'the animation reported its end');
    assert.equal(layer.active, false, 'and stopped');
    assert.ok(layer.mvCanvas.getContext().drawCalls >= 4, 'every frame drew a cell');
});

test('a draw that throws still lets the animation finish instead of stalling', async () => {
    const { Layer, tick } = loadLayer();
    const layer = new Layer(makeElement('div'));
    let finished = 0; layer.onFinished = () => finished++;
    const broken = { ...mvAnimation, frames: [null, [[0, 0, 0, 100, 0, 0, 255, 0]]] };
    // A frame of `null` is skipped by draw; make the context itself throw.
    layer.mvCanvas.getContext().translate = () => { throw new Error('boom'); };
    const warn = console.warn; console.warn = () => {};
    try {
        layer.play(broken, '/project', {});
        await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
        for (let i = 0; i < 8 && layer.active; i++) tick(70);
    } finally { console.warn = warn; }
    assert.equal(finished, 1);
    assert.equal(layer.active, false);
});

test('an additive cell is composited against the scene, not baked into the overlay', async () => {
    const { Layer, tick } = loadLayer();
    const container = makeElement('div');
    const layer = new Layer(container);
    const additive = { ...mvAnimation, frames: [[[0, 0, 0, 100, 0, 0, 255, 1], [0, 0, 0, 100, 0, 0, 255, 0]]] };
    layer.play(additive, '/project', {});
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    const blend = layer.mvBlendCanvases.get(1);
    assert.ok(blend, 'the additive cell got its own canvas');
    assert.match(blend.style.cssText, /mix-blend-mode:plus-lighter;/);
    assert.equal(blend.getContext().drawCalls, 1, 'the additive cell drew there');
    assert.equal(layer.mvCanvas.getContext().drawCalls, 1, 'the normal cell drew on the normal canvas');
    assert.ok(layer.wrap.children.includes(blend), 'and it sits inside the overlay');
    assert.deepEqual({ ...Layer.MV_BLEND_CSS }, { 1: 'plus-lighter', 2: 'multiply', 3: 'screen' });
    layer.stop();
    assert.equal(blend.style.display, 'none');
    for (let i = 0; i < 3; i++) tick(70);
});
