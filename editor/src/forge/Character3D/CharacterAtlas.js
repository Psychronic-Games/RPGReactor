/**
 * RRCharacterAtlas - one painted texture for a whole outfit.
 *
 * A laid garment piece (RRCharacterOutfit.lay) is split into charts, one per
 * body chain it covers (trunk, each arm and leg, the skirt). A chart lies
 * flat by the chain's own measure: around the chain (its angle, times the
 * chain's radius) by along it (its position, times the chain's step), both
 * in meters, so every chart has the same texel size. The charts of every
 * piece are packed into one picture, and each texel is painted from where
 * it lies on the body: a stripe is a height on the trunk, a ring of mail a
 * few millimeters of chart, a trim a distance from the cut line. Pieces of
 * one finish are merged into one part, all sharing the picture.
 *
 * The weave itself is not painted: a millimeter-a-texel picture cannot hold
 * it (it shimmered as moiré). Each part carries a second set of coordinates,
 * its chart's meters over its cloth's tile (RRCharacterFabric), and the
 * tile's relief, roughness and occlusion on them; the picture keeps the
 * colors, prints, trims and wear. Trims and hems are measured per texel from
 * the smoothed cut edge, and prints that run round the trunk by the height
 * of the cloth as laid, so neither steps nor waves with the mesh.
 *
 * The picture depends on the outfit only (as laid on the body it was first
 * made for), never on later changes to the body's shape: the builder keeps
 * it while sliders move.
 */
(function(root) {
    'use strict';

    const Outfit = root.RRCharacterOutfit || (typeof require === 'function' ? require('./CharacterOutfit.js') : null);
    const Fabric = root.RRCharacterFabric || (typeof require === 'function' ? require('./CharacterFabric.js') : null);
    // Wear and damage (RRCharacterWear; optional): grime, fading, stains and holes painted over a worn piece.
    const Wear = root.RRCharacterWear || (typeof require === 'function' ? require('./CharacterWear.js') : null);
    const TAU = Math.PI * 2;
    const toByte = c => Math.max(0, Math.min(255, Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)));
    const fract = x => x - Math.floor(x);
    const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const hash = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    function noise(x, y) {
        const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    /**
     * How much of a texel `w` wide (in the pattern's own cycles) at `x` lies
     * where fract(x) < duty: a stripe's edge filtered over the texel, never
     * a stair of whole texels.
     */
    function pulse(x, duty, w) {
        if (!(w > 1e-4)) return fract(x) < duty ? 1 : 0;
        if (w >= 1) return duty;
        const F = t => Math.floor(t) * duty + Math.min(fract(t), duty);
        return (F(x + w / 2) - F(x - w / 2)) / w;
    }
    /** A line `half` either side of d = 0, its edges filtered over `w`. */
    const line = (d, half, w) => 1 - smoothstep(half - w / 2, half + w / 2, Math.abs(d));

    /** Where a piece vertex lies on the average body (its rest position). */
    function restOf(an, vert) {
        if (vert.w) {
            const out = [0, 0, 0];
            for (const [v, w] of vert.w) for (let k = 0; k < 3; k++) out[k] += an.rest[v * 3 + k] * w;
            return out;
        }
        const { a, b, t } = vert;
        return [0, 1, 2].map(k => an.rest[a * 3 + k] * (1 - t) + an.rest[b * 3 + k] * t);
    }

    /**
     * The distance from a piece's cut edge, eased along itself as it is laid,
     * to any point on the average body: a grid of the edge's segments, each
     * filed in the cells within `reach` of it. `at(p)` is the distance, or
     * Infinity beyond the reach.
     */
    const edgeFields = new WeakMap();
    function edgeField(an, piece, reach) {
        if (!piece || !piece.border || !piece.border.length || !piece.verts) return null;
        let byReach = edgeFields.get(piece);
        if (!byReach) edgeFields.set(piece, byReach = new Map());
        const key = Math.round(reach * 1000);
        if (byReach.has(key)) return byReach.get(key);
        const n = piece.verts.length, pts = new Float32Array(n * 3);
        piece.verts.forEach((vert, i) => pts.set(restOf(an, vert), i * 3));
        // As RRCharacterOutfit eases a cut edge: each vertex between its two neighbors along the edge, eight times.
        const near = new Map();
        for (const [a, b] of piece.border) {
            if (!near.has(a)) near.set(a, []);
            if (!near.has(b)) near.set(b, []);
            near.get(a).push(b); near.get(b).push(a);
        }
        const list = [...near.entries()].filter(([, q]) => q.length === 2);
        for (let pass = 0; pass < 8; pass++) {
            const next = list.map(([v, [a, b]]) => [0, 1, 2].map(k => 0.5 * pts[v * 3 + k] + 0.25 * (pts[a * 3 + k] + pts[b * 3 + k])));
            list.forEach(([v], i) => pts.set(next[i], v * 3));
        }
        const segs = new Float32Array(piece.border.length * 6), cell = Math.max(0.01, reach), grid = new Map();
        const keyOf = (x, y, z) => x + ',' + y + ',' + z;
        piece.border.forEach(([a, b], s) => {
            for (let k = 0; k < 3; k++) { segs[s * 6 + k] = pts[a * 3 + k]; segs[s * 6 + 3 + k] = pts[b * 3 + k]; }
            const lo = [0, 1, 2].map(k => Math.floor((Math.min(pts[a * 3 + k], pts[b * 3 + k]) - reach) / cell));
            const hi = [0, 1, 2].map(k => Math.floor((Math.max(pts[a * 3 + k], pts[b * 3 + k]) + reach) / cell));
            for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
                const k = keyOf(x, y, z);
                let at = grid.get(k);
                if (!at) grid.set(k, at = []);
                at.push(s);
            }
        });
        const field = {
            reach,
            at(p) {
                const list = grid.get(keyOf(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell)));
                if (!list) return Infinity;
                let best = Infinity;
                for (const s of list) {
                    const o = s * 6, ax = segs[o], ay = segs[o + 1], az = segs[o + 2];
                    const bx = segs[o + 3] - ax, by = segs[o + 4] - ay, bz = segs[o + 5] - az;
                    const l2 = bx * bx + by * by + bz * bz || 1e-12;
                    const t = Math.max(0, Math.min(1, ((p[0] - ax) * bx + (p[1] - ay) * by + (p[2] - az) * bz) / l2));
                    const dx = p[0] - ax - bx * t, dy = p[1] - ay - by * t, dz = p[2] - az - bz * t, d = dx * dx + dy * dy + dz * dz;
                    if (d < best) best = d;
                }
                const d = Math.sqrt(best);
                return d <= reach ? d : Infinity;
            }
        };
        byReach.set(key, field);
        return field;
    }

    /** The values of one piece vertex on chain `fam`: its position along it and angle about it. */
    function chainValue(an, laid, i, fam) {
        // A rim vertex (the edge folded under) shows the cloth a little way in from the edge, so the fold carries
        // the weave and the color rather than one line of texels drawn out.
        if (laid.rimStart != null && i >= laid.rimStart && laid.piece.onBorder) {
            const o = laid.origin[i], inner = laid.piece.neighbors[o].filter(q => !laid.piece.onBorder[q]);
            const own = chainValue(an, laid, o, fam);
            if (!inner.length) return own;
            const vals = inner.map(q => chainValue(an, laid, q, fam));
            const mean = k => vals.reduce((sum, x) => sum + x[k], 0) / vals.length;
            const w = 0.6, ang = vals.map(x => (x.ang - own.ang > Math.PI ? x.ang - TAU : own.ang - x.ang > Math.PI ? x.ang + TAU : x.ang)).reduce((p, q) => p + q, 0) / vals.length;
            return { s: own.s * (1 - w) + mean('s') * w, ang: own.ang * (1 - w) + ang * w, u: own.u * (1 - w) + mean('u') * w, rest: own.rest.map((x, k) => x * (1 - w) + vals.reduce((sum, v) => sum + v.rest[k], 0) / vals.length * w) };
        }
        const vert = laid.piece.verts[laid.origin[i]];
        // A vertex added where the cloth is refined for its folds lies between up to three pack vertices.
        if (vert.w) {
            const g0 = an.angle[vert.w[0][0] * 5 + fam], out = { s: 0, ang: 0, u: 0, rest: [0, 0, 0] };
            for (const [v, w] of vert.w) {
                let g = an.angle[v * 5 + fam];
                if (g - g0 > Math.PI) g -= TAU; else if (g0 - g > Math.PI) g += TAU;
                out.s += an.s[v * 5 + fam] * w; out.ang += g * w; out.u += an.skirtU[v] * w;
                for (let k = 0; k < 3; k++) out.rest[k] += an.rest[v * 3 + k] * w;
            }
            return out;
        }
        const { a, b, t } = vert;
        let ga = an.angle[a * 5 + fam], gb = an.angle[b * 5 + fam];
        if (gb - ga > Math.PI) gb -= TAU; else if (ga - gb > Math.PI) gb += TAU;
        return {
            s: an.s[a * 5 + fam] * (1 - t) + an.s[b * 5 + fam] * t,
            ang: ga * (1 - t) + gb * t,
            u: an.skirtU[a] * (1 - t) + an.skirtU[b] * t,
            rest: [0, 1, 2].map(k => an.rest[a * 3 + k] * (1 - t) + an.rest[b * 3 + k] * t)
        };
    }

    /**
     * A piece vertex's height on the average body as the cloth lies there: its
     * rest height moved as far as the laying moved it off the body point under
     * it (lift, drape, layers over layers). A print that runs round the trunk
     * by height follows the finished cloth, not the bumps of the surface under
     * it, so its stripes stay level.
     */
    function laidHeight(laid, v, restY) {
        const o = laid.rimStart == null || v < laid.rimStart || !laid.origin ? v : laid.origin[v];
        const P = laid.positions, B = laid.base;
        if (!B || o * 3 + 1 >= B.length || o * 3 + 1 >= P.length) return restY;
        const moved = P[o * 3 + 1] - B[o * 3 + 1];
        return Number.isFinite(moved) && Math.abs(moved) < 0.25 ? restY + moved : restY;
    }

    /**
     * Charts of one laid piece: triangles grouped by the chain most of their
     * corners belong to, each corner given flat chart coordinates in meters.
     */
    function charts(an, laid, skirt) {
        const byKey = new Map();
        const I = laid.index;
        for (let t = 0; t < I.length; t += 3) {
            const c = [I[t], I[t + 1], I[t + 2]];
            let fam;
            if (skirt) fam = 5;
            else {
                const count = [0, 0, 0, 0, 0];
                for (const v of c) count[laid.field[v].fam]++;
                fam = count.indexOf(Math.max(...count));
            }
            const values = c.map(v => {
                const value=chainValue(an,laid,v,fam===5?0:fam);
                // Below the hips the body's blended chain angle turns toward
                // each leg. Fabric wrapping the trunk/skirt needs its own
                // continuous bearing, or rear prints collapse into a fan.
                if((fam===0||fam===5)&&Number.isFinite(laid.field[v].spineAng))value.ang=laid.field[v].spineAng;
                return value;
            });
            // A triangle across the seam behind: carried round so its corners sit together.
            const angs = values.map(x => x.ang);
            if (Math.max(...angs) - Math.min(...angs) > Math.PI) values.forEach(x => { if (x.ang < 0) x.ang += TAU; });
            const R = an.radius[fam] * (fam === 0 ? 1.35 : 1.15), U = an.unit[fam];
            const corners = values.map((x, k) => ({
                v: c[k], cu: x.ang * R, cv: (fam === 5 ? x.u : x.s) * U, s: x.s, ang: x.ang, rest: x.rest,
                y: laidHeight(laid, c[k], x.rest[1]), val: laid.vals[c[k]], vm: laid.internalTrim?.[laid.origin[c[k]]] ? .03 : laid.edge ? (laid.vals[c[k]] < 0 ? -0.001 : laid.edge[c[k]]) : laid.vals[c[k]] * (fam === 5 ? an.unit[5] / 4 : an.unit[fam]), fam: fam === 5 ? 0 : fam, u: x.u,
                // Meters per unit along the chain and round it: how fast a print's bands change over one texel.
                su: an.unit[fam === 5 ? 0 : fam], rad: R
            }));
            // A triangle of the cloth itself (not its folded rim) is measured from the cut edge per texel: a sewn
            // waist's band too, from the waist seam, so it runs even rather than in the steps of its marked vertices.
            if (c.every(v => (laid.rimStart == null || v < laid.rimStart) && laid.vals[v] >= 0)) corners.exact = true;
            let chart = byKey.get(fam);
            if (!chart) byKey.set(fam, chart = { fam, tris: [], min: [Infinity, Infinity], max: [-Infinity, -Infinity] });
            chart.tris.push(corners);
            for (const k of corners) {
                chart.min[0] = Math.min(chart.min[0], k.cu); chart.min[1] = Math.min(chart.min[1], k.cv);
                chart.max[0] = Math.max(chart.max[0], k.cu); chart.max[1] = Math.max(chart.max[1], k.cv);
            }
        }
        return [...byKey.values()];
    }

    /** Shelf packing at `scale` texels per meter, `pad` texels around each chart; false when it does not fit. */
    function pack(list, size, scale, pad) {
        const order = list.slice().sort((p, q) => (q.max[1] - q.min[1]) - (p.max[1] - p.min[1]));
        let x = 0, y = 0, rowH = 0;
        for (const c of order) {
            const w = Math.ceil((c.max[0] - c.min[0]) * scale) + pad * 2, h = Math.ceil((c.max[1] - c.min[1]) * scale) + pad * 2;
            if (w > size || h > size) return false;
            if (x + w > size) { x = 0; y += rowH; rowH = 0; }
            if (y + h > size) return false;
            c.at = [x + pad, y + pad];
            x += w; rowH = Math.max(rowH, h);
        }
        return true;
    }

    // ── prints ────────────────────────────────────────────────────────────
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    /** One cell of a staggered repeat (`size` meters), local coordinates -0.5..0.5 and a fixed random per cell. */
    function cell(p, size) {
        const y = p.cv / size, row = Math.floor(y), x = p.cu / size + (row & 1) * 0.5, col = Math.floor(x);
        return { x: fract(x) - 0.5, y: fract(y) - 0.5, r: hash(col * 1.7 + 0.3, row * 2.3 + 0.7), row, col };
    }

    /** A floral print: five-petaled flowers with their centers and two leaves, staggered, turned a little each. */
    function floral(p, scale, c1, c2, trim) {
        const k = cell(p, 0.048 / scale), turn = k.r * Math.PI * 2;
        const ox = (k.r - 0.5) * 0.12, oy = (hash(k.col, k.row) - 0.5) * 0.12;
        const x = k.x - ox, y = k.y - oy, r = Math.hypot(x, y), th = Math.atan2(y, x) + turn;
        const leafA = [x - 0.24, y + 0.2];
        const leaf = Math.hypot(leafA[0] * 1.9, leafA[1] * 0.9) < 0.14 || Math.hypot((x + 0.22) * 0.9, (y + 0.22) * 1.9) < 0.12;
        const petal = 0.16 + 0.16 * Math.abs(Math.cos(2.5 * th));
        if (r < 0.06) return mixc(trim, [0.9, 0.7, 0.2], 0.5);
        if (r < petal) return mixc(c2, [1, 1, 1], 0.25 * (1 - r / petal));
        if (r < petal + 0.018) return mixc(c2, c1, 0.6);
        if (leaf) return mixc(c1, [0.12, 0.3, 0.12], 0.55);
        return c1;
    }

    /** A paisley print: teardrops with a curled tip, outlined, ringed with dots, alternating their lean. */
    function paisley(p, scale, c1, c2, trim) {
        const k = cell(p, 0.065 / scale), lean = (k.row + k.col) & 1 ? 0.9 : -0.9;
        const cs = Math.cos(lean), sn = Math.sin(lean);
        const x = k.x * cs - k.y * sn, y = k.x * sn + k.y * cs + 0.06;
        const r = Math.hypot(x, y), th = Math.atan2(y, x);
        // The drop: round, drawn out into a curled point on one side.
        const reach = 0.21 * (1 + 1.1 * Math.max(0, Math.sin(th - 0.6)) ** 6);
        if (Math.abs(r - reach) < 0.018) return c2;
        if (r < reach) {
            if (Math.abs(r - reach * 0.6) < 0.012) return trim;
            if (r < reach * 0.25) return mixc(c2, trim, 0.5);
            return mixc(c1, c2, 0.2);
        }
        // Dots round the drop.
        const dot = Math.abs(r - reach - 0.05) < 0.016 && fract(th / (Math.PI * 2) * 14) < 0.35;
        return dot ? trim : c1;
    }

    /**
     * An emblem on the left breast: a shield with a star (or the project's
     * picture, `look.emblemPicture`, RGBA), its own color on its border.
     */
    function emblem(p, look, c1, c2, trim) {
        const R = p.rest;
        if (p.fam !== 0 || R[2] < 0.02) return c1;
        const dx = (R[0] - 0.085) / 0.034, dy = (R[1] - 1.255) / 0.04;
        const pic = look.emblemPicture;
        if (pic && pic.width) {
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) return c1;
            const u = Math.min(pic.width - 1, Math.floor((dx + 1) / 2 * pic.width)), v = Math.min(pic.height - 1, Math.floor((1 - dy) / 2 * pic.height));
            const o = (v * pic.width + u) * 4, al = pic.data[o + 3] / 255;
            const lin = c => Math.pow(c / 255, 2.2);
            return mixc(c1, [lin(pic.data[o]), lin(pic.data[o + 1]), lin(pic.data[o + 2])], al);
        }
        // A shield: square shoulders, a pointed foot.
        const half = dy > -0.25 ? 1 : Math.max(0, (dy + 1) / 0.75);
        if (Math.abs(dx) > half || dy > 1 || dy < -1) return c1;
        const edge = Math.min(half - Math.abs(dx), 1 - dy, (dy + 1) * 0.75);
        if (edge < 0.12) return trim;
        // A five-pointed star in the middle.
        const sx = dx / 0.62, sy = (dy - 0.08) / 0.62, sr = Math.hypot(sx, sy), sa = Math.atan2(sx, sy);
        const star = 0.42 + 0.58 * (0.5 + 0.5 * Math.cos(sa * 5)) ** 3;
        if (sr < star * 0.95) return trim;
        return c2;
    }

    // ── painting ──────────────────────────────────────────────────────────
    // Sci-fi panels use the shared neutral surface, including at chart joins.
    // A different limb-chain coordinate on each side of a shoulder seam tears
    // a yoke or a luminous rail into unrelated patches.
    function lightMask(look, p) {
        if (!look.lightStyle || look.lightStyle === 'none' || !(look.lightIntensity > 0) || p.val < 0) return 0;
        // A garment's own light pattern (RRCharacterCyberwear.glowMask, set by RRCharacterWardrobe's look).
        if (look.glowMask) return look.glowMask(p);
        const w = look.lightWidth || 1, R = p.rest, x = Math.abs(R[0]), y = R[1];
        const line = (d, width) => 1 - smoothstep(width * w * 0.45, width * w, Math.abs(d));
        const range = (v, a, b) => smoothstep(a, a + 0.004, v) * (1 - smoothstep(b - 0.004, b, v));
        const front = R[2] > 0.035;
        const badge = p.fam === 0 && front ? range(R[0], 0.055, 0.092) * range(y, 1.278, 1.291) : 0;
        if (look.lightStyle === 'badge') return badge;
        if (p.fam === 0) {
            const rail = line(x - (0.118 - Math.max(0, 1.22 - y) * 0.18), 0.0028) * range(y, 1.115, 1.32);
            const back = R[2] < -0.035 ? line(x - 0.045, 0.0022) * range(y, 1.12, 1.32) : 0;
            const cross = look.lightStyle === 'circuits' && front ? line(y - 1.15, 0.002) * range(x, 0.04, 0.115) : 0;
            return Math.max(badge, front ? rail : 0, back, cross);
        }
        // Small cuff and thigh indicators, away from shoulder/chart junctions.
        const face = Math.max(0, Math.cos(p.ang));
        if (p.fam === 1 || p.fam === 2) return line(p.s - 2.72, 0.025) * smoothstep(0.55, 0.9, face);
        return range(p.s, 0.45, 1.55) * line(Math.abs(p.ang) - 1.18, 0.025);
    }

    function futuristic(look, colors, p) {
        const [main, panel, trim] = colors, R = p.rest, x = Math.abs(R[0]), y = R[1];
        const torso = p.fam === 0, arm = p.fam === 1 || p.fam === 2, front = R[2] > 0.035;
        const band = (d, width, aa = 0.0012) => 1 - smoothstep(width - aa, width + aa, Math.abs(d));
        const range = (v, a, b) => smoothstep(a, a + 0.003, v) * (1 - smoothstep(b - 0.003, b, v));
        let color = main;
        const paint = (c, amount) => { if (amount > 0) color = mixc(color, c, Math.min(1, amount)); };
        if (look.pattern === 'fleet' || look.pattern === 'officer') {
            const edge = 1.285 - Math.min(x, 0.25) * 0.12;
            const yoke = smoothstep(edge - 0.006, edge + 0.006, y) * (1 - smoothstep(1.397, 1.400, y));
            paint(panel, yoke);
            paint(trim, band(y - edge, 0.0020) * (1 - smoothstep(0.23, 0.27, x)));
            if (look.pattern === 'officer' && torso && front) {
                const slash = smoothstep(1.218 + R[0] * 0.28, 1.221 + R[0] * 0.28, y);
                paint(panel, slash * (1 - smoothstep(0.15, 0.17, x)));
            }
            if (arm) {
                paint(panel, range(p.s, 2.69, 3.2));
                for (const at of [2.52, 2.59, 2.66]) paint(trim, band((p.s - at) * 0.24, 0.0014));
            }
            if (torso && front && y > 0.97 && y < 1.40) {
                const zipper = look.pattern === 'officer' ? -0.022 : 0;
                paint(trim, band(R[0] - zipper, 0.0015));
                paint(mixc(main, trim, 0.24), band(R[0] - zipper - 0.004, 0.0007) * (Math.floor(y / 0.0035) % 2));
                // A breast welt and a small rank bar below the shoulder yoke.
                paint(trim, band(y - 1.252, 0.0010) * range(R[0], 0.045, 0.103));
                // Rank pips on the right of the collar: two gold squares.
                for (const px0 of [0.036, 0.05]) paint(trim, range(R[0], px0, px0 + 0.0085) * range(y, 1.405, 1.4135));
            }
            if (torso) {
                // Piped collar: a trim band round the neckline's edge.
                if (p.vm >= 0 && y > 1.36) paint(trim, 1 - smoothstep(0.0032, 0.0046, p.vm));
                // Princess seams down the front and back below the yoke, mirrored, and the side seams: sewn lines a shade
                // darker than the cloth.
                const seamC = mixc(main, [0, 0, 0], 0.4), under = 1 - smoothstep(edge - 0.008, edge - 0.004, y);
                paint(seamC, band(x - (0.098 + 0.035 * Math.max(0, 1.22 - y)), 0.0008) * smoothstep(0.92, 0.94, y) * under * 0.85);
                paint(seamC, band(Math.abs(p.ang) - Math.PI / 2, 0.0008 / Math.max(p.rad || 0.13, 0.05)) * under * 0.85);
            }
        } else if (look.pattern === 'technical') {
            const side = torso ? smoothstep(0.11, 0.14, x) : smoothstep(0.82, 0.94, Math.abs(Math.sin(p.ang)));
            paint(panel, side * (1 - smoothstep(1.27, 1.31, y)));
            if (torso) {
                paint(trim, band(x - 0.115, 0.0015) * range(y, 0.97, 1.31));
                if (front) paint(panel, range(y, 1.23, 1.30) * range(x, 0.045, 0.10));
                paint(trim, band(y - 1.02, 0.0015));
            } else {
                paint(trim, band(Math.abs(p.ang) - 1.12, 0.012));
                paint(main, range(p.s, 1.72, 2.25) * (arm ? 1 : 0));
            }
        } else {
            const pressure = look.pattern === 'pressure';
            const chest = front ? range(y, 1.13, 1.325) * (1 - smoothstep(0.112, 0.128, x)) : 0;
            paint(panel, chest);
            // The raised sewn panel edge comes from the construction mesh.
            if (torso) {
                paint(trim, range(y,.944,.974));
                if (front) paint(trim, band(R[0], 0.0014) * range(y, 0.985, 1.40));
                // Two service-pocket flaps, with an inset stitched edge.
                if (front) for (const side of [-1, 1]) {
                    const pocket = range(R[0] * side, 0.057, 0.117) * range(y, 1.045, 1.105);
                    paint(mixc(main, trim, 0.20), pocket);
                    paint(trim, band(y - 1.094, 0.0015) * range(R[0] * side, 0.061, 0.113));
                }
                paint(trim, range(y, 1.40, 1.46));
            } else {
                const joint = arm ? 2 : 1;
                const flex = range(p.s, joint - 0.16, joint + 0.16);
                paint(mixc(main,trim,.55), flex);
                if (arm) paint(trim, range(p.s, 2.8, 3.1));
                else paint(panel, range(p.s, 0.2, 0.72) * smoothstep(0.85, 0.95, Math.abs(Math.sin(p.ang))));
            }
        }
        const light = lightMask(look, p);
        return light > 0 ? mixc(color, Outfit.linear(look.lightColor || '#70dfff'), light * 0.65) : color;
    }

    /**
     * A texel's linear color for a look at a point described by `p` (chart and
     * body values; `p.px` meters a texel). `fab`: { kind (the cloth's tile,
     * RRCharacterFabric), hip (the average body's hip height) } for the wear
     * the cloth takes.
     */
    function shade(look, colors, p, fab) {
        const [c1, c2, trim] = colors;
        let t = 0, direct = null;
        const sc = look.scale || 1, px = p.px || 0;
        const s = (p.fam === 0 ? p.y * 7.3 : p.s * 1.2) * sc, a = p.ang;
        // One texel's width in the print's own measure: around the body (meters) and along it.
        const wu = px * sc, ws = px * sc * (p.fam === 0 ? 7.3 : 1.2 / Math.max(p.su || 0.25, 1e-3));
        switch (look.pattern) {
            case 'fleet': case 'officer': case 'technical': case 'expedition': case 'pressure': direct = futuristic(look, colors, p); break;
            case 'stripes': t = pulse(s * 2, 0.5, ws * 2); break;
            case 'pinstripes': t = pulse(s * 6, 0.12, ws * 6); break;
            case 'vstripes': t = pulse(p.cu * 12 * sc, 0.5, wu * 12); break;
            case 'checker': {
                const A = pulse(s, 0.5, ws), B = pulse(p.cu * 6 * sc, 0.5, wu * 6);
                t = A * (1 - B) + (1 - A) * B;
                break;
            }
            case 'plaid': {
                const u = pulse(s * 1.6, 0.28, ws * 1.6), v = pulse(p.cu * 9 * sc, 0.28, wu * 9);
                const fine = Math.max(pulse(s * 6.4, 0.08, ws * 6.4), pulse(p.cu * 36, 0.08, px * 36));
                t = Math.min(1, 0.5 * u + 0.5 * v + 0.25 * fine);
                break;
            }
            case 'gradient': { const k = Math.max(0, Math.min(1, (p.s - (look.from ?? 0)) / ((look.to ?? 4) - (look.from ?? 0)))); t = k * k * (3 - 2 * k); break; }
            case 'halves': t = p.rest[0] < 0 ? 1 : 0; break;
            case 'camo': {
                const v = noise(p.rest[0] * 9 + 3.1, p.rest[1] * 9 + p.rest[2] * 4) + 0.6 * noise(p.rest[2] * 13 - 7, p.rest[1] * 11 + p.rest[0] * 3);
                t = v > 1.05 ? 1 : v < 0.55 ? 0.5 : 0;
                break;
            }
            case 'panels': {
                // Piping laid out on the average body (rest positions), so it is level, mirrored left to right and the
                // same on every body: bands round the trunk at the chest and the waist, princess lines down the front
                // and back from the shoulder seam to the waist band, rings round the limbs at the elbow, knee and cuff, and a
                // side seam down the trunk and the outside of each limb that meets the trunk's at the hip and armpit.
                const R = p.rest, w = Math.max(px * 1.2, 0.0008), half = 0.0032;
                let seam = 0;
                if (p.fam === 0) {
                    for (const yy of [1.03, 1.29]) seam = Math.max(seam, line(R[1] - yy, half, w));
                    const x = Math.abs(R[0]), lean = Math.max(0, Math.min(1, (R[1] - 1.29) / 0.13));
                    seam = Math.max(seam, line(x - (0.082 + 0.03 * lean), half * 0.8, w) * smoothstep(1.025, 1.035, R[1]) * (1 - smoothstep(1.41, 1.43, R[1])));
                    seam = Math.max(seam, line(Math.abs(a) - Math.PI / 2, half, w / Math.max(p.rad || 0.13, 0.05)) * (1 - smoothstep(1.36, 1.40, R[1])));
                } else {
                    const at = p.fam <= 2 ? [2.02, 2.86] : [1.02, 1.86], su = p.su || 0.24;
                    for (const sv of at) seam = Math.max(seam, line((p.s - sv) * su, half, w));
                    // The outside of the limb only (legs: + angles are outward on both; arms: the top of the arm).
                    seam = Math.max(seam, line((a - Math.PI / 2) * (p.rad || 0.05), half, w) * smoothstep(0.15, 0.3, p.s));
                }
                t = seam;
                break;
            }
            case 'mail': {
                // Rows of rings, every other row offset by half a ring.
                const rx = p.cu / 0.014, ry = p.cv / 0.011;
                const row = Math.floor(ry), fx = fract(rx + (row & 1) * 0.5) - 0.5, fy = fract(ry) - 0.5;
                const r = Math.hypot(fx, fy * 1.2), w = px / 0.0125;
                t = 1 - line(r - 0.38, 0.1, w);
                break;
            }
            case 'scales': {
                const rx = p.cu / 0.016, ry = p.cv / 0.012;
                const row = Math.floor(ry), fx = fract(rx + (row & 1) * 0.5) - 0.5, fy = fract(ry);
                t = Math.min(1, Math.hypot(fx, fy - 0.1) * 1.6);
                break;
            }
            case 'quilted': {
                const w = px * 1.4 / 0.04;
                t = Math.max(line(fract((p.cu + p.cv) / 0.04) - 0.5, 0.04, w), line(fract((p.cu - p.cv) / 0.04) - 0.5, 0.04, w));
                break;
            }
            case 'visor': t = p.fam === 0 && Math.abs(a) < 1.0 && p.s > 5.0 && p.s < 5.62 ? 1 : 0; break;
            case 'studs': {
                const fx = fract(p.cu / 0.03) - 0.5, fy = fract(p.cv / 0.03) - 0.5;
                direct = mixc(c1, trim, line(Math.hypot(fx, fy), 0.18, px / 0.03));
                break;
            }
            // Drawn prints: four samples a quarter texel apart, so their outlines are smooth.
            case 'floral': case 'paisley': {
                const draw = look.pattern === 'floral' ? floral : paisley, q = px / 4, sum = [0, 0, 0];
                const at = { ...p };
                for (const [du, dv] of [[-q, -q], [q, -q], [-q, q], [q, q]]) {
                    at.cu = p.cu + du; at.cv = p.cv + dv;
                    const c = draw(at, sc, c1, c2, trim);
                    sum[0] += c[0] / 4; sum[1] += c[1] / 4; sum[2] += c[2] / 4;
                }
                direct = sum;
                break;
            }
            case 'emblem': direct = emblem(p, look, c1, c2, trim); break;
            default: t = 0;
        }
        let rgb = direct || (t <= 0 ? c1 : t >= 1 ? c2 : mixc(c1, c2, t));
        // Edges filtered over a texel (never less than half a millimeter).
        const aa = Math.max(0.0005, px * 0.6);
        // A trim: an even band in from the cut edge (its width in the garment's own units, about 15 cm each),
        // its inner edge a clean line rather than a stair of texels.
        const band = look.trimWidth && p.vm >= 0 ? 1 - smoothstep(look.trimWidth * 0.15 - aa, look.trimWidth * 0.15 + aa, p.vm) : 0;
        if (band > 0) rgb = mixc(rgb, trim, band);
        const kind = fab && fab.kind;
        const hard = look.material === 'metal' || look.material === 'gold';
        let k;
        if (hard) {
            // Brushed metal, its cut edges catching the light like a rolled rim.
            k = 0.94 + 0.08 * noise(p.cu * 60, p.cv * 6) + 0.18 * (1 - smoothstep(0, 0.006, p.vm));
        } else {
            const leather = look.material === 'leather' || look.material === 'rubber' || look.material === 'suede';
            // A slow unevenness of the dye or the hide (the weave and grain themselves are the cloth's tile).
            k = leather
                ? 0.95 + 0.05 * noise(p.cu * 60, p.cv * 60) + 0.05 * noise(p.cu * 14, p.cv * 14)
                : 0.97 + 0.025 * noise(p.cu * 160, p.cv * 160) + 0.015 * noise(p.cu * 9, p.cv * 9);
            // Coarse fold shading painted in the rest pose stays glued to a
            // bending garment. Let its actual drape supply those light changes;
            // keep only a quiet material grain in the color picture.
            // A hem: the edge turned under (a little darker for the double layer), stitched a finger's width in.
            if (p.vm >= 0 && p.vm < 0.014 + aa) {
                const hem = (1 - smoothstep(0.014 - aa, 0.014 + aa, p.vm)) * (1 - band);
                k *= 1 - 0.05 * hem;
                const stitch = line(p.vm - 0.0085, 0.0011, aa) * pulse(p.cu / 0.005, 0.6, px / 0.005) * hem;
                if (stitch > 0) {
                    const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
                    k *= 1 + ((lum > 0.25 ? 0.72 : 1.45) - 1) * stitch;
                }
            }
            // Leather and rubber: the cut edge burnished darker.
            if (leather && p.vm >= 0) k *= 1 - 0.22 * (1 - smoothstep(0.003 - aa, 0.003 + aa, p.vm));
            if (p.vm >= 0) rgb = wear(rgb, kind, p, fab, look);
            // New cloth's own character at a distance (a worn piece's is RRCharacterWear's).
            if (!look.wearInfo) {
                // A dark cloth shows its yarns' unevenness more (a charcoal worsted's lighter fibres), not less.
                const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], t = clothTone(kind, p) - 1;
                k *= 1 + t * (1 + 1.6 * (1 - smoothstep(0.015, 0.15, lum)));
            }
        }
        // The rim's inner face, toward the body, in shadow.
        if (p.val < 0) k *= 0.6;
        const out = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
        // A worn piece (its look's `wearInfo`): weathered, its holes cut out of the picture's alpha.
        return look.wearInfo && Wear ? Wear.paint(out, look, p) : out;
    }

    /**
     * The wear a cloth takes where it is worn: denim faded along its seams and
     * hems, over the knees and the seat, its warp dyed in faint streaks;
     * leather polished lighter where it rubs; every hem low on the leg a
     * little dusty.
     */
    /**
     * How a new cloth reads from across a room, in its own meters (cu round, cv along), always smooth
     * texel to texel (the weave itself is the cloth's tile): denim's unevenly dyed warp in long
     * vertical streaks and its seams pressed lighter; a knit's heathered yarn; a shirting's fine
     * melange; worsted's faint twill shade; canvas's slubbed rows; felted wool's mottle.
     */
    function clothTone(kind, p) {
        const cu = p.cu, cv = p.cv;
        switch (kind) {
            case 'denim': {
                const streak = (noise(cu * 160, cv * 3) - 0.5) * 0.14 + (noise(cu * 55, cv * 1.2) - 0.5) * 0.08;
                // Outseams and inseams: the folded seam allowance rubs through lighter along the leg.
                let seam = 0;
                if (p.fam === 3 || p.fam === 4) {
                    const r = p.rad || 0.06;
                    for (const at of [Math.PI / 2, -Math.PI / 2]) { let d = p.ang - at; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; seam = Math.max(seam, 1 - smoothstep(0.003, 0.011, Math.abs(d) * r)); }
                    seam *= 0.7 + 0.6 * noise(cu * 20, cv * 30);
                }
                // Whiskers: creases worn lighter fanning out from the crotch over the front of the thighs.
                let whisk = 0;
                if ((p.fam === 3 || p.fam === 4) && p.s < 0.45) {
                    const front = smoothstep(0.1, 0.6, Math.cos(p.ang)), side = p.fam === 3 ? 1 : -1, t = p.s + 0.09 * side * Math.sin(p.ang);
                    for (const at of [0.1, 0.17, 0.24, 0.31]) whisk += Math.exp(-(((t - at) / 0.011) ** 2));
                    whisk *= front * (1 - smoothstep(0.3, 0.45, p.s)) * (0.6 + 0.5 * noise(cu * 30, cv * 4));
                }
                return 1 + streak + 0.24 * seam + 0.16 * Math.min(1, whisk);
            }
            case 'jersey': case 'rib': return 1 + (noise(cu * 40, cv * 40) - 0.5) * 0.08 + (noise(cu * 8, cv * 8) - 0.5) * 0.06;
            case 'poplin': return 1 + (noise(cu * 70, cv * 70) - 0.5) * 0.05 + (noise(cu * 12, cv * 12) - 0.5) * 0.03;
            case 'suiting': return 1 + (noise((cu + cv) * 70, (cu - cv) * 8) - 0.5) * 0.06 + (noise(cu * 10, cv * 10) - 0.5) * 0.035;
            case 'canvas': return 1 + (noise(cu * 22, cv * 260) - 0.5) * 0.08 + (noise(cu * 8, cv * 8) - 0.5) * 0.04;
            case 'felt': return 1 + (noise(cu * 30, cv * 30) - 0.5) * 0.07 + (noise(cu * 7, cv * 7) - 0.5) * 0.05;
            default: return 1;
        }
    }

    function wear(rgb, kind, p, fab, look) {
        const R = p.rest, edge = 1 - smoothstep(0, 0.016, p.vm);
        if (kind === 'denim') {
            const leg = p.fam === 3 || p.fam === 4;
            const knee = leg ? smoothstep(0.1, 0.8, Math.cos(p.ang)) * Math.exp(-(((p.s - 1) / 0.2) ** 2)) : 0;
            const hip = fab && fab.hip || 0.885;
            const seat = p.fam === 0 && R[2] < -0.02 ? Math.exp(-(((R[1] - hip + 0.09) / 0.06) ** 2)) * smoothstep(-0.02, -0.07, R[2]) : 0;
            // The front of the thighs, under the pockets.
            const thigh = leg ? smoothstep(0.3, 0.9, Math.cos(p.ang)) * Math.exp(-(((p.s - 0.25) / 0.18) ** 2)) * 0.6 : 0;
            const faded = Math.min(1, Math.max(edge * 0.75, knee, seat * 0.8, thigh));
            const streak = (noise(p.cu * 230, p.cv * 7) - 0.5) * 0.08;
            const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
            const washed = [0, 1, 2].map(c => Math.min(1, (rgb[c] * 0.8 + lum * 0.2) * 1.9 + 0.03));
            rgb = mixc(rgb, washed, faded * 0.38).map(c => c * (1 + streak));
        } else if (kind === 'leather' || kind === 'suede') {
            // Rubbed lighter at the elbows and knees, along the edges the hand touches.
            const joint = (p.fam === 1 || p.fam === 2) ? Math.exp(-(((p.s - 2) / 0.18) ** 2)) : (p.fam === 3 || p.fam === 4) ? Math.exp(-(((p.s - 1) / 0.18) ** 2)) * smoothstep(0, 0.8, Math.cos(p.ang)) : 0;
            const rub = Math.max(joint * 0.6, edge * 0.25) * (kind === 'suede' ? 0.5 : 1);
            rgb = rgb.map(c => c * (1 + 0.22 * rub));
        }
        // Dust along a hem low on the leg or the skirt (faint on new clothes: a pale band read as a stain on a dark suit).
        const low = 1 - smoothstep(0.22, 0.45, R[1]);
        const dust = (1 - smoothstep(0, 0.07, p.vm)) * low * (look && !look.wearInfo ? 0.04 : 0.16);
        return dust > 0 ? mixc(rgb, [0.3, 0.26, 0.21], dust) : rgb;
    }

    /**
     * The layout of an outfit's pieces: charts packed into one picture,
     * painted, and each merged part's vertices as references back into the
     * laid pieces. `entries` [{ laid, look, skirt, name, roughness,
     * metalness, doubleSided }]. Depends on the outfit only.
     */
    function layout(pack, entries, options) {
        const an = Outfit.anatomy(pack);
        const size = (options && options.size) || 1024, pad = 3;
        const all = [];
        entries.forEach((e, ei) => {
            for (const c of charts(an, e.laid, e.skirt)) { c.entry = ei; all.push(c); }
        });
        let area = 0;
        for (const c of all) area += (c.max[0] - c.min[0] + 0.01) * (c.max[1] - c.min[1] + 0.01);
        let scale = Math.min(size*.70, Math.sqrt(size * size * 0.62 / Math.max(area, 1e-6)));
        while (scale > 8 && !pack_(all, size, scale, pad)) scale *= 0.92;

        const data = new Uint8Array(size * size * 4);
        const filled = new Uint8Array(size * size);
        const luminous = entries.some(e => e.look.lightStyle && e.look.lightStyle !== 'none' && e.look.lightIntensity > 0);
        const emission = luminous ? new Uint8Array(data.length) : null;
        // The cloth's own tiles (a full-size picture only: a thumbnail's is too small to show a weave).
        const tiled = size >= 1024 && !!Fabric;
        const hip = an.chains && an.chains.spine ? an.chains.spine[0][1] : 0.885;
        // Tailored trousers cut from the trousers garment are suit cloth, not denim (no twill streaks, whiskers or faded knees).
        // Camouflage is printed on ripstop: a uniform's shirt and trousers take its grid, not shirting or denim.
        const kindOf = e => { const k = Fabric ? Fabric.kindFor(e.look.material, e.garment, e.look.pattern) : null; if (e.look.pattern === 'camo' && e.look.material === 'cloth' && ['poplin', 'denim', 'canvas', 'jersey'].includes(k)) return 'ripstop'; return k === 'denim' && e.item && e.item.trouserStyle === 'tailored' && e.look.material !== 'denim' ? 'suiting' : k; };
        const fabs = entries.map(e => { const kind = kindOf(e); return { kind: kind && Wear ? Wear.fabricKind(kind, e.look, e.garment) : kind, hip }; });
        const edges = entries.map(e => edgeField(an, e.laid.piece, Math.max(0.02, (e.look.trimWidth || 0) * 0.15 + 0.004)));
        const px = 1 / scale;
        const groups = new Map(), maps = [];
        for (const c of all) {
            const e = entries[c.entry], fab = fabs[c.entry], edge = edges[c.entry];
            const colors = [Outfit.linear(e.look.color), Outfit.linear(e.look.color2 || e.look.color), Outfit.linear(e.look.trim || e.look.color2 || e.look.color)];
            const kind = tiled ? fab.kind : null;
            // One part per finish and per cloth: each its own tiles.
            const key = [e.roughness, e.metalness, !!e.doubleSided, kind || ''].join('|');
            let g = groups.get(key);
            if (!g) {
                groups.set(key, g = { e, kind, span: null, names: new Set(), refs: [], uvs: [], uvs1: [], index: [], map: new Map() });
                const t = kind && Fabric.tile(kind);
                if (t) { g.span = t.span; for (const pic of [t.normal, t.orm]) if (!maps.includes(pic)) maps.push(pic); }
                else g.kind = null;
            }
            g.names.add(e.name);
            // A torn piece's holes are cut out of the picture (alpha): its part is drawn cut out.
            if (e.look.wearInfo && e.look.wearInfo.holes.length) g.holes = true;
            const vertexFor = corner => {
                // A point exactly on the rear seam may be -PI in one
                // triangle and +PI in the next. Both passed the old >PI
                // test, welding opposite UV edges into a stretched fan.
                const k = c.entry + ':' + c.fam + ':' + corner.v + ':' + Math.round(corner.cu * 1e8);
                let i = g.map.get(k);
                if (i !== undefined) return i;
                i = g.refs.length / 2;
                g.map.set(k, i);
                g.refs.push(c.entry, corner.v);
                g.uvs.push((c.at[0] + (corner.cu - c.min[0]) * scale) / size, (c.at[1] + (corner.cv - c.min[1]) * scale) / size);
                // The second coordinates: the chart's own meters, in tiles of the cloth.
                if (g.span) g.uvs1.push(corner.cu / g.span[0], corner.cv / g.span[1]);
                return i;
            };
            const glow = Outfit.linear(e.look.lightColor || '#70dfff').map(v => v * (e.look.lightIntensity || 0));
            const color = p => {
                // The cut edge's distance at this very texel, not drawn straight across a triangle three centimeters wide.
                if (p.exact && edge && p.vm < edge.reach) { const d = edge.at(p.rest); if (d < Infinity) p.vm = d; }
                p.px = px;
                return shade(e.look, colors, p, fab);
            };
            for (const tri of c.tris) {
                g.index.push(vertexFor(tri[0]), vertexFor(tri[1]), vertexFor(tri[2]));
                raster(tri, c, scale, size, data, filled, color, emission, p => { const mask = lightMask(e.look, p); return glow.map(v => v * mask); });
            }
        }
        if (emission) dilate(emission, filled.slice(), size, pad + 1);
        dilate(data, filled, size, pad + 1);
        return {
            groups: [...groups.values()].map(g => ({ name: [...g.names].join(', ').slice(0, 60) || 'Outfit', refs: Uint32Array.from(g.refs), uvs: Float32Array.from(g.uvs), index: Uint32Array.from(g.index),
                roughness: g.e.roughness, metalness: g.e.metalness, doubleSided: g.e.doubleSided, material: g.e.look.material, ...(g.holes ? { cutout: true } : {}),
                ...(g.kind ? { fabric: g.kind, uvs1: Float32Array.from(g.uvs1) } : {}) })),
            texture: { width: size, height: size, data, name: 'outfit.png' },
            // The cloths' tiles the parts name (relief, and occlusion/roughness/metal), for the outfit's pictures.
            maps,
            normal: null,
            emission: emission ? { width: size, height: size, data: emission, name: 'outfit-glow.png' } : null,
            scale
        };
    }

    /** The parts of a layout on the pieces as laid now (the same outfit on any body). */
    function apply(lay, entries) {
        return lay.groups.map(g => {
            const n = g.refs.length / 2;
            const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
            for (let i = 0; i < n; i++) {
                const L = entries[g.refs[i * 2]].laid, v = g.refs[i * 2 + 1];
                positions[i * 3] = L.positions[v * 3]; positions[i * 3 + 1] = L.positions[v * 3 + 1]; positions[i * 3 + 2] = L.positions[v * 3 + 2];
                normals[i * 3] = L.normals[v * 3]; normals[i * 3 + 1] = L.normals[v * 3 + 1]; normals[i * 3 + 2] = L.normals[v * 3 + 2];
                for (let q = 0; q < 4; q++) { joints[i * 4 + q] = L.joints[v * 4 + q]; weights[i * 4 + q] = L.weights[v * 4 + q]; }
            }
            // Each vertex's reach down a hanging skirt (RRCharacterCloth), -1 off it; only on a part with some.
            let hang = null, tailoredWaist = false;
            for (let i = 0; i < n; i++) { const L = entries[g.refs[i * 2]].laid; if (L.hang) { hang = hang || new Float32Array(n).fill(-1); hang[i] = L.hang[g.refs[i * 2 + 1]]; tailoredWaist ||= !!L.sewnWaist; } }
            const part = Object.assign({ name: g.name, positions, normals, uvs: g.uvs, joints, weights, fabricRefs:Int32Array.from(g.refs), index: g.index, roughness: g.roughness, metalness: g.metalness, doubleSided: g.doubleSided, texture: lay.texture.name }, lay.normal?{normalTexture:lay.normal.name,normalScale:.40}:{},hang ? { hang, ...(tailoredWaist?{tailoredWaist:true}:{}) } : {}, lay.emission ? { emissive: '#ffffff', emissiveTexture: lay.emission.name } : {});
            // The cloth's tile on the second coordinates; metal keeps its material's own polish round the tile's streaks.
            const hard = g.material === 'metal' || g.material === 'gold';
            if (g.cutout) { part.cutout = true; part.alphaCutoff = 0.5; }
            if (g.fabric && Fabric) Fabric.applyTo(part, g.fabric, null, { uvs1: g.uvs1, roughness: hard ? g.roughness : undefined, sheenTexture: lay.texture.name });
            return part;
        });
    }

    /** Pieces into textured parts: { parts, texture }. */
    function build(pack, entries, options) {
        const lay = layout(pack, entries, options);
        return { parts: apply(lay, entries), texture: lay.texture, layout: lay };
    }
    const pack_ = pack;

    /** Paints one chart triangle's texels. */
    function raster(tri, chart, scale, size, data, filled, color, emission, light) {
        const px = tri.map(k => chart.at[0] + (k.cu - chart.min[0]) * scale), py = tri.map(k => chart.at[1] + (k.cv - chart.min[1]) * scale);
        const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
        if (Math.abs(area) < 1e-9) return;
        const x0 = Math.max(0, Math.floor(Math.min(...px)) - 1), x1 = Math.min(size - 1, Math.ceil(Math.max(...px)) + 1);
        const y0 = Math.max(0, Math.floor(Math.min(...py)) - 1), y1 = Math.min(size - 1, Math.ceil(Math.max(...py)) + 1);
        const p = { fam: tri[0].fam, s: 0, ang: 0, cu: 0, cv: 0, y: 0, val: 0, vm: 0, u: 0, rest: [0, 0, 0], su: tri[0].su, rad: tri[0].rad, exact: !!tri.exact, px: 1 / scale };
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const cx = x + 0.5, cy = y + 0.5;
            let w0 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / area;
            let w1 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / area;
            let w2 = 1 - w0 - w1;
            // Half a texel past the edge too, so neighboring triangles meet without a gap.
            const tol = -0.75 / Math.sqrt(Math.abs(area));
            if (w0 < tol || w1 < tol || w2 < tol) continue;
            const o = y * size + x;
            if (filled[o] === 2) continue;
            const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
            w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2);
            const ws = w0 + w1 + w2; w0 /= ws; w1 /= ws; w2 /= ws;
            const k = (name) => tri[0][name] * w0 + tri[1][name] * w1 + tri[2][name] * w2;
            p.s = k('s'); p.ang = k('ang'); p.cu = k('cu'); p.cv = k('cv'); p.y = k('y'); p.val = k('val'); p.vm = k('vm'); p.u = k('u');
            for (let q = 0; q < 3; q++) p.rest[q] = tri[0].rest[q] * w0 + tri[1].rest[q] * w1 + tri[2].rest[q] * w2;
            const rgb = color(p);
            data[o * 4] = toByte(rgb[0]); data[o * 4 + 1] = toByte(rgb[1]); data[o * 4 + 2] = toByte(rgb[2]); data[o * 4 + 3] = rgb.length > 3 ? Math.round(Math.max(0, Math.min(1, rgb[3])) * 255) : 255;
            if (emission) { const glow = light(p); for (let k = 0; k < 3; k++) emission[o * 4 + k] = toByte(glow[k]); emission[o * 4 + 3] = 255; }
            filled[o] = inside ? 2 : 1;
        }
    }

    /** Grows painted texels into the empty ones around them, `passes` texels deep (so filtering never reads black). */
    function dilate(data, filled, size, passes) {
        for (let p = 0; p < passes; p++) {
            const next = [];
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const o = y * size + x;
                if (filled[o]) continue;
                let r = 0, g = 0, b = 0, n = 0;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const X = x + dx, Y = y + dy;
                    if (X < 0 || Y < 0 || X >= size || Y >= size) continue;
                    const q = Y * size + X;
                    if (!filled[q]) continue;
                    r += data[q * 4]; g += data[q * 4 + 1]; b += data[q * 4 + 2]; n++;
                }
                if (n) next.push([o, r / n, g / n, b / n]);
            }
            for (const [o, r, g, b] of next) { data[o * 4] = r; data[o * 4 + 1] = g; data[o * 4 + 2] = b; data[o * 4 + 3] = 255; filled[o] = 1; }
        }
    }

    // ── footwear ──────────────────────────────────────────────────────────
    const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const band = (x, c, w) => Math.abs(x - c) < w;
    const stitch = (along, period) => fract(along / period) < 0.55;

    /**
     * A pair of shoes' picture: painted from where each texel lies on the shoe
     * (its region, how far forward and out on the foot, its height, how far
     * under the collar), so seams, stitches, laces and the sole's edge land in
     * place on every style. `t`: RRCharacterOutfit's shoe template; `look`:
     * { kind, color, color2, trim, material, laces }.
     */
    function shoePicture(t, look, size) {
        const W = size || 512, Hh = W;
        const data = new Uint8Array(W * Hh * 4), filled = new Uint8Array(W * Hh);
        const A = t.paint.attrs, U = t.paint.uvs, I = t.paint.index;
        const c1 = Outfit.linear(look.color), c2 = Outfit.linear(look.color2 || look.color), trim = Outfit.linear(look.trim || look.color2 || look.color);
        const kind = look.kind || 'dress';
        const metal = look.material === 'metal' || look.material === 'gold';
        const keys = ['f', 'fm', 'l', 'y', 'row', 'col', 'below', 'ring', 'depth', 'k'];
        const pt = {};
        const paint = (p, tx, ty) => {
            const grain = metal ? 0.95 + 0.07 * noise(tx * 0.08, ty * 1.6) : 0.9 + 0.08 * noise(tx * 0.9, ty * 0.9) + 0.05 * noise(tx * 0.12, ty * 0.12);
            const side = Math.abs(p.l);
            let rgb;
            // The lining in a shade of the shoe's own color (a tan lining read as bare skin in a dark boot's top).
            if (p.region === 'lining') rgb = kind === 'sneaker' ? scale3(c2, 0.55) : scale3(c1, 0.55);
            else if (p.region === 'roll') rgb = kind === 'sneaker' ? c2 : kind === 'boot' && look.trim ? trim : scale3(c1, 0.82);
            else if (p.region === 'bed') {
                // The footbed: lighter, worn darker where the heel and the ball press.
                const worn = Math.exp(-((p.f - 0.2) ** 2) / 0.01) + Math.exp(-((p.f - 0.7) ** 2) / 0.012);
                rgb = scale3(mix3(c1, [0.6, 0.45, 0.3], 0.25), 1.15 - 0.2 * Math.min(1, worn));
            } else if (p.region === 'sole' || p.region === 'tread') rgb = soleColor(p, kind, c1, c2, trim, metal);
            else rgb = upperColor(p, kind, c1, c2, trim, metal, tx, look);
            const k = p.region === 'tread' ? 0.85 : grain;
            // A worn shoe (its look's `wear`, RRCharacterWear): dusty, scuffed at the toe, creased.
            return look.wear > 0 && Wear ? Wear.shoe(scale3(rgb, k), p, look) : scale3(rgb, k);
        };
        for (let tI = 0; tI < I.length; tI += 3) {
            const c = [I[tI], I[tI + 1], I[tI + 2]];
            const px = c.map(v => U[v * 2] * W), py = c.map(v => U[v * 2 + 1] * Hh);
            const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
            if (Math.abs(area) < 1e-9) continue;
            const x0 = Math.max(0, Math.floor(Math.min(...px)) - 1), x1 = Math.min(W - 1, Math.ceil(Math.max(...px)) + 1);
            const y0 = Math.max(0, Math.floor(Math.min(...py)) - 1), y1 = Math.min(Hh - 1, Math.ceil(Math.max(...py)) + 1);
            const tol = -0.75 / Math.sqrt(Math.abs(area));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const cx = x + 0.5, cy = y + 0.5;
                let w0 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / area;
                let w1 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / area;
                let w2 = 1 - w0 - w1;
                if (w0 < tol || w1 < tol || w2 < tol) continue;
                const o = y * W + x;
                if (filled[o] === 2) continue;
                const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
                w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2);
                const ws = w0 + w1 + w2; w0 /= ws; w1 /= ws; w2 /= ws;
                const a = A[c[0]], b = A[c[1]], d = A[c[2]];
                for (const key of keys) pt[key] = (a[key] ?? 0) * w0 + (b[key] ?? 0) * w1 + (d[key] ?? 0) * w2;
                pt.region = (w0 >= w1 && w0 >= w2 ? a : w1 >= w2 ? b : d).region;
                const rgb = paint(pt, x, y);
                data[o * 4] = toByte(rgb[0]); data[o * 4 + 1] = toByte(rgb[1]); data[o * 4 + 2] = toByte(rgb[2]); data[o * 4 + 3] = 255;
                filled[o] = inside ? 2 : 1;
            }
        }
        dilate(data, filled, W, 4);
        for (let o = 0; o < W * Hh; o++) if (!filled[o]) { data[o * 4] = toByte(c1[0]); data[o * 4 + 1] = toByte(c1[1]); data[o * 4 + 2] = toByte(c1[2]); data[o * 4 + 3] = 255; }
        return { width: W, height: Hh, data };
    }

    /** The sole's edge and tread by style: a stacked heel, a sneaker's white midsole over a dark outsole, a mag boot's glowing band. */
    function soleColor(p, kind, c1, c2, trim, metal) {
        if (p.region === 'tread') {
            const base = kind === 'sneaker' ? [0.05, 0.05, 0.055] : kind === 'mag' ? [0.03, 0.03, 0.035] : kind === 'sandal' ? scale3(c1, 0.55) : [0.03, 0.025, 0.02];
            return base;
        }
        const d = p.depth;
        if (kind === 'sneaker') {
            // Midsole white with a line moulded round it, the outsole dark beneath.
            if (d > 0.78) return [0.05, 0.05, 0.055];
            if (band(d, 0.5, 0.035)) return scale3(trim, 0.75);
            return mix3(trim, [0.9, 0.9, 0.88], 0.5);
        }
        if (kind === 'mag') {
            if (band(d, 0.45, 0.09)) return scale3(c2, 1.6);
            return [0.05, 0.055, 0.06];
        }
        if (kind === 'sabaton') return scale3(c1, 0.45);
        if (kind === 'sandal') return d < 0.1 ? scale3(c1, 0.8) : scale3(c1, 0.5 + 0.1 * (fract(d * 3) < 0.5 ? 1 : 0));
        // Leather: the welt's stitched top, a dark edge, a stacked heel at the back.
        const edge = [0.035, 0.026, 0.02];
        if (p.ring < 1.2) return stitch(p.col * 6, 1) && p.ring > 0.55 && p.ring < 0.85 ? [0.24, 0.19, 0.13] : scale3(edge, 1.3);
        if (p.f < 0.25 && kind !== 'sabaton') return scale3(edge, fract(d * 4) < 0.15 ? 0.6 : 1.5);
        return edge;
    }

    /** The upper by style: seams, stitching, a toe cap, laces over the instep, a sneaker's stripe and heel tab. */
    function upperColor(p, kind, c1, c2, trim, metal, tx, look) {
        const below = p.below, side = Math.abs(p.l), f = p.f, y = p.y;
        let rgb = c1;
        if (metal) {
            // Plates: a dark groove where each lame overlaps the next, rivets along it.
            if (kind === 'sabaton' || kind === 'mag') {
                // Each plate darkest where it tucks under the next, catching the light along its own edge.
                const lames = look.lames || (kind === 'sabaton' ? 2 : 3), r = (p.row - 3) / lames;
                if (p.row > 3) {
                    const q = fract(r);
                    if (q < 0.05) return scale3(c1, 0.3);
                    const rivet = Math.hypot((fract(p.col / 2.5) - 0.5) * 2.5, (q - 0.16) * 9);
                    if (kind === 'sabaton' && rivet < 0.35) return scale3(c1, 1.45 - rivet);
                    return scale3(c1, 0.78 + 0.32 * smoothstep(0.05, 0.14, q) - 0.18 * smoothstep(0.6, 1, q));
                }
            }
            if (kind === 'mag' && band(y, 0.035, 0.002)) return scale3(c2, 1.6);
            if (y < 0.004) return scale3(c1, 0.6);
            return scale3(rgb, 0.92 + 0.12 * smoothstep(0.6, 0.95, f));
        }
        // The collar: a binding, its stitching just under it.
        if (below >= 0 && below < 0.18) return kind === 'sneaker' ? c2 : scale3(look.trim ? trim : c1, 0.75);
        if (below > 0.32 && below < 0.42 && stitch(p.col, 0.45)) return mix3(c1, [0.8, 0.74, 0.62], 0.28);
        // Where the upper is stitched to the sole.
        if (y > 0.004 && y < 0.006 && stitch(p.col, 0.4)) return mix3(c1, [0.8, 0.74, 0.62], kind === 'sneaker' ? 0.15 : 0.28);
        if (y < 0.004) rgb = scale3(c1, 0.75);
        const laces = look.laces;
        if (kind === 'sneaker') {
            // Canvas: a fine weave.
            const weave = fract(tx / 2) < 0.5 ? 0.96 : 1.04;
            rgb = scale3(rgb, weave);
            if (f > 0.86 && y < 0.032) rgb = trim;
            // A stripe sweeping back along each side.
            const yc = 0.018 + 0.026 * (1 - f), along = smoothstep(0.22, 0.32, f) * (1 - smoothstep(0.68, 0.78, f));
            if (side > 0.02 && along > 0 && Math.abs(y - yc) < 0.006 * along + 0.0005) rgb = c2;
            // A heel tab behind.
            if (f < 0.07 && below < 1.2) rgb = c2;
        } else if (kind === 'dress' || kind === 'boot') {
            // A toe cap with a perforated seam, polished lighter toward the toe.
            const cap = 0.79 + 0.05 * Math.max(0, 1 - (side / 0.04) ** 2);
            if (band(f, cap, 0.004) && y > 0.01) return scale3(c1, 0.6);
            if (kind === 'dress' && band(f, cap - 0.02, 0.0045) && fract(p.col * 1.5) < 0.4) return scale3(c1, 0.45);
            rgb = scale3(rgb, 1 + 0.18 * smoothstep(0.75, 0.97, f));
            // The quarter's seam, from under the collar down toward the welt.
            if (band(f, 0.42 - y * 1.2, 0.0035) && side > 0.015 && y > 0.01 && below > 0.5) return scale3(c1, 0.62);
            // A boot's seam up the back.
            if (kind === 'boot' && p.fm < 0 && side < 0.003 && y > 0.05) return scale3(c1, 0.6);
        }
        if (laces) {
            // Over the instep: a tongue, two rows of eyelets and the laces crossed between them.
            const front = p.fm > 0 && f < 0.78;
            const yMin = kind === 'boot' ? 0.045 : 0.04;
            if (front && side < 0.019 && y > yMin && below > -0.5) {
                const tongue = kind === 'sneaker' ? scale3(c1, 0.9) : scale3(c1, 0.85);
                const step = 0.011, at = p.y / step + p.fm * 5;
                // Eyelets: small metal rings, dark inside.
                const er = Math.hypot((side - 0.0145) / 0.0022, (fract(at) - 0.15) / 0.22);
                if (er < 1) return er < 0.55 ? [0.02, 0.02, 0.02] : kind === 'sneaker' ? scale3(c1, 0.8) : [0.32, 0.3, 0.26];
                const L = Math.abs(2 * fract(at) - 1) * 0.0145;
                const lace = Math.min(Math.abs(side - L), Math.abs(side + L - 0.029));
                const laceColor = look.laceColor || (kind === 'sneaker' ? mix3(c2, [0.9, 0.9, 0.88], 0.35) : [0.16, 0.11, 0.07]);
                if (lace < 0.0016 && side < 0.0135) return scale3(laceColor, 0.75 + 0.4 * (1 - lace / 0.0016));
                // The laces' shadow on the tongue under them.
                if (lace < 0.0026 && side < 0.0135) return scale3(tongue, 0.6);
                if (side < 0.0115) return tongue;
            }
        }
        return rgb;
    }

    /**
     * A belt's picture: its leather (or cloth) with stitching along both
     * edges, a buckle and its holes at the front. u runs round the belt from
     * behind, v across it (the outer face is the first half).
     */
    function beltPicture(look, size) {
        const W = size || 1024, H = 64, data = new Uint8Array(W * H * 4);
        const c1 = Outfit.linear(look.color), metal = Outfit.linear(look.buckle || '#b89a5a');
        const cloth = look.material === 'cloth' || look.material === 'silk';
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const u = (x + 0.5) / W, v = (y + 0.5) / H, o = (y * W + x) * 4;
            // Across the outer face: 0 at the bottom edge, 1 at the top.
            const across = v / (2 / 7);
            let rgb = c1, k = cloth ? 0.92 + 0.08 * noise(x * 0.9, y * 2.5) + 0.04 * Math.sin(across * 18) : 0.9 + 0.1 * noise(x * 0.8, y * 0.8);
            if (across <= 1.02) {
                const du = Math.abs(u - 0.5);
                if (!cloth && (Math.abs(across - 0.12) < 0.035 || Math.abs(across - 0.88) < 0.035) && fract(x / 4) < 0.6) k *= 1.35;
                // The buckle: a frame round a bar, the tongue's end in the middle.
                if (du < 0.022 && across > 0.02 && across < 0.98) {
                    const frame = du > 0.016 || across < 0.16 || across > 0.84;
                    if (frame) { rgb = metal; k = 1.05 + 0.15 * (1 - across); }
                    else if (du < 0.004) { rgb = metal; k = 0.9; }
                    else k *= 0.7;
                }
                // Holes past the buckle.
                if (!cloth && u > 0.53 && u < 0.6 && Math.abs(across - 0.5) < 0.12 && fract((u - 0.53) / 0.014) < 0.3) k *= 0.25;
            } else k *= 0.7;
            data[o] = toByte(rgb[0] * k); data[o + 1] = toByte(rgb[1] * k); data[o + 2] = toByte(rgb[2] * k); data[o + 3] = 255;
        }
        return { width: W, height: H, data };
    }

    /**
     * A helmet's picture, by where each texel lies on the shell: its height
     * against the eyes' and its direction round the head. A rim at the
     * bottom, a great helm's eye slit, ridge and breaths, a visor helmet's
     * seam round its window. `t`: RRCharacterOutfit's helmet template;
     * `look`: { color, trim, material, kind }.
     */
    function helmPicture(t, look, size) {
        const W = size || 256, H = W, data = new Uint8Array(W * H * 4);
        const c1 = Outfit.linear(look.color), trim = Outfit.linear(look.trim || look.color);
        const G = t.grid.G, C = t.cols + 1, rows = t.rows, eyeY = t.grid.eyeY;
        const rowY = Array.from({ length: rows }, (_, r) => G[(r * C) * 3 + 1]);
        const metal = look.material === 'metal' || look.material === 'gold';
        const w = t.style.window;
        for (let y = 0; y < H; y++) {
            const fr = (y + 0.5) / H * (rows - 1), r0 = Math.min(rows - 2, Math.floor(fr)), height = rowY[r0] + (rowY[r0 + 1] - rowY[r0]) * (fr - r0);
            const dy = height - eyeY, fromRim = height - rowY[0];
            for (let x = 0; x < W; x++) {
                const a = ((x + 0.5) / W) * Math.PI * 2 - Math.PI, o = (y * W + x) * 4, aa = Math.abs(a);
                let rgb = c1, k = metal ? 0.94 + 0.08 * noise(x * 0.1, y * 2) : 0.95 + 0.05 * noise(x * 0.5, y * 0.5);
                // The rim, turned and riveted.
                if (fromRim < 0.012) { rgb = trim; k *= fromRim < 0.004 ? 0.8 : 1.08; if (metal && fromRim > 0.006 && fromRim < 0.009 && fract(a * 7) < 0.15) k *= 1.4; }
                if (t.style.slit) {
                    if (aa < 1.05 && dy > -0.005 && dy < 0.006) k *= 0.05;
                    else if (aa < 1.1 && (Math.abs(dy + 0.0065) < 0.0015 || Math.abs(dy - 0.0075) < 0.0015)) k *= 1.25;
                    if (aa < 0.05 && dy < -0.006) k *= 0.75;
                    if (a > 0.25 && a < 0.85 && dy < -0.025 && dy > -0.07 && fract(a * 14) < 0.35 && fract(dy * 90) < 0.35) k *= 0.08;
                }
                if (w && !w.open) {
                    const mid = (w.high + w.low) / 2, half = (w.high - w.low) / 2;
                    const inside = 1 - Math.pow(Math.pow(aa / w.half, 4) + Math.pow(Math.abs(dy - mid) / half, 4), 0.25);
                    // A seam round the window, the shell's edge darker against the visor.
                    if (inside > -0.12 && inside < 0.08) { rgb = trim; k *= inside > -0.03 ? 0.6 : 1; }
                }
                if (w && w.open) {
                    const mid = (w.high + w.low) / 2, half = (w.high - w.low) / 2;
                    const inside = 1 - Math.pow(Math.pow(aa / w.half, 4) + Math.pow(Math.abs(dy - mid) / half, 4), 0.25);
                    if (inside > -0.1) { rgb = trim; k *= 1.05; }
                }
                // A ridge over the crown, front to back.
                if (aa < 0.05 || aa > Math.PI - 0.05) if (dy > 0.06) k *= 1.15;
                data[o] = toByte(rgb[0] * k); data[o + 1] = toByte(rgb[1] * k); data[o + 2] = toByte(rgb[2] * k); data[o + 3] = 255;
            }
        }
        return { width: W, height: H, data };
    }

    /** Pauldron plates' picture: v runs down the plates in turn; each plate's lower edge trimmed, rivets along its top. */
    function platePicture(look, plates, size) {
        const W = size || 256, H = W, data = new Uint8Array(W * H * 4);
        const c1 = Outfit.linear(look.color), trim = Outfit.linear(look.trim || look.color);
        for (let y = 0; y < H; y++) {
            const f = (y + 0.5) / H * plates, q = f - Math.floor(f);
            for (let x = 0; x < W; x++) {
                const u = (x + 0.5) / W, o = (y * W + x) * 4;
                let rgb = c1, k = 0.94 + 0.08 * noise(x * 0.08, y * 1.5);
                // Lighter where each plate bulges, darker toward where it tucks under.
                k *= 0.85 + 0.25 * Math.sin(q * Math.PI);
                if (q > 0.86) { rgb = trim; k = q > 0.95 ? 0.75 : 1.1; }
                if (q < 0.14 && q > 0.05 && Math.abs(fract(u * 6) - 0.5) < 0.06) k *= 1.5;
                if (u < 0.03 || u > 0.97) { rgb = trim; k *= 0.95; }
                data[o] = toByte(rgb[0] * k); data[o + 1] = toByte(rgb[1] * k); data[o + 2] = toByte(rgb[2] * k); data[o + 3] = 255;
            }
        }
        return { width: W, height: H, data };
    }

    const api = { build, layout, apply, charts, shade, noise, shoePicture, beltPicture, helmPicture, platePicture };
    root.RRCharacterAtlas = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
