/**
 * RRCharacterSkin - the body's painted skin and the eyes' irises.
 *
 * The skin is a picture in the body's own UV layout (MakeHuman's), each
 * texel painted from where it lies on the average body: its height, its
 * place along the spine or a limb, which way it faces, and how far the lip
 * and eyelid targets move it there. So a tiger's stripes run round its arms,
 * a lizard's belly is pale, and lipstick stays on the lips, on any body.
 * The picture depends on the skin settings only, never on the body's shape.
 *
 * The eyes are MakeHuman's eye picture with the iris recolored from its own
 * light and dark (its fibers kept) and the pupil reshaped.
 */
(function(root) {
    'use strict';

    const Outfit = root.RRCharacterOutfit || (typeof require === 'function' ? require('./CharacterOutfit.js') : null);
    const toByte = c => Math.max(0, Math.min(255, Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255)));
    const srgb = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const fract = x => x - Math.floor(x);
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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
    /** Distance to the nearest and second nearest cell point (cells of `size` meters). */
    function cells(x, y, z, size) {
        x /= size; y /= size; z /= size;
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        let d1 = 9, d2 = 9;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
            const cx = ix + i + hash3(ix + i, iy + j, iz + k), cy = iy + j + hash3(iy + j, iz + k, ix + i), cz = iz + k + hash3(iz + k, ix + i, iy + j);
            const d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        return [Math.sqrt(d1), Math.sqrt(d2)];
    }
    /** The nearest cell's seed (in cell units) and the point's own, for patterns shaded from the seed. */
    function cellSeed(x, y, z, size) {
        x /= size; y /= size; z /= size;
        const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
        let d1 = 9, d2 = 9, c = null;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
            const cx = ix + i + hash3(ix + i, iy + j, iz + k), cy = iy + j + hash3(iy + j, iz + k, ix + i), cz = iz + k + hash3(iz + k, ix + i, iy + j);
            const d = (x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2;
            if (d < d1) { d2 = d1; d1 = d; c = [cx, cy, cz]; } else if (d < d2) d2 = d;
        }
        return { c, p: [x, y, z], d1: Math.sqrt(d1), d2: Math.sqrt(d2) };
    }

    const PATTERNS = [['none', 'None'], ['freckles', 'Freckles'], ['scales', 'Scales'], ['stripes', 'Stripes'], ['spots', 'Spots'], ['fur', 'Fur'], ['feathers', 'Feathers'], ['decay', 'Decay'], ['panels', 'Panels'], ['tribal', 'Tribal marks'], ['vitiligo', 'Patches'], ['moles', 'Moles'], ['scars', 'Scars'], ['veins', 'Veins'], ['stone', 'Stone'], ['marble', 'Marble'], ['lava', 'Lava cracks']];
    const LOOKS = [
        { id: 'freckled', label: 'Freckled', skin: '#d9ad91', settings: { type: 'freckles', color: '#8e5032', amount: 0.7 } },
        { id: 'moles', label: 'Beauty marks', skin: '#a8795a', settings: { type: 'moles', color: '#4b2c24', amount: 0.8 } },
        { id: 'scarred', label: 'Scarred', skin: '#bb9176', settings: { type: 'scars', color: '#dfb6aa', amount: 0.7 } },
        { id: 'stone', label: 'Stone', skin: '#84827a', settings: { type: 'stone', color: '#353b3a', scale: 1.2 } },
        { id: 'marble', label: 'Marble', skin: '#e0e2dd', settings: { type: 'marble', color: '#52616e', amount: 0.8 } },
        { id: 'lava', label: 'Volcanic', skin: '#292327', settings: { type: 'lava', color: '#ed682a', amount: 1 } },
        { id: 'frost', label: 'Frost', skin: '#8abacc', settings: { type: 'veins', color: '#e7f5fa', amount: 0.85 } },
        { id: 'moss', label: 'Moss', skin: '#65744b', settings: { type: 'stone', color: '#aeb97a', amount: 0.6, scale: 0.6 } }
    ];

    const DEFAULT_SKIN = Object.freeze({ type: 'none', color: '#5a4030', belly: '', amount: 1, scale: 1, lips: '', nose: '', blush: 0, eyeshadow: '', shadowAmount: 0.7 });

    function normalizeSkin(input) {
        const s = Object.assign({}, DEFAULT_SKIN, input || {});
        if (!PATTERNS.some(p => p[0] === s.type)) s.type = 'none';
        for (const k of ['color', 'belly', 'lips', 'nose', 'eyeshadow']) if (s[k] && !/^#[0-9a-f]{6}$/i.test(s[k])) s[k] = '';
        s.amount = Math.max(0, Math.min(1, +s.amount || 0));
        s.scale = Math.max(0.3, Math.min(3, +s.scale || 1));
        s.blush = Math.max(0, Math.min(1, +s.blush || 0));
        s.shadowAmount = Math.max(0, Math.min(1, +(s.shadowAmount ?? 0.7)));
        return s;
    }

    /** Per pack vertex, how much a set of targets moves it, 0..1 (lips, eyelids). */
    function regionOf(pack, names) {
        const out = new Float32Array(pack.vertexCount);
        let max = 0;
        for (const name of names) {
            const t = pack.targets.get(name);
            if (!t) continue;
            for (let i = 0; i < t.index.length; i++) {
                const m = Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]) * t.scale;
                out[t.index[i]] = Math.max(out[t.index[i]], m);
                max = Math.max(max, m);
            }
        }
        if (max > 0) for (let v = 0; v < out.length; v++) out[v] /= max;
        return out;
    }

    /**
     * The lips' field filled in toward the mouth: the lip targets move the
     * lips' outer faces, not the inner roll where the lips meet, which would
     * otherwise show as a pale band of skin. Skin within a few millimeters of
     * a lip that faces up, down or back (into the mouth's slot, not out onto
     * the face) takes the lip's value.
     */
    function innerLips(pack, lips, R, N) {
        const on = [...new Set(pack.body.source)], core = on.filter(v => lips[v] > 0.45);
        if (!core.length) return lips;
        const U = regionOf(pack, ['shape/upperLip-incr']), upper = core.filter(v => U[v] > 0.3), lower = core.filter(v => !(U[v] > 0.3));
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
        for (const v of core) { x0 = Math.min(x0, R[v * 3]); x1 = Math.max(x1, R[v * 3]); y0 = Math.min(y0, R[v * 3 + 1]); y1 = Math.max(y1, R[v * 3 + 1]); }
        const out = Float32Array.from(lips), reach = 0.004;
        for (const v of on) {
            const x = R[v * 3], y = R[v * 3 + 1], z = R[v * 3 + 2];
            if (lips[v] > 0.6 || x < x0 - 0.008 || x > x1 + 0.008 || y < y0 - 0.002 || y > y1 + 0.002 || N[v * 3 + 2] > 0.75) continue;
            // Only between the lips (near both of them), never round their outer edge onto the face.
            const near = list => { let m = Infinity; for (const u of list) m = Math.min(m, Math.hypot(R[u * 3] - x, R[u * 3 + 1] - y, R[u * 3 + 2] - z)); return m; };
            const d = Math.min(near(upper), near(lower));
            if (d < reach && Math.max(near(upper), near(lower)) < 0.006) out[v] = Math.max(out[v], 0.75 * (1 - d / reach) + 0.25);
        }
        // How much of each vertex's value is the filled-in inner roll (in the upper lip's shade).
        out.inner = new Float32Array(out.length);
        for (let v = 0; v < out.length; v++) out.inner[v] = Math.max(0, out[v] - lips[v]);
        return out;
    }

    /**
     * Where the lips meet, 0..1: each lip's skin within a few millimeters of
     * the other lip (the mouth's line, where a closed mouth shows dark).
     */
    function lipSeam(pack) {
        const U = regionOf(pack, ['shape/upperLip-incr']), L = regionOf(pack, ['shape/lowerLip-incr']), P = pack.positions;
        const up = [], low = [], out = new Float32Array(pack.vertexCount);
        for (const v of new Set(pack.body.source)) { if (U[v] > 0.05) up.push(v); else if (L[v] > 0.05) low.push(v); }
        const near = (a, list) => { let m = Infinity; for (const b of list) m = Math.min(m, Math.hypot(P[a * 3] - P[b * 3], P[a * 3 + 1] - P[b * 3 + 1], P[a * 3 + 2] - P[b * 3 + 2])); return m; };
        for (const v of up) out[v] = 1 - smooth(0.0012, 0.0034, near(v, low));
        for (const v of low) out[v] = 1 - smooth(0.0012, 0.0034, near(v, up));
        return out;
    }

    function fields(pack) {
        if (pack._skinFields) return pack._skinFields;
        const an = Outfit.anatomy(pack);
        const Body = root.RRHumanBody || require('./HumanBody.js');
        const normals = Body.vertexNormals(pack, an.rest);
        const lips = innerLips(pack, regionOf(pack, ['shape/upperLip-incr', 'shape/lowerLip-incr']), an.rest, normals);
        const lids = regionOf(pack, ['shape/eyeOpen-incr', 'shape/eyeFold-incr']);
        const cheeks = regionOf(pack, ['shape/cheeks-incr']);
        const nose = regionOf(pack, ['shape/noseVolume-incr', 'shape/noseDepth-incr']);
        const bags = regionOf(pack, ['shape/eyeBags-incr']);
        const seam = lipSeam(pack);
        // The tip and the nostrils alone (the nose pad of a muzzle), not the bridge.
        const noseTip = regionOf(pack, ['shape/noseTip-incr', 'shape/nostrils-incr']);
        // The outer ear alone: the ear-size target also moves the cheek in front of the ear.
        const ears = Body.earMask ? Body.earMask(pack) : regionOf(pack, ['shape/earSize-incr']);
        const jaw = regionOf(pack, ['shape/jaw-incr', 'shape/chin-incr', 'shape/chinWidth-incr', 'shape/doubleChin-incr']);
        return (pack._skinFields = { an, normals, lips, innerLip: lips.inner, lids, bags, seam, cheeks, nose, noseTip, ears, jaw, marks: faceMarks(pack, an.rest, lips, noseTip) });
    }

    /**
     * Where a face's lines fall, on the average body (one side; the other is
     * its mirror): the eye's center and outer corner, the nose's wing, the
     * mouth's corner, the brow line.
     */
    function faceMarks(pack, R, lips, noseTip) {
        const mean = list => [0, 1, 2].map(k => list.reduce((a, v) => a + R[v * 3 + k], 0) / Math.max(1, list.length));
        const eyeIds = [...new Set(pack.eyes.refs)].filter(v => R[v * 3] > 0), eye = mean(eyeIds);
        let eyeR = 0;
        for (const v of eyeIds) eyeR = Math.max(eyeR, Math.abs(R[v * 3] - eye[0]));
        const on = [...new Set(pack.body.source)];
        const lipIds = on.filter(v => lips[v] > 0.3 && R[v * 3] >= 0), mouth = mean(lipIds);
        let corner = 0;
        for (const v of lipIds) corner = Math.max(corner, R[v * 3]);
        const tipIds = on.filter(v => noseTip[v] > 0.3 && R[v * 3] >= 0), tip = mean(tipIds);
        let wing = 0;
        for (const v of tipIds) wing = Math.max(wing, R[v * 3]);
        return { eye, eyeR, mouth, corner, tip, wing };
    }

    /**
     * How deep an aged face's lines lie at a place (0..1, darkening): the
     * forehead's level lines, crow's feet fanning from the eye's outer
     * corner, a line under the eye, the folds from the nose's wing to the
     * mouth's corner and on down toward the jaw, and rings round the neck.
     * `a` is the age's strength (0 young .. 1 very old).
     */
    function wrinkles(M, p, a) {
        const [x0, y, z] = p.rest, x = Math.abs(x0), n = p.n;
        if (p.fam !== 0 || a <= 0) return 0;
        const line = (d, w) => Math.max(0, 1 - Math.abs(d) / w);
        const e = M.eye, R = M.eyeR;
        let d = 0;
        if (p.s > 4.6 && n[2] > 0.35) {
            // The forehead: level lines, gently waved, from above the brows to below the hairline.
            const up = y - e[1];
            if (up > R * 2.4 && up < R * 5 && x < e[0] + R * 1.4) {
                const t = up / (R * 0.75) + 0.25 * Math.sin(x * 70);
                d = Math.max(d, line(t - Math.round(t), 0.13) * smooth(R * 2.4, R * 3, up) * (1 - smooth(R * 4.2, R * 5, up)) * (1 - smooth(e[0], e[0] + R * 1.4, x)) * smooth(0.25, 0.75, a));
            }
            // Between the brows: two short upright lines.
            if (up > R * 1.4 && up < R * 2.6) d = Math.max(d, line(x - R * 0.55, R * 0.1) * smooth(0.5, 0.9, a) * 0.8);
        }
        if (p.s > 4.4) {
            // Crow's feet: rays out from the eye's outer corner.
            const cx = e[0] + R * 1.05, dx = x - cx, dy = y - (e[1] - R * 0.1), r = Math.hypot(dx, dy);
            if (dx > -R * 0.15 && r > R * 0.2 && r < R * 1.3 && n[0] * Math.sign(x0 || 1) > 0.1) {
                const ang = Math.atan2(dy, Math.max(1e-5, dx));
                d = Math.max(d, line(Math.sin(ang * 4.5), 0.25) * (1 - smooth(R * 0.7, R * 1.3, r)) * smooth(0.15, 0.6, a));
            }
            // Under the eye: an arc below the lower lid.
            const ux = (x - e[0]) / (R * 1.25), uy = (y - (e[1] - R * 1.05)) / R;
            if (Math.abs(ux) < 1 && n[2] > 0.2) d = Math.max(d, line(uy - 0.3 * ux * ux, 0.12) * (1 - ux * ux) * smooth(0.3, 0.8, a) * 0.8);
            // From the nose's wing round the mouth's corner, and on down toward the jaw.
            const top = [M.wing + R * 0.15, M.tip[1] - R * 0.2], low = [M.corner + R * 0.25, M.mouth[1] - R * 0.15], jaw = [M.corner + R * 0.1, M.mouth[1] - R * 1.7];
            if (n[2] > 0.25 && y < top[1] + R * 0.2 && y > jaw[1]) {
                const fold = (P, Q, w) => {
                    const t = Math.max(0, Math.min(1, (y - P[1]) / (Q[1] - P[1])));
                    const xs = P[0] + (Q[0] - P[0]) * t + Math.sin(t * Math.PI) * R * 0.25;
                    return y <= Math.max(P[1], Q[1]) && y >= Math.min(P[1], Q[1]) ? line(x - xs, w) : 0;
                };
                d = Math.max(d, fold(top, low, R * 0.16) * smooth(0.05, 0.5, a), fold(low, jaw, R * 0.13) * smooth(0.45, 0.9, a) * 0.8);
            }
        }
        // The neck: soft rings in front.
        if (p.s > 4.0 && p.s < 4.4 && n[2] > 0.3) {
            const t = y / 0.012;
            d = Math.max(d, line(t - Math.round(t), 0.12) * smooth(0.4, 0.9, a) * 0.7 * (1 - smooth(0.04, 0.07, x)));
        }
        return d;
    }

    /**
     * How densely a facial hair style grows at each vertex of the average
     * body, 0..1: the style's own zone (RRCharacterHair's), full well inside
     * it and fading over a couple of centimeters at its edge.
     */
    function beardField(pack, style) {
        pack._beardFields = pack._beardFields || new Map();
        if (pack._beardFields.has(style)) return pack._beardFields.get(style);
        // The hair module is loaded after this one (in the editor page and the skin painter alike).
        const Hair = root.RRCharacterHair;
        const Body = root.RRHumanBody || require('./HumanBody.js');
        if (!Hair || !Hair._internal) return null;
        const built = pack._averageBuilt || (pack._averageBuilt = Body.build(pack, Body.DEFAULT_RECIPE));
        const H = Hair._internal.measure(pack, built), field = Hair._internal.facialField(H, style, false);
        const f = new Float32Array(pack.vertexCount * 3);
        for (const v of H.headVerts) f[v * 3] = smooth(-2.5, 6, field(v));
        const eased = Body.relax(pack, f, 3), out = new Float32Array(pack.vertexCount);
        for (let v = 0; v < pack.vertexCount; v++) out[v] = Math.min(1, eased[v * 3]);
        pack._beardFields.set(style, out);
        return out;
    }

    /**
     * Where a hair style covers the scalp, per vertex of the average body
     * (0..1, softened over a few millimeters at the hairline), from the
     * style's own layers: the union of their zones, so a mohawk paints its
     * strip and an undercut its top. `amount`: how much a thin crop colors
     * the scalp (a buzz cut lets skin show through).
     */
    function scalpZone(pack, style, recede) {
        pack._scalpZones = pack._scalpZones || new Map();
        const key = style + '|' + recede;
        if (pack._scalpZones.has(key)) return pack._scalpZones.get(key);
        const Hair = root.RRCharacterHair, Body = root.RRHumanBody || require('./HumanBody.js');
        if (!Hair || !Hair._internal || !Hair._internal.styleLayers) return null;
        const built = pack._averageBuilt || (pack._averageBuilt = Body.build(pack, Body.DEFAULT_RECIPE));
        const I = Hair._internal, H = I.measure(pack, built), hair = Hair.normalizeHair({ style, hairline: recede });
        const layers = I.styleLayers(H, hair);
        if (!layers.length) return null;
        let thick = 0;
        for (const l of layers) if (l.type === 'cap') thick = Math.max(thick, l.thickness / H.scale);
        const fields = layers.map(l => I.scalpField(H, hair, l.zone || null));
        const f = new Float32Array(pack.vertexCount * 3);
        for (const v of H.headVerts) { let best = -Infinity; for (const fn of fields) best = Math.max(best, fn(v)); f[v * 3] = smooth(-3.5, 3, best); }
        const eased = Body.relax(pack, f, 2), field = new Float32Array(pack.vertexCount);
        for (let v = 0; v < pack.vertexCount; v++) field[v] = Math.min(1, eased[v * 3]);
        const zone = { field, amount: thick > 0 ? Math.min(1, 0.3 + thick / 0.008) : 1 };
        if (pack._scalpZones.size > 12) pack._scalpZones.clear();
        pack._scalpZones.set(key, zone);
        return zone;
    }

    /** An age in years as the step its skin is painted at: none below 35, then each five years. */
    function ageStep(years) {
        return years < 35 ? 0 : Math.min(90, Math.round(years / 5) * 5);
    }

    /**
     * Where body hair grows, region by region, each 0..1. A pattern is a set
     * of region values (the ones people and furred species show); every
     * region stays its own slider.
     */
    const HAIR_REGIONS = [['face', 'Face'], ['neck', 'Neck'], ['chest', 'Chest'], ['belly', 'Belly'], ['back', 'Back'], ['shoulders', 'Shoulders'],
        ['upperArms', 'Upper arms'], ['forearms', 'Forearms'], ['hands', 'Hands'], ['armpits', 'Armpits'], ['pubic', 'Pubic'], ['buttocks', 'Buttocks'],
        ['thighs', 'Thighs'], ['shins', 'Lower legs'], ['feet', 'Feet']];
    const zero = Object.fromEntries(HAIR_REGIONS.map(r => [r[0], 0]));
    const HAIR_PRESETS = {
        none: zero,
        light: Object.assign({}, zero, { armpits: 0.8, pubic: 0.8, forearms: 0.25, shins: 0.35, thighs: 0.1 }),
        natural: Object.assign({}, zero, { chest: 0.7, belly: 0.65, pubic: 1, armpits: 1, upperArms: 0.3, forearms: 0.8, hands: 0.35, thighs: 0.55, shins: 0.85, feet: 0.45, buttocks: 0.25, back: 0.05, shoulders: 0.05 }),
        hairy: Object.assign({}, zero, { chest: 1, belly: 0.95, pubic: 1, armpits: 1, upperArms: 0.7, forearms: 1, hands: 0.6, thighs: 0.9, shins: 1, feet: 0.7, buttocks: 0.7, back: 0.85, shoulders: 0.8, neck: 0.35 }),
        furry: Object.assign(Object.fromEntries(HAIR_REGIONS.map(r => [r[0], 1])), { face: 0 }),
        // A woman's: fine hair on the forearms and lower legs, the armpits and groin; none on the chest or back.
        naturalFemale: Object.assign({}, zero, { pubic: 1, armpits: 0.9, forearms: 0.2, shins: 0.35, thighs: 0.05, feet: 0.08 }),
        lightFemale: Object.assign({}, zero, { pubic: 0.6, armpits: 0.4, forearms: 0.15, shins: 0.2 }),
        werewolf: Object.fromEntries(HAIR_REGIONS.map(r => [r[0], 1]))
    };
    const BODY_HAIR_PATTERNS = [['none', 'None'], ['light', 'Light'], ['natural', 'Natural'], ['hairy', 'Very hairy'], ['furry', 'Furry body'], ['werewolf', 'Werewolf'], ['custom', 'Custom']];
    const DEFAULT_BODY_HAIR = Object.freeze({ amount: 0, pattern: 'natural', regions: HAIR_PRESETS.natural, color: '', fur: 0, length: 1 });

    function normalizeBodyHair(input) {
        const i = input || {};
        const h = Object.assign({}, DEFAULT_BODY_HAIR, i);
        h.amount = Math.max(0, Math.min(1, +h.amount || 0));
        h.fur = Math.max(0, Math.min(1, +h.fur || 0));
        h.length = Math.max(0.3, Math.min(3, +h.length || 1));
        // Older recipes named 'full', 'arms' and 'back'.
        h.pattern = { full: 'furry', arms: 'light', back: 'hairy' }[h.pattern] || h.pattern;
        if (!BODY_HAIR_PATTERNS.some(p => p[0] === h.pattern)) h.pattern = 'natural';
        const preset = HAIR_PRESETS[h.pattern] || HAIR_PRESETS.natural;
        h.regions = {};
        for (const [key] of HAIR_REGIONS) h.regions[key] = Math.max(0, Math.min(1, +((i.regions && i.regions[key]) ?? preset[key]) || 0));
        if (h.color && !/^#[0-9a-f]{6}$/i.test(h.color)) h.color = '';
        return h;
    }

    /**
     * How thickly body hair grows at a place (0..1): each region's mask on
     * the average body (by chain, place along it, facing) times its value.
     * The palms, the soles, the lips, the lids and the nose tip grow none.
     */
    function hairDensity(regions, p) {
        const R = regions, s = p.s, n = p.n;
        // Each region is a band along its chain; neighbors cross at a shared edge with eased halves, so their
        // shares add to one and equal settings make an even coat without a seam.
        const band = (lo, hi, w = 0.12) => (lo === -Infinity ? 1 : smooth(lo - w, lo + w, s)) * (hi === Infinity ? 1 : 1 - smooth(hi - w, hi + w, s));
        // Below full, a region keeps the shape hair grows in there (a line down the belly, the middle of the
        // chest); toward full it spreads over the whole band.
        const grow = (key, shape) => { const v = R[key] || 0; return v * (shape + (1 - shape) * smooth(0.55, 1, v)); };
        if (p.fam === 0) {
            if (s > 4.35) {
                // The face and head: not on the lips, the lids, the nose's tip; thinner toward the eyes.
                const open = Math.max(smooth(0.06, 0.22, p.lips || 0), smooth(0.04, 0.18, p.lids || 0), smooth(0.2, 0.5, p.nose || 0));
                const face = (R.face || 0) * (1 - open) * (0.55 + 0.45 * smooth(0.2, 0.9, Math.abs(Math.sin(p.ang))));
                // Under the jaw and behind, the neck's hair carries on up.
                const neck = (R.neck || 0) * (1 - smooth(4.35, 4.6, s)) * (0.5 + 0.5 * smooth(0.3, -0.3, Math.cos(p.ang)));
                return Math.min(1, face + neck);
            }
            const c = Math.cos(p.ang), front = smooth(-0.3, 0.3, c), back = 1 - front, x = Math.abs(p.rest[0]);
            const chest = Math.max(smooth(0.2, 0.6, c) * (1 - smooth(0.11, 0.17, x)), (1 - smooth(0.02, 0.045, x)) * smooth(0.3, 0.6, c));
            const belly = Math.max(smooth(0.3, 0.6, c) * (1 - smooth(0.07, 0.14, x)) * smooth(0.4, 0.9, s), (1 - smooth(0.012, 0.03, x)) * smooth(0.3, 0.6, c));
            const pubic = Math.max(smooth(0.2, 0.55, c) * (1 - smooth(0.08, 0.13, x)), smooth(0.2, -0.2, s) * (1 - smooth(0.02, 0.05, x)));
            let d = 0;
            d += grow('pubic', pubic) * band(-Infinity, 0.5) * front;
            d += grow('buttocks', 1) * band(-Infinity, 0.5) * back;
            d += grow('belly', belly) * band(0.5, 2.25) * front;
            d += grow('chest', chest) * band(2.25, 3.75) * front;
            d += grow('back', 1) * band(0.5, 3.75) * back;
            d += grow('shoulders', smooth(0.08, 0.14, x) + 0.8 * back) * band(3.75, 3.95, 0.08);
            d += grow('neck', 0.5 + 0.5 * back) * band(3.95, Infinity, 0.08);
            return Math.min(1, d);
        }
        if (p.fam === 1 || p.fam === 2) {
            const top = smooth(-0.3, 0.5, n[1]);
            let d = grow('shoulders', smooth(0, 0.5, n[1])) * band(-Infinity, 0.95) + grow('upperArms', 0.55 + 0.45 * top) * band(0.95, 1.95) + grow('forearms', 0.45 + 0.55 * top) * band(1.95, 3.0, 0.08);
            // The backs of the hands and fingers; never the palms.
            d += (R.hands || 0) * band(3.0, Infinity, 0.08) * smooth(-0.15, 0.3, n[1]);
            // The armpits: a patch of their own over the top of the arm's inside.
            d = Math.max(d, (R.armpits || 0) * smooth(0.5, 0.75, s) * (1 - smooth(1.05, 1.3, s)) * smooth(0.1, 0.5, -n[1]));
            return Math.min(1, d);
        }
        // Legs: thigh, shin, the tops of the feet and toes; never the soles.
        let d = grow('thighs', 0.6 + 0.4 * smooth(-0.3, 0.6, Math.abs(n[0]) + n[2])) * band(-Infinity, 1.0) + grow('shins', 1) * band(1.0, 2.0, 0.08);
        d += (R.feet || 0) * band(2.0, Infinity, 0.08) * smooth(-0.1, 0.35, n[1]);
        return Math.min(1, d);
    }

    /**
     * How much the skin under body hair takes the hair's color at a place of
     * density `here` (0..1, the regions' field): fully under fur, toward it
     * under thick hair. What the skin painter lays on, without its streaks.
     */
    function hairCover(bh, here) {
        const fur = bh.fur > 0.05 ? Math.min(1, here * Math.max(bh.amount, bh.fur)) * Math.min(1, bh.fur * 1.4) * 0.95 : 0;
        const dens = here * bh.amount, hair = bh.amount > 0.01 && dens > 0.05 ? smooth(0.05, 1, dens) * 0.45 : 0;
        return 1 - (1 - fur) * (1 - hair);
    }

    /**
     * Body hair density at every body vertex (0..1, before the amount), the
     * regions' bands relaxed over the mesh so the chains' joins (hip, shoulder,
     * wrist) blend. The skin's tint and the strands both read it, so they agree.
     */
    function hairField(pack, regions) {
        const key = JSON.stringify(regions);
        pack._hairFields = pack._hairFields || new Map();
        if (pack._hairFields.has(key)) return pack._hairFields.get(key);
        const Body = root.RRHumanBody || require('./HumanBody.js');
        const F = fields(pack), an = F.an, R = an.rest, N = F.normals;
        const famOf = v => { let best = 0; for (let fi = 1; fi < 5; fi++) if (an.member[v * 5 + fi] > an.member[v * 5 + best]) best = fi; return best; };
        let a = new Float32Array(pack.vertexCount);
        const verts = [...new Set(pack.body.source)];
        const p = { rest: [0, 0, 0], n: [0, 0, 0], s: 0, ang: 0, fam: 0, lips: 0, lids: 0, nose: 0 };
        for (const v of verts) {
            const fam = famOf(v);
            p.fam = fam; p.s = an.s[v * 5 + fam]; p.ang = an.angle[v * 5 + fam];
            for (let k = 0; k < 3; k++) { p.rest[k] = R[v * 3 + k]; p.n[k] = N[v * 3 + k]; }
            p.lips = F.lips[v]; p.lids = F.lids[v]; p.nose = F.nose[v];
            a[v] = hairDensity(regions, p);
        }
        const { offsets, flat } = Body.neighbors(pack);
        let b = new Float32Array(a.length);
        for (let pass = 0; pass < 4; pass++) {
            for (const v of verts) {
                const s0 = offsets[v], e = offsets[v + 1];
                let sum = 0;
                for (let i = s0; i < e; i++) sum += a[flat[i]];
                b[v] = e > s0 ? 0.5 * a[v] + 0.5 * sum / (e - s0) : a[v];
            }
            [a, b] = [b, a];
        }
        if (pack._hairFields.size > 6) pack._hairFields.clear();
        pack._hairFields.set(key, a);
        return a;
    }

    /**
     * Hair strands: short tapered lines grown from roots scattered through 3D
     * cells, each laid along the way hair grows at its root (down the limbs,
     * down and in on the chest, out over the face), so they read as hair
     * whatever the picture's layout. Returns how much of a texel at `p` is
     * covered (0..1). `texel` is the texel's size in meters: a strand finer
     * than it is drawn a texel wide and fainter, so it neither vanishes nor
     * swells.
     */
    function strandCover(p, density, length, texel, cells) {
        if (density <= 0.01) return 0;
        const [x, y, z] = p.rest, n = p.n;
        const cell = length * 0.8, inv = 1 / cell;
        const ix = Math.floor(x * inv), iy = Math.floor(y * inv), iz = Math.floor(z * inv);
        const real = 0.0004 + length * 0.006, width = Math.max(real, texel * 0.55), ink = Math.min(1, real / width * 2.6);
        const per = Math.max(1, Math.round(2 + density * 9));
        // Which way the hair lies: mostly down, out to the sides on the limbs and face.
        let flow = [0, -1, 0];
        if (p.fam === 1 || p.fam === 2) flow = [Math.sign(x) * 0.6, -0.8, 0];
        else if (p.fam === 0 && p.s > 4.3) flow = [Math.sign(x) * 0.7, -0.7, 0];
        else if (p.fam === 0 && p.s > 2.2) flow = [-Math.sign(x) * 0.35, -0.95, 0];
        let cover = 0;
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
            const cx = ix + a, cy = iy + b, cz = iz + c;
            const key = cx + ',' + cy + ',' + cz + ',' + per;
            // Each cell's roots, lengths and scatter, worked out once per picture.
            let roots = cells && cells.get(key);
            if (!roots) {
                roots = [];
                for (let k = 0; k < per; k++) {
                    roots.push({
                        on: hash3(cx * 7.1 + k * 13.3, cy * 3.7 - k, cz * 5.3 + k * 2.9),
                        r: [(cx + hash3(cx, cy + k, cz)) * cell, (cy + hash3(cy, cz + k, cx)) * cell, (cz + hash3(cz, cx + k, cy)) * cell],
                        j: [(hash3(cx + k, cy, cz * 2) - 0.5) * 0.7, (hash3(cx, cy * 2 + k, cz) - 0.5) * 0.7],
                        L: length * (0.6 + 0.6 * hash3(cz + k, cx, cy))
                    });
                }
                if (cells) cells.set(key, roots);
            }
            for (const root of roots) {
                if (root.on > density * 1.05) continue;
                const w0 = x - root.r[0], w1 = y - root.r[1], w2 = z - root.r[2];
                if (w0 * w0 + w1 * w1 + w2 * w2 > root.L * root.L * 1.2) continue;
                let d0 = flow[0] + root.j[0], d1 = flow[1], d2 = flow[2] + root.j[1];
                // Laid on the skin: the normal's share taken out.
                const dn = d0 * n[0] + d1 * n[1] + d2 * n[2];
                d0 -= n[0] * dn; d1 -= n[1] * dn; d2 -= n[2] * dn;
                const dl = Math.hypot(d0, d1, d2) || 1;
                d0 /= dl; d1 /= dl; d2 /= dl;
                const t = w0 * d0 + w1 * d1 + w2 * d2;
                if (t < 0 || t > root.L) continue;
                const o0 = w0 - d0 * t, o1 = w1 - d1 * t, o2 = w2 - d2 * t;
                const across = Math.abs(o0 * n[0] + o1 * n[1] + o2 * n[2]);
                if (across > cell * 0.6) continue;
                const side = Math.sqrt(Math.max(0, o0 * o0 + o1 * o1 + o2 * o2 - across * across));
                const taper = 1 - t / root.L;
                const reach = width * (0.45 + 0.55 * taper);
                if (side < reach) cover = Math.max(cover, (1 - side / reach) * ink * (0.6 + 0.4 * taper));
            }
        }
        return Math.min(1, cover);
    }

    /** Hair along the body's own grain: streaks running along the limb, or down the trunk. */
    function hairStrands(p, scale) {
        const [x, y, z] = p.rest;
        const along = p.fam === 0 ? y : p.s * 0.3;
        return noise3(x * 420 * scale, along * 70 * scale, z * 420 * scale) * 0.7 + noise3(x * 900, y * 160, z * 900) * 0.3;
    }

    /** Small overlapping scales measured in the body's surface chart, rather than stretched UV cells. */
    function skinScale(p,scale){
        const v=(p.cv??p.rest[1])*scale/.007,row=Math.floor(v),u=(p.cu??p.rest[0])*scale/.009+(row&1)*.5;
        const d=Math.hypot((fract(u)-.5)*1.75,(fract(v)-.43)*1.65),edge=1-smooth(.70,.94,d);
        return {edge,height:edge*(.3+.7*Math.max(0,1-d*d))*.00055};
    }
    /** A texel's skin color (linear) from the skin settings and where it lies. */
    function shadeSkin(s, base, p) {
        const accent = s.accent || Outfit.linear(s.color || '#5a4030'), belly = s.bellyRgb || (s.belly ? Outfit.linear(s.belly) : null);
        let rgb = base;
        const [x, y, z] = p.rest;
        // Skin's own unevenness, each in its own hue: broad patches where blood shows more (redder) or less,
        // a finer mottle of pigment (browner), and the grain of the pores.
        const stored = p.noise && !Number.isNaN(p.noise[p.noiseOffset]);
        const blood = stored ? p.noise[p.noiseOffset] : noise3(x * 14, y * 14, z * 14) - 0.5 + (noise3(x * 37 + 5.2, y * 37, z * 37) - 0.5) * 0.5;
        const pigment = stored ? p.noise[p.noiseOffset + 1] : noise3(x * 75 + 3.1, y * 75, z * 75) - 0.5;
        const grain = stored ? p.noise[p.noiseOffset + 2] : noise3(x * 400, y * 400, z * 400) - 0.5;
        if (p.noise && !stored) { p.noise[p.noiseOffset] = blood; p.noise[p.noiseOffset + 1] = pigment; p.noise[p.noiseOffset + 2] = grain; }
        rgb = [rgb[0] * (1 + 0.06 * blood - 0.05 * pigment + 0.05 * grain), rgb[1] * (1 - 0.04 * blood - 0.07 * pigment + 0.05 * grain), rgb[2] * (1 - 0.035 * blood - 0.09 * pigment + 0.05 * grain)];
        // Where blood shows: the nose, the ears, the cheeks; the knuckles, elbows and knees.
        const flush = mix(rgb, rgb.map((c, i) => c * [1.12, 0.78, 0.74][i]), 1);
        let warm = p.nose * 0.45 + p.ears * 0.5 + p.cheeks * 0.32;
        if (p.fam === 1 || p.fam === 2) warm += smooth(0.07, 0, Math.abs(p.s - 3.25)) * 0.35 + smooth(0.12, 0, Math.abs(p.s - 2.0)) * Math.max(0, -p.n[2]) * 0.3;
        if (p.fam === 3 || p.fam === 4) warm += smooth(0.14, 0, Math.abs(p.s - 1.0)) * Math.max(0, p.n[2]) * 0.3;
        rgb = mix(rgb, flush, Math.min(1, warm) * 0.55);
        // The eyelids a little darker, cooler; under the eyes a faint shadow of the same hue.
        if (p.lids > 0.15) rgb = mix(rgb, rgb.map((c, i) => c * [0.8, 0.74, 0.8][i]), smooth(0.15, 0.6, p.lids) * 0.22);
        if (p.bags > 0.2) rgb = mix(rgb, rgb.map((c, i) => c * [0.88, 0.82, 0.88][i]), smooth(0.2, 0.7, p.bags) * 0.3 * (1 - smooth(0.15, 0.4, p.lids)));
        // The palms and soles paler, the more so on deep skin.
        const deep = 1 - Math.min(1, (base[0] * 0.3 + base[1] * 0.55 + base[2] * 0.15) * 2.2);
        const palm = (p.fam === 1 || p.fam === 2) ? smooth(2.9, 3.1, p.s) * smooth(-0.1, -0.5, p.n[1]) : (p.fam === 3 || p.fam === 4) ? smooth(1.9, 2.05, p.s) * smooth(-0.3, -0.7, p.n[1]) : 0;
        if (palm > 0) rgb = mix(rgb, rgb.map((c, i) => Math.min(1, c * [1.7, 1.6, 1.5][i])), palm * (0.15 + 0.45 * deep));
        // Where a beard grows: under facial hair, its color in the skin, a shadow and the grain of its
        // follicles, thinning at a soft edge, so skin shows between the hairs there; on a shaved man the
        // same zone carries a faint cool stubble shadow.
        if (p.beardD > 0.01) {
            // A beard grows right up to the lips' edge.
            const d = p.beardD, lips = 1 - smooth(0.45, 0.62, p.lips);
            const [d1] = cells(x, y, z, 0.0012);
            const grain = (d1 < 0.34 ? 1 - d1 / 0.34 : 0) * (hash3(Math.floor(x * 830), Math.floor(y * 830), Math.floor(z * 830)) < 0.25 + 0.65 * d ? 1 : 0);
            if (s.facial) {
                // The hair's own color laid into the skin, densest well inside the zone; the follicles a
                // fine darker grain over it, so the beard's edge reads as hair thinning, not a cut line.
                // Stubble reads cooler than the hair itself: the hairs under the skin seen through it.
                const under = s.facial.rgb.map((c, i) => Math.min(rgb[i], c * 1.25) * (1 - s.facial.stubble * 0.35) + rgb[i] * [0.62, 0.64, 0.7][i] * s.facial.stubble * 0.35), a = s.facial.amount;
                // Not much darker than skin: under a dark albedo the skin's own shine reads as a grey film.
                rgb = mix(rgb, under, d * (0.45 + 0.3 * s.facial.stubble) * lips * a);
                rgb = mix(rgb, s.facial.rgb, grain * (0.4 + 0.3 * s.facial.stubble) * Math.sqrt(d) * lips * a);
            } else if (s.beard) {
                rgb = mix(rgb, rgb.map((c, i) => c * [0.74, 0.77, 0.84][i]), d * lips * s.beard * (0.3 + 0.25 * grain));
            }
        }
        // A paler front: the belly, the throat, the insides of the limbs.
        if (belly) {
            const front = p.fam === 0 ? smooth(0.35, 0.85, p.n[2]) * smooth(-0.4, 0.2, p.s) * (1 - smooth(4.4, 4.9, p.s)) : smooth(0.2, 0.9, -p.n[1]) * 0.8;
            rgb = mix(rgb, belly, front * s.amount);
        }
        const k = s.scale;
        let t = 0;
        switch (s.type) {
            case 'moles': {
                const cell = cellSeed(x, y, z, 0.065 / k);
                t = cell.d1 < 0.065 && hash3(...cell.c) > 0.87 ? 1 : 0;
                break;
            }
            case 'scars': {
                const seam = Math.abs(x + y * 0.18 + Math.sin(z * 14) * 0.012 - 0.31);
                const stitches = Math.abs(fract(y * 65) - 0.5) < 0.08;
                t = seam < 0.0025 / k || (seam < 0.008 / k && stitches) ? smooth(0.1, 0.7, p.n[2]) : 0;
                break;
            }
            case 'veins': {
                const [a, b] = cells(x, y * 0.5, z, 0.055 / k);
                t = (1 - smooth(0.005, 0.025, b - a)) * 0.8;
                break;
            }
            case 'stone': {
                const [a, b] = cells(x, y, z, 0.06 / k);
                t = (1 - smooth(0.01, 0.045, b - a)) * 0.7 + noise3(x * 160, y * 160, z * 160) * 0.3;
                break;
            }
            case 'marble': {
                const v = Math.sin((x * 16 + y * 9 + noise3(x * 8, y * 8, z * 8) * 8) * k);
                t = (1 - smooth(0.02, 0.13, Math.abs(v))) * 0.9;
                break;
            }
            case 'lava': {
                const [a, b] = cells(x, y, z, 0.085 / k);
                t = 1 - smooth(0.01, 0.065, b - a);
                break;
            }
            case 'freckles': {
                const [d1] = cells(x, y, z, 0.006 / k);
                const where = p.fam === 0 ? smooth(4.6, 5.0, p.s) * smooth(0.3, 0.8, p.n[2]) + smooth(3.3, 3.8, p.s) * (1 - smooth(4.0, 4.2, p.s)) * 0.6 : 0.3;
                t = d1 < 0.22 && hash3(Math.floor(x * 500), Math.floor(y * 500), Math.floor(z * 500)) > 0.4 ? where : 0;
                break;
            }
            case 'scales': {
                const cell=skinScale(p,k);t=(1-cell.edge)*.40+.045;
                break;
            }
            case 'feathers': {
                // Overlapping feathers, tips down: each one's upper part lies in the shadow of the one
                // above, its rounded tip catches the light with a fine dark outline, and a shaft runs
                // down its middle.
                const f = cellSeed(x, y * 1.35, z, 0.016 / k);
                const v = f.p[1] - f.c[1], across = Math.hypot(f.p[0] - f.c[0], f.p[2] - f.c[2]);
                const edge = 1 - smooth(0.0, 0.08, f.d2 - f.d1);
                const covered = smooth(-0.15, 0.45, v);
                const tip = edge * smooth(0.05, -0.2, v);
                const shaft = smooth(0.06, 0.02, across) * smooth(0.35, -0.1, v) * 0.5;
                t = covered * 0.55 + tip * 0.7 + shaft - smooth(0.0, -0.35, v) * (1 - edge) * 0.15;
                break;
            }
            case 'stripes': {
                const along = p.fam === 0 ? y * 9 : p.s * 2.2;
                const wob = noise3(x * 8, y * 8, z * 8) * 0.9;
                const v = Math.abs(Math.sin((along * k + wob) * Math.PI));
                const side = p.fam === 0 ? 1 - smooth(0.4, 0.9, p.n[2]) * 0.8 : 1;
                t = smooth(0.82, 0.92, v) * side;
                break;
            }
            case 'spots': {
                const [d1] = cells(x, y, z, 0.035 / k);
                t = (d1 > 0.18 && d1 < 0.34 ? 1 : d1 < 0.12 ? 0.6 : 0);
                break;
            }
            case 'fur': {
                const streak = noise3(x * 40, y * 220, z * 40);
                const back = p.fam === 0 ? smooth(0.1, -0.8, p.n[2]) : smooth(-0.2, 0.6, p.n[1]);
                t = back * 0.75 + (streak - 0.5) * 0.35;
                break;
            }
            case 'decay': {
                const blot = noise3(x * 11, y * 11, z * 11) + noise3(x * 31, y * 31, z * 31) * 0.5;
                const vein = Math.abs(noise3(x * 45, y * 45, z * 45) - 0.5) < 0.025 ? 1 : 0;
                t = Math.max(smooth(0.85, 1.15, blot), vein * 0.8);
                break;
            }
            case 'panels': {
                const along = p.fam === 0 ? y * 5 : p.s * 1.5;
                const line = Math.abs(fract(along * k) - 0.5) > 0.48 || Math.abs(Math.abs(p.ang) - Math.PI / 2) < 0.012;
                t = line ? 1 : 0;
                break;
            }
            case 'tribal': {
                // Bands round the upper arms and forearms, a chevron on the chest.
                if (p.fam === 1 || p.fam === 2) t = (Math.abs(p.s - 1.55) < 0.06 || Math.abs(p.s - 1.72) < 0.03 || Math.abs(p.s - 2.6) < 0.05) ? 1 : 0;
                else if (p.fam === 0 && p.n[2] > 0.3) { const v = p.s - 3.0 + Math.abs(x) * 6; t = Math.abs(v) < 0.08 || Math.abs(v - 0.25) < 0.04 ? 1 : 0; }
                break;
            }
            case 'vitiligo': {
                const v = noise3(x * 7, y * 7, z * 7) + noise3(x * 19, y * 19, z * 19) * 0.4;
                t = smooth(0.92, 0.97, v);
                break;
            }
        }
        if (s.type !== 'none') rgb = mix(rgb, s.type === 'vitiligo' ? Outfit.linear('#f2e6dc') : accent, Math.max(0, Math.min(1, t)) * s.amount);
        // A small oval recess with an upper hood. Its landmark is on the rest skin, so
        // pigment stays registered with the modeled navel as the abdomen changes shape.
        if (s.navel && p.fam === 0 && Math.abs(z - s.navel[2]) < 0.025) {
            const nx = (x - s.navel[0]) / 0.0045, ny = (y - s.navel[1]) / 0.007;
            const radius = Math.hypot(nx, ny);
            if (radius < 2.5) {
                const recess = Math.exp(-radius * radius * 1.8);
                const hood = Math.exp(-nx * nx * 1.4 - ((ny - 0.55) / 0.28) ** 2);
                const rim = Math.exp(-(((radius - 1.1) / 0.3) ** 2)) * Math.max(0, -ny);
                rgb = rgb.map(c => c * (1 - 0.58 * recess - 0.16 * hood + 0.09 * rim));
            }
        }
        // Areolas are a patch of their own (RRCharacterDetail); a painted one is kept only when asked.
        if (s.nipples && s.paintAreolas) for (const c of s.nipples) {
            const d = Math.hypot(x - c[0], y - c[1], z - c[2]);
            if (d > s.areola * 1.2) continue;
            const area = 1 - smooth(s.areola * 0.8, s.areola * 1.15, d), tip = 1 - smooth(s.areola * 0.22, s.areola * 0.32, d);
            rgb = mix(rgb, s.areolaRgb || rgb.map((c2, i) => c2 * [0.72, 0.52, 0.5][i]), area * 0.75);
            rgb = mix(rgb, rgb.map((c2, i) => c2 * [0.82, 0.72, 0.72][i]), tip);
        }
        // A woman's crotch: the folds a little darker and warmer along the middle.
        if (s.crotch && p.fam === 0) {
            const dx = Math.abs(x - s.crotch[0]), dy = y - s.crotch[1];
            if (dx < 0.012 && dy > -0.01 && dy < 0.05 && z > s.crotch[2] - 0.03) {
                const fold = (1 - smooth(0.0015, 0.009, dx)) * Math.sin(Math.min(1, Math.max(0, (dy + 0.005) / 0.05)) * Math.PI);
                rgb = mix(rgb, rgb.map((c2, i) => c2 * [0.7, 0.55, 0.55][i]), Math.min(1, fold * 0.8 * s.fold));
            }
        }
        // The dedicated anatomical atlas resolves small pigment folds the whole-body picture cannot.
        // These are color variations; the mesh and actual lights supply the surface relief.
        if (p.genitalProfile) {
            const detail = p.genitalProfile;
            rgb = mix(rgb, rgb.map((c, i) => c * [1.01, 0.68, 0.7][i]), detail.tissue * 0.65);
            rgb = mix(rgb, rgb.map((c, i) => c * [0.76, 0.59, 0.6][i]), Math.min(0.7, detail.crease));
        }
        // Body hair, painted: darker strands thickening with the amount.
        if (s.bodyHair && s.bodyHair.amount > 0) {
            const bh = s.bodyHair, here = p.hair ?? hairDensity(bh.regions, p);
            // The hair itself is strands over the skin (RRCharacterDetail). Under fur the skin takes the fur's
            // color, so none shows between the tufts; under thick hair it darkens a little toward the hair's.
            if (bh.fur > 0.05) rgb = mix(rgb, bh.rgb, Math.min(1, here * Math.max(bh.amount, bh.fur)) * Math.min(1, bh.fur * 1.4) * 0.95);
            // Under the locks, as on a scalp, the skin takes on the hair's color in fine streaks along its
            // lie: what thick hair reads as from across a room, where single hairs are too fine to see.
            if (bh.amount > 0.01) {
                const dens = here * bh.amount;
                if (dens > 0.05) {
                    const streak = noise3(x * 420, y * 70, z * 420) * 0.6 + noise3(x * 900, y * 140, z * 900) * 0.4;
                    rgb = mix(rgb, bh.rgb, smooth(0.05, 1, dens) * 0.45 * (0.55 + 0.9 * streak));
                }
            }
        }
        // Under head hair the scalp takes the hair's root color, so nothing pale shows between the locks.
        if (s.scalp && s.scalpField && p.fam === 0) {
            // The scalp under the style's own hair zone (the same one its locks grow from), so paint and hair agree;
            // its edge breaks into fine hairs along their lie, not a band of shade.
            let cover = p.scalpD;
            if (cover > 0 && cover < 1) cover *= Math.min(1, 0.2 + 1.6 * cover * (0.35 + 0.65 * noise3(x * 1100, y * 140, z * 1100)));
            // In fine streaks along the hair's lie, lighter and darker, so the painted roots read as hair, not a cap.
            if (cover > 0) {
                const streak = noise3(x * 700, y * 90, z * 700) * 0.65 + noise3(x * 1500, y * 200, z * 1500) * 0.35;
                rgb = mix(rgb, s.scalp.rgb.map(c => c * (0.78 + 0.4 * streak)), cover * (0.82 + 0.15 * streak) * s.scalp.amount);
            }
        } else if (s.scalp && p.fam === 0 && p.s > 4.6) {
            const front = Math.cos(p.ang), side = Math.abs(Math.sin(p.ang));
            // The hairline: high on the forehead, down over the temples, low at the nape; a little uneven.
            const line = front > 0 ? 5.64 - 0.42 * side * side + s.scalp.recede * 0.25 * (1 - side) : 5.22 - 0.3 * Math.min(1, -front * 1.4);
            const wobble = (noise3(x * 60, y * 60, z * 60) - 0.5) * 0.05;
            let cover = smooth(line - 0.05, line + 0.05, p.s + wobble) * (1 - smooth(0.25, 0.6, p.ears || 0));
            // At its edge the hairline breaks into fine hairs along their lie, not a soft band of shade.
            if (cover > 0 && cover < 1) cover *= Math.min(1, 0.25 + 1.5 * cover * (0.35 + 0.65 * noise3(x * 1100, y * 140, z * 1100)));
            if (cover > 0) rgb = mix(rgb, s.scalp.rgb, cover * 0.95);
        }
        // Round the eye: the caruncle a soft pink at the inner corner, the lower lid's wet rim a little pinker
        // and lighter.
        if (p.fam === 0 && p.s > 4.4 && s.marks) {
            const e = s.marks.eye, R = s.marks.eyeR, dx = Math.abs(x) - e[0], dy = y - e[1];
            if (Math.abs(dx) < R * 1.4 && Math.abs(dy) < R && z > e[2] - R * 0.4) {
                // The lids' margins: an ellipse round the opening.
                const q = Math.hypot(dx / (R * 0.95), dy / (R * 0.46)), band = Math.max(0, 1 - Math.abs(q - 1) / 0.2);
                if (band > 0 && dy < 0) rgb = mix(rgb, rgb.map((c, i) => Math.min(1, c * [1.12, 0.9, 0.9][i])), band * 0.5 * smooth(-0.1, -0.35, dy / R));
                const caruncle = Math.max(0, 1 - Math.hypot((dx + R * 0.86) / (R * 0.16), dy / (R * 0.16)));
                if (caruncle > 0) rgb = mix(rgb, rgb.map((c, i) => c * [1.08, 0.7, 0.7][i]), Math.min(1, caruncle * 1.5) * 0.7);
            }
        }
        // An aged face: its lines, darker and a little warmer in their depth; and age spots on the face.
        if (s.ageing > 0 && p.fam === 0 && p.s > 4.0) {
            const w = wrinkles(s.marks, p, s.ageing);
            if (w > 0) rgb = mix(rgb, rgb.map((c, i) => c * [0.74, 0.66, 0.66][i]), w * 0.55);
            if (p.s > 4.4 && s.ageing > 0.4) {
                const [d1] = cells(x, y, z, 0.009);
                if (d1 < 0.16 && hash3(Math.floor(x * 110), Math.floor(y * 110), Math.floor(z * 110)) > 0.82) rgb = mix(rgb, rgb.map((c, i) => c * [0.82, 0.72, 0.62][i]), (s.ageing - 0.4) * 0.5 * (1 - d1 / 0.16));
            }
        }
        // With the ears folded away, the ear's own skin is the inside of the ear hole: dark.
        if (s.earHoles && p.ears > 0.7) rgb = mix(rgb, rgb.map(c => c * 0.12), smooth(0.7, 0.95, p.ears));
        // Blush, lips and eye shadow on the face.
        // An animal's nose pad: its own color over the tip of the nose, where the nose stands furthest out.
        if (s.nose && p.noseTip > 0.35 && p.n[2] > -0.2) rgb = mix(rgb, Outfit.linear(s.nose), smooth(0.35, 0.7, p.noseTip) * smooth(-0.2, 0.3, p.n[2]));
        if (s.blush) rgb = mix(rgb, mix(rgb, Outfit.linear('#c0484a'), 0.6), p.cheeks * s.blush * 0.6);
        if (p.lips > 0.12) {
            // The lip's own color, rosier and deeper than the skin, blending into it over a soft vermilion
            // border (no outline); fine upright lines across the lips, fainter toward their edge.
            const lip = s.lips ? Outfit.linear(s.lips) : rgb.map((c, i) => c * [0.76, 0.5, 0.54][i]);
            const body = smooth(0.12, 0.62, p.lips);
            const lines = smooth(0.5, 0.9, p.lips) * (0.5 + 0.5 * Math.sin(x * 2600 + noise3(x * 300, y * 900, z * 300) * 5)) * (0.5 + 0.5 * noise3(x * 500, y * 140, z * 500));
            // The inner roll where the lips meet lies in the other lip's shade.
            rgb = mix(rgb, lip.map(c => c * (1 - 0.08 * lines) * (1 - 0.6 * Math.min(1, p.innerLip * 2))), body);
        }
        // The line where the lips meet, in shade.
        if (p.seam > 0.05) rgb = mix(rgb, rgb.map((c, i) => c * [0.58, 0.46, 0.48][i]), Math.min(1, p.seam) * 0.6);
        if (s.eyeshadow && p.lids > 0.2) rgb = mix(rgb, Outfit.linear(s.eyeshadow), smooth(0.2, 0.6, p.lids) * s.shadowAmount);
        return rgb;
    }

    /**
     * The fur picture, in the same layout as the skin: color from the hair's,
     * alpha the strands, thinning where body hair thins. Two shells over the
     * body show it, cut at two heights of alpha, so the fur tapers outward.
     */
    function paintFur(pack, bodyHair, options) {
        return paint(pack, '#000000', {}, Object.assign({}, options, { fur: normalizeBodyHair(bodyHair), name: 'fur.png' }));
    }

    const rasterCache = new WeakMap();

    function rasterPlan(pack, size) {
        let sizes = rasterCache.get(pack);
        if (sizes?.has(size)) return sizes.get(size);
        const body = pack.body, owners = new Int32Array(size * size), inside = new Uint8Array(size * size);
        for (let triangle = 0; triangle < body.index.length; triangle += 3) {
            const vertices = [body.index[triangle], body.index[triangle + 1], body.index[triangle + 2]];
            const horizontal = vertices.map(vertex => body.uv[vertex * 2] * size);
            const vertical = vertices.map(vertex => body.uv[vertex * 2 + 1] * size);
            const area = (horizontal[1] - horizontal[0]) * (vertical[2] - vertical[0]) - (horizontal[2] - horizontal[0]) * (vertical[1] - vertical[0]);
            if (Math.abs(area) < 1e-9) continue;
            const left = Math.max(0, Math.floor(Math.min(...horizontal)) - 1), right = Math.min(size - 1, Math.ceil(Math.max(...horizontal)) + 1);
            const top = Math.max(0, Math.floor(Math.min(...vertical)) - 1), bottom = Math.min(size - 1, Math.ceil(Math.max(...vertical)) + 1);
            const tolerance = -0.75 / Math.sqrt(Math.abs(area));
            for (let row = top; row <= bottom; row++) for (let column = left; column <= right; column++) {
                const pixel = row * size + column;
                if (inside[pixel]) continue;
                const horizontalCenter = column + 0.5, verticalCenter = row + 0.5;
                const first = ((horizontal[1] - horizontalCenter) * (vertical[2] - verticalCenter) - (horizontal[2] - horizontalCenter) * (vertical[1] - verticalCenter)) / area;
                const second = ((horizontal[2] - horizontalCenter) * (vertical[0] - verticalCenter) - (horizontal[0] - horizontalCenter) * (vertical[2] - verticalCenter)) / area;
                const third = 1 - first - second;
                if (first < tolerance || second < tolerance || third < tolerance) continue;
                owners[pixel] = triangle + 1;
                inside[pixel] = first >= 0 && second >= 0 && third >= 0 ? 1 : 0;
            }
        }
        const result = { owners, noise: size <= 256 ? new Float64Array(size * size * 3).fill(NaN) : null };
        if (size <= 256) {
            if (!sizes) { sizes = new Map(); rasterCache.set(pack, sizes); }
            if (sizes.size >= 2) sizes.delete(sizes.keys().next().value);
            sizes.set(size, result);
        }
        return result;
    }

    /** External anatomical landmarks in the source frame; shared by shape, pigment and relief. */
    function genitalProfile(x, y, z, female, anatomy) {
        const a = anatomy || {}, gauss = (d, w) => Math.exp(-((d / w) ** 2));
        let height = 0, tissue = 0, crease = 0, micro = 0;
        if (female) {
            const up = y + 0.042, ax = Math.abs(x), inner = a.innerLabia ?? 1, clitoris = a.clitoris ?? 1, fold = a.fold ?? 1;
            const along = smooth(-0.003, 0.008, up) * (1 - smooth(0.05, 0.073, up));
            const width = (0.003 + 0.0035 * Math.sin(Math.max(0, Math.min(1, up / 0.065)) * Math.PI)) * (0.65 + 0.35 * Math.sqrt(inner));
            const lip = gauss(ax - width, 0.0016 + inner * 0.00065) * along;
            const sulcus = gauss(ax - width - 0.0045, 0.0012) * along;
            const cleft = gauss(x, 0.0014) * along;
            const vestibule = gauss(x, 0.0035) * gauss(up - 0.02, 0.016);
            const hood = gauss(x, 0.0038 + 0.001 * Math.sqrt(clitoris)) * gauss(up - 0.058, 0.006);
            const glans = gauss(x, 0.0022 * Math.max(0.5, Math.sqrt(clitoris))) * gauss(up - 0.05, 0.0028);
            const opening = gauss(x, 0.0024) * gauss(up - 0.012, 0.0045);
            height = lip * 0.0025 * inner + hood * 0.002 * Math.sqrt(clitoris) + glans * 0.0012 * clitoris
                - (cleft * 0.0007 + vestibule * 0.001 + sulcus * 0.0005 + opening * 0.0007) * fold;
            tissue = Math.min(1, (lip * 0.6 + vestibule * 0.65 + glans * 0.25) * Math.min(1, inner));
            crease = Math.min(1, (cleft * 0.5 + sulcus * 0.25 + opening * 0.45) * fold);
            micro = (gauss(ax - width - 0.0035, 0.0005) * -0.0002 * fold
                + Math.sin(up * 1900 + Math.sin(x * 700)) * 0.000015 * lip) * Math.min(1, inner);
        } else {
            const shaft = smooth(0.097, 0.117, z), sac = 1 - smooth(0.095, 0.111, z);
            const circumcised = a.foreskin !== 'uncircumcised';
            const corona = gauss(y + 0.080, 0.0028) * shaft;
            const sulcus = gauss(y + 0.075, 0.0011) * shaft;
            const prepuce = gauss(y + 0.091, 0.007) * shaft;
            const rim = gauss(y + 0.096, 0.0015) * shaft;
            const web = gauss(x, 0.018) * gauss(y + 0.041, 0.018) * gauss(z - 0.092, 0.018);
            const root = gauss(y + 0.018, 0.0017) * shaft;
            const opening = gauss(x, 0.0012) * gauss(y + 0.097, 0.0015) * smooth(0.13, 0.138, z);
            const raphe = gauss(x, 0.0012) * sac * smooth(-0.098, -0.075, y) * (1 - smooth(-0.04, -0.025, y));
            height = web * 0.0035 - opening * 0.00035 + (circumcised ? corona * 0.0008 - sulcus * 0.00035 : prepuce * 0.0015 + rim * 0.0003);
            tissue = circumcised ? smooth(-0.075, -0.085, y) * shaft * 0.7 : smooth(-0.094, -0.099, y) * shaft * 0.25;
            crease = opening * 0.5 + root * 0.35 + raphe * 0.2 + (circumcised ? sulcus * 0.4 : rim * 0.25);
            const rugae = Math.sin(y * 1400 + Math.sin(x * 760 + z * 190) * 1.8) * Math.sin(x * 1030 + z * 430);
            micro = sac * (rugae * 0.000004 - raphe * 0.000015) + shaft * Math.sin(y * 2400 + x * 350) * 0.000004
                - (circumcised ? sulcus : rim) * 0.0002 - root * 0.00015;
        }
        return { height, tissue, crease, micro };
    }

    /** The skin picture: { width, height, data (RGBA bytes), name }. */
    function paint(pack, skinHex, settings, options) {
        const s = normalizeSkin(settings);
        s.accent = Outfit.linear(s.color || '#5a4030');
        s.bellyRgb = s.belly ? Outfit.linear(s.belly) : null;
        // The body's picture spans about 1.8 m of skin: a texel's size, for strands finer than one.
        s.texel = 1.8 / ((options && options.size) || 1024);
        const fur = options && options.fur;
        const furRgb = fur ? Outfit.linear(fur.color || '#2a1d15') : null;
        const size = (options && options.size) || 1024;
        const F = fields(pack), an = F.an, R = an.rest, N = F.normals;
        const base = Outfit.linear(skinHex || '#c69c7f');
        const data = new Uint8Array(size * size * 4), filled = new Uint8Array(size * size);
        const body = pack.body;
        const raster = rasterPlan(pack, size), owners = raster.owners;
        const p = { rest: [0, 0, 0], n: [0, 0, 0], s: 0, ang: 0, fam: 0, lips: 0, innerLip: 0, lids: 0, bags: 0, seam: 0, beardD: 0, scalpD: 0, cheeks: 0, nose: 0, noseTip: 0, ears: 0, jaw: 0 };
        p.noise = raster.noise;
        s.beard = Math.max(0, Math.min(1, (options && options.beard) || 0));
        s.genitalDetail = options && options.genitalDetail;
        const detailProfile = s.genitalDetail ? genitalProfile : null;
        const scaleRelief=s.type==='scales'&&!fur;
        const relief = (detailProfile||scaleRelief) && options?.relief !== false ? new Float32Array(size * size) : null;
        const canonical = detailProfile ? pack.positions : null;
        const genitalPoint = [0, 0, 0];
        s.earHoles = !!(options && options.earHoles);
        // Age (years, from ageStep): the face's lines grow in from 35 and deepen to 85.
        s.ageing = options && options.age ? smooth(35, 85, options.age) : 0;
        // Facial hair: { style, color } paints its zone into the skin; a shaved man's shadow uses a full beard's zone.
        const facial = options && options.facial && options.facial.style && options.facial.style !== 'none' ? options.facial : null;
        if (facial) s.facial = { rgb: Outfit.linear(facial.color || '#2a1d15').map(c => c * 0.85), amount: 1, stubble: facial.style === 'stubble' ? 1 : 0 };
        s.beardField = facial || s.beard ? beardField(pack, facial ? facial.style : 'fullBeard') : null;
        s.marks = F.marks;
        const navel = (root.RRHumanBody || require('./HumanBody.js')).anatomyFields(pack).navel;
        s.navel = [R[navel * 3], R[navel * 3 + 1], R[navel * 3 + 2]];
        if (options && options.scalp) {
            s.scalp = { rgb: Outfit.linear(options.scalp.color).map(c => c * 0.9), recede: options.scalp.recede || 0, amount: 1 };
            const zone = options.scalp.style ? scalpZone(pack, options.scalp.style, s.scalp.recede) : null;
            if (zone) { s.scalpField = zone.field; s.scalp.amount = zone.amount; }
        }
        if (options && options.bodyHair && (options.bodyHair.amount > 0.01 || options.bodyHair.fur > 0.05)) {
            s.bodyHair = Object.assign({}, options.bodyHair, { rgb: Outfit.linear(options.bodyHair.color || '#2a1d15') });
            s.hairField = hairField(pack, s.bodyHair.regions);
        }
        // Anatomy: the areolas (sized by the bust) and a woman's crotch, at their places on the average body.
        const A = options && options.anatomy;
        if (A && A.detail) {
            const Body = root.RRHumanBody || require('./HumanBody.js');
            const AF = Body.anatomyFields(pack), R0 = F.an.rest;
            s.nipples = AF.nipples.map(n => [R0[n.v * 3], R0[n.v * 3 + 1], R0[n.v * 3 + 2]]);
            // Painted on the average body: a bigger bust stretches the skin, and the areola with it.
            s.areola = (A.female ? 0.016 : 0.011) * (A.areola || 1);
            s.areolaRgb = A.areolaColor ? Outfit.linear(A.areolaColor) : null;
            s.fold = A.fold ?? 1;
            s.crotch = A.female ? [R0[AF.low * 3], R0[AF.low * 3 + 1], R0[AF.low * 3 + 2]] : null;
        }
        const famOf = v => { let best = 0; for (let fi = 1; fi < 5; fi++) if (an.member[v * 5 + fi] > an.member[v * 5 + best]) best = fi; return best; };
        for (let t = 0; t < body.index.length; t += 3) {
            const r = [body.index[t], body.index[t + 1], body.index[t + 2]];
            const v = r.map(i => body.source[i]);
            const fam = famOf(v[0]);
            const px = r.map(i => body.uv[i * 2] * size), py = r.map(i => body.uv[i * 2 + 1] * size);
            const area = (px[1] - px[0]) * (py[2] - py[0]) - (px[2] - px[0]) * (py[1] - py[0]);
            if (Math.abs(area) < 1e-9) continue;
            let angs = v.map(q => an.angle[q * 5 + fam]);
            if (Math.max(...angs) - Math.min(...angs) > Math.PI) angs = angs.map(a => (a < 0 ? a + Math.PI * 2 : a));
            const x0 = Math.max(0, Math.floor(Math.min(...px)) - 1), x1 = Math.min(size - 1, Math.ceil(Math.max(...px)) + 1);
            const y0 = Math.max(0, Math.floor(Math.min(...py)) - 1), y1 = Math.min(size - 1, Math.ceil(Math.max(...py)) + 1);
            const tol = -0.75 / Math.sqrt(Math.abs(area));
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const o = y * size + x;
                if (owners[o] !== t + 1) continue;
                p.noiseOffset = o * 3;
                const cx = x + 0.5, cy = y + 0.5;
                let w0 = ((px[1] - cx) * (py[2] - cy) - (px[2] - cx) * (py[1] - cy)) / area;
                let w1 = ((px[2] - cx) * (py[0] - cy) - (px[0] - cx) * (py[2] - cy)) / area;
                let w2 = 1 - w0 - w1;
                if (w0 < tol || w1 < tol || w2 < tol) continue;
                if (filled[o] === 2) continue;
                const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
                w0 = Math.max(0, w0); w1 = Math.max(0, w1); w2 = Math.max(0, w2);
                const ws = w0 + w1 + w2; w0 /= ws; w1 /= ws; w2 /= ws;
                const W = [w0, w1, w2];
                for (let k = 0; k < 3; k++) {
                    p.rest[k] = R[v[0] * 3 + k] * w0 + R[v[1] * 3 + k] * w1 + R[v[2] * 3 + k] * w2;
                    p.n[k] = N[v[0] * 3 + k] * w0 + N[v[1] * 3 + k] * w1 + N[v[2] * 3 + k] * w2;
                    if (canonical) genitalPoint[k] = canonical[v[0] * 3 + k] * w0 + canonical[v[1] * 3 + k] * w1 + canonical[v[2] * 3 + k] * w2;
                }
                if (detailProfile) {
                    p.genitalProfile = detailProfile(...genitalPoint, s.genitalDetail.female, options.anatomy);
                    if (relief) relief[o] = p.genitalProfile.micro;
                }
                p.fam = fam;
                p.s = W.reduce((sum, w, k) => sum + w * an.s[v[k] * 5 + fam], 0);
                p.ang = W.reduce((sum, w, k) => sum + w * angs[k], 0);
                p.cu=p.ang*an.radius[fam];p.cv=p.s*an.unit[fam];
                if(scaleRelief&&relief)relief[o]=skinScale(p,s.scale).height;
                p.lips = W.reduce((sum, w, k) => sum + w * F.lips[v[k]], 0);
                p.lids = W.reduce((sum, w, k) => sum + w * F.lids[v[k]], 0);
                p.cheeks = W.reduce((sum, w, k) => sum + w * F.cheeks[v[k]], 0);
                p.bags = W.reduce((sum, w, k) => sum + w * F.bags[v[k]], 0);
                p.innerLip = W.reduce((sum, w, k) => sum + w * F.innerLip[v[k]], 0);
                p.seam = W.reduce((sum, w, k) => sum + w * F.seam[v[k]], 0);
                p.nose = W.reduce((sum, w, k) => sum + w * F.nose[v[k]], 0);
                p.noseTip = W.reduce((sum, w, k) => sum + w * F.noseTip[v[k]], 0);
                p.ears = W.reduce((sum, w, k) => sum + w * F.ears[v[k]], 0);
                p.jaw = W.reduce((sum, w, k) => sum + w * F.jaw[v[k]], 0);
                if (s.hairField) p.hair = s.hairField[v[0]] * w0 + s.hairField[v[1]] * w1 + s.hairField[v[2]] * w2;
                p.scalpD = s.scalpField ? s.scalpField[v[0]] * w0 + s.scalpField[v[1]] * w1 + s.scalpField[v[2]] * w2 : 0;
                p.beardD = s.beardField ? s.beardField[v[0]] * w0 + s.beardField[v[1]] * w1 + s.beardField[v[2]] * w2 : 0;
                let rgb, alpha = 255;
                if (fur) {
                    const dens = Math.min(1, hairDensity(fur.regions, p) * (0.4 + fur.fur * 0.8));
                    const strand = hairStrands(p, 1.6);
                    // Fur: strands, longer and many, their alpha the fur's coverage; the color varies a little.
                    const cover = strandCover(p, Math.min(1, dens * 1.4), 0.014 * fur.length, s.texel, s.strands || (s.strands = new Map()));
                    alpha = Math.round(Math.min(1, cover * 1.15) * 255);
                    rgb = furRgb.map(c => c * (0.75 + strand * 0.35));
                } else rgb = shadeSkin(s, base, p);
                data[o * 4] = toByte(rgb[0]); data[o * 4 + 1] = toByte(rgb[1]); data[o * 4 + 2] = toByte(rgb[2]); data[o * 4 + 3] = alpha;
                filled[o] = inside ? 2 : 1;
            }
        }
        // Empty texels take the skin color, so filtering at a seam never reads black.
        const fill = (furRgb || base).map(toByte);
        for (let o = 0; o < size * size; o++) if (!filled[o]) { data[o * 4] = fill[0]; data[o * 4 + 1] = fill[1]; data[o * 4 + 2] = fill[2]; data[o * 4 + 3] = fur ? 0 : 255; }
        const picture = { width: size, height: size, data, name: (options && options.name) || 'skin.png' };
        if (relief) {
            const pixels = new Uint8Array(size * size * 4), texel = (scaleRelief?1.8:s.genitalDetail.female ? 0.16 : 0.12) / size;
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const o = y * size + x, center = relief[o];
                const sample = (x, y) => { const i = y * size + x; return filled[i] ? relief[i] : center; };
                const dx = (sample(Math.min(size - 1, x + 1), y) - sample(Math.max(0, x - 1), y)) / (2 * texel);
                const dy = (sample(x, Math.min(size - 1, y + 1)) - sample(x, Math.max(0, y - 1))) / (2 * texel);
                const length = Math.hypot(dx, dy, 1), at = o * 4;
                pixels[at] = Math.round((0.5 - dx / length * 0.5) * 255);
                pixels[at + 1] = Math.round((0.5 + dy / length * 0.5) * 255);
                pixels[at + 2] = Math.round((0.5 + 0.5 / length) * 255); pixels[at + 3] = 255;
            }
            picture.normal = { width: size, height: size, data: pixels, name: scaleRelief?'skin-scales-normal.png':'genital_n.png' };
        }
        return picture;
    }

    // ── eyes ──────────────────────────────────────────────────────────────
    const PUPILS = [['round', 'Round'], ['slit', 'Slit'], ['goat', 'Bar'], ['none', 'None']];
    // No painted catchlight by default: the eye's wet surface reflects the scene's own lights.
    const DEFAULT_EYES = Object.freeze({ color: '#6a4a2a', pupil: 'round', sclera: '', size: 1.25, pupilSize: 1, catchlight: false });
    // The picture holds two eyeballs; each iris is centered here, about 0.11 of the picture across.
    const IRIS = [[0.708, 0.259], [0.292, 0.671]], IRIS_R = 0.108, PUPIL_R = 0.042;

    function normalizeEyes(input) {
        const e = Object.assign({}, DEFAULT_EYES, input || {});
        if (!/^#[0-9a-f]{6}$/i.test(e.color || '')) e.color = DEFAULT_EYES.color;
        if (e.sclera && !/^#[0-9a-f]{6}$/i.test(e.sclera)) e.sclera = '';
        if (!PUPILS.some(p => p[0] === e.pupil)) e.pupil = 'round';
        e.size = Math.max(0.5, Math.min(1.6, +e.size || 1));
        e.pupilSize = Math.max(0.3, Math.min(2.4, +e.pupilSize || 1));
        e.catchlight = !!e.catchlight;
        return e;
    }

    /**
     * The eye picture recolored: `src` RGBA bytes of MakeHuman's brown eye
     * (any square size). The iris takes the new color by the picture's own
     * lightness, the pupil is redrawn, the white of the eye may be tinted.
     */
    function paintEyes(src, size, settings) {
        const e = normalizeEyes(settings);
        const out = Uint8Array.from(src);
        const iris = Outfit.linear(e.color), sclera = e.sclera ? Outfit.linear(e.sclera) : null;
        const irisR = IRIS_R * e.size;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const o = (y * size + x) * 4;
            if (src[o + 3] < 128) continue;
            const u = (x + 0.5) / size, v = (y + 0.5) / size;
            let best = 9, du = 0, dv = 0;
            for (const [cu, cv] of IRIS) { const d = Math.hypot(u - cu, v - cv); if (d < best) { best = d; du = u - cu; dv = v - cv; } }
            const lum = (srgb(src[o] / 255) * 0.3 + srgb(src[o + 1] / 255) * 0.5 + srgb(src[o + 2] / 255) * 0.2);
            let rgb = null;
            if (best < irisR * 1.08) {
                // Iris: its fibers from the picture's lightness, on the new color, with radial fibers of its own,
                // a lighter ring round the pupil (the collarette) and a soft dark limbal ring at its edge.
                const r = best / irisR, ang = Math.atan2(dv, du);
                const detail = Math.min(1.6, 0.35 + lum * 9);
                const fibers = 0.82 + 0.18 * Math.sin(ang * 70 + Math.sin(ang * 13) * 2.5) * (0.6 + 0.4 * Math.sin(ang * 23 + r * 9)) + 0.08 * Math.sin(ang * 150);
                const collar = 1 + 0.22 * Math.exp(-(((r - 0.5) / 0.09) ** 2));
                const limbal = 1 - 0.55 * smooth(0.74, 0.97, r);
                rgb = iris.map(c => c * detail * fibers * collar * limbal);
                // The pupil.
                const pr = Math.min(irisR * 0.95, PUPIL_R * e.size * e.pupilSize);
                let inPupil = false;
                if (e.pupil === 'round') inPupil = best < pr;
                else if (e.pupil === 'slit') inPupil = Math.abs(du) < pr * 0.28 * Math.sqrt(Math.max(0, 1 - (dv / (irisR * 0.95)) ** 2));
                else if (e.pupil === 'goat') inPupil = Math.abs(dv) < pr * 0.35 && Math.abs(du) < irisR * 0.75;
                if (inPupil) rgb = [0.005, 0.005, 0.005];
                // Catchlights: a bright spot high on the iris and a small one low on the other side, as drawn eyes have.
                if (e.catchlight) {
                    const a = Math.hypot(du + irisR * 0.32, dv + irisR * 0.34), b = Math.hypot(du - irisR * 0.36, dv - irisR * 0.3);
                    if (a < irisR * 0.26) rgb = [1, 1, 1];
                    else if (b < irisR * 0.12) rgb = [0.9, 0.9, 0.92];
                }
                if (r > 1) rgb = mix(rgb, sclera || [srgb(src[o] / 255), srgb(src[o + 1] / 255), srgb(src[o + 2] / 255)], (r - 1) / 0.08);
            } else if (sclera) {
                rgb = sclera.map(c => c * Math.min(1.2, 0.4 + lum * 1.2));
            } else {
                // The picture's whites are a dim beige: lifted to a living white, its veins kept.
                const src3 = [srgb(src[o] / 255), srgb(src[o + 1] / 255), srgb(src[o + 2] / 255)];
                rgb = src3.map((c, i) => Math.min(1, c * [1.72, 1.72, 1.7][i]));
            }
            if (!rgb) continue;
            out[o] = toByte(rgb[0]); out[o + 1] = toByte(rgb[1]); out[o + 2] = toByte(rgb[2]);
        }
        return out;
    }

    const api = { ageStep, wrinkles, fieldsOf: fields, HAIR_REGIONS, HAIR_PRESETS, BODY_HAIR_PATTERNS, DEFAULT_BODY_HAIR, normalizeBodyHair, hairDensity, hairField, hairCover, paintFur, PATTERNS, LOOKS, PUPILS, DEFAULT_SKIN, DEFAULT_EYES, normalizeSkin, normalizeEyes, paint, paintEyes, shadeSkin, genitalProfile, regionOf };
    root.RRCharacterSkin = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
