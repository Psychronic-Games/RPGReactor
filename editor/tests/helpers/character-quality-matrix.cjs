'use strict';
const path = require('node:path');
const dir = path.resolve(__dirname, '../../src/forge/Character3D');
const load = name => require(path.join(dir, name + '.js'));
const Body = load('HumanBody'), Creature = load('CreatureBody'), Species = load('CharacterSpecies');
const Model = load('CharacterModel'), Merfolk = load('MerfolkBody'), Slime = load('SlimeBody');
const BODY_STRATA = [
    { id: 'preset-female', patch: { gender: 0, age: 24 } },
    { id: 'preset-male', patch: { gender: 1, age: 65 } },
    { id: 'short-lean', patch: { gender: 0, extreme: true, height: -0.6, weight: -1, muscle: -0.3, headSize: 0.5, shapes: { legLength: -2.5, armLength: -2.5, neckLength: -2.5, headWidth: -2.5 } } },
    { id: 'tall-strong', patch: { gender: 1, extreme: true, height: 1.8, weight: 1, muscle: 2.5, headSize: 2.2, shapes: { torsoLength: 2.5, neckLength: 2.5, handSize: 3, footSize: 3 } } },
    { id: 'heavy-female', patch: { gender: 0, extreme: true, weight: 6, cup: 6, firmness: -0.5, shapes: { belly: 4, hips: 3, butt: 4, breastSpacing: 2, neck: 3, doubleChin: 3 } } },
    { id: 'heavy-male', patch: { gender: 1, age: 85, extreme: true, weight: 6, muscle: 2.5, proportions: 1.6, shapes: { shoulders: 2.5, chest: 2.5, upperArmFat: 4, thighFat: 4, calfFat: 4 } } },
    { id: 'narrow-head', patch: { gender: 0, extreme: true, headSize: 0.5, shapes: { headWidth: -2.5, headHeight: 2.5, headDepth: -2.5, jaw: -3, cheeks: -3, mouthWidth: -2.5, eyeSpacing: -2.5, eyeSize: 4 } } },
    { id: 'broad-head', patch: { gender: 1, extreme: true, headSize: 2.2, shapes: { headWidth: 2.5, headHeight: -2.5, headDepth: 2.5, jaw: 3, cheeks: 3, mouthWidth: 2.5, eyeSpacing: 2.5, eyeSize: 4 } } }
];
const CREATURE_STRATA = [
    { id: 'preset', patch: {} },
    { id: 'all-min', patch: Object.fromEntries(Creature.SLIDERS.map(s => [s.key, s.min])) },
    { id: 'all-max', patch: Object.fromEntries(Creature.SLIDERS.map(s => [s.key, s.max])) },
    { id: 'alternating-min-max', patch: Object.fromEntries(Creature.SLIDERS.map((s, i) => [s.key, i % 2 ? s.max : s.min])) },
    { id: 'alternating-max-min', patch: Object.fromEntries(Creature.SLIDERS.map((s, i) => [s.key, i % 2 ? s.min : s.max])) },
    { id: 'natural-high', patch: Object.fromEntries(Creature.SLIDERS.map(s => [s.key, s.natural[1]])) }
];
const mergeBody = (base, patch) => Model.normalize(Object.assign({}, base, patch, { shapes: Object.assign({}, base.shapes, patch.shapes) }));
function inventory() {
    const cases = [];
    for (const species of Species.SPECIES.filter(s => !s.plan)) for (const stratum of BODY_STRATA) cases.push({ group: 'species', id: species.id + '/' + stratum.id, entity: species.id, stratum: stratum.id, recipe: mergeBody(Model.withSpecies({}, species.id), stratum.patch) });
    for (const [id] of Species.heads()) for (const stratum of [BODY_STRATA[0], ...BODY_STRATA.slice(2, 6)]) cases.push({ group: 'heads', id: id + '/' + stratum.id, entity: id, stratum: stratum.id, recipe: Model.normalize(Object.assign({}, mergeBody(Model.withSpecies({}, 'human'), stratum.patch), { headId: id })) });
    for (const kind of Creature.KINDS) for (const stratum of CREATURE_STRATA) cases.push({ group: 'creatures', id: kind.kind + '/' + stratum.id, entity: kind.kind, stratum: stratum.id, recipe: Creature.normalizeRecipe(Object.assign({}, Creature.kindRecipe(kind.kind), stratum.patch)) });
    for (const [fin] of Merfolk.FINS) for (const [palette] of Merfolk.COLORS) for (const length of [1, 2]) {
        const body = BODY_STRATA[length === 1 ? 2 : 4];
        cases.push({ group: 'merfolk', id: fin + '/' + palette + '/length-' + length, entity: fin, stratum: palette + '/length-' + length, recipe: mergeBody(Model.withSpecies({}, 'merfolk'), Object.assign({}, body.patch, { merfolk: { fin, colors: palette, length, armFins: true, hipFins: true, backFin: true, finEars: true, wetHair: true } })) });
    }
    for (const form of [0, 0.5, 1]) for (const size of [0.4, 2.5]) for (const [feelers] of Slime.FEELERS) cases.push({ group: 'slime', id: 'form-' + form + '/size-' + size + '/' + feelers, entity: 'slimefolk', stratum: 'form-' + form + '/size-' + size + '/' + feelers, recipe: Model.normalize({ plan: 'slime', form, size, feelers, bubbles: size === 0.4 ? 0 : 1, bubbleSize: size === 0.4 ? 0 : 1, eyes: { size: size === 0.4 ? 0.5 : 1.8 } }) });
    return cases;
}
const geometryKey = (part, v) => [0, 1, 2].map(k => Math.round(part.positions[v * 3 + k] * 1e6)).join(',');
function inspect(result, fixture, pack) {
    const issues = [], notes = [], summary = { parts: result.parts.length, vertices: 0, triangles: 0, zeroNormals: 0, nonUnitNormals: 0, degenerateTriangles: 0, bounds: { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }, height: result.height, bones: result.bones.length };
    const issue = (part, kind, detail) => { if (!issues.some(i => i.part === part && i.kind === kind)) issues.push({ part, kind, detail }); };
    if (!result.parts.length || !result.bones.length || !(result.height > 0) || !Number.isFinite(result.height)) issue('model', 'empty-or-invalid-height', result.height);
    let boneExtent = result.height;
    for (const b of result.bones) for (const point of [b.head, b.tail]) if (point) for (const x of point) { if (!Number.isFinite(x)) issue(b.name, 'nonfinite-bone', x); boneExtent = Math.max(boneExtent, Math.abs(x)); }
    for (const p of result.parts) {
        const count = p.positions.length / 3; summary.vertices += count; summary.triangles += p.index.length / 3;
        if (!Number.isInteger(count) || count === 0 || p.index.length % 3 || !p.index.length) issue(p.name, 'empty-or-malformed-mesh', count);
        if (!p.normals || p.normals.length !== p.positions.length) issue(p.name, 'normal-count', p.normals?.length);
        if (p.joints?.length !== count * 4 || p.weights?.length !== count * 4) issue(p.name, 'skin-count', [p.joints?.length, p.weights?.length]);
        if (p.uvs && p.uvs.length !== count * 2) issue(p.name, 'uv-count', p.uvs.length);
        const usedVertices = new Set(p.index);
        for (let v = 0; v < count; v++) {
            for (let k = 0; k < 3; k++) { const x = p.positions[v * 3 + k]; if (!Number.isFinite(x)) issue(p.name, 'nonfinite-position', v); else { summary.bounds.lo[k] = Math.min(summary.bounds.lo[k], x); summary.bounds.hi[k] = Math.max(summary.bounds.hi[k], x); if (Math.abs(x) > Math.max(1, boneExtent) * 6) issue(p.name, 'position-explosion', [v, x, boneExtent]); } }
            const length = Math.hypot(...p.normals.subarray(v * 3, v * 3 + 3));
            if (!Number.isFinite(length)) issue(p.name, 'nonfinite-normal', v);
            // Transferred garments retain source-addressed vertices outside
            // their cut. Only indexed vertices need a lighting normal.
            else if (usedVertices.has(v) && length < 1e-5) { summary.zeroNormals++; issue(p.name, 'zero-normal', v); }
            else if (usedVertices.has(v) && Math.abs(length - 1) > 0.03) { summary.nonUnitNormals++; issue(p.name, 'nonunit-normal', [v, length]); }
            let sum = 0;
            for (let k = 0; k < 4; k++) { const j = p.joints[v * 4 + k], w = p.weights[v * 4 + k]; if (!Number.isInteger(j) || j >= result.bones.length || j < 0) issue(p.name, 'invalid-joint', [v, j]); if (!Number.isFinite(w) || w < -1e-6 || w > 1.00001) issue(p.name, 'invalid-weight', [v, w]); sum += w; }
            if (Math.abs(sum - 1) > 1e-4) issue(p.name, 'weight-sum', [v, sum]);
        }
        for (const index of p.index) if (index < 0 || index >= count || !Number.isInteger(index)) issue(p.name, 'invalid-index', index);
        for (let i = 0; i < p.index.length; i += 3) {
            const a = p.index[i] * 3, b = p.index[i + 1] * 3, c = p.index[i + 2] * 3, P = p.positions;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            if (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) < result.height * result.height * 1e-12) summary.degenerateTriangles++;
        }
        for (const field of ['uvs', 'colors']) if (p[field]) for (const x of p[field]) if (!Number.isFinite(x)) { issue(p.name, 'nonfinite-' + field, x); break; }
        if (p.texture && !result.textures[p.texture]) issue(p.name, 'missing-texture', p.texture);
    }
    for (const [name, texture] of Object.entries(result.textures || {})) if (!(texture.width > 0 && texture.height > 0) || !texture.data || texture.data.length !== texture.width * texture.height * 4) issue(name, 'malformed-texture', [texture.width, texture.height, texture.data?.length]);
    const skull = result.parts.find(p => p.name === 'Head Body'), neck = result.parts.find(p => p.name === 'Head neck'), body = result.parts.find(p => p.name === 'Body');
    if (skull) {
        if (!neck) issue('Head neck', 'missing-attachment');
        else {
            // Clothing may hide the source neck rim. Its retained positions still
            // define the join, even when those body triangles are not drawn.
            const visible = new Map(); for (let v = 0; v < body.positions.length / 3; v++) visible.set(geometryKey(body, v), v);
            const edges = new Map(), skullLo = [Infinity, Infinity, Infinity], skullHi = [-Infinity, -Infinity, -Infinity];
            for (let v = 0; v < skull.positions.length; v += 3) for (let k = 0; k < 3; k++) { skullLo[k] = Math.min(skullLo[k], skull.positions[v + k]); skullHi[k] = Math.max(skullHi[k], skull.positions[v + k]); }
            for (let t = 0; t < neck.index.length; t += 3) for (let k = 0; k < 3; k++) {
                const a = neck.index[t + k], b = neck.index[t + (k + 1) % 3], ka = geometryKey(neck, a), kb = geometryKey(neck, b), key = ka < kb ? ka + '|' + kb : kb + '|' + ka;
                const edge = edges.get(key); if (edge) edge.count++; else edges.set(key, { count: 1, a, b, ka, kb });
            }
            let baseEdges = 0, insetEdges = 0;
            for (const edge of edges.values()) if (edge.count === 1) {
                if (visible.has(edge.ka) && visible.has(edge.kb)) {
                    baseEdges++;
                    for (const v of [edge.a, edge.b]) {
                        const source = visible.get(geometryKey(neck, v));
                        let dot = 0; for (let k = 0; k < 3; k++) dot += neck.normals[v * 3 + k] * body.normals[source * 3 + k];
                        if (dot < 0.99) issue(neck.name, 'base-normal-seam', dot);
                        for (let k = 0; k < 4; k++) {
                            const j = neck.joints[v * 4 + k], w = neck.weights[v * 4 + k]; let expected = 0;
                            for (let q = 0; q < 4; q++) if (body.joints[source * 4 + q] === j) expected += body.weights[source * 4 + q];
                            if (Math.abs(w - expected) > 1e-4) issue(neck.name, 'base-skinning-seam', [v, j, w, expected]);
                        }
                    }
                } else if ([edge.a, edge.b].every(v => [0, 1, 2].every(k => neck.positions[v * 3 + k] > skullLo[k] && neck.positions[v * 3 + k] < skullHi[k]))) insetEdges++;
                else issue(neck.name, 'detached-boundary', [edge.a, edge.b]);
            }
            if (baseEdges < 12 || insetEdges < 12) issue(neck.name, 'missing-attachment-rim', [baseEdges, insetEdges]);
        }
        const head = result.bones.findIndex(b => b.name === 'Head');
        for (let v = 0; v < skull.positions.length / 3; v++) { let w = 0; for (let k = 0; k < 4; k++) if (skull.joints[v * 4 + k] === head) w += skull.weights[v * 4 + k]; if (w < 0.9999) { issue(skull.name, 'nonrigid-skull', v); break; } }
    }
    if (fixture.recipe.species === 'merfolk') {
        const tail = result.parts.find(p => p.name === 'Tail');
        if (!tail) issue('Tail', 'missing-merfolk-tail');
        else {
            const points = new Set(); for (let v = 0; v < tail.positions.length / 3; v++) points.add(geometryKey(tail, v));
            const sourceToRender = new Map(); pack.body.source.forEach((v, i) => sourceToRender.set(v, i));
            for (const v of Merfolk.cutOf(pack).ring) if (!points.has(geometryKey(body, sourceToRender.get(v)))) issue('Tail', 'detached-scale-line', v);
        }
    }
    const top = summary.bounds.hi[1];
    if (Math.abs(top - result.height) > Math.max(0.03, result.height * 0.1)) notes.push({ kind: 'height-includes-other-feature-rule', top, height: result.height });
    return { issues, notes, summary };
}
module.exports = { Body, Creature, Species, Model, Merfolk, Slime, BODY_STRATA, CREATURE_STRATA, inventory, inspect };
