'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Q = require('./helpers/character-quality-matrix.cjs');
const Forms = require('../src/forge/Character3D/CreatureForms.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const Gear = require('../src/forge/Character3D/CreatureGear.js');

test('non-humanoid presets normalize, serialize, randomize deterministically and retain editable morphology', () => {
    for (const k of Forms.KINDS) {
        const r = Q.Creature.kindRecipe(k.kind);
        assert.equal(r.morphology, k.form);
        assert.deepEqual(Q.Model.normalize(JSON.parse(JSON.stringify(r))), r);
        assert.deepEqual(Q.Model.normalize({ plan: 'quadruped', kind: k.kind }), r);
        assert.deepEqual(Q.Creature.randomRecipe(123, k.kind), Q.Creature.randomRecipe(123, k.kind));
        for (const s of Forms.SLIDERS) {
            const n = Q.Creature.normalizeRecipe({ ...r, [s.key]: Infinity });
            assert.ok(Number.isFinite(n[s.key]));
        }
        assert.deepEqual(Q.Creature.anatomySliders(r), [], 'no mammalian anatomy controls on aquatic/invertebrate bodies');
        assert.ok(!Gear.fits('saddle', r));
    }
    assert.equal(Q.Creature.normalizeRecipe({ kind: 'beetle', limbPairs: 99, appendages: -1, eyeCount: 3.7 }).limbPairs, 12);
    assert.equal(Q.Creature.normalizeRecipe({ kind: 'beetle', eyeCount: 3.7 }).eyeCount, 4);
    const hybrid = Q.Model.normalize({ ...Q.Creature.kindRecipe('shark'), morphology: 'cephalopod', appendages: 12, horns: 'dragon', spines: 1, glow: 0.5 });
    assert.equal(hybrid.morphology, 'cephalopod'); assert.equal(hybrid.appendages, 12);
});

test('all new presets build valid skinned previews and saved meshes within bounded budgets', () => {
    for (const kind of Forms.KINDS) for (const quality of ['preview', 'save']) {
        const r = Q.Creature.kindRecipe(kind.kind), b = Q.Model.build(null, r, {}, { quality }), report = Q.inspect(b, { recipe: r });
        assert.deepEqual(report.issues, [], kind.kind + '/' + quality);
        assert.ok(report.summary.triangles > 1000 && report.summary.triangles < 65000, kind.kind + '/' + quality + ': ' + report.summary.triangles);
        assert.ok(b.bones.length > 1 && b.bones.length < 256);
        assert.ok(Math.abs(report.summary.bounds.lo[1]) < 1e-6, kind.kind + ' complete model on the preview floor');
        assert.ok(!b.bones.some(b => /FrontUpperLeg|RearFoot/.test(b.name)), 'uses its own anatomy');
        assert.ok(b.clips.some(c => c.name === 'Idle'));
        assert.ok(b.sidecar.animations.some(a => a.clip === (kind.group === 'Aquatic' ? 'Swim' : 'Walk')));
    }
});

test('fin orientation, limb counts, tentacle clubs and segmented worms distinguish their species', () => {
    const build = kind => Q.Creature.build(Q.Creature.kindRecipe(kind), { quality: 'preview' });
    for (const kind of ['shark', 'fish', 'dolphin', 'whale']) {
        const b = build(kind), flukes = b.parts.filter(p => p.name.startsWith('Fluke'));
        assert.equal(flukes.length, 2);
        const span = axis => { let lo = Infinity, hi = -Infinity; for (const p of flukes) for (let i = axis; i < p.positions.length; i += 3) { lo = Math.min(lo, p.positions[i]); hi = Math.max(hi, p.positions[i]); } return hi - lo; };
        assert.ok(['dolphin', 'whale'].includes(kind) ? span(0) > span(1) * 10 : span(1) > span(0) * 10, kind + ' tail plane');
    }
    for (const [kind, count] of [['beetle', 6], ['spider', 8], ['crab', 10], ['centipede', 20]]) assert.equal(build(kind).bones.filter(b => b.role === 'legUpper').length, count);
    for (const [kind, count] of [['octopus', 8], ['squid', 10]]) {
        const b = build(kind);
        assert.equal(b.parts.filter(p => /^Arm\d+$/.test(p.name)).length, count);
        assert.equal(b.parts.filter(p => /suckers$/.test(p.name)).length, count);
    }
    const worm = build('worm');
    assert.equal(worm.bones.filter(b => b.role === 'segment').length, 19);
    assert.ok(!worm.parts.some(p => p.name.startsWith('Leg ')));
    assert.ok(build('anglerfish').parts.some(p => p.name === 'Luminous lure' && p.emissiveIntensity > 0));
    assert.ok(build('jellyfish').parts.some(p => p.opacity < 1));
});

test('swimming and crawling deform native rigs through finite looped motion and export their own clips', async () => {
    for (const kind of Forms.KINDS) {
        const r = Q.Creature.kindRecipe(kind.kind), b = Q.Model.build(null, r, {}, { quality: 'preview' });
        const id = kind.group === 'Aquatic' ? 'swim' : 'crawl', clip = Q.Creature.poseClip(b.bones, id, r);
        assert.ok(clip, kind.kind);
        assert.equal(Q.Creature.poseClip(b.bones, id === 'swim' ? 'crawl' : 'swim', r), null);
        for (const tr of clip.tracks) {
            assert.ok(tr.bone < b.bones.length && tr.values.every(Number.isFinite));
            let gap = 0;
            for (let k = 0; k < 4; k++) gap = Math.max(gap, Math.abs(tr.values[k] - tr.values[tr.values.length - 4 + k]));
            assert.ok(gap < 1e-6, 'closed loop');
        }
        let changed = 0;
        for (const t of [0, 0.3, 0.7]) {
            const ps = Cloth.pose(b.bones, clip, clip.times.at(-1) * t);
            let low = Infinity;
            for (const p of b.parts) {
                const positions = Cloth.skin(p, b.bones, ps);
                assert.equal(positions.every(Number.isFinite), true, kind.kind + '/' + p.name);
                for (let i = 0; i < positions.length; i++) changed = Math.max(changed, Math.abs(positions[i] - p.positions[i]));
                for (let i = 1; i < positions.length; i += 3) low = Math.min(low, positions[i]);
            }
            assert.ok(low + clip.lift(clip.times.at(-1) * t) > -r.size * 0.015, kind.kind + ' stays above the preview floor');
        }
        assert.ok(changed > r.size * 0.001, kind.kind + ' moves');
        const glb = await Q.Model.toGlb(b, kind.kind, () => new Uint8Array([137, 80, 78, 71]));
        const n = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true), json = JSON.parse(Buffer.from(glb.subarray(20, 20 + n)).toString());
        assert.ok(json.animations.some(a => a.name === (id === 'swim' ? 'Swim' : 'Walk')));
        assert.equal(json.skins[0].joints.length, b.bones.length);
        assert.ok(json.meshes.every(m => m.primitives[0].attributes.JOINTS_0 != null));
    }
});

test('custom alien counts and extreme proportions stay finite without excessive bones or mesh growth', () => {
    for (const kind of ['shark', 'octopus', 'jellyfish', 'worm', 'beetle']) for (const high of [false, true]) {
        const r = Q.Creature.normalizeRecipe({ ...Q.Creature.kindRecipe(kind), size: high ? 2 : 0.12, girth: high ? 2 : 0.5, chestDepth: high ? 1.5 : 0.5, appendages: high ? 16 : 0, limbPairs: high ? 12 : 0, segments: high ? 32 : 4, eyeCount: high ? 12 : 0, headSize: high ? 1.5 : 0.6, horns: 'dragon', hornSize: 1.5, spines: 1, glow: 0.6 });
        const b = Q.Model.build(null, r, {}, { quality: 'preview' }), report = Q.inspect(b, { recipe: r });
        assert.deepEqual(report.issues, [], kind + '/' + high);
        assert.ok(b.bones.length < 256 && report.summary.triangles < 65000);
    }
    const base = Q.Creature.kindRecipe('fish');
    const a = Q.Creature.build(base, { quality: 'preview' }), b = Q.Creature.build({ ...base, bodyLength: 2 }, { quality: 'preview' });
    const span = (model, axis) => { let low = Infinity, high = -Infinity; for (const p of model.parts) for (let i = axis; i < p.positions.length; i += 3) { low = Math.min(low, p.positions[i]); high = Math.max(high, p.positions[i]); } return high - low; };
    assert.ok(Math.abs(span(a, 0) - span(b, 0)) < 1e-6, 'axial length preserves width');
    assert.ok(Math.abs(span(b, 2) / span(a, 2) - 2) < 1e-6, 'axial length changes proportions independently of overall Size');
});

test('non-humanoid UI exposes relevant controls and browser/node workers load the same generator', () => {
    const dir = path.resolve(__dirname, '../src/forge/Character3D'), scope = { window: {}, console, setTimeout, clearTimeout, RRCreatureBody: Q.Creature, RRCreatureGear: Gear };
    vm.runInNewContext(fs.readFileSync(path.join(dir, 'Character3DBuilder.js'), 'utf8'), scope);
    const b = Object.create(scope.window.Character3DBuilder.prototype);
    Object.assign(b, { recipe: Q.Creature.kindRecipe('octopus'), _t: s => s, _section: s => s, _tile: () => '', _select: (path, label) => label, _slider: s => s.path + ',', _extremeToggle: () => '' });
    const species = b._speciesTab(), body = b._bodyTab();
    assert.ok(species.includes('Non-humanoid') && species.includes('Aquatic') && !body.includes('Body type'));
    assert.ok(body.includes('appendages') && !body.includes('legLength') && !body.includes('anatomy.'));
    assert.ok(!b._tabs().some(([id]) => id === 'gear'));
    for (const name of ['CharacterPreviewWorker.cjs', 'CharacterPreviewBrowserEntry.js']) assert.ok(fs.readFileSync(path.join(dir, name), 'utf8').includes("'CreatureForms'"));
    assert.ok(fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').includes('Character3D/CreatureForms.js'));
});

test('real preview workers produce the same aquatic and arthropod surfaces as direct builds', async t => {
    const { PreviewWorker } = require('../src/forge/Character3D/CharacterPreviewWorker.cjs');
    const crypto = require('node:crypto'), hash = a => crypto.createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
    const pool = new PreviewWorker(); t.after(() => pool.dispose()); pool.configure({});
    for (const kind of ['squid', 'beetle']) {
        const recipe = Q.Creature.kindRecipe(kind), expected = Q.Model.build(null, recipe, {}, { quality: 'preview' });
        const actual = await pool.build({ key: 'nonhumanoid-' + kind, recipe, options: { quality: 'preview' } });
        assert.ok(actual.stats.threadId > 0);
        assert.equal(actual.parts.length, expected.parts.length);
        assert.equal(actual.parts[0].keepColors, expected.parts[0].keepColors);
        for (const [name, tex] of Object.entries(expected.textures)) {
            assert.equal(actual.textures[name].repeat, tex.repeat, 'worker preserves wrapping');
            assert.equal(hash(actual.textures[name].data), hash(tex.data), 'worker preserves fine surface maps');
        }
        for (let i = 0; i < expected.parts.length; i++) {
            assert.equal(hash(actual.parts[i].positions), hash(expected.parts[i].positions));
            assert.equal(hash(actual.parts[i].normals), hash(expected.parts[i].normals));
            assert.equal(hash(actual.parts[i].index), hash(expected.parts[i].index));
        }
    }
});


test('creature surface detail uses sharp shared color and relief maps that survive export', async () => {
    for (const kind of ['fish', 'shark', 'octopus', 'beetle', 'worm', 'jellyfish']) {
        const r = Q.Creature.kindRecipe(kind), b = Q.Model.build(null, r, {}, { quality: 'save' });
        const body = b.parts.find(p => p.name === 'Body');
        assert.ok(body.uvs && body.keepColors && body.normalTexture);
        assert.equal(b.textures[body.normalTexture].width, 1024);
        assert.equal(b.textures[body.texture].repeat, true);
        const normal = b.textures[body.normalTexture].data;
        let variation = 0;
        for (let i = 0; i < normal.length; i += 4) variation = Math.max(variation, Math.abs(normal[i] - 128));
        assert.ok(variation > 3 && variation < 128, 'finite detailed normal relief');
        const bytes = await Q.Model.toGlb(b, kind, () => new Uint8Array([137, 80, 78, 71]));
        const n = new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true), glb = JSON.parse(Buffer.from(bytes.subarray(20, 20 + n)).toString());
        assert.ok(glb.materials.find(m => m.name === 'Body').normalTexture);
    }
});


test('flexible roots, eyes and moving fins retain body attachments on default aquatic creatures', () => {
    const inside = (part, p) => {
        const d = [0.9123, 0.2171, 0.3477], P = part.positions;
        const sub = (a, b) => a.map((v, k) => v - b[k]);
        const cross = (a, b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        const dot = (a, b) => a.reduce((s, v, k) => s + v * b[k], 0);
        const at = i => Array.from(P.subarray(i*3,i*3+3));
        let hits = 0;
        for (let t = 0; t < part.index.length; t += 3) {
            const a = at(part.index[t]), e = sub(at(part.index[t+1]), a), f = sub(at(part.index[t+2]), a), h = cross(d, f), det = dot(e, h);
            if (Math.abs(det) < 1e-12) continue;
            const q = sub(p, a), u = dot(q, h) / det;
            if (u < 0 || u > 1) continue;
            const r = cross(q, e), v = dot(d, r) / det;
            if (v >= 0 && u + v <= 1 && dot(f, r) / det > 1e-8) hits++;
        }
        return hits % 2 === 1;
    };
    for (const kind of ['octopus', 'squid']) {
        const b = Q.Creature.build(Q.Creature.kindRecipe(kind), { quality: 'preview' }), body = b.parts.find(p => p.name === 'Body');
        for (const bone of b.bones.filter(b => /^Arm\d+_0$/.test(b.name))) assert.ok(inside(body, bone.head), kind + '/' + bone.name + ' begins inside the actual mantle');
    }
    const jelly = Q.Creature.build(Q.Creature.kindRecipe('jellyfish'), { quality: 'preview' }), bell = jelly.parts.find(p => p.name === 'Body');
    let low = Infinity;
    for (let i = 1; i < bell.positions.length; i += 3) low = Math.min(low, bell.positions[i]);
    for (const bone of jelly.bones.filter(b => /^Tendril\d+_0$/.test(b.name))) assert.ok(Math.abs(bone.head[1] - low) < 1e-6, 'tendrils begin at the bell rim');
    const fish = Q.Creature.build(Q.Creature.kindRecipe('fish'), { quality: 'preview' });
    for (const part of fish.parts.filter(p => /^Fin|^Fluke/.test(p.name))) {
        const fin = fish.bones.findIndex(b => b.name === part.name);
        assert.ok(Array.from({length:part.positions.length/3}, (_, i) => i).some(i => { let onFin=0;for(let k=0;k<4;k++)if(part.joints[i*4+k]===fin)onFin+=part.weights[i*4+k];return onFin<.05; }), 'fin base follows the body skin rather than the fin rotation');
    }
});
