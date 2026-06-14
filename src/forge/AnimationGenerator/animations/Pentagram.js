/**
 * Pentagram — a 5-pointed star polygon ({5/2} Schläfli symbol), drawn as a
 * single self-intersecting path. Uses the shared symbol3D rotation pipeline
 * for full tilt + cycle around all three axes.
 *
 * Orientation: tiltZ=0 → point up (upright); tiltZ=180 → point down (inverted);
 * 72° lands back on itself (5-fold symmetry).
 *
 * Depends on:
 *   hexWithAlpha                              (helpers/color.js)
 *   makeSymbol3DTransform, SYMBOL3D_ROTATION_PARAMS, SYMBOL3D_PULSE_PARAMS
 *                                              (helpers/symbol3D.js)
 *   RR_ANIMATION_REGISTRY                      (registry.js)
 */
function renderPentagramFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const VERT = 5;
    const STRIDE = 2;
    const PHI_SQ = ((1 + Math.sqrt(5)) / 2) ** 2;

    // Outer vertices in unit local space, starting at top (canvas +Y down,
    // we flip Y in project; so local +Y up → vertex 0 at angle π/2).
    const outerLocal = [];
    const outerProj = [];
    for (let i = 0; i < VERT; i++) {
        const a = Math.PI / 2 + i * 2 * Math.PI / VERT;
        const v = [Math.cos(a), Math.sin(a), 0];
        outerLocal.push(transform(v));
        outerProj.push(project(outerLocal[i]));
    }

    const RING_SEGS = 64;
    const ringPoints = (rLocal) => {
        const pts = [];
        for (let k = 0; k <= RING_SEGS; k++) {
            const a = Math.PI / 2 + (k / RING_SEGS) * Math.PI * 2;
            pts.push(project(transform([Math.cos(a) * rLocal, Math.sin(a) * rLocal, 0])));
        }
        return pts;
    };

    // Star polygon path: 0→2→4→1→3→0
    const order = [];
    for (let i = 0; i < VERT; i++) order.push((i * STRIDE) % VERT);
    order.push(order[0]);

    const buildPath = () => {
        ctx.beginPath();
        for (let k = 0; k < order.length; k++) {
            const p = outerProj[order[k]];
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
    };
    const traceRing = (pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x, pts[k].y);
            else ctx.lineTo(pts[k].x, pts[k].y);
        }
    };

    const thickness = Math.max(0.5, minDim * 0.005 * params.thickness);
    const color1 = params.color1;
    const color2 = params.color2;
    const opacity = params.opacity;

    if (params.outerRing > 0.01) {
        const ringA = opacity * params.outerRing;
        const pts = ringPoints(1.0);
        if (params.glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color2, ringA * 0.5 * params.glow);
            ctx.lineWidth = thickness * (2 + params.glow * 4);
            traceRing(pts); ctx.stroke();
        }
        ctx.strokeStyle = hexWithAlpha(color1, ringA);
        ctx.lineWidth = thickness;
        traceRing(pts); ctx.stroke();
    }
    if (params.innerRing > 0.01) {
        const ringA = opacity * params.innerRing;
        const pts = ringPoints(1.0 / PHI_SQ);
        if (params.glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color2, ringA * 0.5 * params.glow);
            ctx.lineWidth = thickness * (2 + params.glow * 4);
            traceRing(pts); ctx.stroke();
        }
        ctx.strokeStyle = hexWithAlpha(color1, ringA);
        ctx.lineWidth = thickness;
        traceRing(pts); ctx.stroke();
    }
    if (params.fill > 0.01) {
        ctx.fillStyle = hexWithAlpha(color2, opacity * params.fill);
        buildPath();
        ctx.fill('evenodd');
    }
    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = thickness * (2 + params.glow * 5);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        buildPath(); ctx.stroke();
    }
    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    buildPath(); ctx.stroke();

    if (params.vertexGlow > 0.01) {
        for (let i = 0; i < VERT; i++) {
            const p = outerProj[i];
            const depthAlpha = 0.5 + 0.5 * Math.max(0, Math.min(1, (outerLocal[i][2] + 1) / 2));
            const dotR = thickness * (1.5 + 2 * params.vertexGlow);
            const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dotR * 2.5);
            halo.addColorStop(0, hexWithAlpha(color2, opacity * params.vertexGlow * depthAlpha));
            halo.addColorStop(1, hexWithAlpha(color2, 0));
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(p.x, p.y, dotR * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = hexWithAlpha(color1, opacity * depthAlpha);
            ctx.beginPath();
            ctx.arc(p.x, p.y, dotR * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'pentagram',
    name:         'Pentagram',
    description:  'Five-pointed star sigil with full 3D rotation, pulse, optional rings, fill, and vertex glow.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Outline Color', type: 'color', default: '#ffd060' },
        { key: 'color2', label: 'Glow / Fill Color', type: 'color', default: '#ff8020' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.2, max: 6, step: 0.1, default: 1.4 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6 },
        { key: 'fill', label: 'Fill Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
        { key: 'outerRing', label: 'Outer Ring', type: 'slider', min: 0, max: 1, step: 0.05, default: 0.65 },
        { key: 'innerRing', label: 'Inner Ring', type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
        { key: 'vertexGlow', label: 'Vertex Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.4 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderPentagramFrame
});
