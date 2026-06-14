/**
 * Radioactive — ISO 21482 trefoil. Three wedge-shaped "blades" at 120°
 * spacing around a central disc. Each blade is bounded by two radial edges
 * from the central disc + an outer arc.
 *
 * Standard proportions (per ISO 21482):
 *   Inner disc radius ≈ R / 5 (configurable via centerSize).
 *   Each blade angular width = 60° (configurable via bladeWidth degrees).
 *   3 blades at 120° spacing → 60° gaps between blades.
 *
 * Geometry per blade (centered at angle θ):
 *   Vertex A = (centerR · cos(θ - α/2), centerR · sin(θ - α/2))
 *   Vertex B = (R · cos(θ - α/2),       R · sin(θ - α/2))
 *   Arc from angle (θ - α/2) to (θ + α/2) at radius R
 *   Vertex C = (R · cos(θ + α/2),       R · sin(θ + α/2))
 *   Vertex D = (centerR · cos(θ + α/2), centerR · sin(θ + α/2))
 *   Arc from (θ + α/2) back to (θ - α/2) at radius centerR
 */
function renderRadioactiveFrame(ctx, w, h, frameIdx, totalFrames, params) {
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
    const centerR = params.centerSize;
    const bladeAlpha = params.bladeWidth * Math.PI / 180;
    const bladeCount = Math.max(2, Math.round(params.bladeCount));
    const N = 24;  // samples per arc

    const tracePath = (pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x, pts[k].y);
            else ctx.lineTo(pts[k].x, pts[k].y);
        }
        ctx.closePath();
    };

    // Blades.
    for (let b = 0; b < bladeCount; b++) {
        const theta = Math.PI / 2 + b * 2 * Math.PI / bladeCount;
        const a0 = theta - bladeAlpha / 2;
        const a1 = theta + bladeAlpha / 2;
        const pts = [];
        // Outer arc from a0 to a1.
        for (let k = 0; k <= N; k++) {
            const a = a0 + (k / N) * bladeAlpha;
            pts.push(project(transform([Math.cos(a), Math.sin(a), 0])));
        }
        // Inner arc from a1 back to a0.
        for (let k = 0; k <= N; k++) {
            const a = a1 - (k / N) * bladeAlpha;
            pts.push(project(transform([centerR * Math.cos(a), centerR * Math.sin(a), 0])));
        }

        if (params.glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
            ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness) * (2 + params.glow * 5);
            ctx.lineJoin = 'round';
            tracePath(pts);
            ctx.stroke();
        }
        ctx.fillStyle = hexWithAlpha(color1, opacity);
        tracePath(pts);
        ctx.fill();
    }

    // Central disc.
    if (centerR > 0.01) {
        const center = [];
        for (let k = 0; k <= 48; k++) {
            const a = (k / 48) * Math.PI * 2;
            center.push(project(transform([centerR * Math.cos(a), centerR * Math.sin(a), 0])));
        }
        if (params.glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
            ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness) * (2 + params.glow * 5);
            tracePath(center);
            ctx.stroke();
        }
        ctx.fillStyle = hexWithAlpha(color1, opacity);
        tracePath(center);
        ctx.fill();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'radioactive',
    name:         'Radioactive',
    description:  'ISO 21482 trefoil — three blades around a central disc. Bump blade count for 4-/5-blade variants. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Body Color', type: 'color', default: '#ffd040' },
        { key: 'color2', label: 'Glow Color', type: 'color', default: '#ff8000' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'bladeCount', label: 'Blade Count',
            description: 'Number of blades around the center. 3 = classic trefoil.',
            type: 'slider', min: 2, max: 8, step: 1, default: 3 },
        { key: 'bladeWidth', label: 'Blade Width (deg)',
            description: 'Angular width of each blade. 60° = classic trefoil with equal gaps.',
            type: 'slider', min: 15, max: 90, step: 1, default: 60 },
        { key: 'centerSize', label: 'Center Disc',
            description: 'Radius of the central disc (fraction of outer radius).',
            type: 'slider', min: 0, max: 0.6, step: 0.02, default: 0.2 },
        { key: 'thickness', label: 'Outline Thickness', type: 'slider', min: 0, max: 4, step: 0.1, default: 0 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.4 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderRadioactiveFrame
});
