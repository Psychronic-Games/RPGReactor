'use strict';
// New things show once their shaders compiled on the driver's threads and
// their pictures uploaded under a budget; the frame never waits for them.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const root = path.join(__dirname, '..', '..');
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const Reactor3D = require(path.join(root, 'runtime', 'reactor_3d.js'));
const W = Reactor3D.ShaderWarmup;

function fakeRenderer() {
    const props = new Map(), compiles = [], waiting = [];
    return {
        extensions: { has: name => name === 'KHR_parallel_shader_compile' },
        properties: { get: t => props.get(t) || (props.set(t, {}), props.get(t)) },
        compileAsync() { throw new Error('the warmup waits through compile() and its own guarded poll'); },
        compile(mesh) {
            compiles.push(mesh);
            const started = new Set();
            for (const m of [].concat(mesh.material)) {
                const program = { ready: false, isReady() { return this.ready; } };
                this.properties.get(m).currentProgram = program;
                waiting.push(program);
                started.add(m);
            }
            return started;
        },
        initTexture(t) { const p = this.properties.get(t); p.__webglInit = true; p.__version = t.version; this.uploads = (this.uploads || 0) + 1; },
        draw(mesh) { for (const m of [].concat(mesh.material)) this.properties.get(m).__version = m.version; },
        finishCompiles() { while (waiting.length) waiting.shift().ready = true; }, compiles
    };
}
const tick = () => new Promise(res => setTimeout(res, 0));

test('a mesh whose material was never compiled sits out the draw until its program is ready; the frame never waits', async () => {
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    const r = fakeRenderer();
    const hidden = W.hide(r, scene, {});
    assert.deepEqual(hidden, [mesh]); assert.equal(mesh.visible, false, 'out of this draw');
    W.show(hidden); assert.equal(mesh.visible, true, 'and back for everything else');
    W.show(W.hide(r, scene, {}) || []);
    assert.equal(r.compiles.length, 1, 'compiled once, with the pass bound');
    r.finishCompiles(); await tick();
    assert.equal(W.hide(r, scene, {}), null, 'ready: drawn');
});

test('a material drawn before is never held, even after its version changes (a material that changes every frame stays)', () => {
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    const r = fakeRenderer();
    r.properties.get(mesh.material).currentProgram = {}; r.draw(mesh);
    assert.equal(W.hide(r, scene, {}), null);
    mesh.material.needsUpdate = true;
    assert.equal(W.hide(r, scene, {}), null, 'a recompile is drawn the old way');
    assert.equal(r.compiles.length, 0);
});

test('pictures upload under a per-frame budget before the mesh shows; one always goes', async () => {
    const scene = new THREE.Scene();
    const textures = [0, 1, 2].map(() => { const t = new THREE.Texture({ width: 4000, height: 4000 }); t.needsUpdate = true; return t; });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: textures[0], alphaMap: textures[1], aoMap: textures[2] }));
    scene.add(mesh);
    const r = fakeRenderer();
    W.show(W.hide(r, scene, {}) || []);
    r.finishCompiles(); await tick();
    let frames = 0;
    while (frames < 10) { const h = W.hide(r, scene, {}); if (!h) break; W.show(h); frames++; }
    assert.equal(r.uploads, 3);
    assert.ok(frames >= 2, 'spread over frames (' + frames + ')');
});

test('without parallel compile nothing is held; a compile never answered is drawn after the timeout', () => {
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    assert.equal(W.hide({ extensions: { has: () => false } }, scene, {}), null);
    const r = fakeRenderer();
    W.show(W.hide(r, scene, {}) || []);
    W._materials.get(mesh.material).started -= W.TIMEOUT_MS + 1;
    assert.equal(W.hide(r, scene, {}), null, 'drawn anyway');
    W.enabled = false;
    try { const other = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); scene.add(other); assert.equal(W.hide(r, scene, {}), null, 'the kill switch'); }
    finally { W.enabled = true; }
});

test('a material disposed while it compiles ends the wait instead of throwing from a timer', async () => {
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    const r = fakeRenderer();
    W.hide(r, scene, {});
    // A piece relay disposes the material: three forgets its program.
    r.properties.get(mesh.material).currentProgram = undefined;
    await tick(); await tick();
    assert.equal(W.hide(r, scene, {}), null, 'nothing left to wait for: drawn');
});

test('a picture is uploaded by the renderer that asked for it, whichever draws first', async () => {
    // The editor draws the map view and a model preview with two renderers. One upload list
    // for both let the map view (first to draw each frame) take the preview's picture, upload
    // it into its own context and call it done: the preview's model never showed.
    const texture = new THREE.Texture({ width: 64, height: 64 }); texture.needsUpdate = true;
    const preview = new THREE.Scene(), model = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ map: texture }));
    preview.add(model);
    const mapScene = new THREE.Scene();
    mapScene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    const mapRenderer = fakeRenderer(), previewRenderer = fakeRenderer();
    const frame = () => {
        W.show(W.hide(mapRenderer, mapScene, {}) || []);
        const held = W.hide(previewRenderer, preview, {});
        W.show(held || []);
        return held;
    };
    frame();
    mapRenderer.finishCompiles(); previewRenderer.finishCompiles(); await tick();
    let frames = 0;
    while (frames < 10 && frame()) frames++;
    assert.ok(frames < 10, 'the preview model shows');
    assert.equal(previewRenderer.uploads, 1, 'its picture went to its own renderer');
    assert.equal(mapRenderer.uploads || 0, 0, 'and not into the map view');
});

/** A renderer whose compile does what three's does to a see-through two-sided material: its back and its front program are built in turn, and the material is marked changed each time. */
function twoPassRenderer() {
    const r = fakeRenderer(), compile = r.compile;
    r.compile = function(mesh) {
        for (const m of [].concat(mesh.material)) {
            if (m.transparent === true && m.side === THREE.DoubleSide && m.forceSinglePass === false) { m.needsUpdate = true; m.needsUpdate = true; }
        }
        return compile.call(this, mesh);
    };
    return r;
}

test('a see-through two-sided material is compiled once and shows as soon as its programs are ready', async () => {
    // A placing preview's ring: never drawn before, transparent, both sides. Its compile leaves it "changed".
    const scene = new THREE.Scene();
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 8), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide }));
    scene.add(ring);
    const r = twoPassRenderer();
    const before = ring.material.version;
    assert.deepEqual(W.hide(r, scene, {}), [ring]);
    W.show([ring]);
    assert.equal(ring.material.version, before + 2, 'the compile itself moved the version');
    for (let draw = 0; draw < 6; draw++) W.show(W.hide(r, scene, {}) || []);
    assert.equal(r.compiles.length, 1, 'it is not started over on every draw');
    r.finishCompiles(); await tick();
    assert.equal(W.hide(r, scene, {}), null, 'ready: drawn, without waiting out the timeout');
    assert.ok(performance.now() - W._materials.get(ring.material).started < W.TIMEOUT_MS);
    // A change made afterwards (its opacity, by whoever owns it) before the first draw is still compiled for.
    const other = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.5, 8), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide }));
    scene.add(other);
    W.show(W.hide(r, scene, {}) || []);
    other.material.needsUpdate = true;
    W.show(W.hide(r, scene, {}) || []);
    assert.equal(r.compiles.length, 3, 'the variant the draw will ask for');
});

test('a material compiled as two programs waits for both', async () => {
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide }));
    scene.add(mesh);
    const r = twoPassRenderer(), back = { ready: false, isReady() { return this.ready; } };
    const compile = r.compile;
    r.compile = function(object) {
        const started = compile.call(this, object);
        // The front program is the material's current one; the back one was built before it.
        this.properties.get(mesh.material).programs = new Map([['back', back], ['front', this.properties.get(mesh.material).currentProgram]]);
        return started;
    };
    W.show(W.hide(r, scene, {}) || []);
    r.finishCompiles(); await tick(); await new Promise(res => setTimeout(res, 25));
    assert.deepEqual(W.hide(r, scene, {}), [mesh], 'the front is ready, the back is not: still out of the draw');
    W.show([mesh]);
    back.ready = true;
    await new Promise(res => setTimeout(res, 25));
    assert.equal(W.hide(r, scene, {}), null);
});
