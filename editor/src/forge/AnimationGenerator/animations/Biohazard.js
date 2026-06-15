/**
 * Biohazard — Charles Baldwin's 1966 trefoil. Renders directly from the
 * canonical SVG path data (sampled into per-subpath polylines), then
 * projected through the symbol3D 3D pipeline so the whole symbol can tilt,
 * cycle, and pulse like any other symbolic glyph.
 *
 * The viewBox is 122.88 × 116.26. Two original SVG `<path>` elements with
 * fill-rule=evenodd are concatenated into a single path string with 6
 * subpaths total:
 *   - 3 small inner crescents along each ring's outer edge
 *   - 3 large outer silhouette pieces (central trefoil + arms + ring rims)
 * Even-odd fill takes care of which subpaths are filled vs cut-out.
 */
(function () {
    // First SVG path: 3 small upper-crescent shapes inside each lobe.
    const D1 = `M61.48,33.29c7.07,0,13.63,2.23,18.99,6.03c-0.03,0.04-0.06,0.08-0.09,0.12c-0.73,1.02-1.53,1.97-2.39,2.85 c-0.86,0.87-1.75,1.64-2.68,2.33c-0.26,0.17-0.49,0.38-0.7,0.63c-0.04,0.05-0.09,0.11-0.12,0.16c-3.77-2.36-8.23-3.73-13.01-3.73 c-4.74,0-9.17,1.35-12.92,3.67c-0.19-0.27-0.43-0.51-0.71-0.72c-1.02-0.75-1.95-1.56-2.8-2.43c-0.86-0.88-1.65-1.83-2.36-2.84l0,0 c-0.03-0.04-0.06-0.08-0.09-0.12C47.94,35.49,54.45,33.29,61.48,33.29L61.48,33.29z M94.23,62.73c0.12,1.15,0.18,2.31,0.18,3.49 c0,13.18-7.74,24.55-18.93,29.81c-0.03-0.06-0.05-0.12-0.08-0.18c-0.55-1.11-1-2.26-1.36-3.44c-0.36-1.17-0.62-2.38-0.79-3.62l0,0 c-0.03-0.23-0.09-0.46-0.17-0.69c-0.03-0.07-0.05-0.13-0.08-0.2c7.76-4.13,13.04-12.29,13.04-21.69c0-0.47-0.01-0.94-0.04-1.41 c0.29-0.04,0.59-0.11,0.88-0.24c1.09-0.47,2.27-0.87,3.51-1.19c1.2-0.31,2.38-0.51,3.52-0.62C94.01,62.76,94.12,62.75,94.23,62.73 L94.23,62.73z M47.98,96.27C36.52,91.11,28.55,79.6,28.55,66.22c0-1.32,0.08-2.62,0.23-3.9c0.1,0.02,0.19,0.03,0.29,0.04 c1.24,0.1,2.46,0.29,3.64,0.57c1.15,0.28,2.32,0.66,3.51,1.16l0-0.01c0.19,0.08,0.38,0.14,0.58,0.18c0.07,0.01,0.13,0.02,0.2,0.03 c-0.05,0.63-0.07,1.27-0.07,1.92c0,9.62,5.53,17.94,13.59,21.97c-0.1,0.25-0.18,0.51-0.22,0.79c-0.17,1.2-0.45,2.4-0.82,3.6 c-0.36,1.14-0.8,2.25-1.31,3.3C48.09,96,48.03,96.13,47.98,96.27L47.98,96.27z`;

    // Second SVG path: outer trefoil silhouette + central body + each ring.
    const D2 = `M114.81,103.94c-10.55,12.61-28.94,16.2-43.67,7.7c-3.9-2.25-7.2-5.15-9.83-8.49 c-10.48,12.99-29.15,16.78-44.06,8.17c-2.74-1.58-5.19-3.49-7.31-5.64c1.23,1.06,2.58,2.02,4.04,2.87 c12.67,7.32,28.88,2.97,36.2-9.7c4.57-7.91,4.59-17.21,0.88-24.85l4.81-2.98c1.45,1.61,3.55,2.62,5.89,2.62 c2.17,0,4.14-0.87,5.57-2.29l0.44,0.26l4.81,2.44c-6.1,12.28-1.67,27.36,10.37,34.31C93.55,114.47,106.65,112.33,114.81,103.94 L114.81,103.94z M69.13,68.62c0.36-0.9,0.56-1.89,0.56-2.92c0-3.96-2.9-7.23-6.68-7.83v-5.59c8.56-0.48,16.73-5.13,21.34-13.11 c7.26-12.58,2.95-28.67-9.63-35.93c-2.79-1.61-5.75-2.65-8.76-3.16c16.94,2.19,30.03,16.67,30.03,34.2c0,4.73-0.95,9.24-2.68,13.35 c4.22,0.61,8.4,2.01,12.32,4.27c13.65,7.88,19.88,23.69,16.22,38.25c1.83-10.51-2.93-21.52-12.71-27.16 c-12.06-6.96-27.36-3.24-34.94,8.23l-1.82-0.93l0,0L69.13,68.62L69.13,68.62z M54.23,68.22l-4.77,2.95 c-2.21-3.4-5.23-6.35-8.98-8.52c-12.67-7.32-28.88-2.97-36.2,9.7c-3.25,5.62-4.2,11.94-3.14,17.87 c-2.23-8.48-1.25-17.81,3.49-26.01c5.5-9.52,14.84-15.43,24.93-16.89c-1.64-4.02-2.55-8.43-2.55-13.04 c0-17.74,13.4-32.36,30.63-34.27C50,1.16,42.94,5.65,38.78,12.86c-7.26,12.58-2.95,28.67,9.63,35.93c3.59,2.08,7.48,3.2,11.35,3.47 v5.77c-3.41,0.88-5.94,3.99-5.94,7.68C53.82,66.58,53.97,67.43,54.23,68.22L54.23,68.22z`;

    // Tokenize: command letters + numbers in path order.
    function parseCmds(d) {
        const cmds = [];
        const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
        let m, curCmd = null, curArgs = [];
        while ((m = re.exec(d)) !== null) {
            if (m[1]) {
                if (curCmd) cmds.push({ cmd: curCmd, args: curArgs });
                curCmd = m[1];
                curArgs = [];
            } else {
                curArgs.push(parseFloat(m[2]));
            }
        }
        if (curCmd) cmds.push({ cmd: curCmd, args: curArgs });
        return cmds;
    }

    // Sample commands into an array of subpaths (one per M command).
    // Each subpath is an array of [x, y] points in SVG coords.
    function sampleCmdsBySubpath(cmds, sampleRate) {
        const subpaths = [];
        let current = null;
        let x = 0, y = 0, sx = 0, sy = 0;
        const startSubpath = (x0, y0) => {
            current = [[x0, y0]];
            subpaths.push(current);
        };
        const cubic = (p0, p1, p2, p3) => {
            for (let s = 1; s <= sampleRate; s++) {
                const t = s / sampleRate, u = 1 - t;
                current.push([
                    u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
                    u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
                ]);
            }
        };
        for (const { cmd, args } of cmds) {
            switch (cmd) {
                case 'M':
                    for (let i = 0; i < args.length; i += 2) {
                        x = args[i]; y = args[i+1];
                        if (i === 0) { sx = x; sy = y; startSubpath(x, y); }
                        else current.push([x, y]);
                    }
                    break;
                case 'm':
                    for (let i = 0; i < args.length; i += 2) {
                        x += args[i]; y += args[i+1];
                        if (i === 0) { sx = x; sy = y; startSubpath(x, y); }
                        else current.push([x, y]);
                    }
                    break;
                case 'L':
                    for (let i = 0; i < args.length; i += 2) {
                        x = args[i]; y = args[i+1];
                        current.push([x, y]);
                    }
                    break;
                case 'l':
                    for (let i = 0; i < args.length; i += 2) {
                        x += args[i]; y += args[i+1];
                        current.push([x, y]);
                    }
                    break;
                case 'H':
                    for (const v of args) { x = v; current.push([x, y]); }
                    break;
                case 'h':
                    for (const v of args) { x += v; current.push([x, y]); }
                    break;
                case 'V':
                    for (const v of args) { y = v; current.push([x, y]); }
                    break;
                case 'v':
                    for (const v of args) { y += v; current.push([x, y]); }
                    break;
                case 'C':
                    for (let i = 0; i < args.length; i += 6) {
                        const p3 = [args[i+4], args[i+5]];
                        cubic([x, y], [args[i], args[i+1]], [args[i+2], args[i+3]], p3);
                        x = p3[0]; y = p3[1];
                    }
                    break;
                case 'c':
                    for (let i = 0; i < args.length; i += 6) {
                        const p3 = [x + args[i+4], y + args[i+5]];
                        cubic([x, y],
                              [x + args[i],     y + args[i+1]],
                              [x + args[i+2],   y + args[i+3]],
                              p3);
                        x = p3[0]; y = p3[1];
                    }
                    break;
                case 'Z': case 'z':
                    x = sx; y = sy;
                    if (current) current.push([x, y]);
                    break;
            }
        }
        return subpaths;
    }

    // Normalize: SVG (Y-down, [0..W]x[0..H]) → local (Y-up, [-1..1]).
    const VB_W = 122.88, VB_H = 116.26;
    const VB_CX = VB_W * 0.5, VB_CY = VB_H * 0.5;
    const VB_SCALE = Math.max(VB_W, VB_H) * 0.5;
    const rawSubpaths = sampleCmdsBySubpath(parseCmds(D1 + ' ' + D2), 6);
    const BIOHAZARD_POLYS = rawSubpaths.map(sub => sub.map(([px, py]) => [
        (px - VB_CX) / VB_SCALE,
        (VB_CY - py) / VB_SCALE
    ]));

    window.__BIOHAZARD_POLYS = BIOHAZARD_POLYS;
})();

function renderBiohazardFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );
    const proj3 = (lx, ly) => project(transform([lx, ly, 0]));

    const POLYS = window.__BIOHAZARD_POLYS;
    const color1 = params.color1;
    const color2 = params.color2;
    const opacity = params.opacity;
    const thickness = Math.max(0.5, minDim * 0.003 * params.thickness);

    // Project all subpath vertices once per frame.
    const projectedSubpaths = POLYS.map(poly => poly.map(([lx, ly]) => proj3(lx, ly)));

    const tracePath = () => {
        ctx.beginPath();
        for (const pts of projectedSubpaths) {
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x, pts[i].y);
            }
            ctx.closePath();
        }
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = thickness * (2 + params.glow * 5);
        tracePath(); ctx.stroke();
    }

    ctx.fillStyle = hexWithAlpha(color1, opacity);
    tracePath();
    ctx.fill('evenodd');

    if (params.thickness > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color1, opacity);
        ctx.lineWidth = thickness;
        tracePath(); ctx.stroke();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'biohazard',
    name:         'Biohazard',
    description:  'Charles Baldwin\'s 1966 canonical biohazard trefoil — rendered from the actual SVG path data, with full 3D rotation, pulse, and glow.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Body Color', type: 'color', default: '#ff6020' },
        { key: 'color2', label: 'Glow Color', type: 'color', default: '#ffd060' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.95 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Outline Thickness',
            description: 'Stroke around the silhouette. 0 = fill only.',
            type: 'slider', min: 0, max: 4, step: 0.1, default: 0 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.45 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderBiohazardFrame
});
