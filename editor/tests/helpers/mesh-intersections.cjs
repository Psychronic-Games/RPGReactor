'use strict';
const sub = (a, b) => a.map((v, i) => v - b[i]);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// Strict segment/triangle crossings; shared edges, tangencies and coplanar
// overlaps are deliberately excluded from this diagnostic.
function crosses(A, B) {
    for (let e = 0; e < 3; e++) {
        const dir = sub(A[(e + 1) % 3], A[e]), e1 = sub(B[1], B[0]), e2 = sub(B[2], B[0]), p = cross(dir, e2), det = dot(e1, p);
        if (Math.abs(det) < 1e-12) continue;
        const t = sub(A[e], B[0]), u = dot(t, p) / det;
        if (u <= 1e-5 || u >= 1 - 1e-5) continue;
        const q = cross(t, e1), v = dot(dir, q) / det;
        if (v <= 1e-5 || u + v >= 1 - 1e-5) continue;
        const f = dot(e2, q) / det;
        if (f > 1e-5 && f < 1 - 1e-5) return true;
    }
    return false;
}
function intersections(positions, triangles, cell = 0.04) {
    const points = triangles.map(ids => ids.map(v => Array.from(positions.subarray(v * 3, v * 3 + 3))));
    const grid = new Map(), pairs = new Set(), found = [];
    for (let i = 0; i < points.length; i++) {
        const p = points[i], lo = [0, 1, 2].map(k => Math.floor(Math.min(...p.map(v => v[k])) / cell)), hi = [0, 1, 2].map(k => Math.floor(Math.max(...p.map(v => v[k])) / cell));
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
            const key = x + ',' + y + ',' + z, list = grid.get(key) || [];
            for (const j of list) {
                const pair = j + ':' + i;
                if (pairs.has(pair)) continue;
                pairs.add(pair);
                if (triangles[i].some(v => triangles[j].includes(v))) continue;
                if (crosses(p, points[j]) || crosses(points[j], p)) found.push([j, i]);
            }
            list.push(i); grid.set(key, list);
        }
    }
    return found;
}
module.exports = { intersections };
