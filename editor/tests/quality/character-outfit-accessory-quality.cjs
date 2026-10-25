'use strict';
// Repeatable catalog audit. Run: node <this file> --out /tmp/character-clothing-quality.json
// Optional: --profile broad-head. This checks static geometry and sampled hiding safety;
// it does not claim that unposed cloth drape, material appearance or self-intersection is correct.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Body, BODY_STRATA } = require('../helpers/character-quality-matrix.cjs');
const Wardrobe = require('../../src/forge/Character3D/CharacterWardrobe.js');
const Props = require('../../src/forge/Character3D/CharacterProps.js');
// Fresh mixed proportions complement the prior single-axis and head-focused strata.
const FRESH_PROFILES = [
    { id: 'compact-lean', patch: { gender: 0, extreme: true, height: -.8, weight: -.8, muscle: -.4, shapes: { hips: -2.2, shoulders: -2, torsoLength: -2, neckLength: -2, legLength: -1.6 } } },
    { id: 'short-wide', patch: { gender: 1, extreme: true, height: -1, weight: 1.6, muscle: 1.8, shapes: { torsoLength: -2.5, hips: 1.8, shoulders: 2, armLength: -1.8 } } },
    { id: 'tall-narrow', patch: { gender: 1, extreme: true, height: 2.2, weight: -.4, muscle: .5, shapes: { torsoLength: 2, hips: -2, shoulders: -1.4, neckLength: 1.7, legLength: 1.5 } } },
    { id: 'bust-narrow', patch: { gender: 0, extreme: true, weight: .6, cup: 3.7, firmness: -.3, shapes: { hips: -1.8, waist: -1.8, torsoLength: -1, breastSpacing: 1.2 } } },
    { id: 'barrel-male', patch: { gender: 1, extreme: true, weight: 4, muscle: 1.5, shapes: { belly: 2.7, hips: -1.3, shoulders: 1.4, torsoLength: -1 } } },
    { id: 'pear-female', patch: { gender: 0, extreme: true, weight: 3.2, cup: 2.8, shapes: { hips: 3, butt: 3, belly: 1.6, shoulders: -1.4, legLength: -1.2 } } }
];
function sourceHashes() {
    const names = ['HumanBody', 'CharacterWardrobe', 'CharacterOutfit', 'CharacterProps', 'CharacterPowerArmor', 'CharacterClothes', 'CharacterOutfitTransfer', 'CharacterCloth', 'CharacterPoses'];
    return Object.fromEntries(names.map(name => [name + '.js', createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../../src/forge/Character3D', name + '.js'))).digest('hex')]));
}

function inspect(parts, built, textures, emptyAllowed) {
    const issues = [], summary = { parts: parts.length, vertices: 0, triangles: 0, degenerateTriangles: 0 };
    const issue = (part, kind, detail) => { if (!issues.some(i => i.part === part && i.kind === kind)) issues.push({ part, kind, detail }); };
    if (!parts.length && !emptyAllowed) issue('model', 'empty');
    for (const p of parts) {
        const n = p.positions.length / 3; summary.vertices += n; summary.triangles += p.index.length / 3;
        if (!n || !p.index.length || p.index.length % 3) issue(p.name, 'empty-or-malformed');
        if (p.normals?.length !== p.positions.length || p.joints?.length !== n * 4 || p.weights?.length !== n * 4) issue(p.name, 'attribute-count');
        for (const key of ['positions', 'normals', 'weights', 'uvs', 'colors']) if (p[key]) for (const v of p[key]) if (!Number.isFinite(v)) { issue(p.name, 'nonfinite-' + key); break; }
        for (const i of p.index) if (!Number.isInteger(i) || i < 0 || i >= n) { issue(p.name, 'invalid-index', i); break; }
        for (let v = 0; v < n; v++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                const j = p.joints[v * 4 + k], w = p.weights[v * 4 + k]; sum += w;
                if (!Number.isInteger(j) || j < 0 || j >= built.bones.length || w < -1e-6 || w > 1.00001) issue(p.name, 'invalid-skin', v);
            }
            if (Math.abs(sum - 1) > 0.001) issue(p.name, 'weight-sum', [v, sum]);
        }
        for (let i = 0; i < p.index.length; i += 3) {
            const a = p.index[i] * 3, b = p.index[i + 1] * 3, c = p.index[i + 2] * 3, P = p.positions;
            const x = P[b] - P[a], y = P[b + 1] - P[a + 1], z = P[b + 2] - P[a + 2], u = P[c] - P[a], v = P[c + 1] - P[a + 1], w = P[c + 2] - P[a + 2];
            if (Math.hypot(y * w - z * v, z * u - x * w, x * v - y * u) < built.height * built.height * 1e-12) summary.degenerateTriangles++;
        }
        if (p.texture && !textures[p.texture]) issue(p.name, 'missing-texture', p.texture);
    }
    return { issues, summary };
}

// Separate scalar triangle/ray implementation; it does not call Outfit.uncovered().
function surfaceHit(parts, point, direction) {
    const [dx, dy, dz] = direction;
    for (const part of parts) for (let k = 0; k < part.index.length; k += 3) {
        const P = part.positions, a = part.index[k] * 3, b = part.index[k + 1] * 3, c = part.index[k + 2] * 3;
        const x = P[b] - P[a], y = P[b + 1] - P[a + 1], z = P[b + 2] - P[a + 2], u = P[c] - P[a], v = P[c + 1] - P[a + 1], w = P[c + 2] - P[a + 2];
        const px = dy * w - dz * v, py = dz * u - dx * w, pz = dx * v - dy * u, det = x * px + y * py + z * pz;
        if (Math.abs(det) < 1e-12) continue;
        const tx = point[0] - P[a], ty = point[1] - P[a + 1], tz = point[2] - P[a + 2], U = (tx * px + ty * py + tz * pz) / det;
        if (U < -1e-6 || U > 1.000001) continue;
        const qx = ty * z - tz * y, qy = tz * x - tx * z, qz = tx * y - ty * x, V = (dx * qx + dy * qy + dz * qz) / det;
        if (V < -1e-6 || U + V > 1.000001) continue;
        const t = (u * qx + v * qy + w * qz) / det;
        if (t > -0.004001 && t < 0.100001) return true;
    }
    return false;
}

/** Exact nearest-triangle distance for adjudicating rays grazing a cut edge. */
function surfaceDistance(parts, point, reach = 0.01) {
    let best = reach * reach, found = false;
    const segment = (p, a, b) => {
        const d = b.map((x, k) => x - a[k]), q = p.map((x, k) => x - a[k]);
        const length = d.reduce((s, x) => s + x * x, 0), t = length ? Math.max(0, Math.min(1, d.reduce((s, x, k) => s + x * q[k], 0) / length)) : 0;
        return q.reduce((s, x, k) => s + (x - t * d[k]) ** 2, 0);
    };
    for (const part of parts) for (let k = 0; k < part.index.length; k += 3) {
        const P = part.positions, vertices = [0, 1, 2].map(i => part.index[k + i] * 3);
        let boxDistance = 0;
        for (let c = 0; c < 3; c++) {
            const lo = Math.min(...vertices.map(v => P[v + c])), hi = Math.max(...vertices.map(v => P[v + c]));
            boxDistance += Math.max(lo - point[c], 0, point[c] - hi) ** 2;
        }
        if (boxDistance > best) continue;
        const [a, b, c] = vertices.map(v => [P[v], P[v + 1], P[v + 2]]), u = b.map((x, i) => x - a[i]), v = c.map((x, i) => x - a[i]), q = point.map((x, i) => x - a[i]);
        const dot = (x, y) => x.reduce((s, x, i) => s + x * y[i], 0), uu = dot(u, u), uv = dot(u, v), vv = dot(v, v), qu = dot(q, u), qv = dot(q, v), det = uu * vv - uv * uv;
        const s = det > 1e-20 ? (vv * qu - uv * qv) / det : -1, t = det > 1e-20 ? (uu * qv - uv * qu) / det : -1;
        let distance;
        if (s >= 0 && t >= 0 && s + t <= 1) distance = q.reduce((sum, x, i) => sum + (x - s * u[i] - t * v[i]) ** 2, 0);
        else distance = Math.min(segment(point, a, b), segment(point, b, c), segment(point, c, a));
        if (distance <= best) { best = distance; found = true; }
    }
    return found ? Math.sqrt(best) : Infinity;
}

async function audit(options = {}) {
    const started = performance.now(), sources = sourceHashes(), pack = await Body.loadPack();
    const profiles = (options.fresh ? FRESH_PROFILES : BODY_STRATA).filter(p => !options.profile || p.id === options.profile);
    if (!profiles.length) throw new Error('Unknown body profile: ' + options.profile);
    const entries = [
        ...Wardrobe.GARMENTS.map(g => ({ group: g.transfer ? 'transferred' : g.modeled ? 'modeled' : 'procedural', id: g.id, items: [{ id: g.id }] })),
        ...Wardrobe.PRESETS.map(p => ({ group: 'preset', id: p.id, items: p.items, emptyAllowed: p.id === 'none' })),
        ...Props.PROPS.map(p => ({ group: 'accessory', id: p.id }))
    ].filter(entry => !options.modeled || entry.group === 'modeled' || (entry.group === 'preset' && entry.items.some(i => Wardrobe.BY_ID.get(i.id)?.modeled)));
    const results = [];
    for (const profile of profiles) {
        const body = Body.build(pack, Body.normalizeRecipe(profile.patch)), normals = Body.vertexNormals(pack, body.shaped);
        for (const entry of entries) {
            try {
                const made = entry.group === 'accessory' ? Props.build(pack, body, [{ id: entry.id }]) : Wardrobe.build(pack, body, entry.items, { atlasSize: 64 });
                const textures = Object.fromEntries([...(made.textures || []), ...(made.texture ? [made.texture] : [])].map(t => [t.name, t]));
                const result = inspect(made.parts, body, textures, entry.emptyAllowed);
                const hidden = [...(made.hidden || [])], count = Math.min(32, hidden.length), unsupported = [];
                if (!result.issues.length) for (let i = 0; i < count; i++) {
                    const v = hidden[Math.floor(i * hidden.length / count)];
                    if (!surfaceHit(made.parts, body.shaped.subarray(v * 3, v * 3 + 3), normals.subarray(v * 3, v * 3 + 3))) unsupported.push(v);
                }
                if (unsupported.length) result.issues.push({ part: 'hidden skin', kind: 'no-real-cover', detail: unsupported });
                results.push({ group: entry.group, id: entry.id, profile: profile.id, ...result, hidden: hidden.length, hiddenProbes: count });
            } catch (error) { results.push({ group: entry.group, id: entry.id, profile: profile.id, issues: [{ part: 'build', kind: 'exception', detail: String(error.stack || error) }] }); }
        }
        if (options.progress) options.progress({ profile: profile.id, completed: results.length, issues: results.filter(r => r.issues.length).length, elapsedMs: performance.now() - started });
    }
    return {
        inventory: { profiles: profiles.map(p => p.id), procedural: Wardrobe.GARMENTS.filter(g => !g.modeled && !g.transfer).length,
            modeled: Wardrobe.GARMENTS.filter(g => g.modeled).length, transferred: Wardrobe.GARMENTS.filter(g => g.transfer).length, presets: Wardrobe.PRESETS.length, accessories: Props.PROPS.length },
        cases: results.length, hiddenProbes: results.reduce((s, r) => s + (r.hiddenProbes || 0), 0), elapsedMs: performance.now() - started, sourceHashes: sources,
        limitations: ['Static rest pose only; no guarantee against garment self-intersection or moving cloth coverage.', 'Hiding probes sample up to 32 actual hidden skin vertices per entry/profile; authored open cuts remain open.'],
        failures: results.filter(r => r.issues.length), results
    };
}

async function auditMotion(options = {}) {
    const Cloth = require('../../src/forge/Character3D/CharacterCloth.js');
    const Poses = require('../../src/forge/Character3D/CharacterPoses.js');
    const started = performance.now(), sources = sourceHashes(), pack = await Body.loadPack(), results = [];
    const profiles = (options.fresh ? FRESH_PROFILES : BODY_STRATA).filter(p => options.profile ? p.id === options.profile : options.fresh || ['preset-female', 'heavy-female'].includes(p.id));
    const garments = Wardrobe.GARMENTS.filter(g => g.modeled || g.transfer);
    for (const profile of profiles) {
        const body = Body.build(pack, Body.normalizeRecipe(profile.patch));
        const poses = [];
        for (const [id, fractions] of [['walk', [0, 0.25, 0.5]], ['sit', [0]], ['kneel', [0]]]) {
            const clip = Poses.clip(body.bones, id, body.parts[0]);
            for (const fraction of fractions) {
                const pose = Cloth.pose(body.bones, clip, clip.times[clip.times.length - 1] * fraction);
                const positions = Cloth.skin({ positions: body.shaped, joints: pack.skinJoints, weights: pack.skinWeights }, body.bones, pose);
                poses.push({ id, fraction, pose, positions, normals: Body.vertexNormals(pack, positions) });
            }
        }
        for (const garment of garments) {
            const made = Wardrobe.build(pack, body, [{ id: garment.id }], { atlasSize: 64 });
            const hidden = [...made.hidden], count = Math.min(32, hidden.length), covered = new Set(hidden), neighbors = Body.neighbors(pack);
            const interior = new Set(hidden.filter(v => neighbors.flat.subarray(neighbors.offsets[v], neighbors.offsets[v + 1]).every(n => covered.has(n))));
            const faceKeys = new Set(), interiorFaces = [];
            for (let t = 0; t < pack.body.index.length; t += 3) {
                const ids = [0, 1, 2].map(k => pack.body.source[pack.body.index[t + k]]), key = [...ids].sort((a, b) => a - b).join(':');
                if (ids.every(v => interior.has(v)) && !faceKeys.has(key)) { faceKeys.add(key); interiorFaces.push(ids); }
            }
            for (const posed of poses) {
                const parts = made.parts.map(part => ({ index: part.index, positions: Cloth.skin(part, body.bones, posed.pose) }));
                const unsupported = [], invalidNormals = [];
                for (let i = 0; i < count; i++) {
                    const v = hidden[Math.floor(i * hidden.length / count)], normal = posed.normals.subarray(v * 3, v * 3 + 3);
                    if (Math.hypot(...normal) < 0.5) invalidNormals.push(v);
                    else if (!surfaceHit(parts, posed.positions.subarray(v * 3, v * 3 + 3), normal)) unsupported.push(v);
                }
                const areaProbes = Math.min(24, interiorFaces.length), unsupportedFaces = [];
                let sampledInteriorArea = 0, unsupportedInteriorArea = 0;
                for (let i = 0; i < areaProbes; i++) {
                    const ids = interiorFaces[Math.floor(i * interiorFaces.length / areaProbes)], points = ids.map(v => posed.positions.subarray(v * 3, v * 3 + 3));
                    const u = [0, 1, 2].map(k => points[1][k] - points[0][k]), v = [0, 1, 2].map(k => points[2][k] - points[0][k]);
                    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...n);
                    if (length < 1e-10) continue;
                    const center = [0, 1, 2].map(k => points.reduce((sum, p) => sum + p[k], 0) / 3);
                    sampledInteriorArea += length / 2;
                    if (!surfaceHit(parts, center, n.map(x => x / length))) { unsupportedInteriorArea += length / 2; unsupportedFaces.push({ ids, area: length / 2, distance: surfaceDistance(parts, center) }); }
                }
                results.push({ id: garment.id, profile: profile.id, pose: posed.id, fraction: posed.fraction, hiddenProbes: count,
                    areaProbes, sampledInteriorArea, unsupportedInteriorArea, unsupportedFaces, unsupported, normalRayMissDistances: unsupported.map(v => ({ v, distance: surfaceDistance(parts, posed.positions.subarray(v * 3, v * 3 + 3)) })),
                    invalidNormals, finite: parts.every(p => p.positions.every(Number.isFinite)) });
            }
        }
        if (options.progress) options.progress({ profile: profile.id, completed: results.length, elapsedMs: performance.now() - started });
    }
    return { cases: results.length, hiddenProbes: results.reduce((s, r) => s + r.hiddenProbes, 0), areaProbes: results.reduce((s, r) => s + r.areaProbes, 0), elapsedMs: performance.now() - started, sourceHashes: sources,
        limitations: ['Actual weighted body and clothing geometry; moving cloth solver is not applied.', 'Samples up to 32 skin vertices per garment and pose, not every rendered pixel.'],
        failures: results.filter(r => !r.finite || r.unsupported.length || r.invalidNormals.length || r.unsupportedFaces.length), results };
}

if (require.main === module) {
    const args = process.argv.slice(2), option = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
    (args.includes('--motion') ? auditMotion : audit)({ profile: option('--profile'), fresh: args.includes('--fresh'), modeled: args.includes('--modeled'), progress: value => console.log(JSON.stringify(value)) }).then(report => {
        if (option('--out')) fs.writeFileSync(path.resolve(option('--out')), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ inventory: report.inventory, cases: report.cases, hiddenProbes: report.hiddenProbes, elapsedMs: report.elapsedMs, failures: report.failures }, null, 2));
        if (report.failures.length) process.exitCode = 1;
    }).catch(error => { console.error(error); process.exitCode = 1; });
}
module.exports = { FRESH_PROFILES, audit, auditMotion, inspect, surfaceHit, surfaceDistance, sourceHashes };
