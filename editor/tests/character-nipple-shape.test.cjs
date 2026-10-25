'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const dir = path.join(__dirname, '../src/forge/Character3D');
const Body = require(path.join(dir, 'HumanBody.js'));
const Detail = require(path.join(dir, 'CharacterDetail.js'));
const Model = require(path.join(dir, 'CharacterModel.js'));
let pack, ids;
test.before(async () => { pack = await Body.loadPack(); ids = [...new Set(pack.body.source)]; });
const at = (P, v) => Array.from(P.subarray(v * 3, v * 3 + 3));
const distance = (a, b) => Math.hypot(...a.map((x, k) => x - b[k]));
const profiles = [
    { gender: 0 }, { gender: 1 }, { gender: 0, weight: 1, cup: 1 },
    { gender: 1, muscle: 1 }, { gender: 0, cup: 2, firmness: -0.2 },
    { gender: 0, height: -0.6, weight: -1 }, { gender: 1, height: 1.8, muscle: 2.5 }
];

test('zero nipple size removes the old pointed surface instead of leaving a second modeled tip', () => {
    const nb = Body.neighbors(pack);
    for (const settings of profiles) {
        const P = Body.shape(pack, { age: 28, ...settings, anatomy: { detail: true, nipple: 0 } });
        const normals = Body.vertexNormals(pack, P);
        let largest = 0;
        for (const nip of Body.anatomyFields(pack).nipples) {
            const center = at(pack.positions, nip.v);
            for (const v of ids.filter(v => distance(at(pack.positions, v), center) < 0.01)) {
                for (let i = nb.offsets[v]; i < nb.offsets[v + 1]; i++) {
                    const u = nb.flat[i];
                    const dot = [0, 1, 2].reduce((s, k) => s + normals[v * 3 + k] * normals[u * 3 + k], 0);
                    largest = Math.max(largest, Math.acos(Math.max(-1, Math.min(1, dot))));
                }
            }
        }
        assert.ok(largest < 26 * Math.PI / 180, `smooth skin without an angular old tip: ${JSON.stringify(settings)}, ${largest * 180 / Math.PI} degrees`);
    }
});

test('the nipple is centered, symmetric and outward across contrasting adult bodies and size settings', () => {
    const base = pack.positions;
    const mirror = new Map(ids.map(v => [at(base, v).map(q => q.toFixed(5)).join(), v]));
    for (const settings of profiles) for (const size of [0.3, 1, 3]) {
        const recipe = { age: 28, ...settings, anatomy: { detail: true, nipple: size } };
        const P = Body.shape(pack, recipe), zero = Body.shape(pack, { ...recipe, anatomy: { detail: true, nipple: 0 } });
        const N = Body.vertexNormals(pack, zero);
        assert.ok(P.every(Number.isFinite));
        for (const nip of Body.anatomyFields(pack).nipples) {
            const center = at(base, nip.v), normal = at(N, nip.v);
            const projection = v => at(P, v).reduce((s, q, k) => s + (q - zero[v * 3 + k]) * normal[k], 0);
            let checked = 0;
            for (const v of ids.filter(v => distance(at(base, v), center) < 0.022)) {
                assert.ok(projection(v) <= projection(nip.v) + 2e-7, 'the new tip peaks at the pigment center');
                const other = mirror.get([-base[v * 3], base[v * 3 + 1], base[v * 3 + 2]].map(q => q.toFixed(5)).join());
                if (other === undefined) continue;
                assert.ok(distance(at(P, v), [-P[other * 3], P[other * 3 + 1], P[other * 3 + 2]]) < 2e-6, 'no vertex-order bias between left and right');
                checked++;
            }
            assert.ok(checked > 40);
            assert.ok(projection(nip.v) > 0.0001 && projection(nip.v) < 0.006, 'the tip projects outward at a restrained scale');
            const source = pack.body.source, index = pack.body.index;
            for (let t = 0; t < index.length; t += 3) {
                const vertices = [source[index[t]], source[index[t + 1]], source[index[t + 2]]];
                if (!vertices.every(v => distance(at(base, v), center) < 0.01)) continue;
                const [a, b, c] = vertices.map(v => at(P, v)), ab = b.map((q, k) => q - a[k]), ac = c.map((q, k) => q - a[k]);
                const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
                assert.ok(cross.reduce((s, q, k) => s + q * normal[k], 0) > 0, 'no folded or collapsed tip faces');
            }
        }
    }
});

test('areola size changes pigment coverage without changing the nipple projection', () => {
    for (const gender of [0, 1]) {
        const small = Body.shape(pack, { age: 28, gender, anatomy: { detail: true, areola: 0.4 } });
        const large = Body.shape(pack, { age: 28, gender, anatomy: { detail: true, areola: 2.5 } });
        assert.deepEqual(large, small);
    }
});

test('selected areolas carry localized surface relief without repainting it for projection changes', () => {
    const cache = {}, options = { quality: 'preview', skinSize: 32 }, recipe = { age: 30, gender: 0, hair: { style: 'bald' }, outfit: [], anatomy: { detail: true } };
    const a = Model.build(pack, recipe, cache, options);
    const patch = a.parts.find(p => p.name === 'Areolas'), normal = a.textures['areola_n.png'];
    assert.equal(patch.normalTexture, 'areola_n.png');
    assert.equal(normal.width, 512); assert.equal(a.textures['areola.png'].width, 512);
    let varied = 0;
    for (let i = 0; i < normal.data.length; i += 4) {
        assert.ok(normal.data[i + 2] >= 128);
        if (Math.abs(normal.data[i] - 128) > 3 || Math.abs(normal.data[i + 1] - 128) > 3) varied++;
    }
    assert.ok(varied > 1000, 'resolved glands and fine folds');
    const raised = Model.build(pack, { ...recipe, anatomy: { detail: true, nippleProjection: 10 } }, cache, options);
    assert.equal(raised.textures['areola_n.png'], normal);
    assert.notDeepEqual(raised.parts.find(p => p.name === 'Areolas').positions, patch.positions);
    const flat = Detail.areolaTexture('#c69c7f', { size: 128 });
    assert.equal(flat.width, 128); assert.ok(!flat.normal);
});

test('nipple pigment has fine grain without an offset painted light, and zero size removes it', () => {
    for (const skin of ['#f1d3bd', '#c69c7f', '#5e3b26']) {
        const tip = Detail.areolaTexture(skin, { nippleScale: 1 });
        const flat = Detail.areolaTexture(skin, { nippleScale: 0 });
        let lo = Infinity, hi = -Infinity, difference = 0, count = 0;
        for (let y = 0; y < tip.height; y++) for (let x = 0; x < tip.width; x++) {
            if (Math.hypot((x + 0.5) / tip.width - 0.5, (y + 0.5) / tip.height - 0.5) > 0.03) continue;
            const i = (y * tip.width + x) * 4;
            const light = (tip.data[i] + tip.data[i + 1] + tip.data[i + 2]) / 3;
            lo = Math.min(lo, light); hi = Math.max(hi, light);
            difference += flat.data[i] + flat.data[i + 1] + flat.data[i + 2] - tip.data[i] - tip.data[i + 1] - tip.data[i + 2];
            count++;
        }
        assert.ok(hi - lo < 8, 'the tip does not contain a second painted highlight');
        assert.ok(difference / count > 10, 'zero does not fall back to the default pigmented tip');
    }
});

test('model caches refresh pigment scale with areola size and keep its material continuous with the skin', () => {
    const cache = {}, options = { quality: 'preview', static: true, skinSize: 32 };
    const recipe = { age: 28, gender: 0, outfit: [], hair: { style: 'bald' }, anatomy: { detail: true, areola: 0.6 } };
    const small = Model.build(pack, recipe, cache, options);
    recipe.anatomy.areola = 2;
    const large = Model.build(pack, recipe, cache, options), fresh = Model.build(pack, recipe, {}, options);
    assert.notEqual(small.textures['areola.png'], large.textures['areola.png'], 'resizing cannot reuse the old relative tip diameter');
    assert.deepEqual(large.textures['areola.png'].data, fresh.textures['areola.png'].data);
    assert.deepEqual(small.parts[0].positions, large.parts[0].positions);
    assert.equal(large.parts.find(p => p.name === 'Areolas').roughness, large.parts[0].roughness);
});

test('saved GLBs retain the refined skin surface, centered overlay and pigment', async () => {
    const { PNG } = require('pngjs');
    const { parseGlb } = require('../src/utils/GlbOptimizer.js');
    for (const gender of [0, 1]) {
        const built = Model.build(pack, { age: 28, gender, outfit: [], hair: { style: 'bald' }, anatomy: { detail: true } }, {},
            { quality: 'preview', static: true, skinSize: 32 });
        const glb = await Model.toGlb(built, 'Nipple refinement', texture => {
            const png = new PNG({ width: texture.width, height: texture.height });
            png.data = Buffer.from(texture.data);
            return new Uint8Array(PNG.sync.write(png));
        });
        const { json, bin } = parseGlb(glb);
        const floats = accessorIndex => {
            const accessor = json.accessors[accessorIndex], view = json.bufferViews[accessor.bufferView];
            const bytes = bin.subarray((view.byteOffset || 0) + (accessor.byteOffset || 0), (view.byteOffset || 0) + (accessor.byteOffset || 0) + accessor.count * 12);
            return Float32Array.from({ length: accessor.count * 3 }, (_, i) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat32(i * 4, true));
        };
        for (const name of ['Body', 'Areolas']) {
            const mesh = json.meshes.find(m => m.name === name), part = built.parts.find(p => p.name === name);
            assert.ok(mesh, name);
            assert.deepEqual(floats(mesh.primitives[0].attributes.POSITION), part.positions);
            assert.ok(json.nodes.some(n => n.mesh === json.meshes.indexOf(mesh) && n.skin != null), 'detail stays skinned');
        }
        const image = json.images.find(i => i.name === 'areola.png'), view = json.bufferViews[image.bufferView];
        const decoded = PNG.sync.read(Buffer.from(bin.subarray(view.byteOffset, view.byteOffset + view.byteLength)));
        assert.deepEqual(new Uint8Array(decoded.data), built.textures['areola.png'].data);
    }
});
