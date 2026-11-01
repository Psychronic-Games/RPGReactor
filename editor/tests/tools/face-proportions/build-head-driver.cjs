#!/usr/bin/env node
'use strict';
// Capture the native slider cage for build_head.py. The generated mask never
// feeds back into these rest samples, so rebuilding does not compound a fit.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../../src/forge/Character3D');
const Body = require(path.join(dir, 'HumanBody.js'));
require(path.join(dir, 'HumanTargets.js'));
globalThis.RR_NO_EYE_SEAT = true;
(async () => {
    if (!process.argv[2]) throw new Error('Usage: build-head-driver.cjs OUTPUT_JSON');
    const pack = await Body.loadPack(), head = Body.headFields(pack);
    const out = {
        source: [...pack.body.source], index: [...pack.body.index].map(i => pack.body.source[i]),
        uv: [...pack.body.uv], eye: [...head.eyeIds], head: [...head.w],
        triangleUv: [...pack.body.index].flatMap(i => [pack.body.uv[i * 2], pack.body.uv[i * 2 + 1]]),
        ears: [...Body.earMask(pack)],
        upper: [...Body.maskOf(pack, ['shape/upperLip-incr'], 2)],
        lower: [...Body.maskOf(pack, ['shape/lowerLip-incr'], 2)]
    };
    for (const [name, gender] of [['F', 0], ['M', 1]]) out[name] = [...Body.build(pack, Body.normalizeRecipe({ gender })).shaped];
    fs.mkdirSync(path.dirname(path.resolve(process.argv[2])), { recursive: true });
    fs.writeFileSync(process.argv[2], JSON.stringify(out));
    console.log('Captured shared face driver:', pack.vertexCount, 'vertices');
})().catch(error => { console.error(error); process.exitCode = 1; });
