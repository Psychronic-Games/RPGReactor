/**
 * Cylinder — rotating cylinder with configurable side count.
 * Texture wraps around the side once.
 *
 * Depends on (globals):
 *   renderCylinderFrame, SHAPE3D_BASE_PARAMS  (helpers/shape3D.js)
 *   RR_ANIMATION_REGISTRY                      (registry.js)
 */
RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'cylinder',
    name:         'Cylinder',
    description:  'Rotating cylinder with configurable side count. Texture wraps around the side once.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params: [
        // All base 3D shape params (color, edgeWidth, scale, glow, tilt X/Y/Z,
        // cycle X/Y/Z), then `sides` inserted before the texture param.
        ...SHAPE3D_BASE_PARAMS.slice(0, 10),
        { key: 'sides', label: 'Sides', type: 'slider', min: 3, max: 32, step: 1, default: 16 },
        SHAPE3D_BASE_PARAMS[10], // texture
        SHAPE3D_BASE_PARAMS[11]  // textureOpacity
    ],
    render: renderCylinderFrame
});
