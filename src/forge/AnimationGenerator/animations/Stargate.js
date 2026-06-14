/**
 * Stargate — outer triangle with a 5-vertex chevron inside (whose "feet"
 * touch the bottom edge of the outer triangle), plus an annular ring
 * floating above the apex.
 *
 * Geometry derived from the user-supplied SVG (viewBox 95.64 × 115.67),
 * normalized to unit local space centered at viewbox midpoint.
 *
 *   Outer triangle:
 *     bot-left   (-0.83, -1.0)
 *     top apex   ( 0.00,  0.505)
 *     bot-right  ( 0.83, -1.0)
 *
 *   Inner chevron (5 vertices — feet land on the outer bottom edge):
 *     right foot ( 0.42, -1.0)
 *     inner BR   ( 0.52, -0.76)
 *     inner top  ( 0.00,  0.157)
 *     inner BL   (-0.52, -0.76)
 *     left foot  (-0.42, -1.0)
 *
 *   Annular ring above apex:
 *     center (0, 0.809), outer radius 0.191, inner radius 0.104
 */
function renderStargateFrame(ctx, w, h, frameIdx, totalFrames, params) {
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

    // The stargate outline is ONE continuous closed path. The bottom edge
    // is split into TWO short pillar-foot segments (one on each side); the
    // middle of the bottom is OPEN (the "doorway"), so the chevron has a
    // distinct two-legged silhouette instead of a triangle with an inner
    // shape floating inside.
    //
    // Vertex order traces the full outline once:
    //   0 bot-left  → 1 apex  → 2 bot-right
    //   3 right-foot (on outer bottom)
    //   4 inner BR  → 5 inner top  → 6 inner BL
    //   7 left-foot (on outer bottom)
    //   closing line → back to 0 bot-left
    //
    // The implicit close stroke from vert 7 to vert 0 is the LEFT pillar's
    // bottom edge segment; the explicit segment from vert 2 to vert 3 is
    // the RIGHT pillar's bottom edge segment. The middle of the bottom
    // (between vert 7 on the left and vert 3 on the right) is never drawn.
    const s = params.innerScale;
    const PATH = [
        [-0.83, -1.000],        // 0 bot-left
        [ 0.00,  0.505],        // 1 apex
        [ 0.83, -1.000],        // 2 bot-right
        [ 0.42, -1.000],        // 3 right foot (along outer bottom)
        [ 0.52 * s, -0.760 * s],// 4 inner BR
        [ 0.00,      0.157 * s],// 5 inner top
        [-0.52 * s, -0.760 * s],// 6 inner BL
        [-0.42, -1.000]         // 7 left foot (along outer bottom)
    ];

    // Ring above the apex.
    const ringCy = params.ringY;
    const ringOR = params.ringSize;
    const ringIR = Math.max(0, ringOR - params.ringThickness);
    const RING_SEGS = 40;

    const tracePoly = (pts, close) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            const p = proj3(pts[k][0], pts[k][1]);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        if (close) ctx.closePath();
    };
    const traceCircle = (rr) => {
        ctx.beginPath();
        for (let k = 0; k <= RING_SEGS; k++) {
            const a = (k / RING_SEGS) * Math.PI * 2;
            const p = proj3(Math.cos(a) * rr, ringCy + Math.sin(a) * rr);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Glow halo — stroked under the combined outline.
    if (params.glow > 0.01) {
        const gw = thickness * (2 + params.glow * 5);
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = gw;
        tracePoly(PATH, true); ctx.stroke();
        if (ringOR > 0.005 && params.ringVisible > 0.01) {
            traceCircle(ringOR); ctx.stroke();
            if (ringIR > 0.005) { traceCircle(ringIR); ctx.stroke(); }
        }
    }

    // 2. Fill — single closed path representing the entire stargate
    //    outline (outer triangle + pillars + inner chevron). The two
    //    pillar-foot segments on the bottom + the gap between them give
    //    the path its distinctive doorway silhouette.
    if (params.fill > 0.01) {
        ctx.fillStyle = hexWithAlpha(color2, opacity * params.fill);
        tracePoly(PATH, true);
        ctx.fill();
    }

    // 3. Ring annulus fill.
    if (params.ringFill > 0.01 && ringOR > 0.005 && params.ringVisible > 0.01) {
        ctx.fillStyle = hexWithAlpha(color2, opacity * params.ringFill);
        ctx.beginPath();
        for (let k = 0; k <= RING_SEGS; k++) {
            const a = (k / RING_SEGS) * Math.PI * 2;
            const p = proj3(Math.cos(a) * ringOR, ringCy + Math.sin(a) * ringOR);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        if (ringIR > 0.005) {
            for (let k = 0; k <= RING_SEGS; k++) {
                const a = (k / RING_SEGS) * Math.PI * 2;
                const p = proj3(Math.cos(a) * ringIR, ringCy + Math.sin(a) * ringIR);
                if (k === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.closePath();
        }
        ctx.fill('evenodd');
    }

    // 4. Main outline stroke — the entire combined path traced once.
    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    tracePoly(PATH, true); ctx.stroke();

    // 6. Ring strokes.
    if (ringOR > 0.005 && params.ringVisible > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color1, opacity);
        ctx.lineWidth = thickness;
        traceCircle(ringOR); ctx.stroke();
        if (ringIR > 0.005) {
            ctx.lineWidth = thickness * 0.85;
            traceCircle(ringIR); ctx.stroke();
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'stargate',
    name:         'Stargate',
    description:  'Outer triangle with a 5-vertex inner chevron (feet land on the bottom edge) and an annular ring floating above the apex. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Stroke Color',     type: 'color', default: '#80c0ff' },
        { key: 'color2', label: 'Glow / Fill Color', type: 'color', default: '#406080' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.75 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.3, max: 6, step: 0.1, default: 1.6 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.5 },
        { key: 'fill', label: 'Frame Fill',
            description: 'Fill opacity for the area between outer triangle and inner chevron (even-odd hole).',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
        { key: 'innerScale', label: 'Inner Scale',
            description: 'Inner chevron size as a fraction of the SVG-exact value. Smaller = inner chevron collapses toward the center of the symbol.',
            type: 'slider', min: 0.1, max: 1.0, step: 0.02, default: 1.0 },
        { key: 'ringVisible', label: 'Ring',
            description: 'Visibility of the annular ring above the apex.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 },
        { key: 'ringY', label: 'Ring Y Position',
            description: 'Vertical position of the ring (above triangle apex, ≈0.81 by default).',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.81 },
        { key: 'ringSize', label: 'Ring Size',
            description: 'Outer radius of the annular ring.',
            type: 'slider', min: 0.05, max: 0.5, step: 0.01, default: 0.19 },
        { key: 'ringThickness', label: 'Ring Thickness',
            description: 'Radial thickness of the ring annulus (outer − inner radius).',
            type: 'slider', min: 0.01, max: 0.3, step: 0.01, default: 0.085 },
        { key: 'ringFill', label: 'Ring Fill',
            description: 'Fill opacity of the annulus between outer and inner ring circles.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderStargateFrame
});
