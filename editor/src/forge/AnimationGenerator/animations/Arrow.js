/**
 * Arrow — long thin shaft, pointed arrowhead at the top (+Y), and four
 * fletchings (vanes) at the bottom (-Y) in a + pattern. The shaft is a
 * narrow box, the arrowhead is a tapered prism converging to a point,
 * the fletchings are short wide thin boxes.
 */
function makeArrowShape() {
    // Shaft: long thin box along Y.
    const shaft = makeBox(0, 0, 0, 0.05, 1.5, 0.05);

    // Arrowhead: tapered prism from base (just above shaft) to a point.
    const head = makeTaperedPrism(
        0, 0,
        /* bottom XZ */ 0.18, 0.05,
        /* top XZ    */ 0.005, 0.005,
        /* y range   */ 0.72, 1.00
    );

    // Fletchings: four thin slabs forming a + cross at the tail.
    const fletchH = makeBox(0, -0.75, 0, 0.32, 0.20, 0.02); // horizontal vanes (along X)
    const fletchV = makeBox(0, -0.75, 0, 0.02, 0.20, 0.32); // vertical vanes (along Z)

    return mergeShapes(shaft, head, fletchH, fletchV);
}

const ARROW_SHAPE = makeArrowShape();

function renderArrowFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, ARROW_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'arrow',
    name:         'Arrow',
    description:  '3D arrow — shaft, pointed arrowhead, and four-vane fletching. Full 3D rotation + texturing.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderArrowFrame
});
