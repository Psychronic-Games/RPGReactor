/**
 * Scythe — grim-reaper style. A vertical snath (handle) with a long
 * horizontal tapered blade attached at the top, sweeping leftward to a
 * sharp point. The blade is built by rotating a Y-tapered prism 90° around
 * Z so it tapers along X (snath → tip) instead of Y.
 */
/**
 * Build the curved scythe blade as a swept tube. N+1 cross-sections are
 * sampled along an arc; adjacent cross-sections are connected by 4 quad
 * faces (cutting edge, back of blade, front side, back side).
 *
 * The arc center sits ABOVE the blade so the blade curves upward as it
 * sweeps leftward from the snath — that's the iconic sickle silhouette.
 * Inner radial side = cutting edge; outer radial side = back of blade.
 */
function makeCurvedScytheBlade() {
    const N = 14;
    const arcCx = 0.35;    // x of arc center (directly below the snath attach point)
    const arcCy = 0.15;    // y of arc center (BELOW the blade — blade curves DOWN)
    const arcR  = 0.70;    // arc radius
    const thetaStart = Math.PI / 2;    // root is directly above center (top of arc)
    const thetaEnd   = Math.PI;        // tip is directly left of center
    // With these settings the blade sweeps from root (0.35, 0.85) down and
    // leftward to the razor tip at (-0.35, 0.15) — classic grim-reaper
    // sickle shape. The cutting edge is on the INNER (lower) side of the
    // arc, facing the ground.

    const verts = [];
    const edges = [];
    const faces = [];

    for (let i = 0; i <= N; i++) {
        const u = i / N;
        const theta = thetaStart + u * (thetaEnd - thetaStart);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        // Arc sample point.
        const sx = arcCx + arcR * cosT;
        const sy = arcCy + arcR * sinT;
        // Cross-section dimensions taper non-linearly toward the tip
        // (slower at first, sharply at the end) so the blade keeps a
        // decent width before converging to a razor point.
        const taper = Math.pow(1 - u * 0.97, 0.7);
        const height = 0.20 * taper;   // edge ↔ back of blade
        const depth  = 0.040 * taper;  // side ↔ side
        // 4 corners per cross-section:
        //   +0 cutting edge, -Z side (inner-radial, back-side)
        //   +1 cutting edge, +Z side
        //   +2 back of blade, +Z side
        //   +3 back of blade, -Z side
        verts.push([sx - cosT * height * 0.5, sy - sinT * height * 0.5, -depth * 0.5]);
        verts.push([sx - cosT * height * 0.5, sy - sinT * height * 0.5,  depth * 0.5]);
        verts.push([sx + cosT * height * 0.5, sy + sinT * height * 0.5,  depth * 0.5]);
        verts.push([sx + cosT * height * 0.5, sy + sinT * height * 0.5, -depth * 0.5]);
    }

    const fullUV = [[0,0],[1,0],[1,1],[0,1]];
    for (let i = 0; i < N; i++) {
        const a = 4 * i;
        const b = 4 * (i + 1);
        // Cross-section edges + connectors.
        edges.push([a, a+1], [a+1, a+2], [a+2, a+3], [a+3, a]);
        edges.push([a, b], [a+1, b+1], [a+2, b+2], [a+3, b+3]);
        // Side faces — CCW from outside. Verified by checking sample-0 normal
        // points -radial for the cutting-edge face (which is the inner side).
        faces.push({ verts: [a,   b,   b+1, a+1], uvs: fullUV }); // cutting edge (-radial)
        faces.push({ verts: [a+1, b+1, b+2, a+2], uvs: fullUV }); // front side (+Z)
        faces.push({ verts: [a+2, b+2, b+3, a+3], uvs: fullUV }); // back of blade (+radial)
        faces.push({ verts: [a+3, b+3, b,   a  ], uvs: fullUV }); // back side (-Z)
    }
    // Last cross-section edges.
    const last = 4 * N;
    edges.push([last, last+1], [last+1, last+2], [last+2, last+3], [last+3, last]);

    // Tip cap.
    faces.push({ verts: [last, last+1, last+2, last+3], uvs: fullUV });
    // Root cap (reversed winding so it faces the snath, not away).
    faces.push({ verts: [3, 2, 1, 0], uvs: fullUV });

    return { verts, edges, faces };
}

function makeScytheShape() {
    // Snath: tall thin vertical box on the right side of the frame.
    const snath = makeBox(0.4, 0, 0, 0.085, 1.75, 0.085);
    // Decorative collar where the blade meets the snath.
    const collar = makeBox(0.35, 0.85, 0, 0.18, 0.10, 0.18);
    // Curved blade.
    const blade = makeCurvedScytheBlade();
    // The curved-tube blade has non-planar quad faces in places — set
    // doubleSided so backface culling can't mistakenly hide the curving
    // body when viewed at certain angles.
    const merged = mergeShapes(snath, collar, blade);
    merged.doubleSided = true;
    return merged;
}

const SCYTHE_SHAPE = makeScytheShape();

function renderScytheFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, SCYTHE_SHAPE);
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'object',
    id:           'scythe',
    name:         'Scythe',
    description:  'Grim-reaper scythe — vertical snath with a long horizontal tapered blade sweeping leftward to a razor point.',
    defaultBlend: 'source-over',
    noRandomize:  [...OBJECT_NO_RANDOMIZE],
    params:       OBJECT_BASE_PARAMS,
    render:       renderScytheFrame
});
