/**
 * Crown — circular base ring with N spikes extending upward (+Y) at
 * regular angular intervals. The base is a short cylinder; each spike is
 * a tapered prism pointing up. Reads as a classic royal crown silhouette.
 */
function makeCrownShape() {
    const SPIKES = 8;
    const baseRadius = 0.85;
    const baseHalfH = 0.18;

    // Base ring: short cylinder. Same construction as Coin's cylinder.
    const verts = [];
    const edges = [];
    const faces = [];
    const SIDES = SPIKES * 2;  // double so spike anchors land on ring corners

    // Cylinder top + bottom rings.
    for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        verts.push([baseRadius * Math.cos(a), +baseHalfH, baseRadius * Math.sin(a)]);
    }
    for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        verts.push([baseRadius * Math.cos(a), -baseHalfH, baseRadius * Math.sin(a)]);
    }
    const topCenter = verts.length; verts.push([0, +baseHalfH, 0]);
    const botCenter = verts.length; verts.push([0, -baseHalfH, 0]);

    // Cylinder edges + faces (same pattern as Coin).
    for (let i = 0; i < SIDES; i++) {
        const n = (i + 1) % SIDES;
        edges.push([i, n]);
        edges.push([SIDES + i, SIDES + n]);
        edges.push([i, SIDES + i]);
    }
    // CCW-from-outside winding (top-i → top-n → bot-n → bot-i) so the
    // band's outward normal points radially out. Per-segment U so the
    // texture wraps once around instead of being stamped on each panel.
    // Cap UVs use radial disc projection like the cylinder helper.
    const capUV = (i) => {
        const a = (i / SIDES) * Math.PI * 2;
        return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)];
    };
    for (let i = 0; i < SIDES; i++) {
        const n = (i + 1) % SIDES;
        const u0 = i / SIDES;
        const u1 = (i + 1) / SIDES;
        faces.push({
            verts: [i, n, SIDES + n, SIDES + i],
            uvs:   [[u0, 0], [u1, 0], [u1, 1], [u0, 1]]
        });
        faces.push({
            verts: [topCenter, n, i],
            uvs:   [[0.5, 0.5], capUV(n), capUV(i)]
        });
        faces.push({
            verts: [botCenter, SIDES + i, SIDES + n],
            uvs:   [[0.5, 0.5], capUV(i), capUV(n)]
        });
    }

    // Spikes — each is a tapered prism (rectangular pyramid). Anchor at the
    // top ring of the base; tip at higher Y.
    const base = { verts, edges, faces };
    const spikes = [];
    for (let s = 0; s < SPIKES; s++) {
        const a = (s / SPIKES) * Math.PI * 2;
        const spikeBaseR = baseRadius * 0.95;
        const cx = spikeBaseR * Math.cos(a);
        const cz = spikeBaseR * Math.sin(a);
        // Spike orientation: rectangular base in XZ at y=+baseHalfH, point
        // at y=+baseHalfH+0.55.
        // For simplicity use an axis-aligned tapered prism — visually fine
        // since spikes are small relative to the base ring.
        spikes.push(makeTaperedPrism(
            cx, cz,
            0.18, 0.18,   // base XZ
            0.0,  0.0,    // tip XZ (a point)
            +baseHalfH, +baseHalfH + 0.55
        ));
    }
    return mergeShapes(base, ...spikes);
}

const CROWN_SHAPE = makeCrownShape();

function renderCrownFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, CROWN_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'crown',
    name:         'Crown',
    description:  'Cylindrical base ring with 8 tapered spikes — classic royal crown. Full 3D rotation + texturing.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderCrownFrame
});
