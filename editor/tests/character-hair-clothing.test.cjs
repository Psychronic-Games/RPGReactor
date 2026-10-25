'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
const Hair = require('../src/forge/Character3D/CharacterHair.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const Query = require('../src/forge/Character3D/CharacterOutfitTransfer.js');

// A broad back plate has no vertices near the center of the locks. The old
// 3 cm vertex-neighborhood fit left the middle buried, showing a root and a
// detached-looking tip. These probes inspect actual hair against the plane;
// they do not call the collision fitter or its triangle-query helper.
test('gathered and loose hair keep their middle outside a broad sparse back plate', async () => {
    const pack = await Body.loadPack(), body = Body.build(pack, { gender: 0 });
    const plate = {
        positions: new Float32Array([-.2, 1.1, -.18, .2, 1.1, -.18, .2, 1.43, -.18, -.2, 1.43, -.18]),
        index: new Uint32Array([0, 1, 2, 0, 2, 3])
    };
    for (const style of ['ponytailLow', 'braid', 'long']) {
        const recipe = { style, length: 1.6 };
        const bare = Hair.build(pack, body, recipe).find(p => p.name === 'Hair');
        const fitted = Hair.build(pack, body, recipe, { outfitParts: [plate] }).find(p => p.name === 'Hair');
        assert.equal(fitted.index.length, bare.index.length, `${style}: keep complete locks`);
        for (let f = 0; f < bare.index.length; f += 3) {
            assert.equal(fitted.index[f], bare.index[f]);
            assert.equal(fitted.index[f + 1] + fitted.index[f + 2], bare.index[f + 1] + bare.index[f + 2], `${style}: only winding may change`);
        }
        assert.equal(fitted.positions.length, bare.positions.length);
        let probes = 0, maxMove = 0;
        for (let v = 0; v < bare.positions.length / 3; v++) {
            const [x, y, z] = bare.positions.subarray(v * 3, v * 3 + 3);
            if (Math.abs(x) < .04 && y > 1.15 && y < 1.34 && z < -.02 && z > -.18) {
                probes++;
                assert.ok(fitted.positions[v * 3 + 2] < -.182, `${style}: middle vertex ${v} lies behind the plate with clearance`);
            }
            if (y > 1.45) for (let c = 0; c < 3; c++) assert.equal(fitted.positions[v * 3 + c], bare.positions[v * 3 + c], `${style}: scalp remains pinned`);
            maxMove = Math.max(maxMove, Math.hypot(...[0, 1, 2].map(c => fitted.positions[v * 3 + c] - bare.positions[v * 3 + c])));
        }
        assert.ok(probes > 200, `${style}: inspect a full middle section`);
        assert.ok(maxMove < .2, `${style}: bounded local drape, ${maxMove} m`);
        for (const key of ['positions', 'normals', 'uvs', 'weights']) assert.ok(fitted[key].every(Number.isFinite), `${style}: finite ${key}`);
    }
});

test('long locks retain torso clearance when the head bends on normal and heavy bodies', async () => {
    const pack = await Body.loadPack();
    let tested = 0, inside = 0;
    for (const gender of [0, 1]) for (const weight of [0.5, 2]) {
        const body = Body.build(pack, { age: 30, gender, weight, cup: weight === 2 ? 2 : 0.5 });
        const head = body.bones.findIndex(b => b.name === 'Head'), neck = body.bones.find(b => b.name === 'Neck').head[1];
        const q = [Math.sin(0.45), 0, 0, Math.cos(0.45)];
        const pose = Cloth.pose(body.bones, { times: Float32Array.of(0, 1), tracks: [{ bone: head, values: Float32Array.from([...q, ...q]) }] }, 0.5);
        const skin = Cloth.skin(body.parts[0], body.bones, pose), solid = Query.triangleGrid(skin, body.parts[0].index, 0.05);
        for (const style of ['long', 'longWavy', 'veryLong', 'hime', 'ringlets', 'dreadlocks', 'ponytailLow', 'braid', 'twinBraids', 'sideBraid', 'halfUp', 'braidedPonytail']) {
            const hair = Hair.build(pack, body, { style, length: 1.8 }, { budget: 0.25 }).find(p => p.name === 'Hair');
            const P = Cloth.skin(hair, body.bones, pose);
            // Independent ray parity against the posed body, rather than the
            // fitter's nearest-normal distance. Ignore roots above the torso.
            for (let v = 0; v < P.length / 3; v += 5) {
                if (hair.positions[v * 3 + 1] > neck - 0.03) continue;
                const point = Array.from(P.subarray(v * 3, v * 3 + 3));
                const hits = Query.rayHits(solid, point, [0, 0, 1], 0.0005, body.height * 1.2).map(h => h.s).sort((a, b) => a - b).filter((s, i, a) => !i || s - a[i - 1] > 0.0001);
                tested++;
                if (hits.length % 2) inside++;
            }
        }
    }
    assert.ok(tested > 10000);
    assert.ok(inside / tested < 0.003, inside + '/' + tested + ' sampled contacts');
});

test('short hair above the neckline skips all clothing contact indexing without changing its geometry',async()=>{
    const pack=await Body.loadPack(),body=Body.build(pack,{gender:0}),options={seed:17,gender:0,budget:.5};
    const bare=Hair.build(pack,body,{style:'crew'},options);
    const unused={get positions(){assert.fail('short hair must not scan the outfit');}};
    const fitted=Hair.build(pack,body,{style:'crew'},{...options,outfitParts:[unused]});
    assert.equal(fitted.length,bare.length);
    for(let i=0;i<bare.length;i++)assert.ok(Buffer.from(fitted[i].positions.buffer).equals(Buffer.from(bare[i].positions.buffer)),bare[i].name+' unchanged');
});
