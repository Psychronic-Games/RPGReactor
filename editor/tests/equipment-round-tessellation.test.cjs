'use strict';
// Worn equipment and Prop Builder parts take their round tessellation from their size: a rivet or clasp is
// a few dozen triangles, a dome or helmet keeps at least 16 x 32 and rounder. Spheres shade from their own
// normals. Creature parts (ExactMesh) keep the counts they ask for.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Patterns = load('ConstructionPatterns');
const Props = load('CharacterProps');
const PropMesh = require(path.join(root, 'src', 'forge', 'Props', 'PropMesh.js'));

const skin = { joints: [0, 0, 0, 0], weights: [1, 0, 0, 0] }, gold = [0.6, 0.4, 0.1];
const tris = m => (m.i || m.index).length / 3;
const sphere = (r, Mesh = Props.Mesh, rows, sides, squash) => { const m = new Mesh(); m.sphere([0, 1, 0], r, gold, skin, rows, sides, squash); return m; };
const tube = (r, Mesh = Props.Mesh, sides = 8) => { const m = new Mesh(); m.tube([[0, 0, 0], [0, 0.1, 0]], r, sides, gold, skin); return m; };

test('the rule: sides grow with the square root of the radius, even, 8 to 64', () => {
    assert.equal(Patterns.roundSides(0), 8);
    assert.equal(Patterns.roundSides(0.002), 8);
    assert.equal(Patterns.roundSides(10), 64);
    let last = 0;
    for (let r = 0.0005; r < 0.5; r *= 1.3) {
        const n = Patterns.roundSides(r);
        assert.equal(n % 2, 0); assert.ok(n >= last, 'never fewer sides for a larger part'); last = n;
        // The polygon's edge stays within 0.2 mm of the circle wherever the ceiling allows.
        if (n < 64) assert.ok(r * (1 - Math.cos(Math.PI / n)) <= 0.0002 + 1e-9, 'sagitta at r=' + r);
    }
});

test('a small sphere stays under 100 triangles; a 9 mm clasp under 300; a large dome keeps at least 16 x 32', () => {
    for (const r of [0.0008, 0.0015, 0.0025]) assert.ok(tris(sphere(r)) < 100, r + ' m: ' + tris(sphere(r)));
    // Caller counts no longer inflate small hardware.
    assert.ok(tris(sphere(0.002, Props.Mesh, 8, 16)) < 100);
    assert.ok(tris(sphere(0.009)) < 300);
    for (const r of [0.05, 0.1, 0.2]) assert.ok(tris(sphere(r)) >= 2 * 16 * 32, r + ' m: ' + tris(sphere(r)));
    // A squashed ball is sized by its widest semi-axis.
    assert.ok(tris(sphere(0.03, Props.Mesh, 8, 12, [2, 1, 1])) > tris(sphere(0.03)));
    // Tubes: a 1 mm cord has 8 sides, a 50 mm column at least 32.
    assert.equal(tris(tube(0.001)), 8 * 2 + 8 * 2);
    assert.ok(tris(tube(0.05)) >= 32 * 2 + 32 * 2);
});

test('creature parts (ExactMesh) keep exactly the rows and sides they ask for', () => {
    assert.equal(tris(sphere(0.2, Props.ExactMesh, 5, 8)), 2 * 5 * 8);
    assert.equal(tris(sphere(0.0005, Props.ExactMesh, 10, 16)), 2 * 10 * 16);
    assert.equal(tris(tube(0.05, Props.ExactMesh, 6)), 6 * 2 + 6 * 2);
});

test('spheres keep exact outward normals, also after later parts recompute the mesh and after a merge', () => {
    const m = new Props.Mesh(), r = 0.004, c = [0.1, 1.2, 0.05], squash = [1, 1.3, 0.7];
    m.sphere(c, r, gold, skin, 4, 6, squash);
    const count = m.p.length / 3;
    m.tube([[0, 0, 0], [0, 0.2, 0]], 0.003, 8, gold, skin);
    m.computeNormals();
    for (let v = 0; v < count; v++) {
        const d = [0, 1, 2].map(k => (m.p[v * 3 + k] - c[k]) / (r * squash[k]) ** 2), l = Math.hypot(...d);
        for (let k = 0; k < 3; k++) assert.ok(Math.abs(m.n[v * 3 + k] - d[k] / l) < 1e-9, 'vertex ' + v);
    }
    // The poles point straight up and down, not in a pinwheel.
    assert.ok(m.n[1] < -0.999 && m.n[(count - 1) * 3 + 1] > 0.999);
    // The tube's own normals still come from its faces.
    assert.ok(m.n.slice(count * 3).some(x => x !== 0));
});

test('Prop Builder: small balls and bars are cheap, large ones round, and a requested count above the rule stays', () => {
    assert.ok(tris(PropMesh.sphere([0, 0, 0], 0.002, 8)) < 100);
    assert.ok(tris(PropMesh.sphere([0, 0, 0], 0.1, 8)) >= 2 * 16 * 32);
    const ball = PropMesh.sphere([0.2, 0.1, 0], 0.01, 8);
    for (let v = 0; v < ball.positions.length; v += 3) {
        const d = [ball.positions[v] - 0.2, ball.positions[v + 1] - 0.1, ball.positions[v + 2]], l = Math.hypot(...d);
        if (l > 1e-6) for (let k = 0; k < 3; k++) assert.ok(Math.abs(ball.normals[v + k] - d[k] / l) < 1e-6);
    }
    // A turned pot's Segments setting (64) is the user's; a 4-sided lathe stays a diamond.
    assert.equal(tris(PropMesh.lathe([[0.01, 0], [0.01, 0.1]], 64, { caps: false })), 64 * 2);
    assert.equal(tris(PropMesh.lathe([[0.2, 0], [0.2, 0.1]], 4, { caps: false })), 4 * 2);
    assert.equal(tris(PropMesh.polyTube([[0, 0, 0], [0, 1, 0]], 0.001, 4)), 8 * 2);
});

test('real accessories: brooch, studs and the cape clasp are small; the crown stays far under its old count', async () => {
    const Body = load('HumanBody');
    for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail']) load(name);
    const Model = load('CharacterModel');
    const pack = await Body.loadPack();
    const base = { gender: 1, hair: { style: 'bald' }, outfit: [] }, options = { quality: 'preview', skinSize: 32, atlasSize: 64 };
    const bareNames = new Set(Model.build(pack, Model.normalize(base), {}, options).parts.map(p => p.name));
    const own = id => Model.build(pack, Model.normalize({ ...base, props: [{ id }] }), {}, options).parts.filter(p => !bareNames.has(p.name));
    const count = id => own(id).reduce((n, p) => n + p.index.length / 3, 0);
    // Before the size rule: brooch 16,832, studs 2,048, crown 17,472 triangles.
    assert.ok(count('brooch') < 4000, 'brooch ' + count('brooch'));
    assert.ok(count('studs') < 400, 'studs ' + count('studs'));
    assert.ok(count('crown') < 6000, 'crown ' + count('crown'));
    // The cape's clasp: its smallest connected piece.
    const cape = own('cape').find(p => p.name === 'Cape');
    const n = cape.positions.length / 3, par = Int32Array.from({ length: n }, (_, i) => i), find = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
    for (let k = 0; k < cape.index.length; k += 3) { par[find(cape.index[k])] = find(cape.index[k + 1]); par[find(cape.index[k + 1])] = find(cape.index[k + 2]); }
    const faces = new Map();
    for (let k = 0; k < cape.index.length; k += 3) { const r = find(cape.index[k]); faces.set(r, (faces.get(r) || 0) + 1); }
    assert.ok(Math.min(...faces.values()) < 300, 'clasp ' + Math.min(...faces.values()));
});
