/**
 * 4D and 3D rotation primitives used by Hypercube (4D tesseract) and the
 * generic 3D shape renderers.
 *
 * Globals exposed:
 *   rotXW(v, a)   rotZW(v, a)   rotXZ(v, a)   rotYZ(v, a)   rotXY(v, a)
 *   project4D(v, d4, d3)
 *
 * Vector format: 3D = [x, y, z]; 4D = [x, y, z, w]. The 3-axis rotations
 * accept either (they treat the 4th component as 0 if absent) so 4D
 * vectors can flow through 3D rotations after dimensional projection.
 */

function rotXW(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0]*c - v[3]*s, v[1], v[2], v[0]*s + v[3]*c]; }
function rotZW(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1], v[2]*c - v[3]*s, v[2]*s + v[3]*c]; }
function rotXZ(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0]*c - v[2]*s, v[1], v[0]*s + v[2]*c, v[3]||0]; }
function rotYZ(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c, v[3]||0]; }
function rotXY(v, a) { const c = Math.cos(a), s = Math.sin(a); return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2], v[3]||0]; }

/**
 * Project a 4D point through perspective onto 2D screen coords.
 * d4 = 4D viewing distance (controls 4D perspective foreshortening).
 * d3 = 3D viewing distance (controls 3D perspective foreshortening).
 * Returns { x, y, depth } where depth is the 3D z used for back-to-front sort.
 */
function project4D(v, d4, d3) {
    const w = d4 - v[3];
    const s4 = w > 0.15 ? d4 / w : d4 / 0.15;
    const x3 = v[0]*s4, y3 = v[1]*s4, z3 = v[2]*s4;
    const dz = d3 - z3;
    const s3 = dz > 0.15 ? d3 / dz : d3 / 0.15;
    return { x: x3*s3, y: y3*s3, depth: z3 };
}
