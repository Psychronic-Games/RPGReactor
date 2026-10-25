/**
 * RRMerfolkBody - a merfolk's lower body: from the hips down a fish's tail
 * in place of the legs, the upper body the human one with all its sliders.
 *
 * The body's skin below the scale line is left out; the tail grows from the
 * edge the skin is cut along, sharing that edge's points, normals and
 * weights, so the two meet without a gap. Down to the thighs the tail takes
 * the hidden hips' own shape (cross-sections of the hips and both thighs
 * pressed together), so weight, hips and butt shape it; below them it
 * tapers to the narrow stem and the tail fin. At rest it stands on its tail:
 * down from the hips, curving back along the floor, the fin lifted.
 *
 * Scales are a gray picture (`merscales.png`, rows of overlapping scales,
 * tiny and faint at the scale line) with a relief picture
 * (`merscales_n.png`, each scale tilted its own way so they glint one by
 * one as the tail moves), tinted by the vertex colors of a palette. Fins
 * are see-through membranes on the fin picture (`merfin.png`: rays that
 * branch toward the edge).
 *
 * Bones: the humanoid skeleton stays whole, so any humanoid motion plays;
 * the leg bones carry no skin. A chain hangs from the hips: Tail, Tail2 …
 * Tail8 down the tail and TailFin, TailFin2 through the tail fin. Clips
 * (Idle, Walk, Swim, Swim fast, Tread, Sit, Lie, Rest) are baked.
 */
(function (root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Props = need('RRCharacterProps', './CharacterProps.js');
    const Outfit = need('RRCharacterOutfit', './CharacterOutfit.js');
    const Wardrobe = need('RRCharacterWardrobe', './CharacterWardrobe.js');
    const Glb = need('RRCharacterGlb', './CharacterGlb.js');
    const Poses = need('RRCharacterPoses', './CharacterPoses.js');
    const { add, sub, mul, dot, cross, len, norm, lerp } = Props.vec;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const smooth = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const linear = hex => Outfit.linear(hex);

    // ── settings ──────────────────────────────────────────────────────────
    const FINS = [['forked', 'Forked'], ['fan', 'Fan'], ['veil', 'Long veil']];
    const COLORS = [['teal', 'Teal'], ['coral', 'Coral'], ['deepBlue', 'Deep blue'], ['gold', 'Golden'], ['koi', 'Koi']];
    /** Each palette: the tail's back, flanks and belly, its color toward the fin, the fins at their root and edge. */
    const PALETTES = {
        teal: { back: '#0b4a52', side: '#13817c', belly: '#a6dccb', tip: '#17657f', fin: '#2aa89c', edge: '#c8f3e6' },
        coral: { back: '#82242a', side: '#cc513d', belly: '#f6c7a6', tip: '#a8344f', fin: '#ee7a5e', edge: '#ffdccb' },
        deepBlue: { back: '#0a1a44', side: '#1b3f8a', belly: '#8aaad6', tip: '#25266e', fin: '#3a6cce', edge: '#bcd6ff' },
        gold: { back: '#6a430e', side: '#bd8722', belly: '#f2de9c', tip: '#8a5810', fin: '#e4b142', edge: '#fff3c6' },
        koi: { back: '#ece5da', side: '#f2ece2', belly: '#faf6ef', tip: '#efe6d8', fin: '#f4ede4', edge: '#ffffff', patch: '#e0561a', ink: '#16120e' }
    };
    const DEFAULTS = { fin: 'forked', colors: 'teal', length: 1.25, armFins: false, hipFins: false, backFin: false, finEars: false, wetHair: false };
    const LENGTH = { natural: [1.05, 1.5], extreme: [1, 2] };

    function normalize(input) {
        const m = Object.assign({}, DEFAULTS, input || {});
        if (!FINS.some(f => f[0] === m.fin)) m.fin = DEFAULTS.fin;
        if (!PALETTES[m.colors]) m.colors = DEFAULTS.colors;
        m.length = clamp(Number.isFinite(+m.length) ? +m.length : DEFAULTS.length, LENGTH.extreme[0], LENGTH.extreme[1]);
        for (const k of ['armFins', 'hipFins', 'backFin', 'finEars', 'wetHair']) m[k] = !!m[k];
        return { fin: m.fin, colors: m.colors, length: m.length, armFins: m.armFins, hipFins: m.hipFins, backFin: m.backFin, finEars: m.finEars, wetHair: m.wetHair };
    }

    /** What a tail cannot wear: anything for legs or feet, and what hangs over them. */
    const BLOCKED_SLOTS = new Set(['bottom', 'feet', 'legarmor', 'dress', 'hips', 'under']);
    const BLOCKED_GARMENTS = new Set(['powerarmor', 'trenchcoat']);
    function fitsGarment(id) {
        const g = Wardrobe && Wardrobe.BY_ID.get(id);
        return !!g && !BLOCKED_SLOTS.has(g.slot) && !BLOCKED_GARMENTS.has(id);
    }

    /**
     * A normalized human recipe made a merfolk's (or cleared of merfolk
     * settings when it is not one): the tail's settings, the outfit without
     * what a tail cannot wear, no second tail, the ears tucked away under
     * fin ears.
     */
    function normalizeRecipe(out, input) {
        if (!out || out.plan !== 'human' || out.species !== 'merfolk') { if (out) delete out.merfolk; return out; }
        out.merfolk = normalize(input && input.merfolk);
        out.outfit = (out.outfit || []).filter(i => fitsGarment(i.id));
        if (out.features && out.features.tail) out.features = Object.assign({}, out.features, { tail: Object.assign({}, out.features.tail, { type: 'none' }) });
        if (out.merfolk.finEars) out.morph = Object.assign({}, out.morph, { earsAway: 1, earHoles: 0 });
        return out;
    }

    // ── the cut ───────────────────────────────────────────────────────────
    /** Above the hip joint, as a share of the body's height: where the skin ends and the scales begin. */
    const CUT_ABOVE_HIPS = 0.03;
    const LEG_BONES = /^(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe_End)$/;

    /**
     * Which skin the tail replaces, worked out once on the average body: every
     * vertex of the trunk and legs below the cut (never an arm's or a hand's),
     * the triangles wholly among them, and the cut's edge as one loop of
     * vertices round the hips, in order of bearing from the front.
     */
    function cutOf(pack) {
        if (pack._merCut) return pack._merCut;
        const an = Outfit.anatomy(pack), P = an.rest, src = pack.body.source, I = pack.body.index;
        const ids = pack._bodyIds || (pack._bodyIds = [...new Set(src)]);
        const hips = pack.bones.findIndex(b => b.name === 'Hips');
        let hipY = 0, hn = 0;
        for (const v of pack.bones[hips].head) { hipY += P[v * 3 + 1]; hn++; }
        hipY /= hn || 1;
        const cutY = hipY + CUT_ABOVE_HIPS * an.height;
        const hidden = new Set();
        for (const v of ids) if (an.member[v * 5 + 1] + an.member[v * 5 + 2] < 0.5 && P[v * 3 + 1] < cutY) hidden.add(v);
        // Triangles in source vertices: hidden when all three corners are.
        const edgeOf = new Map(), key = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
        const hiddenTris = [];
        for (let t = 0; t < I.length; t += 3) {
            const a = src[I[t]], b = src[I[t + 1]], c = src[I[t + 2]];
            const h = hidden.has(a) && hidden.has(b) && hidden.has(c);
            if (h) hiddenTris.push(t);
            for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                const k = key(p, q), e = edgeOf.get(k) || { kept: 0, hid: 0, p, q };
                if (h) e.hid++; else e.kept++;
                edgeOf.set(k, e);
            }
        }
        // The edge between kept and hidden skin, walked into loops.
        const next = new Map();
        for (const e of edgeOf.values()) if (e.kept && e.hid) {
            if (!next.has(e.p)) next.set(e.p, []);
            if (!next.has(e.q)) next.set(e.q, []);
            next.get(e.p).push(e.q); next.get(e.q).push(e.p);
        }
        const seen = new Set(), loops = [];
        for (const start of next.keys()) {
            if (seen.has(start)) continue;
            const loop = [start];
            seen.add(start);
            let prev = -1, at = start;
            for (;;) {
                const nb = next.get(at).filter(v => v !== prev && (!seen.has(v) || (v === start && loop.length > 2)));
                if (!nb.length) break;
                const v = nb[0];
                if (v === start) break;
                loop.push(v); seen.add(v); prev = at; at = v;
            }
            loops.push(loop);
        }
        loops.sort((a, b) => b.length - a.length);
        const zc = (() => { let z = 0; for (const v of loops[0]) z += P[v * 3 + 2]; return z / loops[0].length; })();
        const bearing = v => Math.atan2(P[v * 3], P[v * 3 + 2] - zc);
        const ring = loops[0].slice();
        // Keep the actual skin boundary adjacency, including concave hip folds.
        let area = 0;
        for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=P[a*3]*P[b*3+2]-P[b*3]*P[a*3+2];}
        if(area>0)ring.reverse();
        const first=ring.reduce((best,v,i)=>bearing(v)<bearing(ring[best])?i:best,0);
        ring.push(...ring.splice(0,first));
        // The skin just above the cut, where loose scales are scattered: kept triangles of the trunk within the band.
        const band = [], bandTop = cutY + 0.05 * an.height;
        for (let t = 0; t < I.length; t += 3) {
            const vs = [src[I[t]], src[I[t + 1]], src[I[t + 2]]];
            if (vs.every(v => hidden.has(v))) continue;
            if (vs.some(v => an.member[v * 5 + 1] + an.member[v * 5 + 2] > 0.3)) continue;
            if (vs.every(v => P[v * 3 + 1] < bandTop)) band.push(t);
        }
        const hiddenIds = [...hidden];
        return (pack._merCut = { hidden, hiddenIds, hiddenTris, ring, cutY, hipY, band, bandTop, height: an.height });
    }

    // ── shapes ────────────────────────────────────────────────────────────
    /** Points' convex hull in the x-z plane (Andrew's monotone chain). */
    function hull2(points) {
        const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (p.length < 3) return p;
        const crossZ = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower = [], upper = [];
        for (const q of p) { while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
        for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
        upper.pop(); lower.pop();
        return lower.concat(upper);
    }
    /** How far out a hull reaches from (cx, cz) along bearing a (sin a across, cos a forward). */
    function hullReach(h, cx, cz, a) {
        const dx = Math.sin(a), dz = Math.cos(a);
        let best = 0;
        for (let i = 0; i < h.length; i++) {
            const p = h[i], q = h[(i + 1) % h.length];
            const ex = q[0] - p[0], ez = q[1] - p[1], fx = p[0] - cx, fz = p[1] - cz;
            const den = dx * ez - dz * ex;
            if (Math.abs(den) < 1e-12) continue;
            const t = (fx * ez - fz * ex) / den, s = (fx * dz - fz * dx) / den;
            if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) best = Math.max(best, t);
        }
        return best;
    }
    /** A rounded box's reach along bearing a: half widths w across, front f and back k, roundness n. */
    function boxReach(a, w, f, k, n = 2.4) {
        const sx = Math.abs(Math.sin(a)) / w, sz = Math.abs(Math.cos(a)) / (Math.cos(a) >= 0 ? f : k);
        return 1 / Math.pow(Math.pow(sx, n) + Math.pow(sz, n), 1 / n);
    }

    /** The tail fin's outline: how far each ray reaches at its angle off the tail (radians), and how wide the fan opens. */
    const FIN_SHAPES = {
        // Two swept-back lobes, pointed, a notch between them.
        forked: { spread: 1.35, rays: 13, reach: (a, s) => { const x = Math.abs(a) / 1.35; return s * (0.13 + 0.27 * Math.pow(Math.sin(Math.min(1, x / 0.8) * Math.PI / 2), 2.2) * (x > 0.8 ? 1 - Math.pow((x - 0.8) / 0.2, 1.4) * 0.82 : 1)); } },
        // A round fan wider than long, scalloped between its rays.
        fan: { spread: 1.45, rays: 14, reach: (a, s) => { const x = Math.abs(a) / 1.45; return s * (0.33 * (0.86 + 0.14 * Math.cos(x * Math.PI * 0.9)) * Math.sqrt(Math.max(0.04, 1 - Math.pow(x, 3.2)))); } },
        // A long veil, trailing well past the tail's end, ragged at its edge.
        veil: { spread: 1.0, rays: 12, reach: (a, s) => { const x = Math.abs(a) / 1.0; return s * (0.5 + 0.12 * Math.cos(x * Math.PI * 0.8) + 0.06 * Math.sin(x * 11)) * Math.sqrt(Math.max(0.06, 1 - Math.pow(x, 4))); } }
    };

    // ── the tail ──────────────────────────────────────────────────────────
    const AROUND = 64, CHAIN = 8;

    /**
     * The tail's middle line at rest, from the cut down: straight down along
     * the thighs, curving back to lie along the floor, lifting at the stem.
     * Returns { at(a) -> {p, d, phi}, length } with a the distance along it.
     */
    function restLine(C0, dirA, lenA, bendR, total, lift) {
        const phiA = Math.atan2(dirA[2], -dirA[1]);
        const arcB = bendR * (phiA + Math.PI / 2);
        const tipRun = Math.min(0.22 * total, Math.max(0.05, total - lenA - arcB));
        const lenC = Math.max(0, total - lenA - arcB - tipRun);
        const dirOf = phi => [0, -Math.cos(phi), Math.sin(phi)];
        const pA = add(C0, mul(dirA, lenA));
        const pB = add(pA, [0, -bendR * (Math.sin(phiA) + 1), -bendR * (Math.cos(phiA))]);
        const pC = add(pB, [0, 0, -lenC]);
        const at = a => {
            if (a <= lenA) return { p: add(C0, mul(dirA, a)), phi: phiA };
            if (a <= lenA + arcB) {
                const phi = phiA - (a - lenA) / bendR;
                // Along a circle turning backward: y drops by R(sin phiA - sin phi), z moves by R(cos phi - cos phiA).
                return { p: add(pA, [0, -bendR * (Math.sin(phiA) - Math.sin(phi)), bendR * (Math.cos(phi) - Math.cos(phiA))]), phi };
            }
            if (a <= lenA + arcB + lenC) return { p: add(pB, [0, 0, -(a - lenA - arcB)]), phi: -Math.PI / 2 };
            // The stem lifting off the floor, the fin raised.
            const u = Math.min(1, (a - lenA - arcB - lenC) / tipRun), R = tipRun / Math.max(1e-3, lift);
            const phi = -Math.PI / 2 - lift * u;
            const q = u * lift;
            return { p: add(pC, [0, R * (1 - Math.cos(q)), -R * Math.sin(q)]), phi };
        };
        return { at: a => { const r = at(a); r.d = dirOf(r.phi); return r; }, lenA, arcB, lenC, tipRun };
    }

    /** Value noise in 3D, smooth, -1..1. */
    function noise3(x, y, z, seed = 0) {
        const h = (i, j, k) => { let n = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683) ^ Math.imul(seed + 1, 2246822519); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296 * 2 - 1; };
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = x - xi, v = y - yi, w = z - zi;
        const s = t => t * t * (3 - 2 * t), a = s(u), b = s(v), c = s(w);
        const L = (p, q, t) => p + (q - p) * t;
        return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), a), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), a), b),
            L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), a), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), a), b), c);
    }

    /** A growing mesh with picture coordinates, colors and skin. */
    function sheet() {
        const o = { p: [], n: [], uv: [], c: [], j: [], w: [], i: [] };
        o.vertex = (p, n, uv, c, skin) => {
            const k = o.p.length / 3;
            o.p.push(p[0], p[1], p[2]); o.n.push(n[0], n[1], n[2]); o.uv.push(clamp(uv[0], 0, 1), clamp(uv[1], 0, 1)); o.c.push(c[0], c[1], c[2]);
            for (let q = 0; q < 4; q++) { o.j.push(skin.joints[q] || 0); o.w.push(skin.weights[q] || 0); }
            return k;
        };
        o.tri = (a, b, c) => o.i.push(a, b, c);
        o.part = (name, extra) => Object.assign({ name, positions: Float32Array.from(o.p), normals: Float32Array.from(o.n), uvs: Float32Array.from(o.uv), colors: Float32Array.from(o.c),
            joints: Uint8Array.from(o.j), weights: Float32Array.from(o.w), index: Uint32Array.from(o.i) }, extra);
        return o;
    }

    /** Smooth normals of a sheet from its triangles (vertices `keep` hold theirs). */
    function smoothNormals(o, keep) {
        const N = new Float32Array(o.p.length), P = o.p;
        for (let t = 0; t < o.i.length; t += 3) {
            const a = o.i[t] * 3, b = o.i[t + 1] * 3, c = o.i[t + 2] * 3;
            const n = cross([P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]]);
            for (const s of [a, b, c]) { N[s] += n[0]; N[s + 1] += n[1]; N[s + 2] += n[2]; }
        }
        for (let v = 0; v < N.length / 3; v++) {
            if (keep && keep.has(v)) continue;
            const l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
            if (l > 0) { o.n[v * 3] = N[v * 3] / l; o.n[v * 3 + 1] = N[v * 3 + 1] / l; o.n[v * 3 + 2] = N[v * 3 + 2] / l; }
        }
    }

    /** Four influences from a weighted list, the strongest kept, summing to one. */
    function skinOf(list) {
        const acc = new Map();
        for (const [j, w] of list) if (w > 0) acc.set(j, (acc.get(j) || 0) + w);
        const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = top.reduce((s, e) => s + e[1], 0) || 1;
        return { joints: top.map(e => e[0]).concat([0, 0, 0, 0]).slice(0, 4), weights: top.map(e => e[1] / sum).concat([0, 0, 0, 0]).slice(0, 4) };
    }

    /** The body's skin at a vertex with the legs' share moved to the hips. */
    function bodySkin(pack, v, hips, legSet) {
        const list = [];
        for (let k = 0; k < 4; k++) { const j = pack.skinJoints[v * 4 + k], w = pack.skinWeights[v * 4 + k]; list.push([legSet.has(j) ? hips : j, w]); }
        return skinOf(list);
    }

    /**
     * The tail on a built body: the tail's skin, its fins, the bones it
     * brings (absolute indices from `boneBase`) and its pictures. `ctx`:
     * { skinNormals, outfitHidden, boneBase, skin (hex) }.
     */
    function build(pack, built, r, L, ctx) {
        const m = normalize(r.merfolk), cut = cutOf(pack), P = built.shaped, NB = ctx.skinNormals;
        const bones = built.bones, idx = name => bones.findIndex(b => b.name === name);
        const hips = idx('Hips');
        const legSet = new Set(bones.map((b, i) => (LEG_BONES.test(b.name) ? i : -1)).filter(i => i >= 0));
        const H = Math.max(0.5, built.height), sc = H / 1.654;
        const pal = PALETTES[m.colors], rgb = {};
        for (const k of Object.keys(pal)) rgb[k] = linear(pal[k]);
        const skinRgb = linear(r.skin || '#c69c7f');

        // The cut's edge on this body, in order of bearing.
        const ringV = cut.ring;
        let C0 = [0, 0, 0], ringMinY = Infinity, ringMaxY = -Infinity;
        for (const v of ringV) { C0[1] += P[v * 3 + 1]; C0[2] += P[v * 3 + 2]; ringMinY = Math.min(ringMinY, P[v * 3 + 1]); ringMaxY = Math.max(ringMaxY, P[v * 3 + 1]); }
        C0 = [0, C0[1] / ringV.length, C0[2] / ringV.length];
        const ringBear = ringV.map(v => Math.atan2(P[v * 3], P[v * 3 + 2] - C0[2]));
        // A heavy seat makes the cut higher at the back than at the belly.
        // Flattening the very next row to the lowest cut point made a tall,
        // cylindrical wall below the buttocks. Carry that height contour into
        // the first tail sections, then ease it out over the upper taper.
        const cutHeights = ringV.map((v,i)=>[ringBear[i],P[v*3+1]]).sort((a,b)=>a[0]-b[0]);
        const contourWeight=smooth(H*.05,H*.10,ringMaxY-ringMinY);
        const cutHeight = bearing => {
            for(let i=0;i<cutHeights.length;i++){
                const a=cutHeights[i],next=cutHeights[(i+1)%cutHeights.length],end=next[0]+(i===cutHeights.length-1?Math.PI*2:0);
                const at=bearing<a[0]?bearing+Math.PI*2:bearing;
                if(at>=a[0]&&at<=end){const t=(at-a[0])/Math.max(1e-8,end-a[0]);return a[1]+(next[1]-a[1])*t;}
            }
            return ringMinY;
        };
        // A deep fold need not be star-shaped around the mean hip center.
        // Its convex outline supports the first regular tail sections; the
        // exact cut above it still retains every original boundary edge.
        const ringHull = hull2(ringV.map(v=>[P[v*3],P[v*3+2]]));
        const ringReach = a => Math.max(.003*sc,hullReach(ringHull,0,C0[2],a));
        const topologyBear = [], lengths = [0];
        for(let i=0;i<ringV.length;i++){
            const a=ringV[i],b=ringV[(i+1)%ringV.length];
            lengths.push(lengths.at(-1)+Math.hypot(P[a*3]-P[b*3],P[a*3+1]-P[b*3+1],P[a*3+2]-P[b*3+2]));
        }
        for(let i=0;i<ringV.length;i++)topologyBear.push(-Math.PI+lengths[i]/lengths.at(-1)*Math.PI*2);

        // The hidden hips and thighs: the crotch, and where the thighs run down.
        let crotch = Infinity;
        for (const v of cut.hiddenIds) if (Math.abs(P[v * 3]) < 0.012 * sc && P[v * 3 + 1] > 0.3 * H) crotch = Math.min(crotch, P[v * 3 + 1]);
        if (!isFinite(crotch)) crotch = C0[1] - 0.12 * sc;
        let qz = 0, qn = 0;
        for (const v of cut.hiddenIds) { const y = P[v * 3 + 1]; if (y < crotch - 0.05 * sc && y > crotch - 0.16 * sc) { qz += P[v * 3 + 2]; qn++; } }
        // Deep abdominal folds can lower the cut below the inferred crotch.
        // The tail still leaves that cut downward, never back up into the torso.
        const Q = [0, Math.min(crotch - 0.105 * sc,C0[1] - .08 * sc), qn ? qz / qn : C0[2]];
        const dirA = norm(sub(Q, C0));

        // Cross-sections of the hidden hips and thighs, every 1.5 cm from under the cut to below the crotch.
        const slabTop = ringMinY - 0.008 * sc, slabStep = 0.015 * sc;
        // A very deep hip fold can put the lowest cut vertex below the crotch. Keep a real
        // section interval below that edge instead of producing an empty table.
        const slabEnd = Math.min(crotch - 0.07 * sc, slabTop - slabStep);
        const slabs = [];
        for (let y = slabTop; y >= slabEnd; y -= slabStep) slabs.push({ y, pts: [] });
        for (const v of cut.hiddenIds) {
            const y = P[v * 3 + 1];
            if (y > slabTop + slabStep || y < slabEnd - slabStep) continue;
            for (const s of slabs) if (Math.abs(y - s.y) < slabStep * 0.75) s.pts.push([P[v * 3], P[v * 3 + 2]]);
        }
        const aOfY = y => (C0[1] - y) / -dirA[1];
        for (const s of slabs) {
            s.a = aOfY(s.y);
            s.hull = hull2(s.pts.concat(s.pts.map(p => [-p[0], p[1]])));
        }

        const bendR = 0.3 * sc;
        // At the last cross-section: half width, front and back.
        const last = slabs[slabs.length - 1];
        const cAt = a => add(C0, mul(dirA, a));
        const sectionReach = (section, z, bearing) => {
            // Extreme leg shortening can move a section wholly ahead of the straight tail axis.
            // Measure its girth from an interior point, retaining its shape without zero radii.
            if (section.reachZ !== z) {
                section.reachZ = z;
                section.reachCenter = z;
                if ([0, Math.PI / 2, Math.PI, -Math.PI / 2].some(a => hullReach(section.hull, 0, z, a) < 1e-6 * sc)) {
                    section.reachCenter = section.hull.length ? section.hull.reduce((sum, p) => sum + p[1], 0) / section.hull.length : z;
                }
            }
            return Math.max(0.003 * sc, hullReach(section.hull, 0, section.reachCenter, bearing));
        };
        const lc = cAt(last.a);
        const W0 = (sectionReach(last, lc[2], Math.PI / 2) + sectionReach(last, lc[2], -Math.PI / 2)) / 2;
        const F0 = sectionReach(last, lc[2], 0) * 0.94, K0 = sectionReach(last, lc[2], Math.PI) * 0.94;
        const aM = last.a;
        // The minimum belongs to this body's scale, rather than the unshaped reference pack.
        const total = Math.max(cut.hipY * sc * 1.02, C0[1] * m.length, aM + 0.18 * sc);

        /** The section's reach at arc a and bearing b (0 the front, the belly). */
        const finRootW = 0.05 * sc;
        let line, aEnd;
        const rawReach = (a, b) => {
            // Under the cut: from the edge's own shape into the hips' sections.
            if (a <= aM) {
                let s0 = null, s1 = null;
                for (const s of slabs) { if (s.a <= a) s0 = s; else { s1 = s; break; } }
                const c = cAt(a);
                const hr = sl => sectionReach(sl, c[2], b);
                let rr;
                if (!s0) rr = hr(slabs[0]);
                else if (!s1) rr = hr(s0);
                else { const t = (a - s0.a) / (s1.a - s0.a); rr = hr(s0) * (1 - t) + hr(s1) * t; }
                // The topmost rows lean onto the edge itself.
                const top = smooth(0, 0.035 * sc, a - (C0[1] - ringMinY));
                const fromRing = ringReach(b) * (1 - top) + rr * top;
                // The thighs pressed together: a little slimmer than both thighs' outline as it nears the crotch.
                const squeeze = 1 - 0.06 * smooth(C0[1] - crotch - 0.03 * sc, aM, a);
                return fromRing * squeeze;
            }
            const u = clamp((a - aM) / (aEnd - aM), 0, 1);
            // A soft waist where the knees would be, a fuller calf, then the narrow stem.
            const Wt = (0.19 + 0.81 * Math.pow(1 - u, 1.15) * (1 + 0.25 * u * (1 - u))) * (1 - 0.045 * Math.exp(-Math.pow((u - 0.3) / 0.1, 2)) + 0.035 * Math.exp(-Math.pow((u - 0.52) / 0.12, 2)));
            const Ht = 0.3 + 0.7 * Math.pow(1 - u, 1.1);
            let w = W0 * Wt, f = F0 * Ht, k = K0 * Ht;
            // Past the stem: flattened into the fin's root.
            if (a > aEnd) { const e = smooth(aEnd, aEnd + 0.045 * sc, a); w = w + (finRootW - w) * e; f = f + (0.006 * sc - f) * e; k = k + (0.007 * sc - k) * e; }
            const ra = boxReach(b, w, f, k, 2.3 + 0.7 * u);
            // Below the crotch the sections blend from the thighs' outline into the rounded taper.
            const blend = smooth(aM, aM + 0.08 * sc, a);
            if (blend >= 1) return ra;
            const rr = sectionReach(last, cAt(aM)[2], b) * 0.94;
            return rr * (1 - blend) + ra * blend;
        };
        // Down to past the thighs the sections come from a table: each bearing's reach along the tail with its
        // dents filled (the fold under the buttocks, between the thighs), so the tail runs smooth from the hips.
        aEnd = total;
        const tA0 = C0[1] - ringMinY, tStep = 0.008 * sc, tRows = Math.ceil((aM + 0.12 * sc - tA0) / tStep) + 1;
        const table = [];
        for (let k = 0; k < tRows; k++) table.push(Float32Array.from({ length: AROUND }, (_, j) => rawReach(tA0 + k * tStep, -Math.PI + (j / AROUND) * Math.PI * 2)));
        for (let j = 0; j < AROUND; j++) {
            // The upper hull of (a, reach): the profile bulges where the body does and never folds in.
            const pts = [];
            for (let k = 0; k < tRows; k++) {
                const q = [k, table[k][j]];
                while (pts.length >= 2) { const o = pts[pts.length - 2], p = pts[pts.length - 1]; if ((p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]) >= 0) pts.pop(); else break; }
                pts.push(q);
            }
            let s = 0;
            for (let k = 0; k < tRows; k++) {
                while (s + 1 < pts.length && pts[s + 1][0] < k) s++;
                const p = pts[s], q = pts[Math.min(pts.length - 1, s + 1)];
                const hullR = q[0] > p[0] ? p[1] + (q[1] - p[1]) * (k - p[0]) / (q[0] - p[0]) : p[1];
                // The first rows keep to the edge itself; below, the filled profile.
                const keep = 1 - smooth(1, 6, k);
                table[k][j] = table[k][j] * keep + Math.max(table[k][j], hullR) * (1 - keep);
            }
        }
        // Across: neighboring bearings eased together, twice.
        for (let pass = 0; pass < 2; pass++) for (let k = 2; k < tRows; k++) {
            const row = table[k], next = new Float32Array(AROUND);
            for (let j = 0; j < AROUND; j++) next[j] = 0.25 * row[(j + AROUND - 1) % AROUND] + 0.5 * row[j] + 0.25 * row[(j + 1) % AROUND];
            table[k] = next;
        }
        const tEnd = tA0 + (tRows - 1) * tStep;
        const reachAt = (a, b) => {
            if (a > tEnd) return rawReach(a, b);
            const x = clamp((a - tA0) / tStep, 0, tRows - 1), k = Math.min(tRows - 2, Math.floor(x)), t = x - k;
            const y = ((b + Math.PI) / (Math.PI * 2)) * AROUND, j = Math.floor(y), u = y - j, j0 = ((j % AROUND) + AROUND) % AROUND, j1 = (j0 + 1) % AROUND;
            const r0 = table[k][j0] * (1 - u) + table[k][j1] * u, r1 = table[k + 1][j0] * (1 - u) + table[k + 1][j1] * u;
            return r0 * (1 - t) + r1 * t;
        };

        // Rest line: lowered until the tail lies on the floor.
        let lenA = Math.max(0.05, C0[1] - 0.9 * bendR - 0.1 * sc);
        const lift = 0.55;
        const rows = [];
        const sampleRows = () => {
            rows.length = 0;
            const ringDrop = (C0[1] - ringMinY) + 0.006 * sc;
            rows.push({ a: ringDrop, ring0: true });
            let a = ringDrop + 0.008 * sc;
            const stop = aEnd + 0.06 * sc;
            while (a < stop) {
                rows.push({ a });
                const inBend = a > line.lenA - 0.05 && a < line.lenA + line.arcB + 0.05;
                a += (a < aM + 0.05 ? 0.013 : inBend ? 0.014 : a > aEnd - 0.12 * sc ? 0.011 : 0.02) * sc;
            }
            rows.push({ a: stop, cap: true });
        };
        for (let iter = 0; iter < 4; iter++) {
            line = restLine(C0, dirA, lenA, bendR, aEnd, lift);
            sampleRows();
            let minY = Infinity;
            for (const row of rows) {
                if (row.a > aEnd) continue;
                const at = line.at(row.a);
                const V = [0, at.d[2], -at.d[1]];
                for (let j = 0; j < AROUND; j += 4) { const b = -Math.PI + (j / AROUND) * Math.PI * 2; const rr = reachAt(row.a, b); minY = Math.min(minY, at.p[1] + V[1] * Math.cos(b) * rr); }
            }
            if (Math.abs(minY) < 1e-4) break;
            lenA = Math.max(0.05, lenA + minY);
        }
        line = restLine(C0, dirA, lenA, bendR, aEnd, lift);
        sampleRows();

        // Bones: Tail from the hips' height down to the stem's end, then two through the fin.
        const boneBase = ctx.boneBase;
        const aT0 = Math.max(rows[1].a, (C0[1] - bones[hips].head[1]) / -dirA[1]);
        const fin = FIN_SHAPES[m.fin];
        const finLen = fin.reach(0, sc) * 0.5 + fin.reach(fin.spread * 0.6, sc) * 0.5;
        const endAt = line.at(aEnd), endP = endAt.p, endD = endAt.d;
        const joints = [];
        for (let i = 0; i <= CHAIN; i++) joints.push(aT0 + (aEnd - aT0) * Math.pow(i / CHAIN, 0.92));
        const newBones = [];
        for (let i = 0; i < CHAIN; i++) newBones.push({ name: i ? 'Tail' + (i + 1) : 'Tail', parent: i ? boneBase + i - 1 : hips, head: line.at(joints[i]).p, tail: line.at(joints[i + 1]).p });
        const fin1 = add(endP, mul(endD, finLen * 0.45)), fin2 = add(endP, mul(endD, finLen));
        newBones.push({ name: 'TailFin', parent: boneBase + CHAIN - 1, head: endP, tail: fin1 });
        newBones.push({ name: 'TailFin2', parent: boneBase + CHAIN, head: fin1, tail: fin2 });
        const chainSkin = a => {
            // Each bone wholly its own at its middle, shared half and half at each joint.
            if (a >= aEnd) return { joints: [boneBase + CHAIN - 1, boneBase + CHAIN, 0, 0], weights: [0.5, 0.5, 0, 0] };
            let i = 0;
            while (i < CHAIN - 1 && a > joints[i + 1]) i++;
            const span = joints[i + 1] - joints[i], x = (a - joints[i]) / span;
            if (x < 0.5) {
                const prev = i ? boneBase + i - 1 : hips;
                const k = 0.5 + x;
                return { joints: [boneBase + i, prev, 0, 0], weights: [k, 1 - k, 0, 0] };
            }
            const k = 1.5 - x;
            return { joints: [boneBase + i, i + 1 < CHAIN ? boneBase + i + 1 : boneBase + CHAIN, 0, 0], weights: [k, 1 - k, 0, 0] };
        };
        const ringSkin = ringV.map(v => bodySkin(pack, v, hips, legSet));
        const skinAt = (a, j) => {
            if (a >= aT0) return chainSkin(a);
            // Between the cut and the hips: from the edge's own skin toward the hips.
            const t = smooth(rows[0].a, aT0 + 0.04 * sc, a);
            const near = ringSkin[nearestRing(j)];
            const list = [];
            for (let k = 0; k < 4; k++) list.push([near.joints[k], near.weights[k] * (1 - t)]);
            const c = chainSkin(Math.max(a, aT0));
            for (let k = 0; k < 4; k++) list.push([c.joints[k], c.weights[k] * t]);
            return skinOf(list);
        };
        const bearOf = j => -Math.PI + (j / AROUND) * Math.PI * 2;
        const nearestRing = j => { const b = bearOf(j); let best = 0, bd = Infinity; for (let i = 0; i < ringBear.length; i++) { let d = Math.abs(ringBear[i] - b); d = Math.min(d, Math.PI * 2 - d); if (d < bd) { bd = d; best = i; } } return best; };

        // Picture rows: as many scale rows as fit, each row as long as its scales are wide (a share of the girth).
        const halfGirth = a => { let s = 0; const rr = []; for (let j = 0; j <= 16; j++) rr.push(reachAt(Math.min(a, aEnd), (j / 16) * Math.PI)); for (let j = 0; j < 16; j++) s += (rr[j] + rr[j + 1]) / 2 * (Math.PI / 16); return s; };
        const T = scaleTexture();
        let rowsSoFar = 0;
        const vOf = [];
        for (let k = 0; k < rows.length; k++) {
            if (k) {
                const a0 = rows[k - 1].a, a1 = rows[k].a, mult = T.mult(Math.floor(rowsSoFar));
                const pitch = 0.56 * Math.max(0.004, halfGirth((a0 + a1) / 2) / T.cols) / mult;
                rowsSoFar += (a1 - a0) / pitch;
            }
            vOf.push(rowsSoFar);
        }
        const vScale = Math.min(1 / T.rows, 0.999 / Math.max(1, vOf[vOf.length - 1]));

        // Colors: back, flanks and belly; toward the stem the tip's; at the scale line fading into the skin's tone.
        const fadeLen = 0.05 * sc;
        const lineDrop = b => 0.022 * sc * Math.pow(Math.cos(b / 2), 6) + 0.006 * sc * Math.pow(Math.sin(b / 2), 4);
        const colorAt = (a, b, p) => {
            const c = Math.cos(b);
            let col = mix(rgb.side, rgb.back, smooth(0.15, 1, -c));
            col = mix(col, rgb.belly, smooth(0.25, 0.95, c));
            col = mix(col, rgb.tip, 0.55 * smooth(0.5 * aEnd, aEnd, a));
            if (m.colors === 'koi') {
                const n1 = noise3(p[0] * 9 / sc + 3, p[1] * 7 / sc, p[2] * 9 / sc, 11), n2 = noise3(p[0] * 16 / sc, p[1] * 13 / sc + 5, p[2] * 16 / sc, 23);
                col = mix(col, rgb.patch, smooth(0.08, 0.2, n1 + 0.15 * (c > 0 ? -1 : 0.4)));
                col = mix(col, rgb.ink, smooth(0.42, 0.5, n2) * 0.95);
            }
            // At the scale line the small first scales are paler, as pearly as the belly's.
            const fade = 1 - smooth(0, fadeLen, a - rows[0].a - lineDrop(b));
            return mix(col, mix(col, rgb.belly, 0.5), fade * 0.18);
        };

        // The tail's skin, row by row.
        const contourLift=(a,b)=>contourWeight ? (cutHeight(b)-ringMinY)*contourWeight*(1-smooth(rows[0].a,rows[0].a+.24*sc+(ringMaxY-ringMinY)*.6,a)) : 0;
        const S = sheet();
        const rowIds = [];
        for (let k = 0; k < rows.length; k++) {
            const row = rows[k], at = line.at(Math.min(row.a, aEnd + 0.06 * sc));
            const d = at.d, X = [1, 0, 0], V = [0, d[2], -d[1]];
            const ids = [];
            if (row.ring0) {
                // The cut's own edge: the body's points, normals and skin.
                ringV.forEach((v, i) => {
                    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], b = ringBear[i];
                    ids.push(S.vertex(p, [NB[v * 3], NB[v * 3 + 1], NB[v * 3 + 2]], [Math.abs(b) / Math.PI, vOf[k] * vScale], colorAt(row.a, b, p), ringSkin[i]));
                });
                row.bear = topologyBear;
            } else {
                const capT = row.cap ? 1 : 0;
                for (let j = 0; j < AROUND; j++) {
                    const b = bearOf(j);
                    const rr = capT ? 0.0008 * sc : reachAt(row.a, b);
                    const p = add(at.p, add(mul(X, Math.sin(b) * rr), mul(V, Math.cos(b) * rr)));
                    p[1]+=contourLift(row.a,b);
                    const off = row.cap ? mul(d, 0.004 * sc) : [0, 0, 0];
                    ids.push(S.vertex(add(p, off), norm(add(mul(X, Math.sin(b)), mul(V, Math.cos(b)))), [Math.abs(b) / Math.PI, vOf[k] * vScale], colorAt(row.a, b, p), skinAt(row.a, j)));
                }
                row.bear = Array.from({ length: AROUND }, (_, j) => bearOf(j));
            }
            rowIds.push(ids);
        }
        // Rows joined: equal rows quad by quad, the edge to the first row zipped by bearing.
        const join = (A, Ab, B, Bb) => {
            let i = 0, j = 0;
            const na = A.length, nb = B.length;
            while (i < na || j < nb) {
                const ai = A[i % na], bj = B[j % nb];
                const an = Ab[(i + 1) % na] + ((i + 1) >= na ? Math.PI * 2 : 0), bn = Bb[(j + 1) % nb] + ((j + 1) >= nb ? Math.PI * 2 : 0);
                if (j >= nb || (i < na && an <= bn)) { S.tri(ai, bj, A[(i + 1) % na]); i++; }
                else { S.tri(ai, bj, B[(j + 1) % nb]); j++; }
            }
        };
        for (let k = 0; k + 1 < rowIds.length; k++) join(rowIds[k], rows[k].bear, rowIds[k + 1], rows[k + 1].bear);
        // The cut can fold sharply on heavy bodies. Its first triangle does
        // not establish the winding of the regular tail below it: doing so
        // turned the entire tail inside out on deep hip/seat folds.
        {
            const a = rowIds[1][0] * 3, b = rowIds[2][0] * 3, c = rowIds[1][1] * 3, Pp = S.p;
            const n = cross([Pp[b]-Pp[a],Pp[b+1]-Pp[a+1],Pp[b+2]-Pp[a+2]], [Pp[c]-Pp[a],Pp[c+1]-Pp[a+1],Pp[c+2]-Pp[a+2]]);
            const d = line.at(rows[1].a).d, outward = [0,-d[2],d[1]];
            if (dot(n,outward) < 0) for(let t=0;t<S.i.length;t+=3){const q=S.i[t+1];S.i[t+1]=S.i[t+2];S.i[t+2]=q;}
        }
        smoothNormals(S, new Set(rowIds[0]));
        // The second row's normals halfway to the body's, so the light runs on across the cut.
        rowIds[1].forEach((id, j) => { const near = rowIds[0][nearestRing(j)]; const n = norm(lerp([S.n[id * 3], S.n[id * 3 + 1], S.n[id * 3 + 2]], [S.n[near * 3], S.n[near * 3 + 1], S.n[near * 3 + 2]], 0.5)); S.n[id * 3] = n[0]; S.n[id * 3 + 1] = n[1]; S.n[id * 3 + 2] = n[2]; });
        const parts = [S.part('Tail', { texture: 'merscales.png', normalTexture: 'merscales_n.png', normalScale: 0.9, keepColors: true, roughness: 0.32, metalness: 0.08, envMapIntensity: 1.25, kind: 'scales' })];

        // ── fins ──
        const F = sheet();
        const finRgb = (u, v) => {
            let c = mix(rgb.fin, rgb.edge, smooth(0.25, 1, v));
            if (m.colors === 'koi') c = mix(c, rgb.patch, 0.85 * smooth(0.25, 0.45, noise3(u * 4, v * 3, 1, 7)) * (1 - v * 0.6));
            return c;
        };
        /**
         * One membrane: rays fanning from a root line. `ray(i, v)` gives the
         * point along ray i at share v of its length; `rays` how many,
         * `skin(i, v)`; the picture's rays at u from 0 to `uSpan`.
         */
        const membrane = (count, steps, ray, skin, uSpan, mirror) => {
            const cols = count * 2, base = F.p.length / 3, ids = [];
            for (let c = 0; c <= cols; c++) {
                const i = c / cols * (count - 1);
                for (let s = 0; s <= steps; s++) {
                    const v = s / steps;
                    const p = ray(i, v);
                    const u = mirror ? Math.abs(c / cols * 2 - 1) * uSpan : (c / cols) * uSpan;
                    ids.push(F.vertex(p, [0, 1, 0], [u, v], finRgb(c / cols, v), skin(i, v)));
                }
            }
            for (let c = 0; c < cols; c++) for (let s = 0; s < steps; s++) {
                const a = base + c * (steps + 1) + s, b = a + steps + 1;
                F.tri(a, b, a + 1); F.tri(a + 1, b, b + 1);
            }
            return ids;
        };
        // The tail fin: rays fanning from inside the flattened stem.
        {
            const O = line.at(aEnd + 0.01 * sc).p, d = endD, X = [1, 0, 0], V = [0, d[2], -d[1]];
            const count = fin.rays * 2 + 1, spread = fin.spread;
            const rayDir = i => { const ang = (i / (count - 1) * 2 - 1) * spread; return { ang, dir: add(mul(d, Math.cos(ang)), mul(X, Math.sin(ang))) }; };
            membrane(count, 14, (i, v) => {
                const { ang, dir } = rayDir(i);
                const reach = fin.reach(ang, sc);
                const root = add(O, mul(X, (i / (count - 1) * 2 - 1) * finRootW * 0.85));
                // Pleated along the rays, cupped a little, a veil waving and curling at its end.
                const pleat = 0.0035 * sc * v * Math.sin((i + 0.5) * Math.PI);
                const cup = m.fin === 'veil' ? 0.05 * sc * v * v * Math.sin(ang * 3 + 0.6) : 0.02 * sc * v * v;
                const lift = m.fin === 'veil' ? 0.06 * sc * v * v : 0.015 * sc * v * v;
                return add(add(root, mul(dir, reach * v)), mul(V, -(pleat + cup + lift)));
            }, (i, v) => {
                const x = v * finLen / finLen;
                if (x < 0.25) return { joints: [boneBase + CHAIN - 1, boneBase + CHAIN, 0, 0], weights: [0.6 - x * 2, 0.4 + x * 2, 0, 0] };
                if (x < 0.55) return { joints: [boneBase + CHAIN, boneBase + CHAIN + 1, 0, 0], weights: [1 - (x - 0.25) / 0.6, (x - 0.25) / 0.6, 0, 0] };
                return { joints: [boneBase + CHAIN + 1, boneBase + CHAIN, 0, 0], weights: [Math.min(1, 0.5 + (x - 0.55) * 1.8), Math.max(0, 0.5 - (x - 0.55) * 1.8), 0, 0] };
            }, 1, true);
        }
        // Small fins.
        const tailPoint = (a, b, out = 0) => { const at = line.at(a), V = [0, at.d[2], -at.d[1]], rr = reachAt(a, b) + out, p=add(at.p, add(mul([1, 0, 0], Math.sin(b) * rr), mul(V, Math.cos(b) * rr))); p[1]+=contourLift(a,b); return { p, n: norm(add(mul([1, 0, 0], Math.sin(b)), mul(V, Math.cos(b)))), d: at.d }; };
        if (m.hipFins) {
            // A pelvic fin each side, low on the hips, swept back along the tail.
            for (const side of [1, -1]) {
                const a0 = aM + 0.02 * sc, a1 = a0 + 0.11 * sc, b = side * 1.75;
                membrane(7, 8, (i, v) => {
                    const a = a0 + (a1 - a0) * (i / 6);
                    const q = tailPoint(a, b, -0.004 * sc);
                    const out = norm(add(q.n, mul(q.d, 1.1)));
                    const reach = 0.16 * sc * (0.55 + 0.45 * Math.sin((1 - i / 6) * Math.PI * 0.5 + 0.35)) * (1 - 0.45 * (i / 6));
                    return add(q.p, add(mul(out, reach * v), mul(q.n, 0.02 * sc * v * v)));
                }, (i, v) => chainSkin(a0 + (a1 - a0) * (i / 6) + v * 0.1 * sc), 0.58, false);
            }
        }
        if (m.backFin) {
            // A low crest down the back of the tail, from the hips to its middle.
            const a0 = aM - 0.02 * sc, a1 = a0 + 0.42 * (aEnd - aM);
            membrane(12, 6, (i, v) => {
                const t = i / 11, a = a0 + (a1 - a0) * t;
                const q = tailPoint(a, Math.PI, -0.003 * sc);
                const h = 0.06 * sc * Math.sin(Math.min(1, t * 1.25) * Math.PI) * (1 - 0.25 * t) + 0.004 * sc;
                return add(q.p, add(mul(q.n, h * v), mul(q.d, h * v * 0.9)));
            }, (i, v) => chainSkin(a0 + (a1 - a0) * (i / 11) + v * 0.04 * sc), 1, false);
        }
        if (m.armFins) {
            // Along the back of each forearm, from near the wrist toward the elbow, raised and swept back.
            const Pn = P;
            for (const side of ['Left', 'Right']) {
                const fa = idx(side + 'ForeArm'), hd = idx(side + 'Hand');
                if (fa < 0 || hd < 0) continue;
                const e = bones[fa].head, w = bones[hd].head, axis = norm(sub(w, e)), length = len(sub(w, e));
                // The forearm's back: away from the body's front and down, square to the forearm.
                const back = norm(sub([0, -0.35, -1], mul(axis, dot([0, -0.35, -1], axis))));
                const verts = [];
                for (const v of pack._bodyIds) {
                    let wv = 0;
                    for (let k = 0; k < 4; k++) if (pack.skinJoints[v * 4 + k] === fa) wv += pack.skinWeights[v * 4 + k];
                    if (wv > 0.6) verts.push(v);
                }
                // How far the forearm's back reaches from its axis along it, eased: the fin's root runs smooth.
                const reachBack = t => {
                    const c = add(e, mul(axis, length * t));
                    let bd = 0.02 * sc;
                    for (const v of verts) {
                        const o = [Pn[v * 3] - c[0], Pn[v * 3 + 1] - c[1], Pn[v * 3 + 2] - c[2]];
                        if (Math.abs(dot(o, axis)) > 0.02 * sc) continue;
                        bd = Math.max(bd, dot(o, back));
                    }
                    return bd;
                };
                const samples = Array.from({ length: 7 }, (_, i) => reachBack(0.82 - (i / 6) * 0.55));
                const surface = t => {
                    const x = clamp((0.82 - t) / 0.55 * 6, 0, 6), i = Math.min(5, Math.floor(x)), k = x - i;
                    return add(add(e, mul(axis, length * t)), mul(back, samples[i] * (1 - k) + samples[i + 1] * k));
                };
                membrane(7, 7, (i, v) => {
                    const t = 0.82 - (i / 6) * 0.55, q = add(surface(t), mul(back, -0.003 * sc));
                    const h = 0.075 * sc * Math.sin((0.2 + 0.8 * (i / 6)) * Math.PI * 0.62) * (1 - 0.25 * (i / 6)) + 0.008 * sc;
                    const dir = norm(add(back, mul(axis, -0.5)));
                    return add(q, mul(dir, h * v));
                }, () => ({ joints: [fa, 0, 0, 0], weights: [1, 0, 0, 0] }), 0.58, false);
            }
        }
        if (m.finEars && L.earL && L.earR) {
            // Fin ears: a fan behind each cheek where the ear would be, swept back and a little up.
            const head = idx('Head');
            for (const [ear, side] of [[L.earL, 1], [L.earR, -1]]) {
                const c = ear.center, out = norm([side, 0.05, -0.15]);
                // Rooted down the line where the ear met the head; the upper rays longest, sweeping back and up.
                const rootA = add(c, [0, 0.026 * sc, 0.006 * sc]), rootB = add(c, [0, -0.024 * sc, 0.004 * sc]);
                membrane(8, 8, (i, v) => {
                    const t = i / 7, rootP = add(lerp(rootA, rootB, t), mul(out, -0.003 * sc));
                    const dir = norm(add(lerp([0, 0.62, -0.78], [0, -0.3, -0.95], t), mul(out, 0.42)));
                    const reach = sc * (0.1 - 0.05 * t) * (1 - 0.12 * Math.sin(t * Math.PI * 7) * 0.3);
                    return add(add(rootP, mul(dir, reach * v)), mul(out, 0.01 * sc * v * v));
}, () => ({ joints: [head, 0, 0, 0], weights: [1, 0, 0, 0] }), 0.58, false);
            }
        }
        // Fin normals: square to each fin, smoothed over it.
        smoothNormals(F);
        if (F.i.length) parts.push(F.part('Fins', { texture: 'merfin.png', opacity: 0.97, keepColors: true, doubleSided: true, roughness: 0.25, metalness: 0, envMapIntensity: 1.2, kind: 'fin', noShade: true }));

        // Loose scales on the skin above the scale line, thinning upward; not where clothes cover the skin.
        const hiddenByOutfit = ctx.outfitHidden || new Set();
        {
            const D = sheet(), src = pack.body.source, I = pack.body.index, made = new Map();
            // The band from the lowest point of the cut: the picture's solid rows cover the cut's own uneven edge.
            const bandH = (ringMaxY - ringMinY) + 0.055 * sc;
            for (const t of cut.band) {
                const vs = [src[I[t]], src[I[t + 1]], src[I[t + 2]]];
                if (vs.every(v => hiddenByOutfit.has(v))) continue;
                if (vs.every(v => cut.hidden.has(v))) continue;
                const ids = vs.map(v => {
                    if (made.has(v)) return made.get(v);
                    const p = [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], n = [NB[v * 3], NB[v * 3 + 1], NB[v * 3 + 2]];
                    const b = Math.atan2(p[0], p[2] - C0[2]);
                    const h = clamp((p[1] - ringMinY + lineDrop(b) * 0.5) / bandH, 0, 1);
                    const id = D.vertex(add(p, mul(n, 0.0008 * sc)), n, [Math.abs(b) / Math.PI, h], mix(colorAt(rows[0].a + fadeLen, b, p), rgb.belly, 0.12), bodySkin(pack, v, hips, legSet));
                    made.set(v, id);
                    return id;
                });
                D.tri(ids[0], ids[1], ids[2]);
            }
            if (D.i.length) parts.push(D.part('Scale line', { texture: 'merscatter.png', cutout: true, alphaCutoff: 0.5, keepColors: true, roughness: 0.34, metalness: 0.06, kind: 'scales', source: Int32Array.from([...made.keys()]) }));
        }
        const textures = { 'merscales.png': T.albedo, 'merscales_n.png': T.normal, 'merfin.png': finTexture(), 'merscatter.png': scatterTexture() };
        return { parts, bones: newBones, textures, line, info: { C0, aT0, aEnd, aM, joints, total: aEnd, crotch, reachAt, sc } };
    }

    /** Moves every influence of a leg bone to the hips, in place on copies: the legs carry no skin. */
    function liftLegs(parts, bones) {
        const hips = bones.findIndex(b => b.name === 'Hips');
        const leg = new Set(bones.map((b, i) => (LEG_BONES.test(b.name) ? i : -1)).filter(i => i >= 0));
        return parts.map(p => {
            if (!p.joints) return p;
            let touched = false;
            for (let i = 0; i < p.joints.length; i++) if (leg.has(p.joints[i]) && p.weights[i] > 0) { touched = true; break; }
            if (!touched) return p;
            const J = Uint8Array.from(p.joints), Wt = Float32Array.from(p.weights);
            for (let v = 0; v < J.length / 4; v++) {
                const list = [];
                for (let k = 0; k < 4; k++) list.push([leg.has(J[v * 4 + k]) ? hips : J[v * 4 + k], Wt[v * 4 + k]]);
                const s = skinOf(list);
                for (let k = 0; k < 4; k++) { J[v * 4 + k] = s.joints[k]; Wt[v * 4 + k] = s.weights[k]; }
            }
            return Object.assign({}, p, { joints: J, weights: Wt });
        });
    }

    /** Wet hair, in place: darker and deeper in its own color, glossy. */
    function wetHair(parts) {
        for (const p of parts) {
            if (p.colors) {
                const c = Float32Array.from(p.colors);
                for (let i = 0; i < c.length; i += 3) {
                    const l = (c[i] + c[i + 1] + c[i + 2]) / 3;
                    for (let k = 0; k < 3; k++) c[i + k] = Math.max(0, (l + (c[i + k] - l) * 1.25) * 0.6);
                }
                p.colors = c;
            }
            p.roughness = 0.3;
            p.wet = true;
        }
        return parts;
    }

    // ── pictures ──────────────────────────────────────────────────────────
    let scaleCache = null;
    /**
     * The scale picture and its relief. Across: from the belly's middle (0)
     * to the back's middle (1), mirrored on the other side; down: rows of
     * overlapping scales, each row's free edges toward the tail's end, as
     * many to a row all the way down (so they grow smaller as the tail
     * narrows), the first row fading in. Each scale its own shade and its
     * own small tilt.
     */
    function scaleTexture() {
        if (scaleCache) return scaleCache;
        const W = 512, Hh = 2048, COLS = 20, ROWS = 150;
        const mult = () => 1;
        const albedo = new Uint8Array(W * Hh * 4), height = new Float32Array(W * Hh);
        const h2 = (x, y, s) => { let n = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(s, 83492791); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
        const R = 0.78;
        for (let y = 0; y < Hh; y++) {
            const fv = (y + 0.5) / Hh * ROWS, row = Math.floor(fv);
            for (let x = 0; x < W; x++) {
                const u = (x + 0.5) / W;
                // The visible scale: the one nearest the head (lowest row) whose disc covers this point.
                let found = null;
                for (let rr = row - 2; rr <= row + 1 && !found; rr++) {
                    if (rr < 0) continue;
                    const cols = COLS * mult(rr), off = (rr & 1) * 0.5, fu = u * cols - off;
                    const cc = Math.floor(fu);
                    let best = null;
                    for (let dc = -1; dc <= 1; dc++) {
                        const du = fu - (cc + dc + 0.5);
                        // Rows run 0.56 of a column apart: the distance down in the scale's own column widths.
                        const dv = (fv - (rr + 0.3)) * 0.56 * mult(row) / mult(rr);
                        const d = Math.hypot(du, dv * 1.25);
                        if (d < R && (!best || d < best.d)) best = { d, du, dv, rr, cc: cc + dc };
                    }
                    if (best) found = best;
                }
                const o = (y * W + x) * 4, i = y * W + x;
                if (!found) { albedo[o] = albedo[o + 1] = albedo[o + 2] = 150; albedo[o + 3] = 255; height[i] = 0; continue; }
                const id = h2(found.cc, found.rr, 5), tilt = (h2(found.cc, found.rr, 9) - 0.5), tilt2 = (h2(found.cc, found.rr, 13) - 0.5);
                const e = found.d / R;
                // Lighter toward its free edge, a groove right at it; faint growth rings across it.
                const rim = smooth(0.8, 0.97, e), rings = 0.5 + 0.5 * Math.cos(e * 26);
                let l = 0.74 + 0.144 * (id - 0.5) + 0.1 * smooth(0.3, 0.9, e) - 0.28 * rim + 0.03 * rings * (1 - e);
                // Shaded where it slips under the scale before it.
                l -= 0.16 * smooth(-0.05, -0.32, found.dv);
                // At the scale line the scales fade in: flat and pale in the first rows.
                const fade = smooth(0, 0.7, fv);
                l = 0.84 + (l - 0.84) * fade;
                const g = Math.round(255 * clamp(l, 0, 1));
                albedo[o] = albedo[o + 1] = albedo[o + 2] = g; albedo[o + 3] = 255;
                // The relief: rising toward the free edge, a low dome, tipped its own way, dropping at the edge.
                height[i] = fade * ((0.6 + found.dv * 0.9) * (1 - rim * 0.8) + 0.35 * (1 - e * e) + tilt * found.du * 0.9 + tilt2 * found.dv * 0.6);
            }
        }
        const normal = new Uint8Array(W * Hh * 4);
        const at = (x, y) => height[clamp(y, 0, Hh - 1) * W + ((x % W) + W) % W];
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
            const dx = (at(x + 1, y) - at(x - 1, y)) * 0.5 * (W / COLS) * 0.08, dy = (at(x, y + 1) - at(x, y - 1)) * 0.5 * (Hh / ROWS) * 0.08;
            const l = Math.hypot(dx, dy, 1), o = (y * W + x) * 4;
            // Tangent space: +x along u, +y up the picture (against v).
            normal[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); normal[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255); normal[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); normal[o + 3] = 255;
        }
        scaleCache = { albedo: { width: W, height: Hh, data: albedo, name: 'merscales.png' }, normal: { width: W, height: Hh, data: normal, name: 'merscales_n.png' }, cols: COLS, rows: ROWS, mult };
        return scaleCache;
    }

    let finCache = null;
    /**
     * The fin picture: across, twelve rays from the root (bottom) to the edge
     * (top), each branching in two past the middle and jointed along its
     * length; between them a thin membrane, clearer toward the edge.
     */
    function finTexture() {
        if (finCache) return finCache;
        const W = 256, Hh = 256, RAYS = 12, data = new Uint8Array(W * Hh * 4);
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
            const u = (x + 0.5) / W, v = (y + 0.5) / Hh;
            const fu = u * RAYS, k = Math.floor(fu), f = fu - k - 0.5;
            // Past the middle each ray parts in two, the halves drifting apart toward the edge.
            const split = smooth(0.5, 1, v) * 0.2;
            const dist = Math.min(Math.abs(f), Math.abs(Math.abs(f) - split)) * (split > 0.02 ? 1 : 1);
            const width = 0.085 * (1 - 0.5 * v);
            const ray = smooth(width, width * 0.35, dist);
            // Joints: short pale gaps along each ray, closer toward the edge.
            const joint = v > 0.25 ? smooth(0.07, 0.0, Math.abs(((v * (14 + 10 * v)) % 1) - 0.5) - 0.42) : 0;
            const rayA = ray * (1 - 0.5 * joint);
            const membrane = 0.66 - 0.2 * v + 0.04 * Math.sin(u * 90 + v * 7);
            const edge = smooth(0.985, 0.94, v);
            const a = clamp(Math.max(membrane, 0.96 * rayA) * edge, 0, 1);
            const l = 0.93 - 0.18 * rayA + 0.07 * (1 - v);
            const o = (y * W + x) * 4, g = Math.round(255 * clamp(l, 0, 1));
            data[o] = g; data[o + 1] = g; data[o + 2] = Math.min(255, g + 4); data[o + 3] = Math.round(255 * a);
        }
        finCache = { width: W, height: Hh, data, name: 'merfin.png' };
        return finCache;
    }

    let scatterCache = null;
    /** The scale line: whole rows of small scales over the cut, their tops a scalloped line; a few loose scales above it. */
    function scatterTexture() {
        if (scatterCache) return scatterCache;
        // Across: half the girth (about 45 cm); down: the band (about 8 cm), the scale line at the top row.
        const W = 512, Hh = 256, data = new Uint8Array(W * Hh * 4);
        let q = 4242;
        const rand = () => { q ^= q << 13; q >>>= 0; q ^= q >> 17; q ^= q << 5; q >>>= 0; return q / 4294967296; };
        const pxU = W / 450, pxV = Hh / 80, R = 4.6;
        for (let i = 0; i < W * Hh; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 200; data[i * 4 + 3] = 0; }
        // Rows of small scales from the bottom up: whole rows over the cut, then fewer and smaller, loosening.
        const pitch = R * 2 * 0.55;
        for (let row = 0, mmV = 0; mmV < 80; row++, mmV += pitch) {
            const v = mmV / 80;
            const keep = v < 0.4 ? 1 : 0.2 * Math.pow(Math.max(0, 1 - (v - 0.4) / 0.45), 2);
            const cols = Math.round(450 / (R * 2));
            for (let c = 0; c < cols; c++) {
                if (rand() > keep) continue;
                const loose = smooth(0.38, 0.6, v);
                const cu = (c + 0.5 + (row & 1) * 0.5 + (rand() - 0.5) * loose * 1.2) * (R * 2), cv = mmV + (rand() - 0.5) * loose * pitch * 1.4;
                const r = R * (1 - 0.25 * loose) * (0.9 + 0.2 * rand()), shade = rand();
                const rx = r * pxU, ry = r * pxV, cx = cu * pxU, cy = cv * pxV;
                for (let y = Math.max(0, Math.floor(cy - ry)); y <= Math.min(Hh - 1, Math.ceil(cy + ry)); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
                    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
                    // Round at its free edge (down, toward the tail), a little pointed at its root.
                    const d = Math.hypot(dx * (dy > 0 ? 1 + 0.35 * dy : 1), dy);
                    if (d > 1) continue;
                    const xx = clamp(x, 0, W - 1), o = (y * W + xx) * 4;
                    const l = 0.7 + 0.12 * shade + 0.1 * (1 - d) - 0.26 * smooth(0.78, 1, d) * smooth(0, -0.6, dy);
                    data[o] = data[o + 1] = data[o + 2] = Math.round(255 * clamp(l, 0, 1)); data[o + 3] = 255;
                }
            }
        }
        scatterCache = { width: W, height: Hh, data, name: 'merscatter.png' };
        return scatterCache;
    }

    // ── motion ────────────────────────────────────────────────────────────
    const qmul = (a, b) => Glb.multiply(a, b), qaxis = (x, y, z, a) => Glb.axisAngle(x, y, z, a);
    const qconj = q => [-q[0], -q[1], -q[2], q[3]];
    const qrot = (q, v) => {
        const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
        return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
    };
    const ortho = (s, d) => { const k = dot(s, d); const o = [s[0] - d[0] * k, s[1] - d[1] * k, s[2] - d[2] * k]; return len(o) > 1e-6 ? norm(o) : norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])); };
    /** The turn taking x to d and y to s (made square to d). */
    function frameQuat(d, s) {
        const a = norm(d), b = ortho(s, a), c = cross(a, b);
        const m00 = a[0], m01 = b[0], m02 = c[0], m10 = a[1], m11 = b[1], m12 = c[1], m20 = a[2], m21 = b[2], m22 = c[2], t = m00 + m11 + m22;
        let q;
        if (t > 0) { const k = 0.5 / Math.sqrt(t + 1); q = [(m21 - m12) * k, (m02 - m20) * k, (m10 - m01) * k, 0.25 / k]; }
        else if (m00 > m11 && m00 > m22) { const k = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [0.25 * k, (m01 + m10) / k, (m02 + m20) / k, (m21 - m12) / k]; }
        else if (m11 > m22) { const k = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m01 + m10) / k, 0.25 * k, (m12 + m21) / k, (m02 - m20) / k]; }
        else { const k = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m02 + m20) / k, (m12 + m21) / k, 0.25 * k, (m10 - m01) / k]; }
        const l = Math.hypot(...q);
        return q.map(v => v / l);
    }
    function slerp(a, b, t) {
        let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
        const bb = d < 0 ? b.map(x => -x) : b; d = Math.abs(d);
        if (d > 0.9995) { const q = a.map((x, i) => x + (bb[i] - x) * t), l = Math.hypot(...q); return q.map(x => x / l); }
        const th = Math.acos(d), s = Math.sin(th);
        return a.map((x, i) => (x * Math.sin((1 - t) * th) + bb[i] * Math.sin(t * th)) / s);
    }
    const I4 = [0, 0, 0, 1];
    const TAU = Math.PI * 2;

    /** What the clips need of a skeleton: its bones by name, the tail's chain and how it rests, the arms' rest frames. */
    function rigOf(bones, body) {
        const index = new Map(bones.map((b, i) => [b.name, i]));
        const tail = [];
        for (let i = 0; i < CHAIN; i++) tail.push(index.get(i ? 'Tail' + (i + 1) : 'Tail'));
        tail.push(index.get('TailFin'), index.get('TailFin2'));
        if (tail.some(i => i === undefined)) return null;
        const restDir = tail.map(i => norm(sub(bones[i].tail, bones[i].head)));
        const restFrame = restDir.map(d => frameQuat(d, [1, 0, 0]));
        const segLen = tail.map(i => len(sub(bones[i].tail, bones[i].head)));
        const total = segLen.reduce((s, x) => s + x, 0);
        let acc = 0;
        const along = segLen.map(l => { const m = (acc + l / 2) / total; acc += l; return m; });
        const headBone = index.get('Head'), hips = index.get('Hips'), spine0 = index.get('Spine');
        const sc = headBone !== undefined ? Math.max(0.3, bones[headBone].head[1] / 1.518) : 1;
        // The tail's girth along it, for where it meets the floor: the hips' at the top, tapering to the stem;
        // and how far the belly and the hips reach in front of their joints. Measured on the body's skin at rest
        // (the hips' and thighs' skin is the hips' once the legs carry none).
        let w0 = 0.16 * sc, f0 = 0.09 * sc, frontSpine = 0.12 * sc, frontHips = 0.12 * sc;
        if (body && body.positions && body.joints) {
            const P = body.positions, J = body.joints, Wt = body.weights, y0 = bones[tail[0]].head[1];
            const sp = spine0 !== undefined ? bones[spine0].head : null, hp = bones[hips].head;
            let mx = 0, zF = -Infinity, zB = Infinity, fS = 0, fH = 0;
            for (let v = 0; v < P.length / 3; v++) {
                let best = 0;
                for (let k = 1; k < 4; k++) if (Wt[v * 4 + k] > Wt[v * 4 + best]) best = k;
                const j = J[v * 4 + best];
                if (j !== hips && j !== spine0) continue;
                const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
                if (Math.abs(y - y0) < 0.015 * sc) { mx = Math.max(mx, Math.abs(x)); zF = Math.max(zF, z); zB = Math.min(zB, z); }
                if (sp && Math.abs(y - sp[1]) < 0.02 * sc && Math.abs(x) < 0.06 * sc) fS = Math.max(fS, z - sp[2]);
                if (Math.abs(y - hp[1]) < 0.02 * sc && Math.abs(x) < 0.06 * sc) fH = Math.max(fH, z - hp[2]);
            }
            if (mx > 0) { w0 = mx; f0 = (zF - zB) / 2; }
            if (fS > 0) frontSpine = fS;
            if (fH > 0) frontHips = fH;
        }
        const girth = along.map(u => ({ w: w0 * (0.17 + 0.83 * Math.pow(1 - Math.min(1, u * 1.08), 1.15)), f: f0 * (0.32 + 0.68 * Math.pow(1 - Math.min(1, u * 1.08), 1.1)) }));
        girth[CHAIN] = { w: 0.03 * sc, f: 0.004 * sc }; girth[CHAIN + 1] = { w: 0.02 * sc, f: 0.003 * sc };
        const arm = {};
        for (const side of ['Left', 'Right']) {
            const a = index.get(side + 'Arm'), f = index.get(side + 'ForeArm'), h = index.get(side + 'Hand');
            if (a === undefined || f === undefined || h === undefined) continue;
            const up = norm(sub(bones[f].head, bones[a].head)), fo = norm(sub(bones[h].head, bones[f].head));
            // The back of the hand at rest: away from the palm, square to the forearm.
            const i1 = index.get(side + 'HandIndex1'), p1 = index.get(side + 'HandPinky1'), m1 = index.get(side + 'HandMiddle1');
            let back = [0, 1, 0];
            if (i1 !== undefined && p1 !== undefined && m1 !== undefined) {
                const across = sub(bones[i1].head, bones[p1].head), fwd = sub(bones[m1].head, bones[h].head);
                back = norm(side === 'Left' ? cross(fwd, across) : cross(across, fwd));
                if (back[1] < 0) back = mul(back, -1);
            }
            const hand = m1 !== undefined ? norm(sub(bones[m1].head, bones[h].head)) : fo;
            arm[side] = { a, f, h, up, fo, back, hand, upLen: len(sub(bones[f].head, bones[a].head)), foLen: len(sub(bones[h].head, bones[f].head)), sign: side === 'Left' ? 1 : -1 };
        }
        return { bones, index, tail, restDir, restFrame, segLen, along, total, girth, arm, sc, hips, spine0, front: { spine: frontSpine, hips: frontHips } };
    }

    /**
     * One frame's turns as each bone's own: `world` (bone -> its turn in the
     * world) wins; others take `local` or stay at rest. Also each joint's
     * place, the hips raised by `lift`.
     */
    function resolve(rig, world, local, lift) {
        const B = rig.bones, n = B.length, W = new Array(n), L = new Array(n), Pp = new Array(n);
        for (let i = 0; i < n; i++) {
            const p = B[i].parent, Wp = p >= 0 ? W[p] : I4;
            if (world.has(i)) { W[i] = world.get(i); L[i] = qmul(qconj(Wp), W[i]); }
            else { L[i] = local.get(i) || I4; W[i] = qmul(Wp, L[i]); }
            if (p < 0) Pp[i] = [B[i].head[0], B[i].head[1] + (lift || 0), B[i].head[2]];
            else { const o = qrot(W[p], sub(B[i].head, B[p].head)); Pp[i] = add(Pp[p], o); }
        }
        return { W, L, P: Pp };
    }

    /** The tail's bones turned to point along `dirs` (world), each turned as little as it can about its own length, plus `roll`. */
    function aimTail(rig, world, base, dirs, roll) {
        let side = qrot(base, [1, 0, 0]), was = 0;
        rig.tail.forEach((b, i) => {
            side = ortho(side, dirs[i]);
            // A roll about the tail's own length, growing along it.
            if (roll) { const r = roll[i] || 0; if (r !== was) side = qrot(qaxis(dirs[i][0], dirs[i][1], dirs[i][2], r - was), side); was = r; }
            world.set(b, qmul(frameQuat(dirs[i], side), qconj(rig.restFrame[i])));
        });
    }

    /** Directions from turns off the tail's line: pitch (toward the belly) and sway (to the left), in `base`'s frame. */
    const dirOf = (base, pitch, sway) => qrot(base, [Math.sin(sway), -Math.cos(pitch) * Math.cos(sway), Math.sin(pitch) * Math.cos(sway)]);

    /** An arm pointed along `up` (shoulder to elbow) and `fo` (elbow to wrist), the back of its hand toward `back`. */
    function aimArm(rig, world, side, up, fo, back) {
        const A = rig.arm[side];
        if (!A) return;
        world.set(A.a, qmul(frameQuat(up, back), qconj(frameQuat(A.up, A.back))));
        world.set(A.f, qmul(frameQuat(fo, back), qconj(frameQuat(A.fo, A.back))));
    }

    /** A hand pointed along `dir` (wrist to knuckles), its back toward `back`. */
    function aimHand(rig, world, side, dir, back) {
        const A = rig.arm[side];
        if (A) world.set(A.h, qmul(frameQuat(dir, back), qconj(frameQuat(A.hand, A.back))));
    }

    /** Shoulder to wrist reaching `target`, the elbow bending toward `pole`: the upper arm's and forearm's directions. */
    function reach(rig, side, shoulder, target, pole) {
        const A = rig.arm[side], a = A.upLen, b = A.foLen;
        const d = sub(target, shoulder), dist = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, len(d))), dn = norm(d);
        const cosA = (a * a + dist * dist - b * b) / (2 * a * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
        const p = ortho(pole, dn), elbow = add(shoulder, add(mul(dn, a * cosA), mul(p, a * sinA)));
        return { up: norm(sub(elbow, shoulder)), fo: norm(sub(add(shoulder, mul(dn, dist)), elbow)), elbow, short: len(d) - dist };
    }

    /** The lowest any of the tail reaches below its bones (an ellipse round each), and the lowest joint listed. */
    function lowest(rig, R, extra) {
        let low = Infinity;
        rig.tail.forEach((b, i) => {
            const g = rig.girth[i], q = R.W[b];
            const X = qrot(q, [1, 0, 0]), V = qrot(q, cross(rig.restDir[i], [1, 0, 0]).map(x => -x));
            const down = Math.hypot(g.w * X[1], g.f * V[1]);
            const tip = add(R.P[b], qrot(q, mul(rig.restDir[i], rig.segLen[i])));
            low = Math.min(low, R.P[b][1] - down, (R.P[b][1] + tip[1]) / 2 - down);
            if (i >= CHAIN) low = Math.min(low, tip[1]);
        });
        for (const [b, r] of extra || []) low = Math.min(low, R.P[b][1] - r);
        return low;
    }

    /** The upper body of the humanoid Idle: arms down from the A-pose, the chest rising, the head settling (w the breath). */
    function idleUpper(rig, armAngle, w, local) {
        const B = rig.bones;
        for (const side of ['Left', 'Right']) {
            const A = rig.arm[side];
            if (!A) continue;
            const current = Math.atan2(Math.abs(A.up[0]), -A.up[1]);
            const lower = current - armAngle;
            local.set(A.a, qmul(qaxis(0, 0, 1, A.sign * (-lower - 0.015 * w)), qaxis(1, 0, 0, -0.05)));
            const u = A.up, f = A.fo;
            let ax = cross(u, f), l = len(ax);
            const rest = l > 1e-6 ? Math.atan2(l, dot(u, f)) : 0;
            if (l < 1e-6) { ax = [u[1], -u[0], 0]; l = Math.hypot(ax[0], ax[1]) || 1; }
            local.set(A.f, qaxis(ax[0] / l, ax[1] / l, ax[2] / l, 0.35 - rest));
        }
        const set = (name, q) => { const i = rig.index.get(name); if (i !== undefined) local.set(i, q); };
        set('Spine1', qaxis(1, 0, 0, -0.012 * w));
        set('Spine2', qaxis(1, 0, 0, -0.018 * w));
        set('Head', qaxis(1, 0, 0, 0.012 * w));
        void B;
    }

    /** The fingers held in one of the poses' hand shapes, as each finger bone's own turn. */
    function fingers(rig, shape) {
        const out = new Map();
        if (!Poses || !Poses.handShape) return out;
        for (const t of Poses.handShape(rig.bones, shape)) out.set(t.bone, Array.from(t.values.slice(0, 4)));
        return out;
    }

    /**
     * A clip baked from `frame(phase, seconds)` -> { world, local, lift }
     * at `fps`; a loop ends where it starts. Tracks for every bone a frame
     * turns; `lift` per frame.
     */
    function bake(rig, name, duration, fps, frame) {
        const steps = Math.max(2, Math.round(duration * fps) + 1);
        const times = Float32Array.from({ length: steps }, (_, i) => (duration * i) / (steps - 1));
        const series = new Map(), lifts = new Float32Array(steps);
        let meta = null;
        for (let f = 0; f < steps; f++) {
            const out = frame(f / (steps - 1), times[f]);
            const R = resolve(rig, out.world, out.local, 0);
            let lift = out.lift || 0;
            if (out.ground) lift = -lowest(rig, R, out.contacts) + (out.ground === true ? 0 : out.ground);
            lifts[f] = lift;
            if (out.meta && !meta) meta = out.meta(R, lift);
            for (const b of new Set([...out.world.keys(), ...out.local.keys()])) {
                if (!series.has(b)) series.set(b, new Float32Array(steps * 4));
                series.get(b).set(R.L[b], f * 4);
            }
        }
        const tracks = [];
        for (const [bone, values] of series) {
            for (let f = 1; f < steps; f++) {
                const o = (f - 1) * 4, c = f * 4;
                if (values[o] * values[c] + values[o + 1] * values[c + 1] + values[o + 2] * values[c + 2] + values[o + 3] * values[c + 3] < 0) for (let k = 0; k < 4; k++) values[c + k] = -values[c + k];
            }
            tracks.push({ bone, values });
        }
        return { name, times, tracks, lifts, meta };
    }

    /** The tail at rest in the world, the top following the hips' turn `hipsQ` by `follow` bones. */
    function restDirs(rig, hipsQ, follow = 3) {
        return rig.restDir.map((d, i) => qrot(slerp(hipsQ, I4, smooth(0, follow, i)), d));
    }

    /** The clips: how each is made, its name in the file, its label in the builder, and whether the file lowers it to the floor. */
    const MOTIONS = [
        { id: 'swim', name: 'Swim', label: 'Swimming' },
        { id: 'swimFast', name: 'Swim fast', label: 'Swimming fast' },
        { id: 'tread', name: 'Tread', label: 'Treading water' },
        { id: 'glide', name: 'Walk', label: 'Moving on land' },
        { id: 'sitRock', name: 'Sit', label: 'Sitting on a rock', floor: true },
        { id: 'lieSide', name: 'Lie', label: 'Lying on the side', floor: true },
        { id: 'propped', name: 'Rest', label: 'Resting on the arms', floor: true }
    ];
    /** The humanoid poses that use only the upper body: they play over the tail at rest. */
    const UPPER = ['wave', 'fight', 'armsUp', 'cast', 'sword', 'defend', 'hit', 'throw', 'pistol', 'pistolTwo', 'rifle'];
    const POSES = MOTIONS.map(m => ({ id: m.id, label: m.label })).concat(Poses ? Poses.POSES.filter(p => UPPER.includes(p.id)).map(p => ({ id: p.id, label: p.label })) : []);

    function motion(rig, id, armAngle) {
        const H = rig.hips, X = [1, 0, 0], n = rig.tail.length, sc = rig.sc;
        const relaxed = fingers(rig, 'relaxed'), flat = fingers(rig, 'flat');
        const prone = qaxis(1, 0, 0, Math.PI / 2);
        const named = name => rig.index.get(name);
        const spine = ['Spine', 'Spine1', 'Spine2'].map(named), neck = named('Neck'), head = named('Head');
        const withFingers = (local, shape) => { for (const [b, q] of shape) local.set(b, q); return local; };
        if (id === 'idle') return bake(rig, 'Idle', 3, 12, ph => {
            const w = Math.sin(TAU * ph), world = new Map(), local = withFingers(new Map(), relaxed);
            idleUpper(rig, armAngle, w, local);
            // The tail at rest, the stem and fin flicking now and then, the end swaying a little on the floor.
            const dirs = rig.restDir.map((d, i) => {
                const flick = i >= CHAIN - 2 ? 0.07 * Math.sin(TAU * 2 * ph - 0.7 * i) * (i - CHAIN + 3) / 3 : 0;
                const sway = 0.05 * Math.sin(TAU * ph + 0.45 * i) * smooth(2, 6, i);
                const pitch = Math.atan2(d[2], -d[1]);
                return dirOf(I4, pitch + flick, sway);
            });
            aimTail(rig, world, I4, dirs);
            return { world, local };
        });
        if (id === 'swim' || id === 'swimFast') {
            const fast = id === 'swimFast', T = fast ? 0.7 : 1.15;
            return bake(rig, fast ? 'Swim fast' : 'Swim', T, 30, ph => {
                const world = new Map(), local = withFingers(new Map(), flat);
                // A wave from the chest to the fin, growing toward the fin and travelling back along it.
                const wave = s => (fast ? 1.2 : 1) * (0.05 + 0.5 * Math.pow(s, 1.6)) * Math.sin(TAU * ph - TAU * 0.85 * s);
                const hipQ = qmul(prone, qaxis(1, 0, 0, wave(0.12)));
                world.set(H, hipQ);
                spine.forEach((b, k) => { if (b !== undefined) world.set(b, qmul(prone, qaxis(1, 0, 0, wave(0.08 - k * 0.04) * 0.6))); });
                if (neck !== undefined) world.set(neck, qmul(prone, qaxis(1, 0, 0, fast ? -0.25 : -0.5)));
                if (head !== undefined) world.set(head, qmul(prone, qaxis(1, 0, 0, fast ? -0.45 : -0.95 - 0.5 * wave(0.12))));
                aimTail(rig, world, prone, rig.tail.map((b, i) => dirOf(prone, wave(0.18 + 0.82 * rig.along[i]) * (i >= CHAIN ? 1.15 : 1), 0)));
                for (const side of ['Left', 'Right']) {
                    const s = rig.arm[side] ? rig.arm[side].sign : 1;
                    if (fast) aimArm(rig, world, side, norm([s * 0.12, 0.06, 1]), norm([s * 0.03, 0.03, 1]), [0, 1, 0]);
                    else {
                        // Along the sides, sweeping back a little with each kick.
                        const sweep = 0.1 * Math.sin(TAU * ph + 0.6);
                        aimArm(rig, world, side, norm([s * 0.3, -0.16 + sweep * 0.3, -0.94]), norm([s * 0.16, -0.22 + sweep, -0.96]), [s * 0.9, 0.4, 0]);
                    }
                }
                return { world, local };
            });
        }
        if (id === 'tread') return bake(rig, 'Tread', 2.4, 25, ph => {
            const world = new Map(), local = withFingers(new Map(), flat);
            const hipQ = qaxis(1, 0, 0, -0.06 + 0.02 * Math.sin(TAU * ph));
            world.set(H, hipQ);
            spine.forEach((b, k) => { if (b !== undefined) world.set(b, qaxis(1, 0, 0, 0.03 + 0.015 * k + 0.01 * Math.sin(TAU * ph))); });
            // The tail hanging below, kicking slowly; the hands sculling out and in.
            aimTail(rig, world, hipQ, rig.tail.map((b, i) => { const s = rig.along[i]; return dirOf(hipQ, -0.1 - 0.25 * s + 0.28 * s * s * Math.sin(TAU * ph - TAU * 0.7 * s) * (i >= CHAIN ? 1.3 : 1), 0.05 * s * Math.sin(TAU * ph + 1)); }));
            for (const side of ['Left', 'Right']) {
                const s = rig.arm[side] ? rig.arm[side].sign : 1, sw = 0.45 * Math.sin(TAU * ph);
                const turn = qaxis(0, 1, 0, s * sw);
                aimArm(rig, world, side, qrot(turn, norm([s * 0.78, -0.42, 0.42])), qrot(turn, norm([s * 0.5, -0.22, 0.84])), [0, 1, 0]);
            }
            return { world, local, ground: 0.05 * sc };
        });
        if (id === 'glide') return bake(rig, 'Walk', 1.4, 25, ph => {
            const world = new Map(), local = withFingers(new Map(), relaxed);
            idleUpper(rig, armAngle, Math.sin(TAU * ph * 2), local);
            // The arms swinging a little, the body swaying as the tail sweeps from side to side along the floor.
            for (const side of ['Left', 'Right']) { const A = rig.arm[side]; if (A) local.set(A.a, qmul(qaxis(1, 0, 0, 0.16 * A.sign * Math.sin(TAU * ph)), local.get(A.a))); }
            const sway = 0.035 * Math.sin(TAU * ph);
            const hipQ = qaxis(0, 0, 1, sway);
            world.set(H, hipQ);
            if (spine[0] !== undefined) world.set(spine[0], qaxis(0, 0, 1, -sway * 0.4));
            const dirs = rig.restDir.map((d, i) => {
                const pitch = Math.atan2(d[2], -d[1]);
                return dirOf(I4, pitch, (0.04 + 0.34 * smooth(1, 7, i)) * Math.sin(TAU * ph - 1.1 * i) + sway * (1 - smooth(0, 2, i)));
            });
            aimTail(rig, world, I4, dirs);
            return { world, local };
        });
        if (id === 'sitRock') {
            const pose = (ph, settle) => {
                const world = new Map(), local = withFingers(new Map(), relaxed), w = Math.sin(TAU * ph);
                const turn = qaxis(0, 1, 0, 0.32), hipQ = qmul(turn, qaxis(1, 0, 0, 0.06));
                world.set(H, hipQ);
                spine.forEach((b, k) => { if (b !== undefined) world.set(b, qmul(qaxis(0, 1, 0, 0.32 - 0.12 * (k + 1)), qaxis(1, 0, 0, 0.02 + 0.01 * w))); });
                if (head !== undefined) world.set(head, qmul(qaxis(0, 1, 0, -0.1), qaxis(1, 0, 0, 0.08 + 0.01 * w)));
                // Over the rock's front and down to the floor, curling round to one side, the fin raised.
                const dirs = [[0.18, -0.3, 0.94], [0.3, -0.55, 0.78], [0.35, -0.9, 0.25], [0.3, -0.95, -0.05], [-0.25, -0.75, 0.6], [-0.85, -0.08, 0.5], [-0.98, 0.04, -0.05], [-0.8, 0.12, -0.55], [-0.45, 0.62, -0.62], [-0.35, 0.78, -0.5]].map(norm);
                const flick = 0.12 * Math.sin(TAU * ph);
                dirs[8] = norm(add(dirs[8], [0, flick, -flick])); dirs[9] = norm(add(dirs[9], [0, flick * 1.5, -flick * 1.5]));
                aimTail(rig, world, hipQ, dirs.map(d => qrot(turn, d)));
                // One hand on the rock beside the hip, the other resting on the tail.
                const s0 = rig.arm.Left ? rig.arm.Left.sign : 1;
                aimArm(rig, world, 'Left', qrot(turn, norm([s0 * 0.35, -0.94, -0.08])), qrot(turn, norm([s0 * 0.28, -0.94, 0.15])), qrot(turn, [0.3, 0.2, -0.9]));
                aimArm(rig, world, 'Right', qrot(turn, norm([-0.18, -0.88, 0.42])), qrot(turn, norm([0.25, -0.45, 0.85])), qrot(turn, [-0.4, 0.8, 0.2]));
                aimHand(rig, world, 'Left', qrot(turn, norm([s0 * 0.4, -0.2, 0.9])), qrot(turn, [0, 1, 0]));
                void settle;
                return { world, local };
            };
            // The seat: as high as the tail's turn onto the floor allows; the floor is under the tail.
            const probe = resolve(rig, pose(0).world, pose(0).local, 0);
            const floorLift = -lowest(rig, probe);
            return bake(rig, 'Sit', 4, 12, ph => Object.assign(pose(ph), { lift: floorLift, meta: (R, lift) => ({ seat: { at: R.P[H].map((v, k) => (k === 1 ? v + lift : v)), height: R.P[H][1] + lift - 0.1 * sc, turn: 0.32 } }) }));
        }
        if (id === 'lieSide') {
            // On the right side, propped on the right elbow, facing ahead; the tail along the floor, its fin standing up.
            const lying = qaxis(0, 0, 1, Math.PI / 2);
            // The left hand relaxed on the hip, the right one flat on the floor.
            const hands = new Map([...relaxed].filter(([b]) => /^Left/.test(rig.bones[b].name)).concat([...flat].filter(([b]) => /^Right/.test(rig.bones[b].name))));
            const bendFor = raise => {
                const world = new Map(), local = withFingers(new Map(), hands);
                world.set(H, lying);
                spine.forEach((b, k) => { if (b !== undefined) world.set(b, qmul(qaxis(0, 0, 1, -raise * (k + 1) / 3), lying)); });
                if (neck !== undefined) world.set(neck, qmul(qaxis(0, 0, 1, -raise - 0.45), lying));
                if (head !== undefined) world.set(head, qmul(qaxis(0, 0, 1, -raise - 0.9), lying));
                return { world, local };
            };
            const shoulderOf = (fr, side) => resolve(rig, fr.world, fr.local, 0).P[rig.arm[side].a];
            // The torso raised until the right shoulder stands an upper arm's length over the floor.
            const lift0 = rig.girth[0].w * 0.92 - rig.bones[H].head[1];
            let lo = 0, hi = 1.1;
            for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2, sh = shoulderOf(bendFor(mid), 'Right'); if (sh[1] + lift0 < rig.arm.Right.upLen * 0.92 + 0.03 * sc) lo = mid; else hi = mid; }
            const raise = (lo + hi) / 2;
            return bake(rig, 'Lie', 4, 12, ph => {
                const fr = bendFor(raise + 0.015 * Math.sin(TAU * ph)), world = fr.world;
                const R0 = resolve(rig, world, fr.local, lift0);
                const sh = R0.P[rig.arm.Right.a];
                                // The forearm along the floor, forward.
                aimArm(rig, world, 'Right', norm(sub([sh[0] + 0.02 * sc, 0.03 * sc, sh[2] + rig.arm.Right.upLen * 0.18], sh)), norm([0.25, 0.03, 1]), [0, 1, 0]);
                aimHand(rig, world, 'Right', norm([0.35, -0.02, 1]), [0, 1, 0]);
                aimArm(rig, world, 'Left', norm([0.75, -0.25, 0.6]), norm([0.95, -0.25, 0.2]), [0.2, 0.9, 0.3]);
                const flick = 0.1 * Math.sin(TAU * ph);
                const dirs = [[1, -0.03, 0.03], [1, -0.01, 0.06], [0.98, 0, 0.16], [0.95, 0, 0.28], [0.88, 0.02, 0.42], [0.8, 0.06, 0.55], [0.72, 0.14, 0.6], [0.64, 0.24, 0.62], [0.6, 0.38 + flick, 0.55], [0.55, 0.44 + flick * 1.4, 0.5]].map(norm);
                // The tail turns over along its length so the fin lies flat on the floor.
                aimTail(rig, world, lying, dirs, rig.tail.map((b, i) => -Math.PI / 2 * smooth(3, 8.5, i)));
                return { world, local: fr.local, ground: 0.03 * sc, contacts: [[rig.arm.Right.f, 0.03 * sc]] };
            });
        }
        if (id === 'propped') {
            // Lying on the front, the chest raised on straight arms, looking ahead; the tail along the floor behind,
            // bending up at its end, the fin swaying over it.
            const frameFor = (arch, ph) => {
                const world = new Map(), local = withFingers(new Map(), flat);
                world.set(H, prone);
                spine.forEach((b, k) => { if (b !== undefined) world.set(b, qmul(prone, qaxis(1, 0, 0, -arch * [0.25, 0.6, 1][k]))); });
                if (neck !== undefined) world.set(neck, qmul(prone, qaxis(1, 0, 0, -arch - 0.35)));
                if (head !== undefined) world.set(head, qmul(prone, qaxis(1, 0, 0, -Math.PI / 2 + 0.12)));
                const sway = 0.18 * Math.sin(TAU * ph), flick = 0.15 * Math.sin(TAU * ph * 2 - 0.8);
                const dirs = [[0, -0.04, -1], [0, 0, -1], [0.02, 0, -1], [0.04, 0.06, -1], [0.04 + sway * 0.2, 0.32, -0.95], [0.03 + sway * 0.4, 0.55, -0.83], [sway * 0.6, 0.7, -0.7], [sway * 0.8, 0.72, -0.62], [sway, 0.45 + flick, -0.85], [sway, 0.32 + flick * 1.4, -0.92]].map(norm);
                aimTail(rig, world, prone, dirs);
                return { world, local };
            };
            // The belly and the hips on the floor.
            const contacts = [[H, rig.front.hips]].concat(rig.spine0 !== undefined ? [[rig.spine0, rig.front.spine]] : []);
            const liftFor = fr => -lowest(rig, resolve(rig, fr.world, fr.local, 0), contacts);
            const shoulder = (fr, side) => resolve(rig, fr.world, fr.local, liftFor(fr)).P[rig.arm[side].a];
            let lo = 0, hi = 1.4;
            const want = (rig.arm.Left.upLen + rig.arm.Left.foLen) * 0.95;
            for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2; if (shoulder(frameFor(mid, 0), 'Left')[1] < want) lo = mid; else hi = mid; }
            const arch = (lo + hi) / 2;
            return bake(rig, 'Rest', 4, 15, ph => {
                const fr = frameFor(arch + 0.02 * Math.sin(TAU * ph), ph), world = fr.world, lift = liftFor(fr);
                for (const side of ['Left', 'Right']) {
                    const A = rig.arm[side], sh = resolve(rig, world, fr.local, lift).P[A.a];
                    const hand = [sh[0] * 0.95 + A.sign * 0.01 * sc, 0.05 * sc, sh[2] + 0.05 * sc];
                    const k = reach(rig, side, sh, hand, [A.sign * 0.4, 0, -1]);
                    aimArm(rig, world, side, k.up, k.fo, [A.sign * 0.2, 0.2, 1]);
                    // Palms flat on the floor, the fingers ahead and a little in.
                    aimHand(rig, world, side, norm([-A.sign * 0.2, 0, 1]), [0, 1, 0]);
                }
                return { world, local: fr.local, lift };
            });
        }
        return null;
    }

    /** A humanoid pose of the upper body played over the tail at rest: the legs' tracks dropped, the tail kept on the floor. */
    function upperPose(rig, id, body) {
        const c = Poses && Poses.clip(rig.bones, id, body);
        if (!c) return null;
        const legs = new Set(rig.bones.map((b, i) => (LEG_BONES.test(b.name) ? i : -1)).filter(i => i >= 0));
        const kept = c.tracks.filter(t => !legs.has(t.bone));
        const steps = c.times.length, hipTrack = kept.find(t => t.bone === rig.hips);
        const tails = rig.tail.map(b => ({ bone: b, values: new Float32Array(steps * 4) }));
        for (let f = 0; f < steps; f++) {
            const world = new Map(), local = new Map();
            for (const t of kept) { const vals = t.times ? null : t.values; if (vals) local.set(t.bone, Array.from(vals.slice(f * 4, f * 4 + 4))); }
            const hq = hipTrack ? Array.from(hipTrack.values.slice(f * 4, f * 4 + 4)) : I4;
            aimTail(rig, world, hq, restDirs(rig, hq));
            const R = resolve(rig, world, local, 0);
            tails.forEach((t, i) => t.values.set(R.L[t.bone], f * 4));
        }
        return { name: c.name, times: c.times, tracks: kept.concat(tails), heights: new Float32Array(steps), skin: false, once: !!c.once, lift: () => 0 };
    }

    /** Whether a recipe's skeleton is a merfolk's. */
    const hasTail = bones => bones.some(b => b.name === 'TailFin') && bones.some(b => b.name === 'Tail8');

    /**
     * A clip for the builder's view: one of POSES (or 'idle'), its tracks
     * turns only, with `lift(t)` raising the body off the floor and `seat`
     * where a sitting pose sits.
     */
    function poseClip(bones, id, body, recipe, armAngle) {
        const rig = rigOf(bones, body);
        if (!rig) return null;
        if (UPPER.includes(id)) return upperPose(rig, id, body);
        const made = motion(rig, id, armAngle ?? 0.3);
        if (!made) return null;
        const period = made.times[made.times.length - 1] || 1, steps = made.times.length, L = made.lifts;
        return {
            name: made.name, times: made.times, tracks: made.tracks, seat: made.meta && made.meta.seat,
            lift: t => { const x = ((((t % period) + period) % period) / period) * (steps - 1), i = Math.min(steps - 2, Math.floor(x)), k = x - i; return L[i] + (L[i + 1] - L[i]) * k; }
        };
    }

    /**
     * The clips a merfolk's file carries, Idle first: Idle, Walk, Swim,
     * Swim fast, Tread, Sit, Lie, Rest. The poses on the floor lower the
     * hips with a move of their own.
     */
    function clips(bones, r, built, pack, armAngle) {
        const rig = rigOf(bones, built && built.parts && built.parts[0]);
        if (!rig) return [];
        const out = [];
        for (const id of ['idle', 'glide', 'swim', 'swimFast', 'tread', 'sitRock', 'lieSide', 'propped']) {
            const made = motion(rig, id, armAngle);
            if (!made) continue;
            const clip = { name: made.name, times: made.times, tracks: made.tracks };
            const m = MOTIONS.find(x => x.id === id);
            if (m && m.floor) {
                const head = bones[rig.hips].head, values = new Float32Array(made.times.length * 3);
                for (let f = 0; f < made.times.length; f++) values.set([head[0], head[1] + made.lifts[f], head[2]], f * 3);
                clip.tracks = clip.tracks.concat([{ bone: rig.hips, values, path: 'translation' }]);
            }
            out.push(clip);
        }
        return out;
    }

    /** A rock to sit on, for the builder's view: a rounded boulder whose top is at `seat.height`, under `seat.at`. */
    function rock(seat, sc = 1) {
        const pos = [], nrm = [], col = [], idx = [];
        const top = seat.height, at = seat.at, R = 0.38 * sc, ROWS = 14, AR = 28;
        const turn = seat.turn || 0;
        // Behind the seat, so the tail falls clear of its front.
        const center = [at[0] - Math.sin(turn) * 0.13 * sc, 0, at[2] - Math.cos(turn) * 0.13 * sc];
        for (let i = 0; i <= ROWS; i++) {
            const t = i / ROWS, el = t * Math.PI / 2;
            for (let j = 0; j < AR; j++) {
                const a = (j / AR) * TAU;
                const lump = 1 + 0.12 * noise3(Math.cos(a) * 2.2, t * 2.5, Math.sin(a) * 2.2, 3) + 0.05 * noise3(Math.cos(a) * 6, t * 6, Math.sin(a) * 6, 5);
                const rx = R * 1.15 * Math.cos(el) * lump, rz = R * 0.75 * Math.cos(el) * lump;
                // Flattened on top where it is sat on.
                const y = top * Math.min(1, Math.sin(el) * 1.15) * (1 + 0.04 * noise3(Math.cos(a) * 3, 9, Math.sin(a) * 3, 8));
                pos.push(center[0] + Math.cos(a) * rx, y, center[2] + Math.sin(a) * rz);
                const shade = 0.33 + 0.07 * noise3(Math.cos(a) * 9, t * 9, Math.sin(a) * 9, 2);
                col.push(shade * 0.92, shade * 0.9, shade * 0.86);
                nrm.push(0, 1, 0);
            }
        }
        for (let i = 0; i < ROWS; i++) for (let j = 0; j < AR; j++) {
            const a = i * AR + j, b = i * AR + (j + 1) % AR, c = a + AR, d = b + AR;
            idx.push(a, c, b, b, c, d);
        }
        const top0 = pos.length / 3;
        pos.push(center[0], top, center[2]); nrm.push(0, 1, 0); col.push(0.35, 0.34, 0.32);
        for (let j = 0; j < AR; j++) idx.push(ROWS * AR + j, top0, ROWS * AR + (j + 1) % AR);
        const o = sheet();
        o.p = pos; o.n = nrm; o.c = col; o.i = idx;
        smoothNormals(o);
        return { positions: Float32Array.from(o.p), normals: Float32Array.from(o.n), colors: Float32Array.from(o.c), index: Uint32Array.from(o.i) };
    }

    // ── the builder's page ────────────────────────────────────────────────
    /** The Body tab's Merfolk section, in the builder's own controls (`b`: the builder). */
    function panel(b) {
        return b._section('Merfolk') + b._select('merfolk.fin', 'Tail fin', FINS) + b._select('merfolk.colors', 'Colors', COLORS)
            + b._slider({ path: 'merfolk.length', label: 'Tail length', natural: LENGTH.natural, extreme: LENGTH.extreme, format: 'x' })
            + b._check('merfolk.armFins', 'Arm fins') + b._check('merfolk.hipFins', 'Hip fins') + b._check('merfolk.backFin', 'Back fin')
            + b._check('merfolk.finEars', 'Fin ears') + b._check('merfolk.wetHair', 'Wet hair');
    }

    /** The rock a sitting pose sits on, shown in the builder's view while that pose plays; gone with any other. */
    function viewRock(view, seat) {
        const THREE = root.THREE;
        if (!THREE || !view || !view.scene) return;
        const key = seat ? JSON.stringify([seat.height.toFixed(3), seat.at.map(v => v.toFixed(3)), seat.turn]) : '';
        if (view.merRock && view.merRock.userData.key === key) return;
        if (view.merRock) { view.scene.remove(view.merRock); view.merRock.geometry.dispose(); view.merRock.material.dispose(); view.merRock = null; }
        if (!seat) return;
        const sc = Math.max(0.3, (view.bodyHeight || 1.654) / 1.654), r = rock(seat, sc);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(r.normals, 3));
        g.setAttribute('color', new THREE.BufferAttribute(r.colors, 3));
        g.setIndex(new THREE.BufferAttribute(r.index, 1));
        const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.userData.key = key;
        view.scene.add(mesh);
        view.merRock = mesh;
    }

    /**
     * The view's material for a part, as its saved file has it: the relief
     * picture a part names (`normalTexture`, at `normalScale`), and wet
     * hair's gloss. `texture(name, picture)` gives the view's texture.
     */
    function viewMaterial(m, part, result, texture) {
        const THREE = root.THREE;
        if (!THREE) return;
        const pic = part.normalTexture && result && result.textures && result.textures[part.normalTexture];
        if (pic && !m.normalMap) {
            const t = texture(part.normalTexture, pic);
            if (t.colorSpace !== THREE.NoColorSpace) { t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; }
            m.normalMap = t;
            // As the game's model loader reads a relief picture on a model without tangents.
            const s = part.normalScale ?? 1;
            m.normalScale = new THREE.Vector2(s, -s);
        }
        if (part.wet) { m.roughness = part.roughness ?? 0.3; if ('specularIntensity' in m) m.specularIntensity = 0.6; }
    }

    const api = { FINS, COLORS, PALETTES, DEFAULTS, LENGTH, FIN_SHAPES, BLOCKED_SLOTS, BLOCKED_GARMENTS, LEG_BONES, MOTIONS, UPPER, POSES, normalize, normalizeRecipe, fitsGarment, cutOf, build, liftLegs, wetHair, clips, poseClip, hasTail, rock, panel, viewRock, viewMaterial, scaleTexture, finTexture, scatterTexture, noise3 };
    root.RRMerfolkBody = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
