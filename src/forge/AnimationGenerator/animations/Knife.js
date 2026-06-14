/**
 * Knife — simpler than the sword: a single tapered blade and a handle.
 * No crossguard. Blade points up (+Y), pointed tip, slightly curved
 * silhouette (the bottom of the blade extends past the handle / Z=0).
 */
function makeKnifeShape() {
    // Blade: tapered from base (around the handle) up to the tip.
    const blade = makeTaperedPrism(
        0, 0,
        /* bottom XZ */ 0.13, 0.04,
        /* top XZ    */ 0.005, 0.005,
        /* y range   */ -0.05, 0.85
    );
    // Handle: longer than the sword's, but no separate pommel.
    const handle = makeBox(0, -0.42, 0, 0.10, 0.7, 0.08);
    return mergeShapes(blade, handle);
}

const KNIFE_SHAPE = makeKnifeShape();

function renderKnifeFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, KNIFE_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'knife',
    name:         'Knife',
    description:  '3D knife — tapered blade and grip handle. Full 3D rotation + texturing.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderKnifeFrame
});
