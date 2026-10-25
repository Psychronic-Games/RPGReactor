/**
 * A model effect in the map view's 3D mode sits on its anchor and loops
 * without a dark frame.
 *
 * The view draws its main pass into a target at the render scale (0.75 by
 * default), and the effect's quad finds its pixel by its place in the pass
 * it is drawn in. Told the canvas's size instead, the Demo's reactor core
 * drew a third further from the screen's lower-left corner than its anchor:
 * a beam standing off to the right of the tower, beside the floating arm.
 *
 * A play draws nothing before its first update and nothing on its final
 * frame. A loop that started its next play without stepping it showed one
 * empty frame per cycle, and a loop whose lit frames were never measured
 * (the readback finding them failed) waited for the play to end and three
 * more frames: a blink every cycle.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(editorRoot, '..');

function loadThree() {
    const ctx = { console, module: { exports: {} }, require, process, setTimeout, performance: { now: () => 0 } };
    ctx.globalThis = ctx; ctx.self = ctx;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'three.js'), 'utf8'), ctx);
    return ctx.THREE || ctx.module.exports;
}

test('the effect quad samples by the size of the pass that draws it', () => {
    const THREE = loadThree();
    const Reactor3D = {
        scaleAxes: () => [1, 1, 1],
        modelSpanTiles: () => 20,
        EffekseerScene: { standQuad() {} }
    };
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'MapEditor3D.js'), 'utf8');
    const MapEditor3D = vm.runInNewContext(`${source}\nMapEditor3D;`,
        { console, window: {}, document: { addEventListener() {} }, THREE, Reactor3D });
    const camera = new THREE.PerspectiveCamera(45, 860 / 605, 0.1, 100);
    camera.updateMatrixWorld();
    const place = mainTarget => {
        const uniforms = { resolution: { value: new THREE.Vector2(1, 1) }, rectMin: { value: new THREE.Vector2() }, rectSize: { value: new THREE.Vector2() } };
        const view = {
            camera,
            renderer: { getDrawingBufferSize: out => out.set(860, 605) },
            mainTarget: () => mainTarget
        };
        const play = {
            object: { rotation: { y: 0 } }, effect: { scale: 0.54 }, record: { scale: 100 },
            layer: { fx: { gpu: {} }, setWorld() {}, drawGpuQuad: () => true },
            quad: { mesh: { visible: false }, material: { uniforms } }
        };
        MapEditor3D.prototype._placeEffectQuad.call(view, play, new THREE.Vector3(0, 0, -10));
        return [uniforms.resolution.value.x, uniforms.resolution.value.y];
    };
    assert.deepEqual(place({ width: 645, height: 454 }), [645, 454], 'below full render scale: the main pass target');
    assert.deepEqual(place(null), [860, 605], 'drawn straight to the canvas: the canvas');
});

/**
 * An Effekseer stand-in: a play is lit on frames 1..litTo (litTo <= life),
 * dark after that, empty on frame 0 and on its final frame life + 1, and
 * gone after that. Every draw is logged by the frame of the RAF that made
 * it. The lit-frame readback either finds nothing or sees the last draw;
 * a jittery clock runs three updates on every seventh frame, as a slow
 * frame does.
 */
function loadLayer({ life, litTo = life, readback = false, jitter = false }) {
    let clock = 0, ticks = 0, lastDrawn = null;
    const raf = [];
    const handles = [];
    const draws = [];
    const ctx = {
        init() {}, setRestorationOfStatesFlag() {}, _makeContextCurrent() {},
        setProjectionMatrix() {}, setCameraMatrix() {}, beginDraw() {}, endDraw() {},
        play() {
            const handle = { id: handles.length, frame: 0, stopped: false,
                get exists() { return !this.stopped && this.frame <= life + 1; },
                setLocation() {}, setRotation() {}, setScale() {}, setSpeed() {}, stop() { this.stopped = true; } };
            handles.push(handle);
            return handle;
        },
        update() { for (const handle of handles) if (handle.exists) handle.frame++; },
        drawHandle(handle) { lastDrawn = handle.frame; draws.push({ tick: ticks, id: handle.id, frame: handle.frame }); }
    };
    const isLit = frame => frame >= 1 && frame <= litTo;
    const element = tag => ({ tagName: tag.toUpperCase(), style: {}, children: [], width: 0, height: 0,
        appendChild(child) { this.children.push(child); return child; },
        insertBefore(node) { this.children.push(node); return node; },
        getContext(kind) {
            if (kind === 'webgl') return { viewport() {}, clearColor() {}, clear() { lastDrawn = null; }, COLOR_BUFFER_BIT: 1, DEPTH_BUFFER_BIT: 2 };
            return { clearRect() {}, drawImage() {}, getImageData: (x, y, w, h) => {
                const data = new Uint8ClampedArray(w * h * 4);
                if (readback && lastDrawn !== null && isLit(lastDrawn)) data[3] = 255;
                return { data };
            } };
        } });
    const context = {
        console, document: { createElement: element },
        Date: { now: () => clock }, performance: { now: () => clock },
        requestAnimationFrame: cb => { raf.push(cb); return raf.length; },
        cancelAnimationFrame: () => {},
        effekseer: { createContext: () => ctx },
        RR_loadEffekseerEffectFromFile: (c, file, scale, onload) => { const effect = { isLoaded: true }; setImmediate(onload); return effect; },
        require: () => ({ join: (...p) => p.join('/') }),
        setTimeout, clearTimeout, setImmediate
    };
    context.window = context; context.globalThis = context;
    vm.runInNewContext(fs.readFileSync(path.join(editorRoot, 'src', 'utils', 'AnimationPreviewLayer.js'), 'utf8'), context);
    // A hair over 60 Hz, so a frame runs exactly the updates it is given.
    const STEP = 1000 / 60 + 1e-6;
    const frame = () => { ticks++; clock += STEP * (jitter && ticks % 7 === 0 ? 3 : 1); for (const cb of raf.splice(0)) cb(); };
    const container = { style: {}, children: [], appendChild(c) { this.children.push(c); return c; } };
    return { layer: new context.RRAnimationPreviewLayer(container), frame, draws, handles, isLit, ticks: () => ticks };
}

/** Every frame from `from` on draws exactly one play, at a lit frame. */
function assertSeamless(draws, isLit, from, to) {
    for (let tick = from; tick <= to; tick++) {
        const drawn = draws.filter(d => d.tick === tick);
        assert.equal(drawn.length, 1, `frame ${tick} draws one play`);
        assert.ok(isLit(drawn[0].frame), `frame ${tick} draws a lit frame (play ${drawn[0].id} at ${drawn[0].frame})`);
    }
}

test('a looping effect never shows an empty frame after its first play, measured or not', async () => {
    const LIFE = 10;
    const { layer, frame, draws, handles, isLit, ticks } = loadLayer({ life: LIFE });
    assert.equal(layer.play({ effectName: 'Core' }, '/project', { loop: true }), true);
    await new Promise(r => setImmediate(r));
    for (let i = 0; i < 80; i++) frame();
    assert.ok(handles.length >= 6, `the effect looped (${handles.length} plays)`);
    assert.equal(layer.visibleFrames, null, 'the lit frames were never measured');
    assert.equal(layer.endFrames, LIFE + 1, 'the first play\'s length was kept');
    assertSeamless(draws, isLit, draws.find(d => d.id === 1).tick, ticks());
    // A play after the first starts over at its last lit frame, not its end.
    const second = draws.filter(d => d.id === 2).map(d => d.frame);
    assert.deepEqual([second[0], second[second.length - 1]], [1, LIFE]);
    layer.stop();
});

test('an inactive map effect has no simulation or draws and resumes its retained particle handle', async () => {
    const { layer, frame, draws, handles } = loadLayer({ life: 1000 });
    layer.play({ effectName: 'Core' }, '/project', { loop: true });
    await new Promise(resolve => setImmediate(resolve));
    for (let step = 0; step < 3; step++) frame();
    layer.setWorkspaceActive(false);
    const drawn = draws.length, particleFrame = handles[0].frame;
    for (let step = 0; step < 120; step++) frame();
    assert.equal(draws.length, drawn);
    assert.equal(handles[0].frame, particleFrame);
    assert.equal(layer.fx.raf, null);
    layer.setWorkspaceActive(true); frame();
    assert.equal(draws.length, drawn + 1);
    assert.equal(handles.length, 1, 'resuming retains the particle play');
    assert.equal(handles[0].frame, particleFrame + 1, 'the inactive time is not simulated on return');
    layer.stop();
});

test('a play lit at every look runs its full length, though slow frames skip the looks\' ticks', async () => {
    // The Demo core on the editor's own-canvas path: the readback stalls,
    // slow frames run several updates, and a look kept only for exact tenths
    // saw frames 10, 20, 30 and 80 of a 121-frame beam. Its loop then cut
    // every play at 80, or at 20 when more were missed.
    const LIFE = 40;
    const { layer, frame, draws, handles, isLit, ticks } = loadLayer({ life: LIFE, readback: true, jitter: true });
    layer.play({ effectName: 'Core' }, '/project', { loop: true });
    await new Promise(r => setImmediate(r));
    for (let i = 0; i < 300; i++) frame();
    assert.equal(layer.visibleFrames, null, 'no look found the picture ended, so none is taken for its end');
    assert.ok(handles.length >= 6, `the effect looped (${handles.length} plays)`);
    for (const handle of handles.slice(1, -1)) {
        const last = Math.max(...draws.filter(d => d.id === handle.id).map(d => d.frame));
        assert.ok(last >= LIFE - 2, `play ${handle.id} ran to frame ${last} of ${LIFE}`);
    }
    assertSeamless(draws, isLit, draws.find(d => d.id === 1).tick, ticks());
    layer.stop();
});

test('a play whose picture ends before its particles do starts over where the picture ended', async () => {
    const { layer, frame, draws, handles, isLit, ticks } = loadLayer({ life: 40, litTo: 15, readback: true, jitter: true });
    layer.play({ effectName: 'Burst' }, '/project', { loop: true });
    await new Promise(r => setImmediate(r));
    for (let i = 0; i < 300; i++) frame();
    assert.ok(layer.visibleFrames >= 10 && layer.visibleFrames <= 15, `measured end ${layer.visibleFrames}`);
    // Once measured, no play waits out the dark tail.
    const measuredFrom = draws.find(d => d.id === 2).tick;
    assertSeamless(draws, isLit, measuredFrom, ticks());
    assert.ok(handles.length > 15, `the loop restarts at the picture's end (${handles.length} plays)`);
    layer.stop();
});

/**
 * The game's loop, when the readback that measures an effect's lit frames
 * never succeeds: the play's own length, counted in its sprite's updates,
 * starts the next play three updates before the sprite ends, so the old
 * play's last lit frames cover the new one's first.
 */
test('a game loop whose lit frames were never measured starts over before its play ends', () => {
    const THREE = loadThree();
    global.THREE = THREE;
    const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    const spawned = [];
    const saved = { placeStandIn: R.placeStandIn, sync: R.EffekseerScene.sync, spawn: R.spawnAnchoredAnimation };
    try {
        R.placeStandIn = () => {};
        R.EffekseerScene.sync = () => {};
        R.spawnAnchoredAnimation = (effect, character, holder) => { spawned.push(effect); holder.anchored.push({ again: true }); };
        const track = R.EffekseerScene.boxTracker();
        // A first play ends: its sprite ran 124 updates; nothing was measured.
        R.EffekseerScene._live.push({ track, frames: 118, sprite: { _frameIndex: 124 } });
        R.EffekseerScene.stop(R.EffekseerScene._live[R.EffekseerScene._live.length - 1]);
        assert.equal(track.visibleFrames, null);
        assert.equal(track.endIndex, 124, 'the sprite\'s update count is kept');
        const entry = { sprite: { parent: {}, visible: true, _frameIndex: 120 }, standIn: {}, effect: { name: 'Core' }, loop: true,
            fx3d: { frames: 117, track }, axes: [1, 1, 1], rotate: [0, 0, 0] };
        const holder = { object: {}, anchored: [entry] };
        R.updateAnchoredAnimations(holder);
        assert.equal(spawned.length, 0, 'four updates from the end it plays on');
        entry.sprite._frameIndex = 121;
        R.updateAnchoredAnimations(holder);
        assert.equal(spawned.length, 1, 'three updates from the end the next play starts');
        assert.equal(entry.restarted, true);
        assert.ok(holder.anchored.includes(entry), 'and the old one runs out underneath it');
    } finally {
        R.placeStandIn = saved.placeStandIn;
        R.EffekseerScene.sync = saved.sync;
        R.spawnAnchoredAnimation = saved.spawn;
    }
});
