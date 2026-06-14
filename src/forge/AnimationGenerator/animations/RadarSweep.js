/**
 * Radar Sweep — circular radar display with a rotating sweep line revealing
 * blip dots as it passes them. Blips fade after being illuminated.
 * Range rings + cardinal markings + center pip + cone-shaped sweep
 * gradient.
 */
function renderRadarSweepFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const bgColor = params.bgColor;
    const ringColor = params.ringColor;
    const sweepColor = params.sweepColor;
    const blipColor = params.blipColor;
    const enemyColor = params.enemyColor;
    const opacity = params.opacity;
    const borderThick = Math.max(0.5, minDim * 0.003 * params.borderThickness);

    const proj = (x, y) => project(transform([x, y, 0]));

    const N = 96;
    // Sample a circle of radius r as a polyline.
    const circlePoints = (r) => {
        const pts = [];
        for (let k = 0; k <= N; k++) {
            const a = (k / N) * Math.PI * 2;
            pts.push(proj(r * Math.cos(a), r * Math.sin(a)));
        }
        return pts;
    };
    const traceClosed = (pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x, pts[k].y);
            else ctx.lineTo(pts[k].x, pts[k].y);
        }
        ctx.closePath();
    };
    const line = (x0, y0, x1, y1, color, alpha, lw) => {
        const p0 = proj(x0, y0), p1 = proj(x1, y1);
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
    };
    const dot = (x, y, r, color, alpha) => {
        const p = proj(x, y);
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    };

    // 1. Background disc.
    const outer = circlePoints(1.0);
    ctx.fillStyle = hexWithAlpha(bgColor, opacity);
    traceClosed(outer);
    ctx.fill();

    // 2. Range rings.
    const rings = Math.max(2, Math.round(params.rangeRings));
    for (let r = 1; r <= rings; r++) {
        const radius = r / rings;
        const pts = circlePoints(radius);
        ctx.strokeStyle = hexWithAlpha(ringColor, opacity * 0.35);
        ctx.lineWidth = borderThick * 0.5;
        traceClosed(pts);
        ctx.stroke();
    }
    // Outer ring (full strength).
    ctx.strokeStyle = hexWithAlpha(ringColor, opacity);
    ctx.lineWidth = borderThick * 1.3;
    traceClosed(outer);
    ctx.stroke();

    // 3. Cardinal cross (N-S, E-W) + diagonal.
    const cardAlpha = 0.3;
    line(-1, 0, 1, 0, ringColor, cardAlpha, borderThick * 0.4);
    line(0, -1, 0, 1, ringColor, cardAlpha, borderThick * 0.4);
    if (params.diagonals > 0.5) {
        const k = Math.SQRT1_2;
        line(-k, -k, k, k, ringColor, cardAlpha * 0.7, borderThick * 0.3);
        line(-k,  k, k, -k, ringColor, cardAlpha * 0.7, borderThick * 0.3);
    }

    // 4. Sweep — rotating wedge from center.
    const sweepCycles = Math.max(1, Math.round(params.sweepCycles));
    const sweepAngle = t * sweepCycles * Math.PI * 2;
    const sweepArc = params.sweepArc * Math.PI / 180;  // total wedge angular width
    const SWEEP_SEGS = 24;
    {
        const pts = [proj(0, 0)];
        for (let k = 0; k <= SWEEP_SEGS; k++) {
            const a = sweepAngle - sweepArc + (k / SWEEP_SEGS) * sweepArc;
            pts.push(proj(Math.cos(a), Math.sin(a)));
        }
        // Fill wedge with a gradient that's brighter at the leading edge.
        // We use a transparent-to-bright sweep via fillStyle per segment.
        for (let k = 0; k < SWEEP_SEGS; k++) {
            // Brightness peaks at the trailing edge (k=SWEEP_SEGS-1).
            const u = k / SWEEP_SEGS;
            const a = opacity * 0.5 * Math.pow(u, 1.8);
            ctx.fillStyle = hexWithAlpha(sweepColor, a);
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            ctx.lineTo(pts[1 + k].x, pts[1 + k].y);
            ctx.lineTo(pts[2 + k].x, pts[2 + k].y);
            ctx.closePath();
            ctx.fill();
        }
        // Leading edge line (brightest).
        const leadA = sweepAngle;
        line(0, 0, Math.cos(leadA), Math.sin(leadA), sweepColor, 1.0, borderThick * 1.0);
    }

    // 5. Blips — deterministic per-blip positions, fade after being swept.
    const blipCount = Math.max(0, Math.round(params.blipCount));
    for (let i = 0; i < blipCount; i++) {
        const sA = Math.sin(i * 12.9898) * 43758.5; const rA = sA - Math.floor(sA);
        const sB = Math.sin(i * 78.233)  * 43758.5; const rB = sB - Math.floor(sB);
        const sC = Math.sin(i * 39.346)  * 43758.5; const rC = sC - Math.floor(sC);
        const blipAng = rA * Math.PI * 2;
        const blipR = 0.15 + 0.75 * rB;
        // How long ago was this blip swept? Compare blip angle to sweep angle.
        const angDiff = ((sweepAngle - blipAng) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        // Brightness: peaks right after sweep passes, decays over the rest of the rotation.
        const sweepCycleT = angDiff / (Math.PI * 2);
        const brightness = Math.pow(1 - sweepCycleT, 2.5);
        if (brightness < 0.05) continue;
        const isEnemy = rC > 0.75;
        const col = isEnemy ? enemyColor : blipColor;
        const blipX = blipR * Math.cos(blipAng);
        const blipY = blipR * Math.sin(blipAng);
        const dotR = minDim * 0.008 * (0.7 + rC * 0.7);
        dot(blipX, blipY, dotR, col, brightness);
        // Outer halo for bright blips.
        dot(blipX, blipY, dotR * 2.2, col, brightness * 0.3);
    }

    // 6. Center pip.
    dot(0, 0, borderThick * 1.5, ringColor, 1.0);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'radarsweep',
    name:         'Radar Sweep',
    description:  'Circular radar with rotating sweep line + range rings + blips that fade after the sweep passes. Hostile contacts in enemy color.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'bgColor', label: 'Background', type: 'color', default: '#03100a', randomColorRole: 'bg' },
        { key: 'ringColor', label: 'Rings / Grid', type: 'color', default: '#40b070', randomColorRole: 'fg' },
        { key: 'sweepColor', label: 'Sweep', type: 'color', default: '#80ff80', randomColorRole: 'fg' },
        { key: 'blipColor', label: 'Blips', type: 'color', default: '#a0ffd0', randomColorRole: 'fg' },
        { key: 'enemyColor', label: 'Hostile Blips', type: 'color', default: '#ff5050', randomColorRole: 'fg' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.75 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'sweepCycles', label: 'Sweep Cycles',
            description: 'How many full sweep rotations per loop. Integer for seamless loop.',
            type: 'slider', min: 1, max: 6, step: 1, default: 1 },
        { key: 'sweepArc', label: 'Sweep Arc (deg)',
            description: 'Angular width of the rotating sweep wedge. 20° = thin laser, 90° = quarter-disc wash.',
            type: 'slider', min: 10, max: 120, step: 2, default: 45 },
        { key: 'rangeRings', label: 'Range Rings',
            description: 'Number of concentric range rings.',
            type: 'slider', min: 1, max: 8, step: 1, default: 4 },
        { key: 'diagonals', label: 'Diagonal Cross',
            description: '1 = show 45°/135° diagonal cross lines; 0 = cardinal-only.',
            type: 'slider', min: 0, max: 1, step: 1, default: 1 },
        { key: 'blipCount', label: 'Blip Count',
            description: 'Number of contact blips on the radar.',
            type: 'slider', min: 0, max: 40, step: 1, default: 12 },
        { key: 'borderThickness', label: 'Line Thickness', type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.2 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderRadarSweepFrame
});
