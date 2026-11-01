/**
 * The visible human face: a mask (RR_HEAD_MESH), forehead to under the chin and in front of the ears, carried by the body's own head skin, which is hidden
 * beneath it and goes on taking every slider and expression; scalp, ears and neck stay the body's. Each vertex follows a few skin vertices plus its own offset,
 * settling exactly onto the skin at the mask's edge. The lips, brows, lashes, eyeballs and the dark of the open mouth are all fitted to this surface here.
 */
(function (root) {
    'use strict';
    const dataOf = () => root.RR_HEAD_MESH || (typeof require === 'function' ? require('./HeadMeshData.js') : null);
    const Body = () => root.RRHumanBody || require('./HumanBody.js');
    const K = 6;
    const IRIS = [[0.708, 0.259], [0.292, 0.671]];     // each iris's middle in the eye picture (CharacterSkin.js)
    const LID_THICKNESS = 0.004;     // eyes-to-chin: how far a lid's edge stands off the ball (headmesh.py lays it there)
    /** Whether this recipe wears the head (the human species, with no head of its own). */
    const applies = r => !root.RR_NO_HEAD_MESH && (!r.species || r.species === 'human') && !(r.head && r.head.kind) && !!dataOf();
    const setOf = r => { const d = dataOf(); return (r.gender ?? 0.5) < 0.5 ? d.F : d.M; };
    const hidden = r => new Set(setOf(r).hide);
    function scaleOf(pack, P) {
        const F = Body().headFields(pack);
        let eye = 0, chin = Infinity;
        for (const v of F.eyeIds) eye += P[v * 3 + 1] / F.eyeIds.length;
        for (const v of pack.body.source) if (F.w[v] > 0.3 && Math.abs(P[v * 3]) < 0.012 && P[v * 3 + 2] > 0.02 && P[v * 3 + 1] < chin) chin = P[v * 3 + 1];
        return eye - chin;
    }
    function eyeLevel(pack, P) {
        const F = Body().headFields(pack);
        let eye = 0;
        for (const v of F.eyeIds) eye += P[v * 3 + 1] / F.eyeIds.length;
        return eye;
    }
    function positions(pack, P, r) {
        const s = setOf(r), n = s.off.length / 3, E = scaleOf(pack, P), out = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
            // (Weights brought to exactly 1: these are positions a meter and a half up, and a rounded weight is a millimeter's jitter.)
            let x = 0, y = 0, z = 0, sum = 0;
            for (let k = 0; k < K; k++) sum += s.w[i * K + k];
            for (let k = 0; k < K; k++) { const v = s.bind[i * K + k] * 3, w = s.w[i * K + k] / sum; x += P[v] * w; y += P[v + 1] * w; z += P[v + 2] * w; }
            out[i * 3] = x + s.off[i * 3] * E; out[i * 3 + 1] = y - s.off[i * 3 + 1] * E; out[i * 3 + 2] = z + s.off[i * 3 + 2] * E;
        }
        return out;
    }
    function normalsOf(p, I) {
        const n = new Float32Array(p.length);
        for (let t = 0; t < I.length; t += 3) {
            const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3], e = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], f = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
            const x = e[1] * f[2] - e[2] * f[1], y = e[2] * f[0] - e[0] * f[2], z = e[0] * f[1] - e[1] * f[0];
            for (const q of [a, b, c]) { n[q] += x; n[q + 1] += y; n[q + 2] += z; }
        }
        for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
        return n;
    }
    function part(pack, built, r, body) {
        const s = setOf(r), n = s.off.length / 3, index = Uint32Array.from(s.index), pos = positions(pack, built.shaped, r);
        const extra = [], uvs = new Float32Array(n * 2), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), offsets = new Uint32Array(n + 1), vertices = new Int32Array(n * K), factors = new Float32Array(n * K);
        for (let i = 0; i < n; i++) {
            offsets[i + 1] = (i + 1) * K;
            uvs[i * 2] = s.uv[i * 2]; uvs[i * 2 + 1] = s.uv[i * 2 + 1];
            const joint = new Map();
            let total = 0;
            for (let k = 0; k < K; k++) total += s.w[i * K + k];
            for (let k = 0; k < K; k++) {
                const v = s.bind[i * K + k], f = s.w[i * K + k] / total;
                vertices[i * K + k] = v; factors[i * K + k] = f;
                for (let q = 0; q < 4; q++) { const bone = pack.skinJoints[v * 4 + q], wt = pack.skinWeights[v * 4 + q] * f; if (wt) joint.set(bone, (joint.get(bone) || 0) + wt); }
            }
            const top = [...joint].sort((a, b) => b[1] - a[1]).slice(0, 4), all = top.reduce((a, b) => a + b[1], 0) || 1;
            top.forEach(([bone, wt], q) => { joints[i * 4 + q] = bone; weights[i * 4 + q] = wt / all; });
        }
        // Where a face crosses a seam of the skin picture, all of it takes one side's place: stretched across the seam it drew a hard line.
        for (let t = 0; t < index.length; t += 3) {
            const [a, b, c] = [index[t], index[t + 1], index[t + 2]], far = (p, q) => Math.hypot(uvs[p * 2] - uvs[q * 2], uvs[p * 2 + 1] - uvs[q * 2 + 1]) > 0.16;
            if (!far(a, b) && !far(a, c)) continue;
            extra.push([t + 1, a], [t + 2, a]);
        }
        const count = n + extra.length, grow = (A, size) => { const o = new A.constructor(count * size); o.set(A); return o; };
        const P2 = grow(pos, 3), U2 = grow(uvs, 2), J2 = grow(joints, 4), W2 = grow(weights, 4), O2 = new Uint32Array(count + 1), V2 = new Int32Array(count * K), F2 = new Float32Array(count * K), map = new Int32Array(count);
        for (let i = 0; i < n; i++) map[i] = i;
        O2.set(offsets); V2.set(vertices); F2.set(factors);
        extra.forEach(([slot, keep], e) => {
            const i = n + e, was = index[slot];
            map[i] = was; index[slot] = i; O2[i + 1] = (i + 1) * K;
            for (let k = 0; k < 3; k++) P2[i * 3 + k] = pos[was * 3 + k];
            for (let k = 0; k < 2; k++) U2[i * 2 + k] = uvs[keep * 2 + k];
            for (let k = 0; k < 4; k++) { J2[i * 4 + k] = joints[was * 4 + k]; W2[i * 4 + k] = weights[was * 4 + k]; }
            for (let k = 0; k < K; k++) { V2[i * K + k] = vertices[was * K + k]; F2[i * K + k] = factors[was * K + k]; }
        });
        // Normals across seams of the picture as one surface, and toward the mask's edge those of the skin it settles onto, so no line shows where it ends.
        const baseN = normalsOf(pos, index.map(i => map[i])), skinN = Body().vertexNormals(pack, built.shaped), N2 = new Float32Array(count * 3), edge = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const v = map[i], t = Math.min(1, s.fade[v] * 2.2), m = [0, 0, 0];
            edge[i] = t;
            for (let k = 0; k < K; k++) { const q = s.bind[v * K + k] * 3; for (let a = 0; a < 3; a++) m[a] += skinN[q + a] * s.w[v * K + k]; }
            const x = baseN[v * 3] * t + m[0] * (1 - t), y = baseN[v * 3 + 1] * t + m[1] * (1 - t), z = baseN[v * 3 + 2] * t + m[2] * (1 - t), l = Math.hypot(x, y, z) || 1;
            N2[i * 3] = x / l; N2[i * 3 + 1] = y / l; N2[i * 3 + 2] = z / l;
        }
        const lidWall = new Uint8Array(count);
        for (let i = 0; i < count; i++) lidWall[i] = map[i] >= s.lidFrom ? 1 : 0;
        const tone = new Float32Array(count);
        // The nostrils darken with depth in the same shade, so they keep the skin's own color and light, and no edge shows where they begin.
        const deep = new Map(s.nostril);
        for (let i = 0; i < count; i++) { const d = deep.get(map[i]) || 0; tone[i] = s.tone[map[i]] * (1 - 0.86 * d * d * (3 - 2 * d)); }
        return { name: 'Head skin', headMesh: true, kind: 'skin', positions: P2, normals: N2, edge, lidWall, tone, uvs: U2, index, joints: J2, weights: W2, seamMap: map, texture: body.texture, normalTexture: body.normalTexture, normalScale: (body.normalScale ?? 1) * 0.25, roughness: body.roughness,
            interpolation: { offsets: O2, vertices: V2, weights: F2 } };
    }
    /** The lips' outline on this head: as its surface was measured, anchored to the skin so it stays with the mouth under every slider. */
    function lipFit(pack, P, r, head) {
        const s = setOf(r).lip, E = scaleOf(pack, P), Q = head.positions, center = Q[s.mid * 3 + 1] + (s.midY - s.line) * E, corner = s.corner / s.endX * Math.abs(Q[s.ends[0] * 3] - Q[s.ends[1] * 3]) / 2;
        const H = Math.max(...s.up, ...s.low) * E, bins = a => a.map(v => +(v * E / H).toFixed(3));
        return { gender: r.gender ?? 0.5, center, corner, H, upper: Math.max(...s.up) * E / H, lower: Math.max(...s.low) * E / H, bend: 0, measured: true, up: bins(s.up), low: bins(s.low), drop: s.drop.map(v => v * E), span: [corner * 2.4, H * 3] };
    }
    /** The lips as a patch of the head's own surface, a hair forward of it. */
    function lipPart(head, fit) {
        const P = head.positions, I = head.index, at = new Map(), ids = [], index = [];
        // The mouth's line is no straight one: heights in the picture count from it.
        const lineAt = x => { const q = Math.min(0.9999, Math.abs(x) / fit.corner) * (fit.drop.length - 1), i = Math.floor(q); return fit.center - (fit.drop[i] + (fit.drop[i + 1] - fit.drop[i]) * (q - i)); };
        const inside = v => Math.abs(P[v * 3] / fit.corner) < 1.18 && Math.abs(P[v * 3 + 1] - lineAt(P[v * 3])) < fit.H * 1.45;
        for (let t = 0; t < I.length; t += 3) {
            const tri = [I[t], I[t + 1], I[t + 2]];
            if (!tri.every(inside)) continue;
            for (const v of tri) { if (!at.has(v)) { at.set(v, ids.length); ids.push(v); } index.push(at.get(v)); }
        }
        const { positions, normals, uvs, joints, weights, interpolation, index: tris } = sheet(head, ids, index, 0, 0.0004, v => [0.5 + P[v * 3] / fit.corner / 2.4, 0.5 - (P[v * 3 + 1] - lineAt(P[v * 3])) / (3 * fit.H)]);
        return { name: 'Lips', headMesh: true, positions, normals, uvs, index: tris, joints, weights, texture: 'lips.png', opacity: 0.999, roughness: 0.4, kind: 'skin', decal: true, noShade: true, interpolation };
    }
    /** Vertices of the head as a sheet of their own, following it: a hair forward of it, each its own place in a picture. */
    function sheet(head, ids, index, lift, forward, place) {
        const P = head.positions, n = ids.length, b = head.interpolation, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), uvs = new Float32Array(n * 2), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), offsets = new Uint32Array(n + 1), vertices = new Int32Array(n * K), factors = new Float32Array(n * K);
        ids.forEach((v, i) => {
            for (let k = 0; k < 3; k++) { positions[i * 3 + k] = P[v * 3 + k] + head.normals[v * 3 + k] * lift + (k === 2 ? forward : 0); normals[i * 3 + k] = head.normals[v * 3 + k]; }
            uvs.set(place(v), i * 2);
            for (let k = 0; k < 4; k++) { joints[i * 4 + k] = head.joints[v * 4 + k]; weights[i * 4 + k] = head.weights[v * 4 + k]; }
            offsets[i + 1] = (i + 1) * K;
            for (let k = 0; k < K; k++) { vertices[i * K + k] = b.vertices[v * K + k]; factors[i * K + k] = b.weights[v * K + k]; }
        });
        return { positions, normals, uvs, joints, weights, index: Uint32Array.from(index), interpolation: { offsets, vertices, weights: factors } };
    }
    /** The brows as a sheet of this head, in the brow picture's box (in eye radii) round each of its own lid openings. */
    function browPart(head, brows, r, BOX) {
        const P = head.positions, I = head.index, ids = [], index = [], at = new Map(), uv = new Map(), g = Math.max(0, Math.min(1, r.gender ?? 0.5));
        for (const [outer, inner] of setOf(r).opening) {
            const er = Math.abs(P[outer * 3] - P[inner * 3]) / 2 / 1.05, cx = (P[outer * 3] + P[inner * 3]) / 2, cy = (P[outer * 3 + 1] + P[inner * 3 + 1]) / 2, side = Math.sign(cx) || 1, x0 = cx - side * er * BOX[0], y0 = cy + er * BOX[2];
            // Low over the eye and full, as on the finished references, rising a little outward.
            const lift = -er * 0.08, rise = er * (0.2 - 0.12 * g), fat = 1.3, place = v => { const u = side * (P[v * 3] - x0) / (er * BOX[1]), w = 1 - (P[v * 3 + 1] - y0 - lift - rise * (u - 0.3)) / (er * BOX[3]); return [u, 0.62 + (w - 0.62) / fat]; };
            const fits = v => { if (P[v * 3] * side <= 0 || head.normals[v * 3 + 2] < 0.1) return false; const q = place(v); return q[0] > -0.08 && q[0] < 1.08 && q[1] > -0.08 && q[1] < 1.08; };
            for (let t = 0; t < I.length; t += 3) {
                const tri = [I[t], I[t + 1], I[t + 2]];
                if (!tri.every(fits)) continue;
                for (const v of tri) { if (!at.has(v)) { at.set(v, ids.length); ids.push(v); uv.set(v, place(v).map(q => Math.max(0, Math.min(1, q)))); } index.push(at.get(v)); }
            }
        }
        const made = sheet(head, ids, index, 0.0003, 0, v => uv.get(v)), { source, ...rest } = brows;
        return { ...rest, ...made, colors: new Float32Array(ids.length * 3).fill(1), headMesh: true };
    }
    /**
     * This head's eyeballs: one clean sphere each, the iris lying on it. The eye mesh is a shell over an inner ball with its iris dished in; at the size these
     * eyes must be to fill the lids, the ball's rim cuts across that dish whenever the eye is seen from the side. Vertices are kept, so sliders still find them.
     */
    function sphereEyes(eyes, head, r, pack, shaped) {
        const P = Float32Array.from(eyes.positions), N = Float32Array.from(eyes.normals), U = eyes.uvs, n = P.length / 3, Q = head.positions, s = setOf(r);
        // The lids shade the ball, heaviest under the upper one and toward the corners: a bright white ball with no shadow on it is what reads as a doll's eye.
        const shade = new Float32Array(n * 3), glow = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
        [1, -1].forEach((side, k) => {
            // The ball from the lids themselves, as they stand on this body: each lid's thickness runs from its edge straight at the ball's middle (a third of the way), so
            // the middle reads straight back off them, and the ball can never disagree with the lids under any slider, age or blend.
            const c = [0, 0, 0], rims = s.rim[k].concat(s.low[k]), walls = s.rimIn[k].concat(s.lowIn[k]);
            rims.forEach((v, i) => { for (let a = 0; a < 3; a++) c[a] += (Q[v * 3 + a] + (Q[walls[i] * 3 + a] - Q[v * 3 + a]) / 0.35) / rims.length; });
            let radius = 0;
            for (const v of rims) radius += Math.hypot(Q[v * 3] - c[0], Q[v * 3 + 1] - c[1], Q[v * 3 + 2] - c[2]) / rims.length;
            radius -= LID_THICKNESS * scaleOf(pack, shaped);
            // And never larger than the skin round it leaves room for: sliders can draw a lid in closer than its edge stands.
            const floor = radius * 0.95;
            for (let v = 0; v < s.lidFrom; v++) {
                if (Q[v * 3 + 2] <= c[2] || Math.abs(Q[v * 3] - c[0]) > radius * 0.5 || Math.abs(Q[v * 3 + 1] - c[1]) > radius * 0.8) continue;    // (the lids' middle: the corners fold in on their own)
                const d = Math.hypot(Q[v * 3] - c[0], Q[v * 3 + 1] - c[1], Q[v * 3 + 2] - c[2]);
                if (d < radius + 0.0003 && d > floor) radius = d - 0.0003;
            }
            const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity], own = [];
            for (let i = 0; i < n; i++) if (P[i * 3] * side > 0) { own.push(i); for (let a = 0; a < 3; a++) { low[a] = Math.min(low[a], P[i * 3 + a]); high[a] = Math.max(high[a], P[i * 3 + a]); } }
            const r0 = (high[0] - low[0]) / 2, c0 = [(low[0] + high[0]) / 2, (low[1] + high[1]) / 2, high[2] - r0];
            for (const i of own) {
                const d = [P[i * 3] - c0[0], P[i * 3 + 1] - c0[1], P[i * 3 + 2] - c0[2]], l = Math.hypot(...d) || 1;
                for (let a = 0; a < 3; a++) { N[i * 3 + a] = d[a] / l; P[i * 3 + a] = c[a] + d[a] / l * radius; }
                const dim = (1 - 0.5 * glow(0.08, 0.5, d[1] / l)) * (1 - 0.32 * glow(0.42, 0.9, Math.abs(d[0]) / l));
                for (let a = 0; a < 3; a++) shade[i * 3 + a] = (eyes.colors ? eyes.colors[i * 3 + a] : 1) * dim * [0.93, 0.92, 0.94][a];
            }
            // Then turned in its socket, as an eye is, until it looks straight out of the middle of its opening: a shade above it, the upper lid lapping the iris and the lower just meeting it.
            let middle = own[0], best = Infinity;
            for (const i of own) for (const [u, v] of IRIS) { const e = Math.hypot(U[i * 2] - u, U[i * 2 + 1] - v); if (e < best) { best = e; middle = i; } }
            const ys = s.rim[k].map(v => Q[v * 3 + 1]), yl = s.low[k].map(v => Q[v * 3 + 1]), goal = (Math.max(...ys) + Math.min(...yl)) / 2 + radius * 0.03;
            const tilt = Math.asin(Math.max(-0.5, Math.min(0.5, (P[middle * 3 + 1] - goal) / radius))), co = Math.cos(tilt), si = Math.sin(tilt);
            for (const i of own) for (const A of [P, N]) {
                const at = A === P ? [c[1], c[2]] : [0, 0], y = A[i * 3 + 1] - at[0], z = A[i * 3 + 2] - at[1];
                A[i * 3 + 1] = at[0] + y * co - z * si; A[i * 3 + 2] = at[1] + y * si + z * co;
            }
        });
        // The ball, not the shell: of each joined piece, the one spanning the picture's eye (the shell and its bits take only a corner of it). By that, not by where in the picture: each eye has its own place there.
        const I = eyes.index, root_ = Int32Array.from({ length: n }, (_, i) => i), find = v => { while (root_[v] !== v) { root_[v] = root_[root_[v]]; v = root_[v]; } return v; };
        for (let t = 0; t < I.length; t += 3) { root_[find(I[t + 1])] = find(I[t]); root_[find(I[t + 2])] = find(I[t]); }
        const span = new Map();
        for (let i = 0; i < n; i++) { const q = find(i), b = span.get(q) || [Infinity, -Infinity]; b[0] = Math.min(b[0], U[i * 2]); b[1] = Math.max(b[1], U[i * 2]); span.set(q, b); }
        const keep = [];
        for (let t = 0; t < I.length; t += 3) { const b = span.get(find(I[t])); if (b[1] - b[0] > 0.2) keep.push(I[t], I[t + 1], I[t + 2]); }
        eyes.colors = shade; eyes.keepColors = true; eyes.positions = P; eyes.normals = N; eyes.index = Uint32Array.from(keep); eyes.softGloss = true;
    }
    /** The dark behind an open mouth: a shallow bowl just inside the lips, round the teeth and tongue, so nothing shows through the head. */
    function mouthPart(head, fit, r) {
        const s = setOf(r).lip, P = head.positions, mid = s.mid, rim = Math.min(P[s.ends[0] * 3 + 2], P[s.ends[1] * 3 + 2]) - 0.02, a = fit.corner * 1.12, b = fit.H * 1.9, RINGS = 6, SIDES = 18, depth = fit.corner * 2.4;
        const pts = [[0, 0]], index = [];
        for (let ring = 1; ring <= RINGS; ring++) for (let k = 0; k < SIDES; k++) { const t = k / SIDES * Math.PI * 2, q = ring / RINGS; pts.push([Math.cos(t) * q, Math.sin(t) * q]); }
        for (let k = 0; k < SIDES; k++) index.push(0, 1 + k, 1 + (k + 1) % SIDES);
        for (let ring = 0; ring + 1 < RINGS; ring++) for (let k = 0; k < SIDES; k++) {
            const p = 1 + ring * SIDES + k, q = 1 + ring * SIDES + (k + 1) % SIDES, u = p + SIDES, v = q + SIDES;
            index.push(p, u, v, p, v, q);
        }
        const n = pts.length, positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), colors = new Float32Array(n * 3);
        const midB = head.interpolation, offsets = new Uint32Array(n + 1), vertices = new Int32Array(n * K), factors = new Float32Array(n * K);
        pts.forEach(([u, v], i) => {
            positions[i * 3] = a * u; positions[i * 3 + 1] = fit.center + b * v; positions[i * 3 + 2] = rim - depth * (1 - u * u - v * v);
            normals[i * 3 + 2] = 1;
            colors[i * 3] = 0.05; colors[i * 3 + 1] = 0.018; colors[i * 3 + 2] = 0.02;
            for (let k = 0; k < 4; k++) { joints[i * 4 + k] = head.joints[mid * 4 + k]; weights[i * 4 + k] = head.weights[mid * 4 + k]; }
            offsets[i + 1] = (i + 1) * K;
            for (let k = 0; k < K; k++) { vertices[i * K + k] = midB.vertices[mid * K + k]; factors[i * K + k] = midB.weights[mid * K + k]; }
        });
        return { name: 'Mouth inside', positions, normals, index: Uint32Array.from(index), colors, keepColors: true, joints, weights, roughness: 0.9, noShade: true, interpolation: { offsets, vertices, weights: factors } };
    }
    /** Each lid's edge on this head, outer corner to inner, in even steps, with the way out of the eyeball at each point: where the lashes root. */
    function lashRim(head, r) {
        const P = head.positions, s = setOf(r), edge = (ids, inner) => {
            const pts = ids.map(v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]), out = ids.map((v, i) => { const q = [0, 1, 2].map(a => P[v * 3 + a] - P[inner[i] * 3 + a]), l = Math.hypot(...q) || 1; return q.map(c => c / l); }), along = [0];
            for (let i = 1; i < pts.length; i++) along.push(along[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
            const len = along.at(-1), STEPS = 16, line = [];
            for (let j = 0, i = 0; j <= STEPS; j++) {
                const at = len * j / STEPS;
                while (i + 2 < pts.length && along[i + 1] < at) i++;
                const f = (at - along[i]) / Math.max(1e-6, along[i + 1] - along[i]), p = [0, 1, 2].map(a => pts[i][a] + (pts[i + 1][a] - pts[i][a]) * f);
                p.out = [0, 1, 2].map(a => out[i][a] + (out[i + 1][a] - out[i][a]) * f);
                line.push(p);
            }
            return line;
        };
        const lines = { low: {} };
        s.rim.forEach((ids, k) => { lines[k ? -1 : 1] = edge(ids, s.rimIn[k]); lines.low[k ? -1 : 1] = edge(s.low[k], s.lowIn[k]); });
        return lines;
    }
    const api = { applies, hidden, part, positions, normalsOf, lipFit, lipPart, browPart, mouthPart, sphereEyes, lashRim };
    root.RRHeadMesh = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
