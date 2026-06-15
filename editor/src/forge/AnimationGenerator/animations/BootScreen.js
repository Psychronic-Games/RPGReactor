/**
 * Boot / Loading Screen — pseudo-text boot log scrolling upward with a
 * progress bar across the top growing toward 100%, plus a blinking cursor
 * at the bottom. Mimics a sci-fi system boot sequence.
 */
function renderBootScreenFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const W = 1, H = params.aspectRatio;
    const bgColor = params.bgColor;
    const borderColor = params.borderColor;
    const textColor = params.textColor;
    const accentColor = params.accentColor;
    const successColor = params.successColor;
    const opacity = params.opacity;
    const borderThick = Math.max(0.5, minDim * 0.003 * params.borderThickness);

    const proj = (x, y) => project(transform([x, y, 0]));
    const fillRect = (x0, y0, x1, y1, color, alpha) => {
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        const p0=proj(x0,y0), p1=proj(x1,y0), p2=proj(x1,y1), p3=proj(x0,y1);
        ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y);
        ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.closePath();
        ctx.fill();
    };
    const strokeRect = (x0, y0, x1, y1, color, alpha, lw) => {
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.beginPath();
        const p0=proj(x0,y0), p1=proj(x1,y0), p2=proj(x1,y1), p3=proj(x0,y1);
        ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y);
        ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.closePath();
        ctx.stroke();
    };
    const line = (x0, y0, x1, y1, color, alpha, lw) => {
        const p0 = proj(x0, y0), p1 = proj(x1, y1);
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
    };

    fillRect(-W, -H, W, H, bgColor, 1.0);
    strokeRect(-W, -H, W, H, borderColor, 1.0, borderThick * 1.4);
    const inset = 0.035;
    strokeRect(-W + inset, -H + inset, W - inset, H - inset, borderColor, 0.5, borderThick * 0.5);

    // Title bar — "BOOT SEQUENCE" pseudo-text.
    const titleY1 = H - inset * 1.3;
    const titleY0 = H - inset * 4.0;
    fillRect(-W + inset * 1.5, titleY0, W - inset * 1.5, titleY1, accentColor, 0.18);
    strokeRect(-W + inset * 1.5, titleY0, W - inset * 1.5, titleY1, accentColor, 0.7, borderThick * 0.4);
    const titleCharCount = Math.min(20, Math.max(8, Math.round(params.charsPerRow * 1.2)));
    const titleX0 = -W + 0.08;
    const titleX1 = W - 0.1;
    const titleCharSp = (titleX1 - titleX0) / titleCharCount;
    const titleY = (titleY0 + titleY1) / 2;
    for (let i = 0; i < titleCharCount; i++) {
        const seed = Math.sin(i * 13.7) * 0.5 + 0.5;
        const len = titleCharSp * (0.35 + 0.4 * seed);
        line(titleX0 + i * titleCharSp, titleY, titleX0 + i * titleCharSp + len, titleY,
            accentColor, 0.9, borderThick * 0.7);
    }

    // Progress bar.
    const pbY1 = titleY0 - inset * 0.6;
    const pbY0 = pbY1 - inset * 1.8;
    strokeRect(-W + inset * 1.5, pbY0, W - inset * 1.5, pbY1, textColor, 0.55, borderThick * 0.5);
    // Progress fills over the loop; sine-eased.
    const progress = Math.max(0, Math.min(1, params.progressMode === 0
        ? (1 - Math.cos(t * Math.PI)) / 2     // sine-eased loop 0→1→0
        : t                                     // monotonic 0→1
    ));
    const pbX0 = -W + inset * 1.5 + 0.008;
    const pbX1full = W - inset * 1.5 - 0.008;
    const pbFillX = pbX0 + progress * (pbX1full - pbX0);
    if (pbFillX > pbX0 + 0.003) {
        fillRect(pbX0, pbY0 + 0.005, pbFillX, pbY1 - 0.005, successColor, 0.85);
    }
    // Tick marks across the bar.
    const ticks = 10;
    for (let i = 1; i < ticks; i++) {
        const tx = pbX0 + (i / ticks) * (pbX1full - pbX0);
        line(tx, pbY0 + 0.003, tx, pbY1 - 0.003, textColor, 0.4, borderThick * 0.3);
    }

    // Scrolling boot-log text rows.
    const logY0 = -H + inset * 3.5;
    const logY1 = pbY0 - inset * 0.5;
    const logRows = Math.max(2, Math.round(params.logRows));
    const logCharsPerRow = Math.max(6, Math.round(params.charsPerRow));
    const logSpan = (W - inset * 1.5) - (-W + inset * 1.5);
    const charSp = logSpan / logCharsPerRow;
    const rowH = (logY1 - logY0) / logRows;
    const scrollSpeed = Math.max(1, Math.round(params.scrollSpeed));
    // Rows appear from bottom and scroll up.
    const scroll = (t * scrollSpeed) % 1;
    for (let r = 0; r < logRows; r++) {
        const ru = (r + scroll) % logRows;
        const ry = logY0 + ru * rowH + rowH * 0.4;
        // Per-row deterministic seed (resets when row recycles).
        const rowIndex = Math.floor((t * scrollSpeed) + r);
        const rowSeed = Math.sin(rowIndex * 91.7) * 0.5 + 0.5;
        // Some rows are "errors" (drawn in accent color).
        const errorRow = rowSeed > 0.87;
        const okRow = !errorRow && rowSeed > 0.6;
        const rowColor = errorRow ? accentColor : (okRow ? successColor : textColor);

        // Variable line length per row.
        const lineLen = Math.floor(logCharsPerRow * (0.5 + 0.5 * rowSeed));
        for (let c = 0; c < lineLen; c++) {
            const seed2 = Math.sin(c * 7.3 + rowIndex * 17.1) * 0.5 + 0.5;
            const len = charSp * (0.3 + 0.4 * seed2);
            const xL = -W + inset * 1.5 + 0.005 + c * charSp;
            // First few chars in each row are a "timestamp" — drawn in accent.
            const col = c < 4 ? accentColor : rowColor;
            line(xL, ry, xL + len, ry, col, 0.75, borderThick * 0.55);
        }
    }

    // Blinking cursor at bottom-left of log area.
    const blinkOn = Math.sin(t * Math.PI * 2 * 2) > 0;
    if (blinkOn) {
        const cuY = -H + inset * 1.8;
        const cuW = 0.04;
        fillRect(-W + inset * 1.5 + 0.005, cuY - 0.015, -W + inset * 1.5 + 0.005 + cuW, cuY + 0.015,
            successColor, 0.95);
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'bootscreen',
    name:         'Boot Screen',
    description:  'System boot sequence with progress bar, scrolling boot-log text, and a blinking cursor. Wide slider ranges yield everything from sparse loading screen to dense error spam.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'bgColor', label: 'Background', type: 'color', default: '#020208', randomColorRole: 'bg' },
        { key: 'borderColor', label: 'Border', type: 'color', default: '#4080a0', randomColorRole: 'fg' },
        { key: 'textColor', label: 'Log Text', type: 'color', default: '#80f0d0', randomColorRole: 'fg' },
        { key: 'accentColor', label: 'Timestamp / Error', type: 'color', default: '#ff7050', randomColorRole: 'fg' },
        { key: 'successColor', label: 'Progress / OK', type: 'color', default: '#80ff60', randomColorRole: 'fg' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },
        { key: 'aspectRatio', label: 'Aspect Ratio', type: 'slider', min: 0.3, max: 1.2, step: 0.02, default: 0.7 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'logRows', label: 'Log Rows',
            description: 'Number of visible log lines. 3 = sparse status; 16 = packed.',
            type: 'slider', min: 3, max: 18, step: 1, default: 8 },
        { key: 'charsPerRow', label: 'Chars Per Row',
            description: 'How dense each log line is.',
            type: 'slider', min: 6, max: 28, step: 1, default: 16 },
        { key: 'scrollSpeed', label: 'Scroll Speed',
            description: 'How fast log lines scroll up (integer per loop).',
            type: 'slider', min: 1, max: 8, step: 1, default: 3 },
        { key: 'progressMode', label: 'Progress Mode',
            description: '0 = sine-loop (fills then drains seamlessly); 1 = monotonic (0→100% then snaps back at the loop boundary).',
            type: 'slider', min: 0, max: 1, step: 1, default: 0 },
        { key: 'borderThickness', label: 'Line Thickness', type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderBootScreenFrame
});
