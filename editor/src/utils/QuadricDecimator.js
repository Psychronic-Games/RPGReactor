/**
 * QuadricDecimator - reduce a triangle mesh to a target triangle count by
 * edge collapse under the quadric error metric (Garland & Heckbert 1997).
 *
 * The weld grid the optimizer uses for its "aggressive" preset merges
 * vertices by position cell, which is fast and fine for a duplicate-heavy
 * export but turns a curved surface into a stepped one once the cells get
 * coarse. This collapses the edges that change the surface least, one at a
 * time, so a distance level keeps its silhouette: every vertex carries the
 * sum of the squared distances to the planes of the faces that met there,
 * and an edge's cost is that sum at the best point along it.
 *
 * What it keeps: boundaries and UV seams (an edge with one face gets a
 * perpendicular penalty plane, and a seam is a boundary on both sides
 * because its vertices are split), normals (averaged), UVs (the nearer
 * endpoint's, so no seam is ever crossed), winding (a collapse that flips a
 * face is refused). What it does not do: joints and weights — a skinned
 * mesh is left to its skeleton. Plain typed arrays in and out, so the
 * import optimizer and node tests share it, and it runs in a worker.
 */
(function(root) {
    'use strict';

    /** Growable binary min-heap of (cost, a, b, versionA, versionB). */
    class EdgeHeap {
        constructor(capacity) {
            this.size = 0;
            this.cost = new Float64Array(capacity);
            this.a = new Int32Array(capacity);
            this.b = new Int32Array(capacity);
            this.va = new Int32Array(capacity);
            this.vb = new Int32Array(capacity);
        }
        grow() {
            const next = this.cost.length * 2;
            const copy = (old, Ctor) => { const out = new Ctor(next); out.set(old); return out; };
            this.cost = copy(this.cost, Float64Array);
            this.a = copy(this.a, Int32Array);
            this.b = copy(this.b, Int32Array);
            this.va = copy(this.va, Int32Array);
            this.vb = copy(this.vb, Int32Array);
        }
        push(cost, a, b, va, vb) {
            if (this.size === this.cost.length) this.grow();
            let i = this.size++;
            this.cost[i] = cost; this.a[i] = a; this.b[i] = b; this.va[i] = va; this.vb[i] = vb;
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (this.cost[parent] <= this.cost[i]) break;
                this.swap(i, parent);
                i = parent;
            }
        }
        swap(i, j) {
            let t;
            t = this.cost[i]; this.cost[i] = this.cost[j]; this.cost[j] = t;
            t = this.a[i]; this.a[i] = this.a[j]; this.a[j] = t;
            t = this.b[i]; this.b[i] = this.b[j]; this.b[j] = t;
            t = this.va[i]; this.va[i] = this.va[j]; this.va[j] = t;
            t = this.vb[i]; this.vb[i] = this.vb[j]; this.vb[j] = t;
        }
        /** Removes the root into `out` ({cost,a,b,va,vb}); false when empty. */
        pop(out) {
            if (!this.size) return false;
            out.cost = this.cost[0]; out.a = this.a[0]; out.b = this.b[0]; out.va = this.va[0]; out.vb = this.vb[0];
            const last = --this.size;
            if (last > 0) {
                this.cost[0] = this.cost[last]; this.a[0] = this.a[last]; this.b[0] = this.b[last];
                this.va[0] = this.va[last]; this.vb[0] = this.vb[last];
                let i = 0;
                for (;;) {
                    const l = 2 * i + 1, r = l + 1;
                    let m = i;
                    if (l < last && this.cost[l] < this.cost[m]) m = l;
                    if (r < last && this.cost[r] < this.cost[m]) m = r;
                    if (m === i) break;
                    this.swap(i, m);
                    i = m;
                }
            }
            return true;
        }
    }

    /** Quadric error of point (x,y,z) under the 10-value symmetric quadric at Q[at..at+10). */
    function quadricError(Q, at, x, y, z) {
        return Q[at] * x * x + 2 * Q[at + 1] * x * y + 2 * Q[at + 2] * x * z + 2 * Q[at + 3] * x
            + Q[at + 4] * y * y + 2 * Q[at + 5] * y * z + 2 * Q[at + 6] * y
            + Q[at + 7] * z * z + 2 * Q[at + 8] * z + Q[at + 9];
    }

    function addPlane(Q, at, nx, ny, nz, d, weight) {
        Q[at] += weight * nx * nx; Q[at + 1] += weight * nx * ny; Q[at + 2] += weight * nx * nz; Q[at + 3] += weight * nx * d;
        Q[at + 4] += weight * ny * ny; Q[at + 5] += weight * ny * nz; Q[at + 6] += weight * ny * d;
        Q[at + 7] += weight * nz * nz; Q[at + 8] += weight * nz * d; Q[at + 9] += weight * d * d;
    }

    /**
     * Decimate. `mesh` = { positions, normals?, uvs?, joints?, weights?,
     * indices } (typed arrays, triangle list); `target` = triangle count to
     * stop at. Options: `boundaryWeight` (penalty on boundary/seam planes,
     * default 100), `maxIterations` (safety). Returns { positions, normals,
     * uvs, joints, weights, indices, triangles, collapsed } with compacted
     * vertices; `indices` is Uint16Array when it fits, Uint32Array otherwise.
     * Empty or already-small input comes back as fresh copies.
     *
     * Skinning rides along as four-channel baggage. Unlike normals, it is
     * never blended: a joint channel holds a bone index, so the average of
     * bones 3 and 9 is bone 6 — an unrelated bone that would fling the vertex
     * across the model. The surviving endpoint's four pairs travel intact,
     * the same way a UV does.
     */
    function decimate(mesh, target, options) {
        const settings = options || {};
        const boundaryWeight = settings.boundaryWeight === undefined ? 100 : settings.boundaryWeight;
        const src = mesh.positions;
        const vertexCount = (src.length / 3) | 0;
        const tri = Uint32Array.from(mesh.indices);
        const triCount = (tri.length / 3) | 0;
        const pos = Float64Array.from(src);
        const nor = mesh.normals ? Float32Array.from(mesh.normals) : null;
        const uv = mesh.uvs ? Float32Array.from(mesh.uvs) : null;
        // Keep the source types: joints are integer bone indices, and weights
        // may arrive normalized as bytes/shorts. Copying through Float32 would
        // corrupt both.
        const joi = mesh.joints ? mesh.joints.slice() : null;
        const wei = mesh.weights ? mesh.weights.slice() : null;
        // Optional per-vertex pin (1 = never remove this vertex). Callers use
        // it to hold a UV seam still; see the note at the collapse commit.
        const locked = mesh.locked || null;
        const goal = Math.max(1, Math.floor(target));
        if (triCount <= goal || vertexCount < 4) {
            // Nothing to collapse: fresh copies, numbering untouched.
            const indices = vertexCount < 65536 ? Uint16Array.from(tri) : Uint32Array.from(tri);
            return {
                positions: Float32Array.from(src), normals: nor, uvs: uv,
                joints: joi, weights: wei, indices,
                triangles: triCount, vertices: vertexCount, collapsed: 0, stopped: 'target'
            };
        }

        // Vertex -> triangles.
        const adjacency = new Array(vertexCount);
        for (let v = 0; v < vertexCount; v++) adjacency[v] = [];
        for (let t = 0; t < triCount; t++) {
            adjacency[tri[t * 3]].push(t);
            adjacency[tri[t * 3 + 1]].push(t);
            adjacency[tri[t * 3 + 2]].push(t);
        }
        const alive = new Uint8Array(triCount).fill(1);
        const dead = new Uint8Array(vertexCount);
        const version = new Int32Array(vertexCount);
        const Q = new Float64Array(vertexCount * 10);

        // Face planes into their corners' quadrics.
        const faceNormal = (t, out) => {
            const a = tri[t * 3] * 3, b = tri[t * 3 + 1] * 3, c = tri[t * 3 + 2] * 3;
            const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
            const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
            out[0] = aby * acz - abz * acy;
            out[1] = abz * acx - abx * acz;
            out[2] = abx * acy - aby * acx;
            const len = Math.hypot(out[0], out[1], out[2]);
            if (len < 1e-20) { out[0] = out[1] = out[2] = 0; return 0; }
            out[0] /= len; out[1] /= len; out[2] /= len;
            return len * 0.5;   // area
        };
        const n = [0, 0, 0];
        for (let t = 0; t < triCount; t++) {
            const area = faceNormal(t, n);
            if (!area) continue;
            const a = tri[t * 3] * 3;
            const d = -(n[0] * pos[a] + n[1] * pos[a + 1] + n[2] * pos[a + 2]);
            for (let k = 0; k < 3; k++) addPlane(Q, tri[t * 3 + k] * 10, n[0], n[1], n[2], d, 1);
        }

        // Edges from adjacency (each once, a < b), boundary planes for edges
        // with a single face.
        const heap = new EdgeHeap(Math.max(64, triCount * 2));
        const scratchNeighbours = [];
        const scratchCounts = [];
        const edgeCost = { x: 0, y: 0, z: 0, cost: 0 };
        const evaluate = (a, b) => {
            // Best of: optimal point, a, b, midpoint.
            const qa = a * 10, qb = b * 10;
            let q0 = Q[qa] + Q[qb], q1 = Q[qa + 1] + Q[qb + 1], q2 = Q[qa + 2] + Q[qb + 2], q3 = Q[qa + 3] + Q[qb + 3];
            let q4 = Q[qa + 4] + Q[qb + 4], q5 = Q[qa + 5] + Q[qb + 5], q6 = Q[qa + 6] + Q[qb + 6];
            let q7 = Q[qa + 7] + Q[qb + 7], q8 = Q[qa + 8] + Q[qb + 8], q9 = Q[qa + 9] + Q[qb + 9];
            const err = (x, y, z) => q0 * x * x + 2 * q1 * x * y + 2 * q2 * x * z + 2 * q3 * x
                + q4 * y * y + 2 * q5 * y * z + 2 * q6 * y + q7 * z * z + 2 * q8 * z + q9;
            const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
            const bx = pos[b * 3], by = pos[b * 3 + 1], bz = pos[b * 3 + 2];
            let bestX = ax, bestY = ay, bestZ = az, best = err(ax, ay, az);
            let e = err(bx, by, bz);
            if (e < best) { best = e; bestX = bx; bestY = by; bestZ = bz; }
            const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
            e = err(mx, my, mz);
            if (e < best) { best = e; bestX = mx; bestY = my; bestZ = mz; }
            // Optimal: solve the 3x3 system A p = -q, A the quadric's upper block.
            const det = q0 * (q4 * q7 - q5 * q5) - q1 * (q1 * q7 - q5 * q2) + q2 * (q1 * q5 - q4 * q2);
            const scale = Math.abs(q0) + Math.abs(q4) + Math.abs(q7);
            if (Math.abs(det) > 1e-12 * scale * scale * scale) {
                const ix = (-(q3) * (q4 * q7 - q5 * q5) - q1 * (-(q6) * q7 - q5 * -(q8)) + q2 * (-(q6) * q5 - q4 * -(q8))) / det;
                const iy = (q0 * (-(q6) * q7 - q5 * -(q8)) - -(q3) * (q1 * q7 - q5 * q2) + q2 * (q1 * -(q8) - -(q6) * q2)) / det;
                const iz = (q0 * (q4 * -(q8) - -(q6) * q5) - q1 * (q1 * -(q8) - -(q6) * q2) + -(q3) * (q1 * q5 - q4 * q2)) / det;
                // Only trusted within the edge's own reach: a near-singular
                // system can put the "optimum" a long way off the surface.
                const reach = Math.hypot(bx - ax, by - ay, bz - az) * 1.5 + 1e-9;
                if (Math.hypot(ix - mx, iy - my, iz - mz) <= reach) {
                    e = err(ix, iy, iz);
                    if (e < best) { best = e; bestX = ix; bestY = iy; bestZ = iz; }
                }
            }
            edgeCost.x = bestX; edgeCost.y = bestY; edgeCost.z = bestZ; edgeCost.cost = best;
            return edgeCost;
        };
        const neighboursOf = (v) => {
            scratchNeighbours.length = 0;
            scratchCounts.length = 0;
            const list = adjacency[v];
            for (let i = 0; i < list.length; i++) {
                const t = list[i];
                if (!alive[t]) continue;
                for (let k = 0; k < 3; k++) {
                    const u = tri[t * 3 + k];
                    if (u === v) continue;
                    const at = scratchNeighbours.indexOf(u);
                    if (at < 0) { scratchNeighbours.push(u); scratchCounts.push(1); } else scratchCounts[at]++;
                }
            }
        };
        const boundary = [0, 0, 0];
        for (let v = 0; v < vertexCount; v++) {
            neighboursOf(v);
            for (let i = 0; i < scratchNeighbours.length; i++) {
                const u = scratchNeighbours[i];
                if (scratchCounts[i] === 1) {
                    // One face on this edge: a penalty plane through it,
                    // perpendicular to that face, on both its vertices (added
                    // from the lower-numbered side only, once).
                    if (v < u) {
                        const list = adjacency[v];
                        for (let j = 0; j < list.length; j++) {
                            const t = list[j];
                            if (!alive[t]) continue;
                            if (tri[t * 3] !== u && tri[t * 3 + 1] !== u && tri[t * 3 + 2] !== u) continue;
                            if (!faceNormal(t, n)) break;
                            const ex = pos[u * 3] - pos[v * 3], ey = pos[u * 3 + 1] - pos[v * 3 + 1], ez = pos[u * 3 + 2] - pos[v * 3 + 2];
                            boundary[0] = ey * n[2] - ez * n[1];
                            boundary[1] = ez * n[0] - ex * n[2];
                            boundary[2] = ex * n[1] - ey * n[0];
                            const len = Math.hypot(boundary[0], boundary[1], boundary[2]);
                            if (len < 1e-20) break;
                            boundary[0] /= len; boundary[1] /= len; boundary[2] /= len;
                            const d = -(boundary[0] * pos[v * 3] + boundary[1] * pos[v * 3 + 1] + boundary[2] * pos[v * 3 + 2]);
                            addPlane(Q, v * 10, boundary[0], boundary[1], boundary[2], d, boundaryWeight);
                            addPlane(Q, u * 10, boundary[0], boundary[1], boundary[2], d, boundaryWeight);
                            break;
                        }
                    }
                }
            }
        }
        for (let v = 0; v < vertexCount; v++) {
            neighboursOf(v);
            for (let i = 0; i < scratchNeighbours.length; i++) {
                const u = scratchNeighbours[i];
                if (u > v) {
                    const c = evaluate(v, u);
                    heap.push(c.cost, v, u, 0, 0);
                }
            }
        }

        // Collapse until the target.
        let remaining = triCount;
        let collapsed = 0;
        const entry = { cost: 0, a: 0, b: 0, va: 0, vb: 0 };
        const before = [0, 0, 0], after = [0, 0, 0];
        const maxIterations = settings.maxIterations || triCount * 40;
        let iterations = 0;
        // A refused collapse is tried again later at a rising penalty:
        // its neighbourhood may have changed by then. Without the retry the
        // queue drained on a dense mesh long before the target.
        let extent = 0;
        for (let i = 0; i < pos.length; i++) extent = Math.max(extent, Math.abs(pos[i]));
        const penalty = Math.max(1e-12, extent * extent * 1e-4);
        let stopped = 'target';
        while (remaining > goal) {
            if (iterations++ >= maxIterations) { stopped = 'iterations'; break; }
            if (!heap.pop(entry)) { stopped = 'queue'; break; }
            let a = entry.a, b = entry.b, va = entry.va, vb = entry.vb;
            if (dead[a] || dead[b] || version[a] !== va || version[b] !== vb) continue;
            // A model split at its UV seams stores the same point twice, once
            // per island. Nothing in index space ties the copies together, so
            // if they collapse independently the surface opens along every
            // seam - the mesh reduces into a sieve. Pinned vertices are never
            // removed and never move: the rest of the mesh reduces around a
            // fixed seam network instead of tearing away from it.
            if (locked && locked[b]) {
                if (locked[a]) continue;                       // both pinned; this edge can never go
                const v = a; a = b; b = v;                     // fold the free end into the pinned one
                const w = va; va = vb; vb = w;
            }
            const c = evaluate(a, b);
            let px = c.x, py = c.y, pz = c.z;
            if (locked && locked[a]) { px = pos[a * 3]; py = pos[a * 3 + 1]; pz = pos[a * 3 + 2]; }
            // Refuse a collapse that flips or crushes any surviving face.
            let flips = false;
            const oax = pos[a * 3], oay = pos[a * 3 + 1], oaz = pos[a * 3 + 2];
            const obx = pos[b * 3], oby = pos[b * 3 + 1], obz = pos[b * 3 + 2];
            const check = (v, other) => {
                const list = adjacency[v];
                for (let i = 0; i < list.length && !flips; i++) {
                    const t = list[i];
                    if (!alive[t]) continue;
                    const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
                    if ((i0 === other || i1 === other || i2 === other)) continue;   // dies with the edge
                    if (!faceNormal(t, before)) continue;
                    pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz;
                    const area = faceNormal(t, after);
                    pos[v * 3] = v === a ? oax : obx; pos[v * 3 + 1] = v === a ? oay : oby; pos[v * 3 + 2] = v === a ? oaz : obz;
                    if (!area || before[0] * after[0] + before[1] * after[1] + before[2] * after[2] < 0.2) flips = true;
                }
            };
            check(a, b);
            if (!flips) check(b, a);
            if (flips) {
                // Back in the queue, dearer each time; a version bump on
                // either end retires it for good.
                const deferred = entry.cost + penalty * (1 + (entry.cost / penalty) * 0.5);
                if (deferred < penalty * 1e6) heap.push(deferred, a, b, va, vb);
                continue;
            }

            // Commit: b folds into a, which moves to p.
            const keepA = Math.hypot(px - oax, py - oay, pz - oaz) <= Math.hypot(px - obx, py - oby, pz - obz);
            pos[a * 3] = px; pos[a * 3 + 1] = py; pos[a * 3 + 2] = pz;
            if (nor) {
                const nx = nor[a * 3] + nor[b * 3], ny = nor[a * 3 + 1] + nor[b * 3 + 1], nz = nor[a * 3 + 2] + nor[b * 3 + 2];
                const len = Math.hypot(nx, ny, nz) || 1;
                nor[a * 3] = nx / len; nor[a * 3 + 1] = ny / len; nor[a * 3 + 2] = nz / len;
            }
            if (uv && !keepA) { uv[a * 2] = uv[b * 2]; uv[a * 2 + 1] = uv[b * 2 + 1]; }
            if (!keepA) {
                if (joi) for (let k = 0; k < 4; k++) joi[a * 4 + k] = joi[b * 4 + k];
                if (wei) for (let k = 0; k < 4; k++) wei[a * 4 + k] = wei[b * 4 + k];
            }
            for (let k = 0; k < 10; k++) Q[a * 10 + k] += Q[b * 10 + k];
            const listB = adjacency[b];
            const listA = adjacency[a];
            for (let i = 0; i < listB.length; i++) {
                const t = listB[i];
                if (!alive[t]) continue;
                const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
                if (i0 === a || i1 === a || i2 === a) { alive[t] = 0; remaining--; continue; }
                if (i0 === b) tri[t * 3] = a;
                if (i1 === b) tri[t * 3 + 1] = a;
                if (i2 === b) tri[t * 3 + 2] = a;
                listA.push(t);
            }
            adjacency[b] = null;
            dead[b] = 1;
            version[a]++;
            version[b]++;
            collapsed++;
            // Fresh costs for every edge at the merged vertex.
            neighboursOf(a);
            for (let i = 0; i < scratchNeighbours.length; i++) {
                const u = scratchNeighbours[i];
                version[u]++;
                const cost = evaluate(a, u);
                heap.push(cost.cost, a, u, version[a], version[u]);
            }
            // Drop dead triangles from a's list now and then so it stays short.
            if (listA.length > 64) {
                let w = 0;
                for (let i = 0; i < listA.length; i++) if (alive[listA[i]]) listA[w++] = listA[i];
                listA.length = w;
            }
        }
        const result = compact(pos, nor, uv, joi, wei, tri, alive, vertexCount, collapsed);
        result.stopped = stopped;
        return result;
    }

    function compact(pos, nor, uv, joi, wei, tri, alive, vertexCount, collapsed) {
        const remap = new Int32Array(vertexCount).fill(-1);
        let next = 0;
        let triangles = 0;
        for (let t = 0; t < alive.length; t++) {
            if (!alive[t]) continue;
            const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
            if (i0 === i1 || i1 === i2 || i0 === i2) continue;
            triangles++;
            if (remap[i0] < 0) remap[i0] = next++;
            if (remap[i1] < 0) remap[i1] = next++;
            if (remap[i2] < 0) remap[i2] = next++;
        }
        const positions = new Float32Array(next * 3);
        const normals = nor ? new Float32Array(next * 3) : null;
        const uvs = uv ? new Float32Array(next * 2) : null;
        const joints = joi ? new joi.constructor(next * 4) : null;
        const weights = wei ? new wei.constructor(next * 4) : null;
        for (let v = 0; v < vertexCount; v++) {
            const to = remap[v];
            if (to < 0) continue;
            positions[to * 3] = pos[v * 3]; positions[to * 3 + 1] = pos[v * 3 + 1]; positions[to * 3 + 2] = pos[v * 3 + 2];
            if (normals) { normals[to * 3] = nor[v * 3]; normals[to * 3 + 1] = nor[v * 3 + 1]; normals[to * 3 + 2] = nor[v * 3 + 2]; }
            if (uvs) { uvs[to * 2] = uv[v * 2]; uvs[to * 2 + 1] = uv[v * 2 + 1]; }
            if (joints) for (let k = 0; k < 4; k++) joints[to * 4 + k] = joi[v * 4 + k];
            if (weights) for (let k = 0; k < 4; k++) weights[to * 4 + k] = wei[v * 4 + k];
        }
        const indices = next < 65535 ? new Uint16Array(triangles * 3) : new Uint32Array(triangles * 3);
        let w = 0;
        for (let t = 0; t < alive.length; t++) {
            if (!alive[t]) continue;
            const i0 = tri[t * 3], i1 = tri[t * 3 + 1], i2 = tri[t * 3 + 2];
            if (i0 === i1 || i1 === i2 || i0 === i2) continue;
            indices[w++] = remap[i0]; indices[w++] = remap[i1]; indices[w++] = remap[i2];
        }
        return { positions, normals, uvs, joints, weights, indices, triangles, vertices: next, collapsed };
    }

    const QuadricDecimator = { decimate };
    root.RRQuadricDecimator = QuadricDecimator;
    if (typeof module !== 'undefined' && module.exports) module.exports = QuadricDecimator;
})(typeof globalThis !== 'undefined' ? globalThis : window);
