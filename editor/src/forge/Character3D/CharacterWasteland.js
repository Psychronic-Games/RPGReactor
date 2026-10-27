/**
 * RRCharacterWasteland - post-apocalyptic gear for the Character Builder's wasteland garments.
 *
 * Every piece is made from code and fitted to the finished clothes under it (the body, the laid
 * soft garments and gear built before it): nothing is taken from a reference model.
 *
 *   build(pack, built, gear, entries, parts, cache)   { parts, textures, hidden } for the outfit's
 *                     wasteland gear items ({ item, kind }, RRCharacterWardrobe pieces' `wasteGear`):
 *     'scrapArmor'    scrap chest armor: riveted mismatched plates, a cut tire slab or a bent road
 *                     sign, strapped and buckled (style: plates, tire, sign)
 *     'scrapPauldrons' hubcap domes and riveted sign lames over the shoulders (style: mixed,
 *                     hubcap, sign); the mixed pair carries a chain across the chest
 *     'harness'       a bandolier of canisters, or a chest harness of pouches (style)
 *     'toolBelt'      a wide belt with pouches, a wrench, a screwdriver, a lamp, a canteen and a rag
 *     'gasMask'       a rubber face seal with round lenses, filters and a strap harness (style:
 *                     single, twin)
 *     'goggles'       dust goggles on the forehead or over the eyes (style)
 *     'bootWraps'     rag strips wound round the boot shafts, their ends hanging
 *   Each item's `color`, `color2` and `trim` color it; its `wear` (RRCharacterWear) rusts and
 *   grimes it.
 *
 *   pictures()        the scrap sheet (albedo, relief, finish), made once
 */
(function(root) {
    'use strict';
    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const TAU = Math.PI * 2;
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x), ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const fract = x => x - Math.floor(x);
    const srgb = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const linear = hex => { const n = parseInt(String(hex || '#808080').slice(1), 16); return [srgb(((n >> 16) & 255) / 255), srgb(((n >> 8) & 255) / 255), srgb((n & 255) / 255)]; };
    const toByte = c => Math.max(0, Math.min(255, Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)));
    const tone = (c, k) => c.map(x => Math.min(1, x * k));
    const Y = [0, 1, 0];
    function ihash(x, y, z) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
    function noise2(x, y, s) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = ihash(ix, iy, s), b = ihash(ix + 1, iy, s), c = ihash(ix, iy + 1, s), d = ihash(ix + 1, iy + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
    const fbm2 = (x, y, s) => 0.5 * noise2(x, y, s) + 0.3 * noise2(x * 2.03, y * 2.03, s + 1) + 0.2 * noise2(x * 4.1, y * 4.1, s + 2);
    function stream(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

    // ── a mesh with texture coordinates, colors and skins ─────────────────
    class GearMesh {
        constructor() { this.p = []; this.n = []; this.uv = []; this.uv1 = []; this.c = []; this.j = []; this.w = []; this.i = []; }
        vertex(p, n, c, skin, uv, uv1) {
            const k = this.p.length / 3;
            this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]);
            this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0); this.uv1.push(uv1 ? uv1[0] : uv ? uv[0] : 0, uv1 ? uv1[1] : uv ? uv[1] : 0);
            const s = typeof skin === 'function' ? skin(p) : skin;
            for (let q = 0; q < 4; q++) { this.j.push(s.joints[q] || 0); this.w.push(s.weights[q] || 0); }
            return k;
        }
        tri(a, b, c) { this.i.push(a, b, c); }
        quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }
        get empty() { return !this.i.length; }
        /** Smooth normals from the faces (for the vertices from `from` on), facing away from `inside(p)` where given. */
        smooth(from = 0, inside = null) {
            const n = this.p.length / 3, N = new Float64Array((n - from) * 3), P = this.p;
            for (let t = 0; t < this.i.length; t += 3) {
                const a = this.i[t], b = this.i[t + 1], c = this.i[t + 2];
                if (a < from || b < from || c < from) continue;
                const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], v = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
                const f = cross(u, v);
                for (const x of [a, b, c]) { N[(x - from) * 3] += f[0]; N[(x - from) * 3 + 1] += f[1]; N[(x - from) * 3 + 2] += f[2]; }
            }
            for (let x = from; x < n; x++) { const v = norm([N[(x - from) * 3], N[(x - from) * 3 + 1], N[(x - from) * 3 + 2]]); this.n[x * 3] = v[0]; this.n[x * 3 + 1] = v[1]; this.n[x * 3 + 2] = v[2]; }
        }
        /**
         * Rows of points joined into a surface (`closed`: each row a loop). Normals smoothed from the
         * faces, wound to face away from `inside(p)`. `uvAt(r, k)`: texture coordinates.
         */
        grid(rows, color, skin, inside, { closed = false, uvAt = null, colorAt = null } = {}) {
            const base = this.p.length / 3, R = rows.length, K = rows[0].length, cols = closed ? K + 1 : K;
            for (let r = 0; r < R; r++) for (let k = 0; k < cols; k++) {
                const q = k % K, p = rows[r][q];
                this.vertex(p, [0, 1, 0], colorAt ? colorAt(r, q) : color, skin, uvAt ? uvAt(r, k) : [k / (cols - 1), r / (R - 1)]);
            }
            const first = this.i.length;
            for (let r = 0; r + 1 < R; r++) for (let k = 0; k + 1 < cols; k++) { const a = base + r * cols + k, b = a + 1, c = a + cols, d = c + 1; this.i.push(a, b, d, a, d, c); }
            if (inside) {
                let vote = 0;
                const at = v => [this.p[v * 3], this.p[v * 3 + 1], this.p[v * 3 + 2]];
                for (let t = first; t < this.i.length; t += 3) { const A = at(this.i[t]); vote += dot(cross(sub(at(this.i[t + 1]), A), sub(at(this.i[t + 2]), A)), sub(A, inside(A))); }
                if (vote < 0) for (let t = first; t < this.i.length; t += 3) { const x = this.i[t + 1]; this.i[t + 1] = this.i[t + 2]; this.i[t + 2] = x; }
            }
            this.smooth(base);
            if (closed) for (let r = 0; r < R; r++) { const a = base + r * cols, b = a + K; for (let c = 0; c < 3; c++) { const v = (this.n[a * 3 + c] + this.n[b * 3 + c]) / 2; this.n[a * 3 + c] = this.n[b * 3 + c] = v; } }
            return base;
        }
        /** A closed tube through points (radius number or function of 0..1), `sides` round, capped. */
        tube(points, radius, sides, color, skin, { caps = true, uvScale = 1, colorAt = null } = {}) {
            const n = points.length; if (n < 2) return;
            let prev = null; const rows = [];
            for (let i = 0; i < n; i++) {
                const d = norm(sub(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]));
                let x = prev ? norm(sub(prev, mul(d, dot(prev, d)))) : norm(cross(d, Math.abs(d[1]) < 0.9 ? Y : [1, 0, 0]));
                prev = x; const y = cross(d, x), r = typeof radius === 'function' ? radius(i / (n - 1)) : radius;
                rows.push(Array.from({ length: sides }, (_, k) => { const a = k / sides * TAU; return add(points[i], add(mul(x, Math.cos(a) * r), mul(y, Math.sin(a) * r))); }));
            }
            let along = 0; const lengths = [0]; for (let i = 1; i < n; i++) { along += len(sub(points[i], points[i - 1])); lengths.push(along); }
            const base = this.grid(rows, color, skin, p => { let best = points[0], bd = Infinity; for (const q of points) { const d = len(sub(p, q)); if (d < bd) { bd = d; best = q; } } return best; },
                { closed: true, uvAt: (r, k) => [k / sides * uvScale, lengths[r] * uvScale * 8], colorAt: colorAt ? (r) => colorAt(r / (n - 1)) : null });
            if (caps) for (const [r, sgn] of [[0, -1], [n - 1, 1]]) {
                const d = mul(norm(sub(points[Math.min(n - 1, r + (sgn > 0 ? 0 : 1))], points[Math.max(0, r - (sgn > 0 ? 1 : 0))])), sgn);
                const center = this.vertex(points[r], d, colorAt ? colorAt(r / (n - 1)) : color, skin, [0.5, 0.5]);
                const ring = rows[r].map(p => this.vertex(p, d, colorAt ? colorAt(r / (n - 1)) : color, skin, [0.5 + 0.5 * Math.cos(0), 0.5]));
                for (let k = 0; k < sides; k++) { const a = ring[k], b = ring[(k + 1) % sides]; const f = cross(sub(this.at(a), points[r]), sub(this.at(b), points[r])); if (dot(f, d) > 0) this.i.push(center, a, b); else this.i.push(center, b, a); }
            }
            return base;
        }
        at(v) { return [this.p[v * 3], this.p[v * 3 + 1], this.p[v * 3 + 2]]; }
        /** A rounded box on axes (x, y, z unit vectors), half sizes, corner radius. */
        box(center, axes, half, radius, color, skin, steps = 2) {
            const r = Math.min(radius, ...half.map(v => v * 0.75)), base = this.p.length / 3;
            for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
                const u = (axis + 1) % 3, v = (axis + 2) % 3, values = k => { const a = Array.from({ length: steps + 1 }, (_, j) => -half[k] + r * (1 - Math.cos(j / steps * Math.PI / 2))); return a.concat(a.map(x => -x).reverse()); };
                const A = values(u), B = values(v), start = this.p.length / 3;
                for (const b of B) for (const a of A) {
                    const p = [0, 0, 0]; p[axis] = sign * half[axis]; p[u] = a; p[v] = b;
                    const q = p.map((x, k) => Math.max(-half[k] + r, Math.min(half[k] - r, x))), nn = norm(sub(p, q)), local = add(q, mul(nn, r));
                    const world = add(center, add(add(mul(axes[0], local[0]), mul(axes[1], local[1])), mul(axes[2], local[2])));
                    const normal = add(add(mul(axes[0], nn[0]), mul(axes[1], nn[1])), mul(axes[2], nn[2]));
                    this.vertex(world, normal, color, skin, [local[u] * 10, local[v] * 10]);
                }
                const mirrored = dot(cross(axes[0], axes[1]), axes[2]) < 0;
                for (let j = 0; j < B.length - 1; j++) for (let i = 0; i < A.length - 1; i++) { const a = start + j * A.length + i, b = a + 1, c = a + A.length, d = c + 1; if ((sign > 0) !== mirrored) this.i.push(a, b, c, b, d, c); else this.i.push(a, c, b, b, c, d); }
            }
            return base;
        }
        /** A disc facing `normal`. */
        disc(center, normal, r, color, skin, sides = 16, uvc = null) {
            const x = norm(cross(normal, Math.abs(normal[1]) < 0.9 ? Y : [1, 0, 0])), y = cross(normal, x);
            const c = this.vertex(center, normal, color, skin, uvc ? uvc(0, 0) : [0.5, 0.5]), ring = [];
            for (let k = 0; k < sides; k++) { const a = k / sides * TAU, p = add(center, add(mul(x, Math.cos(a) * r), mul(y, Math.sin(a) * r))); ring.push(this.vertex(p, normal, color, skin, uvc ? uvc(Math.cos(a), Math.sin(a)) : [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)])); }
            for (let k = 0; k < sides; k++) this.i.push(c, ring[k], ring[(k + 1) % sides]);
        }
        part(name, material) {
            return Object.assign({ name, positions: Float32Array.from(this.p), normals: Float32Array.from(this.n), uvs: Float32Array.from(this.uv), colors: Float32Array.from(this.c),
                joints: Uint8Array.from(this.j), weights: Float32Array.from(this.w), index: Uint32Array.from(this.i) }, material);
        }
    }

    // ── fitting to what is worn ───────────────────────────────────────────
    /**
     * The body and what is worn on it, measured for gear: skins by the nearest body vertex,
     * the trunk's outer surface round its axis (`radial`), the tops of the shoulders (`topAt`),
     * and the head's sections.
     */
    function context(pack, built, entries, parts) {
        const O = need('RRCharacterOutfit', './CharacterOutfit.js'), an = O.anatomy(pack), s = built.height / 1.7;
        const body = built.parts[0], src = pack.body.source, bones = built.bones;
        const bone = name => bones.find(b => b.name === name), joint = name => Math.max(0, bones.findIndex(b => b.name === name));
        const hips = bone('Hips').head, neck = bone('Neck').head, head = bone('Head').head;
        // Body vertices in a grid, for skins.
        const cell = 0.03, grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
        const BP = body.positions, nb = BP.length / 3;
        for (let v = 0; v < nb; v++) { const k = key(Math.floor(BP[v * 3] / cell), Math.floor(BP[v * 3 + 1] / cell), Math.floor(BP[v * 3 + 2] / cell)); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(v); }
        const nearestBody = (p, accept) => {
            const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
            for (let r = 1; r <= 6; r++) {
                let best = -1, bd = Infinity;
                for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
                    if (Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r && r > 1) continue;
                    for (const v of grid.get(key(cx + i, cy + j, cz + k)) || []) { if (accept && !accept(v)) continue; const d = (BP[v * 3] - p[0]) ** 2 + (BP[v * 3 + 1] - p[1]) ** 2 + (BP[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
                }
                if (best >= 0) return best;
            }
            return 0;
        };
        const skinOf = v => ({ joints: Array.from(body.joints.subarray(v * 4, v * 4 + 4)), weights: Array.from(body.weights.subarray(v * 4, v * 4 + 4)) });
        const trunkV = v => an.member[src[v] * 5] > 0.5;
        const skinAt = (p, trunk) => skinOf(nearestBody(p, trunk ? trunkV : null));
        const rigid = name => ({ joints: [joint(name), 0, 0, 0], weights: [1, 0, 0, 0] });
        const axisAt = y => { const t = clamp01((y - hips[1]) / (neck[1] - hips[1])); return [hips[0] + (neck[0] - hips[0]) * t, y, hips[2] + (neck[2] - hips[2]) * t]; };
        // The trunk's outer surface round its axis: the farthest point at each bearing and height, of the
        // body's trunk, the soft garments' trunk cloth and the gear already made (not the arms).
        const A = 96, y0 = hips[1] - 0.35 * s, y1 = neck[1] + 0.06 * s, dy = 0.01 * s, H = Math.ceil((y1 - y0) / dy) + 1;
        const radial = new Float32Array(A * H);
        const addPoint = (x, y, z) => {
            if (y < y0 || y > y1) return;
            const c = axisAt(y), dx = x - c[0], dz = z - c[2], r = Math.hypot(dx, dz);
            if (r > 0.4 * s) return;
            const a = Math.floor(((Math.atan2(dx, dz) / TAU) % 1 + 1) % 1 * A) % A, h = Math.round((y - y0) / dy);
            if (r > radial[h * A + a]) radial[h * A + a] = r;
        };
        for (let v = 0; v < nb; v++) if (trunkV(v)) addPoint(BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]);
        for (const e of entries || []) { const L = e.laid; for (let v = 0; v < L.positions.length / 3; v++) { const f = L.field && L.field[L.origin ? L.origin[v] : v]; if (f && f.fam !== 0) continue; addPoint(L.positions[v * 3], L.positions[v * 3 + 1], L.positions[v * 3 + 2]); } }
        const addPart = p => { if (!p || p.limb) return; for (let v = 0; v < p.positions.length / 3; v++) addPoint(p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]); };
        for (const p of parts || []) if (p.trunkGear) addPart(p);
        let smooth = null;
        const settle = () => {
            // Gaps filled from their neighbors, a bearing's maximum spread a little either side, then eased.
            const r = Float32Array.from(radial);
            for (let pass = 0; pass < 12; pass++) for (let h = 0; h < H; h++) for (let a = 0; a < A; a++) {
                if (r[h * A + a] > 0) continue;
                let sum = 0, n = 0;
                for (const [dh, da] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const hh = h + dh; if (hh < 0 || hh >= H) continue; const q = r[hh * A + (a + da + A) % A]; if (q > 0) { sum += q; n++; } }
                if (n) r[h * A + a] = sum / n;
            }
            const m = Float32Array.from(r);
            for (let h = 0; h < H; h++) for (let a = 0; a < A; a++) { let best = 0; for (let dh = -1; dh <= 1; dh++) for (let da = -1; da <= 1; da++) { const hh = h + dh; if (hh < 0 || hh >= H) continue; best = Math.max(best, r[hh * A + (a + da + A) % A]); } m[h * A + a] = best; }
            const b = Float32Array.from(m);
            for (let pass = 0; pass < 2; pass++) for (let h = 0; h < H; h++) for (let a = 0; a < A; a++) { let sum = 0, n = 0; for (let dh = -1; dh <= 1; dh++) for (let da = -1; da <= 1; da++) { const hh = h + dh; if (hh < 0 || hh >= H) continue; sum += m[hh * A + (a + da + A) % A]; n++; } b[h * A + a] = Math.max(r[h * A + a], sum / n); }
            smooth = b;
        };
        /** The point on the outer surface at bearing `a` (0 in front, + to the body's left) and height y, `gap` out. */
        const radialAt = (a, y, gap = 0) => {
            if (!smooth) settle();
            const fa = ((a / TAU) % 1 + 1) % 1 * A, fh = Math.max(0, Math.min(H - 1.001, (y - y0) / dy)), a0 = Math.floor(fa) % A, a1 = (a0 + 1) % A, h0 = Math.floor(fh), h1 = Math.min(H - 1, h0 + 1), ta = fa - Math.floor(fa), th = fh - h0;
            const r = (smooth[h0 * A + a0] * (1 - ta) + smooth[h0 * A + a1] * ta) * (1 - th) + (smooth[h1 * A + a0] * (1 - ta) + smooth[h1 * A + a1] * ta) * th;
            const c = axisAt(y), rr = (r || 0.12 * s) + gap;
            return [c[0] + Math.sin(a) * rr, y, c[2] + Math.cos(a) * rr];
        };
        const radialNormal = (a, y) => { const e = 0.01 * s, p = radialAt(a, y), pa = radialAt(a + e / Math.max(0.05, len(sub(p, axisAt(y)))), y), py = radialAt(a, y + e); let n = norm(cross(sub(pa, p), sub(py, p))); if (dot(n, [Math.sin(a), 0, Math.cos(a)]) < 0) n = mul(n, -1); return n; };
        const addLayer = part => { addPart(part); smooth = null; };
        // The tops of the shoulders: the highest trunk (and soft cloth) point over each spot, below the neck.
        const topCell = 0.012 * s, top = new Map();
        const topPut = (x, y, z) => { if (y > neck[1] + 0.01 * s || y < neck[1] - 0.25 * s) return; const k = Math.floor(x / topCell) + ':' + Math.floor(z / topCell); if (!(top.get(k) >= y)) top.set(k, y); };
        for (let v = 0; v < nb; v++) if (an.member[src[v] * 5] > 0.3 || an.s[src[v] * 5 + 1] < 1.3 || an.s[src[v] * 5 + 2] < 1.3) topPut(BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]);
        for (const e of entries || []) { const L = e.laid; for (let v = 0; v < L.positions.length / 3; v++) topPut(L.positions[v * 3], L.positions[v * 3 + 1], L.positions[v * 3 + 2]); }
        const topAt = (x, z) => { let best = -Infinity; const cx = Math.floor(x / topCell), cz = Math.floor(z / topCell); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const y = top.get((cx + i) + ':' + (cz + j)); if (y > best) best = y; } return best; };
        return { pack, built, an, s, O, bone, joint, hips, neck, head, skinAt, skinOf, nearestBody, rigid, axisAt, radialAt, radialNormal, addLayer, topAt, entries };
    }

    /**
     * A strap along a path of surface points with their outward normals: its outer face, its
     * two edges (its thickness) and the face under it. `width`, `thickness` in meters.
     */
    function strap(m, path, width, thickness, color, skin, { uvStart = 0, edgeColor = null } = {}) {
        const n = path.length; if (n < 2) return;
        const rows = [];
        let along = uvStart;
        for (let i = 0; i < n; i++) {
            const { p, n: nn } = path[i], t = norm(sub(path[Math.min(n - 1, i + 1)].p, path[Math.max(0, i - 1)].p));
            const x = norm(cross(t, nn));
            if (i) along += len(sub(p, path[i - 1].p));
            rows.push({ p, n: nn, x, along });
        }
        const sk = r => (typeof skin === 'function' ? skin(r.p) : skin);
        const base = m.p.length / 3, e = edgeColor || tone(color, 0.8);
        for (const r of rows) {
            const s0 = sk(r), top = add(r.p, mul(r.n, thickness)), w = width / 2;
            m.vertex(add(top, mul(r.x, -w)), r.n, color, s0, [r.along, 0]);
            m.vertex(add(top, mul(r.x, w)), r.n, color, s0, [r.along, width]);
            m.vertex(add(top, mul(r.x, -w)), mul(r.x, -1), e, s0, [r.along, 0]);
            m.vertex(add(r.p, mul(r.x, -w)), mul(r.x, -1), e, s0, [r.along, -thickness]);
            m.vertex(add(top, mul(r.x, w)), r.x, e, s0, [r.along, width]);
            m.vertex(add(r.p, mul(r.x, w)), r.x, e, s0, [r.along, width + thickness]);
        }
        for (let i = 0; i + 1 < n; i++) {
            const a = base + i * 6, b = a + 6;
            m.quad(a, a + 1, b + 1, b);     // top
            m.quad(a + 2, b + 2, b + 3, a + 3); // edge -
            m.quad(a + 4, a + 5, b + 5, b + 4); // edge +
        }
        // Wound outward on the top.
        const P = q => m.at(q), f = cross(sub(P(base + 1), P(base)), sub(P(base + 6), P(base)));
        if (dot(f, rows[0].n) < 0) for (let t = m.i.length - (n - 1) * 18; t < m.i.length; t += 3) { const x = m.i[t + 1]; m.i[t + 1] = m.i[t + 2]; m.i[t + 2] = x; }
        return rows;
    }
    /**
     * A rolled band of cloth along a path of surface points: a flattened round section `width`
     * across and `thick` deep, lying on the surface (wound cloth, not a flat ribbon).
     */
    function roll(m, path, width, thick, color, skin, { closed = false, uvScale = 1, sides = 6 } = {}) {
        const n = path.length; if (n < 2) return;
        const rows = [];
        let along = 0;
        for (let i = 0; i < n; i++) {
            const { p, n: nn } = path[i], prev = path[closed ? (i - 1 + n) % n : Math.max(0, i - 1)].p, next = path[closed ? (i + 1) % n : Math.min(n - 1, i + 1)].p;
            const t = norm(sub(next, prev)), x = norm(cross(t, nn)), y = norm(cross(x, t)), c = add(p, mul(y, thick * 0.5));
            if (i) along += len(sub(p, path[i - 1].p));
            const w = width / 2 * (0.92 + 0.08 * Math.sin(along * 40)), h = thick / 2;
            rows.push(Array.from({ length: sides }, (_, k) => { const a = (k + 0.5) / sides * TAU, ca = Math.cos(a), sa = Math.sin(a); return add(c, add(mul(x, ca * w), mul(y, Math.sign(sa) * Math.pow(Math.abs(sa), 0.7) * h))); }));
        }
        if (closed) rows.push(rows[0]);
        const centers = rows.map(r => mul(r.reduce((a, b) => add(a, b), [0, 0, 0]), 1 / r.length));
        let total = 0; const L = [0]; for (let i = 1; i < rows.length; i++) { total += len(sub(centers[i], centers[i - 1])); L.push(total); }
        m.grid(rows, color, skin, p => { let best = centers[0], bd = Infinity; for (const c of centers) { const d = len(sub(c, p)); if (d < bd) { bd = d; best = c; } } return best; }, { closed: true, uvAt: (r, k) => [L[r] * uvScale, k / sides * width * uvScale] });
    }

    /** Points every `step` meters along a polyline. */
    function resample(points, step) {
        const out = [points[0]];
        let carry = 0;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i], d = len(sub(b, a));
            let t = step - carry;
            while (t < d) { out.push(lerp(a, b, t / d)); t += step; }
            carry = d - (t - step);
        }
        if (len(sub(out[out.length - 1], points[points.length - 1])) > step * 0.3) out.push(points[points.length - 1]);
        return out;
    }
    /** A strap path round the trunk through (bearing, height) stations, `gap` off the outer surface. */
    function trunkPath(C, stations, gap, step) {
        const dense = [];
        for (let i = 0; i + 1 < stations.length; i++) {
            const [a0, y0] = stations[i], [a1, y1] = stations[i + 1], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * 0.2 / step + Math.abs(y1 - y0) / step));
            for (let k = 0; k < n; k++) { const t = k / n; dense.push([a0 + (a1 - a0) * t, y0 + (y1 - y0) * t]); }
        }
        dense.push(stations[stations.length - 1]);
        const pts = dense.map(([a, y]) => C.radialAt(a, y, gap));
        return resample(pts, step).map(p => { const c = C.axisAt(p[1]), a = Math.atan2(p[0] - c[0], p[2] - c[2]); return { p: C.radialAt(a, p[1], gap), n: C.radialNormal(a, p[1]), a }; });
    }
    /** Over a shoulder's top at x, from z0 (front) to z1 (behind), `gap` over it. */
    function shoulderPath(C, x, z0, z1, gap, step) {
        const n = Math.max(3, Math.ceil(Math.abs(z1 - z0) / step)), pts = [];
        let last = null;
        for (let k = 0; k <= n; k++) { const z = z0 + (z1 - z0) * k / n; let y = C.topAt(x, z); if (!Number.isFinite(y)) y = last ?? C.neck[1] - 0.04 * C.s; last = y; pts.push([x, y + gap, z]); }
        // Eased over the shoulder (no step from one cell to the next).
        for (let pass = 0; pass < 3; pass++) for (let k = 1; k < pts.length - 1; k++) pts[k][1] = Math.max(pts[k][1], (pts[k - 1][1] + pts[k + 1][1]) / 2);
        return pts.map((p, k) => { const d = norm(sub(pts[Math.min(pts.length - 1, k + 1)], pts[Math.max(0, k - 1)])); let nn = norm(cross(d, [1, 0, 0])); if (nn[1] < 0) nn = mul(nn, -1); return { p, n: nn }; });
    }

    // ── the scrap sheet ───────────────────────────────────────────────────
    // Eight cells of 256 (4 x 2) in 1024 x 512: what was cut and hammered into armor.
    const SCRAP = { signYellow: 0, signStripe: 1, panelTeal: 2, panelRed: 3, rust: 4, corrugated: 5, hubcap: 6, tire: 7 };
    let sheet = null;
    /** The scrap sheet: albedo, relief and finish (occlusion, roughness, metal) for each cell. */
    function pictures() {
        if (sheet) return sheet;
        const W = 1024, H = 512, S = 256, rgba = new Uint8Array(W * H * 4), orm = new Uint8Array(W * H * 4), height = new Float32Array(W * H);
        const RUST = [0.16, 0.05, 0.016], RUSTD = [0.055, 0.022, 0.01];
        const cellPaint = (cell, u, v) => {
            // u, v 0..1 over the cell; edges are the plate's cut edges; v grows downward.
            const edge = Math.min(u, 1 - u, v, 1 - v), sd = cell * 17 + 3;
            const n1 = fbm2(u * 5, v * 5, sd), n2 = noise2(u * 42, v * 42, sd + 5), n3 = fbm2(u * 11, v * 11, sd + 9), grain = noise2(u * 140, v * 140, sd + 7);
            let rgb, h = 0, r = 0.62, m = 0;
            // Rust: in from the cut edges, in blooms where the paint failed, and run down in streaks below them.
            const streak = noise2(u * 34, v * 2.4, sd + 13) * 0.7 + noise2(u * 70, v * 5, sd + 14) * 0.3;
            const pit = ss(0.55, 0.75, noise2(u * 60, v * 60, sd + 15));
            let rust = ss(0.52, 0.8, n1 * 0.5 + n3 * 0.3 + (1 - ss(0, 0.09, edge)) * 0.55) + ss(0.68, 0.82, streak) * ss(0.25, 0.9, v) * 0.45 * ss(0.4, 0.6, n1);
            // Scratches: short, thin, through the paint.
            let scr = 0;
            for (let k = 0; k < 16; k++) { const a = ihash(k, cell, 1) * Math.PI, ox = ihash(k, cell, 2), oy = ihash(k, cell, 3), L = 0.04 + 0.12 * ihash(k, cell, 4); const dx = u - ox, dy = v - oy, al = dx * Math.cos(a) + dy * Math.sin(a), ac = -dx * Math.sin(a) + dy * Math.cos(a); if (Math.abs(al) < L && Math.abs(ac) < 0.0016) scr = Math.max(scr, (1 - Math.abs(ac) / 0.0016) * (1 - Math.abs(al) / L)); }
            const dent = fbm2(u * 3.5, v * 3.5, sd + 21), ding = ss(0.62, 0.7, noise2(u * 16, v * 16, sd + 23));
            h = 0.7 * (dent - 0.5) - 0.6 * ding;
            const muted = (c, k = 0.55) => { const g = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; return mix(c, [g, g, g], k); };
            switch (cell) {
                case SCRAP.signYellow: {
                    // A diamond warning sign, sun-faded: amber, a black border, a chevron band across it.
                    const x = u - 0.5, y = v - 0.5, dia = Math.abs(x) + Math.abs(y);
                    rgb = muted([0.5, 0.27, 0.025], 0.25);
                    if (dia > 0.42 && dia < 0.47) rgb = [0.02, 0.018, 0.016];
                    if (fract((x * 1.0 + Math.abs(y) * 1.4) * 4.5) < 0.5 && Math.abs(y) < 0.13 && dia < 0.41) rgb = [0.02, 0.018, 0.016];
                    if (dia > 0.47) rgb = muted([0.35, 0.3, 0.2], 0.4);
                    rgb = rgb.map(c => c * (0.9 + 0.12 * grain));
                    r = 0.55; break;
                }
                case SCRAP.signStripe: rgb = fract((u + v * 0.5) * 3) < 0.5 ? muted([0.34, 0.035, 0.025], 0.3) : muted([0.5, 0.48, 0.42], 0.2); r = 0.55; break;
                case SCRAP.panelTeal: rgb = muted([0.03, 0.13, 0.12], 0.35); r = 0.45 + 0.2 * n2; break;
                case SCRAP.panelRed: rgb = muted([0.24, 0.05, 0.03], 0.3); r = 0.48 + 0.2 * n2; break;
                case SCRAP.rust: rgb = [0.12, 0.05, 0.022]; rust = Math.max(rust, 0.55 + 0.35 * n1 + 0.2 * pit); r = 0.8; m = 0.3; h += 0.8 * (pit - 0.5); break;
                case SCRAP.corrugated: { const wave = Math.sin(u * TAU * 7); rgb = [0.22, 0.225, 0.23].map(c => c * (0.85 + 0.15 * wave)); h = 2.2 * wave + 0.3 * (dent - 0.5); r = 0.55; m = 0.8; rust *= 0.8; break; }
                case SCRAP.hubcap: {
                    // A hubcap: radial vents, pressed rings, a raised center; dull and pitted.
                    const x = u - 0.5, y = v - 0.5, rr = Math.hypot(x, y), th = Math.atan2(y, x);
                    rgb = [0.34, 0.34, 0.35]; m = 0.9; r = 0.42 + 0.2 * n2 + 0.1 * grain;
                    h = 1.4 * Math.sin(rr * 60) * ss(0.15, 0.2, rr) * (1 - ss(0.38, 0.42, rr));
                    if (rr > 0.2 && rr < 0.36 && fract(th / TAU * 10) < 0.35) { rgb = [0.025, 0.022, 0.02]; h = -1.5; r = 0.85; m = 0.2; }
                    if (rr < 0.09) { h = 1.2; rgb = [0.38, 0.38, 0.39]; }
                    if (rr > 0.46) { rgb = [0.2, 0.2, 0.2]; h = 0.6; }
                    rust = rust * 0.7 * ss(0.25, 0.5, rr) + 0.2 * ss(0.65, 0.8, n3); break;
                }
                case SCRAP.tire: {
                    // Tire tread: blocks between grooves, a zigzag center rib, dust packed in the grooves.
                    const gx = fract(u * 6), gy = fract(v * 9 + (Math.floor(u * 6) % 2) * 0.5), zig = Math.abs(fract(v * 9) - 0.5) * 0.18;
                    const groove = gx < 0.12 || gy < 0.14 || Math.abs(u - 0.5 - zig + 0.09) < 0.025;
                    rgb = groove ? [0.012, 0.012, 0.013] : [0.034, 0.032, 0.03];
                    rgb = rgb.map(c => c * (0.85 + 0.3 * n2));
                    h = groove ? -1.6 : 0.4 * n2; r = groove ? 0.95 : 0.8 - 0.1 * ss(0.5, 0.9, n3); m = 0; rust = 0;
                    if (groove) rgb = mix(rgb, [0.16, 0.13, 0.09], 0.45 * n1);
                    else rgb = mix(rgb, [0.09, 0.08, 0.065], 0.35 * ss(0.4, 0.9, n3));
                    break;
                }
            }
            if (cell !== SCRAP.tire) {
                // Paint chipped back to bare metal at the edges and in flecks, then rusted.
                const painted = cell !== SCRAP.rust && cell !== SCRAP.corrugated && cell !== SCRAP.hubcap;
                // Chips: small flecks, crowded toward the edges.
                const chip = ss(0.7, 0.74, noise2(u * 48, v * 48, sd + 31) * 0.7 + noise2(u * 9, v * 9, sd + 32) * 0.3 + (1 - ss(0, 0.05, edge)) * 0.3);
                if (painted) { rgb = mix(rgb, [0.11, 0.105, 0.1], chip); if (chip > 0.5) { m = 0.75; r = 0.55; h -= 0.35; } }
                rgb = mix(rgb, mix(mix(RUST, RUSTD, n2 * 0.6 + grain * 0.4), [0.09, 0.06, 0.035], pit * 0.5), Math.min(0.94, rust));
                if (rust > 0.3) { r = Math.max(r, 0.82); m *= 1 - rust; h += 0.6 * (grain - 0.5) * rust; }
                if (scr > 0) { rgb = mix(rgb, [0.4, 0.4, 0.42], scr * 0.55); m = Math.max(m, scr * 0.9); r = Math.min(r, 0.45); }
                // Grime: dark in the dents and settled toward the bottom, dusty in the hollows.
                rgb = rgb.map(c => c * (0.78 + 0.3 * dent) * (1 - 0.3 * ss(0.55, 1, v)) * (1 - 0.25 * ding));
                rgb = mix(rgb, [0.12, 0.1, 0.075], 0.25 * ss(0.5, 0.85, fbm2(u * 7, v * 7, sd + 41)));
            }
            return { rgb, h, r, m };
        };
        const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        for (let cell = 0; cell < 8; cell++) {
            const ox = (cell % 4) * S, oy = Math.floor(cell / 4) * S;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                const d = cellPaint(cell, (x + 0.5) / S, (y + 0.5) / S), o = (oy + y) * W + ox + x;
                rgba.set([toByte(d.rgb[0]), toByte(d.rgb[1]), toByte(d.rgb[2]), 255], o * 4);
                orm.set([255, Math.round(clamp01(d.r) * 255), Math.round(clamp01(d.m) * 255), 255], o * 4);
                height[o] = d.h;
            }
        }
        const nrm = new Uint8Array(W * H * 4);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const o = y * W + x, hx = (height[y * W + Math.min(W - 1, x + 1)] - height[y * W + Math.max(0, x - 1)]) * 0.6, hy = (height[Math.min(H - 1, y + 1) * W + x] - height[Math.max(0, y - 1) * W + x]) * 0.6, l = Math.hypot(hx, hy, 1);
            nrm.set([Math.round(127.5 - 127.5 * hx / l), Math.round(127.5 + 127.5 * hy / l), Math.round(127.5 + 127.5 / l), 255], o * 4);
        }
        sheet = {
            albedo: { name: 'scrap-sheet.png', width: W, height: H, data: rgba },
            normal: { name: 'scrap-sheet-n.png', width: W, height: H, data: nrm },
            finish: { name: 'scrap-sheet-orm.png', width: W, height: H, data: orm }
        };
        return sheet;
    }
    /** Texture coordinates of a point (u, v in 0..1) in a scrap cell, kept off the cell's border. */
    const cellUv = (cell, u, v) => [((cell % 4) + 0.02 + 0.96 * clamp01(u)) / 4, (Math.floor(cell / 4) + 0.02 + 0.96 * clamp01(v)) / 2];

    /**
     * A fitted plate on the trunk between bearings a0..a1 and heights y0..y1 (`gap` off the surface
     * under it, `thick` meters), its cut edges ragged by `rag`, in a scrap cell. Its edges and back
     * are the cell's border color; returns its outline (outer points) for rivets.
     */
    function trunkPlate(C, m, { a0, a1, y0, y1, gap, thick = 0.003, cell, rag = 0.004, seed = 1, bulge = 0, cols = 10, rows = 8, skin, color = [1, 1, 1], shape = null }) {
        const s = C.s, grid = [], inner = [];
        for (let r = 0; r <= rows; r++) {
            const row = [], back = [];
            for (let k = 0; k <= cols; k++) {
                const u = k / cols, v = r / rows;
                let a = a0 + (a1 - a0) * u, y = y0 + (y1 - y0) * v;
                // Torn, hammered edges: the border points moved in by a little noise.
                const border = r === 0 || r === rows || k === 0 || k === cols;
                if (border) {
                    const jag = rag * s * (noise2(u * 9 + seed, v * 9, seed) - 0.5) * 2;
                    if (r === 0) y += Math.abs(jag); if (r === rows) y -= Math.abs(jag);
                    if (k === 0) a += Math.abs(jag) / 0.13; if (k === cols) a -= Math.abs(jag) / 0.13;
                }
                if (shape) [a, y] = shape(a, y, u, v);
                const lift = gap + bulge * s * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
                const p = C.radialAt(a, y, lift + thick), q = C.radialAt(a, y, lift);
                row.push(p); back.push(q);
            }
            grid.push(row); inner.push(back);
        }
        const center = C.axisAt((y0 + y1) / 2), inside = p => [center[0], p[1], center[2]];
        // The cell at the plate's own proportions (a long lame takes a long strip of it, never a stretched cell).
        const wide = Math.abs(a1 - a0) * 0.135 * s, tall = Math.abs(y1 - y0), su = Math.min(1, wide / tall), sv = Math.min(1, tall / wide), ou = (1 - su) * fract(seed * 0.37), ov = (1 - sv) * fract(seed * 0.61);
        m.grid(grid, color, skin, inside, { uvAt: (r, k) => cellUv(cell, ou + su * k / cols, ov + sv * (1 - r / rows)) });
        // Its cut edge: a wall round the border (the cell's edge color: chipped, rusted).
        const ring = [];
        for (let k = 0; k <= cols; k++) ring.push([0, k]);
        for (let r = 1; r <= rows; r++) ring.push([r, cols]);
        for (let k = cols - 1; k >= 0; k--) ring.push([rows, k]);
        for (let r = rows - 1; r > 0; r--) ring.push([r, 0]);
        const wall = [ring.map(([r, k]) => grid[r][k]), ring.map(([r, k]) => inner[r][k])];
        m.grid(wall, tone(color, 0.85), skin, p => { const c = C.axisAt(p[1]); return lerp([c[0], p[1], c[2]], p, 0.5); }, { closed: true, uvAt: (r, k) => cellUv(cell, 0.01, 0.99) });
        // The back, dark.
        m.grid(inner, tone(color, 0.35), skin, p => add(p, mul(sub(p, inside(p)), 2)), { uvAt: (r, k) => cellUv(cell, 0.01, 0.99) });
        return { grid, rows, cols };
    }
    // Small rigid hardware (rivets, bolts, buckles), vertex-colored metal.
    function rivet(m, at, normal, r, color, skin) {
        const x = norm(cross(normal, Math.abs(normal[1]) < 0.9 ? Y : [1, 0, 0])), y = cross(normal, x), base = m.p.length / 3;
        const ring = (h, k) => Array.from({ length: 5 }, (_, i) => add(add(at, mul(normal, h)), add(mul(x, Math.cos(i / 5 * TAU) * k), mul(y, Math.sin(i / 5 * TAU) * k))));
        m.grid([ring(-r * 0.3, r), ring(r * 0.5, r * 0.62)], color, skin, () => sub(at, mul(normal, r * 2)), { closed: true });
        m.disc(add(at, mul(normal, r * 0.62)), normal, r * 0.62, tone(color, 1.12), skin, 5);
        return base;
    }
    function buckle(m, center, a, b, w, h, bar, normal, color, skin) {
        const ring = (dw, dh, lift) => [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([x, y]) => add(add(center, mul(normal, lift)), add(mul(a, x * (w / 2 + dw)), mul(b, y * (h / 2 + dh)))));
        const rows = [ring(0, 0, 0), ring(0, 0, bar), ring(-bar, -bar, bar), ring(-bar, -bar, 0)];
        m.grid(rows.concat([rows[0]]), color, skin, () => sub(center, mul(normal, bar * 4)), { closed: true });
        m.tube([add(add(center, mul(b, h * 0.45)), mul(normal, bar)), add(add(center, mul(b, -h * 0.4)), mul(normal, bar * 1.6))], bar * 0.45, 5, tone(color, 1.1), skin, { caps: false });
    }

    // ── the gear ──────────────────────────────────────────────────────────
    /** A soft pouch hung at `at` facing `out` (up the body `up`): a rounded body, a flap over its top and a snap. */
    function pouch(cloth, metal, at, out, up, w, h, d, color, skin, snap) {
        const side = norm(cross(up, out)), axes = [side, up, out];
        cloth.box(add(at, mul(out, d / 2)), axes, [w / 2, h / 2, d / 2], Math.min(w, d) * 0.3, color, skin, 2);
        // The flap: over the top and down a third of the front.
        const flapC = tone(color, 0.9);
        cloth.box(add(add(at, mul(out, d * 0.55)), mul(up, h * 0.36)), axes, [w / 2 * 1.04, h * 0.17, d * 0.52], 0.004, flapC, skin, 2);
        rivet(metal, add(add(at, mul(out, d + 0.0015)), mul(up, h * 0.22)), out, 0.004, snap, skin);
    }
    /** A canister: a cylinder with a ribbed cap and a domed end, along `axis`. */
    /** A canister: a flask with a rounded base, a shoulder, a neck and a screw cap, a band round its middle; along `axis`. */
    function canister(m, metal, center, axis, r, length, color, capColor, skin) {
        const a = sub(center, mul(axis, length / 2)), at = t => add(a, mul(axis, length * t));
        const profile = [[0, 0.55], [0.02, 0.86], [0.06, 1], [0.4, 1], [0.42, 1.03], [0.5, 1.03], [0.52, 1], [0.72, 1], [0.8, 0.82], [0.84, 0.48], [0.86, 0.46]];
        m.tube(profile.map(([t]) => at(t)), u => r * profile[Math.round(u * (profile.length - 1))][1], 10, color, skin, { colorAt: u => (u > 0.38 && u < 0.52 ? tone(color, 0.72) : color) });
        metal.tube([at(0.85), at(0.9), at(1)], u => r * (u < 0.3 ? 0.56 : 0.6), 10, capColor, skin);
    }

    /** Scrap chest armor (style: plates, tire, sign), strapped over the shoulders and round the ribs. */
    function scrapArmor(C, item, out) {
        const s = C.s, style = item.style || 'plates', m = new GearMesh(), hw = new GearMesh(), straps = new GearMesh(), rand = stream(13 + (item.wearSeed | 0));
        const skin = p => C.skinAt(p, true), neckY = C.neck[1], hipY = C.hips[1], span = neckY - hipY;
        const strapC = linear(item.color2 || '#3a2a1c'), metalC = linear(item.trim || '#6d6a64');
        const chestTop = neckY - span * 0.12, chestLow = hipY + span * 0.42;
        const rivets = (grid, every = 2, inset = 1) => {
            const R = grid.length - 1, K = grid[0].length - 1;
            for (let k = inset; k <= K - inset; k += every) for (const r of [inset, R - inset]) { const p = grid[r][k], nn = norm(sub(p, C.axisAt(p[1]))); rivet(hw, add(p, mul(nn, 0.0005 * s)), nn, 0.0045 * s, metalC, skin); }
            for (let r = inset + every; r <= R - inset - 1; r += every) for (const k of [inset, K - inset]) { const p = grid[r][k], nn = norm(sub(p, C.axisAt(p[1]))); rivet(hw, add(p, mul(nn, 0.0005 * s)), nn, 0.0042 * s, metalC, skin); }
        };
        if (style === 'tire') {
            // A slab cut from a truck tire: tread out, its sidewall's rounded shoulders at the edges.
            const front = trunkPlate(C, m, { a0: -0.95, a1: 0.95, y0: chestLow - span * 0.06, y1: chestTop, gap: 0.012 * s, thick: 0.011 * s, cell: SCRAP.tire, rag: 0.002, seed: 3, bulge: 0.006, cols: 14, rows: 10, skin,
                shape: (a, y, u, v) => [a * (1 - 0.18 * ss(0.65, 1, v)), y] });
            rivets(front.grid, 3, 1);
            const back = trunkPlate(C, m, { a0: Math.PI - 0.85, a1: Math.PI + 0.85, y0: chestLow, y1: chestTop - span * 0.02, gap: 0.012 * s, thick: 0.01 * s, cell: SCRAP.tire, rag: 0.002, seed: 4, cols: 12, rows: 9, skin });
            rivets(back.grid, 3, 1);
            // A belly guard: a second, narrower strip of tread under it.
            const belly = trunkPlate(C, m, { a0: -0.7, a1: 0.7, y0: hipY + span * 0.16, y1: chestLow - span * 0.02, gap: 0.016 * s, thick: 0.009 * s, cell: SCRAP.tire, rag: 0.002, seed: 5, cols: 10, rows: 4, skin });
            rivets(belly.grid, 3, 1);
        } else if (style === 'sign') {
            // A road sign bent round the chest, bolted at its corners; a corrugated sheet behind.
            const front = trunkPlate(C, m, { a0: -1.0, a1: 1.0, y0: chestLow - span * 0.05, y1: chestTop, gap: 0.012 * s, thick: 0.0025 * s, cell: SCRAP.signStripe, rag: 0.003, seed: 7, cols: 14, rows: 10, skin, bulge: 0.004 });
            for (const [r, k] of [[1, 1], [1, 13], [9, 1], [9, 13], [5, 1], [5, 13]]) { const p = front.grid[r][k], nn = norm(sub(p, C.axisAt(p[1]))); rivet(hw, p, nn, 0.006 * s, metalC, skin); }
            const back = trunkPlate(C, m, { a0: Math.PI - 0.9, a1: Math.PI + 0.9, y0: chestLow, y1: chestTop, gap: 0.012 * s, thick: 0.002 * s, cell: SCRAP.corrugated, rag: 0.004, seed: 8, cols: 12, rows: 9, skin });
            rivets(back.grid, 3, 1);
        } else {
            // Mismatched plates riveted over one another: a warning sign over the heart, panels from a
            // car's doors either side, rusted lames over the belly, a corrugated back plate.
            const layer = (k) => 0.013 * s + k * 0.0055 * s;
            const pl = [
                { a0: 0.05, a1: 0.95, y0: hipY + span * 0.55, y1: chestTop, cell: SCRAP.panelTeal, k: 0, seed: 11 },
                { a0: -0.95, a1: -0.02, y0: hipY + span * 0.5, y1: chestTop - span * 0.03, cell: SCRAP.panelRed, k: 1, seed: 12 },
                { a0: -0.42, a1: 0.42, y0: hipY + span * 0.6, y1: chestTop - span * 0.05, cell: SCRAP.signYellow, k: 2, seed: 13 },
                { a0: -0.85, a1: 0.85, y0: hipY + span * 0.36, y1: hipY + span * 0.56, cell: SCRAP.rust, k: 1, seed: 14 },
                { a0: -0.8, a1: 0.8, y0: hipY + span * 0.18, y1: hipY + span * 0.38, cell: SCRAP.rust, k: 2, seed: 15 },
                { a0: Math.PI - 0.95, a1: Math.PI + 0.95, y0: hipY + span * 0.4, y1: chestTop - span * 0.02, cell: SCRAP.corrugated, k: 0, seed: 16 }
            ];
            for (const q of pl) {
                // Each plate a little askew, as it was cut and hammered on.
                const skew = (rand() - 0.5) * 0.5, mid = (q.y0 + q.y1) / 2;
                const made = trunkPlate(C, m, { a0: q.a0, a1: q.a1, y0: q.y0, y1: q.y1, gap: layer(q.k), thick: 0.003 * s, cell: q.cell, rag: 0.007, seed: q.seed, cols: 10, rows: 7, skin, bulge: 0.004,
                    shape: (a, y) => [a + (y - mid) * skew * 4, y + Math.sin(a * 2 + q.seed) * 0.006 * s] });
                rivets(made.grid, 3, 1);
            }
        }
        // Straps: over each shoulder, front to back; round each side under the arm, buckled.
        const top = chestTop - span * 0.02, w = 0.032 * s, th = 0.003 * s;
        for (const sx of [-1, 1]) {
            const x = sx * 0.085 * s;
            const front = C.radialAt(sx * 0.55, top, 0.016 * s), back = C.radialAt(Math.PI - sx * 0.55, top, 0.016 * s);
            const over = shoulderPath(C, (front[0] + back[0]) / 2 + sx * 0.01 * s, front[2] - 0.01 * s, back[2] + 0.01 * s, 0.006 * s, 0.012 * s);
            const path = [{ p: front, n: C.radialNormal(sx * 0.55, top) }, ...over, { p: back, n: C.radialNormal(Math.PI - sx * 0.55, top) }];
            strap(straps, path, w, th, strapC, skin);
            const side = trunkPath(C, [[sx * 0.95, hipY + span * 0.62], [sx * Math.PI / 2, hipY + span * 0.6], [sx * (Math.PI - 0.9), hipY + span * 0.62]], 0.02 * s, 0.015 * s);
            strap(straps, side, w * 0.9, th, strapC, skin);
            const mid = side[Math.floor(side.length * 0.35)], tng = norm(sub(side[Math.min(side.length - 1, Math.floor(side.length * 0.35) + 1)].p, mid.p));
            buckle(hw, add(mid.p, mul(mid.n, th + 0.001 * s)), tng, norm(cross(mid.n, tng)), 0.022 * s, 0.03 * s, 0.0028 * s, mid.n, metalC, skin);
        }
        const parts = [];
        const sh = pictures();
        if (!m.empty) parts.push(Object.assign(m.part('Scrap armor plates', { texture: sh.albedo.name, keepColors: true, roughness: 1, metalness: 1, trunkGear: true }),
            { normalTexture: sh.normal.name, normalTexCoord: 1, normalScale: 1, metallicRoughnessTexture: sh.finish.name, metallicRoughnessTexCoord: 1 }));
        if (!straps.empty) parts.push(fabricPart(straps, 'Scrap armor straps', 'leatherWorn', 0.7, item));
        if (!hw.empty) parts.push(hw.part('Scrap armor rivets', { roughness: 0.45, metalness: 0.8 }));
        for (const p of parts) if (p.uvs && p.texture === sh.albedo.name) p.uvs1 = Float32Array.from(p.uvs);
        out.textures.push(sh.albedo, sh.normal, sh.finish);
        return parts;
    }

    /** A part on a cloth or leather tile (RRCharacterFabric) in meters along its own coordinates, vertex-colored. */
    function fabricPart(mesh, name, kind, roughness, item) {
        const Fabric = need('RRCharacterFabric', './CharacterFabric.js');
        const part = mesh.part(name, { roughness, metalness: 0 });
        if (Fabric) {
            const t = Fabric.tile(kind);
            if (t) { part.uvs1 = Float32Array.from(mesh.uv, (v, i) => v / t.span[i % 2]); Fabric.applyTo(part, kind, null, { uvs1: part.uvs1, roughness }); part.fabricTile = kind; }
        }
        // Its color is in its vertices: a sheen without a picture of its own would wash it white.
        delete part.sheen;
        return part;
    }

    /** The parts' tile pictures (RRCharacterFabric), for the outfit's textures. */
    function tilePictures(parts) {
        const Fabric = need('RRCharacterFabric', './CharacterFabric.js'), out = [];
        for (const p of parts) if (p.fabricTile && Fabric) { const t = Fabric.tile(p.fabricTile); for (const pic of [t.normal, t.orm]) if (!out.includes(pic)) out.push(pic); }
        return out;
    }

    /** A bandolier of canisters from the left shoulder to the right hip, or a chest harness of pouches. */
    function harness(C, item, out) {
        const s = C.s, style = item.style || 'bandolier', webbing = new GearMesh(), cans = new GearMesh(), metal = new GearMesh();
        const skin = p => C.skinAt(p, true), neckY = C.neck[1], hipY = C.hips[1], span = neckY - hipY;
        const color = linear(item.color || '#4b4632'), accent = linear(item.color2 || '#6b5a3a'), metalC = linear(item.trim || '#77746a'), rand = stream(97 + (item.wearSeed | 0));
        const gap = 0.012 * s, w = 0.05 * s, th = 0.0035 * s, step = 0.014 * s;
        if (style === 'bandolier') {
            const hi = neckY - span * 0.09, lo = hipY + span * 0.08;
            // Front: from the left shoulder down across the chest to the right hip; behind, back up.
            const front = trunkPath(C, [[0.5, hi], [0.05, hipY + span * 0.62], [-0.75, hipY + span * 0.3], [-1.35, lo]], gap, step);
            const back = trunkPath(C, [[-1.35, lo], [-1.9, lo + span * 0.02], [-2.5, hipY + span * 0.3], [-3.2, hipY + span * 0.65], [-3.75, hi]], gap, step);
            strap(webbing, front, w, th, color, skin);
            strap(webbing, back, w, th, color, skin);
            const a = front[0].p, b = back[back.length - 1].p;
            strap(webbing, shoulderPath(C, (a[0] + b[0]) / 2, a[2], b[2], 0.006 * s, step), w * 0.95, th, color, skin);
            // Canisters held across the strap by loops: a fuel flask, water, a medicine tin; screw caps.
            const tints = ['#6a2218', '#8c8a84', '#4d5a3a', '#3a4a52', '#7a6a4a'].map(linear);
            let k = 0;
            for (let i = 5; i < front.length - 7; i += 7, k++) {
                const q = front[i], t = norm(sub(front[i + 1].p, front[i - 1].p)), across = norm(cross(q.n, t));
                const r = (0.015 + 0.004 * rand()) * s, L = (0.075 + 0.02 * rand()) * s, center = add(q.p, mul(q.n, th + r + 0.0005 * s));
                canister(cans, metal, center, mul(across, k % 2 ? 1 : -1), r, L, tints[k % tints.length], linear('#2a2826'), skin);
                // The elastic loop over it.
                const loop = [];
                for (let j = 0; j <= 10; j++) { const ang = Math.PI * j / 10; loop.push(add(add(center, mul(t, Math.cos(ang) * (r + 0.0012 * s) * 0)), add(mul(q.n, Math.sin(ang) * (r + 0.0012 * s) - 0 * r), mul(t, Math.cos(ang) * (r + 0.0012 * s))))); }
                strap(webbing, loop.map(p => ({ p, n: norm(sub(p, center)) })), 0.016 * s, 0.0015 * s, tone(color, 0.85), skin);
            }
            // A pouch at the hip end.
            const hp = front[front.length - 3], up = norm(sub(front[front.length - 6].p, hp.p));
            pouch(webbing, metal, add(hp.p, mul(hp.n, th)), hp.n, up, 0.075 * s, 0.085 * s, 0.035 * s, accent, C.skinAt(hp.p, true), metalC);
        } else {
            // A chest harness: two shoulder straps to a pouch panel at the chest, side straps round to the
            // back where the shoulder straps cross.
            const panelY = hipY + span * 0.5, top = neckY - span * 0.1;
            const panel = trunkPlateSoft(C, webbing, { a0: -0.75, a1: 0.75, y0: panelY - span * 0.12, y1: panelY + span * 0.12, gap: 0.006 * s, thick: 0.006 * s, color: tone(color, 0.95), skin });
            const pouches = [-0.48, 0, 0.48];
            for (const a of pouches) {
                const p = C.radialAt(a, panelY - span * 0.02, 0.012 * s), n = C.radialNormal(a, panelY);
                pouch(webbing, metal, p, n, Y, 0.072 * s, 0.09 * s, 0.032 * s, a === 0 ? accent : color, C.skinAt(p, true), metalC);
            }
            for (const sx of [-1, 1]) {
                const front = trunkPath(C, [[sx * 0.42, panelY + span * 0.1], [sx * 0.45, top]], gap, step);
                strap(webbing, front, 0.042 * s, th, color, skin);
                const back = trunkPath(C, [[Math.PI - sx * 0.45, top], [Math.PI + sx * 0.1, hipY + span * 0.62], [Math.PI + sx * 0.75, panelY - span * 0.1]], gap + 0.002 * s * (sx > 0 ? 1 : 0), step);
                strap(webbing, back, 0.042 * s, th, color, skin);
                const a = front[front.length - 1].p, b = back[0].p;
                strap(webbing, shoulderPath(C, (a[0] + b[0]) / 2, a[2], b[2], 0.006 * s, step), 0.042 * s, th, color, skin);
                const side = trunkPath(C, [[sx * 0.74, panelY - span * 0.06], [sx * Math.PI / 2, panelY - span * 0.08], [sx * (Math.PI - 0.75), panelY - span * 0.1]], gap, step);
                strap(webbing, side, 0.03 * s, th, color, skin);
                const mid = side[3], tng = norm(sub(side[4].p, side[2].p));
                buckle(metal, add(mid.p, mul(mid.n, th + 0.001 * s)), tng, norm(cross(mid.n, tng)), 0.026 * s, 0.032 * s, 0.003 * s, mid.n, metalC, skin);
            }
            // Two canisters strapped upright beside the pouches.
            for (const sx of [-1, 1]) { const p = C.radialAt(sx * 0.88, panelY + span * 0.02, gap + 0.018 * s); canister(cans, metal, p, Y, 0.015 * s, 0.08 * s, linear(sx > 0 ? '#6a2218' : '#8c8a84'), linear('#2a2826'), C.skinAt(p, true)); }
            void panel;
        }
        const parts = [fabricPart(webbing, style === 'bandolier' ? 'Bandolier webbing' : 'Chest harness webbing', 'canvasWorn', 0.88, item)];
        if (!cans.empty) parts.push(cans.part('Harness canisters', { roughness: 0.45, metalness: 0.55 }));
        if (!metal.empty) parts.push(metal.part('Harness hardware', { roughness: 0.42, metalness: 0.8 }));
        for (const p of parts) p.trunkGear = true;
        return parts;
    }
    /** A soft padded panel on the trunk (no texture cell): a fitted sheet with a wall. */
    function trunkPlateSoft(C, m, { a0, a1, y0, y1, gap, thick, color, skin }) {
        const rows = 4, cols = 12, grid = [], inner = [];
        for (let r = 0; r <= rows; r++) { const row = [], back = []; for (let k = 0; k <= cols; k++) { const a = a0 + (a1 - a0) * k / cols, y = y0 + (y1 - y0) * r / rows; row.push(C.radialAt(a, y, gap + thick)); back.push(C.radialAt(a, y, gap)); } grid.push(row); inner.push(back); }
        const c = C.axisAt((y0 + y1) / 2);
        m.grid(grid, color, skin, p => [c[0], p[1], c[2]], { uvAt: (r, k) => [k * (a1 - a0) * 0.13 / cols, r * (y1 - y0) / rows] });
        const ring = [];
        for (let k = 0; k <= cols; k++) ring.push([0, k]); for (let r = 1; r <= rows; r++) ring.push([r, cols]); for (let k = cols - 1; k >= 0; k--) ring.push([rows, k]); for (let r = rows - 1; r > 0; r--) ring.push([r, 0]);
        m.grid([ring.map(([r, k]) => grid[r][k]), ring.map(([r, k]) => inner[r][k])], tone(color, 0.85), skin, p => { const q = C.axisAt(p[1]); return lerp([q[0], p[1], q[2]], p, 0.5); }, { closed: true });
        return grid;
    }

    /** A wide belt round the hips with its pouches and tools. */
    function toolBelt(C, item, out) {
        const s = C.s, belt = new GearMesh(), metal = new GearMesh(), tools = new GearMesh(), leather = new GearMesh(), rag = new GearMesh();
        const hipY = C.hips[1], span = C.neck[1] - hipY, y = hipY + span * 0.1, color = linear(item.color || '#4a3424'), accent = linear(item.color2 || '#5c5a44'), metalC = linear(item.trim || '#8a8678');
        const skin = p => C.skinAt(p, true), gap = 0.006 * s, w = 0.05 * s, th = 0.0045 * s;
        const loop = trunkPath(C, [[-Math.PI + 0.001, y + 0.006 * s], [-1.6, y + 0.003 * s], [0, y - 0.008 * s], [1.6, y + 0.003 * s], [Math.PI - 0.001, y + 0.006 * s]], gap, 0.012 * s);
        strap(leather, loop.concat([loop[0]]), w, th, color, skin);
        // The buckle at the front, a little to the left; a tail of belt through it.
        const front = C.radialAt(0.12, y - 0.006 * s, gap + th), fn = C.radialNormal(0.12, y);
        const side = norm(cross(Y, fn));
        buckle(metal, add(front, mul(fn, 0.0012 * s)), side, Y, 0.045 * s, 0.058 * s, 0.004 * s, fn, metalC, C.skinAt(front, true));
        const at = (a, dy = 0, lift = 0) => { const p = C.radialAt(a, y + dy, gap + th + lift), n = C.radialNormal(a, y + dy); return { p, n, skin: C.skinAt(p, true), side: norm(cross(Y, n)) }; };
        // Pouches on both hips.
        for (const a of [1.15, -1.05]) { const q = at(a, -0.05 * s); pouch(belt, metal, q.p, q.n, Y, 0.085 * s, 0.1 * s, 0.04 * s, accent, q.skin, metalC); }
        // A wrench hung through a loop: a flat bar with an open jaw at each end.
        { const q = at(-0.55, -0.02 * s, 0.004 * s), down = norm(add(mul(Y, -1), mul(q.side, 0.25))), L = 0.17 * s;
            const a = add(q.p, mul(down, 0.01 * s)), b = add(a, mul(down, L)), wdir = norm(cross(down, q.n));
            tools.box(lerp(a, b, 0.5), [wdir, down, q.n], [0.0085 * s, L / 2, 0.0035 * s], 0.002 * s, linear('#6a6c70'), q.skin);
            for (const [end, k] of [[a, -1], [b, 1]]) {
                const c = add(end, mul(down, k * 0.012 * s));
                for (const sx of [-1, 1]) tools.box(add(c, mul(wdir, sx * 0.01 * s)), [wdir, down, q.n], [0.004 * s, 0.014 * s, 0.004 * s], 0.0015 * s, linear('#727478'), q.skin);
            }
            strap(leather, [-0.03, -0.01, 0.01, 0.03].map(t => ({ p: add(add(q.p, mul(Y, 0.004 * s)), mul(q.side, t * s)), n: q.n })), 0.014 * s, 0.002 * s, tone(color, 0.85), q.skin); }
        // A screwdriver upright in a loop.
        { const q = at(0.62, -0.01 * s, 0.003 * s), up = Y;
            const base = add(q.p, mul(q.n, 0.008 * s));
            tools.tube([add(base, mul(up, 0.01 * s)), add(base, mul(up, 0.075 * s))], 0.009 * s, 8, linear('#8a2018'), q.skin);
            tools.tube([add(base, mul(up, 0.01 * s)), add(base, mul(up, -0.09 * s))], 0.0028 * s, 6, linear('#8c8e92'), q.skin);
            strap(leather, [-0.016, -0.006, 0.006, 0.016].map(t => ({ p: add(add(q.p, mul(Y, 0.02 * s)), mul(q.side, t * s)), n: q.n })), 0.018 * s, 0.002 * s, tone(color, 0.85), q.skin); }
        // A hand lamp clipped across the side.
        { const q = at(1.75, 0.01 * s, 0.01 * s), along = q.side;
            tools.tube([add(q.p, mul(along, -0.05 * s)), add(q.p, mul(along, 0.04 * s)), add(q.p, mul(along, 0.055 * s))], t => (t > 0.6 ? 0.017 : 0.013) * s, 10, linear('#3a3d36'), q.skin);
            tools.disc(add(q.p, mul(along, 0.0555 * s)), along, 0.0145 * s, linear('#c8c4a0'), q.skin, 12); }
        // A canteen behind on the right in its cloth cover, its cap on a chain.
        { const q = at(-2.35, -0.08 * s, 0.005 * s), c = add(q.p, mul(q.n, 0.03 * s));
            const rows = [];
            for (let r = 0; r <= 8; r++) { const t = r / 8, yy = (t - 0.5) * 0.15 * s, rr = Math.sqrt(Math.max(0.02, 1 - (2 * t - 1) ** 4)); rows.push(Array.from({ length: 14 }, (_, k) => { const ang = k / 14 * TAU; return add(add(c, mul(Y, yy)), add(mul(q.side, Math.cos(ang) * 0.065 * s * rr), mul(q.n, Math.sin(ang) * 0.028 * s * rr))); })); }
            belt.grid(rows, tone(accent, 0.85), q.skin, () => c, { closed: true });
            metal.tube([add(c, mul(Y, 0.075 * s)), add(c, mul(Y, 0.095 * s))], 0.012 * s, 10, metalC, q.skin); }
        // A rag tucked under the belt behind on the left, hanging.
        { const q = at(2.45, 0.0, 0.002 * s), rows = [];
            for (let r = 0; r <= 6; r++) { const t = r / 6; rows.push([-1, 0, 1].map(k => add(add(add(q.p, mul(Y, 0.02 * s - t * 0.2 * s)), mul(q.side, k * (0.04 + 0.01 * t) * s)), mul(q.n, (0.004 + 0.03 * t * t + 0.006 * Math.sin(k * 2 + t * 5)) * s)))); }
            rag.grid(rows, linear(item.ragColor || '#7a2a20'), q.skin, () => sub(q.p, mul(q.n, 0.1)), { uvAt: (r, k) => [k * 0.25, r / 6 * 0.4] }); }
        const parts = [fabricPart(leather, 'Utility belt', 'leatherWorn', 0.6, item), fabricPart(belt, 'Utility belt pouches', 'canvasWorn', 0.88, item)];
        if (!tools.empty) parts.push(tools.part('Belt tools', { roughness: 0.45, metalness: 0.6 }));
        if (!metal.empty) parts.push(metal.part('Belt hardware', { roughness: 0.4, metalness: 0.85 }));
        if (!rag.empty) { const W = need('RRCharacterWear', './CharacterWear.js'), pic = W && W.pictures().fray; parts.push(rag.part('Belt rag', Object.assign({ roughness: 0.95, metalness: 0, doubleSided: true }, pic ? { texture: pic.name, keepColors: true, cutout: true, alphaCutoff: 0.45 } : {}))); if (pic) out.textures.push(pic); }
        for (const p of parts) p.trunkGear = true;
        return parts;
    }

    /** Rag strips wound round each boot's shaft, a knot and two ends hanging. */
    function bootWraps(C, item, out, shoeParts) {
        const s = C.s, m = new GearMesh(), color = linear(item.color2 || '#7a6a50'), rand = stream(5 + (item.wearSeed | 0));
        const boots = shoeParts.filter(p => p.wastelandBoot === item.id || p.name === (item.label || ''));
        const source = boots.length ? boots : shoeParts.filter(p => /boot/i.test(p.name));
        for (const side of ['Left', 'Right']) {
            const knee = C.bone(side + 'Leg').head, ankle = C.bone(side + 'Foot').head, axis = norm(sub(knee, ankle));
            const pts = [];
            for (const p of source) for (let v = 0; v < p.positions.length / 3; v++) { const q = [p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]]; const d = sub(q, ankle), along = dot(d, axis); if (along < -0.02 * s || along > len(sub(knee, ankle))) continue; const rad = sub(d, mul(axis, along)); if (len(rad) < 0.12 * s) pts.push([along, rad]); }
            if (!pts.length) continue;
            const top = Math.max(...pts.map(q => q[0])), lo = 0.035 * s, hi = top - 0.012 * s;
            if (hi <= lo) continue;
            const front = norm(sub([0, 0, 1], mul(axis, axis[2]))), sideV = norm(cross(axis, front));
            const radiusAt = (h, ang) => { const dir = add(mul(front, Math.cos(ang)), mul(sideV, Math.sin(ang))); let r = 0.03 * s; for (const [along, rad] of pts) if (Math.abs(along - h) < 0.012 * s && dot(norm(rad), dir) > 0.92) r = Math.max(r, dot(rad, dir)); return r; };
            const skin = p => C.skinAt(p, false);
            // A spiral strip, two and a half turns, each turn overlapping the last.
            const turns = 3.1, N = 66, path = [];
            for (let i = 0; i <= N; i++) {
                const t = i / N, h = hi - (hi - lo) * t, ang = t * turns * TAU + (side === 'Left' ? 0 : Math.PI);
                const r = radiusAt(h, ang) + 0.004 * s, dir = add(mul(front, Math.cos(ang)), mul(sideV, Math.sin(ang)));
                path.push({ p: add(add(ankle, mul(axis, h)), mul(dir, r)), n: dir });
            }
            // Smooth the radius along the strip so it does not follow every lace.
            for (let pass = 0; pass < 3; pass++) for (let i = 1; i < N; i++) { const a = path[i - 1].p, b = path[i + 1].p, c = path[i].p; const mid = lerp(a, b, 0.5); const out2 = dot(sub(mid, c), path[i].n); if (out2 > 0) path[i].p = add(c, mul(path[i].n, out2)); }
            roll(m, path.map(q => ({ p: q.p, n: q.n })), 0.034 * s, 0.006 * s, color, skin);
            // The knot and its two ends.
            const k = path[Math.floor(N * 0.12)], kn = k.n;
            m.box(add(k.p, mul(kn, 0.008 * s)), [norm(cross(axis, kn)), axis, kn], [0.012 * s, 0.01 * s, 0.006 * s], 0.004 * s, tone(color, 0.9), skin(k.p));
            for (const off of [-1, 1]) {
                const rows = [];
                for (let r = 0; r <= 4; r++) { const t = r / 4, base = add(add(k.p, mul(kn, (0.012 + 0.012 * t) * s)), mul(axis, -t * (0.06 + 0.02 * rand()) * s)); const across = norm(cross(axis, kn)); rows.push([add(base, mul(across, (off * 0.004 - 0.008) * s)), add(base, mul(across, (off * 0.004 + 0.008) * s))]); }
                m.grid(rows, tone(color, 0.95), skin(k.p), () => k.p, {});
            }
        }
        if (m.empty) return [];
        const part = fabricPart(m, 'Boot wraps', 'burlap', 0.95, item);
        part.doubleSided = true; part.limb = true;
        return [part];
    }

    // ── head gear ─────────────────────────────────────────────────────────
    /** The head measured: eyes, brow, nose, mouth, chin; its sections round a vertical axis. */
    function headFrame(C) {
        const Props = need('RRCharacterProps', './CharacterProps.js');
        const L = Props.landmarks(C.pack, C.built), s = C.s;
        const headPts = [];
        const body = C.built.parts[0], src = C.pack.body.source, an = C.an;
        for (let v = 0; v < body.positions.length / 3; v++) if (an.member[src[v] * 5] > 0.6 && an.s[src[v] * 5] > 4.3) headPts.push([body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]]);
        const eyeY = (L.eyeL.center[1] + L.eyeR.center[1]) / 2;
        const ys = headPts.map(p => p[1]), crown = Math.max(...ys);
        const cx = headPts.reduce((a, p) => a + p[0], 0) / headPts.length;
        const back = Math.min(...headPts.filter(p => Math.abs(p[1] - eyeY) < 0.02 * s).map(p => p[2]));
        const frontZ = Math.max(...headPts.filter(p => Math.abs(p[1] - eyeY) < 0.02 * s && Math.abs(p[0] - cx) < 0.03 * s).map(p => p[2]));
        const cz = (back + frontZ) / 2 - 0.006 * s;
        // Radial extent of the head and neck by bearing and height round (cx, cz).
        const A = 72, y0 = L.chin - 0.06 * s, y1 = crown + 0.002, dy = 0.006 * s, H = Math.ceil((y1 - y0) / dy) + 1, R = new Float32Array(A * H);
        for (const p of headPts) { if (p[1] < y0 || p[1] > y1) continue; const a = Math.floor(((Math.atan2(p[0] - cx, p[2] - cz) / TAU) % 1 + 1) % 1 * A) % A, h = Math.round((p[1] - y0) / dy); R[h * A + a] = Math.max(R[h * A + a], Math.hypot(p[0] - cx, p[2] - cz)); }
        for (let pass = 0; pass < 10; pass++) for (let h = 0; h < H; h++) for (let a = 0; a < A; a++) { if (R[h * A + a] > 0) continue; let sm = 0, n = 0; for (const [dh, da] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const hh = h + dh; if (hh < 0 || hh >= H) continue; const q = R[hh * A + (a + da + A) % A]; if (q > 0) { sm += q; n++; } } if (n) R[h * A + a] = sm / n; }
        const Rm = Float32Array.from(R);
        for (let h = 0; h < H; h++) for (let a = 0; a < A; a++) { let best = 0; for (let dh = -1; dh <= 1; dh++) for (let da = -1; da <= 1; da++) { const hh = h + dh; if (hh < 0 || hh >= H) continue; best = Math.max(best, R[hh * A + (a + da + A) % A]); } Rm[h * A + a] = best; }
        const radius = (a, y) => { const fa = ((a / TAU) % 1 + 1) % 1 * A, fh = Math.max(0, Math.min(H - 1.001, (y - y0) / dy)), a0 = Math.floor(fa) % A, a1 = (a0 + 1) % A, h0 = Math.floor(fh), ta = fa - Math.floor(fa), th = fh - h0; return (Rm[h0 * A + a0] * (1 - ta) + Rm[h0 * A + a1] * ta) * (1 - th) + (Rm[(h0 + 1) * A + a0] * (1 - ta) + Rm[(h0 + 1) * A + a1] * ta) * th || 0.08 * s; };
        const point = (a, y, gap = 0) => { const r = radius(a, y) + gap; return [cx + Math.sin(a) * r, y, cz + Math.cos(a) * r]; };
        const normal = (a, y) => { const e = 0.006 * s, p = point(a, y), pa = point(a + e / 0.08, y), py = point(a, y + e); let n = norm(cross(sub(pa, p), sub(py, p))); if (dot(n, [Math.sin(a), 0, Math.cos(a)]) < 0) n = mul(n, -1); return n; };
        return { L, s, eyeY, crown, cx, cz, radius, point, normal, mouthY: L.mouth[1], chin: L.chin, brow: L.brow, nose: L.noseTip };
    }

    /** A gas mask: a moulded rubber face seal, two round lenses, filter canisters and a strap harness. */
    function gasMask(C, item, out) {
        const F = headFrame(C), s = C.s, head = C.rigid('Head'), rubber = new GearMesh(), metal = new GearMesh(), glass = new GearMesh(), filt = new GearMesh(), straps = new GearMesh();
        const color = linear(item.color || '#2c2e2a'), canC = linear(item.color2 || '#4d5638'), metalC = linear(item.trim || '#5d5a52');
        const twin = item.style === 'twin';
        // The seal: over the brow, in front of the ears, cupped under the chin; arched at its top and bottom.
        const top = F.eyeY + 0.036 * s, bottom = F.chin - 0.016 * s, rows = 18, cols = 32;
        const halfWidth = v => 1.18 * (0.5 + 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + v * 0.98)), 0.55));
        const eyes = [F.L.eyeL, F.L.eyeR].map(E => ({ a: Math.atan2(E.center[0] - F.cx, E.center[2] - F.cz), y: E.center[1], r: Math.max(0.021 * s, E.radius * 1.65) }));
        const snoutY = (F.mouthY + F.nose[1]) / 2;
        const grid = [];
        for (let r = 0; r <= rows; r++) {
            const v = r / rows, row = [];
            for (let k = 0; k <= cols; k++) {
                const u = -1 + 2 * k / cols, w = halfWidth(v), a = u * w;
                const y0 = bottom + 0.032 * s * u * u, y1 = top - 0.016 * s * u * u, y = y0 + (y1 - y0) * v;
                // The face under it, from a small neighborhood (over the nose's tip and the lips), a few millimeters out.
                let raw = 0;
                for (const da of [-0.05, 0, 0.05]) for (const dyy of [-0.006, 0, 0.006]) raw = Math.max(raw, F.radius(a + da, y + dyy * s));
                // A moulded snout over the nose and mouth, where the filter mounts.
                const snout = 0.016 * s * Math.exp(-((a / 0.5) ** 2) - (((y - snoutY) / (0.034 * s)) ** 2));
                row.push({ a, y, raw: raw + 0.0045 * s, rr: raw + 0.0045 * s + snout });
            }
            grid.push(row);
        }
        // Eased into one moulded surface, never pressing in over the face.
        for (let pass = 0; pass < 8; pass++) for (let r = 1; r < rows; r++) for (let k = 1; k < cols; k++) { const q = grid[r][k], m = (grid[r - 1][k].rr + grid[r + 1][k].rr + grid[r][k - 1].rr + grid[r][k + 1].rr) / 4; q.rr = Math.max(q.raw, 0.5 * q.rr + 0.5 * m); }
        const pts = grid.map(row => row.map(q => [F.cx + Math.sin(q.a) * q.rr, q.y, F.cz + Math.cos(q.a) * q.rr]));
        const center = [F.cx, (top + bottom) / 2, F.cz];
        // Open at the eyes: each lens's collar covers the hole's edge.
        {
            const base = rubber.grid(pts, color, head, () => center, { uvAt: (r, k) => [k / cols * 0.2, r / rows * 0.15] }), C1 = cols + 1;
            const keep = [];
            const lastTris = rows * cols * 2;
            const from = rubber.i.length - lastTris * 3;
            for (let t = from; t < rubber.i.length; t += 3) {
                const ids = [rubber.i[t], rubber.i[t + 1], rubber.i[t + 2]].map(v => v - base), rc = ids.map(v => [Math.floor(v / C1), v % C1]);
                const ma = rc.reduce((sum, [r, k]) => sum + grid[r][k].a, 0) / 3, my = rc.reduce((sum, [r, k]) => sum + grid[r][k].y, 0) / 3;
                // (Cut a little wider than the lens: the cut's stair of whole cells lies under the lens's flange, never inside it.)
                if (!eyes.some(E => Math.hypot((ma - E.a) * 0.085, my - E.y) < E.r * 1.02)) keep.push(rubber.i[t], rubber.i[t + 1], rubber.i[t + 2]);
            }
            rubber.i.splice(from, rubber.i.length - from, ...keep);
        }
        // A rolled edge all round it.
        const ring = [];
        for (let k = 0; k <= cols; k++) ring.push(pts[0][k]); for (let r = 1; r <= rows; r++) ring.push(pts[r][cols]); for (let k = cols - 1; k >= 0; k--) ring.push(pts[rows][k]); for (let r = rows - 1; r > 0; r--) ring.push(pts[r][0]);
        ring.push(ring[0]);
        rubber.tube(ring, 0.0042 * s, 6, tone(color, 0.85), head, { caps: false });
        const flat = grid.flatMap((row, r) => row.map((q, k) => ({ a: q.a, y: q.y, p: pts[r][k] })));
        const onMask = (a, y, lift = 0) => {
            let best = flat[0], bd = Infinity;
            for (const q of flat) { const d = ((q.a - a) * 0.085) ** 2 + (q.y - y) ** 2; if (d < bd) { bd = d; best = q; } }
            const n = norm(sub(best.p, [F.cx, best.p[1], F.cz]));
            return { p: add(best.p, mul(n, lift)), n };
        };
        // The lenses: round, in raised metal rims, looking ahead and a little out.
        for (const E of [F.L.eyeL, F.L.eyeR]) {
            const a = Math.atan2(E.center[0] - F.cx, E.center[2] - F.cz), q = onMask(a, E.center[1]);
            const dir = norm(add(mul(norm(sub(E.center, [F.cx, E.center[1], F.cz])), 0.35), [0, 0, 0.94]));
            const r = Math.max(0.021 * s, E.radius * 1.65), base = add(q.p, mul(dir, -0.002 * s)), lip = add(q.p, mul(dir, 0.011 * s));
            rubber.tube([add(base, mul(dir, -0.002 * s)), add(q.p, mul(dir, 0.006 * s))], t => r * (1.18 - 0.08 * t), 24, tone(color, 0.95), head, { caps: false });
            // The collar's floor: a rubber ring across its foot, from the lens's edge out to its wall, so a look past the
            // lens down the collar meets rubber, not the face through the cut.
            {
                const x = norm(cross(dir, Y)), yv = cross(x, dir), N = 32, foot = add(base, mul(dir, 0.0005 * s)), ring = [];
                for (let k = 0; k <= N; k++) {
                    const ang = k / N * TAU, off = add(mul(x, Math.cos(ang)), mul(yv, Math.sin(ang)));
                    ring.push([rubber.vertex(add(foot, mul(off, r * 0.9)), dir, tone(color, 0.7), head, [k / N * 0.2, 0]), rubber.vertex(add(foot, mul(off, r * 1.2)), dir, tone(color, 0.7), head, [k / N * 0.2, 0.02])]);
                }
                const P3 = v => [rubber.p[v * 3], rubber.p[v * 3 + 1], rubber.p[v * 3 + 2]], f0 = cross(sub(P3(ring[0][1]), P3(ring[0][0])), sub(P3(ring[1][0]), P3(ring[0][0])));
                const up = dot(f0, dir) > 0;
                for (let k = 0; k < N; k++) { const [a0, b0] = ring[k], [a1, b1] = ring[k + 1]; if (up) rubber.quad(a0, b0, b1, a1); else rubber.quad(a0, a1, b1, b0); }
            }
            // A moulded flange sealing the collar into the mask: a smooth ring on the mask's surface from the collar out,
            // over the eye hole's cut edge.
            {
                const x = norm(cross(dir, Y)), yv = cross(x, dir), N = 32, inner = [], outer = [];
                for (let k = 0; k <= N; k++) {
                    const ang = k / N * TAU, rad = [Math.cos(ang), Math.sin(ang)];
                    for (const [list, rr, lift, shade] of [[inner, r * 1.1, 0.003 * s, 0.95], [outer, r * 1.85, 0.0012 * s, 1]]) {
                        const w = add(q.p, add(mul(x, rad[0] * rr), mul(yv, rad[1] * rr))), wa = Math.atan2(w[0] - F.cx, w[2] - F.cz);
                        // The mask's radius there, blended from its nearest points (a nearest point alone steps cell to cell).
                        const near = flat.map(f => [((f.a - wa) * 0.085) ** 2 + (f.y - w[1]) ** 2, f]).sort((P, Q) => P[0] - Q[0]).slice(0, 4);
                        let R = 0, W = 0; for (const [d, f] of near) { const k2 = 1 / (Math.sqrt(d) + 1e-4); R += Math.hypot(f.p[0] - F.cx, f.p[2] - F.cz) * k2; W += k2; }
                        const n = [Math.sin(wa), 0, Math.cos(wa)], pp = [F.cx + n[0] * (R / W + lift), w[1], F.cz + n[2] * (R / W + lift)];
                        list.push(rubber.vertex(pp, n, tone(color, shade), head, [k / N * 0.2, 0]));
                    }
                }
                // Facing out of the mask, whichever way the ring runs.
                const P3 = v => [rubber.p[v * 3], rubber.p[v * 3 + 1], rubber.p[v * 3 + 2]], f0 = cross(sub(P3(outer[0]), P3(inner[0])), sub(P3(inner[1]), P3(inner[0])));
                const out0 = dot(f0, sub(P3(inner[0]), [F.cx, P3(inner[0])[1], F.cz])) > 0;
                for (let k = 0; k < N; k++) if (out0) rubber.quad(inner[k], outer[k], outer[k + 1], inner[k + 1]); else rubber.quad(inner[k], inner[k + 1], outer[k + 1], outer[k]);
            }
            metal.tube([add(q.p, mul(dir, 0.005 * s)), lip], r * 1.06, 18, metalC, head, { caps: false });
            metal.tube([lip, add(lip, mul(dir, 0.0015 * s))], r * 0.9, 18, tone(metalC, 1.2), head, { caps: false });
            for (let k = 0; k < 3; k++) { const ang = k / 3 * TAU + 0.5, x = norm(cross(dir, Y)), y = cross(x, dir), p = add(lip, add(mul(x, Math.cos(ang) * r * 0.98), mul(y, Math.sin(ang) * r * 0.98))); rivet(metal, p, dir, 0.0022 * s, tone(metalC, 1.1), head); }
            glass.disc(add(lip, mul(dir, -0.001 * s)), dir, r * 0.95, linear(item.lensColor || '#5a6e66'), head, 24);
        }
        // Filters: one forward under the nose, or two at the cheeks, angled down.
        const filters = twin ? [[-0.55, -1], [0.55, 1]] : [[0, 0]];
        for (const [a, sx] of filters) {
            const q = onMask(a, F.mouthY - 0.006 * s);
            const dir = norm(add(add(mul(q.n, 0.85), [0, -0.42, 0]), [sx * 0.3, 0, 0]));
            const r = (twin ? 0.025 : 0.034) * s, L0 = 0.012 * s, L1 = (twin ? 0.034 : 0.04) * s;
            const a0 = add(q.p, mul(dir, -0.003 * s)), a1 = add(q.p, mul(dir, L0)), a2 = add(a1, mul(dir, L1));
            rubber.tube([a0, a1], r * 0.72, 16, tone(color, 0.9), head, { caps: false });
            // Threaded collar, then the canister with pressed ribs and a perforated face.
            metal.tube([lerp(a1, a0, 0.4), a1, add(a1, mul(dir, 0.004 * s))], r * 0.82, 16, metalC, head, { caps: false });
            const ribs = [];
            for (let i = 0; i <= 8; i++) ribs.push(lerp(a1, a2, i / 8));
            filt.tube(ribs, t => r * (0.97 + (i => (i % 2 ? 0.04 : 0))(Math.round(t * 8))), 14, canC, head, { caps: true });
            // Its face: holes in rings.
            const face = add(a2, mul(dir, 0.0005 * s)), x = norm(cross(dir, Y)), yv = cross(x, dir);
            for (const [rr, n] of [[0, 1], [0.38, 6], [0.7, 11]]) for (let k = 0; k < n; k++) { const ang = k / n * TAU; metal.disc(add(face, add(mul(x, Math.cos(ang) * rr * r), mul(yv, Math.sin(ang) * rr * r))), dir, 0.0032 * s, [0.01, 0.01, 0.01], head, 6); }
        }
        if (twin) {
            // A speaking and exhaling valve between them.
            const q = onMask(0, F.mouthY - 0.01 * s), dir = norm(add(q.n, [0, -0.3, 0]));
            metal.tube([add(q.p, mul(dir, -0.002 * s)), add(q.p, mul(dir, 0.018 * s))], 0.017 * s, 16, metalC, head);
            for (let k = -2; k <= 2; k++) metal.box(add(add(q.p, mul(dir, 0.0185 * s)), mul(Y, k * 0.0055 * s)), [norm(cross(dir, Y)), Y, dir], [0.012 * s, 0.0012 * s, 0.0008 * s], 0.0004 * s, [0.01, 0.01, 0.01], head, 1);
        }
        // The strap harness: two at the temples and two at the jaw to a pad behind, one over the crown.
        const pad = F.point(Math.PI, F.eyeY - 0.005 * s, 0.006 * s), padN = F.normal(Math.PI, F.eyeY);
        straps.box(pad, [norm(cross(Y, padN)), Y, padN], [0.028 * s, 0.03 * s, 0.003 * s], 0.006 * s, tone(color, 0.9), head);
        const strapLine = (a0, y0, a1, y1, gap) => { const n = 18, out2 = []; for (let i = 0; i <= n; i++) { const t = i / n, a = a0 + (a1 - a0) * t, y = y0 + (y1 - y0) * t; out2.push({ p: F.point(a, y, gap), n: F.normal(a, y) }); } return out2; };
        for (const sx of [-1, 1]) {
            const t0 = onMask(sx * 0.95, F.eyeY + 0.012 * s, 0.002 * s), j0 = onMask(sx * 1.0, F.mouthY - 0.004 * s, 0.002 * s);
            const at = p => Math.atan2(p[0] - F.cx, p[2] - F.cz);
            strap(straps, strapLine(at(t0.p), t0.p[1], sx * (Math.PI - 0.32), F.eyeY + 0.008 * s, 0.0045 * s), 0.016 * s, 0.0018 * s, color, head);
            strap(straps, strapLine(at(j0.p), j0.p[1], sx * (Math.PI - 0.3), F.eyeY - 0.022 * s, 0.0045 * s), 0.016 * s, 0.0018 * s, color, head);
            buckle(metal, F.point(sx * 2.1, F.eyeY + 0.01 * s, 0.0075 * s), norm([Math.cos(sx * 2.1), 0, -Math.sin(sx * 2.1)]), Y, 0.012 * s, 0.018 * s, 0.0015 * s, F.normal(sx * 2.1, F.eyeY), metalC, head);
        }
        // Over the crown: from the seal's top edge, up over the head, down to the pad.
        {
            const P0 = onMask(0, top, 0.002 * s).p, P2 = add(pad, [0, 0.03 * s, 0]), apex = [F.cx, F.crown + 0.006 * s, (P0[2] + P2[2]) / 2];
            const P1 = sub(mul(apex, 2), mul(add(P0, P2), 0.5)), path = [];
            for (let i = 0; i <= 20; i++) {
                const t = i / 20, q = add(add(mul(P0, (1 - t) ** 2), mul(P1, 2 * t * (1 - t))), mul(P2, t * t));
                // Never into the head: out to its surface where the arc runs inside it.
                const a = q[2] >= F.cz ? 0 : Math.PI, need = F.radius(a, Math.min(q[1], F.crown - 0.01 * s)) + 0.005 * s, r = Math.abs(q[2] - F.cz);
                if (q[1] < F.crown - 0.01 * s && r < need) q[2] = F.cz + Math.sign(q[2] - F.cz || 1) * need;
                path.push(q);
            }
            strap(straps, path.map((p, i) => ({ p, n: norm(sub(p, [F.cx, F.eyeY, F.cz])) })), 0.018 * s, 0.0018 * s, color, head);
        }
        const parts = [fabricPart(rubber, 'Gas mask', 'plastic', 0.62, item), fabricPart(straps, 'Gas mask straps', 'leather', 0.7, item), fabricPart(filt, 'Gas mask filters', 'plastic', 0.5, item)];
        if (!metal.empty) parts.push(metal.part('Gas mask fittings', { roughness: 0.38, metalness: 0.85 }));
        if (!glass.empty) parts.push(glass.part('Gas mask lenses', { roughness: 0.05, metalness: 0.6, opacity: 0.45 }));
        return parts;
    }

    /** Dust goggles: two cups with tinted lenses on an elastic band, on the forehead or over the eyes. */
    function goggles(C, item, out) {
        const F = headFrame(C), s = C.s, head = C.rigid('Head'), cups = new GearMesh(), metal = new GearMesh(), glass = new GearMesh(), band = new GearMesh();
        const color = linear(item.color || '#4a3624'), lens = linear(item.color2 || '#3a5040'), metalC = linear(item.trim || '#8a7a5a');
        const up = item.style !== 'eyes';
        const lift = up ? F.brow - F.eyeY + 0.03 * s : 0, tilt = up ? 0.55 : 0.05;
        for (const E of [F.L.eyeL, F.L.eyeR]) {
            const ey = E.center[1] + lift, a = Math.atan2(E.center[0] - F.cx, E.center[2] - F.cz) * (up ? 0.95 : 1);
            const base = F.point(a, ey, 0.004 * s), n0 = F.normal(a, ey);
            const dir = norm(add(add(mul(n0, 0.6), [0, 0, 0.55]), [0, tilt, 0]));
            const r = Math.max(0.022 * s, E.radius * 1.7), depth = 0.018 * s;
            // The cup: leather over a frame, wider at the face, a gasket against it.
            const rows = [0, 0.15, 0.6, 1].map(t => { const c = add(base, mul(dir, depth * t - (t === 0 ? 0.002 * s : 0))), x = norm(cross(dir, Y)), y = cross(x, dir), rr = r * (1.18 - 0.16 * t); return Array.from({ length: 14 }, (_, k) => { const ang = k / 14 * TAU; return add(c, add(mul(x, Math.cos(ang) * rr), mul(y, Math.sin(ang) * rr * 0.92))); }); });
            cups.grid(rows, color, head, () => base, { closed: true, colorAt: (r2) => (r2 === 0 ? tone(color, 0.6) : color) });
            const lip = add(base, mul(dir, depth));
            metal.tube([lip, add(lip, mul(dir, 0.003 * s))], r * 1.02, 14, metalC, head, { caps: false });
            glass.disc(add(lip, mul(dir, 0.0015 * s)), dir, r * 0.95, lens, head, 14);
            // Vent slits round the cup.
            for (let k = 0; k < 4; k++) { const ang = k / 4 * TAU + Math.PI / 4, x = norm(cross(dir, Y)), y = cross(x, dir), p = add(add(base, mul(dir, depth * 0.55)), add(mul(x, Math.cos(ang) * r * 1.075), mul(y, Math.sin(ang) * r * 1.0))); metal.box(p, [norm(cross(dir, norm(sub(p, add(base, mul(dir, depth * 0.55)))))), dir, norm(sub(p, add(base, mul(dir, depth * 0.55))))], [0.0035 * s, 0.002 * s, 0.0008 * s], 0.0004 * s, [0.02, 0.02, 0.02], head, 1); }
        }
        // The band: round the head over the hair line, with a bridge between the cups.
        const by = (F.L.eyeL.center[1] + F.L.eyeR.center[1]) / 2 + lift + (up ? 0.008 * s : 0.004 * s);
        const path = [];
        for (let i = 0; i <= 40; i++) { const a = -Math.PI + 0.65 + i / 40 * (TAU - 1.3), y = by - 0.004 * s * Math.cos(a); path.push({ p: F.point(a + Math.PI, y, 0.007 * s), n: F.normal(a + Math.PI, y) }); }
        strap(band, path, 0.022 * s, 0.002 * s, linear(item.bandColor || '#2a2622'), head);
        const bl = F.point(0.12, by - 0.004 * s, 0.012 * s), br = F.point(-0.12, by - 0.004 * s, 0.012 * s);
        metal.tube([bl, add(lerp(bl, br, 0.5), [0, 0.004 * s, 0.006 * s]), br], 0.0025 * s, 6, metalC, head);
        const parts = [fabricPart(cups, 'Goggles', 'leatherWorn', 0.65, item), fabricPart(band, 'Goggle band', 'jersey', 0.85, item)];
        if (!metal.empty) parts.push(metal.part('Goggle rims', { roughness: 0.35, metalness: 0.85 }));
        if (!glass.empty) parts.push(glass.part('Goggle lenses', { roughness: 0.05, metalness: 0.9, opacity: 0.85 }));
        return parts;
    }

    const checks = new Map();
    /** A woven desert-scarf check in two colors (repeats every 12 cm), made once per pair. */
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    function checkPicture(c1, c2) {
        const key = c1 + c2;
        if (checks.has(key)) return checks.get(key);
        const S = 256, data = new Uint8Array(S * S * 4), A = linear(c1), B = linear(c2);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const u = x / S * 12, v = y / S * 12, fu = fract(u), fv = fract(v);
            // Thin dark lines on the weave, a small diamond where they meet, a doubled line every fourth; faded unevenly.
            const line = fu < 0.1 || fv < 0.1 || (Math.floor(u) % 4 === 0 && fu > 0.24 && fu < 0.32) || (Math.floor(v) % 4 === 0 && fv > 0.24 && fv < 0.32);
            const diamond = Math.abs(fu - 0.6) + Math.abs(fv - 0.6) < 0.14;
            const weave = (x + y) % 2 ? 0.95 : 1.05, fade = 0.85 + 0.25 * noise2(x / 40, y / 40, 4), c = line || diamond ? mixc(A, B, 0.55) : A;
            const o = (y * S + x) * 4;
            data[o] = toByte(c[0] * weave * fade); data[o + 1] = toByte(c[1] * weave * fade); data[o + 2] = toByte(c[2] * weave * fade); data[o + 3] = 255;
        }
        const pic = { name: 'scarf-check-' + key.replace(/#/g, '') + '.png', width: S, height: S, data, repeat: true };
        if (checks.size > 8) checks.clear();
        checks.set(key, pic);
        return pic;
    }

    /** A scarf pulled up over the face: from the bridge of the nose, falling from its tip to under the chin, tied behind. */
    function faceVeil(C, item, out) {
        const F = headFrame(C), s = C.s, head = C.rigid('Head'), m = new GearMesh(), ties = new GearMesh();
        const top = F.eyeY - 0.024 * s, bottom = F.chin - 0.035 * s, rows = 16, cols = 30, grid = [];
        const tipY = F.nose[1], tipR = F.radius(0, tipY);
        // Over what is already worn there too (a scarf wound round the neck below it).
        const worn = new Map(), key = (a, y) => Math.round(a / 0.05) + ':' + Math.round(y / (0.006 * s));
        for (const e of C.entries || []) { const P = e.laid.positions; for (let v = 0; v < P.length / 3; v++) { const y = P[v * 3 + 1]; if (y < bottom - 0.03 * s || y > top) continue; const dx = P[v * 3] - F.cx, dz = P[v * 3 + 2] - F.cz, k = key(Math.atan2(dx, dz), y), r = Math.hypot(dx, dz); if (!(worn.get(k) >= r)) worn.set(k, r); } }
        const wornAt = (a, y) => { let r = 0; for (const da of [-0.05, 0, 0.05]) for (const dy of [-0.006, 0, 0.006]) r = Math.max(r, worn.get(key(a + da, y + dy * s)) || 0); return r; };
        for (let r = 0; r <= rows; r++) {
            const v = r / rows, w = 1.55 - 0.25 * v, row = [];
            for (let k = 0; k <= cols; k++) {
                const a = -w + 2 * w * k / cols, u = a / w;
                // Its lower edge hangs to a soft point in front, like a bandana's.
                const y = bottom - 0.03 * s * (1 - u * u) * (1 - v) + (top - bottom) * v;
                let raw = 0;
                for (const da of [-0.04, 0, 0.04]) for (const dy of [-0.01, 0, 0.01]) raw = Math.max(raw, F.radius(a + da, y + dy * s));
                raw = Math.max(raw, wornAt(a, y));
                row.push({ a, y, raw: raw + 0.005 * s, rr: raw + 0.005 * s });
            }
            grid.push(row);
        }
        // Below the nose the cloth falls away from its tip (not into the lips), easing out to the cheeks.
        for (let r = rows - 1; r >= 0; r--) for (let k = 0; k <= cols; k++) {
            const q = grid[r][k], above = grid[r + 1][k], dy = above.y - q.y;
            if (above.y <= tipY + 0.01 * s) q.rr = Math.max(q.raw, above.rr - 0.3 * dy);
        }
        void tipR;
        for (let pass = 0; pass < 14; pass++) for (let r = 1; r < rows; r++) for (let k = 1; k < cols; k++) { const q = grid[r][k], mm = (grid[r - 1][k].rr + grid[r + 1][k].rr + grid[r][k - 1].rr + grid[r][k + 1].rr) / 4; q.rr = Math.max(q.raw, 0.5 * q.rr + 0.5 * mm); }
        // Soft folds hanging from the nose where it sags.
        const pts = grid.map((row, r) => row.map(q => { const sag = 0.002 * s * Math.abs(Math.sin(q.a * 6 + 0.4)) * (1 - r / rows) ** 1.5; const rr = q.rr + sag; return [F.cx + Math.sin(q.a) * rr, q.y, F.cz + Math.cos(q.a) * rr]; }));
        const R = 0.09 * s;
        // The face under it is left out (the lips and the mouth's inside with it, RRCharacterExpressions.mouthCovered).
        {
            const body = C.built.parts[0], src = C.pack.body.source, an = C.an, P = body.positions;
            for (let v = 0; v < P.length / 3; v++) {
                if (an.member[src[v] * 5] < 0.6 || an.s[src[v] * 5] < 4.3) continue;
                const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2], a = Math.atan2(x - F.cx, z - F.cz);
                if (y < bottom + 0.012 * s || y > top - 0.012 * s || Math.abs(a) > 1.05) continue;
                out.hidden.add(src[v]);
            }
        }
        m.grid(pts, [1, 1, 1], head, () => [F.cx, (top + bottom) / 2, F.cz], { uvAt: (r, k) => [grid[r][k].a * R / 0.16 + 0.25, -grid[r][k].y / 0.16], colorAt: (r, k) => { const g = 0.86 + 0.14 * Math.abs(Math.sin(grid[r][k].a * 6 + 0.4)) * (1 - r / rows) + 0.06 * r / rows; return [g, g, g]; } });
        // Its lower edge frays.
        const fr = new GearMesh(), W = need('RRCharacterWear', './CharacterWear.js'), pic = W && W.pictures().fray, c = linear(item.color || '#b8a98a');
        { const row0 = pts[0], cards = [];
            for (let k = 0; k <= cols; k++) { const p = row0[k], n = norm(sub(p, [F.cx, p[1], F.cz])), L = (0.012 + 0.01 * noise2(k * 0.7, 3, 9)) * s; cards.push([fr.vertex(add(p, [0, 0.002 * s, 0]), n, c, head, [k * 0.08, 0]), fr.vertex(add(add(p, [0, -L, 0]), mul(n, 0.003 * s)), n, tone(c, 0.8), head, [k * 0.08, 0.45])]); }
            for (let k = 0; k < cols; k++) fr.quad(cards[k][0], cards[k + 1][0], cards[k + 1][1], cards[k][1]); }
        // Tied behind: two rolled ends round to a knot.
        for (const sx of [-1, 1]) {
            const a0 = grid[Math.floor(rows * 0.7)][sx > 0 ? cols : 0].a, y0 = grid[Math.floor(rows * 0.7)][0].y, path = [];
            for (let i = 0; i <= 12; i++) { const t = i / 12, a = a0 + (sx * Math.PI - a0) * t, y = y0 + (F.eyeY - 0.01 * s - y0) * t; path.push({ p: F.point(a, y, 0.006 * s), n: F.normal(a, y) }); }
            roll(ties, path, 0.02 * s, 0.006 * s, tone(c, 0.92), head);
        }
        const knot = F.point(Math.PI, F.eyeY - 0.01 * s, 0.012 * s), kn = F.normal(Math.PI, F.eyeY);
        ties.box(knot, [norm(cross(Y, kn)), Y, kn], [0.016 * s, 0.012 * s, 0.008 * s], 0.006 * s, tone(c, 0.9), head);
        const check = checkPicture(item.color || '#b8a98a', item.color2 || '#5a4a38'), Fabric = need('RRCharacterFabric', './CharacterFabric.js');
        const veil = m.part('Face scarf', { texture: check.name, keepColors: true, roughness: 0.9, metalness: 0, doubleSided: true });
        if (Fabric) { const t = Fabric.tile('canvasWorn'); if (t) { veil.uvs1 = Float32Array.from(veil.uvs, (x, i) => x * 0.16 / t.span[i % 2]); Fabric.applyTo(veil, 'canvasWorn', null, { uvs1: veil.uvs1, roughness: 0.9, sheenTexture: check.name }); veil.fabricTile = 'canvasWorn'; } }
        out.textures.push(check);
        const parts = [veil, fabricPart(ties, 'Face scarf ties', 'canvasWorn', 0.9, item)];
        if (pic && !fr.empty) { parts.push(fr.part('Face scarf fringe', { texture: pic.name, keepColors: true, cutout: true, alphaCutoff: 0.45, roughness: 0.95, metalness: 0, doubleSided: true })); out.textures.push(pic); }
        return parts;
    }

    const blankets = new Map();
    /** A woven blanket: a twill in the main color, two bands of the second near the hem (v = 1), made once per pair. */
    function blanketPicture(c1, c2) {
        const key = c1 + c2;
        if (blankets.has(key)) return blankets.get(key);
        const S = 256, data = new Uint8Array(S * S * 4), A = linear(c1), B = linear(c2), D = A.map(c => c * 0.55);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
            const v = y / S, tw = ((x + y) >> 1) % 4 < 2 ? 0.94 : 1.06, slub = 0.9 + 0.2 * noise2(x / 9, y / 3, 3);
            let c = A;
            if (v > 0.8 && v < 0.86) c = B; else if (v > 0.89 && v < 0.91) c = B; else if (v > 0.07 && v < 0.09) c = D;
            if (v > 0.8 && v < 0.86 && (x >> 3) % 2 === ((y >> 3) % 2)) c = mixc(B, A, 0.3);
            const o = (y * S + x) * 4;
            data[o] = toByte(c[0] * tw * slub); data[o + 1] = toByte(c[1] * tw * slub); data[o + 2] = toByte(c[2] * tw * slub); data[o + 3] = 255;
        }
        const pic = { name: 'blanket-' + key.replace(/#/g, '') + '.png', width: S, height: S, data, repeat: true };
        if (blankets.size > 8) blankets.clear();
        blankets.set(key, pic);
        return pic;
    }

    /**
     * A poncho: a blanket with a hole for the head, lying taut over the shoulders and the tops of
     * the arms and hanging straight from where they end, its hem frayed; and its hood.
     * Each section round the neck is the upper hull of what it lies over, walked for its length.
     */
    function poncho(C, item, out, opts = {}) {
        const s = C.s, neck = C.neck, cx = neck[0], cz = neck[2] - 0.01 * s, y0 = neck[1] + 0.012 * s;
        const A = opts.around || 48, gap = (opts.gap ?? 0.012) * s, length = (opts.length ?? (0.42 + 0.3 * (item.length ?? 0.6))) * s, rand = stream(77 + (item.wearSeed | 0));
        const body = C.built.parts[0], pts = [];
        const add3 = (x, y, z) => { if (y > y0 - 0.002 * s) return; const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); if (d < 0.02 * s || d > 0.75 * s) return; pts.push([Math.atan2(dx, dz), d, y]); };
        for (let v = 0; v < body.positions.length / 3; v++) add3(body.positions[v * 3], body.positions[v * 3 + 1], body.positions[v * 3 + 2]);
        for (const e of C.entries || []) { const P = e.laid.positions; for (let v = 0; v < P.length / 3; v++) add3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
        for (const p of C.trunkParts || []) { const P = p.positions; for (let v = 0; v < P.length / 3; v++) add3(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); }
        // Each bearing's section: the highest point at each distance out, then the taut line over them.
        // Each section sees a little past its neighbors, so the cloth between two never cuts into what bulges there.
        const bins = 75, wedge = 1.3 * TAU / A, sections = [];
        const by = Array.from({ length: A }, () => new Float32Array(bins).fill(-Infinity));
        for (const [a, d, y] of pts) for (let k = 0; k < A; k++) {
            const ak = k / A * TAU - Math.PI; let da = a - ak; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
            if (Math.abs(da) > wedge) continue;
            const b = Math.min(bins - 1, Math.floor(d / (0.01 * s)));
            if (y > by[k][b]) by[k][b] = y;
        }
        const neckR = k => { let r = 0.06 * s; for (let b = 0; b < bins; b++) if (by[k][b] > y0 - 0.03 * s) r = Math.max(r, (b + 1) * 0.01 * s); return Math.min(r, 0.1 * s); };
        for (let k = 0; k < A; k++) {
            const ak = k / A * TAU - Math.PI, start = [neckR(k) * 0.8, y0];
            const list = [start];
            for (let b = 0; b < bins; b++) if (Number.isFinite(by[k][b]) && (b + 0.5) * 0.01 * s > start[0]) list.push([(b + 0.5) * 0.01 * s, by[k][b] + gap]);
            // The upper hull from the collar outward.
            const hull = [];
            for (const p of list) { while (hull.length >= 2) { const a = hull[hull.length - 2], b = hull[hull.length - 1]; if ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0) hull.pop(); else break; } hull.push(p); }
            // Past the last point it hangs straight down.
            const end = hull[hull.length - 1];
            hull.push([end[0] + 0.004 * s, end[1] - 2 * s]);
            // Shorter over the arms than down the front and back: it hangs to points before and behind.
            sections.push({ a: ak, hull, len: length * (0.85 + 0.25 * noise2(k * 0.35, 1.5, 21)) * (1 - 0.3 * Math.abs(Math.sin(ak)) + 0.1 * Math.abs(Math.cos(ak))) });
        }
        const N = opts.rows || 18, grid = [], tvals = [];
        const walk = (hull, t) => { let left = t; for (let i = 0; i + 1 < hull.length; i++) { const a = hull[i], b = hull[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]); if (left <= d) return [a[0] + (b[0] - a[0]) * left / d, a[1] + (b[1] - a[1]) * left / d, i]; left -= d; } return [...hull[hull.length - 1], hull.length - 1]; };
        for (let r = 0; r <= N; r++) {
            const row = [];
            for (const sec of sections) {
                const t = sec.len * r / N, [d, y, seg] = walk(sec.hull, t);
                // Hanging cloth gathers into soft flutes as it falls.
                const hang = Math.max(0, t - (sec.hull.slice(0, -1).reduce((acc, p, i, arr) => i ? acc + Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]) : 0, 0)));
                const flute = 0.012 * s * Math.min(1, hang / (0.12 * s)) * (0.5 + 0.5 * Math.sin(sec.a * 9 + 1.3));
                const dd = d + flute;
                row.push([cx + Math.sin(sec.a) * dd, y, cz + Math.cos(sec.a) * dd]);
                void seg;
            }
            grid.push(row); tvals.push(r / N);
        }
        const m = new GearMesh(), color = linear(item.color || '#a08a62');
        const skinAt = p => C.skinAt(p, false);
        // Each column rides on what it lies over: the hanging part with the point it falls from.
        const hold = sections.map((sec, k) => { const last = sec.hull[sec.hull.length - 2]; return C.skinAt([cx + Math.sin(sec.a) * last[0], last[1] - gap, cz + Math.cos(sec.a) * last[0]], false); });
        const base = m.p.length / 3, cols = A + 1, hemSkin = [];
        for (let r = 0; r <= N; r++) for (let k = 0; k <= A; k++) {
            const q = k % A, p = grid[r][q], sec = sections[q], t = sec.len * r / N;
            const lying = (() => { let acc = 0; for (let i = 1; i < sec.hull.length - 1; i++) acc += Math.hypot(sec.hull[i][0] - sec.hull[i - 1][0], sec.hull[i][1] - sec.hull[i - 1][1]); return acc; })();
            const skin = t <= lying ? skinAt(sub(p, [0, gap, 0])) : hold[q];
            if (r === N) hemSkin[q] = skin;
            // The color is the blanket's picture; the vertices only darken it toward the hem.
            const g = 1 - 0.3 * ss(0.55, 1, r / N);
            m.vertex(p, [0, 1, 0], [g, g, g], skin, [k / A * 4, r / N * 0.98]);
        }
        for (let r = 0; r < N; r++) for (let k = 0; k < A; k++) { const a = base + r * cols + k, b = a + 1, c2 = a + cols, d = c2 + 1; m.i.push(a, c2, b, b, c2, d); }
        // Faces out (away from the neck's axis line below it).
        { const at = v => m.at(v); let vote = 0; for (let t = 0; t < m.i.length; t += 3) { const A3 = at(m.i[t]); vote += dot(cross(sub(at(m.i[t + 1]), A3), sub(at(m.i[t + 2]), A3)), sub(A3, [cx, A3[1], cz])); } if (vote < 0) for (let t = 0; t < m.i.length; t += 3) { const x = m.i[t + 1]; m.i[t + 1] = m.i[t + 2]; m.i[t + 2] = x; } }
        m.smooth(base);
        for (let r = 0; r <= N; r++) { const a = base + r * cols, b = a + A; for (let c = 0; c < 3; c++) { const v = (m.n[a * 3 + c] + m.n[b * 3 + c]) / 2; m.n[a * 3 + c] = m.n[b * 3 + c] = v; } }
        // A rolled collar round the head hole.
        roll(m, grid[0].map((p, k) => ({ p, n: norm(add(sub(p, [cx, p[1], cz]), [0, 0.6, 0])) })).concat([{ p: grid[0][0], n: norm(add(sub(grid[0][0], [cx, grid[0][0][1], cz]), [0, 0.6, 0])) }]), 0.02 * s, 0.01 * s, [0.85, 0.85, 0.85], p => C.skinAt(p, true));
        // The frayed hem, riding on the hem it hangs from (not on the far point a short cape's hold reaches: a hand or a knee).
        const fr = new GearMesh(), W = need('RRCharacterWear', './CharacterWear.js'), pic = W && W.pictures().fray, cards = [];
        for (let k = 0; k <= A; k++) { const q = k % A, p = grid[N][q], prev = grid[N - 1][q], dir = norm(add(norm(sub(p, prev)), [0, -1.4, 0])), n = norm(sub(p, [cx, p[1], cz])), L = (opts.plain ? 0.012 + 0.018 * noise2(k * 0.6, 7, 3) : 0.03 + 0.04 * noise2(k * 0.6, 7, 3)) * s; cards.push([fr.vertex(sub(p, mul(dir, 0.004 * s)), n, tone(color, 0.75), hemSkin[q], [k * 0.3, 0]), fr.vertex(add(p, mul(dir, L)), n, tone(color, 0.6), hemSkin[q], [k * 0.3, 0.7])]); }
        for (let k = 0; k < A; k++) fr.quad(cards[k][0], cards[k + 1][0], cards[k + 1][1], cards[k][1]);
        const blanket = opts.plain ? blanketPicture(item.color || '#a08a62', item.color || '#a08a62') : blanketPicture(item.color || '#a08a62', item.color2 || '#6e5a3a'), Fabric = need('RRCharacterFabric', './CharacterFabric.js');
        const part = m.part(opts.name || 'Poncho', { texture: blanket.name, keepColors: true, roughness: 0.92, metalness: 0, doubleSided: true });
        if (Fabric) { const t = Fabric.tile('canvasWorn'); if (t) { part.uvs1 = Float32Array.from(m.uv, (x, i) => (i % 2 ? x * length / 0.98 : x * 0.25 * TAU * 0.25 / 1) / t.span[i % 2] * (i % 2 ? 1 : 1)); Fabric.applyTo(part, 'canvasWorn', null, { uvs1: part.uvs1, roughness: 0.92, sheenTexture: blanket.name }); part.fabricTile = 'canvasWorn'; } }
        out.textures.push(blanket);
        const parts = [part];
        if (pic && !fr.empty) { parts.push(fr.part((opts.name || 'Poncho') + ' fringe', { texture: pic.name, keepColors: true, cutout: true, alphaCutoff: 0.45, roughness: 0.95, metalness: 0, doubleSided: true })); out.textures.push(pic); }
        // The hood up over the head.
        if (opts.hood !== false) parts.push(...ponchoHood(C, item, out, blanket));
        return parts;
    }
    /** A poncho's hood up over the head: a deep cowl from the collar round to the face's edge, domed over the crown. */
    function ponchoHood(C, item, out, blanket) {
        const F = headFrame(C), s = C.s, head = C.rigid('Head'), m = new GearMesh(), color = linear(item.color || '#a08a62');
        const bottom = C.neck[1] - 0.005 * s, top = F.crown + 0.03 * s, taper = F.crown - 0.045 * s, A = 36, R = 18;
        // The face opening: an oval from under the chin to over the brow.
        const o0 = F.chin - 0.022 * s, o1 = F.brow + 0.045 * s, om = (o0 + o1) / 2, oh = (o1 - o0) / 2;
        const openAt = y => { const q = (y - om) / oh; return Math.abs(q) >= 1 ? 0 : 0.98 * Math.sqrt(1 - q * q); };
        const rows = [];
        for (let r = 0; r <= R; r++) {
            const t = r / R, y = bottom + (top - bottom) * t, half = openAt(y), row = [];
            for (let k = 0; k <= A; k++) {
                // Round from one side of the opening, behind the head, to the other.
                const a = half + (TAU - 2 * half) * k / A, behind = Math.max(0, -Math.cos(a));
                let rr = F.radius(a, Math.min(y, taper)) + (0.022 + 0.012 * behind) * s;
                if (y > taper) rr *= Math.sqrt(Math.max(0.0025, 1 - ((y - taper) / (top - taper)) ** 2));
                row.push([F.cx + Math.sin(a) * rr, y, F.cz + Math.cos(a) * rr - 0.01 * s * behind]);
            }
            rows.push(row);
        }
        m.grid(rows, [0.95, 0.95, 0.95], head, p => [F.cx, Math.min(p[1], taper), F.cz], { uvAt: (r, k) => [k / A * 3, 0.15 + r / R * 0.35] });
        // A rolled edge round the opening: down one side's first column and up the other's last.
        const edge = [];
        for (let r = 0; r <= R; r++) if (openAt(rows[r][0][1]) > 0.02) edge.push(rows[r][0]);
        for (let r = R; r >= 0; r--) if (openAt(rows[r][A][1]) > 0.02) edge.push(rows[r][A]);
        if (edge.length > 3) { edge.push(edge[0]); roll(m, edge.map(p => ({ p, n: norm(sub(p, [F.cx, p[1], F.cz])) })), 0.02 * s, 0.01 * s, [0.85, 0.85, 0.85], head); }
        void color;
        const part = m.part('Poncho hood', { texture: blanket.name, keepColors: true, roughness: 0.92, metalness: 0, doubleSided: true });
        const Fabric = need('RRCharacterFabric', './CharacterFabric.js');
        if (Fabric) { const t = Fabric.tile('canvasWorn'); if (t) { part.uvs1 = Float32Array.from(m.uv, x => x * 0.4 / t.span[0]); Fabric.applyTo(part, 'canvasWorn', null, { uvs1: part.uvs1, roughness: 0.92, sheenTexture: blanket.name }); part.fabricTile = 'canvasWorn'; } }
        return [part];
    }

    /**
     * Rag wraps: strips of old cloth wound round the trunk at odd angles, a sash crossing over one
     * shoulder, two loose ends hanging.
     */
    function ragWraps(C, item, out) {
        const s = C.s, m = new GearMesh(), ends = new GearMesh(), rand = stream(41 + (item.wearSeed | 0)), skin = p => C.skinAt(p, true);
        const hipY = C.hips[1], span = C.neck[1] - hipY, c1 = linear(item.color || '#9a8a6a'), c2 = linear(item.color2 || '#6a5a42');
        const reach = 0.25 + 0.75 * clamp01(item.length ?? 0.7), n = Math.max(2, Math.round(2 + reach * 3.5));
        for (let i = 0; i < n; i++) {
            const y0 = hipY + span * (0.3 + 0.55 * reach * i / (n - 1)), tilt = (rand() - 0.5) * 0.12 * span, phase = rand() * TAU, path = [];
            for (let k = 0; k < 40; k++) { const a = k / 40 * TAU - Math.PI, y = y0 + tilt * Math.cos(a - phase); path.push({ p: C.radialAt(a, y, 0.006 * s + i * 0.0015 * s), n: C.radialNormal(a, y) }); }
            roll(m, path, (0.045 + 0.02 * rand()) * s, (0.005 + 0.003 * rand()) * s, mixc(c1, c2, rand() * 0.6).map(c => c * (0.9 + 0.2 * rand())), skin, { closed: true, sides: 5 });
        }
        // A sash from the right hip up over the left shoulder and down behind.
        const hi = C.neck[1] - span * 0.08, front = trunkPath(C, [[-0.9, hipY + span * 0.2], [-0.2, hipY + span * 0.55], [0.48, hi]], 0.012 * s, 0.012 * s);
        const back = trunkPath(C, [[Math.PI - 0.48, hi], [Math.PI + 0.25, hipY + span * 0.55], [Math.PI + 0.9, hipY + span * 0.2]], 0.012 * s, 0.012 * s);
        const a = front[front.length - 1].p, b = back[0].p, over = shoulderPath(C, (a[0] + b[0]) / 2, a[2], b[2], 0.008 * s, 0.012 * s);
        roll(m, front.concat(over, back).map(q => ({ p: q.p, n: q.n })), 0.07 * s, 0.008 * s, tone(c2, 1.05), skin);
        // Loose ends.
        const W = need('RRCharacterWear', './CharacterWear.js'), pic = W && W.pictures().fray;
        for (const [a, y] of [[-1.0, hipY + span * 0.3], [2.4, hipY + span * 0.45]]) {
            const p = C.radialAt(a, y, 0.014 * s), nn = C.radialNormal(a, y), side = norm(cross(Y, nn)), rows = [];
            for (let r = 0; r <= 5; r++) { const t = r / 5, q = add(add(p, mul(Y, -t * 0.14 * s)), mul(nn, 0.01 * s * t)); rows.push([add(q, mul(side, -0.02 * s)), add(q, mul(side, 0.02 * s))]); }
            ends.grid(rows, tone(c1, 0.9), C.skinAt(p, true), () => sub(p, mul(nn, 0.1)), { uvAt: (r, k) => [k * 0.15 + a, r / 5 * 0.36] });
        }
        const parts = [fabricPart(m, 'Rag wraps', 'canvasWorn', 0.95, item)];
        if (!ends.empty) { parts.push(ends.part('Rag wrap ends', Object.assign({ roughness: 0.95, metalness: 0, doubleSided: true }, pic ? { texture: pic.name, keepColors: true, cutout: true, alphaCutoff: 0.45 } : {}))); if (pic) out.textures.push(pic); }
        for (const p of parts) p.trunkGear = true;
        return parts;
    }

    /**
     * Strips wound in a spiral round each forearm (elbow to wrist) or each shin (knee to the boot's
     * top, or the ankle), over the sleeve or trouser leg there, tied off with a short end.
     */
    function limbWrap(C, item, out, shoeParts, legs) {
        const s = C.s, m = new GearMesh(), body = C.built.parts[0], src = C.pack.body.source, an = C.an;
        const color = linear(item.color || (legs ? '#8a7a5e' : '#d4c9ae')), rand = stream((legs ? 61 : 67) + (item.wearSeed | 0));
        for (const [side, fam] of [['Left', legs ? 3 : 1], ['Right', legs ? 4 : 2]]) {
            const a = C.bone(side + (legs ? 'Leg' : 'ForeArm')).head, b = C.bone(side + (legs ? 'Foot' : 'Hand')).head, along = norm(sub(b, a)), L = len(sub(b, a));
            const front = norm(sub([0, 0, 1], mul(along, along[2]))), sideV = norm(cross(along, front));
            // Stops above a boot's top.
            let tEnd = 0.96;
            if (legs) for (const p of shoeParts) { if (!/boot/i.test(p.name)) continue; let top = Infinity; for (let v = 0; v < p.positions.length / 3; v++) { const q = [p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]], d = sub(q, a); if (Math.abs(dot(d, sideV)) < 0.08 * s && Math.abs(dot(d, front)) < 0.1 * s) top = Math.min(top, dot(d, along)); } if (Number.isFinite(top) && top > 0.1 * L) tEnd = Math.min(tEnd, top / L - 0.02); }
            const tStart = Math.max(0.06, tEnd - (legs ? 0.75 : 0.85) * clamp01(item.length ?? 0.6));
            if (tEnd - tStart < 0.08) continue;
            const surfaces = [body, ...(C.entries || []).map(e => e.laid)];
            const accept = (part, v) => part === body ? an.member[src[v] * 5 + fam] > 0.45 : !!(part.field && part.field[part.origin ? part.origin[v] : v] && part.field[part.origin ? part.origin[v] : v].fam === fam);
            const stations = 9, sections = [];
            for (let i = 0; i <= stations; i++) { const t = tStart + (tEnd - tStart) * i / stations; sections.push(C.O.crossSection(surfaces, add(a, mul(along, t * L)), [sideV, along, front], accept, s)); }
            // Each turn laps a little over the last.
            const width = (legs ? 0.036 : 0.03) * s, turns = (tEnd - tStart) * L / (width * 1.1), N = Math.round(18 * turns), path = [];
            for (let i = 0; i <= N; i++) {
                const u = i / N, f = u * stations, i0 = Math.min(stations - 1, Math.floor(f)), w = f - i0, ang = u * turns * TAU + (fam % 2 ? 0 : Math.PI);
                const p = lerp(sections[i0](ang, 0.004 * s), sections[i0 + 1](ang, 0.004 * s), w), center = add(a, mul(along, (tStart + (tEnd - tStart) * u) * L));
                path.push({ p, n: norm(sub(sub(p, center), mul(along, dot(sub(p, center), along)))) });
            }
            // Eased so it does not follow every crease of the cloth under it.
            for (let pass = 0; pass < 2; pass++) for (let i = 1; i < N; i++) { const mid = lerp(path[i - 1].p, path[i + 1].p, 0.5), out2 = dot(sub(mid, path[i].p), path[i].n); if (out2 > 0) path[i].p = add(path[i].p, mul(path[i].n, out2)); }
            const skin = p => C.skinAt(p, false);
            roll(m, path, width, 0.004 * s, color.map(c => c * (0.92 + 0.12 * rand())), skin, { sides: 5 });
            // Tied off at the top: a short end tucked under.
            const q = path[2], t2 = norm(sub(path[4].p, path[0].p));
            m.box(add(q.p, mul(q.n, 0.006 * s)), [t2, norm(cross(q.n, t2)), q.n], [0.01 * s, 0.008 * s, 0.004 * s], 0.003 * s, tone(color, 0.92), skin(q.p));
        }
        if (m.empty) return [];
        const part = fabricPart(m, legs ? 'Shin wraps' : 'Bandaged forearms', legs ? 'canvasWorn' : 'gauze', 0.95, item);
        part.limb = true;
        return [part];
    }

    /** A head wrap: bands of cloth wound round and round over a cap, crossing at the brow, a loose end hanging behind. */
    function headWrap(C, item, out) {
        const F = headFrame(C), s = C.s, head = C.rigid('Head'), m = new GearMesh(), color = linear(item.color || '#9a7a52'), rand = stream(31 + (item.wearSeed | 0));
        const brow = F.brow + 0.006 * s, crown = F.crown;
        // Each band its own height and tilt (lower at the front or behind), a little further out than the last.
        const bands = [[0.04, 0.45], [0.14, -0.6], [0.26, 0.55], [0.36, -0.5], [0.5, 0.35]];
        bands.forEach(([h, tilt], i) => {
            const y0 = brow + (crown - brow) * h, gap = 0.013 * s + i * 0.0022 * s, path = [];
            for (let k = 0; k <= 36; k++) {
                const a = k / 36 * TAU, y = y0 - tilt * 0.04 * s * Math.cos(a) + 0.004 * s * Math.sin(a * 3 + i);
                // Over the crown the head narrows: the band stays on the head, not up in the air.
                path.push({ p: F.point(a, Math.min(y, crown - 0.012 * s), gap), n: F.normal(a, Math.min(y, crown - 0.012 * s)) });
            }
            roll(m, path.slice(0, -1), (0.04 + 0.01 * rand()) * s, (0.009 + 0.004 * rand()) * s, color.map(c => c * (0.88 + 0.16 * rand())), head, { closed: true });
        });
        // The loose end, tucked in behind on the left and hanging to the shoulder.
        const tail = new GearMesh(), a = Math.PI - 0.7, y = brow + 0.01 * s, base = F.point(a, y, 0.026 * s), nn = F.normal(a, y), side = norm(cross(Y, nn)), rows = [];
        for (let r = 0; r <= 6; r++) { const t = r / 6, p = add(add(base, mul(Y, -t * 0.16 * s)), mul(nn, (0.004 + 0.035 * t * t) * s)), w = (0.02 + 0.006 * Math.sin(t * 5)) * s; rows.push([add(p, mul(side, -w)), add(p, mul(side, w * 0.1)), add(p, mul(side, w))]); }
        tail.grid(rows.map(r => [r[0], r[1], r[2]]), tone(color, 0.95), head, () => sub(base, mul(nn, 0.1)), { uvAt: (r, k) => [k * 0.12, r / 6 * 0.34] });
        const W = need('RRCharacterWear', './CharacterWear.js'), pic = W && W.pictures().fray;
        const part = fabricPart(m, 'Head wrap bands', 'canvasWorn', 0.92, item), end = tail.part('Head wrap end', Object.assign({ roughness: 0.95, metalness: 0, doubleSided: true }, pic ? { texture: pic.name, keepColors: true, cutout: true, alphaCutoff: 0.45 } : {}));
        if (pic) out.textures.push(pic);
        return [part, end];
    }

    /** Scrap pauldrons: hubcap domes and riveted sign lames over each shoulder (style: mixed, hubcap, sign). */
    function scrapPauldrons(C, item, out) {
        const s = C.s, style = item.style || 'mixed', m = new GearMesh(), hw = new GearMesh(), straps = new GearMesh(), chain = new GearMesh();
        const metalC = linear(item.trim || '#77746a'), strapC = linear(item.color2 || '#3a2a1c');
        const body = C.built.parts[0], BP = body.positions, src = C.pack.body.source, an = C.an;
        const entries = C.entries || [];
        for (const [side, f, sx] of [['Left', 1, 1], ['Right', 2, -1]]) {
            const kind = style === 'mixed' ? (sx > 0 ? 'hubcap' : 'sign') : style;
            const joint = C.joint(side + 'Arm'), skin = C.rigid(side + 'Arm');
            const sh = C.bone(side + 'Arm').head, el = C.bone(side + 'ForeArm').head, armDir = norm(sub(el, sh));
            // The dome's axis: out over the shoulder point, between up and along the arm.
            // Mostly up, out over the shoulder's point, a little down the arm.
            const axis = norm(add(add(mul(Y, 0.78), mul([sx, 0, 0], 0.5)), mul(armDir, 0.12)));
            const center = add(sh, mul(Y, -0.012 * s));
            // Clear everything under it: the farthest point of the shoulder (body and sleeves) along each direction.
            const cand = [];
            // Only the shoulder under it: the arm's skin and sleeve, the trunk's skin and cloth out past the collar.
            const shoulder = q => Math.abs(q[0]) > Math.abs(sh[0]) * 0.62;
            for (let v = 0; v < BP.length / 3; v++) { const q = [BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]], d = sub(q, center); if (len(d) < 0.15 * s && dot(d, axis) > -0.02 * s && (an.member[src[v] * 5 + f] > 0.3 || shoulder(q))) cand.push(d); }
            for (const e of entries) { const P = e.laid.positions, Fd = e.laid.field; for (let v = 0; v < P.length / 3; v++) { const q = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], d = sub(q, center), fam = Fd && Fd[e.laid.origin ? e.laid.origin[v] : v] ? Fd[e.laid.origin ? e.laid.origin[v] : v].fam : 0; if (len(d) < 0.15 * s && dot(d, axis) > -0.02 * s && (fam === f || shoulder(q))) cand.push(d); } }
            const reach = dir => { let best = 0.045 * s; for (const d of cand) { const t = dot(d, dir); if (t > best && len(sub(d, mul(dir, t))) < 0.02 * s) best = t; } return best; };
            const x = norm(cross(axis, [0, 0, 1])), y = cross(axis, x);
            // A formed shell: a flattened dome (hammered round, not following the shoulder's bumps), scaled
            // until it clears everything under it by a finger's width.
            const flat = kind === 'hubcap' ? 0.62 : 0.8, maxPolar = kind === 'hubcap' ? 1.02 : 1.2;
            const dirOf = (polar, az) => norm(add(mul(axis, Math.cos(polar)), mul(add(mul(x, Math.cos(az)), mul(y, Math.sin(az))), Math.sin(polar))));
            const unit = polar => 1 / Math.sqrt((Math.cos(polar) / flat) ** 2 + Math.sin(polar) ** 2);
            let scale = 0.09 * s;
            for (let i = 0; i <= 8; i++) for (let k = 0; k < 16; k++) { const polar = i / 8 * maxPolar, dir = dirOf(polar, k / 16 * TAU); scale = Math.max(scale, (reach(dir) + 0.011 * s) / unit(polar)); }
            scale = Math.min(scale, 0.13 * s);
            const at = (polar, az, k = 1) => add(center, mul(dirOf(polar, az), scale * k * unit(polar)));
            const rows = 9, cols = 32;
            if (kind === 'hubcap') {
                // The hubcap: its pressed rings and vents from the cell, the rim turned down and in.
                const grid = [], back = [];
                for (let r = 0; r <= rows; r++) {
                    const t = r / rows, polar = t * maxPolar, lip = r === rows ? 0.94 : 1, row = [], brow = [];
                    for (let k = 0; k <= cols; k++) { const az = k / cols * TAU; row.push(at(polar, az, lip)); brow.push(at(polar, az, lip - 0.03)); }
                    grid.push(row); back.push(brow);
                }
                m.grid(grid, [1, 1, 1], skin, () => center, { uvAt: (r, k) => { const t = r / rows * 0.48, az = k / cols * TAU; return cellUv(SCRAP.hubcap, 0.5 + Math.cos(az) * t, 0.5 + Math.sin(az) * t); } });
                m.grid([grid[rows], back[rows]], [0.6, 0.6, 0.6], skin, () => center, { uvAt: () => cellUv(SCRAP.hubcap, 0.98, 0.5) });
                m.grid(back, [0.45, 0.45, 0.45], skin, p => add(p, mul(sub(p, center), 1)), { uvAt: () => cellUv(SCRAP.rust, 0.5, 0.5) });
                for (let k = 0; k < 5; k++) { const p = grid[rows - 1][Math.round(k / 5 * cols)], n = norm(sub(p, center)); rivet(hw, p, n, 0.0048 * s, metalC, skin); }
                rivet(hw, grid[0][0], axis, 0.011 * s, tone(metalC, 1.1), skin);
            } else {
                // Three lames cut from road signs and a car door, each lapping over the one below and riveted at its ends.
                for (let lame = 0; lame < 3; lame++) {
                    const p0 = lame === 0 ? 0 : 0.18 + lame * 0.36, p1 = 0.55 + lame * 0.36, k0 = 1 + (2 - lame) * 0.045, grid = [], back = [];
                    const span = lame === 0 ? TAU : 2.9, a0 = lame === 0 ? 0 : -span / 2, n = lame === 0 ? cols : 16;
                    for (let r = 0; r <= 4; r++) {
                        const polar = p0 + (p1 - p0) * r / 4, row = [], brow = [];
                        for (let k = 0; k <= n; k++) { const az = a0 + span * k / n; row.push(at(polar, az, k0)); brow.push(at(polar, az, k0 - 0.025)); }
                        grid.push(row); back.push(brow);
                    }
                    const cell = lame === 0 ? SCRAP.signYellow : lame === 1 ? SCRAP.signStripe : SCRAP.panelRed;
                    m.grid(grid, [1, 1, 1], skin, () => center, { uvAt: (r, k) => lame === 0 ? cellUv(cell, 0.5 + Math.cos(k / n * TAU) * r / 4 * 0.5, 0.5 + Math.sin(k / n * TAU) * r / 4 * 0.5) : cellUv(cell, k / n, 0.3 + 0.4 * r / 4) });
                    m.grid(back, [0.45, 0.45, 0.45], skin, p => add(p, mul(sub(p, center), 1)), { uvAt: () => cellUv(SCRAP.rust, 0.5, 0.5) });
                    m.grid([grid[4], back[4]], [0.6, 0.6, 0.6], skin, () => center, { uvAt: () => cellUv(cell, 0.99, 0.5) });
                    if (lame > 0) for (const k of [1, n - 1]) { const p = grid[2][k]; rivet(hw, p, norm(sub(p, center)), 0.0045 * s, metalC, skin); }
                    else rivet(hw, grid[0][0], axis, 0.009 * s, metalC, skin);
                }
            }
            // A strap from the pauldron in to the collar, buckled.
            const inner = add(center, mul(norm(add(axis, mul([sx, 0, 0], -1.4))), 0.09 * s));
            const n0 = C.radialAt(sx * 1.2, C.neck[1] - 0.04 * s, 0.01 * s);
            const path = []; for (let i = 0; i <= 8; i++) { const t = i / 8, p = lerp(inner, n0, t); path.push({ p: add(p, [0, 0.01 * s * Math.sin(Math.PI * t), 0]), n: norm(add(Y, [sx * 0.3 * (1 - t), 0, 0])) }); }
            strap(straps, path, 0.028 * s, 0.003 * s, strapC, p => C.skinAt(p, false));
            void joint;
        }
        if (style === 'mixed') {
            // A length of chain slung between them across the chest.
            const a = C.radialAt(0.9, C.neck[1] - 0.06 * C.s, 0.02 * C.s), b = C.radialAt(-0.9, C.neck[1] - 0.07 * C.s, 0.02 * C.s);
            const links = 18, lr = 0.0105 * C.s;
            for (let i = 0; i < links; i++) {
                const t = (i + 0.5) / links, ang = 0.9 - 1.8 * t, sag = 0.11 * C.s * Math.sin(Math.PI * t), yy = C.neck[1] - 0.065 * C.s - sag;
                const p = C.radialAt(ang, yy, 0.024 * C.s), next = C.radialAt(0.9 - 1.8 * Math.min(1, t + 0.02), C.neck[1] - 0.065 * C.s - 0.11 * C.s * Math.sin(Math.PI * Math.min(1, t + 0.02)), 0.024 * C.s), tng = norm(sub(next, p)), n = C.radialNormal(ang, yy);
                const plane = i % 2 ? n : norm(cross(tng, n)), xx = tng, yv = norm(cross(plane, xx));
                const loop = []; for (let k = 0; k <= 9; k++) { const th = k / 9 * TAU; loop.push(add(p, add(mul(xx, Math.cos(th) * lr * 1.4), mul(yv, Math.sin(th) * lr * 0.8)))); }
                chain.tube(loop, 0.0019 * C.s, 4, linear('#3e3a36'), C.skinAt(p, true), { caps: false });
            }
            void a; void b;
        }
        const sh = pictures(), parts = [];
        if (!m.empty) { const p = Object.assign(m.part('Scrap pauldrons', { texture: sh.albedo.name, keepColors: true, roughness: 1, metalness: 1, limb: true }), { normalTexture: sh.normal.name, normalTexCoord: 1, normalScale: 1, metallicRoughnessTexture: sh.finish.name, metallicRoughnessTexCoord: 1 }); p.uvs1 = Float32Array.from(p.uvs); parts.push(p); out.textures.push(sh.albedo, sh.normal, sh.finish); }
        if (!straps.empty) parts.push(fabricPart(straps, 'Pauldron straps', 'leatherWorn', 0.7, item));
        if (!hw.empty) parts.push(hw.part('Pauldron rivets', { roughness: 0.45, metalness: 0.8, limb: true }));
        if (!chain.empty) parts.push(Object.assign(chain.part('Scrap chain', { roughness: 0.55, metalness: 0.75 }), { limb: true }));
        return parts;
    }

    /**
     * A medieval plate piece in the Scrap style (RRCharacterPowerArmor's riveted plates): each plate
     * repainted in a color of its own from what was to hand (faded teal, red, olive, mustard, primer,
     * bare rusted steel), keeping its form's shading; painted, so its edges chip to bare metal
     * (RRCharacterGarmentDetails.armorFinish); rusted and grimed.
     */
    function scrapFinish(parts, item, built) {
        // Faded and dulled by the weather.
        const palette = [[0.04, 0.09, 0.085], [0.15, 0.05, 0.035], [0.07, 0.075, 0.045], [0.22, 0.15, 0.05], [0.1, 0.1, 0.1], [0.1, 0.06, 0.035]];
        const base = linear(item.color || '#b6bcc4'), lb = Math.max(0.02, 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]), seed = (item.wearSeed | 0) * 13 + 5;
        for (const p of parts) {
            if (!p.colors || !/^Medieval /.test(p.name) || / (straps|etching|tooling)$/.test(p.name)) continue;
            // Each connected plate (its own triangles) one color.
            const n = p.positions.length / 3, parent = Int32Array.from({ length: n }, (_, i) => i);
            const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
            for (let t = 0; t < p.index.length; t += 3) { const a = find(p.index[t]), b = find(p.index[t + 1]), c = find(p.index[t + 2]); parent[b] = a; parent[find(c)] = a; }
            for (let v = 0; v < n; v++) {
                const c = palette[Math.floor(ihash(find(v), seed, 3) * palette.length)], k = (0.2126 * p.colors[v * 3] + 0.7152 * p.colors[v * 3 + 1] + 0.0722 * p.colors[v * 3 + 2]) / lb;
                const edges = / edges$/.test(p.name);
                for (let q = 0; q < 3; q++) p.colors[v * 3 + q] = Math.min(1, (edges ? c[q] * 0.7 + 0.04 : c[q]) * Math.min(1.6, k));
            }
            p.finish = 'painted';
            p.roughness = Math.max(p.roughness ?? 0.5, 0.55);
        }
        const Wear = need('RRCharacterWear', './CharacterWear.js');
        if (Wear) Wear.weatherParts(parts.filter(p => /^Medieval /.test(p.name)), Object.assign({}, item, { wear: Math.max(0.6, item.wear || 0) }), built);
    }

    // ── building ──────────────────────────────────────────────────────────
    // Built in this order, each fitted over the ones before it.
    const ORDER = ['ragWraps', 'scrapArmor', 'toolBelt', 'harness', 'scrapPauldrons', 'capelet', 'poncho', 'legWraps', 'bandages', 'bootWraps', 'headWrap', 'faceVeil', 'gasMask', 'goggles'];
    const MAKERS = { scrapArmor, scrapPauldrons, harness, toolBelt, gasMask, goggles, bootWraps, headWrap, faceVeil, poncho, ragWraps,
        bandages: (C, item, out, shoeParts) => limbWrap(C, item, out, shoeParts, false), legWraps: (C, item, out, shoeParts) => limbWrap(C, item, out, shoeParts, true),
        // A duster's storm cape: a short plain poncho over its shoulders, no hood.
        capelet: (C, item, out) => poncho(C, item, out, { length: 0.2, gap: 0.01, hood: false, plain: true, name: 'Shoulder cape', rows: 8, around: 40 }) };

    /**
     * The outfit's wasteland gear: { parts, textures, hidden }. `gear`: [{ item, kind }] from the
     * outfit's pieces; `entries`: the laid soft garments; `shoeParts`: what is made so far (boots).
     */
    function build(pack, built, gear, entries, shoeParts, cache) {
        const out = { parts: [], textures: [], hidden: new Set() };
        if (!gear || !gear.length) return out;
        const C = context(pack, built, entries, shoeParts);
        const Wear = need('RRCharacterWear', './CharacterWear.js');
        const sorted = gear.slice().sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
        for (const g of sorted) {
            const make = MAKERS[g.kind];
            if (!make) continue;
            let parts = [];
            try { parts = make(C, Object.assign({ label: g.garment && g.garment.label }, g.item), out, shoeParts) || []; }
            catch (err) { if (root.RR_WASTELAND_STRICT) throw err; parts = []; }
            parts = parts.filter(p => p && p.index && p.index.length);
            // A part with no picture of its own carries no picture coordinates.
            for (const p of parts) if (!p.texture && !p.normalTexture && !p.metallicRoughnessTexture) delete p.uvs;
            if (Wear && g.item.wear > 0) Wear.weatherParts(parts.filter(p => !p.texture), g.item, built);
            for (const p of parts) { if (p.trunkGear) { C.addLayer(p); (C.trunkParts || (C.trunkParts = [])).push(p); } out.parts.push(p); }
        }
        out.textures.push(...tilePictures(out.parts));
        out.textures = [...new Map(out.textures.map(t => [t.name, t])).values()];
        return out;
    }

    const api = { build, pictures, scrapFinish, SCRAP, GearMesh, context, headFrame };
    root.RRCharacterWasteland = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
