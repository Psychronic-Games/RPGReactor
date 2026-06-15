/**
 * LCARS — Star Trek TNG-era Library Computer Access/Retrieval System
 * console panel. Captures the iconic LCARS look procedurally: oversized
 * rounded "elbows" framing the top-left and bottom-left of the display,
 * a vertical spine of pill-shaped status buttons, a horizontal bar of
 * coloured segments along the top, a stack of pill-shaped data readouts
 * down the right, and a dark central display populated with scrolling
 * pseudo-text and a blinking title.
 *
 * Layout (local space, 0..W × 0..H):
 *   ┌──────────────────────────────────────────────┐
 *   │ ╭─[top elbow]──────── top bar segments ─[ID]─┤
 *   │ │                                            │
 *   │ │   ┌────────────────────────────────┐  P1   │
 *   │ │   │                                │  P2   │
 *   │ │   │       central display          │  P3   │
 *   │ │   │       (scrolling text)         │  P4   │
 *   │ │   │                                │  P5   │
 *   │ │   └────────────────────────────────┘       │
 *   │ │                                            │
 *   │ ╰─[bot elbow]────────── bot bar segments ────┤
 *   └──────────────────────────────────────────────┘
 *
 * The elbow is an L-shape with a large outer corner radius and a small
 * inner corner radius — the LCARS signature. Drawn as a single closed
 * path, then projected through the symbol3D pipeline so the panel can
 * be tilted into perspective.
 *
 * Color palette defaults to the classic LCARS hues:
 *   orange #ff9900, peach #ff9966, burgundy #cc6666, lavender #9999ff,
 *   purple #cc99cc, cream #ffcc99, off-white #f8fbdb on black.
 */
function renderLCARSFrame(ctx, w, h, frameIdx, totalFrames, params) {
    ctx.clearRect(0, 0, w, h);
    const t = frameIdx / totalFrames;
    const cx = w * (params.centerX !== undefined ? params.centerX : 0.5);
    const cy = h * (params.centerY !== undefined ? params.centerY : 0.5);
    const minDim = Math.min(w, h);

    const { transform, project } = makeSymbol3DTransform(
        params, t, cx, cy, minDim * 0.5 * params.size
    );

    const aspectRatio = params.aspectRatio;
    const W = 1.0;
    const H = aspectRatio;

    const bgColor = params.bgColor;
    const cElbow = params.elbowColor;
    const cBar = params.barColor;
    const cAccent1 = params.accent1;
    const cAccent2 = params.accent2;
    const cAccent3 = params.accent3;
    const cText = params.textColor;
    const opacity = params.opacity;

    // ─── 3D projection helpers ───────────────────────────────────────
    // Multiply by 2 so the local rectangle (0..W × 0..H) maps to math
    // space (-1..1 × -aspectRatio..aspectRatio). That way `size` 1.0
    // means the panel fills the whole frame, not just half.
    const proj2D = (lx, ly) => project(transform([(lx - W / 2) * 2, (H / 2 - ly) * 2, 0]));

    const fillPath = (color, alpha, paint) => {
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        paint();
        ctx.fill();
    };
    const strokePath = (color, alpha, lineW, paint) => {
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lineW;
        paint();
        ctx.stroke();
    };

    // Polyline from a list of [x, y] local points.
    const tracePoly = (pts, closed) => {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const p = proj2D(pts[i][0], pts[i][1]);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        if (closed) ctx.closePath();
    };

    // Rounded rectangle as a polygon. corners=[tl,tr,br,bl] each is a
    // radius. Quarter-arcs are sampled with ARC_SEGS segments.
    const ARC_SEGS = 14;
    const traceRoundRect = (x0, y0, x1, y1, corners) => {
        const [rTL, rTR, rBR, rBL] = corners;
        const pts = [];
        // top edge: TL corner → TR corner
        if (rTL > 0) {
            for (let i = 0; i <= ARC_SEGS; i++) {
                const a = Math.PI + (i / ARC_SEGS) * (Math.PI / 2);
                pts.push([x0 + rTL + rTL * Math.cos(a), y0 + rTL + rTL * Math.sin(a)]);
            }
        } else pts.push([x0, y0]);
        if (rTR > 0) {
            for (let i = 0; i <= ARC_SEGS; i++) {
                const a = -Math.PI / 2 + (i / ARC_SEGS) * (Math.PI / 2);
                pts.push([x1 - rTR + rTR * Math.cos(a), y0 + rTR + rTR * Math.sin(a)]);
            }
        } else pts.push([x1, y0]);
        if (rBR > 0) {
            for (let i = 0; i <= ARC_SEGS; i++) {
                const a = 0 + (i / ARC_SEGS) * (Math.PI / 2);
                pts.push([x1 - rBR + rBR * Math.cos(a), y1 - rBR + rBR * Math.sin(a)]);
            }
        } else pts.push([x1, y1]);
        if (rBL > 0) {
            for (let i = 0; i <= ARC_SEGS; i++) {
                const a = Math.PI / 2 + (i / ARC_SEGS) * (Math.PI / 2);
                pts.push([x0 + rBL + rBL * Math.cos(a), y1 - rBL + rBL * Math.sin(a)]);
            }
        } else pts.push([x0, y1]);
        tracePoly(pts, true);
    };

    // LCARS L-elbow: outer rounded corner (large radius) at one corner,
    // inner concave rounded corner (small radius) on the opposite side
    // of the inner notch. corner = 'TL' | 'BL' | 'TR' | 'BR'.
    //
    //  TL elbow: outer corner top-left, notch cut from bottom-right.
    //  Spine (vertical bar) on left + arm (horizontal bar) on top.
    const traceElbow = (x0, y0, x1, y1, spineW, armH, rOuter, rInner, which) => {
        const pts = [];
        if (which === 'TL') {
            // Outer arc top-left
            for (let i = 0; i <= ARC_SEGS; i++) {
                const a = Math.PI + (i / ARC_SEGS) * (Math.PI / 2);
                pts.push([x0 + rOuter + rOuter * Math.cos(a), y0 + rOuter + rOuter * Math.sin(a)]);
            }
            pts.push([x1, y0]);
            pts.push([x1, y0 + armH]);
            // Inner concave arc (CW from outer perspective)
            for (let i = 0; i <= ARC_SEGS; i++) {
                const a = -Math.PI / 2 - (i / ARC_SEGS) * (Math.PI / 2);
                pts.push([x0 + spineW + rInner + rInner * Math.cos(a),
                          y0 + armH + rInner + rInner * Math.sin(a)]);
            }
            pts.push([x0 + spineW, y1]);
            pts.push([x0, y1]);
        } else if (which === 'BL') {
            pts.push([x0, y0]);
            pts.push([x0 + spineW, y0]);
            // Inner concave arc from top of spine to left of arm. The
            // arc traverses the LOWER-LEFT quadrant of the inner circle,
            // so angle goes from π down to π/2 (decreasing).
            for (let i = 0; i <= ARC_SEGS; i++) {
                const a = Math.PI - (i / ARC_SEGS) * (Math.PI / 2);
                pts.push([x0 + spineW + rInner + rInner * Math.cos(a),
                          y1 - armH - rInner + rInner * Math.sin(a)]);
            }
            pts.push([x1, y1 - armH]);
            pts.push([x1, y1]);
            // Outer arc bottom-left
            for (let i = 0; i <= ARC_SEGS; i++) {
                const a = Math.PI / 2 + (i / ARC_SEGS) * (Math.PI / 2);
                pts.push([x0 + rOuter + rOuter * Math.cos(a), y1 - rOuter + rOuter * Math.sin(a)]);
            }
        }
        tracePoly(pts, true);
    };

    // ─── Background ──────────────────────────────────────────────────
    fillPath(bgColor, 1.0, () => traceRoundRect(0, 0, W, H, [0.005, 0.005, 0.005, 0.005]));

    // ─── Layout constants ─────────────────────────────────────────────
    // Margin around the whole panel, then the elbow region on the left
    // (spineW wide) + arm region across the top/bottom (armH tall). The
    // central display fills everything else, edge-to-edge horizontally.
    const margin = 0.025;
    const spineW = 0.07 * W;
    const armH   = 0.085 * H;
    const elbowCurlY = 0.13 * H;   // how far below the arm the elbow corner curls
    const elbowTopY1 = margin + armH + elbowCurlY;
    const elbowBotY0 = H - margin - armH - elbowCurlY;
    const rOuter = Math.min(elbowCurlY, spineW + 0.04) * 1.4;
    const rInner = Math.min(elbowCurlY * 0.45, spineW * 0.7);
    const gap    = 0.008;

    // ─── Top elbow ────────────────────────────────────────────────────
    fillPath(cElbow, 1.0, () =>
        traceElbow(margin, margin, W - margin, elbowTopY1,
                   spineW, armH, rOuter, rInner, 'TL'));

    // ─── Bottom elbow ─────────────────────────────────────────────────
    fillPath(cAccent1, 1.0, () =>
        traceElbow(margin, elbowBotY0, W - margin, H - margin,
                   spineW, armH, rOuter, rInner, 'BL'));

    // ─── Left spine: stack of pill buttons between the elbows ────────
    {
        const spineX0 = margin;
        const spineX1 = margin + spineW;
        const spineY0 = elbowTopY1 + gap;
        const spineY1 = elbowBotY0 - gap;
        const palette = [cBar, cAccent2, cElbow, cAccent3, cAccent1, cBar, cAccent2];
        const slots = Math.max(2, Math.min(palette.length, Math.round(params.spineButtons)));
        const slotH = (spineY1 - spineY0 - gap * (slots - 1)) / slots;
        for (let i = 0; i < slots; i++) {
            const y0 = spineY0 + i * (slotH + gap);
            const y1 = y0 + slotH;
            fillPath(palette[i % palette.length], 1.0,
                () => traceRoundRect(spineX0, y0, spineX1, y1, [0.005, 0.005, 0.005, 0.005]));
        }
    }

    // ─── Top & bottom bars: solid color extending from the elbows ────
    // (Segment pills moved INSIDE the display.)
    const barX0 = margin + spineW + rInner + gap;
    const barX1 = W - margin - 0.02;
    fillPath(cElbow, 1.0,
        () => traceRoundRect(barX0, margin, barX1, margin + armH * 0.55,
            [0.005, 0.01, 0.01, 0.005]));
    fillPath(cAccent1, 1.0,
        () => traceRoundRect(barX0, H - margin - armH * 0.55, barX1, H - margin,
            [0.01, 0.005, 0.005, 0.01]));

    // ─── Central display panel ───────────────────────────────────────
    const padInner = 0.018;
    const dispX0 = margin + spineW + rInner + padInner;
    const dispX1 = W - margin;
    const dispY0 = margin + armH + padInner;
    const dispY1 = H - margin - armH - padInner;

    // The display is just the background — no extra fill needed since
    // the panel background already shows through.

    // ─── Floating accent pills INSIDE the display (top portion) ─────
    // These used to live in a right-hand column outside the display.
    // Reading the canonical LCARS, they belong on the display itself
    // as floating data readouts.
    const pillCount = Math.max(2, Math.min(8, Math.round(params.rightButtons)));
    const pillCols = Math.min(2, pillCount);
    const pillRows = Math.ceil(pillCount / pillCols);
    const pillsW = (dispX1 - dispX0) * 0.45;
    const pillsX0 = dispX1 - pillsW;
    const pillsX1 = dispX1;
    const pillsY0 = dispY0;
    const pillsY1 = dispY0 + 0.30 * (dispY1 - dispY0);
    const pillPalette = [cAccent2, cBar, cElbow, cAccent1, cBar, cAccent2, cElbow, cBar];
    {
        const pillGap = 0.008;
        const pillW = (pillsW - pillGap * (pillCols - 1)) / pillCols;
        const pillH = (pillsY1 - pillsY0 - pillGap * (pillRows - 1)) / pillRows;
        const blinkCycles = Math.max(1, Math.round(params.blinkSpeed));
        for (let i = 0; i < pillCount; i++) {
            const col = i % pillCols;
            const row = Math.floor(i / pillCols);
            const x0 = pillsX0 + col * (pillW + pillGap);
            const x1 = x0 + pillW;
            const y0 = pillsY0 + row * (pillH + pillGap);
            const y1 = y0 + pillH;
            const color = pillPalette[i % pillPalette.length];
            const phase = ((t * blinkCycles + i * 0.31) % 1 + 1) % 1;
            const bright = 0.78 + 0.22 * Math.max(0, Math.sin(phase * Math.PI * 2));
            const r = Math.min(pillH, pillW) * 0.40;
            fillPath(color, bright,
                () => traceRoundRect(x0, y0, x1, y1, [r, r, r, r]));
            ctx.save();
            const codeNum = 1000 + ((i * 1117 + Math.floor(t * 60)) % 9000);
            const code = `${i}-${codeNum}`;
            const pTopLeft = proj2D(x0, y0);
            const pBotRight = proj2D(x1, y1);
            const sz = Math.max(6, (pBotRight.y - pTopLeft.y) * 0.40);
            ctx.font = `${sz}px monospace`;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = hexWithAlpha('#101010', opacity * 0.9);
            const labelP = proj2D(x1 - 0.008, (y0 + y1) / 2);
            ctx.fillText(code, labelP.x, labelP.y);
            ctx.restore();
        }
    }

    // ─── DATA NODE title — sits in the empty black space to the LEFT
    // of the floating pills (same vertical band as the pills, not below
    // them). Width is clamped to the open space so the text can never
    // run into the pill grid no matter the font size.
    {
        ctx.save();
        const titleTop = proj2D(dispX0, pillsY0);
        const titleBot = proj2D(dispX0, pillsY1);
        const titleSz = Math.max(8, (titleBot.y - titleTop.y) * 0.32);
        ctx.font = `bold ${titleSz}px monospace`;
        ctx.fillStyle = hexWithAlpha(cElbow, opacity);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const tp = proj2D(dispX0, (pillsY0 + pillsY1) / 2);
        // Available horizontal space: from dispX0 to where the pills
        // start, minus a small visual gap. Converted to screen pixels.
        const pillsLeftEdge = proj2D(pillsX0 - 0.012, (pillsY0 + pillsY1) / 2);
        const maxWidthPx = Math.max(20, pillsLeftEdge.x - tp.x);
        ctx.fillText(
            'DATA NODE ' + (100 + Math.floor((t * 100) % 900)),
            tp.x, tp.y, maxWidthPx
        );
        ctx.restore();
    }

    // ─── Segment pill row BELOW the floating pills + title ───────────
    const segRowY0 = pillsY1 + 0.020;
    const segRowY1 = segRowY0 + 0.045 * H;
    {
        const segPalette = [cBar, cAccent2, cBar, cAccent3, cBar, cAccent2];
        const segCount = Math.max(2, Math.round(params.topSegments));
        const segGap = 0.006;
        const segX0 = dispX0;
        const segX1 = dispX1;
        const segW = (segX1 - segX0 - segGap * (segCount - 1)) / segCount;
        const r = (segRowY1 - segRowY0) * 0.45;
        for (let i = 0; i < segCount; i++) {
            const x0 = segX0 + i * (segW + segGap);
            const x1 = x0 + segW;
            fillPath(segPalette[i % segPalette.length], 1.0,
                () => traceRoundRect(x0, segRowY0, x1, segRowY1, [r, r, r, r]));
        }
    }

    // Text rows fill the remaining display area below the segment row.
    const textZoneY0 = segRowY1 + 0.020;

    // Pseudo-text rows fill the remaining display area.
    {
        const rowCount = Math.max(2, Math.min(20, Math.round(params.textRows)));
        const rowsY1 = dispY1 - 0.005;
        const rowH = (rowsY1 - textZoneY0) / rowCount;
        const scrollCycles = Math.max(0, Math.round(params.scrollSpeed));
        const SAMPLE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
        for (let r = 0; r < rowCount; r++) {
            const yMid = textZoneY0 + (r + 0.5) * rowH;
            ctx.save();
            const pTop = proj2D(dispX0, yMid - rowH * 0.4);
            const pBot = proj2D(dispX0, yMid + rowH * 0.4);
            const sz = Math.max(5, (pBot.y - pTop.y) * 0.78);
            ctx.font = `${sz}px monospace`;
            const color = r % 3 === 0 ? cText : (r % 3 === 1 ? cElbow : cBar);
            ctx.fillStyle = hexWithAlpha(color, opacity * 0.85);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            let text = '';
            const charsPerRow = Math.max(8, Math.min(40, Math.round(params.charsPerRow)));
            const drift = Math.floor(t * scrollCycles * charsPerRow + r * 7.1);
            for (let c = 0; c < charsPerRow; c++) {
                const seed = Math.sin((r + 1) * 12.93 + (c + drift) * 5.27) * 43758.55;
                const idx = Math.floor(((seed - Math.floor(seed)) * SAMPLE_CHARS.length));
                text += SAMPLE_CHARS[idx];
                if (c === 3 || c === 9) text += '-';
            }
            const startP = proj2D(dispX0, yMid);
            ctx.fillText(text, startP.x, startP.y);
            ctx.restore();
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'lcars',
    name:         'LCARS',
    description:  'Star Trek-style LCARS console with the iconic curved elbows, coloured pill buttons, segmented top/bottom bars, and a central display populated with scrolling pseudo-text. Defaults to canonical LCARS palette.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'bgColor', label: 'Background',
            description: 'Outer frame fill — usually black for the classic LCARS look.',
            type: 'color', default: '#000000', randomColorRole: 'bg' },
        { key: 'elbowColor', label: 'Elbow Color',
            description: 'Color of the top elbow / spine cap / accent text.',
            type: 'color', default: '#ff9900', randomColorRole: 'fg' },
        { key: 'barColor', label: 'Bar Color',
            description: 'Primary color used in top/bottom bar segments and some pills.',
            type: 'color', default: '#cc99cc', randomColorRole: 'fg' },
        { key: 'accent1', label: 'Accent 1',
            description: 'Bottom elbow & lower-left accents (warm tone in classic LCARS).',
            type: 'color', default: '#ff9966', randomColorRole: 'fg' },
        { key: 'accent2', label: 'Accent 2',
            description: 'Secondary accents (lavender / pale violet in classic LCARS).',
            type: 'color', default: '#9999ff', randomColorRole: 'fg' },
        { key: 'accent3', label: 'Accent 3',
            description: 'Alert / warning accent (burgundy in classic LCARS).',
            type: 'color', default: '#cc6666', randomColorRole: 'fg' },
        { key: 'textColor', label: 'Text Color',
            description: 'Main pseudo-text color in the central display.',
            type: 'color', default: '#f8fbdb', randomColorRole: 'fg' },

        { key: 'size', label: 'Size',
            description: 'Overall panel size (fraction of half-frame).',
            type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.92 },
        { key: 'aspectRatio', label: 'Aspect Ratio',
            description: 'Panel height / width. 0.5 = wide cinemascope; 0.65 = monitor; 1.0 = square; 1.3 = tall portrait.',
            type: 'slider', min: 0.4, max: 1.4, step: 0.02, default: 0.65 },

        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,

        { key: 'spineButtons', label: 'Spine Buttons',
            description: 'Number of vertical pill buttons stacked along the left spine between the elbows.',
            type: 'slider', min: 2, max: 7, step: 1, default: 3 },
        { key: 'rightButtons', label: 'Floating Pills',
            description: 'Number of floating pill buttons in the top-right area of the central display.',
            type: 'slider', min: 2, max: 8, step: 1, default: 4 },
        { key: 'topSegments', label: 'Top/Bottom Segments',
            description: 'Number of coloured segments inside the top and bottom horizontal bars.',
            type: 'slider', min: 2, max: 14, step: 1, default: 6 },

        { key: 'textRows', label: 'Text Rows',
            description: 'Number of pseudo-text rows in the central display.',
            type: 'slider', min: 2, max: 20, step: 1, default: 5 },
        { key: 'charsPerRow', label: 'Chars Per Row',
            description: 'Approximate character count per text row (more = denser data).',
            type: 'slider', min: 8, max: 40, step: 1, default: 16 },
        { key: 'scrollSpeed', label: 'Text Scroll Speed',
            description: 'How fast the pseudo-text shifts per loop. 0 = static. Integer for seamless loop.',
            type: 'slider', min: 0, max: 6, step: 1, default: 2 },
        { key: 'blinkSpeed', label: 'Blink Speed',
            description: 'How fast the right-column pill buttons cycle a subtle brightness wave. Integer = seamless loop.',
            type: 'slider', min: 1, max: 6, step: 1, default: 2 },

        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderLCARSFrame
});
