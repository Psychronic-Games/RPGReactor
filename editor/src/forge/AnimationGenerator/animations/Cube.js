/**
 * Cube — rotating wireframe cube. Texture wraps the 6 faces.
 *
 * Depends on (globals):
 *   renderCubeFrame, SHAPE3D_BASE_PARAMS  (helpers/shape3D.js)
 *   RR_ANIMATION_REGISTRY                  (registry.js)
 */
RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'cube',
    name:         'Cube',
    description:  'Rotating wireframe cube. Attach a texture to wrap it around the 6 faces.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params:       SHAPE3D_BASE_PARAMS,
    render:       renderCubeFrame
});
