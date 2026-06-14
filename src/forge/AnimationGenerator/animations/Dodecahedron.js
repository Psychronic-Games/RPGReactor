/**
 * Dodecahedron — 12-faced regular polyhedron (20 vertices, 30 edges).
 *
 * Vertices use the golden-ratio construction:
 *   8 cube corners (±1, ±1, ±1)
 *   12 "rectangle" verts: (0, ±φ, ±1/φ), (±1/φ, 0, ±φ), (±φ, ±1/φ, 0)
 * Edges are discovered by selecting all vertex pairs at edge-length distance
 * (2/φ ≈ 1.236) within a small tolerance.
 *
 * Depends on:
 *   render3DShape, SHAPE3D_BASE_PARAMS  (helpers/shape3D.js)
 *   RR_ANIMATION_REGISTRY                (registry.js)
 */
function makeDodecahedron() {
    const phi = (1 + Math.sqrt(5)) / 2;
    const inv = 1 / phi;
    const verts = [];
    // 8 cube vertices
    for (let s1 = -1; s1 <= 1; s1 += 2)
    for (let s2 = -1; s2 <= 1; s2 += 2)
    for (let s3 = -1; s3 <= 1; s3 += 2) verts.push([s1, s2, s3]);
    // 12 "rectangle" vertices
    for (let s1 = -1; s1 <= 1; s1 += 2)
    for (let s2 = -1; s2 <= 1; s2 += 2) {
        verts.push([0,       s1 * phi, s2 * inv]);
        verts.push([s1 * inv, 0,       s2 * phi]);
        verts.push([s1 * phi, s2 * inv, 0      ]);
    }
    // Edges by minimum-distance pairing.
    const edgeLen = 2 / phi;
    const tol = 0.02;
    const edges = [];
    for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
            const dx = verts[i][0] - verts[j][0];
            const dy = verts[i][1] - verts[j][1];
            const dz = verts[i][2] - verts[j][2];
            const d = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (Math.abs(d - edgeLen) < tol) edges.push([i, j]);
        }
    }

    // Build adjacency and discover the 12 pentagonal faces by walking 5-cycles
    // through the edge graph and keeping those that are coplanar. Each face
    // is then re-ordered so its normal points OUTWARD (away from origin) so
    // backface culling shows the outside of the dodecahedron.
    const adj = verts.map(() => []);
    for (const [a, b] of edges) { adj[a].push(b); adj[b].push(a); }

    const faces = [];
    const seenFace = new Set();
    const pentagonUV = [           // canonical pentagon UV around (0.5, 0.5)
        [0.500, 0.025],
        [0.975, 0.370],
        [0.793, 0.928],
        [0.207, 0.928],
        [0.025, 0.370]
    ];
    for (let v0 = 0; v0 < verts.length; v0++) {
        for (const v1 of adj[v0]) {
            for (const v2 of adj[v1]) {
                if (v2 === v0) continue;
                for (const v3 of adj[v2]) {
                    if (v3 === v0 || v3 === v1) continue;
                    for (const v4 of adj[v3]) {
                        if (v4 === v0 || v4 === v1 || v4 === v2) continue;
                        if (!adj[v4].includes(v0)) continue;  // must close to v0
                        // De-dupe by sorted-set key.
                        const cycle = [v0, v1, v2, v3, v4];
                        const key = cycle.slice().sort((a, b) => a - b).join(',');
                        if (seenFace.has(key)) continue;
                        // Coplanarity: project v3/v4 onto the plane of v0/v1/v2.
                        const p0 = verts[v0], p1 = verts[v1], p2 = verts[v2];
                        const e1 = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
                        const e2 = [p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]];
                        const n = [
                            e1[1]*e2[2] - e1[2]*e2[1],
                            e1[2]*e2[0] - e1[0]*e2[2],
                            e1[0]*e2[1] - e1[1]*e2[0]
                        ];
                        const dot = (p, q) => p[0]*q[0]+p[1]*q[1]+p[2]*q[2];
                        const off3 = (verts[v3][0]-p0[0])*n[0] + (verts[v3][1]-p0[1])*n[1] + (verts[v3][2]-p0[2])*n[2];
                        const off4 = (verts[v4][0]-p0[0])*n[0] + (verts[v4][1]-p0[1])*n[1] + (verts[v4][2]-p0[2])*n[2];
                        if (Math.abs(off3) > 0.05 || Math.abs(off4) > 0.05) continue;
                        // Outward-orient: face centroid points outward from origin.
                        // If the normal computed from v0→v1→v2 points opposite
                        // to the centroid direction, reverse the cycle so it's
                        // CCW from outside.
                        const c = [0,0,0];
                        for (const vi of cycle) { c[0]+=verts[vi][0]; c[1]+=verts[vi][1]; c[2]+=verts[vi][2]; }
                        c[0]/=5; c[1]/=5; c[2]/=5;
                        if (dot(n, c) < 0) cycle.reverse();
                        seenFace.add(key);
                        faces.push({ verts: cycle, uvs: pentagonUV });
                    }
                }
            }
        }
    }
    return { verts, edges, faces };
}

const DODECAHEDRON_SHAPE = makeDodecahedron();

function renderDodecahedronFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, DODECAHEDRON_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'dodecahedron',
    name:         'Dodecahedron',
    description:  '12-faced regular polyhedron (20 vertices, 30 edges). Golden-ratio geometry.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params:       SHAPE3D_BASE_PARAMS,
    render:       renderDodecahedronFrame
});
