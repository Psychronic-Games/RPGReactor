/**
 * Ice Shards — staged composition (pro grammar): crystallization snap →
 * crystalline ring → shard spray with glint dust → icy body sheen →
 * weightless hanging glitter and sinking freezing mist.
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'ice-shards',
    name: 'Ice Shards',
    category: 'Elements',
    textures: ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'smoke', 'shard'],
    params: [
        { key: 'color',  label: 'Ice Color',     type: 'color',  default: '#9fd8ff' },
        { key: 'deep',   label: 'Deep Ice',      type: 'color',  default: '#3a6fd8' },
        { key: 'count',  label: 'Shards',        type: 'range',  default: 22, min: 6, max: 70, step: 1 },
        { key: 'size',   label: 'Size',          type: 'range',  default: 10, min: 3, max: 30, step: 1 },
        { key: 'life',   label: 'Duration',      type: 'range',  default: 48, min: 20, max: 100, step: 1 },
        { key: 'mist',   label: 'Freezing Mist', type: 'toggle', default: true },
    ],
    buildModels(p, M) {
        // Jagged irregular crystals — random per-vertex radii, kinked
        // waist rings, off-axis tips. Two variants so the spray doesn't
        // read as clones. Deterministic PRNG: same bytes every build.
        const mkShard = (seed) => {
            let s0 = seed * 7919 + 17;
            const rnd = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
            const N = 5 + (seed % 2);
            const rings = [
                { y: -0.34 - rnd() * 0.12, r: 0.17 + rnd() * 0.09 },
                { y: 0.02 + rnd() * 0.1, r: 0.3 + rnd() * 0.12 },
                { y: 0.36 + rnd() * 0.08, r: 0.15 + rnd() * 0.08 },
            ];
            const verts = [], ringIdx = [];
            for (const ring of rings) {
                const row = [];
                for (let i = 0; i < N; i++) {
                    const a = (i / N) * Math.PI * 2 + rnd() * 0.3;
                    const rr = ring.r * (0.65 + rnd() * 0.7);
                    row.push(verts.length);
                    verts.push([Math.cos(a) * rr, ring.y + (rnd() - 0.5) * 0.07, Math.sin(a) * rr]);
                }
                ringIdx.push(row);
            }
            const tipB = verts.length;
            verts.push([(rnd() - 0.5) * 0.14, -0.8 - rnd() * 0.25, (rnd() - 0.5) * 0.14]);
            const tipT = verts.length;
            verts.push([(rnd() - 0.5) * 0.14, 0.85 + rnd() * 0.3, (rnd() - 0.5) * 0.14]);
            const facePolys = [];
            for (let k = 0; k + 1 < ringIdx.length; k++) {
                const a = ringIdx[k], b = ringIdx[k + 1];
                for (let i = 0; i < N; i++) {
                    const j = (i + 1) % N;
                    facePolys.push([a[i], a[j], b[j], b[i]]);
                }
            }
            for (let i = 0; i < N; i++) {
                const j = (i + 1) % N;
                facePolys.push([ringIdx[0][j], ringIdx[0][i], tipB]);
                facePolys.push([ringIdx[2][i], ringIdx[2][j], tipT]);
            }
            // Flat-shaded facets, wound outward (culling-safe).
            const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
            const crossV = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
            const vertices = [], faces = [];
            for (const poly of facePolys) {
                let pts = poly.map((i) => verts[i]);
                let n = crossV(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
                const len = Math.hypot(n[0], n[1], n[2]) || 1;
                n = [n[0] / len, n[1] / len, n[2] / len];
                const c = pts.reduce((acc, q) => [acc[0] + q[0], acc[1] + q[1], acc[2] + q[2]], [0, 0, 0]).map((x) => x / pts.length);
                if (n[0] * c[0] + n[1] * c[1] + n[2] * c[2] < 0) {
                    pts = pts.slice().reverse();
                    n = [-n[0], -n[1], -n[2]];
                }
                const base = vertices.length;
                pts.forEach((q) => vertices.push({ p: q, n, uv: [0.5, 0.5] }));
                for (let i = 2; i < pts.length; i++) faces.push([base, base + i - 1, base + i]);
            }
            return { vertices, faces, scale: 1 };
        };
        return [
            { path: 'Model/rr_ice_shard_a1.efkmodel', mesh: mkShard(1) },
            { path: 'Model/rr_ice_shard_b1.efkmodel', mesh: mkShard(2) },
        ];
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
            // Act 2 — REAL 3D shards: jagged crystal models tumbling out
            ...[0, 1].map((mi) => B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: {
                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                    maxGeneration: Math.ceil(p.count / 2),
                    life: rf(Math.round(D * 0.6), D),
                    generationTime: rf(0.6),
                    generationTimeOffset: rf(1 + mi),
                },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(-0.3, -0.2, -0.3), v3(0.3, 0.3, 0.3)),
                    velocity: rv3(v3(-0.09, -0.015, -0.09), v3(0.09, 0.1, 0.09)),
                    acceleration: rv3(v3(0, -0.0028, 0)),
                },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(-3.1, -3.1, -3.1), v3(3.1, 3.1, 3.1)),
                    velocity: rv3(v3(-0.1, -0.1, -0.1), v3(0.1, 0.1, 0.1)),
                    acceleration: rv3(0),
                },
                scaling: { type: 3, position: rf(0.9, 1.7), velocity: rf(-0.004), acceleration: rf(0) },
                rendererCommon: {
                    colorTextureIndex: -1,
                    alphaBlend: 1,
                    zWrite: 1,
                    fadeOutType: 1, fadeOut: { frame: Math.round(D * 0.2), params: [0, 0, 0] },
                },
                rendererParams: {
                    modelIndex: mi,
                    allColor: U.easeColor({ ...WHITE, a: 245 }, { ...deep, a: 170 }),
                },
                children: [L.dust({ tex: 4, color: WHITE, size: 0.22, count: 4 })],
            })),
            // crisp crystalline slivers glittering through the spray
            L.burst({ tex: 6, color: WHITE, color2: ice, count: Math.round(p.count * 0.7), size: 0.85,
                      speed: 0.055, gravity: 0.002, start: 1, duration: Math.round(D * 0.9),
                      cadence: 0.3, fadeOut: 8 }),
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

        const S = p.size * 0.13;
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
