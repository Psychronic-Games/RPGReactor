/**
 * Shadow Pulse — dark expanding ring + rising gloom + violet core.
 * Effekseer counterpart of the standard Animation Generator's Shadow.
 * The gloom uses normal blend (darkens what's behind); the core rim is
 * additive violet so the effect reads on any backdrop.
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'shadow-pulse',
    name: 'Shadow Pulse',
    category: 'Elements',
    textures: ['ring_soft', 'smoke', 'glow_soft'],
    params: [
        { key: 'color',  label: 'Shadow Color', type: 'color', default: '#7a3ccf' },
        { key: 'radius', label: 'Radius',       type: 'range', default: 7, min: 2, max: 16, step: 1 },
        { key: 'gloom',  label: 'Gloom',        type: 'range', default: 6, min: 0, max: 20, step: 1 },
        { key: 'life',   label: 'Duration',     type: 'range', default: 55, min: 25, max: 110, step: 1 },
    ],
    build(p) {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const { rf, rv3, v3, v2 } = B;
        const violet = U.hexToRgba(p.color);

        const ring = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
            commonValues: { maxGeneration: 2, life: rf(Math.round(p.life * 0.6)), generationTime: rf(Math.round(p.life * 0.25)) },
            scaling: {
                type: 2,
                refEqS: rf(-1), refEqE: rf(-1),
                start: rv3(0.15),
                end: rv3(1.0),
                params: [0, 0, 0],
            },
            rendererCommon: {
                colorTextureIndex: 0,
                fadeOutType: 1,
                fadeOut: { frame: Math.round(p.life * 0.35), params: [0, 0, 0] },
            },
            rendererParams: {
                billboard: 2,
                vertexCount: 48,
                outerLocation: { type: 0, location: v2(p.radius, 0) },
                innerLocation: { type: 0, location: v2(p.radius * 0.5, 0) },
                outerColor: U.fixedColor({ ...violet, a: 0 }),
                centerColor: U.fixedColor({ ...violet, a: 200 }),
                innerColor: U.fixedColor({ ...violet, a: 0 }),
            },
        });

        const core = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: { maxGeneration: 1, life: rf(Math.round(p.life * 0.7)) },
            translation: { type: 0, refEq: -1, position: v3(0, 1.5, 0) },
            scaling: {
                type: 2,
                refEqS: rf(-1), refEqE: rf(-1),
                start: rv3(p.radius * 0.9),
                end: rv3(p.radius * 0.4),
                params: [0, 0, 0],
            },
            rendererCommon: {
                colorTextureIndex: 2,
                fadeInType: 1,
                fadeIn: { frame: 5, params: [0, 0, 0] },
                fadeOutType: 1,
                fadeOut: { frame: Math.round(p.life * 0.3), params: [0, 0, 0] },
            },
            rendererParams: { allColor: U.fixedColor({ ...U.dim(violet, 0.7), a: 160 }) },
        });

        const nodes = [ring, core];

        if (p.gloom > 0) {
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    maxGeneration: Math.max(3, p.gloom),
                    life: rf(Math.round(p.life * 0.5), p.life),
                    generationTime: rf(2),
                },
                generationLocation: {
                    type: 3,   // circle around the pulse
                    division: 12,
                    radius: rf(p.radius * 0.2, p.radius * 0.8),
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
                    velocity: rv3(v3(-0.01, 0.02, -0.01), v3(0.01, 0.08, 0.01)),
                    acceleration: rv3(0),
                },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                    velocity: rv3(v3(0, 0, -0.03), v3(0, 0, 0.03)),
                    acceleration: rv3(0),
                },
                scaling: { type: 3, position: rf(p.radius * 0.25, p.radius * 0.5), velocity: rf(0.01), acceleration: rf(0) },
                rendererCommon: {
                    colorTextureIndex: 1,
                    alphaBlend: 1,      // normal blend — actually darkens
                    fadeInType: 1,
                    fadeIn: { frame: 10, params: [0, 0, 0] },
                    fadeOutType: 1,
                    fadeOut: { frame: 15, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ r: 18, g: 8, b: 28, a: 140 }) },
            }));
        }

        return nodes;
    },
});
