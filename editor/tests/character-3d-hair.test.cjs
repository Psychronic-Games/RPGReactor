'use strict';
// Forge › 3D Character Builder hair (RRCharacterHair): every head style, beard, mustache and brow grows on the shaped
// body, stays outside it and off the face, keeps the mouth open, follows an exaggerated head, and saves into the GLB.
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const Body = require(path.join(root, 'src', 'forge', 'Character3D', 'HumanBody.js'));
global.RRHumanBody = Body;
const Hair = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterHair.js'));
const Glb = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterGlb.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));

let pack, man, woman;
test.before(async () => {
    pack = await Body.loadPack();
    man = Body.build(pack, { gender: 1 });
    woman = Body.build(pack, { gender: 0 });
});

const tris = parts => parts.reduce((s, p) => s + p.index.length / 3, 0);
const byName = (parts, name) => parts.find(p => p.name === name);

/** Every vertex finite, skin on real bones summing to one, colors in range, indices in range. */
function assertWellFormed(parts, built, label) {
    for (const p of parts) {
        const count = p.positions.length / 3;
        assert.equal(p.normals.length, p.positions.length, label + ' normals');
        assert.equal(p.colors.length, p.positions.length, label + ' colors');
        assert.equal(p.joints.length, count * 4, label + ' joints');
        for (let i = 0; i < p.positions.length; i++) assert.ok(Number.isFinite(p.positions[i]), `${label} ${p.name} position ${i}`);
        for (let i = 0; i < p.colors.length; i++) assert.ok(p.colors[i] >= 0 && p.colors[i] <= 1.0001, `${label} ${p.name} color ${p.colors[i]}`);
        for (let i = 0; i < p.index.length; i++) assert.ok(p.index[i] < count, `${label} ${p.name} index`);
        for (let v = 0; v < count; v++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) { sum += p.weights[v * 4 + k]; assert.ok(p.joints[v * 4 + k] < built.bones.length); }
            assert.ok(Math.abs(sum - 1) < 1e-4, `${label} ${p.name} weights ${sum}`);
        }
    }
}

test('a hair recipe is completed and kept in range', () => {
    const h = Hair.normalizeHair({ style: 'nope', color: 'red', length: 9, volume: -1, part: 'diagonal', facial: { style: 'fullBeard', length: 0 }, brows: { style: 'x' } });
    assert.equal(h.style, Hair.DEFAULT_HAIR.style);
    assert.equal(h.color, Hair.DEFAULT_HAIR.color);
    assert.equal(h.length, 2.5);
    assert.equal(h.volume, 0);
    assert.equal(h.part, Hair.DEFAULT_HAIR.part);
    assert.equal(h.facial.style, 'fullBeard');
    assert.equal(h.facial.length, 0.3);
    assert.equal(h.brows.style, 'natural');
    for (const list of [Hair.STYLES, Hair.FACIAL, Hair.BROWS]) assert.equal(new Set(list.map(s => s.id)).size, list.length);
});

test('beard strands caught against an extremely broad, short face stay finite', () => {
    const built = Body.build(pack, { gender: 1, headSize: 2.2, height: 0.12, weight: 0.78, muscle: 0.85,
        shapes: { headWidth: 2.5, headHeight: -2.5, headDepth: 2.5, jaw: 3, cheeks: 3, mouthWidth: 2.5, eyeSpacing: 2.5, eyeSize: 4, neck: 0.8, noseDepth: 1.2, noseWidth: 1, browRidge: 0.8 } });
    const parts = Hair.build(pack, built, { style: 'sidePart', facial: { style: 'longBeard' }, brows: { style: 'bushy' } }, { budget: 0.3 });
    assert.ok(byName(parts, 'Facial hair'), 'the beard still has real strands');
    assertWellFormed(parts, built, 'compressed broad head');
    for (const part of parts) for (const field of ['normals', 'uvs']) assert.ok(part[field].every(Number.isFinite), part.name + ' ' + field);
});

test('every head style builds on a man and a woman, within budget, skinned to the head', () => {
    const headIndex = man.bones.findIndex(b => b.name === 'Head');
    for (const style of Hair.STYLES) for (const [label, built] of [['man', man], ['woman', woman]]) {
        const parts = Hair.build(pack, built, { style: style.id });
        assertWellFormed(parts, built, `${style.id}/${label}`);
        const hair = byName(parts, 'Hair');
        if (style.id === 'bald') { assert.equal(hair, undefined); continue; }
        assert.ok(hair, `${style.id} has hair`);
        // The budget is the geometry: the blended twin over the cut-out hair is the same cards drawn again.
        const own = parts.filter(p => !p.soft);
        assert.ok(tris(own) < 45000, `${style.id}/${label} ${tris(own)} triangles`);
        // Above the neck everything rides on the head alone.
        const P = hair.positions, J = hair.joints, W = hair.weights;
        for (let v = 0; v < P.length / 3; v++) if (P[v * 3 + 1] > built.bones[headIndex].head[1]) assert.ok(J[v * 4] === headIndex && W[v * 4] === 1);
    }
});

test('hair lies outside the body and long hair stays off the face', () => {
    const H = Hair._internal.measure(pack, woman);
    for (const style of ['long', 'veryLong', 'bob', 'ponytail', 'dreadlocks', 'braid', 'afro', 'sidePart']) {
        const hair = byName(Hair.build(pack, woman, { style, fringe: 0 }), 'Hair');
        const P = hair.positions;
        let inside = 0, onFace = 0;
        const halfW = Math.abs(H.eyeL[0] - H.eyeR[0]) / 2 + H.eyeRadius * 1.5;
        for (let i = 0; i < P.length; i += 3) {
            const p = [P[i], P[i + 1], P[i + 2]];
            const s = H.surface(p);
            if (Number.isFinite(s.d) && s.d < -0.004) inside++;
            // In front of the eyes, between brow and mouth.
            if (Math.abs(p[0]) < halfW && p[1] < H.eyeY + H.eyeRadius && p[1] > H.mouth[1] && p[2] > H.eyeL[2]) onFace++;
        }
        assert.ok(inside / (P.length / 3) < 0.03, `${style}: ${inside} of ${P.length / 3} vertices inside the body`);
        assert.equal(onFace, 0, `${style}: ${onFace} vertices over the eyes`);
    }
});

test('every beard and mustache grows on the lower face and leaves the mouth open', () => {
    const H = Hair._internal.measure(pack, man);
    for (const f of Hair.FACIAL) {
        const parts = Hair.build(pack, man, { style: 'bald', facial: { style: f.id } });
        assertWellFormed(parts, man, f.id);
        const facial = byName(parts, 'Facial hair');
        // Stubble is painted into the skin (RRCharacterSkin), with no geometry of its own.
        if (f.id === 'none' || f.id === 'stubble') { assert.equal(facial, undefined); continue; }
        assert.ok(facial && facial.index.length > 0, f.id);
        const P = facial.positions;
        const lipW = H.lipHalf * 0.8, mouthY = (H.lipTop + H.lipBottom) / 2, lipH = (H.lipTop - H.lipBottom) / 2;
        let inMouth = 0, aboveNose = 0;
        for (let i = 0; i < P.length; i += 3) {
            // Sideburns may climb beside the ears; the middle of the face stays clear above the nose.
            if (P[i + 1] > H.noseTip[1] + 0.005 && Math.abs(P[i]) < H.lipHalf * 1.2) aboveNose++;
            // The lips' own opening, in front of the teeth; the walrus is allowed to hang over it.
            if (Math.abs(P[i]) < lipW && Math.abs(P[i + 1] - mouthY) < lipH * 0.5 && P[i + 2] > H.lipFront - 0.01) inMouth++;
        }
        assert.equal(aboveNose, 0, `${f.id} reaches above the nose (${aboveNose})`);
        if (f.id !== 'walrus') assert.equal(inMouth, 0, `${f.id} covers the mouth (${inMouth})`);
    }
});

test('brows sit above the eyes, one per side, and every brow style builds', () => {
    const H = Hair._internal.measure(pack, man);
    for (const b of Hair.BROWS) {
        const brows = byName(Hair.build(pack, man, { style: 'bald', brows: { style: b.id } }), 'Brows');
        if (b.id === 'none') { assert.equal(brows, undefined); continue; }
        // The brow patch lies over the brow ridge on each side: above the eye, below the forehead.
        const P = brows.positions;
        let left = 0, right = 0, y = 0;
        for (let i = 0; i < P.length; i += 3) {
            y += P[i + 1] / (P.length / 3);
            if (P[i] > 0) left++; else right++;
        }
        assert.ok(y > H.eyeY + H.eyeRadius * 1.1 && y < H.eyeY + H.eyeRadius * 2.6, `${b.id} brow height`);
        assert.ok(left > 0 && right > 0, b.id);
    }
});

test('brows stay out of the baked shading; lashes: the upper lid long and dense, the lower short', () => {
    const parts = Hair.build(pack, woman, { style: 'bald' });
    assert.equal(byName(parts, 'Brows').noShade, true, 'a sheet over the skin shades nothing under it');
    const lashes = byName(parts, 'Lashes'), T = Hair.lashTexture(128);
    // The picture: the left half (upper lid) holds far more lash than the right (lower lid).
    let upper = 0, lower = 0;
    for (let y = 0; y < T.height; y++) for (let x = 0; x < T.width; x++) (x < T.width / 2 ? (upper += T.data[(y * T.width + x) * 4 + 3]) : (lower += T.data[(y * T.width + x) * 4 + 3]));
    assert.ok(upper > lower * 2, `upper ${upper}, lower ${lower}`);
    // Each lid's cards on its own half: those above the eye on the left, below it on the right.
    const P = lashes.positions, U = lashes.uvs, H = Hair._internal.measure(pack, woman);
    let wrong = 0;
    for (let i = 0; i < P.length / 3; i++) if (Math.abs(P[i * 3 + 1] - H.eyeY) > H.eyeRadius * 0.5 && (P[i * 3 + 1] > H.eyeY) !== (U[i * 2] <= 0.5)) wrong++;
    assert.equal(wrong, 0, 'lash cards on the wrong half');
});

test('a full beard is a soft volume of flat strand cards; a budget thins hair and beard alike', () => {
    const full = byName(Hair.build(pack, man, { style: 'bald', facial: { style: 'fullBeard' } }), 'Facial hair');
    assert.equal(full.texture, 'hair.png');
    assert.equal(full.noShade, true, 'its layers stay out of the baked occlusion');
    // Every triangle wound to face the way its normals do, so no lock is lit from inside.
    const P = full.positions, N = full.normals, I = full.index;
    let against = 0;
    for (let t = 0; t < I.length; t += 3) {
        const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
        const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
        const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
        if (f[0] * (N[a] + N[b] + N[c]) + f[1] * (N[a + 1] + N[b + 1] + N[c + 1]) + f[2] * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) against++;
    }
    assert.equal(against, 0);
    for (const recipe of [{ style: 'long' }, { style: 'bald', facial: { style: 'longBeard' } }]) {
        const a = tris(Hair.build(pack, man, recipe)), b = tris(Hair.build(pack, man, recipe, { budget: 0.4 }));
        assert.ok(b < a * 0.6, `${JSON.stringify(recipe)}: ${a} → ${b}`);
    }
});

test('the strand picture: card sides and ends fade to single strands; solid hair (buns, braids, an afro) is opaque', () => {
    const T = Hair.hairTexture(512), a = (u, v) => T.data[(Math.floor(v * 512) * 512 + Math.floor(u * 512)) * 4 + 3];
    assert.ok(a(0.125, 0.02) > 200, 'the root row in a lane\'s middle, where solid hair sits');
    assert.ok(a(0.5, 0.02) < 20 && a(0.25, 0.5) < 20, 'a card\'s border is clear');
    let end = 0;
    for (let x = 0; x < 512; x++) end = Math.max(end, T.data[(511 * 512 + x) * 4 + 3]);
    assert.ok(end < 40, 'a card never ends in a cut line: ' + end);
    // Every vertex of a bun or braid (solid, no picture coordinates of its own) samples the opaque middle.
    for (const style of ['bun', 'braid', 'afro']) {
        const hair = byName(Hair.build(pack, woman, { style }), 'Hair'), U = hair.uvs;
        let clear = 0;
        for (let i = 0; i < U.length; i += 2) if (U[i + 1] < 0.03 && a(U[i], U[i + 1]) < 60) clear++;
        assert.ok(clear / (U.length / 2) < 0.2, `${style}: ${clear} of ${U.length / 2} root vertices on clear picture`);
    }
});

test('hair is drawn twice: a cut-out core and a blended twin for its soft edges; weak hardware gets the core alone', () => {
    const parts = Hair.build(pack, woman, { style: 'long' });
    const core = byName(parts, 'Hair'), soft = byName(parts, 'Hair soft');
    assert.ok(core.cutout && core.alphaCutoff >= 0.5);
    assert.ok(soft && !soft.cutout && soft.opacity < 1 && soft.positions === core.positions, 'the same cards, blended');
    const weak = Hair.build(pack, woman, { style: 'long' }, { budget: 0.5 });
    assert.equal(byName(weak, 'Hair soft'), undefined);
    assert.ok(byName(weak, 'Hair').alphaCutoff < 0.5, 'a lower cut keeps the core full on its own');
});

test('random hair colors follow the people and age; dyed hair keeps natural brows', () => {
    const blond = ['#c99a5b', '#e0c48a', '#a0763f'];
    for (let seed = 1; seed < 120; seed++) {
        const h = Hair.randomHair(seed, { gender: 'female', people: 'eastAsian' });
        assert.ok(!blond.includes(h.color), 'no blond East Asian by chance: ' + h.color);
        if (['#6a2fa0', '#2f6ad0', '#d02f6a', '#2fa06a', '#e0e0f0'].includes(h.color)) assert.ok(h.brows.color && h.brows.color !== h.color && h.facial.color !== h.color, 'dyed hair, natural brows and beard');
    }
    assert.ok(Array.from({ length: 40 }, (_, k) => Hair.randomHair(k + 1, { gender: 'male', people: 'european', age: 80 }).color).filter(c => ['#9c9c9c', '#bdbdbd', '#dcdcdc'].includes(c)).length > 15, 'old men mostly grey');
});

test('hair follows an exaggerated head and body', () => {
    const big = Body.build(pack, { gender: 1, weight: 3, shapes: { headWidth: 2.5, headHeight: 2.5, neck: 3 } });
    const small = Body.build(pack, { gender: 0, age: 11 });
    const top = parts => { const P = byName(parts, 'Hair').positions; let y = -Infinity; for (let i = 1; i < P.length; i += 3) y = Math.max(y, P[i]); return y; };
    for (const style of ['sidePart', 'long', 'afro', 'ponytail']) {
        const a = Hair.build(pack, big, { style, facial: { style: 'fullBeard' } });
        const b = Hair.build(pack, small, { style });
        assertWellFormed(a, big, style + '/big');
        assertWellFormed(b, small, style + '/child');
        assert.ok(top(a) > big.height - 0.01 && top(a) < big.height + 0.25, `${style} big head`);
        assert.ok(top(b) > small.height - 0.01 && top(b) < small.height + 0.2, `${style} child`);
    }
});

test('the same recipe and seed grow the same hair; random recipes are complete', () => {
    const a = Hair.build(pack, woman, { style: 'longWavy', curl: 0.4 }, { seed: 7 });
    const b = Hair.build(pack, woman, { style: 'longWavy', curl: 0.4 }, { seed: 7 });
    assert.deepEqual(Array.from(a[0].positions.slice(0, 300)), Array.from(b[0].positions.slice(0, 300)));
    assert.deepEqual(Hair.randomHair(42), Hair.randomHair(42));
    for (let s = 1; s < 30; s++) assert.deepEqual(Hair.randomHair(s), Hair.normalizeHair(Hair.randomHair(s)));
});

test('hair saves into the character GLB with its colors, two-sided', () => {
    const built = Body.build(pack, { gender: 1 });
    built.parts[0].color = '#c69c7f';
    built.parts.push(...Hair.build(pack, built, { style: 'ponytail', facial: { style: 'goatee' } }));
    const glb = Glb.toGlb(built, { name: 'Test', idle: { armAngle: 0.2 } });
    const { json } = Optimizer.parseGlb(glb);
    const names = json.meshes.map(m => m.name);
    for (const name of ['Body', 'Hair', 'Facial hair', 'Brows', 'Lashes']) assert.ok(names.includes(name), name);
    const hair = json.meshes.find(m => m.name === 'Hair').primitives[0];
    assert.ok(hair.attributes.COLOR_0 != null);
    assert.equal(json.accessors[hair.attributes.COLOR_0].count, json.accessors[hair.attributes.POSITION].count);
    assert.equal(json.materials[hair.material].doubleSided, true);
    for (const node of json.nodes.filter(n => n.mesh != null)) assert.equal(node.skin, 0);
});
