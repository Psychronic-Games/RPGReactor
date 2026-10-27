/**
 * RRCharacterBodyMods - the geometry side of body art: piercings, the
 * cybernetic eye, facial implant studs and plates, cyber limbs (replaced or
 * plated), and the cyber variants of the species features (tails, wings,
 * horns, ears), all in the four shared cyber styles of RRCharacterBodyArt.
 *
 * Cyber limbs are measured on the shaped body: each bone's stretch of skin
 * gives the cross-sections the shell follows, so a limb fits any build.
 * Every piece rides one bone rigidly (a shell on the upper arm, a ball on
 * the elbow's lower side, a plate per finger joint) and pieces overlap at
 * the joints, so they bend with any motion without tearing; only cables
 * crossing a joint are blended. A replaced limb's skin is left out
 * (`hiddenSkin`), a collar seats it at the stump, and the skin round the
 * stump is scarred and ported (`skinLayers`).
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Outfit = need('RRCharacterOutfit', './CharacterOutfit.js');
    const Art = need('RRCharacterBodyArt', './CharacterBodyArt.js');
    const Body = () => root.RRHumanBody || require('./HumanBody.js');
    const linear = hex => Outfit.linear(hex);
    const TAU = Math.PI * 2;
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const mixRgb = lerp;
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    const rigid = b => ({ joints: [b, 0, 0, 0], weights: [1, 0, 0, 0] });

    // ── hard-surface mesh ─────────────────────────────────────────────────
    /** Geometry with explicit normals, colors, picture coordinates and per-vertex skin. */
    class Hard {
        constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.j = []; this.w = []; this.i = []; }
        get count() { return this.p.length / 3; }
        get empty() { return !this.i.length; }
        v(pos, nrm, rgb, skin, uv) {
            const k = this.count;
            this.p.push(pos[0], pos[1], pos[2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(rgb[0], rgb[1], rgb[2]);
            this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
            const s = typeof skin === 'function' ? skin(pos) : skin;
            for (let q = 0; q < 4; q++) { this.j.push(s.joints[q] || 0); this.w.push(s.weights[q] || 0); }
            return k;
        }
        /** A triangle wound to face the way its corners' normals point (front faces outward, whatever order it is given in). */
        tri(a, b, c) {
            const P = this.p, N = this.n;
            const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
            const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            const s = nx * (N[a * 3] + N[b * 3] + N[c * 3]) + ny * (N[a * 3 + 1] + N[b * 3 + 1] + N[c * 3 + 1]) + nz * (N[a * 3 + 2] + N[b * 3 + 2] + N[c * 3 + 2]);
            if (s < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
        }
        /**
         * A surface patch: `at(u, v)` gives a point for u, v in 0..1 over
         * `us` x `vs` samples (arrays of parameters); normals from the patch
         * itself (smooth across it), facing out from `center(u, v)` when given.
         * `wrapU` closes it round.
         */
        patch(us, vs, at, rgb, skin, o = {}) {
            const rows = vs.length, cols = us.length, P = [];
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) P.push(at(us[c], vs[r]));
            const base = this.count, ids = [];
            for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
                const k = r * cols + c, p = P[k];
                const cl = o.wrapU ? (c - 1 + cols) % cols : Math.max(0, c - 1), cr = o.wrapU ? (c + 1) % cols : Math.min(cols - 1, c + 1);
                const rd = Math.max(0, r - 1), ru = Math.min(rows - 1, r + 1);
                let n = o.normal ? o.normal(p) : norm(cross(sub(P[r * cols + cr], P[r * cols + cl]), sub(P[ru * cols + c], P[rd * cols + c])));
                if (o.flip) n = mul(n, -1);
                // Facing away from a point inside the solid (its axis, its center): outward whatever the parameters' handedness.
                if (o.away) { const q = typeof o.away === 'function' ? o.away(us[c], vs[r], p) : o.away; if (dot(n, sub(p, q)) < 0) n = mul(n, -1); }
                const color = typeof rgb === 'function' ? rgb(us[c], vs[r], p) : rgb;
                ids.push(this.v(p, n, color, skin, o.uv ? o.uv(us[c], vs[r], p) : [us[c], vs[r]]));
            }
            const lastC = o.wrapU ? cols : cols - 1;
            for (let r = 0; r + 1 < rows; r++) for (let c = 0; c < lastC; c++) {
                const a = ids[r * cols + c], b = ids[r * cols + (c + 1) % cols], d = ids[(r + 1) * cols + c], e = ids[(r + 1) * cols + (c + 1) % cols];
                if (o.flip) { this.tri(a, b, d); this.tri(b, e, d); } else { this.tri(a, d, b); this.tri(b, d, e); }
            }
            return { ids, rows, cols };
        }
        /** A tube along points (radius per point); round ends closed with a cap. */
        tube(points, radius, sides, rgb, skin, o = {}) {
            const n = points.length;
            let prev = null;
            const frames = points.map((p, i) => {
                const d = norm(sub(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]));
                let x = prev ? norm(sub(prev, mul(d, dot(prev, d)))) : norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
                prev = x;
                return { d, x, y: cross(d, x) };
            });
            const R = i => (typeof radius === 'function' ? radius(n > 1 ? i / (n - 1) : 0, i) : Array.isArray(radius) ? radius[i] : radius);
            const us = Array.from({ length: sides }, (_, k) => k / sides), vs = points.map((_, i) => i);
            this.patch(us, vs, (u, i) => { const F = frames[i], a = u * TAU, r = R(i); return add(points[i], add(mul(F.x, Math.cos(a) * r * (o.squash || 1)), mul(F.y, Math.sin(a) * r))); }, rgb, skin, { wrapU: true, uv: (u, i) => [u, i / Math.max(1, n - 1)], away: (u, i) => points[i] });
            if (o.caps !== false) for (const end of [0, n - 1]) {
                const F = frames[end], c = this.v(points[end], mul(F.d, end ? 1 : -1), typeof rgb === 'function' ? rgb(0, end) : rgb, skin);
                const ring = [];
                for (let k = 0; k < sides; k++) { const a = k / sides * TAU, r = R(end); ring.push(this.v(add(points[end], add(mul(F.x, Math.cos(a) * r * (o.squash || 1)), mul(F.y, Math.sin(a) * r))), mul(F.d, end ? 1 : -1), typeof rgb === 'function' ? rgb(0, end) : rgb, skin)); }
                for (let k = 0; k < sides; k++) { if (end) this.tri(c, ring[k], ring[(k + 1) % sides]); else this.tri(c, ring[(k + 1) % sides], ring[k]); }
            }
        }
        sphere(c, r, rgb, skin, rows = 6, sides = 10, squash = [1, 1, 1], axes) {
            const X = axes ? axes[0] : [1, 0, 0], Y = axes ? axes[1] : [0, 1, 0], Z = axes ? axes[2] : [0, 0, 1];
            const us = Array.from({ length: sides }, (_, k) => k / sides), vs = Array.from({ length: rows + 1 }, (_, k) => k / rows);
            const at = (u, v) => { const ph = -Math.PI / 2 + v * Math.PI, a = u * TAU; return add(c, add(add(mul(X, Math.cos(ph) * Math.cos(a) * r * squash[0]), mul(Z, Math.cos(ph) * Math.sin(a) * r * squash[2])), mul(Y, Math.sin(ph) * r * squash[1]))); };
            this.patch(us, vs, at, rgb, skin, { wrapU: true, normal: p => norm(sub(p, c)) });
        }
        /** A ring (torus) round `axis` at `c`. */
        torus(c, axis, R, r, rgb, skin, sides = 16, tube = 6, arc = TAU, start = 0) {
            const a = norm(axis), x = norm(cross(a, Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), y = cross(a, x);
            const full = arc >= TAU - 1e-6;
            const us = Array.from({ length: full ? sides : sides + 1 }, (_, k) => k / sides), vs = Array.from({ length: tube + 1 }, (_, k) => k / tube);
            const tubeNormal = p => { const q = sub(p, c), along = dot(q, a), rad = norm(sub(q, mul(a, along))); return norm(sub(p, add(c, mul(rad, R)))); };
            this.patch(vs, us, (v, u) => {
                const t = start + u * arc, b = v * TAU, dir = add(mul(x, Math.cos(t)), mul(y, Math.sin(t)));
                return add(c, add(mul(dir, R + Math.cos(b) * r), mul(a, Math.sin(b) * r)));
            }, rgb, skin, { wrapU: true, normal: tubeNormal });
            if (!full) for (const t of [start, start + arc]) { const dir = add(mul(x, Math.cos(t)), mul(y, Math.sin(t))); this.sphere(add(c, mul(dir, R)), r, rgb, skin, 4, 6); }
        }
        /** A flat cylinder (a disc with thickness) on axis `a`, centered at `c`. */
        disc(c, a, r, h, rgb, skin, sides = 12, bevel = 0.25) {
            const ax = norm(a), x = norm(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), y = cross(ax, x);
            // Its underside is hidden against what it sits on: only the top, a bevel and the side.
            const prof = [[r, -h / 2], [r, h / 2 - h * bevel], [r * (1 - bevel * 0.4), h / 2], [0, h / 2]];
            const us = Array.from({ length: sides }, (_, k) => k / sides), vs = prof.map((_, i) => i);
            this.patch(us, vs, (u, i) => { const [rr, hh] = prof[i], an = u * TAU; return add(c, add(mul(ax, hh), add(mul(x, Math.cos(an) * rr), mul(y, Math.sin(an) * rr)))); }, rgb, skin, { wrapU: true, away: sub(c, mul(ax, h * 1.5)) });
        }
        /** A hex bolt head standing on a surface: center, normal, size. */
        bolt(c, n, s, rgb, skin) { this.disc(add(c, mul(n, s * 0.35)), n, s, s * 0.7, rgb, skin, 6, 0.35); }
        part(name, extra) {
            return Object.assign({ name, positions: Float32Array.from(this.p), normals: Float32Array.from(this.n), colors: Float32Array.from(this.c), uvs: Float32Array.from(this.uv),
                joints: Uint8Array.from(this.j), weights: Float32Array.from(this.w), index: Uint32Array.from(this.i), keepColors: true }, extra);
        }
    }

    // ── materials: a mesh per finish, shared by every mod ─────────────────
    /** Meshes by finish: plating per style, trim per style, joints, light, glass, jewelry. */
    function kit() {
        const meshes = new Map(), info = new Map();
        const get = (key, make) => { if (!meshes.has(key)) { meshes.set(key, new Hard()); info.set(key, make()); } return meshes.get(key); };
        return {
            plating: m => get('plating:' + m.id + ':' + wearLevel(m.wear, m.id), () => ({ name: 'Cyber plating', metalness: m.metalness, roughness: m.roughness, texture: 'cyber-wear-' + wearLevel(m.wear, m.id) + '.png', kind: m.metalness > 0.5 ? 'metal' : 'prop' })),
            trim: m => get('trim:' + m.id + ':' + wearLevel(m.wear, m.id), () => ({ name: 'Cyber trim', metalness: m.trimMetalness, roughness: m.trimRoughness, texture: 'cyber-wear-' + wearLevel(m.wear, m.id) + '.png', kind: 'metal' })),
            joint: () => get('joint', () => ({ name: 'Cyber joints', metalness: 0.65, roughness: 0.42, kind: 'metal' })),
            rubber: () => get('rubber', () => ({ name: 'Cyber cables', metalness: 0, roughness: 0.75, kind: 'prop' })),
            light: (m) => get('light:' + m.glowHex + ':' + m.glowAmount.toFixed(2), () => ({ name: 'Cyber light', metalness: 0, roughness: 0.4, emissive: m.glowHex, emissiveIntensity: Math.max(0.05, m.glowAmount * 0.75), kind: 'prop', noShade: true })),
            glass: () => get('glass', () => ({ name: 'Cyber glass', metalness: 0.1, roughness: 0.06, opacity: 0.42, kind: 'glass', noShade: true })),
            membrane: m => get('membrane:' + m.glowHex, () => ({ name: 'Cyber membrane', metalness: 0, roughness: 0.3, emissive: m.glowHex, emissiveIntensity: 0.55 * Math.max(0.2, m.glowAmount), opacity: 0.5, doubleSided: true, kind: 'glass', noShade: true })),
            jewelry: (metal) => get('jewelry:' + metal.id, () => ({ name: 'Piercings', metalness: metal.metalness ?? 0.92, roughness: metal.roughness, kind: 'feature' })),
            face: m => get('face:' + m.id, () => ({ name: 'Face implants', metalness: m.trimMetalness, roughness: m.trimRoughness, kind: 'feature' })),
            parts() {
                const out = [];
                for (const [key, mesh] of meshes) if (!mesh.empty) {
                    const i = info.get(key);
                    // Lights carry their own color in the picture too (a tint by day), the glow over it; a membrane is fainter.
                    if (i.emissive) {
                        const g = linear(i.emissive), k = i.name === 'Cyber membrane' ? 0.5 : 0.85;
                        for (let q = 0; q < mesh.c.length; q += 3) { mesh.c[q] = g[0] * k + 0.03; mesh.c[q + 1] = g[1] * k + 0.03; mesh.c[q + 2] = g[2] * k + 0.03; }
                    }
                    out.push(mesh.part(i.name, { metalness: i.metalness, roughness: i.roughness, kind: i.kind, ...(i.texture ? { texture: i.texture } : {}), ...(i.emissive ? { emissive: i.emissive, emissiveIntensity: i.emissiveIntensity } : {}), ...(i.opacity ? { opacity: i.opacity } : {}), ...(i.doubleSided ? { doubleSided: true } : {}), ...(i.noShade ? { noShade: true } : {}), modPart: key }));
                }
                return out;
            }
        };
    }
    const WEAR_FACTOR = { sleek: 0.45, neon: 0.5, military: 1, salvaged: 1.25 };
    const wearLevel = (w, id) => Math.round(clamp(w * (WEAR_FACTOR[id] ?? 1), 0, 1) * 4);
    /**
     * The plating's picture (grey, multiplied with the pieces' colors): faint
     * machining, and with wear, scuffs, scratches to bare metal and grime;
     * `level` 0..4. 256 square, tiling.
     */
    function wearTexture(level) {
        const N = 256, data = new Uint8Array(N * N * 4), R = rng(4401 + level * 17), w = level / 4;
        const val = new Float32Array(N * N).fill(1);
        const tn = (x, y, f) => { // tiling value noise
            const X = x * f, Y = y * f, ix = Math.floor(X), iy = Math.floor(Y), fx = X - ix, fy = Y - iy;
            const h = (a, b) => { a = ((a % f) + f) % f; b = ((b % f) + f) % f; const s = Math.sin(a * 127.1 + b * 311.7 + level) * 43758.5453; return s - Math.floor(s); };
            const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
            return (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) + (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v;
        };
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const u = x / N, v = y / N;
            // Fine brushing along one direction, broad blotches of grime.
            const brush = tn(u, v * 0.05, 64) * 0.04 - 0.02;
            const grime = smooth(0.6, 0.95, tn(u, v, 4) * 0.75 + tn(u, v, 12) * 0.25) * w * 0.22;
            val[y * N + x] = 0.96 + brush - grime;
        }
        // Scratches: short straight strokes, bright.
        const count = Math.round(w * w * 140);
        for (let k = 0; k < count; k++) {
            let x = R() * N, y = R() * N;
            const a = (R() - 0.5) * 0.8 + (R() < 0.3 ? Math.PI / 2 : 0), L = 4 + R() * 26 * (0.5 + w), b = 0.12 + R() * 0.16;
            for (let s = 0; s < L; s++) {
                const px = ((Math.round(x) % N) + N) % N, py = ((Math.round(y) % N) + N) % N;
                val[py * N + px] = Math.min(1.35, val[py * N + px] + b * (1 - s / L * 0.5));
                x += Math.cos(a); y += Math.sin(a);
            }
        }
        for (let o = 0; o < N * N; o++) { const g = Math.round(clamp(val[o] / 1.35, 0, 1) * 255); data[o * 4] = data[o * 4 + 1] = data[o * 4 + 2] = g; data[o * 4 + 3] = 255; }
        return { width: N, height: N, data, name: 'cyber-wear-' + level + '.png' };
    }

    // ── limbs ─────────────────────────────────────────────────────────────
    const LIMB_DEF = {
        arm: { fam: 'arm', from: 1.12, bones: ['Arm', 'ForeArm', 'Hand'] },
        forearm: { fam: 'arm', from: 2.08, bones: ['ForeArm', 'Hand'] },
        hand: { fam: 'arm', from: 3.02, bones: ['Hand'] },
        leg: { fam: 'leg', from: 0.3, bones: ['UpLeg', 'Leg', 'Foot'] },
        shin: { fam: 'leg', from: 1.12, bones: ['Leg', 'Foot'] }
    };
    const limbOf = id => ({ def: LIMB_DEF[id.slice(0, -1)], side: id.slice(-1) === 'L' ? 1 : -1, prefix: id.slice(-1) === 'L' ? 'Left' : 'Right' });

    /** Pack vertices a replaced limb hides: its family's skin past the stump's place along it. */
    function hiddenSkin(pack, art, outfit) {
        const out = new Set();
        if (!art || !art.limbs || !art.limbs.length) return out;
        const an = Outfit.anatomy(pack), ids = pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)]);
        for (const l of art.limbs) {
            if (l.mode !== 'replace') continue;
            const { def, side } = limbOf(l.limb), f = def.fam === 'arm' ? (side > 0 ? 1 : 2) : (side > 0 ? 3 : 4);
            for (const v of ids) if (an.member[v * 5 + f] > 0.5 && an.s[v * 5 + f] > def.from) out.add(v);
        }
        return out;
    }
    /** Skin layers a mod brings: scarred, stitched skin round a replaced limb's stump, ports beside it. */
    function skinLayers(art) {
        const out = [];
        for (const l of (art && art.limbs) || []) {
            if (l.mode !== 'replace') continue;
            const kind = l.limb.slice(0, -1), side = l.limb.slice(-1) === 'L' ? 'left' : 'right';
            const region = { arm: 'upperArm', forearm: 'forearm', hand: 'forearm', leg: 'thigh', shin: 'calf' }[kind];
            const along = { arm: -0.98, forearm: -0.88, hand: 0.95, leg: -0.62, shin: -0.95 }[kind];
            out.push({ kind: 'scar', motif: 'socket', region, side, band: true, style: 'raised', size: 0.7, along, seed: 7 });
        }
        return out;
    }

    /**
     * One bone's stretch of skin measured round its own axis: radius by
     * place along (0..1 from the bone's head to its end) and angle, from the
     * shaped skin it carries. Frame: d along, f front, x the third axis.
     */
    function measure(pack, built, boneIdx, end, frontHint) {
        const P = built.shaped, head = built.bones[boneIdx].head, axis = sub(end, head), L = len(axis), d = norm(axis);
        let f = sub(frontHint, mul(d, dot(frontHint, d)));
        if (len(f) < 1e-4) f = cross(d, [1, 0, 0]);
        f = norm(f);
        const x = cross(d, f);
        const NT = 12, NA = 24, r = new Float32Array(NT * NA), cnt = new Float32Array(NT * NA);
        const ids = pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)]);
        for (const v of ids) {
            let w = 0;
            for (let k = 0; k < 4; k++) if (pack.skinJoints[v * 4 + k] === boneIdx) w += pack.skinWeights[v * 4 + k];
            if (w < 0.45) continue;
            const o = sub([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], head), t = dot(o, d) / L;
            if (t < -0.15 || t > 1.15) continue;
            const radial = sub(o, mul(d, t * L)), a = Math.atan2(dot(radial, x), dot(radial, f));
            const ti = clamp(Math.round(t * (NT - 1)), 0, NT - 1), ai = Math.floor((a + Math.PI) / TAU * NA) % NA;
            const rr = len(radial);
            r[ti * NA + ai] = Math.max(r[ti * NA + ai], rr); cnt[ti * NA + ai]++;
        }
        // Gaps filled round each ring, then from neighbor rings; a light smoothing.
        let mean = 0, mc = 0;
        for (let k = 0; k < r.length; k++) if (cnt[k]) { mean += r[k]; mc++; }
        mean = mc ? mean / mc : 0.03;
        for (let i = 0; i < NT; i++) {
            const has = []; for (let k = 0; k < NA; k++) if (cnt[i * NA + k]) has.push(k);
            if (!has.length) continue;
            for (let k = 0; k < NA; k++) if (!cnt[i * NA + k]) {
                let a = 1, b = 1;
                while (!cnt[i * NA + (k - a + NA) % NA]) a++;
                while (!cnt[i * NA + (k + b) % NA]) b++;
                r[i * NA + k] = (r[i * NA + (k - a + NA) % NA] * b + r[i * NA + (k + b) % NA] * a) / (a + b);
                cnt[i * NA + k] = 0.5;
            }
        }
        for (let i = 0; i < NT; i++) if (!cnt[i * NA]) {
            let a = i, b = i; while (a >= 0 && !cnt[a * NA]) a--; while (b < NT && !cnt[b * NA]) b++;
            const src = a >= 0 && (b >= NT || i - a <= b - i) ? a : b < NT ? b : -1;
            for (let k = 0; k < NA; k++) r[i * NA + k] = src >= 0 ? r[src * NA + k] : mean;
        }
        const sm = new Float32Array(r.length);
        for (let i = 0; i < NT; i++) for (let k = 0; k < NA; k++) {
            let acc = 0, w = 0;
            for (let di = -1; di <= 1; di++) for (let dk = -2; dk <= 2; dk++) { const ii = clamp(i + di, 0, NT - 1), kk = (k + dk + NA) % NA, ww = (di ? 0.6 : 1) * (dk ? 0.6 : 1); acc += r[ii * NA + kk] * ww; w += ww; }
            sm[i * NA + k] = acc / w;
        }
        const radius = (t, a) => {
            const ti = clamp(t, 0, 1) * (NT - 1), i = Math.min(NT - 2, Math.floor(ti)), u = ti - i;
            let ak = (a + Math.PI) / TAU * NA; ak = ((ak % NA) + NA) % NA;
            const k = Math.floor(ak), wv = ak - k, k1 = (k + 1) % NA;
            const r0 = sm[i * NA + k] * (1 - wv) + sm[i * NA + k1] * wv, r1 = sm[(i + 1) * NA + k] * (1 - wv) + sm[(i + 1) * NA + k1] * wv;
            return r0 * (1 - u) + r1 * u;
        };
        const at = (t, a, k = 1, lift = 0) => { const rr = radius(t, a) * k + lift; return add(add(head, mul(d, t * L)), add(mul(f, Math.cos(a) * rr), mul(x, Math.sin(a) * rr))); };
        return { head, end, L, d, f, x, radius, at, mean };
    }

    /**
     * Panels over a measured segment: each a curved plate following the
     * skin's section at `k` times its radius plus `lift`, its edges rolled
     * down (a bevel), with picture coordinates in meters for the wear
     * picture. `spec`: { t0, t1, a0, a1, lift, color, mesh }.
     */
    function panel(seg, spec, skin) {
        const { t0, t1, a0, a1 } = spec, k = spec.k ?? 1, lift = spec.lift ?? 0, bevel = spec.bevel ?? 0.0022;
        const spanA = (a1 - a0) * seg.mean, spanT = (t1 - t0) * seg.L;
        const cols = Math.max(2, Math.min(8, Math.round(spanA / 0.018))), rows = Math.max(1, Math.min(6, Math.round(spanT / 0.035)));
        // A row of the roll at each edge, the rest even.
        const param = n => { const out = [0, 0.07]; for (let q = 1; q < n; q++) out.push(0.07 + 0.86 * q / n); out.push(0.93, 1); return out; };
        const us = param(cols), vs = param(rows);
        const edgeA = Math.max(0.0001, 0.07 * 1.0001), edgeT = edgeA;
        spec.mesh.patch(us, vs, (u, v) => {
            const e = Math.min(smooth(0, 1, Math.min(u, 1 - u) / edgeA), smooth(0, 1, Math.min(v, 1 - v) / edgeT));
            const t = t0 + (t1 - t0) * v, a = a0 + (a1 - a0) * u;
            const swell = spec.swell ? spec.swell * Math.sin(Math.PI * u) * Math.sin(Math.PI * v) : 0;
            return seg.at(t, a, k, lift - bevel * (1 - e) + swell);
        }, spec.color, skin, { uv: (u, v) => [(a0 + (a1 - a0) * u) * seg.mean / 0.12, (t0 + (t1 - t0) * v) * seg.L / 0.12], away: (u, v) => add(seg.head, mul(seg.d, (t0 + (t1 - t0) * v) * seg.L)) });
    }
    /** The dark inner frame under the panels, visible through their gaps. */
    function core(seg, mesh, rgb, skin, t0 = 0, t1 = 1, k = 0.84) {
        const us = Array.from({ length: 10 }, (_, i) => i / 10), vs = Array.from({ length: 4 }, (_, i) => i / 3);
        mesh.patch(us, vs, (u, v) => seg.at(t0 + (t1 - t0) * v, -Math.PI + u * TAU, k), rgb, skin, { wrapU: true, uv: (u, v) => [u * 2, v], away: (u, v) => add(seg.head, mul(seg.d, (t0 + (t1 - t0) * v) * seg.L)) });
    }

    /** The style's panel layout for one long segment (upper arm, forearm, thigh, shin): the plates and their seams. */
    function segmentPanels(seg, m, K, skin, R, plated, outer) {
        const s = m.style.id, base = m.base, trim = m.trim;
        const gap = s === 'neon' ? 0.07 : s === 'sleek' ? 0.035 : 0.05;
        // Plated limbs cover the outer side only, standing off the skin.
        const lift0 = plated ? 0.0045 : 0.0006, span = plated ? [outer - 1.7, outer + 1.7] : [-Math.PI, Math.PI];
        const wear = (rgb, t, a) => { const w = Art.wearAt(m, [t * 3.1, a, s.length]); return mixRgb(mixRgb(rgb, [0.08, 0.07, 0.06], w.grime * 0.6), [0.42, 0.24, 0.12], w.rust * 0.8); };
        const plates = [];
        if (s === 'sleek') {
            // Two long shells front and back, meeting in soft seams at the sides; an inset trim plate outside.
            const split = [span[0], (span[0] + span[1]) / 2, span[1]];
            for (let q = 0; q < 2; q++) plates.push({ t0: 0.05, t1: 0.95, a0: split[q] + gap, a1: split[q + 1] - gap, color: base, mesh: K.plating(m), swell: 0.0012 });
            plates.push({ t0: 0.3, t1: 0.72, a0: outer - 0.32, a1: outer + 0.32, color: trim, mesh: K.trim(m), lift: 0.0018, bevel: 0.0012 });
        } else if (s === 'military') {
            // Rows of heavy plates, staggered, an armored strip on the outside.
            const rows = [0.04, 0.4, 0.7, 0.96], cols = 4;
            for (let r = 0; r + 1 < rows.length; r++) for (let c = 0; c < cols; c++) {
                const a0 = span[0] + (span[1] - span[0]) * c / cols + (r % 2) * 0.35, a1 = a0 + (span[1] - span[0]) / cols;
                plates.push({ t0: rows[r] + 0.012, t1: rows[r + 1] - 0.012, a0: a0 + gap, a1: a1 - gap, color: wear(base, r, c), mesh: K.plating(m), lift: 0.0008 * ((r + c) % 2), bevel: 0.0028 });
            }
            plates.push({ t0: 0.12, t1: 0.86, a0: outer - 0.38, a1: outer + 0.38, color: trim, mesh: K.trim(m), lift: 0.0042, bevel: 0.0025, swell: 0.0015 });
        } else if (s === 'salvaged') {
            // Mismatched scraps: some panels missing, each its own color, patched across.
            const rows = [0.03, 0.34 + R() * 0.1, 0.62 + R() * 0.1, 0.97], cols = 3;
            const tints = [base, trim, mixRgb(base, [0.3, 0.33, 0.25], 0.6), mixRgb(trim, [0.45, 0.22, 0.1], 0.5)];
            for (let r = 0; r + 1 < rows.length; r++) for (let c = 0; c < cols; c++) {
                if (!plated && R() < 0.16) continue;
                const a0 = span[0] + (span[1] - span[0]) * c / cols + (R() - 0.5) * 0.25, a1 = a0 + (span[1] - span[0]) / cols * (0.85 + R() * 0.3);
                plates.push({ t0: rows[r] + 0.015, t1: rows[r + 1] - 0.015 + (R() < 0.3 ? 0.06 : 0), a0: a0 + gap, a1: a1 - gap, color: wear(tints[Math.floor(R() * tints.length)], r, c), mesh: K.plating(m), lift: 0.0006 + R() * 0.0018, bevel: 0.0018 });
            }
            plates.push({ t0: 0.42, t1: 0.6, a0: outer - 0.5, a1: outer + 0.35, color: trim, mesh: K.trim(m), lift: 0.0035, bevel: 0.0012 });
        } else {
            // High-tech: dark glossy plates, wide light-filled seams, a clear panel over a lit core on the outside.
            const rows = [0.04, 0.5, 0.96], cols = 3;
            for (let r = 0; r + 1 < rows.length; r++) for (let c = 0; c < cols; c++) {
                const a0 = span[0] + (span[1] - span[0]) * c / cols, a1 = a0 + (span[1] - span[0]) / cols;
                if (!plated && r === 0 && c === 1) continue;
                plates.push({ t0: rows[r] + 0.02, t1: rows[r + 1] - 0.02, a0: a0 + gap, a1: a1 - gap, color: base, mesh: K.plating(m), swell: 0.001 });
            }
            plates.push({ t0: 0.08, t1: 0.46, a0: span[0] + (span[1] - span[0]) / 3 + gap, a1: span[0] + (span[1] - span[0]) * 2 / 3 - gap, color: [1, 1, 1], mesh: K.glass(), lift: 0.0008, bevel: 0.001 });
        }
        for (const p of plates) panel(seg, Object.assign({ lift: lift0 + (p.lift || 0) }, p, { lift: lift0 + (p.lift || 0) }), skin);
        // Lights in the seams.
        if (m.glowAmount > 0.02 && (s === 'neon' || s === 'sleek' || m.style.glowAmount > 0.3)) {
            const glow = K.light(m), strips = s === 'neon' ? 6 : 2;
            for (let q = 0; q < strips; q++) {
                const a = s === 'neon' ? span[0] + (span[1] - span[0]) * (q % 3) / 3 : outer + (q ? 0.85 : -0.85), tA = s === 'neon' ? (q < 3 ? 0.06 : 0.52) : 0.12, tB = s === 'neon' ? (q < 3 ? 0.48 : 0.94) : 0.88;
                const pts = Array.from({ length: 8 }, (_, i) => seg.at(tA + (tB - tA) * i / 7, a, 1, lift0 - 0.0008));
                glow.tube(pts, s === 'neon' ? 0.0018 : 0.0012, 5, [1, 1, 1], skin);
            }
            if (s === 'neon') {
                // The lit core under the clear panel: a lattice of light.
                for (let q = 0; q < 3; q++) { const a = span[0] + (span[1] - span[0]) * (0.38 + q * 0.12); glow.tube(Array.from({ length: 6 }, (_, i) => seg.at(0.1 + 0.34 * i / 5, a, 1, lift0 - 0.0035)), 0.0011, 4, [1, 1, 1], skin); }
            }
        }
        // Bolts and rivets.
        if (s === 'military' || s === 'salvaged') {
            const tj = K.trim(m), n = s === 'military' ? 10 : 8;
            for (let q = 0; q < n; q++) {
                const t = s === 'military' ? [0.07, 0.37, 0.43, 0.67, 0.73, 0.93][q % 6] : 0.1 + R() * 0.8, a = span[0] + (span[1] - span[0]) * ((q * 0.37 + (s === 'salvaged' ? R() : 0)) % 1);
                const p = seg.at(t, a, 1, lift0 + 0.0012), nrm = norm(sub(p, seg.at(t, a, 0.5)));
                tj.bolt(p, nrm, s === 'military' ? 0.0028 : 0.0022, mixRgb(trim, [0.6, 0.6, 0.62], 0.3), skin);
            }
        }
    }

    /** A ball joint, hinge caps either side, and (for military) a piston across it. */
    function jointPieces(K, m, center, axis, r, upperSkin, lowerSkin, o = {}) {
        K.joint().sphere(center, r, m.joint, lowerSkin, 6, 12);
        const caps = K.trim(m);
        for (const sgn of [1, -1]) caps.disc(add(center, mul(axis, sgn * r * 0.92)), axis, r * 0.62, r * 0.35, m.trim, upperSkin, 12);
        if (m.glowAmount > 0.02 && m.style.id !== 'military') for (const sgn of [1, -1]) K.light(m).disc(add(center, mul(axis, sgn * r * 1.1)), axis, r * 0.3, r * 0.08, [1, 1, 1], upperSkin, 10);
        if (o.piston) {
            const { from, to } = o.piston;
            K.joint().tube([from, lerp(from, to, 0.55)], 0.0045, 8, m.joint, upperSkin);
            K.trim(m).tube([lerp(from, to, 0.4), to], 0.0028, 8, mixRgb(m.trim, [0.75, 0.76, 0.78], 0.6), lowerSkin);
        }
    }

    /** A collar at a stump: a thick ring with bolts, seating the limb in the skin. */
    function collar(K, m, seg, t, skin, plated) {
        const tr = K.trim(m), pl = K.plating(m);
        panel(seg, { t0: t - 0.02, t1: t + 0.13, a0: -Math.PI, a1: Math.PI, k: 1.06, lift: 0.0015, color: m.trim, mesh: tr, bevel: 0.002 }, skin);
        panel(seg, { t0: t + 0.03, t1: t + 0.09, a0: -Math.PI, a1: Math.PI, k: 1.06, lift: 0.0042, color: mixRgb(m.base, m.joint, 0.3), mesh: pl, bevel: 0.0014 }, skin);
        for (let q = 0; q < 8; q++) { const a = -Math.PI + q / 8 * TAU, p = seg.at(t + 0.06, a, 1.06, 0.0045), n = norm(sub(p, seg.at(t + 0.06, a, 0.5))); tr.bolt(p, n, 0.0024, mixRgb(m.trim, [0.7, 0.7, 0.72], 0.4), skin); }
        if (m.glowAmount > 0.02 && !plated) {
            const pts = Array.from({ length: 25 }, (_, q) => seg.at(t + 0.115, -Math.PI + q / 24 * TAU, 1.06, 0.0018));
            K.light(m).tube(pts, 0.0011, 4, [1, 1, 1], skin, { caps: false });
        }
    }

    /** A finger (three bones) or a thumb: jointed segments, a knuckle at each joint, a rounded tip. */
    function finger(K, m, pack, built, names, plated) {
        const idx = names.map(n => built.bones.findIndex(b => b.name === n));
        if (idx.some(i => i < 0)) return;
        for (let k = 0; k < 3; k++) {
            const b = built.bones[idx[k]], end = k < 2 ? built.bones[idx[k + 1]].head : b.tail;
            const dir = norm(sub(end, b.head)), L = len(sub(end, b.head));
            // Its thickness from the skin it carries.
            const seg = measure(pack, built, idx[k], end, [0, 1, 0]);
            const r = clamp(seg.mean * (plated ? 1.08 : 0.92), 0.0045, 0.012), skin = rigid(idx[k]);
            if (plated) {
                // A plate over the finger's back only.
                panel(seg, { t0: 0.15, t1: 0.88, a0: -1.4, a1: 1.4, k: 1, lift: 0.0018, color: m.base, mesh: K.plating(m), bevel: 0.0012 }, skin);
                continue;
            }
            // A rounded segment (domed at both ends), a dark knuckle band under the joint, a plate along its back.
            const a = add(b.head, mul(dir, r * 0.35)), e = add(end, mul(dir, k === 2 ? -r * 0.15 : -r * 0.3));
            const ring = Array.from({ length: 5 }, (_, i) => lerp(a, e, i / 4));
            K.plating(m).tube(ring, t => r * (1 - 0.1 * t) * (0.86 + 0.14 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85))), 8, m.base, skin, { squash: 1.1, caps: false });
            K.plating(m).sphere(e, r * 0.9 * (k === 2 ? 0.95 : 0.9), m.base, skin, 3, 8, [1.1, 1, 1.1]);
            K.joint().sphere(b.head, r * 0.92, m.joint, skin, 3, 8);
            const up = norm(sub([0, 1, 0], mul(dir, dot([0, 1, 0], dir))));
            K.trim(m).tube([add(lerp(a, e, 0.15), mul(up, r * 0.86)), add(lerp(a, e, 0.85), mul(up, r * 0.8))], r * 0.32, 6, m.trim, skin, { squash: 1.8 });
        }
    }

    /** One cyber limb: its segments' shells, joints, hand or foot, collar. */
    function cyberLimb(K, pack, built, r, l, outfit, R) {
        const { def, side, prefix } = limbOf(l.limb), m = Art.cyberMaterial(l.style, l), plated = l.mode === 'plate';
        const B = name => built.bones.findIndex(b => b.name === prefix + name);
        const arm = def.fam === 'arm';
        const covered = slot => r.outfit.some(i => { const g = root.RRCharacterWardrobe && root.RRCharacterWardrobe.BY_ID ? root.RRCharacterWardrobe.BY_ID.get(i.id) : null; return g && g.slot === slot && i.id !== 'fingerlessGloves'; });
        const hiddenShare = (boneIdx) => {
            // How much of a bone's skin the clothes cover (a sleeve over the upper arm hides its shell anyway).
            let a = 0, h = 0;
            for (const v of pack._bodyIds) { let w = 0; for (let k = 0; k < 4; k++) if (pack.skinJoints[v * 4 + k] === boneIdx) w += pack.skinWeights[v * 4 + k]; if (w < 0.5) continue; a++; if (outfit && outfit.hidden.has(v)) h++; }
            return a ? h / a : 0;
        };
        const front = [0, 0, 1];
        const chain = arm ? ['Arm', 'ForeArm', 'Hand'] : ['UpLeg', 'Leg', 'Foot'];
        const ends = arm ? [B('ForeArm'), B('Hand'), B('HandMiddle1')] : [B('Leg'), B('Foot'), B('ToeBase')];
        const segs = {};
        chain.forEach((name, k) => { const bi = B(name); if (bi >= 0 && ends[k] >= 0) segs[name] = { bi, seg: measure(pack, built, bi, built.bones[ends[k]].head, arm ? norm([side * 0.2, 0.3, 1]) : front) }; });
        const on = new Set(def.bones);
        // The way the limb's outer side faces, per segment: away from the body (and forward for a leg).
        const outerOf = seg => { const want = arm ? [side, 0.25, 0.4] : [side * 0.6, 0, 1]; return Math.atan2(dot(want, seg.x), dot(want, seg.f)); };
        for (const name of chain) {
            if (!on.has(name) || !segs[name]) continue;
            const { bi, seg } = segs[name], skin = rigid(bi), outer = outerOf(seg);
            const isHand = name === 'Hand' || name === 'Foot';
            if (isHand && covered(arm ? 'hands' : 'feet')) continue;
            if (!isHand && hiddenShare(bi) > 0.85) continue;
            const first = def.bones[0] === name;
            if (isHand) { (arm ? hand : foot)(K, m, pack, built, seg, bi, prefix, plated, R); continue; }
            // The stump's end of a replaced segment starts inside its collar.
            const t0 = first && !plated ? (arm && name === 'Arm' ? 0.12 : name === 'UpLeg' ? 0.32 : 0.1) : 0.04;
            const sub0 = { ...seg, at: (t, a, k, lift) => seg.at(t0 + (1 - t0) * t, a, k, lift), L: seg.L * (1 - t0) };
            if (!plated) core(seg, K.joint(), m.joint, skin, t0, 0.98, 0.82);
            segmentPanels(sub0, m, K, skin, R, plated, outer);
            if (first && !plated) collar(K, m, seg, t0 - 0.06, skin, plated);
            // The joint at the segment's lower end, carried by the bone below.
            const below = chain[chain.indexOf(name) + 1];
            if (below && segs[below]) {
                const lower = segs[below], jr = Math.min(seg.radius(1, 0), lower.seg.radius(0, 0)) * (plated ? 0.55 : 0.82);
                const hinge = norm(arm ? cross(seg.d, lower.seg.d).map((c, i) => c || [0, 0, 1][i] * 1e-3) : seg.x);
                const axis = len(cross(seg.d, lower.seg.d)) > 0.05 ? norm(cross(seg.d, lower.seg.d)) : seg.x;
                void hinge;
                if (!plated) jointPieces(K, m, lower.seg.head, axis, jr, skin, rigid(lower.bi), m.style.id === 'military' ? { piston: { from: seg.at(0.62, outer + Math.PI, 1, 0.006), to: lower.seg.at(0.3, outerOf(lower.seg) + Math.PI, 1, 0.006) } } : {});
                else K.trim(m).disc(add(lower.seg.head, mul(axis, jr * 1.4 * (dot(axis, seg.x) > 0 ? 1 : -1))), axis, jr * 0.8, jr * 0.3, m.trim, rigid(lower.bi), 12);
                // A cap over the elbow's point or the knee.
                const capSeg = lower.seg, capA = arm ? outerOf(capSeg) + Math.PI * 0.9 : outerOf(capSeg) - (side > 0 ? 0.35 : -0.35);
                panel(capSeg, { t0: -0.02, t1: 0.16, a0: capA - 0.9, a1: capA + 0.9, k: plated ? 1 : 1.05, lift: plated ? 0.006 : 0.003, color: m.trim, mesh: K.trim(m), bevel: 0.002, swell: 0.003 }, rigid(lower.bi));
            }
            // Salvaged: cables down the segment, and a wrap of cable across the joint below (bending with it).
            if (m.style.id === 'salvaged' && !plated) {
                const cab = K.rubber(), nb = below && segs[below] ? segs[below] : null;
                for (let q = 0; q < 2; q++) {
                    const a = outer + Math.PI * (0.55 + q * 0.4);
                    const pts = Array.from({ length: 9 }, (_, i) => seg.at(0.15 + 0.8 * i / 8, a + Math.sin(i * 0.8) * 0.15, 1, 0.004 + q * 0.002));
                    if (nb) pts.push(nb.seg.at(0.1, a, 1, 0.004), nb.seg.at(0.3, a + 0.2, 1, 0.003));
                    const skinAt = p => { if (!nb) return skin; const tt = clamp(dot(sub(p, nb.seg.head), seg.d) / 0.04 + 0.5, 0, 1); return { joints: [bi, nb.bi, 0, 0], weights: [1 - tt, tt, 0, 0] }; };
                    cab.tube(pts, 0.0028 - q * 0.0006, 6, q ? [0.12, 0.11, 0.1] : [0.35, 0.08, 0.06], skinAt);
                }
            }
        }
    }

    /** A mechanical hand: a plated palm, a rubber pad, jointed fingers and thumb. */
    function hand(K, m, pack, built, seg, bi, prefix, plated, R) {
        const skin = rigid(bi);
        // The back of the hand faces up in the rest pose.
        const up = Math.atan2(dot([0, 1, 0], seg.x), dot([0, 1, 0], seg.f));
        if (!plated) {
            panel(seg, { t0: 0.02, t1: 0.96, a0: up - 1.45, a1: up + 1.45, k: 1, lift: 0.001, color: m.base, mesh: K.plating(m), bevel: 0.002, swell: 0.0015 }, skin);
            panel(seg, { t0: 0.04, t1: 0.94, a0: up + 1.5, a1: up + TAU - 1.5, k: 0.98, lift: 0, color: m.joint, mesh: K.joint(), bevel: 0.0015 }, skin);
            K.joint().sphere(seg.head, seg.radius(0, up) * 0.75, m.joint, skin, 5, 10, [1.2, 0.8, 1.2]);
            if (m.glowAmount > 0.02) K.light(m).tube(Array.from({ length: 6 }, (_, i) => seg.at(0.2 + i * 0.12, up, 1, 0.0022)), 0.001, 4, [1, 1, 1], skin);
        } else panel(seg, { t0: 0.1, t1: 0.9, a0: up - 1.1, a1: up + 1.1, k: 1, lift: 0.003, color: m.base, mesh: K.plating(m), bevel: 0.0018, swell: 0.0012 }, skin);
        for (const f of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) finger(K, m, pack, built, [1, 2, 3].map(k => prefix + 'Hand' + f + k), plated);
    }
    /** A mechanical foot: a shell over the instep, a sole, a toe block. */
    function foot(K, m, pack, built, seg, bi, prefix, plated) {
        const skin = rigid(bi), up = Math.atan2(dot([0, 1, 0], seg.x), dot([0, 1, 0], seg.f));
        panel(seg, { t0: -0.25, t1: 1.0, a0: up - 1.7, a1: up + 1.7, k: 1, lift: plated ? 0.004 : 0.0012, color: m.base, mesh: K.plating(m), bevel: 0.0022 }, skin);
        if (!plated) panel(seg, { t0: -0.3, t1: 1.02, a0: up + 1.75, a1: up + TAU - 1.75, k: 1.02, lift: 0.001, color: m.joint, mesh: K.joint(), bevel: 0.0015 }, skin);
        const toe = built.bones.findIndex(b => b.name === prefix + 'ToeBase');
        if (toe >= 0 && !plated) {
            const tb = built.bones[toe], tseg = measure(pack, built, toe, add(tb.tail, mul(norm(sub(tb.tail, tb.head)), 0.02)), [0, 1, 0]);
            panel(tseg, { t0: -0.1, t1: 1.0, a0: -Math.PI, a1: Math.PI, k: 1, lift: 0.001, color: m.trim, mesh: K.trim(m), bevel: 0.002 }, rigid(toe));
        }
    }

    // ── face: piercings, eye, studs, plates ───────────────────────────────
    /**
     * Places on the face, found once on the average body as skin vertices
     * (one side, the left at +x; the right mirrors it): earlobe, helix,
     * tragus, nostril, septum, brow, lip, labret, bridge.
     */
    function faceSpots(pack) {
        if (pack._artSpots) return pack._artSpots;
        const an = Outfit.anatomy(pack), R = an.rest, B = Body(), N = B.vertexNormals(pack, R), ids = pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)]);
        const Skin = root.RRCharacterSkin || require('./CharacterSkin.js'), F = Skin.fieldsOf(pack), M = F.marks;
        const ears = B.earMask(pack);
        const head = ids.filter(v => an.member[v * 5] > 0.6 && an.s[v * 5] > 4.3);
        const at = v => [R[v * 3], R[v * 3 + 1], R[v * 3 + 2]];
        const nearest = (p, list, filter) => { let b = -1, bd = Infinity; for (const v of list) { if (filter && !filter(v)) continue; const d = (R[v * 3] - p[0]) ** 2 + (R[v * 3 + 1] - p[1]) ** 2 + (R[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; b = v; } } return b; };
        const earL = head.filter(v => ears[v] > 0.5 && R[v * 3] > 0);
        let low = earL[0], top = earL[0], fwd = earL[0];
        for (const v of earL) { if (R[v * 3 + 1] < R[low * 3 + 1]) low = v; if (R[v * 3 + 1] > R[top * 3 + 1]) top = v; if (R[v * 3 + 2] > R[fwd * 3 + 2]) fwd = v; }
        const earOut = (p, dy) => nearest(add(p, [0.004, dy, 0]), earL, v => N[v * 3] > 0.3);
        const lobe = earOut(at(low), 0.007);
        const topP = at(top);
        const helix = nearest(add(topP, [0.004, -0.006, -0.008]), earL);
        // The forward helix: the ear's own most forward rim near its top (where the rim curls into the head).
        let helixFront = helix;
        for (const v of earL) if (ears[v] > 0.85 && R[v * 3 + 1] > topP[1] - 0.012 && R[v * 3 + 2] > R[helixFront * 3 + 2]) helixFront = v;
        const tragus = nearest(add(at(fwd), [0, -0.016, -0.004]), earL, v => N[v * 3 + 2] > 0);
        const tipIds = head.filter(v => F.noseTip[v] > 0.3);
        let tipLow = tipIds[0], wing = tipIds[0];
        for (const v of tipIds) { if (Math.abs(R[v * 3]) < 0.004 && R[v * 3 + 1] < R[tipLow * 3 + 1]) tipLow = v; if (R[v * 3] > R[wing * 3]) wing = v; }
        const nostril = nearest(add(at(wing), [-0.001, 0.003, 0.004]), head, v => R[v * 3] > 0 && N[v * 3] > 0.2);
        const septum = nearest(add(at(tipLow), [0, 0.001, -0.007]), head);
        const brow = nearest([M.eye[0] + M.eyeR * 0.75, M.eye[1] + M.eyeR * 1.45, M.eye[2] + M.eyeR * 0.6], head, v => N[v * 3 + 2] > 0.3 && F.lids[v] < 0.2);
        const lowerLip = head.filter(v => F.lips[v] > 0.4 && R[v * 3 + 1] < M.mouth[1] - 0.003);
        const lip = nearest([M.corner * 0.55, M.mouth[1] - 0.007, M.mouth[2] + 0.01], lowerLip.length ? lowerLip : head, v => N[v * 3 + 2] > 0.4);
        const labret = nearest([0, M.mouth[1] - 0.019, M.mouth[2] + 0.02], head, v => N[v * 3 + 2] > 0.5 && F.lips[v] < 0.15);
        const bridge = nearest([0.007, M.eye[1] + 0.002, M.eye[2] + 0.03], head, v => N[v * 3 + 2] > 0.2 && R[v * 3] > 0);
        return (pack._artSpots = { lobe, helix, helixFront, tragus, nostril, septum, brow, lip, labret, bridge, marks: M, head });
    }
    /** A spot on the shaped body for a side: position and normal (the right mirrors the left's vertex by position). */
    function spotAt(pack, built, Ns, v, side, mirrorCache) {
        let q = v;
        if (side < 0) {
            const key = 'm' + v;
            if (!mirrorCache.has(key)) {
                const R = Outfit.anatomy(pack).rest, ids = faceSpots(pack).head;
                let b = v, bd = Infinity;
                for (const u of ids) { const d = (R[u * 3] + R[v * 3]) ** 2 + (R[u * 3 + 1] - R[v * 3 + 1]) ** 2 + (R[u * 3 + 2] - R[v * 3 + 2]) ** 2; if (d < bd) { bd = d; b = u; } }
                mirrorCache.set(key, b);
            }
            q = mirrorCache.get(key);
        }
        const P = built.shaped;
        return { p: [P[q * 3], P[q * 3 + 1], P[q * 3 + 2]], n: [Ns[q * 3], Ns[q * 3 + 1], Ns[q * 3 + 2]], v: q };
    }

    function piercings(K, pack, built, art, L, mirror) {
        if (!art.piercings.length) return;
        const S = faceSpots(pack), Ns = Body().vertexNormals(pack, built.shaped), head = rigid(L.boneIndex('Head'));
        for (const pc of art.piercings) {
            const metal = Art.METALS.find(m => m.id === pc.metal) || Art.METALS[0], mesh = K.jewelry(metal), rgb = linear(metal.color);
            const sides = pc.side === 'both' ? [1, -1] : pc.side === 'right' ? [-1] : [1];
            for (const sd of sides) {
                const spot = v => spotAt(pack, built, Ns, v, sd, mirror);
                const style = pc.style;
                const ball = (c, r) => mesh.sphere(c, r, rgb, head, 4, 8);
                const ring = (c, axis, R, r) => mesh.torus(c, axis, R, r, rgb, head, 18, 6);
                const stud = (s, r) => { if (style === 'spike') { mesh.tube([add(s.p, mul(s.n, 0.0005)), add(s.p, mul(s.n, r * 2.8))], t => r * (1 - t * 0.95), 8, rgb, head); } else ball(add(s.p, mul(s.n, r * 0.6)), r); };
                switch (pc.spot) {
                    case 'lobe': case 'helix': case 'tragus': {
                        const s = spot(S[pc.spot]), out = norm([sd, 0, 0.15]);
                        if (style === 'ring') {
                            const down = pc.spot === 'helix' ? norm([sd * 0.25, 0.35, -1]) : [0, -1, 0];
                            const R = pc.spot === 'lobe' ? 0.0062 : 0.0056;
                            ring(add(s.p, add(mul(down, R * (pc.spot === 'helix' ? 0.9 : 0.78)), mul(out, -0.0008))), norm(cross(down, out)), R, 0.00075);
                        } else stud(s, pc.spot === 'tragus' ? 0.0015 : 0.002);
                        break;
                    }
                    case 'industrial': {
                        const a = spot(S.helix), b = spot(S.helixFront), out = norm([sd, 0.1, 0]);
                        const pa = add(a.p, mul(out, 0.0012)), pb = add(b.p, mul(out, 0.0012));
                        mesh.tube([sub(pa, mul(norm(sub(pb, pa)), 0.003)), add(pb, mul(norm(sub(pb, pa)), 0.003))], 0.0007, 6, rgb, head);
                        ball(sub(pa, mul(norm(sub(pb, pa)), 0.004)), 0.0017); ball(add(pb, mul(norm(sub(pb, pa)), 0.004)), 0.0017);
                        break;
                    }
                    case 'nostril': {
                        const s = spot(S.nostril);
                        // A hoop through the wing, hugging the nostril's rim.
                        if (style === 'ring') { const Rr = 0.0034; ring(add(add(s.p, [0, -Rr * 0.72, 0]), mul(s.n, -Rr * 0.3)), norm(cross(s.n, [0, -1, 0])), Rr, 0.00055); }
                        else stud(s, 0.0013);
                        break;
                    }
                    case 'septum': {
                        const s = spot(S.septum);
                        if (style === 'stud') ball(add(s.p, [0, -0.002, 0.002]), 0.0016);
                        // Through the septum side to side, hanging below the nose: seen from the front, a horseshoe.
                        else ring(add(s.p, [0, -0.0038, 0.0016]), norm([0, 0.3, 1]), 0.0048, 0.0008);
                        break;
                    }
                    case 'eyebrow': {
                        const s = spot(S.brow), up = norm(sub([0, 1, 0.1], mul(s.n, dot([0, 1, 0.1], s.n))));
                        if (style === 'ring') ring(add(add(s.p, mul(up, 0.004)), mul(s.n, -0.0015)), norm(cross(up, s.n)), 0.0055, 0.0007);
                        else { ball(add(add(s.p, mul(up, 0.0055)), mul(s.n, 0.0012)), 0.0019); ball(add(add(s.p, mul(up, -0.0045)), mul(s.n, 0.0012)), 0.0019); }
                        break;
                    }
                    case 'lip': {
                        const s = spot(S.lip);
                        if (style === 'stud' || style === 'spike') stud(s, 0.0016);
                        // Hugging the lip's edge, turned a little toward the mouth's corner so it reads from the front.
                        else ring(add(s.p, [sd * 0.0008, -0.0016, -0.0028]), norm([1, 0, 0.75 * sd]), 0.0058, 0.0008);
                        break;
                    }
                    case 'labret': stud(spot(S.labret), 0.0019); break;
                    case 'bridge': {
                        const a = spot(S.bridge), b = spotAt(pack, built, Ns, S.bridge, -1, mirror);
                        // The bar runs under the skin of the bridge: its two balls show.
                        ball(add(a.p, mul(a.n, 0.0012)), 0.0019); ball(add(b.p, mul(b.n, 0.0012)), 0.0019);
                        break;
                    }
                }
            }
        }
    }

    /** The cybernetic eye: a dark shell over the eyeball with a mechanical iris (or an optic cluster, or a scanner bar), and a ring set in the orbit. */
    function cyberEye(K, pack, built, art, L) {
        const e = art.eye;
        if (e.side === 'none') return;
        const eye = e.side === 'left' ? L.eyeL : L.eyeR, sd = e.side === 'left' ? 1 : -1;
        if (!eye || !eye.radius) return;
        const m = Art.cyberMaterial(e.cyber, { glow: e.glow }), head = rigid(L.boneIndex('Head'));
        // The eye mesh is the ball's front only: its sphere sits back from the mean by its depth. The front of the cornea, and a ball behind it.
        const ballVerts = built.parts.find(p => p.name === 'Eyes');
        let front0 = -Infinity;
        if (ballVerts) for (let i = 0; i < ballVerts.positions.length; i += 3) if ((ballVerts.positions[i] > 0) === (sd > 0)) front0 = Math.max(front0, ballVerts.positions[i + 2]);
        const r = eye.radius * 0.84, c = [eye.center[0], eye.center[1], (isFinite(front0) ? front0 : eye.center[2] + eye.radius * 0.6) - r * 1.0];
        const fwd = [0, 0, 1], x = [1, 0, 0], y = [0, 1, 0];
        const on = (a, b, rr = r * 1.012) => { const p = [Math.sin(a) * Math.cos(b), Math.sin(b), Math.cos(a) * Math.cos(b)]; return add(c, mul(p, rr)); };
        // The shell: the front of the ball in dark metal, finely ringed.
        const shell = K.joint();
        shell.patch(Array.from({ length: 17 }, (_, i) => i / 16), Array.from({ length: 11 }, (_, i) => i / 10), (u, v) => {
            const a = (u - 0.5) * 2.0, b = (v - 0.5) * 1.35; return on(a, b, r * 1.03);
        }, (u, v, p) => { const d = len(sub(p, add(c, mul(fwd, r)))) / r; return mixRgb(m.joint, m.trim, 0.25 + 0.2 * Math.sin(d * 30) * 0.5); }, head, { normal: p => norm(sub(p, c)) });
        const front = add(c, mul(fwd, r * 1.035)), glow = K.light(m), trim = K.trim(m);
        // A point on the front of the ball, `px`, `py` across it (in ball radii), lifted off it by `lift`.
        const onFront = (px, py, lift = 0) => { const z = Math.sqrt(Math.max(0, 1 - px * px - py * py)); return add(c, mul(norm([px, py, z]), r * (1.035 + lift))); };
        const flat = (pts, lift, rgb, mesh) => { const ids = pts.map(([px, py]) => mesh.v(onFront(px, py, lift), norm(sub(onFront(px, py, lift), c)), rgb, head)); for (let k = 1; k + 1 < ids.length; k++) mesh.tri(ids[0], ids[k], ids[k + 1]); };
        if (e.style === 'lens') {
            // An aperture: eight blades overlapping in a pinwheel round a lit pupil, a bezel round them.
            const R0 = 0.5, R1 = 0.17;
            for (let k = 0; k < 8; k++) {
                const a = k / 8 * TAU, pts = [];
                for (let q = 0; q <= 4; q++) { const t = q / 4, ang = a + t * 0.95; pts.push([Math.cos(ang) * R0, Math.sin(ang) * R0]); }
                pts.push([Math.cos(a + 1.35) * R1, Math.sin(a + 1.35) * R1], [Math.cos(a + 0.55) * R1, Math.sin(a + 0.55) * R1]);
                flat(pts.map(([px, py]) => [px * sd, py]), 0.012 + k * 0.002, mixRgb(m.trim, m.joint, k % 2 ? 0.55 : 0.3), k % 2 ? K.joint() : trim);
            }
            flat(Array.from({ length: 16 }, (_, k) => [Math.cos(k / 16 * TAU) * R1 * 1.05, Math.sin(k / 16 * TAU) * R1 * 1.05]), 0.028, m.joint, K.joint());
            flat(Array.from({ length: 16 }, (_, k) => [Math.cos(k / 16 * TAU) * R1 * 0.55, Math.sin(k / 16 * TAU) * R1 * 0.55]), 0.034, [1, 1, 1], glow);
            const ring = Array.from({ length: 33 }, (_, k) => onFront(Math.cos(k / 32 * TAU) * 0.56, Math.sin(k / 32 * TAU) * 0.56, 0.02));
            trim.tube(ring, r * 0.055, 6, m.trim, head, { caps: false });
            K.light(m).tube(Array.from({ length: 33 }, (_, k) => onFront(Math.cos(k / 32 * TAU) * 0.66, Math.sin(k / 32 * TAU) * 0.66, 0.005)), r * 0.02, 4, [1, 1, 1], head, { caps: false });
        } else if (e.style === 'optic') {
            // Three lenses in a triangle, the largest lit.
            for (const [ox, oy, rr, lit] of [[0, 0.12, 0.3, true], [-0.3 * sd, -0.2, 0.18, false], [0.28 * sd, -0.24, 0.14, false]]) {
                const p = onFront(ox, oy, 0.02);
                trim.disc(p, fwd, rr * r * 1.25, r * 0.12, m.trim, head, 16);
                (lit ? glow : K.glass()).disc(add(p, mul(fwd, r * 0.05)), fwd, rr * r, r * 0.06, lit ? [1, 1, 1] : [0.6, 0.8, 0.9], head, 16);
            }
        } else {
            // A scanner: a lit slot across the eye in a raised visor bar.
            trim.patch(Array.from({ length: 13 }, (_, i) => i / 12), [0, 0.5, 1], (u, v) => on((u - 0.5) * 1.8, (v - 0.5) * 0.5, r * 1.06), m.trim, head, { normal: p => norm(sub(p, c)) });
            glow.patch(Array.from({ length: 13 }, (_, i) => i / 12), [0, 1], (u, v) => on((u - 0.5) * 1.6, (v - 0.5) * 0.14, r * 1.075), [1, 1, 1], head, { normal: p => norm(sub(p, c)) });
        }
        // The orbit ring: a plate seated round the socket, open toward the nose, bolted.
        const ringC = add(c, mul(fwd, r * 0.7)), ringR = eye.radius * 1.12;
        trim.torus(ringC, norm([sd * 0.18, 0.05, 1]), ringR, r * 0.08, m.trim, head, 28, 6, Math.PI * 1.1, Math.PI * (0.5 + 0.25 * sd - 0.55));
        for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k - 1) * 0.55 + (sd > 0 ? 0.35 : -0.35); trim.bolt(add(ringC, add(mul(x, Math.cos(a) * ringR), mul(y, Math.sin(a) * ringR))), fwd, r * 0.08, mixRgb(m.trim, [0.8, 0.8, 0.82], 0.3), head); }
    }

    /** Face implant studs in a row and seated plates, on the shaped skin. */
    function faceImplants(K, pack, built, art, L, mirror) {
        const f = art.face;
        if (f.studs === 'none' && f.plate === 'none') return;
        const S = faceSpots(pack), M = S.marks, R = Outfit.anatomy(pack).rest, Ns = Body().vertexNormals(pack, built.shaped), head = rigid(L.boneIndex('Head'));
        const m = Art.cyberMaterial(f.style, { glow: f.glow }), mesh = K.face(m);
        const sides = f.side === 'both' ? [1, -1] : f.side === 'right' ? [-1] : [1];
        const near = p => { let b = -1, bd = Infinity; for (const v of S.head) { if (R[v * 3] <= 0) continue; const d = (R[v * 3] - p[0]) ** 2 + (R[v * 3 + 1] - p[1]) ** 2 + (R[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; b = v; } } return b; };
        const E = M.eye, ER = M.eyeR;
        const lines = {
            temple: Array.from({ length: 4 }, (_, k) => [E[0] + ER * (1.9 + k * 0.05), E[1] + ER * (1.6 - k * 0.75), E[2] - ER * (0.9 + k * 0.15)]),
            brow: Array.from({ length: 4 }, (_, k) => [E[0] + ER * (-0.3 + k * 0.6), E[1] + ER * (1.9 - k * 0.1), E[2] + ER * (0.6 - k * 0.25)]),
            cheek: Array.from({ length: 4 }, (_, k) => [E[0] + ER * (0.2 + k * 0.55), E[1] - ER * (1.6 - k * 0.15), E[2] + ER * (0.2 - k * 0.35)]),
            jaw: Array.from({ length: 5 }, (_, k) => [M.corner + ER * (1.2 + k * 0.6), M.mouth[1] - ER * (1.3 - k * 0.45), M.mouth[2] - ER * (0.6 + k * 0.8)])
        };
        for (const sd of sides) {
            if (f.studs !== 'none') for (const p of lines[f.studs]) {
                const s = spotAt(pack, built, Ns, near(p), sd, mirror);
                // A low dome of metal seated in a ring, a light at its crown.
                const t1 = norm(cross(s.n, [0, 1, 0])), t2 = cross(s.n, t1);
                mesh.sphere(add(s.p, mul(s.n, -0.0004)), 0.0029, mixRgb(m.trim, [0.85, 0.86, 0.88], 0.35), head, 4, 10, [1, 0.45, 1], [t1, s.n, t2]);
                mesh.torus(add(s.p, mul(s.n, 0.0002)), s.n, 0.0031, 0.0006, m.joint, head, 12, 4);
                if (m.glowAmount > 0.02) K.light(m).sphere(add(s.p, mul(s.n, 0.0008)), 0.0009, [1, 1, 1], head, 3, 6);
            }
            if (f.plate !== 'none') {
                const center = { temple: [E[0] + ER * 2.0, E[1] + ER * 0.6, E[2] - ER * 1.0], cheek: [E[0] + ER * 0.9, E[1] - ER * 1.5, E[2] - ER * 0.1], jaw: [M.corner + ER * 2.2, M.mouth[1] - ER * 0.4, M.mouth[2] - ER * 1.6] }[f.plate];
                seatedPlate(K, m, pack, built, Ns, center, ER * (f.plate === 'jaw' ? 1.3 : 1.0), ER * 0.62, sd, head, mirror);
            }
        }
    }
    /**
     * A plate shaped to the skin: an oval laid over the skin round a place
     * (its height taken from the skin under each point, smoothed), a rolled
     * rim in the trim color, two bolts and a lit slot.
     */
    function seatedPlate(K, m, pack, built, Ns, c0, rx, ry, sd, skin, mirror) {
        const R = Outfit.anatomy(pack).rest, P = built.shaped, S = faceSpots(pack);
        // The skin vertex nearest the plate's middle (mirrored for the right), its normal the plate's.
        let v0 = -1, bd = Infinity;
        for (const v of S.head) { const d = (sd * R[v * 3] - c0[0]) ** 2 + (R[v * 3 + 1] - c0[1]) ** 2 + (R[v * 3 + 2] - c0[2]) ** 2; if (d < bd) { bd = d; v0 = v; } }
        if (v0 < 0) return;
        const c = [P[v0 * 3], P[v0 * 3 + 1], P[v0 * 3 + 2]], n = norm([Ns[v0 * 3], Ns[v0 * 3 + 1], Ns[v0 * 3 + 2]]);
        const t1 = norm(sub([0, 1, 0], mul(n, n[1]))), t2 = cross(t1, n);
        const near = S.head.filter(v => (P[v * 3] - c[0]) ** 2 + (P[v * 3 + 1] - c[1]) ** 2 + (P[v * 3 + 2] - c[2]) ** 2 < (Math.max(rx, ry) * 1.6) ** 2 && (P[v * 3] > 0) === (c[0] > 0));
        const height = (x, y) => {
            let acc = 0, w = 0;
            for (const v of near) {
                const d = sub([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], c), px = dot(d, t2) - x, py = dot(d, t1) - y, ww = Math.exp(-(px * px + py * py) / (0.004 * 0.004));
                acc += dot(d, n) * ww; w += ww;
            }
            return w > 1e-9 ? acc / w : 0;
        };
        const plate = K.face(m), lift = 0.0018;
        const at = (u, v, k = 1, extra = 0) => {
            const a = u * TAU, x = Math.cos(a) * rx * v * k, y = Math.sin(a) * ry * v * k;
            const rim = smooth(0.82, 1, v);
            return add(add(c, add(mul(t2, x), mul(t1, y))), mul(n, height(x, y) + lift * (1 - 0.7 * rim) + extra));
        };
        const us = Array.from({ length: 20 }, (_, i) => i / 20), vs = [0, 0.35, 0.65, 0.82, 0.92, 1];
        plate.patch(us, vs, (u, v) => at(u, v), (u, v) => (v > 0.85 ? m.trim : mixRgb(m.base, m.trim, 0.2)), skin, { wrapU: true, away: sub(c, mul(n, 0.02)) });
        // A skirt down into the skin, so no gap shows under the rim.
        plate.patch(us, [0, 1], (u, v) => at(u, 1, 1, v ? -lift * 0.6 - 0.0008 : 0), m.joint, skin, { wrapU: true, away: sub(c, mul(n, 0.02)) });
        for (const k of [-1, 1]) plate.bolt(at(k > 0 ? 0 : 0.5, 0.72, 1, 0.0002), n, 0.0017, mixRgb(m.trim, [0.85, 0.85, 0.87], 0.4), skin);
        if (m.glowAmount > 0.02) K.light(m).tube(Array.from({ length: 6 }, (_, i) => at(0.25, -0.45 + i * 0.18, 1, 0.0004)).map((p, i) => add(c, add(mul(t2, (i - 2.5) * rx * 0.16), mul(n, dot(sub(p, c), n))))), 0.0007, 4, [1, 1, 1], skin);
    }

    // ── species features in cyber (tails, wings, horns, ears) ─────────────
    const featureMaterial = f => Art.cyberMaterial(f.style || 'sleek', { color: f.color, color2: f.color2, glow: f.glow, wear: f.wear, glowAmount: f.glowAmount });
    /** A segmented tail on the feature's own five bones: vertebra plates each rigid on its bone over a blended cable core; a blade or stinger tip. */
    function cyberTail(pts, shapeR, skinAt, f, bones) {
        const K = kit(), m = featureMaterial(f), n = pts.length - 1;
        // The core: a flexible cable, blended down the chain like a living tail's.
        K.rubber().tube(pts, t => shapeR(t) * 0.45 + 0.002, 8, m.joint, p => { let b = 0, bd = Infinity; for (let k = 0; k <= n; k++) { const d = len(sub(p, pts[k])); if (d < bd) { bd = d; b = k; } } return skinAt(b / n); });
        // Vertebrae: overlapping shells, each a short tapered sleeve on its own bone.
        const count = 16;
        for (let k = 0; k < count; k++) {
            const t0 = k / count, t1 = Math.min(1, (k + 1.25) / count), i0 = Math.round(t0 * n), i1 = Math.round(t1 * n);
            const seg = pts.slice(i0, i1 + 1);
            if (seg.length < 2) continue;
            const bone = Math.min(4, Math.floor((t0 + 0.5 / count) * 5)), sk = skinAt(Math.min(0.999, bone / 5 + 0.0001));
            const skin = { joints: [sk.joints[0], 0, 0, 0], weights: [1, 0, 0, 0] };
            const r0 = shapeR(t0) * 0.95 + 0.004, r1 = shapeR(t1) * 0.85 + 0.003;
            const mesh = k % 4 === 3 ? K.trim(m) : K.plating(m), col = k % 4 === 3 ? m.trim : m.base;
            mesh.tube(seg, t => r0 + (r1 - r0) * t + Math.sin(t * Math.PI) * 0.0015, 10, col, skin, { squash: 0.85 });
            // A fin on top of every other plate.
            if (k % 2 === 0 && k < count - 2) {
                const mid = seg[Math.floor(seg.length / 2)], dir = norm(sub(seg[seg.length - 1], seg[0])), up = norm(sub([0, 1, 0], mul(dir, dot([0, 1, 0], dir))));
                K.trim(m).tube([add(mid, mul(up, r0 * 0.7)), add(add(mid, mul(up, r0 * 1.35)), mul(dir, -r0 * 0.4))], t => r0 * 0.18 * (1 - t), 4, m.trim, skin, { squash: 0.35 });
            }
            if (m.glowAmount > 0.02 && (m.style.id === 'neon' || k % 3 === 0)) {
                const ring = seg[0], dir = norm(sub(seg[1], seg[0]));
                K.light(m).torus(add(ring, mul(dir, 0.002)), dir, r0 * 0.98, 0.0012, [1, 1, 1], skin, 14, 4);
            }
        }
        // The tip.
        const end = pts[n], dir = norm(sub(pts[n], pts[n - 2])), sk = skinAt(0.999), skin = { joints: [sk.joints[0], 0, 0, 0], weights: [1, 0, 0, 0] };
        const side = norm(cross(dir, [0, 1, 0]));
        if (f.tip === 'blade') {
            const T = K.trim(m), base = end, a = add(base, mul(dir, 0.11 * f.size)), w = 0.035 * f.size;
            const P = [add(base, mul(side, w)), a, add(base, mul(side, -w)), add(base, mul(dir, -0.02))];
            T.tube([P[3], add(P[0], mul(dir, 0.01)), a], t => 0.004 * (1 - t), 4, m.trim, skin, { squash: 0.25 });
            T.tube([P[3], add(P[2], mul(dir, 0.01)), a], t => 0.004 * (1 - t), 4, m.trim, skin, { squash: 0.25 });
            T.patch([0, 0.5, 1], [0, 1], (u, v) => lerp(lerp(P[0], P[2], u), a, v * (1 - Math.abs(u - 0.5) * 0.6)), m.trim, skin);
            T.patch([0, 0.5, 1], [0, 1], (u, v) => lerp(lerp(P[0], P[2], u), a, v * (1 - Math.abs(u - 0.5) * 0.6)), m.trim, skin, { flip: true });
            if (m.glowAmount > 0.02) K.light(m).tube([add(base, mul(dir, 0.01)), add(base, mul(dir, 0.08 * f.size))], 0.0012, 4, [1, 1, 1], skin);
        } else if (f.tip === 'stinger') {
            K.joint().sphere(end, shapeR(1) * 1.6 + 0.008, m.joint, skin, 5, 10, [1, 1, 1.3]);
            K.trim(m).tube([end, add(end, mul(norm(add(dir, [0, 0.6, 0])), 0.07 * f.size))], t => (0.008 * (1 - t) + 0.0005) * f.size, 8, m.trim, skin);
            K.light(m).sphere(add(end, mul(dir, 0.004)), 0.0035, [1, 1, 1], skin, 4, 8);
        } else K.trim(m).sphere(end, shapeR(1) + 0.005, m.trim, skin, 4, 8);
        return K.parts();
    }

    /** Cyber wings on the upper back (riding Spine2, as the organic ones do): blade vanes, thruster wings or an energy membrane. */
    function cyberWings(L, f) {
        const K = kit(), m = featureMaterial(f), spine = L.boneIndex('Spine2'), skin = rigid(spine), s = f.size;
        const y = L.bone('Spine2').head[1] + 0.1, z0 = L.backAt(y, 0.06), zb = (isFinite(z0) ? z0 : -0.12) - 0.02;
        // A mount on the back between the shoulder blades.
        K.plating(m).disc([0, y, zb - 0.01], [0, 0, -1], 0.07, 0.03, m.base, skin, 16, 0.4);
        K.trim(m).disc([0, y, zb - 0.03], [0, 0, -1], 0.04, 0.02, m.trim, skin, 12, 0.4);
        if (m.glowAmount > 0.02) K.light(m).disc([0, y, zb - 0.041], [0, 0, -1], 0.016, 0.004, [1, 1, 1], skin, 12);
        for (const side of [1, -1]) {
            const root = [side * 0.07, y, zb - 0.02];
            const shoulder = add(root, [side * 0.16 * s, 0.14 * s, -0.12 * s]), wrist = add(root, [side * 0.5 * s, 0.3 * s, -0.2 * s]), tip = add(root, [side * 0.9 * s, 0.08 * s, -0.24 * s]);
            // The frame: an articulated arm, a joint ball at each bend, actuators along it.
            const frame = [root, shoulder, wrist, tip];
            for (let k = 0; k + 1 < frame.length; k++) {
                K.plating(m).tube([frame[k], frame[k + 1]], t => (0.016 - k * 0.004) * s * (1 - t * 0.25), 8, m.base, skin, { squash: 1.3 });
                K.joint().sphere(frame[k], (0.02 - k * 0.004) * s, m.joint, skin, 5, 10);
                if (k < 2) K.trim(m).tube([lerp(frame[k], frame[k + 1], 0.15), lerp(frame[k], frame[k + 1], 0.7)].map(p => add(p, [0, -0.014 * s, -0.006 * s])), 0.0045 * s, 6, m.trim, skin);
            }
            if (f.type === 'cyberVanes') {
                // Blade vanes in two overlapping rows fanning from the frame, long at the tip: each a beveled plate,
                // broad at its root and drawn to a point, its edge lit.
                for (const row of [0, 1]) for (let k = 0; k < 12; k++) {
                    const t = (k + row * 0.5) / 12, at = t < 0.5 ? lerp(shoulder, wrist, t * 2) : lerp(wrist, tip, (t - 0.5) * 2);
                    const dir = norm([side * (0.1 + t * 0.85), -1 + t * 0.45, -0.08 - row * 0.05]), L2 = (0.2 + 0.36 * t) * s * (row ? 0.72 : 1), w = (0.05 - 0.012 * t) * s;
                    const right = norm(cross(dir, [0, 0, 1])), out = norm(cross(right, dir)), base = add(at, mul(out, row * 0.006 * s));
                    const shape = v => w * (v < 0.25 ? 0.65 + 1.4 * v : Math.pow(Math.max(0, 1 - (v - 0.25) / 0.75), 0.7));
                    const mesh = (k + row) % 3 === 2 ? K.trim(m) : K.plating(m), col = (k + row) % 3 === 2 ? m.trim : m.base;
                    for (const sgn of [1, -1]) mesh.patch([0, 0.5, 1], [0, 0.25, 0.6, 1], (u, v) => add(add(base, mul(dir, v * L2)), add(mul(right, (u - 0.5) * shape(v)), mul(out, sgn * (0.5 - Math.abs(u - 0.5)) * 0.006 * s))), col, skin, { away: sub(base, mul(out, sgn * 0.05)) });
                    if (m.glowAmount > 0.02 && row === 0) K.light(m).tube(Array.from({ length: 5 }, (_, i) => { const v = 0.1 + i * 0.2; return add(add(base, mul(dir, v * L2)), mul(right, shape(v) * 0.5)); }), 0.0011, 4, [1, 1, 1], skin);
                }
            } else if (f.type === 'cyberThruster') {
                // A swept airfoil (a closed, rounded section tapering to the tip), a lit trailing edge, two engine pods under it.
                const rootLE = add(root, [side * 0.05 * s, 0.13 * s, -0.07 * s]), tipLE = add(root, [side * 0.92 * s, 0.24 * s, -0.27 * s]);
                const chordAt = v => (0.26 - 0.17 * v) * s, thickAt = v => (0.03 - 0.02 * v) * s, spanD = norm(sub(tipLE, rootLE));
                const want = [0, -0.8, -0.55], chordD = norm(sub(want, mul(spanD, dot(want, spanD)))), th = norm(cross(spanD, chordD)), below = th[1] < 0 ? th : mul(th, -1);
                const lead = v => add(lerp(rootLE, tipLE, v), mul(chordD, v * v * 0.05 * s));
                const foil = (u, v) => { const a = u * TAU, x = (1 - Math.cos(a)) / 2, y = Math.sin(a) * (1 - x * 0.65) * 0.5; return add(lead(v), add(mul(chordD, x * chordAt(v)), mul(th, y * thickAt(v)))); };
                const us = Array.from({ length: 16 }, (_, i) => i / 16), vs = Array.from({ length: 9 }, (_, i) => i / 8);
                K.plating(m).patch(us, vs, foil, (u, v) => (Math.abs(v - 0.5) < 0.04 ? m.trim : m.base), skin, { wrapU: true, away: (u, v) => add(lead(v), mul(chordD, chordAt(v) * 0.4)) });
                // Its tip capped with a winglet.
                K.trim(m).tube([foil(0, 1), add(foil(0, 1), add(mul(chordD, chordAt(1) * 0.9), mul(below, -0.05 * s)))], t => (0.012 - 0.008 * t) * s, 6, m.trim, skin, { squash: 0.35 });
                if (m.glowAmount > 0.02) K.light(m).tube(vs.map(v => add(foil(0.5, v), mul(chordD, 0.002))), 0.0022 * s, 4, [1, 1, 1], skin);
                for (const v of [0.3, 0.62]) {
                    const mid = add(add(lead(v), mul(chordD, chordAt(v) * 0.35)), mul(below, thickAt(v) * 0.5 + 0.022 * s)), L2 = chordAt(v) * 0.9;
                    const front = sub(mid, mul(chordD, L2 * 0.45)), back = add(mid, mul(chordD, L2 * 0.55));
                    K.trim(m).tube([front, lerp(front, back, 0.5), back], t => (0.02 + 0.004 * Math.sin(t * Math.PI)) * s, 12, m.trim, skin);
                    K.joint().torus(front, chordD, 0.019 * s, 0.0035 * s, m.joint, skin, 14, 4);
                    K.joint().disc(add(back, mul(chordD, 0.002)), chordD, 0.017 * s, 0.003 * s, m.joint, skin, 12);
                    K.light(m).disc(add(back, mul(chordD, 0.004)), chordD, 0.012 * s, 0.002 * s, [1, 1, 1], skin, 12);
                    // The pylon up into the wing.
                    K.plating(m).tube([mid, add(mid, mul(below, -0.02 * s))], 0.006 * s, 6, m.base, skin, { squash: 0.35 });
                }
            } else {
                // Energy: a skeletal frame of spars, a lit translucent membrane between them.
                const spars = [tip, add(root, [side * 0.75 * s, -0.25 * s, -0.22 * s]), add(root, [side * 0.5 * s, -0.42 * s, -0.18 * s]), add(root, [side * 0.22 * s, -0.4 * s, -0.12 * s])];
                for (const sp of spars) K.plating(m).tube([wrist, lerp(wrist, sp, 0.5), sp], t => 0.007 * s * (1 - t * 0.6), 6, m.base, skin);
                const hubs = [shoulder].concat(spars);
                for (let k = 0; k + 1 < hubs.length; k++) K.membrane(m).patch([0, 0.25, 0.5, 0.75, 1], [0, 0.33, 0.66, 1], (u, v) => { const edge = lerp(hubs[k], hubs[k + 1], u), sag = Math.sin(u * Math.PI) * 0.05 * s * v; return add(lerp(wrist, edge, v), mul(norm(sub(lerp(hubs[k], hubs[k + 1], 0.5), wrist)), -sag)); }, [1, 1, 1], skin);
                // Light along the spars' edges.
                for (const sp of spars) K.light(m).tube([lerp(wrist, sp, 0.08), lerp(wrist, sp, 0.95)], 0.0016 * s, 4, [1, 1, 1], skin);
            }
        }
        return K.parts();
    }

    function headPoint(L, y, angle, out = 0) {
        const R = L.ring(y, 0.014) || L.ring(L.brow, 0.02);
        return { p: [R.center[0] + Math.sin(angle) * (R.rx + out), y, R.center[2] + Math.cos(angle) * (R.rz + out)], n: norm([Math.sin(angle) / R.rx, 0, Math.cos(angle) / R.rz]), R };
    }
    /** An implant socket where metal meets the scalp: a seated ring with bolts, the light ring round the post. */
    function socket(K, m, at, n, r, skin) {
        K.trim(m).disc(add(at, mul(n, 0.001)), n, r, 0.004, m.trim, skin, 14, 0.4);
        for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4, x = norm(cross(n, [0, 0, 1])), y = cross(n, x); K.trim(m).bolt(add(add(at, mul(n, 0.003)), add(mul(x, Math.cos(a) * r * 0.75), mul(y, Math.sin(a) * r * 0.75))), n, r * 0.12, mixRgb(m.trim, [0.8, 0.8, 0.82], 0.3), skin); }
        if (m.glowAmount > 0.02) K.light(m).torus(add(at, mul(n, 0.0045)), n, r * 0.55, 0.0009, [1, 1, 1], skin, 16, 4);
    }
    /** Cyber horns, seated in implant sockets: segmented chrome horns, sensor antennae with lit tips, or blade fins. */
    function cyberHorns(L, f) {
        const K = kit(), m = featureMaterial(f), head = rigid(L.boneIndex('Head')), s = f.size, H = L.crown - L.brow;
        for (const side of [1, -1]) {
            if (f.type === 'cyberAntenna') {
                const at = headPoint(L, L.crown - H * 0.25, side * 0.8, -0.003);
                socket(K, m, at.p, at.n, 0.014 * Math.sqrt(s), head);
                const dir = norm(add(mul(at.n, 0.4), [side * 0.15, 1, -0.35])), top = add(at.p, mul(dir, 0.16 * s));
                K.trim(m).tube([at.p, lerp(at.p, top, 0.5), top], t => (0.004 - 0.0025 * t) * Math.sqrt(s), 8, m.trim, head);
                for (const t of [0.3, 0.6]) K.plating(m).disc(lerp(at.p, top, t), dir, 0.0065 * Math.sqrt(s), 0.004, m.base, head, 10);
                K.light(m).sphere(top, 0.0065 * Math.sqrt(s), [1, 1, 1], head, 5, 10);
                continue;
            }
            if (f.type === 'cyberBlades') {
                const at = headPoint(L, L.brow + H * 0.45, side * 0.55, -0.004);
                socket(K, m, at.p, at.n, 0.018 * Math.sqrt(s), head);
                // A swept fin, thin, its leading edge lit.
                const base = at.p, up = norm(add(mul(at.n, 0.35), [0, 1, -0.6])), back = norm([side * 0.15, 0.25, -1]);
                const tipP = add(base, add(mul(up, 0.07 * s), mul(back, 0.16 * s)));
                const P = (u, v) => { const root = lerp(add(base, mul(back, -0.01 * s)), add(base, mul(back, 0.06 * s)), u); return lerp(root, tipP, v * (1 - u * 0.35)); };
                for (const flip of [false, true]) K.plating(m).patch([0, 0.5, 1], [0, 0.33, 0.66, 1], (u, v) => add(P(u, v), mul([side, 0, 0], (flip ? -1 : 1) * 0.0025 * (1 - v))), m.base, head, { flip });
                if (m.glowAmount > 0.02) K.light(m).tube(Array.from({ length: 6 }, (_, i) => add(P(0, i / 5), [0, 0.001, 0])), 0.0012, 4, [1, 1, 1], head);
                continue;
            }
            // Segmented horns: up and back from the brow, ring joints between tapering segments.
            const at = headPoint(L, L.brow + H * 0.3, side * 0.42, -0.006);
            socket(K, m, at.p, at.n, 0.022 * Math.sqrt(s), head);
            const path = t => add(at.p, [side * t * 0.04 * s, Math.sin(t * 1.6) * 0.13 * s, -Math.pow(t, 1.8) * 0.11 * s]);
            const segs = 5, r0 = 0.017 * Math.sqrt(s);
            for (let k = 0; k < segs; k++) {
                const a = k / segs, b = (k + 0.88) / segs, pts = Array.from({ length: 5 }, (_, i) => path(a + (b - a) * i / 4));
                const ra = r0 * (1 - a * 0.85), rb = r0 * (1 - b * 0.85);
                (m.style.id === 'salvaged' && k % 2 ? K.trim(m) : K.plating(m)).tube(pts, t => ra + (rb - ra) * t, 10, m.style.id === 'salvaged' && k % 2 ? m.trim : m.base, head);
                const ring = path((k + 0.94) / segs), dir = norm(sub(path((k + 0.98) / segs), path((k + 0.9) / segs)));
                (m.glowAmount > 0.02 && m.style.id === 'neon' ? K.light(m) : K.joint()).torus(ring, dir, rb * 0.92, rb * 0.22, m.joint, head, 12, 4);
            }
            K.trim(m).tube([path(0.98), path(1.02)], t => r0 * 0.15 * (1 - t), 6, m.trim, head);
            if (m.style.id === 'salvaged') K.rubber().tube([add(path(0.25), [side * 0.006, 0, -0.012]), add(at.p, [side * 0.02, -0.02, -0.05]), add(at.p, [side * 0.03, -0.05, -0.07])], 0.0022, 6, [0.12, 0.1, 0.09], head);
        }
        return K.parts();
    }
    /** Cyber ears: audio receivers over the ears (grille, vanes, a ring light), plated animal ears with a lit lining, or swept antenna fins. */
    function cyberEars(L, f) {
        const K = kit(), m = featureMaterial(f), head = rigid(L.boneIndex('Head')), s = f.size, H = L.crown - L.brow;
        for (const side of [1, -1]) {
            const ear = side > 0 ? L.earL : L.earR;
            if (f.type === 'cyberAudio' && ear) {
                // A housing over the ear: a domed cap, a grille of slots, vanes standing out behind, a light ring.
                const c = add(ear.center, [side * 0.006, 0, 0]), n = norm([side, 0, 0.05]), r = 0.034 * Math.sqrt(s);
                K.plating(m).disc(add(c, mul(n, 0.008)), n, r, 0.02, m.base, head, 20, 0.45);
                K.joint().disc(add(c, mul(n, 0.019)), n, r * 0.72, 0.003, m.joint, head, 18);
                const x = norm(cross(n, [0, 1, 0])), y = cross(n, x);
                for (let k = -3; k <= 3; k++) K.trim(m).tube([add(add(c, mul(n, 0.0205)), add(mul(y, k * r * 0.18), mul(x, -r * 0.6 * Math.sqrt(1 - (k / 3.6) ** 2)))), add(add(c, mul(n, 0.0205)), add(mul(y, k * r * 0.18), mul(x, r * 0.6 * Math.sqrt(1 - (k / 3.6) ** 2))))], 0.0012, 4, m.trim, head);
                for (let k = 0; k < 3; k++) { const p0 = add(c, add(mul(n, 0.006), add(mul(x, -r * 0.8), mul(y, (k - 1) * r * 0.4)))); K.trim(m).tube([p0, add(p0, add(mul(x, -0.03 * s), mul(y, (k - 1) * 0.008)))], t => 0.006 * (1 - t * 0.6), 4, m.trim, head, { squash: 0.3 }); }
                if (m.glowAmount > 0.02) K.light(m).torus(add(c, mul(n, 0.0185)), n, r * 0.84, 0.0013, [1, 1, 1], head, 24, 4);
                continue;
            }
            if (f.type === 'cyberFins') {
                const at = headPoint(L, L.brow + H * 0.15, side * 1.25, -0.004);
                socket(K, m, at.p, at.n, 0.012, head);
                const back = norm([side * 0.35, 0.3, -1]), up = [0, 1, 0];
                for (let k = 0; k < 3; k++) {
                    const base = add(at.p, mul(up, (k - 1) * 0.01)), tip = add(base, add(mul(back, (0.11 - k * 0.025) * s), mul(up, (0.03 - k * 0.012) * s)));
                    K.plating(m).tube([base, lerp(base, tip, 0.5), tip], t => (0.006 - 0.005 * t) * Math.sqrt(s), 6, k === 1 ? m.trim : m.base, head, { squash: 0.35 });
                    if (k === 1 && m.glowAmount > 0.02) K.light(m).sphere(tip, 0.003, [1, 1, 1], head, 4, 8);
                }
                continue;
            }
            // Plated animal ears on the head's top, lined in light.
            const at = headPoint(L, L.crown - H * 0.3, side * 0.82, -0.006);
            const upD = norm(add(mul(at.n, 0.42), [0, 1, 0])), fwd = norm(sub([side * 0.32, 0, 1], mul(upD, dot([side * 0.32, 0, 1], upD)))), x = norm(cross(fwd, upD));
            const tall = 0.085 * s, wide = 0.042 * s;
            for (const [k, lift, mesh, col] of [[1, 0, K.plating(m), m.base], [0.8, 0.003, K.light(m), [1, 1, 1]]]) {
                mesh.patch(Array.from({ length: 9 }, (_, i) => i / 8), Array.from({ length: 7 }, (_, i) => i / 6), (u, v) => {
                    const w = wide * k * (1 - v) * Math.sin(Math.PI * u) ** 0.4 * Math.sign(u - 0.5);
                    return add(add(at.p, mul(upD, -0.01 + v * tall * k)), add(mul(x, w), mul(fwd, lift + (1 - Math.abs(u - 0.5) * 2) * 0.006 * k)));
                }, col, head, { flip: k < 1 });
            }
            K.plating(m).patch(Array.from({ length: 9 }, (_, i) => i / 8), Array.from({ length: 7 }, (_, i) => i / 6), (u, v) => {
                const w = wide * (1 - v) * Math.sin(Math.PI * u) ** 0.4 * Math.sign(u - 0.5);
                return add(add(at.p, mul(upD, -0.01 + v * tall)), add(mul(x, w), mul(fwd, -0.004 - (1 - Math.abs(u - 0.5) * 2) * 0.004)));
            }, m.base, head, { flip: true });
            socket(K, m, at.p, at.n, 0.02, head);
        }
        return K.parts();
    }

    // ── the whole set ─────────────────────────────────────────────────────
    /**
     * Every mod on a built body: { parts, textures }. `o`: { outfit, quality,
     * static }. Piercings and face hardware ride the head (expressions move
     * each piece with the skin it sits on); limb pieces each ride one bone.
     */
    function build(pack, built, r, L, o = {}) {
        const art = r.bodyArt, K = kit(), mirror = new Map(), R = rng(9137);
        if (!art || Art.isEmpty(art)) return { parts: [], textures: {} };
        const headCovered = r.outfit.some(i => ['greathelm', 'visorhelm', 'powerhelm'].includes(i.id));
        const graft = !!r.head;
        if (!graft && !headCovered) {
            piercings(K, pack, built, art, L, mirror);
            cyberEye(K, pack, built, art, L);
            faceImplants(K, pack, built, art, L, mirror);
        }
        for (const l of art.limbs) cyberLimb(K, pack, built, r, l, o.outfit, R);
        const parts = K.parts(), textures = {};
        for (const p of parts) if (p.texture && !textures[p.texture]) {
            const cache = o.cache || {};
            const key = '_' + p.texture;
            textures[p.texture] = cache[key] || (cache[key] = wearTexture(+p.texture.match(/(\d)\.png$/)[1]));
        }
        return { parts, textures };
    }
    /** Textures a list of feature parts needs (the wear pictures). */
    function texturesFor(parts, cache = {}) {
        const out = {};
        for (const p of parts) if (p.texture && /^cyber-wear-\d\.png$/.test(p.texture) && !out[p.texture]) out[p.texture] = cache['_' + p.texture] || (cache['_' + p.texture] = wearTexture(+p.texture.match(/(\d)\.png$/)[1]));
        return out;
    }

    const api = { Hard, hiddenSkin, skinLayers, build, cyberTail, cyberWings, cyberHorns, cyberEars, wearTexture, texturesFor, faceSpots, measure, LIMB_DEF };
    root.RRCharacterBodyMods = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
