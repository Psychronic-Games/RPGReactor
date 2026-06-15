/**
 * Target Lock Crosshair — animated targeting reticle. Outer rotating ring,
 * inner snapping brackets at top/right/bottom/left, center jittery dot,
 * scanning lines through the reticle, and an optional "LOCKED" pulse on
 * the outer ring.
 */
function renderTargetLockFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const bgColor = params.bgColor;
    const reticleColor = params.reticleColor;
    const scanColor = params.scanColor;
    const lockColor = params.lockColor;
    const opacity = params.opacity;
    const borderThick = Math.max(0.5, minDim * 0.003 * params.borderThickness);

    const proj = (x, y) => project(transform([x, y, 0]));
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
    const polyline = (pts, color, alpha, lw, closed) => {
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            const p = proj(pts[k][0], pts[k][1]);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        if (closed) ctx.closePath();
        ctx.stroke();
    };

    // Background tint (very faint disc behind the reticle).
    if (params.bgOpacity > 0.01) {
        const N = 64;
        const bgR = 1.0;
        const pts = [];
        for (let k = 0; k <= N; k++) {
            const a = (k / N) * Math.PI * 2;
            pts.push([bgR * Math.cos(a), bgR * Math.sin(a)]);
        }
        const projected = pts.map(([x, y]) => proj(x, y));
        ctx.fillStyle = hexWithAlpha(bgColor, opacity * params.bgOpacity);
        ctx.beginPath();
        for (let k = 0; k < projected.length; k++) {
            if (k === 0) ctx.moveTo(projected[k].x, projected[k].y);
            else ctx.lineTo(projected[k].x, projected[k].y);
        }
        ctx.closePath();
        ctx.fill();
    }

    // Lock cycle: 0..1 over the loop. At the "locked" phase, ring pulses.
    const lockCycles = Math.max(1, Math.round(params.lockCycles));
    const lockPhase = (t * lockCycles) % 1;
    // Lock acquisition: brackets snap inward from outer to target radius.
    // Phase 0..0.4 = scanning (brackets at outer), 0.4..0.6 = snapping in,
    // 0.6..1.0 = locked (brackets at target).
    let bracketR;
    let locked = false;
    if (lockPhase < 0.4) {
        bracketR = params.outerRadius;
    } else if (lockPhase < 0.6) {
        const u = (lockPhase - 0.4) / 0.2;
        const eased = 1 - Math.pow(1 - u, 2);
        bracketR = params.outerRadius * (1 - eased) + params.targetRadius * eased;
    } else {
        bracketR = params.targetRadius;
        locked = true;
    }

    // Outer ring — sampled circle.
    const ringN = 64;
    const drawCircle = (r, color, alpha, lw) => {
        const pts = [];
        for (let k = 0; k <= ringN; k++) {
            const a = (k / ringN) * Math.PI * 2;
            pts.push([r * Math.cos(a), r * Math.sin(a)]);
        }
        polyline(pts, color, alpha, lw, true);
    };
    // Pulse outer when locked.
    const lockedPulse = locked ? (0.6 + 0.4 * Math.sin(t * Math.PI * 2 * lockCycles * 6)) : 0;
    const outerCol = locked ? lockColor : reticleColor;
    drawCircle(params.outerRadius, outerCol, 1.0 - lockedPulse * 0.3, borderThick * (1.3 + lockedPulse * 0.6));

    // Inner target ring (the locked radius).
    drawCircle(params.targetRadius, reticleColor, 0.45, borderThick * 0.6);

    // Brackets at 4 cardinal positions, snapping inward.
    const bracketSize = params.bracketSize;
    const drawBracket = (angle) => {
        const c = Math.cos(angle), s = Math.sin(angle);
        // Corner at the bracket position.
        const cornerX = bracketR * c;
        const cornerY = bracketR * s;
        // Two arms of the bracket extend perpendicular to the radial direction.
        const px = -s, py = c;  // perpendicular
        const dx = -c, dy = -s; // inward
        const armLen = bracketSize;
        // Arm 1: along perpendicular axis
        const a1x = cornerX + px * armLen;
        const a1y = cornerY + py * armLen;
        // Arm 2: inward
        const a2x = cornerX + dx * armLen;
        const a2y = cornerY + dy * armLen;
        line(cornerX, cornerY, a1x, a1y, outerCol, locked ? 1.0 : 0.85, borderThick * 1.4);
        line(cornerX, cornerY, a2x, a2y, outerCol, locked ? 1.0 : 0.85, borderThick * 1.4);
        // Second bracket arm pair (mirrored, creating an L on each side).
        const a3x = cornerX - px * armLen;
        const a3y = cornerY - py * armLen;
        line(cornerX, cornerY, a3x, a3y, outerCol, locked ? 1.0 : 0.85, borderThick * 1.4);
    };
    for (let i = 0; i < 4; i++) {
        drawBracket(i * Math.PI / 2);
    }

    // Crosshair lines (4 ticks pointing inward from outer to inner ring).
    if (params.crosshair > 0.01) {
        const tickIn = params.targetRadius * 1.05;
        const tickOut = params.outerRadius * 0.9;
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            const c = Math.cos(a), s = Math.sin(a);
            line(tickIn * c, tickIn * s, tickOut * c, tickOut * s,
                reticleColor, params.crosshair * 0.7, borderThick * 0.7);
        }
    }

    // Scanning line — single radial line rotating around center.
    if (params.scanLines > 0) {
        const scanCount = Math.max(1, Math.round(params.scanLines));
        const scanCycles = Math.max(1, Math.round(params.scanCycles));
        const scanAng = t * scanCycles * Math.PI * 2;
        for (let i = 0; i < scanCount; i++) {
            const a = scanAng + i * 2 * Math.PI / scanCount;
            line(0, 0, params.targetRadius * 0.95 * Math.cos(a), params.targetRadius * 0.95 * Math.sin(a),
                scanColor, 0.85, borderThick * 0.8);
        }
    }

    // Center dot with jitter.
    const jitterAmp = params.targetJitter * 0.04;
    const jitterX = jitterAmp * Math.sin(t * Math.PI * 2 * 11);
    const jitterY = jitterAmp * Math.cos(t * Math.PI * 2 * 13);
    dot(jitterX, jitterY, borderThick * (1.5 + (locked ? 0.5 : 0)),
        locked ? lockColor : reticleColor, 1.0);

    // Center small ring around the dot for emphasis.
    drawCircle(borderThick / minDim * 4, locked ? lockColor : reticleColor, 0.7, borderThick * 0.5);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'targetlock',
    name:         'Target Lock',
    description:  'Animated targeting reticle. Brackets snap inward to acquire the target, then pulse when locked. Optional rotating scan lines + jittery center.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'bgColor', label: 'Background Tint', type: 'color', default: '#000010', randomColorRole: 'bg' },
        { key: 'reticleColor', label: 'Reticle', type: 'color', default: '#40d0ff', randomColorRole: 'fg' },
        { key: 'scanColor', label: 'Scan Lines', type: 'color', default: '#80ffe0', randomColorRole: 'fg' },
        { key: 'lockColor', label: 'Locked', type: 'color', default: '#ff4040', randomColorRole: 'fg' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'outerRadius', label: 'Outer Radius',
            description: 'Outer ring radius.',
            type: 'slider', min: 0.3, max: 1.0, step: 0.02, default: 0.85 },
        { key: 'targetRadius', label: 'Target Radius',
            description: 'Inner ring where brackets snap to when locked.',
            type: 'slider', min: 0.1, max: 0.8, step: 0.02, default: 0.35 },
        { key: 'bracketSize', label: 'Bracket Size',
            description: 'Length of the L-shaped bracket arms.',
            type: 'slider', min: 0.05, max: 0.4, step: 0.01, default: 0.18 },
        { key: 'lockCycles', label: 'Lock Cycles',
            description: 'How many acquire/lock/release cycles complete per loop.',
            type: 'slider', min: 1, max: 6, step: 1, default: 1 },
        { key: 'scanLines', label: 'Scan Lines',
            description: 'Number of radial scan lines rotating inside the inner ring. 0 = none.',
            type: 'slider', min: 0, max: 6, step: 1, default: 2 },
        { key: 'scanCycles', label: 'Scan Speed',
            description: 'How many rotations the scan lines complete per loop.',
            type: 'slider', min: 1, max: 12, step: 1, default: 4 },
        { key: 'targetJitter', label: 'Target Jitter',
            description: 'How much the center dot wobbles. 0 = locked-on still; 1 = unstable.',
            type: 'slider', min: 0, max: 2, step: 0.05, default: 0.5 },
        { key: 'crosshair', label: 'Crosshair Ticks',
            description: 'Brightness of the 4 short ticks pointing inward from the outer ring. 0 = no ticks.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.6 },
        { key: 'bgOpacity', label: 'Backdrop Opacity',
            description: 'Tinted disc behind the reticle. 0 = reticle floats over scene.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.2 },
        { key: 'borderThickness', label: 'Line Thickness', type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.2 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderTargetLockFrame
});
