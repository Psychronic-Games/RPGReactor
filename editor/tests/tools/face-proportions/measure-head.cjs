#!/usr/bin/env node
'use strict';
// Reproducible model-space measurements, without camera perspective or hair.
// The ear-root mask is a proxy, not the photographic landmark in Pallett et al.
const fs = require('node:fs');
const path = require('node:path');
const dir = path.resolve(__dirname, '../../../src/forge/Character3D');
const Body = require(path.join(dir, 'HumanBody.js'));
const Model = require(path.join(dir, 'CharacterModel.js'));
const Head = require(path.join(dir, 'CharacterHeadMesh.js'));

async function measure() {
    const pack = await Body.loadPack(), ears = Body.earMask(pack), body = [...new Set(pack.body.source)];
    const rows = [];
    for (const gender of [0, 0.5, 1]) {
        const result = Model.build(pack, { gender, outfit: [], hair: { style: 'bald', brows: { style: 'none' }, lashes: false } }, {},
            { quality: 'preview', skinSize: 32, atlasSize: 32 });
        const P = result.built.shaped, head = result.parts.find(part => part.name === 'Head skin');
        const eyes = head.ocular.map(eye => eye.c), eyeY = (eyes[0][1] + eyes[1][1]) / 2;
        const roots = body.filter(v => ears[v] > 0.02 && ears[v] < 0.15 && Math.abs(P[v * 3 + 1] - eyeY) < 0.04);
        if (!roots.length) throw new Error('No native ear-root samples');
        const width = 2 * Math.min(...roots.map(v => Math.abs(P[v * 3])));
        const pupil = Math.abs(eyes[0][0] - eyes[1][0]);
        const fit = Head.lipFit(pack, P, result.recipe, head);
        rows.push({ gender, pupilMM: pupil * 1000, earRootWidthProxyMM: width * 1000,
            pupilWidthProxyRatio: pupil / width, eyeToMouthMM: (eyeY - fit.center) * 1000 });
    }
    return rows;
}

if (require.main === module) measure().then(rows => {
    const text = JSON.stringify(rows, null, 2) + '\n';
    if (process.argv[2]) fs.writeFileSync(process.argv[2], text);
    process.stdout.write(text);
}).catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { measure };
