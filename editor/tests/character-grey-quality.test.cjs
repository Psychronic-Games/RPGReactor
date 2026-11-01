'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { Body, Model, inventory } = require('./helpers/character-quality-matrix.cjs');
const source = fs.readFileSync(path.join(__dirname, '../src/forge/Character3D/Character3DBuilder.js'), 'utf8');
let pack;
test.before(async () => { pack = await Body.loadPack(); });

test('Grey lenses cover their sockets across both sexes and six contrasting extreme profiles', () => {
    for (const f of inventory().filter(f => f.group === 'species' && f.entity === 'alien')) {
        const r = Model.build(pack, f.recipe, {}, { quality: 'preview', skinSize: 32, atlasSize: 32, hairBudget: 0.2 });
        const lenses = r.parts.find(p => p.name === 'Alien eyes');
        assert.ok(lenses && lenses.index.length, f.id + ' lenses');
        assert.equal(r.parts[0].positions.length, pack.body.source.length * 3, 'retain the drag/expression mesh topology');
        for (const p of r.parts) for (const field of ['positions', 'normals', 'weights']) assert.ok(p[field].every(Number.isFinite), f.id + ' ' + p.name + '/' + field);
        for (const side of [-1, 1]) {
            const fr = Body.almondEye.frame(pack, r.built.shaped, side, r.recipe.features.alienEyes.size);
            let checked = 0;
            for (const v of new Set(pack.body.source)) {
                const p = Array.from(r.built.shaped.subarray(v * 3, v * 3 + 3));
                if (Math.sign(p[0]) !== side) continue;
                const q = Body.almondEye.at(fr, p);
                if (q.rr > 0.9 || q.f < -0.08) continue;
                checked++;
                assert.ok(q.f < fr.surf(q.x, q.rr) + 0.001, f.id + ' skin protrudes through the lens');
            }
            assert.ok(checked > 40, f.id + ' sampled the socket skin');
        }
    }
});

test('Face framing fits the complete actual head at every orbit angle on wide and narrow viewports', () => {
    const scope = { window: {}, console, setTimeout, clearTimeout };
    vm.runInNewContext(source, scope);
    const proto = scope.window.Character3DBuilder.prototype;
    for (const f of inventory().filter(f => f.group === 'species' && ['alien', 'human'].includes(f.entity))) {
        const result = Model.build(pack, f.recipe, {}, { quality: 'preview', skinSize: 32, atlasSize: 32, hairBudget: 0.2 });
        for (const aspect of [0.5, 1.6]) {
            const b = Object.create(proto);
            b._view = { camera: { fov: 35, aspect } };
            b._faceFrame(result);
            const view = b._view, head = result.bones.findIndex(b => b.name === 'Head');
            b.recipe = result.recipe;
            view.height = result.height; view.bodyHeight = result.bodyHeight;
            view.target = { set(x, y, z) { this.value = [x, y, z]; } };
            b._draw = () => {};
            b._frame('face');
            assert.deepEqual(view.target.value, Array.from(view.faceCenter), 'Face centers the complete head');
            const half = Math.atan(Math.tan(35 * Math.PI / 360) * Math.min(1, aspect));
            assert.ok(Number.isFinite(view.faceDistance));
            const p = result.parts[0];
            for (let v = 0; v < p.positions.length / 3; v++) {
                let w = 0;
                for (let k = 0; k < 4; k++) if (p.joints[v * 4 + k] === head) w += p.weights[v * 4 + k];
                if (w < 0.85) continue;
                const radius = Math.hypot(...view.faceCenter.map((x, k) => p.positions[v * 3 + k] - x));
                assert.ok(radius < view.faceDistance * Math.sin(half), f.id + ' head clipped');
            }
        }
    }
});

test('thumbnail cameras keep tall hats, long weapons, boot shafts and claws inside the image', () => {
    require('../../runtime/libs/three.js');
    const THREE = global.THREE, scope = { window: {}, console, setTimeout, clearTimeout };
    vm.runInNewContext(source, scope);
    const fit = scope.window.Character3DBuilder.fitThumbnailFrame;
    const cases = [['head', 'wizardhat'], ['head', 'witchhat'], ['head', 'sunhat'], ['head', 'necklace'],
        ['body', 'staff'], ['body', 'spear'], ['body', 'umbrella'], ['hands', 'claws'], ['feet', 'boots'], ['feet', 'mh_viking_boots']];
    for (const headSize of [1, 2.2]) for (const [frame, id] of cases) {
        const garment = frame === 'feet';
        const result = Model.build(pack, { headSize, hair: { style: 'bald', brows: { style: 'none' } },
            ...(garment ? { outfit: [{ id }] } : { props: [{ id }] }) }, {}, { quality: 'preview', skinSize: 32, atlasSize: 32 });
        let bounds = Model.previewBounds(result)[frame];
        if (frame === 'body') {
            bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
            for (const part of result.parts) for (let v = 0; v < part.positions.length / 3; v++) for (let k = 0; k < 3; k++) {
                bounds.min[k] = Math.min(bounds.min[k], part.positions[v * 3 + k]); bounds.max[k] = Math.max(bounds.max[k], part.positions[v * 3 + k]);
            }
        }
        assert.ok(bounds, id + ' has focus bounds');
        const yaw = 0.45, pitch = frame === 'hands' ? 0.4 : frame === 'feet' ? 0.25 : 0.05;
        const fitted = fit(bounds, yaw, pitch, 28, 1), camera = new THREE.PerspectiveCamera(28, 1, 0.02, 60);
        const target = new THREE.Vector3(...fitted.target);
        camera.position.copy(target).add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(fitted.distance));
        camera.lookAt(target); camera.updateMatrixWorld();
        let checked = 0;
        for (const part of result.parts) for (let v = 0; v < part.positions.length / 3; v++) {
            const p = new THREE.Vector3(...part.positions.subarray(v * 3, v * 3 + 3));
            if ([p.x, p.y, p.z].some((x, k) => x < bounds.min[k] - 1e-6 || x > bounds.max[k] + 1e-6)) continue;
            checked++;
            p.project(camera);
            assert.ok(Math.abs(p.x) < 1 && Math.abs(p.y) < 1 && p.z > -1 && p.z < 1, id + ' is cropped');
        }
        assert.ok(checked > 50, id + ' projected actual mesh vertices');
    }
});

test('a Grey\'s skull is a teardrop leaning back from the chin', () => {
    const grey = inventory().find(f => f.group === 'species' && f.entity === 'alien');
    const built = Body.build(pack, Body.normalizeRecipe(grey.recipe)), P = built.shaped, head = pack.body.source.filter(v => P[v * 3 + 1] > 0);
    const top = head.reduce((a, v) => (P[v * 3 + 1] > P[a * 3 + 1] ? v : a), head[0]);
    const chin = head.filter(v => Math.abs(P[v * 3]) < 0.015 && P[v * 3 + 2] > 0).reduce((a, v) => (P[v * 3 + 1] > 1.2 && P[v * 3 + 1] < P[a * 3 + 1] ? v : a), top);
    assert.ok(P[top * 3 + 2] < P[chin * 3 + 2] - 0.04, 'the crown lies well behind the chin: the drop leans back');
    const eyeY = P[top * 3 + 1] - (P[top * 3 + 1] - P[chin * 3 + 1]) * 0.6;
    let wideHigh = 0, wideLow = 0;
    for (const v of head) { if (P[v * 3 + 2] > P[chin * 3 + 2] + 0.03) continue; const y = P[v * 3 + 1], x = Math.abs(P[v * 3]); if (y > eyeY + 0.07 && y < P[top * 3 + 1]) wideHigh = Math.max(wideHigh, x); else if (y > P[chin * 3 + 1] + 0.02 && y < eyeY - 0.02) wideLow = Math.max(wideLow, x); }
    assert.ok(wideHigh > wideLow, 'widest over the eyes, narrowing to the chin');
});

test('the lips stand forward of the skin above and below them, and meet at their corners', () => {
    const P = Body.build(pack, Body.normalizeRecipe({ gender: 0 })).shaped, U = Body.maskOf(pack, ['shape/upperLip-incr'], 2), L = Body.maskOf(pack, ['shape/lowerLip-incr'], 2), N = Body.vertexNormals(pack, P);
    const front = pack.body.source.filter(v => N[v * 3 + 2] > 0.2);
    const lips = front.filter(v => U[v] > 0.5 || L[v] > 0.5), w = lips.reduce((m, v) => Math.max(m, Math.abs(P[v * 3])), 0), top = lips.reduce((m, v) => Math.max(m, P[v * 3 + 1]), -9);
    const lipZ = lips.filter(v => Math.abs(P[v * 3]) < w * 0.3).reduce((m, v) => Math.max(m, P[v * 3 + 2]), -9);
    const philtrum = front.filter(v => Math.abs(P[v * 3]) < w * 0.15 && P[v * 3 + 1] > top + w * 0.25 && P[v * 3 + 1] < top + w * 0.5);
    assert.ok(philtrum.length && philtrum.every(v => P[v * 3 + 2] < lipZ), 'the upper lip stands out from the philtrum, not flush with it');
    // At the corner the lowest upper-lip row and the highest lower-lip row meet.
    const corner = (mask, pick) => pack.body.source.filter(v => mask[v] > 0.3 && Math.abs(P[v * 3]) > w * 0.75 && Math.abs(P[v * 3]) < w * 0.95).reduce((m, v) => pick(m, P[v * 3 + 1]), pick === Math.min ? 9 : -9);
    assert.ok(corner(U, Math.min) - corner(L, Math.max) < 0.0008, 'no slit to see through at the corner');
});
