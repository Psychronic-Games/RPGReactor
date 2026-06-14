/**
 * Coin — flat cylinder, axis along Y. Default orientation has the coin
 * face perpendicular to the camera (looking at heads/tails). Tilt with
 * the gizmo to see it edge-on or rotate it for a spinning-coin animation.
 *
 * Built as a low-poly cylinder using makeTaperedPrism with equal top/bot
 * dimensions (so it's a regular box), then we manually replace the verts
 * with a circular ring. Or simpler: build a custom cylinder mesh.
 */
function makeCoinShape() {
    const verts = [];
    const edges = [];
    const faces = [];
    const SIDES = 20;
    const radius = 1.0;
    const halfH  = 0.07; // thin coin

    // Build ring verts: SIDES at top (y=+halfH), SIDES at bottom (y=-halfH).
    // Plus the two cap centers (for triangle fans).
    for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        const x = radius * Math.cos(a);
        const z = radius * Math.sin(a);
        verts.push([x, +halfH, z]); // top ring (0..SIDES-1)
    }
    for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        const x = radius * Math.cos(a);
        const z = radius * Math.sin(a);
        verts.push([x, -halfH, z]); // bottom ring (SIDES..2·SIDES-1)
    }
    const topCenter = verts.length; verts.push([0, +halfH, 0]);
    const botCenter = verts.length; verts.push([0, -halfH, 0]);

    // Edges: top ring, bottom ring, vertical connectors.
    for (let i = 0; i < SIDES; i++) {
        const n = (i + 1) % SIDES;
        edges.push([i, n]);
        edges.push([SIDES + i, SIDES + n]);
        edges.push([i, SIDES + i]);
    }

    // Side faces (quads). Winding CCW from outside: top-i → top-n →
    // bot-n → bot-i traces the panel so e1 × e2 points radially out.
    // Each panel gets a 1/SIDES-wide slice of the texture so an image
    // wraps once around the rim instead of being stretched on every
    // segment.
    for (let i = 0; i < SIDES; i++) {
        const n = (i + 1) % SIDES;
        const u0 = i / SIDES;
        const u1 = (i + 1) / SIDES;
        faces.push({
            verts: [i, n, SIDES + n, SIDES + i],
            uvs:   [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]
        });
    }
    // Cap UVs use radial disc projection so a circular texture (e.g. a
    // coin face) renders as a disc instead of every wedge showing the
    // same triangular slice of the texture.
    const capUV = (i) => {
        const a = (i / SIDES) * Math.PI * 2;
        return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)];
    };
    // Top cap (fan from topCenter): CCW from above (+Y).
    for (let i = 0; i < SIDES; i++) {
        const n = (i + 1) % SIDES;
        faces.push({
            verts: [topCenter, n, i],
            uvs:   [[0.5, 0.5], capUV(n), capUV(i)]
        });
    }
    // Bottom cap: CCW from below (-Y).
    for (let i = 0; i < SIDES; i++) {
        const n = (i + 1) % SIDES;
        faces.push({
            verts: [botCenter, SIDES + i, SIDES + n],
            uvs:   [[0.5, 0.5], capUV(i), capUV(n)]
        });
    }
    return { verts, edges, faces };
}

const COIN_SHAPE = makeCoinShape();

function renderCoinFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, COIN_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'coin',
    name:         'Coin',
    description:  'Flat cylindrical coin — perfect for spinning-coin animations. Default cycY=1 spins it heads-to-tails. Texture the faces for custom currency.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderCoinFrame
});
