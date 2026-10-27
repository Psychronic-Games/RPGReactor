/**
 * RRCharacterProps - accessories built to fit the shaped body: glasses and
 * other eyewear, hats and helmets, jewelry, capes, scarves and things worn
 * on the back.
 *
 * Each accessory is generated from landmarks measured on the body as it is
 * shaped now (the eyes, the head's cross-section at the brow, the ears, the
 * neck, the shoulders), so a monocle sits on any eye and a crown on any
 * head. Rigid accessories ride on one bone; a cape, a scarf or a necklace
 * blends down the spine.
 */
(function(root) {
    'use strict';

    const Body = root.RRHumanBody || (typeof require === 'function' ? require('./HumanBody.js') : null);
    const Surface=root.RRConstructionSurface||(typeof require==='function'?require('./ConstructionSurface.js'):null);
    const Patterns=root.RRConstructionPatterns||(typeof require==='function'?require('./ConstructionPatterns.js'):null);
    const Outfit = root.RRCharacterOutfit || (typeof require === 'function' ? require('./CharacterOutfit.js') : null);
    const linear = hex => Outfit.linear(hex);

    // ── vectors ───────────────────────────────────────────────────────────
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

    const roundSides = Patterns.roundSides;
    /** Geometry with vertex colors and per-vertex skin. */
    class Mesh {
        constructor() { this.p = []; this.n = []; this.c = []; this.j = []; this.w = []; this.i = []; }
        vertex(pos, nrm, rgb, skin) {
            const k = this.p.length / 3;
            this.p.push(pos[0], pos[1], pos[2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(rgb[0], rgb[1], rgb[2]);
            const s = typeof skin === 'function' ? skin(pos) : skin;
            for (let q = 0; q < 4; q++) { this.j.push(s.joints[q] || 0); this.w.push(s.weights[q] || 0); }
            return k;
        }
        tri(a, b, c) { this.i.push(a, b, c); }
        /**
         * Rings swept along a path: `ring(i, t)` gives {center, x, y, rx, ry}
         * (axes of the ring's plane and its radii) and an optional `cup`, which
         * bows the ring back along -y by that share of rx (a hollow front).
         * Caps close the ends.
         */
        loft(count, ring, sides, rgb, skin, caps) {
            const rows = [];
            for (let r = 0; r < count; r++) {
                const t = count > 1 ? r / (count - 1) : 0;
                const R = ring(r, t);
                const row = [];
                for (let k = 0; k < sides; k++) {
                    const a = k / sides * Math.PI * 2;
                    const bend = R.cup ? R.cup * R.rx * (1 - Math.cos(a) * Math.cos(a)) : 0;
                    const off = add(mul(R.x, Math.cos(a) * R.rx), mul(R.y, Math.sin(a) * R.ry - bend));
                    const pos = add(R.center, off);
                    const color = typeof rgb === 'function' ? rgb(t, a, pos) : rgb;
                    row.push(this.vertex(pos, norm(off), color, skin));
                }
                rows.push({ row, R });
            }
            // Winding (Prop Builder fix 2026-10-18): the caps wind with the sides, and the whole
            // loft faces outward, whatever the handedness of its ring frames.
            const first = this.i.length;
            for (let r = 0; r + 1 < rows.length; r++) for (let k = 0; k < sides; k++) {
                const a = rows[r].row[k], b = rows[r].row[(k + 1) % sides], c = rows[r + 1].row[k], d = rows[r + 1].row[(k + 1) % sides];
                this.tri(a, c, b); this.tri(b, c, d);
            }
            const P = this.p, at = v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
            const volume = (a, b, c) => dot(a, cross(b, c)) / 6;
            let shut = 0;
            for (const [end, start] of [[rows[0], true], [rows[rows.length - 1], false]]) {
                const R = end.R;
                const color = typeof rgb === 'function' ? rgb(start ? 0 : 1, 0, R.center) : rgb;
                const center = caps ? this.vertex(R.center, [0, 1, 0], color, skin) : -1;
                for (let k = 0; k < sides; k++) {
                    const a = end.row[k], b = end.row[(k + 1) % sides];
                    const [p, q] = start ? [a, b] : [b, a];
                    if (caps) this.tri(center, p, q); else shut += volume(R.center, at(p), at(q));
                }
            }
            for (let t = first; t < this.i.length; t += 3) shut += volume(at(this.i[t]), at(this.i[t + 1]), at(this.i[t + 2]));
            if (shut < 0) for (let t = first; t < this.i.length; t += 3) { const v = this.i[t + 1]; this.i[t + 1] = this.i[t + 2]; this.i[t + 2] = v; }
            this.computeNormals();
            return rows;
        }
        /** A tube through points with radii (number or per-point array). */
        tube(points, radii, sides, rgb, skin, caps = true) {
            const n = points.length;
            // Worn equipment takes its sides from its widest radius; an ExactMesh keeps the sides it is given.
            if (!this.exact) {
                const widest = Array.isArray(radii) ? Math.max(...radii) : typeof radii === 'function' ? Math.max(...points.map((_, i) => radii(i / Math.max(1, n - 1)))) : radii;
                sides = roundSides(widest);
            }
            let prevX = null;
            return this.loft(n, i => {
                const a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)];
                const d = norm(sub(b, a));
                let x = prevX ? norm(sub(prevX, mul(d, dot(prevX, d)))) : norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
                prevX = x;
                const y = cross(d, x);
                const r = Array.isArray(radii) ? radii[i] : typeof radii === 'function' ? radii(i / (n - 1)) : radii;
                return { center: points[i], x, y, rx: r, ry: r };
            }, sides, rgb, skin, caps);
        }
        sphere(center, r, rgb, skin, rows = 8, sides = 12, squash = [1, 1, 1]) {
            // Worn equipment takes its sides from its widest semi-axis, half as many rows (at least 6), and the
            // ellipsoid's own normals, so a few sides still shade round. An ExactMesh keeps what it is given.
            if (!this.exact) { sides = roundSides(r * Math.max(...squash)); rows = Math.max(6, sides / 2); }
            const first = this.p.length / 3;
            const rows_ = this.loft(rows + 1, (i, t) => {
                const phi = -Math.PI / 2 + t * Math.PI;
                const rr = Math.cos(phi) * r;
                return { center: add(center, [0, Math.sin(phi) * r * squash[1], 0]), x: [1, 0, 0], y: [0, 0, -1], rx: Math.max(1e-5, rr * squash[0]), ry: Math.max(1e-5, rr * squash[2]) };
            }, sides, rgb, skin, false);
            if (!this.exact) {
                const P = this.p, N = this.n, end = P.length / 3, ax = squash.map(k => 1 / ((r * k) ** 2 || 1));
                for (let v = first; v < end; v++) {
                    const d = [(P[v * 3] - center[0]) * ax[0], (P[v * 3 + 1] - center[1]) * ax[1], (P[v * 3 + 2] - center[2]) * ax[2]], l = len(d) || 1;
                    N[v * 3] = d[0] / l; N[v * 3 + 1] = d[1] / l; N[v * 3 + 2] = d[2] / l;
                }
                (this.keptNormals || (this.keptNormals = [])).push(first, end);
            }
            return rows_;
        }
        disk(center, normal, r, rgb, skin, sides = 24, ry) {
            const x = norm(cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), y = cross(normal, x);
            const c = this.vertex(center, normal, rgb, skin);
            const ring = [];
            for (let k = 0; k < sides; k++) {
                const a = k / sides * Math.PI * 2;
                ring.push(this.vertex(add(center, add(mul(x, Math.cos(a) * r), mul(y, Math.sin(a) * (ry || r)))), normal, rgb, skin));
            }
            for (let k = 0; k < sides; k++) this.tri(c, ring[k], ring[(k + 1) % sides]);
        }
        box(center, axes, half, rgb, skin) {
            const [X, Y, Z] = axes;
            const corner = (sx, sy, sz) => add(center, add(add(mul(X, sx * half[0]), mul(Y, sy * half[1])), mul(Z, sz * half[2])));
            const faces = [[X, [1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], [mul(X, -1), [-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
                [Y, [-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [mul(Y, -1), [-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]],
                [Z, [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [mul(Z, -1), [1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]];
            // Winding (Prop Builder fix 2026-10-18): mirrored axes keep the faces outward.
            const mirrored = dot(cross(X, Y), Z) < 0;
            for (const [n, ...cs] of faces) {
                const ids = cs.map(s => this.vertex(corner(...s), n, rgb, skin));
                if (mirrored) { this.tri(ids[0], ids[2], ids[1]); this.tri(ids[0], ids[3], ids[2]); } else { this.tri(ids[0], ids[1], ids[2]); this.tri(ids[0], ids[2], ids[3]); }
            }
        }
        /** A sewn case or padded panel with a continuous rounded silhouette. */
        roundedBox(center,axes,half,radius,rgb,skin,steps=4) {
            const r=Math.min(radius,...half.map(v=>v*.75));
            for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
                const u=(axis+1)%3,v=(axis+2)%3,values=k=>{const a=Array.from({length:steps+1},(_,j)=>-half[k]+r*(1-Math.cos(j/steps*Math.PI/2)));return a.concat(a.map(v=>-v).reverse());},A=values(u),B=values(v),base=this.p.length/3;
                for(const b of B)for(const a of A){const p=[0,0,0];p[axis]=sign*half[axis];p[u]=a;p[v]=b;const q=p.map((x,k)=>Math.max(-half[k]+r,Math.min(half[k]-r,x))),n=norm(sub(p,q)),local=add(q,mul(n,r)),world=add(center,axes.reduce((sum,ax,k)=>add(sum,mul(ax,local[k])),[0,0,0])),normal=axes.reduce((sum,ax,k)=>add(sum,mul(ax,n[k])),[0,0,0]);this.vertex(world,normal,rgb,skin);}
                const mirrored=dot(cross(axes[0],axes[1]),axes[2])<0;
                for(let j=0;j<B.length-1;j++)for(let i=0;i<A.length-1;i++){const a=base+j*A.length+i,b=a+1,c=a+A.length,d=c+1;if((sign>0)!==mirrored){this.tri(a,b,c);this.tri(b,d,c);}else{this.tri(a,c,b);this.tri(b,c,d);}}
            }
        }
        /** Smooth normals from the faces, except over spheres, which keep their exact ones. */
        computeNormals() {
            const P = this.p, N = new Float32Array(P.length), kept = this.keptNormals, keep = kept ? new Uint8Array(P.length / 3) : null;
            if (kept) for (let k = 0; k < kept.length; k += 2) keep.fill(1, kept[k], kept[k + 1]);
            for (let t = 0; t < this.i.length; t += 3) {
                const a = this.i[t] * 3, b = this.i[t + 1] * 3, c = this.i[t + 2] * 3;
                const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], v = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
                const n = cross(u, v);
                for (const s of [a, b, c]) { N[s] += n[0]; N[s + 1] += n[1]; N[s + 2] += n[2]; }
            }
            for (let k = 0; k < N.length; k += 3) { if (keep && keep[k / 3]) continue; const l = Math.hypot(N[k], N[k + 1], N[k + 2]); if (l > 0) { this.n[k] = N[k] / l; this.n[k + 1] = N[k + 1] / l; this.n[k + 2] = N[k + 2] / l; } }
        }
        part(name, extra) {
            return Object.assign({ name, positions: Float32Array.from(this.p), normals: Float32Array.from(this.n), colors: Float32Array.from(this.c),
                joints: Uint8Array.from(this.j), weights: Float32Array.from(this.w), index: Uint32Array.from(this.i) }, extra);
        }
        get empty() { return !this.i.length; }
    }

    // ── landmarks ─────────────────────────────────────────────────────────
    /**
     * Where things are on a built body: eyes, head cross-sections, ears,
     * nose, mouth, chin, neck, shoulders, wrists, waist. All in the body's
     * frame as built (floor at 0, facing +z).
     */
    function landmarks(pack, built) {
        const P = built.shaped;
        const bone = name => built.bones.find(b => b.name === name);
        const boneIndex = name => built.bones.findIndex(b => b.name === name);
        const eyes = built.parts.find(p => p.name === 'Eyes').positions;
        const eye = side => {
            let c = [0, 0, 0], n = 0, mn = Infinity, mx = -Infinity;
            for (let i = 0; i < eyes.length; i += 3) if ((eyes[i] > 0) === (side > 0)) { c = add(c, [eyes[i], eyes[i + 1], eyes[i + 2]]); n++; mn = Math.min(mn, eyes[i]); mx = Math.max(mx, eyes[i]); }
            return { center: mul(c, 1 / n), radius: (mx - mn) / 2 };
        };
        const eyeL = eye(1), eyeR = eye(-1);
        const an = Outfit.anatomy(pack);
        const ids = pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)]);
        const headIds = ids.filter(v => an.member[v * 5] > 0.6 && an.s[v * 5] > 4.3);
        let crown = 0, noseTip = null, chin = Infinity;
        for (const v of headIds) {
            const y = P[v * 3 + 1];
            if (y > crown) crown = y;
            if (!noseTip || P[v * 3 + 2] > noseTip[2]) noseTip = [P[v * 3], y, P[v * 3 + 2]];
        }
        /** The head's cross-section about a height: center, half width and half depth (and front/back). */
        let headEdges = null;
        const ring = (y, band = 0.012) => {
            let mnx = Infinity, mxx = -Infinity, mnz = Infinity, mxz = -Infinity;
            for (const v of headIds) {
                if (Math.abs(P[v * 3 + 1] - y) > band) continue;
                // The ears stick out of the section: leave them to the ears.
                if (earSet.has(v)) continue;
                mnx = Math.min(mnx, P[v * 3]); mxx = Math.max(mxx, P[v * 3]); mnz = Math.min(mnz, P[v * 3 + 2]); mxz = Math.max(mxz, P[v * 3 + 2]);
            }
            if (!isFinite(mnx)) {
                // Compressed or stretched heads can leave a requested slice between vertex rows.
                // Intersect the real surface there instead of guessing a generic head radius.
                if (!headEdges) {
                    const head = new Set(headIds.filter(v => !earSet.has(v))), edges = new Map();
                    const S = pack.body.source, I = pack.body.index;
                    for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
                        const a = S[I[i + k]], b = S[I[i + (k + 1) % 3]];
                        if (head.has(a) && head.has(b)) edges.set(Math.min(a, b) + ':' + Math.max(a, b), [a, b]);
                    }
                    headEdges = [...edges.values()];
                }
                let low = Infinity, high = -Infinity;
                for (const v of headIds) if (!earSet.has(v)) { low = Math.min(low, P[v * 3 + 1]); high = Math.max(high, P[v * 3 + 1]); }
                // Hats may ask just above the crown. Use the nearest actual layer at that height.
                const at = Math.max(low, Math.min(high, y));
                if (at !== y) for (const v of headIds) {
                    if (earSet.has(v) || Math.abs(P[v * 3 + 1] - at) > band) continue;
                    mnx = Math.min(mnx, P[v * 3]); mxx = Math.max(mxx, P[v * 3]); mnz = Math.min(mnz, P[v * 3 + 2]); mxz = Math.max(mxz, P[v * 3 + 2]);
                }
                for (const [a, b] of headEdges) {
                    const ay = P[a * 3 + 1], by = P[b * 3 + 1];
                    if (at < Math.min(ay, by) - 1e-7 || at > Math.max(ay, by) + 1e-7) continue;
                    const t = Math.abs(by - ay) > 1e-9 ? Math.max(0, Math.min(1, (at - ay) / (by - ay))) : 0;
                    const x = P[a * 3] + (P[b * 3] - P[a * 3]) * t, z = P[a * 3 + 2] + (P[b * 3 + 2] - P[a * 3 + 2]) * t;
                    mnx = Math.min(mnx, x); mxx = Math.max(mxx, x); mnz = Math.min(mnz, z); mxz = Math.max(mxz, z);
                }
                if (!isFinite(mnx)) return null;
            }
            return { center: [(mnx + mxx) / 2, y, (mnz + mxz) / 2], rx: (mxx - mnx) / 2, rz: (mxz - mnz) / 2, front: mxz, back: mnz };
        };
        const earTarget = pack.targets.get('shape/earSize-incr');
        const earSet = new Set(earTarget ? earTarget.index : []);
        const ear = side => {
            let c = [0, 0, 0], n = 0, low = null, out = null, top = null;
            for (const v of earSet) {
                const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
                if ((p[0] > 0) !== (side > 0)) continue;
                c = add(c, p); n++;
                if (!low || p[1] < low[1]) low = p;
                if (!top || p[1] > top[1]) top = p;
                if (!out || Math.abs(p[0]) > Math.abs(out[0])) out = p;
            }
            return n ? { center: mul(c, 1 / n), lobe: low, outer: out, top } : null;
        };
        const teeth = pack.helpers.upperTeeth;
        let mouth = [0, 0, 0];
        for (const v of teeth.source) mouth = add(mouth, [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
        mouth = mul(mouth, 1 / teeth.source.length);
        for (const v of headIds) if (P[v * 3 + 2] > mouth[2] - 0.01 && Math.abs(P[v * 3]) < 0.02) chin = Math.min(chin, P[v * 3 + 1]);
        const eyeY = (eyeL.center[1] + eyeR.center[1]) / 2;
        const brow = eyeY + (eyeL.radius + eyeR.radius) * 1.3;
        // The neck at its base: a ring over the skin of the lower neck.
        const neckIds = ids.filter(v => an.member[v * 5] > 0.8 && Math.abs(an.s[v * 5] - 4.05) < 0.08);
        let nmin = [Infinity, 0, Infinity], nmax = [-Infinity, 0, -Infinity], ny = 0;
        for (const v of neckIds) { nmin[0] = Math.min(nmin[0], P[v * 3]); nmax[0] = Math.max(nmax[0], P[v * 3]); nmin[2] = Math.min(nmin[2], P[v * 3 + 2]); nmax[2] = Math.max(nmax[2], P[v * 3 + 2]); ny += P[v * 3 + 1]; }
        const neck = { center: [(nmin[0] + nmax[0]) / 2, ny / (neckIds.length || 1), (nmin[2] + nmax[2]) / 2], rx: (nmax[0] - nmin[0]) / 2, rz: (nmax[2] - nmin[2]) / 2 };
        // A collar sits above the lower-neck landmark. Intersect the real
        // skin at its own height, including the changing center of the neck.
        const neckSections = new Map();
        let neckFaces = null;
        const neckSection = y => {
            if (neckSections.has(y)) return neckSections.get(y);
            if (!neckFaces) {
                neckFaces = [];
                const S = pack.body.source, I = pack.body.index;
                for (let i = 0; i < I.length; i += 3) {
                    const face = [S[I[i]], S[I[i + 1]], S[I[i + 2]]];
                    // Include triangles crossing the landmark regions: their
                    // vertices need not all carry the same anatomy label.
                    const heights = face.map(v => P[v * 3 + 1]);
                    if (Math.min(...heights) <= chin && Math.max(...heights) >= neck.center[1] - .10) neckFaces.push(face);
                }
            }
            const segments = [];
            for (const face of neckFaces) {
                const hits = [];
                for (let k = 0; k < 3; k++) {
                    const a = face[k] * 3, b = face[(k + 1) % 3] * 3, ay = P[a + 1], by = P[b + 1];
                    if (Math.abs(by - ay) < 1e-9 || y < Math.min(ay, by) || y > Math.max(ay, by)) continue;
                    const t = (y - ay) / (by - ay);
                    hits.push([P[a] + (P[b] - P[a]) * t, P[a + 2] + (P[b + 2] - P[a + 2]) * t]);
                }
                if (hits.length === 2) segments.push(hits);
            }
            let cx = neck.center[0], cz = neck.center[2];
            if (segments.length) {
                const points = segments.flat();
                cx = (Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2;
                cz = (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2;
            }
            const section = { center: [cx, y, cz], at(a, pad = 0, size = 1) {
                const dx = Math.sin(a), dz = Math.cos(a); let radius = Infinity;
                for (const [p, q] of segments) {
                    const ex = q[0] - p[0], ez = q[1] - p[1], den = dx * ez - dz * ex;
                    if (Math.abs(den) < 1e-10) continue;
                    const px = p[0] - cx, pz = p[1] - cz, t = (px * ez - pz * ex) / den, u = (px * dz - pz * dx) / den;
                    if (t > 0 && u >= -1e-6 && u <= 1.000001) radius = Math.min(radius, t);
                }
                if (!Number.isFinite(radius)) radius = 1 / Math.hypot(dx / neck.rx, dz / neck.rz);
                return [cx + dx * (radius * size + pad), y, cz + dz * (radius * size + pad)];
            }};
            neckSections.set(y, section); return section;
        };
        // The back and the shoulders' tops: for capes and packs.
        const torso = ids.filter(v => an.member[v * 5] > 0.7 && an.s[v * 5] > 1 && an.s[v * 5] < 4);
        const backAt = (y, x) => {
            let z = Infinity;
            for (const v of torso) if (Math.abs(P[v * 3 + 1] - y) < 0.03 && Math.abs(P[v * 3] - x) < 0.04) z = Math.min(z, P[v * 3 + 2]);
            return z;
        };
        const frontAt = (y, x) => {
            let z = -Infinity;
            for (const v of torso) if (Math.abs(P[v * 3 + 1] - y) < 0.03 && Math.abs(P[v * 3] - x) < 0.04) z = Math.max(z, P[v * 3 + 2]);
            return z;
        };
        return {
            isEar: v => earSet.has(v), P, bone, boneIndex, eyeL, eyeR, eyeY, brow, crown, ring, earL: ear(1), earR: ear(-1), noseTip, mouth, chin, neck, neckSection, backAt, frontAt, torsoIds: torso,
            height: built.height, headIds
        };
    }

    const rigid = index => ({ joints: [index, 0, 0, 0], weights: [1, 0, 0, 0] });
    /** A skin blended down the spine by height: neck at the top, hips at the bottom. */
    function spineSkin(L) {
        const chain = ['Head', 'Neck', 'Spine2', 'Spine1', 'Spine', 'Hips'].map(n => ({ i: L.boneIndex(n), y: L.bone(n).head[1] }));
        return p => {
            for (let k = 0; k + 1 < chain.length; k++) {
                const a = chain[k], b = chain[k + 1];
                if (p[1] >= b.y || k + 2 === chain.length) {
                    const t = Math.max(0, Math.min(1, (a.y - p[1]) / (a.y - b.y || 1)));
                    return { joints: [a.i, b.i, 0, 0], weights: [1 - t, t, 0, 0] };
                }
            }
            return rigid(chain[0].i);
        };
    }

    // ── catalog ───────────────────────────────────────────────────────────
    const PROPS = [
        // Eyes and face
        { id: 'glasses', label: 'Glasses', slot: 'eyes', group: 'Face', defaults: { color: '#2a2420', shape: 'round', size: 1 }, shapes: [['round', 'Round'], ['square', 'Square'], ['cat', 'Cat-eye']], make: (m, L, o) => eyewear(m, L, o, { tint: '#cfe4f0', opacity: 0.18 }) },
        { id: 'sunglasses', label: 'Sunglasses', slot: 'eyes', group: 'Face', defaults: { color: '#141414', color2: '#1c1c22', shape: 'aviator', size: 1.1 }, shapes: [['aviator', 'Aviator'], ['square', 'Square'], ['round', 'Round']], make: (m, L, o) => eyewear(m, L, o, { tint: o.color2, opacity: 0.92 }) },
        { id: 'monocle', label: 'Monocle', slot: 'eyes', group: 'Face', defaults: { color: '#c9a35a', size: 1 }, make: (m, L, o) => monocle(m, L, o) },
        { id: 'eyepatch', label: 'Eye patch', slot: 'eyes', group: 'Face', defaults: { color: '#141414', side: 'left' }, make: (m, L, o) => eyepatch(m, L, o) },
        { id: 'goggles', label: 'Goggles', slot: 'eyes', group: 'Face', defaults: { color: '#5a3d22', color2: '#7a9a6a', up: 0 }, make: (m, L, o) => goggles(m, L, o) },
        // The cyber visor is the wraparound HUD visor of the cyberware (RRCharacterCyberGear), its id and colors kept.
        ...cyberVisors(),
        // Head
        { id: 'wizardhat', label: 'Wizard hat', slot: 'hat', group: 'Hats', defaults: { color: '#2e3f8a', color2: '#d4af37', size: 1, height: 1 }, make: (m, L, o) => coneHat(m, L, o, { brim: 1.7, tall: 0.4, bend: 0.14 }) },
        { id: 'witchhat', label: 'Witch hat', slot: 'hat', group: 'Hats', defaults: { color: '#1a1a1e', color2: '#6a2a8a', size: 1, height: 1 }, make: (m, L, o) => coneHat(m, L, o, { brim: 2.3, tall: 0.36, bend: 0.2 }) },
        { id: 'tophat', label: 'Top hat', slot: 'hat', group: 'Hats', defaults: { color: '#141416', color2: '#5a1a1a', size: 1, height: 1 }, make: (m, L, o) => crownHat(m, L, o, { brim: 1.45, tall: 0.17, flare: 1.08, top: 'flat', band: 0.025 }) },
        { id: 'fedora', label: 'Fedora', slot: 'hat', group: 'Hats', defaults: { color: '#5a4a3a', color2: '#2a2018', size: 1, height: 1 }, make: (m, L, o) => crownHat(m, L, o, { brim: 1.55, tall: 0.11, flare: 0.92, top: 'pinch', band: 0.018, curl: 0.25 }) },
        { id: 'cowboy', label: 'Cowboy hat', slot: 'hat', group: 'Hats', defaults: { color: '#8a6a44', color2: '#4a3622', size: 1, height: 1 }, make: (m, L, o) => crownHat(m, L, o, { brim: 1.95, tall: 0.12, flare: 0.95, top: 'pinch', band: 0.016, curl: 0.9 }) },
        { id: 'bowler', label: 'Bowler hat', slot: 'hat', group: 'Hats', defaults: { color: '#18181a', color2: '#18181a', size: 1, height: 1 }, make: (m, L, o) => crownHat(m, L, o, { brim: 1.32, tall: 0.1, flare: 0.9, top: 'dome', band: 0.014, curl: 0.5 }) },
        { id: 'tricorn', label: 'Tricorn', slot: 'hat', group: 'Hats', defaults: { color: '#1e1a18', color2: '#d4af37', size: 1, height: 1 }, make: (m, L, o) => crownHat(m, L, o, { brim: 1.7, tall: 0.09, flare: 0.95, top: 'dome', band: 0, fold: 3 }) },
        { id: 'cap', label: 'Cap', slot: 'hat', group: 'Hats', defaults: { color: '#b03030', color2: '#b03030', size: 1, height: 1, billLength:1 }, options:{billLength:[.5,1.4]}, make: (m, L, o) => cap(m, L, o) },
        { id: 'crown', label: 'Crown', slot: 'hat', group: 'Hats', defaults: { color: '#e0b84a', color2: '#c0203a', size: 1, height: 1 }, make: (m, L, o) => crown(m, L, o) },
        { id: 'circlet', label: 'Circlet', slot: 'hat', group: 'Hats', defaults: { color: '#d8d8e0', color2: '#3a8ad8', size: 1 }, make: (m, L, o) => circlet(m, L, o) },
        { id: 'vikinghelm', label: 'Horned helmet', slot: 'hat', group: 'Hats', defaults: { color: '#8a8e96', color2: '#ece4d0', size: 1, height: 1 }, make: (m, L, o) => vikingHelm(m, L, o) },
        { id: 'headband', label: 'Headband', slot: 'hat', group: 'Hats', defaults: { color: '#c03030', size: 1 }, make: (m, L, o) => headband(m, L, o) },
        { id: 'halo', label: 'Halo', slot: 'halo', group: 'Hats', defaults: { color: '#ffe48a', size: 1 }, make: (m, L, o) => halo(m, L, o) },
        // Jewelry
        { id: 'brooch', label: 'Gem brooch', slot: 'brooch', group: 'Jewelry', defaults: { color: '#c8a354', color2: '#387d78', size: 1 }, make: (m,L,o)=>brooch(m,L,o) },
        { id: 'hoops', label: 'Hoop earrings', slot: 'earrings', group: 'Jewelry', defaults: { color: '#e0b84a', size: 1 }, make: (m, L, o) => earrings(m, L, o, 'hoop') },
        { id: 'studs', label: 'Stud earrings', slot: 'earrings', group: 'Jewelry', defaults: { color: '#e8e8f0', size: 1 }, make: (m, L, o) => earrings(m, L, o, 'stud') },
        { id: 'necklace', label: 'Necklace', slot: 'neck', group: 'Jewelry', defaults: { color: '#e0b84a', color2: '#3a8ad8', length: 0.5 }, make: (m, L, o) => necklace(m, L, o) },
        { id: 'choker', label: 'Choker', slot: 'neck', group: 'Jewelry', defaults: { color: '#141414', color2: '#c0203a', shape: 'leather', size: 1, width: 1, thick: 1, charm: 'gem', studs: false },
            shapes: [['leather', 'Leather'], ['velvet', 'Velvet'], ['metal', 'Metal links'], ['lace', 'Lace']],
            options: { charm: [['none', 'None'], ['gem', 'Gem'], ['bell', 'Bell'], ['cross', 'Cross'], ['ring', 'Ring']], studs: 'check', thick: [0.4, 3] }, make: (m, L, o) => choker(m, L, o) },
        { id: 'bracelets', label: 'Bracelets', slot: 'wristwear', group: 'Jewelry', defaults: { color: '#e0b84a', size: 1 }, make: (m, L, o) => bracelets(m, L, o) },
        // Worn on the back and about the neck
        // `cloth`: hangs as cloth from that bone (RRCharacterCloth).
        { id: 'cape', label: 'Cape', slot: 'back', group: 'Back', defaults: { color: '#8a1a2a', color2: '#d4af37', length: 0.8, width: 1 }, cloth: { anchor: 'Spine2' }, make: (m, L, o) => cape(m, L, o) },
        { id: 'scarf', label: 'Scarf', slot: 'scarf', group: 'Back', defaults: { color: '#c8a040', color2: '#8a2a2a', length: 0.5 }, make: (m, L, o) => scarf(m, L, o) },
        { id: 'backpack', finish:'felt', label: 'Backpack', slot: 'back', group: 'Back', defaults: { color: '#4a5a3a', color2: '#2a3020', size: 1, pockets:1 }, options:{pockets:[1,3]}, make: (m, L, o) => backpack(m, L, o) },
        { id: 'utilityHarness', label: 'Utility harness', slot: 'harness', group: 'Back', finish: 'leather', defaults: { color: '#343d36', color2: '#a1a69b', size: 1 }, make: (m,L,o) => utilityHarness(m,L,o) },
        { id: 'quiver', label: 'Quiver', slot: 'back', group: 'Back', defaults: { color: '#6a4426', color2: '#e8e0d0', size: 1 }, make: (m, L, o) => quiver(m, L, o) },
        { id: 'jetpack', label: 'Jetpack', slot: 'back', group: 'Back', defaults: { color: '#9aa0a8', color2: '#ff8a20', size: 1, vents:5 }, options:{vents:[2,8]}, make: (m, L, o) => jetpack(m, L, o) },
        { id: 'bowtie', label: 'Bow tie', slot: 'tie', group: 'Jewelry', defaults: { color: '#141416' }, make: (m, L, o) => bowtie(m, L, o) },
        { id: 'necktie', label: 'Tie', slot: 'tie', group: 'Jewelry', defaults: { color: '#6a1a2a', color2: '#2a1018', shape: 'straight', length: 1 },
            shapes: [['straight', 'Straight'], ['bow', 'Bow tie'], ['cravat', 'Cravat']], make: (m, L, o) => necktie(m, L, o) },
        ...generatedProps(),
        // Cyberware (RRCharacterCyberGear): cyber faces, masks, HUD eyewear and implants.
        ...cyberProps()
    ];
    const BY_ID = new Map(PROPS.map(p => [p.id, p]));

    const EQUIPMENT_PATTERNS=Patterns.bank([
        ...PROPS.map(def=>({id:'equipment/'+def.id,when:{id:def.id},controls:Object.keys(def.defaults).concat(Object.keys(def.options||{})),build(c){c.more=def.make(c.m,c.L,c.o)||[];}})),
        {id:'backpack/seams-and-zipper',when:{id:'backpack'},controls:['size','pockets'],build(context){const {m,L,o}=context,hardware=new Mesh();context.more.push({mesh:hardware,extra:{name:'Pack hardware',roughness:.3,metalness:.82}});
            const s=o.size||1,y=L.bone('Spine2').head[1]+.06,z=L.backAt(y,0),c=[0,y,(Number.isFinite(z)?z:-.12)-.07*s],skin=rigid(L.boneIndex('Spine2')),ink=linear(o.color2).map(v=>v*.65);
            const path=Array.from({length:65},(_,j)=>{const a=j/64*Math.PI*2,x=Math.cos(a),yy=Math.sin(a);return add(c,[Math.sign(x)*Math.abs(x)**.27*.14*s,Math.sign(yy)*Math.abs(yy)**.27*.19*s,-.058*s]);});
            m.tube(path,.0018*s,8,ink,skin);
            const zipper=Array.from({length:37},(_,j)=>add(c,[(-.12+j/36*.24)*s,.167*s,-.068*s]));m.tube(zipper,.0018*s,8,ink,skin);
            // Stamped teeth have resolved chamfers; dense submillimeter
            // fillets collapse under ordinary mesh welding after placement.
            for(let j=0;j<28;j++){const x=(-.113+j/27*.226)*s;hardware.roundedBox(add(c,[x,.167*s,-.071*s]),[[1,0,0],[0,1,0],[0,0,1]],[.0014*s,.0022*s,.001*s],.0005*s,linear('#96998b'),skin,1);}
            hardware.roundedBox(add(c,[.09*s,.166*s,-.073*s]),[[1,0,0],[0,1,0],[0,0,1]],[.004*s,.003*s,.002*s],.001*s,linear('#96998b'),skin);
            const pull=add(c,[.09*s,.157*s,-.073*s]);loop(hardware,ringPath(0,24,a=>add(pull,[Math.cos(a)*.004*s,Math.sin(a)*.009*s,0])),.0012*s,linear('#96998b'),skin,8);
            for(const side of [-1,1]){const sh=L.bone(side>0?'LeftArm':'RightArm').head,x=side*Math.abs(sh[0])*.55,at=[x,sh[1]-.10,L.neck.center[2]+L.neck.rz+.07];loop(hardware,[[x-.009,at[1]-.012,at[2]],[x+.009,at[1]-.012,at[2]],[x+.009,at[1]+.012,at[2]],[x-.009,at[1]+.012,at[2]]],.0016,linear('#96998b'),spineSkin(L),8);}
        }},
        {id:'hat/sewn-band-binding',when:{id:['wizardhat','witchhat','tophat','fedora','cowboy','bowler','tricorn','sunhat']},controls:['size','height','color2'],build({m,L,o}){
            const R=hatRing(L,o),skin=rigid(L.boneIndex('Head')),ink=linear(o.color2||o.color).map(v=>v*.78);
            for(const dy of [.005,.017])loop(m,ringPath(0,64,a=>[R.center[0]+Math.cos(a)*(R.rx+.001),R.center[1]+dy,R.center[2]+Math.sin(a)*(R.rz+.001)]),.0009,ink,skin,8);
        }},
        {id:'shield/forged-rim-and-rivets',when:{id:'shield'},controls:['size','color2','side'],build({m,L,o}){
            const name=(o.side==='left'?'Left':'Right')+'Hand',hand=L.bone(name),skin=rigid(L.boneIndex(name)),s=o.size*L.height/1.7,c=add(lerp(hand.head,hand.tail,.8),[0,0,.07*s]);
            loop(m,ringPath(0,96,a=>add(c,[Math.cos(a)*.235*s,Math.sin(a)*.235*s,.014*s])),.005*s,linear(o.color2),skin,12);
            for(let j=0;j<16;j++){const a=j/16*Math.PI*2;m.sphere(add(c,[Math.cos(a)*.215*s,Math.sin(a)*.215*s,.019*s]),.0035*s,linear('#a9a6a0'),skin);}
        }}
    ]);

    // ── makers ────────────────────────────────────────────────────────────
    const ringPath = (r, count, f) => Array.from({ length: count }, (_, k) => f(k / count * Math.PI * 2));

    /** A closed loop of tube (torus-like) through `points`. */
    function loop(m, points, radius, rgb, skin, sides = 6) {
        // The loop's plane by Newell's sum over every point: three neighbors can be collinear (a square rim's side).
        const count=points.length,sum=[0,0,0];
        for(let k=0;k<count;k++){const a=points[k],b=points[(k+1)%count];sum[0]+=(a[1]-b[1])*(a[2]+b[2]);sum[1]+=(a[2]-b[2])*(a[0]+b[0]);sum[2]+=(a[0]-b[0])*(a[1]+b[1]);}
        const plane=norm(sum);
        return m.loft(count+1,i=>{const k=i%count,d=norm(sub(points[(k+1)%count],points[(k+count-1)%count])),x=norm(cross(d,plane)),y=cross(d,x);return{center:points[k],x,y,rx:radius,ry:radius};},m.exact?sides:roundSides(radius),rgb,skin,false);
    }

    /** The ear proper (the body's ear field over 0.6, not the wider region round it): true for vertex v. */
    function earOf(L) {
        // The ear region (what the ear-size shape moves) reaches well over the skull's side; the ear itself is the
        // part of it standing out: its outer 1.4 cm.
        if (!L._earProper) {
            const out = { 1: 0, '-1': 0 };
            for (const v of L.headIds) if (L.isEar && L.isEar(v)) { const x = L.P[v * 3]; out[Math.sign(x)] = Math.max(out[Math.sign(x)], Math.abs(x)); }
            L._earProper = v => !!(L.isEar && L.isEar(v)) && Math.abs(L.P[v * 3]) > out[Math.sign(L.P[v * 3])] - 0.014;
        }
        return L._earProper;
    }
    /** The ear proper on one side: its top and its middle. */
    function earTop(L, side) {
        const ear = earOf(L); let top = null, c = [0, 0, 0], n = 0;
        for (const v of L.headIds) { const p = [L.P[v * 3], L.P[v * 3 + 1], L.P[v * 3 + 2]]; if (Math.sign(p[0]) !== side || !ear(v)) continue; c = add(c, p); n++; if (!top || p[1] > top[1]) top = p; }
        return n ? { top, center: mul(c, 1 / n) } : null;
    }
    /** How far out the head (less its ears) reaches on one side at height y and depth z: where a temple arm lies. */
    function sideX(L, side, y, z, band = 0.007) {
        let x = 0;
        const ear = earOf(L);
        for (const v of L.headIds) {
            const px = L.P[v * 3]; if (Math.sign(px) !== side || ear(v)) continue;
            if (Math.abs(L.P[v * 3 + 1] - y) < band && Math.abs(L.P[v * 3 + 2] - z) < band) x = Math.max(x, Math.abs(px));
        }
        return x || (L.ring(y) ? L.ring(y).rx : 0.075);
    }
    /** Catmull-Rom through points, `per` samples a span: a smooth path for cords and loops. */
    function smoothPath(points, per = 6) {
        const out = [], n = points.length, P = k => points[Math.max(0, Math.min(n - 1, k))];
        for (let k = 0; k + 1 < n; k++) for (let j = 0; j < per; j++) {
            const t = j / per, a = P(k - 1), b = P(k), c = P(k + 1), d = P(k + 2), t2 = t * t, t3 = t2 * t;
            out.push([0, 1, 2].map(i => 0.5 * (2 * b[i] + (c[i] - a[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * t2 + (3 * b[i] - a[i] - 3 * c[i] + d[i]) * t3)));
        }
        out.push(points[n - 1]);
        return out;
    }
    /** A flat strap from point a (left side) round the back of the head at height y to point b, joined to both. */
    /** A flat strap from point a (left side) round the back of the head at height y to point b, joined to both;
     * it rides the head and hair as built (RRCharacterCyberGear.aroundHead), so it never sinks in. */
    function backStrap(m, L, a, b, y, half, thick, rgb, skin, rise = 0.004, curve = 2) {
        const ring = L.ring(y, 0.02) || L.ring(L.eyeY), Cyber = cyberGear();
        if (!ring) return;
        const ang = p => Math.atan2(p[0] - ring.center[0], p[2] - ring.center[2]);
        // The head as shaped (L.P over its head vertices): the farthest point out along each direction at that height.
        const around = (yy, th) => {
            const dx = Math.sin(th), dz = Math.cos(th);
            let r = 0;
            for (const v of L.headIds) {
                const py = L.P[v * 3 + 1]; if (Math.abs(py - yy) > 0.008 || earOf(L)(v)) continue;
                const hx = L.P[v * 3] - ring.center[0], hz = L.P[v * 3 + 2] - ring.center[2], along = hx * dx + hz * dz;
                if (along > r && Math.abs(hx * dz - hz * dx) < 0.012) r = along;
            }
            // Over hair it lies on the hair's middle depth (spiky cards poke through; it never floats on their tips).
            const H = L.hair || [], hr = [];
            for (let h = 0; h < H.length; h += 3) {
                if (Math.abs(H[h + 1] - yy) > 0.008) continue;
                const hx = H[h] - ring.center[0], hz = H[h + 2] - ring.center[2], along = hx * dx + hz * dz;
                if (along > 0 && Math.abs(hx * dz - hz * dx) < 0.012) hr.push(along);
            }
            if (hr.length > 3) { hr.sort((p, q) => p - q); r = Math.max(r, hr[Math.floor(hr.length * 0.7)]); }
            if (!r && Cyber && Cyber.aroundHead) return Cyber.aroundHead(L, yy, th, thick + 0.0015);
            if (!r) r = 1 / Math.hypot(dx / ring.rx, dz / ring.rz);
            return [ring.center[0] + dx * (r + thick + 0.0012), yy, ring.center[2] + dz * (r + thick + 0.0012)];
        };
        const t0 = ang(a) + 0.12, t1 = 2 * Math.PI + ang(b) - 0.12, pts = [a];
        for (let k = 0; k <= 26; k++) { const t = t0 + k / 26 * (t1 - t0); pts.push(around(y + rise * Math.abs(Math.sin(t / 2)) ** curve, t)); }
        pts.push(b);
        for (let pass = 0; pass < 2; pass++) for (let k = 2; k < pts.length - 2; k++) pts[k] = lerp(pts[k], lerp(pts[k - 1], pts[k + 1], 0.5), 0.5);
        m.loft(pts.length, i => {
            const d = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
            return { center: pts[i], x: norm(cross([0, 1, 0], d)), y: [0, 1, 0], rx: thick, ry: half };
        }, 8, rgb, skin, true);
    }

    function eyewear(m, L, o, lens) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const frame = linear(o.color), size = o.size || 1, shape = o.shape || 'round';
        const lensParts = new Mesh(), inner = {}, rimR = 0.0018 * (shape === 'aviator' ? 0.8 : 1.15);
        for (const E of [L.eyeL, L.eyeR]) {
            const side = Math.sign(E.center[0]);
            const r = E.radius * 1.55 * size;
            const c = add(E.center, [side * r * 0.08, -E.radius * 0.15, E.radius * 1.05 + 0.006]);
            // The rim's centerline at angle a (0 = toward +x).
            const rim = a => {
                let x = Math.cos(a) * r, y = Math.sin(a) * r * (shape === 'round' ? 0.92 : 0.72);
                if (shape === 'square') { const k = 1 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)) * 1.25); x = Math.cos(a) * r * Math.min(1.12, k * 0.85); y = Math.sin(a) * r * 0.72 * Math.min(1.25, k * 0.85); }
                if (shape === 'cat') { y *= 1 + 0.35 * Math.max(0, Math.sin(a)) * (side * Math.cos(a) > 0 ? 1 : 0.2); }
                if (shape === 'aviator') { y = Math.sin(a) * r * (Math.sin(a) < 0 ? 1.05 : 0.72); x *= 1.05; }
                return add(c, [x, y, -Math.abs(x) * 0.12]);
            };
            loop(m, ringPath(r, 28, rim), rimR, frame, skin);
            const ln = new Mesh();
            ln.disk(c, [0, 0, 1], r * 0.98, linear(lens.tint), skin, 24, r * (shape === 'round' ? 0.9 : shape === 'aviator' ? 0.86 : 0.7));
            lensParts.p.push(...ln.p); lensParts.n.push(...ln.n); lensParts.c.push(...ln.c); lensParts.j.push(...ln.j); lensParts.w.push(...ln.w);
            const base = lensParts.i.length ? Math.max(...lensParts.i) + 1 : 0;
            for (const x of ln.i) lensParts.i.push(x + base);
            // The bridge meets each rim at its inner edge, a little above center; the hinge sits on the outer edge.
            const inAt = side > 0 ? Math.PI - 0.32 : 0.32, outAt = side > 0 ? 0.28 : Math.PI - 0.28;
            inner[side] = rim(inAt);
            const outer = rim(outAt);
            // The hinge block and the arm back to the ear, along the side of the head.
            const hinge = add(outer, [side * 0.003, 0, -0.002]);
            m.box(hinge, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.0026, 0.0034, 0.0032], frame, skin);
            // The temple: along the side of the head (never into it) to the root of the ear, then bent down behind the ear.
            const ear = side > 0 ? L.earL : L.earR;
            const start = add(hinge, [side * 0.0015, 0, -0.003]);
            const E2 = earTop(L, side), top = E2 ? E2.top : ear ? ear.center : add(start, [0, 0.004, -0.09]), rootZ = (E2 ? E2.center[2] : top[2]) + 0.004, ty = top[1] - 0.002;
            const arm = [start];
            for (let k = 1; k <= 8; k++) { const t = k / 8, y = start[1] + (ty - start[1]) * Math.pow(t, 1.6), z = start[2] + (rootZ - start[2]) * t; arm.push([side * Math.max(sideX(L, side, y, z) + 0.0028, Math.abs(start[0]) - t * 0.012), y, z]); }
            for (const [dz, dy] of [[-0.007, -0.004], [-0.012, -0.014], [-0.013, -0.026], [-0.011, -0.036]]) { const y = ty + dy, z = rootZ + dz; arm.push([side * (sideX(L, side, y, z) + 0.0022), y, z]); }
            m.tube(smoothPath(arm, 3), 0.0018, 5, frame, skin);
            // A nose pad on a short arm from the inner rim.
            const pad = add(rim(side > 0 ? Math.PI + 0.55 : -0.55), [side * -0.002, 0, -0.006]);
            m.tube([rim(side > 0 ? Math.PI + 0.35 : -0.35), pad], 0.0007, 4, frame, skin);
            m.sphere(pad, 0.0024, linear('#d8dde0'), skin, 6, 10, [0.45, 1, 0.8]);
        }
        // The bridge over the nose: from rim to rim, arched up and a touch forward.
        const inL = inner[1], inR = inner[-1], top = add(lerp(inL, inR, 0.5), [0, 0.0045, 0.003]);
        m.tube([inL, lerp(inL, top, 0.55), top, lerp(inR, top, 0.55), inR], rimR * 0.95, 5, frame, skin);
        return [{ mesh: lensParts, extra: { name: 'Lenses', opacity: lens.opacity, roughness: 0.05, metalness: 0 } }];
    }

    function monocle(m, L, o) {
        const head = L.boneIndex('Head');
        const E = L.eyeR, r = E.radius * 1.5 * (o.size || 1);
        const c = add(E.center, [0, 0, E.radius * 1.05 + 0.004]);
        loop(m, ringPath(r, 28, a => add(c, [Math.cos(a) * r, Math.sin(a) * r, 0])), 0.0022, linear(o.color), rigid(head));
        const lens = new Mesh();
        lens.disk(c, [0, 0, 1], r, linear('#dfeef6'), rigid(head));
        // A chain from the rim down to the chest, sagging.
        const start = add(c, [0, -r, 0]);
        const end = [L.neck.center[0] - L.neck.rx * 1.6, L.neck.center[1] - 0.12, L.neck.center[2] + L.neck.rz * 1.5];
        const pts = [];
        for (let k = 0; k <= 16; k++) { const t = k / 16; const p = lerp(start, end, t); p[1] -= Math.sin(t * Math.PI) * 0.05; p[2] += Math.sin(t * Math.PI) * 0.03; pts.push(p); }
        m.tube(pts, 0.0011, 4, linear(o.color), spineSkin(L));
        return [{ mesh: lens, extra: { name: 'Lenses', opacity: 0.15, roughness: 0.05 } }];
    }

    function eyepatch(m, L, o) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const E = o.side === 'right' ? L.eyeR : L.eyeL, side = Math.sign(E.center[0]);
        const c = add(E.center, [0, 0, E.radius * 1.1 + 0.003]);
        const r = E.radius * 1.7;
        m.loft(5, (i, t) => ({ center: add(c, [0, 0, -t * 0.006]), x: [1, 0, 0], y: [0, 1, 0], rx: r * (1 - t * t * 0.5), ry: r * 0.85 * (1 - t * t * 0.5) }), 20, linear(o.color), skin, true);
        // The strap round the head, rising toward the back.
        const ring = L.ring(E.center[1] + 0.02);
        if (ring) {
            const pts = ringPath(1, 32, a => [ring.center[0] + Math.sin(a) * (ring.rx + 0.004), E.center[1] + 0.015 + (1 - Math.cos(a)) * 0.012, ring.center[2] + Math.cos(a) * (ring.rz + 0.004)]);
            loop(m, pts, 0.0025, linear(o.color), skin, 4);
        }
        return [];
    }

    function goggles(m, L, o) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const lift = (o.up || 0) * 0.06, leather = linear(o.color), brass = linear('#b08a4a'), y = L.eyeY + lift;
        const ends = {};
        for (const E of [L.eyeL, L.eyeR]) {
            const side = Math.sign(E.center[0]), r = E.radius * 1.55;
            const c = add(E.center, [0, lift, E.radius * 0.9 + lift * 0.3]);
            // Pushed up, the cups rest on the forehead's own slope rather than hanging in front of it.
            if (lift) { let front = -Infinity; for (const v of L.headIds) if (Math.abs(L.P[v * 3] - c[0]) < 0.012 && Math.abs(L.P[v * 3 + 1] - c[1]) < 0.01) front = Math.max(front, L.P[v * 3 + 2]); if (Number.isFinite(front)) c[2] = c[2] + (front + 0.006 - c[2]) * Math.min(1, o.up); }
            // A leather cup flaring to the face, a brass bezel holding the lens at its front.
            m.loft(5, (i, t) => ({ center: add(c, [0, 0, -0.004 + t * 0.016]), x: [1, 0, 0], y: [0, 1, 0], rx: r * (1.16 - t * 0.12), ry: r * (1.16 - t * 0.12) }), 18, leather, skin, false);
            const front = add(c, [0, 0, 0.012]);
            m.loft(4, (i, t) => ({ center: add(front, [0, 0, t * 0.004]), x: [1, 0, 0], y: [0, 1, 0], rx: r * (1.07 - (i === 3 ? 0.08 : 0)), ry: r * (1.07 - (i === 3 ? 0.08 : 0)) }), 20, brass, skin, false);
            loop(m, ringPath(1, 24, a => add(front, [Math.cos(a) * r * 1.07, Math.sin(a) * r * 1.07, 0.0042])), 0.0012, brass, skin, 5);
            m.disk(add(front, [0, 0, 0.0025]), [0, 0, 1], r * 1.0, linear(o.color2 || '#7a9a6a'), skin);
            // Where the strap and the bridge meet the cup: its outer and inner sides.
            ends[side] = { out: add(c, [side * r * 1.1, 0, 0.004]), in: add(c, [-side * r * 1.08, 0, 0.006]) };
        }
        // The nose bridge, cup to cup.
        const a = ends[1].in, b = ends[-1].in;
        m.tube([a, add(lerp(a, b, 0.5), [0, 0.004, 0.004]), b], 0.0028, 6, leather, skin);
        // The strap: from one cup's outer side round the back of the head to the other, a flat band.
        backStrap(m, L, ends[1].out, ends[-1].out, y, 0.004, 0.0011, leather, skin, 0.022, 1);
        return [];
    }

    /** The hat line: just above the brow, its section scaled out a little for the hair under it. */
    function hatRing(L, o, raise = 0.012, tall = 0) {
        let y = L.brow + raise + 0.006;
        const ring = L.ring(y, 0.015) || { center: [0, y, 0], rx: 0.08, rz: 0.1 };
        const fit = 1.08 * (o.size || 1);
        let rx = ring.rx * fit + 0.008, rz = ring.rz * fit + 0.008;
        // Over the hair: round the hair at the hat's line, and up on hair standing taller than its crown.
        const H = L.hair;
        if (H && H.length) {
            let hx = 0, hf = -Infinity, hb = Infinity, top = -Infinity;
            for (let i = 0; i < H.length; i += 3) {
                const x = H[i] - ring.center[0], z = H[i + 2] - ring.center[2];
                if (Math.abs(x) > ring.rx * 1.8 || z > ring.rz * 2 || z < -ring.rz * 2.2) continue;
                if (Math.abs(H[i + 1] - y) < 0.012) { hx = Math.max(hx, Math.abs(x)); hf = Math.max(hf, z); hb = Math.min(hb, z); }
                if (Math.abs(x) < ring.rx * 0.7 && Math.abs(z) < ring.rz * 0.7) top = Math.max(top, H[i + 1]);
            }
            if (hx) { rx = Math.max(rx, hx * 1.02 + 0.004); rz = Math.max(rz, (hf - hb) / 2 * 1.02 + 0.004); }
            if (tall && top > y + tall * 0.85) y += Math.min(0.04, top - (y + tall * 0.85));
        } else { rx += 0.006; rz += 0.006; }
        return { center: [ring.center[0], y, ring.center[2]], rx, rz };
    }

    function brim(m, R, out, rgb, skin, curl = 0, fold = 0) {
        // Two rings of the brim's top and underside: from the crown's edge out to `out` times its radius.
        const sides = 40;
        m.loft(7, (i, t) => {
            const k = 1 + (out - 1) * (i < 4 ? i / 3 : (6 - i) / 3);
            const lip = i < 4 ? 0.004 : -0.004;
            return { center: [R.center[0], R.center[1] + lip, R.center[2]], x: [1, 0, 0], y: [0, 0, 1], rx: R.rx * k, ry: R.rz * k };
        }, sides, rgb, skin, false);
        // Curl and fold bend the brim's outer ring up: at the sides (curl) or in three points (fold).
        const P = m.p;
        for (let v = 0; v < P.length; v += 3) {
            const dx = (P[v] - R.center[0]) / R.rx, dz = (P[v + 2] - R.center[2]) / R.rz;
            const d = Math.hypot(dx, dz);
            if (d <= 1.02 || Math.abs(P[v + 1] - R.center[1]) > 0.006) continue;
            const reach = (d - 1) / Math.max(0.01, out - 1);
            const a = Math.atan2(dx, dz);
            let up = 0;
            if (curl) up += curl * Math.abs(Math.sin(a)) ** 2 * reach * reach * R.rx * 0.9;
            if (fold) up += Math.max(0, Math.cos(fold * a)) ** 2 * reach * R.rx * 1.2;
            P[v + 1] += up;
        }
        m.computeNormals();
    }

    function coneHat(m, L, o, k) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const tall = k.tall * (o.height || 1) * (o.size || 1), R = hatRing(L, o, 0.012, tall);
        brim(m, R, k.brim, linear(o.color), skin);
        const band = linear(o.color2 || o.color);
        m.loft(20, (i, t) => {
            const w = Math.pow(1 - t, 1.25) * (1 - t * 0.05);
            const bendZ = -k.bend * Math.pow(t, 2.2) * tall * 1.4, bendY = -k.bend * Math.pow(t, 3) * tall * 0.6;
            return { center: [R.center[0], R.center[1] + t * tall + bendY, R.center[2] + bendZ], x: [1, 0, 0], y: [0, 0, 1], rx: Math.max(0.002, R.rx * w), ry: Math.max(0.002, R.rz * w) };
        }, 48, t => (t < 0.09 ? band : linear(o.color)), skin, true);
        return [];
    }

    function crownHat(m, L, o, k) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const tall = k.tall * (o.height || 1) * (o.size || 1), R = hatRing(L, o, 0.012, tall);
        brim(m, R, k.brim, linear(o.color), skin, k.curl || 0, k.fold || 0);
        const base = m.p.length;
        const band = linear(o.color2 || o.color);
        const rows = 10;
        m.loft(rows + 1, (i, t) => {
            let w = 1 + (k.flare - 1) * t;
            let y = t * tall;
            if (k.top === 'dome') { w *= Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.35) / 0.65, 2))); }
            if (t >= 1 && k.top !== 'dome') w *= 0.98;
            return { center: [R.center[0], R.center[1] + y, R.center[2]], x: [1, 0, 0], y: [0, 0, 1], rx: Math.max(0.002, R.rx * w), ry: Math.max(0.002, R.rz * w) };
        }, 48, t => (k.band && t * tall < k.band ? band : linear(o.color)), skin, true);
        // A pinched crown: the front dents in at the top.
        if (k.top === 'pinch') for (let v = base; v < m.p.length; v += 3) {
            const up = (m.p[v + 1] - R.center[1]) / tall;
            if (up < 0.55) continue;
            const front = (m.p[v + 2] - R.center[2]) / R.rz;
            m.p[v + 1] -= Math.max(0, front) * (up - 0.55) * tall * 0.45 + (1 - Math.abs((m.p[v] - R.center[0]) / R.rx)) * (up - 0.55) * tall * 0.2;
        }
        m.computeNormals();
        return [];
    }

    function cap(m, L, o) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const R = hatRing(L, o, 0.004);
        // The crown hugs the skull: a surface laid a few millimetres off the head (and the hair's middle depth), found
        // along rays from inside the head, eased, the front pair of panels a little taller and stiffer.
        const hair = L.hair || [], C = [R.center[0], R.center[1] - 0.02, R.center[2] - 0.004], skinPts = [], hairPts = [];
        const isEar = earOf(L);
        // (The ears stand out of the head under the cap's edge; the crown goes over the skull, not round them.)
        for (const v of L.headIds) if (L.P[v * 3 + 1] > R.center[1] - 0.004 && !isEar(v)) skinPts.push(L.P[v * 3] - C[0], L.P[v * 3 + 1] - C[1], L.P[v * 3 + 2] - C[2]);
        for (let i = 0; i < hair.length; i += 3) if (hair[i + 1] > R.center[1] - 0.004) hairPts.push(hair[i] - C[0], hair[i + 1] - C[1], hair[i + 2] - C[2]);
        const cols = 72, rowsN = 17, a0 = Math.atan2(0.02, Math.min(R.rx, R.rz)), elev = i => a0 + (Math.PI / 2 - a0) * Math.pow(i / (rowsN - 1), 0.9);
        const dirOf = (i, th) => { const e = elev(i); return [Math.cos(e) * Math.cos(th), Math.sin(e), Math.cos(e) * Math.sin(th)]; };
        const reach = (d, P, pct) => { const got = []; for (let k = 0; k < P.length; k += 3) { const al = P[k] * d[0] + P[k + 1] * d[1] + P[k + 2] * d[2]; if (al <= 0) continue; const px = P[k] - d[0] * al, py = P[k + 1] - d[1] * al, pz = P[k + 2] - d[2] * al; if (px * px + py * py + pz * pz < 0.012 * 0.012) got.push(al); } if (!got.length) return 0; got.sort((p, q) => p - q); return got[Math.min(got.length - 1, Math.floor(got.length * pct))]; };
        const ringR = th => { const ct = Math.cos(th), st = Math.sin(th); return 1 / Math.hypot(ct / R.rx, st / R.rz); };
        const hairNeed = [];
        let G = Array.from({ length: rowsN }, (_, i) => Array.from({ length: cols }, (_, j) => {
            const th = j / cols * Math.PI * 2 + Math.PI / 2, d = dirOf(i, th);
            // The opening hugs too: no row stands wider than the head under it, so no lip flares at the hat line.
            const hr = reach(d, hairPts, 1), r = Math.max(reach(d, skinPts, 1) + 0.0045, hr + 0.0025);
            (hairNeed[i] || (hairNeed[i] = []))[j] = hr ? hr + 0.0025 : 0;
            if (i === 0) return r > 0.02 ? Math.min(r, Math.hypot(ringR(th), 0.02)) : Math.hypot(ringR(th), 0.02);
            // The front panels stand a little proud of the forehead: a structured front.
            const front = Math.max(0, Math.sin(th)) ** 3 * Math.sin(Math.PI * Math.min(1, i / (rowsN - 1) * 1.4)) * 0.007;
            return r > 0.02 ? r + front : 0;
        }));
        for (let i = 1; i < rowsN; i++) for (let j = 0; j < cols; j++) if (!G[i][j]) G[i][j] = G[i - 1][j];
        // Easing never pulls the crown in below the hair it must cover (the skull it may ease over, by a hair's breadth).
        const need = G.map((row, i) => row.map((_, j) => (hairNeed[i] && hairNeed[i][j]) || 0));
        for (let pass = 0; pass < 4; pass++) G = G.map((row, i) => row.map((v, j) => { let sum = 0, n = 0; for (let di = -1; di <= 1; di++) for (let dj = -2; dj <= 2; dj++) { const ii = Math.min(rowsN - 1, Math.max(0, i + di)); sum += G[ii][(j + dj + cols) % cols]; n++; } return Math.max(v * 0.6 + sum / n * 0.4, sum / n, need[i][j]); }));
        const top = G[rowsN - 1].reduce((p, q) => p + q, 0) / cols;
        const height = top * (o.height || 1);
        const profiles = Array.from({ length: rowsN }, (_, i) => ({ center: [C[0], C[1] + Math.sin(elev(i)) * top, C[2]] }));
        // Six sewn panels: each puffs a little between its seams, which sink in; topstitching runs either side of every seam.
        const crownCol=linear(o.color),seamCol=crownCol.map(v=>v*.72),thread=crownCol.map(v=>v*.6+.12);
        const puff=(a_,t)=>1+.012*Math.pow(Math.abs(Math.sin(3*a_)),.6)*Math.sin(Math.PI*Math.min(1,t*1.15))-.003*(1-Math.pow(Math.abs(Math.sin(3*a_)),.3));
        const at=(i,a_)=>{const u=((a_-Math.PI/2)/(Math.PI*2)%1+1)%1*cols,j=Math.floor(u),f=u-j,r=G[i][j%cols]*(1-f)+G[i][(j+1)%cols]*f,t=i/(rowsN-1),k=i===0?1:puff(a_,t),d=dirOf(i,a_);
            const h=i===rowsN-1?[0,1,0]:d;return add(C,mul(i===rowsN-1?[0,1,0]:h,r*k*(i===rowsN-1?1:1)));};
        const base=m.p.length/3;
        for(let i=0;i<rowsN;i++)for(let j=0;j<cols;j++){const a_=j/cols*Math.PI*2+Math.PI/2;m.vertex(at(i,a_),[0,1,0],crownCol,skin);}
        const apex=m.vertex(add(C,[0,top+.0005,0]),[0,1,0],crownCol,skin);
        for(let i=0;i+1<rowsN;i++)for(let j=0;j<cols;j++){const q=base+i*cols+j,r=base+i*cols+(j+1)%cols,u=q+cols,w=r+cols;m.tri(q,u,r);m.tri(r,u,w);}
        for(let j=0;j<cols;j++)m.tri(base+(rowsN-1)*cols+j,apex,base+(rowsN-1)*cols+(j+1)%cols);
        const first=base;
        // Seams at the panel joins (a quarter turn off the front so a seam runs down the middle of the front pair).
        const seamA=j=>j/6*Math.PI*2+Math.PI/2;
        for(let j=0;j<6;j++)for(const [da,r_,col] of [[0,.0008,seamCol],[.035,.00038,thread],[-.035,.00038,thread]]){
            const path=profiles.slice(0,rowsN-1).map((p,i)=>{const q=at(i,seamA(j)+da*(1+i/(rowsN-1)*1.5)),d=norm(sub(q,C));return add(q,mul(d,r_*.8));});
            m.tube(path,r_,4,col,skin,false);
        }
        // An embroidered eyelet high on each panel.
        for(let j=0;j<6;j++){const a_=seamA(j)+Math.PI/6,i=Math.round((rowsN-1)*.62),q=at(i,a_),n=norm(sub(q,C)),ex=norm(cross(n,[0,1,0])),ey=cross(ex,n);
            loop(m,ringPath(1,12,b_=>add(q,add(mul(ex,Math.cos(b_)*.0026),add(mul(ey,Math.sin(b_)*.0026),mul(n,.0005))))),.00065,thread,skin,4);
            m.disk(add(q,mul(n,.0002)),n,.0019,crownCol.map(v=>v*.25),skin,10);}
        // The button on top, and a taped hem round the opening.
        m.sphere(add(C,[0,top+.0012,0]),.0058,crownCol.map(v=>v*.9),skin,6,12,[1,.45,1]);void height;
        loop(m,ringPath(1,72,b_=>{const q=at(0,b_);return add(q,mul(norm(sub(q,C)),.0012));}),.0016,seamCol,skin,5);
        // The bill: a pre-curved, stitched brim with real thickness, its sides bowed down, joined under the crown's front.
        const brimCol=linear(o.color2||o.color),brimThread=brimCol.map(v=>v*.55+.2),pm=1.1,B=.07*(L.height/1.7)*(o.billLength||1),hb=.0016,NU=24,NV=8;
        // A D-shaped bill: its attached edge round the crown's front, its outer edge a full rounded curve ~7 cm out in
        // front (a superellipse, not a point), meeting the crown at the sides; it bows gently down toward them.
        const front0=at(0,Math.PI/2),brimAt=(u,v,lift)=>{const t=(u*2-1)*Math.PI/2,ph=(u*2-1)*pm,e=add(at(0,Math.PI/2-ph),[0,.001,0]),W=Math.abs(at(0,Math.PI/2-pm)[0]-R.center[0])*1.03,
            o_=[R.center[0]+W*Math.sin(t),R.center[1],Math.max(e[2],front0[2]+B*Math.pow(Math.abs(Math.cos(t)),.55)-(front0[2]-e[2])*.15)];
            const p=lerp(e,o_,v);p[1]+=-.013*Math.pow(Math.sin(t),2)*v-.005*v*v+lift;return p;};
        const bfirst=m.i.length,bb=m.p.length/3,grid=(lift)=>{const st=m.p.length/3;for(let i=0;i<=NU;i++)for(let j=0;j<=NV;j++)m.vertex(brimAt(i/NU,j/NV,lift),[0,1,0],brimCol,skin);return st;};
        const T=grid(hb),Bt=grid(-hb),id=(g,i,j)=>g+i*(NV+1)+j;
        for(let i=0;i<NU;i++)for(let j=0;j<NV;j++){m.tri(id(T,i,j),id(T,i+1,j),id(T,i,j+1));m.tri(id(T,i+1,j),id(T,i+1,j+1),id(T,i,j+1));m.tri(id(Bt,i,j),id(Bt,i,j+1),id(Bt,i+1,j));m.tri(id(Bt,i+1,j),id(Bt,i,j+1),id(Bt,i+1,j+1));}
        const edge=(a1,a2,b1,b2)=>{m.tri(a1,b1,a2);m.tri(a2,b1,b2);};
        for(let i=0;i<NU;i++){edge(id(T,i+1,NV),id(T,i,NV),id(Bt,i+1,NV),id(Bt,i,NV));edge(id(T,i,0),id(T,i+1,0),id(Bt,i,0),id(Bt,i+1,0));}
        for(let j=0;j<NV;j++){edge(id(T,0,j+1),id(T,0,j),id(Bt,0,j+1),id(Bt,0,j));edge(id(T,NU,j),id(T,NU,j+1),id(Bt,NU,j),id(Bt,NU,j+1));}
        // Wind the brim outward whatever the frame's handedness (volume test, as the lofts do).
        {const P=m.p,pt=v=>[P[v*3],P[v*3+1],P[v*3+2]];let vol=0;for(let t=bfirst;t<m.i.length;t+=3)vol+=dot(pt(m.i[t]),cross(pt(m.i[t+1]),pt(m.i[t+2])));
         if(vol<0)for(let t=bfirst;t<m.i.length;t+=3){const v=m.i[t+1];m.i[t+1]=m.i[t+2];m.i[t+2]=v;}}
        void bb;void first;
        for(const v of [.5,.68,.84,.93])m.tube(Array.from({length:NU+1},(_,i)=>brimAt(i/NU*(1-(v>.9?.04:.08))+(v>.9?.02:.04),v,hb+.00035)),.00034,4,brimThread,skin,false);
        m.computeNormals();
        return [];
    }

    /** A faceted gem facing n: an octagonal table, crown facets to the girdle and a pavilion to its point, every face flat. */
    function facetedGem(g, c, n, r, rgb, skin) {
        const x = norm(cross(n, Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), y = cross(n, x), S = 8;
        const at = (k, rr, h, turn = 0) => { const a = (k + turn) / S * Math.PI * 2; return add(c, add(add(mul(x, Math.cos(a) * rr), mul(y, Math.sin(a) * rr)), mul(n, h))); };
        const face = (p, q, w) => { const fn = norm(cross(sub(q, p), sub(w, p))), dir = dot(fn, sub(add(add(p, q), w).map(v => v / 3), sub(c, mul(n, r * 0.2)))) >= 0, nn = dir ? fn : mul(fn, -1); const i0 = g.vertex(p, nn, rgb, skin), i1 = g.vertex(q, nn, rgb, skin), i2 = g.vertex(w, nn, rgb, skin); if (dir) g.tri(i0, i1, i2); else g.tri(i0, i2, i1); };
        const top = r * 0.42, table = r * 0.55, culet = add(c, mul(n, -r * 0.75)), mid = add(c, mul(n, top));
        for (let k = 0; k < S; k++) {
            const t0 = at(k, table, top, 0.5), t1 = at(k + 1, table, top, 0.5), g0 = at(k, r, 0), g1 = at(k + 1, r, 0);
            face(mid, t0, t1);
            face(g0, g1, t0); face(g1, t1, t0);
            face(g0, culet, g1);
        }
    }

    /**
     * Crown: one continuous gold shell, its rim rising into tall points and lower fleur points that grow out of the
     * band with smooth fillets (no pieces stuck on square), rolled beads along both edges and up every point, pearls
     * on the tips, and a row of faceted jewels in bezels round the band, the largest in front on four prongs.
     */
    function crown(m, L, o) {
        const head = L.boneIndex('Head'), skin = rigid(head), s = o.size || 1;
        const R = hatRing(L, o, 0.022), tall = 0.055 * (o.height || 1), band = 0.022;
        const gold = linear(o.color), gem = linear(o.color2 || '#c0203a'), pearl = linear('#efe8dc'), clear = linear('#dfe8f2');
        const N = 8, cols = 96, rows = 2, t2 = 0.0024, T = new ExactMesh();
        // The rim's height round the head: the band, plus a point at each of N places, alternately tall and low.
        const peak = th => { let h = 0; for (let k = 0; k < N; k++) { const c = k / N * Math.PI * 2, d = Math.abs(((th - c + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI), w = Math.PI / N * (k % 2 ? 0.9 : 0.95), x = d / w; if (x < 1) h = Math.max(h, (k % 2 ? 0.6 : 1) * Math.pow(1 - x, 1.55)); } return h; };
        const rimH = th => band + tall * peak(th);
        const pos = (th, f, inset) => { const y = R.center[1] + rimH(th) * f, flare = 1 + 0.06 * Math.pow(Math.max(0, (rimH(th) * f - band) / tall), 2); return [R.center[0] + Math.sin(th) * (R.rx * flare - inset), y, R.center[2] + Math.cos(th) * (R.rz * flare - inset)]; };
        const first = m.i.length, outer = [], inner = [];
        for (const [list, inset] of [[outer, 0], [inner, t2]]) for (let j = 0; j < cols; j++) { const th = j / cols * Math.PI * 2, col = []; for (let i = 0; i <= rows; i++) col.push(m.vertex(pos(th, i / rows, inset), [0, 1, 0], gold, skin)); list.push(col); }
        for (let j = 0; j < cols; j++) { const k = (j + 1) % cols; for (let i = 0; i < rows; i++) { m.tri(outer[j][i], outer[k][i], outer[j][i + 1]); m.tri(outer[k][i], outer[k][i + 1], outer[j][i + 1]); m.tri(inner[j][i], inner[j][i + 1], inner[k][i]); m.tri(inner[k][i], inner[j][i + 1], inner[k][i + 1]); }
 }
        // The rim and foot strips have corners of their own, so the faces' shading stays crisp (no up-tilted sheen).
        const edge = (f, inset) => Array.from({ length: cols }, (_, j) => m.vertex(pos(j / cols * Math.PI * 2, f, inset), [0, 1, 0], gold, skin));
        const oT = edge(1, 0), iT = edge(1, t2), oB = edge(0, 0), iB = edge(0, t2);
        for (let j = 0; j < cols; j++) { const k = (j + 1) % cols; m.tri(oT[j], oT[k], iT[j]); m.tri(oT[k], iT[k], iT[j]); m.tri(oB[j], iB[j], oB[k]); m.tri(oB[k], iB[j], iB[k]); }
        { const P = m.p, pt = v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]; let vol = 0; for (let t = first; t < m.i.length; t += 3) vol += dot(pt(m.i[t]), cross(pt(m.i[t + 1]), pt(m.i[t + 2])));
          if (vol < 0) for (let t = first; t < m.i.length; t += 3) { const v = m.i[t + 1]; m.i[t + 1] = m.i[t + 2]; m.i[t + 2] = v; } }
        // Rolled beads: along the bottom edge, along the band's top, and up the rim over every point.
        const out = (th, f, more) => { const p = pos(th, f, 0), n = norm([Math.sin(th) / R.rx, 0, Math.cos(th) / R.rz]); return add(p, mul(n, more)); };
        loop(T, ringPath(1, 48, th => out(th, 0.04, 0.0008)), 0.0022, gold, skin, 6);
        loop(T, ringPath(1, 48, th => { const p = out(th, 0, 0.0008); return [p[0], R.center[1] + band * 0.96, p[2]]; }), 0.0016, gold, skin, 5);
        loop(T, ringPath(1, 96, th => add(pos(th, 1, t2 / 2), [0, 0.0006, 0])), 0.0016, gold, skin, 5);
        // Pearls on the tips.
        const jewels = new Mesh();
        for (let k = 0; k < N; k++) { const th = k / N * Math.PI * 2, tip = add(pos(th, 1, t2 / 2), [0, 0.004, 0]); T.sphere(tip, k % 2 ? 0.0036 : 0.0048, pearl, skin, 4, 8); }
        // Jewels round the band, in bezels: deep red under the tall points, clear stones between; the front stone the largest, on prongs.
        for (let k = 0; k < 12; k++) {
            const th = k / 12 * Math.PI * 2, front = k === 0, r = (front ? 0.0072 : k % 2 ? 0.0038 : 0.0052) * s;
            const n = norm([Math.sin(th) / R.rx, 0, Math.cos(th) / R.rz]), c = add(out(th, 0, 0.0016), [0, band * 0.5 - (R.center[1] + rimH(th) * 0 - R.center[1]), 0]);
            const at = [c[0], R.center[1] + band * 0.48, c[2]];
            facetedGem(jewels, add(at, mul(n, r * 0.35)), n, r, k % 2 ? clear : gem, skin);
            loop(T, ringPath(1, 10, a => { const x = norm(cross(n, [0, 1, 0])), yv = cross(n, x); return add(at, add(add(mul(x, Math.cos(a) * r * 1.12), mul(yv, Math.sin(a) * r * 1.12)), mul(n, r * 0.25))); }), 0.0011, gold, skin, 4);
            if (front) for (let q = 0; q < 4; q++) { const a = (q + 0.5) / 4 * Math.PI * 2, x = norm(cross(n, [0, 1, 0])), yv = cross(n, x), rad = d => add(mul(x, Math.cos(a) * d), mul(yv, Math.sin(a) * d));
                T.tube(smoothPath([add(at, add(rad(r * 1.15), mul(n, r * 0.1))), add(at, add(rad(r * 1.08), mul(n, r * 0.55))), add(at, add(rad(r * 0.78), mul(n, r * 0.72)))], 2), t => 0.0012 * (1 - 0.4 * t), 4, gold, skin); }
        }
        // A jewel set in each tall point, growing from its middle.
        for (let k = 0; k < N; k += 2) { const th = k / N * Math.PI * 2, n = norm([Math.sin(th) / R.rx, 0.25, Math.cos(th) / R.rz]), at = out(th, 0.62, 0.001);
            facetedGem(jewels, add(at, mul(n, 0.0016)), n, 0.0042 * s, gem, skin);
            loop(T, ringPath(1, 10, a => { const x = norm(cross(n, [0, 1, 0])), yv = cross(n, x); return add(at, add(add(mul(x, Math.cos(a) * 0.0047 * s), mul(yv, Math.sin(a) * 0.0047 * s)), mul(n, 0.001))); }), 0.001, gold, skin, 4); }
        // The trims keep the few sides asked for (an ExactMesh) and join the gold shell, whose own normals are worked out first.
        m.computeNormals();
        merge(m, T);
        return [{ mesh: jewels, extra: { name: 'Jewels', roughness: 0.04, metalness: 0.1, ownSurface: true } }];
    }

    function circlet(m, L, o) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const R = hatRing(L, o, -0.004);
        loop(m, ringPath(1, 36, a => [R.center[0] + Math.sin(a) * R.rx, R.center[1] - Math.cos(a) * 0.01 + 0.01, R.center[2] + Math.cos(a) * R.rz]), 0.0022, linear(o.color), skin, 5);
        m.sphere([R.center[0], R.center[1], R.center[2] + R.rz + 0.004], 0.006, linear(o.color2 || '#3a8ad8'), skin, 5, 8, [1, 1.3, 0.7]);
        return [];
    }

    function vikingHelm(m, L, o) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const R = hatRing(L, o, -0.004);
        const dome = R.rx * 1.05;
        m.loft(10, (i, t) => {
            const a = t * Math.PI / 2;
            return { center: [R.center[0], R.center[1] + Math.sin(a) * dome, R.center[2]], x: [1, 0, 0], y: [0, 0, 1], rx: Math.max(0.002, R.rx * Math.cos(a)), ry: Math.max(0.002, R.rz * Math.cos(a)) };
        }, 28, linear(o.color), skin, true);
        m.loft(2, (i, t) => ({ center: [R.center[0], R.center[1] + t * 0.02, R.center[2]], x: [1, 0, 0], y: [0, 0, 1], rx: R.rx + 0.004, ry: R.rz + 0.004 }), 28, linear('#6a5a3a'), skin, false);
        for (const side of [1, -1]) {
            const start = [R.center[0] + side * R.rx * 0.9, R.center[1] + dome * 0.45, R.center[2]];
            const pts = [];
            for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(add(start, [side * t * 0.11 * (o.size || 1), Math.sin(t * Math.PI * 0.6) * 0.09 * (o.height || 1), -t * 0.02])); }
            m.tube(pts, t => 0.022 * (1 - t) + 0.002, 8, linear(o.color2 || '#ece4d0'), skin);
        }
        return [];
    }

    function headband(m, L, o) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const R = hatRing(L, o, -0.002);
        m.loft(2, (i, t) => ({ center: [R.center[0], R.center[1] - 0.01 + t * 0.022, R.center[2]], x: [1, 0, 0], y: [0, 0, 1], rx: R.rx - 0.004, ry: R.rz - 0.004 }), 36, linear(o.color), skin, false);
        return [];
    }

    function halo(m, L, o) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        const c = [0, L.crown + 0.06, L.ring(L.brow)?.center[2] || 0];
        const r = 0.09 * (o.size || 1);
        loop(m, ringPath(1, 40, a => [c[0] + Math.sin(a) * r, c[1], c[2] + Math.cos(a) * r]), 0.006, linear(o.color), skin, 6);
        return [];
    }

    function earrings(m, L, o, kind) {
        const head = L.boneIndex('Head'), skin = rigid(head);
        for (const E of [L.earL, L.earR]) {
            if (!E || !E.lobe) continue;
            const side = Math.sign(E.lobe[0]);
            const at = add(E.lobe, [side * 0.002, 0.002, 0]);
            if (kind === 'stud') { m.sphere(at, 0.0035 * (o.size || 1), linear(o.color), skin, 4, 8); continue; }
            const r = 0.011 * (o.size || 1);
            loop(m, ringPath(1, 24, a => add(at, [side * 0.001, -r + Math.cos(a) * r, Math.sin(a) * r])), 0.0012, linear(o.color), skin, 5);
        }
        return [];
    }

    function brooch(m,L,o) {
        const scale=L.height/1.7,s=(o.size||1)*scale,skin=spineSkin(L),N=L.neck;
        const y=N.center[1]-.095*scale,x=N.center[0]+.055*scale,z=L.frontAt(y,x)+.004*scale,c=[x,y,z],gold=linear(o.color),gem=linear(o.color2||'#387d78');
        // Raised bezel, faceted stone, eight prongs and a fine beaded rim.
        m.loft(3,(_,t)=>({center:add(c,[0,0,t*.003*s]),x:[1,0,0],y:[0,1,0],rx:.014*s,ry:.018*s}),24,gold,skin,true);
        m.loft(3,(_,t)=>({center:add(c,[0,0,(.003+t*.005)*s]),x:[1,0,0],y:[0,1,0],rx:(t===1?.006:.011)*s,ry:(t===1?.009:.015)*s}),8,gem,skin,true);
        for(let k=0;k<16;k++){const a=k/16*Math.PI*2;m.sphere(add(c,[Math.cos(a)*.013*s,Math.sin(a)*.017*s,.003*s]),.0011*s,gold,skin,3,5);}
        // Claw prongs: short, from the bezel's inner lip up the stone's side and curled in over its girdle, tapering to a point.
        const gemAt=h=>1-(h-.003)/.005*(1-.006/.011);
        for(let k=0;k<8;k++){const a=k/8*Math.PI*2+Math.PI/8,ell=(f,h)=>add(c,[Math.cos(a)*.011*s*f,Math.sin(a)*.015*s*f,h*s]);
            const claw=[ell(1.06,.0028),ell(1.03,.0050),ell(.97,.0059),ell(.9,.0062)];
            m.tube(smoothPath(claw,3),t=>.0011*s*(1-.3*t),6,gold,skin);m.sphere(ell(.9,.0062),.00085*s,gold,skin,4,8);}
        return [];
    }

    function necklace(m, L, o) {
        const skin = spineSkin(L), N = L.neck;
        const drop = 0.03 + (o.length ?? 0.5) * 0.12;
        const pts = ringPath(1, 40, a => {
            const f = Math.max(0, Math.cos(a));
            return [N.center[0] + Math.sin(a) * (N.rx + 0.012 + f * 0.03), N.center[1] - 0.02 - f * f * drop, N.center[2] + Math.cos(a) * (N.rz + 0.008) + f * f * drop * 0.6];
        });
        loop(m, pts, 0.0016, linear(o.color), skin, 5);
        const front = pts[0];
        m.sphere(add(front, [0, -0.012, 0.004]), 0.008, linear(o.color2 || o.color), skin, 6, 8, [1, 1.3, 0.6]);
        return [];
    }

    // Choker options (Prop Builder 2026-10-18): `shape` the band (leather, velvet, metal links,
    // lace with a scalloped edge), `width` its height, `thick` its thickness, `charm` at the front, `studs`.
    function choker(m, L, o) {
        const skin = spineSkin(L), N = L.neck, s = o.size || 1;
        const h = 0.014 * (o.width ?? 1), t = 0.0025 * (o.thick ?? 1);
        // Wider bands grow down the neck, never into the chin/jaw section.
        const y = Math.min(N.center[1] + .008, L.chin - .006 - h);
        const section = L.neckSection(y + h * .5), at = (a, pad = 0) => section.at(a, .002 + pad, s);
        const circumference = ringPath(0,64,a=>at(a)).reduce((sum,p,j,points)=>sum+len(sub(p,points[(j+1)%points.length])),0);
        // A closed band: inner foot, outer foot, outer top, inner top, round to the inner foot.
        const rows = o.shape==='lace'?[[0,h*.8],[t,h*.8],[t,h],[0,h],[0,h*.8]]:[[0,0],[t,0],[t,h],[0,h],[0,0]];
        if(o.shape==='metal'){
            const count=Math.max(16,Math.min(64,Math.round(circumference/Math.max(.006,h*.7)))),spacing=circumference/count;
            for(let j=0;j<count;j++){const a=j/count*Math.PI*2,normal=norm(sub(at(a),section.center)),tangent=norm(sub(at(a+.005),at(a-.005))),tilt=(j%2?1:-1)*Math.PI/4,v=add([0,Math.cos(tilt),0],mul(normal,Math.sin(tilt))),c=at(a,t+h*.36),path=ringPath(0,24,q=>add(c,add(mul(tangent,Math.cos(q)*spacing*.70),mul(v,Math.sin(q)*h*.5))));loop(m,path,Math.min(t*.28,h*.15,spacing*.10),linear(o.color),skin,8);}
        }else{
            const bands = rows.map(([pad,dy])=>Array.from({length:64},(_,j)=>{const a=j/64*Math.PI*2,p=L.neckSection(y+dy).at(a,.002+pad,s);return m.vertex(p,[Math.sin(a),0,Math.cos(a)],linear(o.color),skin);}));
            for(let i=0;i+1<bands.length;i++)for(let j=0;j<64;j++){const a=bands[i][j],b=bands[i][(j+1)%64],c=bands[i+1][j],d=bands[i+1][(j+1)%64];m.tri(a,b,c);m.tri(b,d,c);}
            if(o.shape==='lace')for(let j=0;j<32;j++){const a=j/32*Math.PI*2,tangent=norm(sub(at(a+.005),at(a-.005))),c=at(a,t);c[1]=y+h*.55;loop(m,ringPath(0,20,q=>add(c,add(mul(tangent,Math.cos(q)*.007*s),[0,Math.sin(q)*h*.45,0]))),Math.min(t*.22,h*.14,.007*s*.30),linear(o.color),skin,8);}
        }
        m.computeNormals();
        const front = at(0,t);
        const hardware=new Mesh();
        if (o.studs) for (let k = -4; k <= 4; k++) {
            const a = k * 0.32;
            hardware.sphere(at(a,t), 0.0022 * (o.width ?? 1), linear(o.color2 || o.color), skin, 3, 6);
        }
        const charm = o.charm || 'gem', accent = linear(o.color2 || o.color), drop = add(front, [0, -h * 0.5 - 0.006, 0.002]);
        if (charm === 'gem') hardware.sphere(add(front, [0, -h * 0.1, 0.004]), 0.005, accent, skin, 4, 8);
        if (charm === 'bell') { hardware.sphere(drop, 0.0055, accent, skin, 5, 10, [1, 1.2, 1]); hardware.tube([add(front, [0, -h * 0.3, 0.001]), add(drop, [0, 0.005, 0])], 0.0008, 4, accent, skin); }
        if (charm === 'cross') { hardware.box(add(drop, [0, -0.003, 0]), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.0014, 0.009, 0.0012], accent, skin); hardware.box(add(drop, [0, 0.0015, 0]), [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.0055, 0.0014, 0.0012], accent, skin); }
        if (charm === 'ring') loop(hardware, ringPath(1, 20, a => add(drop, [Math.sin(a) * 0.006, Math.cos(a) * 0.006, 0])), 0.0011, accent, skin, 5);
        return [{mesh:hardware,extra:{name:'Choker hardware',roughness:.25,metalness:.8}}];
    }

    function bracelets(m, L, o) {
        for (const name of ['LeftHand', 'RightHand']) {
            const hand = L.bone(name), fore = L.bone(name.replace('Hand', 'ForeArm'));
            const axis = norm(sub(hand.head, fore.head));
            const c = sub(hand.head, mul(axis, 0.025));
            const x = norm(cross(axis, [0, 0, 1])), y = cross(axis, x);
            const r = 0.032 * (o.size || 1);
            loop(m, ringPath(1, 24, a => add(c, add(mul(x, Math.cos(a) * r), mul(y, Math.sin(a) * r * 0.8)))), 0.003, linear(o.color), rigid(L.boneIndex(name.replace('Hand', 'ForeArm'))), 5);
        }
        return [];
    }

    /**
     * A cape: a sheet from the shoulders, hanging behind the body. Each
     * column keeps behind the deepest part of the back above it, so it falls
     * clear of the shoulder blades and the seat.
     */
    function cape(m, L, o) {
        const N = L.neck, width = (o.width || 1);
        const sh = L.bone('LeftArm').head, top = N.center[1] - 0.01;
        const half = Math.abs(sh[0]) * 1.25 * width;
        const length = 0.35 + (o.length ?? 0.8) * (top - 0.08 - 0.35);
        const cols = 17, rows = 22;
        const skin = spineSkin(L);
        const grid = [];
        const main = linear(o.color), lining = linear(o.color2 || o.color);
        for (let r = 0; r <= rows; r++) {
            const t = r / rows, y = top - t * length;
            const row = [];
            for (let c = 0; c <= cols; c++) {
                const u = c / cols * 2 - 1;
                const spread = half * (0.55 + 0.45 * Math.min(1, t * 4)) * (1 + t * 0.35);
                const x = u * spread;
                let z = Infinity;
                // Behind the back: the deepest point of the body above, then clear of it.
                for (let yy = y; yy <= top + 0.001; yy += 0.04) z = Math.min(z, L.backAt(yy, x * 0.8));
                if (!isFinite(z)) z = N.center[2] - N.rz;
                // At the shoulders the cape wraps forward over them.
                const wrap = Math.max(0, 1 - t * 6) * Math.abs(u) ** 2 * 0.09;
                const fold = Math.sin(u * Math.PI * 4 + 1) * 0.008 * t;
                row.push([x, y - (1 - Math.min(1, t * 5)) * Math.abs(u) * 0.02, z - 0.025 - t * 0.05 + wrap + fold]);
            }
            grid.push(row);
        }
        const ids = grid.map((row, r) => row.map(p => m.vertex(p, [0, 0, -1], r === rows ? lining : main, skin)));
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            const a = ids[r][c], b = ids[r][c + 1], d = ids[r + 1][c], e = ids[r + 1][c + 1];
            m.tri(a, b, d); m.tri(b, e, d);
        }
        m.computeNormals();
        // A clasp at the collar.
        m.sphere([0, top, N.center[2] + N.rz + 0.01], 0.009, linear(o.color2 || '#d4af37'), skin, 4, 8);
        return [{ mesh: null, extra: { doubleSided: true } }];
    }

    function scarf(m, L, o) {
        const skin = spineSkin(L), N = L.neck;
        const main = linear(o.color), stripe = linear(o.color2 || o.color);
        const y = N.center[1] + 0.015;
        const pts = ringPath(1, 28, a => [N.center[0] + Math.sin(a) * (N.rx + 0.022), y + Math.cos(a) * 0.006, N.center[2] + Math.cos(a) * (N.rz + 0.022)]);
        loop(m, pts, 0.022, (t, a, p) => (Math.floor(t * 12) % 3 === 0 ? stripe : main), skin, 8);
        // A tail hanging down the front.
        const start = [N.center[0] + N.rx * 0.6, y - 0.01, N.center[2] + N.rz + 0.03];
        const tail = [];
        const len = 0.12 + (o.length ?? 0.5) * 0.35;
        for (let k = 0; k <= 8; k++) { const t = k / 8; tail.push(add(start, [t * 0.02, -t * len, 0.025 * Math.sin(t * 2) + t * 0.02])); }
        m.loft(tail.length, i => ({ center: tail[i], x: [1, 0, 0], y: [0, 0, 1], rx: 0.03, ry: 0.006 }), 8, (t) => (Math.floor(t * 8) % 3 === 0 ? stripe : main), skin, true);
        return [];
    }

    function utilityHarness(m,L,o) {
        const s=L.height/1.7,hip=L.bone('Hips').head[1],color=linear(o.color),trim=linear(o.color2),skin=spineSkin(L);
        const surface=(y,x,side)=>{
            let z=side>0?L.frontAt(y,x):L.backAt(y,x);
            for(const p of L.outfitParts||[])for(let v=0;v<p.positions.length;v+=3)
                if(Math.abs(p.positions[v]-x)<.025*s&&Math.abs(p.positions[v+1]-y)<.025*s)
                    z=side>0?Math.max(z,p.positions[v+2]):Math.min(z,p.positions[v+2]);
            return Number.isFinite(z)?z:L.neck.center[2]+side*.12*s;
        };
        for(const side of [-1,1]){
            const sh=L.bone(side>0?'LeftArm':'RightArm').head,x=sh[0]*.64,low=hip+.14*s,high=sh[1],front=surface(high-.025*s,x,1),back=surface(high-.025*s,x,-1),path=[];
            for(let j=0;j<=12;j++){const y=low+(high-low)*j/12;path.push([x,y,surface(y,x,1)+.014*s]);}
            for(let j=1;j<=8;j++){const u=j/8;path.push([x,high+.026*s*Math.sin(u*Math.PI),front*(1-u)+back*u+.014*s*Math.cos(u*Math.PI)]);}
            for(let j=1;j<=12;j++){const y=high+(low-high)*j/12;path.push([x,y,surface(y,x,-1)-.014*s]);}
            // A flat strap with a real edge, rather than a round cable floating
            // over the shoulder. Every station follows the local spine skin.
            const rows=path.map((p,j)=>{
                const tangent=norm(sub(path[Math.min(path.length-1,j+1)],path[Math.max(0,j-1)])),normal=norm(cross([1,0,0],tangent)),width=.012*s*o.size,thick=.0016*s;
                return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>m.vertex(add(p,add([a*width,0,0],mul(normal,b*thick))),normal,color,skin));
            });
            for(let j=0;j+1<rows.length;j++)for(let k=0;k<4;k++){const a=rows[j][k],b=rows[j][(k+1)%4],c=rows[j+1][k],d=rows[j+1][(k+1)%4];m.tri(a,c,b);m.tri(b,c,d);}
            const y=low+.07*s,z=surface(y,x,1)+.035*s,c=[x,y,z];
            m.box(c,[[1,0,0],[0,1,0],[0,0,1]],[.033*s,.045*s,.018*s],color,skin);
            m.box(add(c,[0,.028*s,.020*s]),[[1,0,0],[0,1,0],[0,0,1]],[.035*s,.013*s,.004*s],color.map(v=>v*.8),skin);
            // Buckle frame, central tongue and a narrow retaining loop.
            for(const dx of [-.012,.012])m.box([x+dx*s,y+.115*s,surface(y+.115*s,x,1)+.018*s],[[1,0,0],[0,1,0],[0,0,1]],[.002*s,.014*s,.003*s],trim,skin);
            for(const dy of [-.014,.014])m.box([x,y+(.115+dy)*s,surface(y+.115*s,x,1)+.018*s],[[1,0,0],[0,1,0],[0,0,1]],[.014*s,.002*s,.003*s],trim,skin);
        }
        m.computeNormals();return [];
    }

    function backpack(m, L, o) {
        const spine = L.boneIndex('Spine2'), skin = rigid(spine);
        const y = L.bone('Spine2').head[1] + 0.06;
        const z = L.backAt(y, 0);
        const s = o.size || 1;
        const c = [0, y, (isFinite(z) ? z : -0.12) - 0.07 * s];
        m.roundedBox(c,[[1,0,0],[0,1,0],[0,0,1]],[.15*s,.20*s,.07*s],.032*s,linear(o.color),skin);
        const pockets=Math.round(o.pockets||1),axes=[[1,0,0],[0,1,0],[0,0,1]],trim=linear(o.color2||o.color);
        for(let j=0;j<pockets;j++){
            const x=(j-(pockets-1)/2)*.235*s/pockets,w=.11*s/pockets-.004*s,pc=add(c,[x,-.06*s,-.075*s]);
            m.roundedBox(pc,axes,[w,.07*s,.025*s],.009*s,trim,skin);
            m.roundedBox(add(pc,[0,.044*s,-.009*s]),axes,[w+.002*s,.025*s,.019*s],.006*s,linear(o.color),skin);
            const path=[[-w+.005,-.06],[w-.005,-.06],[w-.005,.05],[-w+.005,.05],[-w+.005,-.06]].map(([a,b])=>add(pc,[a,b*s,-.026*s]));m.tube(path,.0011*s,4,trim.map(v=>v*.65),skin);
            m.roundedBox(add(pc,[0,.025*s,-.029*s]),axes,[.009*s,.006*s,.003*s],.002*s,linear('#8a8c7d'),skin);
        }
        for(const side of [-1,1]){
            const path=Array.from({length:17},(_,j)=>{const yy=-.15+j/16*.29;return add(c,[side*.095*s,yy*s,-.072*s]);});
            m.tube(path,.002*s,4,trim,skin);
        }
        // Straps over the shoulders.
        for (const side of [1, -1]) {
            const sh = L.bone(side > 0 ? 'LeftArm' : 'RightArm').head;
            const x=side*Math.abs(sh[0])*.55;let shoulder=sh[1]+.025;
            const measure=positions=>{for(let k=0;k<positions.length;k+=3)if(Math.abs(positions[k]-x)<.024&&positions[k+1]<L.neck.center[1]+.005)shoulder=Math.max(shoulder,positions[k+1]);};
            measure(L.P);for(const p of L.outfitParts)measure(p.positions);
            const back=L.backAt(shoulder-.025,x),front=L.frontAt(shoulder-.025,x),bz=Number.isFinite(back)?back-.010:c[2]+.04,fz=Number.isFinite(front)?front+.012:L.neck.center[2]+L.neck.rz+.07;
            // One continuous strap, pulled taut like a real one: it follows the convex outline of the body (skin or
            // clothing) in the slice at x, bridging hollows, from the pack's top up the back, over the trapezius and
            // down the chest to the buckle, laid a strap's thickness off it and eased through a spline.
            const y0=shoulder-.06,packTop=c[1]+.17*s,buckleY=y0-.23,slice=[];
            const take=P=>{for(let k=0;k<P.length;k+=3)if(Math.abs(P[k]-x)<.012&&P[k+1]>Math.min(packTop,buckleY)-.02&&P[k+1]<L.neck.center[1]+.03)slice.push([P[k+2],P[k+1]]);};
            take(L.P);for(const p of L.outfitParts||[])take(p.positions);
            slice.sort((p,q)=>p[0]-q[0]||p[1]-q[1]);
            const turn=(o_,a_,b_)=>(a_[0]-o_[0])*(b_[1]-o_[1])-(a_[1]-o_[1])*(b_[0]-o_[0]),lowH=[],upH=[];
            for(const p of slice){while(lowH.length>1&&turn(lowH[lowH.length-2],lowH[lowH.length-1],p)<=0)lowH.pop();lowH.push(p);}
            for(let k=slice.length-1;k>=0;k--){const p=slice[k];while(upH.length>1&&turn(upH[upH.length-2],upH[upH.length-1],p)<=0)upH.pop();upH.push(p);}
            // The hull counter-clockwise in (z, y); walk it from the back's bottom, over the top, to the front's bottom.
            const hull=lowH.slice(0,-1).concat(upH.slice(0,-1)),zc=slice.reduce((a_,p)=>a_+p[0],0)/Math.max(1,slice.length);
            let path;
            if(hull.length>3){
                const n_=hull.length,startK=hull.reduce((best,p,k)=>p[0]<zc&&Math.abs(p[1]-packTop)<Math.abs(hull[best][1]-packTop)?k:best,hull.findIndex(p=>p[0]<zc)),walk=[];
                // Counter-clockwise from the back runs down first; clockwise (decreasing index) goes up over the top.
                for(let j=0;j<n_;j++){const p=hull[((startK-j)%n_+n_)%n_];walk.push(p);if(j>2&&p[0]>zc&&p[1]<=buckleY)break;}
                const dense=[];for(let k=0;k+1<walk.length;k++){const p=walk[k],q=walk[k+1],n=Math.max(1,Math.ceil(Math.hypot(q[0]-p[0],q[1]-p[1])/.006));for(let j=0;j<n;j++)dense.push([p[0]+(q[0]-p[0])*j/n,p[1]+(q[1]-p[1])*j/n]);}
                dense.push(walk[walk.length-1]);
                const off=.0045,laid=dense.map((p,k)=>{const a_=dense[Math.max(0,k-2)],b_=dense[Math.min(dense.length-1,k+2)],t=[b_[0]-a_[0],b_[1]-a_[1]],l=Math.hypot(t[0],t[1])||1;return [x,p[1]+t[0]/l*off,p[0]-t[1]/l*off];});
                // Walking clockwise in (z, y), outward is the tangent turned left: (-t_y, t_z).
                const even=[[x,packTop-.02*s,laid[0][2]+.015]];for(const p of laid)if(len(sub(p,even[even.length-1]))>.014)even.push(p);
                path=smoothPath(even,3).filter(p=>p[1]>=buckleY-.005||p[2]<zc);
            } else path=[add(c,[side*.08,.15,.03]),[x,shoulder+.01,(c[2]+L.neck.center[2])/2],[x,buckleY,L.neck.center[2]+L.neck.rz+.06]];
            const strapColor=linear(o.color2||o.color),web=strapColor.map(v=>v*.8),metal=linear('#8a8c7d'),bodySkin=spineSkin(L);
            m.loft(path.length,i=>{const tangent=norm(sub(path[Math.min(path.length-1,i+1)],path[Math.max(0,i-1)]));return{center:path[i],x:[1,0,0],y:norm(cross(tangent,[1,0,0])),rx:.013,ry:.002};},8,strapColor,bodySkin,true);
            // The adjuster buckle at the padded strap's end, and webbing from it under the arm back to the pack's lower corner.
            const end=path[path.length-1],buckleAt=add(end,[0,-.006,.001]);
            m.roundedBox(buckleAt,[[1,0,0],[0,1,0],[0,0,1]],[.012,.006,.003],.0015,metal,bodySkin,2);
            const yy=end[1]-.03;let ribX=Math.abs(x)+.04,ribZ=(end[2]+c[2])/2;
            for(const v of L.torsoIds||[]){const px=L.P[v*3],py=L.P[v*3+1];if(Math.abs(py-yy)<.012&&Math.sign(px)===side&&Math.abs(px)>ribX){ribX=Math.abs(px);ribZ=L.P[v*3+2];}}
            const corner=add(c,[side*.12*s,-.16*s,.06*s]),under=[side*(ribX+.008),yy-.01,ribZ];
            const webPath=smoothPath([add(buckleAt,[0,-.004,0]),[x+side*.012,yy,end[2]-.002],lerp([x+side*.012,yy,end[2]],under,.6),under,lerp(under,corner,.5),corner],4);
            m.loft(webPath.length,i=>{const d=norm(sub(webPath[Math.min(webPath.length-1,i+1)],webPath[Math.max(0,i-1)])),out=norm(cross(d,[0,1,0]));return{center:webPath[i],x:out,y:norm(cross(out,d)),rx:.0015,ry:.009};},8,web,bodySkin,true);
        }
        return [];
    }

    function quiver(m, L, o) {
        const spine = L.boneIndex('Spine2'), skin = rigid(spine);
        const y = L.bone('Spine2').head[1];
        const z = L.backAt(y + 0.05, 0);
        const base = [-0.1, y - 0.12, (isFinite(z) ? z : -0.12) - 0.05], top = [0.12, y + 0.3, (isFinite(z) ? z : -0.12) - 0.05];
        m.tube([base, lerp(base, top, 0.5), top], 0.045 * (o.size || 1), 12, linear(o.color), skin);
        for (let k = 0; k < 7; k++) {
            const off = [Math.cos(k * 2.4) * 0.02, 0, Math.sin(k * 2.4) * 0.02];
            const a = add(top, off), b = add(add(top, off), mul(norm(sub(top, base)), 0.12));
            m.tube([a, b], 0.004, 4, linear('#8a6a44'), skin);
            m.box(b, [[1, 0, 0], norm(sub(top, base)), [0, 0, 1]], [0.012, 0.03, 0.001], linear(o.color2 || '#e8e0d0'), skin);
        }
        return [];
    }

    function jetpack(m, L, o) {
        const spine = L.boneIndex('Spine2'), skin = rigid(spine);
        const y = L.bone('Spine2').head[1] + 0.04;
        const z = L.backAt(y, 0);
        const s = o.size || 1, back = (isFinite(z) ? z : -0.12) - 0.06 * s;
        m.roundedBox([0, y, back + 0.02], [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.13 * s, 0.17 * s, 0.03 * s], .012*s, linear(o.color), skin);
        for(let k=0;k<Math.round(o.vents||5);k++)m.roundedBox([0,y+(.08-k*.025)*s,back-.014*s],[[1,0,0],[0,1,0],[0,0,1]],[.022*s,.005*s,.004*s],.002*s,linear('#252a30'),skin);
        for (const side of [1, -1]) {
            const c = [side * 0.075 * s, y, back - 0.04 * s];
            m.tube([add(c, [0, 0.2 * s, 0]), add(c, [0, -0.12 * s, 0]), add(c, [0, -0.2 * s, 0])], [0.05 * s, 0.05 * s, 0.035 * s], 14, linear(o.color), skin);
            m.tube([add(c,[0,-.15*s,0]),add(c,[0,-.20*s,0]),add(c,[0,-.22*s,0])],[.036*s,.047*s,.046*s],18,linear('#383e43'),skin);
            m.disk(add(c, [0, -0.222 * s, 0]), [0, -1, 0], .034*s,linear('#171b20'),skin,18);
            m.disk(add(c, [0, -0.223 * s, 0]), [0, -1, 0], .022*s, linear(o.color2 || '#ff8a20'), skin, 18);
            for(const yy of [-.09,.10]){const path=Array.from({length:25},(_,j)=>add(c,[Math.cos(j/24*Math.PI*2)*.051*s,yy*s,Math.sin(j/24*Math.PI*2)*.051*s]));m.tube(path,.003*s,6,linear('#383e43'),skin);}
            m.tube([[0,y+.13*s,back-.015*s],[side*.035*s,y+.15*s,back-.09*s],[side*.07*s,y+.09*s,back-.09*s]],.005*s,8,linear('#393f43'),skin);
        }
        return [];
    }

    function bowtie(m, L, o) {
        const skin = spineSkin(L), N = L.neck;
        const c = [N.center[0], N.center[1] + 0.005, N.center[2] + N.rz + 0.02];
        for(const side of [-1,1]){
            m.loft(14,(i,t)=>({center:add(c,[side*(.004+t*.041),0,-.003*t]),x:[0,1,0],y:[0,0,side],rx:.006+.017*Math.sin(t*Math.PI*.55),ry:.004+.003*Math.sin(t*Math.PI)}),24,(t,a)=>linear(o.color).map(v=>v*(.88+.12*Math.cos(a*3)*Math.sin(t*Math.PI))),skin,true);
        }
        m.roundedBox(c,[[1,0,0],[0,1,0],[0,0,1]],[.009,.012,.006],.004,linear(o.color),skin);
        return [];
    }

    /**
     * Where the shirt front lies at a height, on the middle line: the outermost
     * garment there (an open jacket leaves the middle line to the shirt), or the
     * skin itself.
     */
    function shirtFrontAt(L, y) {
        const front = part => {
            const P = part.positions, I = part.index;
            let z = -Infinity;
            for (let i = 0; i < I.length; i += 3) {
                const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
                if (Math.min(P[a], P[b], P[c]) > 0 || Math.max(P[a], P[b], P[c]) < 0 || y < Math.min(P[a + 1], P[b + 1], P[c + 1]) || y > Math.max(P[a + 1], P[b + 1], P[c + 1])) continue;
                const ax = P[a] - P[c], ay = P[a + 1] - P[c + 1], bx = P[b] - P[c], by = P[b + 1] - P[c + 1];
                const det = ax * by - ay * bx;
                if (Math.abs(det) < 1e-12) continue;
                const u = (-P[c] * by - (y - P[c + 1]) * bx) / det, v = (ax * (y - P[c + 1]) + ay * P[c]) / det;
                if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
                z = Math.max(z, P[c + 2] + u * (P[a + 2] - P[c + 2]) + v * (P[b + 2] - P[c + 2]));
            }
            return z;
        };
        let skin = L.bodyPart ? front(L.bodyPart) : (L.frontAt0 ? L.frontAt0(y, 0) : L.frontAt(y, 0));
        // A long blade can reach below the torso's sampled region. Follow the nearest
        // centerline skin there so the tip stays finite and follows the belly.
        if (!Number.isFinite(skin)) {
            let nearest = Infinity;
            for (let i = 0; i < L.P.length; i += 3) {
                if (Math.abs(L.P[i]) > 0.04) continue;
                const distance = Math.abs(L.P[i + 1] - y);
                if (distance < nearest - 0.003) { nearest = distance; skin = L.P[i + 2]; }
                else if (distance <= nearest + 0.003) skin = Math.max(skin, L.P[i + 2]);
            }
            if (!Number.isFinite(skin)) skin = L.neck.center[2] + L.neck.rz;
        }
        let z = skin;
        for (const part of L.outfitParts || []) {
            const surface = front(part);
            if (surface >= skin - 0.002 && surface < skin + 0.08) z = Math.max(z, surface);
        }
        return isFinite(z) ? Math.max(z, skin) : skin;
    }

    /**
     * A tie: a straight necktie (a four-in-hand knot under the collar, its blade
     * widening as it falls down the shirt front to a point), a bow tie, or a
     * cravat (a soft knot with gathered folds spilling over the chest). It rides
     * the shirt's front where one is worn.
     */
    function necktie(m, L, o) {
        if (o.shape === 'bow') return bowtie(m, L, o);
        const skin = spineSkin(L), N = L.neck, rgb = linear(o.color), dark = linear(o.color2 || o.color);
        const top = N.center[1] - 0.004, knotZ = Math.max(N.center[2] + N.rz + 0.008, shirtFrontAt(L, top) + 0.006);
        const along = (y, lift) => [0, y, shirtFrontAt(L, y) + lift];
        if (o.shape === 'cravat') {
            // The knot, then folds that fan out and spill a hand's length down.
            m.loft(4, (i, t) => ({ center: [0, top - t * 0.03, knotZ + 0.004 * (1 - t)], x: [1, 0, 0], y: [0, 0, 1], rx: 0.022 + t * 0.006, ry: 0.012 }), 12, rgb, skin, true);
            const rows = 12, len = 0.1 * (o.length || 1);
            m.loft(rows, (i, t) => {
                const y = top - 0.025 - t * len, c = along(y, 0.007 + Math.sin(t * Math.PI) * 0.005);
                return { center: c, x: [1, 0, 0], y: [0, 0, 1], rx: 0.02 + Math.sin(t * Math.PI * 0.9) * 0.018, ry: 0.006 * (1 - t * 0.5) };
            }, 24, (t, a) => (Math.sin(a * 9 + t * 3) > 0.3 ? rgb : dark), skin, true);
            // Gathered folds: the cloth's edge rippled.
            for (let v = 0; v < m.p.length; v += 3) if (m.p[v + 1] < top - 0.03) m.p[v + 2] += Math.sin(m.p[v] * 160) * 0.0025;
            m.computeNormals();
            return [];
        }
        // A four-in-hand knot: narrower at the bottom, tucked under the collar.
        m.loft(5, (i, t) => ({ center: [0, top - t * 0.032, knotZ - t * 0.002], x: [1, 0, 0], y: [0, 0.25, 1], rx: 0.019 - t * 0.008, ry: 0.009 - t * 0.003 }), 12, dark, skin, true);
        // The blade: from under the knot, widening, down the shirt front, cut to a point.
        const rows = 18, len = 0.42 * (o.length || 1) * (L.height / 1.7);
        m.loft(rows + 1, (i, t) => {
            const y = top - 0.03 - t * len, c = along(y, 0.005);
            const w = 0.012 + 0.03 * Math.min(1, t * 1.4), tip = t > 0.94 ? (1 - t) / 0.06 : 1;
            const next = along(y - len / rows, 0.005), dz = next[2] - c[2], dy = -len / rows, l = Math.hypot(dy, dz) || 1;
            // Its face turned to the chest's own slope under it.
            const n = [0, -dz / l, -dy / l];
            return { center: c, x: [1, 0, 0], y: n[2] < 0 ? [0, -n[1], -n[2]] : n, rx: Math.max(0.0015, w * tip), ry: 0.0025 };
        }, 10, (t, a) => (Math.abs(((a / Math.PI) * 4 + t * 30) % 2 - 1) < 0.18 ? dark : rgb), skin, true);
        return [];
    }

    /** Original, parameterized equipment and body details, measured on this character. */
    /** The cyber pieces, from their own file (loaded before this one). */
    function cyberGear() { return root.RRCharacterCyberGear || (typeof require === 'function' ? require('./CharacterCyberGear.js') : null); }
    function cyberProps() { const Cyber = cyberGear(); return Cyber ? Cyber.PROPS : []; }
    function cyberVisors() { const Cyber = cyberGear(); return Cyber ? [Cyber.VISOR] : []; }

    function generatedProps() {
        const prop = (id, label, slot, group, make, defaults, finish = 'leather', frame = 'body') => ({ id, label, slot, group, make,
            defaults: Object.assign({ color: '#62503c', color2: '#b8bcc4', size: 1 }, defaults), finish, frame });
        return [
            prop('eyeMask', 'Domino mask', 'eyes', 'Masks', (m, L, o) => faceMask(m, L, o, 'eyes'), { color: '#24202c' }, 'felt', 'head'),
            prop('mouthMask', 'Cloth face mask', 'mask', 'Masks', (m, L, o) => faceMask(m, L, o, 'mouth'), { color: '#9abac8' }, 'felt', 'head'),
            prop('respirator', 'Respirator', 'mask', 'Masks', respirator, { color: '#303638', color2: '#9a9e90' }, 'plastic', 'head'),
            prop('nails', 'Fingernails', 'nails', 'Body details', (m, L, o) => nails(m, L, o, false), { color: '#cf9f94', length: 0.25 }, 'plastic', 'hands'),
            prop('claws', 'Finger claws', 'nails', 'Body details', (m, L, o) => nails(m, L, o, true), { color: '#ded3b8', length: 0.7 }, 'plastic', 'hands'),
            prop('satchel', 'Shoulder satchel', 'bag', 'Bags and tools', (m, L, o) => beltGear(m, L, o, 'satchel'), { color: '#735239', side: 'left' }),
            prop('beltPouch', 'Belt pouch', 'pouch', 'Bags and tools', (m, L, o) => beltGear(m, L, o, 'pouch'), { side: 'right' }),
            prop('canteen', 'Canteen', 'canteen', 'Bags and tools', (m, L, o) => beltGear(m, L, o, 'canteen'), { color: '#5b6850', side: 'left' }, 'plastic'),
            prop('sword', 'Sword', 'held', 'Weapons', (m, L, o) => heldGear(m, L, o, 'sword'), { side: 'right', length: 0.7 }, 'metal'),
            prop('dagger', 'Dagger', 'held', 'Weapons', (m, L, o) => heldGear(m, L, o, 'dagger'), { side: 'right', length: 0.35 }, 'metal'),
            prop('axe', 'Axe', 'held', 'Weapons', (m, L, o) => heldGear(m, L, o, 'axe'), { side: 'right', length: 0.6 }, 'metal'),
            prop('spear', 'Spear', 'held', 'Weapons', (m, L, o) => heldGear(m, L, o, 'spear'), { side: 'right', length: 1 }, 'metal'),
            prop('staff', 'Staff', 'held', 'Weapons', (m, L, o) => heldGear(m, L, o, 'staff'), { side: 'right', length: 1, color2: '#5fa5db' }),
            prop('bow', 'Bow', 'held', 'Weapons', (m, L, o) => heldGear(m, L, o, 'bow'), { side: 'left', length: 0.8 }),
            prop('shield', 'Round shield', 'held', 'Weapons', (m, L, o) => heldGear(m, L, o, 'shield'), { side: 'left', color: '#465e86' }, 'metal'),
            prop('hammer', 'Hammer', 'held', 'Bags and tools', (m, L, o) => heldGear(m, L, o, 'hammer'), { side: 'right', length: 0.4 }, 'metal'),
            prop('pickaxe', 'Pickaxe', 'held', 'Bags and tools', (m, L, o) => heldGear(m, L, o, 'pickaxe'), { side: 'right', length: 0.65 }, 'metal'),
            prop('lantern', 'Lantern', 'held', 'Bags and tools', (m, L, o) => heldGear(m, L, o, 'lantern'), { side: 'left', color: '#4e4840', color2: '#f0c86a' }, 'metal'),
            prop('book', 'Book', 'held', 'Bags and tools', (m, L, o) => heldGear(m, L, o, 'book'), { side: 'left', color: '#71373c', color2: '#e1d4b5' }),
            prop('umbrella', 'Umbrella', 'held', 'Bags and tools', (m, L, o) => heldGear(m, L, o, 'umbrella'), { side: 'right', length: 0.8, color: '#426792' }, 'felt'),
            prop('beret', 'Beret', 'hat', 'Hats', (m, L, o) => crownHat(m, L, o, { brim: 1.05, tall: 0.055, flare: 1.4, top: 'dome', band: 0.008 }), { color: '#693530', height: 1 }, 'felt', 'head'),
            prop('sunhat', 'Sun hat', 'hat', 'Hats', (m, L, o) => crownHat(m, L, o, { brim: 2.3, tall: 0.1, flare: 0.95, top: 'dome', band: 0.02, curl: 0.2 }), { color: '#c6aa72', color2: '#71464a', height: 1 }, 'felt', 'head'),
            prop('neckTie', 'Necktie', 'tie', 'Jewelry', neckTie, { color: '#803e49', length: 0.65 }, 'felt'),
            prop('suitcase', 'Suitcase', 'held', 'Bags and tools', (m, L, o) => heldGear(m, L, o, 'suitcase'), { side: 'left', color: '#463a35' }),
            prop('microphone', 'Microphone', 'held', 'Performance', (m, L, o) => heldGear(m, L, o, 'microphone'), { side: 'right', color: '#303038' }, 'metal'),
            prop('guitar', 'Guitar', 'held', 'Performance', (m, L, o) => heldGear(m, L, o, 'guitar'), { side: 'left', color: '#a96930', color2: '#d6c5a1' },'wood'),
            prop('tennisRacket', 'Tennis racket', 'held', 'Sports', (m, L, o) => heldGear(m, L, o, 'tennisRacket'), { side: 'right', color: '#477ca2', color2: '#d5d8dc' }, 'plastic'),
            prop('headset', 'Headset', 'headset', 'Face', headset, { color: '#30333b', color2: '#545e72' }, 'plastic', 'head'),
            prop('stethoscope', 'Stethoscope', 'medical', 'Bags and tools', stethoscope, { color: '#324c71', color2: '#bcc5cc' }, 'plastic')
        ];
    }

    /**
     * Domino mask: each half laid in rings round its eye hole (a smooth ellipse) out to the mask's outline (a
     * rounded band notched over the nose), so the holes and edges are curves, not stair steps; a rolled edge
     * round the holes and the outline gives it a little thickness; a tie runs round the head.
     */
    function dominoMask(m, L, o) {
        const skin = rigid(L.boneIndex('Head')), s = o.size || 1, cy = L.eyeY, mid = L.mouth[0], col = linear(o.color), rim = col.map(v => v * 0.8);
        const halfY = 0.026 * s, halfX = Math.abs(L.eyeL.center[0] - L.eyeR.center[0]) * 1.05 * s;
        const zAt = (px, py) => {
            const ring = L.ring(py, 0.02);
            let z = ring ? ring.center[2] + ring.rz * Math.sqrt(Math.max(0, 1 - ((px - ring.center[0]) / Math.max(0.001, ring.rx)) ** 2)) : L.mouth[2];
            for (const v of L.headIds) if (Math.abs(L.P[v * 3] - px) < 0.01 && Math.abs(L.P[v * 3 + 1] - py) < 0.008) z = Math.max(z, L.P[v * 3 + 2]);
            return z + 0.005;
        };
        const S = 44, K = 5, ends = {};
        for (const E of [L.eyeL, L.eyeR]) {
            const side = Math.sign(E.center[0]), ec = E.center, ha = E.radius * 1.6, hb = E.radius * 1.05;
            const inside = (X, Y) => {
                const u = (X - mid) / halfX, v = (Y - cy) / halfY, wing = 1 + 0.25 * Math.max(0, Math.abs(u) - 0.5) * (v > 0 ? 1 : 0.4);
                if (u ** 4 + (v / wing) ** 4 > 1) return false;
                if (side * (X - mid) < 0) return false;
                return Y >= cy - halfY + 0.011 * s * Math.max(0, 1 - Math.abs(X - mid) / (0.016 * s));
            };
            const rows = [];
            for (let k = 0; k < S; k++) {
                const th = (side > 0 ? Math.PI : 0) + k / S * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th);
                const h = 1 / Math.hypot(dx / ha, dy / hb);
                let lo = h, hi = h + 0.08;
                for (let it = 0; it < 30; it++) { const t = (lo + hi) / 2; if (inside(ec[0] + dx * t, ec[1] + dy * t)) lo = t; else hi = t; }
                rows.push({ th, dx, dy, h, out: Math.max(lo, h + 0.003) });
            }
            const grid = rows.map(r => Array.from({ length: K + 1 }, (_, j) => { const t = r.h + (r.out - r.h) * j / K, px = ec[0] + r.dx * t, py = ec[1] + r.dy * t; return m.vertex([px, py, zAt(px, py)], [0, 0, 1], col, skin); }));
            for (let k = 0; k < S; k++) for (let j = 0; j < K; j++) {
                const a = grid[k][j], b = grid[(k + 1) % S][j], c = grid[k][j + 1], d = grid[(k + 1) % S][j + 1];
                m.tri(a, c, b); m.tri(b, c, d);
            }
            const at = v => [m.p[v * 3], m.p[v * 3 + 1], m.p[v * 3 + 2]];
            // The rolled edges: round the hole, and along the outline where it is not the center seam.
            loop(m, grid.map(g => add(at(g[0]), [0, 0, 0.0006])), 0.0011, rim, skin, 5);
            const outer = grid.map(g => at(g[K])), run = [];
            for (let k = 0; k <= S; k++) { const p = outer[k % S]; if (Math.abs(p[0] - mid) > 0.0008 || (run.length && k === S)) run.push(p); }
            if (run.length > 3) m.tube(run, 0.0011, 5, rim, skin, false);
            ends[side] = add(outer[S / 2], [0, 0, -0.001]);
        }
        m.doubleSided = true;
        backStrap(m, L, ends[1], ends[-1], cy, 0.0045, 0.0011, col, skin, 0.024, 1);
    }

    function faceMask(m, L, o, kind) {
        if (kind === 'eyes') return dominoMask(m, L, o);
        const skin = rigid(L.boneIndex('Head')), s = o.size;
        const centerY = kind === 'eyes' ? L.eyeY : L.mouth[1];
        const halfY = (kind === 'eyes' ? 0.026 : 0.038) * s;
        const halfX = Math.abs(L.eyeL.center[0] - L.eyeR.center[0]) * (kind === 'eyes' ? 1.05 : 0.9) * s;
        const rows = 12, cols = 32, ids = [];
        for (let y = 0; y <= rows; y++) {
            const line = [];
            for (let x = 0; x <= cols; x++) {
                const px = L.mouth[0] + (x / cols * 2 - 1) * halfX, py = centerY + (y / rows * 2 - 1) * halfY;
                const ring = L.ring(py, 0.02);
                let z = ring ? ring.center[2] + ring.rz * Math.sqrt(Math.max(0, 1 - ((px - ring.center[0]) / Math.max(0.001, ring.rx)) ** 2)) : L.mouth[2];
                for (const v of L.headIds) if (Math.abs(L.P[v * 3] - px) < 0.012 && Math.abs(L.P[v * 3 + 1] - py) < 0.009) z = Math.max(z, L.P[v * 3 + 2]);
                // A cloth mask folds in three pleats across its face, fading out toward the sides.
                const pleat = kind === 'mouth' ? 0.0022 * ((y / rows * 3) % 1) * (1 - Math.abs(x / cols * 2 - 1) ** 3) : 0;
                line.push(m.vertex([px, py, z + 0.006 + pleat], [0, 0, 1], linear(o.color), skin));
            }
            ids.push(line);
        }
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            const px = L.mouth[0] + ((x + 0.5) / cols * 2 - 1) * halfX, py = centerY + ((y + 0.5) / rows * 2 - 1) * halfY;
            if (kind === 'eyes' && [L.eyeL, L.eyeR].some(e => Math.hypot((px - e.center[0]) / (e.radius * 1.4), (py - e.center[1]) / (e.radius * 0.9)) < 1.15)) continue;
            const a = ids[y][x], b = ids[y][x + 1], c = ids[y + 1][x], d = ids[y + 1][x + 1];
            m.tri(a, b, c); m.tri(b, d, c);m.doubleSided=true;
        }
        // Straps joined to the mask's side edges: ear loops for a cloth mask, a tie round the head for the
        // others (the respirator's harness runs from its own body).
        const at = (y, x) => [m.p[ids[y][x] * 3], m.p[ids[y][x] * 3 + 1], m.p[ids[y][x] * 3 + 2]];
        const edge = (x, y) => add(at(y, x), [0, 0, -0.002]);
        if (kind === 'mouth') for (const [x, side] of [[cols, 1], [0, -1]]) {
            const ear = side > 0 ? L.earL : L.earR;
            if (!ear) continue;
            const e = ear.center, top = edge(x, rows - 1), low = edge(x, 1);
            const path = [top, lerp(top, add(e, [side * 0.012, 0.022, 0.012]), 0.5), add(e, [side * 0.01, 0.026, 0.0]), add(e, [side * 0.004, 0.022, -0.014]),
                add(e, [side * -0.002, 0.0, -0.02]), add(e, [side * 0.004, -0.024, -0.012]), lerp(low, add(e, [side * 0.01, -0.026, 0.006]), 0.5), low];
            m.tube(smoothPath(path), 0.0014, 6, linear(o.color).map(v => v * 0.95), skin);
        } else if (kind === 'eyes') backStrap(m, L, edge(cols, rows >> 1), edge(0, rows >> 1), centerY, 0.006, 0.0016, linear(o.color), skin, 0.006);
        // A sewn hem along the mask's edges.
        const hem = [];
        for (let x = 0; x <= cols; x++) hem.push(at(0, x));
        for (let y = 1; y <= rows; y++) hem.push(at(y, cols));
        for (let x = cols - 1; x >= 0; x--) hem.push(at(rows, x));
        for (let y = rows - 1; y > 0; y--) hem.push(at(y, 0));
        if (kind === 'mouth') loop(m, hem, 0.0012, linear(o.color).map(v => v * 0.9), skin, 4);
    }

    function respirator(m, L, o) {
        faceMask(m, L, o, 'respirator');
        const skin = rigid(L.boneIndex('Head')), center = [L.mouth[0], L.mouth[1], Math.max(L.mouth[2], L.noseTip[2]) + 0.018], s = o.size;
        m.sphere(center, 0.035 * s, linear(o.color), skin, 8, 16, [1.3, 0.85, 0.65]);
        for (const side of [-1, 1]) {
            const f = add(center, [side * 0.038 * s, 0, 0.005]);
            m.sphere(f, 0.019 * s, linear(o.color2), skin, 6, 12, [1, 1, 0.7]);
            // The filter's threaded collar into the body.
            loop(m, ringPath(1, 16, a => add(f, [side * -0.012 * s, Math.cos(a) * 0.014 * s, Math.sin(a) * 0.011 * s])), 0.0018, linear(o.color).map(v => v * 0.8), skin, 5);
        }
        // The harness: buckled at the body's sides, round the back of the head (low) and over the crown of the ears (high).
        const dark = linear(o.color).map(v => v * 0.7);
        for (const [dy, up] of [[0.006, 0.05], [-0.012, 0]]) {
            const anchors = [1, -1].map(side => add(center, [side * 0.04 * s, dy, -0.022 * s]));
            for (const a of anchors) m.box(a, [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [0.004, 0.007, 0.004], linear('#8a8e90'), skin);
            backStrap(m, L, anchors[0], anchors[1], anchors[0][1], 0.0045, 0.0009, dark, skin, up ? 0.1 : 0.004, up ? 0.5 : 2);
        }
    }

    function nails(m, L, o, claws) {
        for (const side of ['Left', 'Right']) for (const finger of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
            const name = side + 'Hand' + finger + '3', bone = L.bone(name);
            if (!bone) continue;
            const along = norm(sub(bone.tail, bone.head));
            const across = norm(cross(along, [0, 0, 1]));
            const dorsal = norm(cross(across, along));
            const length = len(sub(bone.tail, bone.head));
            const start = add(lerp(bone.head, bone.tail, 0.6), mul(dorsal, 0.0035));
            const reach = length * (0.4 + o.length * (claws ? 2.5 : 1.2));
            const skin = rigid(L.boneIndex(name));
            m.loft(5, (k, t) => ({ center: add(start, add(mul(along, reach * t), mul(dorsal, claws ? -reach * t * t * 0.3 : 0))),
                x: across, y: dorsal, rx: Math.max(0.0003, length * 0.18 * o.size * (claws ? 1 - t : 1 - 0.65 * t)), ry: 0.001 * (1 - 0.7 * t) }), 8, linear(o.color), skin, true);
        }
    }

    function beltGear(m, L, o, kind) {
        const hip = L.bone('Hips').head, side = o.side === 'right' ? -1 : 1, s = o.size * L.height / 1.7;
        const torso = L.torsoIds.map(v => Math.abs(L.P[v * 3]));
        const wide = Math.max(0.08, ...torso);
        const center = [hip[0] + side * (wide + 0.025), hip[1] - (kind === 'satchel' ? 0.14 : 0.04), hip[2]];
        const skin = rigid(L.boneIndex('Hips')), axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        if (kind === 'canteen') {
            m.sphere(center,.075*s,linear(o.color),skin,14,24,[.65,1,.9]);
            m.tube([add(center,[0,.065*s,0]),add(center,[0,.092*s,0])],.022*s,12,linear(o.color2),skin);
            for(let j=0;j<8;j++){const a=j/8*Math.PI*2;m.tube([add(center,[Math.cos(a)*.022*s,.077*s,Math.sin(a)*.022*s]),add(center,[Math.cos(a)*.022*s,.091*s,Math.sin(a)*.022*s])],.002*s,4,linear(o.color2),skin);}
            m.tube([add(center,[0,.087*s,.023*s]),add(center,[0,.07*s,.044*s]),add(center,[0,.05*s,.045*s])],.003*s,6,linear(o.color2),skin);
        }
        else {
            const half = kind === 'satchel' ? [0.045, 0.1, 0.11] : [0.035, 0.055, 0.06];
            m.roundedBox(center,axes,half.map(x=>x*s),.012*s,linear(o.color),skin);
            m.roundedBox(add(center,[side*half[0]*s,.035*s,0]),axes,[.006*s,half[1]*.55*s,half[2]*.96*s],.004*s,linear(o.color).map(v=>v*.83),skin);
            const path=[[-.85,-.80],[.85,-.80],[.85,.80],[-.85,.80],[-.85,-.80]].map(([z,y])=>add(center,[side*(half[0]+.001)*s,y*half[1]*s,z*half[2]*s]));m.tube(path,.0012*s,4,linear(o.color2).map(v=>v*.7),skin);
            m.box(add(center, [side * half[0] * s, 0.015 * s, 0]), axes, [0.005 * s, 0.018 * s, 0.02 * s], linear(o.color2), skin);
        }
        if (kind === 'satchel') {
            const shoulder = L.bone(side > 0 ? 'RightArm' : 'LeftArm').head;
            const x=shoulder[0]*.65;let top=shoulder[1]+.025*s;
            const measure=positions=>{for(let k=0;k<positions.length;k+=3)if(Math.abs(positions[k]-x)<.022*s&&positions[k+1]<L.neck.center[1]+.005*s)top=Math.max(top,positions[k+1]);};
            measure(L.P);for(const p of L.outfitParts)measure(p.positions);
            const fitted=Outfit.projectedSurface([L.bodyPart,...L.outfitParts],{cell:.03*s,accept:(_,__,p)=>Math.max(...p.map(q=>q[1]))>=center[1]&&Math.min(...p.map(q=>q[1]))<=top+.02*s});
            const surface=(y,x,front)=>fitted.depth(x,y,NaN,front?1:-1),gap=.006*s;
            const y=top-.025*s,front=surface(y,x,true),back=surface(y,x,false),fz=Number.isFinite(front)?front+gap:shoulder[2]+.06*s,bz=Number.isFinite(back)?back-gap:shoulder[2]-.06*s;
            // Visible sewn mounting tabs sit on the case's outer face. Both
            // strap ends retain these anchors instead of a body-ray fallback.
            for(const z of [-.09,.09])m.box(add(center,[side*.048*s,.08*s,z*s]),axes,[.003*s,.015*s,.013*s],linear(o.color),skin);
            const a=add(center,[side*.05*s,.087*s,.09*s]),b=add(center,[side*.05*s,.087*s,-.09*s]),pts=[];
            for(let j=0;j<=32;j++){const u=j/32,p=lerp(a,[x,y,fz],u),z=surface(p[1],p[0],true);if(j>0&&Number.isFinite(z))p[2]=Math.max(p[2],z+gap);pts.push(p);}
            for(let j=1;j<=12;j++){const u=j/12;pts.push([x,y+Math.sin(u*Math.PI)*.034*s,fz*(1-u)+bz*u]);}
            for(let j=1;j<=32;j++){const u=j/32,p=lerp([x,y,bz],b,u),z=surface(p[1],p[0],false);if(j<32&&Number.isFinite(z))p[2]=Math.min(p[2],z-gap);pts.push(p);}
            let previous=null;
            m.loft(pts.length,i=>{const tangent=norm(sub(pts[Math.min(pts.length-1,i+1)],pts[Math.max(0,i-1)])),across=previous?norm(sub(previous,mul(tangent,dot(previous,tangent)))):norm(cross(tangent,[0,0,1]));previous=across;return{center:pts[i],x:across,y:norm(cross(tangent,across)),rx:.012*s,ry:.002*s};},8,linear(o.color),spineSkin(L),true);
        }
    }

    function heldGear(m, L, o, kind) {
        const handName = (o.side === 'left' ? 'Left' : 'Right') + 'Hand';
        const hand = L.bone(handName), skin = rigid(L.boneIndex(handName));
        const s = o.size * L.height / 1.7, reach = (o.length ?? 0.6) * s;
        const center = lerp(hand.head, hand.tail, 0.8), axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
        const at = (x, y, z = 0) => add(center, [x * s, y * s, z * s]);
        const rod = (a, b, r, color = o.color) => m.tube([a, b], r * s, 8, linear(color), skin);
        const box = (p, half, color = o.color) => m.roundedBox(p, axes, half.map(x => x * s), .008*s, linear(color), skin);
        if (kind === 'shield') {
            const c = at(0, 0, 0.07), r = 0.24 * s;
            m.loft(3, (k, t) => ({ center: add(c, [0, 0, (t - 0.5) * 0.028 * s]), x: [1, 0, 0], y: [0, 1, 0], rx: r, ry: r }), 32, linear(o.color), skin, true);
            m.sphere(add(c, [0, 0, 0.03 * s]), 0.05 * s, linear(o.color2), skin, 6, 12, [1, 1, 0.5]);
        } else if (kind === 'suitcase') {
            // Both feet of the grip seat into the top of the case; the arch rises toward the hand.
            const grip=[[-.052,-.061],[-.052,-.020],[-.045,-.006],[-.032,0],[.032,0],[.045,-.006],[.052,-.020],[.052,-.061]];
            m.tube(grip.map(([x,y])=>at(x,y)),.008*s,16,linear(o.color2),skin);
            for(const x of [-.052,.052])box(at(x,-.060),[.017,.004,.018],o.color2);
            box(at(0, -0.2), [0.2, 0.14, 0.065]);
            for (const x of [-0.12, 0.12]) box(at(x, -0.065, 0.067), [0.018, 0.012, 0.004], o.color2);
            const seam=[[-.19,-.33],[.19,-.33],[.19,-.07],[-.19,-.07],[-.19,-.33]].map(([x,y])=>at(x,y,.066));m.tube(seam,.0014*s,4,linear(o.color2),skin);
            for(const x of [-.19,.19])for(const y of [-.32,-.08])box(at(x,y,.064),[.009,.010,.004],o.color2);
        } else if (kind === 'microphone') {
            rod(at(0, -0.06), at(0, 0.12), 0.015);
            m.sphere(at(0, 0.15), .033*s,linear('#363c41'),skin,12,20);
            for(let k=-3;k<=3;k++){const yy=k*.007,R=Math.sqrt(.033**2-yy**2),path=Array.from({length:25},(_,i)=>at(Math.cos(i/24*Math.PI*2)*R,.15+yy,Math.sin(i/24*Math.PI*2)*R));m.tube(path,.0009*s,4,linear(o.color2),skin);}
            for(let k=0;k<8;k++){const a=k/8*Math.PI*2,path=Array.from({length:17},(_,i)=>{const phi=-Math.PI/2+i/16*Math.PI;return at(Math.cos(a)*Math.cos(phi)*.033,.15+Math.sin(phi)*.033,Math.sin(a)*Math.cos(phi)*.033);});m.tube(path,.0007*s,4,linear(o.color2),skin);}
        } else if (kind === 'guitar') {
            const hardware=new Mesh(),body=linear(o.color),dark=linear('#24160e'),count=96,front=[],back=[],holeBack=[];
            const outline=Array.from({length:count},(_,j)=>{const a=j/count*Math.PI*2,v=Math.sin(a),waist=1-.40*Math.exp(-(((v-.15)/.31)**2));return[Math.cos(a)*.13*waist*(1-.12*v),-.20+v*.17];});
            const face=(mesh,ids,reverse=false)=>{for(let j=1;j<ids.length-1;j++)reverse?mesh.tri(ids[0],ids[j+1],ids[j]):mesh.tri(ids[0],ids[j],ids[j+1]);};
            let previous=null;
            for(const t of [0,.25,.65,.92,1]){const ring=outline.map(([x,y],j)=>{const a=j/count*Math.PI*2,hx=Math.cos(a)*.035,hy=-.13+Math.sin(a)*.035,z=.035-(t>.92?(t-.92)/.08*.006:0);return m.vertex(at(hx*(1-t)+x*t,hy*(1-t)+y*t,z),[0,0,1],body,skin);});
                if(previous)for(let j=0;j<count;j++){const k=(j+1)%count;face(m,[previous[j],ring[j],ring[k],previous[k]]);}else front.push(...ring);previous=ring;
            }
            const outer=previous;
            for(const [x,y]of outline)back.push(m.vertex(at(x,y,-.029),norm([x,y+.20,0]),body,skin));
            const inner=outline.map(([x,y])=>m.vertex(at(x*.97,-.20+(y+.20)*.97,-.035),[0,0,-1],body,skin));
            for(let j=0;j<count;j++){const k=(j+1)%count;face(m,[outer[j],back[j],back[k],outer[k]]);face(m,[back[j],inner[j],inner[k],back[k]]);}
            const bottom=m.vertex(at(0,-.20,-.035),[0,0,-1],body,skin);for(let j=0;j<count;j++)m.tri(bottom,inner[(j+1)%count],inner[j]);
            for(let j=0;j<count;j++){const a=j/count*Math.PI*2;holeBack.push(m.vertex(at(Math.cos(a)*.035,-.13+Math.sin(a)*.035,-.021),[-Math.cos(a),-Math.sin(a),0],dark,skin));}
            for(let j=0;j<count;j++){const k=(j+1)%count;face(m,[front[j],front[k],holeBack[k],holeBack[j]]);}
            const floor=m.vertex(at(0,-.13,-.021),[0,0,1],dark,skin);for(let j=0;j<count;j++)m.tri(floor,holeBack[j],holeBack[(j+1)%count]);
            for(const z of [-.029,.029])loop(m,outline.map(([x,y])=>at(x,y,z)),.0015*s,linear(o.color2),skin,8);
            for(const radius of [.037,.041])loop(m,ringPath(0,64,a=>at(Math.cos(a)*radius,-.13+Math.sin(a)*radius,.0355)),.0009*s,linear(o.color2),skin,8);
            box(at(0,.16),[.025,.20,.014],o.color);box(at(0,.40),[.038,.05,.015],o.color);
            const boardStart=m.p.length;box(at(0,.165,.025),[.023,.195,.006],'#34271d');for(let k=boardStart;k<m.p.length;k+=3)m.p[k+2]+=.02*(.165*s-(m.p[k+1]-center[1]));
            box(at(0,-.27,.039),[.052,.012,.007],'#34271d');
            for(let j=1;j<=16;j++){const y=.36-.63*(1-2**(-j/12)),zz=.031+.02*(.165-y);hardware.tube([at(-.022,y,zz),at(.022,y,zz)],.00075*s,8,linear('#aaa9a3'),skin);}
            for(const side of [-1,1])for(let j=0;j<3;j++){const y=.377+j*.023;hardware.tube([at(side*.034,y),at(side*.047,y)],.002*s,8,linear('#aaa9a3'),skin);hardware.sphere(at(side*.047,y),.006*s,linear('#aaa9a3'),skin,8,16,[1,.65,.55]);}
            for(let j=0;j<6;j++)hardware.tube([at((j-2.5)*.006,-.27,.045),at((j-2.5)*.006,.36,.031)],.00055*s,8,linear('#c9c5b7'),skin);
            m.computeNormals();return[{mesh:hardware,extra:{name:'Instrument hardware',roughness:.27,metalness:.8}}];
        } else if (kind === 'tennisRacket') {
            rod(at(0, -0.08), at(0, 0.2), 0.015);
            const pts = Array.from({ length: 33 }, (_, i) => at(Math.sin(i / 32 * Math.PI * 2) * 0.12, 0.35 + Math.cos(i / 32 * Math.PI * 2) * 0.17));
            m.tube(pts, 0.01 * s, 8, linear(o.color), skin);
            for (let i = -4; i <= 4; i++) {
                const u = i / 5, half = Math.sqrt(1 - u * u);
                rod(at(u * 0.12, 0.35 - half * 0.17), at(u * 0.12, 0.35 + half * 0.17), 0.0007, o.color2);
                rod(at(-half * 0.12, 0.35 + u * 0.17), at(half * 0.12, 0.35 + u * 0.17), 0.0007, o.color2);
            }
        } else if (kind === 'book') {
            box(at(0, 0, 0.025), [0.075, 0.105, 0.018], o.color2);
            for (const z of [0.003, 0.047]) box(at(0, 0, z), [0.08, 0.11, 0.004]);
            box(at(-0.078, 0, 0.025), [0.005, 0.11, 0.026]);
        } else if (kind === 'lantern') {
            m.tube([at(0, 0), at(-0.055, -0.06), at(-0.055, -0.12), at(0.055, -0.12), at(0.055, -0.06), at(0, 0)], 0.006 * s, 6, linear(o.color), skin);
            const panes=new Mesh(),bulb=new Mesh();
            panes.roundedBox(at(0,-.2),axes,[.058*s,.073*s,.058*s],.006*s,linear('#d9b46b'),skin);
            bulb.sphere(at(0,-.23),.022*s,linear('#efc06d'),skin,8,12,[.7,1.6,.7]);
            m.tube([at(0,-.12),at(0,-.09)],[.035*s,.020*s],12,linear(o.color),skin);
            for (const y of [-0.28,-0.12])box(at(0,y),[.075,.01,.075]);
            for(const x of [-.06,.06])for(const z of [-.06,.06])rod(at(x,-.12,z),at(x,-.28,z),.004);
            return[{mesh:panes,extra:{name:'Lantern glass',opacity:.22,roughness:.20,metalness:0}},{mesh:bulb,extra:{name:'Lantern light',emissive:'#ffad48',emissiveIntensity:.6,roughness:.6}}];
            for (const y of [-0.28, -0.12]) box(at(0, y), [0.075, 0.01, 0.075]);
            for (const x of [-0.06, 0.06]) for (const z of [-0.06, 0.06]) rod(at(x, -0.12, z), at(x, -0.28, z), 0.004);
        } else if (kind === 'bow') {
            const pts = Array.from({ length: 17 }, (_, k) => { const t = k / 16 * Math.PI; return at(Math.sin(t) * 0.18, (k / 16 - 0.5) * (o.length + 0.25)); });
            m.tube(pts, 0.012 * s, 8, linear(o.color), skin);
            rod(pts[0], pts[16], 0.001, o.color2);
        } else {
            rod(at(0, -0.12), add(center, [0, reach, 0]), kind==='umbrella'?.004:kind === 'staff' ? 0.018 : 0.012);
            if (kind === 'sword' || kind === 'dagger' || kind === 'spear') {
                const start = kind === 'spear' ? reach * 0.85 : 0.08 * s, end = kind === 'spear' ? reach + 0.2 * s : reach;
                if (kind !== 'spear') box(at(0, 0.07), [kind === 'sword' ? 0.075 : 0.04, 0.012, 0.018], o.color2);
                m.loft(4, (k, t) => ({ center: add(center, [0, start + (end - start) * t, 0]), x: [1, 0, 0], y: [0, 0, 1], rx: Math.max(0.0003, (kind === 'sword' ? 0.028 : 0.018) * s * (t < 0.7 ? 1 : (1 - t) / 0.3)), ry: 0.004 * s }), 4, linear(o.color2), skin, true);
            } else if (kind === 'axe') {
                m.loft(12,(_,t)=>({center:add(center,[(.005+t*.145)*s,reach-.01*s,0]),x:[0,1,0],y:[0,0,1],rx:(.032+.065*t*t)*s,ry:(.016*(1-t)+.0015)*s}),8,linear(o.color2),skin,true);
                box(add(center,[0,reach-.02*s,0]),[.022,.045,.022],o.color2);
            }
            else if (kind === 'hammer') box(add(center, [0, reach, 0]), [0.08, 0.035, 0.035], o.color2);
            else if (kind === 'pickaxe') m.tube([add(center, [-0.2 * s, reach - 0.06 * s, 0]), add(center, [0, reach, 0]), add(center, [0.2 * s, reach - 0.06 * s, 0])], [0.002 * s, 0.025 * s, 0.002 * s], 8, linear(o.color2), skin);
            else if (kind === 'staff') m.sphere(add(center, [0, reach + 0.035 * s, 0]), 0.045 * s, linear(o.color2), skin);
            else if (kind === 'umbrella') {
                const top=add(center,[0,reach+.12*s,0]),structure=new Mesh(),ink=linear('#72777d'),start=m.p.length;
                m.loft(18,(k,t)=>({center:add(top,[0,-t*t*.14*s,0]),x:[1,0,0],y:[0,0,1],rx:Math.max(.001,t*.4*s),ry:Math.max(.001,t*.4*s)}),96,(t,a)=>linear(o.color).map(v=>v*(.91+.09*Math.cos(a*8))),skin,false);m.doubleSided=true;
                for(let k=start;k<m.p.length;k+=3){const x=(m.p[k]-top[0])/s,z=(m.p[k+2]-top[2])/s,r=Math.hypot(x,z)/.4;m.p[k+1]-=Math.sin(Math.atan2(z,x)*4)**2*.008*s*r**5;}
                structure.tube([add(center,[0,reach,0]),top],.004*s,16,ink,skin);
                for(let j=0;j<8;j++){const a=j/8*Math.PI*2,path=Array.from({length:25},(_,i)=>{const t=.03+i/24*.97;return add(top,[Math.cos(a)*t*.4*s,-t*t*.14*s-.002*s,Math.sin(a)*t*.4*s]);});structure.tube(path,.0018*s,12,ink,skin);structure.tube([add(top,[0,-.16*s,0]),path[11]],.0016*s,12,ink,skin);}
                structure.tube([add(top,[0,-.17*s,0]),add(top,[0,-.15*s,0])],.009*s,16,ink,skin);
                const hook=Array.from({length:25},(_,i)=>{const a=i/24*Math.PI;return at(-.03+.03*Math.cos(a),-.12-.03*Math.sin(a),0);});structure.tube(hook,.007*s,16,linear(o.color2||o.color),skin);structure.sphere(top,.0045*s,ink,skin);m.computeNormals();
                return[{mesh:structure,extra:{name:'Umbrella frame',roughness:.35,metalness:.7}}];
            }
        }
    }

    function neckTie(m, L, o) {
        const N = L.neck, skin = spineSkin(L), length = 0.18 + o.length * 0.22;
        const c = [N.center[0], N.center[1] - 0.02, N.center[2] + N.rz + 0.024];
        m.loft(12, (k, t) => {
            const center = add(c, [0, -length * t, 0.01 + t * 0.02]), z = L.frontAt(center[1], center[0]);
            if (isFinite(z)) center[2] = Math.max(center[2], z + 0.026);
            return { center, x: [1, 0, 0], y: [0, 0, 1], rx: (t < 0.8 ? 0.009 + t * 0.018 : Math.max(0.001, (1 - t) * 0.15)) * o.size, ry: 0.002 };
        }, 4, linear(o.color), skin, true);
    }

    /**
     * Headset: a padded headband over the crown, metal sliders into yokes that hold two earcups on pivots
     * (a hard shell, a cap plate, a soft cushion against the head), and a boom from the left cup to a foam mic.
     */
    function headset(m, L, o) {
        const ring = L.ring(L.brow, 0.02), skin = rigid(L.boneIndex('Head')), s = o.size || 1;
        if (!ring) return;
        const shell = linear(o.color), accent = linear(o.color2), cushion = linear('#1c1d21'), metal = linear('#a8adb5');
        const cups = {}, X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
        for (const side of [1, -1]) {
            const ear = side > 0 ? L.earL : L.earR, e = ear ? ear.center : [ring.center[0] + side * ring.rx, L.eyeY - 0.01, ring.center[2] - 0.02];
            const R = 0.034 * s, face = add(e, [side * 0.006, 0, 0]), ax = [side, 0, 0];
            // The cushion: a soft ring against the head, then the shell's rim, body and cap plate stepping outward.
            m.loft(6, (i, t) => { const a = t * Math.PI; return { center: add(face, mul(ax, 0.004 + (1 - Math.cos(a)) * 0.004 * s)), x: Z, y: Y, rx: R * (0.86 + Math.sin(a) * 0.12), ry: R * 1.12 * (0.86 + Math.sin(a) * 0.12) }; }, 24, cushion, skin, false);
            m.loft(5, (i, t) => ({ center: add(face, mul(ax, (0.010 + t * 0.016) * s)), x: Z, y: Y, rx: R * (1.0 - t * t * 0.18), ry: R * 1.12 * (1.0 - t * t * 0.18) }), 24, shell, skin, true);
            const cap = add(face, mul(ax, 0.0265 * s));
            m.loft(3, (i, t) => ({ center: add(cap, mul(ax, t * 0.002)), x: Z, y: Y, rx: R * (0.62 - t * 0.06), ry: R * 0.7 * (1 - t * 0.06) }), 20, accent, skin, true);
            // The yoke: a fork from above the cup to pivots at its front and back.
            const pivot = add(face, mul(ax, 0.017 * s)), top = add(pivot, [0, R * 1.12 + 0.012 * s, 0]);
            const fork = [add(pivot, [0, 0, R * 1.05]), add(pivot, [0, R * 0.8, R * 0.95]), add(top, [0, 0, 0.006]), add(top, [0, 0, -0.006]), add(pivot, [0, R * 0.8, -R * 0.95]), add(pivot, [0, 0, -R * 1.05])];
            m.tube(smoothPath(fork, 4), 0.0022 * s, 8, shell, skin);
            for (const dz of [1, -1]) m.loft(2, (i, t) => ({ center: add(pivot, [side * (t - 0.5) * 0.008, 0, dz * R * 1.05]), x: Z, y: Y, rx: 0.0035, ry: 0.0035 }), 12, metal, skin, true);
            cups[side] = { top, pivot, face, R };
        }
        // The sliders: flat metal strips rising from each yoke into the band's ends, with notch lines.
        const crownY = Math.max(L.crown + 0.02, cups[1].top[1] + 0.06), bandX = side => cups[side].top[0];
        const slideTop = side => [bandX(side), cups[side].top[1] + 0.03, cups[side].top[2]];
        for (const side of [1, -1]) {
            const a = cups[side].top, b = slideTop(side), mid = lerp(a, b, 0.5);
            m.box(mid, [X, Y, Z], [0.0012, (b[1] - a[1]) / 2 + 0.003, 0.0055], metal, skin);
            for (let k = 1; k < 5; k++) m.box(add(a, [side * 0.0013, (b[1] - a[1]) * k / 5, 0]), [X, Y, Z], [0.0004, 0.0006, 0.0045], linear('#6a6e74'), skin);
        }
        // The headband: a sprung arch over the crown, a padded cushion along its underside.
        const L0 = slideTop(1), R0 = slideTop(-1), cx = (L0[0] + R0[0]) / 2, half = (L0[0] - R0[0]) / 2, zc = (L0[2] + R0[2]) / 2;
        const arch = (t, inset) => { const a = t * Math.PI; return [cx + Math.cos(a) * (half - inset), L0[1] + Math.sin(a) * (crownY - L0[1] - inset), zc]; };
        const band = Array.from({ length: 25 }, (_, k) => arch(k / 24, 0));
        const frame = (pts, i, thick, wide) => { const d = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)])), out = norm(cross(d, Z)); return { center: pts[i], x: out, y: Z, rx: thick, ry: wide }; };
        m.loft(band.length, i => frame(band, i, 0.0026 * s, 0.011 * s), 8, shell, skin, true);
        const pad = Array.from({ length: 17 }, (_, k) => arch(0.18 + k / 16 * 0.64, 0.0055 * s));
        m.loft(pad.length, i => frame(pad, i, 0.004 * s * Math.sin(Math.PI * (0.15 + 0.7 * i / 16)), 0.0095 * s), 8, cushion, skin, true);
        // The boom: from a pivot on the left cup, round the cheek to a foam capsule before the mouth.
        const c = cups[1], start = add(c.face, [0.022 * s, -c.R * 0.35, c.R * 0.55]);
        m.loft(2, (i, t) => ({ center: add(start, [(t - 0.5) * 0.008, 0, 0]), x: Z, y: Y, rx: 0.005, ry: 0.005 }), 14, accent, skin, true);
        const tip = [L.mouth[0] + 0.022, L.mouth[1] + 0.004, L.mouth[2] + 0.022];
        const boom = smoothPath([add(start, [0.002, 0, 0]), add(start, [-0.002, -0.012, 0.034]), [lerp(start, tip, 0.6)[0] + 0.016, lerp(start, tip, 0.6)[1] - 0.008, lerp(start, tip, 0.6)[2] + 0.026], tip], 6);
        m.tube(boom, 0.0018, 8, shell, skin);
        m.sphere(add(tip, [-0.003, 0, 0.001]), 0.0075, cushion, skin, 8, 12, [1.25, 0.9, 0.9]);
    }

    function stethoscope(m, L, o) {
        const N = L.neck, skin = spineSkin(L), color = linear(o.color), metal = linear(o.color2);
        const chest = [N.center[0], N.center[1] - 0.24 * o.size, N.center[2] + N.rz + 0.06];
        const front = L.frontAt(chest[1], chest[0]);
        if (isFinite(front)) chest[2] = Math.max(chest[2], front + 0.03);
        for (const side of [-1, 1]) {
            const start = [N.center[0] + side * (N.rx + 0.015), N.center[1] + 0.025, N.center[2]];
            const path = Array.from({ length: 13 }, (_, i) => {
                const p = lerp(start, chest, i / 12), z = L.frontAt(p[1], p[0]);
                if (isFinite(z)) p[2] = Math.max(p[2], z + 0.028);
                return p;
            });
            m.tube(path, 0.004, 8, color, skin);
        }
        m.sphere(chest, 0.018 * o.size, metal, skin, 6, 12, [1, 1, 0.3]);
    }

    // ── building ──────────────────────────────────────────────────────────
    function normalizeProp(item) {
        const def = BY_ID.get(item && item.id);
        if (!def) return null;
        const out = Object.assign({ id: def.id }, def.defaults, item);
        for (const k of ['color', 'color2']) if (out[k] && !/^#[0-9a-f]{6}$/i.test(out[k])) out[k] = def.defaults[k];
        for (const k of ['size', 'height', 'length', 'width', 'up']) if (out[k] != null) out[k] = Math.max(k==='up'?0:.05, Math.min(3, Number.isFinite(+out[k])?+out[k]:def.defaults[k]));
        // `options` (Prop Builder 2026-10-18): a choice list, 'check' (on/off) or a [min, max] range per key.
        for (const [k, spec] of Object.entries(def.options || {})) {
            if (spec === 'check') out[k] = !!out[k];
            else if (Array.isArray(spec[0])) { if (!spec.some(c => c[0] === out[k])) out[k] = def.defaults[k]; }
            else out[k] = Math.max(spec[0], Math.min(spec[1], Number.isFinite(+out[k]) ? +out[k] : def.defaults[k]));
        }
        if (def.defaults.side && !['left', 'right'].includes(out.side)) out.side = def.defaults.side;
        return out;
    }

    /** One accessory per slot, the later one winning. A piece that covers more (`slots`: a full faceplate takes the eyes and the mouth) puts out what was there. */
    function normalizeProps(list) {
        const bySlot = new Map();
        for (const raw of Array.isArray(list) ? list : []) {
            const item = normalizeProp(raw);
            if (item) {
                const keysOf = it => { const d = BY_ID.get(it.id); return d.slot === 'held' ? ['held-' + it.side] : d.slots || [d.slot]; }, keys = keysOf(item);
                for (const [k, had] of [...bySlot]) if (k !== keys[0] && keysOf(had).some(key => keys.includes(key))) bySlot.delete(k);
                bySlot.set(keys[0], item);
            }
        }
        return [...bySlot.values()];
    }

    const FINISH = {
        felt: { name: 'Felt and cloth', roughness: 0.88, metalness: 0 },
        wood:{name:'Timber',roughness:.56,metalness:0},
        velvet: {name:'Velvet',roughness:.97,metalness:0},
        leather: { name: 'Leather', roughness: 0.6, metalness: 0 },
        metal: { name: 'Accessories', roughness: 0.3, metalness: 0.85 },
        plastic: { name: 'Plastic', roughness: 0.4, metalness: 0 }
    };
    const FELT = new Set(['scarf', 'wizardhat', 'witchhat', 'tophat', 'fedora', 'cowboy', 'bowler', 'tricorn', 'cap', 'headband', 'bowtie', 'necktie', 'eyepatch']);
    const LEATHER = new Set(['quiver', 'goggles', 'choker']);
    const PLASTIC = new Set(['glasses', 'sunglasses', 'visor', 'backpack']);
    function finishOf(def,item) { if(def.id==='choker'&&item)return item.shape==='metal'?'metal':item.shape==='velvet'?'velvet':item.shape==='lace'?'felt':'leather';return def.finish || (FELT.has(def.id) ? 'felt' : LEATHER.has(def.id) ? 'leather' : PLASTIC.has(def.id) ? 'plastic' : 'metal'); }

    /** Parts for the accessories on a built body, merged by finish; `hair` (the built hair's parts) lifts and widens hats over it. */
    function build(pack, built, list, hair, options = {}) {
        const items = normalizeProps(list);
        if (!items.length) return { parts: [], items };
        const L = landmarks(pack, built);
        L.bodyPart = built.parts[0];
        // Cyberware lays its plates on the face as shaped, and brings pictures of its own.
        L.pack = pack; L.built = built; L.textures = {};
        L.outfitParts = options.outfitParts || [];
        L.frontAt0 = L.frontAt;
        if (options.outfitParts?.length) {
            const skinFront = L.frontAt;
            L.frontAt = (y, x) => {
                let z = skinFront(y, x);
                for (const part of options.outfitParts) for (let i = 0; i < part.positions.length; i += 3) {
                    if (Math.abs(part.positions[i] - x) < 0.04 && Math.abs(part.positions[i + 1] - y) < 0.03) z = Math.max(z, part.positions[i + 2]);
                }
                return z;
            };
        }
        // The head's hair as built, for hats to sit over.
        const scalp = (hair || []).filter(p => /^Hair/.test(p.name || '') && p.positions);
        if (scalp.length) { const all = []; for (const p of scalp) for (let i = 0; i < p.positions.length; i += 3) if (p.positions[i + 1] > L.eyeY) all.push(p.positions[i], p.positions[i + 1], p.positions[i + 2]); L.hair = all; }
        const cloth = new Mesh(), extras = [], finishes = new Map(), hanging = [],construction=[];
        for (const item of items) {
            const def = BY_ID.get(item.id);
            const m = new Mesh();
            const context={recipe:item,m,L,o:item,more:[]};construction.push(...EQUIPMENT_PATTERNS.assemble(context));
            const more = context.more;
            const soft = more.some(x => x.extra && x.extra.doubleSided);
            // Cloth that hangs: the item's vertices in the merged part and the bone it hangs from.
            if (soft && def.cloth) hanging.push({ start: cloth.p.length / 3, count: m.p.length / 3, anchor: def.cloth.anchor });
            if (soft) merge(cloth, m);
            else { const f = finishOf(def,item); if (!finishes.has(f)) finishes.set(f, new Mesh()); merge(finishes.get(f), m); }
            for (const x of more) if (x.mesh && !x.mesh.empty) extras.push(x.mesh.part(x.extra.name || def.label, x.extra));
        }
        const parts = [];
        // Each finish its own part: felt and leather hats matte, jewelry and helmets metal, frames and packs plastic.
        for (const [finish, m] of finishes) if (!m.empty) parts.push(m.part(FINISH[finish].name, { kind:finish==='felt'||finish==='velvet'?'cloth':'prop', roughness: FINISH[finish].roughness, metalness: FINISH[finish].metalness, doubleSided:!!m.doubleSided }));
        if (!cloth.empty) parts.push(cloth.part('Cape', Object.assign({ roughness: 0.85, metalness: 0, doubleSided: true }, hanging.length ? { cloth: hanging } : {})));
        const all=parts.concat(extras),textures=Object.assign({},L.textures);
        for(const p of all)if(!p.uvs){p.uvs=new Float32Array(p.positions.length/3*2);for(let v=0;v<p.positions.length/3;v++){const n=Array.from(p.normals.subarray(v*3,v*3+3),Math.abs),axis=n.indexOf(Math.max(...n)),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];for(let j=0;j<2;j++)p.uvs[v*2+j]=p.positions[v*3+axes[j]]*8;}}
        Surface.apply(all,textures,p=>p.opacity<1||p.emissive||p.ownSurface?null:p.name==='Felt and cloth'||p.name==='Cape'?'fabric':p.name==='Velvet'?'velvet':p.name==='Timber'?'wood':p.name==='Leather'?'leather':p.metalness>.5?'metal':p.name==='Plastic'?'rubber':null);
        // A part left with no picture at all (the crown's faceted jewels, their colour their own) keeps its
        // coordinates inside one picture's span rather than the physical ones a tiled finish would use.
        for(const p of all)if(p.uvs&&!p.texture&&!p.normalTexture&&!p.metallicRoughnessTexture&&!p.emissiveTexture){let lo=Infinity,hi=-Infinity;for(const v of p.uvs){if(v<lo)lo=v;if(v>hi)hi=v;}if(lo<0||hi>1){const s=hi>lo?1/(hi-lo):0;for(let i=0;i<p.uvs.length;i++)p.uvs[i]=(p.uvs[i]-lo)*s;}}
        return { parts: all, textures, items, landmarks: L, construction };
    }

    function merge(into, m) {
        const base = into.p.length / 3;into.doubleSided=into.doubleSided||m.doubleSided;
        into.p.push(...m.p); into.n.push(...m.n); into.c.push(...m.c); into.j.push(...m.j); into.w.push(...m.w);
        for (const x of m.i) into.i.push(x + base);
        if (m.keptNormals) for (const v of m.keptNormals) (into.keptNormals || (into.keptNormals = [])).push(v + base);
    }

    /** A Mesh whose tubes and spheres keep exactly the rows and sides asked for: creature anatomy sets its own triangle budgets. */
    class ExactMesh extends Mesh { constructor() { super(); this.exact = true; } }

    const api = { PROPS, BY_ID, patterns:EQUIPMENT_PATTERNS, Mesh, ExactMesh, landmarks, rigid, spineSkin, normalizeProp, normalizeProps, finishOf, build, vec: { add, sub, mul, dot, cross, len, norm, lerp } };
    root.RRCharacterProps = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
