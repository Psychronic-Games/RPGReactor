/**
 * RRPictureProp - Forge › Prop Builder's From picture: a picture from the
 * project made into a solid prop, three ways.
 *
 * Cut-out: the picture's outline (its transparency, or its background color
 * taken away) traced, smoothed and simplified, made solid with the picture
 * on its face; a back, an edge, and a stand or a post if wanted.
 * Turned: half an outline (the picture's own silhouette, or points the
 * author moves) turned about an upright axis into a solid of revolution,
 * hollow if it has a wall, with the picture laid on from the front or a
 * material of its own.
 * Framed: the picture on a made object: a framed painting, a poster, a
 * hanging banner (the Flag's cloth, baked the same way), a crate or a book.
 *
 * Pictures are { width, height, data (RGBA) }, row 0 at the top, handed in
 * by name in `options.images`.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Rand = need('RRPropRandom', './PropRandom.js');
    const Paint = need('RRPropPaint', './PropPaint.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const Flag = need('RRFlagProp', './FlagProp.js');
    const Framed = need('RRFramedProp', './FramedProp.js');

    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
    const pick = (v, list, d) => (list.includes(v) ? v : d);

    const MODES = [['cutout', 'Cut-out'], ['turned', 'Turned'], ['framed', 'Framed']];
    const OUTLINES = [['auto', 'Automatic'], ['alpha', 'Transparency'], ['color', 'Background color']];
    const EDGES = [['bevel', 'Beveled'], ['round', 'Rounded'], ['square', 'Square-cut']];
    const BACKS = [['mirror', 'The picture'], ['color', 'A color'], ['wood', 'Wood']];
    const STANDS = [['none', 'None'], ['stand', 'Stand'], ['post', 'Post']];
    const BACKINGS = [['plate', 'Backing plate'], ['none', 'None']];
    const SURFACES = [['picture', 'The picture'], ['clay', 'Clay'], ['glazed', 'Glazed'], ['wood', 'Wood'], ['metal', 'Polished metal'], ['stone', 'Stone']];
    const OBJECTS = Framed.OBJECTS;
    /** A vase, bottom to top: [radius, height] with the height 1. */
    const VASE = [[0.16, 0], [0.24, 0.08], [0.3, 0.3], [0.27, 0.55], [0.13, 0.78], [0.11, 0.9], [0.15, 1]];

    const DEFAULT = {
        kind: 'picture', mode: 'cutout', image: '',
        cutout: { outline: 'auto', tolerance: 0.25, size: 1, thickness: 0.04, edge: 'bevel', back: 'wood', backColor: '#5a4632', stand: 'none', backing: 'plate' },
        turned: { profile: VASE, fromPicture: true, height: 0.6, segments: 64, top: 'open', wall: 0.015, surface: 'picture', color: '#b86a44' },
        framed: Framed.DEFAULT
    };

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {}, d = DEFAULT;
        const c = r.cutout || {}, t = r.turned || {}, f = r.framed || {};
        let profile = Array.isArray(t.profile) ? t.profile.filter(p => Array.isArray(p) && p.length >= 2).map(p => [clamp(p[0], 0, 0.6, 0.2), clamp(p[1], 0, 1, 0)]) : d.turned.profile;
        profile.sort((a, b) => a[1] - b[1]);
        if (profile.length < 2) profile = d.turned.profile;
        return {
            kind: 'picture', mode: pick(r.mode, MODES.map(m => m[0]), d.mode), image: typeof r.image === 'string' ? r.image.slice(0, 200) : '',
            cutout: {
                outline: pick(c.outline, OUTLINES.map(o => o[0]), 'auto'), tolerance: clamp(c.tolerance, 0, 1, d.cutout.tolerance),
                size: clamp(c.size, 0.1, 6, d.cutout.size), thickness: clamp(c.thickness, 0.005, 0.5, d.cutout.thickness),
                edge: pick(c.edge, EDGES.map(e => e[0]), d.cutout.edge), back: pick(c.back, BACKS.map(b => b[0]), d.cutout.back),
                backColor: color(c.backColor, d.cutout.backColor), stand: pick(c.stand, STANDS.map(s => s[0]), 'none'),
                backing: pick(c.backing, BACKINGS.map(b => b[0]), 'plate')
            },
            turned: {
                profile: profile.map(p => [Math.round(p[0] * 10000) / 10000, Math.round(p[1] * 10000) / 10000]), fromPicture: t.fromPicture !== false,
                height: clamp(t.height, 0.05, 8, d.turned.height), segments: Math.round(clamp(t.segments, 8, 128, d.turned.segments)),
                top: pick(t.top, ['open', 'closed'], 'open'), wall: clamp(t.wall, 0, 0.2, d.turned.wall),
                surface: pick(t.surface, SURFACES.map(s => s[0]), 'picture'), color: color(t.color, d.turned.color)
            },
            framed: Framed.normalize(f)
        };
    }

    // ── the outline ────────────────────────────────────────────────────────
    function hasAlpha(img) { let clear = 0; for (let i = 3; i < img.data.length; i += 4) if (img.data[i] < 128) clear++; return clear > img.data.length / 4 * 0.01; }

    /**
     * Which pixels are the thing, at most `limit` on a side: solid where the
     * picture is opaque, or where it is not the background color (the
     * color most common along its border) within `tolerance`, including
     * enclosed openings. Specks and pinholes smaller than a few pixels go.
     */
    function maskOf(img, outline, tolerance, limit) {
        const s = Math.min(1, (limit || 256) / Math.max(img.width, img.height));
        const w = Math.max(2, Math.round(img.width * s)), h = Math.max(2, Math.round(img.height * s));
        const px = new Uint8Array(w * h * 4), out = [0, 0, 0, 0];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { Paint.sampleImage(img, (x + 0.5) / w, (y + 0.5) / h, out); px.set(out.map(v => Math.round(v)), (y * w + x) * 4); }
        const mode = outline === 'auto' ? (hasAlpha(img) ? 'alpha' : 'color') : outline;
        const m = new Uint8Array(w * h);
        if (mode === 'alpha') for (let i = 0; i < w * h; i++) m[i] = px[i * 4 + 3] > 127 ? 1 : 0;
        else {
            // The background: the commonest color along the border (to 1/16 of each channel).
            const counts = new Map();
            const border = [];
            for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
            for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
            for (const i of border) { const k = (px[i * 4] >> 4) << 8 | (px[i * 4 + 1] >> 4) << 4 | (px[i * 4 + 2] >> 4); counts.set(k, (counts.get(k) || 0) + 1); }
            let best = 0, bk = 0;
            for (const [k, n] of counts) if (n > best) { best = n; bk = k; }
            let br = 0, bg = 0, bb = 0, bn = 0;
            for (const i of border) { const k = (px[i * 4] >> 4) << 8 | (px[i * 4 + 1] >> 4) << 4 | (px[i * 4 + 2] >> 4); if (k === bk) { br += px[i * 4]; bg += px[i * 4 + 1]; bb += px[i * 4 + 2]; bn++; } }
            br /= bn; bg /= bn; bb /= bn;
            const limitD = 12 + tolerance * 160;
            const isBg = i => px[i * 4 + 3] < 128 || Math.hypot(px[i * 4] - br, px[i * 4 + 1] - bg, px[i * 4 + 2] - bb) < limitD;
            // Color-key removal must also cut out the center of a ring or
            // gaps enclosed by lettering. Flooding only from the border
            // left those pixels solid despite selecting the same background.
            for (let i = 0; i < m.length; i++) m[i] = isBg(i) ? 0 : 1;
        }
        clean(m, w, h);
        return { w, h, m, mode, scale: s };
    }

    /** Removes bits of the mask (solid or empty) smaller than about four pixels across. */
    function clean(m, w, h) {
        const seen = new Int32Array(w * h).fill(-1), small = Math.max(12, w * h * 0.0004);
        for (let start = 0; start < w * h; start++) {
            if (seen[start] >= 0) continue;
            const v = m[start], list = [start], stack = [start];
            seen[start] = start;
            let edge = false;
            while (stack.length) {
                const i = stack.pop(), x = i % w, y = (i - x) / w;
                if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
                for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && seen[j] < 0 && m[j] === v) { seen[j] = start; stack.push(j); list.push(j); }
            }
            // A small solid speck goes; a small empty pinhole fills (not the surroundings).
            if (list.length < small && !(v === 0 && edge)) for (const i of list) m[i] = v ? 0 : 1;
        }
    }

    /**
     * The mask's outlines, as loops of points along pixel edges (x right, y
     * down, in mask pixels). Each loop runs clockwise on screen around solid
     * (outsides) or counterclockwise (holes); where two solid pixels touch
     * only at a corner they stay apart.
     */
    function trace(mask) {
        const { w, h, m } = mask, at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h ? m[y * w + x] : 0);
        const W1 = w + 1, next = new Map();
        const add = (ax, ay, bx, by) => { const k = ay * W1 + ax; if (!next.has(k)) next.set(k, []); next.get(k).push(by * W1 + bx); };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!at(x, y)) continue;
            if (!at(x, y - 1)) add(x, y, x + 1, y);
            if (!at(x + 1, y)) add(x + 1, y, x + 1, y + 1);
            if (!at(x, y + 1)) add(x + 1, y + 1, x, y + 1);
            if (!at(x - 1, y)) add(x, y + 1, x, y);
        }
        const loops = [];
        for (const [startKey, outs] of next) {
            while (outs.length) {
                const loop = [];
                let from = startKey, to = outs.pop(), guard = 0;
                loop.push(from % W1, Math.floor(from / W1));
                while (to !== startKey && guard++ < 1e7) {
                    loop.push(to % W1, Math.floor(to / W1));
                    const choices = next.get(to);
                    if (!choices || !choices.length) break;
                    let k = 0;
                    if (choices.length > 1) {
                        // At a corner shared by two runs: turn right, keeping diagonal pixels apart.
                        const dx = to % W1 - from % W1, dy = Math.floor(to / W1) - Math.floor(from / W1);
                        k = choices.findIndex(c => { const ex = c % W1 - to % W1, ey = Math.floor(c / W1) - Math.floor(to / W1); return dx * ey - dy * ex > 0; });
                        if (k < 0) k = 0;
                    }
                    from = to; to = choices.splice(k, 1)[0];
                }
                if (loop.length >= 8) loops.push(loop);
            }
        }
        return loops;
    }

    function signedArea(loop) {
        let a = 0;
        for (let i = 0, j = loop.length - 2; i < loop.length; j = i, i += 2) a += (loop[j] * loop[i + 1] - loop[i] * loop[j + 1]);
        return a / 2;
    }

    /** A loop softened (its stair steps averaged away), then thinned to within `tolerance` of itself (Douglas-Peucker, closed). */
    function smooth(loop, passes) {
        let p = loop;
        for (let s = 0; s < (passes ?? 2); s++) {
            const n = p.length / 2, q = new Array(p.length);
            for (let i = 0; i < n; i++) {
                const a = ((i + n - 1) % n) * 2, b = i * 2, c = ((i + 1) % n) * 2;
                q[b] = 0.25 * p[a] + 0.5 * p[b] + 0.25 * p[c]; q[b + 1] = 0.25 * p[a + 1] + 0.5 * p[b + 1] + 0.25 * p[c + 1];
            }
            p = q;
        }
        return p;
    }

    function simplify(loop, tolerance) {
        const n = loop.length / 2;
        if (n <= 4) return loop.slice();
        // Split at the point farthest from the first, then thin each half.
        let far = 0, fd = -1;
        for (let i = 1; i < n; i++) { const d = (loop[i * 2] - loop[0]) ** 2 + (loop[i * 2 + 1] - loop[1]) ** 2; if (d > fd) { fd = d; far = i; } }
        const keep = new Uint8Array(n);
        keep[0] = keep[far] = 1;
        const dp = (a, b) => {
            const ax = loop[a * 2], ay = loop[a * 2 + 1], bx = loop[(b % n) * 2], by = loop[(b % n) * 2 + 1];
            const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1e-9;
            let worst = -1, wi = -1;
            for (let i = a + 1; i < b; i++) {
                const k = i % n, d = Math.abs((loop[k * 2] - ax) * dy - (loop[k * 2 + 1] - ay) * dx) / l;
                if (d > worst) { worst = d; wi = i; }
            }
            if (worst > tolerance) { keep[wi % n] = 1; dp(a, wi); dp(wi, b); }
        };
        dp(0, far); dp(far, n);
        const out = [];
        for (let i = 0; i < n; i++) if (keep[i]) out.push(loop[i * 2], loop[i * 2 + 1]);
        return out;
    }

    /**
     * The picture's shapes: [{ outer, holes: [...] }] in mask pixels, smoothed
     * and thinned until all of them together have at most `budget` points.
     */
    function shapes(mask, budget) {
        const raw = trace(mask).map(l => smooth(l, 2));
        let tolerance = 0.6, simple;
        for (let tries = 0; tries < 12; tries++) {
            simple = raw.map(l => simplify(l, tolerance)).filter(l => l.length >= 6 && Math.abs(signedArea(l)) > 2);
            if (simple.reduce((s, l) => s + l.length / 2, 0) <= (budget || 500)) break;
            tolerance *= 1.4;
        }
        // On screen (y down) outsides run clockwise: a positive area by the formula above.
        const outers = simple.filter(l => signedArea(l) > 0).map(l => ({ outer: l, holes: [], area: signedArea(l) }));
        const holes = simple.filter(l => signedArea(l) < 0);
        for (const hole of holes) {
            // In the smallest outside around it.
            const inside = outers.filter(o => Paint.pointInPolygon(o.outer, hole[0], hole[1]) || Paint.pointInPolygon(o.outer, (hole[0] + hole[2]) / 2, (hole[1] + hole[3]) / 2)).sort((a, b) => a.area - b.area)[0];
            if (inside) inside.holes.push(hole);
        }
        return outers;
    }

    /** The mask grown by `r` pixels all round (a square of reach). */
    function dilate(mask, r) {
        const { w, h, m } = mask, out = new Uint8Array(w * h), row = new Uint8Array(w * h);
        // Along the rows first, then down the columns.
        for (let y = 0; y < h; y++) {
            let last = -1e9;
            for (let x = 0; x < w; x++) { if (m[y * w + x]) last = x; row[y * w + x] = x - last <= r ? 1 : 0; }
            last = 1e9;
            for (let x = w - 1; x >= 0; x--) { if (m[y * w + x]) last = x; if (last - x <= r) row[y * w + x] = 1; }
        }
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            if (!row[y * w + x]) continue;
            for (let dy = -r; dy <= r; dy++) { const yy = y + dy; if (yy >= 0 && yy < h) out[yy * w + x] = 1; }
        }
        return { w, h, m: out, mode: mask.mode, scale: mask.scale };
    }

    /** The picture with the thing's edge colors spread outward over what was taken away, so its rim never shows the background. */
    function bleed(img, mask, reach) {
        const w = img.width, h = img.height, data = Uint8Array.from(img.data), solid = new Uint8Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const mx = Math.min(mask.w - 1, Math.floor(x / w * mask.w)), my = Math.min(mask.h - 1, Math.floor(y / h * mask.h));
            solid[y * w + x] = mask.m[my * mask.w + mx] && img.data[(y * w + x) * 4 + 3] > 16 ? 1 : 0;
        }
        for (let pass = 0; pass < (reach || 8); pass++) {
            const grown = Uint8Array.from(solid);
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const i = y * w + x;
                if (solid[i]) continue;
                let r = 0, g = 0, b = 0, n = 0;
                for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && solid[j]) { r += data[j * 4]; g += data[j * 4 + 1]; b += data[j * 4 + 2]; n++; }
                if (n) { data[i * 4] = r / n; data[i * 4 + 1] = g / n; data[i * 4 + 2] = b / n; grown[i] = 1; }
            }
            solid.set(grown);
        }
        for (let i = 3; i < data.length; i += 4) data[i] = 255;
        return { width: w, height: h, data, name: 'picture.png' };
    }

    // ── pictures the props are made of ─────────────────────────────────────
    const woodPicture = (base, seed) => Paint.wood(base, seed);

    // ── Cut-out ────────────────────────────────────────────────────────────
    function cutout(r, img, cache) {
        const o = r.cutout;
        // Points the outline may keep: about 3,600 triangles whatever the edge (a rounded rim has more rows).
        const rows = o.edge === 'square' ? 2 : o.edge === 'round' ? 6 : 4, budget = Math.floor(3600 / (2 * (rows - 1) + 2));
        const key = JSON.stringify([r.image, img.width, img.height, img.version || 0, o.outline, o.tolerance, budget]);
        if (cache.cutKey !== key) {
            const mask = maskOf(img, o.outline, o.tolerance, 256);
            const list = shapes(mask, budget);
            // Pieces apart (letters, a logo's parts) are held together by a plate behind them: their outline grown until it joins.
            let plate = null;
            if (list.length > 1) {
                let grown = mask;
                for (let r = Math.round(Math.max(mask.w, mask.h) * 0.025); r <= Math.max(mask.w, mask.h) * 0.12; r += Math.max(2, Math.round(Math.max(mask.w, mask.h) * 0.015))) {
                    grown = dilate(mask, r);
                    const pieces = shapes(grown, 160);
                    if (pieces.length === 1) { plate = pieces; break; }
                    plate = pieces;
                }
            }
            cache.cut = { mask, shapes: list, plate, picture: bleed(img, mask, 10) };
            cache.cutKey = key;
        }
        const { mask, shapes: list, plate, picture } = cache.cut;
        if (!list.length) return null;
        // Mask pixels to meters: the thing as tall as asked, standing on its foot (or its post), centered.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const s of list) for (let i = 0; i < s.outer.length; i += 2) { minX = Math.min(minX, s.outer[i]); maxX = Math.max(maxX, s.outer[i]); minY = Math.min(minY, s.outer[i + 1]); maxY = Math.max(maxY, s.outer[i + 1]); }
        const scale = o.size / Math.max(1e-6, maxY - minY), post = o.stand === 'post' ? o.size * 0.9 : 0;
        const cx = (minX + maxX) / 2;
        const toWorld = (x, y) => [(x - cx) * scale, (maxY - y) * scale + post];
        const front = [], back = [], rim = [];
        for (const s of list) {
            const loops = [s.outer].concat(s.holes).map(l => { const out = []; for (let i = 0; i < l.length; i += 2) out.push(...toWorld(l[i], l[i + 1])); return out; });
            const uvOf = (x, y) => [(x / scale + cx) / mask.w, (maxY - (y - post) / scale) / mask.h];
            const solid = Mesh.extrude(loops, o.thickness, { bevel: o.edge === 'square' ? 0 : Math.min(o.thickness * 0.35, 0.02), round: o.edge === 'round', uvOf, split: true });
            front.push(solid.front); back.push(solid.back); rim.push(solid.rim);
        }
        const parts = [];
        const wood = o.back === 'wood' || o.stand !== 'none' || (plate && o.backing === 'plate' && o.back !== 'color');
        let minY0 = Infinity;
        parts.push(Object.assign(Mesh.merge(front), { name: 'Front', texture: 'picture.png', roughness: 0.7 }));
        const backMesh = Mesh.merge(back);
        if (o.back === 'mirror') parts.push(Object.assign(backMesh, { name: 'Back', texture: 'picture.png', roughness: 0.7 }));
        else if (o.back === 'wood') parts.push(Object.assign(woodUv(backMesh, 1.5), { name: 'Back', texture: 'wood.png', roughness: 0.8 }));
        else parts.push(Object.assign(backMesh, { name: 'Back', color: o.backColor, roughness: 0.75 }));
        // The edge: wood, or the back's color.
        const rimMesh = Mesh.merge(rim);
        parts.push(o.back === 'color' ? Object.assign(rimMesh, { name: 'Edge', color: o.backColor, roughness: 0.75 }) : Object.assign(woodUv(rimMesh, 1.5), { name: 'Edge', texture: 'wood.png', roughness: 0.8 }));
        let width = (maxX - minX) * scale, z0 = -o.thickness / 2;
        if (plate && o.backing === 'plate') {
            // The plate, a little thinner than the pieces, right behind them.
            const depth = Math.max(0.006, o.thickness * 0.6), boards = [];
            for (const s of plate) {
                const loops = [s.outer].concat(s.holes).map(l => { const out = []; for (let i = 0; i < l.length; i += 2) out.push(...toWorld(l[i], l[i + 1])); return out; });
                boards.push(Mesh.transform(Mesh.extrude(loops, depth, { bevel: Math.min(depth * 0.35, 0.01) }), ([x, y, z]) => [x, y, z + z0 - depth / 2]));
            }
            const board = Mesh.merge(boards);
            for (let i = 1; i < board.positions.length; i += 3) minY0 = Math.min(minY0, board.positions[i]);
            parts.push(o.back === 'color' ? Object.assign(board, { name: 'Backing', color: o.backColor, roughness: 0.75 }) : Object.assign(woodUv(board, 1.5), { name: 'Backing', texture: 'wood.png', roughness: 0.8 }));
            z0 -= depth;
            // The plate reaches lower than the pieces: everything up, so it stands where they would.
            const lift = post - minY0;
            if (lift > 0) for (const p of parts) Mesh.transform(p, ([x, y, z]) => [x, y + lift, z]);
        }
        if (o.stand === 'stand') {
            // A foot behind the bottom, as deep as a third of the height, and a brace up the back.
            const depth = Math.max(0.12, o.size * 0.3), foot = Math.min(width * 0.6, Math.max(0.15, o.size * 0.35));
            parts.push(Object.assign(woodUv(Mesh.merge([
                Mesh.box([0, 0.015, z0 - depth / 2], [foot, 0.03, depth]),
                Mesh.box([0, o.size * 0.22, z0 - 0.012], [Math.max(0.03, foot * 0.18), o.size * 0.44, 0.024])
            ]), 1.5), { name: 'Stand', texture: 'wood.png', roughness: 0.8 }));
        } else if (o.stand === 'post') {
            const t = Math.max(0.05, o.size * 0.08);
            parts.push(Object.assign(woodUv(Mesh.box([0, (post + o.size * 0.6) / 2, z0 - t / 2], [t, post + o.size * 0.6, t]), 1.5), { name: 'Post', texture: 'wood.png', roughness: 0.8 }));
        }
        return { parts, pieces: list.length, textures: { 'picture.png': picture, 'wood.png': wood ? woodPicture(o.back === 'wood' ? '#8a6440' : '#7a5838', 5) : null } };
    }

    const woodUv = (mesh, scale) => Mesh.planarUv(mesh, scale);

    // ── Turned ─────────────────────────────────────────────────────────────
    /**
     * Half the picture's silhouette as a profile: for each row the thing's
     * half width about its middle, bottom to top, in heights (the height 1).
     */
    function profileFromPicture(img, outline, tolerance) {
        const mask = maskOf(img, outline, tolerance, 160);
        const { w, h, m } = mask, rows = [];
        let axisSum = 0, axisN = 0;
        for (let y = 0; y < h; y++) {
            let l = -1, rr = -1;
            for (let x = 0; x < w; x++) if (m[y * w + x]) { if (l < 0) l = x; rr = x + 1; }
            if (l >= 0) { rows.push({ y, l, r: rr }); axisSum += (l + rr) / 2; axisN++; }
        }
        if (rows.length < 3) return null;
        const axis = axisSum / axisN, top = rows[0].y, bottom = rows[rows.length - 1].y + 1, H = bottom - top;
        const raw = rows.map(row => [Math.max(row.r - axis, axis - row.l) / H, (bottom - row.y - 0.5) / H]).reverse();
        // Twenty-four rows, evenly up the height, each the average of its band.
        const out = [];
        const N = 24;
        for (let k = 0; k <= N; k++) {
            const y = k / N, band = raw.filter(p => Math.abs(p[1] - y) <= 0.5 / N + 1e-6);
            const rad = band.length ? band.reduce((s, p) => s + p[0], 0) / band.length : (out.length ? out[out.length - 1][0] : 0.1);
            out.push([Math.round(rad * 10000) / 10000, y]);
        }
        return { profile: thin(out, 0.004), axis: axis / w, top: top / h, bottom: bottom / h, width: w, height: h };
    }

    /** Profile points dropped where they lie within `tolerance` of the line through their neighbors. */
    function thin(profile, tolerance) {
        const keep = [profile[0]];
        for (let i = 1; i < profile.length - 1; i++) {
            const a = keep[keep.length - 1], b = profile[i], c = profile[i + 1];
            const dx = c[0] - a[0], dy = c[1] - a[1], l = Math.hypot(dx, dy) || 1;
            if (Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / l > tolerance) keep.push(b);
        }
        keep.push(profile[profile.length - 1]);
        return keep;
    }

    /**
     * The closed outline turned: up the outside from the foot's middle, over
     * the lip and, hollow, down the inside to the floor's middle (both ends on
     * the axis), so the solid is closed everywhere. Heights and radii in
     * meters.
     */
    function turnedOutline(profile, height, wall, top) {
        const outer = profile.map(([rad, y]) => [Math.max(0.0005, rad * height), y * height]);
        const pts = [[0, 0]].concat(outer);
        const lip = outer[outer.length - 1];
        if (top === 'closed' || wall <= 0) { pts.push([0, lip[1]]); return pts; }
        const w = Math.min(wall, Math.min(...outer.map(p => p[0])) * 0.9);
        const floor = Math.min(w * 1.5, height * 0.3);
        // Down the inside: each outside point moved in by the wall (along the outline's own normal), above the floor.
        const inner = [];
        for (let i = outer.length - 1; i >= 0; i--) {
            const a = outer[Math.max(0, i - 1)], b = outer[Math.min(outer.length - 1, i + 1)];
            const ty = b[1] - a[1], tr = b[0] - a[0], l = Math.hypot(ty, tr) || 1;
            const nr = ty / l, ny = -tr / l;
            const rr = outer[i][0] - nr * w, yy = outer[i][1] - ny * w;
            if (yy > floor && rr > 0.0005) inner.push([rr, Math.min(yy, lip[1])]);
        }
        if (inner.length) inner[0][1] = lip[1];
        pts.push(...inner, [Math.max(0.0005, inner.length ? inner[inner.length - 1][0] : w), floor], [0, floor]);
        return pts;
    }

    /** A closed outline turned `segments` times around the y axis; ends on the axis meet in a point. Watertight. */
    function revolve(outline, segments, sharp) {
        const seg = Math.max(3, segments | 0), P = [], N = [], T = [], I = [];
        const n = outline.length;
        // Normals per span (square to it, pointing out of the solid: the outline runs up the outside).
        const spans = [];
        for (let k = 0; k < n - 1; k++) { const [r0, y0] = outline[k], [r1, y1] = outline[k + 1], l = Math.hypot(r1 - r0, y1 - y0) || 1; spans.push([(y1 - y0) / l, -(r1 - r0) / l]); }
        let total = 0;
        const along = outline.map((p, k) => (k ? (total += Math.hypot(p[0] - outline[k - 1][0], p[1] - outline[k - 1][1])) : 0));
        const ringAt = (k, nr, ny) => {
            const [r, y] = outline[k], start = P.length / 3;
            for (let s = 0; s <= seg; s++) {
                const a = (s / seg) * Math.PI * 2, c = Math.cos(a), si = Math.sin(a);
                P.push(r * si, y, r * c); N.push(nr * si, ny, nr * c); T.push(s / seg, along[k] / (total || 1));
            }
            return start;
        };
        for (let k = 0; k < n - 1; k++) {
            const own = spans[k];
            const blend = other => (other && own[0] * other[0] + own[1] * other[1] > (sharp ?? 0.75) ? (() => { const x = own[0] + other[0], y = own[1] + other[1], l = Math.hypot(x, y) || 1; return [x / l, y / l]; })() : own);
            const n0 = blend(spans[k - 1]), n1 = blend(spans[k + 1]);
            const a = ringAt(k, n0[0], n0[1]), b = ringAt(k + 1, n1[0], n1[1]);
            const flatA = outline[k][0] === 0, flatB = outline[k + 1][0] === 0;
            for (let s = 0; s < seg; s++) {
                if (!flatA) I.push(a + s, a + s + 1, b + s);
                if (!flatB) I.push(a + s + 1, b + s + 1, b + s);
            }
        }
        return { positions: Float32Array.from(P), normals: Float32Array.from(N), uvs: Float32Array.from(T), index: Uint32Array.from(I) };
    }

    const SURFACE = {
        clay: { roughness: 0.92, metalness: 0 }, glazed: { roughness: 0.22, metalness: 0 }, wood: { roughness: 0.75, metalness: 0 },
        metal: { roughness: 0.32, metalness: 0.9 }, stone: { roughness: 0.95, metalness: 0 }, picture: { roughness: 0.55, metalness: 0 }
    };

    function turned(r, img, cache) {
        const o = r.turned;
        let profile = o.profile, guide = null;
        if (img && o.fromPicture) {
            const key = JSON.stringify([r.image, img.width, img.height, img.version || 0, r.cutout.outline, r.cutout.tolerance]);
            if (cache.profileKey !== key) { cache.profile = profileFromPicture(img, r.cutout.outline, r.cutout.tolerance); cache.profileKey = key; }
            if (cache.profile) { guide = cache.profile; profile = guide.profile; }
        } else if (img) {
            const key = JSON.stringify([r.image, img.width, img.height, img.version || 0, r.cutout.outline, r.cutout.tolerance, 'guide']);
            if (cache.guideKey !== key) { cache.guide = profileFromPicture(img, r.cutout.outline, r.cutout.tolerance); cache.guideKey = key; }
            guide = cache.guide;
        }
        const outline = turnedOutline(profile, o.height, o.wall, o.top);
        const solid = revolve(outline, o.segments);
        const surface = SURFACE[o.surface];
        const part = Object.assign(solid, { name: 'Body', roughness: surface.roughness, metalness: surface.metalness });
        const textures = {};
        if (o.surface === 'picture' && img && guide) {
            // Laid on from the front: each point takes the picture's pixel in front of it.
            const uv = new Float32Array(solid.positions.length / 3 * 2), H = o.height, span = guide.bottom - guide.top;
            const aspect = guide.height / guide.width;
            for (let i = 0; i < uv.length / 2; i++) {
                const x = solid.positions[i * 3], y = solid.positions[i * 3 + 1];
                uv[i * 2] = guide.axis + x / H * span * aspect;
                uv[i * 2 + 1] = guide.bottom - y / H * span;
            }
            part.uvs = uv;
            part.texture = 'picture.png';
            const mask = maskOf(img, r.cutout.outline, r.cutout.tolerance, 256);
            textures['picture.png'] = bleed(img, mask, 24);
        } else if (o.surface === 'wood') { woodUv(part, 0.6); part.texture = 'wood.png'; textures['wood.png'] = woodPicture(o.color, 7); }
        else part.color = o.color;
        return { parts: [part], textures, guide, outline };
    }

    // ── the build ──────────────────────────────────────────────────────────
    const rigid = mesh => {
        const n = mesh.positions.length / 3, w = new Float32Array(n * 4);
        for (let i = 0; i < w.length; i += 4) w[i] = 1;
        return Object.assign(mesh, { joints: new Uint16Array(n * 4), weights: w });
    };

    /** The flag recipe a hanging banner of this picture is. */
    function bannerRecipe(r, img) {
        const a = img ? img.height / img.width : 1.5;
        const width = Math.min(3, a >= 1 ? r.framed.size / a : r.framed.size);
        return { kind: 'flag', pole: { type: 'crossbar', height: Math.max(1.6, width * a + 1.2), finial: 'spear' }, cloth: { width, aspect: 'custom', height: Math.min(4, width * a), fabric: 'cotton' }, design: { layout: 'image', image: r.image }, wind: { strength: 0.25, gust: 0.4, direction: 55 }, seed: 3 };
    }

    /**
     * Everything the view and the file need: { parts, bones, clips, textures }.
     * A hanging banner is a Flag (its cloth and loop included).
     */
    function build(recipe, cache, options) {
        const r = normalize(recipe), o = options || {}, c = cache || {};
        const img = r.image ? (o.images || {})[r.image] || null : null;
        if (r.mode === 'framed' && r.framed.object === 'banner') {
            const flag = Flag.build(bannerRecipe(r, img), c.banner || (c.banner = {}), Object.assign({}, o, { images: img ? { [r.image]: img } : {} }));
            return Object.assign(flag, { kind: 'picture', recipe: r, imageName: r.image, imageMissing: !!r.image && !img, noPicture: !r.image });
        }
        let made = null;
        if (r.mode === 'turned') made = turned(r, img, c);
        else if (img && r.mode === 'cutout') made = cutout(r, img, c);
        else if (r.mode === 'framed') made = Framed.build(r.framed, img || placeholder());
        if (!made) made = { parts: [Object.assign(Mesh.box([0, 0.25, 0], [0.5, 0.5, 0.02]), { name: 'Board', color: '#8a8a8a', roughness: 0.8 })], textures: {} };
        const parts = made.parts.map(p => rigid(p));
        const textures = {};
        for (const [k, t] of Object.entries(made.textures || {})) if (t) textures[k] = t;
        for (const p of parts) if (p.texture && !textures[p.texture]) { delete p.texture; p.color = p.color || '#9a9a9a'; }
        for (const p of parts) Mesh.shade(p);
        // What stands rests on the floor; what hangs on a wall keeps its height.
        const wall = !!made.wall;
        if (!wall) settle(parts);
        let height = 0;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) height = Math.max(height, p.positions[i]);
        return {
            kind: 'picture', recipe: r, parts, bones: [{ name: 'Prop', head: [0, 0, 0], parent: -1 }], clips: [], loop: null, textures, cloth: null,
            height: Math.max(0.1, height), wall: wall ? { normal: [0, 0, 1], at: 0 } : null, guide: made.guide || null, pieces: made.pieces || 1, imageName: r.image, imageMissing: !!r.image && !img, noPicture: !r.image
        };
    }

    /** Moves the parts up or down so their lowest point is on the floor (y = 0). */
    function settle(parts) {
        let low = Infinity;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) low = Math.min(low, p.positions[i]);
        if (Number.isFinite(low) && low !== 0) for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) p.positions[i] -= low;
    }

    /** A plain picture to stand in until one is chosen. */
    function placeholder() {
        const p = Paint.paint(64, 48, (u, v, out) => { const k = ((Math.floor(u * 8) + Math.floor(v * 6)) & 1) ? 120 : 150; out[0] = out[1] = out[2] = k; out[3] = 255; }, 1);
        return p;
    }

    /**
     * A random picture prop of the same mode and picture. Cut-out: its size,
     * board, edge, stand and back; turned: its height, top, wall and glaze;
     * framed: a frame from its presets with its own size, mat and colors.
     */
    function random(seed, recipe, scope) {
        const R = Rand.roll(seed), r = normalize(recipe), has = part => Rand.covers(scope, part);
        if (r.mode === 'cutout') {
            const c = r.cutout;
            if (has('shape')) Object.assign(c, { size: R.range(0.5, 2.2), thickness: R.range(0.015, 0.07), edge: R.pick(['bevel', 'round', 'square']) });
            if (has('details')) Object.assign(c, { stand: R.weighted([['none', 2], ['stand', 2], ['post', 1]]), backing: R.chance(0.8) ? 'plate' : 'none' });
            if (has('colors')) Object.assign(c, { back: R.pick(['mirror', 'color', 'wood']), backColor: R.pick(Rand.PALETTES.wood.concat(Rand.PALETTES.paint)) });
        } else if (r.mode === 'turned') {
            const t = r.turned;
            if (has('shape')) Object.assign(t, { height: R.range(0.25, 1.2), segments: R.int(48, 96) });
            if (has('details')) Object.assign(t, { top: R.chance(0.75) ? 'open' : 'closed', wall: R.range(0.008, 0.03) });
            if (has('colors')) Object.assign(t, { surface: R.weighted([['picture', r.image ? 3 : 0], ['clay', 2], ['glazed', 3], ['wood', 1.5], ['metal', 1], ['stone', 1]]), color: R.pick(['#b86a44', '#8a3a2a', '#2a5a7a', '#e8e0d0', '#3a6a4a', '#c8a050', '#6a4a8a', '#1b1b1f']) });
        } else {
            const f = r.framed, wall = f.object === 'painting' || f.object === 'poster' || f.object === 'banner';
            if (has('details') && wall) {
                const preset = R.pick(Framed.PRESETS.filter(p => f.object !== 'poster' || p.id !== 'museum'));
                Object.assign(f, preset.set, { mount: R.weighted([['wall', 4], ['easel', 1], ['stand', f.size < 0.7 ? 1.5 : 0.2]]) });
                if (R.chance(0.35)) Object.assign(f, { mat: true, matWidth: R.range(0.03, 0.1) });
            }
            if (has('details') && f.object === 'crate') Object.assign(f, { banding: R.pick(['none', 'metal', 'rope']), faces: R.pick(['all', 'front']) });
            if (has('details') && f.object === 'book') f.bands = R.chance(0.6);
            if (has('shape')) {
                f.size = f.object === 'book' ? R.range(0.18, 0.35) : f.object === 'crate' ? R.range(0.4, 0.9) : R.range(0.4, 1.4);
                if (wall && f.style !== 'none') { f.width = R.jitter(f.width, 0.25, 0.01, 0.3); f.depth = R.jitter(f.depth, 0.2, 0.008, 0.15); }
                if (f.object === 'book') f.thickness = R.range(0.02, 0.09);
            }
            if (has('colors')) {
                if (wall && f.style !== 'none' && f.style !== 'clip') f.material = f.style === 'ornate' ? R.pick(['gold', 'gold', 'silver']) : f.style === 'rustic' ? R.pick(['darkwood', 'lightwood']) : R.pick(['painted', 'blackmetal', 'darkwood', 'lightwood', 'silver']);
                f.paint = R.pick(Rand.PALETTES.paint); f.matColor = R.pick(['#f2eee4', '#f7f5ef', '#e8e0d0', '#1b1b1f', '#2a3a55', '#5a2a2a']);
                f.color = R.pick(Rand.PALETTES.cloth.concat(Rand.PALETTES.leather)); f.wood = R.pick(['pine', 'oak', 'dark']);
            }
        }
        return normalize(r);
    }

    const api = { random, settle, MODES, OUTLINES, EDGES, BACKS, STANDS, BACKINGS, dilate, SURFACES, OBJECTS, VASE, DEFAULT, normalize, maskOf, trace, shapes, simplify, signedArea, profileFromPicture, turnedOutline, revolve, bannerRecipe, build };
    root.RRPictureProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Catalog) for (const [mode, label, icon, keywords] of [['cutout', 'Cut-out', 'cutout', 'sign board silhouette'], ['turned', 'Turned', 'turned', 'vase pot bottle column lathe'], ['framed', 'Framed', 'framed', 'painting poster crate book frame']]) {
        Catalog.add({ id: 'picture-' + mode, category: 'picture', label, icon, kind: 'picture', keywords, start: from => normalize({ mode, image: from && from.kind === 'picture' ? from.image : '' }), matches: r => r.mode === mode });
    }
    const Model = root.RRPropModel;
    if (Model && Model.register) Model.register({ id: 'picture', label: 'From picture', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
})(typeof window !== 'undefined' ? window : globalThis);
