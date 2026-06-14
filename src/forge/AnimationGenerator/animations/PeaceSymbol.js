/**
 * Peace Symbol — outer circle with an internal "inverted Y": vertical
 * stroke through the center, plus two diagonals from the center to the
 * lower-left and lower-right where they meet the circle.
 *
 * Originally a semaphore composite (N + D, for Nuclear Disarmament) by
 * Gerald Holtom, 1958. Geometry has the diagonals at ±60° below
 * horizontal — adjustable via armAngle param.
 *
 * Geometry (unit local space, circle radius 1):
 *   - Outer circle stroke radius 1.
 *   - Vertical stroke from (0, +1) to (0, -1).
 *   - Left diagonal from (0, 0) to (cos(180 + armAngle), sin(180 + armAngle))
 *     mapped to the circle's lower-left intersection.
 *   - Right diagonal: mirror.
 */
function renderPeaceFrame(ctx, w, h, frameIdx, totalFrames, params) {
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

    // Diagonal lower endpoints on the circle.
    // armAngle: degrees BELOW horizontal (default 45°, classic). The arms
    // go from (0,0) down to (±cos(armAngle), -sin(armAngle)) ON the circle.
    const armRad = params.armAngle * Math.PI / 180;
    const dx = Math.cos(armRad);
    const dy = -Math.sin(armRad);

    // Sample the outer circle as a polyline so 3D rotation produces a
    // proper ellipse rather than a canvas arc with broken perspective.
    const N = 64;
    const circle = [];
    for (let k = 0; k <= N; k++) {
        const a = (k / N) * Math.PI * 2;
        circle.push(project(transform([Math.cos(a), Math.sin(a), 0])));
    }

    const segs = [
        [[0,  1, 0], [0, -1, 0]],         // vertical bar
        [[0, 0, 0], [-dx, dy, 0]],         // left diagonal
        [[0, 0, 0], [ dx, dy, 0]]          // right diagonal
    ].map(([a, b]) => [project(transform(a)), project(transform(b))]);

    const traceCircle = () => {
        ctx.beginPath();
        for (let k = 0; k < circle.length; k++) {
            if (k === 0) ctx.moveTo(circle[k].x, circle[k].y);
            else ctx.lineTo(circle[k].x, circle[k].y);
        }
        ctx.closePath();
    };
    const traceSegs = () => {
        ctx.beginPath();
        for (const [a, b] of segs) {
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        }
    };

    // Glow halo first.
    if (params.glow > 0.01) {
        const gw = thickness * (2 + params.glow * 5);
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.5);
        ctx.lineWidth = gw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        traceCircle(); ctx.stroke();
        traceSegs();   ctx.stroke();
    }

    // Optional fill of the disc (rare but available).
    if (params.fill > 0.01) {
        ctx.fillStyle = hexWithAlpha(color2, opacity * params.fill);
        traceCircle();
        ctx.fill();
    }

    // Main strokes.
    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    traceCircle(); ctx.stroke();
    traceSegs();   ctx.stroke();
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'peace',
    name:         'Peace Symbol',
    description:  'Holtom\'s 1958 nuclear disarmament symbol — circle with an inverted-Y inside. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Line Color', type: 'color', default: '#e8e8e8' },
        { key: 'color2', label: 'Glow / Fill Color', type: 'color', default: '#80c080' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'armAngle', label: 'Arm Angle',
            description: 'Angle (degrees below horizontal) of the two lower diagonals. 45° is the classic.',
            type: 'slider', min: 15, max: 75, step: 1, default: 45 },
        { key: 'thickness', label: 'Line Thickness', type: 'slider', min: 0.5, max: 8, step: 0.1, default: 2.5 },
        { key: 'fill', label: 'Disc Fill', type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.5 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderPeaceFrame
});
