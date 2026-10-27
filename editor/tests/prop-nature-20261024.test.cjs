'use strict';
// 3D Prop Builder › Nature: trees, bushes and plants, rocks and alien flora.
// Every type and preset builds whole and finite, within its family's triangle
// budget, standing on its origin; a seed gives the same model every time and
// another seed a different one; recipes survive saving and reopening; the
// saved GLB carries its wind loop; the page offers its few controls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const props = path.join(root, 'src', 'forge', 'Props');
global.THREE = require(path.join(root, 'node_modules', 'three'));
const Model = require(path.join(props, 'PropModel.js'));
const Catalog = require(path.join(props, 'PropCatalog.js'));
const Nature = require(path.join(props, 'NatureProp.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require(path.join(root, 'node_modules', 'pngjs'));
const encode = t => { const p = new PNG({ width: t.width, height: t.height }); p.data = Buffer.from(t.data); return PNG.sync.write(p); };

const BUDGET = { tree: 35000, plant: 12000, rock: 6000, alien: 30000 };
const familyOf = r => Nature.BY_ID.get(r.form)[4];
const presets = () => Nature.FORMS.flatMap(f => f[7].map(p => Nature.fromPreset(f[0], p[0])));
const tris = b => b.parts.reduce((n, p) => n + p.index.length / 3, 0);
const lowest = b => { let low = Infinity; for (const p of b.parts) for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]); return low; };
const hash = b => { let h = 0; for (const p of b.parts) for (let i = 0; i < p.positions.length; i += 7) h = (h * 31 + Math.round(p.positions[i] * 1000)) | 0; return h + ':' + tris(b); };
const finite = b => b.parts.every(p => ['positions', 'normals', 'uvs', 'weights'].every(k => !p[k] || p[k].every(Number.isFinite)) && (!p.colors || p.colors.every(Number.isFinite)));

test('the Nature family is in the catalog: four groups under one section, every form a type', () => {
    const tree = Catalog.grouped('');
    const nature = tree.find(g => g.category.id === 'nature');
    assert.ok(nature, 'a Nature section');
    assert.deepEqual(nature.groups.map(g => g.category.id), ['trees', 'plants', 'rocks', 'alien-flora']);
    for (const f of Nature.FORMS) {
        const t = Catalog.TYPES.find(x => x.id === 'nature-' + f[0]);
        assert.ok(t, f[0] + ' listed');
        assert.equal(t.kind, 'nature');
        assert.equal(Catalog.typeOf(Model.normalize(t.start())), t, f[0] + ' is what it starts as');
        assert.ok(Catalog.ICONS[t.icon], f[0] + ' has its icon');
        assert.ok(f[7].length >= 1 && f[5].length === 2, f[0] + ' has presets and two shape sliders');
    }
    assert.ok(Catalog.grouped('baobab').length === 1, 'a search finds a preset by name');
    assert.ok(Nature.FORMS.length >= 27, 'trees, plants, rocks and alien flora');
});

test('every preset builds whole and finite, within budget, standing on its origin', () => {
    for (const r of presets()) {
        const b = Model.build(r, {}, { textureSize: 1024 }), id = r.form + '/' + r.preset;
        assert.ok(b.parts.length && b.parts.every(p => p.index.length), id + ' has parts');
        assert.ok(finite(b), id + ' finite');
        const n = tris(b), budget = BUDGET[familyOf(r)];
        assert.ok(n > 200 && n <= budget, `${id}: ${n} triangles (budget ${budget})`);
        assert.ok(Math.abs(lowest(b)) < 1e-4, id + ' rests on y = 0');
        const offset = Model.sidecar(b).transform.offset;
        assert.ok(Math.abs(offset[1]) < 1e-3, id + ' model.json places its foot on the ground');
        assert.ok(b.height > r.size * 0.25 && b.height < r.size * 2.2, `${id}: ${b.height.toFixed(2)} m for a size of ${r.size} m`);
        assert.ok(b.placeSize > 0, id + ' says the size to place it at');
        for (const p of b.parts) {
            assert.equal(p.joints.length, p.positions.length / 3 * 4, id + ' skinned');
            for (let i = 0; i < p.weights.length; i += 4) assert.ok(Math.abs(p.weights[i] + p.weights[i + 1] + p.weights[i + 2] + p.weights[i + 3] - 1) < 1e-4);
            for (const k of ['texture', 'normalTexture', 'emissiveTexture']) if (p[k]) assert.ok(b.textures[p[k]], `${id}: ${p.name} ${k} ${p[k]} is in the build`);
        }
        for (const [name, t] of Object.entries(b.textures)) {
            assert.ok(t.width <= 1024 && t.height <= 1024 && t.data.length === t.width * t.height * 4, id + ' ' + name);
            assert.equal(/normal/.test(name), /-normal\.png$/.test(name), name + ': a normal map says so in its name (the view reads it as data, not color)');
        }
        // Index range.
        for (const p of b.parts) { const n3 = p.positions.length / 3; assert.ok(p.index.every(i => i < n3), id + ' ' + p.name + ' indices in range'); }
    }
});

test('a seed gives the same model every time, another seed another; quick builds stay within budget', () => {
    for (const r of presets()) {
        const a = Model.build(r, {}, { textureSize: 1024 }), b = Model.build(JSON.parse(JSON.stringify(r)), {}, { textureSize: 1024 });
        assert.equal(hash(a), hash(b), r.form + '/' + r.preset + ' is deterministic');
        const c = Model.build(Object.assign({}, r, { seed: r.seed + 977 }), {}, { textureSize: 1024 });
        assert.notEqual(hash(a), hash(c), r.form + '/' + r.preset + ' changes with Shuffle');
        const q = Model.build(r, {}, { textureSize: 512 });
        assert.ok(finite(q) && tris(q) <= BUDGET[familyOf(r)], r.form + '/' + r.preset + ' quick');
    }
});

test('every season, stone, cover and palette builds, and sliders at their ends stay sound', () => {
    for (const f of Nature.FORMS) {
        const base = Nature.fromPreset(f[0], f[7][0][0]), family = f[4];
        const variants = family === 'tree' || family === 'plant' ? Nature.SEASONS.map(([season]) => ({ season }))
            : family === 'rock' ? Nature.COVERS.map(([cover], i) => ({ cover, stone: Nature.STONES[i % Nature.STONES.length][0] }))
                : Nature.PALETTES.slice(0, 3).map(([palette]) => ({ palette, glow: 0 }));
        variants.push({ spread: 0, character: 0, size: f[6][0] }, { spread: 1, character: 1, size: f[6][1] });
        for (const v of variants) {
            const r = Model.normalize(Object.assign({}, base, v)), b = Model.build(r, {}, { textureSize: 512 });
            const id = f[0] + ' ' + JSON.stringify(v);
            assert.ok(finite(b), id + ' finite');
            assert.ok(tris(b) > 0 && tris(b) <= BUDGET[family], `${id}: ${tris(b)} triangles`);
            assert.ok(Math.abs(lowest(b)) < 1e-4, id + ' on the ground');
        }
    }
});

test('recipes are normalized, survive saving and reopening, and Randomize keeps them valid', () => {
    for (const r of presets()) {
        assert.deepEqual(Model.normalize(r), r, 'normalized');
        const reopened = Model.normalize(JSON.parse(JSON.stringify({ builder: 'prop', version: 1, recipe: r })).recipe);
        assert.deepEqual(reopened, r, r.preset + ' reopens as saved');
        assert.equal(hash(Model.build(reopened)), hash(Model.build(r)), r.preset + ' rebuilds the same');
    }
    // Junk in, a sound recipe out.
    const junk = Model.normalize({ kind: 'nature', form: 'nope', preset: 7, size: 'x', spread: 9, character: -3, season: 'monsoon', sway: 'yes', seed: -4 });
    assert.equal(junk.form, 'broadleaf'); assert.equal(junk.spread, 1); assert.equal(junk.character, 0); assert.equal(junk.season, 'summer'); assert.equal(junk.seed, 1);
    // A preset picked keeps the seed and sway; picking resets the sliders to the preset's own.
    const picked = Nature.fromPreset('broadleaf', 'ancient', { seed: 42, sway: false });
    assert.equal(picked.seed, 42); assert.equal(picked.sway, false); assert.equal(picked.size, 14);
    const kind = Model.KINDS.find(k => k.id === 'nature');
    let changed = 0;
    for (let s = 1; s <= 30; s++) {
        const f = Nature.FORMS[s % Nature.FORMS.length], from = Nature.fromPreset(f[0], f[7][0][0]), scope = ['all', 'shape', 'colors'][s % 3];
        const r = kind.random(s * 7919, from, scope);
        assert.deepEqual(Model.normalize(r), r);
        assert.equal(r.form, from.form, 'Randomize keeps the type');
        if (scope === 'colors') { assert.equal(r.seed, from.seed); assert.equal(r.size, from.size); }
        if (JSON.stringify(r) !== JSON.stringify(from)) changed++;
        const b = Model.build(r, {}, { textureSize: 512 });
        assert.ok(finite(b) && tris(b) <= BUDGET[familyOf(r)], `random ${s} ${r.form}`);
    }
    assert.ok(changed >= 24, 'Randomize changes the recipe');
});

test('the wind: plants sway on a wind bone in a looping clip that model.json plays; rocks stand still', async () => {
    const oak = Model.build(Nature.fromPreset('broadleaf', 'oak'));
    assert.deepEqual(oak.bones.map(b => b.name), ['Prop', 'Wind']);
    assert.equal(oak.clips.length, 1);
    const clip = oak.clips[0], track = clip.tracks[0];
    assert.equal(clip.name, 'Sway'); assert.equal(track.bone, 1); assert.equal(track.path, 'rotation');
    // A seamless loop of small turns: first key equals the last, every key a unit quaternion within 3 degrees.
    const q = track.values, n = q.length / 4;
    for (let k = 0; k < 4; k++) assert.ok(Math.abs(q[k] - q[(n - 1) * 4 + k]) < 1e-6, 'loops');
    for (let i = 0; i < n; i++) { const w = q[i * 4 + 3]; assert.ok(Math.abs(Math.hypot(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], w) - 1) < 1e-5); assert.ok(2 * Math.acos(Math.min(1, w)) < 3 * Math.PI / 180); }
    // The foot does not move; the crown does.
    const bark = oak.parts.find(p => /Bark$/.test(p.name));
    let footMax = 0, topMin = 1;
    for (let i = 0; i < bark.positions.length / 3; i++) { const y = bark.positions[i * 3 + 1], w = bark.weights[i * 4 + 1]; if (y < 0.05) footMax = Math.max(footMax, w); }
    const leaves = oak.parts.find(p => /Leaves$/.test(p.name));
    for (let i = 0; i < leaves.positions.length / 3; i++) if (leaves.positions[i * 3 + 1] > oak.height * 0.8) topMin = Math.min(topMin, leaves.weights[i * 4 + 1]);
    assert.ok(footMax < 0.01, 'the trunk foot holds still');
    assert.ok(topMin > 0.4, 'the crown moves with the wind');
    assert.deepEqual(Model.sidecar(oak).animations, [{ type: 'clip', trigger: 'always', name: 'Sway', clip: 'Sway', part: '' }]);
    const still = Model.build(Object.assign(Nature.fromPreset('broadleaf', 'oak'), { sway: false }));
    assert.equal(still.clips.length, 0); assert.equal(still.bones.length, 1); assert.equal(Model.sidecar(still).animations, undefined);
    const rock = Model.build(Nature.fromPreset('boulder', 'rounded'));
    assert.equal(rock.clips.length, 0, 'a rock has no wind');
    assert.equal(Model.moves(oak), false, 'nothing is simulated: the clip plays as a container clip does');
    // The saved GLB carries the clip and the pictures, and reads back.
    const glb = await Model.toGlb(oak, 'Oak', encode);
    const { json } = Optimizer.parseGlb(glb);
    assert.deepEqual(json.animations.map(a => a.name), ['Sway']);
    assert.ok(json.images.length >= 3, 'bark, its normal map and the leaves');
    const leafMaterial = json.materials.find(m => /Leaves$/.test(m.name));
    assert.equal(leafMaterial.alphaMode, 'MASK');
    assert.ok(json.materials.find(m => /Bark$/.test(m.name)).normalTexture, 'bark relief');
    const runes = Model.build(Nature.fromPreset('standing', 'runestone'));
    const rjson = Optimizer.parseGlb(await Model.toGlb(runes, 'Runes', encode)).json;
    assert.ok(rjson.materials.some(m => m.emissiveFactor && m.emissiveFactor.some(v => v > 0.1)), 'runes glow');
});

test('leaf cards are seen from both sides with one set of outward normals', () => {
    const oak = Model.build(Nature.fromPreset('broadleaf', 'oak'));
    const leaves = oak.parts.find(p => /Leaves$/.test(p.name));
    assert.ok(!leaves.doubleSided, 'no two-sided material that would turn the shading normal over');
    assert.ok(leaves.cutout, 'alpha-cut');
    const I = leaves.index, faces = new Set();
    for (let t = 0; t < I.length; t += 3) faces.add([I[t], I[t + 1], I[t + 2]].join());
    let twins = 0;
    for (let t = 0; t < I.length; t += 3) if (faces.has([I[t], I[t + 2], I[t + 1]].join())) twins++;
    assert.equal(twins, I.length / 3, 'every face has its back');
});

test('rocks: angular stone is faceted, worn stone smooth; covers rise out of the top', () => {
    const angular = Model.build(Nature.fromPreset('boulder', 'angular')), stone = angular.parts.find(p => /Stone$/.test(p.name));
    // Faceted: three points of a face share its normal.
    let flat = 0;
    for (let t = 0; t < stone.index.length; t += 3) { const n = [0, 1, 2].map(k => Array.from(stone.normals.subarray(stone.index[t + k] * 3, stone.index[t + k] * 3 + 3))); if (n.every(v => Math.abs(v[0] - n[0][0]) + Math.abs(v[1] - n[0][1]) + Math.abs(v[2] - n[0][2]) < 1e-4)) flat++; }
    assert.ok(flat / (stone.index.length / 3) > 0.95, 'angular facets');
    const mossy = Model.build(Nature.fromPreset('boulder', 'rounded')), moss = mossy.parts.find(p => /Moss$/.test(p.name));
    assert.ok(moss && moss.cutout, 'a moss shell');
    let up = 0;
    for (let i = 1; i < moss.normals.length; i += 3) if (moss.normals[i] > 0) up++;
    assert.ok(up / (moss.normals.length / 3) > 0.8, 'moss sits on the upper faces');
    const none = Model.build(Object.assign(Nature.fromPreset('boulder', 'rounded'), { cover: 'none' }));
    assert.ok(!none.parts.some(p => /(Moss|Snow|Sand)$/.test(p.name)));
});

// ── the page ────────────────────────────────────────────────────────────
function page() {
    const box = { console, Math, JSON, Map, Set, Promise, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array, Int32Array, Uint8ClampedArray, setTimeout, clearTimeout };
    box.window = box; box.globalThis = box;
    for (const name of ['THREE', 'RRPropCloth', 'RRPropPaint', 'RRPropMesh', 'RRPropRandom', 'RRPropCatalog', 'RRFlagDesign', 'RRFlagProp', 'RRPropModel', 'RRNatureProp']) if (globalThis[name]) box[name] = globalThis[name];
    const store = new Map();
    box.sessionStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    box.rrEscapeHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    globalThis.rrEscapeHtml = box.rrEscapeHtml;
    box.document = { createElement: () => ({ getContext: () => null, style: {} }) };
    vm.createContext(box);
    vm.runInContext(fs.readFileSync(path.join(props, 'PropBuilder.js'), 'utf8') + '\n;globalThis.PB = PropBuilder;', box, { filename: 'PropBuilder.js' });
    return box;
}

test('the page: presets as tiles, size and two sliders, Shuffle, and the look, few fields each', () => {
    const box = page(), builder = new box.PB(), ui = Catalog.UI.nature;
    assert.deepEqual(ui.tabs.map(t => t[0]), ['design']);
    for (const f of Nature.FORMS) {
        builder.recipe = Nature.fromPreset(f[0], f[7][0][0]);
        const html = String(ui.panel.call(builder, 'design'));
        const sliders = [...html.matchAll(/type="range" data-path="([^"]+)"/g)].map(m => m[1]);
        const selects = [...html.matchAll(/<select[^>]*data-path="([^"]+)"/g)].map(m => m[1]);
        assert.deepEqual(sliders.slice(0, 3), ['size', 'spread', 'character'], f[0]);
        assert.ok(sliders.length + selects.length <= 7, `${f[0]}: few fields (${sliders.concat(selects).join(', ')})`);
        assert.ok(html.includes('data-act="nature-shuffle"'), f[0] + ' Shuffle');
        for (const p of f[7]) assert.ok(html.includes(`data-act="nature-preset" data-id="${p[0]}"`), f[0] + ' tile ' + p[0]);
        assert.ok(html.includes(f[5][0]) && html.includes(f[5][1]), f[0] + ' names its sliders');
        if (f[4] === 'rock') assert.ok(selects.includes('stone') && selects.includes('cover'), f[0]);
        else assert.ok(html.includes('data-path="sway"'), f[0] + ' sway');
        if (f[4] === 'alien') assert.ok(selects.includes('palette') && sliders.includes('glow'));
        if (f[4] === 'tree') assert.ok(selects.includes('season'));
    }
    // The page's actions: a preset tile replaces the recipe keeping its seed; Shuffle changes only the seed.
    const seen = [];
    builder._replace = r => seen.push(r);
    builder.recipe = Nature.fromPreset('broadleaf', 'oak', { seed: 9 });
    ui.act.call(builder, 'nature-preset', { dataset: { id: 'maple' } });
    assert.equal(seen[0].preset, 'maple'); assert.equal(seen[0].seed, 9); assert.equal(seen[0].season, 'autumn');
    ui.act.call(builder, 'nature-shuffle', { dataset: {} });
    assert.notEqual(seen[1].seed, 9); assert.equal(seen[1].preset, 'oak'); assert.equal(seen[1].size, builder.recipe.size);
});

test('the editor page loads the Nature files before the builder', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'), at = f => html.indexOf(`src/forge/Props/${f}.js`);
    const order = ['PropModel', 'NatureKit', 'NatureTexture', 'TreeConstruction', 'PlantConstruction', 'RockConstruction', 'AlienFlora', 'NatureProp', 'PropBuilder'].map(at);
    order.forEach(i => assert.ok(i > 0));
    assert.deepEqual(order, order.slice().sort((a, b) => a - b));
    assert.ok(html.indexOf('src/utils/QuadricDecimator.js') < order[1], 'the decimator first');
});
