/**
 * RRContainerMesh - the solids containers are made of, as plain arrays
 * ({ positions, normals, uvs, index }, optional joints and weights):
 * outlines turned about an axis, boxes with chamfered edges, flat-faced
 * slabs on a plane, tubes swept along a path and recessed screen housings.
 *
 * Every piece carries its own natural uvs (meters, or turns around an
 * axis); the caller maps them into its picture. Normals are flat across a
 * face and smooth across a gentle bend (smoothNormals welds by position).
 */
(function(root) {
    'use strict';

    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

    function make(P, N, T, I) {
        return { positions: Float32Array.from(P), normals: Float32Array.from(N), uvs: Float32Array.from(T), index: Uint32Array.from(I) };
    }

    /** A growing mesh: flat polygons facing the way they are told. */
    class Geo {
        constructor() { this.P = []; this.N = []; this.T = []; this.I = []; }
        vert(p, n, t) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.T.push(t ? t[0] : 0, t ? t[1] : 0); return this.P.length / 3 - 1; }
        /** A convex polygon facing `facing`, its points in either order; `uvs` per point. */
        poly(pts, uvs, facing) {
            // Newell's normal: right for any convex polygon, whatever its first three points.
            let n = [0, 0, 0];
            for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); }
            if (Math.hypot(n[0], n[1], n[2]) < 1e-12) return;
            n = norm(n);
            const want = facing ? norm(facing) : n;
            const flip = dot(n, want) < 0;
            const order = pts.map((_, i) => i);
            if (flip) order.reverse();
            const base = this.P.length / 3, nn = facing ? want : n;
            for (const i of order) this.vert(pts[i], nn, uvs ? uvs[i] : null);
            for (let i = 1; i + 1 < order.length; i++) this.I.push(base, base + i, base + i + 1);
        }
        done() { return make(this.P, this.N, this.T, this.I); }
    }

    /**
     * An outline turned `segments` times about the y axis: `profile`
     * [[radius, height], ...] in order along the outline (up the outside,
     * over a rim, down the inside), each span its own band of faces. The
     * outside faces out when the outline runs up the outside. `o.radius(s,
     * y, r)` may move a point in or out (staves, dents); `o.phase` turns
     * the start (s = 0 at the back, -z, by default) and `o.turn` how much of
     * a full turn it makes (1). Uvs: [s around 0..1,
     * meters along the outline]. Points on the axis close as fans.
     */
    function revolve(profile, segments, o) {
        const opt = o || {}, seg = Math.max(1, segments | 0), phase = opt.phase ?? Math.PI, turn = opt.turn ?? 1;
        const P = [], N = [], T = [], I = [];
        let along = 0;
        const lengths = [0];
        for (let k = 1; k < profile.length; k++) { along += Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]); lengths.push(along); }
        const ring = (k) => {
            const [r0, y] = profile[k], start = P.length / 3;
            for (let s = 0; s <= seg; s++) {
                const f = s / seg * turn, a = phase + f * Math.PI * 2;
                const r = opt.radius && r0 > 0 ? opt.radius(f, y, r0, k) : r0;
                P.push(r * Math.sin(a), y, r * Math.cos(a)); N.push(Math.sin(a), 0, Math.cos(a)); T.push(f, lengths[k]);
            }
            return start;
        };
        for (let k = 0; k + 1 < profile.length; k++) {
            const a = ring(k), b = ring(k + 1);
            const onA = profile[k][0] <= 0, onB = profile[k + 1][0] <= 0;
            for (let s = 0; s < seg; s++) {
                // Winding (Prop Builder fix 2026-10-18): counterclockwise seen from outside.
                if (!onA) I.push(a + s, a + s + 1, b + s);
                if (!onB) I.push(a + s + 1, b + s + 1, b + s);
            }
        }
        const m = make(P, N, T, I);
        return smoothNormals(m, opt.crease ?? 0.72);
    }

    /**
     * Normals from the faces, shared by every point at one place whose faces
     * bend less than `cosLimit` from its own (a rim stays sharp, a round
     * side and a seam around it smooth).
     */
    function smoothNormals(mesh, cosLimit) {
        const P = mesh.positions, I = mesh.index, nv = P.length / 3, nt = I.length / 3;
        const FN = new Float32Array(nt * 3);
        const own = new Float32Array(nv * 3);
        for (let t = 0; t < nt; t++) {
            const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
            const n = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
            FN[t * 3] = n[0]; FN[t * 3 + 1] = n[1]; FN[t * 3 + 2] = n[2];
            for (const v of [a, b, c]) { own[v] += n[0]; own[v + 1] += n[1]; own[v + 2] += n[2]; }
        }
        // Points at one place (to a tenth of a millimeter), and the faces at each.
        const key = i => Math.round(P[i * 3] * 1e4) + ',' + Math.round(P[i * 3 + 1] * 1e4) + ',' + Math.round(P[i * 3 + 2] * 1e4);
        const groups = new Map(), groupOf = new Int32Array(nv);
        for (let i = 0; i < nv; i++) { const k = key(i); let g = groups.get(k); if (g === undefined) { g = groups.size; groups.set(k, g); } groupOf[i] = g; }
        const faces = Array.from({ length: groups.size }, () => []);
        for (let t = 0; t < nt; t++) for (let j = 0; j < 3; j++) { const g = groupOf[I[t * 3 + j]], list = faces[g]; if (list[list.length - 1] !== t) list.push(t); }
        const out = new Float32Array(nv * 3);
        for (let i = 0; i < nv; i++) {
            const o = norm([own[i * 3], own[i * 3 + 1], own[i * 3 + 2]]);
            let sx = 0, sy = 0, sz = 0;
            for (const t of faces[groupOf[i]]) {
                const fx = FN[t * 3], fy = FN[t * 3 + 1], fz = FN[t * 3 + 2], l = Math.hypot(fx, fy, fz) || 1;
                if ((fx * o[0] + fy * o[1] + fz * o[2]) / l > cosLimit) { sx += fx; sy += fy; sz += fz; }
            }
            const n = sx || sy || sz ? norm([sx, sy, sz]) : o;
            out[i * 3] = n[0]; out[i * 3 + 1] = n[1]; out[i * 3 + 2] = n[2];
        }
        mesh.normals = out;
        return mesh;
    }

    /**
     * A box (`center`, `size`) with every edge cut off at 45 degrees by
     * `bevel`: six faces, twelve chamfers, eight corner triangles, each flat.
     * `skip` names faces left out ('-y' for one standing on the ground).
     * Uvs: meters across each face, as planarUv lays them.
     */
    function chamferBox(center, size, bevel, skip) {
        const h = size.map(v => v / 2), b = Math.max(0, Math.min(bevel, h[0] * 0.95, h[1] * 0.95, h[2] * 0.95));
        const g = new Geo(), skipSet = new Set(skip || []);
        const pt = (sx, sy, sz, axis) => {
            // The corner (sx, sy, sz) pulled in by the bevel on the two axes other than `axis`.
            const p = [sx * h[0], sy * h[1], sz * h[2]];
            for (let k = 0; k < 3; k++) if (k !== axis) p[k] -= [sx, sy, sz][k] * b;
            return add(center, p);
        };
        const uvOf = (p, n) => planarAt(sub(p, center), n);
        const face = (pts, n) => g.poly(pts, pts.map(p => uvOf(p, n)), n);
        const S = [-1, 1];
        // Faces.
        for (let ax = 0; ax < 3; ax++) for (const s of S) {
            const name = (s > 0 ? '+' : '-') + 'xyz'[ax];
            if (skipSet.has(name)) continue;
            const u = (ax + 1) % 3, v = (ax + 2) % 3, pts = [];
            for (const [cu, cv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const sg = [0, 0, 0]; sg[ax] = s; sg[u] = cu; sg[v] = cv; pts.push(pt(sg[0], sg[1], sg[2], ax)); }
            const n = [0, 0, 0]; n[ax] = s;
            face(pts, n);
        }
        if (b <= 0) return g.done();
        // Chamfers along each edge.
        for (let ax = 0; ax < 3; ax++) {
            const u = (ax + 1) % 3, v = (ax + 2) % 3;
            for (const su of S) for (const sv of S) {
                const nameU = (su > 0 ? '+' : '-') + 'xyz'[u], nameV = (sv > 0 ? '+' : '-') + 'xyz'[v];
                if (skipSet.has(nameU) && skipSet.has(nameV)) continue;
                const pts = [];
                for (const sa of [-1, 1]) for (const which of [u, v]) { const sg = [0, 0, 0]; sg[ax] = sa; sg[u] = su; sg[v] = sv; pts.push(pt(sg[0], sg[1], sg[2], which)); }
                const n = [0, 0, 0]; n[u] = su; n[v] = sv;
                face([pts[0], pts[1], pts[3], pts[2]], norm(n));
            }
        }
        // Corners.
        for (const sx of S) for (const sy of S) for (const sz of S) {
            if (skipSet.has((sy > 0 ? '+' : '-') + 'y') && sy < 0) continue;
            face([pt(sx, sy, sz, 0), pt(sx, sy, sz, 1), pt(sx, sy, sz, 2)], norm([sx, sy, sz]));
        }
        return g.done();
    }

    /** A closed box with circular edge fillets and spherical corners. The
     * flat panels stay flat; extra samples describe the curved edge only. */
    function roundedBox(center, size, radius, steps = 4) {
        if(Math.min(...size)<.008)return chamferBox(center,size,radius);
        const h=size.map(v=>Math.abs(v)/2),r=Math.max(0,Math.min(radius,...h.map(v=>v*.95)));
        if(r<1e-6)return chamferBox(center,size,0);
        const P=[],N=[],T=[],I=[],coordinates=k=>{
            const a=[];for(let j=0;j<=steps;j++)a.push(-h[k]+r*(1-Math.cos(j/steps*Math.PI/2)));
            return a.concat(a.map(v=>-v).reverse());
        };
        for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
            const u=(axis+1)%3,v=(axis+2)%3,A=coordinates(u),B=coordinates(v),base=P.length/3;
            for(const y of B)for(const x of A){
                const p=[0,0,0];p[axis]=sign*h[axis];p[u]=x;p[v]=y;
                const q=p.map((value,k)=>Math.max(-h[k]+r,Math.min(h[k]-r,value))),n=norm(sub(p,q));
                P.push(...add(center,add(q,scale(n,r))));N.push(...n);T.push(x,y);
            }
            for(let j=0;j<B.length-1;j++)for(let i=0;i<A.length-1;i++){
                const a=base+j*A.length+i,b=a+1,c=a+A.length,d=c+1;
                if(sign>0)I.push(a,b,c,b,d,c);else I.push(a,c,b,b,c,d);
            }
        }
        return make(P,N,T,I);
    }

    /** Planar uvs (meters) of a point relative to its piece, on the face it turns toward. */
    function planarAt(p, n) {
        const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
        if (az >= ax && az >= ay) return [n[2] > 0 ? p[0] : -p[0], -p[1]];
        if (ax >= ay) return [n[0] > 0 ? -p[2] : p[2], -p[1]];
        return [p[0], n[1] > 0 ? p[2] : -p[2]];
    }

    /**
     * A flat piece on a plane: the convex outline `poly` ([u0, v0, u1, v1,
     * ...] meters in the frame) raised `depth` along the frame's normal, its
     * front edges chamfered by `bevel`. The back (on the plane) is left
     * open unless `back`. Frame: { o, u, v, n } (n = u x v). Uvs: the
     * front's (u, v); the sides' along the edge and up.
     */
    function slab(poly, F, depth, bevel, back) {
        const n = poly.length / 2, pts = [];
        for (let i = 0; i < n; i++) pts.push([poly[i * 2], poly[i * 2 + 1]]);
        // Counterclockwise in (u, v).
        let area = 0;
        for (let i = 0; i < n; i++) { const a = pts[i], c = pts[(i + 1) % n]; area += a[0] * c[1] - c[0] * a[1]; }
        if (area < 0) pts.reverse();
        let minEdge = Infinity;
        for (let i = 0; i < n; i++) minEdge = Math.min(minEdge, Math.hypot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]));
        const b = Math.max(0, Math.min(bevel || 0, depth * 0.6, minEdge * 0.3));
        const inner = insetConvex(pts, b);
        const at = (q, hgt) => [F.o[0] + F.u[0] * q[0] + F.v[0] * q[1] + F.n[0] * hgt, F.o[1] + F.u[1] * q[0] + F.v[1] * q[1] + F.n[1] * hgt, F.o[2] + F.u[2] * q[0] + F.v[2] * q[1] + F.n[2] * hgt];
        const g = new Geo();
        g.poly(inner.map(q => at(q, depth)), inner.map(q => [q[0], q[1]]), F.n);
        if (back) g.poly(pts.map(q => at(q, 0)), pts.map(q => [q[0], q[1]]), scale(F.n, -1));
        for (let i = 0; i < n; i++) {
            const a = pts[i], c = pts[(i + 1) % n], ia = inner[i], ic = inner[(i + 1) % n];
            const eu = c[0] - a[0], ev = c[1] - a[1], el = Math.hypot(eu, ev) || 1;
            // Outward in the plane: to the right of travel around a counterclockwise outline.
            const ou = ev / el, ov = -eu / el;
            const out = norm([F.u[0] * ou + F.v[0] * ov, F.u[1] * ou + F.v[1] * ov, F.u[2] * ou + F.v[2] * ov]);
            const along = [0, el];
            g.poly([at(a, 0), at(c, 0), at(c, depth - b), at(a, depth - b)], [[along[0], 0], [along[1], 0], [along[1], depth - b], [along[0], depth - b]], out);
            if (b > 0) g.poly([at(a, depth - b), at(c, depth - b), at(ic, depth), at(ia, depth)], [[0, depth - b], [el, depth - b], [el, depth], [0, depth]], norm(add(out, F.n)));
        }
        return g.done();
    }

    /** A convex outline (counterclockwise) moved in by `d` on every side. */
    function insetConvex(pts, d) {
        if (!d) return pts.map(p => p.slice());
        const n = pts.length, lines = [];
        for (let i = 0; i < n; i++) {
            const a = pts[i], c = pts[(i + 1) % n], eu = c[0] - a[0], ev = c[1] - a[1], l = Math.hypot(eu, ev) || 1;
            const nu = -ev / l, nv = eu / l; // inward (left of travel)
            lines.push([a[0] + nu * d, a[1] + nv * d, eu / l, ev / l]);
        }
        const out = [];
        for (let i = 0; i < n; i++) {
            const L1 = lines[(i + n - 1) % n], L2 = lines[i];
            const den = L1[2] * L2[3] - L1[3] * L2[2];
            if (Math.abs(den) < 1e-9) { out.push([L2[0], L2[1]]); continue; }
            const t = ((L2[0] - L1[0]) * L2[3] - (L2[1] - L1[1]) * L2[2]) / den;
            out.push([L1[0] + L1[2] * t, L1[1] + L1[3] * t]);
        }
        return out;
    }

    /** A rectangle as a slab outline: centered at (cu, cv), w x h. */
    const rect = (cu, cv, w, h) => [cu - w / 2, cv - h / 2, cu + w / 2, cv - h / 2, cu + w / 2, cv + h / 2, cu - w / 2, cv + h / 2];

    /** A frame on a face: origin `o`, across `u`, up `v`; the normal is u x v. */
    function frame(o, u, v) { const nu = norm(u), nv = norm(v); return { o, u: nu, v: nv, n: norm(cross(nu, nv)) }; }

    /**
     * A round tube along `points` (a path), `radius` (or radius per point),
     * `sides` around, ends closed. Uvs: [meters along, turn around 0..1].
     */
    function sweep(points, radius, sides, closeEnds) {
        const P = [], N = [], T = [], I = [];
        const n = points.length, sd = Math.max(3, sides | 0);
        let prev = null, len = 0;
        const rings = [];
        for (let i = 0; i < n; i++) {
            const t = norm(sub(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]));
            // Carried along the path: each ring's frame turned as little as the path turns.
            let u;
            if (!prev) { const up = Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; u = norm(cross(up, t)); }
            else { u = norm(sub(prev, scale(t, dot(prev, t)))); }
            const v = cross(t, u);
            prev = u;
            if (i) len += Math.hypot(...sub(points[i], points[i - 1]));
            const r = Array.isArray(radius) ? radius[i] : radius;
            const start = P.length / 3;
            for (let s = 0; s <= sd; s++) {
                const a = (s / sd) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
                const d = [u[0] * c + v[0] * si, u[1] * c + v[1] * si, u[2] * c + v[2] * si];
                P.push(points[i][0] + d[0] * r, points[i][1] + d[1] * r, points[i][2] + d[2] * r); N.push(d[0], d[1], d[2]); T.push(len, s / sd);
            }
            rings.push({ start, t, center: points[i] });
        }
        for (let i = 0; i + 1 < n; i++) {
            const a = rings[i].start, b = rings[i + 1].start;
            for (let s = 0; s < sd; s++) I.push(a + s, a + s + 1, b + s, a + s + 1, b + s + 1, b + s); // winding fix 2026-10-18: faces out
        }
        const m = make(P, N, T, I);
        // The ring order winds its faces inward on some paths: turned out by the normals.
        orientOutward(m);
        if (closeEnds) {
            const g = new Geo();
            for (const [k, dir] of [[0, -1], [n - 1, 1]]) {
                const ring = rings[k], pts = [];
                for (let s = 0; s < sd; s++) { const i = ring.start + s; pts.push([m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]]); }
                g.poly(pts, pts.map(() => [0, 0]), scale(ring.t, dir));
            }
            return merge([m, g.done()]);
        }
        return m;
    }

    /** Triangles turned to agree with their vertices' normals. */
    function orientOutward(m) {
        const P = m.positions, N = m.normals, I = m.index;
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const fn = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
            if (fn[0] * (N[a] + N[b] + N[c]) + fn[1] * (N[a + 1] + N[b + 1] + N[c + 1]) + fn[2] * (N[a + 2] + N[b + 2] + N[c + 2]) < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
        }
        return m;
    }

    /**
     * A screen's housing on a face: a block w x h, `depth` out from the
     * frame's plane, with an opening `border` in from its edges whose floor
     * lies `recess` below its front. Returns { housing, floor } (the floor
     * apart, for its own color) and the opening's size.
     */
    function bezel(F, w, h, depth, border, recess) {
        const g = new Geo(), fl = new Geo();
        const at = (u, v, d) => [F.o[0] + F.u[0] * u + F.v[0] * v + F.n[0] * d, F.o[1] + F.u[1] * u + F.v[1] * v + F.n[1] * d, F.o[2] + F.u[2] * u + F.v[2] * v + F.n[2] * d];
        const W = w / 2, H = h / 2, iw = W - border, ih = H - border, ch = Math.min(border * 0.35, depth * 0.3);
        const uv = (u, v) => [u, -v];
        // Front: a ring of four, chamfered outward.
        const quads = [
            [[-W + ch, -H + ch], [W - ch, -H + ch], [iw, -ih], [-iw, -ih]],
            [[W - ch, -H + ch], [W - ch, H - ch], [iw, ih], [iw, -ih]],
            [[W - ch, H - ch], [-W + ch, H - ch], [-iw, ih], [iw, ih]],
            [[-W + ch, H - ch], [-W + ch, -H + ch], [-iw, -ih], [-iw, ih]]
        ];
        for (const q of quads) g.poly(q.map(p => at(p[0], p[1], depth)), q.map(p => uv(p[0], p[1])), F.n);
        // Chamfer and sides.
        const outer = [[-W, -H], [W, -H], [W, H], [-W, H]], inset = [[-W + ch, -H + ch], [W - ch, -H + ch], [W - ch, H - ch], [-W + ch, H - ch]];
        for (let i = 0; i < 4; i++) {
            const a = outer[i], c = outer[(i + 1) % 4], ia = inset[i], ic = inset[(i + 1) % 4];
            const out = [scale(F.v, -1), F.u, F.v, scale(F.u, -1)][i];
            g.poly([at(a[0], a[1], 0), at(c[0], c[1], 0), at(c[0], c[1], depth - ch), at(a[0], a[1], depth - ch)], [uv(a[0], a[1]), uv(c[0], c[1]), uv(c[0], c[1]), uv(a[0], a[1])], out);
            g.poly([at(a[0], a[1], depth - ch), at(c[0], c[1], depth - ch), at(ic[0], ic[1], depth), at(ia[0], ia[1], depth)], [uv(a[0], a[1]), uv(c[0], c[1]), uv(ic[0], ic[1]), uv(ia[0], ia[1])], norm(add(out, F.n)));
        }
        // The opening's walls, facing inward, and its floor.
        const op = [[-iw, -ih], [iw, -ih], [iw, ih], [-iw, ih]];
        for (let i = 0; i < 4; i++) {
            const a = op[i], c = op[(i + 1) % 4];
            const inward = [F.v, scale(F.u, -1), scale(F.v, -1), F.u][i];
            g.poly([at(a[0], a[1], depth), at(c[0], c[1], depth), at(c[0], c[1], depth - recess), at(a[0], a[1], depth - recess)], [uv(a[0], a[1]), uv(c[0], c[1]), uv(c[0], c[1]), uv(a[0], a[1])], inward);
        }
        fl.poly(op.map(p => at(p[0], p[1], depth - recess)), op.map(p => uv(p[0], p[1])), F.n);
        // A housing is also a solid when inspected away from its mounting
        // surface (standalone screens and consoles expose this rear face).
        g.poly(outer.map(p=>at(p[0],p[1],0)),outer.map(p=>uv(p[0],p[1])),scale(F.n,-1));
        return { housing: g.done(), floor: fl.done(), width: iw * 2, height: ih * 2 };
    }

    /** A flat rectangle on a frame, `lift` out from the plane, facing its normal. Uvs 0..1 across, 0 at the top. */
    function plate(F, cu, cv, w, h, lift) {
        const g = new Geo();
        const at = (u, v) => [F.o[0] + F.u[0] * u + F.v[0] * v + F.n[0] * lift, F.o[1] + F.u[1] * u + F.v[1] * v + F.n[1] * lift, F.o[2] + F.u[2] * u + F.v[2] * v + F.n[2] * lift];
        g.poly([at(cu - w / 2, cv - h / 2), at(cu + w / 2, cv - h / 2), at(cu + w / 2, cv + h / 2), at(cu - w / 2, cv + h / 2)], [[0, 1], [1, 1], [1, 0], [0, 0]], F.n);
        return g.done();
    }

    /** A low dome (a lamp's lens) on a frame: radius `r`, `height`, `sides` around. Uvs all at (0.5, 0.5). */
    function dome(F, cu, cv, r, height, sides) {
        return revolveOn(F, cu, cv, [[r, 0], [r * 0.92, height * 0.55], [r * 0.55, height * 0.92], [0, height]], sides || 8, 0.2);
    }

    /** An outline turned about the frame's normal at (cu, cv): heights along the normal. Uvs all at (0.5, 0.5). */
    function revolveOn(F, cu, cv, prof, sides, crease) {
        const m = revolve(prof, sides || 8, { phase: 0, crease: crease ?? 0.5 });
        // From the revolve's y-up to the frame: x along u, y along n, z along v.
        const P = m.positions, N = m.normals;
        for (let i = 0; i < P.length; i += 3) {
            const x = P[i], y = P[i + 1], z = P[i + 2], nx = N[i], ny = N[i + 1], nz = N[i + 2];
            for (let k = 0; k < 3; k++) {
                P[i + k] = F.o[k] + F.u[k] * (cu + x) + F.v[k] * (cv - z) + F.n[k] * y;
                N[i + k] = F.u[k] * nx - F.v[k] * nz + F.n[k] * ny;
            }
        }
        m.uvs.fill(0.5);
        return orientOutward(m);
    }

    /** Points and normals moved by `fn([x, y, z]) -> [x, y, z]` and turned by `turn(n) -> n`. */
    function transform(mesh, fn, turn) {
        const P = mesh.positions, N = mesh.normals;
        for (let i = 0; i < P.length; i += 3) {
            const p = fn([P[i], P[i + 1], P[i + 2]]); P[i] = p[0]; P[i + 1] = p[1]; P[i + 2] = p[2];
            if (turn && N) { const n = norm(turn([N[i], N[i + 1], N[i + 2]])); N[i] = n[0]; N[i + 1] = n[1]; N[i + 2] = n[2]; }
        }
        return mesh;
    }

    /** A turn about the y axis by `a`, then a move by `t`: { point, normal } functions. */
    function yaw(a, t) {
        const c = Math.cos(a), s = Math.sin(a), d = t || [0, 0, 0];
        return { point: p => [p[0] * c + p[2] * s + d[0], p[1] + d[1], -p[0] * s + p[2] * c + d[2]], normal: n => [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c] };
    }

    /** A turn about the x axis by `a` about the point `pivot`. */
    function pitch(a, pivot) {
        const c = Math.cos(a), s = Math.sin(a), o = pivot || [0, 0, 0];
        return { point: p => { const y = p[1] - o[1], z = p[2] - o[2]; return [p[0], o[1] + y * c - z * s, o[2] + y * s + z * c]; }, normal: n => [n[0], n[1] * c - n[2] * s, n[1] * s + n[2] * c] };
    }

    function copy(m) {
        const out = { positions: Float32Array.from(m.positions), normals: Float32Array.from(m.normals), uvs: Float32Array.from(m.uvs), index: Uint32Array.from(m.index) };
        if (m.joints) out.joints = Uint16Array.from(m.joints);
        if (m.weights) out.weights = Float32Array.from(m.weights);
        if (m.ao) out.ao = Float32Array.from(m.ao);
        return out;
    }

    /** Uvs mapped by `fn(u, v, i) -> [u, v]`. */
    function mapUv(mesh, fn) {
        const T = mesh.uvs;
        for (let i = 0; i < T.length / 2; i++) { const r = fn(T[i * 2], T[i * 2 + 1], i); T[i * 2] = r[0]; T[i * 2 + 1] = r[1]; }
        return mesh;
    }

    /** Every point of the mesh on one bone (or two halves of two). */
    function skin(mesh, bones, weights) {
        const n = mesh.positions.length / 3, J = new Uint16Array(n * 4), W = new Float32Array(n * 4);
        const b = Array.isArray(bones) ? bones : [bones], w = weights || b.map(() => 1 / b.length);
        for (let i = 0; i < n; i++) for (let k = 0; k < b.length && k < 4; k++) { J[i * 4 + k] = b[k]; W[i * 4 + k] = w[k]; }
        mesh.joints = J; mesh.weights = W;
        return mesh;
    }

    /** Light kept from a point (ambient occlusion), per point, for the shading: `fn(x, y, z, nx, ny, nz) -> 0..1`. */
    function occlude(mesh, fn) {
        const P = mesh.positions, N = mesh.normals, n = P.length / 3, A = mesh.ao || new Float32Array(n).fill(1);
        for (let i = 0; i < n; i++) A[i] *= fn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]);
        mesh.ao = A;
        return mesh;
    }

    /** Several meshes as one, their bones and occlusion carried (a mesh without bones is on bone 0). */
    function merge(list) {
        const meshes = list.filter(m => m && m.index.length);
        let v = 0, t = 0;
        for (const m of meshes) { v += m.positions.length / 3; t += m.index.length; }
        const out = { positions: new Float32Array(v * 3), normals: new Float32Array(v * 3), uvs: new Float32Array(v * 2), index: new Uint32Array(t), joints: new Uint16Array(v * 4), weights: new Float32Array(v * 4), ao: new Float32Array(v).fill(1) };
        let vo = 0, io = 0;
        for (const m of meshes) {
            const n = m.positions.length / 3;
            out.positions.set(m.positions, vo * 3); out.normals.set(m.normals, vo * 3);
            if (m.uvs) out.uvs.set(m.uvs, vo * 2);
            if (m.joints) { out.joints.set(m.joints, vo * 4); out.weights.set(m.weights, vo * 4); } else for (let i = 0; i < n; i++) out.weights[(vo + i) * 4] = 1;
            if (m.ao) out.ao.set(m.ao, vo);
            for (let k = 0; k < m.index.length; k++) out.index[io + k] = m.index[k] + vo;
            vo += n; io += m.index.length;
        }
        return out;
    }

    const api = { Geo, make, revolve, revolveOn, smoothNormals, chamferBox, roundedBox, planarAt, slab, insetConvex, rect, frame, sweep, orientOutward, bezel, plate, dome, transform, yaw, pitch, copy, mapUv, skin, occlude, merge, vec: { sub, add, scale, dot, cross, norm } };
    root.RRContainerMesh = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
