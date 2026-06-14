/**
 * Light — radial rays emanating from a glowing central core. Each ray is
 * a tapered wedge that pulses in length over time. The whole pattern can
 * rotate, and the core itself has a glow halo.
 *
 * Depends on:
 *   hexWithAlpha, mixHexColors  (helpers/color.js)
 *   RR_ANIMATION_REGISTRY       (registry.js)
 *
 * Variety:
 *   - Holy/divine: gold + white, many rays, slow rotation
 *   - Sunburst: yellow + orange, lots of rays, slow pulse
 *   - Beacon: 4 long rays, fast rotation
 *   - Lens flare: few rays + huge core, no rotation
 *   - Magic spell: cyan/purple, fast pulse, medium rotation
 */
function renderLightFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;

    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);

    // True 3D: rays live in the XY plane (z=0) emanating from the light
    // center. Projection through the symbol3D pipeline turns the radial
    // pattern into an ellipse / foreshortened spokes when tilted, exactly
    // like real light hitting a tilted surface.
    const minDimL = Math.min(w, h);
    const radiusL = minDimL * 0.5;
    const { transform: tfL, project: prL } = makeSymbol3DTransform(params, t, cx, cy, radiusL);
    const proj = (sx, sy, z = 0) => {
        const lx = (sx - cx) / radiusL;
        const ly = (cy - sy) / radiusL;
        return prL(tfL([lx, ly, z]));
    };
    const rayCount = Math.max(1, Math.round(params.rayCount));
    const innerR = Math.min(w, h) * 0.5 * params.innerRadius;
    const outerR = Math.min(w, h) * 0.5 * params.outerRadius;
    const rotCycles = Math.round(params.rotationCycles);
    const pulseCycles = Math.max(0, Math.round(params.pulseCycles));
    const pulseStrength = params.pulseStrength;
    const color1 = params.color1;
    const color2 = params.color2;
    const coreSize = Math.min(w, h) * 0.5 * params.coreSize;
    const glow = params.glow;
    const rayWidth = params.rayWidth;
    const opacity = params.opacity;

    // Pulse modulator: multiplies ray length.
    const pulse = pulseCycles > 0
        ? 1 + pulseStrength * Math.sin(t * Math.PI * 2 * pulseCycles)
        : 1;
    const rotAngle = t * Math.PI * 2 * rotCycles;

    // GLOW HALO — disc lives on the XY plane (z=0). Sampled as a polygon
    // so it foreshortens to an ellipse when the light is tilted.
    if (glow > 0.01) {
        const haloR = outerR * 1.3 * pulse;
        const center = proj(cx, cy, 0);
        const halo = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, haloR);
        halo.addColorStop(0,   hexWithAlpha(color1, opacity * 0.55 * glow));
        halo.addColorStop(0.4, hexWithAlpha(color2, opacity * 0.30 * glow));
        halo.addColorStop(1,   hexWithAlpha(color2, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        const HSEGS = 48;
        for (let k = 0; k <= HSEGS; k++) {
            const a = (k / HSEGS) * Math.PI * 2;
            const p = proj(cx + Math.cos(a) * haloR, cy + Math.sin(a) * haloR, 0);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
    }

    // RAYS — true spherical distribution. `volume` ray-planes at evenly
    // spaced rotations around the vertical (Y) axis fill 3D space with
    // rays radiating in all directions. volume=1 gives the old flat-disc
    // look; volume=3+ gives a real 3D star with rays pointing through
    // every axis.
    const volume = Math.max(1, Math.round(params.volume !== undefined ? params.volume : 3));
    const halfAngleBase = (Math.PI * 2 / rayCount) * 0.5 * rayWidth;
    const innerR_local = innerR / radiusL;
    const outerR_local = outerR / radiusL;

    // Local-3D → screen projection (skipping the screen→local conversion).
    const proj3 = (lx, ly, lz) => prL(tfL([lx, ly, lz]));
    // Direction vector for ray angle θ within plane rotated by planeAng
    // around the vertical (Y) axis.
    const dirAt = (theta, cosP, sinP) => [
        Math.cos(theta) * cosP,
        Math.sin(theta),
        Math.cos(theta) * sinP
    ];

    for (let pi = 0; pi < volume; pi++) {
        // Planes containing the Y axis, rotated 0..π around Y. (Beyond π is
        // the same plane mirrored.)
        const planeAng = (pi / volume) * Math.PI;
        const cosP = Math.cos(planeAng);
        const sinP = Math.sin(planeAng);

        for (let i = 0; i < rayCount; i++) {
            const baseAngle = (i / rayCount) * Math.PI * 2 + rotAngle;
            // Per-ray-per-plane deterministic length variation.
            const sR = Math.sin(i * 12.9898 + pi * 7.913) * 43758.5453;
            const rR = sR - Math.floor(sR);
            const lengthMul = 0.7 + 0.6 * rR;
            const rayOuter = outerR_local * pulse * lengthMul;
            if (rayOuter <= innerR_local) continue;

            const angle1 = baseAngle - halfAngleBase;
            const angle2 = baseAngle + halfAngleBase;
            const tipHalfAngle = halfAngleBase * 0.3;
            const angleT1 = baseAngle - tipHalfAngle;
            const angleT2 = baseAngle + tipHalfAngle;

            // 4 wedge corners in local 3D — each is `radius * unitDir`.
            const d1 = dirAt(angle1,  cosP, sinP);
            const d2 = dirAt(angle2,  cosP, sinP);
            const dT1 = dirAt(angleT1, cosP, sinP);
            const dT2 = dirAt(angleT2, cosP, sinP);
            const p1 = proj3(innerR_local * d1[0],  innerR_local * d1[1],  innerR_local * d1[2]);
            const p2 = proj3(innerR_local * d2[0],  innerR_local * d2[1],  innerR_local * d2[2]);
            const p3 = proj3(rayOuter   * dT2[0], rayOuter   * dT2[1], rayOuter   * dT2[2]);
            const p4 = proj3(rayOuter   * dT1[0], rayOuter   * dT1[1], rayOuter   * dT1[2]);
            // Gradient runs along the projected ray axis.
            const dB = dirAt(baseAngle, cosP, sinP);
            const gradBase = proj3(innerR_local * dB[0], innerR_local * dB[1], innerR_local * dB[2]);
            const gradTip  = proj3(rayOuter   * dB[0], rayOuter   * dB[1], rayOuter   * dB[2]);
            const grad = ctx.createLinearGradient(gradBase.x, gradBase.y, gradTip.x, gradTip.y);
            grad.addColorStop(0,   hexWithAlpha(color1, opacity));
            grad.addColorStop(0.5, hexWithAlpha(mixHexColors(color1, color2, 0.5), opacity * 0.7));
            grad.addColorStop(1,   hexWithAlpha(color2, 0));
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.closePath();
            ctx.fill();
        }
    }

    // BRIGHT CORE — disc on the XY plane, foreshortens to ellipse when tilted.
    if (coreSize > 0.5) {
        const cr = coreSize * pulse;
        const center = proj(cx, cy, 0);
        const core = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, cr);
        core.addColorStop(0,   hexWithAlpha('#ffffff', opacity));
        core.addColorStop(0.3, hexWithAlpha(color1, opacity * 0.85));
        core.addColorStop(1,   hexWithAlpha(color1, 0));
        ctx.fillStyle = core;
        ctx.beginPath();
        const CSEGS = 36;
        for (let k = 0; k <= CSEGS; k++) {
            const a = (k / CSEGS) * Math.PI * 2;
            const p = proj(cx + Math.cos(a) * cr, cy + Math.sin(a) * cr, 0);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'elements',
    id:           'light',
    name:         'Light',
    description:  'Radial rays from a glowing core with optional rotation + pulse. Holy bursts, sunbeams, lens flares, beacons.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Core Color',
            description: 'Bright color at the center / base of each ray.',
            type: 'color', default: '#fff0a0' },
        { key: 'color2', label: 'Edge Color',
            description: 'Color the rays fade to at the tips.',
            type: 'color', default: '#ffaa20' },
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'rayCount', label: 'Ray Count',
            description: 'Number of rays radiating from the center.',
            type: 'slider', min: 2, max: 32, step: 1, default: 12 },
        { key: 'innerRadius', label: 'Inner Radius',
            description: 'Where the rays START (distance from center, fraction of frame). 0 = rays start from the point center.',
            type: 'slider', min: 0, max: 0.5, step: 0.02, default: 0.05 },
        { key: 'outerRadius', label: 'Outer Radius',
            description: 'How far the rays reach (fraction of frame).',
            type: 'slider', min: 0.1, max: 1.5, step: 0.05, default: 0.55 },
        { key: 'rayWidth', label: 'Ray Width',
            description: 'Angular width of each ray as a fraction of its slot (1 = rays touch, 0 = invisible).',
            type: 'slider', min: 0.05, max: 1, step: 0.05, default: 0.5 },
        { key: 'rotationCycles', label: 'Rotation Cycles',
            description: 'Full rotations of the ray pattern per loop. Integer for seamless loop. 0 = static.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },
        { key: 'pulseCycles', label: 'Pulse Cycles',
            description: 'How many length pulses per loop. 0 = no pulsing. Integer required.',
            type: 'slider', min: 0, max: 8, step: 1, default: 2 },
        { key: 'pulseStrength', label: 'Pulse Strength',
            description: 'How much rays grow/shrink during pulse (0 = no effect, 0.5 = ±50% length).',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.3 },
        { key: 'coreSize', label: 'Core Size',
            description: 'Size of the bright central core (0 = no core, 0.3 = large bright bloom).',
            type: 'slider', min: 0, max: 0.5, step: 0.02, default: 0.1 },
        { key: 'glow', label: 'Glow',
            description: 'Outer halo intensity. Adds an atmospheric soft glow surrounding everything.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.5 },
        { key: 'volume', label: 'Volume (3D Ray Planes)',
            description: 'Number of ray-planes rotated around the vertical axis. 1 = flat 2D fan (legacy look); 3+ = true spherical starburst with rays radiating in 3D in all directions. Higher = more solid 3D ball but more rendering cost.',
            type: 'slider', min: 1, max: 6, step: 1, default: 3 },
        ...SYMBOL3D_ROTATION_PARAMS,
        { key: 'opacity', label: 'Opacity',
            description: 'Overall opacity multiplier on rays + core + glow.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.95 }
    ],
    render: renderLightFrame
});
