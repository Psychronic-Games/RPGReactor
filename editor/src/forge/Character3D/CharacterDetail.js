/**
 * RRCharacterDetail - the small things the body's own picture is too coarse
 * for: the areolas and nipples, and body hair.
 *
 * The skin picture spreads a whole body over 1024 texels, so a 4 cm areola
 * gets about twenty and blurs. Here each areola is a patch of the body's own
 * triangles, lifted a hair off the skin, with a picture of its own laid flat
 * on it: 256 texels for a few centimeters, sharp at any distance. It shares
 * the body's vertices and skin weights, so it moves and bends with it.
 *
 * Body hair is real hair: strands grown out of the skin, each a narrow card
 * carrying a strand picture, leaning the way hair grows at its root (down
 * the limbs, down and in on the chest, out over the face), longer and curlier
 * where it grows so (the armpits, the groin), dense as the region's setting.
 * Each strand rides on one body triangle by barycentric weights, so the same
 * hair is laid on any body the sliders make, and on the fast drag path it
 * moves with its triangle's first corner.
 */
(function(root) {
    'use strict';

    const Outfit = root.RRCharacterOutfit || (typeof require === 'function' ? require('./CharacterOutfit.js') : null);
    const fract = x => x - Math.floor(x);
    const hash = (x, y, z) => fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
    const toByte = c => Math.max(0, Math.min(255, Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)));
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
    function noise2(x, y) {
        const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        const a = hash(ix, iy, 0), b = hash(ix + 1, iy, 0), c = hash(ix, iy + 1, 0), d = hash(ix + 1, iy + 1, 0);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }

    /** Smooth 3D value noise, 0..1, for patterns over the body that drift rather than jump. */
    function noise3(x, y, z) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
        let out = 0;
        for (let k = 0; k < 8; k++) {
            const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
            const h = Math.sin((ix + dx) * 127.1 + (iy + dy) * 311.7 + (iz + dz) * 74.7) * 43758.5453;
            out += (h - Math.floor(h)) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        }
        return out;
    }

    /**
     * Which way body hair grows at a place on the average body, as it does on
     * people: on the upper chest out from the breastbone and up toward the
     * shoulders, lower down in toward the middle and down it in a trail to
     * the groin; on the back down and out over the shoulders; down the limbs
     * toward the hands and feet.
     */
    function flowOf(fam, sv, p, front) {
        const sx = Math.sign(p[0]) || 1, mid = Math.min(1, Math.abs(p[0]) / 0.04);
        if (fam === 0) {
            if (sv > 4.35) return [sx * 0.15, -1, 0.15];
            if (front) {
                if (sv > 2.6) return [sx * 0.75 * mid, -0.25 + 0.6 * mid, 0];
                if (sv > 0.4) return [-sx * 0.45 * mid, -0.95, 0];
                return [-sx * 0.3 * mid, -0.95, 0];
            }
            if (sv > 3.4) return [sx * 0.8, -0.35, 0];
            return [sx * 0.25, -0.95, 0];
        }
        if (fam === 1 || fam === 2) return [sx * 0.55, -0.83, 0];
        return [sx * 0.15, -1, 0];
    }

    // ── areolas ───────────────────────────────────────────────────────────
    /**
     * Each areola's patch, worked out once on the average body: the body
     * triangles round the nipple (pack vertex ids) and each vertex's place on
     * the patch's own picture, flat on the plane the skin has there.
     */
    function areolaPatches(pack, reach) {
        pack._areolaPatches = pack._areolaPatches || new Map();
        const key = reach.toFixed(4);
        if (pack._areolaPatches.has(key)) return pack._areolaPatches.get(key);
        const Body = root.RRHumanBody || require('./HumanBody.js');
        const F = Body.anatomyFields(pack), B = pack.positions;
        const N = Body.vertexNormals(pack, B);
        const src = pack.body.source, I = pack.body.index;
        const patches = F.nipples.map(nip => {
            const c = [B[nip.v * 3], B[nip.v * 3 + 1], B[nip.v * 3 + 2]], n = [N[nip.v * 3], N[nip.v * 3 + 1], N[nip.v * 3 + 2]];
            // The patch's own axes: across the chest and up it, on the skin's plane.
            let t1 = [n[2], 0, -n[0]];
            const l1 = Math.hypot(...t1) || 1; t1 = t1.map(x => x / l1);
            const t2 = [n[1] * t1[2] - n[2] * t1[1], n[2] * t1[0] - n[0] * t1[2], n[0] * t1[1] - n[1] * t1[0]];
            const tris = [], dot3 = (a, b) => a.reduce((s, x, k) => s + x * b[k], 0);
            for (let t = 0; t < I.length; t += 3) {
                const v = [src[I[t]], src[I[t + 1]], src[I[t + 2]]];
                if (v.some(q => {
                    const o = [B[q * 3] - c[0], B[q * 3 + 1] - c[1], B[q * 3 + 2] - c[2]];
                    return Math.hypot(dot3(o, t1), dot3(o, t2)) < reach * 1.8 && Math.abs(dot3(o, n)) < Math.max(0.045, reach * 2.5);
                })) tris.push(...v);
            }
            const ids = [...new Set(tris)];
            const at = new Map(ids.map((v, i) => [v, i]));
            const uvs = new Float32Array(ids.length * 2);
            ids.forEach((v, i) => {
                const o = [B[v * 3] - c[0], B[v * 3 + 1] - c[1], B[v * 3 + 2] - c[2]];
                uvs[i * 2] = 0.5 + (o[0] * t1[0] + o[1] * t1[1] + o[2] * t1[2]) / (2 * reach);
                uvs[i * 2 + 1] = 0.5 - (o[0] * t2[0] + o[1] * t2[1] + o[2] * t2[2]) / (2 * reach);
            });
            return { ids, index: tris.map(v => at.get(v)), uvs };
        });
        pack._areolaPatches.set(key, patches);
        while (pack._areolaPatches.size > 4) pack._areolaPatches.delete(pack._areolaPatches.keys().next().value);
        return patches;
    }

    /**
     * The areola picture: a rim of slightly darker, rosier skin fading into the
     * body's, the areola's own grain (Montgomery bumps round its edge, fine
     * folds toward the middle), and the nipple at the center. The actual mesh
     * supplies its lighting; alpha fades the rim so the patch melts into the skin.
     */
    function areolaTexture(skinHex, options) {
        const o = options || {}, size = o.size || 256;
        const skin = Outfit.linear(skinHex || '#c69c7f');
        // A natural areola: the skin's own color, deeper and rosier, more so on fair skin.
        const lum = skin[0] * 0.3 + skin[1] * 0.59 + skin[2] * 0.11;
        // Close to the skin's own tone: a little deeper, a little rosier, never orange.
        let base = o.color ? Outfit.linear(o.color) : skin.map((c, i) => c * [0.8, 0.66, 0.66][i] * (0.92 + 0.08 * (1 - lum)));
        // Under body hair or fur the skin round the areola takes the hair's color as the skin painter lays it,
        // and the areola mostly gives way to it, so no bare disc shows through the coat.
        if (o.under && o.cover > 0) {
            const u = Outfit.linear(o.under);
            for (let k = 0; k < 3; k++) { skin[k] += (u[k] - skin[k]) * o.cover; base[k] += (u[k] - base[k]) * o.cover * 0.8; }
        }
        const nipple = base.map((c, i) => c * [0.88, 0.78, 0.78][i]);
        const R = o.areolaFrac || 0.36, tipR = (o.male ? 0.003 : 0.0045) / (o.male ? 0.028 : 0.052) * (o.nippleScale ?? 1) / (o.areolaScale ?? 1);
        const data = new Uint8Array(size * size * 4);
        const relief = o.relief ? new Float32Array(size * size) : null;
        const bumps = [];
        const rand = rng(91);
        for (let k = 0; k < 14; k++) { const a = rand() * Math.PI * 2, r = R * (0.62 + rand() * 0.3); bumps.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r, 0.0035 + rand() * 0.0045]); }
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const u = (x + 0.5) / size, v = (y + 0.5) / size, du = u - 0.5, dv = v - 0.5;
            // A slightly uneven edge, as real areolas have.
            const ang = Math.atan2(dv, du), wob = 1 + 0.008 * Math.sin(ang * 3 + 0.7) + 0.004 * Math.sin(ang * 7 + 2.1);
            const radius = Math.hypot(du, dv), r = radius / wob;
            const edge = 1 - smooth(R * 0.94, R * 1.035, r);
            let rgb = mix(skin, base, Math.pow(edge, 0.8));
            // Fine radial folds and grain inside the areola.
            const folds = noise2(u * 110, v * 110) * 0.65 + noise2(u * 180, v * 180) * 0.35;
            rgb = rgb.map(c => c * (0.97 + 0.06 * (folds - 0.5) * edge));
            let height = (folds - 0.5) * 0.000012 * edge;
            const ring = Math.exp(-(((radius - tipR * 1.04) / Math.max(0.004, tipR * 0.12)) ** 2));
            height += edge * (0.000009 * Math.sin(ang * 29 + radius * 100) * ring - 0.000018 * ring);
            // Montgomery glands: small raised dots near the edge, a touch lighter with a darker ring.
            for (const [bx, by, br] of bumps) {
                const d = Math.hypot(u - bx, v - by);
                if (d < br * 2.5) {
                    height += 0.000045 * Math.exp(-((d / br) ** 2) * 2) * edge;
                    rgb = rgb.map(c => c * (1 + 0.025 * (1 - smooth(0, br, d))));
                }
            }
            // Pigment follows the same centered circle as the geometry. An offset painted highlight
            // used to read as a second tip, particularly when the studio light came from the other side.
            if (tipR > 0 && radius < tipR * 1.4) {
                const t = 1 - smooth(tipR * 0.88, tipR * 1.12, radius);
                const grain = noise2(u * 260, v * 260);
                height += t * ((grain - 0.5) * 0.000018 + Math.sin(ang * 37 + radius * 140) * smooth(0, tipR * 0.6, radius) * 0.000005);
                rgb = mix(rgb, nipple.map(c => c * (0.98 + 0.04 * (grain - 0.5))), t);
            }
            const o4 = (y * size + x) * 4;
            data[o4] = toByte(rgb[0]); data[o4 + 1] = toByte(rgb[1]); data[o4 + 2] = toByte(rgb[2]);
            // The patch itself fades out past the areola, so its square never shows.
            data[o4 + 3] = Math.round(255 * (1 - smooth(R * 0.95, R * 1.35, r)));
            if (relief) relief[y * size + x] = height;
        }
        const picture = { width: size, height: size, data, name: 'areola.png' };
        if (relief) {
            const pixels = new Uint8Array(data.length), span = (o.male ? 0.028 : 0.052) * (o.areolaScale || 1), texel = span / size;
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const dx = (relief[y * size + Math.min(size - 1, x + 1)] - relief[y * size + Math.max(0, x - 1)]) / (2 * texel);
                const dy = (relief[Math.min(size - 1, y + 1) * size + x] - relief[Math.max(0, y - 1) * size + x]) / (2 * texel);
                const length = Math.hypot(dx, dy, 1), at = (y * size + x) * 4;
                pixels[at] = Math.round((0.5 - dx / length * 0.5) * 255);
                pixels[at + 1] = Math.round((0.5 + dy / length * 0.5) * 255);
                pixels[at + 2] = Math.round((0.5 + 0.5 / length) * 255); pixels[at + 3] = 255;
            }
            picture.normal = { width: size, height: size, data: pixels, name: 'areola_n.png' };
        }
        return picture;
    }

    /** The areola patches as one part over the shaped body (`P`, every pack vertex, floor at 0). */
    function areolaPart(pack, P, normals, reach, skinPart) {
        const patches = areolaPatches(pack, reach);
        const ids = [], index = [], uvs = [];
        for (const p of patches) {
            const base = ids.length;
            ids.push(...p.ids);
            for (const i of p.index) index.push(base + i);
            uvs.push(...p.uvs);
        }
        const n = ids.length, positions = new Float32Array(n * 3), nrm = new Float32Array(n * 3), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
        ids.forEach((v, i) => {
            // A hair off the skin, so it draws over it without fighting.
            for (let k = 0; k < 3; k++) { nrm[i * 3 + k] = normals[v * 3 + k]; positions[i * 3 + k] = P[v * 3 + k] + normals[v * 3 + k] * 0.0004; }
            joints.set(pack.skinJoints.subarray(v * 4, v * 4 + 4), i * 4);
            weights.set(pack.skinWeights.subarray(v * 4, v * 4 + 4), i * 4);
        });
        return { name: 'Areolas', positions, normals: nrm, uvs: Float32Array.from(uvs), index: Uint32Array.from(index), joints, weights,
            texture: 'areola.png', opacity: 0.999, roughness: skinPart?.roughness ?? 0.62, kind: 'skin', source: Int32Array.from(ids), decal: true, noShade: true };
    }

    /** Locally tessellated chest skin and its pigment, sharing exactly the same smooth surface. */
    function chestParts(pack, built, recipe, body, reach, retained) {
        const Body = root.RRHumanBody || require('./HumanBody.js'), P = built.shaped;
        const patches = areolaPatches(pack, reach), fields = Body.anatomyFields(pack);
        const sourceUv = new Map();
        for (let i = 0; i < pack.body.source.length; i++) sourceUv.set(pack.body.source[i], [pack.body.uv[i * 2], pack.body.uv[i * 2 + 1]]);
        const positions = [], bodyUvs = [], pigmentUvs = [], stencils = [], index = [], keys = [], blends = [];
        const coarseFaces = new Set(), keyOf = ids => ids.slice().sort((a, b) => a - b).join(',');
        for (let side = 0; side < patches.length; side++) {
            const patch = patches[side], fit = Body.nippleSurface(pack, fields.nipples[side], P);
            const rows = new Map(fit?.points.map(p => [p.v, p.row]));
            const ring = fit?.points.filter(p => p.distance >= 0.008 && p.distance <= 0.016) || [];
            const stretch = ring.length ? Math.max(0.75, Math.min(1.35, Math.sqrt(ring.reduce((s, p) => s + (p.row[1] ** 2 + p.row[2] ** 2) * 0.0004, 0) / ring.reduce((s, p) => s + p.distance ** 2, 0)))) : 1;
            const edges = new Map(), neighbors = patch.ids.map(() => new Set());
            const edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
            for (let t = 0; t < patch.index.length; t += 3) for (let k = 0; k < 3; k++) {
                const a = patch.index[t + k], b = patch.index[t + (k + 1) % 3], key = edgeKey(a, b);
                if (!edges.has(key)) edges.set(key, { a, b, count: 0 });
                edges.get(key).count++; neighbors[a].add(b); neighbors[b].add(a);
            }
            const distance = new Float32Array(patch.ids.length).fill(Infinity), queue = [];
            for (const edge of edges.values()) if (edge.count === 1) for (const v of [edge.a, edge.b]) if (distance[v] !== 0) { distance[v] = 0; queue.push(v); }
            for (let i = 0; i < queue.length; i++) for (const v of neighbors[queue[i]]) if (distance[v] > distance[queue[i]] + 1) { distance[v] = distance[queue[i]] + 1; queue.push(v); }
            const vertices = new Map(), N = patch.index.length / 3 > 650 ? 2 : 4;
            const vertex = (ids, weights) => {
                const stencil = ids.map((v, k) => [v, weights[k]]).filter(([, w]) => w > 0).sort((a, b) => a[0] - b[0]);
                const key = stencil.map(([v, w]) => v + ':' + w).join(',');
                if (vertices.has(key)) return vertices.get(key);
                const at = positions.length / 3, pos = [0, 0, 0], uv = [0, 0], buv = [0, 0], row = [0, 0, 0, 0, 0, 0];
                let fitted = !!fit;
                for (let k = 0; k < 3; k++) {
                    const v = patch.ids[ids[k]], w = weights[k], r = rows.get(v) || fit?.project(Array.from(P.subarray(v * 3, v * 3 + 3))), b = sourceUv.get(v);
                    for (let a = 0; a < 3; a++) pos[a] += P[v * 3 + a] * w;
                    for (let a = 0; a < 2; a++) { uv[a] += patch.uvs[ids[k] * 2 + a] * w; buv[a] += b[a] * w; }
                    if (w && !r) fitted = false;
                    if (r) for (let a = 0; a < 6; a++) row[a] += r[a] * w;
                }
                const d = Math.hypot(uv[0] - 0.5, uv[1] - 0.5) * 2 * reach;
                // The outer edge stays exactly on the original body's triangles, even at minimum size.
                const edgeFade = Math.min(1, ids.reduce((s, v, k) => s + Math.min(2, distance[v]) * weights[k], 0) / 1.5);
                const blend = fitted ? (1 - smooth(0.014, 0.03, d)) * edgeFade : 0;
                if (blend > 0) {
                    const female = Body.sexOf(recipe) === 'female', a = recipe.anatomy;
                    const tipR = (female ? 0.0045 : 0.003) * Math.max(0.6, Math.sqrt(a.nipple));
                    const height = (female ? 0.0019 : 0.0009) * (a.nipple > 0 ? a.nippleProjection : 0);
                    const lift = (female ? 0.00025 : 0.0001) * (1 - smooth(0, 0.018, d)) + height * (1 - smooth(tipR * 0.4, tipR * 1.3, d));
                    row[3] = row[1] * row[1]; row[4] = row[1] * row[2]; row[5] = row[2] * row[2];
                    const base = fit.evaluate(row);
                    const correction = base.map((q, k) => q + fit.normal[k] * lift - pos[k]);
                    // A local quadratic is an approximation on extreme busts. Keep it near the existing
                    // skin instead of extrapolating a deep hollow or broad shelf between sparse samples.
                    const amount = Math.min(1, Math.max(0.003, height * 0.6) / (Math.hypot(...correction) || 1));
                    for (let k = 0; k < 3; k++) pos[k] += correction[k] * blend * amount;
                }
                positions.push(...pos); bodyUvs.push(...buv);
                // Project pigment on the finished skin plane: interpolating the old coarse UVs
                // preserved their polygonal contour even after the geometry was tessellated.
                const projected = fit?.project(pos);
                pigmentUvs.push(...(projected ? [0.5 + projected[1] * 0.02 / (2 * reach * stretch), 0.5 - projected[2] * 0.02 / (2 * reach * stretch)] : uv));
                blends.push(blend);
                stencils.push(stencil.map(([v, w]) => [patch.ids[v], w])); keys.push(side + '/' + key);
                vertices.set(key, at); return at;
            };
            for (let t = 0; t < patch.index.length; t += 3) {
                const ids = Array.from(patch.index.slice(t, t + 3));
                coarseFaces.add(keyOf(ids.map(i => patch.ids[i])));
                const grid = new Map();
                for (let i = 0; i <= N; i++) for (let j = 0; j <= N - i; j++) grid.set(i + ',' + j, vertex(ids, [1 - (i + j) / N, i / N, j / N]));
                const v = (i, j) => grid.get(i + ',' + j);
                for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) {
                    index.push(v(i, j), v(i + 1, j), v(i, j + 1));
                    if (i + j < N - 1) index.push(v(i + 1, j), v(i + 1, j + 1), v(i, j + 1));
                }
            }
        }
        if (!retained) {
            const keep = [];
            for (let t = 0; t < body.index.length; t += 3) if (!coarseFaces.has(keyOf([0, 1, 2].map(k => pack.body.source[body.index[t + k]])))) keep.push(body.index[t], body.index[t + 1], body.index[t + 2]);
            body.index = Uint32Array.from(keep);
        }
        const normal = meshNormals({ keys, index }, positions), sourceNormals = Body.vertexNormals(pack, P);
        const joints = new Uint8Array(stencils.length * 4), weights = new Float32Array(stencils.length * 4);
        const offsets = [0], vertices = [], factors = [];
        for (let i = 0; i < stencils.length; i++) {
            const bones = new Map(), edge = [0, 0, 0];
            for (const [v, w] of stencils[i]) {
                vertices.push(v); factors.push(w);
                for (let k = 0; k < 3; k++) edge[k] += sourceNormals[v * 3 + k] * w;
                for (let k = 0; k < 4; k++) { const bone = pack.skinJoints[v * 4 + k]; bones.set(bone, (bones.get(bone) || 0) + pack.skinWeights[v * 4 + k] * w); }
            }
            offsets.push(vertices.length);
            const top = [...bones].sort((a, b) => b[1] - a[1]).slice(0, 4), total = top.reduce((s, q) => s + q[1], 0);
            top.forEach(([bone, w], k) => { joints[i * 4 + k] = bone; weights[i * 4 + k] = w / total; });
            const n = edge.map((q, k) => q * (1 - blends[i]) + normal[i * 3 + k] * blends[i]), length = Math.hypot(...n) || 1;
            normal.set(n.map(q => q / length), i * 3);
        }
        const shared = { positions: Float32Array.from(positions), normals: normal, index: Uint32Array.from(index), joints, weights,
            interpolation: { offsets: Uint32Array.from(offsets), vertices: Int32Array.from(vertices), weights: Float32Array.from(factors) },
            roughness: body.roughness, kind: 'skin', chestDetail: true, chestReach: reach, noShade: true };
        const overlayPositions = Float32Array.from(positions, (x, i) => x + normal[i] * 0.00012);
        return { base: { ...shared, name: 'Chest detail', uvs: Float32Array.from(bodyUvs), texture: body.texture, noShade: false },
            overlay: { ...shared, name: 'Areolas', positions: overlayPositions, uvs: Float32Array.from(pigmentUvs), texture: 'areola.png', opacity: 0.999, decal: true,
                onSkin: true, shadeFrom: 'Chest detail' } };
    }

    // ── body hair ─────────────────────────────────────────────────────────
    /**
     * The strands, worked out once per body hair setting on the average body:
     * each strand's triangle (pack vertex ids), its place in it, its lean,
     * length, curl and lane on the strand picture.
     */
    function hairStrands(pack, bodyHair, hidden, mode = 'tuft') {
        const Skin = root.RRCharacterSkin || require('./CharacterSkin.js');
        const key = mode + JSON.stringify([bodyHair.regions, bodyHair.amount, bodyHair.fur, bodyHair.length, bodyHair.budget]) + '|' + (hidden ? hidden.size : 0);
        pack._strandCache = pack._strandCache || new Map();
        if (pack._strandCache.has(key)) return pack._strandCache.get(key);
        const an = Outfit.anatomy(pack), R = an.rest;
        const src = pack.body.source, I = pack.body.index;
        const famOf = v => { let best = 0; for (let fi = 1; fi < 5; fi++) if (an.member[v * 5 + fi] > an.member[v * 5 + best]) best = fi; return best; };
        // Density at each vertex, from the regions; strands per square meter at full density.
        const field = Skin.hairField(pack, bodyHair.regions), dens = field.map(d => d * bodyHair.amount);
        const fur = bodyHair.fur || 0;
        // Tufts per square meter at full density: each carries several strands (fur's, more and finer).
        // Single strands for body hair (about four a square centimeter at full), tufts for fur.
        const perM2 = (bodyHair.budget || 1) * (mode === 'strand' ? 40000 : mode === 'clump' ? 16000 : 10000 + 16000 * fur);
        const rand = rng(1234);
        const strands = [];
        for (let t = 0; t < I.length; t += 3) {
            const a = src[I[t]], b = src[I[t + 1]], c = src[I[t + 2]];
            if (hidden && hidden.has(a) && hidden.has(b) && hidden.has(c)) continue;
            const d = (dens[a] + dens[b] + dens[c]) / 3;
            if (d < 0.02) continue;
            // Where hair is sparse it is fine and short (vellus); where thick, full-length terminal hair.
            const full = Math.min(1, d * 1.6);
            const ux = R[b * 3] - R[a * 3], uy = R[b * 3 + 1] - R[a * 3 + 1], uz = R[b * 3 + 2] - R[a * 3 + 2];
            const vx = R[c * 3] - R[a * 3], vy = R[c * 3 + 1] - R[a * 3 + 1], vz = R[c * 3 + 2] - R[a * 3 + 2];
            const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
            // Hair grows thicker in some patches than others; at its fullest, everywhere.
            const cx = (R[a * 3] + R[b * 3] + R[c * 3]) / 3, cy = (R[a * 3 + 1] + R[b * 3 + 1] + R[c * 3 + 1]) / 3, cz = (R[a * 3 + 2] + R[b * 3 + 2] + R[c * 3 + 2]) / 3;
            const patch = 0.45 + 1.1 * noise3(cx * 14 + 3, cy * 14, cz * 14), even = Math.min(1, d * 1.15) ** 3;
            let count = area * perM2 * d * (mode === 'clump' ? 0.7 + 0.7 * d : 1) * (patch + (1 - patch) * even);
            while (count > 0) {
                if (count < 1 && rand() > count) break;
                count -= 1;
                let s1 = rand(), s2 = rand();
                if (s1 + s2 > 1) { s1 = 1 - s1; s2 = 1 - s2; }
                const fam = famOf(a), sv = an.s[a * 5 + fam];
                // Coarser, longer, curlier hair where it grows so; fine short hair on the forearms and legs.
                const coarse = fam === 0 && (sv < 0.3 || (sv > 2.9 && sv < 3.4 && Math.abs(R[a * 3]) > 0.1)) ? 1 : 0;
                const face = fam === 0 && sv > 4.35;
                // Lengths as people grow them: chest and belly 1.5 to 2.5 cm, the groin and armpits longer
                // and curled, forearms and shins a little over a centimeter, a furred face short.
                const chest = fam === 0 && sv > 0.6 && sv < 3.9;
                const base = mode === 'clump' ? (face ? 0.01 : coarse ? 0.03 : chest ? 0.024 : fam >= 3 ? 0.017 : 0.015) : face ? 0.009 : coarse ? 0.024 : chest ? 0.019 : fam >= 3 ? 0.014 : 0.012;
                const at = [R[a * 3], R[a * 3 + 1], R[a * 3 + 2]], front = Math.cos(an.angle[a * 5 + fam]) > 0;
                strands.push({ tri: [a, b, c], w: [1 - s1 - s2, s1, s2],
                    uv:[0,1].map(k=>pack.body.uv[I[t]*2+k]*(1-s1-s2)+pack.body.uv[I[t+1]*2+k]*s1+pack.body.uv[I[t+2]*2+k]*s2),
                    len: base * (0.65 + 0.7 * rand()) * (mode === 'clump' ? (0.6 + 0.9 * full) * (bodyHair.length || 1) : mode === 'strand' ? 0.35 + 0.65 * full : 1 + fur * 1.4 * (bodyHair.length || 1)), fine: full,
                    // A coat stands off the skin and lies one way, combed; single hairs lie close and stray more.
                    lean: mode !== 'tuft' ? 0.1 + 0.12 * rand() : 0.28 + 0.22 * rand() + fur * 0.25,
                    // The lie: the place's own flow, turned by a slow drift over the body (neighbors comb the same
                    // way, whorls form) and a little by each lock; the curliest hair, at the groin, every way.
                    flow: flowOf(fam, sv, at, front),
                    curl: coarse ? 0.9 : chest ? 0.45 * rand() : 0.2 * rand(),
                    twist: (noise3(at[0] * 9, at[1] * 9, at[2] * 9) - 0.5) * 1.3 + (rand() - 0.5) * (coarse ? 2.5 : 0.3),
                    // A clump carries more hairs where hair grows thick (the picture's lanes run sparse to dense).
                    lane: mode === 'clump' ? Math.min(3, Math.floor(d * 3.2 + rand() * 0.8)) : (fur > 0.3 && rand() < fur ? 2 : 0) + Math.floor(rand() * 2), shade: mode !== 'tuft' ? 0.75 + 0.3 * rand() : 0.82 + 0.36 * rand(), fam, x: R[a * 3] });
            }
        }
        if (pack._strandCache.size > 6) pack._strandCache.clear();
        pack._strandCache.set(key, strands);
        return strands;
    }

    /**
     * The strands laid on a shaped body: each a narrow card from its root,
     * leaning out of the skin and along the flow, bending as it goes (two
     * segments), its width a few strands of the picture. Returns a part.
     */
    function hairPart(pack, P, normals, strands, color, options) {
        const o = options || {};
        const n = strands.length;
        const SEG = 3, perStrand = SEG * 2;
        const positions = new Float32Array(n * perStrand * 3), nrm = new Float32Array(n * perStrand * 3), uvs = new Float32Array(n * perStrand * 2), colors = new Float32Array(n * perStrand * 3);
        const joints = new Uint8Array(n * perStrand * 4), weights = new Float32Array(n * perStrand * 4), index = new Uint32Array(n * (SEG - 1) * 6), source = new Int32Array(n * perStrand);
        const rgb = Outfit.linear(color || '#2a1d15'), skin = Outfit.linear(o.skin || '#c69c7f');
        let vi = 0, ii = 0;
        // A tuft is a few millimeters across: its picture holds the strands.
        const single = o.mode === 'strand', clump = o.mode === 'clump';
        const width = (single ? 0.00028 : clump ? 0.0032 : 0.0022) * (o.width || 1);
        const SKJ = pack.skinJoints, SKW = pack.skinWeights;
        for (let si = 0; si < n; si++) {
            const s = strands[si], a = s.tri[0], b = s.tri[1], c = s.tri[2], wa = s.w[0], wb = s.w[1], wc = s.w[2];
            let px = P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc, py = P[a * 3 + 1] * wa + P[b * 3 + 1] * wb + P[c * 3 + 1] * wc, pz = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc;
            let nx = normals[a * 3] * wa + normals[b * 3] * wb + normals[c * 3] * wc, ny = normals[a * 3 + 1] * wa + normals[b * 3 + 1] * wb + normals[c * 3 + 1] * wc, nz = normals[a * 3 + 2] * wa + normals[b * 3 + 2] * wb + normals[c * 3 + 2] * wc;
            let l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
            // The flow at the root, on the skin's plane, turned about the skin's normal by the lock's twist.
            let [fx, fy, fz] = s.flow || [0, -1, 0];
            const fd = fx * nx + fy * ny + fz * nz;
            fx -= nx * fd; fy -= ny * fd; fz -= nz * fd;
            l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
            {
                const cs = Math.cos(s.twist), sn = Math.sin(s.twist), ox = ny * fz - nz * fy, oy = nz * fx - nx * fz, oz = nx * fy - ny * fx;
                fx = fx * cs + ox * sn; fy = fy * cs + oy * sn; fz = fz * cs + oz * sn;
            }
            const sx = ny * fz - nz * fy, sy = nz * fx - nx * fz, sz = nx * fy - ny * fx;
            const u0 = single ? 0 : s.lane * 0.25, u1 = single ? 1 : u0 + 0.25;
            const base = vi, step = s.len / (SEG - 1);
            // Fine hair is fainter: toward the color of the skin it grows on.
            const faint = single || clump ? 0.55 * (1 - (s.fine ?? 1)) : 0;
            let tint=rgb;
            if(o.picture&&s.uv){
                const pic=o.picture,x=Math.min(pic.width-1,Math.max(0,Math.round(s.uv[0]*(pic.width-1)))),y=Math.min(pic.height-1,Math.max(0,Math.round(s.uv[1]*(pic.height-1)))),offset=(y*pic.width+x)*4;
                tint=[0,1,2].map(k=>{const v=pic.data[offset+k]/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
            }
            const cr = (tint[0] + (skin[0] - tint[0]) * faint) * s.shade, cg = (tint[1] + (skin[1] - tint[1]) * faint) * s.shade, cb = (tint[2] + (skin[2] - tint[2]) * faint) * s.shade;
            const blend=new Map();for(const [v,w]of [[a,wa],[b,wb],[c,wc]])for(let k=0;k<4;k++){const j=SKJ[v*4+k],weight=SKW[v*4+k]*w;if(weight>0)blend.set(j,(blend.get(j)||0)+weight);}
            const binding=[...blend].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=binding.reduce((s,b)=>s+b[1],0)||1;
            for (let g = 0; g < SEG; g++) {
                const t = g / (SEG - 1);
                if (g > 0) {
                    // Out of the skin at first, lying down along the flow further out; curl turns it sideways.
                    const lift = s.lean * (1 - t * 0.6), turn = Math.sin(t * Math.PI * s.curl) * s.curl * 0.8;
                    let dx = fx + nx * lift + sx * turn, dy = fy + ny * lift + sy * turn, dz = fz + nz * lift + sz * turn;
                    const dl = Math.hypot(dx, dy, dz) || 1;
                    px += dx / dl * step; py += dy / dl * step; pz += dz / dl * step;
                }
                // Darker at the root; a tuft's tips catch the light, so a coat reads soft rather than speckled.
                // A clump's hairs fan out from its root, so its card keeps its width.
                const w = width * (single ? 1 - t * 0.65 : clump ? 0.8 + t * 0.2 : 1 - t * 0.5), tone = single || clump ? 0.85 + 0.15 * t : 0.9 + 0.2 * t * t;
                for (let k = -1; k <= 1; k += 2) {
                    const o3 = vi * 3, o4 = vi * 4;
                    positions[o3] = px + sx * w * k; positions[o3 + 1] = py + sy * w * k; positions[o3 + 2] = pz + sz * w * k;
                    nrm[o3] = nx; nrm[o3 + 1] = ny; nrm[o3 + 2] = nz;
                    uvs[vi * 2] = k < 0 ? u0 : u1; uvs[vi * 2 + 1] = 0.05 + t * 0.9;
                    colors[o3] = cr * tone; colors[o3 + 1] = cg * tone; colors[o3 + 2] = cb * tone;
                    for(let k=0;k<4;k++){joints[o4+k]=binding[k]?.[0]||0;weights[o4+k]=(binding[k]?.[1]||0)/sum;}
                    source[vi] = a;
                    vi++;
                }
            }
            for (let g = 0; g + 1 < SEG; g++) {
                const q = base + g * 2;
                index[ii] = q; index[ii + 1] = q + 2; index[ii + 2] = q + 1; index[ii + 3] = q + 1; index[ii + 4] = q + 2; index[ii + 5] = q + 3;
                ii += 6;
            }
        }
        return { name: o.name || 'Body hair', positions, normals: nrm, uvs, colors, index, joints, weights, texture: single ? 'strand.png' : 'bodyhair.png', cutout: true, alphaCutoff: clump ? 0.15 : single ? 0.3 : 0.35,
            keepColors: true, doubleSided: true, roughness: 0.75, kind: 'hair', onSkin: true, source, noShade: true };
    }

    /**
     * Fur on a part that is not the body (a tail, an animal ear): tufts on
     * the body fur's own picture, so the two coats read as one. `roots`:
     * [{ p, n, flow, len, width, color (linear rgb), tip?, lift?, droop?,
     * joints, weights }]. Each tuft grows out of the surface along `n`,
     * lies down along `flow` and bends under its own weight; darker at the
     * root, its tips catching the light, as the body's do. Returns a part.
     */
    function furCards(roots, options) {
        const o = options || {}, n = roots.length, SEG = 3, per = SEG * 2;
        const positions = new Float32Array(n * per * 3), nrm = new Float32Array(n * per * 3), uvs = new Float32Array(n * per * 2), colors = new Float32Array(n * per * 3);
        const joints = new Uint8Array(n * per * 4), weights = new Float32Array(n * per * 4), index = new Uint32Array(n * (SEG - 1) * 6);
        const rand = rng(o.seed || 77);
        let vi = 0, ii = 0;
        for (const s of roots) {
            const N = s.n;
            let fx = s.flow[0], fy = s.flow[1], fz = s.flow[2];
            const fd = fx * N[0] + fy * N[1] + fz * N[2];
            fx -= N[0] * fd; fy -= N[1] * fd; fz -= N[2] * fd;
            let l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
            // A little turn about the normal per tuft, so neighbors never comb in lockstep.
            const tw = (rand() - 0.5) * (s.twist ?? 0.6), cs = Math.cos(tw), sn = Math.sin(tw);
            const ox = N[1] * fz - N[2] * fy, oy = N[2] * fx - N[0] * fz, oz = N[0] * fy - N[1] * fx;
            [fx, fy, fz] = [fx * cs + ox * sn, fy * cs + oy * sn, fz * cs + oz * sn];
            const sx = N[1] * fz - N[2] * fy, sy = N[2] * fx - N[0] * fz, sz = N[0] * fy - N[1] * fx;
            const lane = s.lane ?? (2 + Math.floor(rand() * 2)), u0 = lane * 0.25, u1 = u0 + 0.25;
            const shade = 0.9 + 0.2 * rand(), step = s.len / (SEG - 1), lift = s.lift ?? 0.4, droop = s.droop ?? 0;
            const tip = s.tip || s.color;
            let px = s.p[0], py = s.p[1], pz = s.p[2];
            const base = vi;
            for (let g = 0; g < SEG; g++) {
                const t = g / (SEG - 1);
                if (g > 0) {
                    const up = lift * (1 - t * 0.6);
                    let dx = fx + N[0] * up, dy = fy + N[1] * up - droop * t, dz = fz + N[2] * up;
                    const dl = Math.hypot(dx, dy, dz) || 1;
                    px += dx / dl * step; py += dy / dl * step; pz += dz / dl * step;
                }
                const w = s.width * (1 - t * 0.45), tone = (0.9 + 0.2 * t * t) * shade;
                const c = mix(s.color, tip, t);
                for (let k = -1; k <= 1; k += 2) {
                    const o3 = vi * 3, o4 = vi * 4;
                    positions[o3] = px + sx * w * k; positions[o3 + 1] = py + sy * w * k; positions[o3 + 2] = pz + sz * w * k;
                    nrm[o3] = N[0]; nrm[o3 + 1] = N[1]; nrm[o3 + 2] = N[2];
                    uvs[vi * 2] = k < 0 ? u0 : u1; uvs[vi * 2 + 1] = 0.05 + t * 0.9;
                    colors[o3] = c[0] * tone; colors[o3 + 1] = c[1] * tone; colors[o3 + 2] = c[2] * tone;
                    for (let q = 0; q < 4; q++) { joints[o4 + q] = s.joints[q] || 0; weights[o4 + q] = s.weights[q] || 0; }
                    vi++;
                }
            }
            for (let g = 0; g + 1 < SEG; g++) {
                const q = base + g * 2;
                index[ii] = q; index[ii + 1] = q + 2; index[ii + 2] = q + 1; index[ii + 3] = q + 1; index[ii + 4] = q + 2; index[ii + 5] = q + 3;
                ii += 6;
            }
        }
        return { name: o.name || 'Feature fur', positions, normals: nrm, uvs, colors, index, joints, weights, texture: 'bodyhair.png', cutout: true, alphaCutoff: 0.35,
            keepColors: true, doubleSided: true, roughness: 0.75, kind: 'hair', onSkin: true, noShade: true };
    }

    /**
     * Body hair's strand picture: four lanes, each a tuft (two of three or four
     * strands for body hair, two of eight finer ones for fur), each strand its
     * own length and drift, tapering to its tip.
     */
    function bodyHairTexture(size = 256) {
        const data = new Uint8Array(size * size * 4);
        const rand = rng(5);
        const alpha = new Float32Array(size * size), tone = new Float32Array(size * size).fill(1);
        for (let lane = 0; lane < 4; lane++) {
            // A lock of hairs, sparse to dense (6, 10, 14, 20). No two start at the same place or run the
            // same way: each grows from its own point near the root, leans its own way and stops at its
            // own length, so a lock never shows a root line, a tip line or an outline.
            const count = [6, 10, 14, 20][lane], fine = lane < 2 ? 0.8 : 0.65;
            for (let k = 0; k < count; k++) {
                const u0 = lane * 0.25 + 0.125 + (rand() - 0.5) * 0.12, v0 = rand() * 0.22;
                const lean = (rand() - 0.5) * 0.5, bend = (rand() - 0.5) * 0.35, len = 0.45 + rand() * 0.5;
                const w0 = (0.0035 + 0.003 * rand()) * fine * size, ink = 0.6 + 0.4 * rand(), shade = 0.75 + 0.45 * rand();
                const steps = Math.ceil(len * size * 1.4);
                for (let i = 0; i <= steps; i++) {
                    const t = i / steps, v = v0 + t * len;
                    if (v >= 1) break;
                    const cu = (u0 + (lean + bend * t) * t * len * 0.5) * size, cy = v * size, w = w0 * (1 - 0.8 * t);
                    for (let x = Math.floor(cu - w - 1); x <= Math.ceil(cu + w + 1); x++) {
                        if (x < lane * size / 4 + 1 || x >= (lane + 1) * size / 4 - 1) continue;
                        const d = Math.abs(x + 0.5 - cu) / Math.max(0.5, w);
                        if (d > 1) continue;
                        const o = Math.floor(cy) * size + x, a = (1 - d * d) * ink * Math.min(1, (1 - t) * 4);
                        if (a > alpha[o]) { alpha[o] = a; tone[o] = shade; }
                    }
                }
            }
        }
        // Each hair a little lighter or darker than the tint it is drawn in, about it on the whole (the picture is
        // decoded as sRGB: its tones are set in linear light), so a strand shows the color it is given; at a
        // straight 225-and-darker the strands drew a third darker than their tint, dark dashes on a short coat.
        for (let o = 0; o < size * size; o++) {
            const l = Math.min(255, Math.round(255 * Math.pow(0.8 + 0.2 * Math.min(1, Math.max(0, (tone[o] - 0.75) / 0.45)), 1 / 2.2)));
            data[o * 4] = data[o * 4 + 1] = data[o * 4 + 2] = l; data[o * 4 + 3] = Math.round(255 * Math.min(1, alpha[o]));
        }
        return { width: size, height: size, data, name: 'bodyhair.png' };
    }

    /** One strand across its card: a soft round section, darker at its core, tapering to its tip. */
    function strandTexture(w = 32, h = 128) {
        const data = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h, o = (y * w + x) * 4;
            const width = 0.8 * (1 - v * 0.75);
            const a = Math.max(0, 1 - (u / width) ** 2) * Math.min(1, (1 - v) * 6);
            const l = Math.round(200 + 55 * (1 - Math.abs(u) / Math.max(0.05, width)));
            data[o] = data[o + 1] = data[o + 2] = Math.min(255, l); data[o + 3] = Math.round(255 * a);
        }
        return { width: w, height: h, data, name: 'strand.png' };
    }

    /** Dedicated UV space for the small anatomical surfaces, instead of a handful of body texels. */
    function genitalSurface(pack, female) {
        const key = female ? 'female' : 'male';
        const cache = pack._genitalSurfaces || (pack._genitalSurfaces = new Map());
        if (cache.has(key)) return cache.get(key);
        const Body = root.RRHumanBody || require('./HumanBody.js');
        let surface;
        if (!female) {
            const h = pack.helpers.genital, lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
            for (let i = 0; i < h.uv.length; i++) { lo[i % 2] = Math.min(lo[i % 2], h.uv[i]); hi[i % 2] = Math.max(hi[i % 2], h.uv[i]); }
            surface = { source: h.source, index: h.index, uv: Float32Array.from(h.uv, (q, i) => 0.025 + 0.95 * (q - lo[i % 2]) / (hi[i % 2] - lo[i % 2])) };
        } else {
            const B = pack.positions, low = Body.anatomyFields(pack).low, y = B[low * 3 + 1], z = B[low * 3 + 2];
            const src = pack.body.source, I = pack.body.index, triangles = [];
            for (let t = 0; t < I.length; t += 3) {
                const vertices = [src[I[t]], src[I[t + 1]], src[I[t + 2]]];
                if (vertices.every(v => Math.abs(B[v * 3]) < 0.075 && B[v * 3 + 1] > y - 0.025 && B[v * 3 + 1] < y + 0.145 && B[v * 3 + 2] > z - 0.025)) triangles.push(...vertices);
            }
            const source = [...new Set(triangles)], lookup = new Map(source.map((v, i) => [v, i]));
            const uv = new Float32Array(source.length * 2);
            source.forEach((v, i) => { uv[i * 2] = 0.5 + B[v * 3] / 0.16; uv[i * 2 + 1] = (B[v * 3 + 1] - y + 0.03) / 0.18; });
            surface = { source: Int32Array.from(source), index: Uint32Array.from(triangles, v => lookup.get(v)), uv };
        }
        cache.set(key, surface);
        return surface;
    }

    function genitalTexture(pack, skin, pattern, options, female) {
        const Skin = root.RRCharacterSkin || require('./CharacterSkin.js');
        const Body = root.RRHumanBody || require('./HumanBody.js');
        const surface = genitalSurface(pack, female);
        if (!surface.paintPack) {
            const fields = Skin.fieldsOf(pack), proxy = Object.create(pack);
            proxy.body = surface;
            proxy._skinFields = { ...fields, normals: female ? fields.normals : Body.vertexNormals(proxy, fields.an.rest) };
            surface.paintPack = proxy;
        }
        const rest = surface.paintPack._skinFields.an.rest;
        let bottom = Infinity;
        for (const v of surface.source) bottom = Math.min(bottom, rest[v * 3 + 1]);
        const picture = Skin.paint(surface.paintPack, skin, pattern, { ...options, genitalDetail: { female, bottom }, name: 'genital.png' });
        return picture;
    }

    /** Shared anatomical landmarks used by both the mesh and skin painter. */
    function genitalProfile(x, y, z, female, anatomy) {
        const Skin = root.RRCharacterSkin || require('./CharacterSkin.js');
        return Skin.genitalProfile(x, y, z, female, anatomy);
    }

    function stencilMix(terms) {
        const sum = new Map();
        for (const [stencil, weight] of terms) for (const [v, w] of stencil) sum.set(v, (sum.get(v) || 0) + w * weight);
        return [...sum].filter(([, w]) => Math.abs(w) > 1e-10);
    }

    /** Two bounded local steps; source stencils weld UV seams and pin the body boundary. */
    function genitalRefinement(pack, female) {
        const cache = pack._genitalRefinements || (pack._genitalRefinements = new Map());
        if (cache.has(female)) return cache.get(female);
        const h = genitalSurface(pack, female);
        let mesh = { stencils: Array.from(h.source, v => [[v, 1]]), uvs: h.uv, index: h.index, keys: Array.from(h.source, v => 'v' + v) };
        const edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
        for (let step = 0; step < (female ? 3 : 2); step++) {
            const edges = new Map(), neighbors = new Map(), representative = new Map();
            const selective = female && step === 2, split = new Set();
            mesh.keys.forEach((key, i) => representative.set(key, i));
            for (let t = 0; t < mesh.index.length; t += 3) {
                const ids = [0, 1, 2].map(k => mesh.index[t + k]);
                if (selective) {
                    const center = [0, 0, 0];
                    for (const i of ids) for (const [v, w] of mesh.stencils[i]) for (let k = 0; k < 3; k++) center[k] += pack.positions[v * 3 + k] * w / 3;
                    if (Math.abs(center[0]) < 0.02 && center[1] > -0.047 && center[1] < 0.035) for (let k = 0; k < 3; k++) split.add(edgeKey(mesh.keys[ids[k]], mesh.keys[ids[(k + 1) % 3]]));
                }
                for (let k = 0; k < 3; k++) {
                    const a = mesh.keys[ids[k]], b = mesh.keys[ids[(k + 1) % 3]], opposite = mesh.keys[ids[(k + 2) % 3]], key = edgeKey(a, b);
                    if (!edges.has(key)) edges.set(key, { a, b, opposite: [] });
                    edges.get(key).opposite.push(opposite);
                    if (!neighbors.has(a)) neighbors.set(a, new Set());
                    neighbors.get(a).add(b); neighbors.get(a).add(opposite);
                }
            }
            const boundary = new Set();
            for (const e of edges.values()) if (e.opposite.length !== 2) { boundary.add(e.a); boundary.add(e.b); }
            const stencils = mesh.stencils.map((stencil, i) => {
                if (selective || boundary.has(mesh.keys[i])) return stencil;
                const near = [...neighbors.get(mesh.keys[i])], beta = near.length === 3 ? 3 / 16 : 3 / (8 * near.length);
                return stencilMix([[stencil, 1 - near.length * beta], ...near.map(key => [mesh.stencils[representative.get(key)], beta])]);
            });
            const uvs = Array.from(mesh.uvs), keys = mesh.keys.slice(), index = [], uvEdges = new Map();
            const midpoint = (i, j) => {
                const uvKey = edgeKey(i, j);
                if (uvEdges.has(uvKey)) return uvEdges.get(uvKey);
                const key = edgeKey(mesh.keys[i], mesh.keys[j]), e = edges.get(key);
                const terms = !selective && e.opposite.length === 2 && !boundary.has(e.a) && !boundary.has(e.b)
                    ? [[mesh.stencils[i], 0.375], [mesh.stencils[j], 0.375], ...e.opposite.map(key => [mesh.stencils[representative.get(key)], 0.125])]
                    : [[mesh.stencils[i], 0.5], [mesh.stencils[j], 0.5]];
                const at = stencils.length;
                stencils.push(stencilMix(terms)); keys.push('e' + key);
                uvs.push((mesh.uvs[i * 2] + mesh.uvs[j * 2]) / 2, (mesh.uvs[i * 2 + 1] + mesh.uvs[j * 2 + 1]) / 2);
                uvEdges.set(uvKey, at); return at;
            };
            for (let t = 0; t < mesh.index.length; t += 3) {
                let ids = [mesh.index[t], mesh.index[t + 1], mesh.index[t + 2]];
                let marked = ids.map((v, k) => !selective || split.has(edgeKey(mesh.keys[v], mesh.keys[ids[(k + 1) % 3]])));
                const count = marked.filter(Boolean).length;
                if (!count) { index.push(...ids); continue; }
                // Rotate partial splits to keep both neighbors conforming without refining the outer patch.
                if (count < 3) {
                    const start = count === 1 ? marked.indexOf(true) : (marked.indexOf(false) + 1) % 3;
                    ids = [ids[start], ids[(start + 1) % 3], ids[(start + 2) % 3]];
                }
                const [a, b, c] = ids, ab = midpoint(a, b);
                if (count === 1) index.push(a, ab, c, ab, b, c);
                else if (count === 2) { const bc = midpoint(b, c); index.push(b, bc, ab, a, ab, c, ab, bc, c); }
                else { const bc = midpoint(b, c), ca = midpoint(c, a); index.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); }
            }
            mesh = { stencils, uvs: Float32Array.from(uvs), index: Uint32Array.from(index), keys };
        }
        const counts = new Map();
        for (let t = 0; t < mesh.index.length; t += 3) for (let k = 0; k < 3; k++) {
            const key = edgeKey(mesh.keys[mesh.index[t + k]], mesh.keys[mesh.index[t + (k + 1) % 3]]);
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        mesh.boundary = new Set();
        for (let t = 0; t < mesh.index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = mesh.index[t + k], b = mesh.index[t + (k + 1) % 3];
            if (counts.get(edgeKey(mesh.keys[a], mesh.keys[b])) === 1) { mesh.boundary.add(a); mesh.boundary.add(b); }
        }
        if (female) {
            // A subdivided boundary is a T junction against the coarse body. Interpolating
            // rest positions and skin weights there does not interpolate the posed edge:
            // bending the hips opens a slit. Keep the body's original edge endpoints.
            const originals = new Map();
            mesh.stencils.forEach((s, i) => { if (s.length === 1 && s[0][1] === 1) originals.set(s[0][0], i); });
            const replacement = new Map();
            for (const i of mesh.boundary) {
                const terms = mesh.stencils[i];
                if (terms.length > 1) {
                    const v = terms.slice().sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
                    if (originals.has(v)) replacement.set(i, originals.get(v));
                }
            }
            const triangles = [];
            for (let t = 0; t < mesh.index.length; t += 3) {
                const ids = [0, 1, 2].map(k => replacement.get(mesh.index[t + k]) ?? mesh.index[t + k]);
                if (new Set(ids).size === 3) triangles.push(...ids);
            }
            const used = [...new Set(triangles)], lookup = new Map(used.map((v, i) => [v, i]));
            mesh = { stencils: used.map(i => mesh.stencils[i]), keys: used.map(i => mesh.keys[i]),
                uvs: Float32Array.from(used.flatMap(i => [mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]])),
                index: Uint32Array.from(triangles, i => lookup.get(i)),
                boundary: new Set(used.flatMap((v, i) => mesh.boundary.has(v) ? [i] : [])) };
        }
        cache.set(female, mesh); return mesh;
    }

    function meshNormals(mesh, positions) {
        const shared = new Map();
        for (const key of mesh.keys) if (!shared.has(key)) shared.set(key, [0, 0, 0]);
        for (let t = 0; t < mesh.index.length; t += 3) {
            const ids = [mesh.index[t], mesh.index[t + 1], mesh.index[t + 2]], a = ids[0] * 3, b = ids[1] * 3, c = ids[2] * 3;
            const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
            const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
            const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
            for (const id of ids) { const sum = shared.get(mesh.keys[id]); for (let k = 0; k < 3; k++) sum[k] += cross[k]; }
        }
        const normals = new Float32Array(positions.length);
        mesh.keys.forEach((key, i) => { const n = shared.get(key), length = Math.hypot(...n) || 1; normals.set(n.map(q => q / length), i * 3); });
        return normals;
    }

    /** Fair the source helper's folded sac and bury its open attachment in the carried body. */
    function maleSurface(mesh, positions, canonical) {
        const links = new Map(), representatives = new Map();
        mesh.keys.forEach((key, i) => { if (!links.has(key)) links.set(key, new Set()); representatives.set(key, i); });
        for (let t = 0; t < mesh.index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = mesh.keys[mesh.index[t + k]], b = mesh.keys[mesh.index[t + (k + 1) % 3]];
            links.get(a).add(b); links.get(b).add(a);
        }
        // Paired positive/negative passes remove angular folds without steadily shrinking the sac.
        for (let pass = 0; pass < 8; pass++) {
            const next = new Float32Array(positions), lambda = pass % 2 ? -0.52 : 0.5;
            for (let i = 0; i < mesh.keys.length; i++) {
                const y = canonical[i * 3 + 1], z = canonical[i * 3 + 2];
                const blend = (1 - smooth(0.097, 0.112, z)) * (1 - smooth(-0.045, -0.025, y));
                if (!blend || mesh.boundary.has(i)) continue;
                const near = [...links.get(mesh.keys[i])].map(key => representatives.get(key));
                for (let k = 0; k < 3; k++) next[i * 3 + k] += (near.reduce((s, v) => s + positions[v * 3 + k], 0) / near.length - positions[i * 3 + k]) * lambda * blend;
            }
            positions.set(next);
        }
        // Blend the broad attachment back under the pubic skin as one smooth field. Snapping each
        // boundary point to a different body vertex would make a saw-toothed edge.
        for (let i = 0; i < mesh.keys.length; i++) {
            const blend = smooth(-0.036, -0.009, canonical[i * 3 + 1]);
            positions[i * 3] *= 1 - 0.12 * blend;
            positions[i * 3 + 2] -= 0.013 * blend;
        }
        // A rounded glans ends in a short cap, rather than the source helper's long pointed tip.
        for (let i = 0; i < mesh.keys.length; i++) {
            const x = canonical[i * 3], y = canonical[i * 3 + 1], z = canonical[i * 3 + 2];
            const tip = (1 - smooth(-0.098, -0.087, y)) * smooth(0.114, 0.126, z);
            positions[i * 3 + 1] += 0.003 * tip;
            positions[i * 3] += x * 0.18 * tip;
        }
    }

    /** One shared sac, with two separately attached shafts; atlas and skin bindings stay reusable. */
    function pairedMale(part, canonical) {
        const count = canonical.length / 3, chosen = [], used = new Set();
        for (let t = 0; t < part.index.length; t += 3) {
            const tri = Array.from(part.index.subarray(t, t + 3));
            if (tri.every(i => canonical[i * 3 + 2] > 0.103)) { chosen.push(tri); tri.forEach(i => used.add(i)); }
        }
        const ids = [...used], map = new Map(ids.map((v, i) => [v, count + i]));
        const positions = new Float32Array((count + ids.length) * 3);
        positions.set(part.positions);
        const shift = i => smooth(0.103, 0.12, canonical[i * 3 + 2]);
        for (let i = 0; i < count; i++) positions[i * 3] = part.positions[i * 3] * (1 - 0.25 * shift(i)) + 0.016 * shift(i);
        ids.forEach((v, i) => {
            positions.set(part.positions.subarray(v * 3, v * 3 + 3), (count + i) * 3);
            positions[(count + i) * 3] = part.positions[v * 3] * (1 - 0.25 * shift(v)) - 0.016 * shift(v);
        });
        const copy = (array, width) => {
            const out = new array.constructor((count + ids.length) * width); out.set(array);
            ids.forEach((v, i) => out.set(array.subarray(v * width, v * width + width), (count + i) * width)); return out;
        };
        const index = Uint32Array.from([...part.index, ...chosen.flatMap(tri => tri.map(i => map.get(i)))]);
        const result = { ...part, positions, index, uvs: copy(part.uvs, 2), joints: copy(part.joints, 4), weights: copy(part.weights, 4), pairedAnatomy: true };
        result.normals = copy(part.normals, 3);
        for (let i = 0; i < count + ids.length; i++) {
            const v = i < count ? i : ids[i - count], scale = 1 - 0.25 * shift(v);
            result.normals[i * 3] /= scale;
            const length = Math.hypot(...result.normals.subarray(i * 3, i * 3 + 3)) || 1;
            for (let k = 0; k < 3; k++) result.normals[i * 3 + k] /= length;
        }
        if (part.source) result.source = copy(part.source, 1);
        if (part.interpolation) {
            const b = part.interpolation, vertices = Array.from(b.vertices), weights = Array.from(b.weights), offsets = Array.from(b.offsets);
            for (const v of ids) { for (let j = b.offsets[v]; j < b.offsets[v + 1]; j++) { vertices.push(b.vertices[j]); weights.push(b.weights[j]); } offsets.push(vertices.length); }
            result.interpolation = { offsets: Uint32Array.from(offsets), vertices: Int32Array.from(vertices), weights: Float32Array.from(weights) };
        }
        return result;
    }

    function genitalPart(pack, built, skinPart, female, options) {
        const Body = root.RRHumanBody || require('./HumanBody.js'), surface = genitalSurface(pack, female);
        if (options?.static) {
            const source = surface.source, positions = Body.gather(built.shaped, source, 3);
            const part = { name: female ? 'Genital detail' : 'Genitals', positions,
                normals: female ? Body.gather(Body.vertexNormals(pack, built.shaped), source, 3) : Body.normals(built.shaped, source, surface.index, pack.vertexCount),
                uvs: surface.uv, index: surface.index, joints: Body.gather(pack.skinJoints, source, 4), weights: Body.gather(pack.skinWeights, source, 4), source,
                texture: 'genital.png', roughness: skinPart.roughness, kind: 'skin' };
            return !female && options.anatomy?.paired ? pairedMale(part, Body.gather(pack.positions, source, 3)) : part;
        }
        const mesh = genitalRefinement(pack, female), n = mesh.stencils.length, anatomy = options?.anatomy || {};
        const positions = new Float32Array(n * 3), canonical = new Float32Array(n * 3), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
        const offsets = [0], vertices = [], factors = [];
        mesh.stencils.forEach((stencil, i) => {
            const bones = new Map();
            for (const [v, w] of stencil) {
                vertices.push(v); factors.push(w);
                for (let k = 0; k < 3; k++) { positions[i * 3 + k] += built.shaped[v * 3 + k] * w; canonical[i * 3 + k] += pack.positions[v * 3 + k] * w; }
                for (let k = 0; k < 4; k++) {
                    const bone = pack.skinJoints[v * 4 + k];
                    bones.set(bone, (bones.get(bone) || 0) + pack.skinWeights[v * 4 + k] * w);
                }
            }
            offsets.push(vertices.length);
            const top = [...bones].sort((a, b) => b[1] - a[1]).slice(0, 4), total = top.reduce((s, q) => s + q[1], 0);
            top.forEach(([bone, w], k) => { joints[i * 4 + k] = bone; weights[i * 4 + k] = w / total; });
        });
        const originalNormals = meshNormals(mesh, positions);
        const bodyNormals = female ? Body.vertexNormals(pack, built.shaped) : null;
        for (let i = 0; i < n; i++) {
            if (mesh.boundary.has(i)) continue;
            const profile = genitalProfile(canonical[i * 3], canonical[i * 3 + 1], canonical[i * 3 + 2], female, anatomy);
            // Relief follows the deformed surface; the outer boundary is exactly the body's own edge.
            const u = mesh.uvs[i * 2], v = mesh.uvs[i * 2 + 1];
            const fade = female ? smooth(0.02, 0.13, Math.min(u, 1 - u, v, 1 - v)) : 1;
            const normal = [0, 0, 0];
            if (female) for (const [v, w] of mesh.stencils[i]) for (let k = 0; k < 3; k++) normal[k] += bodyNormals[v * 3 + k] * w;
            else normal.splice(0, 3, ...originalNormals.subarray(i * 3, i * 3 + 3));
            const length = Math.hypot(...normal) || 1;
            for (let k = 0; k < 3; k++) positions[i * 3 + k] += normal[k] / length * profile.height * fade;
        }
        if (!female) maleSurface(mesh, positions, canonical);
        const normals = meshNormals(mesh, positions);
        if (!female) {
            const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
            for (let i = 0; i < n; i++) if (canonical[i * 3 + 2] < 0.105 && canonical[i * 3 + 1] < -0.035) for (let k = 0; k < 3; k++) {
                lo[k] = Math.min(lo[k], positions[i * 3 + k]); hi[k] = Math.max(hi[k], positions[i * 3 + k]);
            }
            const center = lo.map((q, k) => (q + hi[k]) / 2), radii = lo.map((q, k) => Math.max(0.004, (hi[k] - q) / 2));
            for (let i = 0; i < n; i++) {
                const blend = (1 - smooth(0.096, 0.112, canonical[i * 3 + 2])) * (1 - smooth(-0.05, -0.03, canonical[i * 3 + 1])) * 0.85;
                if (!blend) continue;
                const radial = center.map((q, k) => (positions[i * 3 + k] - q) / (radii[k] * radii[k]));
                const length = Math.hypot(...radial) || 1;
                const mixed = radial.map((q, k) => q / length * blend + normals[i * 3 + k] * (1 - blend)), l = Math.hypot(...mixed) || 1;
                normals.set(mixed.map(q => q / l), i * 3);
            }
        }
        if (female) {
            for (let i = 0; i < n; i++) {
                const normal = [0, 0, 0];
                for (const [v, w] of mesh.stencils[i]) for (let k = 0; k < 3; k++) normal[k] += bodyNormals[v * 3 + k] * w;
                if (!mesh.boundary.has(i)) for (let k = 0; k < 3; k++) normal[k] += normals[i * 3 + k] - originalNormals[i * 3 + k];
                const length = Math.hypot(...normal) || 1; normals.set(normal.map(q => q / length), i * 3);
            }
        }
        // UV duplicates must use bit-identical normals even after local fairing.
        const welded = new Map();
        mesh.keys.forEach((key, i) => {
            if (!welded.has(key)) welded.set(key, normals.slice(i * 3, i * 3 + 3));
            else normals.set(welded.get(key), i * 3);
        });
        const part = { name: female ? 'Genital detail' : 'Genitals', positions, normals, uvs: mesh.uvs, index: mesh.index, joints, weights,
            texture: 'genital.png', normalTexture: 'genital_n.png', normalScale: female ? 0.45 : 0.18, roughness: skinPart.roughness, kind: 'skin', anatomicalDetail: female ? 'female' : 'male',
            interpolation: { offsets: Uint32Array.from(offsets), vertices: Int32Array.from(vertices), weights: Float32Array.from(factors) } };
        return !female && anatomy.paired ? pairedMale(part, canonical) : part;
    }

    /** Replace the coarse female region instead of covering a depression with the old skin. */
    function replaceGenitalSurface(pack, body) {
        const surface = genitalSurface(pack, true), key = ids => ids.slice().sort((a, b) => a - b).join(',');
        if (!surface.faces) {
            surface.faces = new Set();
            for (let t = 0; t < surface.index.length; t += 3) surface.faces.add(key([0, 1, 2].map(k => surface.source[surface.index[t + k]])));
        }
        const index = [];
        for (let t = 0; t < body.index.length; t += 3) if (!surface.faces.has(key([0, 1, 2].map(k => pack.body.source[body.index[t + k]])))) index.push(body.index[t], body.index[t + 1], body.index[t + 2]);
        body.index = Uint32Array.from(index);
    }

    /** Refine only forehead skin to resolve ribs and recessed ovals. */
    const cranialMeshes = new WeakMap();
    function cranialPart(pack, built, recipe, body, template) {
        const Body = root.RRHumanBody || require('./HumanBody.js'), F = Body.headFields(pack), P = built.shaped;
        const mean = ids => [0, 1, 2].map(k => ids.reduce((s, v) => s + P[v * 3 + k], 0) / ids.length);
        const eye = mean(F.eyeIds), head = mean(pack.bones[F.head].head);
        let crown = -Infinity;
        for (let v = 0; v < F.w.length; v++) if (F.w[v] > 0.9) crown = Math.max(crown, P[v * 3 + 1]);
        const H = crown - head[1], forehead = crown - eye[1];
        if (!(H > 1e-5 && forehead > 1e-5)) return null;
        let mesh, keep = null;
        const edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
        if (template) {
            mesh = cranialMeshes.get(template.interpolation);
            if (!mesh) {
                const bind = template.interpolation, stencils = [];
                for (let i = 0; i < bind.offsets.length - 1; i++) {
                    const terms = [];
                    for (let j = bind.offsets[i]; j < bind.offsets[i + 1]; j++) terms.push([bind.vertices[j], bind.weights[j]]);
                    stencils.push(terms);
                }
                mesh = { stencils, uvs: template.uvs, index: template.index, keys: stencils.map(s => JSON.stringify(s.slice().sort((a, b) => a[0] - b[0]))) };
                cranialMeshes.set(template.interpolation, mesh);
            }
        } else {
            const eyeIds = new Set(F.eyeIds);
            const eligible = v => F.w[v] > 0.9 && F.ear[v] < 0.05 && !eyeIds.has(v)
                && (P[v * 3 + 1] > eye[1] + forehead * 0.12 || (recipe.morph.noseFolds && Math.abs(P[v * 3]) < H * 0.22 && P[v * 3 + 1] > eye[1] - H * 0.37))
                && P[v * 3 + 2] > eye[2] - H * 0.55 && Math.abs(P[v * 3]) < H * 0.58;
            const stencils = [], uvs = [], keys = [], index = [], map = new Map();
            keep = [];
            const add = i => {
                if (map.has(i)) return map.get(i);
                const at = stencils.length, v = pack.body.source[i];
                stencils.push([[v, 1]]); keys.push('v' + v); uvs.push(body.uvs[i * 2], body.uvs[i * 2 + 1]); map.set(i, at); return at;
            };
            for (let t = 0; t < body.index.length; t += 3) {
                const ids = [body.index[t], body.index[t + 1], body.index[t + 2]];
                if (ids.every(i => eligible(pack.body.source[i]))) index.push(...ids.map(add));
                else keep.push(...ids);
            }
            if (!index.length || index.length > (recipe.morph.noseFolds ? 9600 : 4800)) return null;
            mesh = { stencils, uvs, keys, index };
            // Broader faces take one step: at most 6,400 triangles for the
            // forehead alone, 12,800 when nose folds also cover the bridge.
            const steps = index.length <= 1200 ? 2 : 1;
            for (let step = 0; step < steps; step++) {
                const next = [], midpoints = new Map();
                const mid = (a, b) => {
                    const key = edgeKey(a, b);
                    if (midpoints.has(key)) return midpoints.get(key);
                    const at = mesh.stencils.length;
                    mesh.stencils.push(stencilMix([[mesh.stencils[a], 0.5], [mesh.stencils[b], 0.5]]));
                    mesh.keys.push('e' + edgeKey(mesh.keys[a], mesh.keys[b]));
                    mesh.uvs.push((mesh.uvs[a * 2] + mesh.uvs[b * 2]) / 2, (mesh.uvs[a * 2 + 1] + mesh.uvs[b * 2 + 1]) / 2);
                    midpoints.set(key, at); return at;
                };
                for (let t = 0; t < mesh.index.length; t += 3) {
                    const [a, b, c] = mesh.index.slice(t, t + 3), ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
                    next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
                }
                mesh.index = next;
            }
        }
        const edges = new Map(), boundary = new Set();
        for (let t = 0; t < mesh.index.length; t += 3) for (let k = 0; k < 3; k++) {
            const a = mesh.index[t + k], b = mesh.index[t + (k + 1) % 3], key = edgeKey(mesh.keys[a], mesh.keys[b]);
            if (edges.has(key)) edges.get(key).count++; else edges.set(key, { count: 1, a, b });
        }
        for (const e of edges.values()) if (e.count === 1) { boundary.add(mesh.keys[e.a]); boundary.add(mesh.keys[e.b]); }
        const n = mesh.stencils.length, positions = new Float32Array(n * 3), originalNormals = new Float32Array(n * 3);
        const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4), offsets = [0], vertices = [], factors = [];
        const sourceNormals = Body.vertexNormals(pack, P);
        const profile = p => H * (Body.cranialRidgeAt(p[0] / H, (p[1] - eye[1]) / forehead, (p[2] - eye[2]) / H, recipe.morph.cranialRidges)
            + Body.foreheadSpoonAt(p[0] / H, (p[1] - eye[1]) / forehead, (p[2] - eye[2]) / H, recipe.morph.foreheadSpoon)
            + Body.noseFoldAt(p[0] / H, (p[1] - eye[1]) / H, (p[2] - eye[2]) / H, recipe.morph.noseFolds));
        for (let i = 0; i < n; i++) {
            const p = [0, 0, 0], bones = new Map();
            let coarse = 0;
            for (const [v, w] of mesh.stencils[i]) {
                vertices.push(v); factors.push(w);
                const q = Array.from(P.subarray(v * 3, v * 3 + 3));
                // Front-facing forehead vertices have full profile weight. Use
                // the unsculpted z for the small transition at the side edges.
                q[2] -= profile(q);
                coarse += profile(q) * w;
                for (let k = 0; k < 3; k++) { p[k] += P[v * 3 + k] * w; originalNormals[i * 3 + k] += sourceNormals[v * 3 + k] * w; }
                for (let k = 0; k < 4; k++) { const j = pack.skinJoints[v * 4 + k]; bones.set(j, (bones.get(j) || 0) + pack.skinWeights[v * 4 + k] * w); }
            }
            offsets.push(vertices.length);
            if (!boundary.has(mesh.keys[i])) { p[2] -= coarse; p[2] += profile(p); }
            positions.set(p, i * 3);
            const top = [...bones].sort((a, b) => b[1] - a[1]).slice(0, 4), total = top.reduce((s, q) => s + q[1], 0);
            top.forEach(([bone, w], k) => { joints[i * 4 + k] = bone; weights[i * 4 + k] = w / total; });
        }
        mesh.index = Uint32Array.from(mesh.index);
        const normals = meshNormals(mesh, positions);
        for (let i = 0; i < n; i++) if (boundary.has(mesh.keys[i])) {
            const v = originalNormals.subarray(i * 3, i * 3 + 3), length = Math.hypot(...v) || 1;
            normals.set(Array.from(v, q => q / length), i * 3);
        }
        if (keep) body.index = Uint32Array.from(keep);
        const interpolation = { offsets: Uint32Array.from(offsets), vertices: Int32Array.from(vertices), weights: Float32Array.from(factors) };
        cranialMeshes.set(interpolation, mesh);
        return { name: 'Forehead detail', positions, normals, uvs: Float32Array.from(mesh.uvs), index: mesh.index, joints, weights,
            texture: body.texture, roughness: body.roughness, kind: 'skin',
            interpolation };
    }

    const api = { strandTexture, areolaPatches, areolaTexture, areolaPart, chestParts, cranialPart, genitalSurface, genitalTexture, genitalPart, genitalProfile, replaceGenitalSurface, hairStrands, hairPart, furCards, bodyHairTexture };
    root.RRCharacterDetail = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
