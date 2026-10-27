/**
 * RRCharacterCyberGear - cyberware worn on and bolted into the head and
 * body, for the Character Builder's accessories (RRCharacterProps):
 *
 *   Cyber faces  - a jaw replacement whose lower half rides the jaw, a half-face
 *                  plate round one eye, a full faceplate, a brow plate.
 *   Cyber masks  - a respirator, an LED mask with a glowing pattern, an armored
 *                  mask (demon, wolf, raptor), a mouth guard, a face shield.
 *   HUD eyewear  - a HUD monocle, an ear scouter, the wraparound visor, AR
 *                  glasses, tactical goggles, a halo projector.
 *   Implants     - temple jacks, a neck jack, a spinal column, a chest core, a
 *                  forearm screen, under-eye lights, ear antennas.
 *
 * Every piece comes in the four cyber styles the body mods share (STYLES):
 * sleek chrome and white ceramic, military matte with bolts and pistons,
 * salvaged junk with mismatched panels and cables, and glowing tech with
 * light lines and translucent panels. The style changes the design as well
 * as the paint: how eyes are covered, what holds the plates on, what glows.
 *
 * Face pieces are laid on the face itself: rays cast from inside the head
 * find the skin all round the face (headField), and a plate is a shell over
 * that surface, its outline a 2D shape in "face meters" anchored on the
 * eyes, mouth, chin and ears as measured on the head as shaped, so a plate
 * fits any face. Each plate carries its own pictures (color, relief,
 * roughness and metal, glow) painted from the same shapes. Where the face
 * moves under a piece, the piece moves with it (part.faceFollow, read by
 * RRCharacterExpressions): a jaw piece swings with the jaw as the lower
 * teeth do, a plate on the cheek rides the skin, the rest stays still.
 */
(function(root) {
    'use strict';

    const Body = root.RRHumanBody || (typeof require === 'function' ? require('./HumanBody.js') : null);
    /** RRCharacterProps, needed only while building: it loads this file first and is on the page (or global) by then. */
    const Props = () => root.RRCharacterProps;

    // ── small math ────────────────────────────────────────────────────────
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
    const mix = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const fract = x => x - Math.floor(x);
    const hash2 = (x, y) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
    function noise(x, y) {
        const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
        const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
        return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    const fbm = (x, y) => noise(x, y) * 0.5 + noise(x * 2.03 + 7.1, y * 2.03 - 3.3) * 0.3 + noise(x * 4.1 - 1.7, y * 4.1 + 9.2) * 0.2;

    // ── colors ────────────────────────────────────────────────────────────
    const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const toByte = c => Math.max(0, Math.min(255, Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055) * 255)));
    const isHex = h => typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h);
    const linear = hex => { const n = parseInt((isHex(hex) ? hex : '#808080').slice(1), 16); return [toLinear(((n >> 16) & 255) / 255), toLinear(((n >> 8) & 255) / 255), toLinear((n & 255) / 255)]; };
    const mixRgb = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
    const scaleRgb = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const luma = c => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

    // ── the four cyber styles ─────────────────────────────────────────────
    /**
     * Shared with the body mods (RRCharacterBodyArt): the same ids, palette
     * and finish, so a jaw, an arm and a spine of one style make a set.
     * plate: the main shell; trim: joints, frames and fasteners; glow: the
     * default light; rough/metal: the shell's finish; trimRough/trimMetal:
     * the hardware's.
     */
    const STYLES = {
        chrome: { label: 'Sleek chrome', plate: '#e6e9ec', trim: '#b7bec6', inner: '#2a2e35', glow: '#5fe3ff', rough: 0.2, metal: 0, trimRough: 0.1, trimMetal: 1, wear: 0.08 },
        military: { label: 'Military', plate: '#4d5547', trim: '#2c302d', inner: '#1b1d1b', glow: '#ff9d3a', rough: 0.62, metal: 0.1, trimRough: 0.42, trimMetal: 0.85, wear: 0.35 },
        salvaged: { label: 'Salvaged', plate: '#8c6b4c', trim: '#6e706b', inner: '#24211e', glow: '#9cff57', rough: 0.58, metal: 0.25, trimRough: 0.45, trimMetal: 0.8, wear: 0.65,
            patches: ['#5b7571', '#9b978d', '#a5562f', '#5e636b', '#7d6a3e'] },
        glow: { label: 'Glowing tech', plate: '#1c2130', trim: '#424c62', inner: '#0b0d14', glow: '#ff3fd6', rough: 0.26, metal: 0.5, trimRough: 0.2, trimMetal: 0.9, wear: 0.05 }
    };
    /**
     * The saved ids are the body mods' (RRCharacterBodyArt.CYBER_STYLES):
     * sleek, military, salvaged, neon; their base, trim, joint and glow
     * colors and finish are taken from there when it is loaded, so a cyber
     * jaw and a cyber arm of one style match. Inside, the designs say chrome
     * and glow for sleek and neon.
     */
    const STYLE_CHOICES = [['sleek', 'Sleek prosthetic'], ['military', 'Military'], ['salvaged', 'Salvaged'], ['neon', 'Glowing high-tech']];
    const INNER = { sleek: 'chrome', military: 'military', salvaged: 'salvaged', neon: 'glow', chrome: 'chrome', glow: 'glow' }, SHARED = { chrome: 'sleek', military: 'military', salvaged: 'salvaged', glow: 'neon' };
    const inner = id => INNER[id] || 'chrome';
    // The body mods' styles when they are loaded (they load after the accessories); these designs' own otherwise.
    const Art = () => root.RRCharacterBodyArt || null;
    function styleOf(o) {
        const key = inner(o && o.style), mine = STYLES[key], art = Art(), shared = art && art.CYBER_BY_ID && art.CYBER_BY_ID.get(SHARED[key]);
        if (!shared) return mine;
        return Object.assign({}, mine, { label: shared.label, plate: shared.base, trim: shared.trim, inner: shared.joint, glow: shared.glow,
            rough: shared.roughness, metal: shared.metalness, trimRough: shared.trimRoughness, trimMetal: shared.trimMetalness });
    }
    /** The item's colors: its own where set, else its style's. */
    function paletteOf(o) {
        const s = styleOf(o), plate = isHex(o.color) ? o.color : s.plate, glow = isHex(o.color2) ? o.color2 : s.glow;
        const P = linear(plate), dark = luma(P) < 0.08;
        // The trim follows the plate: chrome stays chrome; elsewhere a deeper shade of the shell.
        const trim = inner(o.style) === 'chrome' ? linear(s.trim) : mixRgb(linear(s.trim), scaleRgb(P, dark ? 1.8 : 0.55), 0.35);
        return { s, plate: P, trim, inner: linear(s.inner), glow: linear(glow), glowHex: glow, plateHex: plate };
    }

    // ── the head, seen from inside ────────────────────────────────────────
    /**
     * Rays cast from a point inside the head in every direction over the
     * face find the skin (or the eyeball, in the lids' opening): R(a, e) is
     * the distance out to it at azimuth a (0 straight ahead, + to the
     * character's left) and elevation e. "Face meters" (X, Y) lay that
     * sphere flat about the face: X = a·Rref·cos e, Y = e·Rref.
     */
    const fieldCache = new Map();
    function headField(L) {
        if (L._cyberField) return L._cyberField;
        // The same head (a rebuild for a color or another accessory) keeps its field.
        let key = 0;
        for (let i = 0; i < L.headIds.length; i += 7) { const v = L.headIds[i]; key = (key * 31 + Math.round(L.P[v * 3] * 1e5) * 7 + Math.round(L.P[v * 3 + 1] * 1e5) * 13 + Math.round(L.P[v * 3 + 2] * 1e5)) % 2147483647; }
        key = key + '|' + L.headIds.length + '|' + L.eyeL.center.map(v => v.toFixed(5)).join(',');
        if (fieldCache.has(key)) return (L._cyberField = fieldCache.get(key));
        const pack = L.pack, body = L.bodyPart, src = pack.body.source, S = L.P;
        const H = Body.headFields(pack);
        const ringE = L.ring(L.eyeY) || { center: [0, L.eyeY, 0], rx: 0.075, rz: 0.095, front: 0.09 };
        const C = [ringE.center[0], L.eyeY * 0.6 + L.mouth[1] * 0.4, ringE.center[2] - ringE.rz * 0.05];
        const A0 = -2.35, A1 = 2.35, E0 = -1.3, E1 = 1.42, st = 0.014;
        const na = Math.round((A1 - A0) / st) + 1, ne = Math.round((E1 - E0) / st) + 1;
        // Triangles above the lower neck, without the ears (plates pass in front of them); the eyeballs too.
        const yLow = L.neck.center[1] + 0.025, tri = [], tsrc = [];
        const I = body.index, BP = body.positions;
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t], b = I[t + 1], c = I[t + 2];
            if (BP[a * 3 + 1] < yLow || BP[b * 3 + 1] < yLow || BP[c * 3 + 1] < yLow) continue;
            if (H.ear[src[a]] > 0.2 || H.ear[src[b]] > 0.2 || H.ear[src[c]] > 0.2) continue;
            tri.push(BP[a * 3], BP[a * 3 + 1], BP[a * 3 + 2], BP[b * 3], BP[b * 3 + 1], BP[b * 3 + 2], BP[c * 3], BP[c * 3 + 1], BP[c * 3 + 2]);
            tsrc.push(src[a], src[b], src[c]);
        }
        const eyes = L.built && L.built.parts.find(p => p.name === 'Eyes');
        if (eyes) for (let t = 0; t < eyes.index.length; t += 3) {
            for (let k = 0; k < 3; k++) { const v = eyes.index[t + k]; tri.push(eyes.positions[v * 3], eyes.positions[v * 3 + 1], eyes.positions[v * 3 + 2]); }
            tsrc.push(-1, -1, -1);
        }
        const angles = p => { const dx = p[0] - C[0], dy = p[1] - C[1], dz = p[2] - C[2]; return [Math.atan2(dx, dz), Math.atan2(dy, Math.hypot(dx, dz))]; };
        const bs = 0.035, nba = Math.ceil((A1 - A0) / bs) + 1, nbe = Math.ceil((E1 - E0) / bs) + 1;
        const bins = new Array(nba * nbe);
        const T = tri.length / 9;
        for (let t = 0; t < T; t++) {
            let amin = Infinity, amax = -Infinity, emin = Infinity, emax = -Infinity;
            for (let k = 0; k < 3; k++) {
                const [a, e] = angles([tri[t * 9 + k * 3], tri[t * 9 + k * 3 + 1], tri[t * 9 + k * 3 + 2]]);
                amin = Math.min(amin, a); amax = Math.max(amax, a); emin = Math.min(emin, e); emax = Math.max(emax, e);
            }
            if (amax - amin > 1.2 || amax < A0 || amin > A1) continue;
            const i0 = Math.max(0, Math.floor((amin - A0) / bs) - 1), i1 = Math.min(nba - 1, Math.floor((amax - A0) / bs) + 1);
            const j0 = Math.max(0, Math.floor((emin - E0) / bs) - 1), j1 = Math.min(nbe - 1, Math.floor((emax - E0) / bs) + 1);
            for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (bins[j * nba + i] || (bins[j * nba + i] = [])).push(t);
        }
        const R = new Float32Array(na * ne).fill(NaN), N = new Float32Array(na * ne * 3), SRC = new Int32Array(na * ne).fill(-1);
        const dirOf = (a, e) => [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
        for (let j = 0; j < ne; j++) for (let i = 0; i < na; i++) {
            const a = A0 + i * st, e = E0 + j * st, d = dirOf(a, e);
            const list = bins[Math.min(nbe - 1, Math.floor((e - E0) / bs)) * nba + Math.min(nba - 1, Math.floor((a - A0) / bs))];
            if (!list) continue;
            let best = -1, bt = 0, bu = 0, bv = 0;
            for (const t of list) {
                const o = t * 9;
                const e1 = [tri[o + 3] - tri[o], tri[o + 4] - tri[o + 1], tri[o + 5] - tri[o + 2]], e2 = [tri[o + 6] - tri[o], tri[o + 7] - tri[o + 1], tri[o + 8] - tri[o + 2]];
                const pv = cross(d, e2), det = dot(e1, pv);
                if (Math.abs(det) < 1e-14) continue;
                const tv = [C[0] - tri[o], C[1] - tri[o + 1], C[2] - tri[o + 2]], u = dot(tv, pv) / det;
                if (u < -1e-6 || u > 1 + 1e-6) continue;
                const qv = cross(tv, e1), v = dot(d, qv) / det;
                if (v < -1e-6 || u + v > 1 + 1e-6) continue;
                const dist = dot(e2, qv) / det;
                if (dist > bt) { bt = dist; best = t; bu = u; bv = v; }
            }
            if (best < 0) continue;
            const k = j * na + i, o = best * 9;
            R[k] = bt;
            let n = norm(cross([tri[o + 3] - tri[o], tri[o + 4] - tri[o + 1], tri[o + 5] - tri[o + 2]], [tri[o + 6] - tri[o], tri[o + 7] - tri[o + 1], tri[o + 8] - tri[o + 2]]));
            if (dot(n, d) < 0) n = mul(n, -1);
            N[k * 3] = n[0]; N[k * 3 + 1] = n[1]; N[k * 3 + 2] = n[2];
            const w = [1 - bu - bv, bu, bv], pick = w[0] >= w[1] && w[0] >= w[2] ? 0 : w[1] >= w[2] ? 1 : 2;
            SRC[k] = tsrc[best * 3 + pick];
        }
        // Holes (behind an ear, past the face's edge) filled in from their neighbors.
        for (let pass = 0; pass < 60; pass++) {
            let missing = 0;
            const next = Float32Array.from(R);
            for (let j = 0; j < ne; j++) for (let i = 0; i < na; i++) {
                const k = j * na + i;
                if (!Number.isNaN(R[k])) continue;
                let s = 0, c = 0, sk = -1;
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const ii = i + di, jj = j + dj;
                    if (ii < 0 || jj < 0 || ii >= na || jj >= ne) continue;
                    const q = jj * na + ii;
                    if (!Number.isNaN(R[q])) { s += R[q]; c++; if (sk < 0) sk = q; }
                }
                if (c) { next[k] = s / c; N[k * 3] = N[sk * 3]; N[k * 3 + 1] = N[sk * 3 + 1]; N[k * 3 + 2] = N[sk * 3 + 2]; SRC[k] = SRC[sk]; } else missing++;
            }
            R.set(next);
            if (!missing) break;
        }
        let mean = 0, count = 0;
        for (const r of R) if (!Number.isNaN(r)) { mean += r; count++; }
        mean = count ? mean / count : 0.09;
        for (let k = 0; k < R.length; k++) if (Number.isNaN(R[k])) R[k] = mean;
        const front = angles([0, L.eyeY, ringE.front]);
        const Rref = bilinear(R, na, ne, (front[0] - A0) / st, (front[1] - E0) / st) || 0.09;
        const F = { L, C, A0, E0, st, na, ne, R, N, SRC, Rref, dirOf, bases: new Map() };
        F.angles = angles;
        F.ae = (X, Y) => { const e = Y / Rref; return [X / (Rref * Math.max(0.2, Math.cos(e))), e]; };
        F.XY = p => { const [a, e] = angles(p); return [a * Rref * Math.cos(e), e * Rref]; };
        F.cell = (a, e) => [(a - A0) / st, (e - E0) / st];
        F.skinR = (X, Y) => { const [a, e] = F.ae(X, Y), [i, j] = F.cell(a, e); return bilinear(R, na, ne, i, j); };
        F.srcAt = (X, Y) => { const [a, e] = F.ae(X, Y), [i, j] = F.cell(a, e); return SRC[clamp(Math.round(j), 0, ne - 1) * na + clamp(Math.round(i), 0, na - 1)]; };
        F.srcOfPoint = p => { const [X, Y] = F.XY(p); return F.srcAt(X, Y); };
        /** A shell's base radius: the skin smoothed over by `blur` (meters), kept `clear` above it. */
        F.base = (clear, blur) => {
            const key = clear.toFixed(4) + ':' + blur.toFixed(4);
            if (F.bases.has(key)) return F.bases.get(key);
            const sigma = blur / (Rref * st);
            let B = R;
            if (sigma > 0.3) {
                B = gaussian(R, na, ne, sigma);
                for (let k = 0; k < B.length; k++) B[k] = Math.max(B[k], R[k] + clear);
                B = gaussian(B, na, ne, sigma * 0.35);
            }
            const out = new Float32Array(B.length);
            for (let k = 0; k < B.length; k++) out[k] = Math.max(B[k], R[k] + clear);
            F.bases.set(key, out);
            return out;
        };
        F.radius = (base, X, Y) => { const [a, e] = F.ae(X, Y), [i, j] = F.cell(a, e); return bilinear(base, na, ne, i, j); };
        F.point = (X, Y, r) => { const [a, e] = F.ae(X, Y); return add(C, mul(dirOf(a, e), r)); };
        /** The height in the world of a face line Y (in front of the face). */
        F.worldY = Y => C[1] + Math.sin(Y / Rref) * Rref * 1.05;
        F.on = (base, X, Y, off) => F.point(X, Y, F.radius(base, X, Y) + off);
        /** A frame on a shell: the point, its outward normal, and its X and Y directions. */
        F.frame = (base, X, Y, off = 0) => {
            const h = 0.0015, p = F.on(base, X, Y, off);
            const tx = norm(sub(F.on(base, X + h, Y, off), F.on(base, X - h, Y, off))), ty = norm(sub(F.on(base, X, Y + h, off), F.on(base, X, Y - h, off)));
            let n = norm(cross(tx, ty));
            if (dot(n, sub(p, C)) < 0) n = mul(n, -1);
            return { p, n, x: tx, y: norm(cross(n, tx)) };
        };
        // Landmarks in face meters.
        const eye = E => ({ c: F.XY(E.center), r: E.radius });
        const lips = lipCorners(L);
        const ear = side => { const E = side > 0 ? L.earL : L.earR; return E ? E.center : [side * ringE.rx, L.eyeY - 0.01, ringE.center[2]]; };
        const hinge = side => { const e = ear(side); return F.XY([e[0] * 0.92, e[1] - 0.012, e[2] + 0.018]); };
        const chinFront = (() => { let z = -Infinity; for (const v of L.headIds) if (Math.abs(S[v * 3]) < 0.012 && Math.abs(S[v * 3 + 1] - (L.chin + 0.012)) < 0.008) z = Math.max(z, S[v * 3 + 2]); return F.XY([0, L.chin + 0.012, Number.isFinite(z) ? z : L.mouth[2]]); })();
        F.mark = {
            eyeL: eye(L.eyeL), eyeR: eye(L.eyeR), mouth: F.XY(L.mouth), cornerL: F.XY(lips.left), cornerR: F.XY(lips.right),
            chin: chinFront, chinY: F.XY([0, L.chin, L.mouth[2]])[1], nose: F.XY(L.noseTip), brow: F.XY([0, L.brow, ringE.front]),
            earL: F.XY(ear(1)), earR: F.XY(ear(-1)), hingeL: hinge(1), hingeR: hinge(-1), crownY: F.XY([0, L.crown, ringE.center[2]])[1]
        };
        const m = F.mark;
        m.s = Math.abs(m.eyeL.c[0] - m.eyeR.c[0]) / 2;
        m.eyeY = (m.eyeL.c[1] + m.eyeR.c[1]) / 2;
        // How far the plates may reach to each side before the ears.
        m.side = Math.min(Math.abs(m.hingeL[0]), Math.abs(m.hingeR[0])) - 0.006;
        L._cyberField = F;
        fieldCache.set(key, F);
        if (fieldCache.size > 4) fieldCache.delete(fieldCache.keys().next().value);
        return F;
    }

    function bilinear(A, w, h, x, y) {
        x = clamp(x, 0, w - 1.001); y = clamp(y, 0, h - 1.001);
        const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, k = j * w + i;
        return (A[k] * (1 - fx) + A[k + 1] * fx) * (1 - fy) + (A[k + w] * (1 - fx) + A[k + w + 1] * fx) * fy;
    }

    function gaussian(A, w, h, sigma) {
        const r = Math.ceil(sigma * 2.5), kern = [];
        let sum = 0;
        for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); kern.push(v); sum += v; }
        for (let i = 0; i < kern.length; i++) kern[i] /= sum;
        const tmp = new Float32Array(A.length), out = new Float32Array(A.length);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0; for (let k = -r; k <= r; k++) s += A[j * w + clamp(i + k, 0, w - 1)] * kern[k + r]; tmp[j * w + i] = s; }
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[clamp(j + k, 0, h - 1) * w + i] * kern[k + r]; out[j * w + i] = s; }
        return out;
    }

    /** The mouth's corners on the face as shaped: the outermost points of the lips. */
    function lipCorners(L) {
        const pack = L.pack, S = L.P;
        if (!pack._cyberLips) {
            const up = Body.maskOf(pack, ['shape/upperLip-incr'], 2), low = Body.maskOf(pack, ['shape/lowerLip-incr'], 2);
            const ids = [];
            for (const v of pack._bodyIds || new Set(pack.body.source)) if (up[v] > 0.2 || low[v] > 0.2) ids.push(v);
            pack._cyberLips = ids;
        }
        let left = null, right = null;
        for (const v of pack._cyberLips) {
            const p = [S[v * 3], S[v * 3 + 1], S[v * 3 + 2]];
            if (Math.abs(p[1] - L.mouth[1]) > 0.03) continue;
            if (!left || p[0] > left[0]) left = p;
            if (!right || p[0] < right[0]) right = p;
        }
        const w = Math.abs(L.eyeL.center[0] - L.eyeR.center[0]) * 0.4;
        return { left: left || add(L.mouth, [w, 0, -0.01]), right: right || add(L.mouth, [-w, 0, -0.01]) };
    }

    // ── 2D shapes in face meters ──────────────────────────────────────────
    /** A closed Catmull-Rom curve through `pts`, `per` points a span. */
    function spline(pts, per = 8) {
        const out = [], n = pts.length;
        for (let i = 0; i < n; i++) {
            const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
            for (let k = 0; k < per; k++) {
                const t = k / per, t2 = t * t, t3 = t2 * t;
                out.push([0, 1].map(c => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
            }
        }
        return out;
    }

    /** Euclidean distance transform of a row (Felzenszwalb): squared distances in cells. */
    function edt1(f, n, d, v, z) {
        let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
        for (let q = 1; q < n; q++) {
            let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
            while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
            k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
        }
        k = 0;
        for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
    }
    function edt(mask, w, h) {
        const INF = 1e20, g = new Float64Array(w * h), n = Math.max(w, h);
        const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
        for (let k = 0; k < w * h; k++) g[k] = mask[k] ? 0 : INF;
        for (let i = 0; i < w; i++) { for (let j = 0; j < h; j++) f[j] = g[j * w + i]; edt1(f, h, d, v, z); for (let j = 0; j < h; j++) g[j * w + i] = d[j]; }
        for (let j = 0; j < h; j++) { for (let i = 0; i < w; i++) f[i] = g[j * w + i]; edt1(f, w, d, v, z); for (let i = 0; i < w; i++) g[j * w + i] = Math.sqrt(d[i]); }
        return g;
    }

    /** A polygon's signed distance (negative inside), from a raster of it: cheap to ask anywhere. */
    function polygon(pts, cell = 0.00035) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        const pad = 0.012; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
        const w = Math.ceil((x1 - x0) / cell) + 1, h = Math.ceil((y1 - y0) / cell) + 1;
        const inside = new Uint8Array(w * h), outside = new Uint8Array(w * h);
        for (let j = 0; j < h; j++) {
            const y = y0 + j * cell, xs = [];
            for (let i = 0, n = pts.length; i < n; i++) {
                const a = pts[i], b = pts[(i + 1) % n];
                if ((a[1] <= y) !== (b[1] <= y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
            }
            xs.sort((p, q) => p - q);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                const i0 = Math.max(0, Math.ceil((xs[k] - x0) / cell)), i1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) / cell));
                for (let i = i0; i <= i1; i++) inside[j * w + i] = 1;
            }
        }
        for (let k = 0; k < w * h; k++) outside[k] = inside[k] ? 0 : 1;
        const dIn = edt(inside, w, h), dOut = edt(outside, w, h), D = new Float32Array(w * h);
        for (let k = 0; k < w * h; k++) D[k] = inside[k] ? -(dOut[k] - 0.5) * cell : (dIn[k] - 0.5) * cell;
        return (x, y) => {
            const fx = (x - x0) / cell, fy = (y - y0) / cell;
            const cx = clamp(fx, 0, w - 1.001), cy = clamp(fy, 0, h - 1.001);
            const far = Math.hypot((fx - cx) * cell, (fy - cy) * cell);
            return bilinear(D, w, h, cx, cy) + far;
        };
    }

    const shape = {
        /** A smooth closed outline through control points (face meters). */
        outline: (pts, per = 8) => polygon(spline(pts, per)),
        /** The same, mirrored across the face's middle: control points for the character's left half, top to bottom. */
        mirrored: (half, per = 8) => polygon(spline(half.concat(half.slice().reverse().map(p => [-p[0], p[1]])).filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-6), per)),
        poly: pts => polygon(pts),
        circle: (c, r) => (x, y) => Math.hypot(x - c[0], y - c[1]) - r,
        ellipse: (c, rx, ry, ang = 0) => { const cs = Math.cos(ang), sn = Math.sin(ang); return (x, y) => { const dx = x - c[0], dy = y - c[1], u = dx * cs + dy * sn, v = -dx * sn + dy * cs, k = Math.hypot(u / rx, v / ry); return (k - 1) * Math.min(rx, ry) * (k > 1 ? 1 : 1); }; },
        capsule: (a, b, r) => (x, y) => { const pa = [x - a[0], y - a[1]], ba = [b[0] - a[0], b[1] - a[1]], h = clamp((pa[0] * ba[0] + pa[1] * ba[1]) / (ba[0] * ba[0] + ba[1] * ba[1] || 1), 0, 1); return Math.hypot(pa[0] - ba[0] * h, pa[1] - ba[1] * h) - r; },
        box: (c, hx, hy, r = 0, ang = 0) => { const cs = Math.cos(ang), sn = Math.sin(ang); return (x, y) => { const dx = x - c[0], dy = y - c[1], u = Math.abs(dx * cs + dy * sn) - hx + r, v = Math.abs(-dx * sn + dy * cs) - hy + r; return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - r; }; },
        /** Everything below (side -1) or above (+1) a curve through points sorted by X. */
        halfPlane: (pts, side) => (x, y) => {
            let k = 0;
            while (k < pts.length - 2 && x > pts[k + 1][0]) k++;
            const a = pts[k], b = pts[k + 1], t = clamp((x - a[0]) / ((b[0] - a[0]) || 1e-9), -2, 3), yy = a[1] + (b[1] - a[1]) * t;
            return side * (yy - y);
        },
        union: (...fs) => (x, y) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(x, y)); return d; },
        inter: (...fs) => (x, y) => { let d = -Infinity; for (const f of fs) d = Math.max(d, f(x, y)); return d; },
        sub: (a, ...bs) => (x, y) => { let d = a(x, y); for (const b of bs) d = Math.max(d, -b(x, y)); return d; },
        offset: (f, r) => (x, y) => f(x, y) - r,
        smoothUnion: (a, b, k) => (x, y) => { const da = a(x, y), db = b(x, y), h = clamp(0.5 + 0.5 * (db - da) / k, 0, 1); return mix(db, da, h) - k * h * (1 - h); },
        mirror: f => (x, y) => f(Math.abs(x), y)
    };

    // ── meshes with their own pictures and their own way of following the face ──
    /**
     * Follow modes per vertex (faceFollow.mode): 0 stays on its bone, 1 rides
     * the skin vertex under it (faceFollow.source, a pack vertex), 2 swings
     * with the jaw.
     */
    const RIGID = 0, SKIN = 1, JAW = 2;
    /** The swatch strip under each picture: flat finishes for the hardware (white; the vertex colors tint them). */
    const SWATCHES = ['chrome', 'steel', 'rubber', 'paint', 'glow', 'gloss', 'dark', 'brass'];
    const STRIP = 0.875;
    const swatchUV = name => [(SWATCHES.indexOf(name) + 0.5) / SWATCHES.length, (STRIP + 1) / 2];
    let MeshClass = null;
    function newMesh() {
        if (!MeshClass) {
            MeshClass = class CyberMesh extends Props().ExactMesh {
                constructor() { super(); this.uv = []; this.fm = []; this.fs = []; this.state = { uv: swatchUV('steel'), mode: RIGID, src: -1 }; }
                vertex(pos, nrm, rgb, skin) {
                    const k = super.vertex(pos, nrm, rgb, skin), s = this.state;
                    const uv = typeof s.uv === 'function' ? s.uv(pos) : s.uv;
                    this.uv.push(uv[0], uv[1]);
                    const mode = typeof s.mode === 'function' ? s.mode(pos) : s.mode;
                    this.fm.push(mode);
                    this.fs.push(mode === SKIN ? (typeof s.src === 'function' ? s.src(pos) : s.src) : -1);
                    return k;
                }
                /** Hardware in a finish of the strip: `fn` adds it. */
                with(finish, fn, mode) {
                    const keep = Object.assign({}, this.state);
                    this.state.uv = swatchUV(finish);
                    if (mode !== undefined) this.state.mode = mode;
                    fn(this);
                    this.state = keep;
                    return this;
                }
                part(name, extra) {
                    const p = super.part(name, extra);
                    p.uvs = Float32Array.from(this.uv);
                    // A skin follower with no skin under it stays put.
                    for (let i = 0; i < this.fm.length; i++) if (this.fm[i] === SKIN && this.fs[i] < 0) this.fm[i] = RIGID;
                    if (this.fm.some(v => v)) p.faceFollow = { mode: Uint8Array.from(this.fm), source: Int32Array.from(this.fs) };
                    return p;
                }
            };
        }
        return new MeshClass();
    }

    /** Merges `b` into `a` (both CyberMesh). */
    function absorb(a, b) {
        const base = a.p.length / 3;
        a.p.push(...b.p); a.n.push(...b.n); a.c.push(...b.c); a.j.push(...b.j); a.w.push(...b.w); a.uv.push(...b.uv); a.fm.push(...b.fm); a.fs.push(...b.fs);
        for (const x of b.i) a.i.push(x + base);
        if (b.keptNormals) for (const v of b.keptNormals) (a.keptNormals || (a.keptNormals = [])).push(v + base);
        return a;
    }

    // ── shells over the face ──────────────────────────────────────────────
    /**
     * A shell laid over the face inside the 2D shape `f` (negative inside):
     * a grid of face meters, its outside corners drawn onto the outline, so
     * the outline is smooth whatever the grid; lifted over the face as
     * smoothed (`clear` above the skin, `blur` meters of smoothing, `lift`
     * more), `thick` thick with `relief(X, Y, d)` more (d: the depth inside
     * the outline), and its rim chamfered and walled down into the skin, so
     * it reads as bolted or grown in. Options: bbox [x0, y0, x1, y1], cell,
     * clear, blur, lift, thick, round (a rolled edge this wide), chamfer,
     * sink (how far the wall goes below the skin), color(X, Y), mode(X, Y),
     * uv(X, Y), skin.
     */
    function shell(m, F, f, o) {
        const cell = o.cell || 0.0034, [x0, y0, x1, y1] = o.bbox;
        const nx = Math.ceil((x1 - x0) / cell) + 1, ny = Math.ceil((y1 - y0) / cell) + 1;
        const base = F.base(o.clear ?? 0.0012, o.blur ?? 0);
        const val = new Float32Array(nx * ny);
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[j * nx + i] = f(x0 + i * cell, y0 + j * cell);
        const grad = (x, y) => { const h = cell * 0.2, gx = (f(x + h, y) - f(x - h, y)) / (2 * h), gy = (f(x, y + h) - f(x, y - h)) / (2 * h), l = Math.hypot(gx, gy) || 1; return [gx / l, gy / l]; };
        const need = new Uint8Array(nx * ny);
        for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
            const k = j * nx + i;
            if (val[k] > 0 && val[k + 1] > 0 && val[k + nx] > 0 && val[k + nx + 1] > 0) continue;
            need[k] = need[k + 1] = need[k + nx] = need[k + nx + 1] = 1;
        }
        const node = new Int32Array(nx * ny).fill(-1), pts = [];
        for (let k = 0; k < nx * ny; k++) {
            if (!need[k]) continue;
            let X = x0 + (k % nx) * cell, Y = y0 + Math.floor(k / nx) * cell, d = -val[k], snapped = false;
            if (val[k] > 0) {
                for (let it = 0; it < 3; it++) { const v = f(X, Y), g = grad(X, Y); X -= g[0] * v; Y -= g[1] * v; }
                d = 0; snapped = true;
            }
            node[k] = pts.length; pts.push({ X, Y, d: Math.max(0, d), snapped });
        }
        const tris = [];
        for (let j = 0; j + 1 < ny; j++) for (let i = 0; i + 1 < nx; i++) {
            const k = j * nx + i, a = node[k], b = node[k + 1], c = node[k + nx], d = node[k + nx + 1];
            if (a < 0 || b < 0 || c < 0 || d < 0) continue;
            // The diagonal between the two deeper corners keeps the edge triangles whole.
            const t = val[k] + val[k + nx + 1] <= val[k + 1] + val[k + nx] ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]];
            for (const q of t) {
                const A = pts[q[0]], B = pts[q[1]], Cc = pts[q[2]];
                if (A.snapped && B.snapped && Cc.snapped) continue;
                const area = (B.X - A.X) * (Cc.Y - A.Y) - (Cc.X - A.X) * (B.Y - A.Y);
                if (Math.abs(area) < cell * cell * 0.004) continue;
                tris.push(area > 0 ? q : [q[0], q[2], q[1]]);
            }
        }
        const lift = typeof o.lift === 'function' ? o.lift : () => o.lift || 0;
        const thick = o.thick ?? 0.002, round = o.round || 0;
        const height = p => thick * (round ? 1 - (1 - Math.min(1, p.d / round)) ** 2 : 1) + (o.relief ? o.relief(p.X, p.Y, p.d) : 0);
        const color = o.color || (() => [1, 1, 1]);
        const uvOf = o.uv || (() => swatchUV('paint'));
        const modeOf = o.mode || (() => RIGID);
        const skin = o.skin;
        const put = (X, Y, r, rgb, mode, at) => {
            m.state.uv = at ? uvOf(at.X, at.Y) : uvOf(X, Y); m.state.mode = mode; m.state.src = mode === SKIN ? F.srcAt(at ? at.X : X, at ? at.Y : Y) : -1;
            return m.vertex(F.point(X, Y, r), [0, 0, 1], rgb, skin);
        };
        // Only the nodes a kept triangle uses.
        const used = new Map();
        for (const t of tris) for (const q of t) if (!used.has(q)) {
            const p = pts[q];
            p.r = F.radius(base, p.X, p.Y) + lift(p.X, p.Y);
            p.top = p.r + height(p);
            p.mode = modeOf(p.X, p.Y);
            p.rgb = color(p.X, p.Y);
            used.set(q, put(p.X, p.Y, p.top, p.rgb, p.mode));
        }
        for (const t of tris) m.tri(used.get(t[0]), used.get(t[1]), used.get(t[2]));
        // The rim: boundary edges (in one triangle only), each a chamfer and a wall into the skin.
        const edges = new Map();
        for (const t of tris) for (let e = 0; e < 3; e++) {
            const a = t[e], b = t[(e + 1) % 3], key = Math.min(a, b) + ':' + Math.max(a, b);
            const had = edges.get(key);
            if (had) had.n++; else edges.set(key, { a, b, n: 1 });
        }
        const chamfer = o.chamfer ?? Math.min(0.0009, thick * 0.45), sink = o.sink ?? 0.0006;
        // Where the chamfer runs: everywhere, or only along the outline `o.chamferOn` (not down the seams).
        const chamferAt = p => (!o.chamferOn || Math.abs(o.chamferOn(p.X, p.Y)) < 0.0008 ? chamfer : 0);
        const rim = new Map();
        const ringOf = q => {
            if (rim.has(q)) return rim.get(q);
            const p = pts[q], g = grad(p.X, p.Y), ch = chamferAt(p);
            const cx = p.X + g[0] * ch, cy = p.Y + g[1] * ch;
            const R = { p, ch, chamfer: [cx, cy, p.top - ch], bottom: [cx + g[0] * 0.0003, cy + g[1] * 0.0003, Math.min(p.top - ch - 0.0003, F.skinR(cx, cy) - sink)] };
            rim.set(q, R);
            return R;
        };
        for (const { a, b, n } of o.walls === false ? [] : edges.values()) {
            if (n !== 1) continue;
            const A = ringOf(a), B = ringOf(b);
            const band = (pa, pb, qa, qb) => {
                const i0 = put(pa[0], pa[1], pa[2], A.p.rgb, A.p.mode, A.p), i1 = put(pb[0], pb[1], pb[2], B.p.rgb, B.p.mode, B.p);
                const i2 = put(qb[0], qb[1], qb[2], B.p.rgb, B.p.mode, B.p), i3 = put(qa[0], qa[1], qa[2], A.p.rgb, A.p.mode, A.p);
                m.tri(i0, i3, i2); m.tri(i0, i2, i1);
            };
            const bevel = A.ch > 1e-5 && B.ch > 1e-5;
            if (bevel) band([A.p.X, A.p.Y, A.p.top], [B.p.X, B.p.Y, B.p.top], A.chamfer, B.chamfer);
            band(bevel ? A.chamfer : [A.p.X, A.p.Y, A.p.top], bevel ? B.chamfer : [B.p.X, B.p.Y, B.p.top], A.bottom, B.bottom);
        }
        m.state.mode = RIGID;
        return { pts, tris, base, cell };
    }

    /**
     * Plates cut from an outline by seams (distance functions to their
     * center lines) `gap` wide: f, the plates' shape; label(X, Y), which
     * plate a point is on (0 none); regions, each plate's id, area and
     * middle. Labeled on a fine raster by flood fill.
     */
    const platesCache = new Map();
    function plates(outline, cuts, gap, bbox, res = 0.0005, key) {
        if (key && platesCache.has(key)) return platesCache.get(key);
        const exact = (x, y) => { let d = Infinity; for (const c of cuts) d = Math.min(d, c(x, y)); return Math.max(outline(x, y), gap / 2 - d); };
        const [x0, y0, x1, y1] = bbox, w = Math.ceil((x1 - x0) / res) + 1, h = Math.ceil((y1 - y0) / res) + 1;
        const lab = new Int32Array(w * h), inside = new Uint8Array(w * h), D = new Float32Array(w * h);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const v = exact(x0 + i * res, y0 + j * res); D[j * w + i] = v; inside[j * w + i] = v <= 0 ? 1 : 0; }
        // Asked again and again (the grid, the pictures): from the raster.
        const f = (x, y) => { const fx = (x - x0) / res, fy = (y - y0) / res, cx = clamp(fx, 0, w - 1.001), cy = clamp(fy, 0, h - 1.001); return bilinear(D, w, h, cx, cy) + Math.hypot((fx - cx) * res, (fy - cy) * res); };
        const regions = [];
        const stack = [];
        for (let k = 0; k < w * h; k++) {
            if (!inside[k] || lab[k]) continue;
            const id = regions.length + 1;
            let n = 0, sx = 0, sy = 0, minY = Infinity, maxY = -Infinity;
            stack.push(k); lab[k] = id;
            while (stack.length) {
                const q = stack.pop(), i = q % w, j = (q - i) / w;
                n++; sx += x0 + i * res; sy += y0 + j * res; minY = Math.min(minY, y0 + j * res); maxY = Math.max(maxY, y0 + j * res);
                for (const nb of [i > 0 ? q - 1 : -1, i < w - 1 ? q + 1 : -1, j > 0 ? q - w : -1, j < h - 1 ? q + w : -1]) if (nb >= 0 && inside[nb] && !lab[nb]) { lab[nb] = id; stack.push(nb); }
            }
            regions.push({ id, area: n * res * res, c: [sx / n, sy / n], minY, maxY });
        }
        const label = (x, y) => {
            const i = Math.round((x - x0) / res), j = Math.round((y - y0) / res);
            for (let r = 0; r <= 6; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
                if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
                const ii = i + di, jj = j + dj;
                if (ii >= 0 && jj >= 0 && ii < w && jj < h && lab[jj * w + ii]) return lab[jj * w + ii];
            }
            return 0;
        };
        const out = { f, label, regions };
        if (key) { platesCache.set(key, out); if (platesCache.size > 24) platesCache.delete(platesCache.keys().next().value); }
        return out;
    }

    // ── hardware ──────────────────────────────────────────────────────────
    /** A local frame: point p, normal n, and x along the surface. */
    const frameAxes = (n, hint = [1, 0, 0]) => { let x = sub(hint, mul(n, dot(hint, n))); if (len(x) < 1e-4) x = Math.abs(n[1]) < 0.9 ? cross([0, 1, 0], n) : cross([1, 0, 0], n); x = norm(x); return { x, y: cross(n, x) }; };
    /** A cylinder from `a` toward `b` of radius r with `sides`, capped (a flat disk at each end). */
    function cylinder(m, a, b, r, sides, rgb, skin, r2) {
        sides = Math.min(sides, Math.max(8, Math.round(r * 2600)));
        const d = norm(sub(b, a)), { x, y } = frameAxes(d);
        m.loft(2, (i, t) => ({ center: lerp(a, b, t), x, y, rx: t ? (r2 ?? r) : r, ry: t ? (r2 ?? r) : r }), sides, rgb, skin, true);
    }
    /** A hex bolt head (or a round screw head) standing on a surface. */
    function bolt(m, p, n, r, rgb, skin, kind = 'hex', hint) {
        const { x, y } = frameAxes(n, hint), sides = kind === 'hex' ? 6 : 10, h = r * (kind === 'hex' ? 0.55 : 0.4);
        // The washer, then the head.
        m.loft(2, (i, t) => ({ center: add(p, mul(n, t * r * 0.18)), x, y, rx: r * 1.32, ry: r * 1.32 }), 8, rgb, skin, true);
        m.loft(2, (i, t) => ({ center: add(p, mul(n, r * 0.18 + t * h)), x, y, rx: r * (i ? 0.86 : 1), ry: r * (i ? 0.86 : 1) }), sides, rgb, skin, true);
    }
    /** A domed rivet. */
    function rivet(m, p, n, r, rgb, skin) {
        const { x, y } = frameAxes(n);
        m.loft(3, (i, t) => { const a = t * Math.PI / 2; return { center: add(p, mul(n, Math.sin(a) * r * 0.55)), x, y, rx: Math.max(r * 0.15, Math.cos(a) * r), ry: Math.max(r * 0.15, Math.cos(a) * r) }; }, 6, rgb, skin, true);
    }
    /** A hydraulic piston: a barrel from a, a chrome rod to b, an eye at each end. */
    function piston(m, a, b, r, colors, skin) {
        const d = sub(b, a), L = len(d), mid = lerp(a, b, 0.55);
        m.with('dark', q => cylinder(q, a, mid, r, 10, colors.barrel, skin));
        m.with('chrome', q => cylinder(q, lerp(a, b, 0.5), b, r * 0.5, 8, colors.rod, skin));
        m.with('dark', q => { cylinder(q, sub(mid, mul(norm(d), L * 0.03)), add(mid, mul(norm(d), L * 0.03)), r * 1.12, 10, colors.barrel, skin); });
        for (const e of [a, b]) m.with('steel', q => q.sphere(e, r * 1.05, colors.joint, skin, 4, 8));
    }
    /** A cable through points, eased into a smooth curve. */
    function cable(m, pts, r, rgb, skin, sides = 8, finish = 'rubber') {
        const smoothPts = [];
        for (let i = 0; i + 1 < pts.length; i++) {
            const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
            for (let k = 0; k < 6; k++) {
                const t = k / 6, t2 = t * t, t3 = t2 * t;
                smoothPts.push([0, 1, 2].map(c => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
            }
        }
        smoothPts.push(pts[pts.length - 1]);
        m.with(finish, q => q.tube(smoothPts, r, sides, rgb, skin, true));
    }
    /** A ring of tube (a bezel, a collar) round `c` in the plane of normal n. */
    function ring(m, c, n, r, tr, rgb, skin, sides = 24, tsides = 6) {
        sides = Math.min(sides, 20, Math.max(12, Math.round(r * 3200))); tsides = Math.min(tsides, 4);
        const { x, y } = frameAxes(n), pts = [];
        for (let k = 0; k <= sides; k++) { const a = k / sides * Math.PI * 2; pts.push(add(c, add(mul(x, Math.cos(a) * r), mul(y, Math.sin(a) * r)))); }
        m.loft(sides + 1, i => { const k = i % sides, p0 = pts[(k - 1 + sides) % sides], p2 = pts[(k + 1) % sides], d = norm(sub(p2, p0)), xx = norm(sub(pts[k], c)); return { center: pts[k], x: xx, y: cross(d, xx), rx: tr, ry: tr }; }, tsides, rgb, skin, false);
    }
    /** A lens dome (or disk) facing n. */
    function lensDome(m, c, n, r, bulge, rgb, skin, sides = 20, hint) {
        const { x, y } = frameAxes(n, hint);
        // A dome flatter than this welds into a sliver with no inside: keep the smallest a real dome, the large flat ones flat.
        bulge = Math.max(bulge, Math.min(r * 0.3, 0.0006));
        m.loft(4, (i, t) => { const a = t * Math.PI / 2; return { center: add(c, mul(n, Math.sin(a) * bulge)), x, y, rx: Math.max(r * 0.05, Math.cos(a) * r), ry: Math.max(r * 0.05, Math.cos(a) * r) }; }, Math.min(sides, 18), rgb, skin, true);
    }
    /** A rounded slab (a module, a filter body) on a frame. */
    function slab(m, c, axes, half, radius, rgb, skin, steps = 2) {
        const X = norm(axes[0]), Y0 = sub(axes[1], mul(X, dot(axes[1], X))), Y = len(Y0) > 1e-6 ? norm(Y0) : frameAxes(X).x;
        let Z = cross(X, Y);
        if (dot(Z, axes[2]) < 0) Z = mul(Z, -1);
        m.roundedBox(c, [X, Y, Z], half, radius, rgb, skin, steps);
    }

    // ── pictures ──────────────────────────────────────────────────────────
    const pictureCache = new Map();
    /**
     * The four pictures of a piece (color, relief, roughness and metal,
     * glow), painted from face meters: `paint(X, Y, out)` sets out.col
     * (linear rgb), rough, metal, glow (0..1) and h (relief, meters). The
     * bottom strip holds the hardware's swatches. Kept by `key`.
     */
    function bake(key, size, area, paint, style, textures) {
        let hit = pictureCache.get(key);
        if (!hit) {
            const W = size, Hh = size, plateRows = Math.round(Hh * STRIP);
            const albedo = new Uint8Array(W * Hh * 4), normal = new Uint8Array(W * Hh * 4), mr = new Uint8Array(W * Hh * 4), glow = new Uint8Array(W * Hh * 4);
            const height = new Float32Array(W * plateRows), out = { col: [1, 1, 1], rough: 0.5, metal: 0, glow: 0, h: 0 };
            const texel = area.span / W;
            for (let j = 0; j < plateRows; j++) for (let i = 0; i < W; i++) {
                const X = area.x0 + (i + 0.5) * texel, Y = area.y1 - (j + 0.5) * texel;
                out.col = [0.5, 0.5, 0.5]; out.rough = 0.5; out.metal = 0; out.glow = 0; out.h = 0;
                paint(X, Y, out);
                const k = (j * W + i) * 4;
                albedo[k] = toByte(out.col[0]); albedo[k + 1] = toByte(out.col[1]); albedo[k + 2] = toByte(out.col[2]); albedo[k + 3] = 255;
                mr[k] = 255; mr[k + 1] = clamp(Math.round(out.rough * 255), 8, 255); mr[k + 2] = clamp(Math.round(out.metal * 255), 0, 255); mr[k + 3] = 255;
                const gv = clamp(Math.round(out.glow * 255), 0, 255); glow[k] = glow[k + 1] = glow[k + 2] = gv; glow[k + 3] = 255;
                height[j * W + i] = out.h;
            }
            for (let j = 0; j < plateRows; j++) for (let i = 0; i < W; i++) {
                const hx = (height[j * W + Math.min(W - 1, i + 1)] - height[j * W + Math.max(0, i - 1)]) / (2 * texel);
                const hy = (height[Math.min(plateRows - 1, j + 1) * W + i] - height[Math.max(0, j - 1) * W + i]) / (2 * texel);
                const n = norm([-hx, hy, 1]), k = (j * W + i) * 4;
                normal[k] = Math.round(128 + n[0] * 127); normal[k + 1] = Math.round(128 + n[1] * 127); normal[k + 2] = Math.round(128 + n[2] * 127); normal[k + 3] = 255;
            }
            // The swatches: white, flat, each its own finish.
            const finishes = { chrome: [0.1, 1, 0], steel: [0.36, 1, 0], rubber: [0.82, 0, 0], paint: [style.rough, style.metal, 0], glow: [0.35, 0, 1], gloss: [0.14, 0, 0], dark: [0.42, 0.7, 0], brass: [0.3, 1, 0] };
            for (let j = plateRows; j < Hh; j++) for (let i = 0; i < W; i++) {
                const f = finishes[SWATCHES[Math.min(SWATCHES.length - 1, Math.floor(i / W * SWATCHES.length))]], k = (j * W + i) * 4;
                albedo[k] = albedo[k + 1] = albedo[k + 2] = 255; albedo[k + 3] = 255;
                normal[k] = 128; normal[k + 1] = 128; normal[k + 2] = 255; normal[k + 3] = 255;
                mr[k] = 255; mr[k + 1] = Math.round(f[0] * 255); mr[k + 2] = Math.round(f[1] * 255); mr[k + 3] = 255;
                glow[k] = glow[k + 1] = glow[k + 2] = Math.round(f[2] * 255); glow[k + 3] = 255;
            }
            const id = 'cyber-' + hashKey(key);
            hit = {
                albedo: { name: id + '-color.png', width: W, height: Hh, data: albedo },
                normal: { name: id + '-relief.png', width: W, height: Hh, data: normal },
                mr: { name: id + '-surface.png', width: W, height: Hh, data: mr },
                glow: { name: id + '-glow.png', width: W, height: Hh, data: glow }
            };
            pictureCache.set(key, hit);
            if (pictureCache.size > 40) pictureCache.delete(pictureCache.keys().next().value);
        }
        if (textures) for (const t of [hit.albedo, hit.normal, hit.mr, hit.glow]) textures[t.name] = t;
        return hit;
    }
    function hashKey(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

    /** A part's material from its pictures, glowing in the item's light. */
    function platingExtra(name, pics, pal, o, more = {}) {
        return Object.assign({ name, texture: pics.albedo.name, normalTexture: pics.normal.name, normalScale: 1, metallicRoughnessTexture: pics.mr.name,
            emissive: pal.glowHex, emissiveIntensity: glowOf(o), emissiveTexture: pics.glow.name, roughness: 1, metalness: 1, keepColors: true, ownSurface: true }, more);
    }
    const glowOf = o => clamp(o.glow ?? 0.8, 0, 1) * 1.6;
    /** Where a piece's picture covers: face meters → the picture's coordinates (above the strip). */
    function areaOf(bbox) {
        const [x0, y0, x1, y1] = bbox, span = Math.max(x1 - x0, (y1 - y0) / STRIP) * 1.0001;
        return { x0, y1, span, uv: (X, Y) => [clamp((X - x0) / span, 0, 1), clamp((y1 - Y) / span, 0, STRIP)] };
    }

    // ── painting a plate in its style ─────────────────────────────────────
    /** A stroke: distance from the line of a shape's outline, less half its width. */
    const stroke = (f, w) => (x, y) => Math.abs(f(x, y)) - w / 2;
    /** Distance to a polyline. */
    function polyline(pts) {
        return (x, y) => {
            let d = Infinity;
            for (let i = 0; i + 1 < pts.length; i++) {
                const a = pts[i], b = pts[i + 1], bx = b[0] - a[0], by = b[1] - a[1], h = clamp(((x - a[0]) * bx + (y - a[1]) * by) / (bx * bx + by * by || 1), 0, 1);
                d = Math.min(d, Math.hypot(x - a[0] - bx * h, y - a[1] - by * h));
            }
            return d;
        };
    }
    /**
     * Circuit traces: each cell of a grid joins its middle to the middles of
     * the sides a trace crosses (chosen per side), so the traces run on
     * across cells; a trace that ends ends in a pad. Distance to the nearest.
     */
    function circuit(x, y, cell, seed) {
        const i = Math.floor(x / cell), j = Math.floor(y / cell), cx = (i + 0.5) * cell, cy = (j + 0.5) * cell;
        const open = (a, b, c) => hash2(a * 1.31 + seed, b * 0.77 + c * 5.3 - seed) > 0.52;
        const sides = [[open(i, j, 1), [cell / 2, 0]], [open(i - 1, j, 1), [-cell / 2, 0]], [open(i, j, 2), [0, cell / 2]], [open(i, j - 1, 2), [0, -cell / 2]]];
        let d = Infinity, n = 0;
        for (const [on, o] of sides) if (on) { n++; const bx = o[0], by = o[1], h = clamp(((x - cx) * bx + (y - cy) * by) / (bx * bx + by * by), 0, 1); d = Math.min(d, Math.hypot(x - cx - bx * h, y - cy - by * h)); }
        const pad = n === 1 || (n > 0 && hash2(i + seed * 3, j) > 0.8);
        return { line: d, pad: pad ? Math.hypot(x - cx, y - cy) : Infinity };
    }
    /** A tiny stencil font (3×5) for unit codes. */
    const GLYPHS = { '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001011001111', '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
        A: '010101111101101', B: '110101110101110', C: '011100100100011', K: '101101110101101', R: '110101110101101', X: '101101010101101', V: '101101101101010', '-': '000000111000000', '/': '001001010100100' };
    function glyphInk(text, x, y, at, size) {
        // `at` the text's lower left; size a glyph's height. Stencil gaps between cells.
        const cw = size / 5, u = (x - at[0]) / cw, v = (y - at[1]) / cw;
        if (v < 0 || v >= 5 || u < 0) return 0;
        const k = Math.floor(u / 4), ch = text[k];
        if (!ch) return 0;
        const g = GLYPHS[ch]; if (!g) return 0;
        const cx = Math.floor(u - k * 4), cy = 4 - Math.floor(v);
        if (cx > 2) return 0;
        const fu = u - Math.floor(u), fv = v - Math.floor(v);
        return g[cy * 3 + cx] === '1' && fu > 0.06 && fu < 0.94 && fv > 0.06 && fv < 0.94 ? 1 : 0;
    }

    /**
     * The style painter. `layers` (top first) are the plates of a piece:
     * { f, col?, finish? ('plate', 'trim', 'inner', 'glass') }; `lines`
     * glowing strokes; `grooves` panel lines; `marks` extra paint
     * (X, Y, out) => void after the layers; `wear` 0..1.
     */
    function painter(o, pal, design) {
        const s = pal.s, style = inner(o.style), wear = clamp(o.wear ?? s.wear, 0, 1), seed = design.seed || 1;
        const steel = [0.56, 0.57, 0.58], rust = [0.2, 0.075, 0.03], soot = [0.03, 0.028, 0.025];
        // Salvaged plates are patched together from scrap: cells of mismatched paint.
        const patches = (s.patches || []).map(linear);
        const patchOf = (x, y) => {
            const q = 0.022, i = Math.floor(x / q), j = Math.floor(y / q);
            let best = Infinity, second = Infinity, id = 0;
            for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
                const ci = i + di, cj = j + dj, px = (ci + 0.2 + 0.6 * hash2(ci, cj + seed)) * q, py = (cj + 0.2 + 0.6 * hash2(ci + 9.1, cj - seed)) * q;
                const d = Math.hypot(x - px, y - py);
                if (d < best) { second = best; best = d; id = Math.floor(hash2(ci * 3.7, cj * 1.9 + seed) * 997); } else if (d < second) second = d;
            }
            return { id, edge: (second - best) / 2 };
        };
        return (X, Y, out) => {
            let layer = null, d = 0, near = Infinity, nearest = null;
            for (const l of design.layers) { const v = l.f(X, Y); if (v <= 0.0002) { layer = l; d = -v; break; } if (v < near) { near = v; nearest = l; } }
            if (!layer && near < 0.004) layer = nearest;
            if (!layer) { out.col = pal.inner; out.rough = 0.6; out.metal = 0.2; return; }
            const fin = layer.finish || 'plate';
            let col = (typeof layer.col === 'function' ? layer.col(X, Y) : layer.col) || (fin === 'trim' ? pal.trim : fin === 'inner' ? pal.inner : pal.plate), rough = fin === 'trim' ? s.trimRough : s.rough, metal = fin === 'trim' ? s.trimMetal : s.metal, h = 0, glow = 0;
            if (fin === 'inner') { rough = 0.55; metal = 0.3; }
            // Surface variation: ceramic stays even, paint mottles.
            const n1 = fbm(X * 160 + seed, Y * 160), n2 = noise(X * 900, Y * 900);
            if (style === 'chrome') { col = scaleRgb(col, 0.97 + 0.04 * n1); rough += (n2 - 0.5) * 0.04; }
            else if (style === 'military') { col = scaleRgb(col, 0.88 + 0.2 * n1); rough += (n1 - 0.5) * 0.12; h += (n2 - 0.5) * 0.000015; }
            else if (style === 'salvaged' && fin === 'plate' && layer.patchwork) {
                const p = patchOf(X, Y);
                col = mixRgb(patches.length ? patches[p.id % patches.length] : col, col, p.id % 3 === 0 ? 1 : 0.15);
                col = scaleRgb(col, 0.8 + 0.3 * n1);
                // Weld beads where the scraps meet.
                if (p.edge < 0.0012) { const bead = 1 - p.edge / 0.0012; h += 0.00035 * bead * (0.7 + 0.3 * noise(X * 2400, Y * 2400)); col = mixRgb(col, [0.12, 0.1, 0.09], 0.55 * bead); rough = 0.7; metal = 0.6; }
                // A rivet every few millimeters beside the weld.
                if (p.edge > 0.0016 && p.edge < 0.0032) { const along = fract((X * 1.3 + Y) / 0.006); if (Math.abs(along - 0.5) < 0.12) { h += 0.00025; metal = 0.8; col = mixRgb(col, steel, 0.6); } }
            }
            else if (style === 'glow') { col = scaleRgb(col, 0.92 + 0.12 * n1); const weave = (Math.sin((X + Y) * 5200) * Math.sin((X - Y) * 5200)); h += weave * 0.000008; }
            // Panel lines.
            for (const g of design.grooves || []) {
                const gd = Math.abs(g(X, Y));
                if (gd < 0.0006) { const k = 1 - gd / 0.0006; h -= 0.00028 * Math.sqrt(k); col = scaleRgb(col, 1 - 0.65 * k); rough = Math.min(1, rough + 0.2 * k); }
            }
            // Glowing lines sit in channels.
            for (const g of design.lines || []) {
                const gd = g(X, Y);
                if (gd < 0.0005) { const k = gd < 0 ? 1 : 1 - gd / 0.0005; glow = Math.max(glow, k * k); if (gd < 0) { col = mixRgb(col, pal.glow, 0.6); h -= 0.00012; rough = 0.25; metal = 0; } }
            }
            out.noWear = false;
            if (design.marks) { out.col = col; out.rough = rough; out.metal = metal; out.glow = glow; out.h = h; design.marks(X, Y, out, layer, d); ({ col, rough, metal, glow, h } = out); }
            // Edges: a rolled highlight on ceramic, chips through to steel on paint.
            const edgeK = 1 - smooth(0, 0.0012, d);
            if (style === 'chrome') col = mixRgb(col, [1, 1, 1], 0.06 * edgeK);
            if (wear > 0 && fin !== 'inner' && !out.noWear) {
                const chips = fbm(X * 420 + 3, Y * 420 - 5);
                if (edgeK > 0.05 && chips < 0.08 + 0.4 * wear * edgeK && style !== 'glow') { if (style === 'chrome') col = mixRgb(col, [0.55, 0.56, 0.58], 0.5); else { col = steel; metal = 0.9; rough = 0.35; } }
                // Scratches: thin random strokes.
                const sx = X * 700, sy = Y * 700, a = hash2(Math.floor(sx / 3), Math.floor(sy / 3)) * Math.PI, line = Math.abs(Math.sin(a) * (sx % 3) - Math.cos(a) * (sy % 3));
                if (line < 0.04 && hash2(Math.floor(sx / 3) + 5, Math.floor(sy / 3)) < wear * 0.25) { col = mixRgb(col, style === 'chrome' ? [0.6, 0.61, 0.63] : steel, 0.45); rough = Math.min(rough, 0.45); h -= 0.00002; }
                // Grime in the low places, rust where the salvage is worst.
                const grime = fbm(X * 90 - 7, Y * 90 + 2);
                col = mixRgb(col, soot, wear * 0.35 * smooth(0.45, 0.85, grime) * (style === 'chrome' ? 0.3 : 1));
                if (style === 'salvaged') { const r = fbm(X * 140 + 11, Y * 140), t0 = 0.8 - wear * 0.28; if (r > t0) { const k = smooth(t0, t0 + 0.12, r); col = mixRgb(col, rust, 0.85 * k); rough = mix(rough, 0.92, k); metal *= 1 - k; h += k * 0.00004 * noise(X * 3000, Y * 3000); } }
            }
            out.col = col; out.rough = clamp(rough, 0.05, 1); out.metal = clamp(metal, 0, 1); out.glow = glow; out.h = h;
        };
    }

    /** A design's key for the picture cache: the piece, its options and the face it was laid out on. */
    function designKey(id, o, F, extra = '') {
        const m = F.mark, r = v => Math.round(v * 2000);
        return [id, o.style, o.color, o.color2, (o.wear ?? '').toString(), o.shape || '', o.pattern || '', o.side || '', extra,
            r(m.s), r(m.eyeY), r(m.mouth[1]), r(m.chin[1]), r(m.brow[1]), r(m.nose[1]), r(m.side), r(m.cornerL[0])].join('|');
    }

    // ── the pieces ────────────────────────────────────────────────────────
    /** What every face piece starts from: the face field, its marks, the item's palette and the head's skin. */
    function context(L, o) {
        const F = headField(L), M = F.mark, pal = paletteOf(o), s = M.s;
        const P = Props();
        const eyeY = M.eyeY, mY = M.mouth[1];
        // Face lines in eye-spacing units: the brow, the hairline, the chin's front and underside.
        const marks = { E: eyeY, Mo: mY, Ch: M.chin[1], CB: M.chinY, Br: eyeY + 0.55 * s, HL: Math.min(eyeY + 2.15 * s, M.crownY - 1.15 * s), side: M.side, corner: Math.abs(M.cornerL[0] - M.cornerR[0]) / 2 };
        const geo = () => designKey(o.id, { style: o.style, shape: o.shape, pattern: o.pattern, side: o.side }, F);
        return { geo, F, M, s, pal, style: inner(o.style), head: P.rigid(L.boneIndex('Head')), P, mesh: newMesh(), wear: clamp(o.wear ?? pal.s.wear, 0, 1), k: marks, L, o };
    }
    const hw = (pal, k = 1) => scaleRgb(pal.trim, k);
    /** Points given in eye spacings (x, and y as an offset from a face line) to face meters, mirrored to side `sd`. */
    const pts = (s, list, sd = 1) => list.map(([x, y]) => [sd * x * s, y]);

    /**
     * A plated piece: plates cut from an outline by seams, over a dark
     * substructure that shows in the seams, laid on the face with pictures
     * painted in the item's style. `spec(C)` gives the design:
     *   id, name, bbox, outline, outer (outline before holes), cuts, gap,
     *   holes, base {clear, blur}, lift(X, Y), thick, under (0: none),
     *   cell, mode(X, Y, region), regionLift(region, X, Y), regionCol(region, X, Y),
     *   layers (more, under the plates), lines, grooves, marks, texSize, seed,
     *   hardware(K) — K: the context with P (the plates), at(X, Y, more) a frame
     *   on the plates' top, and on(at, finish, fn) to bolt hardware there.
     */
    function platedPiece(L, o, spec) {
        const C = context(L, o), { F, pal, mesh, head } = C;
        const sp = spec(C);
        const bbox = sp.bbox, area = areaOf(bbox), uv = area.uv;
        const P = sp.P || plates(sp.outline, sp.cuts || [], sp.gap ?? 0.0014, bbox, undefined, C.geo());
        const region = (X, Y) => P.label(X, Y);
        const modeAt = (X, Y) => (sp.mode ? sp.mode(X, Y, region(X, Y)) : RIGID);
        const liftAt = (X, Y) => (sp.lift ? sp.lift(X, Y) : 0);
        const regionLift = (X, Y) => (sp.regionLift ? sp.regionLift(region(X, Y), X, Y) : 0);
        const base = sp.base || { clear: 0.0015, blur: 0.006 }, thick = sp.thick ?? 0.002, under = sp.under ?? 0.0008;
        const outer = sp.outer || sp.outline;
        const layers = [{ f: P.f, col: sp.regionCol ? (X, Y) => sp.regionCol(region(X, Y), X, Y) : undefined }].concat(sp.layers || []);
        if (under) layers.push({ f: outer, finish: 'inner', col: C.style === 'glow' ? scaleRgb(pal.inner, 2) : pal.inner });
        const marks = (X, Y, out, layer, d) => {
            if (layer.finish === 'inner') {
                out.rough = 0.5; out.metal = 0.6;
                const c = circuit(X, Y, 0.0032, 5);
                if (c.line < 0.00022 || c.pad < 0.0004) { out.col = mixRgb(out.col, C.style === 'glow' ? pal.glow : [0.5, 0.42, 0.22], 0.6); out.glow = C.style === 'glow' ? 1 : C.style === 'chrome' ? 0.25 : 0; out.h += 0.00006; }
                if (C.style === 'glow') out.glow = Math.max(out.glow, 0.55);
            }
            if (C.style === 'chrome' && layer.f === P.f && d < 0.0007) { out.col = [0.82, 0.83, 0.85]; out.metal = 1; out.rough = 0.12; }
            if (sp.marks) sp.marks(X, Y, out, layer, d, region);
        };
        const design = { layers, lines: sp.lines || [], grooves: sp.grooves || [], marks, seed: sp.seed || 3 };
        const pics = bake(designKey(sp.id, o, F, sp.key || ''), sp.texSize || 512, area, painter(o, pal, design), pal.s, L.textures);
        const grow = Math.max(1, C.s / 0.0322);
        // A substructure that opens with the jaw comes in two pieces (`innerParts`), so none of it stretches across the seam.
        if (under) for (const f of sp.split ? [shape.inter(outer, (x, y) => sp.split(x, y) + 0.0004), shape.inter(outer, (x, y) => 0.0004 - sp.split(x, y))] : [outer]) shell(mesh, F, f, { bbox, ...base, lift: liftAt, thick: under, uv, skin: head, cell: (sp.innerCell || 0.006) * grow, walls: false, mode: modeAt });
        // Plates that move apart (`split`: positive on the side that swings with the jaw) are laid separately, so no
        // triangle of the grid bridges the seam between them.
        const plateParts = sp.split ? [(x, y) => Math.max(P.f(x, y), sp.split(x, y)), (x, y) => Math.max(P.f(x, y), -sp.split(x, y))] : [P.f];
        for (const f of plateParts) shell(mesh, F, f, { bbox, ...base, lift: (X, Y) => liftAt(X, Y) + under + regionLift(X, Y), thick, uv, skin: head, cell: (sp.cell || 0.0045) * grow, chamferOn: sp.outline, mode: modeAt, relief: sp.relief });
        const baseR = F.base(base.clear, base.blur);
        const at = (X, Y, more = 0) => {
            const fr = F.frame(baseR, X, Y, 0), top = liftAt(X, Y) + under + regionLift(X, Y) + thick + (sp.relief ? sp.relief(X, Y, 1) : 0) + more;
            return { p: add(fr.p, mul(fr.n, top)), n: fr.n, x: fr.x, y: fr.y, mode: modeAt(X, Y), src: F.srcAt(X, Y), X, Y };
        };
        const on = (spot, finish, fn) => { const keep = Object.assign({}, mesh.state); mesh.state.uv = swatchUV(finish); mesh.state.mode = spot.mode; mesh.state.src = spot.src; fn(mesh); mesh.state = keep; };
        if (sp.hardware) sp.hardware(Object.assign({}, C, { P, at, on, baseR, uv, bbox, base, thick, under, liftAt, modeAt, region }));
        mesh.computeNormals();
        const extras = [{ mesh, extra: platingExtra(sp.name, pics, pal, o) }];
        // An underlayer is a single open sheet (walls: false) welded under the plates: the piece shows from both
        // sides, as the Prop Builder shows it, and no part of it reads as a closed shell without an inside.
        if (under) extras[0].extra.doubleSided = true;
        if (sp.after) extras.push(...(sp.after(Object.assign({}, C, { P, at, baseR, bbox, base })) || []));
        return extras;
    }

    /** A set of bolts round a list of points (face meters) on a plated piece. */
    function boltRow(K, list, r = 0.0016, kind = 'hex') {
        const { pal, style, head } = K;
        for (const [x, y] of list) {
            if (K.P.f(x, y) > -0.0018) continue;
            const spot = K.at(x, y);
            K.on(spot, style === 'chrome' ? 'chrome' : style === 'salvaged' && (Math.round(x * 997) % 3 === 0) ? 'brass' : 'steel', q => {
                if (style === 'salvaged') rivet(q, spot.p, spot.n, r * 0.85, Math.round(x * 997) % 3 === 0 ? [0.8, 0.6, 0.3] : [0.68, 0.68, 0.7], head);
                else bolt(q, spot.p, spot.n, r, style === 'chrome' ? [0.92, 0.93, 0.95] : hw(pal, 1.25), head, style === 'chrome' ? 'round' : kind);
            });
        }
    }

    /** A plated piece's seams' own extras per style: chrome inlays, military panel lines, glowing seams. */
    function styleLines(style, P, extra = []) {
        const inset = (x, y) => P.f(x, y) + (style === 'chrome' ? 0.0016 : 0.003);
        const out = { lines: [], grooves: [] };
        if (style === 'military' || style === 'salvaged') out.grooves.push(inset);
        if (style === 'glow') out.lines.push(stroke((x, y) => P.f(x, y) + 0.0024, 0.0005));
        out.lines.push(...extra);
        return out;
    }

    /**
     * Full faceplate: hairline to chin, temple to temple, in plates over a
     * dark substructure that shows in the seams; the lower plate is cut along
     * the mouth and opens with the jaw. Each style covers the eyes its own
     * way: chrome with slit sensors, military with optics, salvaged with
     * mismatched lenses, glowing tech with one visor band.
     */
    function faceplate(_m, L, o) {
        return platedPiece(L, o, C => {
            const { s, pal, style, k } = C, { E, Mo, Ch, CB, Br, HL } = k, side = Math.min(3.0 * s, k.side - 0.15 * s);
            const outer = shape.mirrored([[0, HL], [1.1 * s, HL - 0.08 * s], [Math.min(2.1 * s, side), E + 1.35 * s], [Math.min(2.75 * s, side), E + 0.6 * s], [side, E - 0.2 * s], [side, Mo + 0.55 * s],
                [side * 0.92, Mo - 0.35 * s], [2.1 * s, Ch - 0.15 * s], [1.1 * s, CB + 0.35 * s], [0, CB + 0.12 * s]]);
            const eyeHoles = [], sensors = [];
            for (const sd of [1, -1]) {
                const Ey = sd > 0 ? C.M.eyeL : C.M.eyeR, ex = Ey.c[0], ey = Ey.c[1];
                const r = style === 'military' ? 0.45 * s : style === 'salvaged' ? (sd > 0 ? 0.52 : 0.34) * s : 0;
                if (style === 'chrome') eyeHoles.push(shape.capsule([ex - sd * 0.5 * s, ey - 0.02 * s], [ex + sd * 0.66 * s, ey + 0.13 * s], 0.13 * s));
                else if (r) eyeHoles.push(shape.circle([ex, ey], r));
                sensors.push({ ex, ey, r, sd });
            }
            if (style === 'glow') eyeHoles.push(shape.capsule([-1.5 * s, E + 0.03 * s], [1.5 * s, E + 0.03 * s], 0.2 * s));
            const holes = shape.union(...eyeHoles), outline = shape.sub(outer, holes);
            const jawPts = [[-4 * s, Mo + 1.0 * s], [-2.3 * s, Mo + 0.65 * s], [-0.95 * s, Mo + 0.03 * s], [0.95 * s, Mo + 0.03 * s], [2.3 * s, Mo + 0.65 * s], [4 * s, Mo + 1.0 * s]], below = shape.halfPlane(jawPts, 1);
            const cuts = [polyline([[-side - 0.01, Br + 0.05 * s], [-1.4 * s, Br + 0.42 * s], [0, Br + 0.52 * s], [1.4 * s, Br + 0.42 * s], [side + 0.01, Br + 0.05 * s]]), polyline(jawPts)];
            for (const sd of [1, -1]) {
                cuts.push(polyline(pts(s, [[0.22, Br + 0.52 * s], [0.19, HL + 0.02]], sd)));
                cuts.push(polyline(pts(s, [[0.42, E - 0.18 * s], [0.95, E - 0.55 * s], [1.75, E - 0.5 * s], [side / s + 0.3, E - 0.15 * s]], sd)));
                cuts.push(polyline(pts(s, [[0.34, Br + 0.5 * s], [0.42, E - 0.18 * s], [0.6, Mo + 0.6 * s], [0.95, Mo + 0.08 * s]], sd)));
                if (style !== 'chrome') cuts.push(polyline(pts(s, [[1.75, E - 0.5 * s], [2.0, Mo + 0.5 * s], [2.45, Mo - 0.1 * s]], sd)));
                if (style === 'military' || style === 'salvaged') cuts.push(polyline(pts(s, [[1.35, Br + 0.36 * s], [2.2, HL - 0.6 * s]], sd)));
            }
            const bbox = [-side - 0.012, CB - 0.01, side + 0.012, HL + 0.01];
            const P = plates(outline, cuts, style === 'military' ? 0.0017 : 0.0014, bbox, undefined, C.geo());
            const jawSet = new Set(P.regions.filter(r => r.c[1] < Mo - 0.05 * s).map(r => r.id));
            const centerSet = new Set(P.regions.filter(r => Math.abs(r.c[0]) < 0.32 * s && !jawSet.has(r.id)).map(r => r.id));
            const sideSet = new Set(P.regions.filter(r => Math.abs(r.c[0]) > 1.9 * s && r.c[1] < E).map(r => r.id));
            // The muzzle stands out over the lips, so the lips never meet it; the rim settles toward the skin.
            const muzzle = (X, Y) => 0.0058 * Math.exp(-((X / (1.15 * s)) ** 2) - (((Y - Mo) / (0.8 * s)) ** 2));
            const scraps = (pal.s.patches || []).map(linear);
            const { lines, grooves } = styleLines(style, P, style === 'chrome' ? [stroke((x, y) => (centerSet.has(P.label(x, y)) ? P.f(x, y) + 0.0016 : 1), 0.0004)] : []);
            const speaker = (x, y) => Math.abs(x) < 0.68 * s && Math.abs(y - Mo) < 0.36 * s && Math.abs(y - Mo) > 0.07 * s;
            return {
                P, split: below, id: 'faceplate', name: 'Cyber faceplate', bbox, outline, outer, cuts, cell: 0.0057, innerCell: 0.008, gap: style === 'military' ? 0.0017 : 0.0014,
                base: { clear: style === 'military' ? 0.0034 : 0.003, blur: 0.012 }, thick: style === 'military' ? 0.0024 : 0.0019,
                lift: (X, Y) => muzzle(X, Y) - 0.0012 * (1 - smooth(0, 0.01, -outer(X, Y))),
                regionLift: id => (centerSet.has(id) ? 0.0006 : sideSet.has(id) ? -0.0004 : 0),
                mode: (X, Y) => (below(X, Y) > 0 ? JAW : RIGID),
                regionCol: id => style === 'salvaged' ? (id % 4 === 1 ? pal.plate : scraps[(id * 7) % scraps.length]) : centerSet.has(id) ? (style === 'chrome' ? scaleRgb(pal.plate, 1.02) : style === 'glow' ? mixRgb(pal.plate, pal.trim, 0.5) : scaleRgb(pal.plate, 0.82)) : undefined,
                layers: [{ f: holes, finish: 'sensor' }], lines, grooves,
                marks: (X, Y, out, layer, d, region) => {
                    if (layer.finish === 'sensor') { const scan = 0.5 + 0.5 * Math.sin(Y * 9000); out.glow = 0.7 + 0.3 * scan; out.col = pal.glow; out.rough = 0.2; out.metal = 0; return; }
                    if (layer.finish === 'inner') return;
                    if (speaker(X, Y)) {
                        if (style === 'chrome') { const q = 0.0016, j = Math.round(Y / (q * 0.866)), i = Math.round(X / q - (j & 1) * 0.5), cx = (i + (j & 1) * 0.5) * q, cy = j * q * 0.866, r = Math.hypot(X - cx, Y - cy); if (r < 0.00048) { out.col = [0.02, 0.02, 0.025]; out.h -= 0.0004 * (1 - r / 0.00048); out.rough = 0.6; out.metal = 0; } }
                        else if (style === 'military' || style === 'salvaged') { const kk = Math.abs(fract((Y - Mo) / (0.105 * s)) - 0.5) * 0.105 * s; if (kk < 0.00065 && Math.abs(X) < 0.6 * s) { out.col = [0.03, 0.03, 0.03]; out.h -= 0.0005; out.rough = 0.8; } }
                        else if (style === 'glow' && Math.abs(Y - Mo) < 0.22 * s) { const cell = 0.0021, i = Math.floor(X / cell), u = fract(X / cell), lvl = 0.06 * s + 0.14 * s * hash2(i, 3); if (u > 0.15 && u < 0.85 && Math.abs(Y - Mo) < lvl) { out.glow = 1; out.col = pal.glow; } }
                    }
                    if (style === 'military' && !jawSet.has(region(X, Y))) { const ink = glyphInk('K7-0', X, Y, [0.55 * s, Br + 0.75 * s], 0.0052); if (ink) out.col = mixRgb(out.col, [0.66, 0.63, 0.52], 0.85); }
                    if (style === 'chrome') { const ink = glyphInk('0X-17', X, Y, [-1.9 * s, E - 0.42 * s], 0.0028); if (ink) out.col = mixRgb(out.col, [0.35, 0.37, 0.4], 0.8); }
                },
                hardware: K => {
                    const { mesh, F, head } = K;
                    if (style === 'chrome' || style === 'glow') shell(mesh, F, shape.offset(holes, 0.0012), { bbox, ...K.base, lift: -0.0004, thick: 0.0006, uv: K.uv, skin: head, chamfer: 0, cell: 0.0025 });
                    for (const e of sensors) {
                        if (style !== 'military' && style !== 'salvaged') continue;
                        const big = e.r + 0.0012, fr = F.frame(K.baseR, e.ex, e.ey, 0), top = K.under + K.thick + muzzle(e.ex, e.ey);
                        const c0 = add(fr.p, mul(fr.n, -0.001)), c1 = add(fr.p, mul(fr.n, top + 0.0035));
                        K.on({ mode: RIGID, src: -1 }, 'dark', q => cylinder(q, c0, c1, big, 20, hw(pal, 0.6), head));
                        K.on({ mode: RIGID, src: -1 }, 'steel', q => { cylinder(q, add(fr.p, mul(fr.n, top - 0.0004)), add(fr.p, mul(fr.n, top + 0.0012)), big + 0.0022, 20, hw(pal, 0.9), head, big + 0.0008); ring(q, c1, fr.n, big * 0.97, 0.0011, hw(pal, 1.1), head, 20, 4); });
                        K.on({ mode: RIGID, src: -1 }, 'gloss', q => lensDome(q, add(c1, mul(fr.n, -0.0012)), fr.n, big * 0.86, 0.0022, [0.02, 0.025, 0.03], head));
                        K.on({ mode: RIGID, src: -1 }, 'glow', q => lensDome(q, add(c1, mul(fr.n, 0.0004)), fr.n, big * 0.26, 0.0012, pal.glow, head, 12));
                        if (style === 'salvaged' && e.sd < 0) { const spot = K.at(e.ex - 0.55 * e.sd * s, e.ey + 0.5 * s); K.on(spot, 'glow', q => lensDome(q, spot.p, spot.n, 0.075 * s, 0.001, pal.glow, head, 10)); }
                    }
                    if (style === 'military') boltRow(K, [[0.62, Br + 0.85 * s], [2.45, E - 0.1 * s], [1.3, Mo + 0.38 * s], [0.9, Ch + 0.05 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]));
                    else if (style === 'chrome') boltRow(K, [[2.55, Br + 0.1 * s], [2.6, E - 0.35 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0013);
                    else if (style === 'salvaged') boltRow(K, P.regions.filter(r => r.area > 0.0002).flatMap(r => [0, 1].map(j => [r.c[0] + Math.cos(j * 3.1 + r.id) * 0.008, r.c[1] + Math.sin(j * 3.1 + r.id) * 0.008])).slice(0, 18), 0.0014);
                    // The jaw's hinge each side where the seam ends, and on armored styles a piston from cheek to jaw.
                    for (const sd of [1, -1]) {
                        const spot = K.at(sd * Math.min(2.7 * s, side - 0.008), Mo + 0.78 * s);
                        K.on(Object.assign({}, spot, { mode: RIGID }), style === 'chrome' ? 'chrome' : 'steel', q => { cylinder(q, add(spot.p, mul(spot.n, -0.0015)), add(spot.p, mul(spot.n, 0.0022)), 0.0045, 18, hw(pal, 1.05), head); ring(q, add(spot.p, mul(spot.n, 0.0022)), spot.n, 0.0031, 0.0007, hw(pal, 1.3), head, 16, 5); });
                        if (style === 'military' || style === 'salvaged') {
                            const a = K.at(sd * 2.05 * s, Mo + 1.15 * s, 0.0042).p, b = K.at(sd * 1.55 * s, Mo - 0.3 * s, 0.0042).p, before = mesh.p.length / 3;
                            piston(mesh, a, b, 0.0021, { barrel: hw(pal, 0.75), rod: [0.85, 0.86, 0.88], joint: hw(pal, 1) }, head);
                            for (let v = before; v < mesh.p.length / 3; v++) { const p = [mesh.p[v * 3], mesh.p[v * 3 + 1], mesh.p[v * 3 + 2]]; if (dot(sub(p, a), sub(b, a)) / dot(sub(b, a), sub(b, a)) > 0.52) mesh.fm[v] = JAW; }
                        }
                    }
                }
            };
        });
    }

    /**
     * Cyber jaw: the lower face replaced round the lips. The jaw plates
     * (chin and jawline) swing with the jaw; the cheek plates above them ride
     * the cheeks. A hinge at each jaw corner, with a tendon or a piston.
     */
    function cyberJaw(_m, L, o) {
        return platedPiece(L, o, C => {
            const { s, pal, style, k } = C, { E, Mo, Ch, CB } = k, side = Math.min(3.15 * s, k.side - 0.35 * s), cw = Math.max(0.55 * s, k.corner);
            const outer = shape.mirrored([[0, Mo + 0.15 * s], [cw + 0.3 * s, Mo + 0.45 * s], [2.0 * s, Mo + 0.95 * s], [side, Mo + 1.2 * s], [side, Mo + 0.4 * s],
                [side * 0.9, Mo - 0.45 * s], [2.2 * s, Ch - 0.35 * s], [1.15 * s, CB + 0.3 * s], [0, CB + 0.08 * s]]);
            const mouth = shape.ellipse([0, Mo - 0.06 * s], cw + 0.34 * s, 0.52 * s);
            const outline = shape.sub(outer, mouth);
            const cuts = [polyline([[0, Mo - 0.4 * s], [0, CB - 0.02]])];
            for (const sd of [1, -1]) {
                cuts.push(polyline(pts(s, [[cw / s + 0.2, Mo - 0.02 * s], [2.0, Mo + 0.55 * s], [side / s + 0.3, Mo + 0.95 * s]], sd)));
                cuts.push(polyline(pts(s, [[2.15, Mo + 0.6 * s], [2.3, Ch - 0.25 * s], [2.0, CB - 0.01]], sd)));
                if (style === 'military' || style === 'salvaged') cuts.push(polyline(pts(s, [[1.05, Mo - 0.35 * s], [1.25, CB - 0.01]], sd)));
            }
            const bbox = [-side - 0.012, CB - 0.01, side + 0.012, Mo + 1.35 * s + 0.01];
            const P = plates(outline, cuts, 0.0014, bbox, undefined, C.geo());
            const cheekSet = new Set(P.regions.filter(r => r.c[1] > Mo + 0.25 * s).map(r => r.id));
            const jawLine = shape.halfPlane([[0, Mo - 0.02 * s], [cw + 0.2 * s, Mo - 0.02 * s], [2.0 * s, Mo + 0.55 * s], [side + 0.3 * s, Mo + 0.95 * s], [side + 2 * s, Mo + 1.6 * s]], 1), jawSide = (x, y) => jawLine(Math.abs(x), y);
            const scraps = (pal.s.patches || []).map(linear);
            const { lines, grooves } = styleLines(style, P, style === 'chrome' ? [stroke(shape.offset(mouth, 0.0035), 0.0005)] : []);
            return {
                P, split: jawSide, id: 'jaw', name: 'Cyber jaw', bbox, outline, cuts, base: { clear: 0.0013, blur: 0.006 }, thick: style === 'military' ? 0.0024 : 0.002, under: 0.0007,
                lift: (X, Y) => 0.0012 * smooth(0.002, 0.012, -outer(X, Y)),
                mode: (X, Y) => (jawSide(X, Y) > 0 ? JAW : SKIN),
                regionCol: id => style === 'salvaged' ? (id % 3 === 1 ? pal.plate : scraps[(id * 5) % scraps.length]) : cheekSet.has(id) && style !== 'chrome' ? scaleRgb(pal.plate, 0.85) : undefined,
                lines, grooves,
                marks: (X, Y, out, layer) => {
                    if (layer.finish === 'inner') return;
                    // Fine vertical ribs along the chin.
                    if (style !== 'glow' && Math.abs(X) < 0.9 * s && Y < Mo - 0.75 * s && Y > CB + 0.35 * s) { const r = Math.abs(fract(X / 0.0024) - 0.5); if (r < 0.12) { out.h -= 0.00022; out.col = scaleRgb(out.col, 0.7); } }
                    if (style === 'military') { const ink = glyphInk('V-2', X, Y, [-2.0 * s, Mo - 0.3 * s], 0.0042); if (ink) out.col = mixRgb(out.col, [0.66, 0.63, 0.52], 0.85); }
                },
                hardware: K => {
                    const { mesh, head } = K;
                    for (const sd of [1, -1]) {
                        const hx = sd * Math.min(2.95 * s, side - 0.007), spot = K.at(hx, Mo + 0.88 * s);
                        K.on(Object.assign({}, spot, { mode: RIGID }), style === 'chrome' ? 'chrome' : 'steel', q => {
                            cylinder(q, add(spot.p, mul(spot.n, -0.0015)), add(spot.p, mul(spot.n, 0.0026)), 0.0058, 20, hw(pal, 1.0), head);
                            ring(q, add(spot.p, mul(spot.n, 0.0026)), spot.n, 0.0042, 0.0008, hw(pal, 1.3), head, 18, 5);
                        });
                        K.on(Object.assign({}, spot, { mode: RIGID }), 'glow', q => lensDome(q, add(spot.p, mul(spot.n, 0.0027)), spot.n, 0.0018, 0.0008, pal.glow, head, 10));
                        if (style === 'military' || style === 'salvaged') {
                            const a = K.at(sd * 2.25 * s, Mo + 1.0 * s, 0.0035).p, b = K.at(sd * 1.75 * s, Mo - 0.45 * s, 0.0035).p, before = mesh.p.length / 3;
                            piston(mesh, a, b, 0.0019, { barrel: hw(pal, 0.75), rod: [0.85, 0.86, 0.88], joint: hw(pal, 1) }, head);
                            for (let v = before; v < mesh.p.length / 3; v++) { const p = [mesh.p[v * 3], mesh.p[v * 3 + 1], mesh.p[v * 3 + 2]]; mesh.fm[v] = dot(sub(p, a), sub(b, a)) / dot(sub(b, a), sub(b, a)) > 0.52 ? JAW : SKIN; mesh.fs[v] = K.F.srcAt(sd * 2.25 * s, Mo + 1.0 * s); }
                        } else {
                            // Tendons: three cables from the cheek plate down into the jaw.
                            for (let j = 0; j < 3; j++) {
                                const a = K.at(sd * (2.45 - j * 0.12) * s, Mo + (1.05 - j * 0.06) * s, 0.0008), b = K.at(sd * (2.05 - j * 0.18) * s, Mo - (0.25 + j * 0.08) * s, 0.0008);
                                const before = mesh.p.length / 3;
                                cable(mesh, [a.p, add(lerp(a.p, b.p, 0.5), mul(a.n, 0.0016)), b.p], 0.0009, style === 'glow' ? pal.glow : [0.75, 0.76, 0.78], head, 6, style === 'glow' ? 'glow' : 'chrome');
                                for (let v = before; v < mesh.p.length / 3; v++) { const p = [mesh.p[v * 3], mesh.p[v * 3 + 1], mesh.p[v * 3 + 2]]; const t = dot(sub(p, a.p), sub(b.p, a.p)) / dot(sub(b.p, a.p), sub(b.p, a.p)); mesh.fm[v] = t > 0.5 ? JAW : SKIN; mesh.fs[v] = a.src; }
                            }
                        }
                    }
                    if (style === 'military') boltRow(K, [[1.6, Mo - 0.5 * s], [2.6, Mo + 0.1 * s], [0.55, CB + 0.55 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0014);
                    if (style === 'salvaged') boltRow(K, P.regions.filter(r => r.area > 0.00012).map(r => [r.c[0], r.c[1]]), 0.0013);
                    if (style === 'chrome') boltRow(K, [[1.95, Mo + 0.75 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0011);
                }
            };
        });
    }

    /**
     * Half-face plate: round one eye, from the brow over the temple to the
     * cheekbone; the eye itself left free in an orbital ring. Rides the skin.
     */
    function halfFace(_m, L, o) {
        return platedPiece(L, o, C => {
            const { s, pal, style, k, M } = C, { E, Mo, Br } = k, sd = o.side === 'right' ? -1 : 1, side = Math.min(3.25 * s, k.side - 0.1 * s);
            const Ey = sd > 0 ? M.eyeL : M.eyeR, ex = Ey.c[0], ey = Ey.c[1];
            const outer = shape.outline(pts(s, [[0.22, E + 1.55 * s], [1.3, E + 1.85 * s], [2.45, E + 1.45 * s], [side / s, E + 0.55 * s], [side / s, E - 0.45 * s], [2.6, Mo + 0.55 * s], [1.6, Mo + 0.75 * s], [0.95, E - 0.95 * s], [0.5, E - 0.4 * s], [0.25, E + 0.45 * s]], sd), 8);
            const eyeHole = shape.ellipse([ex + sd * 0.04 * s, ey + 0.02 * s], 0.78 * s, 0.6 * s);
            const outline = shape.sub(outer, eyeHole);
            const ringCut = (x, y) => Math.abs(eyeHole(x, y) - 0.36 * s);
            const cuts = [ringCut];
            for (const a of [0.5, 1.6, 2.6, 3.7, 4.9]) {
                const ca = Math.cos(a), sa = Math.sin(a);
                cuts.push(polyline([[ex + sd * ca * 1.15 * s, ey + sa * 0.95 * s], [ex + sd * ca * 3.2 * s, ey + sa * 2.6 * s]]));
            }
            const bbox = [Math.min(sd * 0.1 * s, sd * (side + 0.012)), Mo + 0.6 * s, Math.max(sd * 0.1 * s, sd * (side + 0.012)), E + 1.95 * s + 0.01];
            const P = plates(outline, cuts, 0.0013, bbox, undefined, C.geo());
            const ringId = P.label(ex + sd * 0.95 * s, ey);
            const scraps = (pal.s.patches || []).map(linear);
            const { lines, grooves } = styleLines(style, P, style === 'chrome' || style === 'glow' ? [stroke(shape.offset(eyeHole, 0.0028), 0.0005)] : []);
            return {
                P, id: 'halfFace', name: 'Cyber half-face', key: String(sd), bbox, outline, cuts, base: { clear: 0.0012, blur: 0.006 }, thick: 0.0019, under: 0.0006,
                lift: (X, Y) => 0.001 * smooth(0.002, 0.012, -outer(X, Y)),
                regionLift: id => (id === ringId ? 0.0008 : 0),
                mode: (X, Y) => (Y > E + 0.9 * s ? RIGID : SKIN),
                regionCol: id => style === 'salvaged' ? (id % 3 === 0 ? pal.plate : scraps[(id * 3) % scraps.length]) : id === ringId ? (style === 'chrome' ? [0.8, 0.81, 0.83] : style === 'glow' ? pal.trim : scaleRgb(pal.plate, 0.8)) : undefined,
                lines, grooves,
                marks: (X, Y, out, layer, d, region) => {
                    if (region(X, Y) === ringId && style === 'chrome') { out.metal = 1; out.rough = 0.14; }
                    if (style === 'military') { const ink = glyphInk('07', X, Y, [ex + sd * 1.5 * s - 0.004, E + 1.1 * s], 0.004); if (ink) out.col = mixRgb(out.col, [0.66, 0.63, 0.52], 0.85); }
                },
                hardware: K => {
                    const { head } = K;
                    // Lights round the orbit.
                    for (let j = 0; j < 6; j++) {
                        const a = -0.9 + j * 0.36, x = ex + sd * Math.cos(a) * 1.0 * s, y = ey + Math.sin(a) * 0.8 * s;
                        if (K.P.f(x, y) > -0.001) continue;
                        const spot = K.at(x, y);
                        K.on(spot, 'glow', q => lensDome(q, spot.p, spot.n, 0.0011, 0.0006, pal.glow, head, 8));
                    }
                    if (style === 'military') boltRow(K, [[1.6, E + 1.45 * s], [2.6, E + 0.9 * s], [2.85, E - 0.5 * s], [1.9, Mo + 0.85 * s]].map(([x, y]) => [sd * x * s, y]), 0.0015);
                    else if (style === 'salvaged') boltRow(K, K.P.regions.filter(r => r.area > 0.0001).map(r => [r.c[0], r.c[1]]), 0.0013);
                    else boltRow(K, [[2.75, E + 0.3 * s], [1.0, E + 1.5 * s]].map(([x, y]) => [sd * x * s, y]), 0.0012);
                    // A sensor fin at the temple.
                    const t = K.at(sd * 2.85 * s, E + 0.6 * s);
                    K.on(t, style === 'chrome' ? 'chrome' : 'dark', q => slab(q, add(t.p, mul(t.n, 0.002)), [t.y, t.n, cross(t.y, t.n)].map(norm), [0.0012, 0.0022, 0.0075], 0.0009, hw(pal, 0.9), head));
                    K.on(t, 'glow', q => slab(q, add(t.p, mul(t.n, 0.0043)), [t.y, t.n, cross(t.y, t.n)].map(norm), [0.0005, 0.0004, 0.006], 0.0003, pal.glow, head, 1));
                }
            };
        });
    }

    /**
     * Brow plate: an armored band across the forehead above the brows, a
     * sensor set in its middle; it rides the forehead as it moves.
     */
    function browPlate(_m, L, o) {
        return platedPiece(L, o, C => {
            const { s, pal, style, k } = C, { E, Br } = k, side = Math.min(3.0 * s, k.side - 0.2 * s);
            const outer = shape.mirrored([[0, Br + 0.8 * s], [1.3 * s, Br + 0.68 * s], [2.4 * s, Br + 0.25 * s], [side, E + 0.05 * s], [side - 0.25 * s, E - 0.15 * s], [1.9 * s, Br - 0.2 * s], [0.9 * s, Br - 0.12 * s], [0, Br - 0.1 * s]]);
            const node = shape.ellipse([0, Br + 0.33 * s], 0.22 * s, 0.22 * s);
            const outline = shape.sub(outer, node);
            const cuts = [stroke(shape.offset(node, 0.32 * s), 0)];
            const ribs = style === 'military' ? [1.2, 1.75, 2.3] : style === 'salvaged' ? [0.95, 1.9] : [1.5];
            for (const sd of [1, -1]) for (const x of ribs) cuts.push(polyline([[sd * x * s, Br - 0.4 * s], [sd * (x + 0.12) * s, Br + 1.3 * s]]));
            const bbox = [-side - 0.012, E - 0.3 * s, side + 0.012, Br + 1.15 * s + 0.01];
            const P = plates(outline, cuts, 0.0013, bbox, undefined, C.geo());
            const midId = P.label(0, Br + 0.33 * s + 0.36 * s);
            const scraps = (pal.s.patches || []).map(linear);
            const { lines, grooves } = styleLines(style, P, style !== 'military' ? [stroke((x, y) => outer(x, y) + 0.0028, 0.0005)] : []);
            return {
                P, id: 'brow', name: 'Cyber brow plate', bbox, outline, outer, cuts, base: { clear: 0.0012, blur: 0.008 }, thick: style === 'military' ? 0.0026 : 0.002, under: 0.0006,
                lift: (X, Y) => 0.0011 * smooth(0.002, 0.01, -outer(X, Y)) + 0.0012 * Math.exp(-(((Y - Br - 0.15 * s) / (0.4 * s)) ** 2)),
                regionLift: id => (id === midId ? 0.0006 : 0),
                mode: () => SKIN, lines, grooves,
                regionCol: id => style === 'salvaged' ? scraps[(id * 3) % scraps.length] : id === midId && style !== 'glow' ? scaleRgb(pal.plate, style === 'chrome' ? 1 : 0.8) : undefined,
                layers: [{ f: node, finish: 'sensor' }],
                marks: (X, Y, out, layer) => { if (layer.finish === 'sensor') { out.col = [0.02, 0.02, 0.025]; out.rough = 0.08; out.metal = 0; } },
                hardware: K => {
                    const { head } = K, spot = K.at(0, Br + 0.33 * s, -0.0008);
                    K.on(spot, 'dark', q => cylinder(q, add(spot.p, mul(spot.n, -0.002)), add(spot.p, mul(spot.n, 0.0015)), 0.25 * s, 20, hw(pal, 0.7), head));
                    K.on(spot, 'gloss', q => lensDome(q, add(spot.p, mul(spot.n, 0.001)), spot.n, 0.21 * s, 0.002, [0.02, 0.02, 0.03], head));
                    K.on(spot, 'glow', q => lensDome(q, add(spot.p, mul(spot.n, 0.0024)), spot.n, 0.07 * s, 0.0009, pal.glow, head, 12));
                    if (style === 'military') boltRow(K, [[0.85, Br + 0.85 * s], [2.05, Br + 0.55 * s], [2.6, E + 0.25 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0014);
                    else if (style === 'salvaged') boltRow(K, K.P.regions.map(r => [r.c[0], r.c[1]]), 0.0013);
                    else boltRow(K, [[2.6, E + 0.3 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0011);
                }
            };
        });
    }

    /**
     * A strap round the back of the head from one side's `front` angle (from
     * straight ahead) to the other's, at heights y(t) (t 0 at the front ends,
     * 1 at the back), over the hair where there is hair.
     */
    function strap(m, L, y, front, width, thick, rgb, skin, finish = 'rubber') {
        const pts = [], N = 28;
        for (let i = 0; i <= N; i++) {
            const t = i / N, ang = front + t * (Math.PI * 2 - 2 * front), back = 1 - Math.abs(t - 0.5) * 2;
            pts.push(aroundHead(L, y(back), ang, thick * 0.7));
        }
        const R0 = L.ring(L.eyeY);
        m.with(finish, q => q.loft(pts.length, i => {
            const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], d = norm(sub(b, a)), out = norm([pts[i][0] - R0.center[0], 0, pts[i][2] - R0.center[2]]);
            return { center: pts[i], x: norm(cross(out, d)), y: out, rx: width / 2, ry: thick / 2 };
        }, 6, rgb, skin, true));
        return pts;
    }

    /**
     * Cyber respirator: a molded seal over nose and mouth that rides the face,
     * a rigid front module with a vent and a light strip, filters at the
     * cheeks, straps round the head. Each style its own filters.
     */
    function respirator(_m, L, o) {
        return platedPiece(L, o, C => {
            const { s, pal, style, k } = C, { E, Mo, Ch, CB } = k, side = Math.min(2.85 * s, k.side - 0.2 * s);
            const outer = shape.mirrored([[0, E - 0.38 * s], [0.75 * s, E - 0.48 * s], [1.6 * s, E - 0.8 * s], [Math.min(2.45 * s, side), Mo + 0.95 * s], [side, Mo + 0.25 * s],
                [side * 0.93, Mo - 0.55 * s], [1.85 * s, Ch - 0.35 * s], [0.9 * s, CB + 0.32 * s], [0, CB + 0.1 * s]]);
            const moduleF = shape.box([0, Mo + 0.05 * s], 0.85 * s, 0.85 * s, 0.4 * s);
            const cuts = [stroke(moduleF, 0)];
            if (style !== 'chrome') for (const sd of [1, -1]) cuts.push(polyline(pts(s, [[1.35, E - 0.4 * s], [1.75, Mo - 0.2 * s], [1.3, CB]], sd)));
            const bbox = [-side - 0.012, CB - 0.01, side + 0.012, E - 0.25 * s + 0.01];
            const P = plates(outer, cuts, 0.0013, bbox, undefined, C.geo());
            const modId = P.label(0, Mo + 0.05 * s);
            const snout = (X, Y) => 0.0105 * Math.exp(-((X / (1.25 * s)) ** 2) - (((Y - (Mo + 0.25 * s)) / (1.05 * s)) ** 2));
            const rubber = style === 'chrome' ? pal.plate : style === 'salvaged' ? [0.09, 0.075, 0.06] : mixRgb(pal.inner, pal.plate, 0.18);
            const { lines, grooves } = styleLines(style, P);
            return {
                P, id: 'respirator', name: 'Cyber respirator', bbox, outline: outer, cuts, base: { clear: 0.0016, blur: 0.01 }, thick: 0.0024, under: 0.0006,
                lift: (X, Y) => snout(X, Y) * smooth(0, 0.012, -outer(X, Y)),
                regionLift: id => (id === modId ? 0.0012 : 0),
                mode: (X, Y, id) => (id === modId ? RIGID : SKIN),
                regionCol: id => (id === modId ? (style === 'salvaged' ? linear('#7f8a82') : undefined) : rubber),
                lines, grooves,
                marks: (X, Y, out, layer, d, region) => {
                    if (layer.finish === 'inner') return;
                    if (region(X, Y) !== modId) {
                        // Molded rubber: a fine grain, soft and matte; salvaged has a stitched leather patch.
                        out.rough = style === 'chrome' ? 0.45 : 0.78; out.metal = 0; out.h += (noise(X * 4000, Y * 4000) - 0.5) * 0.00002;
                        if (style === 'salvaged') { const st = Math.abs(P.f(X, Y) + 0.002); if (st < 0.0003 && fract((X + Y) / 0.0022) < 0.5) { out.col = [0.6, 0.55, 0.42]; out.h += 0.00008; } }
                    } else {
                        // The vent: horizontal louvers under the light strip.
                        if (Math.abs(X) < 0.62 * s && Y < Mo + 0.35 * s && Y > Mo - 0.6 * s) { const v = Math.abs(fract((Y - Mo) / (0.13 * s)) - 0.5); if (v < 0.18) { out.col = [0.02, 0.02, 0.02]; out.h -= 0.0006; out.rough = 0.8; } }
                        if (Math.abs(X) < 0.6 * s && Math.abs(Y - (Mo + 0.55 * s)) < 0.045 * s) { out.glow = 1; out.col = pal.glow; }
                        if (style === 'military') { const ink = glyphInk('R4', X, Y, [0.25 * s, Mo - 0.78 * s], 0.003); if (ink) out.col = mixRgb(out.col, [0.7, 0.67, 0.55], 0.85); }
                    }
                },
                hardware: K => {
                    const { mesh, head, F } = K;
                    for (const sd of [1, -1]) {
                        const spot = K.at(sd * 1.62 * s, Mo + 0.2 * s), down = norm(sub(spot.n, [0, 0.35, 0])), axis = norm(add(mul(down, 0.85), mul([sd, 0, 0], 0.3)));
                        const big = style === 'salvaged' ? (sd > 0 ? 0.58 : 0.44) * s : 0.52 * s, length = style === 'salvaged' ? (sd > 0 ? 0.75 : 0.55) * s : 0.62 * s;
                        const a0 = add(spot.p, mul(axis, -0.002)), a1 = add(spot.p, mul(axis, length));
                        K.on(spot, 'dark', q => cylinder(q, a0, add(spot.p, mul(axis, 0.004)), big * 0.62, 16, hw(pal, 0.5), head));
                        if (style === 'chrome') {
                            K.on(spot, 'gloss', q => { const c = add(spot.p, mul(axis, length * 0.55)), fa = frameAxes(axis); q.loft(7, (i, t) => { const a = (t - 0.5) * Math.PI; return { center: add(c, mul(axis, Math.sin(a) * length * 0.55)), x: fa.x, y: fa.y, rx: Math.cos(a) * big * 1.05 + 0.0005, ry: Math.cos(a) * big * 0.8 + 0.0005 }; }, 20, pal.plate, head, true); });
                            K.on(spot, 'chrome', q => ring(q, add(spot.p, mul(axis, length * 0.2)), axis, big * 0.95, 0.0012, [0.9, 0.9, 0.92], head, 24, 6));
                            K.on(spot, 'glow', q => ring(q, add(spot.p, mul(axis, length * 0.98)), axis, big * 0.45, 0.0008, pal.glow, head, 20, 5));
                        } else {
                            // A ribbed canister and its perforated cap.
                            const col = style === 'salvaged' ? (sd > 0 ? [0.62, 0.63, 0.62] : linear('#7d3f22')) : style === 'glow' ? scaleRgb(pal.plate, 1.2) : pal.plate;
                            K.on(spot, style === 'salvaged' && sd > 0 ? 'steel' : 'paint', q => {
                                const fa = frameAxes(axis), rib = style === 'glow' ? 0 : 0.06;
                                q.loft(10, (i, t) => ({ center: lerp(add(spot.p, mul(axis, 0.003)), a1, t), x: fa.x, y: fa.y, rx: big * (1 - (i % 2) * rib) * (i === 0 ? 0.8 : 1), ry: big * (1 - (i % 2) * rib) * (i === 0 ? 0.8 : 1) }), 16, col, head, true);
                            });
                            K.on(spot, 'dark', q => { cylinder(q, a1, add(a1, mul(axis, 0.0025)), big * 0.94, 20, [0.05, 0.05, 0.05], head); for (let j = 1; j <= 2; j++) ring(q, add(a1, mul(axis, 0.0026)), axis, big * j * 0.33, 0.0006, [0.12, 0.12, 0.12], head, 16, 4); });
                            if (style === 'glow') K.on(spot, 'glow', q => { for (let j = 0; j < 3; j++) ring(q, lerp(spot.p, a1, 0.3 + j * 0.22), axis, big * 1.003, 0.0006, pal.glow, head, 24, 4); });
                            if (style === 'salvaged' && sd > 0) K.on(spot, 'rubber', q => cylinder(q, lerp(spot.p, a1, 0.45), lerp(spot.p, a1, 0.62), big * 1.015, 20, [0.75, 0.7, 0.2], head));
                        }
                    }
                    const top = K.at(0, Mo + 0.85 * s);
                    if (style !== 'chrome') boltRow(K, [[0.72, Mo + 0.78 * s], [0.72, Mo - 0.68 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0011);
                    void top;
                    // Straps over and under the ears, a buckle where each meets the mask.
                    const front = Math.min(1.25, side / F.Rref + 0.12);
                    for (const [lo, hi] of [[E - 0.7 * s, E + 0.9 * s], [Mo - 0.35 * s, Mo + 0.15 * s]]) {
                        strap(mesh, L, t => F.worldY(mix(lo, hi, smooth(0, 0.45, t))), front, 0.011, 0.0018, style === 'chrome' ? scaleRgb(pal.plate, 0.9) : [0.05, 0.05, 0.05], head);
                    }
                }
            };
        });
    }

    /** The LED patterns: brightness 0..1 of the LED at face meters (x, y). */
    function ledPattern(kind, x, y, k, s, seed) {
        const { E, Mo } = k;
        if (kind === 'bars') {
            const col = Math.floor(x / 0.0042), h = 0.25 + 0.75 * fbm(col * 0.37 + seed, 2.3) ** 1.3, top = Mo - 0.4 * s + h * 2.1 * s;
            if (y > top || y < Mo - 0.45 * s) return 0;
            return 0.55 + 0.45 * smooth(top - 0.6 * s, top, y);
        }
        if (kind === 'glyphs') {
            // Five glyphs: strokes on a 3×4 lattice, chosen per glyph.
            const cw = 0.92 * s, ch = 1.15 * s, row = y > Mo + 0.45 * s ? 0 : 1, y0 = row ? Mo - 0.35 * s : E - 0.55 * s, n = row ? 2 : 3;
            const gx = Math.floor((x + n * cw / 2) / cw);
            if (gx < 0 || gx >= n || y < y0 || y > y0 + ch) return 0;
            const u = (x + n * cw / 2 - gx * cw) / cw * 4 - 0.5, v = (y - y0) / ch * 5 - 0.5, g = gx + row * 3 + seed * 7;
            let d = Infinity;
            const nodes = [[0.3, 0.3], [1.5, 0.3], [2.7, 0.3], [0.3, 2.1], [1.5, 2.1], [2.7, 2.1], [0.3, 3.9], [1.5, 3.9], [2.7, 3.9]];
            for (let e = 0; e < 7; e++) {
                const a = nodes[Math.floor(hash2(g, e) * 9)], b = nodes[Math.floor(hash2(e, g + 3) * 9)];
                if (a === b) continue;
                const bx = b[0] - a[0], by = b[1] - a[1], t = clamp(((u - a[0]) * bx + (v - a[1]) * by) / (bx * bx + by * by), 0, 1);
                d = Math.min(d, Math.hypot(u - a[0] - bx * t, v - a[1] - by * t));
            }
            return d < 0.3 ? 1 : 0;
        }
        const eyes = [-1, 1].map(sd => [sd * 1.0 * s, E + 0.05 * s]);
        if (kind === 'smile') {
            let on = 0;
            for (const [ex, ey] of eyes) { const d = Math.abs(Math.hypot(x - ex, (y - ey + 0.2 * s) * 1.1) - 0.42 * s); if (d < 0.11 * s && y > ey - 0.12 * s) on = 1; }
            const m = Math.abs(Math.hypot(x, (y - Mo - 0.65 * s) * 1.6) - 1.35 * s); if (m < 0.12 * s && y < Mo + 0.2 * s && Math.abs(x) < 1.3 * s) on = 1;
            return on;
        }
        // Eyes: two slanted, narrowed shapes, a bright rim and a dimmer middle.
        let v = 0;
        for (const [ex, ey] of eyes) {
            const sd = Math.sign(ex), dx = x - ex, dy = y - ey;
            const r = Math.hypot(dx / (0.58 * s), dy / (0.36 * s));
            const lid = dy - (0.18 * s - sd * dx * 0.38);
            if (r < 1 && lid < 0) v = Math.max(v, r > 0.72 || lid > -0.09 * s ? 1 : 0.5);
        }
        return v;
    }

    /**
     * LED mask: one smooth shell over the whole face, a dark glass panel in
     * front lit by a grid of LEDs in a pattern: eyes, a smile, glyphs or
     * level bars.
     */
    function ledMask(_m, L, o) {
        return platedPiece(L, o, C => {
            const { s, pal, style, k } = C, { E, Mo, Ch, CB, HL } = k, side = Math.min(3.05 * s, k.side - 0.12 * s), pattern = o.pattern || 'eyes';
            const outer = shape.mirrored([[0, HL + 0.05 * s], [1.2 * s, HL - 0.05 * s], [Math.min(2.25 * s, side), E + 1.4 * s], [side, E + 0.4 * s], [side, Mo + 0.3 * s], [side * 0.9, Mo - 0.5 * s], [2.0 * s, Ch - 0.3 * s], [1.0 * s, CB + 0.28 * s], [0, CB + 0.08 * s]]);
            const panel = shape.box([0, (E + 0.95 * s + Mo - 0.6 * s) / 2], 2.05 * s, (E + 0.95 * s - (Mo - 0.6 * s)) / 2, 0.75 * s);
            const cuts = [stroke(panel, 0)];
            if (style === 'military' || style === 'salvaged') for (const sd of [1, -1]) cuts.push(polyline(pts(s, [[0.35, HL + 0.1 * s], [0.3, E + 1.1 * s]], sd)));
            const bbox = [-side - 0.012, CB - 0.01, side + 0.012, HL + 0.06 * s + 0.01];
            const P = plates(outer, cuts, 0.0012, bbox, undefined, C.geo());
            const panelId = P.label(0, E);
            const dome = (X, Y) => 0.004 + 0.013 * Math.exp(-((X / (1.7 * s)) ** 2) - (((Y - (Mo + 0.6 * s)) / (1.7 * s)) ** 2)) + 0.004 * smooth(Mo - 0.3 * s, Mo - 1.2 * s, Y);
            const { lines, grooves } = styleLines(style, P);
            const pitch = 0.0021;
            return {
                P, id: 'ledMask', name: 'LED mask', key: pattern, bbox, outline: outer, cuts, cell: 0.0052, innerCell: 0.008, base: { clear: 0.004, blur: 0.04 }, thick: 0.0022, under: 0.0008,
                lift: (X, Y) => dome(X, Y) - 0.002 * (1 - smooth(0, 0.012, -outer(X, Y))),
                regionLift: id => (id === panelId ? -0.0006 : 0),
                mode: () => RIGID, lines, grooves,
                regionCol: id => (id === panelId ? [0.012, 0.012, 0.016] : undefined),
                marks: (X, Y, out, layer, d, region) => {
                    if (layer.finish === 'inner' || region(X, Y) !== panelId) return;
                    out.rough = 0.16; out.metal = 0; out.noWear = true;
                    const i = Math.round(X / pitch), j = Math.round(Y / pitch), cx = i * pitch, cy = j * pitch, r = Math.hypot(X - cx, Y - cy);
                    if (r < pitch * 0.36 && d > 0.002) {
                        const v = ledPattern(pattern, cx, cy, k, s, 5);
                        // A lit LED's light is its emissive (which a saved mask's glow rules animate); its own color is the dim tint of an unlit one.
                        out.col = v ? mixRgb([0.05, 0.05, 0.05], pal.glow, 0.14) : [0.035, 0.035, 0.04];
                        out.glow = v ? v * (1 - 0.35 * (r / (pitch * 0.36)) ** 2) : 0.035;
                    }
                },
                hardware: K => {
                    if (style === 'military') boltRow(K, [[2.55, E + 0.6 * s], [2.6, Mo - 0.2 * s], [0.7, HL - 0.25 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0014);
                    else if (style === 'salvaged') boltRow(K, [[2.5, E + 0.2 * s], [2.4, Mo - 0.4 * s], [1.6, HL - 0.5 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0014);
                    else boltRow(K, [[2.65, E + 0.1 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0012);
                    // Speaker pods at the cheeks' edge.
                    for (const sd of [1, -1]) {
                        const spot = K.at(sd * Math.min(2.55 * s, side - 0.008), Mo + 0.35 * s);
                        K.on(spot, style === 'chrome' ? 'chrome' : 'dark', q => cylinder(q, add(spot.p, mul(spot.n, -0.001)), add(spot.p, mul(spot.n, 0.0025)), 0.0052, 18, hw(pal, 0.9), K.head));
                        K.on(spot, 'glow', q => ring(q, add(spot.p, mul(spot.n, 0.0026)), spot.n, 0.0036, 0.0006, pal.glow, K.head, 16, 4));
                    }
                }
            };
        });
    }

    /** A tapered horn, fang or fin: a tube along a curve, its radius shrinking to a point. */
    function spike(m, pts, r0, rgb, skin, sides = 8) {
        const n = pts.length;
        m.tube(pts, Array.from({ length: n }, (_, i) => Math.max(0.0002, r0 * (1 - i / (n - 1)) ** 0.85)), sides, rgb, skin, true);
    }

    /**
     * Armored mask, demon, wolf or raptor (original takes): a full mask in
     * plates over the face, sculpted out from it; eye slits; the lower plate
     * opens with the jaw.
     */
    function armorMask(_m, L, o) {
        const kind = ['demon', 'wolf', 'raptor'].includes(o.shape) ? o.shape : 'demon';
        return platedPiece(L, o, C => {
            const { s, pal, style, k, M } = C, { E, Mo, Ch, CB, Br, HL } = k, side = Math.min(3.1 * s, k.side - 0.12 * s);
            const outer = shape.mirrored([[0, HL + 0.1 * s], [1.15 * s, HL], [Math.min(2.2 * s, side), E + 1.45 * s], [side, E + 0.5 * s], [side + (kind === 'demon' ? 0.15 * s : 0), Mo + 0.55 * s],
                [side * 0.9, Mo - 0.45 * s], [2.0 * s, Ch - 0.35 * s], [1.0 * s, CB + 0.25 * s], [0, CB + (kind === 'raptor' ? -0.15 : 0.08) * s]]);
            const slits = [];
            for (const sd of [1, -1]) {
                const Ey = sd > 0 ? M.eyeL : M.eyeR, ex = Ey.c[0], ey = Ey.c[1];
                const lift = kind === 'wolf' ? 0.2 : 0.14;
                slits.push(shape.outline([[ex - sd * 0.55 * s, ey - 0.02 * s], [ex, ey + 0.16 * s], [ex + sd * 0.7 * s, ey + lift * s + 0.12 * s], [ex + sd * 0.45 * s, ey - 0.12 * s], [ex - sd * 0.1 * s, ey - 0.16 * s]], 6));
            }
            const mouthHole = kind === 'demon' ? shape.box([0, Mo - 0.05 * s], 1.05 * s, 0.28 * s, 0.12 * s) : null;
            const outline = shape.sub(outer, ...slits, ...(mouthHole ? [mouthHole] : []));
            const jawPts = [[-4 * s, Mo + 1.05 * s], [-2.3 * s, Mo + 0.6 * s], [-1.1 * s, Mo - 0.05 * s], [1.1 * s, Mo - 0.05 * s], [2.3 * s, Mo + 0.6 * s], [4 * s, Mo + 1.05 * s]], below = shape.halfPlane(jawPts, 1);
            const cuts = [polyline(jawPts)];
            if (kind === 'demon') {
                cuts.push(polyline([[-side - 0.01, Br + 0.5 * s], [0, Br + 0.05 * s], [side + 0.01, Br + 0.5 * s]]));
                for (const sd of [1, -1]) cuts.push(polyline(pts(s, [[0.45, Br + 0.25 * s], [0.5, E - 0.3 * s], [0.75, Mo + 0.45 * s]], sd)), polyline(pts(s, [[1.6, E - 0.35 * s], [2.6, Mo + 0.9 * s], [side / s + 0.3, Mo + 0.9 * s]], sd)));
            } else if (kind === 'wolf') {
                for (const sd of [1, -1]) cuts.push(polyline(pts(s, [[0.15, HL + 0.2 * s], [0.42, Br], [0.82, E - 0.3 * s], [0.9, Mo - 0.1 * s]], sd)), polyline(pts(s, [[1.3, Br + 0.6 * s], [1.95, E - 0.2 * s], [2.4, Mo + 0.3 * s]], sd)));
            } else {
                // Feather scallops on the cheeks, a crest seam up the middle.
                cuts.push(polyline([[0, HL + 0.2 * s], [0, Br + 0.2 * s]]));
                for (const sd of [1, -1]) {
                    cuts.push(polyline(pts(s, [[0.36, Br + 0.25 * s], [0.42, E - 0.3 * s], [0.5, Mo + 0.3 * s], [0.95, Mo - 0.05 * s]], sd)));
                    for (let j = 0; j < 3; j++) { const y0 = E - (0.15 + j * 0.55) * s; cuts.push(polyline(pts(s, [[0.95, y0 + 0.1 * s], [1.6, y0 - 0.12 * s], [2.3, y0 - 0.05 * s], [side / s + 0.3, y0 + 0.25 * s]], sd))); }
                }
            }
            const bbox = [-side - 0.012 - 0.2 * s, CB - 0.012 - 0.3 * s, side + 0.012 + 0.2 * s, HL + 0.2 * s + 0.01];
            const P = plates(outline, cuts, 0.0015, bbox, undefined, C.geo());
            const jawSet = new Set(P.regions.filter(r => r.c[1] < Mo - 0.1 * s).map(r => r.id));
            // Sculpt: a scowling brow and flared cheeks; a snout; a beak.
            const g = (x, y, cx, cy, rx, ry) => Math.exp(-(((x - cx) / rx) ** 2) - (((y - cy) / ry) ** 2));
            const segDist = (x, y, a, b) => { const bx = b[0] - a[0], by = b[1] - a[1], t = clamp(((x - a[0]) * bx + (y - a[1]) * by) / (bx * bx + by * by), 0, 1); return Math.hypot(x - a[0] - bx * t, y - a[1] - by * t); };
            const sculpt = (X, Y) => {
                const ax = Math.abs(X);
                let h = 0.004 + 0.004 * g(X, Y, 0, Mo, 1.2 * s, 0.9 * s);
                if (kind === 'demon') {
                    // A scowling brow ridge rising outward, flared cheekbones, a ridge down the nose.
                    h += 0.009 * Math.exp(-((segDist(ax, Y, [0.2 * s, Br - 0.12 * s], [2.3 * s, Br + 0.5 * s]) / (0.22 * s)) ** 2));
                    h += 0.008 * g(ax, Y, 2.25 * s, Mo + 0.75 * s, 0.55 * s, 0.5 * s) + 0.004 * Math.exp(-((ax / (0.22 * s)) ** 2)) * smooth(Br, E - 0.2 * s, Y) * smooth(Mo - 0.1 * s, E - 0.9 * s, Y);
                }
                if (kind === 'wolf') {
                    // A snout: flat-topped, its sides falling away, reaching further toward the nose.
                    const across = 1 - smooth(0.62 * s, 0.95 * s, ax), along = smooth(E + 0.15 * s, E - 0.45 * s, Y) * (1 - smooth(Mo - 0.3 * s, Mo - 0.8 * s, Y));
                    h += across * along * mix(0.008, 0.026, smooth(E, Mo + 0.2 * s, Y)) + 0.004 * g(ax, Y, 1.0 * s, Br, 0.8 * s, 0.35 * s);
                }
                if (kind === 'raptor') {
                    // A beak: a sharp ridge from the brow, deepest over the mouth.
                    const ridge = Math.max(0, 1 - ax / (0.62 * s)) ** 1.6, along = smooth(Br + 0.3 * s, E - 0.5 * s, Y) * (1 - smooth(Mo - 0.35 * s, Mo - 0.85 * s, Y));
                    h += 0.036 * ridge * along * mix(0.3, 1, smooth(E, Mo, Y)) + 0.004 * g(ax, Y, 1.1 * s, Br, 0.9 * s, 0.3 * s);
                }
                return h;
            };
            const scraps = (pal.s.patches || []).map(linear);
            const { lines, grooves } = styleLines(style, P, style === 'chrome' || style === 'glow' ? [stroke((x, y) => shape.union(...slits)(x, y) - 0.0025, 0.0005)] : []);
            return {
                P, split: below, id: 'armorMask', name: 'Armored mask', key: kind, bbox, outline, outer, cuts, cell: 0.0052, innerCell: 0.008, gap: 0.0015, base: { clear: 0.0032, blur: 0.014 }, thick: 0.0026, under: 0.0009,
                lift: (X, Y) => sculpt(X, Y) * smooth(-0.004, 0.008, -outer(X, Y)),
                mode: (X, Y) => (below(X, Y) > 0 ? JAW : RIGID), lines, grooves,
                layers: [{ f: shape.union(...slits), finish: 'sensor' }],
                regionCol: id => style === 'salvaged' ? scraps[(id * 5) % scraps.length] : jawSet.has(id) ? scaleRgb(pal.plate, style === 'chrome' ? 0.95 : 0.8) : undefined,
                marks: (X, Y, out, layer) => {
                    if (layer.finish === 'sensor') { out.col = pal.glow; out.glow = 0.9; out.rough = 0.3; out.metal = 0; return; }
                    if (layer.finish === 'inner') return;
                    if (kind === 'wolf' && Math.hypot(X / (0.32 * s), (Y - (E - 0.95 * s)) / (0.2 * s)) < 1) { out.col = [0.03, 0.03, 0.035]; out.rough = 0.25; }
                    if (style === 'military') { const ink = glyphInk('X-9', X, Y, [-0.4 * s, HL - 0.55 * s], 0.0045); if (ink) out.col = mixRgb(out.col, [0.66, 0.63, 0.52], 0.85); }
                },
                hardware: K => {
                    const { head, F } = K, ivory = style === 'chrome' ? [0.9, 0.9, 0.92] : style === 'glow' ? pal.glow : [0.82, 0.78, 0.68];
                    const fin = style === 'glow' ? 'glow' : style === 'chrome' ? 'chrome' : 'gloss';
                    if (kind === 'demon') {
                        // Fangs down from the top of the grimace, up from its bottom; tusks at its corners; brow horns.
                        for (let j = -3; j <= 3; j++) {
                            for (const [yy, dir] of [[Mo + 0.23 * s, -1], [Mo - 0.33 * s, 1]]) {
                                const x = j * 0.29 * s, a = K.at(x, yy + dir * 0.03 * s, -0.0012), len2 = (Math.abs(j) === 3 ? 0.009 : 0.0045) * (dir < 0 ? 1 : 0.8);
                                K.on(a, fin, q => spike(q, [a.p, add(a.p, add(mul([0, dir, 0], len2 * 0.6), mul(a.n, 0.001))), add(a.p, add(mul([0, dir, 0], len2), mul(a.n, -0.0005)))], 0.0019, ivory, head, 6));
                            }
                        }
                        for (const sd of [1, -1]) {
                            const a = K.at(sd * 0.95 * s, HL - 0.35 * s, -0.001), up = norm(add(a.n, [0, 1.6, 0])), out = [sd, 0, 0];
                            K.on(a, fin, q => spike(q, [a.p, add(a.p, add(mul(up, 0.018), mul(out, 0.006))), add(a.p, add(mul(up, 0.036), mul(out, 0.018))), add(a.p, add(mul(up, 0.05), mul(out, 0.034))), add(a.p, add(add(mul(up, 0.056), mul(out, 0.05)), [0, 0.004, -0.01]))], 0.0068, ivory, head, 10));
                        }
                    } else if (kind === 'wolf') {
                        for (const sd of [1, -1]) {
                            const a = K.at(sd * 1.7 * s, HL - 0.15 * s, -0.001), back = [0, 0.35, -1], up = [0, 1, 0];
                            K.on(a, style === 'chrome' ? 'chrome' : 'paint', q => {
                                const tip = add(a.p, add(mul(up, 0.034), mul(norm(back), 0.012)));
                                spike(q, [a.p, lerp(a.p, tip, 0.5), tip], 0.008, scaleRgb(pal.plate, 0.9), head, 6);
                            });
                            for (let j = 0; j < 2; j++) { const f = K.at(sd * (0.5 + j * 0.25) * s, Mo - 0.12 * s, -0.001); K.on(f, fin, q => spike(q, [f.p, add(f.p, [0, -0.007 + j * 0.0015, 0.0012])], 0.0018, ivory, head, 6)); }
                        }
                    } else {
                        // The beak's hook and a crest fin.
                        const t = K.at(0, Mo - 0.2 * s), down = [0, -1, 0];
                        K.on(t, style === 'chrome' ? 'chrome' : 'paint', q => spike(q, [add(t.p, mul(t.n, -0.006)), add(t.p, add(mul(down, 0.01), mul(t.n, 0.001))), add(t.p, add(mul(down, 0.019), mul(t.n, -0.004))), add(t.p, add(mul(down, 0.024), mul(t.n, -0.011)))], 0.0085, scaleRgb(pal.plate, 0.8), head, 10));
                        const c0 = K.at(0, Br + 0.6 * s), c1 = K.at(0, HL + 0.05 * s);
                        K.on(c0, style === 'glow' ? 'glow' : 'paint', q => slab(q, add(lerp(c0.p, c1.p, 0.5), mul(lerp(c0.n, c1.n, 0.5), 0.004)), [[1, 0, 0], norm(lerp(c0.n, c1.n, 0.5)), norm(sub(c1.p, c0.p))].map(norm), [0.0011, 0.004, len(sub(c1.p, c0.p)) * 0.5], 0.0009, style === 'glow' ? pal.glow : scaleRgb(pal.plate, 0.75), head));
                    }
                    if (style === 'military') boltRow(K, [[1.55, HL - 0.3 * s], [2.6, E + 0.3 * s], [2.55, Mo - 0.25 * s], [1.0, CB + 0.6 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0016);
                    else if (style === 'salvaged') boltRow(K, K.P.regions.filter(r => r.area > 0.00015).map(r => [r.c[0], r.c[1]]), 0.0014);
                    else boltRow(K, [[2.7, E + 0.2 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0013);
                    void F;
                }
            };
        });
    }

    /**
     * Mouth guard: armored slats over mouth and chin, hinged at the cheeks;
     * the slats under the lips ride the jaw.
     */
    function mouthGuard(_m, L, o) {
        return platedPiece(L, o, C => {
            const { s, pal, style, k } = C, { Mo, Ch, CB } = k, side = Math.min(2.7 * s, k.side - 0.2 * s);
            const outer = shape.mirrored([[0, Mo + 0.82 * s], [0.85 * s, Mo + 0.78 * s], [1.8 * s, Mo + 0.6 * s], [side, Mo + 0.25 * s], [side * 0.96, Mo - 0.5 * s], [1.8 * s, Ch - 0.3 * s], [0.9 * s, CB + 0.3 * s], [0, CB + 0.1 * s]]);
            const jawPts = [[-4 * s, Mo + 0.55 * s], [-1.6 * s, Mo + 0.1 * s], [0, Mo - 0.03 * s], [1.6 * s, Mo + 0.1 * s], [4 * s, Mo + 0.55 * s]], below = shape.halfPlane(jawPts, 1);
            const cuts = [polyline(jawPts)];
            const n = style === 'chrome' ? 3 : 4;
            for (let j = -n; j <= n; j++) if (j) cuts.push(polyline([[j * 0.42 * s, Mo + 0.9 * s], [j * 0.46 * s, CB - 0.01]]));
            const bbox = [-side - 0.012, CB - 0.01, side + 0.012, Mo + 0.9 * s + 0.01];
            const P = plates(outer, cuts, 0.0013, bbox, undefined, C.geo());
            const jawSet = new Set(P.regions.filter(r => r.c[1] < Mo - 0.05 * s).map(r => r.id));
            const muzzle = (X, Y) => 0.0035 + 0.0045 * Math.exp(-((X / (1.2 * s)) ** 2) - (((Y - Mo) / (0.75 * s)) ** 2));
            const { lines, grooves } = styleLines(style, P);
            return {
                P, split: below, id: 'mouthGuard', name: 'Mouth guard', bbox, outline: outer, cuts, base: { clear: 0.0022, blur: 0.01 }, thick: 0.0022, under: 0.0007,
                lift: (X, Y) => muzzle(X, Y) * smooth(-0.003, 0.008, -outer(X, Y)),
                regionLift: (id, X) => 0.0009 * Math.sin(Math.abs(X) / (0.42 * s) * Math.PI) ** 2 * (Math.abs(X) < 1.5 * s ? 1 : 0),
                mode: (X, Y) => (below(X, Y) > 0 ? JAW : RIGID), lines, grooves,
                regionCol: id => (style === 'salvaged' ? (pal.s.patches ? linear(pal.s.patches[id % pal.s.patches.length]) : undefined) : undefined),
                marks: (X, Y, out, layer) => { if (layer.finish !== 'inner' && style === 'glow' && Math.abs(Y - Mo) < 0.06 * s && Math.abs(X) < 1.4 * s) { out.glow = 0.9; out.col = pal.glow; } },
                hardware: K => {
                    const { head, mesh } = K;
                    for (const sd of [1, -1]) {
                        const spot = K.at(sd * (side - 0.006), Mo + 0.05 * s);
                        K.on(spot, style === 'chrome' ? 'chrome' : 'steel', q => { cylinder(q, add(spot.p, mul(spot.n, -0.001)), add(spot.p, mul(spot.n, 0.003)), 0.0056, 18, hw(pal, 1.05), head); ring(q, add(spot.p, mul(spot.n, 0.003)), spot.n, 0.004, 0.0008, hw(pal, 1.3), head, 16, 5); });
                        K.on(spot, 'glow', q => lensDome(q, add(spot.p, mul(spot.n, 0.0031)), spot.n, 0.0016, 0.0007, pal.glow, head, 10));
                    }
                    if (style === 'military' || style === 'salvaged') boltRow(K, [[1.95, Mo + 0.4 * s], [1.9, Mo - 0.5 * s]].flatMap(([x, y]) => [[x * s, y], [-x * s, y]]), 0.0013);
                }
            };
        });
    }

    // ── lenses and their readouts ─────────────────────────────────────────
    /**
     * A lens's pictures: its tint and its readout, painted over the lens's own
     * coordinates (u across, v down, 0..1; aspect = width / height):
     * paint(u, v, out) sets out.tint (linear rgb) and out.glow (0..1).
     */
    function bakeLens(key, w, h, paint, textures) {
        let hit = pictureCache.get('lens|' + key);
        if (!hit) {
            const albedo = new Uint8Array(w * h * 4), glow = new Uint8Array(w * h * 4), out = { tint: [1, 1, 1], glow: 0 };
            for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
                out.tint = [1, 1, 1]; out.glow = 0;
                paint((i + 0.5) / w, (j + 0.5) / h, out);
                const k = (j * w + i) * 4;
                albedo[k] = toByte(out.tint[0]); albedo[k + 1] = toByte(out.tint[1]); albedo[k + 2] = toByte(out.tint[2]); albedo[k + 3] = 255;
                const g = clamp(Math.round(out.glow * 255), 0, 255); glow[k] = glow[k + 1] = glow[k + 2] = g; glow[k + 3] = 255;
            }
            const id = 'cyber-lens-' + hashKey(key);
            hit = { albedo: { name: id + '-tint.png', width: w, height: h, data: albedo }, glow: { name: id + '-readout.png', width: w, height: h, data: glow } };
            pictureCache.set('lens|' + key, hit);
        }
        if (textures) { textures[hit.albedo.name] = hit.albedo; textures[hit.glow.name] = hit.glow; }
        return hit;
    }
    function lensExtra(name, pics, pal, o, opacity) {
        return { name, texture: pics.albedo.name, emissive: pal.glowHex, emissiveIntensity: glowOf(o) * 0.75, emissiveTexture: pics.glow.name, opacity, roughness: 0.04, metalness: 0, doubleSided: true, keepColors: true, ownSurface: true };
    }
    /** Readout strokes, in a lens's own units (u, v scaled by its aspect): each returns a coverage 0..1. */
    const hud = {
        line: (x, y, a, b, w) => { const bx = b[0] - a[0], by = b[1] - a[1], t = clamp(((x - a[0]) * bx + (y - a[1]) * by) / (bx * bx + by * by || 1), 0, 1); return 1 - smooth(w * 0.5, w * 0.5 + 0.004, Math.hypot(x - a[0] - bx * t, y - a[1] - by * t)); },
        arc: (x, y, c, r, w, a0, a1) => { const a = Math.atan2(y - c[1], x - c[0]); let t = a; while (t < a0) t += Math.PI * 2; if (t > a1) return 0; return 1 - smooth(w * 0.5, w * 0.5 + 0.004, Math.abs(Math.hypot(x - c[0], y - c[1]) - r)); },
        box: (x, y, c, hx, hy, w) => { const dx = Math.abs(x - c[0]) - hx, dy = Math.abs(y - c[1]) - hy, d = Math.abs(Math.max(dx, dy)); return Math.max(dx, dy) < w && d < w ? 1 - smooth(w * 0.5, w * 0.5 + 0.004, d) : 0; },
        fill: (x, y, c, hx, hy) => (Math.abs(x - c[0]) < hx && Math.abs(y - c[1]) < hy ? 1 : 0),
        text: (x, y, str, at, size) => glyphInk(str, x, y, at, size)
    };
    /** Readouts per lens kind; (x, y) in lens units, y up; aspect: width / height. Coverage 0..1. */
    function readout(kind, x, y, aspect, seed, style) {
        let v = 0;
        const add2 = c => { v = Math.max(v, c); };
        if (kind === 'visor') {
            // Left: a segmented gauge and three bars; right: a trace in a box and two rows of figures; a heading strip on top.
            const lc = [aspect * 0.24, 0.5];
            for (let j = 0; j < 12; j++) { const a0 = Math.PI * (0.85 - j * 0.11), seg = hud.arc(x, y, lc, 0.26, 0.035, a0 - 0.08, a0); add2(seg * (j < 8 ? 1 : 0.35)); }
            add2(hud.arc(x, y, lc, 0.19, 0.012, -Math.PI, Math.PI) * 0.5);
            for (let j = 0; j < 3; j++) add2(hud.fill(x, y, [aspect * 0.35 + j * 0.035, 0.36 + 0.06 * (j + 1) / 2], 0.012, 0.06 * (j + 1) / 2));
            const rc = [aspect * 0.74, 0.55];
            add2(hud.box(x, y, rc, 0.22, 0.14, 0.012) * 0.7);
            if (Math.abs(x - rc[0]) < 0.2 && Math.abs(y - rc[1]) < 0.12) { const t = (x - rc[0]) / 0.4 + 0.5, f = rc[1] - 0.06 + 0.1 * fbm(t * 6 + seed, 1.7); add2(1 - smooth(0.006, 0.014, Math.abs(y - f))); }
            add2(hud.text(x, y, '07/42', [aspect * 0.62, 0.22], 0.07) * 0.9);
            add2(hud.text(x, y, '3K-1', [aspect * 0.62, 0.11], 0.05) * 0.6);
            for (let j = 0; j < 31; j++) { const tx = aspect * (0.2 + j * 0.02); add2(hud.line(x, y, [tx, 0.9], [tx, j % 5 ? 0.86 : 0.82], 0.008) * 0.7); }
            add2(hud.line(x, y, [aspect * 0.48, 0.5], [aspect * 0.5, 0.53], 0.01) * 0.6); add2(hud.line(x, y, [aspect * 0.52, 0.5], [aspect * 0.5, 0.53], 0.01) * 0.6);
        } else if (kind === 'reticle') {
            const c = [aspect * 0.5, 0.5];
            for (let q = 0; q < 4; q++) add2(hud.arc(x, y, c, 0.36, 0.02, q * Math.PI / 2 + 0.25, q * Math.PI / 2 + Math.PI / 2 - 0.25));
            for (let j = 0; j < 36; j++) { const a = j / 36 * Math.PI * 2, r0 = j % 3 ? 0.41 : 0.39; add2(hud.line(x, y, [c[0] + Math.cos(a) * r0, c[1] + Math.sin(a) * r0], [c[0] + Math.cos(a) * 0.44, c[1] + Math.sin(a) * 0.44], 0.008) * 0.8); }
            add2(hud.line(x, y, [c[0], c[1] + 0.08], [c[0] + 0.08, c[1]], 0.012)); add2(hud.line(x, y, [c[0] + 0.08, c[1]], [c[0], c[1] - 0.08], 0.012));
            add2(hud.line(x, y, [c[0], c[1] - 0.08], [c[0] - 0.08, c[1]], 0.012)); add2(hud.line(x, y, [c[0] - 0.08, c[1]], [c[0], c[1] + 0.08], 0.012));
            add2(hud.text(x, y, '128', [c[0] - 0.09, c[1] - 0.3], 0.08) * 0.85);
            for (let j = 0; j < 7; j++) add2(hud.arc(x, y, c, 0.29, 0.03, -0.6 + j * 0.13, -0.6 + j * 0.13 + 0.09) * (j < 5 ? 0.9 : 0.3));
        } else if (kind === 'scouter') {
            const c = [aspect * 0.46, 0.52];
            for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = [c[0] + sx * 0.2, c[1] + sy * 0.16]; add2(hud.line(x, y, p, [p[0] - sx * 0.07, p[1]], 0.016)); add2(hud.line(x, y, p, [p[0], p[1] - sy * 0.06], 0.016)); }
            for (let j = 1; j < 6; j++) { add2(hud.line(x, y, [j * aspect / 6, 0.05], [j * aspect / 6, 0.95], 0.004) * 0.25); add2(hud.line(x, y, [0.05, j / 6], [aspect - 0.05, j / 6], 0.004) * 0.25); }
            add2(hud.text(x, y, '4180', [aspect * 0.1, 0.12], 0.1) * 0.9);
            add2(hud.text(x, y, 'A-3', [aspect * 0.1, 0.8], 0.07) * 0.7);
            add2(hud.fill(x, y, [aspect * 0.9, 0.3 + 0.2], 0.025, 0.2) * 0.5); add2(hud.fill(x, y, [aspect * 0.9, 0.2 + 0.11], 0.025, 0.11));
        } else if (kind === 'shield') {
            add2(hud.line(x, y, [0.06, 0.08], [aspect - 0.06, 0.08], 0.006) * 0.5);
            for (let j = 0; j < 15; j++) { const tx = aspect * (0.3 + j * 0.03); add2(hud.line(x, y, [tx, 0.08], [tx, j % 5 ? 0.1 : 0.12], 0.006) * 0.5); }
            add2(hud.box(x, y, [aspect * 0.8, 0.28], 0.1, 0.06, 0.006) * 0.6);
            add2(hud.text(x, y, '04-2', [aspect * 0.74, 0.25], 0.045) * 0.7);
            add2(hud.arc(x, y, [aspect * 0.2, 0.3], 0.07, 0.01, -2.5, 1.2) * 0.6);
        } else if (kind === 'ar') {
            add2(hud.fill(x, y, [aspect * 0.78, 0.78], 0.07, 0.025) * 0.7); add2(hud.fill(x, y, [aspect * 0.72, 0.7], 0.13, 0.012) * 0.45);
            add2(hud.arc(x, y, [aspect * 0.22, 0.75], 0.06, 0.014, -3.0, 1.5) * 0.7);
        }
        return v;
    }

    /** Pictures for a piece that is all hardware: just the swatches. */
    function hardwarePics(o, pal, textures) {
        return bake('hw|' + inner(o.style) + '|' + pal.s.plate, 64, { x0: 0, y1: 0, span: 1 }, (X, Y, out) => { out.col = pal.plate; out.rough = pal.s.rough; out.metal = pal.s.metal; }, pal.s, textures);
    }
    /** A grid surface: `at(u, v)` → point, rows × cols, double-sided parts take either side. */
    function sheet(m, rows, cols, at, rgb, skin, uvOf) {
        const ids = [];
        for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
            const u = i / cols, v = j / rows;
            m.state.uv = uvOf ? uvOf(u, v) : [u, v];
            ids.push(m.vertex(at(u, v), [0, 0, 1], rgb, skin));
        }
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const a = ids[j * (cols + 1) + i], b = a + 1, c = a + cols + 1, d = c + 1;
            m.tri(a, c, b); m.tri(b, c, d);
        }
        return ids;
    }
    /** Where the head (and its hair) is, round at height y in direction ang (0 ahead): a point `off` out from it. */
    function aroundHead(L, y, ang, off, center, ears = false) {
        const key = ears ? '_cyberShellEars' : '_cyberShell';
        if (!L[key]) {
            // The head and neck as built, less the ears (straps and cables pass by them), and the hair.
            const H = Body.headFields(L.pack), src = L.pack.body.source, P = L.bodyPart.positions, low = L.neck.center[1] - 0.03, out = [];
            for (let v = 0; v < src.length; v++) if (P[v * 3 + 1] > low && (ears || H.ear[src[v]] <= 0.6)) out.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
            const hair = L.hair || [];
            for (let h = 0; h < hair.length; h += 3) out.push(hair[h], hair[h + 1], hair[h + 2]);
            L[key] = Float32Array.from(out);
        }
        const R = center ? { center, rx: L.neck.rx, rz: L.neck.rz } : L.ring(y, 0.012) || L.ring(L.eyeY), dir = [Math.sin(ang), 0, Math.cos(ang)], S = L[key], cx = R.center[0], cz = R.center[2];
        let r = 0;
        for (let h = 0; h < S.length; h += 3) {
            if (Math.abs(S[h + 1] - y) > 0.01) continue;
            const hx = S[h] - cx, hz = S[h + 2] - cz, along = hx * dir[0] + hz * dir[2];
            if (along > r && Math.abs(hx * dir[2] - hz * dir[0]) < 0.01) r = along;
        }
        if (!r) r = 1 / Math.hypot(dir[0] / R.rx, dir[2] / R.rz);
        return [cx + dir[0] * (r + off), y, cz + dir[2] * (r + off)];
    }

    /**
     * Wraparound visor: one lens from temple to temple a finger's width off the
     * face, readouts glowing in it (a gauge, a trace, figures, a heading
     * strip), on a frame in the item's style.
     */
    function visor(_m, L, o) {
        const C = context(L, o), { F, s, pal, style, mesh, head, k } = C, { E } = k;
        const Xs = Math.min(2.75 * s, k.side - 0.25 * s), baseR = F.base(0.009, 0.026);
        const top = X => E + 0.55 * s - 0.12 * s * (X / Xs) ** 2, bot = X => E - 0.52 * s + 0.28 * s * (X / Xs) ** 2;
        const lensAt = (u, v) => { const X = (u * 2 - 1) * Xs, Y = mix(top(X), bot(X), v); return F.on(baseR, X, Y, 0.003 + 0.002 * (1 - (u * 2 - 1) ** 2)); };
        const lens = newMesh();
        const aspect = 2 * Xs / (top(0) - bot(0));
        sheet(lens, 10, 44, lensAt, [1, 1, 1], head);
        const tint = style === 'military' ? linear('#3a3020') : style === 'chrome' ? linear('#9fb6c4') : style === 'salvaged' ? linear('#556050') : mixRgb([0.5, 0.5, 0.55], pal.glow, 0.25);
        const lp = bakeLens(designKey('visorLens', o, F), 512, 128, (u, v, out) => {
            const x = u * aspect, y = 1 - v;
            out.tint = tint;
            let g = readout('visor', x, y, aspect, 3, style) * 0.9;
            // Edge light along the rims.
            g = Math.max(g, (1 - smooth(0.0, 0.05, Math.min(y, 1 - y))) * (style === 'glow' ? 0.9 : 0.35));
            if (style === 'salvaged') { const c = Math.abs(y - 0.5 - 0.3 * Math.sin(x * 7 + 1.3) * (x > aspect * 0.55 ? 1 : 0)); if (x > aspect * 0.55 && c < 0.008) { out.tint = [0.9, 0.9, 0.9]; g = 0.1; } }
            out.glow = g;
        }, L.textures);
        lens.computeNormals();
        const pics = hardwarePics(o, pal, L.textures);
        // The frame.
        const rim = (v, dz) => Array.from({ length: 25 }, (_, i) => { const u = i / 24, p = lensAt(u, v), q = lensAt(u, v + (v ? -0.02 : 0.02)); return add(p, mul(norm(sub(p, F.C)), dz)); });
        const frameCol = style === 'chrome' ? [0.92, 0.93, 0.95] : style === 'glow' ? scaleRgb(pal.plate, 1) : pal.plate;
        if (style !== 'glow') mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => q.tube(rim(0, -0.0006), style === 'military' ? 0.0034 : 0.0021, 10, frameCol, head, true));
        if (style === 'military' || style === 'salvaged') mesh.with('paint', q => q.tube(rim(1, -0.0004), 0.0014, 8, frameCol, head, true));
        if (style === 'chrome') mesh.with('chrome', q => q.tube(rim(0, 0.0012), 0.0007, 6, [0.85, 0.86, 0.88], head, true));
        // The bridge rests on the nose; arms run back over the ears.
        const bridge = lensAt(0.5, 1), nose = F.on(F.base(0.001, 0.003), 0, bot(0) - 0.05 * s, 0.001);
        mesh.with(style === 'chrome' ? 'chrome' : 'dark', q => q.tube([bridge, lerp(bridge, nose, 0.6), nose], 0.0014, 6, hw(pal, 0.9), head, true));
        for (const sd of [1, -1]) {
            const end = lensAt(sd > 0 ? 1 : 0, 0.35), ear = sd > 0 ? L.earL : L.earR;
            const angEnd = Math.atan2(end[0] - L.ring(L.eyeY).center[0], end[2] - L.ring(L.eyeY).center[2]);
            const path = [end];
            for (let j = 1; j <= 6; j++) { const t = j / 6, ang = mix(angEnd, sd * 1.75, t), y = mix(end[1], (ear ? ear.center[1] : L.eyeY) + 0.022, smooth(0, 0.7, t)); path.push(aroundHead(L, y, ang, 0.004)); }
            mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => q.tube(path, style === 'military' ? 0.0026 : 0.0018, 8, frameCol, head, true));
            const pod = path[path.length - 1];
            mesh.with('dark', q => slab(q, pod, [norm(sub(path[path.length - 1], path[path.length - 2])), [0, 1, 0], norm(cross(norm(sub(path[path.length - 1], path[path.length - 2])), [0, 1, 0]))], [0.009, 0.006, 0.0035], 0.0025, hw(pal, 0.6), head));
            mesh.with('glow', q => q.sphere(add(pod, [0, 0.0062, 0]), 0.0012, pal.glow, head, 4, 8));
            if (style === 'military' && sd > 0) {
                const at = path[1], fwd = norm(sub(path[0], path[1]));
                mesh.with('dark', q => cylinder(q, add(at, [0, 0.008, 0]), add(add(at, [0, 0.008, 0]), mul(fwd, 0.02)), 0.0045, 12, hw(pal, 0.5), head));
                mesh.with('gloss', q => lensDome(q, add(add(at, [0, 0.008, 0]), mul(fwd, 0.0202)), fwd, 0.0038, 0.001, [0.15, 0.08, 0.02], head, 12));
            }
            if (style === 'glow') mesh.with('glow', q => q.sphere(lensAt(sd > 0 ? 1 : 0, 0.5), 0.0022, pal.glow, head, 5, 10));
        }
        if (style === 'salvaged') mesh.with('rubber', q => { const c = lensAt(0.5, 0.15); cylinder(q, add(c, [-0.007, 0, 0]), add(c, [0.007, 0, 0]), 0.0045, 10, [0.62, 0.6, 0.55], head); });
        mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Cyber visor frame', pics, pal, o) }, { mesh: lens, extra: lensExtra('Cyber visor lens', lp, pal, o, style === 'military' ? 0.62 : 0.42) }];
    }

    /** A rounded-rectangle lens surface facing n: superellipse rings out from the middle; uv across it. */
    function lensPlate(m, c, n, xAxis, hx, hy, bow, rgb, skin, rings = 5, segs = 28, power = 4) {
        const x = norm(sub(xAxis, mul(n, dot(xAxis, n)))), y = cross(n, x), pts2 = [];
        const edge = a => { const ca = Math.cos(a), sa = Math.sin(a), k = Math.pow(Math.pow(Math.abs(ca), power) + Math.pow(Math.abs(sa), power), -1 / power); return [ca * k, sa * k]; };
        const ids = [];
        m.state.uv = [0.5, 0.5];
        const center = m.vertex(add(c, mul(n, bow)), n, rgb, skin);
        for (let r = 1; r <= rings; r++) {
            const t = r / rings, row = [];
            for (let j = 0; j < segs; j++) {
                const e = edge(j / segs * Math.PI * 2), px = e[0] * hx * t, py = e[1] * hy * t;
                m.state.uv = [0.5 + e[0] * t * 0.5, 0.5 - e[1] * t * 0.5];
                row.push(m.vertex(add(c, add(add(mul(x, px), mul(y, py)), mul(n, bow * (1 - t * t)))), n, rgb, skin));
            }
            ids.push(row);
        }
        for (let j = 0; j < segs; j++) m.tri(center, ids[0][j], ids[0][(j + 1) % segs]);
        for (let r = 0; r + 1 < rings; r++) for (let j = 0; j < segs; j++) { const a = ids[r][j], b = ids[r][(j + 1) % segs], cc = ids[r + 1][j], d = ids[r + 1][(j + 1) % segs]; m.tri(a, cc, b); m.tri(b, cc, d); }
        void pts2;
        return { x, y, edge, outer: ids[rings - 1] };
    }

    /** AR glasses: slim frames, lenses lit along their edges, a readout in the corner of one. */
    function arGlasses(_m, L, o) {
        const C = context(L, o), { F, pal, style, mesh, head } = C;
        const lens = newMesh(), pics = hardwarePics(o, pal, L.textures);
        const lp = bakeLens(designKey('arLens', o, F), 256, 128, (u, v, out) => {
            const x = u * 2, y = 1 - v, lx = x % 1, d = Math.min(lx, 1 - lx, y, 1 - y);
            out.tint = style === 'glow' ? scaleRgb(pal.glow, 0.35) : style === 'military' ? linear('#4a4030') : linear('#b8ccd6');
            let g = (1 - smooth(0.0, 0.05, d)) * (style === 'glow' ? 1 : 0.85);
            if (x > 1) g = Math.max(g, readout('ar', lx, y, 1, 2, style));
            out.glow = g;
        }, L.textures);
        const frameCol = style === 'chrome' ? [0.9, 0.91, 0.93] : style === 'salvaged' ? [0.25, 0.22, 0.2] : pal.plate;
        const thick = style === 'military' ? 0.0022 : 0.0013;
        const inner = [];
        for (const E of [L.eyeL, L.eyeR]) {
            const sd = Math.sign(E.center[0]), hx = E.radius * 1.45, hy = E.radius * 0.95;
            const c = add(E.center, [sd * hx * 0.06, -E.radius * 0.12, E.radius * 1.05 + 0.007]), n = norm([sd * 0.08, 0, 1]);
            const half = (sd > 0 ? 0.5 : 0);
            lens.state.uv = [0, 0];
            const plate = lensPlate(lens, c, n, [sd > 0 ? 1 : -1, 0, 0], hx, hy, 0.0012, [1, 1, 1], head, 4, 32, style === 'chrome' ? 3.2 : 5);
            // Map the lens's own uv into its half of the picture.
            for (let v = lens.uv.length / 2 - (1 + 4 * 32); v < lens.uv.length / 2; v++) lens.uv[v * 2] = half + (sd > 0 ? lens.uv[v * 2] : 1 - lens.uv[v * 2]) * 0.5;
            const ringPts = Array.from({ length: 41 }, (_, j) => { const e = plate.edge(j / 40 * Math.PI * 2); return add(c, add(mul(plate.x, e[0] * (hx + thick * 0.4)), mul(plate.y, e[1] * (hy + thick * 0.4)))); });
            if (style !== 'glow') mesh.with(style === 'chrome' ? 'chrome' : 'paint', q => q.tube(ringPts, thick, 6, frameCol, head, false));
            else mesh.with('glow', q => q.tube(ringPts, 0.0005, 4, pal.glow, head, false));
            inner.push({ c, sd, hx, hy, plate });
            const ear = sd > 0 ? L.earL : L.earR, outerPt = add(c, mul(plate.x, (hx + thick) * (sd > 0 ? 1 : -1) * (sd > 0 ? 1 : -1)));
            const hinge = add(c, mul(plate.x, hx + thick)), back = ear ? add(ear.center, [sd * 0.004, 0.014, 0]) : add(hinge, [0, 0, -0.09]);
            const ring2 = L.ring(c[1]), mid = [sd * (ring2 ? ring2.rx + 0.005 : Math.abs(hinge[0])), lerp(hinge, back, 0.5)[1] + 0.003, lerp(hinge, back, 0.5)[2]];
            void outerPt;
            mesh.with(style === 'chrome' ? 'chrome' : 'paint', q => q.tube([hinge, lerp(hinge, mid, 0.5), mid, back, add(back, [0, -0.016, -0.008])], thick * 0.9, 6, frameCol, head, true));
            const podAt = lerp(hinge, mid, 0.42), along = norm(sub(mid, hinge));
            mesh.with(style === 'chrome' ? 'gloss' : 'dark', q => slab(q, podAt, [along, [0, 1, 0], cross(along, [0, 1, 0])], [0.009, 0.0042, 0.0026], 0.002, style === 'chrome' ? [0.92, 0.93, 0.95] : hw(pal, 0.6), head));
            mesh.with('glow', q => q.sphere(add(podAt, mul(along, -0.0085)), 0.0011, pal.glow, head, 4, 8));
        }
        const [a, b] = inner, br = [lerp(a.c, b.c, 0.5)[0], a.c[1] + a.hy * 0.25, Math.max(a.c[2], b.c[2]) + 0.001];
        const ia = add(a.c, mul(a.plate.x, -a.hx)), ib = add(b.c, mul(b.plate.x, -b.hx));
        mesh.with(style === 'chrome' ? 'chrome' : 'paint', q => q.tube([ia, br, ib], thick * 0.9, 6, frameCol, head, true));
        if (style === 'salvaged') mesh.with('rubber', q => cylinder(q, add(br, [-0.004, 0, 0]), add(br, [0.004, 0, 0]), 0.0028, 10, [0.85, 0.85, 0.82], head));
        lens.computeNormals(); mesh.computeNormals();
        return [{ mesh, extra: platingExtra('AR glasses frame', pics, pal, o) }, { mesh: lens, extra: lensExtra('AR glasses lenses', lp, pal, o, 0.3) }];
    }

    /**
     * Tactical goggles: a housing over both eyes sealed to the face, each eye
     * a cluster of lenses (a big objective and smaller ones), a strap round
     * the head.
     */
    function tacGoggles(_m, L, o) {
        return platedPiece(L, o, C => {
            const { s, pal, style, k, M } = C, { E } = k, side = Math.min(2.65 * s, k.side - 0.25 * s);
            const outer = shape.sub(shape.mirrored([[0, E + 0.68 * s], [1.3 * s, E + 0.75 * s], [side, E + 0.45 * s], [side, E - 0.45 * s], [1.5 * s, E - 0.68 * s], [0.55 * s, E - 0.55 * s], [0, E - 0.3 * s]]), shape.ellipse([0, E - 0.75 * s], 0.42 * s, 0.5 * s));
            const cuts = [polyline([[0, E + 0.9 * s], [0, E - 0.9 * s]])];
            if (style !== 'chrome') for (const sd of [1, -1]) cuts.push(polyline(pts(s, [[1.95, E + 0.9 * s], [2.05, E - 0.9 * s]], sd)));
            const bbox = [-side - 0.012, E - 0.85 * s, side + 0.012, E + 0.85 * s];
            const P = plates(outer, cuts, 0.0012, bbox, undefined, C.geo());
            const { lines, grooves } = styleLines(style, P);
            const pods = [M.eyeL, M.eyeR].map(e => ({ x: e.c[0], y: e.c[1], sd: Math.sign(e.c[0]) }));
            return {
                P, id: 'goggles', name: 'Tactical goggles', bbox, outline: outer, cuts, base: { clear: 0.004, blur: 0.016 }, thick: 0.003, under: 0.0006,
                lift: (X, Y) => 0.004 * smooth(0, 0.008, -outer(X, Y)), mode: () => RIGID, lines, grooves,
                hardware: K => {
                    const { head, mesh } = K;
                    for (const p of pods) {
                        const spot = K.at(p.x, p.y), n = spot.n, cl = style === 'military' ? [[0, 0, 0.36, 0.022], [0.3, 0.42, 0.15, 0.012], [-0.38, 0.38, 0.13, 0.01]] : style === 'glow' ? [[-0.17, 0.12, 0.17, 0.008], [0.17, 0.12, 0.17, 0.008], [-0.17, -0.17, 0.17, 0.008], [0.17, -0.17, 0.17, 0.008]] : style === 'salvaged' ? [[0, 0, 0.4, 0.008], [p.sd * 0.42, 0.42, 0.12, 0.016]] : [[0, 0, 0.42, 0.006], [p.sd * 0.5, 0.32, 0.07, 0.004]];
                        for (const [dx, dy, r, l] of cl) {
                            const c0 = add(add(spot.p, mul(spot.x, dx * s * p.sd)), mul(spot.y, dy * s)), c1 = add(c0, mul(n, l)), rr = r * s;
                            K.on(spot, 'dark', q => cylinder(q, add(c0, mul(n, -0.002)), c1, rr, Math.max(12, Math.round(rr * 2000)), hw(pal, 0.55), head, rr * 0.92));
                            K.on(spot, style === 'chrome' ? 'chrome' : 'steel', q => ring(q, c1, n, rr * 0.93, Math.max(0.0007, rr * 0.08), hw(pal, 1.15), head, 20, 5));
                            K.on(spot, 'gloss', q => lensDome(q, add(c1, mul(n, -0.0008)), n, rr * 0.86, rr * 0.25, style === 'military' ? [0.05, 0.09, 0.05] : [0.02, 0.025, 0.035], head, 18));
                            K.on(spot, 'glow', q => lensDome(q, add(c1, mul(n, rr * 0.2 - 0.0006)), n, rr * 0.3, Math.max(rr * 0.12, 0.0009), pal.glow, head, 10));
                        }
                    }
                    // Hinge bosses and the strap.
                    for (const sd of [1, -1]) { const at = K.at(sd * (side - 0.006), E); K.on(at, 'dark', q => cylinder(q, add(at.p, mul(at.n, -0.001)), add(at.p, mul(at.n, 0.003)), 0.0048, 14, hw(pal, 0.6), head)); }
                    strap(mesh, L, t => K.F.worldY(mix(E, E + 0.35 * s, smooth(0, 0.6, t))), Math.min(1.25, side / K.F.Rref + 0.08), 0.016, 0.0022, style === 'chrome' ? scaleRgb(pal.plate, 0.85) : [0.05, 0.05, 0.05], head);
                }
            };
        });
    }

    /** HUD monocle: a bezel round one eye holding a lens with a projected reticle, its emitter at the temple. */
    function hudMonocle(_m, L, o) {
        const C = context(L, o), { F, s, pal, style, mesh, head, k } = C, sd = o.side === 'left' ? 1 : -1, E = sd > 0 ? L.eyeL : L.eyeR;
        const r = E.radius * 1.55, c = add(E.center, [sd * r * 0.05, 0, E.radius * 1.05 + 0.008]), n = norm([sd * 0.1, 0.03, 1]);
        const lens = newMesh(), pics = hardwarePics(o, pal, L.textures);
        const lp = bakeLens(designKey('monocleLens', o, F), 192, 192, (u, v, out) => { out.tint = style === 'military' ? linear('#ffb070') : scaleRgb(pal.glow, 0.5); out.glow = readout('reticle', u, 1 - v, 1, 4, style); }, L.textures);
        lensPlate(lens, c, n, [1, 0, 0], r * 0.96, r * 0.96, 0.0015, [1, 1, 1], head, 4, 32, 2);
        const fa = frameAxes(n);
        const bez = style === 'chrome' ? [0.92, 0.93, 0.95] : pal.plate;
        mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => q.loft(4, (i, t) => ({ center: add(c, mul(n, (t - 0.6) * 0.007)), x: fa.x, y: fa.y, rx: r + 0.0022 + (i === 1 || i === 2 ? 0.0012 : 0), ry: r + 0.0022 + (i === 1 || i === 2 ? 0.0012 : 0) }), 36, bez, head, false));
        mesh.with(style === 'chrome' ? 'chrome' : 'steel', q => { ring(q, add(c, mul(n, 0.0018)), n, r + 0.0006, 0.0011, hw(pal, 1.2), head, 36, 6); ring(q, add(c, mul(n, -0.004)), n, r + 0.0012, 0.0009, hw(pal, 1.1), head, 36, 5); });
        // Notches round the bezel, a light at the top.
        for (let j = 0; j < 8; j++) { const a = j / 8 * Math.PI * 2, p = add(c, add(mul(fa.x, Math.cos(a) * (r + 0.0036)), mul(fa.y, Math.sin(a) * (r + 0.0036)))); mesh.with('dark', q => slab(q, p, [norm(sub(p, c)), cross(n, norm(sub(p, c))), n], [0.0012, 0.0008, 0.002], 0.0004, hw(pal, 0.6), head, 1)); }
        mesh.with('glow', q => q.sphere(add(c, add(mul(fa.y, r + 0.0034), mul(n, 0.0025))), 0.0011, pal.glow, head, 4, 8));
        // The emitter at the temple and the arm to the bezel.
        const baseR = F.base(0.001, 0.004), tx = sd * Math.min(2.6 * s, k.side - 0.3 * s), tf = F.frame(baseR, tx, k.E + 0.15 * s);
        const em = add(tf.p, mul(tf.n, 0.004));
        mesh.with('dark', q => slab(q, em, [tf.y, tf.n, cross(tf.y, tf.n)].map(norm), [0.0075, 0.0045, 0.012], 0.003, hw(pal, 0.55), head));
        const lensSide = add(c, mul([sd, 0, 0], r + 0.003)), arm = [add(em, mul([sd, 0, 0], -0.003)), add(lerp(em, lensSide, 0.5), mul(tf.n, 0.004)), lensSide];
        mesh.with(style === 'chrome' ? 'chrome' : 'paint', q => q.tube(arm, 0.0016, 8, bez, head, true));
        mesh.with('glow', q => lensDome(q, add(em, mul(norm(sub(c, em)), 0.006)), norm(sub(c, em)), 0.0016, 0.0008, pal.glow, head, 10));
        if (style === 'military') mesh.with('steel', q => { bolt(q, add(em, mul(tf.n, 0.0045)), tf.n, 0.0013, hw(pal, 1.2), head); });
        if (style === 'salvaged') cable(mesh, [add(em, [0, -0.004, -0.004]), add(em, [sd * 0.008, -0.02, -0.025]), add(em, [sd * 0.01, -0.04, -0.05])], 0.0011, [0.7, 0.15, 0.1], head);
        lens.computeNormals(); mesh.computeNormals();
        return [{ mesh, extra: platingExtra('HUD monocle', pics, pal, o) }, { mesh: lens, extra: lensExtra('HUD monocle lens', lp, pal, o, 0.34) }];
    }

    /** Ear scouter: a unit over one ear, an arm along the temple to a single angled lens before the eye. */
    function earScouter(_m, L, o) {
        const C = context(L, o), { F, s, pal, style, mesh, head } = C, sd = o.side === 'right' ? -1 : 1, E = sd > 0 ? L.eyeL : L.eyeR, ear = sd > 0 ? L.earL : L.earR;
        const lens = newMesh(), pics = hardwarePics(o, pal, L.textures);
        const ec = ear ? ear.center : add(E.center, [sd * 0.06, 0, -0.08]);
        const unit = aroundHead(L, ec[1] + 0.01, sd * 1.72, 0.008);
        const ax = norm(sub(unit, [0, unit[1], L.ring(unit[1]).center[2]]));
        const fwd = [0, 0, 1], up = [0, 1, 0];
        mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => slab(q, add(unit, [0, 0.004, -0.004]), [norm(cross(up, ax)), up, ax], [0.016, 0.022, 0.006], 0.005, style === 'chrome' ? [0.92, 0.93, 0.95] : pal.plate, head, 3));
        mesh.with(style === 'chrome' ? 'chrome' : 'dark', q => cylinder(q, add(unit, mul(ax, 0.004)), add(unit, mul(ax, 0.009)), 0.009, 18, hw(pal, 0.8), head));
        mesh.with('glow', q => ring(q, add(unit, mul(ax, 0.0092)), ax, 0.0065, 0.0008, pal.glow, head, 18, 4));
        // The arm: forward along the temple, then in front of the eye.
        const lensC = add(E.center, [sd * 0.008, 0.002, E.radius * 1.05 + 0.016]);
        const temple = aroundHead(L, E.center[1] + 0.012, sd * 1.15, 0.005);
        // The arm leaves the unit at a hinge boss on its face and runs in one smooth curve to the lens frame's outer edge.
        const n = norm([sd * -0.35, 0, 1]), w = E.radius * 1.5, h = E.radius * 1.15;
        const fa0 = norm(sub([sd, 0.25, 0], mul(n, dot([sd, 0.25, 0], n)))), lensEdge = add(lensC, mul(fa0, w + 0.0012));
        const hinge = add(unit, add(mul(ax, 0.0075), [0, 0.012, 0.008]));
        mesh.with('dark', q => cylinder(q, add(hinge, mul(ax, -0.004)), add(hinge, mul(ax, 0.0035)), 0.0042, 14, hw(pal, 0.7), head));
        const via = [hinge, aroundHead(L, (hinge[1] + E.center[1] + 0.012) / 2, sd * 1.4, 0.011), aroundHead(L, E.center[1] + 0.012, sd * 1.15, 0.007), lensEdge];
        const armPath = [];
        for (let k = 0; k + 1 < via.length; k++) for (let j = 0; j < 5; j++) { const t = j / 5, a = via[Math.max(0, k - 1)], b = via[k], c2 = via[k + 1], d = via[Math.min(via.length - 1, k + 2)], t2 = t * t, t3 = t2 * t; armPath.push([0, 1, 2].map(i => 0.5 * (2 * b[i] + (c2[i] - a[i]) * t + (2 * a[i] - 5 * b[i] + 4 * c2[i] - d[i]) * t2 + (3 * b[i] - a[i] - 3 * c2[i] + d[i]) * t3))); }
        armPath.push(lensEdge);
        mesh.with(style === 'chrome' ? 'chrome' : 'paint', q => q.tube(armPath, style === 'military' ? 0.0024 : 0.0017, 8, style === 'chrome' ? [0.85, 0.86, 0.88] : hw(pal, 1), head, true));
        // A military unit's whip antenna stands from the unit's top, not loose at the temple.
        const top = add(unit, [0, 0.026, -0.004]);
        if (style === 'military') mesh.with('dark', q => cylinder(q, add(top, [0, -0.004, 0]), add(top, [0, 0.03, -0.01]), 0.0009, 6, [0.08, 0.08, 0.08], head, 0.0004));
        lensPlate(lens, lensC, n, [sd, 0.25, 0], w, h, 0.0008, [1, 1, 1], head, 3, 28, 6);
        const lp = bakeLens(designKey('scouterLens', o, F), 192, 160, (u, v, out) => { out.tint = scaleRgb(pal.glow, style === 'chrome' ? 0.35 : 0.6); out.glow = Math.max(readout('scouter', u * 1.3, 1 - v, 1.3, 5, style), (1 - smooth(0, 0.05, Math.min(u, 1 - u, v, 1 - v))) * 0.6); }, L.textures);
        const fa = norm(sub([sd, 0.25, 0], mul(n, dot([sd, 0.25, 0], n)))), fb = cross(n, fa), edge = Array.from({ length: 33 }, (_, j) => { const a = j / 32 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), kk = Math.pow(Math.pow(Math.abs(ca), 6) + Math.pow(Math.abs(sa), 6), -1 / 6); return add(lensC, add(mul(fa, ca * kk * (w + 0.0008)), mul(fb, sa * kk * (h + 0.0008)))); });
        mesh.with(style === 'chrome' ? 'chrome' : 'dark', q => q.tube(edge, 0.0011, 6, hw(pal, 0.9), head, false));
        void fwd; void s;
        lens.computeNormals(); mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Ear scouter', pics, pal, o) }, { mesh: lens, extra: lensExtra('Ear scouter lens', lp, pal, o, 0.5) }];
    }

    /** Halo projector: a band round the head with emitters casting a ring of light that floats above it. */
    function haloProjector(_m, L, o) {
        const C = context(L, o), { F, s, pal, style, mesh, head, k } = C;
        const lens = newMesh(), pics = hardwarePics(o, pal, L.textures);
        const yb = L.eyeY + (L.crown - L.eyeY) * 0.58;
        const band = [];
        for (let j = 0; j <= 48; j++) band.push(aroundHead(L, yb + 0.004 * Math.cos(j / 48 * Math.PI * 2), j / 48 * Math.PI * 2, 0.002));
        const bandCol = style === 'chrome' ? [0.92, 0.93, 0.95] : pal.plate;
        mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => q.loft(band.length, i => {
            const a = band[Math.max(0, i - 1)], b = band[Math.min(band.length - 1, i + 1)], d = norm(sub(b, a)), R = L.ring(yb) || L.ring(L.eyeY), out = norm([band[i][0] - R.center[0], 0, band[i][2] - R.center[2]]);
            return { center: band[i], x: norm(cross(out, d)), y: out, rx: style === 'military' ? 0.0045 : 0.0032, ry: 0.0013 };
        }, 8, bandCol, head, false));
        const R = L.ring(yb) || L.ring(L.eyeY), cx = R.center[0], cz = R.center[2] - 0.004, rr = Math.max(R.rx, R.rz) + 0.025, hy = L.crown + 0.012;
        // Emitters: front and either side, each with a beam up to the ring.
        const emitters = [0, 2.1, -2.1];
        for (const a of emitters) {
            const p = aroundHead(L, yb, a, 0.0035), out = norm([Math.sin(a), 0, Math.cos(a)]);
            mesh.with('dark', q => slab(q, p, [norm(cross([0, 1, 0], out)), [0, 1, 0], out], [0.0055, 0.0045, 0.0028], 0.0018, hw(pal, 0.6), head));
            mesh.with('glow', q => lensDome(q, add(p, [0, 0.0044, 0]), [0, 1, 0], 0.0022, 0.0012, pal.glow, head, 10));
            const top = [cx + Math.sin(a) * rr, hy, cz + Math.cos(a) * rr], fa = frameAxes(norm(sub(top, p)));
            lens.state.uv = [0.02, 0.5];
            lens.loft(2, (i, t) => ({ center: lerp(add(p, [0, 0.006, 0]), top, t), x: fa.x, y: fa.y, rx: 0.0008 + t * 0.0025, ry: 0.0008 + t * 0.0025 }), 8, [1, 1, 1], head, false);
        }
        // The ring: a ribbon of light, tilted back a little.
        const tilt = 0.12;
        sheet(lens, 2, 72, (u, v) => { const a = u * Math.PI * 2, z = Math.cos(a) * rr; return [cx + Math.sin(a) * rr, hy + (v - 0.5) * 0.012 - z * tilt + 0.004 * Math.sin(a * 3), cz + z]; }, [1, 1, 1], head, (u, v) => [u, v]);
        const lp = bakeLens(designKey('haloLens', o, F), 512, 32, (u, v, out) => {
            out.tint = scaleRgb(pal.glow, 0.6);
            const seg = fract(u * 24), cell = Math.floor(u * 24);
            let g = (1 - smooth(0.0, 0.25, Math.min(v, 1 - v))) * 0.9;
            if (seg > 0.12 && seg < 0.88 && Math.abs(v - 0.5) < 0.22) g = Math.max(g, glyphInk(String(cell % 10), (seg - 0.12) / 0.76 * 3.2, (0.72 - v) / 0.44 * 5, [0, 0], 5) ? 0.95 : 0.12);
            if (u < 0.04) g = 0.5;
            out.glow = g;
        }, L.textures);
        lens.computeNormals(); mesh.computeNormals();
        void F; void s;
        return [{ mesh, extra: platingExtra('Halo projector', pics, pal, o) }, { mesh: lens, extra: lensExtra('Halo light', lp, pal, o, 0.35) }];
    }

    /** Face shield: a clear shield from brow to chin on a headband, hinged at the temples, readouts at its edges. */
    function faceShield(_m, L, o) {
        const C = context(L, o), { F, s, pal, style, mesh, head, k } = C, { E, CB } = k;
        const lens = newMesh(), pics = hardwarePics(o, pal, L.textures);
        const R = L.ring(L.eyeY) || { center: [0, L.eyeY, 0], rx: 0.075, rz: 0.095 }, cx = R.center[0], cz = R.center[2];
        const ytop = F.point(0, E + 1.25 * s, F.Rref)[1], ybot = F.point(0, CB - 0.25 * s, F.Rref)[1];
        const a = R.rx + 0.03, b = Math.max(L.noseTip[2] - cz + 0.024, R.rz + 0.02), th = 1.2;
        const at = (u, v) => { const t = (u * 2 - 1) * th, y = mix(ytop, ybot, v), bulge = 1 + 0.05 * Math.sin(v * Math.PI); return [cx + Math.sin(t) * a * bulge, y, cz + Math.cos(t) * b * bulge + v * 0.012]; };
        sheet(lens, 14, 36, at, [1, 1, 1], head);
        const aspect = (2 * th * (a + b) / 2) / (ytop - ybot);
        const lp = bakeLens(designKey('shieldLens', o, F), 384, 256, (u, v, out) => { out.tint = style === 'military' ? linear('#c0a070') : style === 'glow' ? mixRgb([1, 1, 1], pal.glow, 0.3) : linear('#d6e6ee'); out.glow = Math.max(readout('shield', u * aspect, 1 - v, aspect, 6, style), (1 - smooth(0, 0.02, Math.min(u, 1 - u, v, 1 - v))) * (style === 'glow' ? 0.9 : 0.3)); }, L.textures);
        const rimCol = style === 'chrome' ? [0.92, 0.93, 0.95] : pal.plate;
        const edge = (v0, v1, u0, u1, n) => Array.from({ length: n + 1 }, (_, j) => at(mix(u0, u1, j / n), mix(v0, v1, j / n)));
        mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => q.tube(edge(0, 0, 0, 1, 30).map(p => add(p, [0, 0.003, 0])), style === 'military' ? 0.005 : 0.0038, 10, rimCol, head, true));
        if (style !== 'glow') mesh.with(style === 'chrome' ? 'chrome' : 'dark', q => q.tube(edge(1, 1, 0, 1, 30), 0.0012, 6, hw(pal, 0.9), head, true));
        for (const u of [0, 1]) mesh.with(style === 'chrome' ? 'chrome' : 'paint', q => q.tube(edge(0, 1, u, u, 12), 0.0026, 8, rimCol, head, true));
        // The headband and the hinge pods.
        const yb = Math.min(ytop + 0.004, L.crown - 0.04), band = [];
        for (let j = 0; j <= 40; j++) band.push(aroundHead(L, yb, j / 40 * Math.PI * 2, 0.002));
        mesh.with(style === 'military' ? 'rubber' : 'paint', q => q.loft(band.length, i => { const p = band[i], d = norm(sub(band[Math.min(band.length - 1, i + 1)], band[Math.max(0, i - 1)])), out = norm([p[0] - cx, 0, p[2] - cz]); return { center: p, x: norm(cross(out, d)), y: out, rx: 0.0065, ry: 0.0016 }; }, 8, style === 'military' ? [0.06, 0.06, 0.06] : rimCol, head, false));
        for (const u of [0, 1]) {
            const p = at(u, 0.02), out = norm([p[0] - cx, 0, p[2] - cz]);
            mesh.with('dark', q => cylinder(q, add(p, mul(out, -0.004)), add(p, mul(out, 0.006)), 0.0075, 18, hw(pal, 0.6), head));
            mesh.with('glow', q => ring(q, add(p, mul(out, 0.0061)), out, 0.005, 0.0007, pal.glow, head, 16, 4));
        }
        lens.computeNormals(); mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Face shield frame', pics, pal, o) }, { mesh: lens, extra: lensExtra('Face shield', lp, pal, o, 0.24) }];
    }

    // ── implants ──────────────────────────────────────────────────────────
    /** The sides an implant is on: ['left'] → [1], ['both'] → [1, -1]. */
    const sidesOf = o => (o.sides === 'left' ? [1] : o.sides === 'right' ? [-1] : [1, -1]);
    /** The outermost surface (skin or what is worn) behind/ahead of the body near (x, y): z of the back (dir -1) or the front (+1). */
    function surfaceZ(L, x, y, dir) {
        // A ray along z at (x, y) from the far side: the first skin or cloth it meets.
        let z = dir > 0 ? -Infinity : Infinity;
        const cast = (P, I) => {
            for (let t = 0; t < I.length; t += 3) {
                const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
                const ax = P[a], ay = P[a + 1], bx = P[b], by = P[b + 1], cx = P[c], cy = P[c + 1];
                if ((ax < x && bx < x && cx < x) || (ax > x && bx > x && cx > x) || (ay < y && by < y && cy < y) || (ay > y && by > y && cy > y)) continue;
                const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
                if (Math.abs(det) < 1e-14) continue;
                const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, v = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det;
                if (u < -1e-6 || v < -1e-6 || u + v > 1 + 1e-6) continue;
                const zz = u * P[a + 2] + v * P[b + 2] + (1 - u - v) * P[c + 2];
                z = dir > 0 ? Math.max(z, zz) : Math.min(z, zz);
            }
        };
        cast(L.bodyPart.positions, L.bodyPart.index);
        for (const p of L.outfitParts || []) if (p.index) cast(p.positions, p.index);
        return z;
    }
    /** A socket set into the skin: a bezel, a dark well with pins, a light ring; returns its mouth. */
    function socket(m, p, n, r, pal, style, skin, mode, src) {
        const keep = Object.assign({}, m.state); m.state.mode = mode || RIGID; m.state.src = src ?? -1;
        const fa = frameAxes(n), out = add(p, mul(n, 0.0018));
        m.state.uv = swatchUV(style === 'chrome' ? 'chrome' : style === 'salvaged' ? 'steel' : 'dark');
        m.loft(4, (i, t) => ({ center: add(p, mul(n, [-0.0012, 0.0012, 0.0018, 0.0016][i])), x: fa.x, y: fa.y, rx: [r * 1.15, r * 1.12, r * 0.95, r * 0.7][i], ry: [r * 1.15, r * 1.12, r * 0.95, r * 0.7][i] }), 20, style === 'chrome' ? [0.92, 0.93, 0.95] : hw(pal, 1), skin, true);
        m.state.uv = swatchUV('rubber');
        m.loft(2, (i, t) => ({ center: add(p, mul(n, 0.0017 - t * 0.0009)), x: fa.x, y: fa.y, rx: r * 0.66, ry: r * 0.66 }), 16, [0.02, 0.02, 0.02], skin, true);
        m.state.uv = swatchUV('brass');
        for (let j = 0; j < 4; j++) { const a = j / 4 * Math.PI * 2 + 0.4, c = add(add(p, mul(n, 0.0009)), add(mul(fa.x, Math.cos(a) * r * 0.32), mul(fa.y, Math.sin(a) * r * 0.32))); m.loft(2, (i, t) => ({ center: add(c, mul(n, t * 0.0008)), x: fa.x, y: fa.y, rx: r * 0.07, ry: r * 0.07 }), 6, [0.95, 0.75, 0.35], skin, true); }
        m.state.uv = swatchUV('glow');
        ring(m, add(p, mul(n, 0.00125)), n, r * 1.03, Math.max(0.0004, r * 0.07), pal.glow, skin, 24, 4);
        m.state = keep;
        return out;
    }
    /** A plug in a socket and its cable away along `path` (points), skinned by `skinOf`. */
    function plugged(m, mouth, n, r, path, pal, style, skin, cableSkin) {
        const end = add(mouth, mul(n, 0.008)), fa = frameAxes(n);
        m.with(style === 'chrome' ? 'gloss' : 'paint', q => q.loft(5, (i, t) => ({ center: lerp(add(mouth, mul(n, -0.0006)), end, t), x: fa.x, y: fa.y, rx: r * [0.62, 0.8, 0.8, 0.7, 0.5][i], ry: r * [0.62, 0.8, 0.8, 0.7, 0.5][i] }), 12, style === 'chrome' ? [0.92, 0.93, 0.95] : hw(pal, 0.8), skin, true));
        if (style === 'glow') m.with('glow', q => ring(q, lerp(mouth, end, 0.55), n, r * 0.81, 0.0005, pal.glow, skin, 14, 4));
        const pts2 = [end].concat(path);
        const cr = style === 'military' ? 0.0022 : style === 'salvaged' ? 0.0013 : 0.0016;
        cable(m, pts2, cr, style === 'chrome' ? [0.9, 0.9, 0.92] : style === 'glow' ? scaleRgb(pal.glow, 0.9) : style === 'salvaged' ? [0.55, 0.12, 0.08] : [0.05, 0.05, 0.05], cableSkin, 8, style === 'glow' ? 'glow' : style === 'chrome' ? 'gloss' : 'rubber');
        if (style === 'salvaged') cable(m, pts2.map((p, i) => add(p, [0.0012 * Math.sin(i * 1.7), 0.0016, 0.001])), 0.0008, [0.8, 0.7, 0.15], cableSkin, 6, 'rubber');
    }

    /** Temple jacks: data ports set in the temples, plugged with cables that run back over the ears and down the neck. */
    function templeJacks(_m, L, o) {
        const C = context(L, o), { F, s, pal, style, mesh, head, k } = C, pics = hardwarePics(o, pal, L.textures), spine = C.P.spineSkin(L);
        const skinBase = F.base(0.0002, 0);
        for (const sd of sidesOf(o)) {
            const X = sd * Math.min(2.45 * s, k.side - 0.5 * s), Y = k.E + 0.38 * s, fr = F.frame(skinBase, X, Y, 0);
            const r = style === 'military' ? 0.0066 : 0.0058, mouth = socket(mesh, fr.p, fr.n, r, pal, style, head);
            if (style === 'military') for (let j = 0; j < 4; j++) { const a = j / 4 * Math.PI * 2 + Math.PI / 4, fa = frameAxes(fr.n), p = add(fr.p, add(mul(fa.x, Math.cos(a) * r * 1.6), mul(fa.y, Math.sin(a) * r * 1.6))); mesh.with('steel', q => bolt(q, p, fr.n, 0.0011, hw(pal, 1.2), head)); }
            if (o.cables !== false) {
                const ear = sd > 0 ? L.earL : L.earR, ey = ear ? ear.center[1] : L.eyeY - 0.01, top = ear ? Math.max(...[ear.center[1] + 0.03, ear.outer[1]]) : ey + 0.03, neckY = (L.chin + L.neck.center[1]) / 2;
                const back = surfaceZ(L, sd * 0.045, L.neck.center[1] - 0.035, -1);
                const down = [0.25, 0.5, 0.75, 1].map(t => { const y = mix(ey - 0.012, L.neck.center[1] + 0.012, t); return aroundHead(L, y, sd * mix(2.4, 2.55, t), 0.004, [0, y, mix(L.ring(L.eyeY).center[2], L.neck.center[2], smooth(0, 0.6, t))]); });
                const path = [aroundHead(L, fr.p[1] + 0.004, sd * 1.3, 0.006), aroundHead(L, top + 0.006, sd * 1.6, 0.005), aroundHead(L, top, sd * 2.05, 0.005), aroundHead(L, ey, sd * 2.35, 0.004),
                    ...down, [sd * 0.045, L.neck.center[1] - 0.035, (Number.isFinite(back) ? back : L.neck.center[2] - L.neck.rz) - 0.004]];
                plugged(mesh, mouth, fr.n, r, path, pal, style, head, spine);
            }
        }
        mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Temple jacks', pics, pal, o) }];
    }

    /** Neck jack: a port in the side of the neck with its plug and a cable down the back. */
    function neckJack(_m, L, o) {
        const C = context(L, o), { pal, style, mesh } = C, pics = hardwarePics(o, pal, L.textures), spine = C.P.spineSkin(L), sd = o.side === 'right' ? -1 : 1;
        const y = L.neck.center[1] + Math.max(0.035, (L.chin - L.neck.center[1]) * 0.6), sec = L.neckSection(y), ang = sd * 2.4;
        const p = sec.at(ang, 0.0002), n = norm([Math.sin(ang), 0.15, Math.cos(ang)]);
        const neckSkin = C.P.rigid(L.boneIndex('Neck')), r = style === 'military' ? 0.0062 : 0.0052;
        const mouth = socket(mesh, p, n, r, pal, style, neckSkin);
        if (style === 'military' || style === 'salvaged') { const fa = frameAxes(n); for (let j = 0; j < 3; j++) { const a = j / 3 * Math.PI * 2, q2 = add(p, add(mul(fa.x, Math.cos(a) * r * 1.65), mul(fa.y, Math.sin(a) * r * 1.65))); mesh.with('steel', q => (style === 'military' ? bolt(q, q2, n, 0.0011, hw(pal, 1.2), neckSkin) : rivet(q, q2, n, 0.001, [0.7, 0.7, 0.7], neckSkin))); } }
        const back = surfaceZ(L, sd * 0.03, L.neck.center[1] - 0.05, -1);
        const path = [aroundHead(L, y - 0.02, sd * 2.5, 0.006, L.neckSection(y - 0.02).center), aroundHead(L, L.neck.center[1] + 0.005, sd * 2.75, 0.006, L.neckSection(L.neck.center[1] + 0.005).center), [sd * 0.03, L.neck.center[1] - 0.05, (Number.isFinite(back) ? back : p[2] - 0.05) - 0.004], [sd * 0.025, L.neck.center[1] - 0.1, (Number.isFinite(back) ? back : p[2] - 0.05) - 0.002]];
        plugged(mesh, mouth, n, r, path, pal, style, neckSkin, spine);
        mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Neck jack', pics, pal, o) }];
    }

    /** Spinal column: armored vertebrae down the nape and upper back, over whatever is worn, joined by a glowing spine. */
    function spineImplant(_m, L, o) {
        const C = context(L, o), { pal, style, mesh } = C, pics = hardwarePics(o, pal, L.textures), spine = C.P.spineSkin(L);
        const top = L.bone('Head').head[1] - 0.012, bottom = L.neck.center[1] - 0.16;
        const n = Math.max(5, Math.round((top - bottom) / 0.027)), spots = [];
        for (let j = 0; j <= n; j++) {
            const y = mix(top, bottom, j / n), z = surfaceZ(L, 0, y, -1);
            spots.push([0, y, (Number.isFinite(z) ? z : L.neck.center[2] - L.neck.rz) - 0.002]);
        }
        const plate = style === 'chrome' ? [0.93, 0.94, 0.95] : pal.plate;
        // The spine line through them.
        const line = spots.map(p => add(p, [0, 0, -0.004]));
        cable(mesh, line, style === 'military' ? 0.0026 : 0.002, style === 'glow' ? pal.glow : style === 'chrome' ? [0.85, 0.86, 0.88] : [0.08, 0.08, 0.08], spine, 6, style === 'glow' ? 'glow' : style === 'chrome' ? 'chrome' : 'rubber');
        for (let j = 0; j < spots.length; j++) {
            const p = spots[j], a = spots[Math.max(0, j - 1)], b = spots[Math.min(spots.length - 1, j + 1)], t = norm(sub(a, b)), nb = norm(cross([1, 0, 0], t));
            const back = nb[2] < 0 ? nb : mul(nb, -1), w = mix(0.014, 0.022, j / n), hgt = 0.0095;
            const c = add(p, mul(back, 0.0045));
            const axes = [[1, 0, 0], t, back];
            mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => slab(q, c, axes, [w * 0.55, hgt, 0.0048], style === 'military' ? 0.0014 : 0.0032, plate, spine, 1));
            // The wings: one bar across behind the body of the vertebra, its ends showing either side.
            const wing = add(c, add(mul(back, -0.0015), mul(t, -0.0015))), odd = style === 'salvaged' && j % 3 === 0;
            mesh.with(style === 'chrome' ? 'chrome' : odd ? 'steel' : 'paint', q => slab(q, wing, [[1, 0, 0], t, back], [w * 1.45, hgt * 0.5, 0.0028], 0.0012, odd ? [0.6, 0.6, 0.6] : scaleRgb(plate, 0.85), spine, 1));
            if (style === 'military' && j % 2 === 0) for (const sd of [1, -1]) mesh.with('steel', q => bolt(q, add(add(wing, mul([1, 0, 0], sd * w * 1.15)), mul(back, 0.0027)), back, 0.0009, hw(pal, 1.25), spine));
            const light = add(c, mul(back, 0.0043));
            if (style === 'glow' || style === 'chrome') mesh.with('glow', q => q.box(light, axes, [0.0012, hgt * 0.6, 0.0005], pal.glow, spine));
            else mesh.with('glow', q => q.sphere(light, 0.001, pal.glow, spine, 4, 8));
        }
        if (style === 'salvaged') for (const sd of [1, -1]) cable(mesh, spots.filter((_, i) => i % 2 === 0).map((p, i) => add(p, [sd * (0.026 + 0.003 * Math.sin(i * 2.1)), 0, -0.003])), 0.0011, sd > 0 ? [0.6, 0.1, 0.08] : [0.1, 0.25, 0.6], spine, 4);
        mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Spinal column', pics, pal, o) }];
    }

    /** Chest core: a glowing reactor set in the breastbone, in a housing of the item's style, under a glass dome. */
    function chestCore(_m, L, o) {
        const C = context(L, o), { F, pal, style, mesh } = C, pics = hardwarePics(o, pal, L.textures), skin = C.P.rigid(L.boneIndex('Spine2'));
        const y = L.neck.center[1] - 0.14, z0 = surfaceZ(L, 0, y, 1), zu = surfaceZ(L, 0, y + 0.02, 1), zd = surfaceZ(L, 0, y - 0.02, 1);
        const n = norm([0, Number.isFinite(zu) && Number.isFinite(zd) ? -(zu - zd) / 0.04 : 0, 1]), c = [0, y, (Number.isFinite(z0) ? z0 : 0.1) + 0.001];
        const fa = frameAxes(n, [1, 0, 0]), R = style === 'glow' ? 0.034 : 0.03;
        const plate = style === 'chrome' ? [0.93, 0.94, 0.95] : pal.plate, sides = style === 'military' ? 6 : 36;
        // Housing: a flange on the chest, a raised rim, the well.
        mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => q.loft(5, (i, t) => ({ center: add(c, mul(n, [-0.002, 0.002, 0.0055, 0.007, 0.0055][i])), x: fa.x, y: fa.y, rx: R * [1.08, 1.06, 0.98, 0.86, 0.74][i], ry: R * [1.08, 1.06, 0.98, 0.86, 0.74][i] }), sides, plate, skin, false));
        mesh.with('dark', q => q.loft(2, (i, t) => ({ center: add(c, mul(n, 0.0055 - t * 0.004)), x: fa.x, y: fa.y, rx: R * 0.74, ry: R * 0.74 }), 32, [0.02, 0.02, 0.025], skin, true));
        // The core and its vanes.
        mesh.with('glow', q => { lensDome(q, add(c, mul(n, 0.0016)), n, R * 0.42, 0.005, pal.glow, skin, 24); ring(q, add(c, mul(n, 0.002)), n, R * 0.6, 0.0016, pal.glow, skin, 32, 5); });
        const vanes = style === 'military' ? 6 : style === 'salvaged' ? 5 : 10;
        for (let j = 0; j < vanes; j++) {
            const a = j / vanes * Math.PI * 2 + 0.2, d = add(mul(fa.x, Math.cos(a)), mul(fa.y, Math.sin(a))), p = add(add(c, mul(n, 0.0028)), mul(d, R * 0.6));
            mesh.with(style === 'chrome' ? 'chrome' : 'steel', q => slab(q, p, [d, cross(n, d), n], [R * 0.13, 0.0011, 0.0016], 0.0005, hw(pal, 1.15), skin, 1));
        }
        if (style === 'military') for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2, p = add(add(c, mul(n, 0.0056)), add(mul(fa.x, Math.cos(a) * R * 0.92), mul(fa.y, Math.sin(a) * R * 0.92))); mesh.with('steel', q => bolt(q, p, n, 0.0016, hw(pal, 1.25), skin)); }
        if (style === 'chrome') mesh.with('chrome', q => ring(q, add(c, mul(n, 0.0072)), n, R * 0.8, 0.0012, [0.9, 0.9, 0.92], skin, 40, 6));
        if (style === 'glow') for (let j = 0; j < 3; j++) mesh.with('glow', q => ring(q, add(c, mul(n, 0.0058 + j * 0.0004)), n, R * (1.15 + j * 0.12), 0.0005, pal.glow, skin, 40, 4));
        if (style === 'salvaged') {
            for (let j = 0; j < 4; j++) { const a = j * 1.7 + 0.5, d = add(mul(fa.x, Math.cos(a)), mul(fa.y, Math.sin(a))), p0 = add(add(c, mul(n, 0.004)), mul(d, R * 0.95)), on = q => { const zz = surfaceZ(L, q[0], q[1], 1); return [q[0], q[1], (Number.isFinite(zz) ? zz : q[2]) + 0.0015]; }; cable(mesh, [p0, on(add(p0, mul(d, 0.02))), on(add(p0, mul(d, 0.045))), on(add(p0, mul(d, 0.07)))], 0.0012, [[0.6, 0.1, 0.08], [0.1, 0.3, 0.6], [0.75, 0.65, 0.1], [0.08, 0.08, 0.08]][j], skin, 6); }
            for (let j = 0; j < 7; j++) { const a = j / 7 * Math.PI * 2 + 0.3, p = add(add(c, mul(n, 0.0057)), add(mul(fa.x, Math.cos(a) * R * 0.92), mul(fa.y, Math.sin(a) * R * 0.92))); mesh.with(j % 2 ? 'brass' : 'steel', q => rivet(q, p, n, 0.0012, j % 2 ? [0.8, 0.6, 0.3] : [0.65, 0.65, 0.66], skin)); }
        }
        // The dome over it all.
        const glass = newMesh();
        lensDome(glass, add(c, mul(n, 0.0056)), n, R * 0.75, style === 'glow' ? 0.012 : 0.008, [1, 1, 1], skin, 32);
        glass.computeNormals(); mesh.computeNormals();
        const lp = bakeLens('coreDome|' + (o.style || '') + '|' + (o.color2 || ''), 16, 16, (u, v, out) => { out.tint = mixRgb([1, 1, 1], pal.glow, 0.35); out.glow = 0.06; }, L.textures);
        void F;
        return [{ mesh, extra: platingExtra('Chest core', pics, pal, o) }, { mesh: glass, extra: lensExtra('Chest core dome', lp, pal, o, 0.14) }];
    }

    /** Forearm screen: a curved display set along the outside of the forearm, readouts glowing, a data port at the wrist. */
    function forearmScreen(_m, L, o) {
        const C = context(L, o), { pal, style, mesh } = C, sd = o.side === 'right' ? -1 : 1, name = sd > 0 ? 'Left' : 'Right';
        const fore = L.bone(name + 'ForeArm'), hand = L.bone(name + 'Hand'), skin = C.P.rigid(L.boneIndex(name + 'ForeArm'));
        const a0 = fore.head, a1 = hand.head, d = norm(sub(a1, a0)), length = len(sub(a1, a0));
        const face = norm(sub([sd * 0.75, 0.15, 0.65], mul(d, dot([sd * 0.75, 0.15, 0.65], d)))), side2 = cross(d, face);
        // The arm's (or sleeve's) surface round the axis near the screen.
        // The arm's (or sleeve's) surface round the axis near the screen: rays out from the bone.
        const near = [];
        const gather = (P, I) => { for (let t = 0; t < I.length; t += 3) { let close = false; for (let k = 0; k < 3 && !close; k++) { const q = sub([P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]], a0), along = dot(q, d); close = along > -0.02 && along < length + 0.02 && len(sub(q, mul(d, along))) < 0.075; } if (close) for (let k = 0; k < 3; k++) near.push(P[I[t + k] * 3], P[I[t + k] * 3 + 1], P[I[t + k] * 3 + 2]); } };
        gather(L.bodyPart.positions, L.bodyPart.index); for (const p of L.outfitParts || []) if (p.index) gather(p.positions, p.index);
        const radius = (t, th) => {
            const o0 = lerp(a0, a1, t), dir = add(mul(face, Math.cos(th)), mul(side2, Math.sin(th))), hits = [];
            for (let k = 0; k < near.length; k += 9) {
                const e1 = [near[k + 3] - near[k], near[k + 4] - near[k + 1], near[k + 5] - near[k + 2]], e2 = [near[k + 6] - near[k], near[k + 7] - near[k + 1], near[k + 8] - near[k + 2]];
                const pv = cross(dir, e2), det = dot(e1, pv);
                if (Math.abs(det) < 1e-14) continue;
                const tv = [o0[0] - near[k], o0[1] - near[k + 1], o0[2] - near[k + 2]], u = dot(tv, pv) / det;
                if (u < 0 || u > 1) continue;
                const qv = cross(tv, e1), v = dot(dir, qv) / det;
                if (v < 0 || u + v > 1) continue;
                const hit = dot(e2, qv) / det;
                if (hit > 0 && hit < 0.12) hits.push(hit);
            }
            if (!hits.length) return 0.03;
            const first = Math.min(...hits);
            return Math.max(...hits.filter(h => h < first + 0.02));
        };
        const T0 = 0.3, T1 = 0.8, TH = 0.62, rows = 6, cols = 8, rad = [];
        for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) rad.push(radius(mix(T0, T1, j / rows), mix(-TH, TH, i / cols)));
        const rAt = (t, th) => { const j = clamp((t - T0) / (T1 - T0) * rows, 0, rows - 0.001), i = clamp((th + TH) / (2 * TH) * cols, 0, cols - 0.001); return bilinear(rad, cols + 1, rows + 1, i, j); };
        const pointAt = (t, th, off) => add(lerp(a0, a1, t), mul(add(mul(face, Math.cos(th)), mul(side2, Math.sin(th))), rAt(t, th) + off));
        const W = 2 * TH * 0.03, Hh = (T1 - T0) * length, bbox = [-W / 2, 0, W / 2, Hh], area = areaOf(bbox);
        const screen = (x, y) => shape.box([0, Hh * 0.5], W * 0.36, Hh * 0.4, 0.002)(x, y);
        const pics = bake(designKey('forearm', o, C.F, Math.round(Hh * 1000) + ''), 256, area, (X, Y, out) => {
            const sdf = screen(X, Y);
            if (sdf > 0) { out.col = style === 'chrome' ? [0.93, 0.94, 0.95] : pal.plate; out.rough = pal.s.rough; out.metal = pal.s.metal; if (sdf < 0.0009) { out.h -= 0.0002; out.col = scaleRgb(out.col, 0.6); } if (style === 'military' && glyphInk('C2', X, Y, [-W * 0.42, Hh * 0.03], 0.003)) out.col = [0.7, 0.67, 0.55]; return; }
            out.col = [0.01, 0.012, 0.016]; out.rough = 0.05; out.metal = 0;
            // The readouts run along the arm, read from the elbow toward the wrist.
            const u = 1 - (Y - Hh * 0.1) / (Hh * 0.8), v = (X + W * 0.36) / (W * 0.72) * (sd > 0 ? 1 : -1) + (sd > 0 ? 0 : 1);
            let g = 0;
            if (v > 0.68) g = Math.max(g, hud.fill(u, v, [0.5, 0.86], 0.42, 0.07) * (0.35 + 0.65 * (fract(u * 9) < 0.7 ? 1 : 0)) * (u < 0.15 + 0.7 * fbm(3.3, 1) ? 1 : 0.15));
            if (v > 0.3 && v < 0.62) { const f = 0.46 + 0.12 * Math.sin(u * 13) * fbm(u * 4, 2); g = Math.max(g, 1 - smooth(0.006, 0.02, Math.abs(v - f))); }
            if (v < 0.25) g = Math.max(g, glyphInk('38-12', u * 4.5, v * 4, [0.35, 0.15], 0.7) * 0.9);
            g = Math.max(g, hud.box(u, v, [0.5, 0.46], 0.47, 0.2, 0.012) * 0.4);
            out.glow = g * 0.95; if (g > 0.05) out.col = mixRgb(out.col, pal.glow, 0.5 * g);
        }, pal.s, L.textures);
        const uvAt = (t, th) => area.uv((th / TH) * W / 2, (t - T0) / (T1 - T0) * Hh);
        // The housing (a shallow shell with walls), then the glass a little proud of it.
        const shellRows = 10, shellCols = 12, firstTri = mesh.i.length;
        mesh.state.mode = RIGID;
        sheet(mesh, shellRows, shellCols, (u, v) => pointAt(mix(T0, T1, v), mix(-TH, TH, u), 0.0032), [1, 1, 1], skin, (u, v) => uvAt(mix(T0, T1, v), mix(-TH, TH, u)));
        const rimPts = [];
        for (let i = 0; i <= 40; i++) { const k2 = i / 40 * 4, side3 = Math.floor(k2) % 4, f = k2 - Math.floor(k2); const [u, v] = side3 === 0 ? [f, 0] : side3 === 1 ? [1, f] : side3 === 2 ? [1 - f, 1] : [0, 1 - f]; rimPts.push([u, v]); }
        for (let i = 0; i < rimPts.length - 1; i++) {
            const [u0, v0] = rimPts[i], [u1, v1] = rimPts[i + 1], t0 = mix(T0, T1, v0), t1 = mix(T0, T1, v1), h0 = mix(-TH, TH, u0), h1 = mix(-TH, TH, u1);
            mesh.state.uv = uvAt(t0, h0);
            const A = mesh.vertex(pointAt(t0, h0, 0.0032), [0, 0, 1], [1, 1, 1], skin), B = mesh.vertex(pointAt(t1, h1, 0.0032), [0, 0, 1], [1, 1, 1], skin), D = mesh.vertex(pointAt(t1, h1, -0.0015), [0, 0, 1], [1, 1, 1], skin), E2 = mesh.vertex(pointAt(t0, h0, -0.0015), [0, 0, 1], [1, 1, 1], skin);
            mesh.tri(A, E2, D); mesh.tri(A, D, B);
        }
        // Each face of the housing turned out from the arm (the rim's walls away from the screen's middle).
        const mid = pointAt((T0 + T1) / 2, 0, 0.003);
        for (let t = firstTri; t < mesh.i.length; t += 3) {
            const at = k => [mesh.p[mesh.i[t + k] * 3], mesh.p[mesh.i[t + k] * 3 + 1], mesh.p[mesh.i[t + k] * 3 + 2]], A = at(0), B = at(1), Cc = at(2);
            const n = cross(sub(B, A), sub(Cc, A)), c = mul(add(add(A, B), Cc), 1 / 3), q = sub(c, a0), along = dot(q, d);
            const radial = sub(q, mul(d, along)), side4 = sub(c, mid), wall = Math.abs(dot(n, norm(radial))) < len(n) * 0.5;
            if (dot(n, wall ? sub(side4, mul(norm(radial), dot(side4, norm(radial)))) : radial) < 0) { const v = mesh.i[t + 1]; mesh.i[t + 1] = mesh.i[t + 2]; mesh.i[t + 2] = v; }
        }
        // The data port at the wrist end.
        const wrist = pointAt(T1 + 0.06, 0, 0.0005), wn = norm(sub(wrist, lerp(a0, a1, T1 + 0.06)));
        socket(mesh, wrist, wn, 0.0042, pal, style, skin);
        if (style === 'military') for (const t of [T0 + 0.03, T1 - 0.03]) for (const th of [-TH + 0.08, TH - 0.08]) { const p = pointAt(t, th, 0.0032); mesh.with('steel', q => bolt(q, p, norm(sub(p, lerp(a0, a1, t))), 0.0011, hw(pal, 1.2), skin)); }
        if (style === 'salvaged') cable(mesh, [pointAt(T0 + 0.02, TH - 0.1, 0.004), pointAt(T0 - 0.1, TH + 0.2, 0.012), pointAt(T0 - 0.22, TH + 0.1, 0.006)], 0.0012, [0.6, 0.12, 0.08], skin);
        mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Forearm screen', pics, pal, o) }];
    }

    /** Under-eye lights: a row of small lights set in the skin under each eye, riding the cheeks. */
    function underEyeLights(_m, L, o) {
        const C = context(L, o), { F, s, pal, style, mesh, head, M } = C, pics = hardwarePics(o, pal, L.textures), skinBase = F.base(0.0001, 0);
        for (const Ey of [M.eyeL, M.eyeR]) {
            const sd = Math.sign(Ey.c[0]), n = style === 'glow' ? 3 : style === 'salvaged' ? 3 : 4;
            for (let j = 0; j < n; j++) {
                const t = n > 1 ? j / (n - 1) : 0.5, X = Ey.c[0] + sd * mix(-0.25, 0.55, t) * s, Y = Ey.c[1] - (0.66 - 0.12 * (t - 0.5) ** 2 * 4 + 0.05 * t) * s;
                const fr = F.frame(skinBase, X, Y, 0), src = F.srcAt(X, Y), spot = { mode: SKIN, src };
                const r = style === 'salvaged' ? [0.0014, 0.0011, 0.0017][j % 3] : 0.0012;
                const keep = Object.assign({}, mesh.state); mesh.state.mode = SKIN; mesh.state.src = src;
                if (style === 'glow') {
                    mesh.state.uv = swatchUV('glow');
                    const dir = norm(sub(F.on(skinBase, X + sd * 0.004, Y + 0.0012, 0), fr.p));
                    slab(mesh, add(fr.p, mul(fr.n, 0.0004)), [dir, cross(fr.n, dir), fr.n], [0.0034, 0.0007, 0.0006], 0.0005, pal.glow, head, 1);
                } else {
                    mesh.state.uv = swatchUV(style === 'chrome' ? 'chrome' : 'dark');
                    if (style === 'military') slab(mesh, add(fr.p, mul(fr.n, 0.0003)), [fr.x, fr.y, fr.n], [r * 1.25, r * 1.25, 0.0006], 0.0003, hw(pal, 0.7), head, 1);
                    else ring(mesh, add(fr.p, mul(fr.n, 0.0003)), fr.n, r * 1.05, 0.00045, style === 'chrome' ? [0.92, 0.93, 0.95] : [0.6, 0.6, 0.6], head, 14, 4);
                    mesh.state.uv = swatchUV('glow');
                    lensDome(mesh, add(fr.p, mul(fr.n, 0.0003)), fr.n, r * 0.85, 0.0007, pal.glow, head, 10);
                }
                mesh.state = keep;
                void spot;
            }
        }
        mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Under-eye lights', pics, pal, o) }];
    }

    /** Ear antennas: a base behind the ear and antennas swept back from it, lit at their tips. */
    function earAntennas(_m, L, o) {
        const C = context(L, o), { pal, style, mesh, head } = C, pics = hardwarePics(o, pal, L.textures);
        for (const sd of sidesOf(o)) {
            const ear = sd > 0 ? L.earL : L.earR, ey = ear ? ear.center[1] : L.eyeY - 0.01;
            const base = aroundHead(L, ey + 0.004, sd * 2.2, 0.001, null, true), out = norm([base[0] - (L.ring(ey) || L.ring(L.eyeY)).center[0], 0, base[2] - (L.ring(ey) || L.ring(L.eyeY)).center[2]]);
            const up = [0, 1, 0], back = norm(cross(up, out)).map(v => v * sd);
            const bb = back[2] > 0 ? mul(back, -1) : back;
            const plateCol = style === 'chrome' ? [0.93, 0.94, 0.95] : pal.plate;
            mesh.with(style === 'chrome' ? 'gloss' : 'paint', q => slab(q, add(base, mul(out, 0.003)), [bb, up, out], [0.011, 0.017, 0.0042], 0.0032, plateCol, head, 2));
            mesh.with('glow', q => slab(q, add(base, mul(out, 0.0073)), [bb, up, out], [0.0018, 0.011, 0.0005], 0.0004, pal.glow, head, 1));
            const root2 = add(base, mul(out, 0.0068));
            const rods = style === 'military' ? [[0.11, 0.55], [0.045, 0.9]] : style === 'salvaged' ? [[0.08, 0.6], [0.055, 0.3]] : [[0.078, 0.5], [0.062, 0.75], [0.046, 1.0]];
            rods.forEach(([length, lift], j) => {
                const dir = norm(add(add(mul(bb, 1), mul(up, lift * 1.7)), mul(out, 0.55))), start = add(root2, mul(up, 0.004 - j * 0.004));
                const pts2 = [start, add(start, mul(dir, length * 0.35)), add(add(start, mul(dir, length * 0.7)), mul(up, length * 0.04)), add(add(start, mul(dir, length)), mul(up, length * 0.1))];
                if (style === 'chrome' || style === 'glow') {
                    mesh.with(style === 'glow' ? 'glow' : 'chrome', q => q.loft(pts2.length, i => { const a = pts2[Math.max(0, i - 1)], b = pts2[Math.min(pts2.length - 1, i + 1)], dd = norm(sub(b, a)), side3 = norm(cross(dd, out)); return { center: pts2[i], x: side3, y: norm(cross(dd, side3)), rx: 0.0055 * (1 - i / pts2.length) + 0.0004, ry: 0.0011 }; }, 8, style === 'glow' ? pal.glow : [0.88, 0.89, 0.91], head, true));
                } else if (style === 'military') {
                    mesh.with('dark', q => q.tube(pts2, [0.0024, 0.0018, 0.0013, 0.0009], 8, [0.06, 0.06, 0.06], head, true));
                    for (let i = 1; i < 3; i++) mesh.with('steel', q => q.sphere(lerp(pts2[i], pts2[i + 1], 0.0), 0.0014, hw(pal, 1.2), head, 4, 8));
                } else {
                    cable(mesh, pts2.map((p, i) => add(p, mul(out, Math.sin(i * 2.3) * 0.002))), 0.0007, [0.7, 0.6, 0.35], head, 6, 'brass');
                    if (j === 0) { const c = lerp(pts2[1], pts2[2], 0.5), dd = norm(sub(pts2[2], pts2[1])), fa = frameAxes(dd), coil = []; for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2 * 6; coil.push(add(add(c, mul(dd, (i / 48 - 0.5) * 0.012)), add(mul(fa.x, Math.cos(a) * 0.0022), mul(fa.y, Math.sin(a) * 0.0022)))); } mesh.with('brass', q => q.tube(coil, 0.0004, 4, [0.85, 0.55, 0.3], head, true)); }
                }
                mesh.with('glow', q => q.sphere(pts2[pts2.length - 1], style === 'military' ? 0.0016 : 0.0012, pal.glow, head, 4, 8));
            });
            if (style === 'military') { const dish = add(add(root2, mul(bb, 0.006)), mul(up, -0.008)); mesh.with('paint', q => q.loft(3, (i, t) => ({ center: add(dish, mul(out, t * 0.003)), x: bb, y: up, rx: 0.002 + t * 0.005, ry: 0.002 + t * 0.005 }), 14, pal.plate, head, true)); }
            if (style === 'salvaged') mesh.with('rubber', q => slab(q, add(root2, mul(up, -0.002)), [bb, up, out], [0.006, 0.003, 0.0012], 0.001, [0.72, 0.7, 0.62], head, 1));
        }
        mesh.computeNormals();
        return [{ mesh, extra: platingExtra('Ear antennas', pics, pal, o) }];
    }

    // ── the catalog ───────────────────────────────────────────────────────
    const STYLE_OPTION = { style: STYLE_CHOICES, glow: [0, 1], wear: [0, 1] };
    /** The option labels the builder shows. */
    const LABELS = { style: 'Style', wear: 'Wear', glow: 'Glow', pattern: 'Pattern', sides: 'Sides', cables: 'Cables' };
    const SIDES = [['both', 'Both'], ['left', 'Left'], ['right', 'Right']];
    const FULL_FACE = ['mask', 'eyes', 'brow', 'underEye', 'faceSide', 'jaw', 'shield'];
    /** Plate colors offered beside the picker; glow colors for the second. */
    const SWATCH_PLATES = ['#e6e9ec', '#1c2130', '#4d5547', '#8c6b4c', '#9b1d24', '#c9a24a'], SWATCH_GLOWS = ['#5fe3ff', '#ff3fd6', '#ff9d3a', '#9cff57', '#ff3a3a', '#f4f4ff'];
    const cyber = (id, label, slot, group, make, extra = {}) => Object.assign({ id, label, slot, group, make, finish: 'metal', frame: 'head', cyber: true, onHead: true,
        labels: { color: 'Color', color2: 'Glow color' }, swatches: SWATCH_PLATES, swatches2: SWATCH_GLOWS, clearable: true }, extra, {
        defaults: Object.assign({ style: 'sleek', color: '', color2: '', glow: 0.8, wear: 0.25 }, extra.defaults || {}),
        options: Object.assign({}, STYLE_OPTION, extra.options || {})
    });
    const LED_PATTERNS = [['eyes', 'Eyes'], ['smile', 'Smile'], ['glyphs', 'Glyphs'], ['bars', 'Level bars']];

    const PROPS = [
        // Cyber faces
        cyber('cyberFaceplate', 'Full faceplate', 'mask', 'Cyber faces', faceplate, { slots: FULL_FACE, hidesBeard: true }),
        cyber('cyberJaw', 'Cyber jaw', 'jaw', 'Cyber faces', cyberJaw, { slots: ['jaw', 'mask'], hidesBeard: true, defaults: { style: 'military' } }),
        cyber('cyberHalfFace', 'Half-face plate', 'faceSide', 'Cyber faces', halfFace, { defaults: { side: 'left', style: 'sleek' } }),
        cyber('cyberBrow', 'Brow plate', 'brow', 'Cyber faces', browPlate, { defaults: { style: 'neon' } }),
        // Cyber masks
        cyber('cyberRespirator', 'Cyber respirator', 'mask', 'Cyber masks', respirator, { slots: ['mask', 'jaw'], hidesBeard: true, defaults: { style: 'military' } }),
        cyber('ledMask', 'LED mask', 'mask', 'Cyber masks', ledMask, { slots: FULL_FACE, hidesBeard: true, defaults: { style: 'neon', pattern: 'eyes' }, options: { pattern: LED_PATTERNS } }),
        cyber('armorMask', 'Armored mask', 'mask', 'Cyber masks', armorMask, { slots: FULL_FACE, hidesBeard: true, shapes: [['demon', 'Demon'], ['wolf', 'Wolf'], ['raptor', 'Raptor']], defaults: { shape: 'demon', style: 'military' } }),
        cyber('mouthGuard', 'Mouth guard', 'mask', 'Cyber masks', mouthGuard, { slots: ['mask', 'jaw'], hidesBeard: true, defaults: { style: 'sleek' } }),
        cyber('faceShield', 'Face shield', 'shield', 'Cyber masks', faceShield, { defaults: { style: 'sleek' } }),
        // HUD eyewear
        cyber('hudMonocle', 'HUD monocle', 'eyes', 'HUD eyewear', hudMonocle, { defaults: { side: 'right', style: 'sleek' } }),
        cyber('earScouter', 'Ear scouter', 'eyes', 'HUD eyewear', earScouter, { defaults: { side: 'left', style: 'military' } }),
        cyber('arGlasses', 'AR glasses', 'eyes', 'HUD eyewear', arGlasses, { defaults: { style: 'sleek' } }),
        cyber('tacGoggles', 'Tactical goggles', 'eyes', 'HUD eyewear', tacGoggles, { defaults: { style: 'military' } }),
        cyber('haloProjector', 'Halo projector', 'hat', 'HUD eyewear', haloProjector, { slots: ['hat', 'halo'], defaults: { style: 'neon' } }),
        // Implants
        cyber('templeJacks', 'Temple jacks', 'temple', 'Implants', templeJacks, { frame: 'headSide', defaults: { sides: 'both', cables: true }, options: { sides: SIDES, cables: 'check' } }),
        cyber('neckJack', 'Neck jack', 'neckJack', 'Implants', neckJack, { frame: 'headSide', defaults: { side: 'left' } }),
        cyber('spineImplant', 'Spinal column', 'spine', 'Implants', spineImplant, { frame: 'nape', onHead: false }),
        cyber('chestCore', 'Chest core', 'chestCore', 'Implants', chestCore, { frame: 'chest', onHead: false, defaults: { style: 'neon' } }),
        cyber('forearmScreen', 'Forearm screen', 'forearm', 'Implants', forearmScreen, { frame: 'hands', onHead: false, defaults: { side: 'left' } }),
        cyber('underEyeLights', 'Under-eye lights', 'underEye', 'Implants', underEyeLights, { frame: 'face', defaults: { style: 'sleek' } }),
        cyber('earAntennas', 'Ear antennas', 'earTech', 'Implants', earAntennas, { frame: 'headSide', defaults: { sides: 'both' }, options: { sides: SIDES } })
    ];
    /** The wraparound visor takes over the old "Cyber visor" (its id, its colors: a dark frame, a magenta glow). */
    const VISOR = cyber('visor', 'Cyber visor', 'eyes', 'HUD eyewear', visor, { defaults: { style: 'neon', color: '#202024', color2: '#ff2bd6' } });
    const BY_ID = new Map(PROPS.concat([VISOR]).map(p => [p.id, p]));

    /**
     * Cyber looks: a set of pieces to put on at once (they replace the
     * cyberware already worn; other accessories stay unless a piece covers
     * them). Each in one style, so the pieces match.
     */
    const LOOKS = [
        { id: 'ivoryGhost', label: 'Ivory ghost', props: [{ id: 'cyberFaceplate', style: 'sleek' }, { id: 'templeJacks', style: 'sleek' }, { id: 'spineImplant', style: 'sleek' }] },
        { id: 'streetMedic', label: 'Street medic', props: [{ id: 'arGlasses', style: 'sleek' }, { id: 'cyberRespirator', style: 'sleek' }, { id: 'forearmScreen', style: 'sleek' }] },
        { id: 'ironWarden', label: 'Iron warden', props: [{ id: 'cyberJaw', style: 'military' }, { id: 'tacGoggles', style: 'military' }, { id: 'neckJack', style: 'military' }, { id: 'spineImplant', style: 'military' }] },
        { id: 'gutterRunner', label: 'Gutter runner', props: [{ id: 'cyberHalfFace', style: 'salvaged' }, { id: 'mouthGuard', style: 'salvaged' }, { id: 'earAntennas', style: 'salvaged', sides: 'left' }, { id: 'templeJacks', style: 'salvaged', sides: 'right' }] },
        { id: 'neonOni', label: 'Neon oni', props: [{ id: 'armorMask', style: 'neon', shape: 'demon' }, { id: 'chestCore', style: 'neon' }, { id: 'spineImplant', style: 'neon' }] },
        { id: 'signalWitch', label: 'Signal witch', props: [{ id: 'visor', style: 'neon', color: '', color2: '' }, { id: 'templeJacks', style: 'neon' }, { id: 'underEyeLights', style: 'neon' }, { id: 'forearmScreen', style: 'neon' }] },
        { id: 'packHunter', label: 'Pack hunter', props: [{ id: 'armorMask', style: 'military', shape: 'wolf' }, { id: 'earAntennas', style: 'military' }] },
        { id: 'haloSaint', label: 'Halo saint', props: [{ id: 'haloProjector', style: 'sleek' }, { id: 'hudMonocle', style: 'sleek' }, { id: 'cyberBrow', style: 'sleek' }, { id: 'chestCore', style: 'sleek' }] },
        { id: 'deadPixel', label: 'Dead pixel', props: [{ id: 'ledMask', style: 'salvaged', pattern: 'glyphs' }, { id: 'neckJack', style: 'salvaged' }, { id: 'earAntennas', style: 'salvaged' }] },
        { id: 'scout', label: 'Scout', props: [{ id: 'earScouter', style: 'military' }, { id: 'cyberBrow', style: 'military' }, { id: 'underEyeLights', style: 'military' }] },
        { id: 'raptorKnight', label: 'Raptor knight', props: [{ id: 'armorMask', style: 'sleek', shape: 'raptor' }, { id: 'chestCore', style: 'sleek' }] },
        { id: 'riotLine', label: 'Riot line', props: [{ id: 'faceShield', style: 'military' }, { id: 'cyberRespirator', style: 'military' }, { id: 'chestCore', style: 'military' }] }
    ];
    const isCyber = id => BY_ID.has(id);
    /** A look put on over a list of accessories: the old cyberware off, the look's pieces on. */
    function wearLook(props, lookId) {
        const look = LOOKS.find(l => l.id === lookId);
        if (!look) return props;
        return (props || []).filter(p => !isCyber(p.id)).concat(look.props.map(p => Object.assign({}, p)));
    }
    /** A random look for a random character (rand: 0..1): sometimes a whole look, sometimes a piece or two in one style. */
    function randomLook(rand) {
        if (rand() < 0.5) { const look = LOOKS[Math.floor(rand() * LOOKS.length)]; return look.props.map(p => Object.assign({}, p)); }
        const style = STYLE_CHOICES[Math.floor(rand() * STYLE_CHOICES.length)][0], pool = PROPS.concat([VISOR]), picked = [];
        for (let i = 0, n = 1 + Math.floor(rand() * 2); i < n; i++) {
            const def = pool[Math.floor(rand() * pool.length)];
            if (picked.some(p => p.id === def.id)) continue;
            const item = { id: def.id, style };
            if (def.shapes) item.shape = def.shapes[Math.floor(rand() * def.shapes.length)][0];
            if (def.options.pattern) item.pattern = def.options.pattern[Math.floor(rand() * def.options.pattern.length)][0];
            picked.push(item);
        }
        return picked;
    }

    const api = { STYLES, STYLE_CHOICES, PROPS, VISOR, BY_ID, LABELS, LOOKS, wearLook, randomLook, isCyber, paletteOf, headField, shape, shell, plates, bake, newMesh, aroundHead, modes: { RIGID, SKIN, JAW } };
    root.RRCharacterCyberGear = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
