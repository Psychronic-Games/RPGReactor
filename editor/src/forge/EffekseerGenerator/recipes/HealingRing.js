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
    textures: ['ring_soft', 'spark', 'glow_soft'],
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
        const { rf, rv3, v3, v2 } = B;
        const aura = U.hexToRgba(p.color);
        const accent = U.hexToRgba(p.accent);

        const ring = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
            commonValues: { maxGeneration: 1, life: rf(p.life) },
            scaling: {
                type: 2,
                refEqS: rf(-1), refEqE: rf(-1),
                start: rv3(0.3),
                end: rv3(1.0),
                params: [0, 0, 0],   // ease-out feel comes from the fade
            },
            rendererCommon: {
                colorTextureIndex: 0,
                fadeOutType: 1,
                fadeOut: { frame: Math.round(p.life * 0.45), params: [0, 0, 0] },
            },
            rendererParams: {
                billboard: 2,   // fixed Y — lies flat on the ground
                vertexCount: 48,
                outerLocation: { type: 0, location: v2(p.radius, 0) },
                innerLocation: { type: 0, location: v2(p.radius * 0.55, 0) },
                centerRatio: { type: 0, fixed: 0.5 },
                outerColor: U.fixedColor({ ...aura, a: 0 }),
                centerColor: U.fixedColor({ ...aura, a: 210 }),
                innerColor: U.fixedColor({ ...aura, a: 0 }),
            },
        });

        const sparkles = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: {
                maxGeneration: p.count,
                life: rf(Math.round(p.life * 0.4), Math.round(p.life * 0.75)),
                generationTime: rf(1.2),
            },
            generationLocation: {
                type: 3,   // circle
                division: Math.max(8, p.count),
                radius: rf(p.radius * 0.35, p.radius * 0.9),
                angleStart: rf(0),
                angleEnd: rf(360),
                circleType: 0,
                axisDirection: 1,   // Y axis — spawn on the ground disc
                angleNoize: rf(180),
            },
            translation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                location: rv3(0),
                velocity: rv3(v3(0, 0.04, 0), v3(0, 0.12, 0)),
                acceleration: rv3(0),
            },
            scaling: {
                type: 4,   // single easing: twinkle out
                start: rf(0.6, 1.4),
                end: rf(0),
                params: [0, 0, 0],
            },
            rendererCommon: { colorTextureIndex: 1 },
            rendererParams: { allColor: U.fixedColor(accent) },
        });

        const motes = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: {
                maxGeneration: Math.max(4, Math.round(p.count / 2)),
                life: rf(Math.round(p.life * 0.5), p.life),
                generationTime: rf(2),
            },
            generationLocation: {
                type: 3,
                division: 16,
                radius: rf(0, p.radius * 0.6),
                angleStart: rf(0),
                angleEnd: rf(360),
                circleType: 0,
                axisDirection: 1,
                angleNoize: rf(180),
            },
            translation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                location: rv3(0),
                velocity: rv3(v3(0, 0.02, 0), v3(0, 0.07, 0)),
                acceleration: rv3(v3(0, 0.001, 0)),
            },
            scaling: { type: 3, position: rf(0.8, 1.8), velocity: rf(-0.01), acceleration: rf(0) },
            rendererCommon: {
                colorTextureIndex: 2,
                fadeInType: 1,
                fadeIn: { frame: 6, params: [0, 0, 0] },
                fadeOutType: 1,
                fadeOut: { frame: 12, params: [0, 0, 0] },
            },
            rendererParams: { allColor: U.fixedColor({ ...aura, a: 160 }) },
        });

        return [ring, sparkles, motes];
    },
});
