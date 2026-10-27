/**
 * RRCharacterBodyArt - tattoos, body and war paint, scars and implant
 * lines painted into the skin; the recipe for piercings and cybernetic
 * mods (built by RRCharacterBodyMods); the shared cyber styles.
 *
 * Recipe (`recipe.bodyArt`):
 *   layers: [{ kind: 'tattoo'|'paint'|'scar'|'implant', motif, region, side,
 *     style, color, color2, size, rotate, around, along, band, text,
 *     picture, seed, amount }]   (painted in order, later over earlier)
 *   piercings: [{ spot, side, metal, style }]
 *   limbs: [{ limb, mode: 'replace'|'plate', style, color, color2, glow,
 *     glowAmount, wear }]
 *   eye: { side: 'none'|'left'|'right', style, glow }
 *   face: { studs, plate, style, glow }
 *
 * Placement is by the body's surface, measured once on the average body:
 * round a limb (its unrolled circumference and the distance along it, so a
 * band closes on itself and a motif on a forearm does not stretch), round
 * the trunk and head (the face and neck), or flat (chest, back, stomach,
 * shoulder, the back of the hand). Each texel of the skin picture asks the
 * layers what lies at its place; the picture's own seams never show in a
 * design. The detail pass lays the skin under the art out again at a finer
 * scale (RRCharacterModel cuts those triangles into a part of their own).
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Outfit = need('RRCharacterOutfit', './CharacterOutfit.js');
    const Motifs = need('RRCharacterBodyArtMotifs', './CharacterBodyArtMotifs.js');
    const Body = () => root.RRHumanBody || require('./HumanBody.js');
    const TAU = Math.PI * 2;
    const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const fract = x => x - Math.floor(x);
    const linear = hex => Outfit.linear(hex);
    const isHex = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
    function hash3(x, y, z) { return fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453); }
    function noise3(x, y, z) {
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
        const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
        let out = 0;
        for (let k = 0; k < 8; k++) {
            const dx = k & 1, dy = (k >> 1) & 1, dz = (k >> 2) & 1;
            out += hash3(ix + dx, iy + dy, iz + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        }
        return out;
    }

    // ── choices ───────────────────────────────────────────────────────────
    const KINDS = [['tattoo', 'Tattoo'], ['paint', 'Paint'], ['scar', 'Scar'], ['implant', 'Implant']];
    const STYLES = {
        tattoo: [['blackwork', 'Blackwork'], ['color', 'Color'], ['faded', 'Faded'], ['white', 'White ink'], ['glow', 'UV glow']],
        paint: [['matte', 'Matte'], ['cracked', 'Cracked'], ['glowing', 'Glowing']],
        scar: [['raised', 'Raised'], ['sunken', 'Sunken'], ['fresh', 'Fresh']],
        implant: [['glow', 'Glowing'], ['dim', 'Dim']]
    };
    /**
     * Where a layer goes. proj: 'limb' (round a limb, `fam` arm or leg,
     * along `s` between `s0` and `s1`), 'trunk' (round the trunk or head, at
     * a height), 'plane' (flat). `half`: the motif's half size in meters at
     * size 1. `ref`: the direction (person's left side) the layer faces.
     */
    const REGIONS = [
        { id: 'forearm', label: 'Forearm', proj: 'limb', fam: 'arm', s: 2.5, s0: 2.02, s1: 2.98, half: 0.055, ref: [0.35, 0.3, 0.9], sided: true },
        { id: 'upperArm', label: 'Upper arm', proj: 'limb', fam: 'arm', s: 1.5, s0: 1.08, s1: 1.96, half: 0.06, ref: [0.85, 0.15, 0.5], sided: true },
        { id: 'sleeve', label: 'Full sleeve', proj: 'limb', fam: 'arm', s: 2.0, s0: 1.1, s1: 2.96, half: 0.05, ref: [0.35, 0.3, 0.9], sided: true, sleeve: true },
        { id: 'shoulder', label: 'Shoulder', proj: 'plane', anchor: 'shoulder', half: 0.065, sided: true },
        { id: 'hand', label: 'Hand', proj: 'plane', anchor: 'hand', half: 0.032, sided: true },
        { id: 'chest', label: 'Chest', proj: 'plane', anchor: 'chest', half: 0.1, reach: [0.12, 0.08] },
        { id: 'belly', label: 'Stomach', proj: 'plane', anchor: 'belly', half: 0.085, reach: [0.1, 0.1] },
        { id: 'back', label: 'Back', proj: 'plane', anchor: 'back', half: 0.16, reach: [0.12, 0.2] },
        { id: 'ribs', label: 'Ribs', proj: 'trunk', anchor: 'ribs', half: 0.08, sided: true },
        { id: 'neck', label: 'Neck', proj: 'trunk', anchor: 'neck', half: 0.032, sided: true, around: true },
        { id: 'face', label: 'Face', proj: 'trunk', anchor: 'face', half: 0.05 },
        { id: 'thigh', label: 'Thigh', proj: 'limb', fam: 'leg', s: 0.5, s0: 0.12, s1: 0.92, half: 0.075, ref: [0.6, 0, 0.8], sided: true },
        { id: 'calf', label: 'Calf', proj: 'limb', fam: 'leg', s: 1.45, s0: 1.1, s1: 1.9, half: 0.06, ref: [0.75, 0, -0.65], sided: true },
        { id: 'legSleeve', label: 'Leg sleeve', proj: 'limb', fam: 'leg', s: 1.0, s0: 0.12, s1: 1.9, half: 0.06, ref: [0.6, 0, 0.8], sided: true, sleeve: true }
    ];
    const REGION_BY_ID = new Map(REGIONS.map(r => [r.id, r]));
    const SIDES = [['left', 'Left'], ['right', 'Right'], ['both', 'Both']];
    const CENTER_SIDES = [['center', 'Middle'], ['left', 'Left'], ['right', 'Right'], ['both', 'Both sides']];

    const PIERCING_SPOTS = [
        { id: 'lobe', label: 'Earlobe', style: 'ring', sided: true }, { id: 'helix', label: 'Helix', style: 'ring', sided: true },
        { id: 'industrial', label: 'Industrial', style: 'bar', sided: true }, { id: 'tragus', label: 'Tragus', style: 'stud', sided: true },
        { id: 'nostril', label: 'Nostril', style: 'stud', sided: true }, { id: 'septum', label: 'Septum', style: 'ring' },
        { id: 'eyebrow', label: 'Eyebrow', style: 'bar', sided: true }, { id: 'lip', label: 'Lip ring', style: 'ring', sided: true },
        { id: 'labret', label: 'Labret', style: 'stud' }, { id: 'bridge', label: 'Bridge', style: 'bar' }
    ];
    const PIERCING_STYLES = [['stud', 'Stud'], ['ring', 'Ring'], ['bar', 'Barbell'], ['spike', 'Spike']];
    const METALS = [
        { id: 'steel', label: 'Steel', color: '#c9ccd0', roughness: 0.22 }, { id: 'gold', label: 'Gold', color: '#e3b54f', roughness: 0.2 },
        { id: 'rose', label: 'Rose gold', color: '#d9917a', roughness: 0.22 }, { id: 'black', label: 'Black steel', color: '#2b2c30', roughness: 0.3 },
        { id: 'titanium', label: 'Anodized', color: '#5a63c9', roughness: 0.18 }, { id: 'bone', label: 'Bone', color: '#e6dcc3', roughness: 0.55, metalness: 0 }
    ];
    const LIMBS = [['armL', 'Left arm'], ['armR', 'Right arm'], ['forearmL', 'Left forearm'], ['forearmR', 'Right forearm'], ['handL', 'Left hand'], ['handR', 'Right hand'],
        ['legL', 'Left leg'], ['legR', 'Right leg'], ['shinL', 'Left lower leg'], ['shinR', 'Right lower leg']];
    const LIMB_MODES = [['replace', 'Replaced'], ['plate', 'Plated']];
    const EYE_STYLES = [['lens', 'Iris lens'], ['optic', 'Optic array'], ['scanner', 'Scanner']];
    const FACE_STUDS = [['none', 'None'], ['temple', 'Temple row'], ['brow', 'Brow line'], ['cheek', 'Cheekbone'], ['jaw', 'Jawline']];
    const FACE_PLATES = [['none', 'None'], ['temple', 'Temple plate'], ['cheek', 'Cheek plate'], ['jaw', 'Jaw plate']];

    /**
     * The four cybernetic styles, shared by cyber limbs, eyes, implants,
     * wings, tails, horns and ears (and any hardware that wants to match
     * them): base and trim colors, the joints' dark parts, the glow, and the
     * finish. `cyberMaterial(style, overrides)` turns one into linear colors
     * and part settings; `wearAt` gives scratches/grime for a point.
     */
    const CYBER_STYLES = [
        { id: 'sleek', label: 'Sleek prosthetic', base: '#e4e7ea', trim: '#a9b2bb', joint: '#2a2e35', glow: '#7cd8ff', metalness: 0.04, roughness: 0.36, trimMetalness: 0.85, trimRoughness: 0.22, glowAmount: 0.45, seam: 'soft' },
        { id: 'military', label: 'Military', base: '#4b5341', trim: '#3a3d3b', joint: '#18191a', glow: '#ff9a3a', metalness: 0.2, roughness: 0.72, trimMetalness: 0.8, trimRoughness: 0.45, glowAmount: 0.35, seam: 'bolts' },
        { id: 'salvaged', label: 'Salvaged', base: '#8a6d4c', trim: '#6a7179', joint: '#2a2621', glow: '#ffcf5a', metalness: 0.55, roughness: 0.72, trimMetalness: 0.75, trimRoughness: 0.55, glowAmount: 0.3, seam: 'patched' },
        { id: 'neon', label: 'Glowing high-tech', base: '#1b2030', trim: '#4a5672', joint: '#0c0e14', glow: '#38e6ff', metalness: 0.7, roughness: 0.24, trimMetalness: 0.9, trimRoughness: 0.18, glowAmount: 1, seam: 'light', translucent: true }
    ];
    const CYBER_BY_ID = new Map(CYBER_STYLES.map(s => [s.id, s]));
    function cyberMaterial(id, o = {}) {
        const s = CYBER_BY_ID.get(id) || CYBER_STYLES[0];
        const pick = (v, d) => linear(isHex(v) ? v : d);
        return {
            id: s.id, style: s, base: pick(o.color, s.base), trim: pick(o.color2, s.trim), joint: linear(s.joint), glow: pick(o.glow, s.glow),
            glowHex: isHex(o.glow) ? o.glow : s.glow, glowAmount: clamp(o.glowAmount ?? s.glowAmount, 0, 1), wear: clamp(+(o.wear ?? 0.3) || 0, 0, 1),
            metalness: s.metalness, roughness: s.roughness, trimMetalness: s.trimMetalness, trimRoughness: s.trimRoughness
        };
    }
    /** Wear at a point (meters): { scratch 0..1 (bright bare metal), grime 0..1 (dark), rust 0..1 } for a material's wear. */
    function wearAt(m, p, edge = 0) {
        const w = m.wear;
        if (w <= 0) return { scratch: 0, grime: 0, rust: 0 };
        const n1 = noise3(p[0] * 60, p[1] * 60, p[2] * 60), n2 = noise3(p[0] * 400 + 3, p[1] * 40, p[2] * 400);
        const scratch = smooth(0.78 - 0.25 * w, 0.95, n2) * w + edge * w * 0.6;
        const grime = smooth(0.5, 0.9, n1) * w * 0.7;
        const rust = m.id === 'salvaged' ? smooth(0.55, 0.85, noise3(p[0] * 25 + 9, p[1] * 25, p[2] * 25)) * w : 0;
        return { scratch: clamp(scratch, 0, 1), grime, rust };
    }

    // ── recipe ────────────────────────────────────────────────────────────
    const MAX_LAYERS = 16, MAX_PIERCINGS = 14, MAX_LIMBS = 4;
    const LAYER = { kind: 'tattoo', motif: 'tribal', region: 'forearm', side: 'left', style: 'blackwork', color: '', color2: '', size: 1, rotate: 0, around: 0, along: 0, band: false, text: '', picture: '', seed: 1, amount: 1 };
    function normalizeLayer(input) {
        const l = Object.assign({}, LAYER, input && typeof input === 'object' ? input : {});
        if (!KINDS.some(k => k[0] === l.kind)) l.kind = 'tattoo';
        const m = Motifs.BY_ID.get(l.motif);
        if (l.motif !== 'picture' && (!m || m.kind !== l.kind)) l.motif = (Motifs.MOTIFS.find(x => x.kind === l.kind) || {}).id || 'tribal';
        if (l.motif === 'picture' && l.kind !== 'tattoo' && l.kind !== 'paint') l.motif = (Motifs.MOTIFS.find(x => x.kind === l.kind) || {}).id;
        if (!REGION_BY_ID.has(l.region)) l.region = 'forearm';
        const reg = REGION_BY_ID.get(l.region);
        const sides = reg.sided ? SIDES : CENTER_SIDES;
        if (!sides.some(s => s[0] === l.side)) l.side = sides[0][0];
        if (!STYLES[l.kind].some(s => s[0] === l.style)) l.style = STYLES[l.kind][0][0];
        for (const k of ['color', 'color2']) if (!isHex(l[k])) l[k] = '';
        l.size = clamp(+l.size || 1, 0.2, 3);
        l.rotate = clamp(Math.round(+l.rotate || 0), -180, 180);
        l.around = clamp(+l.around || 0, -1, 1);
        l.along = clamp(+l.along || 0, -1, 1);
        l.band = !!l.band && !!(m && (m.band || m.sleeve)) && reg.proj !== 'plane';
        l.text = String(l.text || '').replace(/[^\x20-\x7e]/g, '').slice(0, 24);
        l.picture = typeof l.picture === 'string' && !/^(?:[a-z]+:|[\\/])/i.test(l.picture) && !l.picture.replace(/\\/g, '/').split('/').includes('..') ? l.picture.slice(0, 200) : '';
        l.seed = Math.max(1, Math.min(9999, Math.round(+l.seed || 1)));
        l.amount = clamp(+(l.amount ?? 1), 0, 1);
        return l;
    }
    function normalizeLimb(input) {
        const i = input && typeof input === 'object' ? input : {};
        return {
            limb: LIMBS.some(l => l[0] === i.limb) ? i.limb : 'armL', mode: i.mode === 'plate' ? 'plate' : 'replace',
            style: CYBER_BY_ID.has(i.style) ? i.style : 'sleek', color: isHex(i.color) ? i.color : '', color2: isHex(i.color2) ? i.color2 : '',
            glow: isHex(i.glow) ? i.glow : '', glowAmount: clamp(+(i.glowAmount ?? 0.6), 0, 1), wear: clamp(+(i.wear ?? 0.25), 0, 1)
        };
    }
    function normalize(input) {
        const a = input && typeof input === 'object' ? input : {};
        const layers = (Array.isArray(a.layers) ? a.layers : []).slice(0, MAX_LAYERS).map(normalizeLayer);
        const piercings = [], seen = new Set();
        for (const p of Array.isArray(a.piercings) ? a.piercings : []) {
            const spot = PIERCING_SPOTS.find(s => s.id === (p && p.spot));
            if (!spot) continue;
            const side = spot.sided ? (['left', 'right', 'both'].includes(p.side) ? p.side : 'left') : 'center';
            const key = spot.id + ':' + side;
            if (seen.has(key) || piercings.length >= MAX_PIERCINGS) continue;
            seen.add(key);
            piercings.push({ spot: spot.id, side, metal: METALS.some(m => m.id === p.metal) ? p.metal : 'steel', style: PIERCING_STYLES.some(s => s[0] === p.style) ? p.style : spot.style });
        }
        const limbs = [], taken = new Set();
        for (const l of (Array.isArray(a.limbs) ? a.limbs : []).map(normalizeLimb)) {
            // One mod per limb: a whole arm includes its forearm and hand.
            const chain = limbChain(l.limb);
            if (chain.some(c => taken.has(c)) || limbs.length >= MAX_LIMBS) continue;
            chain.forEach(c => taken.add(c));
            limbs.push(l);
        }
        const e = a.eye && typeof a.eye === 'object' ? a.eye : {};
        const eye = { side: ['left', 'right'].includes(e.side) ? e.side : 'none', style: EYE_STYLES.some(s => s[0] === e.style) ? e.style : 'lens', cyber: CYBER_BY_ID.has(e.cyber) ? e.cyber : 'sleek', glow: isHex(e.glow) ? e.glow : '' };
        const f = a.face && typeof a.face === 'object' ? a.face : {};
        const face = { studs: FACE_STUDS.some(s => s[0] === f.studs) ? f.studs : 'none', plate: FACE_PLATES.some(s => s[0] === f.plate) ? f.plate : 'none', side: f.side === 'right' ? 'right' : f.side === 'both' ? 'both' : 'left', style: CYBER_BY_ID.has(f.style) ? f.style : 'sleek', glow: isHex(f.glow) ? f.glow : '' };
        return { layers, piercings, limbs, eye, face };
    }
    /** The parts of a limb a mod takes (so an arm and its own hand are not both modded). */
    function limbChain(id) {
        const side = id.slice(-1), base = id.slice(0, -1);
        const arm = ['arm', 'forearm', 'hand'], leg = ['leg', 'shin'];
        const list = arm.includes(base) ? arm : leg;
        return list.slice(list.indexOf(base)).map(b => b + side);
    }
    function isEmpty(art) { return !art || (!art.layers.length && !art.piercings.length && !art.limbs.length && art.eye.side === 'none' && art.face.studs === 'none' && art.face.plate === 'none'); }

    // ── the body's surface ────────────────────────────────────────────────
    const FAMILIES = ['spine', 'armL', 'armR', 'legL', 'legR'];
    const NA = 72;
    /**
     * Measured once on the average body: for each limb, the distance along
     * it and its cross-section's unrolled circumference at each place along
     * it and angle round it; for the trunk the same by height. Plane anchors
     * for the chest, back, stomach, shoulders and hands.
     */
    function surface(pack) {
        if (pack._artSurface) return pack._artSurface;
        const an = Outfit.anatomy(pack), R = an.rest, B = Body();
        const N = B.vertexNormals(pack, R);
        const ids = pack._bodyIds || (pack._bodyIds = [...new Set(pack.body.source)]);
        const ears = B.earMask ? B.earMask(pack) : null;
        const famOf = v => { let best = 0; for (let fi = 1; fi < 5; fi++) if (an.member[v * 5 + fi] > an.member[v * 5 + best]) best = fi; return best; };
        const fam = new Uint8Array(pack.vertexCount);
        for (const v of ids) fam[v] = famOf(v);
        const chains = FAMILIES.map(f => an.chains[f]);
        // Lengths along each limb's chain.
        const limbs = [null];
        for (let f = 1; f < 5; f++) {
            const P = chains[f], seg = [];
            for (let i = 0; i + 1 < P.length; i++) seg.push(Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1], P[i + 1][2] - P[i][2]));
            limbs.push({ P, seg });
        }
        const alongLen = (f, s) => {
            const seg = limbs[f].seg;
            if (s <= 0) return s * seg[0];
            let L = 0, i = 0;
            for (; i < seg.length && s >= i + 1; i++) L += seg[i];
            return i < seg.length ? L + (s - i) * seg[i] : L + (s - seg.length) * seg[seg.length - 1];
        };
        const axisAt = (f, s) => {
            const P = chains[f], i = clamp(Math.floor(s), 0, P.length - 2), t = s - i;
            return [P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t, P[i][2] + (P[i + 1][2] - P[i][2]) * t];
        };
        const spine = chains[0];
        const spineAxis = y => {
            if (y <= spine[0][1]) return spine[0];
            for (let i = 0; i + 1 < spine.length; i++) if (y <= spine[i + 1][1]) { const t = (y - spine[i][1]) / (spine[i + 1][1] - spine[i][1]); return [spine[i][0] + (spine[i + 1][0] - spine[i][0]) * t, y, spine[i][2] + (spine[i + 1][2] - spine[i][2]) * t]; }
            return spine[spine.length - 1];
        };
        // Cross-sections: mean distance from the axis per (place along, angle) bin, gaps filled, then smoothed.
        let ymin = Infinity, ymax = -Infinity;
        for (const v of ids) { ymin = Math.min(ymin, R[v * 3 + 1]); ymax = Math.max(ymax, R[v * 3 + 1]); }
        const tables = [];
        for (let f = 0; f < 5; f++) {
            const lo = f === 0 ? ymin : -0.6, hi = f === 0 ? ymax : 4.6, step = f === 0 ? 0.01 : 0.05;
            const NS = Math.ceil((hi - lo) / step) + 1, sum = new Float32Array(NS * NA), cnt = new Float32Array(NS * NA);
            for (const v of ids) {
                if (fam[v] !== f || (ears && ears[v] > 0.3)) continue;
                const x = R[v * 3], y = R[v * 3 + 1], z = R[v * 3 + 2];
                let s, d;
                if (f === 0) { s = y; const a = spineAxis(y); d = Math.hypot(x - a[0], z - a[2]); }
                else { s = an.s[v * 5 + f]; const a = axisAt(f, s); d = Math.hypot(x - a[0], y - a[1], z - a[2]); }
                const sb = Math.round((s - lo) / step), ab = Math.floor((an.angle[v * 5 + f] + Math.PI) / TAU * NA) % NA;
                if (sb < 0 || sb >= NS) continue;
                sum[sb * NA + ab] += d; cnt[sb * NA + ab]++;
            }
            const r = new Float32Array(NS * NA);
            const rowHas = new Uint8Array(NS);
            for (let i = 0; i < NS; i++) {
                const row = i * NA, have = [];
                for (let k = 0; k < NA; k++) if (cnt[row + k]) { r[row + k] = sum[row + k] / cnt[row + k]; have.push(k); }
                if (!have.length) continue;
                rowHas[i] = 1;
                for (let k = 0; k < NA; k++) {
                    if (cnt[row + k]) continue;
                    // Between the nearest measured angles either side.
                    let a = -1, b = -1;
                    for (let q = 1; q < NA && (a < 0 || b < 0); q++) { if (a < 0 && cnt[row + (k - q + NA) % NA]) a = q; if (b < 0 && cnt[row + (k + q) % NA]) b = q; }
                    r[row + k] = (r[row + (k - a + NA) % NA] * b + r[row + (k + b) % NA] * a) / (a + b);
                }
            }
            for (let i = 0; i < NS; i++) if (!rowHas[i]) {
                let a = i, b = i;
                while (a >= 0 && !rowHas[a]) a--;
                while (b < NS && !rowHas[b]) b++;
                const src = a >= 0 && (b >= NS || i - a <= b - i) ? a : b < NS ? b : -1;
                if (src >= 0) r.copyWithin(i * NA, src * NA, src * NA + NA); else r.fill(0.05, i * NA, i * NA + NA);
            }
            // Smooth round (a nose or a knuckle should not kink a design) and along.
            const blur = new Float32Array(r.length);
            for (let i = 0; i < NS; i++) for (let k = 0; k < NA; k++) {
                let acc = 0, w = 0;
                for (let di = -1; di <= 1; di++) for (let dk = -3; dk <= 3; dk++) {
                    const ii = clamp(i + di, 0, NS - 1), kk = (k + dk + NA) % NA, ww = (di ? 0.5 : 1) * (1 - Math.abs(dk) / 4);
                    acc += r[ii * NA + kk] * ww; w += ww;
                }
                blur[i * NA + k] = acc / w;
            }
            // Arc length from the front (angle 0) round each way, and the whole round.
            const arc = new Float32Array(NS * (NA + 1)), circ = new Float32Array(NS);
            const dA = TAU / NA;
            for (let i = 0; i < NS; i++) {
                const row = i * NA, at = k => blur[row + ((k % NA) + NA) % NA];
                const seg = k => { const r0 = at(k), r1 = at(k + 1); return Math.sqrt(((r0 + r1) / 2) ** 2 * dA * dA + (r1 - r0) ** 2); };
                // Bin k spans angle -π + k dA; arc[k] is the arc at that bin's start, zero at angle 0 (bin NA/2).
                const out = arc.subarray(i * (NA + 1), i * (NA + 1) + NA + 1);
                out[NA / 2] = 0;
                for (let k = NA / 2; k < NA; k++) out[k + 1] = out[k] + seg(k);
                for (let k = NA / 2 - 1; k >= 0; k--) out[k] = out[k + 1] - seg(k);
                circ[i] = out[NA] - out[0];
            }
            tables.push({ lo, step, NS, arc, circ, r: blur });
        }
        const S = { an, N, fam, chains, limbs, alongLen, axisAt, spineAxis, tables, ymin, ymax };
        S.anchors = anchors(pack, S);
        return (pack._artSurface = S);
    }

    /** Unrolled arc (meters from the front) and circumference at a place (`s` along a limb, or a height on the trunk) and angle. */
    function arcAt(S, f, s, ang) {
        const T = S.tables[f], x = clamp((s - T.lo) / T.step, 0, T.NS - 1.001), i = Math.floor(x), u = x - i;
        let a = (ang + Math.PI) / TAU * NA;
        a = clamp(a, 0, NA - 1e-6);
        const k = Math.floor(a), w = a - k, row0 = i * (NA + 1), row1 = (i + 1) * (NA + 1);
        const v0 = T.arc[row0 + k] + (T.arc[row0 + k + 1] - T.arc[row0 + k]) * w, v1 = T.arc[row1 + k] + (T.arc[row1 + k + 1] - T.arc[row1 + k]) * w;
        arcAt.circ = T.circ[i] + (T.circ[i + 1] - T.circ[i]) * u;
        return v0 + (v1 - v0) * u;
    }

    /** The average body's points the flat regions and the trunk regions start from. */
    function anchors(pack, S) {
        const an = S.an, R = an.rest, N = S.N, ids = pack._bodyIds;
        const B = Body(), AF = B.anatomyFields(pack);
        const at = v => [R[v * 3], R[v * 3 + 1], R[v * 3 + 2]];
        const nip = AF.nipples.map(n => at(n.v)), navel = at(AF.navel);
        const spine = S.chains[0];
        const frontAt = (y, x = 0) => { let best = null; for (const v of ids) { if (S.fam[v] || Math.abs(R[v * 3 + 1] - y) > 0.012 || Math.abs(R[v * 3] - x) > 0.015) continue; if (!best || R[v * 3 + 2] > best[2]) best = at(v); } return best || [x, y, 0.1]; };
        const backAt = (y, x = 0) => { let best = null; for (const v of ids) { if (S.fam[v] || Math.abs(R[v * 3 + 1] - y) > 0.012 || Math.abs(R[v * 3] - x) > 0.015) continue; if (!best || R[v * 3 + 2] < best[2]) best = at(v); } return best || [x, y, -0.1]; };
        const chestY = (nip[0][1] + spine[4][1]) / 2 - 0.01;
        const out = {
            chest: { o: frontAt(chestY), n: [0, 0, 1], up: [0, 1, 0], side: 0.11 },
            belly: { o: frontAt(navel[1] + 0.035), n: [0, 0, 1], up: [0, 1, 0], side: 0.07 },
            back: { o: backAt((spine[3][1] + spine[4][1]) / 2), n: [0, 0, -1], up: [0, 1, 0], side: 0.11 },
            ribsY: (nip[0][1] + navel[1]) / 2 + 0.02, neckY: spine[4][1] + (spine[5][1] - spine[4][1]) * 0.35,
            nip, navel
        };
        // The face: the eyes' height (from the eye helper), its front.
        const eyes = pack.eyes ? [...new Set(pack.eyes.refs)] : [];
        let ey = 0, en = 0;
        for (const v of eyes) { ey += R[v * 3 + 1]; en++; }
        out.faceY = en ? ey / en - 0.02 : spine[5][1] + 0.06;
        // The shoulder's cap and the back of the hand, each side: the place facing most the way given, its normal.
        for (const [f, sgn] of [[1, 1], [2, -1]]) {
            const key = sgn > 0 ? 'L' : 'R';
            const best = (s0, s1, dir) => {
                let b = -1, bd = -Infinity;
                for (const v of ids) {
                    if (S.fam[v] !== f) continue;
                    const s = an.s[v * 5 + f];
                    if (s < s0 || s > s1) continue;
                    const d = N[v * 3] * dir[0] + N[v * 3 + 1] * dir[1] + N[v * 3 + 2] * dir[2];
                    if (d > bd) { bd = d; b = v; }
                }
                return b;
            };
            const sv = best(0.95, 1.25, norm([sgn * 0.8, 0.6, 0.05]));
            // The cap's own facing: the mean normal of the skin round that place.
            let sn = [0, 0, 0];
            for (const v of ids) { if (S.fam[v] !== f) continue; const d = Math.hypot(R[v * 3] - R[sv * 3], R[v * 3 + 1] - R[sv * 3 + 1], R[v * 3 + 2] - R[sv * 3 + 2]); if (d < 0.05) sn = add(sn, mul([N[v * 3], N[v * 3 + 1], N[v * 3 + 2]], 1 - d / 0.05)); }
            sn = norm(len3(sn) > 0 ? sn : [sgn * 0.8, 0.55, 0.1]);
            out['shoulder' + key] = { o: at(sv), n: sn, up: norm(sub([-sgn * 0.35, 1, 0], mul(sn, dot([-sgn * 0.35, 1, 0], sn)))), side: 0 };
            // The back of the hand faces up in the rest pose (the palms face down).
            const hv = best(3.15, 3.45, [0, 1, 0]);
            let hn = [0, 0, 0], cnt = 0;
            for (const v of ids) { if (S.fam[v] !== f) continue; const s = an.s[v * 5 + f]; if (s < 3.1 || s > 3.5 || N[v * 3 + 1] < 0.4) continue; hn = add(hn, [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]]); cnt++; }
            hn = norm(cnt ? hn : [0, 1, 0]);
            const toFingers = norm(sub(S.chains[f][4], S.chains[f][3]));
            const up = norm(sub(mul(toFingers, -1), mul(hn, dot(mul(toFingers, -1), hn))));
            out['hand' + key] = { o: at(hv), n: hn, up, side: 0 };
        }
        return out;
    }
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const len3 = a => Math.hypot(a[0], a[1], a[2]);

    /** The angle round a limb (family `f`) whose skin faces most the way `dir` at `s`. */
    function angleFacing(pack, S, f, s, dir) {
        const an = S.an, N = S.N;
        let best = 0, bd = -Infinity;
        for (const v of pack._bodyIds) {
            if (S.fam[v] !== f || Math.abs(an.s[v * 5 + f] - s) > 0.08) continue;
            const d = N[v * 3] * dir[0] + N[v * 3 + 1] * dir[1] + N[v * 3 + 2] * dir[2];
            if (d > bd) { bd = d; best = an.angle[v * 5 + f]; }
        }
        return best;
    }
    /**
     * Which way a design reads round a limb: +1 when the angle growing
     * moves to the viewer's right as they face that skin (from outside,
     * with the design's up toward the limb's root), -1 when it moves left.
     */
    function handed(pack, S, f, s, ang) {
        const an = S.an, R = an.rest, N = S.N;
        let v0 = -1, bd = Infinity;
        for (const v of pack._bodyIds) {
            if (S.fam[v] !== f) continue;
            const d = Math.abs(an.s[v * 5 + f] - s) + Math.abs(Math.atan2(Math.sin(an.angle[v * 5 + f] - ang), Math.cos(an.angle[v * 5 + f] - ang))) * 0.2;
            if (d < bd) { bd = d; v0 = v; }
        }
        if (v0 < 0) return 1;
        const n = [N[v0 * 3], N[v0 * 3 + 1], N[v0 * 3 + 2]];
        const up = norm(sub(S.axisAt(f, s - 0.2), S.axisAt(f, s + 0.2)));
        const right = cross(up, n);
        // Round the limb: the tangent toward growing angle, by its neighbor in angle.
        const a1 = ang + 0.15, p0 = [R[v0 * 3], R[v0 * 3 + 1], R[v0 * 3 + 2]];
        let v1 = -1; bd = Infinity;
        for (const v of pack._bodyIds) {
            if (S.fam[v] !== f) continue;
            const d = Math.abs(an.s[v * 5 + f] - an.s[v0 * 5 + f]) + Math.abs(Math.atan2(Math.sin(an.angle[v * 5 + f] - a1), Math.cos(an.angle[v * 5 + f] - a1))) * 0.2;
            if (d < bd) { bd = d; v1 = v; }
        }
        const t = sub([R[v1 * 3], R[v1 * 3 + 1], R[v1 * 3 + 2]], p0);
        return dot(t, right) >= 0 ? 1 : -1;
    }

    // ── layers prepared for painting ──────────────────────────────────────
    /**
     * The layers as instances on the body (a layer on both sides is two),
     * each with its projection, its compiled motif and its colors. `pictures`:
     * Map(name -> { width, height, data }) of project pictures. `texel` is the
     * finest skin texel the painting will use (meters), for soft edges.
     */
    function prepare(pack, layers, pictures, o = {}) {
        const S = surface(pack), out = [];
        let relief = false, glow = false;
        for (const raw of layers || []) {
            const l = normalizeLayer(raw);
            if (l.amount <= 0) continue;
            if (l.motif === 'picture' && !(l.picture && pictures && pictures.get && pictures.get(l.picture))) continue;
            const reg = REGION_BY_ID.get(l.region), m = Motifs.BY_ID.get(l.motif);
            const sides = l.side === 'both' ? (reg.sided ? ['left', 'right'] : ['left', 'right']) : [l.side];
            for (const side of sides) {
                const inst = instance(pack, S, l, reg, m, side, l.side === 'both', pictures);
                if (!inst) continue;
                out.push(inst);
                if (l.kind === 'scar' || l.kind === 'implant' || (l.kind === 'paint' && l.style === 'cracked')) relief = true;
                if ((l.kind === 'tattoo' && l.style === 'glow') || (l.kind === 'paint' && l.style === 'glowing') || (l.kind === 'implant' && (l.motif === 'lines' || l.motif === 'ports'))) glow = true;
            }
        }
        return { list: out, relief, glow, surface: S, ev: { w: new Float32Array(5) } };
    }

    function instance(pack, S, l, reg, m, side, pair, pictures) {
        const sgn = side === 'right' ? -1 : side === 'left' ? 1 : 0;
        const unit = reg.half * l.size;
        const mirror = pair && sgn < 0 && !(m && m.text);
        const rot = l.rotate * Math.PI / 180 * (mirror ? -1 : 1);
        const inst = { layer: l, kind: l.kind, style: l.style, unit, cos: Math.cos(-rot), sin: Math.sin(-rot), mirror, amount: l.amount, proj: reg.proj };
        const aspect = m ? m.aspect : [1, 1];
        if (l.motif === 'picture') {
            const pic = pictures.get(l.picture), k = Math.max(pic.width, pic.height);
            inst.picture = pic; inst.box = [pic.width / k, pic.height / k];
        } else inst.box = aspect;
        // Colors (linear): the line ink, the two fills (the motif's own unless chosen), shading.
        const pal = (m && m.palette) || ['#141414', '#141414'];
        const def = { tattoo: '#121316', paint: pal[0], scar: '', implant: pal[0] }[l.kind];
        inst.line = linear(l.color || def || '#121316');
        inst.fillA = linear((l.kind === 'paint' ? l.color || l.color2 : l.color2) || pal[0]);
        inst.fillB = linear(pal[1]);
        inst.scarTint = l.color ? linear(l.color) : null;
        if (reg.proj === 'limb') {
            const f = reg.fam === 'arm' ? (sgn < 0 ? 2 : 1) : (sgn < 0 ? 4 : 3);
            const s = reg.s + l.along * (reg.s1 - reg.s0) * 0.5;
            const dir = [reg.ref[0] * (sgn || 1), reg.ref[1], reg.ref[2]];
            let ang = angleFacing(pack, S, f, s, norm(dir)) + l.around * Math.PI * (sgn < 0 ? -1 : 1);
            ang = Math.atan2(Math.sin(ang), Math.cos(ang));
            Object.assign(inst, { f, s, ang, v0: S.alongLen(f, s), hand: handed(pack, S, f, s, ang), aNorm: arcAt(S, f, s, ang) / arcAt.circ, C: arcAt.circ });
            inst.len = [S.alongLen(f, reg.s0), S.alongLen(f, reg.s1)];
            if (reg.sleeve || l.band) {
                // Round the limb: a band (or a whole sleeve) closing on itself.
                const mode = reg.sleeve ? 'sleeve' : 'band', Pfull = inst.C / unit, H = Math.abs(inst.len[1] - inst.len[0]) / unit;
                const natural = 2.2, n = Math.max(1, Math.round(Pfull / natural)), P = mode === 'sleeve' && m && m.coil ? Pfull : Pfull / n;
                inst.wrap = { mode, P, H, Pfull };
                if (mode === 'sleeve') inst.v0 = (inst.len[0] + inst.len[1]) / 2;
                inst.M = Motifs.motif(l.motif, { mode, P, H }, l.seed, l.text, 0.08);
            }
        } else if (reg.proj === 'trunk') {
            const A = S.anchors;
            let y = reg.anchor === 'face' ? A.faceY : reg.anchor === 'neck' ? A.neckY : A.ribsY;
            y += l.along * (reg.anchor === 'face' ? 0.07 : reg.anchor === 'neck' ? 0.035 : 0.1);
            let ang = reg.anchor === 'ribs' ? Math.PI / 2 * (sgn || 1) : reg.anchor === 'neck' ? (sgn ? sgn * Math.PI / 2 : 0) : sgn * 0.42;
            ang += l.around * Math.PI;
            ang = Math.atan2(Math.sin(ang), Math.cos(ang));
            Object.assign(inst, { f: 0, s: y, ang, v0: y, hand: 1, aNorm: arcAt(S, 0, y, ang) / arcAt.circ, C: arcAt.circ });
            if (l.band && reg.anchor === 'neck') {
                const Pfull = inst.C / unit, n = Math.max(1, Math.round(Pfull / 2.2));
                inst.wrap = { mode: 'band', P: Pfull / n, H: 2, Pfull };
                inst.M = Motifs.motif(l.motif, { mode: 'band', P: Pfull / n }, l.seed, l.text, 0.08);
            }
        } else {
            const A = S.anchors, an = reg.anchor;
            const base = an === 'shoulder' || an === 'hand' ? A[an + (sgn < 0 ? 'R' : 'L')] : A[an];
            const n = base.n, up = base.up, right = cross(up, n);
            const reach = reg.reach || [0.05, 0.05];
            // Off the middle toward the person's own side; Around moves toward the viewer's right (mirrored on the right side).
            const o = add(add(base.o, [sgn * (base.side || 0), 0, 0]), add(mul(right, l.around * reach[0] * (sgn < 0 ? -1 : 1)), mul(up, l.along * reach[1])));
            Object.assign(inst, { o, n, up, right, depth: an === 'hand' ? 0.035 : an === 'shoulder' ? 0.07 : 0.14 });
        }
        if (!inst.M && l.motif !== 'picture') inst.M = Motifs.motif(l.motif, { mode: 'emblem' }, l.seed, l.text, 0.08);
        // How far round the motif reaches (meters), for a quick test before evaluating it.
        const ext = inst.wrap ? null : Math.hypot(inst.box[0], inst.box[1]) * unit * 1.08 + 0.004;
        inst.reach = ext;
        return inst;
    }

    /**
     * Where a texel falls in an instance's motif: [x, y] in motif units, or
     * null when the instance does not reach it. `p`: { rest, n, fam, s, ang }.
     */
    function locate(inst, p, out) {
        if (inst.proj === 'plane') {
            const d = [p.rest[0] - inst.o[0], p.rest[1] - inst.o[1], p.rest[2] - inst.o[2]];
            const depth = dot(d, inst.n);
            if (depth < -inst.depth || depth > 0.06) return null;
            const facing = p.n[0] * inst.n[0] + p.n[1] * inst.n[1] + p.n[2] * inst.n[2];
            if (facing < -0.05) return null;
            const du = dot(d, inst.right), dv = dot(d, inst.up);
            if (Math.abs(du) > inst.reach || Math.abs(dv) > inst.reach) return null;
            // Flat regions fade where the skin turns away from them, before the projection smears.
            out.fade = smooth(0.15, 0.45, facing);
            return toMotif(inst, du, dv, out);
        }
        if (p.fam !== inst.f) return null;
        const S = inst.surfaceRef;
        let v, a, C;
        if (inst.f === 0) { v = p.rest[1]; if (Math.abs(v - inst.v0) > (inst.wrap ? inst.unit * 1.3 : inst.reach)) return null; a = arcAt(S, 0, v, p.ang); C = arcAt.circ; }
        else {
            v = S.alongLen(inst.f, p.s);
            if (inst.wrap ? (v < Math.min(inst.len[0], inst.len[1]) - 0.03 || v > Math.max(inst.len[0], inst.len[1]) + 0.03) : Math.abs(v - inst.v0) > inst.reach) return null;
            a = arcAt(S, inst.f, p.s, p.ang); C = arcAt.circ;
        }
        // Up toward the limb's root (the head on the trunk).
        const dv = inst.f === 0 ? v - inst.v0 : inst.v0 - v;
        let da = a / C - inst.aNorm;
        da -= Math.round(da);
        out.fade = 1;
        if (inst.wrap) {
            let x = da * inst.hand * inst.wrap.Pfull;
            if (inst.wrap.mode === 'sleeve') {
                // The sleeve's ends: a soft edge a centimeter long.
                const lo = Math.min(inst.len[0], inst.len[1]), hi = Math.max(inst.len[0], inst.len[1]);
                out.fade = smooth(lo - 0.004, lo + 0.012, v) * (1 - smooth(hi - 0.012, hi + 0.004, v));
            }
            x = ((x % inst.wrap.Pfull) + inst.wrap.Pfull) % inst.wrap.Pfull;
            out.x = x; out.y = dv / inst.unit;
            return out;
        }
        const du = da * C * inst.hand;
        if (Math.abs(du) > inst.reach) return null;
        return toMotif(inst, du, dv, out);
    }
    function toMotif(inst, du, dv, out) {
        let x = du / inst.unit, y = dv / inst.unit;
        const rx = x * inst.cos - y * inst.sin, ry = x * inst.sin + y * inst.cos;
        out.x = inst.mirror ? -rx : rx; out.y = ry;
        return out;
    }

    function samplePicture(pic, x, y, box, out) {
        // The picture fits its box (-w..w, -h..h); outside it nothing.
        const u = (x / box[0] + 1) / 2, v = (1 - y / box[1]) / 2;
        if (u < 0 || v < 0 || u > 1 || v > 1) { out[3] = 0; return out; }
        const fx = u * pic.width - 0.5, fy = v * pic.height - 0.5, x0 = clamp(Math.floor(fx), 0, pic.width - 1), y0 = clamp(Math.floor(fy), 0, pic.height - 1);
        const x1 = Math.min(pic.width - 1, x0 + 1), y1 = Math.min(pic.height - 1, y0 + 1), tx = clamp(fx - x0, 0, 1), ty = clamp(fy - y0, 0, 1);
        for (let c = 0; c < 4; c++) {
            const a = pic.data[(y0 * pic.width + x0) * 4 + c], b = pic.data[(y0 * pic.width + x1) * 4 + c], d = pic.data[(y1 * pic.width + x0) * 4 + c], e = pic.data[(y1 * pic.width + x1) * 4 + c];
            out[c] = ((a * (1 - tx) + b * tx) * (1 - ty) + (d * (1 - tx) + e * tx) * ty) / 255;
        }
        return out;
    }

    const srgbToLin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    /** Ink in the skin: it filters the light the skin gives back (so deep skin keeps ink dark and colors muted). */
    const inked = (skin, ink) => [skin[0] * Math.min(1, ink[0] * 1.35 + 0.025), skin[1] * Math.min(1, ink[1] * 1.35 + 0.025), skin[2] * Math.min(1, ink[2] * 1.35 + 0.025)];

    /**
     * A texel's skin with the art over it. `rgb` linear skin; `p` the
     * texel's place ({ rest, n, fam, s, ang, texel (meters) }). Writes
     * `res.height` (meters, raised +) and `res.glow` (linear light) and
     * returns the new color.
     */
    function shade(art, rgb, p, res) {
        res.height = 0; res.glow[0] = res.glow[1] = res.glow[2] = 0;
        const loc = art.loc || (art.loc = { x: 0, y: 0, fade: 1 }), ev = art.ev, px = art.px || (art.px = [0, 0, 0, 0]);
        const [X, Y, Z] = p.rest;
        // The skin's own grain: ink and paint lie in it, not on a flat sheet.
        const grain = noise3(X * 2600, Y * 2600, Z * 2600), mottle = noise3(X * 300 + 7, Y * 300, Z * 300);
        for (const inst of art.list) {
            inst.surfaceRef = art.surface;
            if (!locate(inst, p, loc)) continue;
            const fade = loc.fade * inst.amount;
            if (fade <= 0) continue;
            const style = inst.style, kind = inst.kind;
            // Soft edges: a texel wide, wider for ink spread in old skin.
            const bleed = kind === 'tattoo' ? (style === 'faded' ? 0.0011 : 0.00028) : kind === 'paint' ? 0.0002 : inst.layer.motif === 'burn' ? 0.0045 : 0.0004;
            const aa = (p.texel * 1.15 + bleed) / inst.unit;
            // Ink edges wander a little (the needle and the skin), not machine-straight.
            const jx = (noise3(X * 900, Y * 900, Z * 900) - 0.5) * 0.00035 / inst.unit, jy = (noise3(X * 900 + 5, Y * 900, Z * 900) - 0.5) * 0.00035 / inst.unit;
            if (inst.picture) {
                samplePicture(inst.picture, loc.x + jx, loc.y + jy, inst.box, px);
                const a = px[3] * fade;
                if (a <= 0.002) continue;
                const col = [srgbToLin(px[0]), srgbToLin(px[1]), srgbToLin(px[2])];
                if (kind === 'paint') { rgb = mix(rgb, col, a * 0.92); continue; }
                const lum = col[0] * 0.3 + col[1] * 0.55 + col[2] * 0.15;
                if (style === 'blackwork' || style === 'faded') {
                    const ink = style === 'faded' ? [0.07, 0.1, 0.11] : [0.012, 0.015, 0.02];
                    rgb = mix(rgb, inked(rgb, ink), a * clamp(1 - lum * 1.15, 0, 1) * (style === 'faded' ? 0.7 : 1) * (1 - 0.12 * grain));
                } else if (style === 'white') rgb = mix(rgb, mix(rgb, [0.8, 0.78, 0.74], 0.75), a * lum * 0.8);
                else if (style === 'glow') { rgb = mix(rgb, mix(rgb, col, 0.15), a * 0.5); for (let c = 0; c < 3; c++) res.glow[c] += col[c] * a * 1.2; }
                else rgb = mix(rgb, inked(rgb, col), a * (1 - 0.1 * grain));
                continue;
            }
            Motifs.evaluate(inst.M, loc.x + jx, loc.y + jy, aa, ev);
            if (ev.alpha <= 0) continue;
            const w = ev.w;
            if (kind === 'tattoo') rgb = tattoo(inst, rgb, w, fade, grain, p, res, ev);
            else if (kind === 'paint') rgb = paint(inst, rgb, w, ev.alpha * fade, grain, mottle, p, res);
            else if (kind === 'scar') rgb = scar(inst, rgb, w, ev, fade, grain, mottle, p, res);
            else rgb = implant(inst, rgb, w, ev, fade, p, res);
        }
        return rgb;
    }

    function stipple(p, density) {
        // Dotwork: a fine hashed dot grid in the skin's own space (about 0.5 mm).
        const k = 1700, x = p.rest[0] * k, y = p.rest[1] * k, z = p.rest[2] * k;
        const h = hash3(Math.floor(x), Math.floor(y), Math.floor(z));
        return h < density ? 1 : density * 0.25;
    }
    function tattoo(inst, rgb, w, fade, grain, p, res, ev) {
        const style = inst.style, sat = 1 - 0.07 * grain * grain;
        if (style === 'white') {
            const a = (w[0] + w[1] * 0.8 + w[2] * 0.6 + w[3] * 0.4 + w[4]) * fade * sat;
            return mix(rgb, mix(rgb, [0.82, 0.8, 0.75], 0.7), a * 0.85);
        }
        let ink = inst.line, A = inst.fillA, B = inst.fillB, glow = style === 'glow';
        if (style === 'faded') {
            const old = c => mix(c, [0.09, 0.15, 0.17], 0.55);
            ink = old(ink); A = old(A); B = old(B);
        }
        const black = style === 'blackwork' || style === 'faded';
        let out = rgb;
        // Shading under all: stippled in blackwork, a soft wash of the line ink in color.
        if (w[3] > 0) {
            const d = w[3] * fade;
            out = black ? mix(out, inked(out, ink), stipple(p, d) * Math.min(1, d * 1.6) * sat * 0.85 + d * 0.25) : mix(out, inked(out, mix(ink, A, 0.4)), d * 0.75 * sat);
        }
        if (black) {
            // Fills in black and grey: the motif's own fills shaded rather than colored.
            const grey = (w[1] * 0.55 + w[2] * 0.3) * fade;
            if (grey > 0) out = mix(out, inked(out, ink), (stipple(p, grey) * 0.5 + grey * 0.5) * sat);
            out = mix(out, inked(out, ink), w[0] * fade * sat * (style === 'faded' ? 0.75 : 1));
            if (w[4] > 0) out = mix(out, mix(out, [0.8, 0.79, 0.75], 0.5), w[4] * fade * 0.6);
            return out;
        }
        if (glow) {
            // UV ink: faint by day, light of its own in the glow color.
            // By day a faint tint of the ink (it barely shows on skin); its light is the ink's own color.
            const a = (w[0] + w[1] * 0.7 + w[2] * 0.5 + w[3] * 0.3) * fade, g = inst.layer.color ? inst.line : A;
            out = mix(out, inked(out, mix([1, 1, 1], g, 0.35)), a * 0.5);
            for (let c = 0; c < 3; c++) res.glow[c] += g[c] * (w[0] + w[1] * 0.75 + w[2] * 0.5 + w[3] * 0.25) * fade * 0.8;
            return out;
        }
        // Color: fills in their own inks, then the line work over them.
        if (w[1] > 0) out = mix(out, inked(out, A), w[1] * fade * sat);
        if (w[2] > 0) out = mix(out, inked(out, B), w[2] * fade * sat);
        if (w[4] > 0) out = mix(out, mix(out, [0.84, 0.83, 0.79], 0.8), w[4] * fade * 0.8);
        out = mix(out, inked(out, ink), w[0] * fade * sat);
        return out;
    }
    function paint(inst, rgb, w, a, grain, mottle, p, res) {
        // Pigment on the skin: mostly opaque, thinning where the brush ran dry, the skin's grain through it.
        const dry = smooth(0.15, 0.55, mottle * 0.8 + a * 0.5);
        let cov = a * (0.86 + 0.14 * dry) * (1 - 0.18 * grain * grain);
        const col = mix(mix(inst.fillA, inst.line, w[0] / Math.max(1e-6, w[0] + w[1] + w[2] + w[4])), [0.8, 0.79, 0.75], w[4]);
        if (inst.style === 'cracked') {
            // Dried and cracked: fine fissures through it, the skin showing in them, the flakes a little raised.
            const k = 260, cx = p.rest[0] * k, cy = p.rest[1] * k, cz = p.rest[2] * k;
            let d1 = 9, d2 = 9;
            const ix = Math.floor(cx), iy = Math.floor(cy), iz = Math.floor(cz);
            for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let q = -1; q <= 1; q++) {
                const hx = ix + i + hash3(ix + i, iy + j, iz + q), hy = iy + j + hash3(iy + j, iz + q, ix + i), hz = iz + q + hash3(iz + q, ix + i, iy + j);
                const d = (cx - hx) ** 2 + (cy - hy) ** 2 + (cz - hz) ** 2;
                if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
            }
            const crack = 1 - smooth(0.0, 0.12, Math.sqrt(d2) - Math.sqrt(d1));
            cov *= 1 - crack * 0.9;
            res.height += a * (1 - crack) * 0.00008;
        }
        if (inst.style === 'glowing') for (let c = 0; c < 3; c++) res.glow[c] += col[c] * cov * 1.1;
        return mix(rgb, col, clamp(cov, 0, 1));
    }
    function scar(inst, rgb, w, ev, fade, grain, mottle, p, res) {
        const style = inst.style, a = ev.alpha * fade, ridge = ev.ridge;
        // Scar tissue: paler and pinker than the skin, a little shiny along its middle; a fresh one red.
        const tint = inst.scarTint || (style === 'fresh' ? [rgb[0] * 1.18 + 0.03, rgb[1] * 0.55, rgb[2] * 0.55] : style === 'sunken' ? [rgb[0] * 0.95, rgb[1] * 0.82, rgb[2] * 0.86] : [rgb[0] * 1.12 + 0.05, rgb[1] * 1.0 + 0.025, rgb[2] * 0.98 + 0.025]);
        let out = mix(rgb, tint, a * 0.9);
        // Burns (the motif's fills) mottle and wrinkle.
        if (w[1] > 0) {
            const m2 = noise3(p.rest[0] * 700, p.rest[1] * 700, p.rest[2] * 700);
            // Grafted, mottled skin: pinker and paler patches, darker ones (more so at the burn's edge), shiny ridges.
            const edge = 1 - smooth(0.25, 0.9, w[1]), pale = [rgb[0] * 1.12 + 0.025, rgb[1] * 0.92 + 0.012, rgb[2] * 0.9 + 0.012], dark = [rgb[0] * 0.7, rgb[1] * 0.56, rgb[2] * 0.52];
            out = mix(out, mix(pale, dark, Math.min(1, smooth(0.4, 0.85, mottle) * 0.8 + edge * 0.5)), Math.min(1, w[1] * fade * 1.1) * 0.85);
            out = mix(out, mix(out, [0.95, 0.85, 0.82], 0.2), smooth(0.55, 0.85, m2) * w[1] * fade * 0.5);
            res.height += w[1] * fade * (0.00025 + (m2 - 0.5) * 0.0005);
        }
        if (style === 'fresh') out = mix(out, [rgb[0] * 0.45, rgb[1] * 0.12, rgb[2] * 0.1], smooth(0.55, 0.95, ridge) * a * 0.85);
        else out = mix(out, mix(out, [0.95, 0.88, 0.86], 0.25), smooth(0.4, 1, ridge) * a * 0.4);
        // Stitch marks (the motif's second fill): pale dots and dashes.
        if (w[2] > 0) out = mix(out, [rgb[0] * 1.1 + 0.04, rgb[1] * 1.05 + 0.03, rgb[2] * 1.05 + 0.03], w[2] * fade * 0.7);
        const h = (style === 'sunken' ? -0.0006 : 0.00065) * Math.pow(ev.relief, 0.7) * fade * (1 - w[1]);
        res.height += h + (w[2] ? w[2] * fade * 0.00025 : 0) + (grain - 0.5) * 0.00004 * a;
        return out;
    }
    function implant(inst, rgb, w, ev, fade, p, res) {
        const motif = inst.layer.motif, glow = inst.line, dim = inst.style === 'dim' ? 0.35 : 1;
        if (motif === 'bumps') {
            const r = ev.relief;
            res.height += Math.sqrt(Math.max(0, r)) * 0.0011 * fade;
            return mix(rgb, rgb.map(c => c * 1.06), r * 0.5 * fade);
        }
        if (motif === 'ports') {
            // A metal ring round a dark socket, a light at its heart.
            let out = mix(rgb, [0.42, 0.44, 0.47].map(c => c * (0.75 + 0.5 * ev.relief)), w[1] * fade);
            out = mix(out, [0.02, 0.02, 0.025], w[0] * fade);
            out = mix(out, mix(glow, [1, 1, 1], 0.3), w[4] * fade);
            for (let c = 0; c < 3; c++) res.glow[c] += glow[c] * (w[4] * 1.5 + w[0] * 0.15) * fade * dim;
            res.height += (w[1] * 0.0009 - w[0] * 0.0004) * fade;
            return out;
        }
        // Light lines under the skin: the skin over them takes their color, they glow through.
        const a = ev.alpha * fade;
        const out = mix(rgb, mix(rgb, glow, 0.55), a * 0.6);
        for (let c = 0; c < 3; c++) res.glow[c] += glow[c] * a * 1.4 * dim;
        res.height += ev.relief * 0.00022 * fade;
        return out;
    }

    // ── the detail pass ───────────────────────────────────────────────────
    /**
     * The skin under the art laid out again at a finer scale: the body's
     * triangles the art reaches (with a margin), unrolled by family (round
     * the trunk, round each limb) into charts packed in one square picture.
     * Returns { tris (body triangle starts in pack.body.index), uv (six per
     * triangle, 0..1), size, texel (meters) } or null.
     */
    function detailLayout(pack, layers, pictures, size) {
        const art = prepare(pack, layers, pictures);
        if (!art.list.length) return null;
        const S = art.surface, an = S.an, R = an.rest, body = pack.body, src = body.source;
        const B = Body(), ears = B.earMask ? B.earMask(pack) : null;
        const lips = (root.RRCharacterSkin && root.RRCharacterSkin.fieldsOf) ? root.RRCharacterSkin.fieldsOf(pack) : null;
        const p = { rest: [0, 0, 0], n: [0, 0, 0], fam: 0, s: 0, ang: 0, texel: 0.001 }, loc = { x: 0, y: 0, fade: 1 };
        const charts = new Map();
        const famOf = v => S.fam[v];
        for (let t = 0; t < body.index.length; t += 3) {
            const v = [src[body.index[t]], src[body.index[t + 1]], src[body.index[t + 2]]];
            const f = famOf(v[0]);
            if (ears && (ears[v[0]] > 0.25 || ears[v[1]] > 0.25 || ears[v[2]] > 0.25)) continue;
            if (lips && (lips.innerLip[v[0]] > 0.15 || lips.lids[v[0]] > 0.6)) continue;
            // Not the fingers or toes (they fold over each other unrolled).
            if ((f === 1 || f === 2) && v.some(q => an.s[q * 5 + f] > 3.3)) continue;
            if ((f === 3 || f === 4) && v.some(q => an.s[q * 5 + f] > 2.15)) continue;
            // Reached by any layer at a corner or the middle (with a centimeter to spare: the motif's reach includes it).
            let hit = false;
            for (let c = 0; c <= 3 && !hit; c++) {
                for (let k = 0; k < 3; k++) {
                    p.rest[k] = c < 3 ? R[v[c] * 3 + k] : (R[v[0] * 3 + k] + R[v[1] * 3 + k] + R[v[2] * 3 + k]) / 3;
                    p.n[k] = c < 3 ? S.N[v[c] * 3 + k] : (S.N[v[0] * 3 + k] + S.N[v[1] * 3 + k] + S.N[v[2] * 3 + k]) / 3;
                }
                const q = c < 3 ? v[c] : v[0];
                p.fam = f; p.s = an.s[q * 5 + f]; p.ang = an.angle[q * 5 + f];
                for (const inst of art.list) { inst.surfaceRef = S; if (locate(inst, p, loc) && within(inst, loc)) { hit = true; break; } }
            }
            if (!hit) continue;
            if (!charts.has(f)) charts.set(f, []);
            charts.get(f).push(t);
        }
        if (!charts.size) return null;
        // Each chart: corners unrolled (u round, v along), the round's cut placed away from the art.
        const laid = [];
        for (const [f, tris] of charts) {
            const cuts = art.list.filter(i => i.f === f || (f === 0 && i.proj === 'plane'));
            let cut = Math.PI;
            if (cuts.length) {
                let best = -1;
                for (let k = 0; k < 24; k++) {
                    const c = -Math.PI + k / 24 * TAU;
                    let d = Infinity;
                    for (const i of cuts) { const a = i.ang ?? (i.n ? Math.atan2(i.o[0], i.o[2]) : 0); d = Math.min(d, Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c)))); }
                    if (d > best) { best = d; cut = c; }
                }
            }
            const uv = [], keep = [];
            let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity, flipped = 0, kept = 0;
            const corner = [[0, 0], [0, 0], [0, 0]];
            for (const t of tris) {
                const v = [src[body.index[t]], src[body.index[t + 1]], src[body.index[t + 2]]];
                // Arc measured from the cut, so a triangle never straddles it.
                let ok = true, C = 0;
                for (let c = 0; c < 3; c++) {
                    const q = v[c], s = f === 0 ? R[q * 3 + 1] : an.s[q * 5 + f];
                    const ac = arcAt(S, f, s, cut), a0 = arcAt(S, f, s, an.angle[q * 5 + f]);
                    C = Math.max(C, arcAt.circ);
                    let u = a0 - ac; u -= Math.floor(u / arcAt.circ) * arcAt.circ;
                    corner[c][0] = u; corner[c][1] = f === 0 ? R[q * 3 + 1] : S.alongLen(f, s);
                    if (!isFinite(u)) ok = false;
                }
                const us = corner.map(c => c[0]), umax = Math.max(...us), umin = Math.min(...us);
                if (umax - umin > 0.5 * C) for (const c of corner) if (c[0] < (umax + umin) / 2) c[0] += C;
                const area = (corner[1][0] - corner[0][0]) * (corner[2][1] - corner[0][1]) - (corner[2][0] - corner[0][0]) * (corner[1][1] - corner[0][1]);
                // Stretch against the real triangle: folded or badly stretched ones stay on the body's own picture.
                const a3 = triArea(R, v);
                if (!ok || !(Math.abs(area) > 1e-10) || Math.abs(area) / 2 > a3 * 2.2 || Math.abs(area) / 2 < a3 * 0.4) continue;
                // Sheared ones too (near a joint the unrolling skews): the chart's stretch across against along.
                if (anisotropy(R, v, corner) > 2.2) continue;
                if (area < 0) flipped++; else kept++;
                keep.push({ t, c: corner.map(c => c.slice()), sign: Math.sign(area) });
            }
            // The chart's own facing is its majority's: the rest are folded (under a chin, in an armpit).
            const sign = kept >= flipped ? 1 : -1;
            // No two triangles may share the chart's place (where the unrolling folds over itself near a joint):
            // the least stretched claim it first, sampled inside each triangle on a fine grid.
            const cell = 0.0012, taken = new Map(), list = [];
            const ordered = keep.filter(k => k.sign === sign).map(k => Object.assign(k, { stretch: Math.abs(Math.log(Math.abs((k.c[1][0] - k.c[0][0]) * (k.c[2][1] - k.c[0][1]) - (k.c[2][0] - k.c[0][0]) * (k.c[1][1] - k.c[0][1])) / 2 / triArea(R, [src[body.index[k.t]], src[body.index[k.t + 1]], src[body.index[k.t + 2]]]))) })).sort((a, b) => a.stretch - b.stretch);
            const SAMPLES = [[1 / 3, 1 / 3], [0.6, 0.2], [0.2, 0.6], [0.2, 0.2], [0.45, 0.45], [0.1, 0.45], [0.45, 0.1]];
            for (const k of ordered) {
                const keys = SAMPLES.map(([a, b]) => { const u = k.c[0][0] * (1 - a - b) + k.c[1][0] * a + k.c[2][0] * b, v = k.c[0][1] * (1 - a - b) + k.c[1][1] * a + k.c[2][1] * b; return Math.floor(u / cell) + ',' + Math.floor(v / cell); });
                if (keys.some(q => taken.has(q) && taken.get(q) !== k.t)) continue;
                for (const q of keys) taken.set(q, k.t);
                list.push(k);
            }
            for (const k of list) for (const c of k.c) { u0 = Math.min(u0, c[0]); u1 = Math.max(u1, c[0]); v0 = Math.min(v0, c[1]); v1 = Math.max(v1, c[1]); }
            if (list.length) laid.push({ f, list, box: [u0, v0, u1, v1] });
        }
        if (!laid.length) return null;
        // Pack the charts: the largest scale (texels per meter) at which they fit side by side in rows.
        const pad = 6;
        const fit = scale => {
            let x = pad, y = pad, rowH = 0;
            const at = [];
            for (const c of laid.slice().sort((a, b) => (b.box[3] - b.box[1]) - (a.box[3] - a.box[1]))) {
                const w = (c.box[2] - c.box[0]) * scale, h = (c.box[3] - c.box[1]) * scale;
                if (w + 2 * pad > size || h + 2 * pad > size) return null;
                if (x + w + pad > size) { x = pad; y += rowH + pad; rowH = 0; }
                if (y + h + pad > size) return null;
                at.push({ c, x, y });
                x += w + pad; rowH = Math.max(rowH, h);
            }
            return at;
        };
        let lo = 50, hi = 4000, placed = fit(lo);
        if (!placed) return null;
        for (let k = 0; k < 18; k++) { const mid = (lo + hi) / 2, got = fit(mid); if (got) { lo = mid; placed = got; } else hi = mid; }
        const scale = lo, tris = [], uv = [];
        for (const { c, x, y } of placed) for (const k of c.list) {
            tris.push(k.t);
            for (const corner of k.c) uv.push((x + (corner[0] - c.box[0]) * scale) / size, (y + (c.box[3] - corner[1]) * scale) / size);
        }
        // At the picture's own resolution, no texel may belong to two triangles: a triangle that would paint over
        // another's texels (an overlap the coarse check missed) stays on the body's own picture.
        const owner = new Int32Array(size * size).fill(-1), keepT = [], keepUV = [];
        for (let k = 0; k < tris.length; k++) {
            const X = [uv[k * 6] * size, uv[k * 6 + 2] * size, uv[k * 6 + 4] * size], Y = [uv[k * 6 + 1] * size, uv[k * 6 + 3] * size, uv[k * 6 + 5] * size];
            const area = (X[1] - X[0]) * (Y[2] - Y[0]) - (X[2] - X[0]) * (Y[1] - Y[0]);
            if (Math.abs(area) < 1e-9) continue;
            const x0 = Math.max(0, Math.floor(Math.min(...X))), x1 = Math.min(size - 1, Math.ceil(Math.max(...X))), y0 = Math.max(0, Math.floor(Math.min(...Y))), y1 = Math.min(size - 1, Math.ceil(Math.max(...Y)));
            const mine = [];
            let clash = 0;
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const cx = x + 0.5, cy = y + 0.5;
                const a = ((X[1] - cx) * (Y[2] - cy) - (X[2] - cx) * (Y[1] - cy)) / area, b = ((X[2] - cx) * (Y[0] - cy) - (X[0] - cx) * (Y[2] - cy)) / area;
                if (a < 0 || b < 0 || 1 - a - b < 0) continue;
                const o = y * size + x;
                if (owner[o] >= 0) clash++; else mine.push(o);
            }
            if (clash > 1 + (mine.length + clash) * 0.03) continue;
            for (const o of mine) owner[o] = k;
            keepT.push(tris[k]);
            for (let q = 0; q < 6; q++) keepUV.push(uv[k * 6 + q]);
        }
        return { tris: Int32Array.from(keepT), uv: Float32Array.from(keepUV), size, texel: 1 / scale };
    }
    function within(inst, loc) {
        if (inst.wrap) return true;
        const m = 0.25;
        return Math.abs(loc.x) < inst.box[0] * 1.06 + m && Math.abs(loc.y) < inst.box[1] * 1.06 + m;
    }
    /** How unevenly a triangle's chart coordinates stretch it: the ratio of the mapping's two singular values. */
    function anisotropy(R, v, c) {
        const P = k => [R[v[k] * 3], R[v[k] * 3 + 1], R[v[k] * 3 + 2]], a = P(0), b = P(1), d = P(2);
        const e1 = norm(sub(b, a)), nrm = norm(cross(sub(b, a), sub(d, a))), e2 = cross(nrm, e1);
        const q1 = [dot(sub(b, a), e1), dot(sub(b, a), e2)], q2 = [dot(sub(d, a), e1), dot(sub(d, a), e2)];
        const u1 = [c[1][0] - c[0][0], c[1][1] - c[0][1]], u2 = [c[2][0] - c[0][0], c[2][1] - c[0][1]];
        const det = q1[0] * q2[1] - q2[0] * q1[1];
        if (Math.abs(det) < 1e-14) return Infinity;
        // J = U Q^-1, its singular values from J^T J.
        const iq = [[q2[1] / det, -q2[0] / det], [-q1[1] / det, q1[0] / det]];
        const J = [[u1[0] * iq[0][0] + u2[0] * iq[1][0], u1[0] * iq[0][1] + u2[0] * iq[1][1]], [u1[1] * iq[0][0] + u2[1] * iq[1][0], u1[1] * iq[0][1] + u2[1] * iq[1][1]]];
        const A = J[0][0] ** 2 + J[1][0] ** 2, B = J[0][0] * J[0][1] + J[1][0] * J[1][1], C = J[0][1] ** 2 + J[1][1] ** 2;
        const tr = A + C, root = Math.sqrt(Math.max(0, (A - C) ** 2 / 4 + B * B)), s1 = Math.sqrt(Math.max(0, tr / 2 + root)), s2 = Math.sqrt(Math.max(1e-20, tr / 2 - root));
        return s1 / s2;
    }
    function triArea(R, v) {
        const a = [R[v[1] * 3] - R[v[0] * 3], R[v[1] * 3 + 1] - R[v[0] * 3 + 1], R[v[1] * 3 + 2] - R[v[0] * 3 + 2]];
        const b = [R[v[2] * 3] - R[v[0] * 3], R[v[2] * 3 + 1] - R[v[0] * 3 + 1], R[v[2] * 3 + 2] - R[v[0] * 3 + 2]];
        return Math.hypot(...cross(a, b)) / 2;
    }

    /**
     * The detail charts as a part of their own: the body's triangles the
     * layout lists (those still drawn) moved off the body onto a copy of
     * their vertices with the layout's coordinates. Shares the body's
     * positions, normals, bindings and colors, so the two meet without a
     * seam; `source` lets expressions and the builder's fast reshaping move
     * it as the skin moves. Returns the part, or null.
     */
    function detailPart(pack, body, detail) {
        const L = detail && detail.layout;
        if (!L || !body || !body.index) return null;
        const I = pack.body.index, key = (a, b, c) => a + ',' + b + ',' + c;
        const want = new Map();
        for (let k = 0; k < L.tris.length; k++) { const t = L.tris[k]; want.set(key(I[t], I[t + 1], I[t + 2]), k); }
        const keep = [], moved = [];
        for (let t = 0; t < body.index.length; t += 3) {
            const k = want.get(key(body.index[t], body.index[t + 1], body.index[t + 2]));
            if (k === undefined) keep.push(body.index[t], body.index[t + 1], body.index[t + 2]); else moved.push(t, k);
        }
        if (!moved.length) return null;
        const index = [], uvs = [], map = new Map(), from = [];
        for (let m = 0; m < moved.length; m += 2) {
            const t = moved[m], k = moved[m + 1];
            for (let c = 0; c < 3; c++) {
                const bv = body.index[t + c], u = L.uv[k * 6 + c * 2], v = L.uv[k * 6 + c * 2 + 1], id = bv + ':' + Math.round(u * 65536) + ':' + Math.round(v * 65536);
                let n = map.get(id);
                if (n === undefined) { n = from.length; map.set(id, n); from.push(bv); uvs.push(u, v); }
                index.push(n);
            }
        }
        const gather = (arr, k) => { if (!arr) return null; const out = new arr.constructor(from.length * k); from.forEach((bv, i) => { for (let c = 0; c < k; c++) out[i * k + c] = arr[bv * k + c]; }); return out; };
        body.index = Uint32Array.from(keep);
        const part = { name: 'Body art', kind: 'skin', positions: gather(body.positions, 3), normals: gather(body.normals, 3), joints: gather(body.joints, 4), weights: gather(body.weights, 4),
            uvs: Float32Array.from(uvs), index: Uint32Array.from(index), source: Int32Array.from(from, bv => pack.body.source[bv]), decal: true, artDetail: true,
            texture: 'bodyart.png', roughness: body.roughness, metalness: body.metalness };
        if (body.colors) part.colors = gather(body.colors, 3);
        if (detail.normal) { part.normalTexture = 'bodyart-relief.png'; part.normalScale = 1; }
        if (detail.emissive) { part.emissive = '#ffffff'; part.emissiveTexture = 'bodyart-glow.png'; part.emissiveIntensity = 1; }
        return part;
    }

    // ── presets and randomness ────────────────────────────────────────────
    const T = (motif, region, o = {}) => Object.assign({ kind: (Motifs.BY_ID.get(motif) || { kind: 'tattoo' }).kind, motif, region }, o);
    const PRESETS = [
        { id: 'none', label: 'Clean skin', art: {} },
        { id: 'biker', label: 'Biker sleeves', art: { layers: [T('serpent', 'sleeve', { side: 'left', style: 'color', color2: '#2f7a4a', seed: 3 }), T('skull', 'forearm', { side: 'right', style: 'blackwork', size: 1.05 }), T('floral', 'upperArm', { side: 'right', style: 'color', size: 1.1 }), T('wings', 'chest', { style: 'blackwork', size: 1.15, along: 0.3 })], piercings: [{ spot: 'lobe', side: 'both', metal: 'steel', style: 'ring' }] } },
        { id: 'tribalWarrior', label: 'Tribal warrior', art: { layers: [T('tribal', 'shoulder', { side: 'left', size: 1.35 }), T('tribal', 'upperArm', { side: 'both', band: true, size: 0.75, along: -0.35 }), T('tribal', 'calf', { side: 'right', band: true, size: 0.7 }), T('clan', 'face', { style: 'matte', color: '#ece6d6', size: 1.2 }), T('claws', 'chest', { side: 'right', style: 'raised', size: 0.9, rotate: -15 })], piercings: [{ spot: 'septum', metal: 'bone', style: 'ring' }] } },
        { id: 'punk', label: 'Punk', art: { layers: [T('script', 'neck', { side: 'left', text: 'Riot', size: 0.9, rotate: -8 }), T('bird', 'hand', { side: 'left', style: 'color' }), T('geometric', 'forearm', { side: 'right', size: 0.9 }), T('barcode', 'neck', { side: 'right', around: 0.5, text: '1977', size: 0.8 })], piercings: [{ spot: 'septum', metal: 'black', style: 'ring' }, { spot: 'eyebrow', side: 'left', metal: 'steel', style: 'bar' }, { spot: 'lip', side: 'right', metal: 'steel', style: 'ring' }, { spot: 'helix', side: 'left', metal: 'steel' }, { spot: 'industrial', side: 'right', metal: 'steel' }, { spot: 'lobe', side: 'both', metal: 'black', style: 'spike' }] } },
        { id: 'netrunner', label: 'Netrunner', art: { layers: [T('circuit', 'sleeve', { side: 'right', style: 'glow', color2: '#38e6ff' }), T('lines', 'face', { side: 'left', size: 0.75, around: 0.08, along: 0.15 }), T('ports', 'neck', { side: 'left', size: 0.5 })], eye: { side: 'left', style: 'optic', cyber: 'neon' }, face: { studs: 'temple', side: 'left', style: 'neon' }, piercings: [{ spot: 'helix', side: 'right', metal: 'titanium', style: 'stud' }] } },
        { id: 'pirate', label: 'Pirate scars', art: { layers: [T('slash', 'face', { side: 'right', size: 0.7, rotate: 25, style: 'raised' }), T('stitches', 'forearm', { side: 'left', rotate: 70, size: 1.1 }), T('cut', 'chest', { side: 'left', rotate: -30, size: 1.2 }), T('burn', 'upperArm', { side: 'right', size: 0.7, style: 'raised' }), T('bird', 'chest', { side: 'right', style: 'faded', size: 0.55 }), T('runes', 'forearm', { side: 'right', band: true, style: 'faded', size: 0.6 })], piercings: [{ spot: 'lobe', side: 'left', metal: 'gold', style: 'ring' }] } },
        { id: 'clanPaint', label: 'Clan war paint', art: { layers: [T('mask', 'face', { style: 'matte', color: '#16161a', size: 1.25, along: 0.2 }), T('handprint', 'chest', { side: 'left', style: 'cracked', color: '#9e1b1b', size: 0.9 }), T('stripes', 'upperArm', { side: 'both', style: 'matte', color: '#e9e3d3', size: 0.7, rotate: 90 }), T('dots', 'face', { side: 'both', style: 'matte', color: '#e9e3d3', size: 0.35, along: -0.25, around: 0.04 })] } },
        { id: 'streetSamurai', label: 'Street samurai', art: { layers: [T('koi', 'back', { style: 'color', size: 1.1 }), T('slash', 'chest', { side: 'right', size: 0.8, style: 'raised' })], limbs: [{ limb: 'armL', mode: 'replace', style: 'military', wear: 0.4 }], piercings: [{ spot: 'lobe', side: 'right', metal: 'black', style: 'stud' }] } },
        { id: 'wastelander', label: 'Wasteland scavenger', art: { layers: [T('burn', 'forearm', { side: 'left', style: 'raised', size: 1.1 }), T('runes', 'neck', { band: true, side: 'left', style: 'faded', size: 0.7 }), T('claws', 'face', { side: 'left', size: 0.55, style: 'raised', rotate: -10 })], limbs: [{ limb: 'shinR', mode: 'replace', style: 'salvaged', wear: 0.75 }, { limb: 'forearmR', mode: 'replace', style: 'salvaged', wear: 0.7 }] } },
        { id: 'labProsthetic', label: 'Lab prosthetic', art: { limbs: [{ limb: 'armR', mode: 'replace', style: 'sleek', wear: 0.05 }], eye: { side: 'right', style: 'lens', cyber: 'sleek' } } },
        { id: 'neonGhost', label: 'Neon ghost', art: { layers: [T('lines', 'sleeve', { side: 'left', color: '#ff3df0' }), T('mandala', 'back', { style: 'glow', color2: '#38e6ff', size: 0.9 })], limbs: [{ limb: 'legL', mode: 'plate', style: 'neon', glow: '#ff3df0' }], face: { plate: 'cheek', side: 'right', style: 'neon', glow: '#ff3df0' } } }
    ];
    function preset(id) { const p = PRESETS.find(x => x.id === id); return p ? normalize(JSON.parse(JSON.stringify(p.art))) : null; }

    function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    /** Something new for Randomize's Body art: a few designs that suit their places, sometimes piercings, rarely a cyber limb. */
    function random(seed) {
        const R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
        if (R() < 0.35) return preset(pick(PRESETS.slice(1)).id);
        const tattoos = Motifs.MOTIFS.filter(m => m.kind === 'tattoo' && m.id !== 'barcode');
        const places = ['forearm', 'upperArm', 'shoulder', 'chest', 'back', 'calf', 'thigh', 'ribs', 'hand'];
        const style = pick(['blackwork', 'blackwork', 'color', 'faded']);
        const layers = [];
        const n = 1 + Math.floor(R() * 4);
        for (let k = 0; k < n; k++) {
            const m = pick(tattoos), region = R() < 0.18 && m.sleeve ? 'sleeve' : pick(places);
            layers.push({ kind: 'tattoo', motif: m.id, region, side: R() < 0.5 ? 'left' : 'right', style: R() < 0.7 ? style : pick(STYLES.tattoo.slice(0, 3)).at(0), seed: 1 + Math.floor(R() * 999), text: m.text ? pick(['Fortune', 'Wander', 'Ember', 'Home', 'Valor', 'Mercy']) : '', size: 0.8 + R() * 0.4, band: !!m.band && R() < 0.3 });
        }
        if (R() < 0.3) layers.push({ kind: 'scar', motif: pick(['cut', 'slash', 'claws', 'stitches']), region: pick(['face', 'chest', 'forearm', 'upperArm']), side: R() < 0.5 ? 'left' : 'right', size: 0.6 + R() * 0.4, rotate: Math.round((R() - 0.5) * 90) });
        const piercings = [];
        if (R() < 0.5) piercings.push({ spot: 'lobe', side: pick(['left', 'right', 'both']), metal: pick(['steel', 'gold', 'black']), style: pick(['ring', 'stud']) });
        if (R() < 0.2) piercings.push({ spot: pick(['nostril', 'septum', 'eyebrow', 'lip', 'helix']), side: R() < 0.5 ? 'left' : 'right', metal: pick(['steel', 'gold', 'black', 'titanium']) });
        const limbs = R() < 0.12 ? [{ limb: pick(LIMBS)[0], style: pick(CYBER_STYLES).id, wear: R() * 0.6 }] : [];
        return normalize({ layers, piercings, limbs });
    }

    /** A layer's tile picture: RGBA bytes (Motifs.preview with the layer's colors and text). */
    function layerPreview(layer, size) {
        const l = normalizeLayer(layer), m = Motifs.BY_ID.get(l.motif);
        return Motifs.preview(l.motif, { size, seed: l.seed, text: l.text, band: false, color: l.kind === 'scar' ? (l.color || '#c98e86') : l.kind === 'implant' ? (l.color || (m && m.palette[0])) : (l.color || (l.kind === 'paint' ? (m && m.palette[0]) : '#1a1a1e')), color2: l.color2 || (m && m.palette && m.palette[0]) });
    }

    const api = {
        KINDS, STYLES, REGIONS, REGION_BY_ID, SIDES, CENTER_SIDES, PIERCING_SPOTS, PIERCING_STYLES, METALS, LIMBS, LIMB_MODES, EYE_STYLES, FACE_STUDS, FACE_PLATES,
        CYBER_STYLES, CYBER_BY_ID, cyberMaterial, wearAt, MAX_LAYERS, MAX_PIERCINGS, MAX_LIMBS, PRESETS, LAYER,
        normalize, normalizeLayer, normalizeLimb, limbChain, isEmpty, preset, random, layerPreview,
        surface, arcAt, prepare, shade, locate, detailLayout, detailPart, motifs: Motifs
    };
    root.RRCharacterBodyArt = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
