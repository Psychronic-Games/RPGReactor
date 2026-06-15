/**
 * Hex Memory Dump — a dense grid of pseudo-hex "bytes" rendered as short
 * dash characters, with a left-column of row offsets and occasional
 * highlighted/changing bytes. Mimics a classic memory inspector / hex
 * editor view from sci-fi UIs.
 *
 * Each "byte" is two small dashes (high nibble + low nibble) per cell.
 * A handful of cells randomly change color over the loop to suggest
 * memory writes / hot regions.
 */
function renderHexDumpFrame(ctx, w, h, frameIdx, totalFrames, params) {
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
    const offsetColor = params.offsetColor;
    const byteColor = params.byteColor;
    const highlightColor = params.highlightColor;
    const opacity = params.opacity;
    const borderThick = Math.max(0.5, minDim * 0.003 * params.borderThickness);

    const proj = (x, y) => project(transform([x, y, 0]));
    const fillRect = (x0, y0, x1, y1, color, alpha) => {
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        const p0 = proj(x0, y0), p1 = proj(x1, y0), p2 = proj(x1, y1), p3 = proj(x0, y1);
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath();
        ctx.fill();
    };
    const strokeRect = (x0, y0, x1, y1, color, alpha, lw) => {
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.beginPath();
        const p0 = proj(x0, y0), p1 = proj(x1, y0), p2 = proj(x1, y1), p3 = proj(x0, y1);
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath();
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

    // Background + border.
    fillRect(-W, -H, W, H, bgColor, 1.0);
    strokeRect(-W, -H, W, H, borderColor, 1.0, borderThick * 1.4);
    const inset = 0.035;
    strokeRect(-W + inset, -H + inset, W - inset, H - inset, borderColor, 0.55, borderThick * 0.5);

    // Title bar.
    const titleY1 = H - inset * 1.3;
    const titleY0 = H - inset * 4.5;
    fillRect(-W + inset * 1.5, titleY0, W - inset * 1.5, titleY1, byteColor, 0.16);
    strokeRect(-W + inset * 1.5, titleY0, W - inset * 1.5, titleY1, byteColor, 0.7, borderThick * 0.4);
    // Title text — short dashes representing "MEM @ XXXXXXXX" style label.
    const titleCharCount = Math.min(22, Math.max(8, Math.round(params.charsPerRow * 1.3)));
    const titleX0 = -W + 0.08;
    const titleX1 = W - 0.08;
    const titleCharSp = (titleX1 - titleX0) / titleCharCount;
    const titleY = (titleY0 + titleY1) / 2;
    for (let i = 0; i < titleCharCount; i++) {
        const seed = Math.sin(i * 13.7 + Math.floor(t * 6)) * 0.5 + 0.5;
        const len = titleCharSp * (0.4 + 0.35 * seed);
        const col = (i < 4) ? offsetColor : ((seed > 0.85) ? highlightColor : byteColor);
        line(titleX0 + i * titleCharSp, titleY, titleX0 + i * titleCharSp + len, titleY,
            col, 0.92, borderThick * 0.7);
    }

    // Grid: rows × cols of hex bytes.
    const rows = Math.max(2, Math.round(params.rows));
    const cols = Math.max(4, Math.round(params.charsPerRow));
    const gridX0 = -W + inset * 1.7;
    const gridX1 = W - inset * 1.5;
    const gridY0 = -H + inset * 2.0;
    const gridY1 = titleY0 - inset * 0.6;
    const offsetColumnW = (gridX1 - gridX0) * 0.13;
    const dataX0 = gridX0 + offsetColumnW + 0.02;
    const cellW = (gridX1 - dataX0) / cols;
    const rowH = (gridY1 - gridY0) / rows;
    const scrollSpeed = Math.max(0, Math.round(params.scrollSpeed));

    for (let r = 0; r < rows; r++) {
        const ry = gridY1 - (r + 0.6) * rowH;
        // Offset column (row address).
        const offDashCount = 4;
        const offSp = offsetColumnW / offDashCount;
        for (let k = 0; k < offDashCount; k++) {
            const seed = Math.sin((r * 17 + k * 31) + Math.floor(t * scrollSpeed)) * 0.5 + 0.5;
            const len = offSp * 0.5;
            const xL = gridX0 + 0.005 + k * offSp;
            line(xL, ry, xL + len, ry, offsetColor, 0.85, borderThick * 0.55);
        }
        // Data bytes.
        for (let c = 0; c < cols; c++) {
            // Per-cell deterministic seed (scrolls with time).
            const seedRaw = Math.sin((r * 91.7 + c * 13.3) + Math.floor(t * scrollSpeed * (1 + (r % 3) * 0.5))) * 43758.5;
            const seed = seedRaw - Math.floor(seedRaw);
            // Hot byte: 8% chance per cell, drawn in highlight color.
            const hot = seed > 0.92;
            const col = hot ? highlightColor : byteColor;
            const alpha = hot ? 1.0 : (0.55 + 0.35 * seed);
            // Each byte = two short dashes (high nibble + low nibble).
            const cellX = dataX0 + c * cellW;
            const dashLen = cellW * (0.32 + 0.22 * seed);
            const dash1X = cellX + cellW * 0.05;
            const dash2X = cellX + cellW * 0.50;
            line(dash1X, ry, dash1X + dashLen * 0.55, ry, col, alpha, borderThick * 0.6);
            line(dash2X, ry, dash2X + dashLen * 0.55, ry, col, alpha, borderThick * 0.6);
        }
    }

    // Vertical divider between offset column and data.
    line(gridX0 + offsetColumnW, gridY0, gridX0 + offsetColumnW, gridY1,
        byteColor, 0.4, borderThick * 0.4);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'hexdump',
    name:         'Hex Memory Dump',
    description:  'Dense grid of pseudo-hex bytes with row offsets and hot-byte highlights. Classic memory inspector look.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'bgColor', label: 'Background', type: 'color', default: '#040408', randomColorRole: 'bg' },
        { key: 'borderColor', label: 'Border', type: 'color', default: '#40a0c0', randomColorRole: 'fg' },
        { key: 'offsetColor', label: 'Offset Column', type: 'color', default: '#a070ff', randomColorRole: 'fg' },
        { key: 'byteColor', label: 'Bytes', type: 'color', default: '#80ffa0', randomColorRole: 'fg' },
        { key: 'highlightColor', label: 'Hot Byte', type: 'color', default: '#ff5060', randomColorRole: 'fg' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },
        { key: 'aspectRatio', label: 'Aspect Ratio', type: 'slider', min: 0.3, max: 1.2, step: 0.02, default: 0.7 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'rows', label: 'Rows',
            description: 'Number of byte-rows in the dump. 4 = sparse, 24 = packed.',
            type: 'slider', min: 4, max: 32, step: 1, default: 14 },
        { key: 'charsPerRow', label: 'Bytes Per Row',
            description: 'Number of byte-columns per row. 4 = wide bytes, 32 = dense.',
            type: 'slider', min: 4, max: 32, step: 1, default: 12 },
        { key: 'scrollSpeed', label: 'Update Rate',
            description: 'How fast the bytes change values (integer cycles per loop). 0 = static dump.',
            type: 'slider', min: 0, max: 12, step: 1, default: 4 },
        { key: 'borderThickness', label: 'Line Thickness', type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderHexDumpFrame
});
