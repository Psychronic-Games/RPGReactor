#!/usr/bin/env node
'use strict';
// Reproducible CPU-only catalog quality sweep. No editor/project mutation or GPU context.
const fs = require('node:fs'), path = require('node:path');
const Q = require('../helpers/character-quality-matrix.cjs');
const { PNG } = require('pngjs');
const opt = (key, fallback) => process.argv.find(a => a.startsWith('--' + key + '='))?.slice(key.length + 3) || fallback;
async function run() {
    const out = path.resolve(opt('out', path.join('scratchpad', 'species-quality'))); fs.mkdirSync(out, { recursive: true });
    const groups = opt('groups', '').split(',').filter(Boolean), render = opt('render', 'none');
    const entities=opt('entities','').split(',').filter(Boolean),strata=opt('strata','').split(',').filter(Boolean);
    const cases = Q.inventory().filter(f => (!groups.length || groups.includes(f.group))&&(!entities.length||entities.includes(f.entity))&&(!strata.length||strata.includes(f.stratum)));
    const pack = await Q.Body.loadPack(), eye = PNG.sync.read(fs.readFileSync(path.resolve(__dirname, '../../src/forge/Character3D/data/eye-brown.png')));
    const eyeSource = { width: eye.width, height: eye.height, data: new Uint8Array(eye.data) };
    const options = { quality: 'preview', skinSize: render === 'none' ? 32 : 256, atlasSize: render === 'none' ? 64 : 256, hairBudget: 0.2, eyeSource };
    const sourceHashes = Object.fromEntries(['CharacterModel','HumanBody','CharacterSpecies','CharacterProps','CreatureBody','MerfolkBody','SlimeBody','CharacterHair'].map(name=>[name,require('crypto').createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../../src/forge/Character3D',name+'.js'))).digest('hex')]));
    const report = { sourceHashes, generatedAt: new Date().toISOString(), options: Object.assign({}, options, { eyeSource: 'bundled eye-brown.png' }), inventory: { species: Q.Species.SPECIES.map(s => s.id), heads: Q.Species.heads().map(h => h[0]), creatures: Q.Creature.KINDS.map(k => k.kind), bodyStrata: Q.BODY_STRATA, creatureStrata: Q.CREATURE_STRATA }, cases: [] };
    const caches = new Map(), images = new Map(); let i = 0;
    for (const f of cases) {
        const key = f.group + ':' + f.entity; if (!caches.has(key)) caches.set(key, {});
        const start = performance.now(); let entry;
        try {
            const result = Q.Model.build(pack, f.recipe, caches.get(key), options);
            entry = Object.assign({ group: f.group, id: f.id, recipe: f.recipe, ms: performance.now() - start }, Q.inspect(result, f, pack));
            const want = render === 'risks' && f.group === 'species' && ['short-lean','heavy-female','broad-head'].includes(f.stratum) || render === 'all' || render === 'presets' && (f.stratum.startsWith('preset') || f.group === 'heads' && ['preset-female','short-lean','heavy-female'].includes(f.stratum) || f.group === 'slime' && f.recipe.feelers === 'none' || f.group === 'merfolk' && /teal/.test(f.stratum));
            if (want) {
                const soft = require('../helpers/character-software-renderer.cjs');
                const meshes = result.parts.map(p => ({ positions: p.positions, index: p.index, uvs: p.uvs, colors: p.colors, texture: result.textures[p.texture], doubleSided: !!p.doubleSided || p.kind === 'hair' }));
                const lo = entry.summary.bounds.lo, hi = entry.summary.bounds.hi, height = hi[1] - lo[1], extent = Math.max(height, hi[0] - lo[0], hi[2] - lo[2]);
                const cols = images.get(f.group) || []; images.set(f.group, cols);
                for (const [view, yaw] of [['front', 0], ['side', Math.PI / 2], ['back', Math.PI]]) {
                    const png = soft.render(meshes, { w: 220, h: 300, yaw, pitch: 0.06, dist: extent * 2.25, target: lo.map((x, k) => (x + hi[k]) * 0.5), fov: 0.6 });
                    const name = f.group + '-' + f.id.replace(/[^a-z0-9.-]+/gi, '-') + '-' + view + '.png';
                    fs.writeFileSync(path.join(out, name), png); cols.push({ id: f.id, view, png, file: name });
                }
            }
        } catch (error) { entry = { group: f.group, id: f.id, recipe: f.recipe, ms: performance.now() - start, error: String(error.stack || error) }; }
        report.cases.push(entry);
        if (++i % 16 === 0 || entry.error) { console.log(i + '/' + cases.length, f.group, f.id, entry.error ? entry.error.split('\n')[0] : entry.issues.length + ' issues'); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
    }
    const soft = images.size && require('../helpers/character-software-renderer.cjs');
    for (const [group, cells] of images) { for(let i=0;i<cells.length;i+=18)soft.sheet(cells.slice(i,i+18).map(c=>c.png),6,path.join(out,group+'-page-'+String(i/18+1).padStart(2,'0')+'.png')); soft.sheet(cells.map(c => c.png), 6, path.join(out, group + '-sheet.png')); fs.writeFileSync(path.join(out, group + '-sheet.json'), JSON.stringify(cells.map(({ id, view, file }, index) => ({ index, id, view, file })), null, 2)); }
    report.summary = { total: report.cases.length, failedBuilds: report.cases.filter(c => c.error).length, badGeometryCases: report.cases.filter(c => c.issues?.length).length, groups: Object.fromEntries([...new Set(cases.map(c => c.group))].map(g => [g, report.cases.filter(c => c.group === g).length])) };
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Species quality sweep</title><style>body{background:#222;color:white;font:14px sans-serif}.grid{display:grid;grid-template-columns:repeat(6,220px)}figure{margin:4px}img{width:220px}h2{margin-top:2em}</style>' + [...images].map(([group, cells]) => '<h2>' + group + '</h2><div class="grid">' + cells.map(c => '<figure><img src="' + c.file + '"><figcaption>' + c.id + ' — ' + c.view + '</figcaption></figure>').join('') + '</div>').join(''));
    console.log(JSON.stringify(report.summary));
}
if (require.main === module) run().catch(error => { console.error(error); process.exit(1); });
module.exports = { run };
