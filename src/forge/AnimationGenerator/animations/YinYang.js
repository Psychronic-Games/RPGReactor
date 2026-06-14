/**
 * Yin/Yang — the taijitu symbol. A circle divided by an S-curve into two
 * interlocking teardrops, each containing a small dot of the opposite color.
 * Full 3D rotation through the shared symbol3D pipeline.
 *
 * Geometry (in unit local space, main radius = 1):
 *   - Main circle radius 1 centered at origin.
 *   - Two "small" circles radius 1/2, centered at (0, ±1/2).
 *   - Divider path: top of main → right half of upper small → (0,0) →
 *     left half of lower small → bottom of main. This splits the disc
 *     into the two teardrops.
 *   - Two dots radius (dotSize × 1/6) centered at (0, ±1/2).
 *
 * Depends on:
 *   hexWithAlpha                                (helpers/color.js)
 *   makeSymbol3DTransform, SYMBOL3D_*_PARAMS    (helpers/symbol3D.js)
 *   RR_ANIMATION_REGISTRY                       (registry.js)
 */
function renderYinYangFrame(ctx, w, h, frameIdx, totalFrames, params) {
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
    const N = 64;

    // Sample helper — projects a sequence of local (x,y) points (z=0).
    const samplePath = (sampler, segs) => {
        const pts = [];
        for (let k = 0; k <= segs; k++) {
            const [x, y] = sampler(k / segs);
            pts.push(project(transform([x, y, 0])));
        }
        return pts;
    };

    // Full main circle (used for background white fill and outline).
    const mainCircle = samplePath(
        (s) => [Math.cos(s * Math.PI * 2), Math.sin(s * Math.PI * 2)],
        N
    );

    // Yin (color2) region boundary, traced as one connected loop:
    //   1. Right semi of main: top (0,1) → through (1,0) → bottom (0,-1).
    //   2. Left half of LOWER small (center (0,-1/2)): bottom (0,-1) →
    //      through (-1/2,-1/2) → center (0,0).
    //   3. Right half of UPPER small (center (0,+1/2)): center (0,0) →
    //      through (1/2,1/2) → top (0,1).
    const yin = [];
    // 1. Right semi (angle π/2 → -π/2 through 0).
    for (let k = 0; k <= N; k++) {
        const s = k / N;
        const a = Math.PI / 2 - s * Math.PI;
        yin.push(project(transform([Math.cos(a), Math.sin(a), 0])));
    }
    // 2. Lower small, left half (angle -π/2 → -3π/2 through -π).
    for (let k = 1; k <= N; k++) {
        const s = k / N;
        const a = -Math.PI / 2 - s * Math.PI;
        yin.push(project(transform([0.5 * Math.cos(a), -0.5 + 0.5 * Math.sin(a), 0])));
    }
    // 3. Upper small, right half (angle -π/2 → π/2 through 0).
    for (let k = 1; k <= N; k++) {
        const s = k / N;
        const a = -Math.PI / 2 + s * Math.PI;
        yin.push(project(transform([0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a), 0])));
    }

    const tracePolyline = (pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x, pts[k].y);
            else ctx.lineTo(pts[k].x, pts[k].y);
        }
        ctx.closePath();
    };

    // 1. Yang (color1) — fill the whole disc first.
    ctx.fillStyle = hexWithAlpha(color1, opacity);
    tracePolyline(mainCircle);
    ctx.fill();

    // 2. Yin (color2) — fill the divider-bounded region on top.
    ctx.fillStyle = hexWithAlpha(color2, opacity);
    tracePolyline(yin);
    ctx.fill();

    // 3. Dots: yang dot inside the yin bulge (upper small center), yin dot
    //    inside the yang bulge (lower small center).
    const dotR = params.dotSize * 0.16;
    if (dotR > 0.01) {
        const drawDot = (cxLocal, cyLocal, color) => {
            const pts = samplePath(
                (s) => [cxLocal + dotR * Math.cos(s * Math.PI * 2),
                        cyLocal + dotR * Math.sin(s * Math.PI * 2)],
                32
            );
            ctx.fillStyle = hexWithAlpha(color, opacity);
            tracePolyline(pts);
            ctx.fill();
        };
        drawDot(0,  0.5, color1); // yang dot inside the (upper) yin bulge
        drawDot(0, -0.5, color2); // yin dot inside the (lower) yang bulge
    }

    // 4. Optional outline stroke around the full disc.
    if (params.thickness > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity);
        ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness);
        tracePolyline(mainCircle);
        ctx.stroke();
    }

    // 5. Glow halo behind everything.
    if (params.glow > 0.01) {
        const p = project(transform([0, 0, 0]));
        const r = Math.max(...mainCircle.map(pt => Math.hypot(pt.x - p.x, pt.y - p.y)));
        const halo = ctx.createRadialGradient(p.x, p.y, r * 0.7, p.x, p.y, r * (1 + params.glow));
        halo.addColorStop(0, hexWithAlpha(color1, opacity * params.glow * 0.5));
        halo.addColorStop(1, hexWithAlpha(color1, 0));
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * (1 + params.glow), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'yinyang',
    name:         'Yin Yang',
    description:  'The taijitu — a disc divided by an S-curve into two interlocking teardrops with opposite-colored dots in each. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Yang (Light)', type: 'color', default: '#f8f4e0' },
        { key: 'color2', label: 'Yin (Dark)',   type: 'color', default: '#1a1820' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'dotSize', label: 'Dot Size',
            description: 'Relative size of the two small dots (1 ≈ classic 1/6 of main radius). 0 hides them.',
            type: 'slider', min: 0, max: 2, step: 0.05, default: 1.0 },
        { key: 'thickness', label: 'Outline Thickness',
            description: 'Stroke around the full disc. 0 disables.',
            type: 'slider', min: 0, max: 4, step: 0.1, default: 0.8 },
        { key: 'glow', label: 'Glow',
            description: 'Soft halo around the disc.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.3 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderYinYangFrame
});
