/**
 * Tactical Map — top-down strategic display. Cartesian grid + compass
 * rose + moving unit icons with fading trajectory trails. Units come in
 * three classifications (friendly, neutral, hostile), each with a
 * distinct shape and color.
 *
 * Each unit's path is deterministic and loop-safe: parametric sinusoidal
 * trajectories with integer frequencies so the icon ends each loop where
 * it started.
 */
function renderTacticalMapFrame(ctx, w, h, frameIdx, totalFrames, params) {
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
    const gridColor = params.gridColor;
    const friendlyColor = params.friendlyColor;
    const neutralColor = params.neutralColor;
    const hostileColor = params.hostileColor;
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
    const polygon = (pts, color, alpha) => {
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++) {
            const p = proj(pts[k][0], pts[k][1]);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
    };
    const dot = (x, y, r, color, alpha) => {
        const p = proj(x, y);
        ctx.fillStyle = hexWithAlpha(color, opacity * alpha);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
    };

    // Background + border.
    fillRect(-W, -H, W, H, bgColor, 1.0);
    strokeRect(-W, -H, W, H, gridColor, 1.0, borderThick * 1.4);

    // Grid lines.
    const gridDiv = Math.max(2, Math.round(params.gridDivisions));
    for (let i = 1; i < gridDiv; i++) {
        const x = -W + (i / gridDiv) * 2 * W;
        const y = -H + (i / gridDiv) * 2 * H;
        line(x, -H, x, H, gridColor, 0.25, borderThick * 0.3);
        line(-W, y, W, y, gridColor, 0.25, borderThick * 0.3);
    }
    // Center crosshair (slightly brighter).
    line(0, -H, 0, H, gridColor, 0.45, borderThick * 0.4);
    line(-W, 0, W, 0, gridColor, 0.45, borderThick * 0.4);

    // Compass rose — small ring at top-left corner with cardinal markings.
    if (params.compassSize > 0.01) {
        const cmpR = params.compassSize * 0.12;
        const cmpX = -W + cmpR + 0.04;
        const cmpY = H - cmpR - 0.04;
        // Ring
        const N = 32;
        const ringPts = [];
        for (let k = 0; k <= N; k++) {
            const a = (k / N) * Math.PI * 2;
            ringPts.push([cmpX + cmpR * Math.cos(a), cmpY + cmpR * Math.sin(a)]);
        }
        ctx.strokeStyle = hexWithAlpha(gridColor, opacity * 0.65);
        ctx.lineWidth = borderThick * 0.6;
        ctx.beginPath();
        for (let k = 0; k < ringPts.length; k++) {
            const p = proj(ringPts[k][0], ringPts[k][1]);
            if (k === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        // Cardinal ticks
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2 - Math.PI / 2;
            const ix = cmpX + cmpR * 0.7 * Math.cos(a);
            const iy = cmpY + cmpR * 0.7 * Math.sin(a);
            const ox = cmpX + cmpR * 1.0 * Math.cos(a);
            const oy = cmpY + cmpR * 1.0 * Math.sin(a);
            line(ix, iy, ox, oy, gridColor, 0.85, borderThick * 0.5);
        }
        // Center dot
        dot(cmpX, cmpY, borderThick * 1.0, gridColor, 1.0);
        // Tiny "N" marker (a short line above the top tick)
        line(cmpX, cmpY + cmpR * 1.0, cmpX, cmpY + cmpR * 1.25, friendlyColor, 1.0, borderThick * 0.8);
    }

    // Units.
    const unitCount = Math.max(0, Math.round(params.unitCount));
    const trajCycles = Math.max(1, Math.round(params.trajectoryCycles));
    const trailLen = Math.max(0, Math.min(0.9, params.trailLength));
    for (let i = 0; i < unitCount; i++) {
        // Per-unit deterministic seeds.
        const sA = Math.sin(i * 12.9898) * 43758.5; const rA = sA - Math.floor(sA);
        const sB = Math.sin(i * 78.233)  * 43758.5; const rB = sB - Math.floor(sB);
        const sC = Math.sin(i * 39.346)  * 43758.5; const rC = sC - Math.floor(sC);
        const sD = Math.sin(i * 17.913)  * 43758.5; const rD = sD - Math.floor(sD);

        // Classify (0 = friendly, 1 = neutral, 2 = hostile).
        const classification = rA < 0.45 ? 0 : (rA < 0.75 ? 1 : 2);
        const col = [friendlyColor, neutralColor, hostileColor][classification];

        // Trajectory parameters: amplitude, frequency, phase offsets.
        const ax = (W - 0.1) * (0.3 + 0.5 * rB);
        const ay = (H - 0.1) * (0.3 + 0.5 * rC);
        const freqX = Math.max(1, Math.round(trajCycles * (1 + (i % 3) * 0.4)));
        const freqY = Math.max(1, Math.round(trajCycles * (1 + ((i + 1) % 3) * 0.4)));
        const phX = rD * Math.PI * 2;
        const phY = rB * Math.PI * 2;
        const centerX = (rA - 0.5) * (W - 0.2) * 0.4;
        const centerY = (rC - 0.5) * (H - 0.2) * 0.4;

        const posAt = (tt) => {
            const x = centerX + ax * Math.sin(tt * Math.PI * 2 * freqX + phX);
            const y = centerY + ay * Math.cos(tt * Math.PI * 2 * freqY + phY);
            return [x, y];
        };
        const [px, py] = posAt(t);

        // Trajectory trail (sampled backwards from current position).
        if (trailLen > 0.01) {
            const trailSegs = 10;
            for (let s = 0; s < trailSegs; s++) {
                const u = s / trailSegs;
                const tt0 = t - u * trailLen * 0.1;
                const tt1 = t - (u + 1 / trailSegs) * trailLen * 0.1;
                const [x0, y0] = posAt(tt0);
                const [x1, y1] = posAt(tt1);
                const fadeAlpha = (1 - u) * 0.7;
                line(x0, y0, x1, y1, col, fadeAlpha, borderThick * 0.6);
            }
        }

        // Unit icon shape depends on classification.
        const iconR = minDim * 0.012;  // pixel size — already scaled by project
        const iconLocal = iconR / (minDim * 0.5 * params.size);  // back-convert to local
        if (classification === 0) {
            // Friendly: filled triangle pointing up.
            const triPts = [
                [px,             py + iconLocal * 1.4],
                [px + iconLocal, py - iconLocal],
                [px - iconLocal, py - iconLocal]
            ];
            polygon(triPts, col, 0.95);
        } else if (classification === 1) {
            // Neutral: filled square.
            const sq = [
                [px - iconLocal, py - iconLocal],
                [px + iconLocal, py - iconLocal],
                [px + iconLocal, py + iconLocal],
                [px - iconLocal, py + iconLocal]
            ];
            polygon(sq, col, 0.95);
        } else {
            // Hostile: filled diamond (square rotated 45°).
            const d = iconLocal * 1.25;
            const dia = [
                [px,     py + d],
                [px + d, py],
                [px,     py - d],
                [px - d, py]
            ];
            polygon(dia, col, 1.0);
            // Hostile ring around the diamond (sweep pulse).
            const pulse = (Math.sin(t * Math.PI * 2 * trajCycles * 4 + i) + 1) * 0.5;
            if (pulse > 0.6) {
                const ringR = d * (1.5 + (1 - pulse) * 1.0);
                const ringPts = [];
                const RN = 16;
                for (let k = 0; k <= RN; k++) {
                    const a = (k / RN) * Math.PI * 2;
                    ringPts.push([px + ringR * Math.cos(a), py + ringR * Math.sin(a)]);
                }
                ctx.strokeStyle = hexWithAlpha(col, opacity * (pulse - 0.6) * 2);
                ctx.lineWidth = borderThick * 0.5;
                ctx.beginPath();
                for (let k = 0; k < ringPts.length; k++) {
                    const p = proj(ringPts[k][0], ringPts[k][1]);
                    if (k === 0) ctx.moveTo(p.x, p.y);
                    else ctx.lineTo(p.x, p.y);
                }
                ctx.stroke();
            }
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'interface',
    id:           'tacticalmap',
    name:         'Tactical Map',
    description:  'Top-down strategic display: grid + compass + units moving along parametric trajectories with fading trails. Hostile units pulse with warning rings.',
    defaultBlend: 'source-over',
    noRandomize: [...INTERFACE_NO_RANDOMIZE],
    params: [
        { key: 'bgColor', label: 'Background', type: 'color', default: '#04080a', randomColorRole: 'bg' },
        { key: 'gridColor', label: 'Grid', type: 'color', default: '#3080a0', randomColorRole: 'fg' },
        { key: 'friendlyColor', label: 'Friendly', type: 'color', default: '#60ff80', randomColorRole: 'fg' },
        { key: 'neutralColor', label: 'Neutral', type: 'color', default: '#ffd040', randomColorRole: 'fg' },
        { key: 'hostileColor', label: 'Hostile', type: 'color', default: '#ff4040', randomColorRole: 'fg' },
        { key: 'size', label: 'Size', type: 'slider', min: 0.02, randomMin: 0.2, max: 1.5, step: 0.005, default: 0.85 },
        { key: 'aspectRatio', label: 'Aspect Ratio', type: 'slider', min: 0.3, max: 1.2, step: 0.02, default: 0.7 },
        ...SYMBOL3D_ROTATION_PARAMS,
        ...SYMBOL3D_POSITION_PARAMS,
        { key: 'gridDivisions', label: 'Grid Divisions',
            description: 'Number of grid cells across each axis.',
            type: 'slider', min: 2, max: 16, step: 1, default: 8 },
        { key: 'compassSize', label: 'Compass Size',
            description: 'Size of the compass rose in the top-left corner. 0 hides it.',
            type: 'slider', min: 0, max: 2, step: 0.05, default: 1.0 },
        { key: 'unitCount', label: 'Unit Count',
            description: 'Number of moving unit icons on the map.',
            type: 'slider', min: 0, max: 32, step: 1, default: 10 },
        { key: 'trajectoryCycles', label: 'Movement Speed',
            description: 'Base trajectory cycles per loop. Integer.',
            type: 'slider', min: 1, max: 5, step: 1, default: 1 },
        { key: 'trailLength', label: 'Trail Length',
            description: 'How long each unit\'s motion trail extends. 0 = no trail.',
            type: 'slider', min: 0, max: 0.9, step: 0.05, default: 0.4 },
        { key: 'borderThickness', label: 'Line Thickness', type: 'slider', min: 0.3, max: 4, step: 0.1, default: 1.0 },
        ...SYMBOL3D_PULSE_PARAMS,
        { key: 'opacity', label: 'Opacity', type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderTacticalMapFrame
});
