/**
 * Double Helix — two intertwined helical strands connected by rungs, the
 * classic DNA silhouette. Renders as 3D wireframe via render3DShape with
 * depth-sorted edges (strands going around come out in front/behind
 * correctly).
 *
 * Strand 1: helix at angle θ
 * Strand 2: helix at angle θ + π (180° offset — opposite side of the axis)
 * Both rise from y=-1 to y=+1 over `turns` full rotations.
 * Rungs are straight lines connecting matching points on the two strands.
 *
 * Depends on:
 *   render3DShape, SHAPE3D_BASE_PARAMS  (helpers/shape3D.js)
 *   RR_ANIMATION_REGISTRY                (registry.js)
 */
function makeDoubleHelix(turns, segmentsPerTurn, rungSpacing, heightStretch) {
    turns = Math.max(1, Math.round(turns));
    segmentsPerTurn = Math.max(6, Math.round(segmentsPerTurn));
    rungSpacing = Math.max(1, Math.round(rungSpacing));
    const hs = heightStretch !== undefined ? heightStretch : 1;
    const totalSeg = turns * segmentsPerTurn;
    const verts = [];
    // Strand 1
    for (let i = 0; i <= totalSeg; i++) {
        const t = i / totalSeg;
        const theta = t * turns * Math.PI * 2;
        const y = (t - 0.5) * 2 * hs;
        verts.push([Math.cos(theta), y, Math.sin(theta)]);
    }
    // Strand 2 (180° offset)
    for (let i = 0; i <= totalSeg; i++) {
        const t = i / totalSeg;
        const theta = t * turns * Math.PI * 2 + Math.PI;
        const y = (t - 0.5) * 2 * hs;
        verts.push([Math.cos(theta), y, Math.sin(theta)]);
    }
    const s2 = totalSeg + 1; // index offset for strand 2
    const edges = [];
    // Strand 1 connections
    for (let i = 0; i < totalSeg; i++) edges.push([i, i + 1]);
    // Strand 2 connections
    for (let i = 0; i < totalSeg; i++) edges.push([s2 + i, s2 + i + 1]);
    // Rungs at regular intervals
    for (let i = 0; i <= totalSeg; i += rungSpacing) edges.push([i, s2 + i]);

    // Faces: a ribbon between the two strands, quads spanning each rung
    // interval. The ribbon naturally twists 180° per helix turn (since the
    // two strands are always 180° apart). Texture U spans 0 (strand 1) to
    // 1 (strand 2), V spans 0 (bottom) to 1 (top) along the helix length.
    // Marked doubleSided since the ribbon has no consistent outward direction.
    const faces = [];
    for (let i = 0; i + 1 <= totalSeg; i++) {
        const ni = i + 1;
        const v0 = i  / totalSeg;
        const v1 = ni / totalSeg;
        faces.push({
            verts: [i, s2 + i, s2 + ni, ni],
            uvs: [
                [0, v0], [1, v0], [1, v1], [0, v1]
            ]
        });
    }
    return { verts, edges, faces, doubleSided: true };
}

function renderDoubleHelixFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const turns           = Math.max(1, Math.round(params.turns || 3));
    const segmentsPerTurn = Math.max(6, Math.round(params.segmentsPerTurn || 24));
    const rungSpacing     = Math.max(1, Math.round(params.rungSpacing || 4));
    const heightStretch   = params.heightStretch !== undefined ? params.heightStretch : 1;
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, makeDoubleHelix(turns, segmentsPerTurn, rungSpacing, heightStretch));
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'double-helix',
    name:         'Double Helix',
    description:  'Two intertwined helical strands connected by rungs — classic DNA silhouette.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params: [
        // Base shape params, then helix-specific params before texture (texture
        // ignored on this shape since faces aren\'t generated — it\'s a pure
        // wireframe).
        ...SHAPE3D_BASE_PARAMS.slice(0, 10),
        { key: 'turns', label: 'Turns',
            description: 'Number of full rotations from bottom to top of the helix.',
            type: 'slider', min: 1, max: 8, step: 1, default: 3 },
        { key: 'segmentsPerTurn', label: 'Segments / Turn',
            description: 'How smooth each helical loop looks. Higher = smoother spiral.',
            type: 'slider', min: 8, max: 48, step: 1, default: 24 },
        { key: 'rungSpacing', label: 'Rung Spacing',
            description: 'Spacing between cross-rungs in segments. Lower = more rungs (denser ladder).',
            type: 'slider', min: 1, max: 12, step: 1, default: 4 },
        { key: 'heightStretch', label: 'Height Stretch',
            description: 'Vertical scale of the helix. 1 = unit cube (default), 0.3 = squat, 2-3 = tall and stretched.',
            type: 'slider', min: 0.3, max: 3, step: 0.05, default: 1.0 },
        SHAPE3D_BASE_PARAMS[10], // texture
        SHAPE3D_BASE_PARAMS[11]  // textureOpacity
    ],
    render: renderDoubleHelixFrame
});
