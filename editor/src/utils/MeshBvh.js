/**
 * MeshBvh - a bounding-volume hierarchy over a BufferGeometry's triangles,
 * for raycasts that do not visit every triangle.
 *
 * three's own `Mesh.raycast` tests each triangle of a mesh in turn. The
 * editor's map is a handful of merged sheet meshes — thousands of quads each
 * — and the pointer asks where it is over them twice per move, so moving the
 * mouse across a large map cost milliseconds a move in triangle tests. A
 * tree of boxes over the triangles (median split on centroids, small
 * leaves) makes a ray visit a few dozen.
 *
 * Built once per geometry and cached by it, so a repaint that rebuilds a
 * sheet's geometry simply gets a new tree on the next ask. Flat typed
 * arrays; no three types needed to build, only to raycast.
 */
(function(root) {
    'use strict';

    const LEAF_SIZE = 8;

    /** Build a tree over `geometry` (indexed or not, positions in local space). */
    function build(geometry) {
        const position = geometry.attributes && geometry.attributes.position;
        if (!position) return null;
        const pos = position.array;
        const index = geometry.index ? geometry.index.array : null;
        const start = geometry.drawRange ? geometry.drawRange.start || 0 : 0;
        const rangeCount = geometry.drawRange && isFinite(geometry.drawRange.count) ? geometry.drawRange.count : Infinity;
        const total = Math.min(index ? index.length : position.count, rangeCount) - start;
        const triangleCount = Math.floor(total / 3);
        if (triangleCount <= 0) return null;
        const corner = (t, k) => index ? index[start + t * 3 + k] : start + t * 3 + k;

        // Per-triangle bounds and centroids.
        const bounds = new Float32Array(triangleCount * 6);
        const centroid = new Float32Array(triangleCount * 3);
        for (let t = 0; t < triangleCount; t++) {
            let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (let k = 0; k < 3; k++) {
                const v = corner(t, k) * 3;
                const x = pos[v], y = pos[v + 1], z = pos[v + 2];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
            bounds[t * 6] = minX; bounds[t * 6 + 1] = minY; bounds[t * 6 + 2] = minZ;
            bounds[t * 6 + 3] = maxX; bounds[t * 6 + 4] = maxY; bounds[t * 6 + 5] = maxZ;
            centroid[t * 3] = (minX + maxX) / 2; centroid[t * 3 + 1] = (minY + maxY) / 2; centroid[t * 3 + 2] = (minZ + maxZ) / 2;
        }

        const order = new Uint32Array(triangleCount);
        for (let t = 0; t < triangleCount; t++) order[t] = t;
        // Nodes: bounds (6), then either children (left, right) or a leaf range (offset, count).
        const nodeBounds = [];
        const nodeLeft = [];
        const nodeRight = [];
        const nodeOffset = [];
        const nodeCount = [];
        const scratchLeft = new Uint32Array(triangleCount);
        const scratchRight = new Uint32Array(triangleCount);

        const makeNode = (first, count) => {
            const id = nodeBounds.length / 6;
            let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
            for (let i = first; i < first + count; i++) {
                const t = order[i] * 6;
                if (bounds[t] < minX) minX = bounds[t]; if (bounds[t + 3] > maxX) maxX = bounds[t + 3];
                if (bounds[t + 1] < minY) minY = bounds[t + 1]; if (bounds[t + 4] > maxY) maxY = bounds[t + 4];
                if (bounds[t + 2] < minZ) minZ = bounds[t + 2]; if (bounds[t + 5] > maxZ) maxZ = bounds[t + 5];
                const c = order[i] * 3;
                if (centroid[c] < cx0) cx0 = centroid[c]; if (centroid[c] > cx1) cx1 = centroid[c];
                if (centroid[c + 1] < cy0) cy0 = centroid[c + 1]; if (centroid[c + 1] > cy1) cy1 = centroid[c + 1];
                if (centroid[c + 2] < cz0) cz0 = centroid[c + 2]; if (centroid[c + 2] > cz1) cz1 = centroid[c + 2];
            }
            nodeBounds.push(minX, minY, minZ, maxX, maxY, maxZ);
            nodeLeft.push(-1); nodeRight.push(-1); nodeOffset.push(first); nodeCount.push(count);
            if (count <= LEAF_SIZE) return id;
            // Split the widest centroid axis at its midpoint (a median when
            // the midpoint leaves a side empty).
            const spans = [cx1 - cx0, cy1 - cy0, cz1 - cz0];
            let axis = 0;
            if (spans[1] > spans[axis]) axis = 1;
            if (spans[2] > spans[axis]) axis = 2;
            if (spans[axis] <= 0) return id;
            const mid = (axis === 0 ? cx0 + cx1 : axis === 1 ? cy0 + cy1 : cz0 + cz1) / 2;
            let l = 0, r = 0;
            for (let i = first; i < first + count; i++) {
                const t = order[i];
                if (centroid[t * 3 + axis] < mid) scratchLeft[l++] = t;
                else scratchRight[r++] = t;
            }
            if (l === 0 || r === 0) {
                // Midpoint failed: median split by sorting the range.
                const slice = Array.from(order.subarray(first, first + count));
                slice.sort((p, q) => centroid[p * 3 + axis] - centroid[q * 3 + axis]);
                for (let i = 0; i < count; i++) order[first + i] = slice[i];
                l = count >> 1;
            } else {
                for (let i = 0; i < l; i++) order[first + i] = scratchLeft[i];
                for (let i = 0; i < r; i++) order[first + l + i] = scratchRight[i];
            }
            const left = makeNode(first, l);
            const right = makeNode(first + l, count - l);
            nodeLeft[id] = left;
            nodeRight[id] = right;
            nodeCount[id] = 0;
            return id;
        };
        makeNode(0, triangleCount);
        return {
            triangleCount,
            order,
            bounds,
            nodeBounds: Float32Array.from(nodeBounds),
            nodeLeft: Int32Array.from(nodeLeft),
            nodeRight: Int32Array.from(nodeRight),
            nodeOffset: Uint32Array.from(nodeOffset),
            nodeCount: Uint32Array.from(nodeCount),
            corner
        };
    }

    const cache = new WeakMap();
    /** The tree for a geometry, built on first ask and kept with it. */
    function forGeometry(geometry) {
        if (!geometry) return null;
        let tree = cache.get(geometry);
        if (tree === undefined) {
            tree = build(geometry);
            cache.set(geometry, tree);
        }
        return tree;
    }

    // Slab test against a node's box; returns entry distance or Infinity.
    function rayBox(tree, node, ox, oy, oz, ix, iy, iz, far) {
        const b = node * 6;
        const nb = tree.nodeBounds;
        let t0 = 0, t1 = far;
        let tx0 = (nb[b] - ox) * ix, tx1 = (nb[b + 3] - ox) * ix;
        if (tx0 > tx1) { const s = tx0; tx0 = tx1; tx1 = s; }
        if (tx0 > t0) t0 = tx0; if (tx1 < t1) t1 = tx1; if (t0 > t1) return Infinity;
        let ty0 = (nb[b + 1] - oy) * iy, ty1 = (nb[b + 4] - oy) * iy;
        if (ty0 > ty1) { const s = ty0; ty0 = ty1; ty1 = s; }
        if (ty0 > t0) t0 = ty0; if (ty1 < t1) t1 = ty1; if (t0 > t1) return Infinity;
        let tz0 = (nb[b + 2] - oz) * iz, tz1 = (nb[b + 5] - oz) * iz;
        if (tz0 > tz1) { const s = tz0; tz0 = tz1; tz1 = s; }
        if (tz0 > t0) t0 = tz0; if (tz1 < t1) t1 = tz1; if (t0 > t1) return Infinity;
        return t0;
    }

    /**
     * Nearest hit of a local-space ray (origin o, direction d, normalised)
     * against the geometry: { distance, x, y, z, triangle } or null. Both
     * faces count, as the map's materials are double-sided.
     */
    function raycastLocal(tree, geometry, ox, oy, oz, dx, dy, dz, far, side) {
        if (!tree) return null;
        const pos = geometry.attributes.position.array;
        // three's FrontSide = 0, BackSide = 1, DoubleSide = 2 (the default
        // here): a room wall faces inward only, and from outside the shell
        // the pointer must pass through it to the floor, as it does for
        // three's own raycast.
        const cull = side === 0 ? 1 : side === 1 ? -1 : 0;
        // A zero component would make (bound - origin) * infinity NaN when
        // the bound is exactly on the origin; a huge finite inverse keeps
        // the slab test honest.
        const ix = dx !== 0 ? 1 / dx : 1e30, iy = dy !== 0 ? 1 / dy : 1e30, iz = dz !== 0 ? 1 / dz : 1e30;
        let best = far === undefined ? Infinity : far;
        let bestTri = -1;
        const stack = [0];
        while (stack.length) {
            const node = stack.pop();
            if (rayBox(tree, node, ox, oy, oz, ix, iy, iz, best) === Infinity) continue;
            const count = tree.nodeCount[node];
            if (count === 0) {
                // Nearer child first, so the far one is often skipped.
                const l = tree.nodeLeft[node], r = tree.nodeRight[node];
                const dl = rayBox(tree, l, ox, oy, oz, ix, iy, iz, best);
                const dr = rayBox(tree, r, ox, oy, oz, ix, iy, iz, best);
                if (dl === Infinity && dr === Infinity) continue;
                if (dl < dr) { if (dr !== Infinity) stack.push(r); stack.push(l); }
                else { if (dl !== Infinity) stack.push(l); stack.push(r); }
                continue;
            }
            const offset = tree.nodeOffset[node];
            for (let i = offset; i < offset + count; i++) {
                const t = tree.order[i];
                const a = tree.corner(t, 0) * 3, b = tree.corner(t, 1) * 3, c = tree.corner(t, 2) * 3;
                // Möller–Trumbore, two-sided.
                const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2];
                const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
                const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
                const det = e1x * px + e1y * py + e1z * pz;
                if (det > -1e-12 && det < 1e-12) continue;
                // det > 0 is the front face (the ray runs against the normal).
                if (cull > 0 && det < 0) continue;
                if (cull < 0 && det > 0) continue;
                const inv = 1 / det;
                const tx = ox - pos[a], ty = oy - pos[a + 1], tz = oz - pos[a + 2];
                const u = (tx * px + ty * py + tz * pz) * inv;
                if (u < 0 || u > 1) continue;
                const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
                const v = (dx * qx + dy * qy + dz * qz) * inv;
                if (v < 0 || u + v > 1) continue;
                const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
                if (dist > 1e-9 && dist < best) { best = dist; bestTri = t; }
            }
        }
        if (bestTri < 0) return null;
        return { distance: best, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, triangle: bestTri };
    }

    /**
     * Nearest world-space hit of a THREE.Ray against `meshes`: { point:
     * Vector3, distance, object } or null. The ray is carried into each
     * mesh's local space; meshes whose world matrix is frozen (the map's
     * static sheets) are read as they stand.
     */
    function raycastMeshes(ray, meshes, THREE) {
        if (!ray || !meshes || !THREE) return null;
        const inverse = new THREE.Matrix4();
        const localOrigin = new THREE.Vector3();
        const localDir = new THREE.Vector3();
        let best = null;
        for (const mesh of meshes) {
            if (!mesh || !mesh.visible || !mesh.geometry) continue;
            const tree = forGeometry(mesh.geometry);
            if (!tree) continue;
            inverse.copy(mesh.matrixWorld).invert();
            localOrigin.copy(ray.origin).applyMatrix4(inverse);
            localDir.copy(ray.direction).transformDirection(inverse);
            // A non-uniform scale changes the direction's length; distances
            // are compared in world space below, so normalise here and
            // measure the world distance from the hit point itself.
            const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
            const side = material && material.side !== undefined ? material.side : 2;
            const hit = raycastLocal(tree, mesh.geometry, localOrigin.x, localOrigin.y, localOrigin.z, localDir.x, localDir.y, localDir.z, undefined, side);
            if (!hit) continue;
            const point = new THREE.Vector3(hit.x, hit.y, hit.z).applyMatrix4(mesh.matrixWorld);
            const distance = point.distanceTo(ray.origin);
            if (!best || distance < best.distance) best = { point, distance, object: mesh, triangle: hit.triangle };
        }
        return best;
    }

    /**
     * Vertices moved but no triangle was added or removed: grow or shrink
     * every node's box in place instead of building the tree again. Nodes
     * are numbered parent-before-children, so walking them backwards meets
     * every child before its parent. A geometry with no tree yet needs
     * nothing; it is built on its first ask.
     */
    function refit(geometry) {
        const tree = geometry ? cache.get(geometry) : null;
        if (!tree) return false;
        const position = geometry.attributes && geometry.attributes.position;
        if (!position) return false;
        const pos = position.array;
        const { bounds, corner, triangleCount, order, nodeBounds, nodeLeft, nodeRight, nodeOffset, nodeCount } = tree;
        for (let t = 0; t < triangleCount; t++) {
            let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (let k = 0; k < 3; k++) {
                const v = corner(t, k) * 3;
                const x = pos[v], y = pos[v + 1], z = pos[v + 2];
                if (x < minX) minX = x; if (x > maxX) maxX = x;
                if (y < minY) minY = y; if (y > maxY) maxY = y;
                if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
            }
            bounds[t * 6] = minX; bounds[t * 6 + 1] = minY; bounds[t * 6 + 2] = minZ;
            bounds[t * 6 + 3] = maxX; bounds[t * 6 + 4] = maxY; bounds[t * 6 + 5] = maxZ;
        }
        for (let id = nodeLeft.length - 1; id >= 0; id--) {
            const b = id * 6;
            let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            if (nodeLeft[id] < 0) {
                const first = nodeOffset[id], count = nodeCount[id];
                for (let i = first; i < first + count; i++) {
                    const t = order[i] * 6;
                    if (bounds[t] < minX) minX = bounds[t]; if (bounds[t + 3] > maxX) maxX = bounds[t + 3];
                    if (bounds[t + 1] < minY) minY = bounds[t + 1]; if (bounds[t + 4] > maxY) maxY = bounds[t + 4];
                    if (bounds[t + 2] < minZ) minZ = bounds[t + 2]; if (bounds[t + 5] > maxZ) maxZ = bounds[t + 5];
                }
            } else {
                for (const child of [nodeLeft[id], nodeRight[id]]) {
                    const c = child * 6;
                    if (nodeBounds[c] < minX) minX = nodeBounds[c]; if (nodeBounds[c + 3] > maxX) maxX = nodeBounds[c + 3];
                    if (nodeBounds[c + 1] < minY) minY = nodeBounds[c + 1]; if (nodeBounds[c + 4] > maxY) maxY = nodeBounds[c + 4];
                    if (nodeBounds[c + 2] < minZ) minZ = nodeBounds[c + 2]; if (nodeBounds[c + 5] > maxZ) maxZ = nodeBounds[c + 5];
                }
            }
            nodeBounds[b] = minX; nodeBounds[b + 1] = minY; nodeBounds[b + 2] = minZ;
            nodeBounds[b + 3] = maxX; nodeBounds[b + 4] = maxY; nodeBounds[b + 5] = maxZ;
        }
        return true;
    }

    const MeshBvh = { build, forGeometry, refit, raycastLocal, raycastMeshes, LEAF_SIZE };
    root.RRMeshBvh = MeshBvh;
    if (typeof module !== 'undefined' && module.exports) module.exports = MeshBvh;
})(typeof globalThis !== 'undefined' ? globalThis : window);
