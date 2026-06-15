/**
 * Crescent and Star — the hilal motif used on flags of many Muslim-majority
 * nations. A filled crescent (outer arc + inner arc with the inner circle
 * offset toward the opening) plus a filled 5-pointed star inside the
 * crescent's opening. Full 3D rotation.
 *
 * Crescent geometry (unit local space):
 *   Outer circle: center (0,0), radius 1.
 *   Inner circle: center (offset, 0), radius innerR (= 1 - thinness).
 *   The crescent opens to the right (+X direction).
 *
 * Star geometry:
 *   Filled 5-point star (10-vertex polygon) centered at
 *   (offset + innerR + starGap, 0), scaled to starSize.
 */
function renderCrescentStarFrame(ctx, w, h, frameIdx, totalFrames, params) {
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

    // ─── Crescent ─────────────────────────────────────────────────────────
    // Choose innerR + offset so the inner circle intersects the outer.
    // thinness 0 → crescent is full circle (no bite); 1 → very thin crescent.
    const thinness = params.thinness;
    const innerR = 1 - thinness * 0.55;   // shrink inner as thinness grows
    const offset = thinness * 0.55;       // shift inner toward +X
    // Intersection: x_int = (1 - innerR² + offset²) / (2 offset)
    let crescentPath = [];
    if (offset > 0.01) {
        const xInt = (1 - innerR * innerR + offset * offset) / (2 * offset);
        const xIntClamped = Math.max(-1, Math.min(1, xInt));
        const yInt = Math.sqrt(Math.max(0, 1 - xIntClamped * xIntClamped));
        const aOuterTop = Math.atan2(yInt, xIntClamped);
        const aInnerTop = Math.atan2(yInt, xIntClamped - offset);
        const N = 64;
        // Outer arc: CCW from top intersection through LEFT (angle π) to
        // bottom intersection. Span: 2π - 2·aOuterTop.
        for (let k = 0; k <= N; k++) {
            const s = k / N;
            const a = aOuterTop + s * (2 * Math.PI - 2 * aOuterTop);
            crescentPath.push(project(transform([Math.cos(a), Math.sin(a), 0])));
        }
        // Inner arc: CW from bottom intersection back to top, going through
        // the LEFT of the inner circle (which is the right boundary of the
        // crescent shape).
        for (let k = 1; k <= N; k++) {
            const s = k / N;
            const a = -aInnerTop - s * (2 * Math.PI - 2 * aInnerTop);
            const x = offset + innerR * Math.cos(a);
            const y = innerR * Math.sin(a);
            crescentPath.push(project(transform([x, y, 0])));
        }
    } else {
        // Degenerate (offset=0) → just trace the outer circle.
        const N = 96;
        for (let k = 0; k <= N; k++) {
            const a = (k / N) * Math.PI * 2;
            crescentPath.push(project(transform([Math.cos(a), Math.sin(a), 0])));
        }
    }

    const traceClosed = (pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x, pts[k].y);
            else ctx.lineTo(pts[k].x, pts[k].y);
        }
        ctx.closePath();
    };

    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness) * (2 + params.glow * 5);
        ctx.lineJoin = 'round';
        traceClosed(crescentPath);
        ctx.stroke();
    }
    ctx.fillStyle = hexWithAlpha(color1, opacity);
    traceClosed(crescentPath);
    ctx.fill();

    // ─── 5-Point Star ─────────────────────────────────────────────────────
    // Filled 10-vertex polygon (5 outer points + 5 inner concave points).
    const starSize = params.starSize * 0.32;
    const starCenterX = offset + innerR * 0.6;  // nestled inside crescent
    if (params.starOpacity > 0.01 && starSize > 0.01) {
        const starOuter = starSize;
        const starInner = starSize / 2.618;   // 1/φ² for classic star sharpness
        const starVerts = [];
        for (let i = 0; i < 10; i++) {
            const a = Math.PI / 2 + i * Math.PI / 5;
            const r = (i % 2 === 0) ? starOuter : starInner;
            const x = starCenterX + r * Math.cos(a);
            const y = r * Math.sin(a);
            starVerts.push(project(transform([x, y, 0])));
        }
        starVerts.push(starVerts[0]);

        if (params.glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color2, opacity * params.starOpacity * params.glow * 0.5);
            ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness) * (2 + params.glow * 4);
            ctx.lineJoin = 'round';
            traceClosed(starVerts);
            ctx.stroke();
        }
        ctx.fillStyle = hexWithAlpha(color1, opacity * params.starOpacity);
        traceClosed(starVerts);
        ctx.fill();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'crescentstar',
    name:         'Crescent and Star',
    description:  'Hilal — a filled crescent moon plus a 5-pointed star in the opening. Used on flags of many Muslim-majority nations. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Body Color', type: 'color', default: '#f8f8f8' },
        { key: 'color2', label: 'Glow Color', type: 'color', default: '#80b0d0' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thinness', label: 'Crescent Thinness',
            description: 'How thin the crescent is. 0 = full circle, near 1 = very thin sliver opening to the right.',
            type: 'slider', min: 0.2, max: 0.95, step: 0.02, default: 0.55 },
        { key: 'starSize', label: 'Star Size',
            description: 'Size of the 5-point star (relative). 0 hides the star.',
            type: 'slider', min: 0, max: 2, step: 0.05, default: 1.0 },
        { key: 'starOpacity', label: 'Star Opacity',
            description: 'Independent opacity for the star (separate from overall opacity).',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 },
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.2, max: 6, step: 0.1, default: 1.0 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.4 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderCrescentStarFrame
});
