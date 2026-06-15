/**
 * Pentachoron — 4D 5-cell / 4-simplex. The 4D analog of the tetrahedron:
 * 5 vertices, 10 edges, 10 triangular faces, 5 tetrahedral cells.
 *
 * Animates through 4D rotations (XW, ZW, XZ, YZ, XY planes) the same way
 * Hypercube does, with the addition of static tiltX/tiltY/tiltZ for setting
 * the viewing orientation (so the new 3D rotation gizmo applies). Texture
 * mode triangulates each of the 10 triangular faces with a full-UV
 * mapping.
 *
 * Regular-pentachoron vertex coordinates (4D, all pairwise distances = 2√2):
 *   v0 = ( 1,  1,  1, -1/√5)
 *   v1 = ( 1, -1, -1, -1/√5)
 *   v2 = (-1,  1, -1, -1/√5)
 *   v3 = (-1, -1,  1, -1/√5)
 *   v4 = ( 0,  0,  0,  4/√5)
 *
 * Depends on (globals):
 *   rotXW, rotZW, rotXZ, rotYZ, rotXY  (helpers/rotations.js — project4D is
 *                                       NOT used here because we need to
 *                                       insert static 3D tilts between the
 *                                       4D→3D and 3D→2D perspective passes)
 *   hexWithAlpha                        (helpers/color.js)
 *   drawTexturedTriangle                (helpers/texture.js)
 *   RR_ANIMATION_REGISTRY               (registry.js)
 */

function makePentachoron() {
    const s = 1 / Math.sqrt(5);
    const verts = [
        [ 1,  1,  1, -s],
        [ 1, -1, -1, -s],
        [-1,  1, -1, -s],
        [-1, -1,  1, -s],
        [ 0,  0,  0, 4 * s]
    ];
    // K5: every pair of vertices is connected.
    const edges = [];
    for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) edges.push([i, j]);
    }
    // 10 triangular faces — every triple of vertices forms a face.
    const fullUV = [[0, 0], [1, 0], [0.5, 1]];
    const faces = [];
    for (let i = 0; i < 5; i++) {
        for (let j = i + 1; j < 5; j++) {
            for (let k = j + 1; k < 5; k++) {
                faces.push({ verts: [i, j, k], uvs: fullUV });
            }
        }
    }
    return { verts, edges, faces };
}

const PENTACHORON = makePentachoron();

function renderPentachoronFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = (frameIdx / totalFrames) * Math.PI * 2;
    ctx.clearRect(0, 0, w, h);

    const cx = w * ((params.centerX !== undefined) ? params.centerX : 0.5), cy = h * ((params.centerY !== undefined) ? params.centerY : 0.5);
    const radius = Math.min(w, h) * 0.5 * params.scale;
    const color = params.color;
    const glow = params.glow;
    const edgeWidth = params.edgeWidth;

    // Animated 4D rotations. Integer cycles per loop → seamless.
    const cycXW = Math.round(params.speedXW);
    const cycZW = Math.round(params.speedZW);
    const cycXZ = Math.round(params.speedXZ);
    const cycYZ = Math.round(params.speedYZ);
    const cycXY = Math.round(params.speedXY);

    // Static 3D tilts (degrees) — applied AFTER the 4D → 3D perspective step
    // so they act as a view orientation rather than a 4D rotation.
    const tx = (params.tiltX || 0) * Math.PI / 180;
    const ty = (params.tiltY || 0) * Math.PI / 180;
    const tz = (params.tiltZ || 0) * Math.PI / 180;
    const cosTX = Math.cos(tx), sinTX = Math.sin(tx);
    const cosTY = Math.cos(ty), sinTY = Math.sin(ty);
    const cosTZ = Math.cos(tz), sinTZ = Math.sin(tz);

    // 4D → 3D → tilt → 2D pipeline. Replaces project4D so we can insert the
    // tilts in the middle.
    const D4 = 3.0;
    const D3 = 3.5;
    const project = (v4) => {
        // 4D perspective division.
        const wDiv = D4 - v4[3];
        const s4 = wDiv > 0.15 ? D4 / wDiv : D4 / 0.15;
        let x = v4[0] * s4, y = v4[1] * s4, z = v4[2] * s4;
        // Static 3D tilts (same order as render3DShape: X, then Y, then Z).
        let y1 = y * cosTX - z * sinTX, z1 = y * sinTX + z * cosTX; y = y1; z = z1;
        let x2 = x * cosTY + z * sinTY, z2 = -x * sinTY + z * cosTY; x = x2; z = z2;
        let x3 = x * cosTZ - y * sinTZ, y3 = x * sinTZ + y * cosTZ; x = x3; y = y3;
        // 3D perspective division → 2D screen.
        const dz = D3 - z;
        const s3 = dz > 0.15 ? D3 / dz : D3 / 0.15;
        return { x: cx + x * s3 * radius, y: cy - y * s3 * radius, depth: z };
    };

    const projected = PENTACHORON.verts.map(v0 => {
        let v = v0.slice();
        v = rotXW(v, t * cycXW);
        v = rotZW(v, t * cycZW);
        v = rotXZ(v, t * cycXZ);
        v = rotYZ(v, t * cycYZ);
        v = rotXY(v, t * cycXY);
        return project(v);
    });

    const tex = params._textureImage;
    const hasTexture = tex && tex.complete && tex.naturalWidth > 0;

    // Outer glow halo (drawn behind everything).
    if (glow > 0.01) {
        const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.4);
        g.addColorStop(0, hexWithAlpha(color, 0.12 * glow));
        g.addColorStop(1, hexWithAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Textured face pass.
    if (hasTexture && (params.textureOpacity == null || params.textureOpacity >= 0.01)) {
        const texOpacity = (params.textureOpacity != null) ? params.textureOpacity : 1.0;
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1) * texOpacity;
        const texW = tex.naturalWidth, texH = tex.naturalHeight;
        // Back-to-front sort with screen-space winding check for backface cull.
        const faceData = PENTACHORON.faces.map(f => {
            const ps = f.verts.map(i => projected[i]);
            const avgZ = (ps[0].depth + ps[1].depth + ps[2].depth) / 3;
            const cross = (ps[1].x - ps[0].x) * (ps[2].y - ps[0].y)
                        - (ps[1].y - ps[0].y) * (ps[2].x - ps[0].x);
            return { face: f, ps, avgZ, ccw: cross < 0 };
        }).sort((a, b) => a.avgZ - b.avgZ);
        for (const fd of faceData) {
            if (!fd.ccw) continue;
            const ps = fd.ps;
            const uvs = fd.face.uvs.map(([u, v]) => [u * texW, v * texH]);
            drawTexturedTriangle(ctx, tex,
                [uvs[0][0], uvs[0][1], uvs[1][0], uvs[1][1], uvs[2][0], uvs[2][1]],
                [ps[0].x,   ps[0].y,   ps[1].x,   ps[1].y,   ps[2].x,   ps[2].y]
            );
        }
        ctx.restore();
        // Skip wireframe only when texture is essentially opaque (matches
        // the Hypercube / shape3D fall-through behavior).
        if (params.textureOpacity == null || params.textureOpacity >= 0.99) return;
    }

    // Wireframe edges, depth-sorted.
    const sortedEdges = PENTACHORON.edges.map(([a, b]) => ({
        a, b, avgDepth: (projected[a].depth + projected[b].depth) / 2
    })).sort((e1, e2) => e1.avgDepth - e2.avgDepth);

    for (const e of sortedEdges) {
        const pa = projected[e.a], pb = projected[e.b];
        const depthAlpha = 0.25 + 0.75 * Math.max(0, Math.min(1, (e.avgDepth + 2) / 4));
        if (glow > 0.01) {
            // Two glow passes for substantial halo.
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

RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'pentachoron',
    name:         'Pentachoron',
    description:  '4D 5-cell — the simplest 4-polytope, all-triangular faces. The 4D analog of a tetrahedron, rotating through extra dimensions.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params: [
        { key: 'color',     label: 'Color',      type: 'color',  default: '#a060ff' },
        { key: 'edgeWidth', label: 'Edge Width', type: 'slider', min: 0.5, max: 8,   step: 0.5, default: 2 },
        { key: 'scale',     label: 'Scale',      type: 'slider', min: 0.02, randomMin: 0.2, max: 1.4, step: 0.005, default: 0.6 },
                { key: 'centerX', label: 'Center X',
            description: 'Horizontal center (fraction of frame width). 0.5 = middle, 0 = left edge, 1 = right edge.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'centerY', label: 'Center Y',
            description: 'Vertical center (fraction of frame height). 0.5 = middle, 0 = top, 1 = bottom.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'glow',      label: 'Glow',       type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.6 },

        { key: 'tiltX', label: 'Tilt X (Pitch)',
            description: 'STATIC 3D tilt around the X axis (degrees) applied after 4D perspective. Use the gizmo to set the viewing angle.',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },
        { key: 'tiltY', label: 'Tilt Y (Yaw)',
            description: 'STATIC 3D tilt around the Y axis (degrees).',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },
        { key: 'tiltZ', label: 'Tilt Z (Roll)',
            description: 'STATIC 3D tilt around the Z axis (degrees).',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },

        { key: 'speedXW', label: '4D Fold A',
            description: '4D rotation in the XW plane — the iconic "fold through w" motion. Integer cycles keep the loop seamless.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },
        { key: 'speedZW', label: '4D Fold B',
            description: '4D rotation in the ZW plane — a second 4D fold axis. Combine with Fold A for the classic tumble. Integer cycles for seamless loop.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedYZ', label: 'Pitch Cycles',
            description: '3D tumble around the X axis (whole rotations per loop). Integer for seamless loop.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedXZ', label: 'Yaw Cycles',
            description: '3D spin around the Y (vertical) axis (whole rotations per loop). Integer for seamless loop.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedXY', label: 'Roll Cycles',
            description: '2D rotation in the view plane (whole rotations per loop). Integer for seamless loop.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },

        { key: 'texture', label: 'Texture', type: 'texture', default: '' },
        { key: 'textureOpacity', label: 'Texture Opacity',
            description: 'Alpha multiplier applied to the textured faces. 1 = opaque (wireframe hidden); 0 = invisible (wireframe only); in between = both visible.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderPentachoronFrame
});
