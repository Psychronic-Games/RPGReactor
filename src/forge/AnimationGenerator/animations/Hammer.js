/**
 * Hammer — chunky head box on top of a long handle. The head is wider
 * along X (the striking face) than along Z. Handle hangs down (-Y).
 */
function makeHammerShape() {
    // Head: wide chunky box at the top.
    const head = makeBox(0, 0.7, 0, 0.7, 0.4, 0.3);
    // Handle: long thin box from head down.
    const handle = makeBox(0, -0.05, 0, 0.10, 1.1, 0.10);
    return mergeShapes(head, handle);
}

const HAMMER_SHAPE = makeHammerShape();

function renderHammerFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, HAMMER_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'hammer',
    name:         'Hammer',
    description:  '3D hammer — chunky head + long handle. Full 3D rotation + texturing.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderHammerFrame
});
