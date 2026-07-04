/**
 * Effect parity recipes — the standard Animation Generator's psychedelic
 * entries, rebuilt as native Effekseer effects:
 *
 *   • Hypnotize       — interleaved spiral-arm disc model spinning on Z
 *   • Acid Trip       — counter-rotating petal mandala layers, hue-spread
 *   • Chromatic Pulse — R/G/B expanding rings, phase-offset for fringe
 *   • Poison Miasma   — billowing toxic puffs + rising bubbles + spores
 *
 * All continuous (steady-state) effects.
 */
(function () {
    const D2R = Math.PI / 180;
    const LONG = 36000;

    const hsl = (h, s = 1, l = 0.55) => {
        const f = (n) => {
            const k = (n + h / 30) % 12;
            const a = s * Math.min(l, 1 - l);
            return Math.round(255 * (l - a * Math.max(-1, Math.min(1, Math.min(k - 3, 9 - k)))));
        };
        return { r: f(0), g: f(8), b: f(4), a: 255 };
    };

    // ── Hypnotize ────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'hypnotize',
        name: 'Hypnotize',
        category: 'Effect',
        continuous: true,
        prewarm: 10,
        textures: ['glow_soft'],
        params: [
            { key: 'color',  label: 'Stripe Color 1', type: 'color', default: '#141414' },
            { key: 'color2', label: 'Stripe Color 2', type: 'color', default: '#f0f0f0' },
            { key: 'size',   label: 'Size',           type: 'range', default: 7, min: 2, max: 16, step: 1 },
            { key: 'arms',   label: 'Spiral Arms',    type: 'range', default: 6, min: 2, max: 16, step: 2 },
            { key: 'twist',  label: 'Twist (turns)',  type: 'range', default: 2, min: 1, max: 6, step: 1 },
            { key: 'spin',   label: 'Spin (°/s)',     type: 'range', default: 60, min: -240, max: 240, step: 5 },
        ],
        buildModels(p, M) {
            // Interleaved spiral arms tiling a disc in the XY plane. Arm k
            // sweeps an angular band of 2π/arms that advances `twist` full
            // turns from center to rim. Even arms → mesh A, odd → mesh B.
            const buildArms = (parity) => {
                const vertices = [];
                const faces = [];
                const SEG = 56;
                const half = Math.PI / p.arms;
                for (let k = parity; k < p.arms; k += 2) {
                    const phase = (k / p.arms) * Math.PI * 2;
                    const base = vertices.length;
                    for (let i = 0; i <= SEG; i++) {
                        const s = i / SEG;
                        const a = phase + p.twist * Math.PI * 2 * s;
                        const r = s;
                        vertices.push(
                            { p: [Math.cos(a - half) * r, Math.sin(a - half) * r, 0], n: [0, 0, 1], uv: [0, s] },
                            { p: [Math.cos(a + half) * r, Math.sin(a + half) * r, 0], n: [0, 0, 1], uv: [1, s] },
                        );
                        if (i > 0) {
                            const q = base + (i - 1) * 2;
                            faces.push([q, q + 2, q + 3], [q, q + 3, q + 1]);
                        }
                    }
                }
                return { vertices, faces, scale: 1 };
            };
            const tag = `a${p.arms}_t${p.twist}`;
            return [
                { path: `Model/rr_hypno_${tag}_even.efkmodel`, mesh: buildArms(0) },
                { path: `Model/rr_hypno_${tag}_odd.efkmodel`, mesh: buildArms(1) },
            ];
        },
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const c1 = U.hexToRgba(p.color);
            const c2 = U.hexToRgba(p.color2);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

            const arms = (idx, col) => B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: -1, alphaBlend: 1 },   // opaque stripes
                rendererParams: { modelIndex: idx, allColor: U.fixedColor({ ...col, a: 255 }) },
            });

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(0),
                    velocity: rv3(v3(0, 0, p.spin * D2R / 60)),
                    acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                children: [arms(0, c1), arms(1, c2)],
            })];
        },
    });

    // ── Acid Trip ────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'acid-trip',
        name: 'Acid Trip',
        category: 'Effect',
        continuous: true,
        prewarm: 30,
        textures: ['glow_soft'],
        params: [
            { key: 'baseHue',  label: 'Base Hue',       type: 'range', default: 280, min: 0, max: 359, step: 1 },
            { key: 'hueRange', label: 'Hue Range',      type: 'range', default: 180, min: 0, max: 360, step: 5 },
            { key: 'symmetry', label: 'Symmetry',       type: 'range', default: 8, min: 3, max: 16, step: 1 },
            { key: 'layers',   label: 'Layers',         type: 'range', default: 3, min: 1, max: 5, step: 1 },
            { key: 'size',     label: 'Size',           type: 'range', default: 7, min: 2, max: 16, step: 1 },
            { key: 'speed',    label: 'Flow Speed',     type: 'range', default: 4, min: 1, max: 12, step: 1 },
        ],
        buildModels(p, M) {
            // One petal ring per layer: `symmetry` teardrop petals with
            // per-vertex alpha fading to the tips (mandala gradient).
            const models = [];
            for (let layer = 0; layer < p.layers; layer++) {
                const vertices = [];
                const faces = [];
                const rIn = 0.12 + layer * 0.08;
                const rOut = 0.35 + layer * 0.28;
                for (let i = 0; i < p.symmetry; i++) {
                    const a = (i / p.symmetry) * Math.PI * 2 + layer * 0.35;
                    const w = (Math.PI / p.symmetry) * 0.8;
                    const base = vertices.length;
                    vertices.push(
                        { p: [Math.cos(a) * rIn, Math.sin(a) * rIn, 0], n: [0, 0, 1], uv: [0.5, 1], c: [255, 255, 255, 230] },
                        { p: [Math.cos(a - w) * (rIn + rOut) * 0.55, Math.sin(a - w) * (rIn + rOut) * 0.55, 0], n: [0, 0, 1], uv: [0, 0.5], c: [255, 255, 255, 140] },
                        { p: [Math.cos(a) * rOut, Math.sin(a) * rOut, 0], n: [0, 0, 1], uv: [0.5, 0], c: [255, 255, 255, 0] },
                        { p: [Math.cos(a + w) * (rIn + rOut) * 0.55, Math.sin(a + w) * (rIn + rOut) * 0.55, 0], n: [0, 0, 1], uv: [1, 0.5], c: [255, 255, 255, 140] },
                    );
                    faces.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
                }
                models.push({
                    path: `Model/rr_acid_s${p.symmetry}_l${layer}of${p.layers}.efkmodel`,
                    mesh: { vertices, faces, scale: 1 },
                });
            }
            return models;
        },
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

            const layers = [];
            for (let k = 0; k < p.layers; k++) {
                const col = hsl((p.baseHue + (k / Math.max(1, p.layers - 1 || 1)) * p.hueRange) % 360);
                layers.push(B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rotation: {
                        type: 1,
                        refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        rotation: rv3(0),
                        velocity: rv3(v3(0, 0, (k % 2 ? -1 : 1) * p.speed * 0.7 * D2R * (1 + k * 0.4))),
                        acceleration: rv3(0),
                    },
                    rendererCommon: { colorTextureIndex: -1 },
                    rendererParams: { modelIndex: k, allColor: U.fixedColor({ ...col, a: 180 }) },
                }));
            }

            const glow = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(0.5, 0.5, 0.5) },
                rendererCommon: { colorTextureIndex: 0 },
                rendererParams: { allColor: U.fixedColor({ ...hsl(p.baseHue % 360), a: 220 }) },
            });

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                children: [glow, ...layers],
            })];
        },
    });

    // ── Chromatic Pulse ──────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'chromatic-pulse',
        name: 'Chromatic Pulse',
        category: 'Effect',
        continuous: true,
        prewarm: 90,
        textures: ['ring_soft', 'particle_hard'],
        params: [
            { key: 'size',       label: 'Size',        type: 'range', default: 7, min: 2, max: 16, step: 1 },
            { key: 'rate',       label: 'Pulse Rate',  type: 'range', default: 3, min: 1, max: 8, step: 1 },
            { key: 'aberration', label: 'Aberration',  type: 'range', default: 5, min: 0, max: 12, step: 1 },
            { key: 'width',      label: 'Ring Width',  type: 'range', default: 6, min: 2, max: 14, step: 1 },
            { key: 'glitch',     label: 'Glitch Bits', type: 'range', default: 12, min: 0, max: 40, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3, v2 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const pulseLife = 70;
            const cadence = Math.max(4, Math.round(pulseLife / p.rate));
            const CH = [
                { col: { r: 255, g: 40, b: 40, a: 130 }, off: 0 },
                { col: { r: 40, g: 255, b: 40, a: 130 }, off: p.aberration * 0.7 },
                { col: { r: 60, g: 60, b: 255, a: 130 }, off: p.aberration * 1.4 },
            ];

            const rings = CH.map((ch) => B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(pulseLife),
                    generationTime: rf(cadence),
                    generationTimeOffset: rf(ch.off),
                },
                scaling: { type: 4, start: rf(0.08), end: rf(1.0), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 0,
                    fadeOutType: 1, fadeOut: { frame: Math.round(pulseLife * 0.45), params: [0, 0, 0] },
                },
                rendererParams: {
                    billboard: 0,
                    vertexCount: 40,
                    outerLocation: { type: 0, location: v2(1 + p.width * 0.012, 0) },
                    innerLocation: { type: 0, location: v2(1 - p.width * 0.012, 0) },
                    outerColor: U.fixedColor({ ...ch.col, a: 0 }),
                    centerColor: U.fixedColor(ch.col),
                    innerColor: U.fixedColor({ ...ch.col, a: 0 }),
                },
            }));

            const nodes = [...rings];

            if (p.glitch > 0) {
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: {
                        ...bindAlways,
                        maxGeneration: 99999,
                        life: rf(3, 9),
                        generationTime: rf(Math.max(0.5, 8 / Math.max(1, p.glitch))),
                    },
                    generationLocation: { type: 0, location: rv3(v3(-0.9, -0.9, 0), v3(0.9, 0.9, 0)) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.14, 0.05, 1) },
                    rendererCommon: { colorTextureIndex: 1 },
                    rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 200 }) },
                }));
            }

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                children: nodes,
            })];
        },
    });

    // ── Poison Miasma ────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'poison-miasma',
        name: 'Poison Miasma',
        category: 'Effect',
        continuous: true,
        prewarm: 180,
        textures: ['smoke', 'particle_hard', 'spark'],
        params: [
            { key: 'color',    label: 'Gas Color',    type: 'color', default: '#44cc22' },
            { key: 'bubble',   label: 'Bubble Color', type: 'color', default: '#aaffaa' },
            { key: 'size',     label: 'Size',         type: 'range', default: 8, min: 3, max: 18, step: 1 },
            { key: 'clouds',   label: 'Gas Clouds',   type: 'range', default: 6, min: 2, max: 14, step: 1 },
            { key: 'spread',   label: 'Spread',       type: 'range', default: 6, min: 2, max: 14, step: 1 },
            { key: 'bubbles',  label: 'Bubbles',      type: 'range', default: 12, min: 0, max: 30, step: 1 },
            { key: 'spores',   label: 'Spores',       type: 'range', default: 10, min: 0, max: 40, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const gas = U.hexToRgba(p.color);
            const bub = U.hexToRgba(p.bubble);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const W = p.spread * 0.14;
            const cloudLife = 130;

            const puffs = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(Math.round(cloudLife * 0.7), cloudLife),
                    generationTime: rf(Math.max(2, cloudLife / p.clouds / 1.5)),
                },
                generationLocation: { type: 0, location: rv3(v3(-W, -0.25, -W * 0.6), v3(W, 0.05, W * 0.6)) },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(-0.003, 0.002, -0.002), v3(0.003, 0.008, 0.002)),
                    acceleration: rv3(0),
                },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                    velocity: rv3(v3(0, 0, -0.012), v3(0, 0, 0.012)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(0.35, 0.6), end: rf(0.9, 1.3), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 0,
                    alphaBlend: 1,   // murky, not glowing
                    fadeInType: 1, fadeIn: { frame: 25, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 45, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...U.dim(gas, 0.8), a: 135 }) },
            });

            const bubbles = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(25, 55),
                    generationTime: rf(Math.max(0.8, 40 / Math.max(1, p.bubbles))),
                },
                generationLocation: { type: 0, location: rv3(v3(-W * 0.8, -0.2, -W * 0.4), v3(W * 0.8, 0.3, W * 0.4)) },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(-0.001, 0.006, 0), v3(0.001, 0.014, 0)),
                    acceleration: rv3(0),
                },
                // Grow while rising, then pop (hard fade at end of life).
                scaling: { type: 4, start: rf(0.03, 0.07), end: rf(0.1, 0.2), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 1,
                    fadeOutType: 1, fadeOut: { frame: 3, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...bub, a: 190 }) },
            });

            const spores = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(50, 110),
                    generationTime: rf(Math.max(0.8, 80 / Math.max(1, p.spores))),
                },
                generationLocation: { type: 0, location: rv3(v3(-W, -0.1, -W * 0.5), v3(W, 0.6, W * 0.5)) },
                localForceField: {
                    elements: [{ type: 1, seed: 5, scale: 1.2, strength: 0.012, octave: 1 }],
                    locationAbs: { type: 0 },
                },
                scaling: { type: 4, start: rf(0.02, 0.06), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 2 },
                rendererParams: { allColor: U.fixedColor({ ...gas, a: 255 }) },
            });

            const children = [puffs];
            if (p.bubbles > 0) children.push(bubbles);
            if (p.spores > 0) children.push(spores);

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size * 0.6, p.size * 0.6, p.size * 0.6) },
                children,
            })];
        },
    });
})();
