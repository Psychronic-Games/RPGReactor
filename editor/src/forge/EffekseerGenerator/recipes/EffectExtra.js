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
            { key: 'twist',  label: 'Twist (turns)',  type: 'range', default: 1, min: 1, max: 6, step: 1 },
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
                const W = 8;   // subdivisions ACROSS the band — one flat quad
                               // per 2π/arms chord gave the rim jagged
                               // polygon edges instead of a circle
                const half = Math.PI / p.arms;
                for (let k = parity; k < p.arms; k += 2) {
                    const phase = (k / p.arms) * Math.PI * 2;
                    const base = vertices.length;
                    for (let i = 0; i <= SEG; i++) {
                        const s = i / SEG;
                        const a = phase + p.twist * Math.PI * 2 * s;
                        const r = s;
                        for (let w = 0; w <= W; w++) {
                            const aw = a - half + (w / W) * 2 * half;
                            vertices.push({ p: [Math.cos(aw) * r, Math.sin(aw) * r, 0], n: [0, 0, 1], uv: [w / W, s] });
                        }
                        if (i > 0) {
                            const row = base + i * (W + 1), prev = row - (W + 1);
                            for (let w = 0; w < W; w++) {
                                faces.push([prev + w, row + w, row + w + 1], [prev + w, row + w + 1, prev + w + 1]);
                            }
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
        textures: ['ring_soft', 'particle_hard', 'glow_soft', 'rays'],
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
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const S = p.size;
            const period = Math.round(24 + 72 / p.rate);
            const ab = p.aberration;
            const CH = [
                { c: { r: 255, g: 40, b: 40 }, dt: 0, dx: -ab * 0.028 * S },
                { c: { r: 40, g: 255, b: 60 }, dt: ab * 0.35, dx: 0 },
                { c: { r: 60, g: 90, b: 255 }, dt: ab * 0.7, dx: ab * 0.028 * S },
            ];
            // SIGNATURE: each pulse is one wave split into R/G/B rings,
            // offset in time and space — real chromatic aberration, not a
            // spark shotgun.
            const wave = (ch) => B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(Math.round(period * 0.85)),
                                generationTime: rf(period),
                                generationTimeOffset: rf(ch.dt) },
                translation: { type: 0, refEq: -1, position: v3(ch.dx, 0, 0) },
                // params [0,0,1] = LINEAR easing — [0,0,0] freezes the
                // interpolation at the start value (the invisible-rings bug)
                scaling: {
                    type: 2, refEqS: rf(-1), refEqE: rf(-1),
                    start: rv3(S * 0.1), end: rv3(S * 1.05),
                    params: [0, 0, 1],
                },
                rendererCommon: {
                    colorTextureIndex: 0, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: Math.round(period * 0.4), params: [0, 0, 0] },
                },
                rendererParams: {
                    billboard: 2, vertexCount: 48,
                    outerLocation: { type: 0, location: { x: 1 + p.width * 0.02, y: 0 } },
                    innerLocation: { type: 0, location: { x: 1 - p.width * 0.02, y: 0 } },
                    outerColor: L.fixed(ch.c, 0),
                    centerColor: L.fixed(ch.c, 200),
                    innerColor: L.fixed(ch.c, 40),
                },
            });
            // Prismatic heart: R/G/B breathing layers superpose to white
            // where they overlap, fringing into color at the edges.
            const heartLayer = (c, cycle, off) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(cycle),
                                generationTime: rf(Math.round(cycle / 2)), generationTimeOffset: rf(off) },
                scaling: { type: 4, start: rf(S * 0.34), end: rf(S * 0.52), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: 2, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: Math.round(cycle * 0.35), params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: Math.round(cycle * 0.4), params: [0, 0, 0] },
                },
                rendererParams: { allColor: L.fixed(c, 190) },
            });
            const kids = [
                wave(CH[0]), wave(CH[1]), wave(CH[2]),
                heartLayer(CH[0].c, 30, 0), heartLayer(CH[1].c, 38, 9), heartLayer(CH[2].c, 46, 18),
                L.glow({ tex: 2, color: { r: 255, g: 255, b: 255 }, size: S * 0.22, duration: 36000, alpha: 230 }),
            ];
            // Glitch bits: hard RGB squares popping around the field.
            if (p.glitch > 0) {
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(3, 8),
                                    generationTime: rf(Math.max(0.6, 16 / p.glitch)) },
                    generationLocation: { type: 0, location: rv3(v3(-S, -S * 0.7, -1), v3(S, S * 0.7, 1)) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.4, 0.14, 1) },
                    rendererCommon: { colorTextureIndex: 1, alphaBlend: 2 },
                    rendererParams: { allColor: U.easeColor({ r: 255, g: 60, b: 60, a: 235 }, { r: 60, g: 90, b: 255, a: 0 }) },
                }));
            }
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(36000) },
                children: kids,
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
        textures: ['smoke', 'particle_hard', 'spark', 'noise', 'glow_soft', 'bubble'],
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
            const dark = U.dim(gas, 0.45);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const W = p.spread * 0.22;
            const cloudLife = 130;
            // Everything hugs the origin (feet-level band y -1..-0.1):
            // an off-center fog slab orbits visibly when the effect is
            // rotated with the gizmo — "jumping around the frame."

            // Big billowing clouds: swell and drift, murky normal blend.
            const clouds = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways, maxGeneration: 99999,
                    life: rf(Math.round(cloudLife * 0.7), cloudLife),
                    generationTime: rf(Math.max(2, cloudLife / p.clouds)),
                },
                generationLocation: { type: 0, location: rv3(v3(-W, -1.0, -W * 0.5), v3(W, -0.2, W * 0.5)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(-0.007, 0.001, -0.003), v3(0.007, 0.005, 0.003)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(1.5, 2.3), end: rf(2.7, 3.6), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: 0, alphaBlend: 1,
                    fadeInType: 1, fadeIn: { frame: 26, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 34, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...dark, a: 135 }) },
            });

            // Dense low murk threading between the clouds.
            const murk = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways, maxGeneration: 99999,
                    life: rf(60, 95),
                    generationTime: rf(Math.max(1.5, 70 / (p.clouds * 2))),
                },
                generationLocation: { type: 0, location: rv3(v3(-W * 0.9, -0.9, -W * 0.4), v3(W * 0.9, -0.3, W * 0.4)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(-0.004, 0.002, -0.002), v3(0.004, 0.009, 0.002)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(0.8, 1.3), end: rf(1.6, 2.2), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: 0, alphaBlend: 1,
                    fadeInType: 1, fadeIn: { frame: 14, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 18, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...U.dim(gas, 0.6), a: 150 }) },
            });

            // Eerie luminance: pulsing additive noise bed under the fog.
            const glowBed = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(58), generationTime: rf(29) },
                translation: { type: 0, refEq: -1, position: v3(0, -0.6, 0) },
                scaling: { type: 4, start: rf(2.3), end: rf(3.1), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: 3, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 20, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 24, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...gas, a: 70 }) },
            });
            const haze = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(36000) },
                translation: { type: 0, refEq: -1, position: v3(0, -0.4, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(3.4, 2.2, 1) },
                rendererCommon: { colorTextureIndex: 4, alphaBlend: 2 },
                rendererParams: { allColor: U.fixedColor({ ...gas, a: 40 }) },
            });

            // Toxic bubbles: rimmed spheres that rise through the fog,
            // swell, and pop (hard fade snap).
            const bubbles = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways, maxGeneration: 99999,
                    life: rf(26, 46),
                    generationTime: rf(Math.max(0.8, 34 / Math.max(1, p.bubbles))),
                },
                generationLocation: { type: 0, location: rv3(v3(-W * 0.8, -1.0, -W * 0.3), v3(W * 0.8, -0.5, W * 0.3)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(-0.003, 0.011, -0.002), v3(0.003, 0.024, 0.002)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(0.16, 0.3), end: rf(0.4, 0.62), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: 5, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 6, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 3, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...bub, a: 235 }) },
            });

            // Spores: tiny glints wandering on turbulence.
            const spores = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways, maxGeneration: 99999,
                    life: rf(50, 90),
                    generationTime: rf(Math.max(0.8, 60 / Math.max(1, p.spores))),
                },
                generationLocation: { type: 0, location: rv3(v3(-W, -1.0, -W * 0.4), v3(W, 0.1, W * 0.4)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(-0.002, 0.004, -0.002), v3(0.002, 0.012, 0.002)),
                    acceleration: rv3(0),
                },
                localForceField: {
                    elements: [{ type: 1, seed: 11, scale: 0.7, strength: 0.006, octave: 1 }],
                    locationAbs: { type: 0 },
                },
                scaling: { type: 4, start: rf(0.08, 0.2), end: rf(0), params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: 2, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] } },
                rendererParams: { allColor: U.fixedColor({ ...bub, a: 220 }) },
            });

            const children = [haze, glowBed, clouds, murk];
            if (p.bubbles > 0) children.push(bubbles);
            if (p.spores > 0) children.push(spores);
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(36000) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size * 0.4, p.size * 0.4, p.size * 0.4) },
                children,
            })];
        },
    });
})();
