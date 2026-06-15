/**
 * Dollar Sign — the $ symbol. Vertical bar through the middle of an
 * S-shaped curve, both stroked through the symbol3D pipeline so the whole
 * thing rotates / tilts via the 3D gizmo.
 *
 * The S curve is sampled from a hand-crafted polyline; the vertical bar
 * extends slightly above and below the S body, matching how the glyph
 * is drawn in most typefaces.
 */
function renderDollarSignFrame(ctx, w, h, frameIdx, totalFrames, params) {
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

    // The S is two 270° arcs of equal radius — upper bowl swept CCW, lower
    // bowl swept CW — meeting tangentially at the origin so the join is
    // perfectly smooth. Sampling 32 points per bowl gives a true curve, not
    // a kinked polyline.
    const BOWL_R  = 0.36;
    const BOWL_Y  = 0.36;          // upper center; lower mirrored
    const N_BOWL  = 32;
    const TWO_PI_270 = 3 * Math.PI / 2;

    const buildS = () => {
        ctx.beginPath();
        // Upper bowl: center (0, +BOWL_Y), 270° CCW from angle 0 to 3π/2.
        // Start at mid-right of the bowl with tangent pointing UP → reads
        // as the natural "entering the top of the S" feel.
        for (let k = 0; k <= N_BOWL; k++) {
            const a = (k / N_BOWL) * TWO_PI_270;
            const lx = BOWL_R * Math.cos(a);
            const ly = BOWL_Y + BOWL_R * Math.sin(a);
            const p = proj3(lx, ly);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        // Lower bowl: center (0, -BOWL_Y), 270° CW from angle π/2 to -π.
        // Mirror of upper — joins at origin tangentially.
        for (let k = 1; k <= N_BOWL; k++) {
            const a = Math.PI / 2 - (k / N_BOWL) * TWO_PI_270;
            const lx = BOWL_R * Math.cos(a);
            const ly = -BOWL_Y + BOWL_R * Math.sin(a);
            const p = proj3(lx, ly);
            ctx.lineTo(p.x, p.y);
        }
    };
    const buildBar = () => {
        const top = proj3(0,  0.96);
        const bot = proj3(0, -0.96);
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(bot.x, bot.y);
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Glow halo behind.
    if (params.glow > 0.01) {
        const gw = thickness * (2 + params.glow * 5);
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = gw;
        buildBar(); ctx.stroke();
        buildS();   ctx.stroke();
    }

    // Main strokes.
    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    buildBar(); ctx.stroke();
    buildS();   ctx.stroke();
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'dollarsign',
    name:         'Dollar Sign',
    description:  'The $ symbol — S-curve with a vertical bar through it. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Stroke Color', type: 'color', default: '#60ff80' },
        { key: 'color2', label: 'Glow Color',   type: 'color', default: '#40c060' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.3, max: 6, step: 0.1, default: 1.8 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.45 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderDollarSignFrame
});
