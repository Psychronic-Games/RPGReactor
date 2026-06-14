/**
 * Wind — a swirling tornado/vortex. Multiple helical strands wrap around a
 * funnel-shaped axis (wider at top, narrower at base by default), spinning
 * with configurable cycles per loop. Front-of-funnel segments render brighter
 * than back-of-funnel via sin(theta) alpha modulation, so the strands read
 * as a 3D funnel rather than flat curls. Optional semi-transparent funnel
 * body fill anchors the silhouette; debris specks orbit at random heights.
 *
 * Designed for attack/healing animations — tornado strikes, healing whirlwinds,
 * dust devils, magic vortices, etc.
 *
 * Depends on (globals):
 *   hexWithAlpha, mixHexColors  (helpers/color.js)
 *   RR_ANIMATION_REGISTRY       (registry.js)
 *
 * Variety:
 *   - Classic tornado: dark colors, wide top, narrow base, low body opacity
 *   - Healing whirlwind: bright/glowing colors, even taper, high body opacity
 *   - Dust devil: thin, fast spin, lots of debris, sandy colors
 *   - Updraft column: topRadius == baseRadius, high spin, low debris
 *   - Inverse vortex (drain): swap top/base radius for narrow-top funnel
 */
function renderWindFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;

    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);
    const radiusW = minDim * 0.5;

    const strandCount = Math.max(1, Math.round(params.strandCount));
    const spinCycles = Math.max(1, Math.round(params.spinCycles));
    const twists = Math.max(0.5, params.twists);
    const funnelHeight = h * params.funnelHeight;
    const topRadius = minDim * 0.5 * params.topRadius;
    const baseRadius = minDim * 0.5 * params.baseRadius;
    const thickness = minDim * 0.012 * params.thickness;
    const color1 = params.color1;
    const color2 = params.color2;
    const turbulence = params.turbulence;
    const debrisCount = Math.max(0, Math.round(params.debrisCount));
    const opacity = params.opacity;
    const bodyOpacity = params.bodyOpacity;

    // True 3D tornado: funnel sits along the local Y axis (vertical),
    // strand points live at (cos(θ)·r, y, sin(θ)·r) in cylindrical coords.
    // The 3D pipeline rotates the whole funnel — pitch (tiltX) lets you
    // look DOWN into the vortex from above, etc.
    const { transform: tfW, project: prW } = makeSymbol3DTransform(params, t, cx, cy, radiusW);
    // Project a LOCAL-SPACE 3D point (where 1 unit = radiusW pixels).
    const proj3 = (lx, ly, lz) => prW(tfW([lx, ly, lz]));

    const spin = t * spinCycles * Math.PI * 2;
    const STEPS = 48;

    // Funnel radius at vertical parameter u (0=top, 1=base). Cubic taper
    // gives the classic tornado curve.
    const funnelR = (u) => {
        const e = Math.pow(u, 1.35);
        return topRadius * (1 - e) + baseRadius * e;
    };

    // Vertical extent in local units. Funnel runs from y_local = +halfH (top)
    // down to -halfH (base) since local +Y is UP in symbol3D's convention.
    const halfHL = (funnelHeight * 0.5) / radiusW;
    // u (0..1) → local Y.
    const yAt = (u) => halfHL - u * 2 * halfHL;
    // funnel radius in local units.
    const rAt = (u) => funnelR(u) / radiusW;

    // 1. Funnel body silhouette — left edge (theta=π in local) traced top
    //    to base, then right edge (theta=0) traced base to top. Each point
    //    is in 3D local space (cos(θ)·r, y, sin(θ)·r). Closed polygon.
    if (bodyOpacity > 0.01) {
        ctx.beginPath();
        for (let s = 0; s <= STEPS; s++) {
            const u = s / STEPS;
            const r = rAt(u);
            const p = proj3(-r, yAt(u), 0);
            if (s === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        for (let s = STEPS; s >= 0; s--) {
            const u = s / STEPS;
            const r = rAt(u);
            const p = proj3(r, yAt(u), 0);
            ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        // Linear gradient between projected top-center and base-center.
        const topP = proj3(0, halfHL, 0);
        const botP = proj3(0, -halfHL, 0);
        const grad = ctx.createLinearGradient(topP.x, topP.y, botP.x, botP.y);
        grad.addColorStop(0, hexWithAlpha(color1, opacity * bodyOpacity * 0.35));
        grad.addColorStop(1, hexWithAlpha(color2, opacity * bodyOpacity * 0.5));
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // 2. Helical strands wrapping the funnel.
    for (let strand = 0; strand < strandCount; strand++) {
        const strandPhase = (strand / strandCount) * Math.PI * 2;
        const strandSpin = spin + strandPhase;

        // Per-strand variation seed.
        const sA = Math.sin(strand * 12.9898) * 43758.5453;
        const rA = sA - Math.floor(sA);
        const strandTwistVar = 1 + (rA - 0.5) * 0.2;

        let lastPt = null;
        let lastFront = 0.5;

        for (let s = 0; s <= STEPS; s++) {
            const u = s / STEPS;
            const r = rAt(u);
            const theta = u * twists * strandTwistVar * Math.PI * 2 + strandSpin;

            // Turbulence wobble — radius perturbation (local units).
            const wob = (turbulence * 0.05) * Math.sin(
                u * 9 + strand * 2.7 + t * Math.PI * 2 * spinCycles * 2
            );
            const rr = Math.max(0, r + wob);

            // Point on the helix in cylindrical 3D local coords. The funnel
            // is centered on the local Y axis (vertical).
            const cosT = Math.cos(theta);
            const sinT = Math.sin(theta);
            const lx3 = cosT * rr;
            const ly3 = yAt(u);
            const lz3 = sinT * rr;
            const p3 = proj3(lx3, ly3, lz3);

            // "Frontness" cue uses the local Z (positive = toward camera in
            // local frame). After 3D rotation, the projected depth handles
            // visibility naturally — but we still bias alpha so the back
            // half of the helix reads as occluded.
            const frontness = (sinT + 1) * 0.5;
            const segThick = thickness * (0.35 + 0.85 * (1 - u));
            const col = mixHexColors(color1, color2, u);
            const edgeFade = Math.sin(u * Math.PI);
            const visibility = 0.15 + 0.85 * frontness;
            const a = opacity * visibility * (0.45 + 0.55 * edgeFade);

            if (lastPt && a > 0.04) {
                ctx.strokeStyle = hexWithAlpha(col, a);
                ctx.lineWidth = segThick;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(lastPt.x, lastPt.y);
                ctx.lineTo(p3.x, p3.y);
                ctx.stroke();
            }
            lastPt = { x: p3.x, y: p3.y };
            lastFront = frontness;
        }
    }

    // 3. Debris specks orbiting the funnel at random heights.
    for (let d = 0; d < debrisCount; d++) {
        const dA = Math.sin(d * 17.13) * 43758.5453; const rDh = dA - Math.floor(dA);
        const dB = Math.sin(d * 23.71) * 43758.5453; const rDr = dB - Math.floor(dB);
        const dC = Math.sin(d * 41.03) * 43758.5453; const rDa = dC - Math.floor(dC);
        const dD = Math.sin(d * 59.17) * 43758.5453; const rDs = dD - Math.floor(dD);

        const u = rDh;
        const r = rAt(u) * (0.9 + 0.25 * rDr);

        const speedMul = 1 + Math.floor(rDs * 3);
        const theta = rDa * Math.PI * 2 + t * spinCycles * speedMul * Math.PI * 2;

        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        // Debris in cylindrical 3D coords, projected through the symbol3D pipeline.
        const p = proj3(cosT * r, yAt(u), sinT * r);
        const frontness = (sinT + 1) * 0.5;
        if (frontness < 0.08) continue;

        const size = minDim * 0.0055 * (0.5 + rDr);
        const a = opacity * frontness * 0.85;
        const col = mixHexColors(color1, color2, u);
        ctx.fillStyle = hexWithAlpha(col, a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'elements',
    id:           'wind',
    name:         'Wind',
    description:  'A swirling tornado/vortex with helical strands wrapping a funnel shape. Tune top/base radius and twists for everything from a dust devil to a healing whirlwind.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Top Color',
            description: 'Color at the wide top of the funnel.',
            type: 'color', default: '#c0f0ff' },
        { key: 'color2', label: 'Base Color',
            description: 'Color at the narrow base/tip of the funnel.',
            type: 'color', default: '#3070a0' },
        { key: 'strandCount', label: 'Strand Count',
            description: 'How many helical strands wrap the funnel. More strands = denser swirl.',
            type: 'slider', min: 2, max: 24, step: 1, default: 8 },
        { key: 'spinCycles', label: 'Spin Cycles',
            description: 'How many full rotations the funnel completes per loop. Integer for seamless loop.',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },
        { key: 'twists', label: 'Vertical Twists',
            description: 'How many times each strand wraps the funnel from top to base. Higher = tighter coil.',
            type: 'slider', min: 0.5, max: 6, step: 0.25, default: 2.0 },
        { key: 'funnelHeight', label: 'Funnel Height',
            description: 'Vertical extent of the tornado (fraction of frame height).',
            type: 'slider', min: 0.3, max: 1.5, step: 0.05, default: 0.9 },
        { key: 'topRadius', label: 'Top Radius',
            description: 'Radius at the wide top of the funnel (fraction of half-frame). Set smaller than base for inverted/drain vortex.',
            type: 'slider', min: 0.05, max: 1.5, step: 0.05, default: 1.0 },
        { key: 'baseRadius', label: 'Base Radius',
            description: 'Radius at the narrow base/tip (fraction of half-frame). Classic tornado has this much smaller than top.',
            type: 'slider', min: 0.02, max: 1.5, step: 0.02, default: 0.18 },
        { key: 'thickness', label: 'Strand Thickness',
            description: 'Stroke width of each helical strand.',
            type: 'slider', min: 0.2, max: 4, step: 0.1, default: 1.0 },
        { key: 'turbulence', label: 'Turbulence',
            description: 'How much the strands wobble in/out from the funnel surface. 0 = pristine helix, 1.5 = chaos.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.35 },
        { key: 'tilt', label: 'Tilt / Depth',
            description: 'Perspective squash. 0 = flat 2D, 1 = elliptical slices (3D feel).',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.5 },
        { key: 'debrisCount', label: 'Debris Specks',
            description: 'Discrete particles orbiting the funnel at random heights. Use 0 for clean look.',
            type: 'slider', min: 0, max: 80, step: 1, default: 18 },
        { key: 'bodyOpacity', label: 'Funnel Body Fill',
            description: 'Semi-transparent body fill behind the strands — anchors the silhouette. 0 = strands only.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.3 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'opacity', label: 'Opacity',
            description: 'Overall alpha multiplier.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.9 }
    ],
    render: renderWindFrame
});
