'use strict';
// Forge › 3D Character Builder, Merfolk (RRMerfolkBody): both sexes build at the sliders' ends; the tail grows from
// the skin's own cut edge with no gap; its clips loop and hold whole numbers; leaving the species brings the legs back;
// nothing for legs or feet can be worn; the saved GLB carries the tail's bones, its clips and its pictures; costs stay
// within budget.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'forge', 'Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody');
for (const name of ['HumanTargets', 'CharacterOutfit', 'CharacterAtlas', 'CharacterWardrobe', 'CharacterProps', 'CharacterSpecies', 'CharacterSkin', 'CharacterHair', 'CreatureBody', 'CharacterGlb', 'CharacterShading', 'CharacterDetail', 'CharacterPoses']) load(name);
const Mer = load('MerfolkBody');
const Model = load('CharacterModel');
const Wardrobe = load('CharacterWardrobe');
const Optimizer = require(path.join(root, 'src', 'utils', 'GlbOptimizer.js'));
const { PNG } = require('pngjs');

let pack;
test.before(async () => { pack = await Body.loadPack(); });

const merfolk = over => Object.assign(Model.withSpecies({ gender: (over && over.gender) ?? 0 }, 'merfolk'), over || {});
const part = (result, name) => result.parts.find(p => p.name === name);
const tris = (result, names) => result.parts.filter(p => names.includes(p.name)).reduce((s, p) => s + p.index.length / 3, 0);

test('deep hip contours carry into the upper tail instead of dropping into a flat cylindrical wall',()=>{
    let checked=0;
    for(const p of require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES){
        const result=Model.build(pack,Model.normalize(merfolk({...p.patch,outfit:[]})),{}, {static:true,skinSize:64,atlasSize:64,hairBudget:0});
        const tail=part(result,'Tail'),count=Mer.cutOf(pack).ring.length;
        const ys=Array.from({length:count},(_,i)=>tail.positions[i*3+1]),lo=Math.min(...ys),hi=Math.max(...ys);
        if(hi-lo<=result.built.height*.10)continue;
        const next=Array.from({length:64},(_,i)=>tail.positions[(count+i)*3+1]);
        assert.ok(Math.max(...next)>hi-result.built.height*.045,p.id+' upper taper follows the high seat');
        assert.ok(Math.min(...next)>lo-result.built.height*.045,p.id+' lower cut remains connected');checked++;
    }
    assert.ok(checked>=2,'contrasting deep body contours are exercised');
});

test('hip and back fin roots follow the raised tail contour on deep hips',()=>{
    for(const profile of require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES.filter(p=>['pear-female','barrel-male'].includes(p.id))){
        const r=Model.normalize(merfolk({...profile.patch,outfit:[],merfolk:{fin:'fan',length:2,hipFins:true,backFin:true}}));
        const result=Model.build(pack,r,{}, {static:true,skinSize:64,atlasSize:64,hairBudget:0}),tail=part(result,'Tail'),fins=part(result,'Fins');
        // The first membrane is the terminal fan, followed by two pelvic fins
        // and the dorsal crest. Sample their embedded root row only.
        let start=(Mer.FIN_SHAPES.fan.rays*4+3)*15,worst=0;
        for(const [columns,stride]of [[15,9],[15,9],[25,7]]){
            for(let c=0;c<columns;c++){
                const root=(start+c*stride)*3;let nearest=Infinity;
                for(let v=0;v<tail.positions.length;v+=3)nearest=Math.min(nearest,Math.hypot(...[0,1,2].map(k=>fins.positions[root+k]-tail.positions[v+k])));
                worst=Math.max(worst,nearest);
            }
            start+=columns*stride;
        }
        assert.ok(worst<result.built.height*.025,profile.id+' fin roots remain within one sampled surface cell: '+worst.toFixed(4));
    }
});

/** Every part well formed: finite numbers, skin indices in range, weights summing to one, pictures' coordinates in range. */
function assertSound(result, label) {
    for (const p of result.parts) {
        const n = p.positions.length / 3;
        for (let i = 0; i < p.positions.length; i++) assert.ok(Number.isFinite(p.positions[i]), `${label}: ${p.name} position ${i}`);
        for (let i = 0; i < p.normals.length; i++) assert.ok(Number.isFinite(p.normals[i]), `${label}: ${p.name} normal ${i}`);
        for (let i = 0; i < p.index.length; i++) assert.ok(p.index[i] < n, `${label}: ${p.name} index ${i}`);
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) { assert.ok(p.joints[v * 4 + k] < result.bones.length, `${label}: ${p.name} joint`); sum += p.weights[v * 4 + k]; }
            assert.ok(Math.abs(sum - 1) < 0.02, `${label}: ${p.name} weights at ${v} sum to ${sum}`);
        }
        // Tiled finish maps (repeat) take physical coordinates past 0..1; a part with a picture of its own stays inside it.
        const maps = [p.texture, p.normalTexture, p.metallicRoughnessTexture, p.emissiveTexture, p.iridescenceThicknessTexture].filter(Boolean);
        const tiled = maps.length > 0 && maps.every(name => result.textures && result.textures[name] && result.textures[name].repeat);
        if (p.uvs && !tiled) for (let i = 0; i < p.uvs.length; i++) assert.ok(p.uvs[i] >= -1e-6 && p.uvs[i] <= 1 + 1e-6, `${label}: ${p.name} uv in the picture`);
    }
}

// ── posing on the CPU, as the GLB plays: bones rest unrotated ─────────────
const qmul = (a, b) => [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qrot = (q, v) => { const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; };
function sampleAt(times, values, size, f) { return Array.from(values.slice(f * size, f * size + size)); }
/** The lowest skin drawn at frame f of a clip, the whole body raised by `lift`. */
function lowestAt(result, clip, f, lift) {
    const B = result.bones, L = B.map(() => [0, 0, 0, 1]), T = B.map(() => null);
    for (const tr of clip.tracks) { if (tr.path === 'translation') T[tr.bone] = sampleAt(clip.times, tr.values, 3, f); else L[tr.bone] = sampleAt(clip.times, tr.values, 4, f); }
    const W = [], P = [];
    B.forEach((b, i) => {
        if (b.parent < 0) { W[i] = L[i]; P[i] = (T[i] || b.head).slice(); P[i][1] += lift; return; }
        W[i] = qmul(W[b.parent], L[i]);
        const o = qrot(W[b.parent], T[i] || [b.head[0] - B[b.parent].head[0], b.head[1] - B[b.parent].head[1], b.head[2] - B[b.parent].head[2]]);
        P[i] = [P[b.parent][0] + o[0], P[b.parent][1] + o[1], P[b.parent][2] + o[2]];
    });
    let low = Infinity;
    for (const p of result.parts) for (let k = 0; k < p.index.length; k += 7) {
        const v = p.index[k];
        let y = 0;
        for (let q = 0; q < 4; q++) { const w = p.weights[v * 4 + q]; if (!w) continue; const j = p.joints[v * 4 + q]; y += w * (P[j][1] + qrot(W[j], [p.positions[v * 3] - B[j].head[0], p.positions[v * 3 + 1] - B[j].head[1], p.positions[v * 3 + 2] - B[j].head[2]])[1]); }
        low = Math.min(low, y);
    }
    return low;
}

test('the species is listed and a merfolk recipe keeps its tail settings in range', () => {
    const S = load('CharacterSpecies');
    assert.ok(S.BY_ID.has('merfolk'), 'Merfolk is a species');
    const r = Model.normalize(Object.assign(merfolk(), { merfolk: { fin: 'nope', colors: 'plaid', length: 9, armFins: 1 } }));
    assert.equal(r.merfolk.fin, 'forked');
    assert.equal(r.merfolk.colors, 'teal');
    assert.equal(r.merfolk.length, Mer.LENGTH.extreme[1]);
    assert.equal(r.merfolk.armFins, true);
    assert.equal(r.features.tail.type, 'none', 'no second tail');
    assert.equal(Model.normalize(Object.assign({}, r, { species: 'human' })).merfolk, undefined, 'a human carries no merfolk settings');
});

test('mermaid and merman build at the sliders\' ends, a tail and fins in place of legs', () => {
    const ends = [{}, { weight: 3, extreme: true }, { weight: -0.8, extreme: true }, { height: 2, extreme: true }, { height: -1, extreme: true }, { muscle: 2, extreme: true }, { age: 90 }, { shapes: { hips: 2, butt: 2 }, extreme: true }];
    for (const gender of [0, 1]) for (const end of ends) {
        const label = `${gender ? 'merman' : 'mermaid'} ${JSON.stringify(end)}`;
        const result = Model.build(pack, merfolk(Object.assign({ gender, merfolk: { hipFins: true, backFin: true, armFins: true, finEars: true } }, end)), {}, { quality: 'preview', hairBudget: 0.3 });
        assertSound(result, label);
        const tail = part(result, 'Tail'), fins = part(result, 'Fins');
        assert.ok(tail && fins, label + ': a tail and fins');
        // The tail stands on the floor and reaches down to it from the hips.
        let low = Infinity, top = -Infinity;
        for (let i = 1; i < tail.positions.length; i += 3) { low = Math.min(low, tail.positions[i]); top = Math.max(top, tail.positions[i]); }
        const hips = result.bones.find(b => b.name === 'Hips').head[1];
        assert.ok(Math.abs(low) < 0.03, `${label}: the tail lies on the floor (${low})`);
        assert.ok(top > hips, `${label}: the tail reaches above the hips' joint`);
        // No skin of the legs is drawn, and nothing rides on a leg bone.
        const legs = new Set(result.bones.map((b, i) => (Mer.LEG_BONES.test(b.name) ? i : -1)).filter(i => i >= 0));
        for (const p of result.parts) for (let v = 0; v < p.joints.length / 4; v++) for (let k = 0; k < 4; k++) if (p.weights[v * 4 + k] > 1e-4) assert.ok(!legs.has(p.joints[v * 4 + k]), `${label}: ${p.name} rides on a leg bone`);
        const body = part(result, 'Body'), P = body.positions, cut = Mer.cutOf(pack), src = pack.body.source;
        for (let t = 0; t < body.index.length; t += 3) {
            const vs = [body.index[t], body.index[t + 1], body.index[t + 2]].map(i => src[i]);
            assert.ok(!vs.every(v => cut.hidden.has(v)), `${label}: the hidden legs' skin is left out`);
        }
        void P;
    }
});

test('the tail is joined to the body with no gap: the cut\'s edge is shared point for point, normal and skin alike', () => {
    for (const gender of [0, 1]) {
        const result = Model.build(pack, merfolk({ gender, weight: 1.6, extreme: true }), {}, { quality: 'preview', hairBudget: 0.3 });
        const body = part(result, 'Body'), tail = part(result, 'Tail'), cut = Mer.cutOf(pack);
        const src = pack.body.source, ring = new Set(cut.ring);
        // Edges of the drawn skin met by one triangle only, near the cut, all lie on the ring.
        const count = new Map(), key = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
        for (let t = 0; t < body.index.length; t += 3) { const v = [0, 1, 2].map(k => src[body.index[t + k]]); for (const [a, b] of [[v[0], v[1]], [v[1], v[2]], [v[2], v[0]]]) count.set(key(a, b), (count.get(key(a, b)) || 0) + 1); }
        const open = new Set();
        for (const [k, c] of count) if (c === 1) { open.add(Math.floor(k / 65536)); open.add(k % 65536); }
        const near = v => Math.abs(result.built.shaped[v * 3 + 1] - result.bones.find(b => b.name === 'Hips').head[1]) < 0.12;
        for (const v of open) if (near(v)) assert.ok(ring.has(v), `skin edge vertex ${v} near the hips is not on the tail's ring`);
        // Every ring vertex has a tail vertex at the same place, with the same normal and the same skin.
        const renderOf = new Map();
        for (let i = 0; i < src.length; i++) if (!renderOf.has(src[i])) renderOf.set(src[i], i);
        for (const v of cut.ring) {
            const b = renderOf.get(v), bp = [body.positions[b * 3], body.positions[b * 3 + 1], body.positions[b * 3 + 2]];
            let best = -1, bd = Infinity;
            for (let i = 0; i < tail.positions.length / 3; i++) { const d = Math.hypot(tail.positions[i * 3] - bp[0], tail.positions[i * 3 + 1] - bp[1], tail.positions[i * 3 + 2] - bp[2]); if (d < bd) { bd = d; best = i; } }
            assert.ok(bd < 1e-5, `ring vertex ${v} has a tail point on it (${bd})`);
            const sameSkin = [0, 1, 2, 3].every(k => {
                const j = tail.joints[best * 4 + k], w = tail.weights[best * 4 + k];
                let bw = 0;
                for (let q = 0; q < 4; q++) if (body.joints[b * 4 + q] === j) bw += body.weights[b * 4 + q];
                return w < 1e-4 || Math.abs(bw - w) < 0.02;
            });
            assert.ok(sameSkin, `ring vertex ${v} moves with the body`);
            const dn = body.normals[b * 3] * tail.normals[best * 3] + body.normals[b * 3 + 1] * tail.normals[best * 3 + 1] + body.normals[b * 3 + 2] * tail.normals[best * 3 + 2];
            assert.ok(dn > 0.99, `ring vertex ${v} shares the body's normal`);
        }
    }
});

test('every clip loops, holds whole turns and no NaN, and the poses on the floor rest on it', () => {
    for (const gender of [0, 1]) {
        const result = Model.build(pack, merfolk({ gender }), {}, { quality: 'preview', hairBudget: 0.3 });
        const names = result.clips.map(c => c.name);
        assert.deepEqual(names, ['Idle', 'Walk', 'Swim', 'Swim fast', 'Tread', 'Sit', 'Lie', 'Rest']);
        const tailBones = new Set(result.bones.map((b, i) => (/^Tail/.test(b.name) ? i : -1)).filter(i => i >= 0));
        for (const clip of result.clips) {
            const n = clip.times.length;
            for (let i = 1; i < n; i++) assert.ok(clip.times[i] > clip.times[i - 1], clip.name + ' times rise');
            assert.ok(clip.tracks.some(t => tailBones.has(t.bone)), clip.name + ' moves the tail');
            for (const t of clip.tracks) {
                const size = t.path === 'translation' ? 3 : 4;
                assert.equal(t.values.length, n * size, clip.name + ' track length');
                for (const x of t.values) assert.ok(Number.isFinite(x), clip.name + ' finite');
                if (size === 4) {
                    for (let f = 0; f < n; f++) assert.ok(Math.abs(Math.hypot(...t.values.slice(f * 4, f * 4 + 4)) - 1) < 1e-3, clip.name + ' whole quaternion');
                    const a = t.values.slice(0, 4), b = t.values.slice((n - 1) * 4);
                    assert.ok(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]) > 0.9995, `${clip.name} ${result.bones[t.bone].name} ends where it starts`);
                } else for (let k = 0; k < 3; k++) assert.ok(Math.abs(t.values[k] - t.values[(n - 1) * 3 + k]) < 1e-4, clip.name + ' move loops');
            }
        }
        // Standing, moving, sitting, lying and propped: the lowest skin on the floor (a few centimeters either way).
        for (const name of ['Idle', 'Walk', 'Sit', 'Lie', 'Rest']) {
            const clip = result.clips.find(c => c.name === name);
            for (const f of [0, Math.floor(clip.times.length / 3), Math.floor(clip.times.length * 2 / 3)]) {
                const low = lowestAt(result, clip, f, 0);
                assert.ok(low > -0.045 && low < 0.06, `${gender ? 'merman' : 'mermaid'} ${name} frame ${f}: lowest skin at ${low.toFixed(3)}`);
            }
        }
        // Swimming keeps clear of the floor; the fin's kick is a wave along the tail.
        const swim = result.clips.find(c => c.name === 'Swim');
        assert.ok(lowestAt(result, swim, 0, 0) > 0.2, 'swimming is off the floor');
    }
});

test('the builder\'s poses play on a merfolk skeleton: its own motions and the upper body\'s humanoid poses', () => {
    const result = Model.build(pack, merfolk({ gender: 1 }), {}, { quality: 'preview', hairBudget: 0.3 });
    const body = part(result, 'Body');
    assert.ok(Mer.hasTail(result.bones));
    for (const p of Mer.POSES) {
        const clip = Mer.poseClip(result.bones, p.id, body, result.recipe);
        assert.ok(clip && clip.tracks.length, p.id + ' plays');
        for (const t of clip.tracks) { assert.ok(!t.path, p.id + ': the view\'s clip only turns'); for (const x of t.values) assert.ok(Number.isFinite(x), p.id + ' finite'); }
        for (const s of [0, 0.4, 1.1]) assert.ok(Number.isFinite(clip.lift(s)), p.id + ' lift');
        // The upper body's humanoid poses leave the legs' bones alone and keep the tail at its rest on the floor.
        if (Mer.UPPER.includes(p.id)) assert.ok(!clip.tracks.some(t => Mer.LEG_BONES.test(result.bones[t.bone].name)), p.id + ' leaves the legs');
    }
    const sit = Mer.poseClip(result.bones, 'sitRock', body, result.recipe);
    assert.ok(sit.seat && sit.seat.height > 0.25 && sit.seat.height < 0.8, 'sitting on a rock of a sitting height: ' + (sit.seat && sit.seat.height));
    const rock = Mer.rock(sit.seat);
    let top = 0;
    for (let i = 1; i < rock.positions.length; i += 3) top = Math.max(top, rock.positions[i]);
    assert.ok(Math.abs(top - sit.seat.height) < 0.05, 'the rock\'s top is the seat');
    assert.equal(Mer.poseClip(Model.build(pack, { gender: 1 }, {}, { quality: 'preview', hairBudget: 0.3 }).bones, 'swim', null, {}), null, 'a human skeleton has no tail motions');
});

test('switching to and from Merfolk leaves nothing behind: the legs come back, no tail, fins or fin ears remain', () => {
    const human = Model.build(pack, { gender: 0, outfit: [{ id: 'tshirt' }] }, {}, { quality: 'preview', hairBudget: 0.3 });
    const mer = Model.withSpecies({ gender: 0, outfit: [{ id: 'tshirt' }, { id: 'jeans' }, { id: 'boots' }] }, 'merfolk');
    const m2 = Object.assign({}, mer, { merfolk: Object.assign({}, mer.merfolk, { finEars: true, armFins: true }) });
    assert.equal(Model.normalize(m2).morph.earsAway, 1, 'fin ears tuck the ears away');
    const back = Model.withSpecies(m2, 'human');
    assert.equal(back.merfolk, undefined);
    assert.equal(back.morph.earsAway, 0, 'the ears are back');
    const built = Model.build(pack, back, {}, { quality: 'preview', hairBudget: 0.3 });
    assert.ok(!built.bones.some(b => /^Tail/.test(b.name)), 'no tail bones');
    for (const name of ['Tail', 'Fins', 'Scale line']) assert.ok(!part(built, name), 'no ' + name);
    assert.equal(part(built, 'Body').index.length, part(human, 'Body').index.length, 'the whole body is drawn again');
    assert.deepEqual(built.clips.map(c => c.name), ['Idle']);
    // Every other species, from a merfolk, has its legs.
    const S = load('CharacterSpecies');
    for (const s of S.SPECIES) if (s.id !== 'merfolk' && !s.plan) assert.equal(Model.withSpecies(m2, s.id).merfolk, undefined, s.id);
});

test('nothing for legs or feet can be worn on a tail; tops, jewelry and crowns can', () => {
    const blocked = Wardrobe.GARMENTS.filter(g => !Mer.fitsGarment(g.id)).map(g => g.id);
    for (const id of ['jeans', 'shorts', 'leggings', 'skirt', 'dress', 'gown', 'robe', 'boots', 'sneakers', 'sandals', 'greaves', 'tassets', 'bodysuit', 'kilt', 'loincloth', 'powerarmor', 'trenchcoat', 'mh_tee_jeans', 'mh_boots']) assert.ok(blocked.includes(id), id + ' is blocked');
    for (const id of ['tshirt', 'tanktop', 'shirt', 'tunic', 'peasant', 'corset', 'sash', 'breastplate', 'chainmail', 'pauldrons', 'vambraces', 'wraps', 'gloves', 'helm', 'hood', 'vest', 'mh_viking_tunic']) assert.ok(Mer.fitsGarment(id), id + ' can be worn');
    const r = Model.normalize(merfolk({ outfit: Wardrobe.GARMENTS.map(g => ({ id: g.id })) }));
    assert.ok(r.outfit.length > 0 && r.outfit.every(i => Mer.fitsGarment(i.id)));
    for (const preset of Wardrobe.PRESETS) {
        const d = Model.normalize(merfolk({ outfit: preset.items, props: [{ id: 'crown' }, { id: 'necklace' }] }));
        assert.ok(d.outfit.every(i => Mer.fitsGarment(i.id)), preset.id);
    }
    for (let seed = 1; seed <= 8; seed++) assert.ok(Model.random(seed, { species: 'merfolk' }).outfit.every(i => Mer.fitsGarment(i.id)), 'random ' + seed);
    const dressed = Model.build(pack, merfolk({ outfit: [{ id: 'tunic' }, { id: 'breastplate' }], props: [{ id: 'crown' }, { id: 'necklace' }] }), {}, { quality: 'preview', hairBudget: 0.3 });
    assertSound(dressed, 'dressed merfolk');
});

test('each tail fin and each palette builds: the fins differ in outline, the koi in patches', () => {
    const spans = {};
    for (const fin of Mer.FINS.map(f => f[0])) {
        const result = Model.build(pack, merfolk({ merfolk: { fin } }), {}, { quality: 'preview', hairBudget: 0.3 });
        const f = part(result, 'Fins');
        let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
        for (let i = 0; i < f.positions.length; i += 3) { mnx = Math.min(mnx, f.positions[i]); mxx = Math.max(mxx, f.positions[i]); mnz = Math.min(mnz, f.positions[i + 2]); mxz = Math.max(mxz, f.positions[i + 2]); }
        spans[fin] = { wide: mxx - mnx, back: mnz, ratio: (mxx - mnx) / (mxz - mnz) };
    }
    assert.ok(spans.veil.back < spans.forked.back - 0.1, 'the long veil trails furthest');
    assert.ok(spans.forked.wide > spans.fan.wide, 'the forked fin spans widest');
    assert.ok(spans.fan.ratio > spans.veil.ratio * 1.15, 'the fan is broad for its length, the veil long: ' + JSON.stringify(spans));
    const tone = colors => { const t = part(Model.build(pack, merfolk({ merfolk: { colors } }), {}, { quality: 'preview', hairBudget: 0.3 }), 'Tail').colors; let r = 0, g = 0, b = 0, spread = 0; for (let i = 0; i < t.length; i += 3) { r += t[i]; g += t[i + 1]; b += t[i + 2]; spread += Math.abs(t[i] - t[i + 2]); } const n = t.length / 3; return { r: r / n, g: g / n, b: b / n, spread: spread / n }; };
    const T = Object.fromEntries(Mer.COLORS.map(([id]) => [id, tone(id)]));
    assert.ok(T.teal.g > T.teal.r && T.coral.r > T.coral.b && T.deepBlue.b > T.deepBlue.r && T.gold.r > T.gold.b, 'each palette its hue');
    assert.ok(T.koi.spread > 0.1, 'koi carries orange patches on white');
});

test('the saved GLB carries the tail\'s bones, every clip, the scale and fin pictures and the relief picture', async () => {
    const result = Model.build(pack, merfolk({ gender: 0, merfolk: { fin: 'veil', armFins: true } }), {}, { quality: 'preview', hairBudget: 0.3 });
    const glb = await Model.toGlb(result, 'Mermaid', tex => { const png = new PNG({ width: tex.width, height: tex.height }); png.data = Buffer.from(tex.data); return new Uint8Array(PNG.sync.write(png)); });
    const { json } = Optimizer.parseGlb(glb);
    const joints = json.skins[0].joints.map(j => json.nodes[j].name);
    for (const n of ['Hips', 'LeftUpLeg', 'RightFoot', 'Tail', 'Tail2', 'Tail8', 'TailFin', 'TailFin2', 'LeftHandIndex1', 'Head']) assert.ok(joints.includes(n), n + ' is a bone');
    const tailBone = json.nodes.findIndex(n => n.name === 'Tail');
    assert.ok(json.nodes[json.nodes.findIndex(n => n.name === 'Hips')].children.includes(tailBone), 'the tail hangs from the hips');
    assert.deepEqual(json.animations.map(a => a.name), ['Idle', 'Walk', 'Swim', 'Swim fast', 'Tread', 'Sit', 'Lie', 'Rest']);
    const images = json.images.map(i => i.name);
    for (const n of ['merscales.png', 'merscales_n.png', 'merfin.png', 'merscatter.png', 'skin.png']) assert.ok(images.includes(n), n);
    const tailMat = json.materials[json.meshes.findIndex(m => m.name === 'Tail')];
    assert.ok(tailMat.normalTexture, 'the scales\' relief is in the file');
    const finMat = json.materials[json.meshes.findIndex(m => m.name === 'Fins')];
    assert.equal(finMat.alphaMode, 'BLEND', 'the fins are see-through');
    assert.ok(finMat.doubleSided);
    // The game's clip names: Idle, Walk, Swim and Tread play by themselves for those states.
    const R = {};
    const runtime = fs.readFileSync(path.join(root, '..', 'runtime', 'reactor_3d_models.js'), 'utf8');
    const block = runtime.slice(runtime.indexOf('Reactor3D.CLIP_STATE_NAMES = {'), runtime.indexOf('};', runtime.indexOf('Reactor3D.CLIP_STATE_NAMES = {')) + 2);
    vm.runInNewContext('var Reactor3D = R; ' + block, { R });
    const named = state => json.animations.some(a => R.CLIP_STATE_NAMES[state].includes(a.name.toLowerCase()));
    for (const state of ['idle', 'walking', 'swimming', 'treading']) assert.ok(named(state), state + ' has its clip');
});

test('budgets: triangles, pictures, clip keys and build time stay small', () => {
    const r = merfolk({ gender: 1, merfolk: { armFins: true, hipFins: true, backFin: true, finEars: true, fin: 'veil' } });
    Model.build(pack, r, {}, { quality: 'preview', hairBudget: 0.3 });
    const t0 = Date.now();
    const result = Model.build(pack, r, {}, { quality: 'preview', hairBudget: 0.3 });
    const merMs = Date.now() - t0;
    const t1 = Date.now();
    Model.build(pack, Model.withSpecies(r, 'human'), {}, { quality: 'preview', hairBudget: 0.3 });
    const humanMs = Date.now() - t1;
    const added = tris(result, ['Tail', 'Fins', 'Scale line']);
    assert.ok(added < 16000, 'tail, fins and scale line: ' + added + ' triangles');
    assert.ok(merMs < humanMs + 600, `a merfolk builds in ${merMs} ms, a human in ${humanMs} ms`);
    for (const name of ['merscales.png', 'merscales_n.png', 'merfin.png', 'merscatter.png']) {
        const t = result.textures[name];
        assert.ok(t && t.width * t.height <= 512 * 2048, name + ' ' + (t && t.width) + 'x' + (t && t.height));
    }
    const keys = result.clips.reduce((s, c) => s + c.tracks.reduce((q, t) => q + t.values.length, 0), 0);
    assert.ok(keys * 4 < 1.5e6, 'clip data ' + Math.round(keys * 4 / 1024) + ' KB');
    const t2 = Date.now();
    Mer.clips(result.bones, result.recipe, result.built, pack, 0.3);
    assert.ok(Date.now() - t2 < 400, 'baking every clip takes ' + (Date.now() - t2) + ' ms');
});

test('every label the merfolk controls and poses show is translated into all 17 languages', () => {
    const src = ['I18nDeepTranslations.js', 'I18nReviewedTranslations.js', 'I18nManager.js'].map(f => { const p = path.join(root, 'src', f); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }).join('\n');
    const sandbox = { window: { dispatchEvent() {} }, document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } }, localStorage: { getItem() { return null; }, setItem() {} }, CustomEvent: class {} };
    sandbox.window.document = sandbox.document; sandbox.window.localStorage = sandbox.localStorage;
    const text = vm.runInNewContext(src + '\n(RR_TEXT_TRANSLATIONS)', sandbox);
    const html = [];
    const fake = { _section: l => html.push(l) || '', _select: (p, l, c) => { html.push(l, ...c.map(x => x[1])); return ''; }, _slider: s => html.push(s.label) || '', _check: (p, l) => html.push(l) || '' };
    Mer.panel(fake);
    const labels = [...new Set(html.concat(Mer.POSES.map(p => p.label)))];
    for (const locale of ['ja', 'es', 'zh-Hant', 'zh-Hans', 'ru', 'pt', 'de', 'fr', 'el', 'ko', 'ar', 'it', 'pl', 'id', 'vi', 'th', 'tr']) {
        for (const l of labels) assert.ok(text[locale] && text[locale][l], `${locale}: "${l}"`);
    }
});

test('deep hip and seat folds cannot reverse the tail surface winding',async()=>{
 const pack=await Body.loadPack();
 const Q=require('./helpers/character-quality-matrix.cjs');
 for(const profile of require('./quality/character-outfit-accessory-quality.cjs').FRESH_PROFILES){
  const recipe=Q.Model.normalize({...Q.Model.withSpecies({age:35},'merfolk'),...profile.patch,merfolk:{fin:'fan'}}),built=Q.Model.build(pack,recipe,{}, {quality:'preview',static:true,skinSize:32}),tail=built.parts.find(p=>p.name==='Tail');
  const P=tail.positions,I=tail.index,edges=new Map();let volume=0;
  const at=i=>Array.from(P.subarray(i*3,i*3+3));
  const det=(a,b,c)=>a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  for(let t=0;t<I.length;t+=3){const a=I[t],b=I[t+1],c=I[t+2];volume+=det(at(a),at(b),at(c))/6;for(const[u,v]of[[a,b],[b,c],[c,a]]){const k=u<v?u+':'+v:v+':'+u;if(edges.has(k))edges.delete(k);else edges.set(k,[u,v]);}}
  // Close only the open cut and tiny stem cap for an orientation measurement.
  const boundary=[...edges.values()],center=[0,0,0];for(const[a]of boundary)for(let k=0;k<3;k++)center[k]+=P[a*3+k]/boundary.length;
  for(const[a,b]of boundary)volume+=det(center,at(b),at(a))/6;
  assert.ok(volume>1e-7,profile.id+' tail exterior volume '+volume.toFixed(6));
 }
});

test('merfolk scale-line edges follow the actual skin cut instead of sorting folded skin by bearing',async()=>{
 const pack=await Body.loadPack(),cut=Mer.cutOf(pack),source=pack.body.source,expected=new Set(),hidden=new Set(cut.hiddenTris),edges=new Map();
 const key=(a,b)=>a<b?a+':'+b:b+':'+a;
 for(let t=0;t<pack.body.index.length;t+=3)for(let k=0;k<3;k++){
  const a=source[pack.body.index[t+k]],b=source[pack.body.index[t+(k+1)%3]],id=key(a,b);if(!edges.has(id))edges.set(id,new Set());edges.get(id).add(hidden.has(t));
 }
 for(const[k,s]of edges)if(s.size===2)expected.add(k);
 assert.equal(cut.ring.length,expected.size,'every cut edge belongs to the one joined loop');
 for(let i=0;i<cut.ring.length;i++)assert.ok(expected.has(key(cut.ring[i],cut.ring[(i+1)%cut.ring.length])),'no cross-cut shortcut at '+i);
});
