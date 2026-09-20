// Water: rectangles of cells under a sheet at one height. The runtime draws
// a moving translucent plane, blocks water deeper than a wade, and the
// terrain tab paints a sheet with a rectangle drag.
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');
function loadThree() { global.self = global; global.window = global; require(path.resolve(__dirname, '..', '..', 'runtime/libs/three.js')); return global.THREE; }
function loadElevation() { const context = {}; context.window = context; vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context); return context.RRMapElevation; }

test('a sheet is a rectangle at a level; deep water blocks, shallows wade, dry land is dry', () => {
    loadThree();
    const R = require(path.resolve(__dirname, '..', '..', 'runtime/reactor_3d.js'));
    const map = { width: 12, height: 12, reactor3d: { version: 1, elevation: new Array(144).fill(0), terrain: new Array(13 * 13).fill(0), terrainWidth: 12,
        water: [{ x0: 2, y0: 2, x1: 7, y1: 7, level: 0.4, material: 'Water' }, { x1: 9, y1: 9, x0: 11, y0: 11, level: 2 }, { x0: 'a' }] } };
    // A lake bed: the ground under the middle of the sheet dips to -1.5, the rim stays at 0.
    const grid = map.reactor3d.terrain, stride = 13;
    for (let y = 4; y <= 5; y++) for (let x = 4; x <= 5; x++) grid[y * stride + x] = -1.5;
    assert.equal(R.waterOf(map).length, 2, 'a malformed sheet is dropped');
    assert.deepEqual({ ...R.waterOf(map)[1] }, { x0: 9, y0: 9, x1: 11, y1: 11, level: 2, material: '' }, 'corners are put in order');
    assert.equal(R.waterLevelAt(map, 4, 4), 0.4); assert.equal(R.waterLevelAt(map, 0, 0), null);
    assert.ok(Math.abs(R.waterDepthAt(map, 4.5, 4.5) - 1.9) < 1e-9, 'deep in the middle');
    assert.ok(Math.abs(R.waterDepthAt(map, 2.5, 2.5) - 0.4) < 1e-9 && 0.4 <= R.WATER_WADE, 'a wade at the rim');
    assert.equal(R.waterDepthAt(map, 0.5, 0.5), 0, 'dry');
    assert.equal(R.terrainBlocks(map, 1, 2, 2, 2, 0), false, 'onto the rim: wading');
    assert.equal(R.terrainBlocks(map, 3, 4, 4, 4, 0), true, 'into the deep: blocked');
    assert.equal(R.terrainBlocks(map, 8, 8, 9, 9, 0), true, 'a sheet two tiles over flat ground is deep');
    assert.equal(R.hasWater({ width: 4, height: 4, reactor3d: {} }), false);
    assert.equal(R.terrainBlocks({ width: 4, height: 4, reactor3d: {} }, 0, 0, 1, 0, 0), false);
    // Drawn as a translucent plane at the level, drifting each frame; laid again alone after an edit.
    const scene = Object.create(R.MapScene.prototype);
    scene._scene = new global.THREE.Scene(); scene._meshes = []; scene._materials = []; scene._textures = [];
    scene.addWater(map, name => (name === 'Water' ? { image: { width: 4, height: 4 }, width: 4, height: 4 } : null));
    assert.equal(scene._waterMeshes.length, 2);
    const lake = scene._waterMeshes[0];
    assert.ok(lake.material.transparent && lake.material.depthWrite === false && lake.material.__reactorWater);
    assert.equal(lake.geometry.attributes.rrDepth.count, lake.geometry.attributes.position.count, 'every vertex knows its depth');
    assert.ok(lake.geometry.attributes.rrDepth.array.some(d => d > 1.5) && lake.geometry.attributes.rrDepth.array.some(d => d < 0.5), 'deep in the middle, shallow at the rim');
    const runtime = source3D();
    assert.match(runtime, /transformed\.y \+= rrLift \* rrCalm;/, 'waves lift the vertices');
    assert.match(runtime, /smoothstep\(0\.0, 0\.35, vRRDepth\)/, 'and the sheet fades out on the shore');
    assert.match(runtime, /rrWaveTime\.value = frame \/ 60;/);
    assert.ok(lake.material.map && lake.material.map.repeat.x === 6, 'the image repeats once per tile');
    lake.geometry.computeBoundingBox();
    assert.ok(Math.abs(lake.geometry.boundingBox.min.y - 0.4) < 1e-5 && Math.abs(lake.geometry.boundingBox.min.x - 2) < 1e-5 && Math.abs(lake.geometry.boundingBox.max.x - 8) < 1e-5, "a Float32 sheet at the level, spanning its cells");
    scene.updateWater(100);
    assert.ok(lake.material.map.offset.x > 0, 'the sheet drifts');
    map.reactor3d.water = map.reactor3d.water.slice(0, 1);
    assert.equal(scene.updateWaterSheets(map, () => null).length, 1);
    assert.equal(scene._scene.getObjectByName('pieces').children.length, 1, 'the old sheets left the scene');
    assert.match(read('runtime/reactor_sprites.js'), /state\.scene\.updateWater\(Graphics\.frameCount\)/);
    assert.match(source3D(), /this\.addWater\(mapData, settings\.loadMaterial/);
    // A masked sheet: water only where the mask says, in the walk and in the mesh.
    const masked = { width: 6, height: 6, reactor3d: { version: 1, elevation: new Array(36).fill(0), terrain: new Array(49).fill(0), terrainWidth: 6,
        water: [{ x0: 1, y0: 1, x1: 3, y1: 3, level: 1, material: 'Water', mask: '111' + '101' + '111' }] } };
    assert.equal(R.waterOf(masked)[0].mask, '111101111');
    assert.equal(R.waterLevelAt(masked, 1, 1), 1); assert.equal(R.waterLevelAt(masked, 2, 2), null, 'the dry cell in the middle');
    assert.equal(R.terrainBlocks(masked, 2, 2, 1, 2, 0), true, 'into the water: blocked'); assert.equal(R.terrainBlocks(masked, 1, 2, 2, 2, 0), false, 'onto the dry cell: fine');
    const geometry = R.waterGeometry(R.waterOf(masked)[0], masked);
    assert.equal(geometry.index.count, 8 * 6, 'a quad per wet cell'); assert.equal(geometry.attributes.position.count, 16, 'corners shared');
    assert.equal(geometry.attributes.rrDepth.count, 16);
    assert.equal(R.normalizeWater({ x0: 1, y0: 1, x1: 3, y1: 3, level: 1, mask: '111111111' }).mask, undefined, 'a full mask is no mask');
    assert.equal(R.normalizeWater({ x0: 1, y0: 1, x1: 3, y1: 3, level: 1, mask: '1111' }).mask, undefined, 'a mask of the wrong length is ignored');
});

test('the terrain tab pours into a hollow, previews it under the pointer, removes the sheet under a click, and undoes both', () => {
    const E = loadElevation();
    const map = { id: 2, width: 20, height: 20, reactor3d: { version: 1, elevation: new Array(400).fill(0) } };
    E.ensureTerrain(map);
    const grid = E.terrain(map);
    for (let y = 0; y <= 20; y++) for (let x = 0; x <= 20; x++) grid[y * 21 + x] = Math.hypot(x - 5, y - 6) < 2.5 ? -2 : 0;
    assert.equal(E.addWater(map, { x0: 5, y0: 5, x1: 2, y1: 9, level: 0.37, material: 'Water' }), true);
    assert.deepEqual({ ...E.water(map)[0] }, { x0: 2, y0: 5, x1: 5, y1: 9, level: 0.37, material: 'Water' });
    assert.equal(E.removeWaterAt(map, 10, 10), false); assert.equal(E.removeWaterAt(map, 3, 6), true); assert.equal(E.hasWater(map), false);
    assert.equal(map.reactor3d.water, undefined, 'no sheets: no key');
    assert.ok(E.pieceMaterials({ width: 4, height: 4, reactor3d: { water: [{ x0: 0, y0: 0, x1: 1, y1: 1, level: 0, material: 'Water' }] } }).includes('Water'), 'the water image is loaded with the piece materials');
    const events = [];
    const context = { console, Math, Number, Object, Array, String, CustomEvent: class { constructor(t, i) { this.type = t; this.detail = i && i.detail; } },
        document: { dispatchEvent: e => events.push(e), addEventListener() {}, removeEventListener() {}, querySelector: () => null, getElementById: () => null } };
    context.window = context; context.reactor = { mapEditor3D: { showWaterGhost() { context.ghost = [...arguments]; }, hideWaterGhost() { context.ghost = null; } } };
    context.RRMapElevation = E;
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const manager = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    manager.setMode('water');
    assert.notEqual(manager.mode, 'water', 'sheets are no longer painted by hand');
    manager.setMode('fill');
    manager.hoverAt({ x: 5, y: 6 });
    assert.ok(context.ghost && context.ghost[0].level === 0 && context.ghost[0].mask, 'the pointer over a hollow shows what a click would fill');
    manager.hoverAt({ x: 0, y: 0 });
    assert.equal(context.ghost, null, 'open ground shows nothing');
    assert.equal(manager.beginStroke({ x: 0, y: 0 }), false, 'nothing to fill on open ground');
    assert.equal(manager.beginStroke({ x: 5, y: 6 }), true);
    const pond = E.water(map)[0];
    assert.ok(pond && pond.level === 0 && pond.material === 'Water' && pond.mask, 'poured to the rim');
    assert.equal(events[events.length - 1].detail.water, true, 'the 3D view lays the sheets again, nothing else');
    assert.equal(manager.beginStroke({ x: 5, y: 6 }), false, 'already full');
    assert.equal(E.water(map).length, 1);
    manager.setMode('drain');
    assert.equal(manager.beginStroke({ x: pond.x0, y: pond.y0 }), false, 'the dry corner of the box removes nothing');
    assert.equal(manager.drainRegion({ ...pond }), true, 'the sheet drawn under the pointer goes');
    assert.equal(E.hasWater(map), false);
    assert.equal(manager.beginStroke({ x: 5, y: 6 }), false);
    manager.undo(); assert.equal(E.water(map).length, 1);
    assert.equal(manager.beginStroke({ x: 5, y: 6 }), true, 'a click on the water removes it');
    assert.equal(E.hasWater(map), false);
    manager.undo(); assert.equal(E.water(map).length, 1, 'undo brings the sheet back');
    manager.undo(); assert.equal(E.hasWater(map), false, 'and the one before takes it away again');
    manager.redo(); assert.equal(E.water(map).length, 1);
    const view = read('editor/src/MapEditor3D.js');
    assert.match(view, /if \(event\?\.detail\?\.water && this\.updateWaterInPlace\(\)\) return;/);
    assert.match(view, /this\.mapScene\.updateWater\?\.\(now \/ \(1000 \/ 60\)\);/, 'the editor drifts the water too');
    const i18n = read('editor/src/I18nManager.js');
    assert.match(view, /const sheet = this\.terrainManager\(\)\.mode === 'drain' \? this\.waterMeshAt\(event\.clientX, event\.clientY\) : null;/, 'Remove picks the sheet drawn under the pointer');
    assert.match(view, /manager\.hoverAt\?\.\(point\);/, 'the pointer previews the hollow');
    for (const key of ['terrain.water', 'terrain.waterPour', 'terrain.waterErase', 'terrain.waterFull', 'terrain.waterHint', 'terrain.waterCount']) {
        assert.equal((i18n.match(new RegExp('"' + key.replace(/\./g, '\\.') + '": "', 'g')) || []).length, 18, key + ' in 18 locales');
    }
    assert.ok(fs.existsSync(path.resolve(__dirname, '..', '..', 'template/Demo/img/materials/Water.png')));
});
