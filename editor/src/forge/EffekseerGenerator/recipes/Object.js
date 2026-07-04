/**
 * Object family — 3D weapons & items, one recipe per object, mirroring
 * the standard Animation Generator's Object category. Same recipe shape
 * as Geometric: wireframe or solid style, custom texture upload (implies
 * Solid), whole-turn spin snapping for seamless loops, optional sparks
 * from the object's true vertices.
 *
 * Meshes come from the object kit in efk_model.js (lathe / prism / box
 * assemblies). Rock takes a shape seed; Crystal Gem a facet count.
 */
(function () {
    const D2R = Math.PI / 180;
    const LONG = 36000;   // continuous — exact spin, no loop restarts
    const OBJECTS = [
        { id: 'sword',    name: 'Sword',              shape: 'sword',    color: '#c8d8e8' },
        { id: 'knife',    name: 'Knife',              shape: 'knife',    color: '#c8d8e8' },
        { id: 'hammer',   name: 'Hammer',             shape: 'hammer',   color: '#c09060' },
        { id: 'arrow',    name: 'Arrow',              shape: 'arrow',    color: '#d0d0c0' },
        { id: 'bullet',   name: 'Bullet',             shape: 'bullet',   color: '#d49340' },
        { id: 'rock',     name: 'Rock',               shape: 'rock',     color: '#9a8a7a', extra: 'seed' },
        { id: 'egg',      name: 'Egg',                shape: 'egg',      color: '#f0e8d8' },
        { id: 'coin',     name: 'Coin',               shape: 'coin',     color: '#ffd700', spinY: 90 },
        { id: 'crown',    name: 'Crown',              shape: 'crown',    color: '#ffd700' },
        { id: 'scythe',   name: 'Scythe',             shape: 'scythe',   color: '#b0b8c8' },
        { id: 'sawblade', name: 'Circular Saw Blade', shape: 'sawblade', color: '#c0c8d0', spinZ: 180, spinY: 0 },
        { id: 'gem',      name: 'Crystal Gem',        shape: 'gem',      color: '#cc44ff', extra: 'facets' },
    ];

    const BUILTIN_TEXTURES = ['streak', 'glow_soft', 'particle_hard', 'ring_soft', 'spark', 'smoke', 'flat', 'noise', 'checker'];

    for (const def of OBJECTS) {
        const params = [
            { key: 'style', label: 'Style', type: 'select', default: 'wire',
              options: [
                  { value: 'wire', label: 'Wireframe' },
                  { value: 'solid', label: 'Solid (textured)' },
              ] },
            { key: 'customTex', label: 'Custom Texture', type: 'texture', default: '' },
            { key: 'texScale',  label: 'Pattern Scale',  type: 'range',  default: 1, min: 1, max: 8, step: 1 },
            { key: 'surfTex', label: 'Surface Texture', type: 'select', default: 'noise',
              options: [
                  { value: 'noise', label: 'Soft Noise' },
                  { value: 'flat', label: 'Flat' },
                  { value: 'checker', label: 'Checker' },
                  { value: 'streak', label: 'Glow Streak' },
              ] },
            { key: 'color',     label: 'Color',          type: 'color',  default: def.color },
            { key: 'size',      label: 'Size',           type: 'range',  default: 6, min: 2, max: 14, step: 1 },
            { key: 'thickness', label: 'Edge Thickness', type: 'range',  default: 4, min: 1, max: 12, step: 1 },
            ...(def.extra === 'seed' ? [{ key: 'seed', label: 'Shape Seed', type: 'range', default: 7, min: 0, max: 99, step: 1 }] : []),
            ...(def.extra === 'facets' ? [{ key: 'facets', label: 'Facets', type: 'range', default: 6, min: 4, max: 9, step: 1 }] : []),
            { key: 'spinX',     label: 'Spin X (°/s)',   type: 'range',  default: def.spinX ?? 0, min: -240, max: 240, step: 1 },
            { key: 'spinY',     label: 'Spin Y (°/s)',   type: 'range',  default: def.spinY ?? 30, min: -240, max: 240, step: 1 },
            { key: 'spinZ',     label: 'Spin Z (°/s)',   type: 'range',  default: def.spinZ ?? 0, min: -240, max: 240, step: 1 },
            { key: 'flow',      label: 'Texture Flow',   type: 'range',  default: 4, min: 0, max: 20, step: 1 },
            { key: 'opacity',   label: 'Opacity',        type: 'range',  default: 26, min: 0, max: 32, step: 1 },
            { key: 'sparks',    label: 'Sparks',         type: 'range',  default: 0, min: 0, max: 60, step: 1 },
            { key: 'accent',    label: 'Spark Color',    type: 'color',  default: '#ffffff' },
            { key: 'life',      label: 'Spark Cadence Base', type: 'range', default: 120, min: 30, max: 300, step: 1 },
            { key: 'core',      label: 'Core Glow',      type: 'toggle', default: false },
        ];

        RR_EFK_RECIPE_REGISTRY.push({
            id: `obj-${def.id}`,
            name: def.name,
            category: 'Object',
            continuous: true,
            textures: (p) => [...BUILTIN_TEXTURES.map(n => `Texture/rr_${n}.png`),
                              ...(p.customTex ? [`Texture/${p.customTex}`] : [])],
            params,

            buildModels(p, M) {
                // A custom texture only reads correctly on solid faces.
                const style = p.customTex ? 'solid' : p.style;
                const geo = M.buildGeometry(def.shape, {
                    thickness: p.thickness * 0.011,
                    style,
                    seed: p.seed,
                    facets: p.facets,
                });
                const tag = [def.shape, style, `t${p.thickness}`,
                             p.seed !== undefined ? `s${p.seed}` : '',
                             p.facets !== undefined ? `f${p.facets}` : ''].filter(Boolean).join('_');
                return [
                    { path: `Model/rr_obj_${tag}.efkmodel`, mesh: geo.mesh },
                    { path: `Model/rr_obj_${tag}_spawn.efkmodel`, mesh: M.spawnModel(geo.spawnVertices) },
                ];
            },

            build(p) {
                const B = RR_EfkBuilder;
                const U = RR_EfkRecipeUtil;
                const { rf, rv3, v3 } = B;
                const col = U.hexToRgba(p.color);
                const accent = U.hexToRgba(p.accent);
                const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
                const texIndex = p.customTex ? BUILTIN_TEXTURES.length
                    : ((p.style === 'solid') ? Math.max(0, BUILTIN_TEXTURES.indexOf(p.surfTex || 'noise')) : 0);
                const alpha = Math.min(255, Math.round(p.opacity * 8));
                const isSolid = p.style === 'solid' || !!p.customTex;
                const spin = (dps) => dps * D2R / 60;   // exact °/s

                const body = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    rendererCommon: {
                        colorTextureIndex: texIndex,
                        alphaBlend: isSolid ? 1 : 2,
                        zWrite: isSolid ? 1 : 0,   // solid = occluding surface
                        ...((() => {
                            const reps = isSolid ? Math.max(1, p.texScale || 1) : 1;
                            const scrolls = p.flow > 0 && !isSolid;
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
                        modelIndex: 0,
                        // Solids cull their inside faces (1) — the flat MZ
                        // projection gives depth-testing nothing to work
                        // with, so occlusion must come from culling.
                        culling: isSolid ? 1 : 2,
                        allColor: (isSolid && p.customTex)
                            ? U.fixedColor({ r: 255, g: 255, b: 255, a: alpha })
                            : U.fixedColor({ ...col, a: alpha }),
                    },
                });

                const nodes = [body];

                if (p.sparks > 0) {
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: {
                            ...bindAlways,
                            maxGeneration: 99999,
                            life: rf(10, 26),
                            generationTime: rf(Math.max(0.5, p.life / p.sparks / 1.5)),
                        },
                        generationLocation: { type: 2, modelIndex: 1, modelType: 2 },
                        scaling: { type: 4, start: rf(0.4, 1.1), end: rf(0), params: [0, 0, 1] },
                        rendererCommon: { colorTextureIndex: 4 },
                        rendererParams: { allColor: U.fixedColor(accent) },
                    }));
                }

                if (p.core) {
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                        scaling: { type: 0, refEq: -1, scale: v3(1.4, 1.4, 1.4) },
                        rendererCommon: { colorTextureIndex: 1 },
                        rendererParams: { allColor: U.fixedColor({ ...U.dim(col, 0.8), a: 80 }) },
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
