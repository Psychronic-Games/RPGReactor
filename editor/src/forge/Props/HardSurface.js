/**
 * RRHardSurface - machined, moulded and stamped solids for hard-surface props
 * (firearms first; vehicles, mechs and containers next): flat plates with
 * chamfered edges, through-holes and recessed panels, as plain arrays
 * ({ positions, normals, uvs, index }) that PropMesh.merge takes.
 *
 * Why chamfers: a rounded (smoothed) edge spreads light over the whole
 * face and reads soft and low-poly; a 45-degree chamfer strip with its own
 * flat normal catches a thin bright line along every edge, as the bevels on
 * a sword blade do (SwordProp blade()). A box this way is 44 triangles; a
 * plate (front and back chamfered, sides square) 28.
 *
 *   plate(outline, thickness, chamfer, options)
 *     outline: [x0, y0, x1, y1, ...] or [[x, y], ...], any winding, convex
 *       or not (non-convex outlines and holes are triangulated by three's
 *       ShapeUtils, so they need THREE on the global object).
 *     The plate lies in the outline's plane (x, y), `thickness` across z,
 *     centered on z = 0 unless `options.center` moves it.
 *     options:
 *       holes:  [outline, ...]  through-holes (a skeleton stock, a trigger
 *               guard's loop, a carry handle), chamfered on both faces.
 *       inset:  { outline | margin, depth, draft, side, apart } or a list of
 *               them: a recessed panel (an ejection port, a vent, a sunk
 *               glow strip). `margin` takes the face's own outline in by
 *               that much; `side` 'front' (+z, default), 'back' or 'both';
 *               `draft` slopes the recess walls in (default a third of the
 *               depth, so they catch light); with `apart` the recess floors
 *               come back as `mesh.floor` (for a darker or glowing
 *               material) instead of inside the mesh.
 *       back:   'chamfer' (default), 'flat' (square back edge) or 'open'
 *               (no back face, for a plate laid on another surface).
 *       smooth: degrees: outline corners that turn less than this share a
 *               side normal (a curve reads round); sharper corners stay crisp.
 *               Default 30.
 *       frame:  { o, u, v, n } to place the plate on any plane: the outline's
 *               x along u, y along v, thickness along n (unit vectors).
 *       uvScale: uvs in meters times this (default 1).
 *
 *   chamferedBox(center, size, chamfer, options) - a box with every edge and
 *     corner cut flat (44 triangles); options.skip names faces left out
 *     ('-y' for one standing on something).
 *
 *   Outline helpers, all returning [[x, y], ...]:
 *     rect(x0, y0, x1, y1); cut(outline, size, which) clips corners at 45
 *     degrees (`which` a list of corner indices, default all); round(outline,
 *     radius, steps, which) fillets corners; slot(cx, cy, length, height,
 *     steps) a stadium; circle(cx, cy, r, sides); offset(outline, d) moves
 *     an outline in (d > 0) or out.
 *
 *   turn(mesh, axis, angle, pivot) spins a mesh about the x, y or z axis.
 *
 * Uvs are meters across each face and along each edge (perimeter, depth),
 * never collapsed, so a tangent-space normal map has a frame everywhere.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const CM = need('RRContainerMesh', './ContainerMesh.js');

    const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

    // ── outlines ───────────────────────────────────────────────────────────
    /** [[x, y], ...] from a flat list or pairs, without repeats or a closing copy of the first point. */
    function points(outline) {
        const raw = Array.isArray(outline[0]) ? outline.map(p => [+p[0], +p[1]]) : [];
        if (!raw.length) for (let i = 0; i + 1 < outline.length; i += 2) raw.push([+outline[i], +outline[i + 1]]);
        const out = [];
        for (const p of raw) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-9) out.push(p); }
        while (out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-9) out.pop();
        return out;
    }
    /** Without points that sit on a straight run (the triangulator would drop them and leave a T-junction against the walls). */
    function straight(pts) {
        let out = pts, again = true;
        while (again && out.length > 3) {
            again = false;
            for (let k = 0; k < out.length; k++) {
                const a = out[(k + out.length - 1) % out.length], p = out[k], b = out[(k + 1) % out.length];
                const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
                if (Math.abs(e1[0] * e2[1] - e1[1] * e2[0]) <= 1e-9 * Math.hypot(...e1) * Math.hypot(...e2) && e1[0] * e2[0] + e1[1] * e2[1] > 0) { out = out.filter((_, i) => i !== k); again = true; break; }
            }
        }
        return out;
    }
    const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
    const wound = (pts, ccw) => ((area(pts) > 0) === ccw ? pts : pts.slice().reverse());

    /**
     * An outline moved to the left of travel by `d` (into the solid for a
     * counterclockwise outside or a clockwise hole); miters held to 4x so a
     * sharp point does not shoot off.
     */
    function shift(pts, d) {
        const n = pts.length;
        const out = pts.map((p, k) => {
            const a = pts[(k + n - 1) % n], b = pts[(k + 1) % n];
            let e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
            const l1 = Math.hypot(e1[0], e1[1]) || 1, l2 = Math.hypot(e2[0], e2[1]) || 1;
            e1 = [e1[0] / l1, e1[1] / l1]; e2 = [e2[0] / l2, e2[1] / l2];
            const n1 = [-e1[1], e1[0]], n2 = [-e2[1], e2[0]], c = 1 + n1[0] * n2[0] + n1[1] * n2[1];
            let m = c > 1e-6 ? [(n1[0] + n2[0]) / c, (n1[1] + n2[1]) / c] : n2;
            const ml = Math.hypot(m[0], m[1]);
            if (ml > 4) m = [m[0] / ml * 4, m[1] / ml * 4];
            return [p[0] + m[0] * d, p[1] + m[1] * d];
        });
        // An edge shorter than the move turns inside out: fold it to a point (the loops stay corner for corner).
        for (let k = 0; k < n; k++) {
            const j = (k + 1) % n, a = pts[k], b = pts[j], p = out[k], q = out[j];
            if ((b[0] - a[0]) * (q[0] - p[0]) + (b[1] - a[1]) * (q[1] - p[1]) <= 0) { const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; out[k] = mid; out[j] = mid.slice(); }
        }
        return out;
    }
    /** An outline taken in by `d` (out when negative), whatever its winding; its corners keep their order. */
    function offset(outline, d) {
        const pts = points(outline), ccw = area(pts) > 0, out = shift(ccw ? pts : pts.slice().reverse(), d);
        // Taken in past its own middle, nothing is left (an empty outline, which a plate skips).
        if (d > 0 && !(area(out) > 1e-10)) return [];
        return ccw ? out : out.reverse();
    }

    const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const circle = (cx, cy, r, sides) => Array.from({ length: sides || 12 }, (_, k) => { const a = k / (sides || 12) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
    /** A stadium `length` long (along x) and `height` tall, its ends round (standing up when it is taller than long). */
    function slot(cx, cy, length, height, steps) {
        if (height > length) return slot(0, 0, height, length, steps).map(([x, y]) => [cx - y, cy + x]);
        const r = Math.min(height, length) / 2, s = Math.max(1, steps || 3), hl = length / 2 - r, out = [];
        for (let k = 0; k <= s * 2; k++) { const a = -Math.PI / 2 + k / (s * 2) * Math.PI; out.push([cx + hl + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        for (let k = 0; k <= s * 2; k++) { const a = Math.PI / 2 + k / (s * 2) * Math.PI; out.push([cx - hl + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        return points(out);
    }
    const corners = (pts, which) => (which ? new Set(which.map(k => ((k % pts.length) + pts.length) % pts.length)) : null);
    /** Corners clipped at 45 degrees: `size` along each edge (a number, or per corner). */
    function cut(outline, size, which) {
        const pts = points(outline), only = corners(pts, which), n = pts.length, out = [];
        pts.forEach((p, k) => {
            const s = Array.isArray(size) ? size[k] || 0 : size;
            if (!s || (only && !only.has(k))) { out.push(p); return; }
            const a = pts[(k + n - 1) % n], b = pts[(k + 1) % n], la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
            const ta = Math.min(s, la * 0.45), tb = Math.min(s, lb * 0.45);
            out.push([p[0] + (a[0] - p[0]) / la * ta, p[1] + (a[1] - p[1]) / la * ta], [p[0] + (b[0] - p[0]) / lb * tb, p[1] + (b[1] - p[1]) / lb * tb]);
        });
        return out;
    }
    /** Corners filleted by `radius` in `steps` (a quadratic arc). */
    function round(outline, radius, steps, which) {
        const pts = points(outline), only = corners(pts, which), n = pts.length, out = [], s = Math.max(1, steps || 3);
        pts.forEach((p, k) => {
            const r = Array.isArray(radius) ? radius[k] || 0 : radius;
            if (!r || (only && !only.has(k))) { out.push(p); return; }
            const a = pts[(k + n - 1) % n], b = pts[(k + 1) % n], la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
            const ta = Math.min(r, la * 0.45), tb = Math.min(r, lb * 0.45);
            const p0 = [p[0] + (a[0] - p[0]) / la * ta, p[1] + (a[1] - p[1]) / la * ta], p2 = [p[0] + (b[0] - p[0]) / lb * tb, p[1] + (b[1] - p[1]) / lb * tb];
            for (let j = 0; j <= s; j++) { const t = j / s, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * p[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p[1] + t * t * p2[1]]); }
        });
        return points(out);
    }

    /**
     * Holes and recesses turned a hair (micro-radians, a few microns at their
     * ends), each by its own amount: rows of identical cuts then never share
     * a line, which would leave the face's triangulation with slivers and
     * T-junctions.
     */
    function twist(pts, k) {
        const a = ((k % 9) + 1) * 4e-4, c = Math.cos(a), s = Math.sin(a);
        let cx = 0, cy = 0;
        for (const p of pts) { cx += p[0] / pts.length; cy += p[1] / pts.length; }
        return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
    }

    function convex(pts) {
        let sign = 0;
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length], c = pts[(i + 2) % pts.length];
            const z = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
            if (Math.abs(z) < 1e-14) continue;
            if (sign && Math.sign(z) !== sign) return false;
            sign = Math.sign(z);
        }
        return true;
    }
    /** Triangles over an outline (counterclockwise) with holes: index triples into [outer, ...holes] flattened, each counterclockwise. */
    function triangulate(outer, holes) {
        let tris;
        if (!holes.length && convex(outer)) { tris = []; for (let i = 1; i + 1 < outer.length; i++) tris.push([0, i, i + 1]); }
        else {
            const THREE = root.THREE;
            if (!THREE || !THREE.ShapeUtils) throw new Error('three.js ShapeUtils is needed for a plate with holes or a concave outline');
            const V = list => list.map(p => new THREE.Vector2(p[0], p[1]));
            tris = THREE.ShapeUtils.triangulateShape(V(outer), holes.map(V)).map(t => t.slice());
        }
        const all = outer.concat(...holes);
        for (const t of tris) { const [a, b, c] = t.map(i => all[i]); if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) t.reverse(); }
        return { tris, all };
    }

    // ── the builder ────────────────────────────────────────────────────────
    class Build {
        constructor() { this.P = []; this.N = []; this.T = []; this.I = []; }
        /** A quad a-b-c-d (around), each corner its own normal and uv; turned to face `facing`. */
        quad(pts, normals, uvs, facing) {
            const e1 = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], e2 = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
            let f = cross(e1, e2);
            if (Math.hypot(f[0], f[1], f[2]) < 1e-16) { const e3 = [pts[3][0] - pts[0][0], pts[3][1] - pts[0][1], pts[3][2] - pts[0][2]]; f = cross(e2, e3); }
            if (Math.hypot(f[0], f[1], f[2]) < 1e-16) return;
            const flip = dot3(f, facing) < 0, base = this.P.length / 3;
            for (let i = 0; i < 4; i++) { this.P.push(...pts[i]); this.N.push(...normals[i]); this.T.push(...uvs[i]); }
            if (flip) this.I.push(base, base + 2, base + 1, base, base + 3, base + 2);
            else this.I.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        /** A flat face over outline + holes at height w, facing +z (up) or -z. */
        face(outer, holes, w, up, uvScale) {
            // Corners folded together by a chamfer are one point here (the bands keep both).
            outer = points(outer); holes = holes.map(points).filter(h => h.length >= 3);
            const { tris, all } = triangulate(outer, holes), base = this.P.length / 3;
            for (const p of all) { this.P.push(p[0], p[1], w); this.N.push(0, 0, up ? 1 : -1); this.T.push(p[0] * uvScale * (up ? 1 : -1), p[1] * uvScale); }
            for (const t of tris) { if (up) this.I.push(base + t[0], base + t[1], base + t[2]); else this.I.push(base + t[0], base + t[2], base + t[1]); }
        }
        done() { return { positions: Float32Array.from(this.P), normals: Float32Array.from(this.N), uvs: Float32Array.from(this.T), index: Uint32Array.from(this.I) }; }
    }

    /** Outward side normals at each corner of a loop, per edge end: [start, end] for edge k; shared where the turn is gentle. */
    function sideNormals(loop, cosSmooth) {
        const n = loop.length, edge = [];
        for (let k = 0; k < n; k++) { const a = loop[k], b = loop[(k + 1) % n], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; edge.push([(b[1] - a[1]) / l, -(b[0] - a[0]) / l]); }
        const at = k => { const p = edge[(k + n - 1) % n], q = edge[k]; if (p[0] * q[0] + p[1] * q[1] > cosSmooth) { const s = [p[0] + q[0], p[1] + q[1]], l = Math.hypot(s[0], s[1]) || 1; return [s[0] / l, s[1] / l]; } return null; };
        return edge.map((e, k) => [at(k) || e, at((k + 1) % n) || e]);
    }
    /** Perimeter distance at each corner (for uvs along an edge). */
    const perimeter = loop => { const out = [0]; for (let k = 0; k < loop.length; k++) { const a = loop[k], b = loop[(k + 1) % loop.length]; out.push(out[k] + Math.hypot(b[0] - a[0], b[1] - a[1])); } return out; };

    /**
     * A band around `loopA` (at height wa) to `loopB` (at wb), corner for
     * corner: the side wall (loopA = loopB) or a chamfer strip. `out` is the
     * outward side normal per edge end; `tilt` how much the face leans toward
     * +z (1) or -z (-1) (45 degrees for a chamfer).
     */
    function band(g, loopA, wa, loopB, wb, out, tilt, uvScale) {
        const n = loopA.length, s = perimeter(loopA);
        for (let k = 0; k < n; k++) {
            const j = (k + 1) % n, [na, nb] = out[k];
            const nrm = v => norm3([v[0], v[1], tilt]);
            const pts = [[loopA[k][0], loopA[k][1], wa], [loopA[j][0], loopA[j][1], wa], [loopB[j][0], loopB[j][1], wb], [loopB[k][0], loopB[k][1], wb]];
            const ns = [nrm(na), nrm(nb), nrm(nb), nrm(na)];
            const uv = [[s[k] * uvScale, wa * uvScale], [s[k + 1] * uvScale, wa * uvScale], [s[k + 1] * uvScale, wb * uvScale], [s[k] * uvScale, wb * uvScale]];
            const mid = out[k][0][0] + out[k][1][0], midy = out[k][0][1] + out[k][1][1];
            g.quad(pts, ns, uv, [mid, midy, tilt * 2]);
        }
    }

    /** Where a frame puts a local point/normal, and whether it mirrors. */
    function placer(F) {
        if (!F) return null;
        const u = norm3(F.u), v = norm3(F.v), n = norm3(F.n || cross(u, v)), o = F.o || [0, 0, 0];
        return { u, v, n, o, mirror: dot3(cross(u, v), n) < 0 };
    }
    function place(mesh, F) {
        if (!F) return mesh;
        const P = mesh.positions, N = mesh.normals;
        for (let i = 0; i < P.length; i += 3) {
            const x = P[i], y = P[i + 1], z = P[i + 2], a = N[i], b = N[i + 1], c = N[i + 2];
            for (let k = 0; k < 3; k++) { P[i + k] = F.o[k] + F.u[k] * x + F.v[k] * y + F.n[k] * z; N[i + k] = F.u[k] * a + F.v[k] * b + F.n[k] * c; }
        }
        if (F.mirror) for (let t = 0; t < mesh.index.length; t += 3) { const s = mesh.index[t + 1]; mesh.index[t + 1] = mesh.index[t + 2]; mesh.index[t + 2] = s; }
        return mesh;
    }

    function plate(outline, thickness, chamfer, options) {
        const o = options || {}, uvScale = o.uvScale || 1, cosSmooth = Math.cos((o.smooth ?? 30) * Math.PI / 180);
        const outer = wound(straight(points(outline)), true);
        if (outer.length < 3 || !(thickness > 0)) return { positions: new Float32Array(0), normals: new Float32Array(0), uvs: new Float32Array(0), index: new Uint32Array(0) };
        let cuts = 0;
        const holes = (o.holes || []).map(h => wound(straight(points(h)), false)).filter(h => h.length >= 3).map(h => twist(h, cuts++));
        const back = o.back || 'chamfer', twoSided = back === 'chamfer';
        let xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
        const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        const c = Math.max(0, Math.min(chamfer || 0, thickness * (twoSided ? 0.45 : 0.9), span * 0.25));
        const zc = o.center || 0, zf = zc + thickness / 2, zb = zc - thickness / 2;
        const g = new Build(), floors = new Build();
        const loops = [outer, ...holes];
        // Front (and back) faces, inside their chamfers; recessed panels cut out of them.
        const insets = [].concat(o.inset || []).filter(Boolean);
        const recesses = { front: [], back: [] };
        for (const r of insets) {
            const depth = Math.max(0, Math.min(r.depth ?? thickness * 0.25, thickness * 0.8 - c));
            if (!(depth > 0)) continue;
            const ring = twist(r.outline ? wound(straight(points(r.outline)), true) : shift(shift(outer, c), r.margin ?? c * 2), cuts++);
            if (ring.length < 3 || Math.abs(area(ring)) < 1e-12) continue;
            const sides = r.side === 'both' ? ['front', 'back'] : [r.side === 'back' ? 'back' : 'front'];
            for (const side of sides) recesses[side].push({ ring, depth, draft: r.draft ?? depth / 3, apart: !!r.apart });
        }
        const inner = loops.map(l => (c > 0 ? shift(l, c) : l));
        const normals = loops.map(l => sideNormals(l, cosSmooth));
        g.face(inner[0], inner.slice(1).concat(recesses.front.map(r => r.ring.slice().reverse())), zf, true, uvScale);
        if (back !== 'open') {
            const backHoles = (twoSided ? inner.slice(1) : loops.slice(1)).concat(recesses.back.map(r => r.ring.slice().reverse()));
            g.face(twoSided ? inner[0] : loops[0], backHoles, zb, false, uvScale);
        }
        loops.forEach((loop, k) => {
            const wTop = zf - c, wBottom = twoSided ? zb + c : zb;
            band(g, loop, wTop, loop, wBottom, normals[k], 0, uvScale);
            if (c > 0) band(g, loop, wTop, inner[k], zf, normals[k], 1, uvScale);
            if (c > 0 && twoSided) band(g, loop, wBottom, inner[k], zb, normals[k], -1, uvScale);
        });
        // Recesses: walls sloping in by the draft, a floor at the depth.
        for (const side of ['front', 'back']) for (const r of recesses[side]) {
            const up = side === 'front', w0 = up ? zf : zb, w1 = up ? zf - r.depth : zb + r.depth;
            // The draft held to a quarter of the recess's narrowest width (about 2 area / perimeter), so a slim slot keeps a floor.
            const per = perimeter(r.ring), draft = Math.min(r.draft, 0.25 * 2 * Math.abs(area(r.ring)) / (per[per.length - 1] || 1));
            const floor = draft > 0 ? shift(r.ring, draft) : r.ring;
            // The walls face into the recess: the ring's inward normals, leaning toward the open face.
            const inward = sideNormals(r.ring, cosSmooth).map(([a, b]) => [[-a[0], -a[1]], [-b[0], -b[1]]]);
            const lean = draft > 0 ? (up ? 1 : -1) * Math.min(1, draft / r.depth) : 0;
            band(g, r.ring, w0, floor, w1, inward, lean, uvScale);
            (r.apart ? floors : g).face(floor, [], w1, up, uvScale);
        }
        const F = placer(o.frame);
        const mesh = place(g.done(), F);
        if (floors.I.length) mesh.floor = place(floors.done(), F);
        return mesh;
    }

    /** A box with every edge and corner chamfered: 44 triangles. */
    function chamferedBox(center, size, chamfer, options) {
        return CM.chamferBox(center, size, chamfer, options && options.skip);
    }

    /** Spins a mesh about axis 'x', 'y' or 'z' by `angle` around `pivot`. */
    function turn(mesh, axis, angle, pivot) {
        const c = Math.cos(angle), s = Math.sin(angle), p0 = pivot || [0, 0, 0], P = mesh.positions, N = mesh.normals;
        const [i, j] = axis === 'x' ? [1, 2] : axis === 'y' ? [2, 0] : [0, 1];
        for (let v = 0; v < P.length; v += 3) {
            const a = P[v + i] - p0[i], b = P[v + j] - p0[j];
            P[v + i] = p0[i] + a * c - b * s; P[v + j] = p0[j] + a * s + b * c;
            const na = N[v + i], nb = N[v + j];
            N[v + i] = na * c - nb * s; N[v + j] = na * s + nb * c;
        }
        return mesh;
    }

    const api = { plate, chamferedBox, turn, points, offset, rect, circle, slot, cut, round, area };
    root.RRHardSurface = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
