/**
 * Yen Sign — the ¥ symbol. A capital-Y shape (two upper diagonals + a
 * vertical descender from the junction) with two short horizontal bars
 * crossing the descender. All strokes project through the symbol3D
 * pipeline so 3D rotation works.
 */
function renderYenSignFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );
    const proj3 = (lx, ly) => project(transform([lx, ly, 0]));

    const color1 = params.color1;
    const color2 = params.color2;
    const opacity = params.opacity;
    const thickness = Math.max(0.5, minDim * 0.007 * params.thickness);

    // Y diagonals meet at the junction (0, 0.1). Descender goes from
    // junction to (0, -0.85). Two horizontal bars cross the descender.
    const JUNCTION_Y = 0.1;
    const segs = [
        // Upper-left diagonal.
        [[-0.55, 0.85], [0, JUNCTION_Y]],
        // Upper-right diagonal.
        [[ 0.55, 0.85], [0, JUNCTION_Y]],
        // Vertical descender.
        [[0, JUNCTION_Y], [0, -0.85]],
        // Upper crossbar.
        [[-0.50, -0.10], [ 0.50, -0.10]],
        // Lower crossbar.
        [[-0.50, -0.38], [ 0.50, -0.38]]
    ];

    const buildSegs = () => {
        ctx.beginPath();
        for (const [a, b] of segs) {
            const pa = proj3(a[0], a[1]);
            const pb = proj3(b[0], b[1]);
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
        }
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (params.glow > 0.01) {
        const gw = thickness * (2 + params.glow * 5);
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = gw;
        buildSegs(); ctx.stroke();
    }

    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    buildSegs(); ctx.stroke();
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'yensign',
    name:         'Yen Sign',
    description:  'The ¥ symbol — Y diagonals + vertical descender + two crossbars. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Stroke Color', type: 'color', default: '#ffd060' },
        { key: 'color2', label: 'Glow Color',   type: 'color', default: '#ff8040' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.3, max: 6, step: 0.1, default: 1.8 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.45 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderYenSignFrame
});
