/**
 * Sphere — wireframe sphere grid with latitude/longitude lines, spin + tilt.
 * Texture wraps equirectangular.
 *
 * Depends on (globals):
 *   hexWithAlpha            (helpers/color.js)
 *   drawTexturedTriangle    (helpers/texture.js)
 *   RR_ANIMATION_REGISTRY   (registry.js)
 */

function renderSphereFrame(ctx, w, h, frameIdx, totalFrames, params) {
    const t = (frameIdx / totalFrames) * Math.PI * 2;
    ctx.clearRect(0, 0, w, h);

    const cx = w * ((params.centerX !== undefined) ? params.centerX : 0.5), cy = h * ((params.centerY !== undefined) ? params.centerY : 0.5);
    const radius = Math.min(w, h) * 0.5 * params.scale;
    const color = params.color;
    const edgeWidth = params.edgeWidth;
    const glow = params.glow;
    // Tilt angles in degrees → radians. Backward-compat: legacy `tilt` is X tilt.
    const tiltX = ((params.tiltX !== undefined ? params.tiltX : params.tilt) || 0) * Math.PI / 180;
    const tiltY = (params.tiltY || 0) * Math.PI / 180;
    const tiltZ = (params.tiltZ || 0) * Math.PI / 180;
    // Integer cycles required for seamless loop.
    const spin = t * Math.round(params.spinSpeed);
    const latCount = Math.max(2, Math.round(params.latLines));
    const lonCount = Math.max(2, Math.round(params.lonLines));
    const backAlpha = params.backfaceAlpha;
    const segments = 64;

    // Transform: spin around Y → tilt X (pitch) → tilt Y (yaw) → tilt Z (roll).
    const cosTX = Math.cos(tiltX), sinTX = Math.sin(tiltX);
    const cosTY = Math.cos(tiltY), sinTY = Math.sin(tiltY);
    const cosTZ = Math.cos(tiltZ), sinTZ = Math.sin(tiltZ);
    const cosSp = Math.cos(spin),  sinSp = Math.sin(spin);
    const transform = (x, y, z) => {
        // Y-spin (around vertical axis)
        let x1 = x * cosSp + z * sinSp;
        let z1 = -x * sinSp + z * cosSp;
        let y1 = y;
        // Tilt X (rotate around X axis, YZ plane)
        let y2 = y1 * cosTX - z1 * sinTX;
        let z2 = y1 * sinTX + z1 * cosTX;
        let x2 = x1;
        // Tilt Y (rotate around Y axis, XZ plane)
        let x3 = x2 * cosTY + z2 * sinTY;
        let z3 = -x2 * sinTY + z2 * cosTY;
        let y3 = y2;
        // Tilt Z (rotate around Z axis, XY plane)
        let x4 = x3 * cosTZ - y3 * sinTZ;
        let y4 = x3 * sinTZ + y3 * cosTZ;
        return { x: x4, y: y4, z: z3 };
    };

    const tex = params._textureImage;
    const hasTexture = tex && tex.complete && tex.naturalWidth > 0;

    // ── Textured path: tessellate into quads with equirectangular UV ──
    // Pyramid-style convention: +Y world maps to UP on screen. UV: north pole
    // at v=0 (top of texture), south pole at v=1 (bottom).
    // Render the textured sphere when a texture is loaded AND its opacity is
    // > 0. If opacity is essentially 0, fall through to the lat/lon wireframe
    // so the user can still see the globe's structure.
    if (hasTexture && (params.textureOpacity == null || params.textureOpacity >= 0.01)) {
        const texOpacity = (params.textureOpacity != null) ? params.textureOpacity : 1.0;
        ctx.save();
        ctx.globalAlpha = (ctx.globalAlpha || 1) * texOpacity;
        const meshLon = 48, meshLat = 24;
        const grid = [];
        // Skip the actual poles in the main mesh — interior rows only.
        // The polar caps are drawn separately as triangle fans (seamless).
        for (let j = 0; j <= meshLat; j++) {
            const row = [];
            // Inset both ends by half a row so the first/last ring sits at
            // a small latitude inside the pole — eliminates degenerate quads.
            const tNorm = (j + 0.5) / (meshLat + 1);
            const lat = Math.PI / 2 - tNorm * Math.PI;
            const ry = Math.sin(lat);
            const rr = Math.cos(lat);
            for (let i = 0; i <= meshLon; i++) {
                const lon = (i / meshLon) * Math.PI * 2;
                const x = rr * Math.cos(lon);
                const z = rr * Math.sin(lon);
                const r = transform(x, ry, z);
                const persp = 1 + r.z * 0.3;
                row.push({
                    x: cx + r.x * radius * persp,
                    y: cy - r.y * radius * persp, // FLIP Y (canvas +Y = down)
                    z: r.z,
                    // FLIP U so equirectangular maps (e.g. Earth) render in
                    // the correct orientation. Without this, the U direction
                    // wrapped CW when the sphere mesh winds CCW, producing
                    // a horizontally-mirrored texture.
                    u: 1 - i / meshLon,
                    v: tNorm
                });
            }
            grid.push(row);
        }

        // Mesh quads (back-to-front depth sort, backface-cull).
        const quads = [];
        for (let j = 0; j < meshLat; j++) {
            for (let i = 0; i < meshLon; i++) {
                const a = grid[j][i], b = grid[j][i+1], c = grid[j+1][i+1], d = grid[j+1][i];
                const avgZ = (a.z + b.z + c.z + d.z) / 4;
                const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
                quads.push({ a, b, c, d, avgZ, ccw: cross < 0 });
            }
        }
        quads.sort((q1, q2) => q1.avgZ - q2.avgZ);

        const texW = tex.naturalWidth, texH = tex.naturalHeight;
        for (const q of quads) {
            if (!q.ccw) continue;
            drawTexturedTriangle(ctx, tex,
                [q.a.u*texW,q.a.v*texH, q.b.u*texW,q.b.v*texH, q.c.u*texW,q.c.v*texH],
                [q.a.x,q.a.y, q.b.x,q.b.y, q.c.x,q.c.y]
            );
            drawTexturedTriangle(ctx, tex,
                [q.a.u*texW,q.a.v*texH, q.c.u*texW,q.c.v*texH, q.d.u*texW,q.d.v*texH],
                [q.a.x,q.a.y, q.c.x,q.c.y, q.d.x,q.d.y]
            );
        }

        // Polar caps as triangle fans. Pole points are the actual ±Y poles,
        // texture-sampled from the texture's top (north) and bottom (south) row.
        const drawPoleCap = (poleY, poleV) => {
            const r = transform(0, poleY, 0);
            const persp = 1 + r.z * 0.3;
            const pole = { x: cx + r.x * radius * persp, y: cy - r.y * radius * persp, z: r.z };
            // Iterate the first or last ring depending on the pole.
            const ring = (poleY > 0) ? grid[0] : grid[meshLat];
            for (let i = 0; i < meshLon; i++) {
                const a = ring[i], b = ring[i + 1];
                const cross = (a.x - pole.x) * (b.y - pole.y) - (a.y - pole.y) * (b.x - pole.x);
                // Visibility: facing the camera (sign depends on pole side).
                const facing = (poleY > 0) ? (cross > 0) : (cross < 0);
                if (!facing) continue;
                const uMid = (a.u + b.u) / 2;
                drawTexturedTriangle(ctx, tex,
                    [uMid*texW, poleV*texH, a.u*texW, a.v*texH, b.u*texW, b.v*texH],
                    [pole.x, pole.y, a.x, a.y, b.x, b.y]
                );
            }
        };
        drawPoleCap( 1.0, 0.0); // north pole → texture top
        drawPoleCap(-1.0, 1.0); // south pole → texture bottom

        ctx.restore();
        // Only skip the lat/lon wireframe if the texture is essentially opaque.
        // Partial opacity falls through so the meridian/parallel lines render
        // over the texture — a "holographic globe" look.
        if (params.textureOpacity == null || params.textureOpacity >= 0.99) return;
    }

    // Glow halo.
    if (glow > 0.01) {
        const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius * 1.4);
        g.addColorStop(0, hexWithAlpha(color, 0.12 * glow));
        g.addColorStop(1, hexWithAlpha(color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
        ctx.fill();
    }

    const drawPolyline = (points) => {
        for (let i = 1; i < points.length; i++) {
            const a = transform(...points[i - 1]);
            const b = transform(...points[i]);
            const avgZ = (a.z + b.z) / 2;
            const visible = avgZ >= -0.05;
            const alpha = visible ? 1.0 : backAlpha;
            if (alpha < 0.01) continue;
            const pa = 1 + a.z * 0.3;
            const pb = 1 + b.z * 0.3;
            const ax = cx + a.x * radius * pa;
            const ay = cy - a.y * radius * pa;
            const bx = cx + b.x * radius * pb;
            const by = cy - b.y * radius * pb;
            if (glow > 0.01) {
                ctx.strokeStyle = hexWithAlpha(color, 0.18 * glow * alpha);
                ctx.lineWidth = edgeWidth + 2.5;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(bx, by);
                ctx.stroke();
            }
            ctx.strokeStyle = hexWithAlpha(color, 0.55 * alpha);
            ctx.lineWidth = edgeWidth;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        }
    };

    // Latitude circles (constant lat, varying lon).
    for (let li = 1; li < latCount; li++) {
        const lat = -Math.PI / 2 + (li / latCount) * Math.PI;
        const r = Math.cos(lat);
        const yy = Math.sin(lat);
        const points = [];
        for (let s = 0; s <= segments; s++) {
            const lon = (s / segments) * Math.PI * 2;
            points.push([r * Math.cos(lon), yy, r * Math.sin(lon)]);
        }
        drawPolyline(points);
    }

    // Longitude meridians (constant lon, varying lat).
    for (let lo = 0; lo < lonCount; lo++) {
        const lon = (lo / lonCount) * Math.PI * 2;
        const points = [];
        for (let s = 0; s <= segments; s++) {
            const lat = -Math.PI / 2 + (s / segments) * Math.PI;
            const r = Math.cos(lat);
            const yy = Math.sin(lat);
            points.push([r * Math.cos(lon), yy, r * Math.sin(lon)]);
        }
        drawPolyline(points);
    }
}

RR_ANIMATION_REGISTRY.push({
    categoryId:   'geometric',
    id:           'sphere',
    name:         'Sphere',
    description:  'Wireframe sphere grid with latitude/longitude lines, spin + tilt. Texture wraps equirectangular.',
    defaultBlend: 'source-over',
    noRandomize:  ['centerX', 'centerY'],
    params: [
        { key: 'color',         label: 'Color',          type: 'color',  default: '#7af0ff' },
        { key: 'edgeWidth',     label: 'Edge Width',     type: 'slider', min: 0.5, max: 6,   step: 0.5,  default: 1.5 },
        { key: 'scale',         label: 'Scale',          type: 'slider', min: 0.02, randomMin: 0.2, max: 1.2, step: 0.005, default: 0.7 },
                { key: 'centerX', label: 'Center X',
            description: 'Horizontal center (fraction of frame width). 0.5 = middle, 0 = left edge, 1 = right edge.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'centerY', label: 'Center Y',
            description: 'Vertical center (fraction of frame height). 0.5 = middle, 0 = top, 1 = bottom.',
            type: 'slider', min: -0.5, max: 1.5, step: 0.02, default: 0.5 },
        { key: 'glow',          label: 'Glow',           type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.5 },
        { key: 'latLines',      label: 'Latitude Lines', type: 'slider', min: 2,   max: 24,  step: 1,    default: 8 },
        { key: 'lonLines',      label: 'Longitude Lines',type: 'slider', min: 2,   max: 24,  step: 1,    default: 12 },
        { key: 'spinSpeed', label: 'Yaw Cycles',
            description: 'Whole rotations around the vertical axis during the animation. Integer values keep the loop seamless. To slow rotation, raise the Frames count at the top.',
            type: 'slider', min: -4, max: 4, step: 1, default: 1 },
        { key: 'tiltX', label: 'Tilt X (Pitch)',
            description: 'STATIC tilt around the X axis (degrees). 23° matches Earth\'s axial tilt. Applied before rotation.',
            type: 'slider', min: -180, max: 180, step: 1, default: 23 },
        { key: 'tiltY', label: 'Tilt Y (Yaw)',
            description: 'STATIC tilt around the Y axis (degrees). Changes where the texture\'s "front" faces.',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },
        { key: 'tiltZ', label: 'Tilt Z (Roll)',
            description: 'STATIC tilt around the Z axis (degrees). Leans the sphere left/right.',
            type: 'slider', min: -180, max: 180, step: 5, default: 0 },
        { key: 'backfaceAlpha', label: 'Backface Alpha', type: 'slider', min: 0,   max: 1,   step: 0.05, default: 0.25 },
        { key: 'texture',       label: 'Texture',        type: 'texture', default: '' },
        { key: 'textureOpacity', label: 'Texture Opacity',
            description: 'Alpha multiplier applied to the textured surface. 1 = opaque, 0 = invisible. Useful for ghost / holographic looks.',
            type: 'slider', min: 0, max: 1, step: 0.05, default: 1.0 }
    ],
    render: renderSphereFrame
});
