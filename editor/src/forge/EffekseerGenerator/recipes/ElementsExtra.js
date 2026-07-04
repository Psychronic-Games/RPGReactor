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
                scaling: { type: 4, start: rf(sizes[0]), end: rf(sizes[1]), params: [0, 0, 0] },
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
                    scaling: { type: 4, start: rf(S * 1.0), end: rf(S * 1.25), params: [0, 0, 0] },
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
        category: 'Elements',
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
})();
