// Models leave memory when the map that used them is left: every load claims its model for the map
// being played, and the next map's start lets go of what it did not claim, past a small grace.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function load() {
    global.self = global; global.window = global;
    require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js'));
    return require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
}

/** A loaded model in the cache: one mesh, one 256x256 picture (or a shared one), disposals counted. */
function put(R, name, shared) {
    const THREE = global.THREE, gone = { geometry: 0, texture: 0, material: 0 };
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(300), 3));
    geometry.addEventListener('dispose', () => { gone.geometry++; });
    const texture = shared || new THREE.Texture({ width: 256, height: 256 });
    if (!shared) texture.addEventListener('dispose', () => { gone.texture++; });
    const material = new THREE.MeshBasicMaterial({ map: texture });
    material.addEventListener('dispose', () => { gone.material++; });
    const template = new THREE.Group();
    template.add(new THREE.Mesh(geometry, material));
    template.userData.glbTextures = [texture];
    const key = R.modelCacheKey(name, '.glb');
    R._glbCache[key] = { promise: Promise.resolve(template), template, failed: false };
    R.loadModel(name, '.glb');
    return { key, template, geometry, texture, gone };
}

function fresh() {
    const R = load(), U = R.ModelUse;
    for (const key of Object.keys(R._glbCache)) delete R._glbCache[key];
    Object.assign(U, { generation: 0, mapId: 0, pending: false, released: 0, releasedBytes: 0, enabled: true, _textOf: null, _text: '', _commonText: undefined });
    R._heldMeasures.clear();
    R._lodCache = Object.create(null);
    delete global.$gameParty; delete global.$gameFight; delete global.$dataTroops; delete global.$dataCommonEvents;
    return R;
}

test('a map change lets go of the models the new map did not claim, and keeps the ones it did', () => {
    const R = fresh(), U = R.ModelUse, grace = U.graceBytes;
    U.graceBytes = 0;
    try {
        assert.equal(U.begin(1), true);
        const a = put(R, 'Props/a'), b = put(R, 'Props/b');
        assert.deepEqual(U.sweep({ events: [] }), [], 'the first map has nothing behind it');
        assert.equal(U.begin(1), false, 'the same map again (a menu closed, a battle scene left) is not a change');
        assert.deepEqual(U.sweep({ events: [] }), []);

        assert.equal(U.begin(2), true);
        R.loadModel('Props/b', '.glb');
        const c = put(R, 'Props/c');
        assert.deepEqual(U.sweep({ events: [] }), [a.key]);
        assert.equal(R._glbCache[a.key], undefined);
        assert.deepEqual(a.gone, { geometry: 1, texture: 1, material: 1 }, 'its GPU side is given back');
        assert.ok(R._glbCache[b.key] && R._glbCache[c.key], 'a model both maps use, and the new map\'s own, stay');
        assert.deepEqual(b.gone, { geometry: 0, texture: 0, material: 0 });
        assert.equal(U.released, 1);
        assert.deepEqual(U.sweep({ events: [] }), [], 'one sweep a map');
    } finally { U.graceBytes = grace; }
});

test('the newest unclaimed models stay while they fit the grace; a low-memory machine has a smaller one', () => {
    const R = fresh(), U = R.ModelUse, grace = U.graceBytes, low = U.lowMemoryGraceBytes, tier = R.memoryTier;
    try {
        U.begin(1); const a = put(R, 'Props/a');
        U.begin(2); const b = put(R, 'Props/b');
        const one = U.bytesOf(b.key, R._glbCache[b.key]);
        assert.equal(one, 300 * 4 * 2 + Math.round(256 * 256 * 4 * 1.33), 'geometry on both sides and the picture with its smaller copies');
        U.graceBytes = one; R.memoryTier = 'normal';
        assert.deepEqual(U.sweep({ events: [] }), [], 'the map before fits the grace: walking back costs nothing');
        U.begin(3);
        assert.deepEqual(U.sweep({ events: [] }), [a.key], 'two maps on, the older one goes and the newer one stays');
        assert.ok(R._glbCache[b.key]);
        U.begin(4); R.memoryTier = 'low'; U.lowMemoryGraceBytes = one - 1;
        assert.deepEqual(U.sweep({ events: [] }), [b.key]);
    } finally { U.graceBytes = grace; U.lowMemoryGraceBytes = low; R.memoryTier = tier; }
});

test('what the map, a battle on it, its encounters and its events name counts as in use; nothing goes during a battle', () => {
    const R = fresh(), U = R.ModelUse, grace = U.graceBytes;
    const battle = R.collectBattleModelSpecs, database = R.databaseModelSpec;
    U.graceBytes = 0;
    try {
        U.begin(1);
        const placed = put(R, 'Props/placed'), unit = put(R, 'Enemies/unit'), held = put(R, 'Weapons/held'), troop = put(R, 'Enemies/troop');
        const scripted = put(R, 'Props/scripted'), idle = put(R, 'Props/idle');
        R.collectBattleModelSpecs = () => ({ units: [{ name: 'Enemies/unit', ext: '.glb' }], held: [{ name: 'Weapons/held', ext: '.glb' }] });
        R.databaseModelSpec = (section, id) => section === 'enemies' && id === 7 ? { name: 'Enemies/troop', ext: '.glb' } : null;
        global.$dataTroops = [null, { members: [{ enemyId: 7 }] }];
        const map = {
            reactor3d: { events: { 1: { 0: { name: 'Props/placed', ext: '.glb' } } } },
            encounterList: [{ troopId: 1 }],
            events: [null, { id: 1, pages: [{ list: [{ code: 355, parameters: ['Reactor3D.showModel("Props/scripted")'] }] }] }]
        };
        U.begin(2);
        global.$gameParty = { inBattle: () => true };
        assert.deepEqual(U.sweep(map), [], 'a battle is on: nothing is let go');
        assert.equal(U.pending, true, 'and the sweep is still owed');
        global.$gameParty = { inBattle: () => false };
        assert.deepEqual(U.sweep(map), [idle.key]);
        for (const kept of [placed, unit, held, troop, scripted]) assert.ok(R._glbCache[kept.key], kept.key + ' stays');
    } finally { U.graceBytes = grace; R.collectBattleModelSpecs = battle; R.databaseModelSpec = database; delete global.$gameParty; delete global.$dataTroops; }
});

test('a picture two models share stays with the one that stays; detail levels and held measures go with the model', () => {
    const R = fresh(), U = R.ModelUse, grace = U.graceBytes, THREE = global.THREE;
    U.graceBytes = 0;
    try {
        U.begin(1);
        let sharedGone = 0;
        const sheet = new THREE.Texture({ width: 64, height: 64 });
        sheet.addEventListener('dispose', () => { sharedGone++; });
        const a = put(R, 'Variants/red', sheet), b = put(R, 'Variants/blue', sheet);
        let levelGone = 0;
        const level = new THREE.BufferGeometry();
        level.setAttribute('position', new THREE.BufferAttribute(new Float32Array(30), 3));
        level.addEventListener('dispose', () => { levelGone++; });
        R._lodCache[a.key] = { levels: [[a.geometry], [level]] };
        R._heldMeasures.set(a.geometry.uuid + ',1,0|', { shape: {}, cloud: null });
        R._heldMeasures.set(b.geometry.uuid + ',1,0|', { shape: {}, cloud: null });
        R._prewarmTemplates = [a.template, b.template];
        R._warmedTemplates = new Set([a.key, b.key]);
        U.begin(2);
        R.loadModel('Variants/blue', '.glb');
        assert.deepEqual(U.sweep({ events: [] }), [a.key]);
        assert.equal(sharedGone, 0, 'the sheet is still drawn by the other variant');
        assert.equal(a.gone.geometry, 1);
        assert.equal(levelGone, 1);
        assert.equal(R._lodCache[a.key], undefined);
        assert.deepEqual(Array.from(R._heldMeasures.keys()), [b.geometry.uuid + ',1,0|']);
        assert.deepEqual(R._prewarmTemplates, [b.template]);
        assert.deepEqual(Array.from(R._warmedTemplates), [b.key]);
    } finally { U.graceBytes = grace; R._prewarmTemplates = null; R._warmedTemplates = null; }
});

test('a model let go is asked for from its file again, and a load still in flight is never let go', () => {
    const R = fresh(), U = R.ModelUse, grace = U.graceBytes, XHR = global.XMLHttpRequest;
    const opened = [];
    global.XMLHttpRequest = function() { this.open = (method, url) => { opened.push(url); }; this.send = () => {}; };
    U.graceBytes = 0;
    try {
        U.begin(1);
        const a = put(R, 'Props/a');
        R.loadModel('Props/loading', '.glb');
        const flying = R._glbCache[R.modelCacheKey('Props/loading', '.glb')];
        assert.ok(flying && !flying.template);
        const before = opened.length;
        U.begin(2);
        assert.deepEqual(U.sweep({ events: [] }), [a.key]);
        assert.equal(R._glbCache[R.modelCacheKey('Props/loading', '.glb')], flying, 'still loading: left alone');
        const again = R.loadModel('Props/a', '.glb');
        assert.ok(again && typeof again.then === 'function');
        assert.ok(R._glbCache[a.key] && !R._glbCache[a.key].template, 'a new entry, loading');
        assert.equal(opened.length, before + 1, 'its file is requested again');
        assert.match(opened[opened.length - 1], /Props\/a\.glb$/);
        assert.equal(R._glbCache[a.key].used, U.generation, 'and it is claimed for this map');
    } finally { U.graceBytes = grace; global.XMLHttpRequest = XHR; }
});

test('an early sweep, as a map\'s data arrives, lets go of what the map does not name and leaves the sweep at its start owed', () => {
    const R = fresh(), U = R.ModelUse, grace = U.graceBytes;
    U.graceBytes = 0;
    try {
        U.begin(1);
        const stays = put(R, 'Props/stays'), goes = put(R, 'Props/goes'), late = put(R, 'Props/late');
        const map = { reactor3d: { events: { 1: { 0: { name: 'Props/stays', ext: '.glb' } } } }, events: [] };
        U.begin(2);
        assert.deepEqual(U.sweep(map, true).sort(), [goes.key, late.key].sort(), 'before the map\'s own models load');
        assert.ok(R._glbCache[stays.key]);
        assert.equal(U.pending, true);
        // Loaded while the map loads and not named by it: claimed, so the sweep at the start keeps it.
        const claimed = put(R, 'Props/claimed');
        assert.deepEqual(U.sweep(map), []);
        assert.ok(R._glbCache[claimed.key]);
        assert.equal(U.pending, false);
    } finally { U.graceBytes = grace; }
});

test('the map scene opens a map change before it builds anything and sweeps as it starts, after the scene before it is gone', () => {
    const source = require('node:fs').readFileSync(path.resolve(__dirname, '..', '..', 'runtime/reactor_scenes.js'), 'utf8');
    const loaded = source.slice(source.indexOf('Scene_Map.prototype.onMapLoaded = function() {\n    // Another map'));
    const begin = loaded.indexOf('Reactor3D.ModelUse.begin('), base = loaded.indexOf('_reactorSceneMapOnMapLoaded.call(this)'), preload = loaded.indexOf('Reactor3D.preloadMapModels($dataMap)');
    assert.ok(begin > 0 && begin < base && base < preload, 'claims made while the scene builds and preloads count for the new map');
    const world = loaded.indexOf('spriteset.releaseReactor3D()'), early = loaded.indexOf('Reactor3D.ModelUse.sweep($dataMap, true)');
    assert.ok(begin < world && world < early && early < base, 'the map left behind gives its world back, then its models, before this map loads its own');
    assert.match(loaded.slice(0, base), /SceneManager\._previousScene/);
    assert.match(loaded.slice(0, base), /\$gamePlayer\.newMapId\(\)/, 'a transfer names the map it goes to: the player has not moved yet');
    const start = source.slice(source.indexOf('Scene_Map.prototype.start = function() {\n    _reactorSceneMapStart.call(this);'));
    const sweep = start.indexOf('Reactor3D.ModelUse.sweep($dataMap)'), warm = start.indexOf('Reactor3D.warmLoadedTemplates()');
    assert.ok(sweep > 0 && sweep < warm && warm < 600, 'start runs after the previous scene is destroyed and before the first drawn frame');
});
