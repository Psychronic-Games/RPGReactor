/**
 * Energy Field — a spherical bubble of flowing energy wisps. The
 * bubble surrounds whatever it's centered on (think force-field around
 * a character). Wisps are great-circle arcs drawn on the surface of an
 * invisible sphere, with axes distributed via the Fibonacci spiral so
 * the coverage is even.
 *
 * Visual layers (all projected through the symbol3D 3D pipeline so the
 * bubble can tilt without distortion):
 *   1. Optional faint solid silhouette ring (rimOpacity > 0).
 *   2. N wisps, each a great-circle arc on the sphere surface around a
 *      unique axis. Each wisp covers `wispLength` of its full circle
 *      and drifts with the loop. Endpoint fade via sin(π·u) hides the
 *      wrap seam.
 *   3. Each wisp is stroked in three passes — outer halo, mid body,
 *      thin bright core — matching the reference's inner-core / outer-
 *      halo lighting.
 *   4. Silhouette emphasis: per-segment alpha drops as the surface
 *      tangent faces the camera, so the energy reads brightest at the
 *      grazing rim of the sphere (the bubble outline) and softer
 *      across the front, like real fresnel-edged force fields.
 *   5. Highlight sparks scattered across the full sphere surface, also
 *      silhouette-weighted.
 *
 * Loop-safety:
 *   - `flowSpeed` (whole rotations of each wisp's starting angle per
 *     loop) is rounded to an integer.
 *   - Endpoint fade hits zero at each wisp end.
 */
function renderEnergyFieldFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );
    const proj3 = (x, y, z) => project(transform([x, y, z]));

    const color1 = params.color1;
    const color2 = params.color2;
    const opacity = params.opacity;
    const ringR = params.ringRadius;
    const baseLineW = Math.max(0.5, minDim * 0.005);
    const RING_SEGS = 120;

    // Subtle radial pulse on the ring as a whole.
    const pulse = params.pulse || 0;
    const pulseCycles = Math.max(1, Math.round(params.pulseCycles || 1));
    const pulseMod = 1 + pulse * 0.10 * Math.sin(t * pulseCycles * Math.PI * 2);
    const effR = ringR * pulseMod;

    // Helpers for the sphere bubble wisps:
    //   - silhouetteAlpha(v): 0 at the sphere's poles (facing camera /
    //     facing away), 1 at the silhouette ring (surface perpendicular
    //     to view). Computed AFTER the world-rotation transform, so it
    //     respects the user's tilt.
    const silhouetteAlpha = (vRotated) => {
        const len = Math.sqrt(vRotated[0]*vRotated[0]
                            + vRotated[1]*vRotated[1]
                            + vRotated[2]*vRotated[2]);
        const norm = len > 1e-6 ? vRotated[2] / len : 0;
        return Math.sqrt(Math.max(0, 1 - norm * norm));
    };

    // Build a basis (U, V) perpendicular to a given unit axis A.
    const buildBasis = (Ax, Ay, Az) => {
        // Pick a reference axis NOT parallel to A.
        let refX = 0, refY = 1, refZ = 0;
        if (Math.abs(Ay) > 0.95) { refX = 1; refY = 0; refZ = 0; }
        // U = A × ref
        let Ux = Ay * refZ - Az * refY;
        let Uy = Az * refX - Ax * refZ;
        let Uz = Ax * refY - Ay * refX;
        const ul = Math.sqrt(Ux*Ux + Uy*Uy + Uz*Uz) || 1;
        Ux /= ul; Uy /= ul; Uz /= ul;
        // V = A × U
        const Vx = Ay * Uz - Az * Uy;
        const Vy = Az * Ux - Ax * Uz;
        const Vz = Ax * Uy - Ay * Ux;
        return { Ux, Uy, Uz, Vx, Vy, Vz };
    };

    // ── Optional faint silhouette rim (great-circle facing the camera) ─
    // Drawn before wisps so wisp highlights sit on top.
    if (params.rimOpacity > 0.005) {
        ctx.beginPath();
        for (let k = 0; k <= RING_SEGS; k++) {
            const a = (k / RING_SEGS) * Math.PI * 2;
            // Local-XY plane circle — after the user's tilt it becomes
            // the apparent rim. Good enough for a hint of structure.
            const p = proj3(effR * Math.cos(a), effR * Math.sin(a), 0);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.strokeStyle = hexWithAlpha(color1, opacity * params.rimOpacity);
        ctx.lineWidth = baseLineW * params.rimThickness;
        ctx.lineJoin = 'round';
        ctx.stroke();
    }

    // ── Wisps as great-circle arcs on the sphere surface ──────────────
    const wispCount = Math.max(1, Math.round(params.wispCount));
    const wispWobble = params.wispWobble;
    const wispWaveFreq = Math.max(1, Math.round(params.wispWaveFreq));
    const flowCycles = Math.round(params.flowSpeed);
    const flowOffset = t * flowCycles * Math.PI * 2;
    const wispThickness = baseLineW * params.wispThickness;
    const wispLength = Math.max(0.05, Math.min(1, params.wispLength));
    const angularSpan = Math.PI * 2 * wispLength;
    const WISP_SEGS = 56;
    // Golden-angle for nicely-spread axis directions on the sphere.
    const GOLDEN = Math.PI * (3 - Math.sqrt(5));

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < wispCount; i++) {
        // Fibonacci sphere: distribute axis directions uniformly.
        const yAxis = wispCount === 1 ? 0 : 1 - 2 * (i + 0.5) / wispCount;
        const rAxis = Math.sqrt(Math.max(0, 1 - yAxis * yAxis));
        const phiAxis = i * GOLDEN;
        const Ax = rAxis * Math.cos(phiAxis);
        const Ay = yAxis;
        const Az = rAxis * Math.sin(phiAxis);
        const { Ux, Uy, Uz, Vx, Vy, Vz } = buildBasis(Ax, Ay, Az);

        // Per-wisp deterministic seed for variety.
        const seed = Math.sin(i * 12.9898) * 43758.5453;
        const rnd = seed - Math.floor(seed);
        const wispAlphaMul = 0.6 + 0.4 * rnd;

        // Wisp drifts along its great circle with the global flow.
        const startA = flowOffset + i * 0.71;

        // Precompute all wisp points + per-point silhouette alpha.
        const pts = new Array(WISP_SEGS + 1);
        const alphas = new Array(WISP_SEGS + 1);
        for (let k = 0; k <= WISP_SEGS; k++) {
            const u = k / WISP_SEGS;
            const a = startA + u * angularSpan;
            const endpointFade = Math.sin(u * Math.PI);
            const wave = wispWobble * 0.15
                * Math.sin(u * Math.PI * wispWaveFreq + flowOffset * 1.7 + i * 0.83);
            const rLocal = effR * (1 + wave * endpointFade);
            const ca = Math.cos(a), sa = Math.sin(a);
            const lx = rLocal * (Ux * ca + Vx * sa);
            const ly = rLocal * (Uy * ca + Vy * sa);
            const lz = rLocal * (Uz * ca + Vz * sa);
            const v = transform([lx, ly, lz]);
            const sAlpha = silhouetteAlpha(v);
            pts[k] = project(v);
            // Combined alpha: endpoint fade × silhouette emphasis.
            alphas[k] = endpointFade * (0.25 + 0.75 * sAlpha);
        }

        // Stroke segment-by-segment with per-segment alpha so the
        // silhouette emphasis actually shows. Three passes per segment
        // for the halo / body / core lighting.
        for (let k = 0; k < WISP_SEGS; k++) {
            const segAlpha = (alphas[k] + alphas[k + 1]) * 0.5 * wispAlphaMul;
            if (segAlpha < 0.02) continue;
            const a0 = pts[k], a1 = pts[k + 1];
            // Halo
            if (params.glow > 0.01) {
                ctx.strokeStyle = hexWithAlpha(color2, opacity * segAlpha * params.glow * 0.7);
                ctx.lineWidth = wispThickness * (1.6 + params.glow * 2.5);
                ctx.beginPath();
                ctx.moveTo(a0.x, a0.y);
                ctx.lineTo(a1.x, a1.y);
                ctx.stroke();
            }
            // Body
            ctx.strokeStyle = hexWithAlpha(color2, opacity * segAlpha);
            ctx.lineWidth = wispThickness;
            ctx.beginPath();
            ctx.moveTo(a0.x, a0.y);
            ctx.lineTo(a1.x, a1.y);
            ctx.stroke();
            // Core
            ctx.strokeStyle = hexWithAlpha(color1, opacity * segAlpha * 0.95);
            ctx.lineWidth = wispThickness * 0.40;
            ctx.beginPath();
            ctx.moveTo(a0.x, a0.y);
            ctx.lineTo(a1.x, a1.y);
            ctx.stroke();
        }
    }

    // ── Highlight sparks scattered across the full sphere surface ────
    if (params.sparkCount > 0) {
        const sparkCount = Math.round(params.sparkCount);
        const sparkSize = Math.max(0.5, minDim * 0.005 * params.sparkSize);
        const sparkCycles = Math.max(1, Math.round(params.flowSpeed * 2));
        for (let i = 0; i < sparkCount; i++) {
            // Fibonacci position on sphere for spark i.
            const yA = sparkCount === 1 ? 0 : 1 - 2 * (i + 0.5) / sparkCount;
            const rA = Math.sqrt(Math.max(0, 1 - yA * yA));
            const phiA = i * GOLDEN;
            const lx = effR * rA * Math.cos(phiA);
            const ly = effR * yA;
            const lz = effR * rA * Math.sin(phiA);
            const v = transform([lx, ly, lz]);
            const sAlpha = silhouetteAlpha(v);
            const sP = Math.sin(i * 39.346) * 43758.5453;  const rndP = sP - Math.floor(sP);
            const phase = ((t * sparkCycles + rndP) % 1 + 1) % 1;
            const fade = Math.sin(phase * Math.PI);
            const alpha = opacity * fade * (0.3 + 0.7 * sAlpha);
            if (alpha < 0.05) continue;
            const p = project(v);
            ctx.fillStyle = hexWithAlpha(color1, alpha);
            ctx.beginPath();
            ctx.arc(p.x, p.y, sparkSize * (0.5 + fade), 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'energy',
    id:           'energyfield',
    name:         'Energy Field',
    description:  'Spherical force-field bubble around its center. Energy wisps are great-circle arcs distributed evenly across the sphere surface, with silhouette-weighted alpha so the bubble outline reads brightest at the rim (fresnel-edged). Use it as a shield/aura around a character or object.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Core / Highlight',
            description: 'Bright color used for wisp cores and highlight sparks (canonical: light cyan).',
            type: 'color', default: '#a0f4ff' },
        { key: 'color2', label: 'Glow / Halo',
            description: 'Darker color used for the wisp halo and main body (canonical: deeper blue).',
            type: 'color', default: '#2080e0' },

        { key: 'size', label: 'Size',
            description: 'Overall ring size (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },
        { key: 'ringRadius', label: 'Bubble Radius',
            description: 'Radius of the spherical bubble in local units. Smaller = tighter shield.',
            type: 'slider', min: 0.1, max: 0.95, step: 0.01, default: 0.65 },

        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'wispCount', label: 'Wisp Count',
            description: 'Number of great-circle wisp arcs distributed across the sphere surface. More = denser energy weave covering the bubble.',
            type: 'slider', min: 2, max: 40, step: 1, default: 18 },
        { key: 'wispLength', label: 'Wisp Length',
            description: 'Angular extent of each wisp as a fraction of its great circle. 0.5 = each wisp covers half a circumference; 1.0 = full ring.',
            type: 'slider', min: 0.1, max: 1.0, step: 0.02, default: 0.65 },
        { key: 'wispThickness', label: 'Wisp Thickness',
            description: 'Stroke thickness multiplier for each wisp.',
            type: 'slider', min: 0.5, max: 8, step: 0.1, default: 3.5 },
        { key: 'wispWobble', label: 'Wisp Wobble',
            description: 'Radial perturbation amount for the wispy curves — how much they bulge in/out from the mean radius.',
            type: 'slider', min: 0, max: 0.4, step: 0.01, default: 0.15 },
        { key: 'wispWaveFreq', label: 'Wave Frequency',
            description: 'Number of sine waves along each wisp.',
            type: 'slider', min: 1, max: 12, step: 1, default: 4 },
        { key: 'flowSpeed', label: 'Flow Speed',
            description: 'Whole rotations of the wisps around the ring per loop. Integer for seamless loop.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },
        { key: 'glow', label: 'Glow',
            description: 'Outer halo intensity behind every wisp.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6 },

        { key: 'rimOpacity', label: 'Rim Opacity',
            description: 'Opacity of a faint solid ring outline behind the wisps. 0 = wisps only (matches the reference image).',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0 },
        { key: 'rimThickness', label: 'Rim Thickness',
            description: 'Stroke thickness of the optional faint rim.',
            type: 'slider', min: 0.5, max: 5, step: 0.1, default: 1.0 },

        { key: 'sparkCount', label: 'Spark Count',
            description: 'Number of bright highlight sparks scattered around the ring. 0 = no sparks.',
            type: 'slider', min: 0, max: 60, step: 1, default: 18 },
        { key: 'sparkSize', label: 'Spark Size',
            description: 'Size multiplier for the highlight sparks.',
            type: 'slider', min: 0.2, max: 4, step: 0.05, default: 1.0 },

        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderEnergyFieldFrame
});
