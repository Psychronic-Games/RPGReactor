/**
 * Sword — composed of four primitives:
 *   - Blade: tapered prism narrowing to a point at the top
 *   - Crossguard: short wide box perpendicular to the blade
 *   - Handle (grip): narrow box below the crossguard
 *   - Pommel: octahedron at the bottom end of the handle
 *
 * Blade points up (+Y); the whole sword fits roughly in [-1, 1]³.
 */
function makeSwordShape() {
    // Blade: long tapered prism from y = +0.05 (just above crossguard) up
    // to a sharp point. Proper longsword proportions — blade is ~3.5× the
    // hilt length. XZ tapers from base width down to near-zero at the tip.
    const blade = makeTaperedPrism(
        0, 0,
        /* bottom XZ */ 0.11, 0.025,
        /* top XZ    */ 0.005, 0.005,
        /* y range   */ 0.05, 1.85
    );
    // Crossguard: wide thin slab at y ≈ 0.
    const crossguard = makeBox(0, 0, 0, 0.55, 0.07, 0.06);
    // Handle (grip): below crossguard.
    const handle = makeBox(0, -0.28, 0, 0.07, 0.5, 0.06);
    // Pommel: small octahedron at the base.
    const pommel = makeOctahedron(0, -0.58, 0, 0.10, 0.10, 0.10);
    return mergeShapes(blade, crossguard, handle, pommel);
}

const SWORD_SHAPE = makeSwordShape();

function renderSwordFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, SWORD_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'sword',
    name:         'Sword',
    description:  '3D sword with tapered blade, crossguard, handle, and octahedral pommel. Full 3D rotation + texturing.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderSwordFrame
});
