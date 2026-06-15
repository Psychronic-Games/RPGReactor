/**
 * Power Levels — a futuristic sci-fi console panel. Renders a bordered
 * screen with multiple animated sub-zones: bar graphs, an oscilloscope-style
 * waveform, scrolling pseudo-text rows, a status indicator row, and a
 * progress bar. Designed to be composited on an in-game monitor / hologram
 * / ship dashboard.
 *
 * 3D rotation through symbol3D — defaults are head-on, but you can tilt to
 * any angle to fake a perspective console view (e.g. a wall monitor seen
 * from below, or a slanted control panel). Cycles default to 0 so the
 * panel stays still by default; raise cycY/cycX to spin it like a
 * holographic display if desired.
 *
 * Sliders are intentionally wide-ranged so each one dramatically reshapes
 * the panel:
 *   - barCount      1 → 24 bars (single column → dense histogram)
 *   - barFreq       0 → 8 (static → frantic)
 *   - waveFreq      0 → 16 harmonics
 *   - waveAmplitude 0 → 1.0 (flatline → full-zone fill)
 *   - textRows      0 → 12 (no text → packed terminal)
 *   - charsPerRow   4 → 32 (chunky labels → dense data)
 *   - statusDots    0 → 16 (none → indicator-strip)
 *   - aspectRatio   0.3 → 1.2 (wide cinemascope → square monitor → tall portrait)
 *   - any color     5 fully independent colors for layering depth
 */
function renderPowerLevelsFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const aspectRatio = params.aspectRatio;
    const W = 1;
    const H = aspectRatio;

    const bgColor = params.bgColor;
    const borderColor = params.borderColor;
    const color1 = params.color1;
    const color2 = params.color2;
    const color3 = params.color3;
    const opacity = params.opacity;
    const borderThick = Math.max(0.5, minDim * 0.003 * params.borderThickness);

    // ─── Helpers ─────────────────────────────────────────────────────
    const proj2D = (x, y) => project(transform([x, y, 0]));
    const traceLocalPoly = (pts) => {
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            const p = proj2D(pts[k][0], pts[k][1]);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
    };
    const fillRect2D = (x0, y0, x1, y1, color, alpha) => {
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        traceLocalPoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
        ctx.fill();
    };
    const strokeRect2D = (x0, y0, x1, y1, color, alpha, lineWidth) => {
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'miter';
        traceLocalPoly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
        ctx.stroke();
    };
    const strokeLine2D = (x0, y0, x1, y1, color, alpha, lineWidth) => {
        const p0 = proj2D(x0, y0);
        const p1 = proj2D(x1, y1);
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'butt';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
    };
    const fillDot2D = (x, y, color, alpha, radiusPx) => {
        const p = proj2D(x, y);
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radiusPx, 0, Math.PI * 2);
        ctx.fill();
    };
    const strokePolyline2D = (pts2D, color, alpha, lineWidth) => {
        const projected = pts2D.map(([x, y]) => proj2D(x, y));
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let k = 0; k < projected.length; k++) {
            if (k === 0) ctx.moveTo(projected[k].x, projected[k].y);
            else ctx.lineTo(projected[k].x, projected[k].y);
        }
        ctx.stroke();
    };

    // ─── 1. Panel background ─────────────────────────────────────────
    fillRect2D(-W, -H, W, H, bgColor, 1.0);

    // ─── 2. Border frame ─────────────────────────────────────────────
    strokeRect2D(-W, -H, W, H, borderColor, 1.0, borderThick * 1.4);
    const inset = 0.035;
    strokeRect2D(-W + inset, -H + inset, W - inset, H - inset, borderColor, 0.55, borderThick * 0.6);

    // ─── 3. Title bar ────────────────────────────────────────────────
    const titleY1 = H - inset * 1.3;
    const titleY0 = H - inset * 4.5;
    fillRect2D(-W + inset * 1.5, titleY0, W - inset * 1.5, titleY1, color1, 0.18);
    strokeRect2D(-W + inset * 1.5, titleY0, W - inset * 1.5, titleY1, color1, 0.7, borderThick * 0.5);

    // Title pseudo-text (left side) — short dashes that pulse independently.
    const titleCharsCount = Math.min(20, Math.max(6, Math.round(params.charsPerRow)));
    const titleStartX = -W + 0.08;
    const titleEndX = W - 0.32;
    const titleCharSp = (titleEndX - titleStartX) / titleCharsCount;
    const titleY = (titleY0 + titleY1) / 2;
    const titleCharFreq = Math.max(1, Math.round(params.barFreq));
    for (let i = 0; i < titleCharsCount; i++) {
        const phase = i * 0.7;
        const pulse = Math.sin(t * Math.PI * 2 * titleCharFreq + phase) * 0.5 + 0.5;
        const dashLen = titleCharSp * (0.35 + 0.35 * pulse);
        const xL = titleStartX + i * titleCharSp;
        const col = (i % 5 === 0) ? color3 : (i % 3 === 0 ? color2 : color1);
        strokeLine2D(xL, titleY, xL + dashLen, titleY, col, 0.92, borderThick * 0.7);
    }
    // Indicator dots (right of title): 3 dots blinking at different rates.
    for (let i = 0; i < 3; i++) {
        const dotX = W - 0.22 + i * 0.058;
        const blinkFreq = Math.max(1, Math.round((i + 1) * params.statusBlinkSpeed));
        const blink = Math.sin(t * Math.PI * 2 * blinkFreq + i * 1.7) * 0.5 + 0.5;
        const col = [color1, color2, color3][i];
        fillDot2D(dotX, titleY, col, 0.4 + 0.6 * blink, borderThick * 1.3);
    }

    // ─── 4. Layout: split content area into bar / wave / text zones ──
    const contentY0 = -H + inset * 4;
    const contentY1 = titleY0 - inset * 0.8;
    const contentX0 = -W + inset * 1.5;
    const contentX1 = W - inset * 1.5;
    const contentMidX = -0.05; // bars on left, wave + text on right

    // ─── 5. Bar graph zone ───────────────────────────────────────────
    const barZoneX0 = contentX0;
    const barZoneX1 = contentMidX;
    const barZoneY0 = contentY0;
    const barZoneY1 = contentY1;
    strokeRect2D(barZoneX0, barZoneY0, barZoneX1, barZoneY1, color1, 0.45, borderThick * 0.5);

    const barCount = Math.max(1, Math.round(params.barCount));
    const barFreq = Math.max(0, Math.round(params.barFreq));
    const barSpan = barZoneX1 - barZoneX0;
    const barTotalW = barSpan / barCount;
    const barGap = Math.min(barTotalW * 0.22, 0.012);
    const barWidth = Math.max(0.002, barTotalW - barGap);
    const barMargin = 0.02;
    const barZoneH = barZoneY1 - barZoneY0;

    for (let i = 0; i < barCount; i++) {
        const phase = i * 0.83;
        // Each bar's frequency: integer multiple for loop safety, varies by index.
        const freq = Math.max(1, barFreq + (i % 4));
        const level = barFreq === 0
            ? (Math.sin(i * 5.13) * 0.5 + 0.5) * 0.85 + 0.1
            : (Math.sin(t * Math.PI * 2 * freq + phase) * 0.5 + 0.5) * 0.85 + 0.1;
        const x0 = barZoneX0 + i * barTotalW + barGap / 2;
        const x1 = x0 + barWidth;
        const y0 = barZoneY0 + barMargin;
        const y1 = barZoneY0 + barMargin + level * (barZoneH - 2 * barMargin);
        const col = level > 0.78 ? color3 : (level > 0.5 ? color2 : color1);
        fillRect2D(x0, y0, x1, y1, col, 0.85);
        strokeLine2D(x0, y1, x1, y1, col, 1.0, borderThick * 0.7);
    }

    // ─── 6. Oscilloscope / line graph zone (upper right) ─────────────
    const lgX0 = contentMidX + 0.02;
    const lgX1 = contentX1;
    const lgY0 = (contentY0 + contentY1) * 0.5 + 0.01;
    const lgY1 = contentY1;
    strokeRect2D(lgX0, lgY0, lgX1, lgY1, color1, 0.45, borderThick * 0.5);

    // Horizontal grid lines
    for (let g = 1; g < 4; g++) {
        const gy = lgY0 + g * (lgY1 - lgY0) / 4;
        strokeLine2D(lgX0, gy, lgX1, gy, color1, 0.18, borderThick * 0.3);
    }
    // Vertical grid lines
    for (let g = 1; g < 6; g++) {
        const gx = lgX0 + g * (lgX1 - lgX0) / 6;
        strokeLine2D(gx, lgY0, gx, lgY1, color1, 0.18, borderThick * 0.3);
    }

    // Waveform: sum of harmonics. All freqs integer = loop-safe.
    const wfN = 96;
    const lgCenterY = (lgY0 + lgY1) / 2;
    const lgAmpl = (lgY1 - lgY0) * 0.4 * params.waveAmplitude;
    const waveFreq = Math.max(0, Math.round(params.waveFreq));
    const wfPts = [];
    for (let k = 0; k <= wfN; k++) {
        const u = k / wfN;
        const x = lgX0 + u * (lgX1 - lgX0);
        const a1 = u * waveFreq * Math.PI * 2 + t * Math.PI * 2 * 2;
        const a2 = u * (waveFreq + 2) * Math.PI * 2 - t * Math.PI * 2 * 3;
        const a3 = u * (waveFreq * 2 + 1) * Math.PI * 2 + t * Math.PI * 2;
        const v = 0.55 * Math.sin(a1) + 0.30 * Math.sin(a2) + 0.15 * Math.sin(a3);
        wfPts.push([x, lgCenterY + v * lgAmpl]);
    }
    // Glow pass + main stroke.
    if (params.glow > 0.01) {
        strokePolyline2D(wfPts, color2, params.glow * 0.6, borderThick * (1.5 + params.glow * 3));
    }
    strokePolyline2D(wfPts, color2, 1.0, borderThick * 0.9);

    // ─── 7. Text rows zone (lower right) ─────────────────────────────
    const trX0 = contentMidX + 0.02;
    const trX1 = contentX1;
    const trY0 = contentY0;
    const trY1 = lgY0 - 0.01;
    strokeRect2D(trX0, trY0, trX1, trY1, color1, 0.45, borderThick * 0.5);

    const textRows = Math.max(0, Math.round(params.textRows));
    const charsPerRow = Math.max(4, Math.round(params.charsPerRow));
    const textScroll = Math.max(0, Math.round(params.textScrollSpeed));
    if (textRows > 0) {
        const rowZoneH = trY1 - trY0;
        const rowStep = rowZoneH / (textRows + 1);
        const rowSpan = trX1 - trX0 - 0.04;
        const charSp = rowSpan / charsPerRow;

        for (let r = 0; r < textRows; r++) {
            const ry = trY1 - (r + 0.7) * rowStep;
            // Per-row integer scroll freq for loop safety.
            const rowFreq = textScroll === 0 ? 0 : Math.max(1, textScroll + (r % 3));
            const scrollOffset = (t * rowFreq) % 1;
            for (let c = 0; c < charsPerRow; c++) {
                // Wrap x so text appears to scroll left.
                const u = ((c / charsPerRow) - scrollOffset + 1) % 1;
                const xL = trX0 + 0.02 + u * rowSpan;
                // Per-char visual seed (deterministic).
                const seed = Math.sin((c * 17.3 + r * 31.7)) * 0.5 + 0.5;
                const len = charSp * (0.28 + 0.42 * seed);
                const col = (seed > 0.88) ? color3 : (seed > 0.65 ? color2 : color1);
                strokeLine2D(xL, ry, xL + len, ry, col, 0.75, borderThick * 0.55);
            }
        }
    }

    // ─── 8. Status bar at bottom ─────────────────────────────────────
    const sbY0 = -H + inset * 1.3;
    const sbY1 = -H + inset * 3.5;
    fillRect2D(-W + inset * 1.5, sbY0, W - inset * 1.5, sbY1, color1, 0.12);
    strokeRect2D(-W + inset * 1.5, sbY0, W - inset * 1.5, sbY1, color1, 0.55, borderThick * 0.5);

    const statusDots = Math.max(0, Math.round(params.statusDots));
    if (statusDots > 0) {
        const sbStartX = -W + 0.08;
        const sbDotsEndX = -0.05;
        const sbSpan = sbDotsEndX - sbStartX;
        const sbSpacing = sbSpan / Math.max(1, statusDots);
        const sbCenterY = (sbY0 + sbY1) / 2;
        for (let i = 0; i < statusDots; i++) {
            const blinkFreq = Math.max(1, Math.round((i + 1) * params.statusBlinkSpeed));
            const blink = Math.sin(t * Math.PI * 2 * blinkFreq + i * 0.73) * 0.5 + 0.5;
            const colChoice = (i % 4 === 0) ? color3 : (i % 2 === 0 ? color2 : color1);
            const dotX = sbStartX + (i + 0.5) * sbSpacing;
            fillDot2D(dotX, sbCenterY, colChoice, 0.3 + 0.7 * blink, borderThick * 1.0);
        }
    }

    // Progress bar in right portion of status bar.
    const pbX0 = 0.0;
    const pbX1 = W - inset * 1.8;
    const pbY0 = sbY0 + 0.012;
    const pbY1 = sbY1 - 0.012;
    strokeRect2D(pbX0, pbY0, pbX1, pbY1, color1, 0.6, borderThick * 0.4);
    const progress = (Math.sin(t * Math.PI * 2 - Math.PI / 2) * 0.5 + 0.5);
    fillRect2D(
        pbX0 + 0.005, pbY0 + 0.005,
        pbX0 + 0.005 + progress * (pbX1 - pbX0 - 0.01),
        pbY1 - 0.005,
        color2, 0.92
    );
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'powerlevels',
    name:         'Power Levels',
    description:  'Animated sci-fi console panel with bar graphs, oscilloscope, scrolling text rows, blinking status indicators, and progress bar. Wide slider ranges produce everything from minimal terminal to dense data dashboard.',
    defaultBlend: 'source-over',
    // Randomize uses the standard Interface skip-list (rotation + pulse +
    // opacity) so the panel stays head-on, opaque, non-throbbing.
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        // 5 colors for layered information density. randomColorRole drives
        // the coordinated palette: bg gets a dark color, fg hues spread evenly.
        { key: 'bgColor', label: 'Background',
            description: 'Panel background color. Usually very dark for sci-fi LCD look.',
            type: 'color', default: '#060a14', randomColorRole: 'bg' },
        { key: 'borderColor', label: 'Border',
            description: 'Outer frame and inner accent line color.',
            type: 'color', default: '#40d0ff', randomColorRole: 'fg' },
        { key: 'color1', label: 'Primary Data',
            description: 'Main data color: bar baseline, low-level indicators, primary text.',
            type: 'color', default: '#50ffd0', randomColorRole: 'fg' },
        { key: 'color2', label: 'Secondary Data',
            description: 'Mid-level indicators, waveform, progress bar, accent text.',
            type: 'color', default: '#ffc040', randomColorRole: 'fg' },
        { key: 'color3', label: 'Warning / Alert',
            description: 'High-level / warning color: peaked bars, alert text, alert dots.',
            type: 'color', default: '#ff5060', randomColorRole: 'fg' },

        { key: 'size', label: 'Size',
            description: 'Overall panel size (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },
        { key: 'aspectRatio', label: 'Aspect Ratio',
            description: 'Panel height / width. 0.3 = ultra-wide; 0.6 = monitor; 1.0 = square; 1.2 = portrait.',
            type: 'slider', min: 0.3, max: 1.2, step: 0.02, default: 0.6 },

        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'barCount', label: 'Bar Count',
            description: 'Number of bars in the bar graph. 1 = single column, 24 = dense histogram.',
            type: 'slider', min: 1, max: 24, step: 1, default: 8 },
        { key: 'barFreq', label: 'Bar Animation Speed',
            description: 'How fast bars oscillate (integer cycles per loop). 0 = static deterministic heights.',
            type: 'slider', min: 0, max: 8, step: 1, default: 2 },

        { key: 'waveFreq', label: 'Wave Frequency',
            description: 'Base spatial frequency of the oscilloscope waveform. 0 = barely-moving baseline.',
            type: 'slider', min: 0, max: 16, step: 1, default: 3 },
        { key: 'waveAmplitude', label: 'Wave Amplitude',
            description: 'Vertical extent of the waveform within its zone. 0 = flatline.',
            type: 'slider', min: 0, max: 1.0, step: 0.05, default: 0.75 },

        { key: 'textRows', label: 'Text Rows',
            description: 'Number of pseudo-text rows in the data area. 0 = no text rows.',
            type: 'slider', min: 0, max: 12, step: 1, default: 5 },
        { key: 'charsPerRow', label: 'Chars Per Row',
            description: 'How many dash-characters per text row (also drives the title row).',
            type: 'slider', min: 4, max: 32, step: 1, default: 14 },
        { key: 'textScrollSpeed', label: 'Text Scroll Speed',
            description: 'How fast text rows scroll left per loop (integer). 0 = static.',
            type: 'slider', min: 0, max: 6, step: 1, default: 2 },

        { key: 'statusDots', label: 'Status Dots',
            description: 'Number of blinking indicator dots in the bottom status bar.',
            type: 'slider', min: 0, max: 16, step: 1, default: 7 },
        { key: 'statusBlinkSpeed', label: 'Status Blink Speed',
            description: 'How fast the status dots and title indicators blink (integer cycles per loop).',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },

        { key: 'borderThickness', label: 'Line Thickness',
            description: 'Base stroke thickness multiplier for borders, grids, and text dashes.',
            type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.2 },
        { key: 'glow', label: 'Glow',
            description: 'Soft halo on the waveform line. 0 = sharp; 1+ = thick glow.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.6 },

        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderPowerLevelsFrame
});
