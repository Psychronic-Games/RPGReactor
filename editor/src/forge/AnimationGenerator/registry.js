/**
 * Animation registry — the central point where each animation file registers
 * itself, and where the AnimationGenerator class reads its catalog from.
 *
 * Globals exposed:
 *   BLEND_MODES                       — canvas blend modes for layer stacking
 *   RR_ANIMATION_REGISTRY             — array each animation file pushes to
 *   RR_CATEGORY_NAMES                 — { categoryId: friendlyName, ... }
 *   buildAnimationCategories()        — groups the registry into the
 *                                       ANIMATION_CATEGORIES shape the
 *                                       AnimationGenerator class consumes
 *
 * Registration shape (what each animation file pushes):
 *   {
 *     categoryId:   'geometric',
 *     id:           'hypercube',
 *     name:         'Hypercube',
 *     description:  '...',
 *     defaultBlend: 'source-over',
 *     params:       [...],
 *     render:       (ctx, w, h, frameIdx, totalFrames, params) => {}
 *   }
 *
 * Load order in index.html:
 *   helpers/*  →  registry.js  →  animations/*  →  AnimationGenerator.js
 */

// ─── Blend modes for layer stacking ─────────────────────────────────────────
// Each layer picks one. 'lighter' (additive) is the natural choice for energy
// effects (fire, electric, light); 'source-over' (normal) for opaque shapes
// and smoke. Canvas 2D supports the full Porter-Duff + filter set.
const BLEND_MODES = [
    { value: 'source-over', label: 'Normal'   },
    { value: 'lighter',     label: 'Add'      },
    { value: 'screen',      label: 'Screen'   },
    { value: 'multiply',    label: 'Multiply' },
    { value: 'overlay',     label: 'Overlay'  },
    { value: 'darken',      label: 'Darken'   },
    { value: 'lighten',     label: 'Lighten'  }
];

// ─── Live registry — animation files push their entries here on load ─────────
const RR_ANIMATION_REGISTRY = [];

// Display names for category IDs. Animation files reference categories by
// id; this is the user-facing label rendered in the UI catalog.
const RR_CATEGORY_NAMES = {
    geometric: 'Geometric',
    elements:  'Elements',
    symbolic:  'Symbolic',
    interface: 'Interface',
    energy:    'Energy',
    object:    'Object',
    effect:    'Effect',
    physical:  'Physical'   // future
};

/**
 * Group the flat registry into the ANIMATION_CATEGORIES shape:
 *   [{ id, name, animations: [{ id, name, description, defaultBlend,
 *      params, render }, ...] }, ...]
 * Preserves push order — animations from the same category appear in the
 * order they were registered.
 */
function buildAnimationCategories() {
    const byCat = new Map();
    for (const entry of RR_ANIMATION_REGISTRY) {
        const catId = entry.categoryId || 'misc';
        if (!byCat.has(catId)) {
            byCat.set(catId, {
                id: catId,
                name: RR_CATEGORY_NAMES[catId] || catId,
                animations: []
            });
        }
        byCat.get(catId).animations.push({
            id:           entry.id,
            name:         entry.name,
            description:  entry.description,
            defaultBlend: entry.defaultBlend || 'source-over',
            // Optional: per-animation list of param keys to skip when the
            // user hits Randomize. Useful for animations where randomizing
            // certain params (e.g. 3D rotation on a UI panel) would break
            // the intended look.
            noRandomize:  entry.noRandomize || [],
            params:       entry.params,
            render:       entry.render
        });
    }
    // Alphabetize: animations within each category, then categories themselves.
    const collator = new Intl.Collator(undefined, { sensitivity: 'base' });
    const cats = Array.from(byCat.values());
    for (const cat of cats) {
        cat.animations.sort((a, b) => collator.compare(a.name, b.name));
    }
    cats.sort((a, b) => collator.compare(a.name, b.name));
    return cats;
}
