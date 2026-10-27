/**
 * RRCharacterCyberwear - cyberpunk clothing and cyber armor for the Character Builder.
 *
 * Soft techwear is cut by RRCharacterOutfit like every garment (so the drape, construction
 * details and wear apply to it); this file adds what is bonded to the finished cloth, each
 * vertex sewn to the fabric vertex under it (`sewnRefs`, so the cloth rig carries it):
 *   laminated panels   glossy overlays welded on (shoulder yokes, knee panels, pockets, inserts)
 *   light channels     a glowing core sunk between two raised lips, along iso-lines of the cloth
 *   LED piping         a glowing bead along a garment's cut edges
 *   sealed zips, magnetic tabs, straps with buckles, translucent glowing inserts
 * Hard cyber armor is layered polymer/ceramic plate formed over the body and the clothes laid
 * under it, rigid on its bones: chest, back and segmented abdominal plates, pauldrons, bracers,
 * thigh, knee and shin plates, with chamfered rolled edges, real gaps as panel lines, vents,
 * pistons at the joints and glowing seams. Its Style is one of the four cyber styles shared with
 * the body mods (RRCharacterBodyArt.CYBER_STYLES): sleek, military, salvaged, glowing (neon).
 *
 *   garments(kit)   GARMENTS entries (group 'Cyberpunk'); `kit` holds RRCharacterWardrobe's cut
 *                   helpers (top, legs, hood, shoe, hands, vFront, skirtPiece, BODICE, ...)
 *   PRESETS         one-click outfits
 *   build(pack, built, gear, entries, shoeParts, cache)   { parts, textures, hidden } for the
 *                   outfit's cyber gear ({ item, kind, layer }, the garments' `cyberGear` pieces)
 *   glowMask(item, p)   the light painted into a garment's own cloth (RRCharacterAtlas lightMask)
 *
 * An item's colors: `color` the main cloth or plate, `color2` second panels, `trim` hardware and
 * frames; its light: `lightStyle` (none: off, badge: indicators only, strips: channels,
 * circuits: channels and traces), `lightColor`, `lightIntensity`, `lightWidth`; `wear`.
 * Nothing is copied from any game's or film's designs; shapes are drawn here from measures.
 */
(function(root) {
    'use strict';
    const need = (name, file) => { if (root[name]) return root[name]; try { return typeof require === 'function' ? require(file) : null; } catch (e) { return null; } };
    const TAU = Math.PI * 2;
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]), norm = (a, f = [0, 1, 0]) => { const l = len(a); return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : f.slice(); };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x), clamp01 = x => clamp(x, 0, 1);
    const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const wrap = a => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a; };
    const fract = x => x - Math.floor(x);
    const srgb = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const isHex = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
    const linear = hex => { const n = parseInt((isHex(hex) ? hex : '#808080').slice(1), 16); return [srgb(((n >> 16) & 255) / 255), srgb(((n >> 8) & 255) / 255), srgb((n & 255) / 255)]; };
    const tone = (c, k) => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
    const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
    function ihash(x, y, z) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
    function noise2(x, y, s) { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = ihash(ix, iy, s), b = ihash(ix + 1, iy, s), c = ihash(ix, iy + 1, s), d = ihash(ix + 1, iy + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }

    // ── the four cyber styles ─────────────────────────────────────────────
    /** The body mods' styles when that module is loaded (RRCharacterBodyArt.CYBER_STYLES), else the same palette here. */
    const LOCAL_STYLES = [
        { id: 'sleek', label: 'Sleek prosthetic', base: '#e8ebee', trim: '#a9b2bb', joint: '#2a2e35', glow: '#7cd8ff', metalness: 0.25, roughness: 0.3, trimMetalness: 0.85, trimRoughness: 0.22, glowAmount: 0.45 },
        { id: 'military', label: 'Military', base: '#4b5341', trim: '#2b2e2c', joint: '#18191a', glow: '#ff9a3a', metalness: 0.45, roughness: 0.66, trimMetalness: 0.8, trimRoughness: 0.45, glowAmount: 0.35 },
        { id: 'salvaged', label: 'Salvaged', base: '#8a6d4c', trim: '#6a7179', joint: '#2a2621', glow: '#ffcf5a', metalness: 0.55, roughness: 0.72, trimMetalness: 0.75, trimRoughness: 0.55, glowAmount: 0.3 },
        { id: 'neon', label: 'Glowing high-tech', base: '#1b2030', trim: '#4a5672', joint: '#0c0e14', glow: '#38e6ff', metalness: 0.7, roughness: 0.24, trimMetalness: 0.9, trimRoughness: 0.18, glowAmount: 1 }
    ];
    function cyberStyle(id) {
        const BA = root.RRCharacterBodyArt || null;
        const list = (BA && Array.isArray(BA.CYBER_STYLES) && BA.CYBER_STYLES.length) ? BA.CYBER_STYLES : LOCAL_STYLES;
        return list.find(s => s.id === id) || LOCAL_STYLES.find(s => s.id === id) || LOCAL_STYLES[1];
    }
    const ARMOR_STYLES = [['sleek', 'Sleek'], ['military', 'Military'], ['salvaged', 'Salvaged'], ['neon', 'Glowing']];
    /** Mismatched scrap panel tints for salvaged plate (multiplied into its own color). */
    const SCRAP_TINTS = ['#a6b8b4', '#d8d2c6', '#c47a52', '#9aa0aa', '#b8a070', '#7f8a78'];

    // ── a skinned mesh, optionally sewn to cloth ──────────────────────────
    class Mesh {
        constructor() { this.p = []; this.n = []; this.c = []; this.j = []; this.w = []; this.uv = []; this.i = []; this.refs = []; this.roots = []; this.hang = []; this.sewn = 0; }
        get empty() { return !this.i.length; }
        get count() { return this.p.length / 3; }
        at(v) { return [this.p[v * 3], this.p[v * 3 + 1], this.p[v * 3 + 2]]; }
        v(p, n, c, skin, uv, sewn) {
            const k = this.p.length / 3;
            this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]);
            this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
            for (let q = 0; q < 4; q++) { this.j.push(skin.joints[q] || 0); this.w.push(skin.weights[q] || 0); }
            if (sewn) { this.refs.push(sewn.entry, sewn.ref); this.roots.push(sewn.root[0], sewn.root[1], sewn.root[2]); this.hang.push(sewn.hang); this.sewn++; }
            return k;
        }
        /** A triangle wound to face the way its corners' normals point. */
        tri(a, b, c) {
            if (a === b || b === c || a === c) return;
            const A = this.at(a), f = cross(sub(this.at(b), A), sub(this.at(c), A));
            const h = [0, 1, 2].map(k => this.n[a * 3 + k] + this.n[b * 3 + k] + this.n[c * 3 + k]);
            if (dot(f, h) < 0) this.i.push(a, c, b); else this.i.push(a, b, c);
        }
        quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
        /** Smooth normals for the vertices from `from` on, from their faces (each kept on its hint's side). */
        smooth(from = 0, fromTri = 0) {
            const n = this.count, N = new Float64Array((n - from) * 3);
            for (let t = fromTri; t < this.i.length; t += 3) {
                const a = this.i[t], b = this.i[t + 1], c = this.i[t + 2];
                if (a < from || b < from || c < from) continue;
                const A = this.at(a), f = cross(sub(this.at(b), A), sub(this.at(c), A));
                for (const x of [a, b, c]) for (let k = 0; k < 3; k++) N[(x - from) * 3 + k] += f[k];
            }
            for (let x = from; x < n; x++) {
                const v = [N[(x - from) * 3], N[(x - from) * 3 + 1], N[(x - from) * 3 + 2]];
                if (len(v) < 1e-14) continue;
                const u = norm(v);
                this.n[x * 3] = u[0]; this.n[x * 3 + 1] = u[1]; this.n[x * 3 + 2] = u[2];
            }
        }
        part(name, material) {
            // Picture coordinates only for a part with a picture of its own (tiles take their own second set).
            const out = Object.assign({ name, positions: Float32Array.from(this.p), normals: Float32Array.from(this.n), colors: Float32Array.from(this.c),
                joints: Uint8Array.from(this.j), weights: Float32Array.from(this.w), index: Uint32Array.from(this.i) }, material && material.texture ? { uvs: Float32Array.from(this.uv) } : {}, material);
            if (this.sewn && this.sewn === this.count) {
                Object.assign(out, { sewnRefs: Int32Array.from(this.refs), sewnRoots: Float32Array.from(this.roots), clothDetail: true, onSkin: true });
                if (this.hang.some(h => h >= 0)) out.hang = Float32Array.from(this.hang);
            }
            return out;
        }
    }
    /** A part's tile (RRCharacterFabric) on coordinates projected along each vertex's main axis. */
    function withTile(part, kind, roughness, normalScale) {
        const Fabric = need('RRCharacterFabric', './CharacterFabric.js');
        if (!Fabric || !Fabric.tile || !Fabric.tile(kind)) return part;
        Fabric.applyTo(part, kind, null, { roughness, normalScale });
        part.fabricTile = kind;
        return part;
    }

    // ── the body as worn ──────────────────────────────────────────────────
    function context(pack, built, entries, shoeParts) {
        const O = need('RRCharacterOutfit', './CharacterOutfit.js'), an = O.anatomy(pack), s = built.height / 1.7;
        const body = built.parts[0], src = pack.body.source, bones = built.bones;
        const bone = name => bones.find(b => b.name === name), joint = name => Math.max(0, bones.findIndex(b => b.name === name));
        const hips = bone('Hips').head, neck = bone('Neck').head, head = bone('Head').head;
        const chains = {};
        ['spine', 'armL', 'armR', 'legL', 'legR'].forEach((f, fi) => {
            chains[fi] = O.CHAINS[f].map(entry => { const tail = entry.endsWith('>'), b = bone(entry.replace('>', '')); return (tail ? b.tail : b.head).slice(); });
        });
        const cell = 0.03, grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z, BP = body.positions, nb = BP.length / 3;
        for (let v = 0; v < nb; v++) { const k = key(Math.floor(BP[v * 3] / cell), Math.floor(BP[v * 3 + 1] / cell), Math.floor(BP[v * 3 + 2] / cell)); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(v); }
        const nearestBody = (p, accept) => {
            const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
            for (let r = 1; r <= 6; r++) {
                let best = -1, bd = Infinity;
                for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
                    if (r > 1 && Math.max(Math.abs(i), Math.abs(j), Math.abs(k)) !== r) continue;
                    for (const v of grid.get(key(cx + i, cy + j, cz + k)) || []) { if (accept && !accept(v)) continue; const d = (BP[v * 3] - p[0]) ** 2 + (BP[v * 3 + 1] - p[1]) ** 2 + (BP[v * 3 + 2] - p[2]) ** 2; if (d < bd) { bd = d; best = v; } }
                }
                if (best >= 0) return best;
            }
            return 0;
        };
        const skinOf = v => ({ joints: Array.from(body.joints.subarray(v * 4, v * 4 + 4)), weights: Array.from(body.weights.subarray(v * 4, v * 4 + 4)) });
        const skinAt = (p, accept) => skinOf(nearestBody(p, accept));
        const rigid = name => ({ joints: [joint(name), 0, 0, 0], weights: [1, 0, 0, 0] });
        const axisAt = y => { const t = clamp01((y - hips[1]) / (neck[1] - hips[1])); return [hips[0] + (neck[0] - hips[0]) * t, y, hips[2] + (neck[2] - hips[2]) * t]; };
        return { pack, built, O, an, s, body, src, bone, joint, hips, neck, head, chains, nearestBody, skinOf, skinAt, rigid, axisAt, entries: entries || [], shoeParts: shoeParts || [], trunkUnit: (neck[1] - hips[1]) / 4, shoulderY: bone('LeftArm').head[1], chestZ: (v => v)(hips[2]) };
    }

    /** A limb's frame at chain position s: its axis point, direction, front and outer side (away from the body's midline). */
    function limbFrame(C, fam, s) {
        const ch = C.chains[fam], i = clamp(Math.floor(s), 0, ch.length - 2), t = s - i;
        const A = ch[i], B = ch[i + 1], d = norm(sub(B, A)), at = lerp(A, B, t);
        const f = norm(sub(Z, mul(d, dot(Z, d))));
        const side = fam === 1 || fam === 3 ? 1 : -1, sx = [side, 0, 0];
        let o = sub(sx, add(mul(d, dot(sx, d)), mul(f, dot(sx, f))));
        o = len(o) > 1e-6 ? norm(o) : norm(cross(d, f));
        return { at, d, f, o, unit: len(sub(B, A)) };
    }

    // ── cloth surfaces ────────────────────────────────────────────────────
    /**
     * A laid garment piece for bonding things to: its outer faces (not the turned hem), normals
     * turned out from the body, and each vertex's coordinates on the body: family (0 trunk, 1-4
     * limbs), position along the chain `s`, angle `a` (trunk: bearing, 0 in front and + to the
     * body's left; limb: 0 in front and + to its outer side), its radius `r` from the axis and
     * `U` meters per chain step (so a·r and s·U are meters), and `e` its distance from the cut edge.
     */
    function clothSurface(C, entry) {
        const L = entry.laid, n = L.rimStart, P = L.positions, I = L.index, tris = [];
        for (let t = 0; t < I.length; t += 3) if (I[t] < n && I[t + 1] < n && I[t + 2] < n) tris.push(I[t], I[t + 1], I[t + 2]);
        const N = new Float32Array(n * 3);
        for (let t = 0; t < tris.length; t += 3) {
            const a = tris[t] * 3, b = tris[t + 1] * 3, c = tris[t + 2] * 3;
            const u = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], w = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]], f = cross(u, w);
            for (const x of [a, b, c]) { N[x] += f[0]; N[x + 1] += f[1]; N[x + 2] += f[2]; }
        }
        let vote = 0;
        for (let v = 0; v < n; v++) {
            const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1; N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l;
            if (L.base) vote += Math.sign((P[v * 3] - L.base[v * 3]) * N[v * 3] + (P[v * 3 + 1] - L.base[v * 3 + 1]) * N[v * 3 + 1] + (P[v * 3 + 2] - L.base[v * 3 + 2]) * N[v * 3 + 2]);
        }
        if (vote < 0) for (let k = 0; k < N.length; k++) N[k] = -N[k];
        // Eased over the cloth's creases (a heavy neck's rolls, a bunched collar): panels and tapes stood off
        // along a crease's sharp normals cross each other and break up; along eased ones they ride over it.
        for (let pass = 0; pass < 3; pass++) {
            const M = Float32Array.from(N);
            for (let t = 0; t < tris.length; t += 3) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== j) { const a = tris[t + i] * 3, b = tris[t + j] * 3; M[a] += N[b] * 0.5; M[a + 1] += N[b + 1] * 0.5; M[a + 2] += N[b + 2] * 0.5; }
            for (let v = 0; v < n; v++) { const l = Math.hypot(M[v * 3], M[v * 3 + 1], M[v * 3 + 2]); if (l > 1e-9) { N[v * 3] = M[v * 3] / l; N[v * 3 + 1] = M[v * 3 + 1] / l; N[v * 3 + 2] = M[v * 3 + 2] / l; } }
        }
        const coords = new Array(n);
        const S = { entry, L, n, tris, N, C,
            p: v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]],
            nv: v => [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]],
            co: v => coords[v] || (coords[v] = coordOf(C, L, v)) };
        return S;
    }
    function coordOf(C, L, v) {
        const F = L.field[v] || { fam: 0, s: 2, spineAng: 0 }, p = [L.positions[v * 3], L.positions[v * 3 + 1], L.positions[v * 3 + 2]];
        const e = L.edge && v < L.edge.length ? L.edge[v] : 1;
        if (F.fam === 0) { const ax = C.axisAt(p[1]); return { fam: 0, s: F.s, a: F.spineAng, r: Math.max(0.02, Math.hypot(p[0] - ax[0], p[2] - ax[2])), U: C.trunkUnit, e, x: p[0], y: p[1], z: p[2] }; }
        const fr = limbFrame(C, F.fam, F.s), q = sub(p, fr.at), qq = sub(q, mul(fr.d, dot(q, fr.d)));
        return { fam: F.fam, s: F.s, a: Math.atan2(dot(qq, fr.o), dot(qq, fr.f)), r: Math.max(0.01, len(qq)), U: fr.unit, e, x: p[0], y: p[1], z: p[2] };
    }
    /** Coordinates between two (an angle the short way round). */
    function mixCo(A, B, t) {
        return { fam: t < 0.5 ? A.fam : B.fam, s: A.s + (B.s - A.s) * t, a: A.a + wrap(B.a - A.a) * t, r: A.r + (B.r - A.r) * t, U: A.U + (B.U - A.U) * t, e: A.e + (B.e - A.e) * t, x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t };
    }
    function mixW(A, B, t) {
        const m = new Map();
        for (const [v, w] of A) m.set(v, (m.get(v) || 0) + w * (1 - t));
        for (const [v, w] of B) m.set(v, (m.get(v) || 0) + w * t);
        return [...m].filter(q => q[1] > 1e-5).sort((a, b) => b[1] - a[1]).slice(0, 4);
    }
    /** A bonded point's skin (blended from the cloth's) and the fabric vertex it is sewn to. */
    function bind(S, w) {
        const L = S.L, m = new Map();
        for (const [v, k] of w) for (let q = 0; q < 4; q++) { const j = L.joints[v * 4 + q], x = L.weights[v * 4 + q] * k; if (x > 0) m.set(j, (m.get(j) || 0) + x); }
        const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4), tot = top.reduce((s, q) => s + q[1], 0) || 1;
        const ref = w[0][0];
        return { skin: { joints: [0, 1, 2, 3].map(q => top[q] ? top[q][0] : 0), weights: [0, 1, 2, 3].map(q => top[q] ? top[q][1] / tot : 0) },
            sewn: { entry: L.fabricEntry ?? 0, ref, root: S.p(ref), hang: L.hang ? L.hang[ref] ?? -1 : -1 } };
    }

    /**
     * The part of the cloth where fn(coords) ≥ 0 (fn: signed meters, inside positive), its border
     * cut exactly at the zero level: triangles the border crosses are refined `depth` times (the
     * level re-measured at each new point, so a curved outline stays curved), then clipped.
     * Returns { V: [{ key, p, n, co, w }], T: [[i, j, k]] }, welded.
     */
    function region(S, fn, depth = 1) {
        const V = [], T = [], index = new Map(), base = new Array(S.n), mids = new Map(), cuts = new Map();
        const orig = v => base[v] || (base[v] = { key: 'v' + v, p: S.p(v), n: S.nv(v), co: S.co(v), w: [[v, 1]], f: fn(S.co(v)) });
        const pairKey = (A, B) => (A.key < B.key ? A.key + '|' + B.key : B.key + '|' + A.key);
        const mid = (A, B) => { const k = pairKey(A, B); let M = mids.get(k); if (!M) { const c = mixCo(A.co, B.co, 0.5); M = { key: 'm(' + k + ')', p: lerp(A.p, B.p, 0.5), n: norm(add(A.n, B.n)), co: c, w: mixW(A.w, B.w, 0.5), f: fn(c) }; mids.set(k, M); } return M; };
        const cut = (A, B) => {
            const k = pairKey(A, B); let M = cuts.get(k);
            if (!M) { const [P, Q] = A.key < B.key ? [A, B] : [B, A], t = P.f / (P.f - Q.f); M = { key: 'x(' + k + ')', p: lerp(P.p, Q.p, t), n: norm(lerp(P.n, Q.n, t)), co: mixCo(P.co, Q.co, t), w: mixW(P.w, Q.w, t), f: 0 }; cuts.set(k, M); }
            return M;
        };
        const out = X => { let i = index.get(X.key); if (i == null) { i = V.length; index.set(X.key, i); V.push(X); } return i; };
        const split = (A, B) => (A.f >= 0) !== (B.f >= 0);
        const emit = (A, B, D, d) => {
            const inn = (A.f >= 0) + (B.f >= 0) + (D.f >= 0);
            if (inn === 3) { T.push([out(A), out(B), out(D)]); return; }
            if (inn === 0 && (d <= 0 || Math.min(Math.abs(A.f), Math.abs(B.f), Math.abs(D.f)) > len(sub(A.p, B.p)))) return;
            if (d > 0) {
                const sAB = split(A, B), sBD = split(B, D), sDA = split(D, A), k = sAB + sBD + sDA;
                if (k === 3 || (k === 0 && inn === 0)) { const ab = mid(A, B), bd = mid(B, D), da = mid(D, A); emit(A, ab, da, d - 1); emit(ab, B, bd, d - 1); emit(da, bd, D, d - 1); emit(ab, bd, da, d - 1); return; }
                if (k === 2) {
                    // Rotate so the edges split are A-B and B-D.
                    if (!sAB) { emit(B, D, A, d); return; }
                    if (!sBD) { emit(D, A, B, d); return; }
                    const ab = mid(A, B), bd = mid(B, D);
                    emit(ab, B, bd, d - 1); emit(A, ab, bd, d - 1); emit(A, bd, D, d - 1); return;
                }
                if (k === 1) {
                    if (!sAB) { if (sBD) { emit(B, D, A, d); return; } emit(D, A, B, d); return; }
                    const ab = mid(A, B); emit(A, ab, D, d - 1); emit(ab, B, D, d - 1); return;
                }
            }
            if (inn === 0) return;
            const poly = [A, B, D], res = [];
            for (let i = 0; i < 3; i++) { const P = poly[i], Q = poly[(i + 1) % 3]; if (P.f >= 0) res.push(P); if ((P.f >= 0) !== (Q.f >= 0)) res.push(cut(P, Q)); }
            for (let k = 1; k + 1 < res.length; k++) T.push([out(res[0]), out(res[k]), out(res[k + 1])]);
        };
        const tr = S.tris;
        for (let t = 0; t < tr.length; t += 3) {
            const A = orig(tr[t]), B = orig(tr[t + 1]), D = orig(tr[t + 2]);
            if (A.f < -0.06 && B.f < -0.06 && D.f < -0.06) continue;
            emit(A, B, D, depth);
        }
        return { V, T };
    }

    /**
     * A laminated panel over a region: its face `lift` off the cloth, its border turned down to the
     * cloth with a rounded edge (`inset` in from the cut). Colors by `colorAt(co)`.
     */
    function panel(m, S, R, { lift, inset = 0.0008, color, colorAt = null, edgeShade = 0.82, foot = 0.0002, skip = null }) {
        if (!R.T.length) return;
        const s = S.C.s;
        R = lighten(R, s);
        const V = R.V, n = V.length;
        // Border edges: used by one face; each with its face's third corner.
        const edges = new Map();
        for (const [a, b, c] of R.T) for (const [x, y, z] of [[a, b, c], [b, c, a], [c, a, b]]) { const k = x < y ? x + ',' + y : y + ',' + x; const e = edges.get(k); if (e) e.n++; else edges.set(k, { x, y, z, n: 1 }); }
        const out = new Array(n).fill(null), border = new Set();
        for (const e of edges.values()) if (e.n === 1) {
            const P = V[e.x].p, Q = V[e.y].p, W = V[e.z].p, mid = lerp(P, Q, 0.5), nn = norm(add(V[e.x].n, V[e.y].n));
            let o = sub(mid, W); o = sub(o, mul(nn, dot(o, nn))); o = norm(o);
            for (const v of [e.x, e.y]) { out[v] = out[v] ? add(out[v], o) : o; border.add(v); }
        }
        const top = new Array(n), foot0 = new Map(), keep = R.T.filter(t => !skip || !t.every(v => skip(V[v])));
        const binds = V.map(X => bind(S, X.w));
        for (let v = 0; v < n; v++) {
            const X = V[v], b = binds[v], c = colorAt ? colorAt(X.co) : color;
            const o = out[v] ? norm(out[v]) : null;
            const p = add(X.p, mul(X.n, lift * s));
            top[v] = m.v(o ? add(p, mul(o, -inset * s)) : p, X.n, c, b.skin, [X.p[0], X.p[1]], b.sewn);
            if (o) foot0.set(v, m.v(add(X.p, mul(X.n, foot * s)), norm(add(mul(o, 0.85), mul(X.n, 0.35))), tone(c, edgeShade), b.skin, [X.p[0], X.p[1]], b.sewn));
        }
        for (const [a, b, c] of keep) m.tri(top[a], top[b], top[c]);
        const used = new Set(keep.flat());
        for (const e of edges.values()) if (e.n === 1 && used.has(e.x) && used.has(e.y)) m.quad(top[e.x], top[e.y], foot0.get(e.y), foot0.get(e.x));
    }

    /**
     * A region's face with fewer triangles where the cloth under it is nearly flat
     * (RRCharacterSimplify: its outline keeps its place, no face folds over).
     */
    function lighten(R, s) {
        const Simplify = need('RRCharacterSimplify', './CharacterSimplify.js');
        if (!Simplify || R.T.length < 24) return R;
        const P = new Float32Array(R.V.length * 3);
        R.V.forEach((X, i) => P.set(X.p, i * 3));
        try {
            const out = Simplify.simplify(P, new Float32Array(R.V.length * 2), Uint32Array.from(R.T.flat()), Math.max(12, Math.round(R.T.length * 0.3)), { maxError: 0.0004 * s, maxEdge: 0.035 * s });
            if (!out || !out.index || !out.index.length) return R;
            const T = [];
            for (let t = 0; t < out.index.length; t += 3) T.push([out.index[t], out.index[t + 1], out.index[t + 2]]);
            return { V: Array.from(out.origin, i => R.V[i]), T };
        } catch (e) { return R; }
    }

    /**
     * Iso-lines of fn over the cloth (where it crosses zero), chained into polylines of points
     * { p, n, w, co }; triangles `accept` turns down are left out.
     */
    function isoPaths(S, fn, accept = null) {
        const f = new Float32Array(S.n), cos = new Array(S.n);
        for (let v = 0; v < S.n; v++) { cos[v] = S.co(v); f[v] = fn(cos[v]); }
        const pts = new Map(), segs = [];
        const point = (a, b) => {
            const [u, w] = a < b ? [a, b] : [b, a], k = u + ',' + w;
            let q = pts.get(k);
            if (!q) { const t = f[u] / (f[u] - f[w]); q = { k, p: lerp(S.p(u), S.p(w), t), n: norm(lerp(S.nv(u), S.nv(w), t)), w: t < 0.5 ? [[u, 1 - t], [w, t]] : [[w, t], [u, 1 - t]], co: mixCo(cos[u], cos[w], t), links: [] }; pts.set(k, q); }
            return q;
        };
        const tr = S.tris;
        for (let t = 0; t < tr.length; t += 3) {
            const ids = [tr[t], tr[t + 1], tr[t + 2]];
            if (accept && !accept(ids.map(v => cos[v]))) continue;
            const cr = [];
            for (let e = 0; e < 3; e++) {
                const a = ids[e], b = ids[(e + 1) % 3];
                // A jump (a wrapped angle's seam, an off-family -1) is not a crossing: a metric field changes no faster than the cloth.
                if ((f[a] >= 0) !== (f[b] >= 0) && Math.abs(f[a] - f[b]) <= 2.5 * len(sub(S.p(a), S.p(b))) + 0.004 * S.C.s) cr.push(point(a, b));
            }
            if (cr.length === 2 && cr[0] !== cr[1]) { cr[0].links.push(cr[1]); cr[1].links.push(cr[0]); segs.push(cr); }
        }
        const seen = new Set(), lines = [];
        const walk = start => {
            const line = [start]; seen.add(start);
            let cur = start;
            for (;;) { const next = cur.links.find(q => !seen.has(q)); if (!next) break; seen.add(next); line.push(next); cur = next; }
            return line;
        };
        for (const q of pts.values()) if (!seen.has(q) && q.links.length === 1) lines.push(walk(q));
        for (const q of pts.values()) if (!seen.has(q) && q.links.length) { const l = walk(q); l.closed = true; lines.push(l); }
        return lines.filter(l => l.length > 1);
    }
    /** Points every `step` meters along a path (closed paths come back round). */
    function resample(path, step) {
        const P = path.closed ? path.concat([path[0]]) : path, out = [P[0]];
        let carry = 0;
        for (let i = 1; i < P.length; i++) {
            const a = P[i - 1], b = P[i], d = len(sub(b.p, a.p));
            let t = step - carry;
            while (t < d) { const k = t / d; out.push({ p: lerp(a.p, b.p, k), n: norm(lerp(a.n, b.n, k)), w: mixW(a.w, b.w, k), co: mixCo(a.co, b.co, k) }); t += step; }
            carry = d - (t - step);
        }
        if (!path.closed && len(sub(out[out.length - 1].p, P[P.length - 1].p)) > step * 0.3) out.push(P[P.length - 1]);
        if (path.closed && out.length > 2 && len(sub(out[out.length - 1].p, out[0].p)) < step * 0.4) out.pop();
        out.closed = !!path.closed;
        return out;
    }
    /** A path's points smoothed along it (positions only, `passes` times), keeping its ends. */
    function smoothPath(path, passes = 2) {
        for (let k = 0; k < passes; k++) {
            const P = path.map(q => q.p);
            for (let i = 0; i < path.length; i++) {
                if (!path.closed && (i === 0 || i === path.length - 1)) continue;
                const a = P[(i - 1 + P.length) % P.length], b = P[(i + 1) % P.length], c = P[i];
                const q = mul(add(add(a, b), mul(c, 2)), 0.25), d = sub(q, c);
                path[i] = Object.assign({}, path[i], { p: sub(q, mul(path[i].n, dot(d, path[i].n))) });
            }
        }
        return path;
    }
    /**
     * A profile swept along a path on the cloth: each strip { mesh, color, pts: [[across, up,
     * normalAcross, normalUp], ...] } in meters (across: to the path's left looking along it).
     */
    function sweep(S, path, strips, opts = {}) {
        const N = path.length; if (N < 2) return;
        const s = S.C.s, closed = !!path.closed;
        const frames = path.map((q, i) => {
            const a = path[closed ? (i - 1 + N) % N : Math.max(0, i - 1)].p, b = path[closed ? (i + 1) % N : Math.min(N - 1, i + 1)].p;
            let t = sub(b, a); t = norm(sub(t, mul(q.n, dot(t, q.n))));
            return { t, b: norm(cross(q.n, t)), bound: bind(S, q.w) };
        });
        for (const st of strips) {
            const rows = path.map((q, i) => st.pts.map(([x, h, nx, nh]) => {
                const F = frames[i], c = typeof st.color === 'function' ? st.color(q.co, i) : st.color;
                return st.mesh.v(add(q.p, add(mul(F.b, x * s), mul(q.n, h * s))), norm(add(mul(F.b, nx), mul(q.n, nh))), c, F.bound.skin, [i * 0.01, x], F.bound.sewn);
            }));
            const segs = closed ? N : N - 1;
            for (let i = 0; i < segs; i++) {
                const A = rows[i], B = rows[(i + 1) % N];
                if (opts.skip && opts.skip(path[i], path[(i + 1) % N])) continue;
                for (let k = 0; k + 1 < A.length; k++) st.mesh.quad(A[k], A[k + 1], B[k + 1], B[k]);
            }
            if (!closed && st.cap) for (const [i, dir] of [[0, -1], [N - 1, 1]]) {
                const R = rows[i], F = frames[i], c = typeof st.color === 'function' ? st.color(path[i].co, i) : st.color, list = [];
                for (const [x, h] of st.pts) list.push(st.mesh.v(add(path[i].p, add(mul(F.b, x * s), mul(path[i].n, h * s))), mul(F.t, dir), tone(c, 0.9), F.bound.skin, [0, 0], F.bound.sewn));
                for (let k = 1; k + 1 < list.length; k++) st.mesh.tri(list[0], list[k], list[k + 1]);
                void R;
            }
        }
    }
    /** Profiles (meters on a 1.7 m body). */
    const PROFILES = {
        /** A recessed light channel: two raised lips and the glowing core sunk between them. */
        channel(m, glowM, lipC, glowC, w = 1) {
            const W = 0.0011 * w, L = 0.0019, H = 0.0021, Cc = 0.001;
            return [
                { mesh: m, color: lipC, pts: [[-W - L, 0.0002, -0.7, 0.7], [-W - L * 0.35, H, -0.15, 1], [-W, Cc + 0.0002, 0.75, 0.66]] },
                { mesh: m, color: lipC, pts: [[W, Cc + 0.0002, -0.75, 0.66], [W + L * 0.35, H, 0.15, 1], [W + L, 0.0002, 0.7, 0.7]] },
                { mesh: glowM, color: glowC, pts: [[-W - 0.0002, Cc, 0, 1], [W + 0.0002, Cc, 0, 1]] }
            ];
        },
        /** LED piping: a glowing bead with a dark welt on its inner side. */
        piping(m, glowM, weltC, glowC, w = 1, side = 1) {
            const r = 0.0014 * Math.sqrt(w), pts = [];
            for (let k = 0; k <= 2; k++) { const a = Math.PI * k / 2, c = Math.cos(a), sn = Math.sin(a); pts.push([c * r, r * 0.45 + sn * r, c, sn]); }
            return [
                { mesh: glowM, color: glowC, pts },
                { mesh: m, color: weltC, pts: [[side * r * 1.05, 0.0012, side * 0.25, 1], [side * (r + 0.0032), 0.0002, side * 0.75, 0.6]].sort((a, b) => a[0] - b[0]) }
            ];
        },
        /** A flat strap or tape: `w` wide, `t` thick, square edges a little rounded. */
        strap(m, color, w, t) { return [{ mesh: m, color, cap: true, pts: [[-w / 2, 0.0002, -0.8, 0.5], [-w / 2 + 0.0007, t, -0.2, 1], [w / 2 - 0.0007, t, 0.2, 1], [w / 2, 0.0002, 0.8, 0.5]] }]; },
        /** A sealed (welded) zip: two lips over a tight seam. */
        zip(m, color) { return [{ mesh: m, color, pts: [[-0.0032, 0.0002, -0.7, 0.7], [-0.0013, 0.0011, -0.1, 1], [0, 0.00055, 0, 1], [0.0013, 0.0011, 0.1, 1], [0.0032, 0.0002, 0.7, 0.7]] }]; },
        /** A raised welt round an insert. */
        welt(m, color, w = 0.0028, h = 0.0014) { return [{ mesh: m, color, pts: [[-w / 2, 0.0002, -0.7, 0.7], [-w * 0.15, h, -0.1, 1], [w * 0.15, h, 0.1, 1], [w / 2, 0.0002, 0.7, 0.7]] }]; }
    };

    /** The cloth point at coordinates (fam, s, a): the nearest vertex refined inside its faces. */
    function locate(S, fam, s, a) {
        if (!S.adj) { S.adj = new Map(); for (let t = 0; t < S.tris.length; t += 3) for (let k = 0; k < 3; k++) { const v = S.tris[t + k]; let l = S.adj.get(v); if (!l) S.adj.set(v, l = []); l.push(t); } }
        let best = -1, bd = Infinity;
        for (let v = 0; v < S.n; v++) { const c = S.co(v); if (c.fam !== fam) continue; const d = (wrap(c.a - a) * c.r) ** 2 + ((c.s - s) * c.U) ** 2; if (d < bd) { bd = d; best = v; } }
        if (best < 0) return null;
        const c0 = S.co(best), XY = c => [wrap(c.a - a) * c0.r, (c.s - s) * c0.U];
        for (const t of S.adj.get(best) || []) {
            const ids = [S.tris[t], S.tris[t + 1], S.tris[t + 2]], q = ids.map(v => XY(S.co(v)));
            const det = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
            if (Math.abs(det) < 1e-14) continue;
            const l1 = ((0 - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (0 - q[0][1])) / det, l2 = ((q[1][0] - q[0][0]) * (0 - q[0][1]) - (0 - q[0][0]) * (q[1][1] - q[0][1])) / det, l0 = 1 - l1 - l2;
            if (l0 < -0.02 || l1 < -0.02 || l2 < -0.02) continue;
            const w = [[ids[0], l0], [ids[1], l1], [ids[2], l2]].map(([v, k]) => [v, Math.max(0, k)]).sort((x, y) => y[1] - x[1]), tot = w.reduce((t2, q2) => t2 + q2[1], 0) || 1;
            const ww = w.map(([v, k]) => [v, k / tot]);
            return { p: ww.reduce((acc, [v, k]) => add(acc, mul(S.p(v), k)), [0, 0, 0]), n: norm(ww.reduce((acc, [v, k]) => add(acc, mul(S.nv(v), k)), [0, 0, 0])), w: ww, co: { fam, s, a, r: c0.r, U: c0.U, e: c0.e, y: c0.y } };
        }
        return { p: S.p(best), n: S.nv(best), w: [[best, 1]], co: c0 };
    }
    /** A small rounded box on the cloth at a located point: axes along the cloth (`up` toward the chain), across, out. */
    function clothBox(m, S, at, { w, h, d, color, up = null, lift = 0, round = 0.35, rows = 1 }) {
        if (!at) return;
        const s = S.C.s, n = at.n;
        let t1 = up ? sub(up, mul(n, dot(up, n))) : sub(Y, mul(n, n[1]));
        t1 = norm(len(t1) > 1e-6 ? t1 : norm(cross(n, X)));
        const t2 = norm(cross(n, t1)), b = bind(S, at.w);
        box(m, add(at.p, mul(n, (lift + d / 2) * s)), [t2, t1, n], [w / 2 * s, h / 2 * s, d / 2 * s], Math.min(w, h, d) * round * s, color, b.skin, Math.min(w, h) < 0.008 ? 0 : rows, b.sewn);
    }

    // ── rigid hardware ────────────────────────────────────────────────────
    /** A rounded box on axes (x, y, z unit vectors), half sizes, corner radius. */
    function box(m, center, axes, half, radius, color, skin, steps = 2, sewn = null) {
        const r = Math.min(radius, ...half.map(v => v * 0.75));
        for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
            const u = (axis + 1) % 3, v = (axis + 2) % 3, vals = k => { const a = steps ? Array.from({ length: steps + 1 }, (_, j) => -half[k] + r * (1 - Math.cos(j / steps * Math.PI / 2))) : [-half[k]]; return a.concat(a.map(x => -x).reverse()); };
            const A = vals(u), B = vals(v), start = m.count;
            for (const bb of B) for (const aa of A) {
                const p = [0, 0, 0]; p[axis] = sign * half[axis]; p[u] = aa; p[v] = bb;
                const q = p.map((x, k) => Math.max(-half[k] + r, Math.min(half[k] - r, x))), nn = norm(sub(p, q), [0, 0, 1]), local = add(q, mul(nn, r));
                const world = add(center, add(add(mul(axes[0], local[0]), mul(axes[1], local[1])), mul(axes[2], local[2])));
                m.v(world, add(add(mul(axes[0], nn[0]), mul(axes[1], nn[1])), mul(axes[2], nn[2])), color, skin, [local[u] * 40, local[v] * 40], sewn);
            }
            for (let j = 0; j < B.length - 1; j++) for (let i = 0; i < A.length - 1; i++) { const a = start + j * A.length + i; m.quad(a, a + 1, a + 1 + A.length, a + A.length); }
        }
    }
    /** A capped cylinder from a to b, radius r (or [ra, rb]). */
    function cylinder(m, a, b, r, color, skin, sides = 10, caps = true) {
        const d = norm(sub(b, a)), x = norm(cross(d, Math.abs(d[1]) < 0.9 ? Y : X)), y = cross(d, x), [ra, rb] = Array.isArray(r) ? r : [r, r];
        const ring = (c, rr) => Array.from({ length: sides }, (_, k) => { const t = k / sides * TAU; return add(c, add(mul(x, Math.cos(t) * rr), mul(y, Math.sin(t) * rr))); });
        const A = ring(a, ra), B = ring(b, rb), ia = [], ib = [];
        for (let k = 0; k <= sides; k++) { const q = k % sides, nn = norm(add(mul(x, Math.cos(q / sides * TAU)), mul(y, Math.sin(q / sides * TAU)))); ia.push(m.v(A[q], nn, color, skin, [k / sides, 0])); ib.push(m.v(B[q], nn, color, skin, [k / sides, 1])); }
        for (let k = 0; k < sides; k++) m.quad(ia[k], ia[k + 1], ib[k + 1], ib[k]);
        if (caps) for (const [R, c, dir] of [[A, a, mul(d, -1)], [B, b, d]]) { const ci = m.v(c, dir, tone(color, 1.05), skin), list = R.map(p => m.v(p, dir, tone(color, 1.05), skin)); for (let k = 0; k < sides; k++) m.tri(ci, list[k], list[(k + 1) % sides]); }
    }
    /** A hex bolt head on a face. */
    function bolt(m, at, normal, r, color, skin) {
        const n = norm(normal), x = norm(cross(n, Math.abs(n[1]) < 0.9 ? Y : X)), y = cross(n, x);
        const ring = h => Array.from({ length: 6 }, (_, k) => add(add(at, mul(n, h)), add(mul(x, Math.cos(k / 6 * TAU) * r), mul(y, Math.sin(k / 6 * TAU) * r))));
        const A = ring(-r * 0.2), B = ring(r * 0.55), ia = A.map(p => m.v(p, norm(sub(p, at)), tone(color, 0.9), skin)), ib = B.map((p, k) => m.v(p, norm(add(mul(norm(sub(p, add(at, mul(n, r * 0.55)))), 0.6), mul(n, 0.8))), color, skin));
        for (let k = 0; k < 6; k++) m.quad(ia[k], ia[(k + 1) % 6], ib[(k + 1) % 6], ib[k]);
        const c = m.v(add(at, mul(n, r * 0.62)), n, tone(color, 1.12), skin);
        for (let k = 0; k < 6; k++) m.tri(c, ib[k], ib[(k + 1) % 6]);
    }
    /** A tube through points (a cable or a hose), radius r, with ribbed sleeves every other point. */
    function tube(m, points, r, color, skin, sides = 7) {
        const n = points.length; if (n < 2) return;
        let prev = null; const rows = [];
        for (let i = 0; i < n; i++) {
            const d = norm(sub(points[Math.min(n - 1, i + 1)], points[Math.max(0, i - 1)]));
            const x = prev ? norm(sub(prev, mul(d, dot(prev, d)))) : norm(cross(d, Math.abs(d[1]) < 0.9 ? Y : X)); prev = x;
            const y = cross(d, x), sk = typeof skin === 'function' ? skin(points[i]) : skin;
            rows.push(Array.from({ length: sides + 1 }, (_, k) => { const a = (k % sides) / sides * TAU, o = add(mul(x, Math.cos(a)), mul(y, Math.sin(a))); return m.v(add(points[i], mul(o, r)), o, color, sk, [k / sides, i]); }));
        }
        for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) m.quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
    }

    // ── fields round the trunk and the limbs, for rigid plates ────────────
    /**
     * The trunk's outer surface round its axis, of the body and what is worn under the gear:
     * at(a, y, gap) the point at bearing a (0 in front, + to the body's left) and height y.
     */
    function trunkField(C, entries, parts) {
        const s = C.s, A = 96, y0 = C.hips[1] - 0.3 * s, y1 = C.neck[1] + 0.08 * s, dy = 0.01 * s, H = Math.ceil((y1 - y0) / dy) + 1;
        const R = new Float32Array(A * H);
        const put = (x, y, z) => {
            if (y < y0 || y > y1) return;
            const c = C.axisAt(y), dx = x - c[0], dz = z - c[2], r = Math.hypot(dx, dz);
            if (r > 0.4 * s) return;
            const a = Math.floor(((Math.atan2(dx, dz) / TAU) % 1 + 1) % 1 * A) % A, h = Math.round((y - y0) / dy);
            if (r > R[h * A + a]) R[h * A + a] = r;
        };
        const BP = C.body.positions;
        for (let v = 0; v < BP.length / 3; v++) if (C.an.member[C.src[v] * 5] > 0.5) put(BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]);
        for (const e of entries) { const L = e.laid; for (let v = 0; v < L.positions.length / 3; v++) { const f = L.field && L.field[L.origin ? L.origin[v] : v]; if (f && f.fam !== 0) continue; put(L.positions[v * 3], L.positions[v * 3 + 1], L.positions[v * 3 + 2]); } }
        for (const p of parts || []) for (let v = 0; v < p.positions.length / 3; v++) put(p.positions[v * 3], p.positions[v * 3 + 1], p.positions[v * 3 + 2]);
        // Gaps filled from their neighbors; each bearing's maximum spread a little either side, then eased.
        for (let pass = 0; pass < 14; pass++) for (let h = 0; h < H; h++) for (let a = 0; a < A; a++) {
            if (R[h * A + a] > 0) continue;
            let sum = 0, n = 0;
            for (const [dh, da] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const hh = h + dh; if (hh < 0 || hh >= H) continue; const q = R[hh * A + (a + da + A) % A]; if (q > 0) { sum += q; n++; } }
            if (n) R[h * A + a] = sum / n;
        }
        const M = Float32Array.from(R);
        for (let h = 0; h < H; h++) for (let a = 0; a < A; a++) { let best = 0; for (let dh = -2; dh <= 2; dh++) for (let da = -2; da <= 2; da++) { const hh = h + dh; if (hh < 0 || hh >= H) continue; best = Math.max(best, R[hh * A + (a + da + A) % A]); } M[h * A + a] = best; }
        let B = Float32Array.from(M);
        for (let pass = 0; pass < 4; pass++) { const nb = Float32Array.from(B); for (let h = 0; h < H; h++) for (let a = 0; a < A; a++) { let sum = 0, n = 0; for (let dh = -1; dh <= 1; dh++) for (let da = -1; da <= 1; da++) { const hh = h + dh; if (hh < 0 || hh >= H) continue; sum += B[hh * A + (a + da + A) % A]; n++; } nb[h * A + a] = Math.max(R[h * A + a], sum / n); } B = nb; }
        const radius = (a, y) => {
            const fa = ((a / TAU) % 1 + 1) % 1 * A, fh = clamp((y - y0) / dy, 0, H - 1.001), a0 = Math.floor(fa) % A, a1 = (a0 + 1) % A, h0 = Math.floor(fh), h1 = Math.min(H - 1, h0 + 1), ta = fa - Math.floor(fa), th = fh - h0;
            return ((B[h0 * A + a0] * (1 - ta) + B[h0 * A + a1] * ta) * (1 - th) + (B[h1 * A + a0] * (1 - ta) + B[h1 * A + a1] * ta) * th) || 0.12 * s;
        };
        const at = (a, y, gap = 0) => { const c = C.axisAt(y), r = radius(a, y) + gap; return [c[0] + Math.sin(a) * r, y, c[2] + Math.cos(a) * r]; };
        const inside = p => { const c = C.axisAt(p[1]); return [c[0], p[1], c[2]]; };
        return { at, radius, inside };
    }
    /**
     * A limb's outer surface round a bone (from `name` to its child): at(θ, t, gap), θ about the
     * bone (0 in front, + to the outer side), t along it (0 at its head, 1 at the next joint).
     */
    function limbField(C, name, fam, entries) {
        const s = C.s, B = C.bone(name), next = name.replace(/(ForeArm|UpLeg|Arm|Leg)$/, p => ({ Arm: 'ForeArm', ForeArm: 'Hand', UpLeg: 'Leg', Leg: 'Foot' }[p]));
        const head = B.head, end = C.bone(next).head, L = len(sub(end, head)), d = norm(sub(end, head));
        const f = norm(sub(Z, mul(d, dot(Z, d)))), side = fam === 1 || fam === 3 ? 1 : -1, sx = [side, 0, 0];
        let o = sub(sx, add(mul(d, dot(sx, d)), mul(f, dot(sx, f)))); o = len(o) > 1e-6 ? norm(o) : norm(cross(d, f));
        const NA = 48, t0 = -0.35, t1 = 1.25, NT = 32, R = new Float32Array(NA * NT);
        const put = p => {
            const q = sub(p, head), t = dot(q, d) / L;
            if (t < t0 || t > t1) return;
            const qq = sub(q, mul(d, dot(q, d))), r = len(qq);
            if (r > 0.25 * s) return;
            const a = Math.floor(((Math.atan2(dot(qq, o), dot(qq, f)) / TAU) % 1 + 1) % 1 * NA) % NA, k = clamp(Math.round((t - t0) / (t1 - t0) * (NT - 1)), 0, NT - 1);
            if (r > R[k * NA + a]) R[k * NA + a] = r;
        };
        const BP = C.body.positions;
        for (let v = 0; v < BP.length / 3; v++) if (C.an.member[C.src[v] * 5 + fam] > 0.45) put([BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]]);
        for (const e of entries) { const Lp = e.laid; for (let v = 0; v < Lp.positions.length / 3; v++) { const fv = Lp.field && Lp.field[Lp.origin ? Lp.origin[v] : v]; if (!fv || fv.fam !== fam) continue; put([Lp.positions[v * 3], Lp.positions[v * 3 + 1], Lp.positions[v * 3 + 2]]); } }
        for (let pass = 0; pass < 20; pass++) for (let k = 0; k < NT; k++) for (let a = 0; a < NA; a++) {
            if (R[k * NA + a] > 0) continue;
            let sum = 0, n = 0;
            for (const [dk, da] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const kk = k + dk; if (kk < 0 || kk >= NT) continue; const q = R[kk * NA + (a + da + NA) % NA]; if (q > 0) { sum += q; n++; } }
            if (n) R[k * NA + a] = sum / n;
        }
        let M = Float32Array.from(R);
        for (let k = 0; k < NT; k++) for (let a = 0; a < NA; a++) { let best = 0; for (let dk = -1; dk <= 1; dk++) for (let da = -2; da <= 2; da++) { const kk = k + dk; if (kk < 0 || kk >= NT) continue; best = Math.max(best, R[kk * NA + (a + da + NA) % NA]); } M[k * NA + a] = best; }
        for (let pass = 0; pass < 4; pass++) { const nb = Float32Array.from(M); for (let k = 0; k < NT; k++) for (let a = 0; a < NA; a++) { let sum = 0, n = 0; for (let dk = -1; dk <= 1; dk++) for (let da = -1; da <= 1; da++) { const kk = k + dk; if (kk < 0 || kk >= NT) continue; sum += M[kk * NA + (a + da + NA) % NA]; n++; } nb[k * NA + a] = Math.max(R[k * NA + a], sum / n); } M = nb; }
        const radius = (th, t) => {
            const fa = ((th / TAU) % 1 + 1) % 1 * NA, fk = clamp((t - t0) / (t1 - t0) * (NT - 1), 0, NT - 1.001), a0 = Math.floor(fa) % NA, a1 = (a0 + 1) % NA, k0 = Math.floor(fk), k1 = Math.min(NT - 1, k0 + 1), ta = fa - Math.floor(fa), tk = fk - k0;
            return ((M[k0 * NA + a0] * (1 - ta) + M[k0 * NA + a1] * ta) * (1 - tk) + (M[k1 * NA + a0] * (1 - ta) + M[k1 * NA + a1] * ta) * tk) || 0.04 * s;
        };
        const dir = th => add(mul(f, Math.cos(th)), mul(o, Math.sin(th)));
        const point = t => add(head, mul(d, t * L));
        const at = (th, t, gap = 0) => add(point(t), mul(dir(th), radius(th, t) + gap));
        const inside = p => point(dot(sub(p, head), d) / L);
        return { name, fam, head, end, L, d, f, o, at, radius, dir, point, inside, joint: C.joint(name) };
    }

    // ── formed plates ─────────────────────────────────────────────────────
    /** An outline (closed polygon of [u, v] meters) with rounded corners, resampled to `n` points evenly. */
    function outline(points, radius, n = 32) {
        const P = points, k = P.length, dense = [];
        for (let i = 0; i < k; i++) {
            const a = P[(i - 1 + k) % k], b = P[i], c = P[(i + 1) % k];
            const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), r = Math.min(radius, ab * 0.45, bc * 0.45);
            const p0 = [b[0] + (a[0] - b[0]) * r / ab, b[1] + (a[1] - b[1]) * r / ab], p1 = [b[0] + (c[0] - b[0]) * r / bc, b[1] + (c[1] - b[1]) * r / bc];
            for (let j = 0; j <= 4; j++) { const t = j / 4, u = 1 - t; dense.push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p1[1]]); }
        }
        let total = 0; const acc = [0];
        for (let i = 1; i <= dense.length; i++) { total += Math.hypot(dense[i % dense.length][0] - dense[i - 1][0], dense[i % dense.length][1] - dense[i - 1][1]); acc.push(total); }
        const out = [];
        for (let j = 0; j < n; j++) {
            const target = j / n * total; let i = 1; while (acc[i] < target) i++;
            const a = dense[i - 1], b = dense[i % dense.length], t = (target - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1);
            out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
        // Wound counterclockwise in (u, v).
        let area = 0; for (let i = 0; i < n; i++) { const a = out[i], b = out[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
        return area < 0 ? out.reverse() : out;
    }
    /**
     * A formed plate over a base surface at(u, v, h) (h meters out from it): a closed shell `T`
     * thick, its outline `shape` ([u, v]), a rolled chamfer `ch` round its face, its face crowned
     * by `crown`, a flat underside. `colorAt(r)` shades its rings (0 the foot of the wall).
     */
    function shell(m, at, shape, { T, ch, crown = 0, color, skin, inside, uvScale = 1, edge = 1.1, profile = null }) {
        const n = shape.length, c = shape.reduce((s2, p) => [s2[0] + p[0] / n, s2[1] + p[1] / n], [0, 0]);
        const mean = shape.reduce((s2, p) => s2 + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / n || 0.01, k = Math.min(0.35, ch / mean);
        const rings = profile || [[1, 0, 0.62], [1, T - ch, 0.95], [1 - k * 0.35, T - ch * 0.25, edge], [1 - k, T, 1.03], [0.62, T + crown * 0.6, 1], [0.26, T + crown * 0.93, 1]];
        const base = m.count, firstTri = m.i.length;
        const pt = (f, j) => [c[0] + (shape[j][0] - c[0]) * f, c[1] + (shape[j][1] - c[1]) * f];
        for (const [f, h, shade] of rings) for (let j = 0; j < n; j++) { const q = pt(f, j), p = at(q[0], q[1], h); m.v(p, norm(sub(p, inside(p))), tone(color, shade), skin, [q[0] * uvScale, q[1] * uvScale]); }
        const top = at(c[0], c[1], T + crown), ci = m.v(top, norm(sub(top, inside(top))), color, skin, [c[0] * uvScale, c[1] * uvScale]);
        for (let r = 0; r + 1 < rings.length; r++) for (let j = 0; j < n; j++) { const a = base + r * n + j, b = base + r * n + (j + 1) % n; m.quad(a, b, b + n, a + n); }
        const last = base + (rings.length - 1) * n;
        for (let j = 0; j < n; j++) m.tri(ci, last + j, last + (j + 1) % n);
        m.smooth(base, firstTri);
        // The underside, a flat fan facing in.
        const under = [];
        for (let j = 0; j < n; j++) { const q = pt(1, j), p = at(q[0], q[1], 0.0003); under.push(m.v(p, norm(sub(inside(p), p)), tone(color, 0.4), skin, [0, 0])); }
        const cu = at(c[0], c[1], 0.0003), uc = m.v(cu, norm(sub(inside(cu), cu)), tone(color, 0.4), skin, [0, 0]);
        for (let j = 0; j < n; j++) m.tri(uc, under[j], under[(j + 1) % n]);
        // A point on the face `d` meters in from the outline along spoke j, `up` over it.
        const face = rings.filter(r => r[0] <= 1 - k + 1e-9).map(r => [r[0], r[1]]).concat([[0, T + crown]]);
        const hAt = f => { for (let i = 0; i + 1 < face.length; i++) { const [f0, h0] = face[i], [f1, h1] = face[i + 1]; if (f <= f0 && f >= f1) return h0 + (h1 - h0) * (f0 - f) / ((f0 - f1) || 1); } return T; };
        const onFace = (d, j, up = 0) => { const q = shape[j], r = Math.hypot(q[0] - c[0], q[1] - c[1]) || 1e-4, f = clamp(1 - d / r, 0, 1 - k), w = pt(f, j); return at(w[0], w[1], hAt(f) + up); };
        return { c, at: (u, v, h) => at(u, v, h), onFace, n };
    }

    // ── colors and materials by style ─────────────────────────────────────
    function armorLook(item) {
        const st = cyberStyle(item.style || 'military'), id = st.id;
        const main = linear(isHex(item.color) ? item.color : st.base), second = linear(isHex(item.color2) ? item.color2 : st.trim), trim = linear(isHex(item.trim) ? item.trim : st.trim);
        const metal = item.material === 'metal' || item.material === 'gold';
        const lightOn = item.lightStyle !== 'none' && (item.lightIntensity ?? 0.6) > 0;
        return { st, id, main, second, trim, dark: linear(st.joint || '#1a1c20'), glow: linear(isHex(item.lightColor) ? item.lightColor : st.glow), glowHex: isHex(item.lightColor) ? item.lightColor : st.glow,
            intensity: lightOn ? clamp01(item.lightIntensity ?? 0.8) : 0, width: item.lightWidth || 1, metal, lightStyle: item.lightStyle || 'strips',
            bulk: clamp(item.bulk ?? 0.4, 0, 1.5), wear: clamp01(item.wear ?? 0) };
    }
    /** The parts of an armor piece's meshes, each with its finish. */
    function armorParts(label, L, M, s) {
        const uvDensity = 8 / s, out = [];
        const finish = L.metal ? 'steel' : L.id === 'military' || L.id === 'salvaged' ? 'painted' : 'plastic';
        const rough = L.metal ? 0.24 : L.id === 'sleek' ? 0.2 : L.id === 'neon' ? 0.22 : 1;
        const metalness = L.metal ? 0.9 : L.id === 'sleek' ? 0.1 : L.id === 'neon' ? 0.35 : L.id === 'military' ? 0.15 : 0.35;
        const asArmor = (mesh, extra) => { const p = mesh.part(label, extra); p.armorUvs = Float32Array.from(mesh.uv, v => v * 8 / s); p.uvDensity = uvDensity; return p; };
        if (!M.plates.empty) out.push(asArmor(M.plates, { name: label + ' plates', roughness: rough, metalness, finish, ...(L.metal ? { tile: 'brushed' } : {}) }));
        if (!M.frame.empty) out.push(M.frame.part(label + ' frames', { roughness: Math.max(0.16, L.st.trimRoughness ?? 0.3), metalness: L.st.trimMetalness ?? 0.8 }));
        if (!M.dark.empty) out.push(M.dark.part(label + ' joints', { roughness: 0.5, metalness: 0.4 }));
        if (!M.glow.empty) out.push(M.glow.part(label + ' lights', { roughness: 0.3, metalness: 0, emissive: L.glowHex, emissiveIntensity: L.intensity }));
        if (!M.glass.empty) out.push(M.glass.part(label + ' glass', { roughness: 0.08, metalness: 0.1, opacity: 0.62, emissive: L.glowHex, emissiveIntensity: L.intensity * 0.55, doubleSided: false }));
        if (!M.soft.empty) out.push(withTile(M.soft.part(label + ' straps', { roughness: 0.8, metalness: 0 }), 'canvas', 0.8));
        return out;
    }
    const meshes = () => ({ plates: new Mesh(), frame: new Mesh(), dark: new Mesh(), glow: new Mesh(), glass: new Mesh(), soft: new Mesh() });

    /**
     * Plates on a base surface: each `{ shape: [[u, v], ...] (meters), r (corner radius), T, crown,
     * tone, scrap }`; salvaged plate is knocked a little out of true and painted mismatched.
     */
    function platesOn(M, L, at, inside, skin, list, s, seed) {
        const made = [];
        list.forEach((pl, i) => {
            let shape = outline(pl.shape.map(([u, v]) => [u * s, v * s]), (pl.r ?? 0.012) * s, pl.n || 24);
            let color = pl.color || L.main;
            if (pl.tone) color = tone(color, pl.tone);
            if (L.id === 'salvaged') {
                // Knocked a little out of true, each panel a different scrap.
                const rot = (ihash(seed, i, 3) - 0.5) * 0.12, cx = shape.reduce((q, p) => q + p[0], 0) / shape.length, cy = shape.reduce((q, p) => q + p[1], 0) / shape.length;
                shape = shape.map(([u, v]) => [cx + (u - cx) * Math.cos(rot) - (v - cy) * Math.sin(rot), cy + (u - cx) * Math.sin(rot) + (v - cy) * Math.cos(rot)]);
                color = mixc(color, mixc(color, linear(SCRAP_TINTS[Math.floor(ihash(seed, i, 5) * SCRAP_TINTS.length)]), 0.6), pl.keep ? 0 : 0.75);
            }
            const T = (pl.T ?? 0.006) * s, ch = (pl.ch ?? (L.id === 'military' ? 0.0016 : L.id === 'salvaged' ? 0.001 : 0.0028)) * s;
            const lift = (pl.lift ?? 0) * s, base = (u, v, h) => at(u, v, h + lift);
            const sh = shell(pl.mesh || M.plates, base, shape, { T, ch, crown: (pl.crown ?? 0.003) * s, color, skin: pl.skin || skin, inside, edge: L.id === 'sleek' ? 1.22 : L.id === 'military' ? 1.18 : L.id === 'neon' ? 1.3 : 1.1 });
            made.push({ shape, c: sh.c, T, lift, at: base, pl, onFace: sh.onFace });
            // A panel within the panel: an inset groove round the face (sleek, military), a light line (glowing).
            const inlay = pl.inlay ?? (L.id === 'salvaged' ? 0 : Math.min(...shape.map(q => Math.hypot(q[0] - sh.c[0], q[1] - sh.c[1]))) > 0.028 * s ? (L.id === 'military' ? 0.007 : 0.0085) : 0);
            if (inlay) {
                const glowing = L.id === 'neon' && L.intensity > 0 && L.lightStyle !== 'badge', m = glowing ? M.glow : M.dark, wd = (glowing ? 0.0011 * L.width : 0.0008) * s;
                const col = glowing ? L.glow : tone(color, L.id === 'sleek' ? 0.35 : 0.45), ids = [];
                for (let j = 0; j < sh.n; j++) { const a = sh.onFace(inlay * s - wd, j, 0.00025 * s), b = sh.onFace(inlay * s + wd, j, 0.00025 * s), nn = norm(sub(lerp(a, b, 0.5), inside(lerp(a, b, 0.5)))); ids.push([m.v(a, nn, col, pl.skin || skin), m.v(b, nn, col, pl.skin || skin)]); }
                for (let j = 0; j < sh.n; j++) { const A = ids[j], B = ids[(j + 1) % sh.n]; m.quad(A[0], A[1], B[1], B[0]); }
            }
        });
        return made;
    }
    /** Bolts (military), rivets (salvaged) at a plate's corners: `every` outline points apart, `inset` in. */
    function fasteners(M, L, P, skin, inside, s, count = 4) {
        if (L.id !== 'military' && L.id !== 'salvaged') return;
        const n = P.shape.length, size = P.shape.reduce((q, p) => q + Math.hypot(p[0] - P.c[0], p[1] - P.c[1]), 0) / n;
        if (size < 0.022 * s) return;
        if (size < 0.035 * s) count = Math.min(count, 2);
        for (let k = 0; k < count; k++) {
            const j = Math.floor((k + 0.5) / count * n) % n, q = P.shape[j], c = P.c, f = 1 - Math.min(0.3, 0.007 * s / Math.max(1e-4, Math.hypot(q[0] - c[0], q[1] - c[1])));
            const u = c[0] + (q[0] - c[0]) * f, v = c[1] + (q[1] - c[1]) * f, p = P.at(u, v, P.T + 0.0002 * s), nn = norm(sub(p, inside(p)));
            if (L.id === 'military') bolt(M.frame, p, nn, 0.0028 * s, L.trim, skin);
            else { const cc = M.frame; const r = 0.0026 * s; cylinder(cc, p, add(p, mul(nn, 0.0012 * s)), [r, r * 0.8], tone(L.trim, 0.9 + 0.2 * ihash(k, j, 9)), skin, 6); }
        }
    }
    /** A glowing seam along a (u, v) path, sunk to `h` (a gap between plates shows it). */
    function glowLine(M, L, at, inside, skin, path, s, { width = 0.0022, h = 0.002, glass = false } = {}) {
        if (!(L.intensity > 0) || L.lightStyle === 'badge') return;
        const W = width * s * L.width / 2, P = path.map(([u, v]) => [u * s, v * s]), pts = [];
        for (let i = 0; i + 1 < P.length; i++) { const a = P[i], b = P[i + 1], d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(d / (0.012 * s))); for (let k = 0; k < n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
        pts.push(P[P.length - 1]);
        const m = glass ? M.glass : M.glow, rows = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], du = b[0] - a[0], dv = b[1] - a[1], l = Math.hypot(du, dv) || 1, nu = -dv / l, nv = du / l;
            const L0 = at(pts[i][0] + nu * W, pts[i][1] + nv * W, h * s), R0 = at(pts[i][0] - nu * W, pts[i][1] - nv * W, h * s), nn = norm(sub(lerp(L0, R0, 0.5), inside(lerp(L0, R0, 0.5))));
            rows.push([m.v(L0, nn, L.glow, skin), m.v(R0, nn, L.glow, skin)]);
        }
        for (let i = 0; i + 1 < rows.length; i++) m.quad(rows[i][0], rows[i][1], rows[i + 1][1], rows[i + 1][0]);
    }

    // ── cyber armor ───────────────────────────────────────────────────────
    /** Chest, back and abdominal plates and a collar, over the undersuit and what is laid under them. */
    function chestArmor(C, item, under) {
        const L = armorLook(item), s = C.s, M = meshes(), F = trunkField(C, under, []);
        const H = C.neck[1] - C.hips[1], yF = f => C.hips[1] + f * H, gap = (0.008 + 0.006 * L.bulk) * s;
        const Rn = F.radius(0, yF(0.75)) || 0.13 * s;
        // Base surface: u meters round (at the chest's radius), v the height fraction times H (meters).
        const at = (u, v, h) => F.at(u / Rn, C.hips[1] + v, gap + h), inside = F.inside;
        const chest = C.rigid('Spine2'), mid = C.rigid('Spine1'), low = C.rigid('Spine'), hipsK = C.rigid('Hips');
        // Shapes in (bearing·Rn/s, height fraction·H/s): the same meters on any body (s scales them back).
        const k = Rn / s, h = H / s, P = (a, f) => [a * k, f * h], mirror = list => list.map(([a, f]) => [-a, f]).reverse();
        const id = L.id, plates = [];
        const add2 = (shape, opts = {}) => plates.push(Object.assign({ shape }, opts));
        if (id === 'sleek') {
            for (const sg of [1, -1]) {
                const half = [P(0.035, 0.58), P(0.62, 0.55), P(1.12, 0.66), P(1.2, 0.8), P(0.82, 0.93), P(0.3, 0.97), P(0.035, 0.94)];
                add2(sg > 0 ? half : mirror(half), { r: 0.022, T: 0.006, crown: 0.006, skin: chest, n: 40 });
                const ab = [P(0.03, 0.22), P(0.5, 0.25), P(0.66, 0.38), P(0.58, 0.53), P(0.03, 0.535)];
                add2(sg > 0 ? ab : mirror(ab), { r: 0.018, T: 0.0055, crown: 0.004, skin: mid, tone: 0.97 });
                const back = [P(Math.PI - 0.03, 0.4), P(Math.PI - 1.05, 0.46), P(Math.PI - 1.2, 0.72), P(Math.PI - 0.9, 0.94), P(Math.PI - 0.03, 0.95)];
                add2(sg > 0 ? back : back.map(([a, f]) => [2 * Math.PI * k - a, f]).reverse(), { r: 0.022, T: 0.0055, crown: 0.005, skin: chest });
            }
        } else {
            const narrow = id === 'neon' ? 0.92 : 1;
            for (const sg of [1, -1]) {
                const pec = [P(0.055, 0.6), P(0.78, 0.575), P(1.13, 0.69), P(1.06, 0.86), P(0.6, 0.95), P(0.075, 0.915)].map(([u, v]) => [u * narrow, v]);
                add2(sg > 0 ? pec : mirror(pec), { r: id === 'military' ? 0.006 : 0.012, T: id === 'military' ? 0.0075 : 0.0062, crown: 0.0045, skin: chest, n: 34 });
                for (let row = 0; row < 3; row++) {
                    const f0 = 0.205 + row * 0.115, f1 = f0 + 0.1, w0 = 0.6 - row * 0.03, w1 = 0.64 - row * 0.03;
                    if (id === 'salvaged' && sg < 0 && row === 1) continue;
                    const ab = [P(0.035, f0), P(w0, f0 + 0.008), P(w1, f1 - 0.004), P(0.035, f1)];
                    add2(sg > 0 ? ab : mirror(ab), { r: 0.007, T: 0.0058, crown: 0.003, skin: row === 2 ? mid : low, tone: 0.95 - row * 0.02, lift: 0.0012 * (2 - row) });
                }
                if (id !== 'neon' && !(id === 'salvaged' && sg < 0)) { const side = [P(1.3, 0.43), P(1.72, 0.45), P(1.76, 0.66), P(1.34, 0.68)]; add2(sg > 0 ? side : mirror(side), { r: 0.008, T: 0.0065, crown: 0.002, skin: mid, tone: 0.9 }); }
                const scap = [P(Math.PI - 0.1, 0.62), P(Math.PI - 1.08, 0.66), P(Math.PI - 1.18, 0.82), P(Math.PI - 0.82, 0.94), P(Math.PI - 0.12, 0.93)];
                add2(sg > 0 ? scap : scap.map(([a, f]) => [2 * Math.PI * k - a, f]).reverse(), { r: 0.01, T: 0.0065, crown: 0.004, skin: chest });
                const lumbar = [P(Math.PI - 0.1, 0.27), P(Math.PI - 0.78, 0.3), P(Math.PI - 0.82, 0.55), P(Math.PI - 0.1, 0.57)];
                add2(sg > 0 ? lumbar : lumbar.map(([a, f]) => [2 * Math.PI * k - a, f]).reverse(), { r: 0.009, T: 0.006, crown: 0.003, skin: mid, tone: 0.95 });
            }
            // The sternum keel, and the spine's segments down the back.
            add2([P(-0.045, 0.6), P(0, 0.54), P(0.045, 0.6), P(0.05, 0.93), P(-0.05, 0.93)], { r: 0.004, T: 0.0085, crown: 0.002, skin: chest, color: L.second, n: 16 });
            for (let i = 0; i < 4; i++) { const f0 = 0.27 + i * 0.17; add2([P(Math.PI - 0.07, f0), P(Math.PI + 0.07, f0), P(Math.PI + 0.06, f0 + 0.15), P(Math.PI - 0.06, f0 + 0.15)], { r: 0.005, T: 0.009, crown: 0.002, skin: i < 2 ? mid : chest, color: L.second, n: 12, inlay: 0 }); }
        }
        // Plates wrapping round the back: their u carried past the seam at the back (bearing ±π).
        const made = platesOn(M, L, at, inside, chest, plates, s, 11);
        made.forEach(P2 => fasteners(M, L, P2, P2.pl.skin, inside, s, P2.shape.length > 30 ? 6 : 4));
        // A collar: two overlapping rings round the neck, meeting a helmet's or a mask's rim.
        {
            const neck = C.neck, ids = [], BP = C.body.positions;
            for (let v = 0; v < BP.length / 3; v++) if (C.an.member[C.src[v] * 5] > 0.5 && Math.abs(BP[v * 3 + 1] - neck[1]) < 0.025 * s) ids.push(v);
            let wx = 0.055 * s, fz = neck[2] + 0.05 * s, bz = neck[2] - 0.05 * s;
            if (ids.length) { wx = Math.max(...ids.map(v => Math.abs(BP[v * 3] - neck[0]))); fz = Math.max(...ids.map(v => BP[v * 3 + 2])); bz = Math.min(...ids.map(v => BP[v * 3 + 2])); }
            const g = gap * 0.8 + 0.004 * s, cz = (fz + bz) / 2, rx = wx + g, rz = (fz - bz) / 2 + g, NS = 28;
            const ring = (dy, k2) => Array.from({ length: NS }, (_, j) => { const a = j / NS * TAU, ca = Math.cos(a), sa = Math.sin(a), r = 1 / Math.pow(Math.abs(ca) ** 3 + Math.abs(sa) ** 3, 1 / 3); return [neck[0] + sa * r * rx * k2, neck[1] + dy * s - (id === 'sleek' ? 0.012 * s * Math.max(0, ca) : 0), cz + ca * r * rz * k2]; });
            const rows = id === 'sleek' ? [[-0.034, 1.32], [-0.024, 1.27], [-0.006, 1.12], [0.01, 1.04], [0.016, 1.0]] : [[-0.036, 1.36], [-0.02, 1.28], [-0.015, 1.18], [-0.002, 1.12], [0.016, 1.04], [0.02, 1.0]];
            const base = M.plates.count, first = M.plates.i.length, rr = rows.map(([dy, k2]) => ring(dy, k2));
            const col = id === 'sleek' ? L.main : L.second;
            rr.forEach((r, ri) => r.forEach(p => M.plates.v(p, norm(sub(p, [neck[0], p[1], cz])), tone(col, ri === 2 && id !== 'sleek' ? 0.6 : 1), chest, [p[0] + p[2], p[1]])));
            for (let r = 0; r + 1 < rr.length; r++) for (let j = 0; j < NS; j++) { const a = base + r * NS + j, b = base + r * NS + (j + 1) % NS; M.plates.quad(a, b, b + NS, a + NS); }
            M.plates.smooth(base, first);
        }
        // Light: seams in the gaps (glowing style everywhere, others a little), status bars, a core.
        const glowAt = (u, v, hh) => at(u, v, hh);
        const lines = [];
        if (id === 'neon') {
            lines.push([[0, 0.54 * h], [0, 0.96 * h]].map(([a, f]) => [a, f]));
            for (const sg of [1, -1]) { lines.push([[sg * 0.06 * k, 0.585 * h], [sg * 0.78 * k, 0.56 * h], [sg * 1.15 * k, 0.69 * h]]); lines.push([[sg * 0.04 * k, 0.53 * h], [sg * 0.6 * k, 0.525 * h]]); lines.push([[sg * 0.04 * k, 0.415 * h], [sg * 0.62 * k, 0.415 * h]]); lines.push([[sg * 0.04 * k, 0.3 * h], [sg * 0.62 * k, 0.3 * h]]); }
            lines.push([[(Math.PI) * k, 0.25 * h], [(Math.PI) * k, 0.95 * h]]);
        } else if (id === 'sleek') {
            lines.push([[0, 0.56 * h], [0, 0.955 * h]]);
            for (const sg of [1, -1]) lines.push([[sg * 0.04 * k, 0.548 * h], [sg * 0.62 * k, 0.535 * h]]);
        } else if (id === 'military' && L.lightStyle === 'circuits') {
            for (const sg of [1, -1]) lines.push([[sg * 0.06 * k, 0.585 * h], [sg * 0.78 * k, 0.56 * h]]);
        }
        for (const path of lines) glowLine(M, L, glowAt, inside, chest, path, s, { width: id === 'sleek' ? 0.0014 : 0.0026, h: 0.0012 });
        if (L.intensity > 0) {
            // Status bars on the left breast (military, salvaged), a recessed core under the collar (glowing, sleek).
            if (id === 'military' || id === 'salvaged') for (let i = 0; i < 3; i++) { const u = (0.42 + i * 0.12) * k * s, v = 0.86 * h * s; box(M.glow, at(u, v, 0.0083 * s), [norm(sub(at(u + 0.01 * s, v, 0.008 * s), at(u, v, 0.008 * s))), Y, norm(sub(at(u, v, 0.01 * s), inside(at(u, v, 0.01 * s))))], [0.0045 * s, 0.0016 * s, 0.0012 * s], 0.0006 * s, L.glow, chest, 1); }
            else { const v = 0.885 * h * s, p = at(0, v, 0.0095 * s), nn = norm(sub(p, inside(p))); cylinder(M.glass, sub(p, mul(nn, 0.003 * s)), add(p, mul(nn, 0.0012 * s)), [0.011 * s, 0.0105 * s], L.glow, chest, 18); cylinder(M.frame, sub(p, mul(nn, 0.004 * s)), add(p, mul(nn, 0.0006 * s)), [0.0145 * s, 0.0135 * s], L.trim, chest, 18, false); }
        }
        // Military and salvaged: vents on the side plates and a hazard-free utility block on the back.
        if (id === 'military' || id === 'salvaged') for (const sg of [1, -1]) {
            if (id === 'salvaged' && sg < 0) continue;
            for (let i = 0; i < 4; i++) { const u = sg * 1.53 * k * s, v = (0.5 + i * 0.035) * h * s, p = at(u, v, 0.0072 * s), nn = norm(sub(p, inside(p))), along = norm(sub(at(u + 0.01 * s, v, 0.0072 * s), p)); box(M.dark, p, [along, Y, nn], [0.017 * s, 0.0035 * s, 0.0009 * s], 0.0006 * s, L.dark, mid, 1); }
        }
        if (id === 'salvaged') {
            // Straps holding the scrap on, and exposed cable from the back to the chest.
            for (const v of [0.47, 0.76]) {
                const pts = []; for (let i = 0; i <= 24; i++) { const a = -1.9 + 3.8 * i / 24; pts.push(at(a * Rn, v * H, 0.0105 * s)); }
                for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], nn = norm(sub(a, inside(a))), t = norm(sub(b, a)), w = norm(cross(nn, t)); M.soft.quad(M.soft.v(add(a, mul(w, -0.012 * s)), nn, tone(L.dark, 1.6), v < 0.6 ? mid : chest), M.soft.v(add(a, mul(w, 0.012 * s)), nn, tone(L.dark, 1.6), v < 0.6 ? mid : chest), M.soft.v(add(b, mul(w, 0.012 * s)), nn, tone(L.dark, 1.6), v < 0.6 ? mid : chest), M.soft.v(add(b, mul(w, -0.012 * s)), nn, tone(L.dark, 1.6), v < 0.6 ? mid : chest)); }
                const bk = at(0.9 * Rn, v * H, 0.012 * s), nn = norm(sub(bk, inside(bk)));
                box(M.frame, bk, [norm(cross(Y, nn)), Y, nn], [0.012 * s, 0.015 * s, 0.002 * s], 0.002 * s, L.trim, v < 0.6 ? mid : chest, 1);
            }
            tube(M.dark, [at(-1.95 * Rn, 0.72 * H, 0.004 * s), at(-1.55 * Rn, 0.8 * H, 0.012 * s), at(-1.1 * Rn, 0.82 * H, 0.012 * s), at(-0.7 * Rn, 0.76 * H, 0.011 * s)], 0.0035 * s, tone(L.dark, 1.3), chest);
        }
        void hipsK;
        return armorParts('Cyber chest armor', L, M, s);
    }

    /** Layered shoulder lames over each upper arm, with a piston-guided top cap. */
    function pauldrons(C, item, under) {
        const L = armorLook(item), s = C.s, M = meshes(), id = L.id;
        for (const [side, fam] of [['Left', 1], ['Right', 2]]) {
            if (id === 'salvaged' && side === 'Right') continue;
            const E = limbField(C, side + 'Arm', fam, under), sk = C.rigid(side + 'Arm'), gap = (0.012 + 0.008 * L.bulk) * s;
            const R0 = E.radius(Math.PI / 2, 0.15) || 0.05 * s;
            const at = (u, v, h) => E.at(u / R0 + Math.PI / 2, v / E.L, gap + h), inside = E.inside;
            const U = a => a * R0 / s, V = t => t * E.L / s;
            const big = 1 + 0.35 * L.bulk;
            const lames = id === 'sleek' ? [[-0.22, 0.2, 1.75, 0.01], [0.16, 0.34, 1.6, 0.004]] : [[-0.24, 0.16, 1.85, 0.012], [0.12, 0.27, 1.72, 0.0065], [0.23, 0.38, 1.58, 0.002]];
            const list = lames.map(([t0, t1, w, lift], i) => {
                const ww = w * (i === 0 ? big : 1), th = (u) => u;
                const shape = id === 'sleek'
                    ? [[U(-ww), V(t1)], [U(-ww * 0.92), V(t0 + 0.05)], [U(-ww * 0.4), V(t0)], [U(ww * 0.4), V(t0)], [U(ww * 0.92), V(t0 + 0.05)], [U(ww), V(t1)]]
                    : [[U(-ww), V(t1)], [U(-ww), V(t0 + 0.06)], [U(-ww * 0.55), V(t0)], [U(ww * 0.55), V(t0)], [U(ww), V(t0 + 0.06)], [U(ww), V(t1)]];
                void th;
                return { shape, r: id === 'military' ? 0.006 : 0.016, T: i === 0 ? 0.0075 : 0.006, crown: i === 0 ? 0.008 : 0.004, lift, skin: sk, tone: 1 - i * 0.05, n: 34, color: i === 0 && id !== 'sleek' ? L.main : undefined };
            });
            const made = platesOn(M, L, at, inside, sk, list, s, side === 'Left' ? 21 : 22);
            made.forEach(P2 => fasteners(M, L, P2, sk, inside, s, 4));
            // A raised ridge (glowing style: a light line) along the top cap.
            const cap = made[0];
            if (id === 'neon' || id === 'sleek') glowLine(M, L, (u, v, h) => cap.at(u, v, h), inside, sk, [[0, V(-0.2) * s], [0, V(0.18) * s]].map(([u, v]) => [u / s, v / s]), s, { width: id === 'neon' ? 0.004 : 0.0018, h: cap.T / s + 0.008 + 0.0002 });
            if (id === 'military') { for (const t of [-0.12, 0.0, 0.12]) { const p = cap.at(U(0) * s, V(t) * s, cap.T + 0.008 * s); box(M.frame, p, [norm(sub(cap.at(0.01 * s, V(t) * s, cap.T + 0.008 * s), p)), E.d, norm(sub(p, inside(p)))], [0.012 * s, 0.006 * s, 0.0016 * s], 0.0012 * s, L.trim, sk, 1); } }
            if (id === 'salvaged') tube(M.dark, [cap.at(U(-1.2) * s, V(0.1) * s, 0.002 * s), cap.at(U(-1.6) * s, V(-0.15) * s, 0.012 * s), C.axisAt(C.neck[1] - 0.06 * s).map((x, k) => x + [0.05 * s * (side === 'Left' ? 1 : -1), 0, -0.07 * s][k])], 0.0032 * s, tone(L.dark, 1.3), C.rigid('Spine2'));
        }
        return armorParts('Cyber pauldrons', L, M, s);
    }

    /** Bracers over each forearm, an elbow guard, and (glowing) a translucent display. */
    function bracers(C, item, under) {
        const L = armorLook(item), s = C.s, M = meshes(), id = L.id;
        for (const [side, fam] of [['Left', 1], ['Right', 2]]) {
            const E = limbField(C, side + 'ForeArm', fam, under), sk = C.rigid(side + 'ForeArm'), gap = (0.008 + 0.006 * L.bulk) * s;
            const R0 = E.radius(Math.PI / 2, 0.6) || 0.035 * s;
            const at = (u, v, h) => E.at(u / R0 + Math.PI / 2, v / E.L, gap + h), inside = E.inside;
            const U = a => a * R0 / s, V = t => t * E.L / s;
            const list = [];
            if (id === 'sleek') list.push({ shape: [[U(-2.1), V(0.94)], [U(-2.2), V(0.36)], [U(-1.2), V(0.28)], [U(1.2), V(0.28)], [U(2.2), V(0.36)], [U(2.1), V(0.94)]], r: 0.014, T: 0.0055, crown: 0.004, n: 40 });
            else {
                list.push({ shape: [[U(-1.45), V(0.93)], [U(-1.5), V(0.33)], [U(1.5), V(0.3)], [U(1.45), V(0.93)]], r: id === 'military' ? 0.005 : 0.01, T: 0.0065, crown: 0.003, n: 34 });
                if (id !== 'salvaged' || side === 'Left') list.push({ shape: [[U(1.62), V(0.9)], [U(1.62), V(0.38)], [U(2.55), V(0.42)], [U(2.55), V(0.86)]], r: 0.006, T: 0.0055, crown: 0.002, tone: 0.9, color: L.second });
            }
            // The elbow guard, on the forearm's back (θ = π) round the joint.
            list.push({ shape: [[U(Math.PI / 2 - 0.85), V(-0.12)], [U(Math.PI / 2 - 0.85), V(0.08)], [U(Math.PI / 2), V(0.16)], [U(Math.PI / 2 + 0.85), V(0.08)], [U(Math.PI / 2 + 0.85), V(-0.12)], [U(Math.PI / 2), V(-0.17)]], r: 0.008, T: 0.007, crown: 0.006, lift: 0.004, n: 30 });
            const made = platesOn(M, L, at, inside, sk, list, s, side === 'Left' ? 31 : 32);
            made.forEach(P2 => fasteners(M, L, P2, sk, inside, s, 4));
            const main = made[0];
            if (L.intensity > 0) {
                if (id === 'neon' || id === 'sleek') {
                    // A display inlay: translucent glass over a glowing grid, flush in the bracer's face.
                    const sh = outline([[U(-0.55) * s, V(0.48) * s], [U(0.55) * s, V(0.48) * s], [U(0.55) * s, V(0.8) * s], [U(-0.55) * s, V(0.8) * s]], 0.004 * s, 20);
                    shell(M.glass, (u, v, h) => main.at(u, v, h), sh, { T: main.T + (main.pl.crown ?? 0.003) * s * 0.8 + 0.0008 * s, ch: 0.0006 * s, crown: 0, color: L.glow, skin: sk, inside, profile: [[1, main.T * 0.6, 1], [1, main.T + 0.0045 * s, 1], [0.6, main.T + 0.0047 * s, 1]] });
                    for (const v of [0.56, 0.64, 0.72]) glowLine(M, L, main.at, inside, sk, [[U(-0.45), V(v)], [U(0.35), V(v)]], s, { width: 0.0012, h: main.T / s + 0.0045 });
                } else for (let i = 0; i < 3; i++) { const p = main.at(U(-0.9 + i * 0.25) * s, V(0.86) * s, main.T + 0.003 * s), nn = norm(sub(p, inside(p))); box(M.glow, p, [norm(cross(E.d, nn)), E.d, nn], [0.0035 * s, 0.0045 * s, 0.0012 * s], 0.0008 * s, L.glow, sk, 1); }
            }
            if (id === 'military') {
                // An actuator from the upper arm to the forearm, along the outside of the elbow.
                const Eu = limbField(C, side + 'Arm', fam, under), pu = Eu.at(Math.PI / 2 + 0.7, 0.72, gap + 0.006 * s), pf = E.at(Math.PI / 2 + 0.6, 0.3, gap + 0.008 * s), mid = lerp(pu, pf, 0.55);
                cylinder(M.dark, pu, mid, 0.0055 * s, L.dark, C.rigid(side + 'Arm'), 10);
                cylinder(M.frame, lerp(pu, pf, 0.4), pf, 0.0032 * s, L.trim, sk, 8);
                for (const [p, j] of [[pu, side + 'Arm'], [pf, side + 'ForeArm']]) cylinder(M.frame, sub(p, mul(E.f, 0.0)), add(p, mul(norm(sub(p, j === side + 'Arm' ? Eu.inside(p) : E.inside(p))), 0.004 * s)), 0.006 * s, L.trim, C.rigid(j), 10);
            }
        }
        return armorParts('Cyber bracers', L, M, s);
    }

    /** Thigh, knee and shin plates over each leg, with a knee piston (military, salvaged). */
    function legArmor(C, item, under) {
        const L = armorLook(item), s = C.s, M = meshes(), id = L.id;
        for (const [side, fam] of [['Left', 3], ['Right', 4]]) {
            const T = limbField(C, side + 'UpLeg', fam, under), Sh = limbField(C, side + 'Leg', fam, under), gap = (0.009 + 0.006 * L.bulk) * s;
            const tk = C.rigid(side + 'UpLeg'), sk = C.rigid(side + 'Leg');
            const RT = T.radius(0, 0.5) || 0.07 * s, RS = Sh.radius(0, 0.5) || 0.05 * s;
            const atT = (u, v, h) => T.at(u / RT, v / T.L, gap + h), atS = (u, v, h) => Sh.at(u / RS, v / Sh.L, gap + h);
            const UT = a => a * RT / s, VT = t => t * T.L / s, US = a => a * RS / s, VS = t => t * Sh.L / s;
            const thigh = [], shin = [];
            if (id === 'sleek') {
                thigh.push({ shape: [[UT(-0.85), VT(0.84)], [UT(-0.95), VT(0.42)], [UT(-0.4), VT(0.3)], [UT(1.1), VT(0.24)], [UT(1.75), VT(0.38)], [UT(1.6), VT(0.82)]], r: 0.02, T: 0.006, crown: 0.006, n: 40 });
                shin.push({ shape: [[US(-1.0), VS(0.86)], [US(-1.15), VS(0.22)], [US(0), VS(0.12)], [US(1.15), VS(0.22)], [US(1.0), VS(0.86)]], r: 0.02, T: 0.006, crown: 0.006, n: 38 });
            } else {
                thigh.push({ shape: [[UT(-0.85), VT(0.82)], [UT(-0.9), VT(0.3)], [UT(0.85), VT(0.26)], [UT(0.9), VT(0.84)]], r: id === 'military' ? 0.006 : 0.012, T: 0.0068, crown: 0.004, n: 32 });
                if (!(id === 'salvaged' && side === 'Right')) thigh.push({ shape: [[UT(1.0), VT(0.74)], [UT(1.0), VT(0.22)], [UT(2.0), VT(0.26)], [UT(2.0), VT(0.7)]], r: 0.006, T: 0.0062, crown: 0.003, tone: 0.9, color: L.second });
                shin.push({ shape: [[US(-0.95), VS(0.84)], [US(-1.0), VS(0.2)], [US(1.0), VS(0.2)], [US(0.95), VS(0.84)]], r: id === 'military' ? 0.006 : 0.012, T: 0.0068, crown: 0.004, n: 32 });
                if (id === 'military') shin.push({ shape: [[US(Math.PI - 0.8), VS(0.62)], [US(Math.PI - 0.8), VS(0.22)], [US(Math.PI + 0.8), VS(0.22)], [US(Math.PI + 0.8), VS(0.62)]], r: 0.006, T: 0.0055, crown: 0.003, tone: 0.88, color: L.second });
            }
            // The knee cap: on the shin's head, over the joint.
            shin.push({ shape: [[US(-0.85), VS(0.13)], [US(-0.95), VS(-0.04)], [US(0), VS(-0.13)], [US(0.95), VS(-0.04)], [US(0.85), VS(0.13)], [US(0), VS(0.17)]], r: 0.01, T: 0.008, crown: 0.008, lift: 0.006, n: 30, color: id === 'sleek' ? undefined : L.second });
            const mt = platesOn(M, L, atT, T.inside, tk, thigh, s, side === 'Left' ? 41 : 42), ms = platesOn(M, L, atS, Sh.inside, sk, shin, s, side === 'Left' ? 43 : 44);
            mt.forEach(P2 => fasteners(M, L, P2, tk, T.inside, s, 4)); ms.forEach(P2 => fasteners(M, L, P2, sk, Sh.inside, s, 4));
            if (L.intensity > 0) {
                if (id === 'neon' || id === 'sleek') {
                    glowLine(M, L, mt[0].at, T.inside, tk, [[UT(id === 'sleek' ? 1.5 : 0.0), VT(0.28)], [UT(id === 'sleek' ? 1.42 : 0.0), VT(0.76)]], s, { width: id === 'sleek' ? 0.0016 : 0.003, h: mt[0].T / s + (mt[0].pl.crown ?? 0.003) * 0.5 + 0.0003 });
                    glowLine(M, L, ms[0].at, Sh.inside, sk, [[US(0), VS(0.25)], [US(0), VS(0.8)]], s, { width: id === 'sleek' ? 0.0016 : 0.003, h: ms[0].T / s + (ms[0].pl.crown ?? 0.003) * 0.85 + 0.0003 });
                } else { const p = ms[ms.length - 1].at(0, VS(0.02) * s, ms[ms.length - 1].T + 0.0085 * s), nn = norm(sub(p, Sh.inside(p))); box(M.glow, p, [norm(cross(Sh.d, nn)), Sh.d, nn], [0.008 * s, 0.002 * s, 0.0012 * s], 0.0007 * s, L.glow, sk, 1); }
            }
            if (id === 'military' || id === 'salvaged') {
                // A knee actuator down the outside: a sleeve on the thigh, its rod on the shin.
                const pu = T.at(Math.PI / 2, 0.78, gap + 0.007 * s), pl = Sh.at(Math.PI / 2, 0.3, gap + 0.008 * s), mid = lerp(pu, pl, 0.5);
                cylinder(M.dark, pu, mid, 0.0068 * s, L.dark, tk, 10);
                cylinder(M.frame, lerp(pu, pl, 0.35), pl, 0.0038 * s, L.trim, sk, 8);
                for (const [p, j, E] of [[pu, tk, T], [pl, sk, Sh]]) cylinder(M.frame, p, add(p, mul(norm(sub(p, E.inside(p))), 0.004 * s)), 0.0075 * s, L.trim, j, 10);
            }
        }
        return armorParts('Cyber leg armor', L, M, s);
    }

    // ── soft techwear: what is bonded to the cloth ────────────────────────
    /** The light look of a soft garment: its channels' color and strength, and whether they show at all. */
    function softLook(item) {
        const on = item.lightStyle !== 'none' && (item.lightIntensity ?? 0.8) > 0;
        const main = linear(item.color || '#202228'), second = linear(item.color2 || item.color || '#303238'), trim = linear(item.trim || item.color2 || '#3a3d44');
        return { main, second, trim, glow: linear(item.lightColor || '#38e6ff'), glowHex: isHex(item.lightColor) ? item.lightColor : '#38e6ff', intensity: on ? clamp01(item.lightIntensity ?? 0.8) : 0,
            channels: on && (item.lightStyle === 'strips' || item.lightStyle === 'circuits'), circuits: on && item.lightStyle === 'circuits', badges: on, width: item.lightWidth || 1, style: item.style };
    }
    const softMeshes = () => ({ panel: new Mesh(), tape: new Mesh(), glow: new Mesh(), glass: new Mesh(), hard: new Mesh(), rubber: new Mesh() });
    function softParts(label, L, M, tileKind = 'plastic', panelRough = 0.32) {
        const out = [];
        if (!M.panel.empty) out.push(withTile(M.panel.part(label + ' panels', { roughness: panelRough, metalness: 0, doubleSided: false }), tileKind, panelRough, 0.5));
        if (!M.tape.empty) out.push(withTile(M.tape.part(label + ' tapes', { roughness: 0.55, metalness: 0, doubleSided: false }), 'neoprene', 0.55, 0.5));
        if (!M.rubber.empty) out.push(withTile(M.rubber.part(label + ' straps', { roughness: 0.82, metalness: 0, doubleSided: false }), 'canvas', 0.82, 0.8));
        if (!M.hard.empty) out.push(M.hard.part(label + ' hardware', { roughness: 0.3, metalness: 0.75 }));
        if (!M.glow.empty) out.push(M.glow.part(label + ' lights', { roughness: 0.35, metalness: 0, emissive: L.glowHex, emissiveIntensity: L.intensity }));
        if (!M.glass.empty) out.push(M.glass.part(label + ' inserts', { roughness: 0.12, metalness: 0, opacity: 0.7, emissive: L.glowHex, emissiveIntensity: L.intensity * 0.7, doubleSided: false }));
        return out;
    }
    /** Region helpers on cloth coordinates (signed meters, inside positive). */
    const R = {
        trunk: f => c => (c.fam === 0 ? f(c) : -1),
        limbs: (fams, f) => c => (fams.includes(c.fam) ? f(c) : -1),
        /** Between bearings a0..a1 (wrapping round the back if needed) and spine positions s0..s1. */
        box: (a0, a1, s0, s1) => c => { const m = (a0 + a1) / 2, h = (a1 - a0) / 2, d = wrap(c.a - m); return Math.min((h - Math.abs(d)) * c.r, (c.s - s0) * c.U, (s1 - c.s) * c.U); },
        /** Signed distance to the left of a polyline of [a, s] points (meters), + to the left looking along it. */
        side: pts => c => {
            let best = Infinity, sign = 1;
            for (let i = 0; i + 1 < pts.length; i++) {
                const A = [pts[i][0] * c.r, pts[i][1] * c.U], B = [pts[i + 1][0] * c.r, pts[i + 1][1] * c.U], P = [wrap(c.a - pts[i][0]) * c.r + A[0], c.s * c.U];
                const d = [B[0] - A[0], B[1] - A[1]], l2 = d[0] * d[0] + d[1] * d[1] || 1e-12, t = clamp(((P[0] - A[0]) * d[0] + (P[1] - A[1]) * d[1]) / l2, 0, 1);
                const q = [A[0] + d[0] * t - P[0], A[1] + d[1] * t - P[1]], dd = Math.hypot(q[0], q[1]);
                if (dd < best) { best = dd; sign = (d[0] * (P[1] - A[1]) - d[1] * (P[0] - A[0])) >= 0 ? 1 : -1; }
            }
            return best * sign;
        },
        dist: pts => c => -Math.abs(R.side(pts)(c))
    };
    const and = (...fs) => c => Math.min(...fs.map(f => f(c))), or = (...fs) => c => Math.max(...fs.map(f => f(c)));
    /** Lines along iso-levels, swept with a profile; `accept` on the triangle's coordinates. */
    function lineAlong(S, fn, strips, { step = 0.009, accept = null, smooth = 1, minLen = 0.03 } = {}) {
        for (const raw of isoPaths(S, fn, accept)) {
            let total = 0; for (let i = 1; i < raw.length; i++) total += len(sub(raw[i].p, raw[i - 1].p));
            if (total < minLen * S.C.s) continue;
            const path = smoothPath(resample(raw, step * S.C.s), smooth);
            sweep(S, path, strips(path));
        }
    }
    /** Points every `gap` meters along an iso-line (for tabs, snaps, studs). */
    function pointsAlong(S, fn, gap, accept = null, margin = 0) {
        const out = [];
        for (const raw of isoPaths(S, fn, accept)) {
            const path = resample(raw, gap * S.C.s);
            for (let i = margin; i < path.length - margin; i++) { const a = path[Math.max(0, i - 1)].p, b = path[Math.min(path.length - 1, i + 1)].p; out.push(Object.assign({}, path[i], { t: norm(sub(b, a)) })); }
        }
        return out;
    }
    /** Points on outer cloth that an outer garment covers (its cloth just over them): no hardware there. */
    function coverTest(C, entries, layer) {
        const outer = entries.filter(e => !e.lining && e.laid.layer > layer), cell = 0.02 * C.s, grid = new Map();
        for (const e of outer) { const P = e.laid.positions, n = e.laid.rimStart; for (let v = 0; v < n; v++) { const k = Math.floor(P[v * 3] / cell) + ',' + Math.floor(P[v * 3 + 1] / cell) + ',' + Math.floor(P[v * 3 + 2] / cell); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]); } }
        if (!grid.size) return null;
        return (p, n) => {
            const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) for (const q of grid.get((cx + i) + ',' + (cy + j) + ',' + (cz + k)) || []) {
                const d = sub(q, p), up = dot(d, n);
                if (up > -0.004 * C.s && up < 0.035 * C.s && len(sub(d, mul(n, up))) < 0.014 * C.s) return true;
            }
            return false;
        };
    }

    /** The outfit's piece of a garment: its laid bodice (or skirt) entries. */
    const piecesOf = (C, item) => C.entries.filter(e => e.item === item && !e.lining);

    function techJacket(C, item, ctx) {
        const L = softLook(item), M = softMeshes(), s = C.s, style = item.style || 'diagonal';
        const lip = tone(L.main, 0.55), panelC = L.second, w = L.width;
        for (const e of piecesOf(C, item)) {
            if (e.skirt) continue;
            const S = clothSurface(C, e), hide = ctx.covered ? X2 => ctx.covered(X2.p, X2.n) : null;
            // Laminated yokes: over both shoulders front and back, down the sleeve's top to a point.
            // Laminated yokes: cut level across the chest (a shallow V to the sternum) and the back, and so round the sleeve cap.
            const yoke = c => {
                const fr = c.z > C.axisAt(c.y)[2], drop = fr ? 0.088 * s - 0.045 * s * Math.min(1, Math.abs(c.x - C.neck[0]) / (0.14 * s)) : 0.105 * s;
                const d = c.y - (C.shoulderY - drop);
                return c.fam === 1 || c.fam === 2 ? Math.min(d, (1.5 - c.s) * c.U) : c.fam === 0 ? d : -1;
            };
            panel(M.panel, S, region(S, yoke, 2), { lift: 0.0017, color: panelC, skip: hide });
            if (L.channels) lineAlong(S, c => yoke(c) - 0.006 * s, () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w * 0.8), { accept: cs => cs.every(c => c.fam === 0 && c.z > C.axisAt(c.y)[2]) });
            // Forearm panels with a channel along their outer edge.
            const fore = R.limbs([1, 2], c => Math.min((c.s - 2.18) * c.U, (2.84 - c.s) * c.U, (0.85 - Math.abs(wrap(c.a - Math.PI / 2))) * c.r));
            panel(M.panel, S, region(S, fore, 1), { lift: 0.0016, color: panelC });
            if (L.channels) lineAlong(S, c => (wrap(c.a - Math.PI / 2) + 0.97) * c.r, () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w), { accept: cs => cs.every(c => (c.fam === 1 || c.fam === 2) && c.s > 2.22 && c.s < 2.8 && Math.abs(wrap(c.a - Math.PI / 2)) < 2) });
            // Wrist tabs.
            panel(M.tape, S, region(S, R.limbs([1, 2], c => Math.min((c.s - 2.86) * c.U, 0.03)), 1), { lift: 0.0014, color: tone(L.main, 0.75) });
            // The closure.
            const line = style === 'twin' ? null : style === 'wrap' ? [[0.62, -0.5], [0.42, 1.2], [0.08, 2.8], [-0.18, 3.7], [-0.24, 4.6]] : [[0.42, -0.5], [0.3, 1.4], [-0.14, 3.45], [-0.2, 4.6]];
            const front = cs => cs.every(c => c.fam === 0 && Math.cos(c.a) > 0.2);
            if (line) {
                const d = R.side(line);
                // The storm flap (the wrap: the whole left front) lies over the seam, its edge rounded down to the cloth.
                const flapW = style === 'wrap' ? 0.4 : 0.03;
                panel(M.panel, S, region(S, R.trunk(and(c => -d(c), c => d(c) + flapW, c => (Math.cos(c.a) - 0.05) * c.r)), 1), { lift: style === 'wrap' ? 0.0026 : 0.0022, color: style === 'wrap' ? panelC : tone(L.main, 0.92) });
                lineAlong(S, R.trunk(c => d(c) + 0.0005), () => PROFILES.zip(M.tape, lip), { accept: front });
                if (L.channels) lineAlong(S, R.trunk(c => d(c) - 0.0075), () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w), { accept: front });
                // Magnetic tabs across the seam, each with an indicator.
                for (const q of pointsAlong(S, R.trunk(c => d(c) + flapW * 0.5), 0.085, front, 1)) {
                    if (q.co.s > 3.75 || q.co.s < 0.35) continue;
                    clothBox(M.hard, S, q, { w: 0.022, h: 0.011, d: 0.0032, color: tone(L.trim, 0.9), up: q.t, lift: 0.0024 });
                    if (L.badges) clothBox(M.glow, S, q, { w: 0.0045, h: 0.0035, d: 0.001, color: L.glow, up: q.t, lift: 0.0055 });
                }
            } else for (const sg of [1, -1]) {
                const d = R.trunk(c => (wrap(c.a - sg * 0.13) * c.r));
                lineAlong(S, d, () => PROFILES.zip(M.tape, lip), { accept: front });
                if (L.channels) lineAlong(S, R.trunk(c => wrap(c.a - sg * 0.13) * c.r - sg * 0.007), () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w), { accept: front });
                for (const q of pointsAlong(S, d, 0.11, front, 1)) if (q.co.s < 3.7 && q.co.s > 0.4) { clothBox(M.hard, S, q, { w: 0.016, h: 0.01, d: 0.003, color: tone(L.trim, 0.9), up: q.t, lift: 0.0006 }); if (L.badges) clothBox(M.glow, S, q, { w: 0.004, h: 0.003, d: 0.001, color: L.glow, up: q.t, lift: 0.0034 }); }
            }
            // A welded chest pocket on the right breast: a sealed zip on the slant and its pull.
            const pz = [[-0.42, 2.45], [-0.18, 2.95]], zd = R.side(pz);
            lineAlong(S, R.trunk(zd), () => PROFILES.zip(M.tape, lip), { accept: cs => front(cs) && cs.every(c => c.s > 2.45 && c.s < 2.95), minLen: 0.02 });
            const pull = locate(S, 0, 2.9, -0.2);
            clothBox(M.hard, S, pull, { w: 0.007, h: 0.02, d: 0.0025, color: L.trim, lift: 0.0012 });
            // Collar: a laminated band round the top of the funnel neck, its light ring.
            const collar = R.trunk(c => (c.s - 4.18) * c.U);
            panel(M.panel, S, region(S, collar, 1), { lift: 0.0018, color: panelC });
            if (L.circuits) lineAlong(S, R.trunk(c => (c.s - 3.05) * c.U), () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w * 0.8), { accept: cs => cs.every(c => c.fam === 0 && Math.cos(c.a) < -0.3) });
        }
        return softParts('Techwear jacket', L, M, 'plastic');
    }

    function cyberTrench(C, item, ctx) {
        const L = softLook(item), M = softMeshes(), s = C.s, style = item.style || 'piping', w = L.width, welt = tone(L.main, 0.6);
        for (const e of piecesOf(C, item)) {
            const S = clothSurface(C, e);
            // LED piping along every cut edge but the neck (where the collar stands).
            const notNeck = cs => cs.every(c => !(c.fam === 0 && c.s > 3.75 && !e.skirt));
            if (L.channels || L.badges) lineAlong(S, c => c.e - 0.0065, () => PROFILES.piping(M.tape, M.glow, welt, L.glow, w, 1), { accept: notNeck, step: 0.013 });
            if (e.skirt) {
                if (style === 'panelled' && L.channels) for (const x0 of [-0.055, 0.055]) lineAlong(S, c => c.x - C.neck[0] - x0 * s, () => PROFILES.channel(M.tape, M.glow, welt, L.glow, w), { accept: cs => cs.every(c => c.e > 0.02 && c.z < C.hips[2] - 0.03 * s) });
                continue;
            }
            if (style === 'caped') {
                // A storm cape: a laminated panel over the shoulders, its hem lit.
                const cape = c => { const d = c.y - (C.shoulderY - (c.z > C.axisAt(c.y)[2] ? 0.15 : 0.19) * s); return c.fam === 1 || c.fam === 2 ? Math.min(d, (1.75 - c.s) * c.U) : c.fam === 0 ? d : -1; };
                const reg = region(S, and(cape, c => c.e - 0.004), 2);
                panel(M.panel, S, reg, { lift: 0.0034, color: L.second });
                if (L.channels) lineAlong(S, and(cape, c => c.e - 0.012), () => PROFILES.channel(M.tape, M.glow, welt, L.glow, w), { step: 0.008 });
            } else {
                // Shoulder yokes, sealed.
                const yoke = c => { const d = c.y - (C.shoulderY - (c.z > C.axisAt(c.y)[2] ? 0.06 : 0.09) * s); return c.fam === 1 || c.fam === 2 ? Math.min(d, (1.45 - c.s) * c.U) : c.fam === 0 ? d : -1; };
                panel(M.panel, S, region(S, and(yoke, c => c.e - 0.004), 1), { lift: 0.0018, color: L.second });
                if (style === 'panelled' && L.channels) for (const x0 of [-0.055, 0.055]) lineAlong(S, c => c.x - C.neck[0] - x0 * s, () => PROFILES.channel(M.tape, M.glow, welt, L.glow, w), { accept: cs => cs.every(c => c.fam === 0 && c.z < C.axisAt(c.y)[2] - 0.03 * s && c.y < C.shoulderY - 0.1 * s) });
            }
            // Sleeve tabs with a magnetic stud.
            for (const fam of [1, 2]) { const q = locate(S, fam, 2.82, Math.PI / 2); if (q) { clothBox(M.panel, S, q, { w: 0.03, h: 0.05, d: 0.0025, color: L.second, lift: 0.0006 }); clothBox(M.hard, S, q, { w: 0.009, h: 0.009, d: 0.002, color: L.trim, lift: 0.0032 }); } }
        }
        return softParts('Cyber trench', L, M, 'plastic', 0.5);
    }

    function bomber(C, item, ctx) {
        const L = softLook(item), M = softMeshes(), style = item.style || 'stripe', w = L.width, welt = tone(L.main, 0.6);
        for (const e of piecesOf(C, item)) {
            const S = clothSurface(C, e), inserts = [];
            if (style === 'stripe') inserts.push(R.limbs([1, 2], c => Math.min((c.s - 1.2) * c.U, (2.62 - c.s) * c.U, (0.3 - Math.abs(wrap(c.a - Math.PI / 2 + 0.55))) * c.r)), R.trunk(c => Math.min((0.2 - Math.abs(wrap(Math.abs(c.a) - 1.57))) * c.r, (c.s - 1.4) * c.U, (2.75 - c.s) * c.U)));
            if (style === 'chevron') for (const k of [0, 1]) inserts.push(R.trunk(c => { const y = c.s - (2.35 - k * 0.34) - Math.abs(c.a) * 0.42; return Math.min(Math.min(y, 0.14 - y) * c.U, (0.9 - Math.abs(c.a)) * c.r, Math.cos(c.a) > 0.2 ? 1 : -1); }));
            if (style === 'grid') for (const [a, s0] of [[Math.PI - 0.36, 1.45], [Math.PI + 0.36, 1.45], [Math.PI - 0.36, 2.35], [Math.PI + 0.36, 2.35]]) inserts.push(R.trunk(c => Math.min((0.3 - Math.abs(wrap(c.a - a))) * c.r, (c.s - s0) * c.U, (s0 + 0.8 - c.s) * c.U)));
            for (const f of inserts) {
                panel(M.glass, S, region(S, f, 2), { lift: 0.0011, inset: 0.0003, color: tone(L.glow, 0.65), edgeShade: 1 });
                lineAlong(S, f, () => PROFILES.welt(M.panel, welt, 0.0034, 0.0016), { step: 0.007, smooth: 1 });
            }
            // Shoulder patch pocket on the left sleeve, sealed with a zip.
            const pocket = R.limbs([1], c => Math.min((c.s - 1.28) * c.U, (1.62 - c.s) * c.U, (0.42 - Math.abs(wrap(c.a - Math.PI / 2 + 0.25))) * c.r));
            panel(M.panel, S, region(S, pocket, 1), { lift: 0.0022, color: tone(L.main, 0.9) });
            lineAlong(S, R.limbs([1], c => (c.s - 1.34) * c.U), () => PROFILES.zip(M.tape, welt), { accept: cs => cs.every(c => c.fam === 1 && Math.abs(wrap(c.a - Math.PI / 2 + 0.25)) < 0.38) });
            // A center-front zip, its pull at the collar.
            lineAlong(S, R.trunk(c => wrap(c.a) * c.r), () => PROFILES.zip(M.tape, tone(L.main, 0.5)), { accept: cs => cs.every(c => c.fam === 0 && Math.cos(c.a) > 0.5 && c.s < 4.1) });
            const pull = locate(S, 0, 3.86, 0.0);
            clothBox(M.hard, S, pull, { w: 0.008, h: 0.024, d: 0.0025, color: L.trim, lift: 0.0013 });
        }
        return softParts('Glow bomber', L, M, 'plastic');
    }

    function smock(C, item, ctx) {
        const L = softLook(item), M = softMeshes(), style = item.style || 'zip', w = L.width, lip = tone(L.main, 0.55);
        for (const e of piecesOf(C, item)) {
            const S = clothSurface(C, e), front = cs => cs.every(c => c.fam === 0 && Math.cos(c.a) > 0.3);
            // The kangaroo pocket: a bonded panel across the belly, its two openings sealed zips on the slant.
            const pk = R.trunk(c => Math.min((0.78 - Math.abs(c.a)) * c.r, (c.s - 0.7) * c.U, (1.78 - c.s - Math.abs(c.a) * 0.25) * c.U));
            panel(M.panel, S, region(S, pk, 1), { lift: 0.0024, color: tone(L.main, 1.12) });
            for (const sg of [1, -1]) { const z = R.side([[sg * 0.62, 1.05], [sg * 0.36, 1.68]]); lineAlong(S, R.trunk(z), () => PROFILES.zip(M.tape, lip), { accept: cs => front(cs) && cs.every(c => c.s > 1.08 && c.s < 1.66), minLen: 0.02 }); }
            if (style === 'zip') {
                const pl = R.trunk(c => Math.min((0.06 - Math.abs(c.a)) * c.r, (c.s - 2.55) * c.U));
                panel(M.panel, S, region(S, pl, 1), { lift: 0.0019, color: tone(L.main, 1.2) });
                lineAlong(S, R.trunk(c => wrap(c.a) * c.r), () => PROFILES.zip(M.tape, tone(L.main, 0.5)), { accept: cs => front(cs) && cs.every(c => c.s > 2.6) });
                clothBox(M.hard, S, locate(S, 0, 3.75, 0.02), { w: 0.008, h: 0.024, d: 0.0025, color: L.trim, lift: 0.0035 });
            } else if (style === 'side') {
                const z = R.side([[0.05, 4.2], [0.62, 3.1], [1.0, 2.6]]);
                lineAlong(S, R.trunk(z), () => PROFILES.zip(M.tape, tone(L.main, 0.5)), { accept: front });
                if (L.channels) lineAlong(S, R.trunk(c => z(c) + 0.008), () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w), { accept: front });
            }
            if ((style === 'band' && L.channels) || L.circuits) lineAlong(S, c => (c.fam === 0 ? (c.s - 3.0) * c.U : (c.fam === 1 || c.fam === 2) ? (1.6 - c.s) * c.U : -1), () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w), { step: 0.009 });
            // Sleeve cuffs, laminated tabs at the wrist.
            panel(M.tape, S, region(S, R.limbs([1, 2], c => (c.s - 2.84) * c.U), 1), { lift: 0.0016, color: tone(L.main, 0.72) });
        }
        return softParts('Techwear smock', L, M, 'neoprene');
    }

    function joggers(C, item, ctx) {
        const L = softLook(item), M = softMeshes(), style = item.style || 'strapped', w = L.width, lip = tone(L.main, 0.55), s = C.s;
        for (const e of piecesOf(C, item)) {
            const S = clothSurface(C, e);
            const legs = cs => cs.every(c => c.fam === 3 || c.fam === 4);
            // Articulated knee panels: two laminated pieces with a channel between them.
            const knee = R.limbs([3, 4], c => Math.min((c.s - 0.8) * c.U, (1.3 - c.s) * c.U, (0.95 - Math.abs(c.a)) * c.r));
            panel(M.panel, S, region(S, and(knee, c => Math.abs(c.s - 1.06) * c.U - 0.0065), 1), { lift: 0.0022, color: L.second });
            if (L.channels) lineAlong(S, R.limbs([3, 4], c => (c.s - 1.06) * c.U), () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w * 0.9), { accept: cs => legs(cs) && cs.every(c => Math.abs(c.a) < 0.9), minLen: 0.02 });
            // A cargo pocket on each outer thigh: a bonded box, its flap, a snap.
            const pocket = R.limbs([3, 4], c => Math.min((c.s - 0.34) * c.U, (0.74 - c.s) * c.U, (0.55 - Math.abs(wrap(c.a - Math.PI / 2 + 0.35))) * c.r));
            panel(M.panel, S, region(S, pocket, 1), { lift: 0.0045, color: tone(L.main, 0.94) });
            const flap = R.limbs([3, 4], c => Math.min((c.s - 0.32) * c.U, (0.43 - c.s) * c.U, (0.6 - Math.abs(wrap(c.a - Math.PI / 2 + 0.35))) * c.r));
            panel(M.panel, S, region(S, flap, 1), { lift: 0.0068, color: L.second });
            for (const fam of [3, 4]) clothBox(M.hard, S, locate(S, fam, 0.415, Math.PI / 2 - 0.35), { w: 0.012, h: 0.008, d: 0.0025, color: L.trim, lift: 0.0068 });
            if (style === 'strapped') {
                // Thigh and calf straps, each with a side-release buckle on the outside.
                for (const sv of [0.3, 1.45]) {
                    lineAlong(S, R.limbs([3, 4], c => (c.s - sv) * c.U), () => PROFILES.strap(M.rubber, tone(L.second, 0.75), 0.022, 0.0028), { accept: legs, step: 0.012 });
                    for (const fam of [3, 4]) clothBox(M.hard, S, locate(S, fam, sv, Math.PI / 2), { w: 0.034, h: 0.026, d: 0.0055, color: tone(L.trim, 0.8), lift: 0.0025, round: 0.25 });
                }
                if (L.badges) for (const fam of [3, 4]) clothBox(M.glow, S, locate(S, fam, 0.3, Math.PI / 2), { w: 0.006, h: 0.004, d: 0.001, color: L.glow, lift: 0.008 });
            }
            if (style === 'seams' && L.channels) lineAlong(S, R.limbs([3, 4], c => wrap(c.a - Math.PI / 2) * c.r), () => PROFILES.channel(M.tape, M.glow, lip, L.glow, w), { accept: cs => cs.every(c => (c.fam === 3 || c.fam === 4) && c.s > 0.1 && c.s < 1.9 && Math.abs(wrap(c.a - Math.PI / 2)) < 1.5 && !(c.s > 0.3 && c.s < 0.74)) });
            // Cuffed ankles.
            panel(M.tape, S, region(S, R.limbs([3, 4], c => (c.s - 1.86) * c.U), 1), { lift: 0.0018, color: tone(L.main, 0.7) });
            void s;
        }
        return softParts('Tech joggers', L, M, 'plastic');
    }

    function compression(C, item, ctx) {
        const L = softLook(item), M = softMeshes(), lip = tone(L.main, 0.7);
        for (const e of piecesOf(C, item)) {
            const S = clothSurface(C, e), hide = ctx.covered ? X2 => ctx.covered(X2.p, X2.n) : null;
            // Padded panels: shoulders, kidneys, knees (low, so armor and clothes go over them).
            // (none where armor will go over them)
            const off = () => -1, kinds = ctx.kinds || new Set();
            const pads = or(
                kinds.has('pauldrons') ? off : R.limbs([1, 2], c => Math.min((c.s - 0.98) * c.U, (1.42 - c.s) * c.U, (1.0 - Math.abs(wrap(c.a - Math.PI / 2))) * c.r)),
                kinds.has('chest') ? off : R.trunk(c => Math.min((0.62 - Math.abs(Math.abs(wrap(c.a - Math.PI)) - 0.75)) * c.r, (c.s - 0.55) * c.U, (1.35 - c.s) * c.U)),
                kinds.has('legs') ? off : R.limbs([3, 4], c => Math.min((c.s - 0.86) * c.U, (1.22 - c.s) * c.U, (0.85 - Math.abs(c.a)) * c.r)));
            panel(M.panel, S, region(S, pads, 1), { lift: 0.0012, inset: 0.0005, color: L.second, skip: hide });
            void lip;
        }
        return softParts('Compression suit', L, M, 'neoprene');
    }

    /** The hard-point rig: webbing, a rail of slots, pods that snap onto it. */
    function rig(C, item, ctx) {
        const L = softLook(item), s = C.s, style = item.style || 'chest', M = softMeshes();
        const F = trunkField(C, ctx.under, ctx.trunkParts), H = C.neck[1] - C.hips[1], yF = f => C.hips[1] + f * H;
        const web = tone(L.main, 1), plateC = L.second, railC = linear(item.trim || '#55595f');
        const sk = (p, joint) => joint ? C.rigid(joint) : C.skinAt(p, v => C.an.member[C.src[v] * 5] > 0.5);
        /** A strap round the trunk through (bearing, height fraction) stations. */
        const strapPath = (stations, gap, width, thick, color) => {
            const pts = [];
            for (let i = 0; i + 1 < stations.length; i++) { const [a0, f0] = stations[i], [a1, f1] = stations[i + 1], n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * 12 + Math.abs(f1 - f0) * 30)); for (let k = 0; k < n; k++) { const t = k / n; pts.push([a0 + (a1 - a0) * t, f0 + (f1 - f0) * t]); } }
            pts.push(stations[stations.length - 1]);
            const P = pts.map(([a, f]) => F.at(a, yF(f), gap)), rows = [];
            for (let i = 0; i < P.length; i++) {
                const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], nn = norm(sub(P[i], F.inside(P[i]))), t = norm(sub(b, a)), x = norm(cross(t, nn)), k = sk(P[i]);
                rows.push([[-1, 0], [-1, 1], [1, 1], [1, 0]].map(([sx, up]) => M.rubber.v(add(add(P[i], mul(x, sx * width / 2 * s)), mul(nn, up * thick * s)), norm(add(mul(nn, up ? 1 : 0.2), mul(x, up ? sx * 0.15 : sx))), color, k, [pts[i][0], pts[i][1]])));
            }
            for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < 3; k++) M.rubber.quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
        };
        /** Over a shoulder: from the front (bearing a, height f) up over the top and down the back. */
        const overShoulder = (sx) => {
            const pts = [], arm = C.bone((sx > 0 ? 'Left' : 'Right') + 'Arm').head, x = C.neck[0] + (arm[0] - C.neck[0]) * 0.55, cap = C.shoulderY + 0.035 * s;
            const z0 = F.at(0.4 * sx, yF(0.86), 0)[2], z1 = F.at(Math.PI - 0.42 * sx, yF(0.86), 0)[2];
            for (let i = 0; i <= 14; i++) {
                const z = z0 + (z1 - z0) * i / 14; let y = yF(0.86);
                const BP = C.body.positions;
                for (let v = 0; v < BP.length / 3; v++) if (Math.abs(BP[v * 3] - x) < 0.02 * s && Math.abs(BP[v * 3 + 2] - z) < 0.02 * s && BP[v * 3 + 1] < C.neck[1] + 0.02 * s && BP[v * 3 + 1] > y) y = BP[v * 3 + 1];
                for (const e of ctx.under) { const P = e.laid.positions; for (let v = 0; v < e.laid.rimStart; v++) if (Math.abs(P[v * 3] - x) < 0.02 * s && Math.abs(P[v * 3 + 2] - z) < 0.02 * s && P[v * 3 + 1] < C.neck[1] + 0.03 * s && P[v * 3 + 1] > y) y = P[v * 3 + 1]; }
                pts.push([x, Math.min(y, cap) + 0.006 * s, z]);
            }
            for (let pass = 0; pass < 4; pass++) for (let k = 1; k + 1 < pts.length; k++) pts[k][1] = Math.max(pts[k][1], (pts[k - 1][1] + pts[k + 1][1]) / 2);
            const rows = [];
            for (let i = 0; i < pts.length; i++) {
                const d = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)])); let nn = norm(cross(d, X)); if (nn[1] < 0) nn = mul(nn, -1);
                const k = C.rigid('Spine2'), w2 = 0.024 * s;
                rows.push([[-1, 0], [-1, 1], [1, 1], [1, 0]].map(([sxx, up]) => M.rubber.v(add(add(pts[i], [sxx * w2, 0, 0]), mul(nn, up * 0.003 * s)), norm(add(mul(nn, up ? 1 : 0.2), [up ? sxx * 0.15 : sxx, 0, 0])), web, k, [i * 0.02, sxx])));
            }
            for (let i = 0; i + 1 < rows.length; i++) for (let k = 0; k < 3; k++) M.rubber.quad(rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]);
        };
        /** A rail: a slotted bar on a mounting plate, `pods` snapped onto it. */
        const railAt = (a0, a1, f, joint, pods) => {
            const gap = 0.012 * s, Rn = F.radius((a0 + a1) / 2, yF(f)), at = (u, v, h) => F.at(u / Rn, yF(f) + v, gap + h), sk2 = C.rigid(joint);
            const w = (a1 - a0) * Rn, hh = 0.075 * s;
            const sh = outline([[a0 * Rn, -hh / 2], [a1 * Rn, -hh / 2], [a1 * Rn, hh / 2], [a0 * Rn, hh / 2]], 0.012 * s, 30);
            shell(M.panel, at, sh, { T: 0.006 * s, ch: 0.0018 * s, crown: 0.003 * s, color: plateC, skin: sk2, inside: F.inside });
            // The rail: a T-section bar with slots every 15 mm.
            const n = Math.max(4, Math.round(w / (0.015 * s)));
            for (let i = 0; i < n; i++) {
                const u = a0 * Rn + (i + 0.5) / n * w, p = at(u, 0, 0.0115 * s), nn = norm(sub(p, F.inside(p))), t = norm(sub(at(u + 0.004 * s, 0, 0.0115 * s), p));
                box(M.hard, p, [t, Y, nn], [w / n * 0.42, 0.012 * s, 0.0026 * s], 0.0008 * s, railC, sk2, 0);
            }
            for (const v of [-0.017, 0.017]) { const p0 = at(a0 * Rn + 0.004 * s, v * s, 0.0105 * s), p1 = at(a1 * Rn - 0.004 * s, v * s, 0.0105 * s); cylinder(M.hard, p0, p1, 0.0022 * s, tone(railC, 0.85), sk2, 6); }
            pods.forEach((u0, i) => {
                const u = a0 * Rn + u0 * w, p = at(u, 0, 0.0255 * s), nn = norm(sub(p, F.inside(p))), t = norm(sub(at(u + 0.004 * s, 0, 0.0255 * s), p));
                const kind = i % 3;
                if (kind === 1) { cylinder(M.panel, add(p, mul(Y, -0.03 * s)), add(p, mul(Y, 0.03 * s)), 0.013 * s, tone(L.main, 0.85), sk2, 12); cylinder(M.hard, add(p, mul(Y, 0.03 * s)), add(p, mul(Y, 0.034 * s)), 0.011 * s, railC, sk2, 12); }
                else box(M.panel, p, [t, Y, nn], [0.022 * s, 0.032 * s, 0.012 * s], 0.006 * s, kind === 0 ? tone(L.main, 0.85) : plateC, sk2, 1);
                box(M.hard, sub(p, mul(nn, 0.011 * s)), [t, Y, nn], [0.016 * s, 0.014 * s, 0.003 * s], 0.001 * s, railC, sk2, 1);
                if (L.badges) box(M.glow, add(add(p, mul(nn, kind === 1 ? 0.013 * s : 0.012 * s)), mul(Y, 0.018 * s)), [t, Y, nn], [0.007 * s, 0.0022 * s, 0.0012 * s], 0.0006 * s, L.glow, sk2, 1);
            });
        };
        if (style === 'chest') {
            for (const sx of [1, -1]) { overShoulder(sx); strapPath([[0.4 * sx, 0.87], [0.42 * sx, 0.62]], 0.006 * s, 0.045, 0.003, web); strapPath([[Math.PI - 0.42 * sx, 0.87], [Math.PI - 0.28 * sx, 0.55]], 0.006 * s, 0.045, 0.003, web); }
            strapPath(Array.from({ length: 9 }, (_, i) => [-Math.PI + 0.25 + i / 8 * (TAU - 0.5), 0.5]), 0.006 * s, 0.04, 0.003, web);
            railAt(-0.55, 0.55, 0.64, 'Spine2', [0.16, 0.5, 0.84]);
            // A back plate between the straps.
            const Rb = F.radius(Math.PI, yF(0.68)), atb = (u, v, h) => F.at(Math.PI + u / Rb, yF(0.68) + v, 0.012 * s + h);
            shell(M.panel, atb, outline([[-0.07 * s, -0.08 * s], [0.07 * s, -0.08 * s], [0.07 * s, 0.08 * s], [-0.07 * s, 0.08 * s]], 0.015 * s, 30), { T: 0.007 * s, ch: 0.002 * s, crown: 0.004 * s, color: plateC, skin: C.rigid('Spine2'), inside: F.inside });
            // Quick-release buckle at the sternum strap.
            const bk = F.at(0, yF(0.5), 0.009 * s); box(M.hard, bk, [X, Y, Z], [0.024 * s, 0.018 * s, 0.006 * s], 0.004 * s, tone(railC, 0.6), C.rigid('Spine1'), 2);
            if (L.badges) box(M.glow, add(bk, [0, 0, 0.0062 * s]), [X, Y, Z], [0.006 * s, 0.006 * s, 0.001 * s], 0.002 * s, L.glow, C.rigid('Spine1'), 1);
        } else if (style === 'sling') {
            overShoulder(-1);
            strapPath([[-0.4, 0.87], [-0.2, 0.7], [0.3, 0.45], [0.75, 0.22], [1.3, 0.12]], 0.006 * s, 0.05, 0.003, web);
            strapPath([[Math.PI + 0.42, 0.87], [Math.PI + 0.1, 0.6], [Math.PI - 0.5, 0.35], [Math.PI - 1.3, 0.13], [1.3, 0.12]].map(([a, f]) => [wrap(a), f]).map(([a, f], i, arr) => [i && a < arr[i - 1][0] - Math.PI ? a + TAU : a, f]), 0.006 * s, 0.05, 0.003, web);
            railAt(-0.32, 0.18, 0.6, 'Spine2', [0.25, 0.75]);
            strapPath(Array.from({ length: 9 }, (_, i) => [-Math.PI + 0.25 + i / 8 * (TAU - 0.5), 0.12]), 0.008 * s, 0.045, 0.004, web);
        } else {
            strapPath(Array.from({ length: 13 }, (_, i) => [-Math.PI + i / 12 * TAU, 0.13]), 0.006 * s, 0.06, 0.004, web);
            railAt(-0.95, 0.95, 0.13, 'Hips', [0.1, 0.32, 0.68, 0.9]);
        }
        return softParts('Hard-point rig', L, M, 'plastic').map(p => Object.assign(p, { trunkGear: true }));
    }

    function gloves(C, item, ctx) {
        const L = softLook(item), M = softMeshes(), s = C.s, style = item.style || 'fingerless';
        for (const side of ['Left', 'Right']) {
            const hand = C.bone(side + 'Hand'), index = C.bone(side + 'HandIndex1'), pinky = C.bone(side + 'HandPinky1'), mid = C.bone(side + 'HandMiddle1');
            if (!index || !pinky || !mid) continue;
            const across = norm(sub(index.head, pinky.head)), along = norm(sub(mid.head, hand.head));
            const sideX = side === 'Left' ? 1 : -1;
            let back = norm(cross(across, along)); if (dot(back, [sideX, 0, 0]) < 0) back = mul(back, -1);
            // The hand's back faces away from the palm: out from the knuckles' mean against the palm side.
            const sk = C.rigid(side + 'Hand'), knuckles = lerp(index.head, pinky.head, 0.5), wide = len(sub(index.head, pinky.head));
            // Distance from the bone line to the back of the hand (skin), plus the glove.
            let reach = 0.012 * s;
            const BP = C.body.positions;
            const hc = lerp(hand.head, knuckles, 0.6); for (let v = 0; v < BP.length / 3; v++) { const p = [BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]], q = sub(p, hc); if (len(q) < 0.045 * s && Math.abs(dot(q, across)) < wide * 0.5 && Math.abs(dot(q, along)) < 0.025 * s) reach = Math.max(reach, dot(q, back)); }
            const c0 = add(lerp(hand.head, knuckles, 0.62), mul(back, reach + 0.006 * s));
            const at = (u, v, h) => add(add(add(c0, mul(across, u)), mul(along, v)), mul(back, h - 0.002 * s * ((u / (wide * 0.6)) ** 2)));
            const inside = p => sub(p, mul(back, 0.03 * s));
            shell(M.panel, at, outline([[-wide * 0.55, -0.028 * s], [wide * 0.55, -0.028 * s], [wide * 0.58, 0.012 * s], [-wide * 0.58, 0.012 * s]], 0.008 * s, 18), { T: 0.004 * s, ch: 0.0012 * s, crown: 0.002 * s, color: L.second, skin: sk, inside });
            // Knuckle guards: a ridged plate per pair of knuckles.
            for (const k of [-1, 1]) shell(M.hard, (u, v, h) => at(u + k * wide * 0.27, v + 0.026 * s, h + 0.002 * s), outline([[-wide * 0.25, -0.009 * s], [wide * 0.25, -0.009 * s], [wide * 0.22, 0.009 * s], [-wide * 0.22, 0.009 * s]], 0.004 * s, 12), { T: 0.004 * s, ch: 0.0012 * s, crown: 0.002 * s, color: L.trim, skin: sk, inside });
            if (L.badges) { const p = at(-wide * 0.3, -0.012 * s, 0.0052 * s); box(M.glow, p, [across, along, back], [wide * 0.22, 0.0016 * s, 0.0008 * s], 0.0005 * s, L.glow, sk, 1); }
            // A wrist band with a light ring.
            const fore = C.bone(side + 'ForeArm'), d = norm(sub(hand.head, fore.head)), w0 = sub(hand.head, mul(d, 0.025 * s));
            let r = 0.028 * s; for (let v = 0; v < BP.length / 3; v++) { const p = [BP[v * 3], BP[v * 3 + 1], BP[v * 3 + 2]], q = sub(p, w0), t = dot(q, d); if (Math.abs(t) < 0.01 * s && len(q) < 0.06 * s) r = Math.max(r, len(sub(q, mul(d, t)))); }
            const ring = (t, rr, n2 = 16) => { const x = norm(cross(d, Math.abs(d[1]) < 0.9 ? Y : X)), y = cross(d, x); return Array.from({ length: n2 }, (_, k) => { const a = k / n2 * TAU, o = add(mul(x, Math.cos(a)), mul(y, Math.sin(a))); return [add(add(w0, mul(d, t)), mul(o, rr)), o]; }); };
            const fsk = C.rigid(side + 'ForeArm'), rows = [[-0.014, r + 0.0015 * s], [-0.012, r + 0.0045 * s], [0.012, r + 0.0045 * s], [0.014, r + 0.0015 * s]].map(([t, rr]) => ring(t * s, rr));
            const ids = rows.map((rw, ri) => rw.map(([p, o]) => M.tape.v(p, ri === 0 ? norm(add(o, mul(d, -1))) : ri === 3 ? norm(add(o, d)) : o, tone(L.main, 0.75), fsk)));
            for (let ri = 0; ri + 1 < ids.length; ri++) for (let k = 0; k < 16; k++) M.tape.quad(ids[ri][k], ids[ri][(k + 1) % 16], ids[ri + 1][(k + 1) % 16], ids[ri + 1][k]);
            if (L.channels) { const g = ring(0, r + 0.0048 * s), g2 = ring(0.002 * s, r + 0.0048 * s), a = g.map(([p, o]) => M.glow.v(sub(p, mul(d, 0.0016 * s)), o, L.glow, fsk)), b = g2.map(([p, o]) => M.glow.v(p, o, L.glow, fsk)); for (let k = 0; k < 16; k++) M.glow.quad(a[k], a[(k + 1) % 16], b[(k + 1) % 16], b[k]); }
            void style;
        }
        return softParts('Tech gloves', L, M, 'plastic');
    }

    function magSoles(C, item, ctx) {
        const L = softLook(item), M = softMeshes(), s = C.s, g = ctx.garment;
        const shoe = C.shoeParts.find(p => p.name === (g && g.label));
        if (!shoe) return [];
        const P = shoe.positions, n = P.length / 3;
        for (const side of [1, -1]) {
            const ids = []; for (let v = 0; v < n; v++) if (Math.sign(P[v * 3]) === side) ids.push(v);
            if (!ids.length) continue;
            let ground = Infinity; for (const v of ids) ground = Math.min(ground, P[v * 3 + 1]);
            // The midsole's outline at a height: the farthest shoe point at each bearing round the foot's middle.
            const band = ids.filter(v => P[v * 3 + 1] < ground + 0.03 * s);
            let cx = 0, cz = 0; for (const v of band) { cx += P[v * 3]; cz += P[v * 3 + 2]; } cx /= band.length || 1; cz /= band.length || 1;
            const NA = 56, hs = [ground + 0.011 * s, ground + 0.016 * s], rad = hs.map(() => new Float32Array(NA)), who = hs.map(() => new Int32Array(NA).fill(-1));
            hs.forEach((h, hi) => { for (const v of ids) { if (Math.abs(P[v * 3 + 1] - h) > 0.006 * s) continue; const dx = P[v * 3] - cx, dz = P[v * 3 + 2] - cz, a = Math.floor(((Math.atan2(dx, dz) / TAU) % 1 + 1) % 1 * NA) % NA, r = Math.hypot(dx, dz); if (r > rad[hi][a]) { rad[hi][a] = r; who[hi][a] = v; } } });
            for (const r of rad) for (let pass = 0; pass < 6; pass++) for (let a = 0; a < NA; a++) if (!r[a]) r[a] = (r[(a + 1) % NA] + r[(a + NA - 1) % NA]) / 2 || 0;
            for (let a = 0; a < NA; a++) { const m = Math.max(rad[0][a], rad[1][a]); rad[0][a] = rad[1][a] = m; }
            const skin = who.map(w2 => Array.from(w2, (v, a) => { const u = v >= 0 ? v : who[0].find(x => x >= 0); return { joints: Array.from(shoe.joints.subarray(u * 4, u * 4 + 4)), weights: Array.from(shoe.weights.subarray(u * 4, u * 4 + 4)) }; }));
            const rows = [];
            // A light strip round the sole, set into a dark groove.
            const ring = (hi, out, dy) => Array.from({ length: NA }, (_, a) => { const t = (a + 0.5) / NA * TAU, r = rad[hi][a] + out; return [[cx + Math.sin(t) * r, hs[hi] + dy, cz + Math.cos(t) * r], [Math.sin(t), 0, Math.cos(t)]]; });
            const rowsDef = [[0, 0.0012 * s, -0.0028 * s, M.rubber, tone(L.main, 0.4)], [0, 0.0024 * s, -0.0018 * s, M.glow, L.glow], [0, 0.0024 * s, 0.0018 * s, M.glow, L.glow], [0, 0.0012 * s, 0.0028 * s, M.rubber, tone(L.main, 0.4)]];
            for (const [hi, out, dy, m2, col] of rowsDef) rows.push({ m: m2, ids: ring(hi, out, dy).map(([p, nn], a) => m2.v(p, nn, col, skin[hi][a])) });
            if (L.channels || L.badges) for (let a = 0; a < NA; a++) M.glow.quad(rows[1].ids[a], rows[1].ids[(a + 1) % NA], rows[2].ids[(a + 1) % NA], rows[2].ids[a]);
            // The mag-lock heel unit: a housing on the heel counter with a lit ring.
            const back = Math.round(NA / 2), r0 = rad[1][back] || 0.04 * s, hp = [cx, hs[1] + 0.012 * s, cz - r0 - 0.002 * s], hk = skin[1][back];
            box(M.hard, hp, [X, Y, [0, 0, -1]], [0.022 * s, 0.014 * s, 0.006 * s], 0.004 * s, tone(L.trim, 0.8), hk, 2);
            if (L.badges) cylinder(M.glow, add(hp, [0, 0, -0.0058 * s]), add(hp, [0, 0, -0.0068 * s]), 0.0055 * s, L.glow, hk, 14);
        }
        return softParts('Mag-sole shoes', L, M, 'plastic');
    }

    // ── glow painted into a garment's own cloth (RRCharacterAtlas) ────────
    /**
     * The light in a garment's own cloth at a texel (`p`: its chart point, `p.rest` meters on the
     * average body, `p.fam`, `p.s`, `p.ang`): 0..1. Smart shirts react in patterns; the
     * compression suit's panel lines; the others leave their light to their bonded channels.
     */
    function glowMask(item, p) {
        if (!item || p.val < 0 || item.lightStyle === 'none' || !(item.lightIntensity > 0)) return 0;
        const w = item.lightWidth || 1, R = p.rest || [0, 1, 0], st = item.style;
        const line = (d, width) => 1 - ss(width * w * 0.5, width * w, Math.abs(d));
        if (item.id === 'smartShirt') {
            // Surface coordinates in meters: round the trunk (its bearing at a chest's radius) and up it; round and along a limb.
            const x = p.fam === 0 ? Math.atan2(R[0], R[2]) * 0.15 : p.ang * 0.045, y = p.fam === 0 ? R[1] : 1.3 - (p.s - 1) * 0.27;
            if (st === 'pulse') {
                // Chevron waves running down from the collar, fading toward the hem.
                const v = (1.45 - y) + 0.55 * Math.abs(p.fam === 0 ? R[0] : 0), k = fract(v / 0.055);
                return line(k - 0.5, 0.06) * (0.3 + 0.7 * ss(0.65, 0.05, v)) * (p.fam === 0 ? 1 : 0.6);
            }
            if (st === 'rain') {
                const col = Math.floor(x / 0.009) + p.fam * 97;
                const speed = 0.5 + ihash(col, 3, 1), phase = fract(y * 3.2 * speed + ihash(col, 7, 2) * 10), drop = phase < 0.35 ? (0.35 - phase) / 0.35 : 0;
                const on = ihash(col, 11, 3) > 0.45 ? 1 : 0, digit = fract(y * 120) < 0.7 ? 1 : 0.3;
                return on * drop * digit * line(fract(x / 0.009) - 0.5, 0.18);
            }
            // Hex scales: lit edges, a few cells lit through, brightest over the chest and shoulders.
            const a = 0.024, rowH = a * Math.sqrt(3) / 2, j0 = Math.round(y / rowH);
            let best = Infinity, cell = null;
            for (let j = j0 - 1; j <= j0 + 1; j++) { const off = (j & 1) * 0.5, i0 = Math.round(x / a - off); for (let i = i0 - 1; i <= i0 + 1; i++) { const cx = (i + off) * a, cy = j * rowH, d = Math.hypot(x - cx, y - cy); if (d < best) { best = d; cell = [i, j, cx, cy]; } } }
            const dx = x - cell[2], dy = y - cell[3];
            let m = 0; for (const t of [Math.PI / 2, Math.PI / 6, -Math.PI / 6]) m = Math.max(m, Math.abs(dx * Math.cos(t) + dy * Math.sin(t)));
            const edge = (a * Math.sqrt(3) / 4 - m) / a, live = ss(0.25, 0.85, noise2(cell[0] * 0.45 + p.fam * 7, cell[1] * 0.45, 5));
            const env = p.fam === 0 ? 0.3 + 0.7 * ss(1.05, 1.35, R[1]) : 0.55, fill = ihash(cell[0] + p.fam * 31, cell[1], 9) > 0.93 ? 0.35 : 0;
            return Math.max(line(edge, 0.045) * (0.35 + 0.65 * live), fill * live) * env;
        }
        if (item.id === 'compressionSuit') {
            if (st === 'plain') return 0;
            if (p.fam === 0) {
                const x = Math.abs(R[0]), y = R[1], front = R[2] > 0;
                // Contour: a seam sweeping from the shoulder to the waist's side and in to the hip; spine; under the chest.
                const sweepX = 0.085 + 0.045 * Math.sin(clamp01((1.38 - y) / 0.45) * Math.PI) - 0.02 * clamp01((1.0 - y) / 0.12);
                let v = Math.max(line(x - sweepX, 0.0024) * ss(0.9, 0.95, y) * (1 - ss(1.38, 1.42, y)), front ? 0 : line(R[0], 0.0022) * ss(0.95, 1.0, y) * (1 - ss(1.42, 1.45, y)));
                if (front) v = Math.max(v, line(y - (1.19 - 0.25 * x * x), 0.0022) * (1 - ss(sweepX - 0.01, sweepX, x)));
                if (st === 'circuit') {
                    // Bus traces from the contour seam in toward the center, each ending on a pad; every few, a jog down.
                    const k = Math.round((y - 0.99) / 0.032), y0 = 0.99 + k * 0.032;
                    if (k >= 0 && k <= 10) {
                        const len = 0.02 + 0.045 * ihash(k, front ? 1 : 2, 7), x1 = sweepX - len, jog = ihash(k, front ? 3 : 4, 8) > 0.6 ? 0.012 : 0;
                        const run = line(y - y0, 0.0018) * ss(x1 - 0.001, x1 + 0.001, x) * (1 - ss(sweepX - 0.002, sweepX, x));
                        const pad = 1 - ss(0.0028 * w, 0.0042 * w, Math.hypot(x - x1, y - y0 + jog));
                        const down = jog ? line(x - x1, 0.0018) * (y < y0 && y > y0 - jog ? 1 : 0) : 0;
                        v = Math.max(v, run * 0.9, pad, down * 0.9);
                    }
                }
                return v;
            }
            // Down the outside of each limb, a ring at the elbow and the knee.
            const out = (p.fam === 1 || p.fam === 3) ? -Math.PI / 2 : Math.PI / 2;
            let v = line(wrap(p.ang - out) * 0.045, 0.0022 / 1);
            v = Math.max(v, line((p.s - (p.fam <= 2 ? 2.0 : 1.0)) * 0.27 - 0.03, 0.0022));
            if (st === 'circuit' && p.fam <= 2) v = Math.max(v, line((p.s - 2.6) * 0.27, 0.002));
            return v;
        }
        return 0;
    }

    // ── the catalog ───────────────────────────────────────────────────────
    const GROUP = 'Cyberpunk';
    /** Catalog entries, cut with RRCharacterWardrobe's own helpers (`kit`). */
    function garments(kit) {
        const { top, legs, hood, shoe, hands, vFront, skirtPiece, BODICE, NECKLINES } = kit;
        const light = (color, intensity = 0.85, styleL = 'strips') => ({ lightStyle: styleL, lightColor: color, lightIntensity: intensity, lightWidth: 1 });
        const own = { glowMask };
        return [
            Object.assign({ id: 'techJacket', label: 'Techwear jacket', slot: 'over', group: GROUP, knobs: ['length', 'fit'], styles: [['diagonal', 'Diagonal seal'], ['twin', 'Twin seals'], ['wrap', 'Wrap front']],
                defaults: Object.assign({ color: '#2b2e33', color2: '#1b1d21', trim: '#7d8288', length: 0.62, fit: 0.42, sleeves: 1, neckline: 'turtle', material: 'cloth', pattern: 'solid', trimWidth: 0, wear: 0, style: 'diagonal' }, light('#ff8a2a')),
                pieces: i => [top(Object.assign({}, i, { sleeves: 1, neckline: 'turtle', open: 0 }), { lift: 0.016, drape: 5, structured: true, hem: { thickness: 0.0016, facing: 0.012 } }), { cyberGear: 'techJacket' }] }, own),
            Object.assign({ id: 'cyberTrench', label: 'Cyber trench', slot: 'over', group: GROUP, knobs: ['length', 'fit', 'open'], styles: [['piping', 'Edge light'], ['caped', 'Storm cape'], ['panelled', 'Light panels']],
                construction: { parts: [{ kind: 'belt', s: 1.12, width: 0.042, thickness: 0.0035, buckle: '#8a9099', keepers: true, tail: 0.1 }] },
                defaults: Object.assign({ color: '#17181c', color2: '#26282e', trim: '#8a9099', length: 0.92, flare: 0.22, fit: 0.42, open: 0.32, sleeves: 1, neckline: 'crew', material: 'canvas', pattern: 'solid', trimWidth: 0, wear: 0, style: 'piping' }, light('#3fe0ff')),
                pieces: i => [vFront(top(Object.assign({}, i, { sleeves: 1, length: BODICE, neckline: 'crew' }), { lift: 0.018, drape: 6, structured: true, hem: { thickness: 0.0022, facing: 0.014 } }), i, { button: 2.0, width: 0.3, below: 0 }),
                    skirtPiece(Object.assign({}, i, { open: 0.12 + (i.open ?? 0.32) * 0.4 }), { lift: 0.024, hem: { thickness: 0.0022, facing: 0.014 } }), { collar: { open: 0.18, stand: 0.058, fall: 0.012, point: 0.004 } }, { cyberGear: 'cyberTrench' }] }, own),
            Object.assign({ id: 'cyberBomber', label: 'Glow bomber', slot: 'over', group: GROUP, knobs: ['fit'], styles: [['stripe', 'Sleeve stripes'], ['chevron', 'Chevrons'], ['grid', 'Back grid']],
                defaults: Object.assign({ color: '#141318', color2: '#2a2733', trim: '#a8acb4', length: 0.36, fit: 0.62, sleeves: 1, neckline: 'crew', material: 'cloth', pattern: 'solid', trimWidth: 0, wear: 0, style: 'stripe' }, light('#ff2bd6', 0.9)),
                construction: { parts: [{ kind: 'ribBands', neck: 0.022, cuffs: 0.055, hem: 0.06 }] },
                pieces: i => [top(Object.assign({}, i, { sleeves: 1, neckline: 'crew' }), { lift: 0.017, drape: 6, hem: { thickness: 0.0016, facing: 0.012 } }), { cyberGear: 'bomber' }] }, own),
            Object.assign({ id: 'techSmock', label: 'Techwear smock', slot: 'over', group: GROUP, knobs: ['length', 'fit'], styles: [['zip', 'Half zip'], ['side', 'Side zip'], ['band', 'Light band']],
                defaults: Object.assign({ color: '#3a3f45', color2: '#2a2e33', trim: '#6e747b', length: 0.78, fit: 0.72, sleeves: 1, neckline: 'crew', material: 'cloth', pattern: 'solid', trimWidth: 0, face: 0.3, wear: 0, style: 'zip' }, light('#7cff6a', 0.8)),
                pieces: i => [top(Object.assign({}, i, { sleeves: 1, neckline: 'crew' }), { lift: 0.018, drape: 7, hem: { thickness: 0.0016, facing: 0.012 } }), hood(Object.assign({}, i, { face: i.face ?? 0.3 })), { cyberGear: 'smock' }] }, own),
            Object.assign({ id: 'cyberJoggers', label: 'Tech joggers', slot: 'bottom', group: GROUP, knobs: ['fit'], styles: [['strapped', 'Strapped'], ['seams', 'Light seams'], ['clean', 'Clean']],
                defaults: Object.assign({ color: '#24262b', color2: '#33363c', trim: '#5f646b', length: 1, fit: 0.58, material: 'cloth', pattern: 'solid', trimWidth: 0, wear: 0, style: 'strapped' }, light('#38e6ff', 0.8)),
                pieces: i => [legs(Object.assign({ rise: 0.1 }, i, { length: 1 }), { hang: { legs: 0.5, legTaper: 0.42 }, hem: { thickness: 0.0016, facing: 0.012 } }), { cyberGear: 'joggers' }] }, own),
            Object.assign({ id: 'compressionSuit', label: 'Compression suit', slot: 'under', group: GROUP, knobs: ['neckline'], styles: [['contour', 'Contour lines'], ['circuit', 'Circuit traces'], ['plain', 'Plain']],
                defaults: Object.assign({ color: '#16181d', color2: '#262a31', trim: '#3a4048', fit: 0.05, neckline: 'turtle', material: 'rubber', pattern: 'solid', trimWidth: 0, wear: 0, style: 'contour' }, light('#38e6ff', 0.7)),
                pieces: i => [{ surface: 'tights', rules: { spine: a => [-3, NECKLINES[i.neckline || 'turtle'](a)], arms: [-1, 3.02], legs: [-1, 9] }, lift: 0.004, drape: 1, hem: { thickness: 0.0012, facing: 0.008 } }, { cyberGear: 'compression' }] }, own),
            Object.assign({ id: 'smartShirt', label: 'Smart shirt', slot: 'top', group: GROUP, knobs: ['sleeves', 'fit'], styles: [['hex', 'Hex scales'], ['pulse', 'Pulse waves'], ['rain', 'Data rain']],
                defaults: Object.assign({ color: '#1c1d22', color2: '#2a2c33', length: 0.8, fit: 0.18, sleeves: 1, neckline: 'high', material: 'cloth', pattern: 'solid', trimWidth: 0, wear: 0, style: 'hex' }, light('#38e6ff', 0.7)),
                construction: { parts: [{ kind: 'ribBands', neck: 0.018, cuffs: 0, hem: 0 }] },
                pieces: i => [top(i, { lift: 0.006 + (i.fit ?? 0.18) * 0.01, hem: { thickness: 0.0012, facing: 0.012 } })] }, own),
            Object.assign({ id: 'utilityRig', label: 'Hard-point rig', slot: 'chestRig', group: GROUP, knobs: [], styles: [['chest', 'Chest rail'], ['sling', 'Sling rail'], ['belt', 'Belt rail']],
                defaults: Object.assign({ color: '#2d3034', color2: '#3d4148', trim: '#6c7178', material: 'canvas', wear: 0, style: 'chest' }, light('#ffb020', 0.85, 'badge')),
                pieces: () => [{ cyberGear: 'rig' }] }, own),
            Object.assign({ id: 'techGloves', label: 'Tech gloves', slot: 'hands', group: GROUP, knobs: ['length'], styles: [['fingerless', 'Fingerless'], ['full', 'Full fingers']],
                defaults: Object.assign({ color: '#1d1f23', color2: '#2f3238', trim: '#7d838b', length: 0.25, material: 'leather', wear: 0, style: 'fingerless' }, light('#38e6ff', 0.8)),
                pieces: i => [i.style === 'full' ? hands(i) : hands(i, { rules: { arms: [2.82 - (i.length ?? 0.25) * 0.6, 3.5] } }), { cyberGear: 'gloves' }] }, own),
            Object.assign({ id: 'magSoles', label: 'Mag-sole shoes', slot: 'feet', group: GROUP, knobs: ['length'], styles: [['sneaker', 'Sneakers'], ['boot', 'High boots']],
                defaults: Object.assign({ color: '#1e2024', color2: '#3a3e45', trim: '#1a1c20', length: 0.45, bulk: 0.1, material: 'rubber', wear: 0, style: 'sneaker' }, light('#38e6ff', 0.9)),
                pieces: i => [i.style === 'boot' ? shoe('mag', i, { sole: 0.024, toe: 0.011, wall: 0.024 }) : shoe('sneaker', i, { sole: 0.026 }), { cyberGear: 'magSoles' }] }, own),
            Object.assign({ id: 'cyberChest', label: 'Cyber chest armor', slot: 'armor', group: GROUP, knobs: ['bulk'], styles: ARMOR_STYLES,
                defaults: { bulk: 0.4, material: 'plastic', wear: 0, style: 'military', lightStyle: 'strips', lightIntensity: 0.75, lightWidth: 1 },
                pieces: () => [{ cyberGear: 'chest' }] }, own),
            Object.assign({ id: 'cyberPauldrons', label: 'Cyber pauldrons', slot: 'shoulders', group: GROUP, knobs: ['bulk'], styles: ARMOR_STYLES,
                defaults: { bulk: 0.4, material: 'plastic', wear: 0, style: 'military', lightStyle: 'strips', lightIntensity: 0.75, lightWidth: 1 },
                pieces: () => [{ cyberGear: 'pauldrons' }] }, own),
            Object.assign({ id: 'cyberBracers', label: 'Cyber bracers', slot: 'wrists', group: GROUP, knobs: ['bulk'], styles: ARMOR_STYLES,
                defaults: { bulk: 0.4, material: 'plastic', wear: 0, style: 'military', lightStyle: 'strips', lightIntensity: 0.75, lightWidth: 1 },
                pieces: () => [{ cyberGear: 'bracers' }] }, own),
            Object.assign({ id: 'cyberLegs', label: 'Cyber leg armor', slot: 'legarmor', group: GROUP, knobs: ['bulk'], styles: ARMOR_STYLES,
                defaults: { bulk: 0.4, material: 'plastic', wear: 0, style: 'military', lightStyle: 'strips', lightIntensity: 0.75, lightWidth: 1 },
                pieces: () => [{ cyberGear: 'legs' }] }, own)
        ];
    }

    /** Armor in one style and palette: chest, pauldrons, bracers and legs alike. */
    const armorSet = (style, o) => ['cyberChest', 'cyberPauldrons', 'cyberBracers', 'cyberLegs'].map(id => Object.assign({ id, style }, o));
    const PRESETS = [
        { id: 'netrunner', label: 'Netrunner', group: GROUP, items: [
            // Hooded, visored and wired in: cyan light down every seam.
            { id: 'smartShirt', style: 'rain', color: '#0f1a1e', color2: '#16323a', lightColor: '#38e6ff', lightIntensity: 0.85 },
            { id: 'cyberJoggers', style: 'seams', color: '#1a2226', color2: '#1f4048', trim: '#38e6ff', lightColor: '#38e6ff', fit: 0.45 },
            { id: 'techSmock', style: 'band', color: '#22343a', color2: '#163038', trim: '#38e6ff', lightColor: '#38e6ff', lightIntensity: 1, length: 0.86, face: 0.15 },
            { id: 'utilityRig', style: 'sling', color: '#152026', color2: '#38e6ff', trim: '#7fdcec', lightColor: '#38e6ff' },
            { id: 'dustGoggles', style: 'eyes', color: '#11181c', color2: '#38e6ff' },
            { id: 'techGloves', style: 'full', color: '#121a1e', color2: '#1f4048', lightColor: '#38e6ff' },
            { id: 'magSoles', style: 'sneaker', color: '#1a2226', color2: '#38e6ff', trim: '#14191c', lightColor: '#38e6ff' }] },
        { id: 'streetSamurai', label: 'Street samurai', group: GROUP, items: [
            { id: 'cyberJoggers', style: 'strapped', color: '#161618', color2: '#2a1418', trim: '#3a3a3e', lightColor: '#ff3046' },
            { id: 'techJacket', style: 'wrap', color: '#151517', color2: '#5a0f18', trim: '#b49a5a', lightColor: '#ff3046', length: 0.7 },
            { id: 'cyberBracers', style: 'military', color: '#6a1018', color2: '#1c1c1f', trim: '#b49a5a', lightColor: '#ff3046', lightIntensity: 0.6 },
            { id: 'cyberPauldrons', style: 'military', color: '#6a1018', color2: '#1c1c1f', trim: '#b49a5a', lightColor: '#ff3046', bulk: 0.2 },
            { id: 'techGloves', style: 'fingerless', color: '#151517', trim: '#b49a5a', lightColor: '#ff3046' },
            { id: 'magSoles', style: 'boot', color: '#141416', color2: '#2a1418', lightColor: '#ff3046', length: 0.42 }] },
        { id: 'corporateAgent', label: 'Corporate agent', group: GROUP, items: [
            { id: 'smartShirt', style: 'hex', color: '#e9ebee', color2: '#cfd3d8', neckline: 'high', lightColor: '#9fd8ff', lightIntensity: 0.25 },
            { id: 'jeans', color: '#1d1f24', trouserStyle: 'tailored', fit: 0.25 },
            { id: 'cyberTrench', style: 'piping', color: '#1c1d21', color2: '#25272c', lightColor: '#d9f1ff', lightIntensity: 0.75, length: 0.95, open: 0.22 },
            { id: 'shoes', color: '#0f0f11' }] },
        { id: 'techCourier', label: 'Techwear courier', group: GROUP, items: [
            // High-visibility: acid-yellow bonded panels and an orange rig over storm grey.
            { id: 'cyberJoggers', style: 'strapped', color: '#3c4046', color2: '#c9f22a', trim: '#ff7a1a', lightColor: '#ff8a2a', fit: 0.7 },
            { id: 'techJacket', style: 'diagonal', color: '#4a4f56', color2: '#d4ff2e', trim: '#e8ebee', lightColor: '#ff8a2a', length: 0.56 },
            { id: 'utilityRig', style: 'chest', color: '#202225', color2: '#ff7a1a', trim: '#5b6066', lightColor: '#ff8a2a' },
            { id: 'techGloves', style: 'fingerless', color: '#1d1f23', lightColor: '#ff8a2a' },
            { id: 'magSoles', style: 'sneaker', color: '#e6e7e9', color2: '#ff7a1a', trim: '#d8dadd', lightColor: '#ff8a2a' }] },
        { id: 'cyberEnforcer', label: 'Cyber enforcer', group: GROUP, items: [
            { id: 'compressionSuit', style: 'contour', color: '#15171a', color2: '#23272c', lightColor: '#ff9a3a', lightIntensity: 0.5 },
            ...armorSet('military', { color: '#3e4636', color2: '#272b25', trim: '#202321', lightColor: '#ff9a3a', bulk: 0.55 }),
            { id: 'techGloves', style: 'fingerless', color: '#1b1d1b', color2: '#2a2e28', lightColor: '#ff9a3a', lightStyle: 'badge' },
            { id: 'magSoles', style: 'boot', color: '#1c1e1c', color2: '#2e322c', lightColor: '#ff9a3a', length: 0.6 }] },
        { id: 'chromeMercenary', label: 'Chrome mercenary', group: GROUP, items: [
            { id: 'compressionSuit', style: 'plain', color: '#1a1c21', color2: '#2a2e35' },
            ...armorSet('sleek', { color: '#e3e6ea', color2: '#b4bcc6', trim: '#c9ced4', material: 'metal', lightColor: '#7cd8ff', bulk: 0.35 }),
            { id: 'techGloves', style: 'fingerless', color: '#202328', color2: '#c9ced4', lightColor: '#7cd8ff' },
            { id: 'magSoles', style: 'boot', color: '#202328', color2: '#9aa2ac', lightColor: '#7cd8ff', length: 0.6 }] },
        { id: 'neonPunk', label: 'Neon punk', group: GROUP, items: [
            { id: 'smartShirt', style: 'rain', color: '#0e0e12', lightColor: '#ff2bd6', lightIntensity: 0.8, sleeves: 0.3 },
            { id: 'cyberJoggers', style: 'seams', color: '#1a1820', color2: '#2a2733', lightColor: '#ff2bd6', wear: 0.18 },
            { id: 'cyberBomber', style: 'stripe', color: '#2a0f2e', color2: '#ff2bd6', trim: '#f2d4ff', lightColor: '#ff2bd6' },
            { id: 'cyberPauldrons', style: 'neon', color: '#24102a', color2: '#ff2bd6', trim: '#d9dde3', lightColor: '#ff2bd6', bulk: 0.3 },
            { id: 'techGloves', style: 'fingerless', color: '#121116', lightColor: '#ff2bd6' },
            { id: 'magSoles', style: 'sneaker', color: '#121116', color2: '#ff2bd6', lightColor: '#ff2bd6' }] },
        { id: 'glowRunner', label: 'Glow runner', group: GROUP, items: [
            { id: 'compressionSuit', style: 'circuit', color: '#0f1118', color2: '#1a1e2a', lightColor: '#38e6ff', lightIntensity: 0.75 },
            ...armorSet('neon', { color: '#1b2030', color2: '#2a3346', trim: '#4a5672', lightColor: '#38e6ff', bulk: 0.3 }).filter(i => i.id !== 'cyberPauldrons'),
            { id: 'techGloves', style: 'fingerless', color: '#141822', lightColor: '#38e6ff' },
            { id: 'magSoles', style: 'sneaker', color: '#141822', color2: '#2a3346', lightColor: '#38e6ff' }] },
        // Street chrome: polished plates bolted over black techwear, violet light in the seams.
        { id: 'scrapper', label: 'Chrome scrapper', group: GROUP, items: [
            { id: 'compressionSuit', style: 'circuit', color: '#111116', color2: '#1d1c26', lightColor: '#b45cff', lightIntensity: 0.65 },
            { id: 'cyberJoggers', style: 'seams', color: '#17161c', color2: '#25232e', trim: '#9aa0aa', lightColor: '#b45cff' },
            { id: 'cyberBomber', style: 'chevron', color: '#141319', color2: '#262430', trim: '#b9bfc8', lightColor: '#b45cff', fit: 0.5 },
            ...armorSet('sleek', { color: '#c9ced6', color2: '#7d8592', trim: '#eef1f4', material: 'metal', lightColor: '#b45cff', bulk: 0.4 }).filter(i => i.id !== 'cyberLegs' && i.id !== 'cyberChest'),
            { id: 'utilityRig', style: 'sling', color: '#18171d', color2: '#c9ced6', trim: '#9aa0aa', lightColor: '#b45cff' },
            { id: 'techGloves', style: 'full', color: '#16151b', color2: '#c9ced6', lightColor: '#b45cff' },
            { id: 'magSoles', style: 'boot', color: '#16151b', color2: '#7d8592', lightColor: '#b45cff' }] }
    ];

    // ── building ──────────────────────────────────────────────────────────
    const ORDER = ['compression', 'joggers', 'techJacket', 'bomber', 'smock', 'cyberTrench', 'legs', 'chest', 'bracers', 'pauldrons', 'gloves', 'magSoles', 'rig'];
    const SOFT = { techJacket, cyberTrench, bomber, smock, joggers, compression, gloves, magSoles, rig };
    const HARD = { chest: chestArmor, pauldrons, bracers, legs: legArmor };
    /**
     * The outfit's cyber gear: { parts, textures, hidden }. `gear`: [{ item, kind, layer }] from the
     * outfit's pieces; `entries`: the laid soft garments; `shoeParts`: what is made so far.
     */
    function build(pack, built, gear, entries, shoeParts, cache) {
        const out = { parts: [], textures: [], hidden: new Set() };
        if (!gear || !gear.length) return out;
        const C = context(pack, built, entries, shoeParts);
        const sorted = gear.slice().sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
        const trunkParts = [];
        for (const g of sorted) {
            // Soft gear sits on what is worn up to its own layer; armor is fitted over all the cloth (it is built after it,
            // so a sleeve or a coat laid later would otherwise pass through a plate).
            const under = (entries || []).filter(e => !e.lining && (HARD[g.kind] || e.laid.layer <= g.layer));
            const ctx = { under, trunkParts, garment: g.garment, covered: coverTest(C, entries || [], g.layer), kinds: new Set(gear.map(x => x.kind)) };
            let parts = [];
            try { parts = (SOFT[g.kind] ? SOFT[g.kind](C, g.item, ctx) : HARD[g.kind] ? HARD[g.kind](C, g.item, under) : []) || []; }
            catch (err) { if (root.RR_CYBERWEAR_STRICT) throw err; parts = []; }
            parts = parts.filter(p => p && p.index && p.index.length);
            // A part with a point that did not resolve is left out (never a broken model).
            parts = parts.filter(p => { for (const x of p.positions) if (!Number.isFinite(x)) { if (root.RR_CYBERWEAR_STRICT) throw new Error('non-finite point in ' + p.name); return false; } return true; });
            const Wear = need('RRCharacterWear', './CharacterWear.js');
            if (Wear && Wear.weatherParts && g.item.wear > 0) Wear.weatherParts(parts.filter(p => !p.emissive && !p.texture && !p.clothDetail), g.item, built);
            // Bonded panels and tapes wear with their cloth: duller and a shade darker all over.
            if (g.item.wear > 0) for (const p of parts) if (p.clothDetail && !p.emissive) { const k = 1 - 0.3 * g.item.wear; for (let i = 0; i < p.colors.length; i++) p.colors[i] *= k; p.roughness = Math.min(0.9, (p.roughness ?? 0.5) + 0.35 * g.item.wear); }
            if (g.kind === 'chest') trunkParts.push(...parts.filter(p => !p.emissive));
            out.parts.push(...parts);
        }
        const Fabric = need('RRCharacterFabric', './CharacterFabric.js');
        if (Fabric) for (const p of out.parts) if (p.fabricTile) { const t = Fabric.tile(p.fabricTile); for (const pic of [t.normal, t.orm]) if (!out.textures.includes(pic)) out.textures.push(pic); }
        return out;
    }

    const api = { garments, PRESETS, GROUP, ARMOR_STYLES, LOCAL_STYLES, cyberStyle, build, glowMask, region, isoPaths, clothSurface, limbField, trunkField, outline, shell };
    root.RRCharacterCyberwear = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
