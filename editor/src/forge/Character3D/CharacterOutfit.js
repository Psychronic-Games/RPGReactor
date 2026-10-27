/**
 * RRCharacterOutfit - garments cut from the body and fitted to every slider.
 *
 * MakeHuman's base mesh carries clothing helpers (a bodysuit, a long skirt)
 * that every shape target moves with the body. A garment here is a piece of
 * one of those surfaces (or of the skin, for gloves and hoods), cut along
 * smooth lines measured on the body's own chains (spine, arms, legs), lifted
 * off it by a thickness, draped (smoothed, but never inside the body) and
 * colored by vertex. Its vertices are recorded as points between two pack
 * vertices, so after any slider change the same garment is laid on the new
 * body by interpolation, already skinned with the body's weights.
 *
 * Pieces of hard armor are the same cut, lifted further, smoothed harder,
 * split into plates along a chain and given a metal finish.
 *
 * No DOM and no three.js: the builder page and the node tests share it.
 */
(function(root) {
    'use strict';

    const Body = root.RRHumanBody || (typeof require === 'function' ? require('./HumanBody.js') : null);
    // Soft pieces settle as cloth once laid (RRCharacterDrape; optional: without it they keep their laid shell).
    const Drape = root.RRCharacterDrape || (typeof require === 'function' ? require('./CharacterDrape.js') : null);

    // ── colors ────────────────────────────────────────────────────────────
    const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    /** Hex to linear rgb. */
    function linear(hex) {
        const n = parseInt(String(hex || '#808080').replace('#', '').padEnd(6, '0').slice(0, 6), 16);
        return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
    }
    const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    // ── body chains ───────────────────────────────────────────────────────
    const FAMILIES = ['spine', 'armL', 'armR', 'legL', 'legR'];
    const familyOf = name => {
        if (/^Left(Shoulder|Arm|ForeArm|Hand)/.test(name)) return 1;
        if (/^Right(Shoulder|Arm|ForeArm|Hand)/.test(name)) return 2;
        if (/^Left(UpLeg|Leg|Foot|ToeBase)/.test(name)) return 3;
        if (/^Right(UpLeg|Leg|Foot|ToeBase)/.test(name)) return 4;
        return 0;
    };
    /**
     * Each chain's joints, as positions along it: the spine runs Hips 0,
     * Spine 1, Spine1 2, Spine2 3, Neck 4, Head 5, crown 6; an arm Shoulder 0,
     * Arm 1, ForeArm 2, Hand 3, fingertips 4; a leg UpLeg 0, knee 1, ankle 2,
     * toes 3, toe tips 4.
     */
    const CHAINS = {
        spine: ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'Head>'],
        armL: ['LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandMiddle3>'],
        armR: ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandMiddle3>'],
        legL: ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'LeftToeBase>'],
        legR: ['RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'RightToeBase>']
    };

    function chainPoints(bones, family) {
        return CHAINS[family].map(entry => {
            const tail = entry.endsWith('>');
            const bone = bones.find(b => b.name === entry.replace('>', ''));
            return (tail ? bone.tail : bone.head).slice();
        });
    }

    /**
     * A height on the trunk as a spine position: even steps from the hips'
     * joint (0) to the neck's (4), carried on below; above the neck, through
     * the head's joint (5) to the crown (6).
     */
    function spineAt(points, y) {
        const hip = points[0][1], neck = points[4][1];
        if (y <= neck) return (y - hip) / (neck - hip) * 4;
        if (y <= points[5][1]) return 4 + (y - neck) / (points[5][1] - neck);
        return 5 + (y - points[5][1]) / (points[6][1] - points[5][1]);
    }

    /** Where a point falls along a polyline: segment index plus fraction, carried past either end. */
    function along(points, x, y, z) {
        let best = Infinity, at = 0, axis = null, dir = null;
        for (let i = 0; i + 1 < points.length; i++) {
            const a = points[i], b = points[i + 1];
            const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
            const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
            let t = ((x - a[0]) * dx + (y - a[1]) * dy + (z - a[2]) * dz) / len2;
            const free = t;
            if (i > 0) t = Math.max(0, t);
            if (i + 2 < points.length) t = Math.min(1, t);
            const px = a[0] + dx * t, py = a[1] + dy * t, pz = a[2] + dz * t;
            const d = (x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2;
            if (d < best) { best = d; at = i + (i === 0 || i + 2 === points.length ? free : t); axis = [px, py, pz]; const l = Math.sqrt(len2); dir = [dx / l, dy / l, dz / l]; }
        }
        return { s: at, axis, dir, dist: Math.sqrt(best) };
    }

    /**
     * Per pack vertex, measured once on the average body: how much it belongs
     * to each chain (from the skin weights), where it falls along each chain,
     * and its angle about the spine (0 in front, ±π behind) and about a limb.
     */
    function anatomy(pack) {
        if (pack._anatomy) return pack._anatomy;
        const built = Body.build(pack, Body.DEFAULT_RECIPE);
        const P = built.shaped, n = pack.vertexCount;
        const chains = {};
        for (const f of FAMILIES) chains[f] = chainPoints(built.bones, f);
        const familyOfBone = pack.bones.map(b => familyOf(b.name));
        const member = new Float32Array(n * 5), s = new Float32Array(n * 5), angle = new Float32Array(n * 5);
        for (let v = 0; v < n; v++) {
            for (let k = 0; k < 4; k++) member[v * 5 + familyOfBone[pack.skinJoints[v * 4 + k]]] += pack.skinWeights[v * 4 + k];
            const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
            FAMILIES.forEach((f, fi) => {
                const at = along(chains[f], x, y, z);
                // The trunk stands upright: along it, height is the measure (through its joints' heights).
                s[v * 5 + fi] = fi === 0 ? spineAt(chains.spine, y) : at.s;
                // Spine: about the vertical; a limb: about its own axis, in front where z grows.
                if (fi === 0) angle[v * 5] = Math.atan2(x - at.axis[0], z - at.axis[2]);
                else {
                    // About the limb's own axis: 0 toward the front (+z), positive toward the limb's top/outside.
                    const d = at.dir, f = [-d[2] * d[0], -d[2] * d[1], 1 - d[2] * d[2]];
                    const fl = Math.hypot(f[0], f[1], f[2]) || 1;
                    const b = [d[1] * f[2] - d[2] * f[1], d[2] * f[0] - d[0] * f[2], d[0] * f[1] - d[1] * f[0]];
                    const o = [x - at.axis[0], y - at.axis[1], z - at.axis[2]];
                    angle[v * 5 + fi] = Math.atan2((o[0] * b[0] + o[1] * b[1] + o[2] * b[2]) / fl, (o[0] * f[0] + o[1] * f[1] + o[2] * f[2]) / fl);
                }
            });
        }
        // The skirt helper: 0 at its waistband to 1 at its hem.
        const skirt = pack.helpers.skirt;
        const skirtV = new Set(skirt.source);
        let top = -Infinity, bottom = Infinity;
        for (const v of skirtV) { top = Math.max(top, P[v * 3 + 1]); bottom = Math.min(bottom, P[v * 3 + 1]); }
        const skirtU = new Float32Array(n);
        for (const v of skirtV) skirtU[v] = (top - P[v * 3 + 1]) / (top - bottom);
        // Each chain's size, for laying its surface flat: mean distance from its axis, meters per step along it.
        const radius = new Float32Array(6), unit = new Float32Array(6), counts = new Float32Array(6);
        for (let v = 0; v < n; v++) {
            let fi = 0;
            for (let k = 1; k < 5; k++) if (member[v * 5 + k] > member[v * 5 + fi]) fi = k;
            const at = along(chains[FAMILIES[fi]], P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
            radius[fi] += at.dist; counts[fi]++;
        }
        for (let fi = 0; fi < 5; fi++) {
            radius[fi] /= counts[fi] || 1;
            const pts = chains[FAMILIES[fi]];
            unit[fi] = fi === 0 ? (pts[4][1] - pts[0][1]) / 4 : Math.hypot(...[0, 1, 2].map(k => pts[2][k] - pts[1][k]));
        }
        // The skirt: as wide as the hips, its length from waistband to hem.
        radius[5] = 0.2; unit[5] = (top - bottom);
        return (pack._anatomy = { member, s, angle, skirtU, height: built.height, chains, rest: P, radius, unit });
    }

    // ── binding to the skin ───────────────────────────────────────────────
    /** A grid over points for nearest-point queries. */
    function pointGrid(P, ids, cell) {
        const map = new Map();
        const key = (x, y, z) => x + ',' + y + ',' + z;
        for (const v of ids) {
            const k = key(Math.floor(P[v * 3] / cell), Math.floor(P[v * 3 + 1] / cell), Math.floor(P[v * 3 + 2] / cell));
            let list = map.get(k);
            if (!list) map.set(k, list = []);
            list.push(v);
        }
        return {
            nearest(x, y, z, reach = 2) {
                const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
                let best = -1, bd = Infinity;
                for (let r = 1; r <= reach && best < 0; r++) {
                    for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
                        const list = map.get(key(cx + i, cy + j, cz + k));
                        if (!list) continue;
                        for (const v of list) {
                            const d = (P[v * 3] - x) ** 2 + (P[v * 3 + 1] - y) ** 2 + (P[v * 3 + 2] - z) ** 2;
                            if (d < bd) { bd = d; best = v; }
                        }
                    }
                }
                return best;
            }
        };
    }

    /** The body's triangles by pack vertex, and each vertex's triangles. */
    function bodyTriangles(pack) {
        if (pack._bodyTris) return pack._bodyTris;
        const src = pack.body.source, idx = pack.body.index;
        const tris = new Uint32Array(idx.length);
        for (let i = 0; i < idx.length; i++) tris[i] = src[idx[i]];
        const around = new Map();
        for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) {
            const v = tris[t + k];
            if (!around.has(v)) around.set(v, []);
            around.get(v).push(t);
        }
        return (pack._bodyTris = { tris, around });
    }

    /**
     * Binds a helper's vertices to the skin as MakeHuman fits clothes: each
     * rides on its nearest body triangle (barycentric weights) at a fixed
     * height along that triangle's normal, measured on the average body.
     * Laid on any body, a bound helper keeps its distance from the skin
     * however far the sliders push it.
     */
    function binding(pack, name) {
        pack._bindings = pack._bindings || {};
        if (pack._bindings[name]) return pack._bindings[name];
        const an = anatomy(pack), R = an.rest;
        const { tris, around } = bodyTriangles(pack);
        const grid = pointGrid(R, new Set(pack.body.source), 0.03);
        const ids = [...new Set(pack.helpers[name].source)];
        const out = { ids, tri: new Uint32Array(ids.length * 3), bary: new Float32Array(ids.length * 3), height: new Float32Array(ids.length) };
        ids.forEach((v, i) => {
            const x = [R[v * 3], R[v * 3 + 1], R[v * 3 + 2]];
            const near = grid.nearest(x[0], x[1], x[2], 4);
            let best = null;
            for (const t of around.get(near) || []) {
                const hit = projectOnTriangle(R, tris[t], tris[t + 1], tris[t + 2], x);
                if (!best || hit.dist < best.dist) best = Object.assign(hit, { t });
            }
            if (!best) return;
            out.tri.set([tris[best.t], tris[best.t + 1], tris[best.t + 2]], i * 3);
            out.bary.set(best.bary, i * 3);
            out.height[i] = best.height;
        });
        return (pack._bindings[name] = out);
    }

    function projectOnTriangle(P, a, b, c, x) {
        const A = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]], B = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]], C = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
        const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const nl = Math.hypot(...n) || 1e-12;
        n[0] /= nl; n[1] /= nl; n[2] /= nl;
        const w = [x[0] - A[0], x[1] - A[1], x[2] - A[2]];
        const height = w[0] * n[0] + w[1] * n[1] + w[2] * n[2];
        const q = [w[0] - n[0] * height, w[1] - n[1] * height, w[2] - n[2] * height];
        const d00 = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], d01 = u[0] * v[0] + u[1] * v[1] + u[2] * v[2], d11 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
        const d20 = q[0] * u[0] + q[1] * u[1] + q[2] * u[2], d21 = q[0] * v[0] + q[1] * v[1] + q[2] * v[2];
        const den = d00 * d11 - d01 * d01 || 1e-12;
        let bv = (d11 * d20 - d01 * d21) / den, bw = (d00 * d21 - d01 * d20) / den;
        // Clamped into the triangle: a point past an edge rides on the nearest edge.
        bv = Math.max(0, bv); bw = Math.max(0, bw);
        if (bv + bw > 1) { const k = bv + bw; bv /= k; bw /= k; }
        const bu = 1 - bv - bw;
        const px = A[0] + u[0] * bv + v[0] * bw, py = A[1] + u[1] * bv + v[1] * bw, pz = A[2] + u[2] * bv + v[2] * bw;
        return { bary: [bu, bv, bw], height, dist: Math.hypot(x[0] - px, x[1] - py, x[2] - pz) };
    }

    /** The shaped positions with a helper laid on the skin by its binding. */
    function boundPositions(pack, built, name, cache) {
        const key = 'bound:' + name;
        if (cache[key]) return cache[key];
        const P = Float32Array.from(built.shaped);
        const bind = binding(pack, name);
        bind.ids.forEach((v, i) => {
            const a = bind.tri[i * 3], b = bind.tri[i * 3 + 1], c = bind.tri[i * 3 + 2];
            if (a === b && b === c) return;
            const A = a * 3, B = b * 3, C = c * 3;
            const u = [P[B] - P[A], P[B + 1] - P[A + 1], P[B + 2] - P[A + 2]], w = [P[C] - P[A], P[C + 1] - P[A + 1], P[C + 2] - P[A + 2]];
            const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
            const nl = Math.hypot(...n) || 1;
            const [ba, bb, bc] = [bind.bary[i * 3], bind.bary[i * 3 + 1], bind.bary[i * 3 + 2]];
            for (let k = 0; k < 3; k++) P[v * 3 + k] = built.shaped[A + k] * ba + built.shaped[B + k] * bb + built.shaped[C + k] * bc + n[k] / nl * bind.height[i];
        });
        return (cache[key] = P);
    }

    /** Pushes points out of the body wherever they lie within `gap` of the skin or under it. */
    function collide(pack, built, positions, start, end, gap, cache, only, gaps) {
        if (!cache.bodyGrid) {
            cache.bodyNormals = Body.vertexNormals(pack, built.shaped);
            cache.bodyGrid = pointGrid(built.shaped, new Set(pack.body.source), 0.04);
        }
        const P = built.shaped, N = cache.bodyNormals;
        const count = only ? only.length : end - start;
        for (let n = 0; n < count; n++) {
            const i = only ? only[n] : start + n;
            const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
            const q = cache.bodyGrid.nearest(x, y, z, 2);
            if (q < 0) continue;
            const d = (x - P[q * 3]) * N[q * 3] + (y - P[q * 3 + 1]) * N[q * 3 + 1] + (z - P[q * 3 + 2]) * N[q * 3 + 2];
            const g = gaps ? gaps[i] : gap;
            if (d < g) {
                const k = g - d;
                positions[i * 3] += N[q * 3] * k; positions[i * 3 + 1] += N[q * 3 + 1] * k; positions[i * 3 + 2] += N[q * 3 + 2] * k;
            }
        }
    }

    // ── cutting ───────────────────────────────────────────────────────────
    /**
     * A garment's coverage of one vertex: positive inside, negative outside,
     * zero on the cut line, in chain units. `rules` name an interval along a
     * chain for any of spine, arms, legs ([lo, hi], or a function of the
     * vertex's angle returning one), and optionally `open` (a gap down the
     * front, in radians) and `back` (a gap behind).
     */
    function coverage(an, v, rules) {
        let c = 0;
        for (let fi = 0; fi < 5; fi++) {
            const m = an.member[v * 5 + fi];
            if (m <= 0) continue;
            const key = fi === 0 ? 'spine' : fi < 3 ? 'arms' : 'legs';
            const rule = rules[key];
            let cf = -1;
            if (rule) {
                const ang = an.angle[v * 5 + fi];
                const side = fi === 1 || fi === 3 ? 1 : -1;
                const [lo, hi] = typeof rule === 'function' ? rule(ang, side) : rule;
                const sv = an.s[v * 5 + fi];
                cf = Math.max(-1, Math.min(1, Math.min(sv - lo, hi - sv)));
            } else if(fi>=3&&rules.spine&&rules.tailoredHem) {
                // A torso hem is cut by height, including hip vertices whose
                // skin also follows a thigh. Treating every leg influence as
                // uncovered cut a deep V into the back of shirts and coats.
                const [lo,hi]=typeof rules.spine==='function'?rules.spine(an.angle[v*5],1):rules.spine;
                const sv=an.s[v*5];
                cf=Math.max(-1,Math.min(1,Math.min(sv-lo,hi-sv)));
            }
            c += m * cf;
        }
        if (rules.open) {
            const a = Math.abs(an.angle[v * 5]);
            c = Math.min(c, (a - rules.open) * 0.6);
        }
        return c;
    }

    function skinOf(pack, v) {
        return { joints: pack.skinJoints.subarray(v * 4, v * 4 + 4), weights: pack.skinWeights.subarray(v * 4, v * 4 + 4) };
    }

    /** Two skins mixed (a vertex on an edge): the four strongest influences of both. */
    function mixSkin(pack, a, b, t) {
        const m = new Map();
        for (const [v, w] of [[a, 1 - t], [b, t]]) for (let k = 0; k < 4; k++) {
            const j = pack.skinJoints[v * 4 + k], x = pack.skinWeights[v * 4 + k] * w;
            if (x > 0) m.set(j, (m.get(j) || 0) + x);
        }
        const top = [...m.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
        const total = top.reduce((sum, e) => sum + e[1], 0) || 1;
        const joints = new Uint8Array(4), weights = new Float32Array(4);
        top.forEach(([j, w], k) => { joints[k] = j; weights[k] = w / total; });
        return { joints, weights };
    }

    /**
     * A piece vertex's pack vertices and their weights: two for a vertex of
     * the cut ({a, b, t}), up to three (`w`) for one added inside a cut
     * triangle where the cloth is refined for its folds.
     */
    const weightsOf = vert => vert.w || (vert.t === 0 || vert.a === vert.b ? [[vert.a, 1]] : [[vert.a, 1 - vert.t], [vert.b, vert.t]]);

    /** The skin of a weighted piece vertex: the four strongest influences of its pack vertices. */
    function mixSkinWeighted(pack, list) {
        if (list.length === 1) return skinOf(pack, list[0][0]);
        if (list.length === 2) return mixSkin(pack, list[0][0], list[1][0], list[1][1] / (list[0][1] + list[1][1]));
        const m = new Map();
        for (const [v, w] of list) for (let k = 0; k < 4; k++) {
            const j = pack.skinJoints[v * 4 + k], x = pack.skinWeights[v * 4 + k] * w;
            if (x > 0) m.set(j, (m.get(j) || 0) + x);
        }
        const top = [...m.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
        const total = top.reduce((sum, e) => sum + e[1], 0) || 1;
        const joints = new Uint8Array(4), weights = new Float32Array(4);
        top.forEach(([j, w], k) => { joints[k] = j; weights[k] = w / total; });
        return { joints, weights };
    }

    /** The point halfway between two piece vertices, as at most three weighted pack vertices ({a, b, t} kept for older readers). */
    function midVert(p, q) {
        const m = new Map();
        for (const [v, w] of weightsOf(p)) m.set(v, (m.get(v) || 0) + w * 0.5);
        for (const [v, w] of weightsOf(q)) m.set(v, (m.get(v) || 0) + w * 0.5);
        const list = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3), total = list.reduce((s, e) => s + e[1], 0) || 1;
        for (const e of list) e[1] /= total;
        const [a, wa] = list[0], [b, wb] = list[1] || [list[0][0], 0];
        return { a, b, t: wb / (wa + wb || 1), w: list };
    }

    /**
     * Cloth refined only where it folds: every edge of a triangle in a fold
     * zone longer than `limit(zone)` (meters on the average body) is split at
     * its middle, its neighbors split to match (no cracks), until none is.
     * Elsewhere the cut keeps the helper's own resolution.
     */
    function refine(piece, an, zoneOf, limitOf, passes) {
        const rest = vert => { const out = [0, 0, 0]; for (const [v, w] of weightsOf(vert)) for (let k = 0; k < 3; k++) out[k] += an.rest[v * 3 + k] * w; return out; };
        for (let pass = 0; pass < passes; pass++) {
            const n = piece.verts.length, pts = piece.verts.map(rest), zone = piece.verts.map((v, i) => zoneOf(v, pts[i]));
            const I = piece.index, marked = new Map(), key = (a, b) => (a < b ? a * n + b : b * n + a);
            for (let t = 0; t < I.length; t += 3) {
                const c = [I[t], I[t + 1], I[t + 2]], z = Math.max(zone[c[0]], zone[c[1]], zone[c[2]]);
                if (z <= 0.25) continue;
                const limit = limitOf(z);
                for (let k = 0; k < 3; k++) {
                    const a = c[k], b = c[(k + 1) % 3], A = pts[a], B = pts[b];
                    if (Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) > limit) marked.set(key(a, b), -1);
                }
            }
            if (!marked.size) return;
            const uvs = Array.from(piece.uvs), vals = Array.from(piece.vals);
            const mid = (a, b) => {
                const k = key(a, b);
                let m = marked.get(k);
                if (m === undefined) return -1;
                if (m >= 0) return m;
                m = piece.verts.length;
                piece.verts.push(midVert(piece.verts[a], piece.verts[b]));
                uvs.push((uvs[a * 2] + uvs[b * 2]) / 2, (uvs[a * 2 + 1] + uvs[b * 2 + 1]) / 2);
                vals.push((vals[a] + vals[b]) / 2);
                marked.set(k, m);
                return m;
            };
            const out = [];
            const d2 = (a, b) => { const A = pts[a] || rest(piece.verts[a]), B = pts[b] || rest(piece.verts[b]); return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2; };
            for (let t = 0; t < I.length; t += 3) {
                const c = [I[t], I[t + 1], I[t + 2]], m = [mid(c[0], c[1]), mid(c[1], c[2]), mid(c[2], c[0])], count = m.filter(x => x >= 0).length;
                if (!count) { out.push(...c); continue; }
                if (count === 3) { out.push(c[0], m[0], m[2], m[0], c[1], m[1], m[2], m[1], c[2], m[0], m[1], m[2]); continue; }
                // Turn the triangle so its first split edge leads (corners a, b, c; the edge a→b split at m).
                let r = m.findIndex(x => x >= 0);
                if (count === 2 && m[(r + 2) % 3] >= 0) r = (r + 2) % 3;
                const a = c[r], b = c[(r + 1) % 3], cc = c[(r + 2) % 3], ab = m[r], bc = m[(r + 1) % 3];
                if (count === 1) { out.push(a, ab, cc, ab, b, cc); continue; }
                // Two split edges (a→b, b→c): the corner at b, and the rest split along its shorter diagonal.
                out.push(ab, b, bc);
                if (d2(a, bc) < d2(ab, cc)) out.push(a, ab, bc, a, bc, cc); else out.push(a, ab, cc, ab, bc, cc);
            }
            piece.index = Uint32Array.from(out);
            piece.uvs = Float32Array.from(uvs);
            piece.vals = Float32Array.from(vals);
        }
    }

    /**
     * The piece of a surface ({source, uv, index}) where `value` (per pack
     * vertex) is at least zero, its triangles clipped exactly along the zero
     * line. Returns vertices as pack-vertex pairs {a, b, t} with uvs, the
     * triangle list and the value at each vertex.
     */
    function cut(surface, value) {
        const verts = [], uvs = [], vals = [], index = [];
        const keyOf = new Map();
        const at = (ra, rb, t) => {
            // ra, rb: render-vertex ids of the surface. Keyed by the pack vertices, so a uv seam stays closed.
            if (t <= 0 || ra === rb) t = 0;
            if (t >= 1) { const x = ra; ra = rb; rb = x; t = 0; }
            const pa = surface.source[ra], pb = surface.source[rb];
            const key = t === 0 ? pa + ':' : (pa < pb ? pa + ':' + pb + ':' + t.toFixed(5) : pb + ':' + pa + ':' + (1 - t).toFixed(5));
            let i = keyOf.get(key);
            if (i !== undefined) return i;
            i = verts.length;
            keyOf.set(key, i);
            const a = surface.source[ra], b = surface.source[rb];
            verts.push({ a, b, t });
            uvs.push(surface.uv[ra * 2] * (1 - t) + surface.uv[rb * 2] * t, surface.uv[ra * 2 + 1] * (1 - t) + surface.uv[rb * 2 + 1] * t);
            vals.push(value[a] * (1 - t) + value[b] * t);
            return i;
        };
        for (let f = 0; f < surface.index.length; f += 3) {
            const r = [surface.index[f], surface.index[f + 1], surface.index[f + 2]];
            const c = r.map(x => value[surface.source[x]]);
            const inside = c.map(x => x >= 0);
            const count = inside.filter(Boolean).length;
            if (count === 0) continue;
            if (count === 3) { index.push(at(r[0], r[0], 0), at(r[1], r[1], 0), at(r[2], r[2], 0)); continue; }
            // Walk the triangle's edges, keeping inside corners and the crossings (a polygon of 3 or 4).
            const poly = [];
            for (let k = 0; k < 3; k++) {
                const i = k, j = (k + 1) % 3;
                if (inside[i]) poly.push(at(r[i], r[i], 0));
                if (inside[i] !== inside[j]) poly.push(at(r[i], r[j], c[i] / (c[i] - c[j])));
            }
            for (let k = 1; k + 1 < poly.length; k++) index.push(poly[0], poly[k], poly[k + 1]);
        }
        return { verts, uvs: Float32Array.from(uvs), vals: Float32Array.from(vals), index: Uint32Array.from(index) };
    }

    /** Each piece vertex's neighbors in the piece. */
    function pieceNeighbors(count, index) {
        const sets = Array.from({ length: count }, () => new Set());
        for (let t = 0; t < index.length; t += 3) {
            const a = index[t], b = index[t + 1], c = index[t + 2];
            sets[a].add(b).add(c); sets[b].add(a).add(c); sets[c].add(a).add(b);
        }
        return sets.map(s => [...s]);
    }

    /** Edges used by one triangle only: the piece's open border, as [a, b] in winding order. */
    function borderEdges(index) {
        const count = new Map();
        for (let t = 0; t < index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = index[t + k], b = index[t + (k + 1) % 3];
            const key = a < b ? a + ',' + b : b + ',' + a;
            const e = count.get(key);
            if (e) e.n++; else count.set(key, { n: 1, a, b });
        }
        return [...count.values()].filter(e => e.n === 1).map(e => [e.a, e.b]);
    }

    /** Relaxes a per-pack-vertex scalar over the given surface's faces. */
    function relaxScalar(surface, value, passes, count) {
        const sets = new Map();
        for (let t = 0; t < surface.index.length; t += 3) {
            const v = [surface.source[surface.index[t]], surface.source[surface.index[t + 1]], surface.source[surface.index[t + 2]]];
            for (let k = 0; k < 3; k++) {
                if (!sets.has(v[k])) sets.set(v[k], new Set());
                sets.get(v[k]).add(v[(k + 1) % 3]).add(v[(k + 2) % 3]);
            }
        }
        const list = [...sets.entries()].map(([v, s]) => [v, [...s]]);
        let a = value, b = Float32Array.from(value);
        for (let p = 0; p < passes; p++) {
            for (const [v, near] of list) {
                let sum = 0;
                for (const u of near) sum += a[u];
                b[v] = 0.5 * a[v] + 0.5 * sum / near.length;
            }
            const x = a; a = b; b = x;
        }
        return a;
    }

    // ── garments ──────────────────────────────────────────────────────────
    /**
     * A garment's cut is worked out once for its settings and kept: the
     * pack's anatomy is measured on the average body, so the same cut fits
     * every recipe.
     */
    function cutFor(pack, spec) {
        pack._cuts = pack._cuts || new Map();
        const key = JSON.stringify(spec.cutKey);
        if (pack._cuts.has(key)) return pack._cuts.get(key);
        const an = anatomy(pack);
        const surface = pack.helpers[spec.surface] || pack.body;
        const value = new Float32Array(pack.vertexCount).fill(-1);
        const used = new Set(surface.source);
        for (const v of used) value[v] = spec.value ? spec.value(an, v) : coverage(an, v, spec.rules);
        const smooth = relaxScalar(surface, value, spec.smoothCut ?? 3);
        const piece = cut(surface, smooth);
        if (spec.surface === 'skirt' && !an.skirtAxis) {
            const ids = [...new Set(pack.helpers.skirt.source)];
            an.skirtAxis = [0, 2].map(k => ids.reduce((sum, v) => sum + an.rest[v * 3 + k], 0) / ids.length);
        }
        const fieldOf = vert => fieldAt(an, spec, vert);
        // Where the garment folds, its cloth is refined to carry the folds; it stays at the helper's resolution elsewhere.
        const covered = spec.covered ? vert => weightsOf(vert).reduce((s, [v, w]) => s + spec.covered[v] * w, 0) : null;
        const hiddenScale = vert => (covered ? 1 - smoothstep(-0.04, 0.06, covered(vert)) : 1);
        // Cloth that is draped (RRCharacterDrape) is refined wherever it is free to fold and seen; its folds are its own.
        const drapeProfile = Drape ? Drape.profile(spec) : null;
        piece.drapeProfile = drapeProfile;
        if (drapeProfile) {
            const limit = Drape.edgeLimit(drapeProfile);
            refine(piece, an, vert => Drape.zone(drapeProfile, fieldOf(vert)) * hiddenScale(vert), () => limit, drapeProfile.passes);
        } else if (spec.folds) {
            const unitOf = f => an.unit[f.fam] || 0.13;
            refine(piece, an, (vert) => {
                const f = fieldOf(vert), proxy = Math.max(0, weightsOf(vert).reduce((s, [v, w]) => s + smooth[v] * w, 0)) * unitOf(f);
                return foldAt(f, proxy, spec.folds)[0] * hiddenScale(vert);
            // A bulky suit's broader folds (`cap`) are carried by coarser faces.
            }, () => (spec.surface === 'skirt' ? 0.04 : 0.021 * Math.sqrt(spec.folds.cap ?? 1) * (1 + Math.max(0, (spec.folds.weight ?? 0.0012) - 0.0012) / 0.0023 * 0.5)), spec.folds.passes ?? (spec.surface === 'skirt' || (spec.folds.cap ?? 1) > 1 ? 1 : 2));
        }
        piece.neighbors = pieceNeighbors(piece.verts.length, piece.index);
        piece.border = borderEdges(piece.index);
        piece.onBorder = new Uint8Array(piece.verts.length);
        for (const [a, b] of piece.border) { piece.onBorder[a] = 1; piece.onBorder[b] = 1; }
        // How far each vertex lies from the cut edge, in meters over the average body: hems and trims follow it
        // as an even band, never the coarse steps of the cut value between vertices.
        {
            const R = an.rest, n = piece.verts.length;
            const at = i => { const out = [0, 0, 0]; for (const [v, w] of weightsOf(piece.verts[i])) for (let k = 0; k < 3; k++) out[k] += R[v * 3 + k] * w; return out; };
            const pts = piece.verts.map((_, i) => at(i));
            const edgeIds = [...new Set(piece.border.flat())];
            // Measured from the edge as it is laid (eased along itself), so the band runs even with the hem.
            const flat = new Float32Array(n * 3);
            pts.forEach((p, i) => flat.set(p, i * 3));
            smoothBorder(piece, flat, new Float32Array(n * 3), 8);
            pts.forEach((p, i) => { if (piece.onBorder[i]) { p[0] = flat[i * 3]; p[1] = flat[i * 3 + 1]; p[2] = flat[i * 3 + 2]; } });
            piece.edgeDist = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                let best = Infinity;
                const p = pts[i];
                for (const e of piece.border) {
                    const A = pts[e[0]], B = pts[e[1]];
                    const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1e-12;
                    const t = Math.max(0, Math.min(1, ((p[0] - A[0]) * ab[0] + (p[1] - A[1]) * ab[1] + (p[2] - A[2]) * ab[2]) / l2));
                    const d = (p[0] - A[0] - ab[0] * t) ** 2 + (p[1] - A[1] - ab[1] * t) ** 2 + (p[2] - A[2] - ab[2] * t) ** 2;
                    if (d < best) best = d;
                }
                piece.edgeDist[i] = edgeIds.length ? Math.sqrt(best) : 1;
            }
        }
        // Fields at each piece vertex, for patterns: spine/limb position and angle, blended like the vertex.
        piece.field = piece.verts.map(fieldOf);
        piece.skins = piece.verts.map(vert => mixSkinWeighted(pack, weightsOf(vert)));
        // Where a garment worn over it covers it (0 open .. 1 covered): there the drape keeps it as laid, pressed flat.
        if (drapeProfile && covered) piece.under = Float32Array.from(piece.verts, vert => 1 - hiddenScale(vert));
        // The fold field: how far the cloth stands out of (or in from) its laid surface at each vertex, in meters on
        // the average body, and where it folds at all. Nothing folds under an outer garment, where it would not be seen.
        if (spec.folds) {
            piece.fold = new Float32Array(piece.verts.length);
            piece.foldZone = new Float32Array(piece.verts.length);
            // Draped cloth makes its own folds; only a joint's compression folds (a bent elbow or knee, which a rest pose never bends) are drawn.
            const folds = drapeProfile ? Object.assign({}, spec.folds, { jointsOnly: true }) : spec.folds;
            piece.verts.forEach((vert, i) => {
                const [zone, d] = foldAt(piece.field[i], piece.edgeDist[i], folds), k = hiddenScale(vert);
                piece.fold[i] = d * k; piece.foldZone[i] = zone * k;
            });
        }
        pack._cuts.set(key, piece);
        return piece;
    }

    /** A piece vertex's field: its chain, its position along it, its angles, its reach down the skirt and its height (rest body). */
    function fieldAt(an, spec, vert) {
        const list = weightsOf(vert);
        // The family is the first pack vertex's (a cut vertex's `a`), or the heaviest one's for a refined vertex.
        const lead = vert.w ? list[0][0] : vert.a;
        let fam = 0;
        for (let fi = 1; fi < 5; fi++) if (an.member[lead * 5 + fi] > an.member[lead * 5 + fam]) fam = fi;
        const own = v => { let best = 0; for (let fi = 1; fi < 5; fi++) if (an.member[v * 5 + fi] > an.member[v * 5 + best]) best = fi; return best; };
        const sLead = an.s[lead * 5 + fam], aLead = an.angle[lead * 5 + fam];
        let s = 0, u = 0, trunk = 0, la = 0;
        const rest = [0, 0, 0];
        for (const [v, w] of list) {
            const fv = own(v);
            s += w * (fv === fam ? an.s[v * 5 + fv] : sLead);
            u += w * an.skirtU[v];
            trunk += w * an.member[v * 5];
            // The angle about the chain, carried round to the lead's side so it blends without a jump behind.
            let g = an.angle[v * 5 + fam];
            if (g - aLead > Math.PI) g -= Math.PI * 2; else if (aLead - g > Math.PI) g += Math.PI * 2;
            la += w * g;
            for (let k = 0; k < 3; k++) rest[k] += an.rest[v * 3 + k] * w;
        }
        const y = rest[1];
        const hip = an.chains.spine[0], neck = an.chains.spine[4], h = Math.max(0, Math.min(1, (y - hip[1]) / (neck[1] - hip[1])));
        const cx = spec.surface === 'skirt' ? an.skirtAxis[0] : hip[0] * (1 - h) + neck[0] * h;
        const cz = spec.surface === 'skirt' ? an.skirtAxis[1] : hip[2] * (1 - h) + neck[2] * h;
        const spineAng = Math.atan2(rest[0] - cx, rest[2] - cz);
        return { fam, s, ang: aLead, la, spineAng, trunk, u, y };
    }

    // ── folds ─────────────────────────────────────────────────────────────
    /**
     * Folds a garment makes standing in its rest pose, from where it lies on
     * the body (`f`, a piece vertex's field) and how far it is from its cut
     * edge (`edge`, meters). `F`: { role ('top', 'bottom', 'one' for an
     * all-in-one, 'skirt'), fit (0 tight .. 1 loose), flare, seed, amp }.
     * Returns [zone, displacement]: where it folds at all (0..1) and how far
     * the cloth stands out there (meters on a 1.7 m body, out from the body;
     * a valley goes in). Folds that sit between two layers (compression at
     * the elbow and knee, stacking over a cuff or a hem, drag from the armpit
     * and the crotch, gathers under a waistband) stay within the 3.5 mm
     * between layers; the flutes of a hanging skirt grow with its hang.
     */
    const FOLD_GAP = 0.0035;
    function foldAt(f, edge, F) {
        const fit = Math.max(0, Math.min(1, F.fit ?? 0.3)), ph = (F.seed || 0) * 2.39996;
        // A fold stands out as a rounded ridge between broad valleys at the cloth's own height.
        const ridge = x => { const s = 0.5 + 0.5 * Math.sin(x); return s * s * (3 - 2 * s); };
        const gauss = (x, w) => Math.exp(-(x / w) * (x / w));
        // An outermost bulky suit (`cap` > 1) has room for deeper folds: nothing is worn over it there.
        const A = FOLD_GAP * Math.min(F.cap ?? 1, (0.4 + 0.6 * fit) * (F.amp ?? 1) * (F.cap ?? 1));
        // Clean at the very edge: a hem is pressed flat.
        const atEdge = smoothstep(0.003, 0.016, edge);
        // `zone`: where the cloth needs finer faces to carry its folds. Broad folds (vertical drape,
        // waistband gathers, a skirt's upper flutes) are carried by the helper's own faces.
        // Small folds (a close fit) are carried by the helper's own faces: no refinement for them.
        const worth = smoothstep(0.0015, 0.0028, A);
        let zone = 0, d = 0;
        const add = (z, amount) => { zone = Math.max(zone, z * worth); d += amount; };
        // Heavier cloth (`weight`, its thickness) and a bulky suit fold in broader folds.
        const la = f.la ?? f.ang, wide = Math.sqrt(F.cap ?? 1) * (1 + Math.max(0, (F.weight ?? 0.0012) - 0.0012) / 0.0023 * 0.5);
        // Draped cloth (RRCharacterDrape) hangs, stacks and drags by itself: only a joint's compression is left to draw.
        if (F.jointsOnly) {
            if (F.bellows) return [0, 0];
            if (f.fam === 1 || f.fam === 2) {
                const E = gauss(f.s - 2.0, 0.22), crook = 0.3 + 0.7 * Math.max(0, Math.cos(la));
                add(E * crook, A * 0.7 * E * crook * ridge(2 * Math.PI * (f.s - 2.0) / (0.19 * wide) + 2.1 * Math.sin(la) + ph + 0.7 * Math.sin(2 * la - ph)));
            } else if (f.fam === 3 || f.fam === 4) {
                const E = gauss(f.s - 1.0, 0.16), back = 0.2 + 0.8 * Math.max(0, -Math.cos(la));
                add(E * back, A * 0.7 * E * back * ridge(2 * Math.PI * (f.s - 1.0) / (0.12 * wide) + 1.6 * Math.sin(la) + ph));
            }
            return [zone, d * atEdge];
        }
        if (F.role === 'skirt') {
            // Gravity flutes: a few broad hanging folds round the skirt, deeper and fewer with more flare,
            // growing with the reach down it, each a little different (seeded).
            const flare = Math.max(0, Math.min(1.2, F.flare ?? 0.3)), u = Math.max(0, f.u);
            const K = Math.round(7 + 7 * Math.min(1, flare)), hang = smoothstep(0.12, 0.6, u) * (0.45 + 0.55 * Math.min(1, u));
            // (Kept shallow enough that a skirt rolled under the body in a motion stays out of the floor.)
            const depth = Math.min(0.02, (0.004 + 0.018 * flare / 1.2) * (F.amp ?? 1));
            const a = f.spineAng, phase = K * a + ph + 0.8 * Math.sin(2 * a + ph * 1.3) + 0.35 * Math.sin(5 * u + 3 * a);
            const lobe = 0.3 + 0.7 * Math.cos(phase);
            zone = hang * smoothstep(0.1, 0.5, flare);
            d = depth * hang * lobe * (0.75 + 0.25 * Math.sin(3 * a - ph));
            return [zone, d];
        }
        if (f.fam === 1 || f.fam === 2) {
            // The elbow: diagonal compression folds, deepest in its crook (in front, the arm hanging).
            // (A pressure suit's elbow has formed bellows rings instead: RRCharacterGarmentDetails.)
            const E = F.bellows ? 0 : gauss(f.s - 2.0, 0.22), crook = 0.3 + 0.7 * Math.max(0, Math.cos(la));
            add(E * crook, A * E * crook * ridge(2 * Math.PI * (f.s - 2.0) / (0.19 * wide) + 2.1 * Math.sin(la) + ph + 0.7 * Math.sin(2 * la - ph)));
            // A long sleeve stacks above its cuff in rings.
            if (f.s > 2.4) {
                const S = smoothstep(2.4, 2.7, f.s) * (1 - smoothstep(0.045, 0.09, edge));
                add(S, A * 0.9 * S * ridge(2 * Math.PI * f.s / (0.16 * wide) + 0.9 * Math.sin(2 * la + ph) + 0.5 * Math.sin(3 * la - ph)));
            }
            // Drag from the armpit down the inside of the upper sleeve.
            const D = gauss(f.s - 1.15, 0.2) * Math.max(0, -Math.sin(la)) ** 2 * (F.role === 'top' || F.role === 'one' ? 1 : 0);
            add(D * 0.7, A * 0.6 * D * ridge(2 * Math.PI * (f.s * 0.8 - la * 0.25) / (0.17 * wide) + ph));
        } else if (f.fam === 3 || f.fam === 4) {
            // Behind the knee: compression folds; over the kneecap the cloth is stretched smooth.
            const E = F.bellows ? 0 : gauss(f.s - 1.0, 0.16), back = 0.2 + 0.8 * Math.max(0, -Math.cos(la));
            add(E * back, A * E * back * ridge(2 * Math.PI * (f.s - 1.0) / (0.12 * wide) + 1.6 * Math.sin(la) + ph));
            // Drag folds fanning from the crotch over the front of the thigh.
            const W = gauss(f.s - 0.2, 0.12) * Math.max(0, Math.cos(la)) ** 1.5;
            add(W, A * 0.8 * W * ridge(2 * Math.PI * (f.s + 0.32 * la) / (0.13 * wide) + ph));
            // A full-length leg stacks above its hem.
            if (f.s > 1.55) {
                const S = smoothstep(1.55, 1.8, f.s) * (1 - smoothstep(0.06, 0.11, edge));
                add(S, A * S * ridge(2 * Math.PI * f.s / (0.12 * wide) + 1.1 * Math.sin(2 * la + ph) + 0.6 * Math.sin(3 * la - ph)));
            }
        } else {
            const a = f.spineAng, side = Math.abs(a);
            if (F.role === 'bottom') {
                // Small gathers just under a waistband.
                const G = (1 - smoothstep(0.03, 0.07, edge)) * (f.s > 0.2 ? 1 : 0);
                add(0, A * 0.5 * G * ridge(9 * a + ph + 0.5 * Math.sin(3 * a)));
            } else {
                // Drag from each armpit toward the middle of the chest.
                if (F.sleeves && Math.cos(a) > -0.2) {
                    // Short folds radiating from the armpit, steeply down toward the middle.
                    const D = gauss(f.s - 2.8, 0.22) * gauss(side - 1.38, 0.2) * smoothstep(-0.2, 0.3, Math.cos(a));
                    add(D * 0.8, A * 0.6 * D * ridge(2 * Math.PI * ((f.s - 3) * 0.45 - (side - 1.5) * 1.1) / (0.32 * wide) + ph));
                }
                // A loose top hangs in soft vertical folds below the chest and the shoulder blades.
                const V = smoothstep(0.4, 0.85, fit) * smoothstep(0.0, 0.7, f.s) * (1 - smoothstep(1.9, 2.5, f.s));
                add(0, A * 0.85 * V * ridge(7 * a + ph + 0.6 * Math.sin(f.s * 2.2 + ph) + 0.4 * Math.sin(3 * a - ph)));
            }
        }
        return [zone, d * atEdge];
    }

    /** Smooth normals of a surface's pack vertices, from the shaped positions. */
    function surfaceNormals(surface, P, count) {
        const n = new Float32Array(count * 3);
        for (let t = 0; t < surface.index.length; t += 3) {
            const a = surface.source[surface.index[t]] * 3, b = surface.source[surface.index[t + 1]] * 3, c = surface.source[surface.index[t + 2]] * 3;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
            const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const s of [a, b, c]) { n[s] += nx; n[s + 1] += ny; n[s + 2] += nz; }
        }
        for (let i = 0; i < n.length; i += 3) {
            const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
            if (l > 0) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
        }
        return n;
    }

    function triangleNormals(positions, index) {
        const n = new Float32Array(positions.length);
        for (let t = 0; t < index.length; t += 3) {
            const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
            const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
            const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const s of [a, b, c]) { n[s] += nx; n[s + 1] += ny; n[s + 2] += nz; }
        }
        for (let i = 0; i < n.length; i += 3) {
            const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
            n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
        }
        return n;
    }

    /**
     * Lays a cut piece on a shaped body: lifted by `lift` meters, draped by
     * `drape` smoothing passes (held at least `lift` off the body), flared
     * (`flare(field)` adds meters straight out from the body's axis), with a
     * rim along its border folding back to the body so the cut edge has a
     * thickness. Returns {positions, normals, uvs, index, joints, weights, field, border}.
     */
    function lay(pack, built, piece, spec, cache) {
        cache.normals = cache.normals || {};
        const bound = spec.surface === 'tights';
        let P = bound ? boundPositions(pack, built, 'tights', cache) : built.shaped;
        if (spec.surface === 'skirt') {
            if (!cache.skirtPositions) {
                const fitted = boundPositions(pack, built, 'skirt', cache), an = anatomy(pack);
                cache.skirtPositions = Float32Array.from(P);
                // Seat the waistband on the same skin as the bodice. Let the
                // lower fabric hang from the helper instead of following legs.
                for (const v of new Set(pack.helpers.skirt.source)) {
                    const blend = 1 - smoothstep(0.03, 0.28, an.skirtU[v]);
                    for (let k = 0; k < 3; k++) cache.skirtPositions[v * 3 + k] += (fitted[v * 3 + k] - P[v * 3 + k]) * blend;
                    // A small overlap remains under the bodice even when a
                    // compact torso compresses its last row of cloth faces.
                    cache.skirtPositions[v * 3 + 1] += built.height * .012 * (1 - smoothstep(.03,.12,an.skirtU[v]));
                }
            }
            P = cache.skirtPositions;
        }
        const count = piece.verts.length;
        const fittedLower=spec.surface==='body'&&(spec.lining||spec.rules?.legs&&Array.isArray(spec.rules.spine)&&spec.rules.spine[1]<2);
        const surface = pack.helpers[spec.surface] || pack.body;
        const sn = cache.normals[spec.surface] || (cache.normals[spec.surface] = surfaceNormals(surface, P, pack.vertexCount));
        const base = new Float32Array(count * 3), normal = new Float32Array(count * 3);
        piece.verts.forEach((vert, i) => {
            for (const [v, w] of weightsOf(vert)) for (let k = 0; k < 3; k++) {
                base[i * 3 + k] += P[v * 3 + k] * w;
                normal[i * 3 + k] += sn[v * 3 + k] * w;
            }
            const l = Math.hypot(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]) || 1;
            normal[i * 3] /= l; normal[i * 3 + 1] /= l; normal[i * 3 + 2] /= l;
        });
        const lift = spec.lift ?? 0.006;
        let pos = new Float32Array(count * 3);
        const stand = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            const extra = spec.liftAt ? spec.liftAt(piece.field[i], piece.vals[i]) : 0;
            stand[i] = Math.max(0.002, lift + extra);
            for (let k = 0; k < 3; k++) pos[i * 3 + k] = base[i * 3 + k] + normal[i * 3 + k] * stand[i];
        }
        const nativePositions=spec.surface==='body'?Float32Array.from(pos):null;
        if (spec.flare) {
            const hips = built.bones.find(b => b.name === 'Hips').head;
            for (let i = 0; i < count; i++) {
                const amount = spec.flare(piece.field[i]);
                if (!amount) continue;
                const dx = pos[i * 3] - hips[0], dz = pos[i * 3 + 2] - hips[2];
                const l = Math.hypot(dx, dz) || 1;
                pos[i * 3] += dx / l * amount; pos[i * 3 + 2] += dz / l * amount;
            }
        }
        // Drape: smooth, then push back out wherever the smoothing sank into the body.
        const passes = spec.drape ?? 0;
        if (passes > 0) {
            let next = new Float32Array(pos.length);
            const N = piece.neighbors;
            // The edge keeps its outline: its vertices follow the smoothing only straight out from the body,
            // never in across the piece (which frays a hem into a sawtooth).
            const edge = piece.onBorder;
            for (let p = 0; p < passes; p++) {
                for (let i = 0; i < count; i++) {
                    if(fittedLower||spec.surface==='body'&&spec.rules?.legs&&piece.field[i].y<anatomy(pack).chains.spine[0][1]+.05){
                        next.set(pos.subarray(i*3,i*3+3),i*3);continue;
                    }
                    const near = N[i];
                    if (!near.length) { next[i * 3] = pos[i * 3]; next[i * 3 + 1] = pos[i * 3 + 1]; next[i * 3 + 2] = pos[i * 3 + 2]; continue; }
                    let x = 0, y = 0, z = 0;
                    for (const j of near) { x += pos[j * 3]; y += pos[j * 3 + 1]; z += pos[j * 3 + 2]; }
                    const k = 1 / near.length;
                    next[i * 3] = 0.5 * pos[i * 3] + 0.5 * x * k;
                    next[i * 3 + 1] = 0.5 * pos[i * 3 + 1] + 0.5 * y * k;
                    next[i * 3 + 2] = 0.5 * pos[i * 3 + 2] + 0.5 * z * k;
                    if (edge[i]) {
                        const mx = next[i * 3] - pos[i * 3], my = next[i * 3 + 1] - pos[i * 3 + 1], mz = next[i * 3 + 2] - pos[i * 3 + 2];
                        const along = mx * normal[i * 3] + my * normal[i * 3 + 1] + mz * normal[i * 3 + 2];
                        next[i * 3] = pos[i * 3] + normal[i * 3] * along; next[i * 3 + 1] = pos[i * 3 + 1] + normal[i * 3 + 1] * along; next[i * 3 + 2] = pos[i * 3 + 2] + normal[i * 3 + 2] * along;
                    }
                    // Never closer to the body than its lift (where it is lifted less, as little).
                    const ox = next[i * 3] - base[i * 3], oy = next[i * 3 + 1] - base[i * 3 + 1], oz = next[i * 3 + 2] - base[i * 3 + 2];
                    const d = ox * normal[i * 3] + oy * normal[i * 3 + 1] + oz * normal[i * 3 + 2];
                    const least = Math.min(lift, stand[i]) * 0.85;
                    if (d < least) {
                        const push = least - d;
                        next[i * 3] += normal[i * 3] * push; next[i * 3 + 1] += normal[i * 3 + 1] * push; next[i * 3 + 2] += normal[i * 3 + 2] * push;
                    }
                }
                const x = pos; pos = next; next = x;
            }
        }
        // The cut edge eased along itself, so a hem or a cuff runs smooth rather than stepping with the mesh under it.
        // Hard plates and open fronts run straightest.
        smoothBorder(piece, pos, base, fittedLower?0:spec.edgeSmooth ?? (spec.hard || (spec.rules && spec.rules.open) ? 16 : 8), null, !spec.hard);
        // Ease: a loose sleeve rests on the top of the arm and hangs below it; trouser legs and long sleeves fall
        // straight from the knee and the elbow; a loose top hangs from the chest and the shoulder blades.
        if (spec.hang && !spec.closeFit) hangCloth(pack, built, piece, spec, pos, base, normal);
        // The folds, out along the body's normal; a valley never sinks the cloth onto the skin.
        if (piece.fold) {
            const scale = built.height / 1.7;
            for (let i = 0; i < count; i++) {
                let d = piece.fold[i] * scale;
                if (!d) continue;
                if (d < 0) {
                    const off = (pos[i * 3] - base[i * 3]) * normal[i * 3] + (pos[i * 3 + 1] - base[i * 3 + 1]) * normal[i * 3 + 1] + (pos[i * 3 + 2] - base[i * 3 + 2]) * normal[i * 3 + 2];
                    d = Math.max(d, Math.min(0, -(off - 0.003 * scale)));
                }
                for (let k = 0; k < 3; k++) pos[i * 3 + k] += normal[i * 3 + k] * d;
            }
        }
        // Whatever still lies in the skin (a slider pushed past what the helper follows) is lifted out.
        if (spec.collide !== false) collide(pack, built, pos, 0, count, lift * 0.7, cache, null, spec.liftAt ? Float32Array.from(stand, x => Math.min(lift, x) * 0.7) : null);
        // Close-fitting swimwear and short tops (a bra, a crop top, ending above the waist) keep the skin's own shape.
        // Torso enclosure and tailoring re-seat rows by bearing: they lifted a bra's lower edge off a full bust and
        // stood a bikini bottom out over a hanging belly, uncovering what it is worn to cover.
        let lowest = Infinity;
        if (spec.surface === 'body') for (const f of piece.field) lowest = Math.min(lowest, f.y);
        const spine = anatomy(pack).chains.spine, skinTight = spec.closeFit || spec.surface === 'body' && lowest > spine[0][1] + (spine[4][1] - spine[0][1]) * 0.4;
        if (spec.collide !== false && !spec.hard && !fittedLower && !skinTight && ['body','tights','skirt'].includes(spec.surface)) {
            encloseTrunk(pack, built, pos, base, piece.field, lift, cache, spec);
            const reference = pack._tailorReference || (pack._tailorReference = Body.build(pack, Body.DEFAULT_RECIPE));
            const previous = Float32Array.from(pos);
            if (tailorTorso(pack, built, reference, () => {
                const rest=Float32Array.from(lay(pack,reference,piece,spec,{noDrape:true}).positions.subarray(0,count*3));
                for(let i=0;i<count;i++)rest[i*3+1]=piece.field[i].y;
                return rest;
            }, pos, cache,
                {source:piece.verts.map(p=>p.a),hanging:()=>spec.surface==='skirt',nativePositions,legged:spec.rules?.legs?'skin':false,bearing:spec.surface==='skirt'?i=>piece.field[i].spineAng:null})) {
                for(let k=0;k<base.length;k++)base[k]+=pos[k]-previous[k];
                if(spec.surface==='skirt')encloseTrunk(pack,built,pos,base,piece.field,lift,cache,{...spec,keepTailorHeight:true});
            }
        }
        if(cache.tailorNeeded&&!spec.hard&&spec.surface!=='skirt'){
            const neck=anatomy(pack).chains.spine[4][1];
            smoothBorder(piece,pos,base,6,v=>piece.field[v].fam===0&&piece.field[v].y>neck-.12);
        }
        // Let go as cloth (RRCharacterDrape): eased, held where it is held, settled under gravity on the body and
        // on the layers laid before it. The hem below is turned from the draped edge.
        const draped = Drape && !cache.noDrape && piece.drapeProfile && spec.drapeCloth !== false ? Drape.drape({ pack, built, piece, spec, pos, base, frame: cache, quality: cache.quality,
            chains: { 1: chainPoints(built.bones, 'armL'), 2: chainPoints(built.bones, 'armR'), 3: chainPoints(built.bones, 'legL'), 4: chainPoints(built.bones, 'legR') } }) : null;
        // The hem: the cloth turned under at its cut edge. From the outer face it rolls round the edge
        // (a rounded fold as thick as the fabric) and comes back as a facing under it, a finger's width in.
        // Rows of new vertices follow each border vertex: the roll, then the facing's end.
        const index = Array.from(piece.index);
        const positions = Array.from(pos), uvs = Array.from(piece.uvs);
        const fields = piece.field.slice(), skins = piece.skins.slice(), vals = Array.from(piece.vals);
        const origin = piece.verts.map((_, i) => i);
        const rowOf = new Map();
        let hemTurn = 0;
        if (spec.rim !== false && piece.border.length) {
            const hem = hemRows(built, piece, spec, pos, base);
            hemTurn = hem.turn;
            for (const [i, rows] of hem.rows) {
                const ids = [i];
                rows.forEach((p, r) => {
                    ids.push(positions.length / 3);
                    origin.push(i);
                    positions.push(p[0], p[1], p[2]);
                    uvs.push(piece.uvs[i * 2], piece.uvs[i * 2 + 1]);
                    fields.push(piece.field[i]); skins.push(piece.skins[i]);
                    // The roll shows the outer face; past its turn, the facing's side toward the body.
                    vals.push(r < hem.turn ? 0 : -1);
                });
                rowOf.set(i, ids);
            }
            for (const [a, b] of piece.border) {
                const A = rowOf.get(a), B = rowOf.get(b);
                // Border edge a→b runs with its triangle; each strip continues the outer face round the edge.
                for (let r = 0; r + 1 < A.length; r++) index.push(B[r], A[r], A[r + 1], B[r], A[r + 1], B[r + 1]);
            }
        }
        const out = Float32Array.from(positions);
        // The rim folds back to the body, never into it (a helper a slider pushed under the skin).
        if (spec.collide !== false && out.length / 3 > count) collide(pack, built, out, count, out.length / 3, 0.001, cache);
        if(!spec.hard)for(let v=count;v<origin.length;v++){
            const source=origin[v]*3,o=v*3,d=Math.hypot(out[o]-out[source],out[o+1]-out[source+1],out[o+2]-out[source+2]),limit=.006*built.height/1.7;
            // A nearest-skin query can jump across a crease at an extreme.
            // Keep the returned edge attached to its own cloth after that query.
            if(d>.04*built.height/1.7)for(let k=0;k<3;k++)out[o+k]=out[source+k]+(out[o+k]-out[source+k])*limit/d;
        }
        const joints = new Uint8Array(skins.length * 4), weights = new Float32Array(skins.length * 4);
        skins.forEach((s, i) => { joints.set(s.joints, i * 4); weights.set(s.weights, i * 4); });
        const edge = new Float32Array(out.length / 3);
        edge.set(piece.edgeDist || []);
        const laid = { positions: out, normals: triangleNormals(out, index), uvs: Float32Array.from(uvs), index: Uint32Array.from(index), joints, weights, field: fields, vals: Float32Array.from(vals), edge, base, rimStart: count, origin: Int32Array.from(origin), piece, hem: Object.assign({ rows: rowOf, turn: hemTurn }, hemThickness(built, spec)), draped };
        // Pieces laid after it (outer layers) drape over it.
        if (Drape && !cache.noDrape && spec.collide !== false) Drape.remember(cache, laid, spec);
        return laid;
    }

    /** A soft garment's turned hem: the fabric's thickness and how far its facing reaches in (meters on this body). */
    function hemThickness(built, spec) {
        const scale = built.height / 1.7, hem = spec.hem || {};
        return { thickness: Math.max(0.0006, hem.thickness ?? 0.0012) * scale, facing: Math.max(0, hem.facing ?? 0.012) * scale };
    }

    /**
     * The turned hem at each border vertex of a laid piece: points round the
     * edge (a rounded roll as thick as the fabric, from the outer face to
     * just under it), then where the facing ends inside, measured toward the
     * next vertices in so it lies under the actual cloth (a chord of a
     * curved panel runs inside it, never through its face). Returns
     * { rows: Map(border vertex → [points]), turn: the first row under the edge }.
     */
    function hemRows(built, piece, spec, pos, base) {
        const { thickness: T, facing: F } = hemThickness(built, spec), R = 3;
        const N = triangleNormals(pos, piece.index);
        const outward = i => { const o = (pos[i * 3] - base[i * 3]) * N[i * 3] + (pos[i * 3 + 1] - base[i * 3 + 1]) * N[i * 3 + 1] + (pos[i * 3 + 2] - base[i * 3 + 2]) * N[i * 3 + 2]; return o < 0 ? -1 : 1; };
        const next = new Map(), prev = new Map();
        for (const [a, b] of piece.border) { next.set(a, b); prev.set(b, a); }
        const P = i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
        const rows = new Map();
        for (const i of new Set(piece.border.flat())) {
            const p = P(i), sgn = outward(i), n = [N[i * 3] * sgn, N[i * 3 + 1] * sgn, N[i * 3 + 2] * sgn];
            const a = prev.get(i) ?? i, b = next.get(i) ?? i;
            let t = [pos[b * 3] - pos[a * 3], pos[b * 3 + 1] - pos[a * 3 + 1], pos[b * 3 + 2] - pos[a * 3 + 2]];
            // Inward along the cloth: across the edge, toward the vertices inside it.
            let d = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
            const inner = piece.neighbors[i].filter(q => !piece.onBorder[q]), toward = inner.length ? inner : piece.neighbors[i];
            const q = [0, 0, 0], nq = [0, 0, 0];
            for (const j of toward) for (let k = 0; k < 3; k++) { q[k] += pos[j * 3 + k] / toward.length; nq[k] += N[j * 3 + k] * outward(j) / toward.length; }
            const into = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
            let dl = Math.hypot(...d);
            if (dl < 1e-9) { d = into.slice(); dl = Math.hypot(...d) || 1; }
            d = d.map(x => x / dl);
            if (d[0] * into[0] + d[1] * into[1] + d[2] * into[2] < 0) d = d.map(x => -x);
            const out = [];
            // The roll, round the edge from the outer face to under it.
            const c = [p[0] - n[0] * T / 2, p[1] - n[1] * T / 2, p[2] - n[2] * T / 2];
            for (let k = 1; k <= R; k++) {
                const th = k * Math.PI / R, cs = Math.cos(th) * T / 2, sn = Math.sin(th) * T / 2;
                out.push([c[0] + n[0] * cs - d[0] * sn, c[1] + n[1] * cs - d[1] * sn, c[2] + n[2] * cs - d[2] * sn]);
            }
            // The facing: under the cloth toward the next vertices in, as far as the facing reaches.
            if (F > 0) {
                const under = out[R - 1], nl = Math.hypot(...nq) || 1;
                const end = inner.length ? [q[0] - nq[0] / nl * T, q[1] - nq[1] / nl * T, q[2] - nq[2] / nl * T] : [under[0] + d[0] * F * 0.5, under[1] + d[1] * F * 0.5, under[2] + d[2] * F * 0.5];
                const span = Math.hypot(end[0] - under[0], end[1] - under[1], end[2] - under[2]), k = span > F ? F / span : 1;
                out.push([under[0] + (end[0] - under[0]) * k, under[1] + (end[1] - under[1]) * k, under[2] + (end[2] - under[2]) * k]);
            }
            rows.set(i, out);
        }
        return { rows, turn: R - 1 };
    }

    /**
     * Ease that hangs: a sleeve below the elbow and a trouser leg below the
     * knee keep the width they had at the joint (narrowing by `taper` per
     * chain step) instead of following the forearm or calf in; a loose
     * sleeve rests on the top of the arm and hangs below it; a loose top falls
     * from the chest and the shoulder blades over what lies below (no steeper
     * in than `chest.slope`). `spec.hang`: { arms, legs, sag, chest, slope,
     * armTaper, legTaper, rest } (strengths 0..1; `rest` the stand-off left on
     * top of the arm, meters on a 1.7 m body).
     */
    function hangCloth(pack, built, piece, spec, pos, base, normal) {
        const H = spec.hang, n = piece.verts.length, scale = built.height / 1.7, F = piece.field;
        const chains = { 1: chainPoints(built.bones, 'armL'), 2: chainPoints(built.bones, 'armR'), 3: chainPoints(built.bones, 'legL'), 4: chainPoints(built.bones, 'legR') };
        const axisAt = (fam, s) => {
            const c = chains[fam], i = Math.max(0, Math.min(c.length - 2, Math.floor(s))), t = s - i, a = c[i], b = c[i + 1];
            const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...dir) || 1;
            return { p: [a[0] + dir[0] * t, a[1] + dir[1] * t, a[2] + dir[2] * t], dir: dir.map(x => x / l) };
        };
        const TAU = Math.PI * 2, BINS = 16, STEP = 0.04;
        // Limbs: the laid cloth's mean radius by angle and reach, carried down from the joint.
        const limb = (fams, from, to, taper, strength) => {
            if (!(strength > 0)) return;
            const S = Math.ceil((to - from) / STEP) + 1;
            // A gathered cuff takes the sleeve back in to the wrist over its last few centimeters.
            const cuff = fams[0] < 3 ? (H.cuff ?? 0) : 0, E = piece.edgeDist;
            for (const fam of fams) {
                const ids = [], samples = [], radial = [];
                for (let i = 0; i < n; i++) {
                    if (F[i].fam !== fam || F[i].s < from - STEP || F[i].s > to) continue;
                    const ax = axisAt(fam, F[i].s), o = [pos[i * 3] - ax.p[0], pos[i * 3 + 1] - ax.p[1], pos[i * 3 + 2] - ax.p[2]];
                    const along = o[0] * ax.dir[0] + o[1] * ax.dir[1] + o[2] * ax.dir[2], r = [o[0] - ax.dir[0] * along, o[1] - ax.dir[1] * along, o[2] - ax.dir[2] * along];
                    const rl = Math.hypot(...r);
                    if (rl < 1e-6) continue;
                    ids.push(i); radial.push(r.map(x => x / rl));
                    samples.push([((((F[i].la ?? F[i].ang) / TAU) % 1) + 1) % 1 * BINS, (F[i].s - from) / STEP, rl]);
                }
                if (!ids.length) continue;
                const growth = carriedGrowth(BINS, S, samples, r => r * (1 - taper * STEP));
                ids.forEach((i, k) => {
                    if (F[i].s < from) return;
                    const gather = cuff && E ? 1 - cuff * (1 - smoothstep(0.012, 0.06, E[i])) : 1;
                    const grow = growth(samples[k][0], samples[k][1]) * strength * smoothstep(from, from + 0.15, F[i].s) * gather;
                    for (let c = 0; c < 3; c++) pos[i * 3 + c] += radial[k][c] * grow;
                });
            }
        };
        limb([1, 2], 2.0, 3.3, H.armTaper ?? 0.35, H.arms);
        limb([3, 4], 0.95, 2.2, H.legTaper ?? 0.12, H.legs);
        // A loose sleeve hangs: its cross-section drops, resting on the top of the arm.
        if (H.sag > 0) {
            const rest = (H.rest ?? 0.004) * scale;
            for (let i = 0; i < n; i++) {
                const f = F[i];
                if (f.fam !== 1 && f.fam !== 2) continue;
                const ax = axisAt(f.fam, f.s), up = [-ax.dir[0] * ax.dir[1], 1 - ax.dir[1] * ax.dir[1], -ax.dir[2] * ax.dir[1]], ul = Math.hypot(...up);
                if (ul < 0.3) continue;
                const off = (pos[i * 3] - base[i * 3]) * normal[i * 3] + (pos[i * 3 + 1] - base[i * 3 + 1]) * normal[i * 3 + 1] + (pos[i * 3 + 2] - base[i * 3 + 2]) * normal[i * 3 + 2];
                const e = Math.max(0, off - rest) * H.sag * smoothstep(0.9, 1.5, f.s);
                for (let c = 0; c < 3; c++) pos[i * 3 + c] -= up[c] / ul * e;
            }
        }
        // A loose top falls from the chest and the shoulder blades.
        if (H.chest > 0) {
            const hips = built.bones.find(b => b.name === 'Hips').head, neck = built.bones.find(b => b.name === 'Neck').head;
            const center = y => { const t = Math.max(0, Math.min(1, (y - hips[1]) / (neck[1] - hips[1]))); return [hips[0] + (neck[0] - hips[0]) * t, hips[2] + (neck[2] - hips[2]) * t]; };
            // A piece with legs (an all-in-one) hangs only down to the hips: below them the legs part.
            const legged = !!spec.rules?.legs, AB = 32, YS = 0.015 * scale, top = hips[1] + (neck[1] - hips[1]) * 0.75, low = legged ? hips[1] - 0.02 * scale : hips[1] - 0.35 * scale, Y = Math.ceil((top - low) / YS) + 1;
            const ids = [], dirs = [], samples = [];
            for (let i = 0; i < n; i++) {
                const f = F[i];
                if (f.fam !== 0 || f.trunk < 0.55) continue;
                const y = pos[i * 3 + 1];
                if (y > top + YS || y < low) continue;
                const c = center(y), dx = pos[i * 3] - c[0], dz = pos[i * 3 + 2] - c[1], r = Math.hypot(dx, dz);
                if (r < 1e-6) continue;
                ids.push(i); dirs.push([dx / r, dz / r]);
                samples.push([((Math.atan2(dx, dz) / TAU) % 1 + 1) % 1 * AB, Math.max(0, (top - y) / YS), r]);
            }
            const slope = (H.slope ?? 0.3) * YS, growth = carriedGrowth(AB, Y, samples, r => r - slope);
            // A bodice sewn to a skirt comes back in to its waist seam over its last few centimeters.
            const E = piece.edgeDist;
            ids.forEach((i, k) => {
                const y = pos[i * 3 + 1], seam = H.joined && E ? smoothstep(0.012, 0.09, E[i]) : 1;
                const grow = growth(samples[k][0], samples[k][1]) * H.chest * seam * (legged ? smoothstep(low, low + 0.08 * scale, y) : 1);
                pos[i * 3] += dirs[k][0] * grow; pos[i * 3 + 2] += dirs[k][1] * grow;
            });
        }
    }

    /**
     * How far cloth must stand out to fall from what lies above it: samples
     * [angle bin, step, radius] binned (`bins` round, `steps` down), each
     * bin's mean radius carried down the steps (never in faster than
     * `fall(r)` allows), the growth each bin needs, empty bins taking their
     * neighbors'. Returns growth(angle bin, step), eased between bins: the
     * cloth keeps its own shape within a bin and the bin moves as one.
     */
    function carriedGrowth(bins, steps, samples, fall) {
        const sum = new Float64Array(bins * steps), count = new Uint32Array(bins * steps);
        for (const [a, j, r] of samples) {
            const b = Math.round(a) % bins, k = Math.max(0, Math.min(steps - 1, Math.round(j)));
            sum[b * steps + k] += r; count[b * steps + k]++;
        }
        const grow = new Float32Array(bins * steps).fill(NaN);
        for (let b = 0; b < bins; b++) {
            let carried = -Infinity;
            for (let k = 0; k < steps; k++) {
                const o = b * steps + k, mean = count[o] ? sum[o] / count[o] : NaN;
                carried = Math.max(Number.isFinite(mean) ? mean : -Infinity, Number.isFinite(carried) ? fall(carried) : -Infinity);
                if (Number.isFinite(mean)) grow[o] = Math.max(0, carried - mean);
            }
            // Empty steps take the nearest filled one's growth.
            let last = NaN;
            for (let k = 0; k < steps; k++) { const o = b * steps + k; if (Number.isNaN(grow[o])) grow[o] = last; else last = grow[o]; }
            last = NaN;
            for (let k = steps - 1; k >= 0; k--) { const o = b * steps + k; if (Number.isNaN(grow[o])) grow[o] = last; else last = grow[o]; }
        }
        for (let o = 0; o < grow.length; o++) if (Number.isNaN(grow[o])) grow[o] = 0;
        // Eased over neighboring bins (round and down), so sparse bins never leave lumps.
        for (let pass = 0; pass < 2; pass++) {
            const next = new Float32Array(grow.length);
            for (let b = 0; b < bins; b++) for (let k = 0; k < steps; k++) {
                let s = 0, w = 0;
                for (let db = -1; db <= 1; db++) for (let dk = -1; dk <= 1; dk++) {
                    const kk = k + dk;
                    if (kk < 0 || kk >= steps) continue;
                    const q = (db === 0 ? 2 : 1) * (dk === 0 ? 2 : 1);
                    s += grow[((b + db + bins) % bins) * steps + kk] * q; w += q;
                }
                next[b * steps + k] = s / w;
            }
            grow.set(next);
        }
        return (a, j) => {
            const x = Math.max(0, Math.min(steps - 1.001, j)), k = Math.floor(x), u = x - k;
            const b0 = ((Math.floor(a) % bins) + bins) % bins, b1 = (b0 + 1) % bins, v = a - Math.floor(a);
            const g = b => grow[b * steps + k] * (1 - u) + grow[b * steps + k + 1] * u;
            return g(b0) * (1 - v) + g(b1) * v;
        };
    }

    /** Heavy body folds sit inside the cloth's smooth cross-section instead of pulling it into the crease. */
    function encloseTrunk(pack, built, positions, base, fields, lift, frame, spec) {
        const skirt = spec.surface === 'skirt';
        if (frame.trunkEnvelope === undefined) {
            const an = anatomy(pack), P = built.shaped, ids = [...new Set(pack.body.source)];
            let half = 0, front = -Infinity, back = Infinity;
            for (const v of ids) if (an.member[v * 5] > 0.9 && an.s[v * 5] > 0.4 && an.s[v * 5] < 2) {
                half = Math.max(half, Math.abs(P[v * 3])); front = Math.max(front,P[v*3+2]); back = Math.min(back,P[v*3+2]);
            }
            frame.trunkEnvelope = null;
            if (half > built.height * 0.15 || front - back > built.height * .3) {
                const bins = new Map(), step = 0.02 * built.height / 1.7;
                for (const v of ids) {
                    if (an.member[v * 5 + 1] > 0.4 || an.member[v * 5 + 2] > 0.4 || an.s[v * 5] > 3.7) continue;
                    const bin = Math.floor(P[v * 3 + 1] / step);
                    for (let k = bin - 1; k <= bin + 1; k++) { if (!bins.has(k)) bins.set(k, []); bins.get(k).push(v); }
                }
                const hips = built.bones.find(b => b.name === 'Hips').head;
                const hipBand = ids.filter(v => P[v * 3 + 1] > hips[1] * 0.65 && P[v * 3 + 1] < hips[1] * 1.15 && an.member[v * 5 + 1] < 0.4 && an.member[v * 5 + 2] < 0.4);
                frame.trunkEnvelope = { bins, step, P, hips, hipBand, neck: built.bones.find(b => b.name === 'Neck').head, restHip: an.chains.spine[0][1], restNeck: an.chains.spine[4][1] };
            }
        }
        const envelope = frame.trunkEnvelope;
        if (!envelope) return;
        const { bins, step, P, hips, hipBand, neck, restHip, restNeck } = envelope;
        // Extrapolated body targets can reverse helper rows vertically. Give
        // the free skirt a continuous hanging chart instead of preserving those
        // reversals as crossed panels. Retain the sewn top row's fitted height.
        let skirtTop=0,skirtBottom=0;
        if(skirt){
            const ids=[...new Set(pack.helpers.skirt.source)],an=anatomy(pack);
            const top=ids.filter(v=>an.skirtU[v]<.025),bottom=ids.filter(v=>an.skirtU[v]>.975);
            const fitted=boundPositions(pack,built,'skirt',frame);
            skirtTop=top.reduce((sum,v)=>sum+fitted[v*3+1],0)/top.length+built.height*.012;
            skirtBottom=bottom.reduce((sum,v)=>sum+built.shaped[v*3+1],0)/bottom.length;
            skirtBottom=Math.min(skirtBottom,skirtTop-built.height*.25);
        }
        for (let i = 0; i < fields.length; i++) {
            const field = fields[i];
            if(!skirt&&spec.rules?.legs&&field.y<restHip+.05)continue;
            if (!skirt && (field.fam === 1 || field.fam === 2 || field.y < restHip * 0.75 || field.y > restNeck - 0.03)) continue;
            const o = i * 3;
            // The fitted skin already follows each spine joint, body fold
            // and proportion slider. A single hip-to-neck height mapping
            // separated compact bodices from their skirts and raised heavy
            // waistbands. Only the free skirt rows use the hanging height chart.
            if(skirt&&!spec.keepTailorHeight){
                const blend=smoothstep(.025,.14,field.u),target=skirtTop+(skirtBottom-skirtTop)*field.u;
                const delta=(target-positions[o+1])*blend;
                positions[o+1]+=delta;base[o+1]+=delta;
            }
            const y = skirt ? positions[o + 1] : base[o + 1];
            const band = bins.get(Math.floor(y / step));
            if ((!band || band.length < 3)&&!skirt) continue;
            const t = Math.max(0, Math.min(1, (y - hips[1]) / (neck[1] - hips[1]))), cz = hips[2] * (1 - t) + neck[2] * t;
            const dx = positions[o], dz = positions[o + 2] - cz, distance = Math.hypot(dx, dz);
            if (distance < 1e-6) continue;
            const nx = Math.sin(field.spineAng), nz = Math.cos(field.spineAng);
            let support = -Infinity;
            for (const v of band||[]) support = Math.max(support, P[v * 3] * nx + (P[v * 3 + 2] - cz) * nz);
            if (skirt) {
                let hipSupport = Math.max(0,support);
                for (const v of hipBand) hipSupport = Math.max(hipSupport, P[v * 3] * nx + (P[v * 3 + 2] - cz) * nz);
                support=Number.isFinite(support)?support+(hipSupport-support)*smoothstep(.02,.32,field.u):hipSupport;
            }
            if (skirt) {
                // Enclosure is an outward constraint, not a new skirt profile.
                // Pulling a flared hem toward a partial rest-angle envelope let
                // extreme hips and seats cross its back. Query its actual height
                // and bearing, retain the existing flare, and clear the whole skin.
                const radius = Math.max(distance,support + lift * 2);
                // Keep the chart's angular order: skin collision can move
                // neighboring helper points past one another around a deep fold.
                const tx=nx*radius,tz=cz+nz*radius;
                const px=tx-positions[o],pz=tz-positions[o+2];
                positions[o]+=px;positions[o+2]+=pz;base[o]+=px;base[o+2]+=pz;
                // Keep full clearance at the newly ordered waistband too.
                const x=positions[o],z=positions[o+2]-cz,rho=Math.hypot(x,z),ax=x/rho,az=z/rho;
                let reach=0;
                for(const v of band||[])reach=Math.max(reach,P[v*3]*ax+(P[v*3+2]-cz)*az);
                const outward=Math.max(0,reach+lift*2-rho);
                positions[o]+=ax*outward;positions[o+2]+=az*outward;base[o]+=ax*outward;base[o+2]+=az*outward;
                continue;
            }
            const radius = support + lift * 2;
            const blend = skirt ? .3 + .7 * smoothstep(0.03, 0.28, field.u) : field.y < restHip + (restNeck - restHip) * 0.7 ? 1 : Math.max(0, Math.min(1, (field.trunk - 0.6) / 0.35));
            const target = [nx * radius, y, cz + nz * radius];
            for (let k = 0; k < 3; k++) {
                const delta = (target[k] - positions[o + k]) * blend;
                positions[o + k] += delta; base[o + k] += delta;
            }
        }
    }

    /** A continuous tailoring chart for bodies whose skin folds reverse helper rows.
     * Cloth retains its original bearing, height order and distance between layers.
     * Ray/section intersections matter here: a support plane's distance is not
     * the radius at that bearing, and inflates diagonal panels on a broad torso.
     */
    function tailorTorso(pack, built, reference, rest, out, frame, options = {}) {
        const an = anatomy(pack), ids = pack._tailorBodyIds || (pack._tailorBodyIds = [...new Set(pack.body.source)]);
        if (frame.tailorNeeded === undefined) {
            let half = 0, depth = 0;
            for (const v of ids) if (an.member[v * 5] > .9 && an.s[v * 5] > .4 && an.s[v * 5] < 2) {
                half = Math.max(half, Math.abs(built.shaped[v * 3]));
                depth = Math.max(depth, Math.abs(built.shaped[v * 3 + 2]));
            }
            frame.tailorNeeded = Math.max(half, depth) > built.height * .17;
        }
        if (!frame.tailorNeeded) return false;
        if (typeof rest === 'function') rest = rest();
        const envelope = body => {
            const step = .022 * body.height / 1.7, bins = new Map(), P = body.shaped;
            const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
            for (const v of ids) {
                if (an.member[v*5+1] > .35 || an.member[v*5+2] > .35 || an.s[v*5] > 3.95) continue;
                const bin = Math.floor(P[v*3+1]/step);
                for (let k=bin-1;k<=bin+1;k++) { if(!bins.has(k))bins.set(k,[]);bins.get(k).push([P[v*3],P[v*3+2]]); }
            }
            for (const [key, points] of bins) {
                points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
                const lower=[],upper=[];
                for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
                for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
                bins.set(key,lower.slice(0,-1).concat(upper.slice(0,-1)));
            }
            const centers=new Map();
            for(const [key,hull]of bins)centers.set(key,(Math.min(...hull.map(p=>p[1]))+Math.max(...hull.map(p=>p[1])))/2);
            let hem=Infinity;
            for(const v of ids)if(an.member[v*5]>.8&&an.s[v*5]>.4&&an.s[v*5]<2)hem=Math.min(hem,P[v*3+1]);
            return {bins,centers,step,hem,hip:body.bones.find(b=>b.name==='Hips').head,neck:body.bones.find(b=>b.name==='Neck').head};
        };
        const targetBase=frame.tailorEnvelope||(frame.tailorEnvelope=envelope(built));
        const target=options.bearing?(frame.tailorBearingEnvelope||(frame.tailorBearingEnvelope={...targetBase,profiles:new Map(),spineOrigin:true})):targetBase;
        const source=reference._tailorEnvelope||(reference._tailorEnvelope=envelope(reference));
        const spineCenter=(e,y)=>{const t=Math.max(0,Math.min(1,(y-e.hip[1])/(e.neck[1]-e.hip[1])));return e.hip[2]*(1-t)+e.neck[2]*t;};
        // The spine is close to the back surface, not the center of a torso.
        // Using it as a polar origin scrambles adjacent back-panel bearings.
        const center=(e,y)=>{if(e.spineOrigin)return spineCenter(e,y);const at=Math.max(y,e.hip[1]-.1*e.step/.022)/e.step,k=Math.floor(at),a=e.centers.get(k),b=e.centers.get(k+1);return a===undefined?(b??spineCenter(e,y)):b===undefined?a:a+(b-a)*(at-k);};
        const rawRadius=(e,y,nx,nz)=>{
            const at=y/e.step,lo=Math.floor(at),cz=center(e,y);
            const ray=k=>{const hull=e.bins.get(k);let r=0;if(!hull)return null;
                for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],dx=b[0]-a[0],dz=b[1]-a[1],den=nx*dz-nz*dx;
                    if(Math.abs(den)<1e-10)continue;const t=(a[0]*dz-(a[1]-cz)*dx)/den,u=(a[0]*nz-(a[1]-cz)*nx)/den;
                    if(t>0&&u>=-1e-6&&u<=1+1e-6)r=Math.max(r,t);
                }return r||null;};
            const a=ray(lo),b=ray(lo+1);return a===null?b:b===null?a:a+(b-a)*(at-lo);
        };
        const radius=(e,y,nx,nz)=>{
            const low=e.hip[1]-.25*e.step/.022,high=e.neck[1]-.025*e.step/.022;
            if(y<low||y>high)return rawRadius(e,y,nx,nz);
            const count=128,angle=(Math.atan2(nx,nz)/(Math.PI*2)+1)%1*count,k=Math.floor(angle),t=angle-k;
            e.profiles=e.profiles||new Map();
            const at=bearing=>{
                bearing%=count;
                if(!e.profiles.has(bearing)){
                    const a=bearing/count*Math.PI*2,x=Math.sin(a),z=Math.cos(a),hull=[];
                    for(let q=low;q<=high+e.step*.1;q=Math.min(q+e.step,high)){
                        const r=rawRadius(e,q,x,z);if(r!==null){const p=[q,r];while(hull.length>1){const a=hull.at(-2),b=hull.at(-1);if((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])<0)break;hull.pop();}hull.push(p);}
                        if(q===high)break;
                    }
                    e.profiles.set(bearing,hull);
                }
                const hull=e.profiles.get(bearing);
                for(let j=1;j<hull.length;j++)if(y<=hull[j][0]){const a=hull[j-1],b=hull[j];return a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0]);}
                return rawRadius(e,y,nx,nz);
            };
            const a=at(k),b=at(k+1);return a===null?b:b===null?a:a+(b-a)*t;
        };
        const scale=built.height/reference.height;
        for(let i=0;i<out.length/3;i++){
            const v=options.source?.[i],hanging=options.hanging?.(i)||false,o=i*3,y0=rest[o+1];
            const arm=v===undefined?0:Math.max(an.member[v*5+1],an.member[v*5+2]);
            if(arm>.8)continue;
            // Trousers and fitted undersuits keep two separate thigh tubes.
            // Only a hanging panel continues the torso chart below the hips.
            if(!hanging&&options.legged&&y0<source.hip[1]+.05&&(options.legged==='skin'||v!==undefined&&Math.max(an.member[v*5+3],an.member[v*5+4])>.35))continue;
            if(options.nativePositions){
                // Preserve actual shoulders and fitted undersuits. A free
                // bodice instead bridges the lower folds, extending its chart
                // to the lowest torso surface so the waist cannot turn inward.
                const p=options.nativePositions;
                const t=(y0-source.hip[1])/(source.neck[1]-source.hip[1]),blend=options.legged?0:(1-smoothstep(.55,.85,t))*(1-smoothstep(.1,.8,arm));
                const mapped=target.hem+Math.max(0,t)*(target.neck[1]-target.hem),y=p[o+1]+(Math.min(p[o+1],mapped)-p[o+1])*blend;
                const sourceZ=rest[o+2]-center(source,y0),sourceR=Math.hypot(rest[o],sourceZ)||1;
                const cz=center(target,y),x=p[o]*(1-blend)+rest[o]/sourceR*Math.hypot(p[o],p[o+2]-cz)*blend,z=(p[o+2]-cz)*(1-blend)+sourceZ/sourceR*Math.hypot(p[o],p[o+2]-cz)*blend,rho=Math.hypot(x,z);
                if(rho<1e-6)continue;const nx=x/rho,nz=z/rho,r=radius(target,y,nx,nz),amount=r===null?0:Math.max(0,r+.015*built.height/1.7-rho)*(1-smoothstep(.1,.8,arm));
                out[o]=x+nx*amount;out[o+1]=y;out[o+2]=cz+z+nz*amount;continue;
            }
            if(y0>source.neck[1]-.035*reference.height/1.7||(!hanging&&y0<source.hip[1]-.26*reference.height/1.7))continue;
            const x=rest[o],z=rest[o+2]-center(source,y0),rho=Math.hypot(x,z);if(rho<1e-6)continue;
            const angle=options.bearing?.(i),nx=angle===undefined?x/rho:Math.sin(angle),nz=angle===undefined?z/rho:Math.cos(angle);
            const y=y0<source.hip[1]?target.hip[1]+(y0-source.hip[1])*scale:target.hip[1]+(y0-source.hip[1])/(source.neck[1]-source.hip[1])*(target.neck[1]-target.hip[1]);
            const a0=hanging?Math.max(y0,source.hip[1]):y0,a=hanging?Math.max(y,target.hip[1]):y;
            let r0=radius(source,a0,nx,nz),r=radius(target,a,nx,nz);if(r0===null||r===null)continue;
            if(hanging&&y0<source.hip[1]+.10*reference.height/1.7){
                // A free hem hangs outside the whole seat, including bulges
                // below the hip joint; a single hip slice can miss them.
                for(let j=-10;j<=5;j++){
                    r=Math.max(r,radius(target,target.hip[1]+j*target.step,nx,nz)||0);
                }
            }
            // Preserve the signed relief of an imported seam, inset or folded
            // edge. Clamping all its inner vertices onto one radius collapses
            // those faces into black, intersecting horizontal strips.
            const extra=(rho-r0)*scale+(options.clearance??.035)*built.height/1.7+(options.lift||0),reach=r+extra;
            const blend=(1-smoothstep(.1,.8,arm))*(hanging?1:smoothstep(source.hip[1]-.26*reference.height/1.7,source.hip[1]-.06*reference.height/1.7,y0));
            const cz=center(target,y);
            out[o]+=(nx*reach-out[o])*blend;out[o+1]+=(y-out[o+1])*blend;out[o+2]+=(cz+nz*reach-out[o+2])*blend;
        }
        return true;
    }

    /** Each border vertex moved toward the middle of its two neighbors along the border, `passes` times (the body point under it too). */
    function smoothBorder(piece, pos, base, passes, select, level) {
        if (!passes || !piece.border.length) return;
        if (!piece.borderNext) {
            const near = new Map();
            for (const [a, b] of piece.border) {
                if (!near.has(a)) near.set(a, []);
                if (!near.has(b)) near.set(b, []);
                near.get(a).push(b); near.get(b).push(a);
            }
            piece.borderNext = [...near.entries()].filter(([, n]) => n.length === 2);
        }
        const list = select?piece.borderNext.filter(([v])=>select(v)):piece.borderNext;
        for (let p = 0; p < passes; p++) {
            const next = list.map(([v, [a, b]]) => {
                const to = [0, 1, 2].map(k => 0.5 * pos[v * 3 + k] + 0.25 * (pos[a * 3 + k] + pos[b * 3 + k]));
                // `level`: eased along the cloth only, never in toward the body (a chord across a curved
                // panel pulled an open front's edge down into a rounded pillow).
                // Its height off the body is eased along the edge too, so the edge runs even.
                if (level) {
                    const n = [0, 1, 2].map(k => pos[v * 3 + k] - base[v * 3 + k]), l = Math.hypot(...n);
                    if (l > 1e-4) {
                        const h = q => Math.hypot(pos[q * 3] - base[q * 3], pos[q * 3 + 1] - base[q * 3 + 1], pos[q * 3 + 2] - base[q * 3 + 2]);
                        const d = [0, 1, 2].map(k => to[k] - pos[v * 3 + k]), along = (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / l, rise = 0.25 * (h(a) + h(b)) - 0.5 * l;
                        for (let k = 0; k < 3; k++) to[k] += n[k] / l * (rise - along);
                    }
                }
                return to;
            });
            // The body point under each moves with it, so the rim folds back by the same depth.
            // (Leveled, it moves only along the body: the height change is the cloth's own.)
            list.forEach(([v], i) => {
                const d = [0, 1, 2].map(k => next[i][k] - pos[v * 3 + k]);
                if (level) {
                    const n = [0, 1, 2].map(k => pos[v * 3 + k] - base[v * 3 + k]), l = Math.hypot(...n);
                    if (l > 1e-4) { const along = (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / (l * l); for (let k = 0; k < 3; k++) d[k] -= n[k] * along; }
                }
                for (let k = 0; k < 3; k++) { base[v * 3 + k] += d[k]; pos[v * 3 + k] = next[i][k]; }
            });
        }
    }

    // ── patterns ──────────────────────────────────────────────────────────
    /** A vertex's color: the garment's pattern from its body position, the trim along its cut lines. */
    function paint(laid, look) {
        const c1 = linear(look.color), c2 = linear(look.color2 || look.color), trim = linear(look.trim || look.color2 || look.color);
        const n = laid.positions.length / 3;
        const colors = new Float32Array(n * 3);
        const scale = look.scale || 1;
        for (let i = 0; i < n; i++) {
            const f = laid.field[i];
            // Bands run around the body: by height on the trunk, along the chain on a limb.
            const s = (f.fam === 0 ? f.y * 5 : f.s) * scale, a = f.ang;
            let t = 0;
            switch (look.pattern) {
                case 'stripes': t = (Math.floor(s * 4) & 1); break;
                case 'pinstripes': t = (s * 10 % 1) < 0.18 ? 1 : 0; break;
                case 'vstripes': t = Math.floor((a / Math.PI + 1) * 6 * scale) & 1; break;
                case 'checker': t = (Math.floor(s * 4) + Math.floor((a / Math.PI + 1) * 6 * scale)) & 1; break;
                case 'plaid': {
                    const u = (s * 3) % 1, v = ((a / Math.PI + 1) * 4 * scale) % 1;
                    t = ((u < 0.3) ? 0.5 : 0) + ((v < 0.3) ? 0.5 : 0);
                    break;
                }
                case 'gradient': t = smoothstep(look.from ?? 0, look.to ?? 4, f.s); break;
                case 'halves': t = laid.positions[i * 3] < 0 ? 1 : 0; break;
                case 'camo': {
                    const p = laid.positions;
                    const x = p[i * 3] * 9, y = p[i * 3 + 1] * 9, z = p[i * 3 + 2] * 9;
                    const v = Math.sin(x * 1.7 + Math.sin(y * 1.3)) + Math.sin(y * 2.1 + Math.cos(z * 1.9)) + Math.sin(z * 1.5 + x * 0.7);
                    t = v > 0.6 ? 1 : v < -0.9 ? 0.5 : 0;
                    break;
                }
                default: t = 0;
            }
            let rgb = mixRgb(c1, c2, t);
            // Trim along the cut lines (the hem, cuffs, collar) and on the rim.
            if (look.trimWidth && (laid.vals[i] < look.trimWidth)) rgb = trim;
            // A little darker toward the body at the rim, as a fold would be.
            if (laid.vals[i] < 0) rgb = rgb.map(x => x * 0.7);
            colors.set(rgb, i * 3);
        }
        return colors;
    }

    // ── footwear ──────────────────────────────────────────────────────────
    /**
     * Shoes and boots are built around the foot, not cut from it: a last
     * measured on the body (its footprint widened into a sole outline, its
     * top smoothed into an upper over the toes and instep), a sole of its own
     * thickness under it with a welt standing past the upper, and for boots a
     * shaft up the leg. The upper is a grid: columns run round the sole
     * outline (from the heel, in, round the toe, out, back to the heel) and
     * rows climb from the welt up the wall, over the foot toward the ankle,
     * then up the leg. The collar is cut across that grid once per style, on
     * the average body, so the same shoe (and its picture) fits every slider.
     *
     * A style: { cols, collar: {front, side, back} (heights in ankle heights,
     * for a low shoe), top (the shaft's top along the leg chain, for a boot),
     * gap, toe (meters past the toes), point (0 round .. 1 pointed), width,
     * sole, welt, heel (0 flat .. 1 a raised waist), spring, lames (rows to a
     * painted plate), sandal (straps on a footbed), lining }. Armor's plates are painted along the rows.
     */
    const SHOE_COLS = 40, SHOE_DOME = 10, SHOE_WALL = 2;

    /** The foot's own frame: the ankle joint, forward along the floor toward the toe tip, outward. */
    function footFrame(built, side) {
        const B = n => built.bones.find(b => b.name === (side ? 'Right' : 'Left') + n);
        const ankle = B('Foot').head, tip = B('ToeBase').tail, knee = B('Leg').head, hip = B('UpLeg').head;
        let fx = tip[0] - ankle[0], fz = tip[2] - ankle[2];
        const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
        const s = side ? -1 : 1;
        return { ankle, knee, hip, fwd: [fx, fz], lat: [fz * s, -fx * s], sign: s, a: ankle[1] };
    }
    const toPlan = (F, x, z) => { const dx = x - F.ankle[0], dz = z - F.ankle[2]; return [dx * F.fwd[0] + dz * F.fwd[1], dx * F.lat[0] + dz * F.lat[1]]; };
    const fromPlan = (F, f, l) => [F.ankle[0] + F.fwd[0] * f + F.lat[0] * l, F.ankle[2] + F.fwd[1] * f + F.lat[1] * l];

    /** The skin of one leg from mid-thigh down (pack vertex ids), kept per pack. */
    function legSkin(pack, side) {
        pack._legSkin = pack._legSkin || [];
        if (pack._legSkin[side]) return pack._legSkin[side];
        const an = anatomy(pack), fam = side ? 4 : 3;
        const ids = [...new Set(pack.body.source)].filter(v => an.member[v * 5 + fam] > 0.5 && an.s[v * 5 + fam] > 0.45);
        return (pack._legSkin[side] = Int32Array.from(ids));
    }

    /** A point on the leg's axis at chain position s (hip 0, knee 1, ankle 2). */
    function legAxis(F, s) {
        const [a, b, t] = s >= 1 ? [F.knee, F.ankle, Math.min(1.2, s - 1)] : [F.hip, F.knee, s];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }

    const circBlur = (arr, passes) => {
        const n = arr.length;
        let a = Float64Array.from(arr), b = new Float64Array(n);
        for (let p = 0; p < passes; p++) {
            for (let i = 0; i < n; i++) b[i] = 0.25 * a[(i + n - 1) % n] + 0.5 * a[i] + 0.25 * a[(i + 1) % n];
            const x = a; a = b; b = x;
        }
        return a;
    };

    /** A stiff boot and its lining share one foot articulation, with a flexible ankle sleeve. */
    function rigidFootSkin(built, position, skin) {
        const side=position[0]>0?'Left':'Right',foot=built.bones.findIndex(b=>b.name===side+'Foot');
        if(foot<0)return skin;
        const ankle=built.bones[foot].head[1],scale=built.height/1.7;
        const flex=smoothstep(ankle+.04*scale,ankle+.11*scale,position[1]);
        if(flex>=1)return skin;
        const sum=new Map();
        for(let k=0;k<4;k++)if(skin.weights[k]>0)sum.set(skin.joints[k],(sum.get(skin.joints[k])||0)+skin.weights[k]*flex);
        sum.set(foot,(sum.get(foot)||0)+1-flex);
        const top=[...sum].sort((a,b)=>b[1]-a[1]).slice(0,4),total=top.reduce((v,q)=>v+q[1],0);
        skin.joints.fill(0);skin.weights.fill(0);
        top.forEach(([joint,weight],k)=>{skin.joints[k]=joint;skin.weights[k]=weight/total;});
        return skin;
    }

    /**
     * The upper's grid on one foot of a built body: positions per (row, column),
     * the columns' plan directions, and what the sole needs (the outline and
     * its outward normals). `extra`: points of garments already laid that a
     * boot's shaft goes over.
     */
    function shoeGrid(pack, built, style, side, extra) {
        const F = footFrame(built, side), P = built.shaped, a = F.a;
        const shaft = style.top != null;
        // Where the foot meets the leg: just over the ankle bones.
        const yj = a * 1.42;
        const sj = 2 - (yj - F.ankle[1]) / Math.max(1e-3, F.knee[1] - F.ankle[1]);
        const ids = legSkin(pack, side);
        const pts = [];
        for (const v of ids) pts.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        const own = pts.length;
        // Garment points round this leg only, on its own side (not the other leg's trousers).
        if (shaft && extra) for (let i = 0; i < extra.length; i += 3) {
            const y = extra[i + 1], s = 2 - (y - F.ankle[1]) / Math.max(1e-3, F.knee[1] - F.ankle[1]);
            const c = legAxis(F, Math.max(-0.5, s));
            if (extra[i] * F.sign > 0 && Math.hypot(extra[i] - c[0], extra[i + 2] - c[2]) < 0.3) pts.push(extra[i], y, extra[i + 2]);
        }
        const gap = style.gap ?? 0.004;
        // The footprint and the top of the foot as a height field in the foot's plan, 4 mm cells.
        const cell = 0.004;
        let f0 = Infinity, f1 = -Infinity, l0 = Infinity, l1 = -Infinity;
        const plan = new Float32Array(own / 3 * 2);
        for (let i = 0, k = 0; i < own; i += 3, k++) {
            const [f, l] = toPlan(F, pts[i], pts[i + 2]);
            plan[k * 2] = f; plan[k * 2 + 1] = l;
            if (pts[i + 1] > yj) continue;
            f0 = Math.min(f0, f); f1 = Math.max(f1, f); l0 = Math.min(l0, l); l1 = Math.max(l1, l);
        }
        const pad = 0.04;
        f0 -= pad; f1 += pad + (style.toe || 0); l0 -= pad; l1 += pad;
        const W = Math.ceil((f1 - f0) / cell) + 1, Hn = Math.ceil((l1 - l0) / cell) + 1;
        let hf = new Float32Array(W * Hn);
        for (let k = 0; k < own / 3; k++) {
            const y = pts[k * 3 + 1];
            if (y > yj) continue;
            const ci = Math.round((plan[k * 2] - f0) / cell), cj = Math.round((plan[k * 2 + 1] - l0) / cell);
            const o = cj * W + ci;
            if (y > hf[o]) hf[o] = y;
        }
        // Grown by 8 mm (the gaps between skin vertices closed, the toes' clefts filled), then softened.
        const grow = (src, r) => {
            const out = new Float32Array(src.length);
            for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
                let m = 0;
                for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
                    if (di * di + dj * dj > r * r + 0.5) continue;
                    const x = i + di, y = j + dj;
                    if (x < 0 || y < 0 || x >= W || y >= Hn) continue;
                    m = Math.max(m, src[y * W + x]);
                }
                out[j * W + i] = m;
            }
            return out;
        };
        const blur = src => {
            let s = src;
            for (let p = 0; p < 3; p++) {
                const out = new Float32Array(s.length);
                for (let j = 0; j < Hn; j++) for (let i = 0; i < W; i++) {
                    let sum = 0, n = 0;
                    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
                        const x = i + di, y = j + dj;
                        if (x < 0 || y < 0 || x >= W || y >= Hn) continue;
                        const w = (di ? 1 : 2) * (dj ? 1 : 2); sum += s[y * W + x] * w; n += w;
                    }
                    out[j * W + i] = sum / n;
                }
                s = out;
            }
            return s;
        };
        const grown = grow(hf, 2);
        const soft = blur(grown);
        for (let i = 0; i < hf.length; i++) hf[i] = Math.max(grown[i], soft[i]);
        const heightAt = (f, l) => {
            const x = (f - f0) / cell, y = (l - l0) / cell;
            const i = Math.max(0, Math.min(W - 2, Math.floor(x))), j = Math.max(0, Math.min(Hn - 2, Math.floor(y)));
            const u = Math.max(0, Math.min(1, x - i)), w = Math.max(0, Math.min(1, y - j));
            return (hf[j * W + i] * (1 - u) + hf[j * W + i + 1] * u) * (1 - w) + (hf[(j + 1) * W + i] * (1 - u) + hf[(j + 1) * W + i + 1] * u) * w;
        };
        // The leg's rings: per height, the farthest skin (or garment) in each direction round the leg's axis.
        const cols = style.cols || SHOE_COLS;
        // A boot's shaft closes round the leg, not round the trousers: what is worn under it reaches at most
        // `ease` past the skin (the cloth is tucked in after, tuckInto), and its folds never print through.
        const ease = style.ease ?? 0.008;
        const ringAt = (s, dirs) => {
            const c = legAxis(F, s), y = c[1], half = shaft ? 0.03 : 0.016;
            const r = new Float64Array(dirs.length), rg = new Float64Array(dirs.length);
            const win = Math.PI * 2 / dirs.length * 1.6;
            const [cf, cl] = toPlan(F, c[0], c[2]);
            for (let i = 0; i < pts.length; i += 3) {
                if (Math.abs(pts[i + 1] - y) > half) continue;
                const [f, l] = toPlan(F, pts[i], pts[i + 2]);
                const df = f - cf, dl = l - cl, d = Math.hypot(df, dl), ang = Math.atan2(dl, df);
                const into = i < own ? r : rg;
                for (let k = 0; k < dirs.length; k++) {
                    let da = Math.abs(ang - dirs[k]); if (da > Math.PI) da = Math.PI * 2 - da;
                    if (da < win) into[k] = Math.max(into[k], d * Math.cos(da));
                }
            }
            const n = dirs.length, smg = circBlur(rg, 4);
            // The skin's reach round the leg, eased into one smooth line: widened a column each way, then
            // softened. Taken as the larger of each reading and its blur, every sparse skin point stood as its
            // own tooth up the counter and the shaft, and the heel came out rumpled.
            const wide = Array.from(r, (x, k) => Math.max(r[(k + n - 1) % n], x, r[(k + 1) % n]));
            const sm = circBlur(wide, 3);
            const skin = Array.from(r, (x, k) => Math.max(x, sm[k]));
            // The cap reaches as far as the skin either side: sparse skin in one direction is no dent in the shaft.
            return { c, y, skin: skin.map(x => x + 0.003), r: skin.map((x, k) => Math.max(x, Math.min(Math.max(rg[k], smg[k]), Math.max(skin[(k + n - 1) % n], x, skin[(k + 1) % n]) + ease)) + gap + 0.002) };
        };
        // The sole's outline: the footprint's reach in each direction round the ankle, widened by the gap.
        const N = 180, reach = new Float64Array(N);
        for (let k = 0; k < own / 3; k++) {
            if (pts[k * 3 + 1] > yj) continue;
            const f = plan[k * 2], l = plan[k * 2 + 1], d = Math.hypot(f, l), ang = Math.atan2(l, f);
            for (let q = -2; q <= 2; q++) {
                const bin = ((Math.round((ang / (Math.PI * 2)) * N) + q) % N + N) % N;
                const da = ang - bin / N * Math.PI * 2;
                reach[bin] = Math.max(reach[bin], d * Math.cos(da));
            }
        }
        const sm = circBlur(reach, 3);
        const junctionDirs = Array.from({ length: N }, (_, b) => b / N * Math.PI * 2);
        const junction = ringAt(sj, junctionDirs);
        const outline = [], radii = [], swell = [];
        for (let b = 0; b < N; b++) {
            const ang = b / N * Math.PI * 2;
            let r = Math.max(reach[b], sm[b]) + gap + (style.width || 0) * Math.abs(Math.sin(ang));
            // Round the toe, or draw it to a point, past the toes.
            const ahead = Math.max(0, Math.cos(ang));
            r += (style.toe || 0) * Math.pow(ahead, 2 + (style.point || 0) * 10);
            radii.push(r);
            // Never inside the leg as it leaves the shoe.
            swell.push(Math.max(0, junction.r[b] + 0.008 - r));
        }
        // Where the ankle bones stand past the footprint the outline swells out smoothly round them: taken
        // as it came, the swell was a jog in the welt under each ankle.
        if (swell.some(x => x > 0)) {
            // Widened 16 degrees each way, then softened: a smooth hump no lower than the swell anywhere that counts.
            const wide = swell.map((_, b) => { let m = 0; for (let q = -8; q <= 8; q++) m = Math.max(m, swell[(b + q + N) % N]); return m; });
            const soft = circBlur(wide, 30);
            for (let b = 0; b < N; b++) radii[b] += Math.max(swell[b], soft[b]);
        }
        for (let b = 0; b < N; b++) { const ang = b / N * Math.PI * 2; outline.push([Math.cos(ang) * radii[b], Math.sin(ang) * radii[b]]); }
        // A manufactured heel counter follows one smooth support envelope. Independent
        // radial maxima made every sparse heel vertex a visible tooth in the sole.
        // Its width is the heel's own (behind the ankle), not the ball's: a counter as wide as the forefoot was a bulb.
        const rear=outline.map(p=>p[0]).reduce((a,b)=>Math.min(a,b)),halfWidth=Math.max(...outline.filter(p=>p[0]<=0).map(p=>Math.abs(p[1])));
        for(let j=0;j<outline.length;j++){
            const p=outline[j];if(p[0]>=-.008)continue;
            const t=Math.max(0,Math.min(1,(-p[0]-.008)/Math.max(.001,-rear-.008)));
            // Support lines smooth the rear half while retaining the measured foot clearance.
            const a=j/N*Math.PI*2,rx=-rear,ry=halfWidth*.92;
            const radius=1/Math.sqrt((Math.cos(a)/rx)**2+(Math.sin(a)/ry)**2);
            const current=Math.hypot(...p),wanted=Math.max(current,radius);
            outline[j]=p.map(v=>v*(1+(wanted/current-1)*smoothstep(0,.35,t)));
        }
        // Columns at even steps along the outline, from the heel (behind the ankle) round.
        const start = N / 2;
        const len = [0];
        for (let b = 1; b <= N; b++) { const p = outline[(start + b - 1) % N], q = outline[(start + b) % N]; len.push(len[b - 1] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
        const O = [], dirs = [];
        for (let j = 0; j < cols; j++) {
            const target = len[N] * j / cols;
            let b = 0; while (b < N - 1 && len[b + 1] < target) b++;
            const t = (target - len[b]) / ((len[b + 1] - len[b]) || 1);
            const p = outline[(start + b) % N], q = outline[(start + b + 1) % N];
            const o = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
            O.push(o); dirs.push(Math.atan2(o[1], o[0]));
        }
        // Outward normals of the outline in the plan.
        const out = O.map((o, j) => {
            const p = O[(j + cols - 1) % cols], q = O[(j + 1) % cols];
            let nx = q[1] - p[1], ny = -(q[0] - p[0]);
            const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
            if (nx * o[0] + ny * o[1] < 0) { nx = -nx; ny = -ny; }
            return [nx, ny];
        });
        // Rows: the wall, the upper over the foot to the junction ring, then the shaft's rings.
        const rings = [ringAt(sj, dirs)];
        const shaftRows = shaft ? Math.max(1, Math.ceil((1.92 - style.top) / 0.085)) : 0;
        for (let r = 1; r <= shaftRows; r++) rings.push(ringAt(sj + (style.top - sj) * r / shaftRows, dirs));
        // Rings of a boot's shaft fall straight: each no narrower than the one above it less a little, smoothed up the leg.
        for (let k = 0; k < cols; k++) {
            const col = rings.map(g => g.r[k]);
            const smooth = col.map((x, i) => Math.max(x, ((col[i - 1] ?? x) + 2 * x + (col[i + 1] ?? x)) / 4));
            rings.forEach((g, i) => { g.r[k] = smooth[i]; });
        }
        const rows = SHOE_WALL + SHOE_DOME + 1 + shaftRows;
        const G = new Float32Array(rows * (cols + 1) * 3);
        const minWall = style.wall ?? 0.022;
        const put = (row, j, x, y, z) => { const o = (row * (cols + 1) + j) * 3; G[o] = x; G[o + 1] = y; G[o + 2] = z; };
        const domeH = [];
        for (let j = 0; j < cols; j++) {
            const o = O[j], g0 = rings[0];
            const [cf, cl] = toPlan(F, g0.c[0], g0.c[2]);
            const L = [cf + Math.cos(dirs[j]) * g0.r[j], cl + Math.sin(dirs[j]) * g0.r[j]];
            // The upper along this column: from the outline toward the junction ring, over the foot's smoothed top.
            const heights = [];
            for (let i = 0; i <= SHOE_DOME; i++) {
                const t = i / SHOE_DOME;
                const f = o[0] + (L[0] - o[0]) * t, l = o[1] + (L[1] - o[1]) * t;
                heights.push(i === SHOE_DOME ? yj : Math.max(heightAt(f, l) + gap, minWall + (yj - minWall) * Math.pow(t, 3)));
            }
            // Never lower toward the ankle than nearer the toe (a smooth climb, no dips between toes and instep),
            // and eased toward the least arch over the foot, so the upper bends in a curve, never a crease.
            for (let i = 1; i <= SHOE_DOME; i++) heights[i] = Math.max(heights[i], heights[i - 1]);
            const arch = concaveOver(heights);
            for (let i = 0; i <= SHOE_DOME; i++) heights[i] = Math.max(heights[i], heights[i] * 0.4 + arch[i] * 0.6);
            domeH.push(heights);
        }
        // Each row eased across its neighbors too, never below what it encloses: first raised to the highest
        // of each three side by side (no teeth where the heel's wall meets the ankle), then softened.
        {
            const prev = domeH.map(h => h.slice());
            for (let j = 0; j < cols; j++) for (let i = 0; i < SHOE_DOME; i++) domeH[j][i] = Math.max(prev[(j + cols - 1) % cols][i], prev[j][i], prev[(j + 1) % cols][i]);
        }
        for (let pass = 0; pass < 3; pass++) {
            const prev = domeH.map(h => h.slice());
            for (let j = 0; j < cols; j++) for (let i = 0; i < SHOE_DOME; i++) {
                const m = 0.25 * prev[(j + cols - 1) % cols][i] + 0.5 * prev[j][i] + 0.25 * prev[(j + 1) % cols][i];
                domeH[j][i] = Math.max(domeH[j][i], m);
            }
        }
        for (let j = 0; j < cols; j++) {
            const o = O[j], g0 = rings[0];
            const [cf, cl] = toPlan(F, g0.c[0], g0.c[2]);
            const L = [cf + Math.cos(dirs[j]) * g0.r[j], cl + Math.sin(dirs[j]) * g0.r[j]];
            const heights = domeH[j];
            const edge = heights[0];
            const wall = [0, edge * 0.55];
            const [x0, z0] = fromPlan(F, o[0], o[1]);
            put(0, j, x0, wall[0], z0);
            const bulge = 0.0008;
            const [x1, z1] = fromPlan(F, o[0] + out[j][0] * bulge, o[1] + out[j][1] * bulge);
            put(1, j, x1, wall[1], z1);
            for (let i = 0; i <= SHOE_DOME; i++) {
                const t = i / SHOE_DOME;
                const f = o[0] + (L[0] - o[0]) * t, l = o[1] + (L[1] - o[1]) * t;
                const [x, z] = fromPlan(F, f, l);
                put(SHOE_WALL + i, j, x, heights[i], z);
            }
            for (let r = 1; r <= shaftRows; r++) {
                const g = rings[r], [gf, gl] = toPlan(F, g.c[0], g.c[2]);
                const flare = r === shaftRows ? 0.003 : 0;
                const [x, z] = fromPlan(F, gf + Math.cos(dirs[j]) * (g.r[j] + flare), gl + Math.sin(dirs[j]) * (g.r[j] + flare));
                put(SHOE_WALL + SHOE_DOME + r, j, x, g.y, z);
            }
        }
        // The seam column behind repeats the first.
        for (let row = 0; row < rows; row++) for (let k = 0; k < 3; k++) G[(row * (cols + 1) + cols) * 3 + k] = G[(row * (cols + 1)) * 3 + k];
        return { F, G, rows, cols, O, out, dirs, yj, shaftRows, rings };
    }

    /**
     * The upper's shading eased over its neighbors: its quads split along whichever diagonal is shorter,
     * and the facet normals flipped with them from column to column, which a glossy boot showed as rumpled
     * streaks round the heel. Only within the upper (the welt and the sole keep their edges).
     */
    function smoothUpperNormals(N, I, ranges, passes = 2) {
        const inUpper = v => ranges.some(([a, b]) => v >= a && v < b);
        const nbr = new Map();
        for (let k = 0; k < I.length; k += 3) for (let e = 0; e < 3; e++) {
            const a = I[k + e], b = I[k + (e + 1) % 3];
            if (!inUpper(a) || !inUpper(b)) continue;
            (nbr.get(a) || nbr.set(a, new Set()).get(a)).add(b);
            (nbr.get(b) || nbr.set(b, new Set()).get(b)).add(a);
        }
        for (let p = 0; p < passes; p++) {
            const prev = Float32Array.from(N);
            for (const [v, set] of nbr) {
                let x = prev[v * 3] * 2, y = prev[v * 3 + 1] * 2, z = prev[v * 3 + 2] * 2;
                for (const u of set) { x += prev[u * 3]; y += prev[u * 3 + 1]; z += prev[u * 3 + 2]; }
                const l = Math.hypot(x, y, z) || 1;
                N[v * 3] = x / l; N[v * 3 + 1] = y / l; N[v * 3 + 2] = z / l;
            }
        }
    }

    /** The least concave curve over evenly spaced values (their upper hull), sampled back at each. */
    function concaveOver(h) {
        const hull = [0];
        for (let i = 1; i < h.length; i++) {
            while (hull.length >= 2) {
                const a = hull[hull.length - 2], b = hull[hull.length - 1];
                // b lies under the chord a..i: not on the hull.
                if ((h[b] - h[a]) * (i - a) <= (h[i] - h[a]) * (b - a)) hull.pop(); else break;
            }
            hull.push(i);
        }
        const out = new Array(h.length);
        for (let k = 0; k + 1 < hull.length; k++) {
            const a = hull[k], b = hull[k + 1];
            for (let i = a; i <= b; i++) out[i] = h[a] + (h[b] - h[a]) * (i - a) / ((b - a) || 1);
        }
        return out;
    }

    /** Vertices at the same place share one normal (the mean of theirs). */
    function weldNormals(P, N) {
        const groups = new Map();
        for (let i = 0; i < P.length / 3; i++) {
            const k = Math.round(P[i * 3] * 1e5) + ',' + Math.round(P[i * 3 + 1] * 1e5) + ',' + Math.round(P[i * 3 + 2] * 1e5);
            const g = groups.get(k);
            if (g) g.push(i); else groups.set(k, [i]);
        }
        for (const g of groups.values()) {
            if (g.length < 2) continue;
            let x = 0, y = 0, z = 0;
            for (const i of g) { x += N[i * 3]; y += N[i * 3 + 1]; z += N[i * 3 + 2]; }
            const l = Math.hypot(x, y, z);
            if (l < 1e-6) continue;
            for (const i of g) { N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l; }
        }
    }

    /** Outward normals of the grid's vertices. */
    function gridNormals(grid) {
        const { G, rows, cols, F } = grid, C = cols + 1, N = new Float32Array(G.length);
        const at = (r, j, k) => G[(Math.max(0, Math.min(rows - 1, r)) * C + ((j + cols) % cols)) * 3 + k];
        for (let r = 0; r < rows; r++) for (let j = 0; j <= cols; j++) {
            const tj = [0, 1, 2].map(k => at(r, j + 1, k) - at(r, j - 1, k));
            const tr = [0, 1, 2].map(k => at(r + 1, j, k) - at(r - 1, j, k));
            let n = [tr[1] * tj[2] - tr[2] * tj[1], tr[2] * tj[0] - tr[0] * tj[2], tr[0] * tj[1] - tr[1] * tj[0]];
            const l = Math.hypot(...n) || 1; n = n.map(x => x / l);
            // Away from the foot's middle at that height.
            const o = (r * C + j) * 3, cx = G[o] - F.ankle[0], cz = G[o + 2] - F.ankle[2];
            if (n[0] * cx + n[2] * cz + n[1] * (r >= SHOE_WALL + 2 && r < SHOE_WALL + SHOE_DOME ? 0.5 : 0) < 0) n = n.map(x => -x);
            N[o] = n[0]; N[o + 1] = n[1]; N[o + 2] = n[2];
        }
        return N;
    }

    /** A shoe style's fixed layout: the grid's cut along the collar, the sole's rings, measured once on the average body. */
    function shoeTemplate(pack, style) {
        pack._shoes = pack._shoes || new Map();
        const key = JSON.stringify(style);
        if (pack._shoes.has(key)) return pack._shoes.get(key);
        const avg = pack._avgBuilt || (pack._avgBuilt = Body.build(pack, Body.DEFAULT_RECIPE));
        const grid = shoeGrid(pack, avg, style, 0, null);
        const { rows, cols, G, F } = grid, C = cols + 1;
        // The grid as a surface to cut: its own vertices, uvs round (u) and up (v).
        const n = rows * C, source = new Uint32Array(n), uv = new Float32Array(n * 2), index = [];
        const V_UPPER = 0.78;
        for (let r = 0; r < rows; r++) for (let j = 0; j <= cols; j++) {
            const i = r * C + j;
            source[i] = i; uv[i * 2] = j / cols; uv[i * 2 + 1] = r / (rows - 1) * V_UPPER;
        }
        // Each quad split along its shorter diagonal on the average body.
        const d2 = (p, q) => (G[p * 3] - G[q * 3]) ** 2 + (G[p * 3 + 1] - G[q * 3 + 1]) ** 2 + (G[p * 3 + 2] - G[q * 3 + 2]) ** 2;
        for (let r = 0; r + 1 < rows; r++) for (let j = 0; j < cols; j++) {
            const a = r * C + j, b = a + 1, c = a + C, d = c + 1;
            if (d2(a, d) < d2(b, c)) index.push(a, b, d, a, d, c); else index.push(a, b, c, b, d, c);
        }
        // The collar: in a low shoe, where each column climbs past the collar's height there.
        const value = new Float32Array(n).fill(1);
        const collarRow = new Float32Array(cols + 1).fill(rows - 1);
        if (style.collar) {
            const want = [];
            for (let j = 0; j < cols; j++) {
                const ang = grid.dirs[j], c = Math.cos(ang), s2 = Math.sin(ang) ** 2;
                const k = c > 0 ? style.collar.front : style.collar.back;
                want.push(F.a * (k * c * c + style.collar.side * s2));
            }
            // Cut at the collar's height on the average body, so the edge runs level however the rows climb.
            const smooth = circBlur(want, 2);
            const rowOf = j => {
                for (let r = SHOE_WALL; r < rows - 1; r++) {
                    const y0 = G[(r * C + j) * 3 + 1], y1 = G[((r + 1) * C + j) * 3 + 1];
                    if (y1 >= smooth[j]) return r + Math.max(0, Math.min(1, (smooth[j] - y0) / ((y1 - y0) || 1)));
                }
                return rows - 1;
            };
            for (let j = 0; j < cols; j++) collarRow[j] = rowOf(j);
            collarRow[cols] = collarRow[0];
            for (let r = 0; r < rows; r++) for (let j = 0; j <= cols; j++) value[r * C + j] = (smooth[j % cols] - G[(r * C + j) * 3 + 1]) * 40 + (r < SHOE_WALL ? 1 : 0);
        } else {
            for (let r = 0; r < rows; r++) for (let j = 0; j <= cols; j++) value[r * C + j] = rows - 1 - r + 1e-3;
        }
        let piece;
        if (style.sandal) piece = { verts: [], uvs: new Float32Array(0), vals: new Float32Array(0), index: new Uint32Array(0) };
        else piece = cut({ source, uv, index: Uint32Array.from(index) }, value);
        // The collar's edge (the cut line, or a boot's top row), not the welt's.
        piece.border = borderEdges(piece.index).filter(([a, b]) => piece.vals[a] < 0.01 && piece.vals[b] < 0.01);
        const t = { key, style, rows, cols, piece, collarRow };
        pack._shoes.set(key, t);
        // What the picture and the hidden skin are measured on: the shoes laid on the average body.
        const laid = layShoes(pack, avg, t, null, { measure: true }, {});
        t.paint = laid.paint;
        t.hidden = shoeHidden(pack, avg, laid, style);
        return t;
    }

    /** The skin a pair of shoes covers, on the average body: under the collar, less a margin seen into from above. */
    function shoeHidden(pack, built, laid, style) {
        const hidden = new Set(), P = built.shaped, margin = style.sandal ? 0 : (style.margin ?? 0.016);
        for (let side = 0; side < 2; side++) {
            const F = footFrame(built, side), top = laid.collar[side];
            const bins = top.length;
            for (const v of legSkin(pack, side)) {
                const y = P[v * 3 + 1];
                if (style.sandal) { if (y < 0.0045) hidden.add(v); continue; }
                const [f, l] = toPlan(F, P[v * 3], P[v * 3 + 2]);
                const b = ((Math.round(Math.atan2(l, f) / (Math.PI * 2) * bins) % bins) + bins) % bins;
                if (y < top[b] - margin) hidden.add(v);
            }
        }
        return hidden;
    }

    /**
     * A pair of shoes on a built body: one part's arrays (both feet), and in
     * a measuring run what the picture is painted from. `extra`: points of
     * garments already laid (trouser legs a boot goes over).
     */
    function layShoes(pack, built, t, extra, options, frame) {
        const style = t.style, measure = options && options.measure;
        const positions = [], uvs = [], index = [], paint = [], collar = [], lining = [], shafts = [], uppers = [];
        const joints = [], weights = [], source = [];
        const sole = style.sole ?? 0.012, welt = style.welt ?? 0.004;
        for (let side = 0; side < 2; side++) {
            const grid = shoeGrid(pack, built, style, side, extra);
            shafts.push(grid);
            const { G, cols, rows, F, O, out } = grid, C = cols + 1;
            const N = gridNormals(grid);
            const indexStart = index.length;
            const add = (p, u, v, attr) => {
                positions.push(p[0], p[1], p[2]); uvs.push(u, v);
                if (measure) paint.push(attr);
                return positions.length / 3 - 1;
            };
            const fRange = [Math.min(...O.map(o => o[0])), Math.max(...O.map(o => o[0]))];
            const fNorm = f => (f - fRange[0]) / ((fRange[1] - fRange[0]) || 1);
            const attrOf = (p, region, extraAttr) => {
                const [f, l] = toPlan(F, p[0], p[2]);
                return Object.assign({ region, f: fNorm(f), fm: f, l, y: p[1] }, extraAttr);
            };
            // The upper.
            const pc = t.piece, upperStart = positions.length / 3;
            pc.verts.forEach(({ a, b, t: w }, i) => {
                const p = [0, 1, 2].map(k => G[a * 3 + k] * (1 - w) + G[b * 3 + k] * w);
                const row = Math.floor(a / C) * (1 - w) + Math.floor(b / C) * w;
                const col = (a % C) * (1 - w) + (b % C) * w;
                add(p, pc.uvs[i * 2], pc.uvs[i * 2 + 1], measure ? attrOf(p, 'upper', { row, col, below: t.collarRow[Math.round(col)] - row }) : null);
            });
            for (let i = 0; i < pc.index.length; i += 3) index.push(upperStart + pc.index[i], upperStart + pc.index[i + 1], upperStart + pc.index[i + 2]);
            uppers.push([upperStart, upperStart + pc.verts.length]);
            // Wherever the leg reaches past the upper (a calf between two rings), it stands out of it; the
            // collar's roll and lining are laid from where it ends up.
            const upperSoft = [];
            // Not a boot's shaft above the foot: its rings are already measured round the leg, and the body's
            // nearest normal behind the calf read as the leg breaking through, kicking single points out in a fin.
            const shaftFrom = grid.shaftRows ? C * (SHOE_WALL + SHOE_DOME + 1) : Infinity;
            for (let i = 0; i < pc.verts.length; i++) if (pc.verts[i].a >= C * SHOE_WALL && Math.min(pc.verts[i].a, pc.verts[i].b) < shaftFrom) upperSoft.push(upperStart + i);
            const before=Float32Array.from(positions);
            collide(pack, built, positions, 0, 0, 0.0025, frame || {}, upperSoft);
            // Spread a heel correction over the complete rear counter instead of denting individual points:
            // measured only on the counter it is spread over (a calf pressing the shaft is no reason to
            // inflate the heel), and eased out toward the sides and up the leg, never a step (it stood out as a fin).
            const heelWeight=(f,y)=>smoothstep(-.004,-.02,f)*(1-smoothstep(grid.yj-.01,grid.yj+.03,y));
            let heelLift=0;
            for(const i of upperSoft){const [f]=toPlan(F,before[i*3],before[i*3+2]),w=heelWeight(f,before[i*3+1]);if(w>.5)heelLift=Math.max(heelLift,Math.hypot(positions[i*3]-before[i*3],positions[i*3+2]-before[i*3+2]));}
            if(heelLift>0)for(const i of upperSoft){const p=[before[i*3],before[i*3+1],before[i*3+2]],[f]=toPlan(F,p[0],p[2]),w=heelWeight(f,p[1]);if(w<=0)continue;const axis=legAxis(F,2-(p[1]-F.ankle[1])/Math.max(.001,F.knee[1]-F.ankle[1])),d=norm3([p[0]-axis[0],0,p[2]-axis[2]]),own=(positions[i*3]-p[0])*d[0]+(positions[i*3+2]-p[2])*d[2];if(own>=heelLift*w)continue;positions[i*3]=p[0]+d[0]*heelLift*w;positions[i*3+2]=p[2]+d[2]*heelLift*w;}

            // The collar's edge rolled over, and the lining a little way down inside.
                const rimOf = new Map();
            const rimFor = i => {
                if (rimOf.has(i)) return rimOf.get(i);
                const p = [positions[(upperStart + i) * 3], positions[(upperStart + i) * 3 + 1], positions[(upperStart + i) * 3 + 2]];
                // Inward: level, toward the leg's axis at this height.
                const ax = legAxis(F, 2 - (p[1] - F.ankle[1]) / Math.max(1e-3, F.knee[1] - F.ankle[1]));
                let nx = p[0] - ax[0], nz = p[2] - ax[2];
                const nl = Math.hypot(nx, nz) || 1;
                const n = [nx / nl, 0, nz / nl], u = pc.uvs[i * 2];
                const th = style.lining ?? 0.003;
                const ring = [
                    [p[0], p[1], p[2]],
                    [p[0] - n[0] * th * 0.5, p[1] + th * 0.55, p[2] - n[2] * th * 0.5],
                    [p[0] - n[0] * th, p[1], p[2] - n[2] * th],
                    [p[0] - n[0] * th, p[1] - 0.012, p[2] - n[2] * th]
                ];
                const ids = ring.map((q, k) => add(q, u, 0.79 + k * 0.004, measure ? attrOf(q, k < 2 ? 'roll' : 'lining', { k }) : null));
                lining.push([ids[2], ids[3], ax, nl]);
                rimOf.set(i, ids);
                return ids;
            };
            const collarTop = new Float32Array(72).fill(-1);
            for (const [ea, eb] of pc.border) {
                const A = rimFor(ea), B = rimFor(eb);
                for (let k = 0; k < 3; k++) index.push(A[k], B[k], B[k + 1], A[k], B[k + 1], A[k + 1]);
                if (measure) for (const e of [ea, eb]) {
                    const q = [positions[(upperStart + e) * 3], positions[(upperStart + e) * 3 + 1], positions[(upperStart + e) * 3 + 2]];
                    const [f, l] = toPlan(F, q[0], q[2]);
                    const bin = ((Math.round(Math.atan2(l, f) / (Math.PI * 2) * 72) % 72) + 72) % 72;
                    collarTop[bin] = Math.max(collarTop[bin], q[1]);
                }
            }
            if (measure) {
                // Bins the collar never crossed take their neighbors' heights (round the leg, the nearest set bins).
                for (let pass = 0; pass < 72 && collarTop.some(x => x < 0); pass++) {
                    const prev = Float32Array.from(collarTop);
                    for (let b = 0; b < 72; b++) if (prev[b] < 0) { const m = Math.max(prev[(b + 71) % 72], prev[(b + 1) % 72]); if (m >= 0) collarTop[b] = m; }
                }
                if (style.sandal) collarTop.fill(0);
                collar.push(collarTop);
            }
            // The sole: welt, edge and tread, with the toe sprung up and a heeled shoe's waist raised.
            const ringsDef = [[0, 0, 0], [welt, 0, 1], [welt, -0.25, 2], [welt, -0.8, 3], [welt - 0.0015, -1, 4]];
            const lift = f => (style.spring ?? 0.006) * Math.pow(smoothstep(0.7, 1.02, f), 2) + (style.heel ? style.heel * sole * 0.45 * smoothstep(0.22, 0.3, f) * (1 - smoothstep(0.5, 0.62, f)) : 0);
            const soleRings = ringsDef.length + 2;
            const soleIds = [];
            const cx = O.reduce((s, o) => s + o[0], 0) / cols, cl = O.reduce((s, o) => s + o[1], 0) / cols;
            for (let j = 0; j <= cols; j++) {
                const jj = j % cols, o = O[jj], n = out[jj], u = j / cols;
                const fN = fNorm(o[0]);
                const col = [];
                ringsDef.forEach(([w, dy, k]) => {
                    const [x, z] = fromPlan(F, o[0] + n[0] * w, o[1] + n[1] * w);
                    let y = dy * sole;
                    if (k >= 3) y += lift(fN) * (k === 3 ? 0.7 : 1);
                    col.push(add([x, y, z], u, 0.82 + k * 0.03, measure ? attrOf([x, y, z], 'sole', { ring: k, depth: -dy }) : null));
                });
                for (const s of [0.62, 0.25]) {
                    const f = cx + (o[0] - cx) * s, l = cl + (o[1] - cl) * s;
                    const [x, z] = fromPlan(F, f, l);
                    const y = -sole + lift(fNorm(f));
                    col.push(add([x, y, z], u, s > 0.5 ? 0.98 : 0.995, measure ? attrOf([x, y, z], 'tread', {}) : null));
                }
                soleIds.push(col);
            }
            for (let j = 0; j < cols; j++) for (let k = 0; k + 1 < soleRings; k++) {
                const a = soleIds[j][k], b = soleIds[j + 1][k], c = soleIds[j][k + 1], d = soleIds[j + 1][k + 1];
                index.push(a, c, d, a, d, b);
            }
            // The tread's middle closes in a fan; a sandal's footbed closes the top.
            const mid = (() => { const [x, z] = fromPlan(F, cx, cl); return add([x, -sole + lift(fNorm(cx)), z], 0.5, 1, measure ? attrOf([x, -sole, z], 'tread', {}) : null); })();
            for (let j = 0; j < cols; j++) index.push(soleIds[j][soleRings - 1], mid, soleIds[j + 1][soleRings - 1]);
            if (style.sandal) {
                const bed = [];
                for (let j = 0; j <= cols; j++) {
                    const o = O[j % cols], col = [soleIds[j][0]];
                    for (const s of [0.82, 0.5, 0.2]) {
                        const f = cx + (o[0] - cx) * s, l = cl + (o[1] - cl) * s;
                        const [x, z] = fromPlan(F, f, l);
                        col.push(add([x, 0, z], j / cols, 0.805, measure ? attrOf([x, 0, z], 'bed', {}) : null));
                    }
                    bed.push(col);
                }
                const top = (() => { const [x, z] = fromPlan(F, cx, cl); return add([x, 0, z], 0.5, 0.805, measure ? attrOf([x, 0, z], 'bed', {}) : null); })();
                for (let j = 0; j < cols; j++) {
                    for (let k = 0; k < 3; k++) { const a = bed[j][k], b = bed[j + 1][k], c = bed[j][k + 1], d = bed[j + 1][k + 1]; index.push(a, d, c, a, b, d); }
                    index.push(bed[j][3], bed[j + 1][3], top);
                }
            }
            // The right foot's frame is mirrored: its triangles turn the other way.
            if (side) for (let i = indexStart; i < index.length; i += 3) { const x = index[i + 1]; index[i + 1] = index[i + 2]; index[i + 2] = x; }
        }
        const P = Float32Array.from(positions);
        const n = P.length / 3;
        // The lining stands out of the leg too, but never past the collar it hangs from.
        const lined = lining.flatMap(([a, b]) => [a, b]);
        collide(pack, built, P, 0, 0, 0.001, frame || {}, lined);
        for (const [a, b, ax, edge] of lining) for (const i of [a, b]) {
            const dx = P[i * 3] - ax[0], dz = P[i * 3 + 2] - ax[2], d = Math.hypot(dx, dz), most = edge - 0.0008;
            if (d > most && d > 0) { P[i * 3] = ax[0] + dx / d * most; P[i * 3 + 2] = ax[2] + dz / d * most; }
        }
        // Skin weights from the skin round each vertex, measured once on the average body (the shoe rides
        // the same skin on every body).
        if (!t.skin) {
            const nearest = skinPicker(pack, built);
            for (let i = 0; i < n; i++) {
                const s = nearest(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
                if (style.rigidFoot) {
                    rigidFootSkin(built,P.subarray(i*3,i*3+3),s);
                }
                for (let k = 0; k < 4; k++) { joints.push(s.joints[k]); weights.push(s.weights[k]); }
                source.push(s.v);
            }
            t.skin = { joints: Uint8Array.from(joints), weights: Float32Array.from(weights), source: Int32Array.from(source) };
        }
        const I = Uint32Array.from(index);
        // One normal where the grid's seam behind (and the collar's roll) meets itself.
        const normals = triangleNormals(P, I);
        weldNormals(P, normals);
        smoothUpperNormals(normals, I, uppers);
        weldNormals(P, normals);
        return {
            positions: P, normals, uvs: Float32Array.from(uvs), index: I,
            joints: t.skin.joints, weights: t.skin.weights, source: t.skin.source,
            paint: measure ? { attrs: paint, index: I, uvs: Float32Array.from(uvs) } : null, collar,
            tuck: (points, cloth) => tuckInto(shafts, style, points, cloth && cloth.joints && cloth.weights ? { cloth, boot: { P, joints: t.skin.joints, weights: t.skin.weights } } : null)
        };
    }

    /**
     * Garment points inside a boot's shaft kept there: each point round a leg,
     * below the shaft's top, is drawn in toward the leg's axis until it lies a
     * few millimeters inside the shaft. Returns whether any moved. With
     * `reskin` ({ cloth: the laid garment's joints and weights, boot }), what is
     * inside also moves as the boot does (the skin of the boot's points round it,
     * eased back to its own just over the top): a closely fitted shaft over cloth bound to the
     * leg on its own let the cloth through as soon as the ankle bent.
     */
    function tuckInto(grids, style, P, reskin) {
        if (style.top == null) return false;
        let moved = false;
        let nearestBoot = null;
        if (reskin) {
            const B = reskin.boot.P, cell = 0.02, map = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
            for (let v = 0; v < B.length / 3; v++) {
                const k = key(Math.floor(B[v * 3] / cell), Math.floor(B[v * 3 + 1] / cell), Math.floor(B[v * 3 + 2] / cell));
                let list = map.get(k); if (!list) map.set(k, list = []); list.push(v);
            }
            // The boot's skin round a point: its points within 3 cm, the nearer the more (one nearest point's
            // weights changed in steps across the ankle's bend, and the cloth crossed the boot between them).
            nearestBoot = (x, y, z) => {
                const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell), found = [];
                for (let r = 2; r <= 3 && !found.length; r++) for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) for (let c = -r; c <= r; c++) {
                    const list = map.get(key(cx + a, cy + b, cz + c)); if (!list) continue;
                    for (const v of list) { const d = Math.sqrt((B[v * 3] - x) ** 2 + (B[v * 3 + 1] - y) ** 2 + (B[v * 3 + 2] - z) ** 2); if (d < 0.03 * r / 2) found.push([v, 1 / (d + 0.004) ** 2]); }
                }
                return found;
            };
        }
        const follow = (i, top) => {
            const v = i / 3, y = P[i + 1], w = 1 - smoothstep(top - 0.01, top + 0.04, y);
            if (w <= 0) return;
            const near = nearestBoot(P[i], y, P[i + 2]);
            if (!near.length) return;
            const { joints: CJ, weights: CW } = reskin.cloth, { joints: BJ, weights: BW } = reskin.boot, sum = new Map();
            const total0 = near.reduce((n, e) => n + e[1], 0);
            for (let k = 0; k < 4; k++) if (CW[v * 4 + k] > 0) sum.set(CJ[v * 4 + k], (sum.get(CJ[v * 4 + k]) || 0) + CW[v * 4 + k] * (1 - w));
            for (const [b, q] of near) for (let k = 0; k < 4; k++) if (BW[b * 4 + k] > 0) sum.set(BJ[b * 4 + k], (sum.get(BJ[b * 4 + k]) || 0) + BW[b * 4 + k] * w * q / total0);
            const top4 = [...sum].sort((p, q) => q[1] - p[1]).slice(0, 4), total = top4.reduce((n, e) => n + e[1], 0) || 1;
            for (let k = 0; k < 4; k++) { CJ[v * 4 + k] = top4[k] ? top4[k][0] : 0; CW[v * 4 + k] = top4[k] ? top4[k][1] / total : 0; }
        };
        for (const g of grids) {
            const { rings, dirs, F, cols } = g;
            const top = rings[rings.length - 1].y;
            for (let i = 0; i < P.length; i += 3) {
                const y = P[i + 1];
                // Just over the top too, easing out, so a trouser triangle reaching over the top stays inside.
                // Down to the floor: a suit's leg ending at the ankle hangs inside the heel counter too.
                if (y > top + 0.04) continue;
                let r = 0;
                while (r + 1 < rings.length - 1 && rings[r + 1].y < y) r++;
                const A = rings[r], B = rings[Math.min(rings.length - 1, r + 1)];
                const t = B === A ? 0 : Math.max(0, Math.min(1, (y - A.y) / (B.y - A.y)));
                const cx = A.c[0] + (B.c[0] - A.c[0]) * t, cz = A.c[2] + (B.c[2] - A.c[2]) * t;
                const [pf, pl] = toPlan(F, P[i], P[i + 2]), [cf, cl] = toPlan(F, cx, cz);
                const df = pf - cf, dl = pl - cl, d = Math.hypot(df, dl);
                if (P[i] * F.sign <= 0 || d > 0.3 || d < 1e-6) continue;
                if (nearestBoot) follow(i, top);
                const ang = Math.atan2(dl, df);
                // The two columns either side of this direction.
                let k = 0, best = Infinity;
                for (let j = 0; j < cols; j++) { let da = ang - dirs[j]; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) < best) { best = Math.abs(da); k = j; } }
                let da = Math.atan2(Math.sin(ang - dirs[k]), Math.cos(ang - dirs[k]));
                const k2 = (k + (da > 0 ? 1 : cols - 1)) % cols;
                const span = Math.abs(Math.atan2(Math.sin(dirs[k2] - dirs[k]), Math.cos(dirs[k2] - dirs[k]))) || 1;
                const w = Math.min(1, Math.abs(da) / span);
                const R = (A.r[k] * (1 - w) + A.r[k2] * w) * (1 - t) + (B.r[k] * (1 - w) + B.r[k2] * w) * t;
                const S = (A.skin[k] * (1 - w) + A.skin[k2] * w) * (1 - t) + (B.skin[k] * (1 - w) + B.skin[k2] * w) * t;
                // A little deeper down the shaft than at its top, where the cloth shows over the rim; never into the leg.
                const most = Math.max(Math.min(R - 0.003, S), R - 0.003 - 0.003 * smoothstep(top - 0.01, top - 0.05, y)) + Math.max(0, y - top) * 0.8;
                // Nothing worn inside hangs through the sole (a heavy body's suit leg reached below the floor).
                if (y < 0.004) { P[i + 1] = 0.004; moved = true; }
                // Below the top, any cloth round this leg goes in (the shaft no longer swells round baggy legs).
                if (d <= most || (y >= top && d > R + 0.08)) continue;
                const s = most / d;
                const [x, z] = fromPlan(F, cf + df * s, cl + dl * s);
                P[i] = x; P[i + 2] = z;
                moved = true;
            }
        }
        return moved;
    }

    /** Skin weights for points near the given skin (the lower legs by default): the skin round each point, weighted by nearness. */
    function skinPicker(pack, built, only) {
        const P = built.shaped, ids = only || [...legSkin(pack, 0), ...legSkin(pack, 1)];
        const cell = 0.025, map = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
        for (const v of ids) {
            const k = key(Math.floor(P[v * 3] / cell), Math.floor(P[v * 3 + 1] / cell), Math.floor(P[v * 3 + 2] / cell));
            let list = map.get(k); if (!list) map.set(k, list = []); list.push(v);
        }
        return (x, y, z) => {
            const cx = Math.floor(x / cell), cy = Math.floor(Math.max(y, 0.002) / cell), cz = Math.floor(z / cell);
            const sum = new Map();
            let best = -1, bd = Infinity;
            for (let r = 1; r <= 4 && (best < 0 || r <= 1); r++) {
                for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
                    for (const v of map.get(key(cx + i, cy + j, cz + k)) || []) {
                        const d = (P[v * 3] - x) ** 2 + (Math.max(y, 0.002) - P[v * 3 + 1]) ** 2 + (P[v * 3 + 2] - z) ** 2;
                        if (d < bd) { bd = d; best = v; }
                        if (d > 0.03 * 0.03) continue;
                        const w = 1 / (d + 1e-4);
                        for (let q = 0; q < 4; q++) {
                            const jt = pack.skinJoints[v * 4 + q], wt = pack.skinWeights[v * 4 + q] * w;
                            if (wt > 0) sum.set(jt, (sum.get(jt) || 0) + wt);
                        }
                    }
                }
            }
            if (!sum.size && best >= 0) for (let q = 0; q < 4; q++) if (pack.skinWeights[best * 4 + q] > 0) sum.set(pack.skinJoints[best * 4 + q], pack.skinWeights[best * 4 + q]);
            const top = [...sum.entries()].sort((p, q) => q[1] - p[1]).slice(0, 4);
            const total = top.reduce((s, e) => s + e[1], 0) || 1;
            const joints = [0, 0, 0, 0], weights = [0, 0, 0, 0];
            top.forEach(([j, w], k) => { joints[k] = j; weights[k] = w / total; });
            if (!top.length) weights[0] = 1;
            return { joints, weights, v: Math.max(0, best) };
        };
    }

    // ── helmets ───────────────────────────────────────────────────────────
    /**
     * A helmet: a smooth shell round the head (its section at each height
     * fitted by a rounded square or an ellipse, never following the nose or
     * the lips), from the neck to over the crown, rigid on the head's bone.
     * A face opening or a visor window is cut across it once per style on the
     * average body; a visor is its own glossy shell standing just out of it.
     *
     * A style: { square (2 round .. 4 boxy), flat (0 domed .. 1 flat-topped),
     * gap, bottom (where it ends on the neck, 0 at its base .. 1 at the jaw),
     * window: { half (radians either side of the front), low, high (meters
     * from the eyes' height) }, visor (the window holds a visor), open (the
     * window is left open, a face opening) }.
     */
    const HELM_COLS = 44, HELM_RINGS = 20, HELM_CAP = 6, HOOD_COWL = 2;

    function headSkin(pack) {
        if (pack._headSkin) return pack._headSkin;
        const an = anatomy(pack);
        return (pack._headSkin = Int32Array.from([...new Set(pack.body.source)].filter(v => an.member[v * 5] > 0.6 && an.s[v * 5] > 4.15)));
    }

    /** The helmet's grid on a built body: positions per (ring, column), and the eyes' height. */
    function helmGrid(pack, built, style) {
        const P = built.shaped, B = n => built.bones.find(b => b.name === n);
        const neck = B('Neck').head, head = B('Head').head;
        const eyes = built.parts.find(p => p.name === 'Eyes').positions;
        let eyeY = 0;
        for (let i = 1; i < eyes.length; i += 3) eyeY += eyes[i];
        eyeY /= eyes.length / 3;
        const ids = headSkin(pack);
        let crown = -Infinity;
        for (const v of ids) crown = Math.max(crown, P[v * 3 + 1]);
        const gap = style.gap ?? 0.012;
        const y0 = neck[1] + (head[1] - neck[1]) * (style.bottom ?? 0.35), y1 = crown - 0.035;
        // Each height's extents: forward, back, out to either side.
        const rings = [];
        for (let r = 0; r < HELM_RINGS; r++) {
            const y = y0 + (y1 - y0) * r / (HELM_RINGS - 1), band = (y1 - y0) / HELM_RINGS + 0.006;
            let f = -Infinity, bk = Infinity, side = 0, n = 0, cx = 0;
            for (const v of ids) {
                if (Math.abs(P[v * 3 + 1] - y) > band) continue;
                f = Math.max(f, P[v * 3 + 2]); bk = Math.min(bk, P[v * 3 + 2]); side = Math.max(side, Math.abs(P[v * 3])); cx += P[v * 3]; n++;
            }
            rings.push({ y, f, b: bk, side, cx: n ? cx / n : 0 });
        }
        // Each extent grown to the most of its neighbors and softened up the head, so the shell bulges only smoothly.
        for (const key of ['f', 'side']) {
            const raw = rings.map(g => g[key]);
            rings.forEach((g, i) => { g[key] = Math.max(...raw.slice(Math.max(0, i - 3), i + 4)); });
        }
        { const raw = rings.map(g => g.b); rings.forEach((g, i) => { g.b = Math.min(...raw.slice(Math.max(0, i - 3), i + 4)); }); }
        for (let pass = 0; pass < 4; pass++) for (const key of ['f', 'side', 'b']) {
            const prev = rings.map(g => g[key]);
            rings.forEach((g, i) => { const m = (prev[Math.max(0, i - 1)] + 2 * prev[i] + prev[Math.min(rings.length - 1, i + 1)]) / 4; g[key] = key === 'b' ? Math.min(prev[i], m) : Math.max(prev[i], m); });
        }
        // A cloth hood has volume: it stands off the back of the skull toward a soft point at the crown,
        // and its lower edge falls in a gathered cowl onto the neck and shoulders (`low` rings under the first).
        const hood = !!style.clothHood, low = hood ? HOOD_COWL : 0;
        if (hood) rings.forEach((g, i) => { const t = i / (rings.length - 1); g.b -= 0.03 * t ** 1.5; g.side += 0.008 * t; g.f += 0.003 * t; });
        const e = style.square ?? 2.4, cols = HELM_COLS, C = cols + 1;
        const rows = low + HELM_RINGS + HELM_CAP;
        const G = new Float32Array(rows * C * 3);
        const put = (r, j, x, y, z) => { const o = ((r + low) * C + j) * 3; G[o] = x; G[o + 1] = y; G[o + 2] = z; };
        const section = (g, a, grow) => {
            const cz = (g.f + g.b) / 2, front = (g.f - g.b) / 2 + gap, sideR = g.side + gap;
            const ca = Math.cos(a), sa = Math.sin(a);
            const rad = 1 / Math.pow(Math.pow(Math.abs(ca) / front, e) + Math.pow(Math.abs(sa) / sideR, e), 1 / e);
            return [g.cx + sa * rad * grow, cz + ca * rad * grow];
        };
        for (let r = 0; r < HELM_RINGS; r++) for (let j = 0; j <= cols; j++) {
            const a = Math.PI + j / cols * Math.PI * 2, [x, z] = section(rings[r], a, 1);
            put(r, j, x, rings[r].y, z);
        }
        // The cowl: each ring under the first a little lower and wider, gathered in soft folds.
        for (let k = 1; k <= low; k++) for (let j = 0; j <= cols; j++) {
            // Down the neck to the top of the shoulders, wider at the sides where the shoulders begin.
            const a = Math.PI + j / cols * Math.PI * 2, g = rings[0], spread = 0.008 * k + 0.0025 * k * Math.cos(9 * a + 0.7);
            const [x, z] = section({ ...g, f: g.f + spread, b: g.b - spread, side: g.side + spread * 2.2 }, a, 1);
            put(-k, j, x, g.y - 0.038 * k, z);
        }
        // The cap: from the last ring over the crown, rounded or flat.
        const top = rings[HELM_RINGS - 1], peak = crown + gap + (hood ? 0.016 : 0), flat = style.flat ?? 0;
        for (let k = 1; k <= HELM_CAP; k++) {
            const phi = k / HELM_CAP * Math.PI / 2;
            const grow = k === HELM_CAP ? 0.0001 : Math.cos(phi) ** (1 - flat * 0.8);
            const rise = Math.sin(phi) ** (1 + flat * 2);
            for (let j = 0; j <= cols; j++) {
                const a = Math.PI + j / cols * Math.PI * 2, [x, z] = section(top, a, grow);
                put(HELM_RINGS - 1 + k, j, x, top.y + (peak - top.y) * rise, z);
            }
        }
        return { G, rows, cols, eyeY, y0, peak, head, low };
    }

    /** A helmet style's fixed layout: the shell, and the window cut from it (a visor or a face opening). */
    function helmTemplate(pack, style) {
        pack._helms = pack._helms || new Map();
        const key = JSON.stringify(style);
        if (pack._helms.has(key)) return pack._helms.get(key);
        const avg = pack._avgBuilt || (pack._avgBuilt = Body.build(pack, Body.DEFAULT_RECIPE));
        const grid = helmGrid(pack, avg, style);
        const { G, rows, cols } = grid, C = cols + 1, n = rows * C;
        const source = new Uint32Array(n), uv = new Float32Array(n * 2), index = [];
        for (let r = 0; r < rows; r++) for (let j = 0; j <= cols; j++) { const i = r * C + j; source[i] = i; uv[i * 2] = j / cols; uv[i * 2 + 1] = r / (rows - 1); }
        for (let r = 0; r + 1 < rows; r++) for (let j = 0; j < cols; j++) { const a = r * C + j; index.push(a, a + 1, a + C + 1, a, a + C + 1, a + C); }
        const surface = { source, uv, index: Uint32Array.from(index) };
        // The window, by direction round the head and height from the eyes, its corners rounded.
        const w = style.window;
        const win = new Float32Array(n).fill(-1);
        if (w) for (let r = 0; r < rows; r++) for (let j = 0; j <= cols; j++) {
            const o = r * C + j, a = Math.atan2(G[o * 3], G[o * 3 + 2] - grid.head[2]), dy = G[o * 3 + 1] - grid.eyeY;
            const mid = (w.high + w.low) / 2, half = (w.high - w.low) / 2;
            win[o] = 1 - Math.pow(Math.pow(Math.abs(a) / w.half, 4) + Math.pow(Math.abs(dy - mid) / half, 4), 0.25);
        }
        const shell = cut(surface, Float32Array.from(win, x => -x));
        const visor = w && w.visor ? cut(surface, Float32Array.from(win, x => x + 0.06)) : null;
        const t = { key, style, rows, cols, shell, visor, eyeV: 0, grid };
        // Where the eyes fall up the picture, for painting a slit.
        let best = 0;
        for (let r = 0; r < rows; r++) if (Math.abs(G[(r * C) * 3 + 1] - grid.eyeY) < Math.abs(G[(best * C) * 3 + 1] - grid.eyeY)) best = r;
        t.eyeV = best / (rows - 1);
        t.hidden = new Set();
        const P = avg.shaped;
        // The skin under it, less a margin above its rim and round its opening.
        for (const v of headSkin(pack)) {
            const y = P[v * 3 + 1];
            if (y < grid.y0 + 0.015) continue;
            if (w && w.open) {
                const a = Math.atan2(P[v * 3], P[v * 3 + 2] - grid.head[2]), dy = y - grid.eyeY, mid = (w.high + w.low) / 2, half = (w.high - w.low) / 2;
                if (1 - Math.pow(Math.pow(Math.abs(a) / w.half, 4) + Math.pow(Math.abs(dy - mid) / half, 4), 0.25) > -0.25) continue;
            }
            t.hidden.add(v);
        }
        pack._helms.set(key, t);
        return t;
    }

    /** A helmet on a built body: { shell, visor } part arrays (visor null without one), hidden, template. */
    function helmet(pack, built, style, frame) {
        const t = helmTemplate(pack, style), grid = helmGrid(pack, built, style);
        const headBone = built.bones.findIndex(b => b.name === 'Head');
        const make = (piece, push) => {
            if (!piece || !piece.index.length) return null;
            const n = piece.verts.length, P = new Float32Array(n * 3);
            piece.verts.forEach(({ a, b, t: w }, i) => { for (let k = 0; k < 3; k++) P[i * 3 + k] = grid.G[a * 3 + k] * (1 - w) + grid.G[b * 3 + k] * w; });
            if (push) {
                // Out from the head's middle by `push`.
                for (let i = 0; i < n; i++) {
                    const dx = P[i * 3] - grid.head[0], dy = P[i * 3 + 1] - grid.eyeY, dz = P[i * 3 + 2] - grid.head[2], l = Math.hypot(dx, dy, dz) || 1;
                    P[i * 3] += dx / l * push; P[i * 3 + 1] += dy / l * push; P[i * 3 + 2] += dz / l * push;
                }
            }
            collide(pack, built, P, 0, n, 0.006, frame || {});
            const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
            // A hood's cowl rides on the neck, blending into the head above it.
            const neckBone = built.bones.findIndex(b => b.name === 'Neck'), C = grid.cols + 1;
            for (let i = 0; i < n; i++) {
                const row = Math.floor(piece.verts[i].a / C) + (piece.verts[i].b !== piece.verts[i].a ? piece.verts[i].t * (Math.floor(piece.verts[i].b / C) - Math.floor(piece.verts[i].a / C)) : 0);
                const onHead = grid.low && neckBone >= 0 ? Math.max(0, Math.min(1, (row - grid.low + 1) / 2)) : 1;
                joints[i * 4] = headBone; weights[i * 4] = onHead;
                if (onHead < 1) { joints[i * 4 + 1] = neckBone; weights[i * 4 + 1] = 1 - onHead; }
            }
            let I = piece.index, uvs = piece.uvs, Pout = P, J = joints, W = weights;
            // A cloth hood's edges are turned under, as thick as its cloth.
            if (style.clothHood && !push) {
                piece.neighbors = piece.neighbors || pieceNeighbors(piece.verts.length, piece.index);
                piece.border = piece.border || borderEdges(piece.index);
                if (!piece.onBorder) { piece.onBorder = new Uint8Array(n); for (const [a, b] of piece.border) { piece.onBorder[a] = 1; piece.onBorder[b] = 1; } }
                const base = new Float32Array(n * 3);
                for (let i = 0; i < n; i++) base.set([grid.head[0], grid.eyeY, grid.head[2]], i * 3);
                // Only the real edges (the face opening and the lower edge): not the grid's own seam behind or its closed crown.
                const cell = v => { const x = piece.verts[v]; return x.t === 0 || x.a === x.b ? { row: Math.floor(x.a / C), col: x.a % C } : null; };
                const real = piece.border.filter(e => { const p = e.map(cell); if (!p[0] || !p[1]) return true; if (p[0].row === grid.rows - 1 && p[1].row === grid.rows - 1) return false; const seam = q => q.col === 0 || q.col === C - 1; return !(seam(p[0]) && seam(p[1])); });
                const hemPiece = Object.assign({}, piece, { border: real });
                const hem = hemRows(built, hemPiece, { hem: { thickness: 0.0035, facing: 0 } }, P, base);
                const pos = Array.from(P), uv = Array.from(uvs), jj = Array.from(joints), ww = Array.from(weights), index = Array.from(I), rowOf = new Map();
                for (const [i, rows] of hem.rows) {
                    const ids = [i];
                    for (const p of rows) { ids.push(pos.length / 3); pos.push(...p); uv.push(uvs[i * 2], uvs[i * 2 + 1]); jj.push(...joints.subarray(i * 4, i * 4 + 4)); ww.push(...weights.subarray(i * 4, i * 4 + 4)); }
                    rowOf.set(i, ids);
                }
                for (const [a, b] of real) { const A = rowOf.get(a), B = rowOf.get(b); for (let r = 0; r + 1 < A.length; r++) index.push(B[r], A[r], A[r + 1], B[r], A[r + 1], B[r + 1]); }
                Pout = Float32Array.from(pos); uvs = Float32Array.from(uv); J = Uint8Array.from(jj); W = Float32Array.from(ww); I = Uint32Array.from(index);
            }
            const normals = triangleNormals(Pout, I);
            weldNormals(Pout, normals);
            return { positions: Pout, normals, uvs, index: I, joints: J, weights: W };
        };
        return { shell: make(t.shell, 0), visor: make(t.visor, 0.004), hidden: t.hidden, template: t };
    }

    // ── pauldrons ─────────────────────────────────────────────────────────
    /**
     * Pauldrons: a cap of overlapping plates over each shoulder, from the
     * collarbone over the shoulder's top and down the upper arm, each plate a
     * little wider than the one above it. Its reach in each direction from the
     * shoulder's joint is the farthest skin or garment there (a breastplate's
     * edge, a mail shirt), smoothed and stood off, so it sits on what is worn.
     * A style: { plates, gap, reach (how far down the arm, 0..1), wide
     * (how far round the front and back, radians) }.
     */
    const PAUL_COLS = 22, PAUL_ROWS = 6;

    function armSkin(pack, side) {
        pack._armSkin = pack._armSkin || [];
        if (pack._armSkin[side]) return pack._armSkin[side];
        const an = anatomy(pack), fam = side ? 2 : 1;
        const ids = [...new Set(pack.body.source)].filter(v => (an.member[v * 5 + fam] > 0.3 && an.s[v * 5 + fam] < 1.8) || (an.member[v * 5] > 0.5 && an.s[v * 5] > 2.4 && an.s[v * 5] < 4.1 && Math.sign(an.rest[v * 3] || 1) === (side ? -1 : 1)));
        return (pack._armSkin[side] = Int32Array.from(ids));
    }

    function pauldrons(pack, built, style, extra) {
        const P = built.shaped, plates = style.plates || 3, gap = style.gap ?? 0.012;
        const wide = style.wide ?? 1.75, reach = style.reach ?? 0.55;
        const positions = [], uvs = [], index = [], joints = [], weights = [];
        const ids = [...armSkin(pack, 0), ...armSkin(pack, 1)];
        const pick = skinPicker(pack, built, ids);
        for (let side = 0; side < 2; side++) {
            const B = n => built.bones.find(b => b.name === (side ? 'Right' : 'Left') + n);
            const J = B('Arm').head, E = B('ForeArm').head;
            const a = norm3([E[0] - J[0], E[1] - J[1], E[2] - J[2]]);
            const up = norm3([-a[0] * a[1], 1 - a[1] * a[1], -a[2] * a[1]]);
            const fw = norm3(cross3(a, up));
            const sign = side ? -1 : 1;
            // Directions: polar angle from the arm's way out (0) back over toward the neck; round the arm from the front to the back over the top.
            const t0 = 0.5 - reach * 0.35, t1 = 2.25;
            const dirOf = (th, ps) => {
                const st = Math.sin(th), ct = Math.cos(th), sp = Math.sin(ps), cp = Math.cos(ps);
                return [a[0] * ct + (up[0] * cp + fw[0] * sp * sign) * st, a[1] * ct + (up[1] * cp + fw[1] * sp * sign) * st, a[2] * ct + (up[2] * cp + fw[2] * sp * sign) * st];
            };
            const pts = [];
            for (const v of armSkin(pack, side)) pts.push(P[v * 3] - J[0], P[v * 3 + 1] - J[1], P[v * 3 + 2] - J[2]);
            if (extra) for (let i = 0; i < extra.length; i += 3) {
                const dx = extra[i] - J[0], dy = extra[i + 1] - J[1], dz = extra[i + 2] - J[2];
                if (dx * dx + dy * dy + dz * dz < 0.04 && dx * sign > -0.08) pts.push(dx, dy, dz);
            }
            const rows = plates * PAUL_ROWS, cols = PAUL_COLS;
            const R = new Float64Array((rows + 1) * (cols + 1));
            const thOf = r => t1 - (t1 - t0) * r / rows, psOf = j => -wide + 2 * wide * j / cols;
            for (let r = 0; r <= rows; r++) for (let j = 0; j <= cols; j++) {
                const d = dirOf(thOf(r), psOf(j));
                let m = 0.04;
                for (let i = 0; i < pts.length; i += 3) {
                    const x = pts[i], y = pts[i + 1], z = pts[i + 2], l = Math.hypot(x, y, z);
                    if (l < 1e-6) continue;
                    const c = (x * d[0] + y * d[1] + z * d[2]) / l;
                    if (c > 0.94) m = Math.max(m, l * c);
                }
                R[r * (cols + 1) + j] = m;
            }
            // Grown to its neighbors' and softened: a smooth dome, never inside what it covers.
            const W = cols + 1, raw = Float64Array.from(R);
            for (let r = 0; r <= rows; r++) for (let j = 0; j <= cols; j++) {
                let m = 0;
                for (let dr = -1; dr <= 1; dr++) for (let dj = -1; dj <= 1; dj++) { const rr = r + dr, jj = j + dj; if (rr >= 0 && rr <= rows && jj >= 0 && jj <= cols) m = Math.max(m, raw[rr * W + jj]); }
                R[r * W + j] = m;
            }
            for (let pass = 0; pass < 3; pass++) {
                const prev = Float64Array.from(R);
                for (let r = 0; r <= rows; r++) for (let j = 0; j <= cols; j++) {
                    let sum = 0, n = 0;
                    for (let dr = -1; dr <= 1; dr++) for (let dj = -1; dj <= 1; dj++) { const rr = r + dr, jj = j + dj; if (rr >= 0 && rr <= rows && jj >= 0 && jj <= cols) { sum += prev[rr * W + jj]; n++; } }
                    R[r * W + j] = Math.max(raw[r * W + j], sum / n);
                }
            }
            // Each plate a shell with its edge turned in; the lower plates tuck under the one above (the top plate is outermost).
            for (let k = 0; k < plates; k++) {
                const ra = k * PAUL_ROWS, rb = Math.min(rows, (k + 1) * PAUL_ROWS + 1);
                const out = gap + (plates - 1 - k) * 0.004;
                const start = positions.length / 3;
                for (let r = ra; r <= rb; r++) {
                    for (let j = 0; j <= cols; j++) {
                        const d = dirOf(thOf(r), psOf(j)), rad = R[Math.min(rows, r) * W + j] + out;
                        positions.push(J[0] + d[0] * rad, J[1] + d[1] * rad, J[2] + d[2] * rad);
                        uvs.push(j / cols, (k + (r - ra) / (rb - ra)) / plates);
                    }
                }
                const nr = rb - ra + 1;
                for (let r = 0; r + 1 < nr; r++) for (let j = 0; j < cols; j++) {
                    const p0 = start + r * W + j;
                    index.push(p0, p0 + W, p0 + 1, p0 + 1, p0 + W, p0 + W + 1);
                }
                // The turned-in edge all round: a strip 5 mm in toward the joint.
                const edge = [];
                for (let j = 0; j <= cols; j++) edge.push(start + j);
                for (let r = 1; r < nr; r++) edge.push(start + r * W + cols);
                for (let j = cols - 1; j >= 0; j--) edge.push(start + (nr - 1) * W + j);
                for (let r = nr - 2; r >= 1; r--) edge.push(start + r * W);
                const inn = edge.map(i => {
                    const x = positions[i * 3] - J[0], y = positions[i * 3 + 1] - J[1], z = positions[i * 3 + 2] - J[2], l = Math.hypot(x, y, z) || 1;
                    positions.push(positions[i * 3] - x / l * 0.005, positions[i * 3 + 1] - y / l * 0.005, positions[i * 3 + 2] - z / l * 0.005);
                    uvs.push(uvs[i * 2], uvs[i * 2 + 1]);
                    return positions.length / 3 - 1;
                });
                for (let e = 0; e < edge.length; e++) {
                    const a0 = edge[e], b0 = edge[(e + 1) % edge.length], a1 = inn[e], b1 = inn[(e + 1) % edge.length];
                    index.push(a0, a1, b0, b0, a1, b1);
                }
            }
        }
        const Pos = Float32Array.from(positions), I = Uint32Array.from(index);
        const n = Pos.length / 3, J4 = new Uint8Array(n * 4), W4 = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { const q = pick(Pos[i * 3], Pos[i * 3 + 1], Pos[i * 3 + 2]); J4.set(q.joints, i * 4); W4.set(q.weights, i * 4); }
        const normals = triangleNormals(Pos, I);
        weldNormals(Pos, normals);
        return { positions: Pos, normals, uvs: Float32Array.from(uvs), index: I, joints: J4, weights: W4 };
    }
    const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

    // ── collars ───────────────────────────────────────────────────────────
    /**
     * A shirt's collar: a band standing round the base of the neck over the
     * shirt, folded down over itself, its fall drawn into points at the front
     * either side of the opening. Its section is the neck's own (with the
     * shirt under it) where the neck is clear of the shoulders and the chin,
     * a little wider at the bottom, stood off a few millimeters.
     * A style: { open (radians either side of the front left open), stand,
     * fall (meters), point (meters the points reach below the fall) }.
     */
    function collarBand(pack, built, spec, extra) {
        const B = n => built.bones.find(b => b.name === n), P = built.shaped;
        const base = B('Neck').head, top = B('Head').head;
        const an = anatomy(pack);
        const ids = pack._neckSkin || (pack._neckSkin = Int32Array.from([...new Set(pack.body.source)].filter(v => an.member[v * 5] > 0.6 && an.s[v * 5] > 3.88 && an.s[v * 5] < 4.45)));
        const scale=built.height/1.7,stand=Math.max(.008*scale,Math.min((spec.stand??.032)*scale,(top[1]-base[1])*.5));
        const fall=Math.min((spec.fall??.03)*scale,stand),open=spec.open??.22,point=Math.min((spec.point??.022)*scale,stand*.45),gap=(spec.gap??.004)*scale;
        const y0=base[1]+.004*scale,cols=64,pts=Array.from(ids,v=>[P[v*3],P[v*3+1],P[v*3+2]]);
        // Fit one clean neck section for the whole folded band. Independent
        // row collisions turn a short, broad neck into overlapping flat flaps.
        let profile=null;
        for(const fraction of [.25,.5,.75]){
            const y=y0+stand*fraction,band=pts.filter(p=>Math.abs(p[1]-y)<.012*scale);if(band.length<6)continue;
            const left=Math.min(...band.map(p=>p[0])),right=Math.max(...band.map(p=>p[0])),back=Math.min(...band.map(p=>p[2])),front=Math.max(...band.map(p=>p[2]));
            const cx=(left+right)/2,cz=(front+back)/2,rx=(right-left)/2,rz=(front-back)/2;if(rx<1e-5||rz<1e-5)continue;
            let grow=1;for(const p of band)grow=Math.max(grow,Math.hypot((p[0]-cx)/rx,(p[2]-cz)/rz));
            const fitted={cx,cz,rx:rx*grow,rz:rz*grow};if(!profile||fitted.rx*fitted.rz<profile.rx*profile.rz)profile=fitted;
        }
        profile=profile||{cx:base[0],cz:base[2],rx:.055*scale,rz:.055*scale};
        const {cx,cz,rx,rz}=profile,angs=Array.from({length:cols+1},(_,j)=>open+(Math.PI*2-2*open)*j/cols);
        const tip=j=>point*Math.max(0,1-Math.min(j,cols-j)/cols*9)**1.5;
        const ring=(y,grow,add,drop)=>angs.map((a,j)=>{const sn=Math.sin(a),cs=Math.cos(a),r=1/Math.sqrt((sn/rx)**2+(cs/rz)**2)*grow+gap+add;return[cx+sn*r,y-(drop?drop(j):0),cz+cs*r];});
        const rows = [ring(y0, 1.04, 0), ring(y0 + stand, 1.0, 0), ring(y0 + stand + 0.003, 1.0, 0.004), ring(y0 + stand - fall * 0.5, 1.03, 0.006, j => tip(j) * 0.5), ring(y0 + stand - fall, 1.06, 0.008, tip)];
        const positions = [], uvs = [], index = [];
        rows.forEach((row, r) => row.forEach((p, j) => { positions.push(...p); uvs.push(j / cols, r / (rows.length - 1)); }));
        const W = cols + 1;
        for (let r = 0; r + 1 < rows.length; r++) for (let j = 0; j < cols; j++) { const a = r * W + j; index.push(a, a + 1, a + W + 1, a, a + W + 1, a + W); }
        const Pos = Float32Array.from(positions), I = Uint32Array.from(index);
        const pick = skinPicker(pack, built, ids);
        const n = Pos.length / 3, joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) { const q = pick(Pos[i * 3], Pos[i * 3 + 1], Pos[i * 3 + 2]); joints.set(q.joints, i * 4); weights.set(q.weights, i * 4); }
        // Projecting each point separately onto the nearest skin fold tears
        // the collar's silhouette; the complete section already encloses it.
        const normals = triangleNormals(Pos, I);
        return { positions: Pos, normals, uvs: Float32Array.from(uvs), index: I, joints, weights, rows: rows.length, cols };
    }

    // ── coverage ──────────────────────────────────────────────────────────
    /**
     * The hidden skin that some garment really covers: from each hidden body
     * vertex a short ray straight out along the skin's normal must meet a
     * garment's surface within `reach` meters, or the vertex is shown again (a
     * slit, an armhole, a gap between plates, a tear in a garment taken from a
     * model). Garment triangles sit in a grid of `cell` meters; each ray walks
     * the cells it crosses and stops at its first hit. Returns the vertices
     * shown again.
     */
    function uncovered(pack, built, parts, hidden, frame, reach = 0.1) {
        const out = [];
        if (!hidden.size || !parts.length) return Array.from(hidden);
        const P = built.shaped;
        const N = (frame && frame.bodyNormals) || Body.vertexNormals(pack, P);
        if (frame && !frame.bodyNormals) frame.bodyNormals = N;
        const cell = 0.03, inv = 1 / cell;
        let total = 0;
        for (const part of parts) total += part.index.length / 3;
        const T = new Float32Array(total * 9);
        const grid = new Map(), hashOf = (x, y, z) => (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
        let t = 0;
        for (const part of parts) {
            const Q = part.positions, I = part.index;
            for (let k = 0; k < I.length; k += 3, t++) {
                const a = I[k] * 3, b = I[k + 1] * 3, c = I[k + 2] * 3, o = t * 9;
                T[o] = Q[a]; T[o + 1] = Q[a + 1]; T[o + 2] = Q[a + 2]; T[o + 3] = Q[b]; T[o + 4] = Q[b + 1]; T[o + 5] = Q[b + 2]; T[o + 6] = Q[c]; T[o + 7] = Q[c + 1]; T[o + 8] = Q[c + 2];
                const x0 = Math.floor(Math.min(Q[a], Q[b], Q[c]) * inv), x1 = Math.floor(Math.max(Q[a], Q[b], Q[c]) * inv);
                const y0 = Math.floor(Math.min(Q[a + 1], Q[b + 1], Q[c + 1]) * inv), y1 = Math.floor(Math.max(Q[a + 1], Q[b + 1], Q[c + 1]) * inv);
                const z0 = Math.floor(Math.min(Q[a + 2], Q[b + 2], Q[c + 2]) * inv), z1 = Math.floor(Math.max(Q[a + 2], Q[b + 2], Q[c + 2]) * inv);
                // A huge triangle (a sole's fan) is filed under each cell it spans, up to a few on a side.
                if ((x1 - x0) * (y1 - y0) * (z1 - z0) > 512) continue;
                for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
                    const h = hashOf(x, y, z);
                    let list = grid.get(h); if (!list) grid.set(h, list = []);
                    list.push(t);
                }
            }
        }
        const seen = new Int32Array(total).fill(-1);
        let ray = 0;
        const hits = (ox, oy, oz, dx, dy, dz, list) => {
            for (const id of list) {
                if (seen[id] === ray) continue;
                seen[id] = ray;
                const o = id * 9;
                const e1x = T[o + 3] - T[o], e1y = T[o + 4] - T[o + 1], e1z = T[o + 5] - T[o + 2];
                const e2x = T[o + 6] - T[o], e2y = T[o + 7] - T[o + 1], e2z = T[o + 8] - T[o + 2];
                const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
                const det = e1x * px + e1y * py + e1z * pz;
                if (Math.abs(det) < 1e-12) continue;
                const f = 1 / det, tx = ox - T[o], ty = oy - T[o + 1], tz = oz - T[o + 2];
                const u = (tx * px + ty * py + tz * pz) * f;
                if (u < 0 || u > 1) continue;
                const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
                const v = (dx * qx + dy * qy + dz * qz) * f;
                if (v < 0 || u + v > 1) continue;
                const d = (e2x * qx + e2y * qy + e2z * qz) * f;
                if (d > -0.004 && d < reach) return true;
            }
            return false;
        };
        for (const vtx of hidden) {
            const ox = P[vtx * 3], oy = P[vtx * 3 + 1], oz = P[vtx * 3 + 2];
            const dx = N[vtx * 3], dy = N[vtx * 3 + 1], dz = N[vtx * 3 + 2];
            ray++;
            let covered = false, last = null;
            for (let step = -0.006; step <= reach && !covered; step += cell * 0.33) {
                const h = hashOf(Math.floor((ox + dx * step) * inv), Math.floor((oy + dy * step) * inv), Math.floor((oz + dz * step) * inv));
                if (h === last) continue;
                last = h;
                const list = grid.get(h);
                if (list && hits(ox, oy, oz, dx, dy, dz, list)) covered = true;
            }
            if (!covered) out.push(vtx);
        }
        return out;
    }

    // ── belts ─────────────────────────────────────────────────────────────
    /** The trunk's skin (pack vertex ids), kept per pack. */
    function trunkSkin(pack) {
        if (pack._trunkSkin) return pack._trunkSkin;
        const an = anatomy(pack);
        return (pack._trunkSkin = Int32Array.from([...new Set(pack.body.source)].filter(v => an.member[v * 5] > 0.5)));
    }

    /**
     * A belt: a stiff band round the trunk between two spine positions,
     * standing level round whatever is widest there (a belly, the garments
     * under it), with a thickness at its edges. `extra`: points of garments
     * already laid. Returns one part's arrays.
     */
    function band(pack, built, spec, extra) {
        const ch = chainPoints(built.bones, 'spine'), P = built.shaped;
        const yAt = s => ch[0][1] + s / 4 * (ch[4][1] - ch[0][1]);
        const centerAt = y => {
            for (let i = 0; i + 1 < 4; i++) if (y <= ch[i + 1][1] || i === 2) { const t = (y - ch[i][1]) / ((ch[i + 1][1] - ch[i][1]) || 1); return [ch[i][0] + (ch[i + 1][0] - ch[i][0]) * t, ch[i][2] + (ch[i + 1][2] - ch[i][2]) * t]; }
            return [ch[0][0], ch[0][2]];
        };
        const cols = 48, y0 = yAt(spec.from), y1 = yAt(spec.to), gap = spec.gap ?? 0.004, th = spec.thick ?? 0.004;
        const yc = (y0 + y1) / 2, [cx, cz] = centerAt(yc), half = (y1 - y0) / 2 + 0.008;
        const dirs = Array.from({ length: cols }, (_, j) => Math.PI + j / cols * Math.PI * 2);
        const win = Math.PI * 2 / cols * 1.6;
        const reach = (pts, limit) => {
            const r = new Float64Array(cols);
            for (let i = 0; i < pts.length; i += 3) {
                if (Math.abs(pts[i + 1] - yc) > half) continue;
                const dx = pts[i] - cx, dz = pts[i + 2] - cz, d = Math.hypot(dx, dz), ang = Math.atan2(dx, dz);
                for (let k = 0; k < cols; k++) {
                    let da = Math.abs(ang - dirs[k]) % (Math.PI * 2); if (da > Math.PI) da = Math.PI * 2 - da;
                    if (da < win && (!limit || d < limit[k])) r[k] = Math.max(r[k], d * Math.cos(da));
                }
            }
            return r;
        };
        const skin = [];
        for (const v of trunkSkin(pack)) skin.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
        const r = reach(skin);
        // Garments under it, but not a sleeve hanging beside the waist.
        if (extra && extra.length) {
            const g = reach(extra, Array.from(r, x => x + 0.05));
            for (let k = 0; k < cols; k++) r[k] = Math.max(r[k], g[k]);
        }
        const sm = circBlur(r, 2);
        const R = Array.from(r, (x, k) => Math.max(x, sm[k]) + gap);
        // The cross-section: the outer face bottom to top, over the top edge, the inner face back down.
        const section = [[0, y0], [0, (y0 + y1) / 2], [0, y1], [-th * 0.5, y1 + th * 0.4], [-th, y1], [-th, y0], [-th * 0.5, y0 - th * 0.4], [0, y0]];
        const positions = [], uvs = [], index = [];
        for (let j = 0; j <= cols; j++) {
            const a = dirs[j % cols], sx = Math.sin(a), sz = Math.cos(a), rr = R[j % cols];
            section.forEach(([dr, y], k) => {
                positions.push(cx + sx * (rr + dr), y, cz + sz * (rr + dr));
                uvs.push(j / cols, k / (section.length - 1));
            });
        }
        const S = section.length;
        for (let j = 0; j < cols; j++) for (let k = 0; k + 1 < S; k++) {
            const a = j * S + k, b = a + S;
            index.push(a, b, b + 1, a, b + 1, a + 1);
        }
        const Pos = Float32Array.from(positions), I = Uint32Array.from(index);
        const pick = skinPicker(pack, built, trunkSkin(pack));
        const n = Pos.length / 3, joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4), source = new Int32Array(n);
        for (let i = 0; i < n; i++) {
            const q = pick(Pos[i * 3], Pos[i * 3 + 1], Pos[i * 3 + 2]);
            joints.set(q.joints, i * 4); weights.set(q.weights, i * 4); source[i] = q.v;
        }
        // What is worn over the belt (a coat) is pushed out round it, easing off above and below it.
        const cover = Q => {
            let moved = false;
            for (let i = 0; i < Q.length; i += 3) {
                const y = Q[i + 1], over = Math.max(y0 - y, y - y1, 0);
                if (over > 0.03) continue;
                const dx = Q[i] - cx, dz = Q[i + 2] - cz, d = Math.hypot(dx, dz);
                if (d < 1e-6) continue;
                let a = Math.atan2(dx, dz) - Math.PI; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                const x = a / (Math.PI * 2) * cols, j = Math.floor(x) % cols, w = x - Math.floor(x);
                const want = (R[j] * (1 - w) + R[(j + 1) % cols] * w) + th + 0.003;
                const need = (want - d) * (1 - smoothstep(0, 0.03, over));
                if (need <= 0) continue;
                Q[i] += dx / d * need; Q[i + 2] += dz / d * need;
                moved = true;
            }
            return moved;
        };
        // What the belt is worn over (a tunic, a shirt hanging loose) is drawn in under it, cinched: never out through
        // its faces or over its edges, easing back out to its own shape a few centimeters above and below it.
        const cinch = (Q, trunk) => {
            let moved = false;
            for (let i = 0; i < Q.length; i += 3) {
                const y = Q[i + 1], over = Math.max(y0 - y, y - y1, 0);
                if (over > 0.035 || (trunk && !trunk(i / 3))) continue;
                const dx = Q[i] - cx, dz = Q[i + 2] - cz, d = Math.hypot(dx, dz);
                if (d < 1e-6) continue;
                let a = Math.atan2(dx, dz) - Math.PI; a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
                const x = a / (Math.PI * 2) * cols, j = Math.floor(x) % cols, w = x - Math.floor(x);
                const inner = (R[j] * (1 - w) + R[(j + 1) % cols] * w) - th - 0.0015;
                const need = (d - inner) * (1 - smoothstep(0, 0.035, over));
                // (Not a sleeve or a hand hanging beside the waist.)
                if (need <= 0 || d - inner > 0.05) continue;
                Q[i] -= dx / d * need; Q[i + 2] -= dz / d * need;
                moved = true;
            }
            return moved;
        };
        return { positions: Pos, normals: triangleNormals(Pos, I), uvs: Float32Array.from(uvs), index: I, joints, weights, source, cover, cinch };
    }

    /** A pair of shoes in a style on a built body: { part arrays, hidden (pack vertex ids), template }. */
    function shoes(pack, built, style, extra, frame) {
        const t = shoeTemplate(pack, style);
        const laid = layShoes(pack, built, t, extra, null, frame);
        return Object.assign(laid, { hidden: t.hidden, template: t });
    }

    /** Thin swimwear cords sampled on real skin triangles; narrow strips cannot survive a vertex-only cut. */
    function swimStraps(pack, built, type, frame={}) {
        const an=anatomy(pack), R=an.rest, P=built.shaped, scale=built.height/an.height;
        const tris=pack._swimStrapTriangles || [];
        if(!pack._swimStrapTriangles)for(let i=0;i<pack.body.index.length;i+=3) {
            const ids=[0,1,2].map(k=>pack.body.source[pack.body.index[i+k]]);
            const ys=ids.map(v=>R[v*3+1]);
            if(Math.max(...ys)<.78||Math.min(...ys)>1.46)continue;
            tris.push({ids,lo:Math.min(...ys),hi:Math.max(...ys),arm:ids.some(v=>an.member[v*5+1]>.45||an.member[v*5+2]>.45)});
        }
        pack._swimStrapTriangles=tris;
        const bindings=pack._swimStrapBindings || (pack._swimStrapBindings=new Map());
        const bodyNormals=frame.normals || (frame.normals={});
        const N=bodyNormals.body || (bodyNormals.body=surfaceNormals(pack.body,P,pack.vertexCount));
        const positions=[],normals=[],joints=[],weights=[],index=[];
        const add=(a,b)=>a.map((x,k)=>x+b[k]), mul=(a,t)=>a.map(x=>x*t), sub=(a,b)=>a.map((x,k)=>x-b[k]);
        const dot=(a,b)=>a.reduce((n,x,k)=>n+x*b[k],0);
        function sample(y, angle, x) {
            const hip=an.chains.spine[0], neck=an.chains.spine[4], t=Math.max(0,Math.min(1,(y-hip[1])/(neck[1]-hip[1])));
            const axis=[0,y,hip[2]*(1-t)+neck[2]*t], dir=x==null?[Math.sin(angle),0,Math.cos(angle)]:[0,0,1];
            const origin=x==null?axis:[x,y,-1];
            const key=[y,angle,x].join(':'),cached=bindings.get(key);
            let best=cached || null;
            if(!cached)for(const tri of tris) {
                // A horizontal torso cord must not wrap the arms. The front halter
                // ray also needs clavicle skin, whose weights include shoulder bones.
                if(x==null&&tri.arm)continue;
                if(y<tri.lo-1e-7||y>tri.hi+1e-7)continue;
                const [a,b,c]=tri.ids.map(v=>Array.from(R.subarray(v*3,v*3+3)));
                const e1=sub(b,a),e2=sub(c,a),h=cross3(dir,e2),det=dot(e1,h);
                if(Math.abs(det)<1e-12)continue;
                const q=sub(origin,a),u=dot(q,h)/det,r=cross3(q,e1),v=dot(dir,r)/det,dist=dot(e2,r)/det;
                if(u< -1e-7||v< -1e-7||u+v>1.0000001||dist<0)continue;
                if(!best||dist>best.dist)best={ids:tri.ids,w:[1-u-v,u,v],dist};
            }
            if(!best)throw new Error('Bikini strap has no skin attachment at '+[y,angle,x]);
            if(!cached)bindings.set(key,best);
            const point=[0,0,0],normal=[0,0,0],influences=new Map();
            best.ids.forEach((v,i)=>{
                for(let k=0;k<3;k++){point[k]+=P[v*3+k]*best.w[i];normal[k]+=N[v*3+k]*best.w[i];}
                for(let k=0;k<4;k++){const j=pack.skinJoints[v*4+k],w=pack.skinWeights[v*4+k]*best.w[i];influences.set(j,(influences.get(j)||0)+w);}
            });
            const skin=[...influences].filter(e=>e[1]>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4), total=skin.reduce((s,e)=>s+e[1],0);
            return {point,normal:norm3(normal),skin:skin.map(([j,w])=>[j,w/total])};
        }
        function cord(points,closed=false,radius=.0018*scale) {
            const sides=6,base=positions.length/3;
            points.forEach((p,i)=>{
                const prev=points[i?i-1:closed?points.length-1:0],next=points[i+1<points.length?i+1:closed?0:points.length-1];
                const along=norm3(sub(next.point,prev.point)),across=norm3(cross3(along,p.normal));
                const center=add(p.point,mul(p.normal,.0023*scale));
                for(let k=0;k<sides;k++) {
                    const a=k/sides*Math.PI*2,n=add(mul(p.normal,Math.cos(a)),mul(across,Math.sin(a)));
                    positions.push(...add(center,mul(n,radius)));normals.push(...n);
                    for(let q=0;q<4;q++){joints.push(p.skin[q]?.[0]||0);weights.push(p.skin[q]?.[1]||0);}
                }
            });
            for(let r=0;r<(closed?points.length:points.length-1);r++)for(let k=0;k<sides;k++) {
                const a=base+r*sides+k,b=base+r*sides+(k+1)%sides,c=base+(r+1)%points.length*sides+k,d=base+(r+1)%points.length*sides+(k+1)%sides;
                index.push(a,b,d,a,d,c);
            }
        }
        function bow(anchor,size=1) {
            const across=norm3(cross3([0,1,0],anchor.normal));
            const point=(y,x)=>Object.assign({},anchor,{point:add(anchor.point,add(mul(across,x*scale*size),[0,y*scale*size,0]))});
            for(const sign of [-1,1]) {
                cord([[0,0],[.005,.008],[.006,.015],[0,.017],[-.004,.010],[0,0]].map(([y,x])=>point(y,x*sign)));
                cord([[0,0],[-.012,.007],[-.03,.012]].map(([y,x])=>point(y,x*sign)));
            }
        }
        if(type==='top') {
            cord(Array.from({length:72},(_,k)=>sample(1.173,k/72*Math.PI*2)),true);
            for(const side of [-1,1])cord(Array.from({length:25},(_,k)=>{
                const t=k/24;return sample(1.286+.132*t,0,side*(.081-.037*t));
            }));
            cord(Array.from({length:40},(_,k)=>sample(1.418,k/40*Math.PI*2)),true,.0016*scale);
            bow(sample(1.173,Math.PI));bow(sample(1.418,Math.PI),.65);
        } else {
            const hip=an.chains.spine[0][1];
            cord(Array.from({length:80},(_,k)=>{const a=k/80*Math.PI*2;return sample(hip+.018+.045*Math.abs(Math.sin(a))**1.3,a);}),true);
            for(const side of [-1,1])bow(sample(hip+.063,side*Math.PI/2));
        }
        return {positions:Float32Array.from(positions),normals:Float32Array.from(normals),joints:Uint8Array.from(joints),weights:Float32Array.from(weights),index:Uint32Array.from(index)};
    }

    /** Exact projected triangle queries, indexed once per fitted surface.
     * Local axes also let limb equipment fit its sleeve or trouser surface.
     * Large triangles use a separate bounded list rather than filling a huge grid. */
    function projectedSurface(parts, options = {}) {
        const cell = Math.max(.005, options.cell || .04), grid = new Map(), large = [];
        const axes = options.axes, origin = options.origin || [0,0,0];
        let order = 0;
        for (const part of parts) {
            const P = part.positions, I = part.index;
            const at = v => {
                const p = [P[v*3],P[v*3+1],P[v*3+2]];
                return axes ? axes.map(a => a.reduce((sum,q,k)=>sum+q*(p[k]-origin[k]),0)) : p;
            };
            const points = Array.from({length:P.length/3},(_,v)=>at(v));
            for(let t=0;t<I.length;t+=3) {
                const ids=[I[t],I[t+1],I[t+2]],p=ids.map(v=>points[v]);
                if(options.accept && !options.accept(part,ids,p))continue;
                const [a,b,c]=p,d=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
                if(Math.abs(d)<1e-12)continue;
                const tri={part,ids,a,b,c,d,order:order++},lo=[0,1].map(k=>Math.min(...p.map(q=>q[k]))-1e-6),hi=[0,1].map(k=>Math.max(...p.map(q=>q[k]))+1e-6);
                tri.lo=lo;tri.hi=hi;
                const x0=Math.floor(lo[0]/cell),x1=Math.floor(hi[0]/cell),y0=Math.floor(lo[1]/cell),y1=Math.floor(hi[1]/cell);
                if((x1-x0+1)*(y1-y0+1)>4096){large.push(tri);continue;}
                for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
                    const key=x+':'+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(tri);
                }
            }
        }
        function sample(x,y,side=1) {
            let best=null,z=-Infinity,first=Infinity;
            const test=t=>{
                if(x<t.lo[0]||x>t.hi[0]||y<t.lo[1]||y>t.hi[1])return;
                const {a,b,c,d}=t,u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/d,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/d,w=1-u-v;
                if(Math.min(u,v,w)<-1e-5)return;
                const depth=a[2]*u+b[2]*v+c[2]*w,value=side*depth;
                if(value<z||value===z&&t.order>=first)return;
                z=value;first=t.order;best={part:t.part,ids:t.ids,bary:[u,v,w],depth};
            };
            for(const t of grid.get(Math.floor(x/cell)+':'+Math.floor(y/cell))||[])test(t);
            for(const t of large)test(t);
            return best;
        }
        return {sample,depth:(x,y,fallback,side=1)=>sample(x,y,side)?.depth??fallback};
    }

    /** Actual radial silhouette at a plane through a fitted garment. Axes
     * are [side, plane normal, front]; filtering excludes adjacent limbs. */
    function crossSection(parts,origin,axes,accept=()=>true,scale=1) {
        const segments=[];
        for(const part of parts){
            const P=part.positions,I=part.index,local=Array.from({length:P.length/3},(_,v)=>axes.map(a=>
                a[0]*(P[v*3]-origin[0])+a[1]*(P[v*3+1]-origin[1])+a[2]*(P[v*3+2]-origin[2])));
            for(let t=0;t<I.length;t+=3){
                const ids=[I[t],I[t+1],I[t+2]];if(!ids.every(v=>accept(part,v)))continue;
                const p=ids.map(v=>local[v]),hits=[];
                for(let k=0;k<3;k++){
                    const a=p[k],b=p[(k+1)%3];if((a[1]>0)===(b[1]>0))continue;
                    const u=a[1]/(a[1]-b[1]);hits.push([a[0]+(b[0]-a[0])*u,a[2]+(b[2]-a[2])*u]);
                }
                if(hits.length===2)segments.push(hits);
            }
        }
        return (angle,gap=.003*scale)=>{
            const x=Math.sin(angle),z=Math.cos(angle);let radius=0;
            for(const [a,b]of segments){
                const dx=b[0]-a[0],dz=b[1]-a[1],d=x*dz-z*dx;if(Math.abs(d)<1e-10)continue;
                const r=(a[0]*dz-a[1]*dx)/d,u=(a[0]*z-a[1]*x)/d;
                if(r>0&&u>=-1e-6&&u<=1.000001)radius=Math.max(radius,r);
            }
            return origin.map((q,i)=>q+(axes[0][i]*x+axes[2][i]*z)*(radius+gap));
        };
    }

    /**
     * Hair under a soft cap (a beanie). Knit stretches: first the cap eases
     * out over the hair under it (a bun, a full crown), up to `stretch`
     * meters, smoothly; then the hair still beyond the cap's inner surface
     * (measured from the middle of the skull in every direction the cap
     * covers) is pressed just under it, never through it. Below the brim
     * the hair comes out free. `caps`: [{ positions, index }] as laid (the
     * cap's positions are moved in place); `parts`: the hair's parts, moved
     * in place. Returns { moved: hair points pressed, stretched: cap points moved }.
     */
    function clipUnderCap(built, caps, parts, options = {}) {
        const head = built.bones.find(b => b.name === 'Head');
        if (!head || !caps || !caps.length || !parts.length) return { moved: 0, stretched: 0 };
        const scale = built.height / 1.7, gap = (options.gap ?? 0.0015) * scale, stretch = (options.stretch ?? 0.03) * scale;
        let cx = 0, cz = 0, count = 0;
        for (const cap of caps) for (let i = 0; i < cap.positions.length; i += 3) { cx += cap.positions[i]; cz += cap.positions[i + 2]; count++; }
        const tail = head.tail || [head.head[0], head.head[1] + 0.2 * scale, head.head[2]];
        const c = [cx / count, head.head[1] + (tail[1] - head.head[1]) * 0.45, cz / count];
        const AZ = 128, EL = 64, TAU = Math.PI * 2;
        const dirOf = (x, y, z) => { const dx = x - c[0], dy = y - c[1], dz = z - c[2], r = Math.hypot(dx, dy, dz) || 1e-9; return { r, az: (Math.atan2(dx, dz) / TAU + 1) % 1 * AZ, el: (Math.asin(Math.max(-1, Math.min(1, dy / r))) / Math.PI + 0.5) * EL }; };
        const ray = (az, el) => { const a = (az + 0.5) / AZ * TAU, e = ((el + 0.5) / EL - 0.5) * Math.PI; return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]; };
        const wrap = a => ((a % AZ) + AZ) % AZ;
        /** The cap's nearest crossing along each direction it covers. */
        const measure = () => {
            const reach = new Float32Array(AZ * EL).fill(Infinity);
            for (const cap of caps) {
                const P = cap.positions, I = cap.index;
                for (let t = 0; t < I.length; t += 3) {
                    const v = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3], d = v.map(o => dirOf(P[o], P[o + 1], P[o + 2]));
                    let az = d.map(x => x.az);
                    if (Math.max(...az) - Math.min(...az) > AZ / 2) az = az.map(x => (x < AZ / 2 ? x + AZ : x));
                    const a0 = Math.floor(Math.min(...az)) - 1, a1 = Math.ceil(Math.max(...az)) + 1, e0 = Math.max(0, Math.floor(Math.min(...d.map(x => x.el))) - 1), e1 = Math.min(EL - 1, Math.ceil(Math.max(...d.map(x => x.el))) + 1);
                    const A = [P[v[0]] - c[0], P[v[0] + 1] - c[1], P[v[0] + 2] - c[2]], e1v = [P[v[1]] - P[v[0]], P[v[1] + 1] - P[v[0] + 1], P[v[1] + 2] - P[v[0] + 2]], e2v = [P[v[2]] - P[v[0]], P[v[2] + 1] - P[v[0] + 1], P[v[2] + 2] - P[v[0] + 2]];
                    for (let ai = a0; ai <= a1; ai++) for (let ei = e0; ei <= e1; ei++) {
                        const b = wrap(ai), dir = ray(b, ei);
                        // Möller–Trumbore from the skull's middle.
                        const p = [dir[1] * e2v[2] - dir[2] * e2v[1], dir[2] * e2v[0] - dir[0] * e2v[2], dir[0] * e2v[1] - dir[1] * e2v[0]];
                        const det = e1v[0] * p[0] + e1v[1] * p[1] + e1v[2] * p[2];
                        if (Math.abs(det) < 1e-12) continue;
                        const s = [-A[0], -A[1], -A[2]], u = (s[0] * p[0] + s[1] * p[1] + s[2] * p[2]) / det;
                        if (u < -1e-4 || u > 1 + 1e-4) continue;
                        const q = [s[1] * e1v[2] - s[2] * e1v[1], s[2] * e1v[0] - s[0] * e1v[2], s[0] * e1v[1] - s[1] * e1v[0]];
                        const w = (dir[0] * q[0] + dir[1] * q[1] + dir[2] * q[2]) / det;
                        if (w < -1e-4 || u + w > 1 + 1e-4) continue;
                        const dist = (e2v[0] * q[0] + e2v[1] * q[1] + e2v[2] * q[2]) / det;
                        if (dist > 0 && dist < reach[b * EL + ei]) reach[b * EL + ei] = dist;
                    }
                }
            }
            return reach;
        };
        let reach = measure();
        // How far out the hair reaches in each covered direction.
        const hairReach = new Float32Array(AZ * EL);
        for (const part of parts) {
            const P = part.positions;
            for (let i = 0; i < P.length; i += 3) {
                const d = dirOf(P[i], P[i + 1], P[i + 2]), b = wrap(Math.floor(d.az)) * EL + Math.min(EL - 1, Math.floor(d.el));
                // Only hair the cap covers: what falls from under the brim leaves the brim as it is.
                if (Number.isFinite(reach[b]) && d.r > hairReach[b]) hairReach[b] = d.r;
            }
        }
        // The cap eases out over it: each cap point by what the hair under it (and round it) asks, smoothed over the cap.
        let stretched = 0;
        if (stretch > 0) for (const cap of caps) {
            const P = cap.positions, n = P.length / 3, push = new Float32Array(n);
            for (let i = 0; i < n; i++) {
                const d = dirOf(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]), a0 = Math.floor(d.az), e0 = Math.floor(d.el);
                let want = 0;
                for (let da = -2; da <= 2; da++) for (let de = -2; de <= 2; de++) {
                    const e = e0 + de;
                    if (e < 0 || e >= EL) continue;
                    const h = hairReach[wrap(a0 + da) * EL + e];
                    if (h > 0) want = Math.max(want, h + gap * 2 - d.r);
                }
                push[i] = Math.max(0, Math.min(stretch, want));
            }
            const near = Array.from({ length: n }, () => new Set());
            for (let t = 0; t < cap.index.length; t += 3) for (let k = 0; k < 3; k++) { const a = cap.index[t + k], b = cap.index[t + (k + 1) % 3]; near[a].add(b); near[b].add(a); }
            let p = push;
            for (let pass = 0; pass < 4; pass++) {
                const q = new Float32Array(n);
                for (let i = 0; i < n; i++) { let s = 0; for (const j of near[i]) s += p[j]; q[i] = Math.max(p[i] * 0.5, 0.5 * p[i] + 0.5 * (near[i].size ? s / near[i].size : p[i])); }
                p = q;
            }
            for (let i = 0; i < n; i++) {
                if (p[i] <= 1e-5) continue;
                const dx = P[i * 3] - c[0], dy = P[i * 3 + 1] - c[1], dz = P[i * 3 + 2] - c[2], r = Math.hypot(dx, dy, dz) || 1, k = p[i] / r;
                P[i * 3] += dx * k; P[i * 3 + 1] += dy * k; P[i * 3 + 2] += dz * k;
                stretched++;
            }
        }
        if (stretched) reach = measure();
        // The brim at each bearing: the lowest covered direction, and its reach.
        const brim = new Int32Array(AZ).fill(-1), brimReach = new Float32Array(AZ);
        for (let a = 0; a < AZ; a++) for (let e = 0; e < EL; e++) if (Number.isFinite(reach[a * EL + e])) { brim[a] = e; brimReach[a] = reach[a * EL + e]; break; }
        let moved = 0;
        for (const part of parts) {
            const P = part.positions, pressed = [];
            for (let i = 0; i < P.length; i += 3) {
                const d = dirOf(P[i], P[i + 1], P[i + 2]);
                const a0 = Math.floor(d.az - 0.5), e0 = Math.floor(d.el - 0.5);
                let limit = Infinity;
                for (let da = 0; da <= 1; da++) for (let de = 0; de <= 1; de++) {
                    const a = wrap(a0 + da), e = Math.max(0, Math.min(EL - 1, e0 + de));
                    if (Number.isFinite(reach[a * EL + e])) limit = Math.min(limit, reach[a * EL + e] - gap);
                    // Just under the brim's edge: out from under it, widening as it falls (free a few degrees down).
                    else if (brim[a] >= 0 && e < brim[a] && brim[a] - d.el < 2.5) limit = Math.min(limit, brimReach[a] - gap + (brim[a] - d.el) / EL * Math.PI * brimReach[a] * 1.2);
                }
                if (!(d.r > limit) || limit <= 0) continue;
                const k = limit / d.r;
                for (let j = 0; j < 3; j++) P[i + j] = c[j] + (P[i + j] - c[j]) * k;
                pressed.push(i);
                moved++;
            }
            // Pressed cards lie along the cap now: their own faces' normals, not the ones they stood out with.
            if (pressed.length && part.normals && part.index) {
                const N = triangleNormals(P, part.index);
                for (const i of pressed) for (let j = 0; j < 3; j++) part.normals[i + j] = N[i + j];
            }
        }
        return { moved, stretched };
    }

    const api = { foldAt, FOLD_GAP, weightsOf, hemThickness, clipUnderCap, projectedSurface, crossSection, binding, boundPositions, collide, tailorTorso, pointGrid, rigidFootSkin, FAMILIES, CHAINS, linear, anatomy, coverage, cut, cutFor, lay, paint, mixSkin, surfaceNormals, triangleNormals, relaxScalar, shoes, footFrame, band, helmet, pauldrons, collarBand, uncovered, swimStraps };
    root.RRCharacterOutfit = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
