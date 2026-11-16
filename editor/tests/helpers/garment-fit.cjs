'use strict';
// How a garment sits on a body, as numbers: each garment vertex's distance from the body's surface, signed (below
// zero is inside the body: skin through cloth, a plate sunk into a belly). What a picture shows as a torn shirt or
// a plate standing off a hip is a share of vertices inside the body or far from it. `clearance(body, part)` gives
// the distances in metres; `fit(body, parts)` sums them up for a garment's own parts.

/** The body's triangles in a grid of `cell` metres, for nearest-surface queries. */
function surface(body, cell = 0.04) {
    const P = body.positions, I = body.index, grid = new Map(), tris = new Float32Array(I.length * 3 + I.length);
    const key = (x, y, z) => (x + 512) * 1048576 + (y + 512) * 1024 + (z + 512);
    for (let i = 0, n = 0; i < I.length; i += 3, n++) {
        const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3, at = n * 12;
        for (let k = 0; k < 3; k++) { tris[at + k] = P[a + k]; tris[at + 3 + k] = P[b + k]; tris[at + 6 + k] = P[c + k]; }
        const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
        tris[at + 9] = nx / l; tris[at + 10] = ny / l; tris[at + 11] = nz / l;
        const lo = [0, 1, 2].map(k => Math.floor(Math.min(P[a + k], P[b + k], P[c + k]) / cell)), hi = [0, 1, 2].map(k => Math.floor(Math.max(P[a + k], P[b + k], P[c + k]) / cell));
        for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) { const k = key(x, y, z); let list = grid.get(k); if (!list) grid.set(k, list = []); list.push(n); }
    }
    return { grid, tris, cell, key };
}

/** The closest point of triangle (a, b, c) to p, as squared distance and the point (Ericson's regions). */
function closest(p, T, at, out) {
    const ax = T[at], ay = T[at + 1], az = T[at + 2], abx = T[at + 3] - ax, aby = T[at + 4] - ay, abz = T[at + 5] - az, acx = T[at + 6] - ax, acy = T[at + 7] - ay, acz = T[at + 8] - az;
    const apx = p[0] - ax, apy = p[1] - ay, apz = p[2] - az;
    const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
    let u = 0, v = 0;
    if (d1 <= 0 && d2 <= 0) { u = 0; v = 0; } else {
        const bpx = apx - abx, bpy = apy - aby, bpz = apz - abz, d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
        if (d3 >= 0 && d4 <= d3) { u = 1; v = 0; } else {
            const vc = d1 * d4 - d3 * d2;
            if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); v = 0; } else {
                const cpx = apx - acx, cpy = apy - acy, cpz = apz - acz, d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
                if (d6 >= 0 && d5 <= d6) { u = 0; v = 1; } else {
                    const vb = d5 * d2 - d1 * d6;
                    if (vb <= 0 && d2 >= 0 && d6 <= 0) { u = 0; v = d2 / (d2 - d6); } else {
                        const va = d3 * d6 - d5 * d4;
                        if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { v = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 1 - v; }
                        else { const den = 1 / (va + vb + vc); u = vb * den; v = vc * den; }
                    }
                }
            }
        }
    }
    out[0] = ax + abx * u + acx * v; out[1] = ay + aby * u + acy * v; out[2] = az + abz * u + acz * v;
    const dx = p[0] - out[0], dy = p[1] - out[1], dz = p[2] - out[2];
    return dx * dx + dy * dy + dz * dz;
}

/** Every vertex of `part`: its distance from the body's surface, below zero inside it; NaN further than `reach`. */
function clearance(S, part, reach = 0.4) {
    const P = part.positions, count = P.length / 3, out = new Float32Array(count), q = [0, 0, 0], p = [0, 0, 0], rings = Math.ceil(reach / S.cell);
    for (let v = 0; v < count; v++) {
        p[0] = P[v * 3]; p[1] = P[v * 3 + 1]; p[2] = P[v * 3 + 2];
        const c = p.map(x => Math.floor(x / S.cell));
        let best = Infinity, sign = 1;
        for (let ring = 0; ring <= rings; ring++) {
            // Once a hit is nearer than this ring's inner face, no further ring can beat it.
            if (best < ((ring - 1) * S.cell) ** 2) break;
            for (let x = -ring; x <= ring; x++) for (let y = -ring; y <= ring; y++) for (let z = -ring; z <= ring; z++) {
                if (Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) !== ring) continue;
                const list = S.grid.get(S.key(c[0] + x, c[1] + y, c[2] + z));
                if (!list) continue;
                for (const n of list) {
                    const at = n * 12, d = closest(p, S.tris, at, q);
                    if (d < best) { best = d; sign = ((p[0] - q[0]) * S.tris[at + 9] + (p[1] - q[1]) * S.tris[at + 10] + (p[2] - q[2]) * S.tris[at + 11]) < 0 ? -1 : 1; }
                }
            }
        }
        out[v] = best === Infinity ? NaN : sign * Math.sqrt(best);
    }
    return out;
}

/**
 * A garment on a body in a few numbers, in centimetres: `inside` the share of its vertices more than `sunk` inside
 * the body, `off` the share further out than `loose`, and the 5th, 50th and 95th percentile of the distance.
 * `parts` are the garment's own surfaces (its edges, stitching and linings are left out by name).
 */
function fit(body, parts, options = {}) {
    const S = body.grid ? body : surface(body), sunk = options.sunk ?? 0.004, loose = options.loose ?? 0.06, all = [];
    for (const part of parts) {
        if (/ (edges|etching|straps|collar)$|lining|stitch|bands$/i.test(part.name) && !options.every) continue;
        for (const d of clearance(S, part)) if (!Number.isNaN(d)) all.push(d);
    }
    all.sort((a, b) => a - b);
    const at = q => (all.length ? all[Math.min(all.length - 1, Math.floor(q * all.length))] * 100 : NaN), share = test => (all.length ? all.filter(test).length / all.length : 0);
    return { vertices: all.length, inside: share(d => d < -sunk), off: share(d => d > loose), p5: at(0.05), p50: at(0.5), p95: at(0.95), worst: all.length ? all[0] * 100 : NaN, furthest: all.length ? all[all.length - 1] * 100 : NaN };
}

module.exports = { surface, clearance, fit };
