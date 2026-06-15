(function () {

    function prand(seed) {
        const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
        return x - Math.floor(x);
    }

    function renderFrostCrystalFrame(ctx, w, h, frameIdx, totalFrames, params) {
        const t = frameIdx / totalFrames;
        ctx.clearRect(0, 0, w, h);

        const crystalColor  = params.crystalColor  !== undefined ? params.crystalColor  : '#88ccff';
        const glintColor    = params.glintColor    !== undefined ? params.glintColor    : '#ffffff';
        const cx            = w * (params.centerX  !== undefined ? params.centerX  : 0.5);
        const cy            = h * (params.centerY  !== undefined ? params.centerY  : 0.5);
        const actualSize    = Math.min(w, h) * 0.5 * (params.size !== undefined ? params.size : 0.4);
        const armCount      = Math.round(params.armCount      !== undefined ? params.armCount      : 6);
        const branchDepth   = Math.round(params.branchDepth   !== undefined ? params.branchDepth   : 2);
        const shimmerCycles = Math.round(params.shimmerCycles !== undefined ? params.shimmerCycles : 3);
        const sparkleCount  = Math.round(params.sparkleCount  !== undefined ? params.sparkleCount  : 12);
        const lw            = params.lineWidth     !== undefined ? params.lineWidth     : 2.5;
        const glowIntensity = params.glowIntensity !== undefined ? params.glowIntensity : 0.5;

        const effectRadius = actualSize;
        const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
        const proj3 = (lx, ly, lz) => {
            const r = transform([lx, ly, lz]);
            const d = 3.5;
            const dz = d - r[2];
            const s = dz > 0.15 ? d / dz : d / 0.15;
            return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
        };

        // 1 full revolution over the loop, integer multiplier ✓
        const slowRotation = t * Math.PI * 2 * 1;

        // ── 1. GLOW HALO ──────────────────────────────────────────────────────
        const glowRadius = actualSize * 0.4;
        const blurPx = Math.max(4, Math.round(glowRadius * 0.6));
        ctx.save();
        ctx.filter = 'blur(' + blurPx + 'px)';
        ctx.globalAlpha = glowIntensity * 0.6;
        ctx.fillStyle = crystalColor;
        ctx.beginPath();
        ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── 2. INNER HEXAGON ──────────────────────────────────────────────────
        const hexR = 0.12;
        ctx.save();
        ctx.strokeStyle = crystalColor;
        ctx.lineWidth = lw * 0.8;
        ctx.fillStyle = hexWithAlpha(crystalColor, 0.08);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = slowRotation + (i / 6) * Math.PI * 2;
            const p = proj3(Math.cos(angle) * hexR, 0, Math.sin(angle) * hexR);
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // ── 3 & 4. MAIN ARMS + BRANCHES ──────────────────────────────────────
        const branchStrokeColor = mixHexColors(crystalColor, glintColor, 0.3);
        const center = proj3(0, 0, 0);

        for (let i = 0; i < armCount; i++) {
            const baseAngle = (i / armCount) * Math.PI * 2 + slowRotation;
            // shimmerCycles is integer ✓
            const breathing = 1 + 0.05 * Math.sin(t * Math.PI * 2 * shimmerCycles + i);
            const armLen = breathing; // local units, scaled by effectRadius via proj3

            const ax = Math.cos(baseAngle);
            const az = Math.sin(baseAngle);
            const tip = proj3(ax * armLen, 0, az * armLen);

            // Main arm line
            ctx.save();
            ctx.strokeStyle = crystalColor;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(center.x, center.y);
            ctx.lineTo(tip.x, tip.y);
            ctx.stroke();

            // Tip snowflake cap — 6 short lines radiating from the arm tip in XZ plane
            const tipLen = 0.06;
            ctx.lineWidth = lw * 0.6;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
                const ka = baseAngle + (k / 6) * Math.PI * 2;
                const tipEnd = proj3(ax * armLen + Math.cos(ka) * tipLen, 0, az * armLen + Math.sin(ka) * tipLen);
                ctx.moveTo(tip.x, tip.y);
                ctx.lineTo(tipEnd.x, tipEnd.y);
            }
            ctx.stroke();
            ctx.restore();

            // Branches at 0.3 and 0.6 along arm
            ctx.save();
            ctx.strokeStyle = branchStrokeColor;
            ctx.lineCap = 'round';

            const branchFracs = [0.3, 0.6];
            const branchLens  = [armLen * 0.18, armLen * 0.3];

            for (let b = 0; b < branchFracs.length; b++) {
                const frac = branchFracs[b];
                const bLen = branchLens[b];
                const bpx  = ax * armLen * frac;
                const bpz  = az * armLen * frac;
                const bp   = proj3(bpx, 0, bpz);

                for (let s = -1; s <= 1; s += 2) {
                    const bAngle = baseAngle + s * (Math.PI / 3);
                    const bex    = bpx + Math.cos(bAngle) * bLen;
                    const bez    = bpz + Math.sin(bAngle) * bLen;
                    const bEnd   = proj3(bex, 0, bez);

                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(bp.x, bp.y);
                    ctx.lineTo(bEnd.x, bEnd.y);
                    ctx.stroke();

                    if (branchDepth >= 2) {
                        const midX = bpx + Math.cos(bAngle) * bLen * 0.55;
                        const midZ = bpz + Math.sin(bAngle) * bLen * 0.55;
                        const mid  = proj3(midX, 0, midZ);
                        const mLen = bLen * 0.4;
                        ctx.lineWidth = 1;
                        for (let ms = -1; ms <= 1; ms += 2) {
                            const mAngle = bAngle + ms * (Math.PI / 3);
                            const mEnd   = proj3(midX + Math.cos(mAngle) * mLen, 0, midZ + Math.sin(mAngle) * mLen);
                            ctx.beginPath();
                            ctx.moveTo(mid.x, mid.y);
                            ctx.lineTo(mEnd.x, mEnd.y);
                            ctx.stroke();
                        }
                    }

                    if (branchDepth >= 3) {
                        const nearX = bpx + Math.cos(bAngle) * bLen * 0.3;
                        const nearZ = bpz + Math.sin(bAngle) * bLen * 0.3;
                        const near  = proj3(nearX, 0, nearZ);
                        const nLen  = bLen * 0.22;
                        ctx.lineWidth = 0.7;
                        for (let ns = -1; ns <= 1; ns += 2) {
                            const nAngle = bAngle + ns * (Math.PI / 3);
                            const nEnd   = proj3(nearX + Math.cos(nAngle) * nLen, 0, nearZ + Math.sin(nAngle) * nLen);
                            ctx.beginPath();
                            ctx.moveTo(near.x, near.y);
                            ctx.lineTo(nEnd.x, nEnd.y);
                            ctx.stroke();
                        }
                    }
                }
            }
            ctx.restore();
        }

        // ── 5. SPARKLES ───────────────────────────────────────────────────────
        for (let i = 0; i < sparkleCount; i++) {
            const armIdx    = i % armCount;
            const baseAngle = (armIdx / armCount) * Math.PI * 2 + slowRotation;
            const breathing = 1 + 0.05 * Math.sin(t * Math.PI * 2 * shimmerCycles + armIdx);
            const armLen    = breathing;

            const ax = Math.cos(baseAngle);
            const az = Math.sin(baseAngle);

            const distFrac = 0.7 + 0.3 * prand(i * 3.1 + 7.3);
            const perpOff  = (prand(i * 7.3 + 13.7) - 0.5) * 0.15;

            // perpendicular direction in XZ plane: (-sin, 0, cos)
            const sx = ax * distFrac * armLen + (-az) * perpOff;
            const sz = az * distFrac * armLen + ax * perpOff;
            const sp = proj3(sx, 0, sz);

            // shimmerCycles is integer ✓
            const sinVal = Math.sin(t * Math.PI * 2 * shimmerCycles + i * 1.618);
            const alpha  = sinVal * sinVal;

            if (alpha < 0.01) continue;

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = glintColor;
            ctx.lineWidth = 1.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(sp.x - 3, sp.y);
            ctx.lineTo(sp.x + 3, sp.y);
            ctx.moveTo(sp.x, sp.y - 3);
            ctx.lineTo(sp.x, sp.y + 3);
            ctx.stroke();
            ctx.restore();
        }

        // ── 6. CENTER DOT ─────────────────────────────────────────────────────
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = glintColor;
        ctx.beginPath();
        ctx.arc(center.x, center.y, actualSize * 0.04, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    RR_ANIMATION_REGISTRY.push({
        id:           'frost-crystal',
        name:         'Frost Crystal',
        categoryId: 'elements',
        defaultBlend: 'screen',
        description:  'Procedural snowflake crystal with animated branching arms, ice-shimmer sparkles, and a rotating inner hexagon.',
        render:       renderFrostCrystalFrame,
        params: [
            { key: 'crystalColor', label: 'Crystal Color', type: 'color',  default: '#88ccff' },
            { key: 'glintColor', label: 'Glint Color', type: 'color',  default: '#ffffff' },
            { key: 'centerX', label: 'Center X', type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5 },
            { key: 'centerY', label: 'Center Y', type: 'slider', min: 0,   max: 1,   step: 0.02, default: 0.5 },
            { key: 'size', label: 'Size', type: 'slider', min: 0.1, max: 0.9, step: 0.02, default: 0.4 },
            { key: 'armCount', label: 'Arm Count', type: 'slider', min: 4,   max: 12,  step: 1,    default: 6 },
            { key: 'branchDepth', label: 'Branch Depth', type: 'slider', min: 1,   max: 3,   step: 1,    default: 2 },
            { key: 'shimmerCycles', label: 'Shimmer Cycles', type: 'slider', min: 1,   max: 6,   step: 1,    default: 3 },
            { key: 'sparkleCount', label: 'Sparkle Count', type: 'slider', min: 0,   max: 30,  step: 1,    default: 12 },
            { key: 'lineWidth', label: 'Line Width', type: 'slider', min: 0.5, max: 5,   step: 0.5,  default: 2.5 },
            { key: 'glowIntensity', label: 'Glow Intensity', type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.5 },
            ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -90 } : p),
        ],
        noRandomize: ['centerX', 'centerY'],
    });

}());
