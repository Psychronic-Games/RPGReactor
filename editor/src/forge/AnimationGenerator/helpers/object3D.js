/**
 * Object3D — mesh-building helpers for the Object animation category.
 *
 * Each Object animation (Egg, Sword, Knife, Hammer, Rock, Arrow, Coin,
 * Crown, etc.) builds its mesh by composing primitives from this file,
 * then renders through the shared render3DShape pipeline. The output shape
 * has the same `{ verts, edges, faces }` structure as Cube/Pyramid so all
 * the existing infrastructure (3D rotation, gizmo, textures, glow,
 * backface culling, depth sort) just works.
 *
 * Vertex layout matches makeCube exactly so face winding is consistent:
 *   0–3 are the four corners of the back face (z = z0), going CCW
 *   4–7 are the four corners of the front face (z = z1), going CCW
 *
 * Globals exposed:
 *   makeBox(cx, cy, cz, sx, sy, sz)
 *     Axis-aligned cuboid centered at (cx, cy, cz) with dimensions (sx, sy, sz).
 *
 *   makeTaperedPrism(cx, cz, sxBot, szBot, sxTop, szTop, yBot, yTop)
 *     Box with different XZ size at the top (yTop) vs bottom (yBot). Great
 *     for sword blades, arrow heads, hammer claws, etc.
 *
 *   mergeShapes(...shapes)
 *     Combine multiple shapes into one. Edges + faces have their vertex
 *     indices offset so all geometry shares a single vertex array.
 *
 *   makeOctahedron(cx, cy, cz, rx, ry, rz)
 *     6-vertex 8-face shape — useful for compact pommels, gem cores, etc.
 */

function makeBox(cx, cy, cz, sx, sy, sz) {
    const x0 = cx - sx * 0.5, x1 = cx + sx * 0.5;
    const y0 = cy - sy * 0.5, y1 = cy + sy * 0.5;
    const z0 = cz - sz * 0.5, z1 = cz + sz * 0.5;
    const verts = [
        [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], // back (z=z0)
        [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]  // front (z=z1)
    ];
    const edges = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7]
    ];
    const fullUV = [[0,0],[1,0],[1,1],[0,1]];
    const faces = [
        { verts: [4,5,6,7], uvs: fullUV }, // front (+z)
        { verts: [1,0,3,2], uvs: fullUV }, // back  (-z)
        { verts: [5,1,2,6], uvs: fullUV }, // right (+x)
        { verts: [0,4,7,3], uvs: fullUV }, // left  (-x)
        { verts: [7,6,2,3], uvs: fullUV }, // top   (+y)
        { verts: [4,0,1,5], uvs: fullUV }  // bottom(-y)
    ];
    return { verts, edges, faces };
}

function makeTaperedPrism(cx, cz, sxBot, szBot, sxTop, szTop, yBot, yTop) {
    // Vertex layout matches makeCube. Bottom 4 corners are y=yBot, top 4
    // are y=yTop. XZ dimensions can differ between top and bottom.
    const verts = [
        [cx - sxBot * 0.5, yBot, cz - szBot * 0.5], // 0
        [cx + sxBot * 0.5, yBot, cz - szBot * 0.5], // 1
        [cx + sxTop * 0.5, yTop, cz - szTop * 0.5], // 2
        [cx - sxTop * 0.5, yTop, cz - szTop * 0.5], // 3
        [cx - sxBot * 0.5, yBot, cz + szBot * 0.5], // 4
        [cx + sxBot * 0.5, yBot, cz + szBot * 0.5], // 5
        [cx + sxTop * 0.5, yTop, cz + szTop * 0.5], // 6
        [cx - sxTop * 0.5, yTop, cz + szTop * 0.5]  // 7
    ];
    const edges = [
        [0,1],[1,2],[2,3],[3,0],
        [4,5],[5,6],[6,7],[7,4],
        [0,4],[1,5],[2,6],[3,7]
    ];
    const fullUV = [[0,0],[1,0],[1,1],[0,1]];
    const faces = [
        { verts: [4,5,6,7], uvs: fullUV },
        { verts: [1,0,3,2], uvs: fullUV },
        { verts: [5,1,2,6], uvs: fullUV },
        { verts: [0,4,7,3], uvs: fullUV },
        { verts: [7,6,2,3], uvs: fullUV },
        { verts: [4,0,1,5], uvs: fullUV }
    ];
    return { verts, edges, faces };
}

function makeOctahedron(cx, cy, cz, rx, ry, rz) {
    // 6 verts (one on each ±X / ±Y / ±Z axis), 8 triangular faces, 12 edges.
    const verts = [
        [cx + rx, cy,     cz    ], // 0 +X
        [cx - rx, cy,     cz    ], // 1 -X
        [cx,     cy + ry, cz    ], // 2 +Y
        [cx,     cy - ry, cz    ], // 3 -Y
        [cx,     cy,     cz + rz], // 4 +Z
        [cx,     cy,     cz - rz]  // 5 -Z
    ];
    const edges = [
        [0,2],[2,1],[1,3],[3,0], // around equator
        [0,4],[2,4],[1,4],[3,4], // top hat
        [0,5],[2,5],[1,5],[3,5]  // bottom hat
    ];
    const fullUV = [[0,0],[1,0],[0.5,1]];
    const faces = [
        // Each face is a triangle. Wind CCW from outside (right-hand rule).
        { verts: [0,2,4], uvs: fullUV }, // +X +Y +Z
        { verts: [2,1,4], uvs: fullUV }, // -X +Y +Z
        { verts: [1,3,4], uvs: fullUV }, // -X -Y +Z
        { verts: [3,0,4], uvs: fullUV }, // +X -Y +Z
        { verts: [2,0,5], uvs: fullUV }, // +X +Y -Z
        { verts: [1,2,5], uvs: fullUV }, // -X +Y -Z
        { verts: [3,1,5], uvs: fullUV }, // -X -Y -Z
        { verts: [0,3,5], uvs: fullUV }  // +X -Y -Z
    ];
    return { verts, edges, faces };
}

// OBJECT_BASE_PARAMS — currently identical to SHAPE3D_BASE_PARAMS. Both
// objects (sword, hammer, arrow, etc.) and geometric primitives default
// to cycY=1 so they gently spin on a yaw axis the moment the user picks
// one — gives an immediate sense of the 3D form. Users can drop cycY to
// 0 if they want a static pose.
const OBJECT_BASE_PARAMS = SHAPE3D_BASE_PARAMS;

// Param keys that object animations should skip when the user hits
// Randomize. centerX/centerY default to 0.5 (frame center); randomizing
// them often kicks the object off-screen which isn't the intent of the
// Randomize button. Object animations spread this list into their own
// `noRandomize` field on the registry entry.
const OBJECT_NO_RANDOMIZE = ['centerX', 'centerY'];

function mergeShapes(...shapes) {
    const result = { verts: [], edges: [], faces: [] };
    for (const sh of shapes) {
        if (!sh) continue;
        const offset = result.verts.length;
        for (const v of sh.verts) result.verts.push(v);
        for (const [a, b] of sh.edges) result.edges.push([a + offset, b + offset]);
        for (const f of sh.faces) {
            result.faces.push({
                verts: f.verts.map(v => v + offset),
                uvs: f.uvs
            });
        }
    }
    return result;
}
