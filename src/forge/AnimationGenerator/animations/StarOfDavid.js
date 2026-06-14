/**
 * Star of David — Magen David / hexagram. Two overlapping equilateral
 * triangles, one pointing up, one pointing down. Renders as two separate
 * triangle paths (intersecting, forming the classic 12-pointed star
 * outline + inner hexagon). Full 3D rotation through symbol3D.
 *
 * Geometry:
 *   Up triangle vertices at unit radius: angles π/2, π/2 + 2π/3, π/2 + 4π/3.
 *   Down triangle vertices: angles -π/2, -π/2 + 2π/3, -π/2 + 4π/3.
 */
function renderStarOfDavidFrame(ctx, w, h, frameIdx, totalFrames, params) {
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

    const triVerts = (baseAngle) => {
        const pts = [];
        for (let i = 0; i < 3; i++) {
            const a = baseAngle + i * 2 * Math.PI / 3;
            pts.push(project(transform([Math.cos(a), Math.sin(a), 0])));
        }
        pts.push(pts[0]);
        return pts;
    };
    const upTri = triVerts(Math.PI / 2);     // point up
    const downTri = triVerts(-Math.PI / 2);  // point down

    const tracePath = (pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x, pts[k].y);
            else ctx.lineTo(pts[k].x, pts[k].y);
        }
    };

    if (params.fill > 0.01) {
        ctx.fillStyle = hexWithAlpha(color2, opacity * params.fill);
        tracePath(upTri);   ctx.fill();
        tracePath(downTri); ctx.fill();
    }

    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = thickness * (2 + params.glow * 5);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        tracePath(upTri);   ctx.stroke();
        tracePath(downTri); ctx.stroke();
    }

    ctx.strokeStyle = hexWithAlpha(color1, opacity);
    ctx.lineWidth = thickness;
    ctx.lineJoin = 'miter';
    ctx.lineCap = 'butt';
    tracePath(upTri);   ctx.stroke();
    tracePath(downTri); ctx.stroke();

    if (params.vertexGlow > 0.01) {
        const dotR = thickness * (1.5 + 2 * params.vertexGlow);
        const all = [upTri[0], upTri[1], upTri[2], downTri[0], downTri[1], downTri[2]];
        for (const p of all) {
            const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, dotR * 2.5);
            halo.addColorStop(0, hexWithAlpha(color2, opacity * params.vertexGlow));
            halo.addColorStop(1, hexWithAlpha(color2, 0));
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(p.x, p.y, dotR * 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = hexWithAlpha(color1, opacity);
            ctx.beginPath();
            ctx.arc(p.x, p.y, dotR * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'starofdavid',
    name:         'Star of David',
    description:  'Hexagram / Magen David. Two overlapping equilateral triangles forming a 6-pointed star with full 3D rotation.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Outline Color', type: 'color', default: '#80c0ff' },
        { key: 'color2', label: 'Glow / Fill Color', type: 'color', default: '#4060ff' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Stroke Thickness', type: 'slider', min: 0.2, max: 6, step: 0.1, default: 1.4 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.55 },
        { key: 'fill', label: 'Fill Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 0 },
        { key: 'vertexGlow', label: 'Vertex Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.3 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderStarOfDavidFrame
});
