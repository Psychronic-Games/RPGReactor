/**
 * Hypnotize — classic black/white hypnotic spiral. Per-pixel rendering
 * via ImageData so the stripes have sharp boundaries no matter the
 * spiral curvature or zoom.
 *
 * Maths: at each pixel, convert to polar (r, θ) and compute:
 *
 *      u = (r/R) · stripeCount  −  (θ / 2π) · twist
 *
 *   floor(u) mod 2 decides the stripe colour. Adding rotOffset to θ
 *   (integer cycles per loop) spins the pattern seamlessly.
 *
 * Performance: the per-pixel u value breaks into a static part and a
 * per-frame scalar offset:
 *
 *      uBase = rNorm · stripes − theta0 / tau · twist    (static per pixel)
 *      u     = uBase − rotOffset / tau · twist           (one subtract/frame)
 *
 * When D, stripeCount, or twist changes the uBase array is rebuilt.
 * Otherwise the inner loop performs ZERO trig calls — just a float
 * subtraction + floor + branch per inside pixel.
 */

const _HYP = {
    off:  null,   // reused offscreen canvas
    buf:  null,   // reused ImageData
    geo:  null,   // { D, insideA } — inside-disc mask
    wave: null,   // { D, stripes, twist, uBaseA } — precomputed per-pixel u base
};

function renderHypnotizeFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t      = frameIdx / totalFrames;
    const cx     = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy     = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);
    const R      = Math.max(2, Math.round(minDim * 0.5 * params.size));
    const D      = R * 2;
    const opacity = params.opacity;

    const stripeCount = Math.max(1, Math.round(params.stripeCount));
    const rawTwist    = Math.round(params.twist || 0);
    const twist       = rawTwist % 2 === 0 ? rawTwist : rawTwist + 1;
    const rotSpeed    = Math.round(params.rotationSpeed);

    const parseHex = (hex) => {
        const m = (hex || '#000000').match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
    };
    const [cr1, cg1, cb1] = parseHex(params.color1);
    const [cr2, cg2, cb2] = parseHex(params.color2);

    // Offscreen canvas ----------------------------------------------------
    if (!_HYP.off) _HYP.off = document.createElement('canvas');
    const off = _HYP.off;
    if (off.width !== D || off.height !== D) { off.width = D; off.height = D; }
    const offCtx = off.getContext('2d');

    // Reusable ImageData buffer -------------------------------------------
    if (!_HYP.buf || _HYP.buf.width !== D || _HYP.buf.height !== D) {
        _HYP.buf = offCtx.createImageData(D, D);
    }
    const data = _HYP.buf.data;

    // Inside-disc mask ----------------------------------------------------
    // Rebuilt only when D changes.
    if (!_HYP.geo || _HYP.geo.D !== D) {
        const N = D * D;
        const insideA = new Uint8Array(N);
        const R2 = R * R;
        for (let py = 0; py < D; py++) {
            const dy  = py - R;
            const dy2 = dy * dy;
            for (let px = 0; px < D; px++) {
                const dx = px - R;
                if (dx * dx + dy2 <= R2) insideA[py * D + px] = 1;
            }
        }
        _HYP.geo = { D, insideA };
    }
    const { insideA } = _HYP.geo;

    // uBase cache: rNorm*stripes − theta0/tau*twist -----------------------
    // Precomputes the static part of u so the inner loop needs only a
    // single subtraction per pixel. Rebuilt when D, stripeCount, or
    // twist changes.
    if (!_HYP.wave ||
            _HYP.wave.D       !== D ||
            _HYP.wave.stripes !== stripeCount ||
            _HYP.wave.twist   !== twist) {
        const tau = Math.PI * 2;
        const N   = D * D;
        const uBaseA = new Float32Array(N);
        const tauRecip = 1 / tau;
        for (let py = 0; py < D; py++) {
            const dy = py - R;
            const dy2 = dy * dy;
            for (let px = 0; px < D; px++) {
                const dx = px - R;
                const idx = py * D + px;
                if (!insideA[idx]) continue;
                const rNorm = Math.sqrt(dx * dx + dy2) / R;
                const theta0 = Math.atan2(dy, dx);
                uBaseA[idx] = rNorm * stripeCount - theta0 * tauRecip * twist;
            }
        }
        _HYP.wave = { D, stripes: stripeCount, twist, uBaseA };
    }
    const { uBaseA } = _HYP.wave;

    // Per-frame scalar offset: rotOffset/tau * twist ---------------------
    const rotOffset = t * rotSpeed * Math.PI * 2;
    const uOffset   = rotOffset / (Math.PI * 2) * twist;
    const N = D * D;

    // Inner loop: zero trig per pixel ------------------------------------
    for (let idx = 0; idx < N; idx++) {
        const i = idx << 2;
        if (!insideA[idx]) { data[i + 3] = 0; continue; }
        const u = uBaseA[idx] - uOffset;
        const stripe   = Math.floor(u);
        const colorBit = ((stripe % 2) + 2) % 2;
        data[i    ] = colorBit === 0 ? cr1 : cr2;
        data[i + 1] = colorBit === 0 ? cg1 : cg2;
        data[i + 2] = colorBit === 0 ? cb1 : cb2;
        data[i + 3] = 255;
    }

    offCtx.putImageData(_HYP.buf, 0, 0);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(off, Math.round(cx - R), Math.round(cy - R));
    ctx.restore();

    // Optional outer rim.
    if (params.outerRing > 0.01) {
        ctx.strokeStyle = hexWithAlpha(params.color1, opacity * params.outerRing);
        ctx.lineWidth   = Math.max(0.5, minDim * 0.004 * params.outerRingThickness);
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.stroke();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'effect',
    id:           'hypnotize',
    name:         'Hypnotize',
    description:  'Classic spinning hypnosis spiral — alternating bands of colour curling outward from the centre. Tune Stripe Count for chunkier/finer bands and Spirality for circles → tight spiral.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Band Color 1',
            description: 'Colour of every other band (canonical: black).',
            type: 'color', default: '#000000', randomColorRole: 'bg' },
        { key: 'color2', label: 'Band Color 2',
            description: 'Colour of the alternating band (canonical: white).',
            type: 'color', default: '#ffffff', randomColorRole: 'fg' },

        { key: 'size', label: 'Size',
            description: 'Overall disc size (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.95 },

        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'stripeCount', label: 'Stripe Count',
            description: 'Number of bands from the centre to the rim. Higher = finer bands.',
            type: 'slider', min: 1, max: 40, step: 1, default: 6 },
        { key: 'twist', label: 'Twist',
            description: 'How much the bands wind around the centre, in EVEN integer steps. 0 = pure concentric circles, 2 = canonical hypnosis spiral, 4 = double-armed pinwheel. Only even values allowed.',
            type: 'slider', min: 0, max: 16, step: 2, default: 2 },
        { key: 'rotationSpeed', label: 'Rotation Speed',
            description: 'Whole rotations per loop. Positive = clockwise illusion (inward draw); negative = counter-clockwise (outward push). Integer for seamless loop.',
            type: 'slider', min: -6, max: 6, step: 1, default: 1 },

        { key: 'outerRing', label: 'Outer Rim',
            description: 'Brightness of an optional thin rim around the disc. 0 = no rim.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0 },
        { key: 'outerRingThickness', label: 'Outer Rim Thickness',
            description: 'Stroke thickness of the optional outer rim.',
            type: 'slider', min: 0.2, max: 6, step: 0.1, default: 1.5 },

        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderHypnotizeFrame
});
