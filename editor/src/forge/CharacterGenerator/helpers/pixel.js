/**
 * Pixel-art drawing primitives for the Character Generator.
 *
 * All functions write directly into a Uint8ClampedArray (imageData.data),
 * 4 bytes per pixel (RGBA), row-major stride = W*4. Coordinates are integer
 * sprite-space pixels. No anti-aliasing — every function is hard-edged.
 *
 * Naming convention: pixXxx — distinguishes these from Canvas 2D API calls.
 */

/** Write a single pixel. Out-of-bounds writes are silently ignored. */
function pixSet(buf, W, x, y, r, g, b, a) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= W) return;
    const H = (buf.length / 4 / W) | 0;
    if (y >= H) return;
    const i = (y * W + x) * 4;
    buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
}

/** Read a pixel as {r,g,b,a}. Returns zeros for out-of-bounds. */
function pixGet(buf, W, H, x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return { r: 0, g: 0, b: 0, a: 0 };
    const i = (y * W + x) * 4;
    return { r: buf[i], g: buf[i+1], b: buf[i+2], a: buf[i+3] };
}

/** Fill an axis-aligned rectangle. */
function pixRect(buf, W, H, x, y, w, h, r, g, b, a) {
    const x1 = Math.max(0, x | 0);
    const y1 = Math.max(0, y | 0);
    const x2 = Math.min(W, ((x + w) | 0));
    const y2 = Math.min(H, ((y + h) | 0));
    for (let py = y1; py < y2; py++) {
        const row = py * W;
        for (let px = x1; px < x2; px++) {
            const i = (row + px) * 4;
            buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
        }
    }
}

/** Fill an axis-aligned ellipse. Uses integer pixel coverage (no AA). */
function pixEllipse(buf, W, H, cx, cy, rx, ry, r, g, b, a) {
    if (rx <= 0 || ry <= 0) return;
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(W - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(H - 1, Math.ceil(cy + ry));
    const rx2 = rx * rx, ry2 = ry * ry;
    for (let py = y0; py <= y1; py++) {
        const dy = py - cy;
        const row = py * W;
        for (let px = x0; px <= x1; px++) {
            const dx = px - cx;
            if (dx * dx * ry2 + dy * dy * rx2 <= rx2 * ry2) {
                const i = (row + px) * 4;
                buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
            }
        }
    }
}

/**
 * Scanline-fill a simple (non-self-intersecting) polygon.
 * verts: [{x, y}, ...] — order does not matter (even/odd scanline rule).
 */
function pixPoly(buf, W, H, verts, r, g, b, a) {
    const n = verts.length;
    if (n < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const v of verts) { minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    for (let py = y0; py <= y1; py++) {
        const xs = [];
        for (let i = 0; i < n; i++) {
            const va = verts[i], vb = verts[(i + 1) % n];
            if ((va.y <= py && vb.y > py) || (vb.y <= py && va.y > py)) {
                xs.push(va.x + (py - va.y) / (vb.y - va.y) * (vb.x - va.x));
            }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const px0 = Math.max(0, Math.ceil(xs[k]));
            const px1 = Math.min(W - 1, Math.floor(xs[k + 1]));
            for (let px = px0; px <= px1; px++) {
                const i = (py * W + px) * 4;
                buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
            }
        }
    }
}

/** Bresenham line. */
function pixLine(buf, W, H, x0, y0, x1, y1, r, g, b, a) {
    x0 = x0|0; y0 = y0|0; x1 = x1|0; y1 = y1|0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (let guard = 0; guard < 2000; guard++) {
        pixSet(buf, W, x0, y0, r, g, b, a);
        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx)  { err += dx; y0 += sy; }
    }
}

/**
 * Shaded horizontal span — fills pixels from xL to xR on row y using a
 * 3-tone palette (highlight on the left, shadow on the right). Each tone
 * covers a fixed fraction of the span width for the flat banded look
 * characteristic of late-SNES / early-PS1 pixel art.
 *
 * hl, base, shad: objects with {r, g, b} fields.
 */
function pixShadedSpan(buf, W, y, xL, xR, hl, base, shad) {
    if (xR < xL || y < 0 || y >= (buf.length / 4 / W)) return;
    const w = xR - xL + 1;
    const hlW  = Math.max(1, Math.round(w * 0.26));
    const shW  = Math.max(1, Math.round(w * 0.32));
    const hlEnd  = xL + hlW;
    const shStart = xR - shW + 1;
    for (let x = xL; x <= xR; x++) {
        const c = x < hlEnd ? hl : x >= shStart ? shad : base;
        const i = (y * W + x) * 4;
        buf[i] = c.r; buf[i+1] = c.g; buf[i+2] = c.b; buf[i+3] = 255;
    }
}

/**
 * Shaded trapezoid — fill from (topL→topR) at yTop to (botL→botR) at yBot
 * with per-scanline shading. Trapezoid edges are linearly interpolated.
 */
function pixShadedTrap(buf, W, H, topL, topR, botL, botR, yTop, yBot, pal) {
    const y0 = Math.max(0, yTop | 0);
    const y1 = Math.min(H - 1, (yBot - 1) | 0);
    const dy = yBot - yTop;
    for (let y = y0; y <= y1; y++) {
        const t = dy > 0 ? (y - yTop) / dy : 0;
        const xL = Math.round(topL + t * (botL - topL));
        const xR = Math.round(topR + t * (botR - topR));
        pixShadedSpan(buf, W, y, xL, xR, pal.highlight, pal.base, pal.shadow);
    }
}

/**
 * Scanline-fill a polygon with per-row left-to-right 3-tone shading (same
 * zone fractions as pixShadedSpan). Identical scan logic to pixPoly but each
 * row is shaded rather than flat-filled. Use for complex anatomical shapes that
 * trapezoids can't express (shoulder caps, elbow/knee bumps, organic curves).
 * pal: { highlight:{r,g,b}, base:{r,g,b}, shadow:{r,g,b} }
 */
function pixShadedPoly(buf, W, H, verts, pal) {
    const n = verts.length;
    if (n < 3) return;
    let minY = Infinity, maxY = -Infinity;
    for (const v of verts) { minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(H - 1, Math.ceil(maxY));
    for (let py = y0; py <= y1; py++) {
        const xs = [];
        for (let i = 0; i < n; i++) {
            const va = verts[i], vb = verts[(i + 1) % n];
            if ((va.y <= py && vb.y > py) || (vb.y <= py && va.y > py)) {
                xs.push(va.x + (py - va.y) / (vb.y - va.y) * (vb.x - va.x));
            }
        }
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            const xL = Math.max(0, Math.ceil(xs[k]));
            const xR = Math.min(W - 1, Math.floor(xs[k + 1]));
            if (xR >= xL) pixShadedSpan(buf, W, py, xL, xR, pal.highlight, pal.base, pal.shadow);
        }
    }
}

/**
 * Global 1px inner outline pass. Every opaque pixel adjacent to a transparent
 * (a=0) pixel or the canvas edge is replaced with the outline color.
 * Run AFTER all parts have drawn so the outline hugs the full character silhouette.
 */
function pixOutlinePass(buf, W, H, r, g, b, alphaThreshold = 200) {
    const flags = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (buf[(y * W + x) * 4 + 3] < alphaThreshold) continue;
            const onEdge =
                x === 0 || x === W - 1 || y === 0 || y === H - 1 ||
                buf[(y * W + x - 1) * 4 + 3] < alphaThreshold ||
                buf[(y * W + x + 1) * 4 + 3] < alphaThreshold ||
                buf[((y - 1) * W + x) * 4 + 3] < alphaThreshold ||
                buf[((y + 1) * W + x) * 4 + 3] < alphaThreshold;
            if (onEdge) flags[y * W + x] = 1;
        }
    }
    for (let i = 0; i < W * H; i++) {
        if (!flags[i]) continue;
        const idx = i * 4;
        buf[idx] = r; buf[idx+1] = g; buf[idx+2] = b; buf[idx+3] = 255;
    }
}
