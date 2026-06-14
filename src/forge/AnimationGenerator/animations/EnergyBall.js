/**
 * Energy Ball — glowing orb of energy (Spirit Bomb, ki sphere, plasma
 * ball, charge orb). Multi-layer concentric rendering:
 *
 *   1. Outer halo (radial gradient, faint, extends well past the ball)
 *   2. Mid sphere fill (the main color body)
 *   3. White-hot core (sharp bright center)
 *   4. Surface distortion ring (sin-wobble outline)
 *   5. Lightning arcs across the surface (electric crackle)
 *   6. Orbiting sparkle particles (elliptical paths for depth)
 *   7. Radial rays (optional rotating spokes)
 *
 * All animation parameters use integer cycles per loop for seamless looping.
 */
function renderEnergyBallFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w / 2, cy = h / 2;
    const minDim = Math.min(w, h);

    // centerX/centerY in [0, 1] convention (0.5 = frame center).
    const ballX = w * params.centerX;
    const ballY = h * params.centerY;

    const baseSize = minDim * 0.4 * params.size;
    const pulseCycles = Math.max(1, Math.round(params.pulseCycles));
    const pulse = 1 + params.pulseStrength * 0.2 * Math.sin(t * pulseCycles * Math.PI * 2);
    const size = baseSize * pulse;

    // 3D rotation pipeline — used for the non-symmetric parts (orbits, arcs,
    // rays). The core/halo/surface ring are radially symmetric and don't
    // change under rotation, so we use `transform` directly on local-space
    // points rather than the helper's project (which divides by `size`).
    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    // Custom project: local-space (unit-sphere) → screen px relative to ball center.
    // Includes perspective so the back side of orbits / sphere fades.
    const proj3 = (v3) => {
        const r = transform(v3);
        const d = 3.5;
        const dz = d - r[2];
        const s = dz > 0.15 ? d / dz : d / 0.15;
        return { x: ballX + r[0] * size * s, y: ballY - r[1] * size * s, z: r[2] };
    };

    const color1 = params.color1;
    const color2 = params.color2;
    const color3 = params.color3;
    const color4 = params.color4;
    const opacity = params.opacity * params.intensity;
    const lineThick = Math.max(0.5, minDim * 0.003 * params.lineThickness);

    // 1. Outer halo.
    if (params.haloSize > 1.01 && params.haloIntensity > 0.01) {
        const haloR = size * params.haloSize;
        const grad = ctx.createRadialGradient(ballX, ballY, size * 0.5, ballX, ballY, haloR);
        grad.addColorStop(0,   hexWithAlpha(color3, opacity * params.haloIntensity * 0.55));
        grad.addColorStop(0.5, hexWithAlpha(color3, opacity * params.haloIntensity * 0.25));
        grad.addColorStop(1,   hexWithAlpha(color3, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ballX, ballY, haloR, 0, Math.PI * 2);
        ctx.fill();
    }

    // 2. Mid sphere body.
    {
        const grad = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, size);
        grad.addColorStop(0,    hexWithAlpha(color2, opacity * 0.95));
        grad.addColorStop(0.65, hexWithAlpha(color2, opacity * 0.65));
        grad.addColorStop(1,    hexWithAlpha(color3, opacity * 0.25));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ballX, ballY, size, 0, Math.PI * 2);
        ctx.fill();
    }

    // 3. Hot core.
    if (params.coreSize > 0.01) {
        const coreR = size * params.coreSize;
        const grad = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, coreR);
        grad.addColorStop(0,   hexWithAlpha(color1, opacity * 1.0));
        grad.addColorStop(0.6, hexWithAlpha(color1, opacity * 0.85));
        grad.addColorStop(1,   hexWithAlpha(color1, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(ballX, ballY, coreR, 0, Math.PI * 2);
        ctx.fill();
    }

    // 4. Surface distortion ring (sin-perturbed outline).
    const surfaceWave = params.surfaceWave;
    const waveCycles = Math.max(1, Math.round(params.surfaceWaveCycles));
    if (surfaceWave > 0.01) {
        ctx.strokeStyle = hexWithAlpha(color2, opacity * 0.75);
        ctx.lineWidth = lineThick;
        ctx.lineJoin = 'round';
        const N = 72;
        const timePhase = t * Math.PI * 2 * waveCycles;
        ctx.beginPath();
        for (let i = 0; i <= N; i++) {
            const a = (i / N) * Math.PI * 2;
            const wob =
                size * surfaceWave * 0.08 * Math.sin(a * 5 + timePhase) +
                size * surfaceWave * 0.04 * Math.sin(a * 9 - timePhase * 1.3);
            const r = size * 0.97 + wob;
            const px = ballX + Math.cos(a) * r;
            const py = ballY + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
    }

    // 5. Lightning arcs on the 3D sphere surface. Each arc is a short jagged
    // path on a great circle that gets rotated into 3D and projected. Arcs
    // partially behind the sphere fade with depth.
    const arcCount = Math.max(0, Math.round(params.arcCount));
    const arcCycles = Math.max(1, Math.round(params.arcCycles));
    const jaggedness = params.arcJaggedness;
    for (let arc = 0; arc < arcCount; arc++) {
        const arcPhase = arc / arcCount;
        const arcLife = ((t * arcCycles + arcPhase) % 1 + 1) % 1;
        if (arcLife > 0.45) continue;
        const visibility = Math.sin(arcLife / 0.45 * Math.PI);
        const cycleIndex = Math.floor(t * arcCycles + arcPhase);
        const seedA = Math.sin(arc * 7.3 + cycleIndex * 11.7) * 43758.5;
        const seedB = Math.sin(arc * 23.1 + cycleIndex * 17.3) * 43758.5;
        const seedC = Math.sin(arc * 41.5 + cycleIndex * 29.7) * 43758.5;
        const sA = seedA - Math.floor(seedA);
        const sB = seedB - Math.floor(seedB);
        const sC = seedC - Math.floor(seedC);
        // Per-arc great-circle orientation: random Euler angles. The arc
        // traverses the equator of this orientation.
        const orientTX = (sA - 0.5) * Math.PI;
        const orientTZ = sB * Math.PI * 2;
        const startU = sC * Math.PI * 2;
        const arcSpan = Math.PI * 0.35;
        const segCount = 12;

        ctx.strokeStyle = hexWithAlpha(color4, opacity * visibility * 0.95);
        ctx.lineWidth = lineThick * 0.85;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let s = 0; s <= segCount; s++) {
            const u = startU + (s / segCount) * arcSpan;
            const jSeed = Math.sin(s * 31.7 + arc * 11.3 + cycleIndex * 5.1) * 43758.5;
            const jitter = ((jSeed - Math.floor(jSeed)) - 0.5) * jaggedness * 0.12;
            const r = 1 + jitter;
            // Equator point in arc-local frame, then rotated by per-arc Euler.
            let lx = r * Math.cos(u), ly = r * Math.sin(u), lz = 0;
            // Tilt arc plane around X.
            const cosX = Math.cos(orientTX), sinX = Math.sin(orientTX);
            let ly2 = ly * cosX - lz * sinX, lz2 = ly * sinX + lz * cosX;
            ly = ly2; lz = lz2;
            // Tilt arc plane around Z.
            const cosZ = Math.cos(orientTZ), sinZ = Math.sin(orientTZ);
            let lx2 = lx * cosZ - ly * sinZ, ly3 = lx * sinZ + ly * cosZ;
            lx = lx2; ly = ly3;
            // Apply global rotation + project to screen.
            const p = proj3([lx, ly, lz]);
            if (s === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    }

    // 6. Orbiting sparkle particles — each particle's orbit is a circle in a
    // tilted 3D plane (per-particle random Euler tilt + the global 3D rotation
    // from the gizmo). Back-of-orbit particles project with smaller perspective
    // and dim alpha so they read as behind the ball.
    const orbitCount = Math.max(0, Math.round(params.orbitCount));
    const orbitSpeed = Math.max(1, Math.round(params.orbitSpeed));
    const orbitR = params.orbitRadius;  // in local sphere units
    const particleSize = minDim * 0.008 * params.orbitSize;
    for (let i = 0; i < orbitCount; i++) {
        const sA = Math.sin(i * 12.9898) * 43758.5; const rA = sA - Math.floor(sA);
        const sB = Math.sin(i * 78.233)  * 43758.5; const rB = sB - Math.floor(sB);
        const phase = (i / orbitCount) * Math.PI * 2;
        const angle = t * orbitSpeed * Math.PI * 2 + phase;
        // Per-particle orbit plane tilt — rotate the (cos, sin, 0) point so
        // each particle traces a different great circle on the sphere.
        const planeTiltX = (rA - 0.5) * Math.PI;
        const planeTiltZ = (rB - 0.5) * Math.PI;
        const cosPX = Math.cos(planeTiltX), sinPX = Math.sin(planeTiltX);
        const cosPZ = Math.cos(planeTiltZ), sinPZ = Math.sin(planeTiltZ);
        // Start in XY plane.
        let lx = orbitR * Math.cos(angle);
        let ly = orbitR * Math.sin(angle);
        let lz = 0;
        // Tilt around X axis.
        let ly1 = ly * cosPX - lz * sinPX, lz1 = ly * sinPX + lz * cosPX;
        ly = ly1; lz = lz1;
        // Tilt around Z axis.
        let lx1 = lx * cosPZ - ly * sinPZ, ly2 = lx * sinPZ + ly * cosPZ;
        lx = lx1; ly = ly2;
        // Apply global 3D rotation (from gizmo) + project.
        const p = proj3([lx, ly, lz]);
        const depthAlpha = 0.35 + 0.65 * Math.max(0, Math.min(1, (p.z + 1) / 2));
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, particleSize * 3);
        grad.addColorStop(0, hexWithAlpha(color1, opacity * depthAlpha * 0.95));
        grad.addColorStop(0.4, hexWithAlpha(color1, opacity * depthAlpha * 0.6));
        grad.addColorStop(1, hexWithAlpha(color1, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, particleSize * 3, 0, Math.PI * 2);
        ctx.fill();
    }

    // 7. Radial rays (optional rotating spokes).
    const rayCount = Math.max(0, Math.round(params.rays));
    if (rayCount > 0 && params.rayLength > 0.01) {
        const rayCycles = Math.max(0, Math.round(params.rayCycles));
        const rayBaseAng = t * rayCycles * Math.PI * 2;
        const rayLen = size * params.rayLength;
        for (let i = 0; i < rayCount; i++) {
            const a = rayBaseAng + (i / rayCount) * Math.PI * 2;
            const innerX = ballX + Math.cos(a) * size * 0.55;
            const innerY = ballY + Math.sin(a) * size * 0.55;
            const outerX = ballX + Math.cos(a) * rayLen;
            const outerY = ballY + Math.sin(a) * rayLen;
            const grad = ctx.createLinearGradient(innerX, innerY, outerX, outerY);
            grad.addColorStop(0, hexWithAlpha(color2, opacity * 0.85));
            grad.addColorStop(1, hexWithAlpha(color3, 0));
            ctx.strokeStyle = grad;
            ctx.lineWidth = lineThick * 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(innerX, innerY);
            ctx.lineTo(outerX, outerY);
            ctx.stroke();
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'energy',
    id:           'energyball',
    name:         'Energy Ball',
    description:  'Glowing orb of energy (Spirit Bomb, ki sphere, plasma ball). Multi-layer halo + core, surface lightning arcs, orbiting sparkles, optional radial rays.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY'],
    params: [
        { key: 'color1', label: 'Core (Hot)', type: 'color', default: '#ffffff' },
        { key: 'color2', label: 'Mid Color', type: 'color', default: '#80e0ff' },
        { key: 'color3', label: 'Outer Halo', type: 'color', default: '#3060ff' },
        { key: 'color4', label: 'Lightning', type: 'color', default: '#a0f0ff' },

        { key: 'size', label: 'Size',
            description: 'Overall ball radius (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.1, max: 1.5, step: 0.005, default: 0.55 },
        { key: 'centerX', label: 'Center X',
            description: 'Horizontal position (fraction of frame width). 0 = left edge, 0.5 = center, 1 = right edge.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'centerY', label: 'Center Y',
            description: 'Vertical position (fraction of frame height). 0 = top, 0.5 = center, 1 = bottom.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },

        { key: 'coreSize', label: 'Core Size',
            description: 'Bright white core as fraction of ball size.',
            type: 'slider', min: 0, max: 1.0, step: 0.05, default: 0.45 },
        { key: 'haloSize', label: 'Halo Size',
            description: 'Outer halo as multiplier of ball size. 1 = no halo, 3 = huge aura.',
            type: 'slider', min: 1.0, max: 3.5, step: 0.05, default: 1.7 },
        { key: 'haloIntensity', label: 'Halo Intensity',
            description: 'Brightness of the outer halo. 0 hides it.',
            type: 'slider', min: 0, max: 2, step: 0.05, default: 0.85 },
        { key: 'intensity', label: 'Intensity',
            description: 'Overall brightness multiplier.',
            type: 'slider', min: 0.3, max: 2.5, step: 0.05, default: 1.0 },

        { key: 'pulseCycles', label: 'Pulse Cycles',
            description: 'Size pulsation frequency (integer cycles per loop).',
            type: 'slider', min: 1, max: 12, step: 1, default: 3 },
        { key: 'pulseStrength', label: 'Pulse Strength',
            description: 'How much the ball fluctuates in size. 0 = steady.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.35 },

        { key: 'surfaceWave', label: 'Surface Distortion',
            description: 'Sin-wobble of the outline. 0 = clean sphere, 1 = roiling surface.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.4 },
        { key: 'surfaceWaveCycles', label: 'Wave Cycles',
            description: 'How fast the surface wobble rotates.',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },

        { key: 'arcCount', label: 'Lightning Arcs',
            description: 'Number of lightning arcs travelling around the surface. 0 = no arcs.',
            type: 'slider', min: 0, max: 12, step: 1, default: 4 },
        { key: 'arcCycles', label: 'Arc Speed',
            description: 'How many arc-strike cycles per loop. Integer for seamless loop.',
            type: 'slider', min: 1, max: 8, step: 1, default: 3 },
        { key: 'arcJaggedness', label: 'Arc Jaggedness',
            description: 'How wildly the lightning arcs zigzag.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.5 },

        { key: 'orbitCount', label: 'Orbit Particles',
            description: 'Sparkles orbiting the ball.',
            type: 'slider', min: 0, max: 30, step: 1, default: 10 },
        { key: 'orbitSpeed', label: 'Orbit Speed',
            description: 'Particle orbit speed (integer cycles per loop).',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },
        { key: 'orbitRadius', label: 'Orbit Radius',
            description: 'Orbit radius as multiplier of ball size.',
            type: 'slider', min: 0.6, max: 2.5, step: 0.05, default: 1.2 },
        { key: 'orbitSize', label: 'Particle Size',
            description: 'Size of each orbiting sparkle.',
            type: 'slider', min: 0.3, max: 3, step: 0.1, default: 1.0 },

        { key: 'rays', label: 'Radial Rays',
            description: 'Rotating spoke-like rays. 0 = no rays.',
            type: 'slider', min: 0, max: 16, step: 1, default: 0 },
        { key: 'rayCycles', label: 'Ray Spin',
            description: 'Rotations of the ray spokes per loop. 0 = static.',
            type: 'slider', min: 0, max: 6, step: 1, default: 1 },
        { key: 'rayLength', label: 'Ray Length',
            description: 'Length of each ray as multiplier of ball size.',
            type: 'slider', min: 1.0, max: 3.5, step: 0.05, default: 1.8 },

        { key: 'lineThickness', label: 'Line Thickness',
            description: 'Stroke width of arcs and surface ring.',
            type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.2 },

        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderEnergyBallFrame
});
