/**
 * Trump — silhouette portrait of Donald Trump rendered from a complex SVG
 * path (hundreds of cubic Bézier segments). At module load, the SVG path
 * is tokenized and sampled into a normalized polyline in unit local space;
 * at render time each polyline vertex projects through the shared
 * symbol3D 3D pipeline so the silhouette can be rotated / tilted / pulsed
 * like any other symbolic glyph.
 *
 * The viewBox is 1696.782 × 1650.755. The polyline is normalized to
 * [-1, 1] (mostly) by centering on the viewbox midpoint and dividing by
 * half the max dimension, with Y flipped so canvas-down maps to local-up.
 */
(function () {
    // Inlined SVG path (`d` attribute) — silhouette source.
    const D = `M1572.782,1400.685c-0.028-0.012-0.056-0.025-0.084-0.037c-8.505-25.787-26.412-46.386-40.104-69.404c-12.055-17.75-18.96-38.427-31.444-55.943c-0.078-3.472-0.234-10.339-0.274-13.811c6.243-0.038,12.446-0.078,18.765-0.038c3.979-4.253,7.959-8.466,11.938-12.718c-0.624-10.26,2.652-20.326,13.263-23.836c-2.769-7.92-8.154-14.512-12.562-21.534c14.2,0.155,28.48-0.703,42.641,0.858c17.321,2.731,36.32,6.281,52.745-1.873c-4.876-5.306-9.753-10.806-11.314-17.984c18.415-4.837,38.193-8.309,54.344-18.804c-5.578-2.769-11.469-4.642-17.478-6.048c-5.618-6.749-14.591-9.753-21.963-3.433c-14.941-1.639-31.249-1.951-44.786-8.543c-10.144-11.352-27.074-22.159-23.057-39.637c10.26-7.802,17.672-18.57,25.554-28.597c3.238-23.095,11.781-45.84,8.7-69.404c-6.32-33.394,1.287-67.96-6.477-101.237c-6.398-25.475-26.841-46.855-25.085-74.28c-1.444-13.303,6.553-26.178,2.457-39.286c-6.281-25.826,5.032-53.329-5.579-78.416c-6.164-16.073,0.663-33.668-4.876-49.819c-26.585-95.385-43.952-91.55-46.073-180.004c-7.413-6.164-14.669-12.445-22.003-18.687c-2.302-14.435-5.266-28.83-4.604-43.499c-4.135-20.989-15.878-39.559-21.847-60.04l6.632,0.117c3.434-20.91-9.948-38.622-15.293-57.895c-9.948-30.508-30.742-55.905-44.201-84.852c-6.086-11.157-9.675-24.149-19.037-33.2c-140.071-113.204-66.004-65.508-240.395-128.624c-1.873,5.383-3.941,10.728-6.086,15.994c-8.193-3.238-16.814-4.916-25.592-5.305c-22.042-6.281-43.031-17.009-66.049-20.209c-5.774-2.457-11.977-2.614-18.062-2.848c-1.132-0.898-3.434-2.692-4.564-3.55c-12.21,0.975-23.993-2.965-35.229-7.139c-19.74-1.132-38.857-6.984-58.557-8.233c-7.802-0.546-16.737,1.99-23.29-3.51c-169.056,1.692-13.616-0.938-183.828,8.154c-30.045,5.3-237.277,69.687-248.354,76.269c-19.124,3.357,1.791-0.527-110.912,44.786c-26.061,11.157-53.954,16.659-80.678,25.943c-27.742,14.978-122.056,42.806-143.605,58.207c-20.872,2.692-41.276-3.589-62.069-2.964c-0.195,2.419-0.586,7.335-0.78,9.753c10.728,4.018,21.146,8.973,30.78,15.253c-15.02,9.909-33.511,6.398-50.405,6.164c0.467,1.639,1.444,4.916,1.911,6.553c4.954,0.663,9.908,1.365,14.864,2.068c0.335,10.401-5.766,5.354-54.501,47.868l-0.195,5.891l2.809,3.043c28.402,1.561,57.075-0.741,85.477,2.223c12.758,4.759,24.617,11.781,37.764,15.566c20.91,5.774,38.272,19.272,53.994,33.668c19.662-3.941,34.487,12.21,53.486,12.679c15.917,4.525,31.99,8.388,48.727,6.865c-8.855,26.178-16.308,53.994-34.643,75.45c-25.866,30.001-41.158,68.389-45.02,107.676c-13.42-0.429-26.412-4.018-39.832-4.525c0,5.071,0.038,10.104,0.038,15.215c-2.457,0.429-7.373,1.365-9.832,1.794c9.207,18.179,22.745,33.668,34.135,50.443c8.114,13.615,25.085,15.41,36.789,24.694c-1.104,27.425-97.786,145.902-110.6,191.122c-4.213,14.707-13.771,27.62-15.839,42.992c14.591,72.25,103.128,36.903,111.655,59.182c-2.692,19.389-5.306,39.325-13.108,57.387c0.234,14.083-2.38,28.44-11.898,39.403c4.135,17.4,8.309,34.838,17.009,50.677c-7.959,10.261-21.067,22.549-12.639,36.554c7.432,24.638,53.112,22.796,34.76,49.116c-21.808,33.394-28.752,75.567-22.588,114.658c30.665,79.52,74.03,88.561,86.218,94.255c104.544,45.02-15.279-20.521,156.011,84.19c34.047,19.663,25.221,18.592,143.839,101.354c17.566,12.944,37.987,20.809,57.465,30.373h878.09c8.525,0,16.676-0.877,24.43-2.498V1400.685z`;

    // Tokenize: yields letters (command codes) and numbers in path order.
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

    // Process commands → array of [x, y] sample points in SVG coords.
    function sampleCmds(cmds, sampleRate) {
        const pts = [];
        let x = 0, y = 0, sx = 0, sy = 0;
        const cubic = (p0, p1, p2, p3) => {
            for (let s = 1; s <= sampleRate; s++) {
                const t = s / sampleRate, u = 1 - t;
                pts.push([
                    u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
                    u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]
                ]);
            }
        };
        const quad = (p0, p1, p2) => {
            for (let s = 1; s <= sampleRate; s++) {
                const t = s / sampleRate, u = 1 - t;
                pts.push([
                    u*u*p0[0] + 2*u*t*p1[0] + t*t*p2[0],
                    u*u*p0[1] + 2*u*t*p1[1] + t*t*p2[1]
                ]);
            }
        };
        for (const { cmd, args } of cmds) {
            switch (cmd) {
                case 'M':
                    for (let i = 0; i < args.length; i += 2) {
                        x = args[i]; y = args[i+1];
                        if (i === 0) { sx = x; sy = y; }
                        pts.push([x, y]);
                    }
                    break;
                case 'm':
                    for (let i = 0; i < args.length; i += 2) {
                        x += args[i]; y += args[i+1];
                        if (i === 0) { sx = x; sy = y; }
                        pts.push([x, y]);
                    }
                    break;
                case 'L':
                    for (let i = 0; i < args.length; i += 2) {
                        x = args[i]; y = args[i+1];
                        pts.push([x, y]);
                    }
                    break;
                case 'l':
                    for (let i = 0; i < args.length; i += 2) {
                        x += args[i]; y += args[i+1];
                        pts.push([x, y]);
                    }
                    break;
                case 'H':
                    for (const v of args) { x = v; pts.push([x, y]); }
                    break;
                case 'h':
                    for (const v of args) { x += v; pts.push([x, y]); }
                    break;
                case 'V':
                    for (const v of args) { y = v; pts.push([x, y]); }
                    break;
                case 'v':
                    for (const v of args) { y += v; pts.push([x, y]); }
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
                case 'Q':
                    for (let i = 0; i < args.length; i += 4) {
                        const p2 = [args[i+2], args[i+3]];
                        quad([x, y], [args[i], args[i+1]], p2);
                        x = p2[0]; y = p2[1];
                    }
                    break;
                case 'q':
                    for (let i = 0; i < args.length; i += 4) {
                        const p2 = [x + args[i+2], y + args[i+3]];
                        quad([x, y], [x + args[i], y + args[i+1]], p2);
                        x = p2[0]; y = p2[1];
                    }
                    break;
                case 'Z': case 'z':
                    x = sx; y = sy;
                    pts.push([x, y]);
                    break;
            }
        }
        return pts;
    }

    // Normalize: SVG (Y-down, [0..W]x[0..H]) → local (Y-up, [-1..1]).
    const VB_W = 1696.782, VB_H = 1650.755;
    const VB_CX = VB_W * 0.5, VB_CY = VB_H * 0.5;
    const VB_SCALE = Math.max(VB_W, VB_H) * 0.5;
    const rawPts = sampleCmds(parseCmds(D), 5);
    const TRUMP_POLY = rawPts.map(([px, py]) => [
        (px - VB_CX) / VB_SCALE,
        (VB_CY - py) / VB_SCALE
    ]);

    // Expose for the render function.
    window.__TRUMP_POLY = TRUMP_POLY;
})();

function renderTrumpFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );
    const proj3 = (lx, ly) => project(transform([lx, ly, 0]));

    const POLY = window.__TRUMP_POLY;
    const color1 = params.color1;
    const color2 = params.color2;
    const opacity = params.opacity;
    const thickness = Math.max(0.5, minDim * 0.003 * params.thickness);

    // Project every polyline vertex once per frame.
    const projected = new Array(POLY.length);
    for (let i = 0; i < POLY.length; i++) {
        projected[i] = proj3(POLY[i][0], POLY[i][1]);
    }

    const tracePath = () => {
        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        for (let i = 1; i < projected.length; i++) {
            ctx.lineTo(projected[i].x, projected[i].y);
        }
        ctx.closePath();
    };

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Glow halo behind the silhouette.
    if (params.glow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * params.glow * 0.55);
        ctx.lineWidth = thickness * (2 + params.glow * 5);
        tracePath(); ctx.stroke();
    }

    // 2. Fill the silhouette body.
    if (params.fill > 0.01) {
        ctx.fillStyle = hexWithAlpha(color2, opacity * params.fill);
        tracePath();
        ctx.fill('evenodd');
    }

    // 3. Outline stroke.
    if (params.thickness > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color1, opacity);
        ctx.lineWidth = thickness;
        tracePath(); ctx.stroke();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'symbolic',
    id:           'trump',
    name:         'Trump',
    description:  'Silhouette portrait of Donald Trump, sampled from an SVG path into a polyline. Full 3D rotation, fill, and glow.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Outline Color',     type: 'color', default: '#222022' },
        { key: 'color2', label: 'Glow / Fill Color', type: 'color', default: '#ff8060' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.85 },
        ...SYMBOLIC_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'thickness', label: 'Outline Thickness',
            description: 'Stroke width of the outline. 0 = no outline.',
            type: 'slider', min: 0, max: 6, step: 0.1, default: 1.2 },
        { key: 'glow', label: 'Glow', type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.4 },
        { key: 'fill', label: 'Fill Opacity',
            description: 'Solid fill of the silhouette body (even-odd).',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderTrumpFrame
});
