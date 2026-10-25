/**
 * RRCharacterSimplify - a textured mesh made lighter, its picture
 * coordinates kept.
 *
 *   simplify(positions, uvs, index, target, options)
 *       -> { positions, uvs, index, origin }
 *
 * Edges are collapsed one end onto the other (the end kept keeps its place
 * and its picture coordinate), cheapest first by the squared distance to
 * the planes of the faces round both ends. A vertex on a seam of the
 * picture (two coordinates at one place) moves only along its seam, with
 * both sides at once, so the seam never opens; a vertex on the mesh's edge
 * moves only along that edge; where seams or edges meet nothing moves. No
 * collapse folds a face over, turns its picture coordinates round or makes
 * the surface non-manifold. `origin` gives each kept vertex's index in the
 * input. `options.maxError` (meters) stops it early; `options.maxEdge`
 * (meters) keeps every edge shorter than that.
 *
 * Deterministic: the same input gives the same mesh.
 */
(function(root) {
    'use strict';

    const MANIFOLD = 0, BORDER = 1, SEAM = 2, LOCKED = 3;

    function simplify(positions, uvs, index, target, options) {
        const o = options || {};
        const maxError = o.maxError ?? Infinity, maxEdge = o.maxEdge ?? Infinity;
        const n = positions.length / 3, triCount = index.length / 3;
        // Welded places: each render vertex's place.
        const placeOf = new Int32Array(n);
        const places = [];
        {
            const map = new Map();
            for (let i = 0; i < n; i++) {
                const k = Math.round(positions[i * 3] * 1e5) + ',' + Math.round(positions[i * 3 + 1] * 1e5) + ',' + Math.round(positions[i * 3 + 2] * 1e5);
                let p = map.get(k);
                if (p === undefined) { p = places.length; map.set(k, p); places.push(i); }
                placeOf[i] = p;
            }
        }
        const m = places.length;
        const X = new Float64Array(m * 3);
        for (let p = 0; p < m; p++) { const i = places[p]; X[p * 3] = positions[i * 3]; X[p * 3 + 1] = positions[i * 3 + 1]; X[p * 3 + 2] = positions[i * 3 + 2]; }
        const corner = Int32Array.from(index);
        const alive = new Uint8Array(triCount).fill(1);
        // Faces round each place.
        const around = Array.from({ length: m }, () => []);
        for (let t = 0; t < triCount; t++) {
            const a = placeOf[corner[t * 3]], b = placeOf[corner[t * 3 + 1]], c = placeOf[corner[t * 3 + 2]];
            if (a === b || b === c || a === c) { alive[t] = 0; continue; }
            around[a].push(t); around[b].push(t); around[c].push(t);
        }
        let live = 0;
        for (let t = 0; t < triCount; t++) if (alive[t]) live++;

        const P = t => [placeOf[corner[t * 3]], placeOf[corner[t * 3 + 1]], placeOf[corner[t * 3 + 2]]];
        const liveAround = p => { const list = around[p].filter(t => alive[t]); around[p] = list; return list; };

        // ── quadrics ───────────────────────────────────────────────────────
        const Qm = new Float64Array(m * 10);
        const addPlane = (q, nx, ny, nz, d, w) => {
            const o2 = q * 10;
            Qm[o2] += w * nx * nx; Qm[o2 + 1] += w * nx * ny; Qm[o2 + 2] += w * nx * nz; Qm[o2 + 3] += w * nx * d;
            Qm[o2 + 4] += w * ny * ny; Qm[o2 + 5] += w * ny * nz; Qm[o2 + 6] += w * ny * d;
            Qm[o2 + 7] += w * nz * nz; Qm[o2 + 8] += w * nz * d; Qm[o2 + 9] += w * d * d;
        };
        const faceNormal = (a, b, c) => {
            const ux = X[b * 3] - X[a * 3], uy = X[b * 3 + 1] - X[a * 3 + 1], uz = X[b * 3 + 2] - X[a * 3 + 2];
            const vx = X[c * 3] - X[a * 3], vy = X[c * 3 + 1] - X[a * 3 + 1], vz = X[c * 3 + 2] - X[a * 3 + 2];
            return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        };
        for (let t = 0; t < triCount; t++) {
            if (!alive[t]) continue;
            const [a, b, c] = P(t);
            const nrm = faceNormal(a, b, c), l = Math.hypot(nrm[0], nrm[1], nrm[2]);
            if (l < 1e-14) continue;
            const nx = nrm[0] / l, ny = nrm[1] / l, nz = nrm[2] / l, d = -(nx * X[a * 3] + ny * X[a * 3 + 1] + nz * X[a * 3 + 2]);
            for (const q of [a, b, c]) addPlane(q, nx, ny, nz, d, l / 2);
        }
        // Edges of the mesh and of the picture's seams hold their line: a plane across each, square to its face.
        const edgeFaces = new Map();
        const ekey = (a, b) => (a < b ? a * m + b : b * m + a);
        for (let t = 0; t < triCount; t++) {
            if (!alive[t]) continue;
            const pl = P(t);
            for (let k = 0; k < 3; k++) {
                const key = ekey(pl[k], pl[(k + 1) % 3]);
                const list = edgeFaces.get(key);
                if (list) list.push(t); else edgeFaces.set(key, [t]);
            }
        }
        const renderEdge = (t, a, b) => {
            const r = [corner[t * 3], corner[t * 3 + 1], corner[t * 3 + 2]], pl = r.map(i => placeOf[i]);
            const ra = r[pl.indexOf(a)], rb = r[pl.indexOf(b)];
            return [ra, rb];
        };
        for (const [key, list] of edgeFaces) {
            const a = Math.floor(key / m), b = key % m;
            let hold = list.length !== 2;
            if (list.length === 2) {
                const e0 = renderEdge(list[0], a, b), e1 = renderEdge(list[1], a, b);
                hold = e0[0] !== e1[0] || e0[1] !== e1[1];
            }
            if (!hold) continue;
            for (const t of list) {
                const [p0, p1, p2] = P(t);
                const fn = faceNormal(p0, p1, p2);
                const ex = X[b * 3] - X[a * 3], ey = X[b * 3 + 1] - X[a * 3 + 1], ez = X[b * 3 + 2] - X[a * 3 + 2];
                let nx = fn[1] * ez - fn[2] * ey, ny = fn[2] * ex - fn[0] * ez, nz = fn[0] * ey - fn[1] * ex;
                const l = Math.hypot(nx, ny, nz);
                if (l < 1e-14) continue;
                nx /= l; ny /= l; nz /= l;
                const d = -(nx * X[a * 3] + ny * X[a * 3 + 1] + nz * X[a * 3 + 2]);
                const w = (ex * ex + ey * ey + ez * ez) * 4;
                addPlane(a, nx, ny, nz, d, w); addPlane(b, nx, ny, nz, d, w);
            }
        }
        const costAt = (p, q) => {
            const A = p * 10, B = q * 10, x = X[q * 3], y = X[q * 3 + 1], z = X[q * 3 + 2];
            const s = i => Qm[A + i] + Qm[B + i];
            return s(0) * x * x + 2 * s(1) * x * y + 2 * s(2) * x * z + 2 * s(3) * x + s(4) * y * y + 2 * s(5) * y * z + 2 * s(6) * y + s(7) * z * z + 2 * s(8) * z + s(9);
        };

        // ── what may move ──────────────────────────────────────────────────
        /** A place's kind, and its edges along a border or seam, from the faces round it now. */
        const kindOf = p => {
            const list = liveAround(p);
            const wedges = new Set();
            const edges = new Map();
            for (const t of list) {
                const r = [corner[t * 3], corner[t * 3 + 1], corner[t * 3 + 2]];
                for (let k = 0; k < 3; k++) {
                    if (placeOf[r[k]] !== p) continue;
                    wedges.add(r[k]);
                    for (const j of [1, 2]) {
                        const other = r[(k + j) % 3], op = placeOf[other];
                        const e = edges.get(op) || { faces: 0, mine: new Set(), theirs: new Set() };
                        e.faces++; e.mine.add(r[k]); e.theirs.add(other);
                        edges.set(op, e);
                    }
                }
            }
            const border = [], seam = [];
            for (const [q, e] of edges) {
                const faces = e.faces;
                if (faces > 2) return { kind: LOCKED };
                if (faces === 1) border.push(q);
                else if (e.mine.size > 1 || e.theirs.size > 1) seam.push(q);
            }
            if (wedges.size === 1 && !border.length) return { kind: MANIFOLD, wedges };
            if (wedges.size === 1 && border.length === 2 && !seam.length) return { kind: BORDER, along: border, wedges };
            if (wedges.size === 2 && seam.length === 2 && !border.length) return { kind: SEAM, along: seam, wedges };
            return { kind: LOCKED };
        };

        /** The collapse of place p onto q, if allowed: the faces it removes, and p's corners' new render vertices. */
        const plan = (p, q) => {
            const kp = kindOf(p);
            if (kp.kind === LOCKED) return null;
            if ((kp.kind === BORDER || kp.kind === SEAM) && !kp.along.includes(q)) return null;
            const list = liveAround(p);
            const removed = [], kept = [];
            for (const t of list) { const pl = P(t); (pl.includes(q) ? removed : kept).push(t); }
            if (!removed.length || (kp.kind !== BORDER && removed.length !== 2) || (kp.kind === BORDER && removed.length !== 1)) return null;
            // Link condition: p and q share only the faces' far corners as neighbors.
            const nbr = x => { const s = new Set(); for (const t of liveAround(x)) for (const y of P(t)) if (y !== x) s.add(y); return s; };
            const np = nbr(p), nq = nbr(q);
            let shared = 0;
            for (const y of np) if (nq.has(y)) shared++;
            if (shared !== removed.length) return null;
            // Each of p's render vertices goes to q's render vertex in the face they share.
            const map = new Map();
            for (const t of removed) {
                const r = [corner[t * 3], corner[t * 3 + 1], corner[t * 3 + 2]];
                const rp = r.find(i => placeOf[i] === p), rq = r.find(i => placeOf[i] === q);
                if (map.has(rp) && map.get(rp) !== rq) return null;
                map.set(rp, rq);
            }
            for (const w of kp.wedges) if (!map.has(w)) return null;
            // No edge left longer than `maxEdge`: a big flat triangle cannot follow a body that curves under it.
            if (maxEdge < Infinity) for (const t of kept) for (const x of P(t)) {
                if (x === p) continue;
                if (Math.hypot(X[x * 3] - X[q * 3], X[x * 3 + 1] - X[q * 3 + 1], X[x * 3 + 2] - X[q * 3 + 2]) > maxEdge) return null;
            }
            // No face folds over or turns its picture round.
            for (const t of kept) {
                const r = [corner[t * 3], corner[t * 3 + 1], corner[t * 3 + 2]];
                const pl = r.map(i => placeOf[i]);
                const before = faceNormal(pl[0], pl[1], pl[2]);
                const after = faceNormal(...pl.map(x => (x === p ? q : x)));
                const lb = Math.hypot(before[0], before[1], before[2]), la = Math.hypot(after[0], after[1], after[2]);
                if (la < 1e-14 || (before[0] * after[0] + before[1] * after[1] + before[2] * after[2]) < 0.3 * lb * la) return null;
                const uvArea = rr => (uvs[rr[1] * 2] - uvs[rr[0] * 2]) * (uvs[rr[2] * 2 + 1] - uvs[rr[0] * 2 + 1]) - (uvs[rr[2] * 2] - uvs[rr[0] * 2]) * (uvs[rr[1] * 2 + 1] - uvs[rr[0] * 2 + 1]);
                const ub = uvArea(r), ua = uvArea(r.map(i => (map.has(i) ? map.get(i) : i)));
                if (ub * ua <= 0 && Math.abs(ub) > 1e-12) return null;
            }
            return { removed, kept, map };
        };

        // ── the queue ──────────────────────────────────────────────────────
        const heap = [];
        const version = new Int32Array(m);
        const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])));
        const push = item => {
            heap.push(item);
            let i = heap.length - 1;
            while (i > 0) { const j = (i - 1) >> 1; if (!less(heap[i], heap[j])) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; }
        };
        const pop = () => {
            const top = heap[0], last = heap.pop();
            if (heap.length) {
                heap[0] = last;
                let i = 0;
                for (;;) {
                    const l = i * 2 + 1, r = l + 1;
                    let s = i;
                    if (l < heap.length && less(heap[l], heap[s])) s = l;
                    if (r < heap.length && less(heap[r], heap[s])) s = r;
                    if (s === i) break;
                    [heap[i], heap[s]] = [heap[s], heap[i]]; i = s;
                }
            }
            return top;
        };
        const offer = p => {
            const nb = new Set();
            for (const t of liveAround(p)) for (const y of P(t)) if (y !== p) nb.add(y);
            for (const q of [...nb].sort((a, b) => a - b)) push([Math.max(0, costAt(p, q)), p, q, version[p], version[q]]);
        };
        for (let p = 0; p < m; p++) offer(p);

        const removedPlace = new Uint8Array(m);
        while (live > target && heap.length) {
            const [cost, p, q, vp, vq] = pop();
            if (removedPlace[p] || removedPlace[q] || vp !== version[p] || vq !== version[q]) continue;
            if (cost > maxError * maxError) break;
            const step = plan(p, q);
            if (!step) continue;
            for (const t of step.removed) { alive[t] = 0; live--; }
            for (const t of step.kept) {
                for (let k = 0; k < 3; k++) if (step.map.has(corner[t * 3 + k])) corner[t * 3 + k] = step.map.get(corner[t * 3 + k]);
                around[q].push(t);
            }
            for (let i = 0; i < 10; i++) Qm[q * 10 + i] += Qm[p * 10 + i];
            removedPlace[p] = 1;
            around[p] = [];
            version[q]++;
            const nb = new Set();
            for (const t of liveAround(q)) for (const y of P(t)) if (y !== q) nb.add(y);
            for (const y of nb) version[y]++;
            offer(q);
            for (const y of [...nb].sort((a, b) => a - b)) offer(y);
        }

        // ── the lighter mesh ───────────────────────────────────────────────
        const remap = new Int32Array(n).fill(-1), origin = [], out = [];
        for (let t = 0; t < triCount; t++) {
            if (!alive[t]) continue;
            for (let k = 0; k < 3; k++) {
                const r = corner[t * 3 + k];
                if (remap[r] < 0) { remap[r] = origin.length; origin.push(r); }
                out.push(remap[r]);
            }
        }
        const count = origin.length;
        const outP = new Float32Array(count * 3), outU = new Float32Array(count * 2);
        origin.forEach((r, i) => { outP.set(positions.subarray(r * 3, r * 3 + 3), i * 3); outU.set(uvs.subarray(r * 2, r * 2 + 2), i * 2); });
        return { positions: outP, uvs: outU, index: Uint32Array.from(out), origin: Int32Array.from(origin) };
    }

    const api = { simplify };
    root.RRCharacterSimplify = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
