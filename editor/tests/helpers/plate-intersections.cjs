'use strict';
// Rigid armor plates through bend poses: the total length (mm) of the curves
// where plates carried by different bones cut through each other. Plates on
// one bone never move against each other, so only cross-bone pairs count.
// A length, unlike a count of crossing triangles, does not grow with mesh
// density. Usage as a script: node plate-intersections.cjs <Character3D dir> <preset> <gender>
const path = require('node:path');
const LIVE = path.resolve(__dirname, '../../src/forge/Character3D');

function segmentLength(a, b) {
    const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]], cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]], dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
    const na = cross(sub(a[1], a[0]), sub(a[2], a[0])), nb = cross(sub(b[1], b[0]), sub(b[2], b[0])), L = cross(na, nb), l = Math.hypot(...L);
    if (l < 1e-14) return 0;
    const cut = (t, n, p0) => {
        const d = t.map(p => dot(sub(p, p0), n)), out = [];
        for (let i = 0; i < 3; i++) { const j = (i + 1) % 3; if ((d[i] > 0) !== (d[j] > 0)) { const u = d[i] / (d[i] - d[j]); out.push(dot([t[i][0] + (t[j][0] - t[i][0]) * u, t[i][1] + (t[j][1] - t[i][1]) * u, t[i][2] + (t[j][2] - t[i][2]) * u], L)); } }
        return out;
    };
    const sa = cut(a, nb, b[0]), sb = cut(b, na, a[0]);
    if (sa.length < 2 || sb.length < 2) return 0;
    return Math.max(0, Math.min(Math.max(...sa), Math.max(...sb)) - Math.max(Math.min(...sa), Math.min(...sb))) / l;
}

/** Cross-bone intersection length (mm) of `parts`, each skinned to `positions[i]`. */
function crossBoneLength(parts, positions) {
    const tris = [];
    parts.forEach((p, pi) => {
        const P = positions[pi];
        for (let t = 0; t < p.index.length; t += 3) {
            const v = [0, 1, 2].map(k => { const i = p.index[t + k] * 3; return [P[i], P[i + 1], P[i + 2]]; });
            tris.push({ v, j: p.joints[p.index[t] * 4], lo: [0, 1, 2].map(k => Math.min(v[0][k], v[1][k], v[2][k])), hi: [0, 1, 2].map(k => Math.max(v[0][k], v[1][k], v[2][k])) });
        }
    });
    // Sweep and prune along x.
    tris.sort((a, b) => a.lo[0] - b.lo[0]);
    let total = 0;
    const active = [];
    for (const t of tris) {
        for (let i = active.length - 1; i >= 0; i--) if (active[i].hi[0] < t.lo[0]) active.splice(i, 1);
        for (const o of active) {
            if (o.j === t.j || o.lo[1] > t.hi[1] || t.lo[1] > o.hi[1] || o.lo[2] > t.hi[2] || t.lo[2] > o.hi[2]) continue;
            total += segmentLength(o.v, t.v);
        }
        active.push(t);
    }
    return total * 1000;
}

/** { rest, walk, kneel, sit }: the worst frame of each pose for a preset's medieval plates. */
async function measure(dir, presetId, gender, frames = [0.5, 1], cache = {}) {
    const D = dir || LIVE, load = name => require(path.join(D, name + '.js'));
    const Body = load('HumanBody'), W = load('CharacterWardrobe');
    const Cloth = require(path.join(LIVE, 'CharacterCloth.js')), Poses = require(path.join(LIVE, 'CharacterPoses.js'));
    const pack = cache.pack || (cache.pack = await Body.loadPack());
    const body = Body.build(pack, Body.normalizeRecipe({ gender }));
    const wear = W.build(pack, body, W.PRESETS.find(p => p.id === presetId).items, { atlasSize: 64 });
    const plates = wear.parts.filter(p => /^Medieval /.test(p.name) && !/etching$/.test(p.name));
    const out = { rest: Math.round(crossBoneLength(plates, plates.map(p => p.positions))) };
    for (const name of ['walk', 'kneel', 'sit']) {
        const clip = Poses.clip(body.bones, name, body.parts[0]);
        let worst = 0;
        for (const f of frames) {
            const ps = Cloth.pose(body.bones, clip, clip.times.at(-1) * f);
            worst = Math.max(worst, crossBoneLength(plates, plates.map(p => Cloth.skin(p, body.bones, ps))));
        }
        out[name] = Math.round(worst);
    }
    return out;
}

module.exports = { segmentLength, crossBoneLength, measure };
if (require.main === module) measure(process.argv[2], process.argv[3] || 'knight', +(process.argv[4] || 0)).then(r => console.log(JSON.stringify(r)));
