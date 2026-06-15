/**
 * Energy Beam — directional energy blast (Kamehameha, Galick Gun, etc.).
 * A tapered beam from a source point in a configurable direction with:
 *   - 3-layer rendering (outer halo → mid color → white-hot core)
 *   - Optional wave distortion (sin perturbation perpendicular to beam axis)
 *   - Source-point charge orb (radial gradient)
 *   - Tip burst (radial gradient at far end)
 *   - Particle trail (sparks flying along the beam length)
 *   - Pulse modulation (size oscillates)
 *   - Configurable spread (cylinder → cone)
 *
 * Direction = 0° points right (+X). Increase to rotate clockwise (degrees).
 * All animation parameters use integer cycles per loop for seamless looping.
 */
function renderEnergyBeamFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w / 2, cy = h / 2;
    const minDim = Math.min(w, h);
    const diag = Math.hypot(w, h);

    // 3D rotation as polar coords — the unit-X Euler approach has the
    // problem that rotating around X axis doesn't move (1,0,0), so tiltX
    // would have no effect. Instead we treat:
    //   tiltY + cycY → azimuth (in-plane direction, horizontal drag)
    //   tiltX + cycX → elevation (vertical tilt, vertical drag)
    //   tiltZ + cycZ → in-screen roll (added on top of azimuth)
    // The composite direction comes from spherical coords so the gizmo's
    // horizontal + vertical drags both visibly rotate the beam direction.
    const cycX = Math.round(params.cycX || 0);
    const cycY = Math.round(params.cycY || 0);
    const cycZ = Math.round(params.cycZ || 0);
    const azimuth   = ((params.tiltY || 0) + cycY * t * 360) * Math.PI / 180;
    const elevation = ((params.tiltX || 0) + cycX * t * 360) * Math.PI / 180;
    const roll      = ((params.tiltZ || 0) + cycZ * t * 360) * Math.PI / 180;
    // Direction in 3D (Y up, Z toward camera).
    const dirX = Math.cos(elevation) * Math.cos(azimuth);
    const dirY = Math.sin(elevation);
    const dirZ = -Math.cos(elevation) * Math.sin(azimuth);
    // Project to screen: take XY components, flip Y for canvas. Compose with
    // an additional Z-axis roll.
    const sdxRaw = dirX, sdyRaw = -dirY;
    const cR = Math.cos(roll), sR = Math.sin(roll);
    const sdx = sdxRaw * cR - sdyRaw * sR;
    const sdy = sdxRaw * sR + sdyRaw * cR;
    const lenXY = Math.hypot(sdx, sdy) || 1;
    const cosD = sdx / lenXY;
    const sinD = sdy / lenXY;

    // Length foreshortens by the 2D-projected magnitude (so a beam pointing
    // straight at or away from the camera shrinks to almost nothing).
    const length = diag * params.beamLength * lenXY;
    const baseWidth = minDim * 0.05 * params.beamWidth;
    const spread = params.spread;
    const tipWidth = baseWidth * (1 + spread * 2);

    // centerX/centerY in [0, 1] convention (0.5 = frame center); these set
    // the source point of the beam.
    const sx = w * params.centerX;
    const sy = h * params.centerY;

    const pulseCycles = Math.max(1, Math.round(params.pulseCycles));
    const pulse = 1 + params.pulseStrength * 0.25 * Math.sin(t * pulseCycles * Math.PI * 2);

    const color1 = params.color1;
    const color2 = params.color2;
    const color3 = params.color3;
    const opacity = params.opacity * params.intensity * pulse;

    // Beam-local (along, perpendicular) → screen.
    const proj = (u, v) => ({
        x: sx + u * cosD - v * sinD,
        y: sy + u * sinD + v * cosD
    });

    const waveCycles = Math.max(0, Math.round(params.waveCycles));
    const waveAmp = baseWidth * 0.5 * params.waveAmplitude;
    const waveTimePhase = t * Math.PI * 2 * Math.max(1, waveCycles);

    /** Build a tapered, wave-perturbed beam polygon with rounded caps. */
    const buildBeam = (widthMul) => {
        const N = 32;
        const pts = [];
        const halfWidthAt = (u_frac) =>
            (baseWidth + (tipWidth - baseWidth) * u_frac) * 0.5 * widthMul;
        const waveAt = (u_frac) =>
            waveCycles > 0
                ? waveAmp * Math.sin(u_frac * waveCycles * Math.PI * 2 + waveTimePhase)
                : 0;

        // Source cap (semicircle on -u side).
        const wSrc = halfWidthAt(0);
        const wSrcWave = waveAt(0);
        for (let i = 0; i <= 12; i++) {
            const a = Math.PI / 2 + (i / 12) * Math.PI;  // π/2 → 3π/2
            pts.push(proj(wSrc * Math.cos(a), wSrcWave + wSrc * Math.sin(a)));
        }
        // Left edge (source to tip) — top of beam (negative v).
        for (let i = 1; i <= N; i++) {
            const u_frac = i / N;
            const wHalf = halfWidthAt(u_frac);
            pts.push(proj(u_frac * length, waveAt(u_frac) - wHalf));
        }
        // Tip cap (semicircle on +u side).
        const wTip = halfWidthAt(1);
        const wTipWave = waveAt(1);
        for (let i = 1; i <= 12; i++) {
            const a = -Math.PI / 2 + (i / 12) * Math.PI;  // -π/2 → π/2
            pts.push(proj(length + wTip * Math.cos(a), wTipWave + wTip * Math.sin(a)));
        }
        // Right edge (tip back to source) — bottom (positive v).
        for (let i = N - 1; i >= 0; i--) {
            const u_frac = i / N;
            const wHalf = halfWidthAt(u_frac);
            pts.push(proj(u_frac * length, waveAt(u_frac) + wHalf));
        }
        return pts;
    };

    const fillBeam = (pts, color, alpha) => {
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            if (i === 0) ctx.moveTo(pts[i].x, pts[i].y);
            else ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.closePath();
        ctx.fill();
    };

    // 1. Outer halo (widest, lowest alpha — softens edges into space).
    const haloRatio = params.haloRatio;
    if (haloRatio > 1.01) {
        fillBeam(buildBeam(haloRatio), color3, 0.30);
        fillBeam(buildBeam(haloRatio * 0.65 + 0.35), color3, 0.45);
    }
    // 2. Mid layer (the beam's color).
    fillBeam(buildBeam(1.0), color2, 0.85);
    // 3. White-hot core (narrow).
    const coreRatio = params.coreRatio;
    if (coreRatio > 0.01) fillBeam(buildBeam(coreRatio), color1, 1.0);

    // 4. Source charge orb (radial gradient at sx, sy).
    const chargeSize = baseWidth * params.chargeSize * 1.4;
    if (chargeSize > 1) {
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, chargeSize * 2.2);
        grad.addColorStop(0,   hexWithAlpha(color1, opacity * 1.0));
        grad.addColorStop(0.4, hexWithAlpha(color2, opacity * 0.7));
        grad.addColorStop(1,   hexWithAlpha(color3, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, chargeSize * 2.2, 0, Math.PI * 2);
        ctx.fill();
    }

    // 5. Tip burst (radial gradient at the far end).
    const tipBurst = params.tipBurst;
    if (tipBurst > 0.01) {
        const tipScreen = proj(length, 0);
        const burstR = tipWidth * tipBurst * 1.8;
        const grad = ctx.createRadialGradient(tipScreen.x, tipScreen.y, 0, tipScreen.x, tipScreen.y, burstR);
        grad.addColorStop(0,   hexWithAlpha(color1, opacity * 0.95));
        grad.addColorStop(0.5, hexWithAlpha(color2, opacity * 0.5));
        grad.addColorStop(1,   hexWithAlpha(color3, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(tipScreen.x, tipScreen.y, burstR, 0, Math.PI * 2);
        ctx.fill();
    }

    // 6. Particles flying along the beam (loop-safe via integer speed).
    const partCount = Math.max(0, Math.round(params.particleCount));
    const partSpeed = Math.max(1, Math.round(params.particleSpeed));
    const partSize = minDim * 0.005 * params.particleSize;
    for (let i = 0; i < partCount; i++) {
        const sA = Math.sin(i * 12.9898) * 43758.5; const rA = sA - Math.floor(sA);
        const sB = Math.sin(i * 78.233)  * 43758.5; const rB = sB - Math.floor(sB);
        const u_frac = ((rA + t * partSpeed) % 1 + 1) % 1;
        const wHalf = (baseWidth + (tipWidth - baseWidth) * u_frac) * 0.5;
        const v = (rB - 0.5) * wHalf * 2.0;
        const p = proj(u_frac * length, v);
        const lifeAlpha = Math.sin(u_frac * Math.PI);
        ctx.fillStyle = hexWithAlpha(color1, opacity * lifeAlpha * 0.9);
        ctx.beginPath();
        ctx.arc(p.x, p.y, partSize, 0, Math.PI * 2);
        ctx.fill();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'energy',
    id:           'energybeam',
    name:         'Energy Beam',
    description:  'Directional energy beam (Kamehameha, ki blast, plasma ray). Tapered shape, wave distortion, source charge, tip burst, particle trail. Loop-safe integer cycles.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Core (Hot)',
            description: 'White-hot center of the beam.',
            type: 'color', default: '#ffffff' },
        { key: 'color2', label: 'Mid Color',
            description: 'Main color band of the beam.',
            type: 'color', default: '#80e0ff' },
        { key: 'color3', label: 'Outer Halo',
            description: 'Soft outer glow color.',
            type: 'color', default: '#3060ff' },

        { key: 'centerX', label: 'Center X',
            description: 'Source point X (fraction of frame width). 0 = left edge, 0.5 = center, 1 = right edge.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.25 },
        { key: 'centerY', label: 'Center Y',
            description: 'Source point Y (fraction of frame height). 0 = top, 0.5 = center, 1 = bottom.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },

        // Direction is set via 3D rotation (use the rotation gizmo). tiltZ=0
        // points the beam right (+X); tiltZ=90 points it down; tiltY tilts
        // into/out of the screen with foreshortening.
        ...SYMBOL3D_ROTATION_PARAMS,

        { key: 'beamLength', label: 'Beam Length',
            description: 'Beam length as fraction of frame diagonal.',
            type: 'slider', min: 0.1, max: 2.0, step: 0.05, default: 1.2 },
        { key: 'beamWidth', label: 'Beam Width',
            description: 'Width at the source (cone base).',
            type: 'slider', min: 0.1, max: 3.0, step: 0.05, default: 1.0 },
        { key: 'spread', label: 'Spread (Cone)',
            description: '0 = parallel cylinder beam; 1 = wide cone (tip is 3× source width).',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.3 },

        { key: 'coreRatio', label: 'Core Width',
            description: 'Width of the bright core as fraction of beam width.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.4 },
        { key: 'haloRatio', label: 'Halo Size',
            description: 'Outer halo width as multiplier of beam width.',
            type: 'slider', min: 1.0, max: 3.5, step: 0.1, default: 1.8 },
        { key: 'intensity', label: 'Intensity',
            description: 'Overall brightness multiplier.',
            type: 'slider', min: 0.3, max: 2.5, step: 0.05, default: 1.0 },

        { key: 'pulseCycles', label: 'Pulse Cycles',
            description: 'How fast the beam pulsates per loop. Integer for seamless loop.',
            type: 'slider', min: 1, max: 12, step: 1, default: 4 },
        { key: 'pulseStrength', label: 'Pulse Strength',
            description: 'How much the beam fluctuates in brightness. 0 = steady, 1 = strong throb.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.3 },

        { key: 'waveCycles', label: 'Wave Cycles',
            description: 'Number of sine ripples along beam length. 0 = perfectly straight.',
            type: 'slider', min: 0, max: 8, step: 1, default: 2 },
        { key: 'waveAmplitude', label: 'Wave Amplitude',
            description: 'How much the beam wobbles perpendicular to its axis.',
            type: 'slider', min: 0, max: 1.0, step: 0.05, default: 0.2 },

        { key: 'chargeSize', label: 'Source Charge',
            description: 'Glowing orb at the source point. 0 hides it.',
            type: 'slider', min: 0, max: 3, step: 0.05, default: 1.2 },
        { key: 'tipBurst', label: 'Tip Burst',
            description: 'Bright burst at the beam tip.',
            type: 'slider', min: 0, max: 3, step: 0.05, default: 0.8 },

        { key: 'particleCount', label: 'Particle Trail',
            description: 'Sparks flying along the beam.',
            type: 'slider', min: 0, max: 50, step: 1, default: 12 },
        { key: 'particleSpeed', label: 'Particle Speed',
            description: 'How fast particles travel along the beam (integer cycles per loop).',
            type: 'slider', min: 1, max: 8, step: 1, default: 3 },
        { key: 'particleSize', label: 'Particle Size',
            description: 'Visual size of each particle.',
            type: 'slider', min: 0.3, max: 3, step: 0.1, default: 1.0 },

        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderEnergyBeamFrame
});
