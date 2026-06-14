function renderAuroraFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = frameIdx / totalFrames;
    ctx.clearRect(0, 0, w, h);

    const color1         = params.color1         !== undefined ? params.color1         : '#00ffaa';
    const color2         = params.color2         !== undefined ? params.color2         : '#4400ff';
    const color3         = params.color3         !== undefined ? params.color3         : '#00aaff';
    const bandCount      = params.bandCount      !== undefined ? params.bandCount      : 5;
    const waveCycles     = params.waveCycles     !== undefined ? params.waveCycles     : 2;
    const shimmerCycles  = params.shimmerCycles  !== undefined ? params.shimmerCycles  : 3;
    const verticalExtent = params.verticalExtent !== undefined ? params.verticalExtent : 0.7;
    const opacity        = params.opacity        !== undefined ? params.opacity        : 0.75;
    const starCount      = params.starCount      !== undefined ? params.starCount      : 20;

    const effectRadius = Math.min(w, h) * 0.5;
    const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
    const proj3 = (lx, ly, lz) => {
        const r = transform([lx, ly, lz]);
        const d = 3.5;
        const dz = d - r[2];
        const s = dz > 0.15 ? d / dz : d / 0.15;
        return { x: w * 0.5 + r[0] * effectRadius * s, y: h * 0.5 - r[1] * effectRadius * s, z: r[2] };
    };

    const STEPS  = 30;
    const colors = [color1, color2, color3];

    // Build projected left/right edge arrays for one vertical curtain
    function buildCurtain(i) {
        const rnd         = Math.abs(Math.sin(i * 127.1 + 311.7));
        const bandCenterX = ((i + 0.5) / bandCount - 0.5) * 2.0;
        const bandWidth   = (0.9 / bandCount) * (0.7 + 0.6 * rnd);
        const curtainH    = verticalExtent * (0.6 + 0.4 * rnd);
        const left = [], right = [];
        for (let s = 0; s <= STEPS; s++) {
            const v      = s / STEPS;
            const yLocal = 1.0 - v * curtainH * 2.0;
            const sway   = Math.sin(v * Math.PI * 3   + t * Math.PI * 2 * waveCycles       + i * 1.3) * 0.15
                         + Math.sin(v * Math.PI * 5.5 + t * Math.PI * 2 * (waveCycles + 1) + i * 0.7) * 0.08;
            left.push( proj3(bandCenterX - bandWidth + sway, yLocal, 0));
            right.push(proj3(bandCenterX + bandWidth + sway, yLocal, 0));
        }
        return { left, right, rnd };
    }

    // Precompute all curtains (used by both render passes)
    const curtains = [];
    for (let i = 0; i < bandCount; i++) curtains.push(buildCurtain(i));

    // Stars scattered in upper sky
    for (let i = 0; i < starCount; i++) {
        const sx = (Math.sin(i * 7.3) * 0.6 + Math.cos(i * 13.7) * 0.3) * 1.6;
        const sy = 0.75 + Math.abs(Math.sin(i * 5.1)) * 0.3;
        const sz = (Math.cos(i * 3.7) * 0.5 + Math.sin(i * 9.2) * 0.5) * 0.8;
        const pt = proj3(sx, sy, sz);
        const twinkle   = 0.4 + 0.6 * Math.abs(Math.sin(t * Math.PI * 2 * shimmerCycles + i * 0.43));
        const starAlpha = Math.max(0, Math.min(1, twinkle * 0.85));
        const size      = 0.8 + Math.abs(Math.sin(i * 3.7)) * 0.9;
        ctx.save();
        ctx.globalAlpha = starAlpha;
        ctx.fillStyle   = '#ffffff';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // Glow pass — full curtain polygon, blurred, behind crisp pass
    ctx.save();
    ctx.filter = 'blur(7px)';
    for (let i = 0; i < bandCount; i++) {
        const { left, right } = curtains[i];
        const baseAlpha = opacity * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * shimmerCycles + i * 0.91));
        const glowAlpha = Math.max(0, Math.min(1, baseAlpha * 0.55));
        ctx.save();
        ctx.globalAlpha = glowAlpha;
        ctx.fillStyle   = colors[i % 3];
        ctx.beginPath();
        ctx.moveTo(left[0].x,  left[0].y);
        for (let s = 1; s <= STEPS; s++) ctx.lineTo(left[s].x,  left[s].y);
        for (let s = STEPS; s >= 0; s--) ctx.lineTo(right[s].x, right[s].y);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();

    // Crisp pass — thin horizontal strips with vertical alpha fade (bright at top, fades at bottom)
    for (let i = 0; i < bandCount; i++) {
        const { left, right } = curtains[i];
        const baseAlpha = opacity * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * shimmerCycles + i * 0.91));
        const colorT    = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * shimmerCycles + i * 1.1);

        for (let s = 0; s < STEPS; s++) {
            const vMid       = (s + 0.5) / STEPS;
            const fade       = Math.pow(1.0 - vMid, 1.5);
            const stripAlpha = Math.max(0, Math.min(1, baseAlpha * fade));
            if (stripAlpha < 0.004) continue;

            ctx.save();
            ctx.globalAlpha = stripAlpha;
            ctx.fillStyle   = colors[i % 3];
            ctx.beginPath();
            ctx.moveTo(left[s].x,    left[s].y);
            ctx.lineTo(left[s+1].x,  left[s+1].y);
            ctx.lineTo(right[s+1].x, right[s+1].y);
            ctx.lineTo(right[s].x,   right[s].y);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            const altAlpha = Math.max(0, Math.min(1, stripAlpha * colorT * 0.45));
            if (altAlpha >= 0.004) {
                ctx.save();
                ctx.globalAlpha = altAlpha;
                ctx.fillStyle   = colors[(i + 1) % 3];
                ctx.beginPath();
                ctx.moveTo(left[s].x,    left[s].y);
                ctx.lineTo(left[s+1].x,  left[s+1].y);
                ctx.lineTo(right[s+1].x, right[s+1].y);
                ctx.lineTo(right[s].x,   right[s].y);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        }
    }
}

RR_ANIMATION_REGISTRY.push({
    id:           'aurora',
    name:         'Aurora',
    categoryId:   'effect',
    defaultBlend: 'screen',
    description:  'Shimmering northern lights — 3D vertical curtain bands hanging from the sky, undulating and fading downward.',
    noRandomize:  [],
    render:       renderAuroraFrame,
    params: [
        { key: 'color1',         label: 'Color 1',         type: 'color',                                          default: '#00ffaa' },
        { key: 'color2',         label: 'Color 2',         type: 'color',                                          default: '#4400ff' },
        { key: 'color3',         label: 'Color 3',         type: 'color',                                          default: '#00aaff' },
        { key: 'bandCount',      label: 'Band Count',      type: 'slider', min: 2,   max: 10,  step: 1,    default: 5    },
        { key: 'waveCycles',     label: 'Wave Cycles',     type: 'slider', min: 1,   max: 4,   step: 1,    default: 2    },
        { key: 'shimmerCycles',  label: 'Shimmer Cycles',  type: 'slider', min: 1,   max: 6,   step: 1,    default: 3    },
        { key: 'verticalExtent', label: 'Vertical Extent', type: 'slider', min: 0.2, max: 1.0, step: 0.05, default: 0.7  },
        { key: 'opacity',        label: 'Opacity',         type: 'slider', min: 0.1, max: 1.0, step: 0.05, default: 0.75 },
        { key: 'starCount',      label: 'Star Count',      type: 'slider', min: 0,   max: 60,  step: 1,    default: 20   },
        ...SYMBOL3D_ROTATION_PARAMS
    ]
});
