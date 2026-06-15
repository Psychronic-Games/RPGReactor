/**
 * Torus — donut shape generated as a parametric mesh.
 *
 * Parameterization:
 *   x = (R + r·cos(v)) · cos(u)
 *   y = r · sin(v)
 *   z = (R + r·cos(v)) · sin(u)
 *   u ∈ [0, 2π]  (major loop)
 *   v ∈ [0, 2π]  (minor loop / tube cross-section)
 *
 * R = major radius (center of tube to center of torus)
 * r = minor radius (tube thickness)
 *
 * Depends on:
 *   render3DShape, SHAPE3D_BASE_PARAMS  (helpers/shape3D.js)
 *   RR_ANIMATION_REGISTRY                (registry.js)
 */
function makeTorus(uSeg, vSeg, majorR, minorR) {
    uSeg = Math.max(3, Math.round(uSeg));
    vSeg = Math.max(3, Math.round(vSeg));
    const verts = [];
    for (let i = 0; i < uSeg; i++) {
        const u = (i / uSeg) * Math.PI * 2;
        for (let j = 0; j < vSeg; j++) {
            const v = (j / vSeg) * Math.PI * 2;
            const cr = majorR + minorR * Math.cos(v);
            verts.push([
                cr * Math.cos(u),
                minorR * Math.sin(v),
                cr * Math.sin(u)
            ]);
        }
    }
    const edges = [];
    const faces = [];
    const idx = (i, j) => (i % uSeg) * vSeg + (j % vSeg);
    // U-circles (around the major loop, at constant v).
    for (let i = 0; i < uSeg; i++) {
        const ni = (i + 1) % uSeg;
        for (let j = 0; j < vSeg; j++) edges.push([idx(i, j), idx(ni, j)]);
    }
    // V-circles (around the tube cross-section, at constant u).
    for (let i = 0; i < uSeg; i++) {
        for (let j = 0; j < vSeg; j++) {
            const nj = (j + 1) % vSeg;
            edges.push([idx(i, j), idx(i, nj)]);
        }
    }
    // Quad faces (for textured rendering). Winding CCW from outside:
    // walking idx(i,j) → idx(i,nj) → idx(ni,nj) → idx(ni,j) traces the
    // quad so e1 × e2 points radially outward from the tube surface,
    // keeping the camera-facing half visible after backface culling.
    for (let i = 0; i < uSeg; i++) {
        const ni = (i + 1) % uSeg;
        for (let j = 0; j < vSeg; j++) {
            const nj = (j + 1) % vSeg;
            faces.push({
                verts: [idx(i, j), idx(i, nj), idx(ni, nj), idx(ni, j)],
                uvs: [
                    [i  / uSeg,    j  / vSeg],
                    [i  / uSeg,    (j+1) / vSeg],
                    [(i+1) / uSeg, (j+1) / vSeg],
                    [(i+1) / uSeg, j  / vSeg]
                ]
            });
        }
    }
    return { verts, edges, faces };
}

function renderTorusFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const uSeg = Math.max(3, Math.round(params.uSegments || 24));
    const vSeg = Math.max(3, Math.round(params.vSegments || 12));
    const majorR = params.majorRadius !== undefined ? params.majorRadius : 0.7;
    const minorR = params.minorRadius !== undefined ? params.minorRadius : 0.3;
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, makeTorus(uSeg, vSeg, majorR, minorR));
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'torus',
    name:         'Torus',
    description:  'Donut shape — parametric surface with adjustable tube and ring radius. Textures wrap around the tube.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params: [
        // All base 3D shape params except texture (we add custom params, then texture last).
        ...SHAPE3D_BASE_PARAMS.slice(0, 10),
        { key: 'majorRadius', label: 'Major Radius',
            description: 'Distance from the center of the torus to the center of the tube.',
            type: 'slider', min: 0.3, max: 1.0, step: 0.05, default: 0.7 },
        { key: 'minorRadius', label: 'Minor Radius (Tube)',
            description: 'Tube thickness. Should be smaller than Major Radius for a clean donut.',
            type: 'slider', min: 0.05, max: 0.6, step: 0.02, default: 0.3 },
        { key: 'uSegments', label: 'Ring Segments',
            description: 'Segments around the major loop (smoother torus at higher values).',
            type: 'slider', min: 6, max: 64, step: 1, default: 24 },
        { key: 'vSegments', label: 'Tube Segments',
            description: 'Segments around the tube cross-section.',
            type: 'slider', min: 4, max: 32, step: 1, default: 12 },
        SHAPE3D_BASE_PARAMS[10], // texture
        SHAPE3D_BASE_PARAMS[11]  // textureOpacity
    ],
    render: renderTorusFrame
});
