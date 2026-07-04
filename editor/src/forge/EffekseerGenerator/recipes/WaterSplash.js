/**
 * Water Splash — staged composition (pro grammar): impact flash → crown
 * ring pair → droplet fountain with glint dust → fine spray → translucent
 * water body → settling ripple, drifting droplets, and mist.
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'water-splash',
    name: 'Water Splash',
    category: 'Elements',
    textures: ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'smoke'],
    params: [
        { key: 'color',  label: 'Water Color',  type: 'color',  default: '#5fb4ff' },
        { key: 'foam',   label: 'Foam Color',   type: 'color',  default: '#eaf6ff' },
        { key: 'count',  label: 'Droplets',     type: 'range',  default: 30, min: 8, max: 90, step: 1 },
        { key: 'size',   label: 'Size',         type: 'range',  default: 10, min: 3, max: 30, step: 1 },
        { key: 'life',   label: 'Duration',     type: 'range',  default: 50, min: 20, max: 100, step: 1 },
        { key: 'mist',   label: 'Mist',         type: 'toggle', default: true },
    ],
    build(p) {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const L = RR_EfkLayers;
        const { rf, v3 } = B;
        const water = U.hexToRgba(p.color);
        const foam = U.hexToRgba(p.foam);
        const D = p.life;

        const children = [
            // Act 1 — impact
            L.flash({ tex: 0, color: foam, size: 4.5, start: 0, duration: Math.round(D * 0.2), alpha: 220 }),
            L.shockRing({ tex: 2, color: foam, size: 7, width: 0.1, count: 2, cadence: 6,
                          start: 0, duration: Math.round(D * 0.45), billboard: 2 }),
            // Act 2 — crown fountain: big droplets + fine spray, both dusted
            L.burst({ tex: 1, color: foam, color2: water, count: p.count, size: 0.6, speed: 0.05,
                      gravity: 0.0042, up: true, start: 1, duration: D, lifeJitter: 0.4,
                      fadeOut: Math.round(D * 0.2), dust: { tex: 4, color: foam, size: 0.2 } }),
            L.burst({ tex: 4, color: foam, count: Math.round(p.count * 0.8), size: 0.25, speed: 0.075,
                      gravity: 0.0036, up: true, start: 2, duration: D, lifeJitter: 0.5 }),
            // Body — translucent water mass (normal blend) + inner shimmer
            L.glow({ tex: 0, color: U.dim(water, 0.6), size: 3.2, blend: 1, alpha: 90,
                     start: 1, duration: Math.round(D * 0.7), fadeIn: 3, fadeOut: Math.round(D * 0.35) }),
            L.glow({ tex: 0, color: water, size: 2.2, pulseTo: 2.8, alpha: 150,
                     start: 1, duration: Math.round(D * 0.6), fadeOut: Math.round(D * 0.3) }),
            // Act 3 — settle: low wide ripple + drifting droplets
            L.shockRing({ tex: 2, color: water, size: 9, width: 0.07, count: 1,
                          start: Math.round(D * 0.35), duration: Math.round(D * 0.6), billboard: 2, alpha: 130 }),
            L.motes({ tex: 1, color: water, count: 10, size: 0.2, radius: 1.6, vy: 0.006,
                      start: Math.round(D * 0.3), duration: Math.round(D * 0.8), cadence: 3 }),
        ];
        if (p.mist) {
            children.push(L.puffs({ tex: 5, color: U.dim(water, 0.9), count: 6, size: 1.7, area: 1.1,
                                    rise: 0.012, alpha: 70, start: Math.round(D * 0.15), duration: Math.round(D * 1.2) }));
        }

        const S = p.size * 0.09;
        return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
            commonValues: {
                translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                maxGeneration: 1, life: rf(Math.round(D * 2.4) + 30), removeWhenChildrenIsExtinct: 1,
            },
            scaling: { type: 0, refEq: -1, scale: v3(S, S, S) },
            children,
        })];
    },
});
