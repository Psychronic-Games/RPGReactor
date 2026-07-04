/**
 * Ice Shards — staged composition (pro grammar): crystallization snap →
 * crystalline ring → shard spray with glint dust → icy body sheen →
 * weightless hanging glitter and sinking freezing mist.
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'ice-shards',
    name: 'Ice Shards',
    category: 'Elements',
    textures: ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'smoke'],
    params: [
        { key: 'color',  label: 'Ice Color',     type: 'color',  default: '#9fd8ff' },
        { key: 'deep',   label: 'Deep Ice',      type: 'color',  default: '#3a6fd8' },
        { key: 'count',  label: 'Shards',        type: 'range',  default: 22, min: 6, max: 70, step: 1 },
        { key: 'size',   label: 'Size',          type: 'range',  default: 10, min: 3, max: 30, step: 1 },
        { key: 'life',   label: 'Duration',      type: 'range',  default: 48, min: 20, max: 100, step: 1 },
        { key: 'mist',   label: 'Freezing Mist', type: 'toggle', default: true },
    ],
    buildModels(p, M) {
        // A real 3D crystal: elongated hexagonal bipyramid. Tumbling
        // through PVA rotation these read as ice — billboards never do.
        const verts = [];
        const N = 6, R = 0.15;
        for (const sgn of [-1, 1]) {
            for (let i = 0; i < N; i++) {
                const a = (i / N) * Math.PI * 2;
                verts.push([Math.cos(a) * R, sgn * 0.2, Math.sin(a) * R]);
            }
        }
        const tipB = verts.length; verts.push([0, -0.62, 0]);
        const tipT = verts.length; verts.push([0, 0.62, 0]);
        const faces = [];
        for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            faces.push([i, j, N + j], [i, N + j, N + i]);       // waist
            faces.push([N + i, N + j, tipT]);                    // upper facet
            faces.push([j, i, tipB]);                            // lower facet
        }
        const vertices = verts.map((q) => {
            const l = Math.hypot(q[0], q[2]) || 1;
            return { p: q, n: [q[0] / l, q[1] * 0.4, q[2] / l], uv: [0.5, 0.5] };
        });
        return [{ path: 'Model/rr_ice_crystal.efkmodel', mesh: { vertices, faces, scale: 1 } }];
    },

    build(p) {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const L = RR_EfkLayers;
        const { rf, rv3, v3 } = B;
        const ice = U.hexToRgba(p.color);
        const deep = U.hexToRgba(p.deep);
        const WHITE = { r: 245, g: 252, b: 255 };
        const D = p.life;

        const children = [
            // Act 1 — crystallization snap
            L.flash({ tex: 4, color: WHITE, size: 6, start: 0, duration: Math.round(D * 0.18), alpha: 250 }),
            L.flash({ tex: 0, color: ice, size: 5, from: 2, to: 6, start: 1, duration: Math.round(D * 0.3), alpha: 160 }),
            L.shockRing({ tex: 2, color: ice, size: 7.5, width: 0.09, count: 1, start: 0, duration: Math.round(D * 0.35) }),
            // Act 2 — REAL 3D shards: crystal models tumbling outward
            B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: {
                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                    maxGeneration: p.count,
                    life: rf(Math.round(D * 0.6), D),
                    generationTime: rf(0.3),
                    generationTimeOffset: rf(1),
                },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(-0.3, -0.2, -0.3), v3(0.3, 0.3, 0.3)),
                    velocity: rv3(v3(-0.06, -0.01, -0.06), v3(0.06, 0.075, 0.06)),
                    acceleration: rv3(v3(0, -0.0028, 0)),
                },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(-3.1, -3.1, -3.1), v3(3.1, 3.1, 3.1)),
                    velocity: rv3(v3(-0.12, -0.12, -0.12), v3(0.12, 0.12, 0.12)),
                    acceleration: rv3(0),
                },
                scaling: { type: 3, position: rf(0.55, 1.1), velocity: rf(-0.004), acceleration: rf(0) },
                rendererCommon: {
                    colorTextureIndex: -1,
                    alphaBlend: 1,
                    zWrite: 1,
                    fadeOutType: 1, fadeOut: { frame: Math.round(D * 0.2), params: [0, 0, 0] },
                },
                rendererParams: {
                    modelIndex: 0,
                    allColor: U.easeColor({ ...WHITE, a: 245 }, { ...deep, a: 160 }),
                },
                children: [L.dust({ tex: 4, color: WHITE, size: 0.22, count: 4 })],
            }),
            L.burst({ tex: 4, color: ice, count: Math.round(p.count * 0.9), size: 0.3, speed: 0.05,
                      gravity: 0.0022, start: 2, duration: D, lifeJitter: 0.5 }),
            // Body — icy sheen: normal-blend cold mass + additive sheen
            L.glow({ tex: 0, color: U.dim(deep, 0.7), size: 3.4, blend: 1, alpha: 85,
                     start: 1, duration: Math.round(D * 0.8), fadeIn: 3, fadeOut: Math.round(D * 0.4) }),
            L.glow({ tex: 0, color: ice, size: 2.4, pulseTo: 2.9, alpha: 170,
                     start: 1, duration: Math.round(D * 0.7), fadeOut: Math.round(D * 0.35) }),
            // Act 3 — hanging glitter (slow, near-weightless — reads COLD)
            L.motes({ tex: 4, color: WHITE, count: 16, size: 0.18, radius: 1.5, vy: -0.004,
                      start: Math.round(D * 0.2), duration: Math.round(D * 1.1), cadence: 2 }),
        ];
        if (p.mist) {
            children.push(L.puffs({ tex: 5, color: U.dim(ice, 0.85), count: 6, size: 1.6, area: 1.0,
                                    rise: -0.006, alpha: 75, start: Math.round(D * 0.12), duration: Math.round(D * 1.2) }));
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
