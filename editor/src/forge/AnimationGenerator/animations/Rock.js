/**
 * Rock — irregular faceted polyhedron. Built by starting with a low-poly
 * lat/lon sphere (8 latitudes × 10 longitudes) and perturbing each
 * vertex's radius by a deterministic per-vertex random factor — gives
 * the classic chunky-rock silhouette every time the page reloads (the
 * randomness is seeded by vertex index, not Math.random()).
 *
 * Each face stays a flat quad/triangle so the shape reads as faceted,
 * not smooth.
 */
function makeRockShape() {
    const verts = [];
    const edges = [];
    const faces = [];
    const LAT = 6;
    const LON = 10;
    const fullUV = [[0,0],[1,0],[1,1],[0,1]];
    const triUV = [[0,0],[1,0],[0.5,1]];

    const seedAt = (i) => {
        const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
        return s - Math.floor(s);
    };
    // Per-vertex radius perturbation kept moderate (±10%) so adjacent
    // verts on the same ring don't differ enough to make the quad faces
    // visibly non-planar (which used to cause faces to appear to "loop
    // inside the rock" because backface culling computes the normal from
    // only the first 3 verts of each face).
    const rAt = (i) => 0.90 + 0.20 * seedAt(i);

    // Top pole (0).
    verts.push([0, rAt(0), 0]);
    // Latitude rings.
    for (let lat = 1; lat < LAT; lat++) {
        // phi = 0 at top pole, π at bottom — ring lat=1 sits near the top
        // pole (was previously inverted, which made the top-pole edges
        // span the entire rock interior and create the "inside-out" mess).
        const phi = (lat / LAT) * Math.PI;
        const sinP = Math.sin(phi);
        const cosP = Math.cos(phi);
        for (let lon = 0; lon < LON; lon++) {
            const theta = (lon / LON) * Math.PI * 2;
            const idx = verts.length;
            const r = rAt(idx);
            verts.push([
                r * sinP * Math.cos(theta),
                r * cosP,
                r * sinP * Math.sin(theta)
            ]);
        }
    }
    const bottomPole = verts.length;
    verts.push([0, -rAt(bottomPole), 0]);

    const ringStart = (lat) => 1 + (lat - 1) * LON;
    // Wireframe edges.
    for (let lon = 0; lon < LON; lon++) edges.push([0, 1 + lon]);
    for (let lat = 1; lat < LAT - 1; lat++) {
        const rs = ringStart(lat);
        const rn = ringStart(lat + 1);
        for (let lon = 0; lon < LON; lon++) {
            const nxt = (lon + 1) % LON;
            edges.push([rs + lon, rs + nxt]);
            edges.push([rs + lon, rn + lon]);
        }
    }
    const lastRS = ringStart(LAT - 1);
    for (let lon = 0; lon < LON; lon++) {
        edges.push([lastRS + lon, lastRS + (lon + 1) % LON]);
    }
    for (let lon = 0; lon < LON; lon++) edges.push([bottomPole, lastRS + lon]);

    // Faces.
    for (let lon = 0; lon < LON; lon++) {
        const nxt = (lon + 1) % LON;
        faces.push({ verts: [0, 1 + nxt, 1 + lon], uvs: triUV });
    }
    // Split each ring quad into TWO triangles. A triangle is always planar
    // so backface culling computes its normal exactly, and the textured
    // pass can't produce a self-intersecting polygon. (Quads on a
    // perturbed-sphere mesh can be slightly non-planar, which previously
    // caused the rock's faces to read as looping through each other.)
    // Winding is CCW from outside (fan from the lower-left corner): the
    // resulting cross-product normals point radially outward so the
    // backface cull keeps the camera-facing half visible.
    for (let lat = 1; lat < LAT - 1; lat++) {
        const rs = ringStart(lat);
        const rn = ringStart(lat + 1);
        for (let lon = 0; lon < LON; lon++) {
            const nxt = (lon + 1) % LON;
            faces.push({ verts: [rn + lon, rs + lon, rs + nxt], uvs: triUV });
            faces.push({ verts: [rn + lon, rs + nxt, rn + nxt], uvs: triUV });
        }
    }
    for (let lon = 0; lon < LON; lon++) {
        const nxt = (lon + 1) % LON;
        faces.push({ verts: [bottomPole, lastRS + lon, lastRS + nxt], uvs: triUV });
    }
    return { verts, edges, faces };
}

const ROCK_SHAPE = makeRockShape();

function renderRockFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, ROCK_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'rock',
    name:         'Rock',
    description:  'Irregular faceted 3D rock — low-poly sphere with per-vertex random radius perturbation. Full 3D rotation + texturing.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderRockFrame
});
