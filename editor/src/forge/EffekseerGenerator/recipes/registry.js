/**
 * EffekseerGenerator recipe registry.
 *
 * Recipe files (loaded after this script) push entries into
 * RR_EFK_RECIPE_REGISTRY, mirroring the AnimationGenerator registry
 * pattern. A recipe turns a handful of friendly knobs into a full
 * Effekseer node tree via RR_EfkBuilder.
 *
 * Recipe contract:
 *   {
 *     id: 'fire-burst',
 *     name: 'Fire Burst',            // display name (English; i18n later)
 *     category: 'Fire',              // sidebar grouping
 *     textures: ['glow_soft', ...],  // RR_EfkTextures names; index N in this
 *                                    //   array == colorTextureIndex N
 *     params: [                      // schema for the UI panel
 *       { key, label, type: 'color'|'range'|'toggle', default, min?, max?, step? },
 *     ],
 *     build(p) => node[]             // p = { key: value } resolved params;
 *                                    //   returns top-level nodes for makeEffect
 *   }
 */

const RR_EFK_RECIPE_REGISTRY = [];

const RR_EfkRecipeUtil = {
    /** '#ff7722' (+ optional alpha 0-255) → {r,g,b,a} */
    hexToRgba(hex, a = 255) {
        const h = hex.replace('#', '');
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
            a,
        };
    },

    /** Fixed-color AllTypeColor. */
    fixedColor(rgba) { return { type: 0, fixed: rgba }; },

    /** Random-range AllTypeColor — per-particle color variance (the
     *  professional effect packs use this heavily). */
    randColor(min, max) { return { type: 1, random: { mode: 0, _reserved: 0, max, min } }; },

    /** Easing AllTypeColor from one rgba to another (linear ease). */
    easeColor(from, to) {
        const rc = (c) => ({ mode: 0, _reserved: 0, max: c, min: c });
        return { type: 2, easing: { start: rc(from), end: rc(to), params: [0, 0, 1] } };
    },

    /** Scale a color's brightness, keeping alpha. */
    dim(rgba, f) {
        return {
            r: Math.round(rgba.r * f),
            g: Math.round(rgba.g * f),
            b: Math.round(rgba.b * f),
            a: rgba.a,
        };
    },

    /** Resolve a recipe's params array + user values into {key: value}. */
    resolveParams(recipe, values = {}) {
        const out = {};
        for (const s of recipe.params) out[s.key] = values[s.key] ?? s.default;
        return out;
    },
};

function buildEfkRecipeCategories() {
    // Alphabetize categories and recipes within each, matching the
    // standard Animation Generator's sidebar ordering.
    const categories = new Map();
    for (const r of RR_EFK_RECIPE_REGISTRY) {
        if (!categories.has(r.category)) categories.set(r.category, []);
        categories.get(r.category).push(r);
    }
    const sorted = new Map();
    for (const cat of [...categories.keys()].sort((a, b) => a.localeCompare(b))) {
        sorted.set(cat, categories.get(cat).slice().sort((a, b) => a.name.localeCompare(b.name)));
    }
    return sorted;
}
