/**
 * Circular Saw Blade — thin disc with alternating inner/outer perimeter
 * vertices forming triangular teeth. Axis along +Z so the toothed disc
 * faces the camera by default. Set `cycZ = 1` for a classic spinning saw.
 *
 * Geometry:
 *   - 2N perimeter vertices on the FRONT face (z = +halfH), alternating
 *     between R_in (tooth base) and R_out (tooth tip).
 *   - 2N perimeter vertices on the BACK face (z = -halfH), mirrored.
 *   - Triangle-fan front and back faces from their respective centers.
 *   - Side quads connecting each front-perimeter edge to its back equivalent.
 *   - Inner spokes (frontCenter → each R_in vertex) added as wireframe
 *     edges so the toothed structure reads clearly in wireframe mode.
 */
function makeSawBladeShape() {
    const N = 16;          // tooth count
    const R_in  = 0.78;
    const R_out = 1.00;
    const halfH = 0.04;
    const TWO_N = 2 * N;

    const verts = [];
    // Front perimeter (z = +halfH), alternating in/out radii.
    for (let i = 0; i < TWO_N; i++) {
        const angle = (i / TWO_N) * Math.PI * 2;
        const r = (i % 2 === 0) ? R_in : R_out;
        verts.push([r * Math.cos(angle), r * Math.sin(angle), +halfH]);
    }
    // Back perimeter (z = -halfH), same angular pattern.
    for (let i = 0; i < TWO_N; i++) {
        const angle = (i / TWO_N) * Math.PI * 2;
        const r = (i % 2 === 0) ? R_in : R_out;
        verts.push([r * Math.cos(angle), r * Math.sin(angle), -halfH]);
    }
    const frontCenter = verts.length; verts.push([0, 0, +halfH]);
    const backCenter  = verts.length; verts.push([0, 0, -halfH]);

    const edges = [];
    // Front + back perimeters.
    for (let i = 0; i < TWO_N; i++) edges.push([i,         (i + 1) % TWO_N]);
    for (let i = 0; i < TWO_N; i++) edges.push([TWO_N + i, TWO_N + (i + 1) % TWO_N]);
    // Front-to-back vertical connectors.
    for (let i = 0; i < TWO_N; i++) edges.push([i, TWO_N + i]);
    // Inner spokes from center to each R_in vertex (every even index).
    for (let i = 0; i < TWO_N; i += 2) {
        edges.push([frontCenter, i]);
        edges.push([backCenter,  TWO_N + i]);
    }

    const triUV  = [[0.5, 0.5], [0, 1], [1, 1]];
    const quadUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const faces = [];
    // FRONT face — CCW from +Z. Verified: triangle [center, i, next] has
    // n_z > 0 because angle increases CCW around +Z.
    for (let i = 0; i < TWO_N; i++) {
        const n = (i + 1) % TWO_N;
        faces.push({ verts: [frontCenter, i, n], uvs: triUV });
    }
    // BACK face — CCW from -Z. Reverse winding: [center, next, i].
    for (let i = 0; i < TWO_N; i++) {
        const n = (i + 1) % TWO_N;
        faces.push({ verts: [backCenter, TWO_N + n, TWO_N + i], uvs: triUV });
    }
    // SIDE faces — quad [front_i, back_i, back_next, front_next] gives a
    // normal perpendicular to the sweep edge with the correct outward sign.
    for (let i = 0; i < TWO_N; i++) {
        const n = (i + 1) % TWO_N;
        faces.push({ verts: [i, TWO_N + i, TWO_N + n, n], uvs: quadUV });
    }
    return { verts, edges, faces };
}

const SAW_BLADE_SHAPE = makeSawBladeShape();

function renderSawBladeFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, SAW_BLADE_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'sawblade',
    name:         'Circular Saw Blade',
    description:  'Toothed 3D disc — 16 triangular teeth around a thin disc body. Set cycZ=1 to spin around its own axis like a real saw.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderSawBladeFrame
});
