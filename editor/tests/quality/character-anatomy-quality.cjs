'use strict';
const fs = require('node:fs'), path = require('node:path');
const Creature = require('../../src/forge/Character3D/CreatureBody.js');
const Q = require('../helpers/character-quality-matrix.cjs');

// Independent +X intersections with the actual core triangles, rather than production distance fields.
function insideCore(body, triangles, point) {
    const P = body.positions, hits = [], y = point[1] + 7e-8, z = point[2] + 11e-8;
    for (let i = 0; i < triangles * 3; i += 3) {
        const a = body.index[i] * 3, b = body.index[i + 1] * 3, c = body.index[i + 2] * 3;
        const den = (P[b + 2] - P[c + 2]) * (P[a + 1] - P[c + 1]) + (P[c + 1] - P[b + 1]) * (P[a + 2] - P[c + 2]);
        if (Math.abs(den) < 1e-15) continue;
        const u = ((P[b + 2] - P[c + 2]) * (y - P[c + 1]) + (P[c + 1] - P[b + 1]) * (z - P[c + 2])) / den;
        const v = ((P[c + 2] - P[a + 2]) * (y - P[c + 1]) + (P[a + 1] - P[c + 1]) * (z - P[c + 2])) / den;
        if (u < 0 || v < 0 || u + v > 1) continue;
        const x = u * P[a] + v * P[b] + (1 - u - v) * P[c];
        if (x > point[0] + 1e-8) hits.push(x);
    }
    hits.sort((a, b) => a - b);
    return hits.filter((x, i) => !i || x - hits[i - 1] > 1e-7).length % 2 === 1;
}
function components(part) {
    const n = part.positions.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i);
    const find = v => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
    for (let i = 0; i < part.index.length; i += 3) {
        const root = find(part.index[i]);
        parent[find(part.index[i + 1])] = root; parent[find(part.index[i + 2])] = root;
    }
    const groups = new Map();
    for (let v = 0; v < n; v++) { const root = find(v); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(v); }
    return [...groups.values()].filter(v => v.length > 2);
}
function inspectAttachments(built) {
    const body = built.parts.find(p => p.name === 'Body'), detail = built.parts.find(p => p.name === 'Anatomy');
    const triangles = built.attachments.coreTriangles, issues = [];
    if (built.attachments.tail && !insideCore(body, triangles, built.attachments.tail.root)) issues.push('tail root outside the actual body');
    for (const root of built.attachments.anatomy) if (!insideCore(body, triangles, root.p)) issues.push(root.tag + ' root outside the actual body');
    if (detail) for (const group of components(detail)) {
        // The top, front, rear and side vertices sample the roots without assuming their authored coordinates.
        const candidates = new Set();
        for (let axis = 0; axis < 3; axis++) for (const sign of [1, -1]) {
            const ranked = group.slice().sort((a, b) => sign * (detail.positions[b * 3 + axis] - detail.positions[a * 3 + axis]));
            for (const v of ranked.slice(0, 4)) candidates.add(v);
        }
        if (![...candidates].some(v => insideCore(body, triangles, Array.from(detail.positions.subarray(v * 3, v * 3 + 3))))) issues.push('detached anatomy component (' + group.length + ' vertices)');
    }
    return issues;
}
const PROFILES = [
    ['normal', {}],
    ['compact', { girth: 2.2, legLength: 0.4, hipHeight: 0.6, headSize: 1.8 }],
    ['tall', { girth: 0.5, legLength: 2.2, hipHeight: 1.5, headSize: 0.6, bodyLength: 2.1 }],
    ['mixed', { girth: 1.8, legThickness: 0.3, belly: 1.5, hipHeight: 1.6, tailThickness: 0.3, tailCurl: 1.5 }]
];
function inventory() {
    return Creature.KINDS.flatMap(kind => PROFILES.flatMap(([profile, patch]) => ['male', 'female'].map(sex => ({
        id: kind.kind + '/' + profile + '/' + sex,
        recipe: Creature.normalizeRecipe({ ...Creature.kindRecipe(kind.kind), ...patch, anatomy: { detail: true, sex } })
    }))));
}
function controlEndpoints() {
    return Creature.KINDS.flatMap(kind => ['male', 'female'].flatMap(sex => ['min', 'max'].map(endpoint => {
        const recipe = Creature.normalizeRecipe({ ...Creature.kindRecipe(kind.kind), anatomy: { detail: true, sex } });
        for (const slider of Creature.anatomySliders(recipe)) recipe.anatomy[slider.key] = slider[endpoint];
        return { id: kind.kind + '/' + endpoint + '/' + sex, recipe };
    })));
}
function inspect(fixture, built) {
    const geometry = Q.inspect(built, { ...fixture, group: 'creatures', entity: fixture.recipe.kind }, null);
    return { id: fixture.id, recipe: fixture.recipe, ...geometry,
        attachmentIssues: inspectAttachments(built), anatomyTriangles: built.parts.find(p => p.name === 'Anatomy')?.index.length / 3 || 0 };
}
function run(out, endpoints = false) {
    const source = path.resolve(__dirname, '../../src/forge/Character3D/CreatureBody.js');
    const report = { generatedAt: new Date().toISOString(), sourceHash: require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex'), cases: [] };
    for (const f of endpoints ? controlEndpoints() : inventory()) {
        try {
            const b = Creature.build(f.recipe, { quality: 'preview', hairBudget: 0, static: true, diagnostics: true });
            report.cases.push(inspect(f, b));
        } catch (e) { report.cases.push({ id: f.id, error: String(e.stack) }); }
    }
    report.summary = { total: report.cases.length, failed: report.cases.filter(c => c.error || c.issues?.length || c.attachmentIssues?.length || c.anatomyTriangles > 3200).length,
        maxAnatomyTriangles: Math.max(...report.cases.map(c => c.anatomyTriangles || 0)) };
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report.summary));
    return report;
}
if (require.main === module) process.exitCode = run(process.argv[2] || '/tmp/character-anatomy-quality.json', process.argv.includes('--endpoints')).summary.failed ? 1 : 0;
module.exports = { insideCore, components, inspectAttachments, inventory, controlEndpoints, inspect, run };
