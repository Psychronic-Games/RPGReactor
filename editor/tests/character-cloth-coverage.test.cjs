'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Model, Body, Species } = require('./helpers/character-quality-matrix.cjs');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const Poses = require('../src/forge/Character3D/CharacterPoses.js');

// A vertical ray intersects actual posed fabric above the thigh. A cloth
// vertex can clear every collider while the whole skirt lies behind a knee.
function above(p, X, O) {
    for (let f = 0; f < p.index.length; f += 3) {
        const a = p.index[f] * 3, b = p.index[f + 1] * 3, c = p.index[f + 2] * 3;
        const bx = X[b] - X[a], bz = X[b + 2] - X[a + 2], cx = X[c] - X[a], cz = X[c + 2] - X[a + 2];
        const det = bx * cz - cx * bz;
        if (Math.abs(det) < 1e-10) continue;
        const ox = O[0] - X[a], oz = O[2] - X[a + 2], u = (ox * cz - cx * oz) / det, v = (bx * oz - ox * bz) / det;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const y = X[a + 1] + u * (X[b + 1] - X[a + 1]) + v * (X[c + 1] - X[a + 1]);
        if (y > O[1] && y < O[1] + 0.35) return true;
    }
    return false;
}

test('a seated robe covers the raised thighs and knees throughout preview and saved clips', async () => {
    const pack = await Body.loadPack();
    for (const species of ['human', 'alien']) {
        const result = Model.build(pack, { ...Species.speciesRecipe(species, { gender: 1 }), outfit: [{ id: 'robe' }] }, {}, { quality: 'preview' });
        const raw = Poses.clip(result.bones, 'sit', result.parts.find(p => p.name === 'Body'));
        const skirt = result.cloth.regions.find(g => g.kind === 'skirt');
        const parts = [...new Set(skirt.verts.map(q => q[0]))].map(i => result.parts[i]);
        for (const quality of ['preview', 'save']) {
            const clip = Cloth.bake(result, raw, { quality });
            for (const f of [0, 0.25, 0.5, 0.75, 1]) {
                const ps = Cloth.pose(result.bones, clip, raw.times.at(-1) * f);
                const fabric = parts.map(p => [p, Cloth.skin(p, result.bones, ps)]);
                for (const side of ['Left', 'Right']) {
                    const hip = ps.P[result.bones.findIndex(b => b.name === side + 'UpLeg')];
                    const knee = ps.P[result.bones.findIndex(b => b.name === side + 'Leg')];
                    for (const reach of [0.5, 0.75, 0.95]) for (const lateral of [-0.015, 0, 0.015]) {
                        const O = hip.map((v, i) => v * (1 - reach) + knee[i] * reach);
                        O[0] += lateral;
                        assert.ok(fabric.some(([p, X]) => above(p, X, O)), `${species} ${quality} ${side} frame ${f} reach ${reach} side ${lateral}: real fabric over knee`);
                    }
                }
            }
        }
    }
});
