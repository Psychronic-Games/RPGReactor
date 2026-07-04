/**
 * Custom Effect — the COMPOSER. Build an effect from layers, each with
 * keyframe-style timing (start / duration on a shared timeline) and eased
 * from→to motion, exactly the grammar professional Effekseer effects use.
 *
 * Layer kinds come from RR_EfkLayers (see layers.js); the editor renders
 * one card per layer with the schema below, plus add/remove/duplicate.
 * Everything maps onto native Effekseer primitives, so exports are plain
 * .efkefc files the engine plays directly.
 */
(function () {
    const TEXTURES = ['glow_soft', 'particle_hard', 'ring_soft', 'streak', 'spark', 'smoke'];
    const TEX_OPTIONS = [
        { value: 'glow_soft', label: 'Soft Glow' },
        { value: 'particle_hard', label: 'Hard Particle' },
        { value: 'ring_soft', label: 'Ring' },
        { value: 'streak', label: 'Streak' },
        { value: 'spark', label: 'Glint' },
        { value: 'smoke', label: 'Smoke' },
    ];

    // Per-kind editable fields. 'start'/'duration' are the layer's
    // keyframe window; other from→to motion is eased inside it.
    const COMMON = [
        { key: 'start',    label: 'Start (frames)',  type: 'range', default: 0, min: 0, max: 180, step: 1 },
        { key: 'duration', label: 'Duration',        type: 'range', default: 40, min: 4, max: 300, step: 1 },
        { key: 'color',    label: 'Color',           type: 'color', default: '#7fd0ff' },
        { key: 'tex',      label: 'Texture',         type: 'select', default: 'glow_soft', options: TEX_OPTIONS },
    ];
    const LAYER_SCHEMAS = {
        flash: [...COMMON,
            { key: 'size',  label: 'Size',  type: 'range', default: 6, min: 1, max: 30, step: 1 },
            { key: 'alpha', label: 'Alpha', type: 'range', default: 230, min: 20, max: 255, step: 5 },
        ],
        glow: [...COMMON,
            { key: 'size',  label: 'Size',  type: 'range', default: 3, min: 1, max: 20, step: 1 },
            { key: 'alpha', label: 'Alpha', type: 'range', default: 120, min: 10, max: 255, step: 5 },
            { key: 'pulseTo', label: 'Pulse To (0 = off)', type: 'range', default: 0, min: 0, max: 25, step: 1 },
        ],
        shockRing: [...COMMON,
            { key: 'size',  label: 'End Size', type: 'range', default: 8, min: 1, max: 30, step: 1 },
            { key: 'width', label: 'Width',    type: 'range', default: 0.12, min: 0.03, max: 0.5, step: 0.01 },
            { key: 'count', label: 'Rings',    type: 'range', default: 1, min: 1, max: 8, step: 1 },
            { key: 'cadence', label: 'Ring Interval', type: 'range', default: 8, min: 1, max: 60, step: 1 },
        ],
        burst: [...COMMON,
            { key: 'count',  label: 'Particles', type: 'range', default: 20, min: 2, max: 90, step: 1 },
            { key: 'size',   label: 'Particle Size', type: 'range', default: 0.8, min: 0.1, max: 4, step: 0.1 },
            { key: 'speed',  label: 'Speed',    type: 'range', default: 0.06, min: 0.01, max: 0.3, step: 0.01 },
            { key: 'gravity', label: 'Gravity', type: 'range', default: 0.001, min: 0, max: 0.01, step: 0.0005 },
            { key: 'up',     label: 'Upward Bias', type: 'toggle', default: false },
            { key: 'sparkle', label: 'Spark Dust', type: 'toggle', default: true },
        ],
        tendrils: [...COMMON,
            { key: 'count', label: 'Tendrils', type: 'range', default: 6, min: 1, max: 20, step: 1 },
            { key: 'speed', label: 'Drift',    type: 'range', default: 0.05, min: 0.01, max: 0.2, step: 0.005 },
            { key: 'curl',  label: 'Curl',     type: 'range', default: 0.02, min: 0, max: 0.08, step: 0.005 },
            { key: 'tail',  label: 'Tail Length', type: 'range', default: 25, min: 6, max: 80, step: 1 },
            { key: 'width', label: 'Ribbon Width', type: 'range', default: 0.14, min: 0.03, max: 0.6, step: 0.01 },
        ],
        puffs: [...COMMON,
            { key: 'count', label: 'Puffs',  type: 'range', default: 8, min: 2, max: 30, step: 1 },
            { key: 'size',  label: 'Size',   type: 'range', default: 1.6, min: 0.3, max: 6, step: 0.1 },
            { key: 'area',  label: 'Spread', type: 'range', default: 0.8, min: 0.1, max: 4, step: 0.1 },
            { key: 'rise',  label: 'Rise',   type: 'range', default: 0.015, min: 0, max: 0.08, step: 0.005 },
            { key: 'alpha', label: 'Alpha',  type: 'range', default: 120, min: 20, max: 255, step: 5 },
        ],
        motes: [...COMMON,
            { key: 'count',  label: 'Motes',  type: 'range', default: 14, min: 2, max: 60, step: 1 },
            { key: 'size',   label: 'Size',   type: 'range', default: 0.3, min: 0.05, max: 2, step: 0.05 },
            { key: 'radius', label: 'Spawn Radius', type: 'range', default: 1.2, min: 0.1, max: 6, step: 0.1 },
            { key: 'vy',     label: 'Rise Speed', type: 'range', default: 0.012, min: 0, max: 0.08, step: 0.002 },
            { key: 'stream', label: 'Stream Forever', type: 'toggle', default: false },
        ],
    };
    const LAYER_LABELS = {
        flash: 'Flash', glow: 'Glow', shockRing: 'Shock Ring', burst: 'Particle Burst',
        tendrils: 'Tendrils', puffs: 'Smoke Puffs', motes: 'Motes',
    };

    // A quality burst out of the box: staged flash → double ring → sparks
    // with dust → lingering glow + smoke, per the pro grammar.
    const DEFAULT_LAYERS = [
        { kind: 'flash',     start: 0,  duration: 12, color: '#ffffff', tex: 'glow_soft', size: 7, alpha: 240 },
        { kind: 'shockRing', start: 0,  duration: 22, color: '#9fd8ff', tex: 'ring_soft', size: 9, width: 0.1, count: 2, cadence: 6 },
        { kind: 'burst',     start: 1,  duration: 45, color: '#7fd0ff', tex: 'particle_hard', count: 26, size: 0.9, speed: 0.08, gravity: 0.002, up: true, sparkle: true },
        { kind: 'tendrils',  start: 2,  duration: 30, color: '#bfe8ff', tex: 'glow_soft', count: 5, speed: 0.055, curl: 0.03, tail: 22, width: 0.12 },
        { kind: 'glow',      start: 0,  duration: 60, color: '#4f9fdf', tex: 'glow_soft', size: 3.5, alpha: 90 },
        { kind: 'puffs',     start: 8,  duration: 70, color: '#20242c', tex: 'smoke', count: 6, size: 1.8, area: 0.9, rise: 0.02, alpha: 100 },
    ];

    RR_EFK_RECIPE_REGISTRY.push({
        id: 'composer',
        name: 'Custom Effect',
        category: 'Composer',
        composer: { schemas: LAYER_SCHEMAS, labels: LAYER_LABELS, defaults: DEFAULT_LAYERS },
        textures: TEXTURES,
        params: [
            { key: 'layers', label: 'Layers', type: 'layers', default: DEFAULT_LAYERS },
            { key: 'size',   label: 'Overall Scale', type: 'range', default: 10, min: 2, max: 30, step: 1 },
        ],

        build(p) {
            const B = RR_EfkBuilder;
            const U = RR_EfkRecipeUtil;
            const L = RR_EfkLayers;
            const { rf, v3 } = B;
            const layers = Array.isArray(p.layers) && p.layers.length ? p.layers : DEFAULT_LAYERS;

            const nodes = layers
                .filter((ly) => LAYER_SCHEMAS[ly.kind])
                .map((ly) => {
                    const o = { ...ly };
                    delete o.kind;
                    o.tex = Math.max(0, TEXTURES.indexOf(ly.tex || 'glow_soft'));
                    o.color = U.hexToRgba(ly.color || '#7fd0ff');
                    if (ly.kind === 'glow' && !ly.pulseTo) delete o.pulseTo;
                    if (ly.kind === 'burst') {
                        o.up = !!ly.up;
                        if (ly.sparkle) o.dust = { tex: TEXTURES.indexOf('spark'), color: { r: 255, g: 255, b: 255 } };
                        delete o.sparkle;
                    }
                    return L[ly.kind](o);
                });

            const total = Math.max(...layers.map((ly) => (ly.start || 0) + (ly.duration || 30)), 30);
            return [B.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: {
                    translationBindType: 2, rotationBindType: 2, scalingBindType: 2,
                    maxGeneration: 1,
                    life: rf(total + 10),
                    removeWhenChildrenIsExtinct: 1,
                },
                scaling: { type: 0, refEq: -1, scale: v3(p.size * 0.1, p.size * 0.1, p.size * 0.1) },
                children: nodes,
            })];
        },
    });
})();
