/**
 * Generic template-part renderer + sheet/bbox helpers.
 *
 * Every imported part's `draw` function delegates to RR_CG_drawTemplatePart;
 * the CG body is currently authored as an imported part too, so this file is
 * the single hot path for ALL character pixels.
 */

function RR_CG_rowsContentBbox(rows) {
    let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
    if (!Array.isArray(rows)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    for (let y = 0; y < rows.length; y++) {
        const row = rows[y];
        const w = RR_CG_templateRowWidth(row);
        for (let x = 0; x < w; x++) {
            const ch = RR_CG_templateRowAt(row, x);
            if (!RR_CG_isTemplateBlank(ch)) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    return { minX, maxX, minY, maxY };
}

function RR_CG_sheetContentBbox(sheet) {
    let minX = Infinity, maxX = -1, minY = Infinity, maxY = -1;
    if (!Array.isArray(sheet)) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    for (const dir of sheet) {
        if (!Array.isArray(dir)) continue;
        for (const frame of dir) {
            if (!Array.isArray(frame)) continue;
            for (let y = 0; y < frame.length; y++) {
                const row = frame[y];
                const w = RR_CG_templateRowWidth(row);
                for (let x = 0; x < w; x++) {
                    const ch = RR_CG_templateRowAt(row, x);
                    if (!RR_CG_isTemplateBlank(ch)) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
        }
    }
    if (maxX < 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    return { minX, maxX, minY, maxY };
}

function RR_CG_canonicalSheetDims(sheet) {
    let w = 1, h = 1;
    if (!Array.isArray(sheet)) return { w, h };
    for (const dir of sheet) {
        if (!Array.isArray(dir)) continue;
        for (const frame of dir) {
            if (!Array.isArray(frame)) continue;
            if (frame.length > h) h = frame.length;
            for (const row of frame) w = Math.max(w, RR_CG_templateRowWidth(row));
        }
    }
    return { w, h };
}

function RR_CG_drawTemplatePart(buf, W, H, direction, frame, params, descriptor) {
    const template = descriptor && descriptor.template;
    if (!template || !template.palette || !template.sheet) return;
    const rawRows = template.sheet?.[direction]?.[frame];
    if (!Array.isArray(rawRows) || !rawRows.length) return;

    const resolved = RR_CG_resolveTemplatePalette(template.palette, params);
    if (!resolved) return;
    if (typeof window !== 'undefined') window._RR_CG_TEMPLATE_HAS_OUTLINE = true;

    const canonical = RR_CG_canonicalSheetDims(template.sheet);
    const templateW = canonical.w;
    const templateH = canonical.h;
    const rows = rawRows.map(r => RR_CG_padTemplateRow(r, templateW));
    const scale = Math.min(1, W / templateW, H / templateH);

    // Cell-based positioning: source cell (x, y) maps to a fixed canvas pixel
    // regardless of which part is drawing. That keeps every layer registered
    // to the same coordinate system as the body, so the artist's authored
    // position is what shows on screen.
    const freeX = W - templateW * scale;
    const freeY = H - templateH * scale;
    const ox = Math.round(freeX / 2);
    const oy = Math.round(freeY / 2);
    // alignX/alignY is applied as a GLOBAL silhouette shift computed once by
    // CharacterRenderer (based on the body's content bbox) and copied onto
    // every part's params. We add it here so all layers move together.
    const dxOff = (params.offsetX | 0) + (params._globalShiftPxX | 0);
    const dyOff = (params.offsetY | 0) + (params._globalShiftPxY | 0);
    const set = (x, y, c) => {
        const x0 = Math.floor(ox + x * scale) + dxOff;
        const y0 = Math.floor(oy + y * scale) + dyOff;
        const x1 = Math.ceil(ox + (x + 1) * scale) + dxOff;
        const y1 = Math.ceil(oy + (y + 1) * scale) + dyOff;
        pixRect(buf, W, H, x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0), c.r, c.g, c.b, 255);
    };

    for (let y = 0; y < rows.length; y++) {
        const row = rows[y];
        for (let x = 0; x < row.length; x++) {
            const ch = row[x];
            if (RR_CG_isTemplateBlank(ch)) continue;
            const color = resolved[String(ch)];
            if (!color) continue;
            set(x, y, color);
        }
    }
}

function RR_CG_templateRowWidth(row) {
    return (typeof row === 'string' || Array.isArray(row)) ? row.length : 0;
}

function RR_CG_templateRowAt(row, x) {
    if (typeof row === 'string' || Array.isArray(row)) return row[x];
    return null;
}

function RR_CG_isTemplateBlank(ch) {
    return ch === undefined || ch === null || ch === '' || ch === ' ' || ch === '.' || ch === -1;
}

function RR_CG_padTemplateRow(row, width) {
    if (Array.isArray(row)) {
        const out = row.slice();
        while (out.length < width) out.push(null);
        return out;
    }
    return String(row || '').padEnd(width, ' ');
}
