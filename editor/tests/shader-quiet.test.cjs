'use strict';
// Runtime 20261110.7: a program is read only while nothing is still compiling, a material in view keeps its
// program while its next one is built, and a moving caster waits for its depth program.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'));
const T = global.THREE;
const read = file => fs.readFileSync(path.join(repoRoot, 'runtime', file), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A renderer whose `compile` gives each material a new program, as three does; a program's `linked` lets it finish. */
function compilingRenderer() {
    const props = new Map(), programs = [];
    let bound = null;
    const propsOf = m => { let p = props.get(m); if (!p) props.set(m, p = {}); return p; };
    const renderer = {
        info: { programs },
        programs,
        extensions: { has: name => name === 'KHR_parallel_shader_compile' },
        compileAsync() { return new Promise(() => {}); },
        getRenderTarget: () => bound, setRenderTarget: target => { bound = target; },
        properties: { get: propsOf },
        reads: 0,
        program() {
            const program = { id: programs.length, linked: false, program: {}, isReady() { return this.linked; },
                getUniforms() { renderer.reads++; program.__rrUniformsRead = true; return { seq: [] }; }, getAttributes() { return {}; } };
            programs.push(program);
            return program;
        },
        compile(object) {
            // As three: the material's table keeps every program built for it, and the newest is its current one.
            const material = object.material, p = propsOf(material), program = renderer.program();
            if (!p.programs) p.programs = new Map(p.currentProgram ? [[p.currentProgram.id, p.currentProgram]] : []);
            p.programs.set(program.id, program);
            p.currentProgram = program;
            return new Set([material]);
        }
    };
    return renderer;
}
function resetWarmup() {
    const W = R.ShaderWarmup;
    W._inFlight = 0; W._quietWaits = 0; W._toRead.length = 0; W._readScheduled = false; W._readHeldFrom = 0; W._startedThisFrame = 0; W._recompileMs = 0;
    return W;
}

test('a linked program is read only once nothing begun here is still compiling, and no compile begins while a read is owed', async () => {
    const W = resetWarmup(), renderer = compilingRenderer();
    const first = new T.MeshBasicMaterial(), second = new T.MeshBasicMaterial();
    const one = W.compileGuarded(renderer, { material: first }, null, null), two = W.compileGuarded(renderer, { material: second }, null, null);
    assert.equal(W._inFlight, 2);
    assert.equal(W.quiet(), false);
    renderer.properties.get(first).currentProgram.linked = true;
    await sleep(60);
    assert.equal(W._inFlight, 1, 'the first has landed');
    assert.equal(renderer.reads, 0, 'and is not read while the second is still building');
    assert.equal(W.readsOwed(), true, 'a read is owed: nothing new is begun');
    renderer.properties.get(second).currentProgram.linked = true;
    await Promise.all([one, two]);
    assert.equal(W._inFlight, 0);
    assert.equal(renderer.reads, 2, 'both read, in the quiet');
    assert.equal(W.readsOwed(), false);
    // Switched off: read as each links.
    W.readWhenQuiet = false;
    try { assert.equal(W.quiet(), true); assert.equal(W.readsOwed(), false); } finally { W.readWhenQuiet = true; }
});

test('a compile begun elsewhere is in flight until it settles, and what waits for quiet holds new compiles', async () => {
    const W = resetWarmup();
    let land;
    W.track(new Promise(resolve => { land = resolve; }));
    assert.equal(W.quiet(), false);
    let calm = null;
    W.whenQuiet().then(value => { calm = value; });
    assert.equal(W.readsOwed(), true, 'a wait for quiet holds new compiles');
    land();
    await sleep(40);
    assert.equal(calm, true);
    assert.equal(W._inFlight, 0);
    assert.equal(W.readsOwed(), false);
    assert.equal(await W.whenQuiet(), true, 'already quiet: at once');
    const models = read('reactor_3d_models.js'), lighting = read('reactor_3d_lighting.js');
    assert.match(models, /if \(W && W\.track\) W\.track\(compiling\);/);
    assert.match(models, /if \(W && W\.whenQuiet\) await W\.whenQuiet\(\);/);
    assert.equal(lighting.split('Reactor3D.ShaderWarmup.track(bake.compiling)').length, 3, 'both of the light bake\'s compiles');
});

test('a material never drawn whose program is linked but unread is held until the read', async () => {
    const W = resetWarmup(), renderer = compilingRenderer(), material = new T.MeshBasicMaterial();
    const props = renderer.properties.get(material);
    props.currentProgram = renderer.program(); props.currentProgram.linked = true; props.__version = material.version;
    assert.equal(W.materialReady(renderer, material, { material }, null, null, performance.now()), false);
    await sleep(160);
    assert.equal(renderer.reads, 1, 'read between frames');
    assert.equal(W.materialReady(renderer, material, { material }, null, null, performance.now()), true);
});

test('a material in view that changed keeps drawing with its program until the next is linked and read', async () => {
    const W = resetWarmup(), renderer = compilingRenderer(), material = new T.MeshBasicMaterial(), mesh = { material };
    const props = renderer.properties.get(material), old = renderer.program();
    old.linked = true; old.__rrUniformsRead = true;
    props.currentProgram = old; props.__version = material.version;
    material.__rrSeen = performance.now();
    material.needsUpdate = true;
    W._unsettled = false;
    assert.equal(W.materialReady(renderer, material, mesh, null, null, performance.now()), true, 'drawn');
    assert.equal(W._unsettled, true, 'with its old program: not marked ready');
    assert.equal(props.currentProgram, old, 'three is pointed back at the old program');
    assert.equal(props.__version, material.version, 'and told nothing changed');
    const next = renderer.programs[renderer.programs.length - 1];
    assert.notEqual(next, old);
    assert.equal(renderer.reads, 0);
    // Asked again each frame while it builds.
    W._unsettled = false;
    assert.equal(W.materialReady(renderer, material, mesh, null, null, performance.now()), true);
    assert.equal(W._unsettled, true);
    assert.equal(props.currentProgram, old);
    assert.equal(renderer.programs.length, 2, 'not begun twice');
    next.linked = true;
    await sleep(180);
    assert.equal(next.__rrUniformsRead, true, 'the new one read between frames');
    W._unsettled = false;
    assert.equal(W.materialReady(renderer, material, mesh, null, null, performance.now()), true);
    assert.equal(W._unsettled, false, 'settled');
    assert.equal(props.__version, -1, 'three takes the new program at this draw');
    assert.equal(W._recompiles.get(material), undefined);
    // Switched off: the old way, with no record kept.
    const other = new T.MeshBasicMaterial(), otherProps = renderer.properties.get(other);
    otherProps.currentProgram = old; otherProps.__version = other.version; other.__rrSeen = performance.now(); other.needsUpdate = true;
    W.holdRecompiles = false;
    try { W.materialReady(renderer, other, { material: other }, null, null, performance.now()); } finally { W.holdRecompiles = true; }
    assert.equal(W._recompiles.get(other), undefined);
    resetWarmup();
});

test('the view does not mark a material ready while it still draws with its old program', () => {
    const source = read('reactor_3d.js');
    assert.match(source, /const drawable = this\.materialReady\(renderer, material, object, scene, camera, now\), unsettled = this\._unsettled;/);
    assert.match(source, /else if \(unsettled\) material\.__rrSeen = now;/);
    assert.match(source, /if \(started >= this\.PASS_COMPILES_PER_FRAME \|\| this\.readsOwed\(\)\) \{ ready = false; continue; \}/);
});

test('a material let go while it was being rebuilt is forgotten', () => {
    const W = resetWarmup(), material = new T.MeshBasicMaterial();
    W._recompiles.set(material, { old: {}, version: material.version, state: null, asked: 0 });
    W.watch(material);
    material.dispose();
    assert.equal(W._recompiles.get(material), undefined);
});

test('a moving caster sits out of the shadow rows until its depth program is built', async () => {
    resetWarmup();
    const S = R.Shadows, renderer = compilingRenderer();
    const caster = new T.MeshDepthMaterial();
    caster.__rrCaster = true;
    const child = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    child.customDepthMaterial = caster;
    const root = new T.Group(), scene = new T.Scene();
    root.add(child); scene.add(root);
    let swapped = S._swapCasters([root], true, renderer, scene);
    assert.equal(child.visible, false, 'out of this frame\'s rows');
    assert.equal(swapped.length, 0);
    S._unswap(swapped);
    assert.equal(child.visible, true, 'and shown again after them');
    assert.equal(renderer.getRenderTarget(), null, 'what was bound is bound again');
    const program = renderer.properties.get(caster).currentProgram;
    assert.ok(program, 'its program was begun');
    // Not begun twice; ready once linked and read.
    S._unswap(S._swapCasters([root], true, renderer, scene));
    assert.equal(renderer.programs.length, 1);
    program.linked = true;
    await sleep(180);
    swapped = S._swapCasters([root], true, renderer, scene);
    assert.equal(child.material, caster, 'it casts');
    assert.equal(swapped.length, 2);
    S._unswap(swapped);
    // The still casters' rows are kept once drawn: those draw as before.
    const still = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    still.customDepthMaterial = Object.assign(new T.MeshDepthMaterial(), { __rrCaster: true });
    const stillRoot = new T.Group();
    stillRoot.add(still); scene.add(stillRoot);
    swapped = S._swapCasters([stillRoot], false, renderer, scene);
    assert.equal(swapped.length, 2);
    S._unswap(swapped);
    // Switched off: at once.
    const late = new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial());
    late.customDepthMaterial = Object.assign(new T.MeshDepthMaterial(), { __rrCaster: true });
    S.waitForDepth = false;
    try { assert.equal(S.casterReady(renderer, scene, late.customDepthMaterial, late), true); } finally { S.waitForDepth = true; }
    resetWarmup();
});

test('a merged group\'s pictures are the worker\'s own bytes, not a copy of them', () => {
    const models = read('reactor_3d_models.js');
    assert.match(models, /if \(data\) return new Uint8Array\(data\);/);
    assert.doesNotMatch(models, /out\.set\(new Uint8Array\(data\)\)/);
});
