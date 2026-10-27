/**
 * RRCharacterCentaur - a centaur: the person's own body down to the waist,
 * joined there to a horse's body and four legs.
 *
 * Construction: the humanoid recipe stays whole (skin, face, hair, tops,
 * hats, gloves and held props all work as on anyone), its skin below the
 * waist line is left out, and a horse (RRCreatureBody, built `headless`:
 * no neck and no head) grows a waist of its own up from the withers where
 * its neck would be, blended into the chest by the same implicit surface
 * as the rest of the horse. Between the person's cut edge and that waist a
 * short band is lofted: its top row is the skin's own cut edge (the same
 * points, normals and skin weights, colored as the skin picture is there),
 * its bottom row sits on the horse's waist (colored as the coat is there),
 * the radius easing between the two with level tangents at both ends, so
 * the skin flows into the coat without a step.
 *
 * Rig: the horse's bones come first (renamed HorseHips, HorseSpine,
 * HorseChest, HorseTail…; the legs keep the quadruped names), and the
 * person's Hips hangs from HorseChest, so a humanoid upper-body motion plays
 * on the torso while the horse's gaits (RRCreatureBody.poseClip) play on
 * the legs. Clips: Idle, Walk, Trot, Run (a gallop), the torso riding each
 * gait with a slight counter-sway and the arms swinging.
 *
 * Settings under `centaur`: coat, markings, pattern, tail hair (blank: the
 * person's hair color), hooves, and the horse's size, length, girth and
 * legs.
 */
(function (root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Creature = need('RRCreatureBody', './CreatureBody.js');
    const Outfit = need('RRCharacterOutfit', './CharacterOutfit.js');
    const Wardrobe = need('RRCharacterWardrobe', './CharacterWardrobe.js');
    const Props = need('RRCharacterProps', './CharacterProps.js');
    const Glb = need('RRCharacterGlb', './CharacterGlb.js');
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const smooth = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };
    const TAU = Math.PI * 2;
    const hex = /^#[0-9a-f]{6}$/i;

    // ── settings ──────────────────────────────────────────────────────────
    const PATTERNS = [['solid', 'Solid'], ['socks', 'Socks'], ['dapple', 'Dapple'], ['piebald', 'Patches'], ['spots', 'Spots'], ['countershade', 'Light belly']];
    const SLIDERS = [
        { key: 'size', label: 'Size', natural: [0.7, 0.95], extreme: [0.55, 1.2], format: 'x' },
        { key: 'bodyLength', label: 'Body length', natural: [0.8, 1.25], extreme: [0.65, 1.5], format: 'x' },
        { key: 'girth', label: 'Girth', natural: [0.85, 1.35], extreme: [0.7, 1.6], format: 'x' },
        { key: 'legLength', label: 'Leg length', natural: [1.1, 1.5], extreme: [0.9, 1.7], format: 'x' },
        { key: 'legThickness', label: 'Leg thickness', natural: [0.8, 1.3], extreme: [0.65, 1.6], format: 'x' },
        { key: 'tailLength', label: 'Tail length', natural: [0.7, 1.3], extreme: [0.4, 1.6], format: 'x' }
    ];
    const COATS = ['#5a3420', '#8a4a22', '#1e1a18', '#8e8a86', '#c9a160', '#e0dad0'];
    const DEFAULTS = { coat: '#5a3420', marking: '#f0ebe2', pattern: 'socks', tail: '', hoof: '#3a3430', size: 0.82, bodyLength: 1, girth: 1.1, legLength: 1.36, legThickness: 1, tailLength: 1.05 };

    function normalize(input) {
        const c = Object.assign({}, DEFAULTS, input || {}), out = {};
        for (const k of ['coat', 'marking', 'hoof']) out[k] = hex.test(c[k] || '') ? c[k].toLowerCase() : DEFAULTS[k];
        out.tail = hex.test(c.tail || '') ? c.tail.toLowerCase() : '';
        out.pattern = PATTERNS.some(p => p[0] === c.pattern) ? c.pattern : DEFAULTS.pattern;
        for (const s of SLIDERS) out[s.key] = clamp(Number.isFinite(+c[s.key]) && c[s.key] !== '' && c[s.key] != null ? +c[s.key] : DEFAULTS[s.key], s.extreme[0], s.extreme[1]);
        return out;
    }

    /** What a horse's body cannot wear: anything for legs or feet, belts at the hips, and what hangs over the horse. */
    const BLOCKED_SLOTS = new Set(['bottom', 'feet', 'legarmor', 'dress', 'hips', 'under', 'waist', 'cloak']);
    const BLOCKED_GARMENTS = new Set(['powerarmor', 'trenchcoat']);
    const BLOCKED_PROP_SLOTS = new Set(['harness']);
    function fitsGarment(id) {
        const g = Wardrobe && Wardrobe.BY_ID.get(id);
        return !!g && !BLOCKED_SLOTS.has(g.slot) && !BLOCKED_GARMENTS.has(id);
    }
    function fitsProp(id) {
        const p = Props && Props.BY_ID.get(id);
        return !!p && !BLOCKED_PROP_SLOTS.has(p.slot);
    }

    /** A normalized human recipe made a centaur's (or cleared of its settings when it is not one). */
    function normalizeRecipe(out, input) {
        if (!out || out.plan !== 'human' || out.species !== 'centaur') { if (out) delete out.centaur; return out; }
        out.centaur = normalize(input && input.centaur);
        out.outfit = (out.outfit || []).filter(i => fitsGarment(i.id));
        out.props = (out.props || []).filter(i => fitsProp(i.id));
        // The horse's own tail, not a second one at the person's hips.
        if (out.features && out.features.tail) out.features.tail = Object.assign({}, out.features.tail, { type: 'none' });
        return out;
    }

    // ── the waist cut ─────────────────────────────────────────────────────
    const CUT_ABOVE_HIPS = 0.075;
    /**
     * The person's skin below the waist line (source vertices, the arms
     * kept), and the edge it is cut along: one loop of source vertices round
     * the waist, in order of bearing from the front.
     */
    function cutOf(pack) {
        if (pack._centaurCut) return pack._centaurCut;
        const an = Outfit.anatomy(pack), P = an.rest, src = pack.body.source, I = pack.body.index;
        const ids = pack._bodyIds || (pack._bodyIds = [...new Set(src)]);
        const hips = pack.bones.findIndex(b => b.name === 'Hips');
        let hipY = 0, hn = 0;
        for (const v of pack.bones[hips].head) { hipY += P[v * 3 + 1]; hn++; }
        hipY /= hn || 1;
        const cutY = hipY + CUT_ABOVE_HIPS * an.height;
        const hidden = new Set();
        for (const v of ids) if (an.member[v * 5 + 1] + an.member[v * 5 + 2] < 0.5 && P[v * 3 + 1] < cutY) hidden.add(v);
        const edgeOf = new Map(), key = (a, b) => (a < b ? a * 65536 + b : b * 65536 + a);
        for (let t = 0; t < I.length; t += 3) {
            const a = src[I[t]], b = src[I[t + 1]], c = src[I[t + 2]];
            const h = hidden.has(a) && hidden.has(b) && hidden.has(c);
            for (const [p, q] of [[a, b], [b, c], [c, a]]) {
                if (p === q) continue;
                const k = key(p, q), e = edgeOf.get(k) || { kept: 0, hid: 0, p, q };
                if (h) e.hid++; else e.kept++;
                edgeOf.set(k, e);
            }
        }
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
        const ring = loops[0].slice();
        let area = 0;
        for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += P[a * 3] * P[b * 3 + 2] - P[b * 3] * P[a * 3 + 2]; }
        if (area > 0) ring.reverse();
        return (pack._centaurCut = { hidden, hiddenIds: [...hidden], ring, cutY, hipY, height: an.height });
    }

    // ── helpers ───────────────────────────────────────────────────────────
    function hull2(points) {
        const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        if (p.length < 3) return p;
        const crossZ = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
        const lower = [], upper = [];
        for (const q of p) { while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
        for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
        return lower.slice(0, -1).concat(upper.slice(0, -1));
    }
    /** How far the hull reaches from (cx, cz) along bearing a (atan2(x, z)). */
    function hullReach(h, cx, cz, a) {
        const dx = Math.sin(a), dz = Math.cos(a);
        let best = 0;
        for (let i = 0; i < h.length; i++) {
            const p = h[i], q = h[(i + 1) % h.length];
            const ex = q[0] - p[0], ez = q[1] - p[1], den = dx * ez - dz * ex;
            if (Math.abs(den) < 1e-12) continue;
            const wx = p[0] - cx, wz = p[1] - cz;
            const t = (wx * ez - wz * ex) / den, s = (wx * dz - wz * dx) / den;
            if (t > 0 && s >= -1e-6 && s <= 1 + 1e-6) best = Math.max(best, t);
        }
        return best;
    }
    function skinOf(list) {
        const acc = new Map();
        for (const [j, w] of list) if (w > 0) acc.set(j, (acc.get(j) || 0) + w);
        const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const sum = top.reduce((s, e) => s + e[1], 0) || 1;
        return { joints: top.map(e => e[0]).concat([0, 0, 0, 0]).slice(0, 4), weights: top.map(e => e[1] / sum).concat([0, 0, 0, 0]).slice(0, 4) };
    }
    const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const linearHex = h => [1, 3, 5].map(i => toLinear(parseInt(h.slice(i, i + 2), 16) / 255));
    /** A picture's color (linear) at uv, or null without its pixels. */
    function sample(tex, u, v) {
        if (!tex || !tex.data || !tex.width) return null;
        const x = clamp(Math.floor(u * tex.width), 0, tex.width - 1), y = clamp(Math.floor(v * tex.height), 0, tex.height - 1);
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const i = (clamp(y + dy, 0, tex.height - 1) * tex.width + clamp(x + dx, 0, tex.width - 1)) * 4;
            r += tex.data[i]; g += tex.data[i + 1]; b += tex.data[i + 2]; n++;
        }
        return [toLinear(r / n / 255), toLinear(g / n / 255), toLinear(b / n / 255)];
    }
    const LEG_BONES = /^(Left|Right)(UpLeg|Leg|Foot|ToeBase|Toe)|^(Left|Right)(Thigh|Shin|Calf)/;
    const HORSE_RENAME = { Hips: 'HorseHips', Spine: 'HorseSpine', Chest: 'HorseChest', Tail: 'HorseTail', Tail2: 'HorseTail2', Tail3: 'HorseTail3' };

    /** The horse a centaur stands on, for a person `H` meters tall. */
    function horseRecipe(r, H) {
        const c = r.centaur || normalize(), base = Creature.kindRecipe('horse');
        const scale = c.size * clamp(H / 1.7, 0.75, 1.3);
        return Creature.normalizeRecipe(Object.assign({}, base, {
            size: scale, bodyLength: c.bodyLength, girth: c.girth, legLength: c.legLength, legThickness: c.legThickness, tailLength: c.tailLength,
            pattern: c.pattern, mane: 'none', maneSize: 0, seed: r.seed == null ? 7 : r.seed,
            colors: Object.assign({}, base.colors, { coat: c.coat, marking: c.marking, light: c.marking, hoof: c.hoof, mane: c.tail || (r.hair && r.hair.color) || '#3a2a1e' }),
            anatomy: { detail: false }
        }));
    }

    // ── the build ─────────────────────────────────────────────────────────
    /** Horses built lately (headless, with their waist), newest last: { horse, lay, stubTop } by their settings. */
    const HORSES = new Map();
    /**
     * The horse under a built person: `parts` and `bones` (the person's, as
     * CharacterModel has them so far) are replaced in place by the whole
     * centaur's. ctx: { skinNormals, quality, textures }.
     */
    function build(pack, built, r, parts, bones, ctx) {
        const cut = cutOf(pack), P = built.shaped, N = ctx.skinNormals;
        const H = Math.max(0.5, built.height), sc = H / 1.7;
        const ring = cut.ring;
        // The waist at the cut: its middle, its reach each way, its lowest point.
        let cz = 0, ringLow = Infinity, ringTop = -Infinity, halfW = 0;
        for (const v of ring) { cz += P[v * 3 + 2]; ringLow = Math.min(ringLow, P[v * 3 + 1]); ringTop = Math.max(ringTop, P[v * 3 + 1]); halfW = Math.max(halfW, Math.abs(P[v * 3])); }
        cz /= ring.length;
        let zMin = Infinity, zMax = -Infinity;
        for (const v of ring) { zMin = Math.min(zMin, P[v * 3 + 2]); zMax = Math.max(zMax, P[v * 3 + 2]); }
        const halfD = (zMax - zMin) / 2, zMid = (zMax + zMin) / 2;

        // The horse, headless, with a waist rising from its withers a little narrower than the person's.
        const hr = horseRecipe(r, H), S = hr.size;
        let lay = null, stubTop = null;
        const save = ctx.quality !== 'preview';
        // The horse is the slow part (a third of a second in the view, seconds in a file): built once per horse, waist
        // size (to 4 mm) and quality, and kept here (the last few), so a face, hair, outfit or color change, and a saved
        // file's two builds (the skin probe, then the file), reuse it.
        const qz = v => Math.round(v / 0.004) * 0.004, wW = qz(halfW), wD = qz(halfD), scQ = Math.round(sc * 100) / 100;
        const key = JSON.stringify([hr, wW, wD, scQ, save, ctx.hairBudget ?? null]);
        const hit = HORSES.get(key) || null;
        if (hit) { HORSES.delete(key); HORSES.set(key, hit); }
        const horse = hit ? hit.horse : Creature.build(hr, {
            quality: save ? 'save' : 'preview', static: true, headless: true, hairBudget: ctx.hairBudget,
            extraShapes: (L, k) => {
                lay = L;
                const J = L.J, g = L.g;
                const rb = 0.84 * wD / S, flat = clamp(wW / Math.max(1e-3, wD), 1, 1.8);
                // High enough that the band's foot clears the withers behind it: the cut round the waist is one loop.
                stubTop = [0, Math.max(L.chestTop + 0.1 * scQ / S, J.withers[1] + 0.01 * (L.gv || g) + 0.03 + 0.035 * scQ / S), J.neck[2] - 0.03];
                // The breast rising from the chest's front, round and blended in, then the waist on it as wide across as the person's.
                const mid = [0, L.chestTop - 0.02, J.neck[2] - 0.05];
                const breast = k.cone([0, J.neck[1] - 0.16, J.neck[2] - 0.1], mid, 0.2 * g, rb * 1.05, 'Chest', 0.14 * g, 'torso');
                k.flatten(breast, 0, 0.8);
                // A deep, broad front: the breast full between the forelegs, the shoulders standing out over them, so
                // from the front a horse's body is under the person, not a column.
                const gv = L.gv || g, yS = L.yS, zS = L.zS;
                const front = k.ellipsoid([0, yS - 0.02 * gv, zS + 0.05], [0.16 * g, 0.2 * gv, 0.13], 'Chest', 0.1 * g, 'torso');
                const shoulders = [1, -1].map(sd => k.ellipsoid([sd * 0.12 * g, yS + 0.14 * gv, zS - 0.04], [0.11 * g, 0.21 * gv, 0.17], 'Chest', 0.1 * g, 'torso'));
                const waist = k.cone(mid, stubTop, rb * 1.05, rb, 'Chest', 0.06 * g, 'torso');
                // A shape's field is read at x times the factor: below 1 it widens.
                k.flatten(waist, 0, 1 / flat);
                return [breast, waist, front, ...shoulders];
            }
        });
        if (hit) { lay = hit.lay; stubTop = hit.stubTop; }
        else { HORSES.set(key, { horse, lay, stubTop }); while (HORSES.size > 3) HORSES.delete(HORSES.keys().next().value); }
        const hb = horse.bones, hIndex = new Map(hb.map((b, i) => [b.name, i]));
        // Body units to meters: the horse's floor (minY) from its hips' bone.
        const minY = lay.J.hips[1] - hb[hIndex.get('Hips')].head[1] / S;
        const top = [0, (stubTop[1] - minY) * S, stubTop[2] * S];
        const hBody = horse.parts.find(p => p.name === 'Body');
        // The horse's waist across a level a little under its top: its outline (x-z hull) about its own middle.
        const bandBottom = top[1] - 0.035 * sc, reachMax = 1.5 * Math.max(halfW, halfD);
        const slab = [];
        for (let i = 0; i < hBody.positions.length; i += 3) {
            const y = hBody.positions[i + 1];
            if (Math.abs(y - bandBottom) < 0.01 * sc && Math.hypot(hBody.positions[i], hBody.positions[i + 2] - top[2]) < reachMax) slab.push([hBody.positions[i], hBody.positions[i + 2]]);
        }
        const hHull = hull2(slab);
        let hz = 0; for (const p of hHull) hz += p[1]; hz = hHull.length ? hz / hHull.length : top[2];
        const stubReach = a => Math.max(0.02 * sc, hullReach(hHull, 0, hz, a));
        // Where the person goes: the waist's middle over the horse's, the cut's lowest point a band's height above.
        const bandH = 0.085 * sc;
        const d = [0, bandBottom + bandH - ringLow, hz - zMid];

        // The person moved onto the horse (copies: parts may be cached), its leg influences moved to the hips.
        const humanHips = bones.findIndex(b => b.name === 'Hips');
        const legSet = new Set(bones.map((b, i) => (LEG_BONES.test(b.name) ? i : -1)).filter(i => i >= 0));
        const keptHorse = hb.map((b, i) => (b.name === 'Neck' || b.name === 'Head' ? -1 : i)).filter(i => i >= 0);
        const HN = keptHorse.length, horseMap = new Map(keptHorse.map((i, k) => [i, k]));
        const chestNew = horseMap.get(hIndex.get('Chest'));
        const moved = parts.map(p => {
            const q = Object.assign({}, p, { positions: Float32Array.from(p.positions) });
            for (let i = 0; i < q.positions.length; i += 3) { q.positions[i + 1] += d[1]; q.positions[i + 2] += d[2]; }
            if (q.sewnRoots) { q.sewnRoots = Float32Array.from(q.sewnRoots); for (let i = 0; i < q.sewnRoots.length; i += 3) { q.sewnRoots[i + 1] += d[1]; q.sewnRoots[i + 2] += d[2]; } }
            if (p.joints) {
                const J = new Uint8Array(p.joints.length), W = Float32Array.from(p.weights);
                for (let v = 0; v < J.length / 4; v++) {
                    const list = [];
                    for (let k = 0; k < 4; k++) list.push([legSet.has(p.joints[v * 4 + k]) ? humanHips : p.joints[v * 4 + k], p.weights[v * 4 + k]]);
                    const s = skinOf(list);
                    for (let k = 0; k < 4; k++) { J[v * 4 + k] = s.joints[k] + HN; W[v * 4 + k] = s.weights[k]; }
                }
                q.joints = J; q.weights = W;
            }
            return q;
        });
        // The horse's parts on the new bone order (the neck and head gone with their eyes).
        const horseParts = horse.parts.filter(p => p.name !== 'Eyes').map(p => {
            const q = Object.assign({}, p, { name: p.name === 'Body' ? 'Horse' : 'Horse ' + p.name.toLowerCase() });
            if (p.joints) {
                const J = new Uint8Array(p.joints.length);
                for (let i = 0; i < J.length; i++) { const m = horseMap.get(p.joints[i]); J[i] = m == null ? chestNew : m; }
                q.joints = J;
            }
            return q;
        });
        const hBodyNew = horseParts.find(p => p.name === 'Horse');

        // The band: the skin's cut edge down onto the horse's waist.
        const body = moved.find(p => p.name === 'Body');
        const skinTex = body && body.texture && ctx.textures ? ctx.textures[body.texture] : null;
        const coatTex = horse.textures ? horse.textures[hBody.texture] : null;
        const meshOf = new Map();
        if (body) for (let mv = 0; mv < pack.body.source.length; mv++) if (!meshOf.has(pack.body.source[mv])) meshOf.set(pack.body.source[mv], mv);
        const skinHex = linearHex(hex.test(r.skin || '') ? r.skin : '#c69c7f');
        const ROWS = 9, n = ring.length, bottomNormal = new Array(n);
        const pos = new Float32Array((ROWS + 1) * n * 3), nrm = new Float32Array((ROWS + 1) * n * 3), col = new Float32Array((ROWS + 1) * n * 3);
        const jo = new Uint8Array((ROWS + 1) * n * 4), we = new Float32Array((ROWS + 1) * n * 4);
        // The top row's colors: the skin picture where the edge is, each the median of its nine neighbors along the
        // edge (a seam in the picture's layout reads as a dark stroke otherwise).
        const rawTop = ring.map(v => { const mv = meshOf.get(v); return (skinTex && body && body.uvs && mv != null && sample(skinTex, body.uvs[mv * 2], body.uvs[mv * 2 + 1])) || skinHex; });
        const lum = c => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
        const topColors = rawTop.map((_, i) => [-4, -3, -2, -1, 0, 1, 2, 3, 4].map(k => rawTop[(i + k + ring.length) % ring.length]).sort((a, b) => lum(a) - lum(b))[4]);
        const nearestHorse = (x, y, z) => {
            let best = -1, bd = Infinity;
            const hp = hBodyNew.positions;
            for (let i = 0; i < hp.length; i += 3) {
                const dy = hp[i + 1] - y; if (dy * dy > bd) continue;
                const dd = (hp[i] - x) ** 2 + dy * dy + (hp[i + 2] - z) ** 2;
                if (dd < bd) { bd = dd; best = i / 3; }
            }
            return best;
        };
        for (let i = 0; i < n; i++) {
            const v = ring[i], p0 = [P[v * 3], P[v * 3 + 1] + d[1], P[v * 3 + 2] + d[2]];
            const a = Math.atan2(p0[0], p0[2] - hz), r0 = Math.hypot(p0[0], p0[2] - hz), r1 = stubReach(a) + 0.0015 * sc;
            const mv = meshOf.get(v);
            // The top row's color: the skin picture where the edge is.
            const top3 = topColors[i];
            const bot = [Math.sin(a) * r1, bandBottom, hz + Math.cos(a) * r1];
            const hv = nearestHorse(bot[0], bot[1], bot[2]);
            bottomNormal[i] = hBodyNew.normals ? [hBodyNew.normals[hv * 3], hBodyNew.normals[hv * 3 + 1], hBodyNew.normals[hv * 3 + 2]] : null;
            let bot3 = null;
            if (coatTex && hBodyNew.uvs) bot3 = sample(coatTex, hBodyNew.uvs[hv * 2], hBodyNew.uvs[hv * 2 + 1]);
            if (hBodyNew.colors) {
                const k = hBodyNew.colors.length / (hBodyNew.positions.length / 3), c = [hBodyNew.colors[hv * k], hBodyNew.colors[hv * k + 1], hBodyNew.colors[hv * k + 2]];
                bot3 = bot3 ? bot3.map((x, j) => x * c[j]) : c;
            }
            if (!bot3) bot3 = linearHex(r.centaur.coat);
            // The skin's own weights at the top; the horse's chest at the bottom.
            const topSkin = [];
            for (let k = 0; k < 4; k++) { const j = pack.skinJoints[v * 4 + k]; topSkin.push([(legSet.has(j) ? humanHips : j) + HN, pack.skinWeights[v * 4 + k]]); }
            const botSkin = [];
            for (let k = 0; k < 4; k++) botSkin.push([hBodyNew.joints[hv * 4 + k], hBodyNew.weights[hv * 4 + k]]);
            for (let row = 0; row <= ROWS; row++) {
                const t = row / ROWS, e = t * t * (3 - 2 * t);
                const rr = r0 + (r1 - r0) * e, y = p0[1] + (bot[1] - p0[1]) * t;
                const at = row * n + i;
                if (row === 0) pos.set(p0, at * 3);
                else pos.set([Math.sin(a) * rr, y, hz + Math.cos(a) * rr], at * 3);
                // Skin into coat: the skin's color holds for the top third, then eases to the coat's.
                const m = smooth(0.08, 1, t);
                col.set([top3[0] + (bot3[0] - top3[0]) * m, top3[1] + (bot3[1] - top3[1]) * m, top3[2] + (bot3[2] - top3[2]) * m], at * 3);
                const s = skinOf(topSkin.map(([j, w]) => [j, w * (1 - smooth(0.15, 0.95, t))]).concat(botSkin.map(([j, w]) => [j, w * smooth(0.15, 0.95, t)])));
                jo.set(s.joints, at * 4); we.set(s.weights, at * 4);
            }
        }
        // One skin across the join. The horse's waist above the band's foot is cut away (every face reaching above it),
        // and the band's last row is the cut's edge itself (the horse's own points, normals, weights and coat
        // color, left where they are so its surface keeps its own shape and light), stitched to the row above it: the
        // person's skin, the band and the horse are one closed surface.
        // The horse's faces round its waist are clipped at the foot's level (each face crossing it cut along it, new
        // points on its edges carrying its normals, picture place, color and weights), so the cut's edge is one clean
        // level loop on the horse's own surface.
        const src = hBodyNew, sv = src.positions.length / 3, kc = src.colors ? src.colors.length / sv : 0;
        const NP = Array.from(src.positions), NN = src.normals ? Array.from(src.normals) : null, NU = src.uvs ? Array.from(src.uvs) : null;
        const NC = src.colors ? Array.from(src.colors) : null, NJ = Array.from(src.joints), NW = Array.from(src.weights);
        const HI = src.index, keepH = [], cutAt = new Map(), segs = [], keyOf = v => Math.round(NP[v * 3] * 1e5) + ',' + Math.round(NP[v * 3 + 2] * 1e5);
        const region = (x, z) => Math.hypot(x, z - hz) < stubReach(Math.atan2(x, z - hz)) + 0.03 * sc;
        const cutPoint = (a, b) => {
            const k = a < b ? a + '_' + b : b + '_' + a;
            if (cutAt.has(k)) return cutAt.get(k);
            const ya = NP[a * 3 + 1], yb = NP[b * 3 + 1], t = (bandBottom - ya) / (yb - ya), v = NP.length / 3;
            for (let q = 0; q < 3; q++) NP.push(NP[a * 3 + q] + (NP[b * 3 + q] - NP[a * 3 + q]) * t);
            NP[v * 3 + 1] = bandBottom;
            if (NN) { const nx = NN[a * 3] + (NN[b * 3] - NN[a * 3]) * t, ny = NN[a * 3 + 1] + (NN[b * 3 + 1] - NN[a * 3 + 1]) * t, nz = NN[a * 3 + 2] + (NN[b * 3 + 2] - NN[a * 3 + 2]) * t, l = Math.hypot(nx, ny, nz) || 1; NN.push(nx / l, ny / l, nz / l); }
            if (NU) for (let q = 0; q < 2; q++) NU.push(NU[a * 2 + q] + (NU[b * 2 + q] - NU[a * 2 + q]) * t);
            if (NC) for (let q = 0; q < kc; q++) NC.push(NC[a * kc + q] + (NC[b * kc + q] - NC[a * kc + q]) * t);
            const w = t < 0.5 ? a : b;
            for (let q = 0; q < 4; q++) { NJ.push(NJ[w * 4 + q]); NW.push(NW[w * 4 + q]); }
            cutAt.set(k, v);
            return v;
        };
        for (let t = 0; t < HI.length; t += 3) {
            const tri = [HI[t], HI[t + 1], HI[t + 2]];
            const up = tri.map(v => NP[v * 3 + 1] > bandBottom);
            const cx = (NP[tri[0] * 3] + NP[tri[1] * 3] + NP[tri[2] * 3]) / 3, cz = (NP[tri[0] * 3 + 2] + NP[tri[1] * 3 + 2] + NP[tri[2] * 3 + 2]) / 3;
            if (!up.some(Boolean) || !region(cx, cz)) { keepH.push(...tri); continue; }
            if (up.every(Boolean)) continue;
            // The face's part below the level, in its own winding.
            const poly = [], cuts = [];
            for (let e = 0; e < 3; e++) {
                const a = tri[e], b = tri[(e + 1) % 3];
                if (!up[e]) poly.push(a);
                if (up[e] !== up[(e + 1) % 3]) { const c = cutPoint(a, b); poly.push(c); cuts.push(c); }
            }
            for (let k = 1; k + 1 < poly.length; k++) keepH.push(poly[0], poly[k], poly[k + 1]);
            if (cuts.length === 2) segs.push(cuts);
        }
        // The cut's edge walked into its loop (points split along the picture's seams are one point here).
        const link = new Map(), rep = new Map();
        for (const [a, b] of segs) {
            const ka = keyOf(a), kb = keyOf(b);
            if (ka === kb) continue;
            if (!rep.has(ka)) rep.set(ka, a); if (!rep.has(kb)) rep.set(kb, b);
            if (!link.has(ka)) link.set(ka, new Set()); if (!link.has(kb)) link.set(kb, new Set());
            link.get(ka).add(kb); link.get(kb).add(ka);
        }
        let loop = [], closed = false;
        { const seenK = new Set();
          for (const st of link.keys()) {
              if (seenK.has(st)) continue;
              const L = [st]; seenK.add(st); let at = st;
              for (;;) { const nb = [...link.get(at)].filter(k => !seenK.has(k)); if (!nb.length) break; at = nb[0]; L.push(at); seenK.add(at); }
              if (L.length > loop.length) { loop = L; closed = L.length > 2 && link.get(L[L.length - 1]).has(L[0]); }
          } }
        loop = loop.map(k => rep.get(k));
        const HP = NP;
        const stitched = closed && loop.length >= 8 && link.size === loop.length && [...link.values()].every(x => x.size === 2);
        if (stitched) Object.assign(hBodyNew, { positions: Float32Array.from(NP), normals: NN ? Float32Array.from(NN) : src.normals, uvs: NU ? Float32Array.from(NU) : src.uvs, colors: NC ? Float32Array.from(NC) : src.colors, joints: Uint8Array.from(NJ), weights: Float32Array.from(NW), index: Uint32Array.from(keepH) });
        const hv3 = HP.length / 3;
        // The band's vertices: its rows down to the one above the foot, then the foot (the horse's cut edge).
        const rowsKept = stitched ? ROWS : ROWS + 1, m = stitched ? loop.length : 0, total = rowsKept * n + m;
        const P3 = new Float32Array(total * 3), C3 = new Float32Array(total * 3), J4 = new Uint8Array(total * 4), W4 = new Float32Array(total * 4);
        P3.set(pos.subarray(0, rowsKept * n * 3)); C3.set(col.subarray(0, rowsKept * n * 3)); J4.set(jo.subarray(0, rowsKept * n * 4)); W4.set(we.subarray(0, rowsKept * n * 4));
        const footN = [];
        for (let k = 0; k < m; k++) {
            const hvk = loop[k], at = rowsKept * n + k;
            P3.set([HP[hvk * 3], HP[hvk * 3 + 1], HP[hvk * 3 + 2]], at * 3);
            let c3 = coatTex && hBodyNew.uvs ? sample(coatTex, hBodyNew.uvs[hvk * 2], hBodyNew.uvs[hvk * 2 + 1]) : null;
            if (hBodyNew.colors) { const kk = hBodyNew.colors.length / hv3, cc = [hBodyNew.colors[hvk * kk], hBodyNew.colors[hvk * kk + 1], hBodyNew.colors[hvk * kk + 2]]; c3 = c3 ? c3.map((x, q2) => x * cc[q2]) : cc; }
            C3.set(c3 || linearHex(r.centaur.coat), at * 3);
            for (let q2 = 0; q2 < 4; q2++) { J4[at * 4 + q2] = hBodyNew.joints[hvk * 4 + q2]; W4[at * 4 + q2] = hBodyNew.weights[hvk * 4 + q2]; }
            footN.push(hBodyNew.normals ? [hBodyNew.normals[hvk * 3], hBodyNew.normals[hvk * 3 + 1], hBodyNew.normals[hvk * 3 + 2]] : null);
        }
        const idx = [];
        for (let row = 0; row < rowsKept - 1; row++) for (let i = 0; i < n; i++) {
            const a = row * n + i, b = row * n + (i + 1) % n, c2 = a + n, d2 = b + n;
            idx.push(a, c2, b, b, c2, d2);
        }
        if (stitched) {
            // The last row zipped to the foot in order of bearing round the waist.
            const bear = q2 => Math.atan2(P3[q2 * 3], P3[q2 * 3 + 2] - hz);
            const order = list => { const s0 = list.map(bear); let turn = 0; for (let k = 0; k < s0.length; k++) { let dd = s0[(k + 1) % s0.length] - s0[k]; if (dd > Math.PI) dd -= TAU; if (dd < -Math.PI) dd += TAU; turn += dd; } const L2 = turn < 0 ? list.slice().reverse() : list.slice(); const st = L2.reduce((b2, q2, k) => (bear(q2) < bear(L2[b2]) ? k : b2), 0); return L2.slice(st).concat(L2.slice(0, st)); };
            const A = order(Array.from({ length: n }, (_, i) => (rowsKept - 1) * n + i)), B = order(Array.from({ length: m }, (_, k) => rowsKept * n + k));
            const un = list => { const out = [], base = bear(list[0]); let prev = base; for (const q2 of list) { let b2 = bear(q2); while (b2 < prev - 1e-9) b2 += TAU; out.push(b2); prev = b2; } return out; };
            const uA = un(A), uB = un(B);
            let ia = 0, ib = 0;
            while (ia < A.length || ib < B.length) {
                const na = ia < A.length ? (ia + 1 < A.length ? uA[ia + 1] : uA[0] + TAU) : Infinity, nb = ib < B.length ? (ib + 1 < B.length ? uB[ib + 1] : uB[0] + TAU) : Infinity;
                if (na <= nb) { idx.push(A[ia % A.length], B[ib % B.length], A[(ia + 1) % A.length]); ia++; }
                else { idx.push(A[ia % A.length], B[ib % B.length], B[(ib + 1) % B.length]); ib++; }
            }
        }
        // Each face turned outward from the waist's middle.
        for (let t = 0; t < idx.length; t += 3) {
            const [a, b, c2] = [idx[t], idx[t + 1], idx[t + 2]];
            const ux = P3[b * 3] - P3[a * 3], uy = P3[b * 3 + 1] - P3[a * 3 + 1], uz = P3[b * 3 + 2] - P3[a * 3 + 2];
            const vx = P3[c2 * 3] - P3[a * 3], vy = P3[c2 * 3 + 1] - P3[a * 3 + 1], vz = P3[c2 * 3 + 2] - P3[a * 3 + 2];
            const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
            const cx = (P3[a * 3] + P3[b * 3] + P3[c2 * 3]) / 3, cz = (P3[a * 3 + 2] + P3[b * 3 + 2] + P3[c2 * 3 + 2]) / 3 - hz;
            if (nx * cx + nz * cz < 0) { idx[t + 1] = c2; idx[t + 2] = b; }
        }
        // Normals from the faces; the top row the skin's own, the foot the horse's own, eased in over the rows next to them.
        const fn = new Float32Array(P3.length);
        for (let t = 0; t < idx.length; t += 3) {
            const [a, b, c2] = [idx[t], idx[t + 1], idx[t + 2]];
            const ux = P3[b * 3] - P3[a * 3], uy = P3[b * 3 + 1] - P3[a * 3 + 1], uz = P3[b * 3 + 2] - P3[a * 3 + 2];
            const vx = P3[c2 * 3] - P3[a * 3], vy = P3[c2 * 3 + 1] - P3[a * 3 + 1], vz = P3[c2 * 3 + 2] - P3[a * 3 + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const q of [a, b, c2]) { fn[q * 3] += nx; fn[q * 3 + 1] += ny; fn[q * 3 + 2] += nz; }
        }
        const NR = new Float32Array(P3.length);
        const mixN = (x, y, z, h, k) => { const l = Math.hypot(x, y, z) || 1; return [x / l * (1 - k) + h[0] * k, y / l * (1 - k) + h[1] * k, z / l * (1 - k) + h[2] * k]; };
        for (let q = 0; q < total; q++) {
            let x = fn[q * 3], y = fn[q * 3 + 1], z = fn[q * 3 + 2];
            if (q >= rowsKept * n) { const h = footN[q - rowsKept * n]; if (h) [x, y, z] = h; }
            else {
                const row = Math.floor(q / n), v = ring[q % n], hn = bottomNormal[q % n];
                if (hn && row >= rowsKept - 2) [x, y, z] = mixN(x, y, z, hn, row === rowsKept - 1 ? 0.6 : 0.3);
                if (row <= 1 && N) [x, y, z] = mixN(x, y, z, [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], row === 0 ? 1 : 0.5);
            }
            const l = Math.hypot(x, y, z) || 1;
            NR.set([x / l, y / l, z / l], q * 3);
        }
        const band = { name: 'Centaur waist', positions: P3, normals: NR, colors: C3, index: Uint32Array.from(idx), joints: J4, weights: W4, kind: 'skin', roughness: 0.62 };

        // Outfit and hair that hung below the waist: cut level halfway down the band, where the skin has turned to coat,
        // and what is left over the band's upper half laid on it, so a top ends tucked over the join, not over bare skin.
        const hem = ringLow + d[1] - 0.5 * bandH;
        const colA = Array.from({ length: n }, (_, i) => Math.atan2(pos[i * 3], pos[i * 3 + 2] - hz));
        const bandReach = (x, y, z) => {
            const a = Math.atan2(x, z - hz);
            let i = 0, best = Infinity;
            for (let k = 0; k < n; k++) { let da = Math.abs(colA[k] - a); if (da > Math.PI) da = TAU - da; if (da < best) { best = da; i = k; } }
            const y0 = pos[i * 3 + 1];
            if (y > y0) return null;
            const t = clamp((y0 - y) / Math.max(1e-6, y0 - bandBottom), 0, 1) * ROWS, r0 = Math.floor(Math.min(ROWS - 1, t)), k = t - r0;
            const ra = Math.hypot(pos[(r0 * n + i) * 3], pos[(r0 * n + i) * 3 + 2] - hz), rb = Math.hypot(pos[((r0 + 1) * n + i) * 3], pos[((r0 + 1) * n + i) * 3 + 2] - hz);
            return ra + (rb - ra) * k;
        };
        for (const q of moved) {
            if (q.name === 'Body' || !q.index || q.kind === 'eye') continue;
            const I = q.index, keep = [];
            for (let t = 0; t < I.length; t += 3) {
                if (q.positions[I[t] * 3 + 1] < hem && q.positions[I[t + 1] * 3 + 1] < hem && q.positions[I[t + 2] * 3 + 1] < hem) continue;
                keep.push(I[t], I[t + 1], I[t + 2]);
            }
            if (keep.length === I.length) continue;
            q.index = Uint32Array.from(keep);
            // A level hem rather than the triangles' ragged edge, lying on the band (never inside it).
            const P2 = q.positions;
            for (const v of new Set(keep)) {
                if (P2[v * 3 + 1] < hem) P2[v * 3 + 1] = hem;
                const reach = bandReach(P2[v * 3], P2[v * 3 + 1], P2[v * 3 + 2]);
                if (reach == null) continue;
                const dx = P2[v * 3], dz = P2[v * 3 + 2] - hz, rv = Math.hypot(dx, dz), need = reach + 0.004 * sc;
                if (rv < need && rv > 1e-6) { P2[v * 3] = dx / rv * need; P2[v * 3 + 2] = hz + dz / rv * need; }
            }
        }

        // Bones: the horse's first (its neck and head left out), then the person's under the horse's chest.
        const newBones = keptHorse.map(i => {
            const b = hb[i];
            return { name: HORSE_RENAME[b.name] || b.name, parent: b.parent < 0 ? -1 : horseMap.get(b.parent), head: b.head.slice(), tail: b.tail.slice() };
        });
        for (const b of bones) newBones.push({ ...b, parent: b.parent < 0 ? chestNew : b.parent + HN, head: [b.head[0], b.head[1] + d[1], b.head[2] + d[2]], tail: b.tail ? [b.tail[0], b.tail[1] + d[1], b.tail[2] + d[2]] : b.tail });
        parts.splice(0, parts.length, ...horseParts, band, ...moved);
        bones.splice(0, bones.length, ...newBones);
        return { textures: horse.textures || {}, horse: hr, horseBones: hb.map(b => ({ ...b, head: b.head.slice(), tail: b.tail.slice() })), offset: d, band, horseCount: HN, waist: { bandBottom, top: ringLow + d[1], hz } };
    }

    /** The centaur's bones if `bones` are one's: { horse (the quadruped's names), map (horse index → bone index) }. */
    function horseRigOf(bones) {
        if (!bones || !bones.some(b => b.name === 'HorseChest')) return null;
        const back = Object.fromEntries(Object.entries(HORSE_RENAME).map(([k, v]) => [v, k]));
        const horse = [], map = [];
        bones.forEach((b, i) => {
            if (!(back[b.name] || /^(Left|Right)(Front|Rear)/.test(b.name))) return;
            horse.push({ name: back[b.name] || b.name, parent: -1, head: b.head, tail: b.tail, _i: i });
            map.push(i);
        });
        for (const h of horse) { const p = bones[h._i].parent; h.parent = map.indexOf(p); }
        // A neck and head at the chest's front, as the gaits ask for one.
        const chest = horse.findIndex(h => h.name === 'Chest'), c = horse[chest];
        const neckAt = [c.tail[0], c.tail[1], c.tail[2]];
        horse.push({ name: 'Neck', parent: chest, head: neckAt, tail: [neckAt[0], neckAt[1] + 0.3, neckAt[2] + 0.2] });
        horse.push({ name: 'Head', parent: horse.length - 1, head: [neckAt[0], neckAt[1] + 0.3, neckAt[2] + 0.2], tail: [neckAt[0], neckAt[1], neckAt[2] + 0.5] });
        map.push(-1, -1);
        return { horse, map };
    }
    const hasHorse = bones => !!bones && bones.some(b => b.name === 'HorseChest');

    // ── motion ────────────────────────────────────────────────────────────
    const GAITS = [{ id: 'idle', name: 'Idle' }, { id: 'walk', name: 'Walk', gait: 'walk' }, { id: 'trot', name: 'Trot', gait: 'trot' }, { id: 'gallop', name: 'Run', gait: 'gallop' }];
    const UPPER = ['wave', 'fight', 'armsUp', 'cast', 'sword', 'defend', 'hit', 'throw', 'pistol', 'pistolTwo', 'rifle'];
    const Poses = () => root.RRCharacterPoses || (typeof require === 'function' ? (() => { try { return require('./CharacterPoses.js'); } catch (_) { return null; } })() : null);
    const POSES = [{ id: 'walk', label: 'Walking' }, { id: 'trot', label: 'Trotting' }, { id: 'gallop', label: 'Galloping' }, { id: 'rear', label: 'Rearing up' }]
        .concat((Poses() ? Poses().POSES : []).filter(p => UPPER.includes(p.id)).map(p => ({ id: p.id, label: p.label })));

    /** Resamples a clip's tracks (quaternions) at `times`, its whole loop stretched over theirs so both loop together. */
    function resample(clip, times) {
        const T = clip.times, steps = T.length, period = times[times.length - 1] || 1;
        return clip.tracks.filter(t => !t.path).map(t => {
            const values = new Float32Array(times.length * 4);
            for (let f = 0; f < times.length; f++) {
                const x = ((times[f] % period) + period) % period / period * (steps - 1), i = Math.min(steps - 2, Math.floor(x)), k = x - i;
                const a = t.values.subarray(i * 4, i * 4 + 4), b0 = t.values.subarray((i + 1) * 4, (i + 1) * 4 + 4);
                const s = a[0] * b0[0] + a[1] * b0[1] + a[2] * b0[2] + a[3] * b0[3] < 0 ? -1 : 1;
                const q = [0, 1, 2, 3].map(j => a[j] * (1 - k) + b0[j] * s * k), l = Math.hypot(...q) || 1;
                values.set(q.map(x2 => x2 / l), f * 4);
            }
            return { bone: t.bone, values };
        });
    }

    /**
     * A clip for a centaur's bones: the horse's gait on its legs (or its
     * stance), the person's upper body riding it. `id`: idle, walk, trot,
     * gallop, rear, or one of UPPER (an upper-body humanoid pose over the
     * standing horse). `armAngle` lowers the arms as the humanoid Idle does.
     */
    function motion(bones, id, recipe, opts) {
        const rig = horseRigOf(bones);
        if (!rig) return null;
        const o = opts || {};
        const at = new Map(bones.map((b, i) => [b.name, i]));
        const gait = ['walk', 'trot', 'gallop', 'rear'].includes(id) ? id : null;
        const hr = recipe && recipe.centaur ? horseRecipe(recipe, 1.7) : Creature.kindRecipe('horse');
        const hclip = Creature.poseClip(rig.horse, gait || 'walk', hr);
        if (!hclip) return null;
        // Idle and the upper-body poses: the horse at rest, its weight shifting and its tail swishing a little.
        // An upper-body pose keeps its own timing; the horse stands under it.
        const made = !gait && UPPER.includes(id) && Poses() ? Poses().clip(bones, id, o.bodySkin) : null;
        const period = gait ? hclip.times[hclip.times.length - 1] : made ? made.times[made.times.length - 1] || 3 : 3;
        const steps = gait ? hclip.times.length : made ? Math.max(2, made.times.length) : 25;
        const times = Float32Array.from({ length: steps }, (_, i) => period * i / (steps - 1));
        const tracks = [];
        const put = (bone, fn) => {
            if (bone == null || bone < 0) return;
            const values = new Float32Array(steps * 4);
            for (let f = 0; f < steps; f++) values.set(fn(f / (steps - 1), f), f * 4);
            tracks.push({ bone, values });
        };
        const q = (x, y, z, a) => Glb.axisAngle(x, y, z, a);
        const mul = (...qs) => qs.reduce((a, b) => Glb.multiply(a, b));
        const heights = new Float32Array(steps);
        if (gait) {
            for (const t of hclip.tracks) { const b = rig.map[t.bone]; if (b >= 0) tracks.push({ bone: b, values: t.values }); }
            for (let f = 0; f < steps; f++) heights[f] = hclip.heights[f];
        } else {
            const tail = ['HorseTail', 'HorseTail2', 'HorseTail3'];
            tail.forEach((name, k) => put(at.get(name), t => q(0, 1, 0, (0.05 + 0.04 * k) * Math.sin(TAU * t - k * 0.7))));
            put(at.get('HorseHips'), t => q(0, 0, 1, 0.01 * Math.sin(TAU * t)));
            put(at.get('LeftRearLowerLeg'), t => q(1, 0, 0, 0.04 * (0.5 - 0.5 * Math.cos(TAU * t))));
        }
        // The person: the humanoid Idle's arms and breath underneath.
        const idle = Glb.idleClip(bones, { armAngle: o.armAngle ?? 0.3 });
        const w = f => TAU * f;
        const sway = gait === 'walk' ? 1 : gait === 'trot' ? 0.7 : gait === 'gallop' ? 1.2 : 0;
        let upper = null;
        if (made) {
            upper = resample({ times: made.times, tracks: made.tracks.filter(t => !t.path && !LEG_BONES.test(bones[t.bone].name)) }, times);
        }
        if (upper) tracks.push(...upper);
        else if (idle) {
            const res = resample(idle, times);
            for (const t of res) {
                const name = bones[t.bone].name;
                // The arms hang at the sides as the humanoid Idle holds them (elbows a little bent, palms in) and
                // swing alternately with the stride, less at a trot, a little more at a gallop.
                if (!sway || !/^(Left|Right)Arm$/.test(name)) { tracks.push(t); continue; }
                const side = name.startsWith('Left') ? 1 : -1, amp = gait === 'gallop' ? 0.16 : gait === 'trot' ? 0.1 : 0.16;
                const values = new Float32Array(steps * 4);
                for (let f = 0; f < steps; f++) {
                    const ph = w(f / (steps - 1)), swing = amp * side * Math.sin(ph + (gait === 'walk' ? 0.8 : 0));
                    values.set(mul(q(1, 0, 0, swing), t.values.subarray(f * 4, f * 4 + 4)), f * 4);
                }
                tracks.push({ bone: t.bone, values });
            }
        }
        // The torso rides the gait: it turns and rolls against the horse's chest, and leans into a gallop.
        if (sway || gait === 'rear') {
            // Rearing, all of the horse's tilt is taken back (the person stays upright, leaning a little forward).
            const back = gait === 'rear' ? 1 : 0.55;
            const trackOf = name => tracks.find(t => t.bone === at.get(name));
            const chain = ['HorseHips', 'HorseSpine', 'HorseChest'].map(trackOf).filter(Boolean);
            const inv = qq => [-qq[0], -qq[1], -qq[2], qq[3]];
            const hipsIdx = at.get('Hips');
            const values = new Float32Array(steps * 4);
            for (let f = 0; f < steps; f++) {
                const ph = w(f / (steps - 1));
                let qq = [0, 0, 0, 1];
                // Most of what the horse's back pitches and rolls is taken back, so the person stays upright.
                // The horse's chest as it turns in the world: its hips, spine and chest together.
                const W = chain.reduce((acc, t) => mul(acc, Array.from(t.values.subarray(f * 4, f * 4 + 4))), [0, 0, 0, 1]);
                qq = mul(qq, slerpId(inv(W), back));
                const lean = gait === 'rear' ? 0.1 : gait === 'gallop' ? 0.1 + 0.05 * Math.sin(ph - 0.6) : gait === 'trot' ? 0.03 : 0.02;
                qq = mul(qq, q(0, 1, 0, -0.05 * sway * Math.sin(ph)), q(0, 0, 1, 0.025 * sway * Math.sin(ph + 0.5)), q(1, 0, 0, lean));
                values.set(qq, f * 4);
            }
            const old = tracks.findIndex(t => t.bone === hipsIdx);
            if (old >= 0) tracks.splice(old, 1);
            tracks.push({ bone: hipsIdx, values });
            put(at.get('Spine1'), t => q(0, 1, 0, 0.03 * sway * Math.sin(TAU * t)));
            put(at.get('Head'), t => q(0, 1, 0, 0.03 * sway * Math.sin(TAU * t)));
        }
        // One track a bone (the last wins).
        const seen = new Set(), uniq = [];
        for (let i = tracks.length - 1; i >= 0; i--) { const k = tracks[i].bone + (tracks[i].path || ''); if (seen.has(k)) continue; seen.add(k); uniq.unshift(tracks[i]); }
        return { name: id, times, tracks: uniq, heights, once: !!(made && made.once), lift: tm => { const x = ((tm % period) + period) % period / period * (steps - 1), i = Math.floor(x), k = x - i; return heights[i] + (heights[Math.min(steps - 1, i + 1)] - heights[i]) * k; } };
    }
    function slerpId(qq, k) {
        // From the identity toward qq by k.
        const s = qq[3] < 0 ? -1 : 1, a = [qq[0] * s * k, qq[1] * s * k, qq[2] * s * k, 1 - k + qq[3] * s * k], l = Math.hypot(...a) || 1;
        return a.map(x => x / l);
    }

    /** The saved clips: Idle, Walk, Trot and Run, the gaits' rise and fall on the root. */
    function clips(bones, r, armAngle) {
        const out = [];
        const rootIdx = bones.findIndex(b => b.parent < 0);
        for (const g of GAITS) {
            const m = motion(bones, g.id, r, { armAngle });
            if (!m) continue;
            const clip = { name: g.name, times: m.times, tracks: m.tracks.slice() };
            if (g.gait) {
                const head = bones[rootIdx].head, values = new Float32Array(m.times.length * 3);
                for (let f = 0; f < m.times.length; f++) values.set([head[0], head[1] + m.heights[f], head[2]], f * 3);
                clip.tracks.push({ bone: rootIdx, values, path: 'translation' });
            }
            // A seamless loop: the last key is the first (a gait's smoothed rise and fall can end a hair off).
            const last = m.times.length - 1;
            clip.tracks = clip.tracks.map(t => { const w = t.path === 'translation' || t.path === 'scale' ? 3 : 4, values = Float32Array.from(t.values); values.copyWithin(last * w, 0, w); return Object.assign({}, t, { values }); });
            out.push(clip);
        }
        return out;
    }

    /** The builder's view: a pose's clip ('idle' or one of POSES). */
    function poseClip(bones, id, body, recipe, armAngle) {
        // A person's Run is the horse's gallop; a pose the legs would have to take (a kneel, a jump) is not a centaur's.
        const own = id === 'run' ? 'gallop' : id;
        if (own !== 'idle' && !POSES.some(p => p.id === own)) return null;
        const m = motion(bones, own, recipe, { bodySkin: body, armAngle });
        if (!m) return null;
        return Object.assign(m, { name: id });
    }

    /**
     * The humanoid game clips made a centaur's: the legs' and the hips'
     * moves left out (the horse stands), the upper body's kept.
     */
    function adaptClips(bones, list) {
        const hips = bones.findIndex(b => b.name === 'Hips');
        return list.map(c => Object.assign({}, c, { tracks: c.tracks.filter(t => !(t.path && t.bone === hips) && !LEG_BONES.test((bones[t.bone] || {}).name || '') && !(t.path && bones[t.bone] && bones[t.bone].parent < 0)) }));
    }

    // ── the builder's page ────────────────────────────────────────────────
    /** The Body tab's Centaur section, in the builder's own controls (`b`: the builder). */
    function panel(b) {
        return b._section('Centaur') + b._color('centaur.coat', 'Coat', COATS)
            + b._select('centaur.pattern', 'Pattern', PATTERNS)
            + (b.recipe.centaur && b.recipe.centaur.pattern !== 'solid' ? b._color('centaur.marking', 'Markings', ['#f0ebe2', '#1e1a18', '#8e8a86', '#c9a160']) : '')
            + b._color('centaur.tail', 'Mane and tail hair', ['#1e1a18', '#5a3420', '#c9a160', '#e0dad0'], true)
            + b._color('centaur.hoof', 'Hooves and claws', ['#3a3430', '#6a5a48', '#9a8a78'])
            + SLIDERS.map(s => b._slider({ path: 'centaur.' + s.key, label: s.label, natural: s.natural, extreme: s.extreme, format: s.format })).join('');
    }

    /** A random centaur's horse: a coat, maybe markings, its build. */
    function randomCentaur(rand) {
        const pick = list => list[Math.floor(rand() * list.length)];
        return normalize({
            coat: pick(COATS), marking: pick(['#f0ebe2', '#f0ebe2', '#1e1a18', '#c9a160']), pattern: pick(PATTERNS)[0],
            size: 0.74 + rand() * 0.16, bodyLength: 0.9 + rand() * 0.25, girth: 0.95 + rand() * 0.3, legLength: 1.2 + rand() * 0.25, legThickness: 0.85 + rand() * 0.3, tailLength: 0.85 + rand() * 0.35
        });
    }

    const api = { PATTERNS, SLIDERS, COATS, DEFAULTS, BLOCKED_SLOTS, BLOCKED_GARMENTS, GAITS, UPPER, POSES, normalize, normalizeRecipe, fitsGarment, fitsProp, cutOf, horseRecipe, build, horseRigOf, hasHorse, motion, clips, poseClip, adaptClips, panel, randomCentaur };
    root.RRCharacterCentaur = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
