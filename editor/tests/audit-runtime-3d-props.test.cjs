'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('a prop keeps the per-axis stretch the editor saved', () => {
    const map = { width: 10, height: 10 };
    const prop = Reactor3D.normalizeProp({ id: 1, name: 'Crate', x: 2, y: 3, stretch: [2, 0.5, 1.5] }, map);
    assert.deepEqual([...prop.stretch], [2, 0.5, 1.5]);
    assert.deepEqual([...Reactor3D.propModelSpec(prop).stretch], [2, 0.5, 1.5], 'the model spec the prop event binds carries it');
    const plain = Reactor3D.normalizeProp({ id: 2, name: 'Crate', stretch: [0, 'x', -1] }, map);
    assert.deepEqual([...plain.stretch], [1, 1, 1], 'a missing or broken axis is unstretched');
    assert.deepEqual([...Reactor3D.normalizeProp({ id: 3, name: 'Crate' }, map).stretch], [1, 1, 1]);
});
