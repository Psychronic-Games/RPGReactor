'use strict';
// The frame a border is walked over (Reactor3D.Neighbors) compiles, reads, indexes and draws
// nothing it could have done before: the full-screen light combines are compiled ahead, a
// program changed while out of sight waits for its compile instead of stopping the frame, the
// map left becomes a neighbor without being read again, the entered map's copy takes the cell
// index already built, and the crossing update shows the picture the passes already hold.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { runtimeSource } = require('./helpers/runtime-source.cjs');

const root = path.join(__dirname, '..', '..');
global.self = global; global.window = global;
require(path.join(root, 'runtime', 'libs', 'three.js'));
const THREE = global.THREE;
const R = require(path.join(root, 'runtime', 'reactor_3d.js'));
require(path.join(root, 'runtime', 'reactor_3d_lighting.js'));
const W = R.ShaderWarmup, N = R.Neighbors;

function fakeRenderer() {
    const props = new Map(), compiles = [], waiting = [];
    return {
        extensions: { has: name => name === 'KHR_parallel_shader_compile' },
        properties: { get: t => props.get(t) || (props.set(t, {}), props.get(t)) },
        compileAsync() { throw new Error('not used'); },
        compile(object) {
            compiles.push(object);
            const started = new Set();
            const each = o => { if (o.material) for (const m of [].concat(o.material)) { const program = { ready: false, isReady() { return this.ready; } }; this.properties.get(m).currentProgram = program; waiting.push(program); started.add(m); } for (const c of o.children || []) each(c); };
            each(object);
            return started;
        },
        draw(mesh) { for (const m of [].concat(mesh.material)) { const p = this.properties.get(m); p.currentProgram = p.currentProgram || {}; p.__version = m.version; } },
        finishCompiles() { while (waiting.length) waiting.shift().ready = true; }, compiles
    };
}
const tick = () => new Promise(res => setTimeout(res, 0));

/** Runs `fn` with performance.now() reading `clock.t`. */
function withClock(fn) {
    const real = performance.now, clock = { t: 1000 };
    performance.now = () => clock.t;
    const done = () => { performance.now = real; };
    try { const out = fn(clock); if (out && out.then) return out.finally(done); done(); return out; } catch (error) { done(); throw error; }
}

test('a program changed while out of sight waits for its compile when it comes back into a view drawn all along', () => withClock(async clock => {
    const scene = new THREE.Scene(), ground = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    const reeds = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(ground, reeds);
    const r = fakeRenderer();
    r.draw(ground); r.draw(reeds);
    assert.equal(W.hide(r, scene, {}), null, 'drawn before: shown');
    // Out of sight for a second while the view goes on drawing, and its program changes meanwhile (shadows came on).
    reeds.visible = false;
    for (let i = 0; i < 60; i++) { clock.t += 16; W.show(W.hide(r, scene, {}) || []); }
    reeds.material.needsUpdate = true;
    reeds.visible = true; clock.t += 16;
    const hidden = W.hide(r, scene, {});
    assert.deepEqual(hidden, [reeds], 'held out of the draw, not compiled inside it');
    W.show(hidden);
    assert.equal(r.compiles.length, 1, 'its compile started on the driver\'s threads');
    clock.t += 16; W.show(W.hide(r, scene, {}) || []);
    r.finishCompiles(); await tick();
    clock.t += 16;
    assert.equal(W.hide(r, scene, {}), null, 'linked: drawn');
}));

test('a recompile of something on screen, or after the view itself was not drawn, is drawn as before', () => withClock(clock => {
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh);
    const r = fakeRenderer();
    r.draw(mesh);
    assert.equal(W.hide(r, scene, {}), null);
    // On screen every frame, changing every frame: never held.
    for (let i = 0; i < 5; i++) { clock.t += 16; mesh.material.needsUpdate = true; assert.equal(W.hide(r, scene, {}), null); r.draw(mesh); }
    // A menu over the map for two seconds: nothing was drawn, so nothing coming back is new to the view.
    clock.t += 2000; mesh.material.needsUpdate = true;
    assert.equal(W.hide(r, scene, {}), null, 'the whole view returns: drawn as before');
    // The editor's view draws on demand: as before there too.
    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    scene.add(mesh2); r.draw(mesh2); mesh2.visible = false;
    for (let i = 0; i < 30; i++) { clock.t += 16; W.hide(r, scene, {}); }
    mesh2.visible = true; mesh2.material.needsUpdate = true; clock.t += 16;
    global.reactor = { projectController: {} };
    try { assert.equal(W.hide(r, scene, {}), null, 'the editor'); } finally { delete global.reactor; }
    assert.equal(r.compiles.length, 0);
}));

test('the unlit twin keeps its own warmup record: one the original holds from a lit pass is not read through', () => {
    const original = R.litMaterial(new THREE.MeshBasicMaterial());
    original.__rrWarm = original.version; original.__rrWarmMap = original.map; original.__rrSeen = 123;
    const twin = R.HalfLight.twin(original);
    assert.equal(twin.version, original.version, 'the version is still shared');
    assert.notEqual(twin.__rrWarm, original.__rrWarm);
    assert.equal(twin.__rrSeen, 0);
    // So the warmup asks about the twin's own program: compiled on the driver's threads, held until linked.
    const scene = new THREE.Scene(), mesh = new THREE.Mesh(new THREE.BoxGeometry(), twin);
    scene.add(mesh);
    const r = fakeRenderer();
    const hidden = W.hide(r, scene, {});
    assert.deepEqual(hidden, [mesh]);
    W.show(hidden);
});

test('the light\'s combines for the map past a border are compiled ahead, one a frame, inside the pass that draws them', () => {
    const H = R.HalfLight, saved = { expected: H._expected, programs: H._programs, upsamples: H._upsamples, combines: H._combines };
    H._expected = null; H._programs = {}; H._upsamples = {}; H._combines = {};
    try {
        const r = fakeRenderer(), bound = [];
        r.getRenderTarget = () => r.target;
        const compile = r.compile.bind(r);
        r.compile = (object, camera, scene) => { bound.push(r.target); return compile(object, camera, scene); };
        H.warmAhead(r, 'light');
        assert.equal(r.compiles.length, 0, 'nothing expected: nothing compiled');
        H.expect(); H.expect();
        assert.equal(H._expected.length, 4, 'water and none, sheen and none');
        r.target = 'light target';
        for (let i = 0; i < 4; i++) H.warmAhead(r, 'light');
        // The light program has two variants (with and without the sheen): two compiles, then nothing left.
        assert.equal(r.compiles.length, 2);
        r.target = 'pass target';
        for (let i = 0; i < 6; i++) H.warmAhead(r, 'upsample');
        assert.equal(r.compiles.length, 6, 'four upsample variants, one a call');
        assert.deepEqual(bound, ['light target', 'light target', 'pass target', 'pass target', 'pass target', 'pass target'], 'with the target its draw binds');
        // A variant already drawn is not compiled again.
        const drawn = H.combineQuad(true, false); r.properties.get(drawn.material).currentProgram = {};
        for (let i = 0; i < 6; i++) H.warmAhead(r, 'combine');
        assert.equal(r.compiles.length, 9, 'three combines left to build');
        // Without parallel compiling nothing is started (it could not be without waiting for it).
        const plain = fakeRenderer(); plain.extensions = { has: () => false };
        H._programs = {}; H.warmAhead(plain, 'light');
        assert.equal(plain.compiles.length, 0);
    } finally { Object.assign(H, { _expected: saved.expected, _programs: saved.programs, _upsamples: saved.upsamples, _combines: saved.combines }); }
    const surround = runtimeSource('reactor_3d_surround.js');
    assert.match(surround, /if \(depth === 1 && R\.HalfLight && R\.HalfLight\.expect\) R\.HalfLight\.expect\(\);/, 'asked for beside the map played');
    const lighting = runtimeSource('reactor_3d_lighting.js');
    assert.match(lighting, /renderer\.render\(pass\.scene, pass\.camera\);\n\s+this\.warmAhead\(renderer, "light"\);/);
    assert.match(lighting, /renderer\.render\(up\.scene, up\.camera\);\n\s+this\.warmAhead\(renderer, "upsample"\);/);
});

test('the haze\'s and the halo\'s programs are compiled ahead against stand-in targets of the output each draws to', () => {
    const H = R.HalfHaze, saved = { expected: H._expected, warmedFor: H._warmedFor, list: H._warmList };
    H._expected = false; H._warmedFor = null; H._warmList = null;
    try {
        const r = fakeRenderer(), bound = [], pass = { depthTexture: {} };
        let current = null;
        r.getRenderTarget = () => current;
        r.setRenderTarget = target => { current = target; };
        const compile = r.compile.bind(r);
        r.compile = (object, camera, scene) => { bound.push(current); return compile(object, camera, scene); };
        H.warmAhead(r, pass);
        assert.equal(r.compiles.length, 0, 'no map with lamps ahead: nothing');
        H.expect();
        H.warmAhead(r, { depthTexture: null });
        assert.equal(r.compiles.length, 0, 'a pass with no depth texture has no haze');
        const list = H.warmList();
        assert.equal(list.length, 7, 'shrink, haze, a lamp\'s glow, the halo\'s halving, gathering and screen, a feeder');
        for (let i = 0; i < 12; i++) H.warmAhead(r, pass);
        assert.equal(r.compiles.length, 7, 'each once, one a call');
        assert.equal(current, null, 'the pass\'s own target bound again after each');
        const small = H.standIn('small'), onPass = H.standIn('pass');
        assert.notEqual(small, onPass);
        assert.equal(small.isXRRenderTarget, undefined, 'a picture of its own: linear output');
        assert.equal(onPass.isXRRenderTarget, true, 'written as the pass is');
        assert.deepEqual(bound.map(t => (t === onPass ? 'pass' : t === small ? 'small' : '?')), list.map(entry => entry.output));
        assert.equal(H._warmedFor, r, 'then nothing more is asked');
    } finally { H._expected = saved.expected; H._warmedFor = saved.warmedFor; H._warmList = saved.list; }
    assert.match(runtimeSource('reactor_3d.js'), /if \(haze\) Reactor3D\.HalfHaze\.draw\(this\._renderer, target, camera, haze, split\);\n\s+Reactor3D\.HalfHaze\.warmAhead\(this\._renderer, target\);/);
    assert.match(runtimeSource('reactor_3d_surround.js'), /R\.HalfHaze\.expect\(\);/);
});

test('the map left becomes a neighbor from the map the game held: nothing read, parsed or indexed again', async () => {
    const savedRead = N.read, reads = [], answers = [];
    N.read = file => { reads.push(file); return new Promise(res => answers.push(res)); };
    try {
        const left = { width: 10, height: 10, events: [], reactor3d: { pieces: [{ id: 1, kind: 'block', x: 2, y: 2, z: 0, rot: 0, material: 'Stone' }] } };
        const index = R.pieceIndex(left);
        const record = N.played(91, left);
        assert.equal(record.state, 'ready');
        assert.equal(record.map, left, 'the map as the game held it');
        assert.equal(record.measure, 'done');
        assert.equal(N.records.get(91), record);
        assert.equal(R.pieceIndex(record.map), index, 'its index is the one built while it was played');
        assert.equal(record.text, null);
        // Until its files are in, no copy can be handed over: a turn back is a transfer like any other.
        N.crossing = { to: 91 };
        assert.equal(N.take(91), null);
        assert.deepEqual(reads, ['Map091.json', 'Map091' + (R.SIDECAR_SUFFIX || '.r3d.json')]);
        answers[0]('{"width":10,"height":10,"events":[]}'); answers[1](null);
        await tick();
        assert.ok(record.text, 'read in the background for the copy');
        assert.equal(N.played(0, left), null);
        assert.equal(N.played(92, null), null);
    } finally { N.read = savedRead; N.records.delete(91); N.crossing = null; }
});

test('the copy the game enters by takes the cell index of the world built from the same files', () => {
    const pieces = () => [{ id: 1, kind: 'block', x: 1, y: 1, z: 0, rot: 0, material: 'Stone' }, { id: 2, kind: 'wall', x: 3, y: 1, z: 0, rot: 1, material: 'Brick' }];
    const world = { width: 8, height: 8, reactor3d: { pieces: pieces() } }, copy = { width: 8, height: 8, reactor3d: { pieces: pieces() } };
    assert.equal(R.sharePieceIndex(world, copy), false, 'nothing built yet: nothing to share');
    const index = R.pieceIndex(world);
    assert.equal(R.sharePieceIndex(world, copy), true);
    assert.equal(R.pieceIndex(copy), index, 'the copy asks nothing new');
    assert.equal(R.sharePieceIndex(world, copy), false, 'once');
    const other = { width: 9, height: 8, reactor3d: { pieces: pieces() } };
    assert.equal(R.sharePieceIndex(world, other), false, 'another size is another map');
    assert.match(runtimeSource('reactor_3d_surround.js'), /if \(map && R\.sharePieceIndex\) R\.sharePieceIndex\(record\.map, map\);/, 'handed over by N.take');
});

test('rock columns measured for maps side by side are kept for each: one map\'s measuring does not throw another\'s away', () => {
    const rock = (id, x, y, extra) => Object.assign({ id, kind: 'rock', x, y, z: 0, rot: 0, material: 'Rock', size: [4, 5, 4], rough: 0.6 }, extra);
    const mapWith = pieces => ({ width: 64, height: 64, reactor3d: { version: 1, elevation: new Array(64 * 64).fill(0), pieces } });
    const saved = R._rockColumnCache;
    R._rockColumnCache = new Map();
    const field = R.rockField;
    let measured = 0;
    R.rockField = function() { measured++; return field.apply(this, arguments); };
    try {
        const a = mapWith([rock(1, 8, 8)]), b = mapWith([rock(1, 9, 9, { size: [3, 6, 3] })]);
        R.rockColumns(a, R.rockPiecesOf(a));
        R.rockColumns(b, R.rockPiecesOf(b));
        measured = 0;
        R.rockColumns(a, R.rockPiecesOf(a));
        R.rockColumns(b, R.rockPiecesOf(b));
        assert.equal(measured, 0, 'both kept at the same chunk place');
        assert.equal(R.rockColumnsKnown(0, 'nothing'), null);
    } finally { R.rockField = field; R._rockColumnCache = saved; }
});

test('the frames after a crossing do one piece of a world\'s upkeep each, and models join a few a frame while worlds stand beside', () => {
    N._upkeptAt = undefined;
    assert.equal(N.upkeep(10), true);
    assert.equal(N.upkeep(10), false, 'one a frame');
    assert.equal(N.upkeep(11), true);
    const saved = N.live;
    try {
        N.live = { scene: { _neighborBodies: {} } };
        assert.equal(N.streaming(), false);
        N.live.scene._neighborBodies.east = {};
        assert.equal(N.streaming(), true);
        assert.equal(R.ModelJoins.limited(), true, 'a world past a border: models paced');
        N.live = null;
        assert.equal(N.streaming(), false);
    } finally { N.live = saved; }
});

test('the crossing update shows the picture the passes hold instead of drawing the world again', () => {
    const sprites = runtimeSource('reactor_sprites.js');
    const body = sprites.match(/Spriteset_Map\.prototype\.reactor3DKeepsLastPicture = function\(state\) \{[\s\S]*?\n\};/);
    assert.ok(body, 'the rule is in the runtime');
    const Graphics = { frameCount: 100 }, Reactor3D = { Neighbors: { KEEP_PICTURE: 4 } };
    const keeps = new Function('Graphics', 'Reactor3D', 'const Spriteset_Map = { prototype: {} };\n' + body[0] + '\nreturn Spriteset_Map.prototype.reactor3DKeepsLastPicture;')(Graphics, Reactor3D);
    const drawn = { below: 98 };
    const viewport = { isShared: () => true, drawnAt: slot => drawn[slot] };
    const spriteset = { _reactor3dAdoptedAt: 100 };
    assert.equal(keeps.call(spriteset, { viewport }), true, 'adopted this update, the world drawn two updates back');
    assert.equal(keeps.call({ _reactor3dAdoptedAt: 99 }, { viewport }), false, 'only in the crossing update');
    assert.equal(keeps.call(Object.assign({ _reactor3dAbove: {} }, spriteset), { viewport }), false, 'a pass this map shows that the last draw did not make');
    drawn.above = 98;
    assert.equal(keeps.call(Object.assign({ _reactor3dAbove: {} }, spriteset), { viewport }), true);
    drawn.below = 90;
    assert.equal(keeps.call(spriteset, { viewport }), false, 'a picture too old is drawn again');
    drawn.below = 98;
    assert.equal(keeps.call(spriteset, { viewport: { isShared: () => false, drawnAt: viewport.drawnAt } }), false, 'a copied canvas holds nothing');
    Reactor3D.Neighbors.KEEP_PICTURE = 0;
    assert.equal(keeps.call(spriteset, { viewport }), false, '0 switches it off');
    assert.match(sprites, /const adopted = Reactor3D\.Neighbors && Reactor3D\.Neighbors\.adopt\(\$gameMap\.mapId\(\)\);\n\s+if \(adopted\) this\._reactor3dAdoptedAt = Graphics\.frameCount;/);
    assert.match(runtimeSource('reactor_3d.js'), /\(this\._slotDrawn \|\| \(this\._slotDrawn = \{\}\)\)\[slot\] = frame;/, 'each pass says when it drew');
    // And the scene start over a border does not update (and draw) the spriteset made in the same update.
    const scenes = runtimeSource('reactor_scenes.js');
    assert.match(scenes, /this\._spriteset\.update\(\);\n\s+this\._spritesetMadeAt = Graphics\.frameCount;/);
    assert.match(scenes, /if \(this\._spritesetMadeAt !== Graphics\.frameCount\) this\._spriteset\.update\(\);\n\s+Reactor3D\.Neighbors\.end\(\);/);
});

test('a map\'s glowing water keeps one picture signature however often its data is read again', () => {
    const L = R.WaterLight;
    const pondMap = (glow, x1 = 19) => ({ width: 40, height: 30, data: [], reactor3d: { version: 1, mode: '3d', water: [{ x0: 10, y0: 10, x1, y1: 17, level: -0.2, material: 'Water', glow, colour: '#6c0ec7' }] } });
    const first = L.describe(pondMap(0.5));
    L.describe(pondMap(0.8, 25));
    const again = L.describe(pondMap(0.5));
    assert.ok(first && again);
    assert.equal(again.signature, first.signature, 'the map entered again finds its picture');
    assert.notEqual(L.describe(pondMap(0.6)).signature, first.signature, 'another look is another picture');
});
