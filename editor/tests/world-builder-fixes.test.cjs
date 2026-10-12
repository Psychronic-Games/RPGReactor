'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

/** A strip of ground 16 × 3: flat at 0 up to x 10, a bank 2 high from x 11. */
function bankMap(pieces) {
    const width = 16, height = 3;
    const terrain = [];
    for (let y = 0; y <= height; y++) for (let x = 0; x <= width; x++) terrain.push(x >= 11 ? 2 : 0);
    return { width, height, reactor3d: { version: 1, elevation: new Array(width * height).fill(0), terrain, terrainWidth: width, pieces } };
}

test('a long deck laid from low ground is stood on where it crosses a higher bank, and walked under where it is high', () => {
    // A 12-tile deck centred on cell 6, its foot 2.25 above its own (low) cell: over the bank it lies 0.25 above the ground.
    const map = bankMap([{ id: 1, kind: 'box', x: 6, y: 1, z: 2.25, size: [12, 0.3, 1], material: 'Wood' }]);
    const onBank = Reactor3D.groundHeightAt(map, 12.5, 1.5, 2);
    assert.ok(Math.abs(onBank - 2.55) < 1e-6, `stood on over the bank, 0.3 thick on top of its 0.25 foot (${onBank})`);
    assert.equal(Reactor3D.groundHeightAt(map, 5.5, 1.5, 0), 0, 'walked under where it stands 2.25 over the ground');
    assert.ok(Math.abs(Reactor3D.groundHeightAt(map, 5.5, 1.5, 2.4) - 2.55) < 1e-6, 'and stood on there by one already up on it');
});

test('build-structure reports a plan with no door and no start spot instead of crashing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-nodoor-'));
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'Map001.json'), JSON.stringify({ width: 20, height: 20, events: [], data: [] }));
    const plan = path.join(dir, 'Shed.json');
    fs.writeFileSync(plan, JSON.stringify({ name: 'Shed', size: [6, 6], storey: 5, floors: [{ rooms: { shed: [1, 1, 4, 4] }, doors: [] }] }));
    const out = execFileSync(process.execPath, [path.join(repoRoot, 'editor', 'build-scripts', 'build-structure.cjs'), dir, '1', plan, '4', '4', '--check'], { encoding: 'utf8' });
    assert.match(out, /no entrance/);
});

test('a plan of parts turns each part with its whole footprint', () => {
    const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
    const hut = { name: 'Hut', size: [16, 12], storey: 5, floors: [{ rooms: { room: [1, 1, 14, 10] }, doors: [['room', 'outside', 3]] }] };
    const village = { name: 'Two huts', size: [64, 48], storey: 5, parts: [{ name: 'a', plan: 'Hut.json', at: [4, 4], rot: 0 }, { name: 'b', plan: 'Hut.json', at: [40, 6], rot: 1 }] };
    const resolve = name => (name === 'Hut.json' ? hut : null);
    const turned = SP.transform(village, 1, 1, resolve);
    // One clockwise turn: (x, y) → (H-1-y, x). Hut a covers x 4..19, y 4..15 → x 32..43, y 4..19.
    assert.deepEqual(turned.parts[0].at, [32, 4]);
    // Hut b is already turned once (12 × 16): x 40..51, y 6..21 → x 26..41, y 40..51.
    assert.deepEqual(turned.parts[1].at, [26, 40]);
    const pieces = SP.build(turned, 0, 0, 1, 1, resolve);
    const box = (min, max) => pieces.every(p => p.x >= min[0] && p.x <= max[0] && p.y >= min[1] && p.y <= max[1]);
    assert.ok(box([0, 0], [47, 63]), 'every piece inside the turned 48 × 64 plot');
});

test('a plan light hangs at its height in tiles, as map lights do', () => {
    const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
    const plan = { name: 'Lamp', size: [4, 4], storey: 5, floors: [], effects: [{ type: 'light', at: [1, 1], z: 2.5, radius: 5, color: '#ffcc88' }] };
    const map = { width: 20, height: 20, reactor3d: { version: 1, elevation: new Array(400).fill(0), pieces: [] } };
    SP.placeEffects(map, 3, SP.effectsOf(plan, 10, 10));
    const light = map.reactor3d.lights.find(l => l.tag === 'structure:3');
    assert.equal(light.height, 2.5);
    assert.deepEqual([light.x, light.y], [11.5, 11.5]);
});

test('a Glow material with no image shines a colour from its name instead of loading a missing file', () => {
    assert.equal(Reactor3D.glowColour('LampGlow'), 0xffcf86);
    assert.equal(Reactor3D.glowColour('ForgeGlow'), 0xff7a2e);
    assert.equal(Reactor3D.glowColour('ConsoleGlow'), 0x7fd8ff);
    assert.equal(Reactor3D.glowColour('Glow'), 0xffcf86, 'a plain Glow is warm lamplight');
    const asked = [];
    const saved = globalThis.ImageManager;
    globalThis.ImageManager = { loadBitmap: (folder, name) => { asked.push(name); return { name }; } };
    try {
        assert.equal(Reactor3D.defaultMaterialLoader('LampGlow'), null, 'no image file: nothing is loaded, so nothing fails to load');
        assert.deepEqual(Reactor3D.defaultMaterialLoader('Stone'), { name: 'Stone' }, 'other materials load as before');
        assert.deepEqual(asked, ['Stone']);
    } finally {
        globalThis.ImageManager = saved;
    }
    const source = require('node:fs').readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_world.js'), 'utf8');
    assert.equal((source.match(/look\.glow \? Reactor3D\.glowColour\(name\)/g) || []).length, 2, 'the piece material and its see-through twin');
});

test('a pitched roof hangs eaves and verges past the walls, in the roof plane, walked under and cut away with the house', () => {
    const SP = require(path.join(repoRoot, 'editor', 'src', 'utils', 'StructurePlan.js'));
    const cottage = { name: 'Cot', size: [12, 10], storey: 5, materials: { wall: 'Stone', roof: 'Thatch' },
        floors: [{ rooms: { room: [1, 1, 10, 8] }, doors: [['room', 'outside', 3]] }], roof: { pitch: 4 } };
    const pieces = SP.build(cottage, 10, 10, 1, 7);
    const slabs = pieces.filter(p => p.kind === 'box');
    assert.equal(slabs.length, 8, 'two eaves, and two slopes and a flat top past each gable');
    assert.ok(slabs.every(p => p.material === 'Thatch' && p.group === 7));
    assert.equal(SP.build(Object.assign({}, cottage, { roof: { pitch: 4, overhang: 0 } }), 10, 10, 1, 7).filter(p => p.kind === 'box').length, 0, 'overhang 0 is flush');
    // Every slab's top face lies just over the roof's plane (rising a level a cell from the eave rows at the wall top).
    const ramps = pieces.filter(p => p.kind === 'ramp');
    const by0 = Math.min(...ramps.map(p => p.y)), by1 = Math.max(...ramps.map(p => p.y)), roofZ = Math.min(...ramps.map(p => p.z));
    const map = { width: 40, height: 40, reactor3d: { version: 1, elevation: new Array(1600).fill(0), pieces } };
    for (const raw of slabs) {
        const piece = Reactor3D.normalizePiece(raw, map), at = Reactor3D.shapePlacer(piece, 0);
        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            const [, y, z] = at(u, 1, v);
            const plane = Math.min(roofZ + (z - by0), roofZ + (by1 + 1 - z), roofZ + 4 + 0.1);
            assert.ok(y - plane > 0 && y - plane < 0.2, `top over the roof plane at z ${z.toFixed(2)}: ${y.toFixed(2)} vs ${plane.toFixed(2)}`);
        }
    }
    // Outside the north wall, under the eave: the ground, not the eave (it hangs over 3.5 levels up).
    assert.equal(Reactor3D.groundHeightAt(map, 15.5, by0 - 0.5, 0), 0);
    // The cutaway reaches the eaves: the group's box takes in the row past each wall.
    const box = Reactor3D.pieceIndex(map).groups.get(7);
    assert.ok(box.y0 <= by0 - 1 && box.y1 >= by1 + 1 && box.x0 <= 10 && box.x1 >= 21, JSON.stringify(box));
});
