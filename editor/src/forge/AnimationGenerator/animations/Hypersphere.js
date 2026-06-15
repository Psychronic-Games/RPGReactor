/**
 * Hypersphere — 4D 3-sphere (S³). The set of points in 4D satisfying
 * x² + y² + z² + w² = 1.
 *
 * Visualized as a series of nested 2-sphere cross-sections at constant w
 * values. As 4D rotations mix the w component with x/y/z, the cross-section
 * spheres "morph" — what was a small inner shell can rotate to become the
 * equatorial sphere, and vice versa. The classic hypersphere "inside-out"
 * effect.
 *
 * Cross-section at w = w_i:
 *   2-sphere with radius √(R² − w_i²), centered at (0, 0, 0, w_i).
 *   At w_i = ±R: single point (poles). Skipped — only shells in between.
 *
 * Each shell is drawn as a lat/lon wireframe; latitude rings + longitude
 * arcs across the shell's 2-sphere. All edges run through the 4D rotation
 * pipeline + static 3D tilts + perspective projection.
 *
 * Depends on (globals):
 *   rotXW, rotZW, rotXZ, rotYZ, rotXY  (helpers/rotations.js)
 *   hexWithAlpha                        (helpers/color.js)
 *   RR_ANIMATION_REGISTRY               (registry.js)
 */

/**
 * Build the hypersphere geometry: nested 2-sphere shells at constant w.
 * Returns { verts: [[x,y,z,w], ...], edges: [[a,b], ...] }.
 *
 *   shellCount: number of cross-section 2-spheres (default 4)
 *   latLines:   latitude rings per shell (default 6)
 *   lonLines:   longitude segments per shell (default 12)
 */
function makeHypersphere(shellCount, latLines, lonLines) {
    const verts = [];
    const edges = [];
    // Distribute shells evenly in alpha space (so they cluster densely near
    // the equator and sparsely near the w-poles, like spherical latitudes).
    for (let s = 0; s < shellCount; s++) {
        const alpha = ((s + 1) / (shellCount + 1)) * Math.PI;
        const w_i = Math.cos(alpha);     // ranges in (-1, 1) for s = 0..shellCount-1
        const r_i = Math.sin(alpha);     // 2-sphere radius at this shell
        const shellStart = verts.length;
        // Generate (latLines+1) × (lonLines+1) grid of vertices on the shell's
        // 2-sphere. (j=0 and j=latLines are poles — top and bottom of shell.)
        for (let j = 0; j <= latLines; j++) {
            const beta = (j / latLines) * Math.PI;
            const sinB = Math.sin(beta);
            const cosB = Math.cos(beta);
            for (let k = 0; k <= lonLines; k++) {
                const gamma = (k / lonLines) * Math.PI * 2;
                const x = r_i * sinB * Math.cos(gamma);
                const z = r_i * sinB * Math.sin(gamma);
                const y = r_i * cosB;
                verts.push([x, y, z, w_i]);
                // Longitude edge — between consecutive k along the same j ring.
                if (k > 0) {
                    edges.push([
                        shellStart + j * (lonLines + 1) + k - 1,
                        shellStart + j * (lonLines + 1) + k
                    ]);
                }
                // Latitude edge — between consecutive j (same k column).
                if (j > 0) {
                    edges.push([
                        shellStart + (j - 1) * (lonLines + 1) + k,
                        shellStart + j * (lonLines + 1) + k
                    ]);
                }
            }
        }
    }
    return { verts, edges, shellCount, latLines, lonLines };
}

// Geometry cache — build once per (shellCount, latLines, lonLines) tuple.
let _HYPERSPHERE_CACHE = null;
let _HYPERSPHERE_KEY = '';
function getHypersphere(shellCount, latLines, lonLines) {
    const key = shellCount + '|' + latLines + '|' + lonLines;
    if (_HYPERSPHERE_CACHE && _HYPERSPHERE_KEY === key) return _HYPERSPHERE_CACHE;
    _HYPERSPHERE_CACHE = makeHypersphere(shellCount, latLines, lonLines);
    _HYPERSPHERE_KEY = key;
    return _HYPERSPHERE_CACHE;
}

function renderHypersphereFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = (frameIdx / totalFrames) * Math.PI * 2;
    ctx.clearRect(0, 0, w, h);

    const cx = w * ((params.centerX !== undefined) ? params.centerX : 0.5), cy = h * ((params.centerY !== undefined) ? params.centerY : 0.5);
    const radius = Math.min(w, h) * 0.5 * params.scale;
    const color = params.color;
    const glow = params.glow;
    const edgeWidth = params.edgeWidth;

    const cycXW = Math.round(params.speedXW);
    const cycZW = Math.round(params.speedZW);
    const cycXZ = Math.round(params.speedXZ);
    const cycYZ = Math.round(params.speedYZ);
    const cycXY = Math.round(params.speedXY);

    const tx = (params.tiltX || 0) * Math.PI / 180;
    const ty = (params.tiltY || 0) * Math.PI / 180;
    const tz = (params.tiltZ || 0) * Math.PI / 180;
    const cosTX = Math.cos(tx), sinTX = Math.sin(tx);
    const cosTY = Math.cos(ty), sinTY = Math.sin(ty);
    const cosTZ = Math.cos(tz), sinTZ = Math.sin(tz);

    // 4D → 3D → tilt → 2D projection (same pipeline as Pentachoron).
    const D4 = 3.0, D3 = 3.5;
    const project = (v4) => {
        const wDiv = D4 - v4[3];
        const s4 = wDiv > 0.15 ? D4 / wDiv : D4 / 0.15;
        let x = v4[0] * s4, y = v4[1] * s4, z = v4[2] * s4;
        let y1 = y * cosTX - z * sinTX, z1 = y * sinTX + z * cosTX; y = y1; z = z1;
        let x2 = x * cosTY + z * sinTY, z2 = -x * sinTY + z * cosTY; x = x2; z = z2;
        let x3 = x * cosTZ - y * sinTZ, y3 = x * sinTZ + y * cosTZ; x = x3; y = y3;
        const dz = D3 - z;
        const s3 = dz > 0.15 ? D3 / dz : D3 / 0.15;
        return { x: cx + x * s3 * radius, y: cy - y * s3 * radius, depth: z };
    };

    const shellCount = Math.max(1, Math.min(8, Math.round(params.shellCount)));
    const latLines = Math.max(3, Math.min(16, Math.round(params.latLines)));
    const lonLines = Math.max(4, Math.min(24, Math.round(params.lonLines)));
    const geo = getHypersphere(shellCount, latLines, lonLines);

    const projected = geo.verts.map(v0 => {
        let v = v0.slice();
        v = rotXW(v, t * cycXW);
        v = rotZW(v, t * cycZW);
        v = rotXZ(v, t * cycXZ);
        v = rotYZ(v, t * cycYZ);
        v = rotXY(v, t * cycXY);
        return project(v);
    });

    // Outer glow halo.
    if (glow > 0.01) {
        const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.4);
        g.addColorStop(0, hexWithAlpha(color, 0.12 * glow));
        g.addColorStop(1, hexWithAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
        ctx.fill();
    }

    // Depth-sort + draw all edges. With many edges we batch by stroke style
    // to reduce state changes — but the per-edge depth alpha varies, so
    // we still set strokeStyle per edge.
    const sortedEdges = geo.edges.map(([a, b]) => ({
        a, b,
        avgDepth: (projected[a].depth + projected[b].depth) / 2
    })).sort((e1, e2) => e1.avgDepth - e2.avgDepth);

    ctx.lineCap = 'round';
    for (const e of sortedEdges) {
        const pa = projected[e.a], pb = projected[e.b];
        const depthAlpha = 0.20 + 0.65 * Math.max(0, Math.min(1, (e.avgDepth + 2) / 4));
        if (glow > 0.01) {
            ctx.strokeStyle = hexWithAlpha(color, 0.18 * glow * depthAlpha);
            ctx.lineWidth = edgeWidth + 4 * glow;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
            ctx.strokeStyle = hexWithAlpha(color, 0.35 * glow * depthAlpha);
            ctx.lineWidth = edgeWidth + 1.5 * glow;
            ctx.beginPath();
            ctx.moveTo(pa.x, pa.y);
            ctx.lineTo(pb.x, pb.y);
            ctx.stroke();
        }
        ctx.strokeStyle = hexWithAlpha(color, 0.45 * depthAlpha);
        ctx.lineWidth = edgeWidth;
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'hypersphere',
    name:         'Hypersphere',
    description:  '4D 3-sphere — nested 2-sphere cross-sections at constant w. 4D rotations mix w with x/y/z so the shells "morph" through each other.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params: [
        { key: 'color',     label: 'Color',      type: 'color',  default: '#40e0ff' },
        { key: 'edgeWidth', label: 'Edge Width', type: 'slider', min: 0.3, max: 6,   step: 0.1, default: 1.2 },
        { key: 'scale',     label: 'Scale',      type: 'slider', min: 0.02, randomMin: 0.2, max: 1.4, step: 0.005, default: 0.65 },
                { key: 'centerX', label: 'Center X',
            description: 'Horizontal center (fraction of frame width). 0.5 = middle, 0 = left edge, 1 = right edge.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'centerY', label: 'Center Y',
            description: 'Vertical center (fraction of frame height). 0.5 = middle, 0 = top, 1 = bottom.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'glow',      label: 'Glow',       type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.6 },

        { key: 'tiltX', label: 'Tilt X (Pitch)',
            description: 'STATIC 3D tilt around the X axis (degrees) applied after 4D perspective.',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },
        { key: 'tiltY', label: 'Tilt Y (Yaw)',
            description: 'STATIC 3D tilt around the Y axis (degrees).',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },
        { key: 'tiltZ', label: 'Tilt Z (Roll)',
            description: 'STATIC 3D tilt around the Z axis (degrees).',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },

        { key: 'speedXW', label: '4D Fold A',
            description: '4D rotation in the XW plane — the iconic hypersphere "inside-out" inversion. Integer cycles for seamless loop.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },
        { key: 'speedZW', label: '4D Fold B',
            description: '4D rotation in the ZW plane.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedYZ', label: 'Pitch Cycles',
            description: '3D tumble around the X axis.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedXZ', label: 'Yaw Cycles',
            description: '3D spin around the Y (vertical) axis.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },
        { key: 'speedXY', label: 'Roll Cycles',
            description: '2D rotation in the view plane.',
            type: 'slider', min: -4, max: 4, step: 1, default: 0 },

        { key: 'shellCount', label: 'Shells',
            description: 'How many nested 2-sphere cross-sections to render. 1 = single sphere (boring); 4 = classic hypersphere; 8 = dense.',
            type: 'slider', min: 1, max: 8, step: 1, default: 4 },
        { key: 'latLines', label: 'Latitude Lines',
            description: 'Latitude resolution per shell.',
            type: 'slider', min: 3, max: 16, step: 1, default: 6 },
        { key: 'lonLines', label: 'Longitude Lines',
            description: 'Longitude resolution per shell.',
            type: 'slider', min: 4, max: 24, step: 1, default: 12 }
    ],
    render: renderHypersphereFrame
});
