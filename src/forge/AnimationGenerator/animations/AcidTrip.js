/**
 * Acid Trip — kaleidoscopic psychedelic radial pattern. Per-pixel
 * ImageData render so the colour bands are sharp regardless of
 * resolution.
 *
 * Composition (each pixel inside the disc):
 *   1. Compute polar (r, θ) from the centre.
 *   2. Fold θ through N-fold MIRROR symmetry to produce a kaleidoscope
 *      wedge — every pixel inside the disc maps into a small sector
 *      that all the other sectors mirror.
 *   3. Inside the wedge, evaluate a multi-harmonic sinusoidal "noise"
 *      field. Multiple overlapping waves at different frequencies
 *      give the iconic ink-in-water organic flow look.
 *   4. Time-shift each harmonic with integer cycles per loop for
 *      seamless looping.
 *   5. Map the noise output → HSL → RGB. Hue cycles slowly through
 *      the colour wheel; saturation/lightness drive the deep purple +
 *      bright highlight psychedelic palette.
 *
 * Performance: per-pixel geometry (sqrt/atan2) is precomputed into
 * Float32Arrays keyed on canvas size and reused across frames. When
 * rotationSpeed=0 (the default), the cos/sin for the wedge fold and
 * the sin-argument bases are also precomputed — the per-frame inner
 * loop then performs only 3 Math.sin() calls + HSL→RGB arithmetic per
 * pixel, roughly 4–6× faster than the naive per-frame implementation.
 */

// File-scope cache — survives across frame calls without touching window.
const _AT_CACHE = {
    off:   null,   // reused offscreen canvas
    buf:   null,   // reused ImageData (avoids per-frame allocation)
    geo:   null,   // { D } + rNorm/theta0/centerBoost/inside arrays
    wedge: null,   // { D, sym, det } + precomputed sin-arg bases
};

function renderAcidTripFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim  = Math.min(w, h);
    const R       = Math.max(2, Math.round(minDim * 0.5 * params.size));
    const D       = R * 2;
    const opacity = params.opacity;

    const symmetry     = Math.max(1, Math.round(params.symmetry));
    const flowSpeed    = Math.round(params.flowSpeed);
    const colorSpeed   = Math.round(params.colorSpeed);
    const rotSpeed     = Math.round(params.rotationSpeed || 0);
    const detail       = Math.max(1, params.detail);
    const baseHue      = params.baseHue;
    const hueRange     = params.hueRange;
    const saturation   = Math.max(0, Math.min(1, params.saturation));
    const lightnessBase = Math.max(0, Math.min(1, params.lightness));

    // Offscreen canvas ----------------------------------------------------
    if (!_AT_CACHE.off) _AT_CACHE.off = document.createElement('canvas');
    const off = _AT_CACHE.off;
    if (off.width !== D || off.height !== D) { off.width = D; off.height = D; }
    const offCtx = off.getContext('2d');

    // Reusable ImageData buffer -------------------------------------------
    if (!_AT_CACHE.buf || _AT_CACHE.buf.width !== D || _AT_CACHE.buf.height !== D) {
        _AT_CACHE.buf = offCtx.createImageData(D, D);
    }
    const data = _AT_CACHE.buf.data;

    // Geometry cache: rNorm, theta0, centerBoost, inside -----------------
    // Invalidated only when D (canvas size) changes. Eliminates
    // Math.sqrt and Math.atan2 from the per-frame inner loop.
    if (!_AT_CACHE.geo || _AT_CACHE.geo.D !== D) {
        const N = D * D;
        const rNormA  = new Float32Array(N);
        const theta0A = new Float32Array(N);
        const boostA  = new Float32Array(N);
        const insideA = new Uint8Array(N);
        const R2 = R * R;
        for (let py = 0; py < D; py++) {
            const dy  = py - R;
            const dy2 = dy * dy;
            for (let px = 0; px < D; px++) {
                const dx     = px - R;
                const distSq = dx * dx + dy2;
                const idx    = py * D + px;
                if (distSq > R2) continue;
                insideA[idx] = 1;
                const rn = Math.sqrt(distSq) / R;
                rNormA[idx]  = rn;
                theta0A[idx] = Math.atan2(dy, dx);
                const q = 1 - rn;
                boostA[idx]  = 0.25 * q * q;
            }
        }
        _AT_CACHE.geo = { D, rNormA, theta0A, boostA, insideA };
    }
    const { rNormA, theta0A, boostA, insideA } = _AT_CACHE.geo;

    // Wedge + sin-base cache: xC, yC, wBase1/2/3 -------------------------
    // Only built when rotationSpeed=0. Invalidated when D, symmetry, or
    // detail change. Eliminates cos/sin for the wedge fold AND
    // precomputes the constant parts of each sin() argument so the
    // per-frame loop adds only the time-varying phase.
    const useWedge = (rotSpeed === 0);
    if (useWedge && (
            !_AT_CACHE.wedge ||
            _AT_CACHE.wedge.D   !== D ||
            _AT_CACHE.wedge.sym !== symmetry ||
            _AT_CACHE.wedge.det !== detail)) {
        const tau         = Math.PI * 2;
        const sectorAngle = tau / symmetry;
        const halfSector  = sectorAngle * 0.5;
        const N   = D * D;
        const wb1A = new Float32Array(N);
        const wb2A = new Float32Array(N);
        const wb3A = new Float32Array(N);
        for (let idx = 0; idx < N; idx++) {
            if (!insideA[idx]) continue;
            const rn = rNormA[idx];
            let st   = ((theta0A[idx] % sectorAngle) + sectorAngle) % sectorAngle;
            if (st > halfSector) st = sectorAngle - st;
            const xC = rn * Math.cos(st) * detail;
            const yC = rn * Math.sin(st) * detail;
            wb1A[idx] = xC * 6.0  + yC * 4.0;
            wb2A[idx] = xC * 11.0 - yC * 7.0;
            wb3A[idx] = (xC + yC) * 9.0 + rn * Math.PI * 4;
        }
        _AT_CACHE.wedge = { D, sym: symmetry, det: detail, wb1A, wb2A, wb3A };
    }

    // Per-frame constants -------------------------------------------------
    const tau         = Math.PI * 2;
    const ph1         = t * flowSpeed * tau;
    const ph2         = t * (flowSpeed + 1) * tau;
    const ph3         = t * (flowSpeed * 2) * tau;
    const hueShift    = t * colorSpeed * 360;
    const rotOffset   = t * rotSpeed * tau;
    const sectorAngle = tau / symmetry;
    const halfSector  = sectorAngle * 0.5;
    const N = D * D;

    // Inner loop ----------------------------------------------------------
    if (useWedge) {
        // Fast path (rotation=0): 3 Math.sin() + HSL→RGB per inside pixel.
        const { wb1A, wb2A, wb3A } = _AT_CACHE.wedge;
        for (let idx = 0; idx < N; idx++) {
            const i = idx << 2;
            if (!insideA[idx]) { data[i + 3] = 0; continue; }
            const value = (Math.sin(wb1A[idx] + ph1) +
                           Math.sin(wb2A[idx] + ph2) +
                           Math.sin(wb3A[idx] + ph3)) * 0.3333;
            const hue       = baseHue + value * hueRange * 0.5 + hueShift;
            const lightness = Math.max(0.05, Math.min(0.95,
                lightnessBase + 0.35 * Math.abs(value) + boostA[idx]));
            const hh = ((hue % 360) + 360) % 360;
            const c  = (1 - Math.abs(2 * lightness - 1)) * saturation;
            const x  = c * (1 - Math.abs(((hh / 60) % 2) - 1));
            const m  = lightness - c / 2;
            let r = 0, g = 0, b = 0;
            if      (hh < 60)  { r = c; g = x; }
            else if (hh < 120) { r = x; g = c; }
            else if (hh < 180) { g = c; b = x; }
            else if (hh < 240) { g = x; b = c; }
            else if (hh < 300) { r = x; b = c; }
            else               { r = c; b = x; }
            data[i    ] = ((r + m) * 255) | 0;
            data[i + 1] = ((g + m) * 255) | 0;
            data[i + 2] = ((b + m) * 255) | 0;
            data[i + 3] = 255;
        }
    } else {
        // Rotating path: xC/yC change per frame (rotOffset varies).
        // Still saves sqrt + atan2 via geometry cache.
        for (let idx = 0; idx < N; idx++) {
            const i = idx << 2;
            if (!insideA[idx]) { data[i + 3] = 0; continue; }
            const rn    = rNormA[idx];
            const theta = theta0A[idx] + rotOffset;
            let st = ((theta % sectorAngle) + sectorAngle) % sectorAngle;
            if (st > halfSector) st = sectorAngle - st;
            const xC    = rn * Math.cos(st) * detail;
            const yC    = rn * Math.sin(st) * detail;
            const value = (Math.sin(xC * 6.0  + yC * 4.0  + ph1) +
                           Math.sin(xC * 11.0 - yC * 7.0  + ph2) +
                           Math.sin((xC + yC) * 9.0 + rn * Math.PI * 4 + ph3)) * 0.3333;
            const hue       = baseHue + value * hueRange * 0.5 + hueShift;
            const lightness = Math.max(0.05, Math.min(0.95,
                lightnessBase + 0.35 * Math.abs(value) + boostA[idx]));
            const hh = ((hue % 360) + 360) % 360;
            const c  = (1 - Math.abs(2 * lightness - 1)) * saturation;
            const x  = c * (1 - Math.abs(((hh / 60) % 2) - 1));
            const m  = lightness - c / 2;
            let r = 0, g = 0, b = 0;
            if      (hh < 60)  { r = c; g = x; }
            else if (hh < 120) { r = x; g = c; }
            else if (hh < 180) { g = c; b = x; }
            else if (hh < 240) { g = x; b = c; }
            else if (hh < 300) { r = x; b = c; }
            else               { r = c; b = x; }
            data[i    ] = ((r + m) * 255) | 0;
            data[i + 1] = ((g + m) * 255) | 0;
            data[i + 2] = ((b + m) * 255) | 0;
            data[i + 3] = 255;
        }
    }

    offCtx.putImageData(_AT_CACHE.buf, 0, 0);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(off, Math.round(cx - R), Math.round(cy - R));
    ctx.restore();
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'effect',
    id:           'acidtrip',
    name:         'Acid Trip',
    description:  'Kaleidoscopic psychedelic mandala — N-fold mirror-symmetric radial pattern with overlapping sinusoidal noise and HSL colour cycling. Crank Symmetry, Flow Speed, and Color Speed for maximum trip.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'size', label: 'Size',
            description: 'Overall disc size (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.95 },

        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'symmetry', label: 'Symmetry',
            description: 'N-fold mirror symmetry of the kaleidoscope. Higher = more "petals" of the mandala. 6–12 is the classic acid look; 24+ gets very fine.',
            type: 'slider', min: 2, max: 24, step: 1, default: 8 },
        { key: 'detail', label: 'Detail',
            description: 'Spatial frequency multiplier for the noise field — higher = finer / busier patterns.',
            type: 'slider', min: 0.3, max: 4, step: 0.05, default: 1.4 },
        { key: 'flowSpeed', label: 'Flow Speed',
            description: 'Whole cycles per loop of the underlying noise waves. Integer for seamless looping. Higher = more violent motion.',
            type: 'slider', min: 0, max: 6, step: 1, default: 1 },
        { key: 'rotationSpeed', label: 'Rotation Speed',
            description: 'Whole rotations of the kaleidoscope pattern per loop. Integer for seamless looping. Positive = clockwise, negative = counter-clockwise, 0 = no rotation.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },

        { key: 'baseHue', label: 'Base Hue',
            description: 'Starting hue for the colour wheel (degrees). 0 = red, 120 = green, 240 = blue, 280 = canonical psychedelic purple.',
            type: 'slider', min: 0, max: 359, step: 1, default: 280 },
        { key: 'hueRange', label: 'Hue Range',
            description: 'How many degrees of the hue wheel the noise value spans. Higher = more rainbow contrast; lower = monochromatic flow.',
            type: 'slider', min: 0, max: 360, step: 5, default: 180 },
        { key: 'colorSpeed', label: 'Color Speed',
            description: 'Whole rainbow cycles per loop (hue rotation over time). Integer for seamless looping. 0 = static palette.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },
        { key: 'saturation', label: 'Saturation',
            description: 'Colour saturation. 1.0 = vivid neon, 0 = grayscale.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 1.0 },
        { key: 'lightness', label: 'Lightness Base',
            description: 'Base lightness of the colour bands. Wave value adds up to +0.35 on top.',
            type: 'slider', min: 0.05, max: 0.85, step: 0.02, default: 0.30 },

        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderAcidTripFrame
});
