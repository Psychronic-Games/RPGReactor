/**
 * Electric — coherent lightning strikes with phase-based progression rather
 * than random blink-on / blink-off bolts. Each strike progresses through:
 *
 *   buildupFrac fraction:  sparks crackle at the source point (charging up).
 *   extendFrac  fraction:  main bolt extends from source toward target.
 *   flashFrac   fraction:  bolt at peak intensity, branches appear, optional
 *                          full-screen flash overlay.
 *   remainder:             quadratic decay — bolt fades while still visible.
 *
 * Bolt paths are deterministically seeded per bolt index so the same jagged
 * shape is drawn across all frames of a single strike — gives the illusion
 * of a real lightning bolt rather than a stuttering noise field.
 *
 * Depends on:
 *   hexWithAlpha, mixHexColors  (helpers/color.js)
 *   RR_ANIMATION_REGISTRY       (registry.js)
 *
 * Variety:
 *   - Thunderstrike: 1-2 bolts, long extend, deep branches, strong flash
 *   - Tesla coil: many bolts, short extend, fast cycles, low buildup
 *   - Magic zap: thin bolts, cyan/purple, high flash overlay
 *   - Crackle field: many bolts, low jaggedness, no flash overlay
 *   - Plasma arc: thick bolts, slow decay (high flashFrac), high glow
 */
function renderElectricFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;

    const cxE = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cyE = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDimE = Math.min(w, h);
    const radiusE = minDimE * 0.5;
    // True 3D: bolts live in the XY plane (z=0). Each path vertex gets
    // projected so the strike path foreshortens correctly when tilted —
    // a bolt struck across a tilted plane curves through perspective.
    const { transform: tfE, project: prE } = makeSymbol3DTransform(params, t, cxE, cyE, radiusE);
    const proj = (sx, sy, z = 0) => {
        const lx = (sx - cxE) / radiusE;
        const ly = (cyE - sy) / radiusE;
        return prE(tfE([lx, ly, z]));
    };

    const boltCount = Math.max(1, Math.round(params.boltCount));
    const segments = Math.max(4, Math.round(params.segments));
    const jaggedness = params.jaggedness;
    const branchProb = params.branchProbability;
    const maxBranchDepth = Math.max(0, Math.round(params.branchDepth));
    const thickness = Math.min(w, h) * 0.005 * params.thickness;
    const color1 = params.color1;
    const color2 = params.color2;
    const strikeCycles = Math.max(1, Math.round(params.strikeCycles));
    const buildupFrac = params.buildupFrac;
    const extendFrac = params.extendFrac;
    const flashFrac = params.flashFrac;
    const glow = params.glow;
    const opacity = params.opacity;
    const reach = Math.min(w, h) * params.reach;
    const flashOverlay = params.flashOverlay;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);

    // Build a deterministically-jagged path between two endpoints. The `seed`
    // argument controls the per-segment jitter, so passing the same seed
    // across frames produces an identical path — what makes the strike read
    // as a single bolt rather than re-randomizing noise.
    const buildBoltPath = (x1, y1, x2, y2, segs, seed, jitMul) => {
        const dx = x2 - x1, dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len < 1) return [{ x: x1, y: y1 }, { x: x2, y: y2 }];
        const ux = dx / len, uy = dy / len;
        const perpX = -uy, perpY = ux;
        const pts = [{ x: x1, y: y1 }];
        for (let s = 1; s < segs; s++) {
            const u = s / segs;
            const baseX = x1 + dx * u;
            const baseY = y1 + dy * u;
            const seedV = Math.sin(seed * 91.137 + s * 7.3) * 43758.5453;
            const jr = (seedV - Math.floor(seedV) - 0.5);
            const taper = Math.sin(u * Math.PI);
            const offset = jitMul * jaggedness * len * 0.2 * jr * taper;
            pts.push({
                x: baseX + perpX * offset,
                y: baseY + perpY * offset
            });
        }
        pts.push({ x: x2, y: y2 });
        return pts;
    };

    // Stroke a path with optional glow halo + bright core. lengthFrac in
    // (0,1] truncates the path proportionally to its cumulative arc length,
    // which is how the bolt visually grows during the extend phase.
    const drawPath = (pts, alpha, widthMul, lengthFrac) => {
        if (alpha < 0.04 || lengthFrac <= 0 || pts.length < 2) return;

        let totalLen = 0;
        const segLens = [];
        for (let i = 1; i < pts.length; i++) {
            const segLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            segLens.push(segLen);
            totalLen += segLen;
        }
        const targetLen = totalLen * lengthFrac;

        const drawn = [pts[0]];
        let acc = 0;
        for (let i = 0; i < segLens.length; i++) {
            if (acc + segLens[i] <= targetLen) {
                drawn.push(pts[i + 1]);
                acc += segLens[i];
            } else {
                const remain = targetLen - acc;
                const f = segLens[i] > 0 ? remain / segLens[i] : 0;
                drawn.push({
                    x: pts[i].x + (pts[i + 1].x - pts[i].x) * f,
                    y: pts[i].y + (pts[i + 1].y - pts[i].y) * f
                });
                break;
            }
        }
        if (drawn.length < 2) return;

        // Project every visible point through the 3D pipeline. The bolt
        // path was authored in 2D screen space (so the jaggedness scales
        // intuitively with `reach`), but each vertex is treated as a point
        // on the XY plane and projected — so when tilted, the bolt arcs
        // across the strike-plane in perspective.
        const projDrawn = drawn.map(p => proj(p.x, p.y, 0));

        const baseWidth = thickness * widthMul;
        if (glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color2, alpha * 0.5 * glow);
            ctx.lineWidth = baseWidth * (3 + glow * 4);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(projDrawn[0].x, projDrawn[0].y);
            for (let s = 1; s < projDrawn.length; s++) ctx.lineTo(projDrawn[s].x, projDrawn[s].y);
            ctx.stroke();
        }
        ctx.strokeStyle = hexWithAlpha(color1, alpha);
        ctx.lineWidth = baseWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(projDrawn[0].x, projDrawn[0].y);
        for (let s = 1; s < projDrawn.length; s++) ctx.lineTo(projDrawn[s].x, projDrawn[s].y);
        ctx.stroke();
    };

    // Recursively spawn branch bolts off the interior points of `pts`.
    // Each branch's path is also seeded so it's stable across the strike.
    const drawBranches = (pts, seed, depth, alpha, widthMul) => {
        if (depth >= maxBranchDepth || alpha < 0.05 || branchProb <= 0) return;
        const segsBranch = Math.max(3, Math.floor(segments * 0.55));
        const baseLen = Math.hypot(
            pts[pts.length - 1].x - pts[0].x,
            pts[pts.length - 1].y - pts[0].y
        );
        for (let s = 1; s < pts.length - 1; s++) {
            const branchSeed = Math.sin(pts[s].x * 0.027 + pts[s].y * 0.041 + depth * 5.3 + seed * 13.1) * 43758.5453;
            const br = branchSeed - Math.floor(branchSeed);
            if (br > branchProb) continue;
            const tiltSeed = Math.sin(pts[s].x * 0.013 + depth * 3.7 + seed * 17) * 43758.5453;
            const tilt = (tiltSeed - Math.floor(tiltSeed) - 0.5) * 1.6;
            const sign = (br > 0.5) ? 1 : -1;
            // Perpendicular to the incoming segment direction.
            const inx = pts[s].x - pts[s - 1].x;
            const iny = pts[s].y - pts[s - 1].y;
            const inLen = Math.hypot(inx, iny) || 1;
            const inUx = inx / inLen, inUy = iny / inLen;
            const perpAng = Math.atan2(inUx * sign, -inUy * sign); // ±90° rotation
            const ang = perpAng + tilt;
            const branchLen = baseLen * (0.18 + 0.35 * br);
            const bx2 = pts[s].x + Math.cos(ang) * branchLen;
            const by2 = pts[s].y + Math.sin(ang) * branchLen;
            const branchPts = buildBoltPath(pts[s].x, pts[s].y, bx2, by2, segsBranch, seed * 17 + s, 0.85);
            drawPath(branchPts, alpha * 0.7, widthMul * 0.55, 1);
            drawBranches(branchPts, seed * 19 + s + 1, depth + 1, alpha * 0.5, widthMul * 0.5);
        }
    };

    // Accumulate screen-flash from any bolts currently at peak intensity.
    let overallFlashAlpha = 0;

    for (let i = 0; i < boltCount; i++) {
        const s1 = Math.sin(i * 12.9898) * 43758.5453;  const r1 = s1 - Math.floor(s1);
        const s2 = Math.sin(i * 78.233)  * 43758.5453;  const r2 = s2 - Math.floor(s2);
        const s3 = Math.sin(i * 39.346)  * 43758.5453;  const r3 = s3 - Math.floor(s3);
        const s4 = Math.sin(i * 17.913)  * 43758.5453;  const r4 = s4 - Math.floor(s4);

        const phase = i / boltCount;
        const cycleTime = ((t * strikeCycles + phase) % 1 + 1) % 1;

        // Endpoints stable across frames — bolt always strikes between the
        // same source and target during a strike cycle.
        const ang1 = r1 * Math.PI * 2;
        const ang2 = r3 * Math.PI * 2;
        const x1 = cx + Math.cos(ang1) * reach * (0.05 + 0.35 * r2);
        const y1 = cy + Math.sin(ang1) * reach * (0.05 + 0.35 * r2);
        const x2 = cx + Math.cos(ang2) * reach * (0.55 + 0.45 * r4);
        const y2 = cy + Math.sin(ang2) * reach * (0.55 + 0.45 * r4);

        // --- Phase 1: build-up. Source crackles with small static sparks. ---
        if (cycleTime < buildupFrac) {
            const bu = cycleTime / buildupFrac;
            const sparkAlpha = opacity * 0.6 * bu;
            // 6 sparks repositioned each frame (intentionally flickery look).
            for (let sp = 0; sp < 6; sp++) {
                const sa = Math.sin(i * 33 + sp * 7.31 + frameIdx * 1.7) * 43758.5453;
                const sr = sa - Math.floor(sa);
                const sb = Math.sin(i * 41 + sp * 11.9 + frameIdx * 0.9) * 43758.5453;
                const sd = sb - Math.floor(sb);
                const ang = sr * Math.PI * 2;
                const dist = thickness * (3 + 4 * sd) * bu;
                const sx = x1 + Math.cos(ang) * dist;
                const sy = y1 + Math.sin(ang) * dist;
                // Project the spark position; size stays in screen pixels
                // since sparks are tiny enough that perspective foreshortening
                // wouldn't be visible anyway.
                const ps = proj(sx, sy, 0);
                if (glow > 0.01) {
                    ctx.fillStyle = hexWithAlpha(color2, sparkAlpha * 0.5 * glow);
                    ctx.beginPath();
                    ctx.arc(ps.x, ps.y, thickness * 1.6, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = hexWithAlpha(color1, sparkAlpha);
                ctx.beginPath();
                ctx.arc(ps.x, ps.y, thickness * 0.75, 0, Math.PI * 2);
                ctx.fill();
            }
            continue;
        }

        // --- Phases 2-4: strike progression. ---
        const strikeTime = (cycleTime - buildupFrac) / (1 - buildupFrac);

        let reveal;     // 0..1 — fraction of the bolt path drawn
        let intensity;  // 0..1 — overall brightness multiplier
        if (strikeTime < extendFrac) {
            // Extending: bolt grows from source outward at constant speed.
            reveal = strikeTime / extendFrac;
            // Brightness ramps quickly to full as the bolt grows.
            intensity = 0.7 + 0.3 * reveal;
        } else if (strikeTime < extendFrac + flashFrac) {
            // Peak flash: full bolt, full brightness.
            reveal = 1.0;
            intensity = 1.0;
        } else {
            // Decay: quadratic fade through the remainder of the cycle.
            reveal = 1.0;
            const decayDur = Math.max(0.001, 1 - extendFrac - flashFrac);
            const decayT = (strikeTime - extendFrac - flashFrac) / decayDur;
            intensity = (1 - decayT) * (1 - decayT);
        }

        const alpha = opacity * intensity;
        if (alpha < 0.04) continue;

        // Stable per-bolt path (seed = bolt index, identical every frame).
        const path = buildBoltPath(x1, y1, x2, y2, segments, i + 1, 1);

        drawPath(path, alpha, 1, reveal);

        // Branches appear only once the bolt is mostly extended, then fade
        // with the decay.
        if (strikeTime > extendFrac * 0.7) {
            const branchRamp = Math.min(1, (strikeTime - extendFrac * 0.7) / (extendFrac * 0.3));
            const branchAlpha = alpha * branchRamp;
            drawBranches(path, i + 1, 0, branchAlpha, 1);
        }

        // Accumulate screen-flash alpha from this bolt during peak.
        if (flashOverlay > 0.001 && strikeTime > extendFrac * 0.85) {
            const flashWindow = (strikeTime - extendFrac * 0.85) /
                Math.max(0.05, extendFrac * 0.15 + flashFrac);
            if (flashWindow >= 0 && flashWindow <= 1) {
                const fa = Math.sin(flashWindow * Math.PI) * intensity * flashOverlay * 0.35;
                if (fa > overallFlashAlpha) overallFlashAlpha = fa;
            }
        }
    }

    // Full-screen additive flash overlay (only fires if any bolt is at peak).
    // No save/restore needed now — we never modified the canvas transform.
    if (overallFlashAlpha > 0.02) {
        ctx.fillStyle = hexWithAlpha(color1, overallFlashAlpha * opacity);
        ctx.fillRect(0, 0, w, h);
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'elements',
    id:           'electric',
    name:         'Electric',
    description:  'Coherent lightning strikes with charge-up → extend → flash → decay progression. Stable per-strike path looks like a real bolt rather than random noise.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX', 'centerY', 'opacity'],
    params: [
        { key: 'color1', label: 'Core Color',
            description: 'Bright inner color of each bolt (the white-hot center).',
            type: 'color', default: '#e8f4ff' },
        { key: 'color2', label: 'Glow Color',
            description: 'Outer halo color of each bolt.',
            type: 'color', default: '#4080ff' },
        { key: 'boltCount', label: 'Bolt Count',
            description: 'How many lightning bolts strike per loop (each phase-shifted from the others).',
            type: 'slider', min: 1, max: 12, step: 1, default: 2 },
        { key: 'segments', label: 'Segments per Bolt',
            description: 'How many subdivisions each bolt has. More = smoother / less obvious jaggedness.',
            type: 'slider', min: 4, max: 32, step: 1, default: 14 },
        { key: 'jaggedness', label: 'Jaggedness',
            description: 'How violently the bolt path zigzags. 0 = straight line, 1.5 = wild fork.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.7 },
        { key: 'branchProbability', label: 'Branch Probability',
            description: 'Chance per interior segment of spawning a smaller branch bolt at peak.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.35 },
        { key: 'branchDepth', label: 'Branch Depth',
            description: 'Max levels of recursive branching. 0 = no branches.',
            type: 'slider', min: 0, max: 4, step: 1, default: 2 },
        { key: 'thickness', label: 'Thickness',
            description: 'Stroke width of each bolt core.',
            type: 'slider', min: 0.2, max: 4, step: 0.1, default: 1.4 },
        { key: 'reach', label: 'Reach',
            description: 'How far bolts spread from the frame center (fraction of frame).',
            type: 'slider', min: 0.1, max: 1.5, step: 0.05, default: 0.55 },
        { key: 'strikeCycles', label: 'Strike Cycles',
            description: 'How many full strike cycles per loop. Higher = more frequent strikes. Integer for seamless loop.',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },
        { key: 'buildupFrac', label: 'Buildup Fraction',
            description: 'Fraction of each cycle spent crackling at the source before the strike. 0 = strike immediately.',
            type: 'slider', min: 0, max: 0.5, step: 0.02, default: 0.12 },
        { key: 'extendFrac', label: 'Extend Fraction',
            description: 'Fraction of the post-buildup phase spent extending the bolt from source to target. Smaller = faster strike.',
            type: 'slider', min: 0.02, max: 0.5, step: 0.02, default: 0.12 },
        { key: 'flashFrac', label: 'Peak Flash Fraction',
            description: 'Fraction held at full brightness after the bolt finishes extending, before decay starts.',
            type: 'slider', min: 0, max: 0.5, step: 0.02, default: 0.1 },
        { key: 'glow', label: 'Glow',
            description: 'Bright outer halo around each bolt. 0 = bare lines, 1 = thick aura.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.7 },
        { key: 'flashOverlay', label: 'Screen Flash',
            description: 'Full-frame additive flash overlay at peak intensity. 0 = none, 1 = full white-out.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.35 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'opacity', label: 'Opacity',
            description: 'Overall opacity multiplier.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.95 }
    ],
    render: renderElectricFrame
});
