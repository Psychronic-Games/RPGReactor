/**
 * RRCharacterWear - wear and damage for any garment: one Wear amount (0..1) per outfit item.
 *
 * A garment's `wear` (the Outfit card's Wear slider; 0 for ordinary clothes, high for
 * wasteland pieces) weathers it in steps as it grows, all seeded by the garment (and the
 * item's optional `wearSeed`), so the same recipe always wears the same way:
 *
 *   grime and dust  heavier toward hems and cuffs, low on the body, at the knees, elbows
 *                   and seat; sun fading over the shoulders and upper back; stains with
 *                   tide lines (oil, rust, earth)                       (painted, RRCharacterAtlas)
 *   worn cloth      the cloth's tile turns abraded, pilled or crazed (RRCharacterFabric kinds
 *                   registered here: canvasWorn, denimWorn, leatherWorn, jerseyWorn, homespun, burlap, gauze)
 *   frayed hems     lower hems and cuffs grow a fringe of threads; a ragged garment (a duster,
 *                   a poncho, rag wraps) a long tattered hem         (alpha-cut cards on the hem)
 *   holes           torn holes with threads across them, the skin or the layer under them
 *                   showing through                        (alpha in the outfit picture, cutout)
 *   repairs         patches of other cloth sewn on with visible stitches, strips of duct tape
 *                   over tears                      (cloth triangles copied off the garment)
 *
 *   level(item)                    the item's wear 0..1
 *   lookFor(item, garment)         what the outfit picture needs ({ level, seed, ragged, holes }),
 *                                  kept on the piece's look as `wearInfo` (RRCharacterWardrobe)
 *   paint(rgb, look, p)            a texel of the outfit picture weathered: [r, g, b, alpha]
 *   fabricKind(kind, look, id)     the cloth's tile, worn (or a garment's own: gauze, burlap)
 *   build(pack, built, entries)    { parts, textures }: fringes, patches and tape on the laid cloth
 *   unhide(pack, built, entries, hidden, others, frame)   skin behind holes drawn again
 *   shoe(rgb, p, look)             a texel of a shoe's picture weathered
 *   weatherParts(parts, item, built)   rust and grime in an armor part's vertex colors
 *
 * Holes, fringes and patches only appear past a wear level (0.45, 0.25, 0.35); a garment's
 * `details` toggle `repairs` (default on) leaves its patches and tape off.
 */
(function(root) {
    'use strict';
    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const TAU = Math.PI * 2;
    const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
    const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const fract = x => x - Math.floor(x);
    const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const lum = c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
    const srgb = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const linear = hex => { const n = parseInt(String(hex || '#808080').slice(1), 16); return [srgb(((n >> 16) & 255) / 255), srgb(((n >> 8) & 255) / 255), srgb((n & 255) / 255)]; };
    const toByte = c => Math.max(0, Math.min(255, Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)));

    /** A fixed random 0..1 for integer coordinates and a seed. */
    function ihash(x, y, z) {
        let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    /** Value noise in 3D (0..1). */
    function noise3(x, y, z) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
        const c = (a, b, d) => ihash(ix + a, iy + b, iz + d);
        const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u, x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
        const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u, x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
        const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
        return y0 + (y1 - y0) * w;
    }
    const fbm3 = (x, y, z) => 0.55 * noise3(x, y, z) + 0.3 * noise3(x * 2.1 + 5.3, y * 2.1 - 1.7, z * 2.1 + 2.9) + 0.15 * noise3(x * 4.3 - 3.1, y * 4.3 + 7.7, z * 4.3 - 0.3);
    /** A seeded stream of randoms. */
    function stream(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
    function seedOf(text) { let h = 2166136261; for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

    /** The item's wear amount, 0..1. */
    function level(item) { const w = +(item && item.wear); return Number.isFinite(w) ? clamp01(w) : 0; }
    /** The garment's own seed: the same wear for the same recipe; `wearSeed` rolls another. */
    function seedFor(item) { return (seedOf(item && item.id || 'cloth') + Math.imul((item && item.wearSeed) | 0, 7919)) >>> 0; }

    // ── where clothes wear ────────────────────────────────────────────────
    // Spots on the average body where cloth wears through, by chain: limbs by their position
    // along the chain `s` and angle `ang` (0 in front; the elbow's point and the knee's back at PI),
    // the trunk by rest height `y` and angle round it. `r`: a hole's size there (meters).
    const SPOTS = [
        { limb: 'arm', s: 2.0, ang: Math.PI, r: 0.026, patch: [0.085, 0.10] },       // elbow
        { limb: 'arm', s: 2.6, ang: 0.7, r: 0.018, patch: [0.06, 0.07] },            // forearm
        { limb: 'arm', s: 1.45, ang: -1.2, r: 0.02, patch: [0.07, 0.06] },           // upper arm
        { limb: 'leg', s: 1.0, ang: 0, r: 0.034, patch: [0.11, 0.12] },              // knee
        { limb: 'leg', s: 0.45, ang: 0.6, r: 0.026, patch: [0.10, 0.09] },           // thigh
        { limb: 'leg', s: 1.55, ang: -0.3, r: 0.022, patch: [0.08, 0.10] },          // shin
        { limb: 'leg', s: 0.25, ang: Math.PI - 0.4, r: 0.03, patch: [0.11, 0.10] },  // seat
        { trunk: true, y: 1.0, ang: 0.75, r: 0.026, patch: [0.10, 0.09] },           // flank
        { trunk: true, y: 1.24, ang: Math.PI - 0.5, r: 0.028, patch: [0.12, 0.10] }, // shoulder blade
        { trunk: true, y: 1.3, ang: -0.5, r: 0.018, patch: [0.08, 0.07] },           // upper chest
        { trunk: true, y: 0.62, ang: 1.1, r: 0.03, patch: [0.12, 0.11] },            // coat skirt, side
        { trunk: true, y: 0.42, ang: -2.6, r: 0.034, patch: [0.13, 0.12] }           // coat skirt, behind
    ];
    /**
     * Where a garment's cut cloth lies, from its pieces' rules (RRCharacterWardrobe): the trunk's
     * rest heights, the arms' and legs' reach along their chains. Spots outside it never wear.
     */
    function coverageOf(garment, item) {
        const out = { trunk: null, arm: null, leg: null };
        if (!garment || typeof garment.pieces !== 'function') return out;
        let specs = [];
        try { specs = garment.pieces(item) || []; } catch (e) { return out; }
        const ySpine = sv => 0.885 + 0.134 * sv, grow = (k, lo, hi) => { const r = out[k]; out[k] = r ? [Math.min(r[0], lo), Math.max(r[1], hi)] : [lo, hi]; };
        for (const p of specs) {
            if (!p || !(p.surface || p.rules || p.value)) continue;
            if (p.surface === 'skirt') { grow('trunk', 0.95 - Math.min(1, item.length ?? 0.6) * 0.88, 0.95); continue; }
            const r = p.rules || {};
            if (r.spine) { const at = a => (typeof r.spine === 'function' ? r.spine(a) : r.spine); const A = at(0), B = at(Math.PI); grow('trunk', ySpine(Math.max(-0.5, Math.min(A[0], B[0]))), ySpine(Math.min(4.1, Math.max(A[1], B[1])))); }
            if (Array.isArray(r.arms) && r.arms[1] > 1) grow('arm', Math.max(0.6, r.arms[0]), r.arms[1]);
            if (Array.isArray(r.legs) && r.legs[1] > 0.2) grow('leg', Math.max(0, r.legs[0]), r.legs[1]);
            if (!r.spine && !r.arms && !r.legs && p.value) grow('trunk', 1.0, 1.4);
        }
        return out;
    }
    const spotFits = (spot, cov) => spot.trunk ? !!cov.trunk && spot.y > cov.trunk[0] + 0.05 && spot.y < cov.trunk[1] - 0.06
        : spot.limb === 'arm' ? !!cov.arm && spot.s > cov.arm[0] + 0.1 && spot.s < cov.arm[1] - 0.18
        : !!cov.leg && spot.s > cov.leg[0] + 0.08 && spot.s < Math.min(cov.leg[1], 1.95) - 0.15;
    const lookCache = new Map();
    /**
     * What the outfit picture needs to weather a garment: its level, seed, whether its hem
     * is ragged (the catalog's `ragged`), its holes ({ fam: [..], s|y, ang, r, stretch, turn })
     * and its patches' spots (so no hole is painted under a patch).
     */
    function lookFor(item, garment) {
        const L = level(item);
        if (!(L > 0)) return null;
        const seed = seedFor(item), key = item.id + ':' + seed + ':' + Math.round(L * 100) + ':' + ['length', 'sleeves', 'style'].map(k => item[k]).join(',');
        if (lookCache.has(key)) return lookCache.get(key);
        const cov = coverageOf(garment, item), fits = SPOTS.filter(sp => spotFits(sp, cov));
        const rand = stream(seed), order = fits.map((s, i) => [rand(), i]).sort((a, b) => a[0] - b[0]).map(x => fits[x[1]]);
        const side = () => (rand() < 0.5 ? 0 : 1);
        const place = spot => {
            const out = { r: spot.r * (0.65 + 0.45 * rand()), stretch: 1 + rand() * 0.9, turn: rand() * Math.PI, wobble: rand() * 100, patch: spot.patch };
            if (spot.trunk) Object.assign(out, { fam: [0], y: spot.y + (rand() - 0.5) * 0.05, ang: (rand() < 0.5 ? -1 : 1) * spot.ang + (rand() - 0.5) * 0.3 });
            else Object.assign(out, { fam: [spot.limb === 'arm' ? 1 + side() : 3 + side()], s: spot.s + (rand() - 0.5) * 0.12, ang: spot.ang + (rand() - 0.5) * 0.4 });
            return out;
        };
        const holes = [], patches = [];
        // Holes from 0.45; patches (and tape over a tear) from 0.35, at other spots.
        const nHoles = L < 0.45 ? 0 : Math.min(5, 1 + Math.floor((L - 0.45) / 0.12));
        const nPatches = L < 0.35 ? 0 : Math.min(4, 1 + Math.floor((L - 0.35) / 0.18));
        // Turn about, a hole and a patch, so a garment with few places to wear gets some of each.
        for (let k = 0; k < order.length; k++) {
            const wantHole = holes.length < nHoles, wantPatch = patches.length < nPatches;
            if (!wantHole && !wantPatch) break;
            if (wantHole && (!wantPatch || k % 2 === 0)) holes.push(place(order[k])); else patches.push(place(order[k]));
        }
        // The worst tear is taped over (it stays torn under the tape).
        const tape = L >= 0.55 && holes.length ? [Object.assign({}, holes[0], { tape: true })] : [];
        const info = { level: L, seed, ragged: !!(garment && garment.ragged), holes, patches, tape, fray: garment && garment.fray };
        if (lookCache.size > 200) lookCache.clear();
        lookCache.set(key, info);
        return info;
    }

    /** How far a texel (atlas point `p`) lies from a spot, in meters on the average body: [along, across]. */
    function spotOffset(spot, p) {
        if (spot.fam[0] === 0) {
            if (p.fam !== 0) return null;
            return [angDiff(p.ang, spot.ang) * (p.rad || 0.13), p.rest[1] - spot.y];
        }
        if (p.fam !== spot.fam[0]) return null;
        return [angDiff(p.ang, spot.ang) * (p.rad || 0.045), (p.s - spot.s) * (p.su || 0.24)];
    }
    /** A torn hole's signed edge distance at an offset (negative inside), its outline torn irregularly. */
    function holeEdge(h, dx, dy) {
        const c = Math.cos(h.turn), s = Math.sin(h.turn), x = (dx * c + dy * s) / h.stretch, y = -dx * s + dy * c;
        const th = Math.atan2(y, x), r = Math.hypot(x, y);
        const rough = 0.7 + 0.2 * Math.sin(th * 3 + h.wobble) + 0.1 * Math.sin(th * 7 + h.wobble * 1.7) + 0.07 * Math.sin(th * 13 + h.wobble * 0.3) + 0.05 * Math.sin(th * 29 + h.wobble * 2.3) + 0.04 * (ihash(Math.floor((th + Math.PI) * 9), 5, h.wobble | 0) - 0.5);
        return r - h.r * rough;
    }

    // Weathering colors (linear): dust, dried mud, grease.
    const DUST = [0.33, 0.27, 0.19], MUD = [0.12, 0.085, 0.055], OIL = [0.022, 0.018, 0.014], RUST = [0.2, 0.065, 0.02];

    /**
     * Worn cloth's weave as it reads from across a room, in the cloth's own meters (chart cu round,
     * cv along): each weft yarn a few millimeters thick takes the dye its own way, a few carry thick
     * slubs a few centimeters long, the warp runs in faint streaks, and the cloth was dyed in lots
     * that left broad bands a shade apart. The weave's own relief is the cloth's tile; this is its color.
     */
    function homespun(rgb, look, p, L, seed) {
        if (!Number.isFinite(p.cu) || !Number.isFinite(p.cv)) return rgb;
        const coarse = look.material === 'wool' ? 1.5 : look.material === 'canvas' ? 1.15 : 1;
        const pitch = 0.003 * coarse, row = Math.floor(p.cv / pitch), col = Math.floor(p.cu / pitch);
        const sd = seed % 9973;
        // The weft: every yarn its own take of the dye; a slub (a thick, lighter or darker run) on one row in five.
        const len = 0.035 * coarse, at = p.cu / len + ihash(row, 17, sd) * 9, seg = Math.floor(at), inSeg = fract(at);
        const slub = ihash(row, seg, sd + 31) < 0.2 ? (ihash(row, seg, sd + 37) < 0.5 ? -1 : 1) * Math.sin(Math.PI * inSeg) : 0;
        // The warp: long faint streaks down the cloth, a yarn's dye drifting along its length.
        const warp = ihash(col, Math.floor(p.cv / 0.09 + ihash(col, 3, sd) * 5), sd + 41) - 0.5;
        // Dye lots: bands across the cloth, 4 to 9 cm.
        const bandAt = p.cv / 0.065 + 0.35 * Math.sin(p.cu / 0.21 + sd);
        const band = ihash(Math.floor(bandAt), 5, sd + 53) - 0.5;
        const k = 1 + (0.05 + 0.07 * L) * (ihash(row, 7, sd) - 0.5) + (0.08 + 0.1 * L) * slub + (0.035 + 0.03 * L) * warp + (0.05 + 0.07 * L) * band;
        return [rgb[0] * k, rgb[1] * k, rgb[2] * k];
    }

    /**
     * A texel of the outfit picture, weathered by its piece's `look.wearInfo`: [r, g, b, alpha].
     * `p`: RRCharacterAtlas's texel (rest position, chain, angle, distance from the cut edge
     * `vm`, chart meters `cu`/`cv`, meters per texel `px`).
     */
    function paint(rgb, look, p) {
        const W = look && look.wearInfo;
        if (!W) return rgb;
        const L = W.level, R = p.rest, sd = (W.seed % 997) * 0.37;
        const hard = look.material === 'metal' || look.material === 'gold';
        const leatherish = look.material === 'leather' || look.material === 'suede' || look.material === 'rubber';
        const edge = p.vm >= 0 ? 1 - ss(0, 0.06, p.vm) : 0.7;
        const low = 1 - ss(0.04, 0.8, R[1]);
        // Rubbed and scuffed where a body bends and leans: knees, elbows, seat, cuffs.
        let joint = 0;
        if (p.fam === 3 || p.fam === 4) joint = Math.exp(-(((p.s - 1) / 0.16) ** 2)) * (0.4 + 0.6 * Math.max(0, Math.cos(p.ang)));
        else if (p.fam === 1 || p.fam === 2) joint = Math.exp(-(((p.s - 2) / 0.17) ** 2)) * (0.4 + 0.6 * Math.max(0, -Math.cos(p.ang))) + ss(2.7, 2.95, p.s) * 0.7;
        else if (R[2] < 0 && R[1] < 1.0 && R[1] > 0.7) joint = 0.5 * Math.exp(-(((R[1] - 0.82) / 0.07) ** 2));
        const n1 = fbm3(R[0] * 6 + sd, R[1] * 6, R[2] * 6), n2 = noise3(R[0] * 40 + sd, R[1] * 40, R[2] * 40);
        let out = rgb.slice(0, 3);
        // Uneven with age: the dye a little lighter and darker in broad drifts.
        out = out.map(c => c * (1 + L * 0.16 * (n1 - 0.5)));
        if (!hard && !leatherish) out = homespun(out, look, p, L, W.seed);
        // Sun-bleached over the shoulders and upper back, faded all over a little.
        const top = ss(1.02, 1.42, R[1]) * (0.6 + 0.8 * (noise3(R[0] * 3 + sd, R[1] * 3, R[2] * 3) - 0.3));
        const fade = Math.min(0.7, L * (0.14 + 0.55 * Math.max(0, top))) * (hard ? 0.3 : 1);
        if (fade > 0) { const g = lum(out); out = mix3(out, [g * 1.22 + 0.03, g * 1.16 + 0.027, g * 1.04 + 0.02], fade); }
        // Grime: settled dust, heavier low down and toward the hems, worked in at the joints.
        let grime = L * (0.08 + 0.55 * low + 0.6 * edge * edge + 0.5 * joint) * (0.8 + 0.45 * (n1 - 0.5) + 0.25 * (n2 - 0.5));
        grime = Math.max(0, Math.min(0.85, grime));
        out = mix3(out, DUST, grime * 0.5);
        out = out.map(c => c * (1 - grime * 0.25));
        // Mud splashed up from the ground: specks on the lowest hems and the shins.
        if (R[1] < 0.6) {
            const speck = ss(0.68, 0.74, noise3(R[0] * 90 + sd, R[1] * 70, R[2] * 90)) * ss(0.6, 0.05, R[1]) * L;
            if (speck > 0) out = mix3(out, MUD, Math.min(0.75, speck * 1.3));
        }
        // Sweat at the collar and under the arms: a faint yellowed halo.
        const pit = (p.fam === 1 || p.fam === 2) ? Math.exp(-(((p.s - 1.05) / 0.2) ** 2)) * Math.max(0, -Math.sin(p.ang)) : p.fam === 0 ? Math.exp(-(((R[1] - 1.27) / 0.05) ** 2)) * Math.exp(-(((Math.abs(R[0]) - 0.15) / 0.04) ** 2)) : 0;
        const collar = p.fam === 0 && R[1] > 1.33 && p.vm >= 0 ? (1 - ss(0.0, 0.05, p.vm)) : 0;
        const sweat = L * 0.5 * Math.max(pit, collar) * (0.6 + 0.8 * n2);
        if (sweat > 0.02) out = mix3(out, out.map((c, i) => c * [0.82, 0.74, 0.5][i]), Math.min(0.7, sweat));
        // Stains: a few small spills and smears with a darker tide line (grease, rust, earth); hands wiped
        // down the fronts of the thighs.
        if (L > 0.2) {
            const v = noise3(R[0] * 16 - sd, R[1] * 16 + 3.1, R[2] * 16 + 1.7) * 0.75 + noise3(R[0] * 45, R[1] * 45 - sd, R[2] * 45) * 0.25;
            const on = ss(0.745, 0.775, v), tide = on * (1 - ss(0.775, 0.8, v));
            if (on > 0) {
                const kind = noise3(R[0] * 2.1 + sd, R[1] * 2.1 + 9, R[2] * 2.1), tint = kind < 0.45 ? OIL : kind < 0.72 ? RUST : MUD;
                const k = Math.min(0.7, (L - 0.2) * 1.1) * (0.3 * on + 0.25 * tide);
                out = mix3(out, tint, k);
            }
            if ((p.fam === 3 || p.fam === 4) && p.s < 0.75) {
                const wipe = Math.exp(-(((p.s - 0.35) / 0.18) ** 2)) * Math.max(0, Math.cos(p.ang - (p.fam === 3 ? 0.5 : -0.5))) * ss(0.5, 0.75, noise3(p.cu * 140 + sd, p.cv * 9, 1.5));
                if (wipe > 0) out = mix3(out, OIL, Math.min(0.5, wipe * (L - 0.2) * 0.9));
            }
        }
        // A worn edge: the cloth thinned and lighter along the hem, fibres showing.
        if (p.vm >= 0 && L > 0.25 && !hard) {
            const rub = (1 - ss(0.0, 0.012, p.vm)) * (L - 0.25) * (0.6 + 0.8 * noise3(p.cu * 60, p.cv * 60, sd));
            if (rub > 0) { const g = lum(out); out = mix3(out, [g * 1.6 + 0.05, g * 1.5 + 0.045, g * 1.3 + 0.035], Math.min(0.6, rub)); }
        }
        // Leather cracks lighter in its creases; plain cloth pills and thins in patches.
        if (leatherish && L > 0.3) { const crack = ss(0.62, 0.66, noise3(p.cu * 140, p.cv * 140, sd)) * (L - 0.3); if (crack > 0) out = mix3(out, out.map(c => c * 1.7 + 0.03), crack * 0.7); }
        // Holes: the cloth torn through, threads across them; frayed lighter and darker round them.
        let alpha = 1;
        if (W.holes.length && p.val >= 0 && p.vm > 0.004) for (const h of W.holes) {
            const o = spotOffset(h, p);
            if (!o || Math.abs(o[0]) > h.r * 3.2 || Math.abs(o[1]) > h.r * 3.2) continue;
            const d = holeEdge(h, o[0], o[1]);
            if (d < 0) {
                // Loose threads of the weave hanging into the hole from its edge, each its own length.
                const ta = fract(p.cu / 0.003), tb = fract(p.cv / 0.003), ia = Math.floor(p.cu / 0.003), ib = Math.floor(p.cv / 0.003);
                const ka = ihash(ia, 7, W.seed) < 0.3 && -d < 0.004 + 0.012 * ihash(ia, 9, W.seed);
                const kb = ihash(ib, 11, W.seed) < 0.25 && -d < 0.003 + 0.009 * ihash(ib, 13, W.seed);
                if ((ka && ta < 0.45) || (kb && tb < 0.45)) { const g = lum(out); out = mix3(out, [g * 1.5 + 0.04, g * 1.45 + 0.035, g * 1.3 + 0.03], 0.6); alpha = 1; }
                else alpha = 0;
            } else if (d < 0.012) {
                // Fibres pulled out (lighter) at the very edge, grime ground into the ring round it.
                const t = d / 0.012, g = lum(out);
                out = t < 0.25 ? mix3(out, [g * 1.5 + 0.04, g * 1.45 + 0.035, g * 1.3 + 0.03], 0.75 * (1 - t / 0.25)) : out.map(c => c * (0.78 + 0.22 * ss(0.25, 1, t)));
            }
        }
        return [out[0], out[1], out[2], alpha];
    }

    /** A shoe's picture weathered: dust on the welt and toe, scuffed lighter at the toe, creased at the flex. */
    function shoe(rgb, p, look) {
        const L = level(look);
        if (!(L > 0) || p.region === 'lining' || p.region === 'bed') return rgb;
        const sd = 13.7, n = noise3((p.f || 0) * 6 + sd, (p.y || 0) * 14, (p.l || 0) * 14);
        const low = 1 - ss(0.0, 0.07, p.y || 0), toe = ss(0.75, 0.97, p.f || 0);
        let out = mix3(rgb, DUST, Math.min(0.8, L * (0.25 + 0.75 * low) * (0.55 + 0.9 * (n - 0.45))));
        if (p.region !== 'sole' && p.region !== 'tread') {
            const scuff = toe * L * ss(0.55, 0.7, noise3((p.f || 0) * 50, (p.y || 0) * 120, sd));
            if (scuff > 0) { const g = lum(out); out = mix3(out, [g * 1.7 + 0.05, g * 1.6 + 0.045, g * 1.45 + 0.04], scuff); }
            const crease = L * Math.exp(-((((p.f || 0) - 0.64) / 0.04) ** 2)) * ss(0.5, 0.75, noise3((p.l || 0) * 90, (p.y || 0) * 30, sd));
            if (crease > 0) out = out.map(c => c * (1 - 0.35 * crease));
        }
        return out;
    }

    // ── worn cloth tiles (RRCharacterFabric kinds) ────────────────────────
    const Fabric = need('RRCharacterFabric', './CharacterFabric.js');
    if (Fabric && Fabric.KINDS && !Fabric.KINDS.canvasWorn) {
        const P = Fabric.pnoise, C = Fabric.pcells, base = Fabric.KINDS;
        const yarn = (d, w) => { const q = Math.abs(d) / w; return q >= 1 ? 0 : Math.sqrt(1 - q * q); };
        const weave = (u, v, n, seed, slub) => {
            const x = u * n, y = v * n, col = Math.floor(x), row = Math.floor(y), fx = x - col, fy = y - row;
            const tw = 1 + slub * (P(col / n, 0, n, 1, seed) - 0.5), tf = 1 + slub * (P(0, row / n, 1, n, seed + 1) - 0.5);
            const warp = 0.32 * Math.cos(Math.PI * (y - 0.5 - col)) + 0.5 * tw * yarn(fx - 0.5, Math.min(0.5, 0.42 * tw));
            const weft = -0.32 * Math.cos(Math.PI * (x - 0.5 - row)) + 0.5 * tf * yarn(fy - 0.5, Math.min(0.5, 0.42 * tf));
            return Math.max(warp, weft, -0.45);
        };
        Object.assign(base, {
            // Canvas worn soft: its weave flattened in rubbed patches, fuzz standing off it, duller.
            canvasWorn: { span: 0.0256, size: 256, normalScale: 1, cavity: 5, occlusion: 0.7, sheen: [0.3, 0.9],
                sample(u, v, s) {
                    const w = weave(u, v, 32, 21, 0.5), rub = P(u, v, 4, 4, 71), fuzz = P(u, v, 96, 96, 72);
                    const flat = ss(0.45, 0.75, rub);
                    s.h = 0.12 * w * (1 - 0.6 * flat) + 0.03 * (fuzz - 0.5) + 0.02 * (P(u, v, 8, 8, 73) - 0.5);
                    s.r = 0.9 + 0.06 * (fuzz - 0.5) + 0.04 * flat;
                } },
            // Denim worn thin: the twill rubbed flat in patches, its slubs stronger.
            denimWorn: { span: 0.0256, size: 512, normalScale: 1, cavity: 4, occlusion: 0.8, sheen: [0.3, 0.9],
                sample(u, v, s) {
                    const t = Math.pow(Math.sin(Math.PI * Math.pow(fract((u + v) * 18), 0.75)), 1.3), slub = P(u, v, 72, 6, 11), rub = ss(0.4, 0.8, P(u, v, 3, 3, 74));
                    s.h = 0.07 * t * (1 - 0.55 * rub) + 0.03 * (slub - 0.5) + 0.018 * (P(u, v, 128, 128, 75) - 0.5);
                    s.r = 0.92 + 0.05 * (slub - 0.5);
                } },
            // Leather gone dry: its grain crazed into a network of fine cracks, scuffed in streaks.
            leatherWorn: { span: 0.0512, size: 512, normalScale: 1.1, cavity: 7, occlusion: 0.7,
                sample(u, v, s) {
                    const c = C(u, v, 36, 31, 0.85), dome = ss(0, 0.32, c.f2 - c.f1), cr = C(u, v, 9, 81, 0.9);
                    const crack = (1 - ss(0.0, 0.05, cr.f2 - cr.f1)) * ss(0.3, 0.7, P(u, v, 3, 3, 82));
                    const scuff = (1 - ss(0.0, 0.08, Math.abs(P(u, v, 2, 24, 83) - 0.5))) * ss(0.5, 0.8, P(u, v, 4, 4, 84));
                    s.h = 0.05 * dome - 0.14 * crack - 0.03 * scuff;
                    s.r = 0.62 + 0.1 * (1 - dome) + 0.2 * crack + 0.15 * scuff;
                } },
            // Jersey pilled: small balls of fibre over the stitches, worn fuzzy.
            jerseyWorn: { span: 0.0128, size: 256, normalScale: 0.9, cavity: 5, occlusion: 0.6, sheen: [0.4, 0.85],
                sample(u, v, s) {
                    const x = u * 12, y = v * 16, fx = fract(x), fy = fract(y), lean = 0.07 + 0.22 * (1 - fy), swell = 0.75 + 0.25 * Math.sin(Math.PI * fy);
                    const knit = Math.max(yarn(fx - (0.5 - lean), 0.19), yarn(fx - (0.5 + lean), 0.19)) * swell;
                    const c = C(u, v, 10, 91, 0.9), pill = (1 - ss(0.0, 0.16, c.f1)) * (P(u, v, 10, 10, 92) > 0.55 ? 1 : 0);
                    s.h = 0.045 * knit + 0.06 * pill + 0.012 * P(u, v, 64, 64, 93);
                    s.r = 0.9 + 0.05 * pill;
                } },
            // Homespun wool (a worn blanket, a rag shawl): a coarse plain weave of uneven, slubbed yarns, fulled soft.
            homespun: { span: 0.0384, size: 256, normalScale: 1.25, cavity: 4, occlusion: 0.85, sheen: [0.35, 0.9],
                sample(u, v, s) {
                    const w = weave(u, v, 12, 121, 0.9), fuzz = P(u, v, 64, 64, 122), felted = ss(0.4, 0.8, P(u, v, 3, 3, 123));
                    s.h = 0.2 * w * (1 - 0.45 * felted) + 0.05 * (fuzz - 0.5) + 0.03 * (P(u, v, 6, 6, 124) - 0.5);
                    s.r = 0.94 + 0.05 * (fuzz - 0.5);
                } },
            // Burlap and sacking: a coarse, open, uneven weave with dark gaps between the yarns.
            burlap: { span: 0.0384, size: 256, normalScale: 1.2, cavity: 3, occlusion: 0.9, sheen: [0.2, 0.95],
                sample(u, v, s) {
                    const n = 16, x = u * n, y = v * n, fx = fract(x), fy = fract(y), col = Math.floor(x), row = Math.floor(y);
                    const tw = 0.3 + 0.16 * P(col / n, 0, n, 1, 101), tf = 0.3 + 0.16 * P(0, row / n, 1, n, 102);
                    const a = yarn(fx - 0.5, tw) * (0.7 + 0.3 * Math.cos(Math.PI * (y - 0.5 - col))), b = yarn(fy - 0.5, tf) * (0.7 - 0.3 * Math.cos(Math.PI * (x - 0.5 - row)));
                    const h = Math.max(a, b), gap = h < 0.05 ? 1 : 0;
                    s.h = 0.35 * h + 0.04 * (P(u, v, 64, 64, 103) - 0.5) - 0.12 * gap;
                    s.r = 0.95; s.ao = gap ? 0.55 : 1;
                } },
            // Gauze bandage: a loose leno weave, soft.
            gauze: { span: 0.0128, size: 256, normalScale: 0.9, cavity: 2, occlusion: 0.8, sheen: [0.35, 0.9],
                sample(u, v, s) {
                    const n = 12, x = u * n, y = v * n, fx = fract(x), fy = fract(y);
                    const h = Math.max(yarn(fx - 0.5, 0.22), yarn(fy - 0.5, 0.2)), gap = h < 0.04;
                    s.h = 0.16 * h + 0.02 * (P(u, v, 48, 48, 111) - 0.5) - (gap ? 0.05 : 0);
                    s.r = 0.93; s.ao = gap ? 0.7 : 1;
                } }
        });
    }
    const WORN = { canvas: 'canvasWorn', denim: 'denimWorn', leather: 'leatherWorn', jersey: 'jerseyWorn', felt: 'homespun', poplin: 'canvasWorn' };
    /** A garment's own cloth where the catalog names one (`cloth` on its entry), keyed by garment id. */
    const OWN_CLOTH = {};
    /** The cloth's tile for a piece: a garment's own cloth, else its kind worn past a little wear. */
    function fabricKind(kind, look, id) {
        if (OWN_CLOTH[id] && (look.material === 'cloth' || look.material === 'canvas')) return OWN_CLOTH[id];
        const W = look && look.wearInfo;
        return W && W.level >= 0.35 && WORN[kind] ? WORN[kind] : kind;
    }

    // ── pictures: fray fringe, patches and tape ───────────────────────────
    let pictures = null;
    /**
     * The repair and fringe pictures (made once):
     *   wear-fray.png      512 x 256: torn tatters and loose threads hanging from v = 0, alpha cut,
     *                      grey (the fringe's vertex colors carry the garment's color)
     *   wear-patches.png   1024 x 512, eight cells of 256: cloth patches with sewn edges (denim,
     *                      flannel check, khaki canvas, leather, ticking stripe, sacking, a plain
     *                      patch in the garment's own color, a pocket) and duct tape; alpha cut
     *   wear-patches-n.png / -orm.png   their relief (weave, stitches, wrinkles) and finish
     */
    const PATCH_KINDS = ['denim', 'check', 'khaki', 'leather', 'ticking', 'sacking', 'self', 'tape'];
    function makePictures() {
        if (pictures) return pictures;
        // Fray: columns of tatters, each its own width and torn length, threads beyond them.
        const FW = 512, FH = 256, fray = new Uint8Array(FW * FH * 4);
        const cols = [];
        { const r = stream(4242); let x = 0; while (x < FW) { const w = 6 + Math.floor(r() * 30); cols.push({ x0: x, w, len: 0.28 + 0.72 * r() ** 0.8, tip: r(), gap: r() < 0.45, shade: 0.85 + 0.2 * r() }); x += w; } }
        for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
            const c = cols.find(q => x >= q.x0 && x < q.x0 + q.w) || cols[0], o = (y * FW + x) * 4, v = y / FH;
            const t = (x - c.x0 + 0.5) / c.w, mid = Math.abs(t - 0.5) * 2;
            // A torn end: pointed or ragged across the tatter.
            const end = c.len * (1 - 0.35 * mid * (0.5 + c.tip)) - 0.05 * Math.abs(Math.sin(x * 1.7 + c.tip * 9)) - 0.03 * ihash(x, 3, 5);
            let a = v < 0.06 ? 1 : v < end ? 1 : 0;
            if (c.gap && (t < 0.08 || t > 0.94) && v > 0.12) a = 0;
            // Loose threads past the ends.
            const thread = ihash(x, 17, 3) < 0.12 && v < end + 0.18 * ihash(x, 23, 5) + 0.04;
            if (!a && thread) a = 1;
            const weaveLine = (x % 3 === 0 ? 0.88 : 1) * (y % 4 === 0 ? 0.92 : 1);
            const k = (a ? c.shade * weaveLine * (1 - 0.35 * ss(0.4, 1, v / Math.max(0.1, end))) : 0.7) * (thread && v > end ? 1.1 : 1);
            const g = Math.round(Math.min(1, k) * 235);
            fray[o] = g; fray[o + 1] = g; fray[o + 2] = g; fray[o + 3] = a ? 255 : 0;
        }
        // Patches: eight 256 cells (4 x 2). The patch fills the middle 80% of its cell.
        const PW = 1024, PH = 512, S = 256, rgba = new Uint8Array(PW * PH * 4), nrm = new Uint8Array(PW * PH * 4), orm = new Uint8Array(PW * PH * 4);
        const height = new Float32Array(PW * PH);
        const design = (kind, u, v, rnd) => {
            // u, v: 0..1 across the cell; the patch is 0.1..0.9.
            const x = (u - 0.1) / 0.8, y = (v - 0.1) / 0.8, inside = Math.min(x, 1 - x, y, 1 - y);
            const torn = kind === 'tape' ? 0.02 * Math.abs(Math.sin(y * 80 + rnd * 7)) + 0.012 * ihash(Math.floor(y * 160), 3, 9) : 0.006 * Math.sin(x * 40 + rnd) * Math.sin(y * 37 + rnd * 2);
            const cut = kind === 'tape' ? Math.min(x - torn, 1 - x - torn) : inside + torn;
            if (cut < 0) return null;
            const dEdge = kind === 'tape' ? Math.min(y, 1 - y) : inside;
            let rgb, h = 0, r = 0.9, m = 0;
            switch (kind) {
                case 'denim': { const tw = fract((u + v) * 48), slub = ihash(Math.floor(u * 200), 1, 2); rgb = mix3([0.03, 0.06, 0.14], [0.2, 0.26, 0.38], 0.35 + 0.3 * slub + 0.2 * ss(0.05, 0, dEdge)); h = 0.4 * Math.sin(Math.PI * tw); break; }
                case 'check': { const a = fract(u * 6) < 0.5, b = fract(v * 6) < 0.5, line = fract(u * 24) < 0.12 || fract(v * 24) < 0.12; rgb = a && b ? [0.32, 0.02, 0.02] : a || b ? [0.12, 0.012, 0.012] : [0.012, 0.01, 0.01]; if (line) rgb = mix3(rgb, [0.4, 0.33, 0.2], 0.35); h = 0.25 * ((fract(u * 96) < 0.5) !== (fract(v * 96) < 0.5) ? 1 : 0); break; }
                case 'khaki': rgb = [0.3, 0.25, 0.14]; h = 0.35 * (((fract(u * 80) < 0.5) !== (fract(v * 80) < 0.5)) ? 1 : 0); break;
                case 'leather': { const n = noise3(u * 40, v * 40, 3); rgb = mix3([0.1, 0.045, 0.02], [0.2, 0.1, 0.045], n); h = 0.5 * n; r = 0.6 + 0.2 * n; break; }
                case 'ticking': rgb = fract(u * 14) < 0.3 ? [0.05, 0.07, 0.13] : [0.42, 0.4, 0.33]; h = 0.3 * (fract(v * 90) < 0.5 ? 1 : 0); break;
                case 'sacking': { const a = fract(u * 30), b = fract(v * 30); const yarnH = Math.max(1 - Math.abs(a - 0.5) * 3, 1 - Math.abs(b - 0.5) * 3); rgb = mix3([0.15, 0.1, 0.05], [0.42, 0.33, 0.19], clamp01(yarnH)); h = clamp01(yarnH); r = 0.95; break; }
                case 'self': rgb = [0.78, 0.78, 0.78]; h = 0.3 * (((fract(u * 80) < 0.5) !== (fract(v * 80) < 0.5)) ? 1 : 0); break;
                case 'tape': {
                    // Cloth-backed tape: a fine scrim grid, long wrinkles, its edges lifting.
                    const scrim = (fract(u * 70) < 0.2 || fract(v * 50) < 0.2) ? 1 : 0, wr = Math.sin(v * 9 + 3 * noise3(u * 6, v * 2, 5)) * Math.sin(u * 30 + noise3(u * 3, v * 7, 1) * 6);
                    rgb = [0.16, 0.165, 0.17]; h = 0.15 * scrim + 0.6 * wr * (0.5 + 0.5 * noise3(u * 4, v * 4, 2)); r = 0.38 + 0.15 * scrim; m = 0.35;
                    rgb = rgb.map(c => c * (0.8 + 0.3 * noise3(u * 30, v * 30, 7)));
                    // Dirt gathered at its edges and over the middle where it was handled.
                    rgb = mix3(rgb, [0.1, 0.085, 0.065], 0.35 * ss(0.35, 0.05, Math.min(y, 1 - y)) + 0.2 * noise3(u * 9, v * 9, 3));
                    break;
                }
            }
            if (kind !== 'tape') {
                // Stitches round the patch a few millimeters in: thread dashes, sunk where they pierce.
                const ring = Math.abs(inside - 0.06), along = (x < 0.06 || x > 0.94) ? y : x;
                const dash = fract(along * 22 + (kind === 'leather' ? 0.25 : 0)) < 0.6;
                if (ring < 0.012 && dash) { rgb = kind === 'denim' ? [0.55, 0.38, 0.1] : kind === 'self' ? [0.18, 0.16, 0.13] : [0.72, 0.68, 0.56]; h = 0.9; r = 0.75; }
                else if (ring < 0.02) h -= 0.25;
                // A cut edge, frayed and lighter.
                if (inside < 0.02 && kind !== 'leather') { rgb = rgb.map(c => c * 1.25 + 0.02); h -= 0.15; }
                // A pocket: its own flap a third of the way down, stitched; a button.
                if (kind === 'self' && rnd > 0.5) {
                    if (Math.abs(y - 0.32) < 0.02) { rgb = rgb.map(c => c * 0.55); h -= 0.4; }
                    if (y < 0.32 && Math.abs(inside - 0.06) < 0.01 && fract(x * 22) < 0.6) { rgb = [0.18, 0.16, 0.13]; h = 0.8; }
                    const bd = Math.hypot(x - 0.5, y - 0.2); if (bd < 0.05) { rgb = [0.05, 0.045, 0.04]; h = 1.2 - bd * 10; r = 0.5; }
                }
                rgb = rgb.map(c => c * (0.8 + 0.2 * ss(0, 0.05, inside)));
            } else rgb = rgb.map(c => c * (0.85 + 0.15 * ss(0, 0.04, Math.min(x, 1 - x))));
            return { rgb, h, r, m };
        };
        PATCH_KINDS.forEach((kind, i) => {
            const ox = (i % 4) * S, oy = Math.floor(i / 4) * S;
            for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
                const u = (x + 0.5) / S, v = (y + 0.5) / S, o = (oy + y) * PW + ox + x, d = design(kind, u, v, kind === 'self' ? 0.7 : 0.3);
                if (!d) { rgba.set([128, 128, 128, 0], o * 4); orm.set([255, 230, 0, 255], o * 4); continue; }
                rgba.set([toByte(d.rgb[0]), toByte(d.rgb[1]), toByte(d.rgb[2]), 255], o * 4);
                orm.set([255, Math.round(clamp01(d.r) * 255), Math.round(clamp01(d.m) * 255), 255], o * 4);
                height[o] = d.h;
            }
        });
        for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
            const o = y * PW + x, hx = (height[y * PW + Math.min(PW - 1, x + 1)] - height[y * PW + Math.max(0, x - 1)]) * 0.9, hy = (height[Math.min(PH - 1, y + 1) * PW + x] - height[Math.max(0, y - 1) * PW + x]) * 0.9, l = Math.hypot(hx, hy, 1);
            nrm.set([Math.round(127.5 - 127.5 * hx / l), Math.round(127.5 + 127.5 * hy / l), Math.round(127.5 + 127.5 / l), 255], o * 4);
        }
        pictures = {
            fray: { name: 'wear-fray.png', width: FW, height: FH, data: fray, repeat: true },
            patches: { name: 'wear-patches.png', width: PW, height: PH, data: rgba },
            patchNormal: { name: 'wear-patches-n.png', width: PW, height: PH, data: nrm },
            patchFinish: { name: 'wear-patches-orm.png', width: PW, height: PH, data: orm }
        };
        return pictures;
    }

    // ── geometry on the laid cloth ────────────────────────────────────────
    /** A growing mesh with texture coordinates, skins and sewn references. */
    function meshBuilder() {
        const m = { p: [], n: [], uv: [], c: [], j: [], w: [], i: [], refs: [], roots: [], hang: [], anyHang: false };
        m.vertex = (pos, nrm, uv, color, laid, ref, hang) => {
            const k = m.p.length / 3;
            m.p.push(pos[0], pos[1], pos[2]); m.n.push(nrm[0], nrm[1], nrm[2]); m.uv.push(uv[0], uv[1]); m.c.push(color[0], color[1], color[2]);
            for (let q = 0; q < 4; q++) { m.j.push(laid.joints[ref * 4 + q]); m.w.push(laid.weights[ref * 4 + q]); }
            m.refs.push(laid.fabricEntry ?? 0, ref); m.roots.push(laid.positions[ref * 3], laid.positions[ref * 3 + 1], laid.positions[ref * 3 + 2]);
            const hg = hang ?? (laid.hang ? laid.hang[ref] ?? -1 : -1); m.hang.push(hg); if (hg >= 0) m.anyHang = true;
            return k;
        };
        m.part = (name, material) => Object.assign({ name, positions: Float32Array.from(m.p), normals: Float32Array.from(m.n), uvs: Float32Array.from(m.uv), colors: Float32Array.from(m.c),
            joints: Uint8Array.from(m.j), weights: Float32Array.from(m.w), index: Uint32Array.from(m.i), sewnRefs: Int32Array.from(m.refs), sewnRoots: Float32Array.from(m.roots) },
            m.anyHang ? { hang: Float32Array.from(m.hang) } : {}, material);
        return m;
    }
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], len = a => Math.hypot(a[0], a[1], a[2]), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const at3 = (A, i) => [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]];

    /** The outward normal of a laid vertex (a skirt's faces may be wound either way). */
    function outwardNormal(laid, v) {
        const n = at3(laid.normals, v), o = laid.origin ? laid.origin[v] : v, B = laid.base;
        if (B && o * 3 + 2 < B.length) { const d = sub(at3(laid.positions, o), at3(B, o)); if (dot(d, n) < 0) return mul(n, -1); }
        return n;
    }

    /**
     * A fringe on a worn garment's hems: the lower hems and cuffs (and, ragged, every hem but the
     * neck's) grow cards hanging past the turned edge, alpha cut into tatters and threads.
     */
    function fringe(entry, info, built, m) {
        const laid = entry.laid, rows = laid.hem && laid.hem.rows, piece = laid.piece;
        if (!rows || !rows.size || !piece || !piece.border) return;
        const L = info.level, scale = built.height / 1.7, ragged = info.ragged;
        if (!ragged && L < 0.25) return;
        const neck = built.bones.find(b => b.name === 'Neck').head[1];
        const color = linear(entry.look.color), down = [0, -1, 0];
        const edges = piece.border.filter(([a, b]) => !(laid.internalHem && laid.internalHem[a] && laid.internalHem[b]) && rows.has(a) && rows.has(b));
        if (!edges.length) return;
        // A bodice sewn to a skirt of its own frays at its sleeves only (its lower edge is a waist, not a hem).
        const bodiceOnly = !entry.skirt && entry.hasSkirt;
        const card = new Map(), sd = info.seed % 1000;
        // Distance along the edge, for the picture's u.
        const order = new Map();
        { let u = 0; for (const [a, b] of edges) { if (!order.has(a)) order.set(a, u); u += len(sub(at3(laid.positions, b), at3(laid.positions, a))); if (!order.has(b)) order.set(b, u); } }
        for (const i of new Set(edges.flat())) {
            const ids = rows.get(i), f = laid.field[i], p = at3(laid.positions, i);
            if (p[1] > neck - 0.06 * scale && !(f.fam >= 1 && f.fam <= 4)) continue;
            if (bodiceOnly && f.fam === 0) continue;
            const n = outwardNormal(laid, i);
            // Inward along the cloth (toward the vertices inside it); the fringe continues the other way.
            const inner = piece.neighbors[i].filter(q => !piece.onBorder[q]);
            if (!inner.length) continue;
            let into = [0, 0, 0]; for (const q of inner) into = add(into, sub(at3(laid.positions, q), p));
            into = unit(sub(into, mul(n, dot(into, n))));
            const away = mul(into, -1), downness = dot(away, down);
            const cuff = (f.fam === 1 || f.fam === 2) && f.s > 2.55 || (f.fam === 3 || f.fam === 4) && f.s > 1.55;
            let weight = cuff ? 0.8 : Math.max(0, (downness - 0.15) / 0.85);
            // A ragged coat tatters where its hems hang (the skirt's lower edge); a cuff only frays (long cards there
            // read as feathers sticking off the wrist), and an edge running down the open front barely does.
            if (ragged) weight = cuff ? 0.28 : Math.max(0.12 * Math.max(0, downness + 0.6), (downness - 0.3) / 0.7);
            if (weight <= 0.02) continue;
            const along = order.get(i) || 0, wobble = noise3(along / (0.09 * scale) + sd, 0.5, 1.5), fine = noise3(along / (0.025 * scale) + sd, 4.5, 2.5);
            const length = (ragged ? (0.025 + 0.06 * L) * (0.35 + 1.1 * wobble) + 0.012 * fine : (0.004 + 0.008 * L) * (0.6 + 0.8 * fine)) * scale * weight;
            if (length < 0.002 * scale) continue;
            // Hanging: a lower hem's tatters fall more than they reach out.
            const dir = unit(add(mul(away, 0.65), mul(down, 0.35 * Math.max(0, downness))));
            const top = add(at3(laid.positions, ids[Math.min(2, ids.length - 1)]), mul(into, 0.0015 * scale));
            const mid = add(add(top, mul(dir, length * 0.5)), mul(n, 0.0015 * scale * (ragged ? 1 : 0.3)));
            const end = add(add(top, mul(dir, length)), mul(n, 0.003 * scale * (ragged ? (fine - 0.3) : 0)));
            const u = along / (0.14 * scale), vmax = Math.min(1, length / ((ragged ? 0.1 : 0.03) * scale));
            const dark = color.map(c => c * 0.78);
            // A short fray needs no bend: two rows; a long tatter three.
            card.set(i, ragged ? [
                m.vertex(top, n, [u, 0], color, laid, i),
                m.vertex(mid, n, [u, vmax * 0.5], mix3(color, dark, 0.5), laid, i),
                m.vertex(end, n, [u, vmax], dark, laid, i)
            ] : [m.vertex(top, n, [u, 0], color, laid, i), m.vertex(end, n, [u, vmax], dark, laid, i)]);
        }
        for (const [a, b] of edges) {
            const A = card.get(a), B = card.get(b);
            if (!A || !B) continue;
            for (let r = 0; r + 1 < A.length; r++) m.i.push(A[r], B[r], A[r + 1], B[r], B[r + 1], A[r + 1]);
        }
    }

    /**
     * Chart coordinates of a laid vertex (meters on the average body, as RRCharacterAtlas lays its
     * charts): round its chain and along it; a skirt's round its axis and down it.
     */
    function chartOf(an, laid, v, fam, skirt) {
        const f = laid.field[v];
        if (skirt) return [f.spineAng * an.radius[5] * 1.15, f.u * an.unit[5]];
        if (fam === 0) return [f.spineAng * an.radius[0] * 1.35, f.y];
        return [(f.la ?? f.ang) * an.radius[fam] * 1.15, f.s * an.unit[fam]];
    }
    /**
     * A repair laid over the cloth round a spot: the garment's own triangles there, clipped to a
     * turned rectangle (`w` by `h` meters) in chart space and lifted off the cloth, textured from
     * one cell of the patch picture. Returns whether anything was laid.
     */
    function repair(entry, spot, w, h, turn, cell, color, an, built, m, lift) {
        const laid = entry.laid, skirt = !!entry.skirt, fam = spot.fam[0];
        if (fam !== 0 && skirt) return false;
        const n0 = laid.rimStart, I = laid.index, scale = built.height / 1.7;
        // The spot's own chart coordinates.
        const center = fam === 0 ? (skirt ? [spot.ang * an.radius[5] * 1.15, null] : [spot.ang * an.radius[0] * 1.35, spot.y]) : [spot.ang * an.radius[fam] * 1.15, spot.s * an.unit[fam]];
        if (skirt) {
            // Down a skirt: its reach at the spot's height, from the vertex nearest it.
            let best = Infinity, u = null;
            for (let v = 0; v < n0; v++) { const f = laid.field[v], d = Math.abs(f.y - spot.y) + Math.abs(angDiff(f.spineAng, spot.ang)) * 0.1; if (d < best) { best = d; u = f.u; } }
            if (u == null || best > 0.08) return false;
            center[1] = u * an.unit[5];
        }
        const R = fam === 0 ? an.radius[skirt ? 5 : 0] * (skirt ? 1.15 : 1.35) : an.radius[fam] * 1.15;
        const c = Math.cos(turn), s = Math.sin(turn);
        const local = new Map();
        const loc = v => {
            if (local.has(v)) return local.get(v);
            const f = laid.field[v];
            let out = null;
            if (v < n0 && (fam === 0 ? (skirt || f.fam === 0) : f.fam === fam)) {
                const q = chartOf(an, laid, v, fam, skirt);
                const dx = angDiff(q[0] / R, center[0] / R) * R, dy = q[1] - center[1];
                out = [(dx * c + dy * s) / w, (-dx * s + dy * c) / h];
            }
            local.set(v, out); return out;
        };
        // Clip each triangle (in its local square, -0.5..0.5) against the square.
        const clip = poly => {
            for (const [k, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1]]) {
                const out = [];
                for (let i = 0; i < poly.length; i++) {
                    const a = poly[i], b = poly[(i + 1) % poly.length], ia = sgn * a.l[k] <= 0.5, ib = sgn * b.l[k] <= 0.5;
                    if (ia) out.push(a);
                    if (ia !== ib) { const t = (0.5 - sgn * a.l[k]) / (sgn * b.l[k] - sgn * a.l[k]); out.push({ l: [a.l[0] + (b.l[0] - a.l[0]) * t, a.l[1] + (b.l[1] - a.l[1]) * t], bary: a.bary.map((x, j) => x + (b.bary[j] - x) * t) }); }
                }
                poly = out; if (poly.length < 3) return null;
            }
            return poly;
        };
        const cx = (cell % 4) * 0.25, cy = Math.floor(cell / 4) * 0.5;
        let laidAny = false;
        for (let t = 0; t < I.length; t += 3) {
            const ids = [I[t], I[t + 1], I[t + 2]];
            const L = ids.map(loc);
            if (L.some(q => !q)) continue;
            if (L.every(q => q[0] < -0.5) || L.every(q => q[0] > 0.5) || L.every(q => q[1] < -0.5) || L.every(q => q[1] > 0.5)) continue;
            // A triangle spanning a whole chart's width is a seam's wrap, not cloth under the patch.
            if (Math.max(...L.map(q => q[0])) - Math.min(...L.map(q => q[0])) > 2.5) continue;
            const poly = clip(L.map((l, k) => ({ l, bary: [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0] })));
            if (!poly) continue;
            const P = ids.map(v => at3(laid.positions, v)), N = ids.map(v => outwardNormal(laid, v));
            const vs = poly.map(q => {
                const pos = [0, 1, 2].map(k => P[0][k] * q.bary[0] + P[1][k] * q.bary[1] + P[2][k] * q.bary[2]);
                const nrm = unit([0, 1, 2].map(k => N[0][k] * q.bary[0] + N[1][k] * q.bary[1] + N[2][k] * q.bary[2]));
                const ref = ids[q.bary.indexOf(Math.max(...q.bary))];
                // The cell's middle 80% is the patch; -0.5..0.5 maps to it.
                const uv = [cx + (0.5 + q.l[0] * 0.8) * 0.25, cy + (0.5 - q.l[1] * 0.8) * 0.5];
                return m.vertex(add(pos, mul(nrm, lift * scale)), nrm, uv, color, laid, ref);
            });
            // Wound as the cloth's own triangle.
            for (let k = 1; k + 1 < vs.length; k++) m.i.push(vs[0], vs[k], vs[k + 1]);
            laidAny = true;
        }
        return laidAny;
    }

    /**
     * Fringes, patches and tape for an outfit's worn garments on their laid cloth: { parts,
     * textures }. `entries`: RRCharacterWardrobe's laid pieces ({ laid, look, item, skirt, lining }).
     */
    function build(pack, built, entries, options) {
        const garmentOf = (options && options.garmentOf) || (() => null);
        const worn = entries.filter(e => !e.lining && e.look && e.look.wearInfo);
        const pocketed = entries.filter(e => !e.lining && e.look && garmentOf(e.garment) && garmentOf(e.garment).pockets);
        if (!worn.length && !pocketed.length) return { parts: [], textures: [] };
        const O = need('RRCharacterOutfit', './CharacterOutfit.js'), an = O.anatomy(pack), pics = makePictures();
        const frayMesh = meshBuilder(), patchMesh = meshBuilder(), tapeMesh = meshBuilder();
        const repairsOff = (options && options.repairsOff) || (() => false);
        const done = new Set();
        // Sewn-on pockets of the garment's own cloth (a field jacket's four), whatever its wear.
        for (const e of pocketed) {
            garmentOf(e.garment).pockets.forEach((q, k) => {
                const key = e.garment + ':pocket' + k;
                if (done.has(key)) return;
                const spot = { fam: [0], y: q.y, ang: q.ang };
                if (repair(e, spot, q.w, q.h, 0, PATCH_KINDS.indexOf('self'), linear(e.look.color).map(c => c * 0.97), an, built, patchMesh, 0.0018)) done.add(key);
            });
        }
        for (const e of worn) {
            const info = e.look.wearInfo;
            e.hasSkirt = entries.some(q => q !== e && q.garment === e.garment && q.skirt && !q.lining);
            if (info.fray !== false) fringe(e, info, built, frayMesh);
            if (repairsOff(e.item)) continue;
            // Each spot once per garment (its bodice or its skirt, whichever it lies on).
            const rand = stream(info.seed ^ 0x5bd1e995);
            info.patches.forEach((spot, k) => {
                const key = e.garment + ':p' + k;
                if (done.has(key)) return;
                const kind = e.item && e.item.patchKinds ? e.item.patchKinds : null;
                // Cloth patches from what was to hand: mostly plain, some print; a pocket on a jacket.
                const pick = kind ? kind[k % kind.length] : ['khaki', 'denim', 'check', 'self', 'sacking', 'leather', 'ticking'][Math.floor(rand() * 7)];
                const cell = Math.max(0, PATCH_KINDS.indexOf(pick)), size = spot.patch || [0.09, 0.09];
                const tint = pick === 'self' ? linear(e.look.color).map(c => c * 0.92) : [1, 1, 1];
                if (repair(e, spot, size[0] * (0.85 + 0.3 * rand()), size[1] * (0.85 + 0.3 * rand()), (rand() - 0.5) * 0.5, cell, tint, an, built, patchMesh, 0.0016)) done.add(key);
            });
            info.tape.forEach((spot, k) => {
                const key = e.garment + ':t' + k;
                if (done.has(key)) return;
                const r = spot.r * 2.6;
                // Two strips crossed over the tear.
                let ok = false;
                for (const [turn, lift] of [[0.5 + rand() * 0.3, 0.0019], [-0.7 - rand() * 0.3, 0.0023]]) ok = repair(e, spot, 0.046, Math.max(0.09, r * 2), turn, 7, [1, 1, 1], an, built, tapeMesh, lift) || ok;
                if (ok) done.add(key);
            });
        }
        const parts = [], textures = [];
        if (frayMesh.i.length) {
            parts.push(frayMesh.part('Frayed edges', { texture: pics.fray.name, keepColors: true, cutout: true, alphaCutoff: 0.45, roughness: 0.95, metalness: 0, doubleSided: true, clothDetail: true }));
            textures.push(pics.fray);
        }
        for (const [mesh, name, rough, metal] of [[patchMesh, 'Sewn patches', 0.9, 0], [tapeMesh, 'Tape repairs', 0.45, 0.25]]) {
            if (!mesh.i.length) continue;
            const part = mesh.part(name, { texture: pics.patches.name, keepColors: true, cutout: true, alphaCutoff: 0.5, roughness: rough, metalness: metal, doubleSided: false, clothDetail: true });
            // The relief and finish ride on the same coordinates (as a cloth's tile does, on the second set).
            Object.assign(part, { uvs1: Float32Array.from(part.uvs), normalTexture: pics.patchNormal.name, normalTexCoord: 1, normalScale: 1, metallicRoughnessTexture: pics.patchFinish.name, metallicRoughnessTexCoord: 1 });
            parts.push(part);
            if (!textures.includes(pics.patches)) textures.push(pics.patches, pics.patchNormal, pics.patchFinish);
        }
        return { parts, textures };
    }

    /**
     * Skin behind a garment's holes, drawn again where nothing else covers it: the body
     * vertices round each hole (on the average body) that no other garment's surface lies over.
     * `others`: the other surfaces worn ({ positions, index }); `hidden` is changed in place.
     */
    function unhide(pack, built, entries, hidden, others, frame) {
        const O = need('RRCharacterOutfit', './CharacterOutfit.js'), an = O.anatomy(pack);
        const holed = entries.filter(e => !e.lining && e.look && e.look.wearInfo && e.look.wearInfo.holes.length);
        if (!holed.length || !hidden.size) return 0;
        const ids = pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)]);
        let freed = 0;
        for (const e of holed) {
            const near = new Set();
            for (const h of e.look.wearInfo.holes) {
                const fam = h.fam[0];
                for (const v of ids) {
                    if (!hidden.has(v)) continue;
                    let dx, dy;
                    if (fam === 0) {
                        if (an.member[v * 5] < 0.5) continue;
                        const R = an.rest, hip = an.chains.spine[0], neckP = an.chains.spine[4], t = clamp01((R[v * 3 + 1] - hip[1]) / (neckP[1] - hip[1]));
                        const sa = Math.atan2(R[v * 3] - (hip[0] * (1 - t) + neckP[0] * t), R[v * 3 + 2] - (hip[2] * (1 - t) + neckP[2] * t));
                        dx = angDiff(sa, h.ang) * an.radius[0] * 1.35; dy = R[v * 3 + 1] - h.y;
                    }
                    else { if (an.member[v * 5 + fam] < 0.5) continue; dx = angDiff(an.angle[v * 5 + fam], h.ang) * an.radius[fam] * 1.15; dy = (an.s[v * 5 + fam] - h.s) * an.unit[fam]; }
                    if (Math.hypot(dx / h.stretch, dy) < h.r * 1.6 + 0.012) near.add(v);
                }
            }
            if (!near.size) continue;
            const rest = others.filter(p => p !== e.laid && !(p.laid && p.laid === e.laid));
            // Covered only by what lies close over the skin (a layer under the torn one), not by cloth further out.
            const open = rest.length ? O.uncovered(pack, built, rest, near, frame, 0.035) : [...near];
            for (const v of open) { if (hidden.delete(v)) freed++; }
        }
        return freed;
    }

    /**
     * An armor part's vertex colors weathered by its item's wear: rust blooming and running down
     * from its lower edges and hollows, grime in its recesses, scratches through to bright metal.
     */
    function weatherParts(parts, item, built) {
        const L = level(item);
        if (!(L > 0)) return;
        const sd = (seedFor(item) % 997) * 0.31, scale = built.height / 1.7;
        for (const p of parts) {
            if (!p.colors) continue;
            const P = p.positions, Cc = p.colors;
            for (let v = 0; v < P.length / 3; v++) {
                const x = P[v * 3] / scale, y = P[v * 3 + 1] / scale, z = P[v * 3 + 2] / scale;
                const n = fbm3(x * 14 + sd, y * 14, z * 14), streak = noise3(x * 70 + sd, y * 6, z * 70);
                const rust = L * ss(0.52, 0.75, n * 0.75 + streak * 0.35) * (p.metalness > 0.4 ? 1 : 0.35);
                const grime = L * 0.35 * ss(0.4, 0.8, noise3(x * 30, y * 30 + sd, z * 30));
                let c = [Cc[v * 3], Cc[v * 3 + 1], Cc[v * 3 + 2]];
                c = mix3(c, RUST.map(q => q * (0.8 + 0.6 * streak)), Math.min(0.8, rust));
                c = c.map(q => q * (1 - grime));
                Cc[v * 3] = c[0]; Cc[v * 3 + 1] = c[1]; Cc[v * 3 + 2] = c[2];
            }
            if (L > 0.4) p.roughness = Math.min(0.85, (p.roughness ?? 0.5) + 0.25 * L);
        }
    }

    const api = { SPOTS, PATCH_KINDS, coverageOf, OWN_CLOTH, level, seedFor, lookFor, paint, shoe, fabricKind, pictures: makePictures, build, unhide, weatherParts, noise3, fbm3, ihash, stream };
    root.RRCharacterWear = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
