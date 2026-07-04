/**
 * Fire Burst — rebuilt as a staged composition (pro grammar, ~18 nodes):
 * white-hot pop → heat rings → ember fountain carrying spark dust →
 * licking flame tendrils → normal-blend body glow under an additive core
 * → late smoke and rising cinders.
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'fire-burst',
    name: 'Fire Burst',
    category: 'Elements',
    textures: ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'smoke'],
    params: [
        { key: 'color',  label: 'Flame Color', type: 'color',  default: '#ff8830' },
        { key: 'tip',    label: 'Ember Tip',   type: 'color',  default: '#ff3010' },
        { key: 'count',  label: 'Embers',      type: 'range',  default: 26, min: 6, max: 80, step: 1 },
        { key: 'size',   label: 'Size',        type: 'range',  default: 10, min: 3, max: 30, step: 1 },
        { key: 'spread', label: 'Spread',      type: 'range',  default: 10, min: 2, max: 30, step: 1 },
        { key: 'life',   label: 'Duration',    type: 'range',  default: 45, min: 20, max: 100, step: 1 },
        { key: 'smoke',  label: 'Smoke',       type: 'toggle', default: true },
    ],
    build(p) {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const L = RR_EfkLayers;
        const { rf, v3 } = B;
        const hot = U.hexToRgba(p.color);
        const tip = U.hexToRgba(p.tip);
        const WHITE = { r: 255, g: 255, b: 240 };
        const D = p.life;
        const spd = 0.012 * p.spread;

        const children = [
            // Act 1 — ignition
            L.flash({ tex: 0, color: WHITE, size: 5.5, start: 0, duration: Math.round(D * 0.22), alpha: 245 }),
            L.flash({ tex: 0, color: hot, size: 7, from: 3, to: 8.5, start: 1, duration: Math.round(D * 0.35), alpha: 170 }),
            L.shockRing({ tex: 2, color: hot, size: 8, width: 0.14, count: 2, cadence: 5, start: 0, duration: Math.round(D * 0.4) }),
            // Act 2 — ember fountain (two granularities, both dusted)
            L.burst({ tex: 1, color: hot, color2: tip, count: p.count, size: 0.85, speed: spd, gravity: 0.0022,
                      up: true, start: 1, duration: D, lifeJitter: 0.45, fadeOut: Math.round(D * 0.3),
                      dust: { tex: 4, color: WHITE } }),
            L.burst({ tex: 4, color: { r: 255, g: 220, b: 150 }, count: Math.round(p.count * 0.7), size: 0.35,
                      speed: spd * 1.4, gravity: 0.0016, up: true, start: 2, duration: D, lifeJitter: 0.5 }),
            // Act 3 — flame licks
            L.tendrils({ tex: 0, color: hot, count: 5, speed: 0.035, curl: 0.03, tail: 18, width: 0.16,
                         start: 2, duration: Math.round(D * 0.7), alpha: 220 }),
            // Body: normal-blend base gives the fire mass; additive core the heat
            L.glow({ tex: 0, color: U.dim(hot, 0.5), size: 4, blend: 1, alpha: 95,
                     start: 1, duration: Math.round(D * 0.9), fadeIn: 4, fadeOut: Math.round(D * 0.45) }),
            L.glow({ tex: 0, color: hot, size: 2.6, pulseTo: 3.4, alpha: 200,
                     start: 1, duration: Math.round(D * 0.8), fadeOut: Math.round(D * 0.4) }),
            // Act 4 — aftermath
            L.motes({ tex: 4, color: { r: 255, g: 190, b: 110 }, count: 12, size: 0.22, radius: 1.4, vy: 0.03,
                      start: Math.round(D * 0.25), duration: Math.round(D * 0.9), cadence: 2.5 }),
        ];
        if (p.smoke) {
            children.push(L.puffs({ tex: 5, color: { r: 40, g: 34, b: 30 }, count: 7, size: 2.0, area: 0.9,
                                    rise: 0.028, alpha: 115, start: Math.round(D * 0.2), duration: Math.round(D * 1.3) }));
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
