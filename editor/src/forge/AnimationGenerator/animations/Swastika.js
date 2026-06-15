/**
 * Swastika — an ancient symbol with deep religious significance in
 * Hinduism, Buddhism, and Jainism (where it represents auspiciousness and
 * good fortune), as well as in pre-Columbian Americas, Norse cultures,
 * and many others. It was infamously appropriated by Nazi Germany in the
 * 20th century, typically depicted at a 45° tilt; the Eastern sacred
 * orientation is upright (no tilt).
 *
 * This animation defaults to the Eastern upright orientation. Use tiltZ
 * to rotate as needed; bendDirection chooses CW (right-facing, 卐) or
 * CCW (left-facing, 卍) — both are valid in different traditions.
 *
 * Geometry (unit local space): 2 crossed bars + 4 L-shaped bends at the
 * four arm tips. Built as 6 filled quads passed through the symbol3D
 * transform pipeline.
 */
function renderSwastikaFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const color1 = params.color1;
    const color2 = params.color2;
    const opacity = params.opacity;
    const barW = params.barWidth;
    const bendLen = params.bendLength;
    const dir = Math.sign(params.bendDirection) || 1; // -1, 0, or +1
    const thickness = Math.max(0.5, minDim * 0.005 * params.thickness);

    // Define quads (4 corners each) in unit local space.
    const quads = [];
    // Vertical bar.
    quads.push([[-barW, -1], [ barW, -1], [ barW,  1], [-barW,  1]]);
    // Horizontal bar.
    quads.push([[-1, -barW], [ 1, -barW], [ 1,  barW], [-1,  barW]]);

    if (dir !== 0 && bendLen > 0.01) {
        // CW (dir=+1) bend rectangles.
        const cwBends = [
            // Top: bend right
            [[ barW,         1 - 2 * barW],
             [ barW + bendLen, 1 - 2 * barW],
             [ barW + bendLen, 1],
             [ barW,         1]],
            // Right: bend down
            [[ 1 - 2 * barW, -barW - bendLen],
             [ 1,            -barW - bendLen],
             [ 1,            -barW],
             [ 1 - 2 * barW, -barW]],
            // Bottom: bend left
            [[-barW - bendLen, -1],
             [-barW,           -1],
             [-barW,           -1 + 2 * barW],
             [-barW - bendLen, -1 + 2 * barW]],
            // Left: bend up
            [[-1,            barW],
             [-1 + 2 * barW, barW],
             [-1 + 2 * barW, barW + bendLen],
             [-1,            barW + bendLen]]
        ];
        // For CCW (dir=-1), mirror x of every corner.
        for (const quad of cwBends) {
            if (dir > 0) {
                quads.push(quad);
            } else {
                quads.push(quad.map(([x, y]) => [-x, y]));
            }
        }
    }

    // Project each quad's corners.
    const projectedQuads = quads.map(q => q.map(([x, y]) => project(transform([x, y, 0]))));

    const traceQuad = (q) => {
        ctx.beginPath();
        ctx.moveTo(q[0].x, q[0].y);
        for (let k = 1; k < q.length; k++) ctx.lineTo(q[k].x, q[k].y);
        ctx.closePath();
    };

    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = thickness * (2 + params.glow * 5);
        ctx.lineJoin = 'round';
        for (const q of projectedQuads) { traceQuad(q); ctx.stroke(); }
    }

    ctx.fillStyle = hexWithAlpha(color1, opacity);
    for (const q of projectedQuads) { traceQuad(q); ctx.fill(); }

    if (params.thickness > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color1, opacity);
        ctx.lineWidth = thickness;
        ctx.lineJoin = 'miter';
        for (const q of projectedQuads) { traceQuad(q); ctx.stroke(); }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'swastika',
    name:         'Swastika',
    description:  'Ancient solar/auspicious symbol (Hindu, Buddhist, Jain, Norse, Native American). Defaults to the Eastern upright orientation. Use bendDirection to flip between right-facing (卐) and left-facing (卍).',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Body Color', type: 'color', default: '#e8c060' },
        { key: 'color2', label: 'Glow Color', type: 'color', default: '#ff8020' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'barWidth', label: 'Bar Width',
            description: 'Half-thickness of the cross arms (in unit local space).',
            type: 'slider', min: 0.05, max: 0.3, step: 0.01, default: 0.16 },
        { key: 'bendLength', label: 'Bend Length',
            description: 'Length of the L-shaped bends at each arm tip. 0 = plain Greek cross.',
            type: 'slider', min: 0, max: 0.9, step: 0.02, default: 0.45 },
        { key: 'bendDirection', label: 'Bend Direction',
            description: '+1 = right-facing / clockwise (卐), -1 = left-facing / counter-clockwise (卍), 0 = no bends.',
            type: 'slider', min: -1, max: 1, step: 1, default: 1 },
        { key: 'thickness', label: 'Outline Thickness',
            description: 'Stroke around the outline. 0 = fill only.',
            type: 'slider', min: 0, max: 4, step: 0.1, default: 0 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.4 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderSwastikaFrame
});
