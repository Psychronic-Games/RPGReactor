/**
 * Interface family — sci-fi consoles/HUDs as NATIVE 3D holographic
 * interfaces (EVFXForge16 "Cyberforge" pack is the quality reference).
 *
 * Unlike the first-generation Interface recipes (baked AG sprite sheets on
 * a quad), every recipe here BUILDS its interface out of Effekseer
 * primitives: ring dials and arc segments (viewingAngle), strut-frame
 * models, UV-scrolled inscription/tick bands, marching bead pulses,
 * eased-scale bars, glyph flickers and data columns. Each interface has
 * its own distinct silhouette, motion rhythm, and palette hooks.
 *
 * Conventions (see project rules): authored Y-up (the editor's category
 * flip wrapper turns it upright), easing params [0,0,1] = linear
 * ([0,0,0] freezes), fade envelopes keep [0,0,0], UV scroll on closed
 * rings uses INTEGER repeats, world-fixed planes use billboard 2 and
 * screen-space HUD elements billboard 0, flat ground rings need a
 * presentation tilt or they render edge-on.
 */
(function () {
    const LONG = 36000;
    const D2R = Math.PI / 180;

    // Deterministic layout PRNG — Math.random() would change the build
    // between preview rebuilds and break the sweep tests' byte comparisons.
    const mulberry32 = (seed) => () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };

    /** Shared node factories (unit-space; recipes wrap in a size scaler). */
    function kit() {
        const B = RR_EfkBuilder;
        const U = RR_EfkRecipeUtil;
        const { rf, rv3, v3, v2 } = B;
        const FLAT = { type: 0, refEq: -1, rotation: v3(Math.PI / 2, 0, 0) };

        /** Container: fixed rotation / position / scale, children. */
        const group = (opts, children) => B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
            commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
            ...(opts.pos ? { translation: { type: 0, refEq: -1, position: opts.pos } } : {}),
            ...(opts.rot ? { rotation: { type: 0, refEq: -1, rotation: opts.rot } } : {}),
            ...(opts.scale ? { scaling: { type: 0, refEq: -1, scale: opts.scale } } : {}),
            children,
        });

        /** Container spinning about Y at honest °/s. */
        const spinner = (degPerSec, children) => B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
            commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
            rotation: {
                type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                rotation: rv3(0), velocity: rv3(v3(0, degPerSec * D2R / 60, 0)), acceleration: rv3(0),
            },
            children,
        });

        /**
         * Ring band. flat=true lies in the local ground plane; otherwise
         * screen-space (billboard 0). NOTE: do NOT pass `arc` expecting a
         * segment — ring viewingAngle is unused corpus-wide (185/185 rings
         * are 360°) and does not render in the bundled runtime. Fake arcs
         * with blades or strut models instead.
         */
        const band = ({ tex, radius, width, color, alpha, scroll = 0, repeats = 1,
                        flat = true, upright = false, y = 0, arc, rotZ = 0, verts = 64,
                        innerAlphaF = 0.3, whiteCenter = false,
                        outer, inner }) =>
            B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                translation: { type: 0, refEq: -1, position: v3(0, y, 0) },
                ...(flat || rotZ ? { rotation: { type: 0, refEq: -1,
                    rotation: flat ? v3(Math.PI / 2, 0, rotZ) : v3(0, 0, rotZ) } } : {}),
                scaling: { type: 0, refEq: -1, scale: v3(radius, radius, radius) },
                rendererCommon: {
                    colorTextureIndex: tex, alphaBlend: 2,
                    ...(scroll || repeats !== 1 ? { uv: { type: 3,
                        position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                        size: { max: { x: repeats, y: 1 }, min: { x: repeats, y: 1 } },
                        speed: { max: { x: scroll, y: 0 }, min: { x: scroll, y: 0 } } } } : {}),
                },
                rendererParams: {
                    // upright = world-fixed in the XY plane (rotates truthfully
                    // with the gizmo); flat = world XZ plane; else camera-facing
                    billboard: (flat || upright) ? 2 : 0, vertexCount: verts,
                    ...(arc ? { viewingAngle: { type: 0, fixed: arc } } : {}),
                    outerLocation: { type: 0, location: v2(outer ?? (1 + width), 0) },
                    innerLocation: { type: 0, location: v2(inner ?? (1 - width), 0) },
                    outerColor: U.fixedColor({ ...color, a: 0 }),
                    centerColor: whiteCenter
                        ? U.fixedColor({ r: 255, g: 255, b: 255, a: alpha })
                        : U.fixedColor({ ...color, a: alpha }),
                    innerColor: U.fixedColor({ ...color, a: Math.round(alpha * innerAlphaF) }),
                },
            });

        /** Static or blinking quad. */
        const quad = ({ tex, x = 0, y = 0, z = 0, w, h, color, alpha, blend = 2,
                        billboard = 2, rotX = 0, rotY = 0, rotZ = 0,
                        life, genTime, genOffset = 0, fadeIn, fadeOut, uv, scaling }) =>
            B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: life
                    ? { ...bindAlways, maxGeneration: 99999, life: rf(life),
                        generationTime: rf(genTime || life), generationTimeOffset: rf(genOffset) }
                    : { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                translation: { type: 0, refEq: -1, position: v3(x, y, z) },
                ...(rotX || rotY || rotZ ? { rotation: { type: 0, refEq: -1, rotation: v3(rotX, rotY, rotZ) } } : {}),
                scaling: scaling || { type: 0, refEq: -1, scale: v3(w, h, 1) },
                rendererCommon: {
                    colorTextureIndex: tex, alphaBlend: blend,
                    ...(uv ? { uv } : {}),
                    ...(fadeIn ? { fadeInType: 1, fadeIn: { frame: fadeIn, params: [0, 0, 0] } } : {}),
                    ...(fadeOut ? { fadeOutType: 1, fadeOut: { frame: fadeOut, params: [0, 0, 0] } } : {}),
                },
                rendererParams: { billboard, allColor: U.fixedColor({ ...color, a: alpha }) },
            });

        /** Random parked tech glyphs flickering inside a box area. */
        const glyphFlicker = ({ tex, areaW, areaH, x = 0, y = 0, z = 0.01, size, color, alpha = 255,
                                rate, lifeMin = 5, lifeMax = 13 }) =>
            B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(lifeMin, lifeMax),
                                generationTime: rf(Math.max(1, 16 / rate)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(x - areaW, y - areaH, z), v3(x + areaW, y + areaH, z)),
                    velocity: rv3(0), acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(size, size, 1) },
                rendererCommon: {
                    colorTextureIndex: tex, alphaBlend: 2,
                    uv: { type: 2, position: { x: 0, y: 0, w: 0.25, h: 0.25 },
                          frameLength: 120, frameCountX: 4, frameCountY: 4,
                          loopType: 0, startFrame: { max: 15, min: 0 } },
                },
                rendererParams: { allColor: U.fixedColor({ ...color, a: alpha }) },
            });

        /** Expanding pulse ring (periodic). */
        const pulse = ({ tex, r0, r1, period, life = 34, color, y = 0, flat = true, alpha = 170 }) =>
            B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(life), generationTime: rf(period) },
                translation: { type: 0, refEq: -1, position: v3(0, y, 0) },
                ...(flat ? { rotation: { type: 0, refEq: -1, rotation: v3(Math.PI / 2, 0, 0) } } : {}),
                scaling: { type: 4, start: rf(r0), end: rf(r1), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: tex, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: Math.round(life * 0.5), params: [0, 0, 0] },
                },
                rendererParams: {
                    billboard: flat ? 2 : 0, vertexCount: 48,
                    outerLocation: { type: 0, location: v2(1.08, 0) },
                    innerLocation: { type: 0, location: v2(0.92, 0) },
                    outerColor: U.fixedColor({ ...color, a: 0 }),
                    centerColor: U.fixedColor({ r: 255, g: 255, b: 255, a: alpha }),
                    innerColor: U.fixedColor({ ...color, a: Math.round(alpha * 0.35) }),
                },
            });

        /** Beads marching around a circle (circleType 0 = IN ORDER). */
        const beads = ({ tex, radius, division, genTime, life, size, color, y = 0, alpha = 255 }) =>
            B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(life), generationTime: rf(genTime) },
                translation: { type: 0, refEq: -1, position: v3(0, y, 0) },
                generationLocation: {
                    type: 3, division, radius: rf(radius),
                    angleStart: rf(0), angleEnd: rf(360),
                    circleType: 0, axisDirection: 1, angleNoize: rf(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(size, size, 1) },
                rendererCommon: {
                    colorTextureIndex: tex, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 5, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...color, a: alpha }) },
            });

        return { B, U, rf, rv3, v3, v2, FLAT, group, spinner, band, quad, glyphFlicker, pulse, beads };
    }

    const sizeParam = { key: 'size', label: 'Size', type: 'range', default: 7, min: 2, max: 16, step: 1 };
    // independent width/height stretch at the effect root (1 = as designed)
    // so users can fit an interface to any frame
    const widthParam = { key: 'wscale', label: 'Width Scale', type: 'range', default: 1, min: 0.5, max: 2, step: 0.05 };
    const heightParam = { key: 'hscale', label: 'Height Scale', type: 'range', default: 1, min: 0.5, max: 2, step: 0.05 };

    // ── User Display Text ────────────────────────────────────────────────
    // Every interface takes a typed message rendered as a crisp text strip
    // (RR_EfkTextures.userTextDataUrl — 8:1 aspect). The texture path
    // carries a content hash: the WASM core caches textures by path.
    const textHash = (s) => {
        let h = 5381;
        const str = String(s ?? '');
        for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
        return h.toString(36);
    };
    const textPath = (text) => `Texture/rr_usertext_${textHash(text)}.png`;
    const textParam = (def) => ({ key: 'label', label: 'Display Text', type: 'text', default: def });
    const textTexturesOf = (p) => [{ path: textPath(p.label), text: p.label }];
    /** Header strip node (w:h locked to the 8:1 text texture). */
    const textNode = (K, texIdx, { x = 0, y, w = 0.7, color, alpha = 255, blink, z = 0.02 }) =>
        K.quad({ tex: texIdx, x, y, z, w, h: w / 8, color, alpha, billboard: 2,
                 ...(blink ? { life: blink, genTime: Math.round(blink * 1.5), fadeIn: 4, fadeOut: 4 } : {}) });

    /** Deterministic network layout shared by buildModels and build. */
    function netLayout(p) {
        // accept legacy numeric values (old presets) and new select strings
        const mode = (p.layout === 1 || p.layout === '1' || p.layout === 'grid') ? 'grid'
            : (p.layout === 2 || p.layout === '2' || p.layout === 'mesh') ? 'mesh' : 'ring';
        const rand = mulberry32(1234 + p.nodeCount * 7 + (mode === 'grid' ? 131 : mode === 'mesh' ? 262 : 0));
        const pts = [];
        const edges = [];
        if (mode === 'ring') {
            // deep ring: strong height spread + radius jitter so the loop
            // reads as a volume, not a flat circle with bumps
            for (let i = 0; i < p.nodeCount; i++) {
                const a = (i / p.nodeCount) * Math.PI * 2;
                const r = 0.68 + rand() * 0.24;
                pts.push([Math.cos(a) * r, (rand() - 0.5) * 0.62, Math.sin(a) * r]);
                edges.push([i, (i + 1) % p.nodeCount]);
            }
            const skip = Math.max(2, Math.floor(p.nodeCount / 3));
            for (let i = 0; i < p.nodeCount; i += 2) edges.push([i, (i + skip) % p.nodeCount]);
        } else if (mode === 'grid') {
            const g = Math.ceil(Math.sqrt(p.nodeCount));
            for (let i = 0; i < p.nodeCount; i++) {
                const gx = i % g, gy = Math.floor(i / g);
                pts.push([-0.7 + (gx / Math.max(1, g - 1)) * 1.4 + (rand() - 0.5) * 0.1,
                          -0.55 + (gy / Math.max(1, g - 1)) * 1.1 + (rand() - 0.5) * 0.1, 0]);
                if (gx > 0) edges.push([i, i - 1]);
                if (gy > 0) edges.push([i, i - g]);
            }
        } else {
            // MESH: organic 3D scatter, every pair within reach gets a
            // link — a volumetric constellation (spun + tilted by build so
            // it reads as a cloud, not a flat panel), and every link
            // carries packet traffic
            for (let i = 0; i < p.nodeCount; i++) {
                pts.push([-0.8 + rand() * 1.6, -0.5 + rand() * 1.0, -0.5 + rand() * 1.0]);
            }
            for (let i = 0; i < p.nodeCount && edges.length < 80; i++) {
                for (let j = i + 1; j < p.nodeCount && edges.length < 80; j++) {
                    const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1];
                    const dz = pts[i][2] - pts[j][2];
                    if (Math.hypot(dx, dy, dz) < 0.72) edges.push([i, j]);
                }
            }
        }
        return { pts, edges: edges.filter(e => e[0] < pts.length && e[1] < pts.length), mode };
    }

    // ─────────────────────────────────────────────────────────────────────
    // Radar Sweep — tilted 3D radar disc: range rings, spokes, tick dial,
    // rotating sweep wedge with trailing glow, blinking friendly/hostile
    // blips, periodic contact pulse.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-radarsweep',
        name: 'Radar Sweep',
        category: 'Interface',
        continuous: true,
        prewarm: 80,
        textures: (p) => ['ring_soft', 'streak', 'ticks', 'techstrip', 'particle_hard', 'glow_soft', 'flat']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('AEGIS ARRAY'),
            { key: 'labelPos', label: 'Text Position', type: 'select', default: 'top',
              options: [
                  { value: 'top', label: 'Top' },
                  { value: 'bottom', label: 'Bottom' },
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
              ] },
            { key: 'sweepColor', label: 'Sweep Color', type: 'color', default: '#80ff80' },
            { key: 'ringColor', label: 'Ring Color', type: 'color', default: '#40b070' },
            { key: 'enemyColor', label: 'Hostile Color', type: 'color', default: '#ff5050' },
            { key: 'blipCount', label: 'Blips', type: 'range', default: 12, min: 0, max: 40, step: 1 },
            { key: 'rangeRings', label: 'Range Rings', type: 'range', default: 4, min: 1, max: 8, step: 1 },
            { key: 'sweepCycles', label: 'Sweep Cycles', type: 'range', default: 1, min: 1, max: 6, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, spinner, band, quad, pulse, U, B } = K;
            const cs = U.hexToRgba(p.sweepColor);
            const cr = U.hexToRgba(p.ringColor);
            const ce = U.hexToRgba(p.enemyColor);
            const TEX = { ring: 0, streak: 1, ticks: 2, strip: 3, dot: 4, glow: 5, flat: 6 };
            const nodes = [];

            for (let i = 1; i <= p.rangeRings; i++) {
                nodes.push(band({ tex: TEX.ring, radius: (i / p.rangeRings) * 0.88,
                    width: 0.025, color: cr, alpha: 190 + (i === p.rangeRings ? 65 : 0) }));
            }
            // crosshair spokes in the disc plane
            const spokes = [];
            for (const rz of [0, Math.PI / 2]) {
                spokes.push(quad({ tex: TEX.streak, w: 0.014, h: 1.76, color: cr, alpha: 120,
                    billboard: 2, rotZ: rz }));
            }
            nodes.push(group({ rot: v3(Math.PI / 2, 0, 0) }, spokes));

            // outer dial: clean tick ring + thin bounding rings (the glyph
            // strip read as noise at dial scale)
            nodes.push(band({ tex: TEX.ticks, radius: 1.02, width: 0.05, color: cr,
                alpha: 255, scroll: -0.0035, repeats: 2, whiteCenter: true }));
            nodes.push(band({ tex: TEX.ring, radius: 1.12, width: 0.018, color: cr, alpha: 235 }));
            nodes.push(band({ tex: TEX.ring, radius: 0.94, width: 0.015, color: cr, alpha: 210 }));

            // sweep: a bright radial blade with trailing fade blades.
            // (ring viewingAngle arcs are UNUSED in the entire stock corpus
            // — 185/185 rings are 360° — and don't render in this runtime,
            // so the classic trail is faked with staggered blades instead.)
            const blades = [];
            for (let i = 0; i < 6; i++) {
                const a = -i * 0.16;   // trailing angular offsets (radians)
                blades.push(quad({
                    tex: TEX.streak, x: Math.sin(a) * 0.44, y: Math.cos(a) * 0.44,
                    w: i === 0 ? 0.04 : 0.06 + i * 0.022, h: 0.88,
                    color: cs, alpha: [255, 190, 140, 95, 60, 30][i],
                    rotZ: -a,
                }));
            }
            nodes.push(spinner(40 * p.sweepCycles,
                [group({ rot: v3(Math.PI / 2, 0, 0) }, blades)]));

            // blips: 2/3 friendly (slow blink), 1/3 hostile (urgent blink)
            const blip = (count, color, lifeA, lifeB) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(lifeA, lifeB),
                                generationTime: rf(Math.max(1.5, 90 / Math.max(1, count))) },
                generationLocation: {
                    type: 3, division: 16, radius: rf(0.12, 0.82),
                    angleStart: rf(0), angleEnd: rf(360),
                    circleType: 2, axisDirection: 1, angleNoize: rf(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(0.045, 0.045, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.dot, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 4, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 12, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...color, a: 255 }) },
            });
            if (p.blipCount > 0) {
                nodes.push(group({ rot: v3(Math.PI / 2, 0, 0) }, [
                    blip(Math.ceil(p.blipCount * 2 / 3), cs, 50, 90),
                    blip(Math.ceil(p.blipCount / 3), ce, 18, 34),
                ]));
            }

            nodes.push(quad({ tex: TEX.dot, w: 0.06, h: 0.06, color: cs, alpha: 255 }));
            nodes.push(pulse({ tex: TEX.ring, r0: 0.1, r1: 0.95, period: 110, color: cs, alpha: 120 }));

            // presentation tilt so the disc reads as an ellipse, not a line;
            // the user's Display Text floats upright at the chosen side
            const labelAt = {
                top: { x: 0, y: 0.98 },
                bottom: { x: 0, y: -0.98 },
                left: { x: -1.28, y: 0 },
                right: { x: 1.28, y: 0 },
            }[p.labelPos] || { x: 0, y: 0.98 };
            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, [
                group({ rot: v3(0.5, 0, 0) }, nodes),
                textNode(K, 7, { ...labelAt, w: 0.85, color: cs }),
            ])];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Target Lock — screen-space reticle: converging corner brackets on a
    // lock cycle, counter-rotating dials, crosshair ticks, red lock flash.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-targetlock',
        name: 'Target Lock',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['ring_soft', 'streak', 'ticks', 'techstrip', 'particle_hard', 'techglyphs']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('TARGET LOCK'),
            { key: 'reticleColor', label: 'Reticle Color', type: 'color', default: '#40d0ff' },
            { key: 'lockColor', label: 'Lock Color', type: 'color', default: '#ff4040' },
            { key: 'scanColor', label: 'Scan Color', type: 'color', default: '#80ffe0' },
            { key: 'lockCycles', label: 'Lock Cycles', type: 'range', default: 1, min: 1, max: 6, step: 1 },
            { key: 'scanLines', label: 'Scan Lines', type: 'range', default: 2, min: 0, max: 6, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, band, quad, glyphFlicker, pulse, U, B } = K;
            const cr = U.hexToRgba(p.reticleColor);
            const cl = U.hexToRgba(p.lockColor);
            const cs = U.hexToRgba(p.scanColor);
            const TEX = { ring: 0, streak: 1, ticks: 2, strip: 3, dot: 4, glyphs: 5 };
            const cyc = Math.max(45, Math.round(210 / p.lockCycles));
            const nodes = [];

            nodes.push(band({ tex: TEX.ticks, radius: 0.92, width: 0.05, color: cr,
                alpha: 235, scroll: 0.004, repeats: 2, flat: false }));
            nodes.push(band({ tex: TEX.strip, radius: 1.05, width: 0.055, color: cr,
                alpha: 255, scroll: -0.003, repeats: 6, flat: false }));

            // converging corner brackets, respawning every lock cycle.
            // Convention: streak quads are w=thickness, h=length along the
            // local y axis, rotZ orients — and MUST be billboard 2: node Z
            // rotation is ignored on camera-facing (billboard 0) sprites.
            const bracketKids = [];
            for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
                bracketKids.push(quad({ tex: TEX.streak, x: sx * 0.52, y: sy * 0.62, w: 0.032, h: 0.24,
                    color: cr, alpha: 255, rotZ: Math.PI / 2 }));
                bracketKids.push(quad({ tex: TEX.streak, x: sx * 0.62, y: sy * 0.52, w: 0.032, h: 0.24,
                    color: cr, alpha: 255 }));
            }
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(cyc), generationTime: rf(cyc) },
                scaling: { type: 2, refEqS: rf(-1), refEqE: rf(-1),
                           start: rv3(1.55), end: rv3(1.0), params: [0, 0, 1] },
                children: bracketKids,
            }));

            // crosshair edge ticks + center
            for (const [x, y, rz] of [[0, 0.42, 0], [0, -0.42, 0], [0.42, 0, Math.PI / 2], [-0.42, 0, Math.PI / 2]]) {
                nodes.push(quad({ tex: TEX.streak, x, y, w: 0.022, h: 0.14, color: cr, alpha: 230,
                    rotZ: rz }));
            }
            nodes.push(band({ tex: TEX.ring, radius: 0.14, width: 0.09, color: cr, alpha: 220, flat: false }));
            nodes.push(quad({ tex: TEX.dot, w: 0.05, h: 0.05, color: cr, alpha: 255, billboard: 0 }));

            // LOCK: red flash ring + glyph burst at the end of each cycle
            nodes.push(pulse({ tex: TEX.ring, r0: 0.75, r1: 0.5, period: cyc, life: 16,
                color: cl, flat: false, alpha: 255 }));
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(14),
                                generationTime: rf(cyc), generationTimeOffset: rf(Math.max(0, cyc - 15)) },
                scaling: { type: 0, refEq: -1, scale: v3(0.42, 0.42, 1) },
                rendererCommon: { colorTextureIndex: TEX.dot, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] } },
                rendererParams: { billboard: 0, allColor: U.fixedColor({ ...cl, a: 130 }) },
            }));

            // scan lines drifting down the reticle
            if (p.scanLines > 0) {
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(55),
                                    generationTime: rf(Math.max(4, Math.round(90 / p.scanLines))) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(0, 0.45, 0.01), v3(0, 0.7, 0.01)),
                        velocity: rv3(v3(0, -0.014, 0), v3(0, -0.02, 0)), acceleration: rv3(0),
                    },
                    rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.03, 1.5, 1) },
                    rendererCommon: {
                        colorTextureIndex: TEX.streak, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: U.fixedColor({ ...cs, a: 140 }) },
                }));
            }
            nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.75, areaH: 0.6, size: 0.09,
                color: cs, rate: 2, alpha: 220 }));

            // blinking warning text under the reticle
            nodes.push(textNode(K, 6, { y: -0.94, w: 0.8, color: cl, blink: 26 }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Power Levels — floating equalizer: framed bar array bouncing at
    // staggered phases, tick baseline, flickering glyph readouts.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-powerlevels',
        name: 'Power Levels',
        category: 'Interface',
        continuous: true,
        prewarm: 70,
        textures: (p) => ['streak', 'ticks', 'techglyphs', 'flat', 'glow_soft', 'scanlines', 'ekg', 'techstrip', 'pill']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('PWR OUTPUT'),
            { key: 'color1', label: 'Primary Data', type: 'color', default: '#50ffd0' },
            { key: 'color2', label: 'Secondary Data', type: 'color', default: '#ffc040' },
            { key: 'borderColor', label: 'Border Color', type: 'color', default: '#40d0ff' },
            { key: 'barCount', label: 'Bars', type: 'range', default: 8, min: 1, max: 24, step: 1 },
            { key: 'textRows', label: 'Text Rows', type: 'range', default: 5, min: 0, max: 12, step: 1 },
            { key: 'waveFreq', label: 'Wave Frequency', type: 'range', default: 3, min: 0, max: 16, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, quad, glyphFlicker, U, B } = K;
            const c1 = U.hexToRgba(p.color1);
            const c2 = U.hexToRgba(p.color2);
            const cb = U.hexToRgba(p.borderColor);
            const TEX = { streak: 0, ticks: 1, glyphs: 2, flat: 3, glow: 4,
                          scan: 5, ekg: 6, strip: 7, pill: 8 };
            const nodes = [];

            // frame + corner brackets (instrument bezel)
            const FW = 1.5, FH = 1.0;
            // dark screen backing — additive elements need contrast to read
            // as an instrument instead of floating toy bars
            nodes.push(quad({ tex: TEX.flat, w: FW, h: FH, color: { r: 7, g: 15, b: 22 },
                alpha: 215, blend: 1 }));
            nodes.push(quad({ tex: TEX.streak, y: FH / 2, w: 0.016, h: FW + 0.05, color: cb, alpha: 235, rotZ: Math.PI / 2 }));
            nodes.push(quad({ tex: TEX.streak, y: -FH / 2, w: 0.016, h: FW + 0.05, color: cb, alpha: 235, rotZ: Math.PI / 2 }));
            nodes.push(quad({ tex: TEX.streak, x: FW / 2, w: 0.016, h: FH + 0.05, color: cb, alpha: 235 }));
            nodes.push(quad({ tex: TEX.streak, x: -FW / 2, w: 0.016, h: FH + 0.05, color: cb, alpha: 235 }));
            for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
                nodes.push(quad({ tex: TEX.streak, x: sx * (FW / 2 - 0.05), y: sy * (FH / 2 + 0.02),
                    w: 0.03, h: 0.15, color: cb, alpha: 255, rotZ: Math.PI / 2 }));
                nodes.push(quad({ tex: TEX.streak, x: sx * (FW / 2 + 0.02), y: sy * (FH / 2 - 0.05),
                    w: 0.03, h: 0.15, color: cb, alpha: 255 }));
            }
            // faint scanline backdrop — reads as a lit screen
            nodes.push(quad({ tex: TEX.scan, w: FW, h: FH, color: U.dim(cb, 0.6), alpha: 28,
                uv: { type: 3, position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 1, y: 2.5 }, min: { x: 1, y: 2.5 } },
                      speed: { max: { x: 0, y: 0.0015 }, min: { x: 0, y: 0.0015 } } } }));
            // horizontal graticule lines
            for (const gy of [-0.2, 0.05, 0.3]) {
                nodes.push(quad({ tex: TEX.flat, y: gy, w: FW * 0.92, h: 0.006,
                    color: U.dim(cb, 0.7), alpha: 70 }));
            }
            // side scale rulers
            nodes.push(quad({ tex: TEX.ticks, x: -FW / 2 + 0.05, w: 0.05, h: FH * 0.9, color: cb, alpha: 220,
                uv: { type: 3, position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 2, y: 1 }, min: { x: 2, y: 1 } },
                      speed: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } } } }));
            // ticks baseline the bars stand on (INSIDE the frame)
            const BASE = -0.24;
            nodes.push(quad({ tex: TEX.ticks, y: BASE - 0.035, w: FW * 0.92, h: 0.045, color: cb, alpha: 230,
                uv: { type: 3, position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 3, y: 1 }, min: { x: 3, y: 1 } },
                      speed: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } } } }));
            // user title + oscilloscope trace, both INSIDE the bezel
            nodes.push(textNode(K, 9, { x: -FW / 2 + 0.36, y: FH / 2 - 0.1, w: 0.6, color: cb }));
            nodes.push(quad({ tex: TEX.ekg, y: -FH / 2 + 0.1, w: FW * 0.86, h: 0.13,
                color: c1, alpha: 235,
                uv: { type: 3, position: { max: { x: 1, y: 0.5 }, min: { x: 0, y: 0.5 } },
                      size: { max: { x: 2.5, y: 0.5 }, min: { x: 2.5, y: 0.5 } },
                      speed: { max: { x: -0.004, y: 0 }, min: { x: -0.004, y: 0 } } } }));

            // bars: SEGMENTED LED ladders ANCHORED to the baseline — center-
            // floating bars read as decoration, meters must stand on their
            // axis. Anchor trick: position AND scale ease in lockstep with
            // the SAME timing (fixed per-phase heights), so the bottom edge
            // (y − h/2) stays glued to BASE while the top rises.
            const usable = FW * 0.88;
            const bw = Math.min(0.09, (usable / p.barCount) * 0.62);
            const cycle = Math.max(18, 64 - p.waveFreq * 3);
            const rand = mulberry32(5 + p.barCount * 17);
            for (let i = 0; i < p.barCount; i++) {
                const x = -usable / 2 + ((i + 0.5) / p.barCount) * usable;
                const col = i % 2 ? c2 : c1;
                const h0 = 0.08 + rand() * 0.18;
                const h1 = 0.3 + rand() * 0.38;
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(cycle),
                                    generationTime: rf(cycle), generationTimeOffset: rf((i * 7) % cycle) },
                    translation: {
                        type: 2, refEqS: rf(-1), refEqE: rf(-1),
                        start: rv3(v3(x, BASE + h0 / 2, 0)),
                        end: rv3(v3(x, BASE + h1 / 2, 0)),
                        params: [0, 0, 1],
                    },
                    scaling: {
                        type: 2, refEqS: rf(-1), refEqE: rf(-1),
                        start: rv3(v3(bw, h0, 1)),
                        end: rv3(v3(bw, h1, 1)),
                        params: [0, 0, 1],
                    },
                    rendererCommon: {
                        colorTextureIndex: TEX.scan, alphaBlend: 2,
                        uv: { type: 3,
                              position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                              size: { max: { x: 1, y: 1 }, min: { x: 1, y: 1 } },
                              speed: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } } },
                        fadeInType: 1, fadeIn: { frame: 4, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 4, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: U.fixedColor({ ...col, a: 255 }) },
                }));
                // peak-hold marker flashing above the bar's high point
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(22),
                                    generationTime: rf(cycle), generationTimeOffset: rf((i * 7 + cycle - 12) % cycle) },
                    translation: { type: 0, refEq: -1, position: v3(x, BASE + h1 + 0.02, 0.01) },
                    scaling: { type: 0, refEq: -1, scale: v3(bw, 0.014, 1) },
                    rendererCommon: { colorTextureIndex: TEX.flat, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                    rendererParams: { billboard: 2, allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 235 }) },
                }));
                // channel status dot under the baseline (inside the frame)
                nodes.push(quad({ tex: TEX.glow, x, y: BASE - 0.09,
                    w: 0.035, h: 0.035, color: col, alpha: 255,
                    life: 50, genTime: 50, genOffset: (i * 9) % 50, fadeIn: 14, fadeOut: 14 }));
            }

            if (p.textRows > 0) {
                nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.24, areaH: 0.045,
                    x: FW / 2 - 0.32, y: FH / 2 - 0.1, size: 0.075, color: cb, rate: p.textRows, alpha: 235 }));
            }

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Network Nodes — spinning 3D constellation: strut-frame edges, glowing
    // breathing nodes, pulses marching the ring.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-networknodes',
        name: 'Network Nodes',
        category: 'Interface',
        continuous: true,
        prewarm: 70,
        textures: (p) => ['particle_hard', 'glow_soft', 'techglyphs']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        buildModels(p, M) {
            const { pts, edges } = netLayout(p);
            return [
                { path: `Model/rr_ui_net_n${p.nodeCount}_l${p.layout}_v3.efkmodel`,
                  mesh: { ...M.strutFrame(pts, edges, 0.011), scale: 1 } },
                // shared little sphere — every node is an instance
                { path: `Model/rr_ui_net_sphere_v${M.MESH_REV || 1}.efkmodel`,
                  mesh: M.buildGeometry('sphere', { style: 'solid' }).mesh },
            ];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('NET.GRID.7'),
            { key: 'nodeColor', label: 'Node Color', type: 'color', default: '#80c0ff' },
            { key: 'pulseColor', label: 'Pulse Color', type: 'color', default: '#80ffe0' },
            { key: 'edgeColor', label: 'Edge Color', type: 'color', default: '#608090' },
            { key: 'nodeCount', label: 'Nodes', type: 'range', default: 20, min: 3, max: 40, step: 1 },
            { key: 'layout', label: 'Layout', type: 'select', default: 'mesh',
              options: [
                  { value: 'ring', label: 'Ring' },
                  { value: 'grid', label: 'Grid' },
                  { value: 'mesh', label: 'Mesh' },
              ] },
            { key: 'pulsesPerEdge', label: 'Pulses / Edge', type: 'range', default: 1, min: 0, max: 4, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, spinner, quad, beads, U, B } = K;
            const cn = U.hexToRgba(p.nodeColor);
            const cp = U.hexToRgba(p.pulseColor);
            const ce = U.hexToRgba(p.edgeColor);
            const TEX = { dot: 0, glow: 1, glyphs: 2 };
            const nodes = [];

            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: TEX.glow, alphaBlend: 2 },
                rendererParams: { modelIndex: 0, billboard: 2, culling: 2,
                                  allColor: U.fixedColor({ ...ce, a: 235 }) },
            }));

            const { pts, edges, mode } = netLayout(p);
            const ring = mode === 'ring';

            // nodes: little SPHERES (shared solid model, one instance per
            // node) with a soft halo; alternate nodes fire an expanding
            // burst ring so the network reads busy even between packets
            const lift = (c, f) => ({ r: Math.round(c.r + (255 - c.r) * f),
                                      g: Math.round(c.g + (255 - c.g) * f),
                                      b: Math.round(c.b + (255 - c.b) * f) });
            pts.forEach(([x, y, z], i) => {
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    translation: { type: 0, refEq: -1, position: v3(x, y, z) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.052, 0.052, 0.052) },
                    rendererCommon: { colorTextureIndex: TEX.glow, alphaBlend: 2 },
                    rendererParams: { modelIndex: 1, billboard: 2, culling: 1,
                                      allColor: U.fixedColor({ ...lift(cn, 0.35), a: 255 }) },
                }));
                nodes.push(quad({ tex: TEX.glow, x, y, z, w: 0.15, h: 0.15, color: cn, alpha: 80 }));
                if (i % 2 === 0) {
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(18),
                                        generationTime: rf(90),
                                        generationTimeOffset: rf((i * 17) % 90) },
                        translation: { type: 0, refEq: -1, position: v3(x, y, z) },
                        scaling: { type: 4, start: rf(0.06), end: rf(0.3), params: [0, 0, 1] },
                        rendererCommon: {
                            colorTextureIndex: TEX.glow, alphaBlend: 2,
                            fadeOutType: 1, fadeOut: { frame: 14, params: [0, 0, 0] },
                        },
                        rendererParams: { allColor: U.fixedColor({ ...cn, a: 170 }) },
                    }));
                }
            });

            // PACKETS: bright dots traveling the actual edges (one emitter
            // per edge, velocity = edge vector / flight time), plus an
            // arrival flash at the destination node.
            if (p.pulsesPerEdge > 0) {
                const T = 34;   // flight frames
                const genTime = Math.max(T + 6, Math.round(120 / p.pulsesPerEdge));
                edges.forEach(([a, b], k) => {
                    const [ax, ay, az] = pts[a];
                    const [bx, by, bz] = pts[b];
                    // alternate direction per edge so traffic flows both ways
                    const fwd = k % 2 === 0;
                    const [sx, sy, sz] = fwd ? [ax, ay, az] : [bx, by, bz];
                    const [ex, ey, ez] = fwd ? [bx, by, bz] : [ax, ay, az];
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(T),
                                        generationTime: rf(genTime),
                                        generationTimeOffset: rf((k * 13) % genTime) },
                        translation: {
                            type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                            location: rv3(v3(sx, sy, sz)),
                            velocity: rv3(v3((ex - sx) / T, (ey - sy) / T, (ez - sz) / T)),
                            acceleration: rv3(0),
                        },
                        scaling: { type: 0, refEq: -1, scale: v3(0.05, 0.05, 1) },
                        rendererCommon: {
                            colorTextureIndex: TEX.dot, alphaBlend: 2,
                            fadeInType: 1, fadeIn: { frame: 4, params: [0, 0, 0] },
                        },
                        rendererParams: { allColor: U.fixedColor({ ...cp, a: 255 }) },
                    }));
                    // arrival flash at the destination
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(10),
                                        generationTime: rf(genTime),
                                        generationTimeOffset: rf((k * 13 + T) % genTime) },
                        translation: { type: 0, refEq: -1, position: v3(ex, ey, ez) },
                        scaling: { type: 4, start: rf(0.08), end: rf(0.22), params: [0, 0, 1] },
                        rendererCommon: {
                            colorTextureIndex: TEX.glow, alphaBlend: 2,
                            fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] },
                        },
                        rendererParams: { allColor: U.fixedColor({ ...cp, a: 200 }) },
                    }));
                });
                // ambient beads circling the constellation — the bead orbit
                // lies in the XZ plane, so only the 3D ring layout wants it
                // (on flat panel layouts it renders as a stray dot line)
                if (ring) {
                    nodes.push(beads({ tex: TEX.dot, radius: 0.95,
                        division: 16, genTime: 8, life: 60, size: 0.03,
                        color: cp, alpha: 140 }));
                }
            }

            // ring AND mesh are 3D constructs — tilt + slow spin sells the
            // volume; only the grid stays a flat upright panel
            const assembly = mode === 'grid'
                ? group({}, nodes)
                : group({ rot: v3(ring ? 0.45 : 0.3, 0, 0),
                          scale: v3(0.72, 0.72, 0.72) }, [spinner(14, nodes)]);
            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, [
                assembly,
                textNode(K, 3, { y: -0.85, w: 0.7, color: cn }),
            ])];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Hex Memory Dump — data vortex: cylinder curtain of falling glyph
    // columns around a glowing core, spiraling inscription bands, hot-byte
    // flashes.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-hexdump',
        name: 'Hex Memory Dump',
        category: 'Interface',
        continuous: true,
        prewarm: 90,
        textures: (p) => ['datarain', 'streak', 'techstrip', 'ring_soft', 'techglyphs', 'glow_soft']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('MEM.DUMP'),
            { key: 'byteColor', label: 'Byte Color', type: 'color', default: '#80ffa0' },
            { key: 'offsetColor', label: 'Offset Color', type: 'color', default: '#a070ff' },
            { key: 'highlightColor', label: 'Hot Byte Color', type: 'color', default: '#ff5060' },
            { key: 'rows', label: 'Rows', type: 'range', default: 14, min: 4, max: 32, step: 1 },
            { key: 'charsPerRow', label: 'Bytes / Row', type: 'range', default: 12, min: 4, max: 32, step: 1 },
            { key: 'scrollSpeed', label: 'Update Rate', type: 'range', default: 4, min: 0, max: 12, step: 1 },
            { key: 'spreadH', label: 'Horizontal Spread', type: 'range', default: 0.56, min: 0.3, max: 1.1, step: 0.02 },
            { key: 'spreadV', label: 'Vertical Spread', type: 'range', default: 0.45, min: 0.2, max: 0.9, step: 0.02 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, band, quad, glyphFlicker, U, B } = K;
            const cb = U.hexToRgba(p.byteColor);
            const co = U.hexToRgba(p.offsetColor);
            const ch = U.hexToRgba(p.highlightColor);
            const TEX = { rain: 0, streak: 1, strip: 2, ring: 3, glyphs: 4, glow: 5 };
            const nodes = [];
            const colH = 0.34 + p.rows * 0.015;

            // falling code curtain around the cylinder
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(60, 95),
                                generationTime: rf(Math.max(1, 30 / p.charsPerRow)) },
                generationLocation: {
                    type: 3, division: 24, radius: rf(p.spreadH - 0.06, p.spreadH + 0.06),
                    angleStart: rf(0), angleEnd: rf(360),
                    circleType: 2, axisDirection: 1, angleNoize: rf(15),
                },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(0, p.spreadV * 0.45, 0), v3(0, p.spreadV * 1.1, 0)),
                    velocity: rv3(v3(0, -0.006, 0), v3(0, -0.012, 0)),
                    acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(0.11, colH, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.rain, alphaBlend: 2,
                    uv: { type: 3,
                          position: { max: { x: 0.66, y: 0 }, min: { x: 0, y: 0 } },
                          size: { max: { x: 0.34, y: Math.min(1, p.rows / 20) }, min: { x: 0.34, y: Math.min(1, p.rows / 20) } },
                          speed: { max: { x: 0, y: 0.0012 * p.scrollSpeed }, min: { x: 0, y: 0.0006 * p.scrollSpeed } } },
                    fadeInType: 1, fadeIn: { frame: 14, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 16, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 0, allColor: U.fixedColor({ ...cb, a: 255 }) },
            }));

            // glowing core column
            nodes.push(quad({ tex: TEX.streak, w: 0.13, h: 1.15, color: cb, alpha: 70 }));
            nodes.push(quad({ tex: TEX.streak, w: 0.13, h: 1.15, color: cb, alpha: 70, rotY: Math.PI / 2 }));
            nodes.push(quad({ tex: TEX.glow, w: 0.45, h: 0.45, color: U.dim(cb, 0.7), alpha: 60 }));

            // spiraling inscription bands + rim rings — positions/radii
            // follow the user's Horizontal/Vertical Spread
            nodes.push(band({ tex: TEX.strip, radius: p.spreadH + 0.04, width: 0.13, color: co, alpha: 255,
                scroll: 0.004, repeats: 6, y: -p.spreadV * 0.93, whiteCenter: true }));
            nodes.push(band({ tex: TEX.strip, radius: p.spreadH - 0.06, width: 0.13, color: co, alpha: 255,
                scroll: -0.006, repeats: 6, y: p.spreadV * 0.89 }));
            nodes.push(band({ tex: TEX.ring, radius: p.spreadH + 0.06, width: 0.05, color: co, alpha: 210, y: -(p.spreadV + 0.07) }));
            nodes.push(band({ tex: TEX.ring, radius: p.spreadH - 0.01, width: 0.05, color: co, alpha: 190, y: p.spreadV + 0.05 }));

            // hot bytes flashing inside the vortex
            nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.4, areaH: 0.4, size: 0.13,
                color: ch, rate: 3, alpha: 255, lifeMin: 4, lifeMax: 9 }));

            const K2 = kit();
            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, [
                group({ rot: v3(0.45, 0, 0) }, [K2.spinner(8, nodes)]),
                textNode(K, 6, { y: -(p.spreadV + 0.38), w: 0.7, color: cb }),
            ])];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Boot Screen — cascading holo-terminal: log lines materialize in
    // sequence, progress bar fills, success flash, then the boot repeats.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-bootscreen',
        name: 'Boot Screen',
        category: 'Interface',
        continuous: true,
        prewarm: 30,
        // indices: 0-4 builtins, 5 title strip, 6 paragraph page
        textures: (p) => ['code', 'streak', 'particle_hard', 'techstrip', 'techglyphs']
            .map(n => `Texture/rr_${n}.png`)
            .concat([textPath(p.label), textPath('P:' + p.body)]),
        textTextures: (p) => [
            { path: textPath(p.label), text: p.label },
            { path: textPath('P:' + p.body), text: p.body, mode: 'para' },
        ],
        buildModels(p, M) {
            // system emblem: wireframe icosahedron that spins up mid-boot
            return [{ path: `Model/rr_ui_boot_icosa_v${M.MESH_REV || 1}.efkmodel`,
                      mesh: M.buildGeometry('icosahedron', { style: 'wire', thickness: 0.02 }).mesh }];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('RPG REACTOR OS'),
            { key: 'body', label: 'Paragraph Text', type: 'textarea', maxLen: 500, default: '' },
            { key: 'textColor', label: 'Text Color', type: 'color', default: '#80f0d0' },
            { key: 'accentColor', label: 'Accent Color', type: 'color', default: '#ff7050' },
            { key: 'successColor', label: 'Success Color', type: 'color', default: '#80ff60' },
            { key: 'logRows', label: 'Log Rows', type: 'range', default: 8, min: 3, max: 18, step: 1 },
            { key: 'scrollSpeed', label: 'Scroll Speed', type: 'range', default: 3, min: 1, max: 8, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, spinner, quad, glyphFlicker, U, B } = K;
            const ct = U.hexToRgba(p.textColor);
            const ca = U.hexToRgba(p.accentColor);
            const cs = U.hexToRgba(p.successColor);
            const TEX = { code: 0, streak: 1, dot: 2, strip: 3, glyphs: 4 };
            const rand = mulberry32(77 + p.logRows * 13);
            const interval = Math.max(6, Math.round(30 - p.scrollSpeed * 3));
            // user Paragraph Text: each of THEIR lines becomes a boot log
            // row (para-page y-slices); empty → procedural code cascade
            const info = (typeof RR_EfkTextures !== 'undefined' && RR_EfkTextures.userParaInfo)
                ? RR_EfkTextures.userParaInfo(p.body) : null;
            const useBody = !!(p.body && info && info.lineCount > 0);
            const rowsN = useBody ? Math.min(info.lineCount, 18) : p.logRows;
            const cycle = rowsN * interval + 70;
            const nodes = [];

            // log lines: each row is a SLICE OF REAL-LOOKING CODE (or of
            // the user's paragraph page), appearing top-to-bottom, a typing
            // cursor hopping row to row, OK tags stamping finished rows,
            // everything clearing when the boot cycle repeats. Drawn twice
            // for additive brightness.
            for (let i = 0; i < rowsN; i++) {
                const wi = useBody ? 1.15 : 0.5 + rand() * 0.7;
                const codeRow = Math.floor(rand() * 16);   // which source row
                const yy = 0.48 - (i / Math.max(1, rowsN - 1)) * 0.86;
                const last = i === rowsN - 1;
                const base = last ? cs : (i % 3 === 2 ? ca : ct);
                // lift toward white — thin additive glyphs read too dark
                const col = { r: Math.round(base.r + (255 - base.r) * 0.35),
                              g: Math.round(base.g + (255 - base.g) * 0.35),
                              b: Math.round(base.b + (255 - base.b) * 0.35) };
                const line = () => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999,
                                    life: rf(cycle - i * interval),
                                    generationTime: rf(cycle),
                                    generationTimeOffset: rf(i * interval) },
                    translation: { type: 0, refEq: -1, position: v3(-0.7 + wi / 2, yy, 0) },
                    scaling: { type: 0, refEq: -1, scale: v3(wi, useBody ? 0.115 : 0.1, 1) },
                    rendererCommon: {
                        colorTextureIndex: useBody ? 6 : TEX.code, alphaBlend: 2,
                        uv: useBody
                            ? { type: 3,
                                position: { max: { x: 0, y: i * info.rowFrac }, min: { x: 0, y: i * info.rowFrac } },
                                size: { max: { x: 1, y: info.rowFrac }, min: { x: 1, y: info.rowFrac } },
                                speed: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } } }
                            : { type: 3,
                                position: { max: { x: 0, y: codeRow / 16 }, min: { x: 0, y: codeRow / 16 } },
                                size: { max: { x: wi * 0.75, y: 1 / 16 }, min: { x: wi * 0.75, y: 1 / 16 } },
                                speed: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } } },
                        fadeInType: 1, fadeIn: { frame: 4, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 6, params: [0, 0, 0] },
                    },
                    rendererParams: { billboard: 2, allColor: U.fixedColor({ ...col, a: 255 }) },
                });
                nodes.push(line(), line());

                // typing cursor: lives only while this row is the newest one
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999,
                                    life: rf(last ? 50 : interval),
                                    generationTime: rf(cycle),
                                    generationTimeOffset: rf(i * interval) },
                    translation: { type: 0, refEq: -1, position: v3(useBody ? 0.52 : -0.7 + wi + 0.06, yy, 0) },
                    scaling: { type: 0, refEq: -1, scale: v3(0.05, 0.1, 1) },
                    rendererCommon: { colorTextureIndex: TEX.dot, alphaBlend: 2 },
                    rendererParams: { billboard: 2, allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 255 }) },
                }));

                // OK tag stamped at the right margin shortly after the row
                // (procedural cascade only — user lines are the message)
                if (i % 3 === 0 && !last && !useBody) {
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 99999,
                                        life: rf(Math.max(10, cycle - i * interval - 8)),
                                        generationTime: rf(cycle),
                                        generationTimeOffset: rf(i * interval + 8) },
                        translation: { type: 0, refEq: -1, position: v3(0.62, yy, 0) },
                        scaling: { type: 0, refEq: -1, scale: v3(0.12, 0.11, 1) },
                        rendererCommon: {
                            colorTextureIndex: TEX.strip, alphaBlend: 2,
                            uv: { type: 3,
                                  position: { max: { x: 0.9, y: 0 }, min: { x: 0.1, y: 0 } },
                                  size: { max: { x: 0.17, y: 1 }, min: { x: 0.17, y: 1 } },
                                  speed: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } } },
                            fadeInType: 1, fadeIn: { frame: 3, params: [0, 0, 0] },
                        },
                        rendererParams: { billboard: 2, allColor: U.fixedColor({ ...cs, a: 255 }) },
                    }));
                }
            }

            // success flash when the last line lands
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(20),
                                generationTime: rf(cycle),
                                generationTimeOffset: rf((rowsN - 1) * interval) },
                scaling: { type: 0, refEq: -1, scale: v3(1.5, 1.1, 1) },
                rendererCommon: { colorTextureIndex: TEX.dot, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 14, params: [0, 0, 0] } },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...cs, a: 60 }) },
            }));

            // system emblem: wireframe icosahedron spins up once the boot
            // is halfway, holds through the success flash, resets with the
            // cycle (respawning windowed subtree)
            const emblemStart = Math.round(cycle * 0.45);
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(cycle - emblemStart),
                                generationTime: rf(cycle),
                                generationTimeOffset: rf(emblemStart),
                                removeWhenParentIsRemoved: 1 },
                translation: { type: 0, refEq: -1, position: v3(0.45, 0.28, 0) },
                scaling: {
                    type: 2, refEqS: rf(-1), refEqE: rf(-1),
                    start: rv3(0.02), end: rv3(0.16), params: [0, 0, 1],
                },
                // windowed subtree: EVERY descendant carries the removal
                // flag or grandchildren survive the cycle reset (round-14e)
                children: [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG),
                                    removeWhenParentIsRemoved: 1 },
                    rotation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        rotation: rv3(0), velocity: rv3(v3(0, 60 * D2R / 60, 0.2 * D2R)),
                        acceleration: rv3(0),
                    },
                    children: [B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG),
                                        removeWhenParentIsRemoved: 1 },
                        rendererCommon: {
                            colorTextureIndex: TEX.streak, alphaBlend: 2,
                            fadeInType: 1, fadeIn: { frame: 20, params: [0, 0, 0] },
                        },
                        rendererParams: { modelIndex: 0, billboard: 2, culling: 2,
                                          allColor: U.fixedColor({ ...ct, a: 235 }) },
                    })],
                })],
            }));

            // progress bar: frame + fill easing to full over the cycle
            nodes.push(quad({ tex: TEX.streak, y: -0.56, w: 0.014, h: 1.44, color: ct, alpha: 200, rotZ: Math.PI / 2 }));
            nodes.push(quad({ tex: TEX.streak, y: -0.66, w: 0.014, h: 1.44, color: ct, alpha: 200, rotZ: Math.PI / 2 }));
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(cycle), generationTime: rf(cycle) },
                translation: { type: 0, refEq: -1, position: v3(0, -0.61, 0) },
                scaling: {
                    type: 2, refEqS: rf(-1), refEqE: rf(-1),
                    start: rv3(v3(0.03, 0.055, 1)), end: rv3(v3(1.38, 0.055, 1)),
                    params: [0, 0, 1],
                },
                rendererCommon: { colorTextureIndex: TEX.streak, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...cs, a: 235 }) },
            }));

            nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.35, areaH: 0.06,
                x: 0.35, y: 0.64, size: 0.07, color: ct, rate: 2, alpha: 200 }));

            // user title banner across the top of the boot panel
            nodes.push(textNode(K, 5, { x: -0.28, y: 0.64, w: 0.75, color: ct }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Vital Signs Monitor — floating EKG bands scrolling live waveforms,
    // pulsing heart glow, blinking alert glyphs.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-vitalsigns',
        name: 'Vital Signs Monitor',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['ekg', 'streak', 'glow_soft', 'techglyphs', 'scanlines']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('LIFE SIGNS'),
            { key: 'heartColor', label: 'Heartbeat Color', type: 'color', default: '#ff6080' },
            { key: 'breathColor', label: 'Respiration Color', type: 'color', default: '#60c0ff' },
            { key: 'alertColor', label: 'Alert Color', type: 'color', default: '#ffa040' },
            { key: 'rowCount', label: 'Waveform Rows', type: 'range', default: 3, min: 1, max: 8, step: 1 },
            { key: 'heartRate', label: 'Heart Rate', type: 'range', default: 3, min: 1, max: 8, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, v3, group, quad, glyphFlicker, U, B } = K;
            const ch = U.hexToRgba(p.heartColor);
            const cb = U.hexToRgba(p.breathColor);
            const ca = U.hexToRgba(p.alertColor);
            const TEX = { ekg: 0, streak: 1, glow: 2, glyphs: 3, scan: 4 };
            const nodes = [];
            const FW = 1.5;
            const bandH = Math.min(0.3, 1.0 / p.rowCount);

            for (let i = 0; i < p.rowCount; i++) {
                const heart = i % 2 === 0;
                const yy = (p.rowCount - 1) * bandH * 0.55 - i * bandH * 1.1;
                const col = heart ? ch : cb;
                nodes.push(quad({
                    tex: TEX.ekg, y: yy, w: FW, h: bandH, color: col, alpha: 245,
                    uv: { type: 3,
                          position: { max: { x: 1, y: heart ? 0 : 0.5 }, min: { x: 0, y: heart ? 0 : 0.5 } },
                          size: { max: { x: 2, y: 0.5 }, min: { x: 2, y: 0.5 } },
                          speed: { max: { x: -0.0016 * p.heartRate, y: 0 }, min: { x: -0.0016 * p.heartRate, y: 0 } } },
                }));
                // leading edge glow dot at the right end of each band
                nodes.push(quad({ tex: TEX.glow, x: FW * 0.44, y: yy, w: 0.1, h: 0.1, color: col, alpha: 150 }));
            }

            // frame lines
            nodes.push(quad({ tex: TEX.streak, y: 0.62, w: 0.015, h: FW + 0.1, color: cb, alpha: 190, rotZ: Math.PI / 2 }));
            nodes.push(quad({ tex: TEX.streak, y: -0.62, w: 0.015, h: FW + 0.1, color: cb, alpha: 190, rotZ: Math.PI / 2 }));

            // heartbeat pulse glow (regenerates at the heart rate)
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(Math.max(10, Math.round(70 / p.heartRate))),
                                generationTime: rf(Math.max(12, Math.round(75 / p.heartRate))) },
                translation: { type: 0, refEq: -1, position: v3(-FW * 0.44, 0.62, 0) },
                scaling: { type: 4, start: rf(0.05), end: rf(0.17), params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: TEX.glow, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 12, params: [0, 0, 0] } },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...ch, a: 235 }) },
            }));

            // blinking alert glyphs (top-right) + user title (top-left)
            nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.14, areaH: 0.05,
                x: 0.55, y: 0.72, size: 0.09, color: ca, rate: 1.5, alpha: 255, lifeMin: 14, lifeMax: 26 }));
            nodes.push(textNode(K, 5, { x: -0.42, y: 0.72, w: 0.62, color: ch }));
            // faint scanline sheet behind everything
            nodes.push(quad({ tex: TEX.scan, w: FW + 0.1, h: 1.28, color: U.dim(cb, 0.5), alpha: 30,
                uv: { type: 3, position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 1, y: 2 }, min: { x: 1, y: 2 } },
                      speed: { max: { x: 0, y: 0.002 }, min: { x: 0, y: 0.002 } } } }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // LCARS — the arc console: nested elbow arcs, stacked data bars with
    // staggered blinks, spine button column, scrolling text rows.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-lcars',
        name: 'LCARS',
        category: 'Interface',
        continuous: true,
        prewarm: 40,
        // indices: 0-9 builtins, 10 title, 11 paragraph page, 12/13 captions
        textures: (p) => ['ring_soft', 'streak', 'particle_hard', 'techstrip', 'techglyphs', 'pill',
                          'code', 'graphline', 'noise', 'flat']
            .map(n => `Texture/rr_${n}.png`)
            .concat([textPath(p.label), textPath('P:' + p.body),
                     textPath('ORBITAL SCAN'), textPath('SENSOR FEED')]),
        textTextures: (p) => [
            { path: textPath(p.label), text: p.label },
            { path: textPath('P:' + p.body), text: p.body, mode: 'para' },
            { path: textPath('ORBITAL SCAN'), text: 'ORBITAL SCAN' },
            { path: textPath('SENSOR FEED'), text: 'SENSOR FEED' },
        ],
        buildModels(p, M) {
            // L-elbow fill DERIVED from the spine/rail edge coordinates so
            // it meets both bars EXACTLY (the earlier free-floating annulus
            // left gaps). Outer boundary: big corner radius; inner: small
            // fillet — sampled in lockstep and stripped into one mesh.
            const vertices = [];
            const faces = [];
            const XO = -0.7125, XI = -0.5975;   // spine outer/inner edges
            const lerp = (a, b, t) => a + (b - a) * t;
            const elbow = (yInner, yOuter, yStart, xEnd, flip) => {
                const R = 0.1, r = 0.045, N = 24;
                const base = vertices.length;
                for (let i = 0; i <= N; i++) {
                    const t = i / N;
                    let ox, oy, ix, iy;
                    if (t < 0.3) {              // vertical run out of the spine
                        const u = t / 0.3;
                        ox = XO; oy = lerp(yStart, yOuter - R, u);
                        ix = XI; iy = lerp(yStart, yInner - r, u);
                    } else if (t < 0.7) {       // the corner turn
                        const u = (t - 0.3) / 0.4;
                        const a = Math.PI - u * (Math.PI / 2);   // 180° → 90°
                        ox = (XO + R) + Math.cos(a) * R; oy = (yOuter - R) + Math.sin(a) * R;
                        ix = (XI + r) + Math.cos(a) * r; iy = (yInner - r) + Math.sin(a) * r;
                    } else {                    // horizontal run into the rail
                        const u = (t - 0.7) / 0.3;
                        ox = lerp(XO + R, xEnd, u); oy = yOuter;
                        ix = lerp(XI + r, xEnd, u); iy = yInner;
                    }
                    vertices.push(
                        { p: [ox, oy * flip, 0], n: [0, 0, 1], uv: [t, 0] },
                        { p: [ix, iy * flip, 0], n: [0, 0, 1], uv: [t, 1] },
                    );
                    if (i > 0) {
                        const b = base + (i - 1) * 2;
                        faces.push([b, b + 2, b + 3], [b, b + 3, b + 1]);
                    }
                }
            };
            // top: rail edges y [0.576, 0.664], spine top 0.44 (start inside)
            elbow(0.576, 0.664, 0.42, -0.44, 1);
            // bottom: rail edges y [-0.616, -0.704], spine bottom -0.48
            elbow(0.616, 0.704, 0.46, -0.44, -1);
            return [
                { path: 'Model/rr_ui_lcars_elbow_v5.efkmodel',
                  mesh: { vertices, faces, scale: 1 } },
                // holographic planet: WIREFRAME — the classic scanner look
                { path: `Model/rr_ui_lcars_planetw_v${M.MESH_REV || 1}.efkmodel`,
                  mesh: M.buildGeometry('sphere', { style: 'wire', thickness: 0.035 }).mesh },
            ];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('LCARS 105'),
            { key: 'body', label: 'Paragraph Text', type: 'textarea', maxLen: 500,
              default: 'INCOMING TRANSMISSION\nPRIORITY ALPHA\nSHIELDS HOLDING AT 80 PERCENT\nLONG RANGE SENSORS NOMINAL\nAWAITING YOUR COMMAND' },
            { key: 'elbowColor', label: 'Elbow Color', type: 'color', default: '#ff9900' },
            { key: 'barColor', label: 'Bar Color', type: 'color', default: '#cc99cc' },
            { key: 'textColor', label: 'Text Color', type: 'color', default: '#f8fbdb' },
            { key: 'spineButtons', label: 'Spine Buttons', type: 'range', default: 3, min: 2, max: 7, step: 1 },
            { key: 'textRows', label: 'Text Rows', type: 'range', default: 5, min: 2, max: 20, step: 1 },
            { key: 'scrollSpeed', label: 'Scroll Speed', type: 'range', default: 2, min: 0, max: 6, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, spinner, band, quad, glyphFlicker, U, B } = K;
            const ce = U.hexToRgba(p.elbowColor);
            const cb = U.hexToRgba(p.barColor);
            const ct = U.hexToRgba(p.textColor);
            const TEX = { ring: 0, streak: 1, dot: 2, strip: 3, glyphs: 4, pill: 5,
                          code: 6, graph: 7, noise: 8, flat: 9 };
            const blinkCycle = Math.max(20, 90 - p.scrollSpeed * 10);
            const nodes = [];

            // elbows joining spine to rails (solid ribbon model)
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: TEX.flat, alphaBlend: 2 },
                rendererParams: { modelIndex: 0, billboard: 2, culling: 2,
                                  allColor: U.fixedColor({ ...ce, a: 255 }) },
            }));

            // button spine: crisp flat segments (tight gaps), rounded pill
            // caps ONLY at the column ends — mid-run rounding is what read
            // as "brush strokes"
            const segs = p.spineButtons + 3;
            const colTop = 0.44, colBot = -0.48;
            const segGap = 0.014;
            const segH = (colTop - colBot - segGap * (segs - 1)) / segs;
            // all segments square — the elbows terminate the column, and
            // pill caps overlapped them
            for (let i = 0; i < segs; i++) {
                const yy = colTop - segH / 2 - i * (segH + segGap);
                const col = [ce, cb, ct][i % 3];
                const blink = i % 3 === 1;
                nodes.push(quad({
                    tex: TEX.flat, x: -0.655, y: yy, w: 0.115, h: segH,
                    color: col, alpha: 255,
                    ...(blink ? { life: blinkCycle, genTime: blinkCycle + 14,
                                  genOffset: (i * 19) % blinkCycle, fadeIn: 5, fadeOut: 5 } : {}),
                }));
            }

            // rails: solid flat bars, pill caps at the free ends only
            const rail = (x0, x1, y, col, alpha = 255) => quad({
                tex: TEX.flat, x: (x0 + x1) / 2, y, w: 0.088, h: x1 - x0,
                color: col, alpha, rotZ: Math.PI / 2 });
            nodes.push(rail(-0.54, 0.12, 0.62, ce));
            nodes.push(rail(0.16, 0.5, 0.62, cb));
            nodes.push(rail(0.54, 0.63, 0.62, ct));   // square end block
            // the user's Display Text: a PROMINENT header under the top rail
            nodes.push(textNode(K, 10, { x: -0.155, y: 0.5, w: 0.78, color: ce }));
            // bottom rail (shorter)
            nodes.push(rail(-0.54, -0.02, -0.66, ce));
            nodes.push(rail(0.02, 0.13, -0.66, cb));  // square end block

            // highlight sweep gliding along the top rail
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(60), generationTime: rf(110) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(-0.5, 0.62, 0.01)),
                    velocity: rv3(v3(0.018, 0, 0)), acceleration: rv3(0),
                },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: v3(0.075, 0.14, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.streak, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 140 }) },
            }));

            // ── SCREEN CONTENT (multi-timescale: fast code scroll, medium
            // telemetry, slow planet orbit — the layering is what sells
            // "working computer") ────────────────────────────────────────
            // left pane: the user's Paragraph Text when set ('|' = line
            // break; scrolls up, or BLINKS in place at Scroll Speed 0),
            // otherwise procedural scrolling source code.
            if (p.body) {
                // the pane is a WINDOW onto the paragraph page: frac rows
                // visible, UV y-scroll walks through the whole message.
                // (Guarded: the headless test loaders don't inject textures.)
                const frac = (typeof RR_EfkTextures !== 'undefined' && RR_EfkTextures.userParaInfo)
                    ? RR_EfkTextures.userParaInfo(p.body).frac : 1;
                nodes.push(quad({
                    tex: 11, x: -0.16, y: -0.08, w: 0.62, h: 0.82,
                    color: ct, alpha: 255,
                    ...(p.scrollSpeed === 0
                        ? { life: 80, genTime: 110, fadeIn: 8, fadeOut: 8 }
                        : {}),
                    uv: { type: 3,
                          position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                          size: { max: { x: 1, y: frac }, min: { x: 1, y: frac } },
                          speed: p.scrollSpeed === 0
                              ? { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } }
                              : { max: { x: 0, y: (0.0009 + 0.0004 * p.scrollSpeed) * frac },
                                  min: { x: 0, y: (0.0009 + 0.0004 * p.scrollSpeed) * frac } } },
                }));
            } else {
                const codeRows = Math.max(4, Math.min(p.textRows, 16));
                const codePane = () => quad({
                    tex: TEX.code, x: -0.16, y: -0.08, w: 0.62, h: 0.82,
                    color: ct, alpha: 255,
                    uv: { type: 3,
                          position: { max: { x: 0, y: 1 }, min: { x: 0, y: 0 } },
                          size: { max: { x: 1, y: codeRows / 16 }, min: { x: 1, y: codeRows / 16 } },
                          speed: { max: { x: 0, y: 0.0012 + 0.0005 * p.scrollSpeed },
                                   min: { x: 0, y: 0.0008 + 0.0003 * p.scrollSpeed } } },
                });
                nodes.push(codePane(), codePane());
            }

            // right pane, top: holographic planet with an orbiting moon
            const cbLift = { r: Math.round(cb.r + (255 - cb.r) * 0.45),
                             g: Math.round(cb.g + (255 - cb.g) * 0.45),
                             b: Math.round(cb.b + (255 - cb.b) * 0.45) };
            const planet = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: TEX.flat, alphaBlend: 2 },
                rendererParams: { modelIndex: 1, billboard: 2, culling: 2,
                                  allColor: U.fixedColor({ ...cbLift, a: 235 }) },
            });
            const moon = quad({ tex: TEX.dot, x: 0.22, w: 0.035, h: 0.035, color: ct, alpha: 255 });
            // faint core glow behind the wireframe
            nodes.push(quad({ tex: TEX.dot, x: 0.42, y: 0.26, w: 0.3, h: 0.3,
                color: cb, alpha: 70 }));
            nodes.push(group({ pos: v3(0.42, 0.26, 0), scale: v3(0.15, 0.15, 0.15) }, [
                spinner(24, [planet]),
            ]));
            nodes.push(group({ pos: v3(0.42, 0.26, 0), scale: v3(1, 0.4, 1) }, [
                spinner(50, [moon]),
                band({ tex: TEX.ring, radius: 0.22, width: 0.035, color: ct, alpha: 140, flat: false }),
            ]));

            // right pane, bottom: live telemetry graph with graticule
            nodes.push(quad({ tex: TEX.graph, x: 0.42, y: -0.26, w: 0.5, h: 0.34,
                color: ce, alpha: 255,
                uv: { type: 3,
                      position: { max: { x: 1, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 1.5, y: 1 }, min: { x: 1.5, y: 1 } },
                      speed: { max: { x: 0.003 + 0.0008 * p.scrollSpeed, y: 0 },
                               min: { x: 0.003 + 0.0008 * p.scrollSpeed, y: 0 } } } }));
            for (const gy of [-0.15, -0.26, -0.37]) {
                nodes.push(quad({ tex: TEX.streak, x: 0.42, y: gy, w: 0.008, h: 0.5,
                    color: U.dim(cb, 0.7), alpha: 90, rotZ: Math.PI / 2 }));
            }

            // numeric readout + section captions (what each pane IS)
            nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.12, areaH: 0.04,
                x: 0.44, y: 0.4, size: 0.075, color: ce, rate: 3, alpha: 255 }));
            nodes.push(textNode(K, 12, { x: 0.42, y: 0.065, w: 0.3, color: ct, alpha: 210 }));
            nodes.push(textNode(K, 13, { x: 0.42, y: -0.09, w: 0.3, color: ct, alpha: 210 }));

            // hairline pane dividers — the precision is what sells "real":
            // one under the header, one between the text pane and the data
            // column, one between the planet display and the telemetry graph
            nodes.push(quad({ tex: TEX.streak, x: 0.1, y: 0.44, w: 0.006, h: 1.1,
                color: U.dim(cb, 0.8), alpha: 150, rotZ: Math.PI / 2 }));
            nodes.push(quad({ tex: TEX.streak, x: 0.22, y: -0.06, w: 0.007, h: 0.98,
                color: U.dim(cb, 0.9), alpha: 200 }));
            nodes.push(quad({ tex: TEX.streak, x: 0.42, y: -0.03, w: 0.006, h: 0.5,
                color: U.dim(cb, 0.8), alpha: 150, rotZ: Math.PI / 2 }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Tactical Map — tilted wireframe battle grid: strut-model floor,
    // drifting friendly/hostile markers, ping rings, crossing scan line.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-tacticalmap',
        name: 'Tactical Map',
        category: 'Interface',
        continuous: true,
        prewarm: 80,
        textures: (p) => ['particle_hard', 'ring_soft', 'streak', 'techglyphs', 'glow_soft']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        buildModels(p, M) {
            const g = p.gridDivisions;
            const pts = [];
            const edges = [];
            const span = 0.8;
            for (let i = 0; i <= g; i++) {
                const t = -span + (i / g) * span * 2;
                pts.push([-span, 0, t], [span, 0, t]);          // horizontal line ends
                edges.push([pts.length - 2, pts.length - 1]);
                pts.push([t, 0, -span], [t, 0, span]);          // vertical line ends
                edges.push([pts.length - 2, pts.length - 1]);
            }
            return [{ path: `Model/rr_ui_grid_g${g}.efkmodel`,
                      mesh: { ...M.strutFrame(pts, edges, 0.007), scale: 1 } }];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('THEATER GRID'),
            { key: 'gridColor', label: 'Grid Color', type: 'color', default: '#3080a0' },
            { key: 'friendlyColor', label: 'Friendly Color', type: 'color', default: '#60ff80' },
            { key: 'hostileColor', label: 'Hostile Color', type: 'color', default: '#ff4040' },
            { key: 'unitCount', label: 'Units', type: 'range', default: 10, min: 0, max: 32, step: 1 },
            { key: 'gridDivisions', label: 'Grid Divisions', type: 'range', default: 8, min: 2, max: 16, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, quad, U, B } = K;
            const cg = U.hexToRgba(p.gridColor);
            const cf = U.hexToRgba(p.friendlyColor);
            const chs = U.hexToRgba(p.hostileColor);
            const TEX = { dot: 0, ring: 1, streak: 2, glyphs: 3, glow: 4 };
            const nodes = [];

            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: TEX.glow, alphaBlend: 2 },
                rendererParams: { modelIndex: 0, billboard: 2, culling: 2,
                                  allColor: U.fixedColor({ ...cg, a: 230 }) },
            }));

            // troops: units spawn in FORMATION CLUSTERS on each side and
            // advance toward the contested center line, where engagement
            // flashes erupt — reads as two armies meeting.
            const squad = (color, cx, cy, adv) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(150, 210),
                                generationTime: rf(Math.max(3, 200 / Math.max(1, p.unitCount))) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(cx - 0.14, cy - 0.16, 0.015), v3(cx + 0.14, cy + 0.16, 0.015)),
                    // advance toward the center with slight lateral wander
                    velocity: rv3(v3(adv * 0.7, -0.0006, 0), v3(adv * 1.3, 0.0006, 0)),
                    acceleration: rv3(0),
                },
                scaling: { type: 0, refEq: -1, scale: v3(0.05, 0.05, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.dot, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 10, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 30, params: [0, 0, 0] },
                },
                rendererParams: { allColor: U.fixedColor({ ...color, a: 255 }) },
            });
            const flat = { rot: v3(Math.PI / 2, 0, 0) };
            if (p.unitCount > 0) {
                nodes.push(group(flat, [
                    squad(cf, -0.55, -0.3, 0.0028),   // friendly columns, west
                    squad(cf, -0.55, 0.3, 0.0028),
                    squad(chs, 0.55, -0.3, -0.0028),  // hostile columns, east
                    squad(chs, 0.55, 0.3, -0.0028),
                ]));
            }

            // engagement flashes along the contested center strip
            nodes.push(group(flat, [
                B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(24), generationTime: rf(30) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(-0.12, -0.6, 0.01), v3(0.12, 0.6, 0.01)),
                        velocity: rv3(0), acceleration: rv3(0),
                    },
                    scaling: { type: 4, start: rf(0.02), end: rf(0.15), params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: TEX.ring, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 14, params: [0, 0, 0] } },
                    rendererParams: {
                        billboard: 2, vertexCount: 24,
                        outerLocation: { type: 0, location: { x: 1.1, y: 0 } },
                        innerLocation: { type: 0, location: { x: 0.9, y: 0 } },
                        outerColor: U.fixedColor({ ...chs, a: 0 }),
                        centerColor: U.fixedColor({ r: 255, g: 255, b: 255, a: 220 }),
                        innerColor: U.fixedColor({ ...chs, a: 80 }),
                    },
                }),
                // engagement glow bursts
                B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(10, 16), generationTime: rf(22) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(-0.12, -0.55, 0.02), v3(0.12, 0.55, 0.02)),
                        velocity: rv3(0), acceleration: rv3(0),
                    },
                    scaling: { type: 4, start: rf(0.04, 0.07), end: rf(0.12), params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: TEX.glow, alphaBlend: 2,
                        fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                    rendererParams: { allColor: U.fixedColor({ r: 255, g: 230, b: 190, a: 235 }) },
                }),
            ]));

            // scan line sweeping across the grid
            nodes.push(group(flat, [B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(100), generationTime: rf(135) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(0, -0.8, 0.02)),
                    velocity: rv3(v3(0, 0.016, 0)), acceleration: rv3(0),
                },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: v3(0.035, 1.62, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.streak, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...cg, a: 190 }) },
            })]));

            // corner marker glyphs
            for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) {
                nodes.push(quad({ tex: TEX.dot, x, y: 0.02, z, w: 0.05, h: 0.05,
                    color: cg, alpha: 240, billboard: 0 }));
            }

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, [
                group({ rot: v3(0.55, 0, 0) }, nodes),
                textNode(K, 5, { y: 0.72, w: 0.85, color: cg }),
            ])];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Static — a BROKEN hologram: sputtering noise panel over a failing
    // projector, tear lines, dark dropouts, spark showers.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-static',
        name: 'Static',
        category: 'Interface',
        continuous: true,
        prewarm: 40,
        textures: (p) => ['whitenoise', 'scanlines', 'streak', 'particle_hard', 'glow_soft', 'flat']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('NO SIGNAL'),
            { key: 'msgColor', label: 'Message Color', type: 'color', default: '#ffffff' },
            { key: 'color1', label: 'Bright Color', type: 'color', default: '#ffffff' },
            { key: 'color2', label: 'Dark Color', type: 'color', default: '#000000' },
            { key: 'tintColor', label: 'Tint Color', type: 'color', default: '#a0c0ff' },
            { key: 'speed', label: 'Change Speed', type: 'range', default: 30, min: 1, max: 60, step: 1 },
            { key: 'scanlineCount', label: 'Scanlines', type: 'range', default: 30, min: 2, max: 80, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, quad, U, B } = K;
            const c1 = U.hexToRgba(p.color1);
            const c2 = U.hexToRgba(p.color2);
            const ctn = U.hexToRgba(p.tintColor);
            const TEX = { noise: 0, scan: 1, streak: 2, dot: 3, glow: 4, flat: 5 };
            const PW = 1.25, PH = 0.9;
            const flickerLife = Math.max(2, Math.round(26 - p.speed * 0.35));
            const nodes = [];

            // dark backing (normal blend) so dropouts and tint read
            nodes.push(quad({ tex: TEX.flat, w: PW, h: PH, color: c2, alpha: 200, blend: 1 }));

            // sputtering static: rapidly regenerating quads, each showing a
            // different random offset into crisp per-pixel noise
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(flickerLife, flickerLife + 6), generationTime: rf(1.5) },
                translation: { type: 0, refEq: -1, position: v3(0, 0, 0.01) },
                scaling: { type: 0, refEq: -1, scale: v3(PW, PH, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.noise, alphaBlend: 2,
                    uv: { type: 3,
                          position: { max: { x: 1, y: 1 }, min: { x: 0, y: 0 } },
                          size: { max: { x: 1.2, y: 0.9 }, min: { x: 1.2, y: 0.9 } },
                          speed: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } } },
                },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...c1, a: 190 }) },
            }));

            // tint wash + scanlines (count-driven repeats)
            nodes.push(quad({ tex: TEX.glow, z: 0.02, w: PW * 1.05, h: PH * 1.05, color: ctn, alpha: 60 }));
            nodes.push(quad({ tex: TEX.scan, z: 0.03, w: PW, h: PH, color: ctn, alpha: 70,
                uv: { type: 3, position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 1, y: p.scanlineCount / 16 }, min: { x: 1, y: p.scanlineCount / 16 } },
                      speed: { max: { x: 0, y: 0.004 }, min: { x: 0, y: 0.004 } } } }));

            // horizontal tear lines jumping around
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(4, 9),
                                generationTime: rf(Math.max(2, 20 - p.speed * 0.25)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(0, -PH / 2, 0.04), v3(0, PH / 2, 0.04)),
                    velocity: rv3(0), acceleration: rv3(0),
                },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: v3(0.035, PW * 1.04, 1) },
                rendererCommon: { colorTextureIndex: TEX.streak, alphaBlend: 2 },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...c1, a: 235 }) },
            }));

            // bright interference bands rolling down (replaces the dark
            // dropout blocks the user disliked)
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(40, 60),
                                generationTime: rf(Math.max(6, 40 - p.speed * 0.4)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(0, PH * 0.45, 0.05), v3(0, PH * 0.55, 0.05)),
                    velocity: rv3(v3(0, -0.008, 0), v3(0, -0.014, 0)), acceleration: rv3(0),
                },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: v3(0.12, PW * 1.02, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.streak, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 8, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...c1, a: 60 }) },
            }));

            // the user's message flickering through the static
            const cm = U.hexToRgba(p.msgColor);
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(12, 30),
                                generationTime: rf(24) },
                translation: { type: 0, refEq: -1, position: v3(0, 0, 0.06) },
                scaling: { type: 0, refEq: -1, scale: v3(0.9, 0.9 / 8, 1) },
                rendererCommon: {
                    colorTextureIndex: 6, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 3, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 4, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...cm, a: 245 }) },
            }));

            // failing projector below: sputtering emitter + sparks
            nodes.push(quad({ tex: TEX.dot, y: -PH / 2 - 0.22, w: 0.07, h: 0.07, color: ctn, alpha: 255,
                life: 26, genTime: 34, fadeIn: 3, fadeOut: 4 }));
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(16, 30),
                                generationTime: rf(7) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(-0.03, -PH / 2 - 0.24, 0), v3(0.03, -PH / 2 - 0.2, 0)),
                    velocity: rv3(v3(-0.008, 0.004, -0.004), v3(0.008, 0.014, 0.004)),
                    acceleration: rv3(v3(0, -0.0006, 0)),
                },
                scaling: { type: 4, start: rf(0.015, 0.03), end: rf(0), params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: TEX.dot, alphaBlend: 2 },
                rendererParams: { allColor: U.fixedColor({ ...ctn, a: 255 }) },
            }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Orbital Survey — a star system display: glowing star, tilted
    // elliptical orbits, planets circling at Keplerian-ish rates, one with
    // a moon. (FUI reference: drawOrbitalSystem.)
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-orbital',
        name: 'Orbital Survey',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        // build-your-own-solar-system: per-planet custom textures append
        // after the builtins + title strip (index 6 onward, in planet order)
        textures: (p) => ['ring_soft', 'glow_soft', 'particle_hard', 'flat', 'noise']
            .map(n => `Texture/rr_${n}.png`)
            .concat(textPath(p.label))
            .concat([1, 2, 3, 4, 5, 6]
                .filter(i => i <= p.planets && p[`p${i}tex`])
                .map(i => `Texture/${p[`p${i}tex`]}`)),
        textTextures: textTexturesOf,
        buildModels(p, M) {
            // one shared sphere mesh for all planets
            return [{ path: `Model/rr_ui_planet_s_v${M.MESH_REV || 1}.efkmodel`,
                      mesh: M.buildGeometry('sphere', { style: 'solid' }).mesh }];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('ORBITAL SURVEY'),
            { key: 'starColor', label: 'Primary Color', type: 'color', default: '#ffc24a' },
            { key: 'planetColor', label: 'Secondary Color', type: 'color', default: '#4ff0ff' },
            { key: 'orbitColor', label: 'Ring Color', type: 'color', default: '#2a6a7a' },
            { key: 'planets', label: 'Planets', type: 'range', default: 4, min: 1, max: 6, step: 1 },
            ...[1, 2, 3, 4, 5, 6].flatMap(i => [
                { key: `p${i}size`, label: `Planet ${i} Size`, type: 'range',
                  default: [0.055, 0.07, 0.095, 0.06, 0.05, 0.04][i - 1], min: 0.02, max: 0.16, step: 0.005 },
                { key: `p${i}tex`, label: `Planet ${i} Texture`, type: 'texture', default: '' },
            ]),
        ],
        build(p) {
            const K = kit();
            const { rf, v3, group, spinner, band, quad, U, B } = K;
            const cs = U.hexToRgba(p.starColor);
            const cp = U.hexToRgba(p.planetColor);
            const co = U.hexToRgba(p.orbitColor);
            const TEX = { ring: 0, glow: 1, dot: 2, flat: 3, noise: 4 };
            const rand = mulberry32(9 + p.planets * 31);
            // REAL 3D: orbits lie flat in the world XZ plane (billboard 2 +
            // X π/2), planets are sphere models on those circles — the whole
            // system transforms truthfully under gizmo rotation. The camera
            // tilt is just a presentation wrapper.
            const sys = [];

            const lift = (c, f) => ({ r: Math.round(c.r + (255 - c.r) * f),
                                      g: Math.round(c.g + (255 - c.g) * f),
                                      b: Math.round(c.b + (255 - c.b) * f) });
            // custom-texture indexes follow the textures() list exactly
            const customIdx = new Map();
            let nextTex = 6;
            for (let i = 1; i <= 6; i++) {
                if (i <= p.planets && p[`p${i}tex`]) customIdx.set(i, nextTex++);
            }
            for (let i = 0; i < p.planets; i++) {
                const r = 0.3 + (i / Math.max(1, p.planets - 1)) * 0.65;
                sys.push(band({ tex: TEX.ring, radius: r, width: 0.025, color: co,
                    alpha: 235, whiteCenter: false, innerAlphaF: 0.5 }));
                const hue = i % 2 ? lift(cp, 0.3) : U.dim(cp, 0.8);
                const sz = p[`p${i + 1}size`];
                const custom = customIdx.get(i + 1);
                const planetKids = [group({ pos: v3(r, 0, 0), scale: v3(sz, sz, sz) }, [
                    // sphere spins on its own axis as it orbits; an uploaded
                    // texture wraps it UNTINTED with normal blend + zWrite
                    // (the solid-surface rules) so it reads like a real globe
                    spinner(60, [B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                        rendererCommon: custom !== undefined
                            ? { colorTextureIndex: custom, alphaBlend: 1, zWrite: 1 }
                            : { colorTextureIndex: TEX.flat, alphaBlend: 2 },
                        rendererParams: { modelIndex: 0, billboard: 2, culling: 1,
                                          allColor: custom !== undefined
                                              ? U.fixedColor({ r: 255, g: 255, b: 255, a: 255 })
                                              : U.fixedColor({ ...lift(hue, 0.45), a: 255 }) },
                    })]),
                ])];
                if (i === 1) {
                    // moon circling the second planet (in the same plane)
                    planetKids.push(group({ pos: v3(r, 0, 0) }, [
                        spinner(140, [quad({ tex: TEX.dot, x: 0.075, w: 0.022, h: 0.022,
                            color: { r: 230, g: 235, b: 245 }, alpha: 235 })]),
                    ]));
                }
                if (i === Math.min(2, p.planets - 1)) {
                    // ringed gas giant: the ring lies in the orbital plane
                    planetKids.push(group({ pos: v3(r, 0, 0) }, [
                        band({ tex: TEX.ring, radius: 0.1, width: 0.08, color: cp, alpha: 150 }),
                    ]));
                }
                sys.push(spinner(34 - i * 6, planetKids));
            }
            // the star: glow billboards at the origin
            sys.push(quad({ tex: TEX.glow, w: 0.34, h: 0.34, color: cs, alpha: 235, billboard: 0 }));
            sys.push(quad({ tex: TEX.dot, w: 0.09, h: 0.09,
                color: { r: 255, g: 250, b: 235 }, alpha: 255, billboard: 0 }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, [
                group({ rot: v3(0.45, 0, 0), scale: v3(0.82, 0.82, 0.82) }, sys),   // presentation tilt
                textNode(K, 5, { y: -0.72, w: 0.72, color: cp }),
            ])];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Star Chart — navigation display: coordinate grid, twinkling stars, a
    // dashed route through waypoints, and a ship marker flying the route.
    // (FUI reference: drawStarChart.)
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-starchart',
        name: 'Star Chart',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['flat', 'streak', 'particle_hard', 'ring_soft', 'glow_soft']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('NAV CHART'),
            { key: 'gridColor', label: 'Grid Color', type: 'color', default: '#1e5866' },
            { key: 'routeColor', label: 'Accent Color', type: 'color', default: '#ffc24a' },
            { key: 'shipColor', label: 'Primary Color', type: 'color', default: '#4ff0ff' },
            { key: 'stars', label: 'Blips', type: 'range', default: 20, min: 0, max: 60, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, band, quad, U, B } = K;
            const cg = U.hexToRgba(p.gridColor);
            const cr = U.hexToRgba(p.routeColor);
            const cs = U.hexToRgba(p.shipColor);
            const TEX = { flat: 0, streak: 1, dot: 2, ring: 3, glow: 4 };
            const CW = 1.6, CH = 1.0;
            const nodes = [];

            // coordinate grid
            for (let i = 0; i <= 6; i++) {
                nodes.push(quad({ tex: TEX.flat, x: -CW / 2 + (i / 6) * CW, w: 0.005, h: CH,
                    color: cg, alpha: 120 }));
            }
            for (let i = 0; i <= 4; i++) {
                nodes.push(quad({ tex: TEX.flat, y: -CH / 2 + (i / 4) * CH, w: 0.005, h: CW,
                    color: cg, alpha: 120, rotZ: Math.PI / 2 }));
            }

            // twinkling background stars
            if (p.stars > 0) {
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999,
                                    life: rf(30, 70),
                                    generationTime: rf(Math.max(1, 70 / p.stars)) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(-CW * 0.47, -CH * 0.45, 0), v3(CW * 0.47, CH * 0.45, 0)),
                        velocity: rv3(0), acceleration: rv3(0),
                    },
                    scaling: { type: 0, refEq: -1, scale: v3(0.016, 0.016, 1) },
                    rendererCommon: {
                        colorTextureIndex: TEX.dot, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 12, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 12, params: [0, 0, 0] },
                    },
                    rendererParams: { allColor: U.fixedColor({ r: 205, g: 238, b: 247, a: 200 }) },
                }));
            }

            // route waypoints (authored Y-up; flip renders it upright)
            const WP = [[-0.6, -0.22], [-0.16, 0.16], [0.28, -0.12], [0.62, 0.3]];
            for (const [wx, wy] of WP) {
                nodes.push(band({ tex: TEX.ring, radius: 0.035, width: 0.3, color: cr,
                    alpha: 235, flat: false, y: 0 }), );
                const wp = nodes.pop();
                wp.translation = { type: 0, refEq: -1, position: v3(wx, wy, 0.01) };
                nodes.push(wp);
            }
            // dashed route segments + the ship marker flying leg by leg
            const legT = 70;
            const cycle = legT * (WP.length - 1);
            for (let s = 0; s < WP.length - 1; s++) {
                const [ax, ay] = WP[s];
                const [bx, by] = WP[s + 1];
                const segLen = Math.hypot(bx - ax, by - ay);
                const dashes = Math.round(segLen / 0.055);
                for (let d = 1; d < dashes; d += 2) {
                    const f = d / dashes;
                    nodes.push(quad({ tex: TEX.flat,
                        x: ax + (bx - ax) * f, y: ay + (by - ay) * f, w: 0.025, h: 0.007,
                        color: cr, alpha: 190,
                        rotZ: Math.atan2(by - ay, bx - ax) + Math.PI / 2 }));
                }
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(legT),
                                    generationTime: rf(cycle),
                                    generationTimeOffset: rf(s * legT) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(ax, ay, 0.02)),
                        velocity: rv3(v3((bx - ax) / legT, (by - ay) / legT, 0)),
                        acceleration: rv3(0),
                    },
                    scaling: { type: 0, refEq: -1, scale: v3(0.05, 0.05, 1) },
                    rendererCommon: { colorTextureIndex: TEX.glow, alphaBlend: 2 },
                    rendererParams: { allColor: U.fixedColor({ ...cs, a: 255 }) },
                }));
            }

            nodes.push(textNode(K, 5, { x: -CW / 2 + 0.35, y: CH / 2 + 0.1, w: 0.66, color: cs }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Reactor Core — containment torus: twin edge rings joined by radial
    // ribs, a pulsing core, and energy nodes racing the ring.
    // (FUI reference: drawReactorTorus.)
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-reactor',
        name: 'Reactor Core',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['ring_soft', 'flat', 'particle_hard', 'glow_soft']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        buildModels(p, M) {
            // the core itself: a wireframe torus coil
            return [{ path: `Model/rr_ui_reactor_torus_v${M.MESH_REV || 1}.efkmodel`,
                      mesh: M.buildGeometry('torus', { style: 'wire', thickness: 0.03 }).mesh }];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('CONTAINMENT 96 PCT'),
            { key: 'ringColor', label: 'Primary Color', type: 'color', default: '#ffc24a' },
            { key: 'coreColor', label: 'Accent Color', type: 'color', default: '#ff4767' },
            { key: 'pulse', label: 'Pulse Rate', type: 'range', default: 8, min: 2, max: 20, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, v3, group, spinner, band, quad, beads, U, B } = K;
            const cr = U.hexToRgba(p.ringColor);
            const cc = U.hexToRgba(p.coreColor);
            const TEX = { ring: 0, flat: 1, dot: 2, glow: 3 };
            const Ro = 0.75, Ri = 0.47;
            // REAL 3D: containment rings/ribs lie flat in the world XZ
            // plane and the core is a spinning wireframe torus model — the
            // whole machine transforms truthfully under gizmo rotation.
            const sys = [];

            sys.push(band({ tex: TEX.ring, radius: Ro, width: 0.03, color: cr, alpha: 255 }));
            sys.push(band({ tex: TEX.ring, radius: Ri, width: 0.04, color: cr, alpha: 235 }));
            // radial ribs between the edge rings (in the containment plane)
            const ribs = [];
            const RIBS = 28;
            for (let i = 0; i < RIBS; i++) {
                const a = (i / RIBS) * Math.PI * 2;
                ribs.push(quad({ tex: TEX.flat,
                    x: Math.cos(a) * (Ro + Ri) / 2, y: Math.sin(a) * (Ro + Ri) / 2,
                    w: 0.012, h: Ro - Ri, color: cr, alpha: 120,
                    rotZ: a + Math.PI / 2 }));
                }
            sys.push(group({ rot: v3(Math.PI / 2, 0, 0) }, ribs));
            // energy nodes racing the mid ring
            sys.push(beads({ tex: TEX.dot, radius: (Ro + Ri) / 2, division: 24,
                genTime: 3, life: 26, size: 0.045, color: cc }));

            // THE CORE: wireframe torus coil spinning in the containment
            // plane, with a pulsing glow heart
            sys.push(group({ scale: v3(0.34, 0.34, 0.34) }, [
                spinner(40, [B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rendererCommon: { colorTextureIndex: TEX.flat, alphaBlend: 2 },
                    rendererParams: { modelIndex: 0, billboard: 2, culling: 2,
                                      allColor: U.fixedColor({ ...cc, a: 235 }) },
                })]),
            ]));
            sys.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999,
                                life: rf(Math.max(8, Math.round(70 / p.pulse) + 8)),
                                generationTime: rf(Math.max(8, Math.round(70 / p.pulse))) },
                scaling: { type: 4, start: rf(0.14), end: rf(0.44), params: [0, 0, 1] },
                rendererCommon: {
                    colorTextureIndex: TEX.glow, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 0, allColor: U.fixedColor({ ...cc, a: 200 }) },
            }));
            sys.push(quad({ tex: TEX.glow, w: 0.26, h: 0.26, color: cc, alpha: 140, billboard: 0 }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, [
                group({ rot: v3(0.5, 0, 0) }, sys),   // presentation tilt
                textNode(K, 4, { y: -0.72, w: 0.72, color: cr }),
            ])];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Xenobiology Scan — a rotating 3D DNA double helix (strut model) under
    // a scan sweep, with a live bio-signal trace and classification text.
    // (FUI reference: drawXenobio / drawDNAHelix.)
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-xenoscan',
        name: 'Xenobiology Scan',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['flat', 'streak', 'graphline', 'glow_soft', 'techglyphs']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        buildModels(p, M) {
            // double helix + rungs as one strut frame, spun about Y
            const pts = [];
            const edges = [];
            const N = 40, turns = 2.6, A = 0.22, H = 1.1;
            for (let s = 0; s < 2; s++) {
                const base = pts.length;
                for (let i = 0; i <= N; i++) {
                    const f = i / N;
                    const ph = f * turns * Math.PI * 2 + s * Math.PI;
                    pts.push([Math.sin(ph) * A, -H / 2 + f * H, Math.cos(ph) * A]);
                    if (i > 0) edges.push([base + i - 1, base + i]);
                }
            }
            for (let i = 0; i <= N; i += 4) edges.push([i, N + 1 + i]);   // rungs
            return [{ path: `Model/rr_ui_dna_v${M.MESH_REV || 1}.efkmodel`,
                      mesh: { ...M.strutFrame(pts, edges, 0.014), scale: 1 } }];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('LIFEFORM DETECTED'),
            { key: 'helixColor', label: 'Primary Color', type: 'color', default: '#4ff0ff' },
            { key: 'traceColor', label: 'Accent Color', type: 'color', default: '#5dffa0' },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, spinner, quad, glyphFlicker, U, B } = K;
            const ch = U.hexToRgba(p.helixColor);
            const ct = U.hexToRgba(p.traceColor);
            const TEX = { flat: 0, streak: 1, graph: 2, glow: 3, glyphs: 4 };
            const nodes = [];

            // the helix, slowly rotating (clear of the header/confidence bar)
            nodes.push(group({ pos: v3(-0.3, -0.12, 0), scale: v3(0.8, 0.8, 0.8) }, [
                spinner(26, [B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rendererCommon: { colorTextureIndex: TEX.flat, alphaBlend: 2 },
                    rendererParams: { modelIndex: 0, billboard: 2, culling: 2,
                                      allColor: U.fixedColor({ ...ch, a: 235 }) },
                })]),
            ]));

            // scan sweep band riding up the helix
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(90), generationTime: rf(110) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(-0.3, -0.62, 0.02)),
                    velocity: rv3(v3(0, 0.011, 0)), acceleration: rv3(0),
                },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: v3(0.05, 0.58, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.streak, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 10, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 12, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...ct, a: 150 }) },
            }));

            // bio-signal trace along the bottom + readout glyphs
            nodes.push(quad({ tex: TEX.graph, x: 0.12, y: -0.62, w: 1.2, h: 0.26,
                color: ct, alpha: 255,
                uv: { type: 3, position: { max: { x: 1, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 1.5, y: 1 }, min: { x: 1.5, y: 1 } },
                      speed: { max: { x: 0.004, y: 0 }, min: { x: 0.004, y: 0 } } } }));
            nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.24, areaH: 0.2,
                x: 0.42, y: 0.2, size: 0.09, color: ch, rate: 3, alpha: 235 }));

            // classification header + confidence bar refilling
            nodes.push(textNode(K, 5, { x: 0.1, y: 0.7, w: 0.85, color: ct }));
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(100), generationTime: rf(100) },
                translation: { type: 0, refEq: -1, position: v3(0.12, 0.58, 0) },
                scaling: {
                    type: 2, refEqS: rf(-1), refEqE: rf(-1),
                    start: rv3(v3(0.03, 0.03, 1)), end: rv3(v3(0.8, 0.03, 1)),
                    params: [0, 0, 1],
                },
                rendererCommon: { colorTextureIndex: TEX.flat, alphaBlend: 2,
                    fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                rendererParams: { billboard: 2, allColor: U.fixedColor({ ...ct, a: 220 }) },
            }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Starship Analysis — a REAL 3D wireframe starship (saucer, hull,
    // deflector, nacelles on swept pylons — built parametrically as one
    // strut model) slowly rotating under a scan plane, with component
    // glows riding the hull. (FUI reference: Starship Analysis HUD.)
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-shipscan',
        name: 'Starship Analysis',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['flat', 'streak', 'particle_hard', 'glow_soft', 'techglyphs']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        buildModels(p, M) {
            // parametric starship: rings + connections, one strut frame.
            // frame: +X starboard, +Y up, +Z bow.
            const V = [];
            const E = [];
            const add = (verts) => { const b = V.length; for (const v of verts) V.push(v); return b; };
            const loop = (b, n) => { for (let i = 0; i < n; i++) E.push([b + i, b + (i + 1) % n]); };
            const connect = (b1, b2, n) => { for (let i = 0; i < n; i++) E.push([b1 + i, b2 + i]); };
            const ringXZ = (cx, cy, cz, r, n) => Array.from({ length: n }, (_, i) => {
                const t = (i / n) * Math.PI * 2;
                return [cx + Math.cos(t) * r, cy, cz + Math.sin(t) * r];
            });
            const ringXY = (cx, cy, cz, rx, ry, n) => Array.from({ length: n }, (_, i) => {
                const t = (i / n) * Math.PI * 2;
                return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, cz];
            });
            // saucer: pointed oval rim (pinched, bow pushed forward)
            const saucer = (y, zc, Wx, Lz, n) => Array.from({ length: n }, (_, i) => {
                const a = (i / n) * Math.PI * 2;
                const bx = Math.sin(a) * Wx, bz = Math.cos(a) * Lz;
                const fm = bz > 0 ? bz / Lz : 0;
                return [bx * (1 - 0.5 * fm), y, zc + bz + fm * Lz * 0.34];
            });
            const nS = 24, zcS = 0.8, Hy = -0.28;
            const topB = add(saucer(0.1, zcS, 1.05, 1.35, nS)); loop(topB, nS);
            const botB = add(saucer(-0.05, zcS, 1.02, 1.32, nS)); loop(botB, nS);
            connect(topB, botB, nS);
            const domeB = add(ringXZ(0, 0.2, 0.15, 0.42, 12)); loop(domeB, 12);
            for (let k = 0; k < 12; k++) E.push([domeB + k, topB + Math.round(k / 12 * nS) % nS]);
            // engineering hull
            const nH = 12;
            const hF = add(ringXY(0, Hy, 0.5, 0.45, 0.28, nH)); loop(hF, nH);
            const hM = add(ringXY(0, Hy, -0.7, 0.45, 0.3, nH)); loop(hM, nH);
            const hB = add(ringXY(0, Hy, -1.7, 0.34, 0.23, nH)); loop(hB, nH);
            connect(hF, hM, nH); connect(hM, hB, nH);
            // deflector dish ring
            const defl = add(ringXY(0, Hy, 0.56, 0.26, 0.19, 10)); loop(defl, 10);
            // nacelles + pylons
            for (const sx of [-1, 1]) {
                const X = sx * 0.95, Ny = -0.02;
                const bus = add(ringXY(X, Ny, -0.3, 0.15, 0.12, 8)); loop(bus, 8);
                const nmd = add(ringXY(X, Ny, -1.2, 0.17, 0.13, 8)); loop(nmd, 8);
                const naf = add(ringXY(X, Ny, -1.95, 0.13, 0.1, 8)); loop(naf, 8);
                connect(bus, nmd, 8); connect(nmd, naf, 8);
                const py = add([[sx * 0.3, Hy + 0.05, -0.9], [sx * 0.28, Hy - 0.02, -1.5],
                                [X - sx * 0.14, Ny - 0.04, -0.85], [X - sx * 0.14, Ny - 0.04, -1.5]]);
                E.push([py, py + 2], [py + 2, py + 3], [py + 3, py + 1], [py + 1, py]);
            }
            for (const v of V) v[2] -= 0.25;   // recenter fore/aft
            return [{ path: `Model/rr_ui_ship_v${M.MESH_REV || 1}.efkmodel`,
                      mesh: { ...M.strutFrame(V, E, 0.012), scale: 1 } }];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('STARSHIP ANALYSIS'),
            { key: 'hullColor', label: 'Primary Color', type: 'color', default: '#6fe9ff' },
            { key: 'engineColor', label: 'Accent Color', type: 'color', default: '#5aa9ff' },
            { key: 'alertColor', label: 'Hostile Color', type: 'color', default: '#ff5a6a' },
            { key: 'spin', label: 'Spin (°/s)', type: 'range', default: 14, min: 0, max: 60, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, spinner, band, quad, glyphFlicker, U, B } = K;
            const ch = U.hexToRgba(p.hullColor);
            const ce = U.hexToRgba(p.engineColor);
            const ca = U.hexToRgba(p.alertColor);
            const TEX = { flat: 0, streak: 1, dot: 2, glow: 3, glyphs: 4 };

            // the ship + its component glows spin TOGETHER, so the glows
            // track the deflector/bussards/bridge as the hull turns
            const shipKids = [
                B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rendererCommon: { colorTextureIndex: TEX.flat, alphaBlend: 2 },
                    rendererParams: { modelIndex: 0, billboard: 2, culling: 2,
                                      allColor: U.fixedColor({ ...ch, a: 220 }) },
                }),
                // deflector (engine color, breathing)
                quad({ tex: TEX.glow, x: 0, y: -0.28, z: 0.31, w: 0.2, h: 0.2, color: ce, alpha: 235,
                       billboard: 0, life: 50, genTime: 50, fadeIn: 18, fadeOut: 18 }),
                // bussard collectors (alert red, pulsing)
                quad({ tex: TEX.glow, x: -0.95, y: -0.02, z: -0.55, w: 0.14, h: 0.14, color: ca, alpha: 255,
                       billboard: 0, life: 26, genTime: 26, fadeIn: 8, fadeOut: 8 }),
                quad({ tex: TEX.glow, x: 0.95, y: -0.02, z: -0.55, w: 0.14, h: 0.14, color: ca, alpha: 255,
                       billboard: 0, life: 26, genTime: 26, genOffset: 13, fadeIn: 8, fadeOut: 8 }),
                // bridge beacon
                quad({ tex: TEX.dot, x: 0, y: 0.24, z: -0.1, w: 0.05, h: 0.05, color: ch, alpha: 255,
                       billboard: 0 }),
                // warp grille strips along the nacelles
                quad({ tex: TEX.streak, x: -0.95, y: 0.1, z: -1.15, w: 0.03, h: 1.5, color: ce, alpha: 200,
                       rotX: Math.PI / 2 }),
                quad({ tex: TEX.streak, x: 0.95, y: 0.1, z: -1.15, w: 0.03, h: 1.5, color: ce, alpha: 200,
                       rotX: Math.PI / 2 }),
            ];

            const nodes = [];
            nodes.push(group({ rot: v3(-0.35, 0, 0), scale: v3(0.36, 0.36, 0.36) }, [
                p.spin > 0 ? spinner(p.spin, shipKids)
                           : group({}, shipKids),
            ]));
            // scan plane sweeping vertically through the hull
            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(110), generationTime: rf(140) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(v3(0, -0.55, 0)),
                    velocity: rv3(v3(0, 0.01, 0)), acceleration: rv3(0),
                },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: v3(0.03, 1.9, 1) },
                rendererCommon: {
                    colorTextureIndex: TEX.streak, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 10, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 12, params: [0, 0, 0] },
                },
                rendererParams: { billboard: 0, allColor: U.fixedColor({ ...ce, a: 140 }) },
            }));
            // faint index ring behind the ship + readout glyphs + title
            nodes.push(band({ tex: 0, radius: 0.92, width: 0.012, color: U.dim(ch, 0.7),
                alpha: 130, flat: false }));
            nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.2, areaH: 0.14,
                x: 0.78, y: 0.55, size: 0.08, color: ch, rate: 2.5, alpha: 230 }));
            nodes.push(textNode(K, 5, { y: -0.92, w: 0.95, color: ch }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Circular Gauge — a segmented LED arc running bottom-left around the
    // top to bottom-right (classic FUI arc indicator). Fills to a set
    // level and can hold there, sweep up repeatedly, or pulse up and down.
    // Ring viewingAngle arcs don't render in this runtime, so the arc is
    // discrete segments lit on the boot-cascade timing pattern.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-gauge',
        name: 'Circular Gauge',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['flat', 'streak', 'particle_hard', 'glow_soft', 'techglyphs', 'ticks']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('CHARGE'),
            { key: 'barColor', label: 'Primary Color', type: 'color', default: '#4ff0ff' },
            { key: 'trackColor', label: 'Ring Color', type: 'color', default: '#123a44' },
            { key: 'level', label: 'Fill Level', type: 'range', default: 100, min: 5, max: 100, step: 5 },
            { key: 'mode', label: 'Fill Mode', type: 'select', default: 'pulse',
              options: [
                  { value: 'hold', label: 'Hold' },
                  { value: 'sweep', label: 'Sweep' },
                  { value: 'pulse', label: 'Pulse' },
              ] },
            { key: 'segments', label: 'Segments', type: 'range', default: 36, min: 12, max: 60, step: 2 },
            { key: 'pulse', label: 'Pulse Rate', type: 'range', default: 8, min: 2, max: 20, step: 1 },
            { key: 'readout', label: 'Readout', type: 'range', default: 0, min: 0, max: 6, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, v3, group, band, quad, glyphFlicker, U, B } = K;
            const cb = U.hexToRgba(p.barColor);
            const ctk = U.hexToRgba(p.trackColor);
            const TEX = { flat: 0, streak: 1, dot: 2, glow: 3, glyphs: 4, ticks: 5 };
            const nodes = [];
            const R = 0.72;
            const N = p.segments;
            const lit = Math.max(1, Math.round(N * p.level / 100));
            const cycle = Math.max(50, 340 - p.pulse * 14);
            // arc: bottom-left (225°) clockwise over the top to bottom-right
            const angleOf = (f) => (225 - 270 * f) * Math.PI / 180;
            const segLen = (270 / N) * Math.PI / 180 * R;

            for (let i = 0; i < N; i++) {
                const f = (i + 0.5) / N;
                const a = angleOf(f);
                const x = Math.cos(a) * R;
                const y = Math.sin(a) * R;
                const rotZ = a + Math.PI / 2;
                // dim track segment (always present)
                nodes.push(quad({ tex: TEX.flat, x, y, w: 0.055, h: segLen * 0.72,
                    color: ctk, alpha: 235, rotZ }));
                if (i >= lit) continue;
                // lit segment: timing per Fill Mode
                const tip = i === lit - 1;
                const col = tip ? { r: 255, g: 255, b: 255 } : cb;
                if (p.mode === 'hold') {
                    nodes.push(quad({ tex: TEX.flat, x, y, w: 0.06, h: segLen * 0.72,
                        color: col, alpha: 255, rotZ, z: 0.01,
                        ...(tip ? { life: 30, genTime: 44, fadeIn: 6, fadeOut: 6 } : {}) }));
                } else {
                    const rise = p.mode === 'pulse' ? cycle * 0.44
                            : Math.min(cycle * 0.7, lit * 4);   // snappy sweep — one
                        // segment per ~4 frames, then hold; spreading the fill over
                        // most of a long cycle reads as stuttery lag
                    const tOn = Math.round((i / lit) * rise);
                    const life = p.mode === 'pulse'
                        ? Math.max(4, cycle - 2 * tOn)
                        : Math.max(4, cycle - tOn);
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(life),
                                        generationTime: rf(cycle), generationTimeOffset: rf(tOn) },
                        translation: { type: 0, refEq: -1, position: v3(x, y, 0.01) },
                        rotation: { type: 0, refEq: -1, rotation: v3(0, 0, rotZ) },
                        scaling: { type: 0, refEq: -1, scale: v3(0.06, segLen * 0.72, 1) },
                        rendererCommon: {
                            colorTextureIndex: TEX.flat, alphaBlend: 2,
                            fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                            fadeOutType: 1, fadeOut: { frame: 3, params: [0, 0, 0] },
                        },
                        rendererParams: { billboard: 2, allColor: U.fixedColor({ ...col, a: 255 }) },
                    }));
                }
            }

            // chrome: outer tick dial + inner accent ring — UPRIGHT world-
            // fixed bands so they rotate with the rest under the gizmo
            nodes.push(band({ tex: TEX.ticks, radius: R + 0.14, width: 0.045, color: ctk,
                alpha: 255, scroll: 0, repeats: 2, flat: false, upright: true, whiteCenter: true }));
            nodes.push(band({ tex: TEX.glow, radius: R - 0.13, width: 0.05, color: cb,
                alpha: 90, flat: false, upright: true }));
            // optional flickering digital readout above the label (0 = off)
            if (p.readout > 0) {
                nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: 0.16, areaH: 0.07,
                    y: 0.22, size: 0.13, color: cb, rate: p.readout, alpha: 255,
                    lifeMin: 10, lifeMax: 22 }));
            }
            // the user's label — large, dead-center in the gauge
            nodes.push(textNode(K, 6, { y: p.readout > 0 ? -0.08 : 0, w: 1.08, color: cb }));
            // bottom-gap endpoints
            for (const sx of [-1, 1]) {
                const a = angleOf(sx < 0 ? 0 : 1);
                nodes.push(quad({ tex: TEX.dot, x: Math.cos(a) * R, y: Math.sin(a) * R,
                    w: 0.05, h: 0.05, color: cb, alpha: 255 }));
            }

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Bar Meter — the Circular Gauge's rectangular sibling: a bank of
    // segmented LED bars (vertical columns or horizontal rows) with the
    // same Hold/Sweep/Pulse fill modes, staggered per bar so the bank
    // moves like a live meter wall, and a clear label area.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-barmeter',
        name: 'Bar Meter',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['flat', 'streak', 'particle_hard', 'glow_soft', 'ticks']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('OUTPUT'),
            { key: 'orient', label: 'Orientation', type: 'select', default: 'v',
              options: [
                  { value: 'v', label: 'Vertical' },
                  { value: 'h', label: 'Horizontal' },
              ] },
            { key: 'barColor', label: 'Primary Color', type: 'color', default: '#4ff0ff' },
            { key: 'trackColor', label: 'Ring Color', type: 'color', default: '#123a44' },
            { key: 'bars', label: 'Bars', type: 'range', default: 5, min: 1, max: 8, step: 1 },
            { key: 'level', label: 'Fill Level', type: 'range', default: 100, min: 5, max: 100, step: 5 },
            { key: 'mode', label: 'Fill Mode', type: 'select', default: 'pulse',
              options: [
                  { value: 'hold', label: 'Hold' },
                  { value: 'sweep', label: 'Sweep' },
                  { value: 'pulse', label: 'Pulse' },
              ] },
            { key: 'segments', label: 'Segments', type: 'range', default: 12, min: 6, max: 18, step: 1 },
            { key: 'pulse', label: 'Pulse Rate', type: 'range', default: 8, min: 2, max: 20, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, v3, group, quad, U, B } = K;
            const cb = U.hexToRgba(p.barColor);
            const ctk = U.hexToRgba(p.trackColor);
            const TEX = { flat: 0, streak: 1, dot: 2, glow: 3, ticks: 4 };
            const nodes = [];
            const vert = p.orient !== 'h';
            const S = p.segments;
            const lit = Math.max(1, Math.round(S * p.level / 100));
            const cycle = Math.max(50, 340 - p.pulse * 14);

            // bank geometry: bars PACK from the top/left edge and the
            // chrome shrinks to the used extent — one bar means one snug
            // bar, not a lonely bar in an oversized frame
            const SPAN = 1.3;    // along the fill direction
            const ACROSS = 1.3;  // max extent across the bank
            const spacing = Math.min(0.3, ACROSS / p.bars);
            const used = spacing * p.bars;
            const bw = Math.min(0.16, spacing * 0.62);
            const segLen = (SPAN / S) * 0.78;
            const segGap = SPAN / S;

            for (let b = 0; b < p.bars; b++) {
                // vertical: columns pack from the left; horizontal: rows
                // pack from the top (both centered as a block via `used`)
                const across = vert
                    ? -used / 2 + (b + 0.5) * spacing
                    : used / 2 - (b + 0.5) * spacing;
                const barOff = (b * 13) % cycle;
                for (let j = 0; j < S; j++) {
                    const along = -SPAN / 2 + (j + 0.5) * segGap;
                    const x = vert ? across : along;
                    const y = vert ? along : across;
                    // segments are wide across the bar, thin along the fill
                    const qw = vert ? bw : segLen;
                    const qh = vert ? segLen : bw;
                    // dim track segment
                    nodes.push(quad({ tex: TEX.flat, x, y, w: qw, h: qh,
                        color: ctk, alpha: 235 }));
                    if (j >= lit) continue;
                    const tip = j === lit - 1;
                    const col = tip ? { r: 255, g: 255, b: 255 } : cb;
                    if (p.mode === 'hold') {
                        nodes.push(quad({ tex: TEX.flat, x, y, z: 0.01, w: qw, h: qh,
                            color: col, alpha: 255,
                            ...(tip ? { life: 30, genTime: 44, fadeIn: 6, fadeOut: 6 } : {}) }));
                    } else {
                        const rise = p.mode === 'pulse' ? cycle * 0.44
                            : Math.min(cycle * 0.7, lit * 4);   // snappy sweep — one
                        // segment per ~4 frames, then hold; spreading the fill over
                        // most of a long cycle reads as stuttery lag
                        const tOn = Math.round((j / lit) * rise);
                        const life = p.mode === 'pulse'
                            ? Math.max(4, cycle - 2 * tOn)
                            : Math.max(4, cycle - tOn);
                        nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                            commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(life),
                                            generationTime: rf(cycle),
                                            generationTimeOffset: rf((tOn + barOff) % cycle) },
                            translation: { type: 0, refEq: -1, position: v3(x, y, 0.01) },
                            scaling: { type: 0, refEq: -1, scale: v3(qw, qh, 1) },
                            rendererCommon: {
                                colorTextureIndex: TEX.flat, alphaBlend: 2,
                                fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] },
                                fadeOutType: 1, fadeOut: { frame: 3, params: [0, 0, 0] },
                            },
                            rendererParams: { billboard: 2, allColor: U.fixedColor({ ...col, a: 255 }) },
                        }));
                    }
                }
            }

            // chrome sized to the USED extent: ruler along the fill axis
            // beside the bank + baseline hugging exactly the bars present
            nodes.push(quad({ tex: TEX.ticks,
                x: vert ? -used / 2 - 0.1 : 0,
                y: vert ? 0 : -used / 2 - 0.1,
                w: 0.05, h: SPAN,
                color: ctk, alpha: 255,
                rotZ: vert ? 0 : Math.PI / 2,
                uv: { type: 3, position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 2, y: 1 }, min: { x: 2, y: 1 } },
                      speed: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } } } }));
            nodes.push(quad({ tex: TEX.flat,
                x: vert ? 0 : -SPAN / 2 - 0.045,
                y: vert ? -SPAN / 2 - 0.045 : 0,
                w: vert ? used + 0.08 : 0.012,
                h: vert ? 0.012 : used + 0.08,
                color: cb, alpha: 200 }));
            // the label, in its clear strip above the bank
            nodes.push(textNode(K, 5, { y: SPAN / 2 + 0.18, w: 1.0, color: cb }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Composite Waveform — a live phosphor-scope: a deliberately busy
    // signal (shifting regimes, swells, silent gaps, transient spikes,
    // baked bloom) scrolling endlessly through a gridded panel, with the
    // user's label on an accent bar, a blinking REC dot, and a flickering
    // readout row. The signal itself is a parametric seamless texture —
    // Intensity / Wave Frequency / Detail / Noise reshape the bake.
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-waveform',
        name: 'Composite Waveform',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => [
            'Texture/rr_flat.png',
            `Texture/rr_wavecomposite_p${p.amp}_${p.freq}_${p.detail}_${p.noise}_0.png`,
            `Texture/rr_wavecomposite_p${p.amp}_${p.freq}_${p.detail}_${p.noise}_1.png`,
            `Texture/rr_wavecomposite_p${p.amp}_${p.freq}_${p.detail}_${p.noise}_2.png`,
            'Texture/rr_glow_soft.png',
            'Texture/rr_techglyphs.png',
            'Texture/rr_ticks.png',
        ].concat(textPath(p.label)),
        textTextures: textTexturesOf,
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('COMPOSITE WAVEFORM'),
            { key: 'waveColor', label: 'Wave Color', type: 'color', default: '#46f5c8' },
            { key: 'accentColor', label: 'Accent Color', type: 'color', default: '#ffd36b' },
            { key: 'gridColor', label: 'Grid Color', type: 'color', default: '#1a3a4a' },
            { key: 'amp', label: 'Intensity', type: 'range', default: 80, min: 20, max: 140, step: 5 },
            { key: 'freq', label: 'Wave Frequency', type: 'range', default: 18, min: 6, max: 40, step: 1 },
            { key: 'detail', label: 'Detail', type: 'range', default: 50, min: 0, max: 100, step: 5 },
            { key: 'noise', label: 'Noise', type: 'range', default: 50, min: 0, max: 100, step: 5 },
            { key: 'speed', label: 'Scroll Speed', type: 'range', default: 5, min: 0, max: 15, step: 1 },
            { key: 'readout', label: 'Readout', type: 'range', default: 2, min: 0, max: 6, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, v3, group, quad, glyphFlicker, U } = K;
            const cw = U.hexToRgba(p.waveColor);
            const ca = U.hexToRgba(p.accentColor);
            const cg = U.hexToRgba(p.gridColor);
            const TEX = { flat: 0, wave0: 1, wave1: 2, wave2: 3, glow: 4, glyphs: 5, ticks: 6 };
            const PW = 1.6, PH = 0.85;   // panel
            const nodes = [];

            // dark screen + grid + brighter zero line
            nodes.push(quad({ tex: TEX.flat, w: PW, h: PH, color: { r: 6, g: 12, b: 18 },
                alpha: 215, blend: 1 }));
            for (let i = 0; i <= 12; i++) {
                nodes.push(quad({ tex: TEX.flat, x: -PW / 2 + (i / 12) * PW, w: 0.004, h: PH,
                    color: cg, alpha: 160 }));
            }
            for (let j = 0; j <= 6; j++) {
                nodes.push(quad({ tex: TEX.flat, y: -PH / 2 + (j / 6) * PH, w: 0.004, h: PW,
                    color: cg, alpha: 160, rotZ: Math.PI / 2 }));
            }
            nodes.push(quad({ tex: TEX.flat, w: PW, h: 0.006, color: cw, alpha: 110 }));

            // THE SIGNAL: three phase-shifted takes of the same composite,
            // sliding at different speeds and heights — their interference
            // makes the peaks and dips grow, shrink, and wander instead of
            // one frozen shape marching past. White pass = hot crest.
            const waveQuad = (tex, color, alpha2, mul, hMul, yOff) => quad({
                tex, w: PW, h: PH * 0.96 * hMul, y: yOff, color, alpha: alpha2, z: 0.01,
                uv: { type: 3,
                      position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                      size: { max: { x: 1, y: 1 }, min: { x: 1, y: 1 } },
                      speed: { max: { x: p.speed * 0.0006 * mul, y: 0 },
                               min: { x: p.speed * 0.0006 * mul, y: 0 } } } });
            nodes.push(waveQuad(TEX.wave0, cw, 235, 1, 1, 0));
            nodes.push(waveQuad(TEX.wave1, cw, 130, 1.45, 0.9, 0.008));
            nodes.push(waveQuad(TEX.wave2, cw, 100, 0.66, 1.07, -0.008));
            nodes.push(waveQuad(TEX.wave0, { r: 255, g: 255, b: 255 }, 60, 1, 1, 0));

            // frame edges + corner brackets
            for (const [x, y, w, h] of [[0, PH / 2, PW, 0.008], [0, -PH / 2, PW, 0.008],
                                        [-PW / 2, 0, 0.008, PH], [PW / 2, 0, 0.008, PH]]) {
                nodes.push(quad({ tex: TEX.flat, x, y, w, h, color: cg, alpha: 235 }));
            }
            for (const sx of [-1, 1]) {
                for (const sy of [-1, 1]) {
                    nodes.push(quad({ tex: TEX.flat, x: sx * PW / 2, y: sy * PH / 2,
                        w: 0.016, h: 0.09, color: cw, alpha: 255 }));
                    nodes.push(quad({ tex: TEX.flat, x: sx * (PW / 2 - 0.038), y: sy * PH / 2,
                        w: 0.09, h: 0.016, color: cw, alpha: 255 }));
                }
            }

            // label block: accent bar + the user's title + blinking REC dot
            nodes.push(quad({ tex: TEX.flat, x: -PW / 2 + 0.02, y: PH / 2 + 0.15,
                w: 0.035, h: 0.12, color: ca, alpha: 255 }));
            nodes.push(textNode(K, 7, { x: -PW / 2 + 0.48, y: PH / 2 + 0.15, w: 0.82, color: ca }));
            nodes.push(quad({ tex: TEX.glow, x: PW / 2 - 0.05, y: PH / 2 + 0.15,
                w: 0.07, h: 0.07, color: ca, alpha: 255,
                life: 26, genTime: 40, fadeIn: 6, fadeOut: 8 }));

            // flickering readout row under the panel (0 = off)
            if (p.readout > 0) {
                nodes.push(glyphFlicker({ tex: TEX.glyphs, areaW: PW * 0.86, areaH: 0.05,
                    y: -PH / 2 - 0.12, size: 0.075, color: cw, rate: p.readout, alpha: 235 }));
            }

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Battery — a 3D cylindrical cell (flat cap rings inside a tilted
    // assembly, the hexdump-vortex pattern) stacked with LED segment
    // rings, zone-colored by charge height (low=red, mid=amber-ish,
    // high=green). Patterns: Fill (charging), Drain (discharging),
    // Hold (steady with blinking tip), Short (chaotic flicker + a
    // flashing lightning bolt).
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-battery',
        name: 'Battery',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['flat', 'ringhard', 'ringseg', 'particle_hard', 'glow_soft', 'streak', 'bolt']
            .map(n => `Texture/rr_${n}.png`).concat(textPath(p.label)),
        textTextures: textTexturesOf,
        buildModels(p, M) {
            // one shared "sausage slice": a 12-segment cylinder-wall prism
            // (unit radius, unit height, gaps between chunks) — every
            // charge level is an instance of this mesh
            const N = 12, gap = 0.14, ROWS = 4;
            const vertices = [];
            const faces = [];
            for (let k = 0; k < N; k++) {
                const a0 = ((k + gap / 2) / N) * Math.PI * 2;
                const a1 = ((k + 1 - gap / 2) / N) * Math.PI * 2;
                const base = vertices.length;
                for (let i = 0; i < ROWS; i++) {
                    const a = a0 + ((a1 - a0) * i) / (ROWS - 1);
                    const nx = Math.cos(a), nz = Math.sin(a);
                    vertices.push({ p: [nx, -0.5, nz], n: [nx, 0, nz], uv: [i / (ROWS - 1), 1] },
                                  { p: [nx, 0.5, nz], n: [nx, 0, nz], uv: [i / (ROWS - 1), 0] });
                }
                for (let i = 0; i < ROWS - 1; i++) {
                    const b = base + i * 2;
                    faces.push([b, b + 2, b + 3], [b, b + 3, b + 1]);
                }
            }
            return [{ path: `Model/rr_ui_batt_slice_v${M.MESH_REV || 1}.efkmodel`,
                      mesh: { vertices, faces, scale: 1 } }];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('CELL 07'),
            { key: 'fullColor', label: 'Primary Color', type: 'color', default: '#5dffa0' },
            { key: 'lowColor', label: 'Accent Color', type: 'color', default: '#ff4767' },
            { key: 'caseColor', label: 'Ring Color', type: 'color', default: '#2a5a66' },
            { key: 'level', label: 'Fill Level', type: 'range', default: 100, min: 5, max: 100, step: 5 },
            { key: 'mode', label: 'Fill Mode', type: 'select', default: 'fill',
              options: [
                  { value: 'fill', label: 'Fill' },
                  { value: 'drain', label: 'Drain' },
                  { value: 'hold', label: 'Hold' },
                  { value: 'short', label: 'Short' },
              ] },
            { key: 'segments', label: 'Segments', type: 'range', default: 10, min: 6, max: 14, step: 1 },
            { key: 'pulse', label: 'Pulse Rate', type: 'range', default: 8, min: 2, max: 20, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, v3, group, band, quad, U, B } = K;
            const cf = U.hexToRgba(p.fullColor);
            const cl = U.hexToRgba(p.lowColor);
            const cc = U.hexToRgba(p.caseColor);
            const TEX = { flat: 0, ringh: 1, ringseg: 2, dot: 3, glow: 4, streak: 5, bolt: 6 };
            const S = p.segments;
            const lit = Math.max(1, Math.round(S * p.level / 100));
            const cycle = Math.max(50, 340 - p.pulse * 14);
            const R = 0.34;           // cylinder radius
            const HB = 1.0;           // body height
            const segH = (HB / S) * 0.72;
            const mix = (a, b, f) => ({ r: Math.round(a.r + (b.r - a.r) * f),
                                        g: Math.round(a.g + (b.g - a.g) * f),
                                        b: Math.round(a.b + (b.b - a.b) * f) });
            const zone = (j) => {
                const f = j / Math.max(1, S - 1);
                return f < 0.34 ? cl : f < 0.67 ? mix(cl, cf, 0.55) : cf;
            };
            const sys = [];

            // casing: BOLD cap rings (whiteCenter for a hot rim), four
            // vertical rail highlights around the shell, terminal ring +
            // nub — the silhouette has to stand out around the charge stack
            // casing: bottom cap ring only (a big TOP cap crossed the body
            // center from the tilted view and shaded the slices), rails,
            // terminal ring + nub
            sys.push(quad({ tex: TEX.ringh, y: -HB / 2 - 0.02, w: R * 2.3, h: R * 2.3,
                rotX: Math.PI / 2, color: cc, alpha: 255 }));
            for (const sx of [-1, 1]) {
                sys.push(quad({ tex: TEX.streak, x: sx * R * 1.12, w: 0.028, h: HB,
                    color: cc, alpha: 255 }));
            }
            sys.push(quad({ tex: TEX.ringh, y: HB / 2 + 0.08, w: R * 0.95, h: R * 0.95,
                rotX: Math.PI / 2, color: cc, alpha: 255 }));
            sys.push(quad({ tex: TEX.dot, y: HB / 2 + 0.12, w: 0.09, h: 0.07, color: cc, alpha: 255 }));

            // charge segments: SAUSAGE SLICES — instances of the shared
            // 12-chunk cylinder-wall mesh, each with real vertical height,
            // stacked bottom→top into the battery body
            const sliceH = (HB / S) * 0.74;
            const slice = (y, col, a, t = {}) => B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: {
                    ...bindAlways,
                    maxGeneration: t.genTime ? 99999 : 1,
                    life: rf(t.life ?? LONG),
                    ...(t.genTime ? { generationTime: rf(t.genTime),
                                      generationTimeOffset: rf(t.genOffset || 0) } : {}),
                },
                translation: { type: 0, refEq: -1, position: v3(0, y, 0) },
                scaling: { type: 0, refEq: -1, scale: v3(R, sliceH, R) },
                rendererCommon: {
                    colorTextureIndex: TEX.flat, alphaBlend: 2,
                    ...(t.fadeIn ? { fadeInType: 1, fadeIn: { frame: t.fadeIn, params: [0, 0, 0] } } : {}),
                    ...(t.fadeOut ? { fadeOutType: 1, fadeOut: { frame: t.fadeOut, params: [0, 0, 0] } } : {}),
                },
                rendererParams: { modelIndex: 0, billboard: 2, culling: 1,
                                  allColor: U.fixedColor({ ...col, a }) },
            });
            for (let j = 0; j < S; j++) {
                const y = -HB / 2 + (j + 0.5) * (HB / S);
                // dim track slice
                sys.push(slice(y, U.dim(cc, 0.6), 100));
                if (j >= lit) continue;
                const col = zone(j);
                if (p.mode === 'hold') {
                    const tip = j === lit - 1;
                    sys.push(slice(y, tip ? { r: 255, g: 255, b: 255 } : col, 255,
                        tip ? { life: 30, genTime: 44, fadeIn: 6, fadeOut: 6 } : {}));
                } else if (p.mode === 'short') {
                    // shorting out: every slice sputters on its own clock
                    sys.push(slice(y, col, 255, {
                        life: 6 + ((j * 7) % 9), genTime: 11 + ((j * 5) % 13),
                        genOffset: (j * 3) % 11, fadeIn: 1, fadeOut: 2 }));
                } else {
                    // fill: snappy charge-up (~4 frames/segment) then hold;
                    // drain: all on at cycle start, depleting top→bottom
                    // across most of the cycle — discharge SHOULD be slow
                    const rise = Math.min(cycle * 0.7, lit * 4);
                    const tOn = p.mode === 'fill' ? Math.round((j / lit) * rise) : 0;
                    const life = p.mode === 'fill'
                        ? Math.max(4, cycle - tOn)
                        : Math.max(4, Math.round(((lit - j) / lit) * cycle * 0.85));
                    sys.push(slice(y, col, 255, { life, genTime: cycle, genOffset: tOn,
                                                  fadeIn: 2, fadeOut: 3 }));
                }
            }

            // shorting out: THE lightning bolt — a real pointy ⚡ texture
            // flashing dead-center (camera-facing so it always reads),
            // with a hot flicker glow behind it
            if (p.mode === 'short') {
                sys.push(quad({ tex: TEX.bolt, z: 0.4, w: 0.55, h: 0.72,
                    color: { r: 255, g: 244, b: 140 }, alpha: 255, billboard: 0,
                    life: 10, genTime: 24, fadeIn: 1, fadeOut: 4 }));
                sys.push(quad({ tex: TEX.glow, z: 0.38, w: 0.95, h: 1.25, color: cl, alpha: 130,
                    billboard: 0, life: 7, genTime: 17, genOffset: 3, fadeIn: 1, fadeOut: 3 }));
            }

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, [
                // tilt deep enough that the segment RINGS read as ellipses
                // (the stack is the battery body now)
                group({ rot: v3(0.3, 0, 0) }, sys),
                // label = index 7: after the SEVEN builtins
                textNode(K, 7, { y: -0.85, w: 0.8, color: cc }),
            ])];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Behavior Matrix — a ternary (3-axis) composition plot: triangle frame
    // with inner grid, USER-NAMED corners, and a wandering analysis marker.
    // Rename the corners and the same plot reads as anything: FLIGHT/FIGHT/
    // FREEZE, MIND/BODY/SPIRIT, ATK/DEF/SPD…  (FUI ref: drawTernary.)
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-ternary',
        name: 'Behavior Matrix',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['flat', 'streak', 'particle_hard', 'glow_soft', 'techglyphs']
            .map(n => `Texture/rr_${n}.png`)
            .concat([textPath(p.label), textPath(p.c1), textPath(p.c2), textPath(p.c3)]),
        textTextures: (p) => [
            { path: textPath(p.label), text: p.label },
            { path: textPath(p.c1), text: p.c1 },
            { path: textPath(p.c2), text: p.c2 },
            { path: textPath(p.c3), text: p.c3 },
        ],
        buildModels(p, M) {
            // triangle frame + grid lines parallel to each edge
            const A = [0, 0.72, 0], Bv = [-0.66, -0.42, 0], Cv = [0.66, -0.42, 0];
            const pts = [];
            const edges = [];
            const seg = (P, Q) => { const b = pts.length; pts.push(P, Q); edges.push([b, b + 1]); };
            seg(A, Bv); seg(Bv, Cv); seg(Cv, A);
            const mix = (P, Q, f) => [P[0] + (Q[0] - P[0]) * f, P[1] + (Q[1] - P[1]) * f, 0];
            for (const f of [0.25, 0.5, 0.75]) {
                seg(mix(A, Bv, f), mix(A, Cv, f));
                seg(mix(Bv, A, f), mix(Bv, Cv, f));
                seg(mix(Cv, A, f), mix(Cv, Bv, f));
            }
            return [{ path: `Model/rr_ui_ternary_v${M.MESH_REV || 1}.efkmodel`,
                      mesh: { ...M.strutFrame(pts, edges, 0.011), scale: 1 } }];
        },
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('BEHAVIOR MATRIX'),
            { key: 'c1', label: 'Corner 1', type: 'text', default: 'FLIGHT' },
            { key: 'c2', label: 'Corner 2', type: 'text', default: 'FIGHT' },
            { key: 'c3', label: 'Corner 3', type: 'text', default: 'FREEZE' },
            { key: 'frameColor', label: 'Primary Color', type: 'color', default: '#ff9838' },
            { key: 'markColor', label: 'Accent Color', type: 'color', default: '#ff2e22' },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, quad, U, B } = K;
            const cf = U.hexToRgba(p.frameColor);
            const cm = U.hexToRgba(p.markColor);
            const TEX = { flat: 0, streak: 1, dot: 2, glow: 3, glyphs: 4 };
            const nodes = [];

            nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                rendererCommon: { colorTextureIndex: TEX.flat, alphaBlend: 2 },
                rendererParams: { modelIndex: 0, billboard: 2, culling: 2,
                                  allColor: U.fixedColor({ ...cf, a: 235 }) },
            }));
            // corner labels (user text) just outside each vertex
            nodes.push(textNode(K, 6, { x: 0, y: 0.85, w: 0.42, color: cf }));
            nodes.push(textNode(K, 7, { x: -0.78, y: -0.53, w: 0.42, color: cf }));
            nodes.push(textNode(K, 8, { x: 0.78, y: -0.53, w: 0.42, color: cf }));
            // THE PREY: ONE laser dot being tracked around inside the
            // triangle. Deterministic Lissajous wander sampled into chained
            // legs (the flightpath-marker trick) — a single continuous dot
            // circling seamlessly, never a scatter; the bloom flies the
            // exact same path so core and halo stay glued together.
            const LEGS = 24, legT = 11, cycleT = LEGS * legT;
            const halfW = (y) => 0.66 * (0.72 - y) / 1.14;   // triangle interior
            const at = (f) => {
                const t = f * Math.PI * 2;
                const y = -0.07 + 0.24 * Math.sin(3 * t + 1.3);
                const x = Math.min(0.9 * halfW(y), 0.34) * Math.sin(2 * t);
                return [x, y];
            };
            for (let s = 0; s < LEGS; s++) {
                const [ax, ay] = at(s / LEGS);
                const [bx, by] = at((s + 1) / LEGS);
                const leg = (tex, size, a) => B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(legT),
                                    generationTime: rf(cycleT), generationTimeOffset: rf(s * legT) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(ax, ay, 0.02)),
                        velocity: rv3(v3((bx - ax) / legT, (by - ay) / legT, 0)),
                        acceleration: rv3(0),
                    },
                    scaling: { type: 0, refEq: -1, scale: v3(size, size, 1) },
                    rendererCommon: { colorTextureIndex: tex, alphaBlend: 2 },
                    rendererParams: { allColor: U.fixedColor({ ...cm, a }) },
                });
                nodes.push(leg(TEX.glow, 0.22, 220));
                nodes.push(leg(TEX.dot, 0.06, 255));
            }
            // title beneath the plot
            nodes.push(textNode(K, 5, { y: -0.82, w: 0.85, color: cf }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });

    // ─────────────────────────────────────────────────────────────────────
    // Flight Prediction — predicted path plot: grid, a probability-cone
    // fill, a bright predicted curve with a marker flying it, dashed
    // branch paths, and user path text. (FUI ref: drawFlightPrediction.)
    // ─────────────────────────────────────────────────────────────────────
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'ui-flightpath',
        name: 'Flight Prediction',
        category: 'Interface',
        continuous: true,
        prewarm: 60,
        textures: (p) => ['flat', 'streak', 'particle_hard', 'glow_soft']
            .map(n => `Texture/rr_${n}.png`)
            .concat([textPath(p.label), textPath(p.pathText)]),
        textTextures: (p) => [
            { path: textPath(p.label), text: p.label },
            { path: textPath(p.pathText), text: p.pathText },
        ],
        params: [
            sizeParam,
            widthParam,
            heightParam,
            textParam('FLIGHT PREDICTION'),
            { key: 'pathText', label: 'Path Label', type: 'text', default: 'ESCAPE VECTOR P=64' },
            { key: 'pathColor', label: 'Primary Color', type: 'color', default: '#ff2e22' },
            { key: 'branchColor', label: 'Accent Color', type: 'color', default: '#ff9838' },
            { key: 'gridColor', label: 'Grid Color', type: 'color', default: '#3a4a1a' },
            { key: 'arc', label: 'Path Arc', type: 'range', default: 0.24, min: -0.4, max: 0.6, step: 0.02 },
            { key: 'branches', label: 'Branches', type: 'range', default: 2, min: 0, max: 4, step: 1 },
        ],
        build(p) {
            const K = kit();
            const { rf, rv3, v3, group, quad, U, B } = K;
            const cp = U.hexToRgba(p.pathColor);
            const cbr = U.hexToRgba(p.branchColor);
            const cg = U.hexToRgba(p.gridColor);
            const TEX = { flat: 0, streak: 1, dot: 2, glow: 3 };
            const CW = 1.6, CH = 1.0;
            const nodes = [];

            // grid
            for (let i = 0; i <= 6; i++) {
                nodes.push(quad({ tex: TEX.flat, x: -CW / 2 + (i / 6) * CW, w: 0.005, h: CH,
                    color: cg, alpha: 140 }));
            }
            for (let i = 0; i <= 4; i++) {
                nodes.push(quad({ tex: TEX.flat, y: -CH / 2 + (i / 4) * CH, w: 0.005, h: CW,
                    color: cg, alpha: 140, rotZ: Math.PI / 2 }));
            }
            // quadratic path sampler (origin → apex → target)
            const O = [-0.65, -0.12], T = [0.62, 0.18], MX = (O[0] + T[0]) / 2;
            const q = (apexY, f) => {
                const ax = O[0] + (MX - O[0]) * f, ay = O[1] + (apexY - O[1]) * f;
                const bx = MX + (T[0] - MX) * f, by = apexY + (T[1] - apexY) * f;
                return [ax + (bx - ax) * f, ay + (by - ay) * f];
            };
            // probability cone fill: vertical sprite slabs between the
            // upper/lower quadratic bounds (both share x per sample, so a
            // slab is an exact vertical slice). Sprites instead of a mesh
            // on purpose — a per-arc-value mesh forced a cache-miss model
            // load on every slider step, which lagged drags ("the slider
            // fights me"); slabs rebuild instantly from cached textures.
            const CONE_N = 20;
            for (let i = 0; i < CONE_N; i++) {
                const f = (i + 0.5) / CONE_N;
                const [x, yHi] = q(p.arc + 0.26, f);
                const yLo = q(p.arc - 0.3, f)[1];
                const w = (q(p.arc, (i + 1) / CONE_N)[0] - q(p.arc, i / CONE_N)[0]) * 1.02;
                nodes.push(quad({ tex: TEX.flat, x, y: (yHi + yLo) / 2,
                    w, h: yHi - yLo, color: U.dim(cbr, 0.7), alpha: 45 }));
            }
            // main predicted path: tight dash quads = a continuous curve
            // (Path Arc bends it; Branches sets the alternate futures)
            const M2 = 26;
            for (let i = 0; i < M2; i++) {
                const f = (i + 0.5) / M2;
                const [x, y] = q(p.arc, f);
                const [x2, y2] = q(p.arc, f + 0.5 / M2);
                nodes.push(quad({ tex: TEX.flat, x, y, z: 0.01, w: 0.055, h: 0.014,
                    color: cp, alpha: 255,
                    rotZ: Math.atan2(y2 - y, x2 - x) }));
            }
            // branch paths: sparse dashes, dimmer, fanned around the arc
            const SPREAD = [0.22, -0.26, 0.42, -0.46];
            for (let k = 0; k < p.branches; k++) {
                const apex = p.arc + SPREAD[k];
                for (let i = 0; i < 13; i++) {
                    const f = (i + 0.5) / 13;
                    const [x, y] = q(apex, f);
                    const [x2, y2] = q(apex, f + 0.5 / 13);
                    nodes.push(quad({ tex: TEX.flat, x, y, w: 0.035, h: 0.009,
                        color: cbr, alpha: 170,
                        rotZ: Math.atan2(y2 - y, x2 - x) }));
                }
            }
            // marker flying the main path (piecewise legs, chained)
            const LEGS = 5, legT = 26, cycle = LEGS * legT + 30;
            for (let s = 0; s < LEGS; s++) {
                const [ax, ay] = q(p.arc, s / LEGS);
                const [bx, by] = q(p.arc, (s + 1) / LEGS);
                nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...bindAlways, maxGeneration: 99999, life: rf(legT),
                                    generationTime: rf(cycle), generationTimeOffset: rf(s * legT) },
                    translation: {
                        type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                        location: rv3(v3(ax, ay, 0.02)),
                        velocity: rv3(v3((bx - ax) / legT, (by - ay) / legT, 0)),
                        acceleration: rv3(0),
                    },
                    scaling: { type: 0, refEq: -1, scale: v3(0.06, 0.06, 1) },
                    rendererCommon: { colorTextureIndex: TEX.glow, alphaBlend: 2 },
                    rendererParams: { allColor: U.fixedColor({ ...cbr, a: 255 }) },
                }));
            }
            // origin + target markers
            nodes.push(quad({ tex: TEX.dot, x: O[0], y: O[1], w: 0.05, h: 0.05, color: cp, alpha: 255 }));
            nodes.push(quad({ tex: TEX.glow, x: T[0], y: T[1], w: 0.12, h: 0.12, color: cp, alpha: 220,
                life: 34, genTime: 34, fadeIn: 10, fadeOut: 10 }));
            // user path label (bottom-left) + title above the frame
            nodes.push(textNode(K, 5, { x: -CW / 2 + 0.32, y: -CH / 2 + 0.09, w: 0.6, color: cbr }));
            nodes.push(textNode(K, 4, { x: -CW / 2 + 0.38, y: CH / 2 + 0.1, w: 0.7, color: cp }));

            return [group({ scale: v3(p.size * p.wscale, p.size * p.hscale, p.size) }, nodes)];
        },
    });
})();
