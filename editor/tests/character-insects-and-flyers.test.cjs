'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const Q = require('./helpers/character-quality-matrix.cjs');
const Forms = require('../src/forge/Character3D/CreatureForms.js');
const Flyers = require('../src/forge/Character3D/CreatureFlyers.js');
const Arthropods = require('../src/forge/Character3D/CreatureArthropods.js');
const Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const kinds = ['beetle', 'tick', 'bee', 'wasp', 'mosquito', 'fly', 'butterfly', 'dragonfly', 'crab', 'lobster', 'avian', 'bat'];
const built = new Map();
function build(kind) {
    if (!built.has(kind)) built.set(kind, Q.Creature.build(Q.Creature.kindRecipe(kind), { quality: 'preview' }));
    return built.get(kind);
}
test('new creature recipes round trip and every exposed variant has bounded preview/save geometry', () => {
    for (const kind of kinds) {
        const r = Q.Creature.kindRecipe(kind);
        assert.deepEqual(Q.Model.normalize(JSON.parse(JSON.stringify(r))), r, kind);
        const variants = Forms.variantsFor(r);
        const recipes = variants.length ? variants[0].choices.map(([id]) => Q.Creature.withVariant(r, variants[0].key, id)) : [r];
        for (const recipe of recipes) for (const quality of ['preview', 'save']) {
            const b = Q.Creature.build(recipe, { quality }), q = Q.inspect(b, { recipe });
            assert.deepEqual(q.issues, [], kind + '/' + quality);
            assert.ok(q.summary.triangles < 65000, kind + '/' + quality + ' triangle budget: ' + q.summary.triangles);
            assert.ok(b.bones.length < 128, kind + ' bone budget');
            assert.ok(Math.abs(q.summary.bounds.lo[1]) < 1e-6, kind + ' rests on the floor');
        }
    }
});
test('beetle legs keep the same front-to-back order through their entire length and walk cycle', () => {
    const b = build('beetle'), r = Q.Creature.kindRecipe('beetle');
    assert.equal(b.bones.filter(b => b.role === 'legUpper').length, 6);
    assert.equal(b.parts.filter(p => p.name.startsWith('Elytron ')).length, 2);
    assert.ok(b.parts.some(p => p.name === 'Pronotum'));
    assert.ok(b.parts.some(p => p.name === 'Mandibles and mouthparts'));
    assert.equal(b.bones.filter(b => b.role === 'tarsus').length, 6);
    const clip = Q.Creature.poseClip(b.bones, 'crawl', r);
    for (const s of [-1, 1]) {
        const groups = [0, 1, 2].map(i => b.parts.find(p => p.name === 'Leg ' + s + '/' + i));
        for (let frame = 0; frame <= 12; frame++) {
            const pose = Cloth.pose(b.bones, clip, clip.times.at(-1) * frame / 12);
            const points = groups.map(part => Cloth.skin(part, b.bones, pose));
            // At matching lateral stations, the complete meshes must remain separated in z.
            for (let station = 0; station < 7; station++) {
                const x = r.size * (0.48 + station * .10), halfWidth = r.size * .033;
                const intervals = points.map(p => {
                    let lo = Infinity, hi = -Infinity;
                    for (let i = 0; i < p.length; i += 3) if (Math.abs(Math.abs(p[i]) - x) < halfWidth) { lo = Math.min(lo, p[i + 2]); hi = Math.max(hi, p[i + 2]); }
                    return [lo, hi];
                });
                for (let i = 0; i < 2; i++) if (intervals[i][0] < Infinity && intervals[i + 1][0] < Infinity) assert.ok(intervals[i][0] > intervals[i + 1][1], 'separate legs at frame ' + frame + ', side ' + s + ', station ' + station);
            }
        }
    }
});
test('ticks, winged insects and crustaceans retain their defining anatomy', () => {
    const tick = build('tick');
    assert.equal(tick.bones.filter(b => b.role === 'legUpper').length, 8);
    assert.ok(tick.parts.some(p => p.name === 'Dorsal shield'));
    assert.ok(tick.parts.some(p => p.name === 'Palps and barbed hypostome'));
    assert.ok(!tick.parts.some(p => /Antennae|Wing|Eye /.test(p.name)));
    for (const kind of ['bee','wasp','mosquito','fly','butterfly','dragonfly']) {
        const b = build(kind);
        assert.equal(b.bones.filter(b => b.role === 'legUpper').length, 6, kind);
        assert.equal(b.bones.filter(b => b.role === 'wing').length, ['fly','mosquito'].includes(kind) ? 2 : 4, kind);
        assert.equal(b.parts.some(p => p.name === 'Halteres'), ['fly','mosquito'].includes(kind), kind);
        assert.ok(b.parts.some(p => p.name === 'Compound eye -1'));
    }
    assert.ok(build('mosquito').parts.some(p => p.name === 'Proboscis'));
    for (const kind of ['crab','lobster']) {
        const b = build(kind);
        assert.equal(b.bones.filter(b => b.role === 'legUpper').length, 10);
        assert.equal(b.bones.filter(b => b.role === 'pincer').length, 2);
        assert.equal(b.parts.filter(p => p.name.startsWith('Eye stalk ')).length, 2);
    }
    assert.equal(build('lobster').parts.filter(p => p.name.startsWith('Abdominal tergite ')).length, 6);
    assert.equal(build('lobster').parts.filter(p => p.name.startsWith('Uropod ')).length, 2);
    assert.ok(build('lobster').parts.some(p => p.name === 'Telson'));
    assert.ok(!build('crab').parts.some(p => p.name === 'Telson'));
    for (const kind of ['beetle','bee','tick']) for (const count of [0,1,5]) {
        const b=Q.Creature.build({...Q.Creature.kindRecipe(kind),eyeCount:count},{quality:'preview',static:true});
        assert.equal(b.parts.filter(p=>kind==='tick'?/^Eye /.test(p.name):/^Compound eye /.test(p.name)&&!p.name.endsWith(' facets')).length,count,kind+' respects eye count');
    }
});
test('birds use feathered wings and two legs, bats have fingers and membranes; existing Birdfolk heads retain their recipe', () => {
    const bird = build('avian'), bat = build('bat');
    for (const b of [bird, bat]) {
        assert.equal(b.bones.filter(b => b.role === 'legUpper').length, 2);
        assert.equal(b.bones.filter(b => b.role === 'wing').length, 2);
        assert.ok(!b.bones.some(b => /FrontUpperLeg|RearFoot/.test(b.name)));
    }
    assert.equal(bird.parts.filter(p => p.name.startsWith('Flight feathers ')).length, 2);
    assert.equal(bat.bones.filter(b => b.role === 'wingFinger').length, 8);
    assert.equal(bat.parts.filter(p => p.name.startsWith('Patagium ')).length, 2);
    assert.equal(Q.Creature.kindRecipe('bird').morphology, 'quadruped', 'head-only legacy kind remains compatible');
    assert.ok(Flyers.TYPES.birdType.choices.length >= 10);
    const r=Q.Creature.kindRecipe('avian'),custom=Q.Creature.build({...r,colors:{...r.colors,eye:'#25a5ff'}},{quality:'preview',static:true});
    assert.ok(custom.parts.filter(p=>/^Eye /.test(p.name)).every(p=>Array.from(p.colors).some((v,i)=>i%3===2&&v>.9&&v>p.colors[i-2]*2)),'eagle iris honors its editable eye color');
});
test('wing controls change geometry and fly/glide motions survive GLB export with native rigs', async () => {
    for (const kind of ['bee','fly','avian','bat']) {
        const r = Q.Creature.kindRecipe(kind), b = build(kind), poses = Q.Creature.posesFor(r);
        assert.ok(poses.some(p => p.id === 'fly'), kind);
        const clip = Q.Creature.poseClip(b.bones, 'fly', r);
        const wing = b.bones.findIndex(b => b.role === 'wing'), track = clip.tracks.find(t => t.bone === wing);
        // Fast flyers beat several times a loop (an insect's wings are a blur): the wing's turn swings through a wide range over the keys.
        let lo = Infinity, hi = -Infinity; for (let i = 2; i < track.values.length; i += 4) { lo = Math.min(lo, track.values[i]); hi = Math.max(hi, track.values[i]); }
        assert.ok(hi - lo > .2, kind + ' wings flap');
        for (const fraction of [0,.25,.5,.75,1]) {
            const t = clip.times.at(-1) * fraction, pose = Cloth.pose(b.bones, clip, t);
            let low = Infinity;
            for (const part of b.parts) {
                const p = Cloth.skin(part, b.bones, pose);
                assert.ok(p.every(Number.isFinite));
                for (let i = 1; i < p.length; i += 3) low = Math.min(low, p[i]);
            }
            assert.ok(low + clip.lift(t) > -r.size * .015, kind + ' floor clearance');
        }
        const a = Q.Creature.build({...r, wingSpread: 0}, {quality:'preview',static:true}), z = Q.Creature.build({...r, wingSpread: 1}, {quality:'preview',static:true});
        const span = built => { let lo = Infinity, hi = -Infinity; for (const p of built.parts) for (let i=0;i<p.positions.length;i+=3) {lo=Math.min(lo,p.positions[i]);hi=Math.max(hi,p.positions[i]);} return hi-lo; };
        assert.ok(span(z) > span(a) * 1.1, kind + ' editable wing spread');
        const glb = await Q.Model.toGlb(b, kind, () => new Uint8Array([137,80,78,71]));
        const n = new DataView(glb.buffer, glb.byteOffset).getUint32(12, true), json = JSON.parse(Buffer.from(glb.subarray(20,20+n)).toString());
        assert.ok(json.animations.some(a => a.name === 'Fly'));
        assert.equal(json.skins[0].joints.length, b.bones.length);
    }
});
test('all new body families are identical through the actual Node preview worker', async t => {
    const { PreviewWorker } = require('../src/forge/Character3D/CharacterPreviewWorker.cjs');
    const hash = a => require('node:crypto').createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
    const worker = new PreviewWorker(); t.after(() => worker.dispose()); worker.configure({});
    for (const kind of ['tick','lobster','avian','bat']) {
        const expected = build(kind), result = await worker.build({key:kind,recipe:Q.Creature.kindRecipe(kind),options:{quality:'preview'}});
        assert.equal(result.parts.length, expected.parts.length);
        expected.parts.forEach((part, i) => assert.equal(hash(result.parts[i].positions),hash(part.positions),kind + '/' + part.name));
    }
    assert.ok(Arthropods.TYPES.beetleType.choices.length > 1);
});
test('penguins swim on flippers and exported assignments are accepted by the actual game runtime', () => {
    const penguinRecipe = Q.Creature.withVariant(Q.Creature.kindRecipe('avian'),'birdType','penguin');
    const penguin = Q.Creature.build(penguinRecipe,{quality:'preview'});
    assert.equal(penguin.parts.filter(p=>p.name.startsWith('Flipper ')).length,2);
    assert.ok(!Q.Creature.posesFor(penguinRecipe).some(p=>p.id==='fly'));
    assert.equal(Q.Creature.poseClip(penguin.bones,'fly',penguinRecipe),null);
    assert.ok(penguin.clips.some(c=>c.name==='Swim'));
    assert.ok(!penguin.clips.some(c=>c.name==='Fly'));
    const R = require('../../runtime/reactor_3d.js');
    global.self=global; global.window=global;
    require('../../runtime/libs/three.js');
    require('../../runtime/reactor_rig_motions.js');
    require('../../runtime/reactor_3d_models.js');
    for (const b of [...kinds.map(build),penguin]) {
        const sidecar=Forms.sidecar(b),rules=R.readModelAnimationRules(sidecar,b.clips.map(c=>({name:c.name})));
        for (const assignment of sidecar.animations) {
            const rule=rules.find(r=>r.name===assignment.name);
            assert.ok(rule,assignment.name);
            assert.equal(rule.trigger,assignment.trigger,assignment.name+' must not fall back to always');
            assert.ok(b.clips.some(c=>c.name===rule.clip),rule.clip+' exists in the model');
        }
        assert.equal(rules.find(r=>r.name==='Attack').trigger,'action');
    }
});
test('new creature names, variants and controls have explicit translations in every supported locale', () => {
    const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),scope={};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/I18nReviewedTranslations.js'),'utf8'),scope);
    const labels=['Tick','Bee','Wasp','Mosquito','Fly','Butterfly','Dragonfly','Lobster','Bird','Bat','Birds and bats','Wing spread','Antenna length','Flying'];
    for (const type of Object.values({...Arthropods.TYPES,...Flyers.TYPES})) labels.push(type.label,...type.choices.map(c=>c[1]));
    for(const [locale,catalog] of Object.entries(scope.RR_REVIEWED_TRANSLATIONS.text)) for(const label of labels) assert.ok(typeof catalog[label]==='string'&&catalog[label].length>0,locale+'/'+label);
});

test('creature anatomy keeps the tessellation it asks for while worn equipment rounds small tubes and spheres', () => {
    // The equipment floors (24 sides on a 3 mm tube, 16 x 32 on any sphere) once applied to every creature
    // detail too: a tick's 160 groove dots alone reached 165,696 triangles.
    const Props = require('../src/forge/Character3D/CharacterProps.js'), skin = Props.rigid(0), white = [1, 1, 1];
    const count = (M, draw) => { const m = new M(); draw(m); return m.i.length / 3; };
    const dot = m => m.sphere([0, 0, 0], 0.001, white, skin, 4, 5);
    const tube = m => m.tube([[0, 0, 0], [0, 0.01, 0], [0, 0.02, 0]], 0.004, 6, white, skin);
    assert.equal(count(Props.ExactMesh, dot), 4 * 5 * 2);
    assert.equal(count(Props.ExactMesh, tube), 2 * 6 * 2 + 6 * 2);
    // Worn pieces take their sides from their size (2026-10-23): a 1 mm dot is a few dozen triangles, a 4 mm tube 10 sides.
    const sides = require('../src/forge/Character3D/ConstructionPatterns.js').roundSides(0.004);
    assert.ok(count(Props.Mesh, dot) < 100, 'a worn 1 mm dot stays cheap');
    assert.equal(count(Props.Mesh, tube), 2 * sides * 2 + sides * 2, 'worn tubes round by radius');
    const tick = build('tick'), grooves = tick.parts.find(p => p.name === 'Scutal cervical and marginal grooves');
    assert.ok(grooves.index.length / 3 < 12000, 'tick grooves ' + grooves.index.length / 3);
});
