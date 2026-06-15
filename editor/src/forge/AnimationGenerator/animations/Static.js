/**
 * Static — analog TV snow / dead-channel noise. A blocky pixel-grid of
 * random brightness values redrawn every loop bucket so the noise looks
 * alive without breaking the seamless loop. Useful for "computer
 * offline", broken-monitor, glitch, or scene-cut effects.
 *
 * Rendering strategy:
 *   1. Generate cols × rows pixels of noise into a small offscreen
 *      ImageData (1 pixel per noise block) — much faster than fillRect
 *      per block.
 *   2. drawImage that offscreen canvas onto the main canvas at the
 *      target rectangle size, with image smoothing OFF so each noise
 *      pixel stays crisp and chunky.
 *   3. Pseudo-3D tilt is applied via applySymbol2DTransform so the
 *      "TV" can tilt like a piece of furniture without per-block 3D
 *      projection cost.
 *
 * Loop-safe: the noise field is indexed by a discrete time bucket
 * (Math.floor(t * speed)), so the same animation frame in successive
 * loops produces the same snapshot.
 */
function renderStaticFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const size = params.size;
    const aspectRatio = params.aspectRatio;
    const panelW = minDim * size;
    const panelH = panelW * aspectRatio;
    const x0 = cx - panelW / 2;
    const y0 = cy - panelH / 2;

    const opacity = params.opacity;

    // Grain pixel size in screen pixels. grainSize is a 0..1 fraction
    // of "block coarseness"; smaller = finer noise. Round to at least 1
    // pixel so the grid never collapses.
    const grainPx = Math.max(1, Math.round(params.grainSize * minDim * 0.018));
    const cols = Math.max(2, Math.ceil(panelW / grainPx));
    const rows = Math.max(2, Math.ceil(panelH / grainPx));

    const speed = Math.max(1, Math.round(params.speed));
    const bucket = Math.floor(t * speed);

    const contrast = Math.max(0, Math.min(1, params.contrast));
    const tintStrength = Math.max(0, Math.min(1, params.tintStrength));

    // Parse fg/bg/tint hex colors → RGB triples (no alpha; pixels are
    // composed by hand and then opacity is applied via globalAlpha).
    const parseHex = (hex) => {
        const m = (hex || '#000000').match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})/i);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
    };
    const [r1, g1, b1] = parseHex(params.color1);
    const [r2, g2, b2] = parseHex(params.color2);
    const [rt, gt, bt] = parseHex(params.tintColor);

    // Cache an offscreen canvas across frames (cols/rows may differ but
    // canvas.width = n is fast). Stored on window so reload doesn't
    // accumulate canvases.
    let off = window.__STATIC_OFF_CANVAS;
    if (!off) {
        off = document.createElement('canvas');
        window.__STATIC_OFF_CANVAS = off;
    }
    off.width = cols;
    off.height = rows;
    const offCtx = off.getContext('2d');
    const imgData = offCtx.createImageData(cols, rows);
    const data = imgData.data;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            // Deterministic per-block hash → 0..1 random.
            const seed = Math.sin(col * 12.9898 + row * 78.233 + bucket * 31.7) * 43758.5453;
            const rnd = seed - Math.floor(seed);
            // contrast=1 → full 0..1 spread; contrast=0 → flat mid-grey.
            const brightness = (1 - contrast) * 0.5 + contrast * rnd;
            const r = (r2 + brightness * (r1 - r2)) | 0;
            const g = (g2 + brightness * (g1 - g2)) | 0;
            const b = (b2 + brightness * (b1 - b2)) | 0;
            const fr = (r + tintStrength * (rt - r)) | 0;
            const fg = (g + tintStrength * (gt - g)) | 0;
            const fb = (b + tintStrength * (bt - b)) | 0;
            const idx = (row * cols + col) * 4;
            data[idx]     = fr;
            data[idx + 1] = fg;
            data[idx + 2] = fb;
            data[idx + 3] = 255;
        }
    }
    offCtx.putImageData(imgData, 0, 0);

    // Apply pseudo-3D tilt + cycle rotation around the panel centre.
    applySymbol2DTransform(ctx, params, t, cx, cy);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, x0, y0, panelW, panelH);

    // CRT-style scanlines overlay — horizontal dark bands across the
    // panel. Strength 0 = none.
    if (params.scanlineStrength > 0.01) {
        const scanlineCount = Math.max(2, Math.round(params.scanlineCount));
        const scanH = panelH / scanlineCount;
        ctx.fillStyle = hexWithAlpha('#000000', opacity * params.scanlineStrength);
        for (let i = 0; i < scanlineCount; i++) {
            const sy = y0 + i * scanH;
            ctx.fillRect(x0, sy, panelW, Math.max(1, scanH * 0.4));
        }
    }

    // Optional border around the panel.
    if (params.borderThickness > 0.001) {
        const lw = Math.max(0.5, params.borderThickness * minDim * 0.005);
        ctx.strokeStyle = hexWithAlpha(params.borderColor, opacity);
        ctx.lineWidth = lw;
        ctx.strokeRect(x0, y0, panelW, panelH);
    }
    ctx.restore();

    // Close the canvas transform opened by applySymbol2DTransform.
    ctx.restore();
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'static',
    name:         'Static',
    description:  'Analog-TV snow / dead-channel noise. Configurable grain size, change speed, contrast, optional color tint, CRT scanlines, and border. Drop it over an LCARS or any panel for "system offline" / glitch effects.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'color1', label: 'Bright Color',
            description: 'Color used for bright noise pixels (white = canonical TV snow).',
            type: 'color', default: '#ffffff', randomColorRole: 'fg' },
        { key: 'color2', label: 'Dark Color',
            description: 'Color used for dark noise pixels (black = canonical TV snow).',
            type: 'color', default: '#000000', randomColorRole: 'bg' },
        { key: 'tintColor', label: 'Tint Color',
            description: 'Optional color blended over the grayscale noise. Use a green tint for night-vision look, blue for sci-fi, amber for dying CRT.',
            type: 'color', default: '#a0c0ff', randomColorRole: 'fg' },
        { key: 'tintStrength', label: 'Tint Strength',
            description: 'How strongly the tint colour blends over the noise. 0 = pure grayscale; 1 = fully tinted.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0 },

        { key: 'size', label: 'Size',
            description: 'Overall panel width as a fraction of the smaller frame dimension.',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.95 },
        { key: 'aspectRatio', label: 'Aspect Ratio',
            description: 'Panel height divided by panel width. 0.5 = wide cinemascope, 0.75 = monitor, 1.0 = square, 1.3 = portrait.',
            type: 'slider', min: 0.3, max: 1.4, step: 0.02, default: 0.75 },

        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'grainSize', label: 'Grain Size',
            description: 'Coarseness of each noise pixel. Lower = fine grain (modern static); higher = chunky retro CRT.',
            type: 'slider', min: 0.05, max: 4, step: 0.05, default: 0.5 },
        { key: 'speed', label: 'Change Speed',
            description: 'How many distinct noise snapshots per loop. Set this to your frame count (typically 30) for a unique snapshot every frame — the canonical fast static look. Lower values hold each snapshot for multiple frames.',
            type: 'slider', min: 1, max: 60, step: 1, default: 30 },
        { key: 'contrast', label: 'Contrast',
            description: 'Spread of brightness between dark and bright pixels. 0 = flat mid-grey; 1 = full black-to-white range.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 1 },

        { key: 'scanlineStrength', label: 'Scanline Strength',
            description: 'Opacity of horizontal CRT scanlines overlaid on the noise. 0 = no scanlines.',
            type: 'slider', min: 0, max: 1, step: 0.02, default: 0 },
        { key: 'scanlineCount', label: 'Scanline Count',
            description: 'Number of horizontal scanlines across the panel.',
            type: 'slider', min: 2, max: 80, step: 1, default: 30 },

        { key: 'borderThickness', label: 'Border Thickness',
            description: 'Width of the optional rectangular border around the panel. 0 = no border.',
            type: 'slider', min: 0, max: 4, step: 0.1, default: 0 },
        { key: 'borderColor', label: 'Border Color',
            description: 'Color of the optional border.',
            type: 'color', default: '#404040' },

        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderStaticFrame
});
