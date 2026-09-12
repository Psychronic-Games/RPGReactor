const assert = require('node:assert/strict');
const test = require('node:test');
const R = require('../../runtime/reactor_3d.js');

// Exercise selection and the real render/flush scheduler without a GPU. Only
// depth drawing and scene traversal are replaced; row ownership, budgets,
// invalidation and published shader uniforms are the runtime's own code.
test('near-equal overlapping lights retain their rows, but stronger/new lights can replace them', () => {
    let rows = R.Shadows.assign([{ id: 'a', rank: -1 }, { id: 'b', rank: -0.99 }], 1, null);
    for (let frame = 0; frame < 120; frame++) {
        const lights = [{ id: 'a', rank: -1 }, { id: 'b', rank: -(1 + Math.sin(frame) * 0.1) }];
        if (frame % 2) lights.reverse();
        rows = R.Shadows.assign(lights, 1, rows);
        assert.equal(rows[0].id, 'a', `row remains stable at frame ${frame}`);
    }
    rows = R.Shadows.assign([{ id: 'a', rank: -1 }, { id: 'b', rank: -2 }], 1, rows);
    assert.equal(rows[0].id, 'b', 'a materially stronger light takes over');
    rows = R.Shadows.assign([{ id: 'a', rank: -1 }], 1, rows);
    assert.equal(rows[0].id, 'a', 'a removed or disabled light releases its row immediately');
    const equal = [{ id: 'b', rank: -1 }, { id: 'a', rank: -1 }];
    assert.deepEqual(R.Shadows.assign(equal, 2, null), R.Shadows.assign(equal.slice().reverse(), 2, null),
        'initial ties do not depend on candidate enumeration order');
});

test('crossing a spotlight priority edge does not abruptly drop its score tenfold', () => {
    const candidate = { x: 0, y: 0, z: 0, radius: 10, spot: true,
        ax: 0, ay: 0, az: 1, cosHalf: 0.8, strength: 1 };
    const score = cosine => R.Shadows._incident(candidate,
        { x: Math.sqrt(1 - cosine * cosine), y: -0.7, z: cosine });
    assert.ok(Math.abs(score(0.720001) - score(0.719999)) < 0.0001,
        'tiny movement across the old hard boundary makes only a tiny priority change');
    assert.ok(score(0.95) > score(0.72) * 1.1, 'a light aimed directly at the focus still ranks higher');
    assert.ok(score(0.95) < score(0.72) * 2, 'but never so much that a sweep alone can take a row (SHADOW_ROW_TAKEOVER)');
});

test('authored flicker changes illumination while keeping shadow priority steady', () => {
    const strengths = new Set();
    for (let frame = 0; frame < 120; frame++) {
        const animated = R.animateLight({ flicker: 0.75 }, frame, 0, 5.5, 1.6);
        strengths.add(animated.intensity);
        assert.equal(animated.priorityRadius, 5.5);
        assert.equal(animated.priorityIntensity, 1.6);
    }
    assert.ok(strengths.size > 10, 'the intended light flicker is preserved');
    const pulsed = R.animateLight({ flicker: 0.75, pulse: { min: 0.5, max: 1, period: 60 } }, 0, 0, 6, 1);
    assert.equal(pulsed.priorityRadius, 3, 'deliberate reach changes still affect ranking');
});

test('moving lights publish matching static/dynamic shadows within the existing frame budgets', () => {
    const previousThree = global.THREE;
    global.THREE = {};
    const renderer = { autoClear: true, getRenderTarget: () => null, setRenderTarget() {} };
    const scene = { matrixWorldAutoUpdate: false, background: {}, add(node) { node.parent = this; } };
    const candidates = ['a', 'b'].map((id, index) => ({ id, index, x: 1, y: 0, z: 0, radius: 5, gap: index }));
    const tiles = candidates.map(c => ({ ...R.Shadows._makeTile(), id: c.id, candidate: c,
        key: c.id + '|0.000,0.000,0.000|6', far: 6, origin: { x: 0, y: 0, z: 0 }, valid: true }));
    const dynamic = tiles.map((t, tile) => ({ ...R.Shadows._makeTile(), id: t.id, key: t.key, tile, valid: true, stamp: 20 }));
    const draws = [];
    const sh = Object.assign(Object.create(R.Shadows), {
        _active: true, _renderer: renderer, _atlas: {}, _dynAtlas: {}, _sentinel: {},
        _tiles: tiles, _dynTiles: dynamic, _frame: 20, _reported: true, _candidates: candidates,
        _quality: { staticPerFrame: 2, dynamicPerFrame: 1, dynamicInterval: 2 },
        _ensureAtlas() {}, _focusPoint: () => null, _budgetDynamic: () => null,
        _changedStatics: () => ({ all: false, points: [] }), _changedDynamics: () => ({ points: [] }),
        _castersWithin: () => true, _dynamicWithin: () => true,
        _swapCasters: () => [], _unswap() {}, _atCoarsestLod: fn => fn(), _bindMaps() {},
        _renderTile(renderer, scene, atlas, row, origin) { draws.push({ atlas, row, x: origin.x }); }
    });
    try {
        for (let frame = 0; frame < 6; frame++) {
            draws.length = 0;
            sh.render(renderer, scene, {});
            sh._flush();
            if (frame === 0) assert.equal(draws.length, 0, 'the pair waits for the dynamic refresh interval');
            assert.ok(draws.filter(d => d.atlas === sh._atlas).length <= 2);
            assert.ok(draws.filter(d => d.atlas === sh._dynAtlas).length <= 1);
            const uniforms = R.lightUniforms();
            for (const row of dynamic) {
                const tile = tiles[row.tile];
                assert.equal(row.key, tile.key, 'a light never publishes one half of a new origin');
                assert.equal(uniforms.rrLightShadow.value[tile.candidate.index], row.tile);
                assert.ok(uniforms.rrShadowInfo.value[row.tile * 4 + 2] >= 0,
                    'the character shadow remains visible while its refresh waits');
            }
        }
        assert.ok(tiles.every(t => t.origin.x === 1), 'both lights eventually refresh, even with stationary casters');
        assert.ok(tiles.every(t => !t.dirty) && dynamic.every(r => !r.dirty), 'the queues drain');
        draws.length = 0;
        sh.render(renderer, scene, {});
        sh._flush();
        assert.equal(draws.length, 0, 'settled lights and casters do not redraw');
    } finally {
        if (previousThree === undefined) delete global.THREE;
        else global.THREE = previousThree;
    }
});
