'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('a flat character sprite stands on the terrain its physics walks, as the editor draws it', () => {
    // A hill: the terrain corner at (3,3) is 2 up.
    const width = 6, height = 6;
    const terrain = new Array((width + 1) * (height + 1)).fill(0);
    terrain[3 * (width + 1) + 3] = 2;
    const map = { width, height, reactor3d: { elevation: new Array(width * height).fill(0), terrain } };
    const saved = globalThis.$dataMap;
    globalThis.$dataMap = map;
    try {
        const walker = { _realX: 3, _realY: 3, _reactorAir: 0.25 };
        const stand = Reactor3D.standingPlaceFor(walker);
        const ground = Reactor3D.groundHeightAt(map, 3.5, 3.5);
        assert.ok(ground > 0.4, 'the hill rises under the cell');
        assert.ok(Math.abs(stand.height - (ground + 0.25)) < 1e-9, `on the hill plus its air, not sunk to the cell's elevation (${stand.height})`);
    } finally {
        globalThis.$dataMap = saved;
    }
});
