/**
 * RRCharacterDrape - soft garments settled as cloth when they are built.
 *
 * A soft garment piece (RRCharacterOutfit) is cut from the body's clothing
 * helpers and laid round the body as a shell. Here that shell is let go as
 * cloth: cut a little larger than the shell (ease round the body, a little
 * along it), held where a garment is held (a neckline, a waistband, a
 * gathered cuff, a sewn waist seam), weighed down by gravity and settled
 * on the body (and on the garments already worn under it) with friction.
 * Its bends prefer to straighten, so it bridges hollows (under the bust,
 * the small of the back, between the legs) instead of following the skin,
 * and its spare width falls into folds: flutes round a flared skirt, soft
 * vertical folds below the chest, stacking above a cuff, drag folds at the
 * armpit. It is position-based cloth (stretch swept from the top down,
 * softer compression, bending between neighbors, a smoothness that keeps
 * heavy cloth from buckling finer than its weight allows, collision planes
 * refreshed from the nearest body and layer triangles, friction), with a
 * few garment rules on top: it may settle only so far down (it hangs, it
 * does not slide off), a skirt hangs straight from the widest thing above
 * it (and a full skirt stands on its petticoat), and cloth an outer garment
 * covers (spec.covered) is pressed flat. Deterministic: the same recipe and
 * body always settle the same way.
 *
 * Pipeline (the hook other modules rely on):
 *   RRCharacterOutfit.cutFor   refines the cut where cloth hangs loose
 *                              (zone / edgeLimit below): the cut's topology
 *                              is per garment setting, never per body, so
 *                              the outfit picture's layout still fits
 *   RRCharacterOutfit.lay      lifts, hangs and tailors the shell, then
 *                              drape() settles its own surface (piece
 *                              vertices, laid.positions [0, rimStart)); the
 *                              turned hem rows are built after, from the
 *                              draped edge. laid.draped holds the stats.
 *                              Each laid piece is kept on the build's frame
 *                              (frame.drapeLayers) as a collider for the
 *                              pieces laid after it (outer layers)
 *   RRCharacterWardrobe.build  overlays, joins waists, and only then fits
 *                              construction details (RRCharacterGarmentDetails
 *                              .build / .construct), trims and fasteners: they
 *                              sit on the final, draped surface
 *
 * Edge effects (frayed or ragged hems, holes, patches: RRCharacterWear) hook
 * in after lay, on entries[].laid: the draped edge is laid.piece.border
 * (pairs of piece vertices, in winding order) at laid.positions, its turned
 * hem rows laid.hem.rows (border vertex -> its added vertex ids, roll then
 * facing) and laid.origin (each added vertex -> its border vertex), its
 * body point laid.base and its normals laid.normals. Anything that moves the
 * edge moves those rows with it (they share origin), and recomputes normals.
 * Nothing here knows any garment by id: the cloth comes from the spec alone
 * (spec.folds.role / fit / weight / flare, spec.structured, spec.hang,
 * spec.surface), so new catalog garments drape by what they are.
 *
 *   profile(spec)      the piece's cloth (null: it is not draped: hard
 *                      plates, skin-tight and close-fitting pieces)
 *   zone(prof, field)  0..1, where the cut needs finer faces for folds
 *   edgeLimit(prof)    the longest edge (meters, average body) there
 *   drape(ctx)         settles ctx.pos in place; returns stats or null
 *
 * Skin weights are not touched: each vertex keeps the weights of the body
 * points it was cut from (normalized, four influences), so the garment
 * animates as before. Results are cached per piece, body, layers under it
 * and quality ('preview' runs fewer steps, from the last preview's drape of
 * the same piece while sliders move; a save always settles from scratch).
 *
 * No DOM and no three.js: the builder page, its preview worker and the node
 * tests share it.
 */
(function(root) {
    'use strict';

    const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

    /** Steps of settling: save quality is the reference the stiffnesses are tuned at. */
    const QUALITY = {
        save: { substeps: 150, dt: 1 / 300, refresh: 6, smooth: 2 },
        // The builder's view: fewer steps, and while sliders move it starts from the last drape of the same piece
        // (`warm`), so the cloth only has to settle the change. A saved file always settles from the laid shell.
        preview: { substeps: 80, warm: 32, dt: 1 / 300, refresh: 5, smooth: 1 }
    };
    const REFERENCE_STEPS = QUALITY.save.substeps;
    const GRAVITY = 9.81;
    /** Results kept per pack (piece, body, layers, quality). */
    const CACHE_SIZE = 64;

    // ── what the cloth is ─────────────────────────────────────────────────
    /**
     * A piece's cloth, from its garment spec: { role, fit, girth, length
     * (ease, fractions), bend (stiffness), flat (how much its bends want to
     * straighten), hold (structured shape kept), gap (meters off the skin),
     * cuff, joined, seed, flare, edge (refinement edge, meters) } or null.
     */
    function profile(spec) {
        if (!spec || spec.hard || spec.closeFit || spec.collide === false || spec.drapeCloth === false) return null;
        const F = spec.folds;
        if (!F) return null;
        const role = spec.surface === 'skirt' ? 'skirt' : (F.role || 'top');
        if (api.tune && api.tune.off && api.tune.off.includes(role)) return null;
        const fit = clamp(F.fit ?? 0.3, 0, 1);
        // Fitted bodices and second-skin suits stay as cut.
        if (role !== 'skirt' && fit < 0.1) return null;
        // A fitted bodice sewn to its skirt (a dress's, a gown's) is shaped to the body: it stays as cut.
        if (role === 'top' && spec.hang && spec.hang.joined && (spec.hang.chest ?? 0) < 0.3) return null;
        const weight = F.weight ?? 0.0012;
        // 0 sheer, ~0.2 jersey, ~0.4 denim, ~0.6 wool, 1 coat cloth, more for quilting.
        const heavy = clamp((weight - 0.0006) / 0.0029, 0, 1.8);
        const cap = Math.max(1, F.cap ?? 1);
        const structured = !!spec.structured;
        const hang = spec.hang || {};
        const p = {
            role, fit, weight, heavy, cap, structured,
            seed: F.seed || 0,
            flare: clamp(F.flare ?? 0.3, 0, 1.2),
            surface: spec.surface,
            cuff: role !== 'skirt' && (hang.cuff ?? 0) > 0.5,
            joined: !!hang.joined,
            open: !!(spec.rules && spec.rules.open)
        };
        // Ease: spare cloth round the body (girth) and along it (length), as a fraction of the shell's own size.
        // (Length ease lets a top fall from the chest and the shoulder blades instead of following the waist in.)
        if (role === 'skirt') { p.girth = 0.015; p.length = 0; }
        else if (role === 'bottom') { p.girth = 0.02 + 0.07 * fit; p.length = 0.015; }
        else if (role === 'one') { p.girth = 0.02 + 0.06 * fit; p.length = 0.03; }
        else { p.girth = 0.04 + 0.12 * fit; p.length = 0.03 + 0.03 * fit; }
        if (structured) p.girth = Math.min(p.girth, 0.04);
        // A bodice sewn to its skirt is held at both ends: spare length would only pile up above the seam.
        if (p.joined) p.length = Math.min(p.length, 0.008);
        // Bending: heavier cloth (and a bulky suit) folds broader.
        p.bend = clamp((0.12 + 0.2 * heavy) * Math.sqrt(cap) * (structured ? 1.8 : 1), 0, 0.7);
        p.flat = structured ? 0.45 : role === 'skirt' ? 0.9 : 0.8;
        // Smoothness (no bump narrower than a few faces): heavier cloth and tailoring fold only broadly.
        p.smooth = clamp((structured ? 0.35 : 0.05 + 0.28 * heavy) * Math.sqrt(cap), 0, 0.6);
        p.compress = role === 'skirt' ? 0.3 : 0.25;
        // A full skirt stands out on what is worn under it (a petticoat, a hoop): it can fall in only so far.
        p.support = role === 'skirt' ? 0.86 * smoothstep(0.45, 0.95, p.flare) : 0;
        // A tailored coat keeps its padded shoulders and chest; a bulky suit its bulk.
        p.hold = structured ? 0.012 : cap > 1 ? 0.004 : 0;
        // Off the skin (or the layer under it): half the cloth's thickness and a little air.
        p.gap = 0.0022 + weight * 0.55;
        // A skirt hangs clear of the skin (and of a dress's lining under it) by part of its laid lift.
        if (role === 'skirt') p.gap += (spec.lift ?? 0.012) * 0.6;
        // How far a held edge is taken in onto the body: a skirt's waistband stays where it was laid (on its yoke).
        p.snug = role === 'skirt' ? 0 : 0.85;
        // A skirt is moved further by its cloth rig in every motion (RRCharacterCloth): its folds stay within a
        // few centimeters of where it was laid, so the rig's chains still carry it.
        p.reach = role === 'skirt' ? 0.06 : 0;
        p.friction = role === 'skirt' ? 0.35 : 0.55;
        p.edge = (role === 'skirt' ? 0.04 : 0.03) * (1 + 0.25 * Math.min(1, heavy)) * Math.sqrt(cap);
        p.passes = 1;
        // How far the cloth may settle down from where it was laid (meters on a 1.7 m body): it hangs, it does not slide off.
        p.drop = role === 'skirt' ? 0.03 : role === 'bottom' ? 0.02 : role === 'one' ? 0.04 : 0.06;
        // (Tuning hook for the harness: RRCharacterDrape.tune = { all: {...}, top: {...}, ... }.)
        if (api.tune) Object.assign(p, api.tune.all || {}, api.tune[role] || {});
        return p;
    }

    /** Where the cut needs finer faces: everywhere the cloth is free to fold (the caller scales out what an outer layer hides). */
    function zone(prof, field) {
        if (!prof || !field) return 0;
        // Where cloth folds: a skirt below its hip yoke, a sleeve below the shoulder, a trouser leg below the
        // crotch, a top below the bust. Over the shoulders, the chest and the seat it lies taut on the body.
        if (prof.role === 'skirt') return smoothstep(0.12, 0.24, field.u);
        if (field.fam === 1 || field.fam === 2) return smoothstep(1.1, 1.4, field.s);
        if (field.fam === 3 || field.fam === 4) return smoothstep(0.05, 0.25, field.s);
        return prof.role === 'bottom' ? 0 : 1 - smoothstep(2.4, 2.8, field.s);
    }

    /** The longest edge (meters on the average body) where the cut folds; the skin itself (a full body's detailed cut) is already fine. */
    function edgeLimit(prof) {
        if (!prof) return Infinity;
        return prof.surface === 'body' ? prof.edge * 1.3 : prof.edge;
    }

    // ── colliders ─────────────────────────────────────────────────────────
    /**
     * A dense grid of points for nearest-point queries, with each point's
     * triangles (a fan) for the exact closest point on the surface.
     */
    function surfaceGrid(P, N, ids, tris, cell) {
        let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const v of ids) for (let k = 0; k < 3; k++) { const x = P[v * 3 + k]; if (x < lo[k]) lo[k] = x; if (x > hi[k]) hi[k] = x; }
        if (!ids.length) { lo = [0, 0, 0]; hi = [0, 0, 0]; }
        lo = lo.map(x => x - cell * 2); hi = hi.map(x => x + cell * 2);
        const dims = [0, 1, 2].map(k => Math.max(1, Math.ceil((hi[k] - lo[k]) / cell)));
        const cells = dims[0] * dims[1] * dims[2];
        const count = new Int32Array(cells + 1);
        const cellOf = v => {
            const x = Math.floor((P[v * 3] - lo[0]) / cell), y = Math.floor((P[v * 3 + 1] - lo[1]) / cell), z = Math.floor((P[v * 3 + 2] - lo[2]) / cell);
            return (x * dims[1] + y) * dims[2] + z;
        };
        for (const v of ids) count[cellOf(v) + 1]++;
        for (let c = 0; c < cells; c++) count[c + 1] += count[c];
        const items = new Int32Array(ids.length), fill = count.slice(0, cells);
        for (const v of ids) items[fill[cellOf(v)]++] = v;
        // Each point's triangles.
        const vmax = ids.reduce((m, v) => Math.max(m, v), 0) + 1;
        const fanStart = new Int32Array(vmax + 1);
        for (let t = 0; t < tris.length; t++) fanStart[tris[t] + 1]++;
        for (let v = 0; v < vmax; v++) fanStart[v + 1] += fanStart[v];
        const fan = new Int32Array(tris.length), at = fanStart.slice(0, vmax);
        for (let t = 0; t < tris.length; t += 3) for (let k = 0; k < 3; k++) fan[at[tris[t + k]]++] = t;
        return { P, N, tris, lo, dims, cell, start: count, items, fanStart, fan };
    }

    /** The nearest grid point to x (searching the 2x2x2 cells round it, then 3x3x3), or -1. */
    function nearestPoint(g, x, y, z) {
        const fx = (x - g.lo[0]) / g.cell, fy = (y - g.lo[1]) / g.cell, fz = (z - g.lo[2]) / g.cell;
        const D = g.dims, P = g.P;
        let best = -1, bd = Infinity;
        const scan = (x0, x1, y0, y1, z0, z1) => {
            for (let i = Math.max(0, x0); i <= Math.min(D[0] - 1, x1); i++) for (let j = Math.max(0, y0); j <= Math.min(D[1] - 1, y1); j++) for (let k = Math.max(0, z0); k <= Math.min(D[2] - 1, z1); k++) {
                const c = (i * D[1] + j) * D[2] + k;
                for (let q = g.start[c], e = g.start[c + 1]; q < e; q++) {
                    const v = g.items[q], dx = P[v * 3] - x, dy = P[v * 3 + 1] - y, dz = P[v * 3 + 2] - z, d = dx * dx + dy * dy + dz * dz;
                    if (d < bd) { bd = d; best = v; }
                }
            }
        };
        const ix = Math.floor(fx - 0.5), iy = Math.floor(fy - 0.5), iz = Math.floor(fz - 0.5);
        scan(ix, ix + 1, iy, iy + 1, iz, iz + 1);
        if (best < 0 || bd > (g.cell * 0.5) ** 2) { const cx = Math.floor(fx), cy = Math.floor(fy), cz = Math.floor(fz); scan(cx - 1, cx + 1, cy - 1, cy + 1, cz - 1, cz + 1); }
        return best;
    }

    /**
     * The closest point of the surface round grid point v's triangles to x:
     * out = [qx, qy, qz, nx, ny, nz (the smooth normal there), distance,
     * inside (1 where x projects inside a triangle, 0 past every edge)].
     */
    function closestOnFan(g, v, x, y, z, out) {
        const P = g.P, N = g.N, T = g.tris;
        let bd = Infinity, inside = 0;
        for (let f = g.fanStart[v], e = g.fanStart[v + 1]; f < e; f++) {
            const t = g.fan[f], a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
            const abx = P[b] - P[a], aby = P[b + 1] - P[a + 1], abz = P[b + 2] - P[a + 2];
            const acx = P[c] - P[a], acy = P[c + 1] - P[a + 1], acz = P[c + 2] - P[a + 2];
            const apx = x - P[a], apy = y - P[a + 1], apz = z - P[a + 2];
            // Ericson's closest point on a triangle, as barycentric weights.
            const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
            let u, w, inTri = 0;
            if (d1 <= 0 && d2 <= 0) { u = 0; w = 0; }
            else {
                const bpx = x - P[b], bpy = y - P[b + 1], bpz = z - P[b + 2];
                const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
                if (d3 >= 0 && d4 <= d3) { u = 1; w = 0; }
                else {
                    const vc = d1 * d4 - d3 * d2;
                    if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); w = 0; }
                    else {
                        const cpx = x - P[c], cpy = y - P[c + 1], cpz = z - P[c + 2];
                        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
                        if (d6 >= 0 && d5 <= d6) { u = 0; w = 1; }
                        else {
                            const vb = d5 * d2 - d1 * d6;
                            if (vb <= 0 && d2 >= 0 && d6 <= 0) { u = 0; w = d2 / (d2 - d6); }
                            else {
                                const va = d3 * d6 - d5 * d4;
                                if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 1 - w; }
                                else { const den = 1 / (va + vb + vc); u = vb * den; w = vc * den; inTri = 1; }
                            }
                        }
                    }
                }
            }
            const qx = P[a] + abx * u + acx * w, qy = P[a + 1] + aby * u + acy * w, qz = P[a + 2] + abz * u + acz * w;
            const d = (x - qx) * (x - qx) + (y - qy) * (y - qy) + (z - qz) * (z - qz);
            if (d < bd - 1e-14) {
                bd = d; inside = inTri;
                const s = 1 - u - w;
                let nx = N[a] * s + N[b] * u + N[c] * w, ny = N[a + 1] * s + N[b + 1] * u + N[c + 1] * w, nz = N[a + 2] * s + N[b + 2] * u + N[c + 2] * w;
                const l = Math.hypot(nx, ny, nz) || 1;
                out[0] = qx; out[1] = qy; out[2] = qz; out[3] = nx / l; out[4] = ny / l; out[5] = nz / l;
            }
        }
        out[6] = Math.sqrt(bd); out[7] = inside;
        return bd < Infinity;
    }

    /** The body as a collider (its skin's triangles at this shape), worked out once per build. */
    function bodyCollider(pack, built, frame) {
        if (frame.drapeBody && frame.drapeBody.built === built) return frame.drapeBody;
        const src = pack.body.source, idx = pack.body.index;
        const tris = new Int32Array(idx.length);
        for (let i = 0; i < idx.length; i++) tris[i] = src[idx[i]];
        const P = built.shaped, N = new Float32Array(P.length);
        for (let t = 0; t < tris.length; t += 3) {
            const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
            const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const s of [a, b, c]) { N[s] += nx; N[s + 1] += ny; N[s + 2] += nz; }
        }
        for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; }
        const ids = pack._drapeBodyIds || (pack._drapeBodyIds = Int32Array.from(new Set(src)));
        let floor = Infinity;
        for (const v of ids) floor = Math.min(floor, P[v * 3 + 1]);
        const g = surfaceGrid(P, N, ids, tris, 0.04);
        g.built = built; g.floor = floor; g.border = null;
        return (frame.drapeBody = g);
    }

    /**
     * The garments laid before this piece (frame.drapeLayers) as one
     * collider: their own surfaces (no hem rows), normals turned outward.
     * Pieces of the same garment are left out (a bodice and its skirt are
     * sewn, not worn over each other; a skirt clears its own lining by its
     * larger gap off the body, profile().gap).
     */
    function layerCollider(frame, garment) {
        const list = (frame.drapeLayers || []).filter(L => L.garment !== garment);
        if (!list.length) return null;
        const key = list.map(L => L.id).join(',');
        frame.drapeLayerColliders = frame.drapeLayerColliders || new Map();
        if (frame.drapeLayerColliders.has(key)) return frame.drapeLayerColliders.get(key);
        let total = 0, triTotal = 0;
        for (const L of list) { total += L.laid.rimStart; triTotal += L.laid.index.length; }
        const P = new Float32Array(total * 3), N = new Float32Array(total * 3), border = new Uint8Array(total), extra = new Float32Array(total), tris = [];
        let off = 0;
        for (const L of list) {
            const laid = L.laid, n = laid.rimStart, Q = laid.positions, M = laid.normals, B = laid.base;
            // Outward: the way most of the piece was lifted off the body (its faces all turn the same way).
            let vote = 0;
            for (let i = 0; i < n; i++) { const o = i * 3; vote += (Q[o] - B[o]) * M[o] + (Q[o + 1] - B[o + 1]) * M[o + 1] + (Q[o + 2] - B[o + 2]) * M[o + 2] < 0 ? -1 : 1; }
            const out = vote < 0 ? -1 : 1;
            for (let i = 0; i < n; i++) {
                const o = i * 3;
                for (let k = 0; k < 3; k++) { P[(off + i) * 3 + k] = Q[o + k]; N[(off + i) * 3 + k] = M[o + k] * out; }
                border[off + i] = laid.piece && laid.piece.onBorder ? laid.piece.onBorder[i] : 0;
                // A hem, a cuff or a waistband stands out further than its cloth (its turned edge, the band and loops
                // sewn on it later): what lies over it keeps clear by a little more there.
                extra[off + i] = laid.piece && laid.piece.edgeDist ? 0.012 * (1 - smoothstep(0.01, 0.06, laid.piece.edgeDist[i])) : 0;
            }
            const I = laid.index;
            for (let t = 0; t < I.length; t += 3) if (I[t] < n && I[t + 1] < n && I[t + 2] < n) tris.push(I[t] + off, I[t + 1] + off, I[t + 2] + off);
            off += n;
        }
        const ids = new Int32Array(total);
        for (let i = 0; i < total; i++) ids[i] = i;
        const g = surfaceGrid(P, N, ids, Int32Array.from(tris), 0.04);
        g.border = border; g.extra = extra;
        g.hash = 0;
        for (let i = 0; i < P.length; i += 7) g.hash = (Math.imul(g.hash, 31) + Math.round(P[i] * 1e5)) | 0;
        frame.drapeLayerColliders.set(key, g);
        return g;
    }

    /** Signed distance from a collider's surface (bodyCollider / layerCollider) to a point, or null far from it. */
    function distance(g, x, y, z) {
        const v = nearestPoint(g, x, y, z), out = new Float64Array(8);
        if (v < 0 || !closestOnFan(g, v, x, y, z, out)) return null;
        return (x - out[0]) * out[3] + (y - out[1]) * out[4] + (z - out[2]) * out[5];
    }

    /** Keeps a laid piece as a collider for the pieces laid after it. */
    function remember(frame, laid, spec) {
        if (!frame) return;
        frame.drapeLayers = frame.drapeLayers || [];
        frame.drapeLayers.push({ id: frame.drapeLayers.length, garment: spec && spec.cutKey ? spec.cutKey[0] : null, lining: !!(spec && spec.lining), laid });
    }

    // ── the piece's structure ─────────────────────────────────────────────
    /** Its edges and its bending pairs (the two corners facing each inner edge), kept with the cut. */
    function topology(piece) {
        if (piece._drapeTopo) return piece._drapeTopo;
        const I = piece.index, n = piece.verts.length;
        const map = new Map(), edges = [], opp = [];
        for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = I[t + k], b = I[t + (k + 1) % 3], c = I[t + (k + 2) % 3];
            const key = a < b ? a * n + b : b * n + a;
            let e = map.get(key);
            if (e === undefined) { e = edges.length / 2; map.set(key, e); edges.push(Math.min(a, b), Math.max(a, b)); opp.push(c, -1); }
            else if (opp[e * 2 + 1] < 0) opp[e * 2 + 1] = c;
        }
        const bends = [];
        for (let e = 0; e < edges.length / 2; e++) if (opp[e * 2 + 1] >= 0) bends.push(edges[e * 2], edges[e * 2 + 1], opp[e * 2], opp[e * 2 + 1]);
        return (piece._drapeTopo = { edges: Int32Array.from(edges), bends: Int32Array.from(bends) });
    }

    /** Distances along the cloth from the held vertices (Dijkstra over edges), and which hold each is nearest. */
    function geodesics(n, edges, len, held) {
        const dist = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1);
        const adjStart = new Int32Array(n + 1);
        for (let e = 0; e < edges.length; e++) adjStart[edges[e] + 1]++;
        for (let i = 0; i < n; i++) adjStart[i + 1] += adjStart[i];
        const adj = new Int32Array(edges.length), at = adjStart.slice(0, n);
        for (let e = 0; e < edges.length / 2; e++) { const a = edges[e * 2], b = edges[e * 2 + 1]; adj[at[a]++] = e; adj[at[b]++] = e; }
        // A binary heap of [distance, vertex].
        const hd = [], hv = [];
        const push = (d, v) => { let i = hd.length; hd.push(d); hv.push(v); while (i > 0) { const p = (i - 1) >> 1; if (hd[p] <= hd[i]) break; [hd[p], hd[i]] = [hd[i], hd[p]]; [hv[p], hv[i]] = [hv[i], hv[p]]; i = p; } };
        const pop = () => {
            const d = hd[0], v = hv[0], ld = hd.pop(), lv = hv.pop();
            if (hd.length) { hd[0] = ld; hv[0] = lv; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < hd.length && hd[l] < hd[m]) m = l; if (r < hd.length && hd[r] < hd[m]) m = r; if (m === i) break; [hd[m], hd[i]] = [hd[i], hd[m]]; [hv[m], hv[i]] = [hv[i], hv[m]]; i = m; } }
            return [d, v];
        };
        for (let i = 0; i < n; i++) if (held[i]) { dist[i] = 0; from[i] = i; push(0, i); }
        while (hd.length) {
            const [d, v] = pop();
            if (d > dist[v]) continue;
            for (let q = adjStart[v]; q < adjStart[v + 1]; q++) {
                const e = adj[q], u = edges[e * 2] === v ? edges[e * 2 + 1] : edges[e * 2], nd = d + len[e];
                if (nd < dist[u]) { dist[u] = nd; from[u] = from[v]; push(nd, u); }
            }
        }
        return { dist, from };
    }

    // ── caching ───────────────────────────────────────────────────────────
    function hashArray(h, A, stride) {
        for (let i = 0; i < A.length; i += stride || 1) h = (Math.imul(h ^ Math.round(A[i] * 1e5), 16777619)) | 0;
        return h;
    }
    function cacheOf(pack) { return pack._drapeCache || (pack._drapeCache = new Map()); }

    // ── settling ──────────────────────────────────────────────────────────
    /**
     * Settles a laid piece's surface as cloth. ctx: { pack, built, piece,
     * spec, pos (Float32Array, the piece's vertices, changed in place),
     * frame (the build's shared frame), chains ({1..4: joint points of
     * each limb, this body}), quality ('save'|'preview') }. Returns
     * { ms, steps, pins, moved (mean, meters), cached } or null.
     */
    function drape(ctx) {
        const { pack, built, piece, spec, pos } = ctx;
        const frame = ctx.frame || {};
        const prof = piece.drapeProfile !== undefined ? piece.drapeProfile : profile(spec);
        if (!prof || !piece.index.length) return null;
        const t0 = now();
        const Q = QUALITY[ctx.quality === 'preview' ? 'preview' : 'save'];
        const n = piece.verts.length, F = piece.field;
        const body = bodyCollider(pack, built, frame);
        const garment = spec.cutKey ? spec.cutKey[0] : null;
        const layers = layerCollider(frame, garment);
        // The same piece on the same body over the same layers settles the same way: kept.
        let h = 0x811c9dc5;
        h = hashArray(h, pos, 1);
        h = hashArray(h, built.shaped, 3);
        const key = JSON.stringify(spec.cutKey || null) + '|' + (ctx.quality === 'preview' ? 'p' : 's') + '|' + (h >>> 0) + '|' + (layers ? layers.hash >>> 0 : 0) + '|' + n;
        const cache = cacheOf(pack);
        if (cache.has(key)) {
            const hit = cache.get(key);
            cache.delete(key); cache.set(key, hit);
            pos.set(hit.positions);
            if (ctx.base && hit.base) ctx.base.set(hit.base);
            const again = Object.assign({}, hit.stats, { cached: true, ms: now() - t0 });
            if (api.trace) api.trace.push(again);
            return again;
        }
        const topo = topology(piece), E = topo.edges, B = topo.bends, ne = E.length / 2, nb = B.length / 4;
        const X = Float64Array.from(pos);
        const scale = built.height / 1.7;

        // The direction along the body at each vertex: up the trunk (and a skirt), along a limb's bone.
        const axis = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) {
            const f = F[i];
            if (prof.role === 'skirt' || !f || f.fam === 0 || !ctx.chains || !ctx.chains[f.fam]) { axis[i * 3 + 1] = 1; continue; }
            const c = ctx.chains[f.fam], s = clamp(Math.floor(f.s), 0, c.length - 2), a = c[s], b = c[s + 1];
            const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz) || 1;
            axis[i * 3] = dx / l; axis[i * 3 + 1] = dy / l; axis[i * 3 + 2] = dz / l;
        }

        // ── holds ──
        // Border vertices: a neckline, a strapless top and a waistband are held (an edge with the cloth below
        // it); a gathered long cuff and a bodice's sewn waist seam too. Hems and open fronts hang free.
        const held = new Uint8Array(n);
        let meanEdge = 0;
        for (let e = 0; e < ne; e++) { const a = E[e * 2] * 3, b = E[e * 2 + 1] * 3; meanEdge += Math.hypot(X[a] - X[b], X[a + 1] - X[b + 1], X[a + 2] - X[b + 2]); }
        meanEdge /= Math.max(1, ne);
        const nb_ = piece.neighbors;
        let uTop = Infinity;
        if (prof.role === 'skirt') for (let i = 0; i < n; i++) uTop = Math.min(uTop, F[i].u);
        for (let i = 0; i < n; i++) {
            if (!piece.onBorder[i]) continue;
            const f = F[i], near = nb_[i].filter(j => !piece.onBorder[j]), J = near.length ? near : nb_[i];
            if (!J.length) continue;
            if (prof.role === 'skirt') { if (f.u < uTop + 0.035) held[i] = 1; continue; }
            if (f.fam === 0) {
                let my = 0;
                for (const j of J) my += X[j * 3 + 1];
                const dy = X[i * 3 + 1] - my / J.length;
                // (A top is held at its neckline round the neck and over the shoulders, not down a deep V or an open front.)
                if (dy > 0.25 * meanEdge && (prof.role === 'bottom' || f.s > 3.45)) held[i] = 1;
                else if (dy < -0.25 * meanEdge && prof.joined) held[i] = 1;
            } else if ((f.fam === 1 || f.fam === 2) && prof.cuff && f.s > 2.6) {
                let ms = 0;
                for (const j of J) ms += F[j].s;
                if (f.s > ms / J.length) held[i] = 1;
            }
        }
        // A skirt's waistband rows are held whole.
        if (prof.role === 'skirt') for (let i = 0; i < n; i++) if (F[i].u < uTop + 0.025) held[i] = 1;

        // ── contact ──
        const tmp = new Float64Array(8);
        const contact = (g, x, y, z, out) => {
            const v = nearestPoint(g, x, y, z);
            if (v < 0 || !closestOnFan(g, v, x, y, z, tmp)) return false;
            // Past the open edge of a garment under it (beyond its hem): not over it, except just past it, where
            // cloth over the edge bridges it (no dip back to the skin right over a waistband's edge).
            if (g.border && g.border[v] && !tmp[7] && tmp[6] > 0.05) return false;
            for (let k = 0; k < 8; k++) out[k] = tmp[k];
            out[8] = g.extra ? g.extra[v] * scale : 0;
            return true;
        };
        const gap = prof.gap * scale, layerGap = (0.0065 + prof.weight * 0.5) * scale;

        // Held edges are snug: on the skin (or the layer under them) by the cloth's own gap, never further in.
        const snug = new Float64Array(9);
        const heldIds = [];
        for (let i = 0; i < n; i++) if (held[i]) heldIds.push(i);
        if (prof.snug > 0) for (const i of heldIds) {
            const o = i * 3;
            if (!contact(body, X[o], X[o + 1], X[o + 2], snug)) continue;
            const d = (X[o] - snug[0]) * snug[3] + (X[o + 1] - snug[1]) * snug[4] + (X[o + 2] - snug[2]) * snug[5];
            const target = gap * 1.2;
            if (d > target && d < 0.06) { const k = (d - target) * (prof.snug ?? 0.85); X[o] -= snug[3] * k; X[o + 1] -= snug[4] * k; X[o + 2] -= snug[5] * k; }
            if (layers && contact(layers, X[o], X[o + 1], X[o + 2], snug)) {
                const dl = (X[o] - snug[0]) * snug[3] + (X[o + 1] - snug[1]) * snug[4] + (X[o + 2] - snug[2]) * snug[5];
                if (dl < layerGap + snug[8] && dl > -0.045) { const k = layerGap + snug[8] - dl; X[o] += snug[3] * k; X[o + 1] += snug[4] * k; X[o + 2] += snug[5] * k; }
            }
        }
        // The snugged edge's neighbors follow it part way (no step at the band).
        // (Spread over a few rows, fading: the band's shift never folds the cloth beside it over.)
        if (heldIds.length && prof.snug > 0) {
            let shift = new Float64Array(n * 3);
            for (const i of heldIds) for (let k = 0; k < 3; k++) shift[i * 3 + k] = X[i * 3 + k] - pos[i * 3 + k];
            // Even along the band itself (a collar or a waistband taken in evenly, never ruffled).
            for (let pass = 0; pass < 6; pass++) {
                const next = Float64Array.from(shift);
                for (const i of heldIds) {
                    let x = shift[i * 3], y = shift[i * 3 + 1], z = shift[i * 3 + 2], c = 1;
                    for (const q of nb_[i]) if (held[q]) { x += shift[q * 3]; y += shift[q * 3 + 1]; z += shift[q * 3 + 2]; c++; }
                    next[i * 3] = x / c; next[i * 3 + 1] = y / c; next[i * 3 + 2] = z / c;
                }
                shift = next;
            }
            for (const i of heldIds) {
                const o = i * 3;
                for (let k = 0; k < 3; k++) X[o + k] = pos[o + k] + shift[o + k];
                // (and still off the skin and the layer under it)
                for (const [g, want] of [[body, gap], [layers, layerGap]]) {
                    if (!g || !contact(g, X[o], X[o + 1], X[o + 2], snug)) continue;
                    const d = (X[o] - snug[0]) * snug[3] + (X[o + 1] - snug[1]) * snug[4] + (X[o + 2] - snug[2]) * snug[5], w = want + (g === layers ? snug[8] : 0);
                    if (d < w && d > -0.045) for (let k = 0; k < 3; k++) X[o + k] += snug[3 + k] * (w - d);
                }
            }
            for (let pass = 0; pass < 6; pass++) {
                const next = Float64Array.from(shift);
                for (let j = 0; j < n; j++) {
                    if (held[j] || !nb_[j].length) continue;
                    let x = 0, y = 0, z = 0;
                    for (const q of nb_[j]) { x += shift[q * 3]; y += shift[q * 3 + 1]; z += shift[q * 3 + 2]; }
                    const k = 0.8 / nb_[j].length;
                    next[j * 3] = x * k; next[j * 3 + 1] = y * k; next[j * 3 + 2] = z * k;
                }
                shift = next;
            }
            for (let j = 0; j < n; j++) if (!held[j]) for (let k = 0; k < 3; k++) X[j * 3 + k] += shift[j * 3 + k];
        }

        // ── seeds: a garment's own folds (the same on every body), so the cloth buckles in its own way ──
        const seed = prof.seed || 0, ph = seed * 2.39996;
        if (prof.role === 'skirt') {
            const hips = built.bones.find(b => b.name === 'Hips').head;
            const K = Math.round(6 + 6 * Math.min(1, prof.flare)), A = (0.003 + 0.008 * prof.flare) * scale;
            for (let i = 0; i < n; i++) {
                if (held[i]) continue;
                const f = F[i], a = f.spineAng, grow = smoothstep(0.08, 0.6, f.u);
                const d = A * grow * Math.cos(K * a + ph + 0.8 * Math.sin(2 * a + ph * 1.3) + 0.4 * Math.sin(3 * a - ph));
                const dx = X[i * 3] - hips[0], dz = X[i * 3 + 2] - hips[2], l = Math.hypot(dx, dz) || 1;
                X[i * 3] += dx / l * d; X[i * 3 + 2] += dz / l * d;
            }
        }
        const X0 = Float64Array.from(X);
        // A full skirt's petticoat: no closer to the hips' axis than this.
        // Any skirt hangs straight down from the widest thing above it (the seat, a belly): below that it may fold in
        // only so far, never into the hollow under the seat; a full skirt stands out on its petticoat. Measured round
        // the skirt's own middle at each height, as a plane each vertex stays outside of (it never crosses over).
        let support = null, supportR0 = null, supportDir = null, supportAt = null, supportRamp = 1;
        if (prof.role === 'skirt') {
            support = new Float64Array(n); supportR0 = new Float64Array(n); supportDir = new Float64Array(n * 2); supportAt = new Float64Array(n * 2);
            // (Round the hips: a coat's tails or a split skirt are no ring of their own.)
            const hips = built.bones.find(b => b.name === 'Hips').head;
            let uMax = uTop;
            for (let i = 0; i < n; i++) uMax = Math.max(uMax, F[i].u);
            const cx = [hips[0]], cz = [hips[2]], ringOf = () => 0;
            const BINS = 36;
            const ids = Array.from({ length: n }, (_, i) => i).filter(i => !held[i]).sort((a, b) => F[a].u - F[b].u || a - b);
            const env = new Float64Array(BINS), envU = new Float64Array(BINS).fill(NaN), peakU = new Float64Array(BINS);
            // Folds may reach in this far, but only gradually below the widest point above (cloth falls nearly straight
            // from a seat: no hollow under it).
            const fold = (0.02 + 0.06 * prof.flare) * scale, slope = prof.hangSlope ?? 0.3;
            const length = built.height * 0.45;
            for (const i of ids) {
                const k = ringOf(i), dx = X[i * 3] - cx[k], dz = X[i * 3 + 2] - cz[k], r = Math.hypot(dx, dz);
                if (r < 1e-6) continue;
                const b = ((Math.round((Math.atan2(dx, dz) / (Math.PI * 2) + 1) * BINS) % BINS) + BINS) % BINS;
                // Carried down from above (eased in a little as it falls), never less than this vertex's own laid reach.
                if (Number.isNaN(envU[b]) || r >= env[b]) { env[b] = r; peakU[b] = F[i].u; }
                envU[b] = F[i].u;
                const reach = Math.min(fold, slope * Math.max(0, F[i].u - peakU[b]) * length);
                // (Never pushed out past where it was laid: `fill` may let a hollow be filled part way.)
                support[i] = Math.min(r + (prof.fill ?? 0) * scale, Math.max(env[b] - reach, r * prof.support * smoothstep(uTop + 0.05, uTop + 0.35, F[i].u)));
                supportR0[i] = r;
                supportDir[i * 2] = dx / r; supportDir[i * 2 + 1] = dz / r; supportAt[i * 2] = cx[k]; supportAt[i * 2 + 1] = cz[k];
            }
        }
        // ── rest lengths: the shell's own, cut larger by the ease ──
        const noise = (a, b) => { let x = Math.imul(a * 73856093 ^ b * 19349663 ^ Math.round(seed * 1000), 0x9e3779b1); x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; return ((x >>> 0) / 4294967296) * 2 - 1; };
        const lenAt = new Float64Array(ne), len0 = new Float64Array(ne), len1 = new Float64Array(ne);
        for (let e = 0; e < ne; e++) {
            const a = E[e * 2], b = E[e * 2 + 1];
            lenAt[e] = Math.hypot(X[a * 3] - X[b * 3], X[a * 3 + 1] - X[b * 3 + 1], X[a * 3 + 2] - X[b * 3 + 2]);
        }
        const geo = geodesics(n, E, lenAt, held);
        const pinned = heldIds.length > 0;
        const easeOf = new Float64Array(n);
        for (let e = 0; e < ne; e++) {
            const a = E[e * 2], b = E[e * 2 + 1], L = lenAt[e] || 1e-9;
            const dx = (X[b * 3] - X[a * 3]) / L, dy = (X[b * 3 + 1] - X[a * 3 + 1]) / L, dz = (X[b * 3 + 2] - X[a * 3 + 2]) / L;
            let ax = axis[a * 3] + axis[b * 3], ay = axis[a * 3 + 1] + axis[b * 3 + 1], az = axis[a * 3 + 2] + axis[b * 3 + 2];
            const al = Math.hypot(ax, ay, az) || 1;
            const c = (dx * ax + dy * ay + dz * az) / al, c2 = c * c;
            // A held band fits: the ease grows in over the first few centimeters from it.
            const band = pinned ? smoothstep(0.012, 0.07, Math.min(geo.dist[a], geo.dist[b]) / scale) : 1;
            // (Under an outer garment it is pressed flat: no ease there.)
            const pressed = piece.under ? 1 - Math.max(piece.under[a], piece.under[b]) : 1;
            const ease = (prof.girth * (1 - c2) + prof.length * c2) * band * pressed;
            len0[e] = L;
            len1[e] = L * (1 + ease) * (1 + 0.008 * noise(a, b));
            easeOf[a] = Math.max(easeOf[a], ease); easeOf[b] = Math.max(easeOf[b], ease);
        }
        // Bending pairs: the corners facing an inner edge keep apart as the two faces would lying (partly) flat.
        const bend0 = new Float64Array(nb), bend1 = new Float64Array(nb);
        for (let q = 0; q < nb; q++) {
            const a = B[q * 4] * 3, b = B[q * 4 + 1] * 3, c = B[q * 4 + 2] * 3, d = B[q * 4 + 3] * 3;
            const ex = X[b] - X[a], ey = X[b + 1] - X[a + 1], ez = X[b + 2] - X[a + 2], el = Math.hypot(ex, ey, ez) || 1e-9;
            const ux = ex / el, uy = ey / el, uz = ez / el;
            const side = p => {
                const px = X[p] - X[a], py = X[p + 1] - X[a + 1], pz = X[p + 2] - X[a + 2], t = px * ux + py * uy + pz * uz;
                return [t, Math.hypot(px - ux * t, py - uy * t, pz - uz * t)];
            };
            const [tc, hc] = side(c), [td, hd] = side(d);
            const now_ = Math.hypot(X[c] - X[d], X[c + 1] - X[d + 1], X[c + 2] - X[d + 2]);
            const flat = Math.hypot(tc - td, hc + hd);
            bend0[q] = now_;
            const e2 = 1 + 0.5 * (easeOf[B[q * 4]] + easeOf[B[q * 4 + 1]]);
            bend1[q] = (now_ + (flat - now_) * prof.flat) * e2;
        }

        // Masses: each vertex a third of its faces' area (the same cloth falls the same at any resolution).
        const inv = new Float64Array(n), area = new Float64Array(n);
        const I = piece.index;
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
            const A = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 3;
            area[I[t]] += A; area[I[t + 1]] += A; area[I[t + 2]] += A;
        }
        let meanArea = 0;
        for (let i = 0; i < n; i++) meanArea += area[i];
        meanArea = meanArea / n || 1e-4;
        for (let i = 0; i < n; i++) inv[i] = held[i] ? 0 : meanArea / Math.max(area[i], meanArea * 0.05);
        // Structured shape kept (a padded shoulder), more near the holds.
        const hold = new Float64Array(n);
        // A skirt's yoke (over the hips and the seat, as far as it is fitted) keeps its laid shape: the cloth rig
        // moves it with the hips; the skirt falls free below it.
        if (prof.role === 'skirt') for (let i = 0; i < n; i++) if (!held[i]) hold[i] = Math.max(hold[i], 0.5 * (1 - smoothstep(uTop + 0.12, uTop + 0.3, F[i].u)));
        for (let i = 0; i < n; i++) if (!held[i]) hold[i] = Math.max(hold[i], prof.hold + (pinned ? 0.25 * (1 - smoothstep(0.004, 0.03, geo.dist[i] / scale)) : 0), piece.under ? 0.3 * piece.under[i] : 0);

        // Stiffness per step, the same cloth at any number of steps.
        const warmKey = JSON.stringify(spec.cutKey || null) + '|' + n, warmStore = pack._drapeWarm || (pack._drapeWarm = new Map());
        const warm = Q.warm && warmStore.get(warmKey);
        const S = warm ? Q.warm : Q.substeps, per = k => 1 - Math.pow(1 - clamp(k, 0, 0.999), REFERENCE_STEPS / S);
        const kCompress = per(prof.compress), kBend = per(prof.bend), dt = Q.dt;
        const holdK = Float64Array.from(hold, k => per(k));
        const damp = Math.pow(0.985, REFERENCE_STEPS / S);
        const gdt = GRAVITY * dt * dt;
        const mu = prof.friction;

        const P = Float64Array.from(X), V = new Float64Array(n * 3);
        // The laid surface's normals and each vertex's offset from its neighbors' middle (for the smoothness term).
        const N_ = piece.neighbors, n0 = new Float64Array(n * 3), L0 = new Float64Array(n * 3);
        const kLap = per(prof.smooth ?? 0);
        if (kLap) {
            for (let t = 0; t < I.length; t += 3) {
                const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
                const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
                const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                for (const q of [a, b, c]) { n0[q] += nx; n0[q + 1] += ny; n0[q + 2] += nz; }
            }
            for (let i = 0; i < n; i++) {
                const o = i * 3, l = Math.hypot(n0[o], n0[o + 1], n0[o + 2]) || 1;
                n0[o] /= l; n0[o + 1] /= l; n0[o + 2] /= l;
                const near = N_[i];
                if (!near.length) continue;
                for (const j of near) for (let k = 0; k < 3; k++) L0[o + k] += X[j * 3 + k] / near.length;
                for (let k = 0; k < 3; k++) L0[o + k] -= X[o + k];
            }
        }
        const iterations = prof.iterations || 2, ftl = !!prof.ftl, FTL = new Float64Array(n * 3);
        const order = Int32Array.from({ length: ne }, (_, e) => e);
        // From the top down.
        {
            const at = e => -Math.max(X[E[e * 2] * 3 + 1], X[E[e * 2 + 1] * 3 + 1]);
            order.sort((x, y) => (at(x) - at(y)) || (x - y));
        }
        // Contacts: the nearest body plane (and layer plane) per vertex, refreshed as the cloth moves.
        const cb = new Float64Array(n * 9), cl = new Float64Array(n * 9), hasB = new Uint8Array(n), hasL = new Uint8Array(n), lastQ = new Float64Array(n * 3).fill(1e9);
        const out = new Float64Array(9);
        const refresh = (i, force) => {
            const o = i * 3;
            if (!force && Math.abs(P[o] - lastQ[o]) + Math.abs(P[o + 1] - lastQ[o + 1]) + Math.abs(P[o + 2] - lastQ[o + 2]) < 0.004) return;
            lastQ[o] = P[o]; lastQ[o + 1] = P[o + 1]; lastQ[o + 2] = P[o + 2];
            hasB[i] = contact(body, P[o], P[o + 1], P[o + 2], out) && out[6] < 0.08 ? 1 : 0;
            if (hasB[i]) cb.set(out, i * 9);
            if (layers) { hasL[i] = contact(layers, P[o], P[o + 1], P[o + 2], out) && out[6] < 0.06 ? 1 : 0; if (hasL[i]) cl.set(out, i * 9); }
        };
        const floorY = body.floor + 0.002 * scale;
        const reachMax = (prof.reach || 0) * scale;
        const bearing = prof.role === 'skirt' && frame.tailorNeeded ? { hip: built.bones.find(b => b.name === 'Hips').head, neck: built.bones.find(b => b.name === 'Neck').head } : null;
        const lowest = new Float64Array(n);
        for (let i = 0; i < n; i++) lowest[i] = Math.max(floorY, X0[i * 3 + 1] - prof.drop * scale * (piece.under ? 1 - piece.under[i] : 1));
        const collideOne = (i, friction) => {
            const o = i * 3;
            // (Settled no lower than it may, and no further from where it was laid than its cloth may move:
            // first, so the skin and the layers have the last word.)
            if (P[o + 1] < lowest[i]) P[o + 1] = lowest[i];
            if (reachMax) {
                const dx = P[o] - X0[o], dy = P[o + 1] - X0[o + 1], dz = P[o + 2] - X0[o + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d > reachMax) { const k = reachMax / d; P[o] = X0[o] + dx * k; P[o + 1] = X0[o + 1] + dy * k; P[o + 2] = X0[o + 2] + dz * k; }
            }
            for (let pass = 0; pass < 2; pass++) {
                const has = pass === 0 ? hasB[i] : hasL[i];
                if (!has) continue;
                const C = pass === 0 ? cb : cl, c = i * 9, g = pass === 0 ? gap : layerGap + C[c + 8];
                const d = (P[o] - C[c]) * C[c + 3] + (P[o + 1] - C[c + 1]) * C[c + 4] + (P[o + 2] - C[c + 2]) * C[c + 5];
                if (d >= g || (pass === 1 && d < -0.045)) continue;
                const k = g - d;
                P[o] += C[c + 3] * k; P[o + 1] += C[c + 4] * k; P[o + 2] += C[c + 5] * k;
                if (friction) {
                    // Friction: the slide along the surface this step is held back.
                    const mx = P[o] - X[o], my = P[o + 1] - X[o + 1], mz = P[o + 2] - X[o + 2], mn = mx * C[c + 3] + my * C[c + 4] + mz * C[c + 5];
                    P[o] -= (mx - C[c + 3] * mn) * mu; P[o + 1] -= (my - C[c + 4] * mn) * mu; P[o + 2] -= (mz - C[c + 5] * mn) * mu;
                }
            }
            if (bearing) {
                // (On a tailored body a skirt keeps each vertex at its chart's bearing round the trunk: its folds move
                // in and out, never across, so its panels stay in order through the sewn waistband.)
                const t = clamp((P[o + 1] - bearing.hip[1]) / (bearing.neck[1] - bearing.hip[1]), 0, 1), cz = bearing.hip[2] * (1 - t) + bearing.neck[2] * t;
                const sa = Math.sin(F[i].spineAng), ca = Math.cos(F[i].spineAng), r = Math.max(0.01, P[o] * sa + (P[o + 2] - cz) * ca);
                P[o] = sa * r; P[o + 2] = cz + ca * r;
            }
            if (support && support[i] > 0) {
                const ux = supportDir[i * 2], uz = supportDir[i * 2 + 1], r = (P[o] - supportAt[i * 2]) * ux + (P[o + 2] - supportAt[i * 2 + 1]) * uz;
                // (Filled out gradually over the first steps where it lies out beyond the laid shell.)
                const want = support[i] > supportR0[i] ? supportR0[i] + (support[i] - supportR0[i]) * supportRamp : support[i];
                if (r < want) { P[o] += ux * (want - r); P[o + 2] += uz * (want - r); }
            }
        };
        if (warm) for (let i = 0; i < n; i++) if (inv[i]) for (let k = 0; k < 3; k++) { X[i * 3 + k] = X0[i * 3 + k] + warm[i * 3 + k]; P[i * 3 + k] = X[i * 3 + k]; }
        for (let i = 0; i < n; i++) refresh(i, true);

        const ramp = warm ? 1 : Math.max(1, Math.round(S * 0.3));
        for (let step = 0; step < S; step++) {
            const r = Math.min(1, (step + 1) / ramp);
            supportRamp = r;
            // Gravity eases off over the last steps: the folds it made stay, the stretch it put in the cloth comes back out.
            const gravity = GRAVITY * (1 - (1 - (prof.settle ?? 0.15)) * smoothstep(0.45, 0.9, step / S));
            // Predict: gravity on the free cloth, damped.
            for (let i = 0; i < n; i++) {
                const o = i * 3;
                if (!inv[i]) { P[o] = X[o]; P[o + 1] = X[o + 1]; P[o + 2] = X[o + 2]; continue; }
                V[o] *= damp; V[o + 1] = V[o + 1] * damp - gravity * dt; V[o + 2] *= damp;
                P[o] = X[o] + V[o] * dt; P[o + 1] = X[o + 1] + V[o + 1] * dt; P[o + 2] = X[o + 2] + V[o + 2] * dt;
            }
            // Stretch (stiff) and compression (softer: the cloth gives a little before it buckles), alternating sweep.
            // Swept out from the holds, so their support reaches the hem in one pass (the cloth never sags by stretching).
            for (let it = 0; it < iterations; it++) for (let q = 0; q < ne; q++) {
                const e = order[q], a = E[e * 2], b = E[e * 2 + 1], wa = inv[a], wb = inv[b], w = wa + wb;
                if (!w) continue;
                const A = a * 3, Bq = b * 3;
                const dx = P[Bq] - P[A], dy = P[Bq + 1] - P[A + 1], dz = P[Bq + 2] - P[A + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-12;
                const L = len0[e] + (len1[e] - len0[e]) * r, C = d - L;
                if (it && C <= 0) continue;
                const k = C > 0 ? 1 : kCompress;
                // Later passes follow the leader: the higher vertex holds, the lower one is pulled up to it (cloth hangs
                // from above), eased by the edge's slope so no line of the cloth leads one way and its neighbor the other.
                let fa = wa / w;
                if (it && ftl && wa && wb) fa = 0.5 + 0.5 * clamp((P[Bq + 1] - P[A + 1]) / d * 2, -1, 1);
                const fb = 1 - fa;
                const s = k * C / d;
                P[A] += dx * s * fa; P[A + 1] += dy * s * fa; P[A + 2] += dz * s * fa;
                P[Bq] -= dx * s * fb; P[Bq + 1] -= dy * s * fb; P[Bq + 2] -= dz * s * fb;
                // (Its pull is position only: kept out of the cloth's speed, or the hem would be flung.)
                if (it) { FTL[A] += dx * s * fa; FTL[A + 1] += dy * s * fa; FTL[A + 2] += dz * s * fa; FTL[Bq] -= dx * s * fb; FTL[Bq + 1] -= dy * s * fb; FTL[Bq + 2] -= dz * s * fb; }
            }
            // Bending.
            for (let q = 0; q < nb; q++) {
                const c = B[q * 4 + 2], dd = B[q * 4 + 3], wa = inv[c], wb = inv[dd], w = wa + wb;
                if (!w) continue;
                const A = c * 3, Bq = dd * 3;
                const dx = P[Bq] - P[A], dy = P[Bq + 1] - P[A + 1], dz = P[Bq + 2] - P[A + 2], d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-12;
                const L = bend0[q] + (bend1[q] - bend0[q]) * r, s = kBend * (d - L) / (d * w);
                P[A] += dx * s * wa; P[A + 1] += dy * s * wa; P[A + 2] += dz * s * wa;
                P[Bq] -= dx * s * wb; P[Bq + 1] -= dy * s * wb; P[Bq + 2] -= dz * s * wb;
            }
            // Smoothness: no new bump narrower than a few faces (a fold's width grows with the cloth's weight). Each
            // vertex's offset from its neighbors' middle, across the cloth, is drawn back toward what it was laid with.
            if (kLap) for (let i = 0; i < n; i++) {
                if (!inv[i]) continue;
                const near = N_[i], o = i * 3;
                if (near.length < 3) continue;
                let x = 0, y = 0, z = 0;
                for (const j of near) { x += P[j * 3]; y += P[j * 3 + 1]; z += P[j * 3 + 2]; }
                const k = 1 / near.length;
                const d = (x * k - P[o] - L0[o]) * n0[o] + (y * k - P[o + 1] - L0[o + 1]) * n0[o + 1] + (z * k - P[o + 2] - L0[o + 2]) * n0[o + 2];
                P[o] += n0[o] * d * kLap; P[o + 1] += n0[o + 1] * d * kLap; P[o + 2] += n0[o + 2] * d * kLap;
            }
            // Kept shape.
            for (let i = 0; i < n; i++) {
                if (!inv[i]) continue;
                const o = i * 3;
                const k = holdK[i];
                if (k) { P[o] += (X0[o] - P[o]) * k; P[o + 1] += (X0[o + 1] - P[o + 1]) * k; P[o + 2] += (X0[o + 2] - P[o + 2]) * k; }
            }
            // Contact.
            const fresh = step > 0 && step % (Q.refresh * 4) === 0;
            for (let i = 0; i < n; i++) {
                if (!inv[i]) continue;
                refresh(i, fresh);
                collideOne(i, true);
            }
            for (let i = 0; i < n * 3; i++) { V[i] = (P[i] - X[i] - FTL[i]) / dt; X[i] = P[i]; FTL[i] = 0; }
        }

        // Settled: eased of single-face ripples (Taubin: no shrinking), then out of the body and the layers once more.
        const N = piece.neighbors;
        const tmpP = new Float64Array(n * 3);
        for (let pass = 0; pass < Q.smooth * 2; pass++) {
            const lam = pass % 2 === 0 ? 0.5 : -0.53;
            for (let i = 0; i < n; i++) {
                const o = i * 3, near = N[i];
                if (!inv[i] || !near.length || piece.onBorder[i]) { tmpP[o] = X[o]; tmpP[o + 1] = X[o + 1]; tmpP[o + 2] = X[o + 2]; continue; }
                let x = 0, y = 0, z = 0;
                for (const j of near) { x += X[j * 3]; y += X[j * 3 + 1]; z += X[j * 3 + 2]; }
                const k = 1 / near.length;
                tmpP[o] = X[o] + (x * k - X[o]) * lam; tmpP[o + 1] = X[o + 1] + (y * k - X[o + 1]) * lam; tmpP[o + 2] = X[o + 2] + (z * k - X[o + 2]) * lam;
            }
            X.set(tmpP);
        }
        P.set(X);
        for (let i = 0; i < n; i++) { if (!inv[i]) continue; refresh(i, true); collideOne(i, false); }

        // How far the settled cloth is from its cut lengths (mean and worst stretch, as fractions).
        let strain = 0, squeeze = 0, worst = 0, worstAt = -1;
        for (let e = 0; e < ne; e++) {
            const a = E[e * 2] * 3, b = E[e * 2 + 1] * 3, d = Math.hypot(P[a] - P[b], P[a + 1] - P[b + 1], P[a + 2] - P[b + 2]), x = d / (len1[e] || 1e-9) - 1;
            if (x > 0) strain += x; else squeeze -= x;
            if (x > worst) { worst = x; worstAt = E[e * 2]; }
        }
        // Left under a layer it should lie over, or in the body (counted, for the harness and the tests).
        let inLayer = 0, inBody = 0;
        for (let i = 0; i < n; i++) {
            const o = i * 3;
            if (contact(body, P[o], P[o + 1], P[o + 2], out) && (P[o] - out[0]) * out[3] + (P[o + 1] - out[1]) * out[4] + (P[o + 2] - out[2]) * out[5] < 0) inBody++;
            if (layers && contact(layers, P[o], P[o + 1], P[o + 2], out)) { const d = (P[o] - out[0]) * out[3] + (P[o + 1] - out[1]) * out[4] + (P[o + 2] - out[2]) * out[5]; if (d < 0 && d > -0.045) inLayer++; }
        }
        // The body point under each vertex is where it now lies over (the laid piece's `base`: what is laid
        // over it later, and its own turned hem, read "outward" from it).
        // A drape that went wrong (the cloth torn across a deep body fold on an extreme body, or caught inside it)
        // is not used: the piece keeps the shell it was laid as.
        const rejected = strain / Math.max(1, ne) > 0.03 || squeeze / Math.max(1, ne) > 0.06 || inBody > Math.max(4, n * 0.02);
        if (rejected) {
            // (Still kept out of the skin: a refined shell's new points can lie on chords through a deep curve.)
            P.set(pos);
            for (let pass = 0; pass < 3; pass++) for (let i = 0; i < n; i++) {
                const o = i * 3;
                if (!contact(body, P[o], P[o + 1], P[o + 2], out)) continue;
                const d = (P[o] - out[0]) * out[3] + (P[o + 1] - out[1]) * out[4] + (P[o + 2] - out[2]) * out[5];
                if (d < gap && d > -0.08) for (let k = 0; k < 3; k++) P[o + k] += out[3 + k] * (gap - d);
            }
        }
        if (ctx.base && !rejected) for (let i = 0; i < n; i++) {
            const o = i * 3;
            if (contact(body, P[o], P[o + 1], P[o + 2], out) && out[6] < 0.12 && (P[o] - out[0]) * out[3] + (P[o + 1] - out[1]) * out[4] + (P[o + 2] - out[2]) * out[5] > 0) {
                ctx.base[o] = out[0]; ctx.base[o + 1] = out[1]; ctx.base[o + 2] = out[2];
            }
        }
        let moved = 0, drop = 0;
        for (let i = 0; i < n; i++) {
            const o = i * 3;
            moved += Math.hypot(P[o] - pos[o], P[o + 1] - pos[o + 1], P[o + 2] - pos[o + 2]);
            drop += pos[o + 1] - P[o + 1];
            pos[o] = P[o]; pos[o + 1] = P[o + 1]; pos[o + 2] = P[o + 2];
        }
        const stats = { rejected, inLayer, inBody, layered: !!layers, warm: !!warm, ms: now() - t0, steps: S, verts: n, pins: heldIds.length, moved: moved / n, strain: strain / Math.max(1, ne), squeeze: squeeze / Math.max(1, ne), stretch: worst, drop: drop / n, worstAt: worstAt >= 0 ? { fam: F[worstAt].fam, u: F[worstAt].u, p: [P[worstAt * 3], P[worstAt * 3 + 1], P[worstAt * 3 + 2]].map(v => +v.toFixed(3)), p0: [X0[worstAt * 3], X0[worstAt * 3 + 1], X0[worstAt * 3 + 2]].map(v => +v.toFixed(3)), sup: support ? support[worstAt] : null, held: held[worstAt], border: piece.onBorder[worstAt] } : null, role: prof.role, garment, quality: ctx.quality === 'preview' ? 'preview' : 'save' };
        if (api.trace) api.trace.push(stats);
        cache.set(key, { positions: Float32Array.from(pos), base: ctx.base ? Float32Array.from(ctx.base) : null, stats });
        // Where this piece settled relative to its laid shell: the next preview of it starts there.
        const shift = new Float32Array(n * 3);
        for (let i = 0; i < n * 3; i++) shift[i] = pos[i] - X0[i];
        warmStore.set(warmKey, shift);
        while (warmStore.size > CACHE_SIZE) warmStore.delete(warmStore.keys().next().value);
        while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
        return stats;
    }

    /** `trace`: set to an array to collect each drape's stats (the harness and the tests read it). */
    const api = { profile, zone, edgeLimit, drape, remember, bodyCollider, layerCollider, distance, QUALITY, trace: null, tune: null };
    root.RRCharacterDrape = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
