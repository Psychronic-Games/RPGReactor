/**
 * RRFlagDesign - a flag's design in two layers: the field (a layout with
 * its own adjustments, a color per region, or a whole picture from the
 * project) and over it emblems, a list drawn in order, each a built-in
 * shape or a picture, placed, sized, turned, mirrored, and repeated in a
 * ring or a row.
 *
 * Colors are read at (u, v): u from the hoist (0) to the fly (1), v from
 * the top (0) to the foot (1); `a` is the cloth's height over its width.
 * Distances are in widths (the width is 1, the height a); sizes that should
 * look the same on any cloth go by its shorter side.
 */
(function(root) {
    'use strict';

    const Paint = root.RRPropPaint || (typeof require === 'function' ? require('./PropPaint.js') : null);

    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
    const pick = (v, list, d) => (list.includes(v) ? v : d);

    /** Field layouts and what their colors are for. */
    const LAYOUTS = [
        { id: 'solid', label: 'Solid', regions: ['Background'] },
        { id: 'bands', label: 'Bands', regions: ['Band 1', 'Band 2', 'Band 3', 'Band 4', 'Band 5'] },
        { id: 'stripes', label: 'Stripes', regions: ['Stripe', 'Second stripe'] },
        { id: 'cross', label: 'Cross', regions: ['Background', 'Cross', 'Outline'] },
        { id: 'saltire', label: 'Saltire', regions: ['Background', 'Cross'] },
        { id: 'quartered', label: 'Quartered', regions: ['Upper hoist', 'Upper fly', 'Lower hoist', 'Lower fly'] },
        { id: 'checker', label: 'Checkered', regions: ['Background', 'Second color'] },
        { id: 'bend', label: 'Diagonal bend', regions: ['Upper part', 'Bend', 'Lower part'] },
        { id: 'canton', label: 'Canton', regions: ['Background', 'Canton', 'Stars'] },
        { id: 'triangle', label: 'Hoist triangle', regions: ['Top band', 'Bottom band', 'Hoist triangle'] },
        { id: 'border', label: 'Border', regions: ['Background', 'Border'] },
        { id: 'image', label: 'Picture', regions: [] }
    ];
    const LAYOUT_BY_ID = new Map(LAYOUTS.map(l => [l.id, l]));
    const SHAPES = [['star', 'Star'], ['circle', 'Circle'], ['crescent', 'Crescent'], ['shield', 'Shield'], ['sun', 'Sun'], ['eagle', 'Eagle'],
        ['cross', 'Cross'], ['crown', 'Crown'], ['sword', 'Sword'], ['laurel', 'Laurel wreath'], ['gear', 'Cogwheel'], ['skull', 'Skull'], ['tree', 'Tree']];
    const PLACES = [['center', 'Center'], ['hoist', 'Hoist'], ['fly', 'Fly side'], ['canton', 'Canton'], ['tl', 'Top hoist corner'], ['tr', 'Top fly corner'], ['bl', 'Bottom hoist corner'], ['br', 'Bottom fly corner'], ['free', 'Free placement']];
    const REPEATS = [['none', 'None'], ['ring', 'Ring'], ['row', 'Row']];
    const CORNERS = [['tl', 'Top hoist corner'], ['tr', 'Top fly corner'], ['bl', 'Bottom hoist corner'], ['br', 'Bottom fly corner']];
    const MAX_LAYERS = 8;

    const FIELD = { layout: 'solid', colors: ['#8c1c1c', '#d9b23c', '#f2efe6', '#1f3c78', '#1d5c34'], count: 3, orient: 'h', sizes: [1, 1, 1, 1, 1], arm: 0.18, offset: 'center', outline: 0, canton: 0.45, corner: 'tl', depth: 0.5, border: 0.1, rows: 0, cols: 0 };
    const LAYER = { source: 'shape', shape: 'star', image: '', recolor: true, color: '#d9b23c', place: 'center', x: 0.5, y: 0.5, size: 0.5, rotate: 0, mirror: false, repeat: 'none', count: 5, spread: 0.6 };

    function normalizeLayer(l) {
        const o = Object.assign({}, LAYER, l && typeof l === 'object' ? l : {});
        return {
            source: pick(o.source, ['shape', 'picture'], 'shape'), shape: pick(o.shape, SHAPES.map(s => s[0]), 'star'), image: typeof o.image === 'string' ? o.image.slice(0, 200) : '',
            recolor: o.recolor !== false, color: color(o.color, LAYER.color), place: pick(o.place, PLACES.map(p => p[0]), 'center'),
            x: clamp(o.x, 0, 1, 0.5), y: clamp(o.y, 0, 1, 0.5), size: clamp(o.size, 0.05, 1.2, 0.5), rotate: clamp(o.rotate, -180, 180, 0), mirror: !!o.mirror,
            repeat: pick(o.repeat, REPEATS.map(r => r[0]), 'none'), count: Math.round(clamp(o.count, 2, 24, 5)), spread: clamp(o.spread, 0.1, 2, 0.6)
        };
    }

    /**
     * A design, from any recipe since the first: a round-1 design (`layout`,
     * four `colors`, one `emblem`) is read as its field and one emblem layer.
     */
    function normalize(input) {
        const g = input && typeof input === 'object' ? input : {};
        let field = g.field, layers = g.layers;
        if (!field) {
            // A round-1 design.
            const old = g.layout || 'solid', c = (g.colors || []).slice(0, 4);
            const legacy = {
                bands2h: { layout: 'bands', count: 2, orient: 'h' }, bands3h: { layout: 'bands', count: 3, orient: 'h' }, bands2v: { layout: 'bands', count: 2, orient: 'v' }, bands3v: { layout: 'bands', count: 3, orient: 'v' },
                nordic: { layout: 'cross', offset: 'nordic', arm: 0.17, outline: 0.04 }, saltire: { layout: 'saltire', arm: 0.2 }, canton: { layout: 'canton', canton: 0.42 },
                triangle: { layout: 'triangle' }, border: { layout: 'border' }, emblem: { layout: 'solid' }, image: { layout: 'image' }, solid: { layout: 'solid' }
            }[old] || { layout: 'solid' };
            field = Object.assign({}, legacy, { colors: c });
            if (!layers) {
                const e = g.emblem || {};
                const shape = old === 'emblem' && (!e.shape || e.shape === 'none') ? 'star' : e.shape;
                layers = shape && shape !== 'none' && old !== 'image' ? [{ source: 'shape', shape: shape === 'lion' ? 'eagle' : shape, color: e.color, size: e.size, place: old === 'emblem' ? 'center' : e.place || 'center' }] : [];
            }
        }
        const f = Object.assign({}, FIELD, field);
        const colors = [0, 1, 2, 3, 4].map(k => color((f.colors || [])[k], FIELD.colors[k]));
        return {
            field: {
                layout: pick(f.layout, LAYOUTS.map(l => l.id), 'solid'), colors, count: Math.round(clamp(f.count, 2, 13, 3)), orient: pick(f.orient, ['h', 'v'], 'h'),
                sizes: [0, 1, 2, 3, 4].map(k => clamp((f.sizes || [])[k], 0.2, 5, 1)), arm: clamp(f.arm, 0.04, 0.45, FIELD.arm), offset: pick(f.offset, ['center', 'nordic'], 'center'),
                outline: clamp(f.outline, 0, 0.12, 0), canton: clamp(f.canton, 0.2, 0.7, FIELD.canton), corner: pick(f.corner, CORNERS.map(c => c[0]), 'tl'),
                depth: clamp(f.depth, 0.15, 1, FIELD.depth), border: clamp(f.border, 0.02, 0.3, FIELD.border), rows: Math.round(clamp(f.rows, 0, 9, 0)), cols: Math.round(clamp(f.cols, 0, 12, 0))
            },
            layers: (Array.isArray(layers) ? layers : []).slice(0, MAX_LAYERS).map(normalizeLayer),
            image: typeof g.image === 'string' ? g.image.slice(0, 200) : ''
        };
    }

    // ── reading a design ───────────────────────────────────────────────────
    /** The canton's size in widths: `f.canton` of the width, as much again of the height and a quarter (a flag's upper hoist). */
    function cantonBox(f, a) { return [f.canton, Math.min(a, f.canton * 1.25 * a)]; }
    /** Where a layer's place puts its middle, in widths (x across, y down, the height `a`). */
    function anchor(layer, f, a) {
        const short = Math.min(1, a), m = Math.max(0.08, layer.size * 0.5 * short) + 0.04 * short;
        const [cw, ch] = cantonBox(f.layout === 'canton' ? f : { canton: 0.42 }, a);
        const right = f.layout === 'canton' && (f.corner === 'tr' || f.corner === 'br'), low = f.layout === 'canton' && (f.corner === 'bl' || f.corner === 'br');
        switch (layer.place) {
            case 'hoist': return [Math.min(0.25, m + 0.02), a / 2];
            case 'fly': return [1 - Math.min(0.25, m + 0.02), a / 2];
            case 'canton': return [right ? 1 - cw / 2 : cw / 2, low ? a - ch / 2 : ch / 2];
            case 'tl': return [m, m];
            case 'tr': return [1 - m, m];
            case 'bl': return [m, a - m];
            case 'br': return [1 - m, a - m];
            case 'free': return [layer.x, layer.y * a];
            default: return [0.5, a / 2];
        }
    }

    /** Every copy of a layer: its middles (a ring round its place, or a row through it), each `half` across. */
    function copies(layer, f, a) {
        const [cx, cy] = anchor(layer, f, a), short = Math.min(1, a), half = layer.size * 0.5 * short;
        if (layer.repeat === 'ring') {
            const available=Math.max(.015,Math.min(cx,1-cx,cy,a-cy)*.94),r=Math.min(layer.spread*short*.5,available*.70),fit=Math.min(half,available-r,r*Math.sin(Math.PI/layer.count)*.85),out=[];
            for (let k = 0; k < layer.count; k++) { const t = -Math.PI / 2 + k * Math.PI * 2 / layer.count; out.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r, fit]); }
            return out;
        }
        if (layer.repeat === 'row') {
            const available=Math.max(.015,Math.min(cx,1-cx)*.94),fit=Math.min(half,available/(1+(layer.count-1)*(.6+layer.spread)),Math.max(.01,Math.min(cy,a-cy)*.94)),step=fit*2*(.6+layer.spread),out=[];
            for (let k = 0; k < layer.count; k++) out.push([cx + (k - (layer.count - 1) / 2) * step, cy, fit]);
            return out;
        }
        return [[cx, cy, half]];
    }

    /**
     * A design read once for painting: colors as numbers, band edges, every
     * layer's copies and tests; `images` holds pictures by name.
     */
    function prepare(design, a, images) {
        const d = normalize(design), f = d.field, C = f.colors.map(Paint.hex);
        const P = { f, C, a, short: Math.min(1, a), image: d.image && images ? images[d.image] || null : null, layers: [] };
        if (f.layout === 'bands') {
            const n = f.count, sizes = f.sizes.slice(0, Math.min(5, n)), total = sizes.reduce((s, x) => s + x, 0);
            const edges = []; let run = 0;
            for (const s of sizes) { run += s / total; edges.push(run); }
            P.edges = edges;
        }
        for (const layer of d.layers) {
            const img = layer.source === 'picture' && layer.image && images ? images[layer.image] || null : null;
            if (layer.source === 'picture' && !img) continue;
            const test = layer.source === 'shape' ? Paint.EMBLEMS[layer.shape] : null;
            const rot = -layer.rotate * Math.PI / 180;
            P.layers.push({ layer, img, test, cos: Math.cos(rot), sin: Math.sin(rot), copies: copies(layer, f, a), color: Paint.hex(layer.color), aspect: img ? img.height / img.width : 1 });
        }
        return P;
    }

    const sample = [0, 0, 0, 0];

    /** The field's color at (u, v). */
    function fieldAt(P, u, v, out) {
        const f = P.f, C = P.C, a = P.a, x = u, y = v * a, short = P.short;
        let c = C[0];
        switch (f.layout) {
            case 'bands': {
                const t = f.orient === 'h' ? v : u;
                let k = 0;
                while (k < P.edges.length - 1 && t > P.edges[k]) k++;
                c = C[k];
                break;
            }
            case 'stripes': { const t = f.orient === 'h' ? v : u; c = C[Math.floor(t * f.count) % 2]; break; }
            case 'cross': {
                // A Nordic cross stands toward the hoist on a flag wider than tall.
                const cx = f.offset === 'nordic' ? 0.5 - 0.14 * Math.min(1, 1.5 * a) : 0.5;
                const arm = f.arm * short / 2, rim = f.outline * short;
                const dd = Math.min(Math.abs(x - cx), Math.abs(y - a / 2));
                c = dd < arm ? C[1] : dd < arm + rim ? C[2] : C[0];
                break;
            }
            case 'saltire': {
                const len = Math.hypot(1, a), dd = Math.min(Math.abs(x * a - y), Math.abs((1 - x) * a - y)) / len;
                c = dd < f.arm * short / 2 ? C[1] : C[0];
                break;
            }
            case 'quartered': c = C[(v < 0.5 ? 0 : 2) + (u < 0.5 ? 0 : 1)]; break;
            case 'checker': { const n = Math.max(2, f.cols || 6), m = Math.max(2, f.rows || Math.max(2, Math.round(n * a))); c = C[(Math.floor(u * n) + Math.floor(v * m)) % 2]; break; }
            case 'bend': {
                // A band from the top of the hoist to the foot of the fly.
                const len = Math.hypot(1, a), s = (x * a - y) / len, w = f.arm * short / 2;
                c = Math.abs(s) < w ? C[1] : s > 0 ? C[0] : C[2];
                break;
            }
            case 'canton': {
                const [cw, ch] = cantonBox(f, a);
                const cu = f.corner === 'tr' || f.corner === 'br' ? 1 - u : u, cv = f.corner === 'bl' || f.corner === 'br' ? a - y : y;
                const inCanton = cu < cw && cv < ch;
                c = inCanton ? C[1] : C[0];
                // Stars in the canton, in staggered rows.
                if (inCanton && f.rows > 0 && f.cols > 0) {
                    const cellW = cw / f.cols, cellH = ch / f.rows, r = Math.min(cellW, cellH) * 0.42;
                    const row = Math.floor(cv / cellH), offset = row % 2 ? cellW / 2 : 0, col = Math.floor((cu - offset) / cellW);
                    if (col >= 0 && col < f.cols - (row % 2 ? 1 : 0)) {
                        const sx = (cu - offset - (col + 0.5) * cellW) / r, sy = (cv - (row + 0.5) * cellH) / r;
                        if (Math.abs(sx) <= 1 && Math.abs(sy) <= 1 && Paint.EMBLEMS.star(sx, sy)) c = C[2];
                    }
                }
                break;
            }
            case 'triangle': {
                const tip = Math.min(1, f.depth * Math.max(a, 0.5) * 1.1);
                c = u < tip * (1 - Math.abs(v - 0.5) * 2) ? C[2] : v < 0.5 ? C[0] : C[1];
                break;
            }
            case 'border': c = Math.min(x, 1 - x, y, a - y) / short < f.border ? C[1] : C[0]; break;
            case 'image':
                if (P.image) { Paint.sampleImage(P.image, u, v, out); return out; }
                break;
        }
        out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; out[3] = 255;
        return out;
    }

    /** The design's color at (u, v): the field, then each emblem layer over it in order. */
    function colorAt(P, u, v, out) {
        fieldAt(P, u, v, out);
        const x = u, y = v * P.a;
        for (const L of P.layers) {
            for (const [cx, cy, half] of L.copies) {
                let dx = (x - cx) / half, dy = (y - cy) / half;
                if (dx < -1.5 || dx > 1.5 || dy < -1.5 || dy > 1.5) continue;
                const lx = dx * L.cos - dy * L.sin, ly = dx * L.sin + dy * L.cos;
                dx = L.layer.mirror ? -lx : lx; dy = ly;
                if (L.test) {
                    if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1 && L.test(dx, dy)) { out[0] = L.color[0]; out[1] = L.color[1]; out[2] = L.color[2]; }
                    continue;
                }
                // A picture fits its box, its own proportions kept; its transparency lets the field show.
                const ar = L.aspect, w = ar > 1 ? 1 / ar : 1, h = ar > 1 ? 1 : ar;
                if (Math.abs(dx) > w || Math.abs(dy) > h) continue;
                Paint.sampleImage(L.img, (dx / w + 1) / 2, (dy / h + 1) / 2, sample);
                const alpha = sample[3] / 255;
                if (alpha <= 0.01) continue;
                const src = L.layer.recolor ? L.color : sample;
                for (let k = 0; k < 3; k++) out[k] = out[k] + (src[k] - out[k]) * alpha;
            }
        }
        return out;
    }

    /** Pictures a design names (the whole-flag picture and picture layers), to load. */
    function pictures(design) {
        const d = normalize(design), out = [];
        if (d.field.layout === 'image' && d.image) out.push(d.image);
        for (const l of d.layers) if (l.source === 'picture' && l.image) out.push(l.image);
        return out;
    }

    /** Made-up flags that show what the layers do: a kingdom, a free city, a guild, a noble house, a republic, a holy order. */
    const PRESETS = [
        { id: 'kingdom', label: 'Kingdom', design: { field: { layout: 'cross', offset: 'nordic', arm: 0.2, outline: 0.04, colors: ['#1f3c78', '#d9b23c', '#f2efe6'] }, layers: [{ shape: 'crown', color: '#d9b23c', place: 'tl', size: 0.32 }] } },
        { id: 'city', label: 'Free city', design: { field: { layout: 'bands', count: 2, orient: 'v', colors: ['#a51f2b', '#f2efe6'] }, layers: [{ shape: 'gear', color: '#2b2b30', size: 0.55 }, { shape: 'tree', color: '#1d5c34', size: 0.22 }] } },
        { id: 'guild', label: 'Merchant guild', design: { field: { layout: 'border', border: 0.08, colors: ['#1d5c34', '#d9b23c'] }, layers: [{ shape: 'circle', color: '#d9b23c', size: 0.36 }, { shape: 'star', color: '#d9b23c', size: 0.12, repeat: 'ring', count: 8, spread: 0.62 }] } },
        { id: 'house', label: 'Noble house', design: { field: { layout: 'saltire', arm: 0.16, colors: ['#1b1b1f', '#8a8e96'] }, layers: [{ shape: 'shield', color: '#7a1a22', size: 0.5 }, { shape: 'skull', color: '#e8e4d8', size: 0.26 }] } },
        { id: 'republic', label: 'Republic', design: { field: { layout: 'bands', count: 3, orient: 'h', sizes: [1, 2, 1], colors: ['#c8501e', '#f2efe6', '#0f5c78'] }, layers: [{ shape: 'sun', color: '#c8501e', size: 0.42 }] } },
        { id: 'order', label: 'Holy order', design: { field: { layout: 'canton', canton: 0.4, rows: 3, cols: 4, colors: ['#f2efe6', '#5a2a6e', '#e8c45a'] }, layers: [{ shape: 'laurel', color: '#5a2a6e', size: 0.55, place: 'free', x: 0.66, y: 0.55 }, { shape: 'sword', color: '#5a2a6e', size: 0.42, place: 'free', x: 0.66, y: 0.55 }] } }
    ];

    const api = { LAYOUTS, LAYOUT_BY_ID, SHAPES, PLACES, REPEATS, CORNERS, MAX_LAYERS, LAYER, FIELD, PRESETS, normalize, normalizeLayer, prepare, colorAt, fieldAt, copies, anchor, pictures };
    root.RRFlagDesign = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
