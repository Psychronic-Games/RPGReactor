/**
 * Fire — 16/32-bit pixel-art-style banded flame tongues with rising embers,
 * internal sizzle, and optional warped texture overlay.
 *
 * Renders fire as a stack of TONGUES with stepped color bands instead of
 * soft gradients. Each tongue is drawn 4 times at decreasing widths and
 * heights, in 4 distinct palette colors (outer/cool → inner/hot), producing
 * the concentric color rings characteristic of 16/32-bit era pixel art fire
 * (Chrono Trigger, FF6, Castlevania-style — not smoothly-shaded mobile-game
 * generic). Embers/sparks rise above the flame for dynamism.
 *
 * Depends on (globals):
 *   hexWithAlpha, mixHexColors  (helpers/color.js)
 *   drawTexturedTriangle        (helpers/texture.js)
 *   RR_ANIMATION_REGISTRY       (registry.js)
 *
 * Param mapping (legacy keys preserved):
 *   particleCount → number of tongues
 *   particleSize  → base tongue width multiplier
 *   turbulence    → sway + edge-wobble amplitude
 *   flicker, flickerCycles → brightness pulse (loop-safe)
 *   riseLoops     → dance speed (loop-safe)
 *   baseWidth     → horizontal spread of tongue anchors
 *   flameHeight   → maximum tongue height
 *   glow          → outer haze intensity + ember count multiplier
 */

// Precomputed taper curve: _FIRE_U_POW[s] = (s / _FIRE_STEPS) ^ 0.35
// Avoids 25 Math.pow() calls per silhouette inside the inner loop.
const _FIRE_STEPS = 24;
const _FIRE_U_POW = new Float32Array(_FIRE_STEPS + 1);
for (let _s = 0; _s <= _FIRE_STEPS; _s++) {
    _FIRE_U_POW[_s] = _s === 0 ? 0 : Math.pow(_s / _FIRE_STEPS, 0.35);
}

function renderFireFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;

    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const baseY = h * (params.baseY !== undefined ? params.baseY : 0.8);
    const minDimF = Math.min(w, h);
    const radiusF = minDimF * 0.5;
    const cyF = h / 2;
    const { transform: tfF, project: prF } = makeSymbol3DTransform(params, t, cx, cyF, radiusF);
    const projF = (sx, sy, z = 0) => {
        const lx = (sx - cx)  / radiusF;
        const ly = (cyF - sy) / radiusF;
        return prF(tfF([lx, ly, z]));
    };
    const spawnWidth = w * params.baseWidth;
    const maxHeight = h * params.flameHeight;
    const tongueCount = Math.max(1, Math.round(params.particleCount));
    const turb = params.turbulence;
    const flicker = params.flicker;
    const flickerCycles = Math.max(0, Math.round(params.flickerCycles));
    const danceCycles = Math.max(1, Math.round(params.riseLoops));
    const baseTongueW = Math.min(w, h) * 0.10 * params.particleSize;
    const colorCore = params.coreColor;
    const colorTip  = params.tipColor;
    const glow = params.glow;

    const STEPS = _FIRE_STEPS;
    const uPow  = _FIRE_U_POW;

    // 4 stepped color bands, outer (cool tip) → inner (white-hot).
    // phaseShift values MUST stay aligned with PHASE_SHIFTS[] below so the
    // precomputed sway cache index (0-3) matches the band index (0-3).
    const colorMid     = mixHexColors(colorTip, colorCore, 0.45);
    const colorHotspot = mixHexColors(colorCore, '#ffffff', 0.7);
    const bands = [
        { widthScale: 1.00, heightScale: 1.00, color: colorTip,     phaseShift: 0.00 },
        { widthScale: 0.78, heightScale: 0.92, color: colorMid,     phaseShift: 0.85 },
        { widthScale: 0.55, heightScale: 0.82, color: colorCore,    phaseShift: 1.73 },
        { widthScale: 0.32, heightScale: 0.72, color: colorHotspot, phaseShift: 2.61 }
    ];

    // Per-tongue static properties (unchanged from original).
    const tongues = [];
    for (let i = 0; i < tongueCount; i++) {
        const sA = Math.sin(i * 12.9898) * 43758.5453;  const rA = sA - Math.floor(sA);
        const sB = Math.sin(i * 78.233)  * 43758.5453;  const rB = sB - Math.floor(sB);
        const sC = Math.sin(i * 39.346)  * 43758.5453;  const rC = sC - Math.floor(sC);
        const phase = i * 1.93;
        const tongueSpread = params.tongueSpread !== undefined ? params.tongueSpread : 1;
        const anchorX = cx + (rA - 0.5) * spawnWidth * tongueSpread;
        const horizDist = Math.abs(rA - 0.5) * 2;
        const teardrop  = 1 - Math.pow(horizDist, 1.5) * 0.55;
        const randomVar = 0.85 + 0.25 * rB;
        const heightMul = teardrop * randomVar;
        const widthMul  = 0.7 + 0.6  * rC;
        const tipFrac   = 0.0 + 0.06 * rC;
        const tongueH   = maxHeight * heightMul;
        let bright = 1;
        if (flickerCycles > 0 && flicker > 0) {
            const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * flickerCycles + phase * 0.7);
            bright = (1 - flicker) + flicker * pulse;
        }
        if (bright < 0.05) continue;
        tongues.push({ anchorX, tongueH, widthMul, tipFrac, phase, bright });
    }

    // Precompute sway, tip-chaos, and edge-ripple for every (tongue × phase)
    // combination. The 4 phase values match bands[0..3].phaseShift exactly, so
    // band index bi doubles as the phase index into this table. Phase index 0
    // (phaseShift=0.00) is also reused by the glow passes, at zero extra cost.
    //
    // Each entry is a Float32Array of length (STEPS+1)*3, laid out as:
    //   [baseSway₀, tipChaos₀, edgeRipL₀,  baseSway₁, tipChaos₁, edgeRipL₁, ...]
    //
    // This replaces 9 sin() calls × 25 steps × tongues × petals × (4 bands + 2 glow)
    // with 9 sin() calls × 25 steps × tongues × 4 phases — a ~6× reduction at
    // default settings (9 tongues, 3 petals).
    const PHASE_SHIFTS = [0.00, 0.85, 1.73, 2.61];
    const swayMag = w * 0.09  * turb;
    const edgeMag = w * 0.014 * (0.4 + turb);
    const tPi2 = t * Math.PI * 2;
    // Pre-multiply the time terms common to every tongue so the inner loop
    // only adds tShift constants.
    const dc0 = tPi2 *  danceCycles;
    const dc1 = tPi2 * (danceCycles + 1);
    const dc2 = tPi2 * (danceCycles + 2);
    const dc3 = tPi2 * (danceCycles + 3);
    const dc4 = tPi2 * (danceCycles + 4);

    // tgSway[ti][phaseIdx] → Float32Array((STEPS+1)*3)
    const tgSway = [];
    for (let ti = 0; ti < tongues.length; ti++) {
        const tg = tongues[ti];
        const tipChaosMag = w * 0.07 * turb * (0.5 + 0.5 * tg.tongueH / maxHeight);
        const phaseArr = [];
        for (let pi = 0; pi < 4; pi++) {
            const ps  = PHASE_SHIFTS[pi];
            const ts1 = tg.phase + ps;
            const ts2 = tg.phase * 1.71 + 2.3 + ps * 1.31;
            const ts3 = tg.phase * 0.43 + 4.7 + ps * 0.79;
            const arr = new Float32Array((STEPS + 1) * 3);
            for (let s = 0; s <= STEPS; s++) {
                const u  = s / STEPS;
                const u3 = u * u * u;
                const baseSway = swayMag * u * (
                    0.55 * Math.sin(u * Math.PI * 1.3 + dc0 + ts1)
                  + 0.28 * Math.sin(u * Math.PI * 2.8 + dc1 + ts2)
                  + 0.17 * Math.sin(u * Math.PI * 4.5 + dc2 + ts3)
                );
                const tipChaos = tipChaosMag * u3 * (
                    0.50 * Math.sin(u * Math.PI * 5  + dc2 + ts1 * 1.7)
                  + 0.32 * Math.sin(u * Math.PI * 9  + dc3 + ts2 * 2.3)
                  + 0.18 * Math.sin(u * Math.PI * 14 + dc4 + ts3 * 1.4)
                );
                // sin(x + π) = −sin(x) → edgeRipR = −edgeRipL (no extra sin calls).
                const edgeRipL = edgeMag * (
                      0.50 * Math.sin(u * Math.PI * 6  + dc0 + ts1)
                    + 0.32 * Math.sin(u * Math.PI * 11 + dc1 + ts2)
                    + 0.18 * Math.sin(u * Math.PI * 18 + dc2 + ts3)
                );
                const base = s * 3;
                arr[base]     = baseSway;
                arr[base + 1] = tipChaos;
                arr[base + 2] = edgeRipL;
            }
            phaseArr.push(arr);
        }
        tgSway.push(phaseArr);
    }

    // Compute the deformed silhouette of a tongue using the precomputed sway
    // cache (no trig inside the step loop). cosP/sinP for the petal projection
    // are hoisted outside the step loop.
    const computeTongueSilhouette = (tg, ti, widthScale, heightScale, phaseIdx, petalAngle) => {
        const { anchorX, tongueH, widthMul, tipFrac } = tg;
        const localW = baseTongueW * widthMul * widthScale;
        const tipW   = localW * tipFrac;
        const effH   = tongueH * heightScale;
        const left   = [];
        const right  = [];
        const cosP   = Math.cos(petalAngle);
        const sinP   = Math.sin(petalAngle);
        const swayData = tgSway[ti][phaseIdx];
        for (let s = 0; s <= STEPS; s++) {
            const u         = s / STEPS;
            const y         = baseY - u * effH;
            const widthHere = localW + (tipW - localW) * uPow[s];
            const base      = s * 3;
            const baseSway  = swayData[base];
            const tipChaos  = swayData[base + 1];
            const edgeRipL  = swayData[base + 2];
            const cxAtU     = anchorX + baseSway + tipChaos;
            const offsetL   = -widthHere * 0.5 + edgeRipL;
            const offsetR   =  widthHere * 0.5 - edgeRipL;
            const baseLx    = (cxAtU - cx) / radiusF;
            const ly3       = (cyF - y)    / radiusF;
            const lP = prF(tfF([baseLx + (offsetL / radiusF) * cosP, ly3, (offsetL / radiusF) * sinP]));
            const rP = prF(tfF([baseLx + (offsetR / radiusF) * cosP, ly3, (offsetR / radiusF) * sinP]));
            left.push({  x: lP.x, y: lP.y });
            right.push({ x: rP.x, y: rP.y });
        }
        return { left, right };
    };

    // Fill a silhouette polygon with a sharp apex at the tip.
    const fillTongueSilhouette = (sil, fillStyle) => {
        const { left, right } = sil;
        const apexX = (left[STEPS].x + right[STEPS].x) * 0.5;
        const apexY = (left[STEPS].y + right[STEPS].y) * 0.5;
        ctx.beginPath();
        ctx.moveTo(left[0].x, left[0].y);
        for (let s = 1; s < STEPS; s++) ctx.lineTo(left[s].x, left[s].y);
        ctx.lineTo(apexX, apexY);
        for (let s = STEPS - 1; s >= 0; s--) ctx.lineTo(right[s].x, right[s].y);
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();
    };

    // Warp a texture across a silhouette by triangulating strip-by-strip.
    const warpTextureOntoSilhouette = (sil, tex) => {
        const { left, right } = sil;
        const texW = tex.naturalWidth;
        const texH = tex.naturalHeight;
        for (let s = 0; s < STEPS - 1; s++) {
            const v0 = s / STEPS;
            const v1 = (s + 1) / STEPS;
            const A = left[s];      const B = right[s];
            const C = right[s + 1]; const D = left[s + 1];
            drawTexturedTriangle(ctx, tex,
                [0, v0 * texH, texW, v0 * texH, texW, v1 * texH],
                [A.x, A.y, B.x, B.y, C.x, C.y]);
            drawTexturedTriangle(ctx, tex,
                [0, v0 * texH, texW, v1 * texH, 0, v1 * texH],
                [A.x, A.y, C.x, C.y, D.x, D.y]);
        }
        const vLast = (STEPS - 1) / STEPS;
        const apexX = (left[STEPS].x + right[STEPS].x) * 0.5;
        const apexY = (left[STEPS].y + right[STEPS].y) * 0.5;
        drawTexturedTriangle(ctx, tex,
            [0, vLast * texH, texW, vLast * texH, texW * 0.5, texH],
            [left[STEPS - 1].x, left[STEPS - 1].y, right[STEPS - 1].x, right[STEPS - 1].y, apexX, apexY]);
    };

    // Glow uses phaseIdx=0 (same as band 0, phaseShift=0.00) — no extra sway
    // computation needed.
    const drawTongueScaled = (tg, ti, widthScale, heightScale, fillStyle, petalAngle = 0) => {
        fillTongueSilhouette(
            computeTongueSilhouette(tg, ti, widthScale, heightScale, 0, petalAngle),
            fillStyle
        );
    };

    const volume = Math.max(1, Math.round(params.volume !== undefined ? params.volume : 3));
    const petalAngles = [];
    for (let pi = 0; pi < volume; pi++) {
        petalAngles.push((pi / volume) * Math.PI * 2);
    }

    // Glow haze — two blur passes, each petal contributes so the halo wraps
    // the full volumetric tongue body.
    if (glow > 0.01) {
        ctx.save();
        const outerBlur = Math.min(w, h) * 0.10 * glow;
        if (ctx.filter !== undefined) ctx.filter = `blur(${outerBlur}px)`;
        for (let ti = 0; ti < tongues.length; ti++) {
            const tg = tongues[ti];
            for (const pa of petalAngles) {
                drawTongueScaled(tg, ti, 1.45, 1.15, hexWithAlpha(colorTip, tg.bright * 0.70 * glow), pa);
            }
        }
        ctx.restore();

        ctx.save();
        const innerBlur = Math.min(w, h) * 0.04 * glow;
        if (ctx.filter !== undefined) ctx.filter = `blur(${innerBlur}px)`;
        for (let ti = 0; ti < tongues.length; ti++) {
            const tg = tongues[ti];
            for (const pa of petalAngles) {
                drawTongueScaled(tg, ti, 1.20, 1.08, hexWithAlpha(colorCore, tg.bright * 0.55 * glow), pa);
            }
        }
        ctx.restore();
    }

    const tex = params._textureImage;
    const hasTexture = tex && tex.complete && tex.naturalWidth > 0;
    const texOpacity = params.textureOpacity !== undefined ? params.textureOpacity : 0.6;
    const useTexture = hasTexture && texOpacity > 0.01;
    const texSmooth = (params._interpolation !== 'nearest');

    // Four-band fill, outer → inner. Band index bi is also the phaseIdx into
    // the sway cache (bands[bi].phaseShift === PHASE_SHIFTS[bi]).
    for (let bi = 0; bi < bands.length; bi++) {
        const band = bands[bi];
        for (let ti = 0; ti < tongues.length; ti++) {
            const tg = tongues[ti];
            for (const pa of petalAngles) {
                const sil = computeTongueSilhouette(tg, ti, band.widthScale, band.heightScale, bi, pa);
                fillTongueSilhouette(sil, hexWithAlpha(band.color, tg.bright));
                if (useTexture) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'source-atop';
                    ctx.globalAlpha = texOpacity;
                    ctx.imageSmoothingEnabled = texSmooth;
                    warpTextureOntoSilhouette(sil, tex);
                    ctx.restore();
                }
            }
        }
    }

    // Internal sizzle — bright sparkles riding the flame centerline.
    // Reads baseSway from the precomputed cache (phaseIdx=0) at the nearest
    // step index, eliminating the 3 sin() calls of the original inner loop.
    const sparklesPerTongue = params.sizzleCount !== undefined ? Math.max(0, Math.round(params.sizzleCount)) : 3;
    const sizzleSizeMul = params.sizzleSize !== undefined ? params.sizzleSize : 1;
    const sparkleCycles = danceCycles + 2;
    for (let ti = 0; ti < tongues.length; ti++) {
        const tg = tongues[ti];
        const localW = baseTongueW * tg.widthMul * 0.32;
        const tipW   = localW * tg.tipFrac;
        const swayData0 = tgSway[ti][0];
        for (let si = 0; si < sparklesPerTongue; si++) {
            const offset = (si + ti * 0.37) / sparklesPerTongue;
            const life = ((t * sparkleCycles + offset) % 1 + 1) % 1;
            const u = 0.15 + 0.7 * life;
            const y = baseY - u * tg.tongueH * 0.85;
            // Read baseSway from nearest precomputed step (sparkles are small
            // dots so sub-step accuracy is imperceptible).
            const sStep = Math.min(STEPS, Math.round(u * STEPS));
            const sway  = swayData0[sStep * 3];
            const widthHere = localW + (tipW - localW) * Math.pow(u, 0.55);
            const lateral   = 0.35 * widthHere * Math.sin(t * Math.PI * 2 * sparkleCycles + si * 2.71 + ti * 1.3);
            const x = tg.anchorX + sway + lateral;
            const alpha = Math.sin(life * Math.PI) * tg.bright * 0.85;
            if (alpha < 0.05) continue;
            const size = Math.min(w, h) * 0.007 * sizzleSizeMul;
            const sp = projF(x, y, 0);
            ctx.fillStyle = hexWithAlpha(colorHotspot, alpha);
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Embers — pinpoint sparks rising above the flame on their own cycle.
    const emberCount = params.emberCount !== undefined
        ? Math.max(0, Math.round(params.emberCount))
        : Math.max(0, Math.round(tongueCount * 0.7));
    const emberSizeMul = params.emberSize !== undefined ? params.emberSize : 1;
    const emberRiseLoops = Math.max(1, danceCycles + 1);
    for (let i = 0; i < emberCount; i++) {
        const seed  = Math.sin(i * 7.713 + 100) * 43758.5453;
        const rnd   = seed  - Math.floor(seed);
        const seed2 = Math.sin(i * 3.179 + 41)  * 43758.5453;
        const rnd2  = seed2 - Math.floor(seed2);
        const phaseOffset = i / emberCount;
        const life = ((t * emberRiseLoops + phaseOffset) % 1 + 1) % 1;
        const spawnX = cx + (rnd - 0.5) * spawnWidth * 1.3;
        const y = baseY - life * maxHeight * 1.3;
        const driftX = w * 0.06 * turb * Math.sin(life * Math.PI * 2 + i * 2.7);
        const x = spawnX + driftX;
        const alpha = Math.min(1, life * 5) * (1 - life);
        if (alpha < 0.05) continue;
        const size = Math.min(w, h) * 0.013 * (0.6 + 0.7 * rnd2) * emberSizeMul;
        const ep = projF(x, y, 0);
        ctx.fillStyle = hexWithAlpha(colorHotspot, alpha);
        ctx.beginPath();
        ctx.arc(ep.x, ep.y, size, 0, Math.PI * 2);
        ctx.fill();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'elements',
    id:           'fire',
    name:         'Fire',
    description:  'Procedural rising flame — particles rise from a base, fade hot-core to cool-tip, with adjustable turbulence and flicker.',
    defaultBlend: 'lighter',
    noRandomize: ['centerX'],
    params: [
        { key: 'coreColor', label: 'Core Color',
            description: 'Color at the flame base (the hot part). Particles start at this color when they spawn.',
            type: 'color', default: '#fff066' },
        { key: 'tipColor', label: 'Tip Color',
            description: 'Color at the top of the flames. Particles cross-fade from core to tip color across their lifetime.',
            type: 'color', default: '#ff2010' },
        { key: 'centerX', label: 'Center X',
            description: 'Horizontal center of the flame column (fraction of frame width). 0 = left edge, 0.5 = middle, 1 = right edge.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'baseY', label: 'Base Y',
            description: 'Vertical position of the flame base (0 = top of frame, 1 = bottom). Default 0.8 puts the base near the bottom edge.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0.8 },
        { key: 'baseWidth', label: 'Base Width',
            description: 'Horizontal spread of where particles spawn (fraction of frame width). 0 = single column, 1 = full width.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0.25 },
        { key: 'flameHeight', label: 'Flame Height',
            description: 'Maximum height particles rise (fraction of frame height). Values > 1 let particles overshoot the frame.',
            type: 'slider', min: 0.1, max: 1.5, step: 0.05, default: 0.6 },
        { key: 'particleCount', label: 'Tongue Count',
            description: 'Number of flame tongues. More = denser flame with more overlapping tongues.',
            type: 'slider', min: 1, max: 30, step: 1, default: 9 },
        { key: 'particleSize', label: 'Tongue Width',
            description: 'Base width of each flame tongue. Wider = thicker, more solid flame body.',
            type: 'slider', min: 0.2, max: 3, step: 0.05, default: 1.1 },
        { key: 'tongueSpread', label: 'Tongue Spread',
            description: 'Multiplier on the distance between flame tongues, on top of Base Width. 0 = all tongues stacked at the center (single fat column), 1 = default spread, 2-3 = wide separation (distinct flame columns).',
            type: 'slider', min: 0, max: 3, step: 0.05, default: 1.0 },
        { key: 'turbulence', label: 'Wave / Sway',
            description: 'How much tongues wave and crinkle. 0 = stiff candle flame, high = wild dance.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6 },
        { key: 'flicker', label: 'Flicker Strength',
            description: 'Brightness variance over time (0 = steady, 1 = strong pulse).',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.35 },
        { key: 'flickerCycles', label: 'Flicker Cycles',
            description: 'How many flicker pulses across the loop. Integer required for seamless looping.',
            type: 'slider', min: 0, max: 8, step: 1, default: 3 },
        { key: 'riseLoops', label: 'Dance Speed',
            description: 'How many full sway cycles per loop. Higher = faster waving. Integer keeps the loop seamless.',
            type: 'slider', min: 1, max: 6, step: 1, default: 2 },
        { key: 'glow', label: 'Glow',
            description: 'Soft halo behind each tongue. Adds warmth without blurring the flame edges.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.35 },
        { key: 'emberCount', label: 'Ember Count',
            description: 'Number of ember sparks rising ABOVE the flame. 0 = no embers.',
            type: 'slider', min: 0, max: 40, step: 1, default: 6 },
        { key: 'emberSize', label: 'Ember Size',
            description: 'Size multiplier for the rising ember sparks.',
            type: 'slider', min: 0.2, max: 3, step: 0.05, default: 1.0 },
        { key: 'sizzleCount', label: 'Sizzle Count',
            description: 'Number of bright sparkles WITHIN each flame tongue (riding along the centerline). 0 = no internal sizzle.',
            type: 'slider', min: 0, max: 8, step: 1, default: 3 },
        { key: 'sizzleSize', label: 'Sizzle Size',
            description: 'Size multiplier for the internal flame sparkles.',
            type: 'slider', min: 0.2, max: 3, step: 0.05, default: 1.0 },
        // 3D rotation. Drag the gizmo or set the sliders directly.
        ...SYMBOL3D_ROTATION_PARAMS,
        { key: 'volume', label: 'Volume (Petals)',
            description: 'Number of ribbon petals per tongue, rotated around the tongue\'s vertical axis. 1 = flat sheet (legacy 2D look); 3-4 = true volumetric flame finger that reads as 3D from any angle. Higher = more solid look but more rendering cost.',
            type: 'slider', min: 1, max: 6, step: 1, default: 3 },
        { key: 'textureOpacity', label: 'Texture Opacity',
            description: 'Strength of the texture overlay on the flame. 0 = base colors only. Only relevant when a Texture is set.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 0.6 },
        { key: 'texture', label: 'Texture',
            description: 'Optional image overlaid on the flame body. Clips to the flame silhouette. Try noise/grain images for grit, smoke patterns for wisp.',
            type: 'texture', default: '' }
    ],
    render: renderFireFrame
});
