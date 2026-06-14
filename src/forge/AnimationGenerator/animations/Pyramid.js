/**
 * Pyramid — rotating square-base pyramid. Texture wraps on each side.
 *
 * Depends on (globals):
 *   renderPyramidFrame, SHAPE3D_BASE_PARAMS  (helpers/shape3D.js)
 *   RR_ANIMATION_REGISTRY                     (registry.js)
 */
RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'pyramid',
    name:         'Pyramid',
    description:  'Rotating square-base pyramid. Texture wraps on each side.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params:       SHAPE3D_BASE_PARAMS,
    render:       renderPyramidFrame
});
