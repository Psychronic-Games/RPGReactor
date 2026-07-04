/**
 * Lightning Strike — a real strike, modeled on the stock ThunderOne
 * composition: jagged textured bolt columns with white cores and colored
 * sheaths that flicker/restrike, a blinding impact star with a horizontal
 * ground flash, radial sparks, ring and lingering halo.
 */
(function () {
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'lightning-strike',
        name: 'Lightning Strike',
        category: 'Elements',
        textures: ['glow_soft', 'spark', 'bolt', 'rays', 'streak', 'ring_soft'],
        params: [
            { key: 'color',  label: 'Bolt Color', type: 'color', default: '#9fd0ff' },
            { key: 'bolts',  label: 'Bolts',      type: 'range', default: 4, min: 1, max: 12, step: 1 },
            { key: 'spread', label: 'Spread',     type: 'range', default: 6, min: 0, max: 20, step: 1 },
            { key: 'size',   label: 'Size',       type: 'range', default: 14, min: 6, max: 30, step: 1 },
            { key: 'life',   label: 'Duration',   type: 'range', default: 35, min: 15, max: 80, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const col = U.hexToRgba(p.color);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const H = p.size * 0.85;      // column height (world units)

            // One bolt column: flickering restrikes of a wide colored
            // sheath behind a thin white-hot core, both from the bolt tex.
            const boltSprite = (w, c, a) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { maxGeneration: 3, life: rf(3, 6), generationTime: rf(4, 7) },
                translation: { type: 0, refEq: -1, position: v3(0, H * 0.5, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(w, H, 1) },
                rendererCommon: { colorTextureIndex: 2, alphaBlend: 2 },
                rendererParams: { allColor: L.fixed(c, a) },
            });
            const bolts = [];
            for (let i = 0; i < p.bolts; i++) {
                const x = (i === 0 ? 0 : (Math.random() - 0.5) * p.spread * 0.55);
                const z = (i === 0 ? 0 : (Math.random() - 0.5) * p.spread * 0.3);
                bolts.push(B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: { ...L.BIND, maxGeneration: 1, generationTimeOffset: rf(i === 0 ? 0 : Math.round(Math.random() * D * 0.35)), life: rf(D) },
                    translation: { type: 0, refEq: -1, position: v3(x, 0, z) },
                    children: [
                        boltSprite(2.6, col, 120),
                        boltSprite(1.0, WHITE, 255),
                    ],
                }));
            }

            // Ground flash: hard horizontal light line (stock Thunder look)
            const groundFlash = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...L.BIND, maxGeneration: 2, life: rf(5, 9), generationTime: rf(6) },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: v3(1.4, p.size * 1.5, 1) },
                rendererCommon: { colorTextureIndex: 4, alphaBlend: 2, fadeOutType: 1, fadeOut: { frame: 4, params: [0, 0, 0] } },
                rendererParams: { allColor: L.fixed(WHITE, 235) },
            });

            const kids = [
                ...bolts,
                groundFlash,
                // impact star + halo (big, ThunderOne-scale)
                L.flash({ tex: 3, color: WHITE, from: p.size * 0.45, to: p.size * 0.85, size: p.size * 0.7, duration: 12, alpha: 255, fadeOut: 8 }),
                L.flash({ tex: 0, color: col, from: p.size * 0.5, to: p.size * 1.15, size: p.size, duration: Math.round(D * 0.7), alpha: 130, fadeOut: Math.round(D * 0.4) }),
                L.glow({ tex: 0, color: col, size: p.size * 0.5, pulseTo: p.size * 0.62, start: 3, duration: Math.round(D * 0.8), alpha: 90, fadeIn: 2, fadeOut: Math.round(D * 0.4) }),
                L.shockRing({ tex: 5, color: col, size: p.size * 0.9, from: 1.5, width: 0.1, duration: 16, alpha: 200 }),
                // radial sparks kicked up from the strike point
                L.burst({ tex: 1, color: WHITE, color2: col, count: 24, size: 0.55, speed: 0.13, up: true,
                          gravity: 0.004, duration: Math.round(D * 0.5), cadence: 0.2,
                          dust: { tex: 1, color: col, size: 0.25 } }),
                L.motes({ tex: 1, color: col, count: 12, size: 0.3, radius: 2.5, vy: 0.015, duration: D, cadence: 2 }),
            ];
            return [L.act({ duration: D + 20 }, kids)];
        },
    });
})();
