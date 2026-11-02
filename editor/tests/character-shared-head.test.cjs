'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Body = require('../src/forge/Character3D/HumanBody.js');
require('../src/forge/Character3D/HumanTargets.js');
const Head = require('../src/forge/Character3D/CharacterHeadMesh.js');
const Data = require('../src/forge/Character3D/HeadMeshData.js');
const Model = require('../src/forge/Character3D/CharacterModel.js');
let pack;
test.before(async () => { pack = await Body.loadPack(); });
const recipe = gender => ({ gender, outfit: [], hair: { style: 'bald', brows: { style: 'none' }, lashes: false } });
const build = input => Model.build(pack, input, {}, { quality: 'preview', skinSize: 64, atlasSize: 64 });

test('the visible face and its native driver have no gender midpoint switch', () => {
    const positions = gender => {
        const r = Body.normalizeRecipe(recipe(gender)), built = Body.build(pack, r);
        return Head.positions(pack, built.shaped, r);
    };
    const a = positions(0.4999), b = positions(0.5001), female = positions(0), male = positions(1);
    assert.equal(a.length, b.length);
    assert.equal(female.length, male.length);
    let step = 0, difference = 0;
    for (let i = 0; i < a.length; i++) { step = Math.max(step, Math.abs(a[i] - b[i])); difference = Math.max(difference, Math.abs(female[i] - male[i])); }
    assert.ok(step < 0.00015, 'midpoint step in metres: ' + step);
    assert.ok(difference > 0.015, 'the shared surface retains distinct endpoint sculpts');
});

test('all gender endpoints share feature anchors, topology and normalized skin bindings', () => {
    assert.equal(Data.version, 2);
    const common = Data.common || Data.F;
    assert.equal(Data.F.off.length, Data.M.off.length);
    const count = Data.F.off.length / 3;
    assert.equal(common.bind.length, count * Data.K);
    for (const field of ['rim', 'low', 'rimIn', 'lowIn']) assert.ok(common[field].every(row => row.every(v => v >= 0 && v < count)), field + ' anchors address retained vertices');
    for (const [outer, inner, span] of common.opening) assert.ok(outer >= 0 && outer < count && inner >= 0 && inner < count && span > 0);
    for (let i = 0; i < count; i++) {
        let sum = 0;
        for (let k = 0; k < Data.K; k++) {
            const v = common.bind[i * Data.K + k], w = common.w[i * Data.K + k];
            assert.ok(v >= 0 && v < pack.vertexCount && w >= 0 && Number.isFinite(w)); sum += w;
        }
        assert.ok(Math.abs(sum - 1) < 0.00001, 'binding weight sum at vertex ' + i);
    }
});

test('Cheekbones controls the visible upper-cheek projection independently of cheek fullness', () => {
    for (const gender of [0, .5, 1]) {
        const surface = value => {
            const r = Body.normalizeRecipe({ gender, shapes: { cheekBones: value, cheeks: 0 } });
            const built = Body.build(pack, r);
            return Head.positions(pack, built.shaped, r);
        };
        const low = surface(-1), neutral = surface(0), high = surface(1);
        const rim = Data.common.rim.flat(), eye = rim.reduce((sum, v) => sum + neutral[v * 3 + 1], 0) / rim.length;
        let lower = 0, upper = 0, count = 0;
        for (let v = 0; v < neutral.length / 3; v++) {
            const x = Math.abs(neutral[v * 3]), y = eye - neutral[v * 3 + 1];
            if (x < .035 || x > .070 || y < .015 || y > .040) continue;
            lower += neutral[v * 3 + 2] - low[v * 3 + 2];
            upper += high[v * 3 + 2] - neutral[v * 3 + 2]; count++;
        }
        assert.ok(count > 10, 'upper-cheek sample is populated');
        assert.ok(lower / count > .001, 'lower setting retracts the visible ridge, not only its width');
        assert.ok(upper / count > .001, 'higher setting projects the visible ridge');
        assert.ok([...low, ...high].every(Number.isFinite), 'cheekbone geometry stays finite');
    }
});

test('Cheeks retracts the broad front cheek below the outer eye instead of only narrowing its cage', () => {
    for (const gender of [0, .5, 1]) {
        const surface = value => {
            const r = Body.normalizeRecipe({ gender, shapes: { cheeks: value, cheekBones: 0 } });
            return Head.positions(pack, Body.build(pack, r).shaped, r);
        };
        const low = surface(-1), neutral = surface(0), high = surface(1);
        const rim = Data.common.rim.flat(), eye = rim.reduce((sum, v) => sum + neutral[v * 3 + 1], 0) / rim.length;
        let retract = 0, project = 0, count = 0;
        for (let v = 0; v < neutral.length / 3; v++) {
            const x = Math.abs(neutral[v * 3]), y = eye - neutral[v * 3 + 1];
            if (x < .030 || x > .065 || y < .035 || y > .065) continue;
            retract += neutral[v * 3 + 2] - low[v * 3 + 2];
            project += high[v * 3 + 2] - neutral[v * 3 + 2]; count++;
        }
        assert.ok(count > 10, 'broad anterior cheek sample is populated');
        assert.ok(retract / count > .002, 'low Cheeks visibly retracts the marked front surface');
        assert.ok(project / count > .002, 'high Cheeks restores front cheek fullness');
    }
});

test('the face replacement keeps the native outer ears visible', () => {
    const ear = Body.earMask(pack), hidden = (Data.common || Data.F).hide;
    const covered = hidden.filter(v => ear[v] >= 0.02);
    assert.equal(covered.length, 0, 'native ear vertices removed by frontal face coverage: ' + covered.slice(0, 8));
});

test('default human pupil spacing stays in proportion to the visible head', () => {
    // An ear-root proxy, not an attractiveness score or a rule for authored
    // faces. The former defaults had a pupil/width ratio of 0.67-0.70.
    const ears = Body.earMask(pack), body = [...new Set(pack.body.source)];
    for (const gender of [0, 0.5, 1]) {
        const result = build(recipe(gender)), head = result.parts.find(p => p.name === 'Head skin'), P = result.built.shaped;
        const eyes = head.ocular.map(eye => eye.c), eyeY = (eyes[0][1] + eyes[1][1]) / 2;
        const roots = body.filter(v => ears[v] > 0.02 && ears[v] < 0.15 && Math.abs(P[v * 3 + 1] - eyeY) < 0.04);
        assert.ok(roots.length > 8, 'both native ear roots are represented');
        const width = 2 * Math.min(...roots.map(v => Math.abs(P[v * 3])));
        const ratio = Math.abs(eyes[0][0] - eyes[1][0]) / width;
        assert.ok(ratio > 0.42 && ratio < 0.59, 'gender ' + gender + ', pupil/ear-root width: ' + ratio);
    }
});

test('the outside face edge meets the native skin without a raised rim', () => {
    const common = Data.common || Data.F, K = Data.K;
    for (const gender of [0, 0.5, 1]) {
        const r = Body.normalizeRecipe(recipe(gender)), built = Body.build(pack, r), P = built.shaped;
        const surface = Head.positions(pack, P, r);
        let maximum = 0, sampled = 0;
        for (let i = 0; i < common.fade.length; i++) {
            if (common.fade[i] > 0.0001) continue;
            const point = [0, 0, 0]; let sum = 0;
            for (let k = 0; k < K; k++) {
                const v = common.bind[i * K + k] * 3, weight = common.w[i * K + k]; sum += weight;
                for (let a = 0; a < 3; a++) point[a] += P[v + a] * weight;
            }
            maximum = Math.max(maximum, Math.hypot(...point.map((value, a) => surface[i * 3 + a] - value / sum)));
            sampled++;
        }
        assert.ok(sampled > 20, 'the whole outer boundary is sampled');
        assert.ok(maximum < 0.0006, 'gender ' + gender + ', raised edge in metres: ' + maximum);
    }
});

test('minimum cheek controls keep the shared cheek join above the native skin', () => {
    const s = Data.common, K = Data.K;
    for (const gender of [0, .5, 1]) {
        const r = Body.normalizeRecipe({ gender, shapes: { cheeks: -1, cheekBones: -1 } }), built = Body.build(pack, r);
        const P = built.shaped, Q = Head.positions(pack, P, r), rim = s.rim.flat(), eye = rim.reduce((sum, v) => sum + Q[v * 3 + 1], 0) / rim.length;
        let sampled = 0, minimum = Infinity;
        for (let v = 0; v < s.fade.length; v++) {
            if (s.fade[v] < .02 || s.fade[v] > .9 || Math.abs(Q[v * 3]) < .035 || Math.abs(Q[v * 3]) > .100 || eye - Q[v * 3 + 1] < .015 || eye - Q[v * 3 + 1] > .080) continue;
            const ids = s.bind.slice(v * K, v * K + 3), [a, b, c] = ids.map(i => i * 3);
            const u = [0, 1, 2].map(k => P[b + k] - P[a + k]), w = [0, 1, 2].map(k => P[c + k] - P[a + k]);
            const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], length = Math.hypot(...n);
            if (length < 1e-12) continue;
            const point = [0, 0, 0]; let total = 0;
            for (let k = 0; k < K; k++) { const weight = s.w[v * K + k], i = s.bind[v * K + k]; total += weight; for (let axis = 0; axis < 3; axis++) point[axis] += P[i * 3 + axis] * weight; }
            const distance = n.reduce((sum, x, k) => sum + x / length * (Q[v * 3 + k] - point[k] / total), 0);
            minimum = Math.min(minimum, distance); sampled++;
        }
        assert.ok(sampled > 10, 'side-cheek overlap is sampled');
        assert.ok(minimum > -.0002, 'face must not sink through retained native cheek: ' + minimum);
    }
});

test('the face edge keeps the native skin shade at its join', () => {
    const Shading = require('../src/forge/Character3D/CharacterShading.js');
    const parts = [{ name: 'Body' }, { name: 'Head skin', edge: [0, 1],
        interpolation: { offsets: [0, 1, 2], vertices: [12, 12], weights: [1, 1] } }];
    const ao = [new Float32Array([0.3]), new Float32Array([0.7, 0.7])];
    Shading.headFromBody(parts, ao, { body: { source: [12] } });
    assert.equal(ao[1][0], ao[0][0], 'the inherited edge cannot become a lighter patch');
    assert.ok(ao[1][1] > 0.7, 'the face centre retains its softer shade');
});

test('the facial skin uses a finite, exported pore texture on its own coordinates', () => {
    const result = build(recipe(0.5)), skin = result.parts.find(p => p.name === 'Head skin');
    assert.equal(skin.normalTexCoord, 1);
    assert.equal(skin.uvs1.length, skin.positions.length / 3 * 2);
    assert.ok([...skin.uvs1].every(Number.isFinite));
    const texture = result.textures[skin.normalTexture];
    assert.ok(texture && texture.repeat);
    assert.equal(texture.data.length, texture.width * texture.height * 4);
    let deviation = 0;
    for (let i = 0; i < texture.data.length; i += 4) deviation = Math.max(deviation, Math.abs(texture.data[i] - 128), Math.abs(texture.data[i + 1] - 128));
    assert.ok(deviation > 0 && deviation < 30, 'fine relief stays bounded: ' + deviation);
});

test('human face refinement stays out of the other species and animal heads', () => {
    assert.ok(Head.applies(recipe(0.5)));
    for (const species of ['elf', 'orc', 'alien', 'ferengi']) assert.equal(Head.applies({ species }), false);
    assert.equal(Head.applies({ species: 'human', head: { kind: 'cat' } }), false);
});

test('a full blink unfolds both lids over the globe while preserving the brow surface', () => {
    const X = require('../src/forge/Character3D/CharacterExpressions.js');
    for (const gender of [0, 0.5, 1]) {
        const result = build(recipe(gender)), at = result.parts.findIndex(p => p.name === 'Eyelids'), lids = result.parts[at];
        const headAt = result.parts.findIndex(p => p.name === 'Head skin'), head = result.parts[headAt], pose = X.pose(pack, result, 'blink', 1, X.emotionOf(result.recipe));
        const posed = pose.positions[at];
        assert.ok(posed, 'blink has a visible lid morph');
        const visibleNormals = Head.normalsOf(posed, lids.index);
        for (let i = 0; i < visibleNormals.length; i += 3) {
            if (Math.hypot(...visibleNormals.subarray(i, i + 3)) < 0.5) continue;
            const dot = visibleNormals[i] * lids.normals[i] + visibleNormals[i + 1] * lids.normals[i + 1] + visibleNormals[i + 2] * lids.normals[i + 2];
            assert.ok(dot > 0.999, 'saved base normals shade the visible closed lid: ' + dot);
        }
        for (let k = 0; k < 2; k++) {
            const cx = head.ocular[k].c[0];
            const closest = upper => lids.lidRows.map((row, i) => ({ row, i })).filter(x => x.row.eye === k && x.row.upper === upper && x.row.t === 1)
                .reduce((a, b) => Math.abs(lids.positions[a.i * 3] - cx) < Math.abs(lids.positions[b.i * 3] - cx) ? a : b).i;
            const upper = closest(true), lower = closest(false);
            const gap = Math.abs(posed[upper * 3 + 1] - posed[lower * 3 + 1]);
            assert.ok(gap < 0.0002, 'gender ' + gender + ', eye ' + k + ', remaining gap ' + gap);
            assert.ok(posed[upper * 3 + 2] > lids.positions[upper * 3 + 2] + 0.001, 'the lid unfolds from behind the eyeball');
        }
        if (pose.positions[headAt]) {
            let moved = 0;
            for (let i = 0; i < head.positions.length; i++) moved = Math.max(moved, Math.abs(head.positions[i] - pose.positions[headAt][i]));
            assert.ok(moved < 0.00001, 'the brow and socket stay still during a blink: ' + moved);
        }
    }
});

test('expression strength never limits a blink or changes speech articulation', () => {
    const X = require('../src/forge/Character3D/CharacterExpressions.js'), result = build(recipe(0.5));
    for (const name of ['blink', 'viseme_aa', 'viseme_fv']) {
        const plain = X.field(pack, result, name).delta;
        for (const strength of [0.3, 2]) {
            const own = X.field(pack, result, name, 1, { strength }).delta;
            assert.equal(plain.findIndex((value, i) => own[i] !== value), -1, name + ' remains physically complete at strength ' + strength);
        }
    }
});

test('saved morphs omit skin vertices with no visible triangle', () => {
    const X = require('../src/forge/Character3D/CharacterExpressions.js'), result = build(recipe(0));
    const used = result.parts.map(part => new Set(part.index));
    for (const target of X.morphTargets(pack, result, ['expression_happy', 'blink'])) for (const part of target.parts) {
        assert.ok(part.indices.every(i => used[part.part].has(i)), target.name + ' only stores rendered vertices');
    }
});

test('the mouth has a real opening whose opposing rims rest together and separate for speech', () => {
    const X = require('../src/forge/Character3D/CharacterExpressions.js');
    const profiles = [recipe(0), recipe(0.5), recipe(1),
        { ...recipe(0), ancestry: { african: 1, asian: 0, caucasian: 0, people: 'subSaharan' } },
        { ...recipe(1), ancestry: { african: 0, asian: 1, caucasian: 0, people: 'eastAsian' } }];
    for (const profile of profiles) {
        const result = build(profile), at = result.parts.findIndex(p => p.name === 'Head skin'), head = result.parts[at];
        const fit = Head.lipFit(pack, result.built.shaped, result.recipe, head), edges = new Map();
        for (let i = 0; i < head.index.length; i += 3) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
            const x = head.index[i + a], y = head.index[i + b], key = Math.min(x, y) + ':' + Math.max(x, y);
            edges.set(key, (edges.get(key) || 0) + 1);
        }
        const rim = [...new Set([...edges].filter(([, n]) => n === 1).flatMap(([key]) => key.split(':').map(Number)))]
            .filter(v => Math.abs(head.positions[v * 3]) < fit.corner && Math.abs(head.positions[v * 3 + 1] - fit.center) < 0.006);
        assert.ok(rim.length >= 12, 'there is an uncapped oral opening');
        const range = p => { const ys = rim.map(v => p[v * 3 + 1]); return Math.max(...ys) - Math.min(...ys); };
        assert.ok(range(head.positions) < 0.003, 'the resting rims meet within 3 mm');
        const middle = rim.filter(v => Math.abs(head.positions[v * 3]) < fit.corner * 0.25).map(v => head.positions[v * 3 + 1]);
        const line = (Math.min(...middle) + Math.max(...middle)) / 2;
        const teeth = result.parts.find(p => p.name === 'Teeth'), upperIds = new Set(pack.helpers.upperTeeth.source);
        const edgesY = Array.from(teeth.source, (v, i) => upperIds.has(v) ? teeth.positions[i * 3 + 1] : Infinity);
        const clearance = Math.min(...edgesY) - line;
        assert.ok(clearance > 0.001, 'upper teeth stay behind the closed upper lip: ' + clearance);
        let front = -Infinity;
        for (let i = 2; i < teeth.positions.length; i += 3) front = Math.max(front, teeth.positions[i]);
        assert.ok(front < fit.front - 0.004, 'both arches remain inside the lips across ancestry: ' + (fit.front - front));
        const pose = X.pose(pack, result, 'surprised', 1, X.emotionOf(result.recipe));
        assert.ok(range(pose.positions[at]) > 0.012, 'the mouth opens without stretching a cap across it');
    }
});
