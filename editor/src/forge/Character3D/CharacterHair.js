/**
 * RRCharacterHair - the Character Builder's hair, facial hair and brows,
 * grown on the shaped body (RRHumanBody.build) so every style follows every
 * slider, an exaggerated head or neck included.
 *
 * Everything is measured from the shaped vertices: the skull's center and
 * size, the eyes (MakeHuman's eye helpers), the ears, brows and lips (the
 * vertices MakeHuman's own ear, brow and lip targets move). A style is a
 * list of layers:
 *   cap     a shell over the scalp, cut at a hairline (a field over the
 *           head's vertices, clipped, so the edge is smooth) and tapered to
 *           nothing at the edge, so no scalp shows between clumps;
 *   strands clumps grown from scalp roots: combed from a part or crown,
 *           hugging the skull, then falling under gravity, kept outside the
 *           body (nearest body vertex and its normal) and off the face, cut
 *           at a length or height, waved or curled, meshed as tapered
 *           flattened tubes with a root-to-tip color ramp;
 *   tail / bun / braid / spikes / locks: gathered and shaped pieces.
 * Facial hair uses the same machinery on the jaw, chin and upper lip.
 *
 * Parts come out in RRCharacterGlb's part format, rigid on the Head bone;
 * hair below the shoulders blends toward Neck and Spine2.
 *
 * No DOM and no three.js: the builder page and the node tests share it.
 */
(function(root) {
    'use strict';

    // ── catalogs ───────────────────────────────────────────────────────────
    const STYLES = [
        { id: 'bald', label: 'Bald', group: 'Short hair' },
        { id: 'buzz', label: 'Buzz cut', group: 'Short hair' },
        { id: 'crew', label: 'Crew cut', group: 'Short hair' },
        { id: 'sidePart', label: 'Side part', group: 'Short hair' },
        { id: 'undercut', label: 'Undercut', group: 'Short hair' },
        { id: 'quiff', label: 'Quiff', group: 'Short hair' },
        { id: 'pompadour', label: 'Pompadour', group: 'Short hair' },
        { id: 'slickBack', label: 'Slicked back', group: 'Short hair' },
        { id: 'spiky', label: 'Spiky', group: 'Short hair' },
        { id: 'messy', label: 'Messy', group: 'Short hair' },
        { id: 'pixie', label: 'Pixie', group: 'Short hair' },
        { id: 'curlyShort', label: 'Short curls', group: 'Short hair' },
        { id: 'mohawk', label: 'Mohawk', group: 'Short hair' },
        { id: 'mohawkFlat', label: 'Flat mohawk', group: 'Short hair' },
        { id: 'mullet', label: 'Mullet', group: 'Medium hair' },
        { id: 'bob', label: 'Bob cut', group: 'Medium hair' },
        { id: 'shag', label: 'Shaggy', group: 'Medium hair' },
        { id: 'shoulder', label: 'Shoulder length', group: 'Medium hair' },
        { id: 'sweptBangs', label: 'Side-swept bangs', group: 'Medium hair' },
        { id: 'afro', label: 'Afro', group: 'Medium hair' },
        { id: 'curly', label: 'Curly', group: 'Medium hair' },
        { id: 'animeSpikes', label: 'Anime spikes', group: 'Medium hair' },
        { id: 'long', label: 'Long straight', group: 'Long hair' },
        { id: 'longWavy', label: 'Long wavy', group: 'Long hair' },
        { id: 'veryLong', label: 'Very long', group: 'Long hair' },
        { id: 'hime', label: 'Hime cut', group: 'Long hair' },
        { id: 'dreadlocks', label: 'Dreadlocks', group: 'Long hair' },
        { id: 'ponytail', label: 'Ponytail', group: 'Tied hair' },
        { id: 'ponytailLow', label: 'Low ponytail', group: 'Tied hair' },
        { id: 'pigtails', label: 'Pigtails', group: 'Tied hair' },
        { id: 'bun', label: 'Top bun', group: 'Tied hair' },
        { id: 'bunLow', label: 'Low bun', group: 'Tied hair' },
        { id: 'topKnot', label: 'Top knot', group: 'Tied hair' },
        { id: 'braid', label: 'Braid', group: 'Tied hair' },
        { id: 'twinBraids', label: 'Twin braids', group: 'Tied hair' },
        { id: 'flatTop', label: 'Flat top', group: 'Short hair' },
        { id: 'fauxHawk', label: 'Faux hawk', group: 'Short hair' },
        { id: 'asymmetricBob', label: 'Asymmetric bob', group: 'Medium hair' },
        { id: 'ringlets', label: 'Ringlets', group: 'Long hair' },
        { id: 'shortLocs', label: 'Short locs', group: 'Medium hair' },
        { id: 'sideBraid', label: 'Side braid', group: 'Tied hair' },
        { id: 'doubleBun', label: 'Double buns', group: 'Tied hair' },
        { id: 'halfUp', label: 'Half-up ponytail', group: 'Tied hair' },
        { id: 'braidedPonytail', label: 'Braided ponytail', group: 'Tied hair' },
        { id: 'cornrows', label: 'Cornrows', group: 'Braided hair' }
    ];

    const FACIAL = [
        { id: 'none', label: 'None', group: 'None' },
        { id: 'stubble', label: 'Stubble', group: 'Beard' },
        { id: 'goatee', label: 'Goatee', group: 'Beard' },
        { id: 'chinStrap', label: 'Chin strap', group: 'Beard' },
        { id: 'shortBeard', label: 'Short beard', group: 'Beard' },
        { id: 'fullBeard', label: 'Full beard', group: 'Beard' },
        { id: 'longBeard', label: 'Long beard', group: 'Beard' },
        { id: 'wizardBeard', label: 'Wizard beard', group: 'Beard' },
        { id: 'braidedBeard', label: 'Braided beard', group: 'Beard' },
        { id: 'muttonChops', label: 'Mutton chops', group: 'Beard' },
        { id: 'mustache', label: 'Mustache', group: 'Mustache' },
        { id: 'pencil', label: 'Pencil mustache', group: 'Mustache' },
        { id: 'handlebar', label: 'Handlebar', group: 'Mustache' },
        { id: 'walrus', label: 'Walrus', group: 'Mustache' },
        { id: 'horseshoe', label: 'Horseshoe', group: 'Mustache' },
        { id: 'soulPatch', label: 'Soul patch', group: 'Beard' },
        { id: 'anchorBeard', label: 'Anchor beard', group: 'Beard' },
        { id: 'chinCurtain', label: 'Chin curtain', group: 'Beard' },
        { id: 'sideburns', label: 'Sideburns', group: 'Beard' },
        { id: 'chevron', label: 'Chevron mustache', group: 'Mustache' }
    ];

    const BROWS = [
        { id: 'none', label: 'None' },
        { id: 'natural', label: 'Natural' },
        { id: 'thin', label: 'Thin' },
        { id: 'thick', label: 'Thick' },
        { id: 'arched', label: 'Arched brows' },
        { id: 'straight', label: 'Straight' },
        { id: 'angry', label: 'Angled' },
        { id: 'bushy', label: 'Bushy' }
    ];

    const PARTS = ['center', 'left', 'right', 'none'];

    /**
     * Each cut's own bangs, as a hairdresser cuts it: how much (the Bangs
     * slider's value when the style is chosen) and their kind: blunt (cut
     * straight above the brows), wispy (uneven, see-through), curtain (parted
     * in the middle and swept to the sides). Styles not named have none.
     */
    const STYLE_FRINGE = {
        messy: [0.45, 'wispy'], shag: [0.6, 'wispy'], bob: [0.55, 'blunt'], shoulder: [0.4, 'curtain'], curly: [0.35, 'wispy'],
        longWavy: [0.35, 'curtain'], pigtails: [0.6, 'blunt'], twinBraids: [0.5, 'blunt'], bun: [0.3, 'curtain'],
        asymmetricBob: [0.4, 'wispy'], ringlets: [0.25, 'curtain'], doubleBun: [0.35, 'curtain'], halfUp: [0.3, 'curtain']
    };
    /** A hair recipe with a new style and that style's own bangs. */
    function withStyle(hair, id) {
        return Object.assign({}, hair, { style: id, fringe: (STYLE_FRINGE[id] || [0])[0] });
    }

    const DEFAULT_HAIR = Object.freeze({
        style: 'sidePart',
        color: '#3b2a1e',
        tipColor: '',
        highlights: 0,
        length: 1,
        volume: 0.5,
        curl: 0,
        density: 1,
        frizz: 0,
        strandWidth: 1,
        part: 'left',
        fringe: 0,
        hairline: 0,
        facial: Object.freeze({ style: 'none', color: '', length: 1, volume: 0.5 }),
        brows: Object.freeze({ style: 'natural', thickness: 0.5, color: '' }),
        lashes: true
    });

    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+x) ? +x : lo));
    const hexOk = h => /^#[0-9a-f]{6}$/i.test(h || '');
    const pickId = (list, id, fallback) => (list.some(s => s.id === id) ? id : fallback);

    /** A full hair recipe from a partial one: every field present and in range. */
    function normalizeHair(input) {
        const h = input || {};
        const f = h.facial || {}, b = h.brows || {};
        return {
            style: pickId(STYLES, h.style, DEFAULT_HAIR.style),
            color: hexOk(h.color) ? h.color.toLowerCase() : DEFAULT_HAIR.color,
            tipColor: hexOk(h.tipColor) ? h.tipColor.toLowerCase() : '',
            highlights: clamp(h.highlights ?? 0, 0, 1),
            length: clamp(h.length ?? 1, 0.3, 2.5),
            volume: clamp(h.volume ?? 0.5, 0, 1),
            curl: clamp(h.curl ?? 0, 0, 1),
            density: clamp(h.density ?? 1, 0.3, 1.5),
            frizz: clamp(h.frizz ?? 0, 0, 1),
            strandWidth: clamp(h.strandWidth ?? 1, 0.5, 1.8),
            part: PARTS.includes(h.part) ? h.part : DEFAULT_HAIR.part,
            fringe: clamp(h.fringe ?? (STYLE_FRINGE[pickId(STYLES, h.style, DEFAULT_HAIR.style)] || [0])[0], 0, 1),
            hairline: clamp(h.hairline ?? 0, 0, 1),
            facial: {
                style: pickId(FACIAL, f.style, 'none'),
                color: hexOk(f.color) ? f.color.toLowerCase() : '',
                length: clamp(f.length ?? 1, 0.3, 2.5),
                volume: clamp(f.volume ?? 0.5, 0, 1)
            },
            brows: {
                style: pickId(BROWS, b.style, 'natural'),
                thickness: clamp(b.thickness ?? 0.5, 0, 1),
                height: clamp(b.height ?? 0, -0.8, 0.8),
                color: hexOk(b.color) ? b.color.toLowerCase() : ''
            },
            lashes: h.lashes !== false
        };
    }

    // ── small math ─────────────────────────────────────────────────────────
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = a => Math.hypot(a[0], a[1], a[2]);
    const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mix = (a, b, t) => a + (b - a) * t;

    /** Seeded xorshift: the same recipe grows the same hair. */
    function rng(seed) {
        let s = (seed >>> 0) || 0x9e3779b9;
        return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    }
    const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

    const srgbToLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const hexRgb = hex => { const n = parseInt(String(hex).slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
    const linear = hex => hexRgb(hex).map(srgbToLinear);
    const shadeRgb = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
    const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return '#' + [0, 1, 2].map(k => Math.round(mix(x[k], y[k], t) * 255).toString(16).padStart(2, '0')).join(''); };
    const mixRgb = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

    // ── the head, measured ─────────────────────────────────────────────────
    function boneIndex(built, name) { return built.bones.findIndex(b => b.name === name); }

    /** Vertex ids a target moves by at least `share` of its largest move. */
    function targetVerts(pack, name, share) {
        const t = pack.targets.get(name);
        if (!t) return [];
        let max = 0;
        const mags = new Float32Array(t.index.length);
        for (let i = 0; i < t.index.length; i++) { mags[i] = Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]); max = Math.max(max, mags[i]); }
        const out = [];
        for (let i = 0; i < t.index.length; i++) if (mags[i] >= max * share) out.push(t.index[i]);
        return out;
    }

    /** Everything about the shaped head a style needs; built once per build. */
    function measure(pack, built) {
        const S = built.shaped;
        const P = v => [S[v * 3], S[v * 3 + 1], S[v * 3 + 2]];
        const J = pack.skinJoints, W = pack.skinWeights;
        const head = boneIndex(built, 'Head'), neck = boneIndex(built, 'Neck'), chest = boneIndex(built, 'Spine2');
        const weightOn = (v, j) => { let w = 0; for (let k = 0; k < 4; k++) if (J[v * 4 + k] === j) w += W[v * 4 + k]; return w; };
        const bodySet = new Uint8Array(pack.vertexCount);
        for (const v of pack.body.source) bodySet[v] = 1;
        const normals = root.RRHumanBody ? root.RRHumanBody.vertexNormals(pack, S) : vertexNormals(pack, S);
        const meanOf = (a, z) => { let s = [0, 0, 0]; for (let v = a; v <= z; v++) s = add(s, P(v)); return mul(s, 1 / (z - a + 1)); };
        const spreadOf = (a, z, c) => { let m = 0; for (let v = a; v <= z; v++) m = Math.max(m, len(sub(P(v), c))); return m; };
        const eyeL = meanOf(14598, 14669), eyeR = meanOf(14670, 14741);
        const eyeRadius = spreadOf(14598, 14669, eyeL);
        const mouth = lerp(meanOf(15060, 15127), meanOf(14992, 15059), 0.5);
        const eyeY = (eyeL[1] + eyeR[1]) / 2;

        // Skull: head vertices above the eyes.
        let top = -Infinity, minZ = Infinity, maxZ = -Infinity, rx = 0, sumX = 0, n = 0;
        const headVerts = [];
        for (let v = 0; v < pack.vertexCount; v++) {
            if (!bodySet[v]) continue;
            const wh = weightOn(v, head), wn = weightOn(v, neck);
            if (wh + wn < 0.45) continue;
            headVerts.push(v);
            if (wh < 0.6) continue;
            const p = P(v);
            top = Math.max(top, p[1]);
            if (p[1] > eyeY + 0.25 * eyeRadius * 4) { minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]); sumX += p[0]; n++; }
        }
        const ry0 = top - eyeY;
        for (const v of headVerts) {
            const p = P(v);
            if (weightOn(v, head) > 0.6 && p[1] > eyeY + ry0 * 0.35) rx = Math.max(rx, Math.abs(p[0]));
        }
        const center = [n ? sumX / n : 0, eyeY - ry0 * 0.05, (minZ + maxZ) / 2];
        const radii = [rx, top - center[1], (maxZ - minZ) / 2];

        // Features from MakeHuman's own targets.
        const ears = new Uint8Array(pack.vertexCount);
        for (const v of targetVerts(pack, 'shape/earSize-incr', 0.25)) {
            if (Math.abs(S[v * 3] - center[0]) > radii[0] * 0.8 && S[v * 3 + 2] < center[2] + radii[2] * 0.45) ears[v] = 1;
        }
        // The ear itself, for the scalp to leave bare: what the ear target moves most (the quarter-share set
        // above spills onto the side of the head, where hair grows).
        // The ear's bowl barely moves as the ear grows (it sits at the root): the target that lifts the
        // whole ear marks it.
        const earCore = new Uint8Array(pack.vertexCount);
        for (const v of targetVerts(pack, 'shape/earSize-incr', 0.33)) if (ears[v]) earCore[v] = 1;
        for (const v of targetVerts(pack, 'shape/earHeight-incr', 0.6)) if (Math.abs(S[v * 3] - center[0]) > radii[0] * 0.75) earCore[v] = 1;
        const lips = new Uint8Array(pack.vertexCount);
        for (const name of ['shape/upperLip-incr', 'shape/lowerLip-incr']) for (const v of targetVerts(pack, name, 0.1)) lips[v] = 1;
        let earBottom = Infinity, earTop = -Infinity, earBack = Infinity, earFront = -Infinity;
        for (let v = 0; v < pack.vertexCount; v++) if (ears[v]) {
            earBottom = Math.min(earBottom, S[v * 3 + 1]); earTop = Math.max(earTop, S[v * 3 + 1]);
            earBack = Math.min(earBack, S[v * 3 + 2]); earFront = Math.max(earFront, S[v * 3 + 2]);
        }
        if (!Number.isFinite(earBottom)) { earBottom = eyeY - radii[1] * 0.45; earTop = eyeY + radii[1] * 0.2; earBack = center[2] - radii[2] * 0.3; earFront = center[2] + radii[2] * 0.1; }
        let chin = mouth;
        for (const v of targetVerts(pack, 'shape/chin-incr', 0.3)) if (S[v * 3 + 1] < chin[1]) chin = P(v);
        let lipTop = -Infinity, lipBottom = Infinity, lipFront = -Infinity, lipHalf = 0;
        for (let v = 0; v < pack.vertexCount; v++) if (lips[v]) {
            lipTop = Math.max(lipTop, S[v * 3 + 1]); lipBottom = Math.min(lipBottom, S[v * 3 + 1]);
            lipFront = Math.max(lipFront, S[v * 3 + 2]); lipHalf = Math.max(lipHalf, Math.abs(S[v * 3]));
        }
        let noseTip = mouth;
        for (const v of headVerts) { const p = P(v); if (p[1] > mouth[1] && p[1] < eyeY && Math.abs(p[0]) < 0.012 && p[2] > noseTip[2]) noseTip = p; }
        const neckBone = built.bones[neck], headBone = built.bones[head], chestBone = built.bones[chest];
        // The shoulder line, for where long hair stops hugging the neck.
        let shoulderY = neckBone.head[1], shoulderHalf = 0;
        for (const name of ['LeftArm', 'RightArm']) {
            const b = built.bones[boneIndex(built, name)];
            if (b) { shoulderY = Math.min(shoulderY, b.head[1]); shoulderHalf = Math.max(shoulderHalf, Math.abs(b.head[0])); }
        }
        if (!shoulderHalf) shoulderHalf = 0.18;

        // A spatial hash of the body's vertices, for keeping hair outside it.
        const cell = Math.max(0.012, radii[1] * 0.18);
        const grid = new Map();
        const key = (x, y, z) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
        for (let v = 0; v < pack.vertexCount; v++) {
            if (!bodySet[v] || (normals[v * 3] === 0 && normals[v * 3 + 1] === 0 && normals[v * 3 + 2] === 0)) continue;
            const k = key(Math.floor(S[v * 3] / cell), Math.floor(S[v * 3 + 1] / cell), Math.floor(S[v * 3 + 2] / cell));
            let list = grid.get(k);
            if (!list) grid.set(k, (list = []));
            list.push(v);
        }
        const nearest = (p, reach = 1) => {
            const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
            let best = -1, bd = Infinity;
            for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) for (let dz = -reach; dz <= reach; dz++) {
                const list = grid.get(key(cx + dx, cy + dy, cz + dz));
                if (!list) continue;
                for (const v of list) {
                    const ex = S[v * 3] - p[0], ey = S[v * 3 + 1] - p[1], ez = S[v * 3 + 2] - p[2];
                    const d = ex * ex + ey * ey + ez * ez;
                    if (d < bd) { bd = d; best = v; }
                }
            }
            return best < 0 && reach === 1 ? nearest(p, 2) : best;
        };
        /** Signed distance off the body along the nearest vertex's normal (Infinity when nothing is near). */
        const surface = p => {
            const v = nearest(p);
            if (v < 0) return { d: Infinity, v: -1 };
            const n3 = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
            return { d: dot(sub(p, P(v)), n3), v, n: n3, p: P(v) };
        };

        return {
            pack, built, S, P, normals, weightOn, bodySet, headVerts, ears, earCore, lips,
            bones: { head, neck, chest, spine1: boneIndex(built, 'Spine1') },
            headBone, neckBone, chestBone, shoulderY, shoulderHalf,
            center, radii, eyeL, eyeR, eyeY, eyeRadius, mouth, chin, noseTip,
            earBottom, earTop, earBack, earFront, lipTop, lipBottom, lipFront, lipHalf,
            nearest, surface, cell,
            scale: radii[1] / 0.11
        };
    }

    function vertexNormals(pack, S) {
        const n = new Float32Array(pack.vertexCount * 3);
        const src = pack.body.source, index = pack.body.index;
        for (let t = 0; t < index.length; t += 3) {
            const a = src[index[t]] * 3, b = src[index[t + 1]] * 3, c = src[index[t + 2]] * 3;
            const u = [S[b] - S[a], S[b + 1] - S[a + 1], S[b + 2] - S[a + 2]], w = [S[c] - S[a], S[c + 1] - S[a + 1], S[c + 2] - S[a + 2]];
            const f = cross(u, w);
            for (const s of [a, b, c]) { n[s] += f[0]; n[s + 1] += f[1]; n[s + 2] += f[2]; }
        }
        for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]); if (l > 0) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; } }
        return n;
    }

    /** Head-relative coordinates of a point: normalized offsets, azimuth (0 front, + toward the character's left) and elevation, degrees. */
    function headCoords(H, p) {
        const q = [(p[0] - H.center[0]) / H.radii[0], (p[1] - H.center[1]) / H.radii[1], (p[2] - H.center[2]) / H.radii[2]];
        const az = Math.atan2(q[0], q[2]) * 180 / Math.PI;
        const el = Math.atan2(q[1], Math.hypot(q[0], q[2])) * 180 / Math.PI;
        return { q, az, el, x: q[0], y: q[1], z: q[2] };
    }

    // ── surfaces cut from the body ─────────────────────────────────────────
    /**
     * The body's faces over the head and neck where `field(v)` is positive,
     * cut along field = 0 (edge points shared, so the cut is watertight).
     * Returns { pos: [[x,y,z]], nrm, val, index } with `val` the field value.
     */
    function cutSurface(H, field) {
        const pack = H.pack, src = pack.body.source, index = pack.body.index;
        const values = new Map();
        const valueOf = v => { let f = values.get(v); if (f === undefined) { f = field(v); values.set(v, f); } return f; };
        const candidate = new Uint8Array(pack.vertexCount);
        for (const v of H.headVerts) candidate[v] = 1;
        const pos = [], nrm = [], val = [], out = [];
        const vmap = new Map(), emap = new Map();
        const vert = v => {
            let i = vmap.get(v);
            if (i === undefined) { i = pos.length; vmap.set(v, i); pos.push(H.P(v)); nrm.push([H.normals[v * 3], H.normals[v * 3 + 1], H.normals[v * 3 + 2]]); val.push(valueOf(v)); }
            return i;
        };
        const edge = (a, b) => {
            const k = a < b ? a * 65536 + b : b * 65536 + a;
            let i = emap.get(k);
            if (i === undefined) {
                const fa = valueOf(a), fb = valueOf(b), t = fa / (fa - fb);
                i = pos.length; emap.set(k, i);
                pos.push(lerp(H.P(a), H.P(b), t));
                nrm.push(norm(lerp([H.normals[a * 3], H.normals[a * 3 + 1], H.normals[a * 3 + 2]], [H.normals[b * 3], H.normals[b * 3 + 1], H.normals[b * 3 + 2]], t)));
                val.push(0);
            }
            return i;
        };
        for (let t = 0; t < index.length; t += 3) {
            const tri = [src[index[t]], src[index[t + 1]], src[index[t + 2]]];
            if (!candidate[tri[0]] || !candidate[tri[1]] || !candidate[tri[2]]) continue;
            const f = tri.map(valueOf);
            const inside = f.map(x => x > 0);
            const count = inside.filter(Boolean).length;
            if (count === 0) continue;
            if (count === 3) { out.push(vert(tri[0]), vert(tri[1]), vert(tri[2])); continue; }
            // Walk the triangle keeping the inside part (a triangle or a quad).
            const poly = [];
            for (let k = 0; k < 3; k++) {
                const a = tri[k], b = tri[(k + 1) % 3];
                if (inside[k]) poly.push(vert(a));
                if (inside[k] !== inside[(k + 1) % 3]) poly.push(edge(a, b));
            }
            for (let k = 1; k + 1 < poly.length; k++) out.push(poly[0], poly[k], poly[k + 1]);
        }
        return { pos, nrm, val, index: out };
    }

    // ── mesh builder ───────────────────────────────────────────────────────
    function meshBuilder() {
        return { pos: [], nrm: [], col: [], idx: [], uv: [], tan: [] };
    }
    // A vertex; `uv` places it on the strand picture (a card), `tan` is the strand's direction there
    // (for highlights that run along the hair); solid geometry sits on the picture's root row, in the middle
    // of a lane, where the picture is opaque.
    const pushVert = (m, p, n, c, uv, tan) => { m.pos.push(p[0], p[1], p[2]); m.nrm.push(n[0], n[1], n[2]); m.col.push(c[0], c[1], c[2]); m.uv.push(uv ? uv[0] : 0.125, uv ? uv[1] : 0.02); m.tan.push(tan ? tan[0] : 0, tan ? tan[1] : -1, tan ? tan[2] : 0); return m.pos.length / 3 - 1; };

    /** A shell over a cut surface: each point raised by `lift(i)` along its normal, colored by `color(i)`. */
    function addShell(m, surf, lift, color, uv) {
        const base = m.pos.length / 3;
        for (let i = 0; i < surf.pos.length; i++) pushVert(m, add(surf.pos[i], mul(surf.nrm[i], lift(i))), surf.nrm[i], color(i), uv ? uv(i) : null);
        for (let t = 0; t < surf.index.length; t += 3) m.idx.push(base + surf.index[t], base + surf.index[t + 1], base + surf.index[t + 2]);
        return base;
    }

    /**
     * A clump along `pts`: a flattened tube whose wide side lies across the
     * hair (perpendicular to `out`, the direction away from the head),
     * `width` at the root tapering to a point. Colors ramp root → tip.
     */
    function addClump(m, pts, opts) {
        const n = pts.length;
        if (n < 2) return;
        if (opts.card !== false && !opts.solid) return addCard(m, pts, opts);
        const sides = opts.sides || 4;
        const w0 = opts.width, flat = opts.flat ?? 0.35;
        const base = m.pos.length / 3;
        let prevB = null;
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const T = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
            let out = opts.outAt ? opts.outAt(pts[i], i) : norm(sub(pts[i], opts.center));
            let B = cross(T, out);
            if (len(B) < 1e-6) B = prevB || cross(T, [0, 0, 1]);
            B = norm(B);
            if (prevB && dot(B, prevB) < 0) B = mul(B, -1);
            prevB = B;
            const N = norm(cross(B, T));
            const taper = opts.taper ? opts.taper(t) : (1 - Math.pow(t, 1.6) * 0.92);
            const w = w0 * taper, h = w * flat;
            const col = opts.color(t);
            for (let s = 0; s < sides; s++) {
                const a = (s / sides) * Math.PI * 2;
                const ca = Math.cos(a), sa = Math.sin(a);
                const offset = add(mul(B, ca * w * 0.5), mul(N, sa * h * 0.5));
                const normal = norm(add(mul(B, ca / Math.max(w, 1e-5)), mul(N, sa / Math.max(h, 1e-5))));
                // The side facing the head is darker: it is in the clump's own shadow.
                const shade = 0.72 + 0.28 * (0.5 + 0.5 * sa);
                pushVert(m, add(pts[i], offset), normal, shadeRgb(col, shade));
            }
        }
        for (let i = 0; i + 1 < n; i++) for (let s = 0; s < sides; s++) {
            const a = base + i * sides + s, b = base + i * sides + (s + 1) % sides;
            const c = a + sides, d = b + sides;
            m.idx.push(a, c, b, b, c, d);
        }
        // Root cap.
        const rc = pushVert(m, pts[0], norm(sub(pts[0], pts[1])), opts.color(0));
        for (let s = 0; s < sides; s++) m.idx.push(rc, base + s, base + (s + 1) % sides);
    }

    /**
     * A hair card: a strip along the clump, three vertices across, curved
     * a little round its middle like a lock of hair, carrying the strand
     * picture (u across, v root to tip). Wider than the clump's solid would
     * be, since the picture leaves only its strands; a second, narrower
     * strip crosses it so the lock has body from the side too.
     */
    function addCard(m, pts, opts) {
        // A strand caught against an extreme cheek/jaw may stop at its root.
        // There is no length to mesh (and no valid i/(n-1) texture coordinate).
        if (pts.length < 2) return;
        const n = pts.length, w0 = opts.width * 2.0, lane = opts.lane ?? (m._lane = ((m._lane || 0) + 1) % 4);
        const u0 = lane * 0.25, u1 = u0 + 0.25, v0 = opts.vFrom || 0.01;
        const seed = Math.sin(pts[0][0] * 9157.3 + pts[0][1] * 3373.1 + pts[0][2] * 6619.7) * 43758.5453;
        const roll = opts.roll ?? (seed - Math.floor(seed) - 0.5) * 0.7;
        // A lock lying flat on the skin (`single`) needs no crossing strip.
        for (const [scale, twist] of opts.single ? [[1, 0]] : [[1, 0], [0.6, 1]]) {
            const base = m.pos.length / 3;
            // The crossing strip gives the lock body near the head; past halfway the lock is flat anyway.
            const rows = twist ? Math.max(2, Math.ceil(n * 0.5)) : n;
            let prevB = null;
            for (let i = 0; i < rows; i++) {
                const t = i / (n - 1);
                const T = norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]));
                const out = opts.outAt ? opts.outAt(pts[i], i) : norm(sub(pts[i], opts.center));
                let B = cross(T, out);
                if (len(B) < 1e-6) B = prevB || cross(T, [0, 0, 1]);
                B = norm(B);
                if (prevB && dot(B, prevB) < 0) B = mul(B, -1);
                prevB = B;
                let N = norm(cross(B, T));
                // Each card rolled a little about its strand, its own way, so neighboring cards' edges never
                // line up and catch the light together.
                if (roll) { const cr = Math.cos(roll), sr = Math.sin(roll), b2 = add(mul(B, cr), mul(N, sr)); N = add(mul(N, cr), mul(B, -sr)); B = b2; }
                // The crossing strip stands across the first one.
                if (twist) { const x = B; B = N; N = mul(x, -1); }
                const taper = opts.taper ? opts.taper(t) : (1 - Math.pow(t, 1.6) * 0.7);
                const w = w0 * scale * Math.max(0.25, taper), bow = w * 0.18;
                const col = opts.color(t);
                for (let k = -1; k <= 1; k++) {
                    // The middle stands proud (a lock is round); the edges stay at the strand's own height.
                    const p = add(add(pts[i], mul(B, k * w * 0.5)), mul(N, k === 0 ? bow : 0));
                    const shade = k === 0 ? 1 : 0.86;
                    // Lit as part of the whole head of hair, not as a flat strip: the normal leans out from
                    // the head's middle (the card's own facing mixed in), and the strand runs along T.
                    let out = hairOut(opts.center || [0, 0, 0], p);
                    // Hair lying on the body below the head (over the chest, the shoulders, the back) faces the
                    // way the skin under it does, so it takes the light the body takes there.
                    if (opts.H && p[1] < opts.H.chin[1]) {
                        const sf = opts.H.surface(p);
                        if (Number.isFinite(sf.d) && sf.d < 0.04 * opts.H.scale) out = norm(lerp(out, sf.n, 0.7 * (1 - smooth(0.015, 0.04, sf.d / opts.H.scale))));
                    }
                    // Mostly the volume's facing: the cards shade as one head of hair, not as flat strips.
                    pushVert(m, p, norm(add(mul(out, 0.85), mul(norm(add(N, mul(B, k * 0.35))), 0.15))), shadeRgb(col, shade), [u0 + (k + 1) / 2 * (u1 - u0), v0 + t * (0.99 - v0)], T);
                }
            }
            for (let i = 0; i + 1 < rows; i++) {
                const a = base + i * 3;
                m.idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
            }
        }
    }

    /** Which way hair at `p` faces: out from the head's middle; below the head, out from the neck and back, not down. */
    function hairOut(c0, p) {
        const d0 = sub(p, c0), hang = smooth(0.05, 0.16, c0[1] - p[1]);
        return norm(lerp(norm(d0), norm([d0[0], 0.15 * Math.abs(d0[1]), d0[2]]), hang));
    }

    /**
     * The strand picture: four lanes of strands (a card takes one). In each
     * lane the strands gather into a few clumps that draw together toward
     * their tips, as locks of real hair do; each strand has its own length
     * (so a card ends in scattered points, never a cut edge), lightness and
     * a tip that thins to nothing. A band at the root is full, so no scalp
     * shows between cards.
     */
    function hairTexture(size = 512) {
        size = Math.max(512, size);
        const data = new Uint8Array(size * size * 4);
        const rnd = rng(77);
        const alpha = new Float32Array(size * size), lum = new Float32Array(size * size).fill(0.85);
        for (let lane = 0; lane < 4; lane++) {
            const lo = lane * 0.25, clumps = Array.from({ length: 6 }, (_, k) => lo + 0.02 + (k + 0.5) / 6 * 0.21 + (rnd() - 0.5) * 0.02);
            for (let k = 0; k < 170; k++) {
                const u0 = lo + 0.008 + rnd() * 0.234, clump = clumps.reduce((best, c) => (Math.abs(c - u0) < Math.abs(best - u0) ? c : best), clumps[0]);
                // Most strands run the card's length; the rest stop short, scattering the tips.
                const L = rnd() < 0.5 ? 0.8 + 0.17 * rnd() : 0.35 + 0.45 * rnd();
                const gatherK = 0.35 + 0.45 * rnd(), wob = (rnd() - 0.5) * 0.006, freq = 2 + rnd() * 4, ph = rnd() * 6.28;
                const light = 0.62 + 0.5 * rnd(), a0 = 0.75 + 0.25 * rnd(), w0 = (0.0026 + 0.0018 * rnd()) * size;
                for (let y = 0; y < size; y++) {
                    const v = (y + 0.5) / size;
                    if (v > L) break;
                    const t = v / L, tip = smooth(0, 0.3, 1 - t);
                    const cu = (mix(u0, clump, gatherK * Math.pow(t, 1.4)) + wob * Math.sin(v * freq * 6.28 + ph)) * size;
                    const width = Math.max(0.55, w0 * (0.5 + 0.5 * tip));
                    for (let x = Math.max(Math.floor(lo * size), Math.floor(cu - width - 1)); x <= Math.min(Math.ceil((lo + 0.25) * size) - 1, Math.ceil(cu + width + 1)); x++) {
                        const d = Math.abs(x + 0.5 - cu) / width;
                        if (d > 1) continue;
                        const al = (1 - d * d) * a0 * tip * Math.min(1, width / 0.9), o = y * size + x;
                        if (al > alpha[o]) { alpha[o] = 1 - (1 - alpha[o]) * (1 - al); lum[o] = light * (0.85 + 0.15 * (1 - d)); }
                    }
                }
            }
        }
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const o = y * size + x, v = (y + 0.5) / size;
            // A card's sides fade out to single strands and nothing at its border, so neighboring cards melt
            // together and no card shows as a strip; its own end is never reached by a strand at full strength,
            // so it never ends in a cut line. The root is fuller (no scalp between cards), fading the same way.
            const lu = ((x + 0.5) / size % 0.25) / 0.25, side = smooth(0, 0.3, Math.min(lu, 1 - lu));
            const a = Math.max(alpha[o] * (1 - smooth(0.86, 0.985, v)) * (0.35 + 0.65 * side), Math.max(0, 0.8 - v * 7) * side);
            // Darker at the root, lighter toward the tips, as hair is; its lightness averages about one, so a
            // lock shows the color chosen for it.
            const l = Math.min(255, Math.round(255 * 1.15 * lum[o] * (0.8 + 0.2 * Math.min(1, v * 1.6))));
            data[o * 4] = l; data[o * 4 + 1] = l; data[o * 4 + 2] = l; data[o * 4 + 3] = Math.round(255 * Math.min(1, a));
        }
        return { width: size, height: size, data, name: 'hair.png' };
    }

    /** A tube of round section `radius(t)` along `pts` (braids, locks, tails). */
    function addTube(m, pts, radius, color, sides = 6) {
        addClump(m, pts, { width: 2, flat: 1, sides, solid: true, center: [0, 0, 0], outAt: (p, i) => {
            const T = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));
            const up = Math.abs(T[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
            return norm(cross(T, up));
        }, taper: t => radius(t), color });
    }

    /** An ellipsoid blob (bun, knot), lumpy by `lumps`. */
    function addBlob(m, c, r, color, rand, lumps = 0.12, rows = 10, cols = 16) {
        const base = m.pos.length / 3;
        const seeds = Array.from({ length: 7 }, () => [rand() * 6.28, rand() * 6.28, 2 + Math.floor(rand() * 4)]);
        for (let i = 0; i <= rows; i++) {
            const th = (i / rows) * Math.PI;
            for (let j = 0; j < cols; j++) {
                const ph = (j / cols) * Math.PI * 2;
                const d = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
                let k = 1;
                for (const [a, b, f] of seeds) k += lumps * Math.sin(th * f + a) * Math.cos(ph * f + b) / seeds.length * 3;
                const p = add(c, [d[0] * r[0] * k, d[1] * r[1] * k, d[2] * r[2] * k]);
                pushVert(m, p, d, shadeRgb(color, 0.82 + 0.18 * d[1]));
            }
        }
        for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
            const a = base + i * cols + j, b = base + i * cols + (j + 1) % cols, c2 = a + cols, d = b + cols;
            m.idx.push(a, b, c2, b, d, c2);
        }
    }

    // ── strands ────────────────────────────────────────────────────────────
    /**
     * Grows one strand from `root` (on the scalp, normal `n`): first along
     * `dir`, hugging the head while above `release`, then falling under
     * gravity; always kept `layer` off the body and off the face.
     */
    function grow(H, root, n, dir, o) {
        const steps = o.steps || 10;
        // Simulated in short steps (a skull is only a few centimeters round), meshed at `steps`.
        const sim = Math.max(steps, Math.ceil(o.length / (0.011 * H.scale)));
        const seg = o.length / sim;
        const pts = [add(root, mul(n, o.layer * 0.4))];
        let d = norm(add(mul(dir, 1 - o.lift), mul(n, o.lift)));
        const down = [0, -1, 0];
        const depth = len(sub(root, H.center));
        for (let i = 1; i <= sim; i++) {
            const t = i / sim;
            const prev = pts[pts.length - 1];
            const g = o.gravity * smooth(0, o.stiff, t) * (seg / (o.length / steps));
            d = norm(add(mul(d, 1 - g), mul(down, g)));
            if (o.bias) d = norm(add(d, mul(o.bias, 0.25 * smooth(0, 0.6, t) * (seg / (o.length / steps)))));
            let p = add(prev, mul(d, seg));
            // Keep off the body; above the release height, also keep close to it (the hair lies on the head).
            let resting = false;
            for (let k = 0; k < 2; k++) {
                const s = H.surface(p);
                if (!Number.isFinite(s.d)) {
                    // Nothing near: above the release height, steer back toward the head.
                    if (o.hug > 0 && p[1] > o.release) p = lerp(p, add(H.center, mul(norm(sub(p, H.center)), len(sub(prev, H.center)))), 0.5 * o.hug);
                    break;
                }
                const want = o.layer;
                if (s.d < want) { p = add(p, mul(s.n, want - s.d)); if (s.n[1] > 0.35 && p[1] < H.earBottom) resting = true; }
                else if (o.hug > 0 && p[1] > o.release && s.d < want + 0.05 * H.scale) p = add(p, mul(s.n, -(s.d - want) * o.hug * (1 - t * 0.5)));
            }
            // Hair landing on a shoulder slides off it, behind (or in front, for locks that frame the face),
            // and never travels out along the shoulder toward the arm.
            if (p[1] < H.earBottom) {
                const limit = H.shoulderHalf * mix(0.62, 0.5, smooth(H.shoulderY, H.shoulderY - 0.15 * H.scale, p[1]));
                const dx = p[0] - H.center[0];
                if (Math.abs(dx) > limit) p = [H.center[0] + Math.sign(dx) * limit, p[1], p[2]];
                if (resting) p = add(p, mul(o.front ? AXIS.front : AXIS.back, seg * 0.8));
            }
            if (!o.fringe) p = keepOffFace(H, p, root);
            // Hair never dives deeper toward the head's middle than its own root: a strand caught in a
            // hollow (the mouth's inside) stops there.
            if (len(sub(p, H.center)) < depth - 0.015 * H.scale) break;
            if (o.stopY != null && p[1] < o.stopY) { pts.push(lerp(prev, p, clamp((prev[1] - o.stopY) / Math.max(1e-6, prev[1] - p[1]), 0, 1))); break; }
            pts.push(p);
            d = norm(sub(p, prev));
        }
        return resample(pts, steps);
    }

    /** `count` + 1 points spaced evenly along a polyline, ends kept. */
    function resample(pts, count) {
        if (pts.length <= count + 1) return pts;
        const acc = [0];
        for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + len(sub(pts[i], pts[i - 1])));
        const total = acc[acc.length - 1], out = [pts[0]];
        let j = 1;
        for (let k = 1; k < count; k++) {
            const want = (k / count) * total;
            while (j < acc.length - 1 && acc[j] < want) j++;
            const t = (want - acc[j - 1]) / Math.max(1e-9, acc[j] - acc[j - 1]);
            out.push(lerp(pts[j - 1], pts[j], t));
        }
        out.push(pts[pts.length - 1]);
        return out;
    }

    /** Strands that are not a fringe stay out of a box in front of the face: pushed to its sides. */
    function keepOffFace(H, p, root) {
        const halfW = (Math.abs(H.eyeL[0] - H.eyeR[0]) / 2 + H.eyeRadius * 2.4);
        const top = H.eyeY + H.eyeRadius * 2.2, bottom = H.chin[1] - H.radii[1] * 0.15;
        const front = H.center[2] + H.radii[2] * 0.35;
        if (p[1] > top || p[1] < bottom || p[2] < front) return p;
        const dx = p[0] - H.center[0];
        if (Math.abs(dx) >= halfW) return p;
        const side = Math.abs(dx) > 1e-4 ? Math.sign(dx) : (Math.sign(root[0] - H.center[0]) || 1);
        // Toward the side, a little back, so it frames the face instead of flattening onto the cheek.
        return [H.center[0] + side * halfW, p[1], Math.min(p[2], front + (halfW - Math.abs(dx)) * 0.15)];
    }

    /** Waves or curls laid over a strand: offsets across it, growing from the root. */
    function curlStrand(H, pts, amount, period, helix, phase) {
        if (amount <= 0) return pts;
        const out = [pts[0]];
        let acc = 0;
        for (let i = 1; i < pts.length; i++) {
            acc += len(sub(pts[i], pts[i - 1]));
            const T = norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[i - 1]));
            const away = norm(sub(pts[i], H.center));
            const B = norm(cross(T, away));
            const N = cross(B, T);
            const a = (acc / period) * Math.PI * 2 + phase;
            const grow = smooth(0, period * 0.8, acc) * amount;
            const off = helix ? add(mul(B, Math.cos(a) * grow), mul(N, Math.sin(a) * grow)) : mul(B, Math.sin(a) * grow);
            out.push(add(pts[i], off));
        }
        return out;
    }

    /** Roots scattered over a cut surface, area-weighted, each with its normal and field value. */
    function scatter(surf, count, rand) {
        const areas = [];
        let total = 0;
        for (let t = 0; t < surf.index.length; t += 3) {
            const a = surf.pos[surf.index[t]], b = surf.pos[surf.index[t + 1]], c = surf.pos[surf.index[t + 2]];
            total += len(cross(sub(b, a), sub(c, a))) / 2;
            areas.push(total);
        }
        const out = [];
        if (!total) return out;
        // Stratified: one root per equal slice of area, jittered.
        for (let i = 0; i < count; i++) {
            const target = ((i + rand()) / count) * total;
            let lo = 0, hi = areas.length - 1;
            while (lo < hi) { const mid = (lo + hi) >> 1; if (areas[mid] < target) lo = mid + 1; else hi = mid; }
            const t = lo * 3;
            let u = rand(), v = rand();
            if (u + v > 1) { u = 1 - u; v = 1 - v; }
            const ia = surf.index[t], ib = surf.index[t + 1], ic = surf.index[t + 2];
            const p = add(add(mul(surf.pos[ia], 1 - u - v), mul(surf.pos[ib], u)), mul(surf.pos[ic], v));
            const n = norm(add(add(mul(surf.nrm[ia], 1 - u - v), mul(surf.nrm[ib], u)), mul(surf.nrm[ic], v)));
            out.push({ p, n, f: surf.val[ia] * (1 - u - v) + surf.val[ib] * u + surf.val[ic] * v });
        }
        return out;
    }

    /** The scalp tangent nearest `want` at a point with normal `n`. */
    const tangent = (want, n) => { const t = sub(want, mul(n, dot(want, n))); return len(t) < 1e-6 ? norm(cross(n, [1, 0, 0])) : norm(t); };


    // ── hairline and zones ─────────────────────────────────────────────────
    /** The hairline's elevation (degrees) at each azimuth; `recede` raises the front and temples. */
    function hairlineAt(az, recede) {
        const a = Math.abs(az);
        // Round the ear the line climbs over its top and drops behind it to the nape at once, as hair grows:
        // no bare patch above and behind the ear.
        const pts = [[0, 40], [25, 37], [42, 30], [56, 20], [68, 8], [78, -12], [86, -20], [93, 4], [102, 0], [114, -14], [130, -24], [150, -32], [180, -38]];
        let el = pts[pts.length - 1][1];
        for (let i = 0; i + 1 < pts.length; i++) {
            const [a0, e0] = pts[i], [a1, e1] = pts[i + 1];
            if (a >= a0 && a <= a1) { const t = (a - a0) / (a1 - a0); el = mix(e0, e1, t * t * (3 - 2 * t)); break; }
        }
        // Receding: the front climbs, the temples most.
        el += recede * (16 * (1 - smooth(0, 70, a)) + 24 * Math.exp(-Math.pow((a - 52) / 16, 2)));
        return el;
    }

    /** A field over the head's vertices: degrees inside the hairline (positive) and inside `zone`. */
    function scalpField(H, hair, zone) {
        const noise = rng(hash('hairline'));
        const jitter = new Float32Array(64).map(() => noise() * 2 - 1);
        return v => {
            if (H.earCore[v]) return -12;
            const c = headCoords(H, H.P(v));
            // A soft irregular edge: real hairlines are not ruled lines.
            const j = jitter[Math.floor(((c.az + 180) / 360) * 63)] * 1.4;
            let f = c.el - hairlineAt(c.az, hair.hairline) + j;
            if (zone) f = Math.min(f, zone(c, v));
            return f;
        };
    }

    /** A point on the scalp toward head-relative direction (az, el), raised `layer` off it. */
    function scalpPoint(H, az, el, layer) {
        const a = az * Math.PI / 180, e = el * Math.PI / 180;
        const d = [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
        let p = add(H.center, [d[0] * H.radii[0], d[1] * H.radii[1], d[2] * H.radii[2]]);
        let n = norm([d[0] / H.radii[0], d[1] / H.radii[1], d[2] / H.radii[2]]);
        for (let k = 0; k < 4; k++) {
            const s = H.surface(p);
            if (!Number.isFinite(s.d)) break;
            p = add(p, mul(s.n, layer - s.d));
            n = s.n;
        }
        return { p, n };
    }

    /** Head-relative direction of a point (for gathering strands to a tie). */
    function dirOf(H, p) { return norm([(p[0] - H.center[0]) / H.radii[0], (p[1] - H.center[1]) / H.radii[1], (p[2] - H.center[2]) / H.radii[2]]); }
    function slerpDir(a, b, t) {
        const d = clamp(dot(a, b), -1, 1), w = Math.acos(d);
        if (w < 1e-4) return a;
        const s = Math.sin(w);
        return add(mul(a, Math.sin((1 - t) * w) / s), mul(b, Math.sin(t * w) / s));
    }
    /** From a scalp root over the head to `tie`, lying on the scalp. */
    function gather(H, root, tie, layer, steps) {
        const da = dirOf(H, root), db = dirOf(H, tie);
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const d = slerpDir(da, db, i / steps);
            let p = add(H.center, [d[0] * H.radii[0], d[1] * H.radii[1], d[2] * H.radii[2]]);
            for (let k = 0; k < 3; k++) { const s = H.surface(p); if (!Number.isFinite(s.d)) break; p = add(p, mul(s.n, layer - s.d)); }
            pts.push(p);
        }
        return pts;
    }

    // ── comb directions ────────────────────────────────────────────────────
    const AXIS = { up: [0, 1, 0], down: [0, -1, 0], back: [0, 0, -1], front: [0, 0, 1], left: [1, 0, 0], right: [-1, 0, 0] };
    /** Hair falls away from the part on top, away from the crown behind it. */
    function combFromPart(H, hair, p, n, c) {
        const partX = hair.part === 'left' ? 0.38 : hair.part === 'right' ? -0.38 : 0;
        if (hair.part === 'none') return tangent(add(mul(AXIS.back, 1), mul(AXIS.down, 0.6)), n);
        if (c.az > 115 || c.az < -115) {
            // Behind the crown: down the back of the head, a little outward.
            return tangent(add(mul(AXIS.down, 1), mul([c.x, 0, 0], 0.5)), n);
        }
        const side = c.x >= partX ? 1 : -1;
        const want = add(add(mul(AXIS.left, side), mul(AXIS.down, 0.55)), mul(AXIS.back, 0.15));
        return tangent(want, n);
    }
    const combBack = (n, c) => tangent(add(add(AXIS.back, mul(AXIS.down, 0.45)), mul([c.x, 0, 0], 0.25)), n);
    const combDown = (n, c) => tangent(add(AXIS.down, mul([c.x, 0, Math.max(0, c.z) * 0.3], 0.6)), n);

    // ── styles ─────────────────────────────────────────────────────────────
    /**
     * Every style as layers. Lengths are meters on an average head and scale
     * with the head (H.scale) and the recipe's length.
     */
    function styleLayers(H, hair) {
        const L = hair.length * H.scale, V = hair.volume, S = H.scale;
        const browY = H.eyeY + H.eyeRadius * 1.9;
        const chinY = H.chin[1];
        const fringeZone = c => (Math.abs(c.az) < 55 ? 1 : 0);
        const fringe = hair.fringe;
        const cap = (t, zone) => ({ type: 'cap', thickness: t * S, zone });
        const base = { layer: (0.004 + 0.008 * V) * S, lift: 0.05 + 0.25 * V, gravity: 0.35, stiff: 0.35, hug: 0.8, steps: 10 };
        const strands = o => Object.assign({ type: 'strands' }, base, o);
        const kind = (STYLE_FRINGE[hair.style] || [0, 'blunt'])[1];
        const frontBangs = (len, sweep, how = 'blunt') => strands({
            count: Math.round((how === 'wispy' ? 30 : 40) + 50 * fringe), zone: c => (fringeZone(c) ? 30 - Math.abs(c.az) * 0.5 : -1) + (c.el - 25),
            // Curtain bangs part in the middle and sweep out to each side; wispy ones fall loosely, a little apart.
            comb: (p, n, c, r) => tangent(add(add(AXIS.front, mul(AXIS.down, 0.9)), mul(AXIS.left, how === 'curtain' ? Math.sign(c.x || 1) * 0.9 : (sweep || 0) + c.x * 0.4 + (how === 'wispy' ? (r() - 0.5) * 0.6 : 0))), n),
            length: (c, r) => len * (how === 'curtain' ? 1 + 1.4 * Math.min(1, Math.abs(c.x) * 3) : how === 'wispy' ? 0.7 + 0.5 * r() : 1),
            stopY: c => (how === 'curtain' ? browY - (0.004 + 0.03 * Math.min(1, Math.abs(c.x) * 3)) * S : browY - (sweep ? 0.012 * S : how === 'wispy' ? 0.006 * S : 0)),
            fringe: true, width: (how === 'wispy' ? 0.011 : 0.014) * S, hug: 0.9, gravity: 0.6, stiff: 0.2
        });
        const withFringe = layers => (fringe > 0.05 ? layers.concat([frontBangs(0.12 * S * (0.6 + fringe * 0.6), 0, kind)]) : layers);
        const partComb = (p, n, c) => combFromPart(H, hair, p, n, c);
        const curl = hair.curl;
        switch (hair.style) {
            case 'flatTop': return [cap(0.003), strands({ count: 240, zone: c => c.el - 30, comb: () => AXIS.up, length: c => Math.max(0.012, 0.075 - c.y * 0.04) * L, width: 0.012 * S, hug: 0, lift: 0.6, gravity: 0, steps: 4 })];
            case 'fauxHawk': return [cap(0.006), { type: 'spikes', count: 40, length: 0.07 * L, width: 0.022 * S, up: 0.8, zone: c => (0.55 - Math.abs(c.x)) * 30 }];
            case 'asymmetricBob': return withFringe([cap(0.007), strands({ sheet: true, count: 320, comb: partComb, length: c => (c.x > 0 ? 0.34 : 0.22) * L, width: 0.023 * S, hug: 0.85, gravity: 0.6, steps: 12, stopY: c => chinY + (c.x > 0 ? -0.06 : 0.035) * S, inCurl: 0.3 })]);
            case 'ringlets': return withFringe([cap(0.012), { type: 'coils', count: 380, length: () => 0.16 * L, width: 0.005 * S, coil: 0.008 * S, comb: (p, n, c) => combDown(n, c), stand: 0.2, stopY: () => H.shoulderY - 0.08 * L }]);
            case 'shortLocs': return [cap(0.008), { type: 'locks', count: 72, length: 0.17 * L, radius: (0.007 + 0.003 * V) * S }];
            case 'sideBraid': return withFringe([cap(0.005), { type: 'braid', ties: [[105, -8]], length: 0.42 * L, radius: (0.018 + 0.006 * V) * S }]);
            case 'doubleBun': return withFringe([cap(0.005), ...[-1, 1].map(side => ({ type: 'bun', tie: [side * 105, 45], radius: (0.03 + 0.015 * V) * S }))]);
            case 'halfUp': return withFringe([cap(0.005), strands({ sheet: true, count: 220, zone: c => 35 - c.el, comb: partComb, length: () => 0.43 * L, width: 0.025 * S, hug: 0.85, gravity: 0.65, steps: 12, drape: 'split' }), { type: 'tail', ties: [[180, 40]], length: 0.3 * L, radius: (0.016 + 0.008 * V) * S }]);
            case 'braidedPonytail': return [cap(0.005), { type: 'braid', ties: [[180, 46]], length: 0.48 * L, radius: (0.018 + 0.006 * V) * S }];
            case 'cornrows': return [cap(0.001), { type: 'cornrows', rows: 9, radius: (0.003 + 0.002 * V) * S }];
            case 'bald': return [];
            case 'buzz': return [cap(0.0012 + 0.0012 * V)];
            // Short hair stands as a soft pile: a dense layer of strands with many short, fine ones standing
            // out of it, so its outline is soft and it never reads as rows of tiles.
            case 'crew': return [cap(0.006 + 0.004 * V), { type: 'coils', count: 1100, length: c => (c.el > 30 ? 0.022 : 0.012) * S * hair.length, width: 0.0045 * S, coil: 0.0012 * S, comb: (p, n, c) => (c.el > 30 ? tangent(add(AXIS.front, mul(AXIS.up, 0.6)), n) : combDown(n, c)), stand: 0.45 }];
            case 'sidePart': return [cap(0.006), strands({ count: 260, comb: partComb, length: c => (c.el > 20 ? 0.075 : 0.04) * L, width: 0.016 * S, hug: 1, gravity: 0.2, steps: 6 })];
            case 'undercut': return [cap(0.0018), cap(0.008, c => (c.el - 40) * 2), strands({ count: 220, zone: c => (c.el - 42) * 2, comb: (p, n, c) => tangent(add(add(mul(AXIS.left, hair.part === 'right' ? -1 : 1), mul(AXIS.back, 0.5)), mul(AXIS.up, 0.2)), n), length: () => 0.13 * L, width: 0.02 * S, hug: 0.55, lift: 0.3 + 0.35 * V, gravity: 0.25, stiff: 0.5, steps: 8 })];
            case 'quiff': return [cap(0.006), strands({ count: 130, zone: c => c.el - 30, comb: (p, n, c) => tangent(add(mul(AXIS.back, 0.6), mul(AXIS.up, 0.9)), n), length: c => (c.z > 0.2 ? 0.09 : 0.06) * L, width: 0.018 * S, hug: 0.1, lift: 0.55 + 0.3 * V, gravity: 0.05, steps: 6 }), strands({ count: 120, zone: c => 30 - c.el, comb: (p, n, c) => combBack(n, c), length: () => 0.03 * S, width: 0.012 * S, hug: 1, gravity: 0.1, steps: 3, sides: 3 })];
            case 'pompadour': return [cap(0.008), strands({ count: 120, zone: c => Math.min(c.el - 28, 70 - Math.abs(c.az)), comb: (p, n, c) => norm(add(mul(AXIS.up, 1.3), mul(AXIS.back, 0.35))), length: c => (0.07 + 0.06 * Math.max(0, c.z)) * L, width: 0.022 * S, hug: 0, lift: 0.6, gravity: 0.5, stiff: 0.5, steps: 8, fringeAll: true, bias: AXIS.back }), strands({ count: 200, comb: (p, n, c) => combBack(n, c), length: c => (c.el > 25 ? 0.1 : 0.04) * L, width: 0.018 * S, hug: 0.95, gravity: 0.2, stiff: 0.5, steps: 7 })];
            case 'slickBack': return [cap(0.004), strands({ count: 260, comb: (p, n, c) => combBack(n, c), length: () => 0.11 * L, width: 0.016 * S, hug: 1, lift: 0.02, gravity: 0.25, stiff: 0.6, steps: 8 })];
            case 'spiky': return [cap(0.006), { type: 'spikes', count: 70, length: 0.06 * L, width: 0.022 * S, up: 0.6 }];
            case 'messy': return withFringe([cap(0.007), strands({ count: 260, comb: (p, n, c, r) => tangent(norm([r() * 2 - 1, r() * 1.2 - 0.8, r() * 2 - 1]), n), length: () => (0.06 + 0.04 * V) * L, width: 0.016 * S, hug: 0.5, lift: 0.35 + 0.3 * V, gravity: 0.3, steps: 6, waves: 0.008 })]);
            case 'pixie': return [cap(0.005), strands({ count: 240, comb: (p, n, c) => (Math.abs(c.az) < 70 && c.el > 15 ? tangent(add(add(AXIS.front, AXIS.down), mul(AXIS.left, hair.part === 'right' ? -0.8 : 0.8)), n) : combDown(n, c)), length: c => (Math.abs(c.az) < 70 && c.el > 15 ? 0.1 : 0.05) * L, width: 0.016 * S, hug: 0.95, gravity: 0.4, steps: 7, fringeAll: true, stopY: () => browY - 0.004 * S })];
            case 'curlyShort': return [cap(0.012 + 0.01 * V), { type: 'coils', count: 1300, length: () => (0.022 + 0.012 * V) * L, width: 0.006 * S, coil: (0.0035 + 0.002 * hair.curl) * S, comb: (p, n, c) => combDown(n, c), stand: 0.7, stopY: () => browY + 0.006 * S }];
            case 'mohawk': return [cap(0.0015), cap(0.005, c => (0.26 - Math.abs(c.x)) * 120), { type: 'spikes', count: 16, length: 0.12 * L, width: 0.035 * S, up: 1, zone: c => (0.2 - Math.abs(c.x)) * 120, row: true }];
            case 'mohawkFlat': return [cap(0.0015), cap(0.006, c => (0.27 - Math.abs(c.x)) * 120), strands({ count: 120, zone: c => (0.22 - Math.abs(c.x)) * 120, comb: (p, n, c) => tangent(add(AXIS.back, mul(AXIS.up, 0.4)), n), length: () => 0.1 * L, width: 0.02 * S, hug: 0.6, lift: 0.4 + 0.3 * V, gravity: 0.15, steps: 7 })];
            case 'mullet': return [cap(0.006), strands({ count: 160, zone: c => 125 - Math.abs(c.az), comb: partComb, length: () => 0.06 * L, width: 0.016 * S, hug: 1, gravity: 0.3, steps: 6 }), strands({ count: 110, zone: c => Math.abs(c.az) - 115, comb: (p, n, c) => combDown(n, c), length: () => 0.24 * L, width: 0.018 * S, hug: 0.6, gravity: 0.6, steps: 11, stopY: () => H.shoulderY - 0.08 * S * hair.length })];
            case 'bob': return withFringe([cap(0.007), strands({ sheet: true, count: 340, comb: partComb, length: () => 0.26 * L, width: 0.024 * S, hug: 0.85, lift: 0.1 + 0.2 * V, gravity: 0.5, steps: 11, stopY: () => chinY - 0.005 * S, inCurl: 0.35 })]);
            case 'shag': return withFringe([cap(0.008), strands({ count: 300, comb: (p, n, c, r) => tangent(add(partComb(p, n, c), mul(norm([r() - 0.5, 0, r() - 0.5]), 0.8)), n), length: (c, r) => (0.18 + 0.12 * r()) * L, width: 0.017 * S, hug: 0.55, lift: 0.25 + 0.3 * V, gravity: 0.55, steps: 11, waves: 0.012, stopY: () => H.shoulderY - 0.02 * S })]);
            case 'shoulder': return withFringe([cap(0.007), strands({ sheet: true, count: 340, comb: partComb, length: () => 0.32 * L, width: 0.024 * S, drape: 'split', hug: 0.85, gravity: 0.6, steps: 12, stopY: () => H.shoulderY - 0.03 * S * hair.length })]);
            case 'sweptBangs': return [cap(0.007), strands({ sheet: true, count: 280, comb: partComb, length: () => 0.3 * L, width: 0.022 * S, hug: 0.85, gravity: 0.6, steps: 12, stopY: () => H.shoulderY - 0.02 * S }), frontBangs(0.15 * S, hair.part === 'right' ? -1.1 : 1.1)];
            case 'afro': return [{ type: 'afro', radius: (0.05 + 0.07 * V) * hair.length * S }];
            // Curls fall as many fine, narrow locks waving in their own plane (a lock twisted round a helix reads
            // as tiles), over a soft pile of short coils at the scalp that gives the head its volume.
            case 'curly': return withFringe([cap(0.012 + 0.008 * V), { type: 'coils', count: 600, length: () => (0.02 + 0.012 * V) * L, width: 0.006 * S, coil: 0.004 * S, comb: (p, n, c) => combDown(n, c), stand: 0.6 },
                strands({ count: 250, single: true, comb: partComb, length: () => 0.3 * L, width: 0.0075 * S, hug: 0.5, lift: 0.35 + 0.3 * V, gravity: 0.55, steps: 22, waves: 0.009 + 0.004 * V, wavePeriod: 0.075, stopY: () => H.shoulderY - 0.05 * S * hair.length })]);
            case 'animeSpikes': return [cap(0.01), { type: 'spikes', count: 34, length: 0.13 * L, width: 0.05 * S, up: 0.3, anime: true }, { type: 'spikes', count: 9, length: 0.11 * L, width: 0.04 * S, up: -0.8, front: true, zone: c => 50 - Math.abs(c.az) }];
            case 'long': return withFringe([cap(0.007), strands({ sheet: true, count: 320, comb: partComb, length: () => 0.5 * L, width: 0.028 * S, hug: 0.85, gravity: 0.65, steps: 12, drape: 'split' })]);
            // Waves in many narrow single locks: wide waving cards read as shingles.
            case 'longWavy': return withFringe([cap(0.008), strands({ sheet: true, single: true, count: 460, comb: partComb, length: () => 0.52 * L, width: 0.018 * S, drape: 'split', hug: 0.8, lift: 0.15 + 0.25 * V, gravity: 0.6, steps: 19, waves: 0.012 + 0.012 * V })]);
            case 'veryLong': return withFringe([cap(0.007), strands({ sheet: true, count: 330, comb: partComb, length: () => 0.85 * L, width: 0.028 * S, drape: 'split', hug: 0.85, gravity: 0.7, steps: 16 })]);
            case 'hime': return [cap(0.007), frontBangs(0.13 * S, 0), strands({ count: 70, zone: c => (Math.abs(c.az) > 45 && Math.abs(c.az) < 100 ? 1 : -1) * 20, comb: (p, n, c) => combDown(n, c), length: () => 0.3 * L, width: 0.02 * S, hug: 0.9, gravity: 0.8, steps: 10, stopY: () => chinY - 0.01 * S, frontDrape: true }), strands({ sheet: true, count: 320, comb: partComb, length: () => 0.6 * L, width: 0.026 * S, hug: 0.85, gravity: 0.7, steps: 14 })];
            case 'dreadlocks': return [cap(0.01), { type: 'locks', count: 64, length: 0.4 * L, radius: (0.009 + 0.004 * V) * S }];
            case 'ponytail': return withFringe([cap(0.005), { type: 'tail', ties: [[180, 42]], length: 0.38 * L, radius: (0.022 + 0.015 * V) * S }]);
            case 'ponytailLow': return withFringe([cap(0.005), { type: 'tail', ties: [[180, -18]], length: 0.36 * L, radius: (0.02 + 0.012 * V) * S }]);
            case 'pigtails': return withFringe([cap(0.005), { type: 'tail', ties: [[112, 14], [-112, 14]], length: 0.3 * L, radius: (0.018 + 0.01 * V) * S }]);
            case 'bun': return withFringe([cap(0.005), { type: 'bun', tie: [178, 62], radius: (0.034 + 0.02 * V) * S }]);
            case 'bunLow': return withFringe([cap(0.005), { type: 'bun', tie: [180, -12], radius: (0.032 + 0.018 * V) * S }]);
            case 'topKnot': return [cap(0.005), { type: 'bun', tie: [175, 78], radius: 0.024 * S, knot: true }];
            case 'braid': return withFringe([cap(0.005), { type: 'braid', ties: [[180, -10]], length: 0.42 * L, radius: (0.016 + 0.008 * V) * S }]);
            case 'twinBraids': return withFringe([cap(0.005), { type: 'braid', ties: [[118, -6], [-118, -6]], length: 0.38 * L, radius: (0.013 + 0.006 * V) * S }]);
            default: return [];
        }
    }

    // ── layer builders ─────────────────────────────────────────────────────
    // A little lighter than the color chosen: the lock shading (root dark, strands varying) averages below it.
    const HAIR_LIFT = 1.1;
    function colorRamp(hair) {
        const rootC = shadeRgb(linear(hair.color), 0.88 * HAIR_LIFT);
        const tipC = shadeRgb(hair.tipColor ? linear(hair.tipColor) : shadeRgb(linear(hair.color), 1.12), HAIR_LIFT);
        const hi = mixRgb(linear(hair.color), [0.9, 0.82, 0.62], 0.5);
        const ramp = (t, variance, highlight, lock) => {
            let c = mixRgb(rootC, tipC, smooth(0, 1, t));
            // Highlights lighten a lock toward its tip, never to a pale sheet.
            if (highlight) c = mixRgb(c, hi, 0.3 * t);
            if (lock) c = mixRgb(c, lock[0], lock[1]);
            return shadeRgb(c, variance);
        };
        // Grey and white hair is never one color: each lock is whiter, greyer or still dark, as hair greys
        // strand by strand. `ramp.lock(rand)` picks a lock's own shade for that (null for other hair).
        const base = linear(hair.color), mx = Math.max(...base), mn = Math.min(...base);
        const greying = mx > 0.12 && (mx - mn) / mx < 0.2;
        ramp.lock = rand => {
            if (!greying) return null;
            const r = rand();
            if (r < 0.3) return [[0.86, 0.86, 0.84], 0.4];
            if (r < 0.4 && mx < 0.7) return [[0.12, 0.1, 0.085], 0.25];
            if (r < 0.7) return [shadeRgb(base, 0.78), 0.4];
            return null;
        };
        ramp.greying = greying;
        ramp.light = mx;
        return ramp;
    }

    function buildCap(H, hair, m, layer, ramp) {
        const surf = cutSurface(H, scalpField(H, hair, layer.zone));
        const soft = 10;
        // Its edge runs out through the strand picture toward the tips, where only scattered strands are
        // left, so the hairline breaks up into single hairs over the scalp painted under it, never a cut
        // edge; its color is the locks' own middle, so no darker scalp shows between them.
        // Light hair shows the cap between its locks: there its shade is the locks' own, so no darker patches show.
        addShell(m, surf, i => layer.thickness * smooth(0, soft, surf.val[i]), () => ramp(ramp.light > 0.3 ? 0.6 : 0.4, ramp.light > 0.3 ? 1 : 0.97, false),
            i => [0.125 + 0.06 * Math.sin((surf.pos[i][0] + surf.pos[i][2]) * 260), 0.02 + 0.62 * Math.pow(1 - smooth(0, soft * 0.5, surf.val[i]), 2)]);
        return surf;
    }

    function buildStrands(H, hair, m, layer, ramp, rand) {
        const surf = cutSurface(H, scalpField(H, hair, layer.zone));
        // A third more locks than a style names: with the crossing strips shortened, the same triangles.
        const roots = scatter(surf, Math.round(layer.count * 1.35 * H.budget * hair.density), rand);
        for (const r of roots) {
            if (r.f < 1.5) continue;
            const c = headCoords(H, r.p);
            const dir = layer.comb(r.p, r.n, c, rand);
            // Locks of their own lengths: a cut is never ruled, and long hair is layered.
            const length = layer.length(c, rand) * (0.78 + 0.4 * rand());
            if (length < 0.004) continue;
            const lift = typeof layer.lift === 'function' ? layer.lift(c) : layer.lift;
            const fringe = layer.fringe || layer.fringeAll;
            // Under a long beard the hair falls behind the shoulders, so beard and hair stay apart on the chest.
            const longBeard = ['longBeard', 'wizardBeard', 'braidedBeard'].includes(hair.facial.style);
            const front = !longBeard && ((layer.drape === 'split' && Math.abs(c.az) > 30 && Math.abs(c.az) < 100 && rand() < 0.75) || !!layer.frontDrape);
            let pts = grow(H, r.p, r.n, dir, {
                steps: layer.steps, length, layer: layer.layer * (0.6 + 0.8 * rand()), lift, gravity: layer.gravity, stiff: layer.stiff,
                hug: layer.hug, release: H.earBottom, fringe, stopY: layer.stopY ? layer.stopY(c) - rand() * (layer.fringe ? 0.005 : 0.018) * H.scale : null,
                front,
                bias: front ? mul(AXIS.front, 0.25) : longBeard && Math.abs(c.az) > 35 ? mul(AXIS.back, 1.1) : (Math.abs(c.az) > 60 ? mul(AXIS.back, 0.6) : null)
            });
            if (layer.inCurl && pts.length > 3) {
                // Ends turned under (a bob): the last points move toward the neck.
                const k = pts.length;
                for (let i = Math.floor(k * 0.7); i < k; i++) { const t = (i - k * 0.7) / (k * 0.3); pts[i] = lerp(pts[i], [H.center[0] + (pts[i][0] - H.center[0]) * 0.85, pts[i][1] + 0.004 * H.scale * t, H.center[2] + (pts[i][2] - H.center[2]) * 0.85], layer.inCurl * t); }
            }
            if (layer.waves) pts = curlStrand(H, pts, layer.waves * H.scale * hair.length, (layer.wavePeriod || 0.08) * H.scale * (0.85 + 0.3 * rand()), false, rand() * 6.28);
            // Curl waves each lock in its own plane: twisted round a helix, a flat card reads as a row of tiles.
            const curlAmt = (layer.curl ? layer.curl.amount : 0) + hair.curl * 0.01 * H.scale;
            if (curlAmt > 0) pts = curlStrand(H, pts, curlAmt, (layer.curl ? layer.curl.period : 0.04 * H.scale) * (0.85 + 0.3 * rand()), false, rand() * 6.28);
            if (hair.frizz > 0) pts = curlStrand(H, pts, hair.frizz * 0.006 * H.scale, 0.018 * H.scale, true, rand() * 6.28);
            // Lock-to-lock lightness: light hair shows every difference, so it varies less.
            const variance = 1 + (rand() - 0.5) * (ramp.light > 0.3 ? 0.14 : 0.3);
            const highlight = rand() < hair.highlights * 0.5, lock = ramp.lock(rand);
            // Near the hairline the locks are narrower and drawn from past the picture's full root, so the
            // edge breaks up into hairs instead of blocks.
            const edge = smooth(1.5, 9, r.f);
            // At the hairline a lock grows from a point, so the locks' roots there are a scatter, not stair steps.
            const rootW = 0.4 + 0.6 * edge;
            addClump(m, pts, { H, single: layer.single, taper: t => (rootW + (1 - rootW) * smooth(0, 0.2, t)) * (1 - Math.pow(t, 1.6) * 0.7), width: layer.width * hair.strandWidth * (0.75 + 0.5 * rand()) * (0.8 + 0.4 * hair.volume) * (0.5 + 0.5 * edge), flat: 0.35, sides: layer.sides || 3, center: H.center, vFrom: 0.01 + 0.2 * (1 - edge), color: t => ramp(t, variance, highlight, lock) });
            // Flyaways: here and there at the hairline, and now and then over the head, a few stray hairs
            // lift off the lock and wander, so the edge of the hair is never a clean line.
            if (rand() < (edge < 0.7 ? 0.22 : 0.05) && pts.length > 2) {
                const flyLength = Math.min(length, (0.025 + 0.04 * rand()) * H.scale);
                const stray = grow(H, r.p, r.n, norm(add(dir, mul(norm([rand() - 0.5, rand() * 0.6, rand() - 0.5]), 0.9))), {
                    steps: 4, length: flyLength, layer: layer.layer * 1.6, lift: 0.45, gravity: 0.1, stiff: 0.5, hug: 0.2, release: H.earBottom, fringe: true, front: false
                });
                addCard(m, stray, { width: 0.0035 * H.scale, single: true, center: H.center, vFrom: 0.45, color: t => ramp(0.4 + 0.6 * t, variance * 1.05, highlight, lock) });
            }
        }
    }

    /**
     * A curtain under long hair: strands grown from a ring just inside the
     * hairline, the neighbors' paths joined into one sheet, so the hair has
     * mass and nothing shows between the clumps.
     */
    function buildSheet(H, hair, m, layer, ramp, rand) {
        const ring = 56, guides = [];
        for (let k = 0; k < ring; k++) {
            const az = -180 + (360 * (k + 0.5)) / ring;
            if (Math.abs(az) < 62) { guides.push(null); continue; }
            const el = hairlineAt(az, hair.hairline) + 7;
            const { p, n } = scalpPoint(H, az, el, 0);
            const c = headCoords(H, p);
            if (layer.zone && layer.zone(c) <= 0) { guides.push(null); continue; }
            const pts = grow(H, p, n, layer.comb(p, n, c, rand), {
                steps: layer.steps, length: layer.length(c, rand), layer: layer.layer * 0.8, lift: typeof layer.lift === 'function' ? layer.lift(c) : layer.lift,
                gravity: layer.gravity, stiff: layer.stiff, hug: layer.hug, release: H.earBottom, fringe: false,
                // A cut line is never ruled: each lock ends a little higher or lower.
                stopY: layer.stopY ? layer.stopY(c) - rand() * 0.012 : null, front: false,
                bias: ['longBeard', 'wizardBeard', 'braidedBeard'].includes(hair.facial.style) && Math.abs(c.az) > 35 ? mul(AXIS.back, 1.1) : Math.abs(c.az) > 60 ? mul(AXIS.back, 0.6) : null
            });
            // Under wavy hair the curtain waves too, its phase running smoothly round the head, so the back is
            // not one flat sheet behind the locks.
            const waved = layer.waves && pts.length === layer.steps + 1 ? curlStrand(H, pts, layer.waves * H.scale * hair.length * 0.8, (layer.wavePeriod || 0.08) * H.scale, false, k * 0.45) : pts;
            guides.push(pts.length === layer.steps + 1 ? waved : null);
        }
        const gap = 0.045 * H.scale;
        const col = (t, lock) => shadeRgb(ramp(t, 0.8, false, lock), 0.92);
        for (let k = 0; k < ring; k++) {
            const a = guides[k], b = guides[(k + 1) % ring];
            if (!a || !b) continue;
            const base = m.pos.length / 3, lock = ramp.lock(rand);
            let rows = 0;
            for (let i = 0; i < a.length; i++) {
                if (len(sub(a[i], b[i])) > gap) break;
                const t = i / (a.length - 1);
                let out = hairOut(H.center, lerp(a[i], b[i], 0.5));
                if (a[i][1] < H.chin[1]) { const sf = H.surface(lerp(a[i], b[i], 0.5)); if (Number.isFinite(sf.d) && sf.d < 0.04 * H.scale) out = norm(lerp(out, sf.n, 0.7 * (1 - smooth(0.015, 0.04, sf.d / H.scale)))); }
                // On the strand picture (the middle of a lane, clear of its thinned sides), so the sheet's
                // ends and edges break up into hair like the locks over it.
                const u0 = (k % 4) * 0.25 + 0.06;
                pushVert(m, a[i], out, col(t, lock), [u0, t * 0.98 + 0.01]);
                pushVert(m, b[i], out, col(t, lock), [u0 + 0.13, t * 0.98 + 0.01]);
                rows++;
            }
            for (let i = 0; i + 1 < rows; i++) {
                const v = base + i * 2;
                m.idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
            }
        }
    }

    function buildSpikes(H, hair, m, layer, ramp, rand) {
        const surf = cutSurface(H, scalpField(H, hair, layer.zone));
        const roots = layer.row ? [] : scatter(surf, layer.count * 3, rand);
        const list = [];
        if (layer.row) {
            // A row over the middle of the head: up the forehead to the crown, then down the back.
            for (let i = 0; i < layer.count; i++) {
                const t = i / (layer.count - 1);
                const { p, n } = scalpPoint(H, t < 0.45 ? 0 : 180, t < 0.45 ? mix(42, 90, t / 0.45) : mix(90, -20, (t - 0.45) / 0.55), 0.003 * H.scale);
                list.push({ p, n, c: headCoords(H, p), scale: 1 - 0.5 * Math.abs(t - 0.4) });
            }
        } else {
            for (const r of roots) {
                if (r.f < 4) continue;
                if (list.length >= layer.count) break;
                const c = headCoords(H, r.p);
                if (layer.front && Math.abs(c.az) > 60) continue;
                if (!layer.front && list.some(o => len(sub(o.p, r.p)) < layer.width * 0.55)) continue;
                list.push({ p: r.p, n: r.n, c, scale: 0.7 + 0.5 * rand() });
            }
        }
        for (const s of list) {
            let dir = norm(add(mul(s.n, 1), mul(AXIS.up, layer.up)));
            if (layer.anime) dir = norm(add(add(s.n, mul(AXIS.back, 0.6)), mul(AXIS.up, 0.25 * (s.c.el / 90))));
            if (layer.front) dir = norm(add(add(mul(AXIS.front, 0.7), mul(AXIS.down, 1)), mul([s.c.x, 0, 0], 1.2)));
            const length = layer.length * s.scale * (0.8 + 0.4 * rand());
            const steps = 6, pts = [s.p];
            let d = dir;
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                d = norm(add(d, mul(AXIS.down, layer.anime ? 0.12 * t : 0.03)));
                let p = add(pts[i - 1], mul(d, length / steps));
                if (layer.front) { const sf = H.surface(p); if (Number.isFinite(sf.d) && sf.d < 0.006 * H.scale) p = add(p, mul(sf.n, 0.006 * H.scale - sf.d)); }
                pts.push(p);
            }
            const variance = 0.88 + 0.24 * rand();
            addClump(m, pts, { width: layer.width * s.scale, flat: layer.anime || layer.front ? 0.45 : 0.8, sides: 4, center: H.center, taper: t => 1 - t * 0.97, color: t => ramp(t, variance, false) });
        }
    }

    /**
     * Short strands standing out of the cap: each a fine card a little off
     * the scalp, combed `comb`, standing `stand` (0 lying, 1 upright), coiled
     * `coil` (meters round), its tip thinning to a few hairs; thousands of
     * them over the head make a soft, even pile with a fuzzy outline.
     */
    function buildCoils(H, hair, m, layer, ramp, rand) {
        const surf = cutSurface(H, scalpField(H, hair, layer.zone));
        const roots = scatter(surf, Math.round(layer.count * H.budget * hair.density), rand);
        for (const r of roots) {
            if (r.f < 1) continue;
            const c = headCoords(H, r.p), edge = smooth(1, 8, r.f);
            // Sparser toward the hairline, so it thins into the skin instead of ending in a line.
            if (rand() > 0.35 + 0.65 * smooth(1, 10, r.f)) continue;
            const dir = norm(add(mul(layer.comb(r.p, r.n, c, rand), 1 - layer.stand), mul(r.n, layer.stand)));
            const L = layer.length(c, rand) * (0.6 + 0.7 * rand()) * (0.5 + 0.5 * edge);
            const side = norm(cross(dir, r.n)), up = norm(cross(side, dir)), ph = rand() * 6.28, turns = 0.6 + 0.8 * rand();
            const start = add(r.p, mul(r.n, 0.002 * H.scale));
            const pts = [];
            for (let i = 0; i <= 4; i++) {
                const t = i / 4, a = ph + t * turns * 6.28, k = layer.coil * Math.min(1, t * 2);
                let p = add(add(add(start, mul(dir, L * t)), mul(side, Math.cos(a) * k)), mul(up, Math.sin(a) * k));
                if (layer.stopY) { const sy = layer.stopY(c); if (p[1] < sy && r.p[1] > sy) p = [p[0], sy, p[2]]; }
                pts.push(p);
            }
            const variance = 0.8 + 0.4 * rand(), lock = ramp.lock(rand);
            addCard(m, pts, { width: layer.width * hair.strandWidth * (0.7 + 0.6 * rand()), single: true, center: H.center, vFrom: 0.25 + 0.2 * (1 - edge), taper: t => 1 - 0.5 * t, color: t => ramp(0.35 + 0.6 * t, variance, false, lock) });
        }
    }

    function buildAfro(H, hair, m, layer, rand) {
        // The scalp and its edges, then every point pushed out to a round mass centered above and behind the
        // skull's middle, so the sides and back fill in and the face stays clear.
        // Reaching lower than other styles, it leaves the whole ear bare, not only its middle.
        const surf = cutSurface(H, scalpField(H, hair, (c, v) => (H.ears[v] ? -12 : c.el - hairlineAt(c.az, hair.hairline) + 4)));
        const ramp = colorRamp(hair);
        const R = layer.radius;
        const center = add(H.center, [0, H.radii[1] * 0.28, -H.radii[2] * 0.12]);
        const size = [H.radii[0] + R, H.radii[1] * 0.75 + R, H.radii[2] + R * 0.9];
        // Coils: a fine, even texture of tight curls in the mass's color (no dents in its shape).
        const freq = 1 / (0.0045 * H.scale);
        const coil = p => {
            const x = p[0] * freq, y = p[1] * freq, z = p[2] * freq;
            return 0.5 + 0.25 * Math.sin(x * 1.7 + Math.cos(y * 1.3) * 2) * Math.cos(z * 1.9 + Math.sin(x) * 2) + 0.25 * Math.sin(y * 2.3 + z * 0.7 + Math.cos(x * 0.9) * 2);
        };
        // How far in from the hairline a place is, against the scalp's middle (the field's scale differs by head).
        const sorted = Array.from(surf.val).sort((x, y) => x - y), deep = Math.max(1, sorted[Math.floor(sorted.length * 0.9)]);
        const inward = v => Math.min(1, v / deep);
        const shellAt = (p, nrm, f) => {
            const d = norm(sub(p, center));
            // Where a ray from the mass's center leaves the ellipsoid, never inside the head.
            const k = 1 / Math.hypot(d[0] / size[0], d[1] / size[1], d[2] / size[2]);
            const reach = Math.max(0, dot(sub(add(center, mul(d, k)), p), nrm));
            const hc = headCoords(H, p);
            // At the hairline the mass curls down to the scalp; over the forehead the slope is long, so no ledge.
            const edge = smooth(0, mix(0.18, 0.5, smooth(20, 0, Math.abs(hc.az)) * smooth(0, 0.5, hc.z)), inward(f));
            // Below the ears it thins to a close crop: the sideburns and nape do not flare.
            const low = smooth(-38, 2, hc.el), front = mix(1, 0.8, smooth(0.3, 0.8, hc.z));
            const q = add(p, mul(nrm, (0.004 * H.scale + reach * front * low) * edge));
            // Lit as the round mass it is, blending to the scalp's own facing at its edge.
            const g = sub(q, center), en = norm([g[0] / (size[0] * size[0]), g[1] / (size[1] * size[1]), g[2] / (size[2] * size[2])]);
            return { q, n: norm(lerp(nrm, en, edge * low)), edge, low, hc };
        };
        const base = m.pos.length / 3, lightness = Math.max(...linear(hair.color));
        for (let i = 0; i < surf.pos.length; i++) {
            const s = shellAt(surf.pos[i], surf.nrm[i], surf.val[i]);
            // On light hair the coils need more contrast to read at all.
            pushVert(m, s.q, s.n, ramp(0.5, lightness > 0.3 ? 0.5 + 0.48 * coil(surf.pos[i]) : 0.62 + 0.3 * coil(surf.pos[i]), false));
        }
        for (let t = 0; t < surf.index.length; t += 3) m.idx.push(base + surf.index[t], base + surf.index[t + 1], base + surf.index[t + 2]);
        // A fuzz of short coiled strands standing out of the mass all over, so its outline is soft.
        // Light hair shows each fuzz card as a pale fleck: the lighter the hair, the fewer stand out.
        const roots = scatter(surf, Math.round(1100 * H.budget * hair.density * (1 - 0.4 * smooth(0.15, 0.6, lightness))), rand);
        for (const r of roots) {
            const s = shellAt(r.p, r.n, r.f);
            if (s.edge < 0.25) continue;
            const out = s.n, L = (0.008 + 0.012 * rand()) * H.scale * (0.6 + 0.4 * s.low);
            const side = norm(cross(out, Math.abs(out[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), ph = rand() * 6.28;
            const pts = [];
            for (let i = 0; i <= 4; i++) {
                const t = i / 4;
                pts.push(add(add(s.q, mul(out, L * t - 0.002 * H.scale)), mul(side, Math.sin(ph + t * 5) * 0.0025 * H.scale * t)));
            }
            // Fine: on light hair a broad fuzz card shows as a pale shard.
            const lock = ramp.lock(rand), tone = 0.6 + 0.3 * rand();
            addCard(m, pts, { width: (0.003 + 0.002 * rand()) * H.scale, single: true, center: center, vFrom: 0.55, taper: t => 1 - 0.6 * t, color: t => ramp(0.5, tone * 0.9, false, lock) });
        }
    }

    function buildTail(H, hair, m, layer, ramp, rand) {
        const surf = cutSurface(H, scalpField(H, hair));
        const ties = layer.ties.map(([az, el]) => scalpPoint(H, az, el, 0.006 * H.scale));
        const roots = scatter(surf, 260, rand);
        // Hair swept to each tie over the scalp.
        for (const r of roots) {
            if (r.f < 2) continue;
            const c = headCoords(H, r.p);
            let tie = ties[0];
            if (ties.length > 1) tie = c.x >= 0 === (ties[0].p[0] >= H.center[0]) ? ties[0] : ties[1];
            const pts = gather(H, r.p, tie.p, (0.003 + 0.004 * rand()) * H.scale, 8);
            const variance = 0.85 + 0.3 * rand();
            addClump(m, pts, { width: 0.02 * H.scale, flat: 0.3, sides: 3, center: H.center, taper: t => 1 - t * 0.6, color: t => ramp(0.2 * t, variance, false) });
        }
        for (const tie of ties) {
            // The tail's own line: out from the head, then down.
            // A tie at the back sends its tail out and down; one at the side mostly down.
            const side = Math.abs(tie.n[0]);
            const out = norm(add(add(mul(tie.n, 0.7 - 0.35 * side), mul(AXIS.down, 0.5 + 0.6 * side)), mul(AXIS.back, 0.2 * side)));
            const steps = 14, seg = layer.length / steps;
            const spine = [add(tie.p, mul(tie.n, layer.radius * 0.4))];
            let d = out;
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                d = norm(add(mul(d, 1 - 0.55 * smooth(0, 0.35, t)), mul(AXIS.down, 0.55 * smooth(0, 0.35, t))));
                let p = add(spine[i - 1], mul(d, seg));
                for (let k = 0; k < 2; k++) { const s = H.surface(p); if (Number.isFinite(s.d) && s.d < layer.radius) p = add(p, mul(s.n, layer.radius - s.d)); }
                spine.push(p);
                d = norm(sub(p, spine[i - 1]));
            }
            const radius = t => layer.radius * (0.55 + 0.6 * Math.sin(Math.min(1, t * 2.2 + 0.2) * Math.PI * 0.8)) * (1 - 0.7 * t);
            const count = 46;
            for (let k = 0; k < count; k++) {
                const ang = rand() * Math.PI * 2, f = Math.sqrt(rand());
                const phase = rand() * 6.28;
                const pts = spine.map((p, i) => {
                    const t = i / steps;
                    const T = norm(sub(spine[Math.min(steps, i + 1)], spine[Math.max(0, i - 1)]));
                    const B = norm(cross(T, AXIS.left)), N = cross(B, T);
                    const r = radius(t) * f + hair.curl * 0.008 * H.scale * Math.sin(t * 14 + phase);
                    return add(p, add(mul(B, Math.cos(ang) * r), mul(N, Math.sin(ang) * r)));
                });
                const variance = 0.85 + 0.3 * rand();
                const highlight = rand() < hair.highlights * 0.5;
                addClump(m, pts, { width: 0.018 * H.scale, flat: 0.4, sides: 4, center: H.center, outAt: (p, i) => norm(sub(p, spine[i])), color: t => ramp(0.2 + 0.8 * t, variance, highlight) });
            }
            addTie(H, m, spine[0], norm(sub(spine[1], spine[0])), layer.radius * 0.75);
        }
    }

    /** A band where hair is tied. */
    function addTie(H, m, c, axis, r) {
        const col = [0.05, 0.05, 0.06];
        const pts = [];
        const up = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const B = norm(cross(axis, up)), N = cross(B, axis);
        for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; pts.push(add(c, add(mul(B, Math.cos(a) * r), mul(N, Math.sin(a) * r)))); }
        addTube(m, pts, () => 0.0045 * H.scale * 2 / 2, () => col, 5);
    }

    function buildBun(H, hair, m, layer, ramp, rand) {
        const surf = cutSurface(H, scalpField(H, hair));
        const tie = scalpPoint(H, layer.tie[0], layer.tie[1], 0.006 * H.scale);
        for (const r of scatter(surf, 260, rand)) {
            if (r.f < 2) continue;
            const pts = gather(H, r.p, tie.p, (0.003 + 0.004 * rand()) * H.scale, 8);
            const variance = 0.85 + 0.3 * rand();
            addClump(m, pts, { width: 0.02 * H.scale, flat: 0.3, sides: 3, center: H.center, taper: t => 1 - t * 0.6, color: t => ramp(0.2 * t, variance, false) });
        }
        const R = layer.radius;
        const c = add(tie.p, mul(tie.n, R * 0.8));
        const col = ramp(0.45, 0.95, false);
        addBlob(m, c, [R, R * (layer.knot ? 1.1 : 0.8), R], col, rand, 0.1);
        // Wraps around the bun.
        const axis = tie.n;
        const up = Math.abs(axis[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const B = norm(cross(axis, up)), N = cross(B, axis);
        for (let k = 0; k < 7; k++) {
            const tilt = (k / 7) * Math.PI, pts = [];
            for (let i = 0; i <= 16; i++) {
                const a = (i / 16) * Math.PI * 1.8 + k;
                const dir = add(mul(add(mul(B, Math.cos(tilt)), mul(axis, Math.sin(tilt) * 0.6)), Math.cos(a)), mul(N, Math.sin(a)));
                pts.push(add(c, mul(norm(dir), R * 1.02)));
            }
            const variance = 0.85 + 0.25 * rand();
            addClump(m, pts, { width: R * 0.5, flat: 0.35, sides: 4, center: c, taper: t => 1 - 0.6 * Math.abs(t - 0.5), color: () => shadeRgb(col, variance) });
        }
        if (layer.knot) {
            // The top knot's tuft.
            for (let k = 0; k < 10; k++) {
                const start = add(c, mul(axis, R * 0.8));
                const d = norm(add(axis, [(rand() - 0.5) * 0.8, 0, (rand() - 0.5) * 0.8]));
                const pts = [start, add(start, mul(d, 0.03 * H.scale)), add(start, add(mul(d, 0.055 * H.scale), [0, -0.01 * H.scale, 0]))];
                addClump(m, pts, { width: 0.012 * H.scale, flat: 0.5, sides: 3, center: c, color: t => ramp(0.5 + t * 0.5, 0.9, false) });
            }
        }
        addTie(H, m, add(tie.p, mul(tie.n, R * 0.05)), tie.n, R * 0.55);
    }

    function buildBraid(H, hair, m, layer, ramp, rand) {
        const surf = cutSurface(H, scalpField(H, hair));
        const ties = layer.ties.map(([az, el]) => scalpPoint(H, az, el, 0.006 * H.scale));
        for (const r of scatter(surf, 260, rand)) {
            if (r.f < 2) continue;
            const c = headCoords(H, r.p);
            let tie = ties[0];
            if (ties.length > 1) tie = (c.x >= 0) === (ties[0].p[0] >= H.center[0]) ? ties[0] : ties[1];
            const pts = gather(H, r.p, tie.p, (0.003 + 0.004 * rand()) * H.scale, 8);
            const variance = 0.85 + 0.3 * rand();
            addClump(m, pts, { width: 0.02 * H.scale, flat: 0.3, sides: 3, center: H.center, taper: t => 1 - t * 0.6, color: t => ramp(0.2 * t, variance, false) });
        }
        for (const tie of ties) {
            const steps = 40, seg = layer.length / steps;
            const spine = [add(tie.p, mul(tie.n, layer.radius * 0.6))];
            let d = norm(add(tie.n, mul(AXIS.down, 1.4)));
            for (let i = 1; i <= steps; i++) {
                d = norm(add(mul(d, 0.8), mul(AXIS.down, 0.2)));
                let p = add(spine[i - 1], mul(d, seg));
                for (let k = 0; k < 2; k++) { const s = H.surface(p); if (Number.isFinite(s.d) && s.d < layer.radius * 1.2) p = add(p, mul(s.n, layer.radius * 1.2 - s.d)); }
                spine.push(p);
                d = norm(sub(p, spine[i - 1]));
            }
            const R = layer.radius;
            const period = R * 4.2;
            for (let k = 0; k < 3; k++) {
                const pts = spine.map((p, i) => {
                    const t = (i / steps) * layer.length / period * Math.PI * 2 + (k * Math.PI * 2) / 3;
                    const T = norm(sub(spine[Math.min(steps, i + 1)], spine[Math.max(0, i - 1)]));
                    const B = norm(cross(T, AXIS.back)), N = cross(B, T);
                    const taper = 1 - 0.45 * (i / steps);
                    return add(p, add(mul(B, Math.sin(t) * R * 0.55 * taper), mul(N, Math.sin(2 * t) * R * 0.22 * taper)));
                });
                const col = ramp(0.5, 0.88 + 0.1 * k, false);
                addTube(m, pts, t => R * 0.55 * (1 - 0.45 * t) * (0.85 + 0.15 * Math.abs(Math.sin(t * layer.length / period * Math.PI * 6))), t => shadeRgb(col, 0.9 + 0.1 * Math.sin(t * 60)), 6);
            }
            const end = spine[steps];
            addTie(H, m, end, norm(sub(spine[steps], spine[steps - 1])), R * 0.4);
            // The tassel past the tie.
            for (let k = 0; k < 9; k++) {
                const a = (k / 9) * Math.PI * 2;
                const off = [Math.cos(a) * R * 0.25, 0, Math.sin(a) * R * 0.25];
                const pts = [add(end, off), add(end, add(mul(off, 1.6), [0, -0.035 * H.scale, 0])), add(end, add(mul(off, 1.9), [0, -0.06 * H.scale, 0]))];
                addClump(m, pts, { width: R * 0.45, flat: 0.5, sides: 3, center: end, color: t => ramp(0.8 + 0.2 * t, 0.95, false) });
            }
        }
    }

    function buildLocks(H, hair, m, layer, ramp, rand) {
        const surf = cutSurface(H, scalpField(H, hair));
        const roots = scatter(surf, layer.count * 2, rand);
        const used = [];
        for (const r of roots) {
            if (r.f < 3 || used.length >= layer.count) continue;
            if (used.some(p => len(sub(p, r.p)) < layer.radius * 2.2)) continue;
            used.push(r.p);
            const c = headCoords(H, r.p);
            const length = layer.length * (0.75 + 0.5 * rand()) * (c.z > 0.4 ? 0.55 : 1);
            const pts = grow(H, r.p, r.n, combFromPart(H, { part: 'center' }, r.p, r.n, c), {
                steps: 14, length, layer: layer.radius * 1.1, lift: 0.35, gravity: 0.7, stiff: 0.25, hug: 0.5, release: H.earBottom,
                fringe: false, bias: Math.abs(c.az) > 60 ? mul(AXIS.back, 0.6) : null
            });
            const variance = 0.8 + 0.35 * rand();
            const bumps = 10 + rand() * 6;
            addTube(m, pts, t => layer.radius * (0.9 + 0.12 * Math.sin(t * bumps * Math.PI)) * (1 - 0.35 * t), t => ramp(0.2 + 0.8 * t, variance * (0.92 + 0.08 * Math.sin(t * bumps * 3)), false), 6);
        }
    }

    // ── facial hair ────────────────────────────────────────────────────────
    /** `open` false: the zone runs right up to the lips (the skin under a beard), not round an open mouth. */
    function facialField(H, style, open = true) {
        const rx = H.radii[0];
        const noseBase = mix(H.lipTop, H.noseTip[1], 0.55);
        const mouthY = (H.lipTop + H.lipBottom) / 2;
        const lipH = Math.max(0.004, (H.lipTop - H.lipBottom) / 2);
        const lipW = H.lipHalf * 1.12;
        return v => {
            const p = H.P(v);
            if (H.ears[v] || H.earCore[v]) return -10;
            const x = Math.abs(p[0] - H.center[0]);
            const ax = x / rx;
            // The mouth's inside (the body mesh carries it behind the lips) is never bearded: there the
            // skin faces the head's middle instead of away from it.
            // Below the lower lip the skin is the chin's, bearded right up to the lip.
            const nrm = [H.normals[v * 3], H.normals[v * 3 + 1], H.normals[v * 3 + 2]];
            if (x < H.lipHalf * 1.4 && p[1] > H.lipBottom - 0.003 * H.scale && p[1] < H.noseTip[1] && p[2] < H.lipFront - 0.02 * H.scale && dot(nrm, [0, 0, 1]) < 0.5) return -10;
            if (dot(nrm, norm(sub(p, H.center))) < 0.05 && p[1] > H.chin[1]) return -10;
            // Only the front of the head and neck, in front of the ears; at the sideburn's back the zone fades
            // over a few millimeters, unevenly, instead of ending in a straight line.
            const backLimit = H.earBack + (H.earFront - H.earBack) * 0.55 + (Math.sin(p[1] * 700) * 0.6 + Math.sin(p[1] * 1900 + 1.3) * 0.4) * 0.004 * H.scale;
            if (p[2] < backLimit - 0.006 * H.scale) return -10;
            const behind = (p[2] - backLimit) / H.radii[2] * 45;
            // The cheek line runs from beside the nose out and up to the sideburn's foot by the ear's lobe;
            // only the sideburn itself, a strip just in front of the ear, climbs toward the ear's top.
            // Measured front to back, from the lips (0) to the ear's front (1): the cheekbone is as wide as
            // the sideburn, but well forward of it.
            const back = clamp((H.lipFront - p[2]) / Math.max(1e-6, H.lipFront - H.earFront), 0, 1);
            const diag = mix(noseBase - (noseBase - mouthY) * 0.1, mix(H.earBottom, H.earTop, 0.3), smooth(0.25, 0.9, back) * smooth(0.2, 0.55, ax));
            // The sideburn joins the cheek line in a gentle curve, not a step.
            const cheekLine = mix(diag, H.earTop + H.radii[1] * 0.05, smooth(0.72, 1.0, back) * smooth(0.55, 0.85, ax));
            const above = (cheekLine - p[1]) / H.radii[1] * 60;
            const neckLine = H.neckBone.head[1] + (H.headBone.head[1] - H.neckBone.head[1]) * 0.08;
            const below = (p[1] - neckLine) / H.radii[1] * 60;
            // The mouth stays open: an ellipse around the lips.
            const mx = x / (lipW * 0.93), my = (p[1] - mouthY) / (lipH * 0.98);
            const mouthOut = open ? (Math.hypot(mx, my) - 1) * 6 : Infinity;
            let f = Math.min(above, below, mouthOut, behind);
            // A mustache's shape: under the nose its top follows the nostrils down toward the mouth's corners,
            // and its ends round off past them, so it is never a rectangle.
            const mx2 = Math.min(1.3, x / (lipW * 1.15));
            const mustacheTop = noseBase - (noseBase - H.lipTop) * 0.55 * mx2 * mx2, mustacheLow = H.lipTop + lipH * 0.05 - lipH * 0.6 * smooth(0.7, 1.1, mx2);
            const mustacheBand = Math.min((mustacheTop - p[1]) / H.radii[1] * 60, (p[1] - mustacheLow) / H.radii[1] * 60, (lipW * 1.15 - x) / rx * 60 + (1 - mx2 * mx2) * 2);
            const chinZone = (lipW * 1.4 - x) / rx * 60;
            switch (style) {
                case 'soulPatch': f = Math.min(f, (lipW * 0.5 - x) / rx * 60, (H.lipBottom - 0.002 * H.scale - p[1]) / H.radii[1] * 60, (p[1] - (H.chin[1] + 0.012 * H.scale)) / H.radii[1] * 60); break;
                case 'anchorBeard': f = Math.max(mustacheBand, Math.min(f, (lipW * 1.5 - x) / rx * 60, (H.lipBottom - p[1]) / H.radii[1] * 60, (H.chin[1] + 0.03 * H.scale + x * 0.25 - p[1]) / H.radii[1] * 60)); break;
                case 'chinCurtain': f = Math.min(f, (H.lipBottom - 0.008 * H.scale - p[1]) / H.radii[1] * 60); break;
                case 'sideburns': f = Math.min(f, (ax - 0.65) * 40, (p[1] - H.earBottom + 0.01 * H.scale) / H.radii[1] * 60); break;
                case 'chevron': f = Math.min(mustacheBand, (p[1] - H.lipTop - lipH * 0.5 + x * 0.13) / H.radii[1] * 60); break;
                case 'goatee': f = Math.max(Math.min(f, chinZone, (mouthY + lipH - p[1]) / H.radii[1] * 60, (p[1] - (H.chin[1] - 0.012 * H.scale)) / H.radii[1] * 60), mustacheBand); break;
                case 'chinStrap': {
                    // A band along the jaw's edge, from the sideburns round the chin.
                    const edge = mix(H.chin[1] + 0.003 * H.scale, H.earBottom - 0.012 * H.scale, smooth(0.25, 0.95, ax));
                    f = Math.min(f, (p[1] - (edge - 0.009 * H.scale)) / H.radii[1] * 60, ((edge + 0.014 * H.scale) - p[1]) / H.radii[1] * 60);
                    break;
                }
                case 'muttonChops': f = Math.min(f, (x - lipW * 1.9) / rx * 60); break;
                case 'mustache': case 'pencil': case 'handlebar': case 'walrus': f = mustacheBand; if (style === 'pencil') f = Math.min(f, ((H.lipTop + lipH * 1.3) - p[1]) / H.radii[1] * 60); if (style === 'walrus') { const mid = (noseBase + H.lipTop) / 2, hh = (noseBase - H.lipTop) / 2 * 1.3; f = Math.max(mustacheBand, (1 - Math.hypot(x / (lipW * 1.4), (p[1] - mid) / hh)) * 14); } break;
                case 'horseshoe': f = Math.max(mustacheBand, Math.min((lipW * 1.4 - x) / rx * 60, (x - lipW * 0.95) / rx * 60, (noseBase - p[1]) / H.radii[1] * 60, (p[1] - (H.chin[1] - 0.004)) / H.radii[1] * 60)); break;
                default: f = Math.max(f, mustacheBand);
            }
            return f;
        };
    }

    /** Per pack vertex, how much the lip targets move it against their largest move (1 the lips' red, 0 off them). */
    function lipShare(pack) {
        if (pack._lipShare) return pack._lipShare;
        const out = new Float32Array(pack.vertexCount);
        for (const name of ['shape/upperLip-incr', 'shape/lowerLip-incr']) {
            const t = pack.targets.get(name);
            if (!t) continue;
            let max = 0;
            for (let i = 0; i < t.index.length; i++) max = Math.max(max, Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]));
            for (let i = 0; i < t.index.length; i++) out[t.index[i]] = Math.max(out[t.index[i]], Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]) / (max || 1));
        }
        return (pack._lipShare = out);
    }

    function buildCornrows(H, m, layer, ramp) {
        for (let row = 0; row < layer.rows; row++) {
            const x = (row / (layer.rows - 1) * 2 - 1) * 0.82;
            for (let strand = 0; strand < 3; strand++) {
                const points = [];
                for (let k = 0; k <= 40; k++) {
                    const t = k / 40, phi = 0.25 + t * 2.65;
                    const yz = Math.sqrt(1 - x * x), dy = Math.sin(phi) * yz, dz = Math.cos(phi) * yz;
                    const root = scalpPoint(H, Math.atan2(x, dz) * 180 / Math.PI, Math.asin(dy) * 180 / Math.PI, layer.radius * 1.3);
                    const twist = t * Math.PI * 22 + strand * Math.PI * 2 / 3;
                    const across = norm(cross(root.n, [0, 1, 0]));
                    points.push(add(root.p, add(mul(across, Math.cos(twist) * layer.radius * 0.6), mul(root.n, Math.sin(twist) * layer.radius * 0.6))));
                }
                addTube(m, points, () => layer.radius * 0.5, t => ramp(t * 0.2, 0.9 + strand * 0.08, false), 5);
            }
        }
    }

    function buildFacial(H, hair, m, rand, skin) {
        const f = hair.facial;
        if (f.style === 'none') return;
        const S = H.scale;
        // Stubble is skin darkened by the hair under it, not a beard.
        const color = f.style === 'stubble' ? mixHex(skin || '#c69c7f', f.color || hair.color, 0.45) : (f.color || hair.color);
        const ramp = colorRamp({ color, tipColor: '', highlights: 0 });
        const surf = cutSurface(H, facialField(H, f.style));
        if (!surf.index.length) return;
        const V = f.volume, Lf = f.length;
        const thick = { stubble: 0.0008, goatee: 0.006, chinStrap: 0.004, shortBeard: 0.006, fullBeard: 0.012, longBeard: 0.014, wizardBeard: 0.016, braidedBeard: 0.013, muttonChops: 0.008, mustache: 0.006, pencil: 0.0025, handlebar: 0.006, walrus: 0.01, horseshoe: 0.007, soulPatch: 0.003, anchorBeard: 0.005, chinCurtain: 0.009, sideburns: 0.004, chevron: 0.007 }[f.style] * S * (0.6 + 0.8 * V);
        const freq = 1 / (0.006 * S);
        const lumps = p => 0.75 + 0.25 * Math.sin(p[0] * freq * 1.3 + Math.sin(p[1] * freq)) * Math.cos(p[2] * freq * 1.1 + p[1] * freq * 0.7);
        // Thicker toward the chin, thin at the cheek edge.
        const chinBoost = p => 1 + 0.9 * smooth(H.mouth[1], H.chin[1] - 0.01 * S, p[1]) * (f.style.includes('Beard') || f.style === 'fullBeard' ? 1 : 0.3);
        const stubble = f.style === 'stubble';
        // Thinner over the upper lip, so a heavy beard's mustache does not climb the nose.
        const lipThin = p => mix(1, Math.min(1, 0.006 * S / Math.max(thick, 1e-6)), smooth(H.lipBottom, H.lipTop + 0.004 * S, p[1]));
        // The beard's body: toward its edge it lies flatter and its color gives way to the skin's, as a beard
        // thins at the cheek, the neck and round the mouth; the hairs over it carry the strands.
        // How far in from the beard's edge a place is, against how far its middle is (the field's own scale
        // differs by style and face).
        // The skin under a beard is painted with the beard's own shade (RRCharacterSkin): where the beard
        // thins at its edge it gives way to that, not to bare skin, so no pale rim shows.
        const skinRgb = (() => { const sk = linear(skin || '#c69c7f'), hc = linear(color); return mixRgb(sk, sk.map((c, i) => Math.min(c, hc[i] * 1.25)), 0.55); })();
        const sorted = Array.from(surf.val).sort((a, b) => a - b), deep = Math.max(1, sorted[Math.floor(sorted.length * 0.9)]);
        const inward = v => Math.min(1, v / deep);
        // How deep inside the beard's outline a place is, the mouth not counted: at the lips the beard stays
        // dense right up to them (the cut round the mouth is its edge there, not a thinning outline).
        // Round the mouth the beard is always dense: the lips there are not its outline.
        const mouthY0 = (H.lipTop + H.lipBottom) / 2;
        const byMouth = p => 1 - smooth(H.lipHalf * 1.25, H.lipHalf * 1.9, Math.hypot(p[0] - H.center[0], (p[1] - mouthY0) * 1.6));
        const closed = facialField(H, f.style, false), outlineAt = p => { const v = H.nearest(p); return v < 0 ? 0 : inward(Math.max(0, closed(v))); };
        const outline = surf.pos.map(p => Math.max(byMouth(p), outlineAt(p)));
        // The body is low (the hairs over it carry the volume), so its edge never stands as a step.
        // Stubble is in the skin's own picture alone (its shadow and follicles): no geometry stands over it.
        if (stubble) return;
        // The beard's soft volume: two shells over the face, each carrying the strand picture, so the beard is
        // hair all through, never a solid. The inner one is dense (the picture's full roots well inside, its
        // sparse tips at the outline); the outer one stands off it and is drawn from the strands' gappy middle,
        // so light passes through the beard's surface and its outline is wispy.
        const shellUv = (i, from, reach) => [0.125 + 0.06 * Math.sin((surf.pos[i][0] * 1.7 + surf.pos[i][1]) * 330) + 0.25 * (Math.floor(Math.abs(surf.pos[i][0]) * 90) % 4),
            from + reach * Math.pow(1 - smooth(0, 0.7, outline[i]), 0.7)];
        const tone = i => 0.85 + 0.3 * lumps(surf.pos[i]);
        // Low at any edge (round the mouth too), so it never stands as a ledge over the lips.
        const height = i => thick * smooth(0, 0.7, inward(surf.val[i])) * lumps(surf.pos[i]) * chinBoost(surf.pos[i]) * lipThin(surf.pos[i]);
        addShell(m, surf, i => Math.max(0.0008 * S, height(i) * 0.35), i => mixRgb(skinRgb, ramp(0.55, tone(i), false), smooth(0.04, 0.85, outline[i]) * 0.92), i => shellUv(i, 0.02, 0.8));
        addShell(m, surf, i => height(i) * 0.8, i => ramp(0.7, tone(i) * 1.08, false), i => shellUv(i, 0.3, 0.55));
        // Round the mouth the beard runs right to the lips' red: a thin, dense layer of short hair over the strip
        // of skin the beard's cut leaves between them, so no bare skin shines there.
        if (f.style !== 'pencil') {
            const share = lipShare(H.pack), ring = cutSurface(H, v => {
                const p = H.P(v), near = byMouth(p);
                if (near < 0.05) return -1;
                // Never in the slot where the lips meet.
                const slot = Math.max((Math.abs(p[1] - mouthY0) / Math.max(1e-4, (H.lipTop - H.lipBottom) / 2) - 0.6) * 40, (Math.abs(p[0] - H.center[0]) / H.lipHalf - 0.95) * 40);
                return Math.min(closed(v) + 2, (0.42 - share[v]) * 60, (near - 0.05) * 40, slot);
            });
            if (ring.index.length) addShell(m, ring, i => 0.0005 * S + 0.0007 * S * smooth(0, 6, ring.val[i]), i => ramp(0.5, (0.85 + 0.3 * lumps(ring.pos[i])) * 0.95, false),
                i => [0.125 + 0.06 * Math.sin((ring.pos[i][0] * 1.7 + ring.pos[i][1]) * 330), 0.02 + 0.3 * (1 - smooth(0, 6, ring.val[i]))]);
        }
        // Locks over it: many fine, flat, overlapping cards (one strip each), laid along the jaw and falling
        // toward the chin; long styles hang below the chin in layers. Their lightness varies lock to lock,
        // and some catch the light, so the beard is never one flat dark.
        const long = { longBeard: 0.16, wizardBeard: 0.32, braidedBeard: 0.12, fullBeard: 0.05 }[f.style];
        const mustache = ['mustache', 'handlebar', 'walrus', 'horseshoe', 'goatee', 'fullBeard', 'longBeard', 'wizardBeard', 'braidedBeard', 'shortBeard', 'anchorBeard', 'chevron'].includes(f.style);
        const roots = scatter(surf, Math.round(Math.min(long ? 1500 : 1700, surf.index.length / 3 * 2.2) * H.budget), rand);
        for (const r of roots) {
            if (r.f < 0.3) continue;
            // Toward the beard's edge the hairs grow sparser, so it thins into the skin.
            const deepIn = outlineAt(r.p);
            if (rand() > smooth(0, 0.6, deepIn) * 0.65 + 0.35) continue;
            const isLip = r.p[1] > H.lipBottom && Math.abs(r.p[0] - H.center[0]) < H.lipHalf * 1.4 && r.p[1] < H.noseTip[1];
            if (isLip && r.p[2] < H.lipFront - 0.012 * S) continue;
            if (isLip && !mustache) continue;
            const sideX = Math.sign(r.p[0] - H.center[0]);
            let length, dir;
            if (isLip) {
                // A mustache combs down and out from the middle of the lip.
                length = (f.style === 'walrus' ? 0.022 : 0.013) * S * Lf * (0.8 + 0.4 * rand());
                dir = norm(add(mul(AXIS.down, 1), mul([sideX, 0, 0], 0.55 + 0.3 * Math.min(1, Math.abs(r.p[0] - H.center[0]) / H.lipHalf))));
            } else if (long) {
                // Layered: locks from under the chin fall longest, those from the cheeks shorter over them;
                // each a length of its own, all drawn in toward the beard's middle as they fall.
                const low = smooth(H.mouth[1], H.chin[1] - 0.005 * S, r.p[1]);
                length = (0.014 + long * low * (0.5 + 0.65 * rand())) * S * Lf;
                const inX = -sideX * smooth(0, H.lipHalf * 2.5, Math.abs(r.p[0] - H.center[0])) * 0.35;
                // Loose, not combed: each lock leans its own way.
                dir = norm(add(add(mul(AXIS.down, 1), mul(r.n, 0.3)), [inX + (rand() - 0.5) * 0.45, 0, (rand() - 0.5) * 0.25]));
            } else {
                // Along the jaw and down toward the chin, as a beard grows.
                length = 0.017 * S * Lf * (0.75 + 0.5 * rand());
                dir = norm(add(add(mul(AXIS.down, 1), mul(r.n, 0.12)), [-0.35 * sideX * smooth(H.mouth[1], H.chin[1], r.p[1]), 0, 0.15]));
            }
            if (f.style === 'pencil' || f.style === 'muttonChops' || f.style === 'chinStrap') length *= 0.6;
            // A mustache hangs to the lip, not over the mouth. A walrus covers the upper lip and droops a little
            // over the mouth, just past its corners at the sides.
            const corner = smooth(H.lipHalf * 0.7, H.lipHalf * 1.2, Math.abs(r.p[0] - H.center[0]));
            const stopY = !isLip ? null : f.style === 'walrus' ? mix(H.lipBottom + (H.lipTop - H.lipBottom) * 0.35, H.lipBottom - 0.004 * S, corner) - rand() * 0.002 * S : H.lipTop - (H.lipTop - H.lipBottom) * 0.2;
            const lowLong = long && r.p[1] < H.mouth[1];
            // Inner locks lie close; outer ones stand a little off them, so the beard has layers and depth.
            const outer = rand() < 0.5;
            let pts = grow(H, r.p, r.n, dir, { steps: lowLong ? 7 : 3, length: length * (outer ? 1 : 0.8), layer: thick * (outer ? 0.75 : 0.4), lift: outer ? 0.22 : 0.1, gravity: long ? 0.65 : 0.25, stiff: 0.3, hug: lowLong ? 0.35 : 0.9, release: H.chin[1], fringe: true, stopY, front: true });
            if (lowLong) pts = curlStrand(H, pts, (0.003 + 0.006 * rand()) * S * (1 - V * 0.3), (0.05 + 0.05 * rand()) * S, rand() < 0.4, rand() * 6);
            const light = rand() < 0.18 ? 1.3 : 1;
            const variance = ((outer ? 0.95 : 0.8) + 0.35 * rand()) * light;
            const edge = 0.45 + 0.55 * smooth(0, 0.35, deepIn), thin = smooth(0, 0.5, deepIn);
            // Toward the edge the locks thin to a few hairs over the skin: drawn from the picture's sparse
            // tips, and their color giving way to the skin's as so little hair covers it.
            addCard(m, pts, {
                H, roll: isLip ? 0 : undefined, width: (lowLong ? 0.009 : 0.0055) * S * edge * (0.7 + 0.6 * rand()), single: true, center: H.mouth, vFrom: lowLong ? 0.05 : 0.3 + 0.3 * (1 - thin),
                // Narrow where it grows, so the beard's edge (the sideburn's top, the cheek line) is a scatter of
                // roots, not a row of blunt card ends.
                taper: t => (0.45 + 0.55 * smooth(0, 0.3, t)) * (1 - Math.pow(t, 1.2) * 0.6), color: t => mixRgb(skinRgb, ramp(0.5 + 0.5 * t, variance, false), 0.55 + 0.45 * thin) });
        }
        if (f.style === 'handlebar') {
            for (const side of [1, -1]) {
                const startX = H.center[0] + side * H.lipHalf * 0.4;
                const pts = [];
                for (let i = 0; i <= 14; i++) {
                    const t = i / 14;
                    const x = startX + side * (H.lipHalf * 1.6 * t + 0.012 * S * Math.sin(t * Math.PI * 0.9) * t);
                    const y = H.lipTop + 0.003 * S - 0.006 * S * Math.sin(t * Math.PI * 0.6) + 0.02 * S * smooth(0.6, 1, t);
                    const z = H.lipFront + 0.004 * S - 0.012 * S * t * t;
                    pts.push([x, y, z]);
                }
                addTube(m, pts, t => 0.0045 * S * (1 - 0.8 * t) * (0.8 + 0.4 * V), () => ramp(0.4, 0.95, false), 6);
            }
        }
        if (f.style === 'braidedBeard') {
            const top = add(H.chin, [0, -0.01 * S, 0.004 * S]);
            const R = 0.009 * S;
            const steps = 24, length = 0.16 * S * Lf;
            for (let k = 0; k < 3; k++) {
                const pts = [];
                for (let i = 0; i <= steps; i++) {
                    const t = (i / steps) * length / (R * 4) * Math.PI * 2 + k * Math.PI * 2 / 3;
                    const y = top[1] - (i / steps) * length;
                    const z = top[2] - 0.15 * (i / steps) * length + 0.01 * S;
                    pts.push([top[0] + Math.sin(t) * R * 0.55, y, z + Math.sin(2 * t) * R * 0.25]);
                }
                addTube(m, pts, t => R * 0.55 * (1 - 0.4 * t), () => ramp(0.6, 0.85 + 0.1 * k, false), 6);
            }
            const end = [top[0], top[1] - length, top[2] - 0.15 * length + 0.01 * S];
            addTie(H, m, end, [0, -1, 0], R * 0.45);
        }
    }

    // ── brows and lashes ───────────────────────────────────────────────────
    function browShape(style) {
        // [inner height, peak height, outer height, peak at, width (thickness), hair count]
        return {
            natural: [1.55, 1.85, 1.55, 0.6, 1, 34],
            thin: [1.6, 1.85, 1.55, 0.62, 0.45, 26],
            thick: [1.5, 1.8, 1.5, 0.58, 1.6, 46],
            arched: [1.45, 2.05, 1.5, 0.55, 0.9, 34],
            straight: [1.65, 1.7, 1.6, 0.5, 1, 34],
            angry: [1.25, 1.75, 1.9, 0.7, 1.15, 38],
            bushy: [1.55, 1.85, 1.55, 0.55, 2.1, 60]
        }[style];
    }

    /** Snaps a point to the face's skin, then raises it `off`. */
    function onSkin(H, p, off) {
        for (let k = 0; k < 3; k++) { const s = H.surface(p); if (!Number.isFinite(s.d)) break; p = add(p, mul(s.n, off - s.d)); }
        const s = H.surface(p);
        return { p, n: Number.isFinite(s.d) ? s.n : [0, 0, 1] };
    }

    /**
     * The brows' patch: the skin over each eye, found once on MakeHuman's
     * neutral face, with each vertex's place on the brow picture (inner end
     * to outer, mirrored for the other side, so one picture serves both).
     * A brow drawn there rides the brow ridge on any face.
     */
    function browPatch(pack) {
        if (pack._browPatch) return pack._browPatch;
        const B = pack.positions, N = root.RRHumanBody ? root.RRHumanBody.vertexNormals(pack, B) : vertexNormals(pack, B);
        const meanOf = (a, z) => { const c = [0, 0, 0]; for (let v = a; v <= z; v++) for (let k = 0; k < 3; k++) c[k] += B[v * 3 + k] / (z - a + 1); return c; };
        const eyes = [meanOf(14598, 14669), meanOf(14670, 14741)];
        let er = 0;
        for (let v = 14598; v <= 14669; v++) er = Math.max(er, Math.hypot(B[v * 3] - eyes[0][0], B[v * 3 + 1] - eyes[0][1], B[v * 3 + 2] - eyes[0][2]));
        const src = pack.body.source, I = pack.body.index;
        const ids = [], index = [], uvs = [];
        for (const eye of eyes) {
            const side = Math.sign(eye[0]) || 1, x0 = eye[0] - side * er * BROW_BOX[0], y0 = eye[1] + er * BROW_BOX[2];
            const place = v => [side * (B[v * 3] - x0) / (er * BROW_BOX[1]), 1 - (B[v * 3 + 1] - y0) / (er * BROW_BOX[3])];
            const at = new Map();
            for (let t = 0; t < I.length; t += 3) {
                const tri = [src[I[t]], src[I[t + 1]], src[I[t + 2]]];
                if (!tri.every(v => { const q = place(v); return q[0] > -0.05 && q[0] < 1.05 && q[1] > -0.05 && q[1] < 1.05 && N[v * 3 + 2] > 0.15 && B[v * 3 + 2] > eye[2]; })) continue;
                for (const v of tri) {
                    if (!at.has(v)) { at.set(v, ids.length); ids.push(v); uvs.push(...place(v).map(q => clamp(q, 0, 1))); }
                    index.push(at.get(v));
                }
            }
        }
        return (pack._browPatch = { ids, index, uvs });
    }
    // The brow picture's box round an eye, in eye radii: starts this far toward the nose, this wide,
    // starts this high above the eye's center, this tall.
    const BROW_BOX = [1.6, 3.9, 0.7, 2.1];

    /**
     * The brow picture: hundreds of fine hairs along the style's line, the
     * inner ones short and rising, the rest lying outward, over a faint fill
     * of the brow's color so it reads full; alpha everywhere else.
     */
    function browTexture(brows, color) {
        const W = 512, Ht = 256, b = brows, shape = browShape(b.style);
        const data = new Uint8Array(W * Ht * 4);
        if (!shape) return { width: W, height: Ht, data, name: 'brows.png' };
        const rgb = linear(color || '#3a2a1a'), rand = rng(hash(b.style) ^ Math.round(b.thickness * 1000));
        const alpha = new Float32Array(W * Ht), tone = new Float32Array(W * Ht).fill(1);
        const thickness = (0.6 + 0.8 * b.thickness) * shape[4];
        // Eye radii to picture pixels.
        const px = x => (x + BROW_BOX[0]) / BROW_BOX[1] * W, py = y => (1 - (y - BROW_BOX[2]) / BROW_BOX[3]) * Ht;
        const lineAt = u => (b.height || 0) + (u < shape[3] ? mix(shape[0], shape[1], Math.sin((u / shape[3]) * Math.PI / 2)) : mix(shape[1], shape[2], 1 - Math.cos(((u - shape[3]) / (1 - shape[3])) * Math.PI / 2)));
        const plot = (x, y, a, t) => {
            const ix = Math.floor(x), iy = Math.floor(y);
            for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
                const X = ix + dx, Y = iy + dy;
                if (X < 0 || Y < 0 || X >= W || Y >= Ht) continue;
                const w = (1 - Math.abs(x - X)) * (1 - Math.abs(y - Y)) * a, o = Y * W + X;
                if (w <= 0) continue;
                alpha[o] = 1 - (1 - alpha[o]) * (1 - w);
                tone[o] = mix(tone[o], t, Math.min(1, w));
            }
        };
        // The fill: the brow's body, densest along its line, softer at its ends.
        for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) {
            const ex = x / W * BROW_BOX[1] - BROW_BOX[0], ey = BROW_BOX[2] + (1 - y / Ht) * BROW_BOX[3];
            const u = (ex + 1.15) / 2.9;
            if (u < -0.05 || u > 1.05) continue;
            const half = 0.19 * thickness * (1 - 0.6 * Math.min(1, Math.max(0, u))) + 0.04;
            const d = Math.abs(ey - lineAt(Math.min(1, Math.max(0, u)))) / half;
            const ends = smooth(-0.05, 0.12, u) * (1 - smooth(0.85, 1.05, u));
            alpha[y * W + x] = Math.max(0, 1 - d * d) * ends * (b.style === 'bushy' ? 0.42 : 0.22);
        }
        // The hairs.
        const count = Math.round(shape[5] * (0.7 + 0.6 * b.thickness) * 9);
        for (let k = 0; k < count; k++) {
            const u = rand();
            const band = (rand() - 0.5) * 0.38 * thickness * (1 - 0.6 * u);
            let x = mix(-1.15, 1.6, u), y = lineAt(u) + band;
            const dir = norm([1, mix(1.4, -0.15, Math.min(1, u * 1.4)), 0]);
            // The tail thins to a few fine, short hairs; the head near the nose is soft.
            const tail = smooth(0.7, 1, u);
            if (rand() < tail * 0.55) continue;
            const lenH = (0.32 + 0.3 * rand()) * (u < 0.15 ? 0.7 : 1) * (1 - 0.5 * tail), bend = (rand() - 0.3) * 0.5;
            const a0 = (0.55 + 0.4 * rand()) * (0.55 + 0.45 * smooth(0, 0.18, u)) * (1 - 0.4 * tail), t0 = 0.55 + 0.35 * rand();
            const steps = Math.ceil(lenH / BROW_BOX[1] * W * 1.5);
            for (let i = 0; i <= steps; i++) {
                const t = i / steps, ang = bend * t;
                const dx = dir[0] * Math.cos(ang) - dir[1] * Math.sin(ang), dy = dir[0] * Math.sin(ang) + dir[1] * Math.cos(ang);
                plot(px(x), py(y), a0 * (1 - t * 0.55), t0);
                x += dx * lenH / steps; y += dy * lenH / steps;
            }
        }
        // Nothing reaches the picture's edges, so the patch's own outline never shows.
        // The tail fades well inside it: at the temple the skin turns away and the patch may end sooner.
        for (let y = 0; y < Ht; y++) for (let x = 0; x < W; x++) alpha[y * W + x] *= smooth(0, 0.06, x / W) * (1 - smooth(0.72, 0.86, x / W)) * smooth(0, 0.1, y / Ht) * smooth(0, 0.1, 1 - y / Ht);
        for (let o = 0; o < W * Ht; o++) {
            const k = tone[o];
            data[o * 4] = Math.round(255 * Math.pow(Math.min(1, rgb[0] * k), 1 / 2.2));
            data[o * 4 + 1] = Math.round(255 * Math.pow(Math.min(1, rgb[1] * k), 1 / 2.2));
            data[o * 4 + 2] = Math.round(255 * Math.pow(Math.min(1, rgb[2] * k), 1 / 2.2));
            data[o * 4 + 3] = Math.round(255 * Math.min(1, alpha[o]));
        }
        return { width: W, height: Ht, data, name: 'brows.png' };
    }

    /** The brows as a part: the brow patch over the shaped face, a hair off the skin. */
    function buildBrows(H, hair) {
        if (hair.brows.style === 'none' || !browShape(hair.brows.style)) return null;
        const patch = browPatch(H.pack), pack = H.pack, n = patch.ids.length;
        const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
        patch.ids.forEach((v, i) => {
            for (let k = 0; k < 3; k++) { normals[i * 3 + k] = H.normals[v * 3 + k]; positions[i * 3 + k] = H.S[v * 3 + k] + H.normals[v * 3 + k] * 0.0003; }
            joints.set(pack.skinJoints.subarray(v * 4, v * 4 + 4), i * 4);
            weights.set(pack.skinWeights.subarray(v * 4, v * 4 + 4), i * 4);
        });
        return { name: 'Brows', positions, normals, colors: new Float32Array(n * 3).fill(1), uvs: Float32Array.from(patch.uvs), index: Uint32Array.from(patch.index), joints, weights,
            // Left out of the baked occlusion: a sheet this close over the skin would shade the whole patch under it.
            texture: 'brows.png', opacity: 0.999, roughness: 0.7, source: Int32Array.from(patch.ids), decal: true, onSkin: true, noShade: true };
    }

    /**
     * MakeHuman's lash cards, given coordinates of their own: along the lid
     * (the angle round the eye) by root to tip (the distance from it), so the
     * strand picture (`lashTexture`) tapers each lash out from the lid.
     */
    function buildLashes(H, m) {
        const h = H.pack.helpers && H.pack.helpers.lashes;
        if (!h) return;
        const base = m.pos.length / 3;
        const col = [0.03, 0.022, 0.02];
        const pts = Array.from(h.source, v => H.P(v));
        // Each eye's center: the mean of its side's lash vertices.
        const center = side => {
            const own = pts.filter(p => Math.sign(p[0]) === side);
            return own.reduce((a, p) => [a[0] + p[0] / own.length, a[1] + p[1] / own.length, a[2] + p[2] / own.length], [0, 0, 0]);
        };
        const C = { 1: center(1), '-1': center(-1) };
        // Mirrored per eye, so the angle runs 0 at the outer corner to π at the inner one over the top
        // (and down to -π under it), and no lid crosses where the angle wraps.
        const polar = pts.map(p => {
            const side = Math.sign(p[0]) || 1, c = C[side];
            return { a: Math.atan2(p[1] - c[1], (p[0] - c[0]) * side), r: Math.hypot(p[0] - c[0], p[1] - c[1]), up: p[1] > c[1] };
        });
        // Each lid (upper and lower, each side): along it by its own angles, root to tip by distance from the eye.
        const span = {};
        polar.forEach((q, i) => {
            const k = Math.sign(pts[i][0]) + ':' + q.up;
            const sp = span[k] || (span[k] = { r: [Infinity, -Infinity], a: [Infinity, -Infinity] });
            sp.r[0] = Math.min(sp.r[0], q.r); sp.r[1] = Math.max(sp.r[1], q.r);
            sp.a[0] = Math.min(sp.a[0], q.a); sp.a[1] = Math.max(sp.a[1], q.a);
        });
        polar.forEach((q, i) => {
            const sp = span[Math.sign(pts[i][0]) + ':' + q.up];
            // The upper lid takes the picture's left half (long, dense lashes), the lower its right half (short, sparse).
            const along = (q.a - sp.a[0]) / Math.max(1e-5, sp.a[1] - sp.a[0]);
            // A man's lashes are shorter: the strands reach their tips sooner along the card.
            pushVert(m, pts[i], [0, 0, 1], col, [q.up ? along * 0.5 : 0.5 + along * 0.5, Math.min(1, (q.r - sp.r[0]) / Math.max(1e-5, sp.r[1] - sp.r[0]) * (1 + 0.45 * (H.gender || 0)))]);
        });
        for (let t = 0; t < h.index.length; t++) m.idx.push(base + h.index[t]);
    }

    /**
     * Lash strands, root (v = 0) to tip: the picture's left half the upper
     * lid's, its right half the lower lid's. Each lash is a fine hair curving
     * out as it grows, tapering to its tip, darkest at its root; they thin
     * out toward both corners. The lower lid's are few, short and faint.
     */
    function lashTexture(size = 512) {
        size = Math.max(512, size);
        const data = new Uint8Array(size * size * 4), alpha = new Float32Array(size * size);
        const rnd = rng(31);
        const draw = (u0, count, len, width, opacity) => {
            for (let k = 0; k < count; k++) {
                const along = (k + rnd()) / count, mid = Math.sin(along * Math.PI);
                // Sparse at the corners: a lash there is often missing, and shorter.
                if (rnd() > 0.25 + 0.75 * mid) continue;
                const c0 = u0 + along * 0.5, L = len * (0.55 + 0.45 * mid) * (0.75 + 0.4 * rnd()), curl = (rnd() - 0.5) * 0.006 + (along - 0.5) * 0.012;
                const w0 = width * (0.8 + 0.4 * rnd()) * size, a0 = opacity * (0.75 + 0.25 * rnd());
                for (let y = 0; y < size; y++) {
                    const v = (y + 0.5) / size;
                    if (v > L) break;
                    const t = v / L, cu = (c0 + curl * t * t) * size, w = Math.max(0.5, w0 * (1 - 0.85 * t));
                    for (let x = Math.floor(cu - w - 1); x <= Math.ceil(cu + w + 1); x++) {
                        if (x < Math.floor(u0 * size) || x >= Math.ceil((u0 + 0.5) * size)) continue;
                        const d = Math.abs(x + 0.5 - cu) / w;
                        if (d >= 1) continue;
                        const o = y * size + x, al = (1 - d * d) * a0 * (1 - 0.55 * t) * Math.min(1, w0 / 0.9);
                        alpha[o] = 1 - (1 - alpha[o]) * (1 - al);
                    }
                }
            }
        };
        draw(0, 80, 0.95, 0.0028, 1);
        draw(0.5, 16, 0.4, 0.0018, 0.5);
        for (let o = 0; o < size * size; o++) {
            const v = Math.floor(o / size) / size, u = (o % size) / size;
            // The upper lid's lash line: the roots close together, a soft dark line along the lid.
            if (u < 0.5) alpha[o] = 1 - (1 - alpha[o]) * (1 - 0.55 * Math.sin(u * 2 * Math.PI) ** 0.5 * (1 - smooth(0.0, 0.07, v)));
            // Darkest at the root, a little browner toward the tips.
            data[o * 4] = Math.round(14 + 22 * v); data[o * 4 + 1] = Math.round(11 + 14 * v); data[o * 4 + 2] = Math.round(9 + 10 * v);
            data[o * 4 + 3] = Math.round(255 * Math.min(1, alpha[o]));
        }
        return { width: size, height: size, data, name: 'lashes.png' };
    }

    /** A hair part's blended twin: the same cards, its picture's partial alpha blended over the cut-out core. */
    function softEdges(part, name) {
        return Object.assign({}, part, { name, cutout: false, opacity: 0.999, alphaCutoff: undefined, soft: true });
    }

    /**
     * Self-shadowing for hair, baked into its vertex colors (so the game's
     * renderer shows it too): directions from the head's middle are binned;
     * in each bin the outermost hair is lit, the innermost (the layers under
     * it, the roots) darker, by how deep it lies between them. Vertices from
     * `skipFrom` on are left alone.
     */
    function depthShade(H, m, from, skipFrom) {
        const P = m.pos, C = m.col, n = Math.min(P.length / 3, skipFrom), c0 = H.center;
        const AZ = 48, EL = 24, lo = new Float32Array(AZ * EL).fill(Infinity), hi = new Float32Array(AZ * EL).fill(-Infinity), bin = new Int32Array(n), rad = new Float32Array(n);
        for (let i = from; i < n; i++) {
            const d = [P[i * 3] - c0[0], P[i * 3 + 1] - c0[1], P[i * 3 + 2] - c0[2]], r = len(d) || 1;
            const az = Math.floor((Math.atan2(d[0], d[2]) / Math.PI + 1) / 2 * AZ) % AZ, el = Math.min(EL - 1, Math.floor((Math.asin(clamp(d[1] / r, -1, 1)) / Math.PI + 0.5) * EL));
            const b = el * AZ + az;
            bin[i] = b; rad[i] = r;
            lo[b] = Math.min(lo[b], r); hi[b] = Math.max(hi[b], r);
        }
        // Each bin's span widened by its neighbors', so the shading changes smoothly from bin to bin.
        const L2 = Float32Array.from(lo), H2 = Float32Array.from(hi);
        for (let el = 0; el < EL; el++) for (let az = 0; az < AZ; az++) {
            const b = el * AZ + az;
            for (let de = -1; de <= 1; de++) for (let da = -1; da <= 1; da++) {
                const e = el + de;
                if (e < 0 || e >= EL) continue;
                const o = e * AZ + (az + da + AZ) % AZ;
                if (Number.isFinite(lo[o])) { L2[b] = Math.min(L2[b], lo[o]); H2[b] = Math.max(H2[b], hi[o]); }
            }
        }
        const minSpan = 0.004 * H.scale;
        for (let i = from; i < n; i++) {
            const b = bin[i], span = H2[b] - L2[b];
            if (!(span > minSpan)) continue;
            const t = clamp((rad[i] - L2[b]) / span, 0, 1), k = 0.6 + 0.4 * Math.pow(t, 0.75);
            C[i * 3] *= k; C[i * 3 + 1] *= k; C[i * 3 + 2] *= k;
        }
    }

    /**
     * Every triangle wound so its front faces the way its vertices' normals
     * do. A two-sided card is lit by its normal from the side its front
     * faces and by the reverse from the other: wound against its normals,
     * hair seen from outside would be lit from inside, and turn dark.
     */
    function faceOut(m) {
        const P = m.pos, N = m.nrm, I = m.idx;
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const e1 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]], e2 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
            const f = cross(e1, e2), n = [N[a] + N[b] + N[c], N[a + 1] + N[b + 1] + N[c + 1], N[a + 2] + N[b + 2] + N[c + 2]];
            if (dot(f, n) < 0) { const k = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = k; }
        }
    }

    // ── assembly ───────────────────────────────────────────────────────────
    /** Rigid on the head; below the head bone a blend toward Neck, below the neck toward Spine2. */
    function skinOf(H, y, rigid) {
        const hb = H.bones.head, nb = H.bones.neck, cb = H.bones.chest;
        if (rigid) return [[hb, 0, 0, 0], [1, 0, 0, 0]];
        const yH = H.headBone.head[1], yN = H.neckBone.head[1];
        if (y >= yH) return [[hb, nb, cb, 0], [1, 0, 0, 0]];
        if (y >= yN) { const a = (yH - y) / Math.max(1e-5, yH - yN); return [[hb, nb, cb, 0], [1 - a, 0.5 * a, 0.5 * a, 0]]; }
        const b = clamp((yN - y) / (0.06 * H.scale), 0, 1);
        // Lower locks rest against the torso. Leaving 60% of their weight on
        // the head/neck made a head turn sweep them straight through the chest.
        return [[hb, nb, cb, 0], [0, 0.5 * (1 - b), 0.5 + 0.5 * b, 0]];
    }

    function toPart(H, m, name, opts) {
        const count = m.pos.length / 3;
        const joints = new Uint8Array(count * 4), weights = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
            const [j, w] = skinOf(H, m.pos[i * 3 + 1], opts.rigid);
            joints.set(j, i * 4); weights.set(w, i * 4);
        }
        return Object.assign({
            name,
            positions: Float32Array.from(m.pos),
            normals: Float32Array.from(m.nrm),
            index: Uint32Array.from(m.idx),
            joints, weights,
            colors: Float32Array.from(m.col),
            uvs: Float32Array.from(m.uv),
            tangents: Float32Array.from(m.tan),
            roughness: 0.55,
            doubleSided: true
        }, opts.extra || {});
    }

    /**
     * The hair parts for a built body: Hair, Facial hair, Brows, Lashes
     * (those present). `options.seed` varies the scatter; the same recipe
     * and seed grow the same hair. `options.skin` (hex) tints the skin under a beard; `options.budget`
     * (0.25..1) thins the locks for weak hardware.
     */
    function build(pack, built, hairInput, options) {
        const hair = normalizeHair(hairInput);
        const o = options || {};
        const H = measure(pack, built);
        // `options.budget` (0.25..1): the share of locks grown, for weak hardware.
        H.budget = clamp(o.budget ?? 1, 0.25, 1);
        // `options.gender` (0 female .. 1 male): a man's lashes are shorter.
        H.gender = clamp(o.gender ?? 0, 0, 1);
        const seed = (o.seed >>> 0) || hash(hair.style);
        const parts = [];
        const ramp = colorRamp(hair);
        const head = meshBuilder();
        let rand = rng(seed), afroFrom = Infinity;
        for (const layer of styleLayers(H, hair)) {
            if (layer.type === 'cap') buildCap(H, hair, head, layer, ramp);
            else if (layer.type === 'strands') {
                if (layer.sheet) buildSheet(H, hair, head, layer, ramp, rand);
                buildStrands(H, hair, head, layer, ramp, rand);
            }
            else if (layer.type === 'spikes') buildSpikes(H, hair, head, layer, ramp, rand);
            else if (layer.type === 'afro') { afroFrom = head.pos.length / 3; buildAfro(H, hair, head, layer, rand); }
            else if (layer.type === 'coils') buildCoils(H, hair, head, layer, ramp, rand);
            else if (layer.type === 'tail') buildTail(H, hair, head, layer, ramp, rand);
            else if (layer.type === 'bun') buildBun(H, hair, head, layer, ramp, rand);
            else if (layer.type === 'braid') buildBraid(H, hair, head, layer, ramp, rand);
            else if (layer.type === 'locks') buildLocks(H, hair, head, layer, ramp, rand);
            else if (layer.type === 'cornrows') buildCornrows(H, head, layer, ramp);
        }
        // Hair shades itself: deeper layers lie in the shadow of the ones over them.
        depthShade(H, head, 0, afroFrom);
        // Two passes, as hair is drawn in games: a cut-out core at a firm cut, then the same cards again,
        // blended and drawn over it, so each strand's fine, partly clear edge shows soft and the cards'
        // outlines dissolve (no blur: the strands keep their own sharpness). On weak hardware (a hair
        // budget below 0.75) the core alone.
        const soft = H.budget >= 0.75;
        const strands = { texture: 'hair.png', cutout: true, alphaCutoff: soft ? 0.5 : 0.3, keepColors: true };
        // Cards are wider than the strands they stand for: whatever of them sinks into the body is lifted out.
        clearBody(H, head);
        // Hair lying over the shoulders, the back and the chest lies on the clothes worn there, never through them.
        if (o.outfitParts && o.outfitParts.length) overClothes(H, head, o.outfitParts);
        // Left out of the baked occlusion: hundreds of cards packed over the scalp would shade the skin round
        // the hairline into a dark blotch on the cheek, and each other into a dark helmet. The strands carry
        // their own root-to-tip shading.
        faceOut(head);
        if (head.idx.length) parts.push(toPart(H, head, 'Hair', { extra: Object.assign({ noShade: true }, strands) }));
        if (head.idx.length && soft) parts.push(softEdges(parts[parts.length - 1], 'Hair soft'));
        rand = rng(seed ^ 0x51ed);
        const facial = meshBuilder();
        buildFacial(H, hair, facial, rand, hexOk(o.skin) ? o.skin : (built.recipe && built.recipe.skin));
        depthShade(H, facial, 0, Infinity);
        faceOut(facial);
        // Left out of the baked occlusion, as the head's hair is: its layers would shade each other black.
        if (facial.idx.length) parts.push(toPart(H, facial, 'Facial hair', { rigid: true, extra: Object.assign({ noShade: true }, strands) }));
        if (facial.idx.length && soft) parts.push(softEdges(parts[parts.length - 1], 'Facial hair soft'));
        const brows = buildBrows(H, hair);
        if (brows) parts.push(brows);
        if (hair.lashes) {
            const lashes = meshBuilder();
            buildLashes(H, lashes);
            if (lashes.idx.length) parts.push(toPart(H, lashes, 'Lashes', { rigid: true, extra: { roughness: 0.8, uvs: Float32Array.from(lashes.uv), texture: 'lashes.png', cutout: true, alphaCutoff: 0.3, kind: 'hair' } }));
        }
        return parts;
    }

    /** Fit finished card corners to the actual surface, including broad faces
     * whose vertices may be far from the lock. The strand generator's cheaper
     * vertex query still handles its many intermediate path samples. */
    function clearBody(H, mesh) {
        const queries = root.RRCharacterOutfitTransfer || (typeof require === 'function' ? require('./CharacterOutfitTransfer.js') : null);
        const faces = H.pack.body.index.map(i => H.pack.body.source[i]);
        const solid = queries ? queries.triangleGrid(H.S, faces, 0.035 * H.scale) : null;
        const gap = 0.003 * H.scale;
        for (let pass = 0; pass < 2; pass++) for (let i = 0; i < mesh.pos.length; i += 3) {
            const p = mesh.pos.slice(i, i + 3);
            let s = H.surface(p);
            if (solid && p[1] < H.earBottom) {
                let reach = 0.06 * H.scale, hit = queries.nearestTriangle(solid, p, reach);
                // A thick torso may engulf an entire curl, outside the small
                // neighborhood used by ordinary strand samples.
                if ((!hit || hit.d > reach) && p[1] < H.shoulderY && p[1] > H.built.bones[H.bones.spine1].head[1] - 0.12 * H.scale
                    && Math.abs(p[0]) < H.shoulderHalf && Math.abs(p[2] - H.chestBone.head[2]) < 0.12 * H.scale) {
                    reach = 0.16 * H.scale; hit = queries.nearestTriangle(solid, p, reach);
                }
                if (hit && hit.d <= reach) {
                    const n = [0, 0, 0];
                    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) n[k] += H.normals[faces[hit.t * 3 + j] * 3 + k] * hit.bary[j];
                    const normal = norm(n);
                    s = { n: normal, d: dot(sub(p, hit.q), normal) };
                } else continue;
            }
            if (!Number.isFinite(s.d) || s.d >= gap) continue;
            const q = add(p, mul(s.n, Math.min(0.16 * H.scale, gap - s.d)));
            for (let k = 0; k < 3; k++) mesh.pos[i + k] = q[k];
        }
    }

    /**
     * Strand points below the neck pushed out over the garments there: each
     * stands at least a few millimeters further off the skin (along the skin's
     * normal under it) than nearby garment points or a garment face crossing
     * that outward ray. Connected locks ease over plate edges. Head coverings
     * are left alone (hair under them is not drawn).
     */
    function overClothes(H, mesh, parts) {
        const top = H.bones && H.built.bones[H.bones.neck] ? H.built.bones[H.bones.neck].head[1] + 0.02 * H.scale : H.shoulderY + 0.06;
        let low = Infinity;
        for (let i = 1; i < mesh.pos.length; i += 3) low = Math.min(low, mesh.pos[i]);
        // No strand reaches the clothing. Avoid indexing an entire outfit
        // for short hair, which the contact loop below would leave untouched.
        if (low > top) return;
        const cell = 0.03, grid = new Map(), key = (x, y, z) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);
        for (const part of parts) {
            const Q = part.positions;
            for (let i = 0; i < Q.length; i += 3) {
                if (Q[i + 1] > top + 0.04) continue;
                const k = key(Math.floor(Q[i] / cell), Math.floor(Q[i + 1] / cell), Math.floor(Q[i + 2] / cell));
                let list = grid.get(k); if (!list) grid.set(k, list = []);
                list.push(Q[i], Q[i + 1], Q[i + 2]);
            }
        }
        if (!grid.size) return;
        // A nearby-vertex test alone misses the middle of broad armor plates:
        // a ponytail's root and tip stay visible while its center lies inside
        // the backpack. Query the actual garment faces along the same outward
        // skin normal as well, including thick and sparsely tessellated imports.
        const queries = root.RRCharacterOutfitTransfer || (typeof require === 'function' ? require('./CharacterOutfitTransfer.js') : null);
        const Q = [], faces = [];
        if (queries && low < top) for (const part of parts) {
            if (part.rrLining || !part.index) continue;
            const P = part.positions, accepted = [];
            for (let f = 0; f < part.index.length; f += 3) {
                const a = part.index[f], b = part.index[f + 1], c = part.index[f + 2];
                // A neck lock must clear the torso, not ride an outward ray
                // all the way onto a sleeve or raised arm. Sparse backpacks
                // still support the hair through their actual chest bindings.
                if (part.joints && part.weights && [a,b,c].every(v => {
                    let arm=0;
                    for(let k=0;k<4;k++)if(/Shoulder|Arm|Hand/.test(H.built.bones[part.joints[v*4+k]]?.name||''))arm+=part.weights[v*4+k];
                    return arm>.5;
                })) continue;
                if (Math.min(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]) > top + 0.04 ||
                    Math.max(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]) < low - 0.04) continue;
                accepted.push(a, b, c);
            }
            if (!accepted.length) continue;
            const base = Q.length / 3;
            for (const value of P) Q.push(value);
            for (const index of accepted) faces.push(base + index);
        }
        const solid = faces.length ? queries.triangleGrid(Q, faces, 0.04 * H.scale) : null;
        const lift = 0.004 * H.scale, P = mesh.pos;
        const rest = solid ? P.slice() : null, normals = solid ? new Float32Array(P.length) : null;
        const pushes = solid ? new Float32Array(P.length / 3) : null;
        let drape = false;
        for (let i = 0; i < P.length; i += 3) {
            if (P[i + 1] > top + (solid ? 0.06 * H.scale : 0)) continue;
            const p = [P[i], P[i + 1], P[i + 2]];
            let s = H.surface(p);
            // A long gathered lock may already hang beyond the skin query's
            // small neighborhood, while still lying inside a broad backpack.
            // Its outward bearing from the spine remains well defined there.
            if ((!Number.isFinite(s.d) || !s.n) && solid) {
                const axis = H.chestBone.head;
                const outward = norm([p[0] - axis[0], 0, p[2] - axis[2]]);
                if (len(outward) > 0) s = { d: 0, n: outward };
            }
            if (!Number.isFinite(s.d) || !s.n) continue;
            if (normals) normals.set(s.n, i);
            if (P[i + 1] > top) continue;
            // The farthest garment point off the skin near this one, measured along the skin's normal here.
            let off = -Infinity;
            const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell), cz = Math.floor(p[2] / cell);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
                const list = grid.get(key(cx + dx, cy + dy, cz + dz));
                if (!list) continue;
                for (let k = 0; k < list.length; k += 3) {
                    const ex = list[k] - p[0], ey = list[k + 1] - p[1], ez = list[k + 2] - p[2];
                    const along = ex * s.n[0] + ey * s.n[1] + ez * s.n[2];
                    const side = ex * ex + ey * ey + ez * ez - along * along;
                    if (side > 0.0009) continue;
                    off = Math.max(off, s.d + along);
                }
            }
            // Keep the old local-support limit for unrelated nearby points;
            // a real outward surface hit can support hair farther from skin.
            if (off > 0.08) off = -Infinity;
            const local = Math.max(s.d - lift, off);
            if (solid) {
                const hits=queries.rayHits(solid,p,s.n,-lift,.24*H.scale).sort((a,b)=>a.s-b.s);
                // The first crossing is the local layer supporting this lock.
                // A nearby outer lining may be part of that same shell.
                if(hits.length){const near=hits[0].s;for(const hit of hits)if(hit.s<=near+.025*H.scale)off=Math.max(off,s.d+hit.s);}
            }
            if (off === -Infinity || s.d >= off + lift) continue;
            const push = off + lift - s.d;
            if (pushes) { pushes[i / 3] = push; if (off > local + lift) drape = true; }
            P[i] += s.n[0] * push; P[i + 1] += s.n[1] * push; P[i + 2] += s.n[2] * push;
        }
        // Ease contact along each connected lock, leaving its root pinned.
        // Only spread clearance outward; averaging the fitted positions back
        // toward the scalp would put the middle inside the armor again.
        if (drape) {
            const edges = [];
            for (let f = 0; f < mesh.idx.length; f += 3) for (let k = 0; k < 3; k++) {
                const a = mesh.idx[f + k], b = mesh.idx[f + (k + 1) % 3];
                if ((!normals[a * 3] && !normals[a * 3 + 1] && !normals[a * 3 + 2]) ||
                    (!normals[b * 3] && !normals[b * 3 + 1] && !normals[b * 3 + 2])) continue;
                if (normals[a * 3] * normals[b * 3] + normals[a * 3 + 1] * normals[b * 3 + 1] + normals[a * 3 + 2] * normals[b * 3 + 2] < 0.7) continue;
                edges.push(a, b, Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]) * 0.9);
            }
            for (let pass = 0; pass < 4; pass++) for (let e = pass % 2 ? edges.length - 3 : 0; e >= 0 && e < edges.length; e += pass % 2 ? -3 : 3) {
                const a = edges[e], b = edges[e + 1], fall = edges[e + 2];
                pushes[a] = Math.max(pushes[a], pushes[b] - fall);
                pushes[b] = Math.max(pushes[b], pushes[a] - fall);
            }
            for (let v = 0; v < pushes.length; v++) if (pushes[v] > 0) for (let c = 0; c < 3; c++) P[v * 3 + c] = rest[v * 3 + c] + normals[v * 3 + c] * pushes[v];
        }
    }

    /** A seeded random hair recipe; men get facial hair now and then. */
    function randomHair(seed, opts) {
        const rand = rng(seed);
        // `gender`: 'male' / 'female' or the Gender slider's value.
        const g = opts && opts.gender, male = g === 'male' ? true : g === 'female' ? false : (g != null ? g : rand()) >= 0.5;
        const pick = list => list[Math.floor(rand() * list.length)];
        const short = ['buzz', 'crew', 'sidePart', 'undercut', 'quiff', 'slickBack', 'messy', 'curlyShort', 'spiky', 'mullet', 'pompadour'];
        const long = ['bob', 'shoulder', 'long', 'longWavy', 'ponytail', 'bun', 'braid', 'pigtails', 'hime', 'curly', 'sweptBangs', 'pixie', 'twinBraids', 'bunLow', 'ponytailLow'];
        const any = ['afro', 'dreadlocks', 'shag', 'mohawk', 'topKnot', 'bald'];
        const style = rand() < 0.12 ? pick(any) : pick(male ? (rand() < 0.8 ? short : long) : (rand() < 0.8 ? long : short));
        // Natural colors as they occur among the people (`opts.people`, RRHumanBody's): blond and red mostly
        // among Europeans; grey with age (`opts.age`).
        const dark = ['#0e0b09', '#0e0b09', '#22170f', '#22170f', '#3b2a1e'];
        const fair = ['#0e0b09', '#22170f', '#3b2a1e', '#5a3d26', '#7a5532', '#a0763f', '#c99a5b', '#e0c48a', '#8c3b1c', '#b2552a'];
        const people = opts && opts.people;
        const natural = !people || people === 'european' ? fair : ['mixed', 'latinAmerican', 'middleEastern', 'centralAsian'].includes(people) ? dark.concat(['#3b2a1e', '#5a3d26', '#7a5532']) : dark;
        const age = opts && opts.age;
        const grey = age > 45 && rand() < smooth(45, 75, age) ? pick(['#9c9c9c', '#bdbdbd', '#dcdcdc']) : null;
        const dyed = rand() < 0.08;
        const color = dyed ? pick(['#6a2fa0', '#2f6ad0', '#d02f6a', '#2fa06a', '#e0e0f0']) : grey || pick(natural);
        return normalizeHair({
            style, color, length: 0.8 + rand() * 0.5, volume: rand(), curl: rand() < 0.2 ? rand() : 0,
            part: pick(PARTS), fringe: (STYLE_FRINGE[style] || [0])[0] * (0.6 + 0.8 * rand()), hairline: male && rand() < 0.25 ? rand() * 0.8 : 0,
            highlights: rand() < 0.2 ? rand() : 0,
            facial: { style: male && rand() < 0.45 ? pick(FACIAL.slice(1)).id : 'none', length: 0.7 + rand() * 0.6, volume: rand(), color: dyed ? pick(natural) : '' },
            // Dyed hair leaves the brows and beard their own natural color; brows grey later than the hair.
            brows: { style: pick(['natural', 'natural', 'thin', 'thick', 'arched', 'straight', 'bushy']), thickness: male ? 0.5 + rand() * 0.5 : rand() * 0.6, color: dyed ? pick(natural) : grey ? mixHex(pick(natural), grey, 0.45) : '' }
        });
    }

    const api = {
        lashTexture, hairTexture, browTexture,
        STYLES, FACIAL, BROWS, PARTS, STYLE_FRINGE, withStyle, DEFAULT_HAIR, normalizeHair, randomHair, build,
        _internal: { measure, headCoords, cutSurface, facialField, scalpField, styleLayers, meshBuilder, addShell, addClump, addTube, addBlob, grow, curlStrand, scatter, tangent, rng, hash, linear }
    };
    root.RRCharacterHair = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
