// Ground types: more than one ground painted over a 3D map's floor (runtime reactor_3d_world.js
// "Ground types", editor RRMapGround and the Build bar's Ground brush, paint-ground.cjs,
// validate-map.cjs), the Dunes brush, Rock in the Terrain group, foliage palettes and biomes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
global.self = global; global.window = global;
require(path.join(repoRoot, 'runtime/libs/three.js'));
const R = require(path.join(repoRoot, 'runtime/reactor_3d.js'));

function editorContext(extra = {}) {
    const events = [];
    const context = Object.assign({ console, JSON, Math, Object, Array, Number, String, Set, Map, Date, Uint8Array, Float32Array, Reactor3D: R, setTimeout, clearTimeout,
        document: { addEventListener() {}, removeEventListener() {}, dispatchEvent(event) { events.push(event); } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } } }, extra);
    context.window = context;
    context.events = events;
    for (const file of ['MapElevation.js', 'MapFoliage.js', 'MapGround.js']) vm.runInNewContext(read('editor/src/utils/' + file), context);
    return context;
}
const flatMap = (W = 40, H = 30, extra = {}) => ({ id: 3, width: W, height: H, data: [], reactor3d: Object.assign({ version: 1, mode: '3d', room: { floor: '!Grass-01' } }, extra) });
const plain = value => JSON.parse(JSON.stringify(value));

test('ground paint reads and writes as runs, and a map without ground has none', () => {
    const levels = Uint8Array.from([0, 0, 0, 5, 5, 7, 0, 9, 0, 0]);
    assert.equal(R.encodeGroundPaint(levels), '0x3 5x2 7 0 9');
    assert.deepEqual(Array.from(R.decodeGroundPaint('0x3 5x2 7 0 9', 10)), Array.from(levels));
    assert.deepEqual(Array.from(R.decodeGroundPaint('3x2 banana 4x99', 5)), [3, 3, 4, 4, 4]);
    const map = flatMap(4, 3);
    assert.equal(R.groundOf(map), null);
    assert.equal(R.hasGround(map), false);
    assert.equal(R.groundBareAt(map, 1, 1), false);
    assert.deepEqual(R.groundAt(map, 1, 1), { type: -1, name: '', material: '!Grass-01', tint: '', scale: 0, bare: false, level: 0 });
});

test('the runtime normalizes the types: a material each, a tint, a scale in range, no more than sixty-four, companions refused', () => {
    const map = flatMap(4, 3, { ground: { types: [
        { name: 'Beach', material: 'Sand', tint: '#E8D9A8', bare: true, scale: 99, paint: '0x4 9x2 5' },
        { material: 'Rock_normal', paint: '9' }, { paint: '9' }, null,
        { material: 'Mud', scale: 2, tint: 'red', paint: '0x5 9' }
    ] } });
    const ground = R.groundOf(map);
    assert.deepEqual(ground.types.map(t => [t.name, t.material, t.tint, t.scale, t.bare]), [['Beach', 'Sand', '#e8d9a8', 32, true], ['Mud', 'Mud', '', 2, false]]);
    assert.equal(R.groundOf(map), ground, 'normalized once per sidecar object');
    assert.deepEqual(R.groundMaterialNames(map), ['Sand', 'Mud']);
    // A later type lies over an earlier one; a level under 5 does not make the cell that ground.
    assert.equal(R.groundAt(map, 0, 1).name, 'Beach');
    assert.equal(R.groundAt(map, 1, 1).name, 'Mud');
    assert.equal(R.groundAt(map, 2, 1).level, 5);
    assert.equal(R.groundAt(map, 3, 2).type, -1);
    assert.equal(R.groundAt(map, -4, 1).name, 'Beach', 'off the map answers for the nearest cell');
    assert.equal(R.groundBareAt(map, 0, 1), true);
    assert.equal(R.groundBareAt(map, 1, 1), false);
    assert.equal(R.GROUND_TYPES_MAX, 64);
    const many = flatMap(2, 2, { ground: { types: Array.from({ length: 70 }, (_, i) => ({ material: 'M' + i, paint: '9' })) } });
    assert.equal(R.groundOf(many).types.length, R.GROUND_TYPES_MAX);
});

test('nothing grows on a bare ground', () => {
    const map = flatMap(6, 4, { ground: { types: [{ material: 'Sand', bare: true, paint: '9x6' }, { material: 'Dirt', paint: '0x6 9x6' }] } });
    assert.equal(R.foliageCellOpen(map, 2, 0, 'grass'), -1, 'sand');
    assert.equal(R.foliageCellOpen(map, 2, 1, 'grass'), 0, 'dirt grows');
    assert.equal(R.foliageCellOpen(map, 2, 3, 'grass'), 0, 'the floor grows');
});

test('the floor shader takes the ground types only when a map has them', () => {
    const none = R.GROUND_SLOPE_MAP_GLSL;
    assert.ok(none.includes('//RR_GROUND_TYPES'), 'the place they go');
    const g = { count: 5, groups: 2, detail: {} };
    const header = R.groundTypesHeaderGLSL(g), body = R.groundTypesBodyGLSL(g);
    assert.match(header, /#define RR_GROUND_COUNT 5/);
    assert.match(header, /#define RR_GROUND_GROUPS 2/);
    assert.match(header, /uniform sampler2DArray rrGroundArray;/);
    // The paint is one array texture (four types a layer) and each type's look a column of one float texture,
    // so a floor's samplers and uniforms stay the same however many types there are.
    assert.match(header, /uniform sampler2DArray rrGroundSplat;/);
    assert.match(header, /uniform highp sampler2D rrGroundInfo;/);
    assert.doesNotMatch(header, /rrGroundSplatB|rrGroundType\[|rrGroundOn\[|rrGroundDetailParams\[/);
    assert.match(header, /#define RR_GROUND_DETAIL/);
    assert.match(body, /float rrW = rrWs\[i >> 2\]\[i & 3\];/);
    assert.match(body, /texelFetch\(rrGroundInfo, ivec2\(i, 1\), 0\)/);
    assert.match(body, /textureGrad\(rrGroundArray, vec3\(rrTP\.xz, rrTL\)/, 'the layer is the material\'s, which types of one material share');
    assert.match(body, /rrDetailShade/);
    // The edge noise is worked out only where a type is part-way (its term is rrW * (1 - rrW)): solid paint skips it.
    assert.match(body, /vec4 rrWEk = rrWk \* \(1\.0 - rrWk\);/);
    assert.match(body, /if \(rrWE > 0\.0\) rrWn = rrGroundNoise/);
    // A painted ground is shaded by its slope against the key light, level ground left as it was; the light comes in under the shader's own name.
    assert.match(header, /uniform vec4 rrGroundKey;/);
    assert.doesNotMatch(header, /uniform vec4 rrKeyLight;/, 'the lit material declares that one');
    assert.match(body, /float rrGShade = clamp\(\(0\.35 \+ 0\.65 \* max\(dot\(rrGN, rrGL\), 0\.0\)\) \/ \(0\.35 \+ 0\.65 \* max\(rrGL\.y, 0\.05\)\), 0\.5, 1\.25\);/);
    const shader = { uniforms: {} };
    R.groundTypesUniforms(shader, { splat: 1, array: 2, info: 4, size: 3, detail: null });
    assert.equal(shader.uniforms.rrGroundKey.value, R.lightUniforms().rrKeyLight.value, 'the same numbers the lit materials read');
    assert.equal(shader.uniforms.rrGroundInfo.value, 4);
    const few = { count: 2, groups: 1, detail: null };
    assert.doesNotMatch(R.groundTypesHeaderGLSL(few), /RR_GROUND_DETAIL/);
    assert.doesNotMatch(R.groundTypesBodyGLSL(few), /rrDetailShade/);
    // One program per shape of ground: the count and whether any type has maps.
    const source = read('runtime/reactor_3d.js');
    assert.match(source, /"\|ground" \+ types\.count \+ \(types\.detail \? "d" : ""\)/);
    assert.match(source, /this\._groundMap = Reactor3D\.hasGround && Reactor3D\.hasGround\(mapData\) \? mapData : null;/);
    assert.match(source, /\(this\._terrainMap \|\| this\._groundMap\) && Reactor3D\.GROUND_SLOPE/, 'a flat map with ground types wears them too');
});

test('the editor keeps a type small, paints it softly, and thins the types lying over it', () => {
    const context = editorContext(), G = context.RRMapGround, map = flatMap(20, 12);
    assert.equal(G.addType(map, { name: 'Sand', material: 'Sand', tint: '#ffffff', scale: 4, bare: true }), 0);
    assert.equal(G.addType(map, { name: 'Wet', material: 'Mud', tint: '#5D4A3A' }), 1);
    assert.equal(G.addType(map, {}), -1, 'no material, no type');
    assert.deepEqual(plain(map.reactor3d.ground.types), [{ material: 'Sand', scale: 4, bare: true, paint: '' }, { name: 'Wet', material: 'Mud', tint: '#5d4a3a', paint: '' }]);
    const first = map.reactor3d.ground;
    const touched = G.paint(map, 1, 10.5, 6.5, { radius: 3, strength: 1, level: 9, soft: 0.5 });
    assert.deepEqual(plain(touched), { x0: 8, y0: 4, x1: 12, y1: 8 });
    assert.notEqual(map.reactor3d.ground, first, 'a new object each change, so the runtime reads it again');
    const wet = G.levelsOf(map, 1);
    assert.equal(wet[6 * 20 + 10], 9, 'whole at the middle');
    assert.ok(wet[6 * 20 + 12] > 0 && wet[6 * 20 + 12] < 9, 'thinner toward the edge');
    assert.equal(wet[6 * 20 + 15], 0);
    // Painting the type under it takes the upper one off there.
    G.paint(map, 0, 10.5, 6.5, { radius: 1.2, strength: 1, level: 9, soft: 0 });
    assert.equal(G.levelsOf(map, 0)[6 * 20 + 10], 9);
    assert.equal(G.levelsOf(map, 1)[6 * 20 + 10], 0);
    assert.equal(G.typeAt(map, 10, 6), 0);
    assert.equal(R.groundAt(map, 10, 6).name, 'Sand', 'the runtime agrees');
    // Erase goes back to the map's own ground.
    G.paint(map, 0, 10.5, 6.5, { radius: 5, strength: 1, erase: true, soft: 0 });
    assert.equal(G.typeAt(map, 10, 6), -1);
    assert.equal(G.hasPaint(map), false);
    assert.equal(G.types(map).length, 2, 'the types stay to paint with');
    // Fill, update, remove.
    assert.equal(G.fill(map, 0, (x, y) => y < 2, 9), 40);
    assert.ok(G.updateType(map, 0, { tint: '#C9703F', name: 'Mars' }));
    assert.deepEqual([G.types(map)[0].name, G.types(map)[0].tint, G.levelsOf(map, 0)[5]], ['Mars', '#c9703f', 9], 'the paint stays through an edit');
    assert.ok(G.removeType(map, 1));
    assert.ok(G.removeType(map, 0));
    assert.equal(map.reactor3d.ground, undefined, 'none left, none stored');
});

test('ground paint moves with the cells when the map changes size, and the sidecar writes a type a line', () => {
    const context = editorContext(), G = context.RRMapGround, E = context.RRMapElevation, map = flatMap(10, 8);
    G.addType(map, { material: 'Sand' });
    G.fill(map, 0, (x, y) => x === 2 && y === 3, 9);
    map.width = 14; map.height = 10;
    G.resize(map, 10, 8, 2, 1);
    assert.equal(G.levelsOf(map, 0)[4 * 14 + 4], 9);
    assert.equal(G.levelsOf(map, 0).reduce((n, v) => n + (v ? 1 : 0), 0), 1);
    const text = E.stringifySidecar(map.reactor3d);
    assert.match(text, /"ground": \{\n    "types": \[\n      \{"material":"Sand","paint":"[0-9x ]+"\}\n    \]\n  \}/);
    assert.deepEqual(JSON.parse(text).ground, plain(map.reactor3d.ground));
});

test('a ground stroke is one undo step; adding, editing and removing a type are steps too', () => {
    const context = editorContext();
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const map = flatMap(30, 20);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    terrain.setMode('ground');
    assert.equal(terrain.mode, 'ground');
    assert.equal(terrain.beginStroke({ x: 5, y: 5 }), false, 'nothing to paint with yet');
    assert.equal(terrain.addGroundType({ name: 'Sand', material: 'Sand', bare: true }), 0, 'the first type is index 0 and is a step');
    assert.equal(terrain.undoStack.length, 1);
    assert.ok(context.events.some(e => e.detail && e.detail.ground && e.detail.types), 'new types build the view again');
    terrain.radius = 2; terrain.strength = 1;
    context.events.length = 0;
    terrain.beginStroke({ x: 5, y: 5 });
    terrain.paintAt({ x: 9, y: 5 });
    terrain.paintAt({ x: 13, y: 5 });
    terrain.endStroke();
    assert.equal(terrain.undoStack.length, 2, 'one step for the whole drag');
    assert.ok(context.events.some(e => e.detail && e.detail.ground && !e.detail.types && e.detail.region), 'paint is written in place, where it says');
    const painted = JSON.stringify(map.reactor3d.ground);
    assert.equal(R.groundAt(map, 9, 5).name, 'Sand');
    terrain.undo();
    assert.equal(context.RRMapGround.hasPaint(map), false);
    terrain.redo();
    assert.equal(JSON.stringify(map.reactor3d.ground), painted);
    // A tint dragged live is one step when it lets go.
    terrain.editGroundType({ tint: '#aa0000' }, 'live');
    terrain.editGroundType({ tint: '#cc2200' }, 'live');
    assert.equal(terrain.undoStack.length, 2);
    terrain.editGroundType({}, 'commit');
    assert.equal(terrain.undoStack.length, 3);
    assert.equal(map.reactor3d.ground.types[0].tint, '#cc2200');
    terrain.undo();
    assert.equal(map.reactor3d.ground.types[0].tint, undefined);
    // Fill and remove.
    terrain.fillGround();
    assert.equal(context.RRMapGround.levelsOf(map, 0).every(v => v === 9), true);
    terrain.removeGroundType();
    assert.equal(map.reactor3d.ground, undefined);
    terrain.undo(); terrain.undo();
    assert.equal(JSON.stringify(map.reactor3d.ground), painted);
    // Sixty-four is the most, as the runtime draws.
    for (let i = 1; i < 64; i++) assert.equal(terrain.addGroundType({ material: 'M' + i }), i);
    assert.equal(terrain.addGroundType({ material: 'M64' }), -1);
});

test('dunes: gentle on the windward side, steeper on the lee, and walkable unless told otherwise', () => {
    const E = editorContext().RRMapElevation;
    for (const options of [{ dir: 30, size: 10, height: 9, seed: 3 }, { dir: 110, size: 6, height: 9, seed: 9 }, { dir: 0, size: 20, height: 9, seed: 2 }]) {
        let steepest = 0, tallest = 0;
        for (let y = 0; y < 90; y++) for (let x = 0; x < 90; x++) {
            const h = E.duneHeightAt(x, y, options);
            assert.ok(h >= 0);
            tallest = Math.max(tallest, h);
            steepest = Math.max(steepest, Math.abs(E.duneHeightAt(x + 1, y, options) - h), Math.abs(E.duneHeightAt(x, y + 1, options) - h));
        }
        assert.ok(steepest < 0.75, `walkable: ${steepest}`);
        assert.ok(tallest <= E.duneSettings(options).height + 1e-9 && tallest > E.duneSettings(options).height * 0.8);
    }
    assert.equal(E.duneSettings({ size: 10, height: 9 }).height, E.DUNE_WALK_SLOPE * E.DUNE_LEE * 10);
    assert.equal(E.duneSettings({ size: 10, height: 9, walkable: false }).height, 9);
    // Across the wind (dir 0: along x) a ridge rises over most of its length and falls over the rest.
    const along = Array.from({ length: 200 }, (_, i) => E.duneHeightAt(i / 10, 0.5, { dir: 0, size: 10, height: 1.6, seed: 1 }));
    let rising = 0, falling = 0;
    for (let i = 1; i < along.length; i++) { if (along[i] > along[i - 1] + 1e-9) rising++; else if (along[i] < along[i - 1] - 1e-9) falling++; }
    assert.ok(rising > falling * 1.8, `rise ${rising}, fall ${falling}`);
    // The brush lays the field on the ground the stroke found, once: a second pass over the same place adds nothing more.
    const context = editorContext();
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const map = flatMap(40, 30);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    terrain.setMode('dunes');
    terrain.radius = 8; terrain.strength = 1;
    terrain.beginStroke({ x: 20, y: 15 }); terrain.paintAt({ x: 24, y: 15 }); terrain.endStroke();
    const once = plain(map.reactor3d.terrain);
    assert.ok(once.some(v => v > 0.5), 'ridges rose');
    assert.ok(once.every(v => v >= 0 && v <= context.RRMapElevation.duneSettings(terrain.dunes).height + 1e-6));
    assert.equal(terrain.undoStack.length, 1);
    terrain.undo();
    assert.ok(!context.RRMapElevation.hasTerrain(map), 'undone to flat');
});

test('Rock is in the Terrain group, laid by the builder as before', () => {
    const BuildHotbar = require(path.join(repoRoot, 'editor/src/BuildHotbar.js'));
    assert.ok(BuildHotbar.TERRAIN.includes('rock') && !BuildHotbar.SLOTS.includes('rock'), 'out of Build, into Terrain');
    assert.deepEqual(BuildHotbar.TERRAIN.slice(0, 9), ['raise', 'lower', 'smooth', 'flatten', 'dunes', 'ground', 'terase', 'path', 'rock']);
    assert.equal(BuildHotbar.TERRAIN_MODE.rock, undefined, 'not a TerrainManager mode');
    const picked = [];
    const manager = { mode: 'select', kind: 'wall', activate() { picked.push('activate'); }, setKind(kind) { this.kind = kind; this.mode = 'place'; }, setMode(mode) { this.mode = mode; }, materials: () => [{ name: 'Rock', url: '' }] };
    const terrain = { mode: 'raise', active: true, activate() {}, setMode(mode) { this.mode = mode; } };
    const bar = Object.create(BuildHotbar.prototype);
    bar.manager = () => manager; bar.terrain = () => terrain; bar.render = () => {}; bar.flash = () => {};
    global.window.reactor = { mapTool: 'terrain' };
    try {
        assert.equal(bar.group(), 'terrain');
        bar.pick('rock');
        assert.deepEqual(picked, ['activate'], 'the builder takes the map from the terrain tool');
        global.window.reactor.mapTool = 'build';
        assert.deepEqual([manager.kind, manager.mode, manager.material], ['rock', 'place', 'Rock'], 'the first rock wears the Rock material');
        assert.equal(bar.rockInHand(), true);
        assert.equal(bar.group(), 'terrain', 'the bar stays on Terrain');
        assert.equal(bar.activeSlot(), 'rock');
        assert.deepEqual(bar.slots(), BuildHotbar.TERRAIN);
        assert.equal(bar._lastTerrain, 'rock', 'coming back to Terrain comes back to Rock');
        // Another build slot, or Select, is the Build group again.
        manager.setMode('select');
        assert.equal(bar.group(), 'build');
        assert.equal(bar.activeSlot(), 'select');
        manager.setKind('rock'); manager.setMode('erase');
        assert.equal(bar.group(), 'build');
    } finally { delete global.window.reactor; }
    // The rock's panel, sizes, cap, tint and brush are the builder's own, untouched; its Advanced fold keeps its key.
    const source = read('editor/src/BuildHotbar.js');
    assert.match(source, /if \(this\.group\(\) === 'terrain' && !this\.rockInHand\(\)\) \{ this\._modelsBody = null; this\.renderTerrainPanel\(\); return; \}/);
    assert.match(source, /rr-build-rockpreset/);
    assert.match(source, /rr-build-rockcap-tile/);
});

test('foliage palettes recolor what is planted and what is in hand, as one step', () => {
    const context = editorContext();
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const map = flatMap(30, 20);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    const palettes = plain(context.TerrainManager.FOLIAGE_PALETTES);
    for (const key of Object.keys(palettes)) {
        for (const kind of ['grass', 'flowers', 'fern', 'reeds', 'bush']) assert.equal(palettes[key][kind].length, 2, `${key} ${kind}`);
        assert.ok(palettes[key].petals.length >= 2 && palettes[key].petals.every(c => /^#[0-9a-f]{6}$/.test(c)));
    }
    terrain.setMode('grass'); terrain.radius = 2; terrain.strength = 1;
    terrain.beginStroke({ x: 5, y: 5 }); terrain.endStroke();
    terrain.setMode('flowers');
    terrain.beginStroke({ x: 12, y: 5 }); terrain.endStroke();
    const steps = terrain.undoStack.length;
    assert.ok(terrain.applyFoliagePalette('violet'));
    assert.equal(terrain.undoStack.length, steps + 1);
    const layers = plain(map.reactor3d.foliage.layers);
    assert.deepEqual([layers[0].colour, layers[0].tip], palettes.violet.grass);
    assert.deepEqual(layers.find(l => l.kind === 'flowers').colours, palettes.violet.petals);
    assert.deepEqual(plain(terrain.foliageLook.grass), { colour: palettes.violet.grass[0], tip: palettes.violet.grass[1] });
    assert.equal(terrain.bushBloom, palettes.violet.bush[1]);
    terrain.undo();
    assert.equal(map.reactor3d.foliage.layers[0].colour, undefined, 'back to the kind\'s own green');
});

test('a rectangle drag fills its cells as one step, and follows the pointer until it ends', () => {
    const context = editorContext();
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const map = flatMap(30, 20), G = context.RRMapGround;
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    terrain.setMode('ground');
    terrain.addGroundType({ material: 'Sand' });
    terrain.groundShape = 'rect';
    terrain.beginStroke({ x: 4, y: 3 });
    terrain.paintAt({ x: 20, y: 15 });
    terrain.paintAt({ x: 9, y: 6 });
    terrain.endStroke();
    const levels = G.levelsOf(map, 0);
    assert.equal(levels.reduce((n, v) => n + (v ? 1 : 0), 0), 6 * 4, 'the rectangle it ended on, not the widest it reached');
    assert.equal(levels[3 * 30 + 4], 9);
    assert.equal(levels[6 * 30 + 9], 9);
    assert.equal(levels[15 * 30 + 20], 0);
    assert.equal(terrain.undoStack.length, 2);
    terrain.groundErase = true;
    terrain.beginStroke({ x: 4, y: 3 }); terrain.paintAt({ x: 6, y: 6 }); terrain.endStroke();
    assert.equal(G.levelsOf(map, 0).reduce((n, v) => n + (v ? 1 : 0), 0), 24 - 12);
    terrain.undo();
    assert.equal(G.levelsOf(map, 0).reduce((n, v) => n + (v ? 1 : 0), 0), 24);
    // A map with no floor is told so, and given one as a step.
    const bare = { id: 4, width: 8, height: 8, note: '<3d>', data: [], reactor3d: { version: 1, mode: '3d' } };
    const other = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: bare }) });
    assert.equal(other.hasGroundFloor(), false);
    assert.ok(other.setGroundFloor('!Grass-01'));
    assert.equal(bare.reactor3d.room.floor, '!Grass-01');
    assert.equal(other.hasGroundFloor(), true);
    other.undo();
    assert.equal(other.hasGroundFloor(), false);
    const bar = read('editor/src/BuildHotbar.js');
    assert.match(bar, /rr-build-gnofloor/);
    assert.match(bar, /rr-build-gshape/);
});

test('a rock capped with the ground wears the ground painted under it, and bushes keep off bare ground', () => {
    const map = flatMap(20, 20, { ground: { types: [{ name: 'Sand', material: 'Sand', tint: '#e8866a', bare: true, paint: '9x400' }] } });
    const piece = { id: 1, kind: 'rock', x: 8, y: 8, z: 0, rot: 0, material: 'Rock', size: [4, 4, 4], cap: 'ground' };
    const plainSig = R.rockSignature(R.rockFrame(piece, 0));
    const frame = R.rockGroundCap(map, R.rockFrame(piece, 0));
    assert.equal(frame.piece.cap, 'Sand');
    assert.equal(piece.cap, 'ground', 'the piece itself is not rewritten');
    assert.deepEqual(frame.capTint.map(v => Math.round(v * 255)), [0xe8, 0x86, 0x6a]);
    assert.notEqual(frame.sig, plainSig, 'meshed again when the ground under it changes');
    const buckets = R.rockChunkBuckets([frame], { x0: 0, z0: 0, x1: 16, z1: 16 }, () => 0);
    const cap = buckets.find(b => b.cap);
    assert.equal(cap.name, 'Sand');
    assert.ok(cap.colors[0] > cap.colors[2] * 1.5, 'the top takes the ground\'s tint');
    const side = buckets.find(b => !b.cap);
    assert.equal(side.colors[0], side.colors[2], 'the sides do not');
    // Where nothing is painted, or the cap is a material of its own, it is left as it was.
    const open = flatMap(20, 20, { ground: { types: [{ material: 'Sand', paint: '0' }] } });
    assert.equal(R.rockGroundCap(open, R.rockFrame(piece, 0)).piece.cap, 'ground');
    assert.equal(R.rockGroundCap(map, R.rockFrame(Object.assign({}, piece, { cap: 'Moss' }), 0)).piece.cap, 'Moss');
    assert.match(read('runtime/reactor_3d_world.js'), /if \(Reactor3D\.hasGround\(mapData\)\) for \(const frame of frames\) Reactor3D\.rockGroundCap\(mapData, frame\);/);
    assert.match(read('runtime/reactor_3d_world.js'), /capTint: f\.capTint \|\| null/, 'the background mesher is told too');
    // The bush brush.
    const context = editorContext({ Reactor3D: R });
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    terrain.setMode('bush');
    terrain.beginStroke({ x: 5, y: 5 }); terrain.endStroke();
    assert.equal(map.reactor3d.foliage, undefined, 'none stood on sand');
    assert.equal(terrain.undoStack.length, 0);
});

test('alien plants: bulbs, tendrils and crystals are kinds like the rest, and a glow shows a tip whatever the light', () => {
    assert.deepEqual(R.FOLIAGE_KINDS, ['grass', 'flowers', 'fern', 'reeds', 'bulbs', 'tendrils', 'crystals']);
    const context = editorContext(), F = context.RRMapFoliage;
    assert.deepEqual(plain(F.KINDS), R.FOLIAGE_KINDS, 'the editor paints what the runtime grows');
    for (const kind of ['bulbs', 'tendrils', 'crystals']) {
        const look = R.FOLIAGE_LOOKS[kind];
        assert.ok(look.height > 0 && look.perLevel > 0 && look.glow > 0, kind);
        const template = R.foliageTemplate(kind);
        assert.equal(template.position.length / 3, template.part.length);
        assert.ok(template.index.length % 3 === 0 && Math.max(...template.index) < template.part.length, kind);
        assert.ok(template.index.length / 3 <= 80, `${kind}: ${template.index.length / 3} triangles a clump`);
    }
    assert.ok(Array.from(R.foliageTemplate('bulbs').part).includes(3), 'a bulb has its globe');
    // A layer: glow from the kind unless said, in range; bulbs take a list of colors as flowers do.
    const map = flatMap(12, 8, { foliage: { layers: [
        { kind: 'bulbs', density: '9x96', colours: ['#FF00FF', 'nope'] }, { kind: 'grass', density: '9x96', glow: 0.8 }, { kind: 'crystals', density: '9x96', glow: 7 }, { kind: 'moss', density: '9' }] } });
    const layers = R.foliageOf(map).layers;
    assert.deepEqual(layers.map(l => [l.kind, l.glow]), [['bulbs', 1], ['grass', 0.8], ['crystals', 1]]);
    assert.deepEqual(layers[0].colours, ['#ff00ff']);
    assert.equal(R.foliageOf(flatMap(4, 4, { foliage: { layers: [{ kind: 'grass', density: '9' }] } })).layers[0].glow, 0, 'Earth grass does not glow unless told');
    const clumps = R.foliageClumps(map, layers[0], 0, 0, 12, 8);
    assert.ok(clumps.count > 50 && clumps.count < 400, `bulbs: ${clumps.count}`);
    // Crystals stand on bare ground; nothing else does.
    const bare = flatMap(6, 4, { ground: { types: [{ material: 'Alien-Crystal', bare: true, paint: '9x24' }] } });
    assert.equal(R.foliageCellOpen(bare, 2, 2, 'crystals'), 0);
    assert.equal(R.foliageCellOpen(bare, 2, 2, 'bulbs'), -1);
    // The shader: a glowing layer keeps its own color over the light and is not left to the half-size light.
    const source = read('runtime/reactor_3d_foliage.js');
    assert.match(source, /outgoingLight = mix\(outgoingLight, max\(outgoingLight, rrFolSelf \* " \+ R\.FOLIAGE_GLOW\.toFixed\(2\) \+ "\), vRRGlow\);/);
    assert.match(source, /if \(glow\) material\.__reactorGlowTip = true;/);
    assert.match(source, /"reactor3d-foliage-" \+ layer\.kind \+ \(glow \? "-glow" : ""\)/, 'a program each, so a plain layer pays nothing');
    assert.match(read('runtime/reactor_3d_lighting.js'), /material\.__reactorWater \|\| material\.__reactorGlowTip\) return false;/);
    // The editor: painted like the rest, the glow kept only when it differs, one layer per look.
    const painted = flatMap(20, 12);
    F.paint(painted, 'tendrils', 6.5, 6.5, { radius: 2, strength: 1, level: 7, settings: { glow: 0.6, colour: '#3a2a70' } });
    F.paint(painted, 'bulbs', 6.5, 6.5, { radius: 2, strength: 1, level: 7, settings: { colours: ['#7afff0', '#b8ff5a'] } });
    assert.deepEqual(plain(painted.reactor3d.foliage.layers.map(l => [l.kind, l.glow, l.colours])), [['tendrils', 0.6, undefined], ['bulbs', undefined, ['#7afff0', '#b8ff5a']]].map(r => JSON.parse(JSON.stringify(r))));
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: painted }) });
    assert.deepEqual(plain(context.TerrainManager.FOLIAGE_MODES), ['grass', 'flowers', 'fern', 'reeds', 'bulbs', 'tendrils', 'crystals', 'bush']);
    for (const key of Object.keys(context.TerrainManager.FOLIAGE_PALETTES)) for (const kind of ['bulbs', 'tendrils', 'crystals', 'bulbPetals']) assert.ok(context.TerrainManager.FOLIAGE_PALETTES[key][kind].length >= 2, `${key} ${kind}`);
    // Glowing lights every layer's tips; another palette gives each kind its own glow back.
    terrain.applyFoliagePalette('glow');
    assert.deepEqual(plain(painted.reactor3d.foliage.layers.map(l => l.glow)), [0.85, 0.85]);
    assert.equal(terrain.foliageLook.grass.glow, 0.85);
    terrain.applyFoliagePalette('meadow');
    assert.deepEqual(plain(painted.reactor3d.foliage.layers.map(l => l.glow === undefined)), [true, true]);
    // The alien biomes plant their own, in patches, once.
    const world = flatMap(40, 30);
    const tm = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: world }) });
    assert.ok(tm.applyBiome('alienViolet'));
    const kinds = plain(world.reactor3d.foliage.layers.map(l => l.kind));
    assert.deepEqual(kinds, ['crystals', 'bulbs']);
    const cells = R.decodeFoliageDensity(world.reactor3d.foliage.layers[0].density, 1200).reduce((n, v) => n + (v ? 1 : 0), 0);
    assert.ok(cells > 60 && cells < 700, `patches, not a carpet: ${cells}`);
    const first = JSON.stringify(world.reactor3d.foliage);
    assert.ok(tm.applyBiome('alienViolet'));
    assert.equal(JSON.stringify(world.reactor3d.foliage), first, 'not planted twice');
    tm.undo(); tm.undo();
    assert.equal(world.reactor3d.foliage, undefined);
});

test('a biome lays its ground under what is painted, adds grounds to paint with, tints the cliff, and undoes whole', () => {
    const context = editorContext();
    vm.runInNewContext(read('editor/src/TerrainManager.js'), context);
    const map = flatMap(12, 8, { room: { floor: '!Grass-01' }, terrainWidth: 12, terrain: Array.from({ length: 13 * 9 }, (_, i) => (i % 13) * 0.1) });
    const terrain = new context.TerrainManager({ getTilemapManager: () => ({ currentMap: map }) });
    const G = context.RRMapGround;
    for (const key of Object.keys(context.TerrainManager.BIOMES)) {
        const biome = context.TerrainManager.BIOMES[key];
        for (const name of [biome.base].concat(biome.grounds).filter(Boolean)) assert.ok(context.TerrainManager.GROUND_PRESETS.some(p => p.name === name), `${key}: ${name}`);
        assert.ok(context.TerrainManager.FOLIAGE_PALETTES[biome.palette], key);
    }
    terrain.addGroundType({ name: 'Path', material: 'Dirt' });
    G.fill(map, 0, (x, y) => y === 4, 9);
    const heights = JSON.stringify(map.reactor3d.terrain), before = JSON.stringify(map.reactor3d);
    assert.ok(terrain.applyBiome('desert'));
    const types = G.types(map);
    assert.deepEqual(types.map(t => t.name || t.material), ['Sand', 'Path', 'Red sand', 'Gravel', 'Dirt']);
    assert.equal(G.levelsOf(map, 0).every(v => v === 9), true, 'sand over the whole floor');
    assert.equal(R.groundAt(map, 3, 4).name, 'Path', 'what was painted lies over it');
    assert.equal(R.groundAt(map, 3, 2).name, 'Sand');
    assert.equal(map.reactor3d.room.cliffTint, '#c9a777');
    assert.equal(JSON.stringify(map.reactor3d.terrain), heights, 'heights untouched');
    // Another biome replaces the first one's ground, not the author's.
    assert.ok(terrain.applyBiome('snow'));
    assert.deepEqual(G.types(map).map(t => t.name || t.material).slice(0, 2), ['Snow', 'Path']);
    assert.ok(!G.types(map).some(t => t.name === 'Sand' && t.biome));
    // Temperate has no ground of its own: the floor shows again.
    assert.ok(terrain.applyBiome('temperate'));
    assert.equal(G.types(map)[0].name, 'Path');
    assert.equal(map.reactor3d.room.cliffTint, undefined);
    // Asked to, it clears the paint too.
    assert.ok(terrain.applyBiome('volcanic', true));
    assert.equal(R.groundAt(map, 3, 4).name, 'Ash');
    terrain.undo(); terrain.undo(); terrain.undo(); terrain.undo();
    assert.equal(JSON.stringify(map.reactor3d), before, 'four biomes, four steps back');
});

test('paint-ground.cjs fills by rule, and validate-map.cjs reads the result', () => {
    const { paint } = require(path.join(repoRoot, 'editor/build-scripts/paint-ground.cjs'));
    const context = editorContext(), G = context.RRMapGround, E = context.RRMapElevation;
    // A slope from x 0 (low, under water) up to the east.
    const W = 24, H = 12, map = flatMap(W, H, { terrainWidth: W, terrain: Array.from({ length: (W + 1) * (H + 1) }, (_, i) => ((i % (W + 1)) - 6) * 0.25) });
    map.reactor3d.water = [{ x0: 0, y0: 0, x1: 5, y1: H - 1, level: 0, material: 'Water' }];
    const run = paint(map, { types: [{ name: 'Beach', material: 'Sand', bare: true }, { name: 'High', material: 'Gravel' }],
        fill: [{ type: 'Beach', where: { all: true }, rules: { nearWater: 3 } }, { type: 'High', where: { rect: [0, 0, W - 1, H - 1] }, rules: { minHeight: 3 } }, { type: 'Nope', where: { all: true } }] }, { Reactor3D: R, G });
    assert.ok(run.report.some(line => /skipped a fill of "Nope"/.test(line)));
    assert.equal(R.groundAt(map, 7, 5).name, 'Beach', 'beside the water');
    assert.equal(R.groundAt(map, 12, 5).type, -1, 'grass between');
    assert.equal(R.groundAt(map, 22, 5).name, 'High');
    // Through the command line, on a project folder.
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ground-'));
    try {
        fs.mkdirSync(path.join(project, 'data'), { recursive: true });
        fs.mkdirSync(path.join(project, 'img', 'materials'), { recursive: true });
        fs.writeFileSync(path.join(project, 'img', 'materials', 'Sand.png'), '');
        fs.writeFileSync(path.join(project, 'data', 'Map001.json'), JSON.stringify({ width: W, height: H, data: [], events: [], note: '<3d>' }));
        fs.writeFileSync(path.join(project, 'data', 'Map001.r3d.json'), E.stringifySidecar({ version: 1, mode: '3d', room: { floor: '!Grass-01' } }));
        fs.writeFileSync(path.join(project, 'spec.json'), JSON.stringify({ types: [{ material: 'Sand', bare: true }, { material: 'Gone' }], fill: [{ type: 'Sand', where: { rect: [2, 2, 6, 4] } }, { type: 'Gone', where: { rect: [10, 2, 11, 3] } }] }));
        const out = execFileSync(process.execPath, [path.join(repoRoot, 'editor/build-scripts/paint-ground.cjs'), project, '1', path.join(project, 'spec.json')], { encoding: 'utf8' });
        assert.match(out, /Sand: 15 cell\(s\) changed/);
        const saved = JSON.parse(fs.readFileSync(path.join(project, 'data', 'Map001.r3d.json'), 'utf8'));
        assert.equal(saved.ground.types.length, 2);
        let report = '';
        try { report = execFileSync(process.execPath, [path.join(repoRoot, 'editor/build-scripts/validate-map.cjs'), project, '1'], { encoding: 'utf8' }); }
        catch (error) { report = String(error.stdout); }
        assert.match(report, /ok {3}ground: "Sand" \(Sand\) on 15 cell\(s\), nothing grows on it/);
        assert.match(report, /FIX {2}ground: type "Gone" names material "Gone", which has no image under img\/materials/);
    } finally { fs.rmSync(project, { recursive: true, force: true }); }
});

test('the ground materials are made by a script kept in the repo, small enough to ship', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-mat-'));
    try {
        execFileSync(process.execPath, [path.join(repoRoot, 'editor/build-scripts/make-ground-materials.cjs'), out, '--only', 'Mud,Alien-Cells', '--size', '128'], { encoding: 'utf8' });
        const files = fs.readdirSync(out).sort();
        assert.deepEqual(files, ['Alien-Cells.json', 'Alien-Cells.png', 'Alien-Cells_normal.png', 'Mud.json', 'Mud.png', 'Mud_normal.png']);
        const first = fs.readFileSync(path.join(out, 'Mud.png'));
        assert.deepEqual(Array.from(first.subarray(0, 4)), [0x89, 0x50, 0x4e, 0x47]);
        // Made again, the same bytes; a file already there is left alone.
        fs.writeFileSync(path.join(out, 'Mud.json'), '{}');
        const again = execFileSync(process.execPath, [path.join(repoRoot, 'editor/build-scripts/make-ground-materials.cjs'), out, '--only', 'Mud', '--size', '128'], { encoding: 'utf8' });
        assert.match(again, /kept {5}Mud\.json/);
        assert.equal(fs.readFileSync(path.join(out, 'Mud.json'), 'utf8'), '{}');
        execFileSync(process.execPath, [path.join(repoRoot, 'editor/build-scripts/make-ground-materials.cjs'), out, '--only', 'Mud', '--size', '128', '--force'], { encoding: 'utf8' });
        assert.ok(first.equals(fs.readFileSync(path.join(out, 'Mud.png'))), 'the same picture every time');
    } finally { fs.rmSync(out, { recursive: true, force: true }); }
    // What the Demo carries stays under the size the web build can bear.
    const demo = path.join(repoRoot, 'template/Demo/img/materials');
    for (const name of ['Dirt', 'Gravel', 'Mud', 'Ash', 'Alien-Cells', 'Alien-Crystal', 'Alien-Chitin', 'Alien-Sponge', 'Alien-Veins']) {
        for (const suffix of ['.png', '_normal.png', '_rough.png']) {
            const file = path.join(demo, name + suffix);
            if (!fs.existsSync(file)) continue;
            assert.ok(fs.statSync(file).size < 150 * 1024, `${name}${suffix} is ${fs.statSync(file).size} bytes`);
        }
    }
});

test('the editor loads the ground helper, preloads the types\' materials, and writes paint in place', () => {
    assert.match(read('editor/index.html'), /src\/utils\/MapFoliage\.js"><\/script>\n\s*<script src="src\/utils\/MapGround\.js"/);
    const view = read('editor/src/MapEditor3D.js');
    assert.match(view, /for \(const name of RRMapGround\.materials\(mapData\)\) names\.add\(name\);/);
    assert.match(view, /event\?\.detail\?\.ground && !event\.detail\.types && this\.updateGroundInPlace\(event\.detail\.region \|\| null\)/);
    const world = read('runtime/reactor_3d_world.js');
    assert.match(world, /Reactor3D\.MapScene\.prototype\.updateGround = function\(mapData, region\)/);
});
