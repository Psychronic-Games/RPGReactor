/**
 * Shadow — a black-hole/gravity-well effect with five layered visual
 * elements rendered back-to-front:
 *
 *   1. Gravity wave rings expanding outward from the event horizon. Each
 *      ring is polar-perturbed (not a perfect circle) so it reads as
 *      space distortion rather than a water ripple.
 *   2. Matter streaks spiraling inward toward the event horizon — each
 *      streak's radius shrinks while its angle accelerates near the
 *      center, giving the classic gravitational-accretion spiral.
 *   3. Einstein-ring halo: a soft radial gradient at the photon-sphere
 *      radius, lit by the accretion disk behind the horizon.
 *   4. Accretion disk: a thick bright annulus around the horizon with
 *      angular brightness modulation that rotates over time (mimics the
 *      Doppler-bright approaching side of the disk).
 *   5. Event horizon: solid dark disc on top.
 *
 * Designed as a single coherent black-hole gravity effect rather than a
 * collection of dark blobs — great for void-magic attacks, planar tears,
 * dimensional-rift abilities, etc.
 *
 * Depends on:
 *   hexWithAlpha, mixHexColors  (helpers/color.js)
 *   RR_ANIMATION_REGISTRY       (registry.js)
 *
 * Variety:
 *   - Classic black hole: bright orange disk, deep void center, slow rotation
 *   - Void well: purple halo, no accretion disk, lots of inward spirals
 *   - Gravity pulse: many waves, big reach, small event horizon
 *   - Singularity rift: tiny horizon, massive ring glow, high distortion
 *   - Tear in space: high wave distortion, low accretion brightness
 */
function renderShadowFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;

    const minDim = Math.min(w, h);
    const centerX = (params.centerX != null) ? w * params.centerX : w * 0.5;
    const centerY = (params.centerY != null) ? h * params.centerY : h * 0.5;

    // True 3D: the gravity well lives on the XY plane (z=0). Every ring,
    // spiral streak, and disc is sampled as a polygon and projected so they
    // foreshorten to ellipses when tilted — the accretion disk seen
    // edge-on gives the classic Interstellar look.
    const radiusS = minDim * 0.5;
    const { transform: tfS, project: prS } = makeSymbol3DTransform(params, t, centerX, centerY, radiusS);
    const proj = (sx, sy, z = 0) => {
        const lx = (sx - centerX) / radiusS;
        const ly = (centerY - sy) / radiusS;
        return prS(tfS([lx, ly, z]));
    };
    // Helper: trace a polygon (closed) of N samples around the circle of
    // radius r at the gravity well's center.
    const traceDisc = (r, segs = 48, closed = true) => {
        ctx.beginPath();
        for (let k = 0; k <= segs; k++) {
            const a = (k / segs) * Math.PI * 2;
            const p = proj(centerX + Math.cos(a) * r, centerY + Math.sin(a) * r, 0);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        if (closed) ctx.closePath();
    };

    const eventRadius = minDim * 0.5 * params.eventRadius;
    const accretionWidth = params.accretionWidth;
    const accretionCycles = Math.max(0, Math.round(params.accretionCycles));
    const haloIntensity = params.haloIntensity;
    const ringGlow = params.ringGlow;
    const waveCount = Math.max(0, Math.round(params.waveCount));
    const waveCycles = Math.max(1, Math.round(params.waveCycles));
    const waveReach = minDim * 0.5 * params.waveReach;
    const waveDistortion = params.waveDistortion;
    const spiralCount = Math.max(0, Math.round(params.spiralCount));
    const spiralCycles = Math.max(1, Math.round(params.spiralCycles));
    const spiralTightness = params.spiralTightness;
    const opacity = params.opacity;
    const color1 = params.color1;  // event horizon (dark)
    const color2 = params.color2;  // halo / gravity wave (mid)
    const color3 = params.color3;  // accretion disk hot color

    // --- 1. Gravity wave rings ---
    // Each wave expands outward from the photon sphere to waveReach over its
    // life. Polar perturbation (4-fold + 6-fold harmonics) makes them read
    // as space-distortion rings, not water ripples.
    const WAVE_SEGS = 72;
    const photonRadius = eventRadius * 1.5;
    for (let w_ = 0; w_ < waveCount; w_++) {
        const phaseOffset = w_ / Math.max(1, waveCount);
        const life = ((t * waveCycles + phaseOffset) % 1 + 1) % 1;
        // Start just outside the photon sphere, expand to waveReach.
        const radius = photonRadius + life * (waveReach - photonRadius);
        if (radius <= photonRadius) continue;
        // Alpha envelope: sin(life·π) for seamless fade in/out.
        const a = opacity * Math.sin(life * Math.PI) * 0.55;
        if (a < 0.03) continue;
        // Thickness grows as wave expands (stretching).
        const thickness = minDim * 0.0035 * (1 + life * 2);
        // Distortion grows with radius (space stretches more at distance).
        const distAmp = radius * waveDistortion * 0.15 * life;
        // Rotation of the distortion pattern (loop-safe: integer waveCycles).
        const rotPhase = w_ * 1.7 + t * Math.PI * 2 * waveCycles;

        ctx.strokeStyle = hexWithAlpha(color2, a);
        ctx.lineWidth = thickness;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let k = 0; k <= WAVE_SEGS; k++) {
            const ang = (k / WAVE_SEGS) * Math.PI * 2;
            const wob =
                distAmp * 0.6 * Math.sin(ang * 4 + rotPhase) +
                distAmp * 0.4 * Math.sin(ang * 6 - rotPhase * 1.3);
            const rr = radius + wob;
            const p = proj(centerX + Math.cos(ang) * rr, centerY + Math.sin(ang) * rr, 0);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    // --- 2. Inward-spiraling matter streaks ---
    // Each streak's radius shrinks exponentially toward the horizon while
    // its angle accelerates — classic accretion spiral. Each streak is
    // drawn as a small motion-trail segment from previous → current.
    for (let s = 0; s < spiralCount; s++) {
        const sA = Math.sin(s * 12.9898) * 43758.5453; const rA = sA - Math.floor(sA);
        const sB = Math.sin(s * 78.233)  * 43758.5453; const rB = sB - Math.floor(sB);
        const sC = Math.sin(s * 39.346)  * 43758.5453; const rC = sC - Math.floor(sC);

        const phaseOffset = s / Math.max(1, spiralCount);
        const life = ((t * spiralCycles + phaseOffset) % 1 + 1) % 1;

        const startR = waveReach * (0.5 + 0.5 * rA);
        // Exponential infall: 1 - (1-life)^p where higher p = sudden fall at end.
        const inFall = (life, p) => 1 - Math.pow(1 - life, 1 + 2 * p);
        const fallNow = inFall(life, spiralTightness);
        const radius = startR * (1 - fallNow) + eventRadius * 0.9 * fallNow;
        if (radius < eventRadius * 0.5) continue;
        // Angular sweep accelerates with falling depth.
        const startAng = rB * Math.PI * 2;
        const sweepMul = 1 + rC * 0.6;
        const angle = startAng + life * Math.PI * 4 * spiralTightness * sweepMul;

        // Previous position for trail tail.
        const lifePrev = Math.max(0, life - 0.04);
        const fallPrev = inFall(lifePrev, spiralTightness);
        const rPrev = startR * (1 - fallPrev) + eventRadius * 0.9 * fallPrev;
        const aPrev = startAng + lifePrev * Math.PI * 4 * spiralTightness * sweepMul;

        // Project both endpoints — when the disk is tilted, the trail
        // segments live on the disk plane and project accordingly.
        const p1 = proj(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius, 0);
        const p0 = proj(centerX + Math.cos(aPrev) * rPrev, centerY + Math.sin(aPrev) * rPrev, 0);

        const a = opacity * Math.sin(life * Math.PI) * 0.85;
        if (a < 0.03) continue;
        const col = mixHexColors(color2, color3, Math.min(1, life * 1.4));

        ctx.strokeStyle = hexWithAlpha(col, a);
        ctx.lineWidth = minDim * 0.0042 * (0.6 + 0.6 * (1 - life));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
    }

    // --- 3. Einstein-ring glow halo ---
    // Soft radial gradient centered on the event horizon, peaking at
    // the photon sphere — the bright halo the accretion disk projects
    // around the silhouette.
    if (ringGlow > 0.01) {
        const haloOuter = eventRadius * (1 + 0.6 * ringGlow);
        const center = proj(centerX, centerY, 0);
        const halo = ctx.createRadialGradient(
            center.x, center.y, eventRadius * 0.7,
            center.x, center.y, haloOuter
        );
        halo.addColorStop(0,    hexWithAlpha(color3, opacity * ringGlow * 0.55));
        halo.addColorStop(0.45, hexWithAlpha(color3, opacity * ringGlow * 0.7));
        halo.addColorStop(0.7,  hexWithAlpha(color2, opacity * ringGlow * 0.35));
        halo.addColorStop(1,    hexWithAlpha(color2, 0));
        ctx.fillStyle = halo;
        traceDisc(haloOuter, 48);
        ctx.fill();
    }

    // --- 4. Accretion disk ---
    // Bright annulus around the event horizon. Drawn as DISK_SEGS short
    // arcs each with its own alpha — angular brightness peaks on the
    // "approaching" side and rotates around the disk over time (Doppler).
    if (haloIntensity > 0.01 && accretionWidth > 0.01) {
        const diskInner = eventRadius;
        const diskOuter = eventRadius * (1 + accretionWidth);
        const diskMid = (diskInner + diskOuter) * 0.5;
        const diskThickness = diskOuter - diskInner;
        const diskRotation = t * Math.PI * 2 * accretionCycles;
        const DISK_SEGS = 64;
        for (let k = 0; k < DISK_SEGS; k++) {
            const a0 = (k / DISK_SEGS) * Math.PI * 2;
            const a1 = ((k + 1) / DISK_SEGS) * Math.PI * 2;
            const angMid = (a0 + a1) * 0.5;
            const dopper = Math.sin(angMid - diskRotation);
            const bright = 0.25 + 0.75 * Math.max(0, dopper);
            const a = opacity * haloIntensity * bright;
            const col = (dopper > 0) ? color3 : mixHexColors(color2, color3, 0.4);
            ctx.strokeStyle = hexWithAlpha(col, a);
            ctx.lineWidth = diskThickness;
            ctx.lineCap = 'butt';
            // Project a short polyline from a0 to a1 at the mid radius —
            // when tilted, the projected segments follow the disk's
            // elliptical shape (edge-on disk looks like a glowing line).
            const SUB = 4;
            ctx.beginPath();
            for (let s = 0; s <= SUB; s++) {
                const a = a0 + (s / SUB) * (a1 - a0);
                const p = proj(centerX + Math.cos(a) * diskMid,
                               centerY + Math.sin(a) * diskMid, 0);
                if (s === 0) ctx.moveTo(p.x, p.y);
                else ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
    }

    // --- 5. Event horizon (solid dark disc) ---
    // When tilted, the horizon foreshortens to an ellipse just like a
    // real disc viewed off-axis. Drawn last so it occludes anything that
    // would pass through the singularity from behind.
    ctx.fillStyle = hexWithAlpha(color1, opacity);
    traceDisc(eventRadius, 48);
    ctx.fill();

    // Crisp rim on the event horizon edge — gives a hard silhouette.
    if (ringGlow > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color1, opacity);
        ctx.lineWidth = Math.max(1, minDim * 0.003);
        traceDisc(eventRadius + ctx.lineWidth * 0.5, 48);
        ctx.stroke();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'elements',
    id:           'shadow',
    name:         'Shadow',
    description:  'A black-hole / gravity-well effect: event horizon, rotating accretion disk, Einstein-ring halo, polar-distorted gravity waves, and matter spiraling inward toward the singularity.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Event Horizon',
            description: 'Color of the central void/singularity. Pure black or very deep purple/blue for classic look.',
            type: 'color', default: '#050008' },
        { key: 'color2', label: 'Halo / Wave Color',
            description: 'Cooler color used for outer halo and gravity wave rings.',
            type: 'color', default: '#7030c0' },
        { key: 'color3', label: 'Accretion Bright',
            description: 'Hot bright color of the accretion disk and infalling matter at peak.',
            type: 'color', default: '#ffc060' },
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'eventRadius', label: 'Event Horizon Radius',
            description: 'Size of the central black void (fraction of half-frame).',
            type: 'slider', min: 0.03, max: 0.5, step: 0.01, default: 0.15 },
        { key: 'accretionWidth', label: 'Accretion Disk Width',
            description: 'Thickness of the bright disk around the horizon (fraction of event radius). 0 = no disk.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.5 },
        { key: 'accretionCycles', label: 'Disk Rotation Cycles',
            description: 'How many times the bright Doppler side rotates around the disk per loop. 0 = stationary. Integer for seamless loop.',
            type: 'slider', min: 0, max: 6, step: 1, default: 2 },
        { key: 'haloIntensity', label: 'Disk Brightness',
            description: 'Brightness of the accretion disk.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.9 },
        { key: 'ringGlow', label: 'Halo Glow',
            description: 'Soft Einstein-ring halo around the event horizon.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.75 },
        { key: 'waveCount', label: 'Gravity Waves',
            description: 'How many distorted ripple rings are expanding outward at once. 0 disables.',
            type: 'slider', min: 0, max: 16, step: 1, default: 4 },
        { key: 'waveCycles', label: 'Wave Cycles',
            description: 'How many full wave lifecycles complete per loop. Integer for seamless loop.',
            type: 'slider', min: 1, max: 6, step: 1, default: 2 },
        { key: 'waveReach', label: 'Wave Reach',
            description: 'How far the gravity waves expand from the center (fraction of half-frame).',
            type: 'slider', min: 0.2, max: 1.5, step: 0.05, default: 1.0 },
        { key: 'waveDistortion', label: 'Wave Distortion',
            description: 'Polar perturbation of the wave rings. 0 = clean circles, 1 = heavy space-warp.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.3 },
        { key: 'spiralCount', label: 'Infalling Streaks',
            description: 'Number of matter streaks spiraling inward toward the horizon. 0 disables.',
            type: 'slider', min: 0, max: 40, step: 1, default: 16 },
        { key: 'spiralCycles', label: 'Spiral Cycles',
            description: 'How many full infall lifecycles complete per loop. Integer for seamless loop.',
            type: 'slider', min: 1, max: 6, step: 1, default: 2 },
        { key: 'spiralTightness', label: 'Spiral Tightness',
            description: 'How rapidly the streaks accelerate as they approach the horizon. Low = lazy spiral, high = sudden plunge.',
            type: 'slider', min: 0.5, max: 4, step: 0.1, default: 1.8 },
        ...SYMBOL3D_ROTATION_PARAMS,
        { key: 'opacity', label: 'Opacity',
            description: 'Overall opacity multiplier.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderShadowFrame
});
