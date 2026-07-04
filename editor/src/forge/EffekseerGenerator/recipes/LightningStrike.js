/**
 * Lightning Strike — REAL jagged bolt geometry, not stretched sprites.
 *
 * Three seeded random-walk bolt meshes (trunk from sky to strike point +
 * 2-3 branches peeling off downward) flash in staggered succession with a
 * white-hot core easing into the bolt color, over an impact flash, a
 * brief sky-wide sheet flash, and scattering ground sparks.
 */
RR_EFK_RECIPE_REGISTRY.push({
    id: 'lightning-strike',
    name: 'Lightning Strike',
    category: 'Elements',
    textures: ['glow_soft', 'spark'],
    params: [
        { key: 'color',  label: 'Bolt Color', type: 'color', default: '#9fd0ff' },
        { key: 'bolts',  label: 'Bolts',      type: 'range', default: 4, min: 1, max: 12, step: 1 },
        { key: 'spread', label: 'Spread',     type: 'range', default: 6, min: 0, max: 20, step: 1 },
        { key: 'size',   label: 'Size',       type: 'range', default: 14, min: 6, max: 30, step: 1 },
        { key: 'life',   label: 'Duration',   type: 'range', default: 35, min: 15, max: 80, step: 1 },
    ],

    buildModels(p, M) {
        // Seeded LCG — variants are stable across rebuilds (model cache).
        const mkBolt = (seed) => {
            let s = (seed * 2654435761) >>> 0;
            const rnd = () => {
                s = (s * 1664525 + 1013904223) >>> 0;
                return s / 4294967296;
            };
            const verts = [];
            const edges = [];
            // Trunk: jagged walk from the sky (y=1) down to the strike
            // point at the origin, jitter tapering toward the ground.
            const SEGS = 12;
            const trunk = [];
            let prev = verts.length;
            verts.push([(rnd() * 2 - 1) * 0.22, 1, (rnd() * 2 - 1) * 0.12]);
            trunk.push(prev);
            for (let i = 1; i <= SEGS; i++) {
                const t = i / SEGS;
                const amp = 0.17 * (1 - t * 0.75);
                const x = i === SEGS ? 0 : (rnd() * 2 - 1) * amp;
                const z = i === SEGS ? 0 : (rnd() * 2 - 1) * amp * 0.5;
                const idx = verts.length;
                verts.push([x, 1 - t, z]);
                edges.push([prev, idx]);
                prev = idx;
                trunk.push(idx);
            }
            // Branches fork off the upper trunk, heading down and out.
            const nBranches = 2 + Math.floor(rnd() * 2);
            for (let b = 0; b < nBranches; b++) {
                let at = trunk[2 + Math.floor(rnd() * 6)];
                let [px, py, pz] = verts[at];
                const dir = rnd() < 0.5 ? -1 : 1;
                const segs = 4 + Math.floor(rnd() * 3);
                for (let i = 0; i < segs; i++) {
                    px += dir * (0.04 + rnd() * 0.09);
                    py -= 0.05 + rnd() * 0.08;
                    pz += (rnd() * 2 - 1) * 0.05;
                    const idx = verts.length;
                    verts.push([px, py, pz]);
                    edges.push([at, idx]);
                    at = idx;
                }
            }
            return { ...M.strutFrame(verts, edges, 0.014), scale: 1 };
        };
        return [1, 2, 3].map((k) => ({ path: `Model/rr_bolt_v${k}.efkmodel`, mesh: mkBolt(k) }));
    },

    build(p) {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const { rf, rv3, v3 } = B;
        const bolt = U.hexToRgba(p.color);
        const spread = p.spread * 0.5;
        const perVariant = Math.max(1, Math.ceil(p.bolts / 3));

        // One node per bolt variant, flashing at staggered offsets.
        const boltNode = (idx) => B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
            commonValues: {
                maxGeneration: perVariant,
                life: rf(4, 7),
                generationTime: rf(Math.max(2, p.life / Math.max(1, p.bolts))),
                generationTimeOffset: rf(idx * 2, Math.max(idx * 2 + 1, Math.round(p.life * 0.55))),
            },
            generationLocation: {
                type: 0,
                location: rv3(v3(-spread, 0, -spread * 0.4), v3(spread, 0, spread * 0.4)),
            },
            scaling: {
                type: 0, refEq: -1,
                scale: v3(p.size * 0.55, p.size, p.size * 0.55),
            },
            rendererCommon: {
                colorTextureIndex: -1,
                fadeOutType: 1,
                fadeOut: { frame: 2, params: [0, 0, 0] },
            },
            rendererParams: {
                modelIndex: idx,
                // White-hot strike easing into the bolt color as it dies.
                allColor: U.easeColor({ r: 255, g: 255, b: 255, a: 255 }, { ...bolt, a: 120 }),
            },
        });

        // Impact flash at the ground.
        const impact = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: {
                maxGeneration: p.bolts,
                life: rf(5, 9),
                generationTime: rf(Math.max(2, p.life / Math.max(1, p.bolts))),
                generationTimeOffset: rf(1, Math.round(p.life * 0.55) + 1),
            },
            generationLocation: {
                type: 0,
                location: rv3(v3(-spread, 0, -spread * 0.4), v3(spread, 0, spread * 0.4)),
            },
            scaling: { type: 4, start: rf(p.size * 0.14, p.size * 0.22), end: rf(p.size * 0.04), params: [0, 0, 0] },
            rendererCommon: {
                colorTextureIndex: 0,
                fadeOutType: 1, fadeOut: { frame: 4, params: [0, 0, 0] },
            },
            rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 230 }) },
        });

        // Brief sky-wide sheet flash behind everything.
        const sheet = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: {
                maxGeneration: Math.max(1, Math.round(p.bolts / 2)),
                life: rf(3, 5),
                generationTime: rf(Math.max(3, p.life / 3)),
                generationTimeOffset: rf(0, Math.round(p.life * 0.5)),
            },
            translation: { type: 0, refEq: -1, position: v3(0, p.size * 0.55, 0) },
            scaling: { type: 0, refEq: -1, scale: v3(p.size * 1.6, p.size * 1.2, 1) },
            rendererCommon: {
                colorTextureIndex: 0,
                fadeOutType: 1, fadeOut: { frame: 2, params: [0, 0, 0] },
            },
            rendererParams: { allColor: U.fixedColor({ ...bolt, a: 46 }) },
        });

        // Scatter sparks kicked up from the strike points.
        const sparks = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
            commonValues: {
                maxGeneration: p.bolts * 5,
                life: rf(8, 22),
                generationTime: rf(Math.max(0.4, p.life / (p.bolts * 5))),
                generationTimeOffset: rf(1, Math.round(p.life * 0.6)),
            },
            generationLocation: {
                type: 0,
                location: rv3(v3(-spread, 0, -spread * 0.4), v3(spread, 0.2, spread * 0.4)),
            },
            translation: {
                type: 1,
                refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                location: rv3(0),
                velocity: rv3(v3(-0.1, 0.12, -0.1), v3(0.1, 0.3, 0.1)),
                acceleration: rv3(v3(0, -0.02, 0)),
            },
            scaling: { type: 4, start: rf(0.25, 0.6), end: rf(0), params: [0, 0, 0] },
            rendererCommon: { colorTextureIndex: 1 },
            rendererParams: { allColor: U.easeColor({ r: 255, g: 255, b: 255, a: 255 }, { ...bolt, a: 0 }) },
        });

        return [sheet, boltNode(0), boltNode(1), boltNode(2), impact, sparks];
    },
});
