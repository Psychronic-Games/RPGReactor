/**
 * Vital Signs Monitor — multi-row waveform display. Each row shows a
 * different waveform style (heartbeat spike, sinusoid, blocky pulse) with
 * its own color, a left-side label (pseudo-text dashes), and a right-side
 * numeric readout (pseudo-digit dashes).
 *
 * Loop-safe: every waveform's frequency is integer per loop. Row count is
 * configurable; rows beyond the 4 named styles cycle through.
 */
function renderVitalSignsFrame(ctx, w, h, frameIdx, totalFrames, params) {
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
    const heartColor = params.heartColor;
    const breathColor = params.breathColor;
    const alertColor = params.alertColor;
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
    const segLine = (x0, y0, x1, y1, color, alpha, lw) => {
        const p0 = proj(x0, y0), p1 = proj(x1, y1);
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
    };
    const drawPolyline = (pts, color, alpha, lw) => {
        ctx.strokeStyle = hexWithAlpha(color, opacity * alpha);
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            const p = proj(pts[k][0], pts[k][1]);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
    };

    // Background + border.
    fillRect(-W, -H, W, H, bgColor, 1.0);
    strokeRect(-W, -H, W, H, borderColor, 1.0, borderThick * 1.4);
    const inset = 0.035;
    strokeRect(-W + inset, -H + inset, W - inset, H - inset, borderColor, 0.5, borderThick * 0.5);

    // Row layout.
    const rowCount = Math.max(1, Math.round(params.rowCount));
    const rowsX0 = -W + inset * 1.5;
    const rowsX1 = W - inset * 1.5;
    const rowsY0 = -H + inset * 1.5;
    const rowsY1 = H - inset * 1.5;
    const rowH = (rowsY1 - rowsY0) / rowCount;
    const labelW = (rowsX1 - rowsX0) * 0.12;
    const readoutW = (rowsX1 - rowsX0) * 0.14;
    const waveX0 = rowsX0 + labelW;
    const waveX1 = rowsX1 - readoutW;
    const waveSpan = waveX1 - waveX0;

    const colorChoices = [heartColor, breathColor, alertColor];
    const speedChoices = [Math.max(1, Math.round(params.heartRate)),
                          Math.max(1, Math.round(params.breathRate)),
                          Math.max(1, Math.round(params.alertRate))];
    const styleChoices = [0, 1, 2, 3];  // 0=heartbeat, 1=sin, 2=square pulse, 3=spike train

    for (let r = 0; r < rowCount; r++) {
        const rTop = rowsY1 - r * rowH;
        const rBot = rTop - rowH;
        const rMid = (rTop + rBot) / 2;
        // Row separator
        if (r > 0) {
            segLine(rowsX0, rTop, rowsX1, rTop, borderColor, 0.3, borderThick * 0.3);
        }

        const colorIdx = r % colorChoices.length;
        const styleIdx = r % styleChoices.length;
        const color = colorChoices[colorIdx];
        const speed = speedChoices[colorIdx];

        // Label dashes on the left.
        const labelChars = 4;
        const labelSp = labelW / labelChars;
        for (let c = 0; c < labelChars; c++) {
            const seed = Math.sin(r * 17 + c * 11.7) * 0.5 + 0.5;
            const len = labelSp * (0.4 + 0.4 * seed);
            const xL = rowsX0 + c * labelSp + 0.005;
            segLine(xL, rMid, xL + len, rMid, color, 0.85, borderThick * 0.55);
        }

        // Waveform.
        const ampMul = params.amplitude * 0.85;
        const ampHalf = rowH * 0.5 * 0.7 * ampMul;
        const wfN = 80;
        const pts = [];
        for (let k = 0; k <= wfN; k++) {
            const u = k / wfN;
            const x = waveX0 + u * waveSpan;
            // Phase that progresses across the waveform horizontally AND advances over time.
            const tPhase = u * speed * Math.PI * 2 + t * Math.PI * 2 * speed;
            let v = 0;
            if (styleIdx === 0) {
                // Heartbeat: short spike then quiet zone (P-QRS-T-ish).
                const p = ((tPhase / (Math.PI * 2)) % 1 + 1) % 1;
                if (p < 0.06) v = -0.3;                       // P
                else if (p < 0.10) v = 1.6 * (p - 0.06) / 0.04;
                else if (p < 0.13) v = 1.6 - 4.5 * (p - 0.10) / 0.03;   // R peak down
                else if (p < 0.16) v = -2.9 + 3.0 * (p - 0.13) / 0.03;  // S → recovery
                else if (p < 0.30) v = -0.1 + 0.5 * Math.sin((p - 0.16) / 0.14 * Math.PI);  // T
                else v = 0.0 + 0.04 * Math.sin(p * 73);       // baseline noise
            } else if (styleIdx === 1) {
                // Smooth sinusoid (respiration).
                v = Math.sin(tPhase) * 0.8 + Math.sin(tPhase * 2 + 0.3) * 0.1;
            } else if (styleIdx === 2) {
                // Square pulse (binary toggle).
                v = (Math.sin(tPhase) > 0 ? 0.9 : -0.9);
            } else {
                // Spike train (sharp narrow spikes).
                const phase = ((tPhase / (Math.PI * 2)) % 1 + 1) % 1;
                v = phase < 0.05 ? Math.sin(phase * Math.PI / 0.05) * 1.4 : 0;
            }
            pts.push([x, rMid + v * ampHalf]);
        }
        // Glow + main stroke.
        if (params.glow > 0.01) {
            drawPolyline(pts, color, params.glow * 0.5, borderThick * (2 + params.glow * 3));
        }
        drawPolyline(pts, color, 1.0, borderThick * 0.9);

        // Numeric readout on the right (4 large pseudo-digits).
        const readoutChars = 4;
        const readoutSp = readoutW / readoutChars;
        const seedTime = Math.floor(t * speed * 2);
        for (let c = 0; c < readoutChars; c++) {
            const seed = Math.sin(r * 19 + c * 13.3 + seedTime) * 0.5 + 0.5;
            const xL = rowsX1 - readoutW + 0.005 + c * readoutSp;
            const len = readoutSp * (0.45 + 0.3 * seed);
            // Top and bottom dashes for digit-like look.
            const yTop = rMid + rowH * 0.08;
            const yMid = rMid;
            const yBot = rMid - rowH * 0.08;
            segLine(xL, yTop, xL + len, yTop, color, 0.85, borderThick * 0.6);
            segLine(xL, yMid, xL + len, yMid, color, 0.6, borderThick * 0.5);
            segLine(xL, yBot, xL + len, yBot, color, 0.85, borderThick * 0.6);
        }
    }

    // Top border of row area (extra emphasis line at top).
    segLine(rowsX0, rowsY1, rowsX1, rowsY1, borderColor, 0.4, borderThick * 0.4);
    // Vertical divider between label / waveform / readout columns.
    segLine(waveX0, rowsY0, waveX0, rowsY1, borderColor, 0.3, borderThick * 0.3);
    segLine(waveX1, rowsY0, waveX1, rowsY1, borderColor, 0.3, borderThick * 0.3);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'vitalsigns',
    name:         'Vital Signs Monitor',
    description:  'Multiple waveform rows (heartbeat, respiration, square pulse, spike train) with labels and numeric readouts. Sci-fi medical monitor / system telemetry vibe.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'bgColor', label: 'Background', type: 'color', default: '#040810', randomColorRole: 'bg' },
        { key: 'borderColor', label: 'Border', type: 'color', default: '#3070a0', randomColorRole: 'fg' },
        { key: 'heartColor', label: 'Row 1 (Heartbeat)', type: 'color', default: '#ff6080', randomColorRole: 'fg' },
        { key: 'breathColor', label: 'Row 2 (Breathing)', type: 'color', default: '#60c0ff', randomColorRole: 'fg' },
        { key: 'alertColor', label: 'Row 3 (Alert)', type: 'color', default: '#ffa040', randomColorRole: 'fg' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },
        { key: 'aspectRatio', label: 'Aspect Ratio', type: 'slider', min: 0.3, max: 1.2, step: 0.02, default: 0.7 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'rowCount', label: 'Row Count',
            description: 'Number of monitor rows. 1 = single vital; 8 = dense panel.',
            type: 'slider', min: 1, max: 8, step: 1, default: 3 },
        { key: 'heartRate', label: 'Row 1 Speed',
            description: 'Heartbeat row beats per loop. Integer for seamless loop.',
            type: 'slider', min: 1, max: 8, step: 1, default: 3 },
        { key: 'breathRate', label: 'Row 2 Speed',
            description: 'Breathing row cycles per loop.',
            type: 'slider', min: 1, max: 8, step: 1, default: 2 },
        { key: 'alertRate', label: 'Row 3 Speed',
            description: 'Alert row cycles per loop.',
            type: 'slider', min: 1, max: 12, step: 1, default: 4 },
        { key: 'amplitude', label: 'Waveform Amplitude',
            description: 'Vertical reach of each waveform. 0.2 = flat, 1.5 = clipping into neighbor row.',
            type: 'slider', min: 0.2, max: 1.5, step: 0.05, default: 0.8 },
        { key: 'glow', label: 'Glow',
            description: 'Soft halo around each waveform line.',
            type: 'slider', min: 0, max: 1.5, step: 0.05, default: 0.5 },
        { key: 'borderThickness', label: 'Line Thickness', type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderVitalSignsFrame
});
