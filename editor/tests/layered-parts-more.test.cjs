'use strict';
// More of a character in fewer draws (runtime/reactor_3d_models.js, Reactor3D.LayeredParts): the body in the face's
// group (BODY), a garment whose glow has a picture (GLOW_MAPS), and a worn prop's rigid pieces (WORN, Reactor3D.Worn).
// Each merged part keeps its own places, coordinates, colors and row of values, so it draws as it did on its own.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'));
const THREE = global.THREE;
const L = Reactor3D.LayeredParts;

const picture = (width, height, source) => {
    const t = new THREE.Texture({ width, height });
    if (source != null) t.userData.rrGlbImage = source;
    return t;
};

function material(spec) {
    const m = new THREE.MeshBasicMaterial({ side: spec.side ?? THREE.FrontSide, alphaTest: spec.cut || 0, vertexColors: true });
    if (spec.color) m.color.set(spec.color);
    if (spec.map) m.map = spec.map;
    m.__reactorModel = true;
    if (spec.normal) { m.userData.rrNormalMap = spec.normal; m.userData.rrNormalUv1 = true; m.userData.rrNormalScale = new THREE.Vector2(0.9, -0.9); }
    if (spec.surface) { m.userData.rrSurfaceMap = spec.surface; m.userData.rrSurfaceUv1 = !!spec.surfaceUv1; }
    if (spec.shine) { m.userData.glbShine = { reflect: spec.shine, gloss: 0.7, metal: 0.85, tint: '#ffffff' }; m.userData.glbShineOwn = true; }
    if (spec.glow) m.userData.rrEmissive = new THREE.Color(spec.glow);
    if (spec.glowMap) m.userData.rrEmissiveMap = spec.glowMap;
    Reactor3D.litMaterial(m);
    return m;
}

/** A box's geometry with colors, both coordinates and (skinned) a skin, moved by `k` so each part's places differ. */
function boxGeometry(k, skinned) {
    const g = new THREE.BoxGeometry(0.2 + k * 0.01, 0.3, 0.1);
    g.clearGroups();
    g.translate(k * 0.05, k * 0.02, -k * 0.03);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).map((_, i) => ((i * 7 + k) % 10) / 10), 3));
    g.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(n * 2).map((_, i) => (i % 5) / 4 + k), 2));
    if (skinned) {
        g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
        g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    }
    return g;
}

/** A built character's template: parts on one skeleton, each in its node as the GLB loader leaves them. */
function character(specs) {
    const root = new THREE.Group(), content = new THREE.Group(), bone = new THREE.Bone();
    content.add(bone); root.add(content);
    const skeleton = new THREE.Skeleton([bone]);
    const parts = specs.map((spec, k) => {
        const g = boxGeometry(k, true);
        if (spec.body) g.userData.rrBodyUV = 'reactor-human-1';
        if (spec.shapes) {
            g.morphAttributes.position = spec.shapes.map(name => { const a = new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(k + 1), 3); a.name = name; return a; });
            g.morphTargetsRelative = true;
        }
        const mesh = new THREE.SkinnedMesh(g, material(spec));
        if (spec.shapes) mesh.updateMorphTargets();
        mesh.bind(skeleton, new THREE.Matrix4());
        const node = new THREE.Group();
        node.name = spec.name;
        node.add(mesh);
        content.add(node);
        return mesh;
    });
    root.userData.glbTextures = [];
    return { root, parts };
}

function stubPictures(t) {
    const pixels = L.pixels, had = global.createImageBitmap, next = L.nextFrame;
    L.pixels = async (images, w, h) => new Uint8Array(w * h * 4 * images.length).fill(128);
    global.createImageBitmap = async () => ({});
    L.nextFrame = () => Promise.resolve();
    t.after(() => { L.pixels = pixels; L.nextFrame = next; if (had) global.createImageBitmap = had; else delete global.createImageBitmap; });
}

function withSwitch(t, name, value) {
    const was = L[name];
    L[name] = value;
    t.after(() => { L[name] = was; });
}

const meshes = root => { const out = []; root.traverse(o => { if (o.isMesh) out.push(o); }); return out; };

/** Every vertex of `part` (its own attributes) against its slice of the merged geometry, from vertex `at`. */
function assertSlice(merged, part, at, label, row) {
    const g = merged.geometry, a = part.geometry.attributes, n = a.position.count, tint = part.material.color;
    const get = (x, i, c) => x.getComponent(i, c);
    for (let i = 0; i < n; i++) {
        for (let c = 0; c < 3; c++) {
            assert.equal(get(g.attributes.position, at + i, c), get(a.position, i, c), label + ' place');
            assert.equal(get(g.attributes.normal, at + i, c), get(a.normal, i, c), label + ' normal');
            const color = (a.color && part.material.vertexColors ? get(a.color, i, c) : 1) * [tint.r, tint.g, tint.b][c];
            assert.ok(Math.abs(get(g.attributes.color, at + i, c) - color) < 1e-6, label + ' color');
        }
        for (let c = 0; c < 2; c++) {
            if (a.uv) assert.equal(get(g.attributes.uv, at + i, c), get(a.uv, i, c), label + ' uv');
            if (a.uv1) assert.equal(get(g.attributes.uv1, at + i, c), get(a.uv1, i, c), label + ' uv1');
        }
        if (row != null) assert.equal(g.attributes.rrLayer.getX(at + i), row, label + ' row');
    }
}

test('the body joins the face\'s group, drawn first as it was, its own places, coordinates and colors kept', async t => {
    stubPictures(t);
    const skin = picture(2048, 2048, 0), eyes = picture(512, 512, 1);
    const { root, parts } = character([
        { name: 'Body', body: true, map: skin, shapes: ['viseme_aa', 'blink'], color: '#ffeedd' },
        { name: 'Eyes', map: eyes, cut: 0.5, shapes: ['blink'] },
        { name: 'Shirt', map: picture(1024, 1024, 2) }, { name: 'Trousers', map: picture(1024, 1024, 2) },
        { name: 'Hair', map: picture(512, 512, 3), cut: 0.5 }
    ]);
    const counts = parts.map(p => p.geometry.attributes.position.count);
    await L.apply(root);
    const merged = meshes(root).filter(m => m.material.userData.rrLayers);
    const face = merged.find(m => m.userData.rrLayeredParts.includes('Body')), cloth = merged.find(m => m !== face);
    assert.deepEqual(face.userData.rrLayeredParts, ['Body', 'Eyes'], 'the body first: what lies on its skin still draws after it');
    assert.equal(face.renderOrder, 0, 'where the body drew');
    assert.equal(cloth.renderOrder, 1, 'the garments after the body, as before');
    assert.deepEqual(meshes(root).filter(m => !m.material.userData.rrLayers).map(m => m.parent.name), ['Hair'], 'hair stays: worn pieces hide it by name');
    assertSlice(face, parts[0], 0, 'body', 0);
    assertSlice(face, parts[1], counts[0], 'eyes', 1);
    assert.deepEqual(Object.keys(face.morphTargetDictionary), ['viseme_aa', 'blink']);
    assert.deepEqual(face.geometry.userData.rrBodyRanges, [[0, parts[0].geometry.index.count]]);
    assert.equal(face.geometry.userData.rrBodyUV, 'reactor-human-1');
    const table = face.material.userData.rrLayers.table.image.data;
    assert.deepEqual([table[0], table[20]], [0, 0], 'skin and eyes each on layer 0 of their own size\'s array');
    assert.deepEqual([table[19], table[39]], [0, 1], 'the skin in an array of its own size, the eyes in the small pictures\x27 one');
    assert.deepEqual([table[14], table[34]], [0, 0.5], 'the eyes cut out at their own alpha, the body not at all');
});

test('a worn garment masks only the body\'s own triangles of the merged mesh, in order', async t => {
    stubPictures(t);
    const { root, parts } = character([
        { name: 'Body', body: true, map: picture(2048, 2048, 0), shapes: ['blink'] },
        { name: 'Eyes', map: picture(512, 512, 1), shapes: ['blink'] }
    ]);
    await L.apply(root);
    const face = meshes(root)[0], all = Array.from(face.geometry.index.array), body = parts[0].geometry.index.count;
    // A garment that covers all the skin.
    const garment = new THREE.Group();
    garment.__reactorSkinMask = { layout: 'reactor-human-1', size: 256, bits: new Uint8Array(8192).fill(255) };
    root.add(garment);
    const holder = { object: root };
    Reactor3D.Worn.maskSkin(holder);
    assert.notEqual(face.geometry, holder.wornSkin.get(face).original, 'drawn from its own copy');
    assert.equal(face.geometry.drawRange.count, all.length - body, 'the body\'s triangles gone');
    assert.deepEqual(Array.from(face.geometry.index.array.slice(0, all.length - body)), all.slice(body), 'the eyes\' as they were');
    root.remove(garment);
    Reactor3D.Worn.maskSkin(holder);
    assert.equal(holder.wornSkin.size, 0);
    assert.equal(face.geometry.drawRange.count, Infinity, 'taken off: the whole mesh again');
});

test('BODY off: the body stays apart, the face\'s parts merge as before', async t => {
    stubPictures(t);
    withSwitch(t, 'BODY', false);
    const { root } = character([
        { name: 'Body', body: true, map: picture(2048, 2048, 0), shapes: ['blink'] },
        { name: 'Eyes', shapes: ['blink'] }, { name: 'Teeth', shapes: ['blink'] }
    ]);
    await L.apply(root);
    const list = meshes(root);
    assert.equal(list[0].parent.name, 'Body');
    assert.deepEqual(list[1].userData.rrLayeredParts, ['Eyes', 'Teeth']);
    assert.equal(list[1].renderOrder, 1);
});

test('a garment whose glow has a picture joins its group; the glow picture is a layer of the picture\'s array', async t => {
    stubPictures(t);
    const sheet = picture(1024, 1024, 0), glowSheet = picture(1024, 1024, 5);
    const { root, parts } = character([
        { name: 'Uniform', map: sheet, glowMap: glowSheet, glow: '#ffffff', normal: picture(256, 256, 1) },
        { name: 'Lights', glow: '#cc8833' },
        { name: 'Boots', map: picture(1024, 1024, 2) }
    ]);
    await L.apply(root);
    const merged = meshes(root);
    assert.equal(merged.length, 1, 'one mesh for the three');
    const m = merged[0], layers = m.material.userData.rrLayers;
    assertSlice(m, parts[0], 0, 'uniform', 0);
    assert.equal(layers.glow, true);
    assert.equal(layers.classes, 1, 'the glow sheet in the pictures\' own array: no sampler more');
    assert.equal(layers.base[0].image.depth, 3, 'outfit, glow and boots, each once');
    const table = layers.table.image.data, row = r => Array.from(table.slice(r * 24, r * 24 + 24));
    assert.equal(layers.table.image.width, 6, 'a sixth texel: the glow picture\'s layer and array');
    assert.deepEqual(row(0).slice(20, 22), [1, 0], 'the uniform\'s glow on layer 1 of array 0');
    assert.deepEqual(row(1).slice(20, 22), [L.NONE, -1], 'the lights glow a flat color, as their own program added it');
    assert.deepEqual(row(1).slice(16, 19).map(v => +v.toFixed(4)), [new THREE.Color('#cc8833').r, new THREE.Color('#cc8833').g, new THREE.Color('#cc8833').b].map(v => +v.toFixed(4)));
    assert.deepEqual(row(2).slice(16, 19), [0, 0, 0], 'no glow where the part has none');
    assert.equal(Reactor3D.glowKey(m.material), '|emit-map');
    const instance = Reactor3D.cloneModelTemplate(root), material = meshes(instance)[0].material;
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    material.onBeforeCompile(shader, null);
    const fs = shader.fragmentShader;
    assert.match(fs, /outgoingLight \+= rrEmissive \* rrLayerGlow\(vMapUv\)\.rgb;/, 'the glow line as injectSurfaceGlow writes it, its picture the part\'s layer');
    assert.doesNotMatch(fs, /rrEmissiveMap/);
    assert.match(fs, /vRRLayerF = texelFetch\(rrLayerTable, ivec2\(5, rrRow\), 0\);/);
    assert.match(fs, /vec4 rrLayerGlow\(vec2 uv\) \{\n\tvec2 dx = dFdx\(uv\), dy = dFdy\(uv\);/, 'derivatives before any branch');
    assert.match(material.customProgramCacheKey(), /\|layers1-glow/);
});

test('without a glow picture in a group its program is the one it was (no sixth texel, no glow picker)', async t => {
    stubPictures(t);
    const { root } = character([{ name: 'Shirt', map: picture(1024, 1024, 0) }, { name: 'Lights', glow: '#ff0000' }]);
    await L.apply(root);
    const m = meshes(root)[0], layers = m.material.userData.rrLayers;
    assert.equal(layers.table.image.width, 5);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    m.material.onBeforeCompile(shader, null);
    assert.doesNotMatch(shader.fragmentShader, /vRRLayerF|rrLayerGlow/);
    assert.doesNotMatch(m.material.customProgramCacheKey(), /-glow/);
});

test('GLOW_MAPS off: a part whose glow has a picture stays apart', async t => {
    stubPictures(t);
    withSwitch(t, 'GLOW_MAPS', false);
    const { root } = character([
        { name: 'Uniform', map: picture(1024, 1024, 0), glowMap: picture(1024, 1024, 5), glow: '#ffffff' },
        { name: 'Boots', map: picture(1024, 1024, 2) }, { name: 'Belt' }
    ]);
    await L.apply(root);
    assert.deepEqual(meshes(root).map(m => (m.material.userData.rrLayers ? m.userData.rrLayeredParts.join('+') : m.parent.name)), ['Uniform', 'Boots+Belt']);
});

test('a map on the first coordinates is in a part\'s row only where its own program reads it (it has a picture)', async t => {
    stubPictures(t);
    const metal = picture(256, 256, 0);
    const { root } = character([
        { name: 'Plate', surface: metal, shine: 0.7 },
        { name: 'Rivets', surface: metal, shine: 0.6, map: picture(256, 256, 1) },
        { name: 'Weave', surface: picture(256, 256, 2), surfaceUv1: true, shine: 0.5 }
    ]);
    await L.apply(root);
    const table = meshes(root)[0].material.userData.rrLayers.table.image.data;
    assert.equal(table[2], L.NONE, 'no picture: injectShine never read its surface map (vMapUv is not there)');
    assert.equal(table[22], 0, 'with a picture it does');
    assert.equal(table[42], 1, 'on the second coordinates always');
    assert.deepEqual([table[7], table[27], table[47]], [8, 8, 8 + 2], 'and only the weave reads it on uv1');
});

/** A worn prop's template as the loader leaves one: plain meshes straight under its root, recentred together. */
function prop() {
    const root = new THREE.Group();
    root.name = 'glb';
    const specs = [{ name: 'Accessories', shine: 0.68 }, { name: 'Grappler straps' }, { name: 'Grapple spike', shine: 0.78 }];
    const pieces = specs.map((spec, k) => {
        const mesh = new THREE.Mesh(boxGeometry(k, false), material(spec));
        mesh.userData.parts = [{ name: spec.name, pivot: [0, 0, 0] }];
        mesh.userData.lodIndex = k;
        mesh.position.set(-0.1, 0.2, 0.05);
        root.add(mesh);
        return mesh;
    });
    // One piece set apart from the others: its places go through its own matrix into the first one's frame.
    pieces[2].position.set(0.3, -0.1, 0.2);
    pieces[2].quaternion.setFromEuler(new THREE.Euler(0.3, 1.1, -0.4));
    pieces[2].scale.setScalar(1.25);
    root.userData.glbTextures = [];
    return { root, pieces };
}

function worldPlaces(mesh, from, count) {
    mesh.updateWorldMatrix(true, false);
    const out = [], v = new THREE.Vector3();
    for (let i = 0; i < count; i++) out.push(v.fromBufferAttribute(mesh.geometry.attributes.position, from + i).applyMatrix4(mesh.matrixWorld).toArray());
    return out;
}
const near = (a, b, label) => a.forEach((p, i) => p.forEach((x, c) => assert.ok(Math.abs(x - b[i][c]) < 1e-5, label + ': ' + x + ' vs ' + b[i][c])));

test('a worn prop\'s rigid pieces that draw alike become one mesh in the first piece\'s frame; the template stays', async t => {
    stubPictures(t);
    const { root, pieces } = prop();
    const entry = L.rigid(root);
    await entry.promise;
    assert.equal(root.children.length, 3, 'the template keeps its pieces');
    const made = entry.ready.made;
    assert.equal(made.length, 1, 'the metal pieces merge; the straps alone stay a piece');
    const { mesh, parts } = made[0];
    assert.deepEqual(mesh.userData.rrLayeredParts, ['Accessories', 'Grapple spike'], 'named as the file names them');
    assert.equal(mesh.isSkinnedMesh, undefined);
    assert.equal(mesh.geometry.attributes.skinIndex, undefined);
    assert.equal(mesh.renderOrder, 0, 'the order the pieces drew at');
    assert.deepEqual(parts, [pieces[0], pieces[2]]);
    root.add(mesh);
    const n0 = pieces[0].geometry.attributes.position.count, n2 = pieces[2].geometry.attributes.position.count;
    near(worldPlaces(mesh, 0, n0), worldPlaces(pieces[0], 0, n0), 'first piece');
    near(worldPlaces(mesh, n0, n2), worldPlaces(pieces[2], 0, n2), 'the piece set apart');
    const table = mesh.material.userData.rrLayers.table.image.data;
    assert.deepEqual([table[8], table[28]], [Math.fround(0.68), Math.fround(0.78)], 'each piece\'s own shine');
    root.remove(mesh);
});

test('a piece mirrored against the first keeps the same side facing out (its triangles wound the other way)', async t => {
    stubPictures(t);
    const { root, pieces } = prop();
    pieces[2].scale.set(-1.25, 1.25, 1.25);
    await L.rigid(root).promise;
    const { mesh } = L.rigid(root).ready.made[0];
    root.add(mesh);
    const n0 = pieces[0].geometry.attributes.position.count, i0 = pieces[0].geometry.index.count;
    // Each triangle's face in the world, merged against the piece drawn on its own (three turns a mirrored piece's front).
    const face = (object, index, base, offset) => {
        object.updateWorldMatrix(true, false);
        const p = [0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(object.geometry.attributes.position, index.getX(base + j) + offset).applyMatrix4(object.matrixWorld));
        const n = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
        return object.matrixWorld.determinant() < 0 ? n.negate() : n;
    };
    const own = pieces[2].geometry.index;
    for (let tri = 0; tri < own.count; tri += 3) {
        const a = face(pieces[2], own, tri, 0), b = face(mesh, mesh.geometry.index, i0 + tri, 0);
        assert.ok(a.dot(b) > 0, 'triangle ' + tri / 3 + ' faces the same way');
    }
    assert.ok(n0 > 0);
    root.remove(mesh);
});

test('a wearer\'s copy takes the merged mesh in place of the pieces, and has the pieces back when the harpoon is wanted', async t => {
    stubPictures(t);
    const { root } = prop();
    const joints = { RightHand: [0, 0, 0], RightLowerArm: [0, 1, 0] };
    const json = { wear: { part: 'RightHand', joints } };
    const object = new THREE.Group(), bone = new THREE.Bone();
    object.add(bone);
    const scene = { _materials: [] };
    const holder = { object, wornRest: { joints, bones: { RightHand: { node: bone, local: new THREE.Matrix4() } } } };
    const first = Reactor3D.Worn.put(holder, root, json, { name: 'Props/Grappler' }, scene);
    holder.worn = [first];
    assert.equal(first.children.length, 3, 'the pieces until the merge is made');
    await L.rigid(root).promise;
    await Promise.resolve();
    assert.equal(first.children.length, 2, 'then the merged mesh and the straps');
    assert.ok(first.children[0].material.userData.rrLayers, 'in the first piece\'s place');
    assert.equal(first.children[0].material.userData.rrLayers, L.rigid(root).ready.made[0].mesh.material.userData.rrLayers, 'layers shared, material its own');
    assert.notEqual(first.children[0].material, L.rigid(root).ready.made[0].mesh.material);
    assert.equal(first.children[0].geometry, L.rigid(root).ready.made[0].mesh.geometry, 'one geometry for every wearer');
    assert.equal(scene._materials.length, 2, 'the scene lights the merged material and the straps\', not the pieces\' gone');
    assert.ok(scene._materials.includes(first.children[0].material));
    const second = Reactor3D.Worn.put({ ...holder, worn: [] }, root, json, { name: 'Props/Grappler' }, scene);
    assert.equal(second.children.length, 2, 'once made, a wearer takes it at once');
    second.parent.remove(second);
    // The Tactical grapple's harpoon (Rope.grapplerOf): the pieces again, for this wearer.
    assert.equal(Reactor3D.Worn.apart(holder, /^grapple[\s_]?spike/i), true);
    assert.equal(first.parent, null, 'the merged copy taken off');
    const again = holder.worn[0];
    assert.equal(again.children.length, 3);
    assert.ok(again.children.some(c => /^grapple[\s_]?spike/i.test(c.userData.parts[0].name)));
    assert.equal(Reactor3D.Worn.apart(holder, /^grapple[\s_]?spike/i), false, 'nothing merged to take apart');
    Reactor3D.Worn.clear(holder);
    assert.equal(scene._materials.length, 2, 'only the second wearer\'s materials still lit');
});

test('WORN off: a wearer keeps the pieces', async t => {
    stubPictures(t);
    withSwitch(t, 'WORN', false);
    assert.equal(L.rigid(prop().root), null);
});

// The Demo's own built character, merged as the game merges it (the pictures stubbed: their sizes are the file's).
const demo = process.env.RR_DEMO_DIR || path.join(repoRoot, 'template', 'Demo');
const elija = path.join(demo, '3d', 'Actors', 'Elija', 'source', 'Elija.glb');
test('Elija: 26 parts in 8 meshes, every merged part\'s places and coordinates its own', { skip: !fs.existsSync(elija) && 'the Demo is not beside this copy' }, async t => {
    stubPictures(t);
    const buf = fs.readFileSync(elija), { json, bin } = Reactor3D.readGlb(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const binStart = 20 + buf.readUInt32LE(12) + 8;
    const load = Reactor3D._loadGlbTexture;
    Reactor3D._loadGlbTexture = (j, b, info, base, textures) => {
        if (!info) return null;
        const source = j.textures[info.index].source, view = j.bufferViews[j.images[source].bufferView], at = binStart + (view.byteOffset || 0);
        const texture = picture(buf.readUInt32BE(at + 16), buf.readUInt32BE(at + 20), source);
        textures.push(texture);
        return texture;
    };
    let root;
    try { root = Reactor3D.buildGlbTemplate(json, bin, '', null); } finally { Reactor3D._loadGlbTexture = load; }
    const parts = new Map();
    root.traverse(o => { if (o.isMesh) parts.set(o.name || o.parent.name, o); });
    const report = await L.apply(root);
    assert.deepEqual([report.before, report.after], [26, 8]);
    const merged = meshes(root).filter(m => m.material.userData.rrLayers);
    assert.deepEqual(merged.map(m => m.userData.rrLayeredParts[0]), ['Body', 'Starship_uniform', 'Field_fasteners_and_controls']);
    for (const m of merged) {
        let at = 0;
        for (const [row, name] of m.userData.rrLayeredParts.entries()) {
            const part = parts.get(name);
            assertSlice(m, part, at, name, row);
            at += part.geometry.attributes.position.count;
        }
    }
    assert.deepEqual(meshes(root).filter(m => !m.material.userData.rrLayers).map(m => m.name || m.parent.name),
        ['Hair', 'Hair_soft', 'Facial_hair', 'Facial_hair_soft', 'Brows']);
});
