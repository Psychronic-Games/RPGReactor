// ─────────────────────────────────────────────────────────────────────────
// efk_symbols.js — 2D symbol geometry for the Symbolic recipe family.
//
// Each symbol is defined as PARTS. A part is a closed or open 2D outline
// (unit-ish space, y-up) plus flags:
//   { pts, closed, fill, role }
//     pts:    [[x,y]...]
//     closed: connect last→first (default true)
//     fill:   in 'solid' style this part becomes a filled mesh
//             (ear-clipped, or an annulus strip for ring parts);
//             fill:false parts stay struts in both styles
//     role:   'primary' | 'secondary' — recipes color roles separately
//             (yin-yang halves, radioactive wedges vs. center, …)
//
// wire style  → every outline becomes crossed-quad struts (RR_EfkModel.strutFrame)
// solid style → fill:true parts become flat filled meshes with planar UVs
//               (texture maps across the symbol's bounding box)
//
// Trump is sampled from the same SVG silhouette path the standard
// Animation Generator uses.
//
// Runs in BOTH Node (tests) and the browser.
// ─────────────────────────────────────────────────────────────────────────

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory(require('./efk_model.js'));
    } else {
        root.RR_EfkSymbols = factory(root.RR_EfkModel);
    }
})(typeof self !== 'undefined' ? self : this, function (M) {
'use strict';

// ── 2D path helpers ──────────────────────────────────────────────────────

const D2R = Math.PI / 180;

function arc(cx, cy, r, a0deg, a1deg, n = 24) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
        const a = (a0deg + (a1deg - a0deg) * (i / n)) * D2R;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
}
const circle = (cx, cy, r, n = 32) => arc(cx, cy, r, 0, 360, n).slice(0, n);   // closed ring, no dup point

function star(points, rOuter, rInner, rotDeg = 90) {
    const pts = [];
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? rOuter : rInner;
        const a = (rotDeg + (i * 180) / points) * D2R;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
}

// Pentagram stroke: pentagon vertices connected every-2nd.
function pentagramPath(r, rotDeg = 90) {
    const p = [];
    for (let i = 0; i < 5; i++) {
        const a = (rotDeg + i * 144) * D2R;   // step 2 vertices = 144°
        p.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return p;
}

// ── Ear-clipping triangulation (simple polygons, no holes) ──────────────

function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
        a += x1 * y2 - x2 * y1;
    }
    return a / 2;
}

function earClip(ptsIn) {
    // Ensure CCW.
    const raw = polyArea(ptsIn) < 0 ? [...ptsIn].reverse() : [...ptsIn];
    // Drop consecutive (near-)duplicate points — SVG-sampled outlines are
    // full of them, and a duplicate sitting on an ear's edge blocks every
    // ear until the clipper stalls and drops whole regions.
    const pts = [];
    for (const q of raw) {
        const prev = pts[pts.length - 1];
        if (!prev || Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 1e-5) pts.push(q);
    }
    while (pts.length > 1 &&
           Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 1e-5) pts.pop();
    const idx = pts.map((_, i) => i);
    const tris = [];
    const cross2 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    // STRICT interior test: a vertex exactly ON the candidate ear's edge
    // (shared boundary point) must not veto the ear.
    const inTri = (p, a, b, c) =>
        cross2(a, b, p) > 1e-9 && cross2(b, c, p) > 1e-9 && cross2(c, a, p) > 1e-9;
    let guard = 0;
    while (idx.length > 3 && guard++ < 10000) {
        let clipped = false;
        for (let i = 0; i < idx.length; i++) {
            const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
            const a = pts[ia], b = pts[ib], c = pts[ic];
            if (cross2(a, b, c) <= 1e-12) continue;   // reflex or degenerate
            let contains = false;
            for (const j of idx) {
                if (j === ia || j === ib || j === ic) continue;
                if (inTri(pts[j], a, b, c)) { contains = true; break; }
            }
            if (contains) continue;
            tris.push([ia, ib, ic]);
            idx.splice(i, 1);
            clipped = true;
            break;
        }
        if (!clipped) break;   // give up gracefully on pathological input
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return { pts, tris };
}

// ── SVG path sampling (for Trump — same silhouette as the AG) ───────────

function samplePath(d, sampleRate = 3) {
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?\d*\.?\d+(?:[eE][+-]?\d+)?)/g;
    const cmds = [];
    let m, cur = null, args = [];
    while ((m = re.exec(d)) !== null) {
        if (m[1]) { if (cur) cmds.push({ cmd: cur, args }); cur = m[1]; args = []; }
        else args.push(parseFloat(m[2]));
    }
    if (cur) cmds.push({ cmd: cur, args });

    const pts = [];
    let x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0;
    const cubic = (p0, p1, p2, p3) => {
        for (let s = 1; s <= sampleRate; s++) {
            const t = s / sampleRate, u = 1 - t;
            pts.push([
                u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
            ]);
        }
    };
    for (const { cmd, args: a } of cmds) {
        switch (cmd) {
            case 'M': x = a[0]; y = a[1]; sx = x; sy = y; pts.push([x, y]);
                for (let i = 2; i < a.length; i += 2) { x = a[i]; y = a[i + 1]; pts.push([x, y]); }
                break;
            case 'm': x += a[0]; y += a[1]; sx = x; sy = y; pts.push([x, y]);
                for (let i = 2; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; pts.push([x, y]); }
                break;
            case 'L': for (let i = 0; i < a.length; i += 2) { x = a[i]; y = a[i + 1]; pts.push([x, y]); } break;
            case 'l': for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; pts.push([x, y]); } break;
            case 'H': for (const v of a) { x = v; pts.push([x, y]); } break;
            case 'h': for (const v of a) { x += v; pts.push([x, y]); } break;
            case 'V': for (const v of a) { y = v; pts.push([x, y]); } break;
            case 'v': for (const v of a) { y += v; pts.push([x, y]); } break;
            case 'C': for (let i = 0; i < a.length; i += 6) {
                cubic([x, y], [a[i], a[i + 1]], [a[i + 2], a[i + 3]], [a[i + 4], a[i + 5]]);
                cx = a[i + 2]; cy = a[i + 3]; x = a[i + 4]; y = a[i + 5];
            } break;
            case 'c': for (let i = 0; i < a.length; i += 6) {
                cubic([x, y], [x + a[i], y + a[i + 1]], [x + a[i + 2], y + a[i + 3]], [x + a[i + 4], y + a[i + 5]]);
                cx = x + a[i + 2]; cy = y + a[i + 3]; x += a[i + 4]; y += a[i + 5];
            } break;
            case 'S': for (let i = 0; i < a.length; i += 4) {
                cubic([x, y], [2 * x - cx, 2 * y - cy], [a[i], a[i + 1]], [a[i + 2], a[i + 3]]);
                cx = a[i]; cy = a[i + 1]; x = a[i + 2]; y = a[i + 3];
            } break;
            case 's': for (let i = 0; i < a.length; i += 4) {
                cubic([x, y], [2 * x - cx, 2 * y - cy], [x + a[i], y + a[i + 1]], [x + a[i + 2], y + a[i + 3]]);
                cx = x + a[i]; cy = y + a[i + 1]; x += a[i + 2]; y += a[i + 3];
            } break;
            case 'Z': case 'z': x = sx; y = sy; break;
            default: break;   // arcs/quadratics unused by this path
        }
    }
    return pts;
}

const TRUMP_D = `M1572.782,1400.685c-0.028-0.012-0.056-0.025-0.084-0.037c-8.505-25.787-26.412-46.386-40.104-69.404c-12.055-17.75-18.96-38.427-31.444-55.943c-0.078-3.472-0.234-10.339-0.274-13.811c6.243-0.038,12.446-0.078,18.765-0.038c3.979-4.253,7.959-8.466,11.938-12.718c-0.624-10.26,2.652-20.326,13.263-23.836c-2.769-7.92-8.154-14.512-12.562-21.534c14.2,0.155,28.48-0.703,42.641,0.858c17.321,2.731,36.32,6.281,52.745-1.873c-4.876-5.306-9.753-10.806-11.314-17.984c18.415-4.837,38.193-8.309,54.344-18.804c-5.578-2.769-11.469-4.642-17.478-6.048c-5.618-6.749-14.591-9.753-21.963-3.433c-14.941-1.639-31.249-1.951-44.786-8.543c-10.144-11.352-27.074-22.159-23.057-39.637c10.26-7.802,17.672-18.57,25.554-28.597c3.238-23.095,11.781-45.84,8.7-69.404c-6.32-33.394,1.287-67.96-6.477-101.237c-6.398-25.475-26.841-46.855-25.085-74.28c-1.444-13.303,6.553-26.178,2.457-39.286c-6.281-25.826,5.032-53.329-5.579-78.416c-6.164-16.073,0.663-33.668-4.876-49.819c-26.585-95.385-43.952-91.55-46.073-180.004c-7.413-6.164-14.669-12.445-22.003-18.687c-2.302-14.435-5.266-28.83-4.604-43.499c-4.135-20.989-15.878-39.559-21.847-60.04l6.632,0.117c3.434-20.91-9.948-38.622-15.293-57.895c-9.948-30.508-30.742-55.905-44.201-84.852c-6.086-11.157-9.675-24.149-19.037-33.2c-140.071-113.204-66.004-65.508-240.395-128.624c-1.873,5.383-3.941,10.728-6.086,15.994c-8.193-3.238-16.814-4.916-25.592-5.305c-22.042-6.281-43.031-17.009-66.049-20.209c-5.774-2.457-11.977-2.614-18.062-2.848c-1.132-0.898-3.434-2.692-4.564-3.55c-12.21,0.975-23.993-2.965-35.229-7.139c-19.74-1.132-38.857-6.984-58.557-8.233c-7.802-0.546-16.737,1.99-23.29-3.51c-169.056,1.692-13.616-0.938-183.828,8.154c-30.045,5.3-237.277,69.687-248.354,76.269c-19.124,3.357,1.791-0.527-110.912,44.786c-26.061,11.157-53.954,16.659-80.678,25.943c-27.742,14.978-122.056,42.806-143.605,58.207c-20.872,2.692-41.276-3.589-62.069-2.964c-0.195,2.419-0.586,7.335-0.78,9.753c10.728,4.018,21.146,8.973,30.78,15.253c-15.02,9.909-33.511,6.398-50.405,6.164c0.467,1.639,1.444,4.916,1.911,6.553c4.954,0.663,9.908,1.365,14.864,2.068c0.335,10.401-5.766,5.354-54.501,47.868l-0.195,5.891l2.809,3.043c28.402,1.561,57.075-0.741,85.477,2.223c12.758,4.759,24.617,11.781,37.764,15.566c20.91,5.774,38.272,19.272,53.994,33.668c19.662-3.941,34.487,12.21,53.486,12.679c15.917,4.525,31.99,8.388,48.727,6.865c-8.855,26.178-16.308,53.994-34.643,75.45c-25.866,30.001-41.158,68.389-45.02,107.676c-13.42-0.429-26.412-4.018-39.832-4.525c0,5.071,0.038,10.104,0.038,15.215c-2.457,0.429-7.373,1.365-9.832,1.794c9.207,18.179,22.745,33.668,34.135,50.443c8.114,13.615,25.085,15.41,36.789,24.694c-1.104,27.425-97.786,145.902-110.6,191.122c-4.213,14.707-13.771,27.62-15.839,42.992c14.591,72.25,103.128,36.903,111.655,59.182c-2.692,19.389-5.306,39.325-13.108,57.387c0.234,14.083-2.38,28.44-11.898,39.403c4.135,17.4,8.309,34.838,17.009,50.677c-7.959,10.261-21.067,22.549-12.639,36.554c7.432,24.638,53.112,22.796,34.76,49.116c-21.808,33.394-28.752,75.567-22.588,114.658c30.665,79.52,74.03,88.561,86.218,94.255c104.544,45.02-15.279-20.521,156.011,84.19c34.047,19.663,25.221,18.592,143.839,101.354c17.566,12.944,37.987,20.809,57.465,30.373h878.09c8.525,0,16.676-0.877,24.43-2.498V1400.685z`;

function trumpOutline() {
    const raw = samplePath(TRUMP_D, 2);
    // Decimate to a manageable outline, normalize to ~unit, flip Y.
    const step = Math.max(1, Math.floor(raw.length / 220));
    const pts = raw.filter((_, i) => i % step === 0);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    return pts.map(([x, y]) => [(x - cx) / half, -(y - cy) / half]);
}

// The AG's Biohazard glyph is the Baldwin 1966 trefoil as two multi-subpath
// SVG paths (each closed subpath is a filled piece of the emblem; the gaps
// between pieces ARE the symbol's negative space). We sample every subpath
// and normalize them together — same asset, so the two generators match.
const BIOHAZARD_D1 = `M61.48,33.29c7.07,0,13.63,2.23,18.99,6.03c-0.03,0.04-0.06,0.08-0.09,0.12c-0.73,1.02-1.53,1.97-2.39,2.85 c-0.86,0.87-1.75,1.64-2.68,2.33c-0.26,0.17-0.49,0.38-0.7,0.63c-0.04,0.05-0.09,0.11-0.12,0.16c-3.77-2.36-8.23-3.73-13.01-3.73 c-4.74,0-9.17,1.35-12.92,3.67c-0.19-0.27-0.43-0.51-0.71-0.72c-1.02-0.75-1.95-1.56-2.8-2.43c-0.86-0.88-1.65-1.83-2.36-2.84l0,0 c-0.03-0.04-0.06-0.08-0.09-0.12C47.94,35.49,54.45,33.29,61.48,33.29L61.48,33.29z M94.23,62.73c0.12,1.15,0.18,2.31,0.18,3.49 c0,13.18-7.74,24.55-18.93,29.81c-0.03-0.06-0.05-0.12-0.08-0.18c-0.55-1.11-1-2.26-1.36-3.44c-0.36-1.17-0.62-2.38-0.79-3.62l0,0 c-0.03-0.23-0.09-0.46-0.17-0.69c-0.03-0.07-0.05-0.13-0.08-0.2c7.76-4.13,13.04-12.29,13.04-21.69c0-0.47-0.01-0.94-0.04-1.41 c0.29-0.04,0.59-0.11,0.88-0.24c1.09-0.47,2.27-0.87,3.51-1.19c1.2-0.31,2.38-0.51,3.52-0.62C94.01,62.76,94.12,62.75,94.23,62.73 L94.23,62.73z M47.98,96.27C36.52,91.11,28.55,79.6,28.55,66.22c0-1.32,0.08-2.62,0.23-3.9c0.1,0.02,0.19,0.03,0.29,0.04 c1.24,0.1,2.46,0.29,3.64,0.57c1.15,0.28,2.32,0.66,3.51,1.16l0-0.01c0.19,0.08,0.38,0.14,0.58,0.18c0.07,0.01,0.13,0.02,0.2,0.03 c-0.05,0.63-0.07,1.27-0.07,1.92c0,9.62,5.53,17.94,13.59,21.97c-0.1,0.25-0.18,0.51-0.22,0.79c-0.17,1.2-0.45,2.4-0.82,3.6 c-0.36,1.14-0.8,2.25-1.31,3.3C48.09,96,48.03,96.13,47.98,96.27L47.98,96.27z`;
const BIOHAZARD_D2 = `M114.81,103.94c-10.55,12.61-28.94,16.2-43.67,7.7c-3.9-2.25-7.2-5.15-9.83-8.49 c-10.48,12.99-29.15,16.78-44.06,8.17c-2.74-1.58-5.19-3.49-7.31-5.64c1.23,1.06,2.58,2.02,4.04,2.87 c12.67,7.32,28.88,2.97,36.2-9.7c4.57-7.91,4.59-17.21,0.88-24.85l4.81-2.98c1.45,1.61,3.55,2.62,5.89,2.62 c2.17,0,4.14-0.87,5.57-2.29l0.44,0.26l4.81,2.44c-6.1,12.28-1.67,27.36,10.37,34.31C93.55,114.47,106.65,112.33,114.81,103.94 L114.81,103.94z M69.13,68.62c0.36-0.9,0.56-1.89,0.56-2.92c0-3.96-2.9-7.23-6.68-7.83v-5.59c8.56-0.48,16.73-5.13,21.34-13.11 c7.26-12.58,2.95-28.67-9.63-35.93c-2.79-1.61-5.75-2.65-8.76-3.16c16.94,2.19,30.03,16.67,30.03,34.2c0,4.73-0.95,9.24-2.68,13.35 c4.22,0.61,8.4,2.01,12.32,4.27c13.65,7.88,19.88,23.69,16.22,38.25c1.83-10.51-2.93-21.52-12.71-27.16 c-12.06-6.96-27.36-3.24-34.94,8.23l-1.82-0.93l0,0L69.13,68.62L69.13,68.62z M54.23,68.22l-4.77,2.95 c-2.21-3.4-5.23-6.35-8.98-8.52c-12.67-7.32-28.88-2.97-36.2,9.7c-3.25,5.62-4.2,11.94-3.14,17.87 c-2.23-8.48-1.25-17.81,3.49-26.01c5.5-9.52,14.84-15.43,24.93-16.89c-1.64-4.02-2.55-8.43-2.55-13.04 c0-17.74,13.4-32.36,30.63-34.27C50,1.16,42.94,5.65,38.78,12.86c-7.26,12.58-2.95,28.67,9.63,35.93c3.59,2.08,7.48,3.2,11.35,3.47 v5.77c-3.41,0.88-5.94,3.99-5.94,7.68C53.82,66.58,53.97,67.43,54.23,68.22L54.23,68.22z`;

/** Sample every closed subpath of the biohazard emblem, normalized to unit. */
function biohazardParts() {
    const subs = [...BIOHAZARD_D1.split(/(?=M)/), ...BIOHAZARD_D2.split(/(?=M)/)]
        .map(s => s.trim())
        .filter(Boolean)
        .map(d => {
            const raw = samplePath(d, 3);
            const step = Math.max(1, Math.floor(raw.length / 44));
            return raw.filter((_, i) => i % step === 0);
        });
    const all = subs.flat();
    const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const half = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 2;
    return subs.map(pts => pts.map(([x, y]) => [(x - cx) / half, -(y - cy) / half]));
}

// ── Symbol registry ──────────────────────────────────────────────────────
// P = quick part constructor.
const P = (pts, opts = {}) => ({
    pts,
    closed: opts.closed !== false,
    fill: opts.fill !== false,
    role: opts.role || 'primary',
    wireOnly: opts.wireOnly || false,
    solidOnly: opts.solidOnly || false,
});

const SYMBOLS = {
    // The classic 5-line stroke self-intersects (ear-clip can't fill it),
    // so wire and solid use different geometry: stroke for wire, a simple
    // 10-point star polygon for solid.
    pentagram: () => [
        P(pentagramPath(0.92), { wireOnly: true, fill: false }),
        P(star(5, 0.92, 0.35), { solidOnly: true }),
        P(circle(0, 0, 1.05, 40), { fill: false, role: 'secondary' }),
    ],
    'star-of-david': () => [
        P([[0, 1], [-0.87, -0.5], [0.87, -0.5]]),
        P([[0, -1], [0.87, 0.5], [-0.87, 0.5]]),
    ],
    cross: () => [
        // Latin cross: the crossbar sits ABOVE center, about 2/3 up the
        // upright on screen (positive y here — user-verified orientation).
        P([[-0.22, 1], [0.22, 1], [0.22, 0.55], [0.8, 0.55], [0.8, 0.13], [0.22, 0.13],
           [0.22, -1], [-0.22, -1], [-0.22, 0.13], [-0.8, 0.13], [-0.8, 0.55], [-0.22, 0.55]]),
    ],
    // Hilal, using the AG's exact construction: the inner circle is
    // internally TANGENT to the outer at (1, 0) — innerR + offset = 1 —
    // so the crescent tips meet in a point. Star nestled in the bite.
    'crescent-star': () => {
        // Two INTERSECTING circles (not tangent): the horns are the two
        // real intersection points, and the path is one simple polygon —
        // outer arc the long way around the left, inner arc back up the
        // left bulge. (The old slit-annulus construction was degenerate at
        // the tangency and the triangulator filled it as a blob.)
        const ri = 0.82, d = 0.45;
        const hx = (1 + d * d - ri * ri) / (2 * d);
        const hy = Math.sqrt(Math.max(0, 1 - hx * hx));
        const t1 = Math.atan2(hy, hx);                      // upper horn (outer angle)
        const pts = [];
        const N = 36;
        for (let k = 0; k <= N; k++) {                      // outer: CCW, upper horn → lower horn
            const a = t1 + (k / N) * (Math.PI * 2 - 2 * t1);
            pts.push([Math.cos(a), Math.sin(a)]);
        }
        const pLow = Math.atan2(-hy, hx - d);               // lower horn (inner angle)
        const end = -pLow - Math.PI * 2;                    // upper horn, one turn down
        for (let k = 1; k <= N; k++) {                      // inner: back up the left bulge
            const a = pLow + (k / N) * (end - pLow);
            pts.push([d + ri * Math.cos(a), ri * Math.sin(a)]);
        }
        return [
            P(pts),
            P(star(5, 0.32, 0.122, 90).map(([x, y]) => [x + 0.62, y]),
              { role: 'secondary' }),
        ];
    },
    peace: () => [
        P(circle(0, 0, 1, 40), { fill: false }),
        P([[0, 1], [0, -1]], { closed: false, fill: false }),
        P([[0, 0], [-0.71, -0.71]], { closed: false, fill: false }),
        P([[0, 0], [0.71, -0.71]], { closed: false, fill: false }),
    ],
    radioactive: () => {
        const wedge = (a0) => P([[0, 0], ...arc(0, 0, 1, a0, a0 + 60, 12)]);
        return [
            wedge(30), wedge(150), wedge(270),
            P(circle(0, 0, 0.22, 20), { role: 'secondary' }),
        ];
    },
    // Baldwin 1966 trefoil, sampled from the same SVG paths the standard
    // Animation Generator renders (6 filled pieces; the gaps between them
    // are the emblem's negative space).
    biohazard: () => biohazardParts().map(pts => P(pts)),
    'yin-yang': () => {
        const rightHalf = [
            ...arc(0, 0, 1, -90, 90, 24),          // outer right
            ...arc(0, 0.5, 0.5, 90, -90, 14),      // upper S bulge (through x>0)
            ...arc(0, -0.5, 0.5, 90, 270, 14),     // lower S hollow (through x<0)
        ];
        const leftHalf = rightHalf.map(([x, y]) => [-x, -y]);
        return [
            P(rightHalf, { role: 'primary' }),
            P(leftHalf, { role: 'secondary' }),
            P(circle(0, 0.5, 0.15, 14), { role: 'secondary' }),
            P(circle(0, -0.5, 0.15, 14), { role: 'primary' }),
        ];
    },
    // One simple 20-vertex polygon tracing the union of the two bars and
    // four hooks — a single clean outline (the old trace revisited interior
    // vertices, which drew stray connecting lines), and ear-clip fillable.
    swastika: () => [
        P([
            [-0.15, 0.85], [0.85, 0.85], [0.85, 0.55], [0.15, 0.55], [0.15, 0.15],
            [0.85, 0.15], [0.85, -0.85], [0.55, -0.85], [0.55, -0.15], [0.15, -0.15],
            [0.15, -0.85], [-0.85, -0.85], [-0.85, -0.55], [-0.15, -0.55], [-0.15, -0.15],
            [-0.85, -0.15], [-0.85, 0.85], [-0.55, 0.85], [-0.55, 0.15], [-0.15, 0.15],
        ]),
    ],
    // Soviet emblem, ported from the same 24×24 flag-SVG geometry the
    // standard Animation Generator renders: sickle blade traced from 5
    // cubic Béziers + handle parallelogram + grip ellipse, and a hammer
    // with a rounded butt cap.
    'hammer-sickle': () => {
        const svg2local = ([x, y]) => [(x - 12) / 12, (12 - y) / 12];
        const bez = (p0, p1, p2, p3, n = 12) => {
            const out = [];
            for (let k = 1; k <= n; k++) {
                const t = k / n, u = 1 - t;
                out.push([
                    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
                    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
                ]);
            }
            return out;
        };

        const sickleBeziers = [
            [[11, 3], [16, 3], [21, 7], [21, 12]],
            [[21, 12], [21, 16], [18, 20], [14, 20]],
            [[14, 20], [12, 20], [10, 19], [10, 17]],
            [[10, 17], [13, 17], [16, 16], [17, 13]],
            [[17, 13], [18, 9], [15, 5], [11, 3]],
        ];
        const sickle = [sickleBeziers[0][0]];
        for (const [p0, p1, p2, p3] of sickleBeziers) sickle.push(...bez(p0, p1, p2, p3));

        const handle = [[11, 18], [8, 22], [6, 21], [10, 17]];
        const grip = [];
        for (let k = 0; k < 20; k++) {
            const a = (k / 20) * Math.PI * 2;
            grip.push([6 + 2 * Math.cos(a), 21.5 + 1.3 * Math.sin(a)]);
        }

        // Hammer body + rounded butt cap (a semicircle on the chord
        // between the two cap corners, bulging away from the body).
        const A = [20.16, 23.01], Bp = [22.15, 21.03];
        const mid = [(A[0] + Bp[0]) / 2, (A[1] + Bp[1]) / 2];
        const r = Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) / 2;
        const a0 = Math.atan2(A[1] - mid[1], A[0] - mid[0]);
        const capOf = (dir) => {
            const out = [];
            for (let k = 1; k < 10; k++) {
                const a = a0 + dir * (k / 10) * Math.PI;
                out.push([mid[0] + r * Math.cos(a), mid[1] + r * Math.sin(a)]);
            }
            return out;
        };
        let cap = capOf(1);
        const probe = cap[4];
        // Outward ≈ +x+y in SVG space (down-right, away from the shaft).
        if ((probe[0] - mid[0]) + (probe[1] - mid[1]) < 0) cap = capOf(-1);
        const hammer = [
            [7.03, 4.43], [6.29, 5.18], [4.31, 7.16], [1.83, 9.64],
            [4.55, 12.36], [7.03, 9.88], [20.16, 23.01],
            ...cap,
            [22.15, 21.03], [9.01, 7.90], [9.76, 7.16], [12.00, 4.93],
        ];

        return [
            P(sickle.map(svg2local)),
            P(handle.map(svg2local)),
            P(grip.map(svg2local)),
            P(hammer.map(svg2local), { role: 'secondary' }),
        ];
    },
    heart: () => {
        const pts = [];
        for (let i = 0; i < 40; i++) {
            const t = (i / 40) * Math.PI * 2;
            pts.push([
                (16 * Math.sin(t) ** 3) / 17,
                (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17,
            ]);
        }
        return [P(pts)];
    },
    // $: a CONTINUOUS S — the two arcs meet exactly at the center (270°
    // of the top circle = 90° of the bottom circle = origin), instead of
    // the old disconnected pair.
    dollar: () => [
        P([...arc(0, 0.375, 0.375, 30, 270, 18), ...arc(0, -0.375, 0.375, 90, -150, 18)],
          { closed: false, fill: false }),
        P([[0, 1.0], [0, -1.0]], { closed: false, fill: false, role: 'secondary' }),
    ],
    euro: () => [
        P(arc(0.15, 0, 0.85, 55, 305, 26), { closed: false, fill: false }),
        P([[-0.85, 0.18], [0.35, 0.18]], { closed: false, fill: false, role: 'secondary' }),
        P([[-0.85, -0.18], [0.25, -0.18]], { closed: false, fill: false, role: 'secondary' }),
    ],
    yen: () => [
        P([[-0.6, 1], [0, 0.25], [0.6, 1]], { closed: false, fill: false }),
        P([[0, 0.25], [0, -1]], { closed: false, fill: false }),
        P([[-0.5, 0.05], [0.5, 0.05]], { closed: false, fill: false, role: 'secondary' }),
        P([[-0.5, -0.3], [0.5, -0.3]], { closed: false, fill: false, role: 'secondary' }),
    ],
    // USSF delta, ported from the AG's exact vertices: notched outer
    // triangle + inner chevron + 4-point star (classic proportions).
    delta: () => {
        const innerScale = 0.85;
        const starPts = [];
        for (let i = 0; i < 8; i++) {
            const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
            const r = (i % 2 === 0) ? 0.118 : 0.038;
            starPts.push([Math.cos(a) * r, -0.28 + Math.sin(a) * r]);
        }
        return [
            P([[0, 1], [-0.667, -1], [0, -0.598], [0.667, -1]]),                     // notched delta
            P([[0, 0.826 * innerScale], [-0.567 * innerScale, -0.875 * innerScale],
               [0, -0.535 * innerScale], [0.567 * innerScale, -0.875 * innerScale]],
              { fill: false }),                                                       // chevron outline
            P(starPts, { role: 'secondary' }),                                        // 4-point star
        ];
    },
    // The AG's exact stargate: outer triangle, 5-vertex chevron whose
    // feet land on the base, and an annular ring floating above the apex.
    stargate: () => [
        // OPEN paths: closing them drew a stray baseline along y=-1
        // (user: "bottom line not supposed to be there").
        P([[-0.83, -1.0], [0, 0.505], [0.83, -1.0]], { fill: false, closed: false }),
        P([[0.42, -1.0], [0.52, -0.76], [0, 0.157], [-0.52, -0.76], [-0.42, -1.0]], { fill: false, closed: false }),
        // Foot caps: close each leg's bottom individually (a single
        // full-width baseline is exactly what we removed earlier).
        P([[-0.83, -1.0], [-0.42, -1.0]], { fill: false, closed: false }),
        P([[0.42, -1.0], [0.83, -1.0]], { fill: false, closed: false }),
        { annulus: { rOuter: 0.191, rInner: 0.104, n: 24, cy: 0.809 }, role: 'secondary',
          pts: [], closed: true, fill: true, wireOnly: false, solidOnly: false },
    ],
    trump: () => [P(trumpOutline())],
};

// ── Part → mesh ──────────────────────────────────────────────────────────

function planarUV(pts3, allPts) {
    const xs = allPts.map(p => p[0]), ys = allPts.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX || 1, h = maxY - minY || 1;
    return (p) => [(p[0] - minX) / w, 1 - (p[1] - minY) / h];
}

function annulusFrame(rOuter, rInner, n) {
    const vertices = [];
    const faces = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        vertices.push(
            { p: [c * rOuter, s * rOuter, 0], n: [0, 0, 1], uv: [i / n, 0] },
            { p: [c * rInner, s * rInner, 0], n: [0, 0, 1], uv: [i / n, 1] },
        );
    }
    for (let i = 0; i < n; i++) {
        const a = i * 2, b = ((i + 1) % n) * 2;
        faces.push([a, a + 1, b + 1], [a, b + 1, b]);
    }
    return { vertices, faces };
}

function fillFrame(pts2, uvOf) {
    const { pts, tris } = earClip(pts2);
    const vertices = pts.map(p => ({ p: [p[0], p[1], 0], n: [0, 0, 1], uv: uvOf(p) }));
    return { vertices, faces: tris };
}

function outlineEdges(part) {
    const n = part.pts.length;
    const edges = [];
    for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
    if (part.closed !== false && n > 2) edges.push([n - 1, 0]);
    return edges;
}

/**
 * Build a symbol's meshes.
 * @param {string} name SYMBOLS key
 * @param {object} opts { style: 'wire'|'solid', thickness }
 * @returns {{ parts: Array<{mesh, role}>, spawnVertices: number[][] }}
 */
function buildSymbol(name, opts = {}) {
    const def = SYMBOLS[name];
    if (!def) throw new Error(`efk_symbols: unknown symbol "${name}"`);
    const parts = def();
    const thickness = opts.thickness ?? 0.035;
    const solid = opts.style === 'solid';

    const allPts = parts.flatMap(p => p.annulus ? circle(0, p.annulus.cy || 0, p.annulus.rOuter, 8) : p.pts);
    const uvOf = planarUV(null, allPts);

    // Merge same-role parts into one mesh each (fewer model nodes).
    const meshesByRole = new Map();
    const push = (role, frame) => {
        if (!meshesByRole.has(role)) meshesByRole.set(role, { vertices: [], faces: [] });
        const m = meshesByRole.get(role);
        const base = m.vertices.length;
        m.vertices.push(...frame.vertices);
        m.faces.push(...frame.faces.map(f => f.map(i => i + base)));
    };

    for (const part of parts) {
        if (part.wireOnly && solid) continue;
        if (part.solidOnly && !solid) continue;
        const role = part.role || 'primary';
        if (part.annulus) {
            const frame = annulusFrame(part.annulus.rOuter, part.annulus.rInner, part.annulus.n);
            const cy = part.annulus.cy || 0;
            if (cy) for (const v of frame.vertices) v.p[1] += cy;
            push(role, frame);
            continue;
        }
        if (solid && part.fill !== false && part.closed !== false && part.pts.length > 2) {
            push(role, fillFrame(part.pts, uvOf));
        } else {
            const pts3 = part.pts.map(p => [p[0], p[1], 0]);
            push(role, M.strutFrame(pts3, outlineEdges(part), thickness));
        }
    }

    const spawnVertices = [];
    for (const part of parts) {
        const src = part.annulus ? circle(0, part.annulus.cy || 0, part.annulus.rOuter, 12) : part.pts;
        const step = Math.max(1, Math.floor(src.length / 12));
        for (let i = 0; i < src.length; i += step) spawnVertices.push([src[i][0], src[i][1], 0]);
    }

    return {
        parts: [...meshesByRole.entries()].map(([role, mesh]) => ({ role, mesh: { ...mesh, scale: 1 } })),
        spawnVertices,
    };
}

return {
    buildSymbol,
    SYMBOL_NAMES: Object.keys(SYMBOLS),
    earClip,       // exposed for tests
    samplePath,
};
});
