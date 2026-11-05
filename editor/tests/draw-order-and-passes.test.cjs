'use strict';
// Draws that share a shader program go together (Reactor3D.IntegerSort.opaque, byProgram), and a transparent part
// seen from both sides is drawn in one pass (buildGlbTemplate sets forceSinglePass), so neither switches programs
// nor works a program out again for every draw of a crowd.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;

test('opaque draws go by program, then material, then near to far', () => {
    const sort = Reactor3D.IntegerSort, programs = new Map();
    const was = sort._renderer;
    sort._renderer = { properties: { get: m => ({ currentProgram: programs.has(m) ? { id: programs.get(m) } : null }) } };
    try {
        const mat = (id, program) => { const m = { id }; programs.set(m, program); return m; };
        const a = mat(1, 7), b = mat(2, 3), c = mat(3, 7), d = mat(4, 3);
        const item = (material, z, id) => ({ groupOrder: 0, renderOrder: 0, material, materialVariant: 0, z, id });
        const list = [item(a, 5, 1), item(b, 4, 2), item(c, 3, 3), item(d, 2, 4)];
        list.sort(sort.opaque);
        assert.deepEqual(list.map(i => i.material.id), [2, 4, 1, 3], 'program 3 first, then 7; within one, by material');
        sort.byProgram = false;
        list.sort(sort.opaque);
        assert.deepEqual(list.map(i => i.material.id), [1, 2, 3, 4], 'off: three\'s own order, by material');
        sort.byProgram = true;
        const same = [item(a, 9, 5), item(a, 1, 6)].sort(sort.opaque);
        assert.deepEqual(same.map(i => i.z), [1, 9], 'one material: near to far');
        const order = [item(mat(9, 1), 0, 7), item(mat(8, 1), 0, 8)];
        order[0].renderOrder = 1;
        order.sort(sort.opaque);
        assert.equal(order[0].material.id, 8, 'render order still comes first');
    } finally { sort._renderer = was; sort.byProgram = true; }
});

test('the renderer the sort reads programs from is the one it is installed on', () => {
    const was = Reactor3D.IntegerSort._renderer, calls = [];
    const renderer = { setOpaqueSort: f => calls.push(f), setTransparentSort: f => calls.push(f) };
    try { Reactor3D.IntegerSort.install(renderer); assert.equal(Reactor3D.IntegerSort._renderer, renderer); assert.equal(calls.length, 2); }
    finally { Reactor3D.IntegerSort._renderer = was; }
});

test('a GLB\'s transparent double-sided materials are drawn in one pass', () => {
    const models = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.match(models, /if \(m && m\.transparent && m\.side === THREE\.DoubleSide\) m\.forceSinglePass = true;/);
});
