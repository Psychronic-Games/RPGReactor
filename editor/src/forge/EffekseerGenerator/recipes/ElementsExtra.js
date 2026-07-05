/**
 * Elements/Physical parity recipes — Effekseer counterparts of the
 * standard Animation Generator entries that had no Effekseer version:
 *
 *   • Comet     (Elements) — glowing head + streaming tail + sparkles;
 *                continuous (the tail is a steady emitter)
 *   • Explosion (Elements) — flash, fireball, shockwave rings, debris,
 *                smoke; one-shot burst
 *   • Light     (Elements) — rotating radial ray fans (the AG "volume"
 *                planes) + core glow; continuous
 *   • Shockwave (Physical) — expanding ground ring + radial cracks +
 *                debris + impact flash; one-shot burst
 */
(function () {
    const D2R = Math.PI / 180;
    const LONG = 36000;

    // ── Comet ────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'comet',
        name: 'Comet',
        category: 'Elements',
        continuous: true,
        prewarm: 120,
        textures: ['glow_soft', 'particle_hard', 'spark', 'rays', 'noise'],
        params: [
            { key: 'coreColor', label: 'Head Color',   type: 'color', default: '#ffeeaa' },
            { key: 'tailColor', label: 'Tail Color',   type: 'color', default: '#4466ff' },
            { key: 'angle',     label: 'Angle (°)',    type: 'range', default: -30, min: -180, max: 180, step: 5 },
            { key: 'size',      label: 'Head Size',    type: 'range', default: 5, min: 2, max: 12, step: 1 },
            { key: 'tail',      label: 'Tail Length',  type: 'range', default: 8, min: 3, max: 16, step: 1 },
            { key: 'tailWidth', label: 'Tail Width',   type: 'range', default: 5, min: 2, max: 12, step: 1 },
            { key: 'density',   label: 'Tail Density', type: 'range', default: 12, min: 4, max: 30, step: 1 },
            { key: 'sparkles',  label: 'Sparkles',     type: 'range', default: 14, min: 0, max: 40, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const head = U.hexToRgba(p.coreColor);
            const ion = U.hexToRgba(p.tailColor);
            const WHITE = { r: 255, g: 255, b: 255 };
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const S = p.size;
            const T = p.tail;
            const TW = p.tailWidth;   // decoupled from head size

            // Tail stream: particles pour out BACKWARD (-x, the wrapper's
            // angle rotation aims the whole comet).
            const stream = (tex, color, alpha, spd, spread, sizes, lifeF, cad, grav) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(lifeF * 0.7, lifeF),
                                generationTime: rf(cad) },
                generationLocation: { type: 0, location: rv3(v3(-S * 0.1, -S * 0.12, -S * 0.12), v3(S * 0.1, S * 0.12, S * 0.12)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(-spd * 1.25, -spread, -spread), v3(-spd * 0.8, spread, spread)),
                    acceleration: rv3(v3(0, grav, 0)),
                },
                scaling: { type: 4, start: rf(sizes[0]), end: rf(sizes[1]), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: tex, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: Math.round(lifeF * 0.45), params: [0, 0, 0] },
                },
                rendererParams: { allColor: L.fixed(color, alpha) },
            });

            const tailLife = T * 4.5;
            const kids = [
                // dust tail: warm, broad, curves down under gravity
                stream(4, U.dim(head, 0.85), 150, T * 0.014, 0.012, [TW * 0.5, TW * 0.95], tailLife, Math.max(0.3, 9 / p.density), -0.0012),
                stream(0, U.dim(head, 0.6), 90, T * 0.011, 0.02, [TW * 0.7, TW * 1.2], tailLife * 1.15, Math.max(0.5, 14 / p.density), -0.0018),
                // ion tail: cool, narrow, straight and fast
                stream(0, ion, 130, T * 0.022, 0.006, [TW * 0.3, TW * 0.55], tailLife * 0.8, 0.5, 0),
                // head: white-hot heart in a flickering star
                L.glow({ tex: 0, color: WHITE, size: S * 0.5, duration: 36000, alpha: 255 }),
                L.glow({ tex: 0, color: head, size: S * 0.95, pulseTo: S * 1.1, duration: 36000, alpha: 190 }),
                B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(26), generationTime: rf(13) },
                    rotation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                        velocity: rv3(v3(0, 0, 0.02)), acceleration: rv3(0),
                    },
                    scaling: { type: 4, start: rf(S * 1.0), end: rf(S * 1.25), params: [0, 0, 1] },
                    rendererCommon: {
                        colorTextureIndex: 3, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 9, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: L.fixed(head, 140) },
                }),
            ];
            if (p.sparkles > 0) {
                kids.push(stream(2, WHITE, 235, T * 0.016, 0.016, [0.5, 0.1], tailLife * 0.9,
                                 Math.max(0.5, 14 / p.sparkles), -0.0008));
            }
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(36000) },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, p.angle * Math.PI / 180) },
                children: kids,
            })];
        },
    });

    // ── Explosion ────────────────────────────────────────────────────────
    // Multi-point detonation (distinct from Fire Burst's single upward
    // plume): primary blast + two staggered secondary charges going off
    // around it, dominant double shockwave, streak shrapnel, dusted
    // glowing debris, a dark rolling smoke column and lingering embers.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'explosion',
        name: 'Explosion',
        category: 'Physical',
        textures: ['glow_soft', 'ring_soft', 'particle_hard', 'smoke', 'streak', 'spark', 'rays', 'noise'],
        params: [
            { key: 'coreColor',  label: 'Core Color',   type: 'color',  default: '#ffee44' },
            { key: 'outerColor', label: 'Fire Color',   type: 'color',  default: '#ff5810' },
            { key: 'size',       label: 'Size',         type: 'range',  default: 10, min: 3, max: 30, step: 1 },
            { key: 'debris',     label: 'Shrapnel',     type: 'range',  default: 26, min: 0, max: 80, step: 1 },
            { key: 'charges',    label: 'Secondary Charges', type: 'range', default: 2, min: 0, max: 4, step: 1 },
            { key: 'life',       label: 'Duration',     type: 'range',  default: 55, min: 25, max: 110, step: 1 },
            { key: 'smoke',      label: 'Smoke',        type: 'toggle', default: true },
        ],
        build(p) {
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const B = RR_EfkBuilder;
            const { rf, v3 } = B;
            const core = U.hexToRgba(p.coreColor);
            const fire = U.hexToRgba(p.outerColor);
            const WHITE = { r: 255, g: 255, b: 255 };
            const DARK = { r: 32, g: 25, b: 20 };
            const D = p.life;
            // tex: 0 glow 1 ring 2 hard 3 smoke 4 streak 5 spark 6 rays 7 noise
            const kids = [
                // act 1 — detonation pop: white flash, filament star, double ring
                L.flash({ tex: 0, color: WHITE, from: 9, to: 19, size: 16, duration: 7, alpha: 255, fadeOut: 5 }),
                L.flash({ tex: 6, color: WHITE, from: 6, to: 13, size: 11, duration: 11, alpha: 190, fadeOut: 8 }),
                L.flash({ tex: 0, color: fire, from: 8, to: 24, size: 20, start: 1, duration: 18, alpha: 150, fadeOut: 12 }),
                L.shockRing({ tex: 1, color: WHITE, size: 26, from: 3, width: 0.07, duration: 14, alpha: 220 }),
                L.shockRing({ tex: 1, color: fire, size: 31, from: 4, width: 0.16, start: 4, duration: Math.round(D * 0.35), alpha: 110, fadeOut: Math.round(D * 0.18) }),
                // act 2 — fireball mass: normal-blend billow + additive heat + white heart
                L.puffs({ tex: 3, color: fire, count: 18, size: 7.6, area: 2.3, rise: 0.03, alpha: 245,
                          start: 1, duration: Math.round(D * 0.7), cadence: 1, fadeOut: Math.round(D * 0.3) }),
                L.glow({ tex: 7, color: fire, size: 10, pulseTo: 14, start: 2, duration: Math.round(D * 0.55), alpha: 200, fadeOut: Math.round(D * 0.25) }),
                L.glow({ tex: 0, color: core, size: 7, pulseTo: 9.5, start: 1, duration: Math.round(D * 0.4), alpha: 240, fadeOut: Math.round(D * 0.2) }),
                // act 3 — shrapnel + embers
                L.burst({ tex: 5, color: WHITE, color2: fire, count: Math.round(p.debris * 0.3), size: 1.1, speed: 0.17,
                          gravity: 0.004, up: true, duration: Math.round(D * 0.5), cadence: 0.2,
                          dust: { tex: 5, color: fire, size: 0.5 }, fadeOut: 8 }),
                L.burst({ tex: 2, color: core, color2: fire, count: p.debris, size: 0.85, speed: 0.1,
                          gravity: 0.003, up: true, start: 1, duration: Math.round(D * 0.6), cadence: 0.2, fadeOut: 10 }),
                L.motes({ tex: 5, color: { r: 255, g: 190, b: 100 }, count: 20, size: 0.4, radius: 3.2, vy: 0.02,
                          duration: D, cadence: 1.4 }),
            ];
            // secondary charges: offset mini-detonations
            for (let i = 0; i < p.charges; i++) {
                const ang = (i / Math.max(1, p.charges)) * Math.PI * 2 + 0.7;
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: { ...L.BIND, maxGeneration: 1, generationTimeOffset: rf(5 + i * 6), life: rf(D) },
                    translation: { type: 0, refEq: -1, position: v3(Math.cos(ang) * 4.5, 1 + Math.random() * 2, Math.sin(ang) * 2.5) },
                    children: [
                        L.flash({ tex: 0, color: WHITE, from: 3, to: 7, size: 6, duration: 6, alpha: 245 }),
                        L.flash({ tex: 6, color: core, from: 3, to: 8, size: 7, duration: 11, alpha: 210, fadeOut: 8 }),
                        L.burst({ tex: 5, color: WHITE, color2: fire, count: 9, size: 0.4, speed: 0.09, duration: 20, cadence: 0.2 }),
                    ],
                }));
            }
            // act 4 — burnout: dark smoke crown
            if (p.smoke) {
                kids.push(L.puffs({ tex: 3, color: DARK, count: 10, size: 7.5, area: 2.6, rise: 0.05, alpha: 175,
                                    start: Math.round(D * 0.18), duration: Math.round(D * 0.85), cadence: 2,
                                    fadeOut: Math.round(D * 0.35) }));
            }
            return [L.act({ duration: D + 40, scale: p.size / 10 }, kids)];
        },
    });

    // ── Light ────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'light-rays',
        name: 'Light',
        category: 'Elements',
        continuous: true,
        prewarm: 30,
        textures: ['glow_soft'],
        params: [
            { key: 'coreColor', label: 'Core Color',   type: 'color', default: '#fff0a0' },
            { key: 'edgeColor', label: 'Edge Color',   type: 'color', default: '#ffaa20' },
            { key: 'size',      label: 'Size',         type: 'range', default: 6, min: 2, max: 14, step: 1 },
            { key: 'rays',      label: 'Rays',         type: 'range', default: 12, min: 2, max: 32, step: 1 },
            { key: 'rayLen',    label: 'Ray Length',   type: 'range', default: 8, min: 4, max: 14, step: 1 },
            { key: 'rayWidth',  label: 'Ray Width',    type: 'range', default: 5, min: 1, max: 10, step: 1 },
            { key: 'spin',      label: 'Spin (°/s)',   type: 'range', default: 15, min: -90, max: 90, step: 1 },
            { key: 'volume',    label: '3D Ray Planes', type: 'range', default: 3, min: 1, max: 4, step: 1 },
        ],
        buildModels(p, M) {
            // Ray fan in the XY plane, per-vertex color fading center→tip
            // so each ray tapers into transparency like the AG's beams.
            const vertices = [];
            const faces = [];
            const R = 0.15 + p.rayLen * 0.085;
            for (let i = 0; i < p.rays; i++) {
                const a = (i / p.rays) * Math.PI * 2;
                const w = (Math.PI / p.rays) * (p.rayWidth / 10);
                const base = vertices.length;
                vertices.push(
                    { p: [Math.cos(a) * 0.06, Math.sin(a) * 0.06, 0], n: [0, 0, 1], uv: [0.5, 1], c: [255, 255, 255, 255] },
                    { p: [Math.cos(a - w) * R, Math.sin(a - w) * R, 0], n: [0, 0, 1], uv: [0, 0], c: [255, 255, 255, 0] },
                    { p: [Math.cos(a + w) * R, Math.sin(a + w) * R, 0], n: [0, 0, 1], uv: [1, 0], c: [255, 255, 255, 0] },
                );
                faces.push([base, base + 1, base + 2]);
            }
            return [{
                path: `Model/rr_light_rays_n${p.rays}_l${p.rayLen}_w${p.rayWidth}.efkmodel`,
                mesh: { vertices, faces, scale: 1 },
            }];
        },
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const core = U.hexToRgba(p.coreColor);
            const edge = U.hexToRgba(p.edgeColor);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

            // The AG's "volume" = the same ray fan on several 3D planes.
            const fans = [];
            for (let k = 0; k < p.volume; k++) {
                fans.push(B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rotation: {
                        type: 1,
                        refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        rotation: rv3(v3(0, (k / p.volume) * Math.PI, 0)),
                        velocity: rv3(v3(0, 0, p.spin * D2R / 60 * (k % 2 ? -1 : 1))),
                        acceleration: rv3(0),
                    },
                    rendererCommon: { colorTextureIndex: -1 },
                    rendererParams: { modelIndex: 0, allColor: U.fixedColor({ ...edge, a: 150 }) },
                }));
            }

            const glow = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(0.8, 0.8, 0.8) },
                rendererCommon: { colorTextureIndex: 0 },
                rendererParams: { allColor: U.fixedColor({ ...core, a: 230 }) },
            });

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                children: [glow, ...fans],
            })];
        },
    });

    // ── Shockwave (Physical) ─────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'shockwave',
        name: 'Shockwave',
        category: 'Physical',
        textures: ['glow_soft', 'ring_soft', 'particle_hard', 'smoke', 'streak', 'spark', 'rays', 'noise'],
        params: [
            { key: 'waveColor',   label: 'Wave Color',   type: 'color', default: '#aaddff' },
            { key: 'debrisColor', label: 'Debris Color', type: 'color', default: '#a08050' },
            { key: 'size',        label: 'Size',         type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'rings',       label: 'Rings',        type: 'range', default: 2, min: 1, max: 5, step: 1 },
            { key: 'cracks',      label: 'Ground Cracks', type: 'range', default: 10, min: 0, max: 24, step: 1 },
            { key: 'debris',      label: 'Debris',       type: 'range', default: 10, min: 0, max: 40, step: 1 },
            { key: 'life',        label: 'Duration',     type: 'range', default: 45, min: 20, max: 90, step: 1 },
        ],
        build(p) {
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const D2R2 = Math.PI / 180;
            const wave = U.hexToRgba(p.waveColor);
            const earth = U.hexToRgba(p.debrisColor);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const kids = [
                // impact heart
                // No center starburst — the expanding rings and the dust
                // wave ARE this effect's identity.
                L.flash({ tex: 0, color: wave, from: 3, to: 8, size: 7, duration: 8, alpha: 130, fadeOut: 6 }),
                // radial dust wave: dark normal-blend gusts racing outward
                L.burst({ tex: 3, color: earth, count: 30, size: 2.1, speed: 0.19, radius: 2.4, blend: 1, alpha: 165,
                          start: 2, duration: Math.round(D * 0.55), cadence: 0.3, fadeOut: Math.round(D * 0.28) }),
                // pebbles with glint dust
                L.burst({ tex: 2, color: earth, color2: { r: 60, g: 45, b: 30 }, count: Math.round(p.debris * 0.6), size: 0.95, speed: 0.11,
                          gravity: 0.005, up: true, duration: Math.round(D * 0.6), cadence: 0.25 }),
                L.motes({ tex: 5, color: { r: 230, g: 210, b: 170 }, count: 14, size: 0.35, radius: 4, vy: 0.012,
                          duration: D, cadence: 2 }),
            ];
            for (let i = 0; i < p.rings; i++) {
                kids.push(L.shockRing({ tex: 1, color: i === 0 ? WHITE : wave, size: 30 + i * 8, from: 3,
                                        width: 0.2 + i * 0.05, start: i * 5,
                                        duration: Math.round(D * (0.4 + i * 0.14)), alpha: 255 - i * 25, billboard: 2 }));
            }
            if (p.cracks > 0) {
                kids.push(L.burst({ tex: 4, color: { r: 45, g: 36, b: 26 }, count: p.cracks, size: 2.4, speed: 0.06,
                                    blend: 1, alpha: 200, duration: Math.round(D * 0.5), cadence: 0.15,
                                    fadeOut: Math.round(D * 0.25) }));
            }
            return [L.act({ duration: D + 30, tiltX: -72 * D2R2, scale: p.size / 6.5 }, kids)];
        },
    });

    // ── Slash (Physical) ─────────────────────────────────────────────────
    // Sword-cut: crescent arcs sweeping fast across the target (slash
    // billboards only read when MOVING), a white-hot cut line, and a spray
    // of sparks off the blade path.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-slash',
        name: 'Slash',
        category: 'Physical',
        textures: ['slash', 'streak', 'spark', 'glow_soft', 'particle_hard'],
        params: [
            { key: 'color',      label: 'Primary Color', type: 'color', default: '#eaf6ff' },
            { key: 'sparkColor', label: 'Spark Color',  type: 'color', default: '#ffd27f' },
            { key: 'size',       label: 'Size',         type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'slashes',    label: 'Slashes',      type: 'range', default: 2, min: 1, max: 4, step: 1 },
            { key: 'angle',      label: 'Angle (°)',    type: 'range', default: -35, min: -90, max: 90, step: 5 },
            { key: 'curve',      label: 'Curve',        type: 'range', default: 60, min: 0, max: 100, step: 5 },
            { key: 'sparks',     label: 'Sparks',       type: 'range', default: 16, min: 0, max: 50, step: 1 },
            { key: 'life',       label: 'Duration',     type: 'range', default: 40, min: 20, max: 90, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const cs = U.hexToRgba(p.sparkColor);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const kids = [];

            // Curve: 100 = deep crescent, 0 = a flat straight cut (the
            // crescent texture squashed until the arc vanishes)
            const arcH = 0.22 + (p.curve / 100) * 1.15;
            for (let i = 0; i < p.slashes; i++) {
                // alternate the cut direction so a flurry reads as an X
                const aDeg = p.angle + (i % 2 ? 96 : 0) + (i > 1 ? (i % 2 ? -14 : 14) : 0);
                const a = aDeg * Math.PI / 180;
                const dir = [Math.cos(a), Math.sin(a)];
                const start = i * 7;
                const T = 12;
                // the crescent (plus a dimmer ghost trailing it — motion
                // blur), sweeping fast along the cut
                const sweep = (alpha2, scaleM, lag) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(T + 6),
                                    generationTimeOffset: rf(start + lag) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(-dir[0] * 2.4, -dir[1] * 2.4, 0)),
                        velocity: rv3(v3(dir[0] * 4.8 / T, dir[1] * 4.8 / T, 0)),
                        acceleration: rv3(0),
                    },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(3.4 * scaleM, arcH * 1.15 * scaleM, 1)),
                               end: rv3(v3(4.4 * scaleM, arcH * 0.85 * scaleM, 1)),
                               params: [0, 0, 1] },
                    rendererCommon: {
                        colorTextureIndex: 0, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 7, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: alpha2 } } },
                });
                kids.push(sweep(245, 1, 0));
                kids.push(sweep(100, 1.18, 2));
                // white-hot cut line lingering where the blade passed
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(16),
                                    generationTimeOffset: rf(start + 4) },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(3.6, 0.14, 1)), end: rv3(v3(3.9, 0.03, 1)),
                               params: [0, 0, 1] },
                    rendererCommon: {
                        colorTextureIndex: 1, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...WHITE, a: 255 } } },
                }));
            }
            kids.push(L.flash({ tex: 3, color: c, from: 1.5, to: 4, size: 4, duration: 10, alpha: 150 }));
            if (p.sparks > 0) {
                // sparks thrown from ALONG the cut line, not just the center
                const a0 = p.angle * Math.PI / 180;
                const d0 = [Math.cos(a0), Math.sin(a0)];
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: p.sparks, life: rf(12, 26),
                                    generationTime: rf(0.3) },
                    generationLocation: { type: 0, location: rv3(
                        v3(-Math.abs(d0[0]) * 1.6 - 0.12, -Math.abs(d0[1]) * 1.6 - 0.12, 0),
                        v3(Math.abs(d0[0]) * 1.6 + 0.12, Math.abs(d0[1]) * 1.6 + 0.12, 0)) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(0),
                        velocity: rv3(v3(-0.1, -0.02, -0.02), v3(0.1, 0.16, 0.02)),
                        acceleration: rv3(v3(0, -0.005, 0)),
                    },
                    scaling: { type: 4, start: rf(0.35, 0.6), end: rf(0), params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 2, alphaBlend: 2 },
                    rendererParams: { allColor: { type: 0, fixed: { ...cs, a: 255 } } },
                }));
                // dark chips knocked loose, tumbling down
                kids.push(L.burst({ tex: 4, color: U.dim(cs, 0.5), color2: { r: 50, g: 40, b: 34 },
                                    count: Math.round(p.sparks * 0.4), size: 0.34, speed: 0.08,
                                    gravity: 0.007, duration: Math.round(D * 0.6), cadence: 0.4 }));
            }
            return [L.act({ duration: D + 20, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Bite (Physical) ──────────────────────────────────────────────────
    // Jaws snapping shut: two fang arcs clamping from above and below,
    // crescent jaw outlines closing with them, an impact flash at the
    // bite line and a spatter of droplets.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-bite',
        name: 'Bite',
        category: 'Physical',
        textures: ['fang', 'slash', 'glow_soft', 'particle_hard', 'spark'],
        params: [
            { key: 'color',      label: 'Primary Color', type: 'color', default: '#f4f0e6' },
            { key: 'wound',      label: 'Accent Color',  type: 'color', default: '#e83a48' },
            { key: 'size',       label: 'Size',          type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'teeth',      label: 'Teeth',         type: 'range', default: 5, min: 3, max: 9, step: 1 },
            { key: 'gape',       label: 'Spread',        type: 'range', default: 10, min: 5, max: 18, step: 1 },
            { key: 'droplets',   label: 'Debris',        type: 'range', default: 14, min: 0, max: 40, step: 1 },
            { key: 'life',       label: 'Duration',      type: 'range', default: 45, min: 20, max: 90, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const cw = U.hexToRgba(p.wound);
            const D = p.life;
            const gape = p.gape * 0.22;
            const T = 9;   // clamp travel frames
            const kids = [];

            // fangs: SOLID curved teeth (fang texture, normal blend — teeth
            // are bone, not light) along each jaw arc, canines longest,
            // every tooth tilted toward the prey, clamping in
            for (const s of [1, -1]) {
                for (let i = 0; i < p.teeth; i++) {
                    const fx = p.teeth === 1 ? 0 : -1.5 + (i / (p.teeth - 1)) * 3;
                    const arcY = 0.32 * (1 - Math.pow(fx / 1.6, 2));
                    const y0 = s * (gape + arcY);
                    const canine = i === 1 || i === p.teeth - 2;
                    const len = canine ? 1.45 : (i % 2 ? 1.05 : 0.85);
                    kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(T + 14),
                                        generationTimeOffset: rf(i % 3) },
                        translation: {
                            type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                            location: rv3(v3(fx, y0, 0)),
                            velocity: rv3(v3(0, -s * (gape - 0.15) / T, 0)),
                            // decelerate to a stop AT the bite line — a
                            // constant velocity sails through and exits
                            // the far side
                            acceleration: rv3(v3(0, s * (gape - 0.15) / (T * T), 0)),
                        },
                        rotation: { type: 0, refEq: -1, rotation: v3(0, 0, fx * -0.22) },
                        scaling: { type: 0, refEq: -1,
                                   scale: v3(0.62 * len, s > 0 ? 1.5 * len : -1.5 * len, 1) },
                        rendererCommon: {
                            colorTextureIndex: 0, alphaBlend: 1,
                            fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                            fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] },
                        },
                        rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 255 } } },
                    }));
                    // canine glint at the moment of closure
                    if (canine) {
                        kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                            commonValues: { ...bindAlways, maxGeneration: 1, life: rf(8),
                                            generationTimeOffset: rf(T) },
                            translation: { type: 0, refEq: -1, position: v3(fx, s * 0.6, 0.02) },
                            scaling: { type: 4, start: rf(0.9), end: rf(0.2), params: [0, 0, 1] },
                            rendererCommon: { colorTextureIndex: 4, alphaBlend: 2,
                                fadeOutType: 1, fadeOut: { frame: 5, params: [0, 0, 0] } },
                            rendererParams: { allColor: { type: 0, fixed: { r: 255, g: 255, b: 255, a: 255 } } },
                        }));
                    }
                }
                // jaw outline crescent riding with the fangs
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(T + 12) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(0, s * (gape + 0.5), 0)),
                        velocity: rv3(v3(0, -s * (gape - 0.1) / T, 0)),
                        acceleration: rv3(v3(0, s * (gape - 0.1) / (T * T), 0)),
                    },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, s > 0 ? 0 : Math.PI) },
                    scaling: { type: 0, refEq: -1, scale: v3(3.6, 1.5, 1) },
                    rendererCommon: {
                        colorTextureIndex: 1, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 7, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 200 } } },
                }));
            }
            // the snap: flash + droplets + lingering gash marks where the
            // canines met
            kids.push(L.flash({ tex: 2, color: cw, from: 1, to: 3.6, size: 3, duration: 10,
                                alpha: 190, start: T }));
            for (const [rot, off] of [[0.32, -0.25], [-0.28, 0.3]]) {
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(24),
                                    generationTimeOffset: rf(T + 2) },
                    translation: { type: 0, refEq: -1, position: v3(off, 0, 0.01) },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, rot) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(2.2, 0.5, 1)), end: rv3(v3(2.5, 0.32, 1)),
                               params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 1, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 14, params: [0, 0, 0] } },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...cw, a: 200 } } },
                }));
            }
            if (p.droplets > 0) {
                kids.push(L.burst({ tex: 3, color: cw, color2: { r: 90, g: 16, b: 22 },
                                    count: p.droplets, size: 0.42, speed: 0.1,
                                    gravity: 0.007, start: T, duration: Math.round(D * 0.55),
                                    cadence: 0.25 }));
            }
            return [L.act({ duration: D + 20, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Punch (Physical) ─────────────────────────────────────────────────
    // Concussive impact: white pop + ray star, tight fast shock rings
    // (per hit, staggered like a combo), radial speed-line dashes, and a
    // little knocked-loose dust.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-punch',
        name: 'Punch',
        category: 'Physical',
        textures: ['glow_soft', 'ring_soft', 'streak', 'rays', 'smoke', 'particle_hard'],
        params: [
            { key: 'color',   label: 'Primary Color', type: 'color', default: '#ffe9b0' },
            { key: 'size',    label: 'Size',          type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'hits',    label: 'Hits',          type: 'range', default: 1, min: 1, max: 3, step: 1 },
            { key: 'lines',   label: 'Speed Lines',   type: 'range', default: 14, min: 0, max: 30, step: 1 },
            { key: 'dust',    label: 'Smoke',         type: 'toggle', default: true },
            { key: 'life',    label: 'Duration',      type: 'range', default: 40, min: 20, max: 90, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const CAD = 11;   // combo cadence
            const kids = [
                L.flash({ tex: 0, color: WHITE, from: 1, to: 4.5, size: 4, duration: 8,
                          alpha: 235, count: p.hits, cadence: CAD }),
                L.flash({ tex: 3, color: c, from: 2, to: 5.5, size: 5, duration: 9,
                          alpha: 190, count: p.hits, cadence: CAD }),
                L.shockRing({ tex: 1, color: c, size: 7, from: 1, width: 0.3, duration: 12,
                              alpha: 255, count: p.hits, cadence: CAD }),
            ];
            // radial speed-line dashes: stretched streaks racing outward
            for (let i = 0; i < p.lines; i++) {
                const a = (i / Math.max(1, p.lines)) * Math.PI * 2 + (i % 2) * 0.26;
                const dir = [Math.cos(a), Math.sin(a)];
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: p.hits, life: rf(9, 13),
                                    generationTime: rf(CAD),
                                    generationTimeOffset: rf((i * 2) % 6) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(dir[0] * 0.9, dir[1] * 0.9, 0)),
                        velocity: rv3(v3(dir[0] * 0.22, dir[1] * 0.22, 0),
                                      v3(dir[0] * 0.34, dir[1] * 0.34, 0)),
                        acceleration: rv3(0),
                    },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a + Math.PI / 2) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.16, 1.5, 1) },
                    rendererCommon: {
                        colorTextureIndex: 2, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 6, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 220 } } },
                }));
            }
            // the meat of the hit: a wide squashed white SMACK under the
            // pop, and a knuckle imprint — four short parallel dashes
            kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: p.hits, life: rf(7),
                                generationTime: rf(CAD) },
                scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                           start: rv3(v3(3.2, 1.3, 1)), end: rv3(v3(6.2, 2.1, 1)),
                           params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: 0, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 5, params: [0, 0, 0] } },
                rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...WHITE, a: 170 } } },
            }));
            for (let k = 0; k < 4; k++) {
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: p.hits, life: rf(12),
                                    generationTime: rf(CAD), generationTimeOffset: rf(1) },
                    translation: { type: 0, refEq: -1, position: v3(-0.66 + k * 0.44, 0.15, 0.02) },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, 1.25) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.14, 0.65, 1) },
                    rendererCommon: { colorTextureIndex: 2, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 235 } } },
                }));
            }
            // lazy second ring so each hit reverberates
            kids.push(L.shockRing({ tex: 1, color: U.dim(c, 0.75), size: 10, from: 2, width: 0.16,
                                    duration: 20, alpha: 140, count: p.hits, cadence: CAD, start: 4 }));
            if (p.dust) {
                kids.push(L.puffs({ tex: 4, color: { r: 120, g: 105, b: 90 }, count: 5, size: 1.6,
                                    area: 1.2, rise: 0.008, duration: Math.round(D * 0.8), alpha: 90 }));
            }
            return [L.act({ duration: D + 20, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Impale (Physical) ────────────────────────────────────────────────
    // Spikes slam THROUGH the target and stick (thrust decelerates to a
    // stop with a hint of recoil), with an impact flash, a perpendicular
    // shock ring, and droplets thrown from the wound.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-impale',
        name: 'Impale',
        category: 'Physical',
        textures: ['streak', 'glow_soft', 'particle_hard', 'ring_soft', 'spark'],
        params: [
            { key: 'color',    label: 'Primary Color', type: 'color', default: '#dfe8f2' },
            { key: 'wound',    label: 'Accent Color',  type: 'color', default: '#c8303e' },
            { key: 'size',     label: 'Size',          type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'spikes',   label: 'Spikes',        type: 'range', default: 1, min: 1, max: 3, step: 1 },
            { key: 'angle',    label: 'Angle (°)',     type: 'range', default: -70, min: -180, max: 180, step: 5 },
            { key: 'curve',    label: 'Curve',         type: 'range', default: 0, min: 0, max: 100, step: 5 },
            { key: 'droplets', label: 'Debris',        type: 'range', default: 16, min: 0, max: 40, step: 1 },
            { key: 'life',     label: 'Duration',      type: 'range', default: 55, min: 25, max: 110, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const cw = U.hexToRgba(p.wound);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const T = 8;   // thrust frames to full depth
            const kids = [];

            for (let i = 0; i < p.spikes; i++) {
                const aDeg = p.angle + (i === 1 ? 145 : i === 2 ? -125 : 0);
                const a = aDeg * Math.PI / 180;
                const dir = [Math.cos(a), Math.sin(a)];
                const perp = [-dir[1], dir[0]];
                const start = i * 9;
                const reach = 3.4;
                // the spike: launches from off-screen along the angle and
                // decelerates to a stop dead-center (v0 with a = −v0/T
                // stops at T; the slight pull-back after reads as recoil).
                // Curve bends the thrust into a hooking arc (perpendicular
                // acceleration, launch offset keeps the stop centered).
                const v0 = (reach * 2) / T;
                const bend = (p.curve / 100) * 2.2;
                const aPerp = bend * 2 / (T * T);
                const spikeMove = (off) => ({
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(-dir[0] * (reach - off) + perp[0] * bend,
                                     -dir[1] * (reach - off) + perp[1] * bend, 0)),
                    velocity: rv3(v3(dir[0] * v0 * (1 - off / (reach * 2)) - perp[0] * bend * 2 / T,
                                     dir[1] * v0 * (1 - off / (reach * 2)) - perp[1] * bend * 2 / T, 0)),
                    acceleration: rv3(v3(-dir[0] * v0 / T + perp[0] * aPerp,
                                         -dir[1] * v0 / T + perp[1] * aPerp, 0)),
                });
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(Math.round(D * 0.7)),
                                    generationTimeOffset: rf(start) },
                    translation: spikeMove(0),
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a + Math.PI / 2) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.34, 3.1, 1) },
                    rendererCommon: {
                        colorTextureIndex: 0, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 1, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 14, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 255 } } },
                }));
                // white-hot glint riding the spike TIP
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(T + 10),
                                    generationTimeOffset: rf(start) },
                    translation: spikeMove(1.5),
                    scaling: { type: 4, start: rf(0.8), end: rf(0.3), params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 4, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                    rendererParams: { allColor: { type: 0, fixed: { ...WHITE, a: 255 } } },
                }));
                // impact: flash + perpendicular ring as it hits center
                kids.push(L.flash({ tex: 1, color: WHITE, from: 0.8, to: 3, size: 3, duration: 8,
                                    alpha: 230, start: start + T - 1 }));
                kids.push(L.shockRing({ tex: 3, color: cw, size: 5.5, from: 0.8, width: 0.25,
                                        duration: 12, alpha: 220, start: start + T - 1 }));
                // exit spray: droplets thrown FORWARD out the far side
                if (p.droplets > 0) {
                    kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: Math.round(p.droplets * 0.5),
                                        life: rf(14, 30), generationTime: rf(0.3),
                                        generationTimeOffset: rf(start + T - 1) },
                        translation: {
                            type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                            location: rv3(v3(dir[0] * 0.4, dir[1] * 0.4, 0)),
                            velocity: rv3(v3(dir[0] * 0.07 - 0.035, dir[1] * 0.07 - 0.035, -0.02),
                                          v3(dir[0] * 0.17 + 0.035, dir[1] * 0.17 + 0.035, 0.02)),
                            acceleration: rv3(v3(0, -0.006, 0)),
                        },
                        scaling: { type: 4, start: rf(0.3, 0.5), end: rf(0.08), params: [0, 0, 1] },
                        rendererCommon: { colorTextureIndex: 2, alphaBlend: 2 },
                        rendererParams: { allColor: { type: 0, fixed: { ...cw, a: 255 } } },
                    }));
                }
            }
            if (p.droplets > 0) {
                kids.push(L.burst({ tex: 2, color: cw, color2: { r: 90, g: 16, b: 22 },
                                    count: p.droplets, size: 0.4, speed: 0.09,
                                    gravity: 0.008, start: T, duration: Math.round(D * 0.6),
                                    cadence: 0.3 }));
                // slow after-drips falling from the wound
                kids.push(L.burst({ tex: 2, color: cw, count: 6, size: 0.3, speed: 0.015,
                                    gravity: 0.006, start: T + 8, duration: Math.round(D * 0.7),
                                    cadence: 4 }));
            }
            return [L.act({ duration: D + 20, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Claw Rake (Physical) ─────────────────────────────────────────────
    // Beast swipe: parallel crescents raking together as one paw stroke,
    // each with a trailing ghost and its own lingering cut line.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-claw',
        name: 'Claw Rake',
        category: 'Physical',
        textures: ['slash', 'streak', 'spark', 'glow_soft', 'particle_hard'],
        params: [
            { key: 'color',      label: 'Primary Color', type: 'color', default: '#ffd9c8' },
            { key: 'sparkColor', label: 'Spark Color',  type: 'color', default: '#ff6a52' },
            { key: 'size',       label: 'Size',         type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'claws',      label: 'Claws',        type: 'range', default: 3, min: 2, max: 5, step: 1 },
            { key: 'angle',      label: 'Angle (°)',    type: 'range', default: -50, min: -90, max: 90, step: 5 },
            { key: 'curve',      label: 'Curve',        type: 'range', default: 55, min: 0, max: 100, step: 5 },
            { key: 'sparks',     label: 'Sparks',       type: 'range', default: 12, min: 0, max: 40, step: 1 },
            { key: 'life',       label: 'Duration',     type: 'range', default: 40, min: 20, max: 90, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const cs = U.hexToRgba(p.sparkColor);
            const D = p.life;
            const a = p.angle * Math.PI / 180;
            const dir = [Math.cos(a), Math.sin(a)];
            const perp = [-dir[1], dir[0]];
            const arcH = (0.22 + (p.curve / 100) * 1.15) * 0.6;
            const T = 11;
            const kids = [];

            for (let i = 0; i < p.claws; i++) {
                // all claws move TOGETHER (one paw), spread across the stroke
                const off = (i - (p.claws - 1) / 2) * 0.62;
                const ox = perp[0] * off, oy = perp[1] * off;
                const claw = (alpha2, scaleM, lag) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(T + 5),
                                    generationTimeOffset: rf(lag + i) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(ox - dir[0] * 2.2, oy - dir[1] * 2.2, 0)),
                        velocity: rv3(v3(dir[0] * 4.4 / T, dir[1] * 4.4 / T, 0)),
                        acceleration: rv3(0),
                    },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(2.4 * scaleM, arcH * 1.1 * scaleM, 1)),
                               end: rv3(v3(3.1 * scaleM, arcH * 0.8 * scaleM, 1)),
                               params: [0, 0, 1] },
                    rendererCommon: {
                        colorTextureIndex: 0, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 6, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: alpha2 } } },
                });
                kids.push(claw(245, 1, 0));
                kids.push(claw(95, 1.15, 2));
                // lingering cut line per claw
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(18),
                                    generationTimeOffset: rf(4 + i) },
                    translation: { type: 0, refEq: -1, position: v3(ox, oy, 0.01) },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(2.6, 0.12, 1)), end: rv3(v3(2.9, 0.03, 1)),
                               params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 1, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 12, params: [0, 0, 0] } },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...cs, a: 235 } } },
                }));
            }
            kids.push(L.flash({ tex: 3, color: c, from: 1.4, to: 3.6, size: 4, duration: 9, alpha: 130 }));
            if (p.sparks > 0) {
                kids.push(L.burst({ tex: 2, color: cs, count: p.sparks, size: 0.45, speed: 0.11,
                                    gravity: 0.005, duration: Math.round(D * 0.55), cadence: 0.3 }));
            }
            return [L.act({ duration: D + 20, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Crush (Physical) ─────────────────────────────────────────────────
    // Heavy overhead smash: a descending motion blur slams down, a wide
    // flattened impact smack, a ground dust ring, chunks thrown upward
    // with gravity, and radial cracks. Bounces = follow-up smaller slams.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-crush',
        name: 'Crush',
        category: 'Physical',
        textures: ['glow_soft', 'ring_soft', 'streak', 'smoke', 'particle_hard', 'rays'],
        params: [
            { key: 'color',       label: 'Primary Color', type: 'color', default: '#ffe0a8' },
            { key: 'debrisColor', label: 'Debris Color',  type: 'color', default: '#9a7d58' },
            { key: 'size',        label: 'Size',          type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'bounces',     label: 'Bounces',       type: 'range', default: 1, min: 1, max: 3, step: 1 },
            { key: 'debris',      label: 'Debris',        type: 'range', default: 18, min: 0, max: 50, step: 1 },
            { key: 'dust',        label: 'Smoke',         type: 'toggle', default: true },
            { key: 'life',        label: 'Duration',      type: 'range', default: 50, min: 25, max: 100, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const earth = U.hexToRgba(p.debrisColor);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const kids = [];
            const T = 7;

            for (let b = 0; b < p.bounces; b++) {
                const start = b * 14;
                const m = 1 - b * 0.3;   // each bounce smaller
                // descending blur: a vertical streak slamming down to center
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(T + 2),
                                    generationTimeOffset: rf(start) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(0, 4.6 * m, 0)),
                        velocity: rv3(v3(0, -4.4 * m / T, 0)),
                        acceleration: rv3(0),
                    },
                    scaling: { type: 0, refEq: -1, scale: v3(1.1 * m, 3.4 * m, 1) },
                    rendererCommon: {
                        colorTextureIndex: 2, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 1, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 4, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 235 } } },
                }));
                // the flattened SMACK + ray star + ground ring
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(8),
                                    generationTimeOffset: rf(start + T) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(2.6 * m, 1 * m, 1)), end: rv3(v3(6.4 * m, 1.7 * m, 1)),
                               params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 0, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 6, params: [0, 0, 0] } },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...WHITE, a: 200 } } },
                }));
                kids.push(L.flash({ tex: 5, color: c, from: 2 * m, to: 5 * m, size: 5, duration: 9,
                                    alpha: 170, start: start + T }));
                kids.push(L.shockRing({ tex: 1, color: earth, size: 16 * m, from: 2, width: 0.22,
                                        duration: 16, alpha: 220, start: start + T, billboard: 2 }));
            }
            // chunks thrown up, arcing back down
            if (p.debris > 0) {
                kids.push(L.burst({ tex: 4, color: earth, color2: { r: 58, g: 46, b: 34 },
                                    count: p.debris, size: 0.6, speed: 0.13, up: true,
                                    gravity: 0.009, start: T, duration: Math.round(D * 0.7),
                                    cadence: 0.25, dust: { tex: 4, color: earth, size: 0.22 } }));
            }
            if (p.dust) {
                kids.push(L.puffs({ tex: 3, color: { r: 115, g: 100, b: 82 }, count: 7, size: 2,
                                    area: 1.6, rise: 0.012, start: T, duration: Math.round(D * 0.8),
                                    alpha: 110 }));
            }
            return [L.act({ duration: D + 24, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Arrow Hit (Physical) ─────────────────────────────────────────────
    // A shaft streaks in and STICKS: fletched arrow decelerates hard into
    // the target, quivers, impact flash + chips. Arrows 1-3 land in a
    // tight staggered group.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-arrow',
        name: 'Arrow Hit',
        category: 'Physical',
        textures: ['streak', 'glow_soft', 'particle_hard', 'flat', 'spark'],
        params: [
            { key: 'color',      label: 'Primary Color', type: 'color', default: '#e8dcc8' },
            { key: 'fletch',     label: 'Accent Color',  type: 'color', default: '#7fd0a0' },
            { key: 'size',       label: 'Size',          type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'arrows',     label: 'Arrows',        type: 'range', default: 1, min: 1, max: 3, step: 1 },
            { key: 'angle',      label: 'Angle (°)',     type: 'range', default: -145, min: -180, max: 180, step: 5 },
            { key: 'chips',      label: 'Debris',        type: 'range', default: 10, min: 0, max: 30, step: 1 },
            { key: 'life',       label: 'Duration',      type: 'range', default: 50, min: 25, max: 100, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const cf = U.hexToRgba(p.fletch);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const T = 5;   // flight is FAST
            const kids = [];

            for (let i = 0; i < p.arrows; i++) {
                const aDeg = p.angle + (i === 1 ? 9 : i === 2 ? -8 : 0);
                const a = aDeg * Math.PI / 180;
                const dir = [Math.cos(a), Math.sin(a)];
                const perp = [-dir[1], dir[0]];
                const start = i * 6;
                const hitOff = i === 0 ? [0, 0] : [perp[0] * (i === 1 ? 0.5 : -0.45), perp[1] * (i === 1 ? 0.5 : -0.45)];
                const reach = 4.2;
                const v0 = (reach * 2) / T;
                const move = (off) => ({
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(hitOff[0] - dir[0] * (reach - off), hitOff[1] - dir[1] * (reach - off), 0)),
                    velocity: rv3(v3(dir[0] * v0, dir[1] * v0, 0)),
                    acceleration: rv3(v3(-dir[0] * v0 / T, -dir[1] * v0 / T, 0)),
                });
                // shaft (long thin), sticks and stays
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(Math.round(D * 0.75)),
                                    generationTimeOffset: rf(start) },
                    translation: move(0),
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a + Math.PI / 2) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.14, 2.6, 1) },
                    rendererCommon: {
                        colorTextureIndex: 0, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 1, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 12, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 255 } } },
                }));
                // fletching: two short angled vanes riding the tail
                for (const fs of [1, -1]) {
                    kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(Math.round(D * 0.75)),
                                        generationTimeOffset: rf(start) },
                        translation: move(-1.05),
                        rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a + Math.PI / 2 + fs * 0.5) },
                        scaling: { type: 0, refEq: -1, scale: v3(0.34, 0.62, 1) },
                        rendererCommon: {
                            colorTextureIndex: 3, alphaBlend: 2,
                            fadeInType: 1, fadeIn: { frame: 1, params: [0, 0, 0] },
                            fadeOutType: 1, fadeOut: { frame: 12, params: [0, 0, 0] },
                        },
                        rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...cf, a: 235 } } },
                    }));
                }
                // flight trail + strike flash + chips
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(T + 3),
                                    generationTimeOffset: rf(start) },
                    translation: move(-1.4),
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, a + Math.PI / 2) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(0.09, 3.4, 1)), end: rv3(v3(0.02, 3.8, 1)),
                               params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 0, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 5, params: [0, 0, 0] } },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...WHITE, a: 130 } } },
                }));
                kids.push(L.flash({ tex: 1, color: WHITE, from: 0.6, to: 2.2, size: 2, duration: 7,
                                    alpha: 220, start: start + T - 1 }));
            }
            if (p.chips > 0) {
                kids.push(L.burst({ tex: 2, color: { r: 150, g: 130, b: 105 },
                                    color2: { r: 70, g: 58, b: 44 }, count: p.chips, size: 0.32,
                                    speed: 0.08, gravity: 0.007, start: T,
                                    duration: Math.round(D * 0.5), cadence: 0.3 }));
            }
            return [L.act({ duration: D + 20, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Parry (Physical) ─────────────────────────────────────────────────
    // Guard flash: a barrier ring flares at the block point, the CLANG
    // star pops, and deflection sparks ricochet off along the deflect
    // angle — the defensive beat every battle system needs.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-parry',
        name: 'Parry',
        category: 'Physical',
        textures: ['ringhard', 'glow_soft', 'spark', 'rays', 'streak'],
        params: [
            { key: 'color',      label: 'Primary Color', type: 'color', default: '#9fd0ff' },
            { key: 'sparkColor', label: 'Spark Color',  type: 'color', default: '#ffe9a0' },
            { key: 'size',       label: 'Size',         type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'angle',      label: 'Angle (°)',    type: 'range', default: 40, min: -180, max: 180, step: 5 },
            { key: 'sparks',     label: 'Sparks',       type: 'range', default: 18, min: 0, max: 50, step: 1 },
            { key: 'life',       label: 'Duration',     type: 'range', default: 40, min: 20, max: 80, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const cs = U.hexToRgba(p.sparkColor);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const a = p.angle * Math.PI / 180;
            const dir = [Math.cos(a), Math.sin(a)];
            const kids = [
                // barrier: crisp ring snapping up + inner shield glow
                B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(Math.round(D * 0.55)) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(2.2, 2.2, 1)), end: rv3(v3(3.4, 3.4, 1)),
                               params: [0, 0, 1] },
                    rendererCommon: {
                        colorTextureIndex: 0, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: Math.round(D * 0.3), params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 255 } } },
                }),
                L.glow({ tex: 1, color: c, size: 2.6, pulseTo: 3.2, duration: Math.round(D * 0.5),
                         alpha: 90 }),
                // the CLANG
                L.flash({ tex: 3, color: WHITE, from: 1, to: 4.4, size: 4, duration: 8, alpha: 235 }),
                L.flash({ tex: 1, color: cs, from: 1.6, to: 4, size: 4, duration: 10, alpha: 160 }),
            ];
            // ricochet sparks: sprayed along the deflect angle
            if (p.sparks > 0) {
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: p.sparks, life: rf(12, 28),
                                    generationTime: rf(0.3) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(dir[0] * 1.1, dir[1] * 1.1, 0)),
                        velocity: rv3(v3(dir[0] * 0.08 - 0.05, dir[1] * 0.08 - 0.05, -0.02),
                                      v3(dir[0] * 0.22 + 0.05, dir[1] * 0.22 + 0.05, 0.02)),
                        acceleration: rv3(v3(0, -0.005, 0)),
                    },
                    scaling: { type: 4, start: rf(0.4, 0.7), end: rf(0), params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 2, alphaBlend: 2 },
                    rendererParams: { allColor: { type: 0, fixed: { ...cs, a: 255 } } },
                }));
                // a few streak ricochets for punch
                for (let k = 0; k < 3; k++) {
                    const ra = a + (k - 1) * 0.35;
                    const rd = [Math.cos(ra), Math.sin(ra)];
                    kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(10),
                                        generationTimeOffset: rf(1 + k) },
                        translation: {
                            type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                            location: rv3(v3(rd[0] * 1.2, rd[1] * 1.2, 0)),
                            velocity: rv3(v3(rd[0] * 0.3, rd[1] * 0.3, 0)),
                            acceleration: rv3(0),
                        },
                        rotation: { type: 0, refEq: -1, rotation: v3(0, 0, ra + Math.PI / 2) },
                        scaling: { type: 0, refEq: -1, scale: v3(0.14, 1.3, 1) },
                        rendererCommon: { colorTextureIndex: 4, alphaBlend: 2,
                            fadeOutType: 1, fadeOut: { frame: 6, params: [0, 0, 0] } },
                        rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...cs, a: 220 } } },
                    }));
                }
            }
            return [L.act({ duration: D + 16, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Whip Crack (Physical) ────────────────────────────────────────────
    // The lash: an S-curved stroke drawn tip-ward in a few frames
    // (cascading segments), ending in a CRACK flash + tiny ring at the
    // tip with a spray of stingers.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-whip',
        name: 'Whip Crack',
        category: 'Physical',
        textures: ['streak', 'glow_soft', 'spark', 'ring_soft'],
        params: [
            { key: 'color',      label: 'Primary Color', type: 'color', default: '#e8c890' },
            { key: 'sparkColor', label: 'Spark Color',  type: 'color', default: '#ffffff' },
            { key: 'size',       label: 'Size',         type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'angle',      label: 'Angle (°)',    type: 'range', default: -20, min: -90, max: 90, step: 5 },
            { key: 'curve',      label: 'Curve',        type: 'range', default: 60, min: 10, max: 100, step: 5 },
            { key: 'life',       label: 'Duration',     type: 'range', default: 40, min: 20, max: 80, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const cs = U.hexToRgba(p.sparkColor);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const a = p.angle * Math.PI / 180;
            const ca = Math.cos(a), sa = Math.sin(a);
            const amp = 0.35 + (p.curve / 100) * 0.85;   // S depth
            const kids = [];
            // the lash path: an S from handle (left) to tip (right),
            // rotated by angle; segments appear tip-ward then vanish
            const SEGS = 16;
            const pt = (f) => {
                const x = -2.2 + f * 4.6;
                const y = Math.sin(f * Math.PI * 2) * amp * (1 - f * 0.35);
                return [x * ca - y * sa, x * sa + y * ca];
            };
            for (let s2 = 0; s2 < SEGS; s2++) {
                const f = (s2 + 0.5) / SEGS;
                const [x, y] = pt(f);
                const [x2, y2] = pt(f + 0.5 / SEGS);
                const segA = Math.atan2(y2 - y, x2 - x);
                const tOn = Math.round(f * 6);   // stroke draws in ~6 frames
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(7 + Math.round(f * 4)),
                                    generationTimeOffset: rf(tOn) },
                    translation: { type: 0, refEq: -1, position: v3(x, y, 0) },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, segA + Math.PI / 2) },
                    scaling: { type: 0, refEq: -1,
                               scale: v3(0.2 * (1 - f * 0.55), 0.62, 1) },
                    rendererCommon: {
                        colorTextureIndex: 0, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 1, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 4, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: { ...c, a: 245 } } },
                }));
            }
            // the CRACK at the tip
            const [tx, ty] = pt(1);
            kids.push(L.flash({ tex: 1, color: WHITE, from: 0.6, to: 3.2, size: 3, duration: 7,
                                alpha: 235, start: 6 }));
            kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(9),
                                generationTimeOffset: rf(6) },
                translation: { type: 0, refEq: -1, position: v3(tx, ty, 0) },
                scaling: { type: 4, start: rf(1.2), end: rf(3), params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: 3, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 7, params: [0, 0, 0] } },
                rendererParams: { allColor: { type: 0, fixed: { ...cs, a: 220 } } },
            }));
            // stingers spraying from the tip
            kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 10, life: rf(10, 20),
                                generationTime: rf(0.3), generationTimeOffset: rf(6) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(tx, ty, 0)),
                    velocity: rv3(v3(-0.08, -0.06, -0.02), v3(0.16, 0.12, 0.02)),
                    acceleration: rv3(v3(0, -0.004, 0)),
                },
                scaling: { type: 4, start: rf(0.3, 0.55), end: rf(0), params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: 2, alphaBlend: 2 },
                rendererParams: { allColor: { type: 0, fixed: { ...cs, a: 255 } } },
            }));
            return [L.act({ duration: D + 16, scale: p.size / 2.2 }, kids)];
        },
    });

    // ── Blood (Physical) ─────────────────────────────────────────────────
    // The wound dressing for every other hit: splatter with pattern
    // modes — Burst (radial spray), Spray (directional arterial jet),
    // Drip (welling drops falling) — plus splat decals that stick, a fine
    // mist, and full color control (red, alien green, ichor black…).
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'phys-blood',
        name: 'Blood',
        category: 'Physical',
        // four seeded splat variants — landed blots MORPH by crossfading
        // between two different silhouettes of the same blot
        textures: ['particle_hard', 'splat_p1', 'splat_p2', 'splat_p3', 'splat_p4', 'smoke'],
        params: [
            { key: 'color',    label: 'Primary Color', type: 'color', default: '#b31226' },
            { key: 'color2',   label: 'Accent Color',  type: 'color', default: '#5a0812' },
            { key: 'pattern',  label: 'Pattern',       type: 'select', default: 'burst',
              options: [
                  { value: 'burst', label: 'Burst' },
                  { value: 'spray', label: 'Spray' },
                  { value: 'drip', label: 'Drip' },
              ] },
            { key: 'size',     label: 'Size',          type: 'range', default: 10, min: 3, max: 24, step: 1 },
            { key: 'droplets', label: 'Debris',        type: 'range', default: 24, min: 4, max: 60, step: 1 },
            { key: 'splats',   label: 'Splats',        type: 'range', default: 4, min: 0, max: 10, step: 1 },
            { key: 'angle',    label: 'Angle (°)',     type: 'range', default: 30, min: -180, max: 180, step: 5 },
            { key: 'mist',     label: 'Mist',          type: 'toggle', default: true },
            { key: 'life',     label: 'Duration',      type: 'range', default: 55, min: 25, max: 110, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const c = U.hexToRgba(p.color);
            const c2 = U.hexToRgba(p.color2);
            const D = p.life;
            const a = p.angle * Math.PI / 180;
            const dir = [Math.cos(a), Math.sin(a)];
            const kids = [];

            // NOTHING here is additive — blood is liquid, not light.
            // 1) the gush: a dark liquid mass welling at the wound
            kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 3, life: rf(11, 17),
                                generationTime: rf(3) },
                generationLocation: { type: 0, location: rv3(v3(-0.18, -0.12, 0), v3(0.18, 0.16, 0)) },
                scaling: { type: 4, start: rf(0.45, 0.7), end: rf(1.05, 1.4), params: [0, 0.6, 1] },
                rendererCommon: { colorTextureIndex: 0, alphaBlend: 1,
                    fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 9, params: [0, 0, 0] } },
                rendererParams: { allColor: L.ease(c, 245, c2, 255) },
            }));

            // 2) liquid STRINGS: gravity movers trailing track ribbons —
            // arcing red streaks are what sells splatter as liquid.
            // Velocity profile depends on the pattern.
            const strVel = p.pattern === 'spray'
                ? rv3(v3(dir[0] * 0.09 - 0.035, dir[1] * 0.09 - 0.035, -0.02),
                      v3(dir[0] * 0.22 + 0.035, dir[1] * 0.22 + 0.035, 0.02))
                : p.pattern === 'drip'
                    ? rv3(v3(-0.015, -0.005, -0.008), v3(0.015, 0.025, 0.008))
                    : rv3(v3(-0.12, -0.03, -0.03), v3(0.12, 0.17, 0.03));
            const ribbon = (col, alphaR) => B.makeNode(RR_EfkFormat.NODE_TYPE.TRACK, {
                commonValues: { maxGeneration: 20, life: rf(9, 14), generationTime: rf(1.4) },
                rendererCommon: { colorTextureIndex: 5, alphaBlend: 1 },
                rendererParams: {
                    sizeFor: { type: 0, size: 0.02 },
                    sizeMiddle: { type: 0, size: 0.11 },
                    sizeBack: { type: 0, size: 0.05 },
                    colorLeft: { type: 0, fixed: { ...col, a: 0 } },
                    colorLeftMiddle: { type: 0, fixed: { ...col, a: 0 } },
                    colorCenter: { type: 0, fixed: { ...col, a: alphaR } },
                    colorCenterMiddle: { type: 0, fixed: { ...col, a: Math.round(alphaR * 0.8) } },
                    colorRight: { type: 0, fixed: { ...col, a: 0 } },
                    colorRightMiddle: { type: 0, fixed: { ...col, a: 0 } },
                },
            });
            kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: Math.round(p.droplets * 0.45),
                                life: rf(24, 46),
                                generationTime: rf(p.pattern === 'drip' ? 2.4 : 0.3) },
                generationLocation: { type: 0, location: rv3(v3(-0.25, -0.15, 0), v3(0.25, 0.25, 0)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0), velocity: strVel,
                    acceleration: rv3(v3(0, -(p.pattern === 'drip' ? 0.012 : 0.009), 0)),
                },
                children: [ribbon(c, 255)],
            }));

            // 3) drops: small dark beads riding the same physics (round
            // heads on the strings), shrinking as they thin out
            kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: p.droplets,
                                life: rf(18, 40),
                                generationTime: rf(p.pattern === 'drip' ? 2 : 0.22) },
                generationLocation: { type: 0, location: rv3(v3(-0.3, -0.2, 0), v3(0.3, 0.3, 0)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0), velocity: strVel,
                    acceleration: rv3(v3(0, -(p.pattern === 'drip' ? 0.012 : 0.009), 0)),
                },
                scaling: { type: 4, start: rf(0.22, 0.42), end: rf(0.08), params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: 0, alphaBlend: 1 },
                rendererParams: { allColor: L.ease(c, 255, c2, 245) },
            }));

            // 4) splat decals: land at FULL SIZE instantly (an impact, not
            // an inflating sticker), then MORPH — the first silhouette
            // crossfades into a different, slightly wider variant of the
            // same blot, reading as the liquid settling and creeping
            for (let i = 0; i < p.splats; i++) {
                const sa = p.pattern === 'spray' ? a + (i - p.splats / 2) * 0.3
                    : (i * 2.4 + 0.7) % (Math.PI * 2);
                const sd = p.pattern === 'drip' ? 0.8 + (i % 4) * 0.42
                    : 0.9 + ((i * 7) % 5) * 0.42;
                const sx = p.pattern === 'drip' ? ((i * 5) % 7 - 3) * 0.24 : Math.cos(sa) * sd;
                const sy = p.pattern === 'drip' ? -sd : Math.sin(sa) * sd * 0.8;
                const smear = 1 + ((i * 3) % 4) * 0.22;
                const sc = 0.55 + ((i * 5) % 5) * 0.24;
                const t0 = 3 + ((i * 11) % 14);
                const rot = (i * 2.1) % 6.28;
                const col = { ...(i % 3 === 1 ? c2 : c), a: i % 2 ? 215 : 250 };
                const texA = 1 + (i % 4), texB = 1 + ((i + 1) % 4);
                const MORPH = 12;   // frames of A→B crossfade
                // stage A: the fresh hit — sharp arrival, fades as B takes over
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(MORPH + 8),
                                    generationTimeOffset: rf(t0) },
                    translation: { type: 0, refEq: -1, position: v3(sx, sy, 0.01) },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, rot) },
                    scaling: { type: 0, refEq: -1,
                               scale: v3(sc * smear * 0.92, sc * 0.92, 1) },
                    rendererCommon: {
                        colorTextureIndex: texA, alphaBlend: 1,
                        fadeInType: 1, fadeIn: { frame: 1, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: MORPH, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: col } },
                }));
                // stage B: the settled blot — a DIFFERENT silhouette fading
                // in underneath, barely wider, holding until the end
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1,
                                    life: rf(Math.round(D * 0.85) - t0),
                                    generationTimeOffset: rf(t0 + 4) },
                    translation: { type: 0, refEq: -1, position: v3(sx, sy, 0.008) },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, rot) },
                    scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                               start: rv3(v3(sc * smear * 0.96, sc * 0.96, 1)),
                               end: rv3(v3(sc * smear * 1.06, sc * 1.04, 1)),
                               params: [0.2, 0.8, 1] },
                    rendererCommon: {
                        colorTextureIndex: texB, alphaBlend: 1,
                        fadeInType: 1, fadeIn: { frame: MORPH, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: Math.round(D * 0.3), params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: { type: 0, fixed: col } },
                }));
            }
            // 5) fine dark mist settling at the wound (no glow — no light)
            if (p.mist) {
                kids.push(L.puffs({ tex: 5, color: c2, count: 4, size: 1.2, area: 0.7,
                                    rise: -0.005, duration: Math.round(D * 0.55), alpha: 80 }));
            }
            return [L.act({ duration: D + 20, scale: p.size / 2.2 }, kids)];
        },
    });
})();
