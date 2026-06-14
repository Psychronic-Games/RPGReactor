/**
 * Cross — Latin cross. Vertical bar + horizontal arm positioned in the
 * upper third by default (Latin proportions; set armPos = 0 for an
 * equilateral Greek cross). Full 3D rotation through symbol3D.
 *
 * Geometry (in unit local space, half-height = 1):
 *   - Vertical bar: rectangle (±barW/2, ±1).
 *   - Horizontal arm: rectangle (±armW, armPos ± barW/2).
 *     armPos > 0 → upper bar (Latin); armPos = 0 → centered (Greek).
 *
 * The shape is rendered as a single closed 12-vertex polygon (Christian
 * cross outline) so 3D rotation produces a coherent silhouette.
 */
function renderCrossFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const barW = params.barWidth * 0.5;       // half-width of vertical bar
    const armW = params.armWidth;             // half-width of horizontal arm
    const armPos = params.armPos;             // vertical center of arm
    const halfArmH = barW;                    // arm thickness = bar width
    const opacity = params.opacity;
    const color1 = params.color1;
    const color2 = params.color2;

    // 12-vertex outline of the cross, traced CW from top-right corner of
    // vertical bar.
    const outline = [
        [ barW,  1],                    // 0  top-right of vertical
        [ barW,  armPos + halfArmH],    // 1  inner upper-right corner
        [ armW,  armPos + halfArmH],    // 2  outer upper-right of arm
        [ armW,  armPos - halfArmH],    // 3  outer lower-right of arm
        [ barW,  armPos - halfArmH],    // 4  inner lower-right corner
        [ barW, -1],                    // 5  bottom-right of vertical
        [-barW, -1],                    // 6  bottom-left of vertical
        [-barW,  armPos - halfArmH],    // 7  inner lower-left corner
        [-armW,  armPos - halfArmH],    // 8  outer lower-left of arm
        [-armW,  armPos + halfArmH],    // 9  outer upper-left of arm
        [-barW,  armPos + halfArmH],    // 10 inner upper-left corner
        [-barW,  1]                     // 11 top-left of vertical
    ];

    const projected = outline.map(([x, y]) => project(transform([x, y, 0])));

    const buildPath = () => {
        ctx.beginPath();
        for (let k = 0; k < projected.length; k++) {
            const p = projected[k];
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
    };

    // Glow halo behind.
    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness) * (2 + params.glow * 5);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        buildPath();
        ctx.stroke();
    }

    // Fill.
    if (params.fill > 0.01) {
        ctx.fillStyle = hexWithAlpha(color1, opacity * params.fill);
        buildPath();
        ctx.fill();
    }

    // Outline stroke.
    if (params.thickness > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color1, opacity);
        ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness);
        ctx.lineJoin = 'miter';
        buildPath();
        ctx.stroke();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'cross',
    name:         'Christian Cross',
    description:  'Latin / Greek cross with configurable proportions and full 3D rotation. Set armPos=0 for equilateral Greek cross.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Body Color', type: 'color', default: '#f8e8c0' },
        { key: 'color2', label: 'Glow Color', type: 'color', default: '#ffd060' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'barWidth', label: 'Bar Width',
            description: 'Width of the vertical bar (fraction of half-size).',
            type: 'slider', min: 0.05, max: 0.6, step: 0.01, default: 0.22 },
        { key: 'armWidth', label: 'Arm Reach',
            description: 'Horizontal extent of the cross arm (fraction of half-size).',
            type: 'slider', min: 0.1, max: 1.2, step: 0.02, default: 0.7 },
        { key: 'armPos', label: 'Arm Position',
            description: 'Vertical center of the horizontal arm. 0 = centered (Greek cross); 0.3 = upper third (Latin).',
            type: 'slider', min: -0.5, max: 0.7, step: 0.02, default: 0.3 },
        { key: 'fill', label: 'Fill Opacity',
            description: 'Solid fill alpha. 0 = outline only.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 },
        { key: 'thickness', label: 'Outline Thickness',
            description: 'Stroke around the cross outline. 0 disables.',
            type: 'slider', min: 0, max: 6, step: 0.1, default: 1.2 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.5 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderCrossFrame
});
