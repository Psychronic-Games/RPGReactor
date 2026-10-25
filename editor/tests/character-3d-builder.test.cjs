'use strict';
// Forge › 3D Character Builder: sliders shape one MakeHuman-based body (RRHumanBody), and Save to Project writes a
// skinned GLB (RRCharacterGlb) whose Mixamo-named skeleton the Rig tool reads, with an Idle clip that keeps the
// skeleton live in the game's model reader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const Body = require(path.join(root, 'src', 'forge', 'Character3D', 'HumanBody.js'));
const Glb = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterGlb.js'));
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
global.ModelRigger = require(path.join(root, 'src', 'database', 'ModelRigger.js'));
const AutoRig = require(path.join(root, 'src', 'database', 'ModelAutoRig.js'));

let pack;
test.before(async () => { pack = await Body.loadPack(); });

const lowestY = part => { let min = Infinity; for (let i = 1; i < part.positions.length; i += 3) min = Math.min(min, part.positions[i]); return min; };

test('a recipe is completed and kept in range; ancestry is a mix', () => {
    const r = Body.normalizeRecipe({ gender: 4, age: 3, weight: -1, ancestry: { african: 2, asian: 0, caucasian: 2 }, shapes: { noseWidth: 9 }, skin: 'red' });
    assert.equal(r.gender, 1);
    assert.equal(r.age, Body.MIN_AGE);
    // Past the natural ranges as far as Extreme reaches, and no further.
    assert.equal(r.weight, Body.MACRO_RANGES.weight.extreme[0]);
    assert.equal(r.ancestry.african, 0.5);
    assert.equal(r.ancestry.caucasian, 0.5);
    assert.equal(r.shapes.noseWidth, Body.SLIDER_BY_KEY.get('noseWidth').extreme);
    assert.equal(r.shapes.belly, 0);
    assert.equal(r.skin, Body.DEFAULT_RECIPE.skin);
});

test('the body-type blends always add up to one whole body', () => {
    for (const recipe of [{}, { gender: 0.2, age: 40, muscle: 0.9, weight: 0.1 }, { gender: 1, age: 90 }, { age: 11, muscle: 0, weight: 1 }]) {
        const w = Body.targetWeights(recipe);
        // The ancestry targets carry each age's whole shape, so they sum to one; the build targets are
        // offsets from the average build and sum to at most one.
        let macro = 0, race = 0;
        for (const [name, value] of Object.entries(w)) {
            if (name.startsWith('macro/')) macro += value;
            if (name.startsWith('race/')) race += value;
        }
        assert.ok(macro <= 1 + 1e-9, 'macro ' + macro);
        assert.ok(Math.abs(race - 1) < 1e-9, 'race ' + race);
    }
});

test('the sliders change the body the way their names say', () => {
    const height = r => Body.build(pack, r).height;
    const woman = height({ gender: 0 }), man = height({ gender: 1 }), child = height({ age: 11 });
    assert.ok(woman > 1.45 && woman < 1.7, 'woman ' + woman);
    assert.ok(man > 1.65 && man < 1.85, 'man ' + man);
    assert.ok(child < woman - 0.2, 'child ' + child);
    assert.ok(height({ gender: 1, height: 1 }) < 2.15, 'tallest man stays a man');
    assert.ok(height({ gender: 1, height: 0 }) > 1.4, 'shortest man stays a man');
    // The torso's front at the navel: the bones say where that is on each body.
    const belly = r => {
        const built = Body.build(pack, r), p = built.parts[0].positions;
        const y = built.bones.find(b => b.name === 'Spine').head[1];
        let front = -Infinity;
        for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i]) < 0.12 && Math.abs(p[i + 1] - y) < 0.03) front = Math.max(front, p[i + 2]);
        return front;
    };
    assert.ok(belly({ weight: 1 }) > belly({ weight: 0 }) + 0.015, 'heavier is rounder at the belly');
    assert.ok(belly({ weight: 1, muscle: 0 }) > belly({ weight: 1 }) + 0.04, 'heavy without muscle is fat');
});

test('every body stands on the floor with its eyes in its head', () => {
    for (const recipe of [{}, { gender: 1, weight: 1 }, { age: 11 }, Body.randomRecipe(7)]) {
        const built = Body.build(pack, recipe);
        assert.ok(Math.abs(lowestY(built.parts[0])) < 1e-6);
        const head = built.bones.find(b => b.name === 'Head').head;
        const eyes = built.parts.find(p => p.name === 'Eyes').positions;
        for (let i = 0; i < eyes.length; i += 3) {
            assert.ok(Math.abs(eyes[i]) < 0.06 && eyes[i + 1] > head[1] && eyes[i + 1] < built.height, 'eye vertex ' + i);
        }
    }
});

test('combined short and lean extremes thin the torso without turning it through its centerline', () => {
    for (const gender of [0, 1]) {
        const recipe = { gender, height: -0.6, weight: -1, muscle: -0.3, headSize: 0.5,
            shapes: { legLength: -2.5, armLength: -2.5, neckLength: -2.5, headWidth: -2.5 } };
        const built = Body.build(pack, recipe), thin = Body.build(pack, Object.assign({}, recipe, { weight: 0, muscle: 0 }));
        let checked = 0, width = 0, naturalWidth = 0;
        const trunk = new Set();
        for (const v of new Set(pack.body.source)) {
            let torso = 0;
            for (let k = 0; k < 4; k++) if (/^(Hips|Spine[12]?)$/.test(pack.bones[pack.skinJoints[v * 4 + k]].name)) torso += pack.skinWeights[v * 4 + k];
            if (torso < 0.85 || Math.abs(pack.positions[v * 3]) < 0.005) continue;
            checked++;
            trunk.add(v);
            assert.ok(pack.positions[v * 3] * built.shaped[v * 3] > 0, 'torso skin stays on its own side of the spine');
            width += Math.abs(built.shaped[v * 3]); naturalWidth += Math.abs(thin.shaped[v * 3]);
        }
        assert.ok(checked > 500, 'sampled the complete trunk');
        assert.ok(width < naturalWidth, 'negative weight still produces a thinner body');
        const cross = (P, a, b, c) => {
            const x = P[b] - P[a], y = P[b + 1] - P[a + 1], z = P[b + 2] - P[a + 2];
            const X = P[c] - P[a], Y = P[c + 1] - P[a + 1], Z = P[c + 2] - P[a + 2];
            return [y * Z - z * Y, z * X - x * Z, x * Y - y * X];
        };
        for (let t = 0; t < pack.body.index.length; t += 3) {
            const vertices = Array.from(pack.body.index.subarray(t, t + 3), i => pack.body.source[i]);
            if (!vertices.every(v => trunk.has(v))) continue;
            const ids = vertices.map(v => v * 3), before = cross(thin.shaped, ...ids), after = cross(built.shaped, ...ids);
            const area = before.reduce((sum, x) => sum + x * x, 0);
            if (area > 1e-22) assert.ok(before.reduce((sum, x, i) => sum + x * after[i], 0) > 0, 'shrinking does not reverse a torso face');
        }
    }
});

test('a seed gives the same character every time', () => {
    assert.deepEqual(Body.randomRecipe(1234), Body.randomRecipe(1234));
    assert.notDeepEqual(Body.randomRecipe(1234), Body.randomRecipe(1235));
    assert.equal(Body.randomRecipe(99).seed, 99);
});

test('ancestry names the world\'s peoples: each a blend, face offsets and its own skin tones', () => {
    const ids = Body.PEOPLES.map(p => p.id);
    for (const id of ['european', 'subSaharan', 'eastAsian', 'southAsian', 'southeastAsian', 'middleEastern', 'nativeAmerican', 'latinAmerican', 'pacificIslander', 'aboriginalAustralian']) assert.ok(ids.includes(id), id);
    for (const p of Body.PEOPLES) {
        assert.ok(Math.abs(Body.ANCESTRY.reduce((s, a) => s + p.mix[a], 0) - 1) < 1e-6, p.id + ' blend sums to one');
        assert.ok(p.tones.length >= 3 && p.tones.every(t => /^#[0-9a-f]{6}$/.test(t)), p.id + ' tones');
        for (const k in p.face) assert.ok(Body.SLIDER_BY_KEY.has(k) && Math.abs(p.face[k]) <= 0.6, p.id + ' ' + k);
    }
    const r = Body.normalizeRecipe(Body.withPeople({}, 'nativeAmerican'));
    assert.equal(r.ancestry.people, 'nativeAmerican');
    assert.ok(r.ancestry.asian > r.ancestry.caucasian && r.ancestry.caucasian > r.ancestry.african);
    assert.ok(Body.PEOPLE_BY_ID.get('nativeAmerican').tones.includes(r.skin));
    const w = Body.targetWeights(r), plain = Body.targetWeights(Object.assign({}, r, { ancestry: Object.assign({}, r.ancestry, { people: '' }) }));
    assert.ok((w['shape/cheekBones-incr'] || 0) > (plain['shape/cheekBones-incr'] || 0), 'the people shapes the face');
    assert.equal(Body.normalizeRecipe({ ancestry: { african: 1, asian: 0, caucasian: 0 } }).ancestry.people, '', 'a blend made by hand names no people');
    assert.equal(Body.normalizeRecipe(Body.withPeople({ skin: '#6a8a4a' }, 'european', true)).skin, '#6a8a4a', 'a species skin is kept');
    // Random bodies come from every corner of the world, each with a tone of its own people's range.
    const seen = new Set();
    for (let seed = 1; seed < 80; seed++) {
        const rr = Body.randomRecipe(seed);
        seen.add(rr.ancestry.people);
        const tones = Body.PEOPLE_BY_ID.get(rr.ancestry.people).tones, lum = h => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
        assert.ok(lum(rr.skin) <= lum(tones[0]) + 2 && lum(rr.skin) >= lum(tones[tones.length - 1]) - 2, rr.ancestry.people + ' tone ' + rr.skin);
    }
    assert.ok(seen.size >= 9, 'random peoples ' + [...seen]);
    // Eye colors as they occur: blue and green are among Europeans, never drawn for Sub-Saharan Africans.
    const blue = id => Array.from({ length: 40 }, (_, k) => Body.irisFor(id, k / 40)).filter(c => c === '#3a8ad8').length;
    assert.ok(blue('european') > 0 && blue('subSaharan') === 0 && blue('eastAsian') === 0);
});

test('a big ear grows from the head: the cheek in front of it stays where it was', () => {
    const mask = Body.earMask(pack), B = pack.positions, t = pack.targets.get('shape/earSize-incr');
    const cheek = [];
    for (let i = 0; i < t.index.length; i++) if (mask[t.index[i]] === 0 && B[t.index[i] * 3 + 2] > 0.08) cheek.push(t.index[i]);
    assert.ok(cheek.length > 10, 'the ear-size target moves the cheek');
    const natural = Body.shape(pack, { shapes: { earSize: 1 } }), big = Body.shape(pack, { shapes: { earSize: 3 } });
    let drift = 0, ear = 0;
    for (const v of cheek) drift = Math.max(drift, Math.hypot(big[v * 3] - natural[v * 3], big[v * 3 + 1] - natural[v * 3 + 1], big[v * 3 + 2] - natural[v * 3 + 2]));
    for (let v = 0; v < pack.vertexCount; v++) if (mask[v] > 0.99) ear = Math.max(ear, Math.hypot(big[v * 3] - natural[v * 3], big[v * 3 + 1] - natural[v * 3 + 1], big[v * 3 + 2] - natural[v * 3 + 2]));
    assert.ok(ear > 0.008, 'the ear grows ' + ear);
    assert.ok(drift < ear * 0.25, `the cheek moves ${drift}, the ear ${ear}`);
});

test('the eye white is shaded under the upper lid and at the corners; extremes ease out where targets fold', () => {
    const built = Body.build(pack, {}), eyes = built.parts.find(p => p.name === 'Eyes');
    assert.ok(eyes.colors && eyes.keepColors, 'the eyes carry their own shade');
    const P = eyes.positions, C = eyes.colors;
    let cy = 0, n = 0, top = 1, mid = 0;
    for (let i = 0; i < P.length; i += 3) if (P[i] > 0) { cy += P[i + 1]; n++; }
    cy /= n;
    for (let i = 0; i < P.length; i += 3) if (P[i] > 0) { if (P[i + 1] > cy + 0.008) top = Math.min(top, C[i]); if (Math.abs(P[i + 1] - cy) < 0.001) mid = Math.max(mid, C[i]); }
    assert.ok(top < mid - 0.2, `top ${top}, middle ${mid}`);
    // A nose shrunk past natural runs out instead of turning inside out; a man's chest takes no bust shape.
    const w = slider => Body.targetWeights({ shapes: slider })['shape/noseWidth-decr'];
    assert.ok(w({ noseWidth: -3 }) < 1.6 && w({ noseWidth: -3 }) > w({ noseWidth: -1.5 }));
    assert.equal(Body.targetWeights({ gender: 1, shapes: { breastPoint: 2 } })['shape/breastPoint-incr'], undefined);
});

test('very short legs shorten whole; an aged skin carries the face\'s lines, a young one none', () => {
    const hip = r => Body.build(pack, r).bones.find(b => b.name === 'LeftUpLeg').head[1];
    const a = hip({ shapes: { legLength: -1 } }), b = hip({ shapes: { legLength: -1.8 } }), c = hip({ shapes: { legLength: -2.5 } });
    assert.ok(a > b + 0.05 && b > c + 0.05, `hips at ${a}, ${b}, ${c}`);
    // The leg-length target itself never goes past half its reach (it crushes the thigh); the rest is pressing.
    assert.ok(Body.targetWeights({ shapes: { legLength: -2.5 } })['shape/legLength-decr'] <= 0.5 + 1e-9);
    const Skin = require(path.join(root, 'src', 'forge', 'Character3D', 'CharacterSkin.js'));
    assert.equal(Skin.ageStep(25), 0);
    assert.equal(Skin.ageStep(62), 60);
    const young = Skin.paint(pack, '#c69c7f', {}, { size: 256 }), none = Skin.paint(pack, '#c69c7f', {}, { size: 256, age: 0 }), old = Skin.paint(pack, '#c69c7f', {}, { size: 256, age: 85 });
    assert.deepEqual(Array.from(none.data), Array.from(young.data), 'no age, no lines');
    let darker = 0;
    for (let i = 0; i < old.data.length; i += 4) if (old.data[i] < young.data[i] - 3) darker++;
    assert.ok(darker > 150, 'lines painted: ' + darker);
});

test('extreme muscle bulks round: no fins, spikes or humps, and the muscles really grow', () => {
    const B0 = pack.positions, nips = Body.anatomyFields(pack).nipples.map(n => n.v);
    const body = [...new Set(pack.body.source)].filter(v => nips.every(n => Math.hypot(B0[v * 3] - B0[n * 3], B0[v * 3 + 1] - B0[n * 3 + 1], B0[v * 3 + 2] - B0[n * 3 + 2]) > 0.025));
    const arm = Body.maskOf(pack, ['shape/upperArmMuscle-incr']);
    for (const gender of [0, 1]) for (const weight of [0, 0.5, 1, 1.5]) {
        const r = { gender, weight, muscle: 2.5 }, P = Body.shape(pack, r), Q = Body.shape(pack, Object.assign({}, r, { muscle: 1 }));
        // What the extra muscle moves, against that move smoothed over the mesh: a fin, a ridge or a hump is
        // a place moved far more (or less) than the skin round it.
        const d = new Float32Array(P.length);
        for (let i = 0; i < P.length; i++) d[i] = P[i] - Q[i];
        const sm = Body.relax(pack, Float32Array.from(d), 8);
        let rough = 0, grow = 0;
        for (const v of body) rough = Math.max(rough, Math.hypot(d[v * 3] - sm[v * 3], d[v * 3 + 1] - sm[v * 3 + 1], d[v * 3 + 2] - sm[v * 3 + 2]));
        for (let v = 0; v < pack.vertexCount; v++) if (arm[v] > 0.9) grow = Math.max(grow, Math.hypot(d[v * 3], d[v * 3 + 1], d[v * 3 + 2]));
        assert.ok(rough < 0.011, `gender ${gender}, weight ${weight}: the bulk is uneven by ${(rough * 1000).toFixed(1)} mm`);
        assert.ok(grow > 0.03, `gender ${gender}, weight ${weight}: the biceps grow ${(grow * 100).toFixed(1)} cm`);
    }
});

test('the saved model is a skinned GLB with Mixamo bones and an Idle clip', () => {
    const built = Body.build(pack, { gender: 1 });
    built.parts[0].color = '#c69c7f';
    const eye = fs.readFileSync(path.join(Body.dataFolder(), built.parts[1].texture));
    const glb = Glb.toGlb(built, { name: 'Test', images: { [built.parts[1].texture]: eye }, idle: { armAngle: 0.2 } });
    const { json } = Optimizer.parseGlb(glb);
    const skin = json.skins[0];
    const names = skin.joints.map(j => json.nodes[j].name);
    for (const name of ['Hips', 'Spine', 'Head', 'LeftArm', 'RightForeArm', 'LeftHandThumb3', 'RightHandPinky1', 'LeftFoot']) assert.ok(names.includes(name), name);
    assert.equal(json.meshes.length, 2);
    for (const node of json.nodes.filter(n => n.mesh != null)) assert.equal(node.skin, 0);
    const prim = json.meshes[0].primitives[0];
    assert.equal(json.accessors[prim.attributes.JOINTS_0].count, json.accessors[prim.attributes.POSITION].count);
    assert.equal(json.animations.length, 1);
    assert.equal(json.animations[0].name, 'Idle');
    assert.ok(json.animations[0].channels.some(c => json.nodes[c.target.node].name === 'LeftArm'));
    assert.equal(json.images.length, 1);
});

test('the Rig tool reads every marker, fingers included, from the bones', () => {
    const built = Body.build(pack, {});
    const joints = built.bones.map(b => ({ name: b.name, parent: b.parent, position: b.head }));
    const read = AutoRig.markersFromSkeleton(joints);
    assert.ok(read.humanoid);
    for (const key of ['hips', 'shoulderL', 'elbowR', 'wristL', 'thumbBaseL', 'thumbTipR', 'kneeL', 'ankleR']) assert.ok(read.found.includes(key), key);
});

test('the builder is on the Forge sidebar and loaded by the editor page', () => {
    const forge = fs.readFileSync(path.join(root, 'src', 'forge', 'ForgeManager.js'), 'utf8');
    assert.match(forge, /id: 'character-3d-builder'[\s\S]*?new Character3DBuilder\(\)/);
    const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    for (const file of ['HumanBody.js', 'CharacterGlb.js', 'Character3DBuilder.js']) assert.ok(page.includes(`src/forge/Character3D/${file}`), file);
});
