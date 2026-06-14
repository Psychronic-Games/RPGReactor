/**
 * Teleport Column — Star-Trek-transporter-style energy column. A
 * vertical stack of glowing rings forms a cylindrical "beam", a swarm
 * of particles drifts along it, and optional data-fragment overlays
 * paint horizontal energy bursts across the cylinder for the iconic
 * "data-stream" look.
 *
 * Three main visual layers, all projected through the symbol3D 3D
 * pipeline (so tilting the column reveals real elliptical rings, not a
 * flat 2D stack):
 *   1. Ring stack — N horizontal circles in local XZ planes, evenly
 *      spaced from top to bottom of the column.
 *   2. Data fragments — short arc segments inside the cylinder that
 *      cycle vertically with the loop, suggesting energy/data flow.
 *   3. Particle field — dots at random positions within the cylinder
 *      drifting up/down with a deterministic loop-safe phase.
 *
 * Loop-safety:
 *   - Swirl & particle vertical cycles are integer counts per loop.
 *   - Particle alpha follows sin(π·phase) so they fade in at the
 *     spawn end and out at the despawn end, hiding the wrap point.
 *
 * Defaults to a slight forward tilt so the rings read as ellipses
 * rather than flat lines.
 */
function renderTeleportColumnFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const color1 = params.color1;
    const color2 = params.color2;
    const opacity = params.opacity;
    const aspectRatio = params.aspectRatio;
    const radius = params.columnRadius;
    const halfH = aspectRatio * 0.5;

    const ringCount = Math.max(2, Math.round(params.ringCount));
    const swirlCycles = Math.round(params.swirl);
    const swirlAngle = t * swirlCycles * Math.PI * 2;
    const baseLineW = Math.max(0.5, minDim * 0.004 * params.thickness);
    const glow = params.glow;

    // Subtle radius pulse — modulates the column thickness over the loop.
    const pulse = params.pulse || 0;
    const pulseCycles = Math.max(1, Math.round(params.pulseCycles || 1));
    const pulseMod = 1 + pulse * 0.15 * Math.sin(t * pulseCycles * Math.PI * 2);
    const effR = radius * pulseMod;

    const proj3 = (x, y, z) => project(transform([x, y, z]));

    // ── Ring stack ────────────────────────────────────────────────────
    const ARC_SEGS = 36;
    const drawRing = (yLocal, alpha, lineW) => {
        ctx.beginPath();
        for (let k = 0; k <= ARC_SEGS; k++) {
            const a = (k / ARC_SEGS) * Math.PI * 2 + swirlAngle;
            const p = proj3(effR * Math.cos(a), yLocal, effR * Math.sin(a));
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.lineWidth = lineW;
        ctx.strokeStyle = hexWithAlpha(color1, opacity * alpha);
        ctx.stroke();
    };
    for (let i = 0; i < ringCount; i++) {
        const u = ringCount === 1 ? 0.5 : i / (ringCount - 1);
        const yLocal = halfH - u * 2 * halfH;
        if (glow > 0.01) {
            drawRing(yLocal, 0.35 * glow, baseLineW * (2 + glow * 4));
        }
        drawRing(yLocal, 1.0, baseLineW);
    }

    // ── Data fragments (short horizontal arc segments inside column) ──
    const dataAmount = Math.max(0, params.dataAmount);
    if (dataAmount > 0.01) {
        const segCount = Math.max(0, Math.round(dataAmount * 28));
        const dataCycles = Math.max(1, Math.round(params.dataSpeed));
        for (let i = 0; i < segCount; i++) {
            const phase = ((t * dataCycles + i / segCount) % 1 + 1) % 1;
            const yLocal = halfH - phase * 2 * halfH;
            const angle = i * 1.7 + swirlAngle * 0.7;
            const segHalf = 0.25 + 0.30 * (Math.sin(i * 5.2) * 0.5 + 0.5);
            const a0 = angle - segHalf;
            const a1 = angle + segHalf;
            const p0 = proj3(effR * Math.cos(a0), yLocal, effR * Math.sin(a0));
            const p1 = proj3(effR * Math.cos(a1), yLocal, effR * Math.sin(a1));
            const fade = Math.sin(phase * Math.PI);
            ctx.strokeStyle = hexWithAlpha(color2, opacity * 0.75 * fade);
            ctx.lineWidth = baseLineW * 0.6;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }
    }

    // ── Particle field flowing along the column ───────────────────────
    const particleCount = Math.max(0, Math.round(params.particleCount));
    if (particleCount > 0) {
        const particleCycles = Math.max(1, Math.round(params.particleSpeed));
        const particleSize = Math.max(0.5, minDim * 0.003 * params.particleSize);
        // direction: +1 = up, -1 = down (column drift direction)
        const dir = params.particleDirection >= 0 ? 1 : -1;
        for (let i = 0; i < particleCount; i++) {
            const sR = Math.sin(i * 12.9898) * 43758.5453;  const rndR = sR - Math.floor(sR);
            const sA = Math.sin(i * 78.233)  * 43758.5453;  const rndA = sA - Math.floor(sA);
            const sP = Math.sin(i * 39.346)  * 43758.5453;  const rndPh = sP - Math.floor(sP);
            const phase = ((t * particleCycles * dir + rndPh) % 1 + 1) % 1;
            // dir flips top/bottom — phase=0 is spawn, phase=1 is fade-out
            const yLocal = dir > 0 ? halfH - phase * 2 * halfH : -halfH + phase * 2 * halfH;
            const a = rndA * Math.PI * 2 + swirlAngle * 0.5;
            const pr = effR * (0.15 + 0.80 * rndR);  // inside the cylinder
            const fade = Math.sin(phase * Math.PI);
            const alpha = opacity * fade * 0.85;
            if (alpha < 0.05) continue;
            const p = proj3(pr * Math.cos(a), yLocal, pr * Math.sin(a));
            ctx.fillStyle = hexWithAlpha(color2, alpha);
            ctx.beginPath();
            ctx.arc(p.x, p.y, particleSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'energy',
    id:           'teleportcolumn',
    name:         'Teleport Column',
    description:  'Star-Trek-transporter-style energy column: stacked glowing rings around a vertical axis, drifting particle field inside the cylinder, and optional data-fragment overlays. Tilt the column to reveal each ring as a real 3D ellipse.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Ring Color',
            description: 'Color of the stacked rings (canonical: bright cyan).',
            type: 'color', default: '#40e6ff' },
        { key: 'color2', label: 'Particle / Data Color',
            description: 'Color of the floating particles and the data-fragment arcs (often a lighter / whiter shade of the ring color).',
            type: 'color', default: '#a8f6ff' },

        { key: 'size', label: 'Size',
            description: 'Overall column size (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },
        { key: 'aspectRatio', label: 'Column Height',
            description: 'Vertical extent of the column (column height as a fraction of size). 1.0 = column-as-tall-as-wide, 1.6 = taller transporter pad.',
            type: 'slider', min: 0.3, max: 2.5, step: 0.05, default: 1.5 },
        { key: 'columnRadius', label: 'Column Radius',
            description: 'Horizontal radius of the column rings, in local units. Narrower column = thinner beam.',
            type: 'slider', min: 0.05, max: 0.5, step: 0.01, default: 0.22 },

        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'ringCount', label: 'Ring Count',
            description: 'Number of horizontal rings stacked along the column.',
            type: 'slider', min: 2, max: 60, step: 1, default: 20 },
        { key: 'thickness', label: 'Ring Thickness',
            description: 'Stroke width of each ring.',
            type: 'slider', min: 0.2, max: 6, step: 0.1, default: 1.2 },
        { key: 'glow', label: 'Glow',
            description: 'Soft halo behind every ring. 0 = sharp wireframe.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.7 },
        { key: 'swirl', label: 'Swirl Cycles',
            description: 'Whole rotations of the ring vertices around the column axis per loop. Integer keeps the loop seamless.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },

        { key: 'dataAmount', label: 'Data Overlay',
            description: 'Density of horizontal data-fragment arcs painted inside the column. 0 = no overlay.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6 },
        { key: 'dataSpeed', label: 'Data Speed',
            description: 'How many vertical cycles the data fragments complete per loop. Integer for seamless looping.',
            type: 'slider', min: 1, max: 8, step: 1, default: 3 },

        { key: 'particleCount', label: 'Particle Count',
            description: 'Number of particles drifting through the cylinder.',
            type: 'slider', min: 0, max: 200, step: 1, default: 60 },
        { key: 'particleSize', label: 'Particle Size',
            description: 'Size multiplier for the particle dots.',
            type: 'slider', min: 0.2, max: 4, step: 0.05, default: 1.0 },
        { key: 'particleSpeed', label: 'Particle Speed',
            description: 'Vertical cycles each particle completes per loop. Integer for seamless looping.',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },
        { key: 'particleDirection', label: 'Particle Direction',
            description: 'Direction of particle drift. Positive = up, negative = down. Use up for "beam-up", down for "beam-down".',
            type: 'slider', min: -1, max: 1, step: 2, default: 1 },

        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderTeleportColumnFrame
});
