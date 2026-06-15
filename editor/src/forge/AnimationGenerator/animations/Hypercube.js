/**
 * Hypercube — 4D tesseract wireframe rotating through extra dimensions.
 *
 * Depends on (globals from earlier-loaded scripts):
 *   rotXW, rotZW, rotXZ, rotYZ, rotXY, project4D  (helpers/rotations.js)
 *   hexWithAlpha                                    (helpers/color.js)
 *   drawTexturedTriangle                            (helpers/texture.js)
 *   RR_ANIMATION_REGISTRY                           (registry.js)
 */

function makeTesseract() {
    const verts = [];
    for (let i = 0; i < 16; i++) {
        verts.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
    }
    const edges = [];
    for (let i = 0; i < 16; i++) {
        for (let j = i + 1; j < 16; j++) {
            let diff = 0;
            for (let k = 0; k < 4; k++) if (verts[i][k] !== verts[j][k]) diff++;
            if (diff === 1) edges.push([i, j]);
        }
    }
    return { verts, edges };
}

const TESSERACT = makeTesseract();

/**
 * Generate the 24 square faces of the tesseract. Each face is bounded by 4
 * vertices that vary in 2 of the 4 dimensions while the other 2 are fixed at
 * ±1. There are C(4,2) = 6 pairs of varying dimensions × 4 fixed combinations
 * = 24 faces. Each face gets a full-image UV mapping so the texture appears
 * once per cell-face when rendered.
 */
function makeTesseractFaces() {
    const faces = [];
    const fullUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const findIdx = (x, y, z, w) => {
        // Tesseract vertex layout: index = bit0=x, bit1=y, bit2=z, bit3=w
        // where each bit is 0 for -1 and 1 for +1.
        return ((x > 0) ? 1 : 0) | ((y > 0) ? 2 : 0) | ((z > 0) ? 4 : 0) | ((w > 0) ? 8 : 0);
    };
    for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
            const others = [0, 1, 2, 3].filter(a => a !== i && a !== j);
            for (let combo = 0; combo < 4; combo++) {
                const fixA = (combo & 1) ? 1 : -1;
                const fixB = (combo & 2) ? 1 : -1;
                const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
                const verts = corners.map(([ci, cj]) => {
                    const v = [0, 0, 0, 0];
                    v[i] = ci; v[j] = cj;
                    v[others[0]] = fixA; v[others[1]] = fixB;
                    return findIdx(v[0], v[1], v[2], v[3]);
                });
                faces.push({ verts, uvs: fullUV });
            }
        }
    }
    return faces;
}

const TESSERACT_FACES = makeTesseractFaces();

function renderHypercubeFrame(ctx, w, h, frameIdx, totalFrames, params) {
    // Normalize time so the animation loops cleanly across totalFrames.
    const t = (frameIdx / totalFrames) * Math.PI * 2;

    // Background — transparent (animation overlay).
    ctx.clearRect(0, 0, w, h);

    const cx = w * ((params.centerX !== undefined) ? params.centerX : 0.5), cy = h * ((params.centerY !== undefined) ? params.centerY : 0.5);
    const radius = Math.min(w, h) * 0.5 * params.scale;
    const color = params.color;
    const glow = params.glow;
    const edgeWidth = params.edgeWidth;

    // Apply rotations. Rotation rates are rounded to integer "cycles per loop"
    // so the animation lands exactly at the starting orientation on the
    // wraparound frame. Non-integer values would leave the shape mid-rotation
    // at frame N-1, jumping back to frame 0's orientation visibly.
    // Round defensively: any non-integer value in the underlying config
    // would break the loop seam. The slider step is 1, but legacy saved
    // configs from earlier iterations may carry fractional values.
    const cycXW = Math.round(params.speedXW);
    const cycZW = Math.round(params.speedZW);
    const cycXZ = Math.round(params.speedXZ);
    const cycYZ = Math.round(params.speedYZ);
    const cycXY = Math.round(params.speedXY);

    // Static 3D tilts (degrees) — applied between the 4D→3D perspective and
    // the 3D→2D perspective steps so they act as a view orientation
    // (matching the 3D rotation gizmo's expectation).
    const tx = (params.tiltX || 0) * Math.PI / 180;
    const ty = (params.tiltY || 0) * Math.PI / 180;
    const tz = (params.tiltZ || 0) * Math.PI / 180;
    const cosTX = Math.cos(tx), sinTX = Math.sin(tx);
    const cosTY = Math.cos(ty), sinTY = Math.sin(ty);
    const cosTZ = Math.cos(tz), sinTZ = Math.sin(tz);
    const D4 = 3.0, D3 = 3.5;
    const projectWithTilt = (v4) => {
        // 4D → 3D perspective.
        const wDiv = D4 - v4[3];
        const s4 = wDiv > 0.15 ? D4 / wDiv : D4 / 0.15;
        let x = v4[0] * s4, y = v4[1] * s4, z = v4[2] * s4;
        // Static tilts (X then Y then Z, matching render3DShape order).
        let y1 = y * cosTX - z * sinTX, z1 = y * sinTX + z * cosTX; y = y1; z = z1;
        let x2 = x * cosTY + z * sinTY, z2 = -x * sinTY + z * cosTY; x = x2; z = z2;
        let x3 = x * cosTZ - y * sinTZ, y3 = x * sinTZ + y * cosTZ; x = x3; y = y3;
        // 3D → 2D perspective.
        const dz = D3 - z;
        const s3 = dz > 0.15 ? D3 / dz : D3 / 0.15;
        // Y flipped — canvas +Y is down, world +Y is up.
        return { x: cx + x * s3 * radius, y: cy - y * s3 * radius, depth: z };
    };

    const projected = TESSERACT.verts.map(v0 => {
        let v = v0;
        v = rotXW(v, t * cycXW);
        v = rotZW(v, t * cycZW);
        v = rotXZ(v, t * cycXZ);
        v = rotYZ(v, t * cycYZ);
        v = rotXY(v, t * cycXY);
        return projectWithTilt(v);
    });

    const tex = params._textureImage;
    const hasTexture = tex && tex.complete && tex.naturalWidth > 0;

    // Glow halo (drawn before edges/faces).
    if (glow > 0.01) {
        const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.4);
        g.addColorStop(0, hexWithAlpha(color, 0.12 * glow));
        g.addColorStop(1, hexWithAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Textured tesseract: render the 24 face-quads ──
    // When textureOpacity is essentially 0, fall through to the wireframe
    // edges below so the user can still see the tesseract structure.
    if (hasTexture && (params.textureOpacity == null || params.textureOpacity >= 0.01)) {
        const texOpacity = (params.textureOpacity != null) ? params.textureOpacity : 1.0;
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1) * texOpacity;
        const texW = tex.naturalWidth, texH = tex.naturalHeight;
        // For each face, compute centroid depth + 2D cross for backface cull.
        const faceData = TESSERACT_FACES.map(f => {
            const ps = f.verts.map(i => projected[i]);
            const avgZ = ps.reduce((s, p) => s + p.depth, 0) / ps.length;
            const cross = (ps[1].x - ps[0].x) * (ps[2].y - ps[0].y) - (ps[1].y - ps[0].y) * (ps[2].x - ps[0].x);
            return { face: f, ps, avgZ, ccw: cross < 0 };
        }).sort((a, b) => a.avgZ - b.avgZ); // back-to-front

        for (const fd of faceData) {
            if (!fd.ccw) continue;
            const ps = fd.ps;
            const uvs = fd.face.uvs.map(([u, v]) => [u * texW, v * texH]);
            // Fan-triangulate (4 verts → 2 tris).
            drawTexturedTriangle(ctx, tex,
                [uvs[0][0],uvs[0][1], uvs[1][0],uvs[1][1], uvs[2][0],uvs[2][1]],
                [ps[0].x,ps[0].y, ps[1].x,ps[1].y, ps[2].x,ps[2].y]
            );
            drawTexturedTriangle(ctx, tex,
                [uvs[0][0],uvs[0][1], uvs[2][0],uvs[2][1], uvs[3][0],uvs[3][1]],
                [ps[0].x,ps[0].y, ps[2].x,ps[2].y, ps[3].x,ps[3].y]
            );
        }
        ctx.restore();
        // Only skip the wireframe edges if the texture is essentially opaque.
        // Partial opacity falls through so the tesseract edges render over
        // the texture — translucent hologram look.
        if (params.textureOpacity == null || params.textureOpacity >= 0.99) return;
    }

    // Sort edges back-to-front so closer ones overlap correctly.
    const sortedEdges = TESSERACT.edges.map(([a, b]) => ({
        a, b, avgDepth: (projected[a].depth + projected[b].depth) / 2
    })).sort((e1, e2) => e1.avgDepth - e2.avgDepth);

    // Edges with depth-based alpha.
    for (const e of sortedEdges) {
        const pa = projected[e.a], pb = projected[e.b];
        const depthAlpha = 0.25 + 0.75 * Math.max(0, Math.min(1, (e.avgDepth + 2) / 4));

        // Outer glow stroke.
        if (glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color, 0.18 * glow * depthAlpha);
            ctx.lineWidth = edgeWidth + 2.5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
        }

        // Main edge line.
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
    id:           'hypercube',
    name:         'Hypercube',
    description:  '4D tesseract wireframe rotating through extra dimensions.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params: [
        { key: 'color',     label: 'Color',     type: 'color',  default: '#00e0ff' },
        { key: 'edgeWidth', label: 'Edge Width',type: 'slider', min: 0.5, max: 8,   step: 0.5, default: 2 },
        { key: 'scale',     label: 'Scale',     type: 'slider', min: 0.02, randomMin: 0.2, max: 1.4, step: 0.005, default: 0.65 },
                { key: 'centerX', label: 'Center X',
            description: 'Horizontal center (fraction of frame width). 0.5 = middle, 0 = left edge, 1 = right edge.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'centerY', label: 'Center Y',
            description: 'Vertical center (fraction of frame height). 0.5 = middle, 0 = top, 1 = bottom.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'glow',      label: 'Glow',      type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.7 },

        { key: 'tiltX', label: 'Tilt X (Pitch)',
            description: 'STATIC 3D tilt around the X axis (degrees) applied after 4D perspective. Use the rotation gizmo to set the viewing angle.',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },
        { key: 'tiltY', label: 'Tilt Y (Yaw)',
            description: 'STATIC 3D tilt around the Y axis (degrees).',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },
        { key: 'tiltZ', label: 'Tilt Z (Roll)',
            description: 'STATIC 3D tilt around the Z axis (degrees).',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },

        { key: 'speedXW', label: '4D Fold A',
            description: '4D rotation in the XW plane — the iconic tesseract "fold through w" motion. Integer cycles keep the loop seamless. To slow it, raise the Frames count.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },
        { key: 'speedZW', label: '4D Fold B',
            description: '4D rotation in the ZW plane — a second 4D fold axis. Combine with Fold A for the classic tumble. Integer cycles keep the loop seamless.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedYZ', label: 'Pitch',
            description: '3D tumble around the X axis (whole rotations per loop). Integer values keep the loop seamless.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedXZ', label: 'Yaw',
            description: '3D spin around the Y (vertical) axis (whole rotations per loop). Integer values keep the loop seamless.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedXY', label: 'Roll',
            description: '2D rotation in the view plane (whole rotations per loop). Integer values keep the loop seamless.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'texture',   label: 'Texture',   type: 'texture', default: '' },
        { key: 'textureOpacity', label: 'Texture Opacity',
            description: 'Alpha multiplier applied to the textured faces. 1 = opaque, 0 = invisible. Useful for ghost / holographic looks.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderHypercubeFrame
});
