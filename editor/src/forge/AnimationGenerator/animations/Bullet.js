/**
 * Bullet — a real cylindrical projectile with a curved ogive nose.
 *
 * Built as a "lathe": a stack of N-sided polygonal rings whose radius
 * follows the bullet's profile curve along the Y axis. Body rings are
 * full radius; nose rings follow an ogive curve r(t) = R · sqrt(1 − t²)
 * for the iconic rounded-cone tip. Adjacent rings are joined by quad
 * side faces. The very tip is a triangle fan from the last ring to a
 * single apex vertex, and the back is closed with a triangle fan from
 * the base ring to a centre vertex.
 *
 * Texturing: the body+nose wraps the texture once horizontally (U around
 * the cylinder, j/SIDES per segment) and once vertically (V along the Y
 * length, 1 at the base and 0 at the tip), so a generic skin reads as a
 * cylindrical wrap. The base cap uses radial disc projection so circular
 * textures appear as a circle on the bottom.
 *
 * Face winding is CCW from outside (every face's e1×e2 normal points
 * radially outward from the bullet's surface) so render3DShape's
 * backface cull keeps the camera-facing half visible and discards the
 * far side.
 */
function makeBulletShape() {
    const SIDES = 14;
    const NOSE_RINGS = 8;
    const bodyR = 0.16;
    const bodyY0 = -0.55;
    const bodyY1 = 0.10;
    const tipY = 0.95;
    const noseLen = tipY - bodyY1;
    const totalY = tipY - bodyY0;

    // Build ring (y, r) descriptors.
    const rings = [
        { y: bodyY0, r: bodyR },
        { y: bodyY1, r: bodyR }
    ];
    for (let k = 1; k <= NOSE_RINGS; k++) {
        const t = k / (NOSE_RINGS + 1);
        const y = bodyY1 + t * noseLen;
        const r = bodyR * Math.sqrt(Math.max(0.0001, 1 - t * t));
        rings.push({ y, r });
    }

    const verts = [];
    const edges = [];
    const faces = [];

    // V coordinate per ring — 1 at the base, 0 at the tip.
    const vForY = (y) => 1 - (y - bodyY0) / totalY;

    // Emit ring vertices.
    const ringStart = new Array(rings.length);
    for (let k = 0; k < rings.length; k++) {
        ringStart[k] = verts.length;
        const { y, r } = rings[k];
        for (let j = 0; j < SIDES; j++) {
            const a = (j / SIDES) * Math.PI * 2;
            verts.push([r * Math.cos(a), y, r * Math.sin(a)]);
        }
    }

    const tipIdx = verts.length;
    verts.push([0, tipY, 0]);
    const baseCenterIdx = verts.length;
    verts.push([0, bodyY0, 0]);

    // Side quads — CCW from outside. Vertex order is bottom-left →
    // top-left → top-right → bottom-right, matching the working
    // cylinder helper. UVs are per-segment so the texture wraps once
    // around horizontally; V follows ring Y so it stretches once
    // vertically over the full bullet length.
    for (let k = 0; k < rings.length - 1; k++) {
        const v0 = vForY(rings[k].y);     // lower ring
        const v1 = vForY(rings[k + 1].y); // upper ring
        for (let j = 0; j < SIDES; j++) {
            const jn = (j + 1) % SIDES;
            const u0 = j / SIDES;
            const u1 = (j + 1) / SIDES;
            const a = ringStart[k]     + j;
            const b = ringStart[k]     + jn;
            const c = ringStart[k + 1] + jn;
            const d = ringStart[k + 1] + j;
            faces.push({
                verts: [a, d, c, b],
                uvs:   [[u0, v0], [u0, v1], [u1, v1], [u1, v0]]
            });
            edges.push([a, b]);     // around the lower ring
            edges.push([a, d]);     // vertical seam between rings
        }
    }

    // Tip triangle fan — last ring → apex. Winding [a, tip, b] makes
    // e1 × e2 point radially outward + upward (the cone's outward
    // normal), so the camera-facing tip facets stay visible.
    const lastK = rings.length - 1;
    const vTip = vForY(rings[lastK].y);
    for (let j = 0; j < SIDES; j++) {
        const jn = (j + 1) % SIDES;
        const u0 = j / SIDES;
        const u1 = (j + 1) / SIDES;
        const a = ringStart[lastK] + j;
        const b = ringStart[lastK] + jn;
        faces.push({
            verts: [a, tipIdx, b],
            uvs:   [[u0, vTip], [(u0 + u1) / 2, 0], [u1, vTip]]
        });
        edges.push([a, b]);
        edges.push([a, tipIdx]);
    }

    // Base triangle fan — base ring → centre, winding [a, b, centre]
    // yields a -Y outward normal. UVs use radial disc projection so a
    // circular texture appears as a disc on the bottom cap.
    for (let j = 0; j < SIDES; j++) {
        const jn = (j + 1) % SIDES;
        const aj = (j  / SIDES) * Math.PI * 2;
        const aj1 = (jn / SIDES) * Math.PI * 2;
        const a = ringStart[0] + j;
        const b = ringStart[0] + jn;
        faces.push({
            verts: [a, b, baseCenterIdx],
            uvs:   [
                [0.5 + 0.5 * Math.cos(aj),  0.5 + 0.5 * Math.sin(aj)],
                [0.5 + 0.5 * Math.cos(aj1), 0.5 + 0.5 * Math.sin(aj1)],
                [0.5, 0.5]
            ]
        });
    }

    return { verts, edges, faces };
}

const BULLET_SHAPE = makeBulletShape();

function renderBulletFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, BULLET_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'bullet',
    name:         'Bullet',
    description:  '3D bullet — true cylindrical body (14-sided lathe) capped with a curved ogive nose. Brass/copper colour by default. Full 3D rotation, lighting, and texturing.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS.map(p => p.key === 'color' ? { ...p, default: '#d49340' } : p),
    render:       renderBulletFrame
});
