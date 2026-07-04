/**
 * Geometric family — one recipe PER SHAPE (Hypercube, Sphere, Torus, …),
 * all under the "Geometric" category, mirroring the standard Animation
 * Generator's catalog structure.
 *
 * Every geometric recipe is SEAMLESSLY LOOPING by default:
 *   • no fade in/out on the body or core
 *   • spin rates are snapped so each axis completes a WHOLE number of
 *     turns over the effect's duration — the restart pose equals the
 *     start pose
 *   • 4D shapes bake exactly `life` model frames covering a whole number
 *     of 4D double-rotations, so the morph phase also matches at restart
 *   • recipes are tagged seamless:true — the preview replays with zero
 *     delay instead of the usual beat
 *
 * Structure per shape:
 *   container (None, snapped spin; children bind Always)
 *     ├── body:   Model node (multi-frame for 4D shapes)
 *     ├── sparks: corner glints via the spawn-only companion model
 *     │           (OFF by default — enable with the Sparks slider)
 *     └── core:   steady center glow (toggle)
 *
 * Texture: pick a built-in procedural texture, or upload your own image
 * (Custom Texture) — it's copied into the project's effects/Texture/ and
 * referenced by the exported effect, exactly like the Animation
 * Generator's texture picker.
 */
(function () {
    const D2R = Math.PI / 180;
    const LONG = 36000;   // continuous — no loop point, exact spin rates
    const SHAPES = [
        { id: 'hypercube',    name: 'Hypercube',        shape: 'hypercube' },
        { id: 'pentachoron',  name: 'Pentachoron',      shape: 'pentachoron' },
        { id: 'cube',         name: 'Cube',             shape: 'cube' },
        { id: 'pyramid',      name: 'Pyramid',          shape: 'pyramid' },
        { id: 'octahedron',   name: 'Octahedron',       shape: 'octahedron' },
        { id: 'merkaba',      name: 'Star Tetrahedron', shape: 'merkaba' },
        { id: 'icosahedron',  name: 'Icosahedron',      shape: 'icosahedron' },
        { id: 'dodecahedron', name: 'Dodecahedron',     shape: 'dodecahedron' },
        { id: 'sphere',       name: 'Sphere',           shape: 'sphere' },
        { id: 'torus',        name: 'Torus',            shape: 'torus' },
        { id: 'cylinder',     name: 'Cylinder',         shape: 'cylinder' },
        { id: 'cone',         name: 'Cone',             shape: 'cone' },
        { id: 'mobius',       name: 'Möbius Strip',     shape: 'mobius' },
        { id: 'helix',        name: 'Double Helix',     shape: 'helix' },
    ];

    const BUILTIN_TEXTURES = ['streak', 'glow_soft', 'particle_hard', 'ring_soft', 'spark', 'smoke', 'flat', 'noise', 'checker'];

    for (const def of SHAPES) {
        const kind = RR_EfkModel.SHAPE_KINDS[def.shape];
        const is4D = kind === '4d';
        // Solid style exists everywhere it has geometry to fill: surfaces,
        // 3D polytopes, and the 4D shapes with real 2-faces (hypercube,
        // pentachoron — their faces re-texture every morph frame). The
        // hypersphere and helix stay wireframe-only: shells/coils have no
        // faces to fill.
        const hasSolid = kind === 'surface' || kind === '3d' ||
                         def.shape === 'hypercube' || def.shape === 'pentachoron';

        const params = [
            ...(hasSolid ? [{
                key: 'style', label: 'Style', type: 'select', default: 'wire',
                options: [
                    { value: 'wire', label: 'Wireframe' },
                    { value: 'solid', label: 'Solid (textured)' },
                ],
            }] : []),
            { key: 'customTex', label: 'Custom Texture', type: 'texture', default: '' },
            { key: 'texScale', label: 'Pattern Scale', type: 'range', default: 1, min: 1, max: 8, step: 1 },
            { key: 'surfTex', label: 'Surface Texture', type: 'select', default: 'noise',
              options: [
                  { value: 'noise', label: 'Soft Noise' },
                  { value: 'flat', label: 'Flat' },
                  { value: 'checker', label: 'Checker' },
                  { value: 'streak', label: 'Glow Streak' },
              ] },
            { key: 'color',     label: 'Color',          type: 'color',  default: '#59d8ff' },
            { key: 'size',      label: 'Size',           type: 'range',  default: 5, min: 2, max: 14, step: 1 },
            { key: 'thickness', label: 'Edge Thickness', type: 'range',  default: 5, min: 1, max: 14, step: 1 },
            { key: 'spinX',     label: 'Spin X (°/s)',   type: 'range',  default: 0, min: -120, max: 120, step: 1 },
            { key: 'spinY',     label: 'Spin Y (°/s)',   type: 'range',  default: 36, min: -120, max: 120, step: 1 },
            { key: 'spinZ',     label: 'Spin Z (°/s)',   type: 'range',  default: 0, min: -120, max: 120, step: 1 },
            ...(is4D ? [{ key: 'morph', label: '4D Morph (turns/loop)', type: 'range', default: 1, min: 1, max: 3, step: 1 }] : []),
            { key: 'flow',      label: 'Texture Flow',   type: 'range',  default: 6, min: 0, max: 20, step: 1 },
            { key: 'opacity',   label: 'Opacity',        type: 'range',  default: 24, min: 0, max: 32, step: 1 },
            { key: 'sparks',    label: 'Sparks',         type: 'range',  default: 0, min: 0, max: 60, step: 1 },
            { key: 'accent',    label: 'Spark Color',    type: 'color',  default: '#ffffff' },
            { key: 'life',      label: is4D ? 'Morph Cycle (frames)' : 'Spark Cadence Base', type: 'range', default: is4D ? 240 : 120, min: 30, max: 480, step: 1 },
            { key: 'core',      label: 'Core Glow',      type: 'toggle', default: true },
        ];

        RR_EFK_RECIPE_REGISTRY.push({
            id: `geo-${def.id}`,
            name: def.name,
            category: 'Geometric',
            continuous: true,
            textures: (p) => [...BUILTIN_TEXTURES.map(n => `Texture/rr_${n}.png`),
                              ...(p.customTex ? [`Texture/${p.customTex}`] : [])],
            params,

            buildModels(p, M) {
                // A custom texture only reads correctly wrapped around a
                // solid surface, so it implies Solid style.
                const style = (hasSolid && p.customTex) ? 'solid' : p.style;
                const geo = M.buildGeometry(def.shape, {
                    thickness: p.thickness * 0.011,
                    style,
                    // 4D: one model frame per game frame over the whole
                    // loop → morph phase is continuous across restarts.
                    frames: is4D ? p.life : 1,
                    morphTurns: p.morph,
                });
                // MESH_REV in the path: model caches (editor + WASM) are
                // path-keyed, so mesh-content changes must change the path.
                const tag = [`v${M.MESH_REV || 1}`, def.shape, style || 'wire', `t${p.thickness}`,
                             is4D ? `f${p.life}m${p.morph}` : ''].filter(Boolean).join('_');
                return [
                    { path: `Model/rr_geo_${tag}.efkmodel`, mesh: geo.mesh },
                    { path: `Model/rr_geo_${tag}_spawn.efkmodel`, mesh: M.spawnModel(geo.spawnVertices) },
                ];
            },

            build(p) {
                const B = RR_EfkBuilder;
                const U = RR_EfkRecipeUtil;
                const { rf, rv3, v3 } = B;
                const edge = U.hexToRgba(p.color);
                const accent = U.hexToRgba(p.accent);
                const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
                // Wireframes always use the streak texture (index 0);
                // an uploaded texture is appended after the built-ins.
                const texIndex = p.customTex ? BUILTIN_TEXTURES.length
                    : (hasSolid && (p.style === 'solid' || p.customTex) ? Math.max(0, BUILTIN_TEXTURES.indexOf(p.surfTex || 'noise')) : 0);
                const alpha = Math.min(255, Math.round(p.opacity * 8));

                // Continuous playback — spin is EXACT °/s (rad/frame).
                // (The old whole-turn snapping quantized spin to multiples
                // of 360/(life/60) °/s — at the default loop length any
                // value under ±90 rounded to ZERO, so the sliders felt
                // dead except at the extremes.)
                const spin = (dps) => dps * D2R / 60;

                // Custom texture implies Solid (matches buildModels).
                const isSolid = hasSolid && (p.style === 'solid' || !!p.customTex);
                const body = B.makeNode(RR_EfkFormat.NODE_TYPE.MODEL, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                    // Textured solids: UV scroll would churn the texture
                    // through the pole pinches ("hourglass"), so the Flow
                    // slider spins the SURFACE GEOMETRY about its axis
                    // instead — reads as the planet's surface rotating.
                    // Always type 1 (zero velocity at flow 0) so keyframe
                    // trees stay pairable and flow tweens across KFs.
                    ...(isSolid && p.customTex ? {
                        rotation: {
                            type: 1,
                            refEqP: rf(-1), refEqV: rf(-1), refEqA: rf(-1),
                            rotation: rv3(0),
                            velocity: rv3(v3(0, spin(p.flow * 6), 0)),
                            acceleration: rv3(0),
                        },
                    } : {}),
                    rendererCommon: {
                        colorTextureIndex: texIndex,
                        // Solid surfaces render their texture faithfully with
                        // NORMAL blend (additive washes a planet texture into
                        // a glow); wireframes keep the additive energy look.
                        // Wrap stays at the builder default 0 = REPEAT.
                        alphaBlend: isSolid ? 1 : 2,
                        // Solids write depth so the far side doesn't show
                        // through the near side (corpus: blend 1 + zWrite 1
                        // is the stock opaque-surface combo).
                        zWrite: isSolid ? 1 : 0,
                        // SOLID custom textures move by GEOMETRY spin only
                        // (UV scroll on top churns the poles — "hourglass");
                        // their Flow slider drives the body-rotation above.
                        // Wireframes KEEP flow: on struts a texture only
                        // reads through motion.
                        ...((() => {
                            // Pattern Scale tiles the built-in texture across
                            // the surface (REPEAT wrap) — at 1 the gradient
                            // maps once and its dark end owns one side of the
                            // shape; higher repeats read as a wrapped pattern.
                            const reps = isSolid ? Math.max(1, p.texScale || 1) : 1;
                            const scrolls = p.flow > 0 && !(isSolid && p.customTex);
                            if (!scrolls && reps === 1) return {};
                            // Solid: scroll along LONGITUDE (reads as the
                            // surface rotating); wire: along the struts.
                            // Snapped to whole repeats per loop.
                            const v = Math.max(1, Math.round(p.flow * 0.002 * p.life)) / p.life;
                            const speed = !scrolls ? { x: 0, y: 0 }
                                : (isSolid ? { x: v, y: 0 } : { x: 0, y: v });
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
                        culling: isSolid && def.shape !== 'mobius' ? 1 : 2,   // the Möbius strip is ONE-SIDED — culling erases half of it
                        // Custom textures (planet maps etc.) render untinted;
                        // built-ins are white-alpha shapes that need the tint.
                        allColor: (isSolid && p.customTex)
                            ? U.fixedColor({ r: 255, g: 255, b: 255, a: alpha })
                            : U.fixedColor({ ...edge, a: alpha }),
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
                        generationLocation: { type: 2, modelIndex: 1, modelType: 2 },   // corner model, VERTEX_RANDOM
                        scaling: { type: 4, start: rf(0.5, 1.3), end: rf(0), params: [0, 0, 0] },
                        rendererCommon: { colorTextureIndex: 4 },
                        rendererParams: { allColor: U.fixedColor(accent) },
                    }));
                }

                if (p.core) {
                    nodes.push(B.makeNode(RR_EfkFormat.NODE_TYPE.SPRITE, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(LONG) },
                        scaling: { type: 0, refEq: -1, scale: v3(1.1, 1.1, 1.1) },   // steady
                        rendererCommon: { colorTextureIndex: 1 },
                        rendererParams: { allColor: U.fixedColor({ ...U.dim(edge, 0.8), a: 90 }) },
                    }));
                }

                // The container binds ALWAYS to the root: that's what lets
                // handle.setLocation/setRotation steer the playing effect in
                // realtime (the gizmo, and MZ's per-frame target tracking).
                // WhenCreating (the builder default) samples the root
                // transform once at spawn and ignores it afterwards.
                const container = B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
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
                });

                return [container];
            },
        });
    }
})();
