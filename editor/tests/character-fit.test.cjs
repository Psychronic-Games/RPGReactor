'use strict';
// Clothing clears what it's worn over, on any body: the skin, the layers under it, and raised skin detail.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const Fit = require(path.join(__dirname, '..', 'src', 'forge', 'Character3D', 'CharacterFit.js'));
const sheet = (z, size = 1, cells = 20, x0 = 0) => {
    const positions = [], index = [], n = cells + 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) positions.push(x0 - size / 2 + i / cells * size, -size / 2 + j / cells * size, z);
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) { const a = j * n + i, b = a + 1, c = a + n, d = c + 1; index.push(a, b, d, a, d, c); }
    return { positions: Float32Array.from(positions), index: Uint32Array.from(index) };
};
const entry = (garment, layer, mesh) => ({ garment, laid: { ...mesh, layer } });

test('cloth inside the skin comes out to it, with no spike at the edge of the move', () => {
    const skin = sheet(0), cloth = sheet(0, 1, 20), P = cloth.positions;
    for (let v = 0; v < P.length / 3; v++) { const r = Math.hypot(P[v * 3], P[v * 3 + 1]); P[v * 3 + 2] = r < 0.2 ? -0.01 : 0.01; }
    const [report] = Fit.settle([entry('shirt', 0, cloth)], skin);
    assert.ok(report.moved > 0 && report.deepest < -0.005);
    let lowest = Infinity, jump = 0;
    for (let v = 0; v < P.length / 3; v++) { lowest = Math.min(lowest, P[v * 3 + 2]); if ((v + 1) % 21) jump = Math.max(jump, Math.abs(P[v * 3 + 2] - P[(v + 1) * 3 + 2])); }
    assert.ok(lowest > 0, 'nothing left under the skin: ' + lowest);
    assert.ok(jump < 0.02, 'a soft shoulder, not a step: ' + jump);
});

test('an outer layer clears the one under it, in worn order whatever the list says, and a fold rising through it is pressed back', () => {
    const skin = sheet(0), under = sheet(0.01, 1, 40), outer = sheet(0.005, 1, 4), P = under.positions;
    P[(20 * 41 + 22) * 3 + 2] = 0.03; // A fold between the coat's vertices.
    Fit.settle([entry('coat', 0, outer), entry('shirt', 1, under)], skin, null, null, e => (e.garment === 'coat' ? 1 : 0));
    const coatAt = Math.min(...Array.from(outer.positions).filter((_, i) => i % 3 === 2));
    assert.ok(coatAt > 0.01, 'the coat is outside the shirt: ' + coatAt);
    assert.ok(P[(20 * 41 + 22) * 3 + 2] < Math.max(...Array.from(outer.positions).filter((_, i) => i % 3 === 2)), 'the fold is under the coat');
});

test('pieces of one garment are sewn together and never push each other', () => {
    const skin = sheet(-0.1), a = sheet(0.01), b = sheet(0.01), before = b.positions.slice();
    Fit.settle([entry('dress', 0, a), entry('dress', 0, b)], skin);
    assert.deepEqual(Array.from(b.positions), Array.from(before));
});

test('a raised point in the skin lifts the cloth over it', () => {
    const skin = sheet(0), cloth = sheet(0.002, 1, 40);
    Fit.settle([entry('shirt', 0, cloth)], skin, null, [{ at: [0, 0, 0], normal: [0, 0, 1], height: 0.012, radius: 0.03 }]);
    assert.ok(cloth.positions[(20 * 41 + 20) * 3 + 2] > 0.012, 'over the tip');
    assert.ok(cloth.positions[2] < 0.0025, 'and nowhere else');
});

test('covered sees a solid face over a point, from under the skin, even when its first corner is far away', () => {
    const big = { positions: Float32Array.of(-1, -1, 0.02, 1, -1, 0.02, 0, 1, 0.02), index: Uint32Array.of(0, 1, 2) };
    assert.equal(Fit.covered([0, 0, 0], [0, 0, 1], [big]), true);
    assert.equal(Fit.covered([0, 0, 0.03], [0, 0, 1], [big]), false, 'not behind the point');
    assert.equal(Fit.covered([0, 0, 0], [0, 0, 1], [{ ...big, opacity: 0.4 }]), false, 'glass covers nothing');
});

test('thin cloth rises over a point it passes clear of, outward, and only near it', () => {
    const skin = sheet(0), cloth = sheet(0.008, 1, 100), bump = { at: [0, 0, 0], normal: [0, 0, 1], height: 0.009, radius: 0.03 };
    Fit.settle([entry('shirt', 0, cloth)], skin, null, [bump], null, () => true);
    const at = (i, j) => cloth.positions[(j * 101 + i) * 3 + 2];
    assert.ok(at(50, 50) > 0.0145, 'the top stands over the rest of the shirt, never dented toward the skin');
    assert.ok(at(50, 50) > at(52, 50) && at(52, 50) > at(54, 50), 'falling away from the top');
    assert.ok(Math.abs(at(5, 5) - 0.008) < 1e-5, 'and the shirt is untouched further off');
});

test('stiff cloth (no cling) and cloth under a coat show no point', () => {
    const bump = { at: [0, 0, 0], normal: [0, 0, 1], height: 0.009, radius: 0.03 };
    const stiff = sheet(0.02, 1, 100);
    Fit.settle([entry('plate', 0, stiff)], sheet(0), null, [bump], null, () => false);
    assert.ok(Math.abs(stiff.positions[(50 * 101 + 50) * 3 + 2] - 0.02) < 1e-5, 'a stiff piece stays as cut');
    const shirt = sheet(0.012, 1, 100), coat = sheet(0.05, 1, 20);
    Fit.settle([entry('shirt', 0, shirt), entry('coat', 0, coat)], sheet(0), null, [bump], e => (e.garment === 'coat' ? 1 : 0), e => e.garment === 'shirt');
    assert.ok(Math.abs(shirt.positions[(50 * 101 + 50) * 3 + 2] - 0.012) < 1e-5, 'nothing under the coat rises');
});

test('skin finer than the cloth over it comes through no face: the face lifts', () => {
    // A finger's ridge between the corners of one big face: every cloth vertex is clear of it.
    const skin = sheet(0, 1, 60), S = skin.positions;
    for (let v = 0; v < S.length / 3; v++) if (Math.hypot(S[v * 3], S[v * 3 + 1]) < 0.03) S[v * 3 + 2] = 0.02;
    const cloth = sheet(0.008, 1, 4);
    Fit.settle([entry('glove', 0, cloth)], skin);
    const under = Fit.Surface(), P = cloth.positions, I = cloth.index, at = v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], hit = { d: 0, n: null };
    for (let t = 0; t < I.length; t += 3) under.add(at(I[t]), at(I[t + 1]), at(I[t + 2]), false);
    assert.ok(under.nearest(0, 0, 0.02, hit) && hit.d < 0, 'the ridge lies under the cloth');
});
