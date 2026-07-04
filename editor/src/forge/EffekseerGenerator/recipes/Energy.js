/**
 * Energy family — Effekseer counterparts of the standard Animation
 * Generator's Energy category.
 *
 *   • Energy Ball  — pulsing core + two orbital rings + circling motes
 *   • Energy Beam  — solid cylinder column with scrolling energy + caps
 *   • Aurora       — drifting vertical curtains + starfield glints
 *   • Black Hole   — dark core + accretion ring + infalling sparks
 *                    (uses a real AttractiveForce field)
 *   • Portal       — rippling event-horizon disc + rim + drifting motes
 *   • Energy Field — wire-sphere bubble + fresnel rim + surface sparks
 *   • Energy Wisps — rainbow trail tendrils curling out of a bright core
 *   • Holy Aura    — rotating ray fan + golden glow + rising motes
 *   • Magic Circle — ground sigil: rings, rune ticks, star, sparkles
 *   • Teleport Column — rising stacked rings + particles + data glints
 *
 * The first four are seamless fixed-length loops. The rest are
 * CONTINUOUS: they emit forever (the engine stops the handle when the
 * animation window ends) and declare `prewarm`, so the preview
 * pre-simulates into steady state — no loop point exists at all.
 */
(function () {
    const D2R = Math.PI / 180;
    const LONG = 36000;   // "forever" for continuous recipes (10 min @ 60fps)

    // ── Energy Ball ──────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'energy-ball',
        name: 'Energy Ball',
        category: 'Energy',
        continuous: true,
        prewarm: 60,
        textures: ['glow_soft', 'ring_soft', 'particle_hard', 'noise', 'rays', 'spark', 'streak', 'shard', 'slash'],
        params: [
            { key: 'color',  label: 'Energy Color', type: 'color', default: '#66c8ff' },
            { key: 'accent', label: 'Ring Color',   type: 'color', default: '#ffffff' },
            { key: 'size',   label: 'Size',         type: 'range', default: 5, min: 2, max: 12, step: 1 },
            { key: 'spin',   label: 'Orbit Speed',  type: 'range', default: 40, min: 5, max: 150, step: 1 },
            { key: 'motes',  label: 'Motes',        type: 'range', default: 12, min: 0, max: 40, step: 1 },
            { key: 'shells', label: 'Energy Arcs',  type: 'range', default: 4, min: 0, max: 8, step: 1 },
            { key: 'bolts',  label: 'Plasma Bolts', type: 'range', default: 4, min: 0, max: 24, step: 1 },
            { key: 'pulse',  label: 'Pulse Rate',   type: 'range', default: 10, min: 2, max: 20, step: 1 },
            { key: 'life',   label: 'Loop Length',  type: 'range', default: 120, min: 30, max: 300, step: 1 },
        ],
        buildModels(p, M) {
            const geo = M.buildGeometry('sphere', { style: 'solid', thickness: 0.01 });
            return [{ path: `Model/rr_ebplasma_v${M.MESH_REV || 1}.efkmodel`, mesh: geo.mesh }];
        },
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const col = U.hexToRgba(p.color);
            const acc = U.hexToRgba(p.accent);
            const WHITE = { r: 255, g: 255, b: 255 };
            const LONG = 36000;
            const S = p.size;
            const w = p.spin * (Math.PI / 180) / 60;     // orbit rad/frame
            const D2Re = Math.PI / 180;

            // Screen-plane churning plasma layer (noise texture spinning)
            const churn = (size, alpha, zSpin, tex) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                    velocity: rv3(v3(0, 0, zSpin)), acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(size, size, 1) },
                rendererCommon: { colorTextureIndex: tex, alphaBlend: 2 },
                rendererParams: { allColor: L.fixed(alpha.c, alpha.a) },
            });

            // Flickering ray star: each generation spawns at a fresh
            // random angle and crossfades into the last — the spike
            // pattern itself keeps changing instead of reading as a
            // static stamp.
            // World-anchored (billboard: 2): rotating the camera around
            // the ball parallaxes the planes and shows the spin — a
            // camera-facing billboard would look frozen from every angle.
            const HPI = Math.PI / 2;
            const AXES = {
                z: { min: v3(0, 0, -3.14), max: v3(0, 0, 3.14), vel: (sp) => v3(0, 0, sp) },
                x: { min: v3(-3.14, HPI, 0), max: v3(3.14, HPI, 0), vel: (sp) => v3(sp, 0, 0) },
                y: { min: v3(HPI, -3.14, 0), max: v3(HPI, 3.14, 0), vel: (sp) => v3(0, sp, 0) },
            };
            const rayFlicker = (size, alpha, spin, cycle, axis) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...L.BIND, maxGeneration: 99999, life: rf(cycle),
                    generationTime: rf(Math.round(cycle / 2)),
                },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(AXES[axis].min, AXES[axis].max),
                    velocity: rv3(AXES[axis].vel(spin)), acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(size * 0.88), end: rf(size * 1.1), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 4, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: Math.round(cycle * 0.35), params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: Math.round(cycle * 0.4), params: [0, 0, 0] },
                },
                rendererParams: { billboard: 2, allColor: L.fixed(alpha.c, alpha.a) },
            });

            // Orbiting bead streams: sparks marching in order around
            // around the orb by tilted spinners, each twirling as it rides
            // — spiral energy strips, not flat ring bands.
            const shell = (radius, tilt, tiltZ, speed, alpha) => B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(tilt, 0, tiltZ)), velocity: rv3(v3(0, speed, 0)), acceleration: rv3(0),
                },
                children: [B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { maxGeneration: 99999, life: rf(24, 32), generationTime: rf(1.6, 2.4),
                                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2 },
                    generationLocation: { type: 3, division: 28, radius: rf(radius * 0.97, radius * 1.03),
                                          angleStart: rf(0), angleEnd: rf(360), circleType: 0, axisDirection: 1, angleNoize: rf(2) },
                    rotation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                        velocity: rv3(v3(0, 0, -Math.max(0.05, Math.abs(speed) * 1.8)), v3(0, 0, Math.max(0.05, Math.abs(speed) * 1.8))),
                        acceleration: rv3(0),
                    },
                    scaling: { type: 4, start: rf(0.55, 0.75), end: rf(0.15), params: [0, 0, 0] },
                    rendererCommon: {
                        colorTextureIndex: 5, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 3, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] },
                    },
                    rendererParams: { allColor: U.easeColor({ r: 255, g: 255, b: 255, a: Math.min(255, alpha + 55) }, { ...col, a: 0 }) },
                })],
            });

            // Plasma-globe bolts: movers strike OUT from the electrode
            // toward the shell (never backward, per the reference), jagged
            // via turbulence, dying as they reach the glass — each drops a
            // white-hot ribbon = a bolt that constantly re-strikes.
            const boltSpeed = S * 0.03;
            const filaments = Array.from({ length: p.bolts }, (_, i) => i).map((i) => B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3((25 + i * 40) * D2Re, 0, i * 1.4)),
                    velocity: rv3(v3(0, w * (0.8 + i * 0.25) * (i % 2 ? -1 : 1), 0)), acceleration: rv3(0),
                },
                children: [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: { maxGeneration: 99999, life: rf(16, 24), generationTime: rf(6 + i * 3),
                                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2 },
                    generationLocation: { type: 1, radius: rf(S * 0.1, S * 0.16), rotationX: rf(0, 360), rotationY: rf(0, 360) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(0),
                        velocity: rv3(v3(-boltSpeed, -boltSpeed, -boltSpeed), v3(boltSpeed, boltSpeed, boltSpeed)),
                        acceleration: rv3(0),
                    },
                    localForceField: {
                        elements: [{ type: 1, seed: 3 + i, scale: 0.7, strength: 0.03, octave: 1 }],
                        locationAbs: { type: 0 },
                    },
                    children: [B.makeNode(RR_EfkFormat.NODE_TYPE.TRACK, {
                        commonValues: { maxGeneration: 16, life: rf(9, 14), generationTime: rf(1.5) },
                        rendererCommon: { colorTextureIndex: 0, alphaBlend: 2 },
                        rendererParams: {
                            sizeFor: { type: 0, size: 0 },
                            sizeMiddle: { type: 0, size: 0.09 },
                            sizeBack: { type: 0, size: 0.01 },
                            colorLeft: { type: 0, fixed: { ...acc, a: 0 } },
                            colorLeftMiddle: { type: 0, fixed: { ...acc, a: 0 } },
                            colorCenter: { type: 0, fixed: { ...WHITE, a: 235 } },
                            colorCenterMiddle: { type: 0, fixed: { ...acc, a: 160 } },
                            colorRight: { type: 0, fixed: { ...acc, a: 0 } },
                            colorRightMiddle: { type: 0, fixed: { ...acc, a: 0 } },
                        },
                    })],
                })],
            }));

            // Surface discharge glints: brief bright pops on the shell
            const discharges = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...L.BIND, maxGeneration: 99999, life: rf(5, 10), generationTime: rf(3, 7) },
                generationLocation: { type: 1, radius: rf(S * 0.5, S * 0.6), rotationX: rf(0, 360), rotationY: rf(0, 360) },
                scaling: { type: 4, start: rf(0.5, 0.9), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 5, alphaBlend: 2 },
                rendererParams: { allColor: L.fixed(WHITE, 255) },
            });

            // Breathing layer: overlapping regenerating sprites, each one
            // swelling from -> to over its life with crossfading alpha, so
            // the heart visibly throbs forever (a LONG-life ease is a
            // ten-minute breath = looks frozen).
            const pulse = (from, to, cycleBase, alpha, tex, offset) => {
                const cycle = Math.max(8, Math.round(cycleBase * 10 / p.pulse));
                return B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...L.BIND, maxGeneration: 99999, life: rf(cycle),
                    generationTime: rf(Math.round(cycle / 2)),
                    generationTimeOffset: rf(offset || 0),
                },
                scaling: { type: 4, start: rf(from), end: rf(to), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: tex ?? 0, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: Math.round(cycle * 0.35), params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: Math.round(cycle * 0.4), params: [0, 0, 0] },
                },
                rendererParams: { allColor: L.fixed(alpha.c, alpha.a) },
            });
            };

            const kids = [
                // layered heart: throbbing white core inside a breathing
                // colored envelope, wrapped in counter-churning skins
                L.glow({ tex: 0, color: WHITE, size: S * 0.32, duration: LONG, alpha: 235 }),
                pulse(S * 0.3, S * 0.5, 34, { c: WHITE, a: 200 }, 0),
                pulse(S * 0.6, S * 0.9, 52, { c: col, a: 190 }, 0),
                pulse(S * 0.75, S * 0.62, 52, { c: col, a: 150 }, 0, 26),
                churn(S * 1.05, { c: col, a: 235 }, 0.032, 3),
                churn(S * 0.95, { c: acc, a: 130 }, -0.042, 3),
                pulse(S * 0.85, S * 1.15, 44, { c: col, a: 120 }, 3, 15),
                // corona: faint filament star + breathing halo
                rayFlicker(S * 1.75, { c: col, a: 95 }, Math.max(0.035, w * 1.2), 46, 'z'),
                rayFlicker(S * 1.55, { c: acc, a: 75 }, -Math.max(0.025, w * 0.8), 34, 'x'),
                rayFlicker(S * 1.35, { c: WHITE, a: 65 }, Math.max(0.05, w * 1.7), 26, 'y'),
                pulse(S * 1.9, S * 2.35, 80, { c: col, a: 55 }, 0),
                // shells + filaments + discharges
                ...Array.from({ length: p.shells }, (_, i) => shell(
                    S * (0.88 + i * 0.12),
                    (40 + i * 34) * D2Re,
                    i * 0.85,
                    w * (1.1 + i * 0.28) * (i % 2 ? -1 : 1),
                    200 - i * 14)),
                // 3D plasma sphere: mottled solid sphere tumbling on two
                // axes inside the billboard skins (geometry spin — solids
                // must never UV-scroll or the poles churn)
                B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                    rotation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        rotation: rv3(0),
                        velocity: rv3(v3(w * 0.5, w * 1.3, 0)), acceleration: rv3(0),
                    },
                    scaling: { type: 0, refEq: -1, scale: v3(S * 0.52, S * 0.52, S * 0.52) },
                    rendererCommon: { colorTextureIndex: 3, alphaBlend: 2 },
                    rendererParams: { modelIndex: 0, culling: 1, billboard: 2, allColor: L.fixed(col, 210) },
                }),
                ...filaments,
            ];
            if (p.motes > 0) {
                kids.push(discharges);
                kids.push(L.motes({ tex: 5, color: acc, count: p.motes, size: 0.28, radius: S * 0.9, vy: 0.012,
                                    duration: p.life, cadence: Math.max(1, p.life / p.motes), stream: true }));
            }
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                children: kids,
            })];
        },
    });

    // ── Energy Beam ──────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'energy-beam',
        name: 'Energy Beam',
        category: 'Energy',
        continuous: true,
        prewarm: 40,
        textures: ['streak', 'glow_soft'],
        params: [
            { key: 'color',  label: 'Beam Color',  type: 'color', default: '#7fe6ff' },
            { key: 'width',  label: 'Width',       type: 'range', default: 4, min: 1, max: 12, step: 1 },
            { key: 'height', label: 'Height',      type: 'range', default: 14, min: 1, max: 30, step: 1 },
            { key: 'flow',   label: 'Energy Flow', type: 'range', default: 10, min: 1, max: 20, step: 1 },
            { key: 'life',   label: 'Loop Length', type: 'range', default: 120, min: 30, max: 300, step: 1 },
        ],
        buildModels(p, M) {
            const geo = M.buildGeometry('cylinder', { style: 'solid' });
            return [{ path: 'Model/rr_geo_cylinder_solid_t5.efkmodel', mesh: geo.mesh }];
        },
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const c = U.hexToRgba(p.color);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const flowV = Math.max(1, Math.round(p.flow * 0.004 * p.life)) / p.life;

            // Three concentric cylinder layers — near-white core, colored
            // sheath with a DIAGONAL scroll (reads as energy spiraling up
            // the beam), and a wide soft halo. Single-layer beams look
            // like glowing pipes; layering is what sells "energy".
            const layer = (radiusMul, alpha, color, uvSpeed, wraps) => B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(p.width * radiusMul, p.height * 0.45, p.width * radiusMul) },
                rendererCommon: {
                    colorTextureIndex: 0,
                    uv: {
                        type: 3,
                        position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                        // Multiple wraps around the circumference — a single
                        // wrap parks the streak's bright band on ONE side and
                        // the whole beam reads off-center.
                        size: { max: { x: wraps, y: 1 }, min: { x: wraps, y: 1 } },
                        speed: { max: uvSpeed, min: uvSpeed },
                    },
                },
                rendererParams: { modelIndex: 0, allColor: U.fixedColor({ ...color, a: alpha }) },
            });

            const core = layer(0.16, 255, { r: 255, g: 255, b: 255 }, { x: 0, y: -flowV * 1.6 }, 4);
            const sheath = layer(0.36, 150, c, { x: flowV * 0.5, y: -flowV }, 3);   // diagonal → spiral
            const halo = layer(0.58, 45, c, { x: 0, y: -flowV * 0.6 }, 2);

            // Source charge (bottom) and muzzle burst (top): layered glows
            // plus a stream of sparks spraying off the tip.
            const cap = (y, scale, alpha) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                translation: { type: 0, refEq: -1, position: v3(0, y, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(scale, scale, scale) },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { allColor: U.fixedColor({ ...c, a: alpha }) },
            });
            const capCore = (y, scale) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                translation: { type: 0, refEq: -1, position: v3(0, y, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(scale, scale, scale) },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 235 }) },
            });

            const tipSparks = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(8, 18),
                    generationTime: rf(1.2),
                },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(-p.width * 0.2, p.height * 0.48, -p.width * 0.2),
                                  v3(p.width * 0.2, p.height * 0.52, p.width * 0.2)),
                    velocity: rv3(v3(-0.06, 0.04, -0.06), v3(0.06, 0.16, 0.06)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(0.2, 0.5), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { allColor: U.easeColor({ r: 255, g: 255, b: 255, a: 255 }, { ...c, a: 0 }) },
            });

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                children: [
                    halo, sheath, core,
                    cap(-p.height * 0.5, p.width * 1.1, 200), capCore(-p.height * 0.5, p.width * 0.55),
                    cap(p.height * 0.5, p.width * 0.85, 220), capCore(p.height * 0.5, p.width * 0.45),
                    tipSparks,
                ],
            })];
        },
    });

    // ── Aurora ───────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'aurora',
        name: 'Aurora',
        category: 'Energy',
        continuous: true,
        prewarm: 150,
        textures: ['streak', 'spark', 'noise', 'glow_soft'],
        params: [
            { key: 'color',    label: 'Curtain Color', type: 'color', default: '#52ffb8' },
            { key: 'color2',   label: 'Fringe Color',  type: 'color', default: '#7f7fff' },
            { key: 'curtains', label: 'Curtains',      type: 'range', default: 7, min: 3, max: 16, step: 1 },
            { key: 'width',    label: 'Width',         type: 'range', default: 16, min: 6, max: 30, step: 1 },
            { key: 'stars',    label: 'Stars',         type: 'range', default: 10, min: 0, max: 30, step: 1 },
            { key: 'life',     label: 'Loop Length',   type: 'range', default: 150, min: 60, max: 300, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const main = U.hexToRgba(p.color);
            const fringe = U.hexToRgba(p.color2);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const W = p.width * 0.5;
            const D = p.life;

            // SIGNATURE: undulating light curtains — tall shimmering
            // panels that breathe and drift, main color banded with the
            // fringe color. (Energy is Y-flipped in the editor, so the
            // sky band sits at +y and shimmer drifts -y to read as
            // upward.)
            const kids = [];
            // Two overlapping rows (front = main color, back = fringe,
            // offset half a step and deeper) — panels wide enough to
            // merge into one flowing sheet instead of a picket fence.
            const row = (colorRow, zBase, xShift, alphaMul, hMul) => {
                for (let i = 0; i < p.curtains; i++) {
                    const spacing = 2 * W / p.curtains;
                    const x = -W + (i + 0.5) * spacing + xShift;
                    const h = (4.6 + ((i * 53) % 5) * 0.7) * hMul;
                    const cycle = 60 + ((i * 37) % 50);
                    kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(cycle),
                                        generationTime: rf(Math.round(cycle / 2)),
                                        generationTimeOffset: rf((i * 13) % 40) },
                        translation: {
                            type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                            location: rv3(v3(x - 0.3, 1.4, zBase - 0.2), v3(x + 0.3, 2.1, zBase + 0.2)),
                            velocity: rv3(v3(-0.007, -0.004, 0), v3(0.007, -0.001, 0)),
                            acceleration: rv3(0),
                        },
                        rotation: { type: 0, refEq: -1, rotation: v3(0, 0, ((i * 29) % 13 - 6) * 0.016) },
                        scaling: { type: 0, refEq: -1, scale: v3(spacing * 2.8, h, 1) },
                        rendererCommon: {
                            colorTextureIndex: 0, alphaBlend: 2,
                            fadeInType: 1, fadeIn: { frame: Math.round(cycle * 0.35), params: [0, 0, 0] },
                            fadeOutType: 1, fadeOut: { frame: Math.round(cycle * 0.4), params: [0, 0, 0] },
                        },
                        rendererParams: { billboard: 2, allColor: L.fixed(colorRow, Math.round(70 * alphaMul)) },
                    }));
                    // shimmer striation riding each panel
                    kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(Math.round(cycle * 0.7)),
                                        generationTime: rf(Math.round(cycle * 0.35)),
                                        generationTimeOffset: rf((i * 23) % 30) },
                        translation: { type: 0, refEq: -1, position: v3(x, 1.75, zBase + 0.1) },
                        scaling: { type: 4, start: rf(spacing * 0.5), end: rf(spacing * 0.9), params: [0, 0, 0] },
                        rendererCommon: {
                            colorTextureIndex: 2, alphaBlend: 2,
                            uv: { type: 3,
                                  position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                                  size: { max: { x: 1, y: 2 }, min: { x: 1, y: 2 } },
                                  speed: { max: { x: 0, y: 0.008 }, min: { x: 0, y: 0.008 } } },
                            fadeInType: 1, fadeIn: { frame: Math.round(cycle * 0.25), params: [0, 0, 0] },
                            fadeOutType: 1, fadeOut: { frame: Math.round(cycle * 0.28), params: [0, 0, 0] },
                        },
                        rendererParams: { billboard: 2, allColor: L.fixed(colorRow, 55) },
                    }));
                }
            };
            row(main, -0.3, 0, 1.0, 1.0);
            row(fringe, -1.0, W / p.curtains, 0.75, 1.25);
            // sky wash behind the curtains
            kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(36000) },
                translation: { type: 0, refEq: -1, position: v3(0, 2.2, -1.6) },
                scaling: { type: 0, refEq: -1, scale: v3(W * 2.4, 4.4, 1) },
                rendererCommon: { colorTextureIndex: 3, alphaBlend: 2 },
                rendererParams: { allColor: L.fixed(U.dim(main, 0.5), 40) },
            }));
            if (p.stars > 0) {
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(20, 45),
                                    generationTime: rf(Math.max(1, 60 / p.stars)) },
                    generationLocation: { type: 0, location: rv3(v3(-W * 1.2, 0.5, -2), v3(W * 1.2, 4.5, -1)) },
                    scaling: { type: 4, start: rf(0.12, 0.3), end: rf(0.05), params: [0, 0, 0] },
                    rendererCommon: { colorTextureIndex: 1, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                    rendererParams: { allColor: L.fixed({ r: 255, g: 255, b: 255 }, 220) },
                }));
            }
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(36000) },
                children: kids,
            })];
        },
    });

    // ── Black Hole ───────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'black-hole',
        name: 'Black Hole',
        category: 'Energy',
        continuous: true,
        prewarm: 90,
        textures: ['glow_soft', 'ring_soft', 'particle_hard', 'streak', 'smoke', 'noise', 'spark'],
        params: [
            { key: 'color',  label: 'Accretion Color', type: 'color', default: '#f2b570' },
            { key: 'size',   label: 'Size',            type: 'range', default: 6, min: 2, max: 14, step: 1 },
            { key: 'spin',   label: 'Spin (°/s)',      type: 'range', default: 60, min: 10, max: 180, step: 1 },
            { key: 'debris', label: 'Infalling Debris', type: 'range', default: 24, min: 4, max: 60, step: 1 },
            { key: 'density', label: 'Disk Material', type: 'range', default: 10, min: 2, max: 20, step: 1 },
            { key: 'life',   label: 'Loop Length',     type: 'range', default: 150, min: 60, max: 300, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const col = U.hexToRgba(p.color);
            const ember = U.dim(col, 0.35);          // dark outer ramp stop
            const deep = U.dim(col, 0.14);           // near-black rim
            const WHITE = { r: 255, g: 255, b: 255 };
            const LONG = 36000;
            const spin = p.spin * (Math.PI / 180) / 60;
            const D2Rl = Math.PI / 180;
            // Singularity proportions: thin disk out to ~3.8x the horizon,
            // differential rotation (inner fast), cream-gold -> ember -> black.
            const H = p.size * 0.75;                 // event horizon diameter

            const horizon = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(H, H, 1) },
                rendererCommon: { colorTextureIndex: 2, alphaBlend: 1 },
                rendererParams: { allColor: L.fixed({ r: 0, g: 0, b: 0 }, 255) },
            });
            const shadowHalo = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(H * 1.6, H * 1.6, 1) },
                rendererCommon: { colorTextureIndex: 0, alphaBlend: 1 },
                rendererParams: { allColor: L.fixed({ r: 0, g: 0, b: 0 }, 205) },
            });
            const photon = L.shockRing({ tex: 1, color: WHITE, size: H * 1.06, from: H * 1.06, width: 0.05,
                                         duration: LONG, alpha: 255 });
            const photonGlow = L.shockRing({ tex: 1, color: col, size: H * 1.15, from: H * 1.12, width: 0.12,
                                             duration: LONG, alpha: 150 });

            // One streak-scrolled disk band (tilted nearly edge-on: thin disk)
            const band = (size, width, inner, center, alphaC, tilt, speed, uvSpeed, tex, reps) => B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(tilt, 0, 0)), velocity: rv3(v3(0, speed, 0)), acceleration: rv3(0),
                },
                children: [B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                    commonValues: { maxGeneration: 1, life: rf(LONG), translationBindType: 2, rotationBindType: 2, scalingBindType: 2 },
                    scaling: { type: 0, refEq: -1, scale: v3(size, size, size) },
                    rendererCommon: {
                        colorTextureIndex: tex, alphaBlend: 2,
                        uv: { type: 3,
                              position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                              size: { max: { x: reps, y: 1 }, min: { x: reps, y: 1 } },
                              speed: { max: { x: uvSpeed, y: 0 }, min: { x: uvSpeed, y: 0 } } },
                    },
                    rendererParams: {
                        billboard: 2, vertexCount: 64,
                        outerLocation: { type: 0, location: { x: 1 + width, y: 0 } },
                        innerLocation: { type: 0, location: { x: 1 - width, y: 0 } },
                        outerColor: L.fixed(deep, 0),
                        centerColor: L.fixed(center, alphaC),
                        innerColor: L.fixed(inner, Math.round(alphaC * 0.85)),
                    },
                })],
            });

            const TILT = 80 * D2Rl;
            const dens = p.density / 10;
            const A = (a) => Math.min(255, Math.round(a * dens));
            const disk = [
                // inner: white-hot edge, cream-gold body, fastest spin
                band(H * 1.5, 0.3, WHITE, col, A(255), TILT, spin * 2.0, 0.02, 5, 2),
                band(H * 1.55, 0.26, col, col, A(200), TILT, spin * 1.7, 0.015, 5, 3),
                // hot filament stream threading the inner disk
                band(H * 1.45, 0.06, WHITE, WHITE, A(235), TILT, spin * 2.2, 0.024, 3, 8),
                // mid: gold -> ember
                band(H * 2.3, 0.32, col, ember, A(220), TILT, spin * 1.2, 0.012, 5, 3),
                // outer: ember fading to black rim, slow
                band(H * 3.4, 0.3, ember, deep, A(160), TILT, spin * 0.6, 0.008, 5, 2),
            ];

            if (p.density >= 13) {
                disk.push(band(H * 2.1, 0.05, WHITE, col, A(180), TILT, spin * 1.5, 0.02, 3, 6));
            }
            const infall = B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(TILT, 0, 0)), velocity: rv3(v3(0, spin * 1.7, 0)), acceleration: rv3(0),
                },
                children: [B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { maxGeneration: 99999, life: rf(Math.round(p.life * 0.35), Math.round(p.life * 0.6)), generationTime: rf(Math.max(0.6, p.life / p.debris)),
                                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2 },
                    generationLocation: { type: 3, division: 24, radius: rf(H * 1.2, H * 2.1),
                                          angleStart: rf(0), angleEnd: rf(360), circleType: 0, axisDirection: 1, angleNoize: rf(8) },
                    scaling: { type: 4, start: rf(0.15, 0.4), end: rf(0), params: [0, 0, 0] },
                    rendererCommon: { colorTextureIndex: 6, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] } },
                    rendererParams: { allColor: U.easeColor({ ...WHITE, a: 230 }, { ...col, a: 0 }) },
                })],
            });

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(LONG) },
                children: [shadowHalo, horizon, photon, photonGlow, ...disk, infall],
            })];
        },
    });

    // ── Portal ───────────────────────────────────────────────────────────
    // Stargate event horizon with the standard Animation Generator's REAL
    // water-ripple surface: the AG portal's discrete-wave-equation sim
    // (rain-driven ripples + per-pixel refraction) is baked into a
    // sprite-sheet texture and played back on a camera-facing quad, with
    // an additive halo ring and motes falling in through an attractive
    // force field for 3D depth around it.
    (function () {
        const hash = (s) => {
            let h = 5381;
            for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
            return h.toString(36);
        };
        const FRAMES = 96, CELL = 192, COLS = 8;   // 8×12 sheet, ~1.6s loop
        const mapParams = (p) => ({
            color1: p.color,
            color2: p.edge,
            color3: p.glowColor,
            rainCount: p.rain,
            lightRefraction: p.refraction,
            size: 0.95,
            radius: 0.95,
            centralGlow: 0.6,
            outerRing: 0.35,
        });
        // The WASM core caches textures by path, so the path must change
        // with the baked params or slider changes would show stale pixels.
        const texPath = (p) => `Texture/rr_bake_portal_${hash(JSON.stringify(mapParams(p)))}.png`;

        RR_EFK_RECIPE_REGISTRY.push({
            id: 'portal',
            name: 'Portal',
            category: 'Energy',
            continuous: true,
            prewarm: 60,
            bake: { animationId: 'portal', frames: FRAMES, cell: CELL, cols: COLS, map: mapParams },
            textures: (p) => [texPath(p), 'Texture/rr_ring_soft.png', 'Texture/rr_particle_hard.png'],
            params: [
                { key: 'color',      label: 'Surface Color', type: 'color', default: '#90b8e0' },
                { key: 'edge',       label: 'Edge Color',    type: 'color', default: '#10243d' },
                { key: 'glowColor',  label: 'Glow Color',    type: 'color', default: '#e8f4ff' },
                { key: 'size',       label: 'Size',          type: 'range', default: 6, min: 2, max: 14, step: 1 },
                { key: 'rain',       label: 'Ripple Drops',  type: 'range', default: 10, min: 1, max: 60, step: 1 },
                { key: 'refraction', label: 'Refraction',    type: 'range', default: 8, min: 0, max: 20, step: 1 },
                { key: 'motes',      label: 'Infalling Motes', type: 'range', default: 14, min: 0, max: 40, step: 1 },
                { key: 'halo',       label: 'Outer Halo',    type: 'toggle', default: true },
            ],
            build(p) {
                const B = RR_EfkBuilder;
                const U = RR_EfkRecipeUtil;
                const { rf, rv3, v3, v2 } = B;
                const glowC = U.hexToRgba(p.glowColor);
                const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

                // The baked water surface — fixed orientation so the 3D
                // gizmo can tilt the whole portal in space.
                const surface = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    scaling: { type: 0, refEq: -1, scale: v3(2.3, 2.3, 1) },
                    rendererCommon: {
                        colorTextureIndex: 0,
                        alphaBlend: 1,   // the sim's colors are already lit
                        uv: {
                            type: 2,
                            // Frame rect is NORMALIZED (corpus-verified).
                            position: { x: 0, y: 0, w: 1 / COLS, h: 1 / Math.ceil(FRAMES / COLS) },
                            frameLength: 1,
                            frameCountX: COLS,
                            frameCountY: Math.ceil(FRAMES / COLS),
                            loopType: 1,
                            startFrame: { max: 0, min: 0 },
                        },
                    },
                    rendererParams: {
                        billboard: 2,
                        allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 255 }),
                    },
                });

                const halo = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rendererCommon: { colorTextureIndex: 1 },
                    rendererParams: {
                        billboard: 2,
                        vertexCount: 48,
                        outerLocation: { type: 0, location: v2(1.5, 0) },
                        innerLocation: { type: 0, location: v2(1.02, 0) },
                        outerColor: U.fixedColor({ ...glowC, a: 0 }),
                        centerColor: U.fixedColor({ ...glowC, a: 80 }),
                        innerColor: U.fixedColor({ ...glowC, a: 0 }),
                    },
                });

                // Motes spawn outside the rim and fall in through the
                // surface (attractive field pulls them to the center).
                const motes = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: {
                        ...bindAlways,
                        maxGeneration: 99999,
                        life: rf(35, 65),
                        generationTime: rf(Math.max(0.5, 50 / Math.max(1, p.motes))),
                    },
                    generationLocation: {
                        type: 3, division: 24, radius: rf(1.25, 1.6),
                        angleStart: rf(0), angleEnd: rf(360),
                        circleType: 0, axisDirection: 2, angleNoize: rf(30),
                    },
                    localForceField: {
                        elements: [{ type: 9, control: 1.6, minRange: 0, maxRange: 4 }],
                        locationAbs: { type: 0 },
                    },
                    scaling: { type: 4, start: rf(0.05, 0.13), end: rf(0), params: [0, 0, 0] },
                    rendererCommon: {
                        colorTextureIndex: 2,
                        fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] },
                    },
                    rendererParams: { allColor: U.fixedColor({ ...glowC, a: 235 }) },
                });

                const children = [surface];
                if (p.halo) children.push(halo);
                if (p.motes > 0) children.push(motes);

                return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    scaling: { type: 0, refEq: -1, scale: v3(p.size * 0.5, p.size * 0.5, p.size * 0.5) },
                    children,
                })];
            },
        });
    })();


    // ── Energy Field ─────────────────────────────────────────────────────
    // Force-field bubble: the Geometric wire sphere with energy flowing
    // along its struts + a camera-facing fresnel rim + surface sparks.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'energy-field',
        name: 'Energy Field',
        category: 'Energy',
        continuous: true,
        prewarm: 90,
        textures: ['streak', 'ring_soft', 'spark', 'smoke'],
        params: [
            { key: 'color',     label: 'Field Color',    type: 'color', default: '#46b4ff' },
            { key: 'size',      label: 'Size',           type: 'range', default: 6, min: 2, max: 14, step: 1 },
            { key: 'thickness', label: 'Lattice Thickness', type: 'range', default: 2, min: 1, max: 14, step: 1 },
            { key: 'flow',      label: 'Energy Flow',    type: 'range', default: 8, min: 0, max: 20, step: 1 },
            { key: 'spin',      label: 'Spin (°/s)',     type: 'range', default: 18, min: -90, max: 90, step: 1 },
            { key: 'rimGlow',   label: 'Rim Glow',       type: 'range', default: 14, min: 0, max: 32, step: 1 },
            { key: 'sparks',    label: 'Surface Sparks', type: 'range', default: 14, min: 0, max: 60, step: 1 },
        ],
        buildModels(p, M) {
            const wire = M.buildGeometry('sphere', { thickness: p.thickness * 0.011, style: 'wire' });
            const skin = M.buildGeometry('sphere', { style: 'solid' });
            return [
                { path: `Model/rr_field_sphere_t${p.thickness}.efkmodel`, mesh: wire.mesh },
                { path: 'Model/rr_field_skin.efkmodel', mesh: skin.mesh },
            ];
        },
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3, v2 } = B;
            const c = U.hexToRgba(p.color);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

            // Plasma skin: translucent solid sphere with drifting mottled
            // energy — THIS is what makes it read as a force field rather
            // than a wireframe ball.
            const skin = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: {
                    colorTextureIndex: 3,
                    uv: {
                        type: 3,
                        position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                        size: { max: { x: 2, y: 1 }, min: { x: 2, y: 1 } },
                        speed: { max: { x: Math.max(1, p.flow) * 0.002, y: Math.max(1, p.flow) * 0.0007 },
                                 min: { x: Math.max(1, p.flow) * 0.002, y: Math.max(1, p.flow) * 0.0007 } },
                    },
                },
                rendererParams: { modelIndex: 1, allColor: U.fixedColor({ ...c, a: 135 }) },
            });

            // Faint structural lattice under the plasma.
            const bubble = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: {
                    colorTextureIndex: 0,
                    ...(p.flow > 0 ? {
                        uv: {
                            type: 3,
                            position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                            size: { max: { x: 1, y: 1 }, min: { x: 1, y: 1 } },
                            speed: { max: { x: 0, y: p.flow * 0.004 }, min: { x: 0, y: p.flow * 0.004 } },
                        },
                    } : {}),
                },
                rendererParams: { modelIndex: 0, allColor: U.fixedColor({ ...U.dim(c, 0.9), a: 30 }) },
            });

            // The field flexing: a slow expanding surface pulse.
            const pulse = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(45),
                    generationTime: rf(95),
                },
                scaling: { type: 4, start: rf(0.85), end: rf(1.18), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 1,
                    fadeInType: 1, fadeIn: { frame: 10, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 20, params: [0, 0, 0] },
                },
                rendererParams: {
                    billboard: 0,
                    vertexCount: 48,
                    outerLocation: { type: 0, location: v2(1.06, 0) },
                    innerLocation: { type: 0, location: v2(0.9, 0) },
                    outerColor: U.fixedColor({ ...c, a: 0 }),
                    centerColor: U.fixedColor({ ...c, a: 110 }),
                    innerColor: U.fixedColor({ ...c, a: 0 }),
                },
            });

            // Camera-facing rim ring reads as the bubble's fresnel edge.
            const rim = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: {
                    billboard: 0,
                    vertexCount: 48,
                    outerLocation: { type: 0, location: v2(1.08, 0) },
                    innerLocation: { type: 0, location: v2(0.86, 0) },
                    outerColor: U.fixedColor({ ...c, a: 0 }),
                    centerColor: U.fixedColor({ ...c, a: Math.min(255, p.rimGlow * 8) }),
                    innerColor: U.fixedColor({ ...c, a: 0 }),
                },
            });

            const sparks = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(10, 26),
                    generationTime: rf(Math.max(0.5, 30 / Math.max(1, p.sparks))),
                },
                generationLocation: { type: 1, radius: rf(0.98, 1.02), rotationX: rf(0, 360), rotationY: rf(0, 360) },
                scaling: { type: 4, start: rf(0.06, 0.16), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 2 },
                rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 255 }) },
            });

            // Counter-drifting second shell: the two mottled layers moving
            // against each other is what makes the surface look ALIVE.
            const skin2 = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(1.035, 1.035, 1.035) },
                rendererCommon: {
                    colorTextureIndex: 3,
                    uv: {
                        type: 3,
                        position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                        size: { max: { x: 3, y: 1 }, min: { x: 3, y: 1 } },
                        speed: { max: { x: -Math.max(1, p.flow) * 0.0014, y: Math.max(1, p.flow) * 0.0005 },
                                 min: { x: -Math.max(1, p.flow) * 0.0014, y: Math.max(1, p.flow) * 0.0005 } },
                    },
                },
                rendererParams: { modelIndex: 1, allColor: U.fixedColor({ ...U.dim(c, 0.8), a: 80 }) },
            });

            const children = [skin, skin2, bubble, pulse];
            if (p.rimGlow > 0) children.push(rim);
            if (p.sparks > 0) children.push(sparks);

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(0),
                    velocity: rv3(v3(p.spin * D2R / 180, p.spin * D2R / 60, 0)),
                    acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                children,
            })];
        },
    });

    // ── Energy Wisps ─────────────────────────────────────────────────────
    // Rainbow tendrils: invisible parents drift outward under turbulence,
    // each dropping Track breadcrumbs — the runtime draws tapered ribbons
    // through them. Six hue emitters split the requested wisp count.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'energy-wisps',
        name: 'Energy Wisps',
        category: 'Energy',
        continuous: true,
        prewarm: 120,
        textures: ['glow_soft'],
        params: [
            { key: 'baseHue',  label: 'Base Hue',       type: 'range', default: 0, min: 0, max: 360, step: 5 },
            { key: 'hueRange', label: 'Rainbow Spread', type: 'range', default: 360, min: 0, max: 360, step: 5 },
            { key: 'wisps',    label: 'Wisps',          type: 'range', default: 12, min: 3, max: 30, step: 1 },
            { key: 'reach',    label: 'Reach',          type: 'range', default: 8, min: 3, max: 16, step: 1 },
            { key: 'speed',    label: 'Drift Speed',    type: 'range', default: 5, min: 1, max: 12, step: 1 },
            { key: 'curl',     label: 'Curl',           type: 'range', default: 6, min: 0, max: 15, step: 1 },
            { key: 'size',     label: 'Size',           type: 'range', default: 5, min: 2, max: 12, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3 } = B;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

            const hsl = (h) => {
                const f = (n) => {
                    const k = (n + h / 30) % 12;
                    return Math.round(255 * (0.55 + 0.45 * Math.max(-1, Math.min(1, Math.min(k - 3, 9 - k)))));
                };
                return { r: f(0), g: f(8), b: f(4), a: 255 };
            };

            const HUES = 6;
            const perHue = Math.max(1, Math.round(p.wisps / HUES));
            const wispLife = Math.round(30 + p.reach * 4);
            const vel = p.speed * 0.02;

            const emitters = [];
            for (let k = 0; k < HUES; k++) {
                const col = hsl((p.baseHue + (k / HUES) * p.hueRange) % 360);
                emitters.push(B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: {
                        ...bindAlways,
                        maxGeneration: 99999,
                        life: rf(wispLife),
                        generationTime: rf(Math.max(2, wispLife / perHue)),
                        generationTimeOffset: rf(0, wispLife),
                    },
                    translation: {
                        type: 1,
                        refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(0),
                        velocity: rv3(v3(-vel, -vel * 0.6, -vel), v3(vel, vel, vel)),
                        acceleration: rv3(0),
                    },
                    localForceField: p.curl > 0 ? {
                        elements: [{ type: 1, seed: k * 7 + 1, scale: 1.6, strength: p.curl * 0.004, octave: 1 }],
                        locationAbs: { type: 0 },
                    } : undefined,
                    children: [B.makeNode(RR_EfkFormat.NODE_TYPE.TRACK, {
                        commonValues: {
                            maxGeneration: 24,
                            life: rf(Math.round(wispLife * 0.55)),
                            generationTime: rf(2),
                        },
                        rendererCommon: { colorTextureIndex: 0 },
                        rendererParams: {
                            sizeFor: { type: 0, size: 0 },
                            sizeMiddle: { type: 0, size: 0.16 },
                            sizeBack: { type: 0, size: 0.02 },
                            colorLeft: { type: 0, fixed: { ...col, a: 0 } },
                            colorLeftMiddle: { type: 0, fixed: { ...col, a: 0 } },
                            colorCenter: { type: 0, fixed: col },
                            colorCenterMiddle: { type: 0, fixed: { ...col, a: 180 } },
                            colorRight: { type: 0, fixed: { ...col, a: 0 } },
                            colorRightMiddle: { type: 0, fixed: { ...col, a: 0 } },
                        },
                    })],
                }));
            }

            const core = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(0.9, 0.9, 0.9) },
                rendererCommon: { colorTextureIndex: 0 },
                rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 230 }) },
            });

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size * 0.45, p.size * 0.45, p.size * 0.45) },
                children: [core, ...emitters],
            })];
        },
    });

    // ── Holy Aura ────────────────────────────────────────────────────────
    // Radiant blessing: rotating fan of light rays + golden core + rising
    // motes. Rays are a flat model (camera-facing) spun by a container.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'holy-aura',
        name: 'Holy Aura',
        category: 'Energy',
        continuous: true,
        prewarm: 90,
        textures: ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'noise'],
        params: [
            { key: 'color',    label: 'Aura Color', type: 'color', default: '#ffe9a0' },
            { key: 'beam',     label: 'Ray Color',  type: 'color', default: '#fff8dc' },
            { key: 'moteCol',  label: 'Mote Color', type: 'color', default: '#ffee66' },
            { key: 'size',     label: 'Size',       type: 'range', default: 6, min: 2, max: 14, step: 1 },
            { key: 'rays',     label: 'Rays',       type: 'range', default: 8, min: 4, max: 20, step: 1 },
            { key: 'rayLen',   label: 'Ray Length', type: 'range', default: 8, min: 4, max: 14, step: 1 },
            { key: 'spin',     label: 'Spin (°/s)', type: 'range', default: 20, min: -90, max: 90, step: 1 },
            { key: 'motes',    label: 'Motes',      type: 'range', default: 10, min: 0, max: 30, step: 1 },
        ],
        buildModels(p, M) {
            // Flat ray fan in the XY plane (models render with fixed
            // orientation, so this faces the camera like the AG's rays).
            const vertices = [];
            const faces = [];
            const R = 0.15 + p.rayLen * 0.085;
            for (let i = 0; i < p.rays; i++) {
                const a = (i / p.rays) * Math.PI * 2;
                const w = (Math.PI / p.rays) * 0.55;
                const base = vertices.length;
                vertices.push(
                    { p: [Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0], n: [0, 0, 1], uv: [0.5, 1] },
                    { p: [Math.cos(a - w) * R, Math.sin(a - w) * R, 0], n: [0, 0, 1], uv: [0, 0] },
                    { p: [Math.cos(a + w) * R, Math.sin(a + w) * R, 0], n: [0, 0, 1], uv: [1, 0] },
                );
                faces.push([base, base + 1, base + 2]);
            }
            return [{
                path: `Model/rr_holy_rays_n${p.rays}_l${p.rayLen}.efkmodel`,
                mesh: { vertices, faces, scale: 1 },
            }];
        },
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const gold = U.hexToRgba(p.color);
            const ray = U.hexToRgba(p.beam);
            const mote = U.hexToRgba(p.moteCol);
            const WHITE = { r: 255, g: 255, b: 255 };
            const S = p.size;
            const w = p.spin * (Math.PI / 180) / 60;
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

            // Breathing layer (regenerating crossfade — a LONG-life ease
            // reads frozen).
            const pulse = (from, to, cycle, color, alpha, tex, offset, y) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(cycle),
                                generationTime: rf(Math.round(cycle / 2)), generationTimeOffset: rf(offset || 0) },
                translation: { type: 0, refEq: -1, position: v3(0, y || 0, 0) },
                scaling: { type: 4, start: rf(from), end: rf(to), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: tex, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: Math.round(cycle * 0.35), params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: Math.round(cycle * 0.4), params: [0, 0, 0] },
                },
                rendererParams: { allColor: L.fixed(color, alpha) },
            });

            // Grace descending: a tall soft column of light from above.
            const beam = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                translation: { type: 0, refEq: -1, position: v3(0, S * 0.55, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(S * 0.75, S * 2.1, 1) },
                rendererCommon: { colorTextureIndex: 0, alphaBlend: 2 },
                rendererParams: { allColor: L.fixed(ray, 55) },
            });

            // Twin ray fans (the model), counter-rotating for shimmer.
            const fan = (speed, alpha, scale) => B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                    velocity: rv3(v3(0, 0, speed)), acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(scale, scale, scale) },
                rendererCommon: { colorTextureIndex: 0, alphaBlend: 2 },
                rendererParams: { modelIndex: 0, culling: 2, allColor: L.fixed(ray, alpha) },
            });

            // The halo: a golden ring floating overhead.
            const halo = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                translation: { type: 0, refEq: -1, position: v3(0, S * 1.1, 0) },
                rotation: { type: 0, refEq: -1, rotation: v3(72 * (Math.PI / 180), 0, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(S * 0.55, S * 0.55, S * 0.55) },
                rendererCommon: { colorTextureIndex: 2, alphaBlend: 2 },
                rendererParams: {
                    billboard: 2, vertexCount: 40,
                    outerLocation: { type: 0, location: { x: 1.12, y: 0 } },
                    innerLocation: { type: 0, location: { x: 0.88, y: 0 } },
                    outerColor: L.fixed(gold, 0),
                    centerColor: L.fixed(WHITE, 220),
                    innerColor: L.fixed(gold, 120),
                },
            });

            // Rising light shafts around the body.
            const shafts = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(38, 55), generationTime: rf(4, 7) },
                generationLocation: { type: 3, division: 12, radius: rf(S * 0.6, S * 0.95),
                                      angleStart: rf(0), angleEnd: rf(360), circleType: 0, axisDirection: 1, angleNoize: rf(6) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    // negative y: this category is Y-flipped in the editor,
                    // so world-down velocity reads as RISING on screen
                    velocity: rv3(v3(0, -0.035, 0), v3(0, -0.018, 0)),
                    acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(0.4, 3.6, 1) },
                rendererCommon: {
                    colorTextureIndex: 3, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 10, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 14, params: [0, 0, 0] },
                },
                rendererParams: { allColor: L.fixed(ray, 120) },
            });

            // Marching bead orbits — glints circling the body.
            const orbit = (tilt, tiltZ, speed, radius, alpha) => B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(v3(tilt, 0, tiltZ)), velocity: rv3(v3(0, speed, 0)), acceleration: rv3(0),
                },
                children: [B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { maxGeneration: 99999, life: rf(22, 30), generationTime: rf(1.8, 2.6),
                                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2 },
                    generationLocation: { type: 3, division: 24, radius: rf(radius * 0.97, radius * 1.03),
                                          angleStart: rf(0), angleEnd: rf(360), circleType: 0, axisDirection: 1, angleNoize: rf(3) },
                    scaling: { type: 4, start: rf(0.5, 0.7), end: rf(0.14), params: [0, 0, 0] },
                    rendererCommon: { colorTextureIndex: 4, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 4, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                    rendererParams: { allColor: L.fixed(mote, alpha) },
                })],
            });

            const D2Rh = Math.PI / 180;
            const kids = [
                beam,
                fan(Math.max(0.006, w), 130, 1),
                fan(-Math.max(0.004, w * 0.6), 80, 0.78),
                halo,
                pulse(S * 1.45, S * 1.7, 78, gold, 60, 0, 0, S * 1.1),   // halo glow breathing
                shafts,
                // golden heart: layered breathing
                L.glow({ tex: 0, color: WHITE, size: S * 0.3, duration: LONG, alpha: 220 }),
                pulse(S * 0.55, S * 0.85, 46, gold, 150, 0),
                pulse(S * 0.75, S * 1.0, 64, gold, 95, 5, 23),
                pulse(S * 0.9, S * 1.2, 90, ray, 60, 0, 45),
                orbit(65 * D2Rh, 0.4, Math.max(0.012, w * 1.3), S * 1.05, 235),
                orbit(112 * D2Rh, -0.7, -Math.max(0.009, w), S * 1.2, 190),
            ];
            if (p.motes > 0) {
                kids.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(45, 80),
                                    generationTime: rf(Math.max(1, 120 / p.motes)) },
                    generationLocation: { type: 3, division: 16, radius: rf(S * 0.3, S * 0.95),
                                          angleStart: rf(0), angleEnd: rf(360), circleType: 2, axisDirection: 1, angleNoize: rf(10) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(0),
                        velocity: rv3(v3(-0.003, -0.03, -0.003), v3(0.003, -0.014, 0.003)),
                        acceleration: rv3(0),
                    },
                    scaling: { type: 4, start: rf(0.25, 0.5), end: rf(0.08), params: [0, 0, 0] },
                    rendererCommon: { colorTextureIndex: 4, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] } },
                    rendererParams: { allColor: L.fixed(mote, 235) },
                }));
            }
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                children: kids,
            })];
        },
    });

    // ── Magic Circle ─────────────────────────────────────────────────────
    // Summoning sigil lying flat on the ground (like the AG's -90° tilt):
    // two rings + rune ticks + star polygon + rising sparkles, spinning.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'magic-circle',
        name: 'Magic Circle',
        category: 'Energy',
        continuous: true,
        prewarm: 90,
        textures: ['ring_soft', 'glow_soft', 'particle_hard', 'runes', 'spark', 'noise', 'streak'],
        params: [
            { key: 'color',     label: 'Primary Color',   type: 'color', default: '#b45cff' },
            { key: 'color2',    label: 'Secondary Color', type: 'color', default: '#5c8cff' },
            { key: 'size',      label: 'Size',            type: 'range', default: 7, min: 2, max: 16, step: 1 },
            { key: 'points',    label: 'Star Points',     type: 'range', default: 6, min: 3, max: 12, step: 1 },
            { key: 'glyphs',    label: 'Rune Ticks',      type: 'range', default: 16, min: 6, max: 32, step: 1 },
            { key: 'thickness', label: 'Line Thickness',  type: 'range', default: 5, min: 1, max: 12, step: 1 },
            { key: 'spin',      label: 'Spin (°/s)',      type: 'range', default: 25, min: -120, max: 120, step: 1 },
            { key: 'sparkles',  label: 'Sparkles',        type: 'range', default: 14, min: 0, max: 50, step: 1 },
        ],
        buildModels(p, M) {
            const th = p.thickness * 0.011;
            // Star polygon in the XZ plane (ground): connect every vertex
            // to the one floor(N/2) ahead — pentagram-style for odd N,
            // overlapping polygons for even N.
            const starPts = [];
            for (let i = 0; i < p.points; i++) {
                const a = (i / p.points) * Math.PI * 2 - Math.PI / 2;
                starPts.push([Math.cos(a) * 0.72, 0, Math.sin(a) * 0.72]);
            }
            const skip = Math.max(1, p.points === 4 ? 1 : Math.floor(p.points / 2));
            const starEdges = starPts.map((_, i) => [i, (i + skip) % p.points]);

            // Rune ticks: short radial dashes between the two rings.
            const runePts = [];
            const runeEdges = [];
            for (let i = 0; i < p.glyphs; i++) {
                const a = (i / p.glyphs) * Math.PI * 2;
                const r1 = 0.8, r2 = i % 2 ? 0.92 : 0.88;
                runePts.push([Math.cos(a) * r1, 0, Math.sin(a) * r1],
                             [Math.cos(a) * r2, 0, Math.sin(a) * r2]);
                runeEdges.push([i * 2, i * 2 + 1]);
            }

            return [
                { path: `Model/rr_magic_star_p${p.points}_t${p.thickness}.efkmodel`,
                  mesh: { ...M.strutFrame(starPts, starEdges, th), scale: 1 } },
                { path: `Model/rr_magic_runes_g${p.glyphs}_t${p.thickness}.efkmodel`,
                  mesh: { ...M.strutFrame(runePts, runeEdges, th), scale: 1 } },
            ];
        },
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3, v2 } = B;
            const c1 = U.hexToRgba(p.color);
            const c2 = U.hexToRgba(p.color2);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

            const ring = (radius, width, col, alpha) => B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                // Flat in the circle's ground plane (world-fixed) — the
                // default camera-facing billboard hung these in screen
                // space, detached from the tilted assembly.
                rotation: { type: 0, refEq: -1, rotation: v3(Math.PI / 2, 0, 0) },
                rendererCommon: { colorTextureIndex: 0 },
                rendererParams: {
                    billboard: 2,
                    vertexCount: 48,
                    outerLocation: { type: 0, location: v2(radius + width, 0) },
                    innerLocation: { type: 0, location: v2(radius - width, 0) },
                    outerColor: U.fixedColor({ ...col, a: 0 }),
                    centerColor: U.fixedColor({ ...col, a: alpha }),
                    innerColor: U.fixedColor({ ...col, a: 0 }),
                },
            });

            const model = (idx, col) => B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { modelIndex: idx, allColor: U.fixedColor({ ...col, a: 220 }) },
            });

            const sparkles = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(25, 55),
                    generationTime: rf(Math.max(0.5, 40 / Math.max(1, p.sparkles))),
                },
                generationLocation: {
                    type: 3, division: 24, radius: rf(0.2, 0.95),
                    angleStart: rf(0), angleEnd: rf(360),
                    circleType: 0, axisDirection: 1, angleNoize: rf(0),
                },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(0, 0.006, 0), v3(0, 0.02, 0)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(0.04, 0.11), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 2 },
                rendererParams: { allColor: U.fixedColor({ ...c2, a: 255 }) },
            });

            const glow = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                translation: { type: 0, refEq: -1, position: v3(0, 0.05, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(1.2, 1.2, 1.2) },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { allColor: U.fixedColor({ ...U.dim(c1, 0.8), a: 70 }) },
            });

            // Rotating rune inscription: flat ring bands with the glyph
            // strip scrolled around them (counter-scrolling inner band).
            const FLAT = { type: 0, refEq: -1, rotation: v3(Math.PI / 2, 0, 0) };
            const runeBand = (radius, width, col, alpha, scroll) => B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: FLAT,
                scaling: { type: 0, refEq: -1, scale: v3(radius, radius, radius) },
                rendererCommon: {
                    colorTextureIndex: 3, alphaBlend: 2,
                    uv: { type: 3,
                          position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                          size: { max: { x: 6, y: 1 }, min: { x: 6, y: 1 } },
                          speed: { max: { x: scroll, y: 0 }, min: { x: scroll, y: 0 } } },
                },
                rendererParams: {
                    billboard: 2, vertexCount: 64,
                    outerLocation: { type: 0, location: { x: 1 + width, y: 0 } },
                    innerLocation: { type: 0, location: { x: 1 - width, y: 0 } },
                    outerColor: U.fixedColor({ ...col, a: 0 }),
                    centerColor: U.fixedColor({ ...col, a: alpha }),
                    innerColor: U.fixedColor({ ...col, a: Math.round(alpha * 0.35) }),
                },
            });

            // Light pillars standing at the star's vertices.
            const pillars = [];
            for (let i = 0; i < p.points; i++) {
                const a = (i / p.points) * Math.PI * 2 - Math.PI / 2;
                pillars.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(34, 50),
                                    generationTime: rf(20), generationTimeOffset: rf((i * 9) % 28) },
                    translation: { type: 0, refEq: -1, position: v3(Math.cos(a) * 0.8, 0.55, Math.sin(a) * 0.8) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.1, 1.15, 1) },
                    rendererCommon: {
                        colorTextureIndex: 6, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 14, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 16, params: [0, 0, 0] },
                    },
                    rendererParams: { allColor: U.fixedColor({ ...c2, a: 150 }) },
                }));
            }

            // Activation pulse: a flat ring sweeps outward periodically.
            const pulseRing = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(34), generationTime: rf(80) },
                rotation: FLAT,
                scaling: { type: 4, start: rf(0.18), end: rf(1.28), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 0, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 16, params: [0, 0, 0] },
                },
                rendererParams: {
                    billboard: 2, vertexCount: 48,
                    outerLocation: { type: 0, location: { x: 1.09, y: 0 } },
                    innerLocation: { type: 0, location: { x: 0.91, y: 0 } },
                    outerColor: U.fixedColor({ ...c1, a: 0 }),
                    centerColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 170 }),
                    innerColor: U.fixedColor({ ...c1, a: 60 }),
                },
            });

            // Breathing heart: noise shimmer over the soft glow.
            const shimmer = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(52), generationTime: rf(26) },
                translation: { type: 0, refEq: -1, position: v3(0, 0.06, 0) },
                rotation: FLAT,
                scaling: { type: 4, start: rf(0.95), end: rf(1.3), params: [0, 0, 0] },
                rendererCommon: {
                    colorTextureIndex: 5, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 18, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 21, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...c1, a: 60 }) },
            });

            // Split spin from statics: rings/bands with a fixed X-tilt
            // PRECESS (Euler) inside a Y-spinning parent — hula hoops.
            // Only the star models and the pillars ride the spinner; the
            // bands rotate their runes via UV scroll instead.
            const spinKids = [
                model(0, c1),   // star
                model(1, c2),   // rune ticks
                ...pillars,
            ];
            if (p.sparkles > 0) spinKids.push(sparkles);
            const spinner = B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(0),
                    velocity: rv3(v3(0, p.spin * D2R / 60, 0)),
                    acceleration: rv3(0),
                },
                children: spinKids,
            });

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                // Tip the whole circle toward the camera so it reads as a
                // proper ellipse instead of an edge-on line.
                rotation: { type: 0, refEq: -1, rotation: v3(0.34, 0, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                children: [
                    spinner,
                    runeBand(1.02, 0.09, c1, 230, 0.004),
                    runeBand(0.62, 0.11, c2, 170, -0.006),
                    ring(1.14, 0.03, c1, 240),
                    ring(0.9, 0.025, c1, 200),
                    ring(0.74, 0.02, c2, 190),
                    ring(0.5, 0.02, c2, 160),
                    glow,
                    shimmer,
                    pulseRing,
                ],
            })];
        },
    });

    // ── Teleport Column ──────────────────────────────────────────────────
    // Transporter beam: rings rise through a vertical column with drifting
    // particles, blinking data glints, and a soft core shimmer.
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'teleport-column',
        name: 'Teleport Column',
        category: 'Energy',
        continuous: true,
        prewarm: 150,
        textures: ['ring_soft', 'particle_hard', 'streak'],
        buildModels(p, M) {
            // Same solid cylinder mesh the Energy Beam uses (cache-shared).
            return [{ path: 'Model/rr_geo_cylinder_solid_t5.efkmodel',
                      mesh: M.buildGeometry('cylinder', { style: 'solid' }).mesh }];
        },
        params: [
            { key: 'color',   label: 'Ring Color',     type: 'color', default: '#40e6ff' },
            { key: 'color2',  label: 'Particle Color', type: 'color', default: '#a8f6ff' },
            { key: 'direction', label: 'Direction', type: 'select', default: 'up',
              options: [
                  { value: 'up', label: 'Rise (materialize)' },
                  { value: 'down', label: 'Descend (dematerialize)' },
              ] },
            { key: 'radius',  label: 'Radius',         type: 'range', default: 3, min: 1, max: 7, step: 1 },
            { key: 'height',  label: 'Height',         type: 'range', default: 10, min: 4, max: 20, step: 1 },
            { key: 'rings',   label: 'Rings',          type: 'range', default: 14, min: 2, max: 40, step: 1 },
            { key: 'rise',    label: 'Rise Speed',     type: 'range', default: 4, min: 1, max: 10, step: 1 },
            { key: 'motes',   label: 'Particles',      type: 'range', default: 40, min: 0, max: 100, step: 1 },
            { key: 'glints',  label: 'Data Glints',    type: 'range', default: 12, min: 0, max: 40, step: 1 },
            { key: 'swirl',   label: 'Swirl (°/s)',    type: 'range', default: 30, min: -120, max: 120, step: 1 },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const { rf, rv3, v3, v2 } = B;
            const c = U.hexToRgba(p.color);
            const c2 = U.hexToRgba(p.color2);
            const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
            const h = p.height;
            const dir = p.direction === 'down' ? -1 : 1;
            const ringLife = Math.round(h / (p.rise * 0.02));   // frames end→end

            const rings = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(ringLife),
                    generationTime: rf(Math.max(1, ringLife / p.rings)),
                },
                // Flat horizontal hoops (world-fixed): the column swirl then
                // spins them about their own axis — invisible, as it should
                // be — instead of flipping them edge-on like paper sheets.
                rotation: { type: 0, refEq: -1, rotation: v3(Math.PI / 2, 0, 0) },
                generationLocation: { type: 0, location: rv3(v3(0, -dir * h / 2, 0)) },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(0, dir * p.rise * 0.02, 0)),
                    acceleration: rv3(0),
                },
                rendererCommon: {
                    colorTextureIndex: 0,
                    fadeInType: 1, fadeIn: { frame: 12, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 14, params: [0, 0, 0] },
                },
                rendererParams: {
                    billboard: 2,
                    vertexCount: 40,
                    outerLocation: { type: 0, location: v2(p.radius * 1.05, 0) },
                    innerLocation: { type: 0, location: v2(p.radius * 0.85, 0) },
                    outerColor: U.fixedColor({ ...c, a: 0 }),
                    centerColor: U.fixedColor({ ...c, a: 210 }),
                    innerColor: U.fixedColor({ ...c, a: 0 }),
                },
            });

            const motes = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(40, 90),
                    generationTime: rf(Math.max(0.5, 65 / Math.max(1, p.motes))),
                },
                generationLocation: {
                    type: 3, division: 16, radius: rf(0.2, p.radius * 0.85),
                    angleStart: rf(0), angleEnd: rf(360),
                    circleType: 0, axisDirection: 1, angleNoize: rf(0),
                },
                translation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(0, -dir * h / 2, 0)),
                    velocity: rv3(v3(-0.004, dir * p.rise * 0.012, -0.004), v3(0.004, dir * p.rise * 0.028, 0.004)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(0.08, 0.2), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { allColor: U.fixedColor({ ...c2, a: 255 }) },
            });

            const glints = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: 99999,
                    life: rf(6, 16),
                    generationTime: rf(Math.max(0.5, 12 / Math.max(1, p.glints))),
                },
                generationLocation: {
                    type: 0,
                    location: rv3(v3(-p.radius * 0.8, -h / 2, -p.radius * 0.8),
                                  v3(p.radius * 0.8, h / 2, p.radius * 0.8)),
                },
                scaling: { type: 4, start: rf(0.1, 0.28), end: rf(0), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 1 },
                rendererParams: { allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 255 }) },
            });

            // Holographic column body: a translucent cylinder with energy
            // streaming upward along it — a real 3D volume, unlike the old
            // stretched billboard (which looked warped from any angle).
            const column = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                scaling: { type: 0, refEq: -1, scale: v3(p.radius * 0.92, h * 0.5, p.radius * 0.92) },
                rendererCommon: {
                    colorTextureIndex: 2,
                    uv: {
                        type: 3,
                        position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                        size: { max: { x: 1, y: 1 }, min: { x: 1, y: 1 } },
                        speed: { max: { x: 0, y: dir * p.rise * 0.006 }, min: { x: 0, y: dir * p.rise * 0.006 } },
                    },
                },
                rendererParams: { modelIndex: 0, allColor: U.fixedColor({ ...U.dim(c, 0.8), a: 58 }) },
            });

            const children = [rings, column];
            if (p.motes > 0) children.push(motes);
            if (p.glints > 0) children.push(glints);

            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rotation: {
                    type: 1,
                    refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: rv3(0),
                    velocity: rv3(v3(0, p.swirl * D2R / 60, 0)),
                    acceleration: rv3(0),
                },
                children,
            })];
        },
    });
})();
