/**
 * MeshSurfacePicker - a bounding-volume tree over a model's triangles, so
 * the editor can ask "what is under the pointer" hundreds of times a
 * second. three's own raycast walks every triangle and, on a skinned mesh,
 * transforms every vertex per call: a quarter of a second on a 150k
 * triangle character, far too slow to snap a dragged rig marker.
 *
 * The tree is built once from the model as it stands (skinned vertices are
 * read through the mesh, so it is the posed surface) in world space, and
 * answers: every crossing along a ray, whether a point lies inside the
 * flesh, and where the middle of the flesh under a ray is.
 */
(function(root) {
    'use strict';

    const LEAF = 8;

    /** Triangles as a flat array of nine floats each, from any three.js object tree. */
    function collectTriangles(object, THREE, skip) {
        const chunks = [];
        let total = 0;
        object.updateMatrixWorld(true);
        const v = new THREE.Vector3();
        object.traverse(node => {
            if (!node.isMesh || !node.geometry || (skip && skip(node))) return;
            const geometry = node.geometry, position = geometry.getAttribute('position');
            if (!position) return;
            const index = geometry.getIndex();
            const count = index ? index.count : position.count;
            const out = new Float32Array(count * 3);
            const read = node.isSkinnedMesh && typeof node.getVertexPosition === 'function'
                ? i => node.getVertexPosition(i, v)
                : i => v.fromBufferAttribute(position, i);
            // A skinned mesh's getVertexPosition returns the posed vertex in
            // mesh space (bind matrix, bones, inverse bind), the same space
            // three's own raycast compares against; world is one matrix on.
            for (let i = 0; i < count; i++) {
                read(index ? index.getX(i) : i);
                v.applyMatrix4(node.matrixWorld);
                out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
            }
            chunks.push(out);
            total += count * 3;
        });
        const all = new Float32Array(total);
        let at = 0;
        for (const chunk of chunks) { all.set(chunk, at); at += chunk.length; }
        return all;
    }

    class MeshSurfacePicker {
        /** @param {Float32Array} vertices nine floats per triangle, world space */
        constructor(vertices) {
            this.vertices = vertices;
            this.count = Math.floor(vertices.length / 9);
            this.order = new Uint32Array(this.count);
            for (let i = 0; i < this.count; i++) this.order[i] = i;
            this.centroids = new Float32Array(this.count * 3);
            for (let i = 0; i < this.count; i++) {
                const o = i * 9;
                this.centroids[i * 3] = (vertices[o] + vertices[o + 3] + vertices[o + 6]) / 3;
                this.centroids[i * 3 + 1] = (vertices[o + 1] + vertices[o + 4] + vertices[o + 7]) / 3;
                this.centroids[i * 3 + 2] = (vertices[o + 2] + vertices[o + 5] + vertices[o + 8]) / 3;
            }
            // Nodes: six bounds floats, then [left, right] for a branch or [-start-1, count] for a leaf.
            const cap = Math.max(1, this.count * 2);
            this.bounds = new Float32Array(cap * 6);
            this.links = new Int32Array(cap * 2);
            this.nodeCount = 0;
            if (this.count) this.build(0, this.count);
        }

        build(start, end) {
            const node = this.nodeCount++;
            const b = this.bounds, o = node * 6;
            let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            let cminX = Infinity, cminY = Infinity, cminZ = Infinity, cmaxX = -Infinity, cmaxY = -Infinity, cmaxZ = -Infinity;
            for (let i = start; i < end; i++) {
                const t = this.order[i], v = t * 9, c = t * 3;
                for (let k = 0; k < 9; k += 3) {
                    const x = this.vertices[v + k], y = this.vertices[v + k + 1], z = this.vertices[v + k + 2];
                    if (x < minX) minX = x; if (x > maxX) maxX = x;
                    if (y < minY) minY = y; if (y > maxY) maxY = y;
                    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
                }
                const cx = this.centroids[c], cy = this.centroids[c + 1], cz = this.centroids[c + 2];
                if (cx < cminX) cminX = cx; if (cx > cmaxX) cmaxX = cx;
                if (cy < cminY) cminY = cy; if (cy > cmaxY) cmaxY = cy;
                if (cz < cminZ) cminZ = cz; if (cz > cmaxZ) cmaxZ = cz;
            }
            b[o] = minX; b[o + 1] = minY; b[o + 2] = minZ; b[o + 3] = maxX; b[o + 4] = maxY; b[o + 5] = maxZ;
            if (end - start <= LEAF) {
                this.links[node * 2] = -start - 1;
                this.links[node * 2 + 1] = end - start;
                return node;
            }
            // Split the centroids at the middle of their widest extent; when
            // everything lands on one side, split by count instead.
            const ex = cmaxX - cminX, ey = cmaxY - cminY, ez = cmaxZ - cminZ;
            const axis = ex >= ey && ex >= ez ? 0 : (ey >= ez ? 1 : 2);
            const mid = axis === 0 ? (cminX + cmaxX) / 2 : axis === 1 ? (cminY + cmaxY) / 2 : (cminZ + cmaxZ) / 2;
            let split = start;
            for (let i = start; i < end; i++) {
                const t = this.order[i];
                if (this.centroids[t * 3 + axis] < mid) {
                    const swap = this.order[split]; this.order[split] = t; this.order[i] = swap;
                    split++;
                }
            }
            if (split === start || split === end) {
                const slice = Array.from(this.order.subarray(start, end));
                slice.sort((p, q) => this.centroids[p * 3 + axis] - this.centroids[q * 3 + axis]);
                this.order.set(slice, start);
                split = (start + end) >> 1;
            }
            const left = this.build(start, split);
            const right = this.build(split, end);
            this.links[node * 2] = left;
            this.links[node * 2 + 1] = right;
            return node;
        }

        /**
         * Every triangle crossing along a ray, nearest first: distance, point,
         * and whether the ray met the triangle's front (the surface faces the
         * ray) — an entry into the flesh — or its back — an exit.
         */
        raycast(ox, oy, oz, dx, dy, dz) {
            const hits = [];
            if (!this.count) return hits;
            // A zero component would put NaN into the slab test on a box edge; nudge it.
            if (dx === 0) dx = 1e-12; if (dy === 0) dy = 1e-12; if (dz === 0) dz = 1e-12;
            const invX = 1 / dx, invY = 1 / dy, invZ = 1 / dz;
            const stack = [0];
            const b = this.bounds, v = this.vertices;
            while (stack.length) {
                const node = stack.pop(), o = node * 6;
                // Slabs.
                let t0 = (b[o] - ox) * invX, t1 = (b[o + 3] - ox) * invX;
                let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
                t0 = (b[o + 1] - oy) * invY; t1 = (b[o + 4] - oy) * invY;
                tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
                t0 = (b[o + 2] - oz) * invZ; t1 = (b[o + 5] - oz) * invZ;
                tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
                if (tmax < Math.max(tmin, 0)) continue;
                const first = this.links[node * 2];
                if (first >= 0) {
                    stack.push(first, this.links[node * 2 + 1]);
                    continue;
                }
                const start = -first - 1, end = start + this.links[node * 2 + 1];
                for (let i = start; i < end; i++) {
                    const t = this.order[i] * 9;
                    const ax = v[t], ay = v[t + 1], az = v[t + 2];
                    const e1x = v[t + 3] - ax, e1y = v[t + 4] - ay, e1z = v[t + 5] - az;
                    const e2x = v[t + 6] - ax, e2y = v[t + 7] - ay, e2z = v[t + 8] - az;
                    // Möller–Trumbore, both sides.
                    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
                    const det = e1x * px + e1y * py + e1z * pz;
                    if (Math.abs(det) < 1e-12) continue;
                    const inv = 1 / det;
                    const tx = ox - ax, ty = oy - ay, tz = oz - az;
                    const u = (tx * px + ty * py + tz * pz) * inv;
                    if (u < 0 || u > 1) continue;
                    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
                    const w = (dx * qx + dy * qy + dz * qz) * inv;
                    if (w < 0 || u + w > 1) continue;
                    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
                    if (dist <= 1e-9) continue;
                    // Counter-clockwise front: the normal (e1 × e2) faces against the ray on entry.
                    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
                    hits.push({ t: dist, x: ox + dx * dist, y: oy + dy * dist, z: oz + dz * dist, front: nx * dx + ny * dy + nz * dz < 0 });
                }
            }
            hits.sort((p, q) => p.t - q.t);
            return hits;
        }

        /**
         * Where a ray first enters the flesh and the middle of that flesh: the
         * entry crossing, the exit that follows it, and their midpoint when
         * the exit lies within `maxThickness` (a limb, a head, a torso); a
         * sheet with nothing behind it, or a far-off exit, snaps just under
         * the entry instead.
         */
        pickFlesh(ox, oy, oz, dx, dy, dz, maxThickness) {
            const hits = this.raycast(ox, oy, oz, dx, dy, dz);
            if (!hits.length) return null;
            let entryAt = hits.findIndex(h => h.front);
            if (entryAt < 0) entryAt = 0;
            const entry = hits[entryAt];
            const exit = hits.slice(entryAt + 1).find(h => !h.front) || null;
            const limit = Number.isFinite(maxThickness) ? maxThickness : Infinity;
            const inset = Math.min(limit, 0.01);
            const useExit = exit && exit.t - entry.t <= limit;
            const mid = useExit ? (entry.t + exit.t) / 2 : entry.t + inset;
            return {
                point: [ox + dx * mid, oy + dy * mid, oz + dz * mid],
                entry: [entry.x, entry.y, entry.z],
                exit: useExit ? [exit.x, exit.y, exit.z] : null,
                thickness: useExit ? exit.t - entry.t : 0
            };
        }

        /** Whether a point lies inside the surface: crossings along three axes, majority vote, so a stray open seam does not decide. */
        inside(x, y, z) {
            let votes = 0;
            for (const [dx, dy, dz] of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
                const hits = this.raycast(x, y, z, dx, dy, dz);
                if (hits.length % 2 === 1) votes++;
            }
            return votes >= 2;
        }
    }

    /** A picker over every mesh of an object (skinned meshes read as posed), or null when it holds no triangles. */
    function build(object, THREE, skip) {
        if (!object || !THREE) return null;
        const vertices = collectTriangles(object, THREE, skip);
        if (!vertices.length) return null;
        return new MeshSurfacePicker(vertices);
    }

    const api = { MeshSurfacePicker, build, collectTriangles };
    root.RRMeshSurfacePicker = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
