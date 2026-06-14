/**
 * Hammer and Sickle — the Soviet emblem (also still in use by various
 * communist movements and on flags such as the People's Republic of
 * China's earlier variants). Geometry is ported from the existing
 * FORGE_ICONS.forge brand icon (which itself is scaled from the canonical
 * Soviet flag SVG): a sickle blade traced from 5 cubic Béziers + handle
 * parallelogram + grip ellipse, plus a hammer with a straight handle,
 * head, and rounded butt cap.
 *
 * The reference geometry lives in a 24×24 SVG box; we map it to unit local
 * space via (sx − 12) / 12, (12 − sy) / 12 (canonical center + Y-flip)
 * before running it through the symbol3D transform pipeline.
 */
function renderHammerSickleFrame(ctx, w, h, frameIdx, totalFrames, params) {
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

    // Convert from SVG (24x24, Y-down, origin top-left) to unit local
    // (centered, Y-up). The whole symbol fits in ~[-1, 1] after this.
    const svg2local = ([x, y]) => [(x - 12) / 12, (12 - y) / 12];

    // Cubic Bézier sampler.
    const sampleBezier = (p0, p1, p2, p3, n) => {
        const pts = [];
        for (let k = 1; k <= n; k++) {
            const t = k / n, u = 1 - t, u2 = u * u, t2 = t * t;
            pts.push([
                u2*u*p0[0] + 3*u2*t*p1[0] + 3*u*t2*p2[0] + t2*t*p3[0],
                u2*u*p0[1] + 3*u2*t*p1[1] + 3*u*t2*p2[1] + t2*t*p3[1]
            ]);
        }
        return pts;
    };

    // Sickle blade — 5 cubic Béziers (ported from the SVG path data).
    const sickleBeziers = [
        [[11,3], [16,3], [21,7], [21,12]],
        [[21,12], [21,16], [18,20], [14,20]],
        [[14,20], [12,20], [10,19], [10,17]],
        [[10,17], [13,17], [16,16], [17,13]],
        [[17,13], [18,9], [15,5], [11,3]]
    ];
    const N_BEZ = 16;
    const sickleSvgPts = [sickleBeziers[0][0]];
    for (const [p0, p1, p2, p3] of sickleBeziers) {
        sickleSvgPts.push(...sampleBezier(p0, p1, p2, p3, N_BEZ));
    }
    const sicklePts = sickleSvgPts.map(svg2local);

    // Sickle handle — parallelogram.
    const sickleHandle = [[11, 18], [8, 22], [6, 21], [10, 17]].map(svg2local);

    // Sickle grip — ellipse at (6, 21.5) rx=2 ry=1.3, sampled as polyline.
    const sickleGrip = (() => {
        const cxS = 6, cyS = 21.5, rxS = 2, ryS = 1.3;
        const pts = [];
        const N = 24;
        for (let k = 0; k < N; k++) {
            const a = (k / N) * Math.PI * 2;
            pts.push(svg2local([cxS + rxS * Math.cos(a), cyS + ryS * Math.sin(a)]));
        }
        return pts;
    })();

    // Hammer — main body uses straight segments; the rounded butt cap (the
    // SVG's two arcs from (20.16,23.01) through (22.15,23.01) to (22.15,21.03))
    // we approximate as a sampled semicircle for smoothness.
    const hammerStraightBefore = [
        [7.03, 4.43], [6.29, 5.18], [4.31, 7.16], [1.83, 9.64],
        [4.55, 12.36], [7.03, 9.88], [20.16, 23.01]
    ].map(svg2local);
    // Approximated cap: semicircle between (20.16,23.01) and (22.15,21.03)
    // — the SVG used two arcs of radius 1.4 forming a 180° fillet. Sample
    // as a half-circle on that chord.
    const capStart = svg2local([20.16, 23.01]);
    const capEnd = svg2local([22.15, 21.03]);
    const capMidX = (capStart[0] + capEnd[0]) / 2;
    const capMidY = (capStart[1] + capEnd[1]) / 2;
    const chordDx = capEnd[0] - capStart[0];
    const chordDy = capEnd[1] - capStart[1];
    const chordLen = Math.hypot(chordDx, chordDy);
    const capR = chordLen / 2;
    // Perpendicular outward unit vector (chord cross with +Z, then normalize).
    // The cap should bulge AWAY from the hammer body — which is in the +X/-Y
    // direction at this point. Probe both normals and pick the one with
    // positive X component.
    let nx = -chordDy / chordLen, ny = chordDx / chordLen;
    if (nx < 0) { nx = -nx; ny = -ny; }
    const capStartAng = Math.atan2(capStart[1] - capMidY, capStart[0] - capMidX);
    const N_CAP = 12;
    const hammerCap = [];
    for (let k = 1; k < N_CAP; k++) {
        const s = k / N_CAP;
        // Sweep from capStart angle, going through outward normal, to capEnd.
        // Outward normal angle:
        const outAng = Math.atan2(ny, nx);
        // Lerp from capStartAng toward outAng then to (capStartAng + π).
        // Easier: parameterize by angle from start, going CCW by π.
        // First determine CCW direction by checking which way puts midpoint near (mid + r·n).
        const a = capStartAng + s * Math.PI;
        hammerCap.push([capMidX + capR * Math.cos(a), capMidY + capR * Math.sin(a)]);
    }
    // Check whether sampled midpoint is on the outward side; if not, reverse.
    if (hammerCap.length > 0) {
        const probe = hammerCap[Math.floor(hammerCap.length / 2)];
        const dotN = (probe[0] - capMidX) * nx + (probe[1] - capMidY) * ny;
        if (dotN < 0) {
            // Wrong direction — flip by sampling with angle going the other way.
            hammerCap.length = 0;
            for (let k = 1; k < N_CAP; k++) {
                const s = k / N_CAP;
                const a = capStartAng - s * Math.PI;
                hammerCap.push([capMidX + capR * Math.cos(a), capMidY + capR * Math.sin(a)]);
            }
        }
    }
    const hammerStraightAfter = [
        [22.15, 21.03], [9.01, 7.90], [9.76, 7.16], [12.00, 4.93]
    ].map(svg2local);
    const hammerPts = [...hammerStraightBefore, ...hammerCap, ...hammerStraightAfter];

    // Project all polygons.
    const projAll = (localPts) => localPts.map(([x, y]) => project(transform([x, y, 0])));

    const tracePolygon = (pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            if (k === 0) ctx.moveTo(pts[k].x, pts[k].y);
            else ctx.lineTo(pts[k].x, pts[k].y);
        }
        ctx.closePath();
    };

    const polygons = [
        projAll(sicklePts),
        projAll(sickleHandle),
        projAll(sickleGrip),
        projAll(hammerPts)
    ];

    // Glow halo behind.
    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness) * (2 + params.glow * 5);
        ctx.lineJoin = 'round';
        for (const poly of polygons) { tracePolygon(poly); ctx.stroke(); }
    }

    // Filled bodies.
    ctx.fillStyle = hexWithAlpha(color1, opacity);
    for (const poly of polygons) { tracePolygon(poly); ctx.fill(); }

    // Optional outline.
    if (params.thickness > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color1, opacity);
        ctx.lineWidth = Math.max(0.5, minDim * 0.005 * params.thickness);
        ctx.lineJoin = 'round';
        for (const poly of polygons) { tracePolygon(poly); ctx.stroke(); }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'hammersickle',
    name:         'Hammer and Sickle',
    description:  'The Soviet emblem — a sickle blade crossed by a hammer. Geometry ported from the canonical flag SVG. Full 3D rotation.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Body Color', type: 'color', default: '#ffd060' },
        { key: 'color2', label: 'Glow Color', type: 'color', default: '#ff8020' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.7 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Outline Thickness',
            description: 'Stroke around the silhouettes. 0 = fill only.',
            type: 'slider', min: 0, max: 4, step: 0.1, default: 0 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.4 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderHammerSickleFrame
});
