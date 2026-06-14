/**
 * Generic 3D shape geometry + renderer shared by Cube, Pyramid, Cylinder.
 *
 * Depends on (loaded earlier as globals):
 *   hexWithAlpha           (helpers/color.js)
 *   drawTexturedTriangle   (helpers/texture.js)
 *
 * Globals exposed:
 *   makeCube()              → { verts, edges, faces }
 *   makePyramid()           → { verts, edges, faces }
 *   makeCylinder(sides)     → { verts, edges, faces }
 *   render3DShape(ctx, w, h, frameIdx, totalFrames, params, shape)
 *   CUBE_SHAPE              pre-built cube geometry
 *   PYRAMID_SHAPE           pre-built pyramid geometry
 *   SHAPE3D_BASE_PARAMS     shared param schema for 3D shape animations
 *   renderCubeFrame, renderPyramidFrame, renderCylinderFrame
 *
 * Shape format: { verts: [[x,y,z],...], edges: [[i,j],...],
 *                 faces: [{verts:[...], uvs:[...]},...] }
 * where each face's verts is a list of vertex indices in CCW order (viewed
 * from outside) and uvs is the same-length list of [u,v] texture coords.
 */

// ─── Shape generators ───────────────────────────────────────────────────────
function makeCube() {
    const verts = [
        [-1, -1, -1], [ 1, -1, -1], [ 1,  1, -1], [-1,  1, -1], // back
        [-1, -1,  1], [ 1, -1,  1], [ 1,  1,  1], [-1,  1,  1]  // front
    ];
    const edges = [
        [0,1],[1,2],[2,3],[3,0],     // back face
        [4,5],[5,6],[6,7],[7,4],     // front face
        [0,4],[1,5],[2,6],[3,7]      // connectors
    ];
    // 6 faces, each a quad with full-texture UV
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

function makePyramid() {
    // Square-base pyramid: 4 base corners + 1 apex.
    const verts = [
        [-1, -1, -1], [ 1, -1, -1], [ 1, -1,  1], [-1, -1,  1], // base (y=-1)
        [ 0,  1,  0] // apex
    ];
    const edges = [
        [0,1],[1,2],[2,3],[3,0],  // base
        [0,4],[1,4],[2,4],[3,4]   // apex spokes
    ];
    // 4 triangular sides + 1 square base.
    const triUV = [[0,1],[1,1],[0.5,0]];
    const fullUV = [[0,0],[1,0],[1,1],[0,1]];
    const faces = [
        { verts: [3,2,4], uvs: triUV }, // front side (+z)
        { verts: [1,0,4], uvs: triUV }, // back side  (-z)
        { verts: [2,1,4], uvs: triUV }, // right side (+x)
        { verts: [0,3,4], uvs: triUV }, // left side  (-x)
        { verts: [0,1,2,3], uvs: fullUV } // base (y=-1, facing down)
    ];
    return { verts, edges, faces };
}

function makeCylinder(sides) {
    sides = Math.max(3, Math.round(sides));
    const verts = [];
    for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        verts.push([Math.cos(a), -1, Math.sin(a)]); // bottom ring
    }
    for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        verts.push([Math.cos(a),  1, Math.sin(a)]); // top ring
    }
    const edges = [];
    for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        edges.push([i, ni]);                       // bottom ring
        edges.push([i + sides, ni + sides]);       // top ring
        edges.push([i, i + sides]);                // vertical
    }
    // Side faces: one quad per segment, texture wraps once around horizontally.
    // Vertex order is CCW viewed from OUTSIDE (bottom-left → top-left →
    // top-right → bottom-right) so the computed normal points outward.
    const faces = [];
    for (let i = 0; i < sides; i++) {
        const ni = (i + 1) % sides;
        const u0 = i / sides, u1 = (i + 1) / sides;
        faces.push({
            verts: [i, i + sides, ni + sides, ni],
            uvs:   [[u0, 1], [u0, 0], [u1, 0], [u1, 1]]
        });
    }

    // End caps — bottom (y=-1, normal -Y) and top (y=+1, normal +Y). Each cap
    // is a polygon with a CENTER vertex first so render3DShape's fan-from-v0
    // triangulation gives a proper disc fan (center → ring0 → ring1 → … →
    // ringN-1 → ring0, with the first ring vertex duplicated at the end to
    // close the fan back to the start). UV is a radial disc projection so the
    // texture appears as a circle on each cap.
    const botCenter = verts.length;  verts.push([0, -1, 0]);
    const topCenter = verts.length;  verts.push([0,  1, 0]);

    // Bottom cap: traverse with INCREASING theta (i=0 to sides-1) so the
    // cross product of (ring[1]-center) × (ring[2]-center) points in -Y.
    // The right-hand rule with our XZ-plane geometry says CCW-from-above
    // iteration produces a normal pointing DOWN (away from the cylinder
    // interior, which is what we want for backface culling).
    const botFaceVerts = [botCenter];
    const botFaceUVs   = [[0.5, 0.5]];
    for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        botFaceVerts.push(i);
        botFaceUVs.push([0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5]);
    }
    // Close the fan by repeating the first ring vertex.
    botFaceVerts.push(0);
    botFaceUVs.push([1.0, 0.5]);  // theta=0 → cos=1, sin=0 → (1.0, 0.5)
    faces.push({ verts: botFaceVerts, uvs: botFaceUVs });

    // Top cap: traverse with DECREASING theta (i=sides-1 to 0) so normal
    // points +Y (up, away from cylinder interior).
    const topFaceVerts = [topCenter];
    const topFaceUVs   = [[0.5, 0.5]];
    for (let i = sides - 1; i >= 0; i--) {
        const a = (i / sides) * Math.PI * 2;
        topFaceVerts.push(i + sides);
        topFaceUVs.push([0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5]);
    }
    topFaceVerts.push((sides - 1) + sides);
    const lastA = ((sides - 1) / sides) * Math.PI * 2;
    topFaceUVs.push([0.5 + Math.cos(lastA) * 0.5, 0.5 + Math.sin(lastA) * 0.5]);
    faces.push({ verts: topFaceVerts, uvs: topFaceUVs });

    return { verts, edges, faces };
}

// ─── Generic 3D shape renderer (wireframe + optional texture) ────────────────
function render3DShape(ctx, w, h, frameIdx, totalFrames, params, shape) {
    const t = (frameIdx / totalFrames) * Math.PI * 2;
    ctx.clearRect(0, 0, w, h);

    const cx = w * ((params.centerX !== undefined) ? params.centerX : 0.5), cy = h * ((params.centerY !== undefined) ? params.centerY : 0.5);
    const radius = Math.min(w, h) * 0.5 * params.scale;
    const color = params.color;
    const edgeWidth = params.edgeWidth;
    const glow = params.glow;
    const cycX = Math.round(params.cycX || 0);
    const cycY = Math.round(params.cycY || 0);
    const cycZ = Math.round(params.cycZ || 0);
    // Static tilt angles (degrees) — set initial orientation. Combined into
    // the rotation by adding the tilt onto the per-frame angle.
    const tiltX = (params.tiltX || 0) * Math.PI / 180;
    const tiltY = (params.tiltY || 0) * Math.PI / 180;
    const tiltZ = (params.tiltZ || 0) * Math.PI / 180;

    // Two-stage transform:
    //   1) Apply ROTATION CYCLES around the shape's LOCAL axes first (so a
    //      tilted shape rotates around its own axes — natural intuition).
    //   2) Apply TILTS as a static view-orientation transform afterward.
    // This matches the Sphere renderer's convention (spin-then-tilt) and
    // means tilting a Torus or Cylinder makes the spin visually follow the
    // new orientation, rather than always spinning around the world axes.
    const cosRX = Math.cos(t * cycX), sinRX = Math.sin(t * cycX);
    const cosRY = Math.cos(t * cycY), sinRY = Math.sin(t * cycY);
    const cosRZ = Math.cos(t * cycZ), sinRZ = Math.sin(t * cycZ);
    const cosTX = Math.cos(tiltX),    sinTX = Math.sin(tiltX);
    const cosTY = Math.cos(tiltY),    sinTY = Math.sin(tiltY);
    const cosTZ = Math.cos(tiltZ),    sinTZ = Math.sin(tiltZ);

    const transform = (v) => {
        let x = v[0], y = v[1], z = v[2];
        // 1a) Animated rotation around local X (YZ plane).
        let y1 = y * cosRX - z * sinRX;
        let z1 = y * sinRX + z * cosRX;
        y = y1; z = z1;
        // 1b) Animated rotation around local Y (XZ plane).
        let x2 = x * cosRY + z * sinRY;
        let z2 = -x * sinRY + z * cosRY;
        x = x2; z = z2;
        // 1c) Animated rotation around local Z (XY plane).
        let x3 = x * cosRZ - y * sinRZ;
        let y3 = x * sinRZ + y * cosRZ;
        x = x3; y = y3;
        // 2a) Static tilt around X (view pitch).
        let y4 = y * cosTX - z * sinTX;
        let z4 = y * sinTX + z * cosTX;
        y = y4; z = z4;
        // 2b) Static tilt around Y (view yaw).
        let x5 = x * cosTY + z * sinTY;
        let z5 = -x * sinTY + z * cosTY;
        x = x5; z = z5;
        // 2c) Static tilt around Z (view roll).
        let x6 = x * cosTZ - y * sinTZ;
        let y6 = x * sinTZ + y * cosTZ;
        x = x6; y = y6;
        return [x, y, z];
    };

    // Canvas has +Y pointing DOWN — invert so world +Y points UP on screen.
    // This makes pyramid apex (at world y=+1) appear ABOVE center rather than below.
    const project = (v) => {
        const d = 3.5;
        const dz = d - v[2];
        const s = dz > 0.15 ? d / dz : d / 0.15;
        return { x: cx + v[0] * radius * s, y: cy - v[1] * radius * s, depth: v[2] };
    };

    // Rotate all vertices once.
    const rotated = shape.verts.map(transform);
    const projected = rotated.map(project);

    // Glow halo — two-pass radiant aura. Outer is large + soft for atmospheric
    // reach, inner is brighter + tighter for concentrated heat. Both alphas
    // scale with `glow` so the slider's high end actually pops.
    if (glow > 0.01) {
        // Outer halo: large gradient extending well past the shape
        const outer = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius * 2.2);
        outer.addColorStop(0,   hexWithAlpha(color, 0.40 * glow));
        outer.addColorStop(0.5, hexWithAlpha(color, 0.18 * glow));
        outer.addColorStop(1,   hexWithAlpha(color, 0));
        ctx.fillStyle = outer;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 2.2, 0, Math.PI * 2);
        ctx.fill();
        // Inner glow: tighter, brighter for the concentrated zone
        const inner = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.1);
        inner.addColorStop(0, hexWithAlpha(color, 0.30 * glow));
        inner.addColorStop(1, hexWithAlpha(color, 0));
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.1, 0, Math.PI * 2);
        ctx.fill();
    }

    // Texture path resolution.
    const tex = params._textureImage;
    const hasTexture = tex && tex.complete && tex.naturalWidth > 0;

    // Textured face path: when a texture is loaded AND textureOpacity > 0,
    // render the faces and return. If textureOpacity is essentially 0, fall
    // through to the wireframe pass so the user can still see the shape's
    // structure when they've intentionally hidden the texture.
    if (hasTexture && shape.faces && (params.textureOpacity == null || params.textureOpacity >= 0.01)) {
        const texOpacity = (params.textureOpacity != null) ? params.textureOpacity : 1.0;
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1) * texOpacity;
        // Compute face centroids/normals for sorting + backface culling.
        const faceData = shape.faces.map(face => {
            const vs = face.verts.map(i => rotated[i]);
            // Centroid depth = avg z (for back-to-front sort).
            let cz = 0;
            for (const p of vs) cz += p[2];
            cz /= vs.length;
            // Normal via two edges of the face.
            const e1 = [vs[1][0]-vs[0][0], vs[1][1]-vs[0][1], vs[1][2]-vs[0][2]];
            const e2 = [vs[2][0]-vs[0][0], vs[2][1]-vs[0][1], vs[2][2]-vs[0][2]];
            const n = [
                e1[1]*e2[2] - e1[2]*e2[1],
                e1[2]*e2[0] - e1[0]*e2[2],
                e1[0]*e2[1] - e1[1]*e2[0]
            ];
            // Normalise so the cull threshold is a true cosine-of-angle
            // rather than a face-area magnitude — otherwise tiny faces
            // (e.g. the bullet's tip-fan triangles at the apex) get
            // culled even when they face the camera dead-on, because
            // their raw cross-product magnitude is much smaller than
            // the threshold despite n_z/|n| being ≈ 1.
            const nLen = Math.hypot(n[0], n[1], n[2]);
            const nZNorm = nLen > 1e-9 ? n[2] / nLen : 0;
            return { face, centroidZ: cz, normalZ: nZNorm };
        }).sort((a, b) => a.centroidZ - b.centroidZ); // back-to-front

        for (const fd of faceData) {
            // Backface cull (camera at +z), unless the shape opts out via
            // `shape.doubleSided` (e.g. Möbius strip — single-sided surface
            // with no consistent outward direction, every face must render).
            // 0.01 ≈ cos(89.4°) — drop only near-edge-on slivers.
            if (!shape.doubleSided && fd.normalZ <= 0.01) continue;
            const f = fd.face;
            const screen = f.verts.map(i => projected[i]);
            const uvs = f.uvs.map(([u, v]) => [u * tex.naturalWidth, v * tex.naturalHeight]);
            // Triangulate (fan) and texture-map each triangle.
            for (let i = 1; i < f.verts.length - 1; i++) {
                drawTexturedTriangle(ctx, tex,
                    [uvs[0][0],uvs[0][1], uvs[i][0],uvs[i][1], uvs[i+1][0],uvs[i+1][1]],
                    [screen[0].x,screen[0].y, screen[i].x,screen[i].y, screen[i+1].x,screen[i+1].y]
                );
            }
        }
        ctx.restore();
        // Only skip the wireframe pass if the texture is essentially opaque.
        // For partial textureOpacity, fall through to draw wireframe over the
        // texture so the grid lines stay visible (e.g. for a "holographic
        // planet" look — translucent surface + visible meridians).
        if (params.textureOpacity == null || params.textureOpacity >= 0.99) return;
    }

    // Wireframe edges, depth-sorted.
    if (!shape.edges) return;
    const sortedEdges = shape.edges.map(([a, b]) => ({
        a, b, avgDepth: (projected[a].depth + projected[b].depth) / 2
    })).sort((e1, e2) => e1.avgDepth - e2.avgDepth);

    for (const e of sortedEdges) {
        const pa = projected[e.a], pb = projected[e.b];
        const depthAlpha = 0.25 + 0.75 * Math.max(0, Math.min(1, (e.avgDepth + 2) / 4));
        if (glow > 0.01) {
            // Two glow strokes for substantial halo around wireframe edges.
            // Outer (wider, fainter) + inner (narrower, brighter).
            ctx.strokeStyle = hexWithAlpha(color, 0.25 * glow * depthAlpha);
            ctx.lineWidth = edgeWidth + 5 * glow;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
            ctx.strokeStyle = hexWithAlpha(color, 0.45 * glow * depthAlpha);
            ctx.lineWidth = edgeWidth + 2 * glow;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
        }
        ctx.strokeStyle = hexWithAlpha(color, 0.55 * depthAlpha);
        ctx.lineWidth = edgeWidth;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
    }
}

const CUBE_SHAPE = makeCube();
const PYRAMID_SHAPE = makePyramid();
// Cylinder is built per-params (so sides count is configurable).

// Shared param set for 3D rotating shapes (cube/pyramid/cylinder).
// Defaults: spin once around the vertical axis (Yaw), no tumble/roll — the
// most expected "default rotation" for a 3D shape. Users layer additional
// axes by raising those sliders.
const SHAPE3D_BASE_PARAMS = [
    { key: 'color',     label: 'Color',      type: 'color',  default: '#7af0ff' },
    { key: 'edgeWidth', label: 'Edge Width', type: 'slider', min: 0.5, max: 8,   step: 0.5, default: 2 },
    { key: 'scale',     label: 'Scale',      type: 'slider', min: 0.02, randomMin: 0.2, max: 1.4, step: 0.005, default: 0.6 },
    { key: 'centerX', label: 'Center X',
        description: 'Horizontal center of the shape (fraction of frame width). 0 = left edge, 0.5 = center, 1 = right edge. Values outside [0,1] move it partially off-screen.',
        type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
    { key: 'centerY', label: 'Center Y',
        description: 'Vertical center of the shape (fraction of frame height). 0 = top, 0.5 = center, 1 = bottom.',
        type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
    { key: 'glow',      label: 'Glow',       type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.5 },

    { key: 'tiltX', label: 'Tilt X (Pitch)',
        description: 'STATIC tilt around the X axis (degrees). Applied before rotation cycles. Use to set the initial orientation of the shape.',
        type: 'slider', min: -180, max: 180, step: 5, default: 0 },
    { key: 'tiltY', label: 'Tilt Y (Yaw)',
        description: 'STATIC tilt around the Y axis (degrees). Use to face a different side of the shape forward.',
        type: 'slider', min: -180, max: 180, step: 5, default: 0 },
    { key: 'tiltZ', label: 'Tilt Z (Roll)',
        description: 'STATIC tilt around the Z axis (degrees). Use to lean the shape left/right.',
        type: 'slider', min: -180, max: 180, step: 5, default: 0 },

    { key: 'cycX', label: 'Pitch Cycles',
        description: 'Whole rotations forward/back during the animation. Integer values keep the loop seamless. To slow apparent rotation, raise the Frames count at the top.',
        type: 'slider', min: -4, max: 4, step: 1, default: 0 },
    { key: 'cycY', label: 'Yaw Cycles',
        description: 'Whole rotations around the vertical axis during the animation. Integer values keep the loop seamless. To slow apparent rotation, raise the Frames count at the top.',
        type: 'slider', min: -4, max: 4, step: 1, default: 1 },
    { key: 'cycZ', label: 'Roll Cycles',
        description: 'Whole 2D rotations in the view plane during the animation. Integer values keep the loop seamless.',
        type: 'slider', min: -4, max: 4, step: 1, default: 0 },

    { key: 'texture',         label: 'Texture',         type: 'texture', default: '' },
    { key: 'textureOpacity',  label: 'Texture Opacity',
        description: 'Alpha multiplier applied to textured faces. 1 = opaque, 0 = invisible. Lets you fade the texture for ghost / holographic looks.',
        type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
];

function renderCubeFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, CUBE_SHAPE);
}
function renderPyramidFrame(ctx, w, h, frameIdx, totalFrames, params) {
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, PYRAMID_SHAPE);
}
function renderCylinderFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const sides = Math.max(3, Math.round(params.sides || 16));
    render3DShape(ctx, w, h, frameIdx, totalFrames, params, makeCylinder(sides));
}
