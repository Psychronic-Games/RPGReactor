/**
 * Euro Sign — the € symbol. A "C" arc opening to the right with two
 * horizontal bars crossing through the middle. All paths run through the
 * symbol3D pipeline for 3D rotation.
 *
 * The C is a 300° arc (60° gap on the right for the opening); the bars
 * extend slightly past the C on the left and stop just inside the
 * opening on the right.
 */
function renderEuroSignFrame(ctx, w, h, frameIdx, totalFrames, params) {
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

    // C arc: from angle π/6 (upper opening) CCW to 11π/6 (lower opening),
    // sampled as polyline.
    const RING_R = 0.8;
    const A_START =  Math.PI / 6;
    const A_END   = 2 * Math.PI - Math.PI / 6;  // 11π/6 (≈ 330°)
    const C_SEGS = 40;

    const buildC = () => {
        ctx.beginPath();
        for (let k = 0; k <= C_SEGS; k++) {
            const a = A_START + (k / C_SEGS) * (A_END - A_START);
            const p = proj3(Math.cos(a) * RING_R, Math.sin(a) * RING_R);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
    };
    // Two horizontal bars. They extend past the C on the left and stop
    // just inside the opening on the right.
    const buildBar = (y) => {
        const left  = proj3(-RING_R - 0.05, y);
        const right = proj3( RING_R - 0.15, y);
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (params.glow > 0.01) {
        const gw = thickness * (2 + params.glow * 5);
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = gw;
        buildC();           ctx.stroke();
        buildBar( 0.18);    ctx.stroke();
        buildBar(-0.18);    ctx.stroke();
    }

    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    buildC();           ctx.stroke();
    buildBar( 0.18);    ctx.stroke();
    buildBar(-0.18);    ctx.stroke();
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'eurosign',
    name:         'Euro Sign',
    description:  'The € symbol — C-arc with two horizontal bars. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Stroke Color', type: 'color', default: '#4080ff' },
        { key: 'color2', label: 'Glow Color',   type: 'color', default: '#80c0ff' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.3, max: 6, step: 0.1, default: 1.8 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.45 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderEuroSignFrame
});
