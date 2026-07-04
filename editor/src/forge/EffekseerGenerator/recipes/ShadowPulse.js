/**
 * Shadow Pulse — a dark detonation in four acts:
 *   gather   (contracting violet ring + swelling black heart)
 *   pulse    (black shockwave with violet rim, filament star, glint spray)
 *   writhe   (shadow flames licking up, curling tendrils, orbiting glints)
 *   dissolve (gloom drifts up and thins)
 * The darkness is NORMAL-blend near-black (it eats the backdrop, like the
 * black hole's horizon); everything violet is additive so the effect reads
 * on any background.
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'shadow-pulse',
    name: 'Shadow Pulse',
    category: 'Elements',
    textures: ['ring_soft', 'smoke', 'glow_soft', 'noise', 'rays', 'spark'],
    params: [
        { key: 'color',  label: 'Shadow Color', type: 'color', default: '#7a3ccf' },
        { key: 'radius', label: 'Radius',       type: 'range', default: 7, min: 2, max: 16, step: 1 },
        { key: 'gloom',  label: 'Gloom',        type: 'range', default: 6, min: 0, max: 20, step: 1 },
        { key: 'life',   label: 'Duration',     type: 'range', default: 55, min: 25, max: 110, step: 1 },
    ],
    build(p) {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const L = RR_EfkLayers;
        const { rf, rv3, v3 } = B;
        const violet = U.hexToRgba(p.color);
        const dim = U.dim(violet, 0.4);
        const WHITE = { r: 255, g: 255, b: 255 };
        const INK = { r: 4, g: 2, b: 8 };
        const D = p.life;
        const R = p.radius;
        const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

        // ── act 1: GATHER — a violet ring contracts into the heart
        const gather = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
            commonValues: { ...bindAlways, maxGeneration: 1, life: rf(Math.round(D * 0.18)) },
            scaling: { type: 4, start: rf(R * 0.6), end: rf(R * 0.07), params: [0, 0, 1] },
            rendererCommon: {
                colorTextureIndex: 0, alphaBlend: 2,
                fadeInType: 1, fadeIn: { frame: 3, params: [0, 0, 0] },
            },
            rendererParams: {
                billboard: 2, vertexCount: 48,
                outerLocation: { type: 0, location: { x: 1.15, y: 0 } },
                innerLocation: { type: 0, location: { x: 0.85, y: 0 } },
                outerColor: L.fixed(violet, 0),
                centerColor: L.fixed(violet, 190),
                innerColor: L.fixed(WHITE, 120),
            },
        });

        // ── act 2: PULSE — black wave, violet rim, filament star
        const t0 = Math.round(D * 0.16);   // detonation frame
        const inkWave = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
            commonValues: { ...bindAlways, maxGeneration: 2, life: rf(Math.round(D * 0.42)),
                            generationTime: rf(Math.round(D * 0.2)), generationTimeOffset: rf(t0) },
            scaling: { type: 4, start: rf(R * 0.08), end: rf(R * 0.62), params: [0, 0, 1] },
            rendererCommon: {
                colorTextureIndex: 0, alphaBlend: 1,   // darkness swallows
                fadeOutType: 1, fadeOut: { frame: Math.round(D * 0.2), params: [0, 0, 0] },
            },
            rendererParams: {
                billboard: 2, vertexCount: 48,
                outerLocation: { type: 0, location: { x: 1.25, y: 0 } },
                innerLocation: { type: 0, location: { x: 0.7, y: 0 } },
                outerColor: L.fixed(INK, 0),
                centerColor: L.fixed(INK, 235),
                innerColor: L.fixed(INK, 40),
            },
        });
        const kids = [
            gather,
            inkWave,
            L.shockRing({ tex: 0, color: violet, size: R * 2.6, from: R * 0.4, width: 0.1,
                          start: t0, duration: Math.round(D * 0.4), alpha: 220 }),
            L.shockRing({ tex: 0, color: WHITE, size: R * 2.0, from: R * 0.3, width: 0.06,
                          start: t0 + 2, duration: Math.round(D * 0.3), alpha: 150 }),
            L.flash({ tex: 4, color: violet, from: R * 0.6, to: R * 1.1, size: R * 0.9,
                      start: t0, duration: Math.round(D * 0.3), alpha: 235, fadeOut: Math.round(D * 0.16) }),
            L.flash({ tex: 4, color: WHITE, from: R * 0.55, to: R * 1.0, size: R * 0.8,
                      start: t0, duration: 10, alpha: 200, fadeOut: 7 }),
        ];

        // Anti-glow heart: hard black orb + light-swallowing halo with a
        // breathing violet rim (regenerating crossfade layers).
        const heart = (size, tex, color, alpha, cycle, offset) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(cycle),
                            generationTime: rf(Math.round(cycle / 2)), generationTimeOffset: rf(offset || t0) },
            scaling: { type: 4, start: rf(size * 0.82), end: rf(size * 1.12), params: [0, 0, 1] },
            rendererCommon: {
                colorTextureIndex: tex, alphaBlend: color === INK ? 1 : 2,
                fadeInType: 1, fadeIn: { frame: Math.round(cycle * 0.35), params: [0, 0, 0] },
                fadeOutType: 1, fadeOut: { frame: Math.round(cycle * 0.4), params: [0, 0, 0] },
            },
            rendererParams: { allColor: L.fixed(color, alpha) },
        });
        const heartWrap = B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
            commonValues: { ...bindAlways, maxGeneration: 1, generationTimeOffset: rf(t0), life: rf(Math.round(D * 0.7)) },
            children: [
                heart(R * 1.0, 2, INK, 245, 34, 0),
                heart(R * 1.25, 1, INK, 190, 46, 0),
                heart(R * 1.1, 3, violet, 130, 40, 13),
                heart(R * 0.85, 2, violet, 110, 28, 7),
            ],
        });
        kids.push(heartWrap);

        // ── act 3: WRITHE — shadow flames, tendrils, orbiting glints
        if (p.gloom > 0) {
            kids.push(L.puffs({ tex: 1, color: INK, count: p.gloom + 4, size: R * 0.8, area: R * 0.85,
                                rise: 0.035, alpha: 210, start: t0, duration: Math.round(D * 0.75),
                                cadence: 1.4, fadeOut: Math.round(D * 0.3) }));
            kids.push(L.puffs({ tex: 3, color: dim, count: Math.round(p.gloom * 0.7), size: R * 0.55,
                                area: R * 0.7, rise: 0.05, alpha: 130, start: t0 + 4,
                                duration: Math.round(D * 0.7), cadence: 1.8, fadeOut: Math.round(D * 0.28) }));
        }
        kids.push(L.tendrils({ tex: 2, color: violet, count: 9, speed: 0.09, curl: 0.06, tail: 22,
                               width: 0.22, start: t0, duration: Math.round(D * 0.6), alpha: 200 }));
        kids.push(L.motes({ tex: 5, color: violet, count: 16, size: 0.5, radius: R * 1.4, vy: 0.018,
                            start: t0, duration: Math.round(D * 0.8), cadence: 1.2, alpha: 235 }));

        return [L.act({ duration: D + 25 }, kids)];
    },
});
