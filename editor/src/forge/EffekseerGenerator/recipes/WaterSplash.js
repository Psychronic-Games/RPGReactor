/**
 * Water Splash — WaterOne-style: impact flash, droplet crown thrown up
 * with gravity, a bursting cluster of rimmed bubbles, splash column,
 * expanding foam ring on the ground plane and cool mist body.
 */
(function () {
    const D2R = Math.PI / 180;
    RR_EFK_RECIPE_REGISTRY.push({
        id: 'water-splash',
        name: 'Water Splash',
        category: 'Elements',
        textures: ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'smoke', 'bubble', 'noise'],
        params: [
            { key: 'color',  label: 'Water Color',  type: 'color',  default: '#5fb4ff' },
            { key: 'foam',   label: 'Foam Color',   type: 'color',  default: '#eaf6ff' },
            { key: 'count',  label: 'Droplets',     type: 'range',  default: 30, min: 8, max: 90, step: 1 },
            { key: 'size',   label: 'Size',         type: 'range',  default: 10, min: 3, max: 30, step: 1 },
            { key: 'life',   label: 'Duration',     type: 'range',  default: 50, min: 20, max: 100, step: 1 },
            { key: 'mist',   label: 'Mist',         type: 'toggle', default: true },
        ],
        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, v3 } = B;
            const col = U.hexToRgba(p.color);
            const foam = U.hexToRgba(p.foam);
            const WHITE = { r: 255, g: 255, b: 255 };
            const D = p.life;

            // Central splash column — vertical streak that rises and dies
            const column = B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                commonValues: { ...L.BIND, maxGeneration: 1, life: rf(Math.round(D * 0.4)) },
                translation: { type: 0, refEq: -1, position: v3(0, 3.2, 0) },
                scaling: { type: 4, start: rf(2.2), end: rf(3.4), params: [0, 0, 0] },
                rendererCommon: { colorTextureIndex: 3, alphaBlend: 2, fadeInType: 1, fadeIn: { frame: 2, params: [0, 0, 0] }, fadeOutType: 1, fadeOut: { frame: Math.round(D * 0.2), params: [0, 0, 0] } },
                rendererParams: { allColor: L.fixed(foam, 210) },
            });

            const kids = [
                L.flash({ tex: 0, color: WHITE, from: 3, to: 7, size: 6, duration: 7, alpha: 245, fadeOut: 5 }),
                column,
                // droplet crown: foam streaks thrown up, arcing back down
                L.burst({ tex: 4, color: foam, color2: col, count: p.count, size: 0.9, speed: 0.16, up: true,
                          gravity: 0.006, duration: Math.round(D * 0.55), cadence: 0.2,
                          dust: { tex: 4, color: foam, size: 0.4 }, fadeOut: 8 }),
                // bubble blast — two waves, rimmed bubble texture
                L.burst({ tex: 6, color: foam, count: Math.round(p.count * 0.8), size: 1.35, speed: 0.10, radius: 0.9,
                          start: 2, duration: Math.round(D * 0.7), cadence: 0.3, fadeOut: 12 }),
                L.burst({ tex: 6, color: col, count: Math.round(p.count * 0.6), size: 0.85, speed: 0.07, radius: 0.6,
                          start: 6, duration: Math.round(D * 0.8), cadence: 0.4, fadeOut: 14 }),
                // cool watery body: mottled noise + soft halo
                L.glow({ tex: 7, color: col, size: 7, pulseTo: 9, duration: Math.round(D * 0.6), alpha: 175, fadeIn: 3, fadeOut: Math.round(D * 0.3) }),
                L.glow({ tex: 0, color: col, size: 9.5, duration: Math.round(D * 0.55), alpha: 85, fadeOut: Math.round(D * 0.3) }),
                // ground foam rings
                L.act({ duration: D + 10, tiltX: -72 * D2R }, [
                    L.shockRing({ tex: 2, color: foam, size: 15, from: 2, width: 0.13, duration: Math.round(D * 0.5), alpha: 210, billboard: 2 }),
                    L.shockRing({ tex: 2, color: col, size: 19, from: 3, width: 0.2, start: 5, duration: Math.round(D * 0.6), alpha: 130, billboard: 2 }),
                ]),
                L.motes({ tex: 4, color: foam, count: 16, size: 0.32, radius: 2.6, vy: 0.02, duration: D, cadence: 1.6 }),
            ];
            if (p.mist) {
                kids.push(L.puffs({ tex: 5, color: foam, count: 8, size: 4.5, area: 2, rise: 0.02, alpha: 70,
                                    start: Math.round(D * 0.12), duration: Math.round(D * 0.9), cadence: 2.5,
                                    fadeOut: Math.round(D * 0.35) }));
            }
            return [L.act({ duration: D + 30, scale: p.size / 10 }, kids)];
        },
    });
})();
