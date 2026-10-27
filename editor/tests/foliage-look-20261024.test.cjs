// Foliage looks: what is painted next takes the look in hand and leaves what already grows alone; Recolor brushes the
// look onto plants already there; Pick takes a plant's look into hand; quick colors are for one kind and what comes
// next; a plant's shape (height, thickness, lean, variety; a bush's size and how tall it stands) and mixed crystal
// colors are kept with what is painted and grown by the runtime.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));
const quiet = { log() {}, warn() {}, error() {}, debug() {} };
const plain = value => JSON.parse(JSON.stringify(value));

function terrainOn(map) {
    const context = { console: quiet, setTimeout, clearTimeout, Reactor3D: R, Uint8Array,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, getElementById: () => null },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } };
    context.window = context;
    for (const file of ['MapElevation.js', 'MapFoliage.js', 'MapGround.js']) vm.runInNewContext(read('editor/src/utils/' + file), context);
    vm.runInNewContext(read('editor/src/TerrainManager.js') + '\nwindow.TerrainManager = TerrainManager;', context);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    return { terrain, F: context.RRMapFoliage, TM: context.TerrainManager };
}
const mapOf = (w, h) => ({ id: 1, width: w, height: h, data: new Array(w * h * 6).fill(0), events: [], reactor3d: { version: 1, mode: '3d' } });
const layers = map => plain((map.reactor3d.foliage || {}).layers || []);
const paintAt = (terrain, x, y) => { terrain.beginStroke({ x, y }); terrain.endStroke(); };
const grows = (F, map, layer, x, y) => F.decode(layer.density, map.width * map.height)[y * map.width + x] > 0;

test('a new color paints a new patch; the crystals already there keep theirs', () => {
    const map = mapOf(30, 20); const { terrain, F } = terrainOn(map);
    terrain.setMode('crystals'); terrain.radius = 2; terrain.strength = 1;
    terrain.foliageLook.crystals = { colour: '#aa0000' };
    paintAt(terrain, 5, 5);
    terrain.foliageLook.crystals = { colour: '#0000aa' };
    paintAt(terrain, 20, 10);
    const list = layers(map);
    assert.deepEqual(list.map(l => l.colour), ['#aa0000', '#0000aa']);
    assert.ok(grows(F, map, list[0], 5, 5) && !grows(F, map, list[0], 20, 10));
    assert.ok(grows(F, map, list[1], 20, 10) && !grows(F, map, list[1], 5, 5));
});

test('flowers painted with other petal colors are a patch of their own, not a recolor of the ones planted', () => {
    const map = mapOf(30, 20); const { terrain } = terrainOn(map);
    terrain.setMode('flowers'); terrain.radius = 2; terrain.strength = 1;
    terrain.foliageLook.flowers = { colours: ['#ff0000'] };
    paintAt(terrain, 5, 5);
    terrain.foliageLook.flowers = { colours: ['#0000ff'] };
    paintAt(terrain, 20, 10);
    assert.deepEqual(layers(map).map(l => l.colours), [['#ff0000'], ['#0000ff']]);
});

test('Recolor moves what grows under the brush to the look in hand, as dense as it was; elsewhere stays', () => {
    const map = mapOf(30, 20); const { terrain, F } = terrainOn(map);
    terrain.setMode('grass'); terrain.radius = 3; terrain.strength = 1; terrain.foliageLevel = 6;
    terrain.foliageLook.grass = { colour: '#112233' };
    terrain.beginStroke({ x: 4, y: 8 }); terrain.paintAt({ x: 10, y: 8 }); terrain.paintAt({ x: 16, y: 8 }); terrain.endStroke();
    const before = layers(map)[0], was = F.decode(before.density, 600)[8 * 30 + 5];
    terrain.foliageAction = 'recolor';
    terrain.foliageLook.grass = { colour: '#ddeeff', height: 2 };
    terrain.beginStroke({ x: 4, y: 8 }); terrain.endStroke();
    const after = layers(map);
    assert.equal(after.length, 2);
    const fresh = after.find(l => l.colour === '#ddeeff');
    assert.equal(fresh.height, 2);
    assert.equal(F.decode(fresh.density, 600)[8 * 30 + 5], was, 'as dense as it grew');
    assert.ok(!grows(F, map, after.find(l => l.colour === '#112233'), 5, 8), 'gone from the old look there');
    assert.ok(grows(F, map, after.find(l => l.colour === '#112233'), 16, 8), 'and still the old look away from the brush');
    assert.ok(!grows(F, map, fresh, 25, 8), 'nothing grows where nothing grew');
    // One undo puts it back.
    terrain.undo();
    assert.equal(layers(map).length, 1);
});

test('Pick takes a plant\'s look into hand and goes back to Paint; a bush gives its colors, size and tallness', () => {
    const map = mapOf(30, 20); const { terrain } = terrainOn(map);
    terrain.setMode('reeds'); terrain.radius = 2; terrain.strength = 1;
    terrain.foliageLook.reeds = { colour: '#123456', tip: '#abcdef', height: 3.5, width: 2, lean: 0.5 };
    paintAt(terrain, 6, 6);
    terrain.foliageLook.reeds = {};
    terrain.foliageAction = 'pick';
    terrain.beginStroke({ x: 6, y: 6 }); terrain.endStroke();
    assert.deepEqual(plain(terrain.foliageLook.reeds), { height: 3.5, colour: '#123456', tip: '#abcdef', width: 2, lean: 0.5 });
    assert.equal(terrain.foliageAction, 'paint');
    assert.equal(layers(map).length, 1, 'a pick changes nothing on the map');
    terrain.setMode('bush'); terrain.bushVary = false; terrain.bushSize = 3; terrain.bushTall = 2; terrain.bushColour = '#224422'; terrain.bushBloom = '#ff00ff';
    paintAt(terrain, 15, 10);
    terrain.bushColour = ''; terrain.bushBloom = ''; terrain.bushSize = 1; terrain.bushTall = 1;
    terrain.foliageAction = 'pick';
    terrain.beginStroke({ x: 15, y: 10 }); terrain.endStroke();
    assert.deepEqual([terrain.bushColour, terrain.bushBloom, terrain.bushSize, terrain.bushTall], ['#224422', '#ff00ff', 3, 2]);
});

test('Recolor on bushes gives the ones under the brush the leaves and blossom in hand; Natural takes their own color off', () => {
    const map = mapOf(30, 20); const { terrain } = terrainOn(map);
    terrain.setMode('bush'); terrain.bushVary = false; terrain.bushColour = '#224422';
    paintAt(terrain, 4, 4); paintAt(terrain, 20, 10);
    terrain.foliageAction = 'recolor'; terrain.radius = 2; terrain.bushColour = '#aa5500'; terrain.bushBloom = '#ffffff';
    terrain.beginStroke({ x: 4, y: 4 }); terrain.endStroke();
    let bushes = plain(map.reactor3d.foliage.bushes);
    assert.deepEqual(bushes.map(b => [b.colour, b.bloom]), [['#aa5500', '#ffffff'], ['#224422', undefined]].map(r => r.filter(v => v !== undefined)).map(r => [r[0], r[1]]));
    terrain.bushColour = ''; terrain.bushBloom = '';
    terrain.beginStroke({ x: 20, y: 10 }); terrain.endStroke();
    bushes = plain(map.reactor3d.foliage.bushes);
    assert.equal(bushes[1].colour, undefined, 'back to the natural leaves');
});

test('quick colors change the kind in hand only, keep its shape, and leave what is planted; Whole map recolors everything', () => {
    const map = mapOf(30, 20); const { terrain, TM } = terrainOn(map);
    terrain.setMode('crystals'); terrain.radius = 2; terrain.strength = 1;
    terrain.foliageLook.crystals = { colour: '#010101', height: 4 };
    paintAt(terrain, 6, 6);
    terrain.takePaletteLook('crimson', 'crystals');
    assert.equal(terrain.foliageLook.crystals.colour, TM.FOLIAGE_PALETTES.crimson.crystals[0]);
    assert.equal(terrain.foliageLook.crystals.height, 4, 'its height kept');
    assert.equal(terrain.foliageLook.grass, undefined, 'other kinds untouched');
    assert.equal(layers(map)[0].colour, '#010101', 'the planted crystals untouched');
    terrain.applyFoliagePalette('snow');
    assert.equal(layers(map)[0].colour, TM.FOLIAGE_PALETTES.snow.crystals[0], 'the whole-map palette recolors what is planted');
});

test('shape and mixed crystal colors are kept with the layer and grown by the runtime', () => {
    const map = mapOf(20, 20); const { terrain, F } = terrainOn(map);
    terrain.setMode('crystals'); terrain.radius = 3; terrain.strength = 1; terrain.foliageLevel = 9;
    terrain.foliageLook.crystals = { height: 9, width: 3, lean: 0, vary: 0, colours: ['#ff0000', '#00ff00'] };
    paintAt(terrain, 10, 10);
    const stored = layers(map)[0];
    assert.deepEqual([stored.height, stored.width, stored.lean, stored.vary, stored.colours], [9, 3, 0, 0, ['#ff0000', '#00ff00']]);
    const layer = R.normalizeFoliageLayer(stored, map);
    assert.deepEqual(plain([layer.height, layer.width, layer.lean, layer.colours]), [9, 3, 0, ['#ff0000', '#00ff00']]);
    const clumps = R.foliageClumps(map, layer, 0, 0, 20, 20);
    assert.ok(clumps.count > 0);
    for (let i = 0; i < clumps.count; i++) {
        assert.ok(clumps.shape[i * 4] >= 9 - 1e-6, 'as tall as asked');
        assert.ok(clumps.shape[i * 4 + 1] >= 0.2 * 3 * 0.75 - 1e-6, 'three times as thick');
        assert.equal(clumps.shape[i * 4 + 2], 0, 'standing straight');
        const tint = Array.from(clumps.tint.slice(i * 4, i * 4 + 3)).map(v => Math.round(v));
        assert.ok(['1,0,0', '0,1,0'].includes(tint.join(',')), 'each shard one of the colors');
    }
    // A crystal with no list keeps one color, and the material says which.
    const one = R.normalizeFoliageLayer({ kind: 'crystals', density: '9' }, map);
    assert.equal(one.colours, undefined);
    assert.equal(R.foliageMaterial(one).userData.rrFoliage.rrFolMix.value, 0);
    assert.equal(R.foliageMaterial(layer).userData.rrFoliage.rrFolMix.value, 1);
    // Grass takes no list: its colors stay its own.
    assert.equal(R.normalizeFoliageLayer({ kind: 'grass', density: '9', colours: ['#ff0000'] }, map).colours, undefined);
    assert.ok(F.MIXED_KINDS.includes('crystals'));
});

test('an undone clear grows back with its thickness, lean and glow', () => {
    const map = mapOf(20, 20); const { F } = terrainOn(map);
    F.paint(map, 'fern', 5.5, 5.5, { radius: 2, strength: 1, level: 7, settings: { width: 2.5, lean: 0.2, glow: 0.4 } });
    // Every cell cleared (as under a building laid over it), the layer goes; an undo makes it again from the record.
    const cells = new Set(); for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) cells.add(y * 65536 + x);
    const record = F.clearCells(map, cells);
    assert.equal(map.reactor3d.foliage, undefined);
    F.uncover(map, record);
    const back = plain(map.reactor3d.foliage.layers[0]);
    assert.deepEqual([back.width, back.lean, back.glow], [2.5, 0.2, 0.4]);
});
