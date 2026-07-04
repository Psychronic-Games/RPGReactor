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
        textures: ['glow_soft', 'particle_hard', 'spark'],
        params: [
            { key: 'coreColor', label: 'Head Color',   type: 'color', default: '#ffeeaa' },
            { key: 'tailColor', label: 'Tail Color',   type: 'color', default: '#4466ff' },
            { key: 'angle',     label: 'Angle (°)',    type: 'range', default: -30, min: -180, max: 180, step: 5 },
            { key: 'size',      label: 'Head Size',    type: 'range', default: 5, min: 2, max: 12, step: 1 },
            { key: 'tail',      label: 'Tail Length',  type: 'range', default: 8, min: 3, max: 16, step: 1 },
            { key: 'density',   label: 'Tail Density', type: 'range', default: 12, min: 4, max: 30, step: 1 },
            { key: 'sparkles',  label: 'Sparkles',     type: 'range', default: 14, min: 0, max: 40, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const core = U.hexToRgba(p.coreColor);
            const tail = U.hexToRgba(p.tailColor);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const tailLife = Math.round(p.tail * 6);

            const head = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size * 0.35, p.size * 0.35, 1) },
                rendererCommon: { colorTextureIndex: 0 },
                rendererParams: { allColor: U.fixedColor({ ...core, a: 240 }) },
            });

            // Tail puffs stream out behind the head (local -X) and fade.
            const stream = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(Math.round(tailLife * 0.6), tailLife),
                    generationTime: rf(Math.max(0.5, 8 / p.density)),
                },
                generationLocation: { type: 0, location: rv3(v3(-0.15, -0.12, -0.12), v3(0.15, 0.12, 0.12)) },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(-0.055, -0.006, -0.006), v3(-0.03, 0.006, 0.006)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(p.size * 0.16, p.size * 0.3), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: {
                    allColor: U.easeColor({ ...core, a: 190 }, { ...tail, a: 0 }),
                },
            });

            const sparkles = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(10, 24),
                    generationTime: rf(Math.max(0.5, 20 / Math.max(1, p.sparkles))),
                },
                generationLocation: { type: 0, location: rv3(v3(-p.tail * 0.35, -0.3, -0.3), v3(0.2, 0.3, 0.3)) },
                scaling: { type: 4, start: rf(0.06, 0.16), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 2 },
                rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 255 }) },
            });

            const children = [head, stream];
            if (p.sparkles > 0) children.push(sparkles);

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, p.angle * D2R) },
                children,
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
        textures: ['glow_soft', 'ring_soft', 'particle_hard', 'smoke', 'streak', 'spark'],
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
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const core = U.hexToRgba(p.coreColor);
            const fire = U.hexToRgba(p.outerColor);
            const WHITE = { r: 255, g: 250, b: 235 };
            const D = p.life;

            // A secondary charge: smaller flash + spark spray at an offset
            // position, detonating after the primary.
            const charge = (dx, dy, dz, delay) => B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: {
                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                    maxGeneration: 1, generationTimeOffset: rf(delay),
                    life: rf(Math.round(D * 0.8)),
                },
                translation: { type: 0, refEq: -1, position: v3(dx, dy, dz) },
                children: [
                    L.flash({ tex: 0, color: WHITE, size: 3.2, duration: Math.round(D * 0.16), alpha: 235 }),
                    L.flash({ tex: 0, color: fire, size: 3.6, from: 1.4, to: 4.2, start: 1, duration: Math.round(D * 0.3), alpha: 170 }),
                    L.burst({ tex: 5, color: WHITE, color2: fire, count: 10, size: 0.35, speed: 0.07,
                              gravity: 0.002, duration: Math.round(D * 0.7), lifeJitter: 0.4 }),
                ],
            });

            const children = [
                // Act 1 — the main blast
                L.flash({ tex: 0, color: WHITE, size: 6.5, start: 0, duration: Math.round(D * 0.16), alpha: 250 }),
                L.flash({ tex: 0, color: core, size: 7, from: 3, to: 8, start: 1, duration: Math.round(D * 0.3), alpha: 210 }),
                L.flash({ tex: 0, color: fire, size: 8, from: 3.5, to: 9.5, start: 2, duration: Math.round(D * 0.45), alpha: 140 }),
                L.shockRing({ tex: 1, color: WHITE, size: 9.5, width: 0.08, count: 1, start: 0, duration: Math.round(D * 0.3) }),
                L.shockRing({ tex: 1, color: fire, size: 11, width: 0.16, count: 1, start: 3, duration: Math.round(D * 0.5), alpha: 150 }),
                // Act 2 — shrapnel: fast streaks + glowing dusted chunks
                L.burst({ tex: 4, color: WHITE, color2: fire, count: Math.round(p.debris * 0.6), size: 1.1,
                          speed: 0.11, gravity: 0.0035, start: 1, duration: Math.round(D * 0.9),
                          lifeJitter: 0.45, fadeOut: Math.round(D * 0.18) }),
                L.burst({ tex: 2, color: core, color2: fire, count: p.debris, size: 0.55, speed: 0.06,
                          gravity: 0.0042, up: true, start: 2, duration: D, lifeJitter: 0.4,
                          fadeOut: Math.round(D * 0.25), dust: { tex: 5, color: WHITE, size: 0.22 } }),
                // Act 3 — fire licks off the fireball
                L.tendrils({ tex: 0, color: fire, count: 6, speed: 0.045, curl: 0.028, tail: 16,
                             width: 0.2, start: 2, duration: Math.round(D * 0.6), alpha: 230 }),
                // Body — hot mass under it all
                L.glow({ tex: 0, color: U.dim(fire, 0.55), size: 4.5, blend: 1, alpha: 110,
                         start: 1, duration: Math.round(D * 0.8), fadeIn: 2, fadeOut: Math.round(D * 0.4) }),
                // Act 4 — aftermath embers drifting up
                L.motes({ tex: 5, color: { r: 255, g: 180, b: 90 }, count: 14, size: 0.24, radius: 1.8,
                          vy: 0.022, start: Math.round(D * 0.3), duration: Math.round(D * 1.1), cadence: 2 }),
            ];
            for (let i = 0; i < p.charges; i++) {
                const a = (i / Math.max(1, p.charges)) * Math.PI * 2 + 0.7;
                children.push(charge(Math.cos(a) * 2.6, Math.sin(a) * 1.4 + 0.6,
                                     Math.sin(a * 1.7 + 1) * 2.2, Math.round(D * (0.12 + i * 0.09))));
            }
            if (p.smoke) {
                children.push(L.puffs({ tex: 3, color: { r: 26, g: 22, b: 20 }, count: 9, size: 2.4, area: 1.2,
                                        rise: 0.032, alpha: 150, start: Math.round(D * 0.18), duration: Math.round(D * 1.5) }));
            }

            const S = p.size * 0.09;
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: {
                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                    maxGeneration: 1, life: rf(Math.round(D * 2.6) + 30), removeWhenChildrenIsExtinct: 1,
                },
                scaling: { type: 0, refEq: -1, scale: v3(S, S, S) },
                children,
            })];
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
        textures: ['ring_soft', 'streak', 'particle_hard', 'glow_soft', 'smoke'],
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
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3, v2 } = B;
            const wave = U.hexToRgba(p.waveColor);
            const deb = U.hexToRgba(p.debrisColor);
            const S = p.size;

            // Expanding rings, flat on the ground (rings' native plane).
            const rings = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: {
                    maxGeneration: p.rings,
                    life: rf(Math.round(p.life * 0.7)),
                    generationTime: rf(Math.max(1, Math.round(p.life * 0.15))),
                },
                scaling: { type: 4, start: rf(S * 0.1), end: rf(S * 1.1), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 0,
                    fadeOutType: 1, fadeOut: { frame: Math.round(p.life * 0.4), params: [0, 0, 0] },
                },
                rendererParams: {
                    vertexCount: 40,
                    outerLocation: { type: 0, location: v2(1.08, 0) },
                    innerLocation: { type: 0, location: v2(0.82, 0) },
                    outerColor: U.fixedColor({ ...wave, a: 0 }),
                    centerColor: U.fixedColor({ ...wave, a: 210 }),
                    innerColor: U.fixedColor({ ...wave, a: 0 }),
                },
            });

            const flash = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { maxGeneration: 1, life: rf(Math.round(p.life * 0.25)) },
                scaling: {
                    type: 2,
                    refEqS: rf(-1), refEqE: rf(-1),
                    start: rv3(S * 0.3), end: rv3(S * 0.7),
                    params: [0, 0, 0],
                },
                rendererCommon: {
                    colorTextureIndex: 3,
                    fadeOutType: 1, fadeOut: { frame: Math.round(p.life * 0.2), params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 210 }) },
            });

            // Rolling dust wave chasing the ring along the ground.
            const dust = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    maxGeneration: 14,
                    life: rf(Math.round(p.life * 0.6), p.life),
                    generationTime: rf(1),
                    generationTimeOffset: rf(0, Math.round(p.life * 0.25)),
                },
                generationLocation: {
                    type: 3, division: 14, radius: rf(S * 0.25, S * 0.4),
                    angleStart: rf(0), angleEnd: rf(360),
                    circleType: 0, axisDirection: 1, angleNoize: rf(0),
                },
                localForceField: {
                    elements: [{ type: 9, control: -1.1, minRange: 0, maxRange: S * 2 }],   // repulsion → rolls outward
                    locationAbs: { type: 0 },
                },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                    velocity: rv3(v3(0, 0, -0.02), v3(0, 0, 0.02)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(S * 0.06, S * 0.12), end: rf(S * 0.22, S * 0.3), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 4,
                    alphaBlend: 1,   // dust is murky, not glowing
                    fadeInType: 1, fadeIn: { frame: 6, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: Math.round(p.life * 0.45), params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...U.dim(deb, 1.1), a: 95 }) },
            });

            const nodes = [rings, flash, dust];

            if (p.cracks > 0) {
                // Radial streaks lying flat: fixed-orientation quads spun
                // to a random heading, anchored at the center and extending
                // outward (positions run 0..1 in X instead of -0.5..0.5).
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: {
                        maxGeneration: p.cracks,
                        life: rf(Math.round(p.life * 0.7), p.life),
                        generationTime: rf(0.4),
                    },
                    rotation: {
                        type: 1,
                        refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        rotation: rv3(v3(-Math.PI / 2, 0, 0), v3(-Math.PI / 2, Math.PI * 2, 0)),
                        velocity: rv3(0),
                        acceleration: rv3(0),
                    },
                    scaling: {
                        type: 2,
                        refEqS: rf(-1), refEqE: rf(-1),
                        start: rv3(v3(S * 0.15, S * 0.02, 1), v3(S * 0.3, S * 0.05, 1)),
                        end: rv3(v3(S * 0.7, S * 0.03, 1), v3(S * 1.05, S * 0.07, 1)),
                        params: [0, 0, 0],
                    },
                    rendererCommon: {
                        colorTextureIndex: 1,
                        fadeOutType: 1, fadeOut: { frame: Math.round(p.life * 0.35), params: [0, 0, 0] },
                    },
                    rendererParams: {
                        billboard: 2,   // fixed — lives in the ground plane
                        positions: { ll: v2(0, -0.5), lr: v2(1, -0.5), ul: v2(0, 0.5), ur: v2(1, 0.5) },
                        allColor: U.fixedColor({ ...wave, a: 170 }),
                    },
                }));
            }

            if (p.debris > 0) {
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: {
                        maxGeneration: p.debris,
                        life: rf(Math.round(p.life * 0.5), p.life),
                        generationTime: rf(0.3),
                    },
                    generationLocation: {
                        type: 3, division: 16, radius: rf(S * 0.1, S * 0.4),
                        angleStart: rf(0), angleEnd: rf(360),
                        circleType: 0, axisDirection: 1, angleNoize: rf(0),
                    },
                    translation: {
                        type: 1,
                        refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(0),
                        velocity: rv3(v3(-S * 0.008, S * 0.02, -S * 0.008), v3(S * 0.008, S * 0.045, S * 0.008)),
                        acceleration: rv3(v3(0, -S * 0.0025, 0)),
                    },
                    scaling: { type: 3, position: rf(S * 0.03, S * 0.07), velocity: rf(0), acceleration: rf(0) },
                    rendererCommon: {
                        colorTextureIndex: 2,
                        fadeOutType: 1, fadeOut: { frame: Math.round(p.life * 0.25), params: [0, 0, 0] },
                    },
                    rendererParams: { allColor: U.fixedColor({ ...deb, a: 230 }) },
                }));
            }

            // Tilt the whole ground plane toward the camera (the AG's
            // -70° default view) — head-on, a flat ring is an invisible
            // line and all you see is debris bouncing.
            const D2R2 = Math.PI / 180;
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: {
                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                    maxGeneration: 1, life: rf(p.life + 10),
                    removeWhenChildrenIsExtinct: 1,
                },
                rotation: { type: 0, refEq: -1, rotation: v3(-70 * D2R2, 0, 0) },
                children: nodes,
            })];
        },
    });
})();
