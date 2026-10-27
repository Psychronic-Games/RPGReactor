/**
 * RRWeaponKit - what the newer weapon kinds (bows, staffs, hafted weapons,
 * shields) are made of: forged plates with real bevels, ridged blades,
 * swept limbs and shafts, bands, rivets, spikes and gems, rune inlays,
 * their materials, and the step that lays a weapon on the floor with the
 * hand rig the game reads.
 *
 * Weapon space is the sword's: the length along +x from the hand toward
 * the business end, the edge (or the striking face, a bow's back, a
 * shield's face) toward -y, the flats facing +-z. Laid down, +z is up.
 *
 *   plate(outline, o)   a flat forged piece (an axe's bit, a mace flange, a
 *     shield board): its outline [[x, y], ...] in the x-y plane, `o.t(x, y)`
 *     its half thickness (keep it affine so each cheek stays flat),
 *     `o.sharp(i, p)` which outline points are cutting edge (ground to
 *     `o.edge` with a bevel `o.bevel` wide) and the rest chamfered by
 *     `o.chamfer`; `o.holes` [{ pts, chamfer }] pierce it. Returns
 *     { body, edge }: the bevel strips of the cutting edge apart, so they
 *     take the brighter honed metal and catch a line of light.
 *   ridge(o)            a ridged blade along +x (a spearhead, a glaive, a
 *     tine, an arrowhead): `o.top(s)`, `o.bot(s)` its sides (bot < 0),
 *     `o.h(s)` the ridge's half thickness, `o.single` a flat spine on top,
 *     `o.mid(s)` a bend of the centerline. Returns { body, edge }.
 *   sweep(path, section, o)   a section (CCW [[a, b], ...], or a function
 *     of the station) carried along a path; `o.up` keeps its frame square
 *     to a plane (a bow's limbs); closed at both ends.
 * Normals are flat across a face and smooth across a gentle bend
 * (RRContainerMesh.smoothNormals), so every chamfer reads crisp.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const CM = need('RRContainerMesh', './ContainerMesh.js');
    const Paint = need('RRPropPaint', './PropPaint.js');
    const Surface = need('RRConstructionSurface', '../Character3D/ConstructionSurface.js');

    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
    const pick = (v, list, d) => (list.includes(v) ? v : d);
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (cos) => m => CM.smoothNormals(m, cos);
    const COS = { crisp: Math.cos(34 * Math.PI / 180), soft: Math.cos(55 * Math.PI / 180) };

    // ── outlines ───────────────────────────────────────────────────────────
    const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    /** Points (and their tags) without repeats, counterclockwise (`ccw`) or clockwise. */
    function wind(pts, ccw) {
        const out = [];
        for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) out.push(p); }
        while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-7) out.pop();
        return (area(out) > 0) === ccw ? out : out.reverse();
    }
    /** Each point moved to the left of travel by `w(i)`, mitered (held to 2.4x on sharp turns). */
    function offsetLeft(loop, w) {
        const n = loop.length;
        return loop.map((p, i) => {
            const a = loop[(i + n - 1) % n], b = loop[(i + 1) % n];
            let d1 = [p[0] - a[0], p[1] - a[1]], d2 = [b[0] - p[0], b[1] - p[1]];
            const l1 = Math.hypot(d1[0], d1[1]) || 1, l2 = Math.hypot(d2[0], d2[1]) || 1;
            d1 = [d1[0] / l1, d1[1] / l1]; d2 = [d2[0] / l2, d2[1] / l2];
            const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]], s = [n1[0] + n2[0], n1[1] + n2[1]];
            const sl = Math.hypot(s[0], s[1]) || 1, m = [s[0] / sl, s[1] / sl], k = Math.min(2.4, 1 / Math.max(0.2, m[0] * n1[0] + m[1] * n1[1]));
            const d = typeof w === 'function' ? w(i) : w;
            return [p[0] + m[0] * d * k, p[1] + m[1] * d * k];
        });
    }
    /** An arc of points about (cx, cy). */
    function arc(cx, cy, r, a0, a1, n, ry) {
        const out = [];
        n = n || 12;
        for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * (ry ?? r)]); }
        return out;
    }
    /** A quadratic curve from a through control c to b. */
    function quad(a, c, b, n) {
        const out = [];
        n = n || 8;
        for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
        return out;
    }
    /** A cubic curve from a to b, controls c1 and c2. */
    function cubic(a, c1, c2, b, n) {
        const out = [];
        n = n || 10;
        for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push([0, 1].map(i => u * u * u * a[i] + 3 * u * u * t * c1[i] + 3 * u * t * t * c2[i] + t * t * t * b[i])); }
        return out;
    }
    /** Several runs of points joined, the shared joints once, each point tagged with its run's `tag`. */
    function path(...runs) {
        const out = [];
        for (const run of runs) {
            const tag = run.tag, pts = run.pts || run;
            for (const p of pts) {
                const q = out[out.length - 1];
                if (q && Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-7) { if (tag) q.tag = q.tag || tag; continue; }
                const c = [p[0], p[1]]; c.tag = tag; out.push(c);
            }
        }
        return out;
    }
    /** Points of a curve f(t) -> [x, y, z], t from 0 to 1 in `n` steps. */
    const curve = (f, n) => Array.from({ length: (n || 16) + 1 }, (_, k) => f(k / (n || 16)));
    const circle = (cx, cy, r, n) => arc(cx, cy, r, 0, Math.PI * 2 * (1 - 1 / n), n - 1);

    function triangulate(contour, holes) {
        const T = root.THREE;
        if (!T || !T.ShapeUtils) throw new Error('three.js ShapeUtils is needed to triangulate outlines');
        const V = pts => pts.map(p => new T.Vector2(p[0], p[1]));
        return { all: contour.concat(...holes), faces: T.ShapeUtils.triangulateShape(V(contour), holes.map(V)) };
    }

    /**
     * Triangles (index triplets into `pts`, [[x, y], ...]) split until no
     * edge is longer than `max`: a long edge is cut at its middle, in both
     * triangles that share it, so the mesh stays whole (outline edges kept
     * shorter than `max` are never cut). Returns { pts, faces }.
     */
    function refine(pts0, faces0, max) {
        const pts = pts0.map(p => [p[0], p[1]]);
        let faces = faces0.map(f => f.slice());
        const len = (a, b) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
        for (let pass = 0; pass < 8; pass++) {
            const mids = new Map(), key = (a, b) => (a < b ? a + ':' + b : b + ':' + a);
            for (const f of faces) for (let e = 0; e < 3; e++) { const a = f[e], b = f[(e + 1) % 3]; if (len(a, b) > max && !mids.has(key(a, b))) { mids.set(key(a, b), pts.length); pts.push([(pts[a][0] + pts[b][0]) / 2, (pts[a][1] + pts[b][1]) / 2]); } }
            if (!mids.size) break;
            const out = [];
            for (const f of faces) {
                const m = [0, 1, 2].map(e => mids.get(key(f[e], f[(e + 1) % 3])));
                const cut = m.filter(v => v !== undefined).length;
                if (!cut) { out.push(f); continue; }
                if (cut === 3) { out.push([f[0], m[0], m[2]], [m[0], f[1], m[1]], [m[2], m[1], f[2]], [m[0], m[1], m[2]]); continue; }
                // One or two edges cut: turn the triangle so its first cut edge comes first.
                let r = 0; while (m[r] === undefined) r++;
                const v = [f[r], f[(r + 1) % 3], f[(r + 2) % 3]], mm = [m[r], m[(r + 1) % 3], m[(r + 2) % 3]];
                if (cut === 1) { out.push([v[0], mm[0], v[2]], [mm[0], v[1], v[2]]); continue; }
                if (mm[1] !== undefined) out.push([v[0], mm[0], v[2]], [mm[0], v[1], mm[1]], [mm[0], mm[1], v[2]]);
                else out.push([v[0], mm[0], mm[2]], [mm[0], v[1], v[2]], [mm[0], v[2], mm[2]]);
            }
            faces = out;
        }
        return { pts, faces };
    }
    /** An outline with no span longer than `max` (extra points along long ones; each keeps its tag). */
    function densify(pts, max) {
        const out = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max));
            for (let k = 0; k < n; k++) { const p = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]; p.tag = k ? (a.tag && b.tag ? a.tag : undefined) : a.tag; out.push(p); }
        }
        return out;
    }

    // ── a forged plate ─────────────────────────────────────────────────────
    function plate(outline, o) {
        const opt = o || {}, t = opt.t || (() => 0.004), uvs = opt.uv || 10;
        const O = wind(outline, true), n = O.length;
        const sharpAt = O.map((p, i) => !!(opt.sharp ? opt.sharp(i, p) : p.tag === 'edge'));
        const bevel = opt.bevel ?? 0.01, cham = opt.chamfer ?? 0.0015, e = opt.edge ?? 0.0004;
        const W = i => (sharpAt[i] ? bevel : Math.min(cham, t(O[i][0], O[i][1]) * 0.8));
        const I = offsetLeft(O, W);
        const z0 = O.map((p, i) => (sharpAt[i] ? e : Math.max(e, t(p[0], p[1]) - W(i))));
        const holes = (opt.holes || []).map(h => {
            const H = wind(h.pts || h, false), c = h.chamfer ?? cham;
            return { H, Hi: offsetLeft(H, c), c };
        });
        const body = new CM.Geo(), edge = new CM.Geo();
        const uv = q => [q[0] * uvs, q[1] * uvs];
        // The cheeks, front and back.
        const tri = triangulate(I, holes.map(h => h.Hi));
        for (const side of [1, -1]) {
            for (const f of tri.faces) {
                const pts = f.map(k => { const q = tri.all[k]; return [q[0], q[1], side * t(q[0], q[1])]; });
                body.poly(pts, f.map(k => uv(tri.all[k])), [0, 0, side]);
            }
        }
        // The bevels and chamfers round the outline, and its wall.
        let run = 0;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n, len = Math.hypot(O[j][0] - O[i][0], O[j][1] - O[i][1]);
            const out = norm([O[j][1] - O[i][1], -(O[j][0] - O[i][0]), 0]);
            const g = sharpAt[i] && sharpAt[j] ? edge : body;
            for (const side of [1, -1]) {
                const pts = [[O[i][0], O[i][1], side * z0[i]], [O[j][0], O[j][1], side * z0[j]], [I[j][0], I[j][1], side * t(I[j][0], I[j][1])], [I[i][0], I[i][1], side * t(I[i][0], I[i][1])]];
                g.poly(pts, [[run * uvs, 0], [(run + len) * uvs, 0], [(run + len) * uvs, 0.1], [run * uvs, 0.1]], norm(add(out, [0, 0, side * 0.6])));
            }
            body.poly([[O[i][0], O[i][1], z0[i]], [O[j][0], O[j][1], z0[j]], [O[j][0], O[j][1], -z0[j]], [O[i][0], O[i][1], -z0[i]]], [[run * uvs, 0], [(run + len) * uvs, 0], [(run + len) * uvs, 0.05], [run * uvs, 0.05]], out);
            run += len;
        }
        for (const { H, Hi, c } of holes) {
            const m = H.length;
            for (let i = 0; i < m; i++) {
                const j = (i + 1) % m, out = norm([H[j][1] - H[i][1], -(H[j][0] - H[i][0]), 0]);
                const za = Math.max(e, t(H[i][0], H[i][1]) - c), zb = Math.max(e, t(H[j][0], H[j][1]) - c);
                for (const side of [1, -1]) body.poly([[H[i][0], H[i][1], side * za], [H[j][0], H[j][1], side * zb], [Hi[j][0], Hi[j][1], side * t(Hi[j][0], Hi[j][1])], [Hi[i][0], Hi[i][1], side * t(Hi[i][0], Hi[i][1])]], null, norm(add(out, [0, 0, side * 0.6])));
                body.poly([[H[i][0], H[i][1], za], [H[j][0], H[j][1], zb], [H[j][0], H[j][1], -zb], [H[i][0], H[i][1], -za]], null, out);
            }
        }
        return { body: smooth(COS.crisp)(body.done()), edge: edge.I.length ? smooth(COS.soft)(edge.done()) : null };
    }

    // ── a ridged blade ─────────────────────────────────────────────────────
    function ridge(o) {
        const L = o.length, steps = o.steps || 18, single = !!o.single, bev = o.bevel ?? 0.28, e = o.edge ?? 0.0003;
        const mid = o.mid || (() => 0), body = new CM.Geo(), edge = new CM.Geo();
        const S = [];
        for (let k = 0; k <= steps; k++) { const u = k / steps; S.push(L * (o.ease ? 1 - Math.pow(1 - u, 1.6) : u)); }
        const frame = s => { const d = 1e-4, dy = (mid(Math.min(L, s + d)) - mid(Math.max(0, s - d))) / (2 * d), l = Math.hypot(1, dy); return [1 / l, dy / l]; };
        const place = (s, a, z) => { const [tx, ty] = frame(s), nx = -ty, ny = tx; return [s + nx * a, mid(s) + ny * a, z]; };
        // Each station's section, round from the top: double-edged ten points (edge, bevel, ridge, bevel, edge and the
        // edges' hair-thin walls), single-edged eight (a flat spine on top). The last station closes on the point.
        const ringPts = S.map((s, k) => {
            // Kept thick enough near a fine point that the bevel's line stays above the edge.
            const top = o.top(s), bot = o.bot(s), h = Math.max(e * 3.2, o.h(s)), w = top - bot;
            if (k === S.length - 1 && !o.blunt) { const p = place(s, (top + bot) / 2, 0); return Array.from({ length: single ? 8 : 10 }, () => p.slice()); }
            if (single) {
                const c = top - w * (o.ridgeAt ?? 0.32), bb = Math.min(w * bev, (c - bot) * 0.6), hb = Math.max(e * 1.4, h * (o.bevelHeight ?? 0.45)), hs = h * (o.spine ?? 0.85);
                return [place(s, top, hs), place(s, c, h), place(s, bot + bb, hb), place(s, bot, e), place(s, bot, -e), place(s, bot + bb, -hb), place(s, c, -h), place(s, top, -hs)];
            }
            const c = bot + w * (o.ridgeAt ?? 0.5), bt = (top - c) * bev, bb = (c - bot) * bev, hb = Math.max(e * 1.4, h * (o.bevelHeight ?? 0.42));
            return [place(s, top, e), place(s, top - bt, hb), place(s, c, h), place(s, bot + bb, hb), place(s, bot, e), place(s, bot, -e), place(s, bot + bb, -hb), place(s, c, -h), place(s, top - bt, -hb), place(s, top, -e)];
        });
        const count = ringPts[0].length;
        // Which segments are cutting bevels (the honed metal), and which the edge's own hair-thin wall.
        const edgeSegs = single ? new Set([2, 3, 4]) : new Set([0, 3, 4, 5, 8, 9]);
        const center = r => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1]; } return [x / r.length, y / r.length, 0]; };
        let along = 0;
        for (let k = 0; k + 1 < ringPts.length; k++) {
            const A = ringPts[k], B = ringPts[k + 1], cA = center(A), cB = center(B), len = Math.hypot(cB[0] - cA[0], cB[1] - cA[1]);
            for (let j = 0; j < count; j++) {
                const j2 = (j + 1) % count, g = edgeSegs.has(j) ? edge : body;
                const pts = [A[j], A[j2], B[j2], B[j]], m = mul(add(add(A[j], A[j2]), add(B[j], B[j2])), 0.25);
                const facing = sub(m, mul(add(cA, cB), 0.5));
                g.poly(pts, [[along * 10, j / count], [along * 10, (j + 1) / count], [(along + len) * 10, (j + 1) / count], [(along + len) * 10, j / count]], Math.hypot(...facing) > 1e-9 ? facing : [0, 0, 1]);
            }
            along += len;
        }
        // The foot (it sits in a socket, but closes the solid).
        const f = ringPts[0], c0 = center(f);
        for (let j = 0; j < count; j++) body.poly([c0, f[(j + 1) % count], f[j]], null, [-1, 0, 0]);
        if (o.blunt) { const l = ringPts[ringPts.length - 1], c1 = center(l); for (let j = 0; j < count; j++) body.poly([c1, l[j], l[(j + 1) % count]], null, [1, 0, 0]); }
        const mid2 = L * 0.5;
        return { body: smooth(COS.crisp)(body.done()), edge: edge.I.length ? smooth(COS.soft)(edge.done()) : null, tip: place(L, (o.top(L) + o.bot(L)) / 2, 0), edgePoint: place(mid2, o.bot(mid2), 0) };
    }

    // ── a swept section ────────────────────────────────────────────────────
    function sweep(pathPts, section, o) {
        const opt = o || {}, n = pathPts.length, g = new CM.Geo(), rings = [];
        let prevN = null, along = 0;
        const closed = !!opt.closed;
        for (let k = 0; k < n; k++) {
            const T = closed ? norm(sub(pathPts[(k + 1) % n], pathPts[(k + n - 1) % n])) : norm(sub(pathPts[Math.min(n - 1, k + 1)], pathPts[Math.max(0, k - 1)]));
            let N;
            if (opt.up) N = norm(sub(opt.up, mul(T, dot(opt.up, T))));
            else if (prevN) N = norm(sub(prevN, mul(T, dot(prevN, T))));
            else { const ref = Math.abs(T[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; N = norm(cross(ref, T)); }
            prevN = N;
            const B = cross(T, N), sec = typeof section === 'function' ? section(k, pathPts[k]) : section;
            if (k) along += Math.hypot(...sub(pathPts[k], pathPts[k - 1]));
            const pts = sec.map(([a, b]) => add(pathPts[k], add(mul(N, a), mul(B, b))));
            rings.push({ T, along, pts, c: mul(pts.reduce((acc, p) => add(acc, p), [0, 0, 0]), 1 / pts.length) });
        }
        const m = rings[0].pts.length, vs = opt.v || 10;
        // A closed loop (a rim, a hoop) joins its last ring to its first and has no ends.
        if (closed) rings.push(Object.assign({}, rings[0], { along: along + Math.hypot(...sub(pathPts[0], pathPts[n - 1])) }));
        for (let k = 0; k + 1 < rings.length; k++) {
            const A = rings[k], Bn = rings[k + 1];
            for (let j = 0; j < m; j++) {
                const j2 = (j + 1) % m, pts = [A.pts[j], A.pts[j2], Bn.pts[j2], Bn.pts[j]];
                // Outward from the section's own middle (an offset section, a lamination, is not round its path).
                const facing = sub(mul(add(add(A.pts[j], A.pts[j2]), add(Bn.pts[j], Bn.pts[j2])), 0.25), mul(add(A.c, Bn.c), 0.5));
                g.poly(pts, [[j / m, A.along * vs], [(j + 1) / m, A.along * vs], [(j + 1) / m, Bn.along * vs], [j / m, Bn.along * vs]], Math.hypot(...facing) > 1e-12 ? facing : null);
            }
        }
        if (opt.caps !== false && !closed) for (const [k, s] of [[0, -1], [n - 1, 1]]) {
            const r = rings[k], c = r.c;
            for (let j = 0; j < m; j++) g.poly([c, r.pts[j], r.pts[(j + 1) % m]], null, mul(r.T, s));
        }
        return smooth(opt.cos ?? COS.soft)(g.done());
    }
    /** A rounded-rectangle section `w` across (b) and `h` deep (a), corners of radius `r`, CCW. */
    function roundRect(h, w, r, steps) {
        const pts = [], rr = Math.min(r, h / 2, w / 2), st = steps || 2;
        const corners = [[h / 2 - rr, w / 2 - rr, 0], [-h / 2 + rr, w / 2 - rr, Math.PI / 2], [-h / 2 + rr, -w / 2 + rr, Math.PI], [h / 2 - rr, -w / 2 + rr, Math.PI * 1.5]];
        for (const [a, b, a0] of corners) for (let k = 0; k <= st; k++) { const ang = a0 + Math.PI / 2 * k / st; pts.push([a + Math.cos(ang) * rr, b + Math.sin(ang) * rr]); }
        return pts;
    }
    /** A round section of `sides`, radius r (a function of the angle moves it in or out). */
    function roundSection(r, sides, phase) {
        const out = [];
        for (let k = 0; k < sides; k++) { const a = (phase || 0) + k / sides * Math.PI * 2; const rr = typeof r === 'function' ? r(a) : r; out.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
        return out;
    }

    // ── small solids ───────────────────────────────────────────────────────
    /** A band round an axis: from `base` along `dir`, `len` long, standing `h` proud of radius `r`, its edges chamfered. */
    function band(base, dir, r, len, h, o) {
        const c = Math.min(h * 0.7, len * 0.3), sides = o && o.sides;
        return Mesh.lathe([[r * 0.98, 0], [r + h - c, 0], [r + h, c], [r + h, len - c], [r + h - c, len], [r * 0.98, len]], sides || 16, { base, dir, sharp: 0.85 });
    }
    /** A rivet's dome on a face. */
    function rivet(at, n, r) { return Mesh.lathe([[r, 0], [r, r * 0.25], [r * 0.72, r * 0.62], [0, r * 0.78]], 8, { base: at, dir: n, sharp: 0.3 }); }
    /** A square bar from p0 to p1, `w` across, `h` deep along `up`. */
    function bar(p0, p1, up, w, h) {
        const T = norm(sub(p1, p0)), N = norm(sub(up, mul(T, dot(up, T)))), B = cross(T, N), g = new CM.Geo();
        const c = (p, a, b) => add(p, add(mul(N, a), mul(B, b)));
        const q = [[h / 2, w / 2], [-h / 2, w / 2], [-h / 2, -w / 2], [h / 2, -w / 2]];
        const A = q.map(([a, b]) => c(p0, a, b)), Bq = q.map(([a, b]) => c(p1, a, b));
        const out = [N, mul(B, 1), mul(N, -1), mul(B, -1)];
        const sideN = [norm(add(N, B)), norm(sub(B, N)), norm(mul(add(N, B), -1)), norm(sub(N, B))];
        for (let j = 0; j < 4; j++) { const j2 = (j + 1) % 4; g.poly([A[j], A[j2], Bq[j2], Bq[j]], null, sideN[j]); }
        g.poly(A, null, mul(T, -1)); g.poly(Bq, null, T);
        void out;
        return g.done();
    }
    /** A faceted spike or cone from `base` along `dir`. */
    function spike(base, dir, r, len, sides, o) {
        return facet(Mesh.lathe((o && o.collar ? [[r * 0.8, 0], [r, len * 0.08]] : [[r, 0]]).concat([[0, len]]), Math.max(3, sides | 0), { base, dir, phase: (o && o.phase) || 0, sharp: 2 }));
    }
    /** A crystal: a faceted prism with pointed ends. */
    function gem(base, dir, r, len, sides, o) {
        const p = o && o.prism !== undefined ? o.prism : 0.45, low = o && o.low !== undefined ? o.low : 0.18;
        return facet(Mesh.lathe([[0, 0], [r * 0.82, len * low], [r, len * (low + 0.06)], [r * 0.9, len * (low + p)], [0, len]], Math.max(3, sides | 0), { base, dir, phase: (o && o.phase) || 0, sharp: 2 }));
    }
    /** Every face flat: each triangle its own corners and normal. */
    function facet(mesh) {
        const I = mesh.index, P = mesh.positions, T = mesh.uvs, n = I.length;
        const out = { positions: new Float32Array(n * 3), normals: new Float32Array(n * 3), uvs: new Float32Array(n * 2), index: new Uint32Array(n) };
        for (let t = 0; t < n; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const fn = norm(cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]));
            for (let k = 0; k < 3; k++) {
                const v = I[t + k];
                out.positions.set([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], (t + k) * 3);
                out.normals.set(fn, (t + k) * 3);
                if (T) out.uvs.set([T[v * 2], T[v * 2 + 1]], (t + k) * 2);
                out.index[t + k] = t + k;
            }
        }
        return out;
    }
    /** A mesh moved by a matrix-like turn: `f(p)` for points; normals turned by `f(p) - f(0)`. Mirrors flip the winding. */
    function apply(mesh, f, mirrored) {
        const o = f([0, 0, 0]);
        Mesh.transform(mesh, f, nn => sub(f(nn), o));
        if (mirrored) { const I = mesh.index; for (let t = 0; t < I.length; t += 3) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; } }
        return mesh;
    }
    const copy = m => ({ positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals), uvs: Float32Array.from(m.uvs || new Float32Array(m.positions.length / 3 * 2)), index: Uint32Array.from(m.index) });
    /** A copy mirrored across one axis (0 x, 1 y, 2 z), its faces still outward. */
    function mirror(mesh, axis) { return apply(copy(mesh), p => { const q = p.slice(); q[axis] = -q[axis]; return q; }, true); }
    /** Turns about z by `a` (radians), then moves by `t`. */
    const rotZ = (a, t) => p => { const c = Math.cos(a), s = Math.sin(a), d = t || [0, 0, 0]; return [p[0] * c - p[1] * s + d[0], p[0] * s + p[1] * c + d[1], p[2] + d[2]]; };
    const rotX = (a, t) => p => { const c = Math.cos(a), s = Math.sin(a), d = t || [0, 0, 0]; return [p[0] + d[0], p[1] * c - p[2] * s + d[1], p[1] * s + p[2] * c + d[2]]; };
    const rotY = (a, t) => p => { const c = Math.cos(a), s = Math.sin(a), d = t || [0, 0, 0]; return [p[0] * c + p[2] * s + d[0], p[1] + d[1], -p[0] * s + p[2] * c + d[2]]; };
    /** A plate laid on a frame: its x along `u`, y along `v`, z along u x v, from `o`. */
    const onFrame = (o, u, v) => { const n = cross(u, v); return p => add(o, add(add(mul(u, p[0]), mul(v, p[1])), mul(n, p[2]))); };

    // ── rune inlays ────────────────────────────────────────────────────────
    // Made-up glyphs, each a few strokes in a 1 x 1 box (x across, y up).
    const GLYPHS = [
        [[0, 0, 0, 1], [0, 1, 0.6, 0.7], [0, 0.6, 0.6, 0.3]], [[0, 0, 0, 1], [0, 1, 0.6, 0.5], [0.6, 0.5, 0, 0]], [[0.3, 0, 0.3, 1], [0, 0.75, 0.6, 0.45]],
        [[0, 0, 0, 1], [0.6, 0, 0.6, 1], [0, 0.65, 0.6, 0.35]], [[0.3, 0, 0.3, 1], [0, 1, 0.3, 0.7], [0.6, 1, 0.3, 0.7]], [[0, 0, 0.3, 1], [0.3, 1, 0.6, 0], [0.12, 0.4, 0.48, 0.4]],
        [[0, 1, 0.6, 0], [0, 0, 0.6, 1]], [[0.3, 0, 0.3, 1], [0, 0.3, 0.3, 0.6], [0.6, 0.3, 0.3, 0.6]], [[0, 0, 0, 1], [0, 1, 0.6, 1], [0, 0.5, 0.45, 0.5]],
        [[0.3, 0, 0.3, 0.6], [0.3, 0.6, 0, 1], [0.3, 0.6, 0.6, 1]], [[0, 0.5, 0.3, 1], [0.3, 1, 0.6, 0.5], [0.6, 0.5, 0.3, 0], [0.3, 0, 0, 0.5]], [[0, 0, 0.6, 0], [0.3, 0, 0.3, 1], [0, 1, 0.6, 1]]
    ];
    /**
     * A row of runes on a flat face: glyphs `size` tall from `from` along
     * `dir` (unit, in the face), the face's normal `n`; strokes `w` wide
     * standing `h` proud. `seed` picks the glyphs.
     */
    function runes(from, dir, n, count, size, seed, o) {
        const w = (o && o.w) || size * 0.12, h = (o && o.h) || 0.0005, up = norm(cross(n, dir)), list = [];
        let s = (seed >>> 0) || 7;
        const next = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s >>> 8; };
        for (let k = 0; k < count; k++) {
            const g = GLYPHS[next() % GLYPHS.length], o0 = add(from, mul(dir, k * size * 0.95));
            for (const [x0, y0, x1, y1] of g) {
                const a = add(o0, add(mul(dir, x0 * size), mul(up, (y0 - 0.5) * size))), b = add(o0, add(mul(dir, x1 * size), mul(up, (y1 - 0.5) * size)));
                const d = norm(sub(b, a));
                list.push(bar(add(a, add(mul(d, -w * 0.4), mul(n, h * 0.3))), add(b, add(mul(d, w * 0.4), mul(n, h * 0.3))), n, w, h));
            }
        }
        return Mesh.merge(list);
    }

    // ── materials ──────────────────────────────────────────────────────────
    const METALS = [['steel', 'Steel'], ['dark', 'Blackened steel'], ['iron', 'Forged iron'], ['bronze', 'Bronze'], ['gold', 'Gilded'], ['silver', 'Silver']];
    const LOOK = {
        steel: { color: '#c3c8cf', edge: '#e8ecf0', roughness: 0.3, metalness: 0.95 }, dark: { color: '#45484f', edge: '#a4aab2', roughness: 0.42, metalness: 0.85 },
        iron: { color: '#77716b', edge: '#c9c6c0', roughness: 0.55, metalness: 0.85 }, bronze: { color: '#a8823f', edge: '#e0c07a', roughness: 0.36, metalness: 0.9 },
        gold: { color: '#d4ad48', edge: '#f4dc8a', roughness: 0.26, metalness: 0.95 }, silver: { color: '#dfe2e8', edge: '#f6f8fb', roughness: 0.2, metalness: 0.95 },
        black: { color: '#2a2a2e', edge: '#7a7c82', roughness: 0.45, metalness: 0.75 }
    };
    const TRIMS = [['steel', 'Steel'], ['gold', 'Gilded'], ['bronze', 'Bronze'], ['black', 'Black iron'], ['silver', 'Silver']];
    const WOODS = [['oak', 'Oak'], ['ash', 'Ash'], ['walnut', 'Walnut'], ['ebony', 'Ebony'], ['yew', 'Yew'], ['pale', 'Bleached wood']];
    const WOOD = { oak: '#7a5232', ash: '#b08c5c', walnut: '#5a3a22', ebony: '#2c221d', yew: '#a8622e', pale: '#cbbd9e' };
    const look = id => LOOK[id] || LOOK.steel;
    /** A color darkened to `k` of itself (0 black, 1 as it is). */
    const shadeHex = (hex, k) => '#' + Paint.hex(hex).map(c => Math.round(c * k).toString(16).padStart(2, '0')).join('');

    /** Wood grain for a turned shaft: u round it, v along it, repeating. */
    function woodPicture(base, seed, name) {
        const c = Paint.hex(base), n1 = Paint.noise(seed || 3, 8), n2 = Paint.fractal((seed || 3) + 9, 16, 3);
        const pic = Paint.paint(128, 256, (u, v, out) => {
            const warp = n1(u, v) * 3 + n2(u * 2, v) * 1.5;
            const grain = 0.5 + 0.5 * Math.sin((u * 14 + warp) * Math.PI * 2);
            const streak = Math.pow(Math.max(0, Math.sin((u * 31 + warp * 1.7) * Math.PI * 2)), 18);
            const k = 0.74 + 0.2 * grain + 0.16 * (n2(u * 3, v * 2) - 0.5) - 0.22 * streak;
            out[0] = Math.min(255, c[0] * k); out[1] = Math.min(255, c[1] * k); out[2] = Math.min(255, c[2] * k); out[3] = 255;
        }, 1);
        pic.name = name || 'wood.png'; pic.repeat = true;
        return pic;
    }
    /** A grip's wrap: leather in spiral strips with a dark seam, cord in diamonds, or a plain worn hide. */
    function wrapPicture(style, base, name) {
        const c = Paint.hex(base);
        const pic = Paint.paint(128, 256, (u, v, out) => {
            let k;
            if (style === 'cord') { const a = ((u * 2 + v * 6) % 1 + 1) % 1, b = ((u * 2 - v * 6) % 1 + 1) % 1; const ridge = Math.min(Math.abs(a - 0.5), Math.abs(b - 0.5)); k = ridge < 0.08 ? 1.2 : 0.78 + 0.22 * Math.sin(a * Math.PI) * Math.sin(b * Math.PI); }
            else { const f = ((u + v * 5) % 1 + 1) % 1; k = 0.74 + 0.26 * Math.sin(f * Math.PI) - (f < 0.07 ? 0.32 : 0) + ((Math.floor(v * 90) % 2) && f > 0.1 && f < 0.14 ? 0.12 : 0); }
            out[0] = Math.min(255, c[0] * k); out[1] = Math.min(255, c[1] * k); out[2] = Math.min(255, c[2] * k); out[3] = 255;
        }, 1);
        pic.name = name || 'wrap.png'; pic.repeat = true;
        return pic;
    }

    /** A turned shaft (wood or metal): radius `r(t)` along it from `a` to `b`, t in 0..1; uvs u round, v in half meters. */
    function shaft(a, b, r, segments, o) {
        const opt = o || {}, steps = opt.steps || 24, d = sub(b, a), L = Math.hypot(...d), prof = [];
        for (let k = 0; k <= steps; k++) { const t = k / steps; prof.push([r(t), t * L]); }
        const m = Mesh.lathe(prof, segments || 12, { base: a, dir: d, sharp: 0.2, caps: opt.caps });
        const V = m.uvs;
        // Uvs: v in units of `opt.v` meters (0.5 by default) so a picture repeats along the length.
        for (let i = 0; i < V.length; i += 2) V[i + 1] = (1 - V[i + 1]) * L / (opt.v || 0.5);
        return m;
    }
    /** A spiral strap round a shaft from `a` to `b` (radius `r`), `turns` round. */
    function strap(a, b, r, turns, thick, o) {
        const d = sub(b, a), L = Math.hypot(...d), T = norm(d), [U, V] = Mesh.basis(T), pts = [], steps = Math.max(12, Math.round(turns * 14));
        for (let k = 0; k <= steps; k++) { const t = k / steps, ang = t * turns * Math.PI * 2 + ((o && o.phase) || 0); pts.push(add(a, add(mul(T, t * L), add(mul(U, Math.cos(ang) * r), mul(V, Math.sin(ang) * r))))); }
        return tube(pts, thick, (o && o.sides) || 6);
    }
    /** A round tube along points, closed at both ends (its caps share its rim, so it is one solid); `r` a number or r(k). */
    function tube(pts, r, sides, o) {
        const n = Math.max(3, sides | 0);
        return sweep(pts, k => roundSection(typeof r === 'function' ? r(k) : r, n), Object.assign({ cos: COS.soft }, o || {}));
    }

    const linear = hex => Paint.hex(hex).map(c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });

    // ── the build's end: on the floor, with the hand's markers ──────────────
    const rigid = mesh => {
        const n = mesh.positions.length / 3, w = new Float32Array(n * 4);
        for (let i = 0; i < w.length; i += 4) w[i] = 1;
        return Object.assign(mesh, { joints: new Uint16Array(n * 4), weights: w });
    };
    /** Weapon space to the world: lying flat, +z up (the sword's turn). */
    const flat = ([x, y, z]) => [x, z, -y];

    /**
     * Parts made into a held prop: `P` maps a part name to { meshes, look }
     * (look: color, roughness, metalness, emissive?, texture?, mat? for its
     * finish map); `marks` the markers in weapon space; `o.template` the hand
     * rig ('blade' or 'gun'), `o.toWorld` another lay (default flat), `o.light`
     * { at, color, radius } a glow light for model.json.
     */
    function finish(kind, recipe, P, marks, textures, o) {
        const opt = o || {}, toWorld = opt.toWorld || flat, parts = [];
        for (const [name, entry] of Object.entries(P)) {
            const list = entry.meshes.filter(m => m && m.index && m.index.length);
            if (!list.length) continue;
            const m = Mesh.merge(list);
            const part = Object.assign(m, { name }, entry.look);
            delete part.mat; delete part.tint;
            parts.push(part);
            part._mat = entry.look.mat;
            // A tint over the part's color by where each point is (weapon space): `tint.at(p)` 0..1 toward `tint.color`.
            if (entry.look.tint) { const P = m.positions, k = new Float32Array(P.length / 3); for (let i = 0; i < k.length; i++) k[i] = Math.max(0, Math.min(1, entry.look.tint.at([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]]))); part._tint = { k, color: entry.look.tint.color }; }
        }
        Surface.apply(parts, textures, p => p._mat || null);
        for (const p of parts) { delete p._mat; Mesh.transform(p, toWorld, toWorld); }
        let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]); }
        const shift = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2], move = p => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
        for (const p of parts) {
            Mesh.transform(p, move); Object.assign(p, rigid(p)); Mesh.shade(p);
            if (p._tint) {
                const to = linear(p._tint.color), C = p.colors, k = p._tint.k;
                for (let i = 0; i < k.length; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += (to[j] - C[i * 3 + j]) * k[i];
                delete p._tint;
            }
        }
        const round = v => Math.round(v * 10000) / 10000, markers = {};
        for (const [k, v] of Object.entries(marks)) if (v) markers[k] = move(toWorld(v)).map(round);
        let tall = 0;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) tall = Math.max(tall, p.positions[i]);
        // A thing with no hand rig (a quiver) is a plain prop.
        const template = opt.template === null ? null : opt.template || 'blade', extra = template ? { rig: { template, markers } } : {};
        if (opt.light) {
            const at = move(toWorld(opt.light.at)).map(round);
            extra.effects = [{ name: 'Glow light', type: 'light', trigger: 'always', occlude: false, anchor: { part: '', offset: at }, light: { type: 'point', radius: opt.light.radius || 2.5, color: opt.light.color, intensity: 0.9, pulse: { min: 0.75, max: 1, period: 150 } } }];
        }
        return {
            kind, recipe, parts, bones: [{ name: 'Prop', head: [0, 0, 0], parent: -1 }], clips: [], loop: null, textures, cloth: null,
            height: Math.max(0.05, tall), wall: null, length: round(Math.max(hi[0] - lo[0], hi[2] - lo[2])), markers, sidecarExtra: extra, holdable: template || undefined,
            // The Prop Builder looks down on a weapon lying flat (and at a standing one from lower).
            previewPitch: opt.pitch ?? (opt.toWorld ? 0.3 : 0.92)
        };
    }

    // ── the page ───────────────────────────────────────────────────────────
    /** Small line icons for the catalog (24 x 24, currentColor), added beside the ones it has. */
    const ICONS = {
        axe: '<path d="M7 21L17 4"/><path d="M13 7c3-3 7-3 8-1-1 3-3 6-6 6"/>',
        hammer: '<path d="M8 21l7-12"/><path d="M11 4l8 4-2 4-8-4z"/>',
        mace: '<path d="M7 21l6-10"/><circle cx="15.5" cy="7.5" r="3.5"/><path d="M15.5 2v2m4 3.5h2M19 4l-1.5 1.5"/>',
        spear: '<path d="M4 20L16 8"/><path d="M15 9l1-5 4-1-1 4z"/>',
        polearm: '<path d="M4 20L17 7"/><path d="M15 9c-2-3-1-6 2-7 1 3 3 5 5 5-1 2-4 3-7 2z"/>',
        trident: '<path d="M12 22V6"/><path d="M6 3v5c0 2 3 3 6 3s6-1 6-3V3M12 2v4"/>',
        scythe: '<path d="M8 22L16 3"/><path d="M15 5C11 3 6 4 3 8c4-1 8-1 11 1"/>',
        bow: '<path d="M6 3c8 3 8 15 0 18"/><path d="M6 3v18"/><path d="M4 12h15m-3-2l3 2-3 2"/>',
        crossbow: '<path d="M3 9c5-3 13-3 18 0"/><path d="M3 9l9 3 9-3M12 6v15m-2-3h4"/>',
        arrow: '<path d="M4 20L19 5"/><path d="M15 5h4v4M4 20l2-5m-2 5l5-2"/>',
        quiver: '<path d="M8 8h8l-1 13H9z"/><path d="M10 8l-1-5m3 5V2m2 6l1-5"/>',
        staff: '<path d="M8 22L15 8"/><circle cx="16.5" cy="5.5" r="3"/><path d="M13 7l-1-3m6 5l3 1"/>',
        wand: '<path d="M5 20L15 10"/><path d="M17 3l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
        shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M12 7v10M8 11h8"/>',
        buckler: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>'
    };
    function icons(Catalog) { for (const [k, v] of Object.entries(ICONS)) if (!Catalog.ICONS[k]) Catalog.ICONS[k] = v; }

    /**
     * A weapon kind's page (RRPropCatalog.ui): Shape (its styles as one-click
     * tiles, Shuffle for a new take on the style, then `spec.shape`'s sizes)
     * and Look (`spec.look`). Picking a style keeps the look (`spec.keep`).
     */
    function page(spec) {
        const keep = spec.keep || ['metal', 'trim', 'wood', 'wrap', 'wrapColor', 'runes', 'glow'];
        return {
            placeholder: spec.placeholder,
            tabs: spec.tabs || [['shape', 'Shape'], ['look', 'Look']],
            reset: recipe => spec.normalize({ preset: recipe.preset }),
            panel(tab) {
                const r = this.recipe;
                if (tab === 'shape') {
                    const list = spec.PRESETS.filter(p => !spec.styles || spec.styles(p, r)).map(p => ({ id: p[0], label: p[1] }));
                    return this._section('Style') + this._tiles('weapon-style', list, r.preset, 2)
                        + `<button class="rr-btn-chip rr-prop-shuffle" data-act="weapon-shuffle" title="${this._t('A new take on this style: its size, shape, details and colors')}">🎲 ${this._t('Shuffle')}</button>`
                        + this._section('Size') + spec.shape.call(this, r);
                }
                return spec.look.call(this, r, tab);
            },
            act(act, b) {
                const r = this.recipe;
                if (act === 'weapon-style') {
                    if (b.dataset.id === r.preset) return;
                    const next = { kind: r.kind, preset: b.dataset.id };
                    for (const k of keep) if (r[k] !== undefined) next[k] = JSON.parse(JSON.stringify(r[k]));
                    this._replace(spec.normalize(next));
                    return;
                }
                if (act === 'weapon-shuffle') this._replace(spec.random((Math.random() * 4294967296) >>> 0, r, 'all', true));
            }
        };
    }

    const api = {
        ICONS, icons, page,
        clamp, color, pick, vec: { sub, add, mul, dot, cross, norm, lerp }, COS,
        area, wind, offsetLeft, arc, quad, cubic, path, circle, curve, triangulate, refine, densify,
        plate, ridge, sweep, roundRect, roundSection, band, rivet, bar, tube, spike, gem, facet, apply, copy, mirror, rotX, rotY, rotZ, onFrame, runes, GLYPHS,
        METALS, LOOK, TRIMS, WOODS, WOOD, look, shadeHex, woodPicture, wrapPicture, shaft, strap, rigid, flat, finish
    };
    root.RRWeaponKit = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
