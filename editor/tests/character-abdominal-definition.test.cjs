'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

test('abdominal relief leaves natural tone intact and blends continuously beyond it', () => {
    const natural = Body.normalizeRecipe({ shapes: { abs: 1 } }), extreme = Body.normalizeRecipe({ shapes: { abs: 2 } });
    assert.equal(Body.targetWeights(extreme)['shape/abs-incr'], Body.targetWeights(natural)['shape/abs-incr'], 'extreme tone must stop flattening before adding muscle relief');
    assert.ok(Body.targetWeights({ shapes: { abs: -2 } })['shape/abs-decr'] > Body.targetWeights({ shapes: { abs: -1 } })['shape/abs-decr'], 'the loose negative extreme retains its range');
    const base = Body.shape(pack, Body.normalizeRecipe({ shapes: { abs: 1 } }));
    const sample = abs => { const P = base.slice(); Body.abdominalDefinition(pack, P, { shapes: { abs } }); return P; };
    for (const abs of [0, 0.5, 1]) {
        const actual = sample(abs);
        assert.ok(base.every((v, i) => v === actual[i]), 'natural tone ' + abs);
    }
    const near = sample(1.001), half = sample(1.5), full = sample(2);
    let maximum = 0, changed = 0;
    for (let i = 0; i < base.length; i++) {
        assert.ok(Number.isFinite(full[i]));
        const delta = full[i] - base[i];
        if (Math.abs(delta) < 0.000001) continue;
        changed++; maximum = Math.max(maximum, Math.abs(delta));
        assert.ok(Math.abs((half[i] - base[i]) - delta * 0.5) < 0.000001, 'smooth midpoint');
        assert.ok(Math.abs(near[i] - base[i]) < 0.000001, 'no jump at natural endpoint');
        assert.equal(i % 3, 2, 'relief preserves horizontal and vertical skin coordinates');
    }
    assert.ok(changed > 50 && changed < 1000, 'local abdominal vertices: ' + changed);
    // Preview 70: the owner rejected the subtle relief, whose ceiling was 0.022. The profile's own peak, span * (0.012 + 0.083 * 1.4), is 0.0342.
    assert.ok(maximum > 0.022 && maximum < 0.035, 'bounded muscle relief: ' + maximum);
});

test('extreme tone has six raised abdominal bellies separated by a central groove', () => {
    const B = pack.positions, P = B.slice(), navel = Body.anatomyFields(pack).navel;
    Body.abdominalDefinition(pack, P, { shapes: { abs: 2 } });
    const { lower, height, span } = pack._abdominalFrame;
    const front = [...new Set(pack.body.source)].filter(v => B[v * 3 + 2] > B[navel * 3 + 2] - 0.035);
    const nearest = (x, y) => front.reduce((a, v) => ((B[v * 3] - x) ** 2 + (B[v * 3 + 1] - y) ** 2) < ((B[a * 3] - x) ** 2 + (B[a * 3 + 1] - y) ** 2) ? v : a);
    const relief = v => P[v * 3 + 2] - B[v * 3 + 2];
    // Preview 70 sets the rows between navel and bust and lifts the whole front, so the groove is measured against the bellies beside it.
    const pair = row => Math.min(...[-1, 1].map(side => relief(nearest(side * 0.19 * span, lower + row * height))));
    const rows = [0.16, 0.50, 0.84];
    for (const row of rows) {
        assert.ok(pair(row) > 0.004, 'raised pair at row ' + row);
        assert.ok(pair(row) - relief(nearest(0, lower + row * height)) > 0.015, 'central groove at row ' + row);
    }
    for (const row of [0.33, 0.67]) assert.ok(pair(row) < pair(row - 0.17) && pair(row) < pair(row + 0.17), 'tendon between the rows at ' + row);
    assert.ok(pair(0.50) > pair(0.16) && pair(0.50) > pair(0.84), 'the middle pair stands out from the other two');
    const head = Body.headFields(pack);
    for (const v of head.eyeIds) assert.equal(P[v * 3 + 2], B[v * 3 + 2]);
});

test('abdominal shading retains continuous muscle normals instead of smoothing the relief away', () => {
    const recipe = Body.normalizeRecipe({ gender: 0, shapes: { abs: 2 } }), P = Body.shape(pack, recipe);
    const blurred = Body.skinNormals(pack, P), defined = Body.skinNormals(pack, P, recipe);
    let changed = 0;
    for (const v of new Set(pack.body.source)) if (Math.abs(pack._abdominalDefinition[v]) > 0.001) {
        assert.ok(Math.abs(Math.hypot(...defined.subarray(v * 3, v * 3 + 3)) - 1) < 0.00001);
        if (Math.hypot(...[0, 1, 2].map(k => defined[v * 3 + k] - blurred[v * 3 + k])) > 0.05) changed++;
    }
    assert.ok(changed > 30, 'the abdominal normals retain their definition');
});

test('extreme abdominal creases retain their restrained shade in model attributes', () => {
    const natural = Body.build(pack, { shapes: { abs: 1 } }), extreme = Body.build(pack, { shapes: { abs: 2 } });
    assert.equal(natural.parts[0].colors, undefined);
    assert.equal(extreme.parts[0].keepColors, true);
    const colors = extreme.parts[0].colors;
    assert.ok(colors.length === extreme.parts[0].positions.length && colors.every(v => Number.isFinite(v) && v >= 0.87 && v <= 1));
    assert.ok(colors.some(v => v < 0.95), 'tendon creases remain readable in soft light');
});
