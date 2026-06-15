/**
 * Heart — the iconic ❤️ symbol, drawn from the classic parametric heart
 * curve:
 *
 *   x(t) = 16 sin³(t)
 *   y(t) = 13 cos(t) − 5 cos(2t) − 2 cos(3t) − cos(4t)
 *
 * Sampled at HEART_SEGS points around t ∈ [0, 2π], normalized to fit in
 * unit local space and vertically centered. Each vertex runs through the
 * shared symbol3D transform/projection pipeline so the 3D rotation gizmo
 * works.
 *
 * Defaults are red on warm-pink — set tiltZ=180 for an upside-down heart,
 * cycY=1 for a slow "tumbling token" rotation, or pair with Light + Add
 * blend for a glowing magical heart.
 */
function renderHeartFrame(ctx, w, h, frameIdx, totalFrames, params) {
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
    const thickness = Math.max(0.5, minDim * 0.005 * params.thickness);

    // Sample the parametric heart curve. Normalization: max |x| = 16, y in
    // [-17, +11.6]. Divide by 17, shift vertical center up by 2.7/17 so the
    // visual center sits at local origin. After the symbol3D pipeline's
    // canvas-Y flip, the heart's bottom point (most negative y) ends up at
    // the bottom of the screen — which is what you want.
    const HEART_SEGS = 96;
    const NORM = 17;
    const Y_SHIFT = 2.7 / NORM;
    const heartPts = [];
    for (let k = 0; k <= HEART_SEGS; k++) {
        const u = (k / HEART_SEGS) * Math.PI * 2;
        const sinU = Math.sin(u);
        const xP = 16 * sinU * sinU * sinU;
        const yP = 13 * Math.cos(u) - 5 * Math.cos(2 * u) - 2 * Math.cos(3 * u) - Math.cos(4 * u);
        const lx = xP / NORM;
        const ly = yP / NORM + Y_SHIFT;
        heartPts.push(project(transform([lx, ly, 0])));
    }

    const buildPath = () => {
        ctx.beginPath();
        for (let k = 0; k < heartPts.length; k++) {
            const p = heartPts[k];
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
    };

    // 1. Optional outer ring around the heart (a circle just outside its
    //    bounding extent — works as a charm-locket frame).
    if (params.outerRing > 0.01) {
        const ringR = 1.05; // slightly bigger than the heart's natural extent
        const RING_SEGS = 64;
        const ringA = opacity * params.outerRing;
        const traceRing = () => {
            ctx.beginPath();
            for (let k = 0; k <= RING_SEGS; k++) {
                const a = (k / RING_SEGS) * Math.PI * 2;
                const p = project(transform([Math.cos(a) * ringR, Math.sin(a) * ringR, 0]));
                if (k === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
        };
        if (params.glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color2, ringA * 0.5 * params.glow);
            ctx.lineWidth = thickness * (2 + params.glow * 4);
            traceRing(); ctx.stroke();
        }
        ctx.strokeStyle = hexWithAlpha(color1, ringA);
        ctx.lineWidth = thickness;
        traceRing(); ctx.stroke();
    }

    // 2. Semi-transparent fill inside the heart.
    if (params.fill > 0.01) {
        ctx.fillStyle = hexWithAlpha(color2, opacity * params.fill);
        buildPath();
        ctx.fill();
    }

    // 3. Glow halo behind the outline (wide soft stroke).
    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.6);
        ctx.lineWidth = thickness * (2 + params.glow * 5);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        buildPath();
        ctx.stroke();
    }

    // 4. Main outline.
    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    buildPath();
    ctx.stroke();
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'heart',
    name:         'Heart',
    description:  'Classic ❤ shape from the parametric heart curve. Full 3D rotation, pulse, optional outer ring + fill + glow.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Outline Color', type: 'color', default: '#ff4060' },
        { key: 'color2', label: 'Glow / Fill Color', type: 'color', default: '#ffa0c0' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.2, max: 6, step: 0.1, default: 1.4 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6 },
        { key: 'fill', label: 'Fill Opacity',
            description: 'Semi-transparent fill inside the heart.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.3 },
        { key: 'outerRing', label: 'Outer Ring',
            description: 'Circle around the heart (locket / charm frame). 0 = hide.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderHeartFrame
});
