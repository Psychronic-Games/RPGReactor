#!/usr/bin/env node
'use strict';
// Fresh combinations beyond the catalog endpoint matrix. CPU only, no project mutation.
const fs = require('node:fs'), path = require('node:path');
const Q = require('../helpers/character-quality-matrix.cjs');
const { PNG } = require('pngjs');
const PROFILES = [
 ['lean-compact',{weight:-1,muscle:-.3,height:-.6,proportions:1.6,shapes:{torsoLength:-2.5,legLength:-2.5,armLength:-2.5,shoulders:-2.5,hips:-3,neckLength:-2.5}}],
 ['lean-long-torso',{weight:-1,muscle:-.3,height:1.8,shapes:{torsoLength:2.5,legLength:-2.5,armLength:2.5,shoulders:-2.5,neckLength:2.5}}],
 ['lean-short-torso',{weight:-1,muscle:2.5,height:.5,shapes:{torsoLength:-2.5,legLength:2.5,shoulders:2.5,chest:-2.5}}],
 ['female-muscle-compact',{weight:-1,muscle:2.5,height:-.6,proportions:1.6,cup:6,firmness:-.5,shapes:{torsoLength:-2.5,legLength:-2.5,shoulders:2.5,chest:2.5,neckLength:-2.5}}],
 ['muscle-long-limbs',{weight:-.5,muscle:2.5,height:1.8,shapes:{torsoLength:-2.5,armLength:2.5,legLength:2.5,upperArmMuscle:4,forearmMuscle:4,thighMuscle:4,calfMuscle:4}}],
 ['old-muscle',{age:90,weight:-1,muscle:2.5,shapes:{neckLength:-2.5,neck:-3,shoulders:2.5,belly:4,hips:-3}}],
 ['young-compact',{age:11,weight:-1,muscle:-.3,height:-.6,headSize:2.2,shapes:{neckLength:-2.5,torsoLength:-2.5,legLength:-2.5,armLength:-2.5}}],
 ['head-on-long-neck',{weight:-1,muscle:-.3,headSize:2.2,shapes:{neckLength:2.5,neck:-3,headWidth:2.5,headDepth:2.5,headHeight:-2.5}}]
];

function inventory() {
    const profiles = PROFILES.flatMap(([id, patch]) => [0, 1].map(gender => ({ id: id + '-' + gender, patch: { ...patch, gender } })));
    const merge = (base, patch) => Q.Model.normalize({ ...base, ...patch, shapes: { ...base.shapes, ...patch.shapes } });
    const cases = [];
    for (const species of Q.Species.SPECIES.filter(s => !s.plan)) for (const p of profiles) cases.push({ group: 'species', entity: species.id, id: species.id + '/' + p.id, recipe: merge(Q.Model.withSpecies({}, species.id), p.patch) });
    for (const [id] of Q.Species.heads()) for (const p of profiles.filter((_, i) => [0, 6, 12, 14].includes(i))) cases.push({ group: 'heads', entity: id, id: id + '/' + p.id, recipe: merge(Q.Model.withSpecies({}, 'human'), { ...p.patch, headId: id }) });
    for (const kind of Q.Creature.KINDS) for (let seed = 11; seed <= 14; seed++) {
        let state = seed * 9137;
        const patch = Object.fromEntries(Q.Creature.SLIDERS.map(s => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            const t = state / 2 ** 32;
            return [s.key, t < 0.3 ? s.min : t > 0.7 ? s.max : s.min + (s.max - s.min) * t];
        }));
        cases.push({ group: 'creatures', entity: kind.kind, id: kind.kind + '/seed-' + seed, recipe: Q.Creature.normalizeRecipe({ ...Q.Creature.kindRecipe(kind.kind), ...patch }) });
    }
    for (let i = 0; i < profiles.length; i++) cases.push({ group: 'merfolk', entity: 'merfolk', id: 'merfolk/' + profiles[i].id, recipe: merge(Q.Model.withSpecies({}, 'merfolk'), { ...profiles[i].patch, merfolk: { fin: Q.Merfolk.FINS[i % Q.Merfolk.FINS.length][0], length: i % 2 ? 2 : 1, armFins: true, hipFins: true, backFin: true } }) });
    for (let i = 0; i < 8; i++) cases.push({ group: 'slime', entity: 'slimefolk', id: 'slime/mixed-' + i, recipe: Q.Model.normalize({
        plan: 'slime', seed: 19 + i, form: i % 3 === 0 ? 0 : i % 3 === 1 ? 0.4 : 1,
        size: i % 2 ? 2.5 : 0.4, feelers: Q.Slime.FEELERS[i % Q.Slime.FEELERS.length][0],
        translucency: i % 2, glow: (i >> 1) % 2, bubbles: i % 3 ? 1 : 0, bubbleSize: i % 2 ? 0.15 : 1,
        color: Q.Slime.PALETTE[i % Q.Slime.PALETTE.length][0], core: Q.Slime.PALETTE[i % Q.Slime.PALETTE.length][1],
        eyes: { size: i % 2 ? 0.5 : 1.8 }, props: [{ id: i % 2 ? 'tophat' : 'sunhat' }]
    }) });
    return cases;
}
async function run() {
    const opt = (key, fallback) => process.argv.find(a => a.startsWith('--' + key + '='))?.slice(key.length + 3) || fallback;
    const out = path.resolve(opt('out', 'scratchpad/species-fresh-quality')), render = opt('render', 'none');
    fs.mkdirSync(out, { recursive: true });
    const pack = await Q.Body.loadPack(), eye = PNG.sync.read(fs.readFileSync(path.resolve(__dirname, '../../src/forge/Character3D/data/eye-brown.png')));
    const sourceHashes = Object.fromEntries(['HumanBody', 'CharacterModel', 'CharacterSpecies', 'CreatureBody', 'MerfolkBody', 'SlimeBody', 'CharacterHair'].map(name => [name, require('node:crypto').createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../../src/forge/Character3D', name + '.js'))).digest('hex')]));
    const report = { sourceHashes, generatedAt: new Date().toISOString(), profiles: PROFILES, cases: [] }, images = [];
    const groups = opt('groups', '').split(',').filter(Boolean);
    const cases = inventory().filter(c => !groups.length || groups.includes(c.group)), soft = render !== 'none' && require('../helpers/character-software-renderer.cjs');
    const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    for (let i = 0; i < cases.length; i++) {
        const fixture = cases[i], start = performance.now();
        try {
            const result = Q.Model.build(pack, fixture.recipe, {}, { quality: 'preview', skinSize: 64, atlasSize: 128, hairBudget: 0.1, eyeSource: { width: eye.width, height: eye.height, data: eye.data } });
            const entry = { ...fixture, ms: performance.now() - start, ...Q.inspect(result, fixture, pack) };
            report.cases.push(entry);
            if (soft && (render === 'all' || fixture.group === 'heads' && ['bull', 'rabbit', 'bird', 'crow'].includes(fixture.entity) || fixture.group === 'creatures' && ['cat', 'rabbit', 'tiger'].includes(fixture.entity))) {
                const meshes = result.parts.map(p => ({ ...p, texture: result.textures[p.texture], doubleSided: p.doubleSided || p.kind === 'hair' }));
                const { lo, hi } = entry.summary.bounds, extent = Math.max(...hi.map((x, k) => x - lo[k]));
                for (const yaw of [0, Math.PI / 2, Math.PI]) {
                    const png = soft.render(meshes, { w: 240, h: 320, yaw, pitch: 0.04, dist: extent * 2.2, target: lo.map((x, k) => (x + hi[k]) / 2), fov: 0.6 });
                    fs.writeFileSync(path.join(out, fixture.group + '-' + fixture.id.replaceAll('/', '-') + '-' + yaw.toFixed(2) + '.png'), png); images.push(png);
                }
            }
        } catch (error) { report.cases.push({ ...fixture, error: String(error.stack || error) }); }
        if (i % 32 === 0) { console.log(i + '/' + cases.length, fixture.id); save(); }
    }
    report.summary = { total: cases.length, failedBuilds: report.cases.filter(c => c.error).length, badGeometryCases: report.cases.filter(c => c.issues?.length).length, groups: Object.fromEntries([...new Set(cases.map(c => c.group))].map(g => [g, cases.filter(c => c.group === g).length])) };
    if (images.length) soft.sheet(images, 6, path.join(out, 'sheet.png'));
    save(); console.log(JSON.stringify(report.summary));
}
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { PROFILES, inventory, run };
