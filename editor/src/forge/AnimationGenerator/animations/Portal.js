/**
 * Portal — Stargate-style shimmering event horizon, built on a real
 * discrete-wave-equation water simulation.
 *
 * Implementation:
 *   1. A 2D depth-map sim runs on a small grid (`gridSize`). Each cell's
 *      next value uses the wave equation:
 *
 *          new = ((left + right + up + down) / 2 − previous) · damping
 *
 *      with clipping to keep the amplitudes finite.
 *   2. Deterministic "rain drops" are scheduled at specific frames in
 *      the loop. Each drop subtracts pressure from a disc of cells
 *      around its centre — like a finger touching water.
 *   3. The simulation is pre-computed across SEVERAL loops so the
 *      damped wave field settles into a quasi-periodic state. The last
 *      loop's depth maps are stored, one per frame; frame N's start
 *      state matches the end state of the previous frame so playback
 *      loops smoothly.
 *   4. Per render frame, the base image (radial silver/blue gradient
 *      with a bright centre highlight) is built into an offscreen
 *      canvas, then each output pixel samples the base canvas at an
 *      OFFSET determined by the local depth-map strength — that's the
 *      water-refraction effect. The pixel's brightness is multiplied
 *      by `1 + strength · reflection` for the highlight pop.
 *
 * Caching: the simulation depth maps are cached per (gridSize,
 * frameCount, rainCount, damping, rainSeed) tuple — changing any sim
 * param re-runs the simulation; tweaking purely-render params (colours,
 * refraction strength, etc.) is free.
 */
(function () {
    // Module-level cache of pre-computed simulation runs.
    // Key: see below. Value: Array<Float32Array> length = frameCount.
    const WATER_CACHE = new Map();

    /**
     * Run the wave simulation and return one Float32Array depth map per
     * frame of the loop. After settling for `SETTLE_LOOPS` extra loops,
     * the final loop's frames are recorded — the wave field is then in
     * a quasi-periodic state, so playback loops cleanly.
     */
    function simulateWater(W, H, N, rainCount, damping, rainSeed, dropSpread) {
        const SETTLE_LOOPS = 3;          // loops to settle before recording
        const CLIPPING     = 5;          // max abs amplitude per cell

        // Deterministic drop schedule. Frames are spaced EVENLY across
        // the loop so successive drops produce evenly-spaced concentric
        // rings; the visual reads as "ripples emanating from the
        // centre" rather than random rain. `dropSpread` (0..1) scatters
        // drops away from the centre — 0 = pure central rings, 1 = full
        // raindrop pattern across the disc.
        const drops = [];
        const cx = W * 0.5;
        const cy = H * 0.5;
        const maxOffR = Math.min(W, H) * 0.42 * Math.max(0, Math.min(1, dropSpread));
        for (let i = 0; i < rainCount; i++) {
            const seed = i * 1.0 + rainSeed;
            const sA = Math.sin(seed * 12.9898 + 1.1) * 43758.5453;  const rA = sA - Math.floor(sA);
            const sB = Math.sin(seed * 78.233  + 2.2) * 43758.5453;  const rB = sB - Math.floor(sB);
            const sD = Math.sin(seed * 5.71    + 4.4) * 43758.5453;  const rD = sD - Math.floor(sD);
            // Evenly-spaced frames across the loop.
            const frame = Math.floor((i + 0.5) / rainCount * N);
            // Per-drop offset from centre — zero at dropSpread=0.
            const radius = maxOffR * Math.sqrt(rA);
            const angle  = rB * Math.PI * 2;
            drops.push({
                frame,
                x:    Math.floor(cx + radius * Math.cos(angle)),
                y:    Math.floor(cy + radius * Math.sin(angle)),
                pressure: 1.8 + rD * 2.0
            });
        }
        drops.sort((a, b) => a.frame - b.frame);

        let map1 = new Float32Array(W * H);
        let map2 = new Float32Array(W * H);
        const allMaps = new Array(N);

        const splashR = 3;
        const splashR2 = splashR * splashR;

        for (let loop = 0; loop <= SETTLE_LOOPS; loop++) {
            let dropIdx = 0;
            for (let f = 0; f < N; f++) {
                // Apply any rain drops scheduled for this frame.
                while (dropIdx < drops.length && drops[dropIdx].frame === f) {
                    const drop = drops[dropIdx];
                    for (let dy = -splashR; dy <= splashR; dy++) {
                        const py = drop.y + dy;
                        if (py < 0 || py >= H) continue;
                        const rowBase = py * W;
                        for (let dx = -splashR; dx <= splashR; dx++) {
                            const px = drop.x + dx;
                            if (px < 0 || px >= W) continue;
                            const d2 = dx * dx + dy * dy;
                            if (d2 > splashR2) continue;
                            const fade = 1 - d2 / splashR2;
                            map1[rowBase + px] -= drop.pressure * fade;
                        }
                    }
                    dropIdx++;
                }

                // Evolve one wave-equation step.
                for (let y = 0; y < H; y++) {
                    const rowBase = y * W;
                    for (let x = 0; x < W; x++) {
                        const idx = rowBase + x;
                        const left  = x > 0       ? map1[idx - 1] : 0;
                        const right = x < W - 1   ? map1[idx + 1] : 0;
                        const up    = y > 0       ? map1[idx - W] : 0;
                        const down  = y < H - 1   ? map1[idx + W] : 0;
                        let v = (left + right + up + down) * 0.5 - map2[idx];
                        v *= damping;
                        if (v >  CLIPPING) v =  CLIPPING;
                        if (v < -CLIPPING) v = -CLIPPING;
                        map2[idx] = v;
                    }
                }

                // Swap buffers (map1 becomes the new current state).
                const tmp = map1; map1 = map2; map2 = tmp;

                // Record only the FINAL loop's frames.
                if (loop === SETTLE_LOOPS) {
                    allMaps[f] = new Float32Array(map1);
                }
            }
        }

        return allMaps;
    }

    function getWaterMaps(W, H, N, rainCount, damping, rainSeed, dropSpread) {
        const key = `${W}_${H}_${N}_${rainCount}_${damping.toFixed(4)}_${rainSeed}_${dropSpread.toFixed(2)}`;
        let maps = WATER_CACHE.get(key);
        if (!maps) {
            maps = simulateWater(W, H, N, rainCount, damping, rainSeed, dropSpread);
            WATER_CACHE.set(key, maps);
        }
        return maps;
    }

    window.__getPortalWaterMaps = getWaterMaps;
})();

function renderPortalFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);
    const opacity = params.opacity;

    // Disc radius in screen pixels.
    const portalR = Math.max(2, Math.round(minDim * 0.5 * params.size * params.radius));
    const D = portalR * 2;                  // offscreen canvas side length

    // Pre-compute (or cache hit) the depth maps for this configuration.
    const gridSize = Math.max(16, Math.round(params.gridSize));
    const rainCount = Math.max(1, Math.round(params.rainCount));
    const damping = Math.min(0.999, Math.max(0.7, params.damping));
    const rainSeed = Math.round(params.rainSeed);
    const dropSpread = Math.max(0, Math.min(1, params.dropSpread));
    const maps = window.__getPortalWaterMaps(
        gridSize, gridSize, totalFrames, rainCount, damping, rainSeed, dropSpread
    );
    const depthMap = maps[Math.max(0, Math.min(totalFrames - 1, frameIdx))];

    // Reuse the offscreen canvas across frames (sized to current D × D).
    let off = window.__PORTAL_OFF;
    if (!off) {
        off = document.createElement('canvas');
        window.__PORTAL_OFF = off;
    }
    if (off.width !== D || off.height !== D) {
        off.width = D;
        off.height = D;
    }
    const offCtx = off.getContext('2d');

    // ── 1. Build the BASE image across the WHOLE offscreen canvas (not
    //       clipped to the disc). The refraction offset can shift a
    //       sample point past where the disc edge would be, and if the
    //       base were clipped that sample would be transparent — which
    //       shows up as black holes in the output. By extending the
    //       gradient to the canvas corners we always have a valid
    //       sample colour; the OUTPUT disc mask still gives a clean
    //       circular silhouette.
    offCtx.clearRect(0, 0, D, D);
    const bg = offCtx.createRadialGradient(
        D * 0.5, D * 0.5, 0,
        D * 0.5, D * 0.5, portalR
    );
    bg.addColorStop(0,    params.color1);
    bg.addColorStop(0.7,  params.color2);
    bg.addColorStop(1,    params.color2);
    offCtx.fillStyle = bg;
    offCtx.fillRect(0, 0, D, D);

    if (params.centralGlow > 0.01) {
        const cgR = portalR * params.centralSize;
        const cg = offCtx.createRadialGradient(
            D * 0.5, D * 0.5, 0,
            D * 0.5, D * 0.5, cgR
        );
        cg.addColorStop(0,    hexWithAlpha(params.color3, params.centralGlow));
        cg.addColorStop(0.4,  hexWithAlpha(params.color3, params.centralGlow * 0.7));
        cg.addColorStop(1,    hexWithAlpha(params.color3, 0));
        offCtx.fillStyle = cg;
        offCtx.fillRect(0, 0, D, D);
    }

    // ── 2. Read the base image, apply per-pixel REFRACTION using the
    //       depth map, and write the result back.
    const baseImg = offCtx.getImageData(0, 0, D, D);
    const basePix = baseImg.data;
    const outImg  = offCtx.createImageData(D, D);
    const outPix  = outImg.data;

    const refrAmt = params.lightRefraction;
    const reflAmt = params.lightReflection;
    const portalR2 = portalR * portalR;

    for (let py = 0; py < D; py++) {
        // Map output pixel y to grid index y.
        const gy = (py * gridSize / D) | 0;
        for (let px = 0; px < D; px++) {
            const outIdx = (py * D + px) * 4;
            // Disc mask — leave outside pixels transparent.
            const dx = px - portalR;
            const dy = py - portalR;
            if (dx * dx + dy * dy > portalR2) {
                outPix[outIdx + 3] = 0;
                continue;
            }
            // Sample depth-map at the corresponding grid cell.
            const gx = (px * gridSize / D) | 0;
            const strength = depthMap[gy * gridSize + gx];

            // Refraction offset — see how many pixels the light bends.
            const refr = (strength * refrAmt) | 0;
            let xPix = px + refr;
            let yPix = py + refr;
            if (xPix < 0) xPix = 0;
            if (yPix < 0) yPix = 0;
            if (xPix > D - 1) xPix = D - 1;
            if (yPix > D - 1) yPix = D - 1;

            const inIdx = (yPix * D + xPix) * 4;
            // Reflection brightness multiplier — use the MAGNITUDE of
            // the wave height, not its signed value. The signed value
            // would darken wave troughs (1 + negative·k → near zero =
            // black pockets); using |strength| means both peaks and
            // troughs add highlight, like a real liquid surface where
            // any tilt produces a specular glint.
            const reflMul = 1 + Math.abs(strength) * reflAmt;
            let r = basePix[inIdx    ] * reflMul;
            let g = basePix[inIdx + 1] * reflMul;
            let b = basePix[inIdx + 2] * reflMul;
            if (r > 255) r = 255; else if (r < 0) r = 0;
            if (g > 255) g = 255; else if (g < 0) g = 0;
            if (b > 255) b = 255; else if (b < 0) b = 0;
            outPix[outIdx    ] = r;
            outPix[outIdx + 1] = g;
            outPix[outIdx + 2] = b;
            outPix[outIdx + 3] = basePix[inIdx + 3];
        }
    }
    offCtx.putImageData(outImg, 0, 0);

    // ── 3. Blit the refracted disc onto the main canvas at the desired
    //       layer opacity.
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(off, Math.round(cx - portalR), Math.round(cy - portalR));
    ctx.restore();

    // ── 4. Optional outer rim around the portal disc.
    if (params.outerRing > 0.01) {
        ctx.strokeStyle = hexWithAlpha(params.color1, opacity * params.outerRing);
        ctx.lineWidth = Math.max(0.5, minDim * 0.004 * params.outerRingThickness);
        ctx.beginPath();
        ctx.arc(cx, cy, portalR, 0, Math.PI * 2);
        ctx.stroke();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'energy',
    id:           'portal',
    name:         'Portal',
    description:  'Stargate-style event horizon with deterministic rain drops driving a periodic ripple field. Per-pixel refraction warps the base radial gradient for the rippling-liquid look.',
    defaultBlend: 'source-over',
    noRandomize: ['centerX', 'centerY', 'opacity', 'gridSize', 'rainSeed', 'dropSpread'],
    params: [
        { key: 'color1', label: 'Surface Color',
            description: 'Main surface tone (centre of the radial gradient) — silvery cyan-blue for the canonical mercury look.',
            type: 'color', default: '#90b8e0' },
        { key: 'color2', label: 'Edge Color',
            description: 'Darker outer tone — deep slate-blue.',
            type: 'color', default: '#10243d' },
        { key: 'color3', label: 'Glow Color',
            description: 'Central highlight colour — bright silver-white.',
            type: 'color', default: '#e8f4ff' },

        { key: 'size', label: 'Size',
            description: 'Overall portal size (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.9 },
        { key: 'radius', label: 'Disc Radius',
            description: 'Radius of the portal disc as a fraction of the size. Smaller = tighter portal.',
            type: 'slider', min: 0.2, max: 1.0, step: 0.01, default: 0.95 },

        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'lightRefraction', label: 'Light Refraction',
            description: 'How many pixels the light is bent by the water surface — the size of the warp. Higher = more dramatic distortion.',
            type: 'slider', min: 0, max: 20, step: 0.5, default: 8 },
        { key: 'lightReflection', label: 'Light Reflection',
            description: 'How much each pixel\'s brightness is boosted in proportion to local wave strength. Higher = more chrome / metallic highlights.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0.18 },

        { key: 'rainCount', label: 'Rain Drops',
            description: 'Number of drops scheduled evenly across the loop. Each drop kicks the water and sustains the ripple field. More drops = more agitated surface / more rings. Changing this recomputes the simulation.',
            type: 'slider', min: 1, max: 60, step: 1, default: 10 },
        { key: 'dropSpread', label: 'Drop Spread',
            description: '0 = all drops land at the centre (clean concentric rings expanding outward). 1 = drops scattered across the full disc (chaotic raindrop pattern). Changing this recomputes the simulation.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0 },
        { key: 'damping', label: 'Damping',
            description: 'How long the ripples persist after each drop. 0.99+ = waves travel far and bounce; 0.92 = waves die out quickly. Changing this recomputes the simulation.',
            type: 'slider', min: 0.85, max: 0.999, step: 0.001, default: 0.985 },
        { key: 'rainSeed', label: 'Drop Pattern',
            description: 'Integer seed for the rain-drop positions and timing. Try different values to get different ripple patterns. Changing this recomputes the simulation.',
            type: 'slider', min: 0, max: 99, step: 1, default: 0 },
        { key: 'gridSize', label: 'Simulation Grid',
            description: 'Resolution of the water sim grid (higher = finer ripples but slower to recompute). Changing this recomputes the simulation.',
            type: 'slider', min: 24, max: 128, step: 4, default: 80 },

        { key: 'centralGlow', label: 'Central Glow',
            description: 'Brightness of the central bright "eye" of the portal. 0 = no central highlight.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6 },
        { key: 'centralSize', label: 'Central Size',
            description: 'Radius of the central glow as a fraction of the disc radius.',
            type: 'slider', min: 0.05, max: 1.0, step: 0.02, default: 0.35 },

        { key: 'outerRing', label: 'Outer Rim',
            description: 'Brightness of an optional thin rim around the portal disc. 0 = no rim.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0.30 },
        { key: 'outerRingThickness', label: 'Outer Rim Thickness',
            description: 'Stroke thickness of the optional outer rim.',
            type: 'slider', min: 0.2, max: 6, step: 0.1, default: 1.5 },

        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderPortalFrame
});
