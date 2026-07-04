/**
 * Wind Gust — WindOne-style: crescent slash arcs snapping through the
 * center in waves, horizontal speed lines sweeping across, a brief
 * radial burst core, swept leaves/debris and low dust.
 */
(function () {
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'wind-gust',
        name: 'Wind Gust',
        category: 'Elements',
        textures: ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'smoke', 'slash', 'rays', 'noise'],
        buildModels(p, M) {
            return [
                { path: 'Model/rr_geo_cylinder_solid_t5.efkmodel',
                  mesh: M.buildGeometry('cylinder', { style: 'solid' }).mesh },
                { path: 'Model/rr_geo_funnel_solid_t5.efkmodel',
                  mesh: M.buildGeometry('funnel', { style: 'solid' }).mesh },
            ];
        },
        params: [
            { key: 'color',  label: 'Air Color',   type: 'color',  default: '#bfe8dd' },
            { key: 'form',   label: 'Form',        type: 'select', default: 'gust',
              options: [
                  { value: 'gust', label: 'Gust (horizontal)' },
                  { value: 'tornado', label: 'Tornado (vertical)' },
              ] },
            { key: 'count',  label: 'Streaks',     type: 'range',  default: 18, min: 6, max: 60, step: 1 },
            { key: 'size',   label: 'Size',        type: 'range',  default: 10, min: 3, max: 30, step: 1 },
            { key: 'speed',  label: 'Gust Speed',  type: 'range',  default: 10, min: 3, max: 24, step: 1 },
            { key: 'life',   label: 'Duration',    type: 'range',  default: 45, min: 20, max: 100, step: 1 },
            { key: 'debris', label: 'Swept Debris', type: 'toggle', default: true },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, rv3, v3 } = B;
            const col = U.hexToRgba(p.color);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;
            const spd = p.speed * 0.022;

            // Horizontal speed lines: thin streaks sweeping left → right
            const speedLines = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: {
                    ...L.BIND, maxGeneration: p.count, life: rf(13, 22),
                    generationTime: rf(Math.max(0.4, (D * 0.7) / p.count)),
                },
                generationLocation: { type: 0, location: rv3(v3(-8, -2.8, -1.6), v3(-4, 2.8, 1.6)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: rv3(v3(spd * 0.8, -0.004, 0), v3(spd * 1.5, 0.004, 0)),
                    acceleration: rv3(0),
                },
                rotation: { type: 0, refEq: -1, rotation: v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: v3(3.8, 0.14, 1) },
                rendererCommon: { colorTextureIndex: 3, alphaBlend: 2, fadeInType: 1, fadeIn: { frame: 3, params: [0, 0, 0] }, fadeOutType: 1, fadeOut: { frame: 6, params: [0, 0, 0] } },
                rendererParams: { allColor: L.fixed(col, 190) },
            });

            const tornado = p.form === 'tornado';
            // 3D vortex body. Gust: translucent cylinder lying along the
            // wind with the texture rolling around it. Tornado: upright
            // cone funnel, texture spinning around the circumference —
            // UV rotation about the vertical axis, immune to the Euler
            // end-over-end tumble. Both are motion-by-texture, geometry
            // stays put.
            const tube = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(D + 25) },
                rotation: { type: 0, refEq: -1, rotation: tornado ? v3(0, 0, 0) : v3(0, 0, Math.PI / 2) },
                scaling: { type: 0, refEq: -1, scale: tornado ? v3(2.4, 5.2, 2.4) : v3(1.6, 6.5, 1.6) },
                rendererCommon: { colorTextureIndex: 8, alphaBlend: 2,
                    uv: { type: 3,
                          position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                          size: { max: { x: tornado ? 2 : 1, y: 2 }, min: { x: tornado ? 2 : 1, y: 2 } },
                          speed: tornado
                              ? { max: { x: spd * 1.3, y: -spd * 0.25 }, min: { x: spd * 1.3, y: -spd * 0.25 } }
                              : { max: { x: spd * 0.35, y: -spd * 0.5 }, min: { x: spd * 0.35, y: -spd * 0.5 } } },
                    fadeInType: 1, fadeIn: { frame: 6, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: Math.round(D * 0.3), params: [0, 0, 0] } },
                rendererParams: { modelIndex: tornado ? 1 : 0, culling: 2, allColor: L.fixed(col, tornado ? 78 : 60) },
            });

            // Vortex rings shed off the tube: they face the wind axis,
            // travel downwind expanding and dissolving — the 3D signature.
            const vortexRings = B.makeNode(RR_EfkFormat.NODE_TYPE.RING, {
                commonValues: { ...L.BIND, maxGeneration: 99999, life: rf(22, 30),
                                generationTime: rf(Math.max(3, D * 0.16)) },
                rotation: { type: 0, refEq: -1, rotation: tornado ? v3(Math.PI / 2, 0, 0) : v3(0, Math.PI / 2, 0) },
                generationLocation: { type: 0, location: tornado
                    ? rv3(v3(-0.4, -4.2, -0.4), v3(0.4, -2.2, 0.4))
                    : rv3(v3(-5, -0.6, -0.4), v3(-2.5, 0.6, 0.4)) },
                translation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    location: rv3(0),
                    velocity: tornado
                        ? rv3(v3(0, spd * 0.5, 0), v3(0, spd * 0.8, 0))
                        : rv3(v3(spd * 0.85, 0, 0), v3(spd * 1.25, 0, 0)),
                    acceleration: rv3(0),
                },
                scaling: { type: 4, start: rf(1.2, 1.8), end: rf(3.2, 4.2), params: [0, 0, 1] },
                rendererCommon: { colorTextureIndex: 2, alphaBlend: 2,
                    fadeInType: 1, fadeIn: { frame: 4, params: [0, 0, 0] },
                    fadeOutType: 1, fadeOut: { frame: 10, params: [0, 0, 0] } },
                rendererParams: {
                    billboard: 2, vertexCount: 32,
                    outerLocation: { type: 0, location: { x: 1.12, y: 0 } },
                    innerLocation: { type: 0, location: { x: 0.88, y: 0 } },
                    outerColor: L.fixed(col, 0),
                    centerColor: L.fixed(WHITE, 180),
                    innerColor: L.fixed(col, 70),
                },
            });

            // Swept leaves marching around a tilted orbit (energy-ball
            // bead-stream trick) — debris caught circling in the vortex.
            const leafOrbit = B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(D + 25) },
                rotation: {
                    type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                    rotation: tornado ? rv3(v3(1.5, 0, 0)) : rv3(v3(1.35, 0, 0.35)),
                    velocity: rv3(v3(0, spd * (tornado ? 2.2 : 1.4), 0)), acceleration: rv3(0),
                },
                children: [B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { maxGeneration: 99999, life: rf(18, 26), generationTime: rf(1.8, 2.6),
                                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2 },
                    generationLocation: { type: 3, division: 20, radius: rf(2.6, 3.4),
                                          angleStart: rf(0), angleEnd: rf(360), circleType: 0, axisDirection: 1, angleNoize: rf(4) },
                    scaling: { type: 4, start: rf(0.3, 0.5), end: rf(0.1), params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 4, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 3, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 7, params: [0, 0, 0] } },
                    rendererParams: { allColor: L.fixed({ r: 190, g: 230, b: 170 }, 220) },
                })],
            });

            const kids = [
                tube,
                vortexRings,
                leafOrbit,
                speedLines,
                // swooshes that RIDE the gust: crescents sweeping across
                // with the wind, tumbling slightly as they go
                B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                    commonValues: { ...L.BIND, maxGeneration: 4, life: rf(16, 24), generationTime: rf(Math.round(D * 0.18)) },
                    generationLocation: { type: 0, location: rv3(v3(-4.5, -0.5, -0.8), v3(-1.5, 3, 0.8)) },
                    translation: { type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1), location: rv3(0),
                                   velocity: rv3(v3(spd * 0.9, -0.01, 0), v3(spd * 1.3, 0.01, 0)), acceleration: rv3(0) },
                    rotation: { type: 1, refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                                rotation: rv3(v3(0, 0, -3.14), v3(0, 0, 3.14)),
                                velocity: rv3(v3(0, 0, 0.14), v3(0, 0, 0.32)), acceleration: rv3(0) },
                    scaling: { type: 4, start: rf(5, 8), end: rf(9, 13), params: [0, 0, 1] },
                    rendererCommon: { colorTextureIndex: 6, alphaBlend: 2,
                        fadeInType: 1, fadeIn: { frame: 4, params: [0, 0, 0] },
                        fadeOutType: 1, fadeOut: { frame: 8, params: [0, 0, 0] } },
                    // billboard 2 (world-fixed): full-billboard sprites
                    // silently drop Z-spin — fixed orientation is the only
                    // mode where the tumble actually shows on screen.
                    rendererParams: { billboard: 2, allColor: L.fixed(col, 245) },
                }),
                // radial gust core
                L.flash({ tex: 7, color: WHITE, from: 4, to: 9, size: 8, start: 2, duration: 12, alpha: 200, fadeOut: 8 }),
                L.glow({ tex: 0, color: col, size: 6.5, pulseTo: 8, duration: Math.round(D * 0.7), alpha: 80, fadeIn: 4, fadeOut: Math.round(D * 0.35) }),
                // whirling wisps
                L.tendrils({ tex: 0, color: col, count: 5, speed: 0.07, curl: 0.035, tail: 20, width: 0.16,
                             duration: Math.round(D * 0.8), alpha: 190 }),
            ];
            if (p.debris) {
                kids.push(L.motes({ tex: 4, color: { r: 170, g: 220, b: 140 }, count: 14, size: 0.35, radius: 3,
                                    vy: 0.008, duration: D, cadence: 1.8 }));
                kids.push(L.puffs({ tex: 5, color: { r: 120, g: 125, b: 110 }, count: 6, size: 3.2, area: 2.4,
                                    rise: 0.008, alpha: 60, duration: Math.round(D * 0.9), cadence: 3,
                                    fadeOut: Math.round(D * 0.35) }));
            }
            return [L.act({ duration: D + 25, scale: p.size / 10 }, kids)];
        },
    });
})();
