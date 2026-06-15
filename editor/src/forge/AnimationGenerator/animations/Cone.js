/**
 * Cone — apex at the top (+Y), circular base at the bottom (-Y).
 *
 * Side surface: N triangle faces fanning from apex down to consecutive
 * base perimeter vertices.
 * Base: N triangle faces in a fan from the base center.
 *
 * Side face winding: [apex, next, i] gives an outward-radial normal at
 * each side; base fan [center, next, i] gives a normal pointing -Y
 * (outward / downward).
 */
function makeCone() {
    const SIDES = 18;
    const verts = [];
    // Bottom circle (indices 0..SIDES-1).
    for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        verts.push([Math.cos(a), -1, Math.sin(a)]);
    }
    const apex = verts.length;       verts.push([0,  1, 0]);
    const baseCenter = verts.length; verts.push([0, -1, 0]);

    const edges = [];
    // Base ring.
    for (let i = 0; i < SIDES; i++) edges.push([i, (i + 1) % SIDES]);
    // Apex to each base vert.
    for (let i = 0; i < SIDES; i++) edges.push([apex, i]);

    const sideUV = [[0.5, 0], [0, 1], [1, 1]];
    const baseUV = [[0.5, 0.5], [0, 1], [1, 1]];
    const faces = [];
    // Side faces — apex + 2 consecutive base verts, CCW from outside (radial-out).
    for (let i = 0; i < SIDES; i++) {
        const n = (i + 1) % SIDES;
        faces.push({ verts: [apex, n, i], uvs: sideUV });
    }
    // Base — CCW from below (-Y), so winding [center, next, i].
    for (let i = 0; i < SIDES; i++) {
        const n = (i + 1) % SIDES;
        faces.push({ verts: [baseCenter, n, i], uvs: baseUV });
    }
    return { verts, edges, faces };
}

const CONE_SHAPE = makeCone();

function renderConeFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, CONE_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'cone',
    name:         'Cone',
    description:  'Right circular cone — apex at top, circular base at bottom. Configurable rotation and texture mapping.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params:       SHAPE3D_BASE_PARAMS,
    render:       renderConeFrame
});
