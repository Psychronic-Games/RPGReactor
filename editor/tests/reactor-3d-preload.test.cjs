/**
 * Model preloading and off-thread parsing: the worker's GLB split agrees
 * with the runtime's, a map's full model list is collectable before its
 * first frame, worker-decoded bitmaps reach the materials, and the
 * Scene_Map gate is wired after the class bodies.
 */
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const workerParts = Reactor3D._workerParts;

function syntheticGlb() {
    const json = Buffer.from(JSON.stringify({
        asset: { version: '2.0' },
        meshes: [], nodes: [{ name: 'n' }], scenes: [{ nodes: [0] }], scene: 0
    }));
    const jsonPad = Buffer.alloc((4 - (json.length % 4)) % 4, 0x20);
    const bin = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const chunks = [];
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546C67, 0);
    header.writeUInt32LE(2, 4);
    const jsonHead = Buffer.alloc(8);
    jsonHead.writeUInt32LE(json.length + jsonPad.length, 0);
    jsonHead.writeUInt32LE(0x4E4F534A, 4);
    const binHead = Buffer.alloc(8);
    binHead.writeUInt32LE(bin.length, 0);
    binHead.writeUInt32LE(0x004E4942, 4);
    chunks.push(header, jsonHead, json, jsonPad, binHead, bin);
    const whole = Buffer.concat(chunks);
    whole.writeUInt32LE(whole.length, 8);
    // A page-realm ArrayBuffer, not a Node Buffer view.
    const buffer = new ArrayBuffer(whole.length);
    new Uint8Array(buffer).set(whole);
    return buffer;
}

test('the worker splits a GLB exactly as the runtime reader does', () => {
    const buffer = syntheticGlb();
    const fromWorker = workerParts.splitGlb(buffer);
    const fromRuntime = Reactor3D.readGlb(buffer);
    assert.deepEqual(fromWorker.json, fromRuntime.json);
    const workerBin = new Uint8Array(buffer, fromWorker.bin.offset, fromWorker.bin.length);
    assert.deepEqual(Array.from(workerBin), Array.from(fromRuntime.bin));
    assert.throws(() => workerParts.splitGlb(new ArrayBuffer(4)), /not a GLB/);
});

test('a map lists every model it can show before its first frame', () => {
    const map = {
        reactor3d: {
            version: 1, mode: '3d',
            events: {
                '5': { '0': { name: 'Enemies/monster-plant', ext: '.obj' } },
                '9': { '0': { name: 'Vehicles/car', ext: '.glb' },
                       '1': { name: 'Vehicles/car', ext: '.glb' } }
            }
        }
    };
    const savedSidecar = Reactor3D._databaseSidecar;
    const savedState = Reactor3D._databaseSidecarState;
    Reactor3D._databaseSidecar = {
        actors: {
            '1': { character: { name: 'Actors/hero', ext: '.glb' }, face: { name: 'Actors/face-only', ext: '.glb' } },
            '2': { name: 'Actors/legacy-flat', ext: '.glb' }
        }
    };
    Reactor3D._databaseSidecarState = 'done';
    try {
        const names = Reactor3D.collectMapModelSpecs(map).map(spec => spec.name).sort();
        assert.deepEqual(names, [
            'Actors/hero', 'Actors/legacy-flat', 'Enemies/monster-plant', 'Vehicles/car'
        ], 'events dedupe, character slots join, face-only slots stay out');
        assert.deepEqual(Reactor3D.collectMapModelSpecs({}).map(spec => spec.name).sort(),
            ['Actors/hero', 'Actors/legacy-flat'], 'a flat map still preloads the party models it draws as sprites');
        // A map waits for the party's models and its own; other actors' come after it (runtime 20261105.7).
        const savedParty = global.$gameParty;
        try {
            global.$gameParty = { allMembers: () => [{ actorId: () => 1 }] };
            assert.deepEqual(Reactor3D.laterActorSpecs(Reactor3D.collectMapModelSpecs(map), map).map(spec => spec.name), ['Actors/legacy-flat'],
                'an actor outside the party is put off');
            const placed = { reactor3d: { events: { '3': { '0': { name: 'Actors/legacy-flat', ext: '.glb' } } } } };
            assert.deepEqual(Reactor3D.laterActorSpecs(Reactor3D.collectMapModelSpecs(placed), placed), [], 'one an event of the map wears is not');
            global.$gameParty = undefined;
            assert.deepEqual(Reactor3D.laterActorSpecs(Reactor3D.collectMapModelSpecs(map), map), [], 'without a party, nothing is put off');
        } finally { global.$gameParty = savedParty; }
        Reactor3D._databaseSidecar = null;
        assert.deepEqual(Reactor3D.collectMapModelSpecs({}), [], 'nothing bound, nothing preloaded');
    } finally {
        Reactor3D._databaseSidecar = savedSidecar;
        Reactor3D._databaseSidecarState = savedState;
    }
});

test('worker-decoded bitmaps reach the material maps directly', () => {
    global.self = global;
    global.window = global;
    require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const bin = new Uint8Array(positions.buffer.slice(0));
    const json = {
        asset: { version: '2.0' },
        buffers: [{ byteLength: bin.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
        images: [{ bufferView: 0, mimeType: 'image/png' }],
        textures: [{ source: 0 }],
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        nodes: [{ name: 'quad', mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0
    };
    const stubBitmap = { width: 8, height: 8, isFakeBitmap: true };
    const template = Reactor3D.buildGlbTemplate(json, bin, '', { 0: stubBitmap });
    let map = null;
    template.traverse(node => {
        if (!map && node.isMesh && node.material && node.material.map) map = node.material.map;
    });
    assert.ok(map, 'the material carries a texture');
    assert.equal(map.image, stubBitmap, 'the texture is the worker-decoded bitmap');
    assert.equal(map.flipY, false);
});

test('the Scene_Map preload gate is wired after the class bodies', () => {
    const scenes = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_scenes.js'), 'utf8');
    const wrapperAt = scenes.indexOf('_reactorSceneMapOnMapLoaded');
    const lastClassAt = scenes.lastIndexOf('Scene_Gameover.prototype');
    assert.ok(wrapperAt > lastClassAt, 'wrappers live after every prototype replacement');
    assert.match(scenes, /this\._reactorPreloadDone !== false/);
    assert.match(scenes, /setTimeout\(done, 8000\)/, 'the gate fails open');
    assert.match(scenes, /Reactor3D\.warmLoadedTemplates\(\)/);
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /Reactor3D\.warmLoadedTemplates\(\)/, 'late loads warm from the sync loop too');
});

test('the boot scene waits for the async database sidecar', () => {
    // In a browser the sidecar is an async fetch; without this gate the
    // first frames commit 3D-bound actors to 2D sheets that no longer
    // exist on disk (the web-only "Failed to load img/characters" crash).
    const scenes = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_scenes.js'), 'utf8');
    const bootGateAt = scenes.indexOf('_reactorSceneBootIsReady');
    const lastClassAt = scenes.lastIndexOf('Scene_Gameover.prototype');
    assert.ok(bootGateAt > lastClassAt, 'the boot gate lives after every prototype replacement');
    assert.match(scenes, /!Reactor3D\.isDatabaseSidecarReady\(\)/);
    const r3d = source3D();
    assert.match(r3d, /_databaseSidecarState !== "loading"/, 'readiness reads the load state');
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /isPartySprite && Reactor3D\.isDatabaseSidecarReady/,
        'party sprites never commit to a sheet before the sidecar answers');
});

test('model files download a few at a time, so a map\'s own pictures are not left last on a slow line', () => {
    const D = Reactor3D.ModelDownloads, was = { limit: D.LIMIT, active: D.active, waiting: D.waiting };
    try {
        D.LIMIT = 2; D.active = 0; D.waiting = [];
        const started = [], releases = [];
        for (let i = 0; i < 4; i++) D.take(release => { started.push(i); releases.push(release); });
        assert.deepEqual(started, [0, 1], 'two at once');
        releases[0](); releases[0]();
        assert.deepEqual(started, [0, 1, 2], 'one freed place starts one more, however often it is freed');
        releases[1]();
        assert.deepEqual(started, [0, 1, 2, 3]);
        assert.equal(D.active, 2);
    } finally { Object.assign(D, { LIMIT: was.limit, active: was.active, waiting: was.waiting }); }
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '..', 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.match(source, /this\.ModelDownloads\.take\(release => \{\s*const xhr = new XMLHttpRequest\(\);/);
    assert.match(source, /xhr\.onloadend = release;\s*xhr\.onload = \(\) => \{\s*release\(\);/);
});

test('a single-player game from its own disk makes other actors\' models when asked, not after the map opens', async () => {
    const hadUtils = 'Utils' in global, hadOnline = 'ReactorOnline' in global;
    const utils = global.Utils, online = global.ReactorOnline, load = Reactor3D.loadModel;
    let loads = 0;
    Reactor3D.loadModel = () => { loads++; return Promise.resolve(null); };
    try {
        global.Utils = { isNwjs: () => true };
        global.ReactorOnline = { config: () => null };
        await Reactor3D.loadLaterModels([{ name: 'Actors/Someone', ext: '.glb', file: 'Someone' }]);
        assert.equal(loads, 0, 'NW.js, offline: nothing made after the map opens');
        global.ReactorOnline = { config: () => ({ enabled: true }) };
        await Reactor3D.loadLaterModels([{ name: 'Actors/Someone', ext: '.glb', file: 'Someone' }]);
        assert.equal(loads, 1, 'online: other players may wear it');
        global.Utils = { isNwjs: () => false }; global.ReactorOnline = { config: () => null };
        await Reactor3D.loadLaterModels([{ name: 'Actors/Other', ext: '.glb', file: 'Other' }]);
        assert.equal(loads, 2, 'over the web: fetched behind the map as before');
    } finally {
        Reactor3D.loadModel = load;
        if (hadUtils) global.Utils = utils; else delete global.Utils;
        if (hadOnline) global.ReactorOnline = online; else delete global.ReactorOnline;
    }
});
