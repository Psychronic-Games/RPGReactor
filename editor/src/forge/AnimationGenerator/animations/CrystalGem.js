(function () {
    function renderCrystalGemFrame(ctx, w, h, frameIdx, totalFrames, params) {
        const t = frameIdx / totalFrames;
        ctx.clearRect(0, 0, w, h);

        const primaryColor   = params.primaryColor   || '#cc44ff';
        const facetColor     = params.facetColor     || '#4444ff';
        const glintColor     = params.glintColor     || '#ffffff';
        const centerX        = params.centerX        !== undefined ? params.centerX        : 0.5;
        const centerY        = params.centerY        !== undefined ? params.centerY        : 0.5;
        const gemRadiusFrac  = params.gemRadius      !== undefined ? params.gemRadius      : 0.3;
        const facetCount     = Math.round(params.facetCount     !== undefined ? params.facetCount     : 6);
        const rotationCycles = Math.round(params.rotationCycles !== undefined ? params.rotationCycles : 2);
        const sparkleCount   = Math.round(params.sparkleCount   !== undefined ? params.sparkleCount   : 8);

        const cx           = centerX * w;
        const cy           = centerY * h;
        const gemRadius    = gemRadiusFrac * Math.min(w, h) / 2;
        const effectRadius = gemRadius;

        const { transform } = makeSymbol3DTransform(params, t, 0, 0, 1);
        const proj3 = (lx, ly, lz) => {
            const r = transform([lx, ly, lz]);
            const d = 3.5;
            const dz = d - r[2];
            const s = dz > 0.15 ? d / dz : d / 0.15;
            return { x: cx + r[0] * effectRadius * s, y: cy - r[1] * effectRadius * s, z: r[2] };
        };

        // Build 3D gem geometry
        const rim   = [];
        const table = [];
        for (let i = 0; i < facetCount; i++) {
            const a = (i / facetCount) * Math.PI * 2;
            rim.push(proj3(Math.cos(a),        0,   Math.sin(a)));
            table.push(proj3(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5));
        }
        const bottomPoint = proj3(0, -0.8, 0);

        function avgZ(pts) {
            let z = 0;
            for (const p of pts) z += p.z;
            return z / pts.length;
        }

        // z in [-1, 1] after transform; higher z = facing viewer = brighter
        function shadeFromZ(pts) {
            return 0.3 + 0.7 * ((avgZ(pts) + 1) / 2);
        }

        // Collect all faces for depth-sorted (painter's algorithm) rendering
        const faces = [];

        for (let i = 0; i < facetCount; i++) {
            const r0 = rim[i];
            const r1 = rim[(i + 1) % facetCount];
            const pts = [r0, r1, bottomPoint];
            faces.push({ pts, z: avgZ(pts), shade: shadeFromZ(pts), type: 'lower' });
        }

        for (let i = 0; i < facetCount; i++) {
            const t0 = table[i];
            const t1 = table[(i + 1) % facetCount];
            const r0 = rim[i];
            const r1 = rim[(i + 1) % facetCount];
            const pts = [t0, t1, r1, r0];
            faces.push({ pts, z: avgZ(pts), shade: shadeFromZ(pts), type: 'upper' });
        }

        faces.push({ pts: [...table], z: avgZ(table), shade: shadeFromZ(table), type: 'table' });

        faces.sort((a, b) => a.z - b.z);

        // 1. GLOW (screen-space diffuse, no projection)
        ctx.save();
        ctx.filter = 'blur(' + (gemRadius * 0.35).toFixed(1) + 'px)';
        ctx.beginPath();
        ctx.arc(cx, cy, gemRadius * 1.1, 0, Math.PI * 2);
        ctx.fillStyle = hexWithAlpha(primaryColor, 0.4);
        ctx.fill();
        ctx.restore();

        // 2. FACES (depth sorted)
        for (const face of faces) {
            const { pts, shade, type } = face;

            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.closePath();

            let fillColor;
            if (type === 'table') {
                fillColor = hexWithAlpha(mixHexColors(primaryColor, '#ffffff', 0.55 + shade * 0.35), 0.95);
            } else if (type === 'lower') {
                fillColor = hexWithAlpha(mixHexColors(primaryColor, facetColor, shade), 0.92);
            } else {
                fillColor = hexWithAlpha(mixHexColors(primaryColor, '#ffffff', shade * 0.6), 0.88);
            }
            ctx.fillStyle = fillColor;
            ctx.fill();
            ctx.strokeStyle = hexWithAlpha(primaryColor, 0.3);
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }

        // 3. ROTATING GLINT (orbits at top rim level)
        const glintAngle = t * Math.PI * 2 * rotationCycles;
        const gPos       = proj3(Math.cos(glintAngle) * 0.7, 0.1, Math.sin(glintAngle) * 0.7);
        const glintAlpha = 0.6 + 0.4 * Math.sin(t * Math.PI * 2 * (rotationCycles * 2));
        const gx = gPos.x, gy = gPos.y;

        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, glintAlpha));
        ctx.strokeStyle = glintColor;
        ctx.lineCap     = 'round';

        const armLen   = gemRadius * 0.3;
        const shortArm = gemRadius * 0.15;
        const d        = shortArm * 0.7071;

        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(gx - armLen, gy);        ctx.lineTo(gx + armLen, gy);        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx,           gy - armLen); ctx.lineTo(gx,           gy + armLen); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(gx - d, gy - d); ctx.lineTo(gx + d, gy + d); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(gx + d, gy - d); ctx.lineTo(gx - d, gy + d); ctx.stroke();

        ctx.beginPath();
        ctx.arc(gx, gy, gemRadius * 0.05, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();

        // 4. SPARKLE PARTICLES (projected from XZ-plane orbit)
        if (sparkleCount > 0) {
            ctx.save();
            for (let i = 0; i < sparkleCount; i++) {
                const rnd          = Math.abs(Math.sin(i * 127.1 + 31.7));
                const sparkleAngle = (i / sparkleCount) * Math.PI * 2 + t * Math.PI * 2;
                const orbitR       = 0.9 + rnd * 0.15;
                const sPos         = proj3(Math.cos(sparkleAngle) * orbitR, 0, Math.sin(sparkleAngle) * orbitR);
                const sinVal       = Math.sin(t * Math.PI * 2 * rotationCycles + i * 1.618);
                const alpha        = Math.max(0, Math.min(1, 0.4 + 0.6 * sinVal * sinVal));
                const size         = 1.5 + rnd * 1.5;

                ctx.globalAlpha = alpha;
                ctx.fillStyle   = glintColor;
                ctx.beginPath();
                ctx.arc(sPos.x, sPos.y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    RR_ANIMATION_REGISTRY.push({
        id:           'crystal-gem',
        name:         'Crystal Gem',
        categoryId:   'object',
        defaultBlend: 'source-over',
        description:  'Faceted gemstone with refracting facets, rotating light beam sparkles, and a pulsing inner glow.',
        render:       renderCrystalGemFrame,
        params: [
            { key: 'primaryColor',    label: 'Primary Color',    type: 'color',                                         default: '#cc44ff' },
            { key: 'facetColor',      label: 'Facet Color',      type: 'color',                                         default: '#4444ff' },
            { key: 'glintColor',      label: 'Glint Color',      type: 'color',                                         default: '#ffffff'  },
            { key: 'centerX',         label: 'Center X',         type: 'slider', min: 0,    max: 1,    step: 0.02,      default: 0.5       },
            { key: 'centerY',         label: 'Center Y',         type: 'slider', min: 0,    max: 1,    step: 0.02,      default: 0.5       },
            { key: 'gemRadius',       label: 'Gem Radius',       type: 'slider', min: 0.05, max: 0.5,  step: 0.02,      default: 0.3       },
            { key: 'facetCount',      label: 'Facet Count',      type: 'slider', min: 4,    max: 12,   step: 1,         default: 6         },
            { key: 'rotationCycles',  label: 'Rotation Cycles',  type: 'slider', min: 1,    max: 4,    step: 1,         default: 2         },
            { key: 'sparkleCount',    label: 'Sparkle Count',    type: 'slider', min: 0,    max: 20,   step: 1,         default: 8         },
            ...SYMBOL3D_ROTATION_PARAMS.map(p => p.key === 'tiltX' ? { ...p, default: -60 } : p)
        ],
        noRandomize: ['centerX', 'centerY']
    });
})();
