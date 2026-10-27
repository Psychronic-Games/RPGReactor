'use strict';
// Grafted and insect heads meet the neck in one piece: no stalk, step or shelf between the person's neck and the head.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const Q = require('./helpers/character-quality-matrix.cjs');
let pack, eyeSource;
test.before(async () => {
    pack = await Q.Body.loadPack();
    const image = require('pngjs').PNG.sync.read(fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/data/eye-brown.png')));
    eyeSource = { width: image.width, height: image.height, data: new Uint8Array(image.data) };
});
const options = () => ({ quality: 'preview', skinSize: 32, eyeSource });
const species = (id, gender = 1, patch = {}) => ({ ...Q.Model.withSpecies({ age: 32, gender }, id), outfit: [], hair: { style: 'bald' }, ...patch });

test('a grafted head\'s neck rises at its own girth into the head, without a stalk or a step', () => {
    for (const id of ['werewolf', 'dragonborn', 'lizardfolk']) for (const [gender, patch] of [[0, {}], [1, {}], [1, { weight: 1.6, muscle: 1.5 }]]) {
        const b = Q.Model.build(pack, species(id, gender, patch), {}, options());
        const neck = b.parts.find(p => p.name === 'Head neck');
        assert.ok(neck && neck.neckRows, id + ': a neck bridge');
        const P = neck.positions, cols = P.length / 3 / (neck.neckRows + 1), C = neck.neckContactRow;
        const ringR = row => { let cx = 0, cz = 0; for (let c = 0; c < cols - 1; c++) { cx += P[(row * cols + c) * 3]; cz += P[(row * cols + c) * 3 + 2]; } cx /= cols - 1; cz /= cols - 1;
            let r = 0; for (let c = 0; c < cols - 1; c++) r += Math.hypot(P[(row * cols + c) * 3] - cx, P[(row * cols + c) * 3 + 2] - cz); return r / (cols - 1); };
        const r0 = ringR(0);
        for (let row = 1; row <= C; row++) {
            // No waist under the head (no row narrower than where it meets the head), and no row standing off the last.
            assert.ok(ringR(row) > ringR(C) * 0.97, `${id} ${gender}: row ${row} girth ${ringR(row).toFixed(4)} under ${ringR(C).toFixed(4)}`);
            assert.ok(Math.abs(ringR(row) - ringR(row - 1)) < r0 * 0.12, `${id} ${gender}: a step at row ${row}`);
        }
        // Neighbouring columns meet the head alike: no fin between them where it meets the head.
        for (let c = 0; c < cols - 1; c++) {
            const a = (C * cols + c) * 3, n = (C * cols + c + 1) * 3;
            assert.ok(Math.abs(P[a + 1] - P[n + 1]) < 0.02, `${id}: column ${c} meets the head ${(P[a + 1] - P[n + 1]).toFixed(3)} m off its neighbour`);
        }
    }
});

test('an insect head runs into the neck on a neck segment at the neck\'s girth, with no collar shelf', () => {
    for (const [gender, patch] of [[0, {}], [1, {}], [1, { weight: 1.6, muscle: 1.5 }]]) {
        const b = Q.Model.build(pack, species('insectfolk', gender, patch), {}, options());
        const head = b.parts.find(p => p.name === 'Insect head'), body = b.parts.find(p => p.name === 'Body');
        assert.ok(head && body);
        // The lowest of the insect's neck, against the person's neck just below it.
        // (The segment, not the palps hanging under the mouth.)
        let low = Infinity; for (let i = 0; i < head.positions.length; i += 3) if (Math.abs(head.positions[i]) > 0.03) low = Math.min(low, head.positions[i + 1]);
        const width = (P, y0, y1, only) => { let x = 0; for (let i = 0; i < P.length; i += 3) if (P[i + 1] > y0 && P[i + 1] < y1 && Math.abs(P[i + 2]) < 0.2 && (!only || only(i / 3))) x = Math.max(x, Math.abs(P[i])); return x; };
        // The neck's own skin (mostly the Neck's or Head's), not the shoulders rising beside it on a heavy build.
        const nb = b.bones.findIndex(q => q.name === 'Neck'), hb = b.bones.findIndex(q => q.name === 'Head');
        const neckSkin = v => { let w = 0; for (let k = 0; k < 4; k++) if (body.joints[v * 4 + k] === nb || body.joints[v * 4 + k] === hb) w += body.weights[v * 4 + k]; return w >= 0.5; };
        const seg = width(head.positions, low, low + 0.006), neck = width(body.positions, low - 0.012, low, neckSkin);
        assert.ok(neck > 0 && seg > neck * 0.85 && seg < neck * 1.12, `segment ${seg.toFixed(4)} vs neck ${neck.toFixed(4)}`);
        // No flat disc standing out round the neck a little higher up (the old collar plate).
        const above = width(head.positions, low + 0.006, low + 0.03);
        assert.ok(above < seg * 1.08, `a shelf: ${above.toFixed(4)} over ${seg.toFixed(4)}`);
    }
});

test('a hydrata\'s two necks part from one trunk and run into their heads at the heads\' girth, not as stalks', () => {
    for (const [gender, patch] of [[0, {}], [1, { weight: 1.6, muscle: 1.5 }]]) {
        const b = Q.Model.build(pack, species('hydrata', gender, patch), {}, options());
        for (const label of ['Left', 'Right']) {
            const neck = b.parts.find(p => p.name === 'Head ' + label + ' neck'), head = b.parts.find(p => p.name === 'Head ' + label + ' Body');
            assert.ok(neck && head && neck.neckRows, label + ' neck and head');
            const P = neck.positions, rows = neck.neckRows, cols = P.length / 3 / (rows + 1);
            const ring = row => { const c = [0, 0, 0]; for (let k = 0; k < cols - 1; k++) for (let d = 0; d < 3; d++) c[d] += P[(row * cols + k) * 3 + d] / (cols - 1);
                let r = 0; for (let k = 0; k < cols - 1; k++) r += Math.hypot(...[0, 1, 2].map(d => P[(row * cols + k) * 3 + d] - c[d])) / (cols - 1); return r; };
            const H = head.positions, n = H.length / 3, c = [0, 0, 0];
            for (let i = 0; i < n; i++) for (let d = 0; d < 3; d++) c[d] += H[i * 3 + d] / n;
            const girth = Array.from({ length: n }, (_, i) => Math.hypot(H[i * 3] - c[0], H[i * 3 + 2] - c[2])).sort((a, b) => a - b)[Math.floor(n / 2)];
            const top = ring(Math.round(rows * 0.8));
            assert.ok(top > girth * 0.55, `${label} neck ${top.toFixed(4)} under its head ${girth.toFixed(4)}: a stalk`);
            // Up to where it runs into the head it never pinches; past that it narrows to its end inside the head,
            // its end ring wholly within the head so no open end shows.
            for (let row = 1; row <= Math.round(rows * 0.8); row++) assert.ok(ring(row) > top * 0.9, `${label}: the neck pinches at row ${row}`);
            for (let k = 0; k < cols - 1; k++) { const v = (rows * cols + k) * 3; assert.ok(Math.hypot(P[v] - c[0], P[v + 1] - c[1], P[v + 2] - c[2]) < girth, `${label}: the neck's end shows outside its head`); }
        }
    }
});

test('compound eyes face outward all over, with no inward-turned band (seen as a black mirror crescent)', () => {
    const b = Q.Model.build(pack, species('insectfolk', 1), {}, options());
    const eyes = b.parts.find(p => p.name === 'Insect eyes');
    assert.ok(eyes && eyes.facetSurface);
    const P = eyes.positions, N = eyes.normals, n = P.length / 3;
    for (const side of [1, -1]) {
        const ids = [...Array(n).keys()].filter(v => Math.sign(P[v * 3]) === side), c = [0, 1, 2].map(k => ids.reduce((a, v) => a + P[v * 3 + k], 0) / ids.length);
        const inward = ids.filter(v => (P[v * 3] - c[0]) * N[v * 3] + (P[v * 3 + 1] - c[1]) * N[v * 3 + 1] + (P[v * 3 + 2] - c[2]) * N[v * 3 + 2] < 0);
        assert.ok(inward.length <= ids.length * 0.01, `${inward.length} of ${ids.length} eye normals turn inward`);
    }
});
