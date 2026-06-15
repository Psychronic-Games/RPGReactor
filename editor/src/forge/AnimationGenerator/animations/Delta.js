/**
 * Delta — USSF-style delta emblem. An outer triangle (the delta) with a
 * 4-vertex inner shape that has a chevron-style v-notch at the bottom,
 * plus a small 4-point star in the lower interior. Same visual language
 * as the US Space Force logo.
 *
 * Geometry derived from the USSF SVG (viewBox 99.2 × 148.75 → unit local
 * space centered at the geometric center of the triangle):
 *
 *   Outer triangle:
 *     Top apex   (0.000, +1.000)
 *     Bot-left   (-0.667, -1.000)
 *     Bot-right  (+0.667, -1.000)
 *
 *   Inner chevron (4 vertices traced in order):
 *     Top        (0.000, +0.826)
 *     Bot-left   (-0.567, -0.875)
 *     Notch      (0.000, -0.535)   ← chevron point lifts toward apex
 *     Bot-right  (+0.567, -0.875)
 *
 *   4-point star at (0, -0.28), outer radius 0.118, inner radius 0.038.
 *
 * Runs through the shared symbol3D pipeline so 3D rotation + gizmo +
 * pulse all apply.
 */
function renderDeltaFrame(ctx, w, h, frameIdx, totalFrames, params) {
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
    const thickness = Math.max(0.5, minDim * 0.005 * params.thickness);

    // Outer triangle (delta) — now also has a v-notch at the bottom that
    // matches the inner chevron's upward curve. Both notch depths scale
    // off the same `notchDepth` slider (0 = flat base; 1 = full SVG-spec
    // notch positions). The outer notch lands at y ≈ -0.598 per the
    // USSF SVG (60% up from the base of the outer triangle).
    const outerBaseY = -1.000;
    const outerNotchYFull = -0.598;
    const outerNotchY = outerBaseY + params.notchDepth * (outerNotchYFull - outerBaseY);
    const OUTER = [
        [ 0.000,  1.000],         // outer apex
        [-0.667, -1.000],         // outer bot-left
        [ 0.000, outerNotchY],    // outer v-notch (curves UP)
        [ 0.667, -1.000]          // outer bot-right
    ];

    // Inner v-notch chevron. innerScale scales the whole inner shape
    // uniformly; notchDepth controls the inner notch position the same
    // way as the outer one.
    const innerScale = params.innerScale;
    const baseY = -0.875 * innerScale;
    const notchYFull = -0.535 * innerScale;
    const notchY = baseY + params.notchDepth * (notchYFull - baseY);
    const INNER = [
        [ 0.000,  0.826 * innerScale],   // inner apex
        [-0.567 * innerScale, baseY],     // inner bot-left
        [ 0.000, notchY],                 // inner chevron notch
        [ 0.567 * innerScale, baseY]      // inner bot-right
    ];

    // 4-point star — alternating outer/inner radii at 8 positions around
    // its own center. Outer points point up/down/left/right; inner
    // concave dimples between them.
    const starCy = params.starY;
    const starOuter = params.starSize * 0.118;
    const starInner = starOuter * 0.32;
    const STAR_PTS = [];
    for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
        const r = (i % 2 === 0) ? starOuter : starInner;
        STAR_PTS.push([Math.cos(a) * r, starCy + Math.sin(a) * r]);
    }

    // Path helpers.
    const tracePoly = (pts, close) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            const p = proj3(pts[k][0], pts[k][1]);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        if (close) ctx.closePath();
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Glow halo behind everything.
    if (params.glow > 0.01) {
        const gw = thickness * (2 + params.glow * 5);
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = gw;
        tracePoly(OUTER, true); ctx.stroke();
        if (params.innerVisible > 0.01) {
            tracePoly(INNER, true); ctx.stroke();
        }
        if (starOuter > 0.005) {
            tracePoly(STAR_PTS, true); ctx.stroke();
        }
    }

    // 2. "Frame" fill — area between outer triangle and inner chevron via
    //    even-odd. Gives the delta its signature solid-with-chevron-hole look.
    if (params.fill > 0.01) {
        ctx.fillStyle = hexWithAlpha(color2, opacity * params.fill);
        ctx.beginPath();
        // Outer triangle
        for (let k = 0; k < OUTER.length; k++) {
            const p = proj3(OUTER[k][0], OUTER[k][1]);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        if (params.innerVisible > 0.01) {
            for (let k = 0; k < INNER.length; k++) {
                const p = proj3(INNER[k][0], INNER[k][1]);
                if (k === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
        }
        ctx.fill('evenodd');
    }

    // 3. Outer triangle stroke.
    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    tracePoly(OUTER, true); ctx.stroke();

    // 4. Inner chevron stroke.
    if (params.innerVisible > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color1, opacity * params.innerVisible);
        ctx.lineWidth = thickness * 0.85;
        tracePoly(INNER, true); ctx.stroke();
    }

    // 5. 4-point star, filled with the stroke color.
    if (starOuter > 0.005) {
        ctx.fillStyle = hexWithAlpha(color1, opacity);
        tracePoly(STAR_PTS, true);
        ctx.fill();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'delta',
    name:         'Delta',
    description:  'USSF-style delta emblem — outer triangle, inner chevron with v-notch, and a 4-point star in the lower interior. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Stroke / Star Color', type: 'color', default: '#ffd860' },
        { key: 'color2', label: 'Glow / Fill Color',   type: 'color', default: '#80c0ff' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.75 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.3, max: 6, step: 0.1, default: 1.6 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.5 },
        { key: 'fill', label: 'Frame Fill',
            description: 'Fill opacity for the area between outer triangle and inner chevron (even-odd hole).',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
        { key: 'innerScale', label: 'Inner Scale',
            description: 'Inner chevron size as a fraction of the outer triangle. Smaller = thicker frame border.',
            type: 'slider', min: 0.3, max: 0.95, step: 0.02, default: 0.85 },
        { key: 'innerVisible', label: 'Inner Chevron',
            description: 'Visibility of the inner chevron shape. 0 = single outer triangle, no chevron.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.9 },
        { key: 'notchDepth', label: 'Notch Depth',
            description: 'How deep the v-notch at the bottom of the inner chevron rises into the interior. 0 = no notch (flat base); 1 = full USSF-spec depth.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1 },
        { key: 'starY', label: 'Star Y Position',
            description: 'Vertical position of the 4-point star (USSF default: -0.28, in the lower interior). Negative = lower, positive = upper.',
            type: 'slider', min: -0.8, max: 0.7, step: 0.02, default: -0.28 },
        { key: 'starSize', label: 'Star Size',
            description: 'Size of the 4-point star (relative to USSF spec). 0 hides it.',
            type: 'slider', min: 0, max: 2, step: 0.05, default: 1.0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderDeltaFrame
});
