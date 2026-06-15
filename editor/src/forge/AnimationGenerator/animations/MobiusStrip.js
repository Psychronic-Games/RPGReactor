/**
 * Möbius Strip — single-sided surface formed by a half-twisted band.
 *
 * Parameterization:
 *   x = (R + w · cos(u/2)) · cos(u)
 *   y = w · sin(u/2)
 *   z = (R + w · cos(u/2)) · sin(u)
 *   u ∈ [0, 2π)  (angle around the central ring)
 *   w ∈ [-W/2, W/2]  (across the strip width)
 *
 * The u/2 in the cos/sin means after one full loop (u = 2π) the strip is
 * flipped — so the LAST slice connects back to the FIRST with j ↔ wSeg-j.
 * This wraparound flip is what makes the surface topologically Möbius.
 *
 * Depends on:
 *   render3DShape, SHAPE3D_BASE_PARAMS  (helpers/shape3D.js)
 *   RR_ANIMATION_REGISTRY                (registry.js)
 */
function makeMobiusStrip(uSeg, wSeg, ringR, stripW) {
    uSeg = Math.max(8, Math.round(uSeg));
    wSeg = Math.max(1, Math.round(wSeg));
    const slices = wSeg + 1; // verts per slice
    const verts = [];
    for (let i = 0; i < uSeg; i++) {
        const u = (i / uSeg) * Math.PI * 2;
        const cu  = Math.cos(u),  su  = Math.sin(u);
        const ch  = Math.cos(u/2), sh = Math.sin(u/2);
        for (let j = 0; j < slices; j++) {
            const w = ((j / wSeg) - 0.5) * stripW;
            const r = ringR + w * ch;
            verts.push([r * cu, w * sh, r * su]);
        }
    }

    // Wrap-aware index lookup: at i=uSeg we land on i=0 but with the
    // width axis FLIPPED. That's the Möbius topology — without this the
    // strip would have a visible seam at u=2π.
    const idx = (i, j) => {
        if (i >= uSeg) { i -= uSeg; j = wSeg - j; }
        return i * slices + j;
    };

    const edges = [];
    // Longitudinal (along u, including wrap)
    for (let i = 0; i < uSeg; i++) {
        for (let j = 0; j < slices; j++) edges.push([idx(i, j), idx(i + 1, j)]);
    }
    // Width (along w)
    for (let i = 0; i < uSeg; i++) {
        for (let j = 0; j < wSeg; j++) edges.push([idx(i, j), idx(i, j + 1)]);
    }

    // Quad faces with linear UV across the strip.
    const faces = [];
    for (let i = 0; i < uSeg; i++) {
        for (let j = 0; j < wSeg; j++) {
            faces.push({
                verts: [idx(i, j), idx(i + 1, j), idx(i + 1, j + 1), idx(i, j + 1)],
                uvs: [
                    [i  / uSeg, j  / wSeg],
                    [(i+1) / uSeg, j  / wSeg],
                    [(i+1) / uSeg, (j+1) / wSeg],
                    [i  / uSeg, (j+1) / wSeg]
                ]
            });
        }
    }
    // Single-sided surface — no consistent outward normal. Tell the renderer
    // to skip backface culling so every quad renders regardless of which way
    // its computed normal points.
    return { verts, edges, faces, doubleSided: true };
}

function renderMobiusStripFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const uSeg = Math.max(8,  Math.round(params.uSegments || 40));
    const wSeg = Math.max(1,  Math.round(params.wSegments || 4));
    const ringR  = params.ringRadius !== undefined ? params.ringRadius : 0.7;
    const stripW = params.stripWidth !== undefined ? params.stripWidth : 0.35;
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, makeMobiusStrip(uSeg, wSeg, ringR, stripW));
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'mobius-strip',
    name:         'Möbius Strip',
    description:  'One-sided surface with a half-twist. Watch the orientation flip as it rotates.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params: [
        ...SHAPE3D_BASE_PARAMS.slice(0, 10),
        { key: 'ringRadius', label: 'Ring Radius',
            description: 'Distance from the center to the middle of the strip.',
            type: 'slider', min: 0.3, max: 1.0, step: 0.05, default: 0.7 },
        { key: 'stripWidth', label: 'Strip Width',
            description: 'How wide the strip is across its short axis.',
            type: 'slider', min: 0.05, max: 0.6, step: 0.02, default: 0.35 },
        { key: 'uSegments', label: 'Ring Segments',
            description: 'Segments around the major loop. Higher = smoother twist.',
            type: 'slider', min: 12, max: 80, step: 1, default: 40 },
        { key: 'wSegments', label: 'Width Segments',
            description: 'Segments across the strip width.',
            type: 'slider', min: 1, max: 12, step: 1, default: 4 },
        SHAPE3D_BASE_PARAMS[10], // texture
        SHAPE3D_BASE_PARAMS[11]  // textureOpacity
    ],
    render: renderMobiusStripFrame
});
