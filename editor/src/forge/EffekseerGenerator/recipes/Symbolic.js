/**
 * Symbolic family — one recipe per glyph, mirroring the standard Animation
 * Generator's Symbolic category. All seamless loops.
 *
 * Geometry comes from RR_EfkSymbols (2D outlines → glowing struts, or
 * ear-clipped fills in Solid style). Symbols with two color roles
 * (yin-yang halves, radioactive wedges vs. core, currency bars, …) expose
 * a second color. Everything rides an Always-bound spinning container, so
 * the orientation gizmo works in realtime and MZ can steer the effect.
 */
(function () {
    const D2R = Math.PI / 180;
    const LONG = 36000;   // continuous — exact spin, no loop restarts
    const GLYPHS = [
        { id: 'pentagram',     name: 'Pentagram',        symbol: 'pentagram',     color: '#ff5f4a', color2: '#ffd27f' },
        { id: 'yin-yang',      name: 'Yin Yang',         symbol: 'yin-yang',      color: '#f5f5f5', color2: '#8a5cff' },
        { id: 'cross',         name: 'Christian Cross',  symbol: 'cross',         color: '#ffd873' },
        { id: 'star-of-david', name: 'Star of David',    symbol: 'star-of-david', color: '#6ea8ff' },
        { id: 'crescent-star', name: 'Crescent and Star', symbol: 'crescent-star', color: '#7fe6a0', color2: '#ffffff' },
        { id: 'peace',         name: 'Peace Symbol',     symbol: 'peace',         color: '#9fd0ff' },
        { id: 'radioactive',   name: 'Radioactive',      symbol: 'radioactive',   color: '#e8ff42', color2: '#2b2b20' },
        { id: 'biohazard',     name: 'Biohazard',        symbol: 'biohazard',     color: '#ffb03a', color2: '#ff6a3a' },
        { id: 'swastika',      name: 'Swastika',         symbol: 'swastika',      color: '#ff8a8a' },
        { id: 'hammer-sickle', name: 'Hammer and Sickle', symbol: 'hammer-sickle', color: '#ff4a4a', color2: '#ffd23f' },
        { id: 'heart',         name: 'Heart',            symbol: 'heart',         color: '#ff5f7a' },
        { id: 'dollar',        name: 'Dollar Sign',      symbol: 'dollar',        color: '#7fe08a', color2: '#c9ffd1' },
        { id: 'euro',          name: 'Euro Sign',        symbol: 'euro',          color: '#7fa8ff', color2: '#c9dbff' },
        { id: 'yen',           name: 'Yen Sign',         symbol: 'yen',           color: '#ff9fd0', color2: '#ffd7ec' },
        { id: 'delta',         name: 'Delta',            symbol: 'delta',         color: '#333333', color2: '#ffd860' },
        { id: 'stargate',      name: 'Stargate',         symbol: 'stargate',      color: '#8fb8d8', color2: '#ffb03a' },
        { id: 'trump',         name: 'Trump',            symbol: 'trump',         color: '#ffc46b' },
    ];

    const BUILTIN_TEXTURES = ['streak', 'glow_soft', 'particle_hard', 'ring_soft', 'spark', 'smoke', 'flat', 'noise', 'checker'];

    for (const def of GLYPHS) {
        const hasSecondary = !!def.color2;

        RR_EFK_RECIPE_REGISTRY.push({
            id: `sym-${def.id}`,
            name: def.name,
            category: 'Symbolic',
            continuous: true,
            textures: (p) => [...BUILTIN_TEXTURES.map(n => `Texture/rr_${n}.png`),
                              ...(p.customTex ? [`Texture/${p.customTex}`] : [])],
            params: [
                { key: 'style', label: 'Style', type: 'select', default: 'solid',
                  options: [
                      { value: 'wire', label: 'Glowing Outline' },
                      { value: 'solid', label: 'Solid (textured)' },
                  ] },
                { key: 'customTex', label: 'Custom Texture', type: 'texture', default: '' },
                { key: 'texScale',  label: 'Pattern Scale',  type: 'range',  default: 1, min: 1, max: 8, step: 1 },
                { key: 'surfTex', label: 'Surface Texture', type: 'select', default: 'flat',
                  options: [
                      { value: 'noise', label: 'Soft Noise' },
                      { value: 'flat', label: 'Flat' },
                      { value: 'checker', label: 'Checker' },
                      { value: 'streak', label: 'Glow Streak' },
                  ] },
                { key: 'color',  label: hasSecondary ? 'Primary Color' : 'Color', type: 'color', default: def.color },
                ...(hasSecondary ? [{ key: 'color2', label: 'Secondary Color', type: 'color', default: def.color2 }] : []),
                { key: 'size',      label: 'Size',           type: 'range',  default: 6, min: 2, max: 14, step: 1 },
                { key: 'thickness', label: 'Line Thickness', type: 'range',  default: 4, min: 1, max: 12, step: 1 },
                { key: 'spinY',     label: 'Spin Y (°/s)',   type: 'range',  default: 30, min: -120, max: 120, step: 1 },
                { key: 'spinX',     label: 'Spin X (°/s)',   type: 'range',  default: 0, min: -120, max: 120, step: 1 },
                { key: 'spinZ',     label: 'Spin Z (°/s)',   type: 'range',  default: 0, min: -120, max: 120, step: 1 },
                { key: 'flow',      label: 'Texture Flow',   type: 'range',  default: 4, min: 0, max: 20, step: 1 },
                { key: 'opacity',   label: 'Opacity',        type: 'range',  default: 26, min: 0, max: 32, step: 1 },
                { key: 'sparks',    label: 'Sparks',         type: 'range',  default: 0, min: 0, max: 60, step: 1 },
                { key: 'accent',    label: 'Spark Color',    type: 'color',  default: '#ffffff' },
                { key: 'life',      label: 'Spark Cadence Base', type: 'range', default: 120, min: 30, max: 300, step: 1 },
                { key: 'core',      label: 'Core Glow',      type: 'toggle', default: false },
            ],

            buildModels(p, M) {
                // Custom texture implies Solid style (see build()).
                const style = p.customTex ? 'solid' : p.style;
                const sym = RR_EfkSymbols.buildSymbol(def.symbol, {
                    style,
                    thickness: p.thickness * 0.009,
                });
                const tag = `${def.symbol}_${style}_t${p.thickness}`;
                const models = sym.parts.map((part, i) => ({
                    path: `Model/rr_sym_${tag}_${part.role}${i}.efkmodel`,
                    mesh: part.mesh,
                    role: part.role,
                }));
                models.push({ path: `Model/rr_sym_${tag}_spawn.efkmodel`, mesh: M.spawnModel(sym.spawnVertices) });
                return models;
            },

            build(p) {
                const B = RR_EfkBuilder;
                const U = RR_EfkRecipeUtil;
                const { rf, rv3, v3 } = B;
                const c1 = U.hexToRgba(p.color);
                const c2 = U.hexToRgba(p.color2 || p.color);
                const accent = U.hexToRgba(p.accent);
                const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
                // Outlines always use the soft-glow texture (index 1);
                // an uploaded texture is appended after the built-ins.
                const texIndex = p.customTex ? BUILTIN_TEXTURES.length
                    : ((p.style === 'solid') ? Math.max(0, BUILTIN_TEXTURES.indexOf(p.surfTex || 'noise')) : 1);
                const alpha = Math.min(255, Math.round(p.opacity * 8));
                const spin = (dps) => dps * D2R / 60;   // exact °/s

                // Custom texture implies Solid (matches buildModels) — it
                // only reads correctly on filled faces, not outline struts.
                const style = p.customTex ? 'solid' : p.style;
                // One model node per color-role part. Model order matches
                // buildModels: parts first (spawn model is last).
                const sym = RR_EfkSymbols.buildSymbol(def.symbol, { style, thickness: p.thickness * 0.009 });
                const isSolid = style === 'solid';
                const nodes = sym.parts.map((part, i) => B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rendererCommon: {
                        colorTextureIndex: texIndex,
                        // Solid fills with a real texture need NORMAL blend
                        // (additive washes the image into a glow); outlines
                        // keep the additive energy look.
                        alphaBlend: (isSolid && p.customTex) ? 1 : 2,
                        // builder default wrap 0 = REPEAT (1 = Clamp would
                        // let the scroll slide the texture off the glyph)
                        ...((() => {
                            const reps = Math.max(1, p.texScale || 1);
                            const scrolls = p.flow > 0;
                            if (!scrolls && reps === 1) return {};
                            const v = Math.max(1, Math.round(p.flow * 0.002 * p.life)) / p.life;
                            const speed = scrolls ? { x: 0, y: v } : { x: 0, y: 0 };
                            return { uv: {
                                type: 3,
                                position: { max: { x: 0, y: 0 }, min: { x: 0, y: 0 } },
                                size: { max: { x: reps, y: reps }, min: { x: reps, y: reps } },
                                speed: { max: speed, min: speed },
                            } };
                        })()),
                    },
                    rendererParams: {
                        modelIndex: i,
                        // Custom textures render untinted (white × image);
                        // built-in white-alpha textures take the glyph tint.
                        allColor: (isSolid && p.customTex)
                            ? U.fixedColor({ r: 255, g: 255, b: 255, a: alpha })
                            : U.fixedColor({ ...(part.role === 'secondary' ? c2 : c1), a: alpha }),
                    },
                }));

                if (p.sparks > 0) {
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: {
                            ...bindAlways,
                            maxGeneration: 99999,
                            life: rf(10, 26),
                            generationTime: rf(Math.max(0.5, p.life / p.sparks / 1.5)),
                        },
                        generationLocation: { type: 2, modelIndex: sym.parts.length, modelType: 2 },
                        scaling: { type: 4, start: rf(0.4, 1.1), end: rf(0), params: [0, 0, 0] },
                        rendererCommon: { colorTextureIndex: 4 },
                        rendererParams: { allColor: U.fixedColor(accent) },
                    }));
                }

                if (p.core) {
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                        scaling: { type: 0, refEq: -1, scale: v3(1.6, 1.6, 1.6) },
                        rendererCommon: { colorTextureIndex: 1 },
                        rendererParams: { allColor: U.fixedColor({ ...U.dim(c1, 0.7), a: 70 }) },
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
                        velocity: rv3(v3(spin(p.spinX), spin(p.spinY), spin(p.spinZ))),
                        acceleration: rv3(0),
                    },
                    scaling: { type: 0, refEq: -1, scale: v3(p.size, p.size, p.size) },
                    children: nodes,
                })];
            },
        });
    }
})();
