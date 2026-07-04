/**
 * Healing Ring — expanding flat ring + rising sparkles.
 *
 *   • ring:     Y-axis-billboarded donut at the target's feet, expanding
 *               and fading over the effect's life
 *   • sparkles: star glints born on a circle, drifting upward, twinkling
 *   • motes:    soft glow dots rising inside the column
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'healing-ring',
    name: 'Healing Ring',
    category: 'Effect',
    textures: ['ring_soft', 'spark', 'glow_soft', 'streak', 'noise'],
    params: [
        { key: 'color',    label: 'Aura Color',   type: 'color', default: '#66ff99' },
        { key: 'accent',   label: 'Sparkle Color', type: 'color', default: '#ffffcc' },
        { key: 'radius',   label: 'Ring Radius',  type: 'range', default: 6, min: 2, max: 15, step: 1 },
        { key: 'count',    label: 'Sparkles',     type: 'range', default: 18, min: 4, max: 50, step: 1 },
        { key: 'life',     label: 'Duration',     type: 'range', default: 55, min: 25, max: 120, step: 1 },
    ],
    build(p) {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const L = RR_EfkLayers;
        const { rf, rv3, v3 } = B;
        const col = U.hexToRgba(p.color);
        const acc = U.hexToRgba(p.accent);
        const WHITE = { r: 255, g: 255, b: 255 };
        const D = p.life;
        const R = p.radius;
        const D2Rh = Math.PI / 180;

        // Rising light shafts around the ring — the classic heal pillars
        const shafts = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: { ...L.BIND, maxGeneration: 10, life: rf(Math.round(D * 0.45), Math.round(D * 0.6)),
                            generationTime: rf(Math.max(1, D / 12)) },
            generationLocation: { type: 3, division: 12, radius: rf(R * 0.55, R * 0.8),
                                  angleStart: rf(0), angleEnd: rf(360), circleType: 0, axisDirection: 1, angleNoize: rf(4) },
            translation: { type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1), location: rv3(0),
                           velocity: rv3(v3(0, 0.015, 0), v3(0, 0.03, 0)), acceleration: rv3(0) },
            scaling: { type: 0, refEq: -1, scale: v3(0.55, 4.2, 1) },
            rendererCommon: { colorTextureIndex: 3, alphaBlend: 2,
                fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] },
                fadeOutType: 1, fadeOut: { frame: 14, params: [0, 0, 0] } },
            rendererParams: { allColor: L.fixed(col, 185) },
        });

        const kids = [
            shafts,
            // soft green heart + mottled aura body
            L.glow({ tex: 2, color: col, size: R * 0.9, pulseTo: R * 1.05, duration: Math.round(D * 0.9),
                     alpha: 130, fadeIn: 8, fadeOut: Math.round(D * 0.4) }),
            L.glow({ tex: 4, color: col, size: R * 0.7, pulseTo: R * 0.85, start: 3, duration: Math.round(D * 0.8),
                     alpha: 120, fadeIn: 10, fadeOut: Math.round(D * 0.35) }),
            // rising sparkles: golden glints drifting up with tiny trails
            L.motes({ tex: 1, color: acc, count: p.count, size: 0.7, radius: R * 0.75, vy: 0.03,
                      duration: Math.round(D * 0.9), cadence: Math.max(0.6, D / p.count), alpha: 245, fadeIn: 6 }),
            L.motes({ tex: 1, color: WHITE, count: Math.round(p.count * 0.5), size: 0.3, radius: R * 0.5, vy: 0.045,
                      start: 4, duration: Math.round(D * 0.85), cadence: Math.max(0.8, D / p.count * 1.6), alpha: 220 }),
            // ground rings breathing outward, flat on the floor
            L.act({ duration: D + 10, tiltX: 72 * D2Rh }, [
                L.shockRing({ tex: 0, color: col, size: R * 1.15, from: R * 0.5, width: 0.12,
                              duration: Math.round(D * 0.55), alpha: 210, billboard: 2, fadeOut: Math.round(D * 0.25) }),
                L.shockRing({ tex: 0, color: acc, size: R * 1.35, from: R * 0.7, width: 0.08, start: Math.round(D * 0.22),
                              duration: Math.round(D * 0.5), alpha: 150, billboard: 2, fadeOut: Math.round(D * 0.22) }),
                L.shockRing({ tex: 0, color: WHITE, size: R * 0.65, from: R * 0.3, width: 0.2, start: Math.round(D * 0.44),
                              duration: Math.round(D * 0.45), alpha: 110, billboard: 2, fadeOut: Math.round(D * 0.2) }),
            ]),
        ];
        return [L.act({ duration: D + 20 }, kids)];
    },
});
