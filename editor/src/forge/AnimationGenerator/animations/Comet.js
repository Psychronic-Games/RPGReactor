(function () {
    function renderCometFrame(ctx, w, h, frameIdx, totalFrames, params) {
        const t = frameIdx / totalFrames;
        ctx.clearRect(0, 0, w, h);

        const coreColor     = params.coreColor    ?? '#ffeeaa';
        const tailColor     = params.tailColor    ?? '#4466ff';
        const angle         = params.angle        ?? -30;
        const headRadius    = params.headRadius   ?? 10;
        const tailLength    = params.tailLength   ?? 0.6;
        const tailOpacity   = params.tailOpacity  ?? 0.8;
        const sparkleCount  = params.sparkleCount ?? 20;

        const angleRad = angle * Math.PI / 180;
        const dirLX = Math.cos(angleRad);
        const dirLZ = -Math.sin(angleRad);

        const effectRadius = Math.min(w, h) * 0.5;
        const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
        const proj3 = (lx, ly, lz) => {
            const r = transform([lx, ly, lz]);
            const d = 3.5;
            const dz = d - r[2];
            const s = dz > 0.15 ? d / dz : d / 0.15;
            return { x: w*0.5 + r[0] * effectRadius * s, y: h*0.5 - r[1] * effectRadius * s, z: r[2] };
        };

        const headLX = dirLX * (t - 0.5) * 2;
        const headLZ = dirLZ * (t - 0.5) * 2;
        const headP  = proj3(headLX, 0, headLZ);

        const trailSegments    = 40;
        const tailLength_local = tailLength;

        // --- Tail ---
        for (let i = trailSegments; i >= 0; i--) {
            const frac = i / trailSegments;
            const segP = proj3(
                headLX - dirLX * frac * tailLength_local,
                0,
                headLZ - dirLZ * frac * tailLength_local
            );
            const segWidth = headRadius * (1 - frac);
            if (segWidth <= 0) continue;
            const segAlpha = Math.pow(1 - frac, 1.5) * tailOpacity;
            const segColor = mixHexColors(coreColor, tailColor, frac);
            ctx.beginPath();
            ctx.arc(segP.x, segP.y, segWidth, 0, Math.PI * 2);
            ctx.fillStyle = hexWithAlpha(segColor, segAlpha);
            ctx.fill();
        }

        // --- Sparkles ---
        const perpLX = -dirLZ;
        const perpLZ =  dirLX;
        for (let i = 0; i < sparkleCount; i++) {
            const frac    = (i + 0.5) / sparkleCount;
            const perpOff = Math.sin(i * 2.39) * (headRadius / effectRadius) * 2;
            const sparkP  = proj3(
                headLX - dirLX * frac * tailLength_local + perpLX * perpOff,
                0,
                headLZ - dirLZ * frac * tailLength_local + perpLZ * perpOff
            );
            const alpha = (1 - frac) * (0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3 + i * 1.7)) * 0.8;
            const size  = headRadius * (0.1 + 0.15 * (1 - frac));
            ctx.beginPath();
            ctx.arc(sparkP.x, sparkP.y, size, 0, Math.PI * 2);
            ctx.fillStyle = hexWithAlpha(coreColor, alpha);
            ctx.fill();
        }

        // --- Nucleus glow ---
        ctx.save();
        ctx.filter = `blur(${headRadius}px)`;
        ctx.beginPath();
        ctx.arc(headP.x, headP.y, headRadius * 2, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(coreColor, 0.7);
        ctx.fill();
        ctx.restore();

        // --- Nucleus core ---
        ctx.beginPath();
        ctx.arc(headP.x, headP.y, headRadius, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(coreColor, 1.0);
        ctx.fill();

        // --- Inner hotspot ---
        ctx.beginPath();
        ctx.arc(headP.x, headP.y, headRadius * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha('#ffffff', 0.9);
        ctx.fill();
    }

    RR_ANIMATION_REGISTRY.push({
        id:           'comet',
        name:         'Comet',
        categoryId:   'elements',
        defaultBlend: 'lighter',
        description:  'Streaking comet with a glowing nucleus, tapered particle tail, and sparkling debris trail.',
        noRandomize:  [],
        params: [
            { key: 'coreColor',    label: 'Core Color',    type: 'color',  default: '#ffeeaa' },
            { key: 'tailColor',    label: 'Tail Color',    type: 'color',  default: '#4466ff' },
            { key: 'angle',        label: 'Angle (deg)',   type: 'slider', min: -180, max: 180, step: 5,    default: -30 },
            { key: 'headRadius',   label: 'Head Radius',   type: 'slider', min: 2,    max: 30,  step: 1,    default: 10  },
            { key: 'tailLength',   label: 'Tail Length',   type: 'slider', min: 0.1,  max: 1.5, step: 0.05, default: 0.6 },
            { key: 'tailOpacity',  label: 'Tail Opacity',  type: 'slider', min: 0,    max: 1,   step: 0.05, default: 0.8 },
            { key: 'sparkleCount', label: 'Sparkles',      type: 'slider', min: 0,    max: 40,  step: 1,    default: 20  },
            ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -60 } : p),
        ],
        render: renderCometFrame,
    });
}());
