/**
 * Wind Gust — staged composition (pro grammar): a passing pressure front:
 * leading shimmer → layered horizontal streak waves → curling air
 * tendrils → swept-up leaf-glints and trailing dust.
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'wind-gust',
    name: 'Wind Gust',
    category: 'Elements',
    textures: ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'smoke'],
    params: [
        { key: 'color',  label: 'Air Color',   type: 'color',  default: '#bfe8dd' },
        { key: 'count',  label: 'Streaks',     type: 'range',  default: 18, min: 6, max: 60, step: 1 },
        { key: 'size',   label: 'Size',        type: 'range',  default: 10, min: 3, max: 30, step: 1 },
        { key: 'speed',  label: 'Gust Speed',  type: 'range',  default: 10, min: 3, max: 24, step: 1 },
        { key: 'life',   label: 'Duration',    type: 'range',  default: 45, min: 20, max: 100, step: 1 },
        { key: 'debris', label: 'Swept Debris', type: 'toggle', default: true },
    ],
    build(p) {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const L = RR_EfkLayers;
        const { rf, rv3, v3 } = B;
        const air = U.hexToRgba(p.color);
        const D = p.life;
        const vx = p.speed * 0.012;

        // Horizontal streak wave: spawns on the left, races right, fading.
        const streakWave = (o) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: {
                translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                maxGeneration: o.count,
                life: rf(Math.round(o.travel * 0.7), o.travel),
                generationTime: rf(o.cadence),
                generationTimeOffset: rf(o.start || 0),
            },
            generationLocation: { type: 0, location: rv3(v3(-4.5, -o.band, -1), v3(-2.5, o.band, 1)) },
            translation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                location: rv3(0),
                velocity: rv3(v3(o.vx * 0.8, -0.004, -0.004), v3(o.vx * 1.25, 0.004, 0.004)),
                acceleration: rv3(0),
            },
            rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
            scaling: { type: 0, refEq: -1, scale: v3(o.w, o.len, 1) },
            rendererCommon: {
                colorTextureIndex: 3,
                fadeInType: 1, fadeIn: { frame: 4, params: [0, 0, 0] },
                fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] },
            },
            rendererParams: { allColor: L.fixed(o.color, o.alpha) },
        });

        const children = [
            // Leading pressure shimmer
            L.flash({ tex: 0, color: air, size: 3.5, from: 2, to: 5, start: 0,
                      duration: Math.round(D * 0.35), alpha: 70, blend: 2 }),
            // Three streak waves at staggered heights/speeds (depth layering)
            streakWave({ count: p.count, cadence: Math.max(0.5, D / p.count), travel: Math.round(D * 0.6),
                         vx, band: 1.6, w: 0.5, len: 2.6, color: air, alpha: 190, start: 0 }),
            streakWave({ count: Math.round(p.count * 0.6), cadence: Math.max(0.7, D / p.count * 1.5),
                         travel: Math.round(D * 0.55), vx: vx * 1.3, band: 1.0, w: 0.3, len: 1.8,
                         color: { r: 255, g: 255, b: 255 }, alpha: 140, start: 2 }),
            streakWave({ count: Math.round(p.count * 0.5), cadence: Math.max(0.8, D / p.count * 2),
                         travel: Math.round(D * 0.7), vx: vx * 0.7, band: 2.2, w: 0.7, len: 3.2,
                         color: U.dim(air, 0.75), alpha: 90, start: 4 }),
            // Curling air tendrils riding the gust
            L.tendrils({ tex: 0, color: air, count: 4, speed: vx * 0.8, curl: 0.035, tail: 20,
                         width: 0.1, start: 3, duration: Math.round(D * 0.8), alpha: 150 }),
        ];
        if (p.debris) {
            children.push(L.burst({ tex: 4, color: { r: 235, g: 240, b: 225 }, count: 12, size: 0.22,
                                    speed: vx * 0.9, gravity: -0.0006, start: 4, duration: D,
                                    lifeJitter: 0.5 }));
            children.push(L.puffs({ tex: 5, color: U.dim(air, 0.6), count: 5, size: 1.4, area: 1.4,
                                    rise: 0.008, alpha: 55, start: Math.round(D * 0.25),
                                    duration: Math.round(D * 0.9) }));
        }

        const S = p.size * 0.09;
        return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
            commonValues: {
                translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                maxGeneration: 1, life: rf(Math.round(D * 2.2) + 30), removeWhenChildrenIsExtinct: 1,
            },
            scaling: { type: 0, refEq: -1, scale: v3(S, S, S) },
            children,
        })];
    },
});
