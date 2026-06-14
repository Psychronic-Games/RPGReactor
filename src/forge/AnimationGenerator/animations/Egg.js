/**
 * Egg — solid of revolution with an asymmetric vertical profile (pointed
 * top, rounded bottom). Built as a latitude/longitude mesh with the
 * radius profile r(φ) = sin(φ) · (1 − 0.2 cos(φ)), which gives the
 * classic egg silhouette — wider at the bottom, tapered at the top.
 *
 * Renders through render3DShape so all SHAPE3D_BASE_PARAMS (color, glow,
 * scale, tilt X/Y/Z, cycle X/Y/Z, texture, textureOpacity) apply.
 */
function makeEggShape() {
    const verts = [];
    const edges = [];
    const faces = [];
    const LAT = 12;   // latitude rings between poles
    const LON = 16;   // longitude segments

    // Top pole (vertex 0). The egg's "top" in local space is +Y.
    verts.push([0, 1, 0]);
    // Latitude rings (excluding both poles). lat = 1..LAT-1.
    for (let lat = 1; lat < LAT; lat++) {
        // phi = 0 at top pole, π at bottom pole. cos(phi) gives y from +1
        // (top) to −1 (bottom). With this convention ring lat=1 is near
        // the top pole (so the top-pole-to-ring edges are short, not
        // crossing the whole egg interior).
        const phi = (lat / LAT) * Math.PI;
        // Egg radius profile — narrower at top (cos(phi) > 0), wider at
        // bottom (cos(phi) < 0). Asymmetric egg silhouette.
        const r = Math.sin(phi) * (1 - 0.2 * Math.cos(phi));
        const y = Math.cos(phi);
        for (let lon = 0; lon < LON; lon++) {
            const theta = (lon / LON) * Math.PI * 2;
            verts.push([r * Math.cos(theta), y, r * Math.sin(theta)]);
        }
    }
    const bottomPole = verts.length;
    verts.push([0, -1, 0]);

    // Edge wiring. Lat rings get horizontal edges; consecutive rings get
    // vertical connectors; poles fan out to their adjacent rings.
    const ringStart = (lat) => 1 + (lat - 1) * LON;
    // Top pole → first ring.
    for (let lon = 0; lon < LON; lon++) edges.push([0, 1 + lon]);
    // Inter-ring + intra-ring edges for lat 1..LAT-2.
    for (let lat = 1; lat < LAT - 1; lat++) {
        const rs = ringStart(lat);
        const rn = ringStart(lat + 1);
        for (let lon = 0; lon < LON; lon++) {
            const nxt = (lon + 1) % LON;
            edges.push([rs + lon, rs + nxt]);
            edges.push([rs + lon, rn + lon]);
        }
    }
    // Last ring's intra edges.
    const lastRS = ringStart(LAT - 1);
    for (let lon = 0; lon < LON; lon++) {
        edges.push([lastRS + lon, lastRS + (lon + 1) % LON]);
    }
    // Bottom pole ← last ring.
    for (let lon = 0; lon < LON; lon++) edges.push([bottomPole, lastRS + lon]);

    // Faces (for texturing + backface culling). U is flipped (1 - lon/LON)
    // so equirectangular textures render in the right orientation —
    // without it the CCW winding wraps U clockwise around the equator and
    // the texture appears horizontally mirrored. Same fix as Sphere.js.
    const u  = (lon) => 1 - lon / LON;
    const un = (nxt) => 1 - nxt / LON;
    // Top cap (triangle fan from top pole).
    for (let lon = 0; lon < LON; lon++) {
        const nxt = (lon + 1) % LON;
        faces.push({
            verts: [0, 1 + nxt, 1 + lon],
            uvs: [[0.5, 0], [un(nxt), 1 / LAT], [u(lon), 1 / LAT]]
        });
    }
    // Middle quads. Winding is CCW from outside (lower-left → upper-left
    // → upper-right → lower-right) so e1 × e2 points radially outward
    // and the front-facing half stays visible after backface culling.
    for (let lat = 1; lat < LAT - 1; lat++) {
        const rs = ringStart(lat);     // upper ring (smaller phi, larger y)
        const rn = ringStart(lat + 1); // lower ring
        for (let lon = 0; lon < LON; lon++) {
            const nxt = (lon + 1) % LON;
            faces.push({
                verts: [rn + lon, rs + lon, rs + nxt, rn + nxt],
                uvs: [
                    [u(lon),  (lat + 1) / LAT],
                    [u(lon),  lat / LAT],
                    [un(nxt), lat / LAT],
                    [un(nxt), (lat + 1) / LAT]
                ]
            });
        }
    }
    // Bottom cap (triangle fan to bottom pole).
    for (let lon = 0; lon < LON; lon++) {
        const nxt = (lon + 1) % LON;
        faces.push({
            verts: [bottomPole, lastRS + lon, lastRS + nxt],
            uvs: [[0.5, 1], [u(lon), (LAT - 1) / LAT], [un(nxt), (LAT - 1) / LAT]]
        });
    }
    return { verts, edges, faces };
}

const EGG_SHAPE = makeEggShape();

function renderEggFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, EGG_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'egg',
    name:         'Egg',
    description:  'Classic 3D egg — wider rounded bottom, tapered top. Wireframe lat/lon mesh with full 3D rotation + texturing.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderEggFrame
});
