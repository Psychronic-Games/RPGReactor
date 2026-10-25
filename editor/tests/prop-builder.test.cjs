'use strict';
// Forge › Prop Builder: one recipe builds a prop; a flag's cloth is simulated in the tool and baked into a looping
// "Wave" clip on a grid of bones (RRPropCloth), which Save writes into a skinned GLB with its model.json.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
global.THREE = require(path.join(root, 'node_modules', 'three'));
const props = path.join(root, 'src', 'forge', 'Props');
const Cloth = require(path.join(props, 'PropCloth.js'));
const Flag = require(path.join(props, 'FlagProp.js'));
const Design = require(path.join(props, 'FlagDesign.js'));
const Model = require(path.join(props, 'PropModel.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require(path.join(root, 'node_modules', 'pngjs'));

const encode = t => { const p = new PNG({ width: t.width, height: t.height }); p.data = Buffer.from(t.data); return PNG.sync.write(p); };
const finite = (list, what) => { for (let i = 0; i < list.length; i++) assert.ok(Number.isFinite(list[i]), `${what}[${i}] = ${list[i]}`); };

test('still prop albedo has no fixed light baked into opposite faces', () => {
    const Mesh = require(path.join(props, 'PropMesh.js'));
    const part = { positions: new Float32Array(9), normals: Float32Array.of(1, 0, 0, -1, 0, 0, 0, -1, 0), color: '#c08040' };
    Mesh.shade(part);
    const base = [0xc0, 0x80, 0x40].map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    for (let v = 0; v < 3; v++) for (let c = 0; c < 3; c++) assert.ok(Math.abs(part.colors[v * 3 + c] - base[c]) < 1e-7);
    part.texture = 'paint.png';
    Mesh.shade(part);
    assert.ok(part.colors.every(c => c === 1), 'textured props keep the picture albedo');
});

test('a wall bracket preserves editable mounting height in geometry and saved placement', () => {
    const low = Model.build({ kind: 'flag', pole: { type: 'bracket', mount: 1.1 } }, {}, { textureSize: 64 });
    const high = Model.build({ kind: 'flag', pole: { type: 'bracket', mount: 3.6 } }, {}, { textureSize: 64 });
    assert.deepEqual(low.wall, { normal: [1, 0, 0], at: 0 });
    assert.equal(Flag.normalize({ pole: { type: 'bracket' } }).pole.mount, 2.4, 'old recipes retain their height');
    for (let pi = 0; pi < low.parts.length; pi++) {
        const a = low.parts[pi].positions, b = high.parts[pi].positions;
        assert.equal(a.length, b.length);
        for (let i = 0; i < a.length; i++) assert.ok(Math.abs(b[i] - a[i] - (i % 3 === 1 ? 2.5 : 0)) < 1e-5, low.parts[pi].name + ' moves with the mount');
    }
    assert.ok(Math.abs(Model.sidecar(high).transform.offset[1] - Model.sidecar(low).transform.offset[1] - 2.5) < 1e-4);
});

/** An accessor's numbers out of a parsed GLB. */
function accessorData(json, bin, index) {
    const a = json.accessors[index], v = json.bufferViews[a.bufferView];
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[a.type];
    const Type = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
    return new Type(bin.buffer.slice(bin.byteOffset + v.byteOffset + (a.byteOffset || 0), bin.byteOffset + v.byteOffset + (a.byteOffset || 0) + a.count * size * Type.BYTES_PER_ELEMENT));
}

/** A flag built, its loop baked, built again with the loop. */
function baked(recipe) {
    const first = Model.build(Object.assign({ kind: 'flag' }, recipe), {}, { textureSize: 512 });
    const loop = Model.bake(first);
    return Model.build(Object.assign({ kind: 'flag' }, recipe), {}, { textureSize: 512, loop });
}

test('a flag recipe is completed and kept in range', () => {
    const r = Model.normalize({ kind: 'flag', pole: { type: 'metal', height: 99, finial: 'gargoyle' }, cloth: { width: -3, aspect: '1:2', fabric: 'denim' }, wind: { strength: 7, direction: 500 }, design: { layout: 'tartan', colors: ['red', '#123456'] } });
    assert.equal(r.kind, 'flag');
    assert.equal(r.pole.height, 14);
    assert.equal(r.pole.finial, 'ball');
    assert.equal(r.cloth.width, 0.15);
    assert.equal(r.cloth.height, 0.075, 'a shape sets the height from the width');
    // No longer than its pole carries: a shape keeps its proportions, a custom height is cut short.
    const tall = Model.normalize({ kind: 'flag', pole: { type: 'staff', height: 2 }, cloth: { width: 1, aspect: 'banner' } });
    assert.ok(Math.abs(tall.cloth.height - Flag.clothCap('staff', 2)) < 1e-3 && Math.abs(tall.cloth.height / tall.cloth.width - 4.5) < 0.02, JSON.stringify(tall.cloth));
    assert.equal(Model.normalize({ kind: 'flag', pole: { type: 'staff', height: 2 }, cloth: { aspect: 'custom', width: 1, height: 7 } }).cloth.height, Flag.clothCap('staff', 2));
    assert.equal(r.cloth.fabric, 'cotton');
    assert.equal(r.wind.strength, 1);
    assert.equal(r.wind.direction, 90);
    // A round-1 design: its layout read as the field's (an unknown one is solid), its colors kept where they are colors.
    assert.equal(r.design.field.layout, 'solid');
    assert.equal(r.design.field.colors[0], Design.FIELD.colors[0], 'a color that is not one stays the default');
    assert.equal(r.design.field.colors[1], '#123456');
    // An empty recipe is the default flag, and normalizing twice changes nothing.
    assert.deepEqual(Model.normalize({}), Model.normalize(Model.normalize({})));
    assert.equal(Model.normalize({}).design.layers[0].shape, 'eagle');
    // A height of its own is kept only with the Custom shape.
    assert.equal(Model.normalize({ kind: 'flag', cloth: { width: 1, aspect: 'custom', height: 1.7 } }).cloth.height, 1.7);
    // Each pole type starts from its own height, cloth and finial.
    for (const p of Flag.POLES) {
        const w = Flag.withPole({}, p.id);
        assert.equal(w.pole.type, p.id);
        assert.equal(w.pole.height, p.height[2]);
        assert.equal(w.cloth.width, p.width);
    }
});

test('every pole type, finial, fabric and design builds whole, within budget', () => {
    const recipes = [];
    for (const p of Flag.POLES) for (const [finial] of Flag.FINIALS) recipes.push({ pole: { type: p.id, finial } });
    for (const [fabric] of Flag.FABRICS) recipes.push({ cloth: { fabric, wear: 1 } });
    for (const l of Design.LAYOUTS) for (const [shape] of Design.SHAPES) recipes.push({ design: { field: { layout: l.id, count: 5, rows: 3, cols: 4 }, layers: [{ shape, place: 'canton', repeat: 'ring', count: 6 }] } });
    for (const p of Design.PRESETS) recipes.push({ design: p.design });
    for (const aspect of Flag.ASPECTS.map(a => a[0])) recipes.push({ cloth: { aspect, width: 3 } });
    const cache = {};
    for (const recipe of recipes) {
        const result = Model.build(Object.assign({ kind: 'flag' }, recipe), cache, { textureSize: 256 });
        const what = JSON.stringify(recipe);
        const s = Model.stats(result);
        assert.ok(s.triangles <= 8000, what + ': ' + s.triangles + ' triangles');
        assert.ok(s.bones <= 128, what + ': ' + s.bones + ' bones');
        for (const part of result.parts) {
            const n = part.positions.length / 3;
            finite(part.positions, what + ' ' + part.name + ' positions');
            finite(part.normals, what + ' ' + part.name + ' normals');
            assert.equal(part.normals.length, n * 3);
            assert.equal(part.joints.length, n * 4);
            for (let v = 0; v < n; v++) {
                const w = part.weights[v * 4] + part.weights[v * 4 + 1] + part.weights[v * 4 + 2] + part.weights[v * 4 + 3];
                assert.ok(Math.abs(w - 1) < 1e-5, what + ' weights of ' + v);
                for (let k = 0; k < 4; k++) assert.ok(part.joints[v * 4 + k] < result.bones.length);
            }
            for (const i of part.index) assert.ok(i < n);
        }
        // The pole stands on the ground (the bracket's wall plate is up its wall).
        if (result.recipe.pole.type !== 'bracket') {
            let low = Infinity;
            for (const p of result.parts.slice(1)) for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]);
            assert.ok(Math.abs(low) < 1e-6, what + ' foot at ' + low);
        }
    }
});

test('the cloth picture shows the design, its emblem and, worn, its holes; pictures stay at 1024 or less', () => {
    const r = Model.build({ kind: 'flag', design: { layout: 'solid', colors: ['#202080'], emblem: { shape: 'circle', color: '#e0e020', size: 0.6, place: 'center' } } }, {}, {});
    const pic = r.textures['cloth.png'];
    assert.ok(pic.width <= 1024 && pic.height <= 1024 && r.textures['cloth_normal.png'].width <= 1024);
    const at = (u, v) => { const o = (Math.floor(v * pic.height) * pic.width + Math.floor(u * pic.width)) * 4; return [pic.data[o], pic.data[o + 1], pic.data[o + 2], pic.data[o + 3]]; };
    const middle = at(0.5, 0.5), field = at(0.8, 0.2);
    assert.ok(middle[0] > 150 && middle[2] < 100, 'the emblem is yellow: ' + middle);
    assert.ok(field[2] > field[0] + 40, 'the field is blue: ' + field);
    assert.ok(field[3] === 255 && !r.parts[0].cutout, 'sound cloth is solid');
    const worn = Model.build({ kind: 'flag', cloth: { fabric: 'tattered', wear: 1 } }, {}, { textureSize: 512 });
    const wp = worn.textures['cloth.png'];
    let clear = 0;
    for (let i = 3; i < wp.data.length; i += 4) if (wp.data[i] < 128) clear++;
    assert.ok(clear > wp.data.length / 4 * 0.02, 'holes and a frayed fly: ' + clear);
    assert.ok(worn.parts[0].cutout);
    assert.ok(worn.cloth.setup.holes.some(h => h), 'the air goes through the holes');
    // A picture from the project is the whole design, stretched over the cloth.
    const image = { width: 2, height: 2, data: new Uint8Array([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255]) };
    const pictured = Model.build({ kind: 'flag', design: { layout: 'image', image: 'Kingdom' } }, {}, { textureSize: 256, images: { Kingdom: image } });
    const pp = pictured.textures['cloth.png'], top = (Math.floor(pp.height * 0.1) * pp.width + Math.floor(pp.width * 0.9)) * 4;
    assert.ok(pp.data[top + 1] > 150 && pp.data[top] < 100, 'the picture\'s upper right is green');
    assert.equal(Model.build({ kind: 'flag', design: { layout: 'image', image: 'Missing' } }, {}, { textureSize: 256 }).imageMissing, true);
});

test('the cloth flies out in a wind and hangs in a calm, with nothing undefined', () => {
    const spread = recipe => {
        const r = Model.build(Object.assign({ kind: 'flag' }, recipe), {}, { textureSize: 128 });
        const sim = Cloth.create(r.cloth.setup);
        Cloth.advance(sim, 3);
        finite(sim.pos, 'positions');
        let far = 0;
        for (let i = 0; i < sim.pos.length; i += 3) far = Math.max(far, sim.pos[i]);
        return far;
    };
    const storm = spread({ wind: { strength: 0.9 } }), calm = spread({ wind: { strength: 0 } });
    assert.ok(storm > 1.3, 'a storm holds the fly out: ' + storm);
    assert.ok(calm < 0.9, 'a calm lets it hang: ' + calm);
});

test('the baked loop closes on itself, keeps the hoist pinned, and plays in the GLB as Wave', async () => {
    for (const recipe of [{ wind: { strength: 0.45, gust: 0.6 } }, { pole: { type: 'crossbar' }, cloth: { fabric: 'silk' } }]) {
        const result = baked(recipe);
        const loop = result.loop, grid = result.cloth.grid, F = loop.times.length;
        assert.equal(F, Flag.LOOP * 30 + 1);
        assert.ok(Math.abs(loop.times[F - 1] - Flag.LOOP) < 1e-6);
        for (let b = 0; b < grid.count; b++) {
            finite(loop.T[b], 'translation ' + b); finite(loop.Q[b], 'rotation ' + b);
            for (let k = 0; k < 3; k++) assert.equal(loop.T[b][k], loop.T[b][(F - 1) * 3 + k]);
            for (let k = 0; k < 4; k++) assert.equal(loop.Q[b][k], loop.Q[b][(F - 1) * 4 + k]);
        }
        // Skinned as the game skins it, the pinned edge stays where it is fixed all through the loop.
        const part = result.parts[0], pinned = result.cloth.setup.pinned, joints = part.joints.map(j => j - 1);
        const T = new Float32Array(grid.count * 3), Q = new Float32Array(grid.count * 4), out = new Float32Array(part.positions.length);
        let worst = 0, step = 0;
        for (let s = 0; s < 24; s++) {
            Cloth.sample(loop, Flag.LOOP * s / 24, T, Q);
            Cloth.skin(part.positions, joints, part.weights, result.cloth.restBones, T, Q, out);
            finite(out, 'skinned');
            for (let v = 0; v < pinned.length; v++) if (pinned[v]) worst = Math.max(worst, Math.hypot(out[v * 3] - part.positions[v * 3], out[v * 3 + 1] - part.positions[v * 3 + 1], out[v * 3 + 2] - part.positions[v * 3 + 2]));
        }
        assert.ok(worst < 0.005, 'the hoist moved ' + worst + ' m');
        // From the last key into the first, no jump larger than the loop's own steps.
        for (let f = 1; f < F; f++) for (let b = 0; b < grid.count; b++) step = Math.max(step, Math.hypot(loop.T[b][f * 3] - loop.T[b][(f - 1) * 3], loop.T[b][f * 3 + 1] - loop.T[b][(f - 1) * 3 + 1], loop.T[b][f * 3 + 2] - loop.T[b][(f - 1) * 3 + 2]));
        assert.ok(step < 0.6, 'largest step ' + step);

        const glb = await Model.toGlb(result, 'Flag', encode);
        const { json, bin } = Optimizer.parseGlb(glb);
        assert.equal(json.animations.length, 1);
        const anim = json.animations[0];
        assert.equal(anim.name, 'Wave');
        assert.equal(anim.channels.length, grid.count * 2);
        assert.ok(anim.channels.some(c => c.target.path === 'translation') && anim.channels.some(c => c.target.path === 'rotation'));
        for (const ch of anim.channels) {
            const sampler = anim.samplers[ch.sampler];
            assert.equal(sampler.interpolation, 'LINEAR');
            const values = accessorData(json, bin, sampler.output), size = ch.target.path === 'translation' ? 3 : 4, n = values.length / size;
            for (let k = 0; k < size; k++) assert.equal(values[k], values[(n - 1) * size + k], 'first and last keys of ' + json.nodes[ch.target.node].name);
        }
        const times = accessorData(json, bin, anim.samplers[0].input);
        assert.equal(times[0], 0);
        assert.ok(Math.abs(times[times.length - 1] - Flag.LOOP) < 1e-6);
        // Skinned on its own skeleton; the cloth's picture and relief inside; the cloth is double-sided.
        assert.equal(json.skins[0].joints.length, result.bones.length);
        const clothMaterial = json.materials[json.meshes[0].primitives[0].material];
        assert.ok(clothMaterial.doubleSided && clothMaterial.pbrMetallicRoughness.baseColorTexture && clothMaterial.normalTexture);
        assert.equal(json.images.length, 2);
        // model.json plays it always, and puts the pole's foot where the prop is placed.
        const side = Model.sidecar(result);
        assert.deepEqual(side.animations, [{ type: 'clip', trigger: 'always', name: 'Wave', clip: 'Wave', part: '' }]);
        side.transform.offset.forEach(v => assert.ok(Number.isFinite(v)));
        if (result.recipe.pole.type === 'metal') assert.ok(side.transform.offset[0] > 0.3, 'the box leans to the fly: ' + side.transform.offset);
    }
});

test('the Prop Builder is on the Forge sidebar and loaded by the editor page', () => {
    const forge = fs.readFileSync(path.join(root, 'src', 'forge', 'ForgeManager.js'), 'utf8');
    assert.match(forge, /id: 'prop-builder'[\s\S]*?new PropBuilder\(\)/);
    const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const order = ['PropCloth.js', 'PropPaint.js', 'PropMesh.js', 'PropCatalog.js', 'FlagDesign.js', 'FlagProp.js', 'PropModel.js', 'FramedProp.js', 'PictureProp.js', 'PropBuilder.js'].map(f => page.indexOf(`src/forge/Props/${f}`));
    order.forEach(i => assert.ok(i > 0));
    assert.deepEqual(order, order.slice().sort((a, b) => a - b), 'loaded in order');
    assert.ok(page.indexOf('src/forge/Character3D/CharacterGlb.js') < order[0], 'after the GLB writer');
});

// ── From picture ───────────────────────────────────────────────────────────
const Picture = require(path.join(props, 'PictureProp.js'));

/** A picture painted by `solid(x, y)` (in [0, 1]): solid pixels `color`, the rest clear or `background`. */
function picture(w, h, solid, background, color) {
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4, on = solid((x + 0.5) / w, (y + 0.5) / h);
        const c = on ? (color || [200, 60, 40, 255]) : (background || [0, 0, 0, 0]);
        data.set(c, o);
    }
    return { width: w, height: h, data };
}
const ring = (x, y) => { const d = Math.hypot(x - 0.5, y - 0.5); return d < 0.42 && d > 0.2; };
const twoHoles = (x, y) => x > 0.1 && x < 0.9 && y > 0.1 && y < 0.9 && Math.hypot(x - 0.3, y - 0.5) > 0.12 && Math.hypot(x - 0.7, y - 0.5) > 0.12;

/** Each edge of a closed solid is shared by exactly two triangles, its points welded by place. */
function watertight(mesh) {
    const P = mesh.positions, key = i => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]].map(v => Math.round(v * 1e5)).join(',');
    const ids = new Map(), id = i => { const k = key(i); if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); };
    const edges = new Map();
    for (let t = 0; t < mesh.index.length; t += 3) {
        const v = [id(mesh.index[t]), id(mesh.index[t + 1]), id(mesh.index[t + 2])];
        if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
        for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], e = a < b ? a + ':' + b : b + ':' + a; edges.set(e, (edges.get(e) || 0) + 1); }
    }
    return [...edges.values()].filter(n => n !== 2).length;
}

const frontCovers = (mesh, x, y) => {
    const P = mesh.positions, I = mesh.index;
    for (let t = 0; t < I.length; t += 3) {
        const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
        const d = (P[b + 1] - P[c + 1]) * (P[a] - P[c]) + (P[c] - P[b]) * (P[a + 1] - P[c + 1]);
        if (Math.abs(d) < 1e-12) continue;
        const l1 = ((P[b + 1] - P[c + 1]) * (x - P[c]) + (P[c] - P[b]) * (y - P[c + 1])) / d, l2 = ((P[c + 1] - P[a + 1]) * (x - P[c]) + (P[a] - P[c]) * (y - P[c + 1])) / d;
        if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1) return true;
    }
    return false;
};

test('a picture recipe is completed and kept in range', () => {
    const r = Model.normalize({ kind: 'picture', mode: 'sculpt', cutout: { thickness: 9, edge: 'wavy' }, turned: { segments: 400, profile: [[2, 0.5], [0.1, 0]] }, framed: { object: 'piano' } });
    assert.equal(r.kind, 'picture');
    assert.equal(r.mode, 'cutout');
    assert.equal(r.cutout.thickness, 0.5);
    assert.equal(r.cutout.edge, 'bevel');
    assert.equal(r.turned.segments, 128);
    assert.deepEqual(r.turned.profile, [[0.1, 0], [0.6, 0.5]], 'points sorted up the height, radii in range');
    assert.equal(r.framed.object, 'painting');
    assert.deepEqual(Model.normalize(r), r);
});

test('a traced outline keeps its holes as holes', () => {
    for (const [solid, holes] of [[ring, 1], [twoHoles, 2]]) {
        const mask = Picture.maskOf(picture(120, 120, solid), 'alpha', 0, 256);
        const list = Picture.shapes(mask, 400);
        assert.equal(list.length, 1, 'one piece');
        assert.equal(list[0].holes.length, holes, 'its holes');
        const r = Model.build({ kind: 'picture', mode: 'cutout', image: 'p', cutout: { size: 1, edge: 'square' } }, {}, { images: { p: picture(120, 120, solid) } });
        const front = r.parts.find(p => p.name === 'Front');
        // Made solid, a hole has no cloth of the front over it; the solid part has.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < front.positions.length; i += 3) { minX = Math.min(minX, front.positions[i]); maxX = Math.max(maxX, front.positions[i]); minY = Math.min(minY, front.positions[i + 1]); maxY = Math.max(maxY, front.positions[i + 1]); }
        const at = (u, v) => [minX + (maxX - minX) * u, maxY - (maxY - minY) * v];
        if (holes === 1) { assert.ok(!frontCovers(front, ...at(0.5, 0.5)), 'the ring is open in the middle'); assert.ok(frontCovers(front, ...at(0.5, 0.11))); }
        else { assert.ok(!frontCovers(front, ...at(0.25, 0.5)) && !frontCovers(front, ...at(0.75, 0.5)), 'both holes open'); assert.ok(frontCovers(front, ...at(0.5, 0.5))); }
    }
    // Color-key removal also opens enclosed background islands, as transparency tracing does.
    const boxed = picture(100, 100, (x, y) => x > 0.2 && x < 0.8 && y > 0.2 && y < 0.8 && !(x > 0.45 && x < 0.55 && y > 0.45 && y < 0.55), [255, 255, 255, 255], [30, 30, 160, 255]);
    const m = Picture.maskOf(boxed, 'color', 0.2, 256);
    assert.equal(m.mode, 'color');
    assert.equal(m.m[2 * m.w + 2], 0, 'the border background is gone');
    assert.equal(m.m[50 * m.w + 50], 0, 'an enclosed white opening is removed');
    assert.equal(Picture.shapes(m, 400)[0].holes.length, 1, 'the opening survives triangulation');
    const opaque = Picture.maskOf(boxed, 'alpha', 0.2, 256);
    assert.equal(opaque.m[50 * opaque.w + 50], 1, 'alpha mode preserves opaque white details');
});

test('a busy picture keeps to the triangle budget; every mode builds whole, the turned body watertight', () => {
    const rand = (() => { let s = 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; })();
    const blobs = Array.from({ length: 60 }, () => [rand(), rand(), 0.02 + rand() * 0.08]);
    const busy = picture(300, 240, (x, y) => blobs.some(([bx, by, r]) => Math.hypot(x - bx, y - by) < r) || (Math.sin(x * 60) > 0.6 && y > 0.4 && y < 0.6));
    const vase = picture(100, 160, (x, y) => Math.abs(x - 0.5) < 0.18 + 0.2 * Math.sin(Math.PI * Math.min(1, (1 - y) * 1.3)) && y > 0.05 && y < 0.95);
    const images = { busy, vase };
    const recipes = [];
    for (const [edge] of Picture.EDGES) for (const [back] of Picture.BACKS) for (const [stand] of Picture.STANDS) recipes.push({ mode: 'cutout', image: 'busy', cutout: { edge, back, stand } });
    for (const [surface] of Picture.SURFACES) for (const top of ['open', 'closed']) for (const wall of [0, 0.02]) recipes.push({ mode: 'turned', image: 'vase', turned: { surface, top, wall } });
    recipes.push({ mode: 'turned', turned: { fromPicture: false, segments: 48 } });
    const Framed = require(path.join(props, 'FramedProp.js'));
    for (const [object] of Picture.OBJECTS) for (const [style] of Framed.STYLES) for (const [mount] of Framed.MOUNTS) recipes.push({ mode: 'framed', image: 'vase', framed: { object, style, mount, mat: true, glass: true } });
    recipes.push({ mode: 'cutout' }, { mode: 'framed' });
    for (const recipe of recipes) {
        const what = JSON.stringify(recipe);
        const r = Model.build(Object.assign({ kind: 'picture' }, recipe), {}, { images, textureSize: 256 });
        const s = Model.stats(r);
        // Multi-sample rounded cut edges and 64-sided turned defaults.
        assert.ok(s.triangles <= 25000, what + ': ' + s.triangles + ' triangles');
        for (const [w, h] of s.textures) assert.ok(w <= 1024 && h <= 1024, what + ' picture ' + w + 'x' + h);
        for (const p of r.parts) {
            finite(p.positions, what + ' ' + p.name); finite(p.normals, what + ' ' + p.name + ' normals');
            if (p.uvs) finite(p.uvs, what + ' ' + p.name + ' uvs');
            for (const i of p.index) assert.ok(i < p.positions.length / 3);
        }
        if (recipe.mode === 'turned') assert.equal(watertight(r.parts[0]), 0, what + ' open edges');
        // A still prop carries its albedo in vertex colors; runtime lighting supplies its form.
        if (!r.cloth) for (const p of r.parts) { assert.equal(p.colors.length, p.positions.length, what + ' ' + p.name + ' colors'); finite(p.colors, what + ' colors'); }
    }
    // The turned body follows the picture's silhouette: widest where the picture is.
    const t = Model.build({ kind: 'picture', mode: 'turned', image: 'vase', turned: { height: 1, wall: 0 } }, {}, { images });
    const widthAt = y => { let w = 0; const P = t.parts[0].positions; for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - y) < 0.04) w = Math.max(w, Math.hypot(P[i], P[i + 2])); return w; };
    assert.ok(widthAt(0.62) > widthAt(0.1) + 0.05, 'the belly is wider than the foot');
    assert.ok(Math.abs(widthAt(0.62) - (0.18 + 0.2) * 100 / 160 * (1 / 0.9)) < 0.08, 'the belly as wide as the picture\'s: ' + widthAt(0.62));
});

test('a picture prop saves as a GLB with its picture inside; a hanging banner flies on the Flag\'s cloth', async () => {
    const sign = picture(64, 48, ring, null, [20, 120, 220, 255]);
    const r = Model.build({ kind: 'picture', mode: 'cutout', image: 'sign', cutout: { back: 'mirror' } }, {}, { images: { sign } });
    const { json } = Optimizer.parseGlb(await Model.toGlb(r, 'Sign', encode));
    assert.ok(json.images.length >= 1);
    const front = json.materials[json.meshes[0].primitives[0].material];
    assert.ok(front.pbrMetallicRoughness.baseColorTexture, 'the face shows the picture');
    assert.ok(!json.animations, 'a still prop has no clip');
    assert.ok(!Model.sidecar(r).animations);
    const banner = Model.build({ kind: 'picture', mode: 'framed', image: 'sign', framed: { object: 'banner', size: 0.8 } }, {}, { images: { sign }, textureSize: 256 });
    assert.ok(banner.cloth && banner.recipe.kind === 'picture');
    assert.equal(banner.cloth.setup.pinned[0], 1);
    const loop = Model.bake(banner);
    const flying = Model.build({ kind: 'picture', mode: 'framed', image: 'sign', framed: { object: 'banner', size: 0.8 } }, {}, { images: { sign }, textureSize: 256, loop });
    const glb = Optimizer.parseGlb(await Model.toGlb(flying, 'Banner', encode)).json;
    assert.equal(glb.animations[0].name, 'Wave');
});

test('real pictures: the Demo minimap frame keeps its window open; the logo cuts into its pieces within budget', () => {
    const read = name => {
        const file = path.join(root, '..', 'template', 'Demo', 'img', 'pictures', name);
        if (!fs.existsSync(file)) return null;
        const png = PNG.sync.read(fs.readFileSync(file));
        return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
    };
    const frame = read('Minimap-Frame.png'), logo = read('Psychronic-logo-1.png');
    if (!frame || !logo) return;
    const framed = Picture.shapes(Picture.maskOf(frame, 'auto', 0.25, 256), 400);
    assert.equal(framed.length, 1);
    assert.equal(framed[0].holes.length, 1, 'the window is a hole');
    // The logo on black: the black taken away, the skull and each letter a piece of its own.
    const pieces = Picture.shapes(Picture.maskOf(logo, 'auto', 0.25, 256), 400);
    assert.ok(pieces.length >= 10, 'the skull and the letters: ' + pieces.length);
    for (const edge of ['square', 'bevel', 'round']) {
        const r = Model.build({ kind: 'picture', mode: 'cutout', image: 'logo', cutout: { edge } }, {}, { images: { logo } });
        assert.ok(Model.stats(r).triangles <= 12000, edge + ' ' + Model.stats(r).triangles);
    }
});

// ── round 2: flag sizes, layered designs, catalog ──────────────────────────
test('long streamers, pennants and tall banners stay pinned along their long edge, and loop', () => {
    for (const recipe of [Flag.withForm('streamer'), Flag.withForm('banner'), { kind: 'flag', cloth: { aspect: 'pennant', width: 1.5 } }, { kind: 'flag', pole: { type: 'crossbar', height: 5 }, cloth: { aspect: 'banner', width: 0.8, cut: 'swallowtail' } }, { kind: 'flag', pole: { type: 'staff', height: 1.4 }, cloth: { aspect: 'custom', width: 0.15, height: 0.1 } }]) {
        const result = baked(recipe), loop = result.loop, grid = result.cloth.grid, setup = result.cloth.setup, F = loop.times.length;
        const what = JSON.stringify(result.recipe.cloth);
        assert.ok(grid.count <= 80, what + ' bones ' + grid.count);
        // The long side carries most of the bones.
        if (result.recipe.cloth.width > result.recipe.cloth.height * 3) assert.ok(grid.bi.length > grid.bj.length * 3, what + ' bones along its length');
        for (let b = 0; b < grid.count; b++) { finite(loop.T[b], what); for (let k = 0; k < 3; k++) assert.equal(loop.T[b][k], loop.T[b][(F - 1) * 3 + k]); }
        const part = result.parts[0], joints = part.joints.map(j => j - 1), T = new Float32Array(grid.count * 3), Q = new Float32Array(grid.count * 4), out = new Float32Array(part.positions.length);
        let worst = 0, pins = 0;
        for (let v = 0; v < setup.pinned.length; v++) pins += setup.pinned[v];
        assert.ok(pins >= Math.min(setup.nx, setup.ny), what + ' pinned along an edge');
        for (let s = 0; s < 12; s++) {
            Cloth.sample(loop, Flag.LOOP * s / 12, T, Q);
            Cloth.skin(part.positions, joints, part.weights, result.cloth.restBones, T, Q, out);
            for (let v = 0; v < setup.pinned.length; v++) if (setup.pinned[v]) worst = Math.max(worst, Math.hypot(out[v * 3] - part.positions[v * 3], out[v * 3 + 1] - part.positions[v * 3 + 1], out[v * 3 + 2] - part.positions[v * 3 + 2]));
        }
        assert.ok(worst < 0.005, what + ' moved ' + worst);
    }
});

test('a flag design is a field and emblem layers drawn in order; pictures, recolor and repeats', () => {
    const pix = (r) => { const p = r.textures['cloth.png']; return (u, v) => { const o = (Math.floor(v * p.height) * p.width + Math.floor(u * p.width)) * 4; return [p.data[o], p.data[o + 1], p.data[o + 2]]; }; };
    const red = '#d01010', blue = '#1010d0';
    // The later layer is drawn over the earlier.
    const order = layers => pix(Model.build({ kind: 'flag', pole: { type: 'staff' }, design: { field: { layout: 'solid', colors: ['#f0f0f0'] }, layers } }, {}, { textureSize: 256 }))(0.5, 0.5);
    assert.ok(order([{ shape: 'circle', color: red, size: 0.6 }, { shape: 'circle', color: blue, size: 0.3 }])[2] > 150, 'blue on top');
    assert.ok(order([{ shape: 'circle', color: blue, size: 0.3 }, { shape: 'circle', color: red, size: 0.6 }])[0] > 150, 'red on top');
    // A picture layer: its own colors, its transparency showing the field; or recolored.
    const img = { width: 4, height: 4, data: new Uint8Array(64) };
    for (let i = 0; i < 16; i++) { const x = i % 4, y = i >> 2, solid = x > 0 && x < 3 && y > 0 && y < 3; img.data.set(solid ? [20, 200, 20, 255] : [0, 0, 0, 0], i * 4); }
    const pic = recolor => pix(Model.build({ kind: 'flag', pole: { type: 'staff' }, design: { field: { layout: 'solid', colors: ['#f0f0f0'] }, layers: [{ source: 'picture', image: 'Crest', recolor, color: red, size: 0.8 }] } }, {}, { textureSize: 256, images: { Crest: img } }));
    const own = pic(false), recolored = pic(true);
    assert.ok(own(0.5, 0.5)[1] > 150 && own(0.5, 0.5)[0] < 100, 'the picture\'s green');
    assert.ok(recolored(0.5, 0.5)[0] > 150 && recolored(0.5, 0.5)[1] < 100, 'recolored red');
    assert.ok(own(0.5, 0.18)[0] > 200 && own(0.5, 0.18)[1] > 200, 'the field shows through its clear edge');
    const missing = Model.build({ kind: 'flag', design: { layers: [{ source: 'picture', image: 'Nowhere' }] } }, {}, { textureSize: 128 });
    assert.equal(missing.imageMissing, true);
    assert.equal(missing.imageName, 'Nowhere');
    // A ring of N copies round its place, a row of N through it.
    const f = Design.normalize({}).field, ring = Design.copies(Design.normalizeLayer({ repeat: 'ring', count: 7, spread: 0.8, size: 0.1 }), f, 2 / 3);
    assert.equal(ring.length, 7);
    const radii = ring.map(([x, y]) => Math.hypot(x - 0.5, y - 1 / 3));
    for (const r of radii) assert.ok(Math.abs(r - radii[0]) < 1e-9 && r > 0.2);
    const row = Design.copies(Design.normalizeLayer({ repeat: 'row', count: 4, size: 0.1 }), f, 2 / 3);
    assert.equal(row.length, 4);
    row.forEach(([, y]) => assert.ok(Math.abs(y - 1 / 3) < 1e-9));
    assert.ok(Math.abs((row[0][0] + row[3][0]) / 2 - 0.5) < 1e-9, 'centered on its place');
    // Mirror and rotation turn the shape (the sword points up; turned half round it points down).
    const tip = layer => pix(Model.build({ kind: 'flag', pole: { type: 'staff' }, cloth: { aspect: '1:1' }, design: { field: { layout: 'solid', colors: ['#f0f0f0'] }, layers: [Object.assign({ shape: 'sword', color: red, size: 0.8 }, layer)] } }, {}, { textureSize: 256 }));
    assert.ok(tip({})(0.5, 0.15)[0] > 150 && tip({ rotate: 180 })(0.5, 0.85)[0] > 150);
});

test('a prop.json saved by the first Prop Builder still opens', () => {
    const saved = { builder: 'prop', version: 1, recipe: { kind: 'flag', pole: { type: 'metal', height: 6, finial: 'ball', rope: true, color: '#c3c7cc', finialColor: '#d4a940' }, cloth: { width: 1.5, aspect: '2:3', height: 1, fabric: 'cotton', wear: 0.5 },
        design: { layout: 'triangle', colors: ['#f2efe6', '#1f3c78', '#a51f2b', '#d9b23c'], emblem: { shape: 'star', color: '#f2efe6', size: 0.3, place: 'hoist' }, image: '' }, wind: { strength: 0.4, gust: 0.4, direction: 0 }, seed: 7 } };
    const r = Model.normalize(saved.recipe);
    assert.equal(r.design.field.layout, 'triangle');
    assert.deepEqual(r.design.field.colors.slice(0, 3), ['#f2efe6', '#1f3c78', '#a51f2b']);
    assert.equal(r.design.layers.length, 1);
    assert.deepEqual([r.design.layers[0].shape, r.design.layers[0].place, r.design.layers[0].color], ['star', 'hoist', '#f2efe6']);
    assert.equal(r.cloth.cut, 'straight');
    assert.equal(r.form, 'flag');
    const pic = { kind: 'picture', mode: 'framed', image: 'p', framed: { object: 'painting', frame: 'black', size: 0.8, color: '#5a2a22' } };
    assert.equal(Model.normalize(pic).framed.style, 'modern');
    assert.equal(Model.normalize(pic).framed.material, 'blackmetal');
});

test('the left column lists every type under its category, and a search narrows it', () => {
    const Catalog = require(path.join(props, 'PropCatalog.js'));
    const groups = Catalog.grouped('');
    assert.deepEqual(groups.slice(0, 2).map(g => g.category.id), ['banners', 'picture']);
    for (const t of Catalog.TYPES) {
        assert.ok(Catalog.CATEGORIES.some(c => c.id === t.category), t.id + ' has its category');
        assert.ok(Model.BY_ID.has(t.kind), t.id + ' builds by kind ' + t.kind);
        const start = Model.normalize(t.start());
        assert.equal(Catalog.typeOf(start), t, t.id + ' is what it starts as');
    }
    const found = Catalog.grouped('streamer');
    assert.equal(found.length, 1);
    assert.deepEqual(found[0].types.map(t => t.id), ['streamer']);
    assert.equal(Catalog.grouped('zzz-nothing').length, 0);
});

// ── round 2: hanging banners, swords, guns, the floor ──────────────────────
const Span = require(path.join(props, 'SpanProp.js'));
const Sword = require(path.join(props, 'SwordProp.js'));
const Gun = require(path.join(props, 'GunProp.js'));
const lowest = result => { let low = Infinity; for (const p of result.parts) for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]); return low; };

test('a rope or wire hangs as a catenary through both ends; a pole stays straight', () => {
    for (const [L, H, d] of [[2, 3, 0.1], [4, 3, 0.35], [6, 4, 1], [8, 2.5, 0.02]]) {
        const y = Span.curve({ length: L, height: H, sag: d });
        assert.ok(Math.abs(y(-L / 2) - H) < 1e-6 && Math.abs(y(L / 2) - H) < 1e-6, 'its ends at its height');
        assert.ok(Math.abs(H - y(0) - d) < 1e-3, 'its sag in the middle: ' + (H - y(0)));
        assert.ok(Math.abs(y(L / 4) - y(-L / 4)) < 1e-9 && y(L / 4) < H && y(L / 4) > y(0), 'symmetric, lowest in the middle');
        // A catenary, not a parabola: its curvature grows toward the ends.
        const k = x => (y(x + 1e-3) - 2 * y(x) + y(x - 1e-3)) / 1e-6;
        assert.ok(k(L * 0.45) > k(0));
    }
    const pole = Span.curve({ length: 4, height: 3, sag: 0 });
    assert.equal(pole(0), 3);
});

test('hanging banners: pinned to the swinging rope, looping, within budget, posts on the floor', () => {
    for (const recipe of [{}, { banners: { shape: 'bunting', count: 20 } }, { span: { type: 'pole', mounts: 'posts' }, banners: { count: 2, shape: 'pointed' } }, { span: { type: 'wire', length: 6, mounts: 'none' }, banners: { count: 4, spacing: 'custom', positions: [0.1, 0.3, 0.6, 0.9], shared: false, lengths: [0.5, 1.5, 1, 0.8] } }]) {
        const first = Model.build(Object.assign({ kind: 'span' }, recipe), {}, { textureSize: 256 }), loop = Model.bake(first);
        const result = Model.build(Object.assign({ kind: 'span' }, recipe), {}, { textureSize: 256, loop }), what = JSON.stringify(recipe);
        const s = Model.stats(result);
        assert.ok(s.triangles <= 12000, what + ' ' + s.triangles);
        assert.ok(s.bones <= 128, what + ' ' + s.bones + ' bones');
        for (const [w, h] of s.textures) assert.ok(w <= 1024 && h <= 1024);
        const F = loop.times.length;
        for (let b = 0; b < loop.T.length; b++) { finite(loop.T[b], what); for (let k = 0; k < 3; k++) assert.equal(loop.T[b][k], loop.T[b][(F - 1) * 3 + k], what + ' loop closes'); }
        // Each banner's pinned top is where the rope it hangs from has swung to, at every moment.
        for (const c of result.cloths) {
            const amp = c.setup.sway ? c.setup.sway.amp : [0, 0, 0];
            for (const t of [0, 0.4, 1.1, 2.3]) {
                const T = new Float32Array(loop.T.length * 3), Q = new Float32Array(loop.T.length * 4);
                Cloth.sample(loop, t, T, Q);
                const w = Math.sin(2 * Math.PI * t / Flag.LOOP);
                let b = 0;
                for (const j of c.grid.bj) for (const i of c.grid.bi) {
                    if (j === 0) {
                        const p = i * 3, rest = c.setup.rest, bone = (c.offset + b) * 3;
                        assert.ok(Math.abs(T[bone + 2] - (rest[p + 2] + amp[2] * w)) < 2e-3 && Math.abs(T[bone + 1] - (rest[p + 1] + amp[1] * Math.abs(w))) < 2e-3, what + ' pin at ' + t);
                    }
                    b++;
                }
            }
        }
        const side = Model.sidecar(result);
        assert.deepEqual(side.animations.map(a => a.clip), ['Wave']);
        assert.equal(side.span.tiles, result.recipe.span.length);
        assert.equal(side.span.origin, 'center');
        if (result.recipe.span.mounts === 'posts') assert.ok(Math.abs(lowest(result)) < 1e-3, 'posts stand on the floor');
        else assert.ok(side.transform.offset[1] > 0.5, 'hung high between walls');
        assert.ok(Math.abs(side.transform.offset[0]) < 1e-3, 'its origin in the middle of the span');
    }
});

test('swords and guns build across their sliders: whole, within budget, holdable by their grips', () => {
    const range = (lo, hi) => [lo, (lo + hi) / 2, hi];
    const swords = [];
    for (const [id] of Sword.PRESETS) swords.push({ preset: id });
    for (const length of range(0.12, 1.6)) for (const curve of [0, 1]) for (const [tip] of Sword.TIPS) swords.push({ blade: { length, curve, tip, width: length < 0.2 ? 0.012 : 0.12, serrations: 1, fuller: 1, edge: curve ? 'single' : 'double' } });
    for (const [type] of Sword.GUARDS) for (const [pommel] of Sword.POMMELS) for (const size of [0.4, 2.2]) swords.push({ guard: { type, size, curl: -1 }, pommel, metal: 'damascus', glow: { on: true, blade: size > 1 } });
    for (const recipe of swords) {
        const r = Model.build(Object.assign({ kind: 'sword' }, recipe), {}, {}), what = JSON.stringify(recipe), s = Model.stats(r);
        assert.ok(s.triangles <= 50000, what + ' ' + s.triangles);
        for (const p of r.parts) { finite(p.positions, what + ' ' + p.name); finite(p.normals, what + ' normals'); }
        for (const k of ['gripBottom', 'gripTop', 'tip', 'edge']) { assert.ok(r.markers[k], what + ' ' + k); finite(r.markers[k], what + ' ' + k); }
        const grip = r.parts.find(p => p.name === 'Grip');
        // The grip markers lie on the grip, the tip at the far end from them.
        assert.ok(Math.abs(r.markers.gripTop[0] - r.markers.gripBottom[0]) > r.recipe.grip.length * 0.9, what + ' grip length');
        let gx0 = Infinity, gx1 = -Infinity; for (let i = 0; i < grip.positions.length; i += 3) { gx0 = Math.min(gx0, grip.positions[i]); gx1 = Math.max(gx1, grip.positions[i]); }
        for (const k of ['gripTop', 'gripBottom']) assert.ok(r.markers[k][0] >= gx0 - 0.01 && r.markers[k][0] <= gx1 + 0.01, what + ' ' + k + ' on the grip');
        assert.ok(Math.abs(r.markers.tip[0] - r.markers.gripTop[0]) > r.recipe.blade.length * 0.9, what + ' tip');
        assert.equal(Model.sidecar(r).rig.template, 'blade');
        assert.ok(Math.abs(lowest(r)) < 1e-6, what + ' lies on the floor');
        if (r.recipe.glow.on) assert.ok(r.parts.some(p => p.emissive), what + ' glows');
    }
    const guns = [];
    for (const [id] of Gun.PRESETS) guns.push({ preset: id });
    for (const [magazine] of Gun.MAGAZINES) for (const [stock] of Gun.STOCKS) for (const [sight] of Gun.SIGHTS) for (const [muzzle] of Gun.MUZZLES) guns.push({ preset: 'rifle', magazine, stock, sight, muzzle, coils: 8, vents: true, magSize: 2, forend: true });
    for (const length of range(0.04, 1.2)) for (const angle of [0, 40]) guns.push({ preset: 'blasterRifle', barrel: { length, thickness: 0.07 }, receiver: { length: 0.7, height: 0.14 }, grip: { angle, length: 0.16 }, furniture: 'wood' });
    for (const recipe of guns) {
        const r = Model.build(Object.assign({ kind: 'gun' }, recipe), {}, {}), what = JSON.stringify(recipe), s = Model.stats(r);
        assert.ok(s.triangles <= 45000, what + ' ' + s.triangles);
        for (const p of r.parts) { finite(p.positions, what + ' ' + p.name); finite(p.normals, what + ' normals'); }
        for (const k of ['gripTop', 'gripBottom', 'muzzle', 'rear', 'trigger']) { assert.ok(r.markers[k], what + ' ' + k); finite(r.markers[k], what + ' ' + k); }
        if (r.recipe.stock !== 'none') assert.ok(r.markers.stock, what + ' stock');
        if (r.recipe.forend) assert.ok(r.markers.foreGrip, what + ' fore grip');
        // The bore runs from the rear to the muzzle, the grip hangs below it (toward +z, lying on its side).
        assert.ok(r.markers.muzzle[0] > r.markers.rear[0], what + ' bore');
        assert.ok(r.markers.gripBottom[2] > r.markers.gripTop[2], what + ' grip below the bore');
        assert.equal(Model.sidecar(r).rig.template, 'gun');
        assert.ok(Math.abs(lowest(r)) < 1e-6, what + ' lies on the floor');
    }
});

test('every type and preset rests on the floor, or keeps its height on a wall, and its model.json agrees', () => {
    const Catalog = require(path.join(props, 'PropCatalog.js'));
    const picture = { width: 30, height: 40, data: new Uint8Array(30 * 40 * 4).fill(180) };
    const recipes = Catalog.TYPES.map(t => ({ what: t.id, recipe: Object.assign(t.start(), t.kind === 'picture' ? { image: 'p' } : {}) }));
    const Framed = require(path.join(props, 'FramedProp.js'));
    for (const p of Framed.PRESETS) for (const object of ['painting', 'poster']) for (const [mount] of Framed.MOUNTS) for (const size of [0.2, 1, 3]) recipes.push({ what: p.id + ' ' + object + ' ' + mount + ' ' + size, recipe: { kind: 'picture', mode: 'framed', image: 'p', framed: Object.assign({ object, size }, p.set, { mount }) } });
    for (const object of ['crate', 'book', 'banner']) recipes.push({ what: object, recipe: { kind: 'picture', mode: 'framed', image: 'p', framed: { object } } });
    for (const p of Flag.POLES) recipes.push({ what: 'pole ' + p.id, recipe: Flag.withPole({}, p.id) });
    for (const { what, recipe } of recipes) {
        const r = Model.build(recipe, {}, { textureSize: 128, images: { p: picture } });
        const low = lowest(r), offset = Model.sidecar(r).transform.offset;
        const hung = !!(r.wall || r.walls);
        if (hung) assert.ok(low > 0.05, what + ' hangs above the floor: ' + low);
        else assert.ok(Math.abs(low) < 1e-3, what + ' rests on the floor: ' + low);
        assert.ok(Math.abs(offset[1] - low) < 1e-3, what + ' model.json keeps its height: ' + offset[1] + ' vs ' + low);
    }
});
