/**
 * Geometric parity extras:
 *
 *   • Hypersphere   — 4D 3-sphere: nested shells morphing through each
 *     other via baked 4D double-rotation frames (like the hypercube).
 *     Seamless fixed-length loop.
 *   • Galaxy Spiral — emergent spiral arms: rotating arm emitters launch
 *     stars radially outward; the stars freeze in world space at spawn
 *     (WhenCreating bind), so the rotation traces genuine spiral arms.
 *     Continuous.
 */
(function () {
    const D2R = Math.PI / 180;
    const LONG = 36000;

    // ── Hypersphere ──────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'geo-hypersphere',
        name: 'Hypersphere',
        category: 'Geometric',
        continuous: true,
        textures: ['streak', 'glow_soft'],
        params: [
            { key: 'color',     label: 'Color',          type: 'color',  default: '#40e0ff' },
            { key: 'size',      label: 'Size',           type: 'range',  default: 5, min: 2, max: 14, step: 1 },
            { key: 'thickness', label: 'Edge Thickness', type: 'range',  default: 4, min: 1, max: 10, step: 1 },
            { key: 'shells',    label: 'Shells',         type: 'range',  default: 3, min: 2, max: 4, step: 1 },
            { key: 'latLines',  label: 'Latitude Lines', type: 'range',  default: 5, min: 3, max: 6, step: 1 },
            { key: 'lonLines',  label: 'Longitude Lines', type: 'range', default: 8, min: 4, max: 10, step: 1 },
            { key: 'morph',     label: '4D Morph (turns/loop)', type: 'range', default: 1, min: 1, max: 3, step: 1 },
            { key: 'spinY',     label: 'Spin Y (°/s)',   type: 'range',  default: 18, min: -120, max: 120, step: 1 },
            { key: 'opacity',   label: 'Opacity',        type: 'range',  default: 22, min: 0, max: 32, step: 1 },
            { key: 'life',      label: 'Morph Cycle (frames)', type: 'range', default: 120, min: 30, max: 300, step: 1 },
            { key: 'core',      label: 'Core Glow',      type: 'toggle', default: true },
        ],

        // The shell mesh is heavy, so the morph is baked at a reduced frame
        // count: the largest divisor of `life` ≤ 96 keeps the model loop
        // aligned with the container loop (model frame = time % frames).
        _frames(p) {
            for (let f = Math.min(96, p.life); f >= 2; f--) {
                if (p.life % f === 0) return f;
            }
            return p.life;
        },

        buildModels(p, M) {
            const geo = M.buildGeometry('hypersphere', {
                thickness: p.thickness * 0.011,
                frames: this._frames(p),
                morphTurns: p.morph,
                shells: p.shells,
                lat: p.latLines,
                lon: p.lonLines,
            });
            const tag = `s${p.shells}la${p.latLines}lo${p.lonLines}t${p.thickness}f${this._frames(p)}m${p.morph}`;
            return [{ path: `Model/rr_geo_hypersphere_${tag}.efkmodel`, mesh: geo.mesh }];
        },

        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const c = U.hexToRgba(p.color);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const alpha = Math.min(255, Math.round(p.opacity * 8));
            const spin = (dps) => dps * D2R / 60;   // exact °/s

            const body = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: 0 },
                rendererParams: { modelIndex: 0, allColor: U.fixedColor({ ...c, a: alpha }) },
            });

            const nodes = [body];
            if (p.core) {
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    scaling: { type: 0, refEq: -1, scale: v3(1.0, 1.0, 1.0) },
                    rendererCommon: { colorTextureIndex: 1 },
                    rendererParams: { allColor: U.fixedColor({ ...U.dim(c, 0.8), a: 85 }) },
                }));
            }

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 1,
                    life: rf(LONG),
                },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(0),
                    velocity: rv3(v3(0, spin(p.spinY), 0)),
                    acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                children: nodes,
            })];
        },
    });

    // ── Galaxy Spiral ────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'geo-galaxy',
        name: 'Galaxy Spiral',
        category: 'Energy',
        continuous: true,
        prewarm: (p) => 260,
        textures: ['particle_hard', 'glow_soft', 'spark'],
        params: [
            { key: 'armColor',  label: 'Arm Color',     type: 'color', default: '#8844ff' },
            { key: 'coreColor', label: 'Core Color',    type: 'color', default: '#ffcc44' },
            { key: 'size',      label: 'Size',          type: 'range', default: 7, min: 3, max: 16, step: 1 },
            { key: 'arms',      label: 'Spiral Arms',   type: 'range', default: 4, min: 1, max: 6, step: 1 },
            { key: 'density',   label: 'Star Density',  type: 'range', default: 12, min: 2, max: 20, step: 1 },
            { key: 'spin',      label: 'Rotation (°/s)', type: 'range', default: 40, min: 10, max: 120, step: 1 },
            { key: 'coreGlow',  label: 'Core Glow',     type: 'range', default: 18, min: 0, max: 32, step: 1 },
            { key: 'bgStars',   label: 'Halo Stars',    type: 'range', default: 16, min: 0, max: 60, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const arm = U.hexToRgba(p.armColor);
            const core = U.hexToRgba(p.coreColor);
            const mix = (a, b, t) => ({
                r: Math.round(a.r + (b.r - a.r) * t),
                g: Math.round(a.g + (b.g - a.g) * t),
                b: Math.round(a.b + (b.b - a.b) * t),
                a: a.a,
            });
            const WHITE = { r: 255, g: 255, b: 255, a: 255 };
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const starLife = 170;                       // travel time to the rim
            const vel = 1.0 / starLife;                 // reaches r≈1 at death

            // One emitter per arm; each is a child of the spinning
            // container. Stars spawn at the hub with the arm's CURRENT
            // outward direction and then freeze in world space (default
            // WhenCreating bind) — the ongoing rotation traces the spiral.
            // Each arm gets TWO star populations: many small crisp stars
            // (the arm's spine) and fewer large dim haze puffs (the glow
            // between them) — layering is what makes it read as a galaxy
            // instead of dotted lines.
            const starLayer = (opts) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    maxGeneration: 99999,
                    life: rf(Math.round(starLife * 0.6), starLife),
                    generationTime: rf(opts.cadence),
                },
                generationLocation: { type: 0, location: rv3(v3(-0.035, -0.02, -0.035), v3(0.035, 0.02, 0.035)) },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(vel * 0.7, -0.0004, -vel * 0.16), v3(vel * 1.15, 0.0004, vel * 0.16)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(opts.sizeMin, opts.sizeMax), end: rf(opts.sizeMin * 0.4), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: opts.tex,
                    fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 50, params: [0, 0, 0] },
                },
                rendererParams: {
                    allColor: U.easeColor(opts.from, opts.to),
                },
            });

            const armEmitters = [];
            for (let k = 0; k < p.arms; k++) {
                armEmitters.push(B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, (k / p.arms) * Math.PI * 2, 0) },
                    children: [
                        starLayer({   // crisp spine stars — arm-tinted from birth
                            cadence: Math.max(0.4, 6 / p.density),
                            sizeMin: 0.014, sizeMax: 0.04, tex: 0,
                            from: mix(WHITE, arm, 0.45),
                            to: { ...arm, a: 60 },
                        }),
                        starLayer({   // color wash between them
                            cadence: Math.max(0.8, 14 / p.density),
                            sizeMin: 0.08, sizeMax: 0.17, tex: 1,
                            from: { ...arm, a: 80 },
                            to: { ...U.dim(arm, 0.6), a: 0 },
                        }),
                    ],
                }));
            }

            // Two-layer galactic bulge: hot compact core inside a wide
            // soft halo.
            const coreGlow = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(0.34, 0.34, 0.34) },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { allColor: U.fixedColor({ ...core, a: Math.min(255, p.coreGlow * 10) }) },
            });
            const coreHalo = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(0.9, 0.9, 0.9) },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { allColor: U.fixedColor({ ...U.dim(core, 0.75), a: Math.min(120, p.coreGlow * 4) }) },
            });

            const halo = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    maxGeneration: 99999,
                    life: rf(30, 90),
                    generationTime: rf(Math.max(0.5, 60 / Math.max(1, p.bgStars))),
                },
                generationLocation: { type: 1, radius: rf(0.3, 1.15), rotationX: rf(0, 360), rotationY: rf(0, 360) },
                scaling: { type: 4, start: rf(0.015, 0.04), end: rf(0), params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: 2 },
                rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 200 }) },
            });

            const children = [coreHalo, coreGlow, ...armEmitters];
            if (p.bgStars > 0) children.push(halo);

            // Inner container spins the arm emitters; the outer tilt gives
            // the AG's default -60° galactic viewing angle.
            const spinner = B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(0),
                    velocity: rv3(v3(0, p.spin * D2R / 60, 0)),
                    acceleration: rv3(0),
                },
                children,
            });

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: { type: 0, refEq: -1, rotation: v3(-Math.PI / 3, 0, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                children: [spinner],
            })];
        },
    });
})();
